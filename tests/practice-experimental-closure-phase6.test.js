import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PRACTICE_EXPERIMENT_CATALOG } from "../js/practiceLab/practiceExperimentCatalog.js";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import { createPracticeLabRoute, normalizePracticeLabRoute, PRACTICE_LAB_PUBLIC_ROUTES, PRACTICE_LAB_ROUTES } from "../js/practiceLab/practiceLabRoutes.js";
import { buildExperimentDetailViewModel, buildPracticeHomeViewModel } from "../js/practiceLab/practiceLabViewModel.js";
import { renderPracticeWeaknessBossDetail } from "../js/practiceLab/practiceWeaknessBossUi.js";
import { renderPracticePreviewProtocolSetup } from "../js/practiceLab/practicePreviewProtocolSetup.js";
import { renderPracticePhysicalKeyboardPage } from "../js/practiceLab/practiceLabRendererV36.js";
import { buildPracticeTreatmentResponseViewModel } from "../js/practiceLab/practiceTreatmentResponseViewModel.js";
import { renderPracticeTreatmentResponseProgress } from "../js/practiceLab/practiceLabRendererV32.js";

const fakeRoot = () => ({ innerHTML:"", querySelector(){return null;} });

test("Phase 6 public catalog has zero experimental drill maturity", () => {
  for (const entry of PRACTICE_EXPERIMENT_CATALOG) {
    assert.equal(entry.tags?.includes("experimental"), false, entry.id);
    assert.equal(entry.capabilities?.includes("experimental"), false, entry.id);
  }
  for (const id of ["weakness-boss","read-ahead","metronome-typing"]) {
    const entry=PRACTICE_EXPERIMENT_CATALOG.find(item=>item.id===id);
    assert.equal(entry.status,"available");
  }
});

test("Phase 6 graduated drill detail surfaces have no experimental maturity label", () => {
  for (const id of ["weakness-boss","read-ahead","metronome-typing"]) {
    const entry=PRACTICE_EXPERIMENT_CATALOG.find(item=>item.id===id);
    const registry={getResolvedExperiment(){return {catalogEntry:entry,runnable:true,availability:"available"};}};
    const view=buildExperimentDetailViewModel({route:{params:{experimentId:id}},registry});
    assert.equal(view.statusLabel,"Available");
    assert.equal(view.maturityLabel,null);
    assert.equal(view.experimental,false);
  }
});

test("Phase 6 Weakness Boss graduates while retaining challenge-not-skill doctrine", () => {
  const root=fakeRoot();
  renderPracticeWeaknessBossDetail(root,{status:"ready",candidates:[],recommendedCandidate:null,errorCode:null});
  assert.match(root.innerHTML,/ADVANCED CHALLENGE/);
  assert.match(root.innerHTML,/Boss HP represents challenge progress, not your skill score/);
  assert.doesNotMatch(root.innerHTML,/EXPERIMENTAL/);
});

test("Phase 6 Read-Ahead and Metronome are bounded practice protocols, not experimental claims", () => {
  const doc={
    createElement(tag){
      return {tagName:tag.toUpperCase(),className:"",dataset:{},children:[],style:{},append(...nodes){this.children.push(...nodes);},set textContent(v){this._text=String(v);},get textContent(){return this._text??"";},focus(){},set tabIndex(v){this._tabIndex=v;}};
    },
  };
  const root={ownerDocument:doc,replaced:null,replaceChildren(node){this.replaced=node;},querySelector(){return {focus(){},set tabIndex(v){}};}};
  renderPracticePreviewProtocolSetup(root,"read-ahead");
  const serialized=JSON.stringify(root.replaced);
  assert.doesNotMatch(serialized,/experimental/i);
  assert.match(serialized,/descriptive practice protocols/i);
  assert.match(serialized,/does not measure eye movements/i);
});

test("Phase 6 Research is absent from public routes and remains developer-only", async () => {
  assert.equal(PRACTICE_LAB_PUBLIC_ROUTES.includes(PRACTICE_LAB_ROUTES.RESEARCH),false);
  const publicGate=createPracticeFeatureGate();
  const developerGate=createPracticeFeatureGate({developerMode:true});
  assert.equal(normalizePracticeLabRoute(createPracticeLabRoute(PRACTICE_LAB_ROUTES.RESEARCH),{featureGate:publicGate}).name,"home");
  assert.equal(normalizePracticeLabRoute(createPracticeLabRoute(PRACTICE_LAB_ROUTES.RESEARCH),{featureGate:developerGate}).name,"research");
  const source=await readFile(new URL("../js/practiceLab/practiceLabControllerRuntimeV38.js",import.meta.url),"utf8");
  assert.match(source,/researchDeveloperEnabled/);
  assert.match(source,/view\?\.kind !== "home" \|\| !researchDeveloperEnabled/);
});

test("Phase 6 Progress owns cautious observed-response evidence", () => {
  const view=buildPracticeTreatmentResponseViewModel({states:[],episodes:[]});
  assert.equal(view.title,"Progress");
  assert.equal(view.sectionTitle,"Observed Response");
  assert.match(view.doctrine,/does not prove/i);
  assert.match(view.doctrine,/practice outside WordStrike is not observed/i);
  const root=fakeRoot();
  renderPracticeTreatmentResponseProgress(root,view);
  assert.match(root.innerHTML,/<h1>Progress<\/h1>/);
  assert.match(root.innerHTML,/Observed Response/);
});

test("Phase 6 Physical Keyboard remains opt-in local advanced diagnostics", () => {
  const root=fakeRoot();
  renderPracticePhysicalKeyboardPage(root,{status:"ready",availability:{enabled:false,contextEligible:true,inputMethod:"physical"},snapshot:{coverage:{},keys:[],transitions:[],modifierRoutes:[]},hasStoredData:false});
  assert.match(root.innerHTML,/ADVANCED · LOCAL/);
  assert.match(root.innerHTML,/Enable physical telemetry/);
  assert.match(root.innerHTML,/does not save raw physical keystroke sequences/i);
});


test("Phase 6 graduated fluency protocols have real registry implementations", async () => {
  const [{ createPracticeExperimentRegistry }, { registerPracticeGraduatedFluencyExperiments }] = await Promise.all([
    import("../js/practiceLab/practiceExperimentRegistryRuntime.js"),
    import("../js/practiceLab/practiceGraduatedFluencyExperiments.js"),
  ]);
  const registry=createPracticeExperimentRegistry({featureGate:{canAccess:()=>true}});
  registerPracticeGraduatedFluencyExperiments(registry);
  for (const id of ["read-ahead","metronome-typing"]) {
    const resolved=registry.getResolvedExperiment(id);
    assert.equal(resolved.runnable,true,id);
    assert.equal(resolved.availability,"available",id);
    assert.equal(resolved.registration.descriptor.category,"fluency",id);
    assert.deepEqual(resolved.registration.descriptor.supportedCompletionModes,["duration"],id);
    assert.equal(resolved.registration.descriptor.resumable,false,id);
  }
});

test("Phase 6 graduated public fluency copy no longer presents these drills as experiments", () => {
  for (const id of ["read-ahead","metronome-typing"]) {
    const entry=PRACTICE_EXPERIMENT_CATALOG.find(item=>item.id===id);
    assert.doesNotMatch(`${entry.description} ${entry.longDescription}`,/\bexperiment\b/i,id);
  }
});
