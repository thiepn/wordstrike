from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "js/ui.js",
    'import { getCampaignDifficultyLevel } from "./campaignDifficulty.js";\n',
    'import { getCampaignDifficultyLevel } from "./campaignDifficulty.js";\nimport {\n  CAMPAIGN_SPEED_UNLOCKS,\n  getCampaignBest60SecondWpm,\n  getCampaignSpeedUnlockLevel,\n} from "./storage.js";\n',
)

old = '''  const furthestLevel = Math.max(1, Math.min(100, Number(save.currentFurthestLevel) || 1));
  const safeSelected = Math.max(1, Math.min(100, Number(selectedLevel) || 1));
  const levels = save.levels || {};
  const resultFor = (level) => levels[String(level)] || levels[level] || null;
  const isCleared = (result) => Boolean(result?.grade && result.grade !== "Fail");
  const clearedTotal = Object.values(levels).filter(isCleared).length;
  const selectedResult = resultFor(safeSelected);
  const selectedCleared = isCleared(selectedResult);
  const selectedBoss = safeSelected % 10 === 0;
  const selectedLocked = !devMode && safeSelected > furthestLevel;
  const selectedState = selectedCleared
    ? "cleared"
    : selectedLocked
      ? "locked"
      : devMode && safeSelected > furthestLevel
        ? "developer"
        : "ready";
  const selectedStateLabel = selectedState === "cleared"
    ? "Cleared"
    : selectedState === "locked"
      ? "Locked"
      : selectedState === "developer"
        ? "Developer access"
        : selectedBoss
          ? "Boss ready"
          : "Ready";
  const metric = (value, suffix = "") => Number.isFinite(Number(value))
    ? `${Number(value).toFixed(suffix ? 1 : 0)}${suffix}`
    : "—";
  const selectedGrade = selectedCleared ? selectedResult.grade : "—";
  const selectedWpm = metric(selectedResult?.bestWPM ?? selectedResult?.wpm);
  const selectedAccuracy = metric(selectedResult?.bestAccuracy ?? selectedResult?.accuracy, "%");
'''
new = '''  const furthestLevel = Math.max(1, Math.min(100, Number(save.currentFurthestLevel) || 1));
  const campaignProgressLevel = Math.max(
    1,
    Math.min(100, Number(save.campaignFurthestLevel ?? furthestLevel) || 1),
  );
  const best60SecondWpm = getCampaignBest60SecondWpm();
  const speedAccessLevel = getCampaignSpeedUnlockLevel();
  const nextSpeedUnlock = CAMPAIGN_SPEED_UNLOCKS.find(({ wpm }) => best60SecondWpm < wpm) || null;
  const nextSpeedDelta = nextSpeedUnlock
    ? Math.max(0, Math.ceil(nextSpeedUnlock.wpm - best60SecondWpm))
    : 0;
  const best60SecondLabel = best60SecondWpm > 0 ? `${Math.round(best60SecondWpm)} WPM` : "—";
  const nextSpeedLabel = nextSpeedUnlock
    ? `${nextSpeedUnlock.wpm} WPM → Level ${nextSpeedUnlock.level}${best60SecondWpm > 0 ? ` · ${nextSpeedDelta} WPM needed` : ""}`
    : "Maximum speed access reached";
  const safeSelected = Math.max(1, Math.min(100, Number(selectedLevel) || 1));
  const levels = save.levels || {};
  const resultFor = (level) => levels[String(level)] || levels[level] || null;
  const isCleared = (result) => Boolean(result?.grade && result.grade !== "Fail");
  const clearedTotal = Object.values(levels).filter(isCleared).length;
  const selectedResult = resultFor(safeSelected);
  const selectedCleared = isCleared(selectedResult);
  const selectedBoss = safeSelected % 10 === 0;
  const selectedLocked = !devMode && safeSelected > furthestLevel;
  const selectedSpeedAccess = !devMode
    && !selectedCleared
    && safeSelected > campaignProgressLevel
    && safeSelected <= speedAccessLevel;
  const selectedUnlockRequirement = CAMPAIGN_SPEED_UNLOCKS.find(({ level }) => level >= safeSelected) || null;
  const selectedState = selectedCleared
    ? "cleared"
    : selectedLocked
      ? "locked"
      : selectedSpeedAccess
        ? "speed"
        : devMode && safeSelected > furthestLevel
          ? "developer"
          : "ready";
  const selectedStateLabel = selectedState === "cleared"
    ? "Cleared"
    : selectedState === "locked"
      ? "Locked"
      : selectedState === "speed"
        ? "Speed unlocked"
        : selectedState === "developer"
          ? "Developer access"
          : selectedBoss
            ? "Boss ready"
            : "Ready";
  const metric = (value, suffix = "") => Number.isFinite(Number(value))
    ? `${Number(value).toFixed(suffix ? 1 : 0)}${suffix}`
    : "—";
  const selectedGrade = selectedCleared ? selectedResult.grade : "—";
  const selectedWpm = metric(selectedResult?.bestWPM ?? selectedResult?.wpm);
  const selectedAccuracy = metric(selectedResult?.bestAccuracy ?? selectedResult?.accuracy, "%");
  const selectedCommandCopy = selectedLocked
    ? selectedUnlockRequirement
      ? `Score ${selectedUnlockRequirement.wpm} WPM in the 60-second Typing Test${best60SecondWpm > 0 ? ` · best ${Math.round(best60SecondWpm)} WPM` : ""}`
      : "Complete Campaign progression to unlock this mission"
    : selectedBoss
      ? "Launch boss encounter"
      : selectedSpeedAccess
        ? "Launch speed-unlocked mission"
        : "Launch selected mission";
'''
replace_once("js/ui.js", old, new)

