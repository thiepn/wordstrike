const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function getPracticePrimaryErrorPosition(episode) {
  if (!episode) return null;
  let position = Number.isInteger(episode.primaryPosition) ? episode.primaryPosition : episode.startPosition;
  if (episode.editClass === "transposition" && ["high", "medium"].includes(episode.confidence) && Number.isInteger(episode.affectedStart) && Number.isInteger(episode.affectedEnd) && episode.affectedEnd > episode.affectedStart) position = episode.affectedStart + 1;
  return Number.isInteger(position) && position >= 0 ? position : null;
}

export function resolvePracticePrimaryErrorAttribution({ episode, entityResolver } = {}) {
  const position = getPracticePrimaryErrorPosition(episode);
  if (position == null || !entityResolver || typeof entityResolver.resolveAtPosition !== "function") return Object.freeze([]);
  return freezeDeep(entityResolver.resolveAtPosition(position).map((entity) => ({ entityType: entity.entityType, entityKey: entity.entityKey, statId: entity.statId, directTarget: entity.directTarget === true })));
}
