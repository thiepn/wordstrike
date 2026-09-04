import { validatePracticeIndexManifest } from "./practiceIndexValidation.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createPracticeIndexRegistry(initialManifests = []) {
  const byCorpus = new Map();
  const byLanguageVersion = new Map();

  const register = (manifest) => {
    const validation = validatePracticeIndexManifest(manifest);
    if (!validation.valid) {
      const error = new TypeError("Cannot register invalid Practice index manifest");
      error.code = "INDEX_VERSION_MISMATCH";
      error.details = validation.errors;
      throw error;
    }
    const corpusKey = `${manifest.corpusId}|${manifest.corpusVersion}`;
    const languageKey = `${manifest.language}|${manifest.corpusVersion}`;
    if (byCorpus.has(corpusKey) || byLanguageVersion.has(languageKey)) {
      const error = new TypeError(`Practice index manifest is already registered for ${corpusKey}`);
      error.code = "DUPLICATE_INDEX_REGISTRATION";
      throw error;
    }
    const frozen = freezeDeep(clone(manifest));
    byCorpus.set(corpusKey, frozen);
    byLanguageVersion.set(languageKey, frozen);
    return frozen;
  };

  for (const manifest of initialManifests) register(manifest);

  return Object.freeze({
    register,
    get({ corpusId, corpusVersion } = {}) { return byCorpus.get(`${corpusId}|${corpusVersion}`) ?? null; },
    getByLanguage({ language, corpusVersion } = {}) { return byLanguageVersion.get(`${language}|${corpusVersion}`) ?? null; },
    list() { return Object.freeze([...byCorpus.values()]); },
  });
}
