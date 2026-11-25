'use strict';
/* Application state, the four screens, editor, import and export, start-up. */
/* ================= app state ================= */
const S = {
  nfa: null, res: null, min: null, view: 'define', cv: 'dfa', step: 0, watched: -1,
  showDead: true, showSets: true, timer: null, delay: 700,
  posN: {}, posD: {}, posM: {},
  test: { str: '', error: '', sets: [], path: [], mpath: [], pos: 0, timer: null, ok: null }
};
const DELAYS = [1500, 1050, 700, 400, 180];
const VIEWS = ['define', 'convert', 'compare', 'test'];

/* ---------- derived graphs ---------- */
function nfaGraph() {
  const n = S.nfa, edges = [];
  for (const s of n.states) for (const sym of [...n.alphabet, EPS]) for (const t of tgt(n, s, sym)) edges.push({ from: s, to: t, sym });
  return { nodes: n.states.map(s => ({ id: s, label: s, sub: '', accept: n.accept.includes(s), start: s === n.start })), edges: mergeEdges(edges) };
}
function dfaFullIds() {
  const all = buildDfa(S.res, S.res.entries.length, true);
  return { nodes: all.states.map(s => s.id), edges: all.trans };
}
function dfaGraph(step) {
  const d = buildDfa(S.res, step, S.showDead);
  return {
    nodes: d.states.map(s => ({ id: s.id, label: s.id, sub: S.showSets ? s.label : '', accept: s.accept, start: s.id === S.res.start.id, dead: s.dead })),
    edges: mergeEdges(d.trans)
  };
}
function minGraph() {
  const m = S.min;
  if (!m) return { nodes: [], edges: [] };
  const hide = new Set(S.showDead ? [] : m.states.filter(s => s.dead).map(s => s.id));
  return {
    nodes: m.states.filter(s => !hide.has(s.id)).map(s => ({ id: s.id, label: s.id, sub: S.showSets ? s.label : '', accept: s.accept, start: s.id === m.start, dead: s.dead })),
    edges: mergeEdges(m.trans.filter(t => !hide.has(t.from) && !hide.has(t.to)))
  };
}
function ensurePos(map, ids, edges, startId) {
  const p = layout(ids, edges, startId);
  for (const id of ids) if (!map[id]) map[id] = p[id];
}
function resetLayouts() {
  S.posN = {}; S.posD = {}; S.posM = {};
  ensurePos(S.posN, S.nfa.states, nfaGraph().edges, S.nfa.start);
  const f = dfaFullIds(); ensurePos(S.posD, f.nodes, f.edges, S.res.start.id);
  if (S.min) ensurePos(S.posM, S.min.states.map(s => s.id), mergeEdges(S.min.trans), S.min.start);
}

/* ---------- compute ---------- */
function recompute(opts = {}) {
  const keepN = opts.keepN;
  const oldN = S.posN;
  S.res = convert(S.nfa);
  S.min = minimize(S.res, S.nfa.alphabet);
  resetLayouts();
  if (keepN) for (const id of S.nfa.states) if (oldN[id]) S.posN[id] = oldN[id];
  stopPlay(); S.step = S.res.entries.length; S.watched = -1;
  runTest(false);
  renderPipe();
  if (opts.editor) renderEditor();
  renderView();
}

/* ---------- small renderers ---------- */
function renderPipe() {
  const d = S.res.states.length, m = S.min ? S.min.states.length : '–';
  $('#pipe').innerHTML =
    `<span>Machine sizes:</span><span class="sz nfa"><i></i>NFA <b>${S.nfa.states.length}</b> states</span><span class="ar">→</span>` +
    `<span class="sz dfa" style="animation-delay:.08s"><i></i>DFA <b>${d}${S.res.truncated ? '+' : ''}</b> states</span><span class="ar">→</span>` +
    `<span class="sz min" style="animation-delay:.16s"><i></i>Minimal <b>${m}</b> states</span>` +
    `<span style="margin-left:6px">Worst case for this NFA is 2<sup>${S.nfa.states.length}</sup> = ${S.nfa.states.length <= 20 ? Math.pow(2, S.nfa.states.length) : 'huge'}.</span>`;
}

