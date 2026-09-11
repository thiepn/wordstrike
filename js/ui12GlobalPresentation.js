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
  const next = String(enabled);
  if (document.body?.getAttribute("data-ui12-audio-enabled") !== next) {
    document.body.setAttribute("data-ui12-audio-enabled", next);
  }
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
      data-ui12-sound-toggle role="switch" aria-checked="${enabled}" aria-label="Interface sound effects">${enabled ? "ON" : "OFF"}</button>
  </section>`;
}

function updateAudioSetting(section, enabled) {
  const button = section?.querySelector("[data-ui12-sound-toggle]");
  if (!button) return;
  button.classList.toggle("on", enabled);
  const checked = String(enabled);
  if (button.getAttribute("aria-checked") !== checked) button.setAttribute("aria-checked", checked);
  const nextLabel = enabled ? "ON" : "OFF";
  if (button.textContent !== nextLabel) button.textContent = nextLabel;
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
      const bodyValue = String(next);
      if (document.body?.getAttribute("data-ui12-audio-enabled") !== bodyValue) {
        document.body.setAttribute("data-ui12-audio-enabled", bodyValue);
      }
      updateAudioSetting(section, next);
      if (next) playUiAudio("toggle");
    });
  }

  const hint = screen.querySelector(".settings-panel > .footer-hint");
  const hintCopy = "↑ ↓ CORE SETTINGS · ENTER TOGGLE · TAB ALL CONTROLS · ESC BACK";
  if (hint && hint.textContent !== hintCopy) hint.textContent = hintCopy;
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
  if (event.repeat || isPracticeTarget(event.target)) return;
  if (event.target?.matches?.("input, textarea, select, [contenteditable=true], .gameplay-input")) return;
  if (!audibleKeyboardSurface() || !syncAudioPreference()) return;

  if (["Enter", " "].includes(event.key) && event.target?.closest?.("button, a[href], [role=button], [role=tab], [role=switch]")) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) playUiAudio("navigate");
  else if (event.key === "Escape") playUiAudio("back");
  else if (event.key === "Enter") playUiAudio("activate");
}

export function syncUi12GlobalPresentation() {
  const root = appRoot();
  if (!root) return false;
  const currentScreen = root.querySelector(":scope > .screen");
  if (currentScreen && !currentScreen.classList.contains("practice-lab-screen")) {
    if (currentScreen.dataset.ui12Polished !== "true") currentScreen.dataset.ui12Polished = "true";
  }
  enhanceSettings(root.querySelector(".settings-screen"));
  syncAudioPreference();
  return true;
}

document.addEventListener("click", handleClick, false);
document.addEventListener("keydown", handleKeydown, false);
