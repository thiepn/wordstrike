import { PRACTICE_READ_AHEAD_VISIBILITY_VERSION, PRACTICE_READ_AHEAD_VISIBLE_FUTURE_WORDS } from "./practiceReadAheadConstants.js";
const freezeDeep=(v)=>{if(!v||typeof v!=="object"||Object.isFrozen(v))return v;Object.values(v).forEach(freezeDeep);return Object.freeze(v);};
export function buildPracticeReadAheadLexicalIndex({units=[],textLength=0}={}){
 const words=(units??[]).filter(u=>u?.type==="word"&&Number.isInteger(u.startIndex)&&Number.isInteger(u.endIndex)&&u.endIndex>u.startIndex).map((u,i)=>({lexicalIndex:i,startIndex:u.startIndex,endIndex:u.endIndex})).sort((a,b)=>a.startIndex-b.startIndex);
 return freezeDeep({version:PRACTICE_READ_AHEAD_VISIBILITY_VERSION,textLength,words});
}
export function findPracticeReadAheadActiveWord(index,expectedIndex){const w=index?.words??[];if(!w.length)return -1;let lo=0,hi=w.length-1,answer=w.length;while(lo<=hi){const m=(lo+hi)>>1;if(w[m].endIndex>expectedIndex){answer=m;hi=m-1;}else lo=m+1;}return answer<w.length?answer:w.length-1;}
export function getPracticeReadAheadVisibilityEnvelope({index,expectedIndex,visibleFutureWords}={}){
 if(!index||!Number.isInteger(expectedIndex)||expectedIndex<0)return null;
 if(visibleFutureWords==null)return freezeDeep({mode:"unrestricted",expectedIndex,activeLexicalIndex:findPracticeReadAheadActiveWord(index,expectedIndex),visibleStartIndex:expectedIndex,visibleEndIndex:index.textLength});
 if(!PRACTICE_READ_AHEAD_VISIBLE_FUTURE_WORDS.includes(visibleFutureWords))throw new TypeError("Unsupported visible future span");
 const active=findPracticeReadAheadActiveWord(index,expectedIndex);if(active<0)return freezeDeep({mode:"constrained",expectedIndex,activeLexicalIndex:-1,visibleStartIndex:expectedIndex,visibleEndIndex:Math.min(index.textLength,expectedIndex+1),visibleFutureWords});
 const final=Math.min(index.words.length-1,active+visibleFutureWords);const next=index.words[final+1];const visibleEndIndex=next?next.startIndex:index.textLength;
 return freezeDeep({mode:"constrained",expectedIndex,activeLexicalIndex:active,finalLexicalIndex:final,visibleFutureWords,visibleStartIndex:expectedIndex,visibleEndIndex:Math.max(expectedIndex+1,visibleEndIndex)});
}
export function getPracticeReadAheadVisualState(textIndex,envelope){if(!envelope)return"visible";if(textIndex<envelope.expectedIndex)return"completed";if(envelope.mode==="unrestricted")return"visible";return textIndex<envelope.visibleEndIndex?"visible":"masked";}
export function isPracticeReadAheadIndexVisible(textIndex,envelope){return getPracticeReadAheadVisualState(textIndex,envelope)!=="masked";}
