import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_ROUTE_STATE_KEY,
  canonicalAppRouteUrl,
  createAppRouteNavigation,
  normalizeAppRoute,
  parseAppRoute,
} from "../js/appRouteNavigation.js";
import { getAllModes } from "../js/modes.js";

const ORIGIN = "https://thiepn.dev/wordstrike/";

function fakeBrowser(initialUrl = ORIGIN, initialState = { foreign: "retained" }) {
  const listeners = new Map();
  const entries = [{ url: initialUrl, state: initialState }];
  let cursor = 0;
  const events = [];
  const location = {
    get href() { return entries[cursor].url; },
    get search() { return new URL(this.href).search; },
    get hash() { return new URL(this.href).hash; },
  };
  function emit(type, event) {
    for (const listener of listeners.get(type) || []) listener(event);
  }
  const history = {
    get state() { return entries[cursor].state; },
    replaceState(state, _unused, url = location.href) {
      entries[cursor] = { url: String(url), state };
      events.push("replace");
    },
    pushState(state, _unused, url = location.href) {
      entries.splice(cursor + 1);
      entries.push({ url: String(url), state });
      cursor += 1;
      events.push("push");
    },
    back() {
      if (cursor === 0) return;
      cursor -= 1;
      events.push("back");
      emit("popstate", { state: this.state });
    },
    forward() {
      if (cursor === entries.length - 1) return;
      cursor += 1;
      events.push("forward");
      emit("popstate", { state: this.state });
    },
  };
  return {
    history, location, events, entries,
    get index() { return cursor; },
    addEventListener(name, callback) {
      const group = listeners.get(name) || new Set();
      group.add(callback);
      listeners.set(name, group);
    },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
  };
}

test("every public mode has exactly one canonical deep link and retired modes cannot route", () => {
  const modes = getAllModes().map(({ id }) => id);
  assert.deepEqual(modes, ["campaign", "speed-test", "endless", "flow", "practice"]);
  for (const mode of modes) {
    const link = canonicalAppRouteUrl(ORIGIN, mode);
    assert.equal(new URL(link).searchParams.get("mode"), mode);
    assert.deepEqual(parseAppRoute(link), { kind: "mode", modeId: mode });
    assert.deepEqual(normalizeAppRoute(mode), { kind: "mode", modeId: mode });
  }
  assert.equal(normalizeAppRoute("arcade-rush"), null);
  assert.equal(normalizeAppRoute("daily"), null);
  assert.equal(parseAppRoute(ORIGIN + "?mode=arcade-rush").kind, "title");
  assert.throws(() => canonicalAppRouteUrl(ORIGIN, "arcade-rush"), TypeError);
});

test("canonical links preserve OAuth/developer query and fragment, strip stale Flow internals", () => {
  const input = ORIGIN + "?utm_source=friend&flowRelease=1&mode=flow&flowRun=1&flowUi=1&flowTheme=focus&flowSeed=abc&flowLength=deep#access_token=fake";
  const flow = new URL(canonicalAppRouteUrl(input, "flow"));
  assert.equal(flow.searchParams.get("mode"), "flow");
  assert.equal(flow.searchParams.get("flowTheme"), "focus");
  assert.equal(flow.searchParams.get("flowSeed"), "abc");
  assert.equal(flow.searchParams.get("flowLength"), "deep");
  assert.equal(flow.searchParams.has("flowRelease"), false);
  assert.equal(flow.searchParams.has("flowRun"), false);
  assert.equal(flow.searchParams.has("flowUi"), false);
  assert.equal(flow.searchParams.get("utm_source"), "friend");
  assert.equal(flow.hash, "#access_token=fake");
  const other = new URL(canonicalAppRouteUrl(flow.href, "practice"));
  for (const key of ["flowTheme", "flowSeed", "flowLength", "flowRelease"]) {
    assert.equal(other.searchParams.has(key), false);
  }
  assert.equal(other.searchParams.get("mode"), "practice");
  assert.equal(other.hash, flow.hash);
  const dev = new URL(canonicalAppRouteUrl(ORIGIN + "?dev=1&stage=5", "endless"));
  assert.equal(dev.searchParams.get("dev"), "1");
  assert.equal(dev.searchParams.get("stage"), "5");
});

