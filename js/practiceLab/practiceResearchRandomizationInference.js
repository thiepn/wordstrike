import { PRACTICE_RESEARCH_BLOCK_PERMUTATIONS, PRACTICE_RESEARCH_POLICY } from "./practiceResearchConstants.js";

const response = (assignment) => Number(assignment?.primaryFollowup?.outcome?.responseValue ?? assignment?.outcome?.responseValue);
const eligible = (assignment) => assignment?.analysisEligibility === "eligible" && Number.isFinite(response(assignment));
const blockKey = (assignment) => `${assignment.stratum}:${assignment.blockIndex}`;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function getCompletePracticeResearchBlocks(assignments = []) {
  const groups = new Map();
  for (const assignment of assignments) {
    if (!eligible(assignment) || !Number.isInteger(assignment.blockIndex) || !Number.isInteger(assignment.blockPosition)) continue;
    const key = blockKey(assignment);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(assignment);
  }
  return Object.freeze([...groups.entries()]
    .map(([key, records]) => ({ key, records: records.slice().sort((a, b) => a.blockPosition - b.blockPosition) }))
    .filter(({ records }) => records.length === 4 && new Set(records.map((item) => item.blockPosition)).size === 4)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ key, records }) => Object.freeze({ key, assignments: Object.freeze(records) })));
}

function statistic(blocks, allocations = null) {
  const armA = [];
  const armB = [];
  blocks.forEach((block, blockIndex) => {
    block.assignments.forEach((assignment, position) => {
      const arm = allocations ? allocations[blockIndex][position] : assignment.assignedArm;
      (arm === "weakness-boss" ? armB : armA).push(response(assignment));
    });
  });
  return mean(armB) - mean(armA);
}

export function computeExactPracticeResearchRandomizationInference(assignments = []) {
  const blocks = getCompletePracticeResearchBlocks(assignments);
  const completeBlockCount = blocks.length;
  const observedStatistic = completeBlockCount ? statistic(blocks) : null;
  const permutationCount = 6 ** completeBlockCount;
  if (completeBlockCount < PRACTICE_RESEARCH_POLICY.minimumCompleteBlocks) {
    return Object.freeze({ completeBlockCount, observedStatistic, permutationCount, extremePermutationCount: null, pValue: null });
  }
  let extreme = 0;
  const allocations = Array.from({ length: completeBlockCount }, () => null);
  const threshold = Math.abs(observedStatistic);
  const tolerance = 1e-12;
  function enumerate(index) {
    if (index === completeBlockCount) {
      if (Math.abs(statistic(blocks, allocations)) + tolerance >= threshold) extreme += 1;
      return;
    }
    for (const permutation of PRACTICE_RESEARCH_BLOCK_PERMUTATIONS) {
      allocations[index] = permutation;
      enumerate(index + 1);
    }
  }
  enumerate(0);
  return Object.freeze({ completeBlockCount, observedStatistic, permutationCount, extremePermutationCount: extreme, pValue: extreme / permutationCount });
}