function renderEditor() {
  const n = S.nfa, cols = [...n.alphabet, EPS];
  $('#alphaChips').innerHTML = '<span style="color:var(--muted);font-size:12.5px">Alphabet Σ</span>' +
    n.alphabet.map(a => `<span class="chip">${esc(a)}${n.alphabet.length > 1 ? `<button type="button" data-rmsym="${esc(a)}" aria-label="Remove symbol ${esc(a)}">×</button>` : '<span style="width:6px"></span>'}</span>`).join('');
  let h = '<thead><tr><th title="start state">Start</th><th title="accepting state">Final</th><th>State</th>' +
    cols.map(c => `<th class="${c === EPS ? 'eps' : ''}">${esc(c)}</th>`).join('') + '<th></th></tr></thead><tbody>';
  for (const s of n.states) {
    h += `<tr class="row-in"><td><input type="radio" name="start" data-start="${esc(s)}" ${n.start === s ? 'checked' : ''} aria-label="${esc(s)} is the start state"></td>` +
      `<td><input type="checkbox" data-acc="${esc(s)}" ${n.accept.includes(s) ? 'checked' : ''} aria-label="${esc(s)} is accepting"></td>` +
      `<td><input class="nm" data-name="${esc(s)}" value="${esc(s)}" spellcheck="false" aria-label="State name"></td>` +
      cols.map(c => `<td><input class="cell" data-s="${esc(s)}" data-sym="${esc(c)}" value="${esc(tgt(n, s, c).join(','))}" placeholder="–" spellcheck="false" aria-label="${esc(s)} on ${esc(c)}"></td>`).join('') +
      `<td><button class="x" type="button" data-del="${esc(s)}" aria-label="Delete ${esc(s)}" ${n.states.length < 2 ? 'disabled' : ''}>✕</button></td></tr>`;
  }
  $('#edTable').innerHTML = h + '</tbody>';
}

function highlightSets() {
  const t = S.test, p = t.pos;
  return {
    n: new Set(t.sets[p] ? [...t.sets[p]] : []),
    d: new Set(t.path[p] ? [t.path[p]] : []),
    m: new Set(t.mpath[p] ? [t.mpath[p]] : [])
  };
}

/* ---------- Convert screen ---------- */
function flowChip(cls, label, main, sub, d) { return `<div class="fc ${cls}" style="--d:${d}s"><small>${label}</small><b>${main}</b>${sub ? `<span>${sub}</span>` : ''}</div>`; }
function flowArrow(label, d) { return `<div class="fa" style="--d:${d}s"><i>→</i><small>${label}</small></div>`; }
function renderNow() {
  const E = S.res.entries, N = E.length, k = Math.min(S.step, N), box = $('#nowBody');
  if (k === 0) {
    box.innerHTML = `<div class="now-title">Ready to convert <small>${N} steps</small></div><p class="now-text">The first DFA state is the ε-closure of the NFA start state <b class="mono">${esc(S.nfa.start)}</b>. Then each new DFA state is tried on every symbol: take the <b>move</b>, then the <b>ε-closure</b>, and that set becomes the next DFA state. Press <b>Play</b> or <b>▶|</b>.</p>`;
    return;
  }
  const e = E[k - 1], acc = e.target.accept ? ' acc' : '';
  let head, flow;
  if (e.type === 'start') {
    head = `<div class="now-title">Step ${k} of ${N}: start state</div>`;
    flow = flowChip('', 'NFA start', esc(S.nfa.start), '', 0) + flowArrow('ε-closure', .1) + flowChip('', 'reachable by ε', esc(fmt(e.closed)), '', .2) + flowArrow('becomes', .3) + flowChip('to' + acc, 'DFA state', e.target.id, esc(e.target.label), .4);
  } else {
    const tag = e.isNew ? (e.target.dead ? '<span class="tag dead">dead state</span>' : '<span class="tag">new state</span>') : '<span class="tag old">already exists</span>';
    head = `<div class="now-title">Step ${k} of ${N}: from ${e.from.id} on <span class="mono">${esc(e.sym)}</span> ${tag}</div>`;
    flow = flowChip('from' + (e.from.accept ? ' acc' : ''), 'DFA state', e.from.id, esc(e.from.label), 0) + flowArrow('move on <b class="mono">' + esc(e.sym) + '</b>', .1) +
      flowChip('', 'NFA states reached', esc(fmt(e.moved)), '', .2) + flowArrow('ε-closure', .3) + flowChip('', 'with ε-moves', esc(fmt(e.closed)), '', .4) + flowArrow(e.isNew ? 'new' : 'matches', .5) +
      flowChip('to' + (e.isNew ? '' : ' old') + acc, 'DFA state', e.target.id, esc(e.target.label), .6);
  }
  const done = k === N ? `<p class="now-text" style="color:var(--ink)"><b>Done.</b> ${S.res.states.length} DFA states${S.res.truncated ? ' (stopped at the size limit)' : ''}, ${S.res.states.filter(s => s.accept).length} accepting. Open <b>Compare</b> to see it next to the NFA and the minimal DFA.</p>` : '';
  box.innerHTML = head + `<div class="flow" style="margin-top:8px">${flow}</div>` + done;
}

