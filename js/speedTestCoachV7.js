export const TYPING_COACH_V7_VERSION = 7;
export const TYPING_COACH_V7_PLAN_KEY = "wordstrike_typing_coach_v7_plan";
export const TYPING_COACH_V7_HISTORY_KEY = "wordstrike_typing_coach_v7_history";

const MAX_HISTORY = 14;
const MAX_STEPS = 3;
const DRILL_TYPES = new Set(["weak-words", "mistake-patterns", "accuracy-recovery"]);
const STEP_STATUSES = new Set(["pending", "active", "complete", "skipped", "requested"]);
const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const safeId = (value, fallback = null) => {
  const text = String(value ?? "").trim().slice(0, 120);
  return text && /^[A-Za-z0-9._:-]+$/.test(text) ? text : fallback;
};
const safeTarget = (value, type = "word") => {
  const text = String(value ?? "").trim().toLowerCase();
  if (type === "key") return /^[a-z]$/.test(text) ? text : null;
  return /^[a-z]{2,24}$/.test(text) ? text : null;
};
const unique = (values) => [...new Set(values.filter(Boolean))];
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

function localDayKey(now = Date.now()) {
  const date = new Date(typeof now === "function" ? now() : now);
  if (Number.isNaN(date.getTime())) return "unknown";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function consistencyLabel(performance = {}) {
  const runs = Math.max(0, Math.round(finite(performance?.runCount)));
  if (runs < 2) return "Building";
  const deviation = Math.max(0, finite(performance?.stdDevWpm));
  if (deviation <= 3) return "Stable";
  if (deviation <= 7) return "Variable";
  return "Volatile";
}

function sanitizeDrill(value) {
  if (!value || !DRILL_TYPES.has(value.type)) return null;
  const targetType = value.targetType === "key" ? "key" : "word";
  const target = safeTarget(value.target, targetType);
  if (!target) return null;
  const experimentId = value.type === "weak-words"
    ? "problem-words"
    : value.type === "mistake-patterns" ? "weak-keys" : "accuracy-control";
  return {
    type: value.type,
    title: String(value.title || "Practice").slice(0, 60),
    experimentId,
    targetType,
    target,
    rationale: String(value.rationale || "").slice(0, 240),
  };
}

function orderPracticeDrills(v6Plan) {
  const drills = (Array.isArray(v6Plan?.drills) ? v6Plan.drills : []).map(sanitizeDrill).filter(Boolean);
  const primaryType = DRILL_TYPES.has(v6Plan?.primaryDrillType) ? v6Plan.primaryDrillType : drills[0]?.type;
  const byType = new Map(drills.map((drill) => [drill.type, drill]));
  const preferences = primaryType === "accuracy-recovery"
    ? [primaryType, "weak-words", "mistake-patterns"]
    : [primaryType, "accuracy-recovery", primaryType === "weak-words" ? "mistake-patterns" : "weak-words"];
  return unique(preferences).map((type) => byType.get(type)).filter(Boolean).slice(0, 2);
}

function sanitizeStep(value, index) {
  if (!value || !["practice", "retest"].includes(value.kind)) return null;
  const kind = value.kind;
  const drill = kind === "practice" ? sanitizeDrill(value.drill) : null;
  if (kind === "practice" && !drill) return null;
  const status = STEP_STATUSES.has(value.status) ? value.status : "pending";
  return {
    id: safeId(value.id, `step-${index + 1}`),
    kind,
    stage: String(value.stage || (kind === "retest" ? "Verify" : "Practice")).slice(0, 30),
    title: String(value.title || drill?.title || (kind === "retest" ? "Retest original" : "Practice")).slice(0, 80),
    description: String(value.description || "").slice(0, 280),
    drill,
    status,
    startedAt: value.startedAt ? Math.max(0, finite(value.startedAt)) : null,
    completedAt: value.completedAt ? Math.max(0, finite(value.completedAt)) : null,
  };
}

function sanitizeSnapshot(value = {}) {
  return {
    wpm: round(Math.max(0, finite(value.wpm))),
    accuracy: round(clamp(finite(value.accuracy), 0, 100)),
    cleanPercent: value.cleanPercent == null ? null : round(clamp(finite(value.cleanPercent), 0, 100)),
    correctionsPerWord: value.correctionsPerWord == null ? null : round(Math.max(0, finite(value.correctionsPerWord)), 2),
    sameTestRuns: Math.max(0, Math.min(50, Math.round(finite(value.sameTestRuns)))),
    consistency: ["Building", "Stable", "Variable", "Volatile"].includes(value.consistency) ? value.consistency : "Building",
  };
}

function sanitizeComparison(value) {
  if (!value || typeof value !== "object") return null;
  return {
    wpmDelta: round(value.wpmDelta),
    accuracyDelta: round(value.accuracyDelta),
    cleanDelta: value.cleanDelta == null ? null : round(value.cleanDelta),
    correctionsDelta: value.correctionsDelta == null ? null : round(value.correctionsDelta, 2),
  };
}

function sanitizePlan(value) {
  if (!value || value.version !== TYPING_COACH_V7_VERSION) return null;
  const sourceSessionId = safeId(value.sourceSessionId);
  if (!sourceSessionId) return null;
  const steps = (Array.isArray(value.steps) ? value.steps : [])
    .slice(0, MAX_STEPS)
    .map(sanitizeStep)
    .filter(Boolean);
  if (!steps.length || steps.at(-1)?.kind !== "retest") return null;
  const status = value.status === "completed" ? "completed" : "active";
  return {
    version: TYPING_COACH_V7_VERSION,
    planId: safeId(value.planId, `typing-plan-${sourceSessionId}`),
    localDayKey: String(value.localDayKey || "unknown").slice(0, 20),
    sourceSessionId,
    configId: safeId(value.configId),
    wordSetId: safeId(value.wordSetId),
    status,
    createdAt: Math.max(0, finite(value.createdAt, Date.now())),
    updatedAt: Math.max(0, finite(value.updatedAt, value.createdAt || Date.now())),
    estimatedMinutes: Math.max(1, Math.min(20, Math.round(finite(value.estimatedMinutes, 3)))),
    focusWords: unique((value.focusWords || []).map((word) => safeTarget(word, "word"))).slice(0, 8),
    snapshot: sanitizeSnapshot(value.snapshot),
    steps,
    retestRequestedAt: value.retestRequestedAt ? Math.max(0, finite(value.retestRequestedAt)) : null,
    retestSessionId: safeId(value.retestSessionId),
    completedAt: value.completedAt ? Math.max(0, finite(value.completedAt)) : null,
    comparison: sanitizeComparison(value.comparison),
  };
}

function isResolved(step) {
  return step?.status === "complete" || step?.status === "skipped";
}

function withUpdatedSteps(plan, steps, patch = {}) {
  const next = sanitizePlan({
    ...plan,
    ...patch,
    steps,
    updatedAt: Date.now(),
  });
  if (!next || !writeJson(TYPING_COACH_V7_PLAN_KEY, next)) return null;
  return Object.freeze(next);
}

export function buildTypingCoachV7(v6Plan, { now = Date.now() } = {}) {
  if (!v6Plan || v6Plan.version !== 6 || !v6Plan.sourceSessionId) return null;
  const practiceDrills = orderPracticeDrills(v6Plan);
  if (!practiceDrills.length) return null;
  const dayKey = localDayKey(now);
  const sourceSessionId = safeId(v6Plan.sourceSessionId);
  if (!sourceSessionId) return null;
  const steps = practiceDrills.map((drill, index) => ({
    id: index === 0 ? "focus" : "reinforce",
    kind: "practice",
    stage: index === 0 ? "Focus" : "Reinforce",
    title: drill.title,
    description: index === 0
      ? drill.rationale
      : `Reinforce the same test with ${drill.title.toLowerCase()} before measuring transfer.`,
    drill,
    status: "pending",
  }));
  steps.push({
    id: "verify",
    kind: "retest",
    stage: "Verify",
    title: "Retest original",
    description: "Run the exact original Typing Test again and compare the result with your baseline.",
    status: "pending",
  });
  const baseline = v6Plan.baseline || {};
  const performance = v6Plan.performance || {};
  const plan = sanitizePlan({
    version: TYPING_COACH_V7_VERSION,
    planId: `typing-plan-${dayKey}-${sourceSessionId}`,
    localDayKey: dayKey,
    sourceSessionId,
    configId: v6Plan.configId,
    wordSetId: v6Plan.wordSetId,
    status: "active",
    createdAt: typeof now === "function" ? new Date(now()).getTime() : new Date(now).getTime(),
    updatedAt: typeof now === "function" ? new Date(now()).getTime() : new Date(now).getTime(),
    estimatedMinutes: practiceDrills.length * Math.max(1, Math.round(finite(v6Plan.estimatedMinutes, 2))) + 1,
    focusWords: v6Plan.focusWords,
    snapshot: {
      wpm: baseline.wpm,
      accuracy: baseline.accuracy,
      cleanPercent: baseline.cleanPercent,
      correctionsPerWord: baseline.correctionsPerWord,
      sameTestRuns: performance.runCount,
      consistency: consistencyLabel(performance),
    },
    steps,
  });
  return plan ? Object.freeze(plan) : null;
}

export function loadTypingCoachV7Plan() {
  const plan = sanitizePlan(readJson(TYPING_COACH_V7_PLAN_KEY, null));
  return plan ? Object.freeze(plan) : null;
}

export function saveTypingCoachV7Plan(plan) {
  const safe = sanitizePlan(plan);
  if (!safe || !writeJson(TYPING_COACH_V7_PLAN_KEY, safe)) return null;
  return Object.freeze(safe);
}

export function ensureTypingCoachV7Plan(v6Plan, options = {}) {
  const current = loadTypingCoachV7Plan();
  if (current && (
    current.sourceSessionId === v6Plan?.sourceSessionId
    || current.retestSessionId === v6Plan?.sourceSessionId
  )) return current;
  const next = buildTypingCoachV7(v6Plan, options);
  return next ? saveTypingCoachV7Plan(next) : null;
}

export function getTypingCoachV7Progress(plan = loadTypingCoachV7Plan()) {
  if (!plan) return Object.freeze({ completed: 0, total: 0, percent: 0, practiceResolved: false });
  const completed = plan.steps.filter(isResolved).length;
  const total = plan.steps.length;
  const practice = plan.steps.filter((step) => step.kind === "practice");
  return Object.freeze({
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    practiceResolved: practice.every(isResolved),
  });
}

export function isTypingCoachV7StepAvailable(plan, stepId) {
  if (!plan || plan.status === "completed") return false;
  const index = plan.steps.findIndex((step) => step.id === stepId);
  if (index < 0) return false;
  const step = plan.steps[index];
  if (isResolved(step) || step.status === "requested") return false;
  return plan.steps.slice(0, index).every(isResolved);
}

export function markTypingCoachV7StepStarted(stepId) {
  const plan = loadTypingCoachV7Plan();
  if (!plan || !isTypingCoachV7StepAvailable(plan, stepId)) return plan;
  const steps = clone(plan.steps);
  const index = steps.findIndex((step) => step.id === stepId);
  steps[index] = { ...steps[index], status: "active", startedAt: Date.now() };
  return withUpdatedSteps(plan, steps);
}

export function skipTypingCoachV7Step(stepId) {
  const plan = loadTypingCoachV7Plan();
  if (!plan || !isTypingCoachV7StepAvailable(plan, stepId)) return plan;
  const steps = clone(plan.steps);
  const index = steps.findIndex((step) => step.id === stepId);
  if (steps[index]?.kind !== "practice") return plan;
  steps[index] = { ...steps[index], status: "skipped", completedAt: Date.now() };
  return withUpdatedSteps(plan, steps);
}

export function markTypingCoachV7PracticeCompleted({ sourceSessionId = null, drillType = null, target = null } = {}) {
  const plan = loadTypingCoachV7Plan();
  if (!plan || plan.status === "completed") return plan;
  if (sourceSessionId && sourceSessionId !== plan.sourceSessionId) return plan;
  const steps = clone(plan.steps);
  const index = steps.findIndex((step) => (
    step.kind === "practice"
    && !isResolved(step)
    && (!drillType || step.drill?.type === drillType)
    && (!target || step.drill?.target === String(target).toLowerCase())
  ));
  if (index < 0) return plan;
  steps[index] = { ...steps[index], status: "complete", completedAt: Date.now() };
  return withUpdatedSteps(plan, steps);
}

export function markTypingCoachV7RetestRequested() {
  const plan = loadTypingCoachV7Plan();
  if (!plan || plan.status === "completed") return plan;
  const verifyIndex = plan.steps.findIndex((step) => step.kind === "retest");
  if (verifyIndex < 0 || !plan.steps.slice(0, verifyIndex).every(isResolved)) return plan;
  const steps = clone(plan.steps);
  steps[verifyIndex] = { ...steps[verifyIndex], status: "requested", startedAt: steps[verifyIndex].startedAt || Date.now() };
  return withUpdatedSteps(plan, steps, { retestRequestedAt: Date.now() });
}

function appendHistory(plan) {
  const history = readJson(TYPING_COACH_V7_HISTORY_KEY, []);
  const safeHistory = Array.isArray(history) ? history.map(sanitizePlan).filter(Boolean) : [];
  const deduped = safeHistory.filter((entry) => entry.planId !== plan.planId);
  writeJson(TYPING_COACH_V7_HISTORY_KEY, [plan, ...deduped].slice(0, MAX_HISTORY));
}

export function completeTypingCoachV7Retest(result, cycle = null) {
  const plan = loadTypingCoachV7Plan();
  if (!plan || plan.status === "completed" || !plan.retestRequestedAt || !result?.sessionId) return plan;
  if (cycle?.sourceSessionId && cycle.sourceSessionId !== plan.sourceSessionId) return plan;
  if (cycle?.after?.sessionId && cycle.after.sessionId !== result.sessionId) return plan;
  const steps = clone(plan.steps);
  const verifyIndex = steps.findIndex((step) => step.kind === "retest");
  if (verifyIndex < 0) return plan;
  steps[verifyIndex] = { ...steps[verifyIndex], status: "complete", completedAt: Date.now() };
  const completed = withUpdatedSteps(plan, steps, {
    status: "completed",
    retestSessionId: result.sessionId,
    completedAt: Date.now(),
    comparison: cycle?.comparison || null,
  });
  if (completed) appendHistory(completed);
  return completed;
}

export function getTypingCoachV7History() {
  const values = readJson(TYPING_COACH_V7_HISTORY_KEY, []);
  return Object.freeze((Array.isArray(values) ? values : [])
    .map(sanitizePlan)
    .filter((plan) => plan?.status === "completed")
    .slice(0, MAX_HISTORY)
    .map(Object.freeze));
}

export function clearTypingCoachV7Plan() {
  try { globalThis.localStorage?.removeItem(TYPING_COACH_V7_PLAN_KEY); } catch {}
}
