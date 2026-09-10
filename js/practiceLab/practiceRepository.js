import { createPracticeRepository as createPracticeRepositoryV30 } from "./practiceRepositoryV30.js";
import { createPracticeCustomTextRepositoryFacade } from "./practiceCustomTextRepository.js";
export function createPracticeRepository(options = {}) { const core = createPracticeRepositoryV30(options); if (!options.dataStore) return core; const custom = createPracticeCustomTextRepositoryFacade({ dataStore: options.dataStore, now: options.now ?? Date.now }); return Object.freeze({ ...core, ...custom }); }
