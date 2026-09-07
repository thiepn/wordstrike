from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f"expected source not found: {path}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    return True


def append_before(path, marker, addition):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if addition.strip() in text:
        return False
    if marker not in text:
        raise RuntimeError(f"append marker not found: {path}")
    p.write_text(text.replace(marker, addition + "\n" + marker, 1), encoding="utf-8")
    return True

changed = []

# Shared session host must reject an active PL5 context that differs from the immutable plan context.
path = "js/practiceLab/practiceWeakKeysSessionHost.js"
if replace_once(path,
'''import { createPracticeSessionEngine } from "./practiceSessionEngine.js";''',
'''import { createPracticeSessionEngine } from "./practiceSessionEngine.js";
import { assertPracticeWeakKeysSessionContext } from "./practiceWeakKeysTrust.js";'''):
    changed.append(path)
if replace_once(path,
'''  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  const engineFactory = dependencies.engineFactory ?? createPracticeSessionEngine;''',
'''  const initialized = dependencies.initialized ?? await repository.initializePracticeStorage();
  assertPracticeWeakKeysSessionContext(session.weakKeysPlan, initialized.context);
  const engineFactory = dependencies.engineFactory ?? createPracticeSessionEngine;'''):
    changed.append(path)

# Controller diagnostics should report both delegated root listeners introduced by PL21.
path = "js/practiceLab/practiceLabControllerRuntime.js"
if replace_once(path,
'''    mounted, route, historyDepth: history.length, listenerCount: mounted ? 1 : 0,''',
'''    mounted, route, historyDepth: history.length, listenerCount: mounted ? 2 : 0,'''):
    changed.append(path)

# Generator: import lexical coverage ordering.
path = "js/practiceLab/practiceWeakKeysGenerator.js"
if replace_once(path,
'''import { selectPracticeWeakKeysExactQuota } from "./practiceWeakKeysComposer.js";''',
'''import {
  orderPracticeWeakKeysLexicalCoverage,
  selectPracticeWeakKeysExactQuota,
} from "./practiceWeakKeysComposer.js";'''):
    changed.append(path)

# Generator: prefer Focus sources disjoint from probes, then order selected words round-robin before repetition.
old_focus = '''  const focusAll = generatedTargetPool(wordCandidates, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.focus, { compositionMode: "generated-word-sequence", salt: "focus" });
  const preferredFocus = focusAll.filter((unit) => unit.wordLength >= policy.content.focusPreferredWordLengthMin && unit.wordLength <= policy.content.focusPreferredWordLengthMax);
  const focusOptions = preferredFocus.length >= policy.content.hardMinimumTargetWords ? preferredFocus : focusAll;
  const focus = selectPracticeWeakKeysExactQuota(focusOptions, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.focus, {
    sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION, policyVersion: policy.version, salt: "focus",
    preferredTypabilityRange: [policy.content.focusPreferredTypabilityPercentileMin, policy.content.focusPreferredTypabilityPercentileMax],
  });
  if (!focus || focus.metrics.distinctLexicalCount < policy.content.hardMinimumTargetWords) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_WORDS, "Weak Keys Focus phase cannot satisfy lexical diversity and exact dose");'''
new_focus = '''  const focusAll = generatedTargetPool(wordCandidates, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.focus, { compositionMode: "generated-word-sequence", salt: "focus" });
  const preferredFocus = focusAll.filter((unit) => unit.wordLength >= policy.content.focusPreferredWordLengthMin && unit.wordLength <= policy.content.focusPreferredWordLengthMax);
  const disjointFromProbes = (unit) => !(unit.sourceFamilyIds ?? []).some((id) => probeFamilies.has(id))
    && !(unit.sourceContentIds ?? []).some((id) => probeContents.has(id));
  const focusPools = [
    [preferredFocus.filter(disjointFromProbes), "focus-short-disjoint"],
    [focusAll.filter(disjointFromProbes), "focus-disjoint"],
    [preferredFocus, "focus-short"],
    [focusAll, "focus-fallback"],
  ];
  let focus = null;
  for (const [pool, salt] of focusPools) {
    if (!pool.length) continue;
    focus = selectPracticeWeakKeysExactQuota(pool, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.focus, {
      sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION, policyVersion: policy.version, salt,
      preferredTypabilityRange: [policy.content.focusPreferredTypabilityPercentileMin, policy.content.focusPreferredTypabilityPercentileMax],
    });
    if (focus) break;
  }
  if (!focus || focus.metrics.distinctLexicalCount < policy.content.hardMinimumTargetWords) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_WORDS, "Weak Keys Focus phase cannot satisfy lexical diversity and exact dose");
  const focusUnits = orderPracticeWeakKeysLexicalCoverage(focus.units, {
    sessionId,
    entityKey: target.entityKey,
    generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
    policyVersion: policy.version,
    salt: "focus-lexical-coverage",
  });'''
