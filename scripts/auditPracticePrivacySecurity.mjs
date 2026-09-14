import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const practiceRoot = resolve(root, "js/practiceLab");

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) output.push(full);
  }
  return output.sort();
}

const BLOCKING_PATTERNS = Object.freeze([
  ["DYNAMIC_EVAL", /\beval\s*\(/gu],
  ["DYNAMIC_FUNCTION", /\bnew\s+Function\s*\(/gu],
  ["STRING_TIMER", /\bset(?:Timeout|Interval)\s*\(\s*["'`]/gu],
  ["XHR", /\bXMLHttpRequest\b/gu],
  ["SEND_BEACON", /\bsendBeacon\s*\(/gu],
  ["WEBSOCKET", /\bWebSocket\b/gu],
  ["EVENT_SOURCE", /\bEventSource\b/gu],
  ["SUPABASE", /\bsupabase\b/giu],
  ["LEADERBOARD_DEPENDENCY", /\bleaderboard\b/giu],
  ["CLIPBOARD_BACKGROUND_READ", /navigator\.clipboard\.readText\s*\(/gu],
  ["WEBHID", /navigator\.hid\b|\bHIDDevice\b/gu],
  ["WEBUSB", /navigator\.usb\b|\bUSBDevice\b/gu],
  ["DOCUMENT_WRITE", /document\.write\s*\(/gu],
  ["SRCDOC", /\.srcdoc\s*=/gu],
]);

const DOM_SINKS = Object.freeze([
  ["INNER_HTML", /\.innerHTML\s*=/gu],
  ["OUTER_HTML", /\.outerHTML\s*=/gu],
  ["INSERT_ADJACENT_HTML", /\.insertAdjacentHTML\s*\(/gu],
  ["DOM_PARSER", /\bDOMParser\b/gu],
]);

const STATIC_FETCH_FILES = Object.freeze(new Set([
  "js/practiceLab/practiceCommonWordReference.js",
  "js/practiceLab/practiceCorpusRegistry.js",
  "js/practiceLab/practiceEvaluationContentLoader.js",
  "js/practiceLab/practiceIndexLoader.js",
  "js/practiceLab/practiceRealTextPool.js",
  "js/practiceLab/practiceTypabilityRuntime.js",
]));

const TRUSTED_STATIC_DOM_SINKS = Object.freeze(new Set([
  // Intentionally empty by default. PL39 requires every Practice HTML sink to be removed or individually justified.
]));

function lineFor(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function addMatches(findings, source, path, code, expression, severity = "High") {
  expression.lastIndex = 0;
  for (const match of source.matchAll(expression)) findings.push({ severity, code, path, line: lineFor(source, match.index ?? 0) });
}

export async function auditPracticePrivacySecuritySource() {
  const findings = [];
  const observations = [];
  const files = await filesUnder(practiceRoot);
  for (const file of files) {
    const path = relative(root, file).replaceAll("\\", "/");
    const source = await readFile(file, "utf8");
    for (const [code, expression] of BLOCKING_PATTERNS) addMatches(findings, source, path, code, expression);
    for (const [code, expression] of DOM_SINKS) {
      const matches = [];
      addMatches(matches, source, path, code, expression, "High");
      for (const finding of matches) {
        if (TRUSTED_STATIC_DOM_SINKS.has(`${path}:${finding.line}:${code}`)) observations.push({ ...finding, severity: "Low", disposition: "narrow-static-allowlist" });
        else findings.push(finding);
      }
    }
    const fetchExpression = /\bfetch\s*\(/gu;
    const fetches = [];
    addMatches(fetches, source, path, "FETCH", fetchExpression, "Medium");
    for (const finding of fetches) {
      if (!STATIC_FETCH_FILES.has(path)) findings.push({ ...finding, code: "UNREVIEWED_NETWORK_FETCH", severity: "High" });
      else observations.push({ ...finding, disposition: "same-origin-static-loader" });
    }
    const consoleExpression = /\bconsole\.(?:log|debug|warn|error)\s*\(/gu;
    addMatches(findings, source, path, "PRACTICE_CONSOLE_LOG", consoleExpression, "Medium");
  }
  return Object.freeze({
    auditVersion: 1,
    filesScanned: files.length,
    findings: Object.freeze(findings),
    observations: Object.freeze(observations),
    status: findings.length ? "FAIL" : "PASS",
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await auditPracticePrivacySecuritySource();
  console.log(JSON.stringify(report, null, 2));
  if (report.findings.length) process.exitCode = 1;
}
