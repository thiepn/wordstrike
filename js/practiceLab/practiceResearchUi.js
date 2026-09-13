import { PRACTICE_RESEARCH_POLICY } from "./practiceResearchConstants.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const titleCase = (value = "") => String(value).split("-").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ");
const backButton = () => '<button type="button" class="screen-back-button" data-research-action="back" aria-label="Back to Practice Lab">BACK</button>';
const dateTime = (value) => {
  if (!Number.isFinite(Date.parse(value ?? ""))) return "—";
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return String(value); }
};

function progressCounts(assignments = []) {
  return Object.freeze({
    assigned: assignments.length,
    baselineValid: assignments.filter((item) => item.baseline?.status === "valid").length,
    treatmentStarted: assignments.filter((item) => item.treatment?.exposureStartedAt).length,
    treatmentCompleted: assignments.filter((item) => item.treatment?.completedAt).length,
    followupCompleted: assignments.filter((item) => item.primaryFollowup?.status === "valid").length,
    analysisEligible: assignments.filter((item) => item.analysisEligibility === "eligible").length,
  });
}

function enrollmentControls(enrollment) {
  if (!enrollment) return "";
  if (enrollment.status === "active") return `<button type="button" data-research-action="pause">PAUSE STUDY</button><button type="button" data-research-action="withdraw">WITHDRAW</button>`;
  if (enrollment.status === "paused") return `<button type="button" data-research-action="resume">RESUME STUDY</button><button type="button" data-research-action="withdraw">WITHDRAW</button>`;
  return "";
}

function assignmentAction(assignment, enrollment) {
  if (!assignment) {
    if (enrollment?.status === "active") return `<button type="button" class="practice-lab-primary-action" data-research-action="new-assignment">FIND ELIGIBLE TARGET</button>`;
    return "";
  }
  if (["assigned", "baseline-active"].includes(assignment.status)) return `<button type="button" class="practice-lab-primary-action" data-research-action="start-baseline">START BASELINE</button>`;
  if (["baseline-complete", "treatment-revealed"].includes(assignment.status)) return `<button type="button" class="practice-lab-primary-action" data-research-action="start-treatment">START ASSIGNED PRACTICE</button><button type="button" data-research-action="decline-treatment">DECLINE THIS ASSIGNMENT</button>`;
  if (assignment.status === "followup-ready") return `<button type="button" class="practice-lab-primary-action" data-research-action="start-followup">START FOLLOW-UP</button>`;
  return "";
}

function assignmentStatus(assignment) {
  if (!assignment) return { title: "No active assignment", text: "When a currently eligible weakness exists, Research can create one randomized comparison assignment." };
  if (["assigned", "baseline-active"].includes(assignment.status)) return { title: "Baseline required", text: "The treatment arm has already been assigned locally, but it remains concealed until the common baseline completes validly." };
  if (["baseline-complete", "treatment-revealed"].includes(assignment.status)) return { title: "Assigned practice ready", text: `Your randomized assignment is ${assignment.assignedArm === "weakness-boss" ? "Weakness Boss" : "Focused Practice"}. This reveal cannot be rerolled.` };
  if (assignment.status === "treatment-active") return { title: "Assigned practice in progress", text: "Finish the canonical assigned Practice session. Leaving it incomplete consumes this randomized assignment." };
  if (assignment.status === "followup-waiting") return { title: "Follow-up not ready yet", text: `The delayed measurement becomes eligible after ${dateTime(assignment.followupWindow?.notBefore)} on a different local day, and expires after ${dateTime(assignment.followupWindow?.expiresAt)}.` };
  if (assignment.status === "followup-ready") return { title: "Follow-up ready", text: `Complete the common delayed measurement before ${dateTime(assignment.followupWindow?.expiresAt)}.` };
  return { title: titleCase(assignment.status), text: "This assignment is closed. Its original randomized arm is retained in the local research record." };
}

export function buildPracticeResearchViewModel(state = {}) {
  const enrollment = state.enrollment ?? null;
  const assignments = state.assignments ?? [];
  const activeAssignment = state.activeAssignment ?? null;
  return Object.freeze({
    kind: "research",
    status: state.status ?? "loading",
    errorCode: state.errorCode ?? null,
    enrollment,
    assignments,
    activeAssignment,
    counts: progressCounts(assignments),
    maxAssignments: PRACTICE_RESEARCH_POLICY.maximumAssignments,
  });
}

