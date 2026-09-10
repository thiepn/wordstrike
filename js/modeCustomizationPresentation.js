/** P2 mode-local controls. Observes route/pause boundaries, never the word stream. */
import { normalizeCustomization } from "./customization.js";
import {
  ACTION_INTENSITIES, GAMEPLAY_HUD_LAYOUTS, TYPING_HUD_LAYOUTS, TYPING_PASSAGE_WIDTHS,
  resolveTypingPresentation, resolveModeEffectsIntensity,
} from "./modeCustomization.js";
import { SPEED_TEST_FONT_SIZES } from "./speedTestPresentation.js";
import { updateModeCustomizationSetting } from "./storage.js";

const options = (items) => items.map(({ value, label }) => `<option value="${value}">${label}</option>`).join("");
const attribute = (node, key, value) => {
  if (node && node.getAttribute(key) !== String(value)) node.setAttribute(key, String(value));
};
const text = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
const row = (id, label, field, items) => `<div class="mode-presentation-row">
  <label for="${id}">${label}</label><select id="${id}" data-mode-setting="${field}">${options(items)}</select></div>`;

export function modePresentationMarkup(mode, location = "ready") {
  if (!["typing", "campaign", "endless", "boss", "arcade-rush"].includes(mode)
      || !["ready", "pause"].includes(location)) throw new TypeError("Unknown mode presentation context");
  const id = `mode-presentation-${mode}-${location}`;
  let rows = "";
  let help = "";
  if (mode === "typing") {
    rows = row(`${id}-hud`, "HUD layout", "typingTest.hudLayout", TYPING_HUD_LAYOUTS)
      + row(`${id}-live`, "Live statistics", "typingTest.liveStats", [{ value: "true", label: "On" }, { value: "false", label: "Off" }])
      + row(`${id}-width`, "Passage width", "typingTest.passageWidth", TYPING_PASSAGE_WIDTHS);
    if (location === "pause") rows += row(`${id}-size`, "Text size", "typingTest.textSize", SPEED_TEST_FONT_SIZES);
    help = "Focus shows only time or word progress. Balanced keeps the original HUD. Data adds completed words and incorrect keystrokes, including corrected mistakes. Passage width changes only the horizontal reading area: Narrow, Normal, or Wide.";
  } else {
    if (["campaign", "endless"].includes(mode)) {
      rows = row(`${id}-hud`, "Gameplay HUD", "gameplayHud", GAMEPLAY_HUD_LAYOUTS);
      help = "Shared by Campaign and Endless. Minimal keeps level/stage, Core integrity, objective progress, and essential status; the playfield stays the same size.";
    }
    if (["boss", "arcade-rush"].includes(mode) || (mode === "campaign" && location === "ready")) {
      rows += row(`${id}-intensity`, mode === "campaign" ? "Boss visuals" : "Visual intensity", "actionModeIntensity", ACTION_INTENSITIES);
      help += `${help ? " " : ""}Focused reduces decoration in Boss and Arcade Rush without hiding danger, countdowns, or attack information. Full respects your global effects and reduced-motion settings.`;
    }
  }
  return `<details class="mode-presentation" data-mode-presentation="${mode}" data-presentation-location="${location}">
    <summary><span>Presentation</span><span class="mode-presentation-current" data-mode-presentation-summary></span></summary>
    <div class="mode-presentation-panel">
      ${rows}
      <p class="mode-presentation-help" id="${id}-help">${help}</p>
      ${mode === "typing" ? `<p class="mode-presentation-note" data-mode-live-note></p>
      <div class="mode-presentation-preview" data-mode-preview aria-label="Typing HUD preview, sample values, not live results">
        <span class="mode-preview-caption">PREVIEW · SAMPLE VALUES</span>
        <div class="mode-preview-hud"><span data-preview-live>82 WPM</span><strong>30</strong><span data-preview-live>98% ACC</span>
          <span data-preview-data>24 WORDS · 2 ERRORS</span></div>
        <p>precision creates consistency</p>
      </div>${location === "ready" ? '<p class="mode-presentation-help">Text size and timer position remain beside the test controls. Start typing in the passage to begin.</p>' : ""}` : ""}
      <p class="mode-presentation-status" role="status" aria-live="polite" aria-atomic="true" data-mode-presentation-status></p>
    </div>
  </details>`;
}

