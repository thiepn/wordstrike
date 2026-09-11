import { hashPracticeContent } from "./practiceIds.js";
import { PRACTICE_READ_AHEAD_MASTER_SCHEDULE, PRACTICE_READ_AHEAD_SCHEDULE_VERSION } from "./practiceReadAheadConstants.js";
import { getPracticeReadAheadProtocol } from "./practiceReadAheadPolicy.js";
const freezeDeep=(v)=>{if(!v||typeof v!=="object"||Object.isFrozen(v))return v;Object.values(v).forEach(freezeDeep);return Object.freeze(v);};
const RELABELS=Object.freeze([{1:1,2:2,4:4},{1:2,2:4,4:1},{1:4,2:1,4:2}]);
function variantFor(sessionId,version=PRACTICE_READ_AHEAD_SCHEDULE_VERSION){const h=hashPracticeContent(`${sessionId}|read-ahead-schedule|${version}`);const hex=h.match(/[0-9a-f]{8}$/i)?.[0]??"00000000";return parseInt(hex,16)%3;}
export function buildPracticeReadAheadSchedule({sessionId,durationMs,scheduleVersion=PRACTICE_READ_AHEAD_SCHEDULE_VERSION}={}){
 if(!sessionId)throw new TypeError("Read-Ahead schedule requires sessionId"); const p=getPracticeReadAheadProtocol(durationMs); const variant=variantFor(sessionId,scheduleVersion); const map=RELABELS[variant];
 const spans=PRACTICE_READ_AHEAD_MASTER_SCHEDULE.slice(0,p.constrainedBlockCount).map(n=>map[n]); let cursor=p.baselineMs;
 const blocks=[{blockId:"baseline",ordinal:0,startMs:0,endMs:p.baselineMs,kind:"baseline",visibleFutureWords:null}];
 spans.forEach((visibleFutureWords,i)=>{const startMs=cursor;cursor+=p.constrainedBlockMs;blocks.push({blockId:`span-${String(i+1).padStart(2,"0")}`,ordinal:i+1,startMs,endMs:cursor,kind:"constrained",visibleFutureWords});});
 blocks.push({blockId:"integration",ordinal:blocks.length,startMs:cursor,endMs:durationMs,kind:"integration",visibleFutureWords:null});
 return freezeDeep({version:scheduleVersion,variant,spans,blocks});
}
export function getPracticeReadAheadScheduleVariant(sessionId,version=PRACTICE_READ_AHEAD_SCHEDULE_VERSION){return variantFor(sessionId,version);}
