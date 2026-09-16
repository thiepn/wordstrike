import { createPracticeIndexedDbStore } from './practiceIndexedDbStore.js';
import { createPracticeManifestStore } from './practiceManifestStore.js';
import { createPracticeRepository } from './practiceRepository.js';
import { derivePracticeReviewDueStatus } from './practiceReviewItem.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number.isFinite(value)?Number(value).toFixed(1).replace(/\.0$/,''):'—';
export async function loadPracticeEvidenceViews({repository=null,dataStore=null}={}) {
  const store=repository?null:(dataStore??createPracticeIndexedDbStore());
  const repo=repository??createPracticeRepository({dataStore:store,manifestStore:createPracticeManifestStore()});
  try{const {profile,context}=await repo.initializePracticeStorage();const [skills,reviews,sessions]=await Promise.all([repo.listSkillStats(profile.profileId,context.contextId),repo.listReviewItems(profile.profileId,context.contextId),repo.listSessionSummaries(profile.profileId,{contextId:context.contextId})]);return {status:'ready',skills,reviews,sessions,contextId:context.contextId};}finally{store?.close?.();}
}
export function renderPracticeEvidenceView(root,kind,state,{focus=false}={}) {
  const title=kind==='skill-map'?'Skill Map':kind==='review-queue'?'Review Queue':'Practice history';
  let body='';
  if(state.status==='loading')body='<p role="status">Loading local evidence…</p>';
  else if(state.status==='error')body='<p role="alert">Local evidence could not be read. Your saved data has not been changed.</p><button type="button" data-practice-action="evidence-refresh">TRY AGAIN</button>';
  else if(kind==='skill-map') {
    const skills=[...state.skills].sort((a,b)=>(b.priority??0)-(a.priority??0)||a.entityKey.localeCompare(b.entityKey));
    body=skills.length?skills.map(s=>{const e=s.evidence;const n=e?.opportunities?.count??0;return `<details class="practice-lab-empty-state"><summary><strong>${esc(s.entityKey===' '?'Space':s.entityKey)}</strong> · ${esc(s.entityType)} · ${n} opportunities · ${esc(s.confidenceLevel)} confidence</summary><dl><dt>First-pass accuracy</dt><dd>${n?number(100*e.opportunities.correctCount/n)+'%':'Not measured'}</dd><dt>Fluent key latency</dt><dd>${number(e?.timing?.fluentLatency?.mean)} ms</dd><dt>Mastery</dt><dd>${esc(s.masteryState)}</dd><dt>Last observed</dt><dd>${esc(s.lastObservedAt??'Not observed')}</dd></dl><p>Evidence applies to this keyboard and language context. Low confidence is not a reliable weakness diagnosis.</p><button type="button" data-practice-action="open-experiment" data-experiment-id="${s.entityType==='key'?'weak-keys':s.entityType==='word'?'problem-words':'combination-repair'}">OPEN ${s.entityType==='key'?'WEAK KEYS':s.entityType==='word'?'PROBLEM WORDS':'COMBINATION REPAIR'}</button></details>`;}).join(''):'<h2>No skill evidence yet</h2><p>Complete any Practice session to begin. Full Assessment is optional.</p>';
  } else if(kind==='review-queue') {
    const rows=[...state.reviews].sort((a,b)=>String(a.dueAtUtc??'z').localeCompare(String(b.dueAtUtc??'z')));
    body=rows.length?`<p>Daily Coach schedules eligible retention reviews. Ordinary target practice does not count as a verified review.</p><button type="button" data-practice-action="navigate" data-route="daily-training">OPEN DAILY COACH</button>${rows.map(r=>`<details class="practice-lab-empty-state"><summary>${esc(r.entityKey)} · ${esc(r.entityType)} · ${esc(derivePracticeReviewDueStatus(r))}</summary><p>Due: ${esc(r.dueAtUtc??'Not scheduled')}</p><p>Retention: ${esc(r.retention?.status??'unverified')} · last outcome: ${esc(r.retention?.lastOutcome??'none')}</p><p>${esc(r.suspensionReason??'Only mature, eligible reviews can produce retention evidence.')}</p></details>`).join('')}`:'<h2>No reviews scheduled</h2><p>Reviews appear when your evidence meets the retention scheduler’s requirements. You can continue practicing any mode.</p>';
  } else {
    const rows=[...state.sessions].sort((a,b)=>String(b.completedAtUtc??'').localeCompare(String(a.completedAtUtc??'')));
    body=rows.length?`<p>${rows.length} saved sessions in this context.</p><ol>${rows.slice(0,100).map(s=>`<li class="practice-lab-empty-state"><strong>${esc(s.experimentId)}</strong> · ${esc(s.status)}<p>${esc(s.completedAtUtc??s.startedAtUtc??'')}</p><p>${number(s.afterMetrics?.wpm)} WPM · ${number(s.afterMetrics?.accuracy)}% accuracy</p></li>`).join('')}</ol>${rows.length>100?'<p>Showing the latest 100 sessions.</p>':''}`:'<h2>No training history</h2><p>Completed and interrupted sessions will appear here after they are saved.</p>';
  }
  root.innerHTML=`<section class="screen practice-lab-screen" data-practice-view="${kind}"><div class="practice-lab-shell"><header class="practice-lab-header"><button type="button" data-practice-action="back">← Back to Practice Lab</button></header><main class="practice-lab-detail"><h1 tabindex="-1">${title}</h1>${body}</main></div></section>`;
  if(focus)root.querySelector('h1')?.focus({preventScroll:true});
}
