const app = document.querySelector("#app");

function flowBand(value) {
  if (value >= 85) return "high";
  if (value <= 35) return "low";
  return "mid";
}

function decorateFlowSurface() {
  if (!app) return;

  for (const screen of app.querySelectorAll(".flow-phase1-screen")) {
    screen.dataset.flowVisual = "quiet-signal";
  }

  for (const meter of app.querySelectorAll("[data-flow-meter]")) {
    const value = Number(meter.getAttribute("aria-valuenow"));
    if (Number.isFinite(value)) meter.dataset.flowBand = flowBand(value);
  }

  for (const transition of app.querySelectorAll(".flow-chapter-transition")) {
    if (transition.querySelector(".flow-chapter-index")) continue;
    const kicker = transition.querySelector(".flow-phase1-kicker")?.textContent || "";
    const match = kicker.match(/Chapter\s+(\d+)\s*\//i);
    if (!match) continue;
    const index = document.createElement("div");
    index.className = "flow-chapter-index";
    index.setAttribute("aria-hidden", "true");
    index.textContent = String(Number(match[1])).padStart(2, "0");
    transition.prepend(index);
  }
}

if (app) {
  const observer = new MutationObserver(decorateFlowSurface);
  observer.observe(app, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-valuenow"],
  });
  queueMicrotask(decorateFlowSurface);
}
