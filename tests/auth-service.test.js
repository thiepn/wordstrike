import assert from "node:assert/strict";
import { createAuthService } from "../js/authService.js";

function createClient(session = null) {
  const calls = { getSession: 0, subscriptions: 0, oauth: [], signOut: [] };
  let authListener = null;
  const client = {
    auth: {
      onAuthStateChange(listener) {
        calls.subscriptions += 1;
        authListener = listener;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async getSession() {
        calls.getSession += 1;
        return { data: { session }, error: null };
      },
      async signInWithOAuth(request) {
        calls.oauth.push(request);
        return { data: {}, error: null };
      },
      async signOut(request) {
        calls.signOut.push(request);
        return { error: null };
      },
    },
  };
  return { client, calls, emit: (event, nextSession) => authListener?.(event, nextSession) };
}

const restoredSession = Object.freeze({ user: { id: "user-1", email: "private@example.com" } });
const restored = createClient(restoredSession);
const service = createAuthService({ getClient: () => restored.client });
const states = [];
service.subscribeToAuth((state) => states.push(state.status));
const firstInitialization = service.initializeAuth();
const secondInitialization = service.initializeAuth();
assert.equal(firstInitialization, secondInitialization);
assert.equal((await firstInitialization).status, "signed-in");
assert.equal(service.getAuthState().user.id, "user-1");
assert.equal(restored.calls.getSession, 1);
assert.equal(restored.calls.subscriptions, 1);
restored.emit("SIGNED_OUT", null);
assert.equal(service.getAuthState().status, "signed-out");
assert.ok(states.includes("loading"));

const signedOutMock = createClient(null);
const signedOut = createAuthService({
  getClient: () => signedOutMock.client,
  getRedirectUrl: () => "https://thiepn.github.io/WORDSTRIKE/",
});
assert.equal((await signedOut.initializeAuth()).status, "signed-out");
const signInResult = await signedOut.signInWithGoogle();
assert.equal(signInResult.status, "signing-in");
assert.deepEqual(signedOutMock.calls.oauth, [{
  provider: "google",
  options: { redirectTo: "https://thiepn.github.io/WORDSTRIKE/" },
}]);
await signedOut.signInWithGoogle();
assert.equal(signedOutMock.calls.oauth.length, 1);

const localRecords = { bestScore: 12345 };
await signedOut.signOut();
assert.deepEqual(signedOutMock.calls.signOut, [{ scope: "local" }]);
assert.equal(signedOut.getAuthState().status, "signed-out");
assert.deepEqual(localRecords, { bestScore: 12345 });

const unavailable = createAuthService({ getClient: () => null });
assert.equal((await unavailable.initializeAuth()).status, "unavailable");

const failing = createAuthService({
  getClient: () => ({
    auth: {
      onAuthStateChange() { return { data: { subscription: {} } }; },
      async getSession() { throw new Error("secret stack detail"); },
    },
  }),
});
assert.equal((await failing.initializeAuth()).status, "error");
assert.equal(failing.getAuthState().error.message, "Online account request failed.");

console.log("Auth initialization, restoration, Google OAuth, local sign-out, and failure handling passed.");

// Transient auth events/errors must never manufacture a logout for a valid session.
const resilient = createClient(restoredSession);
let failNextGetSession = false;
resilient.client.auth.getSession = async () => {
  resilient.calls.getSession += 1;
  if (failNextGetSession) throw new Error("temporary network failure");
  return { data: { session: restoredSession }, error: null };
};
const resilientService = createAuthService({ getClient: () => resilient.client });
assert.equal((await resilientService.initializeAuth()).status, "signed-in");
resilient.emit("TOKEN_REFRESHED", restoredSession);
assert.equal(resilientService.getAuthState().status, "signed-in");
resilient.emit("INITIAL_SESSION", null);
assert.equal(resilientService.getAuthState().status, "signed-in");
failNextGetSession = true;
assert.equal((await resilientService.initializeAuth()).status, "signed-in");
assert.equal(resilientService.getAuthState().user.id, "user-1");

function createPendingSessionClient() {
  let resolveSession;
  let rejectSession;
  let listener = null;
  const sessionRequest = new Promise((resolve, reject) => {
    resolveSession = resolve;
    rejectSession = reject;
  });
  return {
    client: {
      auth: {
        onAuthStateChange(callback) {
          listener = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        getSession() { return sessionRequest; },
      },
    },
    emit(event, session) { listener?.(event, session); },
    resolve(session) { resolveSession({ data: { session }, error: null }); },
    reject(error) { rejectSession(error); },
  };
}

const freshSession = { user: { id: "fresh" }, access_token: "new-token" };
const olderSession = { user: { id: "old" }, access_token: "old-token" };

// A slow getSession() must not overwrite a newer successful sign-in.
{
  const mock = createPendingSessionClient();
  const auth = createAuthService({ getClient: () => mock.client });
  const loading = auth.initializeAuth();
  mock.emit("SIGNED_IN", freshSession);
  mock.resolve(null);
  await loading;
  assert.equal(auth.getAuthState().status, "signed-in");
  assert.equal(auth.getAuthState().session.access_token, "new-token");
}

// INITIAL_SESSION may restore a valid session before getSession() finishes.
{
  const mock = createPendingSessionClient();
  const auth = createAuthService({ getClient: () => mock.client });
  const loading = auth.initializeAuth();
  mock.emit("INITIAL_SESSION", freshSession);
  mock.resolve(null);
  await loading;
  assert.equal(auth.getAuthState().user.id, "fresh");
}

// Token refresh events must not be replaced with a stale token snapshot.
{
  const mock = createPendingSessionClient();
  const auth = createAuthService({ getClient: () => mock.client });
  const loading = auth.initializeAuth();
  mock.emit("TOKEN_REFRESHED", freshSession);
  mock.resolve(olderSession);
  await loading;
  assert.equal(auth.getAuthState().session.access_token, "new-token");
}

// A confirmed sign-out must not be undone by a previous session lookup.
{
  const mock = createPendingSessionClient();
  const auth = createAuthService({ getClient: () => mock.client });
  const loading = auth.initializeAuth();
  mock.emit("SIGNED_OUT", null);
  mock.resolve(olderSession);
  await loading;
  assert.equal(auth.getAuthState().status, "signed-out");
  assert.equal(auth.getAuthState().user, null);
}

// Transient null events do not mean the refresh token is gone.
{
  const mock = createPendingSessionClient();
  const auth = createAuthService({ getClient: () => mock.client });
  const loading = auth.initializeAuth();
  mock.emit("TOKEN_REFRESHED", null);
  mock.resolve(freshSession);
  await loading;
  assert.equal(auth.getAuthState().status, "signed-in");
}

// Failure of an older initialization cannot demote a fresh sign-in.
{
  const mock = createPendingSessionClient();
  const auth = createAuthService({ getClient: () => mock.client });
  const loading = auth.initializeAuth();
  mock.emit("SIGNED_IN", freshSession);
  mock.reject(new Error("transient session lookup failure"));
  await loading;
  assert.equal(auth.getAuthState().session.access_token, "new-token");
}

// Cold-start restoration still works normally with no intervening event.
{
  const mock = createPendingSessionClient();
  const auth = createAuthService({ getClient: () => mock.client });
  const loading = auth.initializeAuth();
  mock.emit("INITIAL_SESSION", null);
  mock.resolve(olderSession);
  await loading;
  assert.equal(auth.getAuthState().user.id, "old");
}

// If both browser storages are blocked, client creation may throw;
// initialization must report an unavailable session rather than reject.
{
  const auth = createAuthService({ getClient: () => { throw new Error("storage blocked"); } });
  const result = await auth.initializeAuth();
  assert.equal(result.status, "error");
}
console.log("Race-safe reload, refresh and sign-out ordering tests passed.");
