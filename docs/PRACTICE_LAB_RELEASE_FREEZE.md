# Practice Lab — Phase 9 Final Release Certification & Freeze

## Release state

Practice Lab is feature-frozen for the current release candidate.

Phase 9 introduces no new drill, scoring model, evidence channel, recommendation policy, persistence schema, Research behavior, or user-facing architecture. Changes after this point are restricted to defects discovered by certification, release metadata, and documentation.

## Frozen public surface

The release contains exactly 17 public Practice experiments:

1. Full Assessment
2. Weak Keys
3. Combination Repair
4. Problem Words
5. Accuracy & Recovery
6. Burst Sprints
7. Pace Ladder
8. Common Words
9. Real Text
10. Consistency Trainer
11. Metronome Typing
12. Read-Ahead
13. Endurance
14. Punctuation & Capitals
15. Numbers & Symbols
16. Custom Text
17. Weakness Boss

Daily Training remains a separate public Practice surface.

The public route set is frozen to Home, Daily Training, Experiment Detail, Skill Map, Review Queue, Progress, and Physical Keyboard. Research remains developer-only.

Any addition or removal from those lists requires an explicit release-contract change rather than silently entering the current release.

## Frozen architecture

Production ownership remains:

- `practiceLabController.js` — lazy public entry.
- `practiceLabControllerCurrent.js` — canonical Practice orchestration runtime.
- `practiceLabRendererCurrent.js` — canonical Practice renderer.
- `practiceExperimentCatalog.js` — canonical experiment catalog.
- `practiceCoachService.js` — canonical Daily Coach service.

The V20→V40 file-level compatibility stack is retired and must not return.

Heavy/advanced runtime work remains route-lazy. The normal application graph must not eagerly pull Research, physical-telemetry diagnostics, Treatment Response, Assessment session hosts, or other route-specific heavy session runtimes into the initial page load.

## Automated release gates

The release candidate must keep all of the following green:

- repository `Tests`
- Practice release contracts
- Phase 8 architecture consolidation guard
- Phase 9 release freeze guard
- Daily Coach hardening
- deterministic Practice content/artifacts
- privacy/security
- storage and migration integrity
- Chromium desktop
- Chromium mobile
- Chromium mobile Weakness Boss journey
- Firefox desktop
- WebKit mobile
- browser performance

The consolidated Practice release gate must depend on every matrix area, including the dedicated Chromium-mobile Weakness Boss journey. A failed Practice gate blocks release certification.

## Release invariants

The release must continue to satisfy these invariants:

- all 17 public experiments report `available`
- no public experiment is labeled preview, planned, coming soon, or experimental
- Research is not reachable through normal public routing
- Physical Keyboard telemetry remains aggregate, local, and opt-in
- protected evaluation/research content cannot silently become ordinary training material
- Daily Coach cannot create an unfrozen substitute dose after a plan is activated
- no storage/schema migration may discard existing Practice data without an explicit migration path
- offline/PWA upgrades must not depend on deleted compatibility files
- background time must not be misreported as valid active typing time

## Manual hardware boundary

Automated Chromium/WebKit device contexts are proxies, not physical-device certification.

**Physical-device sign-off pending** for:

- Android Chrome
- Samsung Internet
- iOS Safari
- installed Android PWA
- installed iOS Home Screen PWA
- upgrade-in-place on installed mobile PWAs

Until those checks are actually run on hardware, release notes must retain the phrase **physical-device sign-off pending**. Automated certification must not be presented as proof that these hardware-specific checks were performed.

## Freeze rule

After Phase 9 closes, Practice enters maintenance mode for this release. Only verified regressions, security/privacy defects, compatibility failures, deployment defects, or release-blocking correctness issues should modify the frozen Practice surface before release.
