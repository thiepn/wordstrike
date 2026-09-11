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
    throw new Error(`V13 migration token not found in ${path}: ${from.slice(0, 120)}`);
  }
  write(path, source.replace(from, to));
}

function replaceAllExact(path, from, to) {
  const source = read(path);
  if (!source.includes(from)) {
    throw new Error(`V13 migration token not found in ${path}: ${from.slice(0, 120)}`);
  }
  write(path, source.split(from).join(to));
}

function replaceRegex(path, pattern, replacement) {
  const source = read(path);
  if (!pattern.test(source)) {
    throw new Error(`V13 migration pattern not found in ${path}: ${pattern}`);
  }
  pattern.lastIndex = 0;
  write(path, source.replace(pattern, replacement));
}

const trailingInstaller = /\nfunction install\(\) \{[\s\S]*?\n\}\n\nif \(typeof document !== "undefined"\) \{[\s\S]*?\n\}\s*$/;

// V1: direct feature function, no module-level observer installer.
replaceExact(
  "js/speedTestPerformanceV1.js",
  "function enhanceSpeedTestResults() {",
  "export function syncSpeedTestPerformanceV1() {",
);
replaceRegex(
  "js/speedTestPerformanceV1.js",
  /\nfunction installEnhancer\(\) \{[\s\S]*?\n\}\n\nif \(typeof document !== "undefined"\) \{[\s\S]*?\n\}\n\nexport \{ graphMarkup as speedTestPerformanceGraphMarkup \};/,
  "\nexport { graphMarkup as speedTestPerformanceGraphMarkup };",
);

// V2: direct feature function, preserving lazy CSS and layer storage API.
replaceExact("js/speedTestPerformanceV2.js", "function enhanceV2() {", "export function syncSpeedTestPerformanceV2() {");
replaceRegex(
  "js/speedTestPerformanceV2.js",
  /\nfunction install\(\) \{[\s\S]*?\n\}\n\nif \(typeof document !== "undefined"\) \{[\s\S]*?\n\}\n\nexport const SPEED_TEST_PERFORMANCE_V2_LAYER_STORAGE_KEY/,
  "\nexport const SPEED_TEST_PERFORMANCE_V2_LAYER_STORAGE_KEY",
);

// V3-V5: direct idempotent result feature functions.
for (const [path, fromName, toName] of [
  ["js/speedTestPerformanceV3.js", "enhanceV3", "syncSpeedTestPerformanceV3"],
  ["js/speedTestPerformanceV4.js", "enhanceV4", "syncSpeedTestPerformanceV4"],
  ["js/speedTestPerformanceV5.js", "enhanceV5", "syncSpeedTestPerformanceV5"],
]) {
  replaceExact(path, `function ${fromName}() {`, `export function ${toName}() {`);
  replaceRegex(path, trailingInstaller, "\n");
}
replaceExact(
  "js/speedTestPerformanceV4.js",
  "import {\n  finalizeCurrentSpeedTestWordProfile,\n  installSpeedTestWordProfiler,\n} from \"./speedTestWordProfileV4.js\";",
  "import { finalizeCurrentSpeedTestWordProfile } from \"./speedTestWordProfileV4.js\";",
);

// V4 profiler: it remains a pre-test service, but the shared presentation pass
// now starts its rAF sampler explicitly instead of owning a second #app observer.
replaceExact(
  "js/speedTestWordProfileV4.js",
  "let tracker = null;\nlet frameId = null;\nlet observer = null;\nlet installed = false;",
  "let tracker = null;\nlet frameId = null;",
);
replaceExact(
  "js/speedTestWordProfileV4.js",
  `export function installSpeedTestWordProfiler() {\n  if (installed || typeof document === "undefined") return;\n  installed = true;\n  const root = document.querySelector("#app");\n  if (!root) return;\n  ensureSampling();\n  observer = new MutationObserver(() => ensureSampling());\n  observer.observe(root, { childList: true, subtree: true });\n}`,
  `export function syncSpeedTestWordProfiler() {\n  if (typeof document === "undefined") return false;\n  const root = document.querySelector("#app");\n  if (!root) return false;\n  ensureSampling();\n  return true;\n}\n\n// Compatibility alias for callers outside the semantic results owner.\nexport function installSpeedTestWordProfiler() {\n  return syncSpeedTestWordProfiler();\n}`,
);