function renderLog() {
  const E = S.res.entries, upto = Math.min(S.step, E.length), last = E[upto - 1];
  $('#worklist').innerHTML = upto === 0
    ? '<span>Nothing processed yet.</span>'
    : `<span>Still to process:</span>${last.queue.length ? last.queue.map(q => `<span class="pill">${q}</span>`).join('') : '<span class="pill">nothing left</span>'}<span>· DFA states so far: ${buildDfa(S.res, upto, true).states.length}</span>`;
  const rows = [];
  for (let i = 0; i < upto; i++) {
    const e = E[i], cur = i === upto - 1 && S.step < E.length;
    if (e.type === 'start') {
      rows.push(`<li class="lg${cur ? ' cur' : ''}"><span class="k">start</span><span class="ch"><b>ε-closure</b> <span class="st">{${esc(e.seed.join(', '))}}</span> → <span class="st">${esc(fmt(e.closed))}</span> → <span class="pill new${e.target.accept ? ' acc' : ''}">${e.target.id}</span></span></li>`);
    } else {
      const tag = e.isNew ? (e.target.dead ? '<span class="tag dead">dead</span>' : '<span class="tag">new</span>') : '<span class="tag old">seen</span>';
      rows.push(`<li class="lg${cur ? ' cur' : ''}"><span class="k">δ(${e.from.id}, ${esc(e.sym)})</span><span class="ch"><b>move</b> <span class="st">${esc(fmt(e.moved))}</span> → <b>closure</b> <span class="st">${esc(fmt(e.closed))}</span> → <span class="pill${e.isNew ? ' new' : ''}${e.target.accept ? ' acc' : ''}">${e.target.id}</span>${tag}</span></li>`);
    }
  }
  const box = $('#log'), fresh = S._logUpto;
  box.innerHTML = rows.join('') || '<li class="note">Steps will appear here.</li>';
  const lis = $$('.lg', box);
  lis.forEach((li, i) => { if (!(i === lis.length - 1 && upto > (fresh || 0))) li.style.animation = 'none'; });
  S._logUpto = upto;
  box.scrollTop = box.scrollHeight;
}

function renderTable() {
  const n = S.nfa, upto = S.step, d = buildDfa(S.res, upto, S.showDead);
  const trans = {}; for (const t of d.trans) (trans[t.from] = trans[t.from] || {})[t.sym] = t.to;
  const E = S.res.entries, lastE = upto > 0 ? E[Math.min(upto, E.length) - 1] : null, building = upto < E.length;
  let h = '<thead><tr><th>State</th><th>NFA set</th>' + n.alphabet.map(a => `<th>${esc(a)}</th>`).join('') + '</tr></thead><tbody>';
  for (const s of d.states) {
    const mark = (s.id === S.res.start.id ? '<span class="mark">→</span>' : '') + (s.accept ? '<span class="fin">*</span>' : '');
    const isNewRow = lastE && lastE.isNew && lastE.target.id === s.id;
    h += `<tr class="${isNewRow ? 'flash' : ''}"><td class="st">${mark} ${s.id}</td><td class="sets">${esc(s.label)}</td>` +
      n.alphabet.map(a => {
        const to = trans[s.id] && trans[s.id][a];
        const f = lastE && lastE.type === 'trans' && lastE.from.id === s.id && lastE.sym === a;
        return to ? `<td class="${f ? 'f' : ''}">${to}</td>` : '<td class="blank">·</td>';
      }).join('') + '</tr>';
  }
  $('#dfaTable').innerHTML = h + '</tbody>';
  $('#tblNote').textContent = S.res.truncated
    ? `Stopped at ${LIMIT} DFA states. This NFA is too large to convert fully here.`
    : (building ? 'Rows fill in as the conversion runs. ' : '') + '→ marks the start state, * marks accepting states.' + (S.showDead && S.res.states.some(s => s.dead) ? ' ∅ is the dead state.' : '');
}

function renderControls() {
  const N = S.res.entries.length;
  $('#posTxt').textContent = `${Math.min(S.step, N)} / ${N}`;
  $('#barFill').style.width = (N ? Math.min(S.step, N) / N * 100 : 0) + '%';
  $('#bFirst').disabled = $('#bPrev').disabled = S.step === 0;
  $('#bNext').disabled = $('#bLast').disabled = S.step >= N;
  $('#bPlay').textContent = S.timer ? '❚❚ Pause' : (S.step >= N ? '↻ Replay' : '▶ Play');
  $('#bPlay').setAttribute('aria-label', S.timer ? 'Pause' : 'Play');
  $('#bPlay').classList.toggle('pulse', S.step === 0 && !S.timer);
}

function renderConvertGraphs() {
  const E = S.res.entries, building = S.step < E.length, last = S.step > 0 ? E[Math.min(S.step, E.length) - 1] : null;
  const cur = last ? (last.type === 'start' ? last.target.id : last.from.id) : null;
  const hot = last && last.type === 'trans' ? last.from.id + '>' + last.target.id : null;
  if (S.cv === 'dfa') renderGraph($('#svgCvD'), dfaGraph(S.step), S.posD, { current: building ? cur : null, hotEdge: building ? hot : null, emptyText: 'Press Play to build the DFA', scroll: true });
  else renderGraph($('#svgCvN'), nfaGraph(), S.posN, { scroll: true });
}

