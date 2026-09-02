import assert from "node:assert/strict";
import {
  ARCADE_RUSH_UI_ACTIONS,
  ARCADE_RUSH_UI_CSS,
  ARCADE_RUSH_UI_VERSION,
  buildArcadeRushReadyMarkup,
  buildArcadeRushResultsMarkup,
  createArcadeRushDomUiController,
  createArcadeRushUiBindings,
  createArcadeRushUiPort,
  formatArcadeRushAccuracy,
  formatArcadeRushDuration,
  formatArcadeRushNumber,
  isArcadeRushUiPort,
} from "../js/arcadeRush/index.js";

assert.equal(ARCADE_RUSH_UI_VERSION, 1);
assert.equal(formatArcadeRushNumber(123456), "123,456");
assert.equal(formatArcadeRushAccuracy(97.84), "97.8%");
assert.equal(formatArcadeRushDuration(287000), "4:47");

const ready = buildArcadeRushReadyMarkup({ personalBest: 76972 });
for (const expected of ["ARCADE RUSH", "Waves", "Final Boss", "Core Integrity", "~5 MIN", "76,972", "Start Rush"]) assert.ok(ready.includes(expected));
for (const forbidden of ["Daily Strike", "streak", "attempt limit", "UTC"]) assert.equal(ready.toLowerCase().includes(forbidden.toLowerCase()), false);
assert.ok(ARCADE_RUSH_UI_CSS.includes("@media(max-width:520px)"));
assert.ok(ARCADE_RUSH_UI_CSS.includes("@media(prefers-reduced-motion:reduce)"));
assert.ok(ARCADE_RUSH_UI_CSS.includes("min-height:44px"));
assert.ok(ARCADE_RUSH_UI_CSS.includes("touch-action:manipulation"));

const success = {
  sessionId:"rush-ui-success",success:true,score:76972,accuracy:97.84,wpm:84,activeDurationMs:287000,
  combo:{maximum:63,final:20},
  modeData:{wavesCompleted:6,finalWave:7,bossDefeated:true,integrityRemaining:3,wordPoints:41000,waveClearBonus:12000,perfectWaveBonus:1500,bossBonus:8000,integrityBonus:6000,accuracyBonus:6000,timeBonus:472},
};
const successMarkup = buildArcadeRushResultsMarkup(success,{isPersonalBest:true,leaderboardAvailable:true});
for (const expected of ["ARCADE RUSH COMPLETE","76,972","NEW PERSONAL BEST","84</strong><span>WPM","97.8%</strong><span>Accuracy","63</strong><span>Max Combo","3/5</strong><span>Core","4:47</strong><span>Time","Score breakdown","View Leaderboard"]) assert.ok(successMarkup.includes(expected));

const failed = {...success,sessionId:"rush-ui-failure",success:false,score:38440,accuracy:95.7,wpm:78,activeDurationMs:180000,combo:{maximum:42,final:0},modeData:{...success.modeData,wavesCompleted:4,finalWave:5,bossDefeated:false,integrityRemaining:0,bossBonus:0,integrityBonus:0,timeBonus:0}};
const failureMarkup = buildArcadeRushResultsMarkup(failed);
for (const expected of ["CORE DESTROYED","WAVE 5/6","4/6 WAVES CLEARED",'disabled aria-disabled="true"']) assert.ok(failureMarkup.includes(expected));

class FakeRoot {
  constructor(){this.innerHTML="";this.listeners=new Map();}
  addEventListener(type,callback){this.listeners.set(type,callback);}
  removeEventListener(type,callback){if(this.listeners.get(type)===callback)this.listeners.delete(type);}
  querySelector(){return null;}
}
const calls=[]; const root=new FakeRoot();
const controller=createArcadeRushDomUiController({root,reducedMotion:true,actions:{
  [ARCADE_RUSH_UI_ACTIONS.START]:()=>calls.push("start"),
  [ARCADE_RUSH_UI_ACTIONS.BACK]:()=>calls.push("back"),
  [ARCADE_RUSH_UI_ACTIONS.PAUSE]:()=>calls.push("pause"),
  [ARCADE_RUSH_UI_ACTIONS.RESUME]:()=>calls.push("resume"),
  [ARCADE_RUSH_UI_ACTIONS.PLAY_AGAIN]:()=>calls.push("play-again"),
  [ARCADE_RUSH_UI_ACTIONS.MODE_SELECT]:()=>calls.push("mode-select"),
}});
assert.ok(controller); assert.equal(controller.getReducedMotion(),true); assert.equal(root.listeners.has("click"),true);
controller.renderReady({personalBest:1234}); assert.equal(controller.getView(),"ready");
assert.equal(controller.handleKey({key:"Enter",preventDefault(){}}),true); assert.equal(calls.at(-1),"start");
assert.equal(controller.handleKey({key:"Escape",preventDefault(){}}),true); assert.equal(calls.at(-1),"back");
controller.renderHud({runState:"active",phase:"WAVE_2",currentWave:2,score:3500,combo:19,integrity:4}); assert.equal(controller.getView(),"gameplay");
assert.equal(controller.handleKey({key:"Escape",preventDefault(){}}),true); assert.equal(calls.at(-1),"pause");
controller.renderHud({runState:"paused",phase:"WAVE_2",currentWave:2,score:3500,combo:19,integrity:4});
assert.equal(controller.handleKey({key:"Escape",preventDefault(){}}),true); assert.equal(calls.at(-1),"resume");
controller.renderResults(success,{isPersonalBest:true}); assert.equal(controller.getView(),"results");
assert.equal(controller.handleKey({key:"Enter",preventDefault(){}}),true); assert.equal(calls.at(-1),"play-again");
assert.equal(controller.handleKey({key:"Escape",preventDefault(){}}),true); assert.equal(calls.at(-1),"mode-select");
assert.equal(controller.destroy(),true); assert.equal(root.listeners.size,0); assert.equal(controller.destroy(),false);

const events=[];
const ui=createArcadeRushUiPort({renderReady:(...a)=>events.push(["ready",...a]),renderHud:(...a)=>events.push(["hud",...a]),renderWaveTransition:(...a)=>events.push(["transition",...a]),renderBossIntro:(...a)=>events.push(["boss-intro",...a]),renderResults:(...a)=>events.push(["results",...a]),clearGameplay:(...a)=>events.push(["clear",...a])});
assert.equal(isArcadeRushUiPort(ui),true);
const bindings=createArcadeRushUiBindings(ui,{resultOptions:()=>({isPersonalBest:true})}); assert.ok(bindings);
bindings.onUpdate({runState:"active",phase:"WAVE_1"}); assert.equal(events.at(-1)[0],"hud");
bindings.onWaveTransition({runState:"transitioning",wavesCompleted:1},{clearedWave:1,nextWave:2,perfect:true}); assert.equal(events.at(-1)[0],"transition");
bindings.onUpdate({runState:"transitioning",wavesCompleted:1}); assert.equal(events.at(-1)[0],"transition");
bindings.onBossIntro({runState:"boss-intro"}); assert.equal(events.at(-1)[0],"boss-intro");
bindings.onUpdate({runState:"boss-active",boss:{hp:8}}); assert.equal(events.at(-1)[0],"hud");
bindings.onComplete({runState:"complete"},success); assert.equal(events.at(-1)[0],"results"); assert.equal(events.at(-1)[2].isPersonalBest,true);
bindings.onCleanup(); assert.equal(events.at(-1)[0],"clear");

console.log("Arcade Rush AR6 UI contracts, responsive behavior, keyboard actions, and runtime bindings passed.");
