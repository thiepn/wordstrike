import { PRACTICE_MANIFEST_KEY, PRACTICE_MANIFEST_BACKUP_KEY, PRACTICE_LIMITS } from './practiceConstants.js';
import { migratePracticeManifest, migratePracticeRecord } from './practiceMigrations.js';
import { validatePracticeManifest } from './practiceValidation.js';
import { clonePracticeValue, isQuotaExceededError, PRACTICE_STORAGE_ERROR_CODES as C, practiceStorageError } from './practiceStorageContract.js';

// Existing IndexedDB meta store; no database reset or schema bump is needed.
export const PRACTICE_DURABLE_MANIFEST_KEY = 'practiceManifest';
const fail = (message, cause = null) => practiceStorageError(C.RECOVERY_REQUIRED, message, {operation:'manifest-initialize',storeName:'meta',recoverable:true,cause});
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const copy = clonePracticeValue;
function checked(value) {
  const result = migratePracticeManifest(value);
  if (!result.ok) throw fail('Stored Practice manifest could not be validated', result.error);
  return result.value;
}
function assertBounded(manifest) {
  const validation=validatePracticeManifest(manifest);
  if (!validation.valid) throw practiceStorageError(C.VALIDATION_FAILED,'Practice manifest failed validation',{operation:'manifest-write',cause:validation.errors});
  if (new TextEncoder().encode(JSON.stringify(manifest)).byteLength>PRACTICE_LIMITS.manifestBytes) throw practiceStorageError(C.LIMIT_REACHED,'Practice manifest exceeds its size limit',{operation:'manifest-write'});
}

/** Async durable metadata with a synchronous hydrated read API.
 * IndexedDB becomes authoritative after a one-time import. localStorage is only
 * a compatibility mirror; its independent quota cannot block Practice saves.
 */
export function withDurablePracticeManifest({legacy,storage,createDefault,defaultOptions={}}) {
  let store=null, loaded=null, pending=null;
  function source() {
    let corrupt=false;
    for (const key of [PRACTICE_MANIFEST_KEY,PRACTICE_MANIFEST_BACKUP_KEY]) {
      let raw;
      try { raw=storage?.getItem?.(key); } catch { continue; }
      if (!raw) continue;
      try {
        const parsed=JSON.parse(raw), result=migratePracticeManifest(parsed);
        if(result.ok)return {manifest:result.value,recovery:key===PRACTICE_MANIFEST_KEY?'none':'backup'};
        if(result.error?.code===C.UNSUPPORTED_VERSION)throw result.error;
        corrupt=true;
      } catch(e) { if(e?.code===C.UNSUPPORTED_VERSION)throw e;corrupt=true; }
    }
    return {manifest:null,recovery:corrupt?'defaults-after-corruption':'created'};
  }
  function mirror(manifest) {
    try {
      if(storage?.getItem?.(PRACTICE_MANIFEST_KEY)!==JSON.stringify(manifest))legacy.save(manifest);
      return null;
    }
    catch(error) { return isQuotaExceededError(error)?'localstorage-full':'localstorage-unavailable'; }
  }
  function adopt(manifest,recovery,warning=null) {
    loaded={ok:true,manifest:copy(manifest),recovery,backend:'indexeddb',mirrorWarning:warning};
    return copy(loaded);
  }
  async function initialize(dataStore) {
    if(pending)return pending;
    if(!dataStore?.runTransaction)throw new TypeError('Durable Practice metadata requires transactional storage');
    store=dataStore;
    pending=(async()=>{
      await store.open();
      const outcome=await store.runTransaction(['meta','profiles'],'readwrite',async tx=>{
        const existing=await tx.get('meta',PRACTICE_DURABLE_MANIFEST_KEY);
        if(existing){
          if(existing.formatVersion!==1)throw fail('Unsupported durable Practice manifest version');
          const manifest=checked(existing.manifest);
          if(!same(manifest,existing.manifest))await tx.put('meta',{...existing,manifest});
          return {manifest,recovery:'durable'};
        }
        const imported=source();
        let manifest=imported.manifest;
        if(!manifest){
          const candidates=(await tx.list('profiles')).map(p=>migratePracticeRecord('profile',p)).filter(r=>r.ok).map(r=>r.value);
          if(candidates.length>1)throw fail('Multiple Practice profiles exist without an active manifest; automatic profile selection was stopped');
          const profile=candidates[0];
          manifest=createDefault({...defaultOptions,...(profile?{profileId:profile.profileId,settings:{...defaultOptions.settings,keyboardLayout:profile.keyboardLayout}}:{}),overrides:{...defaultOptions.overrides,storageHealth:imported.recovery==='defaults-after-corruption'?'recovery-required':'healthy'}});
          manifest=checked(manifest);
        }
        assertBounded(manifest);
        await tx.put('meta',{key:PRACTICE_DURABLE_MANIFEST_KEY,formatVersion:1,manifest});
        return {manifest,recovery:imported.recovery};
      });
      return adopt(outcome.manifest,outcome.recovery,mirror(outcome.manifest));
    })().finally(()=>{pending=null;});
    return pending;
  }
  async function saveDurable(manifest) {
    if(!store || !loaded)return legacy.save(manifest);
    assertBounded(manifest);
    const before=copy(loaded.manifest);
    if(manifest.profileId!==before.profileId)throw fail('Practice profile identity cannot change during a metadata update');
    // Merge only fields changed by this writer so another tab's independent
    // settings update is not overwritten by a stale, full-manifest snapshot.
    const next=await store.runTransaction(['meta'],'readwrite',async tx=>{
      const record=await tx.get('meta',PRACTICE_DURABLE_MANIFEST_KEY);
      if(!record)throw fail('Practice metadata was reset in another tab; reopen Practice before saving');
      const latest=checked(record.manifest);
      if(latest.profileId!==before.profileId)throw fail('Active Practice profile changed in another tab');
      const merged=copy(latest);
      for(const key of Object.keys(manifest)){
        if(key==='settings'){
          for(const setting of Object.keys(manifest.settings))if(!same(manifest.settings[setting],before.settings[setting]))merged.settings[setting]=copy(manifest.settings[setting]);
        }else if(!same(manifest[key],before[key]))merged[key]=copy(manifest[key]);
      }
      assertBounded(merged);
      await tx.put('meta',{...record,manifest:merged});
      return merged;
    });
    return adopt(next,'durable',mirror(next));
  }
  return Object.freeze({
    ...legacy,
    get isDurable(){return Boolean(loaded && store);},
    load(){return loaded?copy(loaded):legacy.load();},
    initialize,
    saveDurable,
    async clearDurable(){if(store?.isOpen)await store.delete('meta',PRACTICE_DURABLE_MANIFEST_KEY);loaded=null;return legacy.clear();},
    clear(){loaded=null;return legacy.clear();},
  });
}