/* ---------- other screens ---------- */
function renderDefine() { renderGraph($('#svgDefN'), nfaGraph(), S.posN, { scroll: true }); }

function renderCompare() {
  const hl = { n: new Set(), d: new Set(), m: new Set() };
  renderGraph($('#svgCmpN'), nfaGraph(), S.posN, { active: hl.n });
  renderGraph($('#svgCmpD'), dfaGraph(S.res.entries.length), S.posD, {});
  renderGraph($('#svgCmpM'), minGraph(), S.posM, { emptyText: 'DFA too large to minimise here' });
  const nS = S.nfa.states.length, dS = S.res.states.length, mS = S.min ? S.min.states.length : null;
  $('#cmpSummary').innerHTML = `The NFA with <b>${nS}</b> states became a DFA with <b>${dS}</b> states` +
    (mS !== null ? `, and ${mS < dS ? `minimisation merged it down to <b>${mS}</b>` : `it is already minimal at <b>${mS}</b>`}.` : '.') +
    (S.res.states.some(s => s.dead) ? ' The dashed ∅ state is the dead state.' : '');
  $('#capN').innerHTML = `<b>${nS}</b> states, <b>${S.nfa.accept.length}</b> accepting${S.nfa.states.some(s => tgt(S.nfa, s, EPS).length) ? ', uses ε-moves' : ''}.`;
  $('#capD').innerHTML = `<b>${dS}</b> states, <b>${S.res.states.filter(s => s.accept).length}</b> accepting. Every state has exactly one move per symbol.`;
  $('#capM').innerHTML = mS === null ? 'Too large to minimise.' : `<b>${mS}</b> states, <b>${S.min.states.filter(s => s.accept).length}</b> accepting. No two states are equivalent.`;
  if (S.min) {
    let h = '<thead><tr><th>DFA state</th><th>NFA states inside</th><th>Accepting</th><th>Minimal state</th></tr></thead><tbody>';
    for (const s of S.res.states) h += `<tr><td class="st">${s.id}</td><td class="sets">${esc(s.label)}</td><td>${s.accept ? '<span class="fin">yes</span>' : '–'}</td><td class="mn">${S.min.map[s.id]}</td></tr>`;
    $('#mapTable').innerHTML = h + '</tbody>';
  } else $('#mapTable').innerHTML = '<tbody><tr><td>Minimisation skipped for very large DFAs.</td></tr></tbody>';
}

function renderTestGraphs() {
  const h = highlightSets();
  renderGraph($('#svgTsN'), nfaGraph(), S.posN, { active: h.n });
  renderGraph($('#svgTsD'), dfaGraph(S.res.entries.length), S.posD, { active: h.d });
  renderGraph($('#svgTsM'), minGraph(), S.posM, { active: h.m, emptyText: 'DFA too large to minimise here' });
}

function renderView() {
  if (S.view === 'define') renderDefine();
  else if (S.view === 'convert') { renderNow(); renderLog(); renderTable(); renderControls(); renderConvertGraphs(); }
  else if (S.view === 'compare') renderCompare();
  else if (S.view === 'test') { renderTestGraphs(); renderTest(); }
}

/* ---------- navigation ---------- */
function showView(v, fromHash) {
  if (!VIEWS.includes(v)) v = 'define';
  if (S.view !== v) stopPlay();
  S.view = v;
  VIEWS.forEach(x => { $('#v-' + x).hidden = x !== v; });
  $$('.nv').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v));
  if (v === 'convert' && S.watched !== S.nfa._ver) { S.step = 0; S.watched = S.nfa._ver; }
  if (v !== 'test') stopTestPlay();
  if (!fromHash && location.hash !== '#' + v) { try { history.replaceState(null, '', '#' + v); } catch (e) { location.hash = v; } }
  renderView();
  if (v === 'test' && !$('#testStr').value && S.test.str) $('#testStr').value = S.test.str;
}

/* ---------- stepper ---------- */
function stopPlay() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }
function goto(step) {
  S.step = Math.max(0, Math.min(S.res.entries.length, step));
  if (S.view === 'convert') { renderNow(); renderLog(); renderTable(); renderControls(); renderConvertGraphs(); }
}
function playTick() {
  if (S.step >= S.res.entries.length) { stopPlay(); renderControls(); return; }
  goto(S.step + 1);
  if (S.step >= S.res.entries.length) { stopPlay(); renderControls(); }
}
function togglePlay() {
  if (S.timer) { stopPlay(); renderControls(); return; }
  if (S.cv !== 'dfa') setCv('dfa');
  if (S.step >= S.res.entries.length) goto(0);
  playTick();
  if (S.step < S.res.entries.length) S.timer = setInterval(playTick, S.delay);
  renderControls();
}
function setCv(v) {
  S.cv = v;
  $$('#cvTabs .tab').forEach(b => b.setAttribute('aria-selected', b.dataset.cv === v));
  $('#paneCvD').hidden = v !== 'dfa'; $('#paneCvN').hidden = v !== 'nfa';
  renderConvertGraphs();
}

