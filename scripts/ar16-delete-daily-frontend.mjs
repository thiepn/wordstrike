import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, content) => fs.writeFileSync(path, content);

function edit(path, transform) {
  const before = read(path);
  const after = transform(before);
  if (after === before) throw new Error(`AR16 expected a change in ${path}`);
  write(path, after);
}

function removeBetween(source, start, end, label) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing ${label} start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`Missing ${label} end marker: ${end}`);
  return source.slice(0, startIndex) + source.slice(endIndex);
}

function mustReplace(source, search, replacement, label) {
  if (typeof search === "string") {
    if (!source.includes(search)) throw new Error(`Missing replacement target: ${label}`);
    return source.replace(search, replacement);
  }
  if (!search.test(source)) throw new Error(`Missing replacement pattern: ${label}`);
  return source.replace(search, replacement);
}

// Mode registry: Daily no longer exists as an application mode.
edit("js/modes.js", (source) => {
  source = mustReplace(source, '  DAILY: "daily",\n', "", "Daily mode ID");
  source = mustReplace(source,
    '  // AR14 removes Daily Strike from public navigation but keeps the definition\n  // registered and enabled until AR15/AR16 retire its backend/frontend code.\n',
    "",
    "Daily registry comment",
  );
  source = source.replace(/  Object\.freeze\(\{\n    id: MODE_IDS\.DAILY,[\s\S]*?\n  \}\),\n/, "");
  if (/MODE_IDS\.DAILY|Daily Strike|daily-ready/.test(source)) throw new Error("Daily remains in modes.js");
  return source;
});

edit("js/appScreens.js", (source) => source
  .replace('  DAILY_READY: "DAILY_READY",\n', "")
  .replace('  DAILY_RESULTS: "DAILY_RESULTS",\n', ""));

edit("js/appStateDomains.js", (source) => {
  source = source.replace(/  daily: Object\.freeze\(\{[\s\S]*?\n  \}\),\n(?=  arcadeRush:)/, "");
  source = source.replace(/  \["daily(?:DateKey|DateOverride|Result|RecordFlags|ResultsIndex|ResultsReadyAt)", "daily"\],\n/g, "");
  if (/\bdaily\b|daily[A-Z]/.test(source)) throw new Error("Daily state remains in appStateDomains.js");
  return source;
});

edit("js/inputSafety.js", (source) => mustReplace(
  source,
  '  "campaign", "normal", "endless", "daily", "boss", "typing", "arcade-rush",\n',
  '  "campaign", "normal", "endless", "boss", "typing", "arcade-rush",\n',
  "Daily Backspace mode",
));

edit("js/state.js", (source) => {
  source = source.replace(/  \} else if \(game\.mode === "daily"\) \{[\s\S]*?\n  \}\n(?=\})/, "  }\n");
  if (/game\.mode === "daily"/.test(source)) throw new Error("Daily cleanup remains in state.js");
  return source;
});

edit("js/appKeyboardController.js", (source) => {
  source = source.replace("  startDaily,\n", "");
  source = source.replace(/        \} else if \(state\.game\?\.mode === "daily"\) \{\n          \[resumeGame, \(\) => startDaily\("retry", state\.game\.config\.dateKey\), openModeSelect, openTitle\]\[state\.pauseIndex\]\(\);\n/, "");
  source = removeBetween(source, "    if (state.screen === Screens.DAILY_READY) {", "    if (state.screen === Screens.ARCADE_RUSH_READY) {", "Daily keyboard screens");
  if (/Screens\.DAILY|startDaily|dailyResults|dailyDateKey|mode === "daily"/.test(source)) throw new Error("Daily keyboard route remains");
  return source;
});

edit("js/appClickRouting.js", (source) => {
  source = source.replace('      "leaderboard-select-daily",\n', "");
  source = source.replace(/  \[Screens\.DAILY_RESULTS\]: Object\.freeze\(\{[\s\S]*?\n  \}\),\n/, "");
  if (/Screens\.DAILY|daily-results-screen|view-daily-leaderboard/.test(source)) throw new Error("Daily click route remains");
  return source;
});

