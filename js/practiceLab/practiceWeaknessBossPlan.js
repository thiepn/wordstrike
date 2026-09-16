import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID,
  PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION,
  PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION,
  PRACTICE_WEAKNESS_BOSS_PHASES,
  PRACTICE_WEAKNESS_BOSS_PLAN_VERSION,
  PRACTICE_WEAKNESS_BOSS_POLICY_VERSION,
  PRACTICE_WEAKNESS_BOSS_PROBE_VERSION,
  PRACTICE_WEAKNESS_BOSS_QUOTAS,
  PRACTICE_WEAKNESS_BOSS_SELECTION_VERSION,
  PRACTICE_WEAKNESS_BOSS_TARGET_SOURCES,
  PRACTICE_WEAKNESS_BOSS_THEME_VERSION,
  PRACTICE_WEAKNESS_BOSS_VERSION,
} from "./practiceWeaknessBossConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const boundedStrings = (values, max = 32) => [...new Set((values ?? []).filter((value) => typeof value === "string" && value))].sort().slice(0, max);
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((output, key) => { output[key] = canonical(value[key]); return output; }, {});
};

function contextBinding(context) {
  if (!context?.contextId || !context?.fingerprint || !context?.dataLocale || !context?.keyboardLayout || !context?.inputMethod) throw new TypeError("Weakness Boss requires a canonical PL5 context");
  return freezeDeep({
    contextId: context.contextId,
    fingerprint: context.fingerprint,
    dataLocale: context.dataLocale,
    keyboardLayout: context.keyboardLayout,
    inputMethod: context.inputMethod,
    hardwareProfileId: context.hardwareProfileId ?? null,
  });
}

function compactMaterial(material = {}) {
  return freezeDeep({
    contentIds: boundedStrings(material.contentIds, 32),
    contentHashes: boundedStrings(material.contentHashes, 32),
    familyIds: boundedStrings(material.familyIds, 16),
    materialHash: String(material.materialHash ?? hashPracticeContent(JSON.stringify(canonical({
      contentIds: boundedStrings(material.contentIds, 32),
      contentHashes: boundedStrings(material.contentHashes, 32),
      familyIds: boundedStrings(material.familyIds, 16),
    })))),
  });
}

