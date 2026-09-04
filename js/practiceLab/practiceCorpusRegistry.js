import { PRACTICE_CORPUS_PARTITIONS } from "./practiceCorpusConstants.js";
import { validatePracticeCorpusManifest } from "./practiceCorpusValidation.js";

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function registryError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

export function createPracticeCorpusRegistry({ manifests = [] } = {}) {
  const byId = new Map();
  const byLanguageVersion = new Map();

  const registerCorpusManifest = (manifest) => {
    const validation = validatePracticeCorpusManifest(manifest);
    if (!validation.valid) {
      const error = registryError("PRACTICE_CORPUS_INVALID_MANIFEST", "Practice corpus manifest failed validation");
      error.details = validation.errors;
      throw error;
    }
    const languageVersion = `${manifest.language}|${manifest.corpusVersion}`;
    if (byId.has(manifest.corpusId)) throw registryError("PRACTICE_CORPUS_DUPLICATE_REGISTRATION", `Corpus ID is already registered: ${manifest.corpusId}`);
    if (byLanguageVersion.has(languageVersion)) throw registryError("PRACTICE_CORPUS_DUPLICATE_REGISTRATION", `Language/version is already registered: ${languageVersion}`);
    const frozen = deepFreeze(clone(manifest));
    byId.set(frozen.corpusId, frozen);
    byLanguageVersion.set(languageVersion, frozen.corpusId);
    return frozen;
  };

  manifests.forEach(registerCorpusManifest);

  return Object.freeze({
    registerCorpusManifest,
    getCorpusManifest(corpusId) { return byId.get(corpusId) ?? null; },
    getCorpusManifestByLanguage(language, corpusVersion) {
      const id = byLanguageVersion.get(`${language}|${corpusVersion}`);
      return id ? byId.get(id) : null;
    },
    listCorpusManifests() { return [...byId.values()].sort((a, b) => a.language.localeCompare(b.language) || a.corpusVersion - b.corpusVersion || a.corpusId.localeCompare(b.corpusId)); },
    getPartitionMetadata(corpusId, partition) {
      if (!PRACTICE_CORPUS_PARTITIONS.includes(partition)) return null;
      const manifest = byId.get(corpusId);
      if (!manifest) return null;
      return Object.freeze({
        corpusId,
        partition,
        itemCount: manifest.contentCounts.byPartition[partition],
        familyCount: manifest.familyCounts.byPartition[partition],
      });
    },
  });
}
