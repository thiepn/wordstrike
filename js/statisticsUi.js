import {
  EMPTY_STAT,
  formatCompactNumber,
  formatDateTime,
  formatDuration,
  formatPercentage,
  formatRecordValue,
} from "./statisticsFormat.js";
import { getRecentSessionStatistics } from "./statistics.js";
import {
  canChangeLeaderboardUsername,
  formatUsernameChangeDate,
  validateLeaderboardUsername,
} from "./leaderboardUsername.js";

export const STATISTICS_TABS = Object.freeze([
  "OVERVIEW",
  "CAMPAIGN",
  "TYPING TEST",
  "ENDLESS",
  "ARCADE RUSH",
  "RECENT",
  "PROFILE",
]);

const app = () => document.querySelector("#app");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function metric(label, value, secondary = false) {
  return `<div class="profile-metric ${secondary ? "secondary" : ""}">
    <span>${label}</span><strong>${value ?? EMPTY_STAT}</strong>
  </div>`;
}

function emptyState(text) {
  return `<div class="profile-empty">${text}</div>`;
}

function modeLabel(modeId) {
  return {
    campaign: "CAMPAIGN",
    "speed-test": "TYPING TEST",
    endless: "ENDLESS",
    "arcade-rush": "ARCADE RUSH",
  }[modeId] || String(modeId || "UNKNOWN").toUpperCase();
}

function rushRecentDetails(row) {
  const rush = row.arcadeRush;
  if (!rush) return "";
  const boss = rush.bossDefeated ? "BOSS DEFEATED" : "BOSS NOT DEFEATED";
  return `<span class="recent-session-detail">${rush.wavesCompleted} WAVES · ${boss} · CORE ${rush.integrityRemaining}/5 · COMBO ${formatCompactNumber(rush.maxCombo)} · RULES ${rush.rulesLabel}</span>`;
}

function recentRows(rows) {
  if (!rows.length) return emptyState("NO RECENT SESSIONS");
  return `<div class="recent-session-list">${rows.map((row) => `
    <article class="recent-session-row">
      <div><time>${formatDateTime(row.endedAt)}</time><strong>${modeLabel(row.modeId)}</strong></div>
      <div><b>${escapeHtml(row.primaryMetric || (row.success ? "COMPLETE" : "FAILED"))}</b>
        <span>${formatPercentage(row.accuracy)} · ${formatRecordValue(row.wpm, (value) => `${Math.round(value)} WPM`)} · ${formatDuration(row.activeDurationMs)}</span>
        ${rushRecentDetails(row)}</div>
    </article>`).join("")}</div>`;
}

function renderOverview(snapshot) {
  const data = snapshot.overview;
  const lifetime = data.lifetime;
  return `
    <header class="profile-player-header">
      <span>PLAYER</span><h2>${escapeHtml(snapshot.profile.displayName)}</h2><small>LOCAL PROFILE</small>
    </header>
    <div class="profile-metric-grid primary">
      ${metric("TOTAL PLAYTIME", formatDuration(lifetime.activePlaytimeMs))}
      ${metric("SESSIONS", formatCompactNumber(lifetime.finalizedSessions))}
      ${metric("WORDS TYPED", formatCompactNumber(lifetime.wordsCompleted))}
      ${metric("ACCURACY", formatPercentage(lifetime.accuracy))}
    </div>
    <div class="profile-metric-grid secondary-grid">
      ${metric("CAMPAIGN PROGRESS", `${data.campaignProgress} / 100`, true)}
      ${metric("BEST TYPING SPEED", formatRecordValue(data.bestTypingWpm, (value) => `${Math.round(value)} WPM`), true)}
      ${metric("HIGHEST ENDLESS STAGE", formatRecordValue(data.highestEndlessStage), true)}
      ${metric("ARCADE RUSH BEST", formatRecordValue(data.arcadeRushBestScore), true)}
      ${metric("RUSH COMPLETION", formatPercentage(data.arcadeRushCompletionRate), true)}
      ${metric("WEIGHTED WPM", formatRecordValue(lifetime.weightedWpm, (value) => value.toFixed(1)), true)}
    </div>
    ${lifetime.finalizedSessions === 0 ? emptyState("PLAY A MODE TO BUILD YOUR STATISTICS") : ""}
    <div class="profile-section-heading"><h3>RECENT ACTIVITY</h3>
      <button class="text-action" data-stats-action="view-recent">VIEW ALL RECENT</button></div>
    ${recentRows(data.recent)}
  `;
}

