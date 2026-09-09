import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertPracticeCommonWordCheckTypability } from "./lib/practiceCommonWordsMatching.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "data", "commonGameplayWords.json");
const OUT = path.join(ROOT, "data", "practice", "common-words", "en-v1");
const TYPOABILITY_REFERENCE = path.join(ROOT, "data", "practice", "models", "en-v1", "typability-v1.reference.json");
const FREQUENCY_REFERENCE = path.join(ROOT, "data", "practice", "provenance", "frequency", "en-v1.frequency.json");
const BANDS = ["core", "frequent", "common", "broad"];
const RANGE = { core: [1, 100], frequent: [101, 300], common: [301, 700], broad: [701, 1200] };
const bandFor = (rank) => BANDS.find((band) => rank >= RANGE[band][0] && rank <= RANGE[band][1]);
const sha = (value) => `sha256-${crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`;
const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const graphemes = (word) => Array.from(word.normalize("NFC")).length;

function validateLexical(word) {
  return typeof word === "string" && word === word.normalize("NFC") && word === word.toLowerCase() && /^[a-z]+$/.test(word) && graphemes(word) >= 1 && graphemes(word) <= 15;
}
function quotasForLengths(words, count) {
  const buckets = new Map();
  for (const word of words) buckets.set(graphemes(word.lexicalKey), (buckets.get(graphemes(word.lexicalKey)) ?? 0) + 1);
  const raw = [...buckets].map(([length, size]) => ({ length, size, exact: count * size / words.length }));
  const quota = new Map(raw.map(({ length, exact }) => [length, Math.floor(exact)]));
  let left = count - [...quota.values()].reduce((a, b) => a + b, 0);
  for (const item of raw.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || a.length - b.length)) {
    if (!left) break;
    if ((quota.get(item.length) ?? 0) < item.size) { quota.set(item.length, quota.get(item.length) + 1); left -= 1; }
  }
  return quota;
}
function buildForms(referenceWords) {
  const byBand = Object.fromEntries(BANDS.map((band) => [band, referenceWords.filter((word) => word.band === band)]));
  const usage = new Map();
  const forms = [];
  for (let formIndex = 0; formIndex < 8; formIndex += 1) {
    const selectedByBand = {};
    for (const band of BANDS) {
      const candidates = byBand[band];
      const quotas = quotasForLengths(candidates, 50);
      const selected = [];
      for (const [length, quota] of [...quotas].sort((a, b) => a[0] - b[0])) {
        const bucket = candidates.filter((word) => graphemes(word.lexicalKey) === length)
          .sort((a, b) => (usage.get(a.lexicalKey) ?? 0) - (usage.get(b.lexicalKey) ?? 0)
            || hash(`form:${formIndex}|${a.lexicalKey}`).localeCompare(hash(`form:${formIndex}|${b.lexicalKey}`)));
        selected.push(...bucket.slice(0, quota));
      }
      if (selected.length !== 50) throw new Error(`Could not select 50 ${band} words for form ${formIndex + 1}`);
      for (const word of selected) usage.set(word.lexicalKey, (usage.get(word.lexicalKey) ?? 0) + 1);
      selectedByBand[band] = selected.sort((a, b) => hash(`order:${formIndex}|${a.lexicalKey}`).localeCompare(hash(`order:${formIndex}|${b.lexicalKey}`)));
    }
    const ordered = [];
    for (let block = 0; block < 10; block += 1) {
      const rotation = parseInt(hash(`block:${formIndex}:${block}`).slice(0, 8), 16) % 4;
      const bandOrder = BANDS.map((_, index) => BANDS[(index + rotation) % 4]);
      for (let round = 0; round < 5; round += 1) for (const band of bandOrder) ordered.push(selectedByBand[band][block * 5 + round]);
    }
    if (new Set(ordered.map((word) => word.lexicalKey)).size !== 200) throw new Error("Check form contains duplicate word");
    const words = ordered.map(({ lexicalKey, rank, band }) => ({ lexicalKey, rank, band }));
    const text = words.map((word) => word.lexicalKey).join(" ");
    const lengths = words.map((word) => graphemes(word.lexicalKey)).sort((a, b) => a - b);
    const metrics = {
      totalGraphemes: lengths.reduce((a, b) => a + b, 0),
      meanWordLength: lengths.reduce((a, b) => a + b, 0) / lengths.length,
      p90WordLength: lengths[Math.ceil(lengths.length * 0.9) - 1],
      bandMeanWordLength: Object.fromEntries(BANDS.map((band) => {
        const values = words.filter((word) => word.band === band).map((word) => graphemes(word.lexicalKey));
        return [band, values.reduce((a, b) => a + b, 0) / values.length];
      })),
    };
    const formCore = { formId: `WS-COMMON-CHECK-EN-1-F${String(formIndex + 1).padStart(2, "0")}`, formVersion: 1, status: "ready", words, separator: " ", metrics };
    forms.push({ ...formCore, formHash: sha({ words, separator: " ", formVersion: 1, referenceVersion: 1 }), textHash: sha(text) });
  }
  return forms;
}
function validateOverlap(forms) {
  let maximum = 0;
  for (let a = 0; a < forms.length; a += 1) for (let b = a + 1; b < forms.length; b += 1) {
    const left = new Set(forms[a].words.map((word) => word.lexicalKey));
    const overlap = forms[b].words.filter((word) => left.has(word.lexicalKey)).length / 200;
    maximum = Math.max(maximum, overlap);
  }
  return maximum;
}

