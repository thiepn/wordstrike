import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayerDocument, mergePlayerDocuments, projectPlayerModes, projectPlayerSave, stableProfileJSON, writePlayerModes, writePlayerSave } from '../js/playerProfileDocument.js';
import { createPlayerPersistence, PLAYER_PROFILE_PREFIX } from '../js/playerPersistence.js';
import { createPlayerCloudSync } from '../js/playerCloudSync.js';
import { createDefaultModeData } from '../js/modeStorageV2.js';
const clone = v => JSON.parse(JSON.stringify(v));
function memoryStorage() {
  const data = new Map();
  return { data, getItem:k => data.get(k) ?? null, setItem:(k,v) => data.set(k, String(v)), removeItem:k => data.delete(k) };
}
function completed(modes, id = 'run-1', wpm = 75) {
  const next = clone(modes);
  next.totals.completedSessions++;
  next.totals.activePlaytimeMs += 60000;
  next.lifetime.finalizedSessions++;
  next.lifetime.activePlaytimeMs += 60000;
  next.modes['speed-test'].completedSessions++;
  next.modes['speed-test'].activity.trackedSessions++;
  next.recentSessions = [{ sessionId: id, modeId:'speed-test', endedAt:1000, wpm }, ...next.recentSessions];
  next.recordedSessionIds = [id, ...next.recordedSessionIds];
  return next;
}
const seed = () => createPlayerDocument({ campaignFurthestLevel:1, levels:{}, settings:{ theme:'dark', typingTest:{ textSize:'auto' } } }, createDefaultModeData());
async function storeWith(owner='user-a', storage=memoryStorage(), actor='writer-a') {
  const store = createPlayerPersistence({ storage, actor, indexedDB:null, channelFactory:()=>null });
  await store.initialize({ initialOwner:owner, legacySave:{campaignFurthestLevel:1,levels:{},settings:{}}, legacyModes:createDefaultModeData() });
  return store;
}
function addRun(store, id) {
  const data = projectPlayerModes(store.getDocument());
  store.getStorage().setItem('wordstrike_mode_data_v2', JSON.stringify(completed(data, id)));
}
test('concurrent offline devices retain both runs; retries are idempotent, commutative and associative', () => {
  const base=seed();
  const a=writePlayerModes(base,completed(projectPlayerModes(base),'a'),'A',{now:100});
  const b=writePlayerModes(base,completed(projectPlayerModes(base),'b'),'B',{now:101});
  const c=writePlayerModes(base,completed(projectPlayerModes(base),'c'),'C',{now:102});
  const ab=mergePlayerDocuments(a,b);
  assert.equal(projectPlayerModes(ab).totals.completedSessions,2);
  assert.equal(projectPlayerModes(mergePlayerDocuments(ab,a)).totals.completedSessions,2);
  assert.equal(stableProfileJSON(ab),stableProfileJSON(mergePlayerDocuments(b,a)));
  assert.equal(stableProfileJSON(mergePlayerDocuments(ab,c)),stableProfileJSON(mergePlayerDocuments(a,mergePlayerDocuments(b,c))));
  assert.equal(projectPlayerModes(mergePlayerDocuments(ab,c)).totals.activePlaytimeMs,180000);
});
test('campaign high-water marks and each record survive stale cloud snapshots', () => {
  const base=seed();
  const a=writePlayerSave(base,{campaignFurthestLevel:4,levels:{3:{bestAccuracy:98,bestWPM:90,bestScore:400}}},'A',{now:1});
  const b=writePlayerSave(base,{campaignFurthestLevel:2,levels:{1:{bestAccuracy:100,bestWPM:65,bestScore:300}}},'B',{now:2});
  const result=projectPlayerSave(mergePlayerDocuments(a,b));
  assert.equal(result.campaignFurthestLevel,4);assert.equal(Object.keys(result.levels).length,2);
});
test('an explicit reset dominates older cloud/backup progress without erasing appearance', () => {
  const old=writePlayerSave(seed(),{campaignFurthestLevel:31,levels:{30:{bossCleared:true}},settings:{theme:'light'}},'A',{now:10});
  const reset=writePlayerSave(old,{campaignFurthestLevel:1,levels:{},settings:{theme:'light'}},'A',{now:20,reset:true});
  const result=projectPlayerSave(mergePlayerDocuments(old,reset));
  assert.equal(result.campaignFurthestLevel,1);assert.deepEqual(result.levels,{});assert.equal(result.settings.theme,'light');
});
test('placement survives word-set migration and score-history trimming', () => {
  const modes=createDefaultModeData();
  modes.modes['speed-test'].wordSetRecords.retired={'time-60':{bestWpm:88}};
  const before=createPlayerDocument({},modes);
  const after=writePlayerModes(before,createDefaultModeData(),'A',{now:2});
  assert.equal(after.placementWpm,88);
});
test('fresh-device defaults cannot overwrite a real cloud preference or display name', () => {
  const remote=writePlayerSave(seed(),{levels:{},settings:{theme:'light',typingTest:{textSize:'large'}}},'A',{now:100});
  const fresh=writePlayerSave(createPlayerDocument(),projectPlayerSave(seed()),'B',{now:200});
  const merged=projectPlayerSave(mergePlayerDocuments(remote,fresh));
  assert.equal(merged.settings.theme,'light');assert.equal(merged.settings.typingTest.textSize,'large');
});
test('reloading restores local account progress and profile counters', async () => {
  const storage=memoryStorage(), first=await storeWith('user-a',storage);
  addRun(first,'one');
  first.getStorage().setItem('wordstrike_save',JSON.stringify({campaignFurthestLevel:12,levels:{11:{bestAccuracy:100}},settings:{}}));
  const second=await storeWith('user-a',storage,'writer-b');
  assert.equal(projectPlayerSave(second.getDocument()).campaignFurthestLevel,12);
  assert.equal(projectPlayerModes(second.getDocument()).totals.completedSessions,1);
});
test('guest adoption is one-way; logout and account switching do not leak profile data', async () => {
  const storage=memoryStorage(), store=await storeWith('guest',storage);
  addRun(store,'guest-run');
  await store.selectOwner('user-a');assert.equal(projectPlayerModes(store.getDocument()).totals.completedSessions,1);
  await store.selectOwner('user-b');assert.equal(projectPlayerModes(store.getDocument()).totals?.completedSessions ?? 0,0);
  await store.selectOwner(null);assert.equal(projectPlayerModes(store.getDocument()).totals?.completedSessions ?? 0,0);
  await store.selectOwner('user-a');assert.equal(projectPlayerModes(store.getDocument()).totals.completedSessions,1);
});
test('a stale guest tab cannot import progress already adopted by a different account', async () => {
  const storage=memoryStorage(), first=await storeWith('guest',storage,'one');
  addRun(first,'guest-run');
  const stale=await storeWith('guest',storage,'two');
  await first.selectOwner('user-a');
  await stale.selectOwner('user-b');
  assert.equal(projectPlayerModes(stale.getDocument()).totals?.completedSessions ?? 0,0);
});
test('blocked storage reports failure but does not erase the current in-memory run', async () => {
  const storage=memoryStorage();storage.setItem=()=>{throw new Error('blocked');};
  const store=await storeWith('user-a',storage);
  assert.throws(()=>addRun(store,'offline'),/Storage unavailable/);
  assert.equal(projectPlayerModes(store.getDocument()).totals.completedSessions,1);
  assert.equal(store.getStatus().localStatus,'error');
});
test('repeated normalization/backup reads do not continuously dirty the profile', async () => {
  const store=await storeWith();const storage=store.getStorage();
  storage.setItem('wordstrike_save',JSON.stringify({campaignFurthestLevel:3,levels:{},settings:{theme:'dark'}}));
  const before=stableProfileJSON(store.getDocument());
  for(let i=0;i<20;i++) {
    storage.setItem('wordstrike_save',storage.getItem('wordstrike_save'));
    storage.setItem('wordstrike_campaign_progress_v1',storage.getItem('wordstrike_campaign_progress_v1'));
  }
  assert.equal(stableProfileJSON(store.getDocument()),before);
});
function fakeCloud() {
  const rows=new Map(), calls=[];
  let lostAck=false, beforeWrite=null, pendingRead=null;
  return {
    rows,calls, loseNextAck(){lostAck=true;}, beforeNextWrite(fn){beforeWrite=fn;}, delayNextRead(promise){pendingRead=promise;},
    from(table) {
      let action='read',payload=null;const filters={};
      const builder={
        select(){return builder;},eq(k,v){filters[k]=v;return builder;},update(value){action='update';payload=value;return builder;},insert(value){action='insert';payload=value;return builder;},
        async maybeSingle() {
          const id=filters.user_id??payload?.user_id;
          calls.push({action,id,table});
          if(action==='read') { const response={data:clone(rows.get(id)??null),error:null}; if(pendingRead){const p=pendingRead;pendingRead=null;await p;} return response; }
          if(beforeWrite){const fn=beforeWrite;beforeWrite=null;await fn();}
          const old=rows.get(id);
          if(action==='insert'&&old)return {data:null,error:{code:'23505'}};
          if(action==='update'&&old?.revision!==filters.revision)return {data:null,error:null};
          rows.set(id,{revision:payload.revision,data:clone(payload.data)});
          if(lostAck){lostAck=false;return {data:null,error:{message:'network lost after commit'}};}
          return {data:{revision:payload.revision},error:null};
        },
      };return builder;
    },
  };
}
function makeSync(store,cloud,statuses=[]) {
  return createPlayerCloudSync({store,getClient:()=>cloud,schedule:()=>0,cancel:()=>{},onStatus:s=>statuses.push(s)});
}
test('cloud acknowledgement lost after commit does not duplicate a score on retry', async () => {
  const store=await storeWith(),cloud=fakeCloud(),sync=makeSync(store,cloud);
  addRun(store,'run');await sync.setAuthState({status:'signed-in',user:{id:'user-a'}});
  cloud.loseNextAck();assert.equal(await sync.sync(),false);assert.equal(await sync.sync(),true);
  assert.equal(projectPlayerModes(cloud.rows.get('user-a').data).totals.completedSessions,1);sync.stop();
});
test('a revision conflict merges another device instead of overwriting its run', async () => {
  const store=await storeWith(),cloud=fakeCloud(),sync=makeSync(store,cloud);
  const other=writePlayerModes(store.getDocument(),completed(projectPlayerModes(store.getDocument()),'remote'),'B',{now:1});
  addRun(store,'local');await sync.setAuthState({status:'signed-in',user:{id:'user-a'}});
  cloud.beforeNextWrite(()=>cloud.rows.set('user-a',{revision:1,data:other}));
  assert.equal(await sync.sync(),true);
  assert.equal(projectPlayerModes(cloud.rows.get('user-a').data).totals.completedSessions,2);sync.stop();
});
test('a run completed during cloud upload remains pending and is saved next', async () => {
  const store=await storeWith(),cloud=fakeCloud(),states=[],sync=makeSync(store,cloud,states);
  addRun(store,'first');await sync.setAuthState({status:'signed-in',user:{id:'user-a'}});
  cloud.beforeNextWrite(()=>addRun(store,'second'));
  assert.equal(await sync.sync(),true);assert.equal(projectPlayerModes(store.getDocument()).totals.completedSessions,2);
  assert.equal(states.at(-1),'pending');assert.equal(await sync.sync(),true);
  assert.equal(projectPlayerModes(cloud.rows.get('user-a').data).totals.completedSessions,2);sync.stop();
});
test('an in-flight account A response cannot write into account B', async () => {
  const store=await storeWith(),cloud=fakeCloud(),sync=makeSync(store,cloud);
  addRun(store,'A');await sync.setAuthState({status:'signed-in',user:{id:'user-a'}});
  let release;cloud.delayNextRead(new Promise(r=>release=r));const pending=sync.sync();
  await sync.setAuthState({status:'signed-in',user:{id:'user-b'}});release();await pending;
  assert.equal(cloud.calls.filter(c=>c.action!=='read').length,0);
  await sync.sync();assert.equal(projectPlayerModes(cloud.rows.get('user-b').data).totals?.completedSessions??0,0);sync.stop();
});
