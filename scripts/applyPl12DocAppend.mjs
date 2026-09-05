import { readFile, writeFile } from "node:fs/promises";

const updates = [
  {
    path: "docs/PRACTICE_LAB_SKILL_EVIDENCE_MODEL.md",
    marker: "## PL12 downstream diagnostic contract",
    appendix: `

## PL12 downstream diagnostic contract

PL11 remains the canonical persistent observation layer after PL12. PL12 does not change the PL11 evidence schema, evidence policy, evidence delta, confidence calculation, checkpoint tracker, skill-stat record version, session-summary record version, foundation-analysis version, or IndexedDB topology.

PL12 consumes the canonical v3 skill evidence only as a **derived diagnostic view**. It reuses PL11 dimension-specific confidence for normalized residuals, disfluency, first-pass accuracy, primary error evidence, and word launch evidence. It does not rewrite opportunity counts, timing lanes, error attribution, role lanes, or confidence inputs.

Authoritative PL12 derived semantics are:

- candidate `weaknessScore`: maximum confidence-weighted limiter-dimension severity;
- candidate `impactScore`: context-relative prevalence-quality-adjusted modeled burden percentile;
- candidate `priorityScore`: impact × primary-dimension confidence × hierarchy penalty.

These fields live only in the PL12 limiter candidate/snapshot. Existing top-level skill-stat fields named \`weaknessScore\` and \`priority\` are legacy/non-authoritative placeholders and are not PL12 writeback targets.

PL12 also preserves PL11 Custom Text privacy. Because persistent custom-word evidence remains disabled by default, the limiter layer does not reconstruct private word entities from Custom Text.

See \`PRACTICE_LAB_LIMITER_IMPACT_MODEL.md\` for the authoritative PL12 formulas, prevalence policy, burden model, hierarchy, snapshot bounds, caching, and phase boundaries.
`,
  },
  {
    path: "docs/PRACTICE_LAB_CONTEXT_TYPABILITY_MODEL.md",
    marker: "## 28. PL12 downstream diagnostic use",
    appendix: `

## 28. PL12 downstream diagnostic use

PL12 consumes PL10 normalization without changing PL10 semantics or versions. In particular, PL10 remains authoritative for:

- context-bound expected latency;
- fluent/disfluent transition eligibility;
- positive/negative normalized residual meaning;
- anti-leakage from exact target identity;
- typability-reference fitting and protected-partition contamination rules.

PL12's \`slow\`, \`hesitant\`, \`launch-limited\`, and \`unstable\` diagnostics use PL11-persisted evidence that originated from PL10 expected-vs-observed residuals. PL12 never treats raw latency alone as authoritative slow evidence and never changes PL10 residual zero from its meaning: performance consistent with the current context expectation.

PL12 prevalence is a **separate** statistical contract from PL10 typability/frequency features. No approved population-frequency artifact currently exists in the repository. Therefore PL12 may use PL7 **training-partition occurrence rates** only as an explicitly labelled \`practice-proxy\`; transfer, benchmark, diagnostic, and research-holdout partitions never fit that proxy. The proxy does not retroactively become a PL10 frequency reference and does not change PL10's current null rarity features.

PL12 does not bump the PL10 normalization-analysis, context-model, context-policy, text-feature, typability-model, typability-reference, keyboard-geometry, or static-artifact versions. Historical PL10 documentation above remains the definition of the PL10 phase itself; current wrapper record versions are documented in \`PRACTICE_LAB_DATA_ARCHITECTURE.md\`.

See \`PRACTICE_LAB_LIMITER_IMPACT_MODEL.md\` for the downstream diagnostic formulas and impact/hierarchy semantics.
`,
  },
];

let changed = 0;
for (const update of updates) {
  const source = await readFile(update.path, "utf8");
  if (source.includes(update.marker)) continue;
  await writeFile(update.path, source.replace(/\s*$/u, "") + update.appendix + "\n", "utf8");
  changed += 1;
}
console.log(`PL12 documentation addenda applied to ${changed} file(s).`);
