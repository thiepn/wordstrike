import fs from "node:fs";
const path = "js/main.js";
const before = fs.readFileSync(path, "utf8");
const target = "getStatisticsSnapshot(storage, appState.save, getUtcDateKey())";
if (!before.includes(target)) throw new Error("Expected stale Daily date statistics call not found");
const after = before.replace(target, "getStatisticsSnapshot(storage, appState.save)");
if (after.includes("getUtcDateKey()")) throw new Error("Stale getUtcDateKey call remains in main.js");
fs.writeFileSync(path, after);
