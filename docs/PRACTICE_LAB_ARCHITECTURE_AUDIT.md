# Practice Lab Current-System Architecture Audit

> **PL5 current-state notice:** This audit records the pre-PL5 foundation baseline. Any statements below describing IndexedDB structural version 1, profile→entity evidence identity, contextless skill/review/session/checkpoint records, or profile/entity uniqueness are historical and are superseded by **PRACTICE_LAB_CONTEXT_IDENTITY.md** and **PRACTICE_LAB_DATA_ARCHITECTURE.md**. The current canonical boundary is **profile → context → evidence**, with IndexedDB structural version 2.


Audit date: 2026-07-05  
Scope: Practice Lab Prompt 1 of 40  
Repository: WORDSTRIKE  
Disposition: architecture and planning only; no Practice Lab feature implementation

## 1. Executive summary

WORDSTRIKE is a static, framework-free ES-module application with manual screen routing in **js/main.js**, a flat app-level state object in **js/state.js**, controller-owned runtime state for individual modes, synchronous Web Storage persistence, and a single document-level keyboard dispatcher. Practice Lab can fit this architecture without changing existing ranked modes, but only if it is treated as a new local-first product area rather than another Typing Test configuration.

The safest design is a hybrid:

- add only Practice route identity and a controller reference to the app shell;
- keep active Practice state inside a dedicated controller and session engine;
- consume normalized physical/mobile input through an adapter contract;
- create separate Practice metrics, analysis, history, review, and storage schemas;
- share low-level rendering primitives only after parity tests protect Typing Test;
- keep English 200, ranked Typing Test records, generic mode records, leaderboard submission, Daily generation, Campaign scoring, and Supabase completely outside the initial Practice data flow.

The existing shared session manager is useful as a lifecycle model, but not yet a drop-in dependency: **beginSession()** rejects disabled modes, and **recordCompletedSession()** applies generic lifetime, personal-best, and recent-history semantics that are inappropriate for rich training records. Practice should initially use a dedicated lifecycle engine with the same monotonic timing principles and cleanup discipline. A later prompt may deliberately adapt the shared manager, but must not route Practice summaries into ranked or generic record persistence.

The most reusable production boundary is input. **mobileInputAdapter.js**, **inputSafety.js**, and **gameplayViewport.js** already solve difficult physical/software keyboard, Backspace, composition, focus, and visual-viewport problems. Practice should consume their normalized events directly, with timestamps and modifiers added through a backward-compatible adapter or Practice wrapper. It should not convert normalized events back into synthetic KeyboardEvents.

Storage is the primary pre-implementation blocker. **wordstrike_save** has no explicit schema version and is Campaign/settings-oriented. **wordstrike_mode_data_v1** is schema-versioned but stores ranked/generic mode outcomes and bounded summaries. Neither should absorb key, n-gram, word, review, custom-text, and event data. Prompt 2 must define a separate versioned Practice namespace, bounded localStorage aggregates, IndexedDB records for larger data, migration and quota behavior, and retention rules before any experiment is built.

No production JavaScript, CSS, HTML, data, Supabase, service-worker, leaderboard, scoring, Typing Test, authentication, mobile-input, or submission behavior is changed by this audit.

## 2. Current repository state

The state below was captured before creating this document with read-only Git commands.

| Item | Observed state |
| --- | --- |
| Current branch | **main** |
| Working tree | Clean |
| Existing uncommitted changes | None |
| Difference from local main | **0 behind / 0 ahead** from **git rev-list --left-right --count main...HEAD** |
| Current HEAD | **5c0f4f2 Improve gameplay input safety and smooth word movement** |
| Deployment/build artifacts | None generated |

Recent history, newest first:

1. **5c0f4f2** Improve gameplay input safety and smooth word movement
2. **d701cfc** Center typing timer and start message
3. **7661560** Merge branch fix/manual-vocabulary-quality-audit
4. **9d93e94** Audit and clean gameplay vocabulary
5. **2777ac4** Merge branch fix/restore-original-leaderboards
6. **14a1ecb** Restore original leaderboard rules
7. **0d85d62** Merge branch feature/onboarding-v2-and-gameplay-polish
8. **72964c3** Fix pending result recovery and refine typing vocabulary
9. **a1451eb** Refine onboarding, expand vocabulary, and improve gameplay flow
10. **d1eb835** Merge branch feature/onboarding-and-mode-guides
11. **658af1b** Add onboarding and improve mobile usability
12. **be27e10** Merge branch feature/onboarding-and-mode-guides
13. **1fde93b** Refine mobile layout and typing viewport
14. **2a65aab** Merge branch feature/onboarding-and-mode-guides
15. **9f68a98** Improve onboarding, mobile viewport, and mode navigation

This audit creates one documentation file. No unrelated unfinished work was present to preserve.

## 3. Relevant repository map

~~~text
WORDSTRIKE/
|-- index.html                     Static shell; Supabase CDN; js/main.js module
|-- style.css                      All screen, gameplay, responsive, and motion CSS
|-- manifest.webmanifest           Install metadata; not an offline cache
|-- README.md                      Static hosting and project overview
|-- js/
|   |-- main.js                    Bootstrap, manual routing, global listeners, orchestration
|   |-- state.js                   Screens, appState, screen transition helpers, runtime cleanup
|   |-- modes.js                   Mode registry; Practice is disabled/coming-soon
|   |-- ui.js                      Most screen, Typing, gameplay, pause, and result markup
|   |-- renderer.js                Moving-word and Boss phrase DOM renderer
|   |-- appClickRouting.js         Single app-root delegated click attachment
|   |-- input.js                   Campaign keyboard behavior
|   |-- inputSafety.js             Editable-target and browser Backspace protection
|   |-- mobileInputAdapter.js      Hidden textarea and normalized software input
|   |-- gameplayViewport.js        Visual viewport, focus, resize, orientation handling
|   |-- sessionManager.js          In-memory shared session state machine and timing
|   |-- sessionCleanup.js          Standardized stop/hide/clear/abort cleanup
|   |-- sessionResult.js           Generic immutable result normalization
|   |-- sessionMetrics.js          Arcade/shared scoring metric helpers
|   |-- storage.js                 Campaign save and global preferences
|   |-- modeStorage.js             Profile, lifetime, mode records, bounded recent sessions
|   |-- playerProfile.js           Local identity/display-name model
|   |-- lifetimeStatistics.js      Cross-mode aggregate updates
|   |-- statistics.js              Pure profile/statistics selectors
|   |-- statisticsFormat.js        Statistics formatting
|   |-- statisticsUi.js            Profile, account, tabs, cards, tables, diagnostics
|   |-- speedTestConfig.js         Timed/word test definitions and menu movement
|   |-- speedTestWords.js          English 200 identity, validation, seeded stream
|   |-- speedTestMetrics.js        Typing Test counters and formula implementation
|   |-- speedTestLayout.js         Stable word-body and line-window geometry
|   |-- speedTest.js               Typing Test controller, input, timer, result, persistence
|   |-- campaignSession.js         Campaign session/result adapter and local recording
|   |-- gameLoop.js                Campaign moving-word loop
|   |-- levelGenerator.js          Campaign attempt generation
|   |-- campaignDifficulty.js      Campaign balance curve
|   |-- bossGenerator.js           Boss content and timers
|   |-- bossLoop.js                Boss lifecycle/input progression
|   |-- endlessMode.js             Endless runtime/controller
|   |-- endlessDifficulty.js       Endless pressure progression
|   |-- endlessScoring.js          Endless-specific scoring and rolling speed
|   |-- endlessWords.js            Endless content selection
|   |-- dailyMode.js               Daily runtime/controller
|   |-- dailyGenerator.js          Versioned deterministic Daily challenge
|   |-- dailyScoring.js            Daily-specific scoring
|   |-- dailyRecords.js            Daily best/streak/history behavior
|   |-- wordBank.js                Gameplay and Boss data loaders/validators
|   |-- auditedFallbackWords.js    Audited emergency vocabulary
|   |-- random.js                  Seed mixing and seeded shuffle
|   |-- onboarding*.js             Tutorial content, controller, view, versioned persistence
|   |-- contextualHints.js         One-time contextual hints
|   |-- authService.js             Supabase PKCE authentication state
|   |-- supabaseClient.js          CDN client initialization and auth storage key
|   |-- leaderboard*.js            Reads, rendering, profile, return state, submission
|   |-- pendingResult*.js          Durable eligible-result sign-in/submission recovery
|   `-- layoutDiagnostics.js       Developer layout diagnostics
|-- data/
|   |-- english200.json            Ranked Typing Test English 200 v1 (199 words)
|   |-- commonGameplayWords.json   Audited gameplay vocabulary (schema v2)
|   |-- bossCommonLongWords.json   Validated Boss long-word source
|   |-- audited/manual metadata    Quality rules, review file, provenance notes
|   |-- typingTestWords.json       Legacy/non-active Typing fixture data
|   `-- theme-default.json         Legacy/non-active theme fixture data
|-- tests/                          112 Node test files and custom mocks
|-- scripts/                        Vocabulary generation/audit utilities
|-- docs/                           Existing mode architecture documents
`-- supabase/
    |-- migrations/                 Existing auth/profile/leaderboard SQL only
    `-- functions/                  get-leaderboard, submit-score, leaderboard-profile
