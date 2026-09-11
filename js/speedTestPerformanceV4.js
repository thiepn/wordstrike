import { getCurrentSpeedTest } from "./speedTest.js";
import {
  finalizeCurrentSpeedTestWordProfile,
  installSpeedTestWordProfiler,
} from "./speedTestWordProfileV4.js";

const V4_STYLE_HREF = "styles/screens/typing-performance-v4.css?v=20260911a";
const MAX_WORD_MARKERS = 160;
const MAX_MISTAKE_ROWS = 10;

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};

function median(values = []) {
  if (!values.length) return null;
  const sorted = values.map((value) => finite(value)).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function weightedWpm(words = []) {
  const durationMs = words.reduce((sum, word) => sum + Math.max(0, finite(word?.durationMs)), 0);
  const characters = words.reduce((sum, word) => sum + Math.max(0, finite(word?.effectiveChars)), 0);
  if (!durationMs) return 0;
  return round((characters / 5) / (durationMs / 60000));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function paceBand(wpm, averageWpm) {
  const average = Math.max(0.1, finite(averageWpm, 0.1));
  const ratio = finite(wpm) / average;
  if (ratio >= 1.2) return "surge";
  if (ratio >= 0.9) return "flow";
  if (ratio >= 0.7) return "recovery";
  return "drop";
}

function longestCleanStreak(words = []) {
  let current = 0;
  let best = 0;
  for (const word of words) {
    if (word.clean) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function aggregateProblemWords(words, averageWpm) {
  const groups = new Map();
  for (const word of words) {
    const key = String(word.expected || "").toLowerCase();
    if (!key) continue;
    const group = groups.get(key) || {
      word: word.expected,
      occurrences: 0,
      durationMs: 0,
      effectiveChars: 0,
      errors: 0,
      backspaces: 0,
      wordDeletes: 0,
      clean: 0,
      worstWpm: Infinity,
    };
    group.occurrences += 1;
    group.durationMs += Math.max(0, finite(word.durationMs));
    group.effectiveChars += Math.max(0, finite(word.effectiveChars));
    group.errors += Math.max(0, finite(word.errors));
    group.backspaces += Math.max(0, finite(word.backspaces));
    group.wordDeletes += Math.max(0, finite(word.wordDeletes));
    if (word.clean) group.clean += 1;
    group.worstWpm = Math.min(group.worstWpm, finite(word.wpm));
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const wpm = group.durationMs > 0
      ? (group.effectiveChars / 5) / (group.durationMs / 60000)
      : 0;
    const cleanRate = group.occurrences ? group.clean / group.occurrences : 0;
    const pacePenalty = Math.max(0, (averageWpm - wpm) / Math.max(1, averageWpm));
    return Object.freeze({
      ...group,
      wpm: round(wpm),
      cleanPercent: round(cleanRate * 100),
      difficultyScore: round(
        group.errors * 5
        + group.backspaces * 1.5
        + group.wordDeletes * 2
        + pacePenalty * 4
        + (1 - cleanRate) * 2,
        2,
      ),
    });
  }).sort((a, b) => (
    b.difficultyScore - a.difficultyScore
    || b.errors - a.errors
    || a.wpm - b.wpm
  ));
}

function mistakeFingerprint(timeline) {
  const mistakes = Array.isArray(timeline?.mistakes) ? timeline.mistakes : [];
  const breakdown = { incorrect: 0, extra: 0, missed: 0 };
  const pairs = new Map();
  for (const mistake of mistakes) {
    const type = ["incorrect", "extra", "missed"].includes(mistake?.type)
      ? mistake.type
      : "incorrect";
    const count = Math.max(1, Math.round(finite(mistake?.count, 1)));
    breakdown[type] += count;
    let expected = String(mistake?.expected || "");
    let typed = String(mistake?.typed || "");
    if (type === "extra" && !expected) expected = "∅";
    if (type === "missed" && !typed) typed = "∅";
    const key = `${expected || "∅"}→${typed || "∅"}`;
    const current = pairs.get(key) || { expected: expected || "∅", typed: typed || "∅", count: 0 };
    current.count += count;
    pairs.set(key, current);
  }
  const confusions = [...pairs.values()]
    .sort((a, b) => b.count - a.count || a.expected.localeCompare(b.expected))
    .slice(0, 6)
    .map((item) => Object.freeze(item));
  return Object.freeze({
    breakdown: Object.freeze(breakdown),
    confusions: Object.freeze(confusions),
    events: Object.freeze(mistakes.slice(0, MAX_MISTAKE_ROWS).map((mistake) => Object.freeze({ ...mistake }))),
    total: breakdown.incorrect + breakdown.extra + breakdown.missed,
  });
}

function hardestOccurrence(words, averageWpm) {
  if (!words.length) return null;
  return words.reduce((worst, word) => {
    const burden = finite(word.errors) * 5
      + finite(word.backspaces) * 1.5
      + finite(word.wordDeletes) * 2
      + Math.max(0, (averageWpm - finite(word.wpm)) / Math.max(1, averageWpm)) * 4;
    if (!worst || burden > worst.burden) return { word, burden };
    return worst;
  }, null)?.word || words[0];
}

export function buildPerformanceV4Analysis(profile, timeline, result = {}) {
  const words = Array.isArray(profile?.words) ? profile.words.filter(Boolean) : [];
  if (!words.length) return null;
  const averageWpm = Math.max(0.1, finite(result?.wpm, weightedWpm(words)) || weightedWpm(words) || 0.1);
  const reliableWordWpms = words
    .filter((word) => finite(word.durationMs) >= 100 && finite(word.effectiveChars) >= 2)
    .map((word) => finite(word.wpm));
  const cleanWords = words.filter((word) => word.clean).length;
  const totalBackspaces = words.reduce((sum, word) => sum + Math.max(0, finite(word.backspaces)), 0);
  const totalDeletes = words.reduce((sum, word) => sum + Math.max(0, finite(word.wordDeletes)), 0);
  const problems = aggregateProblemWords(words, averageWpm);
  const fingerprint = mistakeFingerprint(timeline);
  const selected = hardestOccurrence(words, averageWpm);
  const cleanPercent = round((cleanWords / words.length) * 100);
  const bands = words.map((word) => paceBand(word.wpm, averageWpm));
  const bandCounts = bands.reduce((counts, band) => {
    counts[band] += 1;
    return counts;
  }, { surge: 0, flow: 0, recovery: 0, drop: 0 });
  const notes = [];
  if (cleanPercent >= 90) notes.push(`${cleanPercent.toFixed(0)}% of completed words were clean on the first pass.`);
  else if (cleanPercent < 70) notes.push(`Only ${cleanPercent.toFixed(0)}% of completed words were clean; corrections are a major pace cost.`);
  else notes.push(`${cleanPercent.toFixed(0)}% of completed words were clean.`);
  if (problems[0] && problems[0].difficultyScore > 1) {
    notes.push(`“${problems[0].word}” created the highest combined pace/error burden.`);
  }
  if (fingerprint.total > 0) {
    const dominant = Object.entries(fingerprint.breakdown).sort((a, b) => b[1] - a[1])[0];
    notes.push(`${dominant[0][0].toUpperCase()}${dominant[0].slice(1)} errors were the largest mistake category.`);
  }

  return Object.freeze({
    version: 4,
    averageWpm: round(averageWpm),
    words: Object.freeze(words.map((word, index) => Object.freeze({
      ...word,
      paceBand: bands[index],
      paceRatio: round(finite(word.wpm) / averageWpm, 2),
    }))),
    wordCount: words.length,
    cleanWords,
    cleanPercent,
    longestCleanStreak: longestCleanStreak(words),
    medianWordWpm: reliableWordWpms.length ? round(median(reliableWordWpms)) : null,
    correctionsPerWord: round((totalBackspaces + totalDeletes) / words.length, 2),
    totalBackspaces,
    totalDeletes,
    paceBands: Object.freeze(bandCounts),
    problems: Object.freeze(problems.slice(0, 6)),
    fingerprint,
    defaultWordIndex: Math.max(0, words.indexOf(selected)),
    insight: notes.slice(0, 3).join(" "),
  });
}

function ensureV4Styles() {
  if (typeof document === "undefined") return null;
  const existing = document.querySelector('link[data-speed-performance-v4-style]');
  if (existing) return existing;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = V4_STYLE_HREF;
  link.dataset.speedPerformanceV4Style = "";
  document.head.append(link);
  return link;
}

function inspectorMarkup(word) {
  if (!word) return `<p class="speed-performance-v4-empty">Select a word to inspect it.</p>`;
  const typedDiffers = word.typed !== word.expected;
  return `<div class="speed-performance-v4-inspector-inner">
    <div class="speed-performance-v4-inspector-title">
      <div><span>Word ${word.index}</span><strong>${escapeHtml(word.expected)}</strong></div>
      <b class="is-${word.paceBand}">${escapeHtml(word.paceBand)}</b>
    </div>
    <div class="speed-performance-v4-inspector-metrics">
      <span>WPM <b>${finite(word.wpm).toFixed(1)}</b></span>
      <span>Raw <b>${finite(word.rawWpm).toFixed(1)}</b></span>
      <span>Accuracy <b>${finite(word.accuracy).toFixed(1)}%</b></span>
      <span>Time <b>${(finite(word.durationMs) / 1000).toFixed(2)}s</b></span>
      <span>Errors <b>${Math.round(finite(word.errors))}</b></span>
      <span>Corrections <b>${Math.round(finite(word.backspaces) + finite(word.wordDeletes))}</b></span>
    </div>
    ${typedDiffers ? `<p class="speed-performance-v4-typed">Typed <code>${escapeHtml(word.typed || "∅")}</code> · expected <code>${escapeHtml(word.expected)}</code></p>` : ""}
  </div>`;
}

function wordMapMarkup(analysis) {
  const visible = analysis.words.slice(0, MAX_WORD_MARKERS);
  const selectedIndex = Math.min(visible.length - 1, analysis.defaultWordIndex);
  const markers = visible.map((word, index) => {
    const relative = clamp(finite(word.paceRatio), 0.25, 1.6);
    const height = clamp(22 + relative * 46, 24, 96);
    const errorClass = word.errors > 0 || word.backspaces > 0 || word.wordDeletes > 0 ? " has-friction" : "";
    const selected = index === selectedIndex ? " is-selected" : "";
    const label = `Word ${word.index}: ${word.expected}, ${finite(word.wpm).toFixed(1)} WPM, ${word.errors} errors, ${word.backspaces + word.wordDeletes} corrections`;
    return `<button type="button" class="speed-performance-word-marker is-${word.paceBand}${errorClass}${selected}"
      data-v4-word="${index}" style="--v4-word-height:${height.toFixed(1)}%" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><i></i></button>`;
  }).join("");
  const truncated = analysis.words.length > visible.length
    ? `<small class="speed-performance-v4-truncated">Showing first ${visible.length} of ${analysis.words.length} completed words.</small>`
    : "";
  return `<div class="speed-performance-v4-word-card">
    <div class="speed-performance-v4-card-head">
      <div><span>Word pace map</span><strong>${analysis.wordCount} completed words</strong></div>
      <small>select a bar to inspect</small>
    </div>
    <div class="speed-performance-word-map" role="group" aria-label="Word-by-word pace map">${markers}</div>
    <div class="speed-performance-v4-legend">
      <span class="is-surge"><i></i>Surge</span><span class="is-flow"><i></i>Flow</span><span class="is-recovery"><i></i>Recovery</span><span class="is-drop"><i></i>Drop</span><span class="has-friction"><i></i>Error / correction</span>
    </div>
    ${truncated}
    <div class="speed-performance-v4-inspector" data-v4-inspector>${inspectorMarkup(visible[selectedIndex])}</div>
  </div>`;
}

function problemWordsMarkup(problems) {
  if (!problems.length) return `<p class="speed-performance-v4-empty">No recurring problem words in this run.</p>`;
  return `<div class="speed-performance-v4-list">${problems.map((problem) => (
    `<div><strong>${escapeHtml(problem.word)}</strong><span>${problem.wpm.toFixed(1)} WPM</span><small>${problem.errors} errors · ${problem.backspaces + problem.wordDeletes} corrections · ${problem.cleanPercent.toFixed(0)}% clean</small></div>`
  )).join("")}</div>`;
}

function fingerprintMarkup(fingerprint) {
  const confusion = fingerprint.confusions.length
    ? `<div class="speed-performance-v4-confusions">${fingerprint.confusions.map((pair) => (
      `<span><code>${escapeHtml(pair.expected)}</code><i>→</i><code>${escapeHtml(pair.typed)}</code><b>${pair.count}×</b></span>`
    )).join("")}</div>`
    : `<p class="speed-performance-v4-empty">No character confusions recorded.</p>`;
  return `<div class="speed-performance-v4-error-mix">
      <span>Incorrect <b>${fingerprint.breakdown.incorrect}</b></span>
      <span>Extra <b>${fingerprint.breakdown.extra}</b></span>
      <span>Missed <b>${fingerprint.breakdown.missed}</b></span>
    </div>
    ${confusion}`;
}

function mistakeRowsMarkup(fingerprint) {
  if (!fingerprint.events.length) return "";
  const rows = fingerprint.events.map((mistake) => {
    const time = `${(finite(mistake.timeMs) / 1000).toFixed(1)}s`;
    const type = escapeHtml(mistake.type || "incorrect");
    const word = escapeHtml(mistake.word || "—");
    const expected = escapeHtml(mistake.expected || "∅");
    const typed = escapeHtml(mistake.typed || "∅");
    return `<div class="speed-performance-v4-mistake-row"><time>${time}</time><strong>${word}</strong><span>${type}</span><code>${expected} → ${typed}</code></div>`;
  }).join("");
  return `<details class="speed-performance-v4-mistakes">
    <summary>Mistake inspector <span>${fingerprint.total} ${fingerprint.total === 1 ? "error" : "errors"}</span></summary>
    <div>${rows}</div>
  </details>`;
}

function v4Markup(analysis) {
  const medianWord = analysis.medianWordWpm == null ? "—" : analysis.medianWordWpm.toFixed(0);
  const hardest = analysis.problems[0]?.word || "—";
  return `<section class="speed-performance-v4" data-speed-performance-v4 data-performance-version="4">
    <header class="speed-performance-v4-heading">
      <div><p>Deep dive</p><h4>Words &amp; mistake inspector</h4></div>
      <span>V4</span>
    </header>
    <div class="speed-performance-v4-metrics">
      <div><span>Clean words</span><strong>${analysis.cleanPercent.toFixed(0)}%</strong><small>${analysis.cleanWords}/${analysis.wordCount} first-pass clean</small></div>
      <div><span>Clean streak</span><strong>${analysis.longestCleanStreak}</strong><small>consecutive words</small></div>
      <div><span>Median word pace</span><strong>${medianWord}</strong><small>${medianWord === "—" ? "not enough samples" : "WPM"}</small></div>
      <div><span>Hardest word</span><strong>${escapeHtml(hardest)}</strong><small>${analysis.correctionsPerWord.toFixed(2)} corrections / word</small></div>
    </div>
    ${wordMapMarkup(analysis)}
    <div class="speed-performance-v4-grid">
      <div class="speed-performance-v4-card">
        <div class="speed-performance-v4-card-head"><div><span>Problem words</span><strong>Highest friction</strong></div><small>pace + errors + corrections</small></div>
        ${problemWordsMarkup(analysis.problems)}
      </div>
      <div class="speed-performance-v4-card">
        <div class="speed-performance-v4-card-head"><div><span>Error fingerprint</span><strong>${analysis.fingerprint.total} total</strong></div><small>what went wrong</small></div>
        ${fingerprintMarkup(analysis.fingerprint)}
      </div>
    </div>
    ${mistakeRowsMarkup(analysis.fingerprint)}
    <p class="speed-performance-v4-insight">${escapeHtml(analysis.insight)}</p>
  </section>`;
}

function bindWordInspector(section, analysis) {
  const inspector = section.querySelector("[data-v4-inspector]");
  if (!inspector) return;
  const select = (button) => {
    if (!button) return;
    const index = Number(button.dataset.v4Word);
    const word = analysis.words[index];
    if (!word) return;
    section.querySelectorAll("[data-v4-word].is-selected").forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");
    inspector.innerHTML = inspectorMarkup(word);
  };
  section.addEventListener("click", (event) => select(event.target.closest?.("[data-v4-word]")));
  section.addEventListener("focusin", (event) => select(event.target.closest?.("[data-v4-word]")));
  section.addEventListener("pointerover", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    select(event.target.closest?.("[data-v4-word]"));
  });
}

function enhanceV4() {
  const base = document.querySelector("#app .speed-results-screen [data-speed-performance]");
  if (!base || base.dataset.performanceV4 === "true") return;
  const v3 = document.querySelector("#app .speed-results-screen [data-speed-performance-v3]");
  if (!v3) return;
  const state = getCurrentSpeedTest();
  const result = state?.result;
  const timeline = result?.modeData?.performanceTimeline;
  if (!result || !timeline?.points?.length) return;
  const profile = finalizeCurrentSpeedTestWordProfile(state);
  if (!profile?.words?.length) return;
  const analysis = buildPerformanceV4Analysis(profile, timeline, result);
  if (!analysis) return;
  ensureV4Styles();
  const template = document.createElement("template");
  template.innerHTML = v4Markup(analysis).trim();
  const section = template.content.firstElementChild;
  if (!section) return;
  v3.insertAdjacentElement("afterend", section);
  bindWordInspector(section, analysis);
  base.dataset.performanceV4 = "true";
}

function install() {
  installSpeedTestWordProfiler();
  const root = document.querySelector("#app");
  if (!root) return;
  enhanceV4();
  const observer = new MutationObserver(enhanceV4);
  observer.observe(root, { childList: true, subtree: true });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
