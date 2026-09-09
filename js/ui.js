import { calculateAccuracy, calculateWPM } from "./scoring.js";
import {
  generateBossLevel,
  generateLegacyLevel,
  generateLevel,
} from "./levelGenerator.js";
import { getCampaignDifficultyLevel } from "./campaignDifficulty.js";
import { generateBossEncounter } from "./bossGenerator.js";
import { getSessionDiagnosticText } from "./campaignSession.js";
import {
  getSpeedTestConfigsByType,
  SPEED_TEST_TYPES,
} from "./speedTestConfig.js";
import {
  getSpeedTestActiveDuration,
  getSpeedTestCurrentWord,
  getSpeedTestDiagnosticText,
  getSpeedTestLiveMetrics,
} from "./speedTest.js";
import {
  getSpeedTestLineWindow,
  isConstrainedSpeedTestLayout,
} from "./speedTestLayout.js";
import { ENDLESS_CONFIG, getEndlessWordsPerStage } from "./endlessConfig.js";
import { getEndlessDiagnosticText } from "./endlessMode.js";

import { normalizeSpeedTestFontSize, speedTestFontSizeMarkup } from "./speedTestPresentation.js";

const app = () => document.querySelector("#app");
let speedTestLayoutObserver = null;
let speedTestLayoutState = null;

function disconnectSpeedTestLayoutObserver() {
  speedTestLayoutObserver?.disconnect?.();
  speedTestLayoutObserver = null;
  if (speedTestLayoutState?.layoutFrameId != null) {
    globalThis.cancelAnimationFrame?.(speedTestLayoutState.layoutFrameId);
    speedTestLayoutState.layoutFrameId = null;
  }
  speedTestLayoutState = null;
}

export function clearSpeedTestLayout() {
  disconnectSpeedTestLayoutObserver();
}

function menuButton(label, action, selected = false, extraClass = "") {
  return `<button class="arcade-button ${selected ? "selected" : ""} ${extraClass}" data-action="${action}">${label}</button>`;
}

function wireMenuActions(root, selector, handlers = {}) {
  root?.querySelectorAll?.(selector).forEach((button, index) => {
    const action = button.dataset?.action;
    if (typeof handlers[action] !== "function") return;
    button.onclick = (event) => {
      event?.preventDefault?.();
      handlers[action]?.();
    };
    button.onmouseenter = () => handlers.select?.(index);
    button.onfocus = () => handlers.select?.(index);
  });
}

function wireMenuSelection(root, selector, select) {
  root?.querySelectorAll?.(selector).forEach((button, index) => {
    button.onmouseenter = () => select?.(index);
    button.onfocus = () => select?.(index);
  });
}

function tutorialHelpButton(id, label) {
  return `<button type="button" class="tutorial-help-button" data-tutorial-help="${id}" aria-label="How to play ${label}">? HOW TO PLAY</button>`;
}

function screenBackButton(action = "back", direct = false) {
  const attribute = direct ? `data-screen-back="${action}"` : `data-action="${action}"`;
  return `<button type="button" class="screen-back-button" ${attribute} aria-label="Go back">BACK</button>`;
}

function gameplayPauseButton(label = "BACK") {
  return `<button type="button" class="gameplay-pause-button" data-gameplay-action="pause" aria-label="Pause and go back">${label}</button>`;
}

function wireGameplayAction(root, action, handler) {
  root?.querySelectorAll?.(`[data-gameplay-action="${action}"]`).forEach((button) => {
    button.onpointerdown = (event) => event.stopPropagation?.();
    button.onclick = (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      button.blur?.();
      handler?.();
    };
  });
}

function resultMetricHelp({ grade = false } = {}) {
  return `<details class="result-metric-help"><summary>UNDERSTANDING YOUR RESULT</summary>
    <p><strong>WPM</strong> Your typing speed in words per minute.</p>
    <p><strong>ACCURACY</strong> How often your typed characters were correct.</p>
    ${grade ? "<p><strong>GRADE</strong> Your overall Campaign performance.</p>" : ""}
  </details>`;
}

export function renderTitle(menuIndex, handlers) {
  const icon = (name) => {
    const paths = {
      play: '<path d="m9 7 8 5-8 5V7Z"/>',
      trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 12v4M9 20h6M10 16h4"/>',
      profile: '<circle cx="12" cy="8" r="3"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
      settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/>',
      arrow: '<path d="m9 6 6 6-6 6"/>',
    };
    return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor">${paths[name] || ""}</svg>`;
  };
  const selected = (index) => index === menuIndex ? " selected" : "";

  app().innerHTML = `
    <section class="screen menu-screen title-screen">
      <div class="title-shell">
        <header class="title-topline">
          <span class="title-brand-label">WORDSTRIKE</span>
          <span class="title-product-note">Competitive typing</span>
        </header>

        <div class="title-main">
          <div class="title-hero">
            <p class="title-kicker">Speed, accuracy, control</p>
            <h1 class="sr-only">WORDSTRIKE</h1>
            <img
              class="brand-logo"
              src="./assets/branding/wordstrike-logo.webp"
              alt="WORDSTRIKE"
              width="360"
              height="360"
              decoding="async"
              fetchpriority="high"
              draggable="false"
            >
            <p class="title-tagline">Precision under pressure.</p>
            <p class="title-description">Campaign, Typing Test, Endless and Arcade Rush turn clean, controlled typing into competitive play.</p>
            <button type="button" class="ui-button ui-button--primary title-start-button${selected(0)}" data-title-index="0" data-action="modes">
              <span class="title-action-icon">${icon("play")}</span>
              <span class="title-start-copy"><strong>START</strong><small>Choose a mode</small></span>
              <span class="title-action-arrow">${icon("arrow")}</span>
            </button>
            <p class="title-keyboard-hint">↑ ↓ navigate &nbsp;·&nbsp; Enter select</p>
          </div>

          <nav class="title-global-nav" aria-label="Global navigation">
            <div class="title-nav-heading"><strong>Explore</strong><span>02–04</span></div>
            <div class="title-nav-list">
              <button type="button" class="title-nav-action${selected(1)}" data-title-index="1" data-action="open-leaderboards">
                <span class="title-action-icon">${icon("trophy")}</span>
                <span class="title-action-copy"><strong>Leaderboards</strong><span>Global rankings and personal position</span></span>
                <span class="title-action-arrow">${icon("arrow")}</span>
              </button>
              <button type="button" class="title-nav-action${selected(2)}" data-title-index="2" data-action="profile">
                <span class="title-action-icon">${icon("profile")}</span>
                <span class="title-action-copy"><strong>Profile &amp; Stats</strong><span>Progress, records and recent runs</span></span>
                <span class="title-action-arrow">${icon("arrow")}</span>
              </button>
              <button type="button" class="title-nav-action${selected(3)}" data-title-index="3" data-action="settings">
                <span class="title-action-icon">${icon("settings")}</span>
                <span class="title-action-copy"><strong>Settings</strong><span>Controls, tutorials and account options</span></span>
                <span class="title-action-arrow">${icon("arrow")}</span>
              </button>
            </div>
          </nav>
        </div>

        <footer class="title-footer">
          <div class="title-footer-meta"><span>Local-first progress</span><span>Optional global leaderboards</span></div>
          <span class="title-footer-mark">TYPE WITH INTENT</span>
        </footer>
      </div>
    </section>`;

  app().querySelector('[data-action="modes"]').onclick = handlers.modes;
  app().querySelector('[data-action="profile"]').onclick = handlers.profile;
  app().querySelector('[data-action="settings"]').onclick = handlers.settings;
  app().querySelector(`[data-title-index="${menuIndex}"]`)?.focus?.({ preventScroll: true });
}