function screenMode(screen) {
  if (screen?.matches(".speed-test-screen")) return "typing";
  if (screen?.matches(".boss-screen")) return "boss";
  if (screen?.matches(".arcade-rush-ui")) return "arcade-rush";
  if (screen?.matches(".endless-screen, .endless-ready-screen")) return "endless";
  if (screen?.matches(".campaign-progress-screen, .game-screen")) return "campaign";
  return null;
}

let stopCurrent = null;
export function startModeCustomizationPresentation({ getSave, onTypingPreferences, root = document.querySelector("#app") } = {}) {
  stopCurrent?.();
  if (!root || typeof getSave !== "function") return () => {};
  const doc = root.ownerDocument;
  const media = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  let screen = null;
  let screenObserver = null;
  let stopped = false;

  function refreshControls() {
    if (!screen?.isConnected) return;
    const value = normalizeCustomization(getSave()?.settings);
    const typing = resolveTypingPresentation(getSave()?.settings);
    screen.querySelectorAll("[data-mode-presentation]").forEach((details) => {
      details.querySelectorAll("[data-mode-setting]").forEach((select) => {
        const field = select.dataset.modeSetting;
        const next = field === "typingTest.passageWidth"
          ? typing.passageWidth
          : field.startsWith("typingTest.")
            ? value.typingTest[field.split(".")[1]]
            : value[field];
        if (select.value !== String(next)) select.value = String(next);
        select.disabled = field === "typingTest.liveStats" && typing.hudLayout === "focus";
        select.setAttribute("aria-describedby", details.querySelector(".mode-presentation-help").id);
      });
      const mode = details.dataset.modePresentation;
      const label = mode === "typing" ? TYPING_HUD_LAYOUTS.find((item) => item.value === typing.hudLayout).label
        : ["campaign", "endless"].includes(mode) ? GAMEPLAY_HUD_LAYOUTS.find((item) => item.value === value.gameplayHud).label
          : ACTION_INTENSITIES.find((item) => item.value === value.actionModeIntensity).label;
      text(details.querySelector("[data-mode-presentation-summary]"), label);
      text(details.querySelector("[data-mode-live-note]"), typing.hudLayout === "focus"
        ? `Focus hides live statistics. Your saved ${typing.liveStats ? "On" : "Off"} choice is kept for other layouts.`
        : "Live statistics affect only the in-test HUD. Full results are always shown afterward.");
      const preview = details.querySelector("[data-mode-preview]");
      attribute(preview, "data-layout", typing.hudLayout);
      attribute(preview, "data-live", typing.showLiveStats);
      attribute(preview, "data-size", typing.textSize);
      attribute(preview, "data-width", typing.passageWidth);
    });
  }

  function apply() {
    if (stopped || !screen?.isConnected || screen.matches(".practice-lab-screen")) return;
    const settings = getSave()?.settings;
    const value = normalizeCustomization(settings);
    const mode = screenMode(screen);
    if (!mode) return;
    if (mode === "typing") {
      const typing = resolveTypingPresentation(settings);
      attribute(screen, "data-typing-hud", typing.hudLayout);
      attribute(screen, "data-live-stats", typing.showLiveStats);
      attribute(screen, "data-speed-passage-width", typing.passageWidth);
      onTypingPreferences?.(typing);
    }
    if (["campaign", "endless"].includes(mode)) attribute(screen, "data-gameplay-hud", value.gameplayHud);
    if (["boss", "arcade-rush"].includes(mode)) {
      attribute(screen, "data-action-intensity", value.actionModeIntensity);
      attribute(screen, "data-effective-effects", resolveModeEffectsIntensity(settings, mode, media?.matches));
    }
    refreshControls();
  }

  function insert(host, mode, location, before = null) {
    if (!host || host.querySelector(`:scope > [data-mode-presentation]`)) return;
    const template = doc.createElement("template");
    template.innerHTML = modePresentationMarkup(mode, location);
    host.insertBefore(template.content, before);
  }

  function mountPause() {
    if (!screen?.isConnected) return;
    const mode = screenMode(screen);
    const panel = screen.querySelector(".pause-overlay .pause-panel, [data-rush-role='pause-overlay'] .arcade-rush-overlay-card");
    if (panel && mode) insert(panel, mode, "pause", panel.querySelector(".menu-list, .arcade-rush-actions"));
    refreshControls();
  }

  function mount() {
    if (stopped) return;
    screenObserver?.disconnect();
    screen = root.querySelector(":scope > .screen");
    if (!screen || screen.matches(".practice-lab-screen")) return;
    const mode = screenMode(screen);
    if (mode === "typing") {
      const host = screen.querySelector(".speed-test-topbar-secondary");
      insert(host, mode, "ready", host?.querySelector(".speed-test-hud"));
    }
    if (screen.matches(".campaign-progress-screen")) insert(screen.querySelector(".campaign-progress-tools"), mode, "ready");
    if (screen.matches(".endless-ready-screen")) {
      const host = screen.querySelector(".endless-ready-panel");
      insert(host, mode, "ready", host?.querySelector('[data-action="endless-start"]'));
    }
    if (screen.matches('[data-rush-view="ready"]')) insert(screen.querySelector(".arcade-rush-ready-card"), mode, "ready");
    // Pausing does not replace the route. Watch direct overlay insertion only.
    screenObserver = new MutationObserver(mountPause);
    screenObserver.observe(screen, { childList: true });
    // Rush's pause card already exists in its shell. Mount it once now; observing
    // its hidden attribute would wake this controller on every Rush HUD update.
    mountPause();
    apply();
  }

  function onChange(event) {
    if (!screen?.isConnected || screen.matches(".practice-lab-screen")) return;
    const select = event.target.closest?.("[data-mode-setting]");
    if (!select) {
      // The existing Typing Test size control remains the single visible size selector.
      if (event.target.matches?.("select[data-speed-font-size]")) refreshControls();
      return;
    }
    const details = select.closest("[data-mode-presentation]");
    if (!details || !screen.contains(details)) return;
    const field = select.dataset.modeSetting;
    const value = field === "typingTest.liveStats" ? select.value === "true" : select.value;
    const result = updateModeCustomizationSetting(getSave(), field, value);
    text(details.querySelector("[data-mode-presentation-status]"), result.persisted
      ? "Saved on this browser. Scores and gameplay rules are unchanged."
      : "Applied for this visit. Browser storage is unavailable, so this preference could not be saved.");
  }

  function openTypingReadyPopover() {
    if (!screen?.matches?.(".speed-test-screen")) return null;
    return screen.querySelector(
      '[data-mode-presentation="typing"][data-presentation-location="ready"][open]',
    );
  }

  function onPointerDown(event) {
    const details = openTypingReadyPopover();
    if (details && !details.contains(event.target)) details.removeAttribute("open");
  }

  function onKeydown(event) {
    if (event.key !== "Escape") return;
    const open = openTypingReadyPopover();
    if (!open) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    open.removeAttribute("open");
    open.querySelector("summary")?.focus?.({ preventScroll: true });
  }

  root.addEventListener("change", onChange);
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("keydown", onKeydown);
  doc.addEventListener("wordstrike:settings-changed", apply);
  media?.addEventListener?.("change", apply);
  const routeObserver = new MutationObserver(mount);
  routeObserver.observe(root, { childList: true });
  mount();
  const stop = () => {
    stopped = true;
    routeObserver.disconnect();
    screenObserver?.disconnect();
    root.removeEventListener("change", onChange);
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("keydown", onKeydown);
    doc.removeEventListener("wordstrike:settings-changed", apply);
    media?.removeEventListener?.("change", apply);
    root.querySelectorAll("[data-mode-presentation]").forEach((details) => details.remove());
    if (stopCurrent === stop) stopCurrent = null;
  };
  stopCurrent = stop;
  return stop;
}
