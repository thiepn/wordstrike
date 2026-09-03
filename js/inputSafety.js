export function isTextEntryTarget(target) {
  const tagName = String(target?.tagName || "").toLowerCase();
  return ["input", "textarea", "select"].includes(tagName)
    || target?.isContentEditable === true
    || Boolean(target?.closest?.('[contenteditable="true"]'));
}

const GAMEPLAY_BACKSPACE_MODES = new Set([
  "campaign", "normal", "endless", "boss", "typing", "arcade-rush",
]);

const FORWARDED_BACKSPACE_MODES = new Set(["typing", "arcade-rush"]);

export function captureGameplayBackspace(event, {
  mode,
  onTypingBackspace,
} = {}) {
  if (
    event?.key !== "Backspace" ||
    !GAMEPLAY_BACKSPACE_MODES.has(mode) ||
    isTextEntryTarget(event.target)
  ) return false;
  event.preventDefault?.();
  if (FORWARDED_BACKSPACE_MODES.has(mode)) onTypingBackspace?.(event);
  return true;
}
