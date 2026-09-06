import { validatePracticeTransferPool } from "./practiceEvaluationValidation.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createPracticeTransferRegistry({ pools = [], loadPool = null } = {}) {
  const byId = new Map();
  const loaders = new Map();
  const register = (pool) => {
    const validation = validatePracticeTransferPool(pool);
    if (!validation.valid) {
      const error = new TypeError("Practice transfer pool failed validation");
      error.code = "PRACTICE_TRANSFER_POOL_INVALID";
      error.details = validation.errors;
      throw error;
    }
    if (byId.has(pool.poolId)) throw new TypeError(`Duplicate Practice transfer pool: ${pool.poolId}`);
    const value = freezeDeep(clone(pool));
    byId.set(value.poolId, value);
    return value;
  };
  pools.forEach(register);
  return Object.freeze({
    registerPool: register,
    registerLazyPool(poolId, loader) {
      if (byId.has(poolId) || loaders.has(poolId) || typeof loader !== "function") throw new TypeError("Invalid lazy transfer pool registration");
      loaders.set(poolId, loader);
    },
    getPool(poolId) { return byId.get(poolId) ?? null; },
    async loadPool(poolId) {
      if (byId.has(poolId)) return byId.get(poolId);
      const loader = loaders.get(poolId) ?? loadPool;
      if (typeof loader !== "function") return null;
      const pool = await loader(poolId);
      if (!pool) return null;
      loaders.delete(poolId);
      return register(pool);
    },
    listLoadedPools() { return [...byId.values()].sort((a, b) => a.poolId.localeCompare(b.poolId)); },
    listReadyPools() { return [...byId.values()].filter((pool) => pool.status === "ready").sort((a, b) => a.poolId.localeCompare(b.poolId)); },
  });
}
