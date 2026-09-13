import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createAuthService } from "../js/authService.js";
import {
  THIEPN_ACCOUNT_PLATFORM_VERSION,
  THIEPN_ACCOUNT_SDK_SOURCE_SHA,
  THIEPN_ACCOUNT_SDK_VERSION,
  WORDSTRIKE_PLATFORM_APP_ID,
  adoptSupabaseSession,
  clearAccountPlatformSession,
  getAccountHandoffState,
} from "../js/thiepnAccount.js";

function jwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

assert.equal(THIEPN_ACCOUNT_SDK_VERSION, "1.2.0");
assert.equal(THIEPN_ACCOUNT_PLATFORM_VERSION, "1.0.0");
assert.equal(THIEPN_ACCOUNT_SDK_SOURCE_SHA, "124221f39a932d50f9a86ad5c3da2d8fd1fe50af");
assert.equal(WORDSTRIKE_PLATFORM_APP_ID, "wordstrike");

const mfaUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "wordstrike@example.test",
  factors: [{
    id: "22222222-2222-4222-8222-222222222222",
    factor_type: "totp",
    status: "verified",
  }],
};
const aal1 = {
  access_token: jwt({ aal: "aal1", session_id: "session-aal1", exp: 2_000_000_000 }),
  refresh_token: "refresh-aal1",
  expires_at: 2_000_000_000,
  token_type: "bearer",
  user: mfaUser,
};
const aal2 = {
  ...aal1,
  access_token: jwt({ aal: "aal2", session_id: "session-aal2", exp: 2_000_000_000 }),
  refresh_token: "refresh-aal2",
};

clearAccountPlatformSession();
adoptSupabaseSession(aal1);
assert.deepEqual(getAccountHandoffState(), {
  signedIn: true,
  requiresAdditionalVerification: true,
  assuranceLevel: "aal1",
});
adoptSupabaseSession(aal2);
assert.deepEqual(getAccountHandoffState(), {
  signedIn: true,
  requiresAdditionalVerification: false,
  assuranceLevel: "aal2",
});
clearAccountPlatformSession();
assert.equal(getAccountHandoffState().signedIn, false);

function createClient(session) {
  let listener = null;
  return {
    client: {
      auth: {
        onAuthStateChange(callback) {
          listener = callback;
          return { data: { subscription: {} } };
        },
        async getSession() {
          return { data: { session }, error: null };
        },
        async signOut() {
          return { error: null };
        },
      },
    },
    emit(event, nextSession) {
      listener?.(event, nextSession);
    },
  };
}

const calls = [];
const platform = {
  prepareStorage() { calls.push("prepare"); },
  adoptSession(session) { calls.push(`adopt:${session.user.id}`); return session; },
  markActivity(session) { calls.push(`activity:${session.user.id}`); return Promise.resolve(); },
  clearSession() { calls.push("clear"); },
  getHandoffState(session) {
    return {
      signedIn: Boolean(session?.user),
      requiresAdditionalVerification: Boolean(session?.user?.factors?.length),
      assuranceLevel: "aal1",
    };
  },
};
const mock = createClient({ ...aal1, access_token: "mock-access" });
const service = createAuthService({
  getClient: () => mock.client,
  accountPlatform: platform,
});

assert.equal((await service.initializeAuth()).status, "signed-in");
assert.deepEqual(calls.slice(0, 3), ["prepare", `adopt:${mfaUser.id}`, `activity:${mfaUser.id}`]);
assert.equal(service.getAccountHandoffState().requiresAdditionalVerification, true);
mock.emit("SIGNED_OUT", null);
assert.equal(service.getAuthState().status, "signed-out");
assert.equal(calls.at(-1), "clear");

console.log("WORDSTRIKE THIEPN Account SDK pin, MFA handoff, session adoption, activity hook, and sign-out bridge passed.");
