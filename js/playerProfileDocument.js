/** Local/cloud game data only. Never put an authentication credential in this document.
 * Best records use monotone merges; cumulative statistics use per-writer G-counters.
 * Re-sending an acknowledged snapshot therefore cannot count a run twice.
 */
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isFinite(value) ? Math.min(1e15, Math.max(0, value)) : 0;
export const cloneProfileValue = value => value == null ? value : JSON.parse(JSON.stringify(value));
export function stableProfileJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableProfileJSON).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).filter(k => !BAD_KEYS.has(k)).sort().map(k => `${JSON.stringify(k)}:${stableProfileJSON(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
function maximumMap(a = {}, b = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!BAD_KEYS.has(key)) out[key] = Math.max(count(a[key]), count(b[key]));
  }
  return out;
}
function recordRank(record, path) {
  const key = path.split('.').at(-1);
  if ('bestWpm' in record) return [count(record.bestWpm), count(record.tieAccuracy), count(record.tieRawWpm), -count(record.bestResultAt)];
  const metric = { bestStage: 'stage', highestScore: 'score', longestSurvival: 'survivalTimeMs', mostWordsCompleted: 'wordsCompleted' }[key] ?? 'value';
  return [count(record[metric]), count(record.score), count(record.accuracy), -count(record.achievedAt)];
}
function compareRank(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function mergeRecords(a, b, path = '') {
  if (a == null) return cloneProfileValue(b);
  if (b == null) return cloneProfileValue(a);
  if (Array.isArray(a) || Array.isArray(b)) return cloneProfileValue(b);
  if (object(a) && object(b)) {
    // Keep the metrics of an individual record attached to the run that earned it.
    if ('sessionId' in a && 'sessionId' in b && !('modeId' in a)) {
      const compare = compareRank(recordRank(a, path), recordRank(b, path));
      const winner = compare > 0 || (compare === 0 && stableProfileJSON(a) > stableProfileJSON(b)) ? a : b;
      const result = cloneProfileValue(winner);
      if ('bestWpm' in result) for (const key of ['bestAccuracy', 'bestRawWpm', 'bestExactWords']) {
        if (a[key] != null || b[key] != null) result[key] = Math.max(count(a[key]), count(b[key]));
      }
      return result;
    }
    const result = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) if (!BAD_KEYS.has(key)) {
      result[key] = mergeRecords(a[key], b[key], path ? `${path}.${key}` : key);
    }
    return result;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return /(?:^|\.)(?:fastestCompletion|firstSessionAt|createdAt)$/.test(path) ? Math.min(a, b) : Math.max(a, b);
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') return a || b;
  return stableProfileJSON(a) > stableProfileJSON(b) ? cloneProfileValue(a) : cloneProfileValue(b);
}
function counterPath(path) {
  if (/^totals\./.test(path)) return true;
  if (/^lifetime\./.test(path)) return !/(?:Version|At)$/.test(path);
  if (/^modes\.[^.]+\.(?:completedSessions|failedSessions|activePlaytimeMs)$/.test(path)) return true;
  if (/^modes\.[^.]+\.(?:activity|wordSetActivity|configUsage|wordSetConfigUsage)\./.test(path)) return !/Version$/.test(path);
  return /^modes\.arcade-rush\.records\.(?:runsStarted|runsCompleted|bossesDefeated)$/.test(path);
}
export function profileCounters(value, path = '', result = {}) {
  if (!object(value)) return result;
  for (const [key, child] of Object.entries(value)) {
    if (BAD_KEYS.has(key)) continue;
    const nextPath = path ? `${path}.${key}` : key;
    if (typeof child === 'number' && counterPath(nextPath)) result[nextPath] = count(child);
    else if (object(child)) profileCounters(child, nextPath, result);
  }
  return result;
}
function setPath(target, path, value) {
  const keys = path.split('.');
  if (keys.some(key => BAD_KEYS.has(key))) return;
  const end = keys.pop();
  let cursor = target;
  for (const key of keys) {
    if (!object(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[end] = value;
}
function flatten(value, path = '', result = {}) {
  for (const [key, child] of Object.entries(value ?? {})) {
    if (BAD_KEYS.has(key)) continue;
    const next = path ? `${path}.${key}` : key;
    if (object(child) && Object.keys(child).length) flatten(child, next, result);
    else result[next] = cloneProfileValue(child);
  }
  return result;
}
function stamped(a, b) {
  if (!a) return cloneProfileValue(b);
  if (!b) return cloneProfileValue(a);
  if (a.stamp !== b.stamp) return cloneProfileValue(a.stamp > b.stamp ? a : b);
  return cloneProfileValue(stableProfileJSON(a) > stableProfileJSON(b) ? a : b);
}
function unionSessions(a = [], b = []) {
  const map = new Map();
  for (const value of [...a, ...b]) if (value && typeof value.sessionId === 'string') {
    const prior = map.get(value.sessionId);
    map.set(value.sessionId, !prior || stableProfileJSON(value) > stableProfileJSON(prior) ? value : prior);
  }
  return [...map.values()].sort((x, y) => count(y.endedAt) - count(x.endedAt) || x.sessionId.localeCompare(y.sessionId)).slice(0, 30);
}
function bestPlacement(modeData) {
  const speed = modeData?.modes?.['speed-test'];
  return Math.max(0, count(speed?.records?.['time-60']?.bestWpm), ...Object.values(speed?.wordSetRecords ?? {}).map(records => count(records?.['time-60']?.bestWpm)));
}
export function createPlayerDocument(save = {}, modes = {}) {
  const settings = Object.fromEntries(Object.entries(flatten(save.settings)).map(([key, value]) => [key, { stamp: '', value }]));
  return {
    schemaVersion: 1, generation: '', clock: 0,
    campaign: { epoch: '', furthest: Math.max(1, count(save.campaignFurthestLevel ?? save.currentFurthestLevel)), levels: cloneProfileValue(save.levels ?? {}) },
    settings,
    mode: { epoch: '', value: cloneProfileValue(modes), parts: { legacy: profileCounters(modes) }, profile: { stamp: '', value: cloneProfileValue(modes.profile ?? null) } },
    placementWpm: bestPlacement(modes),
  };
}
export function validPlayerDocument(value) {
  if (!object(value) || value.schemaVersion !== 1 || !Number.isFinite(value.clock) || !Number.isFinite(value.placementWpm)) return false;
  if (!object(value.campaign) || typeof value.campaign.epoch !== 'string' || !object(value.campaign.levels) || !Number.isFinite(value.campaign.furthest)) return false;
  if (!object(value.settings) || !Object.values(value.settings).every(entry => object(entry) && typeof entry.stamp === 'string' && 'value' in entry)) return false;
  if (!object(value.mode) || typeof value.mode.epoch !== 'string' || !object(value.mode.value) || !object(value.mode.parts)) return false;
  if (!Object.values(value.mode.parts).every(part => object(part) && Object.values(part).every(n => Number.isFinite(n) && n >= 0))) return false;
  if (!object(value.mode.profile) || typeof value.mode.profile.stamp !== 'string') return false;
  if (value.mode.value.recentSessions != null && !Array.isArray(value.mode.value.recentSessions)) return false;
  if (value.mode.value.recordedSessionIds != null && (!Array.isArray(value.mode.value.recordedSessionIds) || !value.mode.value.recordedSessionIds.every(id => typeof id === 'string'))) return false;
  return true;
}
export function mergePlayerDocuments(a, b) {
  if (!validPlayerDocument(a)) return validPlayerDocument(b) ? cloneProfileValue(b) : createPlayerDocument();
  if (!validPlayerDocument(b)) return cloneProfileValue(a);
  if ((a.generation ?? '') !== (b.generation ?? '')) return cloneProfileValue((a.generation ?? '') > (b.generation ?? '') ? a : b);
  const out = createPlayerDocument();
  out.generation = a.generation ?? '';
  out.clock = Math.max(count(a.clock), count(b.clock));
  out.campaign = a.campaign.epoch === b.campaign.epoch ? {
    epoch: a.campaign.epoch,
    furthest: Math.max(a.campaign.furthest || 1, b.campaign.furthest || 1),
    levels: mergeRecords(a.campaign.levels, b.campaign.levels),
  } : cloneProfileValue(a.campaign.epoch > b.campaign.epoch ? a.campaign : b.campaign);
  for (const key of new Set([...Object.keys(a.settings), ...Object.keys(b.settings)])) if (!BAD_KEYS.has(key)) out.settings[key] = stamped(a.settings[key], b.settings[key]);
  out.placementWpm = Math.max(count(a.placementWpm), count(b.placementWpm));
  if (a.mode.epoch !== b.mode.epoch) out.mode = cloneProfileValue(a.mode.epoch > b.mode.epoch ? a.mode : b.mode);
  else {
    out.mode.epoch = a.mode.epoch;
    out.mode.value = mergeRecords(a.mode.value, b.mode.value);
    out.mode.value.recentSessions = unionSessions(a.mode.value.recentSessions, b.mode.value.recentSessions);
    out.mode.value.recordedSessionIds = [...new Set([
      ...out.mode.value.recentSessions.map(s => s.sessionId),
      ...[...new Set([...(a.mode.value.recordedSessionIds ?? []), ...(b.mode.value.recordedSessionIds ?? [])])].sort(),
    ])].slice(0, 100);
    out.mode.profile = stamped(a.mode.profile, b.mode.profile);
    out.mode.parts = {};
    for (const actor of new Set([...Object.keys(a.mode.parts), ...Object.keys(b.mode.parts)])) if (!BAD_KEYS.has(actor)) out.mode.parts[actor] = maximumMap(a.mode.parts[actor], b.mode.parts[actor]);
  }
  return out;
}
export function projectPlayerSave(doc) {
  const settings = {};
  for (const [path, entry] of Object.entries(doc.settings)) if (entry && 'value' in entry) setPath(settings, path, cloneProfileValue(entry.value));
  return { campaignFurthestLevel: doc.campaign.furthest, currentFurthestLevel: doc.campaign.furthest, levels: cloneProfileValue(doc.campaign.levels), settings };
}
export function projectPlayerModes(doc) {
  const modes = cloneProfileValue(doc.mode.value);
  const totals = {};
  for (const part of Object.values(doc.mode.parts)) for (const [path, value] of Object.entries(part)) if (counterPath(path)) totals[path] = count(totals[path]) + count(value);
  for (const [path, value] of Object.entries(totals)) setPath(modes, path, count(value));
  modes.profile = cloneProfileValue(doc.mode.profile?.value ?? null);
  return modes;
}
function tick(doc, actor, now) {
  doc.clock = Math.max(count(now), count(doc.clock) + 1);
  return `${String(doc.clock).padStart(16, '0')}:${actor}`;
}
export function writePlayerSave(input, save, actor, { now = Date.now(), reset = false, settings = true } = {}) {
  const doc = cloneProfileValue(input), stamp = tick(doc, actor, now);
  const next = createPlayerDocument(save).campaign;
  doc.campaign = reset ? { ...next, epoch: stamp } : {
    epoch: doc.campaign.epoch, furthest: Math.max(doc.campaign.furthest, next.furthest), levels: mergeRecords(doc.campaign.levels, next.levels),
  };
  if (settings) for (const [key, value] of Object.entries(flatten(save.settings))) {
    if (stableProfileJSON(doc.settings[key]?.value) !== stableProfileJSON(value)) doc.settings[key] = { stamp: doc.settings[key] ? stamp : '', value };
  }
  return doc;
}
export function writePlayerModes(input, modes, actor, { now = Date.now(), reset = false } = {}) {
  const doc = cloneProfileValue(input), stamp = tick(doc, actor, now);
  const before = profileCounters(projectPlayerModes(input)), after = profileCounters(modes);
  if (reset) doc.mode = { epoch: stamp, value: cloneProfileValue(modes), parts: { legacy: after }, profile: { stamp, value: cloneProfileValue(modes.profile ?? null) } };
  else {
    for (const [path, value] of Object.entries(after)) {
      const delta = value - count(before[path]);
      if (delta > 0) { const part = doc.mode.parts[actor] ??= {}; part[path] = count(part[path]) + delta; }
    }
    doc.mode.value = mergeRecords(doc.mode.value, modes);
    doc.mode.value.recentSessions = unionSessions(input.mode.value.recentSessions, modes.recentSessions);
    doc.mode.value.recordedSessionIds = [...new Set([...(modes.recordedSessionIds ?? []), ...(input.mode.value.recordedSessionIds ?? [])])].slice(0, 100);
    if (stableProfileJSON(doc.mode.profile?.value) !== stableProfileJSON(modes.profile ?? null)) doc.mode.profile = { stamp: doc.mode.profile?.value ? stamp : '', value: cloneProfileValue(modes.profile ?? null) };
  }
  doc.placementWpm = Math.max(doc.placementWpm, bestPlacement(modes));
  return doc;
}
