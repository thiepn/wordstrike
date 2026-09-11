import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceExact(path, from, to) {
  const source = read(path);
  if (!source.includes(from)) {
    throw new Error(`V13 finish token not found in ${path}: ${from.slice(0, 120)}`);
  }
  write(path, source.replace(from, to));
}

function replaceAllExact(path, from, to) {
  const source = read(path);
  if (!source.includes(from)) {
    throw new Error(`V13 finish token not found in ${path}: ${from.slice(0, 120)}`);
  }
  write(path, source.split(from).join(to));
}

function replaceRegex(path, pattern, replacement) {
  const source = read(path);
  if (!pattern.test(source)) {
    throw new Error(`V13 finish pattern not found in ${path}: ${pattern}`);
  }
  pattern.lastIndex = 0;
  write(path, source.replace(pattern, replacement));
}

// Historical feature tests validate semantic ownership rather than the V8
// side-effect import syntax. The source migration already converted those
// modules to named imports; only the assertion token changes here.
for (const [path, token] of [
  ["tests/speed-test-performance-contract.test.js", "speedTestPerformanceV1.js"],
  ["tests/speed-test-performance-v2.test.js", "speedTestPerformanceV2.js"],
  ["tests/speed-test-performance-v3.test.js", "speedTestPerformanceV3.js"],
  ["tests/speed-test-performance-v4.test.js", "speedTestPerformanceV4.js"],
  ["tests/speed-test-performance-v5.test.js", "speedTestPerformanceV5.js"],
  ["tests/speed-test-coach-v6.test.js", "speedTestResultsV6b.js"],
  ["tests/speed-test-coach-v7.test.js", "speedTestResultsV7.js"],
]) {
  const escaped = token.replaceAll(".", "\\.");
  replaceExact(path, `import "\\.\\/${escaped}";`, escaped);
}

// V12 lifecycle tests continue as backward-compatibility coverage while
// certifying that V13 supersedes the callback-capture bridge.
replaceAllExact(
  "tests/typing-results-runtime-v12.test.js",
  "assert.equal(TYPING_RESULTS_RUNTIME_VERSION, 12);",
  "assert.equal(TYPING_RESULTS_RUNTIME_VERSION, 13);",
);
replaceRegex(
  "tests/typing-results-runtime-v12.test.js",
  /const rootUrl = new URL\("\.\.\/", import\.meta\.url\);[\s\S]*?console\.log\("WORDSTRIKE V12 explicit Typing Results mount\/sync\/destroy, scoped Coach observation, stress cleanup, and shared lifecycle ownership passed\."\);/,
  `const rootUrl = new URL("../", import.meta.url);\nconst read = (path) => readFile(new URL(path, rootUrl), "utf8");\nconst [runtimeSource, featureSource, v6Source, v7Source, profileSource, bootstrapSource] = await Promise.all([\n  read("js/typingResultsRuntime.js"),\n  read("js/speedTestResultsFeature.js"),\n  read("js/speedTestResultsV6b.js"),\n  read("js/speedTestResultsV7.js"),\n  read("js/speedTestWordProfileV4.js"),\n  read("js/presentationBootstrap.js"),\n]);\n\nassert.match(runtimeSource, /export function createTypingResultsRuntime/);\nassert.match(runtimeSource, /runSpeedTestResultsFeatures/);\nassert.match(featureSource, /SPEED_TEST_RESULTS_LIFECYCLE_VERSION = 13/);\nassert.doesNotMatch(featureSource, /speedTestResultsObserverHub/);\nassert.doesNotMatch(v6Source, /new MutationObserver/);\nassert.doesNotMatch(v7Source, /new MutationObserver/);\nassert.doesNotMatch(profileSource, /new MutationObserver/);\nassert.match(bootstrapSource, /\\{ id: "typing-results", sync: syncTypingResultsRuntime \\}/,\n  "Typing Results must execute inside the one shared production presentation lifecycle");\n\nconsole.log("WORDSTRIKE V13 native Typing Results mount/sync/destroy, single scoped Coach observation, stress cleanup, and shared lifecycle ownership passed.");`,
);

