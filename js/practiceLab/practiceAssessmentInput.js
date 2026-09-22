import { createPracticeSegmenter } from './practiceTextSegmentation.js';

/** One block owns one keyboard capture. No document-level typing interception. */
export function bindPracticeAssessmentInput({ input, passage, send, isActive = () => true, onFocusChange = () => {} }) {
  const segment = createPracticeSegmenter();
  let disposed = false;
  let composing = false;
  let compositionTail = null;
  let tailTimer = null;
  const active = () => !disposed && isActive();
  const clearTail = () => { clearTimeout(tailTimer); tailTimer = null; compositionTail = null; };
  const empty = () => { input.value = ''; };
  const insert = text => {
    if (!active() || typeof text !== 'string') return;
    for (const value of segment(text.normalize('NFC'))) {
      if (!active()) break;
      send(value === ' ' ? 'space' : 'character', value);
    }
  };
  const cancel = event => { if (event.cancelable !== false) event.preventDefault(); };
  const blocked = event => { cancel(event); if (!composing) empty(); };
  const beforeInput = event => {
    if (!active()) { blocked(event); return; }
    // Intermediate IME text belongs to the browser, not to assessment scoring.
    if (composing || event.isComposing || ['insertCompositionText', 'deleteCompositionText'].includes(event.inputType)) return;
    if (compositionTail !== null && ['insertFromComposition', 'insertText'].includes(event.inputType) && event.data === compositionTail) {
      cancel(event); empty(); return;
    }
    if (['insertText', 'insertFromComposition', 'insertReplacementText'].includes(event.inputType)) {
      if (event.cancelable === false) return; // Native input fallback below.
      cancel(event); insert(event.data); empty();
    } else if (['insertLineBreak', 'insertParagraph'].includes(event.inputType)) {
      if (event.cancelable === false) return;
      cancel(event); insert('\n'); empty();
    } else if (['deleteContentBackward', 'deleteWordBackward'].includes(event.inputType)) {
      cancel(event); send(event.inputType === 'deleteWordBackward' ? 'word-delete' : 'backspace', ''); empty();
    } else blocked(event); // Paste, drop, undo and autofill are not measured typing.
  };
  const nativeInput = event => {
    if (composing || event.isComposing) return;
    if (!active()) { empty(); return; }
    if (compositionTail !== null && input.value === compositionTail) { empty(); return; }
    if (['insertText', 'insertReplacementText', 'insertFromComposition', 'insertCompositionText'].includes(event.inputType)) insert(input.value);
    else if (['insertLineBreak', 'insertParagraph'].includes(event.inputType)) insert('\n');
    empty();
  };
  const compositionStart = () => { if (active()) { clearTail(); composing = true; } };
  const compositionEnd = event => {
    composing = false;
    if (!active()) { empty(); return; }
    // Some engines emit a final input event after compositionend. Suppress only
    // that same-task tail; a subsequent intentional keystroke remains valid.
    clearTail(); compositionTail = event.data ?? '';
    insert(compositionTail); empty();
    tailTimer = setTimeout(clearTail, 0);
  };
  const keyDown = event => {
    if (!composing && !event.isComposing && event.key !== 'Process' && event.keyCode !== 229) clearTail();
  };
  const focus = () => { if (active()) input.focus({ preventScroll: true }); };
  const focusIn = () => onFocusChange(true);
  const focusOut = () => onFocusChange(false);
  const listeners = [
    ['beforeinput', beforeInput], ['input', nativeInput], ['compositionstart', compositionStart],
    ['compositionend', compositionEnd], ['keydown', keyDown], ['paste', blocked], ['drop', blocked],
    ['focus', focusIn], ['blur', focusOut],
  ];
  for (const [name, listener] of listeners) input.addEventListener(name, listener);
  passage.addEventListener('click', focus);
  return Object.freeze({
    focus,
    dispose() {
      if (disposed) return;
      disposed = true; clearTail();
      for (const [name, listener] of listeners) input.removeEventListener(name, listener);
      passage.removeEventListener('click', focus);
    },
  });
}