edit("js/onboardingContent.js", (source) => {
  source = source.replace("  daily: 1,\n", "");
  source = source.replace(/  daily: Object\.freeze\(\{[\s\S]*?\n  \}\),\n(?=  boss:)/, "");
  if (/DAILY STRIKE|daily-shared-challenge|\bdaily:\s/.test(source)) throw new Error("Daily onboarding content remains");
  return source;
});

edit("js/onboardingView.js", (source) => source.replace(
  /  if \(type === "daily-shared-challenge"\) \{[\s\S]*?\n  \}\n/,
  "",
));

// Leaderboard frontend: keep only private legacy aliases that redirect old saved links to Arcade Rush.
edit("js/leaderboardService.js", (source) => {
  source = source.replace('import { getUtcDateKey } from "./dailyDate.js";\n', "");
  source = source.replace('  DAILY: "daily-strike-v1",\n', "");
  source = source.replace('  DAILY: "daily",\n', "");
  source = source.replace('  [LEADERBOARD_BOARDS.DAILY]: 1,\n', "");
  source = source.replace(
    'const VALID_BOARDS = Object.freeze(Object.values(LEADERBOARD_BOARDS));\n',
    'const LEGACY_DAILY_BOARD_KEY = "daily-strike-v1";\nconst LEGACY_DAILY_CATEGORY = "daily";\nconst VALID_BOARDS = Object.freeze(Object.values(LEADERBOARD_BOARDS));\n',
  );
  source = source.replace(
    '  if (boardKey === LEADERBOARD_BOARDS.DAILY) {\n    return { selectedCategory: LEADERBOARD_CATEGORIES.DAILY, selectedTypingDuration: 60 };\n  }\n',
    '  if (boardKey === LEGACY_DAILY_BOARD_KEY) {\n    return { selectedCategory: LEADERBOARD_CATEGORIES.ARCADE_RUSH, selectedTypingDuration: 60 };\n  }\n',
  );
  source = source.replace(
    '  if (category === LEADERBOARD_CATEGORIES.DAILY) return LEADERBOARD_BOARDS.DAILY;\n',
    '  if (category === LEGACY_DAILY_CATEGORY) return LEADERBOARD_BOARDS.ARCADE_RUSH;\n',
  );
  source = source.replace(
    '  // Legacy Daily selections normalize to the new public fourth slot.\n  if (index < 0 && category === LEADERBOARD_CATEGORIES.DAILY) index = order.length - 1;\n',
    '  // Legacy pre-cutover Daily selections normalize to Arcade Rush.\n  if (index < 0 && category === LEGACY_DAILY_CATEGORY) index = order.length - 1;\n',
  );
  source = source.replace(
    'export function createLeaderboardService({\n  getClient = getSupabaseClient,\n  getDateKey = getUtcDateKey,\n  now = () => Date.now(),\n',
    'export function createLeaderboardService({\n  getClient = getSupabaseClient,\n  now = () => Date.now(),\n',
  );
  source = source.replace(
    '    boardKey === LEADERBOARD_BOARDS.DAILY\n      ? LEADERBOARD_BOARDS.ARCADE_RUSH\n      : boardKey\n',
    '    boardKey === LEGACY_DAILY_BOARD_KEY\n      ? LEADERBOARD_BOARDS.ARCADE_RUSH\n      : boardKey\n',
  );
  source = source.replace(
    '  const requestKey = (boardKey) => boardKey === LEADERBOARD_BOARDS.DAILY\n    ? `${boardKey}:${getDateKey()}`\n    : boardKey;\n',
    '  const requestKey = (boardKey) => boardKey;\n',
  );
  source = source.replace(
    '    const body = boardKey === LEADERBOARD_BOARDS.DAILY\n      ? { boardKey, challengeDate: getDateKey() }\n      : { boardKey };\n',
    '    const body = { boardKey };\n',
  );
  source = source.replace(
    '      const publicCategory = category === LEADERBOARD_CATEGORIES.DAILY\n        ? LEADERBOARD_CATEGORIES.ARCADE_RUSH\n        : category;\n',
    '      const publicCategory = category === LEGACY_DAILY_CATEGORY\n        ? LEADERBOARD_CATEGORIES.ARCADE_RUSH\n        : category;\n',
  );
  source = source.replace(
    '// AR14 public order. Daily remains addressable by exact legacy board key until\n// AR15 retires the backend, but it is no longer part of public keyboard tabs.\n',
    '// Public keyboard order after the Arcade Rush cutover.\n',
  );
  if (/dailyDate|LEADERBOARD_(?:BOARDS|CATEGORIES)\.DAILY|getDateKey/.test(source)) throw new Error("Active Daily leaderboard dependency remains");
  return source;
});

