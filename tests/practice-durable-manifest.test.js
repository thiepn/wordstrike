import test from 'node:test';
import assert from 'node:assert/strict';
import {createPracticeMemoryStore} from '../js/practiceLab/practiceMemoryStore.js';
import {createPracticeManifestStore} from '../js/practiceLab/practiceManifestStore.js';
import {createPracticeRepository} from '../js/practiceLab/practiceRepository.js';
import {createDefaultPracticeManifest,createDefaultPracticeProfile,createDefaultSessionSummary} from '../js/practiceLab/practiceDefaults.js';
import {createPracticeCoachPlanRecord} from '../js/practiceLab/practiceCoachPlan.js';
import {PRACTICE_MANIFEST_KEY,PRACTICE_MANIFEST_BACKUP_KEY} from '../js/practiceLab/practiceConstants.js';
import {PRACTICE_DURABLE_MANIFEST_KEY as KEY} from '../js/practiceLab/practiceDurableManifest.js';
import {setPracticePhysicalTelemetryEnabled} from '../js/practiceLab/practicePhysicalTelemetrySettings.js';
import {isQuotaExceededError} from '../js/practiceLab/practiceStorageContract.js';
const now=()=>new Date('2026-09-19T20:00:00Z');
const profileId='practice-profile_durable-test-12345678';
function quotaStorage(entries=[]){const values=new Map([['another-app','must survive'],...entries]);return {values,getItem:k=>values.get(k)??null,setItem(){throw new DOMException('full','QuotaExceededError');},removeItem:k=>values.delete(k)};}
function setup(storage=quotaStorage(),dataStore=createPracticeMemoryStore()){
 const manifestStore=createPracticeManifestStore({storage,defaultOptions:{now}});
 const repository=createPracticeRepository({dataStore,manifestStore,now});return {manifestStore,repository,dataStore,storage};
}
test('Practice initialization succeeds when accessing global localStorage itself throws',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new DOMException('blocked','SecurityError');}});
 try{
  const dataStore=createPracticeMemoryStore();
  const manifestStore=createPracticeManifestStore({defaultOptions:{now}});
  const repository=createPracticeRepository({dataStore,manifestStore,now});
  const initialized=await repository.initializePracticeStorage();
  assert.ok(initialized.profile.profileId);
  assert.equal(manifestStore.load().backend,'indexeddb');
  assert.equal(manifestStore.load().mirrorWarning,'localstorage-unavailable');
  assert.equal((await dataStore.list('profiles')).length,1);
 }finally{
  if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);
  else delete globalThis.localStorage;
 }
});

