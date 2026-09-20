/** Patch host markup without replacing the active keyboard capture or controls. */
const renders = new WeakMap();
const wired = new WeakSet();
const correctionRoots = new WeakSet();
function key(node) {
  if (node.nodeType !== 1) return `node:${node.nodeType}`;
  if (!['TEXTAREA', 'INPUT', 'BUTTON'].includes(node.tagName)) return node.tagName;
  const marker = Array.from(node.attributes).find(a => a.name.startsWith('data-') && /(?:input|session-action|practice-view)$/.test(a.name));
  return `${node.tagName}:${marker?.name ?? ''}`;
}
function patch(current, next) {
  // Native subtree equality skips unchanged passages on timer-only updates.
  if (current.isEqualNode?.(next)) return;
  if (current.nodeType !== 1) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  for (const attr of Array.from(current.attributes)) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  for (const attr of Array.from(next.attributes)) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  // The browser owns selection, composition and value while typing.
  if (current.tagName === 'TEXTAREA' || current.tagName === 'INPUT') return;
  patchChildren(current, next);
}
function patchChildren(current, next) {
  let cursor = current.firstChild;
  for (const desired of Array.from(next.childNodes)) {
    let match = cursor;
    while (match && key(match) !== key(desired)) match = match.nextSibling;
    if (!match) { current.insertBefore(desired.cloneNode(true), cursor); continue; }
    if (match !== cursor) current.insertBefore(match, cursor);
    patch(match, desired);
    cursor = match.nextSibling;
  }
  while (cursor) { const nextNode = cursor.nextSibling; current.removeChild(cursor); cursor = nextNode; }
}
export function focusPracticeSessionInput(root, selector, { force = false } = {}) {
  const input = root.querySelector?.(selector);
  if (!input || input.disabled) return;
  const doc = root.ownerDocument;
  const active = doc?.activeElement;
  if (active === input) return;
  if (!force && active && active !== doc.body && active !== doc.documentElement && active.isConnected) return;
  input.focus?.({ preventScroll: true });
}
export function scrollPracticeTypingCursor(root) {
  const cursor = root.querySelector?.('.practice-real-text-typing .is-current, .practice-weak-key-typing .is-current, .practice-combination-typing .is-current, [data-protocol-text] [aria-current="true"]');
  const box = cursor?.closest?.('.practice-real-text-typing, .practice-weak-key-typing, .practice-combination-typing, [data-protocol-text]');
  if (!box || box.scrollHeight <= box.clientHeight) return;
  const region = box.getBoundingClientRect(), rect = cursor.getBoundingClientRect();
  if (rect.bottom > region.bottom - 20) box.scrollTop += rect.bottom - region.bottom + 20;
  else if (rect.top < region.top + 20) box.scrollTop -= region.top - rect.top + 20;
}
/** Empty textareas do not emit native delete-beforeinput consistently.
 * Route physical Backspace through the existing normalizer exactly once.
 * Touch keyboard beforeinput and IME composition remain owned by each host.
 */