edit("js/leaderboardReturnState.js", (source) => {
  source = source.replace(
    'const CATEGORIES = new Set(Object.values(LEADERBOARD_CATEGORIES));\n',
    'const LEGACY_DAILY_CATEGORY = "daily";\nconst CATEGORIES = new Set([...Object.values(LEADERBOARD_CATEGORIES), LEGACY_DAILY_CATEGORY]);\n',
  );
  source = source.replace(
    '  const normalizedCategory = value.selectedCategory === LEADERBOARD_CATEGORIES.DAILY\n',
    '  const normalizedCategory = value.selectedCategory === LEGACY_DAILY_CATEGORY\n',
  );
  source = source.replace(
    '  const selectedCategory = selection.selectedCategory === LEADERBOARD_CATEGORIES.DAILY\n    ? LEADERBOARD_CATEGORIES.ARCADE_RUSH\n    : selection.selectedCategory;\n',
    '  const selectedCategory = selection.selectedCategory;\n',
  );
  return source;
});

edit("js/leaderboardSubmissionService.js", (source) => {
  source = source.replace('  daily: LEADERBOARD_BOARDS.DAILY,\n', "");
  source = source.replace(/  if \(mode === "daily"\) \{[\s\S]*?\n  \}\n(?=  if \(mode === "arcade-rush"\))/, "");
  source = removeBetween(source, "export function buildDailySubmissionResult(result) {", "export function buildTypingSubmissionResult(result, durationSeconds) {", "Daily submission builder");
  source = source.replace(/    if \(activeMode === "daily" && payload\.result\.dateOverride !== false\) \{\n      return \{ status: "ineligible", reason: "local-only" \};\n    \}\n/, "");
  if (/buildDailySubmissionResult|mode === "daily"|LEADERBOARD_BOARDS\.DAILY|\bdaily:\s/.test(source)) throw new Error("Daily submission frontend remains");
  return source;
});

edit("js/pendingResultSubmission.js", (source) => mustReplace(
  source,
  'const MODES = new Set(["campaign", "typing", "endless", "daily", "arcade-rush"]);',
  'const MODES = new Set(["campaign", "typing", "endless", "arcade-rush"]);',
  "pending Daily result mode",
));

edit("js/leaderboardUi.js", (source) => {
  source = source.replace('  if (boardKey === LEADERBOARD_BOARDS.DAILY) return "daily";\n', "");
  source = source.replace('  if (kind === "daily") return `${entry.score.toLocaleString()} pts · ${duration(entry.durationMs)} · ${entry.accuracy.toFixed(1)}%`;\n', "");
  source = source.replace('  if (kind === "daily") return ["SCORE", "TIME", "ACCURACY"];\n', "");
  source = source.replace('  if (kind === "daily") return [entry.score.toLocaleString(), duration(entry.durationMs), `${entry.accuracy.toFixed(1)}%`];\n', "");
  source = source.replace('  if (kind === "daily") return "Daily Strike";\n', "");
  source = source.replace('  const daily = boardKey === LEADERBOARD_BOARDS.DAILY;\n', "");
  source = source.replace(
    '  const meta = daily\n    ? `LEGACY UTC CHALLENGE ${escapeHtml(state.board?.challengeDate || "LOADING")}`\n    : rush\n      ? "RULES V1 // COMPLETED RUNS ONLY // ALL-TIME"\n',
    '  const meta = rush\n    ? "RULES V1 // COMPLETED RUNS ONLY // ALL-TIME"\n',
  );
  if (/LEADERBOARD_BOARDS\.DAILY|kind === "daily"|Daily Strike|LEGACY UTC/.test(source)) throw new Error("Daily leaderboard UI remains");
  return source;
});