// V6: Results and embedded Practice expose explicit APIs. The V13 runtime owns
// the only Coach-overlay observer, so V6 no longer observes its own root.
replaceExact("js/speedTestResultsV6b.js", "let practiceObserver = null;\n", "");
replaceExact(
  "js/speedTestResultsV6b.js",
  "  practiceObserver?.disconnect?.();\n  practiceObserver = null;\n",
  "",
);
replaceAllExact("js/speedTestResultsV6b.js", "closePracticeOverlay", "closeTypingCoachV6PracticeOverlay");
replaceExact(
  "js/speedTestResultsV6b.js",
  "function closeTypingCoachV6PracticeOverlay() {",
  "export function closeTypingCoachV6PracticeOverlay() {",
);
replaceAllExact("js/speedTestResultsV6b.js", "driveCoachPractice", "syncTypingCoachV6PracticeOverlay");
replaceExact(
  "js/speedTestResultsV6b.js",
  "function syncTypingCoachV6PracticeOverlay() {",
  "export function syncTypingCoachV6PracticeOverlay() {",
);
replaceExact(
  "js/speedTestResultsV6b.js",
  "function enhanceResultsV6() {",
  "export function syncSpeedTestResultsV6() {",
);
replaceRegex(
  "js/speedTestResultsV6b.js",
  /\n  practiceObserver = new MutationObserver\(syncTypingCoachV6PracticeOverlay\);\n  practiceObserver\.observe\(root, \{ childList: true, subtree: true, attributes: true, attributeFilter: \["disabled", "aria-disabled"\] \}\);/,
  "",
);
replaceRegex("js/speedTestResultsV6b.js", trailingInstaller, "\n");

// V7: runtime owns observation and document-click routing. V7 only exposes its
// idempotent result sync plus the one semantic click handler needed for retest.
replaceExact("js/speedTestResultsV7.js", "let observer = null;\nlet scheduled = false;\n", "");
replaceExact(
  "js/speedTestResultsV7.js",
  "function enhanceResultsV7() {",
  "export function syncSpeedTestResultsV7() {",
);
replaceRegex(
  "js/speedTestResultsV7.js",
  /\nfunction scheduleEnhance\(\) \{[\s\S]*?\n\}\n\nfunction onDocumentClickCapture\(event\) \{[\s\S]*?\n\}/,
  `\nexport function handleTypingCoachV7DocumentClick(event) {\n  if (!event?.target?.closest?.("[data-coach-retest-original]")) return false;\n  const plan = loadTypingCoachV7Plan();\n  const cycle = loadActiveTypingCoachCycle();\n  if (!plan || !cycle || cycle.sourceSessionId !== plan.sourceSessionId) return false;\n  prepareRetest({ skipRemaining: true });\n  return true;\n}`,
);
replaceRegex("js/speedTestResultsV7.js", trailingInstaller, "\n");