~~~

There is no **package.json**, bundler, framework, service worker, app-managed cache, chart dependency, IndexedDB wrapper, or browser automation suite.

## 4. Application lifecycle

### Load-to-render trace

1. **index.html** creates the app root, loads the Supabase browser library from its CDN, and loads **js/main.js** as an ES module.
2. Module imports instantiate controller-level singletons such as submission, onboarding, auth, leaderboard, and mode-loop state.
3. **bootstrap()** in **main.js** begins by calling **clearSession()**.
4. It subscribes to auth, leaderboard profile, submission, pending-result, and leaderboard state. Auth initialization starts asynchronously through **initializeAuth()**.
5. It parses developer, seed, stage, and Daily date query parameters.
6. **loadSave()** loads/sanitizes **wordstrike_save** and immediately rewrites the normalized value.
7. Four content requests run together: **loadWordBank()**, **loadBossWordBank()**, **loadSpeedTestWordBank()**, and **loadCommonWordBank()**.
8. Bootstrap registers one document **keydown** listener, one delegated app-root click listener through **attachAppClickListener()**, and one app-root **input** listener.
9. Developer deep links and pending auth return state are handled; otherwise the initial screen is rendered through **renderCurrentScreen()**.

### Routing model

There is no centralized URL router. **Screens** in **state.js** is an enum-like object, **appState.screen** is the active route, **changeScreen()** mutates it, and **renderCurrentScreen()** is a manual conditional dispatcher. Open/start functions in **main.js** perform cleanup, state mutation, and rendering. The browser URL does not represent screen history.

Mode identity is split:

- selected product mode: **appState.modeSelection** plus **modes.js** definitions;
- active arcade mode: **appState.game.mode**;
- Typing Test: **appState.screen === SPEED_TEST_RUN** and controller singleton from **getCurrentSpeedTest()**;
- shared session identity: private **currentSession** in **sessionManager.js**.

### Cleanup and listener ownership

**cleanupCurrentSession()** invokes stop gameplay, hide pause, clear runtime, abort any active shared session, then optionally clears it. **cleanupCampaignAttempt()** wraps this and clears game/submission state. **stopActiveLoops()** stops Campaign, Boss, Typing, Endless, and Daily loops. **discardActiveAttempt()** unmounts mobile input and clears all mode runtimes/layout.

The global document and app-root listeners are intentionally installed once at bootstrap, so screen rerenders do not multiply them. Session-scoped mobile listeners are owned by **createMobileInputAdapter()** and removed by its cleanup function. New Practice listeners must follow that ownership pattern.

### Existing Practice representation

**modes.js** defines Practice with:

- ID **practice**;
- **enabled: false**;
- **status: coming-soon**;
- **route: null**;
- pause, seed, and progress capability flags set true.

**renderModeSelect()** consumes this definition and presents the disabled entry. **activateSelectedMode()** refuses disabled modes and has no Practice route branch.

### Safest Practice routing integration

Add explicit Practice screens only when Prompt 4 implements the shell:

- Practice home;
- experiment setup;
- active session;
- results;
- Skill Map;
- Review Queue;
- Progress.

The app-level dispatcher should delegate all Practice screens to one **practiceLabController** or **renderPracticeLabRoute()**, rather than adding experiment-specific branches to **main.js**. Navigation into Practice should enable its registry entry and assign one route. Navigation out should call one controller **destroy/abandon** boundary before the existing screen transition. Practice data screens should not mount gameplay input; only the active-session screen should.

## 5. Global-state audit

| State group / field | Current purpose | Classification | Practice direction |
| --- | --- | --- | --- |
| **screen**, **previousScreen** | Manual app route and Settings return | SAFE TO EXTEND | Add Practice route identities; do not encode experiment internals here. |
| **menuIndex**, **modeSelection** | Keyboard selection | SAFE TO REUSE | Continue using mode selection; Practice owns its internal focus indexes. |
| **devMode**, **developerSeed** | Diagnostics and deterministic attempts | SAFE TO EXTEND | A Practice debug seed may be passed into its controller; never make debug sessions persistent/ranked. |
| **save** | Campaign progression and global preferences | MUST REMAIN ISOLATED | Read shared accessibility/preferences; do not place Practice history or skill data here. |
| **wordBank**, **bossWordBank**, **speedTestWordBank**, **commonWordBank** | Bootstrap-loaded content | LEGACY / RISKY for extension | Existing references are safe; new large Practice datasets must be lazy-loaded by Practice. |
| **currentLevel**, **levelSelection**, **game**, **results**, **campaignResult** | Campaign/Boss runtime and outcomes | MUST REMAIN ISOLATED | No Practice fields or mode branches. |
| **speedTestConfigId**, result/index/ready fields | Typing Test configuration and result UI | MUST REMAIN ISOLATED | Do not repurpose for Practice setup/results. |
| Endless result/start/index fields | Endless UI/runtime results | MUST REMAIN ISOLATED | No Practice use. |
| Daily date/result/index fields | Versioned Daily challenge state | MUST REMAIN ISOLATED | No Practice scheduling via Daily fields. |
| **pauseIndex**, **resultsIndex**, **resultsReadyAt** | Campaign/common pause/result selection | LEGACY / RISKY | Practice should own pause/result focus; shared overlay utilities may accept handlers. |
| Settings fields | Global Settings navigation | SAFE TO EXTEND cautiously | Add a link/summary later; canonical Practice preferences stay in Practice storage. |
| Statistics tab/filter fields | Profile navigation | SAFE TO REUSE as a pattern | Practice Progress owns filters; do not put Practice raw analytics into ranked selectors. |
| Profile edit/draft/error/copy fields | Local/account profile UI | MUST REMAIN ISOLATED | Practice may display the name, never own auth/profile edits. |
| Private controller state in mode modules | Active mode runtime | SAFE TO REUSE as a pattern | Preferred ownership model for Practice controller/session state. |
| Private auth/leaderboard/submission state | Cloud and rankings | MUST REMAIN ISOLATED | No initial Practice dependency. |

### Recommendation

Use a hybrid:

1. **appState** owns only Practice screen identity and, if needed, a stable controller reference.
2. **practiceLabController** owns nested navigation and loaded aggregate models.
3. **practiceSessionEngine** owns the active session, event trace, monotonic timing, pause state, and result finalization.
4. Practice persistence owns completed summaries, aggregates, review state, and preferences.

This prevents a large flat-state expansion, makes cleanup testable, and keeps ranked Typing Test state unreachable from Practice. Pause/resume stays controller-owned. Refresh should abandon active in-memory typing by default in the first version, while a small crash-recovery checkpoint may be designed in Prompt 2 but must never be interpreted as a completed session. Mobile input mounts only for an active Practice session. Hidden-tab policy must be explicit: recommended behavior is automatic pause on **visibilitychange**, with no hidden time counted as active.

## 6. Save/storage audit

### Existing persistence paths

| Key / owner | Shape and behavior | Limits / recovery |
| --- | --- | --- |
| **wordstrike_save** in **storage.js** | **currentFurthestLevel**, per-level records, settings for screen shake, particles, strict mode, Typing timer position | No explicit schemaVersion. Validation/migration is implicit. Parse failure resets to defaults. Full synchronous rewrite. Reset clears Campaign levels only. |
| **wordstrike_mode_data_v1** in **modeStorage.js** | schemaVersion 1; local profile; lifetime totals; per-mode summaries; Typing records; Endless records; Daily records; recent sessions; recorded IDs | Recent sessions capped at 30; recorded IDs capped at 100; Daily details capped at 90 days. Sanitizes to defaults. Full synchronous rewrite. |
| **wordstrike.onboarding.ID.vVERSION** and hint keys | Seen-state flags | Versioned by key; reset helpers exist. |
| **wordstrike.pending-result-submission.v1** | Immutable eligible result intent through auth/profile flow | 30-minute validity and validation; current leaderboard pipeline only. |
| **wordstrike_leaderboard_auth_return_v1** in sessionStorage | Post-auth leaderboard return target | Short-lived tab state. |
| **wordstrike_supabase_auth_v1** | Supabase PKCE session | Owned by Supabase client/auth; not application save data. |

There is no export, import, backup, cross-device sync, IndexedDB, quota manager, or transaction layer. Browser/site-data clearing loses local progress. All app writes are synchronous JSON serialization to localStorage.

### Existing save shapes

~~~text
wordstrike_save = {
  currentFurthestLevel,
  levels: {
    levelNumber: {
      grade, bestWPM, bestAccuracy, bestScore,
      maxCombo, bestTimeRemaining, bossCleared
    }
  },
  settings: {
    screenShake, particles, strictMode, speedTestTimerPosition
  }
}

wordstrike_mode_data_v1 = {
  schemaVersion: 1,
  profile,
  lifetime,
  totals,
  modes: {
    campaign, speed-test, endless, daily, practice
  },
  recentSessions[up to 30],
  recordedSessionIds[up to 100]
}
~~~

An empty generic Practice summary already appears because **createDefaultModeData()** maps every mode definition. It is not a suitable rich Practice schema. **recordCompletedSession()** would update generic lifetime totals, best WPM/accuracy/score, recent sessions, and mode summary fields; it must not be the Practice persistence entry point.

