const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function comparePracticeBenchmarkMeasurements(a, b) {
  if (!a || !b) return freezeDeep({ quality: "invalid", status: "uncertain", reason: "missing-measurement" });
  if (a.suiteId !== b.suiteId || a.suiteVersion !== b.suiteVersion || a.protocolVersion !== b.protocolVersion) {
    return freezeDeep({ quality: "incompatible", status: "uncertain", reason: "protocol-mismatch" });
  }
  if (a.contextId !== b.contextId) return freezeDeep({ quality: "incompatible", status: "uncertain", reason: "context-mismatch" });
  if (a.integrityStatus !== "valid" || b.integrityStatus !== "valid") return freezeDeep({ quality: "nonstandard", status: "uncertain", reason: "integrity-not-valid" });
  if (a.freshnessStatus !== "fresh" || b.freshnessStatus !== "fresh") return freezeDeep({ quality: "exposure-contaminated", status: "uncertain", reason: "repeated-form" });
  if (a.comparabilityClass !== "engineering-matched" || b.comparabilityClass !== "engineering-matched") {
    return freezeDeep({ quality: "incompatible", status: "uncertain", reason: "comparability-class" });
  }
  if (![a.adjustedLogPerformance, b.adjustedLogPerformance, a.measurementSigmaLog, b.measurementSigmaLog].every(Number.isFinite)) {
    return freezeDeep({ quality: "invalid", status: "uncertain", reason: "missing-adjusted-performance" });
  }
  const deltaLog = b.adjustedLogPerformance - a.adjustedLogPerformance;
  const relativeDifference = Math.exp(deltaLog) - 1;
  const combinedMeasurementUncertainty = Math.sqrt(a.measurementSigmaLog ** 2 + b.measurementSigmaLog ** 2);
  const z = combinedMeasurementUncertainty > 0 ? deltaLog / combinedMeasurementUncertainty : null;
  const reliable = Number.isFinite(z) && Math.abs(z) >= 1.96;
  const practical = Math.abs(relativeDifference) >= 0.02;
  const status = reliable && practical ? (deltaLog > 0 ? "higher" : "lower") : reliable || practical ? "uncertain" : "similar";
  return freezeDeep({
    quality: "comparable",
    status,
    deltaLog,
    relativeDifference,
    combinedMeasurementUncertainty,
    z,
    reliableDifference: reliable,
    practicalDifference: practical,
  });
}
