import { scrollPracticeTypingCursor } from "./practiceHostDom.js";
// Keep typing captures and live phase instructions mounted while typing.
const plans = new WeakMap();
const views = new WeakMap();
export function practicePlanCharacters(plan) {
  if (!plans.has(plan)) plans.set(plan, Array.from(plan.text));
  return plans.get(plan);
}
export function practicePhaseWindow(phase, cursor, length) {
  // Some immutable protocols put the separator before the next phase range.
  // It still has to be typed: never start the visible window after the cursor.
  const start = Math.max(Math.min(phase?.startIndex ?? 0, cursor), cursor - 80);
  return { start, end: Math.min(length, phase?.endIndex ?? length, start + 400) };
}
export function updatePracticeTargetSession(root, { contentPlan, phase, snapshot, passageSelector, text, progress, repairFeedback }) {
  const previous = views.get(root);
  const passage = root.querySelector?.(passageSelector);
  const stable = passage && previous?.plan === contentPlan && previous?.phase === phase
    && previous?.lifecycle === snapshot.lifecycleState;
  views.set(root, { plan: contentPlan, phase, lifecycle: snapshot.lifecycleState });
  if (!stable) return false;
  passage.innerHTML = text.replaceAll('>&nbsp;</span>', '> </span>');
  const bar = root.querySelector('.practice-weak-key-progress > span, .practice-combination-progress > span');
  if (bar) bar.style.width = `${progress.toFixed(2)}%`;
  const label = root.querySelector('.practice-weak-key-progress-label, .practice-combination-progress-label');
  if (label) label.textContent = `${Math.round(progress)}% complete`;
  const feedback = root.querySelector('[data-repair-feedback]');
  if (feedback) { feedback.hidden = !repairFeedback; feedback.textContent = repairFeedback?.message ?? ''; }
  // Stable fast-path updates bypass renderPracticeSessionMarkup(), so keep the
  // newly advanced caret inside the clipped typing viewport explicitly.
  scrollPracticeTypingCursor(root);
  return true;
}