test('first-ever Practice initialization succeeds without any writable localStorage and persists its identity',async()=>{
 const a=setup();const initial=await a.repository.initializePracticeStorage();
 assert.ok(initial.profile.profileId);assert.equal(a.manifestStore.load().mirrorWarning,'localstorage-full');
 const b=setup(a.storage,a.dataStore);const reopened=await b.repository.initializePracticeStorage();
 assert.equal(reopened.profile.profileId,initial.profile.profileId);
 assert.equal((await a.dataStore.list('profiles')).length,1);
 assert.equal((await a.dataStore.get('meta',KEY)).manifest.profileId,initial.profile.profileId);
 assert.equal(a.storage.values.get('another-app'),'must survive');
});
test('legacy primary and backup are imported without discarding preferences or changing the profile',async()=>{
 for(const backup of [false,true]){
  const original=createDefaultPracticeManifest({profileId,now,settings:{dailySessionLengthMinutes:15,keyboardLayout:'qwertz'},overrides:{databaseVersion:12}});
  const storage=quotaStorage([[backup?PRACTICE_MANIFEST_BACKUP_KEY:PRACTICE_MANIFEST_KEY,JSON.stringify(original)]]);
  const a=setup(storage);const before=[...storage.values];const initial=await a.repository.initializePracticeStorage();
  assert.equal(initial.profile.profileId,profileId);assert.equal(initial.manifest.settings.dailySessionLengthMinutes,15);
  assert.equal(initial.manifest.settings.keyboardLayout,'qwertz');assert.deepEqual([...storage.values],before);
 }
});
test('missing local manifest recovers a single existing profile instead of creating a blank one',async()=>{
 const profile=createDefaultPracticeProfile({profileId,now});profile.totalCompletedSessions=12;
 const dataStore=createPracticeMemoryStore({initialData:{profiles:[profile]}});const a=setup(quotaStorage(),dataStore);
 const result=await a.repository.initializePracticeStorage();assert.equal(result.profile.profileId,profileId);assert.equal(result.profile.totalCompletedSessions,12);
});
test('ambiguous profile recovery stops safely without resetting either profile',async()=>{
 const profiles=[profileId,'practice-profile_other-user-12345678'].map(profileId=>createDefaultPracticeProfile({profileId,now}));
 const a=setup(quotaStorage(),createPracticeMemoryStore({initialData:{profiles}}));
 await assert.rejects(a.repository.initializePracticeStorage(),e=>e.code==='PRACTICE_STORAGE_RECOVERY_REQUIRED');
 assert.deepEqual(await a.dataStore.list('profiles'),profiles);assert.equal(await a.dataStore.get('meta',KEY),null);
});
test('preferences, privacy toggles and completion metadata remain durable when localStorage is full',async()=>{
 const a=setup();const initial=await a.repository.initializePracticeStorage();
 await a.repository.savePracticeSettings({...a.repository.getPracticeSettings(),dailySessionLengthMinutes:5});
 await setPracticePhysicalTelemetryEnabled(a.manifestStore,true);
 const b=setup(a.storage,a.dataStore);await b.repository.initializePracticeStorage();
 assert.equal(b.repository.getPracticeSettings().dailySessionLengthMinutes,5);
 assert.equal(b.repository.getPracticeSettings().physicalKeyboardTelemetryEnabled,true);
 await setPracticePhysicalTelemetryEnabled(b.manifestStore,false);
 const summary=createDefaultSessionSummary({profileId:initial.profile.profileId,contextId:initial.context.contextId,now});
 const result=await b.repository.commitCompletedPracticeSession({sessionSummary:summary,clearCheckpoint:false});
 assert.equal(result.committed,true);assert.equal(result.manifestUpdated,true);
 assert.equal((await b.dataStore.list('sessionSummaries')).length,1);
 const c=setup(a.storage,a.dataStore);await c.repository.initializePracticeStorage();
 assert.equal(c.repository.getPracticeSettings().physicalKeyboardTelemetryEnabled,false);
 assert.equal(c.manifestStore.load().manifest.lastCompletedSessionAt,summary.completedAtUtc);
});
test('simultaneous initializers share one profile and one frozen daily plan',async()=>{
 const storage=quotaStorage(),dataStore=createPracticeMemoryStore();const a=setup(storage,dataStore),b=setup(storage,dataStore);
 const [one,two]=await Promise.all([a.repository.initializePracticeStorage(),b.repository.initializePracticeStorage()]);
 assert.equal(one.profile.profileId,two.profile.profileId);assert.equal((await dataStore.list('profiles')).length,1);
 const plan=minutes=>createPracticeCoachPlanRecord({profileId:one.profile.profileId,contextId:one.context.contextId,requestedMinutes:minutes,localDayKey:'2026-09-19',inputFingerprint:String(minutes),blocks:[],now});
 const outcomes=await Promise.all([a.repository.createCoachPlan(plan(5)),b.repository.createCoachPlan(plan(15))]);
 assert.equal(outcomes.filter(r=>r.created).length,1);assert.equal(outcomes[0].plan.planHash,outcomes[1].plan.planHash);
});
test('independent metadata edits from two writers are merged instead of overwriting each other',async()=>{
 const a=setup();await a.repository.initializePracticeStorage();const b=setup(a.storage,a.dataStore);await b.repository.initializePracticeStorage();
 const av=a.manifestStore.load().manifest,bv=b.manifestStore.load().manifest;
 await a.manifestStore.saveDurable({...av,settings:{...av.settings,dailySessionLengthMinutes:8}});
 await b.manifestStore.saveDurable({...bv,settings:{...bv.settings,soundEnabled:true}});
 const c=setup(a.storage,a.dataStore);const current=await c.repository.initializePracticeStorage();
 assert.equal(current.manifest.settings.dailySessionLengthMinutes,8);assert.equal(current.manifest.settings.soundEnabled,true);
});
test('explicit full wipe stops before deleting canonical Practice data when the legacy mirror cannot be cleared',async()=>{
 let blockRemove=false;
 const values=new Map();
 const storage={
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem(key){if(blockRemove)throw new DOMException('blocked','SecurityError');values.delete(key);},
 };
 const a=setup(storage);const initial=await a.repository.initializePracticeStorage();
 assert.equal((await a.dataStore.list('profiles')).length,1);
 assert.ok(await a.dataStore.get('meta',KEY));
 blockRemove=true;
 await assert.rejects(a.repository.resetPracticeData({deleteUserContent:true}),error=>error?.name==='SecurityError');
 assert.equal((await a.dataStore.list('profiles')).length,1,'failed reset must not delete the profile');
 assert.equal((await a.dataStore.list('contexts')).length,1,'failed reset must not delete the active context');
 assert.ok(await a.dataStore.get('meta',KEY),'failed reset must keep durable metadata');
 assert.equal(a.manifestStore.load().manifest.profileId,initial.profile.profileId);
});

