import { renderPracticeLabV29 } from "./practiceLabRendererV29.js";
import { PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS } from "./practicePunctuationCapitalsConstants.js";
import { PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS } from "./practiceNumbersSymbolsConstants.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const minutes = (ms) => Math.round(ms / 60_000);
const durationButtons = (values, selected, action, enabledValues = values) => values.map((value) => `<button type="button" data-practice-action="${action}" data-duration-ms="${value}" aria-pressed="${selected === value ? "true" : "false"}" ${enabledValues.includes?.(value) ? "" : "disabled"}>${minutes(value)} min</button>`).join("");

export function renderPracticePunctuationCapitalsDetail(root, view, { focusSelector = null } = {}) {
  const practiceAvailable = view.availability?.practiceAvailable === true && !view.starting;
  const checkAvailable = view.availability?.checkAvailable === true && !view.starting;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="punctuation-capitals-detail"><div class="practice-lab-shell">
    <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">DEVELOPER PREVIEW</span></header>
    <main class="practice-lab-detail">
      <div class="eyebrow">Real-world · sentence mechanics</div><h1>Punctuation & Capitals</h1>
      <p class="practice-lab-lead">Practice reliable capitalization, sentence punctuation, quotes, separators, and punctuation boundaries in realistic typing contexts.</p>
      <section class="practice-lab-empty-state"><h2>Practice</h2><p>Practice capitalization and common punctuation across varied text without prescribing a particular Shift-key technique.</p>
        <fieldset><legend>Duration</legend><div class="practice-lab-duration-grid">${durationButtons(PRACTICE_PUNCTUATION_CAPITALS_PRACTICE_DURATIONS_MS, view.durationMs, "punctuation-capitals-duration", view.availability?.practiceDurationsMs ?? [])}</div></fieldset>
        <div class="practice-lab-notice">Training is balanced and target-blind. Live WPM and aggregate accuracy are hidden, and Practice does not update punctuation ability.</div>
        <button type="button" class="practice-lab-primary-action" data-practice-action="start-punctuation-capitals-practice" ${practiceAvailable ? "" : "disabled"}>${view.starting === "practice" ? "STARTING…" : `START ${minutes(view.durationMs)}-MIN PRACTICE`}</button>
      </section>
      <section class="practice-lab-empty-state"><div class="eyebrow">Standardized · ~3–6 min</div><h2>Punctuation & Capitals Check</h2>
        <p>The Check uses a fixed punctuation-rich form. It does not adapt its punctuation mix to your current weaknesses.</p>
        <div class="practice-lab-notice">The protocol scores expected textual output. Correct uppercase remains correct whether it came from Shift, Caps Lock, a software keyboard, accessibility input, or another valid input route.</div>
        <button type="button" class="practice-lab-primary-action" data-practice-action="start-punctuation-capitals-check" ${checkAvailable ? "" : "disabled"}>${view.starting === "check" ? "STARTING…" : "START STANDARDIZED CHECK"}</button>
      </section>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}
    </main></div></section>`;
  (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-punctuation-capitals-practice']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
  return true;
}

export function renderPracticeNumbersSymbolsDetail(root, view, { focusSelector = null } = {}) {
  const practiceAvailable = view.availability?.practiceAvailable === true && !view.starting;
  const checkAvailable = view.availability?.checkAvailable === true && !view.starting;
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="numbers-symbols-detail"><div class="practice-lab-shell">
    <header class="practice-lab-header"><button type="button" class="practice-lab-back" data-practice-action="back">← Back to Practice Lab</button><span class="practice-lab-status is-preview">DEVELOPER PREVIEW</span></header>
    <main class="practice-lab-detail">
      <div class="eyebrow">Real-world · practical transcription</div><h1>Numbers & Symbols</h1>
      <p class="practice-lab-lead">Practice digits and common practical symbols in structured text without assuming one keyboard layout or physical key technique.</p>
      <section class="practice-lab-empty-state"><h2>Practice</h2><p>Practice digits and common practical symbols in structured transcription patterns.</p>
        <fieldset><legend>Duration</legend><div class="practice-lab-duration-grid">${durationButtons(PRACTICE_NUMBERS_SYMBOLS_PRACTICE_DURATIONS_MS, view.durationMs, "numbers-symbols-duration", view.availability?.practiceDurationsMs ?? [])}</div></fieldset>
        <div class="practice-lab-notice">The visible values are transcription material. No arithmetic, memory task, target WPM, PB, or leaderboard is involved.</div>
        <button type="button" class="practice-lab-primary-action" data-practice-action="start-numbers-symbols-practice" ${practiceAvailable ? "" : "disabled"}>${view.starting === "practice" ? "STARTING…" : `START ${minutes(view.durationMs)}-MIN PRACTICE`}</button>
      </section>
      <section class="practice-lab-empty-state"><div class="eyebrow">Standardized · ~3–6 min</div><h2>Numbers & Symbols Check</h2>
        <p>A fixed engineering-matched form measures whole-protocol typing performance with guarded domain first-pass accuracy.</p>
        <div class="practice-lab-notice">The same expected symbol is correct whether a layout produces it through Shift, AltGr, a software keyboard, or another valid route. This is not a math-ability test.</div>
        <button type="button" class="practice-lab-primary-action" data-practice-action="start-numbers-symbols-check" ${checkAvailable ? "" : "disabled"}>${view.starting === "check" ? "STARTING…" : "START STANDARDIZED CHECK"}</button>
      </section>${view.errorCode ? `<p role="alert">${escapeHtml(view.errorCode)}</p>` : ""}
    </main></div></section>`;
  (root.querySelector?.(focusSelector) ?? root.querySelector?.("[data-practice-action='start-numbers-symbols-practice']") ?? root.querySelector?.("button"))?.focus?.({ preventScroll: true });
  return true;
}

export function renderPracticeLabV30(root, view, options = {}) {
  if (view?.kind === "punctuation-capitals-detail") return renderPracticePunctuationCapitalsDetail(root, view, options);
  if (view?.kind === "numbers-symbols-detail") return renderPracticeNumbersSymbolsDetail(root, view, options);
  return renderPracticeLabV29(root, view, options);
}
