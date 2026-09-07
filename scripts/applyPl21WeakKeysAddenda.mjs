import { readFile, writeFile } from "node:fs/promises";

async function appendOnce(path, marker, text) {
  const source = await readFile(path, "utf8");
  if (source.includes(marker)) return false;
  await writeFile(path, `${source.replace(/\s+$/, "")}\n\n${text.trim()}\n`, "utf8");
  return true;
}

async function replaceOnce(path, before, after) {
  const source = await readFile(path, "utf8");
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`Expected PL21 hardening source not found in ${path}`);
  await writeFile(path, source.replace(before, after), "utf8");
  return true;
}

const changed = [];
const generator = "js/practiceLab/practiceWeakKeysGenerator.js";

if (await replaceOnce(
  generator,
`  const generatedProbeBundles = buildProbeBundles(generatedProbePool, {
    sessionId,
    entityKey: target.entityKey,
    policy,
    compositionMode: "generated-word-sequence",
    salt: "generated-probe",
    requiredDistinctLexical: availableDistinctWords >= policy.probes.preferredGeneratedDistinctLexicalItems ? policy.probes.preferredGeneratedDistinctLexicalItems : 0,
  });
  const probePair = selectPracticeWeakKeysProbePair({ entryCandidates: naturalProbeBundles, exitCandidates: naturalProbeBundles, policy })
    ?? selectPracticeWeakKeysProbePair({ entryCandidates: generatedProbeBundles, exitCandidates: generatedProbeBundles, policy });`,
`  const preferredGeneratedProbeBundles = buildProbeBundles(generatedProbePool, {
    sessionId,
    entityKey: target.entityKey,
    policy,
    compositionMode: "generated-word-sequence",
    salt: "generated-probe-preferred",
    requiredDistinctLexical: availableDistinctWords >= policy.probes.preferredGeneratedDistinctLexicalItems ? policy.probes.preferredGeneratedDistinctLexicalItems : 0,
  });
  const fallbackGeneratedProbeBundles = buildProbeBundles(generatedProbePool, {
    sessionId,
    entityKey: target.entityKey,
    policy,
    compositionMode: "generated-word-sequence",
    salt: "generated-probe-fallback",
    requiredDistinctLexical: 0,
  });
  const probePair = selectPracticeWeakKeysProbePair({ entryCandidates: naturalProbeBundles, exitCandidates: naturalProbeBundles, policy })
    ?? selectPracticeWeakKeysProbePair({ entryCandidates: preferredGeneratedProbeBundles, exitCandidates: preferredGeneratedProbeBundles, policy })
    ?? selectPracticeWeakKeysProbePair({ entryCandidates: fallbackGeneratedProbeBundles, exitCandidates: fallbackGeneratedProbeBundles, policy });`,
)) changed.push(generator);

if (await replaceOnce(
  generator,
`  const contextPool = contextPreferred.length ? contextPreferred : [...naturalCandidates, ...generatedContext];
  const contextSelection = selectPracticeWeakKeysExactQuota(contextPool, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.context, {
    sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION, policyVersion: policy.version, salt: "context",
  });`,
`  const fullContextPool = [...naturalCandidates, ...generatedContext];
  const contextSelection = (contextPreferred.length ? selectPracticeWeakKeysExactQuota(contextPreferred, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.context, {
    sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION, policyVersion: policy.version, salt: "context-preferred",
  }) : null) ?? selectPracticeWeakKeysExactQuota(fullContextPool, PRACTICE_WEAK_KEYS_PHASE_QUOTAS.context, {
    sessionId, entityKey: target.entityKey, generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION, policyVersion: policy.version, salt: "context-fallback",
  });`,
)) changed.push(generator);

