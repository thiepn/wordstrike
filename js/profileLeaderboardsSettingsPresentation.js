/* UI11 — Profile / Leaderboards / Settings presentation semantics.
   Existing controllers, routing, storage, auth and leaderboard services remain authoritative. */

const appRoot = () => document.querySelector("#app");

function setAttributeIfChanged(element, name, value) {
  if (!element) return;
  const next = String(value);
  if (element.getAttribute(name) !== next) element.setAttribute(name, next);
}

function enhanceProfile(screen) {
  if (!screen) return;
  screen.dataset.ui11Surface = "profile";

  const tabs = screen.querySelector(".profile-tabs");
  const panel = screen.querySelector(".profile-tab-panel");
  const tabButtons = [...screen.querySelectorAll(".profile-tabs [data-stats-tab]")];

  if (tabs) {
    setAttributeIfChanged(tabs, "role", "tablist");
    setAttributeIfChanged(tabs, "aria-label", "Profile and statistics sections");
  }

  let activeTabId = "";
  tabButtons.forEach((button, index) => {
    const tabId = `ui11-profile-tab-${index}`;
    if (button.id !== tabId) button.id = tabId;
    setAttributeIfChanged(button, "role", "tab");
    setAttributeIfChanged(button, "aria-controls", "ui11-profile-tab-panel");
    setAttributeIfChanged(button, "aria-selected", button.classList.contains("active"));
    if (button.classList.contains("active")) activeTabId = tabId;
  });

  if (panel) {
    if (panel.id !== "ui11-profile-tab-panel") panel.id = "ui11-profile-tab-panel";
    setAttributeIfChanged(panel, "role", "tabpanel");
    if (activeTabId) setAttributeIfChanged(panel, "aria-labelledby", activeTabId);
  }

  const recentFilters = screen.querySelector(".recent-filters");
  if (recentFilters) {
    setAttributeIfChanged(recentFilters, "aria-label", "Recent session filters");
    recentFilters.querySelectorAll("button").forEach((button) => {
      setAttributeIfChanged(button, "aria-pressed", button.classList.contains("active"));
    });
  }
}

function enhanceLeaderboardTable(screen) {
  const table = screen?.querySelector(".leaderboard-table");
  if (!table) return;

  const header = table.querySelector(".leaderboard-table-head");
  header?.querySelectorAll(":scope > *").forEach((cell) => {
    setAttributeIfChanged(cell, "role", "columnheader");
  });

  table.querySelectorAll(".leaderboard-row").forEach((row) => {
    [...row.children].forEach((cell, index) => {
      if (cell.classList.contains("leaderboard-mobile-metrics")) return;
      setAttributeIfChanged(cell, "role", index === 0 ? "rowheader" : "cell");
    });
  });
}

function enhanceLeaderboards(screen) {
  if (!screen) return;
  screen.dataset.ui11Surface = "leaderboards";

  const content = screen.querySelector(".leaderboard-content");
  if (content) {
    setAttributeIfChanged(content, "aria-live", "polite");
    setAttributeIfChanged(content, "aria-atomic", "false");
  }

  enhanceLeaderboardTable(screen);
}

function enhanceSettings(screen) {
  if (!screen) return;
  screen.dataset.ui11Surface = "settings";

  screen.querySelectorAll("button.toggle[data-setting]").forEach((toggle) => {
    setAttributeIfChanged(toggle, "role", "switch");
    setAttributeIfChanged(toggle, "aria-checked", toggle.classList.contains("on"));
    const rowLabel = toggle.closest(".setting-row")?.querySelector("strong")?.textContent?.trim();
    if (rowLabel) setAttributeIfChanged(toggle, "aria-label", rowLabel);
  });

  const settingsList = screen.querySelector(".settings-list");
  if (settingsList) setAttributeIfChanged(settingsList, "aria-label", "Gameplay and visual settings");

  const tutorials = screen.querySelector(".settings-tutorials");
  if (tutorials) setAttributeIfChanged(tutorials, "data-ui11-section", "tutorials");

  const account = screen.querySelector(".settings-account-management");
  if (account) setAttributeIfChanged(account, "data-ui11-section", "account");
}

export function syncProfileLeaderboardsSettingsPresentation() {
  const root = appRoot();
  if (!root) return false;
  enhanceProfile(root.querySelector(".profile-stats-screen"));
  enhanceLeaderboards(root.querySelector(".leaderboards-screen"));
  enhanceSettings(root.querySelector(".settings-screen"));
  return true;
}