replaceAllExact(
  "tests/results-runtime-v12-smoke.test.js",
  "assert.equal(TYPING_RESULTS_RUNTIME_VERSION, 12);",
  "assert.equal(TYPING_RESULTS_RUNTIME_VERSION, 13);",
);
replaceRegex(
  "tests/results-runtime-v12-smoke.test.js",
  /const root = new URL\("\.\.\/", import\.meta\.url\);[\s\S]*?console\.log\("WORDSTRIKE V12 Typing Results runtime smoke lifecycle passed before legacy result-contract suites\."\);/,
  `const root = new URL("../", import.meta.url);\nconst [feature, bootstrap] = await Promise.all([\n  readFile(new URL("js/speedTestResultsFeature.js", root), "utf8"),\n  readFile(new URL("js/presentationBootstrap.js", root), "utf8"),\n]);\nassert.doesNotMatch(feature, /speedTestResultsObserverHub/);\nassert.match(feature, /runSpeedTestResultsFeatures/);\nassert.match(bootstrap, /id: "typing-results"/);\n\nconsole.log("WORDSTRIKE V13 Typing Results native-pipeline smoke lifecycle passed before legacy result-contract suites.");`,
);

write("tests/speed-test-results-lifecycle-v11.test.js", `import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\n\nconst here = path.dirname(fileURLToPath(import.meta.url));\nconst root = path.resolve(here, "..");\nconst read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");\n\nassert.equal(fs.existsSync(path.join(root, "js/speedTestResultsObserverHub.js")), false,\n  "V13 must retire the V11/V12 virtual observer compatibility bridge");\n\nconst feature = read("js/speedTestResultsFeature.js");\nconst runtime = read("js/typingResultsRuntime.js");\nconst modules = [\n  "js/speedTestPerformanceV1.js",\n  "js/speedTestPerformanceV2.js",\n  "js/speedTestPerformanceV3.js",\n  "js/speedTestPerformanceV4.js",\n  "js/speedTestPerformanceV5.js",\n  "js/speedTestResultsV6b.js",\n  "js/speedTestResultsV7.js",\n];\n\nfor (const file of modules) {\n  const source = read(file);\n  assert.doesNotMatch(source, /new MutationObserver\\(/, \`\${file} must not self-observe in V13\`);\n  assert.doesNotMatch(source, /DOMContentLoaded/, \`\${file} must not self-install in V13\`);\n}\n\nconst order = [\n  "speedTestPerformanceV1.js",\n  "speedTestPerformanceV2.js",\n  "speedTestPerformanceV3.js",\n  "speedTestPerformanceV4.js",\n  "speedTestPerformanceV5.js",\n  "speedTestResultsV6b.js",\n  "speedTestResultsV7.js",\n];\nlet cursor = -1;\nfor (const token of order) {\n  const index = feature.indexOf(token);\n  assert.ok(index > cursor, \`native feature import order must preserve \${token}\`);\n  cursor = index;\n}\nassert.match(feature, /runSpeedTestResultsFeatures/);\nassert.match(feature, /handleSpeedTestResultsDocumentClick/);\nassert.match(feature, /closeSpeedTestResultsTransientFeatures/);\nassert.match(runtime, /runSpeedTestResultsFeatures/);\nassert.match(runtime, /new Observer\\(queueSync\\)/);\n\nconsole.log("V11/V12 observer compatibility ownership is fully superseded by the V13 native Typing Results pipeline.");\n`);

