import { getSupabaseClient } from "./supabaseClient.js";
import { getUtcDateKey } from "./dailyDate.js";
import {
  ARCADE_RUSH_LEADERBOARD_BOARD_KEY,
  ARCADE_RUSH_LEADERBOARD_CATEGORY,
  ARCADE_RUSH_LEADERBOARD_RULES_VERSION,
} from "./arcadeRushLeaderboard.js";

export const LEADERBOARD_BOARDS = Object.freeze({
  CAMPAIGN: "campaign-highest-level-v1",
  TYPING_60: "typing-60s-english200-v1",
  TYPING_15: "typing-15s-english200-v1",
  ENDLESS: "endless-v1",
  DAILY: "daily-strike-v1",
  ARCADE_RUSH: ARCADE_RUSH_LEADERBOARD_BOARD_KEY,
});

export const LEADERBOARD_CATEGORIES = Object.freeze({
  CAMPAIGN: "campaign",
  TYPING: "typing",
  ENDLESS: "endless",
  DAILY: "daily",
  ARCADE_RUSH: ARCADE_RUSH_LEADERBOARD_CATEGORY,
});

const VALID_BOARDS = Object.freeze(Object.values(LEADERBOARD_BOARDS));
const VALID_CATEGORIES = Object.freeze(Object.values(LEADERBOARD_CATEGORIES));
const CACHE_TTL_MS = 30000;

export const EXPECTED_LEADERBOARD_RULES_VERSIONS = Object.freeze({
  [LEADERBOARD_BOARDS.CAMPAIGN]: 1,
  [LEADERBOARD_BOARDS.TYPING_60]: 1,
  [LEADERBOARD_BOARDS.TYPING_15]: 1,
  [LEADERBOARD_BOARDS.ENDLESS]: 1,
  [LEADERBOARD_BOARDS.DAILY]: 1,
  [LEADERBOARD_BOARDS.ARCADE_RUSH]: ARCADE_RUSH_LEADERBOARD_RULES_VERSION,
});

export function isLeaderboardCacheStateCurrent(boardKey, cachedState) {
  return (
    cachedState?.board?.boardKey === boardKey &&
    Number(cachedState.board.rulesVersion) === EXPECTED_LEADERBOARD_RULES_VERSIONS[boardKey]
  );
}

export function getLeaderboardSelection(boardKey) {
  if (boardKey === LEADERBOARD_BOARDS.TYPING_15) {
    return { selectedCategory: LEADERBOARD_CATEGORIES.TYPING, selectedTypingDuration: 15 };
  }
  if (boardKey === LEADERBOARD_BOARDS.TYPING_60) {
    return { selectedCategory: LEADERBOARD_CATEGORIES.TYPING, selectedTypingDuration: 60 };
  }
  if (boardKey === LEADERBOARD_BOARDS.ENDLESS) {
    return { selectedCategory: LEADERBOARD_CATEGORIES.ENDLESS, selectedTypingDuration: 60 };
  }
  if (boardKey === LEADERBOARD_BOARDS.DAILY) {
    return { selectedCategory: LEADERBOARD_CATEGORIES.DAILY, selectedTypingDuration: 60 };
  }
  if (boardKey === LEADERBOARD_BOARDS.ARCADE_RUSH) {
    return { selectedCategory: LEADERBOARD_CATEGORIES.ARCADE_RUSH, selectedTypingDuration: 60 };
  }
  return { selectedCategory: LEADERBOARD_CATEGORIES.CAMPAIGN, selectedTypingDuration: 60 };
}

export function getBoardKeyForSelection(category, typingDuration = 60) {
  if (category === LEADERBOARD_CATEGORIES.TYPING) {
    return typingDuration === 15 ? LEADERBOARD_BOARDS.TYPING_15 : LEADERBOARD_BOARDS.TYPING_60;
  }
  if (category === LEADERBOARD_CATEGORIES.ENDLESS) return LEADERBOARD_BOARDS.ENDLESS;
  if (category === LEADERBOARD_CATEGORIES.DAILY) return LEADERBOARD_BOARDS.DAILY;
  if (category === LEADERBOARD_CATEGORIES.ARCADE_RUSH) return LEADERBOARD_BOARDS.ARCADE_RUSH;
  return LEADERBOARD_BOARDS.CAMPAIGN;
}

// AR14 public order. Daily remains addressable by exact legacy board key until
// AR15 retires the backend, but it is no longer part of public keyboard tabs.
const PUBLIC_KEYBOARD_CATEGORY_ORDER = Object.freeze([
  LEADERBOARD_CATEGORIES.CAMPAIGN,
  LEADERBOARD_CATEGORIES.TYPING,
  LEADERBOARD_CATEGORIES.ENDLESS,
  LEADERBOARD_CATEGORIES.ARCADE_RUSH,
]);

