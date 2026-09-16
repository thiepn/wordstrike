import { FLOW_CATEGORIES, FLOW_DIFFICULTIES } from "./flowConfig.js";

export const FLOW_CONTENT_CATEGORIES = Object.freeze(
  FLOW_CATEGORIES.filter((category) => category !== "mixed"),
);

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TYPOGRAPHIC_CHARACTERS = new Set(["€", "£", "–", "—", "“", "”", "‘", "’", "…"]);
const ALLOWED_ASCII_PUNCTUATION = new Set([...
  " .,!?;:'\"()[]{}-/%$+&=@#_*<>",
]);

function isSupportedCharacter(character) {
  if (/^[A-Za-z0-9]$/.test(character)) return true;
  return ALLOWED_ASCII_PUNCTUATION.has(character) || TYPOGRAPHIC_CHARACTERS.has(character);
}

function count(text, character) {
  return [...text].filter((value) => value === character).length;
}

function assertBalanced(text, left, right, label) {
  let depth = 0;
  for (const character of text) {
    if (character === left) depth += 1;
    if (character === right) depth -= 1;
    if (depth < 0) throw new TypeError(`Flow passage has malformed ${label}`);
  }
  if (depth !== 0) throw new TypeError(`Flow passage has malformed ${label}`);
}

export function analyzeFlowText(text) {
  const normalized = String(text ?? "").normalize("NFC");
  const words = normalized.match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g) || [];
  const punctuation = {
    commas: count(normalized, ","),
    apostrophes: count(normalized, "'") + count(normalized, "’"),
    quotes: count(normalized, '"') + count(normalized, "“") + count(normalized, "”"),
    semicolons: count(normalized, ";"),
    colons: count(normalized, ":"),
    parentheses: count(normalized, "(") + count(normalized, ")"),
    dashes: count(normalized, "-") + count(normalized, "–") + count(normalized, "—"),
    numbers: (normalized.match(/\d/g) || []).length,
    symbols: (normalized.match(/[%€£$+&=@#_*\/<>"]/g) || []).length,
  };
  return Object.freeze({
    characters: [...normalized].length,
    wordCount: words.length,
    sentenceCount: (normalized.match(/[.!?](?=\s|$)/g) || []).length,
    punctuation: Object.freeze(punctuation),
  });
}

export function validateFlowPassage(candidate) {
  if (!candidate || typeof candidate !== "object") throw new TypeError("Flow passage must be an object");
  if (!ID_PATTERN.test(candidate.id || "")) throw new TypeError("Flow passage id must be a lowercase slug");
  if (!FLOW_CONTENT_CATEGORIES.includes(candidate.category)) throw new TypeError(`Unsupported Flow category: ${candidate.category}`);
  if (!FLOW_DIFFICULTIES.includes(candidate.difficulty)) throw new TypeError(`Unsupported Flow difficulty: ${candidate.difficulty}`);
  if (typeof candidate.text !== "string") throw new TypeError("Flow passage text must be a string");

  const text = candidate.text.normalize("NFC");
  if (text !== candidate.text) throw new TypeError("Flow passage text must already be NFC-normalized");
  if (text.length < 20) throw new TypeError("Flow passage text is too short");
  if (text.length > 1200) throw new TypeError("Flow passage text is too long");
  if (text !== text.trim()) throw new TypeError("Flow passage text must not have leading or trailing whitespace");
  if (/\s{2,}/.test(text)) throw new TypeError("Flow passage text contains repeated whitespace");
  if (/[\u0000-\u001F\u007F-\u009F\u200B\u200C\u200D\u2060\uFEFF]/u.test(text)) {
    throw new TypeError("Flow passage text contains invisible or control characters");
  }
  for (const character of text) {
    if (!isSupportedCharacter(character)) throw new TypeError(`Flow passage contains unsupported character: ${character}`);
  }

  if (count(text, '"') % 2 !== 0) throw new TypeError("Flow passage has malformed straight quotation marks");
  if (count(text, "“") !== count(text, "”")) throw new TypeError("Flow passage has malformed curly quotation marks");
  if (count(text, "‘") !== count(text, "’") && count(text, "‘") > 0) {
    throw new TypeError("Flow passage has malformed curly single quotation marks");
  }
  assertBalanced(text, "(", ")", "parentheses");
  assertBalanced(text, "[", "]", "brackets");
  assertBalanced(text, "{", "}", "braces");

  const tags = Array.isArray(candidate.tags) ? candidate.tags : [];
  if (new Set(tags).size !== tags.length) throw new TypeError("Flow passage tags must be unique");
  for (const tag of tags) {
    if (!TAG_PATTERN.test(tag)) throw new TypeError(`Invalid Flow passage tag: ${tag}`);
  }

  return Object.freeze({
    id: candidate.id,
    text,
    category: candidate.category,
    difficulty: candidate.difficulty,
    tags: Object.freeze([...tags]),
    ...analyzeFlowText(text),
  });
}

export function createFlowCatalog(candidates) {
  if (!Array.isArray(candidates)) throw new TypeError("Flow catalog must be an array");
  const passages = candidates.map(validateFlowPassage);
  const ids = new Set();
  for (const passage of passages) {
    if (ids.has(passage.id)) throw new TypeError(`Duplicate Flow passage id: ${passage.id}`);
    ids.add(passage.id);
  }
  return Object.freeze(passages);
}

export function queryFlowPassages(catalog, {
  category = "mixed",
  difficulty = null,
  tags = [],
  excludeIds = [],
} = {}) {
  if (!Array.isArray(catalog)) return [];
  const excluded = new Set(excludeIds);
  return catalog.filter((passage) => (
    (category === "mixed" || passage.category === category) &&
    (!difficulty || passage.difficulty === difficulty) &&
    tags.every((tag) => passage.tags.includes(tag)) &&
    !excluded.has(passage.id)
  ));
}

function hashSeed(seed) {
  const input = String(seed ?? "flow");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectFlowPassage(catalog, options = {}, seed = "flow") {
  const matches = queryFlowPassages(catalog, options);
  if (!matches.length) return null;
  return matches[hashSeed(seed) % matches.length];
}

export function getFlowCatalogCoverage(catalog) {
  const coverage = {};
  for (const category of FLOW_CONTENT_CATEGORIES) {
    coverage[category] = {};
    for (const difficulty of FLOW_DIFFICULTIES) {
      coverage[category][difficulty] = queryFlowPassages(catalog, { category, difficulty }).length;
    }
    Object.freeze(coverage[category]);
  }
  return Object.freeze(coverage);
}
