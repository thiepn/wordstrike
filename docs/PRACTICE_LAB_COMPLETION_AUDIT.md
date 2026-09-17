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
| GAP-009 | Closed for PR #122: all 21 workflows passed; merged as `05b2b2c`; Pages run 35150243585 passed; nine live shell/controller/host assets matched SHA-256 |
| GAP-010 | Operational evidence views implemented; persistent history checked in browser |

## Remote completion evidence

User approval on 2026-09-16 authorized publication and integration. PR: https://github.com/thiepn/wordstrike/pull/122.

Certified executable source: `b21eb7b42a16b9821e3308ec74469dc69bb7146a`.

- Full repository suite: all 390 test files PASS in GitHub Actions, run 35148284220.
- Practice Completion: core and browser jobs PASS, run 35148284276. The browser job completed Quick Assessment, Real Text, Read-Ahead, Metronome and persistent history in Chromium, Firefox and WebKit, each at 1280px and 390px widths, without page errors.
- Content validation, privacy audit, migration checks and deterministic Read-Ahead artifact regeneration PASS in the same completion run.
- Firefox container HOME and the explicit V7 browser test fixture were corrected without changing the shipped Typing Results entry.
- Automated engine coverage is not physical-device or assistive-technology certification. Public activation remains gated until those release requirements are met.

## Accessibility and performance hardening follow-up

- Real Text result focus moves to its heading; evidence views preserve keyboard focus after asynchronous loading.
- Assessment passages have a named region; Real Text has a main landmark.
- Practice screens grow with their content, use a stable background without the decorative scanline overlay, and provide visible keyboard focus plus at least 44px-high buttons and input controls.
- Real browser fractional milliseconds are rounded only in the integral profile total; precise session metrics remain unchanged. Regression coverage verifies both completed and abandoned sessions. This fixes real-time finalization failures hidden by integer-clock tests. Protocol finalization errors are now surfaced instead of leaving a silent zero-second screen.
- Idle Real Text timer renders no longer reallocate the passage character array.
- `tests/browser/practice_accessibility.mjs` audits 36 views at 1280, 390 and 320px using the production stylesheets. The local default-palette run has zero WCAG 2/2.1/2.2 A/AA rule violations, zero unresolved checks and zero page overflow. Screenshots were inspected. Native textarea contrast uncertainty is resolved only for opaque, unobscured controls without ancestor filters/opacity, using calculated luminance; the observed minimum is 16.20:1. This is not a screen-reader certification or a claim about every customizable palette.
- `tests/browser/practice_performance.mjs` adds unaccelerated 3-minute Read-Ahead and 2-minute Metronome sessions at 390px with 4x desktop CPU throttling. It records event-handler p95 duration, DOM bounds and observed heap growth. Its conservative budgets are 100ms p95, 2,000 DOM nodes and 24MiB heap growth. This measures a controlled desktop browser, not actual Android hardware or long-duration endurance.
- Both checks are part of the Practice Completion workflow. Offline cache version v4 distributes the updated shell.

Physical-device, assistive-technology and Android endurance certification remain open. No local/CI emulation result is substituted for those requirements. Public activation remains disabled.

## Offline startup and production navigation follow-up — 2026-09-17

A fresh service-worker install followed by an offline document load reproduced a blank startup: the precache omitted the exact versioned entry URLs in `index.html`. Read-Ahead forms and newer runtime assets were also absent. Cache v5 includes those assets, the production logo, and all shipped JavaScript/styles. Query strings are preserved exactly; the fallback does not indiscriminately ignore request parameters. The addition is 1,768,714 bytes (66 entries), rather than precaching the entire annotation corpus.

Real menu clicks also exposed a controller integration defect: the base click handler navigated directly, bypassing the later controllers' route-loading hooks. Real Text remained on “Checking availability” although direct API navigation worked. DOM back, experiment and evidence navigation now dispatch through the complete controller stack.

`tests/practice-offline-shell.test.js` prevents startup URL/runtime asset drift. `tests/browser/practice_offline.mjs` uses the production document, real service worker and actual menu clicks; it checks fresh offline startup, unopened Assessment/Real Text/Read-Ahead/Metronome content, meaningful interrupted-session persistence across reload, and network recovery. The browser workflow retains its report and screenshot. These checks do not constitute installed iOS/Android PWA certification. Public activation remains gated.


