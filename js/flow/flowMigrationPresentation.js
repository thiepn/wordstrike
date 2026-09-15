/* Phase 0 migration presentation.
   Arcade Rush data/runtime stays intact for legacy compatibility, but the retired
   mode must not remain discoverable through normal public navigation. */

const appRoot = () => document.querySelector("#app");

function updateTitleCopy(root) {
  const description = root.querySelector(".title-description");
  if (!description) return;
  const next = "Campaign, Typing Test, Endless and Flow train speed, accuracy, control, and natural typing in distinct ways.";
  if (description.textContent !== next) description.textContent = next;
}

function removeRetiredLeaderboardNavigation(root) {
  root.querySelector('[data-action="leaderboard-select-arcade-rush"]')?.remove();
}

function removeRetiredOverviewMetrics(root) {
  root.querySelectorAll(".profile-metric").forEach((metric) => {
    const label = metric.querySelector("span")?.textContent?.trim();
    if (["ARCADE RUSH BEST", "RUSH COMPLETION"].includes(label)) metric.remove();
  });
}

function removeRetiredRecentRows(root) {
  root.querySelectorAll(".recent-session-row").forEach((row) => {
    const mode = row.querySelector("div:first-child strong")?.textContent?.trim();
    if (mode === "ARCADE RUSH") row.remove();
  });
  root.querySelector('[data-recent-filter="arcade-rush"]')?.remove();
}

function leaveRetiredStatisticsTab(root) {
  const panel = root.querySelector('.profile-tab-panel[data-active-tab="ARCADE RUSH"]');
  if (!panel) return false;
  const fallback = root.querySelector('[data-stats-tab="3"]') || root.querySelector('[data-stats-tab="0"]');
  if (!fallback) return false;
  fallback.click();
  return true;
}

function removeRetiredStatisticsNavigation(root) {
  if (leaveRetiredStatisticsTab(root)) return;
  root.querySelector('[data-stats-tab="4"]')?.remove();
  removeRetiredOverviewMetrics(root);
  removeRetiredRecentRows(root);
}

function enhance() {
  const root = appRoot();
  if (!root) return;
  updateTitleCopy(root);
  removeRetiredLeaderboardNavigation(root);
  removeRetiredStatisticsNavigation(root);
}

let queued = false;
function queueEnhancement() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    enhance();
  });
}

const root = appRoot();
if (root) {
  new MutationObserver(queueEnhancement).observe(root, { childList: true, subtree: true });
}
enhance();
