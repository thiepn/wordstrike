import { PRACTICE_PHYSICAL_TELEMETRY_SETTING } from "./practicePhysicalTelemetryConstants.js";

export function setPracticePhysicalTelemetryEnabled(manifestStore, enabled) {
  if (!manifestStore?.load || !manifestStore?.save) throw new TypeError("Physical telemetry setting requires a Practice manifest store");
  const loaded = manifestStore.load();
  const manifest = loaded.manifest;
  const updated = {
    ...manifest,
    updatedAt: new Date().toISOString(),
    settings: {
      ...manifest.settings,
      [PRACTICE_PHYSICAL_TELEMETRY_SETTING]: enabled === true,
    },
  };
  manifestStore.save(updated);
  return Object.freeze(updated);
}
