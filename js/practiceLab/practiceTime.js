const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function resolveDate(value = Date.now()) {
  const resolved = typeof value === "function" ? value() : value;
  const date = resolved instanceof Date ? new Date(resolved.getTime()) : new Date(resolved);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Invalid Practice timestamp");
  return date;
}

export function toPracticeUtcIso(value = Date.now()) {
  return resolveDate(value).toISOString();
}

export function isValidPracticeUtcIso(value) {
  if (typeof value !== "string" || !UTC_ISO_PATTERN.test(value)) return false;
  return new Date(value).toISOString() === value;
}

export function getPracticeLocalDayKey(value = Date.now()) {
  const date = resolveDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidPracticeDayKey(value) {
  if (typeof value !== "string" || !DAY_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const test = new Date(Date.UTC(year, month - 1, day));
  return test.getUTCFullYear() === year
    && test.getUTCMonth() === month - 1
    && test.getUTCDate() === day;
}

export function getPracticeTimeContext(value = Date.now(), intl = globalThis.Intl) {
  const date = resolveDate(value);
  let timezoneId = null;
  try {
    const candidate = intl?.DateTimeFormat?.().resolvedOptions?.().timeZone;
    if (typeof candidate === "string" && candidate.length <= 100) timezoneId = candidate;
  } catch {
    timezoneId = null;
  }
  return Object.freeze({
    utc: date.toISOString(),
    localDayKey: getPracticeLocalDayKey(date),
    timezoneOffsetMinutes: date.getTimezoneOffset(),
    timezoneId,
  });
}

export function addPracticeMilliseconds(utcIso, milliseconds) {
  return toPracticeUtcIso(new Date(resolveDate(utcIso).getTime() + Math.max(0, Number(milliseconds) || 0)));
}

