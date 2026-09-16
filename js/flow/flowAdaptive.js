const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

export const FLOW_ADAPTIVE_PROFILE_VERSION = 1;

export const FLOW_WEAKNESS_DEFINITIONS = Object.freeze({
  capitals: Object.freeze({
    key: "capitals",
    label: "Capital letters",
    cadenceKey: "capitals",
    tags: Object.freeze(["quotes", "dialogue"]),
  }),
  apostrophes: Object.freeze({
    key: "apostrophes",
    label: "Apostrophes",
    cadenceKey: "apostrophes",
    tags: Object.freeze(["apostrophes"]),
  }),
  quotes: Object.freeze({
    key: "quotes",
    label: "Quotation marks",
    cadenceKey: "quotes",
    tags: Object.freeze(["quotes", "dialogue"]),
  }),
  commas: Object.freeze({
    key: "commas",
    label: "Comma transitions",
    cadenceKey: "after-comma",
    tags: Object.freeze(["commas"]),
  }),
  "sentence-transitions": Object.freeze({
    key: "sentence-transitions",
    label: "Sentence transitions",
    cadenceKey: "after-sentence",
    tags: Object.freeze(["periods", "questions", "long-sentences"]),
  }),
  "semicolon-colon": Object.freeze({
    key: "semicolon-colon",
    label: "Semicolons & colons",
    cadenceKey: "after-semicolon-colon",
    tags: Object.freeze(["semicolons", "colons", "mixed-punctuation"]),
  }),
  numbers: Object.freeze({
    key: "numbers",
    label: "Numbers",
    cadenceKey: "numbers",
    tags: Object.freeze(["numbers", "dates", "times", "currency", "percentages"]),
  }),
  "long-words": Object.freeze({
    key: "long-words",
    label: "Long words",
    cadenceKey: null,
    tags: Object.freeze(["long-sentences", "academic", "technical"]),
  }),
  "typo-pair": Object.freeze({
    key: "typo-pair",
    label: "Recurring typo pair",
    cadenceKey: null,
    tags: Object.freeze([]),
  }),
});

const CADENCE_TO_WEAKNESS = Object.freeze(Object.fromEntries(
  Object.values(FLOW_WEAKNESS_DEFINITIONS)
    .filter(({ cadenceKey }) => cadenceKey)
    .map(({ cadenceKey, key }) => [cadenceKey, key]),
));

