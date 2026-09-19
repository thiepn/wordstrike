import { renderPracticeLabV30 } from "./practiceLabRendererV30.js";
import { PRACTICE_CUSTOM_TEXT_TIMED_DURATIONS_MS, PRACTICE_CUSTOM_TEXT_MIN_GRAPHEMES, requiredPracticeCustomTextTimedGraphemes } from "./practiceCustomTextConstants.js";

const minutes = (ms) => Math.round(ms / 60_000);
const modes = Object.freeze({
  "full-text": { title: "Full text", description: "Work through the entire passage." },
  selection: { title: "Selection", description: "Practice only the part you highlight." },
  timed: { title: "Timed", description: "Type steadily for a fixed duration." },
});
const messages = Object.freeze({
  CUSTOM_TEXT_EMPTY: "Paste or import a passage to begin. Use at least 20 characters.",
  CUSTOM_TEXT_TOO_SHORT: "Add more text. Your practice passage needs at least 20 characters.",
  CUSTOM_TEXT_TOO_LARGE: "This passage is too large. Keep it under 100,000 characters and 256 KB.",
  CUSTOM_TEXT_STORAGE_LIMIT: "Your local text library is full. Export and remove an unneeded saved text before saving another.",
  CUSTOM_TEXT_INVALID_CONTROL_CHARACTER: "This text contains an unsupported control character. Paste a plain-text version instead.",
  CUSTOM_TEXT_UNSUPPORTED_GRAPHEME: "This text contains an unsupported character sequence. Remove it or import a UTF-8 plain-text file.",
  CUSTOM_TEXT_LOCALE_MISMATCH: "This saved text uses a different Practice language. Use the language-rebind action before starting.",
  CUSTOM_TEXT_INVALID_ENCODING: "This file is not valid UTF-8. Save it as a UTF-8 .txt file and import it again.",
  CUSTOM_TEXT_TIMED_CAPACITY: "Add a longer passage, choose a shorter available duration, or switch to Full text. Timed practice does not loop the passage.",
  CUSTOM_TEXT_NOT_FOUND: "This saved text is no longer available. Reopen another text or paste a new passage.",
  CUSTOM_TEXT_REVISION_MISMATCH: "The saved text changed in another tab. Reopen it before starting.",
  CUSTOM_TEXT_CONFLICT: "This text changed in another tab. Export your draft before reopening the saved version.",
  CUSTOM_TEXT_HASH_MISMATCH: "The saved text could not be verified. Reopen it or paste a new copy.",
  CUSTOM_TEXT_UNAVAILABLE: "The local text workspace could not load. Return to Practice Lab and try again.",
  CUSTOM_TEXT_SAVE_FAILED: "The text could not be saved. Your draft is still here; export a copy or try saving again.",
  CUSTOM_TEXT_LOAD_FAILED: "The saved text could not be opened. Try again or import a copy.",
  CUSTOM_TEXT_DELETE_FAILED: "The text could not be deleted. Try again.",
  CUSTOM_TEXT_IMPORT_FAILED: "The file could not be imported. Choose a UTF-8 .txt file and try again.",
  CUSTOM_TEXT_EXPORT_FAILED: "The text could not be exported. Copy your passage or try again.",
  CUSTOM_TEXT_REBIND_FAILED: "The text's language could not be updated. Reopen it and try again.",
});