export function renderModeSelect(modes, selectedIndex, handlers) {
  const selectedMode = selectedIndex >= 0 && selectedIndex < modes.length
    ? modes[selectedIndex]
    : null;
  const statusLabel = (mode) => mode?.status === "preview"
    ? "Developer preview"
    : mode?.enabled
      ? "Available"
      : "Coming soon";
  const toneFor = (mode) => {
    if (!mode) return "home";
    if (!mode.enabled) return "neutral";
    if (mode.id === "campaign") return "campaign";
    if (mode.id === "speed-test") return "typing";
    if (mode.id === "endless") return "endless";
    if (mode.id === "arcade-rush") return "rush";
    return "neutral";
  };
  const motifFor = (mode) => {
    if (!mode) return '<div class="mode-motif-neutral">EXIT</div>';
    if (!mode.enabled) return '<div class="mode-motif-neutral">LOCKED</div>';
    if (mode.id === "campaign") {
      return `<div class="mode-motif-campaign">
        <span class="trajectory"></span><span class="trajectory"></span><span class="trajectory"></span>
        <span class="core-node"></span>
      </div>`;
    }
    if (mode.id === "speed-test") {
      return `<div class="mode-motif-typing">
        <div class="word-row"><span>control</span><span>tempo</span><span>focus</span></div>
        <div class="word-row"><span>signal</span><strong>precision</strong><i class="caret"></i><span>rhythm</span></div>
        <div class="word-row"><span>velocity</span><span>accuracy</span><span>flow</span></div>
      </div>`;
    }
    if (mode.id === "endless") {
      return `<div class="mode-motif-endless">
        <span class="ring"></span><span class="ring"></span><span class="ring"></span><span class="ring"></span>
        <span class="sweep"></span><span class="center"></span>
      </div>`;
    }
    if (mode.id === "arcade-rush") {
      return `<div class="mode-motif-rush">
        <span class="rush-line"></span><span class="rush-line"></span><span class="rush-line"></span>
        <span class="rush-core"></span>
      </div>`;
    }
    return '<div class="mode-motif-neutral">MODE</div>';
  };
  const modeNumber = selectedMode
    ? String(modes.indexOf(selectedMode) + 1).padStart(2, "0")
    : "00";
  const showcaseTitle = selectedMode?.name || "Main Menu";
  const showcaseLabel = selectedMode?.shortLabel || "Return to title";
  const showcaseDescription = selectedMode?.description
    || "Leave Mode Select and return to the WordStrike home screen.";
  const showcaseCommand = selectedMode?.enabled
    ? `<kbd>ENTER</kbd><span>Launch ${selectedMode.name}</span>`
    : selectedMode
      ? "<span>Not available yet</span>"
      : "<kbd>ENTER</kbd><span>Return to title</span>";
  const selectedClass = (index) => index === selectedIndex ? " selected" : "";

  app().innerHTML = `
    <section class="screen mode-screen mode-select-screen">
      <div class="mode-select-shell">
        <header class="mode-select-topline">
          ${screenBackButton("mode-title")}
          <div class="mode-select-context"><strong>WORDSTRIKE</strong><span>MODE / ${String(Math.min(selectedIndex + 1, modes.length + 1)).padStart(2, "0")}</span></div>
        </header>

        <div class="mode-select-intro">
          <div>
            <p class="mode-select-kicker">Choose your challenge</p>
            <h1>Mode Select</h1>
          </div>
          <p class="mode-select-lead">Pick the format that matches what you want to train, prove, or survive. Each mode keeps the same typing fundamentals under a different kind of pressure.</p>
        </div>

        <div class="mode-select-layout">
          <section class="mode-showcase mode-tone-${toneFor(selectedMode)}" data-mode-showcase data-mode-enabled="${selectedMode?.enabled === true}">
            <div class="mode-showcase-visual" aria-hidden="true">
              <span class="mode-showcase-index">${modeNumber} / ${String(modes.length).padStart(2, "0")}</span>
              <span class="mode-showcase-signal">${selectedMode ? statusLabel(selectedMode) : "Navigation"}</span>
              ${motifFor(selectedMode)}
            </div>
            <div class="mode-showcase-copy">
              <div class="mode-showcase-heading">
                <p>${showcaseLabel}</p>
                <h2>${showcaseTitle}</h2>
              </div>
              <div class="mode-showcase-command">${showcaseCommand}</div>
              <p class="mode-showcase-description">${showcaseDescription}</p>
            </div>
          </section>

          <nav class="mode-options" aria-label="Game modes">
            <div class="mode-options-heading"><strong>Modes</strong><span>01–${String(modes.length).padStart(2, "0")}</span></div>
            <div class="mode-options-list">
              ${modes.map((mode, index) => {
    const status = statusLabel(mode);
    const current = index === selectedIndex ? ' aria-current="true"' : "";
    const copy = `<span class="mode-option-index">${String(index + 1).padStart(2, "0")}</span>
                  <span class="mode-option-copy"><strong>${mode.name}</strong><span>${mode.shortLabel} · ${mode.description}</span></span>
                  <small class="mode-option-status">${status}</small>`;
    return mode.enabled
      ? `<button type="button" class="mode-option available${selectedClass(index)}" data-mode-id="${mode.id}" data-mode-index="${index}"${current}>${copy}</button>`
      : `<article class="mode-option coming-soon${selectedClass(index)}" data-mode-id="${mode.id}" data-mode-index="${index}" aria-disabled="true" tabindex="-1"${current}>${copy}</article>`;
  }).join("")}
            </div>
          </nav>
        </div>

        <footer class="mode-select-footer">
          <p class="mode-select-hint">↑ ↓ ← → navigate &nbsp;·&nbsp; Enter launch &nbsp;·&nbsp; Esc back</p>
          <button type="button" class="mode-home-action${selectedClass(modes.length)}" data-mode-home-index="${modes.length}" data-action="mode-title">
            <span class="mode-home-arrow">←</span><span>Main Menu</span>
          </button>
        </footer>
      </div>
    </section>`;

  app().querySelectorAll("[data-mode-index]").forEach((card) => {
    const index = Number(card.dataset.modeIndex);
    // Preview selection follows deliberate mouse movement, not passive DOM reflow.
    // This prevents stationary-pointer hover events from stealing keyboard selection
    // when the narrow Mode Select rerenders and scrolls under the cursor.
    card.onmousemove = () => handlers.select?.(index);
    if (card.matches?.("button")) {
      card.onclick = () => handlers.activate?.(card.dataset.modeId);
    }
  });
  const titleButtons = [...app().querySelectorAll('[data-action="mode-title"]')];
  if (!titleButtons.length) titleButtons.push(app().querySelector('[data-action="mode-title"]'));
  titleButtons.filter(Boolean).forEach((titleButton) => {
    titleButton.onclick = handlers.back;
    titleButton.onmousemove = () => handlers.select?.(modes.length);
  });
  const focusTarget = selectedIndex === modes.length
    ? app().querySelector(`[data-mode-home-index="${modes.length}"]`)
    : app().querySelector(`[data-mode-index="${selectedIndex}"]`);
  focusTarget?.focus?.({ preventScroll: true });

  // The Mode Select screen owns vertical scrolling on constrained viewports. Keep
  // keyboard-selected rows visible without forcing the initial Campaign view away
  // from the top-of-screen showcase.
  if (focusTarget && selectedIndex > 0) {
    const scrollOwner = app().querySelector(".mode-select-screen");
    const ownerRect = scrollOwner?.getBoundingClientRect?.();
    const targetRect = focusTarget.getBoundingClientRect?.();
    if (scrollOwner && ownerRect && targetRect) {
      const inset = 12;
      if (targetRect.bottom > ownerRect.bottom - inset) {
        scrollOwner.scrollTop += targetRect.bottom - ownerRect.bottom + inset;
      } else if (targetRect.top < ownerRect.top + inset) {
        scrollOwner.scrollTop += targetRect.top - ownerRect.top - inset;
      }
    }
  }
}

export function renderEndlessReady(handlers = {}) {
  app().innerHTML = `
    <section class="screen endless-ready-screen">
      <div class="endless-ready-panel">
        ${screenBackButton()}
        <div class="eyebrow">Standard survival protocol</div>
        <h1>ENDLESS MODE</h1>
        ${tutorialHelpButton("endless", "Endless")}
        <p class="endless-ready-lead">SURVIVE ESCALATING STAGES</p>
        <div class="endless-ready-rules">
          <span>${ENDLESS_CONFIG.startingIntegrity} CORE INTEGRITY</span>
          <span>${getEndlessWordsPerStage(1)} WORDS IN STAGE 1</span>
        </div>
        <button class="arcade-button selected" data-action="endless-start">
          PRESS ENTER TO BEGIN
        </button>
        <p class="footer-hint">ENTER BEGIN &nbsp;•&nbsp; ESC MODE SELECT</p>
      </div>
    </section>`;
  wireMenuActions(app(), ".endless-ready-panel .arcade-button", {
    "endless-start": handlers.start,
  });
  const endlessHelp = app().querySelector('[data-tutorial-help="endless"]');
  if (endlessHelp) endlessHelp.onclick = handlers.help;
  app().querySelectorAll('[data-action="back"]').forEach((button) => { button.onclick = handlers.back; });
}

export function renderEndlessShell(game, devMode = false, handlers = {}) {
  app().innerHTML = `
    <section class="screen game-screen endless-screen">
      <header class="endless-hud">
        ${gameplayPauseButton()}
        <div><strong>STAGE <span id="endless-stage">${game.stage}</span></strong>
          <span id="endless-progress">${game.stageWordsCompleted} / ${getEndlessWordsPerStage(game.stage)}</span></div>
        <div>SCORE <strong id="endless-score">0</strong></div>
        <div>CORE <strong class="endless-integrity" id="endless-integrity">${"◇".repeat(game.integrity)}</strong></div>
      </header>
      ${devMode ? `<aside class="dev-runtime-panel" id="dev-runtime-panel">${getEndlessDiagnosticText(game)}</aside>` : ""}
      <div class="play-area" id="play-area">
        <div class="core" aria-label="Central core"></div>
        <div class="endless-stage-banner" id="endless-stage-banner" hidden></div>
      </div>
    </section>`;
  wireGameplayAction(app(), "pause", handlers.pause);
}

export function updateEndlessHud(game) {
  const values = {
    "#endless-stage": game.stage,
    "#endless-progress": `${game.stageWordsCompleted} / ${getEndlessWordsPerStage(game.stage)}`,
    "#endless-score": game.score.toLocaleString(),
    "#endless-integrity": "◇".repeat(Math.max(0, game.integrity)),
  };
  for (const [selector, value] of Object.entries(values)) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }
  const banner = document.querySelector("#endless-stage-banner");
  if (banner) {
    banner.hidden = game.elapsedMs >= game.bannerUntilMs || !game.bannerText;
    banner.textContent = game.bannerText;
  }
  const diagnostics = document.querySelector("#dev-runtime-panel");
  if (diagnostics) diagnostics.textContent = getEndlessDiagnosticText(game);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function speedWordMarkup(expected, typed = "", showCaret = true) {
  const caretIndex = Math.min(typed.length, expected.length);
  const characters = [...expected].map((character, index) => {
    const className = index >= typed.length
      ? "speed-test-char-pending"
      : typed[index] === character
        ? "speed-test-char-correct"
        : "speed-test-char-incorrect";
    const caret = showCaret && index === caretIndex
      ? '<span class="speed-test-caret" aria-hidden="true"></span>'
      : "";
    return `${caret}<span class="${className}">${character}</span>`;
  }).join("");
  const extra = typed.length > expected.length
    ? `<span class="speed-test-extra">${escapeHtml(typed.slice(expected.length, expected.length + 12))}${typed.length > expected.length + 12 ? "…" : ""}</span>`
    : "";
  const trailingCaret = showCaret && typed.length >= expected.length
    ? '<span class="speed-test-caret" aria-hidden="true"></span>'
    : "";
  return `${characters}${extra}${trailingCaret}`;
}

