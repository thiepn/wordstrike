import { getRecentSessions } from "./modeStorage.js";
import { getCurrentSpeedTest } from "./speedTest.js";

const SVG_WIDTH = 1000;
const SVG_HEIGHT = 330;
const PLOT = Object.freeze({ left: 62, right: 22, top: 24, bottom: 62 });
const LAYER_STORAGE_KEY = "wordstrike_speed_performance_layers_v2";
const DEFAULT_LAYERS = Object.freeze({ raw: true, sustained: true, errors: true });

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rounded = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};

function wpmFromCharacters(characters, durationMs) {
  const duration = Math.max(0, finite(durationMs));
  if (!duration) return 0;
  return (Math.max(0, finite(characters)) / 5) / (duration / 60000);
}

function weightedWpm(points = []) {
  const durationMs = points.reduce((sum, point) => sum + Math.max(0, finite(point?.durationMs)), 0);
  const characters = points.reduce((sum, point) => sum + Math.max(0, finite(point?.netCorrectChars)), 0);
  return rounded(wpmFromCharacters(characters, durationMs));
}

function weightedAccuracy(points = []) {
  const correct = points.reduce((sum, point) => sum + Math.max(0, finite(point?.correctChars)), 0);
  const errors = points.reduce((sum, point) => sum + Math.max(0, finite(point?.errors)), 0);
  const denominator = correct + errors;
  return denominator > 0 ? rounded((correct / denominator) * 100) : 100;
}

function splitIntoThirds(points = []) {
  if (!points.length) return [[], [], []];
  const firstEnd = Math.ceil(points.length / 3);
  const secondEnd = Math.ceil((points.length * 2) / 3);
  return [
    points.slice(0, firstEnd),
    points.slice(firstEnd, secondEnd),
    points.slice(secondEnd),
  ];
}

export function buildSustainedWpmSeries(points = [], windowSize = 5) {
  const safeWindow = Math.max(1, Math.round(finite(windowSize, 5)));
  return points.map((_point, index) => {
    const start = Math.max(0, index - safeWindow + 1);
    const window = points.slice(start, index + 1);
    return Object.freeze({
      second: index + 1,
      wpm: weightedWpm(window),
      windowSeconds: window.length,
    });
  });
}

function consistencyScore(points = []) {
  const values = points
    .filter((point) => finite(point?.durationMs) >= 750)
    .map((point) => Math.max(0, finite(point?.wpm)));
  if (values.length <= 1) return 100;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  const coefficient = Math.sqrt(variance) / mean;
  return Math.round(clamp((1 - coefficient) * 100, 0, 100));
}

function segmentSummary(points, label) {
  return Object.freeze({
    label,
    wpm: weightedWpm(points),
    accuracy: weightedAccuracy(points),
    errors: points.reduce((sum, point) => sum + Math.max(0, Math.round(finite(point?.errors))), 0),
    backspaces: points.reduce((sum, point) => sum + Math.max(0, Math.round(finite(point?.backspaces))), 0),
  });
}

function performanceInsight({ segments, averageWpm, errorSegment }) {
  const start = segments[0]?.wpm ?? 0;
  const finish = segments[2]?.wpm ?? 0;
  const threshold = Math.max(5, averageWpm * 0.08);
  let pace = "Pace stayed relatively even from start to finish.";
  if (finish - start >= threshold) {
    pace = `Strong finish: the final third was ${Math.round(finish - start)} WPM faster than the opening third.`;
  } else if (start - finish >= threshold) {
    pace = `Late fade: the final third was ${Math.round(start - finish)} WPM slower than the opening third.`;
  }
  const errorCopy = errorSegment?.errors > 0
    ? ` Most errors clustered in the ${errorSegment.label.toLowerCase()} third.`
    : " No concentrated error segment was detected.";
  return `${pace}${errorCopy}`;
}

export function buildPerformanceV2Analysis(timeline) {
  const points = Array.isArray(timeline?.points) ? timeline.points : [];
  if (!points.length) return null;
  const [startPoints, middlePoints, finishPoints] = splitIntoThirds(points);
  const segments = Object.freeze([
    segmentSummary(startPoints, "Start"),
    segmentSummary(middlePoints, "Middle"),
    segmentSummary(finishPoints, "Finish"),
  ]);
  const averageWpm = weightedWpm(points);
  const totalErrors = points.reduce((sum, point) => sum + Math.max(0, Math.round(finite(point?.errors))), 0);
  const totalBackspaces = points.reduce((sum, point) => sum + Math.max(0, Math.round(finite(point?.backspaces))), 0);
  const errorSegment = segments.reduce((worst, segment) => (
    !worst || segment.errors > worst.errors ? segment : worst
  ), null);
  const strongestSegment = segments.reduce((best, segment) => (
    !best || segment.wpm > best.wpm ? segment : best
  ), null);
  const activeSeconds = Math.max(0.001, finite(timeline?.activeDurationMs) / 1000);
  const paceDeltaWpm = rounded((segments[2]?.wpm ?? 0) - (segments[0]?.wpm ?? 0));
  const analysis = {
    version: 2,
    averageWpm,
    consistency: consistencyScore(points),
    paceDeltaWpm,
    totalErrors,
    totalBackspaces,
    errorsPerMinute: rounded((totalErrors / activeSeconds) * 60),
    sustained: Object.freeze(buildSustainedWpmSeries(points)),
    segments,
    strongestSegment,
    errorSegment,
  };
  analysis.insight = performanceInsight(analysis);
  return Object.freeze(analysis);
}

