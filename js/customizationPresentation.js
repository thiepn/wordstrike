/** P1 Settings UI and palette lifecycle. The save remains the source of truth. */
import { ACCENTS, THEMES, EFFECTS, normalizeCustomization, resolveEffectsIntensity } from "./customization.js";
import { updateCustomizationSetting, resetAppearance } from "./storage.js";

const attribute = (node, name, value) => {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
};
const text = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
const options = (items, value) => items.map((item) =>
  `<option value="${item.value}"${item.value === value ? " selected" : ""}>${item.label}</option>`).join("");

export function appearanceSettingsMarkup(settings) {
  const value = normalizeCustomization(settings);
  return `<section class="appearance-settings" aria-labelledby="appearance-heading" data-customization-settings>
    <header class="appearance-heading"><div><span class="micro-label">APPEARANCE</span>
      <h2 id="appearance-heading">Make it yours</h2></div>
      <button type="button" class="text-action appearance-reset" data-reset-appearance>Reset appearance</button>
    </header>
    <div class="appearance-row"><label for="appearance-theme">Theme</label>
      <select id="appearance-theme" data-appearance-setting="theme" aria-describedby="appearance-theme-help">${options(THEMES, value.theme)}</select>
      <p id="appearance-theme-help" data-theme-description></p></div>
    <div class="appearance-row"><label for="appearance-accent">Accent</label>
      <select id="appearance-accent" data-appearance-setting="accent" aria-describedby="appearance-accent-help">${options(ACCENTS, value.accent)}</select>
      <p id="appearance-accent-help">Changes player highlights, not errors, warnings, grades, or boss states.</p></div>
    <div class="appearance-row"><label for="appearance-effects">Interface effects</label>
      <select id="appearance-effects" data-appearance-setting="effectsIntensity" aria-describedby="appearance-effects-help appearance-motion-note">${options(EFFECTS, value.effectsIntensity)}</select>
      <p id="appearance-effects-help" data-effects-description></p></div>
    <div class="appearance-preview" aria-label="Live appearance preview">
      <span class="appearance-preview-marker" aria-hidden="true"></span>
      <div><strong data-appearance-summary></strong><span>Changes apply immediately. Gameplay stays the same.</span></div>
      <span class="appearance-preview-state">ACTIVE</span>
    </div>
    <p class="appearance-note" id="appearance-motion-note">System reduced motion takes priority. Disabled particles and screen shake stay disabled.</p>
    <p class="appearance-status" role="status" aria-live="polite" aria-atomic="true" data-appearance-status></p>
  </section>`;
}

let stopCurrent = null;
export function startCustomizationPresentation({ getSave, root = document.querySelector("#app") } = {}) {
  stopCurrent?.();
  if (!root || typeof getSave !== "function") return () => {};
  const doc = root.ownerDocument;
  const html = doc.documentElement;
  const media = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  let stopped = false;
  let settingsSection = null;

  function refreshControls() {
    if (!settingsSection?.isConnected) return;
    const value = normalizeCustomization(getSave()?.settings);
    settingsSection.querySelectorAll("[data-appearance-setting]").forEach((select) => {
      const next = value[select.dataset.appearanceSetting];
      if (select.value !== next) select.value = next;
    });
    const theme = THEMES.find((item) => item.value === value.theme);
    const accent = ACCENTS.find((item) => item.value === value.accent);
    text(settingsSection.querySelector("[data-theme-description]"), theme.description);
    text(settingsSection.querySelector("[data-effects-description]"), EFFECTS.find((item) => item.value === value.effectsIntensity).description);
    text(settingsSection.querySelector("[data-appearance-summary]"), `${theme.label} / ${accent.label}`);
    text(settingsSection.querySelector("#appearance-motion-note"), media?.matches
      ? "System reduced motion is active. Your effects choice is saved; motion stays reduced."
      : "System reduced motion takes priority. Disabled particles and screen shake stay disabled.");
  }

  function apply() {
    if (stopped) return;
    const screen = root.querySelector(":scope > .screen");
    const active = !screen?.classList.contains("practice-lab-screen");
    const value = normalizeCustomization(getSave()?.settings);
    for (const host of [html, doc.body]) {
      attribute(host, "data-customization-active", String(active));
      attribute(host, "data-theme", value.theme);
      attribute(host, "data-accent", value.accent);
      attribute(host, "data-effects", value.effectsIntensity);
      attribute(host, "data-effective-effects", active ? resolveEffectsIntensity(value, media?.matches) : "standard");
    }
    const theme = THEMES.find((item) => item.value === (active ? value.theme : "wordstrike"));
    attribute(doc.querySelector('meta[name="theme-color"]'), "content", theme.background);
    refreshControls();
  }

  function announce(result, message) {
    text(settingsSection?.querySelector("[data-appearance-status]"), result.persisted
      ? message : "Applied for this visit. Browser storage is unavailable, so this preference could not be saved.");
  }

  function onChange(event) {
    const select = event.target.closest?.("[data-appearance-setting]");
    if (!select) return;
    const result = updateCustomizationSetting(getSave(), select.dataset.appearanceSetting, select.value);
    apply();
    announce(result, `${select.selectedOptions[0].textContent} selected. Saved on this browser.`);
  }
  function onClick(event) {
    if (!event.target.closest?.("[data-reset-appearance]")) return;
    const result = resetAppearance(getSave());
    apply();
    announce(result, "Appearance restored to WordStrike, Cyan, and Standard. Progress and other settings were kept.");
  }

  function mount() {
    if (stopped) return;
    apply();
    const panel = root.querySelector(".settings-screen .settings-panel");
    if (!panel) { settingsSection = null; return; }
    settingsSection = panel.querySelector("[data-customization-settings]");
    if (!settingsSection) {
      panel.querySelector(":scope > h1")?.insertAdjacentHTML("afterend", appearanceSettingsMarkup(getSave()?.settings));
      settingsSection = panel.querySelector("[data-customization-settings]");
    }
    refreshControls();
  }

  // Observe route replacement only, never character-level gameplay mutations.
  root.addEventListener("change", onChange);
  root.addEventListener("click", onClick);
  const observer = new MutationObserver(mount);
  observer.observe(root, { childList: true });
  media?.addEventListener?.("change", apply);
  doc.addEventListener("wordstrike:settings-changed", apply);
  mount();
  const stop = () => {
    stopped = true;
    observer.disconnect();
    media?.removeEventListener?.("change", apply);
    doc.removeEventListener("wordstrike:settings-changed", apply);
    root.removeEventListener("change", onChange);
    root.removeEventListener("click", onClick);
    if (stopCurrent === stop) stopCurrent = null;
  };
  stopCurrent = stop;
  return stop;
}
