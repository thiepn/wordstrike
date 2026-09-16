# Flow Phase 11 — Progression & Integration

## Goal

Make Flow a first-class WordStrike mode internally without publicly launching it before content expansion and release hardening.

## Canonical WordStrike integration

Each completed integrated Flow run is recorded exactly once through the existing `modeStorageV2` result pipeline.

That updates the existing shared WordStrike data for:

- completed Flow sessions
- active playtime
- characters and words typed
- Flow best WPM
- Flow best accuracy
- Flow highest score
- lifetime totals
- recent sessions

Phase 11 does not introduce a replacement app-wide storage schema.

## Flow-specific progression

`wordstrike_flow_progress_v1` stores only Flow-specific information not represented by the generic mode schema:

- completed Flow runs
- total Flow characters / words / active time
- best Cadence
- best Average Flow
- best Average Momentum
- category / difficulty / session-length completion counts
- modifier-run count
- adaptive-run and focus-passage counts
- last setup
- latest confident adaptive weakness profile
- up to 12 rich Flow history rows
- idempotency IDs
- milestone timestamps

## Milestones

Milestones are descriptive mastery markers. They do not gate features or create an XP grind.

1. First Flow — first completed Flow run
2. In Rhythm — 5 completed runs
3. Sustained — complete Standard
4. Longform — complete Long
5. Precision — 98%+ raw accuracy
6. Locked In — Cadence 92+
7. High Flow — average Flow 90+
8. Targeted Practice — complete an adaptive run
9. Shaped Session — complete a modifier run

Categories, difficulties, modifiers, and adaptive training remain freely selectable.

## Setup defaults

With the explicit Phase 11 integration gate enabled, missing run parameters inherit the last completed/started Flow setup before `flowPhase1.js` resolves the run plan.

Explicit URL parameters always win.

Modifier defaults are restored only when the modifier system is enabled.

Adaptive weaknesses are restored only when adaptive mode explicitly requests resume.

## Adaptive continuity

The latest confidence-qualified Phase 10 weakness profile is retained across navigation and visits.

`CONTINUE TARGETED TRAINING` serializes that exact measured profile into a new Phase 10 adaptive run.

Phase 11 still does not implement a long-term decayed/aggregated coaching model; it persists the latest strong profile only.

## First-run onboarding

The first integrated Flow setup shows one compact explanation of Flow, Momentum, Cadence, and correction behavior.

After `GOT IT`, the onboarding state is persisted and does not automatically reopen.

## Flow profile surface

The setup displays `Your Flow` with:

- completed runs
- best score
- best WPM
- best Cadence
- cumulative Flow practice time
- milestone progress
- three most recent rich Flow runs
- targeted-training resume when a weakness profile exists

Results add a compact progression update and newly earned milestones without displacing Phase 8's primary result hierarchy.

## Developer gate

```text
?dev=1&mode=flow&flowRun=1&flowUi=1&flowUx=1&flowIntegration=1
```

Phase 9 modifiers and Phase 10 adaptive training remain independently composable through their existing flags.

## Public boundary

Flow remains visible but disabled / Coming Soon in public Mode Select.

Phase 11 does not:

- make Flow publicly launchable
- add Flow leaderboards
- add cloud sync
- add XP/unlock gating
- expand the content library
- change Flow scoring, Cadence, modifiers, or adaptive selection
- change Campaign, Typing Test, Endless, or Practice Lab

## Exit criteria

- canonical mode storage records a Flow completion exactly once
- Flow-specific progression records exactly once
- generic Flow bests and recent sessions update
- milestones are deterministic and non-gating
- first-run onboarding persists its dismissal
- last setup restores before plan resolution, while explicit config wins
- latest adaptive weakness profile can resume across navigation
- setup/results progression UI works on desktop and 390 px mobile
- Phase 1–10 routes remain unchanged without `flowIntegration=1`
- public Flow remains gated
- repository-wide regression suite remains green
