export const LOCAL_RESULT_PERSISTENCE = Object.freeze({
  SAVED: "saved",
  PARTIAL: "partial",
  FAILED: "failed",
  EXCLUDED: "excluded",
});

export function annotateLocalResultPersistence(result, {
  status = LOCAL_RESULT_PERSISTENCE.SAVED,
  warning = null,
} = {}) {
  if (!result || typeof result !== "object") return result;
  const safeStatus = Object.values(LOCAL_RESULT_PERSISTENCE).includes(status)
    ? status
    : LOCAL_RESULT_PERSISTENCE.FAILED;
  return Object.freeze({
    ...result,
    localPersistence: Object.freeze({
      status: safeStatus,
      warning: typeof warning === "string" && warning ? warning : null,
    }),
  });
}

export function isLocalResultSaved(result) {
  const status = result?.localPersistence?.status;
  if (!status) return true;
  return status === LOCAL_RESULT_PERSISTENCE.SAVED || status === LOCAL_RESULT_PERSISTENCE.PARTIAL;
}
