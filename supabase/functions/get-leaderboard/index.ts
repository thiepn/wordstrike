import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/leaderboardProfile.js";
import { validateLeaderboardRequest } from "../_shared/leaderboardRead.js";

const MESSAGES: Record<string, string> = Object.freeze({
  INVALID_REQUEST: "The leaderboard request is invalid.",
  INVALID_BOARD: "Unsupported leaderboard.",
  BOARD_UNAVAILABLE: "This leaderboard is unavailable.",
  METHOD_NOT_ALLOWED: "This request method is not supported.",
  SERVER_ERROR: "Global rankings are temporarily unavailable.",
});

function response(payload: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

function failure(code: keyof typeof MESSAGES, status: number, cors: Record<string, string>) {
  return response({ ok: false, error: { code, message: MESSAGES[code] } }, status, cors);
}

Deno.serve(async (request) => {
  const cors = getCorsHeaders(request.headers.get("Origin"));
  if (!cors) return failure("INVALID_REQUEST", 403, {});
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return failure("METHOD_NOT_ALLOWED", 405, cors);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return failure("INVALID_REQUEST", 400, cors);
  }
  const validation = validateLeaderboardRequest(body);
  if (!validation.valid) return failure(validation.code as keyof typeof MESSAGES, 400, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return failure("SERVER_ERROR", 500, cors);
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
      console.error("get-leaderboard RPC failed", { boardKey: validation.boardKey });
      return failure("SERVER_ERROR", 500, cors);
    }
    if (!data) return failure("BOARD_UNAVAILABLE", 404, cors);
    return response({ ok: true, data }, 200, cors);
  } catch {
    console.error("get-leaderboard request failed", { boardKey: validation.boardKey });
    return failure("SERVER_ERROR", 500, cors);
  }
});