if replace_once(path, old_focus, new_focus):
    changed.append(path)

# Generator: prefer Mix target sources disjoint from probes, but fail over to full safe training pool when infeasible.
old_mix = '''  const mixTargetPool = generatedTargetPool(wordCandidates, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.interleave, { compositionMode: "generated-word-sequence", salt: "mix-target" });
  const mixTarget = selectPracticeWeakKeysExactQuota(mixTargetPool, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.interleave, {
    sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION, policyVersion: policy.version, salt: "mix-target",
  });
  if (!mixTarget) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_CONTENT, "Weak Keys Mix phase cannot satisfy its exact target quota");'''
new_mix = '''  const mixTargetPool = generatedTargetPool(wordCandidates, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.interleave, { compositionMode: "generated-word-sequence", salt: "mix-target" });
  const mixDisjointPool = mixTargetPool.filter(disjointFromProbes);
  const mixTarget = (mixDisjointPool.length ? selectPracticeWeakKeysExactQuota(mixDisjointPool, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.interleave, {
    sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION, policyVersion: policy.version, salt: "mix-target-disjoint",
  }) : null) ?? selectPracticeWeakKeysExactQuota(mixTargetPool, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.interleave, {
    sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION, policyVersion: policy.version, salt: "mix-target-fallback",
  });
  if (!mixTarget) throw createPracticeWeakKeysError(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_CONTENT, "Weak Keys Mix phase cannot satisfy its exact target quota");'''
if replace_once(path, old_mix, new_mix):
    changed.append(path)

# Use the coverage-ordered Focus bundle everywhere downstream.
if replace_once(path,
'''  const targetTrainingUnits = [...focus.units, ...contextSelection.units, ...mixTarget.units];''',
'''  const targetTrainingUnits = [...focusUnits, ...contextSelection.units, ...mixTarget.units];'''):
    changed.append(path)
if replace_once(path,
'''      focus: focus.units,''',
'''      focus: focusUnits,'''):
    changed.append(path)

# Tests: plan fixture now carries an explicit PL5 context binding.
path = "tests/practice-weak-keys-session-integration.test.js"
if replace_once(path,
'''import { resolvePracticeEvidenceRole } from "../js/practiceLab/practiceEvidenceRole.js";''',
'''import { resolvePracticeEvidenceRole } from "../js/practiceLab/practiceEvidenceRole.js";
import { assertPracticeWeakKeysSessionContext } from "../js/practiceLab/practiceWeakKeysTrust.js";'''):
    changed.append(path)
if replace_once(path,
'''    context: { dataLocale: "en", keyboardLayout: "qwerty" },''',
'''    context: {
      contextId: "practice-context_pl21-plan-fixture",
      fingerprint: "pl21-plan-fixture-fingerprint",
      dataLocale: "en",
      keyboardLayout: "qwerty",
      inputMethod: "physical-keyboard",
      hardwareProfileId: null,
    },'''):
    changed.append(path)
if replace_once(path,
'''  assert.equal(plan.targetOpportunityBudget, 80);
  assert.equal(contentPlan.metadata.partition, "training");''',
'''  assert.equal(plan.targetOpportunityBudget, 80);
  assert.equal(plan.contextBinding.contextId, "practice-context_pl21-plan-fixture");
  assert.deepEqual(plan.phaseBoundaries.map((phase) => [phase.targetOpportunityStart, phase.targetOpportunityEnd]), [[0, 8], [8, 32], [32, 52], [52, 72], [72, 80]]);
  assert.equal(contentPlan.metadata.weakKeys.contextBinding.fingerprint, "pl21-plan-fixture-fingerprint");
  assert.equal(contentPlan.metadata.partition, "training");'''):
    changed.append(path)