const addenda = [
  [
    "docs/PRACTICE_LAB_LEARNING_CURVES_AND_SATURATION.md",
    "## PL21 Weak Keys dose contract",
`## PL21 Weak Keys dose contract

Weak Keys is a canonical PL16 direct-training consumer for `entityType = "key"`. Its v1 immutable intervention supplies exactly:

\`\`\`text
8 Baseline + 24 Focus + 20 Context + 20 Mix + 8 Check = 80 direct key opportunities
80 direct key opportunities = 1.0 PL16 key dose unit
\`\`\`

Corrections/retries do not create additional dose; other keys/bigrams/trigrams/words receive no **direct** acquisition dose from Weak Keys. PL11 may still collect their ordinary incidental evidence.

PL21's explicit Baseline/Check result is same-session training evidence only. It does not replace the generic PL16 acquisition observation, does not add transfer evidence, and is not named `learningGain`. PL21 recommendations may consume the canonical PL16 saturation status to de-emphasize `likely`/`supported` saturated keys; Weak Keys does not write or redefine saturation state.

See \`PRACTICE_LAB_WEAK_KEYS.md\` for the versioned intervention contract.`
  ],
  [
    "docs/PRACTICE_LAB_LIMITER_IMPACT_MODEL.md",
    "## PL21 Weak Keys consumer",
`## PL21 Weak Keys consumer

PL21 consumes PL12 **key-level** limiter candidates as recommendation evidence; it does not create a parallel weakness or phenotype model. `confirmed` and `likely` keys are preferred, with `possible` evidence secondary. The v1 Weak Keys treatment remains the same across slow, hesitant, inaccurate, recovery-heavy, unstable, or mixed phenotypes so later treatment-effect work has a stable intervention identity.

Weak Keys also derives bounded downstream relevance from the existing hierarchy: for one key stat ID it counts likely/confirmed bigram, trigram, and word limiter candidates whose \`hierarchy.explainedBy\` includes that key. UI wording remains explanatory rather than causal (for example, “also appears in higher-level limiter explanations”).

PL21 never mutates a limiter snapshot/hierarchy. After key evidence changes, PL12 may independently recompute whether higher-level limiters remain explained or become independently weak.

See \`PRACTICE_LAB_WEAK_KEYS.md\`.`
  ],
  [
    "docs/PRACTICE_LAB_MASTERY_AUTOMATICITY_MODEL.md",
    "## PL21 Weak Keys mastery boundary",
`## PL21 Weak Keys mastery boundary

PL21 uses PL15 only as recommendation context. `Learning` and `Acquired` keys with unresolved limiter evidence are preferred; `Robust` and `Retained` are not normally recommended, although a user may still manually practice a valid key.

Weak Keys never assigns, promotes, or persists mastery. One strong same-session Check probe cannot set Acquired/Robust/Retained and is never serialized as “Mastered.” PL15 remains the sole mastery/automaticity owner.

See \`PRACTICE_LAB_WEAK_KEYS.md\`.`
  ],
  [
    "docs/PRACTICE_LAB_SESSION_ENGINE.md",
    "## PL21 Weak Keys session contract",
`## PL21 Weak Keys session contract

Weak Keys uses one canonical Practice session with exactly one direct target entity (`key`), `evidenceRole = training`, correction behavior `allow`, content completion, and `resumable = false`. Its immutable phase metadata is Baseline → Focus → Context → Mix → Check with direct-target quotas 8/24/20/20/8.

No ability, performance-frontier, retention, evaluation, or assessment measurement privilege is attached. The browser host reuses the shared input/session engine, supports software-keyboard input, displays no live aggregate WPM/accuracy, and uses precomputed phase target positions for cue fading. Refresh/abandon ends the v1 intervention; there is no active checkpoint restore.

See \`PRACTICE_LAB_WEAK_KEYS.md\`.`
  ],
];

for (const [path, marker, text] of addenda) {
  if (await appendOnce(path, marker, text)) changed.push(path);
}

if (changed.length) console.log(`PL21 addenda/hardening changed: ${[...new Set(changed)].join(", ")}`);
else console.log("PL21 addenda/hardening already applied.");
