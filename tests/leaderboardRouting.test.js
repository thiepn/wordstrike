import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attachAppClickListener } from "../js/appClickRouting.js";
import { Screens } from "../js/state.js";

class MouseEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles !== false;
    this.defaultPrevented = false;
    this.target = null;
  }

  preventDefault() { this.defaultPrevented = true; }
}

globalThis.MouseEvent = MouseEvent;

class Button {
  constructor(action, root) {
    this.dataset = { action };
    this.root = root;
    this.disabled = false;
    this.hidden = false;
  }

  closest(selector) {
    if (!selector.includes("[data-action]")) return null;
    return this;
  }

  dispatchEvent(event) {
    event.target = this;
    if (event.bubbles) this.root.dispatchEvent(event);
  }
}

class Root {
  constructor() {
    this.listeners = { click: [] };
    this.className = "";
    this.buttons = [];
  }

  addEventListener(type, handler) {
    this.listeners[type] ??= [];
    this.listeners[type].push(handler);
  }

  contains(target) { return this.buttons.includes(target); }

  matches(selector) {
    return selector.split(",").some((part) => part.trim() === `.${this.className}`);
  }

  dispatchEvent(event) {
    for (const handler of this.listeners[event.type] || []) handler(event);
  }

  render(className, actions) {
    this.className = className;
    this.buttons = actions.map((action) => new Button(action, this));
  }
}

let screen = Screens.TITLE;
const calls = [];
const listener = {
  getScreen: () => screen,
  isLeaderboardReady: () => true,
  onAction: (action) => calls.push(action),
};
const root = new Root();
assert.equal(attachAppClickListener(root, listener), true);
assert.equal(attachAppClickListener(root, listener), false);
root.render("menu-screen", ["open-leaderboards"]);
root.buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
screen = Screens.LEADERBOARDS;
const actions = [
  "leaderboard-select-arcade-rush", "leaderboard-select-endless", "leaderboard-refresh", "leaderboard-main-menu",
];
root.render("leaderboards-screen", actions);
for (const button of root.buttons) button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
assert.deepEqual(calls, ["open-leaderboards", ...actions]);
assert.equal(root.listeners.click.length, 1);
root.buttons[0].disabled = true;
root.buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
root.buttons[1].hidden = true;
root.buttons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
assert.equal(calls.length, 5);

const ui = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
const clickRouting = await readFile(new URL("../js/appClickRouting.js", import.meta.url), "utf8");
assert.match(ui, /data-title-index="1" data-action="open-leaderboards"/);
assert.match(main, /function openLeaderboards\(\)/);
assert.match(main, /Screens\.LEADERBOARDS/);
assert.match(clickRouting, /"leaderboard-select-arcade-rush"/);
assert.doesNotMatch(clickRouting, /"leaderboard-select-daily"/);
assert.equal(main.split("attachAppClickListener(").length - 1, 1);
assert.equal(main.split('addEventListener("keydown"').length - 1, 1);

console.log("Main-menu and active Leaderboards actions use one stable delegated click route after Daily retirement.");
