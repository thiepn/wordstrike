/** Setup/catalog presentation only. No session hooks, storage, timers, or observers. */
const preferences = new WeakMap();
const families = Object.freeze({
  'full-assessment':'assessment','weak-keys':'precision','combination-repair':'precision',
  'problem-words':'precision','accuracy-control':'precision','burst-sprints':'speed',
  'pace-ladder':'advanced','common-words':'fluency','real-text':'real-world',
  'consistency-trainer':'fluency','metronome-typing':'fluency','read-ahead':'fluency',
  'endurance':'fluency','punctuation-capitals':'real-world','numbers-symbols':'real-world',
  'custom-text':'custom','weakness-boss':'advanced',
});
export function practiceWorkshopFamily(id) { return Object.hasOwn(families, id) ? families[id] : 'general'; }
export function practiceWorkshopLayout(value) { return value === 'list' ? 'list' : 'cards'; }
export function practiceLetterIndex(index, key) {
  if (key === 'Home') return 0;
  if (key === 'End') return 25;
  if (key === 'ArrowRight') return (index + 1) % 26;
  if (key === 'ArrowLeft') return (index + 25) % 26;
  return index;
}
/** Preserve only the new picker focus across existing asynchronous setup refreshes. */
export function capturePracticeWorkshopFocus(root) {
  const active = root.ownerDocument?.activeElement;
  return active?.matches?.('[data-lab-letter]') && root.contains?.(active) && /^[a-z]$/.test(active.dataset.labLetter)
    ? active.dataset.labLetter : null;
}
export function restorePracticeWorkshopFocus(root, letter) {
  if (!/^[a-z]$/.test(letter ?? '')) return;
  const button = root.querySelector?.(`[data-lab-letter="${letter}"]`);
  if (!button) return;
  for (const key of root.querySelectorAll('[data-lab-letter]')) key.tabIndex = key === button ? 0 : -1;
  button.focus({preventScroll:true});
}
function node(document, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function preferencesFor(root) {
  if (!preferences.has(root)) preferences.set(root, {layout:'cards'});
  return preferences.get(root);
}
export function disposePracticeWorkshop(root) { preferences.delete(root); }
function enhanceLibrary(root, screen, document) {
  const toolbar = screen.querySelector('.pl-library-toolbar');
  if (!toolbar) return;
  const state = preferencesFor(root);
  const controls = node(document, 'div', 'pl-library-utility');
  const count = toolbar.querySelector('[data-lab-count]');
  if (count) controls.append(count);
  const group = node(document, 'div', 'pl-layout-switch');
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Drill library layout');
  for (const layout of ['cards','list']) {
    const button = node(document, 'button', '', layout === 'cards' ? 'Cards' : 'List');
    button.type = 'button'; button.dataset.labLayout = layout;
    button.setAttribute('aria-label', `${layout === 'cards' ? 'Card' : 'Compact list'} view`);
    const icon = node(document, 'span', `pl-layout-icon pl-layout-icon-${layout}`);
    icon.setAttribute('aria-hidden','true');
    for (let i=0;i<4;i++) icon.append(node(document,'i'));
    button.prepend(icon); group.append(button);
  }
  const apply = () => {
    screen.dataset.labLayout = practiceWorkshopLayout(state.layout);
    for (const button of group.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.labLayout === state.layout));
  };
  group.addEventListener('click', event => {
    const button = event.target.closest?.('[data-lab-layout]');
    if (!button || !group.contains(button)) return;
    state.layout = practiceWorkshopLayout(button.dataset.labLayout); apply();
  });
  controls.append(group); toolbar.append(controls); apply();
  // Native button hit areas expand to the card without duplicate links or key handlers.
  for (const card of screen.querySelectorAll('[data-lab-drill]')) card.classList.add('pl-training-cartridge');
}
function enhanceLetterPicker(screen, document) {
  const input = screen.querySelector('[data-weak-key-target]');
  if (!input) return;
  const section = input.closest('section');
  const heading = section?.querySelector('h2');
  if (heading?.textContent === 'Manual key') heading.textContent = 'Choose your letter';
  const field = input.closest('label');
  if (!field) return;
  const group = node(document, 'div', 'pl-letter-picker');
  group.setAttribute('role', 'toolbar'); group.setAttribute('aria-label', 'Choose a target letter');
  group.setAttribute('aria-describedby','pl-letter-picker-help');
  const selected = /^[a-z]$/i.test(input.value) ? input.value.toLowerCase() : '';
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const button = node(document,'button','pl-letter-key',letter.toUpperCase());
    button.type = 'button'; button.dataset.labLetter = letter;
    button.dataset.practiceAction = 'choose-weak-key'; button.dataset.entityKey = letter;
    button.dataset.targetSource = 'manual';
    button.setAttribute('aria-label', `Train the letter ${letter.toUpperCase()}`);
    button.setAttribute('aria-pressed', String(letter === selected));
    button.tabIndex = letter === (selected || 'a') ? 0 : -1;
    group.append(button);
  }
  group.addEventListener('click', event => {
    const button = event.target.closest?.('[data-lab-letter]');
    if (button && group.contains(button)) button.focus({preventScroll:true});
  }, true);
  group.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const buttons = [...group.querySelectorAll('button')];
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault(); event.stopPropagation();
    const next = practiceLetterIndex(index,event.key);
    buttons.forEach((button, position) => { button.tabIndex = position === next ? 0 : -1; });
    buttons[next].focus({preventScroll:true});
  });
  const help = node(document,'p','pl-picker-help','Pick a letter or type one below. Arrow keys browse; Enter selects.');
  help.id = 'pl-letter-picker-help'; field.before(group,help);
  // An alphabetical selector makes no assumptions about the user's keyboard layout.
}
function enhanceSetup(screen, view, document) {
  if (!view.experimentId) return;
  const main = screen.querySelector('main.practice-lab-detail');
  const title = main?.querySelector(':scope > h1');
  if (!main || !title) return;
  screen.dataset.labFamily = practiceWorkshopFamily(view.experimentId);
  const intro = node(document,'header','pl-setup-intro');
  for (const element of [...main.children]) {
    if (element.matches('.eyebrow,h1,.practice-lab-lead,.pl-detail-art')) intro.append(element);
  }
  main.prepend(intro);
  const steps = node(document,'ol','pl-workflow'); steps.setAttribute('aria-label','Session workflow');
  for (const [index,label] of ['Set up','Practice','Review'].entries()) {
    const step = node(document,'li');
    step.append(node(document,'span','pl-workflow-number',String(index+1).padStart(2,'0')),node(document,'span','',label));
    if (!index) step.setAttribute('aria-current','step');
    steps.append(step);
  }
  intro.after(steps);
  // Move only noninteractive explanatory prose, never privacy notices or warnings.
  const methodology = [...main.querySelectorAll(':scope > details.pl-method-note')].find(element => element.querySelector('summary')?.textContent === 'What this mode does');
  if (methodology) for (const paragraph of [...main.querySelectorAll(':scope > p')]) {
    if (!paragraph.hasAttribute('role') && !paragraph.querySelector('button,input,select,textarea,a')) methodology.append(paragraph);
  }
  if (['numbers-symbols','punctuation-capitals'].includes(view.experimentId)) {
    const sections = [...main.querySelectorAll(':scope > section.practice-lab-empty-state')];
    if (sections.length === 2 && sections.every(section => section.querySelector('button[data-practice-action]'))) {
      const active = document.activeElement;
      const pair = node(document,'div','pl-dual-setup');
      sections[0].before(pair); pair.append(...sections);
      if (pair.contains(active)) active.focus({preventScroll:true});
    }
  }
  enhanceLetterPicker(screen, document);
  const protocol = main.querySelector(':scope > section .practice-weak-key-plan, :scope > section .practice-combination-plan')?.closest('section');
  const primary = main.querySelector('[data-weak-key-target], [data-combination-target]')?.closest('section');
  if (protocol && primary && protocol !== primary && primary.parentNode === main && protocol.parentNode === main) {
    const active = document.activeElement;
    const workbench = node(document,'div','pl-setup-workbench');
    primary.before(workbench); primary.classList.add('pl-setup-controls'); protocol.classList.add('pl-setup-protocol');
    workbench.append(primary,protocol);
    // Reparenting setup controls must not lose the existing field's focus.
    if (workbench.contains(active)) active.focus({preventScroll:true});
  }
}
export function enhancePracticeWorkshop(root, view = {}) {
  const screen = root.querySelector?.('.practice-lab-screen');
  const document = screen?.ownerDocument;
  if (!document?.createElement || screen.dataset.labWorkshop) return;
  // Only explicitly decorated setup/catalog routes. Live hosts stay untouched.
  if (screen.dataset.labIdentity !== 'studio') return;
  screen.dataset.labWorkshop = 'precision';
  if (screen.matches('.pl-studio-home')) enhanceLibrary(root,screen,document);
  else enhanceSetup(screen,view,document);
}
