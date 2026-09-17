import assert from 'node:assert/strict';
import { auditPracticeEditorialContent, findRepeatedEditorialSentences } from '../scripts/auditPracticeEditorialContent.mjs';
const sentence = 'The cabinet held a carefully numbered collection of objects from the previous expedition.';
const family = (familyId, partition, texts) => ({ familyId, partition, items: texts.map(text => ({ text })) });
// Split at a word boundary, as canonical segmentation does.
const diagnostics = [family('one', 'diagnostic', ['The cabinet held a carefully numbered', 'collection of objects from the previous expedition.']), family('two', 'diagnostic', [sentence])];
assert.equal(findRepeatedEditorialSentences(diagnostics).length, 1);
assert.equal(findRepeatedEditorialSentences([family('one', 'training', [sentence]), family('two', 'benchmark', [sentence.toUpperCase()])]).length, 1);
assert.equal(findRepeatedEditorialSentences([family('one', 'training', [sentence, sentence])]).length, 0);
assert.equal(findRepeatedEditorialSentences([family('one', 'training', ['A short note.']), family('two', 'benchmark', ['A short note.'])]).length, 0);
assert.equal((await auditPracticeEditorialContent()).status, 'PASS');
console.log('Practice editorial family independence PASS');
