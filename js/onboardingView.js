const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function visualMarkup(type) {
  if (type === "navigation-controls") return `<div class="onboarding-navigation-visual">
    <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd><strong>ENTER</strong><strong>ESC</strong></div>`;
  if (type === "word-stream" || type === "typing-highlight" || type === "typing-options") {
    return `<div class="onboarding-word-stream"><span class="done">type</span>
      <strong><i>str</i>ike</strong><span>precision</span></div>`;
  }
  if (type === "boss-phrase" || type === "boss-phases") {
    return `<div class="onboarding-boss-visual"><span>PHASE 1 / 3</span><strong><i>defend the</i> core</strong></div>`;
  }
  if (type === "leaderboard-ranking") {
    return `<div class="onboarding-ranking"><span>#1 &nbsp; VECTOR</span><span>#2 &nbsp; STRIKE</span><span>#3 &nbsp; PLAYER</span></div>`;
  }
  if (type === "difficulty-growth") {
    return `<div class="onboarding-growth"><span>STAGE 1</span><span>STAGE 5</span><span>STAGE 10</span></div>`;
  }
  if (type === "local-first") {
    return `<div class="onboarding-local-visual"><strong>PROGRESS SAVED</strong><span>GLOBAL RANKS OPTIONAL</span></div>`;
  }
  return `<div class="onboarding-approach"><span class="demo-word">strike</span><span class="demo-arrow">→</span><span class="demo-core">◆</span></div>`;
}

function controlCardsMarkup(controls) {
  if (!Array.isArray(controls) || controls.length === 0) return "";
  return `<div class="onboarding-control-cards">${controls.map((control) => `
    <div><kbd>${escapeHtml(control.key)}</kbd><span>${escapeHtml(control.label)}</span></div>`).join("")}</div>`;
}

export function onboardingMarkup(state) {
  if (!state) return "";
  const current = state.steps[state.currentStep];
  const final = state.currentStep === state.steps.length - 1;
  const showBack = state.steps.length > 1 && state.currentStep > 0;
  const showSecondary = final && current.secondaryLabel && !(current.secondarySignedOutOnly && state.signedIn);
  return `<div class="onboarding-backdrop">
    <section class="onboarding-dialog onboarding-tutorial-${escapeHtml(state.tutorialId)}" data-tutorial-id="${escapeHtml(state.tutorialId)}" role="dialog" aria-modal="true" aria-labelledby="onboarding-step-title" tabindex="-1">
      <button class="onboarding-close" data-onboarding-action="close" aria-label="Close tutorial">×</button>
      <div class="onboarding-copy">
        <span class="eyebrow">${escapeHtml(state.title)}</span>
        <h2 id="onboarding-step-title">${escapeHtml(current.title)}</h2>
        <p>${escapeHtml(current.body)}</p>
        ${controlCardsMarkup(current.controls)}
        ${current.helper ? `<small class="onboarding-helper">${escapeHtml(current.helper)}</small>` : ""}
      </div>
      <div class="onboarding-visual" aria-hidden="true">${visualMarkup(current.visualType)}</div>
      <footer class="onboarding-action-dock">
        <div class="onboarding-progress" aria-label="Step ${state.currentStep + 1} of ${state.steps.length}">
          ${state.steps.map((_, index) => `<span class="${index === state.currentStep ? "active" : ""}"></span>`).join("")}
        </div>
        <div class="onboarding-actions">
          <button class="text-action" data-onboarding-action="skip">SKIP</button>
          ${showBack ? '<button class="arcade-button secondary" data-onboarding-action="previous">BACK</button>' : ""}
          <button class="arcade-button primary selected" data-onboarding-action="primary">${escapeHtml(final && state.primaryLabel ? state.primaryLabel : current.primaryLabel)}</button>
        </div>
        ${showSecondary ? `<button class="onboarding-secondary" data-onboarding-choice="${escapeHtml(current.secondaryChoice)}">${escapeHtml(current.secondaryLabel)}</button>` : ""}
        ${final && current.tertiaryLabel ? `<button class="onboarding-tertiary" data-onboarding-choice="${escapeHtml(current.tertiaryChoice)}">${escapeHtml(current.tertiaryLabel)}</button>` : ""}
      </footer>
    </section>
  </div>`;
}

export function createOnboardingView(controller, { root = globalThis.document } = {}) {
  let overlay = null;
  let previousFocus = null;

  const closeAction = () => {
    const state = controller.getState();
    if (state?.source === "automatic") controller.skip();
    else controller.close();
  };
  const render = (state) => {
    overlay?.remove?.();
    overlay = null;
    if (!state) {
      previousFocus?.focus?.({ preventScroll: true });
      previousFocus = null;
      return;
    }
    if (!previousFocus) previousFocus = root?.activeElement || null;
    const wrapper = root.createElement("div");
    wrapper.className = "onboarding-root";
    wrapper.innerHTML = onboardingMarkup(state);
    root.body?.append?.(wrapper);
    overlay = wrapper;
    const dialog = wrapper.querySelector(".onboarding-dialog");
    const primary = wrapper.querySelector('[data-onboarding-action="primary"]');
    wrapper.querySelector('[data-onboarding-action="close"]')?.addEventListener("click", closeAction);
    wrapper.querySelector('[data-onboarding-action="skip"]')?.addEventListener("click", () => controller.skip());
    wrapper.querySelector('[data-onboarding-action="previous"]')?.addEventListener("click", () => controller.previous());
    primary?.addEventListener("click", () => {
      const current = controller.getState();
      if (current.currentStep === current.steps.length - 1) controller.choose("primary");
      else controller.next();
    });
    wrapper.querySelectorAll("[data-onboarding-choice]").forEach((button) => {
      button.addEventListener("click", () => controller.choose(button.dataset.onboardingChoice));
    });
    dialog?.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Tab") {
        const focusable = [...dialog.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.target?.matches?.("input, textarea")) return;
      if (event.key === "ArrowLeft" && controller.getState()?.currentStep > 0) { event.preventDefault(); controller.previous(); }
      else if (event.key === "ArrowRight") { event.preventDefault(); controller.next(); }
      else if (event.key === "Home") { event.preventDefault(); controller.first(); }
      else if (event.key === "End") { event.preventDefault(); controller.last(); }
      else if (event.key === "Escape") { event.preventDefault(); closeAction(); }
      else if (["Enter", " "].includes(event.key) && !event.target?.matches?.("button")) {
        event.preventDefault(); primary?.click?.();
      }
    });
    primary?.focus?.({ preventScroll: true });
  };

  const unsubscribe = controller.subscribe(render);
  return Object.freeze({
    destroy() { unsubscribe(); overlay?.remove?.(); overlay = null; },
    getElement: () => overlay,
  });
}
