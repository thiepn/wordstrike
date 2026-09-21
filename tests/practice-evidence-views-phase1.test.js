import assert from "node:assert/strict";
import test from "node:test";
import { renderPracticeEvidenceView } from "../js/practiceLab/practiceEvidenceViews.js";

function makeRoot() {
  return {
    innerHTML: "",
    ownerDocument: null,
    contains() { return false; },
    querySelector() { return null; },
  };
}

test("Phase 1 Skill Map renders canonical first-pass and latency units", () => {
  const root=makeRoot();
  renderPracticeEvidenceView(root,"skill-map",{
    status:"ready",page:0,reviews:[],sessions:[],
    skills:[{
      statId:"practice-stat_demo",entityType:"key",entityKey:"e",
      priority:42,confidenceLevel:"medium",confidenceScore:64,masteryState:"learning",
      lastObservedAt:"2026-09-20T12:00:00.000Z",
      evidence:{
        opportunities:{count:10,correctCount:9,errorCount:1,directTargetedCount:10,incidentalCount:0},
        timing:{fluentLatency:{count:8,meanMs:123.4,m2:0,minMs:100,maxMs:150,recentSamples:[]}},
      },
    }],
  });
  assert.match(root.innerHTML,/90%/);
  assert.match(root.innerHTML,/123\.4 ms/);
  assert.doesNotMatch(root.innerHTML,/— ms/);
  assert.match(root.innerHTML,/medium confidence/);
  assert.match(root.innerHTML,/learning/);
});

test("Phase 1 Skill Map never presents an empty latency aggregate as zero milliseconds", () => {
  const root=makeRoot();
  renderPracticeEvidenceView(root,"skill-map",{
    status:"ready",page:0,reviews:[],sessions:[],
    skills:[{
      statId:"practice-stat_empty-latency",entityType:"key",entityKey:"q",
      priority:0,confidenceLevel:"low",confidenceScore:10,masteryState:"unmeasured",
      evidence:{
        opportunities:{count:1,correctCount:1,errorCount:0,directTargetedCount:1,incidentalCount:0},
        timing:{fluentLatency:{count:0,meanMs:0,m2:0,minMs:null,maxMs:null,recentSamples:[]}},
      },
    }],
  });
  assert.match(root.innerHTML,/Fluent timing<\/dt><dd>Not measured/);
  assert.doesNotMatch(root.innerHTML,/0 ms/);
});

test("Phase 1 Practice history uses canonical session WPM and accuracy", () => {
  const root=makeRoot();
  renderPracticeEvidenceView(root,"history",{
    status:"ready",page:0,skills:[],reviews:[],
    sessions:[{
      sessionId:"practice-session_demo",experimentId:"weak-keys",status:"completed",
      completedAtUtc:"2026-09-20T12:00:00.000Z",
      wpm:72.4,accuracy:96.5,
      afterMetrics:{wpm:999,firstPassAccuracy:0.8,accuracy:0.8},
    }],
  },{embedded:true});
  assert.match(root.innerHTML,/72\.4 WPM/);
  assert.match(root.innerHTML,/96\.5% accuracy/);
  assert.doesNotMatch(root.innerHTML,/999 WPM/);
  assert.doesNotMatch(root.innerHTML,/0\.8% accuracy/);
  assert.match(root.innerHTML,/data-practice-history-metrics/);
});

test("Phase 1 history does not substitute probe metrics when canonical session metrics are unavailable", () => {
  const root=makeRoot();
  renderPracticeEvidenceView(root,"history",{
    status:"ready",page:0,skills:[],reviews:[],
    sessions:[{
      sessionId:"practice-session_legacy",experimentId:"legacy",status:"completed",
      completedAtUtc:"2026-09-20T12:00:00.000Z",
      afterMetrics:{wpm:88,firstPassAccuracy:0.95},
    }],
  },{embedded:true});
  assert.match(root.innerHTML,/— WPM · — accuracy/);
  assert.doesNotMatch(root.innerHTML,/88 WPM|95% accuracy|0\.95% accuracy/);
});
