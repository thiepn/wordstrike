export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const USERNAME_CHANGE_DAYS = 30;

export const ALLOWED_ORIGINS = Object.freeze([
  "https://thiepn.dev",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

export function normalizeUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateUsername(value) {
  const username = normalizeUsername(value);
  return Object.freeze({
    valid: USERNAME_PATTERN.test(username),
    username,
    normalized: username.toLowerCase(),
  });
}

export function getCorsHeaders(origin) {
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return null;
  const headers = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function toPublicProfile(profile) {
  if (!profile) return null;
  const usernameChangedAt = profile.username_changed_at ?? null;
  const canChangeAt = usernameChangedAt
    ? new Date(new Date(usernameChangedAt).getTime() + USERNAME_CHANGE_DAYS * 86400000).toISOString()
    : null;
  return Object.freeze({
    username: String(profile.username),
    usernameChangedAt,
    canChangeAt,
  });
}