old = '''      const locked = !devMode && level > furthestLevel;
      const developerAccess = devMode && level > furthestLevel;
      const frontier = !devMode && level === furthestLevel && !cleared;
      const classes = [
        "campaign-node",
        cleared ? "is-complete" : "",
        boss ? "is-boss" : "",
        locked ? "is-locked" : "",
        developerAccess ? "dev-access is-locked" : "",
        frontier ? "is-frontier" : "",
        level === safeSelected ? "selected" : "",
      ].filter(Boolean).join(" ");
      const stateText = cleared
        ? result.grade
        : locked
          ? "LOCKED"
          : developerAccess
            ? "DEV"
            : boss
              ? "BOSS"
              : "READY";
      const descriptor = boss ? "Boss" : "Standard mission";
      const availability = cleared
        ? `cleared with grade ${result.grade}`
        : locked
          ? "locked"
          : developerAccess
            ? "developer access"
            : "ready";
      return `<button type="button" class="${classes}" data-level="${level}"
        ${locked ? "disabled" : ""}
        aria-label="Level ${level}, ${descriptor}, ${availability}"
        aria-current="${level === safeSelected ? "true" : "false"}">
'''
new = '''      const locked = !devMode && level > furthestLevel;
      const developerAccess = devMode && level > furthestLevel;
      const speedAccess = !devMode
        && !cleared
        && level > campaignProgressLevel
        && level <= speedAccessLevel;
      const frontier = !devMode && level === furthestLevel && !cleared;
      const classes = [
        "campaign-node",
        cleared ? "is-complete" : "",
        boss ? "is-boss" : "",
        locked ? "is-locked" : "",
        speedAccess ? "is-speed-access" : "",
        developerAccess ? "dev-access is-locked" : "",
        frontier ? "is-frontier" : "",
        level === safeSelected ? "selected" : "",
      ].filter(Boolean).join(" ");
      const stateText = cleared
        ? result.grade
        : locked
          ? "LOCKED"
          : developerAccess
            ? "DEV"
            : speedAccess
              ? "SPEED"
              : boss
                ? "BOSS"
                : "READY";
      const descriptor = boss ? "Boss" : "Standard mission";
      const availability = cleared
        ? `cleared with grade ${result.grade}`
        : locked
          ? "locked, inspectable"
          : developerAccess
            ? "developer access"
            : speedAccess
              ? "speed unlocked by 60-second Typing Test"
              : "ready";
      return `<button type="button" class="${classes}" data-level="${level}" data-locked="${locked ? "true" : "false"}"
        aria-disabled="${locked ? "true" : "false"}"
        aria-label="Level ${level}, ${descriptor}, ${availability}"
        aria-current="${level === safeSelected ? "true" : "false"}">
'''
replace_once("js/ui.js", old, new)

