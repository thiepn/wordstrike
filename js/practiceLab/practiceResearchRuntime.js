import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeResearchRepository } from "./practiceResearchRepository.js";
import { createPracticeResearchService } from "./practiceResearchService.js";
import { createPracticeResearchBinding, assertPracticeResearchBindingMatches, trustPracticeResearchContentPlan } from "./practiceResearchBinding.js";
import { createPreparedPracticeResearchProbeSession } from "./practiceResearchProbeExperiment.js";
import { PRACTICE_RESEARCH_FOCUSED_MAPPING, PRACTICE_RESEARCH_STUDY_ID } from "./practiceResearchConstants.js";
import { createPracticeSessionId } from "./practiceIds.js";

const TERMINAL = new Set(["followup-complete", "expired", "abandoned", "technical-invalid", "closed"]);
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const iso = (value) => new Date(value instanceof Date ? value.getTime() : value).toISOString();
const localDay = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const readiness = (value) => value?.eligible === true || value?.ready === true || value?.status === "ready";
const latestIso = (values = []) => values.filter((value) => Number.isFinite(Date.parse(value ?? ""))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

function treatmentSetupArgs(assignment, sessionId) {
  const target = assignment.target;
  const common = { targetSource: "research-plan", sessionId };
  if (assignment.treatment.experimentId === "weak-keys") return { ...common, entityKey: target.entityKey };
  if (assignment.treatment.experimentId === "combination-repair") return { ...common, entityType: target.entityType, entityKey: target.entityKey };
  if (assignment.treatment.experimentId === "problem-words") return { ...common, entityKey: target.entityKey };
  if (assignment.treatment.experimentId === "weakness-boss") return { ...common, statId: target.statId };
  throw new TypeError(`Unsupported randomized Practice treatment: ${assignment.treatment.experimentId}`);
}

function sessionMatchesTarget(session, assignment) {
  const targets = session?.contentPlan?.targetEntities ?? [];
  return targets.some((target) => target?.directTarget === true
    && target.entityType === assignment.target.entityType
    && target.entityKey === assignment.target.entityKey);
}

export function createPracticeResearchRuntime({
  experimentRegistry,
  dataStore = null,
  manifestStore = null,
  practiceRepository = null,
  researchRepository = null,
  now = () => new Date(),
  cryptoImpl = globalThis.crypto,
  logger = null,
} = {}) {
  if (!experimentRegistry?.getRegistration) throw new TypeError("Practice Research runtime requires the experiment registry");
  const ownsStore = !dataStore && !practiceRepository;
  const store = dataStore ?? createPracticeIndexedDbStore();
  const manifests = manifestStore ?? createPracticeManifestStore();
  const practiceRepo = practiceRepository ?? createPracticeRepository({ dataStore: store, manifestStore: manifests });
  const researchRepo = researchRepository ?? createPracticeResearchRepository({ dataStore: store, now });
  let initialized = null;
  let service = null;

  const time = () => {
    const value = typeof now === "function" ? now() : now;
    return value instanceof Date ? value : new Date(value);
  };

  async function ensureInitialized() {
    if (!initialized) initialized = await practiceRepo.initializePracticeStorage();
    if (!service) service = createPracticeResearchService({
      repository: researchRepo,
      now: time,
      cryptoImpl,
      targetProvider: provideTargets,
      contaminationProvider: provideContamination,
    });
    return initialized;
  }

  async function focusedReadiness(candidate) {
    const experimentId = PRACTICE_RESEARCH_FOCUSED_MAPPING[candidate.entityType];
    const registration = experimentRegistry.getRegistration(experimentId);
    const runtime = registration?.runtime;
    if (!runtime?.inspectTarget) return false;
    if (experimentId === "combination-repair") return readiness(await runtime.inspectTarget({ entityType: candidate.entityType, entityKey: candidate.entityKey }));
    return readiness(await runtime.inspectTarget({ entityKey: candidate.entityKey }));
  }

  async function recentContextRecords(profileId, contextId) {
    const [sessions, coachPlans] = await Promise.all([
      store.query("sessionSummaries", "contextId", contextId),
      store.query("coachPlans", "profileContextDay", [profileId, contextId, localDay(time())]).catch(() => []),
    ]);
    return {
      sessions: sessions.filter((item) => item.profileId === profileId && item.contextId === contextId),
      coachPlans: coachPlans.filter((item) => item.profileId === profileId && item.contextId === contextId),
    };
  }

  async function provideTargets({ enrollment } = {}) {
    await ensureInitialized();
    const boss = experimentRegistry.getRegistration("weakness-boss")?.runtime;
    if (!boss?.loadCandidates) return [];
    const state = await boss.loadCandidates();
    if (!state?.available) return [];
    const contextRecords = await recentContextRecords(enrollment.profileId, enrollment.contextId);
    const output = [];
    for (const candidate of state.candidates ?? []) {
      const [focusedContentReady, reviewRecords, priorAssignments] = await Promise.all([
        focusedReadiness(candidate),
        store.query("reviewItems", "profileContextEntity", [enrollment.profileId, enrollment.contextId, candidate.entityType, candidate.entityKey]).catch(() => []),
        store.query("researchAssignments", "targetStatId", candidate.statId).catch(() => []),
      ]);
      const directSessions = contextRecords.sessions.filter((summary) => summary.experimentId !== "research-target-probe"
        && (summary.targetEntities ?? []).some((target) => target?.statId === candidate.statId || (target?.entityType === candidate.entityType && target?.entityKey === candidate.entityKey)));
      const reviewItem = reviewRecords[0] ?? null;
      const dueMs = Date.parse(reviewItem?.dueAtUtc ?? "");
      const researchAssignments = priorAssignments.filter((item) => item.profileId === enrollment.profileId && item.contextId === enrollment.contextId);
      const coachConflict = contextRecords.coachPlans.some((plan) => JSON.stringify(plan).includes(candidate.statId));
      output.push(freezeDeep({
        entityType: candidate.entityType,
        statId: candidate.statId,
        entityKey: candidate.entityKey,
        weaknessStatus: candidate.limiterStatus,
        hierarchyStatus: candidate.hierarchyStatus,
        stableAnchor: false,
        saturationStatus: candidate.saturationStatus,
        learningHeadroom: Number(candidate.utilityBreakdown?.headroom ?? 0),
        bossTargetUtility: candidate.bossTargetUtility,
        bossContentReady: candidate.contentReady === true,
        focusedContentReady,
        canonicalTreatment: PRACTICE_RESEARCH_FOCUSED_MAPPING[candidate.entityType],
        retentionReviewState: reviewItem?.state === "active" && Number.isFinite(dueMs) && dueMs <= time().getTime() ? "due" : "inactive",
        coachConflict,
        lastDirectPractisedAt: latestIso(directSessions.map((summary) => summary.completedAtUtc)),
        lastResearchAssignedAt: latestIso(researchAssignments.map((item) => item.createdAt)),
      }));
    }
    return Object.freeze(output);
  }

  async function provideContamination({ assignment, from, to } = {}) {
    await ensureInitialized();
    const sessions = await practiceRepo.listTreatmentIntervalSessions(assignment.profileId, assignment.contextId, from, to);
    return sessions.flatMap((summary) => {
      if (summary.researchBinding?.researchAssignmentId === assignment.researchAssignmentId && summary.researchBinding?.phase === "followup") return [];
      if (summary.experimentId === "custom-text") return [{ kind: "custom-text", sessionId: summary.sessionId }];
      const sameTarget = (summary.targetEntities ?? []).some((target) => target?.statId === assignment.target.statId
        || (target?.entityType === assignment.target.entityType && target?.entityKey === assignment.target.entityKey));
      if (sameTarget && summary.retentionReviewSummary) return [{ kind: "retention-review", statId: assignment.target.statId, sessionId: summary.sessionId }];
      if (sameTarget) return [{ kind: "direct-target-practice", statId: assignment.target.statId, sessionId: summary.sessionId }];
      if (summary.experimentId === "real-text") return [{ kind: "broad-real-text-practice", sessionId: summary.sessionId }];
      return [{ kind: "unrelated-target-practice", sessionId: summary.sessionId }];
    });
  }

  async function currentEnrollment() {
    const current = await ensureInitialized();
    return (await researchRepo.listEnrollments(current.profile.profileId, { contextId: current.context.contextId, studyId: PRACTICE_RESEARCH_STUDY_ID }))[0] ?? null;
  }

  async function getState() {
    const current = await ensureInitialized();
    const enrollment = await currentEnrollment();
    if (!enrollment) return freezeDeep({
      status: "not-enrolled",
      profileId: current.profile.profileId,
      contextId: current.context.contextId,
      enrollment: null,
      assignments: [],
      activeAssignment: null,
      analysis: null,
    });
    const snapshot = await service.snapshot(enrollment.researchEnrollmentId);
    return freezeDeep({ status: "ready", profileId: current.profile.profileId, contextId: current.context.contextId, ...snapshot });
  }

  async function enroll() {
    const current = await ensureInitialized();
    return service.enroll({ profileId: current.profile.profileId, contextId: current.context.contextId, consented: true });
  }

  async function createAssignment() {
    const enrollment = await currentEnrollment();
    if (!enrollment) throw new TypeError("Enroll in Practice Research before creating an assignment");
    return service.createAssignment(enrollment.researchEnrollmentId);
  }

  async function prepareProbe(assignmentId, phase) {
    await ensureInitialized();
    let assignment = await researchRepo.getAssignment(assignmentId);
    if (!assignment) throw new TypeError("Practice Research assignment not found");
    if (phase === "baseline") assignment = await service.beginBaseline(assignmentId);
    else assignment = await service.refreshAssignment(assignmentId);
    if (phase === "baseline" && assignment.status !== "baseline-active") throw new TypeError("Baseline probe is not available in this assignment state");
    if (phase === "followup" && assignment.status !== "followup-ready") throw new TypeError("Follow-up probe is not ready");
    const binding = await createPracticeResearchBinding(assignment, phase, cryptoImpl);
    await assertPracticeResearchBindingMatches(binding, assignment, { phase, statId: assignment.target.statId, cryptoImpl });
    return createPreparedPracticeResearchProbeSession({ assignment, phase, binding });
  }

  async function completeProbe(assignmentId, phase, finalResult) {
    const metrics = finalResult?.summary?.beforeMetrics ?? null;
    const result = { ...(metrics ?? {}), completedAt: finalResult?.summary?.completedAtUtc ?? iso(time()) };
    if (phase === "baseline") {
      const recorded = await service.recordBaseline(assignmentId, result);
      if (recorded?.baseline?.status === "valid") return service.revealTreatment(assignmentId);
      return recorded;
    }
    return service.recordFollowup(assignmentId, result);
  }

  async function prepareTreatment(assignmentId) {
    await ensureInitialized();
    let assignment = await researchRepo.getAssignment(assignmentId);
    if (!assignment) throw new TypeError("Practice Research assignment not found");
    if (assignment.status === "baseline-complete") assignment = await service.revealTreatment(assignmentId);
    if (assignment.status !== "treatment-revealed") throw new TypeError("Randomized treatment is not ready");
    const registration = experimentRegistry.getRegistration(assignment.treatment.experimentId);
    if (!registration?.setupFactory || !registration?.sessionFactory) throw new TypeError("Assigned canonical Practice treatment is unavailable");
    const sessionId = createPracticeSessionId();
    const prepared = await registration.setupFactory(treatmentSetupArgs(assignment, sessionId));
    const session = await registration.sessionFactory(prepared);
    if (!sessionMatchesTarget(session, assignment)) throw new TypeError("Assigned treatment prepared a mismatched target");
    const binding = await createPracticeResearchBinding(assignment, "treatment", cryptoImpl);
    await assertPracticeResearchBindingMatches(binding, assignment, { phase: "treatment", statId: assignment.target.statId, cryptoImpl });
    trustPracticeResearchContentPlan(session.contentPlan, binding);
    assignment = await service.startTreatment(assignmentId, sessionId);
    return freezeDeep({ assignment, experimentId: assignment.treatment.experimentId, sessionId, binding, session });
  }

  async function completeTreatment(assignmentId, finalResult) {
    const summary = finalResult?.summary ?? null;
    if (summary?.status === "completed") return service.completeTreatment(assignmentId, summary.sessionId);
    return abandonTreatment(assignmentId, "treatment-not-completed");
  }

  async function abandonTreatment(assignmentId, reason = "treatment-abandoned") {
    const record = await researchRepo.getAssignment(assignmentId);
    if (!record || record.status !== "treatment-active") return record;
    const at = iso(time());
    return researchRepo.saveAssignment(freezeDeep({
      ...record,
      status: "abandoned",
      abandonReason: reason,
      treatment: { ...record.treatment, status: "abandoned" },
      analysisEligibility: "treatment-incomplete",
      updatedAt: at,
      closedAt: at,
    }));
  }

  async function declineTreatment(assignmentId) { return service.declineTreatment(assignmentId); }
  async function setEnrollmentStatus(status) {
    const enrollment = await currentEnrollment();
    return enrollment ? service.setEnrollmentStatus(enrollment.researchEnrollmentId, status) : null;
  }
  async function deleteEnrollment() {
    const enrollment = await currentEnrollment();
    return enrollment ? service.deleteResearchRecords(enrollment.researchEnrollmentId) : { deleted: false };
  }

  return Object.freeze({
    getState,
    enroll,
    createAssignment,
    prepareProbe,
    completeProbe,
    prepareTreatment,
    completeTreatment,
    abandonTreatment,
    declineTreatment,
    setEnrollmentStatus,
    deleteEnrollment,
    close() {
      try { service?.close?.(); } catch (error) { logger?.warn?.("Practice Research service close failed", error); }
      if (ownsStore) try { store.close?.(); } catch {}
    },
  });
}
