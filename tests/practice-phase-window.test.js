import test from 'node:test';
import assert from 'node:assert/strict';
import {practicePhaseWindow} from '../js/practiceLab/practiceTargetSessionRendering.js';
test('inter-phase separators remain visible and typable',()=>{
 const phase={startIndex:101,endIndex:300};
 assert.deepEqual(practicePhaseWindow(phase,100,300),{start:100,end:300});
});
test('all current positions survive phase transitions and long passage windows',()=>{
 const phases=[{startIndex:0,endIndex:100},{startIndex:101,endIndex:1100},{startIndex:1101,endIndex:1300}];
 for(let cursor=0;cursor<1300;cursor++){
  const phase=phases.find(p=>cursor>=p.startIndex&&cursor<p.endIndex)??phases.find(p=>p.startIndex>=cursor)??phases.at(-1);
  const window=practicePhaseWindow(phase,cursor,1300);
  assert.ok(window.start<=cursor&&cursor<window.end,`Missing current character ${cursor}`);
  assert.ok(window.end-window.start<=400,'Visible DOM stays bounded');
 }
});
test('window bounds cannot exceed available content',()=>{
 assert.deepEqual(practicePhaseWindow(null,0,12),{start:0,end:12});
 assert.deepEqual(practicePhaseWindow({startIndex:0,endIndex:999},800,900),{start:720,end:900});
});