const source = JSON.parse(await fs.readFile(SOURCE, "utf8"));
const ranked = (source.words ?? [])
  .filter((entry) => validateLexical(entry.word) && Number.isFinite(entry.frequencyRank))
  .sort((a, b) => a.frequencyRank - b.frequencyRank || a.word.localeCompare(b.word));
const unique = [];
const seen = new Set();
for (const entry of ranked) {
  if (seen.has(entry.word)) continue;
  seen.add(entry.word); unique.push(entry);
  if (unique.length === 1200) break;
}
if (unique.length !== 1200) throw new Error("Common-word statistical source does not yield exactly 1200 display-safe lexical keys");
const words = unique.map((entry, index) => ({ lexicalKey: entry.word, rank: index + 1, sourceRank: entry.frequencyRank, band: bandFor(index + 1) }));
if (new Set(words.map((word) => word.lexicalKey)).size !== 1200) throw new Error("Duplicate common-word lexical key");

const sourceBinding = {
  sourcePath: "data/commonGameplayWords.json",
  sourceSchemaVersion: source.schemaVersion,
  sourceName: source.source?.name,
  sourceUrl: source.source?.url,
  sourceLicense: source.source?.license,
  sourceSha256: source.source?.sourceSha256,
  reviewStatement: source.source?.description,
};
const referenceCore = {
  referenceId: "WS-COMMON-EN-1", referenceVersion: 1, language: "en", sourceRegistryVersion: 1,
  rankingSource: { sourceType: "statistical-reference", usageApproval: "statistical-only", ...sourceBinding },
  bandRanges: { core: [1, 100], frequent: [101, 300], common: [301, 700], broad: [701, 1200] },
  words,
};
const reference = { ...referenceCore, checksum: sha(referenceCore) };
const displayWords = words.map(({ lexicalKey, rank, band }) => ({ lexicalKey, rank, band }));
const practiceCore = {
  bankId: "WS-COMMON-PRACTICE-EN-1", bankVersion: 1, referenceId: reference.referenceId, referenceVersion: reference.referenceVersion,
  language: "en", status: "ready", partition: "training",
  displayProvenance: { sourceType: "permissive-import", usageApproval: "practice-display-approved", partition: "training", ...sourceBinding },
  bindings: { sourceChecksum: reference.checksum, lexicalIndexVersion: 1, typabilityReferenceVersion: 1, builderVersion: 1 },
  words: displayWords,
};
const practice = { ...practiceCore, checksum: sha(practiceCore) };
const forms = buildForms(words);
const maximumPairwiseLexicalOverlapRatio = validateOverlap(forms);
if (maximumPairwiseLexicalOverlapRatio > 0.30) throw new Error(`Common-word check overlap ${maximumPairwiseLexicalOverlapRatio.toFixed(3)} exceeds 0.30`);
const [typabilityReference, frequencyReference] = await Promise.all([
  fs.readFile(TYPOABILITY_REFERENCE, "utf8").then(JSON.parse),
  fs.readFile(FREQUENCY_REFERENCE, "utf8").then(JSON.parse),
]);
const typabilityMatching = assertPracticeCommonWordCheckTypability({ forms, typabilityReference, frequencyReference });
const checkCore = {
  bankId: "WS-COMMON-CHECK-EN-1", formSetId: "WS-COMMON-CHECK-EN-1", bankVersion: 1, schemaVersion: 1, generatorVersion: 1,
  referenceId: reference.referenceId, referenceVersion: reference.referenceVersion, language: "en", status: "ready", partition: "diagnostic",
  displayProvenance: { sourceType: "permissive-import", usageApproval: "practice-display-approved", partition: "diagnostic", ...sourceBinding },
  bindings: { sourceChecksum: reference.checksum, lexicalIndexVersion: 1, typabilityReferenceVersion: 1, builderVersion: 1 },
  diagnosticPool: displayWords,
  matching: { engineeringMatched: true, empiricalEquating: false, maximumPairwiseLexicalOverlapRatio, note: "Length distributions are matched deterministically by band; canonical PL10 difficulty is rechecked at runtime/foundation analysis." },
  forms,
};
const check = { ...checkCore, checksum: sha(checkCore) };
await fs.mkdir(OUT, { recursive: true });
for (const [name, value] of [
  ["WS-COMMON-EN-1.reference.json", reference],
  ["WS-COMMON-PRACTICE-EN-1.manifest.json", practice],
  ["WS-COMMON-CHECK-EN-1.manifest.json", check],
]) await fs.writeFile(path.join(OUT, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  referenceWords: words.length,
  forms: forms.length,
  maximumPairwiseLexicalOverlapRatio,
  minimumTypabilityCoverage: typabilityMatching.minimumAvailableModelWeight,
  difficultySpread: typabilityMatching.difficultySpread,
  maximumFeatureRmsDistance: typabilityMatching.maximumWeightedRmsDistance,
  relativePercentileSpread: typabilityMatching.relativePercentileSpread,
  referenceChecksum: reference.checksum,
  practiceChecksum: practice.checksum,
  checkChecksum: check.checksum,
}, null, 2));