/* ---------- NFA editing ---------- */
const nextName = () => { let i = 0; while (S.nfa.states.includes('q' + i)) i++; return 'q' + i; };
function touch(editor) { S.nfa._ver = (S.nfa._ver || 0) + 1; recompute({ editor, keepN: true }); }
function validName(s) { return /^[^\s,>{}]+$/.test(s) && s !== EPS && s.length <= 8; }
const EDNOTE = 'Use the ε column for epsilon moves. Pick the start state with the radio button and mark accepting states with the checkbox.';
function say(msg, warn) { const n = $('#edNote'); n.textContent = msg; n.classList.toggle('warn', !!warn); }

function setupEditor() {
  const tbl = $('#edTable');
  tbl.addEventListener('input', ev => {
    const el = ev.target; if (!el.classList.contains('cell')) return;
    const s = el.dataset.s, sym = el.dataset.sym, toks = el.value.split(/[,\s]+/).filter(Boolean);
    const bad = toks.filter(t => !S.nfa.states.includes(t));
    el.classList.toggle('bad', bad.length > 0);
    const ok = [...new Set(toks.filter(t => S.nfa.states.includes(t)))];
    S.nfa.delta[s] = S.nfa.delta[s] || {};
    if (ok.length) S.nfa.delta[s][sym] = ok; else delete S.nfa.delta[s][sym];
    say(bad.length ? `Unknown state${bad.length > 1 ? 's' : ''}: ${bad.join(', ')}. Add ${bad.length > 1 ? 'them' : 'it'} first.` : EDNOTE, bad.length);
    touch(false);
  });
  tbl.addEventListener('change', ev => {
    const el = ev.target, n = S.nfa;
    if (el.dataset.start) { n.start = el.dataset.start; touch(false); }
    else if (el.dataset.acc) { const s = el.dataset.acc; n.accept = el.checked ? [...new Set([...n.accept, s])] : n.accept.filter(x => x !== s); touch(false); }
    else if (el.dataset.name) {
      const old = el.dataset.name, nu = el.value.trim();
      if (nu === old) return;
      if (!validName(nu) || n.states.includes(nu)) { el.classList.add('shake'); say(!validName(nu) ? 'State names need 1 to 8 characters, with no spaces, commas or braces.' : `A state called ${nu} already exists.`, true); el.value = old; setTimeout(() => el.classList.remove('shake'), 400); return; }
      const re = x => (x === old ? nu : x);
      n.states = n.states.map(re); n.start = re(n.start); n.accept = n.accept.map(re);
      const d = {};
      for (const s of Object.keys(n.delta)) { d[re(s)] = {}; for (const sym of Object.keys(n.delta[s])) d[re(s)][sym] = n.delta[s][sym].map(re); }
      n.delta = d;
      const keep = S.posN[old]; say('Renamed ' + old + ' to ' + nu + '.'); touch(true); if (keep) { S.posN[nu] = keep; renderView(); }
    }
  });
  tbl.addEventListener('click', ev => {
    const b = ev.target.closest('[data-del]'); if (!b) return;
    const n = S.nfa, s = b.dataset.del; if (n.states.length < 2) return;
    n.states = n.states.filter(x => x !== s); n.accept = n.accept.filter(x => x !== s);
    if (n.start === s) n.start = n.states[0];
    delete n.delta[s];
    for (const k of Object.keys(n.delta)) for (const sym of Object.keys(n.delta[k])) { n.delta[k][sym] = n.delta[k][sym].filter(x => x !== s); if (!n.delta[k][sym].length) delete n.delta[k][sym]; }
    say('Deleted ' + s + ' and every move into it.'); touch(true);
  });
  $('#alphaChips').addEventListener('click', ev => {
    const b = ev.target.closest('[data-rmsym]'); if (!b) return;
    const a = b.dataset.rmsym, n = S.nfa; if (n.alphabet.length < 2) return;
    n.alphabet = n.alphabet.filter(x => x !== a);
    for (const s of Object.keys(n.delta)) delete n.delta[s][a];
    touch(true);
  });
  $('#btnAddState').addEventListener('click', () => { const s = nextName(); S.nfa.states.push(s); S.nfa.delta[s] = {}; say('Added ' + s + '. Fill in its transitions.'); touch(true); });
  const addSym = () => {
    const inp = $('#newSym'), a = inp.value.trim();
    if (!a || a === EPS || /[,\s]/.test(a) || S.nfa.alphabet.includes(a)) { inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 400); say(S.nfa.alphabet.includes(a) ? `${a} is already in the alphabet.` : 'Enter one symbol that is not already used.', true); return; }
    S.nfa.alphabet.push(a); inp.value = ''; say('Added symbol ' + a + '.'); touch(true);
  };
  $('#btnAddSym').addEventListener('click', addSym);
  $('#newSym').addEventListener('keydown', e => { if (e.key === 'Enter') addSym(); });

  const nfaJson = () => JSON.stringify({ states: S.nfa.states, alphabet: S.nfa.alphabet, start: S.nfa.start, accept: S.nfa.accept, delta: S.nfa.delta }, null, 2);
  $('#btnCopyNfa').addEventListener('click', async () => {
    const txt = nfaJson();
    try { await navigator.clipboard.writeText(txt); say('NFA JSON copied. Use Load JSON to paste one back in.'); }
    catch (e) { $('#jsonWrap').hidden = false; $('#jsonBox').value = txt; $('#jsonBox').select(); say('Clipboard is blocked here, so the JSON is selected below.'); }
  });
  $('#btnLoadNfa').addEventListener('click', () => { $('#jsonWrap').hidden = false; $('#jsonBox').value = nfaJson(); $('#jsonBox').focus(); });
  $('#btnCloseJson').addEventListener('click', () => { $('#jsonWrap').hidden = true; });
  $('#btnApplyJson').addEventListener('click', () => {
    try {
      const o = JSON.parse($('#jsonBox').value);
      const ok = Array.isArray(o.states) && o.states.length && o.states.every(validName) && new Set(o.states).size === o.states.length &&
        Array.isArray(o.alphabet) && o.alphabet.length && o.alphabet.every(a => typeof a === 'string' && a.length === 1 && a !== EPS) &&
        o.states.includes(o.start) && Array.isArray(o.accept) && o.accept.every(a => o.states.includes(a)) && o.delta && typeof o.delta === 'object';
      if (!ok) throw new Error('bad shape');
      const delta = {};
      for (const s of o.states) { delta[s] = {}; const row = o.delta[s] || {}; for (const sym of Object.keys(row)) { if (sym !== EPS && !o.alphabet.includes(sym)) continue; const t = [].concat(row[sym]).filter(x => o.states.includes(x)); if (t.length) delta[s][sym] = [...new Set(t)]; } }
      S.nfa = { states: o.states, alphabet: o.alphabet, start: o.start, accept: o.accept, delta, _ver: (S.nfa._ver || 0) + 1 };
      $('#jsonWrap').hidden = true; say('Loaded the NFA from JSON.'); recompute({ editor: true });
    } catch (e) { say('That JSON is not a valid NFA. It needs states, alphabet (single characters), start, accept and delta.', true); }
  });
}

