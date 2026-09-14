# Practice Lab PL40 — Final Release Certification

**Date:** 2026-09-14  
**Status:** CERTIFICATION IN PROGRESS  
**Branch:** `pl40-final-release-certification`  
**Base phase:** PL39 — Privacy, Security & Data Integrity

## Purpose

PL40 is the closure phase for the cumulative Practice Lab implementation. It adds no new player-facing capability. Its only purpose is to prove that the Practice Lab stack built through PL1–PL39 is internally coherent, regression-safe, privacy-safe, and ready for a later explicit activation decision.

PL40 does **not** launch Practice Lab publicly.

## Frozen release boundary

The following contracts are release blockers:

- `PRACTICE_LAB_PUBLIC_ENABLED` remains `false`.
- The canonical Practice Lab mode remains registered but disabled.
- The canonical mode status remains `coming-soon`.
- The canonical public route remains `null`.
- Developer preview access remains explicit and isolated from the canonical mode definition.
- No PL40 change may alter gameplay, scoring, curriculum, corpus semantics, persistence schemas, migration behavior, privacy behavior, or production navigation.
- No PL40 change may merge the Practice Lab stack into `main` or expose it as a normal production mode.

## Certification gates

A PL40 PASS requires all of the following on the PL40 implementation commit:

1. **Release-boundary contract**
   - `tests/practice-final-release-pl40.test.js`
   - Public feature gate is closed.
   - Canonical mode metadata remains disabled/coming-soon/unrouted.
   - Developer preview resolution does not mutate canonical mode metadata.
   - All cumulative Practice Lab validation and integrity entry points remain present.

2. **Generated/content integrity**
   - `validate:practice-corpus`
   - `validate:practice-indexes`
   - `validate:practice-typability`
   - `validate:practice-sustained`
   - `validate:practice-special-domains`

3. **Privacy, security, migration and storage integrity**
   - Full PL39 `test:practice-integrity` gate.
   - Static privacy/security audit.
   - Database and record migrations.
   - Focused PL39 integrity tests.

4. **Full repository regression suite**
   - `npm test`
   - This includes the cumulative Practice Lab unit/integration suite and the new PL40 release contract.

5. **Real-browser regression certification**
   - `tests/browser/non_practice_regressions.py`
   - `tests/browser/typing_regressions.py`
   - `tests/browser/practice_pl39_privacy_security.py`
   - Existing production modes must remain selectable and operational while Practice Lab remains outside the enabled public mode set.
   - Practice privacy, XSS, network, URL, cache and persistence protections remain intact.

## CI evidence

Workflow: `.github/workflows/pl40-final-release-certification.yml`

Implementation commits created for PL40 certification:

- `ddb3b9829b7d2a50908e671fb8b223f5bbec6653` — PL40 final release contract tests
- `53883fc947206b81ce948a81050ea8c19caff98f` — PL40 final release certification workflow

The final PASS/FAIL status is recorded only after the workflow completes successfully on the PL40 implementation state.

## Allowed PL40 changes

PL40 is verification-only. Changes are limited to:

- certification tests,
- certification workflow/configuration,
- certification evidence/documentation,
- corrections required solely to make an already-specified PL1–PL39 invariant true.

Any new feature or product-behavior change belongs in a later phase and invalidates PL40 certification until separately reviewed.

## Meaning of PASS

A PL40 PASS means the cumulative Practice Lab implementation is technically certified as an internally complete, gated subsystem against the checks above. It does **not** mean Practice Lab is publicly released, enabled in production, or merged to `main`.