function speedTestConfigMarkup(config, disabled) {
  const options = getSpeedTestConfigsByType(config.testType);
  const control = (label, attributes, active) => `
    <button class="speed-config-control ${active ? "active" : ""}"
            role="tab" aria-selected="${active}" tabindex="${active ? "0" : "-1"}"
            ${attributes} ${disabled ? "disabled" : ""}>${label}</button>`;
  return `
    <nav class="speed-test-config" aria-label="Typing Test configuration" role="tablist">
      <div class="speed-test-categories">
        ${control("TIME", 'data-speed-category="time"', config.testType === SPEED_TEST_TYPES.TIME)}
        ${control("WORDS", 'data-speed-category="words"', config.testType === SPEED_TEST_TYPES.WORDS)}
      </div>
      <span class="speed-config-divider" aria-hidden="true"></span>
      <div class="speed-test-values">
        ${options.map((option) => control(
    String(option.durationSeconds ?? option.wordCount),
    `data-speed-config="${option.configId}"`,
    option.configId === config.configId,
  )).join("")}
      </div>
    </nav>`;
}

export function applySpeedTestFontSize(state) {
  const screen = document.querySelector(".speed-test-screen");
  if (screen) screen.dataset.speedFontSize = normalizeSpeedTestFontSize(state.fontSize);
  state.layoutDirty = true;
  scheduleSpeedTestLayout(state);
}

export function renderSpeedTestRun(state, devMode = false, handlers = {}) {
  disconnectSpeedTestLayoutObserver();
  const isTime = state.config.testType === SPEED_TEST_TYPES.TIME;
  const configLabel = isTime ? `${state.config.durationSeconds} SECONDS` : `${state.config.wordCount} WORDS`;
  const timerPosition = state.timerPosition === "top" ? "top" : "center";
  const primaryValue = isTime ? state.config.durationSeconds.toFixed(1) : `0 / ${state.config.wordCount}`;
  app().innerHTML = `
    <section class="screen speed-test-screen" data-speed-font-size="${normalizeSpeedTestFontSize(state.fontSize)}">
      <header class="speed-test-topbar">
        <div class="speed-test-topbar-primary">
          ${gameplayPauseButton()}
          <div class="speed-test-mode-title"><strong>TYPING TEST</strong><span>${configLabel}</span></div>
          <div class="speed-test-top-actions">
            <button type="button" class="gameplay-control-button" data-gameplay-action="restart" aria-label="Restart Typing Test">RESTART <kbd>TAB</kbd></button>
            <button type="button" class="gameplay-control-button" data-gameplay-action="pause" aria-label="Pause Typing Test">PAUSE <kbd>ESC</kbd></button>
          </div>
        </div>
        <div class="speed-test-topbar-secondary">
          <div class="speed-test-controls-wrap">
            <span class="speed-test-word-set">ENGLISH 200</span>
            ${speedTestConfigMarkup(state.config, state.phase === "ACTIVE")}
            <nav class="speed-timer-position" aria-label="Timer position">
              <span>TIMER POSITION</span>
              <button type="button" data-speed-timer-position="center" aria-pressed="${timerPosition === "center"}" class="${timerPosition === "center" ? "active" : ""}">CENTER</button>
              <button type="button" data-speed-timer-position="top" aria-pressed="${timerPosition === "top"}" class="${timerPosition === "top" ? "active" : ""}">TOP</button>
            </nav>
            ${speedTestFontSizeMarkup(state.fontSize)}
          </div>
          <div class="speed-test-hud">
            ${timerPosition === "top" ? `<strong id="speed-test-primary">${primaryValue}</strong>` : ""}
            ${timerPosition === "top" && !isTime ? '<span id="speed-test-elapsed">00:00</span>' : ""}
            <span>WPM <b id="speed-test-wpm">0</b></span>
            <span>ACC <b id="speed-test-accuracy">100%</b></span>
            <span>RAW <b id="speed-test-raw">0</b></span>
            <span class="speed-test-data-metric">WORDS <b id="speed-test-words">0</b></span>
            <span class="speed-test-data-metric" title="Incorrect keystrokes, including corrected mistakes">ERRORS <b id="speed-test-errors">0</b></span>
          </div>
        </div>
      </header>
      <main class="speed-test-stage">
        <div class="speed-test-upper-overlay">
          <div class="speed-test-upper-overlay-content">
            <div class="speed-test-status" id="speed-test-status">START TYPING TO BEGIN</div>
            ${timerPosition === "center" ? `<div class="speed-test-center-timer" aria-live="off">
              <strong id="speed-test-primary">${primaryValue}</strong>
              ${isTime ? "" : '<span id="speed-test-elapsed">00:00</span>'}
            </div>` : ""}
          </div>
        </div>
        <div class="speed-test-prompt-actions">${tutorialHelpButton("typing", "Typing Test")}</div>
        <div class="speed-test-word-region">
          <div class="speed-test-word-viewport" id="speed-test-word-viewport">
            <div class="speed-test-word-flow" id="speed-test-word-flow">
              ${state.words.map((word, index) => `
                <span class="speed-test-word ${index === 0 ? "speed-test-word-current" : ""}"
                      data-speed-word-index="${index}"
                      aria-current="${index === 0 ? "true" : "false"}">${speedWordMarkup(word, "", index === 0)}</span>`).join("")}
            </div>
          </div>
        </div>
      </main>
      ${devMode ? `<aside class="speed-test-dev" id="speed-test-dev">${getSpeedTestDiagnosticText(state)}</aside>` : ""}
    </section>`;
  app().querySelectorAll("[data-speed-config]").forEach((button) => {
    button.onclick = () => handlers.selectConfig?.(button.dataset.speedConfig);
  });
  const fontControl = app().querySelector("select[data-speed-font-size]");
  if (fontControl) fontControl.onchange = () => handlers.setFontSize?.(fontControl.value);
  const typingHelp = app().querySelector('[data-tutorial-help="typing"]');
  if (typingHelp) typingHelp.onclick = handlers.help;
  wireGameplayAction(app(), "restart", handlers.restart);
  wireGameplayAction(app(), "pause", handlers.pause);
  app().querySelectorAll("[data-speed-category]").forEach((button) => {
    button.onclick = () => handlers.selectConfig?.(
      button.dataset.speedCategory === SPEED_TEST_TYPES.TIME ? "time-60" : "words-50",
    );
  });
  app().querySelectorAll("[data-speed-timer-position]").forEach((button) => {
    button.onclick = () => handlers.setTimerPosition?.(button.dataset.speedTimerPosition);
    button.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault?.();
      const next = button.dataset.speedTimerPosition === "center" ? "top" : "center";
      handlers.setTimerPosition?.(next);
    };
  });
  const viewport = document.querySelector("#speed-test-word-viewport");
  if (viewport && globalThis.ResizeObserver) {
    speedTestLayoutObserver = new ResizeObserver(() => {
      state.layoutDirty = true;
      scheduleSpeedTestLayout(state);
    });
    speedTestLayoutObserver.observe(viewport);
  }
  state.layoutDirty = true;
  scheduleSpeedTestLayout(state);
}

export function measureSpeedTestLayout(state, { constrained = isConstrainedSpeedTestLayout() } = {}) {
  const viewport = document.querySelector("#speed-test-word-viewport");
  const flow = document.querySelector("#speed-test-word-flow");
  if (!state || !viewport || !flow) return null;
  const words = [...(flow.querySelectorAll?.("[data-speed-word-index]") || [])];
  const lineTops = [];
  const wordLines = new Map();
  for (const word of words) {
    const top = Number(word.offsetTop) || 0;
    let lineIndex = lineTops.findIndex((lineTop) => Math.abs(lineTop - top) < 1);
    if (lineIndex < 0) {
      lineIndex = lineTops.length;
      lineTops.push(top);
    }
    wordLines.set(Number(word.dataset.speedWordIndex), lineIndex);
  }
  const currentLineIndex = wordLines.get(state.currentWordIndex) ?? 0;
  const lineWindow = getSpeedTestLineWindow({
    currentLineIndex,
    lineCount: lineTops.length,
    constrained,
  });
  const { topLineIndex } = lineWindow;
  const desiredTranslation = topLineIndex > 0 ? lineTops[topLineIndex] : 0;
  const maximumTranslation = Math.max(
    0,
    (Number(flow.scrollHeight) || 0) - (Number(viewport.clientHeight) || 0),
  );
  state.previousLineIndex = state.currentLineIndex;
  state.currentLineIndex = currentLineIndex;
  state.lineMap = words.map((word) => wordLines.get(Number(word.dataset.speedWordIndex)) ?? 0);
  state.verticalTranslation = Math.max(0, Math.min(desiredTranslation, maximumTranslation));
  state.lastLayoutWordIndex = state.currentWordIndex;
  state.layoutDirty = false;
  viewport.scrollTop = 0;
  flow.style.transform = `translateY(-${state.verticalTranslation}px)`;
  return {
    currentLineIndex,
    lineTops,
    lineWindow,
    verticalTranslation: state.verticalTranslation,
  };
}

export function scheduleSpeedTestLayout(state) {
  if (!state || state.layoutFrameId != null) return;
  speedTestLayoutState = state;
  const schedule = globalThis.requestAnimationFrame || ((callback) => callback());
  state.layoutFrameId = schedule(() => {
    state.layoutFrameId = null;
    measureSpeedTestLayout(state);
  });
}

