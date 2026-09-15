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

const PRIVACY_OVERCLAIMS = Object.freeze([
  ["PRIVACY_OVERCLAIM_NEVER_LEAVES_DEVICE", /never leaves (?:your|this) device/giu],
  ["PRIVACY_OVERCLAIM_STAYS_ON_DEVICE", /stays? on (?:your|this) device/giu],
  ["PRIVACY_OVERCLAIM_UNHACKABLE", /\bunhackable\b/giu],
  ["PRIVACY_OVERCLAIM_SCIENTIFICALLY_ANONYMOUS", /scientifically anonymous/giu],
]);

const STATIC_FETCH_FILES = Object.freeze(new Set([
  "js/practiceLab/practiceCommonWordReference.js",
  "js/practiceLab/practiceCorpusRegistry.js",
  "js/practiceLab/practiceEvaluationContentLoader.js",
  "js/practiceLab/practiceIndexLoader.js",
  "js/practiceLab/practiceRealTextPool.js",
  "js/practiceLab/practiceTypabilityRuntime.js",
]));

// Exact current sink counts are certified. A new occurrence is not inherited by
// this review: it changes the count and fails PL39 until explicitly audited.
const REVIEWED_INNER_HTML = Object.freeze({
  "js/practiceLab/practiceAccuracyRecoverySessionHost.js": [2, "fixed shell/results and bounded metrics"],
  "js/practiceLab/practiceBurstSprintsSessionHost.js": [1, "GC1 central shell helper; dynamic text is escaped and protocol/result metrics are bounded"],
  "js/practiceLab/practiceCoachReviewSessionHost.js": [3, "fixed review shell/results with validated identifiers"],
  "js/practiceLab/practiceCombinationRepairSessionHost.js": [3, "validated target identifiers plus fixed markup"],
  "js/practiceLab/practiceCommonWordsSessionHost.js": [2, "fixed common-word session/result markup"],
  "js/practiceLab/practiceCustomTextSessionHost.js": [2, "private graphemes use textContent; innerHTML contains only fixed shell/bounded metrics"],
  "js/practiceLab/practiceLabController.js": [1, "compile-time loading placeholder"],
  "js/practiceLab/practiceLabRenderer.js": [1, "dynamic display strings are escaped before reviewed markup composition"],
  "js/practiceLab/practiceLabRendererV20.js": [1, "reviewed renderer; dynamic display strings are escaped/validated"],
  "js/practiceLab/practiceLabRendererV21.js": [1, "reviewed renderer; dynamic display strings are escaped/validated"],
  "js/practiceLab/practiceLabRendererV22.js": [1, "reviewed renderer; dynamic display strings are escaped/validated"],
  "js/practiceLab/practiceLabRendererV23.js": [1, "reviewed renderer; dynamic display strings are escaped/validated"],
  "js/practiceLab/practiceLabRendererV24.js": [1, "reviewed renderer; dynamic display strings are escaped/validated"],
  "js/practiceLab/practiceLabRendererV25.js": [1, "reviewed renderer; dynamic display strings are escaped/validated"],
  "js/practiceLab/practiceLabRendererV26.js": [1, "reviewed renderer; dynamic display strings are escaped/validated"],
  "js/practiceLab/practiceLabRendererV27.js": [1, "reviewed renderer; dynamic display strings are escaped/validated"],
  "js/practiceLab/practiceLabRendererV28.js": [1, "reviewed renderer; dynamic display strings are escaped/validated"],
  "js/practiceLab/practiceLabRendererV29.js": [2, "reviewed renderer with bounded/escaped model values"],
  "js/practiceLab/practiceLabRendererV30.js": [2, "reviewed renderer with bounded/escaped model values"],
  "js/practiceLab/practiceLabRendererV31.js": [1, "Custom Text editor/library values are assigned through safe DOM properties"],
  "js/practiceLab/practiceLabRendererV32.js": [1, "reviewed treatment-response markup with bounded values"],
  "js/practiceLab/practiceLabRendererV36.js": [1, "aggregate telemetry values only"],
  "js/practiceLab/practicePaceLadderSessionHost.js": [2, "fixed ladder shell/results with numeric metrics"],
  "js/practiceLab/practiceProblemWordsSessionHost.js": [2, "validated lexical target plus fixed markup"],
  "js/practiceLab/practiceRealTextSessionHost.js": [3, "passage graphemes are escaped before HTML composition"],
  "js/practiceLab/practiceResearchProbeSessionHost.js": [2, "protected probe rendering follows escaped/controlled passage path"],
  "js/practiceLab/practiceResearchUi.js": [4, "research strings are escaped; consent/control markup is fixed"],
  "js/practiceLab/practiceSpecialDomainSessionHost.js": [2, "approved static-domain content and bounded metrics"],
  "js/practiceLab/practiceSustainedSessionHost.js": [3, "fixed sustained-session markup and bounded metrics"],
  "js/practiceLab/practiceWeakKeysSessionHost.js": [3, "manual target is constrained to one supported key"],
  "js/practiceLab/practiceWeaknessBossSessionHost.js": [1, "fixed gameplay shell; typed material uses the session rendering path"],
  "js/practiceLab/practiceWeaknessBossUi.js": [3, "validated target/model data and fixed setup/result markup"],
});

