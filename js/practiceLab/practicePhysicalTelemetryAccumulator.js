import { derivePracticeLatencyTransitionCandidate } from "./practiceLatencyClassifier.js";
import { PRACTICE_PHYSICAL_LIMITS } from "./practicePhysicalTelemetryConstants.js";
import {
  classifyPracticePhysicalOutputClass,
  createPracticePhysicalModifierRouteKey,
  isPracticePhysicalTelemetryEventEligible,
} from "./practicePhysicalTelemetryEvent.js";

const insertionType = (type) => type === "character" || type === "space";
const finite = (value) => Number.isFinite(value) ? Number(value) : null;

function emptyKey(code) {
  return { entityType: "physical-key", entityKey: code, activationCount: 0, firstPassActivationCount: 0, firstPassCorrectActivationCount: 0, firstPassErrorOriginCount: 0, timingEligibleCount: 0, fluentCount: 0, disfluentCount: 0, residualSamples: [], fluentLatencySamples: [] };
}
function emptyTransition(key) {
  return { entityType: "physical-transition", entityKey: key, timingEligibleCount: 0, fluentCount: 0, disfluentCount: 0, residualSamples: [], fluentLatencySamples: [] };
}
function emptyRoute(key) {
  return { entityType: "modifier-route", entityKey: key, opportunityCount: 0, timingEligibleCount: 0, residualSamples: [] };
}
function pushSample(array, value) {
  if (!Number.isFinite(value)) return;
  if (array.length < PRACTICE_PHYSICAL_LIMITS.sessionSamplesPerEntity) array.push(Number(value));
}
function freezeDelta(value) {
  return Object.freeze({ ...value, residualSamples: Object.freeze([...(value.residualSamples || [])]), ...(value.fluentLatencySamples ? { fluentLatencySamples: Object.freeze([...value.fluentLatencySamples]) } : {}) });
}

