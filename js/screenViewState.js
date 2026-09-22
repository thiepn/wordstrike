/** Preserve an existing view during data-only updates, never continuously chase scroll. */
let interactionRevision = 0, renderRevision = 0;
let pendingView = null;
for (const type of ['wheel', 'touchmove', 'pointerdown', 'keydown']) globalThis.document?.addEventListener?.(type, () => { interactionRevision++; }, { capture: true, passive: true });
const escape = value => globalThis.CSS?.escape?.(value) ?? String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
function selectorFor(element, root) {
  if (element === root) return ':scope';
  if (element.id) return `#${escape(element.id)}`;
  const path = [];
  let node = element;
  while (node && node !== root) {
    if (node.id) { path.unshift(`#${escape(node.id)}`); break; }
    const classes = [...(node.classList ?? [])].filter(c => !['selected', 'active', 'is-active'].includes(c));
    if (classes.length && root.querySelectorAll(`.${escape(classes[0])}`).length === 1) { path.unshift(`.${escape(classes[0])}`); break; }
    path.unshift(`${node.tagName.toLowerCase()}:nth-child(${[...node.parentElement.children].indexOf(node) + 1})`);
    node = node.parentElement;
  }
  return path.join(' > ');
}
export function captureScreenView(root) {
  if (!root?.querySelectorAll) return null;
  // CSS/presentation observers temporarily collapse a replaced page before the
  // next frame. A second data update must keep the original position, not adopt
  // that intermediate zero-scroll layout as the user's chosen position.
  if (pendingView?.root === root && pendingView.state.interaction === interactionRevision) return pendingView.state;
  const active = root.contains(root.ownerDocument.activeElement) ? root.ownerDocument.activeElement : null;
  return {
    interaction: interactionRevision,
    page: [globalThis.scrollX ?? 0, globalThis.scrollY ?? 0],
    scroll: [root, ...root.querySelectorAll('*')].filter(e => e.scrollTop || e.scrollLeft).map(e => [selectorFor(e, root), e.scrollLeft, e.scrollTop]),
    inputs: [...root.querySelectorAll('input, textarea')].filter(e => !e.matches('.gameplay-input, [type=checkbox], [type=radio], [type=file]')).map(e => ({ selector: selectorFor(e, root), value: e.value, start: e.selectionStart, end: e.selectionEnd, focused: e === active })),
    details: [...root.querySelectorAll('details')].map(e => ({ selector: selectorFor(e, root), open: e.open })),
    resultTab: root.querySelector('[data-v6-tab][aria-selected=true]')?.dataset.v6Tab,
  };
}
export function restoreScreenView(root, state) {
  const revision = ++renderRevision;
  pendingView = state && root ? { root, state } : null;
  if (!pendingView) return;
  const restore = () => {
    if (revision !== renderRevision || state.interaction !== interactionRevision) return;
    if (state.resultTab) {
      const tab = root.querySelector(`[data-v6-tab="${escape(state.resultTab)}"]`);
      if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
    }
    for (const detail of state.details) { const element = root.querySelector(detail.selector); if (element) element.open = detail.open; }
    for (const input of state.inputs) {
      const element = root.querySelector(input.selector);
      if (!element || !element.matches('input, textarea')) continue;
      element.value = input.value;
      if (input.focused) {
        element.focus({ preventScroll: true });
        if (input.start != null) { try { element.setSelectionRange(input.start, input.end); } catch { /* Non-text input. */ } }
      }
    }
    for (const [selector, left, top] of state.scroll) {
      const element = selector === ':scope' ? root : root.querySelector(selector);
      if (element) { element.scrollLeft = left; element.scrollTop = top; }
    }
    if ((globalThis.scrollX ?? 0) !== state.page[0] || (globalThis.scrollY ?? 0) !== state.page[1]) globalThis.scrollTo?.(...state.page);
    pendingView = null;
  };
  // Presentation modules enhance the replaced DOM in microtasks. Restore once
  // after those modules finish, cancelling if the user has since interacted.
  if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(restore);
  else restore();
}