// The semantic results owner is now a real direct feature registry.
write("js/speedTestResultsFeature.js", `// WORDSTRIKE V13 — native Typing Test results feature pipeline.\n//\n// V1-V7 keep their mature rendering/calculation logic, but they no longer boot\n// themselves or register MutationObservers. This module is the only semantic\n// owner of their ordering and exposes explicit runtime hooks.\n\nimport { syncSpeedTestWordProfiler } from "./speedTestWordProfileV4.js";\nimport { syncSpeedTestPerformanceV1 } from "./speedTestPerformanceV1.js";\nimport { syncSpeedTestPerformanceV2 } from "./speedTestPerformanceV2.js";\nimport { syncSpeedTestPerformanceV3 } from "./speedTestPerformanceV3.js";\nimport { syncSpeedTestPerformanceV4 } from "./speedTestPerformanceV4.js";\nimport { syncSpeedTestPerformanceV5 } from "./speedTestPerformanceV5.js";\nimport {\n  closeTypingCoachV6PracticeOverlay,\n  syncSpeedTestResultsV6,\n  syncTypingCoachV6PracticeOverlay,\n} from "./speedTestResultsV6b.js";\nimport {\n  handleTypingCoachV7DocumentClick,\n  syncSpeedTestResultsV7,\n} from "./speedTestResultsV7.js";\n\nexport const SPEED_TEST_RESULTS_LIFECYCLE_VERSION = 13;\n\nexport const SPEED_TEST_RESULTS_FEATURE_CHAIN = Object.freeze([\n  "performance-graph",\n  "pace-consistency",\n  "flow-trend",\n  "word-mistake-inspector",\n  "longitudinal-baseline",\n  "typing-coach-shell",\n  "adaptive-training-plan",\n]);\n\nconst FEATURE_STEPS = Object.freeze([\n  Object.freeze({ id: "word-profiler", sync: syncSpeedTestWordProfiler }),\n  Object.freeze({ id: "performance-graph", sync: syncSpeedTestPerformanceV1 }),\n  Object.freeze({ id: "pace-consistency", sync: syncSpeedTestPerformanceV2 }),\n  Object.freeze({ id: "flow-trend", sync: syncSpeedTestPerformanceV3 }),\n  Object.freeze({ id: "word-mistake-inspector", sync: syncSpeedTestPerformanceV4 }),\n  Object.freeze({ id: "longitudinal-baseline", sync: syncSpeedTestPerformanceV5 }),\n  Object.freeze({ id: "typing-coach-shell", sync: syncSpeedTestResultsV6 }),\n  Object.freeze({ id: "typing-coach-practice", sync: syncTypingCoachV6PracticeOverlay }),\n  Object.freeze({ id: "adaptive-training-plan", sync: syncSpeedTestResultsV7 }),\n]);\n\nlet passCount = 0;\nlet stepInvocations = 0;\nlet stepErrors = 0;\n\nfunction reportFeatureError(error, step) {\n  stepErrors += 1;\n  if (typeof globalThis.reportError === "function") {\n    globalThis.reportError(error);\n    return;\n  }\n  globalThis.console?.error?.(\`Typing Results feature failed: \${step?.id || "unknown"}\`, error);\n}\n\nexport function runSpeedTestResultsFeatures() {\n  passCount += 1;\n  let invoked = 0;\n  for (const step of FEATURE_STEPS) {\n    try {\n      step.sync();\n      invoked += 1;\n      stepInvocations += 1;\n    } catch (error) {\n      reportFeatureError(error, step);\n    }\n  }\n  return invoked;\n}\n\nexport function handleSpeedTestResultsDocumentClick(event) {\n  return handleTypingCoachV7DocumentClick(event);\n}\n\nexport function closeSpeedTestResultsTransientFeatures() {\n  closeTypingCoachV6PracticeOverlay();\n}\n\nexport function getSpeedTestResultsFeatureDiagnostics() {\n  return Object.freeze({\n    version: SPEED_TEST_RESULTS_LIFECYCLE_VERSION,\n    passCount,\n    stepInvocations,\n    stepErrors,\n    stepIds: Object.freeze(FEATURE_STEPS.map((step) => step.id)),\n  });\n}\n`);

