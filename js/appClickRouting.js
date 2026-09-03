import { Screens } from "./state.js";

const RESULT_ACTIONS = Object.freeze({
  [Screens.TITLE]: Object.freeze({
    selector: ".menu-screen",
    actions: Object.freeze(["open-leaderboards"]),
    guardReadyAt: false,
  }),
  [Screens.LEADERBOARDS]: Object.freeze({
    selector: ".leaderboards-screen",
    actions: Object.freeze([
      "leaderboard-select-campaign",
      "leaderboard-select-typing",
      "leaderboard-select-endless",
      "leaderboard-typing-select-60",
      "leaderboard-typing-select-15",
      "leaderboard-google-sign-in",
      "leaderboard-open-username",
      "leaderboard-refresh",
      "leaderboard-main-menu",
      "leaderboard-help",
    ]),
    guardReadyAt: false,
  }),
  [Screens.ENDLESS_RESULTS]: Object.freeze({
    selector: ".endless-results-screen",
    actions: Object.freeze([
      "retry", "modes", "title", "submit-global-score", "retry-global-score",
      "view-endless-leaderboard", "open-account-settings", "result-google-sign-in",
    ]),
  }),
  [Screens.SPEED_TEST_RESULTS]: Object.freeze({
    selector: ".speed-results-screen",
    actions: Object.freeze([
      "submit-global-score", "retry-global-score", "result-google-sign-in",
      "open-account-settings", "view-typing-60-leaderboard", "view-typing-15-leaderboard",
    ]),
  }),
  [Screens.RESULTS]: Object.freeze({
    selector: ".results-screen",
    actions: Object.freeze([
      "submit-global-score", "retry-global-score", "result-google-sign-in",
      "open-account-settings", "view-campaign-leaderboard",
    ]),
  }),
  [Screens.PROFILE_STATS]: Object.freeze({
    selector: ".global-account",
    actions: Object.freeze([
      "auth-google-sign-in",
      "auth-sign-out",
      "leaderboard-username-check",
      "leaderboard-username-claim",
      "leaderboard-username-start-change",
      "leaderboard-username-save-change",
      "leaderboard-username-cancel-change",
    ]),
    guardReadyAt: false,
  }),
  [Screens.SETTINGS]: Object.freeze({
    selector: ".settings-screen",
    actions: Object.freeze([
      "settings-edit-name",
      "settings-save-name",
      "settings-cancel-name",
      "auth-google-sign-in",
      "auth-sign-out",
      "leaderboard-username-check",
      "leaderboard-username-claim",
      "leaderboard-username-start-change",
      "leaderboard-username-save-change",
      "leaderboard-username-cancel-change",
      "retry-pending-result",
      "discard-pending-result",
    ]),
    guardReadyAt: false,
  }),
});

const listenerRoots = new WeakSet();

export function resolveAppClickAction(event, {
  root,
  screen,
  readyAt = 0,
  now = 0,
} = {}) {
  if (!root || !event || (event.button != null && event.button !== 0)) {
    return null;
  }
  const config = RESULT_ACTIONS[screen];
  if (!config || (config.guardReadyAt !== false && now < readyAt)) return null;
  const actionElement = event.target?.closest?.("[data-action]");
  if (!actionElement || !root.contains?.(actionElement)) return null;
  if (
    actionElement.disabled === true ||
    actionElement.getAttribute?.("aria-disabled") === "true" ||
    actionElement.closest?.("[hidden]") ||
    actionElement.closest?.('[aria-hidden="true"]')
  ) {
    return null;
  }
  const screenElement = actionElement.closest?.(config.selector);
  if (!screenElement || !root.contains?.(screenElement)) return null;
  const action = actionElement.dataset?.action;
  return config.actions.includes(action) ? action : null;
}

export const resolveResultClickAction = resolveAppClickAction;

export function attachAppClickListener(root, listener) {
  if (!root?.addEventListener || listenerRoots.has(root)) return false;
  root.addEventListener("click", listener);
  listenerRoots.add(root);
  return true;
}
