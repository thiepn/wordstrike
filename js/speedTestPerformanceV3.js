import {
  getRecentSessions,
  getSpeedTestRecord,
} from "./modeStorage.js";
import { getCurrentSpeedTest } from "./speedTest.js";
import { loadSpeedTestTimeline } from "./speedTestTimeline.js";

const V3_STYLE_HREF = "styles/screens/typing-performance-v3.css?v=20260911a";
const MINI_WIDTH = 320;
const MINI_HEIGHT = 92;
const MINI_PAD = Object.freeze({ left: 12, right: 12, top: 10, bottom: 18 });
const MAX_TREND_RUNS = 10;

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

function median(values = []) {
  if (!values.length) return null;
  const sorted = values.map((value) => finite(value)).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function weightedWpm(points = []) {
  const durationMs = points.reduce((sum, point) => sum + Math.max(0, finite(point?.durationMs)), 0);
  const characters = points.reduce((sum, point) => sum + Math.max(0, finite(point?.netCorrectChars)), 0);
  if (durationMs <= 0) return 0;
  return round((characters / 5) / (durationMs / 60000));
}

function usablePoints(timeline) {
  const points = Array.isArray(timeline?.points) ? timeline.points : [];
  const full = points.filter((point) => finite(point?.durationMs) >= 500);
  return full.length ? full : points;
}

export function buildPaceZoneDistribution(timeline, averageWpm = null) {
  const points = usablePoints(timeline);
  if (!points.length) return null;
  const average = Math.max(0.1, finite(averageWpm, weightedWpm(points)) || weightedWpm(points) || 0.1);
  const zones = {
    surge: { label: "Surge", durationMs: 0, seconds: 0 },
    flow: { label: "Flow", durationMs: 0, seconds: 0 },
    recovery: { label: "Recovery", durationMs: 0, seconds: 0 },
    drop: { label: "Drop", durationMs: 0, seconds: 0 },
  };
  for (const point of points) {
    const ratio = finite(point?.wpm) / average;
    const durationMs = Math.max(0, finite(point?.durationMs));
    const key = ratio >= 1.15
      ? "surge"
      : ratio >= 0.9
        ? "flow"
        : ratio >= 0.7
          ? "recovery"
          : "drop";
    zones[key].durationMs += durationMs;
    zones[key].seconds += durationMs / 1000;
  }
  const total = Object.values(zones).reduce((sum, zone) => sum + zone.durationMs, 0) || 1;
  for (const zone of Object.values(zones)) {
    zone.percent = round((zone.durationMs / total) * 100);
    zone.seconds = round(zone.seconds);
  }
  return Object.freeze({
    averageWpm: round(average),
    ...Object.fromEntries(Object.entries(zones).map(([key, zone]) => [key, Object.freeze(zone)])),
  });
}

function longestStreak(points, predicate) {
  let current = 0;
  let best = 0;
  for (const point of points) {
    const seconds = Math.max(0, finite(point?.durationMs)) / 1000;
    if (predicate(point)) {
      current += seconds;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return round(best);
}

export function buildErrorRecoveryProfile(timeline) {
  const points = usablePoints(timeline);
  const recoveries = [];
  let attempts = 0;
  for (let index = 0; index < points.length; index += 1) {
    if (finite(points[index]?.errors) <= 0) continue;
    const before = points.slice(Math.max(0, index - 3), index)
      .filter((point) => finite(point?.durationMs) >= 500 && finite(point?.wpm) > 0);
    if (!before.length) continue;
    const baseline = weightedWpm(before);
    if (baseline <= 0) continue;
    attempts += 1;
    const threshold = baseline * 0.9;
    const maxIndex = Math.min(points.length - 1, index + 10);
    let recovered = null;
    for (let probe = index + 1; probe <= maxIndex; probe += 1) {
      if (finite(points[probe]?.wpm) >= threshold && finite(points[probe]?.errors) === 0) {
        const from = finite(points[index]?.elapsedMs, (index + 1) * 1000);
        const to = finite(points[probe]?.elapsedMs, (probe + 1) * 1000);
        recovered = Math.max(0, (to - from) / 1000);
        break;
      }
    }
    if (recovered != null) recoveries.push(recovered);
  }
  return Object.freeze({
    attempts,
    recovered: recoveries.length,
    medianSeconds: recoveries.length ? round(median(recoveries)) : null,
    averageSeconds: recoveries.length ? round(mean(recoveries)) : null,
    slowestSeconds: recoveries.length ? round(Math.max(...recoveries)) : null,
  });
}

function sameTest(session, result) {
  if (!session || session.modeId !== "speed-test") return false;
  if (session.modeData?.configId !== result?.modeData?.configId) return false;
  const currentWordSet = result?.modeData?.wordSetId;
  const sessionWordSet = session.modeData?.wordSetId;
  return !currentWordSet || !sessionWordSet || currentWordSet === sessionWordSet;
}

function currentSummary(result) {
  return {
    sessionId: result?.sessionId,
    modeId: "speed-test",
    endedAt: finite(result?.endedAt),
    wpm: finite(result?.wpm),
    accuracy: finite(result?.accuracy),
    modeData: {
      configId: result?.modeData?.configId,
      wordSetId: result?.modeData?.wordSetId,
      rawWpm: finite(result?.modeData?.rawWpm),
    },
  };
}

export function buildSameConfigTrend(recentSessions = [], result = {}, limit = MAX_TREND_RUNS) {
  const map = new Map();
  for (const session of recentSessions) {
    if (!sameTest(session, result) || !session?.sessionId) continue;
    map.set(session.sessionId, session);
  }
  if (result?.sessionId) map.set(result.sessionId, currentSummary(result));
  const runs = [...map.values()]
    .sort((a, b) => finite(a.endedAt) - finite(b.endedAt))
    .slice(-Math.max(2, Math.round(finite(limit, MAX_TREND_RUNS))));
  if (!runs.length) return null;
  const values = runs.map((run) => finite(run.wpm));
  const accuracies = runs.map((run) => finite(run.accuracy));
  const current = runs.find((run) => run.sessionId === result.sessionId) || runs.at(-1);
  const previous = runs.filter((run) => run.sessionId !== result.sessionId);
  const baseline = previous.length ? mean(previous.map((run) => finite(run.wpm))) : null;
  const currentWpm = finite(current?.wpm);
  const best = Math.max(...values);
  const percentile = Math.round((values.filter((value) => value <= currentWpm).length / values.length) * 100);
  return Object.freeze({
    count: runs.length,
    runs: Object.freeze(runs.map((run) => Object.freeze({
      sessionId: run.sessionId,
      endedAt: finite(run.endedAt),
      wpm: round(run.wpm),
      accuracy: round(run.accuracy),
      rawWpm: round(run.modeData?.rawWpm),
    }))),
    values: Object.freeze(values.map((value) => round(value))),
    averageWpm: round(mean(values)),
    medianWpm: round(median(values)),
    bestWpm: round(best),
    averageAccuracy: round(mean(accuracies)),
    currentWpm: round(currentWpm),
    deltaFromFirst: runs.length > 1 ? round(currentWpm - finite(runs[0].wpm)) : 0,
    deltaVsBaseline: baseline == null ? null : round(currentWpm - baseline),
    percentile,
  });
}

export function buildPerformanceV3Analysis(timeline, {
  recentSessions = [],
  result = {},
} = {}) {
  const points = usablePoints(timeline);
  if (!points.length) return null;
  const average = Math.max(0.1, finite(result?.wpm, weightedWpm(points)) || weightedWpm(points) || 0.1);
  const zones = buildPaceZoneDistribution(timeline, average);
  const recovery = buildErrorRecoveryProfile(timeline);
  const trend = buildSameConfigTrend(recentSessions, result);
  const flowStreakSeconds = longestStreak(points, (point) => {
    const ratio = finite(point?.wpm) / average;
    return ratio >= 0.9 && ratio <= 1.15 && finite(point?.errors) === 0;
  });
  const dropStreakSeconds = longestStreak(points, (point) => (
    finite(point?.wpm) < average * 0.7
  ));
  const burstWpm = (() => {
    const values = points.map((point) => finite(point?.wpm)).sort((a, b) => a - b);
    return round(values[Math.min(values.length - 1, Math.floor(values.length * 0.9))] ?? 0);
  })();

  const notes = [];
  if (zones.drop.percent >= 18) notes.push(`Pace drops occupied ${Math.round(zones.drop.percent)}% of active time.`);
  else if (zones.flow.percent >= 55) notes.push(`You held your flow band for ${Math.round(zones.flow.percent)}% of active time.`);
  else if (zones.surge.percent >= 25) notes.push(`Your run was burst-heavy, with ${Math.round(zones.surge.percent)}% of time above 115% of average pace.`);
  else notes.push("Pace moved between flow and recovery bands without one dominant zone.");

  if (recovery.attempts > 0) {
    if (recovery.medianSeconds != null && recovery.medianSeconds <= 2.5) {
      notes.push(`Error recovery was quick: median ${recovery.medianSeconds.toFixed(1)}s.`);
    } else if (recovery.medianSeconds != null) {
      notes.push(`Errors cost momentum: median recovery ${recovery.medianSeconds.toFixed(1)}s.`);
    } else {
      notes.push("No measured error event returned to its pre-error pace within 10 seconds.");
    }
  }
  if (trend?.count >= 3 && trend.deltaVsBaseline != null) {
    if (trend.deltaVsBaseline >= 3) notes.push(`This run beat your recent same-test baseline by ${trend.deltaVsBaseline.toFixed(1)} WPM.`);
    else if (trend.deltaVsBaseline <= -3) notes.push(`This run was ${Math.abs(trend.deltaVsBaseline).toFixed(1)} WPM below your recent same-test baseline.`);
  }

  return Object.freeze({
    version: 3,
    averageWpm: round(average),
    zones,
    recovery,
    trend,
    flowStreakSeconds,
    dropStreakSeconds,
    burstWpm,
    insight: notes.slice(0, 3).join(" "),
  });
}

export function resampleWpmSeries(points = [], targetCount = 0) {
  const count = Math.max(0, Math.round(finite(targetCount)));
  if (!points.length || !count) return [];
  if (points.length === 1) return Array.from({ length: count }, () => round(points[0]?.wpm));
  if (count === 1) return [round(points[0]?.wpm)];
  return Array.from({ length: count }, (_, index) => {
    const position = (index / (count - 1)) * (points.length - 1);
    const low = Math.floor(position);
    const high = Math.min(points.length - 1, Math.ceil(position));
    const mix = position - low;
    const value = finite(points[low]?.wpm) + ((finite(points[high]?.wpm) - finite(points[low]?.wpm)) * mix);
    return round(value);
  });
}

function ensureV3Styles() {
  if (typeof document === "undefined") return null;
  const existing = document.querySelector('link[data-speed-performance-v3-style]');
  if (existing) return existing;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = V3_STYLE_HREF;
  link.dataset.speedPerformanceV3Style = "";
  document.head.append(link);
  return link;
}

function signed(value, suffix = "") {
  const number = round(value);
  if (Math.abs(number) < 0.05) return `0${suffix}`;
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}${suffix}`;
}

function miniPath(values = [], { min = null, max = null } = {}) {
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

function trendMarkup(trend) {
  if (!trend) return `<div class="speed-performance-v3-empty">No same-test history yet.</div>`;
  const values = trend.values;
  const low = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10);
  const high = Math.max(low + 10, Math.ceil((Math.max(...values) + 5) / 10) * 10);
  const path = miniPath(values, { min: low, max: high });
  const baseline = trend.deltaVsBaseline == null
    ? "Complete this test again to establish a recent baseline."
    : `${signed(trend.deltaVsBaseline, " WPM")} vs prior same-test average`;
  return `<div class="speed-performance-v3-trend" data-v3-trend-count="${trend.count}">
    <div class="speed-performance-v3-card-head">
      <div><span>Recent same-test trend</span><strong>${trend.currentWpm.toFixed(1)} WPM</strong></div>
      <small>${trend.count} ${trend.count === 1 ? "run" : "runs"}</small>
    </div>
    <svg class="speed-performance-mini-chart" viewBox="0 0 ${MINI_WIDTH} ${MINI_HEIGHT}" role="img" aria-label="Recent same-test WPM trend">
      <line x1="${MINI_PAD.left}" x2="${MINI_WIDTH - MINI_PAD.right}" y1="${MINI_HEIGHT - MINI_PAD.bottom}" y2="${MINI_HEIGHT - MINI_PAD.bottom}"></line>
      <path class="speed-performance-mini-line speed-performance-mini-line--current" d="${path}"></path>
    </svg>
    <div class="speed-performance-v3-card-stats">
      <span>Avg <b>${trend.averageWpm.toFixed(1)}</b></span>
      <span>Best <b>${trend.bestWpm.toFixed(1)}</b></span>
      <span>Percentile <b>${trend.percentile}%</b></span>
    </div>
    <p>${baseline}</p>
  </div>`;
}

function resolvePbComparison(result, timeline) {
  const configId = result?.modeData?.configId;
  const wordSetId = result?.modeData?.wordSetId;
  if (!configId) return { status: "none" };
  const record = getSpeedTestRecord(configId, wordSetId);
  if (!record?.sessionId) return { status: "none" };
  if (record.sessionId === result.sessionId) {
    return { status: "current", record };
  }
  const pbTimeline = loadSpeedTestTimeline(record.sessionId);
  if (!pbTimeline?.points?.length) return { status: "missing-timeline", record };
  const count = Math.max(2, timeline?.points?.length || pbTimeline.points.length);
  return {
    status: "available",
    record,
    current: resampleWpmSeries(timeline.points, count),
    pb: resampleWpmSeries(pbTimeline.points, count),
  };
}

function pbMarkup(pb) {
  if (pb.status === "current") {
    return `<div class="speed-performance-v3-pb is-current">
      <div class="speed-performance-v3-card-head"><div><span>Personal best pace</span><strong>Current run is PB</strong></div></div>
      <p>This result now defines your best WPM for this exact test configuration.</p>
    </div>`;
  }
  if (pb.status !== "available") {
    const copy = pb.status === "missing-timeline"
      ? "Your PB predates timeline capture, so its pace curve cannot be reconstructed."
      : "No personal-best pace curve is available yet.";
    return `<div class="speed-performance-v3-pb is-empty">
      <div class="speed-performance-v3-card-head"><div><span>Personal best pace</span><strong>Waiting for comparison</strong></div></div>
      <p>${copy}</p>
    </div>`;
  }
  const combined = [...pb.current, ...pb.pb];
  const low = Math.max(0, Math.floor((Math.min(...combined) - 5) / 10) * 10);
  const high = Math.max(low + 10, Math.ceil((Math.max(...combined) + 5) / 10) * 10);
  const currentPath = miniPath(pb.current, { min: low, max: high });
  const pbPath = miniPath(pb.pb, { min: low, max: high });
  return `<div class="speed-performance-v3-pb" data-v3-pb-comparison>
    <div class="speed-performance-v3-card-head">
      <div><span>Current vs PB pace</span><strong>${finite(pb.record?.bestWpm).toFixed(1)} WPM PB</strong></div>
      <small>normalized progress</small>
    </div>
    <svg class="speed-performance-mini-chart" viewBox="0 0 ${MINI_WIDTH} ${MINI_HEIGHT}" role="img" aria-label="Current pace compared with personal best pace">
      <line x1="${MINI_PAD.left}" x2="${MINI_WIDTH - MINI_PAD.right}" y1="${MINI_HEIGHT - MINI_PAD.bottom}" y2="${MINI_HEIGHT - MINI_PAD.bottom}"></line>
      <path class="speed-performance-mini-line speed-performance-mini-line--pb" d="${pbPath}"></path>
      <path class="speed-performance-mini-line speed-performance-mini-line--current" d="${currentPath}"></path>
    </svg>
    <div class="speed-performance-v3-mini-legend"><span class="is-current"><i></i>Current</span><span class="is-pb"><i></i>PB</span></div>
  </div>`;
}

function zoneMarkup(zones) {
  const entries = [zones.surge, zones.flow, zones.recovery, zones.drop];
  return `<div class="speed-performance-zones" aria-label="Pace distribution">
    <div class="speed-performance-zone-bar">${entries.map((zone) => (
      `<i class="is-${zone.label.toLowerCase()}" style="width:${clamp(zone.percent, 0, 100)}%" title="${zone.label}: ${zone.percent.toFixed(1)}%"></i>`
    )).join("")}</div>
    <div class="speed-performance-zone-labels">${entries.map((zone) => (
      `<span><i class="is-${zone.label.toLowerCase()}"></i>${zone.label}<b>${zone.percent.toFixed(0)}%</b></span>`
    )).join("")}</div>
  </div>`;
}

function v3Markup(analysis, pb) {
  const recovery = analysis.recovery.medianSeconds == null
    ? "—"
    : `${analysis.recovery.medianSeconds.toFixed(1)}s`;
  const trendPercentile = analysis.trend?.percentile ?? null;
  return `<section class="speed-performance-v3" data-speed-performance-v3 data-performance-version="3">
    <header class="speed-performance-v3-heading">
      <div><p>Performance intelligence</p><h4>Flow, recovery &amp; personal trend</h4></div>
      <span>V3</span>
    </header>
    <div class="speed-performance-v3-metrics">
      <div><span>Flow streak</span><strong>${analysis.flowStreakSeconds.toFixed(1)}s</strong><small>stable pace without errors</small></div>
      <div><span>Longest drop</span><strong>${analysis.dropStreakSeconds.toFixed(1)}s</strong><small>below 70% of average pace</small></div>
      <div><span>Error recovery</span><strong>${recovery}</strong><small>${analysis.recovery.attempts ? `${analysis.recovery.recovered}/${analysis.recovery.attempts} recovered` : "no recoverable error events"}</small></div>
      <div><span>Recent percentile</span><strong>${trendPercentile == null ? "—" : `${trendPercentile}%`}</strong><small>within same-test local history</small></div>
    </div>
    <div class="speed-performance-v3-zone-card">
      <div class="speed-performance-v3-card-head"><div><span>Pace distribution</span><strong>${analysis.burstWpm.toFixed(0)} WPM burst</strong></div><small>relative to ${analysis.averageWpm.toFixed(1)} WPM average</small></div>
      ${zoneMarkup(analysis.zones)}
    </div>
    <div class="speed-performance-v3-grid">
      ${trendMarkup(analysis.trend)}
      ${pbMarkup(pb)}
    </div>
    <p class="speed-performance-v3-insight">${analysis.insight}</p>
  </section>`;
}

export function syncSpeedTestPerformanceV3() {
  const base = document.querySelector("#app .speed-results-screen [data-speed-performance]");
  if (!base || base.dataset.performanceV3 === "true") return;
  const v2 = document.querySelector("#app .speed-results-screen [data-speed-performance-v2]");
  if (!v2) return;
  const state = getCurrentSpeedTest();
  const result = state?.result;
  const timeline = result?.modeData?.performanceTimeline;
  if (!result || !timeline?.points?.length) return;
  const analysis = buildPerformanceV3Analysis(timeline, {
    recentSessions: getRecentSessions(),
    result,
  });
  if (!analysis) return;
  const pb = resolvePbComparison(result, timeline);
  ensureV3Styles();
  const template = document.createElement("template");
  template.innerHTML = v3Markup(analysis, pb).trim();
  const section = template.content.firstElementChild;
  if (!section) return;
  v2.insertAdjacentElement("afterend", section);
  base.dataset.performanceV3 = "true";
}