replace_once(
    "js/ui.js",
    '''            <p class="campaign-progress-lead">Advance through ten sectors of increasing pressure. Each sector ends in a boss encounter; cleared missions keep their grade on the route.</p>
            <div class="campaign-progress-tools">''',
    '''            <p class="campaign-progress-lead">Advance through ten sectors of increasing pressure. Each sector ends in a boss encounter; cleared missions keep their grade on the route.</p>
            <div class="campaign-speed-status" aria-label="Typing Test Campaign speed access">
              <span><small>60s best</small><strong>${best60SecondLabel}</strong></span>
              <span><small>Speed access</small><strong>Level ${speedAccessLevel}</strong></span>
              <span><small>Next</small><strong>${nextSpeedLabel}</strong></span>
            </div>
            <div class="campaign-progress-tools">''',
)

replace_once(
    "js/ui.js",
    '<div class="campaign-mission-command"><kbd>ENTER</kbd><span>${selectedLocked ? "Mission unavailable" : selectedBoss ? "Launch boss encounter" : "Launch selected mission"}</span></div>',
    '<div class="campaign-mission-command"><kbd>ENTER</kbd><span>${selectedCommandCopy}</span></div>',
)

replace_once(
    "js/ui.js",
    '''  app().querySelectorAll(".campaign-node:not(:disabled)").forEach((node) => {
    node.onclick = () => handlers.select(Number(node.dataset.level));
  });''',
    '''  app().querySelectorAll(".campaign-node").forEach((node) => {
    const level = Number(node.dataset.level);
    node.onclick = () => {
      if (node.dataset.locked === "true") handlers.inspect?.(level);
      else handlers.select(level);
    };
  });''',
)

replace_once(
    "js/main.js",
    '  const maximumLevel = appState.devMode ? 100 : appState.save.currentFurthestLevel;\n',
    '  const maximumLevel = 100;\n',
)

replace_once(
    "js/main.js",
    '''function inspectDevLevel(levelNumber) {
  if (!appState.devMode || !Number.isFinite(levelNumber)) return;''',
    '''function inspectCampaignLevel(levelNumber) {
  if (!Number.isFinite(levelNumber)) return;
  appState.levelSelection = Math.max(1, Math.min(100, Math.round(levelNumber)));
  renderCurrentScreen();
}

function inspectDevLevel(levelNumber) {
  if (!appState.devMode || !Number.isFinite(levelNumber)) return;''',
)

replace_once(
    "js/main.js",
    '''      select: (level) => startLevel(level, "level-select"),
      devInspect: inspectDevLevel,''',
    '''      select: (level) => startLevel(level, "level-select"),
      inspect: inspectCampaignLevel,
      devInspect: inspectDevLevel,''',
)

