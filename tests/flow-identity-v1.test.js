import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getModeDefinition, MODE_IDS } from "../js/modes.js";
import {
  FLOW_THEME_PREFERENCE_STORAGE_KEY,
  formatFlowThemeLabel,
  getFlowStreamIdentity,
  loadPreferredFlowTheme,
  normalizeStoredFlowTheme,
  savePreferredFlowTheme,
} from "../js/flow/flowIdentityV1.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const previousStorage = globalThis.localStorage;
globalThis.localStorage = new MemoryStorage();

try {
  assert.equal(normalizeStoredFlowTheme(" SCIENCE "), "science");
  assert.equal(normalizeStoredFlowTheme("../bad"), "mixed");
  assert.equal(formatFlowThemeLabel("science"), "Science");
  assert.equal(formatFlowThemeLabel("history-culture"), "History Culture");

  assert.equal(loadPreferredFlowTheme(), "mixed");
  assert.equal(savePreferredFlowTheme("science"), "science");
  assert.equal(globalThis.localStorage.getItem(FLOW_THEME_PREFERENCE_STORAGE_KEY), "science");
  assert.equal(loadPreferredFlowTheme(), "science");
  globalThis.localStorage.setItem(FLOW_THEME_PREFERENCE_STORAGE_KEY, "<invalid>");
  assert.equal(loadPreferredFlowTheme(), "mixed");

  const plan = {
    structure: "continuous-stream",
    theme: "mixed",
    difficulty: "mixed",
    documents: [
      { title: "First Source", theme: "science", themeLabel: "Science", difficulty: "natural", wordCount: 510 },
      { title: "Second Source", theme: "travel", themeLabel: "Travel", difficulty: "advanced", wordCount: 620 },
    ],
    segments: [
      { documentIndex: 0 },
      { documentIndex: 0 },
      { documentIndex: 1 },
    ],
  };

  const first = getFlowStreamIdentity(plan, 0);
  assert.equal(first.modeLabel, "FLOW");
  assert.equal(first.modeDescriptor, "Continuous longform");
  assert.equal(first.selectedThemeLabel, "Mixed");
  assert.equal(first.sourceTitle, "First Source");
  assert.equal(first.sourceThemeLabel, "Science");
  assert.equal(first.sourcePosition, "Text 1 / 2");
  assert.equal(first.wordCount, 510);

  const second = getFlowStreamIdentity(plan, 2);
  assert.equal(second.sourceTitle, "Second Source");
  assert.equal(second.sourcePosition, "Text 2 / 2");
  assert.equal(second.difficulty, "advanced");
  assert.equal(second.wordCount, 620);

  const flowMode = getModeDefinition(MODE_IDS.FLOW);
  assert.equal(flowMode.shortLabel, "Continuous");
  assert.match(flowMode.description, /continuous long-form texts/i);
  assert.match(flowMode.description, /lasting records/i);

  const [phase1, loader, css, index, sw] = await Promise.all([
    readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8"),
    readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8"),
    readFile(new URL("../styles/screens/flow-session-v4.css", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(loader, /loadPreferredFlowTheme/);
  assert.match(loader, /flowIdentityV1\.js\?v=20260924a/);
  assert.match(loader, /wordstrike-flow-release-v19/);
  assert.match(phase1, /getFlowStreamIdentity/);
  assert.match(phase1, /savePreferredFlowTheme/);
  assert.match(phase1, /data-flow-identity/);
  assert.match(phase1, /data-flow-source-title/);
  assert.match(phase1, /data-flow-hud-v5/);
  assert.match(phase1, /flow-v5-session-meta/);
  assert.match(css, /WORDSTRIKE FLOW — PHASE 7C/);
  assert.match(css, /flow-v5-run-header/);
  assert.match(css, /flow-v5-source/);
  assert.match(css, /flow-game-v2-hud\[data-flow-hud-v5="true"\]/);
  assert.match(css, /flow-v5-session-meta/);
  assert.match(index, /flow-session-v4\.css\?v=20260924c/);
  assert.match(index, /flowRuntimeLoader\.js\?v=20260924g/);
  assert.match(sw, /const CACHE_NAME = CACHE_PREFIX \+ "v\\d+-[^"]+";/);
  assert.match(sw, /flowIdentityV1\.js\?v=20260924a/);

  console.log("Flow Phase 7C contracts passed: persistent text mix, source identity, stronger HUD hierarchy, mode identity copy, responsive presentation, and offline wiring.");
} finally {
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
}