export function updateSpeedTestRun(state, nowMs) {
  if (!state) return;
  const now = Number.isFinite(nowMs)
    ? nowMs
    : globalThis.performance?.now?.() ?? Date.now();
  const live = getSpeedTestLiveMetrics(state, now);
  const activeDuration = getSpeedTestActiveDuration(state, now);
  const primary = document.querySelector("#speed-test-primary");
  if (primary) {
    primary.textContent = state.config.testType === SPEED_TEST_TYPES.TIME
      ? (state.activeStartedAtMs == null
        ? state.config.durationSeconds
        : Math.max(0, (state.deadlineMs - now) / 1000)).toFixed(1)
      : `${state.metrics.wordsCompleted} / ${state.config.wordCount}`;
  }
  const values = {
    "#speed-test-wpm": Math.round(live.wpm),
    "#speed-test-words": state.metrics.wordsCompleted,
    "#speed-test-errors": state.metrics.incorrectKeystrokes,
    "#speed-test-raw": Math.round(live.rawWpm),
    "#speed-test-accuracy": `${live.accuracy.toFixed(1)}%`,
    "#speed-test-elapsed": `${Math.floor(activeDuration / 60000).toString().padStart(2, "0")}:${Math.floor((activeDuration % 60000) / 1000).toString().padStart(2, "0")}`,
    "#speed-test-status": state.activeStartedAtMs == null ? "START TYPING TO BEGIN" : "",
  };
  for (const [selector, value] of Object.entries(values)) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }
  const status = document.querySelector("#speed-test-status");
  if (status) status.hidden = state.activeStartedAtMs != null;
  document.querySelector(".speed-test-screen")?.classList.toggle(
    "typing-active",
    state.activeStartedAtMs != null,
  );

  // Collapse configuration before the first active frame. It never starts or pauses a test.
  if (state.activeStartedAtMs != null) {
    document.querySelector(".speed-test-topbar [data-mode-presentation][open]")?.removeAttribute?.("open");
  }

  const flow = document.querySelector("#speed-test-word-flow");
  if (flow) {
    const renderedCount = flow.querySelectorAll?.("[data-speed-word-index]").length || 0;
    if (renderedCount < state.words.length && flow.insertAdjacentHTML) {
      flow.insertAdjacentHTML(
        "beforeend",
        state.words.slice(renderedCount).map((word, offset) => {
          const index = renderedCount + offset;
          return `<span class="speed-test-word" data-speed-word-index="${index}" aria-current="false">${speedWordMarkup(word, "", false)}</span>`;
        }).join(""),
      );
      state.layoutDirty = true;
    }
  }

  for (let index = 0; index < state.committedWords.length; index += 1) {
    const element = document.querySelector(`[data-speed-word-index="${index}"]`);
    if (!element || element.dataset.committed === "true") continue;
    const result = state.committedWords[index];
    element.classList.remove("speed-test-word-current");
    element.classList.add("speed-test-word-complete");
    if (!result.exact) element.classList.add("speed-test-word-error");
    element.innerHTML = speedWordMarkup(result.expected, result.typed, false);
    element.dataset.committed = "true";
    element.setAttribute?.("aria-current", "false");
  }

  document.querySelectorAll?.(".speed-test-word-current").forEach((element) => {
    if (Number(element.dataset.speedWordIndex) !== state.currentWordIndex) {
      element.classList.remove("speed-test-word-current");
      element.setAttribute?.("aria-current", "false");
    }
  });
  const current = document.querySelector(
    `[data-speed-word-index="${state.currentWordIndex}"]`,
  );
  if (current) {
    current.classList.add("speed-test-word-current");
    current.innerHTML = speedWordMarkup(
      getSpeedTestCurrentWord(state),
      state.typedBuffer,
    );
    current.setAttribute?.("aria-current", "true");
    if (
      state.lineMap[state.currentWordIndex] == null ||
      state.lastLayoutWordIndex !== state.currentWordIndex
    ) state.layoutDirty = true;
  }
  if (state.layoutDirty) scheduleSpeedTestLayout(state);
  document.querySelectorAll?.(".speed-config-control").forEach((button) => {
    button.disabled = state.phase === "ACTIVE";
  });
  const tutorialHelp = document.querySelector('[data-tutorial-help="typing"]');
  if (tutorialHelp) tutorialHelp.disabled = state.phase === "ACTIVE";
  const diagnostics = document.querySelector("#speed-test-dev");
  if (diagnostics) diagnostics.textContent = getSpeedTestDiagnosticText(state, now);
}

export function renderSpeedTestResults(result, recordFlags, selectedIndex, handlers, submissionState = {}) {
  const actions = [
    ["RETRY TEST", "retry"],
    ["NEXT TEST", "change"],
    ["MODE SELECT", "modes"],
    ["MAIN MENU", "title"],
  ];
  const mode = result.modeData;
  const configLabel = result.variantId === SPEED_TEST_TYPES.TIME
    ? `${mode.durationSeconds} SECOND TEST`
    : `${mode.targetWordCount} WORD TEST`;
  app().innerHTML = `
    <section class="screen speed-results-screen">
      <div class="speed-results-panel">
        ${screenBackButton("modes", true)}
        <div class="eyebrow">ENGLISH 200 // ${configLabel}</div>
        <h1>TEST COMPLETE</h1>
        <div class="speed-result-headline">
          <div><span>WPM</span><strong>${result.wpm.toFixed(1)}</strong></div>
          <div><span>ACCURACY</span><strong>${result.accuracy.toFixed(1)}%</strong></div>
          <div><span>RAW</span><strong>${mode.rawWpm.toFixed(1)}</strong></div>
        </div>
        ${(recordFlags.newWpmRecord || recordFlags.newAccuracyRecord) ? `
          <div class="speed-records">
            ${recordFlags.newWpmRecord ? "<span>NEW WPM RECORD</span>" : ""}
            ${recordFlags.newAccuracyRecord ? "<span>NEW ACCURACY RECORD</span>" : ""}
          </div>` : ""}
        <div class="speed-result-details">
          <div><span>Characters</span><strong>${result.characters.correct} correct / ${result.characters.incorrect} incorrect</strong></div>
          <div><span>Words</span><strong>${mode.exactWords} exact / ${mode.incorrectWords} incorrect</strong></div>
          <div><span>Extras</span><strong>${mode.extraCharacters}</strong></div>
          <div><span>Missed</span><strong>${result.characters.missed}</strong></div>
          <div><span>Backspaces</span><strong>${mode.backspaces}</strong></div>
          <div><span>Word deletes</span><strong>${mode.wordDeletes ?? 0}</strong></div>
          <div><span>Duration</span><strong>${(result.activeDurationMs / 1000).toFixed(1)}s</strong></div>
        </div>
        ${resultMetricHelp()}
        ${renderGlobalSubmissionMarkup(submissionState)}
        <div class="menu-list">
          ${actions.map(([label, action], index) => menuButton(
    label,
    action,
    index === selectedIndex,
  )).join("")}
        </div>
      </div>
    </section>`;
  wireMenuActions(app(), ".speed-results-panel .arcade-button", handlers);
  const speedBack = app().querySelector?.('[data-screen-back="modes"]');
  if (speedBack) speedBack.onclick = handlers.modes;
}

function renderDevPanel(selectedLevel, bossWordBank, developerSeed) {
  const isBoss = selectedLevel % 10 === 0;
  const config = isBoss ? generateBossLevel(selectedLevel) : generateLevel(selectedLevel);
  const legacyConfig = isBoss ? null : generateLegacyLevel(selectedLevel);
  const previewSeed = developerSeed || selectedLevel * 104729;
  const encounter = isBoss
    ? generateBossEncounter(bossWordBank, selectedLevel, previewSeed)
    : null;
  const fields = isBoss
    ? [
      ["actualLevel", selectedLevel],
      ["bossLevel", true],
      ["virtualDifficultyLevel", `${getCampaignDifficultyLevel(selectedLevel).toFixed(2)} (ignored)`],
      ["bossIndex", config.bossIndex],
      ["segmentCount", config.segmentCount],
      ["wordsPerSegment", config.wordsPerSegment],
      ["totalWordCount", config.totalWordCount],
      ["attemptSeed", previewSeed],
      ["tierPatterns", encounter.tierPatterns.join(" | ")],
      ["wordSources", encounter.wordSources.join(", ")],
      ["shortCount", encounter.tierCounts.short],
      ["mediumCount", encounter.tierCounts.medium],
      ["longCount", encounter.tierCounts.long],
      ["veryLongCount", encounter.tierCounts["very-long"]],
      ["targetCharacters", config.targetCharacters],
      ["targetRange", `${config.minimumCharacters}-${config.maximumCharacters}`],
      ["minimumSelectedWordLength", encounter.metrics.minimumSelectedWordLength],
      ["averageSelectedWordLength", encounter.metrics.averageSelectedWordLength.toFixed(2)],
      ["longestSelectedWord", encounter.metrics.longestSelectedWord],
      ["totalRequiredCharacters", encounter.metrics.totalRequiredCharacters],
      ["targetWPM", config.targetWPM],
      ["idealTypingSeconds", encounter.timing.idealTypingSeconds.toFixed(2)],
      ["transitionAllowance", encounter.timing.transitionAllowanceSeconds.toFixed(2)],
      ["effectiveTimeLimitSec", encounter.timing.effectiveTimeLimitSec.toFixed(2)],
      ["generationAttempt", encounter.generationAttempt],
      ["fallbackUsed", encounter.fallbackUsed],
    ]
    : [
      ["actualLevel", selectedLevel],
      ["bossLevel", config.isBoss],
      ["virtualDifficultyLevel", config.virtualDifficultyLevel.toFixed(2)],
      ["wordCount", config.wordCount],
      ["newWordLengthRange", `${config.minWordLength}-${config.maxWordLength}`],
      ["targetAverageWordLength", config.targetAverageWordLength.toFixed(2)],
      ["newSpawnIntervalMs", config.spawnIntervalMs.toFixed(2)],
      ["newWordSpeedPxPerSec", config.wordSpeedPxPerSec.toFixed(2)],
      ["newActiveWordCap", config.maxSimultaneousWords],
      ["newVocabularyTier", config.wordTier],
      ["legacyWordLengthRange", `${legacyConfig.minWordLength}-${legacyConfig.maxWordLength}`],
      ["legacySpawnIntervalMs", legacyConfig.spawnIntervalMs.toFixed(2)],
      ["legacyWordSpeedPxPerSec", legacyConfig.wordSpeedPxPerSec.toFixed(2)],
      ["legacyActiveWordCap", legacyConfig.maxSimultaneousWords],
      ["legacyVocabularyTier", legacyConfig.wordTier],
      ["lives", config.lives],
      ["targetWPM", config.targetWPM],
      ["world", config.world],
      ["attemptSeed", previewSeed],
    ];
  return `
    <aside class="dev-panel" aria-label="Developer level controls">
      <div class="dev-controls">
        <div class="micro-label">Direct level test</div>
        <div class="dev-level-entry">
          <input id="dev-level-input" type="number" min="1" max="100" value="${selectedLevel}" aria-label="Level number">
          <button type="button" data-dev-action="launch">LAUNCH</button>
        </div>
        <div class="dev-quick-buttons">
          ${[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 22, 42, 62, 82, 99].map((level) => `<button type="button" data-dev-level="${level}">${level}</button>`).join("")}
        </div>
      </div>
      <div>
        <dl class="dev-config">
          ${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}
        </dl>
        ${isBoss ? `
          <div class="dev-phrases">
            <span class="micro-label">Selected segments</span>
            ${encounter.segments.map((segment, index) => `<code>${index + 1}: ${segment}</code>`).join("")}
            <span class="micro-label">Words and lengths</span>
            <code>${encounter.words.map((word) => `${word} (${word.length})`).join(", ")}</code>
          </div>` : ""}
      </div>
    </aside>`;
}

