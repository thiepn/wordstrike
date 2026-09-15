# PL27 — Burst Sprints

## Status

Canonical protocol version: **2**  
Experiment version: **2**  
Estimator version: **2**

Burst Sprints remains a developer-gated Practice Lab preview. GC1 replaces the superseded v1 timing protocol; it does not expand the mode or change the public Practice gate.

## Canonical protocol

Burst Sprints uses one continuous diagnostic form.

1. **Warm-up — 30 seconds active typing**
2. **Preview 1 — 2 seconds, input disabled**
3. **Sprint 1 — 10 seconds active typing**
4. **Recovery — 18 seconds, input disabled**
5. Repeat Preview → Sprint → Recovery through Sprint 5
6. **Preview 6 — 2 seconds, input disabled**
7. **Sprint 6 — 10 seconds active typing**
8. End immediately after Sprint 6; there is **no final recovery**.

Totals:

- Active typing: **90,000 ms** = 30 s warm-up + 6 × 10 s sprints
- Protocol-inactive preview: **12,000 ms** = 6 × 2 s
- Protocol-inactive recovery: **90,000 ms** = 5 × 18 s
- Total protocol-inactive time: **102,000 ms**
- Wall protocol: **192,000 ms**

Preview and recovery are trusted protocol-inactive intervals, not user pauses. Timing continuity is reset across every active/inactive boundary so PL8 does not infer giant cross-boundary latencies.

## Warm-up and content continuity

The 30-second warm-up uses ordinary natural typing and may contribute normal diagnostic-role PL11 evidence. It contributes **zero Burst ability measurement** and is not one of the six sprints.

The session uses one continuous form. Content is not reset for each sprint and a sprint may begin mid-word. Recovery hides the upcoming text; the following 2-second preview reveals it.

If a sprint begins while an error from prior active content is still open, that sprint is marked `carryoverOpenError` and is excluded from the Burst estimator. Eligible PL11 diagnostic evidence may still be retained under the normal evidence rules.

## Sprint validity

A sprint is valid for Burst estimation only when all canonical floors hold:

- 10-second duration within protocol tolerance
- accepted forward insertions >= 30
- first-pass opportunities >= 30
- first-pass accuracy >= 75%
- `carryoverOpenError = false`
- no visibility/protocol corruption
- no content exhaustion

The 75% floor is a **measurement-validity floor**, not a recommended typing-accuracy target.

Per sprint, the protocol records gross accepted-forward WPM, first-pass accuracy, Burst effective WPM, PL8 disfluency, and correction diagnostics.

`BurstEffectiveWpm = (CorrectFirstPassAttempts / 5) / SprintMinutes`

Difficulty adjustment uses the existing PL10 model; PL27 does not introduce an independent difficulty model.

## Burst estimator

At least **4 of 6** sprints must be valid.

For each valid sprint:

`Y_i = ln(BurstEffectiveWpm_i) + A_d,i`

The estimator sorts valid adjusted logs descending, takes the top three, then uses the median of those three adjusted logs. The best single sprint is descriptive only and never becomes the ability estimate by itself.

Uncertainty is:

- `sigma_individual = median(top-three individual sigmas)`
- `sigma_spread = max(1.4826 × MAD(top-three Y), 0.03)`
- selection penalty = `0.04`
- effective sample n = `2`
- `sigma_burst = clamp(sqrt(sigma_individual² / 2 + sigma_spread² + 0.04²), 0.08, 0.25)`

A completed eligible session creates **exactly one** PL13 `burst` observation. Fewer than four valid sprints creates zero Burst ability observations.

## Model ownership

- **PL11:** diagnostic evidence from valid active typing, including eligible warm-up evidence
- **PL13:** owns the one Burst ability observation
- **PL14:** PL27 does not directly mutate frontier or readiness; PL14 may derive Burst Reserve from PL13 Burst Ability plus PL14 frontier
- **PL16:** zero direct acquisition dose
- **PL33:** Burst Sprints is not a targeted Coach personalization treatment option

## Result semantics

Results distinguish, when available:

- Best observed sprint
- Session burst estimate
- Current PL13 Burst Ability
- PL14 Burst Reserve

No sprint WPM, best-sprint result, ability update, or accuracy result is shown between sprints.

## Treatment identity and history

The canonical v2 protocol has a new material PL32 treatment-family identity (`burst-six-canonical-v2`) and experiment/protocol version 2. Historical v1 sessions remain historical under their stored v1 family/fingerprint identity. They are not migrated, reinterpreted, pooled with v2 response history, or launchable as new sessions.

## Content

The existing `WS-BURST-EN-1` continuous diagnostic form family is retained. GC1 changes timing/protocol identity, not healthy text content. The v2 runtime binds new sessions to protocol version 2 in content-plan metadata.