export function renderPracticeResearchPage(root, state = {}) {
  const view = state.kind === "research" && state.counts ? state : buildPracticeResearchViewModel(state);
  if (view.status === "loading") {
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="research"><div class="practice-lab-shell">${backButton()}<main class="practice-lab-detail"><div class="eyebrow">Practice Research · Experimental</div><h1>Research</h1><div class="practice-lab-notice" role="status">Loading local research state…</div></main></div></section>`;
    return;
  }
  if (view.status === "unavailable") {
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="research"><div class="practice-lab-shell">${backButton()}<main class="practice-lab-detail"><div class="eyebrow">Practice Research · Experimental</div><h1>Research unavailable</h1><div class="practice-lab-notice" role="alert"><strong>${escapeHtml(view.errorCode ?? "RESEARCH_UNAVAILABLE")}</strong><p>Your ordinary Practice data and sessions remain available.</p></div><button type="button" data-research-action="reload">TRY AGAIN</button></main></div></section>`;
    return;
  }
  if (!view.enrollment) {
    root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="research"><div class="practice-lab-shell">${backButton()}<main class="practice-lab-detail">
      <div class="eyebrow">Practice Research · Experimental · Local only</div><h1>Boss vs Focused Practice</h1>
      <p class="practice-lab-lead">Optionally compare two eligible Practice approaches using local randomized assignments and a delayed common measurement.</p>
      <section class="practice-lab-empty-state"><h2>Before you enroll</h2><ul><li>Assignment is randomized between Focused Practice and Weakness Boss.</li><li>Either eligible treatment may be assigned; benefit is not guaranteed.</li><li>The target is selected before the treatment arm. The arm stays concealed until a valid baseline finishes.</li><li>Participation is optional. You can pause or withdraw; ordinary Practice remains available.</li><li>Study identifiers, target identity, arm, seed, outcomes, and statistics stay on this device and are not uploaded to Supabase or remote analytics.</li></ul></section>
      <div class="practice-lab-notice" role="note">Selecting “I consent and enroll” records explicit consent for this study version and creates a local cryptographic randomization seed. It does not create a treatment assignment yet.</div>
      <button type="button" class="practice-lab-primary-action" data-research-action="enroll">I CONSENT AND ENROLL</button>
    </main></div></section>`;
    return;
  }
  const assignment = view.activeAssignment;
  const status = assignmentStatus(assignment);
  const armVisible = assignment && !["assigned", "baseline-active"].includes(assignment.status);
  root.innerHTML = `<section class="screen practice-lab-screen" data-practice-view="research"><div class="practice-lab-shell">${backButton()}<main class="practice-lab-detail">
    <header class="practice-lab-header"><div><div class="eyebrow">Practice Research · Experimental · Local only</div><h1>Boss vs Focused Practice</h1></div><div class="practice-research-controls">${enrollmentControls(view.enrollment)}</div></header>
    <section class="practice-lab-empty-state"><h2>Study progress</h2><dl class="practice-weak-key-result-grid"><div><dt>Assignments</dt><dd>${view.counts.assigned} / ${view.maxAssignments}</dd></div><div><dt>Baseline valid</dt><dd>${view.counts.baselineValid}</dd></div><div><dt>Treatment completed</dt><dd>${view.counts.treatmentCompleted}</dd></div><div><dt>Follow-up completed</dt><dd>${view.counts.followupCompleted}</dd></div><div><dt>Analysis eligible</dt><dd>${view.counts.analysisEligible}</dd></div></dl><p>Arm-effect comparisons are intentionally hidden while this study is in progress.</p></section>
    <section class="practice-lab-experiment-card practice-research-assignment"><div class="practice-lab-card-meta"><span>Current assignment</span><span>${escapeHtml(view.enrollment.status)}</span></div><h2>${escapeHtml(status.title)}</h2><p>${escapeHtml(status.text)}</p>
      ${assignment ? `<dl><div><dt>Target</dt><dd>${escapeHtml(assignment.target.entityType)} · <code>${escapeHtml(assignment.target.entityKey)}</code></dd></div><div><dt>Arm</dt><dd>${armVisible ? escapeHtml(assignment.assignedArm === "weakness-boss" ? "Weakness Boss" : "Focused Practice") : "Concealed until valid baseline"}</dd></div><div><dt>Analysis status</dt><dd>${escapeHtml(assignment.analysisEligibility ?? "pending")}</dd></div></dl>` : ""}
      <div class="practice-research-assignment-actions">${assignmentAction(assignment, view.enrollment)}</div>
    </section>
    ${view.errorCode ? `<div class="practice-lab-notice" role="alert"><strong>${escapeHtml(view.errorCode)}</strong></div>` : ""}
    <section class="practice-lab-empty-state"><h2>Data controls</h2><p>Withdrawal stops future randomized assignments but keeps the local study history. Deleting research records is separate and does not erase typing sessions or ordinary Practice evidence that actually occurred.</p><button type="button" data-research-action="delete">DELETE LOCAL RESEARCH RECORDS</button></section>
  </main></div></section>`;
}
