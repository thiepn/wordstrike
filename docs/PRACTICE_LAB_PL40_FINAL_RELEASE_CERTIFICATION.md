# Practice Lab PL40 — Final Release Certification

> Historical certification. For the 2026-09-16 completion audit, implemented repairs, and still-open release gates, see [PRACTICE_LAB_COMPLETION_AUDIT.md](PRACTICE_LAB_COMPLETION_AUDIT.md). This original record is retained; its PASS must not be read as current production-release certification.

**Date:** 2026-09-14  
**Status:** PASS  
**Branch:** `pl40-final-release-certification`  
**Base phase:** PL39 — Privacy, Security & Data Integrity  
**Certified source:** `d4f707e059f53dd11cb2e0bb6d49d6f7068b197f`  
**Certification run:** `34883477296`

## Purpose

PL40 is the closure phase for the cumulative Practice Lab implementation. It adds no new player-facing capability. Its only purpose is to prove that the Practice Lab stack built through PL1–PL39 is internally coherent, regression-safe, privacy-safe, and ready for a later explicit activation decision.

PL40 does **not** launch Practice Lab publicly.

## Frozen release boundary

The following contracts are release blockers and passed certification:

- `PRACTICE_LAB_PUBLIC_ENABLED` remains `false`.
- The canonical Practice Lab mode remains registered but disabled.
- The canonical mode status remains `coming-soon`.
- The canonical public route remains `null`.
- Developer preview access remains explicit and isolated from the canonical mode definition.
- PL40 does not alter gameplay, scoring, curriculum, corpus semantics, persistence schemas, migration behavior, privacy behavior, or production navigation.
- PL40 does not merge the Practice Lab stack into `main` or expose it as a normal production mode.

## Certification gates

All required gates passed on certification run `34883477296`.

1. **Release-boundary contract — PASS**
   - `tests/practice-final-release-pl40.test.js`
   - Public feature gate is closed.
   - Canonical mode metadata remains disabled/coming-soon/unrouted.
   - Developer preview resolution does not mutate canonical mode metadata.
   - All cumulative Practice Lab validation and integrity entry points remain present.

2. **Generated/content integrity — PASS**
   - `validate:practice-corpus`
   - `validate:practice-indexes`
   - `validate:practice-typability`
   - `validate:practice-sustained`
   - `validate:practice-special-domains`

3. **Privacy, security, migration and storage integrity — PASS**
   - Full PL39 `test:practice-integrity` gate.
   - Static privacy/security audit.
   - Database and record migrations.
   - Focused PL39 integrity tests.

4. **Full repository regression suite — PASS**
   - `npm test`
   - The cumulative WordStrike suite, including the PL40 release contract, completed successfully.

5. **Real-browser regression certification — PASS**
   - `tests/browser/non_practice_regressions.py`
   - `tests/browser/typing_regressions.py`
   - `tests/browser/practice_pl39_privacy_security.py`
   - Existing production modes remained selectable and operational while Practice Lab stayed outside the enabled public mode set.
   - Practice privacy, XSS, network, URL, cache and persistence protections remained intact.

## CI evidence

Workflow: `.github/workflows/pl40-final-release-certification.yml`

Certified workflow run:

- Run: `34883477296`
- Certified source: `d4f707e059f53dd11cb2e0bb6d49d6f7068b197f`
- `final-certification` job: `104108216556` — PASS
- `browser-certification` job: `104108216814` — PASS

PL40 implementation commits:

- `ddb3b9829b7d2a50908e671fb8b223f5bbec6653` — PL40 final release contract tests
- `53883fc947206b81ce948a81050ea8c19caff98f` — PL40 final release certification workflow
- `d4f707e059f53dd11cb2e0bb6d49d6f7068b197f` — certification gate documentation included in the certified source

## Allowed PL40 changes

PL40 is verification-only. Changes are limited to:

- certification tests,
- certification workflow/configuration,
- certification evidence/documentation,
- corrections required solely to make an already-specified PL1–PL39 invariant true.

Any new feature or product-behavior change belongs in a later phase and invalidates PL40 certification until separately reviewed.

## Meaning of PASS

PL40 PASS means the cumulative Practice Lab implementation is technically certified as an internally complete, gated subsystem against the checks above. It does **not** mean Practice Lab is publicly released, enabled in production, or merged to `main`.
