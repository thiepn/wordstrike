import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_EVALUATION_PROTOCOL_V1 } from "../js/practiceLab/practiceEvaluationConstants.js";

for(const kind of ["benchmark","cold-transfer"]){
  test(`PL18 ${kind} protocol is fixed 60s, untargeted, non-resumable and measurement-minimal`,()=>{
    const p=PRACTICE_EVALUATION_PROTOCOL_V1[kind];
    assert.equal(p.durationMs,60000);
    assert.equal(p.completionMode,"duration");
    assert.equal(p.completionReason,"time-complete");
    assert.equal(p.correctionBehavior,"allow");
    assert.equal(p.timingMode,"on-first-input");
    assert.equal(p.targeted,false);
    assert.equal(p.resumable,false);
    assert.equal(p.appendAllowed,false);
    assert.equal(p.pauseAllowed,false);
    assert.equal(p.feedback.showLiveWpm,false);
    assert.equal(p.feedback.showLiveAccuracy,false);
    assert.equal(p.feedback.showRhythmFeedback,false);
    assert.equal(p.feedback.metronomeSoundEnabled,false);
    assert.equal(p.feedback.adaptiveHints,false);
  });
}