append_before(path,
'''test("PL21 completes through the shared Practice engine with exactly one direct PL16 key dose", async () => {''',
'''test("PL21 rejects a session when the active PL5 context changed after plan generation", async () => {
  const session = await preparedSession("practice-session_pl21-context-fixture");
  assert.equal(assertPracticeWeakKeysSessionContext(session.weakKeysPlan, session.weakKeysPlan.contextBinding), true);
  assert.throws(
    () => assertPracticeWeakKeysSessionContext(session.weakKeysPlan, { ...session.weakKeysPlan.contextBinding, fingerprint: "different-fingerprint" }),
    (error) => error.code === "PRACTICE_WEAK_KEYS_CONTEXT_MISMATCH",
  );
});
''')
changed.append(path)

# Composer test: explicitly prove coverage-first lexical ordering before repeats.
path = "tests/practice-weak-keys-composer-probes.test.js"
if replace_once(path,
'''  selectPracticeWeakKeysExactQuota,
} from "../js/practiceLab/practiceWeakKeysComposer.js";''',
'''  orderPracticeWeakKeysLexicalCoverage,
  selectPracticeWeakKeysExactQuota,
} from "../js/practiceLab/practiceWeakKeysComposer.js";'''):
    changed.append(path)
append_before(path,
'''function probeUnit({ id, family, content, positionCounts, geometryCounts, typability = 0.5, featureShift = 0 }) {''',
'''test("PL21 lexical ordering visits every selected word before beginning a repetition round", () => {
  const units = [
    candidate("a1", 1, "f1", "rain"),
    candidate("a2", 1, "f1", "rain"),
    candidate("b1", 1, "f2", "road"),
    candidate("b2", 1, "f2", "road"),
    candidate("c1", 1, "f3", "river"),
    candidate("c2", 1, "f3", "river"),
  ];
  const ordered = orderPracticeWeakKeysLexicalCoverage(units, baseOptions);
  assert.equal(new Set(ordered.slice(0, 3).map((unit) => unit.lexicalKey)).size, 3);
  assert.equal(new Set(ordered.slice(3, 6).map((unit) => unit.lexicalKey)).size, 3);
});
''')
changed.append(path)

# Contract test: explicit layout-neutral geometry sanity for QWERTZ/AZERTY and unknown layouts.
path = "tests/practice-weak-keys-contract.test.js"
if replace_once(path,
'''import { createPracticeWeakKeysDescriptor } from "../js/practiceLab/practiceWeakKeysExperiment.js";''',
'''import { createPracticeWeakKeysDescriptor } from "../js/practiceLab/practiceWeakKeysExperiment.js";
import { classifyPracticeKeyboardGeometry } from "../js/practiceLab/practiceKeyboardGeometry.js";'''):
    changed.append(path)
append_before(path,
'''test("target availability consumes only training reverse-index APIs", async () => {''',
'''test("Weak Keys geometry uses the declared QWERTZ/AZERTY layout and leaves unknown layouts unavailable", () => {
  const qwertz = classifyPracticeKeyboardGeometry({ layout: "qwertz", previousExpected: "y", currentExpected: "z" });
  const azerty = classifyPracticeKeyboardGeometry({ layout: "azerty", previousExpected: "a", currentExpected: "z" });
  const unknown = classifyPracticeKeyboardGeometry({ layout: "custom-layout", previousExpected: "a", currentExpected: "z" });
  assert.equal(qwertz.known, true);
  assert.equal(azerty.known, true);
  assert.equal(unknown.known, false);
  assert.equal(unknown.geometryClass, "unknown");
});
''')
changed.append(path)

# Documentation: make context and hash binding explicit.
path = "docs/PRACTICE_LAB_WEAK_KEYS.md"
if replace_once(path,
'''The plan hash binds target, versions, phase quotas/order, source IDs/hashes, generated word IDs, cue policy, and corpus/index identity.''',
'''The plan hash binds target, versions, explicit phase boundaries, ordered source IDs/hashes, generated word IDs, cue policy, corpus/index identity, and the active PL5 context identity. If the active Practice context fingerprint changes between plan generation and session start, the session fails instead of reusing geometry/content assumptions under another context.'''):
    changed.append(path)

print("PL21 hardening changed:", ", ".join(sorted(set(changed))))
