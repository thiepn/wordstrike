import { getCurrentSpeedTest } from "./speedTest.js";
import { loadSpeedTestTimeline } from "./speedTestTimeline.js";

const SVG_WIDTH = 1000;
const SVG_HEIGHT = 330;
const PLOT = Object.freeze({ left: 62, right: 22, top: 24, bottom: 62 });

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

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
  const yFor = (value) => PLOT.top + (1 - Math.max(0, Math.min(yMax, finite(value))) / yMax) * plotHeight;
  return { points, yMax, plotWidth, plotHeight, xFor, yFor };
}

function pathFor(model, key) {
  return model.points.map((point, index) => {
    const command = index === 0 ? "M" : "L";
    return `${command}${model.xFor(index).toFixed(2)} ${model.yFor(point?.[key]).toFixed(2)}`;
  }).join(" ");
}

function formatWindow(value, startSecond) {
  if (value == null || startSecond == null) return "—";
  return `${Math.round(value)} WPM · ${startSecond}–${startSecond + 4}s`;
}

function graphMarkup(timeline, averageWpm = 0) {
  const model = graphModel(timeline, averageWpm);
  if (!model) return "";
  const grid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = Math.round(model.yMax * (1 - ratio));
    const y = PLOT.top + ratio * model.plotHeight;
    return `<g class="speed-performance-grid-row">
      <line x1="${PLOT.left}" y1="${y}" x2="${SVG_WIDTH - PLOT.right}" y2="${y}"></line>
      <text x="${PLOT.left - 12}" y="${y + 4}" text-anchor="end">${value}</text>
    </g>`;
  }).join("");
  const pointCount = model.points.length;
  const tickEvery = pointCount <= 15 ? 5 : pointCount <= 30 ? 10 : 15;
  const xTicks = model.points.map((point, index) => {
    const second = index + 1;
    if (index !== 0 && second !== pointCount && second % tickEvery !== 0) return "";
    return `<text class="speed-performance-x-label" x="${model.xFor(index)}" y="${SVG_HEIGHT - 18}" text-anchor="middle">${second}s</text>`;
  }).join("");
  const errorMarkers = model.points.map((point, index) => {
    const errors = Math.max(0, Math.round(finite(point?.errors)));
    if (!errors) return "";
    const x = model.xFor(index);
    const label = errors > 1 ? `×${errors}` : "×";
    return `<text class="speed-performance-error-marker" x="${x}" y="${SVG_HEIGHT - PLOT.bottom + 25}" text-anchor="middle" aria-hidden="true">${label}</text>`;
  }).join("");
  const average = Math.max(0, finite(averageWpm));
  const averageMarkup = average > 0
    ? `<g class="speed-performance-average">
        <line x1="${PLOT.left}" y1="${model.yFor(average)}" x2="${SVG_WIDTH - PLOT.right}" y2="${model.yFor(average)}"></line>
        <text x="${SVG_WIDTH - PLOT.right - 4}" y="${Math.max(PLOT.top + 12, model.yFor(average) - 7)}" text-anchor="end">AVG ${Math.round(average)}</text>
      </g>`
    : "";
  const analysis = timeline.analysis || {};
  return `<section class="speed-test-performance" data-speed-performance>
    <div class="speed-performance-heading">
      <div>
        <p class="speed-performance-kicker">Performance timeline</p>
        <h3>Speed over time</h3>
      </div>
      <div class="speed-performance-legend" aria-label="Graph legend">
        <span class="speed-performance-legend-item is-wpm"><i></i>WPM</span>
        <span class="speed-performance-legend-item is-raw"><i></i>Raw</span>
        <span class="speed-performance-legend-item is-error"><i>×</i>Errors</span>
      </div>
    </div>
    <div class="speed-performance-chart-wrap" data-speed-performance-wrap>
      <svg class="speed-performance-chart" data-speed-performance-svg viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" tabindex="0" aria-label="Typing speed by second. Use left and right arrow keys to inspect the graph.">
        ${grid}
        ${averageMarkup}
        <path class="speed-performance-line speed-performance-line--raw" d="${pathFor(model, "rawWpm")}"></path>
        <path class="speed-performance-line speed-performance-line--wpm" d="${pathFor(model, "wpm")}"></path>
        ${errorMarkers}
        ${xTicks}
        <line class="speed-performance-crosshair" data-speed-performance-crosshair x1="${PLOT.left}" y1="${PLOT.top}" x2="${PLOT.left}" y2="${SVG_HEIGHT - PLOT.bottom}" visibility="hidden"></line>
        <circle class="speed-performance-selected speed-performance-selected--raw" data-speed-performance-selected-raw cx="${PLOT.left}" cy="${PLOT.top}" r="6" visibility="hidden"></circle>
        <circle class="speed-performance-selected speed-performance-selected--wpm" data-speed-performance-selected-wpm cx="${PLOT.left}" cy="${PLOT.top}" r="6" visibility="hidden"></circle>
      </svg>
      <div class="speed-performance-tooltip" data-speed-performance-tooltip hidden></div>
    </div>
    <p class="speed-performance-hint">Hover or drag across the graph to inspect each second.</p>
    <div class="speed-performance-analysis" aria-label="Performance highlights">
      <div><span>Peak</span><strong>${Math.round(finite(analysis.peakWpm))} WPM</strong><small>${analysis.peakSecond ? `at ${analysis.peakSecond}s` : "—"}</small></div>
      <div><span>Fastest 5s</span><strong>${formatWindow(analysis.fastest5sWpm, analysis.fastest5sStartSecond)}</strong></div>
      <div><span>Slowest 5s</span><strong>${formatWindow(analysis.slowest5sWpm, analysis.slowest5sStartSecond)}</strong></div>
    </div>
  </section>`;
}

