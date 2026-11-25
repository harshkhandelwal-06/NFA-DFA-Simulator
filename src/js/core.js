'use strict';
/* Automata algorithms: epsilon-closure, subset construction, minimisation, running strings. No DOM access. */
/* ---------- NFA helpers ---------- */
const tgt = (nfa, s, sym) => (nfa.delta[s] && nfa.delta[s][sym]) || [];
function closure(nfa, set) {
  const out = new Set(set), st = [...set];
  while (st.length) { const s = st.pop(); for (const t of tgt(nfa, s, EPS)) if (!out.has(t)) { out.add(t); st.push(t); } }
  return out;
}
function move(nfa, set, sym) {
  const out = new Set();
  for (const s of set) for (const t of tgt(nfa, s, sym)) out.add(t);
  return out;
}
function sortSet(nfa, set) {
  const idx = new Map(nfa.states.map((s, i) => [s, i]));
  return [...set].sort((a, b) => idx.get(a) - idx.get(b));
}
const setKey = (nfa, set) => { const a = sortSet(nfa, set); return a.length ? a.join(',') : '∅'; };
const fmt = arr => (arr.length ? '{' + arr.join(', ') + '}' : '∅');
function dfaName(n) { const c = String.fromCharCode(65 + (n % 26)); const k = Math.floor(n / 26); return k ? c + k : c; }

/* ---------- subset construction ---------- */
const LIMIT = 256;
function convert(nfa) {
  const entries = [], byKey = new Map(), order = [];
  const accept = new Set(nfa.accept);
  let truncated = false;
  function add(set) {
    const k = setKey(nfa, set);
    if (byKey.has(k)) return byKey.get(k);
    const arr = sortSet(nfa, set);
    const st = { id: dfaName(order.length), key: k, set: arr, label: fmt(arr), accept: arr.some(s => accept.has(s)), dead: arr.length === 0 };
    byKey.set(k, st); order.push(st);
    return st;
  }
  const seed = [nfa.start];
  const startSet = closure(nfa, seed);
  const s0 = add(startSet);
  const queue = [s0];
  entries.push({ type: 'start', target: s0, seed, closed: sortSet(nfa, startSet), queue: queue.map(q => q.id), isNew: true });
  outer: while (queue.length) {
    const cur = queue.shift();
    for (const sym of nfa.alphabet) {
      const m = move(nfa, cur.set, sym), c = closure(nfa, m);
      const isNew = !byKey.has(setKey(nfa, c));
      if (isNew && order.length >= LIMIT) { truncated = true; break outer; }
      const to = add(c);
      if (isNew) queue.push(to);
      entries.push({ type: 'trans', from: cur, sym, moved: sortSet(nfa, m), closed: sortSet(nfa, c), target: to, isNew, queue: queue.map(q => q.id) });
    }
  }
  const full = {};
  for (const s of order) full[s.id] = {};
  for (const e of entries) if (e.type === 'trans') full[e.from.id][e.sym] = e.target.id;
  return { entries, states: order, truncated, start: s0, full };
}

/* DFA as revealed after `upto` log entries */
function buildDfa(res, upto, showDead) {
  const seen = new Set(), states = [], trans = [];
  for (let i = 0; i < Math.min(upto, res.entries.length); i++) {
    const e = res.entries[i];
    if (!seen.has(e.target.id) && (e.type === 'start' || e.isNew)) { seen.add(e.target.id); states.push(e.target); }
    if (e.type === 'trans') trans.push({ from: e.from.id, sym: e.sym, to: e.target.id });
  }
  if (showDead) return { states, trans };
  const dead = new Set(states.filter(s => s.dead).map(s => s.id));
  return { states: states.filter(s => !s.dead), trans: trans.filter(t => !dead.has(t.to) && !dead.has(t.from)) };
}

/* ---------- minimisation (partition refinement) ---------- */
function minimize(res, alphabet) {
  if (res.truncated) return null;
  const ids = res.states.map(s => s.id), T = res.full;
  const acc = new Set(res.states.filter(s => s.accept).map(s => s.id));
  let part = new Map(ids.map(id => [id, acc.has(id) ? 1 : 0]));
  for (;;) {
    const keys = new Map(), next = new Map();
    for (const id of ids) {
      const k = part.get(id) + '|' + alphabet.map(a => part.get(T[id][a])).join(',');
      if (!keys.has(k)) keys.set(k, keys.size);
      next.set(id, keys.get(k));
    }
    const before = new Set(part.values()).size;
    part = next;
    if (keys.size === before) break;
  }
  // order groups by BFS from the start group
  const groupOf = id => part.get(id);
  const order = [], name = new Map(), q = [groupOf(res.start.id)];
  name.set(q[0], 'M0'); order.push(q[0]);
  while (q.length) {
    const g = q.shift();
    for (const id of ids) if (groupOf(id) === g) for (const a of alphabet) {
      const h = groupOf(T[id][a]);
      if (!name.has(h)) { name.set(h, 'M' + name.size); order.push(h); q.push(h); }
    }
  }
  const states = order.map(g => {
    const members = ids.filter(id => groupOf(id) === g);
    const accepting = members.some(m => acc.has(m));
    const trap = !accepting && members.every(m => alphabet.every(a => groupOf(T[m][a]) === g));
    return { id: name.get(g), members, accept: accepting, dead: trap, label: fmt(members) };
  });
  const trans = [], seen = new Set();
  for (const st of states) {
    const rep = st.members[0];
    for (const a of alphabet) { const to = name.get(groupOf(T[rep][a])); const k = st.id + '|' + a; if (!seen.has(k)) { seen.add(k); trans.push({ from: st.id, sym: a, to }); } }
  }
  const map = {};
  for (const id of ids) map[id] = name.get(groupOf(id));
  const startId = name.get(groupOf(res.start.id));
  return { states, trans, map, start: startId };
}

/* ---------- running strings ---------- */
function runNFA(nfa, str) {
  const sets = [closure(nfa, [nfa.start])];
  for (const ch of str) sets.push(closure(nfa, move(nfa, sets[sets.length - 1], ch)));
  return sets;
}
function runDFA(res, str) {
  let cur = res.start.id; const path = [cur];
  for (const ch of str) { cur = res.full[cur] && res.full[cur][ch]; path.push(cur); if (cur === undefined) break; }
  return path;
}
function runMin(min, str) {
  const t = {}; for (const x of min.trans) (t[x.from] = t[x.from] || {})[x.sym] = x.to;
  let cur = min.start; const path = [cur];
  for (const ch of str) { cur = t[cur] && t[cur][ch]; path.push(cur); if (cur === undefined) break; }
  return path;
}

