import {
  getLeaderboardSelection,
  LEADERBOARD_CATEGORIES,
} from "./leaderboardService.js";
import { getSessionBrowserStorage } from "./browserStorage.js";

export const LEADERBOARD_RETURN_STORAGE_KEY = "wordstrike_leaderboard_auth_return_v1";
const LEGACY_DAILY_CATEGORY = "daily";
const CATEGORIES = new Set([...Object.values(LEADERBOARD_CATEGORIES), LEGACY_DAILY_CATEGORY]);

export function validateLeaderboardReturnState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).some((key) => !["screen", "selectedCategory", "typingDuration", "flowLength"].includes(key))) return null;
  if (["title", "campaign"].includes(value.screen) && Object.keys(value).length === 1) {
    return Object.freeze({ screen: value.screen });
  }
  if (value.screen !== "leaderboards" || !CATEGORIES.has(value.selectedCategory)) return null;
  // AR14 redirects any pre-cutover Daily OAuth return to the replacement board.
  const normalizedCategory = value.selectedCategory === LEGACY_DAILY_CATEGORY
    ? LEADERBOARD_CATEGORIES.ARCADE_RUSH
    : value.selectedCategory;
  const typingDuration = normalizedCategory === LEADERBOARD_CATEGORIES.TYPING
    ? value.typingDuration === 15 ? 15 : value.typingDuration === 60 ? 60 : null
    : 60;
  if (typingDuration == null) return null;
  if (normalizedCategory === LEADERBOARD_CATEGORIES.FLOW) {
    const flowLength = ["quick", "standard", "long"].includes(value.flowLength) ? value.flowLength : "standard";
    return Object.freeze({ screen: "leaderboards", selectedCategory: normalizedCategory, typingDuration, flowLength });
  }
  return Object.freeze({ screen: "leaderboards", selectedCategory: normalizedCategory, typingDuration });
}

export function leaderboardReturnStateForBoard(boardKey) {
  const selection = getLeaderboardSelection(boardKey);
  const selectedCategory = selection.selectedCategory;
  return Object.freeze({
    screen: "leaderboards",
    selectedCategory,
    typingDuration: selection.selectedTypingDuration,
    ...(selection.selectedFlowLength ? { flowLength: selection.selectedFlowLength } : {}),
  });
}

export function saveLeaderboardReturnState(value, storage = getSessionBrowserStorage()) {
  const valid = validateLeaderboardReturnState(value);
  if (!valid || !storage?.setItem) return false;
  try {
    storage.setItem(LEADERBOARD_RETURN_STORAGE_KEY, JSON.stringify(valid));
    return true;
  } catch {
    return false;
  }
}

export function consumeLeaderboardReturnState(storage = getSessionBrowserStorage()) {
  if (!storage?.getItem || !storage?.removeItem) return null;
  let value = null;
  try {
    const raw = storage.getItem(LEADERBOARD_RETURN_STORAGE_KEY);
    storage.removeItem(LEADERBOARD_RETURN_STORAGE_KEY);
    value = raw ? JSON.parse(raw) : null;
  } catch {
    try { storage.removeItem(LEADERBOARD_RETURN_STORAGE_KEY); } catch { /* Ignore storage failure. */ }
  }
  return validateLeaderboardReturnState(value);
}
