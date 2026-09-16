import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const TOPICS = [
  ['Harbor Tide Markers','a working harbor beside a sheltered bay','tide marks,stone steps,mooring lines,wind flags,brass gauges,dock boards'],
  ['Neighborhood Library Morning','a public library before opening','return carts,shelf labels,reading tables,holds cabinets,book jackets,repair trays'],
  ['Community Garden Paths','a shared garden divided by narrow paths','mulch edges,seed labels,watering cans,bean poles,compost bins,rain barrels'],
  ['Train Platform Signals','a regional station at midday','platform numbers,departure boards,edge lines,signal lights,station clocks,route maps'],
  ['Museum Workshop Table','a museum workroom preparing displays','cotton gloves,label cards,foam supports,measuring rules,soft brushes,photo records'],
  ['Riverside Bicycle Route','a paved riverside route','distance signs,bridge ramps,tree shade,lane arrows,repair stands,route markers'],
  ['Courtyard Rain Gauge','a school courtyard after steady rain','clear cylinders,brick paving,drain channels,roof edges,puddle rims,weather boards'],
  ['Bread Bakery Schedule','a bakery preparing its first trays','mixing bowls,proofing baskets,oven stones,cooling racks,wall timers,weighing scales'],
  ['Hilltop Map Survey','a low hill used for a mapping project','contour lines,stone walls,field gates,compasses,survey flags,path junctions'],
  ['Woodworking Bench','a workshop fitting a cabinet door','steel squares,pencil lines,wood shavings,clamps,hinges,hand planes'],
  ['Coastal Photography Walk','a windy coastal trail','rock pools,cloud shadows,camera straps,sea grass,wet stones,reflected light'],
  ['City Tree Inventory','a residential street during a tree survey','trunk tags,tree pits,branch spread,paving joints,young stakes,survey sheets'],
  ['Ferry Terminal Routine','a ferry terminal between river towns','ticket gates,gangway rails,arrival screens,life rings,painted arrows,mooring posts'],
  ['Pottery Studio Shelves','a ceramics studio after a firing day','clay boards,glaze jars,kiln shelves,test tiles,drying racks,firing notes'],
  ['Canal Lock Visit','a canal lock on a quiet weekday','lock gates,water marks,towpaths,balance beams,bollards,spillways'],
  ['Archive Reading Room','a local archive where old maps are consulted','document boxes,foam rests,catalog numbers,map weights,reading lamps,protective folders'],
  ['Solar Roof Inspection','a community hall with a rooftop solar array','panel rows,mounting rails,cable clips,shade lines,roof drains,inverter readings'],
  ['Night Market Cleanup','a covered market after stalls close','folding tables,floor drains,stacked crates,string lights,waste bins,hand carts'],
  ['Mountain Hut Supplies','a trail hut receiving a weekly delivery','food boxes,water tanks,boot racks,weather boards,storage shelves,radio notes'],
  ['Glasshouse Ventilation','a botanical glasshouse in spring','roof vents,shade cloth,thermometers,gravel paths,mist lines,water trays'],
  ['Old Bridge Maintenance','a stone footbridge under routine inspection','mortar joints,drain holes,handrails,paving stones,arch shadows,inspection marks'],
  ['Recording Studio Setup','a recording room before an ensemble arrives','microphone stands,cable runs,music chairs,acoustic panels,input labels,control desks'],
  ['Lake Water Sampling','a lakeside pier during a monthly visit','sample bottles,depth marks,Secchi disks,cool boxes,field labels,reed beds'],
  ['Bookbinding Workshop','a craft room binding notebooks by hand','folded signatures,linen thread,bone folders,cutting mats,cover boards,press boards'],
  ['Bus Depot Dispatch','a bus depot before the morning peak','route boards,vehicle bays,driver packets,charging points,inspection cones,departure clocks'],
  ['Public Fountain Survey','a civic square with a restored fountain','water jets,basin tiles,pump access,drain covers,stone carvings,maintenance hatches'],
  ['Hill Farm Water Trough','a hillside farm during a dry week','trough valves,fence posts,grass lanes,stone walls,water pipes,storage tanks'],
  ['Theater Stage Changeover','a community theater between rehearsal and a show','curtains,stage marks,prop tables,light cues,cable covers,call sheets'],
  ['Wetland Boardwalk Survey','a timber boardwalk crossing a wetland','reed beds,water channels,board planks,viewing screens,depth posts,trail signs'],
  ['Clock Repair Desk','a repair bench for mechanical clocks','gear trays,spring barrels,small screws,brass plates,oil cups,parts labels'],
  ['Orchard Harvest Route','a mixed orchard during early autumn','apple crates,pear rows,ladder feet,grass lanes,tree tags,packing notes'],
  ['Aquarium Service Morning','an aquarium before visitors arrive','filter gauges,viewing glass,feed bins,water tests,tank lights,backup pumps'],
  ['Stone Mason Yard','an outdoor yard preparing cut stone','stone blocks,measuring tapes,wood templates,dust sheets,chisels,lifting straps'],
  ['Forest Trail Marking','a woodland trail where markers are renewed','painted blazes,path forks,fallen branches,stream crossings,map posts,wooden bridges'],
  ['Cafe Opening Routine','a small cafe preparing for customers','coffee grinders,water pitchers,menu boards,clean cups,pastry trays,window blinds'],
  ['Workshop Tool Library','a cooperative tool library on inventory day','drill cases,hand saws,loan tags,storage hooks,charging shelves,return carts'],
  ['Seaside Weather Station','a weather station above a headland','wind cups,rain gauges,temperature screens,data cables,cloud charts,service boxes'],
  ['Campus Bicycle Shed','a bicycle shed during maintenance','repair stands,air pumps,lock rails,tool drawers,tire levers,spare tubes'],
  ['Rural Post Route','a rural postal route between villages','sorting trays,route cards,mail sacks,stone lanes,parcel shelves,delivery notes'],
  ['Small Observatory Night','a hilltop observatory preparing for darkness','telescope mounts,star charts,red lamps,dome shutters,focus knobs,weather sensors'],
  ['River Mill Restoration','an old watermill during conservation work','timber gears,mill stones,water channels,floor beams,sluice gates,repair notes'],
  ['Community Kitchen Prep','a shared kitchen preparing a neighborhood meal','cutting boards,stock pots,ingredient crates,oven timers,serving trays,prep tables'],
  ['Island Footpath Check','a coastal footpath after winter storms','waymark posts,stone steps,grass edges,drainage cuts,cliff fences,route maps'],
  ['Printmaking Studio','a print studio preparing a small edition','ink rollers,metal plates,paper stacks,press blankets,drying racks,registration marks'],
  ['Reservoir Dam Walk','a reservoir service path along a low dam','water level marks,inspection doors,drain channels,grass slopes,railings,measurement points'],
  ['Local History Exhibit','a town museum arranging a local display','photo mounts,caption cards,glass cases,map panels,object supports,inventory sheets'],
  ['Mineral Specimen Catalog','a geology classroom cataloging minerals','quartz crystals,zinc labels,boxed specimens,x-ray notes,feldspar trays,cabinet drawers'],
  ['Wildlife Rescue Intake','a wildlife care center during morning intake','quail boxes,fox carriers,exam lamps,quiet zones,weighing pads,intake forms'],
  ['Letterpress Type Cases','a print shop preparing loose type','type cases,wood furniture,metal quads,ink rollers,proof paper,composing sticks'],
  ['Botanical Seed Exchange','a seed library preparing spring packets','seed envelopes,species cards,date stamps,sorting bowls,storage tins,germination notes'],
  ['Civic Hall Notice Board','a civic hall arranging weekly notices','meeting cards,date headings,room numbers,pin rails,event notes,calendar boxes'],
  ['Editorial Proof Desk','an editorial desk checking a feature','headline sheets,margin notes,quotation marks,caption cards,page numbers,style guides'],
  ['Workshop Parts Ledger','a repair workshop tracking parts','bin labels,shelf codes,invoices,small washers,stock counts,order sheets'],
  ['Trail Distance Board','a trail office updating route information','distance markers,bridge codes,grade notices,map years,gates,shelter numbers'],
  ['Natural History Reading Room','a museum reading room comparing field journals','field journals,species indexes,regional maps,reference shelves,specimen sketches,catalog drawers'],
  ['Architecture Model Room','a design studio reviewing building models','section drawings,foam models,timber samples,window studies,site plans,material boards'],
  ['Mechanical Toy Collection','a conservation bench examining mechanical toys','tin gears,spring keys,painted wheels,axle pins,clockwork drums,maker marks'],
  ['Urban Wayfinding Study','a pedestrian district reviewing signs','street names,corner maps,crossing signals,building numbers,direction arrows,information kiosks'],
  ['Textile Dye Workshop','a craft studio testing plant dyes','linen swatches,dye baths,sample tags,wood tongs,rinse bowls,color cards'],
  ['Regional Food Market','an indoor market preparing morning stalls','vegetable crates,bread baskets,price cards,herb bundles,cool boxes,stall signs'],
  ['Field Sketching Class','an outdoor drawing class by a viaduct','stone arches,shadow edges,track lines,grass banks,drawing boards,pencil grades'],
  ['Town Square Mixed Use','a central square becoming busy at noon','market canopies,bus stops,stone paving,cafe chairs,tree planters,crossing lights']
];

