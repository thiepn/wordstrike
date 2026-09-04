import fs from "node:fs";

function replace(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing PL10 documentation anchor: ${path}: ${before.slice(0, 120)}`);
  fs.writeFileSync(path, source.replace(before, after));
}
function appendIfMissing(path, marker, text) {
  const source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;
  fs.writeFileSync(path, `${source.trimEnd()}\n\n${text.trim()}\n`);
}

replace(
  "docs/PRACTICE_LAB_DATA_ARCHITECTURE.md",
  "Status: PL5 context identity foundation",
  "Status: PL5 context identity foundation + PL8 latency + PL9 error/recovery + PL10 context/typability normalization",
);
replace(
  "docs/PRACTICE_LAB_DATA_ARCHITECTURE.md",
  "| sessionSummary | 2 |",
  "| sessionSummary | 5 |",
);
appendIfMissing(
  "docs/PRACTICE_LAB_DATA_ARCHITECTURE.md",
  "## 15. PL10 durable normalization evidence",
  `## 15. PL10 durable normalization evidence\n\nPL10 keeps IndexedDB structural version **2** and advances only **sessionSummary** from v4 to v5. The new nullable **normalizationSummary** stores compact versioned context/typability evidence. Historical v4 summaries migrate with **normalizationSummary: null**; PL10 never reconstructs normalized residuals or text difficulty from older WPM/latency/error aggregates.\n\nDurable normalization evidence may contain the frozen context fingerprint, locale/layout/input method, transition-normalization coverage/residual aggregates, and compact text-difficulty/reference metadata. It does **not** persist raw text, per-transition residual traces, full feature vectors, entity residual maps, frequency tables, hardware nicknames, browser/device fingerprints, or leaderboard fields.\n\nThe exact model contract and protected-partition rules are documented in **PRACTICE_LAB_CONTEXT_TYPABILITY_MODEL.md**.`,
);

replace(
  "docs/PRACTICE_LAB_SESSION_ENGINE.md",
  "Status: headless Practice foundation + PL5 context identity + PL8 robust latency + PL9 error/recovery analysis",
  "Status: headless Practice foundation + PL5 context identity + PL8 robust latency + PL9 error/recovery + PL10 context/typability normalization",
);
replace(
  "docs/PRACTICE_LAB_SESSION_ENGINE.md",
  "| practiceFoundationAnalysis.js | Generic PL8 + PL9 analysis orchestration |",
  "| practiceFoundationAnalysis.js | Generic PL8 + PL9 + PL10 analysis orchestration |\n| practiceContextFeatures.js / practiceContextNormalizer.js | PL10 coarse transition context + residual normalization |\n| practiceTextDifficultyFeatures.js / practiceTypabilityModel.js | PL10 text features + relative typability model |\n| practiceNormalizationAnalysis.js | PL10 session normalization orchestration |",
);
replace(
  "docs/PRACTICE_LAB_SESSION_ENGINE.md",
  "Optional `analyzeResult()` receives generic frozen foundation analysis but does not own the canonical generic `fluencySummary` or `errorSummary`. Callbacks are never persisted.",
  "Optional `analyzeResult()` receives generic frozen foundation analysis but does not own the canonical generic `fluencySummary`, `errorSummary`, or `normalizationSummary`. Callbacks are never persisted.",
);
appendIfMissing(
  "docs/PRACTICE_LAB_SESSION_ENGINE.md",
  "## PL10 normalization extension",
  `## PL10 normalization extension\n\nAt `prepare()`, the engine resolves and freezes the exact PL5 context record for the immutable session `profileId + contextId`. At finalization, generic **foundationAnalysis v3** is built as `{ latency, errors, normalization }`. PL10 consumes the current content plan plus frozen context and uses PL8 fluent/disfluent classifications without altering PL8 or PL9 outputs.\n\n`sessionSummary` is now v5 and may contain compact **normalizationSummary**. WPM, raw WPM, accuracy, correction metrics, PL8 fluency and PL9 error/recovery formulas are unchanged. Full normalized transitions and text feature vectors remain transient. See **PRACTICE_LAB_CONTEXT_TYPABILITY_MODEL.md**.`,
);

appendIfMissing(
  "docs/PRACTICE_LAB_TARGET_INDEX_ARCHITECTURE.md",
  "## PL10 downstream normalization use",
  `## PL10 downstream normalization use\n\nPL10 reuses PL7's canonical grapheme/word segmentation and structural occurrence context rather than creating a competing tokenizer. PL10 may derive coarse context bands and static text-difficulty artifacts from PL6/PL7 outputs, but **only the PL6 training partition fits the typability reference**. Transfer, benchmark, diagnostic and research-holdout data do not fit PL10 medians/scales/weights/percentile reference. Research holdout is not normally scored.\n\nPL7 occurrence/coverage counts remain corpus-local structural counts and are **not** reinterpreted as general-language frequency. PL10 frequency features require a separately governed frequency reference; none exists in the current release. Static PL10 artifacts bind to the exact PL6 corpus checksum and PL7 `indexChecksum`.`,
);

appendIfMissing(
  "docs/PRACTICE_LAB_ERROR_RECOVERY_MODEL.md",
  "## PL10 downstream normalization boundary",
  `## PL10 downstream normalization boundary\n\nPL10 is downstream of PL9 and does not alter error-episode or recovery semantics. Generic foundation analysis advances from v2 to **v3** by adding a separate `normalization` member alongside unchanged `latency` and `errors`. PL10 context predictors never use exact target identity, weakness, mastery or priority. Exact observed identity may remain transient for later attribution.\n\n`sessionSummary` advances from v4 to **v5** by adding nullable `normalizationSummary`; historical PL9 summaries receive `normalizationSummary: null`. PL9 `errorSummary` remains canonical and unchanged.`,
);

console.log("PL10 documentation integration applied");
