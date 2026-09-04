import fs from "node:fs";

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing behavior-fix anchor in ${path}`);
  fs.writeFileSync(path, source.replace(before, after));
}

replaceExact(
  "js/practiceLab/practiceErrorTracker.js",
  "      episode.repairTargetCursor = Math.max(episode.repairTargetCursor, event.cursorAfter);\n      if (incorrect) {",
  "      if (episode.firstCorrectionActiveMs == null || incorrect) {\n        episode.repairTargetCursor = Math.max(episode.repairTargetCursor, event.cursorAfter);\n      }\n      if (incorrect) {",
);

console.log("PL9 behavior fixes applied");