### Recommended placement

| Future data | Recommended tier | Reason |
| --- | --- | --- |
| Practice route/active buffer/current event trace | In memory | High-frequency mutation; discarded or checkpointed separately. |
| Practice preferences and schema metadata | Separate versioned localStorage key | Small, frequently read, independent migration. |
| Skill aggregates for keys/bigrams/selected trigrams/words | Separate bounded Practice localStorage summary initially, or IndexedDB if Prompt 2 size estimates exceed budget | Must not inflate Campaign or ranked mode records. |
| Review queue and recommendation state | Separate Practice store; IndexedDB preferred once item count/history grows | Needs indexed updates, dates, retention, and migrations. |
| Completed Practice session summaries | IndexedDB with a bounded localStorage dashboard cache | Potentially hundreds/thousands of records and richer payloads. |
| Raw per-keystroke events | In memory during session; optional short-lived IndexedDB trace with strict count/age cap | Long-term raw storage is expensive, privacy-sensitive, and unnecessary after aggregation. |
| Custom texts and saved presets | IndexedDB | Variable and potentially large; must remain local by default. |
| Long-term daily/weekly aggregates | Separate Practice aggregate store | Efficient Progress rendering without replaying all traces. |
| Crash checkpoint | Separate short-lived key/record | Never count as completed; clear on completion/abandonment. |

Prompt 2 should budget conservatively below localStorage's implementation-dependent quota and avoid relying on a universal numeric limit. The 347 KB gameplay dataset and 2 MB manual-review source demonstrate that large JSON exists in the repository, but they are fetched assets, not per-user synchronous storage. Thousands of word entries plus timestamps and traces can exceed localStorage quickly. Per-keystroke writes also block the main thread and amplify corruption/quota risk.

Required Prompt 2 decisions: keys, schema versions, migration chain, IndexedDB database/version/object stores/indexes, bounded retention, atomic session completion, quota fallback, corruption salvage, clock/timezone representation, deletion/export policy, and browser-without-IndexedDB fallback.

## 7. Typing Test architecture

### End-to-end trace

1. **activateSelectedMode()** selects the **speed-test** route and resets to **DEFAULT_SPEED_TEST_CONFIG_ID**.
2. **speedTestConfig.js** defines time 15/30/60/120 and word 10/25/50/100 configurations and keyboard movement.
3. **resetSpeedTestAttempt()** creates a seeded runtime through **startSpeedTest()** and routes to **SPEED_TEST_RUN**.
4. **speedTestWords.js** validates immutable English 200 metadata and words, derives a seed from attempt seed/config ID, and appends deterministic shuffled batches without an immediate batch-boundary duplicate.
5. **createSpeedTestRuntime()** creates configuration, stream, word list/index, typed buffer, committed words, metrics, PREPARING phase, timing, persistence flags, and layout state.
6. **renderSpeedTestRun()** builds the stable body; **measureSpeedTestLayout()**, **scheduleSpeedTestLayout()**, and **updateSpeedTestRun()** maintain a two/three-line word window and active/caret markup.
7. The first accepted printable character calls **beginActiveTyping()**, begins the shared session, sets ACTIVE, starts monotonic timing, and creates a timed deadline when applicable.
8. **handleSpeedTestInput()** processes Backspace, Ctrl/Command+Backspace, Space, and printable characters. **commitCurrentWord()** calculates positional correctness, missed/extra counts, exact/incorrect words, and valid/correct spaces.
9. A requestAnimationFrame tick computes active duration/live metrics and ends timed tests at the deadline. Word-count tests finish after the configured final word.
10. **buildSpeedTestResult()** creates a generic immutable result with **metricVersion: 2**, English 200 metadata, raw/correct character totals, corrections, and eligibility.
11. **completeSpeedTest()** completes the shared session, calls **recordCompletedSession()**, and marks persistence.
12. **finishSpeedTest()** stores result UI state, prepares automatic submission, switches to results, and starts eligible submission.
13. Results offer retry, change test, modes, and title. Ranked eligibility remains restricted to non-developer English 200 v1 timed 15/60 results and current leaderboard rules.

### Input semantics

- First printable character starts the timer; navigation/configuration does not.
- Backspace deletes one buffer character and increments **backspaces** when applicable.
- Ctrl/Command+Backspace clears the current word buffer and increments **wordDeletes**.
- Space only commits a non-empty buffer.
- A committed word compares typed and expected characters by position.
- Correct committed characters, correct spaces, and current partial correctness drive WPM.
- The timer excludes explicit paused duration.
- There is no per-keystroke timing trace, consistency calculation, or per-word completion timestamp history.

### Reuse classification

| Component | Classification | Practice use |
| --- | --- | --- |
| English 200 identity/loader | MUST REMAIN TYPING-TEST-SPECIFIC | Assessment may independently reference a content source only if it does not mutate or claim ranked equivalence. Prefer separate assessment pools. |
| Seed mixing/shuffle | REUSABLE AS-IS | Use **mixSeed()** and **shuffleSeeded()** for deterministic Practice generation. |
| Word-stream strategy | REUSABLE ONLY THROUGH AN ADAPTER | Useful for simple word drills; Practice needs target-aware and passage generators. |
| Config menu | MUST REMAIN TYPING-TEST-SPECIFIC | Practice requires experiment registry/config schemas. |
| Normalized input | REUSABLE AFTER EXTRACTION / ADAPTER | Direct normalized Practice event contract with timestamps/modifiers. |
| Character positional helpers | REUSABLE AS-IS for equivalent comparisons | **countCorrectPositions()** and classification can support a simple word mode, but not latency analysis. |
| Correction/word advancement controller | REUSABLE ONLY THROUGH AN ADAPTER | Semantics differ by experiment; implement policy in Practice engine. |
| First-key timing principle | REUSABLE AS-IS conceptually | Start active duration on first accepted input, with experiment overrides explicit. |
| Shared session timing | REUSABLE ONLY THROUGH AN ADAPTER | Preserve monotonic accounting; avoid generic result persistence. |
| Typing Test metrics/formulas | MUST REMAIN TYPING-TEST-SPECIFIC | Practice metrics need a separate explicit version. Do not alter ranked formulas. |
| **speedWordMarkup()** | REUSABLE AFTER EXTRACTION | Candidate low-level helper after golden parity and escaping tests. |
| Run renderer/layout | REUSABLE ONLY THROUGH AN ADAPTER | Separate Practice renderer sharing character/caret primitives. |
| Result normalization | REUSABLE ONLY THROUGH AN ADAPTER | Practice summary should not imply score/ranking fields. |
| **recordCompletedSession()** | DO NOT REUSE DIRECTLY | It contaminates generic/lifetime/best records. |
| Automatic submission/pending result | DO NOT REUSE DIRECTLY | Practice never enters public leaderboards. |
| Timer-position preference | MUST REMAIN TYPING-TEST-SPECIFIC | Practice may define its own live-metric visibility/layout preference. |

The extraction strategy must be additive. Do not add Practice conditionals throughout **speedTest.js**. First freeze Typing Test DOM/metric/input behavior with tests, then extract only pure primitives whose signatures do not expose ranked state.

## 8. Metrics audit

### Typing Test metrics

**speedTestMetrics.js** owns:

- printableKeystrokes;
- correctKeystrokes;
- incorrectKeystrokes;
- backspaces;
- wordDeletes;
- rawTypedCharacters;
- validSpaces;
- correctSpaces;
- committedCorrectCharacters;
- missedCharacters;
- extraCharacters;
- wordsCompleted;
- exactWords;
- incorrectWords.

| Metric | Current formula/source | Update timing | Ranked dependency | Practice decision |
| --- | --- | --- | --- | --- |
| Positional correct characters | Equal characters at the same expected/typed indexes | Character display and commit | Feeds WPM/result | Pure helper can be reused for simple words. |
| Incorrect keystrokes | Accepted character classified against current expected position | Each printable input | Accuracy | Keep Typing formula isolated. |
| Missed characters | Expected length beyond typed length at commit | Word commit | Accuracy | Reuse concept, separate Practice event analysis. |
| Extra characters | Typed length beyond expected length at commit | Word commit | Result detail | Reuse concept. |
| Accuracy | correctKeystrokes / (correctKeystrokes + incorrectKeystrokes + missedCharacters) * 100; display returns 100 when denominator is zero, persisted calculation returns 0 | Live/result | Yes | Practice needs versioned accuracy definitions per experiment. |
| WPM | (correctTestCharacters / 5) / active minutes | Live/result | Yes | May display compatible summary, but calculate in Practice metrics module. |
| Correct test characters | committedCorrectCharacters + correctSpaces + optional partial correct characters | Live/result | Yes | Do not change. |
| Raw WPM | ((printableKeystrokes + validSpaces) / 5) / active minutes | Live/result | Yes | Practice version may use normalized input events. |
| CPM/raw CPM | Correct/raw test characters / active minutes | Live/result | No public board observed | Can be derived separately. |
| Corrections | Backspaces and wordDeletes only | On deletion | Result detail | Insufficient for correction cost; Practice needs event timing. |
| Elapsed time | Monotonic active duration excluding explicit pause | Each frame/result | Yes | Reuse timing principle. |
| Consistency | Not implemented | N/A | No | New Practice metric. |
| Corrected vs uncorrected errors | Not explicitly reconstructed | N/A | No | New Practice analyzer output. |
| Word completion timing | Not retained per word | N/A | No | New event/session trace. |