function wordBounds(text, index) {
  let start = index;
  let end = index;
  while (start > 0 && /[A-Za-z'’-]/.test(text[start - 1])) start -= 1;
  while (end + 1 < text.length && /[A-Za-z'’-]/.test(text[end + 1])) end += 1;
  return { start, end, length: end - start + 1 };
}

function classifyExpectedCharacter(character) {
  if (/[A-Z]/.test(character)) return "capitals";
  if (["'", "’"].includes(character)) return "apostrophes";
  if (["\"", "“", "”"].includes(character)) return "quotes";
  if (character === ",") return "commas";
  if (/[;:]/.test(character)) return "semicolon-colon";
  if (/[0-9]/.test(character)) return "numbers";
  return null;
}

function addEvidence(map, key, score, evidence, extra = {}) {
  const definition = FLOW_WEAKNESS_DEFINITIONS[key];
  if (!definition) return;
  const existing = map.get(key) || {
    key,
    label: definition.label,
    score: 0,
    evidence: [],
    tags: [...definition.tags],
  };
  existing.score = Math.max(existing.score, clamp(round(score), 0, 100));
  if (evidence) existing.evidence.push(evidence);
  Object.assign(existing, extra);
  map.set(key, existing);
}

function addCadenceEvidence(map, cadence) {
  const baseline = Number(cadence?.baselineIntervalMs);
  if (!Number.isFinite(baseline) || baseline <= 0) return;
  for (const feature of cadence?.featureLatencies || []) {
    const weaknessKey = CADENCE_TO_WEAKNESS[feature.key];
    if (!weaknessKey || Number(feature.sampleCount) < 2) continue;
    const delta = Number(feature.deltaMs);
    const threshold = Math.max(55, baseline * 0.22);
    if (!Number.isFinite(delta) || delta <= threshold) continue;
    const severity = 42
      + Math.min(34, ((delta - threshold) / Math.max(80, baseline)) * 32)
      + Math.min(18, Number(feature.sampleCount) * 2.5);
    addEvidence(
      map,
      weaknessKey,
      severity,
      `${Math.round(delta)} ms slower across ${feature.sampleCount} samples`,
      { cadenceDeltaMs: round(delta, 1), sampleCount: Number(feature.sampleCount) },
    );
  }
}

function addErrorEvidence(map, snapshot) {
  const text = String(snapshot?.passage || "");
  const classCounts = new Map();
  const pairCounts = new Map();
  let longWordErrors = 0;
  for (const error of snapshot?.errorTimings || []) {
    const expected = String(error.expected || "");
    const actual = String(error.actual || "");
    const weakness = classifyExpectedCharacter(expected);
    if (weakness) classCounts.set(weakness, (classCounts.get(weakness) || 0) + 1);
    const index = Number(error.index);
    if (Number.isInteger(index) && index >= 0 && index < text.length && wordBounds(text, index).length >= 8) {
      longWordErrors += 1;
    }
    if (expected && actual && expected !== actual) {
      const key = `${expected}\u0000${actual}`;
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }
  }

  for (const [key, count] of classCounts) {
    if (count < 2) continue;
    addEvidence(map, key, 48 + Math.min(42, count * 9), `${count} raw errors in this feature`, { errorCount: count });
  }
  if (longWordErrors >= 2) {
    addEvidence(map, "long-words", 50 + Math.min(40, longWordErrors * 8), `${longWordErrors} errors inside 8+ character words`, { errorCount: longWordErrors });
  }

  const topPair = [...pairCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  if (topPair && topPair[1] >= 2) {
    const [expected, actual] = topPair[0].split("\u0000");
    addEvidence(
      map,
      "typo-pair",
      52 + Math.min(42, topPair[1] * 10),
      `${topPair[1]}× expected “${expected}” but typed “${actual}”`,
      { expected, actual, errorCount: topPair[1], label: `${expected} → ${actual}` },
    );
  }
}

export function buildFlowWeaknessProfile(snapshot) {
  if (!snapshot) return Object.freeze({ version: FLOW_ADAPTIVE_PROFILE_VERSION, weaknesses: Object.freeze([]), sampleCount: 0 });
  const map = new Map();
  addCadenceEvidence(map, snapshot.cadence);
  addErrorEvidence(map, snapshot);
  const weaknesses = [...map.values()]
    .filter(({ score }) => score >= 50)
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
    .slice(0, 5)
    .map((weakness) => Object.freeze({ ...weakness, evidence: Object.freeze([...new Set(weakness.evidence)]) }));
  return Object.freeze({
    version: FLOW_ADAPTIVE_PROFILE_VERSION,
    sampleCount: Number(snapshot.cadence?.sampleCount) || 0,
    sourcePassageId: snapshot.passageId || null,
    weaknesses: Object.freeze(weaknesses),
  });
}

export function serializeFlowWeaknessProfile(profile) {
  const weaknesses = normalizeFlowWeaknessProfile(profile).weaknesses;
  if (!weaknesses.length) return "";
  return JSON.stringify([
    FLOW_ADAPTIVE_PROFILE_VERSION,
    weaknesses.map(({ key, score, expected = null, actual = null }) => [key, score, expected, actual]),
  ]);
}

export function parseFlowWeaknessProfile(value) {
  if (!value || typeof value !== "string") return normalizeFlowWeaknessProfile(null);
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed[0] !== FLOW_ADAPTIVE_PROFILE_VERSION || !Array.isArray(parsed[1])) {
      return normalizeFlowWeaknessProfile(null);
    }
    return normalizeFlowWeaknessProfile({
      version: parsed[0],
      weaknesses: parsed[1].map(([key, score, expected, actual]) => ({ key, score, expected, actual })),
    });
  } catch {
    return normalizeFlowWeaknessProfile(null);
  }
}

export function normalizeFlowWeaknessProfile(profile) {
  const raw = Array.isArray(profile?.weaknesses) ? profile.weaknesses : [];
  const seen = new Set();
  const weaknesses = [];
  for (const item of raw) {
    const key = String(item?.key || "");
    const definition = FLOW_WEAKNESS_DEFINITIONS[key];
    if (!definition || seen.has(key)) continue;
    const score = clamp(Math.round(Number(item?.score) || 0), 0, 100);
    if (score < 50) continue;
    seen.add(key);
    weaknesses.push(Object.freeze({
      key,
      label: key === "typo-pair" && item?.expected && item?.actual
        ? `${String(item.expected)} → ${String(item.actual)}`
        : definition.label,
      score,
      tags: definition.tags,
      expected: key === "typo-pair" ? String(item?.expected || "") : null,
      actual: key === "typo-pair" ? String(item?.actual || "") : null,
    }));
  }
  weaknesses.sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));
  return Object.freeze({ version: FLOW_ADAPTIVE_PROFILE_VERSION, weaknesses: Object.freeze(weaknesses.slice(0, 5)) });
}

function countMatches(text, pattern) {
  return (String(text).match(pattern) || []).length;
}

export function getAdaptivePassageFit(passage, weakness) {
  if (!passage || !weakness) return 0;
  const text = String(passage.text || "");
  const tags = new Set(passage.tags || []);
  let fit = 0;
  for (const tag of weakness.tags || []) if (tags.has(tag)) fit += 120;
  switch (weakness.key) {
    case "capitals": fit += Math.min(10, countMatches(text.slice(1), /[A-Z]/g)) * 18; break;
    case "apostrophes": fit += Math.min(10, countMatches(text, /['’]/g)) * 45; break;
    case "quotes": fit += Math.min(10, countMatches(text, /["“”]/g)) * 32; break;
    case "commas": fit += Math.min(12, countMatches(text, /,/g)) * 24; break;
    case "sentence-transitions": fit += Math.min(10, countMatches(text, /[.!?](?=\s|$)/g)) * 20; break;
    case "semicolon-colon": fit += Math.min(10, countMatches(text, /[;:]/g)) * 40; break;
    case "numbers": fit += Math.min(16, countMatches(text, /[0-9]/g)) * 18; break;
    case "long-words": {
      const longWords = text.split(/\s+/).filter((word) => word.replace(/[^A-Za-z]/g, "").length >= 8).length;
      fit += Math.min(12, longWords) * 28;
      break;
    }
    case "typo-pair": {
      const expected = weakness.expected || "";
      const actual = weakness.actual || "";
      if (expected) fit += Math.min(18, text.split(expected).length - 1) * 22;
      if (actual) fit += Math.min(12, text.split(actual).length - 1) * 8;
      break;
    }
    default: break;
  }
  return fit;
}

export function createAdaptiveFocusSchedule(totalPassages, profile) {
  const normalized = normalizeFlowWeaknessProfile(profile);
  const total = Math.max(0, Math.floor(Number(totalPassages) || 0));
  if (!total || !normalized.weaknesses.length) return Object.freeze([]);
  const focusCount = Math.max(1, Math.round(total * 0.2));
  const schedule = [];
  for (let index = 0; index < focusCount; index += 1) {
    const slot = Math.min(total - 1, Math.max(1, Math.floor(((index + 1) / (focusCount + 1)) * total)));
    schedule.push(Object.freeze({
      slot,
      weakness: normalized.weaknesses[index % normalized.weaknesses.length],
    }));
  }
  return Object.freeze(schedule);
}
