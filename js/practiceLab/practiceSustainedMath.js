const finite = Number.isFinite;
export const clampPracticeSustained = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export function practiceSustainedMedian(values = []) {
  const list = values.filter(finite).slice().sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
}
export function practiceSustainedMad(values = []) {
  const median = practiceSustainedMedian(values);
  return median == null ? null : practiceSustainedMedian(values.filter(finite).map((value) => Math.abs(value - median)));
}
export function practiceSustainedTheilSen(points = []) {
  const clean = points.filter((point) => finite(point?.x) && finite(point?.y));
  if (clean.length < 2) return Object.freeze({ slope: null, intercept: null });
  const slopes = [];
  for (let i = 0; i < clean.length; i += 1) for (let j = i + 1; j < clean.length; j += 1) {
    const dx = clean[j].x - clean[i].x;
    if (dx !== 0) slopes.push((clean[j].y - clean[i].y) / dx);
  }
  const slope = practiceSustainedMedian(slopes);
  const intercept = slope == null ? null : practiceSustainedMedian(clean.map((point) => point.y - slope * point.x));
  return Object.freeze({ slope, intercept });
}
export function practiceSustainedRobustVariation(points = []) {
  const { slope, intercept } = practiceSustainedTheilSen(points);
  if (slope == null || intercept == null) return Object.freeze({ slopeLogPerMinute: null, intercept: null, robustSigmaLog: null, variation: null, variationPercent: null, residuals: [] });
  const residuals = points.filter((point) => finite(point?.x) && finite(point?.y)).map((point) => point.y - (intercept + slope * point.x));
  const mad = practiceSustainedMad(residuals);
  const robustSigmaLog = mad == null ? null : 1.4826 * mad;
  const variation = robustSigmaLog == null ? null : Math.exp(robustSigmaLog) - 1;
  return Object.freeze({ slopeLogPerMinute: slope, intercept, robustSigmaLog, variation, variationPercent: variation == null ? null : 100 * variation, residuals: Object.freeze(residuals) });
}