**sessionMetrics.js** supplies arcade/common accuracy and WPM calculations used by Campaign-style results. **endlessScoring.js** additionally maintains rolling completion events over a 15-second window, requiring a minimum five seconds for the displayed sample, and derives average/peak speed. These semantics are gameplay-specific and must not become Practice's canonical typing analysis.

### Required new Practice measurements

The Practice input/session engine should collect normalized events in memory using monotonic timestamps, expected position, target identity, typed value, source, correction operation, and state transition. The analyzer should calculate after completion:

- per-key press latency and confidence;
- bigram and selected trigram transition latency;
- word-start delay and inter-word pause;
- correction cost and corrected/uncorrected error paths;
- longest hesitation;
- pace/metronome adherence;
- fatigue slope across comparable segments;
- before/after target performance;
- sustainable, burst, and controlled speed;
- relative personal slowness against the user's own baseline;
- sample counts, dispersion, recency, and confidence.

Collection belongs in **practiceInputEngine.js** and **practiceSessionEngine.js**. Calculation belongs in versioned **practiceMetrics.js** and **practiceAnalyzer.js**. Skill-map aggregation belongs in **practiceSkillMap.js**. Recommendation logic must consume aggregates/confidence, not raw DOM state. Raw traces should be released after aggregate persistence unless retained by a bounded explicit policy.

## 9. Input architecture

### Current routes

- Exactly one document-level **keydown** listener is registered by **bootstrap()**.
- **handleGlobalKeydown()** first calls **captureGameplayBackspace()**, then protects editable targets through **isTextEntryTarget()**, then routes active gameplay input, then screen-specific navigation.
- **routeActiveGameplayKey()** routes Typing Test, Campaign, Endless, Daily, or Boss input and handles Escape/Tab.
- **createMobileInputAdapter()** appends a hidden textarea and keyboard trigger only to active gameplay/Typing hosts.
- Physical textarea keydown is normalized by **normalizeKeyboardInput()**.
- Software input is normalized by **normalizeBeforeInput()**; fallback **input** handles browsers that do not deliver a usable beforeinput.
- Composition is ignored during composition and dispatched once on **compositionend**.
- A microtask-scoped **suppressBeforeInput** flag prevents keydown plus beforeinput duplication; **handledBeforeInput** prevents beforeinput plus input fallback duplication.
- Cleanup removes all textarea, trigger, arena, viewport, resize, and orientation listeners.
- **focusGameplayInput()** uses preventScroll and restores scroll position.
- **gameplayViewport.js** applies visualViewport height/width/offset CSS variables and a short-viewport body class.

The current normalized shape is:

~~~text
{
  type: character | space | backspace | word-delete,
  value,
  source: physical-keyboard | soft-keyboard | composition
}
~~~

### Practice contract recommendation

Practice should receive one direct normalized contract:

~~~text
{
  type,
  value,
  timestamp,
  source,
  modifiers: {
    ctrl,
    meta,
    alt,
    shift
  },
  composing
}
~~~

Timestamp should be captured at the adapter/router boundary with **performance.now()** rather than trusting cross-browser event.timeStamp semantics. Existing mode callers must retain their current shape and behavior; a Practice wrapper can enrich events before a shared contract is safely generalized. Practice should not call **keyboardEventFromNormalized()**, because that loses timestamp, source, composition, and modifier fidelity.

### Risks and controls

| Risk | Current control | Practice requirement |
| --- | --- | --- |
| Duplicate keydown/beforeinput | **suppressBeforeInput** microtask | Preserve tests on iOS/Android and composition sequences. |
| beforeinput/input double handling | **handledBeforeInput** | Include replacement text and empty-value cases in simulations. |
| Missed Backspace/native navigation | Early **captureGameplayBackspace()** and preventDefault | Register Practice as an active typing mode without affecting editable fields. |
| Ctrl/Command+Backspace mismatch | Normalized **word-delete** | Make correction policy experiment-configurable after normalization. |
| Composition corruption | Composition guards and one compositionend dispatch | Decide whether non-Latin text is supported before storing key analytics. |
| Editable Settings/profile fields | **isTextEntryTarget()** | Keep this check before Practice routing. |
| Leaked mobile listeners | Returned cleanup function | Practice controller must call cleanup on complete, abandon, route change, and error. |
| Double global listeners | Bootstrap installs one | Do not add a second document keydown listener. |
| Tab/Escape/Enter conflict | Main router owns control keys | Practice sub-router returns handled status and documents control precedence. |

## 10. Rendering architecture

**renderer.js** is optimized for moving arcade words: it caches word elements, updates per-character spans, and moves elements via compositor-friendly transforms. It is not a text-practice renderer.

Boss rendering in **renderer.js** splits a fixed phrase and updates phrase character states. It is sequence-oriented but bound to Boss phases/timers and not suitable for paragraphs or analytics.

Typing Test in **ui.js** is the closest semantic renderer. **speedWordMarkup()** escapes and emits correct/incorrect/extra/caret character markup. **renderSpeedTestRun()** creates the word body, and **updateSpeedTestRun()** appends batches, updates committed/current word **innerHTML**, and moves the line window using **speedTestLayout.js** measurements. It is tightly coupled to Speed Test runtime fields, config controls, timer placement, and English 200 flow.

Onboarding uses small string templates in **onboardingView.js**. Result, leaderboard, and profile screens rebuild large sections with **innerHTML** and delegated/app-specific handlers. **statisticsUi.js** offers useful cards, tabs, rows, empty states, tables, and diagnostic patterns. No chart library, Canvas chart system, or general virtual list exists.

### Recommendation

Build a separate **practiceRenderer.js** that consumes a renderer-neutral Practice view model. Share only:

- escaping/text safety;
- character-state vocabulary;
- caret semantics;
- visual tokens/classes where parity is intentional;
- optional extracted pure markup helper after Typing golden tests.

Support two initial views: a windowed word stream and a windowed paragraph. Do not render an entire large custom text. Keep only the current, nearby previous, and bounded look-ahead regions in the DOM; preserve semantic text for assistive technology. Use textContent or escaping for custom text and never interpolate user text as HTML.

For analytics:

- Keyboard Heatmap: CSS Grid with buttons/cells and an accessible table/legend.
- Sequence Map: sortable table initially; SVG links only if relationships add value.
- 30-day trends: small SVG line/bar chart plus an accessible data table.
- Before/after: paired metric cards and compact SVG bars.
- Skill confidence: progress bar plus sample count and recency text.
- Weekly calendar: CSS Grid with semantic day labels.
- Fatigue segments: SVG bars/line with tabular fallback.

Avoid a chart dependency and Canvas initially. SVG/CSS are sufficient for expected aggregate volumes, style consistently with the app, and remain inspectable/accessibility-friendly.

## 11. Session lifecycle

### Existing shared lifecycle

**sessionManager.js** defines schema version 1 and:

**idle, preparing, briefing, active, paused, transitioning, results, aborted, completed**.

It stores one private current session. **beginSession()** requires a valid enabled mode and no non-terminal current session. It clones serializable config/runtime metadata, records epoch and monotonic timestamps, and accumulates active and paused duration. **pauseSession()** remembers the prior state; **resumeSession()** restores it. **completeSession()** finalizes one result; **abortSession()** sets a reason. **markSessionResultPersisted()** provides idempotence metadata. The state is not persisted across refresh.

### Observed event behavior

| Event | Current behavior |
| --- | --- |
| Escape/pause button | Stops the relevant loop, pauses shared and mode timing, shows a mode-specific pause overlay. |
| Resume | Restores deadline/active timestamp and loop; paused time is excluded. |
| Tab hidden/window blur | No **visibilitychange**, **document.hidden**, or blur auto-pause policy exists. rAF throttles; deadline-based timed tests observe elapsed wall/monotonic time when execution resumes. |
| Mobile keyboard/viewport | Visual viewport CSS variables update on resize/scroll/orientation; focus attempts to avoid page movement. |
| Screen change/exit | Cleanup stops all loops, unmounts mobile input, clears runtimes/layout, aborts and clears active session. |
| Restart | Existing attempt is cleaned, then a new session/runtime starts. |
| Browser refresh | Active in-memory session is discarded. Only purpose-built pending leaderboard submission intent can recover. |

### Practice lifecycle

Use a Practice-specific state machine:

~~~text
created -> ready -> active <-> paused -> completed -> saved -> destroyed
                         -> abandoned -> destroyed
~~~

Every experiment must provide or be wrapped by:

- create and validate configuration;
- prepare content/targets;
- accept normalized input;
- produce a renderer view model;
- pause and resume monotonic timing;
- complete or abandon exactly once;
- analyze and persist atomically;
- destroy timers, frames, input, viewport, audio/metronome, and DOM references.

Recommended hidden-tab policy: automatically pause, record **visibility-hidden** as the reason, and require explicit or safe automatic resume only after visibility returns. Recommended refresh policy for the first implementation: save a non-completion checkpoint only if Prompt 2 designs it; otherwise abandon. Never infer a completed result from a checkpoint.

## 12. History/result architecture

Current terms have distinct consequences:

