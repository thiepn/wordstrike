/** Strike Studio: navigation-only composition. No typing/input observers or timers. */
import { getAllModes } from './modes.js';

const ART = Object.freeze({
  campaign: { label: 'DEFEND THE CORE', detail: '100 levels. One objective.', symbol: '01', path: '<path d="M80 244 170 184 262 218 358 118 454 155 560 66"/><path d="m534 66 26 0 0 26"/><circle cx="80" cy="244" r="10"/><circle cx="170" cy="184" r="10"/><circle cx="262" cy="218" r="10"/><circle cx="358" cy="118" r="10"/><circle cx="454" cy="155" r="10"/>' },
  'speed-test': { label: 'FIND YOUR TEMPO', detail: 'Speed means nothing without control.', symbol: '02', path: '<path d="M80 220h48v-44h48v44h48v-88h48v88h48V88h48v132h48v-66h48v66h48V52h48v168h40"/><path d="M80 270h480"/>' },
  endless: { label: 'OUTLAST THE PRESSURE', detail: 'Stay sharp. Stay in the game.', symbol: '03', path: '<circle cx="320" cy="170" r="116"/><circle cx="320" cy="170" r="76"/><circle cx="320" cy="170" r="28"/><path d="M320 24v54m0 184v54M174 170h54m184 0h54M320 170l90-90"/>' },
  flow: { label: 'STAY IN THE FLOW', detail: 'Longer thoughts. Unbroken rhythm.', symbol: '04', path: '<path d="M65 210c85 0 70-116 155-116s65 160 150 160S470 110 575 110M65 242c85 0 70-116 155-116s65 160 150 160S470 142 575 142M65 178c85 0 70-116 155-116s65 160 150 160S470 78 575 78"/>' },
  practice: { label: 'BUILD YOUR EDGE', detail: 'Small improvements. Stronger fundamentals.', symbol: '05', path: '<rect x="112" y="64" width="88" height="88" rx="12"/><rect x="218" y="64" width="88" height="88" rx="12"/><rect x="324" y="64" width="88" height="88" rx="12"/><rect x="430" y="64" width="88" height="88" rx="12"/><rect x="164" y="172" width="88" height="88" rx="12"/><rect x="270" y="172" width="88" height="88" rx="12"/><path d="m291 215 15 15 27-31"/><rect x="376" y="172" width="88" height="88" rx="12"/>' },
});

function element(document, tag, className, markup) {
  const node = document.createElement(tag);
  node.className = className;
  if (markup) node.innerHTML = markup; // Static, authored markup only.
  return node;
}

function enhanceTitle(screen) {
  const document = screen.ownerDocument;
  const hero = screen.querySelector('.title-hero');
  const main = screen.querySelector('.title-main');
  if (!hero || !main) return;
  const headline = element(document, 'h2', 'studio-headline', 'MAKE EVERY<br><span>KEY COUNT.</span>');
  hero.querySelector('.title-kicker')?.after(headline);
  const logo = hero.querySelector('.brand-logo');
  const brand = screen.querySelector('.title-brand-label');
  if (logo && brand) { logo.alt = ''; logo.width = 48; logo.height = 48; brand.prepend(logo); }
  const art = element(document, 'div', 'studio-key-art', `
    <div class="studio-art-top"><span>THE TYPING ARCADE</span><span>WS / 01</span></div>
    <div class="studio-key-orbit"></div>
    <div class="studio-key-shadow"></div>
    <div class="studio-keycap"><span class="studio-keycap-label">WORDSTRIKE</span><strong>W</strong><span class="studio-keycap-enter">ENTER ↵</span></div>
    <div class="studio-art-ticker"><span>SPEED</span><i></i><span>ACCURACY</span><i></i><span>CONTROL</span></div>
  `);
  art.setAttribute('aria-hidden', 'true');
  main.insertBefore(art, screen.querySelector('.title-global-nav'));
  const count = getAllModes().filter(mode => mode.enabled).length;
  const subcopy = hero.querySelector('.title-start-copy small');
  if (subcopy) subcopy.textContent = `${count} ways to find your edge`;
}

function enhanceModes(screen) {
  const selected = screen.querySelector('.mode-option.selected');
  const modeId = selected?.dataset.modeId;
  const art = ART[modeId];
  const visual = screen.querySelector('.mode-showcase-visual');
  if (!visual || !art || selected?.getAttribute('aria-disabled') === 'true') return;
  const document = screen.ownerDocument;
  screen.dataset.studioMode = modeId;
  const illustration = element(document, 'div', 'studio-mode-art', `
    <span class="studio-mode-number">${art.symbol}</span>
    <svg viewBox="0 0 640 340" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${art.path}</svg>
    <div class="studio-mode-art-caption"><strong>${art.label}</strong><span>${art.detail}</span></div>
  `);
  illustration.setAttribute('aria-hidden', 'true');
  // Preserve the public motif hook on the replacement SVG for existing consumers.
  const motif = visual.querySelector('[class^="mode-motif-"]');
  if (motif) illustration.querySelector('svg').setAttribute('class', motif.className);
  // Keep the validated preview metadata; replace decorative artwork only.
  visual.querySelectorAll('[class^="mode-motif-"]').forEach(node => node.remove());
  visual.append(illustration);
}

export function enhanceStudioScreen(screen) {
  if (!screen || screen.dataset.studioReady === 'true') return false;
  if (screen.classList.contains('title-screen')) enhanceTitle(screen);
  else if (screen.classList.contains('mode-select-screen')) enhanceModes(screen);
  else return false;
  screen.dataset.studioReady = 'true';
  return true;
}

export function mountStrikeStudio(root) {
  if (!root || root.dataset.studioMounted === 'true') return null;
  root.dataset.studioMounted = 'true';
  const decorate = () => {
    for (const child of root.children) enhanceStudioScreen(child);
  };
  const observer = new MutationObserver(decorate);
  // Direct screen replacements only. HUD text and character mutations are NOT observed.
  observer.observe(root, { childList: true });
  decorate();
  return () => { observer.disconnect(); delete root.dataset.studioMounted; };
}

/** Keep this versioned presentation bundle available to the existing PWA fetch
 * fallback. The shared shell and its release/cache ownership remain unchanged. */
export async function warmStudioAssets(storage = globalThis.caches, moduleUrl = import.meta.url) {
  if (!storage?.open) return false;
  const cacheName = 'wordstrike-ui-studio-20260917a';
  const assets = [new URL('../styles/strike-studio.css?v=20260917a', moduleUrl).href,
    new URL('./strikeStudioPresentation.js?v=20260917a', moduleUrl).href];
  try {
    const cache = await storage.open(cacheName);
    const missing = [];
    for (const url of assets) if (!await cache.match(url)) missing.push(url);
    if (missing.length) await cache.addAll(missing);
    return true;
  } catch { return false; } // Offline or blocked storage must never break the UI.
}

if (typeof document !== 'undefined') {
  mountStrikeStudio(document.querySelector('#app'));
  if (globalThis.navigator?.serviceWorker && globalThis.isSecureContext) {
    navigator.serviceWorker.ready.then(() => warmStudioAssets()).catch(() => {});
  }
}
