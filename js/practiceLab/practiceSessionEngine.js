import {
  createPracticeSessionEngine as createPracticeSessionEngineV31,
  restorePracticeSessionEngine as restorePracticeSessionEngineV31,
} from "./practiceSessionEngineV31.js";
import {
  createPracticeTreatmentService,
  reconcilePracticeTreatmentTracking,
} from "./practiceTreatmentService.js";
import { createPracticeWeaknessBossTreatmentService } from "./practiceWeaknessBossTreatment.js";
import { PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID } from "./practiceWeaknessBossConstants.js";
import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticePhysicalTelemetryRepositoryFacade } from "./practicePhysicalTelemetryService.js";
import { createPracticePhysicalTelemetryRuntime } from "./practicePhysicalTelemetryRuntime.js";
import { reconcilePracticePhysicalTelemetry } from "./practicePhysicalTelemetryReconciliation.js";

function trackingLogger(options) {
  return options?.logger ?? console;
}

function sidecarRepository(repository, afterCanonicalCommit) {
  return Object.freeze({
    ...repository,
    async commitCompletedPracticeSession(payload) {
      const result = await repository.commitCompletedPracticeSession(payload);
      await afterCanonicalCommit(payload, result);
      return result;
    },
  });
}

export function createPracticeSessionEngine(options = {}) {
  const { repository, profileId, contextId, sessionId, wallClock = () => new Date() } = options;
  if (!repository) throw new TypeError("Practice engine requires a repository");
  const logger = trackingLogger(options);
  const standardTreatment = createPracticeTreatmentService({ repository, profileId, contextId, sessionId, wallClock, logger });
  const weaknessBossTreatment = createPracticeWeaknessBossTreatmentService({ repository, profileId, contextId, sessionId, wallClock, logger });
  let activeTreatment = standardTreatment;
  // Preserve the PL32 source-level sidecar contract while allowing PL37 to select
  // a treatment adapter before prepare. Every call still delegates to exactly one
  // active treatment service for the current session.
  const treatment = Object.freeze({
    prepare: (...args) => activeTreatment.prepare(...args),
    observeProgress: (...args) => activeTreatment.observeProgress(...args),
    flush: (...args) => activeTreatment.flush(...args),
    afterCanonicalCommit: (...args) => activeTreatment.afterCanonicalCommit(...args),
    abandon: (...args) => activeTreatment.abandon(...args),
    getEpisode: (...args) => activeTreatment.getEpisode(...args),
  });
  const physicalDataStore = options.physicalTelemetryDataStore ?? createPracticeIndexedDbStore();
  const ownsPhysicalDataStore = options.physicalTelemetryDataStore == null;
  const physicalRepository = createPracticePhysicalTelemetryRepositoryFacade({ dataStore: physicalDataStore, now: wallClock });
  const physical = createPracticePhysicalTelemetryRuntime({
    repository,
    telemetryRepository: physicalRepository,
    profileId,
    contextId,
    sessionId,
    wallClock,
    clock: options.clock,
    documentObject: options.documentObject,
    logger,
  });
  let core = null;
  let postCanonicalCommit = async () => {};
  let preparedContentPlan = null;
  let physicalAvailable = true;
  let physicalEligible = false;

  core = createPracticeSessionEngineV31({
    ...options,
    repository: sidecarRepository(repository, async (payload, result) => postCanonicalCommit(payload, result)),
  });

  const complete = async (reason) => {
    try {
      const result = await core.complete(reason);
      return result;
    } finally {
      physical.stop();
    }
  };

  postCanonicalCommit = async (payload) => {
    try {
      await treatment.flush();
      await treatment.afterCanonicalCommit({
        commitPayload: payload,
        retentionAnalysis: core?.getRetentionAnalysis?.() ?? null,
      });
    } catch (cause) {
      logger?.warn?.("Treatment tracking failed after canonical Practice commit", { cause });
    }
    if (physicalAvailable && physicalEligible) {
      try {
        await physical.afterCanonicalCommit({ sessionSummary: payload.sessionSummary, contentPlan: preparedContentPlan });
      } catch (cause) {
        logger?.warn?.("Physical telemetry failed after canonical Practice commit", { cause });
      }
    }
  };

  const unsubscribeTracking = core.subscribe((snapshot, event) => {
    try { treatment.observeProgress(snapshot, event); }
    catch (cause) { logger?.warn?.("Treatment tracking progress hook failed", { cause }); }
    if (["paused", "resumed", "content-appended", "restored"].includes(event)) physical.resetTimingContinuity();
  });

  const prepare = async (args = {}) => {
    activeTreatment = args.experiment?.id === PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID ? weaknessBossTreatment : standardTreatment;
    const prepared = await core.prepare(args);
    preparedContentPlan = args.contentPlan ?? null;
    try {
      await treatment.prepare({
        experiment: args.experiment,
        configuration: args.configuration ?? {},
        preparedContentPlan: args.contentPlan,
        coachBinding: core.getTrustedCoachBinding?.() ?? null,
      });
      await reconcilePracticeTreatmentTracking({ repository, profileId, contextId, now: wallClock });
    } catch (cause) {
      logger?.warn?.("Treatment tracking unavailable for prepared Practice session", { cause });
    }
    try {
      const eligibility = await physical.prepare({ contentPlan: args.contentPlan });
      physicalEligible = eligibility?.eligible === true;
      if (physicalEligible) {
        await physicalDataStore.open();
        await reconcilePracticePhysicalTelemetry({ repository: physicalRepository, profileId });
      }
    } catch (cause) {
      physicalAvailable = false;
      physicalEligible = false;
      logger?.warn?.("Physical telemetry unavailable for prepared Practice session", { cause });
    }
    return prepared;
  };

  const start = (...args) => {
    const started = core.start(...args);
    if (physicalAvailable && physicalEligible) physical.start();
    return started;
  };

  const handleInput = (rawInput) => {
    const outcome = core.handleInput(rawInput);
    if (physicalAvailable && physicalEligible) {
      try { physical.observeCanonicalInput(rawInput, outcome, core.getSnapshot?.() ?? null); }
      catch (cause) { logger?.warn?.("Physical telemetry input hook failed", { cause }); }
    }
    return outcome;
  };

  const abandon = async (reason = "manual-stop") => {
    try {
      const result = await core.abandon(reason);
      try { await treatment.abandon("abandoned-before-treatment"); }
      catch (cause) { logger?.warn?.("Treatment tracking abandonment hook failed", { cause }); }
      return result;
    } finally {
      physical.stop();
    }
  };

  const destroy = (...args) => {
    try { unsubscribeTracking?.(); } catch {}
    physical.stop();
    if (ownsPhysicalDataStore) {
      try { physicalDataStore.close(); } catch {}
    }
    return core.destroy?.(...args);
  };

  return Object.freeze({
    ...core,
    prepare,
    start,
    handleInput,
    complete,
    abandon,
    destroy,
    getTreatmentEpisode() { return treatment.getEpisode(); },
    getPhysicalTelemetryDiagnostics() { return physical.getDiagnostics(); },
  });
}

export async function restorePracticeSessionEngine(options = {}) {
  const restored = await restorePracticeSessionEngineV31(options);
  const { repository, profileId, contextId } = options;
  if (repository && profileId) {
    try { await reconcilePracticeTreatmentTracking({ repository, profileId, contextId, now: options.wallClock ?? Date.now }); }
    catch (cause) { trackingLogger(options)?.warn?.("Treatment tracking reconciliation failed during restore", { cause }); }
  }
  // PL36 intentionally does not reconstruct physical events from checkpoints/session summaries.
  return restored;
}
