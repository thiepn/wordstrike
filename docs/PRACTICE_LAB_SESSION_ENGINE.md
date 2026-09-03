# Practice Lab Session Engine

Status: Prompt 3 headless foundation + PL5 context identity

## 1. Scope

The modules in **js/practiceLab/** provide a framework-independent typing-session engine for future Practice experiments. They implement lifecycle, content/input contracts, typing state, Practice-only metrics, observations, bounded events, checkpointing/restoration, completion, abandonment, interruption, subscriptions, and diagnostics.

No route, screen, browser listener, renderer, experiment content, recommendation, mastery, or review scheduler is implemented.

## 2. Protected boundaries

The engine imports Prompt 2 Practice contracts and a repository interface. It never accesses IndexedDB, localStorage, DOM, Supabase, authentication, leaderboard services, ranked Typing records, or WORDSTRIKE saves. **js/main.js** does not import it.

### PL5 immutable identity

Before an engine is created, the caller must resolve one valid **profileId + contextId** pair. The engine receives both as constructor identity and never re-reads activeContextId while the session is running. The frozen context propagates through snapshots, checkpoints, analyzer output validation, summaries, and atomic completion. Locale/layout/input-method decisions remain above the generic engine.

## 3. Module map

| Module | Responsibility |
| --- | --- |
| practiceSessionConstants.js | States, transitions, limits, enums, errors |
| practiceSessionContract.js | Experiment, content, input, configuration, segmentation |
| practiceInputEngine.js | Mutable renderer-independent typing state |
| practiceMetrics.js | Practice metrics and observations |
| practiceEventBuffer.js | Bounded in-memory detail |
| practiceCheckpoint.js | Checkpoint builder and restore validation |
| practiceSessionResult.js | Prompt 2 summary/profile construction |
| practiceSessionEngine.js | Lifecycle, timing, checkpoint and completion orchestration |

## 4. Lifecycle state machine

~~~text
created -> ready -> active <-> paused
                    |          |
                    +--> completed
                    +--> abandoned
                    +--> interrupted

ready -------> abandoned
ready -------> destroyed
terminal ----> destroyed
~~~

**PRACTICE_SESSION_TRANSITIONS** is authoritative. Invalid transitions throw **PRACTICE_SESSION_INVALID_STATE**. Repeated pause/resume and destroy are idempotent where safe. Interrupted sessions require restoration into a new engine.

## 5. Public API

**createPracticeSessionEngine()** requires a resolved **profileId** and **contextId**, then exposes prepare, start, handleInput, pause, resume, handleVisibilityState, appendContent, tick, flushCheckpoint, complete, abandon, interrupt, destroy, snapshots, metrics, trace, observations, diagnostics, and subscribe. Session identity is immutable after construction.

**restorePracticeSessionEngine()** validates and restores a checkpoint. All clocks, scheduling, repository, IDs, logging, checkpoint policy, and segmentation are injectable.

## 6. Experiment descriptor contract

Descriptors are plain runtime objects containing stable ID/version, title/category, session schema version, default correction behavior, supported completion modes, and resumability. Optional callbacks validate configuration/content, transform normalized input, evaluate completion, analyze immutable results, and build extensions.

Callbacks are never persisted. The generic test descriptor is created by **createGenericPracticeExperimentDescriptor()**.

## 7. Content-plan contract

**createPracticeContentPlan()** creates immutable version-1 plans with content ID/generator version, text, grapheme-indexed non-overlapping units, target entities, completion policy, metadata, and deterministic FNV content hash.

Plans support content, duration, word-count, and manual completion. Omitted units receive deterministic Unicode-aware word fallback units. **appendPracticeContentPlan()** preserves prior text, indices, IDs, and typing state while validating the combined plan. Active text is capped at 500,000 graphemes.

## 8. Normalized input contract

The engine accepts character, space, backspace, or word-delete objects containing value, source, monotonic timestamp, UTC wall timestamp, and ctrl/meta/alt/shift flags. It never reads browser key codes or raw events. Normal rejection returns an input-result reason rather than throwing.

## 9. Unicode segmentation

**createPracticeSegmenter()** uses **Intl.Segmenter** grapheme mode when available and **Array.from()** as a surrogate-safe fallback. A segmenter is injectable. Initial tested scope covers English/German, accented Latin, punctuation, numbers, symbols, and surrogate-pair emoji. Complex-script/IME correctness remains adapter and future-browser-test work.

## 10. Typing-state model

**createPracticeTypingState()** stores expected graphemes once, typed entries incrementally, cursor, current/completed units, error positions, corrected-error history, word start, and accepted/correct timestamps. It stores no DOM reference and does not mutate the content plan.

## 11. Correction policies

- **allow** removes one grapheme or the preceding whitespace-delimited word; removed wrong characters become corrected errors and removed correct characters count as correction cost.
- **ignore** consumes and records the correction without changing typing state.
- **disabled** rejects the correction without mutation or correction counters.

Browser navigation prevention remains the future controller/adapter's responsibility.

## 12. Input-result contract

Results include accepted/stateChanged, reason, correctness, completed unit IDs, completion signal, and snapshot version. Reasons include character/space accepted, character/word deleted, correction ignored/disabled, nothing to correct, invalid input, inactive session, content exhausted, completed, and destroyed.

## 13. Timing model

Injected monotonic time drives active/paused duration, latency, words, checkpoint cadence, and transitions. Injected wall time drives UTC timestamps, local-day context, expiry, and wall duration. Active time never derives from wall-clock subtraction and freezes while paused or terminal.

## 14. First-input timing

**on-start** begins performance timing at start. **on-first-input** keeps lifecycle active but performance time at zero until the first accepted character or space. Invalid input and ignored corrections do not start it. First-input latency is measured from activation.

## 15. Pause/resume

Pause freezes active time, starts paused accumulation, rejects input, preserves state, emits once, and forces a resumable checkpoint. Resume waits for an active checkpoint write, excludes paused time, restores active accumulation, and requires explicit invocation.

## 16. Visibility policy

**handleVisibilityState("hidden")** pauses with reason **visibility-hidden** and forces a checkpoint. **visible** changes only visibility metadata; it never auto-resumes. The engine registers no document listener.

## 17. Checkpoint cadence

Defaults are 15 seconds minimum, 50 accepted insertions threshold, one timer, and no setInterval. Meaningful changes mark state dirty. Scheduled writes coalesce. Pause, hidden, interruption, and manual flush force a write. A write never clears dirty state when a newer snapshot was produced while that write was pending. Non-resumable, empty, created, completed, abandoned, and destroyed sessions do not checkpoint.

## 18. Checkpoint payload

**buildPracticeCheckpoint()** uses the current schema: immutable **profileId + contextId + sessionId**, versions, configuration, full bounded content snapshot and descriptor/hash, cursor/typed buffer, completed units, durations, aggregate metrics, original start/timezone context, and at most 32 recent input events. It contains no unbounded trace, callback, DOM, auth, or ranking data.

## 19. Restoration

Restore validates schema/expiry/profile/**context**/experiment/session/content versions, context ownership, resumability, content hash, cursor bounds, and reconstructed content. A checkpoint whose context is missing or no longer belongs to its profile fails recoverably and is never restored under the currently active context. Already-committed session IDs return their existing summary without recommit. A valid restore begins paused and requires explicit resume.

