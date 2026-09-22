export const PRACTICE_DATA_ACTIONS = Object.freeze({
  RESET: "reset",
  WIPE: "wipe",
});

const COPY = Object.freeze({
  reset: Object.freeze({
    confirm: "Reset Practice Lab evidence, history, plans, reviews, and derived progress for the active Practice profile? Saved Custom Text is kept. This cannot be undone.",
    success: "Practice evidence and progress were reset. Saved Custom Text was kept.",
    deleteUserContent: false,
  }),
  wipe: Object.freeze({
    confirm: "Delete ALL Practice Lab data stored in this browser, including saved Custom Text? This cannot be undone.",
    success: "All Practice Lab data stored in this browser was deleted.",
    deleteUserContent: true,
  }),
});

export function getPracticeDataActionCopy(action) {
  return COPY[action] ?? null;
}

async function createDefaultPracticeDataRuntime() {
  const [
    { createPracticeIndexedDbStore },
    { createPracticeManifestStore },
    { createPracticeRepository },
  ] = await Promise.all([
    import("./practiceIndexedDbStore.js"),
    import("./practiceManifestStore.js"),
    import("./practiceRepository.js"),
  ]);
  const dataStore = createPracticeIndexedDbStore();
  const manifestStore = createPracticeManifestStore();
  const repository = createPracticeRepository({ dataStore, manifestStore });
  return Object.freeze({
    repository,
    close() {
      try { dataStore.close?.(); } catch {}
    },
  });
}

export async function runPracticeDataAction(action, {
  confirm = globalThis.confirm?.bind?.(globalThis),
  runtimeFactory = createDefaultPracticeDataRuntime,
} = {}) {
  const copy = getPracticeDataActionCopy(action);
  if (!copy) throw new RangeError(`Unknown Practice data action: ${action}`);
  if (typeof confirm === "function" && confirm(copy.confirm) !== true) {
    return Object.freeze({ status: "cancelled", action, message: "No Practice data was changed." });
  }

  let runtime = null;
  try {
    runtime = await runtimeFactory();
    const repository = runtime?.repository;
    if (!repository?.initializePracticeStorage || !repository?.resetPracticeData) {
      throw Object.assign(new TypeError("Practice data runtime is incomplete"), { code: "PRACTICE_DATA_RUNTIME_INCOMPLETE" });
    }
    await repository.initializePracticeStorage();
    await repository.resetPracticeData(copy.deleteUserContent ? { deleteUserContent: true } : {});
    return Object.freeze({ status: "success", action, message: copy.success });
  } catch (error) {
    return Object.freeze({
      status: "error",
      action,
      code: error?.code ?? "PRACTICE_DATA_ACTION_FAILED",
      message: "Practice data could not be changed. Your existing data was not reported as reset.",
    });
  } finally {
    try { runtime?.close?.(); } catch {}
  }
}
