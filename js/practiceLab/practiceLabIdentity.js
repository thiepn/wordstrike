import { enhancePracticeWorkshop, disposePracticeWorkshop } from './practiceLabWorkshop.js';
/** Practice Studio: presentation only. No session/input observers, timers or writes. */
const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeId = (value = '') => String(value).replace(/[^a-z0-9-]/gi, '');
const roots = new WeakMap();
const numbered = index => String(index + 1).padStart(2, '0');

// Original diagrams, not performance charts. No user's typing or source text enters SVG.
const drawings = Object.freeze({
  'full-assessment': '<path d="M22 70h176M36 57V41m27 16V25m27 32V13m27 44V32m27 25V20m27 37V9"/><circle cx="180" cy="27" r="16"/><path d="m172 27 6 6 10-12"/>',
  'weak-keys': '<rect x="27" y="21" width="46" height="46" rx="5"/><rect x="87" y="13" width="52" height="52" rx="5" class="pl-art-fill"/><rect x="153" y="21" width="46" height="46" rx="5"/><text x="50" y="51">Q</text><text x="113" y="48">A</text><text x="176" y="51">Z</text><path d="M96 76h34"/>',
  'combination-repair': '<rect x="42" y="20" width="51" height="51" rx="5"/><rect x="128" y="20" width="51" height="51" rx="5"/><text x="68" y="55">T</text><text x="154" y="55">H</text><path d="M94 44h32m-9-9 9 9-9 9M52 81h118"/>',
  'problem-words': '<text x="110" y="52" class="pl-art-word">rhythm</text><path d="M21 65h42m8 0h42m8 0h42m8 0h26M70 23h44"/><path d="m16 31-7 14 7 14m188-28 7 14-7 14"/>',
  'accuracy-control': '<circle cx="110" cy="46" r="33"/><circle cx="110" cy="46" r="17"/><path d="m100 46 7 7 15-18M31 46h28m102 0h28M110 3v9m0 68v9"/>',
  'burst-sprints': '<path d="m27 65 33-42H44l27-15-3 34H55L27 65ZM90 28h97M86 46h74M81 64h47"/><path d="m162 36 11 10-11 10"/>',
  'pace-ladder': '<path d="M24 76h30V59h32V42h32V25h32V8h37"/><path d="M31 29 58 12m-17 0h17v17M24 86h163"/>',
  'common-words': '<rect x="20" y="13" width="62" height="25" rx="3"/><rect x="91" y="13" width="103" height="25" rx="3"/><rect x="20" y="49" width="104" height="25" rx="3"/><rect x="133" y="49" width="61" height="25" rx="3"/><text x="51" y="30" class="pl-art-small">the</text><text x="142" y="30" class="pl-art-small">every</text><text x="72" y="66" class="pl-art-small">little</text><text x="163" y="66" class="pl-art-small">way</text>',
  'real-text': '<path d="M37 16h148M37 35h126M37 54h146M37 73h86"/><path class="pl-art-bold" d="M20 9v73"/><path d="M136 72h45m-9-9 9 9-9 9"/>',
  'consistency-trainer': '<path d="M17 47h186" class="pl-art-muted"/><path d="M17 46c14-37 20-37 34 0s20 37 34 0 20-37 34 0 20 37 34 0 20-37 34 0 10 21 16 0"/>',
  'metronome-typing': '<path d="M78 78 96 13h27l20 65ZM88 65h46M110 57l34-36"/><circle cx="110" cy="57" r="4"/><path d="M36 36v23m17-30v37m115-30v23m17-30v37"/>',
  'read-ahead': '<path d="M15 46s35-34 63 0c-28 34-63 0-63 0Z"/><circle cx="47" cy="46" r="10"/><path d="M100 35h32m8 0h27m8 0h27M100 55h28m8 0h43M92 20v53"/>',
  'endurance': '<path d="M58 63a55 55 0 1 1 105 0M76 59a36 36 0 1 1 68 0M110 46l28-22"/><circle cx="110" cy="46" r="5"/><path d="M64 79h94M82 79v-8m56 8v-8"/>',
  'punctuation-capitals': '<text x="47" y="61" class="pl-art-large">Aa</text><text x="126" y="51" class="pl-art-word">; : !</text><path d="M20 78h56m47-10h69"/>',
  'numbers-symbols': '<text x="111" y="40" class="pl-art-word">01 02 03</text><text x="111" y="72" class="pl-art-small">+   /   =   %   #</text><path d="M21 7h178"/>',
  'custom-text': '<path d="M55 7h85l24 24v51H55ZM140 7v25h24M72 46h73M72 60h46"/><path d="m178 49 14 14-14 14m-136-28-14 14 14 14"/>',
  'weakness-boss': '<path d="m110 8 50 18-8 34-42 25-42-25-8-34Z"/><path d="m86 35 12 10m36-10-12 10M93 61h34"/>',
});
export function practiceDrillArtwork(id) {
  return `<svg viewBox="0 0 220 92" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${Object.hasOwn(drawings, id) ? drawings[id] : drawings['full-assessment']}</svg>`;
}
const catalogCards = view => view.categories.flatMap(category => category.experiments).sort((a,b) => (a.category === 'assessment') - (b.category === 'assessment'));
const categoryText = Object.freeze({assessment:'Assess', precision:'Precision', speed:'Speed', fluency:'Fluency', 'real-world':'Real-world', advanced:'Advanced', custom:'Custom'});
const categoryCopy = Object.freeze({
  'weak-keys':'One letter. Better execution.', 'combination-repair':'Connect the difficult transitions.',
  'problem-words':'Make difficult words familiar.', 'accuracy-control':'Clean input. Controlled recovery.',
  'burst-sprints':'Short efforts. Deliberate recovery.', 'pace-ladder':'Find your speed–control boundary.',
  'common-words':'Build a broader typing vocabulary.', 'real-text':'Put your skills into sentences.',
  'consistency-trainer':'Find a pace you can hold.', 'metronome-typing':'Explore a steadier cadence.',
  'read-ahead':'Prepare for the next word.', 'endurance':'Stay composed over longer sessions.',
  'punctuation-capitals':'Handle the details of real writing.', 'numbers-symbols':'Make complex strings feel natural.',
  'custom-text':'Your material. Your practice.', 'full-assessment':'Measure first. Train with context.',
  'weakness-boss':'Bring targeted skills into the arcade.',
});
export function practiceLibraryMatches(card, query = '', category = 'all') {
  const terms = String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = `${card.title} ${card.description} ${card.categoryLabel} ${card.category}`.toLocaleLowerCase();
  return (category === 'all' || card.category === category) && terms.every(term => text.includes(term));
}
function navigation(items = [], current = 'home') {
  const links = [{route:'home',title:'Train'},{route:'daily-training',title:'Daily Coach'},...items];
  return `<nav class="pl-navigation" aria-label="Practice Lab navigation">${links.map(item=>`<button type="button" data-practice-action="navigate" data-route="${safeId(item.route)}"${item.route === current ? ' aria-current="page"' : ''}>${escape(item.title)}</button>`).join('')}</nav>`;
}
function cardMarkup(card, index) {
  const short = categoryCopy[card.id] ?? card.description;
  return `<article class="practice-lab-experiment-card pl-drill" data-lab-drill="${safeId(card.id)}" data-lab-category="${safeId(card.category)}">
    <div class="pl-drill-top"><span>${numbered(index)} / ${escape(card.categoryLabel)}</span><span>${escape(card.duration)}</span></div>
    <div class="pl-drill-art">${practiceDrillArtwork(card.id)}</div>
    <h3>${escape(card.title)}</h3><p>${escape(short)}</p>
    <div class="practice-lab-card-footer"><span class="pl-drill-status" data-status="${safeId(card.status)}">${escape(card.status === 'available' ? 'Ready to train' : card.status)}</span><button type="button" class="practice-lab-text-button" data-practice-action="open-experiment" data-experiment-id="${safeId(card.id)}" aria-label="Open ${escape(card.title)}"><span>OPEN</span><span aria-hidden="true">↗</span></button></div>
  </article>`;
}
function homeMarkup(view) {
  const cards = catalogCards(view);
  return `<section class="screen practice-lab-screen pl-studio-home" data-practice-view="home" data-lab-identity="studio"><div class="practice-lab-shell">
    <header class="pl-topbar"><div class="pl-wordmark"><span class="pl-mark" aria-hidden="true">W<span>/</span></span><strong>WORDSTRIKE</strong><span class="pl-topbar-divider" aria-hidden="true">/</span><span>TRAINING STUDIO</span></div><div class="pl-topbar-actions"><button type="button" class="practice-lab-help" data-practice-action="help" aria-label="Practice Lab help"${view.helpAvailable ? '' : ' disabled aria-disabled="true"'}>HELP</button><button type="button" data-practice-action="exit" aria-label="Exit Practice Lab">EXIT LAB <span aria-hidden="true">↗</span></button></div></header>
    ${navigation(view.analysis)}
    <main>
      <header class="practice-lab-header pl-hero"><div class="pl-hero-copy"><div class="eyebrow"><span class="pl-signal" aria-hidden="true"></span> PRECISION IS PRACTICED.</div><h1 tabindex="-1" data-practice-heading>Practice Lab<span>.</span></h1><p>Build your edge. One deliberate session at a time.</p><div class="pl-hero-bottom"><button type="button" class="pl-library-jump" data-lab-action="library">CHOOSE A DRILL <span aria-hidden="true">↓</span></button><span>${cards.length} experiments · Choose freely</span></div></div>
      <div class="pl-key-study" aria-hidden="true"><span class="pl-art-caption">01 / THE KEY STUDY</span><div class="pl-study-rule"></div><div class="pl-study-key pl-study-key-back">A</div><div class="pl-study-key pl-study-key-main"><span>FOCUS</span><strong>F</strong><i>↵</i></div><div class="pl-study-key pl-study-key-front">J<span>CONTROL</span></div><div class="pl-study-baseline"><span>INTENT</span><span>REPETITION</span><span>PROGRESS</span></div></div></header>
      <section class="practice-lab-feature-grid pl-session-choices" aria-label="Ways to begin">
        <article class="practice-lab-feature-card practice-lab-daily"><div class="pl-feature-number" aria-hidden="true">01</div><div class="pl-feature-copy"><div class="eyebrow">A PLAN FOR TODAY</div><h2>Daily Training</h2><p>Choose your time. Let the Coach organize your session.</p><button type="button" data-practice-action="navigate" data-route="daily-training">OPEN DAILY TRAINING <span aria-hidden="true">↗</span></button></div><div class="pl-plan-strokes" aria-hidden="true"><i></i><i></i><i></i><i></i></div></article>
        <article class="practice-lab-feature-card practice-lab-assessment"><div class="pl-feature-number" aria-hidden="true">02</div><div class="pl-feature-copy"><div class="eyebrow">ESTABLISH A BASELINE</div><h2>Full Assessment</h2><p>Quick ~4 min · Standard ~8 min · Deep ~12 min</p><button type="button" data-practice-action="open-experiment" data-experiment-id="full-assessment">VIEW ASSESSMENT <span aria-hidden="true">↗</span></button></div></article>
      </section>
      <div class="pl-freedom-note"><span aria-hidden="true">↳</span> Assessment is optional. Every available drill can be opened directly.</div>
      <section class="practice-lab-catalog pl-library" id="practice-catalog" aria-labelledby="practice-catalog-title"><div class="practice-lab-section-heading"><div><div class="eyebrow">PICK YOUR FOCUS</div><h2 id="practice-catalog-title" tabindex="-1">The drill library<span>.</span></h2></div><label class="pl-search"><span>Find a drill</span><input type="search" data-lab-search placeholder="Search skills or drills" autocomplete="off" spellcheck="false"></label></div>
        <div class="pl-library-toolbar"><div class="pl-filters" role="group" aria-label="Filter drills by skill"><button type="button" data-lab-filter="all" aria-pressed="true">All drills <span>${cards.length}</span></button>${view.categories.map(category=>`<button type="button" data-lab-filter="${safeId(category.id)}" aria-pressed="false">${escape(categoryText[category.id] ?? category.title)}</button>`).join('')}</div><p class="pl-filter-count" data-lab-count role="status" aria-live="polite" aria-atomic="true">${cards.length} experiments</p></div>
        <div class="practice-lab-experiment-grid pl-drill-grid">${cards.map(cardMarkup).join('')}</div>
        <div class="pl-search-empty" data-lab-empty hidden><h3>No matching drills</h3><p>Try another skill or clear your filters.</p><button type="button" data-lab-action="reset">SHOW ALL DRILLS</button></div>
      </section>
      <section class="pl-evidence-links" aria-label="Explore your practice evidence"><div><div class="eyebrow">BEYOND THE SESSION</div><h2>Let your practice tell the story.</h2><p>Your evidence lives in the Skill Map, Review Queue, and Progress views.</p></div><div class="practice-lab-analysis-grid">${view.analysis.map(item=>`<button type="button" data-practice-action="navigate" data-route="${safeId(item.route)}"><strong>${escape(item.title)} <span aria-hidden="true">↗</span></strong><span>${escape(item.description)}</span></button>`).join('')}</div></section>
    </main><footer class="pl-footer"><strong>WORDSTRIKE <span>/</span> PRACTICE LAB</strong><span>Practice deliberately. Measure honestly.</span></footer>
  </div></section>`;
}
function applyFilters(root, state) {
  const screen = root.querySelector?.('.pl-studio-home');
  if (!screen) return;
  let count = 0;
  for (const element of screen.querySelectorAll('[data-lab-drill]')) {
    const card = state.cards.find(item => item.id === element.dataset.labDrill);
    const visible = Boolean(card) && practiceLibraryMatches(card, state.query, state.category);
    element.hidden = !visible;
    if (visible) count++;
  }
  for (const button of screen.querySelectorAll('[data-lab-filter]')) button.setAttribute('aria-pressed', String(button.dataset.labFilter === state.category));
  const counter = screen.querySelector('[data-lab-count]');
  if (counter) counter.textContent = `${count} of ${state.cards.length} experiments`;
  const empty = screen.querySelector('[data-lab-empty]');
  if (empty) empty.hidden = count !== 0;
}
function wire(root) {
  if (roots.has(root)) return roots.get(root);
  const state = { cards:[], query:'', category:'all', analysis:[] };
  const onInput = event => {
    if (!event.target.matches?.('[data-lab-search]')) return;
    state.query = event.target.value;
    applyFilters(root, state);
  };
  const onClick = event => {
    const button = event.target.closest?.('[data-lab-filter], [data-lab-action]');
    if (!button || !root.contains(button)) return;
    if (button.dataset.labFilter) { state.category = button.dataset.labFilter; applyFilters(root, state); }
    if (button.dataset.labAction === 'reset') {
      state.query = ''; state.category = 'all';
      const input = root.querySelector('[data-lab-search]'); if (input) input.value = '';
      applyFilters(root, state); input?.focus({preventScroll:true});
    }
    if (button.dataset.labAction === 'library') {
      const heading = root.querySelector('#practice-catalog-title');
      heading?.scrollIntoView({block:'start',behavior:'instant'}); heading?.focus({preventScroll:true});
    }
  };
  root.addEventListener?.('input', onInput);
  root.addEventListener?.('click', onClick);
  state.dispose = () => { root.removeEventListener?.('input', onInput); root.removeEventListener?.('click', onClick); };
  roots.set(root, state);
  return state;
}
export function disposePracticeLabPresentation(root) {
  disposePracticeWorkshop(root); roots.get(root)?.dispose(); roots.delete(root);
}
export function renderPracticeLabHome(root, view, {focusSelector = null} = {}) {
  const state = wire(root);
  const active = root.ownerDocument?.activeElement;
  const restoreSearch = active?.matches?.('[data-lab-search]');
  const restoreFilter = active?.dataset?.labFilter;
  const selection = restoreSearch ? [active.selectionStart,active.selectionEnd] : null;
  state.cards = catalogCards(view); state.analysis = view.analysis;
  root.innerHTML = homeMarkup(view); // Every model string is escaped; art is a fixed allowlist.
  const search = root.querySelector?.('[data-lab-search]');
  if (search) search.value = state.query;
  applyFilters(root, state);
  enhancePracticeWorkshop(root, view);
  const target = restoreSearch ? search : (restoreFilter && root.querySelector?.(`[data-lab-filter="${safeId(restoreFilter)}"]`)) || (focusSelector && root.querySelector?.(focusSelector)) || root.querySelector?.('[data-practice-heading]');
  target?.focus?.({preventScroll:true});
  if (restoreSearch && selection) search?.setSelectionRange?.(...selection);
  return true;
}
const disclosures = new Set(['What this mode does','Evidence boundary','Why these are separate','What this assessment does not claim','Why this plan?','Interpretation boundary','Recommended keys','Recommended targets','Recommended words']);
export function enhancePracticeLabView(root, view) {
  const screen = root.querySelector?.('.practice-lab-screen');
  if (!screen || screen.dataset.labIdentity || !screen.ownerDocument?.createElement) return;
  screen.dataset.labIdentity = 'studio';
  const document = screen.ownerDocument;
  let shell = screen.querySelector('.practice-lab-shell');
  const main = screen.querySelector('main');
  if (!shell || !main) return;
  if (shell === main) {
    const active = document.activeElement;
    const wrapper = document.createElement('div'); wrapper.className = 'practice-lab-shell';
    main.before(wrapper); main.classList.remove('practice-lab-shell'); wrapper.append(main); shell = wrapper;
    if (main.contains(active)) active.focus?.({preventScroll:true});
  }
  const state = wire(root);
  const title = main.querySelector('h1') ?? screen.querySelector('h1');
  const navHolder = document.createElement('div');
  const current = view.kind === 'treatment-response-progress' ? 'progress' : view.experimentId ? 'home' : view.kind;
  navHolder.innerHTML = navigation(state.analysis.length ? state.analysis : [{route:'skill-map',title:'Skill Map'},{route:'review-queue',title:'Review Queue'},{route:'progress',title:'Progress'}], current); // Escaped route metadata only.
  const existingHeader = shell.querySelector(':scope > header');
  if (existingHeader) existingHeader.after(navHolder.firstElementChild);
  else shell.prepend(navHolder.firstElementChild);
  const id = view.experimentId;
  if (Object.hasOwn(drawings, id) && title) {
    const art = document.createElement('div'); art.className = 'pl-detail-art'; art.setAttribute('aria-hidden','true');
    art.innerHTML = practiceDrillArtwork(id); // Fixed artwork; unknown IDs use a fixed fallback.
    title.before(art);
    main.classList.add('pl-detail-with-art');
    const start = main.querySelector('[data-practice-action^="start-"], [data-practice-action="custom-start"], [data-practice-action="prepare-combination-repair"]');
    start?.classList.add('practice-lab-primary-action');
  }
  // Only explanatory sections become disclosures. Setup controls and warnings stay visible.
  for (const section of main.querySelectorAll(':scope > section.practice-lab-empty-state')) {
    const heading = section.querySelector(':scope > h2');
    if (!heading || !disclosures.has(heading.textContent.trim()) || section.querySelector('button,input,textarea,select,[role="alert"]')) continue;
    const details = document.createElement('details'); details.className = 'pl-method-note';
    const summary = document.createElement('summary'); summary.textContent = heading.textContent;
    details.append(summary); heading.remove();
    while (section.firstChild) details.append(section.firstChild);
    section.replaceWith(details);
  }
  enhancePracticeWorkshop(root, view);
}
