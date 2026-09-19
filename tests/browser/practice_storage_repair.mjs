import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium, firefox, webkit } from "playwright";

const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "browser-artifacts/practice-storage-repair");
fs.mkdirSync(out, { recursive: true });
const mime = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".woff2":"font/woff2" };
const server = http.createServer((req,res) => {
  let file = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  try { res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream"); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));

const browserName = process.env.PRACTICE_BROWSER ?? "chromium";
const browser = await ({ chromium, firefox, webkit })[browserName].launch();
const report = { browser: browserName, status: "FAIL", cases: [] };

async function seedLegacyCoachDb(page, databaseName, mode) {
  await page.evaluate(async ({ databaseName, mode }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 12);
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.createObjectStore("coachPlans", { keyPath: "coachPlanId" });
        store.createIndex("profileId", "profileId");
        store.createIndex("contextId", "contextId");
        store.createIndex("localDayKey", "localDayKey");
        store.createIndex("status", "status");
        store.createIndex("updatedAt", "updatedAt");
        if (mode === "wrong") store.createIndex("profileContextDay", ["profileId", "localDayKey"], { unique: false });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
  }, { databaseName, mode });
}

async function exercise(page, databaseName) {
  return page.evaluate(async (databaseName) => {
    const constants = await import("/js/practiceLab/practiceConstants.js");
    const { createPracticeIndexedDbStore, getPracticeDatabaseSchemaIssues } = await import("/js/practiceLab/practiceIndexedDbStore.js");
    const store = createPracticeIndexedDbStore({ databaseName });
    await store.open();
    const first = {
      coachPlanId: "practice-coach-plan_db13-browser-12345678",
      profileId: "practice-profile_db13-browser-12345678",
      contextId: "practice-context_db13-browser-12345678",
      localDayKey: "2026-09-19",
      status: "planned",
      updatedAt: "2026-09-19T18:00:00.000Z",
    };
    await store.runTransaction(["coachPlans"], "readwrite", async transaction => {
      const existing = await transaction.query("coachPlans", "profileContextDay", [first.profileId, first.contextId, first.localDayKey]);
      if (!existing.length) await transaction.put("coachPlans", first);
    });
    const rows = await store.query("coachPlans", "profileContextDay", [first.profileId, first.contextId, first.localDayKey]);
    store.close();

    const native = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = native.transaction(["coachPlans"], "readonly");
    const objectStore = transaction.objectStore("coachPlans");
    const index = objectStore.index("profileContextDay");
    const schema = {
      databaseVersion: native.version,
      expectedVersion: constants.PRACTICE_DATABASE_VERSION,
      keyPath: Array.from(index.keyPath),
      unique: index.unique,
      rows: rows.length,
      issues: getPracticeDatabaseSchemaIssues(native),
    };
    native.close();
    return schema;
  }, databaseName);
}


async function exerciseCoachTransactionFailure(page, databaseName) {
  return page.evaluate(async (databaseName) => {
    const { createPracticeIndexedDbStore } = await import("/js/practiceLab/practiceIndexedDbStore.js");
    const { createPracticeRepository } = await import("/js/practiceLab/practiceRepository.js");
    const { createPracticeManifestStore } = await import("/js/practiceLab/practiceManifestStore.js");
    const { createDefaultPracticeManifest, createDefaultPracticeProfile } = await import("/js/practiceLab/practiceDefaults.js");
    const { createDefaultPracticeContext } = await import("/js/practiceLab/practiceContext.js");
    const { createPracticeCoachPlanRecord } = await import("/js/practiceLab/practiceCoachPlan.js");
    const { initializePracticeCoachRuntimeData } = await import("/js/practiceLab/practiceLabControllerRuntimeV25.js");

    const now = () => new Date("2026-09-19T18:00:00.000Z");
    const profileId = "practice-profile_browser-coach-recovery-12345678";
    const profile = createDefaultPracticeProfile({ profileId, now });
    const context = createDefaultPracticeContext({ profileId, now });
    const baseStore = createPracticeIndexedDbStore({ databaseName });
    await baseStore.open();
    await baseStore.put("profiles", profile);
    await baseStore.put("contexts", context);

    let transactionCalls = 0, failPlanWrites = true;
    const dataStore = {
      kind: baseStore.kind,
      open: (...args) => baseStore.open(...args),
      close: (...args) => baseStore.close(...args),
      get: (...args) => baseStore.get(...args),
      put: (...args) => baseStore.put(...args),
      delete: (...args) => baseStore.delete(...args),
      list: (...args) => baseStore.list(...args),
      query: (...args) => baseStore.query(...args),
      clearStore: (...args) => baseStore.clearStore(...args),
      get isOpen() { return baseStore.isOpen; },
      async runTransaction(...args) {
        if (args[0].includes("coachPlans") && failPlanWrites) {
          transactionCalls += 1;
          throw new Error("simulated atomic plan write failure");
        }
        return baseStore.runTransaction(...args);
      },
    };

    const values = new Map();
    const storage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key),
    };
    const manifestStore = createPracticeManifestStore({
      storage,
      createDefault: options => createDefaultPracticeManifest({ profileId, now, ...options }),
      defaultOptions: { profileId, now },
    });
    const repository = createPracticeRepository({ dataStore, manifestStore, now });
    const initialized = await initializePracticeCoachRuntimeData({ dataStore, repository, manifestStore });
    const plan = createPracticeCoachPlanRecord({
      profileId,
      contextId: context.contextId,
      localDayKey: "2026-09-19",
      requestedMinutes: 5,
      inputFingerprint: "browser-recovery",
      blocks: [],
      now,
    });
    let rejected = false;
    try { await repository.createCoachPlan(plan); } catch { rejected = true; }
    const absentAfterFailure = (await baseStore.list("coachPlans")).length === 0;
    failPlanWrites = false;
    const created = await repository.createCoachPlan(plan);
    const saved = await baseStore.get("coachPlans", plan.coachPlanId);
    baseStore.close();
    return {
      rejected, absentAfterFailure,
      initializedProfileId: initialized.profile.profileId,
      initializedContextId: initialized.context.contextId,
      transactionCalls,
      created: created.created,

      saved: saved?.coachPlanId === plan.coachPlanId,
    };
  }, databaseName);
}


