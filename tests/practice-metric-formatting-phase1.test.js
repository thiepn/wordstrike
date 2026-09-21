import test from "node:test";
import assert from "node:assert/strict";
import { renderPracticeLab } from "../js/practiceLab/practiceLabRenderer.js";
import { renderPracticeCommonWordsResult } from "../js/practiceLab/practiceCommonWordsSessionHost.js";
import { renderPracticeCustomTextResult } from "../js/practiceLab/practiceCustomTextSessionHost.js";

const root = () => ({
  innerHTML: "",
  ownerDocument: { activeElement: null },
  querySelector() { return null; },
});

test("Phase 1 Assessment keeps canonical 1 percent distinct from ratio 0.01", () => {
  const target=root();
  renderPracticeLab(target,{
    kind:"full-assessment-detail",title:"Full Assessment",description:"",longDescription:"",
    backLabel:"Back",progress:null,depths:[],results:{
      integrity:null,
      sections:[
        {id:"natural-text",title:"Natural Text",data:{benchmark:{wpm:10,adjustedWpm:10,accuracy:1,freshness:"fresh"},coldNaturalAbility:null}},
        {id:"accuracy-control",title:"Accuracy & Control",data:{firstPassAccuracy:.01,disfluencyRate:.01,correctionInputsPer1000:0,correctionCostMsPer1000:0,errorEpisodesPer1000:0}},
        {id:"diagnostic-coverage",title:"Diagnostic Coverage",data:{blocks:[{coverageRatio:.01}]}},
        {id:"main-limiters",title:"Main Limiters",data:[]},
        {id:"transfer",title:"Transfer",data:{available:true,wpm:10,adjustedWpm:10,accuracy:1,freshness:"fresh",validTransferEvidenceEntityCount:1}},
        {id:"measurement-coverage",title:"Measurement Coverage",data:{}},
      ],
    },
  });
  assert.equal((target.innerHTML.match(/>1%<\/dd>/g)||[]).length,4);
  assert.match(target.innerHTML,/Blueprint coverage: 1%/);
  assert.doesNotMatch(target.innerHTML,/Accuracy<\/dt><dd>100%/);
});

test("Phase 1 Common Words does not reinterpret a canonical 1 percent Check as 100 percent", () => {
  const target=root();
  const breadth={bands:{core:{},frequent:{},common:{},broad:{}}};
  renderPracticeCommonWordsResult(target,{flow:"check",contentPlan:{completion:{value:200}}},{
    summary:{afterMetrics:{
      wpm:10,accuracy:1,
      bandMetrics:{
        core:{wholeWordFirstPassAccuracy:.01,launchResidualMedianMs:0,internalResidualMedianMs:0,launchDisfluencyRate:.01,internalDisfluencyRate:.01},
        frequent:{},common:{},broad:{},
      },
    }},
  },breadth,null,{focusResult:false});
  assert.match(target.innerHTML,/<dt>Accuracy<\/dt><dd>1%<\/dd>/);
  assert.match(target.innerHTML,/<th scope="row">Core<\/th><td>1%<\/td>/);
  assert.doesNotMatch(target.innerHTML,/<dt>Accuracy<\/dt><dd>100%<\/dd>/);
});

test("Phase 1 Common Words Practice explicitly converts ratio accuracy", () => {
  const target=root();
  renderPracticeCommonWordsResult(target,{flow:"practice",contentPlan:{completion:{value:160}}},{
    summary:{afterMetrics:{wordsCompleted:160,wpm:10,firstPassWordAccuracy:.01,previouslyUnobservedCount:0,lowExposureCount:0}},
  },{bands:{core:{},frequent:{},common:{},broad:{}}},null,{focusResult:false});
  assert.match(target.innerHTML,/<dt>First-pass word accuracy<\/dt><dd>1%<\/dd>/);
});

test("Phase 1 Custom Text keeps both canonical accuracy fields on their 0-100 scale", () => {
  const target=root();
  renderPracticeCustomTextResult(target,{},{summary:{
    wpm:10,rawWpm:11,accuracy:1,typedCharacterCount:10,completedWordCount:2,
    afterMetrics:{wpm:10,rawWpm:11,acceptedInsertionAccuracy:1,firstPassAccuracy:1,charactersTyped:10,wordsEncountered:2,correctionInputs:0,errorEpisodeCount:0},
  }});
  assert.equal((target.innerHTML.match(/<dd>1%<\/dd>/g)||[]).length,2);
  assert.doesNotMatch(target.innerHTML,/<dd>100%<\/dd>/);
});
