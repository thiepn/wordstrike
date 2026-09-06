import { validatePracticeBenchmarkSuite } from "./practiceEvaluationValidation.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createPracticeBenchmarkRegistry({ suites = [], loadSuite = null } = {}) {
  const byId = new Map();
  const loaders = new Map();
  const register = (suite) => {
    const validation = validatePracticeBenchmarkSuite(suite);
    if (!validation.valid) {
      const error = new TypeError("Practice benchmark suite failed validation");
      error.code = "PRACTICE_BENCHMARK_SUITE_INVALID";
      error.details = validation.errors;
      throw error;
    }
    if (byId.has(suite.suiteId)) throw new TypeError(`Duplicate Practice benchmark suite: ${suite.suiteId}`);
    const value = freezeDeep(clone(suite));
    byId.set(value.suiteId, value);
    return value;
  };
  suites.forEach(register);
  return Object.freeze({
    registerSuite: register,
    registerLazySuite(suiteId, loader) {
      if (byId.has(suiteId) || loaders.has(suiteId) || typeof loader !== "function") throw new TypeError("Invalid lazy benchmark suite registration");
      loaders.set(suiteId, loader);
    },
    getSuite(suiteId) { return byId.get(suiteId) ?? null; },
    async loadSuite(suiteId) {
      if (byId.has(suiteId)) return byId.get(suiteId);
      const loader = loaders.get(suiteId) ?? loadSuite;
      if (typeof loader !== "function") return null;
      const suite = await loader(suiteId);
      if (!suite) return null;
      loaders.delete(suiteId);
      return register(suite);
    },
    listLoadedSuites() { return [...byId.values()].sort((a, b) => a.suiteId.localeCompare(b.suiteId)); },
    listReadySuites() { return [...byId.values()].filter((suite) => suite.status === "ready").sort((a, b) => a.suiteId.localeCompare(b.suiteId)); },
  });
}