replace_once(
    "js/campaignGameplayPresentation.js",
    '''    .campaign-node.is-speed-unlocked .campaign-speed-unlock-badge{border-color:rgb(var(--custom-accent-rgb,0 255 242)/72%);color:var(--color-accent);box-shadow:0 0 0 2px rgb(var(--custom-bg-rgb,10 14 20)/88%),0 0 12px rgb(var(--custom-accent-rgb,0 255 242)/20%)}
    .campaign-speed-unlock-tooltip{''',
    '''    .campaign-node.is-speed-unlocked .campaign-speed-unlock-badge{border-color:rgb(var(--custom-accent-rgb,0 255 242)/72%);color:var(--color-accent);box-shadow:0 0 0 2px rgb(var(--custom-bg-rgb,10 14 20)/88%),0 0 12px rgb(var(--custom-accent-rgb,0 255 242)/20%)}
    .campaign-node.is-speed-access .campaign-node-marker{border-style:dashed;border-color:rgb(var(--custom-accent-rgb,0 255 242)/62%);background:rgb(var(--custom-accent-rgb,0 255 242)/5%);color:var(--color-accent)}
    .campaign-node.is-speed-access .campaign-node-state{color:rgb(var(--custom-accent-rgb,0 255 242)/82%)}
    .campaign-mission-status[data-state="speed"]::before{border-radius:1px;background:var(--color-accent);box-shadow:var(--bloom-accent-sm);transform:rotate(45deg)}
    .campaign-node.is-locked:not(.dev-access){cursor:pointer}
    .campaign-node.is-locked:not(.dev-access):hover .campaign-node-marker,.campaign-node.is-locked:not(.dev-access):focus .campaign-node-marker{border-color:rgb(118 132 144/38%);background:rgb(11 16 22/82%);color:rgb(151 166 178/68%);box-shadow:0 0 0 5px rgb(var(--custom-bg-rgb,10 14 20)/72%);transform:none}
    .campaign-speed-status{display:flex;flex-wrap:wrap;gap:7px 18px;margin-top:13px;color:var(--color-text-muted);font-size:.7rem}
    .campaign-speed-status span{display:flex;align-items:baseline;gap:7px;min-width:0}
    .campaign-speed-status small{color:var(--color-text-muted);font-size:.62rem;font-weight:650;letter-spacing:.075em;text-transform:uppercase}
    .campaign-speed-status strong{color:var(--color-text-secondary);font-family:var(--font-game);font-size:.7rem;font-weight:650;letter-spacing:.01em}
    .campaign-speed-unlock-tooltip{''',
)

replace_once(
    "js/campaignGameplayPresentation.js",
    '.campaign-node.has-speed-unlock:hover .campaign-speed-unlock-tooltip,.campaign-node.has-speed-unlock:focus-visible .campaign-speed-unlock-tooltip{opacity:1;visibility:visible;transform:translate(-50%,0)}',
    '.campaign-node.has-speed-unlock:hover .campaign-speed-unlock-tooltip,.campaign-node.has-speed-unlock:focus .campaign-speed-unlock-tooltip,.campaign-node.has-speed-unlock:focus-visible .campaign-speed-unlock-tooltip{opacity:1;visibility:visible;transform:translate(-50%,0)}',
)

replace_once(
    "js/campaignGameplayPresentation.js",
    '.campaign-node:disabled.has-speed-unlock:hover .campaign-speed-unlock-badge{border-color:rgb(118 132 144/58%);color:rgb(151 166 178/82%)}',
    '.campaign-node.is-locked.has-speed-unlock:hover .campaign-speed-unlock-badge{border-color:rgb(118 132 144/58%);color:rgb(151 166 178/82%)}',
)

Path("tests/campaign-speed-unlock-ux.test.js").write_text('''import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\n\nconst ui = readFileSync(new URL("../js/ui.js", import.meta.url), "utf8");\nconst main = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");\nconst presentation = readFileSync(new URL("../js/campaignGameplayPresentation.js", import.meta.url), "utf8");\n\nassert.match(ui, /class="campaign-speed-status"/);\nassert.match(ui, /Speed access/);\nassert.match(ui, /data-locked="\\$\\{locked \\? "true" : "false"\\}"/);\nassert.match(ui, /aria-disabled="\\$\\{locked \\? "true" : "false"\\}"/);\nassert.doesNotMatch(ui, /locked \\? "disabled"/);\nassert.match(ui, /handlers\\.inspect\\?\\.\\(level\\)/);\nassert.match(ui, /is-speed-access/);\nassert.match(ui, /Speed unlocked/);\nassert.match(main, /const maximumLevel = 100;/);\nassert.match(main, /function inspectCampaignLevel\\(levelNumber\\)/);\nassert.match(main, /inspect: inspectCampaignLevel/);\nassert.match(presentation, /campaign-node\\.is-speed-access/);\nassert.match(presentation, /campaign-node\\.has-speed-unlock:focus \\.campaign-speed-unlock-tooltip/);\n\nconsole.log("Campaign speed-unlock UX keeps locked missions inspectable, non-launchable, and visibly distinct.");\n''')
