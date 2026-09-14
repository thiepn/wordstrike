import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/leaderboardProfile.js";
import {
  classifyStatus,
  logOperationalEvent,
  operationId,
  responseHeaders,
} from "../_shared/operations.js";
import { validateLeaderboardRequest } from "../_shared/leaderboardRead.js";

const MESSAGES: Record<string, string> = Object.freeze({
  INVALID_REQUEST: "The leaderboard request is invalid.",
  INVALID_BOARD: "Unsupported leaderboard.",
  BOARD_UNAVAILABLE: "This leaderboard is unavailable.",
  METHOD_NOT_ALLOWED: "This request method is not supported.",
  SERVER_ERROR: "Global rankings are temporarily unavailable.",
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
  code: keyof typeof MESSAGES,
  status: number,
  cors: Record<string, string>,
  requestId: string,
) {
  return response({ ok: false, error: { code, message: MESSAGES[code] } }, status, cors, requestId);
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return failure("INVALID_REQUEST", 400, cors, requestId);
  }
  const validation = validateLeaderboardRequest(body);
  if (!validation.valid) {
    return failure(validation.code as keyof typeof MESSAGES, 400, cors, requestId);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return failure("SERVER_ERROR", 500, cors, requestId);
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let viewerUserId: string | null = null;
  const token = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (token) {
    try {
      const { data, error } = await client.auth.getUser(token);
      if (!error && data?.user?.id) viewerUserId = data.user.id;
    } catch {
      viewerUserId = null;
    }
  }

  try {
    const { data, error } = await client.rpc("get_public_leaderboard", {
      p_board_key: validation.boardKey,
      p_challenge_date: null,
      p_viewer_user_id: viewerUserId,
    });
    if (error) {
      logOperationalEvent("wordstrike.leaderboard.failure", {
        request_id: requestId,
        service: "get-leaderboard",
        category: "service",
        http_status: 500,
        board_key: validation.boardKey,
        duration_ms: Date.now() - started,
      });
      return failure("SERVER_ERROR", 500, cors, requestId);
    }
    if (!data) {
      logOperationalEvent("wordstrike.leaderboard.failure", {
        request_id: requestId,
        service: "get-leaderboard",
        category: classifyStatus(404),
        http_status: 404,
        board_key: validation.boardKey,
        duration_ms: Date.now() - started,
      });
      return failure("BOARD_UNAVAILABLE", 404, cors, requestId);
    }
    logOperationalEvent("wordstrike.leaderboard.success", {
      request_id: requestId,
      service: "get-leaderboard",
      http_status: 200,
      board_key: validation.boardKey,
      duration_ms: Date.now() - started,
    });
    return response({ ok: true, data }, 200, cors, requestId);
  } catch {
    logOperationalEvent("wordstrike.leaderboard.failure", {
      request_id: requestId,
      service: "get-leaderboard",
      category: "service",
      http_status: 500,
      board_key: validation.boardKey,
      duration_ms: Date.now() - started,
    });
    return failure("SERVER_ERROR", 500, cors, requestId);
  }
});