function renderCampaign(data) {
  const gradeMarkup = Object.entries(data.grades)
    .map(([grade, count]) => metric(grade, formatCompactNumber(count)))
    .join("");
  return `
    <h2>CAMPAIGN</h2>
    ${data.levelsCompleted === 0 ? emptyState("NO CAMPAIGN LEVELS COMPLETED") : ""}
    <div class="campaign-progress-track"><span style="width:${data.completionPercentage}%"></span></div>
    <div class="profile-metric-grid">
      ${metric("HIGHEST UNLOCKED", data.highestUnlockedLevel)}
      ${metric("HIGHEST COMPLETED", formatRecordValue(data.highestCompletedLevel))}
      ${metric("LEVELS COMPLETED", `${data.levelsCompleted} / 100`)}
      ${metric("BOSSES COMPLETED", data.bossesCompleted)}
    </div>
    <h3>BEST-GRADE DISTRIBUTION</h3>
    <div class="profile-grade-grid">${gradeMarkup}</div>
    <h3>CAMPAIGN ACTIVITY</h3>
    <div class="profile-metric-grid">
      ${metric("CAMPAIGN SESSIONS", data.sessions)}
      ${metric("SUCCESSFUL RUNS", data.successfulRuns)}
      ${metric("FAILED RUNS", data.failedRuns)}
      ${metric("PLAYTIME", formatDuration(data.activePlaytimeMs))}
      ${metric("WORDS COMPLETED", formatRecordValue(data.wordsCompleted))}
      ${metric("WEIGHTED ACCURACY", formatPercentage(data.weightedAccuracy))}
      ${metric("WEIGHTED WPM", formatRecordValue(data.weightedWpm, (value) => value.toFixed(1)))}
    </div>`;
}

function typingTable(title, records) {
  return `<section class="profile-record-group"><h3>${title}</h3>
    <div class="profile-record-table">${records.map((record) => `
      <article>
        <strong>${record.label}</strong>
        <span>BEST WPM <b>${formatRecordValue(record.bestWpm, (value) => value.toFixed(1))}</b></span>
        <span>ACCURACY <b>${formatPercentage(record.accuracy)}</b></span>
        <span>ACHIEVED <b>${formatDateTime(record.achievedAt)}</b></span>
      </article>`).join("")}</div></section>`;
}

function renderTypingTest(data) {
  return `
    <h2>TYPING TEST</h2>
    <div class="typing-word-set-heading">ENGLISH 200</div>
    ${data.testsCompleted === 0 ? emptyState("NO TYPING TEST RECORDS") : ""}
    <div class="profile-metric-grid">
      ${metric("TESTS COMPLETED", data.testsCompleted)}
      ${metric("PLAYTIME", formatDuration(data.activePlaytimeMs))}
      ${metric("BEST WPM", formatRecordValue(data.bestWpm, (value) => value.toFixed(1)))}
      ${metric("BEST ACCURACY", formatPercentage(data.bestAccuracy))}
      ${metric("CHARACTERS TYPED", formatRecordValue(data.charactersTyped))}
      ${metric("WORDS COMPLETED", formatRecordValue(data.wordsCompleted))}
      ${metric("MOST USED TEST", data.mostUsedConfiguration || EMPTY_STAT)}
    </div>
    ${typingTable("TIME MODES", data.timeRecords)}
    ${typingTable("WORD MODES", data.wordRecords)}`;
}

