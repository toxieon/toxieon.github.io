const test = require('node:test');
const assert = require('node:assert/strict');
const GC = require('./nd-gate-codes.js');

test('validateCode accepts only four digits', () => {
  assert.equal(GC.validateCode('0000'), '');
  assert.ok(GC.validateCode('12a4'));
});
