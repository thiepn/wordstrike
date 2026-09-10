import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const validateOnly = process.argv.includes("--validate");
const ROOT = process.cwd();
const sha = (text) => `sha256-${crypto.createHash("sha256").update(text).digest("hex")}`;
const writeJson = (file, value) => {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (validateOnly) {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) throw new Error(`PL30 deterministic artifact drift: ${path.relative(ROOT, file)}`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return text;
};
const median = (values) => {
  const sorted = [...values].sort((a,b)=>a-b);
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
};
const countWords = (text) => (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []);
const alphaCount = (text) => (text.match(/[A-Za-z]/g) ?? []).length;
const meanWordLength = (text) => {
  const words=countWords(text);
  return words.length ? words.reduce((s,w)=>s+w.length,0)/words.length : 0;
};
const canonicalAnnotationPayload = (annotations) => {
  const derived={};
  for (const key of Object.keys(annotations.derived ?? {}).sort()) derived[key]=(annotations.derived[key] ?? []).map(({startIndex,endIndex,kind,tokenId})=>({startIndex,endIndex,kind,...(tokenId==null?{}:{tokenId})}));
  return {
    version: annotations.version,
    formHash: annotations.formHash,
    primary: (annotations.primary ?? []).map(({expectedIndex,domain,category})=>({expectedIndex,domain,category})),
    derived,
  };
};
const bindAnnotations = (formHash, primary, derived) => {
  const base={version:1,formHash,primary,derived};
  return {...base,annotationHash:sha(JSON.stringify(canonicalAnnotationPayload(base)))};
};
const seeded = (seed) => {
  let state=(seed>>>0)||1;
  return () => {
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    return state/0x100000000;
  };
};
const shuffle = (values, seed) => {
  const out=[...values]; const rnd=seeded(seed);
  for(let i=out.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
};
const spread=(total,n=4)=>{const v=Array(n).fill(0);for(let i=0;i<total;i++)v[i%n]+=1;return v;};

const model=JSON.parse(fs.readFileSync(path.join(ROOT,"data/practice/models/en-v1/manifest.json"),"utf8"));
const bindings={
  corpusId:model.corpusId,corpusVersion:model.corpusVersion,corpusChecksum:model.corpusChecksum,
  indexSchemaVersion:model.indexSchemaVersion,indexChecksum:model.indexChecksum,
  typabilityModelVersion:model.modelVersion,typabilityFeatureVersion:model.featureVersion,
  typabilityReferenceVersion:model.referenceVersion,typabilityReferenceChecksum:model.referenceChecksum,
  frequencyReferenceVersion:model.frequencyReferenceVersion,frequencyReferenceId:model.frequencyReferenceId,
  frequencyReferenceChecksum:model.frequencyReferenceChecksum,
};

const punctDir=path.join(ROOT,"data/practice/punctuation-capitals/en-v1");
const numDir=path.join(ROOT,"data/practice/numbers-symbols/en-v1");
const punctSourceText=fs.readFileSync(path.join(punctDir,"source.json"),"utf8");
const numSourceText=fs.readFileSync(path.join(numDir,"source.json"),"utf8");
const punctSource=JSON.parse(punctSourceText);
const numSource=JSON.parse(numSourceText);

const punctCharCategory=(ch)=>({
  ",":"comma",".":"terminal-mark","?":"terminal-mark","!":"terminal-mark",
  ":":"colon-semicolon",";":"colon-semicolon","'":"quote-apostrophe",'"':"quote-apostrophe",
  "(":"bracket-dash",")":"bracket-dash","-":"bracket-dash",
})[ch]??null;
const PUNCT_COUNTS={
  caps:[7,7,7,7,7,7,6,6], comma:[4,4,4,4,4,4,4,4], terminal:[4,4,4,4,4,4,4,4],
  colon:[2,2,2,2,2,2,1,1], quote:[4,4,3,3,3,3,3,3], bracket:[3,3,3,3,3,3,2,2],
};
function punctuationRegion(regionIndex, seed) {
  const capDist=[1,1,1,1];
  for(let i=0;i<PUNCT_COUNTS.caps[regionIndex]-4;i++)capDist[i%4]+=1;
  const cs=spread(PUNCT_COUNTS.colon[regionIndex]);
  const qa=spread(PUNCT_COUNTS.quote[regionIndex]);
  const bd=spread(PUNCT_COUNTS.bracket[regionIndex]);
  const sentences=[];
  for(let j=0;j<4;j++){
    const names=[];
    for(let k=0;k<capDist[j];k++) names.push(punctSource.labels[(seed*7+regionIndex*4+j+k*3)%punctSource.labels.length]);
    let body=`${names[0]} keeps`;
    if(names.length>1) body+=` ${names.slice(1).join(" ")} nearby`;
    body+=", text stays clear";
    for(let k=0;k<cs[j];k++) body+=((k+j+regionIndex)%2?"; pace stays calm":": notes stay brief");
    let q=qa[j]; while(q>=2){body+=' "ok"';q-=2;} if(q===1)body+=" can't";
    let b=bd[j]; while(b>=2){body+=" (now)";b-=2;} if(b===1)body+=" - steady";
    body+=[".","?","!","."][(regionIndex+j+seed)%4];
    sentences.push(body);
  }
  return sentences.join(" ");
}
function annotatePunctuation(text, regionRanges) {
  const primary=[]; const sentenceCapital=[]; const boundary=[];
  let sentenceStart=true;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch>="A"&&ch<="Z"){
      primary.push({expectedIndex:i,domain:"punctuation-capitals",category:"capital-letter"});
      if(sentenceStart) sentenceCapital.push({startIndex:i,endIndex:i+1,kind:"sentence-capital"});
      sentenceStart=false;
    }
    const cat=punctCharCategory(ch);
    if(cat) primary.push({expectedIndex:i,domain:"punctuation-capitals",category:cat});
    if(i+1<text.length&&text[i+1]===" "&&".,?!:;\")-".includes(ch)) boundary.push({startIndex:i+1,endIndex:i+2,kind:"post-punctuation-boundary"});
    if(".?!".includes(ch)) sentenceStart=true;
    else if(ch!==" " && ch!=='"' && ch!==")") {
      if(!(ch>="A"&&ch<="Z")) sentenceStart=false;
    }
  }
  primary.sort((a,b)=>a.expectedIndex-b.expectedIndex);
  return {primary,derived:{"sentence-capital":sentenceCapital,"post-punctuation-boundary":boundary},regions:regionRanges};
}
function makePunctuationCheck(seed, formId, partition="diagnostic"){
  let text=""; const regions=[];
  for(let r=0;r<8;r++){
    const value=punctuationRegion(r,seed);
    if(text)text+=" ";
    const start=text.length;text+=value;regions.push({startIndex:start,endIndex:text.length});
  }
  const ann=annotatePunctuation(text,regions);
  const formHash=sha(text);
  const annotations=bindAnnotations(formHash,ann.primary,ann.derived);
  const categoryCounts=Object.fromEntries(["capital-letter","comma","terminal-mark","colon-semicolon","quote-apostrophe","bracket-dash"].map(c=>[c,ann.primary.filter(x=>x.category===c).length]));
  const regionalPrimaryCounts=regions.map(region=>ann.primary.filter(x=>x.expectedIndex>=region.startIndex&&x.expectedIndex<region.endIndex).length);
  const categoryRegionCounts=Object.fromEntries(Object.keys(categoryCounts).map(c=>[c,regions.filter(region=>ann.primary.some(x=>x.category===c&&x.expectedIndex>=region.startIndex&&x.expectedIndex<region.endIndex)).length]));
  return {
    formId,formSchemaVersion:1,generatorVersion:1,partition,reviewStatus:"approved",text,formHash,annotations,
    metrics:{
      graphemeCount:Array.from(text).length,wordCount:countWords(text).length,meanWordLength:meanWordLength(text),
      primaryOpportunityCount:ann.primary.length,categoryCounts,
      sentenceCapitalCount:ann.derived["sentence-capital"].length,
      postPunctuationBoundaryCount:ann.derived["post-punctuation-boundary"].length,
      regionalPrimaryCounts,categoryRegionCounts,
    },
  };
}
function makePunctuationPractice(seed, formId){
  const pieces=[];
  for(let i=0;i<10;i++) pieces.push(makePunctuationCheck(seed+i*13,`${formId}-block-${i}`,"training"));
  let text=""; const primary=[]; const sentence=[]; const boundary=[];
  for(const piece of pieces){
    if(text)text+=" ";
    const off=text.length;text+=piece.text;
    for(const item of piece.annotations.primary)primary.push({...item,expectedIndex:item.expectedIndex+off});
    for(const item of piece.annotations.derived["sentence-capital"])sentence.push({...item,startIndex:item.startIndex+off,endIndex:item.endIndex+off});
    for(const item of piece.annotations.derived["post-punctuation-boundary"])boundary.push({...item,startIndex:item.startIndex+off,endIndex:item.endIndex+off});
  }
  const formHash=sha(text);const annotations=bindAnnotations(formHash,primary,{"sentence-capital":sentence,"post-punctuation-boundary":boundary});
  const categoryCounts=Object.fromEntries(["capital-letter","comma","terminal-mark","colon-semicolon","quote-apostrophe","bracket-dash"].map(c=>[c,primary.filter(x=>x.category===c).length]));
  return {formId,formSchemaVersion:1,generatorVersion:1,partition:"training",reviewStatus:"approved",text,formHash,annotations,metrics:{graphemeCount:Array.from(text).length,primaryOpportunityCount:primary.length,categoryCounts}};
}