## Final acceptance decision — 2026-09-17

**NOT READY FOR PUBLIC RELEASE.** This decision supersedes any implication that only device certification remains.

The production catalog was exercised through actual menu clicks at 1280px and 390px: 17 experiment setup views at each width, zero page errors and zero horizontal overflow. This does not certify every complete session or every populated evidence state.

The editorial review **failed**. All 355 moderate cross-partition pairs share at least one identical sentence of 60 or more characters; the maximum is 14 shared long sentences. Of these pairs, 48 connect benchmark/training, 125 training/transfer, 43 training/research-holdout, 96 benchmark/transfer, 12 benchmark/research-holdout and 31 transfer/research-holdout. These are repeated templates, not merely shared vocabulary. Inspected examples also include agreement errors such as “Shelf labels draws attention” and “reading tables provides”. The existing exact/hard duplicate checks still pass; those thresholds alone cannot establish editorial quality or independent assessment material.

Full evidence: [final-acceptance-review.json](practice-completion-evidence/final-acceptance-review.json).

Required remediation before public activation:

1. Replace repeated-template material with independently authored, grammatically reviewed passages, preserving the required counts and capacities. Review diagnostic prose as well; the current cross-partition warnings do not cover repetition within a partition.
2. Regenerate source hashes, corpus, indexes, typability references and dependent forms/manifests. Recheck protected/training separation, content capacity, shard budgets, provenance, save compatibility and all affected session paths. Do not relax thresholds or relabel related passages as independent families to make the checks pass.
3. Complete actual Android/iOS/browser/PWA, screen-reader and long-session Android acceptance; record environments, outcomes and any fixes.
4. Update the public mode gate and metadata only after final acceptance, run the public-entry regression checks, then deploy and verify the live release.

PR127 remains the latest deployed gated implementation: merge `f9d4aaa1b7124674c3680e026fda2e9610b0bc5f`; 402 test files and all 33 PR workflows passed; Pages deployment 35193456125 succeeded. Those technical results are retained and are not represented as editorial or physical-device certification.


## Independent editorial remediation — 2026-09-17

The editorial failure above has been remediated. All 58 long passages were replaced with independently composed narratives, including all 16 diagnostic variants. The generator now reads curated source prose and cannot recreate the old noun-substitution templates. The earlier failed report is retained as historical evidence.

The rebuilt corpus has zero exact duplicates, zero hard near-duplicates and zero moderate cross-partition warnings. A new mandatory release check reconstructs diagnostic families and rejects repeated sentences of at least 60 characters across different families, both within and across all five partitions. All 87 families pass. The check detects exact sentence reuse; it is not a claim that automated checks alone establish literary quality.

Six benchmark forms, sixteen transfer units, sixteen Real Text units and eight diagnostic sets with two matched variants each are ready under the unchanged matching and capacity policies. The model remains fitted only on training data; research holdout is not scored. All corpus indexes, reference data and dependent experiment forms are rebuilt in dependency order by `scripts/rebuildPracticeEditorialRelease.mjs`.

Benchmark suite and transfer pool revisions advance to 2 so existing exposure records remain in their original lanes. Prior history is retained. Assessment comparisons reject different content revisions instead of presenting aggregate differences across the replacement as directly comparable. Content hashes and checksum bindings identify the new texts; storage schema versions are unchanged. Service-worker cache v6 distributes the new content and comparison logic.

Evidence: [editorial-remediation.json](practice-completion-evidence/editorial-remediation.json). Publication remains a gated implementation release. Actual physical-browser/device/PWA, screen-reader and long-session Android acceptance are still required before enabling the public mode; automated engine or viewport tests do not close those requirements.


## Public release authorization — 2026-09-17

The user explicitly requested public activation so they can test the mode. This supersedes the earlier decision to hold public release for physical-device/PWA, screen-reader and Android endurance acceptance. Those checks are waived as pre-release gates, not represented as performed or passed. Practice Lab is now an enabled public mode with its own route; no developer query is required. Cache v7 distributes the activation. The explicit feature-off configuration remains tested. Automated public-menu, session and offline verification accompanies this release.