/** Presentation copy and readiness mirror the existing validation/capacity rules. */
export function practiceCustomEditorFeedback(view) {
  const code = view.errorCode ?? view.validationErrorCode;
  const blocked = Boolean(view.validationErrorCode || view.localeMismatch || !["ready", "editing"].includes(view.status) ||
    (view.sessionMode === "timed" && !view.timedAvailability?.some(row => row.durationMs === view.timedDurationMs && row.available)));
  if (code) {
    const message = view.errorCode === "CUSTOM_TEXT_TOO_SHORT" && view.sessionMode === "selection"
      ? "Highlight at least 20 characters in the editor, then try starting again."
      : Object.hasOwn(messages, code) ? messages[code] : "This action could not be completed. Check the passage and try again.";
    // An operation error explains a failed attempt; it must not lock out a valid retry.
    return { state: view.errorCode ? "error" : "waiting", message, blocked };
  }
  if (view.localeMismatch) return { state: "waiting", message: messages.CUSTOM_TEXT_LOCALE_MISMATCH, blocked: true };
  if (!["ready", "editing"].includes(view.status)) return { state: "waiting", message: view.status === "unavailable" ? messages.CUSTOM_TEXT_UNAVAILABLE : "Preparing your local workspace…", blocked: true };
  if (view.sessionMode === "timed" && !view.timedAvailability?.some(row => row.durationMs === view.timedDurationMs && row.available)) {
    const required = requiredPracticeCustomTextTimedGraphemes(view.timedDurationMs);
    const target = Number.isFinite(required) ? `at least ${required.toLocaleString("en")} practice characters` : "a longer passage";
    return { state: "waiting", message: `This duration needs ${target}. Choose an available duration or Full text. The passage will not repeat.`, blocked: true };
  }
  return { state: "ready", message: view.sessionMode === "selection" ? `Highlight at least ${PRACTICE_CUSTOM_TEXT_MIN_GRAPHEMES} characters in the passage, then start.` : "Ready to practice. Saving your passage is optional.", blocked: false };
}

/** Patch feedback only: never replace the editor, change its selection, or save text. */
export function updatePracticeCustomEditorUi(root, view) {
  const feedback = practiceCustomEditorFeedback(view);
  const count = root.querySelector?.("[data-custom-text-count]");
  if (count) count.textContent = `${Number(view.sourceGraphemeCount ?? 0).toLocaleString("en")} characters · ${view.contextDataLocale ?? "—"}`;
  const dirty = root.querySelector?.("[data-custom-text-dirty]");
  if (dirty) dirty.textContent = view.dirty ? "Unsaved changes" : (view.editor?.customTextId ? "Saved on this device" : "Not saved");
  const status = root.querySelector?.("[data-custom-text-error]");
  if (status) {
    status.textContent = feedback.message;
    status.setAttribute?.("data-state", feedback.state);
    status.setAttribute?.("role", feedback.state === "error" ? "alert" : "status");
  }
  const start = root.querySelector?.("[data-practice-action='custom-start']");
  if (start) start.disabled = Boolean(view.starting || feedback.blocked);
}

