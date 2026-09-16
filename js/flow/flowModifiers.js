export const FLOW_MODIFIER_IDS = Object.freeze([
  "calm",
  "precision",
  "no-backspace",
  "dialogue",
  "longform",
  "symbols",
  "sprint",
  "clean-run",
]);

export const FLOW_MODIFIERS = Object.freeze({
  calm: Object.freeze({
    id: "calm",
    name: "Calm",
    kind: "training",
    description: "Softer Flow and Momentum penalties while you settle into rhythm.",
    conflictGroup: "tolerance",
    scoreMultiplier: 0.9,
    gameplay: Object.freeze({ incorrectLossScale: 0.6, correctBackspaceLossScale: 0.6, correctedRecoveryScale: 1.2 }),
  }),
  precision: Object.freeze({
    id: "precision",
    name: "Precision",
    kind: "challenge",
    description: "Mistakes hit harder and corrections recover less.",
    conflictGroup: "tolerance",
    scoreMultiplier: 1.12,
    gameplay: Object.freeze({ incorrectLossScale: 1.35, correctBackspaceLossScale: 1.25, correctedRecoveryScale: 0.5 }),
  }),
  "no-backspace": Object.freeze({
    id: "no-backspace",
    name: "No Backspace",
    kind: "challenge",
    description: "Backspace is disabled. Every entered character stands.",
    conflictGroup: null,
    scoreMultiplier: 1.15,
  }),
  dialogue: Object.freeze({
    id: "dialogue",
    name: "Dialogue",
    kind: "content",
    description: "Biases the run toward speech, quotes, and apostrophes.",
    conflictGroup: "content-focus",
    scoreMultiplier: 1.03,
  }),
  longform: Object.freeze({
    id: "longform",
    name: "Longform",
    kind: "content",
    description: "Prefers longer passages and sustained sentence structures.",
    conflictGroup: "run-shape",
    scoreMultiplier: 1.05,
  }),
  symbols: Object.freeze({
    id: "symbols",
    name: "Symbols",
    kind: "content",
    description: "Biases the run toward numbers, symbols, and mixed punctuation.",
    conflictGroup: "content-focus",
    scoreMultiplier: 1.08,
  }),
  sprint: Object.freeze({
    id: "sprint",
    name: "Sprint",
    kind: "run",
    description: "Compacts each chapter to one passage for a shorter, sharper run.",
    conflictGroup: "run-shape",
    scoreMultiplier: 1.1,
  }),
  "clean-run": Object.freeze({
    id: "clean-run",
    name: "Clean Run",
    kind: "challenge",
    description: "Earns its bonus only if raw accuracy stays perfect for the entire run.",
    conflictGroup: null,
    scoreMultiplier: 1.2,
    conditional: "perfect-raw-accuracy",
  }),
});

const CONFLICTS = Object.freeze(Object.fromEntries(
  FLOW_MODIFIER_IDS.map((id) => {
    const group = FLOW_MODIFIERS[id].conflictGroup;
    const conflicts = group
      ? FLOW_MODIFIER_IDS.filter((candidate) => candidate !== id && FLOW_MODIFIERS[candidate].conflictGroup === group)
      : [];
    return [id, Object.freeze(conflicts)];
  }),
));

export function getFlowModifier(id) {
  return FLOW_MODIFIERS[id] || null;
}

export function normalizeFlowModifierIds(value = []) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const selected = [];
  for (const raw of source) {
    const id = String(raw || "").trim().toLowerCase();
    if (!FLOW_MODIFIER_IDS.includes(id)) continue;
    for (const conflict of CONFLICTS[id]) {
      const index = selected.indexOf(conflict);
      if (index >= 0) selected.splice(index, 1);
    }
    if (!selected.includes(id)) selected.push(id);
  }
  return Object.freeze(selected);
}

export function hasFlowModifier(value, id) {
  const modifiers = Array.isArray(value) ? value : value?.modifiers;
  return Array.isArray(modifiers) && modifiers.includes(id);
}

export function toggleFlowModifier(value = [], id) {
  const current = [...normalizeFlowModifierIds(value)];
  if (!FLOW_MODIFIER_IDS.includes(id)) return Object.freeze(current);
  if (current.includes(id)) return Object.freeze(current.filter((item) => item !== id));
  return normalizeFlowModifierIds([...current, id]);
}

export function getFlowModifierGameplayScales(value = []) {
  const modifiers = normalizeFlowModifierIds(Array.isArray(value) ? value : value?.modifiers || []);
  const scales = {
    incorrectLossScale: 1,
    correctBackspaceLossScale: 1,
    correctedRecoveryScale: 1,
  };
  for (const id of modifiers) {
    const gameplay = FLOW_MODIFIERS[id]?.gameplay;
    if (!gameplay) continue;
    for (const key of Object.keys(scales)) {
      if (Number.isFinite(gameplay[key])) scales[key] *= gameplay[key];
    }
  }
  return Object.freeze(scales);
}

export function getFlowModifierScoreBreakdown(run) {
  const modifierIds = normalizeFlowModifierIds(run?.modifiers || []);
  let multiplier = 1;
  const entries = modifierIds.map((id) => {
    const definition = FLOW_MODIFIERS[id];
    let appliedMultiplier = definition.scoreMultiplier ?? 1;
    let achieved = true;
    if (definition.conditional === "perfect-raw-accuracy") {
      achieved = (run?.incorrectKeystrokes || 0) === 0;
      appliedMultiplier = achieved ? definition.scoreMultiplier : 1;
    }
    multiplier *= appliedMultiplier;
    return Object.freeze({
      id,
      name: definition.name,
      kind: definition.kind,
      achieved,
      appliedMultiplier: Number(appliedMultiplier.toFixed(4)),
    });
  });
  return Object.freeze({
    multiplier: Number(multiplier.toFixed(4)),
    entries: Object.freeze(entries),
  });
}

export function getFlowModifierQueryValue(value = []) {
  return normalizeFlowModifierIds(value).join(",");
}

export function getFlowModifierContentBiases(value = []) {
  const modifiers = normalizeFlowModifierIds(value);
  return Object.freeze({
    dialogue: modifiers.includes("dialogue"),
    longform: modifiers.includes("longform"),
    symbols: modifiers.includes("symbols"),
    sprint: modifiers.includes("sprint"),
  });
}
