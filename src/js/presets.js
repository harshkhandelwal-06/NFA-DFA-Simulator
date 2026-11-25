'use strict';
/* Built-in example automata. */
/* ---------- presets ---------- */
const PRESETS = [
  { name: 'Ends with "ab"', sample: 'bbab', states: ['q0', 'q1', 'q2'], alphabet: ['a', 'b'], start: 'q0', accept: ['q2'],
    delta: { q0: { a: ['q0', 'q1'], b: ['q0'] }, q1: { b: ['q2'] }, q2: {} } },
  { name: 'Contains "aba"', sample: 'bbabab', states: ['q0', 'q1', 'q2', 'q3'], alphabet: ['a', 'b'], start: 'q0', accept: ['q3'],
    delta: { q0: { a: ['q0', 'q1'], b: ['q0'] }, q1: { b: ['q2'] }, q2: { a: ['q3'] }, q3: { a: ['q3'], b: ['q3'] } } },
  { name: '3rd symbol from the end is 1', sample: '10110', states: ['q0', 'q1', 'q2', 'q3'], alphabet: ['0', '1'], start: 'q0', accept: ['q3'],
    delta: { q0: { 0: ['q0'], 1: ['q0', 'q1'] }, q1: { 0: ['q2'], 1: ['q2'] }, q2: { 0: ['q3'], 1: ['q3'] }, q3: {} } },
  { name: 'ε-NFA: (ab)* or a*', sample: 'abab', states: ['q0', 'q1', 'q2', 'q3'], alphabet: ['a', 'b'], start: 'q0', accept: ['q1', 'q3'],
    delta: { q0: { [EPS]: ['q1', 'q3'] }, q1: { a: ['q2'] }, q2: { b: ['q1'] }, q3: { a: ['q3'] } } },
  { name: 'ε-NFA: a*b*c*', sample: 'aabcc', states: ['q0', 'q1', 'q2'], alphabet: ['a', 'b', 'c'], start: 'q0', accept: ['q2'],
    delta: { q0: { a: ['q0'], [EPS]: ['q1'] }, q1: { b: ['q1'], [EPS]: ['q2'] }, q2: { c: ['q2'] } } },
  { name: 'Even number of a, or ends in b', sample: 'aab', states: ['p0', 'p1', 'r0', 'r1'], alphabet: ['a', 'b'], start: 'p0', accept: ['p0', 'r1'],
    delta: { p0: { a: ['p1'], b: ['p0'], [EPS]: ['r0'] }, p1: { a: ['p0'], b: ['p1'] }, r0: { a: ['r0'], b: ['r0', 'r1'] }, r1: {} } }
];