export function wirePracticeKeyboardCorrections(root) {
  if (!root?.addEventListener || correctionRoots.has(root)) return;
  correctionRoots.add(root);
  let composingCapture = null;
  let compositionTail = null;
  let tailTimer = null;
  const clearTail = () => { clearTimeout(tailTimer); tailTimer = null; compositionTail = null; };
  const practiceCapture = target => {
    const capture = target?.closest?.('textarea');
    if (!capture || capture.disabled || !capture.closest('.practice-lab-screen')) return null;
    if (!Array.from(capture.attributes).some(a => a.name.startsWith('data-') && a.name.endsWith('-input'))) return null;
    return capture;
  };
  // Full Assessment already owns a dedicated composition-safe input binder.
  const compatibilityCapture = target => {
    const capture = practiceCapture(target);
    return capture?.hasAttribute?.('data-assessment-input') ? null : capture;
  };
  const dispatchBeforeInput = (capture, inputType, data = null) => {
    const InputEventClass = capture?.ownerDocument?.defaultView?.InputEvent;
    if (!InputEventClass) return false;
    return capture.dispatchEvent(new InputEventClass('beforeinput', {
      bubbles: true, cancelable: true, inputType, data,
    }));
  };
  root.addEventListener('compositionstart', event => {
    const capture = compatibilityCapture(event.target);
    if (!capture) return;
    clearTail();
    composingCapture = capture;
  }, true);
  root.addEventListener('compositionend', event => {
    const capture = compatibilityCapture(event.target);
    if (!capture) return;
    composingCapture = null;
    const data = typeof event.data === 'string' ? event.data : capture.value;
    clearTail();
    compositionTail = data ?? '';
    if (compositionTail) dispatchBeforeInput(capture, 'insertText', compositionTail);
    capture.value = '';
    tailTimer = setTimeout(clearTail, 0);
  }, true);
  root.addEventListener('beforeinput', event => {
    const capture = compatibilityCapture(event.target);
    if (!capture) return;
    const type = event.inputType;
    // Intermediate IME updates belong to the browser. Commit exactly once on
    // compositionend, then suppress the browser's same-task final tail.
    if (type === 'insertCompositionText' || type === 'deleteCompositionText' || event.isComposing || composingCapture === capture) {
      event.stopPropagation();
      return;
    }
    if (compositionTail !== null && type === 'insertFromComposition' && event.data === compositionTail) {
      if (event.cancelable !== false) event.preventDefault();
      event.stopPropagation();
      capture.value = '';
      return;
    }
    // Some mobile engines expose a non-cancelable beforeinput. Let the browser
    // update the textarea and normalize it from the following native input.
    if (event.cancelable === false && ['insertText','insertReplacementText','insertFromComposition','insertLineBreak','insertParagraph'].includes(type)) {
      event.stopPropagation();
      return;
    }
    if (type === 'insertReplacementText' || type === 'insertFromComposition') {
      event.preventDefault();
      event.stopPropagation();
      const data = typeof event.data === 'string' ? event.data : capture.value;
      if (data) dispatchBeforeInput(capture, 'insertText', data);
      capture.value = '';
      return;
    }
    if (type === 'insertLineBreak' || type === 'insertParagraph') {
      event.preventDefault();
      event.stopPropagation();
      dispatchBeforeInput(capture, 'insertText', '\n');
      capture.value = '';
    }
  }, true);
  root.addEventListener('input', event => {
    const capture = compatibilityCapture(event.target);
    if (!capture || composingCapture === capture || event.isComposing) return;
    const type = event.inputType;
    const value = capture.value;
    if (compositionTail !== null && value === compositionTail) {
      capture.value = '';
      return;
    }
    if (value && ['insertText','insertReplacementText','insertFromComposition','insertCompositionText'].includes(type)) {
      dispatchBeforeInput(capture, 'insertText', value);
    } else if (['insertLineBreak','insertParagraph'].includes(type)) {
      dispatchBeforeInput(capture, 'insertText', '\n');
    }
    capture.value = '';
  }, true);
  root.addEventListener('keydown', event => {
    const capture = practiceCapture(event.target);
    if (!capture) return;
    if (!event.isComposing && event.key !== 'Process' && event.keyCode !== 229) clearTail();
    if (event.key !== 'Backspace' || event.defaultPrevented || event.isComposing) return;
    const InputEventClass = capture.ownerDocument.defaultView?.InputEvent;
    if (!InputEventClass) return;
    event.preventDefault();
    capture.dispatchEvent(new InputEventClass('beforeinput', {
      bubbles: true, cancelable: true,
      inputType: event.ctrlKey || event.altKey || event.metaKey ? 'deleteWordBackward' : 'deleteContentBackward',
    }));
  }, true);
  root.addEventListener('beforeinput', event => {
    if (practiceCapture(event.target)) queueMicrotask(() => scrollPracticeTypingCursor(root));
  });
}
export function renderPracticeSessionMarkup(root, markup) {
  wirePracticeKeyboardCorrections(root);
  const doc = root.ownerDocument;
  if (!doc?.createElement) { root.innerHTML = markup; return; }
  const previous = renders.get(root);
  if (previous?.markup === markup && previous.first === root.firstChild) return;
  const template = doc.createElement('template');
  // The passage uses pre-wrap; real spaces allow word-boundary line wrapping.
  template.innerHTML = markup.replaceAll('>&nbsp;</span>', '> </span>');
  for (const passage of template.content.querySelectorAll('.practice-real-text-typing, .practice-weak-key-typing, .practice-combination-typing, [data-protocol-text]')) {
    if (!passage.hasAttribute('tabindex')) passage.setAttribute('tabindex', '0');
    if (!passage.hasAttribute('role')) passage.setAttribute('role', 'region');
  }
  for (const input of template.content.querySelectorAll('textarea')) {
    input.classList.add('practice-session-input');
    input.setAttribute('data-practice-session-capture', '');
    input.setAttribute('placeholder', 'Click or tap here to type. Backspace corrects mistakes.');
    input.setAttribute('rows', '1');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.removeAttribute('style');
  }
  patchChildren(root, template.content);
  renders.set(root, { markup, first: root.firstChild });
  if (!wired.has(root)) {
    wired.add(root);
    root.addEventListener('click', event => {
      if (event.target?.closest?.('button, a, input, textarea, select, [role="button"]')) return;
      if (event.target?.closest?.('.practice-real-text-typing, .practice-weak-key-typing, .practice-combination-typing')) {
        focusPracticeSessionInput(root, '[data-practice-session-capture]', { force: true });
      }
    });
  }
}
