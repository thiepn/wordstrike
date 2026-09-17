import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Long passages are curated independently; never synthesize assessment prose
// by swapping nouns inside a shared sentence template.
const editorial = JSON.parse(await readFile(path.join(root, 'data/practice/editorial/en-v1.passages.json'), 'utf8'));
function passage(seed, minimum, extra='') {
  const text = editorial[String(seed)];
  if (typeof text !== 'string' || !text.trim()) throw new Error(`Missing independently authored passage ${seed}`);
  const result = text.trim() + (extra ? `\n\n${extra}` : '');
  // The downstream form builders enforce each canonical protocol's capacity.
  if ([...result].length < minimum) throw new Error(`Editorial passage ${seed} is too short`);
  return result;
}
function family(partition, sourceId, prefix, index, text, tags) {
  return { familyId:`fam_${prefix}_${String(index).padStart(3,'0')}`, partition, locale:'en-US', sourceId,
    reusePolicy: partition==='training' ? 'repeatable' : 'protected', authorDisplayApproved:true,
    items:[{contentId:`cnt_${prefix}_${String(index).padStart(3,'0')}`,text,genre:'prose',difficultyBand:'medium',featureVector:['letters','spaces','punctuation','natural-prose'],tags,status:'approved'}] };
}
function doc(sourceId,families){ return {schemaVersion:1,corpusId:'practice-en-v1',corpusVersion:1,locale:'en-US',source:{id:sourceId,type:'wordstrike-original',license:'WordStrike authored',displayApproval:'approved',notes:'GC3 release-critical WordStrike-original English content.'},families}; }
const specs = [
  ['gc3-benchmark-en-v1.source.json','ws-original-gc3-benchmark-en-v1','benchmark','gc3_bench',0,6,2400,['benchmark','gc3','wordstrike-original']],
  ['gc3-transfer-en-v1.source.json','ws-original-gc3-transfer-en-v1','transfer','gc3_transfer',6,16,2300,['transfer','gc3','wordstrike-original']],
  ['gc3-realtext-en-v1.source.json','ws-original-gc3-realtext-en-v1','training','gc3_realtext',22,20,1650,['training','real-text','gc3','wordstrike-original']]
];
for (const [file,sourceId,partition,prefix,start,count,min,tags] of specs) {
  const families=[]; for(let i=0;i<count;i++) families.push(family(prefix==='gc3_realtext'&&i>=16?'research-holdout':partition,sourceId,prefix,i+1,passage(start+i,min),tags));
  if(prefix==='gc3_realtext') {
    const simple = ['The red boat sat by the shore. A boy saw it move in the wind. He ran to tell his dad, who came down the path and tied it to a post.', 'We went out at dawn to see the sun. The air was cool and the grass was wet. I took a bag of food and my friend took a cup of tea.', 'A cat lay on the wall in the yard. It woke when the gate swung wide, then ran to the house and hid by the door.', 'She put the bread on a plate and cut it in two. We ate it with jam, then washed the cups and put them back on the shelf.', 'The bus was late, so we chose to walk. We took the short path by the park and got there just as the rain came down.', 'He had a map but no pen. I gave him mine so he could mark the way to the lake and the best place to stop.', 'The dog ran up the hill to find a stick. We sat on a rock and watched the clouds drift by while he ran back to us.', 'A girl stood at the door with a small box. She said it was for us and asked if we could sign for it.', 'I saw a light in the hall and went to look. My son was there with a book and said he could not sleep.', 'We left our bags in the room and went out for a meal. The town was still quiet and most shops were shut.', 'Dad took the old chair out to the shed. He said he would fix the leg and paint it blue when the wood was dry.', 'They sat by the fire and told us how the trip had gone. It was a long way home, but they were glad to be back.'];
    const complex = ['Interdisciplinary coordination requires unambiguous documentation, reproducible measurements, and independent verification of operational assumptions.', 'Photochemical decomposition accelerates when ultraviolet irradiation interacts with temperature-sensitive compounds under oxygen-rich conditions.', 'Microscopic crystallization patterns distinguish heterogeneous nucleation from homogeneous transformation in supersaturated experimental solutions.', 'Contemporary architectural conservation balances archaeological interpretation, structural reinforcement, and accessibility requirements.', 'Electromagnetic interference compromises measurement reproducibility unless instrumentation incorporates appropriate shielding and differential amplification.', 'Organizational decentralization redistributes administrative responsibility while preserving accountability through standardized evaluation procedures.', 'Biogeographical distributions reflect evolutionary diversification, ecological specialization, and historical fragmentation of interconnected habitats.', 'Computational reconstruction combines probabilistic inference with geometrical constraints to estimate otherwise inaccessible anatomical characteristics.', 'Lexicographical classifications distinguish morphological derivation, semantic specialization, and sociolinguistic variation across documented communities.', 'Hydrogeological investigations characterize subterranean permeability through repeated measurements of pressure differentials and contaminant concentrations.', 'Thermodynamic equilibrium constrains microscopic configurations without prescribing the trajectories of individual interacting constituents.', 'Astronomical spectroscopy identifies characteristic absorption signatures despite atmospheric distortion and instrumental calibration uncertainties.'];
    [...simple,...complex].forEach((text,i)=>families.push(family('training',sourceId,'gc3_breadth',i+1,text,['training','wordstrike-original','breadth'])));
  }
  const out=doc(sourceId,families); const target=path.join(root,'data/practice/authoring',file); await mkdir(path.dirname(target),{recursive:true}); await writeFile(target,JSON.stringify(out,null,2)+'\n','utf8');
}
const blocks=[
  ['diagnostic-core-keys',3300],['diagnostic-word-launch',3300],['diagnostic-combinations',4400],['diagnostic-punctuation-capitals',2200],
  ['diagnostic-numbers-symbols',2200],['diagnostic-lexical-extended',2200],['diagnostic-combinations-extended',2200],['diagnostic-mixed',2200]
];
const rare=[
  'A quartz expert named Zoe examined six boxes near the kiln, then checked a wax seal beside a zinc tag. Five quick questions followed: was the quartz mixed, was the box dry, did the index match, was the label exact, and had the sample been moved? Max joined the review with a jacketed journal, an x-ray reference, and a sketch of a fox. Every query was closed with a verified note before the cabinet was locked.',
  'The next cabinet held quartz, zircon, feldspar, pyrite, and a zinc specimen beside an x-ray envelope. A quiz card asked exact questions about color, texture, weight, box number, index code, and location. Zoe and Max checked jars, journals, jacketed folders, a waxed tag, and a fox sketch before returning each object to its drawer.'
];
const punct=[
  'Near the entrance, a card read, "Check labels first; move objects second." The instruction was brief, but its punctuation mattered. A second note asked: Which shelf is active? Which tray is complete? Staff used commas for short sequences, semicolons for related checks, and dashes only when an interruption helped. Parenthetical notes (such as temporary room numbers) stayed short.',
  'An editor left a note: "Keep the sentence clear, not clever." One caption needed a comma after its opening phrase; another needed a colon before a compact explanation. A semicolon joined two balanced observations; a dash marked a useful aside. Brackets [used for supplied context] appeared rarely, and apostrophes stayed where ordinary English required them.'
];
const nums=[
  'At midday the ledger showed 24 washers in bin 12, 18 bolts on shelf 4B, and 7 clips in box 9. Invoice 208 listed a $40 deposit and a 20 percent adjustment. One gear kit used a 3:2 ratio. The clerk checked 5 + 7 = 12, 18 - 4 = 14, and 24 / 6 = 4 before closing order 731.',
  'Route notes used compact values without becoming a puzzle. Section 12.5 km began at marker 7, bridge B-3 stood near kilometer 8, and the steepest signed grade was 8 percent. A maintenance split of 2+4 crews covered 6 zones; budget line $25 stayed separate from route A2. The reviewer checked 9 - 3 = 6 and 4 * 2 = 8. Depot 106 reported 30 available places.'
];
const assess=[]; const sourceId='ws-original-gc3-assessment-en-v1';
for(let b=0;b<blocks.length;b++) for(let v=0;v<2;v++){
  let extra=''; if(b===0) extra=rare[v]; if(b===3) extra=punct[v]; if(b===4) extra=nums[v];
  const idx=b*2+v; const text=passage(46+idx,blocks[b][1]+150,extra);
  assess.push(family('diagnostic',sourceId,'gc3_assess',idx+1,text,['diagnostic',`assessment:${blocks[b][0]}`,'gc3','wordstrike-original']));
}
const at=path.join(root,'data/practice/authoring/gc3-assessment-en-v1.source.json'); await writeFile(at,JSON.stringify(doc(sourceId,assess),null,2)+'\n','utf8');
console.log('GC3 governed original sources generated: 6 benchmark, 16 transfer, 20 real-text candidates, 16 assessment variants');
