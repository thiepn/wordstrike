import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Screens } from "../js/state.js";
import { attachAppClickListener, resolveAppClickAction } from "../js/appClickRouting.js";

class MouseEvent {
  constructor(type, options = {}) { this.type = type; this.bubbles = options.bubbles; this.button = 0; }
  preventDefault() {}
}
globalThis.MouseEvent = MouseEvent;
class Element {
  constructor({ root, parent = null, action = null, className = "" } = {}) {
    this.root = root || this; this.parent = parent; this.dataset = action ? { action } : {};
    this.className = className; this.disabled = false; this.hidden = false; this.attributes = {};
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  closest(selector) {
    let node = this;
    while (node) {
      if (selector === "[data-action]" && node.dataset?.action) return node;
      if (selector === "[hidden]" && node.hidden) return node;
      if (selector === '[aria-hidden="true"]' && node.attributes?.["aria-hidden"] === "true") return node;
      if (selector.startsWith(".") && node.className.split(" ").includes(selector.slice(1))) return node;
      node = node.parent;
    }
    return null;
  }
  dispatchEvent(event) { event.target = this; if (event.bubbles) this.root.listeners.click.forEach((fn) => fn(event)); }
}
class Root extends Element {
  constructor() { super(); this.root = this; this.listeners = { click: [] }; this.current = null; }
  addEventListener(type, listener) { this.listeners[type].push(listener); }
  contains(node) { let current = node; while (current) { if (current === this) return true; current = current.parent; } return false; }
  render(screenClass, actions) {
    this.current = new Element({ root: this, parent: this, className: screenClass });
    this.buttons = actions.map((action) => new Element({ root: this, parent: this.current, action }));
  }
}
const root = new Root();
let screen = Screens.TITLE;
const calls = [];
const listener = (event) => {
  const action = resolveAppClickAction(event, { root, screen });
  if (action) calls.push(action);
};
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
assert.match(ui, /\["LEADERBOARDS", "open-leaderboards"\]/);
assert.match(main, /function openLeaderboards\(\)/);
assert.match(main, /Screens\.LEADERBOARDS/);
assert.match(clickRouting, /"leaderboard-select-arcade-rush"/);
assert.doesNotMatch(clickRouting, /"leaderboard-select-daily"/);
assert.equal(main.split("attachAppClickListener(").length - 1, 1);
assert.equal(main.split('addEventListener("keydown"').length - 1, 1);

console.log("Main-menu and active Leaderboards actions use one stable delegated click route after Daily retirement.");
