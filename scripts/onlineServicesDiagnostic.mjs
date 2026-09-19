import { writeFileSync } from "node:fs";
import { SUPABASE_CONFIG } from "../js/supabaseConfig.js";

const PROD_ORIGIN = "https://thiepn.dev";
const EDGE_BASE = `${SUPABASE_CONFIG.url}/functions/v1`;
const ACTIVE_BOARDS = Object.freeze([
  "campaign-highest-level-v1",
  "typing-60s-english200-v1",
  "typing-15s-english200-v1",
  "endless-v1",
]);

const report = {
  projectHost: new URL(SUPABASE_CONFIG.url).hostname,
  productionOrigin: PROD_ORIGIN,
  auth: null,
  cors: {},
  leaderboards: [],
  protectedEndpoints: {},
  negativeCases: {},
};

async function jsonOrNull(response) {
  try { return await response.json(); } catch { return null; }
}

async function edgeRequest(slug, {
  method = "POST",
  origin = PROD_ORIGIN,
  body = null,
  includeApiKey = true,
} = {}) {
  const headers = { Origin: origin };
  if (includeApiKey) headers.apikey = SUPABASE_CONFIG.publishableKey;
  if (body != null) headers["Content-Type"] = "application/json";
  if (method === "OPTIONS") {
    headers["Access-Control-Request-Method"] = "POST";
    headers["Access-Control-Request-Headers"] = "authorization, apikey, content-type, x-client-info";
  }
  const response = await fetch(`${EDGE_BASE}/${slug}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  return {
    status: response.status,
    corsOrigin: response.headers.get("access-control-allow-origin"),
    corsMethods: response.headers.get("access-control-allow-methods"),
    corsHeaders: response.headers.get("access-control-allow-headers"),
    requestId: response.headers.get("x-request-id") ? true : false,
    payload: method === "OPTIONS" ? null : await jsonOrNull(response),
  };
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const settingsResponse = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/settings`, {
    headers: { apikey: SUPABASE_CONFIG.publishableKey },
  });
  const settings = await jsonOrNull(settingsResponse);
  report.auth = {
    status: settingsResponse.status,
    googleEnabled: settings?.external?.google === true,
    signupDisabled: settings?.disable_signup === true,
  };
  requireCondition(settingsResponse.status === 200, "Auth settings endpoint is unavailable");
  requireCondition(report.auth.googleEnabled, "Google auth provider is disabled");
} catch (error) {
  report.auth = { error: error?.message || String(error) };
  throw error;
}

for (const slug of ["get-leaderboard", "leaderboard-profile", "submit-score"]) {
  const preflight = await edgeRequest(slug, {
    method: "OPTIONS",
    includeApiKey: false,
  });
  report.cors[slug] = {
    status: preflight.status,
    origin: preflight.corsOrigin,
    methods: preflight.corsMethods,
    allowsAuthorization: /authorization/i.test(preflight.corsHeaders || ""),
    allowsApiKey: /apikey/i.test(preflight.corsHeaders || ""),
    allowsContentType: /content-type/i.test(preflight.corsHeaders || ""),
  };
  requireCondition(preflight.status === 204, `${slug} CORS preflight failed`);
  requireCondition(preflight.corsOrigin === PROD_ORIGIN, `${slug} did not allow the production origin`);
  requireCondition(report.cors[slug].allowsAuthorization, `${slug} CORS omitted authorization`);
  requireCondition(report.cors[slug].allowsApiKey, `${slug} CORS omitted apikey`);
  requireCondition(report.cors[slug].allowsContentType, `${slug} CORS omitted content-type`);
}

for (const boardKey of ACTIVE_BOARDS) {
  const response = await edgeRequest("get-leaderboard", {
    body: { boardKey },
  });
  const data = response.payload?.data;
  const summary = {
    boardKey,
    status: response.status,
    ok: response.payload?.ok === true,
    responseBoardKey: data?.board?.boardKey || null,
    rulesVersion: Number(data?.board?.rulesVersion) || null,
    entries: Array.isArray(data?.entries) ? data.entries.length : null,
    viewerPresent: Boolean(data?.viewer),
    corsOrigin: response.corsOrigin,
    requestId: response.requestId,
  };
  report.leaderboards.push(summary);
  requireCondition(response.status === 200 && summary.ok, `${boardKey} public leaderboard read failed`);
  requireCondition(summary.responseBoardKey === boardKey, `${boardKey} returned the wrong board`);
  requireCondition(summary.rulesVersion === 1, `${boardKey} returned an unexpected rules version`);
  requireCondition(summary.entries != null && summary.entries <= 100, `${boardKey} returned an invalid entries collection`);
  requireCondition(summary.viewerPresent === false, `${boardKey} leaked a viewer identity to a signed-out request`);
  requireCondition(summary.corsOrigin === PROD_ORIGIN, `${boardKey} omitted production CORS`);
  requireCondition(summary.requestId, `${boardKey} omitted request correlation`);
}

for (const [slug, body] of [
  ["leaderboard-profile", { action: "get" }],
  ["submit-score", {}],
]) {
  const response = await edgeRequest(slug, { body });
  report.protectedEndpoints[slug] = {
    status: response.status,
    ok: response.payload?.ok === true,
    errorCode: response.payload?.error?.code || null,
    corsOrigin: response.corsOrigin,
    requestId: response.requestId,
  };
  requireCondition(response.status === 401, `${slug} accepted a request without a user session`);
  requireCondition(response.payload?.error?.code === "NOT_AUTHENTICATED", `${slug} returned the wrong unauthenticated error`);
  requireCondition(response.corsOrigin === PROD_ORIGIN, `${slug} 401 response omitted production CORS`);
  requireCondition(response.requestId, `${slug} 401 response omitted request correlation`);
}

{
  const retired = await edgeRequest("get-leaderboard", { body: { boardKey: "daily-strike-v1" } });
  report.negativeCases.retiredBoard = {
    status: retired.status,
    errorCode: retired.payload?.error?.code || null,
  };
  requireCondition(retired.status === 400 && retired.payload?.error?.code === "INVALID_BOARD",
    "Retired Daily leaderboard is unexpectedly readable");
}

{
  const injected = await edgeRequest("get-leaderboard", {
    body: { boardKey: "endless-v1", user_id: "forged", limit: 1000 },
  });
  report.negativeCases.injectedReadFields = {
    status: injected.status,
    errorCode: injected.payload?.error?.code || null,
  };
  requireCondition(injected.status === 400 && injected.payload?.error?.code === "INVALID_REQUEST",
    "Leaderboard API accepted unrecognized client-controlled fields");
}

{
  const evil = await edgeRequest("get-leaderboard", {
    method: "OPTIONS",
    origin: "https://evil.example",
    includeApiKey: false,
  });
  report.negativeCases.disallowedOrigin = {
    status: evil.status,
    corsOrigin: evil.corsOrigin,
  };
  requireCondition(evil.status === 403, "Disallowed origin was not rejected");
  requireCondition(evil.corsOrigin == null, "Disallowed origin received an allow-origin header");
}

writeFileSync("online-services-diagnostic.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
