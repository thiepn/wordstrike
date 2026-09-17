import test from 'node:test';
import assert from 'node:assert/strict';
import { practicePhaseWindow, updatePracticeTargetSession } from '../js/practiceLab/practiceTargetSessionRendering.js';
import { renderPracticeWeakKeysSessionSnapshot } from '../js/practiceLab/practiceWeakKeysSessionHost.js';

test('long target phases render at most 400 characters and retain correction context', () => {
  const phase = { id: 'focus', startIndex: 0, endIndex: 20000, ordinal: 2, targetPositions: [], cue: 'strong' };
  const root = { innerHTML: '' };
  renderPracticeWeakKeysSessionSnapshot(root, { contentPlan: { text: 'e'.repeat(20000), metadata: { weakKeys: { target: { entityKey: 'e' }, phaseRanges: [phase] } } }, snapshot: { cursorIndex: 15000, lifecycleState: 'active' } });
  assert.equal([...root.innerHTML.matchAll(/data-char-index=/g)].length, 400);
  assert.match(root.innerHTML, /is-current[^>]*data-char-index="15000"/);
  assert.deepEqual(practicePhaseWindow(phase, 15000, 20000), { start: 14920, end: 15320 });
});

test('typing updates preserve the shell and input; phase and lifecycle transitions rebuild', () => {
  const passage = { innerHTML: '' }; const bar = { style: {} }; const label = {};
  const root = { querySelector: selector => selector === '.passage' ? passage : selector.includes('> span') ? bar : selector.includes('label') ? label : null };
  const args = { contentPlan: {}, phase: {}, snapshot: { lifecycleState: 'active' }, passageSelector: '.passage', text: 'next', progress: 42 };
  assert.equal(updatePracticeTargetSession(root, args), false);
  assert.equal(updatePracticeTargetSession(root, args), true);
  assert.equal(passage.innerHTML, 'next'); assert.equal(bar.style.width, '42.00%');
  assert.equal(updatePracticeTargetSession(root, { ...args, snapshot: { lifecycleState: 'paused' } }), false);
  assert.equal(updatePracticeTargetSession(root, { ...args, phase: {} }), false);
});
