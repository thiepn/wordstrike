import { writeFileSync } from "node:fs";
import { SUPABASE_CONFIG } from "../js/supabaseConfig.js";

const redirects = [
  "https://thiepn.dev/wordstrike/",
  "https://thiepn.github.io/wordstrike/",
];

const result = {
  projectHost: new URL(SUPABASE_CONFIG.url).hostname,
  settings: null,
  redirects: [],
  sdk: null,
};

function safeLocation(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return {
      protocol: url.protocol,
      host: url.host,
      pathname: url.pathname,
      error: url.searchParams.get("error") || url.searchParams.get("error_code"),
      errorDescription: url.searchParams.get("error_description"),
    };
  } catch {
    return { invalid: true };
  }
}

try {
  const response = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/settings`, {
    headers: { apikey: SUPABASE_CONFIG.publishableKey },
  });
  const body = await response.json().catch(() => ({}));
  result.settings = {
    status: response.status,
    googleEnabled: body?.external?.google === true,
    providers: body?.external ? Object.entries(body.external).filter(([, enabled]) => enabled === true).map(([name]) => name) : [],
  };
} catch (error) {
  result.settings = { error: error?.message || String(error) };
}

for (const redirectTo of redirects) {
  try {
    const params = new URLSearchParams({
      provider: "google",
      redirect_to: redirectTo,
      code_challenge: "pDlkNCckbtZcCnm04sG2k4H4T0cVrllnnM0YlDK5Tjo",
      code_challenge_method: "s256",
    });
    const response = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/authorize?${params}`, {
      redirect: "manual",
    });
    result.redirects.push({
      redirectTo,
      status: response.status,
      location: safeLocation(response.headers.get("location")),
      body: response.status >= 400 ? (await response.text()).slice(0, 300) : undefined,
    });
  } catch (error) {
    result.redirects.push({ redirectTo, error: error?.message || String(error) });
  }
}

try {
  const response = await fetch("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4");
  result.sdk = {
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentLength: Number(response.headers.get("content-length")) || null,
  };
} catch (error) {
  result.sdk = { error: error?.message || String(error) };
}

writeFileSync("auth-diagnostic.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));

if (result.settings?.status !== 200 || !result.settings?.googleEnabled) process.exitCode = 1;
if (result.sdk?.status !== 200) process.exitCode = 1;
if (result.redirects.some((entry) => entry.status !== 302 || !entry.location?.host)) process.exitCode = 1;
