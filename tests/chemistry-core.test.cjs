const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = { globalThis: null };
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(new URL('../chemistry-core.js', `file://${__filename}`), 'utf8'), sandbox);
const chem = sandbox.SinceChem;

test('parses element counts, parentheses, hydrate dots, and ion charge', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(chem.parseFormula('Ca(OH)₂').atoms)), { Ca: 1, O: 2, H: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(chem.parseFormula('CuSO₄·5H₂O').atoms)), { Cu: 1, S: 1, O: 9, H: 10 });
  assert.equal(chem.parseFormula('Fe^3+').charge, 3);
  assert.throws(() => chem.parseFormula('Xx₂'), /Неизвестный химический символ/);
  assert.equal(chem.renderFormula('H1O'), 'HO');
  assert.equal(chem.renderFormula('H10O'), 'H₁₀O');
});

test('balances sodium chloride without changing formula subscripts', () => {
  const result = chem.balanceEquation('Na + Cl₂', 'NaCl');
  assert.equal(result.equation, '2Na + Cl₂ → 2NaCl');
  assert.match(result.steps.join(' '), /индекс в формуле остаётся прежним/);
  assert.ok(result.countsAfter.every(row => row.balanced));
});

test('balances multi-stage formulae and acid-metal reactions', () => {
  assert.equal(chem.balanceEquation('C₃H₈ + O₂', 'CO₂ + H₂O').equation, 'C₃H₈ + 5O₂ → 3CO₂ + 4H₂O');
  assert.equal(chem.balanceEquation('Al + HCl', 'AlCl₃ + H₂').equation, '2Al + 6HCl → 2AlCl₃ + 3H₂');
});

test('reports unbalanceable product sets and keeps already balanced equations', () => {
  assert.throws(() => chem.balanceEquation('H₂', 'H₂O'), /коэффициенты|решение/i);
  assert.equal(chem.balanceEquation('2Na + Cl₂', '2NaCl').equation, '2Na + Cl₂ → 2NaCl');
  assert.equal(chem.balanceEquation('4Na + 2Cl₂', '4NaCl').equation, '2Na + Cl₂ → 2NaCl');
});
