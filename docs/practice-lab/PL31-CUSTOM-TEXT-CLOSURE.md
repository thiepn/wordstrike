# PL31 — Custom Text closure

PL31 turns the existing `custom-text` Practice Lab card into a local-only user-authored transcription workspace.

## Implemented contract

- Practice database schema version 9 with canonical `customTexts` indexes (`profileId`, `updatedAt`, `createdAt`) and explicit removal of the DB8 placeholder indexes.
- Explicit Save is the only action that persists editor source. Paste, typing, import, selection, and session start do not auto-save.
- Canonical saved records carry profile ownership, optimistic revision, title, normalized source, SHA-256 source hash, explicit `dataLocale`, source byte/grapheme counts, projection version, and lifecycle timestamps.
- Per-document and per-profile limits are enforced without automatic deletion or pruning.
- Source normalization is restricted to newline normalization and NFC; the typing projection collapses whitespace only for the expected typing stream.
- UTF-8 `.txt` import is strict and local. Export creates a local text Blob only.
- Full-text, selection, and timed modes are implemented. Timed options use the PL31 400-WPM engineering-capacity rule and never repeat or randomly excerpt insufficient content.
- Session start freezes the source identity/projection. Saved-source starts re-read and verify the current document revision/hash and locale.
- Custom Text sessions are non-resumable, so the generic Practice engine does not persist content checkpoints.
- The canonical Practice input, timing, error/recovery, normalization, and first-pass infrastructure remains in use.
- Evidence role is `custom`, with empty direct targets and no acquisition dose. Existing PL11 policy keeps persistent word evidence disabled for Custom Text.
- No ability, performance-state, benchmark, transfer, assessment, retention, mastery, PB, leaderboard, or ranking role is assigned.
- Serialized session configuration contains bounded identity/hash/mode metadata only, never source text or title.
- Active rendering is bounded around the global expected index rather than rendering a full large document as character nodes.
- Ordinary Practice retention ignores saved Custom Text. Ordinary Practice reset preserves raw user-authored records; explicit user-content deletion remains available.
- Dirty editor state is protected on internal navigation and browser unload; multi-tab updates use optimistic revision conflicts.
- Saved `lastPractisedAt` advances only when the completed session still matches the saved document revision and source hash.

## Certification

`npm run test:pl31-custom-text` covers the PL31 storage envelope, normalization/projection, privacy metadata, non-resumability/measurement isolation, capacity gating, selection, optimistic conflicts, strict UTF-8 import, bounded rendering, and retention/reset boundaries.

The repository-wide `npm test`, prior Practice phase workflows, and browser regressions remain the final merge gate for PR #77.