async function exerciseManifestQuota(page) {
  return page.evaluate(async () => {
    const constants = await import("/js/practiceLab/practiceConstants.js");
    const { createDefaultPracticeManifest } = await import("/js/practiceLab/practiceDefaults.js");
    const { createPracticeManifestStore } = await import("/js/practiceLab/practiceManifestStore.js");
    const profileId = "practice-profile_manifest-quota-browser-12345678";
    const now = () => new Date("2026-09-19T18:00:00.000Z");
    localStorage.clear();
    const legacy = createDefaultPracticeManifest({ profileId, now, overrides: { databaseVersion: 12 } });
    // Force a valid legacy normalization delta so load() has to persist the
    // migrated manifest while localStorage is saturated.
    delete legacy.settings.physicalKeyboardTelemetryEnabled;
    localStorage.setItem(constants.PRACTICE_MANIFEST_KEY, JSON.stringify(legacy));

    let fillers = 0;
    // Fill coarse-to-fine so less than 128 bytes remain. The Practice manifest
    // is larger than that, guaranteeing its temporary crash-safe copy hits the
    // browser's actual localStorage quota.
    for (const size of [128 * 1024, 32 * 1024, 8 * 1024, 2 * 1024, 512, 128]) {
      const chunk = "q".repeat(size);
      for (;;) {
        try {
          localStorage.setItem(`practice-quota-filler-${fillers}`, chunk);
          fillers += 1;
        } catch (error) {
          if (error?.name !== "QuotaExceededError") throw error;
          break;
        }
      }
    }
    if (!fillers) throw new Error("Browser did not allow quota fixture allocation");

    const store = createPracticeManifestStore({
      storage: localStorage,
      defaultOptions: { profileId, now },
    });
    const loaded = store.load();
    const stored = JSON.parse(localStorage.getItem(constants.PRACTICE_MANIFEST_KEY));
    const result = {
      recovery: loaded.recovery,
      loadedVersion: loaded.manifest.databaseVersion,
      storedVersion: stored.databaseVersion,
      currentVersion: constants.PRACTICE_DATABASE_VERSION,
      fillers,
    };
    for (let i = 0; i < fillers; i += 1) localStorage.removeItem(`practice-quota-filler-${i}`);
    return result;
  });
}

try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });

  for (const mode of ["missing", "wrong"]) {
    const databaseName = `wordstrike-practice-db13-${browserName}-${mode}`;
    await seedLegacyCoachDb(page, databaseName, mode);
    const result = await exercise(page, databaseName);
    assert.equal(result.databaseVersion, 13);
    assert.equal(result.expectedVersion, 13);
    assert.deepEqual(result.keyPath, ["profileId", "contextId", "localDayKey"]);
    assert.equal(result.unique, true);
    assert.equal(result.rows, 1);
    assert.deepEqual(result.issues, []);
    report.cases.push({ mode, ...result });
  }

  const recovery = await exerciseCoachTransactionFailure(page, `wordstrike-practice-coach-recovery-${browserName}`);
  assert.equal(recovery.rejected, true);
  assert.equal(recovery.absentAfterFailure, true);
  assert.equal(recovery.initializedProfileId, "practice-profile_browser-coach-recovery-12345678");
  assert.ok(recovery.initializedContextId.startsWith("practice-context_"));
  assert.equal(recovery.transactionCalls, 1, "only the plan write should encounter the simulated wrapper failure");
  assert.equal(recovery.created, true);

  assert.equal(recovery.saved, true);
  report.cases.push({ mode: "coach-atomic-failure-and-retry", ...recovery });
  const quota = await exerciseManifestQuota(page);
  assert.equal(quota.loadedVersion, 13);
  assert.equal(quota.currentVersion, 13);
  assert.ok(["quota-direct", "quota-readonly"].includes(quota.recovery), `Unexpected quota recovery: ${quota.recovery}`);
  assert.ok([12, 13].includes(quota.storedVersion));
  report.cases.push({ mode: "manifest-localstorage-quota", ...quota });

  report.status = "PASS";
  await context.close();
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