export function renderLevelSelect(
  save,
  selectedLevel,
  devMode,
  bossWordBank,
  developerSeed,
  handlers,
) {
  const furthestLevel = Math.max(1, Math.min(100, Number(save.currentFurthestLevel) || 1));
  const safeSelected = Math.max(1, Math.min(100, Number(selectedLevel) || 1));
  const levels = save.levels || {};
  const resultFor = (level) => levels[String(level)] || levels[level] || null;
  const isCleared = (result) => Boolean(result?.grade && result.grade !== "Fail");
  const clearedTotal = Object.values(levels).filter(isCleared).length;
  const selectedResult = resultFor(safeSelected);
  const selectedCleared = isCleared(selectedResult);
  const selectedBoss = safeSelected % 10 === 0;
  const selectedLocked = !devMode && safeSelected > furthestLevel;
  const selectedState = selectedCleared
    ? "cleared"
    : selectedLocked
      ? "locked"
      : devMode && safeSelected > furthestLevel
        ? "developer"
        : "ready";
  const selectedStateLabel = selectedState === "cleared"
    ? "Cleared"
    : selectedState === "locked"
      ? "Locked"
      : selectedState === "developer"
        ? "Developer access"
        : selectedBoss
          ? "Boss ready"
          : "Ready";
  const metric = (value, suffix = "") => Number.isFinite(Number(value))
    ? `${Number(value).toFixed(suffix ? 1 : 0)}${suffix}`
    : "—";
  const selectedGrade = selectedCleared ? selectedResult.grade : "—";
  const selectedWpm = metric(selectedResult?.bestWPM ?? selectedResult?.wpm);
  const selectedAccuracy = metric(selectedResult?.bestAccuracy ?? selectedResult?.accuracy, "%");

  const sectors = Array.from({ length: 10 }, (_, sectorIndex) => {
    const sector = sectorIndex + 1;
    const firstLevel = sectorIndex * 10 + 1;
    const lastLevel = firstLevel + 9;
    const sectorLevels = Array.from({ length: 10 }, (_, offset) => firstLevel + offset);
    const clearedCount = sectorLevels.filter((level) => isCleared(resultFor(level))).length;
    const sectorSelected = safeSelected >= firstLevel && safeSelected <= lastLevel;
    const sectorLocked = !devMode && firstLevel > furthestLevel;
    const selectedBossInSector = sectorSelected && selectedBoss;
    const sectorStatus = clearedCount === 10
      ? "10 / 10 CLEAR"
      : sectorLocked
        ? "LOCKED"
        : `${clearedCount} / 10 CLEAR`;
    const nodes = sectorLevels.map((level) => {
      const result = resultFor(level);
      const cleared = isCleared(result);
      const boss = level % 10 === 0;
      const locked = !devMode && level > furthestLevel;
      const developerAccess = devMode && level > furthestLevel;
      const frontier = !devMode && level === furthestLevel && !cleared;
      const classes = [
        "campaign-node",
        cleared ? "is-complete" : "",
        boss ? "is-boss" : "",
        locked ? "is-locked" : "",
        developerAccess ? "dev-access is-locked" : "",
        frontier ? "is-frontier" : "",
        level === safeSelected ? "selected" : "",
      ].filter(Boolean).join(" ");
      const stateText = cleared
        ? result.grade
        : locked
          ? "LOCKED"
          : developerAccess
            ? "DEV"
            : boss
              ? "BOSS"
              : "READY";
      const descriptor = boss ? "Boss" : "Standard mission";
      const availability = cleared
        ? `cleared with grade ${result.grade}`
        : locked
          ? "locked"
          : developerAccess
            ? "developer access"
            : "ready";
      return `<button type="button" class="${classes}" data-level="${level}"
        ${locked ? "disabled" : ""}
        aria-label="Level ${level}, ${descriptor}, ${availability}"
        aria-current="${level === safeSelected ? "true" : "false"}">
          <span class="campaign-node-marker" aria-hidden="true"><span class="campaign-node-number">${String(level).padStart(2, "0")}</span></span>
          <span class="campaign-node-state">${stateText}</span>
        </button>`;
    }).join("");
    return `<section class="campaign-sector${sectorSelected ? " is-current" : ""}${selectedBossInSector ? " has-boss-selection" : ""}${sectorLocked ? " is-locked" : ""}" data-campaign-sector="${sector}" aria-label="Sector ${sector}, levels ${firstLevel} to ${lastLevel}">
      <header class="campaign-sector-header">
        <span class="campaign-sector-kicker">Sector ${String(sector).padStart(2, "0")}</span>
        <strong>${String(firstLevel).padStart(2, "0")}–${String(lastLevel).padStart(2, "0")}</strong>
        <span>${sectorStatus}</span>
      </header>
      <div class="campaign-sector-track">${nodes}</div>
    </section>`;
  }).join("");

  app().innerHTML = `
    <section class="screen level-screen campaign-progress-screen ${devMode ? "dev-enabled" : ""}">
      <div class="campaign-progress-shell">
        <header class="campaign-progress-topline">
          ${screenBackButton()}
          <div class="campaign-progress-context"><strong>WORDSTRIKE</strong><span>CAMPAIGN ROUTE</span></div>
          <div class="campaign-progress-count">UNLOCKED <strong>${devMode ? 100 : furthestLevel}</strong><span>/ 100</span></div>
        </header>

        <div class="campaign-progress-overview">
          <div class="campaign-progress-intro">
            <p class="campaign-progress-kicker">Progression map</p>
            <h1>Campaign Route</h1>
            <p class="campaign-progress-lead">Advance through ten sectors of increasing pressure. Each sector ends in a boss encounter; cleared missions keep their grade on the route.</p>
            <div class="campaign-progress-tools">
              ${tutorialHelpButton("campaign", "Campaign")}
              ${selectedBoss ? tutorialHelpButton("boss", "Boss battles") : ""}
            </div>
          </div>

          <aside class="campaign-mission-briefing${selectedBoss ? " is-boss" : ""}" aria-label="Selected campaign mission">
            <div class="campaign-mission-heading">
              <span class="campaign-mission-label">Selected mission</span>
              <strong>${selectedBoss ? "BOSS " : "LEVEL "}${String(safeSelected).padStart(2, "0")}</strong>
            </div>
            <span class="campaign-mission-status" data-state="${selectedState}">${selectedStateLabel}</span>
            <div class="campaign-mission-metrics">
              <div class="campaign-mission-metric"><span>Grade</span><strong>${selectedGrade}</strong></div>
              <div class="campaign-mission-metric"><span>Best WPM</span><strong>${selectedWpm}</strong></div>
              <div class="campaign-mission-metric"><span>Accuracy</span><strong>${selectedAccuracy}</strong></div>
            </div>
            <div class="campaign-mission-command"><kbd>ENTER</kbd><span>${selectedLocked ? "Mission unavailable" : selectedBoss ? "Launch boss encounter" : "Launch selected mission"}</span></div>
          </aside>
        </div>

        <div class="campaign-route-scroll" data-campaign-route-scroll>
          ${devMode ? renderDevPanel(safeSelected, bossWordBank, developerSeed) : ""}
          <div class="campaign-route" id="campaign-route" aria-label="Campaign progression map">${sectors}</div>
        </div>

        <footer class="campaign-progress-footer">
          <span>← → move · ↑ ↓ change row · Enter launch · Esc modes</span>
          <span>${clearedTotal} missions cleared</span>
        </footer>
      </div>
    </section>`;

  app().querySelector('[data-action="back"]').onclick = handlers.back;
  const campaignHelp = app().querySelector('[data-tutorial-help="campaign"]');
  const bossHelp = app().querySelector('[data-tutorial-help="boss"]');
  if (campaignHelp) campaignHelp.onclick = handlers.helpCampaign;
  if (bossHelp) bossHelp.onclick = handlers.helpBoss;
  app().querySelectorAll(".campaign-node:not(:disabled)").forEach((node) => {
    node.onclick = () => handlers.select(Number(node.dataset.level));
  });
  const selectedNode = app().querySelector(".campaign-node.selected");
  selectedNode?.focus?.({ preventScroll: true });
  const scrollOwner = app().querySelector("[data-campaign-route-scroll]");
  if (selectedNode && scrollOwner) {
    const ownerRect = scrollOwner.getBoundingClientRect?.();
    const nodeRect = selectedNode.getBoundingClientRect?.();
    if (ownerRect && nodeRect) {
      const inset = 18;
      if (nodeRect.bottom > ownerRect.bottom - inset) {
        scrollOwner.scrollTop += nodeRect.bottom - ownerRect.bottom + inset;
      } else if (nodeRect.top < ownerRect.top + inset) {
        scrollOwner.scrollTop += nodeRect.top - ownerRect.top - inset;
      }
    }
  }

  if (devMode) {
    const input = app().querySelector("#dev-level-input");
    const launchInputLevel = () => handlers.devLaunch(Number(input.value));
    input.onchange = () => handlers.devInspect(Number(input.value));
    input.onkeydown = (event) => {
      event.stopPropagation();
      if (event.key === "Enter") launchInputLevel();
    };
    app().querySelector('[data-dev-action="launch"]').onclick = launchInputLevel;
    app().querySelectorAll("[data-dev-level]").forEach((button) => {
      button.onclick = () => handlers.devLaunch(Number(button.dataset.devLevel));
    });
  }
}

