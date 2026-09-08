import { createPracticeTransferRegistry } from "./practiceTransferRegistry.js";
import { createPracticeRealTextColdTransferRuntime } from "./practiceRealTextColdTransfer.js";

async function loadJson(fetchImpl, path) {
  const response = await fetchImpl(path);
  if (!response?.ok) throw Object.assign(new Error(`Cold Transfer asset unavailable: ${path}`), { code: "PRACTICE_EVALUATION_ARTIFACT_NOT_READY" });
  return response.json();
}

export function createDefaultPracticeRealTextColdTransferRuntime({ fetchImpl = globalThis.fetch, language = "en", corpusVersion = 1, baseUrl = "data/practice", repositoryProvider = null, now = () => new Date() } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Cold Transfer runtime requires fetchImpl");
  let transferCorpusPromise = null;
  const registry = createPracticeTransferRegistry({
    loadPool: async (poolId) => {
      if (poolId !== "WS-TRANSFER-EN-1") return null;
      return loadJson(fetchImpl, `${baseUrl}/evaluation/${language}-v${corpusVersion}/transfer/${poolId}.manifest.json`);
    },
  });
  const loadProtectedContentItems = async ({ partition, contentIds }) => {
    if (partition !== "transfer") throw Object.assign(new Error("Cold Transfer loader refuses non-transfer partition"), { code: "PRACTICE_CORPUS_PARTITION_MISMATCH" });
    transferCorpusPromise ??= loadJson(fetchImpl, `${baseUrl}/transfer/${language}-v${corpusVersion}.json`);
    const artifact = await transferCorpusPromise;
    if (artifact.partition !== "transfer") throw Object.assign(new Error("Cold Transfer corpus partition mismatch"), { code: "PRACTICE_CORPUS_PARTITION_MISMATCH" });
    const wanted = new Set(contentIds);
    return artifact.items.filter((item) => wanted.has(item.contentId));
  };
  return createPracticeRealTextColdTransferRuntime({ transferRegistry: registry, loadProtectedContentItems, repositoryProvider, now });
}