export function renderPracticeCustomTextDetail(root, view, { focusSelector = null } = {}) {
  const startDisabled = Boolean(view.starting || practiceCustomEditorFeedback(view).blocked);
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="custom-text-detail"><div class="practice-lab-shell">
    <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">LOCAL ONLY</span></header>
    <main class="practice-lab-detail practice-custom-text-detail"><div class="eyebrow">Custom · user-selected material</div><h1>Custom Text</h1>
    <p class="practice-lab-lead">Bring a passage worth practicing. Set your session, then make it flow.</p>
    <div class="practice-lab-notice pl-custom-privacy"><strong>Local practice. No leaderboard.</strong><span>Pasting and importing never save automatically. Only an explicit Save writes source text to this device. Custom Text is excluded from PBs, standardized ability, transfer, benchmark, mastery, retention, and corpus statistics.</span></div>
    <div class="practice-custom-workspace">
      <section class="practice-custom-editor" aria-labelledby="pl-custom-editor-title">
        <header class="pl-custom-section-heading"><div><div class="eyebrow">01 / Your material</div><h2 id="pl-custom-editor-title">The passage</h2></div><button type="button" data-practice-action="custom-import">IMPORT .TXT</button><input type="file" accept=".txt,text/plain" data-custom-text-file hidden></header>
        <label>Title <span class="pl-field-optional">Optional</span><input type="text" maxlength="120" data-custom-text-title placeholder="Give this passage a name"></label>
        <label>Text<textarea data-custom-text-source rows="10" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" aria-describedby="pl-custom-source-help pl-custom-feedback" placeholder="Paste a passage, a page of notes, or an excerpt you want to practice…"></textarea></label>
        <div class="practice-custom-editor-meta"><span data-custom-text-count></span><span data-custom-text-dirty></span></div>
        <p id="pl-custom-source-help" class="pl-custom-hint">Plain text · At least 20 characters · Line breaks are supported</p>
        ${view.localeMismatch ? `<div class="practice-lab-notice is-warning">This saved text uses a different Practice locale. Rebind explicitly before practicing it in the active locale. <button type="button" data-practice-action="custom-rebind">REBIND TO CURRENT LOCALE</button></div>` : ""}
        <footer class="practice-custom-toolbar"><button type="button" data-practice-action="custom-save" ${view.saving || !view.dirty || view.localeMismatch ? "disabled" : ""}>${view.saving ? "SAVING…" : "SAVE LOCALLY"}</button><button type="button" data-practice-action="custom-export">EXPORT .TXT</button><button type="button" class="pl-custom-delete" data-practice-action="custom-delete" ${view.editor.customTextId ? "" : "disabled"}>DELETE</button></footer>
      </section>
      <aside class="pl-custom-sidebar" aria-label="Session settings and saved texts">
        <section class="pl-custom-configuration" aria-labelledby="pl-custom-session-title"><div class="eyebrow">02 / Your session</div><h2 id="pl-custom-session-title">Make it yours</h2>
          <fieldset class="pl-custom-modes"><legend>Practice mode</legend><div class="practice-lab-duration-grid">${Object.entries(modes).map(([mode, info]) => `<button type="button" data-practice-action="custom-mode" data-custom-mode="${mode}" aria-pressed="${view.sessionMode === mode}"><strong>${info.title}</strong><span>${info.description}</span></button>`).join("")}</div></fieldset>
          <p data-custom-selection-note class="pl-custom-hint" ${view.sessionMode === "selection" ? "" : "hidden"}>Highlight the part you want in the editor. Only that range will be practiced.</p>
          <fieldset data-custom-timed-options ${view.sessionMode === "timed" ? "" : "hidden"}><legend>Timed duration</legend><div class="practice-lab-duration-grid">${PRACTICE_CUSTOM_TEXT_TIMED_DURATIONS_MS.map(durationMs => `<button type="button" data-practice-action="custom-duration" data-duration-ms="${durationMs}" aria-pressed="${view.timedDurationMs === durationMs}" ${view.timedAvailability?.some(row => row.durationMs === durationMs && row.available) ? "" : "disabled"}>${minutes(durationMs)} min</button>`).join("")}</div></fieldset>
          <p id="pl-custom-feedback" data-custom-text-error role="status" aria-atomic="true"></p>
          <button type="button" class="practice-lab-primary-action" data-practice-action="custom-start" ${startDisabled ? "disabled" : ""}>${view.starting ? "STARTING…" : "START CUSTOM PRACTICE"}</button>
        </section>
        <section class="practice-custom-library" aria-labelledby="pl-custom-library-title"><div class="practice-custom-library-head"><h2 id="pl-custom-library-title">Saved texts</h2><button type="button" data-practice-action="custom-new">NEW</button></div><div data-custom-text-library></div></section>
      </aside>
    </div></main></div></section>`;
  const title = root.querySelector?.("[data-custom-text-title]");
  const source = root.querySelector?.("[data-custom-text-source]");
  if (title) title.value = view.editor.title ?? "";
  if (source) source.value = view.editor.sourceText ?? "";
  updatePracticeCustomEditorUi(root, view);
  const library = root.querySelector?.("[data-custom-text-library]");
  const document = library?.ownerDocument;
  if (library && document?.createElement) {
    if (!view.texts?.length) {
      const empty = document.createElement("p"); empty.className = "pl-custom-hint";
      empty.textContent = "Your saved passages will appear here. You can practice without saving."; library.append(empty);
    }
    for (const item of view.texts ?? []) {
      const button = document.createElement("button"); button.type = "button"; button.className = "practice-custom-library-item";
      button.dataset.practiceAction = "custom-open"; button.dataset.customTextId = item.customTextId;
      if (item.customTextId === view.editor.customTextId) button.setAttribute("aria-current", "true");
      const strong = document.createElement("strong"); strong.textContent = item.title;
      const meta = document.createElement("span"); meta.textContent = `${item.sourceGraphemeCount} characters${item.lastPractisedAt ? " · practiced" : ""}`;
      button.append(strong, meta); library.append(button);
    }
  }
  (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-custom-text-source]") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
  return true;
}

export function renderPracticeLabV31(root, view, options = {}) {
  if (view?.kind === "custom-text-detail") return renderPracticeCustomTextDetail(root, view, options);
  return renderPracticeLabV30(root, view, options);
}
