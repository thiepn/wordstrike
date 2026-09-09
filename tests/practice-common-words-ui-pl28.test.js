import test from "node:test";
import assert from "node:assert/strict";
import { renderPracticeCommonWordsDetail } from "../js/practiceLab/practiceLabRendererV28.js";
import { renderPracticeCommonWordsResult } from "../js/practiceLab/practiceCommonWordsSessionHost.js";

function fakeRoot() {
  const focusCalls = [];
  return {
    innerHTML: "",
    focusCalls,
    querySelector(selector) {
      return { focus(options) { focusCalls.push({ selector, options }); } };
    },
  };
}

const breadth = {
  overall: { repeatedEvidencePercent: 25 },
  bands: {
    core: { totalWords: 100, observedCount: 50, observedPercent: 50, repeatedEvidenceCount: 30, repeatedEvidencePercent: 30, automaticCount: 10, automaticPercent: 10 },
    frequent: { totalWords: 200, observedCount: 60, observedPercent: 30, repeatedEvidenceCount: 40, repeatedEvidencePercent: 20, automaticCount: 20, automaticPercent: 10 },
    common: { totalWords: 400, observedCount: 80, observedPercent: 20, repeatedEvidenceCount: 60, repeatedEvidencePercent: 15, automaticCount: 20, automaticPercent: 5 },
    broad: { totalWords: 500, observedCount: 50, observedPercent: 10, repeatedEvidenceCount: 25, repeatedEvidencePercent: 5, automaticCount: 10, automaticPercent: 2 },
  },
};

test("PL28 detail exposes one Common Words surface with keyboard-accessible Practice sizes and Check action", () => {
  const root = fakeRoot();
  renderPracticeCommonWordsDetail(root, {
    availability: { practiceAvailable: true, practiceSizes: [80, 160, 240], checkAvailable: true },
    breadthSnapshot: breadth,
    wordCount: 160,
    starting: null,
  });
  assert.match(root.innerHTML, /<h1>Common Words<\/h1>/);
  assert.match(root.innerHTML, /<h2>Common Words Practice<\/h2>/);
  assert.match(root.innerHTML, /<h2>Typing Breadth Check<\/h2>/);
  assert.match(root.innerHTML, /data-word-count="80"[^>]*>80 words<\/button>/);
  assert.match(root.innerHTML, /data-word-count="160"[^>]*aria-pressed="true"/);
  assert.match(root.innerHTML, /data-word-count="240"[^>]*>240 words<\/button>/);
  assert.match(root.innerHTML, /<button type="button" class="practice-lab-primary-action" data-practice-action="start-common-words-check"/);
  assert.match(root.innerHTML, /This check uses a fixed balanced sample\. It does not adapt its words to your current weaknesses\./);
  assert.match(root.innerHTML, /<thead><tr><th>Band<\/th><th>Measured<\/th><th>Repeated evidence<\/th><th>Automatic<\/th><\/tr><\/thead>/);
  assert.match(root.innerHTML, /<th scope="row">Core<\/th>/);
  assert.match(root.innerHTML, /Typing breadth measures WordStrike's typing evidence across the common-word reference\. It does not estimate how many English words you know\./);
  assert.ok(root.focusCalls.length >= 1);
});

test("PL28 Check result presents canonical PL13 estimate, 95% model interval, confidence, semantic band tables, and no vocabulary-score claim", () => {
  const root = fakeRoot();
  const session = {
    flow: "check",
    contentPlan: { completion: { value: 200 } },
  };
  const finalResult = {
    summary: {
      afterMetrics: {
        wpm: 83.4,
        accuracy: 0.97,
        bandMetrics: {
          core: { wholeWordFirstPassAccuracy: 0.98, launchResidualMedianMs: 10, internalResidualMedianMs: 5, launchDisfluencyRate: 0.02, internalDisfluencyRate: 0.01 },
          frequent: { wholeWordFirstPassAccuracy: 0.97, launchResidualMedianMs: 11, internalResidualMedianMs: 6, launchDisfluencyRate: 0.03, internalDisfluencyRate: 0.02 },
          common: { wholeWordFirstPassAccuracy: 0.96, launchResidualMedianMs: 12, internalResidualMedianMs: 7, launchDisfluencyRate: 0.04, internalDisfluencyRate: 0.03 },
          broad: { wholeWordFirstPassAccuracy: 0.95, launchResidualMedianMs: 14, internalResidualMedianMs: 9, launchDisfluencyRate: 0.05, internalDisfluencyRate: 0.04 },
        },
      },
    },
  };
  const abilityState = {
    estimate: {
      estimateWpm: 81.2,
      interval95LowerWpm: 72.5,
      interval95UpperWpm: 90.9,
      confidenceLevel: "medium",
    },
  };
  renderPracticeCommonWordsResult(root, session, finalResult, breadth, abilityState);
  assert.match(root.innerHTML, /<dt>Common-word typing ability<\/dt><dd>81\.2 WPM<\/dd>/);
  assert.match(root.innerHTML, /<dt>95% model interval<\/dt><dd>72\.5–90\.9 WPM<\/dd>/);
  assert.match(root.innerHTML, /<dt>Confidence<\/dt><dd>medium<\/dd>/);
  assert.match(root.innerHTML, /<h2>Frequency-band profile<\/h2>/);
  assert.match(root.innerHTML, /<th>First-pass accuracy<\/th><th>Starting words<\/th><th>Inside words<\/th>/);
  assert.match(root.innerHTML, /<th scope="row">Broad<\/th>/);
  assert.match(root.innerHTML, /<h2>Typing breadth coverage<\/h2>/);
  assert.doesNotMatch(root.innerHTML, /Vocabulary Breadth Score|vocabulary level|You know/i);
  assert.equal(root.focusCalls.at(-1)?.selector, "[data-common-words-session-action='finish']");
});

test("PL28 Practice result does not expose a PL13 common-words ability update", () => {
  const root = fakeRoot();
  renderPracticeCommonWordsResult(root, {
    flow: "practice",
    contentPlan: { completion: { value: 160 } },
  }, {
    summary: { afterMetrics: { wordsCompleted: 160, wpm: 70, firstPassWordAccuracy: 0.96, previouslyUnobservedCount: 42, lowExposureCount: 68 } },
  }, breadth, { estimate: { estimateWpm: 999, confidenceLevel: "high" } }, { focusResult: false });
  assert.match(root.innerHTML, /Common Words Practice/);
  assert.match(root.innerHTML, /Newly measured common words/);
  assert.doesNotMatch(root.innerHTML, /Common-word typing ability|95% model interval/);
});