/* ---------- tester ---------- */
function acceptsNfa(str) { return [...runNFA(S.nfa, str).pop()].some(s => S.nfa.accept.includes(s)); }
function runTest(animate) {
  const t = S.test, str = t.str;
  const bad = [...str].find(c => !S.nfa.alphabet.includes(c));
  t.error = bad ? `"${bad}" is not in the alphabet {${S.nfa.alphabet.join(', ')}}.` : '';
  if (t.error) { t.sets = []; t.path = []; t.mpath = []; t.pos = 0; t.ok = null; return; }
  t.sets = runNFA(S.nfa, str); t.path = runDFA(S.res, str); t.mpath = S.min ? runMin(S.min, str) : [];
  t.pos = animate ? 0 : str.length;
  const last = t.sets[t.sets.length - 1], dst = S.res.states.find(s => s.id === t.path[t.path.length - 1]);
  t.ok = { nfa: [...last].some(s => S.nfa.accept.includes(s)), dfa: dst ? dst.accept : null };
}
function stopTestPlay() { if (S.test.timer) { clearInterval(S.test.timer); S.test.timer = null; } }
function startTest() {
  stopTestPlay(); S.test.str = $('#testStr').value.trim();
  runTest(true); renderTestGraphs(); renderTest();
  if (S.test.error || !S.test.str.length) return;
  S.test.timer = setInterval(() => {
    S.test.pos++; renderTestGraphs(); renderTest();
    if (S.test.pos >= S.test.str.length) stopTestPlay();
  }, Math.max(350, S.delay * .8));
}
function stepTest(d) {
  const t = S.test; if (t.error || !t.sets.length) return;
  stopTestPlay(); t.pos = Math.max(0, Math.min(t.str.length, t.pos + d)); renderTestGraphs(); renderTest();
}
function renderTest() {
  const t = S.test, note = $('#testNote');
  renderQuick();
  if (t.error) {
    note.textContent = t.error; note.classList.add('warn');
    $('#verdictRow').innerHTML = ''; $('#trace').innerHTML = ''; renderPreview(); return;
  }
  note.classList.remove('warn');
  note.textContent = t.sets.length ? '' : 'Type a string and press Run.';
  const done = t.pos >= t.str.length;
  let v = '';
  if (!t.sets.length) v = '';
  else if (!done) v = `<span class="verdict wait">Reading symbol ${t.pos + 1} of ${t.str.length}…</span>`;
  else if (t.ok) {
    const acc = t.ok.nfa;
    v = `<span class="verdict ${acc ? 'ok' : 'no'}">${acc ? '✓ Accepted' : '✕ Rejected'}</span><span class="agree${t.ok.dfa === acc ? '' : ' no'}" style="margin:0">${t.ok.dfa === null ? 'DFA incomplete' : t.ok.dfa === acc ? 'NFA, DFA and minimal DFA agree' : 'NFA and DFA disagree'}</span>`;
  }
  $('#verdictRow').innerHTML = v;
  let h = '<thead><tr><th>#</th><th>Read</th><th>NFA states</th><th>DFA</th><th>Minimal</th></tr></thead><tbody>';
  if (t.sets.length) for (let i = 0; i <= t.str.length; i++) {
    const cls = i === t.pos ? 'on' : i < t.pos ? 'past' : '';
    h += `<tr class="${cls}" style="--i:${i}"><td>${i}</td><td class="rd">${i === 0 ? 'start' : esc(t.str[i - 1])}</td><td>${esc(fmt(sortSet(S.nfa, t.sets[i])))}</td><td>${esc(t.path[i] || '–')}</td><td>${esc(t.mpath[i] || '–')}</td></tr>`;
  }
  $('#trace').innerHTML = h + '</tbody>';
  renderPreview();
}
let prevLen = 4;
function sampleStrings(maxLen) {
  const out = [''];
  for (let l = 1, lvl = ['']; l <= maxLen; l++) { const nx = []; for (const s of lvl) for (const a of S.nfa.alphabet) nx.push(s + a); out.push(...nx); lvl = nx; }
  return out;
}
function renderQuick() {
  const ys = [], ns = [];
  for (const s of sampleStrings(Math.min(4, 5))) { if (!s) continue; (acceptsNfa(s) ? ys : ns).push(s); if (ys.length >= 4 && ns.length >= 3) break; }
  const pick = (a, c, n) => a.slice(0, n).map(s => `<button type="button" class="${c}" data-q="${esc(s)}">${esc(s)}</button>`).join('');
  $('#quick').innerHTML = `<span>Try:</span>${pick(ys.sort((a, b) => b.length - a.length).slice(0, 4), 'y', 4)}${pick(ns.slice(-3), 'n', 3)}<span>(green accepted, red rejected)</span>`;
}
function renderPreview() {
  const k = S.nfa.alphabet.length;
  let max = 1, total = 1 + k; while (max < 7 && total + Math.pow(k, max + 1) <= 3000) { max++; total += Math.pow(k, max); }
  prevLen = Math.max(1, Math.min(prevLen, max));
  const strs = sampleStrings(prevLen);
  let agree = true; const yes = [];
  for (const s of strs) {
    const a = acceptsNfa(s), p = runDFA(S.res, s), st = S.res.states.find(x => x.id === p[p.length - 1]);
    if (st && st.accept !== a) agree = false;
    if (a) yes.push(s === '' ? 'ε' : s);
  }
  $('#prev').innerHTML = `<div class="card-head"><h2>Language preview</h2></div>` +
    `<label style="font-size:12.5px;color:var(--muted)">All strings up to length <b>${prevLen}</b> <input type="range" id="prevLen" min="1" max="${max}" value="${prevLen}" aria-label="Maximum string length"></label>` +
    `<p class="note">${yes.length} of ${strs.length} strings are accepted.</p>` +
    `<div class="chips" style="margin-top:8px">${yes.slice(0, 60).map(s => `<span class="c y">${esc(s)}</span>`).join('') || '<span class="note">No string up to this length is accepted.</span>'}${yes.length > 60 ? `<span class="note">+${yes.length - 60} more</span>` : ''}</div>` +
    `<p class="agree${agree ? '' : ' no'}">${agree ? `✓ NFA and DFA agree on all ${strs.length} strings` : '✕ NFA and DFA disagree on some string'}</p>`;
}

