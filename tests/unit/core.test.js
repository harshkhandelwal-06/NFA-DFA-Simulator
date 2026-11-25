'use strict';
// Unit tests for the automata core (Node's built-in test runner; no dependencies).
const test = require('node:test');
const assert = require('node:assert/strict');
const { EPS, PRESETS, convert, minimize, runNFA, runDFA, runMin, LIMIT } = require('../helpers/load-core');

const accepts = (res, s) => { const p = runDFA(res, s); const st = res.states.find(x => x.id === p[p.length - 1]); return !!(st && st.accept); };
const acceptsMin = (min, s) => { const p = runMin(min, s); const st = min.states.find(x => x.id === p[p.length - 1]); return !!(st && st.accept); };
const kth = k => {
  const states = Array.from({ length: k + 1 }, (_, i) => 'q' + i), delta = { q0: { 0: ['q0'], 1: ['q0', 'q1'] } };
  for (let i = 1; i < k; i++) delta['q' + i] = { 0: ['q' + (i + 1)], 1: ['q' + (i + 1)] };
  delta['q' + k] = {};
  return { states, alphabet: ['0', '1'], start: 'q0', accept: ['q' + k], delta };
};
const strings = (alpha, n) => { let out = [''], lvl = ['']; for (let l = 1; l <= n; l++) { const nx = []; for (const s of lvl) for (const a of alpha) nx.push(s + a); out.push(...nx); lvl = nx; } return out; };

test('example "ends with ab": DFA and minimal DFA accept exactly /ab$/', () => {
  const nfa = PRESETS[0], res = convert(nfa), min = minimize(res, nfa.alphabet);
  for (const s of strings(nfa.alphabet, 8)) {
    const want = /ab$/.test(s);
    assert.equal(accepts(res, s), want, 'DFA on ' + s);
    assert.equal(acceptsMin(min, s), want, 'minimal on ' + s);
  }
});

test('"contains aba": NFA 4 -> DFA 6 -> minimal 4', () => {
  const nfa = PRESETS[1], res = convert(nfa), min = minimize(res, nfa.alphabet);
  assert.deepEqual([nfa.states.length, res.states.length, min.states.length], [4, 6, 4]);
});

test('epsilon-closure: start set of the (ab)* or a* example is {q0, q1, q3}', () => {
  const nfa = PRESETS[3], res = convert(nfa);
  assert.deepEqual([...res.start.set].sort(), ['q0', 'q1', 'q3']);
});

test('empty string is accepted through epsilon moves', () => {
  const nfa = PRESETS[3], res = convert(nfa);
  assert.equal(accepts(res, ''), true);
});

test('worst-case family: k-th symbol from the end gives 2^k DFA states and the same minimal size', () => {
  for (let k = 1; k <= 8; k++) {
    const nfa = kth(k), res = convert(nfa), min = minimize(res, nfa.alphabet);
    assert.equal(res.states.length, 2 ** k, 'DFA k=' + k);
    assert.equal(min.states.length, 2 ** k, 'minimal k=' + k);
    assert.equal(res.truncated, false);
  }
});

test('size cap: 9th symbol from the end stops at ' + LIMIT + ' states', () => {
  const res = convert(kth(9));
  assert.equal(res.truncated, true);
  assert.equal(res.states.length, LIMIT);
});

test('empty language: minimal DFA has one state and rejects everything', () => {
  const nfa = { states: ['q0', 'q1'], alphabet: ['a', 'b'], start: 'q0', accept: [], delta: { q0: { a: ['q1'] }, q1: {} } };
  const res = convert(nfa), min = minimize(res, nfa.alphabet);
  assert.equal(min.states.length, 1);
  assert.equal(acceptsMin(min, 'abab'), false);
});

test('epsilon cycle terminates', () => {
  const nfa = { states: ['q0', 'q1'], alphabet: ['a'], start: 'q0', accept: ['q1'], delta: { q0: { [EPS]: ['q1'] }, q1: { [EPS]: ['q0'] } } };
  const res = convert(nfa);
  assert.deepEqual([...res.start.set].sort(), ['q0', 'q1']);
});

test('NFA, DFA and minimal DFA agree on every preset for all strings up to length 8', () => {
  for (const nfa of PRESETS) {
    const res = convert(nfa), min = minimize(res, nfa.alphabet);
    for (const s of strings(nfa.alphabet, 8)) {
      const n = runNFA(nfa, s);
      const nfaAcc = [...n[n.length - 1]].some(q => nfa.accept.includes(q));
      const d = accepts(res, s);
      assert.equal(acceptsMin(min, s), d, `${nfa.name}: minimal vs DFA on "${s}"`);
      assert.equal(nfaAcc, d, `${nfa.name}: NFA vs DFA on "${s}"`);
    }
  }
});
