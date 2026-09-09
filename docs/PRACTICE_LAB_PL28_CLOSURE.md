# PL28 closure — Common Words / Typing Vocabulary Breadth

## Scope

PL28 remains the Common Words implementation specified in
`PRACTICE_LAB_COMMON_WORDS_AND_BREADTH.md`. This closure fixes its final
repository-wide regression blocker without relaxing the Practice isolation test,
changing measurement protocols, introducing new stores, or enabling public Practice.

## Final corrections

- Replace the Pace Ladder and Burst Sprints interval timers with one mount-owned,
  cancellable timeout pulse. Each task finishes before another pulse is scheduled.
- Stop scheduling immediately on completion, interruption, or exit. A pending
  task cannot reschedule itself after cancellation.
- Guard late ticks, recovery transitions, completion callbacks, and queued focus
  operations against repainting a screen after its session has closed.
- Make interruption single-flight and clean up listeners, subscriptions, the
  engine, and storage when prepare/start fails.
- Preserve the 190-second Pace Ladder protocol and the six 10-second Burst
  bouts with five full 15-second recovery intervals.
- Make artifact CI read-only and deterministic: rebuild and reject a tracked
  artifact difference instead of committing new artifacts during certification.
- Remove the temporary source-snapshot workflow used for diagnosis.

## Verification

Local verification on Node 22:

- `npm test`: all **322 test files** passed.
- `node --test tests/practice-common-words*.test.js`: **41 tests** passed.
- `node --test tests/practice-session-pulse-pl28.test.js`: **20 tests** passed.
- Existing Practice import/dependency-isolation tests: **2 tests** passed unchanged.
- Canonical PL6 corpus validation passed.
- Common Words rebuild produced byte-identical tracked JSON artifacts.

The new lifecycle tests cover timeout handle zero, inert imports/construction,
non-overlapping work, cancellation during in-flight work, rejected tasks, cleanup
on initialization failure, duplicate interruption, late completion after exit,
late tick/pause callbacks, and all six Burst bouts/five recovery intervals.

Final remote full-suite, artifact, Typing browser, and Non-Practice browser
results are recorded on PR #64. Merge must use the exact certified head SHA.

## Integration boundary

PR #64 retains its existing target, `codex/pl27-burst-sprints-v1`. PL27 itself
remains a separately stacked PR. Merging PL28 is not a merge of the entire
Practice Lab stack into `main`, nor a public release of Practice Lab.