// Local schema-v2: stop reading/writing the retired Daily sidecar and erase it best-effort.
edit("js/modeStorageV2.js", (source) => {
  source = source.replace(/import \{\n  createDefaultDailyRecords,[\s\S]*?from "\.\/dailyRecords\.js";\n/, "");
  source = source.replace(/import \{ getUtcDateKey, isValidDailyDateKey \} from "\.\/dailyDate\.js";\n/, "");
  source = source.replace(/import \{ DAILY_CHALLENGE_VERSION, DAILY_TOTAL_WORDS \} from "\.\/dailyConfig\.js";\n/, "");
  source = source.replace(/import \{ getDailyChallengeSeed \} from "\.\/dailyGenerator\.js";\n/, "");
  source = source.replace('export const LEGACY_DAILY_STORAGE_KEY = "wordstrike_daily_legacy_v1";\n', 'const RETIRED_DAILY_STORAGE_KEY = "wordstrike_daily_legacy_v1";\n');
  source = source.replace('const LEGACY_DAILY_SCHEMA_VERSION = 1;\n', "");
  source = source.replace(
    'const ACTIVE_MODE_IDS = Object.freeze(\n  getRegisteredModes()\n    .map(({ id }) => id)\n    .filter((id) => id !== MODE_IDS.DAILY),\n);\n',
    'const ACTIVE_MODE_IDS = Object.freeze(getRegisteredModes().map(({ id }) => id));\n',
  );
  source = source.replace(/  if \(modeId === MODE_IDS\.DAILY\) \{\n    summary\.records = createDefaultDailyRecords\(\);\n  \}\n/, "");
  source = removeBetween(source, "function sanitizeDailyBest(value) {", "function sanitizeModeActivity(value) {", "Daily storage sanitizers");
  source = source.replace(/  if \(modeId === MODE_IDS\.DAILY\) \{\n    summary\.records = sanitizeDailyRecords\(value\?\.records\);\n  \}\n/, "");
  source = removeBetween(source, "function createDefaultLegacyDailyData() {", "export function loadModeData() {", "legacy Daily sidecar");
  source = source.replace(
    'export function loadModeData() {\n  const v2 = readJsonStorage(MODE_DATA_STORAGE_KEY);\n  if (v2) {\n    seedLegacyDailyFromSource(v2);\n    return migrateModeDataToV2(v2);\n  }\n  const legacy = readJsonStorage(LEGACY_MODE_DATA_STORAGE_KEY);\n  if (legacy) {\n    seedLegacyDailyFromSource(legacy);\n    const migrated = migrateModeDataToV2(legacy);\n    writeJsonStorage(MODE_DATA_STORAGE_KEY, migrated);\n    return migrated;\n  }\n  return createDefaultModeData();\n}\n',
    'function clearRetiredDailyStorage() {\n  try { globalThis.localStorage?.removeItem(RETIRED_DAILY_STORAGE_KEY); } catch { /* Ignore cleanup failure. */ }\n}\n\nexport function loadModeData() {\n  clearRetiredDailyStorage();\n  const v2 = readJsonStorage(MODE_DATA_STORAGE_KEY);\n  if (v2) return migrateModeDataToV2(v2);\n  const legacy = readJsonStorage(LEGACY_MODE_DATA_STORAGE_KEY);\n  if (legacy) {\n    const migrated = migrateModeDataToV2(legacy);\n    writeJsonStorage(MODE_DATA_STORAGE_KEY, migrated);\n    return migrated;\n  }\n  return createDefaultModeData();\n}\n',
  );
  source = removeBetween(source, "function isEligibleDailyResult(result) {", "function isSupportedSpeedTestResult(result) {", "Daily record eligibility");
  source = removeBetween(source, "function recordLegacyDailySession(result) {", "export function recordCompletedSession(result) {", "Daily session recording");
  source = source.replace('  if (result.modeId === MODE_IDS.DAILY) return recordLegacyDailySession(result);\n', "");
  source = source.replace('  if (modeId === MODE_IDS.DAILY) return getLegacyDailyModeSummary();\n', "");
  source = removeBetween(source, "export function getDailyRecord(dateKey) {", "export function getRecentSessions() {", "Daily record reader");
  source = source.replace(
    'export function resetModeData() {\n  const defaults = createDefaultModeData();\n  saveModeData(defaults);\n  saveLegacyDailyData(createDefaultLegacyDailyData());\n  return defaults;\n}',
    'export function resetModeData() {\n  const defaults = createDefaultModeData();\n  saveModeData(defaults);\n  clearRetiredDailyStorage();\n  return defaults;\n}',
  );
  if (/dailyRecords|dailyDate|dailyConfig|dailyGenerator|MODE_IDS\.DAILY|getDailyRecord|LegacyDaily|recordLegacyDaily|isEligibleDaily/.test(source)) {
    throw new Error("Daily storage runtime remains");
  }
  return source;
});

// Main app integration.
edit("js/main.js", (source) => {
  for (const token of [
    "  renderDailyReady,\n", "  renderDailyResults,\n", "  renderDailyShell,\n",
    "  showDailyPauseOverlay,\n", "  updateDailyHud,\n",
  ]) source = source.replace(token, "");
  source = source.replace('import { createDailyVocabulary, generateDailyPlan } from "./dailyGenerator.js";\n', "");
  source = source.replace('import { getUtcDateKey, isValidDailyDateKey, parseDailyDateOverride } from "./dailyDate.js";\n', "");
  source = source.replace("  getDailyRecord,\n", "");
  source = source.replace(/import \{\n  clearDailyRuntime,[\s\S]*?\n\} from "\.\/dailyMode\.js";\n/, "");
  source = source.replace("  stopDailyLoop();\n", "");
  source = source.replace("  clearDailyRuntime();\n", "");
  source = source.replace(/  \} else if \(appState\.game\?\.mode === "daily"\) \{\n    handleDailyKey\(event, appState\.game\);\n    updateDailyHud\(appState\.game\);\n/, "");
  source = removeBetween(source, "function openDailyReady(reason = \"daily-ready\") {", "function openArcadeRushReady(reason = \"arcade-rush-ready\") {", "Daily ready function");
  source = removeBetween(source, "function finishDaily(game, result) {", "function finishArcadeRush(snapshot, result) {", "Daily finish function");
  source = removeBetween(source, "function startDaily(source = \"daily-ready\", dateKey = appState.dailyDateKey) {", "function startEndless(source = \"mode-select\") {", "Daily start function");
  source = source.replace('  if (appState.game?.mode === "daily") stopDailyLoop();\n', "");
  source = source.replace(/  if \(appState\.game\?\.mode === "daily"\) \{[\s\S]*?\n    return;\n  \}\n(?=  showPauseOverlay)/, "");
  source = source.replace('  else if (appState.game?.mode === "daily") resumeDailyLoop();\n', "");
  source = source.replace('  else if (route === "daily-ready" && appState.devMode) openDailyReady("developer");\n', "");
  source = removeBetween(source, "  } else if (appState.screen === Screens.DAILY_READY) {", "  } else if (appState.screen === Screens.ARCADE_RUSH_READY) {", "Daily render branches");
  source = source.replace(
    '  const readyAt = appState.screen === Screens.ENDLESS_RESULTS\n    ? appState.endlessResultsReadyAt\n    : appState.screen === Screens.DAILY_RESULTS\n      ? appState.dailyResultsReadyAt\n      : appState.screen === Screens.ARCADE_RUSH_RESULTS\n        ? appState.arcadeRushResultsReadyAt\n',
    '  const readyAt = appState.screen === Screens.ENDLESS_RESULTS\n    ? appState.endlessResultsReadyAt\n    : appState.screen === Screens.ARCADE_RUSH_RESULTS\n      ? appState.arcadeRushResultsReadyAt\n',
  );
  source = removeBetween(source, "  } else if (appState.screen === Screens.DAILY_RESULTS) {", "  } else if (appState.screen === Screens.SPEED_TEST_RESULTS) {", "Daily click result branch");
  source = source.replace('    } else if (action === "leaderboard-select-daily") {\n      void selectLeaderboardBoard(LEADERBOARD_BOARDS.ARCADE_RUSH);\n', "");
  source = source.replace(
    '      : returnState?.selectedCategory === LEADERBOARD_CATEGORIES.ARCADE_RUSH\n        ? LEADERBOARD_BOARDS.ARCADE_RUSH\n        : returnState?.selectedCategory === LEADERBOARD_CATEGORIES.DAILY\n          ? LEADERBOARD_BOARDS.ARCADE_RUSH\n          : LEADERBOARD_BOARDS.CAMPAIGN;\n',
    '      : returnState?.selectedCategory === LEADERBOARD_CATEGORIES.ARCADE_RUSH\n        ? LEADERBOARD_BOARDS.ARCADE_RUSH\n        : LEADERBOARD_BOARDS.CAMPAIGN;\n',
  );
  source = source.replace("  startDaily,\n", "");
  source = source.replaceAll("Screens.ARCADE_RUSH_RESULTS, Screens.DAILY_RESULTS, Screens.ENDLESS_RESULTS", "Screens.ARCADE_RUSH_RESULTS, Screens.ENDLESS_RESULTS");
  source = source.replace(
    '  appState.dailyDateOverride = appState.devMode && isValidDailyDateKey(search.get("date"));\n  appState.dailyDateKey = appState.devMode\n    ? parseDailyDateOverride(window.location.search)\n    : getUtcDateKey();\n',
    "",
  );
  source = source.replace('  } else if (appState.devMode && search.get("mode") === MODE_IDS.DAILY) {\n    openDailyReady("developer");\n', "");
  if (/dailyGenerator|dailyDate|dailyMode|Screens\.DAILY|appState\.daily|startDaily|renderDaily|showDaily|updateDaily|MODE_IDS\.DAILY|LEADERBOARD_(?:BOARDS|CATEGORIES)\.DAILY|"daily"\) stopDaily/.test(source)) {
    throw new Error("Daily main-app integration remains");
  }
  return source;
});

