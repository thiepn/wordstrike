import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {preparePracticePreviewProtocol} from '../js/practiceLab/practicePreviewProtocolRuntime.js';
import {createPracticeSessionEngine} from '../js/practiceLab/practiceSessionEngine.js';
import {createPracticeSessionHarness} from './practiceSessionFixtures.js';
const fetchImpl=async path=>{const text=await readFile(new URL('../'+path,import.meta.url),'utf8');return {ok:true,text:async()=>text,json:async()=>JSON.parse(text)};};
for(const experimentId of ['read-ahead','metronome-typing'])test(`${experimentId} runs and persists canonical analysis without protected privileges`,async()=>{
 const h=await createPracticeSessionHarness({suffix:experimentId});
 const durationMs=experimentId==='read-ahead'?180000:120000;
 const prepared=await preparePracticePreviewProtocol({experimentId,durationMs,context:{dataLocale:'en'},fetchImpl});
 const engine=createPracticeSessionEngine({repository:h.repository,sessionId:prepared.sessionId,profileId:h.profileId,contextId:h.contextId,clock:h.time.clock,wallClock:h.time.wallClock,scheduler:h.time.scheduler});
 await engine.prepare({experiment:prepared.experiment,configuration:prepared.configuration,contentPlan:prepared.contentPlan});await engine.start();
 for(const c of prepared.graphemes.slice(0,100)){await h.time.advance(100,{runTimers:false});assert.equal(engine.handleInput(h.input(c===' '?'space':'character',c)).accepted,true);}
 if(experimentId==='metronome-typing'){const plan=prepared.calibrate();assert.equal(plan.tempo.fixedForSession,true);assert.equal(plan.calibration.grossCpm,300);assert.equal(plan.tempo.bpm,100);}
 await h.time.advance(durationMs,{runTimers:false});await engine.tick();const result=await engine.complete();assert.equal(result.summary.status,'completed');assert.equal(result.summary.experimentId,experimentId);assert.ok(result.summary.trainingQuality.blocks.length>=6);assert.equal(result.summary.abilityMeasurementSummary,null);assert.deepEqual(result.summary.targetEntities,[]);assert.ok(await h.repository.getSessionSummary(prepared.sessionId));await engine.destroy();
});
test('protocol preparation rejects unsupported duration and language',async()=>{
 await assert.rejects(preparePracticePreviewProtocol({experimentId:'read-ahead',durationMs:60000,context:{dataLocale:'en'},fetchImpl}));
 await assert.rejects(preparePracticePreviewProtocol({experimentId:'metronome-typing',durationMs:120000,context:{dataLocale:'fr'},fetchImpl}));
});
