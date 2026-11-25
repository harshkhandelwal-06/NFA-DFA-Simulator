// Cross-check harness: tests the simulator's real core code against independent oracles.
// Run: npm run test:crosscheck   (writes tests/crosscheck/out/*.json)
const fs = require('fs');
fs.mkdirSync(__dirname + '/out', { recursive: true });
const core = require('../helpers/load-core');
const { EPS, PRESETS, convert, minimize, runNFA, runDFA, runMin, LIMIT } = core;

// ---- independent oracle: fixed-point epsilon expansion, written separately from core.closure ----
function oracle(nfa, s) {
  const expand = set => { let ch = true; while (ch) { ch = false; for (const q of [...set]) for (const t of (nfa.delta[q] && nfa.delta[q][EPS]) || []) if (!set.has(t)) { set.add(t); ch = true; } } return set; };
  let cur = expand(new Set([nfa.start]));
  for (const c of s) { const nx = new Set(); for (const q of cur) for (const t of (nfa.delta[q] && nfa.delta[q][c]) || []) nx.add(t); cur = expand(nx); }
  return [...cur].some(q => nfa.accept.includes(q));
}
const appDfa = (res, s) => { const p = runDFA(res, s); const st = res.states.find(x => x.id === p[p.length - 1]); return !!(st && st.accept); };
const appMin = (min, s) => { const p = runMin(min, s); const st = min.states.find(x => x.id === p[p.length - 1]); return !!(st && st.accept); };
function allStrings(alpha, maxLen) { const out = ['']; let lvl = ['']; for (let l = 1; l <= maxLen; l++) { const nx = []; for (const s of lvl) for (const a of alpha) nx.push(s + a); out.push(...nx); lvl = nx; } return out; }

const out = { presets: [], random: {}, growth: [] };

// ---- 1. presets against language oracles (regex or predicate) ----
const lang = [
  s => /ab$/.test(s), s => /aba/.test(s), s => /1[01][01]$/.test(s),
  s => /^(ab)*$|^a*$/.test(s), s => /^a*b*c*$/.test(s), s => s.split('a').length - 1 > -1 && ((s.split('a').length - 1) % 2 === 0 || s.endsWith('b'))
];
PRESETS.forEach((p, i) => {
  const res = convert(p), min = minimize(res, p.alphabet), strs = allStrings(p.alphabet, p.alphabet.length === 3 ? 8 : 10);
  let bad = 0;
  for (const s of strs) { const o = lang[i](s); if (oracle(p, s) !== o || appDfa(res, s) !== o || appMin(min, s) !== o) bad++; }
  out.presets.push({ name: p.name, nfa: p.states.length, dfa: res.states.length, min: min.states.length, strings: strs.length, mismatches: bad });
});

// ---- 2. random epsilon-NFAs (seeded, reproducible) ----
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261119);
function randomNfa(id) {
  const n = 1 + Math.floor(R() * 6), k = 2 + Math.floor(R() * 2);
  const states = Array.from({ length: n }, (_, i) => 'q' + i), alphabet = ['a', 'b', 'c'].slice(0, k);
  const pe = 0.12 + R() * 0.25, pn = 0.1 + R() * 0.25, delta = {};
  for (const s of states) { delta[s] = {}; for (const sym of [...alphabet, EPS]) { const t = states.filter(() => R() < (sym === EPS ? 0.12 : pn)); if (t.length) delta[s][sym] = t; } }
  return { id, states, alphabet, start: 'q' + Math.floor(R() * n), accept: states.filter(() => R() < 0.3), delta };
}
const N = 3000; let mism = 0, strTotal = 0, minLE = 0, dfaMax = 0, trunc = 0; const dump = [];
for (let i = 0; i < N; i++) {
  const nfa = randomNfa(i), res = convert(nfa), min = minimize(res, nfa.alphabet);
  if (res.truncated) trunc++;
  const strs = allStrings(nfa.alphabet, 7); strTotal += strs.length;
  for (const s of strs) { const o = oracle(nfa, s); if (appDfa(res, s) !== o || appMin(min, s) !== o) { mism++; break; } }
  if (min.states.length <= res.states.length) minLE++;
  dfaMax = Math.max(dfaMax, res.states.length);
  if (i < 600) dump.push({
    nfa: { states: nfa.states, alphabet: nfa.alphabet, start: nfa.start, accept: nfa.accept, delta: nfa.delta },
    dfa: { states: res.states.map(s => s.id), start: res.start.id, accept: res.states.filter(s => s.accept).map(s => s.id), trans: res.full },
    min: { states: min.states.map(s => s.id), start: min.start, accept: min.states.filter(s => s.accept).map(s => s.id), trans: Object.fromEntries(min.states.map(s => [s.id, Object.fromEntries(min.trans.filter(t => t.from === s.id).map(t => [t.sym, t.to]))])) }
  });
}
out.random = { automata: N, stringsChecked: strTotal, automataWithMismatch: mism, minNotLargerThanDfa: minLE, largestDfa: dfaMax, truncated: trunc };

// ---- 3. size statistics of random NFAs by NFA size ----
out.randomBySize = [];
for (let n = 2; n <= 8; n++) {
  const Rn = rng(1000 + n); let tot = 0, max = 0, cnt = 300, totMin = 0;
  for (let i = 0; i < cnt; i++) {
    const states = Array.from({ length: n }, (_, j) => 'q' + j), alphabet = ['a', 'b'], delta = {};
    for (const s of states) { delta[s] = {}; for (const sym of alphabet) { const t = states.filter(() => Rn() < 1.5 / n); if (t.length) delta[s][sym] = t; } }
    const nfa = { states, alphabet, start: 'q0', accept: states.filter(() => Rn() < 0.3), delta };
    const res = convert(nfa), min = minimize(res, alphabet); tot += res.states.length; totMin += min.states.length; max = Math.max(max, res.states.length);
  }
  out.randomBySize.push({ n, avgDfa: +(tot / cnt).toFixed(1), maxDfa: max, avgMin: +(totMin / cnt).toFixed(1), worstCase: Math.pow(2, n) });
}

// ---- 4. k-th symbol from the end is 1: the worst-case family ----
function kth(k) {
  const states = Array.from({ length: k + 1 }, (_, i) => 'q' + i), delta = { q0: { 0: ['q0'], 1: ['q0', 'q1'] } };
  for (let i = 1; i < k; i++) delta['q' + i] = { 0: ['q' + (i + 1)], 1: ['q' + (i + 1)] };
  delta['q' + k] = {};
  return { states, alphabet: ['0', '1'], start: 'q0', accept: ['q' + k], delta };
}
for (let k = 1; k <= 9; k++) {
  const nfa = kth(k); const t0 = process.hrtime.bigint(); const res = convert(nfa); const min = minimize(res, nfa.alphabet); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  out.growth.push({ k, nfa: nfa.states.length, dfa: res.states.length, min: min ? min.states.length : null, truncated: res.truncated, ms: +ms.toFixed(2) });
}
out.limit = LIMIT;
fs.writeFileSync(__dirname + '/out/xcheck_out.json', JSON.stringify(out, null, 1));
fs.writeFileSync(__dirname + '/out/random_dump.json', JSON.stringify(dump));
console.log(JSON.stringify(out, null, 1));
