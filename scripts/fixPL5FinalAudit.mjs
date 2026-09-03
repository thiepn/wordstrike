import fs from "node:fs";
const file = "scripts/applyPL5FinalAudit.mjs";
let source = fs.readFileSync(file, "utf8");
source = source.replace('"# Practice Lab Architecture Audit",', '"# Practice Lab Current-System Architecture Audit",');
source = source.replace('"# Practice Lab Foundation Integration Audit",', '"# Practice Lab Phase 0 Foundation Integration Audit",');
source = source.replace(
  'The manifest remains schema version 1. Its database pointer is reconciled to IndexedDB structural version 2. Canonical **activeContextId** lives only on the profile in IndexedDB; PL5 does not duplicate it into the manifest.',
  'The namespaced manifest remains **wordstrike.practice.manifest.v1** at schema version 1. Its database pointer is reconciled to IndexedDB structural version 2. Canonical **activeContextId** lives only on the profile in IndexedDB; PL5 does not duplicate it into the manifest.'
);
fs.writeFileSync(file, source);