const clean = (s) => s.normalize('NFC').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').trim();
const words = (csv) => csv.split(',');
const actions = ['check the reference','record a short note','compare two positions','clear the working area','inspect the next item','measure a visible change','return a tool','review the sequence','mark the result','leave the route clear'];
const observations = [
  'small changes are easier to judge when the reference stays fixed',
  'consistent notes are more useful than vivid memory after several days',
  'a quiet routine gives people time to notice an error before it spreads',
  'clear labels reduce repeated questions without making the work rigid',
  'shared spaces work best when the next person can understand what happened',
  'simple tools become reliable when they are used in the same way each time'
];
function passage(topic, seed, minimum, extra='') {
  const [title,setting,csv] = topic; const e=words(csv); const rot=(arr,n)=>arr[(seed+n)%arr.length];
  const p=[];
  p.push(`${title} is easiest to understand by spending time in ${setting} and noticing how ordinary details support one another. ${rot(e,0)[0].toUpperCase()+rot(e,0).slice(1)} draws attention first, while ${rot(e,1)} provides a quieter reference. People ${rot(actions,0)}, then ${rot(actions,1)}, because ${rot(observations,0)}. The work is practical rather than dramatic, and its quality depends on small decisions made in a sensible order.`);
  p.push(`A second walk through the area changes the emphasis. ${rot(e,2)[0].toUpperCase()+rot(e,2).slice(1)} may look different as light, weather, or use changes, whereas ${rot(e,3)} often reveals a slower pattern. Experienced workers ${rot(actions,2)} before they ${rot(actions,3)}. This habit keeps attention on evidence instead of guesswork. It also leaves a clear trail for someone who arrives later and needs to understand the same scene without a long explanation.`);
  p.push(`Coordination matters even when each task is small. One person can ${rot(actions,4)} while another can ${rot(actions,5)}; neither action is impressive alone, but together they prevent avoidable delay. ${rot(e,4)[0].toUpperCase()+rot(e,4).slice(1)} serves as a useful checkpoint, especially when ${rot(e,5)} changes unexpectedly. Good practice favors clear signals, enough working space, and time to correct a minor problem before it becomes a larger one.`);
  p.push(`The setting becomes more informative when observations are compared rather than isolated. Instead of rushing toward a conclusion, people ${rot(actions,6)}, ${rot(actions,7)}, and ${rot(actions,8)} in a sequence that leaves room for review. This works because ${rot(observations,2)}. Over time, repeated records form a dependable picture of what is normal, what is seasonal, and what deserves a closer look.`);
  p.push(`There is also value in leaving the place ready for the next cycle. ${rot(e,1)[0].toUpperCase()+rot(e,1).slice(1)} should be returned to a clear state, ${rot(e,3)} should remain easy to inspect, and the final note should describe what actually changed. ${rot(observations,4)[0].toUpperCase()+rot(observations,4).slice(1)}. That principle sounds modest, but it makes routine work easier to repeat and easier to trust.`);
  let text=p.join('\n\n'); let n=0;
  while ([...text].length < minimum) {
    text += `\n\nAnother useful detail concerns ${rot(e,n+2)}. When conditions shift, careful observers ${rot(actions,n+3)} before deciding whether an adjustment is needed. They compare notes, check the immediate surroundings, and keep the explanation tied to what can be seen or measured. ${rot(observations,n+1)[0].toUpperCase()+rot(observations,n+1).slice(1)}. By the end of a normal cycle, the group can describe what changed, what stayed stable, and what should be checked next.`; n++;
  }
  return clean(text + (extra ? `\n\n${extra}` : ''));
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
  const families=[]; for(let i=0;i<count;i++) families.push(family(partition,sourceId,prefix,i+1,passage(TOPICS[start+i],start+i,min),tags));
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
  'Route notes used compact values without becoming a puzzle. Section 12.5 km began at marker 7, bridge B-3 stood near kilometer 8, and the steepest signed grade was 8 percent. A maintenance split of 2+4 crews covered 6 zones; budget line $25 stayed separate from route A2. The reviewer checked 9 - 3 = 6 and 4 * 2 = 8.'
];
const assess=[]; const sourceId='ws-original-gc3-assessment-en-v1';
for(let b=0;b<blocks.length;b++) for(let v=0;v<2;v++){
  let extra=''; if(b===0) extra=rare[v]; if(b===3) extra=punct[v]; if(b===4) extra=nums[v];
  const idx=b*2+v; const text=passage(TOPICS[46+idx],46+idx,blocks[b][1]+150,extra);
  assess.push(family('diagnostic',sourceId,'gc3_assess',idx+1,text,['diagnostic',`assessment:${blocks[b][0]}`,'gc3','wordstrike-original']));
}
const at=path.join(root,'data/practice/authoring/gc3-assessment-en-v1.source.json'); await writeFile(at,JSON.stringify(doc(sourceId,assess),null,2)+'\n','utf8');
console.log('GC3 governed original sources generated: 6 benchmark, 16 transfer, 20 real-text candidates, 16 assessment variants');