export function renderDevModeIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "dev-mode-indicator";
  indicator.textContent = "DEV MODE";
  document.body.append(indicator);
}

export function renderDevSessionDiagnostics() {
  const diagnostics = document.createElement("aside");
  diagnostics.className = "dev-session-diagnostics";
  diagnostics.textContent = getSessionDiagnosticText();
  document.body.append(diagnostics);
}

export function renderGameplayShell(
  levelNumber,
  lives,
  config,
  devMode = false,
  attempt = {},
  handlers = {},
) {
  app().innerHTML = `
    <section class="screen game-screen">
      <header class="hud">
        <div class="hud-leading">
          ${gameplayPauseButton()}
          <div>
          <span class="micro-label">Level</span>
          <span class="hud-value" id="hud-level">${String(levelNumber).padStart(2, "0")}</span><br>
          <span>WPM <span class="hud-value" id="hud-wpm">0</span></span>
          <span>&nbsp; ACC <span class="hud-value" id="hud-accuracy">100%</span></span>
          </div>
        </div>
        <div class="hud-center">
          <span class="micro-label">Core integrity</span><br>
          <span class="lives" id="hud-lives">${"◆".repeat(lives)}</span>
        </div>
        <div class="hud-right">
          <span class="micro-label">Score</span>
          <span class="hud-value" id="hud-score">0</span><br>
          <span>COMBO <span class="hud-value" id="hud-combo">x1.0</span></span>
        </div>
      </header>
      ${devMode ? `
        <aside class="dev-runtime-panel" id="dev-runtime-panel">
          actual=${levelNumber} // boss=${config.isBoss === true}
          // virtual=${Number(config.virtualDifficultyLevel).toFixed(2)}
          // words=${config.wordCount} // speed=${Number(config.wordSpeedPxPerSec).toFixed(2)}px/s
          // spawn=${Number(config.spawnIntervalMs).toFixed(2)}ms
          // cap=${config.maxSimultaneousWords}
          // range=${config.minWordLength}-${config.maxWordLength}
          // avg=${Number(config.targetAverageWordLength).toFixed(2)}
          // tier=${config.wordTier}
          // seed=${attempt.attemptSeed} // selected=${attempt.selectedWords?.join(",")}
          // queue=${attempt.spawnQueue?.join(",")} // ${getSessionDiagnosticText()}
        </aside>` : ""}
      <div class="play-area" id="play-area">
        <div class="core" aria-label="Central core"></div>
      </div>
    </section>`;
  wireGameplayAction(app(), "pause", handlers.pause);
}

export function updateHud(game) {
  const wpm = calculateWPM(game.correctCharacters, game.elapsedMs);
  const accuracy = calculateAccuracy(
    game.correctKeystrokes,
    game.totalKeystrokes,
    game.missedCharacters,
  );
  const multiplier = Math.min(1 + Math.floor(game.combo / 5) * 0.1, 3);
  const values = {
    "#hud-wpm": Math.round(wpm),
    "#hud-accuracy": `${accuracy.toFixed(0)}%`,
    "#hud-lives": "◆".repeat(Math.max(0, game.lives)),
    "#hud-score": game.score.toLocaleString(),
    "#hud-combo": `x${multiplier.toFixed(1)}`,
  };
  for (const [selector, value] of Object.entries(values)) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }
  const devRuntime = document.querySelector("#dev-runtime-panel");
  if (devRuntime) {
    const state = game.targetingState;
    const candidateWords = game.words.filter((word) => state.candidateIds.includes(word.id));
    devRuntime.textContent = [
      `actual=${game.levelNumber}`,
      `boss=${game.config.isBoss === true}`,
      `virtual=${Number(game.config.virtualDifficultyLevel).toFixed(2)}`,
      `wordCount=${game.config.wordCount}`,
      `speed=${Number(game.config.wordSpeedPxPerSec).toFixed(2)}px/s`,
      `spawn=${Number(game.config.spawnIntervalMs).toFixed(2)}ms`,
      `cap=${game.config.maxSimultaneousWords}`,
      `range=${game.config.minWordLength}-${game.config.maxWordLength}`,
      `targetAvg=${Number(game.config.targetAverageWordLength).toFixed(2)}`,
      `tier=${game.config.wordTier}`,
      `seed=${game.attemptSeed}`,
      `selected=${game.selectedWords.join(",")}`,
      `queue=${game.wordQueue.join(",")}`,
      `targeting=${state.mode}`,
      `prefixLength=${state.prefix.length}`,
      `candidates=${state.candidateIds.length}`,
      `candidateIds=${state.candidateIds.join(",") || "none"}`,
      `candidateTexts=${candidateWords.map((word) => word.text).join(",") || "none"}`,
      `activeTarget=${state.activeTargetId ?? "none"}`,
      `offsets=${game.words.map((word) => `${word.id}:${(word.separationX || 0).toFixed(1)},${(word.separationY || 0).toFixed(1)}`).join("|") || "none"}`,
      getSessionDiagnosticText(),
    ].join(" // ");
  }
}

function bossIntroLabel(game) {
  const elapsed = game.introElapsedMs;
  if (elapsed < 1300) return "BOSS ENCOUNTER";
  if (elapsed < 1750) return "3";
  if (elapsed < 2150) return "2";
  if (elapsed < 2550) return "1";
  return "TYPE";
}

function bossDiagnosticText(config, attempt) {
  const encounter = attempt.encounter;
  if (!encounter) return "";
  return [
    `level=${config.level}`,
    `actual=${config.level}`,
    "boss=true",
    `virtual=${getCampaignDifficultyLevel(config.level).toFixed(2)} (ignored)`,
    `seed=${attempt.attemptSeed}`,
    `vocabulary=${config.vocabularySource || "typing-test+curated-long"}`,
    `profile=${config.segmentCount}x${config.wordsPerSegment}`,
    `words=${config.totalWordCount}`,
    `sequence=${attempt.sequenceIndex ?? 1}`,
    `segmentWords=${config.wordsPerSegment}`,
    `tierPatterns=${(encounter.tierPatterns || config.tierPatterns || []).map((pattern) => pattern.join(",")).join(" | ")}`,
    `wordSources=${(encounter.wordSources || config.wordSources || []).join(",")}`,
    `short=${(encounter.tierCounts || config.tierCounts || {}).short ?? 0}`,
    `medium=${(encounter.tierCounts || config.tierCounts || {}).medium ?? 0}`,
    `long=${(encounter.tierCounts || config.tierCounts || {}).long ?? 0}`,
    `veryLong=${(encounter.tierCounts || config.tierCounts || {})["very-long"] ?? 0}`,
    `targetCharacters=${config.targetCharacters}`,
    `selectedMin=${encounter.metrics.minimumSelectedWordLength}`,
    `selectedAvg=${encounter.metrics.averageSelectedWordLength.toFixed(2)}`,
    `selectedLongest=${encounter.metrics.longestSelectedWord}`,
    `characters=${encounter.metrics.totalRequiredCharacters}`,
    `targetRange=${config.minimumCharacters}-${config.maximumCharacters}`,
    `targetWPM=${config.targetWPM}`,
    `ideal=${encounter.timing.idealTypingSeconds.toFixed(2)}s`,
    `transitions=${encounter.timing.transitionAllowanceSeconds.toFixed(2)}s`,
    `effective=${encounter.timing.effectiveTimeLimitSec.toFixed(2)}s`,
    `attempt=${encounter.generationAttempt}`,
    `fallback=${encounter.fallbackUsed}`,
    `segments=${encounter.segments.join(" | ")}`,
    `lengths=${encounter.words.map((word) => `${word}:${word.length}`).join(",")}`,
    getSessionDiagnosticText(),
  ].join(" // ");
}

export function renderBossShell(levelNumber, config, devMode = false, attempt = {}, handlers = {}) {
  app().innerHTML = `
    <section class="screen boss-screen">
      <header class="boss-hud">
        <div class="boss-hud-leading">
          ${gameplayPauseButton()}
          <div>
          <span class="boss-hud-value">BOSS ${config.bossIndex} / 10</span><br>
          <span id="boss-phrase-count">SEQUENCE 1 / ${config.segmentCount}</span>
          <span>&nbsp; WORDS <span class="boss-hud-value" id="boss-word-count">0 / ${config.totalWordCount}</span></span>
          </div>
        </div>
        <div class="boss-timer-wrap">
          <span class="micro-label">Time</span>
          <strong class="boss-timer" id="boss-timer">${config.timeLimitSec.toFixed(1)}</strong>
        </div>
        <div class="boss-hud-right">
          <span>SCORE <span class="boss-hud-value" id="boss-score">0</span></span><br>
          <span>COMBO <span class="boss-hud-value" id="boss-combo">0</span></span>
          <span>&nbsp; WPM <span class="boss-hud-value" id="boss-wpm">0</span></span>
          <span>&nbsp; ACC <span class="boss-hud-value" id="boss-accuracy">100%</span></span>
        </div>
      </header>
      ${devMode ? `
        <aside class="dev-runtime-panel boss-dev-runtime" id="dev-runtime-panel">
          ${bossDiagnosticText(config, attempt)}
        </aside>` : ""}
      <div class="boss-arena">
        <div class="boss-intro" id="boss-intro">
          <strong id="boss-intro-title">BOSS ENCOUNTER</strong>
          <span>MIXED-LENGTH WORD SEQUENCE</span>
          <p>COMPLETE EVERY SEQUENCE BEFORE TIME EXPIRES</p>
          ${config.bossIndex >= 8 ? "<small>DIFFICULTY: EXTREME</small>" : ""}
        </div>
        <div class="boss-phrase-frame">
          <div class="boss-phrase" id="boss-phrase" aria-label="Boss phrase"></div>
          <div class="boss-progress"><div id="boss-progress-fill"></div></div>
          <div class="boss-instruction" id="boss-instruction">TYPE THE SEQUENCE</div>
        </div>
      </div>
    </section>`;
  wireGameplayAction(app(), "pause", handlers.pause);
}

