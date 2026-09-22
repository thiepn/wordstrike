import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthService } from '../js/authService.js';
import { createSharedAuthStorage, SUPABASE_AUTH_STORAGE_KEY as AUTH_KEY } from '../js/supabaseClient.js';
import { createLeaderboardProfileService } from '../js/leaderboardProfileService.js';
const session = id => ({ user: { id }, access_token: `test-${id}`, refresh_token: `refresh-${id}` });
const pending = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const turn = () => new Promise(r => setTimeout(r, 0));
function authHarness(initial = null) {
  let callback, read = async () => ({ data: { session: initial }, error: null }), logout = async () => ({ error: null });
  const client = { auth: {
    onAuthStateChange(fn) { callback = fn; return { data: { subscription: {} } }; },
    getSession: () => read(), signOut: () => logout(),
    signInWithOAuth: async () => ({ error: null }),
  } };
  const service = createAuthService({ getClient: () => client });
  return { service, emit: (event, value) => callback(event, value), read: fn => { read = fn; }, logout: fn => { logout = fn; } };
}

test('a stale session read cannot erase a newer Google callback', async () => {
  const h = authHarness(), wait = pending(); h.read(() => wait.promise);
  const initialized = h.service.initializeAuth();
  h.emit('SIGNED_IN', session('A'));
  wait.resolve({ data: { session: null }, error: null });
  await initialized;
  assert.equal(h.service.getAuthState().user.id, 'A');
});
test('a stale token read cannot resurrect an explicitly signed-out account', async () => {
  const h = authHarness(session('A')); await h.service.initializeAuth();
  const wait = pending(); h.read(() => wait.promise);
  const refresh = h.service.refreshAuth(); h.emit('SIGNED_OUT', null);
  wait.resolve({ data: { session: session('A') }, error: null }); await refresh;
  assert.equal(h.service.getAuthState().status, 'signed-out');
});
test('SDK auth notifications run outside the auth callback; failing views are isolated', async () => {
  const h = authHarness(); await h.service.initializeAuth();
  let underLock = false, observed = 0;
  h.service.subscribeToAuth(() => { throw Error('view failure'); });
  h.service.subscribeToAuth(state => { if (state.status === 'signed-in') { assert.equal(underLock, false); observed++; } });
  underLock = true; h.emit('TOKEN_REFRESHED', session('A')); underLock = false;
  assert.equal(observed, 0); await turn(); assert.equal(observed, 1);
});
test('temporary refresh and signout failures preserve an existing account', async () => {
  const h = authHarness(session('A')); await h.service.initializeAuth();
  h.read(async () => { throw Error('offline'); }); await h.service.refreshAuth();
  assert.equal(h.service.getAuthState().user.id, 'A');
  h.logout(async () => ({ error: { message: 'network' } })); await h.service.signOut();
  assert.equal(h.service.getAuthState().user.id, 'A');
  h.emit('TOKEN_REFRESHED', null); h.emit('INITIAL_SESSION', null);
  assert.equal(h.service.getAuthState().user.id, 'A');
});
test('SDK absence is retryable rather than a permanent failed initialization', async () => {
  let client = null;
  const service = createAuthService({ getClient: () => client });
  assert.equal((await service.initializeAuth()).status, 'unavailable');
  client = { auth: { getSession: async () => ({ data: { session: session('A') } }) } };
  assert.equal((await service.initializeAuth()).user.id, 'A');
});
test('token quota recovery only removes the reserve and an independently durable game mirror', async () => {
  const records = new Map([['unrelated.app', 'KEEP'], ['wordstrike.auth-space-reserve.v1', 'reserve']]);
  let quota = true, reclaimed = 0;
  const storage = {
    getItem: key => records.get(key) ?? null,
    removeItem: key => records.delete(key),
    setItem(key, value) { if (key === AUTH_KEY && quota) { const e = Error('full'); e.name = 'QuotaExceededError'; throw e; } records.set(key, value); },
  };
  const adapter = createSharedAuthStorage({ getStorage: () => storage, reclaim: async () => { reclaimed++; quota = false; } });
  await adapter.setItem(AUTH_KEY, 'fresh-token');
  assert.equal(reclaimed, 1); assert.equal(adapter.getItem(AUTH_KEY), 'fresh-token');
  assert.equal(records.get('unrelated.app'), 'KEEP');
  adapter.removeItem(AUTH_KEY); assert.equal(adapter.getItem(AUTH_KEY), null);
});
test('denied persistent auth storage fails explicitly instead of using a fake memory login', async () => {
  const adapter = createSharedAuthStorage({ getStorage() { throw Error('denied'); } });
  await assert.rejects(adapter.setItem(AUTH_KEY, 'token'), /denied/);
  assert.throws(() => adapter.getItem(AUTH_KEY), /denied/);
});
function profileHarness() {
  let invoke = async () => ({ data: { ok: true, data: { profile: { username: 'Existing' } } } });
  const service = createLeaderboardProfileService({ getClient: () => ({ functions: { invoke: (...args) => invoke(...args) } }) });
  return { service, invoke: fn => { invoke = fn; } };
}
test('old public-profile response cannot leak across signout and same-account relogin', async () => {
  const h = profileHarness(), old = pending(); h.invoke(() => old.promise);
  const request = h.service.initializeLeaderboardProfile({ id: 'A' });
  h.service.resetLeaderboardProfile();
  h.invoke(async () => ({ data: { ok: true, data: { profile: { username: 'NewName' } } } }));
  await h.service.initializeLeaderboardProfile({ id: 'A' });
  old.resolve({ data: { ok: true, data: { profile: { username: 'OldName' } } } }); await request;
  assert.equal(h.service.getLeaderboardProfileState().profile.username, 'NewName');
});
test('same-user focus/refresh does not cancel a username claim', async () => {
  const h = profileHarness(); await h.service.initializeLeaderboardProfile({ id: 'A' });
  const claim = pending(); h.invoke(() => claim.promise);
  const request = h.service.claimUsername('PilotTwo');
  await h.service.initializeLeaderboardProfile({ id: 'A' });
  assert.equal(h.service.getLeaderboardProfileState().status, 'claiming');
  claim.resolve({ data: { ok: true, data: { profile: { username: 'PilotTwo' } } } }); await request;
  assert.equal(h.service.getLeaderboardProfileState().profile.username, 'PilotTwo');
});
test('public-profile refresh error retains the last known username', async () => {
  const h = profileHarness(); await h.service.initializeLeaderboardProfile({ id: 'A' });
  h.invoke(async () => { throw Error('offline'); });
  await h.service.initializeLeaderboardProfile({ id: 'A' }, { force: true });
  assert.equal(h.service.getLeaderboardProfileState().profile.username, 'Existing');
  assert.equal(h.service.getLeaderboardProfileState().status, 'ready');
});
test('editing a draft cancels a stale availability response without disabling future checks', async () => {
  const h = profileHarness(); await h.service.initializeLeaderboardProfile({ id: 'A' });
  const check = pending(); h.invoke(() => check.promise);
  const request = h.service.checkUsernameAvailability('OldDraft');
  h.service.setUsernameDraft('NewDraft');
  check.resolve({ data: { ok: true, data: { username: 'OldDraft', available: true } } }); await request;
  assert.equal(h.service.getLeaderboardProfileState().draft, 'NewDraft');
  assert.equal(h.service.getLeaderboardProfileState().availability, null);
  assert.notEqual(h.service.getLeaderboardProfileState().status, 'checking');
});
