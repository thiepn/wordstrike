import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getCorsHeaders,
  normalizeUsername,
  toPublicProfile,
  validateUsername,
} from "../_shared/leaderboardProfile.js";
import {
  classifyStatus,
  logOperationalEvent,
  operationId,
  responseHeaders,
} from "../_shared/operations.js";

const ERROR_MESSAGES: Record<string, string> = Object.freeze({
  NOT_AUTHENTICATED: "Sign in to manage your public username.",
  INVALID_REQUEST: "The profile request is invalid.",
  INVALID_USERNAME: "Use 3–20 letters, numbers, or underscores.",
  USERNAME_TAKEN: "That username is already taken.",
  PROFILE_ALREADY_EXISTS: "A public profile already exists for this account.",
  PROFILE_NOT_FOUND: "No public profile exists for this account.",
  CHANGE_COOLDOWN: "Your username cannot be changed yet.",
  METHOD_NOT_ALLOWED: "This request method is not supported.",
  SERVER_ERROR: "Public profile services are temporarily unavailable.",
});

function jsonResponse(
  payload: unknown,
  status: number,
  corsHeaders: Record<string, string>,
  requestId: string,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(corsHeaders, requestId),
  });
}

function failure(
  code: keyof typeof ERROR_MESSAGES,
  status: number,
  corsHeaders: Record<string, string>,
  requestId: string,
  extra: Record<string, unknown> = {},
) {
  return jsonResponse({
    ok: false,
    error: { code, message: ERROR_MESSAGES[code], ...extra },
  }, status, corsHeaders, requestId);
}

function success(
  data: Record<string, unknown>,
  corsHeaders: Record<string, string>,
  requestId: string,
) {
  return jsonResponse({ ok: true, data }, 200, corsHeaders, requestId);
}

function profileData(profile: Record<string, unknown> | null) {
  return { profile: toPublicProfile(profile) };
}

Deno.serve(async (request) => {
  const requestId = operationId(request.headers);
  const started = Date.now();
  const corsHeaders = getCorsHeaders(request.headers.get("Origin"));
  if (!corsHeaders) return failure("INVALID_REQUEST", 403, {}, requestId);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...corsHeaders, "X-Request-ID": requestId } });
  }
  if (request.method !== "POST") return failure("METHOD_NOT_ALLOWED", 405, corsHeaders, requestId);

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return failure("NOT_AUTHENTICATED", 401, corsHeaders, requestId);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return failure("SERVER_ERROR", 500, corsHeaders, requestId);

  const serverClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userError } = await serverClient.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return failure("NOT_AUTHENTICATED", 401, corsHeaders, requestId);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return failure("INVALID_REQUEST", 400, corsHeaders, requestId);
  }
  const action = body?.action;
  if (!["get", "check", "claim", "change"].includes(String(action))) {
    return failure("INVALID_REQUEST", 400, corsHeaders, requestId);
  }

  try {
    if (action === "get") {
      const { data, error } = await serverClient
        .from("leaderboard_profiles")
        .select("username, username_changed_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        logOperationalEvent("wordstrike.profile.failure", {
          request_id: requestId,
          service: "leaderboard-profile",
          category: "service",
          http_status: 500,
          action: "get",
          duration_ms: Date.now() - started,
        });
        return failure("SERVER_ERROR", 500, corsHeaders, requestId);
      }
      return success(profileData(data), corsHeaders, requestId);
    }

    const validation = validateUsername(body.username);
    if (!validation.valid) return failure("INVALID_USERNAME", 400, corsHeaders, requestId);

    if (action === "check") {
      const { data, error } = await serverClient
        .from("leaderboard_profiles")
        .select("user_id")
        .eq("username_normalized", validation.normalized)
        .maybeSingle();
      if (error) {
        logOperationalEvent("wordstrike.profile.failure", {
          request_id: requestId,
          service: "leaderboard-profile",
          category: "service",
          http_status: 500,
          action: "check",
          duration_ms: Date.now() - started,
        });
        return failure("SERVER_ERROR", 500, corsHeaders, requestId);
      }
      return success({
        username: validation.username,
        available: !data || data.user_id === userId,
      }, corsHeaders, requestId);
    }

    const rpcName = action === "claim"
      ? "claim_leaderboard_profile"
      : "change_leaderboard_username";
    const { data, error } = await serverClient.rpc(rpcName, {
      p_user_id: userId,
      p_username: normalizeUsername(body.username),
    });
    if (error || !data || typeof data !== "object") {
      logOperationalEvent("wordstrike.profile.failure", {
        request_id: requestId,
        service: "leaderboard-profile",
        category: "service",
        http_status: 500,
        action: String(action),
        duration_ms: Date.now() - started,
      });
      return failure("SERVER_ERROR", 500, corsHeaders, requestId);
    }
    if (data.ok !== true) {
      const code = String(data.code || "SERVER_ERROR") as keyof typeof ERROR_MESSAGES;
      if (!(code in ERROR_MESSAGES)) return failure("SERVER_ERROR", 500, corsHeaders, requestId);
      const status = code === "CHANGE_COOLDOWN" ? 409 : 400;
      const extra = code === "CHANGE_COOLDOWN" && data.can_change_at
        ? { canChangeAt: data.can_change_at }
        : {};
      logOperationalEvent("wordstrike.profile.failure", {
        request_id: requestId,
        service: "leaderboard-profile",
        category: classifyStatus(status),
        http_status: status,
        action: String(action),
        duration_ms: Date.now() - started,
      });
      return failure(code, status, corsHeaders, requestId, extra);
    }
    logOperationalEvent("wordstrike.profile.success", {
      request_id: requestId,
      service: "leaderboard-profile",
      http_status: 200,
      action: String(action),
      duration_ms: Date.now() - started,
    });
    return success(profileData(data.profile), corsHeaders, requestId);
  } catch {
    logOperationalEvent("wordstrike.profile.failure", {
      request_id: requestId,
      service: "leaderboard-profile",
      category: "service",
      http_status: 500,
      action: String(action),
      duration_ms: Date.now() - started,
    });
    return failure("SERVER_ERROR", 500, corsHeaders, requestId);
  }
});