## 20. Event-buffer limits

**createPracticeEventBuffer()** retains the newest 20,000 detailed events by default. It preserves total count, marks truncation, and keeps aggregate metrics independently. Traces are immutable copies, remain in memory, and are cleared during destroy.

## 21. Metrics formulas

Practice Raw WPM = accepted inserted graphemes / 5 / active minutes.

Practice correct WPM = correct final aligned graphemes / 5 / active minutes.

Event accuracy = correct accepted insertions / accepted insertions x 100; zero input reports 100. Uncorrected errors are wrong graphemes remaining at finalization. Corrected errors are wrong graphemes removed by allowed correction. Correction cost separately tracks inputs, removed characters, removed correct characters, and active time until forward progress.

Consistency uses eligible insertion transitions at or below 2,000 ms. After at least 10 samples:

~~~text
CV = sample standard deviation / mean
consistency = clamp(100 - CV * 100, 0, 100)
~~~

Insufficient evidence returns null.

## 22. Key, bigram, trigram, and word observations

Transition latency is attributed to the expected current grapheme. Bigrams use previous plus current expected graphemes. Trigrams use exactly two previous plus current, never four characters. Word observations use units/fallback boundaries and contain start delay, completion duration, correctness, and correction count. Punctuation/number/symbol extension types remain available to later analyzers.

## 23. Completion modes

- **content**: typed cursor reaches expected content length.
- **duration**: active performance duration reaches positive target; controller calls **tick()**.
- **word-count**: completed word units reach the target.
- **manual**: only explicit completion.

Evaluation occurs after accepted input, append, tick, and explicit completion.

## 24. Result construction

**buildPracticeSessionResult()** maps immutable **profileId + contextId + sessionId**, version, content descriptor, UTC/local time, durations, generic metrics, targets, and bounded optional analysis into a current Practice summary. The historical contextId is persisted permanently and is never derived later from activeContextId. It creates no recommendation, mastery, leaderboard, ranked, submission, or raw-event field.

## 25. Experiment analysis hook

Optional **analyzeResult()** receives an immutable snapshot containing the frozen profile/context identity, metrics, bounded in-memory trace, and observations. Any returned skill/review updates must match the completing summary's profileId and contextId; mixed-context output is rejected before commit. Output must be JSON-safe and at most 32 KiB. Analyzer failure blocks commit, pauses an active session, preserves/refreshes its checkpoint, and returns a recoverable **PRACTICE_SESSION_ANALYSIS_FAILED** error. Retry is explicit.

