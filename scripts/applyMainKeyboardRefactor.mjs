import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../js/main.js", import.meta.url);
let source = await readFile(path, "utf8");

const replacements = [
  ['  getResultsActions,\n', ''],
  ['  isResultsInputBlocked,\n', ''],
  ['  getLeaderboardKeyboardTarget,\n', ''],
  ['import { captureGameplayBackspace, isTextEntryTarget } from "./inputSafety.js";\n', ''],
];
for (const [needle, replacement] of replacements) {
  if (!source.includes(needle)) throw new Error(`Expected main.js fragment missing: ${needle.trim()}`);
  source = source.replace(needle, replacement);
}

const routingImport = `import {\n  attachAppClickListener,\n  resolveAppClickAction,\n} from "./appClickRouting.js";\n`;
if (!source.includes(routingImport)) throw new Error("appClickRouting import anchor missing");
source = source.replace(
  routingImport,
  `${routingImport}import { createGlobalKeyboardController } from "./appKeyboardController.js";\n`,
);

const startMarker = "function handleGlobalKeydown(event) {";
const endMarker = "\n\nasync function bootstrap() {";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("Global keyboard handler boundaries not found");

const replacement = `const handleGlobalKeydown = createGlobalKeyboardController({\n  state: appState,\n  currentTimeMs,\n  routeActiveGameplayKey,\n  cancelProfileNameEdit,\n  saveProfileName,\n  openTitle,\n  selectStatisticsTab,\n  resumeGame,\n  renderPauseOverlay,\n  resetSpeedTestAttempt,\n  openModeSelect,\n  startEndless,\n  startDaily,\n  retryCurrentLevel,\n  backPracticeLab: () => practiceLabController?.back(),\n  activateTitleAction,\n  renderCurrentScreen,\n  activateSelectedMode,\n  moveLevelSelection,\n  startLevel,\n  openLevelSelect,\n  backFromSettings,\n  toggleSetting,\n  confirmReset,\n  titleActionCount: titleActions.length,\n});`;
source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;

if (source.includes(startMarker)) throw new Error("Inline global keyboard handler still present");
if (!source.includes('createGlobalKeyboardController({')) throw new Error("Keyboard controller wiring missing");
if ((source.match(/document\.addEventListener\("keydown"/g) || []).length !== 1) {
  throw new Error("Expected exactly one global keydown listener");
}

await writeFile(path, source);
console.log("Extracted global keyboard routing from main.js.");