export function updateBossHud(game) {
  const accuracy = calculateAccuracy(
    game.correctKeystrokes,
    game.totalKeystrokes,
    game.missedCharacters,
  );
  const wpm = calculateWPM(game.correctCharacters, game.elapsedMs);
  const timer = document.querySelector("#boss-timer");
  if (timer) {
    timer.textContent = (game.remainingMs / 1000).toFixed(1);
    timer.classList.toggle("warning", game.remainingMs <= 10000 && game.remainingMs > 5000);
    timer.classList.toggle("danger", game.remainingMs <= 5000);
  }
  const intro = document.querySelector("#boss-intro");
  const introTitle = document.querySelector("#boss-intro-title");
  const frame = document.querySelector(".boss-phrase-frame");
  if (introTitle) introTitle.textContent = bossIntroLabel(game);
  if (intro) intro.hidden = game.phase !== "INTRO";
  if (frame) {
    frame.classList.toggle("hidden", game.phase === "INTRO");
    frame.classList.toggle("transition", game.phase === "TRANSITION");
  }
  const completedWords = game.phrases
    .slice(0, game.phraseIndex)
    .reduce((sum, segment) => sum + segment.split(" ").length, 0);
  const activePrefix = game.currentPhrase.slice(0, game.phraseCharIndex);
  const activeCompletedWords = (activePrefix.match(/ /g) || []).length +
    (game.phraseCharIndex >= game.currentPhrase.length && game.currentPhrase.length ? 1 : 0);
  const totalSequences = Math.max(1, game.phrases.length);
  const displayedSequenceNumber = Math.max(
    1,
    Math.min(
      totalSequences,
      Number.isInteger(game.displayedSequenceNumber)
        ? game.displayedSequenceNumber
        : game.phraseIndex + 1,
    ),
  );
  const values = {
    "#boss-phrase-count": `SEQUENCE ${displayedSequenceNumber} / ${totalSequences}`,
    "#boss-word-count": `${Math.min(completedWords + activeCompletedWords, game.config.totalWordCount)} / ${game.config.totalWordCount}`,
    "#boss-score": game.score.toLocaleString(),
    "#boss-combo": game.combo,
    "#boss-wpm": Math.round(wpm),
    "#boss-accuracy": `${accuracy.toFixed(1)}%`,
    "#boss-instruction": game.phase === "TRANSITION" ? "SEQUENCE COMPLETE" : "TYPE THE SEQUENCE",
  };
  for (const [selector, value] of Object.entries(values)) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }
  const devRuntime = document.querySelector("#dev-runtime-panel");
  if (devRuntime) {
    devRuntime.textContent = bossDiagnosticText(game.config, {
      attemptSeed: game.attemptSeed,
      sequenceIndex: game.displayedSequenceNumber,
      encounter: {
        generationAttempt: game.config.generationAttempt,
        fallbackUsed: game.config.fallbackUsed,
        segments: game.phrases,
        words: game.config.words,
        tierPatterns: game.config.tierPatterns,
        tierCounts: game.config.tierCounts,
        wordSources: game.config.wordSources,
        metrics: {
          minimumSelectedWordLength: game.config.minimumSelectedWordLength,
          averageSelectedWordLength: game.config.averageSelectedWordLength,
          longestSelectedWord: game.config.longestSelectedWord,
          totalRequiredCharacters: game.config.totalRequiredCharacters,
        },
        timing: game.config,
      },
    });
  }
}

