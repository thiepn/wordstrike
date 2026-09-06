export * from "./practiceDefaultsLegacy.js";

import { createDefaultSessionSummary as createDefaultSessionSummaryV17 } from "./practiceDefaultsLegacy.js";

export function createDefaultSessionSummary(options = {}) {
  const summary = createDefaultSessionSummaryV17(options);
  return {
    ...summary,
    evaluationSummary: summary.evaluationSummary ?? null,
  };
}