function lineFor(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function matches(source, expression) {
  expression.lastIndex = 0;
  return [...source.matchAll(expression)];
}

function importSpecifiers(source) {
  return [
    ...[...source.matchAll(/from\s+["']([^"']+)["']/gu)].map((match) => match[1]),
    ...[...source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/gu)].map((match) => match[1]),
  ];
}

export async function auditPracticePrivacySecuritySource() {
  const findings = [];
  const observations = [];
  const files = await filesUnder(practiceRoot);
  const reviewedHtmlSeen = new Set();

  for (const file of files) {
    const path = relative(root, file).replaceAll("\\", "/");
    const source = await readFile(file, "utf8");

    for (const [code, expression] of BLOCKING_PATTERNS) {
      for (const match of matches(source, expression)) findings.push({ severity: "High", code, path, line: lineFor(source, match.index ?? 0) });
    }

    for (const [code, expression] of PRIVACY_OVERCLAIMS) {
      for (const match of matches(source, expression)) findings.push({ severity: "Medium", code, path, line: lineFor(source, match.index ?? 0) });
    }

    for (const specifier of importSpecifiers(source)) {
      if (/supabase/iu.test(specifier)) findings.push({ severity: "High", code: "SUPABASE_IMPORT", path, specifier });
      if (/leaderboard|ranking/iu.test(specifier)) findings.push({ severity: "High", code: "LEADERBOARD_IMPORT", path, specifier });
    }

    for (const [code, expression] of DOM_SINKS) {
      const sinkMatches = matches(source, expression);
      if (!sinkMatches.length) continue;
      if (code === "INNER_HTML" && REVIEWED_INNER_HTML[path]) {
        const [expectedCount, reason] = REVIEWED_INNER_HTML[path];
        reviewedHtmlSeen.add(path);
        if (sinkMatches.length !== expectedCount) findings.push({ severity: "High", code: "HTML_SINK_COUNT_CHANGED", path, expectedCount, actualCount: sinkMatches.length });
        else observations.push({ severity: "Low", code: "REVIEWED_INNER_HTML", path, count: sinkMatches.length, reason });
        continue;
      }
      for (const match of sinkMatches) findings.push({ severity: "High", code, path, line: lineFor(source, match.index ?? 0) });
    }

    for (const match of matches(source, /\bfetch\s*\(/gu)) {
      const item = { path, line: lineFor(source, match.index ?? 0) };
      if (!STATIC_FETCH_FILES.has(path)) findings.push({ severity: "High", code: "UNREVIEWED_NETWORK_FETCH", ...item });
      else observations.push({ severity: "Low", code: "STATIC_FETCH", ...item, reason: "reviewed same-origin static Practice asset loader" });
    }

    for (const match of matches(source, /\bconsole\.(?:log|debug|warn|error)\s*\(/gu)) findings.push({ severity: "Medium", code: "PRACTICE_CONSOLE_LOG", path, line: lineFor(source, match.index ?? 0) });
  }

  for (const path of Object.keys(REVIEWED_INNER_HTML)) if (!reviewedHtmlSeen.has(path)) findings.push({ severity: "Medium", code: "STALE_HTML_SINK_ALLOWLIST", path });

  return Object.freeze({ auditVersion: 3, filesScanned: files.length, findings: Object.freeze(findings), observations: Object.freeze(observations), status: findings.length ? "FAIL" : "PASS" });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await auditPracticePrivacySecuritySource();
  console.log(JSON.stringify(report, null, 2));
  if (report.findings.length) process.exitCode = 1;
}