function renderEndless(data) {
  return `
    <h2>ENDLESS</h2>
    ${data.totalRuns === 0 ? emptyState("NO ENDLESS RUNS YET") : ""}
    <h3>PERSONAL BEST</h3>
    <div class="profile-metric-grid">
      ${metric("HIGHEST STAGE", formatRecordValue(data.highestStage))}
      ${metric("BEST SCORE", formatRecordValue(data.bestScore))}
      ${metric("LONGEST SURVIVAL", formatDuration(data.longestSurvivalMs))}
      ${metric("BEST ACCURACY", formatPercentage(data.bestAccuracy))}
      ${metric("BEST AVERAGE WPM", formatRecordValue(data.bestAverageWpm, (value) => value.toFixed(1)))}
      ${metric("MAXIMUM COMBO", formatRecordValue(data.maximumCombo))}
      ${data.maximumPerfectStreak == null ? "" : metric("MAX PERFECT STREAK", data.maximumPerfectStreak)}
    </div>
    <h3>LIFETIME</h3>
    <div class="profile-metric-grid">
      ${metric("TOTAL RUNS", data.totalRuns)}
      ${metric("FINALIZED RUNS", data.finalizedRuns)}
      ${metric("PLAYTIME", formatDuration(data.activePlaytimeMs))}
      ${metric("WORDS COMPLETED", formatRecordValue(data.wordsCompleted))}
      ${metric("CORE BREACHES", formatRecordValue(data.coreBreaches))}
    </div>`;
}

function renderArcadeRush(data) {
  const hasRuns = data.runsStarted > 0 || data.finalizedRuns > 0;
  return `
    <h2>ARCADE RUSH</h2>
    ${hasRuns ? "" : emptyState("NO ARCADE RUSH RUNS YET")}
    <h3>PERSONAL BEST</h3>
    <div class="profile-metric-grid">
      ${metric("HIGHEST SCORE", formatRecordValue(data.highestScore))}
      ${metric("BEST COMPLETED SCORE", formatRecordValue(data.bestCompletedScore))}
      ${metric("FASTEST COMPLETION", formatDuration(data.fastestCompletionMs))}
      ${metric("BEST WPM", formatRecordValue(data.bestWpm, (value) => value.toFixed(1)))}
      ${metric("BEST ACCURACY", formatPercentage(data.bestAccuracy))}
      ${metric("MAXIMUM COMBO", formatRecordValue(data.highestCombo))}
      ${metric("MOST PERFECT WAVES", formatRecordValue(data.mostPerfectWaves))}
    </div>
    <h3>RUN HISTORY</h3>
    <div class="profile-metric-grid">
      ${metric("RUNS STARTED", formatCompactNumber(data.runsStarted))}
      ${metric("RUNS COMPLETED", formatCompactNumber(data.runsCompleted))}
      ${metric("COMPLETION RATE", formatPercentage(data.completionRate))}
      ${metric("BOSSES DEFEATED", formatCompactNumber(data.bossesDefeated))}
      ${metric("FINALIZED RUNS", formatCompactNumber(data.finalizedRuns))}
      ${metric("FAILED RUNS", formatCompactNumber(data.failedRuns))}
      ${metric("PLAYTIME", formatDuration(data.activePlaytimeMs))}
      ${metric("WORDS COMPLETED", formatRecordValue(data.wordsCompleted))}
    </div>`;
}

function renderRecent(storage, filter) {
  const rows = getRecentSessionStatistics(storage, filter);
  const filters = [
    ["all", "ALL"], ["campaign", "CAMPAIGN"], ["speed-test", "TYPING TEST"],
    ["endless", "ENDLESS"], ["arcade-rush", "ARCADE RUSH"],
  ];
  return `<h2>RECENT SESSIONS</h2>
    <nav class="recent-filters">${filters.map(([id, label]) => `
      <button class="${filter === id ? "active" : ""}" data-recent-filter="${id}">${label}</button>`).join("")}</nav>
    ${recentRows(rows)}`;
}

function renderProfile(profile, state) {
  const edit = state.editing
    ? `<div class="profile-name-edit">
        <input id="profile-name-input" maxlength="40" value="${escapeHtml(state.draft)}" aria-label="Display name">
        <button data-stats-action="save-name">SAVE</button>
        <button data-stats-action="cancel-name">CANCEL</button>
        ${state.nameError ? `<small>${escapeHtml(state.nameError)}</small>` : ""}
      </div>`
    : `<strong class="profile-display-name">${escapeHtml(profile.displayName)}</strong>
       <button class="text-action" data-stats-action="edit-name">EDIT NAME</button>`;
  return `
    <h2>PROFILE</h2>
    <div class="profile-details">
      <div><span>DISPLAY NAME</span>${edit}</div>
      <div><span>LOCAL PLAYER ID</span><code>${escapeHtml(profile.playerId)}</code>
        <button class="text-action" data-stats-action="copy-id">COPY PLAYER ID</button>
        ${state.copyMessage ? `<small class="copy-message">${escapeHtml(state.copyMessage)}</small>` : ""}</div>
      <div><span>PROFILE CREATED</span><strong>${formatDateTime(profile.createdAt)}</strong></div>
      <div><span>LAST UPDATED</span><strong>${formatDateTime(profile.updatedAt)}</strong></div>
      <div><span>STORAGE</span><strong>STORED LOCALLY ON THIS DEVICE</strong></div>
    </div>
    ${renderGlobalAccount(state.authState, state.leaderboardProfileState)}
    <p class="profile-privacy">Your profile and statistics are stored in this browser.<br>They are not uploaded anywhere.</p>`;
}

