import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAllModes } from "../js/modes.js";

class Card {
  constructor(id, index, button) {
    this.dataset = { modeId: id, modeIndex: String(index) };
    this.button = button;
    this.focused = false;
  }
  matches(selector) { return selector === "button" && this.button; }
  focus() { this.focused = true; }
}

class TitleButton {
  constructor(homeIndex = null) {
    this.dataset = { action: "mode-title" };
    if (homeIndex != null) this.dataset.modeHomeIndex = String(homeIndex);
    this.focused = false;
  }
  focus() { this.focused = true; }
}

const app = {
  html: "",
  cards: [],
  titleButtons: [],
  set innerHTML(value) {
    this.html = value;
    this.cards = [...value.matchAll(/<(button|article)[^>]*data-mode-id="([^"]+)"[^>]*data-mode-index="(\d+)"/g)]
      .map((match) => new Card(match[2], Number(match[3]), match[1] === "button"));
    const titleMatches = [...value.matchAll(/<button[^>]*data-action="mode-title"[^>]*>/g)];
    this.titleButtons = titleMatches.map((match) => {
      const home = match[0].match(/data-mode-home-index="(\d+)"/)?.[1] ?? null;
      return new TitleButton(home);
    });
  },
  querySelectorAll(selector) {
    if (selector === "[data-mode-index]") return this.cards;
    if (selector === '[data-action="mode-title"]') return this.titleButtons;
    return [];
  },
  querySelector(selector) {
    if (selector === '[data-action="mode-title"]') return this.titleButtons[0] || null;
    const modeIndex = selector.match(/\[data-mode-index="(\d+)"\]/)?.[1];
    if (modeIndex != null) return this.cards.find((card) => card.dataset.modeIndex === modeIndex) || null;
    const homeIndex = selector.match(/\[data-mode-home-index="(\d+)"\]/)?.[1];
    if (homeIndex != null) return this.titleButtons.find((button) => button.dataset.modeHomeIndex === homeIndex) || null;
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
const modes = getAllModes();

renderModeSelect(modes, 0, {
  select: (index) => selected.push(index),
  activate: (id) => activated.push(id),
  back: () => { backed += 1; },
});

assert.match(app.html, /Mode Select/);
assert.match(app.html, /Choose your challenge/i);
assert.match(app.html, /Campaign/);
assert.match(app.html, /Arcade Rush/);
assert.doesNotMatch(app.html, /DAILY STRIKE/i);
assert.equal(app.cards.length, 5);
assert.equal(app.cards.filter((card) => card.button).length, 4);
assert.equal(app.cards[4].button, false);
assert.match(app.html, /data-mode-id="practice"[^>]*aria-disabled="true"/);
assert.match(app.html, /data-mode-home-index="5"[^>]*data-action="mode-title"/);
assert.equal(app.cards[0].focused, true);

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

const footerHome = app.titleButtons.find((button) => button.dataset.modeHomeIndex === "5");
assert.ok(footerHome);
footerHome.onmouseenter();
assert.equal(selected.at(-1), modes.length);
footerHome.onclick();
assert.equal(backed, 1);

renderModeSelect(modes, modes.length, {
  select: (index) => selected.push(index),
  activate: (id) => activated.push(id),
  back: () => { backed += 1; },
});
const selectedHome = app.titleButtons.find((button) => button.dataset.modeHomeIndex === "5");
assert.equal(selectedHome.focused, true);
assert.match(app.html, /Return to title/);

const [mainSource, keyboardSource] = await Promise.all([
  readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  readFile(new URL("../js/appKeyboardController.js", import.meta.url), "utf8"),
]);
assert.match(keyboardSource, /state\.screen === Screens\.MODE_SELECT/);
assert.match(keyboardSource, /const itemCount = getAllModes\(\)\.length \+ 1/);
assert.match(keyboardSource, /state\.modeSelection === getAllModes\(\)\.length\) openTitle\(\)/);
assert.match(mainSource, /createGlobalKeyboardController\(\{/);
assert.match(mainSource, /route === "arcade-rush-ready"\) openArcadeRushReady\("mode-select"\)/);
assert.match(mainSource, /back: openModeSelect/);
assert.match(mainSource, /renderDevSessionDiagnostics/);
assert.equal(mainSource.split('addEventListener("keydown"').length - 1, 1);

console.log("UI3 Mode Select preserves five registry entries, four public activations, Main Menu index ownership, and extracted keyboard routing.");
