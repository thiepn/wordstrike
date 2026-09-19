import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDefaultModeData } from "../js/modeStorage.js";
import { getStatisticsSnapshot } from "../js/statistics.js";
import { Screens } from "../js/state.js";
import {
  attachAppClickListener,
  resolveAppClickAction,
} from "../js/appClickRouting.js";

class MouseEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles === true;
    this.cancelable = options.cancelable === true;
    this.button = options.button ?? 0;
  }
  preventDefault() {}
}
globalThis.MouseEvent = MouseEvent;

class Element {
  constructor({ root, parent = null, action = null, className = "" } = {}) {
    this.root = root || this;
    this.parent = parent;
    this.dataset = action ? { action } : {};
    this.className = className;
    this.disabled = false;
    this.hidden = false;
    this.attributes = {};
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
  dispatchEvent(event) {
    event.target = this;
    if (event.bubbles) this.root.listeners.get(event.type)?.forEach((listener) => listener(event));
  }
  focus() {}
  select() {}
}

class Root extends Element {
  constructor() {
    super();
    this.root = this;
    this.listeners = new Map();
    this.buttons = [];
  }
  addEventListener(type, listener) {
    const entries = this.listeners.get(type) || [];
    entries.push(listener);
    this.listeners.set(type, entries);
  }
  contains(node) {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
  }
  set innerHTML(value) {
    this.html = value;
    this.screen = new Element({ root: this, parent: this, className: "profile-stats-screen" });
    this.account = new Element({ root: this, parent: this.screen, className: "global-account" });
    this.buttons = [...value.matchAll(/<button([^>]*)data-action="([^"]+)"([^>]*)>/g)].map((match) => {
      const button = new Element({ root: this, parent: this.account, action: match[2], className: "arcade-button" });
      button.disabled = /\sdisabled(?:\s|>)/.test(`${match[1]} ${match[3]}>`);
      if (/aria-disabled="true"/.test(`${match[1]} ${match[3]}`)) button.attributes["aria-disabled"] = "true";
      return button;
    });
  }
  querySelectorAll() { return []; }
  querySelector(selector) {
    if (selector === "#global-account-content") return null;
    return null;
  }
}

const root = new Root();
globalThis.document = { querySelector: (selector) => selector === "#app" ? root : null };
const { renderProfileStatistics } = await import("../js/statisticsUi.js");
const storage = createDefaultModeData();
storage.profile = {
  playerId: "ws_auth-ui-test",
  displayName: "Player",
  createdAt: 1000,
  updatedAt: 1000,
  profileVersion: 1,
};
const snapshot = getStatisticsSnapshot(storage, { currentFurthestLevel: 1, levels: {} }, "2026-06-27");
const render = (authState, leaderboardProfileState = { status: "idle" }) => renderProfileStatistics({
  snapshot, storage, activeTab: 6, authState, leaderboardProfileState,
}, {});

render({ status: "loading" });
assert.match(root.html, /Checking account/);
render({ status: "signed-out" });
assert.match(root.html, /CONTINUE WITH GOOGLE/);
render({ status: "signing-in" });
assert.match(root.html, /Redirecting to Google/);
assert.equal(root.buttons[0].disabled, true);
render({
  status: "signed-in",
  session: { access_token: "never-render-this-token", user: { email: "private@example.com" } },
  user: { user_metadata: { full_name: "Private Google Name" } },
});
assert.match(root.html, /Google account connected/);
assert.match(root.html, /SIGN OUT/);
assert.doesNotMatch(root.html, /never-render-this-token|private@example\.com|Private Google Name/);
render({ status: "unavailable" });
assert.match(root.html, /Online account services are unavailable/);
assert.match(root.html, /Local gameplay and records are unaffected/);
render({ status: "error" });
assert.match(root.html, /TRY GOOGLE SIGN-IN AGAIN/);
assert.doesNotMatch(root.html, /never-render-this-token|private@example\.com|secret stack detail/i);

const calls = [];
const listener = (event) => {
  const action = resolveAppClickAction(event, {
    root, screen: Screens.PROFILE_STATS, now: 1, readyAt: 999,
  });
  if (action) calls.push(action);
};
assert.equal(attachAppClickListener(root, listener), true);
assert.equal(attachAppClickListener(root, listener), false);
render({ status: "signed-out" });
root.buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
render({ status: "signed-in" });
root.buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
assert.deepEqual(calls, ["auth-google-sign-in", "auth-sign-out"]);
assert.equal(root.listeners.get("click").length, 1);

render(
  { status: "signed-in", user: { id: "user-retry" } },
  { status: "error", profile: null, error: { code: "SERVER_ERROR", message: "Public profile services are temporarily unavailable." } },
);
assert.match(root.html, /RETRY PROFILE CHECK/);
root.buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
assert.deepEqual(calls, ["auth-google-sign-in", "auth-sign-out", "leaderboard-profile-retry"]);

render({ status: "signing-in" });
root.buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
render({ status: "signed-out" });
root.buttons[0].hidden = true;
root.buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
assert.equal(calls.length, 3);

const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
assert.match(main, /void initializeAuth\(\)/);
assert.match(main, /updateProfileAuthSection\(authState, getLeaderboardProfileState\(\)\)/);
assert.equal(main.split('addEventListener("keydown"').length - 1, 1);
assert.equal(main.split("attachAppClickListener(").length - 1, 1);

console.log("Profile auth states and stable delegated bubbling clicks passed without rendering private identity data.");