write("tests/typing-results-feature-pipeline-v13.test.js", `import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\nimport { SPEED_TEST_RESULTS_FEATURE_CHAIN, SPEED_TEST_RESULTS_LIFECYCLE_VERSION } from "../js/speedTestResultsFeature.js";\n\nassert.equal(SPEED_TEST_RESULTS_LIFECYCLE_VERSION, 13);\nassert.deepEqual(SPEED_TEST_RESULTS_FEATURE_CHAIN, [\n  "performance-graph",\n  "pace-consistency",\n  "flow-trend",\n  "word-mistake-inspector",\n  "longitudinal-baseline",\n  "typing-coach-shell",\n  "adaptive-training-plan",\n]);\n\nconst here = path.dirname(fileURLToPath(import.meta.url));\nconst root = path.resolve(here, "..");\nconst read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");\nconst feature = read("js/speedTestResultsFeature.js");\nconst runtime = read("js/typingResultsRuntime.js");\nconst profile = read("js/speedTestWordProfileV4.js");\nconst v6 = read("js/speedTestResultsV6b.js");\nconst v7 = read("js/speedTestResultsV7.js");\n\nassert.equal(fs.existsSync(path.join(root, "js/speedTestResultsObserverHub.js")), false);\nassert.doesNotMatch(feature, /MutationObserver/);\nassert.match(feature, /syncSpeedTestWordProfiler/);\nassert.match(feature, /syncSpeedTestPerformanceV1/);\nassert.match(feature, /syncSpeedTestPerformanceV5/);\nassert.match(feature, /syncSpeedTestResultsV6/);\nassert.match(feature, /syncTypingCoachV6PracticeOverlay/);\nassert.match(feature, /syncSpeedTestResultsV7/);\nassert.doesNotMatch(profile, /new MutationObserver/);\nassert.match(profile, /export function syncSpeedTestWordProfiler/);\nassert.doesNotMatch(v6, /practiceObserver|new MutationObserver/);\nassert.match(v6, /export function syncTypingCoachV6PracticeOverlay/);\nassert.match(v6, /export function closeTypingCoachV6PracticeOverlay/);\nassert.doesNotMatch(v7, /new MutationObserver|document\\.addEventListener\\("click"/);\nassert.match(v7, /export function handleTypingCoachV7DocumentClick/);\nassert.match(runtime, /handleFeatureClick = handleSpeedTestResultsDocumentClick/);\nassert.match(runtime, /destroyFeatures = closeSpeedTestResultsTransientFeatures/);\nassert.equal((runtime.match(/new Observer\\(/g) || []).length, 1,\n  "V13 Typing Results may create only the temporary Coach-overlay observer");\n\nconsole.log("WORDSTRIKE V13 native result feature registry, profiler handoff, Coach observer budget, and compatibility-bridge retirement passed.");\n`);

write("docs/architecture-v13.md", `# WORDSTRIKE V13 — Native Typing Results Feature Pipeline\n\nV13 removes the final observer-capture compatibility layer from Typing Test Results.\n\n## Ownership\n\n- \`presentationLifecycle\` remains the single production observer of \`#app\`.\n- \`TypingResultsRuntime\` is the lifecycle owner for Typing Results.\n- \`speedTestResultsFeature.js\` is the ordered native feature registry.\n- V1–V5, V6, and V7 expose idempotent sync functions and never self-install.\n- The V4 word profiler is started explicitly by the shared result feature pass and uses its existing rAF sampler without an app observer.\n- V6 embedded Practice no longer creates its own MutationObserver.\n- While Coach Practice is open, \`TypingResultsRuntime\` owns exactly one observer scoped to that overlay.\n- V7's retest interception is routed through the runtime's one temporary capture-phase click listener.\n\n## Feature order\n\n1. Word-profile sampling handoff\n2. V1 performance graph\n3. V2 pace/consistency\n4. V3 flow/trend\n5. V4 word/mistake inspector\n6. V5 longitudinal baseline\n7. V6 Typing Coach shell\n8. V6 Coach Practice synchronization\n9. V7 adaptive training plan\n\nThe public historical feature chain remains V1 → V2 → V3 → V4 → V5 → V6 → V7. The profiler and Practice synchronizer are lifecycle support steps rather than additional user-facing result versions.\n\n## Observer budget\n\nNormal application runtime:\n\n- one shared \`#app\` presentation observer from V10\n- zero Typing Results app/body observers\n- zero word-profiler app observers\n- zero V6/V7 self observers\n\nCoach Practice open:\n\n- the same shared presentation observer\n- one temporary observer scoped to the Coach Practice overlay\n\nLeaving Results disconnects that temporary observer and removes the temporary document click listener.\n\n## Preserved behavior\n\nV13 does not change WPM, accuracy, timelines, word profiling math, V5 baselines, V6 recommendations, V7 adaptive-plan rules, storage schemas, ranked eligibility, leaderboard payloads, auth, Campaign, Endless, Boss, Arcade Rush, or Practice Lab contracts.\n\n## Rule for future result features\n\nA new Typing Results feature must export an idempotent sync function and register it in \`speedTestResultsFeature.js\`. It must not add a document/body/app MutationObserver or module-level DOMContentLoaded installer.\n`);

console.log("V13 deterministic migration finish pass applied successfully.");