| Concept | Implementation | Meaning |
| --- | --- | --- |
| Attempt/runtime | Per-mode controller objects | Mutable active play; not durable. |
| Shared session | **sessionManager.js** | One timed lifecycle and identity. |
| Generic result | **buildSessionResult()** | Immutable schema v1 with score/grade/WPM/accuracy/character/word/combo/modeData. |
| Campaign progress record | **storage.js** | Per-level bests and unlock progression. |
| Mode record/history | **modeStorage.js** | Generic totals, bests, recent summaries, mode-specific records. |
| Personal best | **modeStorage.js**, Daily/Endless helpers | Comparator-driven best result. |
| Pending result | **pendingResultSubmission.js** | Eligible leaderboard result surviving auth/profile interruption. |
| Submission | leaderboard submission service/controller | Server-validated public score request. |

Campaign, Typing Test, Endless, and Daily all normalize results and call **recordCompletedSession()**, with mode-specific eligibility checks. Campaign additionally updates unlock/grade save. Typing, Endless, Daily, and Campaign results can enter automatic leaderboard preparation under current board rules. These paths imply ranking, generic personal bests, or progression and must remain unavailable to Practice.

Create a separate **practiceSessionSummary** concept. Prompt 2 should define, but not necessarily include all raw detail for:

- schema/metric/content versions;
- session and experiment ID;
- validated configuration;
- content source/reference and deterministic seed;
- timestamps, active/paused duration, and completion/abandon reason;
- typed/correct/incorrect/missed/extra characters;
- WPM/raw WPM/accuracy/consistency/corrections;
- target skill IDs and sample counts;
- target performance before/after;
- pace/fatigue/training-quality indicators;
- aggregate/review updates and recommendation IDs;
- developer/custom-content/privacy flags.

The summary must have no **leaderboardEligible**, public board key, Campaign grade/unlock, Daily date comparator, or ranked Typing record semantics. If a generic UI needs it, adapt the summary to a read-only Practice card rather than converting it into **buildSessionResult()**.

## 13. Content systems

| Source | Current use/validation | Practice suitability |
| --- | --- | --- |
| **data/english200.json** | 199 unique lowercase ASCII words; strict metadata and count validation in **speedTestWords.js**; English 200 v1 | Protected ranked benchmark. Do not mutate, append, adapt, or silently reuse as an adaptive pool. |
| **data/commonGameplayWords.json** | Roughly 347 KB; schema v2; 3,000 manually reviewed words across five tiers; loaded/validated by **wordBank.js** | Strong candidate source for Common Words, assessment, and derived key/n-gram indexes, subject to content-purpose validation. |
| **data/commonGameplayWords.manual-review.json** | Roughly 2 MB audit artifact | Development provenance/review source; should not be loaded in production Practice. |
| **data/bossCommonLongWords.json** | 241 common long words, 9-15 characters; strict Boss validation | Optional endurance/long-word source; keep Boss constraints separate. |
| **js/auditedFallbackWords.js** | Audited emergency fallback subsets | Runtime resilience only, not a primary training corpus. |
| **data/typingTestWords.json** | Legacy/non-active data, referenced by audit tests rather than current Typing runtime | Do not revive without a dedicated provenance/version decision. |
| **data/theme-default.json** | Legacy/non-active fixture | Not content architecture. |
| **onboardingContent.js** | Fixed tutorial copy and tiny demonstration words | UI education only. |

The repository contains provenance notes in **data/VOCABULARY_SOURCE.md** and quality rules in **data/vocabularyQualityRules.json**, but no declared general software/content license. There is no licensed passage library, punctuation corpus, number/symbol templates, custom-text parser, keyboard-layout model, or production key/bigram/trigram index.

Future content needs:

- build-time key-to-word, bigram-to-word, and selected trigram-to-word indexes derived from audited sources;
- frequency-ranked common-word metadata;
- licensed/provenanced real-text passages with difficulty and punctuation metadata;
- keyboard-layout definitions separated from language;
- punctuation/capital transition metadata;
- number/symbol templates;
- custom-text normalization and privacy rules.

Weak Keys and Combination Repair can use derived indexes from audited gameplay vocabulary. Problem Words should be primarily personal-error-driven, with the source corpus as fallback. Common Words and early Assessment can use a dedicated versioned subset. Real Text requires a new licensed corpus. Punctuation/Capitals and Numbers/Symbols require new purpose-built content. English 200 stays byte-for-byte isolated.

Practice data should be lazy-loaded on route/experiment demand rather than added to **bootstrap()**.

## 14. Analytics/profile UI

**statistics.js** is a useful model: pure selectors derive a snapshot from **modeStorage** and Campaign save. **statisticsUi.js** then renders tabs, metric cards, mode panels, record tables, recent-session filters, account panels, empty states, and developer diagnostics. **statisticsFormat.js** keeps formatting separate. This separation should be reused conceptually.

Do not feed rich Practice storage into existing ranked selectors. Create pure Practice selectors that produce view models, and either render them within Practice Progress or later expose a small read-only Practice summary card to Profile & Stats.

Reusable UI patterns:

- tablist/tabpanel organization;
- metric cards with labels and helper copy;
- bounded history rows and filters;
- empty-state explanations;
- responsive tables/cards;
- developer-only diagnostics;
- accessible account-independent local data messaging.

No chart library exists. Initial Practice analytics should use CSS/SVG plus accessible tables, as described in Section 10. Canvas is not justified until trace volumes or interaction needs exceed SVG. A dependency should be considered only after native prototypes fail performance/accessibility acceptance criteria.

## 15. Settings/onboarding

**onboardingContent.js** defines versioned tutorials; **onboarding.js** controls opening, steps, skip, completion, and automatic visibility; **onboardingView.js** owns modal markup/listeners; **onboardingStorage.js** stores per-tutorial/version seen flags and hint flags. **contextualHints.js** provides lightweight first-run prompts. Settings can reset tutorials and hints.

Global preferences in **storage.js** are screen shake, particles, strict mode, and Typing timer position. **style.css** includes **prefers-reduced-motion** behavior. No sound/metronome subsystem, theme engine, keyboard-layout preference, or Practice preference store exists.

Recommendation:

- add a versioned Practice Lab tutorial using the existing onboarding framework once the shell exists;
- use experiment-specific help as data owned by the experiment registry, not new global modals per experiment;
- explain metrics next to results/progress and through contextual help;
- keep canonical Practice preferences in Practice storage;
- optionally expose a Settings shortcut/summary, while edits call the same Practice preference service;
- keep broad accessibility preferences global if they affect all modes;
- design metronome audio with explicit opt-in, volume/mute, visibility/pause cleanup, and browser gesture constraints;
- store keyboard layout, correction policy, session duration, assessment recommendation, and live-metric visibility as versioned Practice preferences.

## 16. Testing infrastructure

