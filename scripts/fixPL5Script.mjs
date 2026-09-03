import fs from "node:fs";
const file = "scripts/applyPL5.mjs";
let source = fs.readFileSync(file, "utf8");
source = source.replace('const legacyStat = { ...stat, recordVersion: 1, statId: `legacy-${stat.statId}` };', 'const legacyStat = { ...stat, recordVersion: 1, statId: "legacy-" + stat.statId };');
source = source.replace(/(?<!\\)\$\{/g, "\\${");
fs.writeFileSync(file, source);
