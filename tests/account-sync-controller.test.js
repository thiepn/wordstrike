import assert from "node:assert/strict";
import test from "node:test";
import { createAccountDataSyncService } from "../js/accountDataSync.js";

function baseSnapshot() {
  return {
    schemaVersion: 2,
    updatedAt: 1000,
    campaign: { settings: { screenShake: true }, levels: {}, campaignFurthestLevel: 1, currentFurthestLevel: 1 },
    mode: { marker: "local" },
    settings: { screenShake: true },
    sync: { version: 1, counterBase: {}, devices: {}, settingClocks: {} },
  };
}

function harness({
  invoke,
  saveCampaign = () => true,
  saveMode = () => true,
  saveUserState = () => true,
  fetchFn = async () => ({ ok: true, json: async () => ({ ok: true, data: { profile: { revision: 4, data: baseSnapshot() } } }) }),
} = {}) {
  const scheduled = [];
  const applied = [];
  const userStates = [];
  let clock = 1000;
  const client = {
    functions: {
      invoke: invoke || (async (_name, { body }) => (
        body.action === "get"
          ? { data: { ok: true, data: { profile: { revision: 2, data: baseSnapshot() } } }, error: null }
          : { data: { ok: true, data: { profile: { revision: 3, data: body.data } } }, error: null }
      )),
    },
  };
  const service = createAccountDataSyncService({
    getClient: () => client,
    createSnapshot: () => baseSnapshot(),
    mergeSnapshots: (local, remote, options) => ({
      snapshot: {
        ...local,
        sync: { version: 1, counterBase: {}, devices: {}, settingClocks: {} },
        remoteRevisionSeen: remote?.revision ?? 0,
      },
      localState: {
        observedCounters: {},
        ownCounters: {},
        observedSettings: local.settings,
        settingClocks: {},
        lastSuccessAt: null,
        lastRemoteRevision: remote?.revision ?? 0,
      },
      options,
    }),
    loadUserState: () => ({
      observedCounters: {},
      ownCounters: {},
      observedSettings: null,
      settingClocks: {},
      lastSuccessAt: null,
      lastRemoteRevision: 0,
    }),
    saveUserState: (userId, value) => {
      userStates.push({ userId, value });
      return saveUserState(userId, value);
    },
    getDeviceId: () => "ws-device-test",
    saveCampaign: (value) => {
      applied.push(["campaign", value]);
      return saveCampaign(value);
    },
    saveMode: (value) => {
      applied.push(["mode", value]);
      return saveMode(value);
    },
    now: () => clock,
    isOnline: () => true,
    schedule: (callback, delay) => {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    cancelSchedule() {},
    addGlobalListener() {},
    documentRef: null,
    fetchFn,
    supabaseUrl: "https://example.supabase.co",
  });
  return {
    service,
    scheduled,
    applied,
    userStates,
    setClock(value) { clock = value; },
  };
}

test("successful account sync applies locally before revision-guarded cloud write", async () => {
  const calls = [];
  const h = harness({
    invoke: async (_name, { body }) => {
      calls.push(structuredClone(body));
      if (body.action === "get") {
        return { data: { ok: true, data: { profile: { revision: 2, data: baseSnapshot() } } }, error: null };
      }
      assert.equal(body.expectedRevision, 2);
      return { data: { ok: true, data: { profile: { revision: 3, data: body.data } } }, error: null };
    },
  });

  const result = await h.service.startAccountDataSync(
    { id: "user-1" },
    { accessToken: "token-1" },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map((body) => body.action), ["get", "put"]);
  assert.deepEqual(h.applied.map(([domain]) => domain), ["campaign", "mode"]);
  assert.equal(h.service.getAccountDataSyncState().status, "synced");
  assert.equal(h.service.getAccountDataSyncState().revision, 3);
  assert.equal(h.service.getAccountDataSyncState().dirty, false);
  assert.ok(h.userStates.length >= 2);
});

test("revision conflicts refetch and remerge instead of overwriting another device", async () => {
  const calls = [];
  let getCount = 0;
  let putCount = 0;
  const h = harness({
    invoke: async (_name, { body }) => {
      calls.push(structuredClone(body));
      if (body.action === "get") {
        getCount += 1;
        const revision = getCount === 1 ? 4 : 5;
        return { data: { ok: true, data: { profile: { revision, data: baseSnapshot() } } }, error: null };
      }
      putCount += 1;
      if (putCount === 1) {
        return {
          data: null,
          error: {
            context: {
              json: async () => ({ ok: false, error: { code: "REVISION_CONFLICT" } }),
            },
          },
        };
      }
      assert.equal(body.expectedRevision, 5);
      return { data: { ok: true, data: { profile: { revision: 6, data: body.data } } }, error: null };
    },
  });

  const result = await h.service.startAccountDataSync({ id: "user-1" });
  assert.equal(result.ok, true);
  assert.equal(getCount, 2);
  assert.equal(putCount, 2);
  assert.equal(h.service.getAccountDataSyncState().revision, 6);
});

test("local restore failure blocks cloud write and schedules exponential retry", async () => {
  let puts = 0;
  const h = harness({
    saveCampaign: () => false,
    invoke: async (_name, { body }) => {
      if (body.action === "get") {
        return { data: { ok: true, data: { profile: { revision: 1, data: baseSnapshot() } } }, error: null };
      }
      puts += 1;
      return { data: { ok: true, data: { profile: { revision: 2, data: body.data } } }, error: null };
    },
  });

  const result = await h.service.startAccountDataSync({ id: "user-1" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "CAMPAIGN_STORAGE_FAILED");
  assert.equal(puts, 0);
  assert.equal(h.service.getAccountDataSyncState().status, "error");
  assert.equal(h.service.getAccountDataSyncState().dirty, true);
  assert.equal(h.scheduled.at(-1).delay, 1000);
});

test("sync metadata storage failure is detected before cloud mutation", async () => {
  let puts = 0;
  const h = harness({
    saveUserState: () => false,
    invoke: async (_name, { body }) => {
      if (body.action === "get") {
        return { data: { ok: true, data: { profile: { revision: 1, data: baseSnapshot() } } }, error: null };
      }
      puts += 1;
      return { data: { ok: true, data: { profile: { revision: 2, data: body.data } } }, error: null };
    },
  });

  const result = await h.service.startAccountDataSync({ id: "user-1" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "SYNC_STATE_STORAGE_FAILED");
  assert.equal(puts, 0);
});

test("sign-out during an in-flight cloud write cannot republish the old account as synced", async () => {
  let resolvePut;
  const h = harness({
    invoke: async (_name, { body }) => {
      if (body.action === "get") {
        return { data: { ok: true, data: { profile: { revision: 2, data: baseSnapshot() } } }, error: null };
      }
      return new Promise((resolve) => { resolvePut = resolve; });
    },
  });

  const pending = h.service.startAccountDataSync(
    { id: "user-1" },
    { accessToken: "token-user-1" },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(h.service.getAccountDataSyncState().status, "syncing");
  h.service.stopAccountDataSync();
  assert.equal(h.service.getAccountDataSyncState().status, "idle");

  resolvePut({
    data: { ok: true, data: { profile: { revision: 3, data: baseSnapshot() } } },
    error: null,
  });
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.code, "INACTIVE");
  assert.equal(h.service.getAccountDataSyncState().status, "idle");
  assert.equal(h.service.getAccountDataSyncState().userId, null);
});

test("page-close flush uses authenticated keepalive PUT against last known revision", async () => {
  const keepaliveCalls = [];
  const h = harness({
    fetchFn: async (url, options) => {
      keepaliveCalls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          data: { profile: { revision: 4, data: baseSnapshot() } },
        }),
      };
    },
  });

  await h.service.startAccountDataSync(
    { id: "user-1" },
    { accessToken: "token-keepalive" },
  );
  assert.equal(h.service.updateAccountDataSyncAccessToken("token-refreshed"), true);
  h.service.markAccountDataDirty();
  const result = await h.service.flushAccountDataSync();
  assert.equal(result.ok, true);
  assert.equal(keepaliveCalls.length, 1);
  assert.equal(keepaliveCalls[0].options.keepalive, true);
  assert.match(keepaliveCalls[0].options.headers.Authorization, /Bearer token-refreshed/);
  assert.ok(keepaliveCalls[0].options.headers.apikey,
    "direct keepalive requests must include the Supabase publishable key");
  const body = JSON.parse(keepaliveCalls[0].options.body);
  assert.equal(body.action, "put");
  assert.equal(body.expectedRevision, 3);
});

console.log("Account sync controller detects local-write failures, retries conflicts safely, backs off failures, and performs keepalive flushes.");
