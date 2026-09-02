import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAllModes } from "../js/modes.js";

class Card {
  constructor(id, index, button) {
    this.dataset = { modeId: id, modeIndex: String(index) };
    this.button = button;
  }
  matches(selector) { return selector === "button" && this.button; }
  focus() {}
}

const app = {
  html: "",
  cards: [],
  titleButton: null,
  set innerHTML(value) {
    this.html = value;
    this.cards = [...value.matchAll(/<(button|article)[^>]*data-mode-id="([^"]+)"[^>]*data-mode-index="(\d+)"/g)]
      .map((match) => new Card(match[2], Number(match[3]), match[1] === "button"));
    this.titleButton = value.includes('data-action="mode-title"')
      ? { dataset: { action: "mode-title" } }
      : null;
  },
  querySelectorAll(selector) {
    return selector === "[data-mode-index]" ? this.cards : [];
  },
  querySelector(selector) {
    if (selector === ".mode-card.available.selected") {
      return this.cards.find((card) => card.button) || null;
    }
    if (selector === '[data-action="mode-title"]') return this.titleButton;
    return null;
  },
};
globalThis.document = {
  querySelector(selector) {
    if (selector === "#app") return app;
    return null;
  },
};

const { renderModeSelect } = await import("../js/ui.js");
const selected = [];
const activated = [];
let backed = 0;
renderModeSelect(getAllModes(), 0, {
  select: (index) => selected.push(index),
  activate: (id) => activated.push(id),
  back: () => { backed += 1; },
});
assert.match(app.html, /MODE SELECT/);
assert.match(app.html, /CAMPAIGN/i);
assert.match(app.html, /ARCADE RUSH/i);
assert.doesNotMatch(app.html, /DAILY STRIKE/i);
assert.equal((app.html.match(/COMING SOON/g) || []).length, 1);
assert.match(app.html, /data-action="mode-title"[^>]*>MAIN MENU<\/button>/);
assert.equal(app.cards.filter((card) => card.button).length, 4);
app.cards[4].onmouseenter();
assert.equal(selected.at(-1), 4);
assert.equal(app.cards[4].onclick, undefined);
app.cards[0].onclick();
assert.equal(activated.at(-1), "campaign");
app.cards[1].onclick();
assert.equal(activated.at(-1), "speed-test");
app.cards[2].onclick();
assert.equal(activated.at(-1), "endless");
app.cards[3].onclick();
assert.equal(activated.at(-1), "arcade-rush");
app.titleButton.onclick();
assert.equal(backed, 1);

const [mainSource, keyboardSource] = await Promise.all([
  readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  readFile(new URL("../js/appKeyboardController.js", import.meta.url), "utf8"),
]);
assert.match(keyboardSource, /state\.screen === Screens\.MODE_SELECT/);
assert.match(keyboardSource, /if \(event\.key === "Escape"\) \{\s*openTitle\(\)/s);
assert.match(keyboardSource, /state\.modeSelection === getAllModes\(\)\.length\) openTitle\(\)/);
assert.match(mainSource, /createGlobalKeyboardController\(\{/);
assert.match(mainSource, /route === "arcade-rush-ready"\) openArcadeRushReady\("mode-select"\)/);
assert.match(mainSource, /back: openModeSelect/);
assert.match(mainSource, /renderDevSessionDiagnostics/);
assert.equal(mainSource.split('addEventListener("keydown"').length - 1, 1);

console.log("Mode Select renders Arcade Rush publicly with disabled Practice behavior and extracted keyboard navigation wiring.");