export function selectPreviousComparableSession(recentSessions = [], result = {}) {
  const configId = result?.modeData?.configId;
  if (!configId) return null;
  return recentSessions.find((session) => (
    session?.sessionId &&
    session.sessionId !== result.sessionId &&
    session.modeId === "speed-test" &&
    session.modeData?.configId === configId
  )) || null;
}

function readLayerPreferences() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(LAYER_STORAGE_KEY) || "null");
    return {
      raw: parsed?.raw !== false,
      sustained: parsed?.sustained !== false,
      errors: parsed?.errors !== false,
    };
  } catch {
    return { ...DEFAULT_LAYERS };
  }
}

function writeLayerPreferences(layers) {
  try {
    globalThis.localStorage?.setItem(LAYER_STORAGE_KEY, JSON.stringify(layers));
  } catch {
    // Layer preferences are optional and must never block results rendering.
  }
}

function signed(value, suffix = "") {
  const number = rounded(value);
  if (Math.abs(number) < 0.05) return `0${suffix}`;
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}${suffix}`;
}

function segmentMarkup(segment) {
  return `<div class="speed-performance-segment">
    <span>${segment.label}</span>
    <strong>${Math.round(segment.wpm)} WPM</strong>
    <small>${segment.accuracy.toFixed(1)}% accuracy · ${segment.errors} ${segment.errors === 1 ? "error" : "errors"}</small>
  </div>`;
}

function comparisonMarkup(previous, result) {
  if (!previous) {
    return `<div class="speed-performance-compare is-empty" data-speed-performance-compare>
      <div><span>Run comparison</span><strong>No comparable run yet</strong></div>
      <p>Complete this exact test configuration again to compare pace and final performance.</p>
    </div>`;
  }
  const wpmDelta = finite(result?.wpm) - finite(previous?.wpm);
  const accuracyDelta = finite(result?.accuracy) - finite(previous?.accuracy);
  const rawDelta = finite(result?.modeData?.rawWpm) - finite(previous?.modeData?.rawWpm);
  return `<div class="speed-performance-compare" data-speed-performance-compare>
    <div class="speed-performance-compare-heading">
      <div><span>Versus previous same test</span><strong class="${wpmDelta >= 0 ? "is-positive" : "is-negative"}">${signed(wpmDelta, " WPM")}</strong></div>
      <small>Previous ${finite(previous.wpm).toFixed(1)} WPM · ${finite(previous.accuracy).toFixed(1)}% accuracy</small>
    </div>
    <div class="speed-performance-compare-metrics">
      <span>Accuracy <b>${signed(accuracyDelta, " pp")}</b></span>
      <span>Raw <b>${signed(rawDelta, " WPM")}</b></span>
    </div>
  </div>`;
}

function analysisMarkup(analysis, previous, result) {
  const paceClass = analysis.paceDeltaWpm > 0 ? "is-positive" : analysis.paceDeltaWpm < 0 ? "is-negative" : "";
  return `<section class="speed-performance-v2" data-speed-performance-v2 data-performance-version="2">
    <header class="speed-performance-v2-heading">
      <div><p>Performance analysis</p><h4>Pace &amp; consistency</h4></div>
      <span>V2</span>
    </header>
    <div class="speed-performance-v2-metrics">
      <div><span>Consistency</span><strong>${analysis.consistency}%</strong><small>second-to-second stability</small></div>
      <div><span>Finish vs start</span><strong class="${paceClass}">${signed(analysis.paceDeltaWpm, " WPM")}</strong><small>third-to-third pace change</small></div>
      <div><span>Corrections</span><strong>${analysis.totalBackspaces}</strong><small>backspace actions</small></div>
      <div><span>Error pressure</span><strong>${analysis.errorsPerMinute.toFixed(1)}</strong><small>errors per active minute</small></div>
    </div>
    <div class="speed-performance-segments" aria-label="Pace by test segment">
      ${analysis.segments.map(segmentMarkup).join("")}
    </div>
    <p class="speed-performance-insight">${analysis.insight}</p>
    ${comparisonMarkup(previous, result)}
  </section>`;
}

function graphModel(timeline, averageWpm = 0) {
  const points = Array.isArray(timeline?.points) ? timeline.points : [];
  if (!points.length) return null;
  const maximum = Math.max(
    40,
    finite(averageWpm),
    ...points.map((point) => Math.max(finite(point?.wpm), finite(point?.rawWpm))),
  );
  const yMax = Math.max(40, Math.ceil(maximum / 20) * 20);
  const plotWidth = SVG_WIDTH - PLOT.left - PLOT.right;
  const plotHeight = SVG_HEIGHT - PLOT.top - PLOT.bottom;
  const xFor = (index) => points.length === 1
    ? PLOT.left + (plotWidth / 2)
    : PLOT.left + ((index + 0.5) / points.length) * plotWidth;
  const yFor = (value) => PLOT.top + (1 - clamp(finite(value), 0, yMax) / yMax) * plotHeight;
  return { points, xFor, yFor };
}

function sustainedPath(timeline, analysis, averageWpm) {
  const model = graphModel(timeline, averageWpm);
  if (!model || !analysis?.sustained?.length) return "";
  return analysis.sustained.map((point, index) => (
    `${index === 0 ? "M" : "L"}${model.xFor(index).toFixed(2)} ${model.yFor(point.wpm).toFixed(2)}`
  )).join(" ");
}

function addSustainedLayer(section, timeline, analysis, averageWpm) {
  const svg = section.querySelector("[data-speed-performance-svg]");
  if (!svg || svg.querySelector("[data-speed-performance-sustained]")) return;
  const currentWpm = svg.querySelector(".speed-performance-line--wpm");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "speed-performance-line speed-performance-line--sustained");
  path.setAttribute("data-speed-performance-sustained", "");
  path.setAttribute("d", sustainedPath(timeline, analysis, averageWpm));
  if (currentWpm) currentWpm.insertAdjacentElement("beforebegin", path);
  else svg.append(path);
}

function addLayerControls(section) {
  if (section.querySelector("[data-speed-performance-controls]")) return;
  const heading = section.querySelector(".speed-performance-heading");
  if (!heading) return;
  const controls = document.createElement("div");
  controls.className = "speed-performance-controls";
  controls.dataset.speedPerformanceControls = "";
  controls.setAttribute("aria-label", "Performance graph layers");
  controls.innerHTML = `
    <button type="button" data-performance-layer="raw">Raw</button>
    <button type="button" data-performance-layer="sustained">5s smooth</button>
    <button type="button" data-performance-layer="errors">Errors</button>`;
  heading.insertAdjacentElement("afterend", controls);

  const layers = readLayerPreferences();
  const apply = () => {
    section.classList.toggle("hide-raw", !layers.raw);
    section.classList.toggle("hide-sustained", !layers.sustained);
    section.classList.toggle("hide-errors", !layers.errors);
    controls.querySelectorAll("[data-performance-layer]").forEach((button) => {
      const key = button.dataset.performanceLayer;
      button.setAttribute("aria-pressed", String(layers[key] !== false));
    });
  };
  controls.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-performance-layer]");
    if (!button) return;
    const key = button.dataset.performanceLayer;
    if (!(key in layers)) return;
    layers[key] = !layers[key];
    writeLayerPreferences(layers);
    apply();
  });
  apply();
}

function addSustainedLegend(section) {
  const legend = section.querySelector(".speed-performance-legend");
  if (!legend || legend.querySelector(".is-sustained")) return;
  const item = document.createElement("span");
  item.className = "speed-performance-legend-item is-sustained";
  item.innerHTML = "<i></i>5s smooth";
  legend.insertBefore(item, legend.querySelector(".is-error"));
}

function enhanceV2() {
  const base = document.querySelector("#app .speed-results-screen [data-speed-performance]");
  if (!base || base.dataset.performanceVersion === "2") return;
  const state = getCurrentSpeedTest();
  const result = state?.result;
  const timeline = result?.modeData?.performanceTimeline;
  if (!result || !timeline?.points?.length) return;
  const analysis = buildPerformanceV2Analysis(timeline);
  if (!analysis) return;
  const previous = selectPreviousComparableSession(getRecentSessions(), result);

  addSustainedLayer(base, timeline, analysis, result.wpm);
  addSustainedLegend(base);
  addLayerControls(base);
  base.dataset.performanceVersion = "2";

  const template = document.createElement("template");
  template.innerHTML = analysisMarkup(analysis, previous, result).trim();
  const v2 = template.content.firstElementChild;
  if (v2) base.insertAdjacentElement("afterend", v2);
}

function install() {
  const root = document.querySelector("#app");
  if (!root) return;
  enhanceV2();
  const observer = new MutationObserver(enhanceV2);
  observer.observe(root, { childList: true, subtree: true });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
}

export const SPEED_TEST_PERFORMANCE_V2_LAYER_STORAGE_KEY = LAYER_STORAGE_KEY;