test('explicit full wipe clears IndexedDB atomically and rolls back every store if one clear fails',async()=>{
 const storageValues=new Map();
 const storage={
  getItem:key=>storageValues.get(key)??null,
  setItem:(key,value)=>storageValues.set(key,String(value)),
  removeItem:key=>storageValues.delete(key),
 };
 const native=createPracticeMemoryStore();
 let failReset=false,clearCount=0;
 const dataStore={
  ...native,
  runTransaction(names,mode,callback){
   return native.runTransaction(names,mode,async transaction=>{
    const wrapped={...transaction,async clearStore(name){
     const result=await transaction.clearStore(name);
     clearCount+=1;
     if(failReset&&clearCount===2)throw new Error('simulated reset failure');
     return result;
    }};
    return callback(wrapped);
   });
  },
 };
 const a=setup(storage,dataStore);const initial=await a.repository.initializePracticeStorage();
 const summary=createDefaultSessionSummary({profileId:initial.profile.profileId,contextId:initial.context.contextId,now});
 await a.repository.commitCompletedPracticeSession({sessionSummary:summary,clearCheckpoint:false});
 assert.equal((await native.list('sessionSummaries')).length,1);
 failReset=true;clearCount=0;
 await assert.rejects(a.repository.resetPracticeData({deleteUserContent:true}),error=>error?.code==='PRACTICE_STORAGE_TRANSACTION_FAILED');
 assert.equal((await native.list('profiles')).length,1,'profile must roll back with the reset transaction');
 assert.equal((await native.list('contexts')).length,1,'context must roll back with the reset transaction');
 assert.equal((await native.list('sessionSummaries')).length,1,'history must roll back with the reset transaction');
 assert.ok(await native.get('meta',KEY),'durable manifest must roll back with the reset transaction');
 assert.equal(a.manifestStore.load().manifest.profileId,initial.profile.profileId);
});

test('successful explicit full wipe clears all Practice stores and its legacy mirror together',async()=>{
 const values=new Map();
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 const a=setup(storage);await a.repository.initializePracticeStorage();
 assert.ok(values.has(PRACTICE_MANIFEST_KEY));
 await a.repository.resetPracticeData({deleteUserContent:true});
 for(const storeName of ['profiles','contexts','sessionSummaries','reviewItems','skillStats','meta'])assert.equal((await a.dataStore.list(storeName)).length,0,storeName);
 assert.equal(values.has(PRACTICE_MANIFEST_KEY),false);
 assert.equal(values.has(PRACTICE_MANIFEST_BACKUP_KEY),false);
 assert.equal(a.manifestStore.isDurable,false);
});

test('failed durable write is reported and never advances the hydrated saved state',async()=>{
 const a=setup();await a.repository.initializePracticeStorage();const previous=a.manifestStore.load();
 const native=a.dataStore;let rejectWrites=false;
 const dataStore={...native,runTransaction(...args){if(rejectWrites)return Promise.reject(new DOMException('disk full','QuotaExceededError'));return native.runTransaction(...args);}};
 await a.manifestStore.initialize(dataStore);rejectWrites=true;
 await assert.rejects(a.manifestStore.saveDurable({...previous.manifest,settings:{...previous.manifest.settings,dailySessionLengthMinutes:15}}),isQuotaExceededError);
 assert.equal(a.manifestStore.load().manifest.settings.dailySessionLengthMinutes,previous.manifest.settings.dailySessionLengthMinutes);
 assert.equal((await native.get('meta',KEY)).manifest.settings.dailySessionLengthMinutes,previous.manifest.settings.dailySessionLengthMinutes);
});
test('quota classification follows nested causes and terminates on cycles',()=>{
 const cause=new DOMException('full','QuotaExceededError');assert.equal(isQuotaExceededError(new Error('wrapped',{cause})),true);
 const circular={};circular.cause=circular;assert.equal(isQuotaExceededError(circular),false);
});
