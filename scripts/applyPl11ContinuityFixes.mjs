import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);
const replaceOnce = (source, search, replacement, label) => {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`PL11 continuity patch missing anchor: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) throw new Error(`PL11 continuity patch ambiguous anchor: ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + search.length);
};

{
  const file = "js/practiceLab/practiceSkillEvidenceCollector.js";
  let source = read(file);
  source = replaceOnce(source,
`  const allowWordEntities = evidenceRole !== "custom" || policy.allowCustomWordEvidence;
  const entityResolver = createPracticeEntityResolver({
    contentPlan,
    profileId,
    contextId,
    language: contentPlan?.metadata?.language ?? context?.dataLocale ?? "en",
    segmenter,
    allowWordEntities,
  });
  for (const [type, count] of Object.entries(entityResolver.directTargetsByType)) {
    if (count > policy.admissionLimits[type]) throw new TypeError(\`Practice direct \${type} targets exceed PL11 admission limit\`);
  }
  const frequencyProvider = createUnavailablePracticeReferenceFrequencyProvider({ language: entityResolver.analysis.language });
  const contextResolver = createPracticeTransitionContextResolver({ contentAnalysis: entityResolver.analysis, context, frequencyProvider });`,
`  const allowWordEntities = evidenceRole !== "custom" || policy.allowCustomWordEvidence;
  if (seed?.evidenceRole != null && seed.evidenceRole !== evidenceRole) throw new TypeError("Practice skill evidence role cannot change across restore");
  const buildResolvers = (nextContentPlan) => {
    const nextEntityResolver = createPracticeEntityResolver({
      contentPlan: nextContentPlan,
      profileId,
      contextId,
      language: nextContentPlan?.metadata?.language ?? context?.dataLocale ?? "en",
      segmenter,
      allowWordEntities,
    });
    for (const [type, count] of Object.entries(nextEntityResolver.directTargetsByType)) {
      if (count > policy.admissionLimits[type]) throw new TypeError(\`Practice direct \${type} targets exceed PL11 admission limit\`);
    }
    const nextFrequencyProvider = createUnavailablePracticeReferenceFrequencyProvider({ language: nextEntityResolver.analysis.language });
    return {
      entityResolver: nextEntityResolver,
      contextResolver: createPracticeTransitionContextResolver({ contentAnalysis: nextEntityResolver.analysis, context, frequencyProvider: nextFrequencyProvider }),
    };
  };
  let { entityResolver, contextResolver } = buildResolvers(contentPlan);`, "collector resolver initialization");

  source = replaceOnce(source,
`    return freezeDeep({
      trackerVersion: PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION,
      policyVersion: PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
      opportunityTracker: opportunityTracker.getSnapshot(),`,
`    return freezeDeep({
      trackerVersion: PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION,
      policyVersion: PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
      evidenceRole,
      opportunityTracker: opportunityTracker.getSnapshot(),`, "collector snapshot role");

  source = replaceOnce(source,
`  return Object.freeze({
    recordInsertion,
    recordClosedEpisode,
    finalize,
    checkpointSnapshot,`,
`  return Object.freeze({
    recordInsertion,
    recordClosedEpisode,
    finalize,
    setContentPlan(nextContentPlan) {
      const rebuilt = buildResolvers(nextContentPlan);
      entityResolver = rebuilt.entityResolver;
      contextResolver = rebuilt.contextResolver;
      for (const key of Object.keys(incidentalAdmitted)) incidentalAdmitted[key] = 0;
      for (const entry of entries.values()) {
        entry.directTarget = entityResolver.isDirectTarget(entry.entityType, entry.entityKey);
        if (!entry.directTarget) incidentalAdmitted[entry.entityType] = Number(incidentalAdmitted[entry.entityType] || 0) + 1;
      }
      return true;
    },
    checkpointSnapshot,`, "collector setContentPlan API");
  write(file, source);
}

{
  const file = "js/practiceLab/practiceSessionEngine.js";
  let source = read(file);
  source = replaceOnce(source,
`    contentPlan = next;
    typingState.setContentPlan(next);
    markDirty(false);`,
`    contentPlan = next;
    typingState.setContentPlan(next);
    skillEvidenceTracker?.setContentPlan(next);
    markDirty(false);`, "engine append updates evidence resolver");
  write(file, source);
}

{
  const file = "js/practiceLab/practiceValidation.js";
  let source = read(file);
  source = replaceOnce(source,
`  validateVersion(errors, snapshot.policyVersion, PRACTICE_SKILL_EVIDENCE_POLICY_VERSION, \`\${path}.policyVersion\`);
  if (!isPlainObject(snapshot.opportunityTracker))`,
`  validateVersion(errors, snapshot.policyVersion, PRACTICE_SKILL_EVIDENCE_POLICY_VERSION, \`\${path}.policyVersion\`);
  oneOf(errors, snapshot.evidenceRole, \`\${path}.evidenceRole\`, PRACTICE_EVIDENCE_ROLES);
  if (!isPlainObject(snapshot.opportunityTracker))`, "checkpoint evidence role validation");
  write(file, source);
}

console.log("PL11 continuity fixes applied");