// V13 runtime dispatches native feature functions and owns both the temporary
// document click route and the only Coach Practice MutationObserver.
replaceExact(
  "js/typingResultsRuntime.js",
  "import { runSpeedTestResultsObserverCallbacks } from \"./speedTestResultsObserverHub.js\";",
  `import {\n  closeSpeedTestResultsTransientFeatures,\n  handleSpeedTestResultsDocumentClick,\n  runSpeedTestResultsFeatures,\n} from "./speedTestResultsFeature.js";`,
);
replaceExact("js/typingResultsRuntime.js", "export const TYPING_RESULTS_RUNTIME_VERSION = 12;", "export const TYPING_RESULTS_RUNTIME_VERSION = 13;");
replaceExact(
  "js/typingResultsRuntime.js",
  "  dispatchFeatures = runSpeedTestResultsObserverCallbacks,\n  resolveContext = defaultResolveContext,",
  "  dispatchFeatures = runSpeedTestResultsFeatures,\n  handleFeatureClick = handleSpeedTestResultsDocumentClick,\n  destroyFeatures = closeSpeedTestResultsTransientFeatures,\n  resolveContext = defaultResolveContext,",
);
replaceExact(
  "js/typingResultsRuntime.js",
  `  function removeDocumentClickListener() {\n    if (!documentClickListenerActive) return;\n    eventTarget?.removeEventListener?.("click", queueSync, true);\n    documentClickListenerActive = false;\n  }\n\n  function ensureDocumentClickListener() {\n    if (documentClickListenerActive || !eventTarget?.addEventListener) return;\n    eventTarget.addEventListener("click", queueSync, true);\n    documentClickListenerActive = true;\n  }`,
  `  function handleDocumentClick(event) {\n    try {\n      handleFeatureClick?.(event);\n    } catch (error) {\n      onError?.(error);\n    }\n    queueSync();\n  }\n\n  function removeDocumentClickListener() {\n    if (!documentClickListenerActive) return;\n    eventTarget?.removeEventListener?.("click", handleDocumentClick, true);\n    documentClickListenerActive = false;\n  }\n\n  function ensureDocumentClickListener() {\n    if (documentClickListenerActive || !eventTarget?.addEventListener) return;\n    eventTarget.addEventListener("click", handleDocumentClick, true);\n    documentClickListenerActive = true;\n  }`,
);
replaceExact(
  "js/typingResultsRuntime.js",
  `  function closeLegacyPracticeOverlay() {\n    const overlay = resolveOverlay?.();\n    const close = overlay?.querySelector?.("[data-coach-close-practice]");\n    if (typeof close?.click === "function") close.click();\n  }`,
  `  function closeActivePracticeOverlay() {\n    destroyFeatures?.();\n    const overlay = resolveOverlay?.();\n    const close = overlay?.querySelector?.("[data-coach-close-practice]");\n    if (typeof close?.click === "function") close.click();\n  }`,
);
replaceExact("js/typingResultsRuntime.js", "    closeLegacyPracticeOverlay();", "    closeActivePracticeOverlay();");
replaceAllExact("js/typingResultsRuntime.js", "historical V1-V7 result layers are treated as idempotent compatibility\n// feature steps", "V1-V7 result layers expose native idempotent feature functions. V13 owns\n// their invocation");

// Retire the V11/V12 virtual-observer bridge completely.
fs.unlinkSync("js/speedTestResultsObserverHub.js");

// Keep V8 architecture assertions semantic rather than tied to side-effect imports.
replaceExact(
  "tests/architecture-v8.test.js",
  `const resultsImportOrder = [\n  'import "./speedTestPerformanceV1.js";',\n  'import "./speedTestPerformanceV2.js";',\n  'import "./speedTestPerformanceV3.js";',\n  'import "./speedTestPerformanceV4.js";',\n  'import "./speedTestPerformanceV5.js";',\n  'import "./speedTestResultsV6b.js";',\n  'import "./speedTestResultsV7.js";',\n];`,
  `const resultsImportOrder = [\n  "speedTestPerformanceV1.js",\n  "speedTestPerformanceV2.js",\n  "speedTestPerformanceV3.js",\n  "speedTestPerformanceV4.js",\n  "speedTestPerformanceV5.js",\n  "speedTestResultsV6b.js",\n  "speedTestResultsV7.js",\n];`,
);