export function getLeaderboardKeyboardTarget(state, key) {
  const selection = getLeaderboardSelection(state?.selectedBoardKey || state?.selectedBoard);
  const category = state?.selectedCategory || selection.selectedCategory;
  const typingDuration = state?.selectedTypingDuration || selection.selectedTypingDuration;
  if (category === LEADERBOARD_CATEGORIES.TYPING && ["ArrowUp", "ArrowDown"].includes(key)) {
    return getBoardKeyForSelection(category, typingDuration === 60 ? 15 : 60);
  }
  const order = PUBLIC_KEYBOARD_CATEGORY_ORDER;
  let index = order.indexOf(category);
  // Legacy Daily selections normalize to the new public fourth slot.
  if (index < 0 && category === LEADERBOARD_CATEGORIES.DAILY) index = order.length - 1;
  index = Math.max(0, index);
  if (key === "ArrowLeft") index = (index - 1 + order.length) % order.length;
  else if (key === "ArrowRight") index = (index + 1) % order.length;
  else if (key === "Home") index = 0;
  else if (key === "End") index = order.length - 1;
  else return null;
  return getBoardKeyForSelection(order[index], 60);
}

const safeEntry = (entry) => Object.freeze({
  rank: Math.max(1, Number(entry?.rank) || 1),
  username: String(entry?.username || ""),
  level: entry?.level == null ? null : Math.max(1, Number(entry.level) || 1),
  grade: entry?.grade == null ? null : String(entry.grade),
  wpm: entry?.wpm == null ? null : Math.max(0, Number(entry.wpm) || 0),
  rawWpm: entry?.rawWpm == null ? null : Math.max(0, Number(entry.rawWpm) || 0),
  stage: entry?.stage == null ? null : Math.max(0, Number(entry.stage) || 0),
  score: entry?.score == null ? null : Math.max(0, Number(entry.score) || 0),
  accuracy: Math.max(0, Math.min(100, Number(entry?.accuracy) || 0)),
  durationMs: entry?.durationMs == null && entry?.activeDurationMs == null
    ? null
    : Math.max(0, Number(entry.durationMs ?? entry.activeDurationMs) || 0),
  completed: entry?.completed === true,
  submittedAt: String(entry?.submittedAt || ""),
});

const safeViewer = (viewer) => viewer?.entry ? Object.freeze({
  rank: Math.max(1, Number(viewer.rank) || 1),
  entry: safeEntry({ ...viewer.entry, rank: viewer.rank }),
}) : null;

const makeState = ({
  status = "idle",
  selectedCategory = LEADERBOARD_CATEGORIES.CAMPAIGN,
  selectedTypingDuration = 60,
  selectedBoardKey = null,
  selectedBoard = null,
  board = null,
  entries = [],
  viewer = null,
  error = null,
  lastUpdatedAt = null,
} = {}) => {
  const category = VALID_CATEGORIES.includes(selectedCategory)
    ? selectedCategory
    : getLeaderboardSelection(selectedBoardKey || selectedBoard).selectedCategory;
  const typingDuration = selectedTypingDuration === 15 ? 15 : 60;
  const inferredBoard = selectedBoardKey || selectedBoard || getBoardKeyForSelection(category, typingDuration);
  const boardKey = VALID_BOARDS.includes(inferredBoard)
    ? inferredBoard
    : getBoardKeyForSelection(category, typingDuration);
  const selection = getLeaderboardSelection(boardKey);
  return Object.freeze({
    status,
    selectedCategory: selection.selectedCategory,
    selectedTypingDuration: selection.selectedTypingDuration,
    selectedBoardKey: boardKey,
    selectedBoard: boardKey,
    board: board ? Object.freeze({
      boardKey: String(board.boardKey || boardKey),
      displayName: String(board.displayName || ""),
      rulesVersion: Math.max(1, Number(board.rulesVersion) || 1),
      challengeDate: board.challengeDate ?? null,
    }) : null,
    entries: Object.freeze((Array.isArray(entries) ? entries : []).slice(0, 100).map(safeEntry)),
    viewer: safeViewer(viewer),
    error: error ? Object.freeze({ message: "Unable to load global rankings." }) : null,
    lastUpdatedAt: Number.isFinite(Number(lastUpdatedAt)) ? Number(lastUpdatedAt) : null,
  });
};

async function functionErrorPayload(error) {
  try {
    if (typeof error?.context?.json === "function") return await error.context.json();
  } catch {
    // Use the safe generic error below.
  }
  return null;
}

