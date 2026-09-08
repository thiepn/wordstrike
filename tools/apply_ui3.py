from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new, *, required=True):
    target = ROOT / path
    source = target.read_text()
    if new in source and old not in source:
        return False
    count = source.count(old)
    if count != 1:
        if not required and count == 0:
            return False
        raise RuntimeError(f"UI3 anchor mismatch in {path}: count={count}, anchor={old[:90]!r}")
    target.write_text(source.replace(old, new, 1))
    return True


OLD_RENDER = '''export function renderModeSelect(modes, selectedIndex, handlers) {
  app().innerHTML = `
    <section class="screen mode-screen">
      <div class="mode-panel">
        ${screenBackButton("mode-title")}
        <div class="eyebrow">Select simulation</div>
        <h1>MODE SELECT</h1>
        <div class="mode-grid">
          ${modes.map((mode, index) => mode.enabled
    ? `<button class="mode-card available ${index === selectedIndex ? "selected" : ""}"
                data-mode-id="${mode.id}" data-mode-index="${index}">
              <strong>${mode.name}</strong>
              <span>${mode.shortLabel}</span>
              <small>${mode.status === "preview" ? "DEVELOPER PREVIEW" : "AVAILABLE"}</small>
            </button>`
    : `<article class="mode-card coming-soon ${index === selectedIndex ? "selected" : ""}"
                data-mode-id="${mode.id}" data-mode-index="${index}" aria-disabled="true">
              <strong>${mode.name}</strong>
              <span>${mode.shortLabel}</span>
              <small>COMING SOON</small>
            </article>`).join("")}
        </div>
        <p class="mode-description">${modes[selectedIndex]?.description || ""}</p>
        <div class="mode-menu-action">
          ${menuButton("MAIN MENU", "mode-title", selectedIndex === modes.length)}
        </div>
        <p class="footer-hint">↑ ↓ SELECT &nbsp;•&nbsp; ENTER CONFIRM &nbsp;•&nbsp; ESC BACK</p>
      </div>
    </section>`;
  app().querySelectorAll("[data-mode-index]").forEach((card) => {
    const index = Number(card.dataset.modeIndex);
    card.onmouseenter = () => handlers.select?.(index);
    if (card.matches?.("button")) {
      card.onclick = () => handlers.activate?.(card.dataset.modeId);
    }
  });
  app().querySelector(".mode-card.available.selected")?.focus({ preventScroll: true });
  const titleButtons = [...app().querySelectorAll('[data-action="mode-title"]')];
  if (!titleButtons.length) titleButtons.push(app().querySelector('[data-action="mode-title"]'));
  titleButtons.filter(Boolean).forEach((titleButton) => {
    titleButton.onclick = handlers.back;
    titleButton.onmouseenter = () => handlers.select?.(modes.length);
  });
}
'''

NEW_RENDER = '''export function renderModeSelect(modes, selectedIndex, handlers) {
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
    card.onmouseenter = () => handlers.select?.(index);
    if (card.matches?.("button")) {
      card.onclick = () => handlers.activate?.(card.dataset.modeId);
    }
  });
  const titleButtons = [...app().querySelectorAll('[data-action="mode-title"]')];
  if (!titleButtons.length) titleButtons.push(app().querySelector('[data-action="mode-title"]'));
  titleButtons.filter(Boolean).forEach((titleButton) => {
    titleButton.onclick = handlers.back;
    titleButton.onmouseenter = () => handlers.select?.(modes.length);
  });
  const focusTarget = selectedIndex === modes.length
    ? app().querySelector(`[data-mode-home-index="${modes.length}"]`)
    : app().querySelector(`[data-mode-index="${selectedIndex}"]`);
  focusTarget?.focus?.({ preventScroll: true });
}
'''

replace_once("js/ui.js", OLD_RENDER, NEW_RENDER)

replace_once(
    "index.html",
    '    <link rel="stylesheet" href="styles/screens/title.css">\n',
    '    <link rel="stylesheet" href="styles/screens/title.css">\n    <link rel="stylesheet" href="styles/screens/mode-select.css">\n',
)

# Retire the legacy panel ownership for Mode Select while preserving later screens.
replace_once(
    "style.css",
    ".mode-panel,\n.results-panel,\n.settings-panel {",
    ".results-panel,\n.settings-panel {",
)

