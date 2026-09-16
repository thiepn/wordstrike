# Practice Lab completion audit — 2026-09-16

Status: implementation repairs and automated completion certification passed remotely; physical-device and assistive-technology certification remain open.
Branch: `finish-practice-lab`. Integration baseline: `4ddb193` (current main merged without conflicts).

This is a new audit, not a rewrite of the frozen 2026-09-14 audit percentages or the historical GC1/GC2 certifications. The earlier PL40 PASS certified a gated subsystem and did not establish content sufficiency or complete playable journeys. The accompanying [JSON matrix](PRACTICE_LAB_COMPLETION_MATRIX.json) records the current evidence by phase. Chromium results and desktop/mobile screenshots are in [practice-completion-evidence](practice-completion-evidence/).

## Findings and implemented repairs

| Area | Audit finding | Implemented result |
| --- | --- | --- |
| Protected content | Benchmark, transfer and assessment manifests lacked enough release-ready governed forms | Six benchmark forms, sixteen transfer forms, eight diagnostic sets with two matched variants each; deterministic provenance/hash/partition checks |
| Real Text | Training pool too small; timed host lacked a pulse and replaced its input node while typing | Sixteen ready training texts; owned timer; stable input; bounded passage rendering; newline input |
| Diagnostic assembly | Long forms risked oversized annotation shards and evidence crossing source boundaries | Bounded source segments, composite verification and item-local entity/timing boundaries; unchanged 2 MiB shard ceiling |
| Dependent content | Existing common-word, sustained, special-domain and Pace artifacts no longer matched the expanded corpus | Rebuilt bound artifacts; Consistency 6/6, Endurance Practice 4/4, Endurance Check 6/6, Pace Ladder 8/8 ready |
| Assessment | Service existed without a canonical playable browser host | Lazy protected loading, canonical sessions, block transitions, final report handoff, repeat assessment, exit/visibility cleanup |
| Read-Ahead | Policy and analysis existed without playable integration | Six governed long forms; canonical 3/6/10-minute schedules; 1/2/4-word visibility envelope; hidden content omitted from DOM; saved block results |
| Metronome | Policy and analysis existed without playable integration | Canonical 2/5/8-minute schedules; actual silent-baseline calibration; fixed visual cue; excluded four-beat count-in; silent integration; saved block results |
| Evidence views | Skill Map and Review Queue were placeholders; Progress omitted session history | Context-scoped persistent evidence, due-state review list, history and bounded 100-record pagination |
| Pace setup | Setup copy still described the superseded protocol | 30-second reference plus eight 20-second canonical rungs |
| Integration | Practice branch diverged from main | Main merged locally; versioned offline shell includes missing Practice modules |

Metronome currently uses the supported visual cue path. Audio cue delivery has not been browser-certified. Result comparisons remain descriptive, sparse blocks remain insufficient, and no ability/retention/causal claim is introduced by these two experiments.

## Preserved boundaries

- DB version 12 and sessionSummary version 14 remain unchanged.
- Persistent entities remain exactly key, bigram, trigram and word.
- Punctuation and numbers/symbols ability channels remain independent of entity evidence.
- Protected passages remain separate from training selection and reference fitting.
- Maximum individual index artifact is 2,088,960 bytes, below 2,097,152 bytes; no guard or content capacity was weakened.
- Content release validation reports zero exact duplicates and zero hard near duplicates. The corpus has 355 moderate similarity warnings, primarily from authored templates; these are not represented as zero similarity or as a completed human editorial review.
- Public activation remains closed under the existing release contract. Integration is tracked in PR #122; deployment status is recorded by GitHub Actions.

## Verification evidence

- `node scripts/validatePracticeReleaseContent.mjs`: PASS.
- `node scripts/auditPracticePrivacySecurity.mjs`: PASS.
- `node scripts/testPracticeMigrations.mjs`: PASS; zero unexpected record loss.
- `tests/practice-preview-protocol-runtime.test.js`: canonical engine completion and persistence for both new hosts, unsupported duration/language rejection.
- Assessment diagnostic tests verify both variants of every set, composite hashes/capacity, boundary exclusion, and rejection of reordered/altered source segments.
- Initial repository run: 373/374 files passed; the stale two-item training-reference expectation was corrected to the actual training artifact size.
- Integrated repository suite: 389/390 files passed on the first integrated run. The sole failure was an inherited main-branch test expecting the unactivated Typing Results V7 entry. Its assertion now verifies the shipped V6 → V6b entry, preserving production behavior; the full V7 plan tests pass on focused rerun. All 390 files are accounted for. A final focused run of 11 controller, protocol, import-side-effect and release-boundary tests also passes.
- `tests/browser/practice_completion.mjs`: Chromium desktop 1280×900 and mobile viewport 390×900 PASS. Actual IndexedDB, canonical controller and beforeinput paths. Quick Assessment, Real Text, Read-Ahead and Metronome complete and persist; masking, DOM bounds, keyboard activation, typing-focus transfer, no page errors, history and final-page horizontal overflow checked. Long timers are accelerated with Playwright's clock, so this is lifecycle evidence, not a full-duration endurance/performance benchmark.
- Read-Ahead and Metronome runs intentionally include sparse blocks; results correctly report insufficient evidence rather than fabricated improvement.

## Remaining release gates

| Gap | Current disposition |
| --- | --- |
| GAP-001/002 | Prior GC1 canonical Pace/Burst repairs preserved |
| GAP-003 | Prior GC2 persistent entity-boundary repair preserved |
| GAP-004 | Automated content capacity/integrity gate passed; moderate editorial similarity warnings disclosed |
| GAP-005 | New canonical browser completion paths pass in Chromium, Firefox and WebKit at desktop and mobile viewport sizes; broader regression workflows tracked in PR #122 |
| GAP-006 | Semantic controls, stable focus/input and bounded responsive views implemented; assistive-technology and full contrast audit not certified |
| GAP-007 | Bounded passage DOM and evidence pagination verified; actual Android performance and long-duration memory certification not claimed |
| GAP-008 | Chromium, Firefox and WebKit automated completion journeys passed. Actual Edge, Safari, Android Chrome, Samsung Internet and iOS Safari/PWA evidence remains open |
| GAP-009 | Main reconciled; branch published and remote core/browser CI passed. Merge and deployed-build parity tracked in PR #122 and deployment workflow |
| GAP-010 | Operational evidence views implemented; persistent history checked in browser |

## Remote completion evidence

User approval on 2026-09-16 authorized publication and integration. PR: https://github.com/thiepn/wordstrike/pull/122.

Certified executable source: `b21eb7b42a16b9821e3308ec74469dc69bb7146a`.

- Full repository suite: all 390 test files PASS in GitHub Actions, run 35148284220.
- Practice Completion: core and browser jobs PASS, run 35148284276. The browser job completed Quick Assessment, Real Text, Read-Ahead, Metronome and persistent history in Chromium, Firefox and WebKit, each at 1280px and 390px widths, without page errors.
- Content validation, privacy audit, migration checks and deterministic Read-Ahead artifact regeneration PASS in the same completion run.
- Firefox container HOME and the explicit V7 browser test fixture were corrected without changing the shipped Typing Results entry.
- Automated engine coverage is not physical-device or assistive-technology certification. Public activation remains gated until those release requirements are met.
