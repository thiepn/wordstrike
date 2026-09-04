function normalizeFiniteValues(values, { min = -Infinity, max = Infinity } = {}) {
  if (!Array.isArray(values)) throw new TypeError("Practice robust statistics require an array");
  return values.filter((value) => Number.isFinite(value) && value >= min && value <= max);
}

export function filterPracticeFiniteValues(values, options = {}) {
  return Object.freeze(normalizeFiniteValues(values, options));
}

function sortedFinite(values, options = {}) {
  return normalizeFiniteValues(values, options).sort((a, b) => a - b);
}

export function practiceMedian(values, options = {}) {
  const sorted = sortedFinite(values, options);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Quantiles use linear interpolation at index (n - 1) * probability (R-7 / NumPy default semantics).
export function practiceQuantile(values, probability, options = {}) {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError("Practice quantile probability must be between 0 and 1");
  }
  const sorted = sortedFinite(values, options);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const fraction = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

export function practiceMad(values, options = {}) {
  const finite = normalizeFiniteValues(values, options);
  if (!finite.length) return null;
  const center = practiceMedian(finite);
  return practiceMedian(finite.map((value) => Math.abs(value - center)));
}

export function practiceRobustScale(values, options = {}) {
  const mad = practiceMad(values, options);
  return mad == null ? null : 1.4826 * mad;
}
