import { createPracticeLabController as createBase } from './practiceLabControllerRuntimeV38.js';
import { renderPracticeLabV38 } from './practiceLabRendererV38.js';
import { buildExperimentDetailViewModel } from './practiceLabViewModel.js';
import { loadPracticeEvidenceViews, renderPracticeEvidenceView } from './practiceEvidenceViews.js';
export function createPracticeLabController(options={}) {
  const {root}=options;let listening=false;const attach=()=>{if(!listening){root.addEventListener('click',click,true);listening=true;}};const detach=()=>{if(listening){root.removeEventListener('click',click,true);listening=false;}};let mounted=false,lastView=null,key=null,state={status:'loading'},epoch=0,runtime=null,runtimePromise=null,host=null,report=null;
  const ensureRuntime=()=>runtimePromise??=(import('./practiceAssessmentRuntime.js').then(m=>m.createPracticeAssessmentRuntime()).then(r=>{runtime=r;return r;}).catch(e=>{runtimePromise=null;throw e;}));
  function renderer(renderRoot,view,renderOptions={}) {
    if(host)return true;lastView=view;
    const current=['skill-map','review-queue','treatment-response-progress','full-assessment-detail'].includes(view.kind)?view.kind:null;
    if(current)attach();else detach();
    if(current!==key){key=current;epoch++;state={status:'loading'};if(current)queueMicrotask(()=>void load());}
    if(view.kind==='skill-map'||view.kind==='review-queue')return options.renderer ? options.renderer(renderRoot,{...view,evidence:state},renderOptions) : renderPracticeEvidenceView(renderRoot,view.kind,state,{focus:renderOptions.focusSelector!==null});
    if(view.kind==='full-assessment-detail'&&state.availability){const next=buildExperimentDetailViewModel({route:{params:{experimentId:'full-assessment'}},registry:options.experimentRegistry,assessmentAvailability:state.availability,assessmentReport:report});return (options.renderer??renderPracticeLabV38)(renderRoot,next,renderOptions);}
    const result=(options.renderer??renderPracticeLabV38)(renderRoot,view,renderOptions);
    if(view.kind==='treatment-response-progress') {const main=renderRoot.querySelector?.('main');if(main){const section=renderRoot.ownerDocument.createElement('section');section.setAttribute('data-practice-history','');main.prepend(section);renderPracticeEvidenceView(section,'history',state);}}
    if(view.kind==='full-assessment-detail'&&state.status==='error'){const alert=renderRoot.ownerDocument.createElement('p');alert.setAttribute('role','alert');alert.textContent='Assessment could not load. Return to Practice Lab and try again.';renderRoot.querySelector('main')?.append(alert);}
    return result;
  }
  const base=createBase({...options,renderer});
  async function load(){const ticket=epoch,routeKey=key;if(!mounted||!key)return;try{const next=key==='full-assessment-detail'?{status:'ready',availability:await (await ensureRuntime()).getAvailability()}:await loadPracticeEvidenceViews();if(mounted&&ticket===epoch&&routeKey===key){state=next;if(lastView)renderer(root,lastView,{focusSelector:null});}}catch{if(mounted&&ticket===epoch){state={status:'error'};if(lastView)renderer(root,lastView,{focusSelector:null});}}}
  let starting=false;
  async function click(event){const button=event.target.closest?.('[data-practice-action]');if(!button||button.disabled)return;const action=button.dataset.practiceAction;if(action==='evidence-refresh'){event.stopPropagation();void load();}else if(action==='start-assessment'&&!starting){event.stopPropagation();starting=true;button.disabled=true;try{const r=await ensureRuntime();const {run}=await r.start(button.dataset.assessmentDepth);if(!mounted){await r.service.abandonAssessment(run.assessmentRunId);return;}const {mountPracticeAssessmentSession}=await import('./practiceAssessmentSessionHost.js');host=await mountPracticeAssessmentSession({root,runtime:r,run,onExit:next=>{host=null;report=next?.report??null;if(mounted){renderer(root,lastView);void load();}}});}catch{state={status:'error'};if(mounted)renderer(root,lastView);}finally{starting=false;}}}
  return {...base,mount(route){mounted=true;return base.mount(route);},navigate(...args){if(host)return false;return base.navigate(...args);},back(){if(host){void host.exit();return true;}return base.back();},unmount(){mounted=false;epoch++;detach();const exiting=host?.exit();host=null;Promise.resolve(exiting).finally(()=>runtime?.close());return base.unmount();}};
}
