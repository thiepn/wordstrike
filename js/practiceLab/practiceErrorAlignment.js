import { segmentPracticeGraphemes } from "./practiceTextSegmentation.js";
import {
  PRACTICE_ERROR_POLICY_V1,
  validatePracticeErrorPolicy,
} from "./practiceErrorPolicy.js";

const OPERATION_ORDER = Object.freeze({
  match: 0,
  transposition: 1,
  substitution: 2,
  omission: 3,
  insertion: 4,
});

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function toGraphemes(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  return [...segmentPracticeGraphemes(String(value ?? ""))];
}

function candidate(type, cost, fromI, fromJ, details = {}) {
  return { type, cost, fromI, fromJ, ...details };
}

function semanticTypes(candidates) {
  return new Set(candidates.filter((entry) => entry.type !== "match").map((entry) => entry.type));
}

function chooseCandidate(candidates) {
  return [...candidates].sort((a, b) => {
    const order = (OPERATION_ORDER[a.type] ?? 99) - (OPERATION_ORDER[b.type] ?? 99);
    if (order) return order;
    if (a.fromI !== b.fromI) return b.fromI - a.fromI;
    return b.fromJ - a.fromJ;
  })[0];
}

function classifyEdits(operations, { ambiguous, bounded, policy }) {
  if (bounded) return { classification: "unknown", confidence: "unresolved" };
  const edits = operations.filter((entry) => entry.type !== "match");
  if (!edits.length) return { classification: "unknown", confidence: "low" };
  const types = new Set(edits.map((entry) => entry.type));
  if (edits.length === 1) {
    return {
      classification: edits[0].type,
      confidence: ambiguous ? "medium" : "high",
    };
  }
  if (ambiguous && types.size > 1) return { classification: "compound", confidence: "low" };
  if (edits.length > policy.maximumEditDistanceForSimpleClass) return { classification: "compound", confidence: "low" };
  return { classification: "compound", confidence: ambiguous ? "low" : "medium" };
}

function detectDoubling(operations, observed) {
  const insertions = operations.filter((entry) => entry.type === "insertion");
  if (insertions.length !== 1 || operations.filter((entry) => entry.type !== "match").length !== 1) return false;
  const insertion = insertions[0];
  const index = insertion.observedIndex;
  const value = observed[index];
  return value != null && (observed[index - 1] === value || observed[index + 1] === value);
}

export function alignPracticeErrorSequences({
  expected = "",
  observed = "",
  policy = PRACTICE_ERROR_POLICY_V1,
} = {}) {
  validatePracticeErrorPolicy(policy);
  const expectedGraphemes = toGraphemes(expected);
  const observedGraphemes = toGraphemes(observed);
  const limit = policy.maximumAlignmentGraphemes;
  if (expectedGraphemes.length > limit || observedGraphemes.length > limit) {
    return freezeDeep({
      distance: null,
      operations: [],
      classification: "unknown",
      confidence: "unresolved",
      ambiguous: true,
      bounded: true,
      expectedLength: expectedGraphemes.length,
      observedLength: observedGraphemes.length,
      isDoubling: false,
    });
  }

  const rows = expectedGraphemes.length + 1;
  const cols = observedGraphemes.length + 1;
  const costs = Array.from({ length: rows }, () => Array(cols).fill(0));
  const choices = Array.from({ length: rows }, () => Array(cols).fill(null));
  const ambiguity = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (let i = 1; i < rows; i += 1) {
    costs[i][0] = i;
    choices[i][0] = candidate("omission", i, i - 1, 0, {
      expectedIndex: i - 1,
      expected: expectedGraphemes[i - 1],
    });
  }
  for (let j = 1; j < cols; j += 1) {
    costs[0][j] = j;
    choices[0][j] = candidate("insertion", j, 0, j - 1, {
      observedIndex: j - 1,
      observed: observedGraphemes[j - 1],
    });
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const equal = expectedGraphemes[i - 1] === observedGraphemes[j - 1];
      const options = [
        candidate(equal ? "match" : "substitution", costs[i - 1][j - 1] + (equal ? 0 : 1), i - 1, j - 1, {
          expectedIndex: i - 1,
          observedIndex: j - 1,
          expected: expectedGraphemes[i - 1],
          observed: observedGraphemes[j - 1],
        }),
        candidate("omission", costs[i - 1][j] + 1, i - 1, j, {
          expectedIndex: i - 1,
          expected: expectedGraphemes[i - 1],
        }),
        candidate("insertion", costs[i][j - 1] + 1, i, j - 1, {
          observedIndex: j - 1,
          observed: observedGraphemes[j - 1],
        }),
      ];
      if (
        i > 1
        && j > 1
        && expectedGraphemes[i - 1] === observedGraphemes[j - 2]
        && expectedGraphemes[i - 2] === observedGraphemes[j - 1]
      ) {
        options.push(candidate("transposition", costs[i - 2][j - 2] + 1, i - 2, j - 2, {
          expectedIndex: i - 2,
          observedIndex: j - 2,
          expected: expectedGraphemes.slice(i - 2, i),
          observed: observedGraphemes.slice(j - 2, j),
        }));
      }
      const minCost = Math.min(...options.map((entry) => entry.cost));
      const minimum = options.filter((entry) => entry.cost === minCost);
      costs[i][j] = minCost;
      choices[i][j] = chooseCandidate(minimum);
      const semantic = semanticTypes(minimum);
      ambiguity[i][j] = semantic.size > 1 || minimum.some((entry) => ambiguity[entry.fromI]?.[entry.fromJ]);
    }
  }

  const operations = [];
  let i = expectedGraphemes.length;
  let j = observedGraphemes.length;
  let ambiguous = ambiguity[i][j];
  while (i > 0 || j > 0) {
    const selected = choices[i][j];
    if (!selected) break;
    operations.push({
      type: selected.type,
      expectedIndex: selected.expectedIndex ?? null,
      observedIndex: selected.observedIndex ?? null,
      expected: selected.expected ?? null,
      observed: selected.observed ?? null,
    });
    ambiguous ||= ambiguity[i][j];
    i = selected.fromI;
    j = selected.fromJ;
  }
  operations.reverse();
  const classification = classifyEdits(operations, { ambiguous, bounded: false, policy });
  return freezeDeep({
    distance: costs[expectedGraphemes.length][observedGraphemes.length],
    operations,
    classification: classification.classification,
    confidence: classification.confidence,
    ambiguous,
    bounded: false,
    expectedLength: expectedGraphemes.length,
    observedLength: observedGraphemes.length,
    isDoubling: detectDoubling(operations, observedGraphemes),
  });
}
