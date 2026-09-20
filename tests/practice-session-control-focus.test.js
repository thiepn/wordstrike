import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const hosts=[
  'practiceWeakKeysSessionHost.js',
  'practiceCombinationRepairSessionHost.js',
  'practiceSpecialDomainSessionHost.js',
  'practiceWeaknessBossSessionHost.js',
  'practiceResearchProbeSessionHost.js',
  'practiceCoachReviewSessionHost.js',
];

for(const name of hosts)test(`${name} does not globally steal pointer focus`,()=>{
  const source=fs.readFileSync(new URL(`../js/practiceLab/${name}`,import.meta.url),'utf8');
  assert.ok(!source.includes('addEventListener("pointerdown"'),`${name} should rely on passage click/refocus instead of root pointerdown`);
  assert.ok(!source.includes("addEventListener('pointerdown'"),`${name} should not register root pointerdown focus theft`);
});