const DIGIT_COUNTS=[12,12,12,12,12,12,12,12,11,11];
const RUN_LENGTHS=[2,2,2,2,2,2,2,2,3,3,3,3,3,3,3,3,4,4,4,4,5,5,5,5];
const SYMBOL_COUNTS={"+":5,"-":4,"*":4,"/":4,"=":5,"@":6,"#":6,"_":6,"$":8,"%":7,"&":7};
const code=(i)=>{let n=i+1,s="";while(n){n--;s=String.fromCharCode(97+n%26)+s;n=Math.floor(n/26);}return s;};
function symbolToken(sym,digits,index){
  const c=code(index);
  return ({
    "+":`plus${c}+${digits}`,"-":`offset${c}-${digits}`,"*":`scale${c}*${digits}`,"/":`path${c}/${digits}`,
    "=":`value${c}=${digits}`,"@":`unit${c}@${digits}`,"#":`ref${c}#${digits}`,"_":`id${c}_${digits}`,
    "$":`price${c}$${digits}`,"%":`rate${c}${digits}%`,"&":`set${c}&${digits}`,
  })[sym];
}
function makeNumbersCheck(seed,formId,partition="diagnostic"){
  const digits=[];for(let d=0;d<10;d++)for(let i=0;i<DIGIT_COUNTS[d];i++)digits.push(String(d));
  const shuffledDigits=shuffle(digits,2000+seed);
  let p=0;const runs=RUN_LENGTHS.map(L=>{const v=shuffledDigits.slice(p,p+L).join("");p+=L;return v;});
  const singles=shuffledDigits.slice(p);
  let syms=[];for(const [s,c] of Object.entries(SYMBOL_COUNTS))for(let i=0;i<c;i++)syms.push(s);
  syms=shuffle(syms,3000+seed);
  const items=[];
  for(let i=0;i<24;i++)items.push({text:symbolToken(syms[i],runs[i],i),run:runs[i],symbol:syms[i],mixed:true});
  for(let i=0;i<38;i++)items.push({text:symbolToken(syms[24+i],singles[i],24+i),run:null,symbol:syms[24+i],mixed:true});
  for(let i=38;i<42;i++)items.push({text:`level${code(i)}${singles[i]}`,run:null,symbol:null,mixed:false});
  const groups={operator:[],identifier:[],commerce:[],digitOnly:[]};
  for(const item of shuffle(items,4000+seed)){
    if(item.symbol&&"+-*/=".includes(item.symbol))groups.operator.push(item);
    else if(item.symbol&&"@#_".includes(item.symbol))groups.identifier.push(item);
    else if(item.symbol&&"$%&".includes(item.symbol))groups.commerce.push(item);
    else groups.digitOnly.push(item);
  }
  const regions=Array.from({length:8},()=>[]);
  ["operator","identifier","commerce","digitOnly"].forEach((key,ci)=>{
    const group=shuffle(groups[key],5000+seed+ci);
    const off=(seed+ci*2)%8;
    group.forEach((item,k)=>regions[(off+k)%8].push(item));
  });
  const intros=["Copy the visible reference tokens exactly","Transcribe each practical token as shown","Keep every displayed token unchanged","Enter the visible labels without calculation"];
  let text="";const primary=[];const runAnnotations=[];const mixed=[];const regionRanges=[];
  regions.forEach((region,r)=>{
    const chunk=shuffle(region,6000+seed+r);
    let rt=`${intros[(r+seed)%4]}: `;const local=[];
    chunk.forEach((item,i)=>{if(i)rt+=", ";const start=rt.length;rt+=item.text;local.push({item,start,end:rt.length});});
    rt+=". Read left to right and preserve every digit and mark exactly as displayed in this transcription line. No answer is required.";
    if(text)text+=" ";const off=text.length;text+=rt;regionRanges.push({startIndex:off,endIndex:text.length});
    for(const {item,start,end} of local){
      if(item.mixed)mixed.push({startIndex:off+start,endIndex:off+end,kind:"mixed-practical-token"});
      if(item.run){const rel=item.text.indexOf(item.run);runAnnotations.push({startIndex:off+start+rel,endIndex:off+start+rel+item.run.length,kind:"digit-run"});}
    }
  });
  for(let i=0;i<text.length;i++){
    const ch=text[i];let category=null;
    if(/[0-9]/.test(ch))category="digit";
    else if("+-*/=".includes(ch))category="operator-symbol";
    else if("@#_".includes(ch))category="identifier-symbol";
    else if("$%&".includes(ch))category="commerce-percent-symbol";
    if(category)primary.push({expectedIndex:i,domain:"numbers-symbols",category});
  }
  const formHash=sha(text);const annotations=bindAnnotations(formHash,primary,{"digit-run":runAnnotations,"mixed-practical-token":mixed});
  const categoryCounts=Object.fromEntries(["digit","operator-symbol","identifier-symbol","commerce-percent-symbol"].map(c=>[c,primary.filter(x=>x.category===c).length]));
  const digitCounts=Object.fromEntries("0123456789".split("").map(d=>[d,[...text].filter(x=>x===d).length]));
  const symbolCounts=Object.fromEntries(Object.keys(SYMBOL_COUNTS).map(s=>[s,[...text].filter(x=>x===s).length]));
  const regionalPrimaryCounts=regionRanges.map(region=>primary.filter(x=>x.expectedIndex>=region.startIndex&&x.expectedIndex<region.endIndex).length);
  const categoryRegionCounts=Object.fromEntries(["operator-symbol","identifier-symbol","commerce-percent-symbol"].map(c=>[c,regionRanges.filter(region=>primary.some(x=>x.category===c&&x.expectedIndex>=region.startIndex&&x.expectedIndex<region.endIndex)).length]));
  const runLengthCounts={"2":0,"3":0,"4":0,"5-6":0};for(const run of runAnnotations){const L=run.endIndex-run.startIndex;if(L===2)runLengthCounts["2"]++;else if(L===3)runLengthCounts["3"]++;else if(L===4)runLengthCounts["4"]++;else if(L>=5&&L<=6)runLengthCounts["5-6"]++;}
  const mixedTokens=mixed.map(x=>text.slice(x.startIndex,x.endIndex));
  return {
    formId,formSchemaVersion:1,generatorVersion:1,partition,reviewStatus:"approved",text,formHash,annotations,
    metrics:{
      graphemeCount:Array.from(text).length,alphabeticContextCount:alphaCount(text),primaryOpportunityCount:primary.length,
      categoryCounts,digitCounts,symbolCounts,digitRunCount:runAnnotations.length,digitRunLengthCounts:runLengthCounts,
      mixedPracticalTokenCount:mixed.length,maximumExactMixedTokenRepeats:Math.max(...Object.values(Object.fromEntries([...new Set(mixedTokens)].map(t=>[t,mixedTokens.filter(x=>x===t).length])))),
      regionalPrimaryCounts,categoryRegionCounts,
    },
  };
}
function makeNumbersPractice(seed,formId){
  const pieces=[];for(let i=0;i<10;i++)pieces.push(makeNumbersCheck(seed+i*17,`${formId}-block-${i}`,"training"));
  let text="";const primary=[];const runs=[];const mixed=[];
  for(const piece of pieces){if(text)text+=" ";const off=text.length;text+=piece.text;
    for(const item of piece.annotations.primary)primary.push({...item,expectedIndex:item.expectedIndex+off});
    for(const item of piece.annotations.derived["digit-run"])runs.push({...item,startIndex:item.startIndex+off,endIndex:item.endIndex+off});
    for(const item of piece.annotations.derived["mixed-practical-token"])mixed.push({...item,startIndex:item.startIndex+off,endIndex:item.endIndex+off});
  }
  const formHash=sha(text);const annotations=bindAnnotations(formHash,primary,{"digit-run":runs,"mixed-practical-token":mixed});
  const categoryCounts=Object.fromEntries(["digit","operator-symbol","identifier-symbol","commerce-percent-symbol"].map(c=>[c,primary.filter(x=>x.category===c).length]));
  return {formId,formSchemaVersion:1,generatorVersion:1,partition:"training",reviewStatus:"approved",text,formHash,annotations,metrics:{graphemeCount:Array.from(text).length,primaryOpportunityCount:primary.length,categoryCounts,digitRunCount:runs.length,mixedPracticalTokenCount:mixed.length}};
}

