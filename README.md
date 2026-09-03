<div align="center">

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&height=240&color=0:0B111A,45:00D9FF,100:FF2DAA&text=WORDSTRIKE&fontColor=FFFFFF&fontSize=58&fontAlignY=38&desc=Precision%20typing.%20Arcade%20pressure.%20Local-first%20progress.&descAlignY=60&animation=fadeIn" alt="WORDSTRIKE header" />

<br />

<a href="https://thiepn.dev/wordstrike/">
  <img src="https://img.shields.io/badge/PLAY_LIVE-00F5FF?style=for-the-badge&logo=googlechrome&logoColor=0B111A" alt="Play WORDSTRIKE live" />
</a>
<a href="https://github.com/thiepn/wordstrike">
  <img src="https://img.shields.io/badge/SOURCE_CODE-0B111A?style=for-the-badge&logo=github&logoColor=FFFFFF" alt="View source code" />
</a>

<br /><br />

![Tests](https://github.com/thiepn/wordstrike/actions/workflows/test.yml/badge.svg)
<img src="https://img.shields.io/badge/deployment-GitHub%20Pages-00F5FF?style=flat-square&labelColor=0B111A" alt="Deployment: GitHub Pages" />
<img src="https://img.shields.io/badge/frontend-vanilla%20JS-FF2DAA?style=flat-square&labelColor=0B111A" alt="Frontend: vanilla JavaScript" />
<img src="https://img.shields.io/badge/online-Supabase-00D98B?style=flat-square&labelColor=0B111A" alt="Online services: Supabase" />

</div>

---

## WORDSTRIKE

**WORDSTRIKE** is a browser typing game that combines conventional speed testing with arcade-style target pressure.

The core game is local-first: campaign progress, personal records, settings, and statistics are stored in the browser. An optional online layer adds Google sign-in, public usernames, and global leaderboards through Supabase.

**Live:** https://thiepn.dev/wordstrike/

### Current modes

| Mode | Purpose |
| --- | --- |
| **Campaign** | Defend the core through 100 progressively harder levels with a boss encounter every tenth level. |
| **Typing Test** | Measure WPM, raw WPM, accuracy, corrections, and errors using the curated English 200 word set. |
| **Endless** | Survive escalating stages with limited core integrity and increasing word pressure. |
| **Arcade Rush** | Complete six escalating waves and defeat Core Breaker in a finite score-attack run. |
| **Practice Lab** | Experimental training architecture; currently not exposed as a normal production mode. |

---

## Highlights

### Campaign

- 100 fixed progression levels
- bosses at levels 10, 20, …, 100
- deterministic per-attempt generation
- accuracy grades from **S** to **D**
- local unlock and best-result persistence
- increasing spawn, vocabulary, and movement pressure

Campaign grades:

| Grade | Accuracy |
| :---: | ---: |
| **S** | ≥ 98% |
| **A** | ≥ 95% |
| **B** | ≥ 90% |
| **C** | ≥ 80% |
| **D** | < 80% on a successful run |

### Typing Test

- **English 200** curated vocabulary (`199` approved unique entries)
- timed tests: **15 / 30 / 60 / 120 seconds**
- word-count tests: **25 / 50 / 100 words**
- WPM and raw WPM
- accuracy and character-level error metrics
- backspace and word-delete tracking
- deterministic seeded word streams

### Endless

- three core-integrity points
- escalating stages
- increasing active-word pressure and vocabulary difficulty
- capped movement-speed progression
- survival, word, combo, and stage-clear scoring
- local personal records

### Arcade Rush

- six escalating normal waves
- five persistent Core Integrity
- deterministic per-run vocabulary and trajectories
- Core Breaker final boss
- combo, accuracy, perfect-wave, integrity, and boss-time scoring
- local personal records and an all-time global leaderboard

---

## Profiles, statistics, and leaderboards

WORDSTRIKE has two separate identity layers.

### Local profile

The browser stores a local player profile and gameplay history used for:

- Campaign progression
- personal records
- lifetime playtime and session totals
- weighted accuracy and WPM
- recent-session history
- Arcade Rush personal records and completion statistics

Local gameplay does **not** require an account.

### Optional online account

Players can optionally sign in with Google through Supabase to use global leaderboards. Online leaderboard accounts use a separate public username.

Current leaderboard categories include:

- Campaign
- Typing Test — 15 seconds
- Typing Test — 60 seconds
- Endless
- Arcade Rush

Score submissions are authenticated and server-validated before storage. Global leaderboards are an optional feature; local gameplay and local progress remain available without signing in.

---

## Controls

### Desktop

- **Letters** — type the active target or Typing Test text
- **Backspace** — correct typing where supported
- **Ctrl/Cmd + Backspace** — delete a word in Typing Test
- **Escape** — pause an active run
- **Arrow keys** — navigate supported menus and selectors
- **Enter** — activate the selected action

### Mobile

Gameplay uses a dedicated hidden text-input adapter for mobile software keyboards, including `beforeinput`, composition events, deletion handling, and viewport adjustment while the keyboard is open.

---

## Architecture

WORDSTRIKE uses a static frontend with an optional backend for authenticated online features.

```text
wordstrike/
├── index.html
├── style.css
├── manifest.webmanifest
├── package.json
│
├── assets/
│   ├── branding/
│   └── icons/
│
├── data/
│   ├── commonGameplayWords.json
│   ├── english200.json
│   ├── bossCommonLongWords.json
│   └── vocabulary quality artifacts
│
├── js/
│   ├── main.js
│   ├── state.js
│   ├── ui.js
│   ├── input.js
│   ├── gameLoop.js
│   ├── campaign*.js
│   ├── boss*.js
│   ├── speedTest*.js
│   ├── endless*.js
│   ├── arcadeRush/
│   ├── arcadeRush*.js
│   ├── statistics*.js
│   ├── leaderboard*.js
│   └── practiceLab/
│
├── supabase/
│   ├── functions/
│   └── migrations/
│
├── docs/
├── scripts/
└── tests/
```

### Design principles

- one active gameplay mode at a time
- deterministic seeded content where reproducibility matters
- local-first progress and records
- bounded local history
- explicit gameplay lifecycle and cleanup
- centralized input routing
- authenticated online leaderboard operations
- static frontend deployment with no production build step

---

## Technology

### Frontend

- HTML5
- CSS3
- vanilla JavaScript ES modules
- browser `localStorage`
- IndexedDB for experimental Practice Lab data
- Web App Manifest

### Online services

- Supabase JavaScript client
- Supabase Auth with Google OAuth
- Supabase Edge Functions
- PostgreSQL functions/migrations for leaderboard profiles and score storage

The Supabase browser SDK is pinned to an exact tested version in `index.html` so production behavior does not change merely because a new package release is published.

---

## Local development

### Requirements

- Git
- a modern browser
- Node.js 22+ for the automated test suite
- any local static HTTP server

### Clone

```bash
git clone https://github.com/thiepn/wordstrike.git
cd wordstrike
```

### Run locally

For example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Do not open the project through `file://`; browser module and data-loading restrictions can prevent the application from working correctly.

### Run tests

```bash
npm test
```

The repository includes a deterministic sequential test runner. GitHub Actions runs the complete suite on pull requests and pushes to `main`.

No dependency installation or frontend build step is required for normal local development.

---

## Deployment

The production frontend is deployed from the static repository through GitHub Pages.

**Canonical production URL:**

```text
https://thiepn.dev/wordstrike/
```

All application asset references are relative so the project remains compatible with its `/wordstrike/` subpath. `manifest.webmanifest` likewise uses relative scope and start URLs.

The Supabase Edge Functions explicitly allow the production origin `https://thiepn.dev` along with the supported local-development origins.

---

## Privacy and data handling

### Stored locally

Normal game progress and personal statistics are stored in browser storage, including local profile data, settings, records, and bounded session history.

### Sent online only for online features

When a player chooses to use account or leaderboard functionality, Supabase handles authentication and the requests required for public username management, leaderboard reads, and score submission.

The public leaderboard identity is the player's chosen public username. Gameplay does not require Google sign-in.

---

## Reliability

The project includes automated coverage across core gameplay and infrastructure, including:

- Campaign and boss difficulty
- input and target selection
- scoring and session lifecycle
- Typing Test generation and metrics
- Endless and Arcade Rush
- mobile viewport and software keyboard behavior
- browser-storage failure handling
- vocabulary quality and fallback behavior
- profile/statistics persistence
- authentication and leaderboard routing
- leaderboard submission validation
- Practice Lab isolation and storage contracts

The test suite is enforced by GitHub Actions rather than documented as a manually maintained passing count.

---

## Documentation

Detailed implementation notes live in [`docs/`](./docs/), including:

- [`MODE_ARCHITECTURE.md`](./docs/MODE_ARCHITECTURE.md)
- [`CAMPAIGN_DIFFICULTY.md`](./docs/CAMPAIGN_DIFFICULTY.md)
- [`BOSS_VOCABULARY.md`](./docs/BOSS_VOCABULARY.md)
- [`TYPING_TEST.md`](./docs/TYPING_TEST.md)
- [`ENDLESS_MODE.md`](./docs/ENDLESS_MODE.md)
- [`ARCADE_RUSH_CONTRACT.md`](./docs/ARCADE_RUSH_CONTRACT.md)
- [`PLAYER_PROFILE_AND_STATISTICS.md`](./docs/PLAYER_PROFILE_AND_STATISTICS.md)

Practice Lab has additional architecture documents under the same directory.

---

## Status

WORDSTRIKE is under active development. The current production focus is hardening the existing game—reliability, performance, leaderboard integrity, accessibility, and maintainability—before expanding the feature surface further.
