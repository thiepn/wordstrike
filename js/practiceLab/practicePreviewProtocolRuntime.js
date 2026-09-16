import {loadPracticeSustainedFormSet} from './practiceSustainedForms.js';
import {createPracticeContentPlan} from './practiceSessionContract.js';
import {createPracticeSessionId} from './practiceIds.js';
import {selectPracticeSustainedForm} from './practiceSustainedPlan.js';
import {createPracticeReadAheadPlan} from './practiceReadAheadPlan.js';
import {buildPracticeMetronomeSchedule} from './practiceMetronomeSchedule.js';
import {createPracticeMetronomePlan} from './practiceMetronomePlan.js';
import {createPracticeReadAheadBlockAccumulator} from './practiceReadAheadBlockAccumulator.js';
import {createPracticeMetronomeBlockAccumulator} from './practiceMetronomeBlockAccumulator.js';
import {analyzePracticeReadAhead} from './practiceReadAheadAnalysis.js';
import {analyzePracticeMetronome} from './practiceMetronomeAnalysis.js';
import {buildPracticeReadAheadLexicalIndex} from './practiceReadAheadVisibility.js';

export async function preparePracticePreviewProtocol({experimentId,durationMs,context,fetchImpl=globalThis.fetch}={}) {
  const readAhead=experimentId==='read-ahead';
  if(!readAhead&&experimentId!=='metronome-typing')throw new TypeError('Unknown protocol');
  if(!(readAhead?[180000,360000,600000]:[120000,300000,480000]).includes(durationMs))throw new TypeError('Unsupported duration');
  if(!String(context?.dataLocale??context?.language??context?.locale??'').toLowerCase().startsWith('en'))throw new Error('This protocol currently requires an English Practice context.');
  const formSet=await loadPracticeSustainedFormSet({fetchImpl,folder:readAhead?'read-ahead':'consistency',formSetId:readAhead?'WS-READAHEAD-EN-1':'WS-CONSISTENCY-EN-1',expectedPartition:'training',minimumReadyForms:4});
  const sessionId=createPracticeSessionId(),form=selectPracticeSustainedForm({sessionId,formSet});
  let plan=readAhead?createPracticeReadAheadPlan({sessionId,durationMs,formSetId:formSet.manifest.formSetId,formSetVersion:1,formId:form.formId,formHash:form.formHash}):null;
  const schedule=readAhead?plan:{...buildPracticeMetronomeSchedule({sessionId,durationMs}),durationMs};
  const accumulator=(readAhead?createPracticeReadAheadBlockAccumulator:createPracticeMetronomeBlockAccumulator)({plan:schedule});
  const graphemes=Array.from(form.text),words=[];let start=null;
  for(let i=0;i<=graphemes.length;i++){const word=i<graphemes.length&&/[\p{L}\p{N}]/u.test(graphemes[i]);if(word&&start===null)start=i;if(!word&&start!==null){words.push({type:'word',startIndex:start,endIndex:i});start=null;}}
  const lexicalIndex=buildPracticeReadAheadLexicalIndex({units:words,textLength:graphemes.length});
  const contentPlan=createPracticeContentPlan({contentId:`practice-content_${experimentId}-${sessionId}`,contentGeneratorVersion:1,text:form.text,units:[{unitId:'training-passage',type:'paragraph',startIndex:0,endIndex:graphemes.length,text:form.text}],targetEntities:[],completion:{mode:'duration',value:durationMs},metadata:{sourceType:experimentId+'-training',partition:'training',language:'en',formId:form.formId,formHash:form.formHash,formSetId:formSet.manifest.formSetId}});
  let baselineInsertions=0,timingAnalyzed=false;
  const configuration={correctionBehavior:'allow',timingMode:'on-first-input',durationMs,policyVersion:1,cueMode:'visual'};
  const experiment={id:experimentId,version:1,title:readAhead?'Read-Ahead':'Metronome',category:'fluency',sessionSchemaVersion:1,defaultCorrectionBehavior:'allow',supportedCompletionModes:['duration'],resumable:false,retentionMeasurementKind:null,abilityChannel:null,performanceMeasurementKind:null,performanceReferenceChannel:null,evaluationMeasurementKind:null,
    validateConfiguration:c=>c.durationMs===durationMs&&c.correctionBehavior==='allow',validateContentPlan:p=>p.contentId===contentPlan.contentId&&p.metadata?.formHash===form.formHash&&p.metadata?.partition==='training',
    onProcessedInput(event){const insertion=['character','space'].includes(event.type);if(insertion&&event.relativeActiveTimestampMs<schedule.blocks[0].endMs)baselineInsertions++;accumulator.recordProcessedInput({...event,type:insertion?'character':event.type,activeSessionMs:event.relativeActiveTimestampMs,acceptedForward:insertion});},
    onClosedErrorEpisode({episode}){if(!Number.isFinite(episode.repairCompleteActiveMs)||!Number.isFinite(episode.errorToRepairMs))return;accumulator.recordClosedErrorEpisode({startActiveSessionMs:episode.repairCompleteActiveMs-episode.errorToRepairMs,endActiveSessionMs:episode.repairCompleteActiveMs});},
    analyzeResult({metricsSnapshot,foundationAnalysis,eventTrace}){
      if(!timingAnalyzed){timingAnalyzed=true;const events=new Map(eventTrace.map(e=>[e.eventIndex,e]));for(const t of foundationAnalysis?.latency?.classifiedTransitions??[]){const e=events.get(t.eventIndex);if(e)accumulator.recordProcessedInput({activeSessionMs:e.relativeActiveTimestampMs,previousActiveSessionMs:e.relativeActiveTimestampMs-t.latencyMs,latencyClass:t.classification});}}
      const blockSnapshot=accumulator.finalize(metricsSnapshot.activeDurationMs);
      const analysis=readAhead?analyzePracticeReadAhead({blockSnapshot,durationMs,scheduleVariant:plan.scheduleVariant}):analyzePracticeMetronome({blockSnapshot,durationMs,scheduleVariant:schedule.variant,cueMode:'visual',bpm:plan?.tempo.bpm??null,charsPerBeat:plan?.tempo.charsPerBeat??null});
      return {beforeMetrics:null,afterMetrics:{wpm:metricsSnapshot.wpm,accuracy:metricsSnapshot.accuracy,durationMs:metricsSnapshot.activeDurationMs},transferMetrics:null,recommendationIds:[],reviewItemChanges:[],trainingQuality:{...analysis,kind:experimentId,planHash:plan?.planHash??null},interpretation:{scope:'within-session-descriptive',wording:'This comparison describes this session. It does not establish a causal benefit or retained skill.'}};
    }
  };
  return {sessionId,experimentId,experiment,configuration,contentPlan,graphemes,lexicalIndex,schedule,accumulator,getPlan:()=>plan,calibrate(){if(readAhead||plan)return plan;plan=createPracticeMetronomePlan({sessionId,durationMs,cueMode:'visual',baselineGrossCpm:baselineInsertions*60000/schedule.blocks[0].endMs,contentId:form.formId,contentHash:form.formHash});return plan;}};
}