function mistakeDetail(timeline, second) {
  const mistakes = (timeline?.mistakes || []).filter((item) => item?.second === second);
  if (!mistakes.length) return "";
  const first = mistakes[0];
  const count = mistakes.reduce((sum, item) => sum + Math.max(1, finite(item?.count, 1)), 0);
  let detail = `${count} ${count === 1 ? "mistake" : "mistakes"}`;
  if (first.type === "missed") {
    detail += first.word ? ` · missed in “${escapeHtml(first.word)}”` : " · missed characters";
  } else if (first.expected || first.typed) {
    detail += ` · expected <b>${escapeHtml(first.expected || "—")}</b>, typed <b>${escapeHtml(first.typed || "—")}</b>`;
  }
  return `<div class="speed-performance-tooltip-mistake">${detail}</div>`;
}

function wireGraph(section, timeline, averageWpm = 0) {
  const svg = section?.querySelector?.("[data-speed-performance-svg]");
  const wrap = section?.querySelector?.("[data-speed-performance-wrap]");
  const tooltip = section?.querySelector?.("[data-speed-performance-tooltip]");
  const crosshair = section?.querySelector?.("[data-speed-performance-crosshair]");
  const selectedWpm = section?.querySelector?.("[data-speed-performance-selected-wpm]");
  const selectedRaw = section?.querySelector?.("[data-speed-performance-selected-raw]");
  const model = graphModel(timeline, averageWpm);
  if (!svg || !wrap || !tooltip || !model) return;
  let selectedIndex = null;

  const showIndex = (index, clientX = null) => {
    const safeIndex = Math.max(0, Math.min(model.points.length - 1, Math.round(index)));
    const point = model.points[safeIndex];
    selectedIndex = safeIndex;
    const x = model.xFor(safeIndex);
    const yWpm = model.yFor(point.wpm);
    const yRaw = model.yFor(point.rawWpm);
    crosshair.setAttribute("x1", x);
    crosshair.setAttribute("x2", x);
    crosshair.setAttribute("visibility", "visible");
    selectedWpm.setAttribute("cx", x);
    selectedWpm.setAttribute("cy", yWpm);
    selectedWpm.setAttribute("visibility", "visible");
    selectedRaw.setAttribute("cx", x);
    selectedRaw.setAttribute("cy", yRaw);
    selectedRaw.setAttribute("visibility", "visible");
    tooltip.hidden = false;
    tooltip.innerHTML = `<div class="speed-performance-tooltip-title">${point.second}s</div>
      <div class="speed-performance-tooltip-grid">
        <span>WPM</span><strong>${Math.round(point.wpm)}</strong>
        <span>Raw</span><strong>${Math.round(point.rawWpm)}</strong>
        <span>Accuracy</span><strong>${finite(point.accuracy, 100).toFixed(1)}%</strong>
        <span>Errors</span><strong>${Math.round(finite(point.errors))}</strong>
        <span>Backspaces</span><strong>${Math.round(finite(point.backspaces))}</strong>
      </div>
      ${mistakeDetail(timeline, point.second)}`;
    const rect = wrap.getBoundingClientRect();
    const plotRatio = (x - PLOT.left) / model.plotWidth;
    const desired = clientX == null ? rect.width * plotRatio : clientX - rect.left;
    const clamped = Math.max(74, Math.min(rect.width - 74, desired));
    tooltip.style.left = `${clamped}px`;
    tooltip.classList.toggle("is-left", clamped > rect.width * 0.68);
  };

  const indexFromClientX = (clientX) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return 0;
    const svgX = ((clientX - rect.left) / rect.width) * SVG_WIDTH;
    const ratio = Math.max(0, Math.min(0.999999, (svgX - PLOT.left) / model.plotWidth));
    return Math.floor(ratio * model.points.length);
  };

  svg.addEventListener("pointerdown", (event) => {
    showIndex(indexFromClientX(event.clientX), event.clientX);
  });
  svg.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && event.buttons === 0) return;
    showIndex(indexFromClientX(event.clientX), event.clientX);
  });
  svg.addEventListener("mousemove", (event) => {
    showIndex(indexFromClientX(event.clientX), event.clientX);
  });
  svg.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") selectedIndex = 0;
    else if (event.key === "End") selectedIndex = model.points.length - 1;
    else if (event.key === "ArrowLeft") selectedIndex = (selectedIndex ?? 1) - 1;
    else selectedIndex = (selectedIndex ?? -1) + 1;
    showIndex(selectedIndex);
  });
  svg.addEventListener("mouseleave", () => {
    if (document.activeElement === svg) return;
    tooltip.hidden = true;
    crosshair.setAttribute("visibility", "hidden");
    selectedWpm.setAttribute("visibility", "hidden");
    selectedRaw.setAttribute("visibility", "hidden");
    selectedIndex = null;
  });
}

function enhanceSpeedTestResults() {
  const panel = document.querySelector("#app .speed-test-result-panel");
  if (!panel || panel.querySelector("[data-speed-performance]")) return;
  const state = getCurrentSpeedTest();
  const result = state?.result;
  if (!result) return;
  const timeline = result.modeData?.performanceTimeline
    || loadSpeedTestTimeline(result.sessionId);
  if (!timeline?.points?.length) return;
  const primary = panel.querySelector(".speed-test-primary-result");
  const grid = panel.querySelector(".speed-test-results");
  const anchor = primary || grid;
  if (!anchor) return;
  const template = document.createElement("template");
  template.innerHTML = graphMarkup(timeline, result.wpm ?? 0).trim();
  const section = template.content.firstElementChild;
  if (!section) return;
  anchor.insertAdjacentElement("afterend", section);
  wireGraph(section, timeline, result.wpm ?? 0);
}

function installEnhancer() {
  const root = document.querySelector("#app");
  if (!root) return;
  enhanceSpeedTestResults();
  const observer = new MutationObserver(() => enhanceSpeedTestResults());
  observer.observe(root, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installEnhancer, { once: true });
} else {
  installEnhancer();
}

export { graphMarkup as speedTestPerformanceGraphMarkup };