export function buildPracticeWeaknessBossPlan({
  sessionId,
  context,
  corpusBinding,
  target,
  targetSource = "recommended",
  bossTheme,
  phaseMaterial = {},
} = {}) {
  if (typeof sessionId !== "string" || !sessionId) throw new TypeError("Weakness Boss plan requires sessionId");
  if (!target?.statId || !target?.entityType || typeof target?.entityKey !== "string") throw new TypeError("Weakness Boss plan requires one canonical selected target");
  const quotas = PRACTICE_WEAKNESS_BOSS_QUOTAS[target.entityType];
  if (!quotas) throw new TypeError("Weakness Boss target type is unsupported");
  if (!PRACTICE_WEAKNESS_BOSS_TARGET_SOURCES.includes(targetSource)) throw new TypeError("Weakness Boss target source is invalid");
  if (!corpusBinding?.corpusId || !Number.isInteger(corpusBinding?.corpusVersion) || !Number.isInteger(corpusBinding?.indexVersion)) throw new TypeError("Weakness Boss requires training corpus/index binding");
  if (!bossTheme?.id || !bossTheme?.name) throw new TypeError("Weakness Boss requires a cosmetic archetype binding");
  const phases = PRACTICE_WEAKNESS_BOSS_PHASES.map((phase, index) => {
    const material = compactMaterial(phaseMaterial[phase.id]);
    return freezeDeep({
      id: phase.id,
      ordinal: index + 1,
      label: phase.label,
      cue: phase.cue,
      evidenceEligible: true,
      acquisitionDoseEligible: phase.acquisitionDoseEligible,
      opportunityQuota: quotas[phase.id],
      hpAllocation: phase.hpAllocation,
      material,
    });
  });
  const plan = {
    version: PRACTICE_WEAKNESS_BOSS_VERSION,
    policyVersion: PRACTICE_WEAKNESS_BOSS_POLICY_VERSION,
    selectionVersion: PRACTICE_WEAKNESS_BOSS_SELECTION_VERSION,
    planVersion: PRACTICE_WEAKNESS_BOSS_PLAN_VERSION,
    generatorVersion: PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION,
    probeVersion: PRACTICE_WEAKNESS_BOSS_PROBE_VERSION,
    gameplayVersion: PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION,
    themeVersion: PRACTICE_WEAKNESS_BOSS_THEME_VERSION,
    experimentId: PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID,
    sessionId,
    contextBinding: contextBinding(context),
    corpusBinding: freezeDeep({
      corpusId: String(corpusBinding.corpusId),
      corpusVersion: corpusBinding.corpusVersion,
      indexVersion: corpusBinding.indexVersion,
      manifestHash: corpusBinding.manifestHash ? String(corpusBinding.manifestHash) : null,
    }),
    target: freezeDeep({
      entityType: target.entityType,
      statId: target.statId,
      entityKey: target.entityKey,
      limiterStatus: target.limiterStatus,
      phenotype: target.phenotype,
      targetSource,
      bossTargetUtility: Number(target.bossTargetUtility),
    }),
    bossTheme: freezeDeep({ id: bossTheme.id, name: bossTheme.name, description: bossTheme.description ?? null }),
    phases,
    openingProbe: phases[0].material,
    finalProbe: phases[4].material,
    acquisitionDose: freezeDeep({ entityType: target.entityType, opportunities: quotas.battle, doseUnits: 1, phaseIds: ["break-guard", "pressure", "final-form"] }),
    targetOpportunityTotal: quotas.total,
    partition: "training",
    resumable: false,
  };
  plan.planHash = hashPracticeContent(JSON.stringify(canonical({
    versions: [plan.version, plan.policyVersion, plan.selectionVersion, plan.planVersion, plan.generatorVersion, plan.probeVersion, plan.gameplayVersion, plan.themeVersion],
    sessionId: plan.sessionId,
    target: plan.target,
    phases: plan.phases.map((phase) => ({ id: phase.id, cue: phase.cue, opportunityQuota: phase.opportunityQuota, hpAllocation: phase.hpAllocation, material: phase.material })),
    corpusBinding: plan.corpusBinding,
  })));
  return freezeDeep(plan);
}

export function createPracticeWeaknessBossContentMetadata(plan, phaseRanges) {
  if (!plan?.planHash || plan.experimentId !== PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID) throw new TypeError("Weakness Boss content metadata requires an immutable Boss plan");
  if (!Array.isArray(phaseRanges) || phaseRanges.length !== 5) throw new TypeError("Weakness Boss content metadata requires five phase ranges");
  return freezeDeep({
    weaknessBoss: {
      version: plan.version,
      policyVersion: plan.policyVersion,
      selectionVersion: plan.selectionVersion,
      planVersion: plan.planVersion,
      generatorVersion: plan.generatorVersion,
      probeVersion: plan.probeVersion,
      gameplayVersion: plan.gameplayVersion,
      themeVersion: plan.themeVersion,
      planHash: plan.planHash,
      target: { ...plan.target },
      bossTheme: { ...plan.bossTheme },
      phaseSequence: plan.phases.map((phase) => ({ id: phase.id, ordinal: phase.ordinal, cue: phase.cue, opportunityQuota: phase.opportunityQuota, evidenceEligible: true, acquisitionDoseEligible: phase.acquisitionDoseEligible, hpAllocation: phase.hpAllocation })),
      phaseRanges,
      acquisitionDose: { ...plan.acquisitionDose },
      contextBinding: { ...plan.contextBinding },
      resumable: false,
      completionMode: "content",
    },
    targetEntities: [{ entityType: plan.target.entityType, entityKey: plan.target.entityKey, directTarget: true }],
    partition: "training",
    corpusBinding: { ...plan.corpusBinding },
    language: plan.contextBinding.dataLocale,
  });
}
