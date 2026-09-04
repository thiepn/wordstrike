import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

async function patch(path, edits) {
  let source = await readFile(path, "utf8");
  for (const [before, after] of edits) {
    if (!source.includes(before)) throw new Error(`PL8 follow-up anchor missing in ${path}: ${before.slice(0, 100)}`);
    source = source.replace(before, after);
  }
  await writeFile(path, source);
}

await patch("js/practiceLab/practiceSessionEngine.js", [[
  "    transition(\"active\", \"resume\");\n    timingSegmentId += 1;\n    timingSegmentStartReason = \"resume\";\n    hasInsertionInTimingSegment = false;\n    if (performanceTimingStarted) activeIntervalStart = at;\n    pauseReason = null;",
  "    const restoring = pauseReason === \"restored\";\n    transition(\"active\", \"resume\");\n    if (!restoring) {\n      timingSegmentId += 1;\n      timingSegmentStartReason = \"resume\";\n      hasInsertionInTimingSegment = false;\n    } else {\n      timingSegmentStartReason = \"restore\";\n      hasInsertionInTimingSegment = false;\n    }\n    if (performanceTimingStarted) activeIntervalStart = at;\n    pauseReason = null;"
]]);

await patch("docs/PRACTICE_LAB_SESSION_ENGINE.md", [
  [
    "Status: Prompt 3 headless foundation + PL5 context identity",
    "Status: Prompt 3 headless foundation + PL5 context identity + PL8 robust latency foundation",
  ],
  [
    "Injected monotonic time drives active/paused duration, latency, words, checkpoint cadence, and transitions. Injected wall time drives UTC timestamps, local-day context, expiry, and wall duration. Active time never derives from wall-clock subtraction and freezes while paused or terminal.",
    "Injected monotonic time drives active/paused duration, latency, words, checkpoint cadence, and transitions. Injected wall time drives UTC timestamps, local-day context, expiry, and wall duration. Active time never derives from wall-clock subtraction and freezes while paused or terminal. PL8 additionally assigns every input event a deterministic `timingSegmentId`; ordinary pause/resume creates a new segment, checkpoint restore starts a fresh restore segment, and correction activity remains inside the current segment with a separate post-correction boundary.",
  ],
  [
    "**buildPracticeCheckpoint()** uses the current schema: immutable **profileId + contextId + sessionId**, versions, configuration, full bounded content snapshot and descriptor/hash, cursor/typed buffer, completed units, durations, aggregate metrics, original start/timezone context, and at most 32 recent input events. It contains no unbounded trace, callback, DOM, auth, or ranking data.",
    "**buildPracticeCheckpoint()** uses the current schema: immutable **profileId + contextId + sessionId**, versions, configuration, full bounded content snapshot and descriptor/hash, cursor/typed buffer, completed units, durations, aggregate metrics, original start/timezone context, at most 32 recent input events, and small content-free event-trace coverage metadata. New tail events include PL8 trace/timing-segment metadata. Historical tails without those fields normalize in memory on restore. It contains no unbounded trace, callback, DOM, auth, or ranking data.",
  ],
  [
    "**createPracticeEventBuffer()** retains the newest 20,000 detailed events by default. It preserves total count, marks truncation, and keeps aggregate metrics independently. Traces are immutable copies, remain in memory, and are cleared during destroy.",
    "**createPracticeEventBuffer()** retains the newest 20,000 detailed events by default. It preserves total count, marks truncation, and keeps aggregate metrics independently. `getMetadata()` exposes only capacity, retained/total counts, and truncation state; it contains no expected/entered text. PL8 maps that metadata to `complete-session` or `retained-window` analysis scope. Traces are immutable copies, remain in memory, and are cleared during destroy.",
  ],
  [
    "Insufficient evidence returns null.",
    "Insufficient evidence returns null.\n\nPL8 does **not** redefine this legacy consistency field. At finalization, a separate robust classifier uses median/MAD and a versioned adaptive threshold to distinguish `fluent`, `disfluent`, `interruption`, and `excluded` transitions. The compact result is persisted as `fluencySummary`; raw/classified event traces are not persisted. See **PRACTICE_LAB_LATENCY_CLASSIFICATION.md**.",
  ],
  [
    "**buildPracticeSessionResult()** maps immutable **profileId + contextId + sessionId**, version, content descriptor, UTC/local time, durations, generic metrics, targets, and bounded optional analysis into a current Practice summary. The historical contextId is persisted permanently and is never derived later from activeContextId. It creates no recommendation, mastery, leaderboard, ranked, submission, or raw-event field.",
    "**buildPracticeSessionResult()** maps immutable **profileId + contextId + sessionId**, version, content descriptor, UTC/local time, durations, generic metrics, targets, canonical PL8 `fluencySummary`, and bounded optional experiment analysis into a current Practice summary. The historical contextId is persisted permanently and is never derived later from activeContextId. `fluencySummary` is owned by generic foundation analysis, not experiment output. It creates no recommendation, mastery, leaderboard, ranked, submission, raw-event, or classified-event field.",
  ],
  [
    "Optional **analyzeResult()** receives an immutable snapshot containing the frozen profile/context identity, metrics, bounded in-memory trace, and observations. Any returned skill/review updates must match the completing summary's profileId and contextId; mixed-context output is rejected before commit. Output must be JSON-safe and at most 32 KiB. Analyzer failure blocks commit, pauses an active session, preserves/refreshes its checkpoint, and returns a recoverable **PRACTICE_SESSION_ANALYSIS_FAILED** error. Retry is explicit.",
    "Before optional experiment analysis, PL8 builds immutable generic `foundationAnalysis` from the bounded trace and coverage metadata. Optional **analyzeResult()** receives the frozen profile/context identity, metrics, bounded in-memory trace, observations, and `foundationAnalysis`. Experiment code may consume but cannot mutate or replace the canonical fluency summary. Any returned skill/review updates must match the completing summary's profileId and contextId; mixed-context output is rejected before commit. Output must be JSON-safe and at most 32 KiB. Foundation-analysis or experiment-analysis failure blocks commit, preserves/refreshes recovery state, and returns a recoverable **PRACTICE_SESSION_ANALYSIS_FAILED** error. Retry is explicit.",
  ],
  [
    " -> calculate metrics/observations\n -> optional analysis\n -> build + validate summary/profile update",
    " -> calculate metrics/observations\n -> build generic foundationAnalysis / fluencySummary\n -> optional experiment analysis\n -> build + validate summary/profile update",
  ],
  [
    "**getDiagnostics()** returns session/state/version, total/retained/truncated events, active duration, checkpoint state/count/time, content length, cursor, subscriber count, finalization state, and last error code. It excludes full expected/typed text, custom text, auth, and storage secrets.",
    "**getDiagnostics()** returns session/state/version, deterministic timing-segment ID, content-free event-buffer coverage metadata, active duration, checkpoint state/count/time, content length, cursor, subscriber count, finalization state, and last error code. It excludes full expected/typed text, custom text, auth, and storage secrets.",
  ],
  [
    "The only Prompt 2 schema extension is nullable **lastTrainingDayKey** on profiles, needed to count local active days idempotently. That persisted change advances only the profile record from v1 to v2. The deterministic migration adds null when absent; IndexedDB structural version 1, manifest version 1, and every other record version remain unchanged.",
    "Current Practice persistence follows the later PL5 context-identity schema: IndexedDB structural version 2, profile record version 3, context record version 1, and checkpoint record version 2. PL8 leaves those structural/profile/checkpoint versions unchanged and advances only `sessionSummary` from v2 to v3 by adding nullable `fluencySummary`. Historical summaries migrate with `fluencySummary: null` because their raw traces were never persisted and robust timing cannot be reconstructed honestly from old means/variances.",
  ],
]);

await patch("tests/practice-latency-classifier.test.js", [[
  "  assert.equal(result.sessionSummary.calibrationSampleCount, 22);",
  "  assert.equal(result.sessionSummary.calibrationSampleCount, 23);",
]]);

// Preserve the exact current PL5 regression file; PL8 changes only the session-summary version assertion.
let contextIdentityTest = execFileSync("git", ["show", "origin/main:tests/practice-context-identity.test.js"], { encoding: "utf8" });
const versionAnchor = "assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 2);";
if (!contextIdentityTest.includes(versionAnchor)) throw new Error("Current PL5 context identity version assertion was not found");
contextIdentityTest = contextIdentityTest.replace(versionAnchor, "assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 3);");
await writeFile("tests/practice-context-identity.test.js", contextIdentityTest);

console.log("PL8 follow-up patches applied");
