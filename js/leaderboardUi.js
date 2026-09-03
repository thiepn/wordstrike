import {
  getLeaderboardSelection,
  LEADERBOARD_BOARDS,
  LEADERBOARD_CATEGORIES,
} from "./leaderboardService.js";

const app = () => document.querySelector("#app");
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function duration(value) {
  const ms = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1).padStart(4, "0");
  return minutes ? `${minutes}:${seconds}` : `${seconds}s`;
}

function boardKind(boardKey) {
  if (boardKey === LEADERBOARD_BOARDS.CAMPAIGN) return "campaign";
  if ([LEADERBOARD_BOARDS.TYPING_60, LEADERBOARD_BOARDS.TYPING_15].includes(boardKey)) return "typing";
  if (boardKey === LEADERBOARD_BOARDS.ARCADE_RUSH) return "arcade-rush";
  return "endless";
}

function metricText(entry, kind) {
  if (kind === "campaign") return `Level ${entry.level} · Grade ${entry.grade} · ${entry.accuracy.toFixed(1)}%`;
  if (kind === "typing") return `${entry.wpm.toFixed(1)} WPM · ${entry.accuracy.toFixed(1)}% · ${entry.rawWpm.toFixed(1)} raw`;
  if (kind === "arcade-rush") return `${entry.score.toLocaleString()} pts · ${entry.accuracy.toFixed(1)}% · ${duration(entry.durationMs)}`;
  return `Stage ${entry.stage} · ${entry.score.toLocaleString()} pts · ${entry.accuracy.toFixed(1)}%`;
}

function columns(kind) {
  if (kind === "campaign") return ["LEVEL", "GRADE", "ACCURACY"];
  if (kind === "typing") return ["WPM", "ACCURACY", "RAW WPM"];
  if (kind === "arcade-rush") return ["SCORE", "ACCURACY", "TIME"];
  return ["STAGE", "SCORE", "ACCURACY"];
}

function values(entry, kind) {
  if (kind === "campaign") return [entry.level, entry.grade, `${entry.accuracy.toFixed(1)}%`];
  if (kind === "typing") return [entry.wpm.toFixed(1), `${entry.accuracy.toFixed(1)}%`, entry.rawWpm.toFixed(1)];
  if (kind === "arcade-rush") return [entry.score.toLocaleString(), `${entry.accuracy.toFixed(1)}%`, duration(entry.durationMs)];
  return [entry.stage, entry.score.toLocaleString(), `${entry.accuracy.toFixed(1)}%`];
}

function rows(entries, viewer, kind) {
  if (!entries.length) return "";
  const labels = columns(kind);
  return `<div class="leaderboard-table" role="table" aria-label="Global leaderboard rankings">
    <div class="leaderboard-table-head" role="row"><span>RANK</span><span>PLAYER</span>${labels.map((label) => `<span>${label}</span>`).join("")}</div>
    ${entries.map((entry) => {
    const own = viewer?.rank === entry.rank && viewer?.entry?.username === entry.username;
    return `<div class="leaderboard-row ${own ? "viewer-row" : ""}" role="row" ${own ? 'aria-label="Your leaderboard rank"' : ""}>
      <strong class="leaderboard-rank">#${entry.rank}</strong>
      <span class="leaderboard-player">${escapeHtml(entry.username)}${own ? "<small>YOU</small>" : ""}</span>
      ${values(entry, kind).map((value) => `<span>${value}</span>`).join("")}
      <small class="leaderboard-mobile-metrics">${metricText(entry, kind)}</small>
    </div>`;
  }).join("")}
  </div>`;
}

function authenticationPanel(authState, profileState) {
  if (authState?.status !== "signed-in") {
    return `<section class="leaderboard-auth-prompt"><h2>SIGN IN FOR GLOBAL RANKS</h2>
      <p>View your personal rank and submit eligible scores.</p>
      <button class="arcade-button account-primary" data-action="leaderboard-google-sign-in">CONTINUE WITH GOOGLE</button></section>`;
  }
  if (!["idle", "loading"].includes(profileState?.status) && !profileState?.profile) {
    return `<section class="leaderboard-auth-prompt"><h2>PUBLIC USERNAME REQUIRED</h2>
      <p>Choose a public username to submit scores.</p>
      <button class="arcade-button account-primary" data-action="leaderboard-open-username">SET USERNAME</button></section>`;
  }
  return "";
}

function viewerPanel(authState, profileState, viewer, entries, kind) {
  if (authState?.status !== "signed-in" || !profileState?.profile) return "";
  if (!viewer) return `<section class="leaderboard-viewer"><h3>YOUR RANK</h3><p>You do not have a ranked result on this board yet.</p></section>`;
  if (entries.some((entry) => entry.rank === viewer.rank && entry.username === viewer.entry.username)) return "";
  return `<section class="leaderboard-viewer viewer-outside-top"><h3>YOUR RANK</h3>
    <strong>#${viewer.rank} &nbsp; ${escapeHtml(viewer.entry.username)}</strong>
    <p>${metricText(viewer.entry, kind)}</p></section>`;
}

