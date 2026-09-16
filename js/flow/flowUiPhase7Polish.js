const params = new URLSearchParams(globalThis.location?.search || "");
const enabled = params.get("dev") === "1"
  && params.get("mode") === "flow"
  && params.get("flowRun") === "1"
  && params.get("flowUi") === "1";

const LENGTHS = Object.freeze({
  quick: Object.freeze({ minutes: 3, chapters: 3, passages: 6 }),
  standard: Object.freeze({ minutes: 6, chapters: 6, passages: 12 }),
  long: Object.freeze({ minutes: 10, chapters: 6, passages: 24 }),
});

const CATEGORY_LABELS = Object.freeze({
  mixed: "Mixed",
  everyday: "Everyday",
  stories: "Stories",
  dialogue: "Dialogue",
  professional: "Professional",
  academic: "Academic",
  quotes: "Quotes",
  "numbers-symbols": "Numbers & Symbols",
});

function titleCase(value) {
  return String(value || "")
    .split("-")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(" ");
}

function draftSignature(draft) {
  return `${draft.sessionLength}|${draft.category}|${draft.difficulty}`;
}

function syncDraftSummary() {
  if (!enabled) return;
  const screen = document.querySelector('[data-flow-view="ready"][data-flow-ui-phase7="true"]');
  const brief = screen?.querySelector(".flow-phase1-brief");
  const draft = globalThis.window?.wordstrikeFlowUiPhase7?.getDraft?.();
  if (!screen || !brief || !draft) return;

  const signature = draftSignature(draft);
  if (brief.dataset.flowDraftSignature === signature) return;

  const length = LENGTHS[draft.sessionLength] || LENGTHS.standard;
  brief.dataset.flowDraftSignature = signature;
  brief.setAttribute("aria-label", "Selected Flow run setup");
  brief.innerHTML = `
    <span><strong>~${length.minutes} min</strong> ${titleCase(draft.sessionLength)} run</span>
    <span><strong>${length.chapters}</strong> chapters</span>
    <span><strong>${length.passages}</strong> passages</span>
    <span><strong>${CATEGORY_LABELS[draft.category] || titleCase(draft.category)}</strong> text</span>
    <span><strong>${titleCase(draft.difficulty)}</strong> ceiling</span>`;
}

if (enabled) {
  const app = document.querySelector("#app");
  if (app) {
    new MutationObserver(() => queueMicrotask(syncDraftSummary)).observe(app, { childList: true, subtree: true });
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-flow-choice-group]")) queueMicrotask(syncDraftSummary);
  });
  document.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) {
      queueMicrotask(syncDraftSummary);
    }
  });
  queueMicrotask(syncDraftSummary);
}