The repository has 112 **tests/*.test.js** files and uses Node's built-in **node --test** runner. There is no package manifest, Jest/Vitest, jsdom, Playwright, snapshot framework, fake-indexeddb dependency, or coverage configuration.

Observed patterns:

- direct imports and top-level **node:assert/strict** assertions;
- custom minimal DOM/classList/query mocks;
- Map-backed localStorage/sessionStorage mocks;
- fake requestAnimationFrame and explicit timestamps;
- synthetic keyboard/beforeinput/composition event objects;
- fake Supabase clients/fetch responses;
- source-text assertions for wiring and protected constants;
- shared leaderboard submission fixtures;
- deterministic seeds and repeated generation samples.

Existing coverage is strong around Campaign/Boss/Endless/Daily generation and scoring, Typing input/metrics/lifecycle/storage/UI, mobile input and viewport behavior, navigation/cleanup, onboarding, profile/statistics, auth, pending results, leaderboard validation, and security boundaries.

Build this missing infrastructure before major Practice experiments:

1. deterministic clock plus timestamped normalized-input trace runner;
2. physical, beforeinput, fallback-input, and composition sequence simulator;
3. Practice lifecycle harness for pause/resume/visibility/abandon/restart;
4. storage migration fixture runner, quota/error injection, and a minimal fake IndexedDB strategy;
5. large-text renderer DOM-size/windowing harness;
6. fixture builders for session summaries, skill aggregates, review items, and recommendations;
7. cross-timezone/local-date review-scheduling tests;
8. invariant tests proving Practice cannot invoke ranked persistence/submission.

Future tests should include deterministic generation, target coverage, property-like seed loops, exact event metrics, confidence thresholds, assessment repeatability, skill aggregation idempotence, review scheduling, experiment config validation, mobile single-dispatch, IME policy, custom-text escaping/windowing, hidden-tab pause, refresh checkpoint behavior, migration round trips, corruption salvage, and quota degradation.

## 17. Deployment/browser constraints

WORDSTRIKE is deployed directly as static HTML/CSS/JS/JSON on GitHub Pages. There is no build step, package manager, bundler, transpiler, service worker, cache version, or CI configuration in the repository. Relative URLs and **import.meta.url** are used to support the **/WORDSTRIKE/** project subpath.

Adding **js/practiceLab/** works with native ES modules. Static imports are safe structurally but execute/fetch as part of the startup module graph. Dynamic import is supported by target modern browsers and is preferable for the large Practice shell/datasets, provided paths remain relative and the host serves JavaScript MIME types correctly. Failures must render a local error state rather than break the rest of bootstrap.

Large JSON must not join the four current bootstrap loads. Lazy-load by experiment, split datasets by purpose/version, cache parsed data in the Practice content service, and rely initially on normal HTTP/browser caching. There is no app-managed offline precache: local play is server-independent after assets load, but a cold offline launch is not guaranteed. The stated Practice invariant should therefore be phrased as no server/account requirement unless a later service-worker prompt explicitly adds verified offline installation.

GitHub Pages cache invalidation is currently host/browser HTTP behavior. New files/changed URLs deploy normally, but unchanged URLs may remain cached transiently. If a future service worker is added, it becomes a separate high-risk versioning project; no service worker exists to reuse now.

Custom text requires no server. It must remain local, be inserted with textContent/escaping, and be excluded from diagnostics/submission. The page has no explicit Content Security Policy. Supabase's external CDN is the only runtime external script dependency.

Browser test priorities:

| Browser | Constraints to validate |
| --- | --- |
| Chrome/Edge desktop | Baseline modules, IndexedDB, keyboard repeat/modifiers, long-session performance. |
| Firefox desktop | beforeinput differences, focus/selection behavior, SVG/layout parity. |
| Safari macOS | IndexedDB upgrade/eviction, event.timeStamp differences, composition, audio unlock. |
| Android Chrome/vendor browsers | software keyboard beforeinput/input ordering, visualViewport resizing, autocorrect/replacement text. |
| iOS/iPadOS Safari | composition, viewport offsets, orientation, keyboard dismissal, storage eviction/private mode, touch focus gesture requirements. |

## 18. Supabase boundaries

The frontend loads Supabase JS from a CDN. **supabaseClient.js** creates the browser client with PKCE and **wordstrike_supabase_auth_v1** storage. **authService.js** owns sign-in/sign-out/auth subscriptions. Leaderboard reads call the **get-leaderboard** Edge Function. Eligible submissions call **submit-score**. Username/profile management calls **leaderboard-profile**. Server functions use privileged server-side access and validation; the browser does not directly write leaderboard tables.

**pendingResultSubmission.js** and **pendingResultCoordinator.js** preserve only an eligible current result through sign-in/username setup and enforce expiry/shape checks. **leaderboardReturnState.js** only restores leaderboard navigation after auth.

Initial Practice must remain fully local:

- no new Supabase tables or migrations;
- no new Edge Functions;
- no public Practice board;
- no current board keys or rules-version changes;
- no Daily challenge version changes;
- no current score validation/submission;
- no auth requirement;
- no username/profile side effect;
- no pending-result intent.

Optional future sync should use a dedicated, opt-in Practice API and schema with user-owned records, conflict rules, privacy controls, deletion/export, and end-to-end versioning. It must not overload **submit-score**, leaderboard rows, or ranked profile endpoints.

## 19. Reuse matrix

| System | Current module(s) | Current responsibility | Reuse recommendation | Required extraction/adapter | Risk | Protected behavior | Practice consumer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Screen routing | **main.js**, **state.js** | Manual app route/render | Extend minimally | One Practice route delegate | MEDIUM | Existing route/cleanup behavior | Practice controller |
| Mode registry | **modes.js** | Availability and route metadata | Extend in shell prompt | Enable Practice and route only | LOW | Existing mode IDs/order/capabilities | Practice entry |
| Global state | **state.js** | App screen and mode UI state | Hybrid only | Controller reference/route fields | MEDIUM | Existing flat fields | Practice shell |
| Campaign save | **storage.js** | Unlocks, grades, global prefs | Read prefs only | None | DO NOT REUSE DIRECTLY | Campaign progression/Typing timer pref | Settings bridge |
| Mode storage | **modeStorage.js** | Generic/ranked records and profile stats | Read profile only | Separate Practice storage | DO NOT REUSE DIRECTLY | PBs, lifetime totals, recent modes | Progress identity display |
| Save validation/migration pattern | **storage.js**, **modeStorage.js** | Sanitization/defaults | Reuse concepts | Explicit Practice migrations | MEDIUM | Existing keys/data | Practice storage |
| Input normalization | **mobileInputAdapter.js** | Physical/software normalized events | Reuse via enriched adapter | Timestamp/modifier wrapper | MEDIUM | Single dispatch/mobile behavior | Practice input engine |
| Mobile input mount | **mobileInputAdapter.js** | Hidden textarea/focus/listeners | Reuse | Direct normalized callback | MEDIUM | iOS/Android behavior | Active session |
| Editable target protection | **inputSafety.js** | Native field editing and Backspace safety | Reuse as-is | Add Practice active mode intentionally | LOW | Browser navigation protection | Main/Practice router |
| Viewport controller | **gameplayViewport.js** | Keyboard viewport/focus | Reuse as-is | Practice host selectors or injected host | LOW | Existing gameplay scale/zoom | Practice active renderer |
| Seed utilities | **random.js** | Deterministic mixing/shuffle | Reuse as-is | Stable Practice labels/versions | LOW | Existing seeded output | Content generator |
| Session manager | **sessionManager.js** | One in-memory lifecycle/timing | Model or adapter | Practice lifecycle without generic persistence | HIGH | Existing mode state transitions | Session engine |
| Cleanup contract | **sessionCleanup.js**, **main.js** | Stop/clear/abort | Reuse pattern | Practice destroy hook | MEDIUM | One active loop/input owner | Controller |
| Typing renderer helper | **ui.js speedWordMarkup()** | Character/caret markup | Extract only after parity tests | Pure escaped helper | HIGH | Stable Typing word body | Practice renderer |
| Typing run renderer | **ui.js**, **speedTestLayout.js** | English word stream/window | Separate renderer | Shared low-level primitives | DO NOT REUSE DIRECTLY | Typing layout/timer | Practice renderer |
| Typing metrics | **speedTestMetrics.js** | Ranked metric v2 | Keep isolated | Separate Practice version | DO NOT REUSE DIRECTLY | Ranked formulas | Metrics/analyzer |
| Word generation | **speedTestWords.js** | English 200 stream | Reuse seed strategy, not source | Practice content strategies | HIGH | English 200 v1 | Content generator |
| Gameplay content loaders | **wordBank.js** | Audited JSON validation | Reuse/adapt | Practice-purpose validator/index loader | MEDIUM | Campaign/Boss pools | Content service |
| Pause overlays | **ui.js**, mode controllers | Mode-specific pause UI | Reuse visual pattern | Practice handlers/view model | MEDIUM | Existing pause semantics | Practice controller |
| Result UI | **ui.js** | Ranked/game result screens | Reuse design language only | Practice result renderer | HIGH | Submission regions/actions | Practice results |
| Profile selectors/UI | **statistics.js**, **statisticsUi.js** | Local records/aggregates | Reuse patterns | Practice-only selectors | MEDIUM | Ranked/local mode statistics | Progress |
| Onboarding | **onboarding*.js**, **contextualHints.js** | Versioned tutorials/hints | Reuse framework | New Practice tutorial content | LOW | Existing seen versions | Practice shell/help |
| Settings | **storage.js**, **ui.js** | Global preferences/account | Bridge only | Canonical Practice settings service | MEDIUM | Existing settings persistence | Practice preferences |
| Service worker | None | None | Do not invent in initial phase | Future dedicated design | DO NOT REUSE DIRECTLY | Current cache behavior | Future offline install |
| Test helpers | Tests use local custom mocks | Unit/integration-style support | Consolidate selectively | Clock/input/IDB/renderer harnesses | LOW | Current tests | All Practice modules |
| Supabase/leaderboards | auth/leaderboard/submission modules | Public rankings/account | No initial reuse beyond optional identity display | Future dedicated sync boundary | DO NOT REUSE DIRECTLY | Boards/rules/submission/auth | None initially |

## 20. Proposed Practice Lab modules

All modules should live under **js/practiceLab/** and expose narrow pure or controller APIs. Experiments live under **js/practiceLab/experiments/**.

| Module | Responsibility | Inputs | Outputs | Dependencies | Must not own | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| **practiceSchemas.js** | Constants, validators, serializable DTO contracts | Unknown persisted/runtime values | Validated schema objects/errors | None | Storage I/O, DOM | Prompt 2 |
| **practiceMigrations.js** | Ordered, idempotent schema upgrades | Older Practice records | Current records/report | Schemas | UI, ranked storage | Prompt 2 |
| **practiceStorage.js** | localStorage/IndexedDB repositories, retention, transactions, recovery | Summaries, aggregates, review/custom data | Reads/write outcomes | Schemas/migrations | Analysis, DOM, leaderboards | Prompt 2 |
| **practiceSessionEngine.js** | Lifecycle, monotonic time, event trace, completion/abandon | Config, content, normalized input, clock | Final trace/result candidate/view state | Input policy, metrics | DOM, persistence policy, submission | Prompt 3 |
| **practiceInputEngine.js** | Apply normalized events to expected text and correction policy | Event, cursor/content/session state | State transition/event record | Pure text helpers | Listeners, rendering | Prompt 3 |
| **practiceLabController.js** | Sub-routing, orchestration, resource ownership, cleanup | App route/actions/services | Render models/navigation effects | Engine/storage/registry/renderer | Metric formulas, raw DB internals | Prompt 4 |
| **practiceRegistry.js** | Experiment metadata and lazy module lookup | Experiment ID | Definition/capabilities | Experiment modules | Runtime state | Prompt 4 |
| **practiceRenderer.js** | Active word/paragraph view, caret, feedback, bounded DOM | Renderer-neutral view model | DOM/update/cleanup | Pure markup/layout helpers | Analysis, storage, input listeners | Prompt 4/5 |
| **practiceMetrics.js** | Versioned primitive and session metric formulas | Normalized trace/timing | Metric snapshot | Pure statistics helpers | Recommendations/UI | Prompt 3 then Prompt 5 |
| **practiceAnalyzer.js** | Per-key/sequence/word/fatigue/confidence analysis | Trace, targets, baseline | Analysis report | Metrics/schemas | Persistence side effects | Prompt 5/6 |
| **practiceSkillMap.js** | Merge evidence into bounded skill aggregates | Prior map, analysis, timestamp | Updated map/deltas | Schemas/confidence rules | Content generation | Prompt 5/6 |
| **practiceReviewQueue.js** | Review scheduling and due-item selection | Skill deltas, outcomes, dates | Queue updates/due list | Schemas/date utility | Rendering/content text | Prompt 5/later |
| **practiceContentGenerator.js** | Deterministic content strategies and target coverage | Experiment/config/targets/pools/seed | Content plan + provenance | Registry/index loaders/random | Skill mutation | Prompt 5/6 |
| **practiceContentLoader.js** | Lazy fetch, validate, cache versioned datasets/indexes | Dataset ID | Validated content/index | Fetch/schema validators | Adaptation/recommendations | Prompt 5/6 |
| **practiceDifficulty.js** | Convert baseline/confidence into bounded challenge parameters | Skills/history/config | Difficulty plan/explanation | Pure math/config | Content I/O, UI | After Assessment |
| **practiceRecommendations.js** | Explainable next-session selection | Skill map, queue, history, preferences | Ranked recommendations/reasons | Difficulty/review | Session mutation | After Assessment |
| **practiceSelectors.js** | Pure home/progress/result view models | Stored Practice models | UI-ready immutable data | Format utilities | DOM/storage writes | Prompt 4/5 |
| **practiceOnboarding.js** | Practice tutorial/help descriptors/bridge | Route/experiment state | Tutorial IDs/content | Existing onboarding framework | Session logic | Prompt 4/later |
| **practiceDiagnostics.js** | Developer-only schema/engine/content diagnostics | Controller/services | Safe diagnostic text | Read-only APIs | Custom text/raw sensitive output | Prompt 5 |

### Experiment contract

Refine the conceptual contract to separate static definition from session execution:

~~~text
{
  id,
  version,
  title,
  category,
  capabilities,
  createDefaultConfig(context),
  validateConfig(config, context),
  loadResources(context),
  generatePlan({ config, targets, skillMap, seed, resources }),
  createInputPolicy({ config, plan }),
  createCompletionPolicy({ config, plan }),
  analyze({ trace, plan, baseline, metricVersion }),
  proposeUpdates({ analysis, priorSkillMap, reviewQueue }),
  recommendNext({ analysis, context })
}
~~~

Every generated plan must carry experiment/content/generator versions, seed, target IDs, expected text, and completion policy. Definitions must not render DOM, write storage, submit scores, read global state directly, or mutate skill/review data. The controller performs resource loading and commits validated analyzer outputs in one persistence operation.

## 21. Architecture risk register

Likelihood and impact use Low/Medium/High. Ordering is by combined architectural danger.

| Rank | Risk | Likelihood | Impact | Affected systems | Mitigation | Future prompt |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Ranked Typing metrics/history contamination | Medium | High | Typing, profile, boards | Separate schemas/storage/results; invariant tests that block ranked APIs | Prompt 2/3 |
| 2 | Typing Test regression during helper extraction | High | High | English 200 renderer/input/metrics | Add golden parity tests; additive helpers; no extraction until needed | Prompt 5 |
| 3 | Duplicate physical/mobile input | Medium | High | Metrics, skill map, mobile | One listener authority; normalized trace harness; direct adapter contract | Prompt 3 |
| 4 | Mobile beforeinput/input/composition duplication | High | High | iOS/Android sessions | Preserve suppression protocol; device/manual matrix; simulator tests | Prompt 3/5 |
| 5 | Storage schema/migration loss | Medium | High | All Practice progress/custom text | Versioned independent stores; fixtures; copy-before-upgrade; salvage/fallback | Prompt 2 |
| 6 | localStorage quota and synchronous stalls | High | High | Progress, sessions, UI | IndexedDB for large records; bounded cache; quota/error tests | Prompt 2 |
| 7 | Per-keystroke persistence cost/corruption | High | High | Active typing/performance | Memory trace; one atomic completion commit; sparse checkpoint only | Prompt 2/3 |
| 8 | Large custom-text DOM/HTML injection | High | High | Renderer, privacy, security | Windowed rendering; textContent/escaping; length limits; stress tests | Prompt 4/5 |
| 9 | Timing precision/cross-clock errors | Medium | High | All metrics | performance.now for intervals, epoch for records; deterministic clock tests | Prompt 3 |
| 10 | Hidden-tab time counted as practice | High | High | Timed sessions/fatigue | Explicit visibility auto-pause and reason; lifecycle tests | Prompt 3 |
| 11 | Pause/resume deadline or trace corruption | Medium | High | Metrics/session engine | State machine; idempotent transitions; accumulated active timing tests | Prompt 3 |
| 12 | Refresh interpreted as completion | Medium | High | History/review/mastery | Checkpoint separate from completion; abandon by default | Prompt 2/3 |
| 13 | Low-sample false weakness/recommendation | High | High | Adaptation/user trust | Confidence/sample thresholds, uncertainty UI, stable baseline | Prompt 5/6 |
| 14 | Overfitted adaptive loop | Medium | High | Daily training/recommendations | Exploration quota, holdout assessment, bounded difficulty, explainability | Prompt 6/later |
| 15 | Review scheduling/date/timezone errors | Medium | Medium | Review Queue/streaks | Store UTC instants plus local date context; timezone tests/reconciliation | Prompt 2/5 |
| 16 | Unbounded key/n-gram/word cardinality | High | Medium | Memory/storage/analytics | Allowlisted trigrams, minimum samples, LRU/top-N retention | Prompt 2/5 |
| 17 | Content licensing/provenance gap | Medium | High | Real Text/public release | Dataset manifest, license review, attribution, no scraped passages | Dedicated content prompt |
| 18 | Existing content used outside validation intent | Medium | Medium | Assessment/recommendations | Purpose-specific validators and versioned derived indexes | Prompt 5/6 |
| 19 | Service-worker stale modules/data | Low now | High later | Entire app | No SW in initial work; dedicated cache/version design if added | Post-Prompt 6 |
| 20 | GitHub Pages/browser cache mismatch | Medium | Medium | New modules/data | Version metadata, changed asset URLs when needed, deployment smoke test | Prompt 4/5 |
| 21 | Accessibility regression in character/charts UI | Medium | High | Active renderer/Progress | Semantic text, focus tests, table alternatives, reduced motion | Prompt 4/5 |
| 22 | Mobile visual viewport/focus instability | High | Medium | Mobile session | Reuse controller; host injection; orientation/keyboard manual tests | Prompt 4/5 |
| 23 | Global listener/session cleanup leak | Medium | High | Every mode | One route delegate; explicit destroy; loop/input ownership tests | Prompt 3/4 |
| 24 | Custom text leaks into logs/submission | Low | High | Privacy/auth/diagnostics | Local-only records, redacted diagnostics, no leaderboard imports | Prompt 2/4 |
| 25 | IndexedDB eviction/private-mode behavior | Medium | Medium | Practice history | Graceful unavailable/quota state; localStorage minimal fallback/export later | Prompt 2 |
| 26 | Audio/metronome remains active after pause/exit | Medium | Medium | Future metronome | Controller-owned audio cleanup and visibility tests | Metronome experiment prompt |
| 27 | Dynamic import failure breaks app navigation | Low | Medium | Practice route | Catch and render retry; keep main bootstrap independent | Prompt 4 |
| 28 | No cold-offline asset guarantee | Medium | Medium | Offline expectation | Define no-server vs offline-install wording; future SW decision | Prompt 2/4 |

## 22. Protected invariants

Future Practice prompts must continuously verify:

1. **data/english200.json** and English 200 v1 metadata remain unchanged.
2. Ranked Typing Test metric version and formulas remain unchanged.
3. Ranked 15-second and 60-second eligibility remains unchanged.
4. Practice sessions never call current leaderboard preparation/submission.
5. Practice sessions never create pending-result intents.
6. Practice results never update ranked Typing Test records or generic personal bests.
7. Practice results never unlock Campaign levels or alter grades.
8. Campaign, Boss, Endless, and Daily scoring/formulas remain unchanged.
9. Daily challenge version, UTC seed behavior, and records remain unchanged.
10. Leaderboard board keys, rules versions, comparators, and server validation remain unchanged.
11. Authentication, OAuth return, username creation, and auth storage behavior remain unchanged.
12. Only one global document-level keyboard listener exists.
13. Editable input/textarea/select/contenteditable elements retain native editing.
14. Gameplay/Practice Backspace cannot trigger browser navigation.
15. One physical/software action produces at most one Practice input event.
16. Composition input follows an explicit tested policy and is never partially double-counted.
17. Mobile viewport/focus cleanup occurs on completion, abandonment, and navigation.
18. Only one active mode loop/session owns input at a time.
19. Existing target locking, trajectories, smoothing, and zoom invariance remain unchanged.
20. Practice state uses its own schema/versioned storage and does not enlarge **wordstrike_save**.
21. Raw keystroke traces are not written to localStorage per event.
22. Custom text stays local by default and is escaped/redacted.
23. Initial Practice requires no account, Supabase migration, Edge Function, or network API.
24. Initial Practice can run without a server dependency after its static assets are available; cold-offline installation is not claimed without a service worker.
25. Developer Practice sessions cannot update durable mastery/review or any ranked record unless an explicit test-only fixture requests it.
26. Session completion and persistence are idempotent.
27. Hidden time is excluded according to the explicit visibility policy.
28. Stored content, metric, experiment, and schema versions are sufficient to interpret historical summaries.
29. New large datasets are lazy-loaded and do not slow the existing initial bootstrap.
30. No production Practice implementation is introduced by this audit document.

## 23. Recommended implementation sequence

### Prompt 2 - Data architecture

| Item | Requirement |
| --- | --- |
| Prerequisite files | **state.js**, **modes.js**, **storage.js**, **modeStorage.js**, **sessionManager.js**, **sessionResult.js**, **playerProfile.js**, **lifetimeStatistics.js**, **pendingResultSubmission.js**, existing storage tests |
| Likely files to create | **practiceSchemas.js**, **practiceMigrations.js**, **practiceStorage.js**, focused Practice storage/migration tests and fixtures |
| Likely files to modify | Prefer none in production initially; only wire later if a repository factory needs exposure. Do not modify current storage keys. |
| Tests first | Defaults; validation; migration chain; round trip; corruption; unknown future version; quota/write failure; IndexedDB unavailable; retention; completion idempotence; custom-text privacy; no ranked API calls |
| Risks | Quota, migration loss, timezone/review dates, overlarge summaries, refresh checkpoints |
| Acceptance | Versioned independent schema/store plan and implementation; bounded retention; atomic completion; explicit fallback; no current save/mode/submission behavior changed |

Prompt 2 must decide exact schema IDs/versions, localStorage keys, IndexedDB database/object stores/indexes, summaries vs traces, aggregate identifiers, confidence/sample representation, review timestamps, custom-text records, checkpoint semantics, migration/failure recovery, deletion/export hooks, and privacy flags.

### Prompt 3 - Shared Practice Session Engine

| Item | Requirement |
| --- | --- |
| Prerequisite files | Prompt 2 contracts; **sessionManager.js**, **sessionCleanup.js**, **speedTest.js**, **speedTestMetrics.js**, **mobileInputAdapter.js**, **inputSafety.js**, **gameplayViewport.js** |
| Likely files to create | **practiceSessionEngine.js**, **practiceInputEngine.js**, **practiceMetrics.js**, deterministic clock/input/lifecycle test helpers |
| Likely files to modify | None or a narrowly backward-compatible input adapter export; no Typing behavior changes |
| Tests first | State transitions; first input; pause/resume; hidden tab; completion once; abandon; correction policies; timestamp ordering; physical/mobile equivalence; composition; cleanup |
| Risks | Duplicate input, timing drift, listener leaks, synthetic-event data loss |
| Acceptance | Pure/headless engine accepts normalized events, emits deterministic trace/result candidate, excludes pause/hidden time, and has no DOM/storage/leaderboard dependency |

### Prompt 4 - Practice Lab shell and registry

| Item | Requirement |
| --- | --- |
| Prerequisite files | Prompt 2 repository API; Prompt 3 engine; **main.js**, **state.js**, **modes.js**, **ui.js**, **onboarding*.js**, **style.css** |
| Likely files to create | **practiceLabController.js**, **practiceRegistry.js**, **practiceRenderer.js**, **practiceSelectors.js**, shell/route/onboarding tests |
| Likely files to modify | **modes.js** to enable/route Practice; **state.js** for route constants; **main.js** for one delegated route/cleanup; **style.css** for Practice shell; possibly onboarding content |
| Tests first | Existing mode navigation/cleanup invariants; Practice entry/home/back; one listener; direct route failure; active-session exit; mobile mount/unmount; lazy-load failure |
| Risks | Main router growth, cleanup leak, layout/accessibility regression, initial-load increase |
| Acceptance | Navigable local shell with no substantive experiment, no ranked side effects, lazy Practice modules/resources, complete keyboard/pointer/back behavior |

### Prompt 5 - Foundation audit

| Item | Requirement |
| --- | --- |
| Prerequisite files | Prompt 2-4 modules; **ui.js speedWordMarkup()**, **speedTestLayout.js**, **statistics*.js**, content loaders, test helpers |
| Likely files to create | **practiceAnalyzer.js**, **practiceSkillMap.js**, **practiceReviewQueue.js**, **practiceContentLoader.js**, **practiceContentGenerator.js**, **practiceDiagnostics.js** |
| Likely files to modify | Only proven pure-helper extraction from Typing after parity tests; Practice renderer/styles; no ranked formulas |
| Tests first | Typing visual/input/metric parity; analyzer fixtures; aggregate idempotence; confidence thresholds; content validation; renderer windowing/escaping; accessibility view models |
| Risks | Typing regressions, false weaknesses, unbounded cardinality, unsafe custom text |
| Acceptance | Audited foundations can generate versioned plans, analyze traces, update bounded skills/reviews, and render large content without changing Typing behavior |

### Prompt 6 - Full Assessment

| Item | Requirement |
| --- | --- |
| Prerequisite files | Versioned storage/session/analyzer/content/skill foundations; audited assessment corpus and targets |
| Likely files to create | Assessment experiment definition, assessment content metadata, result/recommendation selectors, focused tests |
| Likely files to modify | Registry and Practice route/result views only |
| Tests first | Seed repeatability; coverage of keys/bigrams/words; duration bounds; low-sample confidence; pause/mobile equivalence; before/after baseline; no ranking/persistence contamination |
| Risks | Biased corpus, assessment fatigue, misleading confidence, English 200 overlap claims |
| Acceptance | Repeatable local assessment creates versioned evidence and explainable baseline/next recommendation without public score, English 200 mutation, or server dependency |

## 24. Open questions

Prompt 2 or a later product decision must resolve:

1. What retention target is acceptable for completed summaries, aggregate history, and optional raw traces?
2. Is IndexedDB required from the first Practice release, or can the first assessment use bounded localStorage aggregates while the repository layer preserves an upgrade path?
3. Should an interrupted session be recoverable, or explicitly abandoned with only setup restored?
4. What exact hidden-tab resume policy is least surprising on desktop and mobile?
5. Which keyboard layouts and languages are in initial scope? Key-position analysis is layout-dependent.
6. Are composition/IME sessions supported for skill analytics, accepted as text-only, or explicitly out of scope initially?
7. What audited corpus will power Assessment/Common Words, and may it overlap gameplay vocabulary?
8. What licenses and attribution requirements apply to future real-text passages?
9. How many bigrams/trigrams/words may remain active before low-confidence entries are compacted or evicted?
10. What confidence model and minimum samples prevent false weakness labels?
11. Which metrics are shown live without distorting behavior, and which appear only after completion?
12. Should Practice contribute a small aggregate to Profile & Stats, or remain fully inside Practice until the feature stabilizes?
13. What export/delete UX is required before storing custom text and detailed history?
14. Does offline mean no account/server dependency, warm-cache operation, or installable cold-offline support?
15. Is metronome audio in the first experiment phase, and what accessibility/default-volume policy applies?
16. What maximum custom-text size and character repertoire should be supported?
17. Should developer sessions be entirely ephemeral or optionally persist into a separate diagnostic store?
18. When, if ever, should optional account sync be considered, and what explicit privacy consent is required?

## 25. Final recommendation

Proceed to Prompt 2 before enabling Practice Lab or extracting Typing Test code. Define a dedicated, versioned, local-first Practice persistence boundary first. Then build a headless Practice session/input engine, integrate one thin Practice sub-router, and add analysis/content foundations before the Full Assessment.

The architecture should preserve a one-way boundary:

~~~text
existing app shell/input primitives
              |
              v
Practice controller -> session engine -> analyzer -> Practice storage
              |
              v
       Practice-only UI

No path from Practice results to ranked records,
leaderboard submission, Campaign progression, or Daily records.
~~~

The current system supplies solid lifecycle, deterministic generation, input safety, mobile viewport, and UI patterns. Its ranked result, Typing Test metric, global state, and synchronous storage models are too specialized for direct Practice reuse. Selective adapters plus isolated Practice modules provide the lowest-regression path and enough structure for the planned assessment, adaptive training, review scheduling, progress analytics, experiments, custom text, and mobile support.

This audit changed documentation only. It did not implement Practice Lab and did not modify production JavaScript, CSS, HTML, data, Supabase, service-worker, leaderboard, scoring, Typing Test, authentication, mobile-input, or submission behavior.