export function showPauseOverlay(selectedIndex, handlers) {
  document.querySelector(".pause-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "pause-overlay";
  overlay.innerHTML = `
    <div class="pause-panel">
      <div class="eyebrow">Simulation suspended</div>
      <h2>PAUSED</h2>
      <div class="menu-list">
        ${menuButton("RESUME", "resume", selectedIndex === 0)}
        ${menuButton("RETRY", "retry", selectedIndex === 1)}
        ${menuButton("MODE SELECT", "modes", selectedIndex === 2)}
        ${menuButton("MAIN MENU", "title", selectedIndex === 3)}
      </div>
      <p class="footer-hint">ESC RESUME</p>
    </div>`;
  document.querySelector(".game-screen, .boss-screen")?.append(overlay);
  overlay.querySelector('[data-action="resume"]').onclick = handlers.resume;
  overlay.querySelector('[data-action="retry"]').onclick = handlers.retry;
  overlay.querySelector('[data-action="modes"]').onclick = handlers.modes;
  overlay.querySelector('[data-action="title"]').onclick = handlers.title;
  overlay.querySelectorAll(".arcade-button").forEach((button, index) => {
    button.onmouseenter = () => {
      overlay.querySelectorAll(".arcade-button").forEach(
        (item) => item.classList.remove("selected"),
      );
      button.classList.add("selected");
      handlers.select?.(index);
    };
  });
}

export function showEndlessPauseOverlay(selectedIndex, handlers) {
  document.querySelector(".pause-overlay")?.remove();
  const actions = [
    ["RESUME", "resume"],
    ["RESTART", "restart"],
    ["MODE SELECT", "modes"],
    ["MAIN MENU", "title"],
  ];
  const overlay = document.createElement("div");
  overlay.className = "pause-overlay";
  overlay.innerHTML = `
    <div class="pause-panel">
      <div class="eyebrow">Endless run suspended</div>
      <h2>PAUSED</h2>
      <div class="menu-list">${actions.map(([label, action], index) => (
    menuButton(label, action, index === selectedIndex)
  )).join("")}</div>
      <p class="footer-hint">ESC RESUME</p>
    </div>`;
  document.querySelector(".endless-screen")?.append(overlay);
  wireMenuActions(overlay, ".arcade-button", handlers);
}

export const SPEED_TEST_PAUSE_ACTIONS = Object.freeze([
  Object.freeze(["RESUME", "resume"]),
  Object.freeze(["RESTART TEST", "restart"]),
  Object.freeze(["MODE SELECT", "modes"]),
  Object.freeze(["MAIN MENU", "title"]),
]);

export function showSpeedTestPauseOverlay(selectedIndex, handlers) {
  document.querySelector(".pause-overlay")?.remove();
  document.querySelector(".speed-test-screen")?.classList.add("paused");
  const actions = SPEED_TEST_PAUSE_ACTIONS;
  const overlay = document.createElement("div");
  overlay.className = "pause-overlay";
  overlay.innerHTML = `
    <div class="pause-panel">
      <div class="eyebrow">Typing Test suspended</div>
      <h2>PAUSED</h2>
      <div class="menu-list">${actions.map(([label, action], index) => (
    menuButton(label, action, index === selectedIndex)
  )).join("")}</div>
      <p class="footer-hint">ESC RESUME</p>
    </div>`;
  document.querySelector(".speed-test-screen")?.append(overlay);
  for (const [, action] of actions) {
    overlay.querySelector(`[data-action="${action}"]`).onclick = handlers[action];
  }
  overlay.querySelectorAll(".arcade-button").forEach((button, index) => {
    button.onmouseenter = () => handlers.select?.(index);
  });
}

function submissionButton(label, action, disabled = false) {
  return `<button class="arcade-button" data-action="${action}"${disabled ? " disabled aria-disabled=\"true\"" : ""}>${label}</button>`;
}

export function renderGlobalSubmissionMarkup(state = {}) {
  const boardDetails = ({
    "campaign-highest-level-v1": ["CAMPAIGN", "view-campaign-leaderboard"],
    "typing-60s-english200-v1": ["60S", "view-typing-60-leaderboard"],
    "typing-15s-english200-v1": ["15S", "view-typing-15-leaderboard"],
    "endless-v1": ["ENDLESS", "view-endless-leaderboard"],
  }[state.boardKey]) || (state.mode === "typing"
    ? ["TYPING TEST", "view-typing-60-leaderboard"]
    : null);
  if (!boardDetails) return "";
  const [boardLabel, viewAction] = boardDetails;
  const viewLabel = `VIEW ${boardLabel} LEADERBOARD`;
  let message = "This run is not eligible for global submission.";
  let buttons = submissionButton(viewLabel, viewAction);
  if (state.status === "ineligible" && state.reason === "signed-out") {
    message = "Sign in to submit this score globally.";
    buttons = submissionButton("CONTINUE WITH GOOGLE", "result-google-sign-in") + submissionButton(viewLabel, viewAction);
  } else if (state.status === "ineligible" && state.reason === "username-required") {
    message = "Choose a public username before submitting scores.";
    buttons = submissionButton("SET USERNAME", "open-account-settings") + submissionButton(viewLabel, viewAction);
  } else if (state.status === "ineligible" && state.reason === "campaign-failed") {
    message = "Only successfully completed levels are eligible for the Campaign leaderboard.";
  } else if (state.status === "ineligible" && state.reason === "unsupported-test") {
    message = "Only 15-second and 60-second English 200 tests are eligible for global submission.";
  } else if (state.status === "checking") {
    message = "Checking global account…";
    buttons = "";
  } else if (state.status === "ready") {
    if (state.automatic) {
      message = "Submitting global score…";
      buttons = "";
    } else {
      message = "This result is saved locally.";
      buttons = submissionButton("SUBMIT GLOBAL SCORE", "submit-global-score") + submissionButton(viewLabel, viewAction);
    }
  } else if (state.status === "submitting") {
    message = "Submitting global score…";
    buttons = "";
  } else if (state.status === "submitted") {
    message = `Global score submitted.${state.rank ? `<strong>Rank #${state.rank}</strong>` : ""}`;
    buttons = submissionButton(viewLabel, viewAction);
  } else if (state.status === "already-submitted") {
    message = `This result was already submitted.${state.rank ? `<strong>Rank #${state.rank}</strong>` : ""}`;
    buttons = submissionButton(viewLabel, viewAction);
  } else if (state.status === "offline") {
    message = "Global submission is unavailable while offline.<span>Your local result is safe.</span>";
    buttons = submissionButton("RETRY SUBMISSION", "retry-global-score") + submissionButton(viewLabel, viewAction);
  } else if (state.status === "error") {
    message = "Global submission failed.<span>Your local result is safe.</span>";
    buttons = submissionButton("RETRY SUBMISSION", "retry-global-score") + submissionButton(viewLabel, viewAction);
  }
  const busy = ["checking", "submitting"].includes(state.status) || (state.status === "ready" && state.automatic);
  return `<section id="global-submission-region" class="global-submission" aria-live="polite"${busy ? " aria-busy=\"true\"" : ""}><p>${message}</p><div class="global-submission-actions">${buttons}</div></section>`;
}

export function updateGlobalSubmissionRegion(state) {
  const current = document.querySelector("#global-submission-region");
  if (!current) return false;
  current.outerHTML = renderGlobalSubmissionMarkup(state);
  return true;
}

export function renderEndlessResults(result, selectedIndex, handlers, submissionState = {}) {
  const data = result.modeData;
  const actions = [
    ["RETRY", "retry"],
    ["MODE SELECT", "modes"],
    ["MAIN MENU", "title"],
  ];
  app().innerHTML = `
    <section class="screen endless-results-screen">
      <div class="endless-results-panel">
        ${screenBackButton("modes", true)}
        <div class="eyebrow">Endless mode</div>
        <h1>RUN OVER</h1>
        <div class="endless-result-headline">
          <div><span>Highest stage</span><strong>${data.highestStage}</strong></div>
          <div><span>Score</span><strong>${result.score.toLocaleString()}</strong></div>
          <div><span>Survival time</span><strong>${(data.survivalTimeMs / 1000).toFixed(1)}s</strong></div>
        </div>
        <div class="endless-result-details">
          <div><span>Words completed</span><strong>${data.wordsCompleted}</strong></div>
          <div><span>Stage progress</span><strong>${data.stageProgress} / ${getEndlessWordsPerStage(data.finalStage ?? data.highestStage)}</strong></div>
          <div><span>Accuracy</span><strong>${result.accuracy.toFixed(1)}%</strong></div>
          <div><span>Average WPM</span><strong>${result.wpm.toFixed(1)}</strong></div>
          <div><span>Peak WPM</span><strong>${data.peakWpm.toFixed(1)}</strong></div>
          <div><span>Final rolling WPM</span><strong>${data.finalRollingWpm.toFixed(1)}</strong></div>
          <div><span>Maximum combo</span><strong>${data.maximumCombo}</strong></div>
          <div><span>Maximum perfect streak</span><strong>${data.maximumPerfectStreak}</strong></div>
          <div><span>Core hits / breaches</span><strong>${data.coreHits} / ${data.coreBreaches}</strong></div>
          <div><span>Attempt seed</span><strong>${data.attemptSeed}</strong></div>
        </div>
        <section class="endless-score-breakdown">
          <h3>SCORE BREAKDOWN</h3>
          <div><span>SURVIVAL</span><strong>${data.survivalPoints.toLocaleString()}</strong></div>
          <div><span>WORDS</span><strong>${data.wordPoints.toLocaleString()}</strong></div>
          <div><span>STAGE BONUSES</span><strong>${data.stageBonusPoints.toLocaleString()}</strong></div>
          <div class="total"><span>TOTAL</span><strong>${result.score.toLocaleString()}</strong></div>
        </section>
        ${resultMetricHelp()}
        ${renderGlobalSubmissionMarkup(submissionState)}
        <div class="menu-list">${actions.map(([label, action], index) => (
    menuButton(label, action, index === selectedIndex)
  )).join("")}</div>
      </div>
    </section>`;
  wireMenuSelection(app(), ".endless-results-panel > .menu-list .arcade-button", handlers.select);
  const endlessBack = app().querySelector?.('[data-screen-back="modes"]');
  if (endlessBack) endlessBack.onclick = handlers.modes;
}

export function hidePauseOverlay() {
  document.querySelector(".pause-overlay")?.remove();
  document.querySelector(".speed-test-screen")?.classList.remove("paused");
}

export function renderResults(result, selectedIndex, handlers, submissionState = {}) {
  const cleared = result.grade !== "Fail";
  const canAdvance = cleared && result.levelNumber < 100;
  const actions = [
    ...(canAdvance ? [["NEXT LEVEL", "next"]] : []),
    ["RETRY", "retry"],
    ["LEVEL SELECT", "levels"],
    ["MAIN MENU", "title"],
  ];
  app().innerHTML = `
    <section class="screen results-screen">
      <div class="results-panel">
        ${screenBackButton("levels", true)}
        <div class="eyebrow">${result.isBoss
      ? `BOSS ${result.levelNumber} ${cleared ? "CLEARED" : "FAILED"}`
      : `Level ${String(result.levelNumber).padStart(2, "0")} // ${cleared ? "Core secured" : "Core breached"}`}</div>
        <div class="grade ${cleared ? `grade-${result.grade.toLowerCase()}` : "fail"}">${result.grade}</div>
        <div class="stats-grid">
          <div class="stat"><span class="micro-label">WPM</span><strong>${Math.round(result.wpm)}</strong></div>
          <div class="stat"><span class="micro-label">Accuracy</span><strong>${result.accuracy.toFixed(1)}%</strong></div>
          <div class="stat"><span class="micro-label">Max combo</span><strong>${result.maxCombo}</strong></div>
          <div class="stat"><span class="micro-label">Score</span><strong>${result.score.toLocaleString()}</strong></div>
          ${result.isBoss
    ? `<div class="stat"><span class="micro-label">Time remaining</span><strong>${result.timeRemaining.toFixed(1)}s</strong></div>
          <div class="stat"><span class="micro-label">Sequences</span><strong>${result.phrasesCompleted}/${result.phraseCount}</strong></div>`
    : `<div class="stat"><span class="micro-label">Lives</span><strong>${result.livesRemaining}/${result.startingLives}</strong></div>
          <div class="stat"><span class="micro-label">Level</span><strong>${result.levelNumber}</strong></div>`}
        </div>
        ${resultMetricHelp({ grade: true })}
        ${renderGlobalSubmissionMarkup(submissionState)}
        <div class="menu-list">
          ${actions.map(([label, action], index) => menuButton(
    label,
    action,
    selectedIndex === index,
  )).join("")}
        </div>
        <p class="footer-hint">ESC LEVEL SELECT</p>
      </div>
    </section>`;
  wireMenuActions(app(), ".results-panel .arcade-button", handlers);
  const campaignBack = app().querySelector?.('[data-screen-back="levels"]');
  if (campaignBack) campaignBack.onclick = handlers.levels;
}

export function renderSettings(save, selectedIndex, handlers, accountMarkup = "") {
  const settings = save.settings;
  const rows = [
    ["Strict mode", "strictMode", "Wrong keys break combo"],
    ["Particles", "particles", "Lightweight word burst effect"],
    ["Screen shake", "screenShake", "Damage impact movement"],
  ];
  app().innerHTML = `
    <section class="screen settings-screen">
      <div class="settings-panel">
        ${screenBackButton()}
        <div class="eyebrow">Local configuration</div>
        <h1>SETTINGS</h1>
        ${accountMarkup}
        <details class="settings-tutorials" open>
          <summary>HELP &amp; TUTORIALS</summary>
          <div class="settings-tutorial-grid">
            ${[
    ["general", "GENERAL INTRODUCTION"], ["campaign", "CAMPAIGN GUIDE"],
    ["typing", "TYPING TEST GUIDE"], ["endless", "ENDLESS GUIDE"],
    ["arcade-rush", "ARCADE RUSH GUIDE"], ["boss", "BOSS GUIDE"],
    ["leaderboards", "LEADERBOARD GUIDE"],
  ].map(([id, label]) => `<button type="button" class="text-action" data-tutorial-id="${id}">REPLAY ${label}</button>`).join("")}
          </div>
          <div class="settings-tutorial-resets">
            <button type="button" class="text-action" data-tutorial-reset="hints">RESET CONTEXTUAL HINTS</button>
            <button type="button" class="text-action danger" data-tutorial-reset="all">RESET ALL TUTORIAL PROGRESS</button>
          </div>
        </details>
        <div class="settings-list">
          ${rows.map(([label, key, description], index) => `
            <div class="setting-row ${index === selectedIndex ? "selected" : ""}">
              <div><strong>${label}</strong><br><span class="micro-label">${description}</span></div>
              <button class="toggle ${settings[key] ? "on" : ""}" data-setting="${key}">${settings[key] ? "ON" : "OFF"}</button>
            </div>`).join("")}
        </div>
        <div class="menu-list">
          ${menuButton("RESET PROGRESS", "reset", selectedIndex === 3, "danger")}
          ${menuButton("BACK", "back", selectedIndex === 4)}
        </div>
        <p class="footer-hint">↑ ↓ SELECT &nbsp;•&nbsp; ENTER TOGGLE &nbsp;•&nbsp; ESC BACK</p>
      </div>
    </section>`;
  app().querySelectorAll("[data-setting]").forEach((button) => {
    button.onclick = () => handlers.toggle(button.dataset.setting);
  });
  app().querySelector('[data-action="reset"]').onclick = handlers.reset;
  app().querySelectorAll('[data-action="back"]').forEach((button) => { button.onclick = handlers.back; });
  app().querySelectorAll("[data-tutorial-id]").forEach((button) => {
    button.onclick = () => handlers.tutorial?.(button.dataset.tutorialId);
  });
  const resetHints = app().querySelector('[data-tutorial-reset="hints"]');
  const resetTutorials = app().querySelector('[data-tutorial-reset="all"]');
  if (resetHints) resetHints.onclick = handlers.resetHints;
  if (resetTutorials) resetTutorials.onclick = handlers.resetTutorials;
  const displayNameInput = app().querySelector("#profile-name-input");
  if (displayNameInput) {
    displayNameInput.onkeydown = (event) => {
      event.stopPropagation();
      if (event.key === "Enter") handlers.saveName?.(displayNameInput.value);
      else if (event.key === "Escape") handlers.cancelName?.();
    };
    displayNameInput.focus?.();
    displayNameInput.select?.();
  }
}
