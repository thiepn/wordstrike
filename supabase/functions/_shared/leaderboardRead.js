export const PUBLIC_BOARD_KEYS = Object.freeze([
  "campaign-highest-level-v1",
  "typing-60s-english200-v1",
  "typing-15s-english200-v1",
  "endless-v1",
  "arcade-rush-v1",
]);
export const LEADERBOARD_LIMIT = 100;
export const LEADERBOARD_RULES_VERSION = 1;
export const ARCADE_RUSH_BOARD_KEY = "arcade-rush-v1";

const RETIRED_DAILY_BOARD_KEY = "daily-strike-v1";

export function validateLeaderboardRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, code: "INVALID_REQUEST" };
  }
  if (body.boardKey === RETIRED_DAILY_BOARD_KEY) {
    return { valid: false, code: "INVALID_BOARD" };
  }
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, "boardKey")) {
    return { valid: false, code: "INVALID_REQUEST" };
  }
  if (!PUBLIC_BOARD_KEYS.includes(body.boardKey)) {
    return { valid: false, code: "INVALID_BOARD" };
  }
  return {
    valid: true,
    boardKey: body.boardKey,
    challengeDate: null,
  };
}

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const lower = (a, b) => number(a) === number(b) ? 0 : number(a) < number(b) ? -1 : 1;
const higher = (a, b) => number(a) === number(b) ? 0 : number(a) > number(b) ? -1 : 1;

function finalTie(a, b) {
  const submitted = String(a.submittedAt || a.submitted_at || "")
    .localeCompare(String(b.submittedAt || b.submitted_at || ""));
  return submitted || String(a.id || "").localeCompare(String(b.id || ""));
}

export function compareEndlessLeaderboardRows(a, b) {
  return [
    higher(a.stage, b.stage),
    higher(a.score, b.score),
    higher(a.wordsCompleted ?? a.words_completed, b.wordsCompleted ?? b.words_completed),
    higher(a.accuracy, b.accuracy),
  ].find(Boolean) || finalTie(a, b);
}

export function compareArcadeRushLeaderboardRows(a, b) {
  if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? -1 : 1;
  return [
    higher(a.score, b.score),
    higher(a.accuracy, b.accuracy),
    lower(a.durationMs ?? a.duration_ms, b.durationMs ?? b.duration_ms),
  ].find(Boolean) || finalTie(a, b);
}

const GRADE_RANK = Object.freeze({ D: 1, C: 2, B: 3, A: 4, S: 5 });

export function compareCampaignLeaderboardRows(a, b) {
  return [
    higher(a.level, b.level),
    higher(GRADE_RANK[a.grade], GRADE_RANK[b.grade]),
    higher(a.accuracy, b.accuracy),
  ].find(Boolean) || finalTie(a, b);
}

export function compareTypingLeaderboardRows(a, b) {
  return [
    higher(a.wpm, b.wpm),
    higher(a.accuracy, b.accuracy),
    higher(a.rawWpm ?? a.raw_wpm, b.rawWpm ?? b.raw_wpm),
  ].find(Boolean) || finalTie(a, b);
}

function publicEntry(row, rank, boardKey) {
  const common = {
    rank,
    username: String(row.username),
    accuracy: number(row.accuracy),
    submittedAt: String(row.submittedAt || row.submitted_at || ""),
  };
  if (boardKey === "campaign-highest-level-v1") {
    return Object.freeze({ ...common, level: number(row.level), grade: String(row.grade) });
  }
  if (boardKey.startsWith("typing-")) {
    return Object.freeze({
      ...common,
      wpm: number(row.wpm),
      rawWpm: number(row.rawWpm ?? row.raw_wpm),
    });
  }
  return Object.freeze({
    ...common,
    stage: row.stage == null ? null : number(row.stage),
    score: number(row.score),
    durationMs: row.durationMs == null && row.duration_ms == null
      ? null
      : number(row.durationMs ?? row.duration_ms),
    completed: row.completed === true,
  });
}

export function rankLeaderboardRows(rows, {
  boardKey,
  viewerUserId = null,
} = {}) {
  if (!PUBLIC_BOARD_KEYS.includes(boardKey)) {
    return Object.freeze({ entries: Object.freeze([]), viewer: null });
  }
  const comparator = boardKey === ARCADE_RUSH_BOARD_KEY
    ? compareArcadeRushLeaderboardRows
    : boardKey === "endless-v1"
      ? compareEndlessLeaderboardRows
      : boardKey === "campaign-highest-level-v1"
        ? compareCampaignLeaderboardRows
        : compareTypingLeaderboardRows;
  const eligible = (Array.isArray(rows) ? rows : []).filter((row) => (
    row.boardKey === boardKey &&
    number(row.rulesVersion) === LEADERBOARD_RULES_VERSION &&
    row.moderationStatus === "accepted" &&
    typeof row.username === "string" && row.username.length > 0 &&
    (boardKey !== "campaign-highest-level-v1" || row.completed === true) &&
    (!boardKey.startsWith("typing-") || row.completed === true) &&
    (boardKey !== ARCADE_RUSH_BOARD_KEY || row.completed === true)
  ));
  const best = new Map();
  for (const row of eligible) {
    const previous = best.get(row.userId);
    if (!previous || comparator(row, previous) < 0) best.set(row.userId, row);
  }
  const ranked = [...best.values()].sort(comparator).map((row, index) => ({ row, rank: index + 1 }));
  const viewerRow = viewerUserId == null
    ? null
    : ranked.find(({ row }) => row.userId === viewerUserId) || null;
  return Object.freeze({
    entries: Object.freeze(ranked.slice(0, LEADERBOARD_LIMIT).map(({ row, rank }) => publicEntry(row, rank, boardKey))),
    viewer: viewerRow
      ? Object.freeze({
        rank: viewerRow.rank,
        entry: publicEntry(viewerRow.row, viewerRow.rank, boardKey),
      })
      : null,
  });
}
