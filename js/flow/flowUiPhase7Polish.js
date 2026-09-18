import { createFlowRunPlan } from './flowRunPlan.js';

const params = new URLSearchParams(globalThis.location?.search || '');
const enabled = params.get('dev') === '1' && params.get('mode') === 'flow'
  && params.get('flowRun') === '1' && params.get('flowUi') === '1';
const CATEGORY_LABELS = Object.freeze({ mixed: 'Mixed', everyday: 'Everyday', stories: 'Stories',
  dialogue: 'Dialogue', professional: 'Professional', academic: 'Academic', quotes: 'Quotes',
  'numbers-symbols': 'Numbers & Symbols' });
const titleCase = value => String(value || '').split('-').map(part => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Preview the same planner as Start; never mutate or replace the live run. */
export function getFlowSetupPreview(draft, currentPlan = null, modifiers = currentPlan?.modifiers || []) {
  const plan = createFlowRunPlan({ ...draft, seed: currentPlan?.seed || draft?.seed || 'phase5-default',
    modifiers, adaptiveProfile: currentPlan?.adaptive?.enabled ? currentPlan.adaptive : null });
  return Object.freeze({ targetMinutes: plan.targetMinutes, sectionCount: plan.passageCount,
    wordCount: plan.wordCount, coherent: plan.coherent, category: plan.category,
    sessionLength: plan.sessionLength, difficulty: plan.difficulty });
}

function syncDraftSummary() {
  if (!enabled) return;
  const screen = document.querySelector('[data-flow-view="ready"][data-flow-ui-phase7="true"]');
  const brief = screen?.querySelector('.flow-phase1-brief');
  const draft = globalThis.window?.wordstrikeFlowUiPhase7?.getDraft?.();
  if (!brief || !draft) return;
  const plan = window.wordstrikeFlowPhase1?.getRunPlan?.();
  const modifiers = window.wordstrikeFlowModifiersPhase9?.getDraft?.() || plan?.modifiers || [];
  const signature = JSON.stringify([draft, plan?.id, modifiers]);
  if (brief.dataset.flowDraftSignature === signature) return;
  const preview = getFlowSetupPreview(draft, plan, modifiers);
  brief.dataset.flowDraftSignature = signature;
  brief.setAttribute('aria-label', 'Selected Flow run setup');
  brief.innerHTML = `
    <span><strong>~${preview.targetMinutes} min</strong> ${escape(titleCase(preview.sessionLength))} run</span>
    <span><strong>${preview.sectionCount}</strong> section${preview.sectionCount === 1 ? '' : 's'}</span>
    <span><strong>${preview.wordCount}</strong> words</span>
    <span><strong>${preview.coherent ? 'One story' : escape(CATEGORY_LABELS[preview.category])}</strong> text</span>
    <span><strong>${escape(titleCase(preview.difficulty))}</strong> difficulty</span>`;
}

if (enabled) {
  const app = document.querySelector('#app');
  // Setup changes only: live HUD/character mutations do not wake this decorator.
  if (app) new MutationObserver(() => queueMicrotask(syncDraftSummary)).observe(app, { childList: true });
  const setupControl = target => target?.closest?.('[data-flow-choice-group], [data-flow-modifier-setup]');
  document.addEventListener('click', event => {
    if (setupControl(event.target)) queueMicrotask(syncDraftSummary);
  });
  document.addEventListener('keydown', event => {
    if (setupControl(event.target) && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) queueMicrotask(syncDraftSummary);
  });
  queueMicrotask(syncDraftSummary);
}
