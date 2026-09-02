import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_RULES_VERSION,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRush/arcadeRushContract.js";
import { validateArcadeRushCanonicalResult } from "./arcadeRush/arcadeRushResult.js";
import { ARCADE_RUSH_LEADERBOARD_BOARD_KEY } from "./arcadeRushLeaderboard.js";
import { getAllModes, MODE_IDS } from "./modes.js";

export const ARCADE_RUSH_SHADOW_CERTIFICATION_VERSION = 1;
export const ARCADE_RUSH_SHADOW_QUERY_VALUE = "v1";

function searchParams(search = "") {
  try {
    return new URLSearchParams(String(search || "").replace(/^\?/, ""));
  } catch {
    return new URLSearchParams();
  }
}

export function isArcadeRushShadowCertificationEnabled(
  search = globalThis.location?.search || "",
) {
  const params = searchParams(search);
  return (
    params.get("dev") === "1" &&
    params.get("mode") === ARCADE_RUSH_MODE_ID &&
    params.get("rushShadow") === ARCADE_RUSH_SHADOW_QUERY_VALUE
  );
}

export function getArcadeRushShadowRunPolicy(
  search = globalThis.location?.search || "",
) {
  const params = searchParams(search);
  const enabled = isArcadeRushShadowCertificationEnabled(search);
  return Object.freeze({
    version: ARCADE_RUSH_SHADOW_CERTIFICATION_VERSION,
    enabled,
    effectiveDeveloperMode: enabled ? false : null,
    allowDeveloperSeedOverride: !enabled,
    ignoredDeveloperSeedOverride: enabled && params.has("rushSeed"),
    boardKey: ARCADE_RUSH_LEADERBOARD_BOARD_KEY,
    contractVersion: ARCADE_RUSH_CONTRACT_VERSION,
    rulesVersion: ARCADE_RUSH_RULES_VERSION,
  });
}

function productionIsolationGate() {
  const publicIds = getAllModes().map(({ id }) => id);
  const dailyPublic = publicIds.includes(MODE_IDS.DAILY);
  const rushPublic = publicIds.includes(MODE_IDS.ARCADE_RUSH);
  // Valid both before and after AR14: the replacement modes must never be
  // simultaneously public, and they must never both disappear.
  return dailyPublic !== rushPublic;
}

function validShadowResult(result) {
  if (!result) return null;
  const validation = validateArcadeRushCanonicalResult(result);
  return Boolean(
    validation.valid &&
    result.modeId === ARCADE_RUSH_MODE_ID &&
    result.developerMode === false &&
    result.success === true &&
    result.modeData?.recordEligible === true &&
    result.modeData?.contractVersion === ARCADE_RUSH_CONTRACT_VERSION &&
    result.modeData?.rulesVersion === ARCADE_RUSH_RULES_VERSION &&
    result.modeData?.wavesCompleted === ARCADE_RUSH_WAVE_COUNT &&
    result.modeData?.bossDefeated === true
  );
}

function submissionGate(result, submissionState) {
  if (!result?.success) return null;
  return Boolean(
    ["submitted", "already-submitted"].includes(submissionState?.status) &&
    submissionState?.boardKey === ARCADE_RUSH_LEADERBOARD_BOARD_KEY &&
    submissionState?.sessionId === result.sessionId
  );
}

function readbackGate(result, leaderboardState) {
  if (!result?.success) return null;
  return Boolean(
    leaderboardState?.selectedBoardKey === ARCADE_RUSH_LEADERBOARD_BOARD_KEY &&
    leaderboardState?.board?.boardKey === ARCADE_RUSH_LEADERBOARD_BOARD_KEY &&
    Number(leaderboardState?.board?.rulesVersion) === ARCADE_RUSH_RULES_VERSION &&
    leaderboardState?.status === "ready" &&
    leaderboardState?.viewer?.rank >= 1 &&
    leaderboardState?.viewer?.entry?.username
  );
}

export function createArcadeRushShadowCertificationSnapshot({
  search = globalThis.location?.search || "",
  result = null,
  runStartedPersisted = null,
  resultPersisted = null,
  recordFlags = null,
  submissionState = null,
  leaderboardState = null,
} = {}) {
  const policy = getArcadeRushShadowRunPolicy(search);
  const gates = Object.freeze({
    explicitShadowRoute: policy.enabled,
    productionIsolation: productionIsolationGate(),
    canonicalRankedResult: validShadowResult(result),
    runStartedPersisted: result ? runStartedPersisted === true : null,
    resultPersisted: result ? resultPersisted === true : null,
    serverSubmission: submissionGate(result, submissionState),
    leaderboardReadback: readbackGate(result, leaderboardState),
  });

  let status = "disabled";
  let blockingReason = null;
  if (policy.enabled) {
    if (!gates.productionIsolation) {
      status = "failed";
      blockingReason = "production-isolation";
    } else if (!result) {
      status = "awaiting-result";
    } else if (result.success !== true) {
      status = "run-failed";
      blockingReason = "successful-run-required";
    } else if (!gates.canonicalRankedResult) {
      status = "failed";
      blockingReason = "canonical-result";
    } else if (!gates.runStartedPersisted || !gates.resultPersisted) {
      status = "failed";
      blockingReason = "local-persistence";
    } else if (!gates.serverSubmission) {
      const submissionStatus = submissionState?.status;
      if (submissionStatus === "ineligible") {
        status = "blocked";
        blockingReason = submissionState?.reason || "submission-ineligible";
      } else if (submissionStatus === "error" || submissionStatus === "offline") {
        status = "blocked";
        blockingReason = submissionStatus;
      } else {
        status = "awaiting-submission";
      }
    } else if (!gates.leaderboardReadback) {
      status = "awaiting-readback";
    } else {
      status = "certified";
    }
  }

  return Object.freeze({
    version: ARCADE_RUSH_SHADOW_CERTIFICATION_VERSION,
    status,
    blockingReason,
    policy,
    gates,
    sessionId: typeof result?.sessionId === "string" ? result.sessionId : null,
    score: Number.isFinite(result?.score) ? result.score : null,
    recordFlags: recordFlags && typeof recordFlags === "object"
      ? Object.freeze({
        newBest: recordFlags.newBest === true,
        newBestCompletedScore: recordFlags.newBestCompletedScore === true,
      })
      : null,
    submission: submissionState ? Object.freeze({
      status: submissionState.status || null,
      boardKey: submissionState.boardKey || null,
      rank: Number.isSafeInteger(submissionState.rank) ? submissionState.rank : null,
      reason: submissionState.reason || null,
      errorCode: submissionState.error?.code || null,
    }) : null,
    leaderboard: leaderboardState ? Object.freeze({
      status: leaderboardState.status || null,
      boardKey: leaderboardState.board?.boardKey || leaderboardState.selectedBoardKey || null,
      rulesVersion: Number(leaderboardState.board?.rulesVersion) || null,
      viewerRank: Number.isSafeInteger(leaderboardState.viewer?.rank)
        ? leaderboardState.viewer.rank
        : null,
    }) : null,
  });
}

export function isArcadeRushShadowCertified(snapshot) {
  return snapshot?.status === "certified" && Object.values(snapshot.gates || {}).every(
    (value) => value === true,
  );
}