function usernameFeedback(profileState) {
  if (profileState.status === "checking") return "Checking availability…";
  if (profileState.availability?.available === true) return "Username is available";
  if (profileState.availability?.available === false) return "Username is already taken";
  if (profileState.error?.message) return escapeHtml(profileState.error.message);
  return "";
}

function usernameForm(profileState, changeMode = false) {
  const running = ["checking", "claiming", "changing"].includes(profileState.status);
  const value = escapeHtml(profileState.draft || "");
  const feedback = usernameFeedback(profileState);
  return `<div class="leaderboard-username-form">
    <input id="leaderboard-username-input" type="text" value="${value}"
      minlength="3" maxlength="20" autocomplete="username" spellcheck="false"
      aria-label="Public leaderboard username" ${running ? "disabled" : ""}>
    <div class="leaderboard-username-feedback" id="leaderboard-username-feedback" aria-live="polite">${feedback}</div>
    <div class="global-account-actions">
      <button class="arcade-button" data-action="leaderboard-username-check" ${running ? "disabled aria-disabled=\"true\"" : ""}>CHECK AVAILABILITY</button>
      <button class="arcade-button account-primary" data-action="${changeMode ? "leaderboard-username-save-change" : "leaderboard-username-claim"}" ${running ? "disabled aria-disabled=\"true\"" : ""}>${changeMode ? "SAVE USERNAME" : "CLAIM USERNAME"}</button>
      ${changeMode ? `<button class="arcade-button" data-action="leaderboard-username-cancel-change" ${running ? 'disabled aria-disabled="true"' : ""}>CANCEL</button>` : ""}
    </div>
  </div>`;
}

function signedInProfileContent(profileState = { status: "idle" }) {
  if (["idle", "loading"].includes(profileState.status)) {
    return `<strong>Google account connected</strong><p>Loading public profile&hellip;</p>
      <button class="arcade-button" data-action="auth-sign-out">SIGN OUT</button>`;
  }
  if (profileState.status === "unavailable") {
    return `<strong>Google account connected</strong>
      <p>Public profile services are unavailable. Local gameplay and records are unaffected.</p>
      <button class="arcade-button" data-action="auth-sign-out">SIGN OUT</button>`;
  }
  if (profileState.status === "error" && !profileState.profile) {
    return `<strong>Google account connected</strong>
      <p>${escapeHtml(profileState.error?.message || "Public profile services are temporarily unavailable.")}</p>
      <button class="arcade-button" data-action="auth-sign-out">SIGN OUT</button>`;
  }
  if (!profileState.profile) {
    return `<strong>Google account connected</strong>
      <p>Choose a public leaderboard username.</p>
      ${usernameForm(profileState)}
      <button class="arcade-button account-sign-out" data-action="auth-sign-out">SIGN OUT</button>`;
  }

  const profile = profileState.profile;
  const canChange = canChangeLeaderboardUsername(profile);
  const cooldown = !canChange && profile.canChangeAt
    ? `<p class="leaderboard-cooldown">You can change your username again on<br>${escapeHtml(formatUsernameChangeDate(profile.canChangeAt))}.</p>`
    : "";
  const notice = profileState.notice
    ? `<p class="leaderboard-profile-notice">${escapeHtml(profileState.notice)}</p>`
    : "";
  const error = profileState.error?.message
    ? `<p class="leaderboard-profile-error">${escapeHtml(profileState.error.message)}</p>`
    : "";
  return `<strong>Google account connected</strong>
    <div class="leaderboard-public-username"><span>PUBLIC USERNAME</span><strong>${escapeHtml(profile.username)}</strong></div>
    ${notice}${error}${cooldown}
    ${profileState.editing ? usernameForm(profileState, true) : `
      <div class="global-account-actions">
        <button class="arcade-button" data-action="leaderboard-username-start-change" ${canChange ? "" : 'disabled aria-disabled="true"'}>CHANGE USERNAME</button>
        <button class="arcade-button" data-action="auth-sign-out">SIGN OUT</button>
      </div>`}
  `;
}

