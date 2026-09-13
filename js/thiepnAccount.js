import {
  THIEPN_ACCOUNT_VERSION,
  THIEPN_PLATFORM_VERSION,
  createAccountClient,
  needsMfaChallenge,
} from "./vendor/thiepnAccountSdk.js";
import {
  LEGACY_WORDSTRIKE_AUTH_STORAGE_KEY,
  SUPABASE_AUTH_STORAGE_KEY,
  prepareSharedAuthStorage,
} from "./supabaseClient.js";

export const THIEPN_ACCOUNT_SDK_VERSION = THIEPN_ACCOUNT_VERSION;
export const THIEPN_ACCOUNT_PLATFORM_VERSION = THIEPN_PLATFORM_VERSION;
export const THIEPN_ACCOUNT_SDK_SOURCE_SHA = "124221f39a932d50f9a86ad5c3da2d8fd1fe50af";
export const WORDSTRIKE_PLATFORM_APP_ID = "wordstrike";

const accountClient = createAccountClient({ sessionKey: SUPABASE_AUTH_STORAGE_KEY });
let activityMarkedForUserId = null;

export function prepareAccountPlatformStorage(storage = globalThis.localStorage) {
  // Preserve WordStrike's previous same-project migration, including auxiliary
  // Supabase auth suffix keys, before the shared SDK normalizes the base session.
  prepareSharedAuthStorage(storage);
  return accountClient.migrateLegacySessions({
    legacyKeys: [LEGACY_WORDSTRIKE_AUTH_STORAGE_KEY],
    removeLegacy: true,
  });
}

export function adoptSupabaseSession(session) {
  if (!session) return null;
  try {
    return accountClient.writeSession(session);
  } catch {
    return null;
  }
}

export function clearAccountPlatformSession() {
  activityMarkedForUserId = null;
  accountClient.clearSession();
}

export function getAccountPlatformSession() {
  return accountClient.readSession();
}

export function getAccountHandoffState(session = getAccountPlatformSession()) {
  if (!session) {
    return Object.freeze({
      signedIn: false,
      requiresAdditionalVerification: false,
      assuranceLevel: "aal1",
    });
  }
  const security = accountClient.getSessionSecurity();
  return Object.freeze({
    signedIn: true,
    requiresAdditionalVerification: needsMfaChallenge(session, session.user),
    assuranceLevel: security.aal,
  });
}

export async function markWordstrikeAccountActivity(session) {
  const normalized = adoptSupabaseSession(session);
  const userId = normalized?.user?.id;
  if (!userId || activityMarkedForUserId === userId) return null;

  try {
    const result = await accountClient.recordAppActivity({ appId: WORDSTRIKE_PLATFORM_APP_ID });
    activityMarkedForUserId = userId;
    return result;
  } catch (error) {
    // Platform activity metadata must never block gameplay or leaderboard auth.
    console.warn("WORDSTRIKE account activity marker failed", error);
    return null;
  }
}

export function getGoogleAccountSignInUrl({ redirectTo } = {}) {
  return accountClient.oauthUrl({ provider: "google", redirectTo });
}

export function getThiepnAccountUrl(origin = globalThis.location?.origin ?? "https://thiepn.dev") {
  return new URL("/account/", origin).toString();
}
