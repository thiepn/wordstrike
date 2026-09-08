from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new, *, required=True):
    target = ROOT / path
    source = target.read_text()
    if new in source and old not in source:
        return False
    if old not in source:
        if required:
            raise RuntimeError(f"UI2 anchor missing in {path}: {old[:80]!r}")
        return False
    if source.count(old) != 1:
        raise RuntimeError(f"UI2 anchor is not unique in {path}: count={source.count(old)}")
    target.write_text(source.replace(old, new, 1))
    return True


OLD_TITLE = '''export function renderTitle(menuIndex, handlers) {
  const items = [
    ["START", "modes"],
    ["LEADERBOARDS", "open-leaderboards"],
    ["PROFILE & STATS", "profile"],
    ["SETTINGS", "settings"],
  ];
  app().innerHTML = `
    <section class="screen menu-screen">
      <span class="ambient-word" style="left:8%;top:16%">vector</span>
      <span class="ambient-word" style="right:9%;top:28%;animation-delay:-5s">strike</span>
      <span class="ambient-word" style="left:17%;bottom:13%;animation-delay:-9s">velocity</span>
      <span class="ambient-word" style="right:16%;bottom:16%;animation-delay:-2s">precision</span>
      <div class="title-panel">
        <div class="eyebrow">System online // defend the core</div>
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
        <p class="subtitle">Arcade Typing Defense</p>
        <div class="menu-list">
          ${items.map(([label, action], index) => menuButton(label, action, index === menuIndex)).join("")}
        </div>
        <p class="footer-hint">↑ ↓ SELECT &nbsp;•&nbsp; ENTER CONFIRM</p>
      </div>
    </section>`;
  app().querySelector('[data-action="modes"]').onclick = handlers.modes;
  app().querySelector('[data-action="profile"]').onclick = handlers.profile;
  app().querySelector('[data-action="settings"]').onclick = handlers.settings;
  app().querySelector(".menu-list .arcade-button.selected")?.focus?.({ preventScroll: true });
}
'''

NEW_TITLE = '''export function renderTitle(menuIndex, handlers) {
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
              width="430"
              height="430"
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
'''

replace_once("js/ui.js", OLD_TITLE, NEW_TITLE)

replace_once(
    "index.html",
    '    <link rel="stylesheet" href="styles/ui-system.css">\n',
    '    <link rel="stylesheet" href="styles/ui-system.css">\n    <link rel="stylesheet" href="styles/screens/title.css">\n',
)

# Retire the Title screen from legacy panel ownership while leaving later screens untouched.
replace_once(
    "style.css",
    ".title-panel,\n.mode-panel,\n.results-panel,\n.settings-panel {",
    ".mode-panel,\n.results-panel,\n.settings-panel {",
)
replace_once(
    "style.css",
    '''.brand-logo {
  display: block;
  width: min(72vw, 360px);
  max-width: 100%;
  height: auto;
  margin: 8px auto 1rem;
  object-fit: contain;
  user-select: none;
  pointer-events: none;
  -webkit-user-drag: none;
  filter:
    drop-shadow(0 0 12px rgb(30 238 255 / 20%))
    drop-shadow(0 0 18px rgb(255 0 153 / 12%));
}

''',
    "",
)
replace_once(
    "style.css",
    '''.menu-list {
  display: grid;
  gap: 10px;
  width: min(330px, 100%);
  margin: 0 auto;
}

''',
    "",
)
replace_once(
    "style.css",
    '''.ambient-word {
  position: absolute;
  color: rgb(232 240 245 / 6%);
  font-size: clamp(14px, 2vw, 26px);
  animation: drift 14s linear infinite;
  pointer-events: none;
}

@keyframes drift {
  from { transform: translate(-20px, 20px); }
  50% { transform: translate(20px, -15px); }
  to { transform: translate(-20px, 20px); }
}

''',
    "",
)
replace_once(
    "style.css",
    '''  .title-panel,
  .mode-panel,
  .results-panel,
  .settings-panel,
  .endless-ready-panel,''',
    '''  .mode-panel,
  .results-panel,
  .settings-panel,
  .endless-ready-panel,''',
)
replace_once(
    "style.css",
    '''  :is(
    .title-panel,
    .mode-panel,
    .results-panel,''',
    '''  :is(
    .mode-panel,
    .results-panel,''',
)
replace_once(
    "style.css",
    '''  .title-panel {
    padding: 24px 18px;
  }

''',
    "",
)
replace_once(
    "style.css",
    '''  .brand-logo {
    width: min(68vw, 300px);
    margin-bottom: 0.5rem;
  }

  .title-panel .subtitle {
    margin: 8px 0 20px;
  }

''',
    "",
)

replace_once(
    "styles/ui-system.css",
    '''  .title-panel,
  .mode-panel,
  .results-panel,''',
    '''  .mode-panel,
  .results-panel,''',
)

replace_once(
    ".github/workflows/non-practice-browser.yml",
    '''      - name: Certify UI1 design-system and responsive contracts
        run: python tests/browser/ui1_design_system.py
''',
    '''      - name: Certify UI1 design-system and responsive contracts
        run: python tests/browser/ui1_design_system.py
      - name: Certify UI2 Title and global navigation
        run: python tests/browser/ui2_title_navigation.py
''',
)
replace_once(
    ".github/workflows/non-practice-browser.yml",
    '''            browser-artifacts/ui1-design-system/
''',
    '''            browser-artifacts/ui1-design-system/
            browser-artifacts/ui2-title-navigation/
''',
)

print("UI2 Title screen/global navigation migration materialized.")
