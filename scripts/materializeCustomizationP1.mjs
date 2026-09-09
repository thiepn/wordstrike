// One-time, branch-local source migration. Removed by the preparation workflow.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const read = (file) => readFileSync(file, 'utf8');
const write = (file, value) => writeFileSync(file, value);
function replace(source, before, after) {
  if (!source.includes(before)) throw new Error(`Migration anchor not found: ${before}`);
  return source.replace(before, after);
}

// Replace only explicitly approved palette colors. Semantic danger/success/special,
// white masks, black shadows, layout, and all Practice-specific CSS stay untouched.
const files = ['style.css', 'styles/ui-system.css', ...readdirSync('styles/screens').filter(p=>p.endsWith('.css')).map(p=>'styles/screens/'+p)];
const colors = new Map([
  ['0 255 242', 'accent'],
  ['10 14 20', 'bg'], ['14 20 28', 'elevated'], ['16 23 32', 'surface-1'],
  ['21 31 42','surface-2'], ['22 33 45','surface-2'], ['27 40 53','hover'], ['29 48 58','active'],
  ['8 13 20','elevated'], ['8 12 18','elevated'], ['7 10 15','overlay'], ['3 7 11','overlay'],
  ['6 10 16','overlay'], ['6 9 14','overlay'], ['6 11 18','elevated'], ['4 8 13','overlay'],
  ['142 160 174','border'], ['129 144 158','border'], ['176 193 205','border-strong'],
]);
for (const file of files) {
  let s=read(file);
  if (s.startsWith('/* P1: palette-aware')) continue;
  const original=s;
  s=s.replace(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(\/\s*[\d.%]+)?\s*\)/gi, (all,r,g,b,alpha) => {
    const channels=`${r} ${g} ${b}`, role=colors.get(channels);
    return role ? `rgb(var(--custom-${role}-rgb, ${channels})${alpha ? ' '+alpha : ''})` : all;
  });
  s=s.replace(/#([\da-f]{6})\b/gi,(all,hex)=> {
    const channels=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)).join(' ');
    const role=colors.get(channels);
    return role ? `var(--custom-${role}, ${all})` : all;
  });
  if (s!==original) write(file,'/* P1: palette-aware color values; literal fallbacks preserve the certified default. */\n'+s);
}

let s=read('js/storage.js');
s=replace(s,'const STORAGE_KEY','import { createDefaultCustomization, normalizeCustomization, normalizeCustomizationValue } from "./customization.js";\n\nconst STORAGE_KEY');
s=replace(s,'      speedTestFontSize: "auto",','      speedTestFontSize: "auto",\n      ...createDefaultCustomization(),');
s=replace(s,'      speedTestFontSize: normalizeSpeedTestFontSize(value.settings?.speedTestFontSize),','      ...normalizeCustomization(value.settings),\n      speedTestFontSize: normalizeCustomization(value.settings).typingTest.textSize,');
s=replace(s,'  saveGame(save);\n  return save.settings.speedTestFontSize;','  save.settings.typingTest = { ...normalizeCustomization(save.settings).typingTest, textSize: save.settings.speedTestFontSize };\n  saveGame(save);\n  return save.settings.speedTestFontSize;');
s += '\n/** Appearance-only writes use validated strings, not the legacy boolean setter. */\nexport function updateCustomizationSetting(save, field, value) {\n  const normalized = normalizeCustomizationValue(field, value);\n  if (!save || typeof save !== "object") throw new TypeError("A save is required");\n  save.settings ??= createDefaultSave().settings;\n  save.settings[field] = normalized;\n  return { value: normalized, persisted: saveGame(save) };\n}\n\nexport function resetAppearance(save) {\n  const defaults = createDefaultCustomization();\n  save.settings ??= createDefaultSave().settings;\n  for (const field of ["theme", "accent", "effectsIntensity"]) save.settings[field] = defaults[field];\n  return { persisted: saveGame(save) };\n}\n\n/** Full settings reset is separate from destructive progress reset. */\nexport function resetSettings(save) {\n  save.settings = createDefaultSave().settings;\n  const persisted = saveGame(save);\n  if (typeof document !== "undefined" && typeof CustomEvent === "function") {\n    document.dispatchEvent(new CustomEvent("wordstrike:settings-changed"));\n  }\n  return { persisted };\n}\n';
write('js/storage.js',s);
s='import { startCustomizationPresentation } from "./customizationPresentation.js";\n'+read('js/main.js');
s=replace(s,'  appState.save = loadSave();','  appState.save = loadSave();\n  startCustomizationPresentation({ getSave: () => appState.save });');
write('js/main.js',s);
s=replace(read('index.html'),'    <link rel="stylesheet" href="practiceLabV20.css">','    <link rel="stylesheet" href="styles/customization.css">\n    <link rel="stylesheet" href="practiceLabV20.css">');
write('index.html',s);
s='import { presentationEffectsReduced } from "./customization.js";\n\n'+read('js/renderer.js');
s=replace(s,'if (completed && particlesEnabled) {','if (completed && particlesEnabled && !presentationEffectsReduced(playArea())) {');
s=replace(s,'if (screenShake && !gameplayPresentationPrefersReducedMotion(area)) {','if (screenShake && !gameplayPresentationPrefersReducedMotion(area) && !presentationEffectsReduced(area)) {');
write('js/renderer.js',s);
s='import { presentationEffectsReduced } from "./customization.js";\n'+read('js/arcadeRushAppController.js');
s=replace(s,'if (settings.screenShake !== false && typeof surface.animate === "function") {','if (settings.screenShake !== false && !presentationEffectsReduced(surface) && typeof surface.animate === "function") {');
write('js/arcadeRushAppController.js',s);
console.log('P1 source integration applied; no runtime build step is introduced.');