function globalAccountContent(authState = { status: "loading" }, profileState) {
  if (["idle", "loading"].includes(authState.status)) {
    return `<p>Checking account&hellip;</p>`;
  }
  if (authState.status === "signed-out") {
    return `<strong>Not signed in</strong>
      <p>Sign in with Google to create a persistent<br>leaderboard account later.</p>
      <button class="arcade-button account-primary" data-action="auth-google-sign-in">CONTINUE WITH GOOGLE</button>`;
  }
  if (authState.status === "signing-in") {
    return `<p>Redirecting to Google&hellip;</p>
      <button class="arcade-button account-primary" data-action="auth-google-sign-in" disabled aria-disabled="true">CONTINUE WITH GOOGLE</button>`;
  }
  if (authState.status === "signed-in") {
    return signedInProfileContent(profileState);
  }
  if (authState.status === "signing-out") {
    return `<p>Signing out&hellip;</p>
      <button class="arcade-button" data-action="auth-sign-out" disabled aria-disabled="true">SIGN OUT</button>`;
  }
  if (authState.status === "error") {
    return `<strong>Account connection failed</strong>
      <p>Please try again. Local gameplay and records are unaffected.</p>
      <button class="arcade-button account-primary" data-action="auth-google-sign-in">TRY GOOGLE SIGN-IN AGAIN</button>`;
  }
  return `<strong>Online account services are unavailable.</strong>
    <p>Local gameplay and records are unaffected.</p>`;
}

export function renderGlobalAccount(authState, profileState) {
  return `<section class="global-account" aria-labelledby="global-account-heading">
    <h3 id="global-account-heading">GLOBAL ACCOUNT</h3>
    <div id="global-account-content">${globalAccountContent(authState, profileState)}</div>
  </section>`;
}

export function renderSettingsAccountManagement({
  localProfile,
  editing = false,
  draft = "",
  nameError = "",
  authState,
  leaderboardProfileState,
  pendingResultState = null,
} = {}) {
  const displayName = escapeHtml(localProfile?.displayName || "PLAYER");
  const localEditor = editing
    ? `<div class="profile-name-edit settings-name-edit">
        <input id="profile-name-input" maxlength="20" value="${escapeHtml(draft)}" aria-label="Local display name">
        <button type="button" data-action="settings-save-name">SAVE</button>
        <button type="button" data-action="settings-cancel-name">CANCEL</button>
        ${nameError ? `<small>${escapeHtml(nameError)}</small>` : ""}
      </div>`
    : `<strong class="profile-display-name">${displayName}</strong>
       <button type="button" class="text-action" data-action="settings-edit-name">EDIT NAME</button>`;
  return `<section class="settings-account-management" id="settings-account-management" tabindex="-1" aria-labelledby="settings-account-heading">
    <h2 id="settings-account-heading">ACCOUNT &amp; LEADERBOARDS</h2>
    ${renderPendingResultNotice(pendingResultState, leaderboardProfileState)}
    <div class="settings-local-profile"><span>LOCAL DISPLAY NAME</span>${localEditor}</div>
    ${renderGlobalAccount(authState, leaderboardProfileState)}
  </section>`;
}

