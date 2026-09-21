import { createGenericPracticeExperimentDescriptor } from "./practiceSessionContract.js";

function descriptor(id, title) {
  return createGenericPracticeExperimentDescriptor({
    id,
    version: 1,
    title,
    category: "fluency",
    sessionSchemaVersion: 1,
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["duration"],
    resumable: false,
    abilityChannel: null,
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    retentionMeasurementKind: null,
  });
}

export function registerPracticeGraduatedFluencyExperiments(registry) {
  if (!registry?.register) throw new TypeError("Practice registry is required");
  const registrations = [];
  for (const [experimentId, title] of [["read-ahead", "Read-Ahead"], ["metronome-typing", "Metronome"]]) {
    if (registry.hasImplementation?.(experimentId)) continue;
    registrations.push(registry.register({
      experimentId,
      implementationVersion: 1,
      descriptorFactory: () => descriptor(experimentId, title),
    }));
  }
  return Object.freeze(registrations);
}
