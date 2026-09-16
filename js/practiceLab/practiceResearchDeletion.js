import { removePracticeTreatmentResponseSamples } from "./practiceTreatmentResponseState.js";

export async function deletePracticeResearchEnrollmentRecords({ transaction, enrollment, researchEnrollmentId, updatedAt } = {}) {
  if (!transaction || !enrollment || !researchEnrollmentId) throw new TypeError("Practice Research deletion requires transaction and enrollment identity");

  const assignments = await transaction.query("researchAssignments", "researchEnrollmentId", researchEnrollmentId);
  const assignmentIds = assignments.map((item) => item?.researchAssignmentId).filter(Boolean);
  const candidateTreatmentSessionIds = new Set(assignments.map((item) => item?.treatment?.sessionId).filter(Boolean));

  const profileSessions = await transaction.query("sessionSummaries", "profileId", enrollment.profileId);
  const boundSessions = profileSessions.filter((item) => item?.researchBinding?.researchEnrollmentId === researchEnrollmentId);
  const sessionIds = [];
  for (const summary of boundSessions) {
    if (!summary?.sessionId) continue;
    sessionIds.push(summary.sessionId);
    if (summary.researchBinding?.phase === "treatment") candidateTreatmentSessionIds.add(summary.sessionId);
    await transaction.put("sessionSummaries", { ...summary, researchBinding: null });
  }

  const treatmentEpisodeIds = new Set();
  for (const treatmentSessionId of candidateTreatmentSessionIds) {
    const episodes = await transaction.query("treatmentEpisodes", "treatmentSessionId", treatmentSessionId);
    for (const episode of episodes) {
      if (episode?.assignmentKind !== "randomized"
        || episode?.profileId !== enrollment.profileId
        || episode?.contextId !== enrollment.contextId
        || !episode?.treatmentEpisodeId) continue;
      treatmentEpisodeIds.add(episode.treatmentEpisodeId);
      await transaction.delete("treatmentEpisodes", episode.treatmentEpisodeId);
    }
  }

  const responseStateIdsUpdated = [];
  const responseStateIdsDeleted = [];
  if (treatmentEpisodeIds.size) {
    const states = await transaction.query("treatmentResponseStates", "profileId", enrollment.profileId);
    for (const state of states) {
      const next = removePracticeTreatmentResponseSamples(state, treatmentEpisodeIds, updatedAt);
      if (next === state) continue;
      if (!next.samples.length) {
        await transaction.delete("treatmentResponseStates", state.treatmentResponseStateId);
        responseStateIdsDeleted.push(state.treatmentResponseStateId);
      } else {
        await transaction.put("treatmentResponseStates", next);
        responseStateIdsUpdated.push(state.treatmentResponseStateId);
      }
    }
  }

  for (const assignment of assignments) {
    if (assignment?.researchAssignmentId) await transaction.delete("researchAssignments", assignment.researchAssignmentId);
  }
  const analyses = await transaction.query("researchAnalysisStates", "researchEnrollmentId", researchEnrollmentId);
  for (const analysis of analyses) {
    if (analysis?.researchAnalysisStateId) await transaction.delete("researchAnalysisStates", analysis.researchAnalysisStateId);
  }
  await transaction.delete("researchEnrollments", researchEnrollmentId);

  return Object.freeze({
    deleted: true,
    assignmentIds: Object.freeze(assignmentIds),
    sessionIds: Object.freeze([...new Set(sessionIds)]),
    treatmentEpisodeIds: Object.freeze([...treatmentEpisodeIds]),
    responseStateIdsUpdated: Object.freeze(responseStateIdsUpdated),
    responseStateIdsDeleted: Object.freeze(responseStateIdsDeleted),
  });
}