const PENDING_RESULT_COPY = Object.freeze({
  restoring: ["RESTORING YOUR LAST RESULT", "CHECKING THE SAVED RESULT ON THIS DEVICE"],
  "waiting-for-auth": ["YOUR LAST RESULT IS SAVED", "FINISH SIGNING IN TO CONTINUE"],
  "waiting-for-profile": ["YOUR LAST RESULT IS SAVED", "CHECKING YOUR PUBLIC PROFILE"],
  "username-required": ["YOUR LAST RESULT IS READY TO SUBMIT", "SET A PUBLIC USERNAME TO CONTINUE"],
  ready: ["YOUR LAST RESULT IS READY TO SUBMIT", "SUBMIT IT TO THE MATCHING LEADERBOARD"],
  submitting: ["SUBMITTING YOUR LAST RESULT", "KEEP THIS PAGE OPEN FOR A MOMENT"],
  submitted: ["LAST RESULT SUBMITTED", "THE LEADERBOARD IS NOW REFRESHING"],
  duplicate: ["LAST RESULT ALREADY SUBMITTED", "THE SAVED COPY HAS BEEN CLEARED"],
  expired: ["SAVED RESULT EXPIRED", "THE RESULT REMAINS IN LOCAL HISTORY"],
  failed: ["SUBMISSION FAILED - RETRY", "YOUR RESULT IS STILL SAVED ON THIS DEVICE"],
});

const PENDING_RESULT_ERRORS = Object.freeze({
  AUTH_UNAVAILABLE: "ONLINE ACCOUNT SERVICES ARE CURRENTLY UNAVAILABLE",
  PROFILE_UNAVAILABLE: "THE PUBLIC PROFILE COULD NOT BE VERIFIED",
  HYDRATION_FAILED: "THE SAVED RESULT COULD NOT BE PREPARED",
  MALFORMED_INTENT: "THE SAVED SUBMISSION DATA IS INVALID",
  USER_MISMATCH: "THIS RESULT IS BOUND TO A DIFFERENT ACCOUNT",
  INTENT_UNAVAILABLE: "THE SAVED RESULT IS NO LONGER AVAILABLE",
  STORAGE_ERROR: "THE SAVED RESULT COULD NOT BE UPDATED",
  OFFLINE: "YOU APPEAR TO BE OFFLINE",
  SUBMISSION_FAILED: "THE NETWORK REQUEST DID NOT COMPLETE",
});

export function renderPendingResultNotice(pendingResultState, profileState = {}) {
  if (!pendingResultState || ["idle", "discarded"].includes(pendingResultState.status)) return "";
  const hasUsername = Boolean(profileState?.profile?.username);
  const status = pendingResultState.status === "username-required" && hasUsername
    ? "ready"
    : pendingResultState.status;
  const copy = PENDING_RESULT_COPY[status];
  if (!copy) return "";
  const canSubmit = status === "ready";
  const canRetry = status === "failed" && !["MALFORMED_INTENT", "USER_MISMATCH", "INTENT_UNAVAILABLE"].includes(pendingResultState.errorCode);
  const isSubmitting = status === "submitting";
  const detail = status === "failed"
    ? PENDING_RESULT_ERRORS[pendingResultState.errorCode] || copy[1]
    : copy[1];
  const primary = canSubmit
    ? '<button class="arcade-button account-primary" data-action="retry-pending-result">SUBMIT LAST RESULT</button>'
    : canRetry
      ? '<button class="arcade-button account-primary" data-action="retry-pending-result">RETRY SUBMISSION</button>'
      : isSubmitting
        ? '<button class="arcade-button account-primary" disabled>SUBMITTING...</button>'
        : "";
  return `<aside class="pending-result-notice" data-pending-result-status="${status}" aria-live="polite">
    <strong>${copy[0]}</strong>
    <span>${detail}</span>
    <div class="global-account-actions">
      ${primary}
      <button class="arcade-button secondary" data-action="discard-pending-result">DISCARD</button>
    </div>
  </aside>`;
}

export function updateProfileAuthSection(authState, profileState) {
  const content = document.querySelector("#global-account-content");
  if (content) content.innerHTML = globalAccountContent(authState, profileState);
}

export function updateLeaderboardUsernameFeedback(value) {
  const feedback = document.querySelector("#leaderboard-username-feedback");
  if (!feedback) return;
  if (!String(value || "").trim()) {
    feedback.textContent = "";
    return;
  }
  const validation = validateLeaderboardUsername(value);
  feedback.textContent = validation.valid ? "" : validation.message;
}