test("title and Mode Select are deterministic and legacy Mode Select aliases normalize", () => {
  const modes = canonicalAppRouteUrl(ORIGIN + "?screen=mode-select&flowRelease=1", "modes");
  assert.deepEqual(parseAppRoute(modes), { kind: "modes" });
  assert.equal(new URL(modes).searchParams.get("screen"), "modes");
  const title = canonicalAppRouteUrl(modes, "title");
  assert.equal(title, ORIGIN);
  assert.deepEqual(parseAppRoute(title), { kind: "title" });
});

test("browser Back/Forward restores actual public route, never writes game saves to history", () => {
  const windowRef = fakeBrowser();
  const restored = [];
  const navigation = createAppRouteNavigation({
    windowRef,
    onRoute(route) { restored.push(route); },
  });
  assert.equal(navigation.mount(), true);
  assert.equal(windowRef.history.state.foreign, "retained");
  assert.equal(windowRef.history.state[APP_ROUTE_STATE_KEY], "title");
  assert.equal(navigation.navigate("modes"), true);
  assert.equal(navigation.navigate("campaign"), true);
  assert.equal(navigation.navigate("speed-test"), true);
  assert.equal(windowRef.entries.length, 4);
  assert.equal(windowRef.history.state[APP_ROUTE_STATE_KEY], "speed-test");
  assert.equal(windowRef.history.state.save, undefined);
  windowRef.history.back();
  assert.deepEqual(restored.at(-1), { kind: "mode", modeId: "campaign" });
  assert.equal(navigation.isRestoring(), false);
  windowRef.history.back();
  assert.deepEqual(restored.at(-1), { kind: "modes" });
  windowRef.history.forward();
  assert.deepEqual(restored.at(-1), { kind: "mode", modeId: "campaign" });
  assert.equal(navigation.current().modeId, "campaign");
  navigation.destroy();
  const count = restored.length;
  windowRef.history.back();
  assert.equal(restored.length, count, "destroyed navigation cannot capture browser history");
});

test("same-mode Flow navigation updates setup without extra entries", () => {
  const windowRef = fakeBrowser(ORIGIN + "?mode=flow&flowRelease=1&flowSeed=original");
  const navigation = createAppRouteNavigation({ windowRef });
  navigation.mount();
  assert.equal(windowRef.entries.length, 1, "deep links do not create a synthetic title entry");
  assert.equal(new URL(windowRef.location.href).searchParams.has("flowRelease"), false);
  assert.equal(windowRef.history.state[APP_ROUTE_STATE_KEY], "flow");
  const newUrl = ORIGIN + "?mode=flow&flowSeed=updated";
  windowRef.history.replaceState(windowRef.history.state, "", newUrl);
  assert.equal(navigation.navigate("flow"), true);
  assert.equal(windowRef.entries.length, 1);
  assert.equal(new URL(windowRef.location.href).searchParams.get("flowSeed"), "updated");
  assert.equal(navigation.navigate("modes", { replace: true }), true);
  assert.equal(windowRef.entries.length, 1);
});

test("PWA offline reload remains routable without ephemeral session/history data", () => {
  for (const mode of getAllModes().map(({ id }) => id)) {
    const url = canonicalAppRouteUrl(ORIGIN, mode);
    const browser = fakeBrowser(url);
    const navigation = createAppRouteNavigation({ windowRef: browser });
    assert.equal(navigation.mount(), true);
    assert.deepEqual(navigation.current(), { kind: "mode", modeId: mode });
    assert.equal(browser.entries.length, 1);
    assert.equal(browser.history.state[APP_ROUTE_STATE_KEY], mode);
    assert.equal(browser.history.state.session, undefined);
    assert.equal(browser.history.state.account, undefined);
    navigation.destroy();
  }
});

test("unavailable History API fails closed to existing native-back fallback", () => {
  const navigation = createAppRouteNavigation({ windowRef: {
    location: { href: ORIGIN }, history: { state: null },
    addEventListener() {},
  } });
  assert.equal(navigation.mount(), false);
  assert.equal(navigation.navigate("campaign"), false);
});

console.log("P2 five-mode deep-link, history, OAuth, legacy URL and PWA reload contracts passed.");
