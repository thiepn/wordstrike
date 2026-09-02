export const PUBLIC_BOARD_KEYS = Object.freeze([
  "campaign-highest-level-v1",
  "typing-60s-english200-v1",
  "typing-15s-english200-v1",
  "endless-v1",
  "daily-strike-v1",
  "arcade-rush-v1",
]);
export const LEADERBOARD_LIMIT = 100;
export const LEADERBOARD_RULES_VERSION = 1;
export const DAILY_CHALLENGE_VERSION = 1;
export const ARCADE_RUSH_BOARD_KEY = "arcade-rush-v1";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidChallengeDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateLeaderboardRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, code: "INVALID_REQUEST" };
  }
  const allowedKeys = new Set(["boardKey", "challengeDate"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return { valid: false, code: "INVALID_REQUEST" };
  }
  if (!PUBLIC_BOARD_KEYS.includes(body.boardKey)) {
    return { valid: false, code: "INVALID_BOARD" };
  }
  if (body.boardKey === "daily-strike-v1" && !isValidChallengeDate(body.challengeDate)) {
    return { valid: false, code: "INVALID_CHALLENGE_DATE" };
  }
  if (body.boardKey !== "daily-strike-v1" && body.challengeDate != null) {
    return { valid: false, code: "INVALID_REQUEST" };
  }
  return {
    valid: true,
    boardKey: body.boardKey,
    challengeDate: body.boardKey === "daily-strike-v1" ? body.challengeDate : null,
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

export function compareDailyLeaderboardRows(a, b) {
  if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? -1 : 1;
  const comparisons = a.completed
    ? [
      higher(a.score, b.score),
      lower(a.durationMs ?? a.duration_ms, b.durationMs ?? b.duration_ms),
      higher(a.accuracy, b.accuracy),
      higher(a.wordsCompleted ?? a.words_completed, b.wordsCompleted ?? b.words_completed),
    ]
    : [
      higher(a.wordsResolved ?? a.metrics?.wordsResolved, b.wordsResolved ?? b.metrics?.wordsResolved),
      higher(a.wordsCompleted ?? a.words_completed, b.wordsCompleted ?? b.words_completed),
      higher(a.score, b.score),
      higher(a.accuracy, b.accuracy),
      higher(a.durationMs ?? a.duration_ms, b.durationMs ?? b.duration_ms),
    ];
  return comparisons.find(Boolean) || finalTie(a, b);
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
  challengeDate = null,
  viewerUserId = null,
} = {}) {
  const comparator = boardKey === "daily-strike-v1"
    ? compareDailyLeaderboardRows
    : boardKey === ARCADE_RUSH_BOARD_KEY
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
    (boardKey !== ARCADE_RUSH_BOARD_KEY || row.completed === true) &&
    (
      boardKey !== "daily-strike-v1" ||
      (
        row.challengeDate === challengeDate &&
        number(row.challengeVersion) === DAILY_CHALLENGE_VERSION
      )
    )
  ));
  const best = new Map();
  for (const row of eligible) {
    const previous = best.get(row.userId);
    if (!previous || comparator(row, previous) < 0) best.set(row.userId, row);
  }
  const ranked = [...best.values()].sort(comparator).map((row, index) => ({ row, rank: index + 1 }));
  return Object.freeze({
    entries: Object.freeze(ranked.slice(0, LEADERBOARD_LIMIT).map(({ row, rank }) => publicEntry(row, rank, boardKey))),
    viewer: viewerUserId == null
      ? null
      : ranked.find(({ row }) => row.userId === viewerUserId)
        ? Object.freeze({
          rank: ranked.find(({ row }) => row.userId === viewerUserId).rank,
          entry: publicEntry(
            ranked.find(({ row }) => row.userId === viewerUserId).row,
            ranked.find(({ row }) => row.userId === viewerUserId).rank,
            boardKey,
          ),
        })
        : null,
  });
}