// Historical feature tests should validate semantic ownership, not side-effect import syntax.
for (const [path, token] of [
  ["tests/speed-test-performance-contract.test.js", "speedTestPerformanceV1.js"],
  ["tests/speed-test-performance-v2.test.js", "speedTestPerformanceV2.js"],
  ["tests/speed-test-performance-v3.test.js", "speedTestPerformanceV3.js"],
  ["tests/speed-test-performance-v4.test.js", "speedTestPerformanceV4.js"],
  ["tests/speed-test-performance-v5.test.js", "speedTestPerformanceV5.js"],
  ["tests/speed-test-coach-v6.test.js", "speedTestResultsV6b.js"],
  ["tests/speed-test-coach-v7.test.js", "speedTestResultsV7.js"],
]) {
  replaceRegex(
    path,
    new RegExp(`assert\\.match\\(resultsFeature, \\/import \\\"\\\\\\.\\\\\\/${token.replaceAll(".", "\\\\\\.")}\\\\\";\\\\/,(?:\\n|\\r\\n)`),
    `assert.match(resultsFeature, /${token.replaceAll(".", "\\.")}/,\n`,
  );
}

// V12 lifecycle tests now certify the superseding V13 native pipeline.
replaceAllExact("tests/typing-results-runtime-v12.test.js", "assert.equal(TYPING_RESULTS_RUNTIME_VERSION, 12);", "assert.equal(TYPING_RESULTS_RUNTIME_VERSION, 13);");
replaceRegex(
  "tests/typing-results-runtime-v12.test.js",
  /const rootUrl = new URL\("\.\.\/", import\.meta\.url\);[\s\S]*?console\.log\("WORDSTRIKE V12 explicit Typing Results mount\/sync\/destroy, scoped Coach observation, stress cleanup, and shared lifecycle ownership passed\."\);/,
  `const rootUrl = new URL("../", import.meta.url);\nconst read = (path) => readFile(new URL(path, rootUrl), "utf8");\nconst [runtimeSource, featureSource, v6Source, v7Source, profileSource, bootstrapSource] = await Promise.all([\n  read("js/typingResultsRuntime.js"),\n  read("js/speedTestResultsFeature.js"),\n  read("js/speedTestResultsV6b.js"),\n  read("js/speedTestResultsV7.js"),\n  read("js/speedTestWordProfileV4.js"),\n  read("js/presentationBootstrap.js"),\n]);\n\nassert.match(runtimeSource, /export function createTypingResultsRuntime/);\nassert.match(runtimeSource, /runSpeedTestResultsFeatures/);\nassert.match(featureSource, /SPEED_TEST_RESULTS_LIFECYCLE_VERSION = 13/);\nassert.doesNotMatch(featureSource, /speedTestResultsObserverHub/);\nassert.doesNotMatch(v6Source, /new MutationObserver/);\nassert.doesNotMatch(v7Source, /new MutationObserver/);\nassert.doesNotMatch(profileSource, /new MutationObserver/);\nassert.match(bootstrapSource, /\\{ id: "typing-results", sync: syncTypingResultsRuntime \\}/,\n  "Typing Results must execute inside the one shared production presentation lifecycle");\n\nconsole.log("WORDSTRIKE V13 native Typing Results mount/sync/destroy, single scoped Coach observation, stress cleanup, and shared lifecycle ownership passed.");`,
);
replaceAllExact("tests/results-runtime-v12-smoke.test.js", "assert.equal(TYPING_RESULTS_RUNTIME_VERSION, 12);", "assert.equal(TYPING_RESULTS_RUNTIME_VERSION, 13);");
replaceRegex(
  "tests/results-runtime-v12-smoke.test.js",
  /const root = new URL\("\.\.\/", import\.meta\.url\);[\s\S]*?console\.log\("WORDSTRIKE V12 Typing Results runtime smoke lifecycle passed before legacy result-contract suites\."\);/,
  `const root = new URL("../", import.meta.url);\nconst [feature, bootstrap] = await Promise.all([\n  readFile(new URL("js/speedTestResultsFeature.js", root), "utf8"),\n  readFile(new URL("js/presentationBootstrap.js", root), "utf8"),\n]);\nassert.doesNotMatch(feature, /speedTestResultsObserverHub/);\nassert.match(feature, /runSpeedTestResultsFeatures/);\nassert.match(bootstrap, /id: "typing-results"/);\n\nconsole.log("WORDSTRIKE V13 Typing Results native-pipeline smoke lifecycle passed before legacy result-contract suites.");`,
);

