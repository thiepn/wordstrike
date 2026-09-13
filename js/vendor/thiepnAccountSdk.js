// THIEPN Account SDK consumer bundle.
// Source contract: thiepn/thiepn.github.io@124221f39a932d50f9a86ad5c3da2d8fd1fe50af
// SDK 1.2.0 / Platform 1.0.0. Keep this file pinned; do not runtime-load mutable account code.

export const THIEPN_ACCOUNT_VERSION = "1.2.0";
export const THIEPN_PLATFORM_VERSION = "1.0.0";

export const THIEPN_ACCOUNT_CONFIG = Object.freeze({
  supabaseUrl: "https://hycegznamzjhwinegaai.supabase.co",
  publishableKey: "sb_publishable_1rZzRPzfLMaAH5pIgCwIjA_19UPMIsR",
  sessionKey: "sb-hycegznamzjhwinegaai-auth-token",
  accountPath: "/account/",
});

const APP_SLUG_PATTERN = /^[a-z0-9-]+$/;

export class ThiepnAccountError extends Error {
  constructor(message, { status = 0, code = null, payload = null } = {}) {
    super(message);
    this.name = "ThiepnAccountError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function safeGet(storage, key) {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(storage, key) {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function parseSession(raw) {
  if (!raw) return null;
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!isRecord(value)) return null;
    if (typeof value.access_token !== "string" || !value.access_token) return null;
    if (typeof value.refresh_token !== "string" || !value.refresh_token) return null;
    if (typeof value.expires_at !== "number" || !Number.isFinite(value.expires_at)) return null;
    const user = isRecord(value.user) && typeof value.user.id === "string" ? value.user : { id: "" };
    return {
      access_token: value.access_token,
      refresh_token: value.refresh_token,
      expires_at: value.expires_at,
      token_type: typeof value.token_type === "string" && value.token_type ? value.token_type : "bearer",
      user,
    };
  } catch {
    return null;
  }
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !value || typeof globalThis.atob !== "function") return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function decodeJwtPayload(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) return null;
  try {
    const payload = JSON.parse(decoded);
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function getSessionSecurity(session) {
  const claims = decodeJwtPayload(session?.access_token);
  return Object.freeze({
    aal: claims?.aal === "aal2" ? "aal2" : "aal1",
    sessionId: typeof claims?.session_id === "string" ? claims.session_id : null,
    expiresAt: typeof claims?.exp === "number" ? claims.exp : session?.expires_at ?? null,
  });
}

function verifiedFactors(user) {
  const factors = Array.isArray(user?.factors) ? user.factors : [];
  return factors.filter((factor) => isRecord(factor) && factor.status === "verified" && typeof factor.id === "string");
}

export function needsMfaChallenge(session, user = session?.user) {
  return verifiedFactors(user).length > 0 && getSessionSecurity(session).aal !== "aal2";
}

function messageFromPayload(payload, fallback) {
  if (!isRecord(payload)) return fallback;
  for (const key of ["error_description", "message", "msg", "error"]) {
    if (typeof payload[key] === "string" && payload[key]) return payload[key];
  }
  return fallback;
}

export function createAccountClient(options = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (typeof fetchImpl !== "function") {
    throw new ThiepnAccountError("THIEPN Account requires fetch.", { code: "missing_fetch" });
  }
  const config = {
    supabaseUrl: options.supabaseUrl ?? THIEPN_ACCOUNT_CONFIG.supabaseUrl,
    publishableKey: options.publishableKey ?? THIEPN_ACCOUNT_CONFIG.publishableKey,
    sessionKey: options.sessionKey ?? THIEPN_ACCOUNT_CONFIG.sessionKey,
  };
  let memorySession = null;

  const readSession = () => parseSession(safeGet(storage, config.sessionKey)) ?? memorySession;
  const writeSession = (candidate) => {
    const session = parseSession(candidate);
    if (!session) throw new ThiepnAccountError("Cannot store an invalid THIEPN Account session.", { code: "invalid_session" });
    memorySession = session;
    safeSet(storage, config.sessionKey, JSON.stringify(session));
    return session;
  };
  const clearSession = () => {
    memorySession = null;
    safeRemove(storage, config.sessionKey);
  };

  function migrateLegacySessions({ legacyKeys = [], removeLegacy = true } = {}) {
    const existing = readSession();
    if (existing) return { session: existing, migratedFrom: null };
    for (const key of legacyKeys) {
      if (!key || key === config.sessionKey) continue;
      const candidate = parseSession(safeGet(storage, key));
      if (!candidate) continue;
      writeSession(candidate);
      if (removeLegacy) safeRemove(storage, key);
      return { session: candidate, migratedFrom: key };
    }
    return { session: null, migratedFrom: null };
  }

  async function request(path, init = {}, accessToken) {
    const headers = new Headers(init.headers);
    headers.set("apikey", config.publishableKey);
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetchImpl(`${config.supabaseUrl}${path}`, { ...init, headers });
    const raw = await response.text();
    let payload = null;
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = raw; }
    }
    if (!response.ok) {
      throw new ThiepnAccountError(messageFromPayload(payload, `Request failed (${response.status}).`), {
        status: response.status,
        payload,
      });
    }
    return payload;
  }

  async function authFetch(path, init = {}, session = readSession()) {
    if (!session?.access_token) throw new ThiepnAccountError("Sign in first.", { code: "not_signed_in" });
    return request(path, init, session.access_token);
  }

  function oauthUrl({ provider = "google", redirectTo } = {}) {
    const url = new URL(`${config.supabaseUrl}/auth/v1/authorize`);
    url.searchParams.set("provider", provider);
    if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
    return url.toString();
  }

  async function recordAppActivity({ appId } = {}, session = readSession()) {
    if (!session?.access_token || !session.user?.id) {
      throw new ThiepnAccountError("Sign in first.", { code: "not_signed_in" });
    }
    if (typeof appId !== "string" || !APP_SLUG_PATTERN.test(appId)) {
      throw new ThiepnAccountError("Use a valid THIEPN app slug.", { code: "invalid_app_slug" });
    }
    const query = new URLSearchParams({
      on_conflict: "user_id,app_slug",
      select: "app_slug,first_used_at,last_used_at",
    });
    const rows = await authFetch(`/rest/v1/account_user_apps?${query}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        user_id: session.user.id,
        app_slug: appId,
        last_used_at: new Date().toISOString(),
        source: "app",
      }),
    }, session);
    return Array.isArray(rows) ? rows[0] ?? null : rows;
  }

  async function getEcosystemState(session = readSession()) {
    return authFetch("/rest/v1/rpc/get_thiepn_ecosystem", {
      method: "POST",
      body: JSON.stringify({}),
    }, session);
  }

  return Object.freeze({
    version: THIEPN_ACCOUNT_VERSION,
    platformVersion: THIEPN_PLATFORM_VERSION,
    config: Object.freeze({ ...config }),
    readSession,
    writeSession,
    clearSession,
    migrateLegacySessions,
    oauthUrl,
    authFetch,
    recordAppActivity,
    getEcosystemState,
    getSessionSecurity: () => getSessionSecurity(readSession()),
  });
}
