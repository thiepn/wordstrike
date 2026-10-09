/**
 * Shared WordStrike mode-entry contract.
 *
 * The host owns navigation and visual shell rendering. Each mode owns its
 * gameplay runtime, but never installs its own competing Mode Select click
 * listener. All pointer and keyboard activations arrive through enter().
 */
export function createModeLifecycle({ resolveMode, handlers = {} } = {}) {
  if (typeof resolveMode !== "function") {
    throw new TypeError("Mode lifecycle requires a mode resolver");
  }

  let currentModeId = null;
  let generation = 0;

  function enter(modeId) {
    const mode = resolveMode(modeId);
    if (!mode?.enabled || !mode.route) return false;
    const start = handlers[mode.route];
    if (typeof start !== "function") return false;

    // Do not claim ownership until the host actually accepted the transition.
    const accepted = start(mode);
    if (accepted === false) return false;
    currentModeId = mode.id;
    generation += 1;
    return true;
  }

  function leave() {
    if (currentModeId == null) return false;
    currentModeId = null;
    generation += 1;
    return true;
  }

  function getSnapshot() {
    return Object.freeze({ modeId: currentModeId, generation });
  }

  return Object.freeze({ enter, leave, getSnapshot });
}