write("tests/speed-test-results-lifecycle-v11.test.js", `import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\n\nconst here = path.dirname(fileURLToPath(import.meta.url));\nconst root = path.resolve(here, "..");\nconst read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");\n\nassert.equal(fs.existsSync(path.join(root, "js/speedTestResultsObserverHub.js")), false,\n  "V13 must retire the V11/V12 virtual observer compatibility bridge");\n\nconst feature = read("js/speedTestResultsFeature.js");\nconst runtime = read("js/typingResultsRuntime.js");\nconst modules = [\n  "js/speedTestPerformanceV1.js",\n  "js/speedTestPerformanceV2.js",\n  "js/speedTestPerformanceV3.js",\n  "js/speedTestPerformanceV4.js",\n  "js/speedTestPerformanceV5.js",\n  "js/speedTestResultsV6b.js",\n  "js/speedTestResultsV7.js",\n];\n\nfor (const file of modules) {\n  const source = read(file);\n  assert.doesNotMatch(source, /new MutationObserver\\(/, \`\${file} must not self-observe in V13\`);\n  assert.doesNotMatch(source, /DOMContentLoaded/, \`\${file} must not self-install in V13\`);\n}\n\nconst order = [\n  "speedTestPerformanceV1.js",\n  "speedTestPerformanceV2.js",\n  "speedTestPerformanceV3.js",\n  "speedTestPerformanceV4.js",\n  "speedTestPerformanceV5.js",\n  "speedTestResultsV6b.js",\n  "speedTestResultsV7.js",\n];\nlet cursor = -1;\nfor (const token of order) {\n  const index = feature.indexOf(token);\n  assert.ok(index > cursor, \`native feature import order must preserve \${token}\`);\n  cursor = index;\n}\nassert.match(feature, /runSpeedTestResultsFeatures/);\nassert.match(feature, /handleSpeedTestResultsDocumentClick/);\nassert.match(feature, /closeSpeedTestResultsTransientFeatures/);\nassert.match(runtime, /runSpeedTestResultsFeatures/);\nassert.match(runtime, /new Observer\\(queueSync\\)/);\n\nconsole.log("V11/V12 observer compatibility ownership is fully superseded by the V13 native Typing Results pipeline.");\n`);