OLD_LEGACY_MODE = '''.mode-panel {
  position: relative;
  z-index: 1;
  width: min(920px, 94vw);
}

.mode-panel h1 {
  margin: 8px 0 24px;
  color: var(--primary);
  letter-spacing: 0.1em;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.mode-card {
  min-height: 168px;
  padding: 20px 14px;
  border: 1px solid var(--locked);
  background: rgb(16 23 32 / 90%);
  color: var(--muted);
  text-align: left;
}

.mode-card strong,
.mode-card span,
.mode-card small {
  display: block;
}

.mode-card strong {
  min-height: 44px;
  color: var(--text);
  font-size: 18px;
  text-transform: uppercase;
}

.mode-card span {
  margin-top: 12px;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.mode-card small {
  margin-top: 28px;
  color: var(--locked);
  letter-spacing: 0.13em;
}

.mode-card.available {
  cursor: pointer;
}

.mode-card.available small {
  color: var(--success);
}

.mode-card.selected {
  border-color: var(--secondary);
  box-shadow: inset 3px 0 var(--secondary), 0 0 18px rgb(255 60 172 / 14%);
}

.mode-card.available:hover,
.mode-card.available:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: inset 3px 0 var(--primary), 0 0 18px rgb(0 255 242 / 18%);
}

.mode-card.coming-soon {
  opacity: 0.58;
  color: var(--text-disabled);
}

.mode-menu-action {
  width: min(330px, 100%);
  margin: 18px auto 0;
}

.mode-menu-action .arcade-button {
  width: 100%;
}

.mode-description {
  min-height: 24px;
  margin: 20px 0 0;
  color: var(--muted);
}

'''
replace_once("style.css", OLD_LEGACY_MODE, "")

OLD_MOBILE_MODE = '''  .mode-screen {
    align-items: start;
    overflow-y: auto;
  }

  .mode-panel {
    padding: 14px;
    text-align: left;
  }

  .mode-panel .screen-back-button {
    margin-bottom: 8px;
  }

  .mode-panel h1 {
    margin: 3px 0 12px;
    font-size: 24px;
  }

  .mode-panel .eyebrow {
    font-size: 10px;
    letter-spacing: 0.14em;
  }

  .mode-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    max-height: none;
    overflow: visible;
  }

  .mode-card {
    min-width: 0;
    min-height: 104px;
    padding: 12px 10px;
  }

  .mode-card strong {
    min-height: 0;
    font-size: 14px;
    line-height: 1.15;
  }

  .mode-card span {
    margin-top: 6px;
    font-size: 9px;
    letter-spacing: 0.06em;
  }

  .mode-card small {
    margin-top: 10px;
    font-size: 9px;
    letter-spacing: 0.08em;
  }

  .mode-description {
    min-height: 0;
    margin-top: 10px;
    font-size: 11px;
  }

  .mode-menu-action {
    margin-top: 10px;
  }

  .mode-panel .footer-hint {
    margin-top: 10px;
    font-size: 9px;
  }

'''
replace_once("style.css", OLD_MOBILE_MODE, "")

replace_once(
    "styles/ui-system.css",
    ".mode-panel h1,\n.endless-ready-panel h1,",
    ".endless-ready-panel h1,",
)
replace_once(
    "styles/ui-system.css",
    "  .mode-panel,\n  .results-panel,",
    "  .results-panel,",
)

OLD_UI1_MODE_COMPAT = '''.mode-card,
.level-tile {
  border-color: var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  box-shadow: none;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

.mode-card.available:hover,
.mode-card.available:focus-visible,
.level-tile:hover,
.level-tile:focus-visible {
  border-color: var(--color-border-strong);
  background: var(--color-surface-hover);
  box-shadow: var(--shadow-elevation-subtle);
}

.mode-card.selected,
.level-tile.selected {
  border-color: rgb(0 255 242 / 48%);
  background: var(--color-accent-soft);
  box-shadow: inset 2px 0 var(--color-accent);
}

.mode-card.selected {
  border-color: rgb(255 60 172 / 50%);
  background: var(--color-special-soft);
  box-shadow: inset 2px 0 var(--color-special);
}

'''
NEW_UI1_LEVEL_COMPAT = '''.level-tile {
  border-color: var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  box-shadow: none;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

.level-tile:hover,
.level-tile:focus-visible {
  border-color: var(--color-border-strong);
  background: var(--color-surface-hover);
  box-shadow: var(--shadow-elevation-subtle);
}

.level-tile.selected {
  border-color: rgb(0 255 242 / 48%);
  background: var(--color-accent-soft);
  box-shadow: inset 2px 0 var(--color-accent);
}

'''
replace_once("styles/ui-system.css", OLD_UI1_MODE_COMPAT, NEW_UI1_LEVEL_COMPAT)

print("UI3 Mode Select migration applied.")
