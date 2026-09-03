import fs from "node:fs";
const file = "scripts/applyPL5FinalAudit.mjs";
let source = fs.readFileSync(file, "utf8");
source = source.replace('"# Practice Lab Architecture Audit",', '"# Practice Lab Current-System Architecture Audit",');
source = source.replace('"# Practice Lab Foundation Integration Audit",', '"# Practice Lab Phase 0 Foundation Integration Audit",');
fs.writeFileSync(file, source);