export function createPracticePhysicalTelemetryAccumulator() {
  const keys = new Map();
  const transitions = new Map();
  const routes = new Map();
  let eligibleTextEventCount = 0;
  let validCodeEventCount = 0;
  let priorCanonicalInsertion = null;
  let priorPhysicalSuccess = null;
  let correctionSincePrior = false;
  let excludedRepeatCount = 0;
  let excludedCompositionCount = 0;
  let excludedDeadKeyCount = 0;
  let excludedShortcutCount = 0;
  let excludedCodeCount = 0;
  let routeUnclassifiedCount = 0;

  function resetTimingContinuity() {
    priorCanonicalInsertion = null;
    priorPhysicalSuccess = null;
    correctionSincePrior = false;
  }

  function recordCorrection() {
    correctionSincePrior = true;
    priorPhysicalSuccess = null;
  }

  function recordProcessedInput({ physicalEvent = null, processedInput = null, timingResidualMs = null, timingClassification = null } = {}) {
    if (!processedInput || !insertionType(processedInput.type) || processedInput.accepted === false) return false;
    eligibleTextEventCount += 1;
    if (!physicalEvent || !isPracticePhysicalTelemetryEventEligible(physicalEvent)) {
      if (physicalEvent?.repeat) excludedRepeatCount += 1;
      else if (physicalEvent?.composing) excludedCompositionCount += 1;
      else if (physicalEvent?.dead) excludedDeadKeyCount += 1;
      else if (physicalEvent?.commandShortcut) excludedShortcutCount += 1;
      else excludedCodeCount += 1;
      priorCanonicalInsertion = processedInput.event ?? null;
      priorPhysicalSuccess = null;
      correctionSincePrior = false;
      return false;
    }
    validCodeEventCount += 1;
    const code = physicalEvent.code;
    const key = keys.get(code) ?? emptyKey(code);
    key.activationCount += 1;
    const firstPass = processedInput.isFirstAttempt === true;
    const correct = processedInput.correctness === "correct" || processedInput.correctness === true;
    if (firstPass) key.firstPassActivationCount += 1;
    if (firstPass && correct) key.firstPassCorrectActivationCount += 1;
    if (firstPass && !correct && processedInput.primaryErrorOrigin !== false) key.firstPassErrorOriginCount += 1;

    const event = processedInput.event ?? {
      type: processedInput.type,
      correctness: correct ? "correct" : "incorrect",
      isFirstAttempt: firstPass,
      timingSegmentId: processedInput.timingSegmentId,
      timingSegmentStartReason: processedInput.timingSegmentStartReason,
      latencyFromPriorInsertionMs: finite(processedInput.latencyFromPriorInsertionMs),
    };
    const timingCandidate = derivePracticeLatencyTransitionCandidate({ event, priorInsertion: priorCanonicalInsertion, correctionSincePrior });
    const timingEligible = processedInput.timingEligible === true || timingCandidate.baselineEligible === true;
    if (timingEligible && firstPass && correct) {
      key.timingEligibleCount += 1;
      if (timingClassification === "fluent") key.fluentCount += 1;
      else if (timingClassification === "disfluent") key.disfluentCount += 1;
      pushSample(key.residualSamples, timingResidualMs);
      if (timingClassification === "fluent") pushSample(key.fluentLatencySamples, event.latencyFromPriorInsertionMs);
    }
    keys.set(code, key);

    if (firstPass && correct) {
      const outputClass = classifyPracticePhysicalOutputClass(processedInput.expected ?? processedInput.value ?? "");
      const routeKey = createPracticePhysicalModifierRouteKey({ outputClass, physicalEvent });
      if (routeKey) {
        if (!routes.has(routeKey) && routes.size >= PRACTICE_PHYSICAL_LIMITS.sessionModifierRoutes) routeUnclassifiedCount += 1;
        else {
          const route = routes.get(routeKey) ?? emptyRoute(routeKey);
          route.opportunityCount += 1;
          if (timingEligible) {
            route.timingEligibleCount += 1;
            pushSample(route.residualSamples, timingResidualMs);
          }
          routes.set(routeKey, route);
        }
      } else routeUnclassifiedCount += 1;
    }

    if (firstPass && correct && timingEligible && priorPhysicalSuccess?.firstPassCorrect && priorPhysicalSuccess?.timingSegmentId === event.timingSegmentId) {
      const transitionKey = `${priorPhysicalSuccess.code}>${code}`;
      const transition = transitions.get(transitionKey) ?? emptyTransition(transitionKey);
      transition.timingEligibleCount += 1;
      if (timingClassification === "fluent") transition.fluentCount += 1;
      else if (timingClassification === "disfluent") transition.disfluentCount += 1;
      pushSample(transition.residualSamples, timingResidualMs);
      if (timingClassification === "fluent") pushSample(transition.fluentLatencySamples, event.latencyFromPriorInsertionMs);
      transitions.set(transitionKey, transition);
    }

    priorCanonicalInsertion = event;
    priorPhysicalSuccess = firstPass && correct ? { code, firstPassCorrect: true, timingSegmentId: event.timingSegmentId } : null;
    correctionSincePrior = false;
    return true;
  }

  function boundedTransitions() {
    return [...transitions.values()]
      .sort((a, b) => b.timingEligibleCount - a.timingEligibleCount || a.entityKey.localeCompare(b.entityKey))
      .slice(0, PRACTICE_PHYSICAL_LIMITS.sessionTransitions)
      .map(freezeDelta);
  }

  function snapshotDelta() {
    const valid = Math.min(validCodeEventCount, eligibleTextEventCount);
    return Object.freeze({
      eligibleTextEventCount,
      validCodeEventCount: valid,
      codeCoverage: eligibleTextEventCount ? valid / eligibleTextEventCount : 0,
      keys: Object.freeze([...keys.values()].sort((a, b) => a.entityKey.localeCompare(b.entityKey)).map(freezeDelta)),
      transitions: Object.freeze(boundedTransitions()),
      modifierRoutes: Object.freeze([...routes.values()].sort((a, b) => a.entityKey.localeCompare(b.entityKey)).map(freezeDelta)),
      diagnostics: Object.freeze({ excludedRepeatCount, excludedCompositionCount, excludedDeadKeyCount, excludedShortcutCount, excludedCodeCount, routeUnclassifiedCount }),
    });
  }

  return Object.freeze({ recordProcessedInput, recordCorrection, resetTimingContinuity, snapshotDelta });
}
