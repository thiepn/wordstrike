# Flow Phase 12 — Content Expansion Contract

Phase 12 turns the compact Phase 2 seed catalog into a production-sized natural-language library without changing Flow gameplay, scoring, Cadence, modifiers, adaptive rules, progression, or public launch state.

## Production library

- The original Phase 2 seed set remains stable at **32 passages** and is exported as `FLOW_SEED_PASSAGES`.
- Phase 12 adds **80 original passages** in `flowContentExpansion.js`.
- The canonical `FLOW_PASSAGE_CATALOG` contains **112 validated passages**.
- All new text is original training copy. The Quotes category uses original aphoristic text rather than copied quotations or attributed excerpts.

## Coverage matrix

Flow has seven content categories and four linguistic difficulty tiers.

Every category × difficulty cell must contain exactly **4 passages**:

- Everyday — 16
- Stories — 16
- Dialogue — 16
- Professional — 16
- Academic — 16
- Quotes — 16
- Numbers & Symbols — 16

Every difficulty therefore contains **28 passages**:

- Smooth — 28
- Natural — 28
- Advanced — 28
- Expert — 28

This balanced matrix prevents one category or difficulty from becoming the obvious repeated source during seeded planning.

## Content design

Passages remain short enough to function as one Flow segment while long enough for useful cadence sampling. Difficulty is expressed through language and character demands rather than arbitrary speed targets.

- **Smooth:** common vocabulary, short structures, light punctuation.
- **Natural:** ordinary prose, commas, apostrophes, questions, conversational phrasing.
- **Advanced:** semicolons, colons, parentheses, dashes, dialogue, and longer sentence structures.
- **Expert:** mixed punctuation, numbers, symbols, percentages, currency, dates/times, technical notation, and denser exact-character demands.

## Adaptive-training breadth

The expanded library must provide broad candidate pools for Phase 10 weakness targeting:

- capitals / dialogue exposure
- apostrophes
- quotation marks
- comma transitions
- sentence transitions
- semicolon / colon transitions
- numbers
- long words / dense structures
- recurring typo pairs

Phase 12 does not change weakness detection or the ~80/20 adaptive planning rule. It only gives the existing planner enough varied material to make those rules useful over repeated sessions.

## Repetition contract

A Long Flow run contains 24 passages. With the Phase 12 library:

- balanced Long runs must contain **zero repeated passage IDs** across all categories and difficulties for certification seeds;
- adaptive Expert Long runs must also remain repetition-free for every Phase 10 weakness class;
- deterministic seeded planning remains unchanged.

This contract concerns passage identity. Similar punctuation features may intentionally recur because they are part of the selected difficulty or weakness focus.

## Compatibility

Phase 12 deliberately does **not** change:

- `flowContent.js` validation rules;
- `flowRunPlan.js` selection/scoring rules;
- Phase 3 gameplay scoring;
- Phase 4 Cadence;
- Phase 9 modifiers;
- Phase 10 adaptive detection/planning;
- Phase 11 persistence/progression;
- Flow's public gated state.

Older Phase 2 certification now tests the stable seed library where an exact seed count matters, while continuing to validate the full production catalog for schema correctness.

## Certification

`tests/flow-phase12-content-expansion.test.js` must prove:

1. 32 seed + 80 expansion = 112 production passages.
2. Exactly four passages exist in every category/difficulty cell.
3. IDs and text are unique.
4. Segment size remains suitable for Flow cadence analysis.
5. Every adaptive weakness class has a broad useful candidate pool.
6. Long runs are repetition-free across categories, difficulties, and certification seeds.
7. Adaptive Long runs remain repetition-free for every weakness class.

Phase 12 is complete only when its dedicated certification and the existing repository suite are green on the same head.
