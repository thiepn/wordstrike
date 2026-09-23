import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/leaderboardProfile.js";
import {
  classifyStatus,
  logOperationalEvent,
  operationId,
  responseHeaders,
} from "../_shared/operations.js";
import { validateScoreSubmission } from "../_shared/scoreSubmission.js";

const MESSAGES: Record<string, string> = Object.freeze({
  NOT_AUTHENTICATED: "Sign in to submit this score.",
  PROFILE_REQUIRED: "Choose a public username before submitting scores.",
  INVALID_REQUEST: "The score submission request is invalid.",
  INVALID_BOARD: "Unsupported leaderboard.",
  BOARD_UNAVAILABLE: "This leaderboard is unavailable.",
  INVALID_SESSION_ID: "This result has no valid session ID.",
  UNSUPPORTED_CLIENT_VERSION: "This game version cannot submit scores.",
  INVALID_RESULT: "This result cannot be submitted.",
  INELIGIBLE_RESULT: "This result is not eligible for global submission.",
  INVALID_WORD_COUNTERS: "The submitted word counters are inconsistent.",
  INVALID_SESSION_SOURCE: "This result was not produced by a supported game flow.",
  INVALID_FAILURE_STATE: "The submitted completion state is inconsistent.",
  TEST_NOT_COMPLETED: "Only completed tests can be submitted.",
  RECORD_NOT_ELIGIBLE: "This result is not eligible for records.",
  DEVELOPER_RESULT: "Developer results cannot be submitted.",
  WORD_SET_VERSION_MISMATCH: "This Typing Test word-set version is unsupported.",
  METRIC_MISMATCH: "The submitted performance metrics are inconsistent.",
  SCORE_MISMATCH: "The submitted score is inconsistent.",
  UNSUPPORTED_TEST_DURATION: "This Typing Test duration is not supported.",
  UNSUPPORTED_WORD_SET: "This Typing Test word set is not supported.",
  RATE_LIMITED: "Too many scores were submitted recently.",
  METHOD_NOT_ALLOWED: "This request method is not supported.",
  SERVER_ERROR: "Global score submission is temporarily unavailable.",
});

function response(
  payload: unknown,
  status: number,
  cors: Record<string, string>,
  requestId: string,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(cors, requestId),
  });
}

function failure(
  code: string,
  status: number,
  cors: Record<string, string>,
  requestId: string,
) {
  const safeCode = code in MESSAGES ? code : "SERVER_ERROR";
  return response({
    ok: false,
    error: { code: safeCode, message: MESSAGES[safeCode] },
  }, status, cors, requestId);
}

Deno.serve(async (request) => {
  const requestId = operationId(request.headers);
  const started = Date.now();
  const cors = getCorsHeaders(request.headers.get("Origin"));
  if (!cors) return failure("INVALID_REQUEST", 403, {}, requestId);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...cors, "X-Request-ID": requestId } });
  }
  if (request.method !== "POST") return failure("METHOD_NOT_ALLOWED", 405, cors, requestId);

  const token = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return failure("NOT_AUTHENTICATED", 401, cors, requestId);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return failure("SERVER_ERROR", 500, cors, requestId);
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return failure("NOT_AUTHENTICATED", 401, cors, requestId);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return failure("INVALID_REQUEST", 400, cors, requestId);
  }
  const validation = validateScoreSubmission(body);
  if (!validation.valid) {
    logOperationalEvent("wordstrike.score.validation_failure", {
      request_id: requestId,
      service: "submit-score",
      category: "client",
      http_status: 400,
      board_key: typeof body.boardKey === "string" ? body.boardKey : null,
      error_code: validation.code,
      duration_ms: Date.now() - started,
    });
    return failure(validation.code, 400, cors, requestId);
  }
  const value = validation.value;

  try {
    const { data, error } = await client.rpc("submit_leaderboard_result", {
      p_user_id: userId,
      p_board_key: value.boardKey,
      p_session_id: value.sessionId,
      p_client_version: value.clientVersion,
      p_score: value.score,
      p_stage: value.stage,
      p_level: value.level,
      p_grade: value.grade,
      p_wpm: value.wpm,
      p_raw_wpm: value.rawWpm,
      p_accuracy: value.accuracy,
      p_duration_ms: value.durationMs,
      p_completed: value.completed,
      p_words_completed: value.wordsCompleted,
      p_integrity_remaining: value.integrityRemaining,
      p_challenge_date: value.challengeDate,
      p_challenge_version: value.challengeVersion,
      p_metrics: value.metrics,
    });
    if (error || !data || typeof data !== "object") {
      logOperationalEvent("wordstrike.score.failure", {
        request_id: requestId,
        service: "submit-score",
        category: "service",
        http_status: 500,
        board_key: value.boardKey,
        duration_ms: Date.now() - started,
      });
      return failure("SERVER_ERROR", 500, cors, requestId);
    }
    if (data.ok !== true) {
      const code = String(data.code || "SERVER_ERROR");
      const status = code === "RATE_LIMITED" ? 429 : code === "PROFILE_REQUIRED" ? 403 : 400;
      logOperationalEvent("wordstrike.score.failure", {
        request_id: requestId,
        service: "submit-score",
        category: classifyStatus(status),
        http_status: status,
        board_key: value.boardKey,
        duration_ms: Date.now() - started,
      });
      return failure(code, status, cors, requestId);
    }

    const { data: leaderboard, error: rankError } = await client.rpc("get_public_leaderboard", {
      p_board_key: value.boardKey,
      p_challenge_date: value.challengeDate,
      p_viewer_user_id: userId,
    });
    if (rankError) {
      logOperationalEvent("wordstrike.score.rank_failure", {
        request_id: requestId,
        service: "submit-score",
        category: "service",
        http_status: 500,
        board_key: value.boardKey,
      });
    }
    const duplicate = data.duplicate === true;
    logOperationalEvent("wordstrike.score.success", {
      request_id: requestId,
      service: "submit-score",
      http_status: 200,
      board_key: value.boardKey,
      duplicate,
      duration_ms: Date.now() - started,
    });
    return response({
      ok: true,
      data: {
        status: duplicate ? "already-submitted" : "submitted",
        duplicate,
        boardKey: value.boardKey,
        sessionId: value.sessionId,
        rank: Number.isSafeInteger(Number(leaderboard?.viewer?.rank))
          ? Number(leaderboard.viewer.rank)
          : null,
      },
    }, 200, cors, requestId);
  } catch {
    logOperationalEvent("wordstrike.score.failure", {
      request_id: requestId,
      service: "submit-score",
      category: "service",
      http_status: 500,
      board_key: value.boardKey,
      duration_ms: Date.now() - started,
    });
    return failure("SERVER_ERROR", 500, cors, requestId);
  }
});
