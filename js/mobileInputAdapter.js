import {
  createGameplayViewportController,
  focusGameplayInput,
} from "./gameplayViewport.js";

const KEY_ALIASES = Object.freeze({ Esc: "Escape", Spacebar: " ", Del: "Delete" });

export function normalizeKeyboardInput(event) {
  const key = KEY_ALIASES[event?.key] || event?.key;
  if (event?.isComposing || key === "Process" || key === "Unidentified") return null;
  if (key === "Backspace") {
    return Object.freeze({
      type: event.ctrlKey || event.metaKey ? "word-delete" : "backspace",
      value: "",
      source: "physical-keyboard",
    });
  }
  if (event?.ctrlKey || event?.metaKey || event?.altKey) return null;
  if (key === " ") return Object.freeze({ type: "space", value: " ", source: "physical-keyboard" });
  if (typeof key === "string" && key.length === 1) {
    return Object.freeze({ type: "character", value: key, source: "physical-keyboard" });
  }
  return null;
}

export function normalizeBeforeInput(event) {
  if (!event || event.isComposing || event.inputType === "insertCompositionText") return [];
  if (event.inputType === "deleteWordBackward") {
    return [Object.freeze({ type: "word-delete", value: "", source: "soft-keyboard" })];
  }
  if (event.inputType === "deleteContentBackward") {
    return [Object.freeze({ type: "backspace", value: "", source: "soft-keyboard" })];
  }
  if (event.inputType === "insertLineBreak") {
    return [Object.freeze({ type: "space", value: " ", source: "soft-keyboard" })];
  }
  if (!["insertText", "insertReplacementText"].includes(event.inputType)) return [];
  return [...String(event.data || "")].map((value) => Object.freeze({
    type: value === " " ? "space" : "character",
    value,
    source: "soft-keyboard",
  }));
}

export function keyboardEventFromNormalized(input) {
  return {
    key: input.type === "backspace" || input.type === "word-delete"
      ? "Backspace"
      : input.type === "space" ? " " : input.value,
    ctrlKey: input.type === "word-delete",
    metaKey: false,
    altKey: false,
    repeat: false,
    preventDefault() {},
  };
}

export function createMobileInputAdapter({
  root = globalThis.document,
  onInput,
  isEnabled = () => true,
  visualViewport = globalThis.visualViewport,
} = {}) {
  const host = root?.querySelector?.(
    ".speed-test-screen, .game-screen, .boss-screen, .endless-screen, .arcade-rush-gameplay",
  );
  const arena = root?.querySelector?.(
    "#play-area, .speed-test-stage, .boss-arena, .arcade-rush-gameplay",
  );
  if (!host?.append || typeof onInput !== "function") return () => {};

  const dock = root.createElement("div");
  dock.className = "gameplay-input-dock";
  dock.innerHTML = `<button type="button" class="gameplay-keyboard-trigger">TAP TO ENABLE KEYBOARD</button>
    <textarea class="gameplay-input" rows="1" aria-label="Gameplay typing input"
      autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
      inputmode="text" enterkeyhint="done"></textarea>`;
  host.append(dock);
  const input = dock.querySelector(".gameplay-input");
  const trigger = dock.querySelector(".gameplay-keyboard-trigger");
  if (!input) return () => dock.remove?.();
  const viewportController = createGameplayViewportController({
    documentObject: root,
    windowObject: globalThis.window,
    visualViewport,
  });

  let composing = false;
  let suppressBeforeInput = false;
  let handledBeforeInput = false;
  const dispatch = (normalized) => {
    if (isEnabled() && normalized) onInput(normalized);
  };
  const clearValue = () => { input.value = ""; };
  const focusInput = (event) => {
    if (!isEnabled()) return;
    if (event?.target?.closest?.(
      "button, a, input, select, textarea, [role=button], [role=tab]",
    )) return;
    event?.preventDefault?.();
    focusGameplayInput(input, globalThis.window);
    dock.classList?.add?.("keyboard-ready");
  };
  const focusFromTrigger = (event) => {
    if (!isEnabled()) return;
    event?.preventDefault?.();
    focusGameplayInput(input, globalThis.window);
    dock.classList?.add?.("keyboard-ready");
  };
  const onKeydown = (event) => {
    const normalized = normalizeKeyboardInput(event);
    if (!normalized || !isEnabled()) return;
    event.preventDefault?.();
    suppressBeforeInput = true;
    globalThis.queueMicrotask?.(() => { suppressBeforeInput = false; });
    dispatch(normalized);
  };
  const onBeforeInput = (event) => {
    if (composing || !isEnabled()) return;
    const normalized = normalizeBeforeInput(event);
    if (!normalized.length) return;
    event.preventDefault?.();
    if (suppressBeforeInput) {
      suppressBeforeInput = false;
      clearValue();
      return;
    }
    handledBeforeInput = true;
    normalized.forEach(dispatch);
    clearValue();
  };
  const onFallbackInput = (event) => {
    if (composing || !isEnabled()) return;
    if (handledBeforeInput) {
      handledBeforeInput = false;
      clearValue();
      return;
    }
    [...String(event?.target?.value || input.value || "")].forEach((value) => dispatch({
      type: value === " " ? "space" : "character",
      value,
      source: "soft-keyboard",
    }));
    clearValue();
  };
  const onCompositionEnd = (event) => {
    composing = false;
    [...String(event?.data || "")].forEach((value) => dispatch({
      type: value === " " ? "space" : "character",
      value,
      source: "composition",
    }));
    handledBeforeInput = true;
    clearValue();
  };
  const onCompositionStart = () => { composing = true; };
  input.addEventListener("keydown", onKeydown);
  input.addEventListener("beforeinput", onBeforeInput);
  input.addEventListener("input", onFallbackInput);
  input.addEventListener("compositionstart", onCompositionStart);
  input.addEventListener("compositionend", onCompositionEnd);
  trigger?.addEventListener?.("click", focusFromTrigger);
  arena?.addEventListener?.("pointerdown", focusInput);
  const cleanup = () => {
    input.blur?.();
    input.removeEventListener?.("keydown", onKeydown);
    input.removeEventListener?.("beforeinput", onBeforeInput);
    input.removeEventListener?.("input", onFallbackInput);
    input.removeEventListener?.("compositionstart", onCompositionStart);
    input.removeEventListener?.("compositionend", onCompositionEnd);
    trigger?.removeEventListener?.("click", focusFromTrigger);
    arena?.removeEventListener?.("pointerdown", focusInput);
    viewportController.destroy();
    dock.remove?.();
  };
  cleanup.blur = () => input.blur?.();
  cleanup.focus = () => focusGameplayInput(input, globalThis.window);
  return cleanup;
}
