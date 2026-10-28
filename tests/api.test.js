const assert = require('assert');
const randomService = require('../backend/services/randomService');

console.log('🧪 Testing Backend Services...');

// 1. Test parseCandidates
const parsed = randomService.parseCandidates('  Ba Vì \n\n Tam Đảo\r\nTà Xùa\n  ');
assert.strictEqual(parsed.length, 3, 'parseCandidates should return 3 items');
assert.strictEqual(parsed[0], 'Ba Vì');
assert.strictEqual(parsed[1], 'Tam Đảo');
assert.strictEqual(parsed[2], 'Tà Xùa');
console.log('✅ parseCandidates passed');

// 2. Test pickCandidates
const pick1 = randomService.pickCandidates('A\nB\nC\nD', 2);
assert.strictEqual(pick1.success, true);
assert.strictEqual(pick1.picked.length, 2);
assert.strictEqual(pick1.available, 2);
console.log('✅ pickCandidates basic passed');

// Test pick with exclusion
const pick2 = randomService.pickCandidates('A\nB\nC', 1, ['A', 'B']);
assert.strictEqual(pick2.success, true);
assert.deepStrictEqual(pick2.picked, ['C']);
assert.strictEqual(pick2.drawComplete, true);
console.log('✅ pickCandidates exclusion passed');

// 3. Test orderCandidates
const orderRes = randomService.orderCandidates('1\n2\n3\n4\n5');
assert.strictEqual(orderRes.success, true);
assert.strictEqual(orderRes.ordered.length, 5);
console.log('✅ orderCandidates passed');

// 4. Test spinWheel
const wheelRes = randomService.spinWheel('Alpha\nBeta\nGamma', 0);
assert.strictEqual(wheelRes.success, true);
assert(wheelRes.winner);
assert(typeof wheelRes.winnerIndex === 'number');
assert(wheelRes.finalRotation > 0);
console.log('✅ spinWheel passed');

// 5. Test multi-board
const multiRes = randomService.runMultiBoards([
  { id: 1, title: 'Bảng 1', mode: 'wheel', source: 'X\nY\nZ' },
  { id: 2, title: 'Bảng 2', mode: 'pick', source: '1\n2\n3', pickCount: 1 },
  { id: 3, title: 'Bảng 3', mode: 'order', source: 'Red\nGreen\nBlue' }
]);
assert.strictEqual(multiRes.success, true);
assert.strictEqual(multiRes.results.length, 3);
assert(multiRes.results[0].winner);
assert(multiRes.results[1].picked);
assert(multiRes.results[2].ordered);
console.log('✅ runMultiBoards passed');

// 6. Test cleanText
const cleanedTrim = randomService.cleanText('  a  \n  b  \n', 'trim');
assert.strictEqual(cleanedTrim.cleaned, 'a\nb\n');
const cleanedBlank = randomService.cleanText('a\n\n\nb', 'blank');
assert.strictEqual(cleanedBlank.cleaned, 'a\nb');
const cleanedDup = randomService.cleanText('a\nb\na\nc\nb', 'duplicates');
assert.strictEqual(cleanedDup.cleaned, 'a\nb\nc');
console.log('✅ cleanText passed');

console.log('\n🎉 ALL BACKEND SERVICE TESTS PASSED!\n');
