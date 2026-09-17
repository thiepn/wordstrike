# Flow Phase 2 — Passage Content System

## Goal

Replace one-off hardcoded Flow text with a scalable, validated passage catalog and deterministic selection layer, without expanding into scoring, progression, or the later large content library.

## Required behavior

- Every catalog passage has a stable lowercase-slug id.
- Every passage belongs to one content category and one difficulty tier.
- Passage metadata includes derived character count, word count, sentence count, punctuation profile, and explicit tags.
- The catalog validates on import and rejects malformed content before gameplay can use it.
- Validation rejects duplicate ids, repeated whitespace, invisible/control characters, malformed quotation marks, unbalanced brackets/parentheses/braces, invalid tags, and unsupported characters.
- The seed catalog covers every category × difficulty cell.
- Passage queries can filter by category, difficulty, tags, and excluded ids.
- Passage selection is deterministic for a stable seed.
- Developer Flow routes can select exact passage ids or filtered catalog passages.
- The original Phase 1 validation passage remains available when no Phase 2 catalog query is supplied.
- Public Flow remains gated as Coming Soon.

## Categories

- Everyday
- Stories
- Dialogue
- Professional
- Academic
- Quotes
- Numbers & Symbols

`mixed` is a selector value, not a stored content category.

## Difficulty tiers

- Smooth
- Natural
- Advanced
- Expert

Difficulty is content metadata in Phase 2. Automated linguistic difficulty scoring is intentionally deferred.

## Seed-library scope

Phase 2 ships 32 curated passages. The seven categories and four difficulty tiers create 28 required coverage cells; four cells contain a second passage so query/exclusion/seeded-selection behavior can be tested against real alternatives.

The later content-expansion phase owns the 625+ passage target.

## Developer query contract

Examples:

- `?dev=1&mode=flow&flowCatalog=1&flowCategory=dialogue&flowDifficulty=natural&flowSeed=42`
- `?dev=1&mode=flow&flowPassage=numbers-symbols-expert-01`

Invalid exact ids render an explicit `NO PASSAGE` state instead of silently substituting unrelated content.

## Deliberate non-goals

Phase 2 does not implement:

- public Flow launch
- Flow meter
- momentum
- Flow scoring
- cadence/rhythm analysis
- chapters
- modifiers
- adaptive training
- progression
- leaderboards
- large-scale content expansion

## Exit condition

The Flow engine can consume validated catalog passages selected by category/difficulty or exact id, deterministic selection is testable, all 28 category × difficulty cells are populated, malformed content fails closed, and Phase 0/1 public behavior remains unchanged.
