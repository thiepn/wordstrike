/* UI12 — final motion, audio, and global consistency presentation.
   Gameplay engines, scoring, routing, auth, leaderboards, and Practice Lab remain authoritative. */

import { appState } from "./state.js";
import { updateSetting } from "./storage.js";
import { playUiAudio, setUiAudioEnabled } from "./uiAudio.js";

const appRoot = () => document.querySelector("#app");

function soundEnabled() {
  return appState.save?.settings?.soundEffects === true;
}

function syncAudioPreference() {
  const enabled = soundEnabled();
  setUiAudioEnabled(enabled);
  document.body?.setAttribute("data-ui12-audio-enabled", String(enabled));
  return enabled;
}

function audioSettingMarkup(enabled) {
  return `<section class="ui12-audio-setting" aria-labelledby="ui12-audio-setting-heading">
    <div class="ui12-audio-copy">
      <span class="ui12-section-label">AUDIO</span>
      <h2 id="ui12-audio-setting-heading">Interface sound effects</h2>
      <p>Short confirmation tones for navigation and controls. Typing itself stays silent.</p>
    </div>
    <button type="button" class="ui12-sound-toggle ${enabled ? "on" : ""}"
      data-ui12-sound-toggle role="switch" aria-checked="${enabled}" aria-label="Interface sound effects">
      <span aria-hidden="true" class="ui12-sound-toggle-track"><i></i></span>
      <strong>${enabled ? "ON" : "OFF"}</strong>
    </button>
  </section>`;
}

function updateAudioSetting(section, enabled) {
  const button = section?.querySelector("[data-ui12-sound-toggle]");
  if (!button) return;
  button.classList.toggle("on", enabled);
  button.setAttribute("aria-checked", String(enabled));
  const label = button.querySelector("strong");
  if (label) label.textContent = enabled ? "ON" : "OFF";
}

function enhanceSettings(screen) {
  if (!screen) return;
  const panel = screen.querySelector(".settings-panel");
  const list = screen.querySelector(".settings-list");
  if (!panel || !list) return;

  let section = screen.querySelector(".ui12-audio-setting");
  const enabled = syncAudioPreference();
  if (!section) {
    list.insertAdjacentHTML("beforebegin", audioSettingMarkup(enabled));
    section = screen.querySelector(".ui12-audio-setting");
  } else {
    updateAudioSetting(section, enabled);
  }

  const button = section?.querySelector("[data-ui12-sound-toggle]");
  if (button && button.dataset.ui12Wired !== "true") {
    button.dataset.ui12Wired = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const previous = soundEnabled();
      if (previous) playUiAudio("toggle");
      const next = !previous;
      updateSetting(appState.save, "soundEffects", next);
      setUiAudioEnabled(next);
      document.body?.setAttribute("data-ui12-audio-enabled", String(next));
      updateAudioSetting(section, next);
      if (next) playUiAudio("toggle");
    });
  }

  const hint = screen.querySelector(".settings-panel > .footer-hint");
  if (hint) hint.textContent = "↑ ↓ CORE SETTINGS · ENTER TOGGLE · TAB ALL CONTROLS · ESC BACK";
}

function isPracticeTarget(target) {
  return target?.closest?.(".practice-lab-screen") != null;
}

function isUnavailable(control) {
  return control.matches?.(":disabled, [aria-disabled=\"true\"]") === true;
}

function classifyControl(control) {
  if (
    control.matches?.(".danger, [data-action=reset], [data-tutorial-reset=all]")
    || control.closest?.(".pending-result-notice[data-pending-result-status=failed]")
  ) return "danger";
  if (control.matches?.(".screen-back-button, [data-action=back], [data-stats-action=back]")) return "back";
  if (control.matches?.(".toggle, [role=switch]")) return "toggle";
  if (control.matches?.(".primary, .account-primary, .title-start-button")) return "activate";
  return "navigate";
}

function audibleKeyboardSurface() {
  return document.querySelector(`
    .title-screen,
    .mode-select-screen,
    .level-screen,
    .results-screen,
    .speed-results-screen,
    .endless-results-screen,
    .arcade-rush-results,
    .profile-stats-screen,
    .leaderboards-screen,
    .settings-screen,
    .pause-overlay
  `);
}

function handleClick(event) {
  const control = event.target?.closest?.("button, a[href], [role=button], [role=tab], [role=switch]");
  if (!control || isPracticeTarget(control) || isUnavailable(control) || control.matches("[data-ui12-sound-toggle]")) return;
  if (!syncAudioPreference()) return;
  playUiAudio(classifyControl(control));
}

function handleKeydown(event) {
  if (event.repeat || event.defaultPrevented || isPracticeTarget(event.target)) return;
  if (event.target?.matches?.("input, textarea, select, [contenteditable=true], .gameplay-input")) return;
  if (!audibleKeyboardSurface() || !syncAudioPreference()) return;

  // Native buttons emit click for Enter/Space and are handled by the click path.
  if (["Enter", " "].includes(event.key) && event.target?.closest?.("button, a[href], [role=button], [role=tab], [role=switch]")) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) playUiAudio("navigate");
  else if (event.key === "Escape") playUiAudio("back");
  else if (event.key === "Enter") playUiAudio("activate");
}

function enhance() {
  const root = appRoot();
  if (!root) return;
  const currentScreen = root.querySelector(":scope > .screen");
  if (currentScreen && !currentScreen.classList.contains("practice-lab-screen")) {
    currentScreen.dataset.ui12Polished = "true";
  }
  enhanceSettings(root.querySelector(".settings-screen"));
  syncAudioPreference();
}

let enhancementQueued = false;
function queueEnhancement() {
  if (enhancementQueued) return;
  enhancementQueued = true;
  queueMicrotask(() => {
    enhancementQueued = false;
    enhance();
  });
}

document.addEventListener("click", handleClick, false);
document.addEventListener("keydown", handleKeydown, false);

const observer = new MutationObserver(queueEnhancement);
const root = appRoot();
if (root) observer.observe(root, { childList: true, subtree: true });
enhance();
