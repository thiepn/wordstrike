import {
  createPracticeSessionEngine as createPracticeSessionEngineV31,
  restorePracticeSessionEngine as restorePracticeSessionEngineV31,
} from "./practiceSessionEngineV31.js";
import {
  createPracticeTreatmentService,
  reconcilePracticeTreatmentTracking,
} from "./practiceTreatmentService.js";

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
  let core = null;

  const afterCanonicalCommit = async (payload) => {
    try {
      await treatment.flush();
      await treatment.afterCanonicalCommit({
        commitPayload: payload,
        retentionAnalysis: core?.getRetentionAnalysis?.() ?? null,
      });
    } catch (cause) {
      logger?.warn?.("Treatment tracking failed after canonical Practice commit", { cause });
    }
  };

  core = createPracticeSessionEngineV31({
    ...options,
    repository: sidecarRepository(repository, afterCanonicalCommit),
  });

  const unsubscribeTracking = core.subscribe((snapshot, event) => {
    try { treatment.observeProgress(snapshot, event); }
    catch (cause) { logger?.warn?.("Treatment tracking progress hook failed", { cause }); }
  });

  const prepare = async (args = {}) => {
    const prepared = await core.prepare(args);
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
    return prepared;
  };

  const complete = async (reason) => core.complete(reason);

  const abandon = async (reason = "manual-stop") => {
    const result = await core.abandon(reason);
    try { await treatment.abandon("abandoned-before-treatment"); }
    catch (cause) { logger?.warn?.("Treatment tracking abandonment hook failed", { cause }); }
    return result;
  };

  const destroy = (...args) => {
    try { unsubscribeTracking?.(); } catch {}
    return core.destroy?.(...args);
  };

  return Object.freeze({
    ...core,
    prepare,
    complete,
    abandon,
    destroy,
    getTreatmentEpisode() { return treatment.getEpisode(); },
  });
}

export async function restorePracticeSessionEngine(options = {}) {
  const restored = await restorePracticeSessionEngineV31(options);
  const { repository, profileId, contextId } = options;
  if (repository && profileId) {
    try { await reconcilePracticeTreatmentTracking({ repository, profileId, contextId, now: options.wallClock ?? Date.now }); }
    catch (cause) { trackingLogger(options)?.warn?.("Treatment tracking reconciliation failed during restore", { cause }); }
  }
  return restored;
}
