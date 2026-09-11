import {
  createPracticeSessionEngine as createPracticeSessionEngineV31,
  restorePracticeSessionEngine as restorePracticeSessionEngineV31,
} from "./practiceSessionEngineV31.js";
import {
  createPracticeTreatmentService,
  reconcilePracticeTreatmentTracking,
} from "./practiceTreatmentService.js";
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
  const treatment = createPracticeTreatmentService({ repository, profileId, contextId, sessionId, wallClock, logger });
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

  core = createPracticeSessionEngineV31({
    ...options,
    repository: sidecarRepository(repository, async (payload, result) => postCanonicalCommit(payload, result)),
  });

  const complete = async (reason) => {
    try { return await core.complete(reason); }
    finally { physical.stop(); }
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
    if (physicalAvailable) {
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
      await physicalDataStore.open();
      await physical.prepare({ contentPlan: args.contentPlan });
      await reconcilePracticePhysicalTelemetry({ repository: physicalRepository, profileId });
    } catch (cause) {
      physicalAvailable = false;
      logger?.warn?.("Physical telemetry unavailable for prepared Practice session", { cause });
    }
    return prepared;
  };

  const start = (...args) => {
    const started = core.start(...args);
    if (physicalAvailable) physical.start();
    return started;
  };

  const handleInput = (rawInput) => {
    const outcome = core.handleInput(rawInput);
    if (physicalAvailable) {
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
