import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/leaderboardProfile.js";
import { operationId, responseHeaders } from "../_shared/operations.js";

const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const ERROR_MESSAGES: Record<string, string> = Object.freeze({
  NOT_AUTHENTICATED: "Sign in to sync WordStrike progress.",
  INVALID_REQUEST: "The cloud-save request is invalid.",
  REVISION_CONFLICT: "Cloud progress changed on another client.",
  METHOD_NOT_ALLOWED: "This request method is not supported.",
  SERVER_ERROR: "Cloud save is temporarily unavailable.",
});

function jsonResponse(payload: unknown, status: number, corsHeaders: Record<string, string>, requestId: string) {
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders(corsHeaders, requestId) });
}

function failure(code: keyof typeof ERROR_MESSAGES, status: number, corsHeaders: Record<string, string>, requestId: string) {
  return jsonResponse({ ok: false, error: { code, message: ERROR_MESSAGES[code] } }, status, corsHeaders, requestId);
}

function success(profile: Record<string, unknown> | null, corsHeaders: Record<string, string>, requestId: string) {
  return jsonResponse({ ok: true, data: { profile } }, 200, corsHeaders, requestId);
}

function profileData(row: Record<string, unknown> | null) {
  if (!row) return null;
  return { revision: Number(row.revision) || 0, data: row.data, updatedAt: row.updated_at ?? null };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validSnapshot(value: unknown) {
  if (!isObject(value) || value.schemaVersion !== 1) return false;
  if (!isObject(value.campaign) || !isObject(value.mode) || !isObject(value.settings)) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_PAYLOAD_BYTES;
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const requestId = operationId(request.headers);
  const corsHeaders = getCorsHeaders(request.headers.get("Origin"));
  if (!corsHeaders) return failure("INVALID_REQUEST", 403, {}, requestId);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...corsHeaders, "X-Request-ID": requestId } });
  if (request.method !== "POST") return failure("METHOD_NOT_ALLOWED", 405, corsHeaders, requestId);

  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
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
  try { body = await request.json(); }
  catch { return failure("INVALID_REQUEST", 400, corsHeaders, requestId); }

  try {
    if (body.action === "get") {
      const { data, error } = await serverClient.from("wordstrike_player_profiles")
        .select("revision,data,updated_at").eq("user_id", userId).maybeSingle();
      if (error) return failure("SERVER_ERROR", 500, corsHeaders, requestId);
      return success(profileData(data), corsHeaders, requestId);
    }

    if (body.action !== "put" || !validSnapshot(body.data)) return failure("INVALID_REQUEST", 400, corsHeaders, requestId);
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return failure("INVALID_REQUEST", 400, corsHeaders, requestId);

    const now = new Date().toISOString();
    if (expectedRevision === 0) {
      const { data, error } = await serverClient.from("wordstrike_player_profiles")
        .insert({ user_id: userId, revision: 1, data: body.data, updated_at: now })
        .select("revision,data,updated_at").maybeSingle();
      if (!error && data) return success(profileData(data), corsHeaders, requestId);
      if (error?.code === "23505") return failure("REVISION_CONFLICT", 409, corsHeaders, requestId);
      return failure("SERVER_ERROR", 500, corsHeaders, requestId);
    }

    const { data, error } = await serverClient.from("wordstrike_player_profiles")
      .update({ revision: expectedRevision + 1, data: body.data, updated_at: now })
      .eq("user_id", userId).eq("revision", expectedRevision)
      .select("revision,data,updated_at").maybeSingle();
    if (error) return failure("SERVER_ERROR", 500, corsHeaders, requestId);
    if (!data) return failure("REVISION_CONFLICT", 409, corsHeaders, requestId);
    return success(profileData(data), corsHeaders, requestId);
  } catch {
    return failure("SERVER_ERROR", 500, corsHeaders, requestId);
  }
});
