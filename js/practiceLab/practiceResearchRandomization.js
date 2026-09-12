import {
  PRACTICE_RESEARCH_BLOCK_PERMUTATIONS,
  PRACTICE_RESEARCH_POLICY,
  PRACTICE_RESEARCH_RANDOMIZATION_VERSION,
} from "./practiceResearchConstants.js";

const encoder = new TextEncoder();
const UINT32_SPACE = 0x1_0000_0000;
const ACCEPT_LIMIT = Math.floor(UINT32_SPACE / PRACTICE_RESEARCH_BLOCK_PERMUTATIONS.length) * PRACTICE_RESEARCH_BLOCK_PERMUTATIONS.length;

function bytesToHex(bytes) { return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(value) {
  const hex = String(value ?? "").replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{32,}$/.test(hex) || hex.length % 2) throw new TypeError("Practice Research seed must be at least 128-bit hexadecimal");
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

export function generatePracticeResearchSeed(cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.getRandomValues) throw new Error("Web Crypto getRandomValues is required for Practice Research enrollment");
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function frameParts(parts) {
  return encoder.encode(JSON.stringify(parts.map((part) => typeof part === "number" ? part : String(part))));
}

async function digestBytes(parts, cryptoImpl) {
  if (!cryptoImpl?.subtle?.digest) throw new Error("Web Crypto SHA-256 is required for Practice Research randomization");
  const digest = await cryptoImpl.subtle.digest("SHA-256", frameParts(parts));
  return new Uint8Array(digest);
}

function acceptedPermutationIndex(digest) {
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  for (let offset = 0; offset + 4 <= digest.byteLength; offset += 4) {
    const value = view.getUint32(offset, false);
    if (value < ACCEPT_LIMIT) return value % PRACTICE_RESEARCH_BLOCK_PERMUTATIONS.length;
  }
  return null;
}

export async function derivePracticeResearchBlockPermutation({
  randomizationSeed,
  studyId,
  studyVersion,
  contextId,
  stratum,
  blockIndex,
  cryptoImpl = globalThis.crypto,
} = {}) {
  hexToBytes(randomizationSeed);
  if (!studyId || !contextId || !stratum || !Number.isInteger(studyVersion) || !Number.isInteger(blockIndex) || blockIndex < 0) throw new TypeError("Invalid Practice Research randomization input");
  for (let retry = 0; retry < 1024; retry += 1) {
    const digest = await digestBytes([
      "wordstrike-practice-research-block",
      PRACTICE_RESEARCH_RANDOMIZATION_VERSION,
      randomizationSeed,
      studyId,
      studyVersion,
      contextId,
      stratum,
      blockIndex,
      retry,
    ], cryptoImpl);
    const index = acceptedPermutationIndex(digest);
    if (index != null) return Object.freeze([...PRACTICE_RESEARCH_BLOCK_PERMUTATIONS[index]]);
  }
  throw new Error("Unable to derive unbiased Practice Research block permutation");
}

export async function derivePracticeResearchArm({ assignmentIndex, ...options } = {}) {
  if (!Number.isInteger(assignmentIndex) || assignmentIndex < 0) throw new TypeError("assignmentIndex must be a non-negative integer");
  const blockIndex = Math.floor(assignmentIndex / PRACTICE_RESEARCH_POLICY.blockSize);
  const blockPosition = assignmentIndex % PRACTICE_RESEARCH_POLICY.blockSize;
  const permutation = await derivePracticeResearchBlockPermutation({ ...options, blockIndex });
  return Object.freeze({
    blockIndex,
    blockPosition,
    assignedArm: permutation[blockPosition],
    permutation,
    randomizationVersion: PRACTICE_RESEARCH_RANDOMIZATION_VERSION,
  });
}

export const PRACTICE_RESEARCH_RANDOMIZATION_ACCEPT_LIMIT = ACCEPT_LIMIT;
