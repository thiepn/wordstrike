import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
const controllerFacade = await readFile(
  new URL("../js/practiceLab/practiceLabController.js", import.meta.url),
  "utf8",
);
const registryFacade = await readFile(
  new URL("../js/practiceLab/practiceExperimentRegistry.js", import.meta.url),
  "utf8",
);
const controllerRuntime = await readFile(
  new URL("../js/practiceLab/practiceLabControllerRuntimeV31.js", import.meta.url),
  "utf8",
);
const registryRuntime = await readFile(
  new URL("../js/practiceLab/practiceExperimentRegistryRuntime.js", import.meta.url),
  "utf8",
);

assert.match(main, /from "\.\/practiceLab\/practiceFeatureGate\.js"/);
assert.match(main, /from "\.\/practiceLab\/practiceExperimentRegistry\.js"/);
assert.match(main, /from "\.\/practiceLab\/practiceLabController\.js"/);
assert.doesNotMatch(main, /practice(?:LabController|ExperimentRegistry)Runtime(?:V\d+)?\.js/);
assert.doesNotMatch(main, /practice(?:WeakKeys|CombinationRepair)/);

assert.match(controllerFacade, /import\("\.\/practiceLabControllerRuntimeV31\.js"\)/);
assert.match(controllerFacade, /import\("\.\/practiceExperimentRegistryRuntime\.js"\)/);
assert.match(controllerFacade, /import\("\.\/practiceCombinationRepairExperiment\.js"\)/);
assert.match(controllerFacade, /import\("\.\/practiceWeakKeysExperiment\.js"\)/);
assert.match(controllerFacade, /import\("\.\/practiceCustomTextExperiment\.js"\)/);
assert.doesNotMatch(controllerFacade, /from "\.\/practiceLab(?:ViewModel|Renderer|Routes)(?:V\d+)?\.js"/);
assert.doesNotMatch(controllerFacade, /from "\.\/practice(?:SessionEngine|Repository|IndexedDbStore|ManifestStore)\.js"/);

assert.match(registryFacade, /import\("\.\/practiceExperimentRegistryRuntime\.js"\)/);
assert.doesNotMatch(registryFacade, /from "\.\/practiceSessionContract\.js"/);
assert.doesNotMatch(registryFacade, /from "\.\/practiceExperimentCatalog\.js"/);

assert.match(controllerRuntime, /from "\.\/practiceLabControllerRuntimeV30\.js"/);
assert.match(controllerRuntime, /from "\.\/practiceLabRendererV31\.js"/);
assert.match(controllerRuntime, /from "\.\/practiceLabRoutes\.js"/);
assert.doesNotMatch(controllerRuntime, /from "\.\/practice(?:SessionEngine|Repository|IndexedDbStore|ManifestStore)\.js"/);
assert.match(controllerRuntime, /import\("\.\/practiceCustomTextSessionHost\.js"\)/);
assert.match(registryRuntime, /from "\.\/practiceSessionContract\.js"/);
assert.match(registryRuntime, /from "\.\/practiceExperimentCatalog\.js"/);

const browserStaticPracticeImports = [
  ...controllerFacade.matchAll(/^import\s+[\s\S]*?from\s+["']([^"']+)["'];?/gm),
  ...registryFacade.matchAll(/^import\s+[\s\S]*?from\s+["']([^"']+)["'];?/gm),
].map((match) => match[1]);
assert.deepEqual(browserStaticPracticeImports, ["./practiceExperimentRegistry.js"]);

console.log("Practice Lab heavy runtime is excluded from the normal browser static import graph; the current PL31 runtime and experiment modules load only inside Practice and on their relevant routes.");
