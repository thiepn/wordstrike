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