function assertPunctuation(forms,practice=false){
  const quotas={"capital-letter":54,comma:32,"terminal-mark":32,"colon-semicolon":14,"quote-apostrophe":26,"bracket-dash":22};
  for(const form of forms){
    if(practice){
      if(form.metrics.graphemeCount<17600)throw new Error("Punctuation practice capacity below 8-min 400 WPM + margin");
      const total=form.metrics.primaryOpportunityCount;
      const target={"capital-letter":.30,comma:.18,"terminal-mark":.18,"colon-semicolon":.08,"quote-apostrophe":.14,"bracket-dash":.12};
      for(const [k,v] of Object.entries(target))if(Math.abs(form.metrics.categoryCounts[k]/total-v)>.04)throw new Error(`Punctuation practice mix ${k}`);
      for(let start=0;start<form.text.length;start+=500){
        const end=Math.min(form.text.length,start+500); if(end-start<250) continue;
        const categories=new Set(form.annotations.primary.filter(x=>x.expectedIndex>=start&&x.expectedIndex<end).map(x=>x.category));
        if(categories.size<3)throw new Error("Punctuation practice local distribution");
      }
      continue;
    }
    if(form.metrics.graphemeCount<1800||form.metrics.graphemeCount>2100)throw new Error("Punctuation check length");
    if(form.metrics.primaryOpportunityCount!==180)throw new Error("Punctuation primary count");
    for(const [k,v] of Object.entries(quotas))if(form.metrics.categoryCounts[k]!==v)throw new Error(`Punctuation quota ${k}`);
    if(form.metrics.sentenceCapitalCount<32||form.metrics.postPunctuationBoundaryCount<60)throw new Error("Punctuation derived coverage");
    if(form.metrics.regionalPrimaryCounts.some(x=>x<15)||Math.max(...form.metrics.regionalPrimaryCounts)>2*median(form.metrics.regionalPrimaryCounts))throw new Error("Punctuation regional density");
    for(const k of ["capital-letter","comma","terminal-mark","quote-apostrophe"])if(form.metrics.categoryRegionCounts[k]<6)throw new Error(`Punctuation major spread ${k}`);
    for(const k of ["colon-semicolon","bracket-dash"])if(form.metrics.categoryRegionCounts[k]<4)throw new Error(`Punctuation minor spread ${k}`);
  }
  if(!practice){
    const gl=forms.map(x=>x.metrics.graphemeCount), wc=forms.map(x=>x.metrics.wordCount), mw=forms.map(x=>x.metrics.meanWordLength);
    const gm=median(gl),wm=median(wc);
    if(gl.some(x=>Math.abs(x/gm-1)>.05)||wc.some(x=>Math.abs(x/wm-1)>.07)||Math.max(...mw)-Math.min(...mw)>.30)throw new Error("Punctuation parallel-form matching");
  }
}
function assertNumbers(forms,practice=false){
  const quotas={digit:118,"operator-symbol":22,"identifier-symbol":18,"commerce-percent-symbol":22};
  for(const form of forms){
    if(practice){
      if(form.metrics.graphemeCount<17600)throw new Error("Numbers practice capacity below 8-min 400 WPM + margin");
      const total=form.metrics.primaryOpportunityCount,target={digit:.65,"operator-symbol":.12,"identifier-symbol":.10,"commerce-percent-symbol":.13};
      for(const [k,v] of Object.entries(target))if(Math.abs(form.metrics.categoryCounts[k]/total-v)>.05)throw new Error(`Numbers practice mix ${k}`);
      for(let start=0;start<form.text.length;start+=500){
        const end=Math.min(form.text.length,start+500); if(end-start<250) continue;
        const primary=form.annotations.primary.filter(x=>x.expectedIndex>=start&&x.expectedIndex<end);
        if(!primary.some(x=>x.category==="digit")||!primary.some(x=>x.category!=="digit"))throw new Error("Numbers practice local distribution");
        const hasRun=form.annotations.derived["digit-run"].some(x=>x.startIndex<end&&x.endIndex>start);
        const hasMixed=form.annotations.derived["mixed-practical-token"].some(x=>x.startIndex<end&&x.endIndex>start);
        if(!hasRun||!hasMixed)throw new Error("Numbers practice derived coverage");
      }
      continue;
    }
    if(form.metrics.graphemeCount<1800||form.metrics.graphemeCount>2100||form.metrics.primaryOpportunityCount!==180)throw new Error("Numbers check size/count");
    for(const [k,v] of Object.entries(quotas))if(form.metrics.categoryCounts[k]!==v)throw new Error(`Numbers quota ${k}`);
    if(Object.values(form.metrics.digitCounts).some(x=>x<8||x>18))throw new Error("Numbers digit balance");
    for(const [s,c] of Object.entries(form.metrics.symbolCounts)){
      const min="+-*/=".includes(s)?3:"@#_".includes(s)?4:4;
      if(c<min)throw new Error(`Numbers symbol coverage ${s}`);
    }
    if(form.metrics.digitRunCount<24||form.metrics.digitRunLengthCounts["2"]<8||form.metrics.digitRunLengthCounts["3"]<8||form.metrics.digitRunLengthCounts["4"]<4||form.metrics.digitRunLengthCounts["5-6"]<4)throw new Error("Numbers digit-run mix");
    if(form.metrics.mixedPracticalTokenCount<24||form.metrics.maximumExactMixedTokenRepeats>2)throw new Error("Numbers mixed tokens");
    if(form.metrics.regionalPrimaryCounts.some(x=>x<15)||Math.max(...form.metrics.regionalPrimaryCounts)>2*median(form.metrics.regionalPrimaryCounts))throw new Error("Numbers regional density");
    for(const k of ["operator-symbol","identifier-symbol","commerce-percent-symbol"])if(form.metrics.categoryRegionCounts[k]<6)throw new Error(`Numbers category spread ${k}`);
  }
  if(!practice){
    const gl=forms.map(x=>x.metrics.graphemeCount), ac=forms.map(x=>x.metrics.alphabeticContextCount),gm=median(gl),am=median(ac);
    if(gl.some(x=>Math.abs(x/gm-1)>.05)||ac.some(x=>Math.abs(x/am-1)>.10))throw new Error("Numbers parallel-form matching");
  }
}
function emit(dir,{formSetId,domain,partition,sourceId,sourceChecksum,forms}){
  const artifact={formSetId,formSetVersion:1,formSchemaVersion:1,generatorVersion:1,protocolVersion:1,annotationVersion:1,domain,partition,status:"ready",forms};
  const formsText=`${JSON.stringify(artifact,null,2)}\n`;
  const manifest={
    manifestVersion:1,formSetId,formSetVersion:1,formSchemaVersion:1,generatorVersion:1,protocolVersion:1,annotationVersion:1,
    domain,partition,status:"ready",readyFormCount:forms.length,formsChecksum:sha(formsText),
    source:{sourceId,sourceChecksum},bindings,
    forms:forms.map(form=>({formId:form.formId,formHash:form.formHash,annotationHash:form.annotations.annotationHash,ready:true,graphemeCount:form.metrics.graphemeCount,primaryOpportunityCount:form.metrics.primaryOpportunityCount})),
  };
  writeJson(path.join(dir,`${formSetId}.forms.json`),artifact);
  writeJson(path.join(dir,`${formSetId}.manifest.json`),manifest);
}
const punctChecks=Array.from({length:6},(_,i)=>makePunctuationCheck(i+1,`WS-PUNCT-CHECK-EN-1-F${i+1}`));
const punctPractice=Array.from({length:4},(_,i)=>makePunctuationPractice(101+i*31,`WS-PUNCT-PRACTICE-EN-1-P${i+1}`));
const numChecks=Array.from({length:6},(_,i)=>makeNumbersCheck(i+1,`WS-NUMSYM-CHECK-EN-1-F${i+1}`));
const numPractice=Array.from({length:4},(_,i)=>makeNumbersPractice(201+i*37,`WS-NUMSYM-PRACTICE-EN-1-P${i+1}`));
assertPunctuation(punctChecks,false);assertPunctuation(punctPractice,true);assertNumbers(numChecks,false);assertNumbers(numPractice,true);
emit(punctDir,{formSetId:"WS-PUNCT-CHECK-EN-1",domain:"punctuation-capitals",partition:"diagnostic",sourceId:punctSource.sourceId,sourceChecksum:sha(punctSourceText),forms:punctChecks});
emit(punctDir,{formSetId:"WS-PUNCT-PRACTICE-EN-1",domain:"punctuation-capitals",partition:"training",sourceId:punctSource.sourceId,sourceChecksum:sha(punctSourceText),forms:punctPractice});
emit(numDir,{formSetId:"WS-NUMSYM-CHECK-EN-1",domain:"numbers-symbols",partition:"diagnostic",sourceId:numSource.sourceId,sourceChecksum:sha(numSourceText),forms:numChecks});
emit(numDir,{formSetId:"WS-NUMSYM-PRACTICE-EN-1",domain:"numbers-symbols",partition:"training",sourceId:numSource.sourceId,sourceChecksum:sha(numSourceText),forms:numPractice});
console.log(`PL30 ${validateOnly?"validated":"built"}: punctuation ${punctChecks.length} checks/${punctPractice.length} practice; numbers ${numChecks.length} checks/${numPractice.length} practice`);
