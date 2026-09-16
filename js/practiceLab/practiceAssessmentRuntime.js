import { createPracticeIndexedDbStore } from './practiceIndexedDbStore.js';
import { createPracticeManifestStore } from './practiceManifestStore.js';
import { createPracticeRepository } from './practiceRepository.js';
import { createPracticeBenchmarkRegistry } from './practiceBenchmarkRegistry.js';
import { createPracticeTransferRegistry } from './practiceTransferRegistry.js';
import { createPracticeAssessmentDiagnosticRegistry } from './practiceAssessmentDiagnostics.js';
import { createPracticeAssessmentService } from './practiceAssessmentService.js';
import { resolvePracticeAssessmentDiagnosticContent } from './practiceAssessmentContent.js';

export async function createPracticeAssessmentRuntime({ fetchImpl = globalThis.fetch, dataStore = createPracticeIndexedDbStore(), repository = createPracticeRepository({dataStore, manifestStore:createPracticeManifestStore()}) } = {}) {
  const read = async path => { const response = await fetchImpl(`data/practice/${path}`); if (!response.ok) throw new Error('Assessment content unavailable'); return response.json(); };
  try {
    const initialized = await repository.initializePracticeStorage();
    const [benchmark, transfer, diagnostic] = await Promise.all([
      read('evaluation/en-v1/benchmark/WS-BENCH-EN-1.manifest.json'),
      read('evaluation/en-v1/transfer/WS-TRANSFER-EN-1.manifest.json'),
      read('assessment/en-v1/diagnostic-forms-v1.manifest.json'),
    ]);
    const service = createPracticeAssessmentService({repository,
      benchmarkRegistry:createPracticeBenchmarkRegistry({suites:[benchmark]}),
      transferRegistry:createPracticeTransferRegistry({pools:[transfer]}),
      diagnosticRegistry:createPracticeAssessmentDiagnosticRegistry({artifacts:[diagnostic]}),
      loadProtectedContentItems:async ({partition,contentIds}) => { if(!['benchmark','transfer'].includes(partition)) throw new Error('Invalid protected partition'); const corpus=await read(`${partition}/en-v1.json`); return contentIds.map(id=>corpus.items.find(item=>item.contentId===id)); },
      loadDiagnosticFormContent:async ({form}) => resolvePracticeAssessmentDiagnosticContent({form,items:(await read('diagnostic/en-v1.json')).items}),
    });
    const scope={profileId:initialized.profile.profileId,contextId:initialized.context.contextId,language:initialized.context.dataLocale};
    return {repository,initialized,service,scope,getAvailability:()=>service.getAvailability(scope),start:depth=>service.startAssessment({...scope,depth}),close:()=>dataStore.close?.()};
  } catch (error) {dataStore.close?.();throw error;}
}
