import { getRecentSessions } from "./modeStorage.js";
import { getCurrentSpeedTest } from "./speedTest.js";
import { loadSpeedTestTimeline } from "./speedTestTimeline.js";
import {
  finalizeCurrentSpeedTestWordProfile,
  loadSpeedTestWordProfile,
} from "./speedTestWordProfileV4.js";

const V5_STYLE_HREF = "styles/screens/typing-performance-v5.css?v=20260911a";
const MAX_HISTORY_RUNS = 10;
const MAX_PERSISTENT_WORDS = 6;
const MAX_CONFUSIONS = 6;
const MINI_WIDTH = 320;
const MINI_HEIGHT = 84;
const MINI_PAD = Object.freeze({ left: 10, right: 10, top: 10, bottom: 14 });

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};
const mean = (values = []) => values.length
  ? values.reduce((sum, value) => sum + finite(value), 0) / values.length
  : 0;

function standardDeviation(values = []) {
  if (values.length <= 1) return 0;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + ((finite(value) - average) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sameTest(session, result) {
  if (!session || session.modeId !== "speed-test") return false;
  if (session.modeData?.configId !== result?.modeData?.configId) return false;
  const currentWordSet = result?.modeData?.wordSetId;
  const sessionWordSet = session.modeData?.wordSetId;
  return !currentWordSet || !sessionWordSet || currentWordSet === sessionWordSet;
}

function summarizeProfile(profile = {}) {
  const words = Array.isArray(profile?.words) ? profile.words.filter(Boolean) : [];
  if (!words.length) {
    return Object.freeze({
      wordCount: 0,
      cleanWords: 0,
      cleanPercent: 0,
      corrections: 0,
      correctionsPerWord: 0,
    });
  }
  const cleanWords = words.filter((word) => word.clean === true).length;
  const corrections = words.reduce((sum, word) => (
    sum + Math.max(0, finite(word?.backspaces)) + Math.max(0, finite(word?.wordDeletes))
  ), 0);
  return Object.freeze({
    wordCount: words.length,
    cleanWords,
    cleanPercent: round((cleanWords / words.length) * 100),
    corrections: Math.round(corrections),
    correctionsPerWord: round(corrections / words.length, 2),
  });
}

function sampleFromSession(session, profile, timeline) {
  if (!session?.sessionId || !profile?.words?.length) return null;
  const summary = summarizeProfile(profile);
  return Object.freeze({
    sessionId: session.sessionId,
    endedAt: finite(session.endedAt),
    wpm: Math.max(0, finite(session.wpm)),
    accuracy: clamp(finite(session.accuracy), 0, 100),
    rawWpm: Math.max(0, finite(session.modeData?.rawWpm)),
    profile,
    timeline: timeline || null,
    ...summary,
  });
}

export function collectPerformanceV5Samples({
  recentSessions = getRecentSessions(),
  result = getCurrentSpeedTest()?.result,
  currentProfile = finalizeCurrentSpeedTestWordProfile(getCurrentSpeedTest()),
  currentTimeline = result?.modeData?.performanceTimeline,
  limit = MAX_HISTORY_RUNS,
} = {}) {
  if (!result?.sessionId || !currentProfile?.words?.length) return [];
  const samples = [];
  const current = sampleFromSession({
    sessionId: result.sessionId,
    endedAt: result.endedAt,
    wpm: result.wpm,
    accuracy: result.accuracy,
    modeData: result.modeData,
  }, currentProfile, currentTimeline);
  if (current) samples.push(current);

  for (const session of recentSessions) {
    if (!sameTest(session, result) || session.sessionId === result.sessionId) continue;
    const profile = loadSpeedTestWordProfile(session.sessionId);
    if (!profile?.words?.length) continue;
    const timeline = loadSpeedTestTimeline(session.sessionId);
    const sample = sampleFromSession(session, profile, timeline);
    if (sample) samples.push(sample);
  }

  return samples
    .sort((a, b) => finite(a.endedAt) - finite(b.endedAt))
    .slice(-Math.max(1, Math.round(finite(limit, MAX_HISTORY_RUNS))));
}

function aggregatePersistentWords(samples = []) {
  const groups = new Map();
  for (const sample of samples) {
    const seenThisRun = new Set();
    const sampleWpm = Math.max(1, finite(sample?.wpm, 1));
    for (const word of sample?.profile?.words || []) {
      const key = String(word?.expected || "").trim().toLowerCase();
      if (!key) continue;
      const group = groups.get(key) || {
        word: word.expected,
        occurrences: 0,
        runCount: 0,
        durationMs: 0,
        effectiveChars: 0,
        errors: 0,
        corrections: 0,
        clean: 0,
        paceRatioTotal: 0,
      };
      group.occurrences += 1;
      if (!seenThisRun.has(key)) {
        group.runCount += 1;
        seenThisRun.add(key);
      }
      group.durationMs += Math.max(0, finite(word.durationMs));
      group.effectiveChars += Math.max(0, finite(word.effectiveChars));
      group.errors += Math.max(0, finite(word.errors));
      group.corrections += Math.max(0, finite(word.backspaces)) + Math.max(0, finite(word.wordDeletes));
      if (word.clean === true) group.clean += 1;
      group.paceRatioTotal += Math.max(0, finite(word.wpm)) / sampleWpm;
      groups.set(key, group);
    }
  }

  return [...groups.values()].map((group) => {
    const cleanRate = group.occurrences ? group.clean / group.occurrences : 0;
    const averagePaceRatio = group.occurrences ? group.paceRatioTotal / group.occurrences : 1;
    const errorsPerOccurrence = group.occurrences ? group.errors / group.occurrences : 0;
    const correctionsPerOccurrence = group.occurrences ? group.corrections / group.occurrences : 0;
    const averageWpm = group.durationMs > 0
      ? (group.effectiveChars / 5) / (group.durationMs / 60000)
      : 0;
    const recurrence = Math.min(1, group.runCount / 3);
    const difficultyScore = (
      errorsPerOccurrence * 5
      + correctionsPerOccurrence * 1.7
      + Math.max(0, 1 - averagePaceRatio) * 4
      + (1 - cleanRate) * 2.5
      + recurrence
    );
    return Object.freeze({
      ...group,
      averageWpm: round(averageWpm),
      cleanPercent: round(cleanRate * 100),
      averagePaceRatio: round(averagePaceRatio, 2),
      errorsPerOccurrence: round(errorsPerOccurrence, 2),
      correctionsPerOccurrence: round(correctionsPerOccurrence, 2),
      difficultyScore: round(difficultyScore, 2),
    });
  }).sort((a, b) => (
    b.difficultyScore - a.difficultyScore
    || b.runCount - a.runCount
    || b.errors - a.errors
    || a.averageWpm - b.averageWpm
  ));
}

function aggregateConfusions(samples = []) {
  const groups = new Map();
  for (const sample of samples) {
    const seenThisRun = new Set();
    for (const mistake of sample?.timeline?.mistakes || []) {
      const type = ["incorrect", "extra", "missed"].includes(mistake?.type)
        ? mistake.type
        : "incorrect";
      let expected = String(mistake?.expected || "");
      let typed = String(mistake?.typed || "");
      if (type === "extra" && !expected) expected = "∅";
      if (type === "missed" && !typed) typed = "∅";
      expected ||= "∅";
      typed ||= "∅";
      const key = `${type}:${expected}→${typed}`;
      const group = groups.get(key) || {
        type,
        expected,
        typed,
        count: 0,
        runCount: 0,
      };
      const count = Math.max(1, Math.round(finite(mistake?.count, 1)));
      group.count += count;
      if (!seenThisRun.has(key)) {
        group.runCount += 1;
        seenThisRun.add(key);
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.runCount - a.runCount || b.count - a.count || a.expected.localeCompare(b.expected))
    .slice(0, MAX_CONFUSIONS)
    .map((group) => Object.freeze({ ...group }));
}

function miniSeriesPath(values = [], { min = null, max = null } = {}) {
  if (!values.length) return "";
  const width = MINI_WIDTH - MINI_PAD.left - MINI_PAD.right;
  const height = MINI_HEIGHT - MINI_PAD.top - MINI_PAD.bottom;
  const low = min == null ? Math.min(...values) : min;
  const high = max == null ? Math.max(...values) : max;
  const span = Math.max(1, high - low);
  return values.map((value, index) => {
    const x = values.length === 1
      ? MINI_PAD.left + width / 2
      : MINI_PAD.left + (index / (values.length - 1)) * width;
    const y = MINI_PAD.top + (1 - ((finite(value) - low) / span)) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

export function buildPerformanceV5Analysis(samples = [], result = {}) {
  const usable = samples.filter((sample) => sample?.profile?.words?.length);
  if (!usable.length) return null;
  const runs = usable
    .slice()
    .sort((a, b) => finite(a.endedAt) - finite(b.endedAt))
    .slice(-MAX_HISTORY_RUNS);
  const current = runs.find((sample) => sample.sessionId === result?.sessionId) || runs.at(-1);
  const priorRuns = runs.filter((sample) => sample.sessionId !== current?.sessionId);
  const wpmValues = runs.map((sample) => Math.max(0, finite(sample.wpm)));
  const cleanValues = runs.map((sample) => clamp(finite(sample.cleanPercent), 0, 100));
  const correctionValues = runs.map((sample) => Math.max(0, finite(sample.correctionsPerWord)));
  const persistentWords = aggregatePersistentWords(runs);
  const recurring = persistentWords.filter((item) => item.runCount >= 2 || item.occurrences >= 2);
  const displayedProblems = (recurring.length ? recurring : persistentWords).slice(0, MAX_PERSISTENT_WORDS);
  const confusions = aggregateConfusions(runs);
  const currentClean = finite(current?.cleanPercent);
  const currentCorrections = finite(current?.correctionsPerWord);
  const priorCleanAverage = priorRuns.length ? mean(priorRuns.map((sample) => sample.cleanPercent)) : null;
  const priorCorrectionAverage = priorRuns.length
    ? mean(priorRuns.map((sample) => sample.correctionsPerWord))
    : null;
  const cleanDeltaVsBaseline = priorCleanAverage == null ? null : round(currentClean - priorCleanAverage);
  const correctionDeltaVsBaseline = priorCorrectionAverage == null
    ? null
    : round(currentCorrections - priorCorrectionAverage, 2);
  const focusWords = displayedProblems
    .filter((item) => item.word)
    .slice(0, 6)
    .map((item) => item.word);
  const focusText = focusWords.join(" ");
  const notes = [];

  if (runs.length < 3) {
    notes.push(`Baseline building: ${runs.length}/${3} same-test runs captured with word-level data.`);
  } else {
    notes.push(`Baseline established from ${runs.length} recent runs of this exact test configuration.`);
  }
  if (displayedProblems[0]) {
    const top = displayedProblems[0];
    notes.push(`“${top.word}” is the strongest recurring friction signal (${top.runCount} ${top.runCount === 1 ? "run" : "runs"}, ${top.cleanPercent.toFixed(0)}% clean).`);
  }
  if (cleanDeltaVsBaseline != null && Math.abs(cleanDeltaVsBaseline) >= 3) {
    notes.push(`Current clean-word rate is ${Math.abs(cleanDeltaVsBaseline).toFixed(1)} points ${cleanDeltaVsBaseline > 0 ? "above" : "below"} your prior baseline.`);
  } else if (correctionDeltaVsBaseline != null && Math.abs(correctionDeltaVsBaseline) >= 0.1) {
    notes.push(`Corrections are ${Math.abs(correctionDeltaVsBaseline).toFixed(2)} per word ${correctionDeltaVsBaseline < 0 ? "lower" : "higher"} than your prior baseline.`);
  } else if (confusions[0]) {
    notes.push(`Most persistent confusion: ${confusions[0].expected}→${confusions[0].typed} (${confusions[0].count}× across ${confusions[0].runCount} ${confusions[0].runCount === 1 ? "run" : "runs"}).`);
  }

  return Object.freeze({
    version: 5,
    runCount: runs.length,
    baselineEstablished: runs.length >= 3,
    currentSessionId: current?.sessionId || null,
    recentAverageWpm: round(mean(wpmValues)),
    recentBestWpm: round(Math.max(...wpmValues)),
    wpmStandardDeviation: round(standardDeviation(wpmValues)),
    wpmRange: round(Math.max(...wpmValues) - Math.min(...wpmValues)),
    averageCleanPercent: round(mean(cleanValues)),
    currentCleanPercent: round(currentClean),
    cleanDeltaVsBaseline,
    averageCorrectionsPerWord: round(mean(correctionValues), 2),
    currentCorrectionsPerWord: round(currentCorrections, 2),
    correctionDeltaVsBaseline,
    wpmSeries: Object.freeze(wpmValues.map((value) => round(value))),
    cleanSeries: Object.freeze(cleanValues.map((value) => round(value))),
    persistentWords: Object.freeze(displayedProblems),
    recurringConfusions: Object.freeze(confusions),
    focusWords: Object.freeze(focusWords),
    focusText,
    insight: notes.slice(0, 3).join(" "),
  });
}

function ensureV5Styles() {
  if (typeof document === "undefined") return null;
  const existing = document.querySelector('link[data-speed-performance-v5-style]');
  if (existing) return existing;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = V5_STYLE_HREF;
  link.dataset.speedPerformanceV5Style = "";
  document.head.append(link);
  return link;
}

function signed(value, suffix = "") {
  if (value == null) return "—";
  const number = round(value, suffix === " / word" ? 2 : 1);
  if (Math.abs(number) < 0.005) return `0${suffix}`;
  return `${number > 0 ? "+" : ""}${number}${suffix}`;
}

function trendChartMarkup(analysis) {
  const wpmLow = Math.max(0, Math.floor((Math.min(...analysis.wpmSeries) - 5) / 10) * 10);
  const wpmHigh = Math.max(wpmLow + 10, Math.ceil((Math.max(...analysis.wpmSeries) + 5) / 10) * 10);
  const wpmPath = miniSeriesPath(analysis.wpmSeries, { min: wpmLow, max: wpmHigh });
  const cleanPath = miniSeriesPath(analysis.cleanSeries, { min: 0, max: 100 });
  return `<div class="speed-performance-v5-trends">
    <div class="speed-performance-v5-trend-card">
      <div class="speed-performance-v5-card-head"><div><span>WPM history</span><strong>${analysis.recentAverageWpm.toFixed(1)} avg</strong></div><small>${analysis.runCount} runs</small></div>
      <svg viewBox="0 0 ${MINI_WIDTH} ${MINI_HEIGHT}" role="img" aria-label="Recent WPM history">
        <path class="is-wpm" d="${wpmPath}"></path>
      </svg>
      <div class="speed-performance-v5-trend-meta"><span>Best <b>${analysis.recentBestWpm.toFixed(1)}</b></span><span>σ <b>${analysis.wpmStandardDeviation.toFixed(1)}</b></span></div>
    </div>
    <div class="speed-performance-v5-trend-card">
      <div class="speed-performance-v5-card-head"><div><span>Clean-word history</span><strong>${analysis.currentCleanPercent.toFixed(0)}%</strong></div><small>${signed(analysis.cleanDeltaVsBaseline, " pp")} vs baseline</small></div>
      <svg viewBox="0 0 ${MINI_WIDTH} ${MINI_HEIGHT}" role="img" aria-label="Recent clean-word percentage history">
        <path class="is-clean" d="${cleanPath}"></path>
      </svg>
      <div class="speed-performance-v5-trend-meta"><span>Average <b>${analysis.averageCleanPercent.toFixed(0)}%</b></span><span>Now <b>${analysis.currentCleanPercent.toFixed(0)}%</b></span></div>
    </div>
  </div>`;
}

function persistentWordsMarkup(items = []) {
  if (!items.length) return `<p class="speed-performance-v5-empty">No word-level friction signals are available yet.</p>`;
  return `<div class="speed-performance-v5-list">${items.map((item) => {
    const paceDelta = round((item.averagePaceRatio - 1) * 100);
    return `<div>
      <strong>${escapeHtml(item.word)}</strong>
      <span>${item.runCount} ${item.runCount === 1 ? "run" : "runs"}</span>
      <small>${item.cleanPercent.toFixed(0)}% clean · ${signed(paceDelta, "% pace")} · ${item.errors} errors · ${item.corrections} corrections</small>
    </div>`;
  }).join("")}</div>`;
}

function confusionsMarkup(items = []) {
  if (!items.length) return `<p class="speed-performance-v5-empty">No recurring character confusion has been captured yet.</p>`;
  return `<div class="speed-performance-v5-confusions">${items.map((item) => (
    `<span><code>${escapeHtml(item.expected)}</code><i>→</i><code>${escapeHtml(item.typed)}</code><b>${item.count}×</b><small>${item.runCount} ${item.runCount === 1 ? "run" : "runs"}</small></span>`
  )).join("")}</div>`;
}

function focusMarkup(analysis) {
  if (!analysis.focusWords.length) return `<p class="speed-performance-v5-empty">Complete more words to generate a focus set.</p>`;
  return `<div class="speed-performance-v5-focus">
    <div><span>Suggested focus set</span><strong>${analysis.focusWords.map(escapeHtml).join(" · ")}</strong></div>
    <button type="button" data-v5-copy-focus data-focus-text="${escapeHtml(analysis.focusText)}">Copy focus words</button>
    <small data-v5-copy-status aria-live="polite">Use this set in any custom typing drill.</small>
  </div>`;
}

function v5Markup(analysis) {
  const cleanClass = analysis.cleanDeltaVsBaseline == null
    ? ""
    : analysis.cleanDeltaVsBaseline >= 0 ? "is-positive" : "is-negative";
  const correctionClass = analysis.correctionDeltaVsBaseline == null
    ? ""
    : analysis.correctionDeltaVsBaseline <= 0 ? "is-positive" : "is-negative";
  return `<section class="speed-performance-v5" data-speed-performance-v5 data-performance-version="5">
    <header class="speed-performance-v5-heading">
      <div><p>Long-term intelligence</p><h4>Baseline &amp; recurring weaknesses</h4></div>
      <span>V5</span>
    </header>
    <div class="speed-performance-v5-metrics">
      <div><span>Same-test history</span><strong>${analysis.runCount}</strong><small>${analysis.baselineEstablished ? "baseline established" : `${Math.max(0, 3 - analysis.runCount)} more to establish baseline`}</small></div>
      <div><span>Recent average</span><strong>${analysis.recentAverageWpm.toFixed(1)}</strong><small>WPM across captured runs</small></div>
      <div><span>Clean vs baseline</span><strong class="${cleanClass}">${signed(analysis.cleanDeltaVsBaseline, " pp")}</strong><small>${analysis.currentCleanPercent.toFixed(0)}% clean this run</small></div>
      <div><span>Corrections vs baseline</span><strong class="${correctionClass}">${signed(analysis.correctionDeltaVsBaseline, " / word")}</strong><small>${analysis.currentCorrectionsPerWord.toFixed(2)} per word this run</small></div>
    </div>
    ${trendChartMarkup(analysis)}
    <div class="speed-performance-v5-grid">
      <div class="speed-performance-v5-card">
        <div class="speed-performance-v5-card-head"><div><span>Persistent friction</span><strong>Words that keep costing pace</strong></div><small>normalized across runs</small></div>
        ${persistentWordsMarkup(analysis.persistentWords)}
      </div>
      <div class="speed-performance-v5-card">
        <div class="speed-performance-v5-card-head"><div><span>Recurring confusions</span><strong>Repeated character misses</strong></div><small>across stored timelines</small></div>
        ${confusionsMarkup(analysis.recurringConfusions)}
      </div>
    </div>
    ${focusMarkup(analysis)}
    <p class="speed-performance-v5-insight">${escapeHtml(analysis.insight)}</p>
    <details class="speed-performance-v5-method">
      <summary>How the V5 baseline works</summary>
      <p>Only recent local runs of this exact Typing Test configuration are compared. Word pace is normalized against each run before recurring friction is ranked, so a globally faster or slower session does not automatically make every word look better or worse.</p>
    </details>
  </section>`;
}

async function copyText(text) {
  if (!text) return false;
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to a temporary textarea below.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand?.("copy") === true;
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

function bindV5Interactions(section) {
  const button = section.querySelector("[data-v5-copy-focus]");
  const status = section.querySelector("[data-v5-copy-status]");
  if (!button) return;
  button.addEventListener("click", async () => {
    const text = button.dataset.focusText || "";
    const copied = await copyText(text);
    if (status) status.textContent = copied
      ? "Focus words copied."
      : "Copy unavailable in this browser; select the words above manually.";
  });
}

export function syncSpeedTestPerformanceV5() {
  const base = document.querySelector("#app .speed-results-screen [data-speed-performance]");
  if (!base || base.dataset.performanceV5 === "true") return;
  const v4 = document.querySelector("#app .speed-results-screen [data-speed-performance-v4]");
  if (!v4) return;
  const state = getCurrentSpeedTest();
  const result = state?.result;
  if (!result?.sessionId) return;
  const currentProfile = finalizeCurrentSpeedTestWordProfile(state);
  if (!currentProfile?.words?.length) return;
  const samples = collectPerformanceV5Samples({
    recentSessions: getRecentSessions(),
    result,
    currentProfile,
    currentTimeline: result.modeData?.performanceTimeline,
  });
  const analysis = buildPerformanceV5Analysis(samples, result);
  if (!analysis) return;
  ensureV5Styles();
  const template = document.createElement("template");
  template.innerHTML = v5Markup(analysis).trim();
  const section = template.content.firstElementChild;
  if (!section) return;
  v4.insertAdjacentElement("afterend", section);
  bindV5Interactions(section);
  base.dataset.performanceV5 = "true";
}

