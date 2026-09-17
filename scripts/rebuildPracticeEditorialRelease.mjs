import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
// One ordered entry point keeps every dependent checksum tied to the same corpus.
for (const script of [
  'generatePracticeGc3OriginalSources', 'normalizePracticeGc3SourceAuthoring',
  'buildPracticeGc3SourceRegistry', 'buildPracticeCorpus', 'buildPracticeIndexes',
  'buildPracticeTypability', 'buildPracticeBenchmarkSuite', 'buildPracticeTransferPool',
  'buildPracticeAssessmentDiagnostics', 'buildPracticeRealTextPool',
  'buildPracticeCommonWords', 'buildPracticeConsistencyEnduranceForms',
  'buildPracticeSpecialDomains', 'buildPracticePaceLadderForms', 'buildPracticeReadAheadForms',
  'validatePracticeReleaseContent',
]) execFileSync(process.execPath, [`scripts/${script}.mjs`], { cwd: root, stdio: 'inherit' });
