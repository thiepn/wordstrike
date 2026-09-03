import {
  getLeaderboardSelection,
  LEADERBOARD_CATEGORIES,
} from "./leaderboardService.js";

export const LEADERBOARD_RETURN_STORAGE_KEY = "wordstrike_leaderboard_auth_return_v1";
const LEGACY_DAILY_CATEGORY = "daily";
const CATEGORIES = new Set([...Object.values(LEADERBOARD_CATEGORIES), LEGACY_DAILY_CATEGORY]);

export function validateLeaderboardReturnState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).some((key) => !["screen", "selectedCategory", "typingDuration"].includes(key))) return null;
  if (value.screen === "title" && Object.keys(value).length === 1) {
    return Object.freeze({ screen: "title" });
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
  return Object.freeze({ screen: "leaderboards", selectedCategory: normalizedCategory, typingDuration });
}

export function leaderboardReturnStateForBoard(boardKey) {
  const selection = getLeaderboardSelection(boardKey);
  const selectedCategory = selection.selectedCategory;
  return Object.freeze({
    screen: "leaderboards",
    selectedCategory,
    typingDuration: selection.selectedTypingDuration,
  });
}

export function saveLeaderboardReturnState(value, storage = globalThis.sessionStorage) {
  const valid = validateLeaderboardReturnState(value);
  if (!valid || !storage?.setItem) return false;
  try {
    storage.setItem(LEADERBOARD_RETURN_STORAGE_KEY, JSON.stringify(valid));
    return true;
  } catch {
    return false;
  }
}

export function consumeLeaderboardReturnState(storage = globalThis.sessionStorage) {
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
