import { bindPracticeAssessmentInput } from "./practiceAssessmentInput.js";
import { createPracticeSegmenter } from "./practiceTextSegmentation.js";
import { wirePracticeKeyboardCorrections } from "./practiceHostDom.js";
import { createPracticeSessionPulse } from './practiceSessionPulse.js';
import { createPracticeSessionEngine } from './practiceSessionEngine.js';
import { createPracticeSessionId } from './practiceIds.js';
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountPracticeAssessmentSession({root,runtime,run,onExit=()=>{},engineFactory=createPracticeSessionEngine}={}) {
  wirePracticeKeyboardCorrections(root);
  let engine=null,unsubscribe=null,timer=null,closed=false,busy=false,prepared=null,preparedChars=[],completing=false,inputBinding=null;
  const disposeEngine=async()=>{inputBinding?.dispose();inputBinding=null;timer?.stop();timer=null;unsubscribe?.();unsubscribe=null;await engine?.destroy();engine=null;};
  const focus=selector=>root.querySelector(selector)?.focus({preventScroll:true});
  const shell=body=>{root.innerHTML=`<section class="screen practice-lab-screen" data-practice-view="assessment-session"><div class="practice-lab-shell"><header class="practice-lab-header"><h1>Full Assessment</h1><button type="button" data-assessment-action="exit">END ASSESSMENT</button></header><main>${body}</main></div></section>`;};
  const between=()=>{const block=run.plan.blocks[run.progress.currentBlockIndex];shell(`<h2>${esc(block?.displayName??block?.blockId??'Assessment finished')}</h2><p>${run.blocks.filter(b=>b.status==='completed').length} of ${run.blocks.length} blocks completed.</p><p>Type naturally. Timing begins on your first key. Leaving a measurement ends that block.</p><button type="button" data-assessment-action="next">START NEXT BLOCK</button>`);focus('[data-assessment-action="next"]');};
  const fail=error=>{inputBinding?.dispose();inputBinding=null;timer?.stop();shell(`<h2>Assessment could not continue</h2><p role="alert">${esc(error.message)}</p><p>Your completed blocks remain saved.</p>`);focus('[data-assessment-action="exit"]');};
  const update=snapshot=>{
    const target=root.querySelector('[data-assessment-text]');if(!target)return;
    const cursor=snapshot.cursorIndex??0, start=Math.max(0,cursor-100), errors=new Set(snapshot.errorPositions??[]);
    const signature=JSON.stringify([cursor,[...errors]]);
    if(target.dataset.render!==signature){
      target.dataset.cursor=String(cursor);target.dataset.render=signature;
      target.innerHTML=preparedChars.slice(start,cursor+400).map((c,i)=>{
        const position=i+start;
        const state=position===cursor?'is-current':position<cursor?(errors.has(position)?'is-error':'is-typed'):'';
        return `<span class="practice-real-text-char ${state}"${position===cursor?' aria-current="true"':''}>${esc(c)}</span>`;
      }).join('');
    }
    root.querySelector('[data-assessment-time]').textContent=`${Math.ceil(Math.max(0,prepared.block.durationMs-(snapshot.timing?.activeDurationMs??0))/1000)} s remaining`;
  };
  const complete=async()=>{if(completing||closed)return;completing=true;try{await engine.complete();await disposeEngine();run=await runtime.repository.getAssessmentRun(run.assessmentRunId);if(run.blocks.every(b=>['completed','invalid'].includes(b.status))){run=(await runtime.service.finalizeAssessment(run.assessmentRunId)).run;shell(`<h2>Assessment complete</h2><p>${run.blocks.filter(b=>b.status==='completed').length} of ${run.blocks.length} blocks completed.</p><p>Results and coverage are saved locally. Open Skill Map and Progress to inspect your evidence.</p><button type="button" data-assessment-action="finish">VIEW RESULTS</button>`);focus('[data-assessment-action="finish"]');}else between();}catch(error){fail(error);}finally{completing=false;}};
  const next=async()=>{if(busy||engine||closed)return;busy=true;try{const sessionId=createPracticeSessionId();prepared=await runtime.service.prepareNextBlock({assessmentRunId:run.assessmentRunId,sessionId});if(closed)return;preparedChars=createPracticeSegmenter()(prepared.contentPlan.text);engine=engineFactory({repository:runtime.repository,sessionId,profileId:runtime.scope.profileId,contextId:runtime.scope.contextId});await engine.prepare({experiment:prepared.descriptor,configuration:prepared.configuration,contentPlan:prepared.contentPlan,evaluationPlan:prepared.evaluationPlan,evaluationArtifact:prepared.evaluationArtifact});if(closed){await disposeEngine();return;}shell(`<h2>${esc(prepared.block.displayName??prepared.block.blockId)}</h2><p data-assessment-time></p><div data-assessment-text class="practice-real-text-typing" role="region" aria-label="Assessment passage" style="white-space:pre-wrap"></div><p id="assessment-input-help">Click the passage or the field below and type. Your typing is shown in the passage; Backspace corrects mistakes.</p><label>Assessment typing input<textarea data-assessment-input class="practice-session-input" aria-describedby="assessment-input-help assessment-focus-status" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" rows="1" placeholder="Type here — follow the highlighted character above"></textarea></label><p id="assessment-focus-status" data-assessment-focus-status role="status" aria-live="polite"></p>`);unsubscribe=engine.subscribe((snapshot,event)=>{if(event==='completed')void complete();else update(snapshot);});update(await engine.start());timer=createPracticeSessionPulse({run:()=>engine.tick(),intervalMs:100,isActive:()=>Boolean(engine)&&!completing&&!closed,onError:fail});timer.start();
    inputBinding=bindPracticeAssessmentInput({
      input:root.querySelector('[data-assessment-input]'), passage:root.querySelector('[data-assessment-text]'),
      isActive:()=>Boolean(engine)&&!closed&&!completing,
      send:(type,value)=>engine.handleInput({type,value,source:'browser-input',monotonicTimestampMs:performance.now(),wallTimestampUtc:new Date().toISOString(),modifiers:{ctrl:false,meta:false,alt:false,shift:false}}),
      onFocusChange:focused=>{
        const status=root.querySelector('[data-assessment-focus-status]');
        if(status)status.textContent=focused?'Ready for typing.':engine?.getSnapshot?.().cursorIndex>0?'Click the passage or typing field to continue. The assessment timer keeps running.':'Click the passage or typing field to begin.';
      },
    });
    inputBinding.focus();}catch(error){await disposeEngine();fail(error);}finally{busy=false;}};

  const exit=async()=>{if(closed)return;closed=true;root.removeEventListener('click',click);inputBinding?.dispose();inputBinding=null;document.removeEventListener('visibilitychange',visibility);try{if(engine)await engine.abandon('manual-stop');await disposeEngine();if(run.status==='active')run=await runtime.service.abandonAssessment(run.assessmentRunId);}finally{onExit(run);}};
  const click=event=>{const action=event.target.closest?.('[data-assessment-action]')?.dataset.assessmentAction;if(!action)return;event.stopPropagation();if(action==='next')void next();else void exit();};
  const visibility=()=>{if(document.visibilityState==='hidden'&&engine)void exit();};
  root.addEventListener('click',click);document.addEventListener('visibilitychange',visibility);between();return {exit};
}