// UI: remove Daily screens, pause/results UI, submission label, and stale profile history styling hooks.
edit("js/ui.js", (source) => {
  source = source.replace(/import \{\n  DAILY_STARTING_INTEGRITY,[\s\S]*?\n\} from "\.\/dailyConfig\.js";\n/, "");
  source = source.replace('import { getDailyDiagnosticText } from "./dailyMode.js";\n', "");
  source = removeBetween(source, "export function renderDailyReady", "export function renderEndlessShell", "Daily ready/game UI");
  source = removeBetween(source, "export function showDailyPauseOverlay", "export const SPEED_TEST_PAUSE_ACTIONS", "Daily pause UI");
  source = source.replace('    "daily-strike-v1": ["DAILY", "view-daily-leaderboard"],\n', "");
  source = removeBetween(source, "export function renderDailyResults", "export function hidePauseOverlay", "Daily results UI");
  if (/dailyConfig|dailyMode|renderDaily|updateDaily|showDaily|daily-strike-v1|daily-results|daily-ready|Daily Strike/.test(source)) throw new Error("Daily UI runtime remains");
  return source;
});

edit("style.css", (source) => {
  source = source.replace(/\.daily-history-list \{[\s\S]*?\.daily-history-list span \{[\s\S]*?\}\n\n/, "");
  source = source.replaceAll(".onboarding-daily-visual,\n", "");
  source = source.replaceAll(".onboarding-daily-visual strong,\n", "");
  source = source.replace(
    '.endless-ready-screen,\n.endless-results-screen,\n.daily-ready-screen,\n.daily-results-screen {',
    '.endless-ready-screen,\n.endless-results-screen {',
  );
  source = source.replace('.endless-results-screen,\n.daily-results-screen {', '.endless-results-screen {');
  source = source.replace(
    '.endless-results-panel,\n.daily-results-panel,\n.endless-results-panel .arcade-button,\n.daily-results-panel .arcade-button {',
    '.endless-results-panel,\n.endless-results-panel .arcade-button {',
  );
  source = source.replace(/\.daily-ready-panel,[\s\S]*?\.daily-result-details > div \{[\s\S]*?\}\n\n/, "");
  source = source.replaceAll("  .daily-ready-screen,\n  .daily-results-screen,\n", "");
  source = source.replaceAll("  .daily-ready-panel,\n  .daily-results-panel,\n", "");
  source = source.replaceAll("    .daily-ready-panel,\n    .daily-results-panel,\n", "");
  source = source.replaceAll("  .daily-result-headline,\n  .daily-result-details {\n", "");
  source = source.replace(/\n  \.daily-ready-rules \{[^\n]*\}\n  \.daily-hud \{[\s\S]*?\n  \.daily-screen \{[^\n]*\}\n/, "\n");
  return source;
});

edit("README.md", (source) => {
  source = source.replace('| **Daily Strike** | Play one deterministic three-wave challenge shared by all players for the same UTC date. |\n', '| **Arcade Rush** | Complete six escalating waves and defeat Core Breaker in a finite score-attack run. |\n');
  source = source.replace(/\n### Daily Strike[\s\S]*?\n---\n\n## Profiles, statistics, and leaderboards/, '\n### Arcade Rush\n\n- six escalating normal waves\n- five persistent Core Integrity\n- deterministic per-run vocabulary and trajectories\n- Core Breaker final boss\n- combo, accuracy, perfect-wave, integrity, and boss-time scoring\n- local personal records and an all-time global leaderboard\n\n---\n\n## Profiles, statistics, and leaderboards');
  source = source.replace('- Daily Strike streaks and records\n', '- Arcade Rush personal records and completion statistics\n');
  source = source.replace('- Daily Strike\n', '- Arcade Rush\n');
  source = source.replace('│   ├── daily*.js\n', '│   ├── arcadeRush/\n│   ├── arcadeRush*.js\n');
  source = source.replace('- Endless and Daily Strike\n', '- Endless and Arcade Rush\n');
  source = source.replace('- [`DAILY_STRIKE.md`](./docs/DAILY_STRIKE.md)\n', '- [`ARCADE_RUSH_CONTRACT.md`](./docs/ARCADE_RUSH_CONTRACT.md)\n');
  if (/\*\*Daily Strike\*\*|### Daily Strike|daily\*\.js|DAILY_STRIKE\.md/.test(source)) throw new Error("Current README still advertises Daily Strike");
  return source;
});

edit("docs/MODE_ARCHITECTURE.md", (source) => {
  source = source.replace('Campaign, Typing Test, Endless, and Daily Strike are enabled. Practice Lab remains disabled.', 'Campaign, Typing Test, Endless, and Arcade Rush are enabled. Practice Lab remains disabled.');
  source = source.replace('`js/modeStorage.js` keeps bounded aggregates and at most 30 compact recent summaries under `wordstrike_mode_data_v1`.', '`js/modeStorage.js` keeps bounded aggregates and at most 30 compact recent summaries under the versioned mode-data store.');
  source = source.replace('- Daily Strike owns a finite deterministic runtime in `dailyMode.js`, with separate date, generation, scoring, and record modules.\n', '- Arcade Rush owns an isolated finite score-attack subsystem under `js/arcadeRush/`, bridged into the app by `arcadeRushAppController.js`.\n');
  source = source.replace('- Endless: Title → Mode Select → Endless Ready → Run → Results.\n', '- Endless: Title → Mode Select → Endless Ready → Run → Results.\n- Arcade Rush: Title → Mode Select → Arcade Rush Ready → six waves → Core Breaker → Results.\n');
  return source;
});

// Dedicated Daily frontend modules, tests, and current feature documentation are removed.
for (const path of [
  "js/dailyConfig.js",
  "js/dailyDate.js",
  "js/dailyGenerator.js",
  "js/dailyMode.js",
  "js/dailyRecords.js",
  "js/dailyScoring.js",
  "tests/daily-date-generation.test.js",
  "tests/daily-runtime-storage.test.js",
  "tests/daily-scoring-records.test.js",
  "tests/daily-ui.test.js",
  "tests/dailyCounterRegression.test.js",
  "tests/leaderboardDailyDate.test.js",
  "docs/DAILY_STRIKE.md",
]) {
  if (fs.existsSync(path)) fs.rmSync(path);
}

console.log("AR16 one-use Daily frontend deletion refactor applied.");