function diagnostics(snapshot, storage) {
  const records = storage.modes?.["speed-test"]?.wordSetRecords?.["english-200"] || {};
  return [
    `PROFILE ID=${snapshot.profile.playerId}`,
    `PROFILE VERSION=${snapshot.profile.profileVersion}`,
    `LIFETIME VERSION=${storage.lifetime?.lifetimeVersion}`,
    `FINALIZED SESSIONS=${snapshot.lifetime.finalizedSessions}`,
    `SUCCESSFUL SESSIONS=${snapshot.lifetime.successfulSessions}`,
    `FAILED SESSIONS=${snapshot.lifetime.failedSessions}`,
    `ACTIVE PLAYTIME=${snapshot.lifetime.activePlaytimeMs}`,
    `RECENT SESSION COUNT=${storage.recentSessions?.length || 0}`,
    `CAMPAIGN RECORD COUNT=${snapshot.campaign.levelsCompleted}`,
    `TYPING TEST RECORD COUNT=${Object.values(records).filter((record) => record.bestWpm != null).length}`,
    `ENDLESS RECORD PRESENT=${snapshot.endless.highestStage != null}`,
    `RUSH RUNS STARTED=${snapshot.arcadeRush.runsStarted}`,
    `RUSH RUNS COMPLETED=${snapshot.arcadeRush.runsCompleted}`,
    `RUSH BEST SCORE=${snapshot.arcadeRush.highestScore ?? "NONE"}`,
  ].join(" // ");
}

export function renderProfileStatistics({
  snapshot,
  storage,
  activeTab = 0,
  recentFilter = "all",
  editing = false,
  draft = "",
  nameError = "",
  copyMessage = "",
  developerMode = false,
  authState = { status: "loading" },
  leaderboardProfileState = { status: "idle" },
} = {}, handlers = {}) {
  const tab = STATISTICS_TABS[Math.max(0, Math.min(STATISTICS_TABS.length - 1, activeTab))];
  const panel = tab === "OVERVIEW" ? renderOverview(snapshot)
    : tab === "CAMPAIGN" ? renderCampaign(snapshot.campaign)
      : tab === "TYPING TEST" ? renderTypingTest(snapshot.typingTest)
        : tab === "ENDLESS" ? renderEndless(snapshot.endless)
          : tab === "ARCADE RUSH" ? renderArcadeRush(snapshot.arcadeRush)
            : tab === "RECENT" ? renderRecent(storage, recentFilter)
              : renderProfile(snapshot.profile, {
                editing, draft, nameError, copyMessage, authState, leaderboardProfileState,
              });
  app().innerHTML = `
    <section class="screen profile-stats-screen">
      <main class="profile-stats-shell">
        <header class="profile-stats-topbar">
          <div><span class="eyebrow">Local player data</span><h1>PROFILE &amp; STATS</h1></div>
          <button class="screen-back-button" data-stats-action="back" aria-label="Go back">BACK</button>
        </header>
        <nav class="profile-tabs" aria-label="Profile statistics tabs">
          ${STATISTICS_TABS.map((label, index) => `
            <button class="${index === activeTab ? "active" : ""}" data-stats-tab="${index}" aria-selected="${index === activeTab}">${label}</button>`).join("")}
        </nav>
        <section class="profile-tab-panel" data-active-tab="${tab}">${panel}</section>
      </main>
      ${developerMode ? `<aside class="profile-stats-diagnostics">${diagnostics(snapshot, storage)}</aside>` : ""}
    </section>`;
  app().querySelectorAll?.("[data-stats-tab]").forEach((button) => {
    button.onclick = () => handlers.selectTab?.(Number(button.dataset.statsTab));
  });
  app().querySelectorAll?.("[data-recent-filter]").forEach((button) => {
    button.onclick = () => handlers.setRecentFilter?.(button.dataset.recentFilter);
  });
  const actions = {
    back: handlers.back,
    "view-recent": handlers.viewRecent,
    "edit-name": handlers.editName,
    "save-name": handlers.saveName,
    "cancel-name": handlers.cancelName,
    "copy-id": handlers.copyId,
  };
  for (const [action, handler] of Object.entries(actions)) {
    const button = app().querySelector?.(`[data-stats-action="${action}"]`);
    if (button) button.onclick = handler;
  }
  if (editing) {
    const input = app().querySelector?.("#profile-name-input");
    if (input) {
      input.onkeydown = (event) => {
        event.stopPropagation?.();
        if (event.key === "Enter") handlers.saveName?.(input.value);
        else if (event.key === "Escape") handlers.cancelName?.();
      };
    }
    input?.focus?.();
    input?.select?.();
  }
}
