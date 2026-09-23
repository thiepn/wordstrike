const app = document.querySelector("#app");

function decorateFlowSurface() {
  if (!app) return;

  for (const screen of app.querySelectorAll(".flow-phase1-screen")) {
    screen.dataset.flowVisual = "quiet-signal";
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
  const observer = new MutationObserver(() => queueMicrotask(decorateFlowSurface));
  observer.observe(app, { childList: true });
  queueMicrotask(decorateFlowSurface);
}