export function createLeaderboardService({
  getClient = getSupabaseClient,
  getDateKey = getUtcDateKey,
  now = () => Date.now(),
  isOnline = () => globalThis.navigator?.onLine !== false,
} = {}) {
  let state = makeState();
  let requestSequence = 0;
  const listeners = new Set();
  const cache = new Map();
  const inFlight = new Map();

  const publish = (next) => {
    state = makeState(next);
    for (const listener of listeners) listener(state);
    return state;
  };
  const normalizeBoardKey = (boardKey) => (
    boardKey === LEADERBOARD_BOARDS.DAILY
      ? LEADERBOARD_BOARDS.ARCADE_RUSH
      : boardKey
  );
  const requestKey = (boardKey) => boardKey === LEADERBOARD_BOARDS.DAILY
    ? `${boardKey}:${getDateKey()}`
    : boardKey;

  const load = (requestedBoardKey, { force = false } = {}) => {
    const boardKey = normalizeBoardKey(requestedBoardKey);
    if (!VALID_BOARDS.includes(boardKey)) return Promise.resolve(state);
    const key = requestKey(boardKey);
    if (inFlight.has(key)) return inFlight.get(key);
    const selection = getLeaderboardSelection(boardKey);
    const cached = cache.get(key);
    const currentCache = cached && isLeaderboardCacheStateCurrent(boardKey, cached.state);
    if (cached && !currentCache) cache.delete(key);
    if (!force && currentCache && now() - cached.cachedAt < CACHE_TTL_MS) {
      return Promise.resolve(publish({ ...cached.state, ...selection, selectedBoardKey: boardKey }));
    }
    const client = getClient();
    if (!isOnline() || !client?.functions?.invoke) {
      return Promise.resolve(publish({ status: "offline", ...selection, selectedBoardKey: boardKey }));
    }
    const requestId = ++requestSequence;
    const refreshing = state.selectedBoardKey === boardKey && state.entries.length > 0;
    publish({ ...state, status: refreshing ? "refreshing" : "loading", ...selection, selectedBoardKey: boardKey, error: null });
    const body = boardKey === LEADERBOARD_BOARDS.DAILY
      ? { boardKey, challengeDate: getDateKey() }
      : { boardKey };
    const promise = (async () => {
      try {
        const { data, error } = await client.functions.invoke("get-leaderboard", { body });
        let payload = data;
        if (!payload?.ok && error) payload = await functionErrorPayload(error);
        if (requestId !== requestSequence || state.selectedBoardKey !== boardKey) return state;
        if (!payload?.ok) return publish({ status: "error", ...selection, selectedBoardKey: boardKey, error: true });
        const next = makeState({
          status: payload.data?.entries?.length ? "ready" : "empty",
          ...selection,
          selectedBoardKey: boardKey,
          board: payload.data?.board,
          entries: payload.data?.entries,
          viewer: payload.data?.viewer,
          lastUpdatedAt: now(),
        });
        cache.set(key, { state: next, cachedAt: now() });
        return publish(next);
      } catch {
        if (requestId !== requestSequence || state.selectedBoardKey !== boardKey) return state;
        return publish({ status: isOnline() ? "error" : "offline", ...selection, selectedBoardKey: boardKey, error: true });
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, promise);
    return promise;
  };

  const selectBoard = (requestedBoardKey) => {
    const boardKey = normalizeBoardKey(requestedBoardKey);
    if (!VALID_BOARDS.includes(boardKey)) return Promise.resolve(state);
    if (state.selectedBoardKey === boardKey && ["loading", "refreshing", "ready", "empty"].includes(state.status)) {
      return inFlight.get(requestKey(boardKey)) || Promise.resolve(state);
    }
    requestSequence += 1;
    return load(boardKey);
  };

  return Object.freeze({
    initializeLeaderboards(boardKey = LEADERBOARD_BOARDS.CAMPAIGN) { return load(boardKey); },
    getLeaderboardState: () => state,
    subscribeToLeaderboards(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    selectLeaderboardBoard: selectBoard,
    selectLeaderboardCategory(category) {
      if (!VALID_CATEGORIES.includes(category)) return Promise.resolve(state);
      const publicCategory = category === LEADERBOARD_CATEGORIES.DAILY
        ? LEADERBOARD_CATEGORIES.ARCADE_RUSH
        : category;
      return selectBoard(getBoardKeyForSelection(publicCategory, 60));
    },
    selectTypingDuration(duration) {
      if (![15, 60].includes(duration)) return Promise.resolve(state);
      return selectBoard(getBoardKeyForSelection(LEADERBOARD_CATEGORIES.TYPING, duration));
    },
    refreshLeaderboard() { return load(state.selectedBoardKey, { force: true }); },
    invalidateLeaderboardBoard(boardKey) {
      const normalized = normalizeBoardKey(boardKey);
      if (!VALID_BOARDS.includes(normalized)) return false;
      cache.delete(requestKey(normalized));
      return true;
    },
    resetLeaderboardState() {
      requestSequence += 1;
      inFlight.clear();
      cache.clear();
      return publish(makeState());
    },
  });
}

const leaderboardService = createLeaderboardService();
export const initializeLeaderboards = leaderboardService.initializeLeaderboards;
export const getLeaderboardState = leaderboardService.getLeaderboardState;
export const subscribeToLeaderboards = leaderboardService.subscribeToLeaderboards;
export const selectLeaderboardBoard = leaderboardService.selectLeaderboardBoard;
export const selectLeaderboardCategory = leaderboardService.selectLeaderboardCategory;
export const selectTypingDuration = leaderboardService.selectTypingDuration;
export const refreshLeaderboard = leaderboardService.refreshLeaderboard;
export const invalidateLeaderboardBoard = leaderboardService.invalidateLeaderboardBoard;
export const resetLeaderboardState = leaderboardService.resetLeaderboardState;