write("tests/typing-results-feature-pipeline-v13.test.js", `import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\nimport { SPEED_TEST_RESULTS_FEATURE_CHAIN, SPEED_TEST_RESULTS_LIFECYCLE_VERSION } from "../js/speedTestResultsFeature.js";\n\nassert.equal(SPEED_TEST_RESULTS_LIFECYCLE_VERSION, 13);\nassert.deepEqual(SPEED_TEST_RESULTS_FEATURE_CHAIN, [\n  "performance-graph",\n  "pace-consistency",\n  "flow-trend",\n  "word-mistake-inspector",\n  "longitudinal-baseline",\n  "typing-coach-shell",\n  "adaptive-training-plan",\n]);\n\nconst here = path.dirname(fileURLToPath(import.meta.url));\nconst root = path.resolve(here, "..");\nconst read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");\nconst feature = read("js/speedTestResultsFeature.js");\nconst runtime = read("js/typingResultsRuntime.js");\nconst profile = read("js/speedTestWordProfileV4.js");\nconst v6 = read("js/speedTestResultsV6b.js");\nconst v7 = read("js/speedTestResultsV7.js");\n\nassert.equal(fs.existsSync(path.join(root, "js/speedTestResultsObserverHub.js")), false);\nassert.doesNotMatch(feature, /MutationObserver/);\nassert.match(feature, /syncSpeedTestWordProfiler/);\nassert.match(feature, /syncSpeedTestPerformanceV1/);\nassert.match(feature, /syncSpeedTestPerformanceV5/);\nassert.match(feature, /syncSpeedTestResultsV6/);\nassert.match(feature, /syncTypingCoachV6PracticeOverlay/);\nassert.match(feature, /syncSpeedTestResultsV7/);\nassert.doesNotMatch(profile, /new MutationObserver/);\nassert.match(profile, /export function syncSpeedTestWordProfiler/);\nassert.doesNotMatch(v6, /practiceObserver|new MutationObserver/);\nassert.match(v6, /export function syncTypingCoachV6PracticeOverlay/);\nassert.match(v6, /export function closeTypingCoachV6PracticeOverlay/);\nassert.doesNotMatch(v7, /new MutationObserver|document\\.addEventListener\\("click"/);\nassert.match(v7, /export function handleTypingCoachV7DocumentClick/);\nassert.match(runtime, /handleFeatureClick = handleSpeedTestResultsDocumentClick/);\nassert.match(runtime, /destroyFeatures = closeSpeedTestResultsTransientFeatures/);\nassert.equal((runtime.match(/new Observer\\(/g) || []).length, 1,\n  "V13 Typing Results may create only the temporary Coach-overlay observer");\n\nconsole.log("WORDSTRIKE V13 native result feature registry, profiler handoff, Coach observer budget, and compatibility-bridge retirement passed.");\n`);

write("docs/architecture-v13.md", `# WORDSTRIKE V13 — Native Typing Results Feature Pipeline\n\nV13 removes the final observer-capture compatibility layer from Typing Test Results.\n\n## Ownership\n\n- \`presentationLifecycle\` remains the single production observer of \`#app\`.\n- \`TypingResultsRuntime\` is the lifecycle owner for Typing Results.\n- \`speedTestResultsFeature.js\` is the ordered native feature registry.\n- V1–V5, V6, and V7 expose idempotent sync functions and never self-install.\n- The V4 word profiler is started explicitly by the shared result feature pass and uses its existing rAF sampler without an app observer.\n- V6 embedded Practice no longer creates its own MutationObserver.\n- While Coach Practice is open, \`TypingResultsRuntime\` owns exactly one observer scoped to that overlay.\n- V7's retest interception is routed through the runtime's one temporary capture-phase click listener.\n\n## Feature order\n\n1. Word-profile sampling handoff\n2. V1 performance graph\n3. V2 pace/consistency\n4. V3 flow/trend\n5. V4 word/mistake inspector\n6. V5 longitudinal baseline\n7. V6 Typing Coach shell\n8. V6 Coach Practice synchronization\n9. V7 adaptive training plan\n\nThe public historical feature chain remains V1 → V2 → V3 → V4 → V5 → V6 → V7. The profiler and Practice synchronizer are lifecycle support steps rather than additional user-facing result versions.\n\n## Observer budget\n\nNormal application runtime:\n\n- one shared \`#app\` presentation observer from V10\n- zero Typing Results app/body observers\n- zero word-profiler app observers\n- zero V6/V7 self observers\n\nCoach Practice open:\n\n- the same shared presentation observer\n- one temporary observer scoped to the Coach Practice overlay\n\nLeaving Results disconnects that temporary observer and removes the temporary document click listener.\n\n## Preserved behavior\n\nV13 does not change WPM, accuracy, timelines, word profiling math, V5 baselines, V6 recommendations, V7 adaptive-plan rules, storage schemas, ranked eligibility, leaderboard payloads, auth, Campaign, Endless, Boss, Arcade Rush, or Practice Lab contracts.\n\n## Rule for future result features\n\nA new Typing Results feature must export an idempotent sync function and register it in \`speedTestResultsFeature.js\`. It must not add a document/body/app MutationObserver or module-level DOMContentLoaded installer.\n`);

console.log("V13 native Typing Results migration applied successfully.");
