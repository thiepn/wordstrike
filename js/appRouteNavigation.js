import { getEnabledModes } from "./modes.js";

export const APP_ROUTE_STATE_KEY = "__wordstrikeRouteV1";
const ROUTE_MODES = new Set(getEnabledModes().map(({ id }) => id));
const FLOW_FLAGS = Object.freeze([
  "flowRelease", "flowRun", "flowUi", "flowUx", "flowModifiers",
  "flowAdaptive", "flowIntegration", "flowCategory", "flowDifficulty",
  "flowModifierIds", "flowWeaknesses", "flowResumeAdaptive",
  "flowUiStart", "flowCatalog", "flowPassage",
]);
const FLOW_SETTINGS = Object.freeze(["flowTheme", "flowLength", "flowSeed"]);

function locationUrl(locationLike) {
  if (locationLike instanceof URL) return new URL(locationLike.href);
  if (typeof locationLike === "string") return new URL(locationLike, "https://wordstrike.invalid/");
  return new URL(locationLike?.href || "https://wordstrike.invalid/");
}

export function parseAppRoute(locationLike) {
  const url = locationUrl(locationLike);
  const mode = url.searchParams.get("mode");
  if (ROUTE_MODES.has(mode)) return Object.freeze({ kind: "mode", modeId: mode });
  if (url.searchParams.get("screen") === "modes" || url.searchParams.get("screen") === "mode-select") {
    return Object.freeze({ kind: "modes" });
  }
  return Object.freeze({ kind: "title" });
}

export function normalizeAppRoute(route) {
  if (typeof route === "string") {
    if (route === "title" || route === "modes") return Object.freeze({ kind: route });
    if (ROUTE_MODES.has(route)) return Object.freeze({ kind: "mode", modeId: route });
  }
  if (route?.kind === "mode" && ROUTE_MODES.has(route.modeId)) {
    return Object.freeze({ kind: "mode", modeId: route.modeId });
  }
  if (route?.kind === "title" || route?.kind === "modes") {
    return Object.freeze({ kind: route.kind });
  }
  return null;
}

export function canonicalAppRouteUrl(locationLike, route) {
  const normalized = normalizeAppRoute(route);
  if (!normalized) throw new TypeError("Invalid public WordStrike route");
  const url = locationUrl(locationLike);
  url.searchParams.delete("mode");
  url.searchParams.delete("screen");
  for (const flag of FLOW_FLAGS) url.searchParams.delete(flag);
  if (normalized.kind !== "mode" || normalized.modeId !== "flow") {
    for (const setting of FLOW_SETTINGS) url.searchParams.delete(setting);
  }
  if (normalized.kind === "modes") url.searchParams.set("screen", "modes");
  if (normalized.kind === "mode") url.searchParams.set("mode", normalized.modeId);
  // Do not change hash or unrelated parameters: OAuth, accessibility and
  // developer settings must not be stripped by a navigation-only operation.
  return url.href;
}

export function createAppRouteNavigation({ windowRef = globalThis.window, onRoute } = {}) {
  const history = windowRef?.history;
  let mounted = false;
  let restoring = false;
  let current = null;

  function routeState(route) {
    const oldState = history?.state && typeof history.state === "object" ? history.state : {};
    const { __wordstrikeNativeBack: _oldGuard, ...other } = oldState;
    return { ...other, [APP_ROUTE_STATE_KEY]: route.kind === "mode" ? route.modeId : route.kind };
  }

  function getCurrentRoute() {
    return parseAppRoute(windowRef.location);
  }

  function setRoute(route, { replace = false } = {}) {
    const next = normalizeAppRoute(route);
    if (!mounted || !next) return false;
    const nextUrl = canonicalAppRouteUrl(windowRef.location, next);
    const oldRoute = getCurrentRoute();
    const sameRoute = oldRoute.kind === next.kind && oldRoute.modeId === next.modeId;
    if (sameRoute && nextUrl === windowRef.location.href) return true;
    try {
      // An updated Flow seed/setup is the same mode, not another history entry.
      if (replace || sameRoute) history.replaceState(routeState(next), "", nextUrl);
      else history.pushState(routeState(next), "", nextUrl);
      current = next;
      return true;
    } catch {
      return false;
    }
  }

  function handlePopState() {
    if (!mounted || restoring) return;
    const next = getCurrentRoute();
    current = next;
    restoring = true;
    try {
      onRoute?.(next);
      // Correct legacy aliases without an extra Back/Forward entry.
      const canonicalUrl = canonicalAppRouteUrl(windowRef.location, next);
      if (canonicalUrl !== windowRef.location.href) {
        history.replaceState(routeState(next), "", canonicalUrl);
      }
    } catch (error) {
      console.error("WordStrike route restoration failed", error);
    } finally {
      restoring = false;
    }
  }

  return Object.freeze({
    mount() {
      if (mounted) return true;
      if (!history || typeof history.replaceState !== "function"
        || typeof history.pushState !== "function"
        || typeof windowRef?.addEventListener !== "function"
        || !windowRef?.location?.href) return false;
      try {
        const initial = getCurrentRoute();
        history.replaceState(
          routeState(initial), "",
          canonicalAppRouteUrl(windowRef.location, initial),
        );
        current = initial;
        windowRef.addEventListener("popstate", handlePopState);
        mounted = true;
        return true;
      } catch {
        return false;
      }
    },
    navigate: setRoute,
    current: () => current || getCurrentRoute(),
    isRestoring: () => restoring,
    destroy() {
      if (!mounted) return false;
      mounted = false;
      windowRef.removeEventListener?.("popstate", handlePopState);
      return true;
    },
    isMounted: () => mounted,
  });
}