function emptyModeLabel(kind) {
  if (kind === "typing") return "Typing Test";
  if (kind === "campaign") return "Campaign";
  if (kind === "arcade-rush") return "Arcade Rush";
  return "Endless";
}

function boardContent(state, authState, profileState) {
  const kind = boardKind(state.selectedBoardKey || state.selectedBoard);
  if (["idle", "loading"].includes(state.status)) return `<div class="leaderboard-status">Loading global rankings&hellip;</div>`;
  if (state.status === "offline") return `<div class="leaderboard-status"><strong>Global rankings are unavailable while offline.</strong><p>Local gameplay and records are unaffected.</p></div>`;
  if (state.status === "error") return `<div class="leaderboard-status"><strong>Unable to load global rankings.</strong><button class="arcade-button" data-action="leaderboard-refresh">RETRY</button></div>`;
  const empty = state.status === "empty"
    ? `<div class="leaderboard-status"><strong>No ranked ${emptyModeLabel(kind)} results yet.</strong></div>`
    : "";
  return `${state.status === "refreshing" ? '<div class="leaderboard-refreshing">Refreshing rankings&hellip;</div>' : ""}
    ${empty || rows(state.entries, state.viewer, kind)}
    ${viewerPanel(authState, profileState, state.viewer, state.entries, kind)}`;
}

export function renderLeaderboards(
  state,
  authState,
  profileState,
  notice = "",
) {
  const boardKey = state.selectedBoardKey || state.selectedBoard || LEADERBOARD_BOARDS.CAMPAIGN;
  const inferredSelection = getLeaderboardSelection(boardKey);
  const category = state.selectedCategory || inferredSelection.selectedCategory;
  const typingDuration = state.selectedTypingDuration || inferredSelection.selectedTypingDuration;
  const typing = category === LEADERBOARD_CATEGORIES.TYPING;
  const rush = boardKey === LEADERBOARD_BOARDS.ARCADE_RUSH;
  const meta = rush
    ? "RULES V1 // COMPLETED RUNS ONLY // ALL-TIME"
      : boardKey === LEADERBOARD_BOARDS.CAMPAIGN
        ? "HIGHEST SUCCESSFULLY COMPLETED LEVEL"
        : typing
          ? `ENGLISH 200 // ${typingDuration} SECONDS`
          : "STANDARD ENDLESS";
  const tabs = [
    [LEADERBOARD_CATEGORIES.CAMPAIGN, "CAMPAIGN", "leaderboard-select-campaign"],
    [LEADERBOARD_CATEGORIES.TYPING, "TYPING TEST", "leaderboard-select-typing"],
    [LEADERBOARD_CATEGORIES.ENDLESS, "ENDLESS", "leaderboard-select-endless"],
    [LEADERBOARD_CATEGORIES.ARCADE_RUSH, "ARCADE RUSH", "leaderboard-select-arcade-rush"],
  ];
  app().innerHTML = `<section class="screen leaderboards-screen"><main class="leaderboards-panel">
    <button type="button" class="screen-back-button" data-action="leaderboard-main-menu" aria-label="Go back">BACK</button>
    <div class="eyebrow">Public rankings</div><h1>GLOBAL LEADERBOARDS</h1>
    ${notice ? `<div class="leaderboard-notice" role="status">${escapeHtml(notice)}</div>` : ""}
    <button type="button" class="tutorial-help-button" data-action="leaderboard-help">? HOW TO PLAY</button>
    <nav class="leaderboard-tabs" aria-label="Leaderboard categories" role="tablist">${tabs.map(([value, label, action]) => (
    `<button role="tab" class="${category === value ? "selected" : ""}" data-action="${action}" aria-selected="${category === value}" tabindex="${category === value ? "0" : "-1"}">${label}</button>`
  )).join("")}</nav>
    ${typing ? `<nav class="leaderboard-duration-tabs" aria-label="Typing Test duration" role="tablist">
      <button role="tab" class="${typingDuration === 60 ? "selected" : ""}" data-action="leaderboard-typing-select-60" aria-selected="${typingDuration === 60}" tabindex="${typingDuration === 60 ? "0" : "-1"}">60 SECONDS</button>
      <button role="tab" class="${typingDuration === 15 ? "selected" : ""}" data-action="leaderboard-typing-select-15" aria-selected="${typingDuration === 15}" tabindex="${typingDuration === 15 ? "0" : "-1"}">15 SECONDS</button>
    </nav>` : ""}
    <div class="leaderboard-board-meta">${meta}</div>
    ${authenticationPanel(authState, profileState)}
    <section class="leaderboard-content">${boardContent(state, authState, profileState)}</section>
    <div class="leaderboard-actions">
      <button class="arcade-button" data-action="leaderboard-refresh" ${["loading", "refreshing"].includes(state.status) ? 'disabled aria-disabled="true"' : ""}>REFRESH</button>
      <button class="arcade-button" data-action="leaderboard-main-menu">MAIN MENU</button>
    </div>
  </main></section>`;
}