## 26. Atomic completion

~~~text
lock finalization
 -> freeze active timing
 -> await checkpoint write
 -> calculate metrics/observations
 -> optional analysis
 -> build + validate summary/profile update
 -> repository.commitCompletedPracticeSession() [profile/context ownership enforced]
 -> transaction clears checkpoint
 -> enter completed
 -> emit completed once
~~~

Prompt 3 supplies empty skill/review updates unless an injected analyzer explicitly returns validated updates.

## 27. Idempotence

Concurrent completion calls share one promise. Repeated completion returns the committed result. Commit failure preserves session ID/prepared state and permits retry. Prompt 2 duplicate guards prevent a second summary. Successful restore detects an existing summary instead of recommitting.

## 28. Abandonment

Below 20 accepted insertions and 30 active seconds, abandonment clears the checkpoint and stores no summary/profile update. Meeting either threshold creates an abandoned generic summary, no skill/review changes, and counts active duration but not completed-session total. The active local day is counted once through nullable **lastTrainingDayKey**, a preserved local **YYYY-MM-DD** key distinct from UTC timestamps.

## 29. Interruption

Interruption freezes timing, enters terminal **interrupted**, forces a checkpoint, emits once, and creates no summary/profile update. Reasons are caller-provided bounded metadata such as refresh, navigation, runtime error, timeout, or disposal.

## 30. Destruction

Destroy cancels scheduled checkpoint work, waits for an in-flight write, emits once, clears subscribers/events/content references, blocks future input/writes, and is idempotent. Destroying active/paused state returns a structured warning and never implicitly completes or abandons.

## 31. Race handling

One checkpoint write may run at a time; forced requests wait/coalesce. Resume waits for a write. Completion cancels the timer, waits for an active write, then transactionally clears the checkpoint so no stale checkpoint survives. Destroy cancels timers and awaits safe work. One finalization promise owns all concurrent completion paths.

## 32. Error model

**PracticeSessionError** carries code, message, operation, session ID, lifecycle state, recoverability, safe cause, and bounded details. Codes cover invalid state/config/content/input, inactive/finalized/destroyed sessions, checkpoint/restore/content mismatch, analyzer failure, and commit failure. Error messages never include full content text.

## 33. Diagnostics

**getDiagnostics()** returns session/state/version, total/retained/truncated events, active duration, checkpoint state/count/time, content length, cursor, subscriber count, finalization state, and last error code. It excludes full expected/typed text, custom text, auth, and storage secrets.

## 34. Repository dependencies

The engine requires only the Prompt 2 repository methods: profile read, checkpoint save/get/clear, summary lookup, and atomic completed-session commit. Tests use the explicitly injected memory repository. The engine neither opens nor selects a storage backend.

The only Prompt 2 schema extension is nullable **lastTrainingDayKey** on profiles, needed to count local active days idempotently. That persisted change advances only the profile record from v1 to v2. The deterministic migration adds null when absent; IndexedDB structural version 1, manifest version 1, and every other record version remain unchanged.

## 35. Testing strategy

Focused Node tests cover contracts, Unicode, immutable append, lifecycle, normalized input, correction modes, words/units, deterministic timing, visibility, event truncation, formulas, inactivity exclusion, n-grams, checkpoint cadence/payload/restore, completion modes, atomic/idempotent commit, profile updates, abandonment, interruption, commit retry, destroy, checkpoint races, and static privacy/import boundaries.

## 36. Prompt 4 integration contract

Prompt 4 may create a controller that:

1. lazy-loads Practice modules;
2. selects an experiment descriptor/content plan;
3. creates or restores an engine with the repository;
4. routes already-normalized input to **handleInput()**;
5. calls **tick()** from its own frame/timer policy;
6. forwards document visibility to **handleVisibilityState()**;
7. renders immutable subscribed snapshots;
8. interrupts before route disposal, then destroys;
9. never converts a Practice result into ranked mode storage.

## 37. Known limitations

- No full complex-script/IME guarantee beyond normalized grapheme input.
- Fallback segmentation handles code points, not every extended grapheme cluster.
- Checkpoints retain aggregate metrics and a 32-event continuation tail, not full replay history.
- Word fallback is punctuation/whitespace oriented and not a language tokenizer.
- No automatic controller tick, visibility listener, or input adapter is installed.
- Analyzer outputs are structurally validated; experiment-specific semantics belong to later prompts.
- Session content snapshot may be large but remains under the 500,000-grapheme/Prompt 2 checkpoint bounds.

## 38. Open questions

1. Should Prompt 4 tick duration sessions via rAF or a lower-frequency controller timer?
2. Which mobile normalized-input metadata should be retained in future analysis?
3. Should checkpoint content use references for known immutable datasets to reduce write size?
4. Which experiments may opt out of analyzer-failure blocking?
5. Should future word segmentation use locale-specific Intl.Segmenter word mode?
6. How should Prompt 4 present recoverable checkpoint/commit errors without exposing text?