/* ---------- export ---------- */
async function copyText(text, label) {
  const box = $('#exportBox');
  try { await navigator.clipboard.writeText(text); box.hidden = true; $('#tblNote').textContent = label + ' copied to the clipboard.'; }
  catch (e) { box.hidden = false; box.value = text; box.focus(); box.select(); $('#tblNote').textContent = 'Clipboard is blocked here, so the text is selected below. Press Ctrl/Cmd+C.'; }
}
function dfaExport() {
  const d = buildDfa(S.res, S.res.entries.length, S.showDead), t = {};
  for (const x of d.trans) (t[x.from] = t[x.from] || {})[x.sym] = x.to;
  return { d, t };
}
function copyTable() {
  const { d, t } = dfaExport();
  const lines = ['state\tnfa_set\t' + S.nfa.alphabet.join('\t')];
  for (const s of d.states) lines.push(`${s.id === S.res.start.id ? '->' : ''}${s.accept ? '*' : ''}${s.id}\t${s.label}\t` + S.nfa.alphabet.map(a => (t[s.id] && t[s.id][a]) || '').join('\t'));
  copyText(lines.join('\n'), 'Table');
}
function copyJson() {
  const { d, t } = dfaExport();
  copyText(JSON.stringify({ alphabet: S.nfa.alphabet, states: d.states.map(s => s.id), start: S.res.start.id, accepting: d.states.filter(s => s.accept).map(s => s.id), nfaSets: Object.fromEntries(d.states.map(s => [s.id, s.set])), transitions: t }, null, 2), 'JSON');
}

