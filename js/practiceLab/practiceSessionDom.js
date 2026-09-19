/** Patch session markup without replacing the active keyboard capture or controls. */
const renders = new WeakMap();
const wired = new WeakSet();
function key(node) {
  if (node.nodeType !== 1) return `node:${node.nodeType}`;
  const marker = Array.from(node.attributes).find(a => a.name.startsWith('data-') && /(?:input|session-action|practice-view)$/.test(a.name));
  return `${node.tagName}:${marker?.name ?? ''}`;
}
function patch(current, next) {
  if (current.nodeType !== 1) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  for (const attr of Array.from(current.attributes)) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  for (const attr of Array.from(next.attributes)) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  // The browser owns selection, composition and value while typing. Do not reset them.
  if (current.tagName === 'TEXTAREA' || current.tagName === 'INPUT') return;
  patchChildren(current, next);
}
function patchChildren(current, next) {
  let cursor = current.firstChild;
  for (const desired of Array.from(next.childNodes)) {
    let match = cursor;
    while (match && key(match) !== key(desired)) match = match.nextSibling;
    if (!match) { current.insertBefore(desired.cloneNode(true), cursor); continue; }
    // Insertions (e.g. the pause notice) must not detach an existing textarea.
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
  // Timer ticks must not steal focus from Stop/Pause, links or another editor.
  if (!force && active && active !== doc.body && active !== doc.documentElement && active.isConnected) return;
  input.focus?.({ preventScroll: true });
}
export function renderPracticeSessionMarkup(root, markup) {
  const doc = root.ownerDocument;
  if (!doc?.createElement) { root.innerHTML = markup; return; }
  const previous = renders.get(root);
  if (previous?.markup === markup && previous.first === root.firstChild) return;
  const template = doc.createElement('template');
  template.innerHTML = markup;
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
