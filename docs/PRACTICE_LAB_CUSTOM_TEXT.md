# Practice Lab — PL31 Custom Text

PL31 implements the existing `custom-text` experiment as a local, explicit-consent transcription workspace. User-supplied text is not corpus content, a benchmark, a transfer set, an ability measurement, or a targeted acquisition intervention.

## Privacy and persistence

Pasting, typing, importing, or practicing text does **not** save it. Only an explicit Save action may write source text to the local `customTexts` IndexedDB store. No Custom Text source, title, selection, filename, hash, or lexical identity is sent to Supabase, rankings, or new analytics. Saved Custom Text is user-authored content and is never auto-pruned. Normal Practice retention does not touch `customTexts`; a user-content wipe must be explicit.

The DB schema moves from 8 to 9. `customTexts` keeps `customTextId` as its key and indexes `profileId`, `updatedAt`, and `createdAt`. A record contains profile ownership, revision, title, normalized source, SHA-256 source hash, explicit `dataLocale`, byte/grapheme counts, projection version, and timestamps. The record version remains 1. Legacy placeholder records are converted lazily on access and are never deleted merely because conversion fails.

Limits are 50 saved texts per profile, 100,000 source graphemes per text, 256 KiB UTF-8 per text, and 5 MiB total source bytes per profile. Save fails with `CUSTOM_TEXT_STORAGE_LIMIT`; another document is never deleted to make room.

## Source and projection

Source normalization is deliberately narrow: CRLF/CR become LF and Unicode is normalized to NFC. Case, punctuation, spelling, words, and layout otherwise remain source data. C0 controls other than LF and TAB are rejected. The source is always rendered as text, never HTML or Markdown.

Typing projection version 1 collapses one or more Unicode whitespace characters to one ASCII space and trims leading/trailing whitespace. This projection changes only what the typing session expects. Saved and exported source text remains the normalized source form.

`sourceHash` is SHA-256 of normalized UTF-8 source. `typingHash` is SHA-256 over the projection version plus projected typing text. These are local integrity/session bindings, not corpus hashes.

## Modes and capacity

Custom Text supports `full-text`, `selection`, and `timed`. Full and selection sessions are content-complete. Timed durations are exactly 1, 3, 5, 10, 15, and 30 minutes; default is 5 minutes. A duration is available only when `required graphemes = minutes × 400 WPM × 5 × 1.10`. This is an engineering capacity ceiling, not a claim about human maximum speed. Short content is never looped or randomly excerpted to satisfy a duration.

Start freezes an in-memory projected snapshot. Editing or deleting a saved source in another tab cannot mutate the active session. Custom Text sessions are non-resumable in v1.

## Evidence boundaries

The ordinary Practice input engine, PL8 timing classification, PL9 error/recovery model, PL10 normalization where supported, and PL11 first-pass opportunity doctrine remain canonical. Custom Text sets `evidenceRole = custom`, `targetEntities = []`, and direct acquisition dose to zero.

Persistent Custom Text evidence is allowed only for keys, bigrams, and trigrams under the `custom` role. Persistent word evidence is always zero, including for words that already exist in corpus-derived word stats. Custom evidence never counts as a direct target, never updates entity-level direct-target `lastPractisedAt`, never creates corpus-family breadth, and cannot satisfy PL15 non-custom robustness gates.

There is no PL13 ability observation, PL14 performance measurement, PL16 direct dose, PL17 retention review, PL18 transfer/benchmark evidence, or PL19 assessment binding.

## Session privacy and results

The runtime plan may contain projected text because the input engine needs it. Serialized configuration/content metadata contains only bounded identity: experiment/projection version, source kind, optional saved document ID/revision, source/typing hashes, mode, duration, and plan hash. Source text, title, and selection text are not serialized to session summaries.

Results may report ordinary aggregate Practice metrics such as duration, typed characters, WPM/raw WPM, accepted-insertion accuracy, first-pass accuracy, aggregate first-pass word accuracy when available, disfluency, corrections, and error-episode count. Results do not persist or display custom word identities and make no ability, mastery, retention, transfer, benchmark, causal, PB, leaderboard, or ranking claim.

## Import/export and security

Import accepts only a user-selected `.txt` file decoded with strict UTF-8 (`TextDecoder(..., { fatal: true })`). Import loads the editor and does not save. Export creates a local UTF-8 text Blob and revokes its object URL. There is no URL fetching, remote export, PDF/DOCX/OCR parsing, rich text, HTML rendering, Markdown rendering, embeddings, topic classification, or remote AI.

Long sessions render a bounded ~2,000-grapheme viewport around the canonical global expected index; the full document is not expanded into one DOM node per character and the input path does not rescan the entire source on every keystroke.

## PL32 / PL33 / PL39 contracts

PL32 should exclude Custom Text from causal treatment-family estimates by default because `custom-text` is content-variable. PL33 may at most use bounded metadata that the user chooses Custom Text; it must not inspect source semantics. PL39 must re-audit network isolation, deletion, session redaction, service-worker exclusion, large-text performance, storage failure, and multi-tab conflict behavior.

## Non-goals

PL31 does not implement cloud/cross-device sync, collaboration, public sharing, rich text, Markdown/HTML rendering, URL/PDF/DOCX/OCR import, exact indentation/code-layout practice, resumability, Custom Text word mastery, Custom Text ability scoring, automatic Daily Coach scheduling, causal treatment-effect estimation, or public Practice release.