/* ---------- boot ---------- */
function loadPreset(i) {
  const p = clone(PRESETS[i]);
  S.nfa = { states: p.states, alphabet: p.alphabet, start: p.start, accept: p.accept, delta: p.delta, _ver: (S.nfa ? S.nfa._ver : 0) + 1 };
  S.test.str = p.sample || ''; $('#testStr').value = S.test.str;
  stopTestPlay(); say(EDNOTE); recompute({ editor: true });
}
function syncOpts() {
  $$('.optDead').forEach(c => c.checked = S.showDead);
  $$('.optSets').forEach(c => c.checked = S.showSets);
}
function init() {
  $('#preset').innerHTML = PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
  $('#preset').addEventListener('change', e => loadPreset(+e.target.value));
  $('#btnClear').addEventListener('click', () => {
    S.nfa = { states: ['q0', 'q1'], alphabet: ['a', 'b'], start: 'q0', accept: ['q1'], delta: { q0: {}, q1: {} }, _ver: (S.nfa._ver || 0) + 1 };
    S.test.str = ''; $('#testStr').value = ''; stopTestPlay(); say('Blank NFA. Fill in the transition cells to define moves.'); recompute({ editor: true }); showView('define');
  });
  setupEditor();
  $('#nav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) showView(b.dataset.view); });
  $('#goConvert').addEventListener('click', () => showView('convert'));
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS.includes(v) && v !== S.view) showView(v, true); });
  $('#cvTabs').addEventListener('click', e => { const b = e.target.closest('[data-cv]'); if (b) setCv(b.dataset.cv); });
  $('#bFirst').addEventListener('click', () => { stopPlay(); goto(0); });
  $('#bPrev').addEventListener('click', () => { stopPlay(); goto(S.step - 1); });
  $('#bNext').addEventListener('click', () => { stopPlay(); if (S.cv !== 'dfa') setCv('dfa'); goto(S.step + 1); });
  $('#bLast').addEventListener('click', () => { stopPlay(); goto(S.res.entries.length); });
  $('#bPlay').addEventListener('click', togglePlay);
  $('#speed').addEventListener('input', e => { S.delay = DELAYS[+e.target.value - 1]; if (S.timer) { stopPlay(); S.timer = setInterval(playTick, S.delay); renderControls(); } });
  document.addEventListener('keydown', e => {
    if (S.view !== 'convert' || !/^(BODY|BUTTON)$/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight') { stopPlay(); goto(S.step + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { stopPlay(); goto(S.step - 1); e.preventDefault(); }
  });
  document.addEventListener('change', e => {
    if (e.target.classList.contains('optDead')) { S.showDead = e.target.checked; syncOpts(); renderView(); }
    if (e.target.classList.contains('optSets')) { S.showSets = e.target.checked; syncOpts(); renderView(); }
  });
  document.addEventListener('click', e => {
    if (e.target.closest('.btnLayout')) { resetLayouts(); renderView(); }
    const q = e.target.closest('[data-q]'); if (q) { $('#testStr').value = q.dataset.q; startTest(); }
  });
  const redraw = () => renderView();
  ['svgDefN', 'svgCvN', 'svgCmpN', 'svgTsN'].forEach(id => enableDrag($('#' + id), () => S.posN, redraw));
  ['svgCvD', 'svgCmpD', 'svgTsD'].forEach(id => enableDrag($('#' + id), () => S.posD, redraw));
  ['svgCmpM', 'svgTsM'].forEach(id => enableDrag($('#' + id), () => S.posM, redraw));
  $('#btnCopyTbl').addEventListener('click', copyTable);
  $('#btnCopyJson').addEventListener('click', copyJson);
  $('#btnRun').addEventListener('click', startTest);
  $('#testStr').addEventListener('keydown', e => { if (e.key === 'Enter') startTest(); });
  $('#tPrev').addEventListener('click', () => stepTest(-1));
  $('#tNext').addEventListener('click', () => stepTest(1));
  $('#prev').addEventListener('input', e => { if (e.target.id === 'prevLen') { prevLen = +e.target.value; renderPreview(); const r = $('#prevLen'); r && r.focus(); } });
  $('#btnTheme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('nfa-theme', root.dataset.theme); } catch (e) { }
  });
  try { const t = localStorage.getItem('nfa-theme'); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) { }
  loadPreset(0);
  const h = location.hash.slice(1);
  showView(VIEWS.includes(h) ? h : 'define', true);
}
init();
