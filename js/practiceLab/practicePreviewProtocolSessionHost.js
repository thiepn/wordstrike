import {createPracticeIndexedDbStore} from './practiceIndexedDbStore.js';
import {createPracticeManifestStore} from './practiceManifestStore.js';
import {createPracticeRepository} from './practiceRepository.js';
import {createPracticeSessionEngine} from './practiceSessionEngine.js';
import {createPracticeSessionPulse} from './practiceSessionPulse.js';
import {preparePracticePreviewProtocol} from './practicePreviewProtocolRuntime.js';
import {getPracticeReadAheadVisibilityEnvelope} from './practiceReadAheadVisibility.js';

export async function mountPracticePreviewProtocolSession({root,experimentId,durationMs,onExit=()=>{}}){
  const dataStore=createPracticeIndexedDbStore(),repository=createPracticeRepository({dataStore,manifestStore:createPracticeManifestStore()});let engine=null,pulse=null,unsubscribe=null,closed=false,finished=false,countIn=null,counted=false,prepared=null;
  const doc=root.ownerDocument,node=(tag,text)=>{const e=doc.createElement(tag);if(text)e.textContent=text;return e;};
  async function exit(){if(closed)return;closed=true;pulse?.stop();unsubscribe?.();doc.removeEventListener('visibilitychange',visibility);let error=null;try{if(['active','paused','ready'].includes(engine?.getSnapshot().lifecycleState))await engine.abandon('manual-stop');}catch(cause){error=cause;}finally{await engine?.destroy();dataStore.close();onExit({error});}}
  function visibility(){if(doc.visibilityState==='hidden')void exit();}
  try {
    const initialized=await repository.initializePracticeStorage();prepared=await preparePracticePreviewProtocol({experimentId,durationMs,context:initialized.context});
    engine=createPracticeSessionEngine({repository,sessionId:prepared.sessionId,profileId:initialized.profile.profileId,contextId:initialized.context.contextId});
    await engine.prepare({experiment:prepared.experiment,configuration:prepared.configuration,contentPlan:prepared.contentPlan});
    const section=node('section');section.className='screen practice-lab-screen';section.dataset.practiceView=experimentId+'-session';const main=node('main');main.className='practice-lab-shell practice-lab-detail';section.append(main);
    const title=node('h1',experimentId==='read-ahead'?'Read-Ahead':'Metronome'),stop=node('button','END SESSION');stop.type='button';stop.addEventListener('click',()=>void exit());
    const status=node('p');status.setAttribute('role','status');const remaining=node('p'),cue=node('p');cue.setAttribute('aria-hidden','true');cue.style.minHeight='2em';
    const passage=node('p');passage.dataset.protocolText='';passage.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:1.2rem/1.8 monospace;max-height:40vh;overflow:hidden';
    const label=node('label','Type the passage here'),input=node('textarea');input.dataset.protocolInput='';input.setAttribute('aria-label','Practice typing input');input.autocomplete='off';input.autocapitalize='off';input.spellcheck=false;input.style.cssText='width:100%;box-sizing:border-box;min-height:3em';label.append(input);
    main.append(title,stop,status,remaining,cue,passage,label);root.replaceChildren(section);
    let lastBlock=null,lastSecond=null,lastWindow=null;
    function paint(snapshot){if(closed||finished)return;const ms=snapshot.timing?.activeDurationMs??0,cursor=snapshot.cursorIndex??0,block=prepared.schedule.blocks.find(b=>ms>=b.startMs&&ms<b.endMs)??prepared.schedule.blocks.at(-1);
      if(block.blockId!==lastBlock){lastBlock=block.blockId;status.textContent=experimentId==='read-ahead'?(block.kind==='constrained'?`Preview: ${block.visibleFutureWords} future words`:`${block.kind}: unrestricted preview`):`${block.kind}: ${block.condition}`;}
      const seconds=Math.max(0,Math.ceil((durationMs-ms)/1000));if(seconds!==lastSecond){lastSecond=seconds;remaining.textContent=`${seconds} seconds remaining`;}
      if(cursor>=prepared.graphemes.length)prepared.accumulator.markContentExhausted(ms);
      const end=experimentId==='read-ahead'?getPracticeReadAheadVisibilityEnvelope({index:prepared.lexicalIndex,expectedIndex:cursor,visibleFutureWords:block.visibleFutureWords}).visibleEndIndex:prepared.graphemes.length;
      const from=Math.max(0,cursor-80),to=Math.min(end,cursor+400),key=`${cursor}:${from}:${to}`;
      if(key!==lastWindow){lastWindow=key;const fragment=doc.createDocumentFragment();for(let i=from;i<to;i++){const span=node('span',prepared.graphemes[i]);if(i===cursor){span.style.outline='2px solid currentColor';span.setAttribute('aria-current','true');}else if(i<cursor)span.style.opacity='.6';fragment.append(span);}passage.replaceChildren(fragment);}
    }
    input.addEventListener('beforeinput',e=>{e.preventDefault();if(closed||finished||countIn)return;const send=(type,value)=>engine.handleInput({type,value,source:'browser-input',monotonicTimestampMs:performance.now(),wallTimestampUtc:new Date().toISOString(),modifiers:{ctrl:false,meta:false,alt:false,shift:false}});if(['insertText','insertCompositionText'].includes(e.inputType)&&typeof e.data==='string')for(const c of Array.from(e.data.normalize('NFC')))send(c===' '?'space':'character',c);else if(e.inputType==='insertLineBreak')send('character','\n');else if(e.inputType==='deleteContentBackward')send('backspace','');input.value='';});
    unsubscribe=engine.subscribe((snapshot,event)=>{if(event==='completed'){finished=true;pulse?.stop();void engine.complete().then(result=>{if(closed)return;const analysis=result.summary?.trainingQuality;main.replaceChildren(node('h1','Session complete'),node('p',`Observed pattern: ${analysis?.pattern??'insufficient evidence'}`),node('p','This is a within-session descriptive association, not proof of improvement. Sparse or interrupted blocks do not support a conclusion.'),stop);const table=node('table'),head=node('tr');table.className='practice-protocol-results';for(const heading of ['Block','Effective WPM','First-pass accuracy','Valid'])head.append(node('th',heading));table.append(head);for(const block of analysis?.blocks??[]){const row=node('tr');for(const value of [block.blockId,Number.isFinite(block.adjustedEffectiveWpm??block.effectiveWpm)?(block.adjustedEffectiveWpm??block.effectiveWpm).toFixed(1):'—',Number.isFinite(block.firstPassAccuracy)?(100*block.firstPassAccuracy).toFixed(1)+'%':'—',block.valid?'Yes':'Insufficient'])row.append(node('td',value));table.append(row);}const scroll=node('div');scroll.className='practice-protocol-result-scroll';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Block results');scroll.append(table);main.insertBefore(scroll,stop);stop.textContent='BACK TO SETUP';stop.focus();}).catch(()=>{status.textContent='Saving failed. End the session and try again.';});}else paint(snapshot);});
    async function advance(){if(closed||finished)return;
      if(countIn){const beat=Math.floor((performance.now()-countIn.start)/(60000/countIn.bpm));if(beat>=4){countIn=null;cue.textContent='';input.disabled=false;await engine.resume();input.focus();}else cue.textContent=`Count-in ${beat+1} / 4`;return;}
      await engine.tick();if(finished||closed)return;const snapshot=engine.getSnapshot(),ms=snapshot.timing?.activeDurationMs??0;
      if(snapshot.completion?.state==='error')throw new Error('Session finalization failed');
      if(experimentId==='metronome-typing'&&ms>=prepared.schedule.blocks[0].endMs){let plan;try{plan=prepared.calibrate();}catch{await engine.pause('calibration-insufficient');pulse.stop();input.disabled=true;status.textContent='Not enough baseline typing for a supported rhythm. End this session and try again at your natural pace.';return;}
        const block=plan.blocks.find(b=>ms>=b.startMs&&ms<b.endMs);if(!counted&&block?.blockId===plan.countInBeforeBlockId){counted=true;await engine.pause('count-in');input.disabled=true;countIn={start:performance.now(),bpm:plan.tempo.bpm};return;}
        cue.textContent=block?.condition==='pulse'?`Beat ${1+Math.floor((ms-block.startMs)/(60000/plan.tempo.bpm))%4} · ${plan.tempo.bpm.toFixed(0)} BPM · ${plan.tempo.charsPerBeat} characters per beat`:'Silent — type naturally';
      }
      paint(snapshot);
    }
    pulse=createPracticeSessionPulse({run:advance,intervalMs:50,isActive:()=>!closed&&!finished,onError:async()=>{status.setAttribute('role','alert');status.textContent='Session interrupted. End the session and try again.';input.disabled=true;await engine.pause('protocol-error');}});
    doc.addEventListener('visibilitychange',visibility);paint(await engine.start());pulse.start();input.focus();
    return {exit,getSnapshot:()=>engine.getSnapshot()};
  }catch(error){await exit();throw error;}
}
