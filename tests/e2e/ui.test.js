// End-to-end tests T01-T30: drive the real simulator page in Chromium and record expected vs actual.
// Run: npm run test:e2e   (writes tests/e2e/results.json; exits 1 if any test fails)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const url = 'file://' + path.resolve(__dirname, '../../index.html');
const rows = [];
const rec = (id, feature, input, expected, actual, basis, pass) => { rows.push({ id, feature, input, expected, actual, basis, status: pass ? 'Pass' : 'Fail' }); console.log((pass ? 'PASS ' : 'FAIL ') + id + ' | ' + actual); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', permissions: [] });
  const p = await ctx.newPage();
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(500);

  const loadJson = async def => { await p.click('.nv[data-view=define]'); await p.click('#btnLoadNfa'); await p.fill('#jsonBox', JSON.stringify(def)); await p.click('#btnApplyJson'); await p.waitForTimeout(150); };
  const preset = async i => { await p.selectOption('#preset', String(i)); await p.waitForTimeout(150); };
  const run = async s => {
    await p.click('.nv[data-view=test]'); await p.fill('#testStr', s); await p.click('#btnRun');
    await p.waitForFunction(() => S.test.error || S.test.pos >= S.test.str.length, null, { timeout: 15000 }); await p.waitForTimeout(100);
    return p.evaluate(() => {
      const t = S.test; if (t.error) return { error: t.error, note: document.querySelector('#testNote').textContent };
      const m = S.min ? S.min.states.find(x => x.id === t.mpath[t.mpath.length - 1]) : null;
      return { nfa: t.ok.nfa, dfa: t.ok.dfa, min: m ? m.accept : null, rows: t.sets.length, verdict: document.querySelector('#verdictRow').textContent.trim() };
    });
  };
  const sizes = () => p.evaluate(() => ({ nfa: S.nfa.states.length, dfa: S.res.states.length, min: S.min ? S.min.states.length : null, dead: S.res.states.filter(s => s.dead).length, trunc: S.res.truncated, start: S.res.start.label, startAcc: S.res.start.accept }));
  const ar = r => r.error ? r.error : `NFA ${r.nfa ? 'accept' : 'reject'}, DFA ${r.dfa ? 'accept' : 'reject'}, minimal ${r.min ? 'accept' : 'reject'}`;
  const same = (r, v) => !r.error && r.nfa === v && r.dfa === v && r.min === v;

  // ---------- core logic ----------
  await preset(0);
  let r = await run('bbab'); rec('T01', 'Acceptance, accepted string', 'Ends with "ab"; input bbab', 'Accept on all three machines', ar(r), 'Regex /ab$/', same(r, true));
  r = await run('abba'); rec('T02', 'Acceptance, rejected string', 'Ends with "ab"; input abba', 'Reject on all three machines', ar(r), 'Regex /ab$/', same(r, false));
  r = await run('abc'); rec('T03', 'Unknown symbol in input', 'Ends with "ab"; input abc', 'Validation error, string not run', r.error || ar(r), 'Alphabet is {a, b}', !!r.error && /not in the alphabet/.test(r.error));
  r = await run(''); rec('T04', 'Empty string, start not accepting', 'Ends with "ab"; input ε', 'Reject; trace has only the start row', ar(r) + `; trace rows ${r.rows}`, 'Start state q0 is not accepting', same(r, false) && r.rows === 1);
  await preset(3); r = await run(''); rec('T05', 'Empty string, accepted through ε-move', 'ε-NFA (ab)* or a*; input ε', 'Accept', ar(r), 'ε-closure of q0 contains accepting q1', same(r, true));
  await preset(4); let sz = await sizes(); r = await run('aabcc'); let r2 = await run('ca');
  rec('T06', 'ε-closure chain', 'ε-NFA a*b*c*; start set, then aabcc and ca', 'Start set {q0, q1, q2} accepting; aabcc accept; ca reject', `start ${sz.start} (${sz.startAcc ? 'accepting' : 'not accepting'}); aabcc: ${r.nfa ? 'accept' : 'reject'}; ca: ${r2.nfa ? 'accept' : 'reject'}`, 'Definition of ε-closure', sz.start === '{q0, q1, q2}' && sz.startAcc && same(r, true) && same(r2, false));
  await loadJson({ states: ['q0', 'q1', 'q2'], alphabet: ['a', 'b'], start: 'q0', accept: ['q2'], delta: { q0: { a: ['q1'] }, q1: { b: ['q2'] }, q2: {} } });
  sz = await sizes(); r = await run('ab'); r2 = await run('ba');
  rec('T07', 'Dead state and missing transitions', 'NFA for exactly "ab" with missing moves; ab and ba', 'DFA has 4 states including one dead state; ab accept; ba reject', `DFA ${sz.dfa} states, ${sz.dead} dead; ab: ${r.dfa ? 'accept' : 'reject'}; ba: ${r2.dfa ? 'accept' : 'reject'}`, 'Hand derivation: {q0}, {q1}, {q2}, ∅', sz.dfa === 4 && sz.dead === 1 && same(r, true) && same(r2, false));
  await preset(2); sz = await sizes(); r = await run('10110'); r2 = await run('0010');
  rec('T08', 'Exponential blow-up', '3rd symbol from the end is 1; inputs 10110, 0010', 'DFA 8 states, minimal 8; 10110 accept; 0010 reject', `DFA ${sz.dfa}, minimal ${sz.min}; 10110: ${r.dfa ? 'accept' : 'reject'}; 0010: ${r2.dfa ? 'accept' : 'reject'}`, 'Theory: 2^3 states (Meyer and Fischer, 1971)', sz.dfa === 8 && sz.min === 8 && same(r, true) && same(r2, false));
  await preset(1); sz = await sizes();
  rec('T09', 'Minimisation, pattern matcher', 'Contains "aba"', 'DFA 6 states; minimal 4 states (pattern length + 1)', `DFA ${sz.dfa}, minimal ${sz.min}`, 'Theory (KMP automaton) and reference library', sz.dfa === 6 && sz.min === 4);
  await preset(5); sz = await sizes();
  rec('T10', 'Minimisation merges equivalent states', 'Even number of a, or ends in b', 'DFA 4 states; minimal 3 states', `DFA ${sz.dfa}, minimal ${sz.min}`, 'Reference library (automata-lib 9.2.0)', sz.dfa === 4 && sz.min === 3);
  await loadJson({ states: ['q0'], alphabet: ['a'], start: 'q0', accept: ['q0'], delta: { q0: {} } });
  sz = await sizes(); r = await run(''); r2 = await run('a');
  rec('T11', 'Smallest NFA, one state', 'One accepting state, no moves; inputs ε and a', 'DFA 2 states ({q0} and ∅); ε accept; a reject', `DFA ${sz.dfa} states, ${sz.dead} dead; ε: ${r.dfa ? 'accept' : 'reject'}; a: ${r2.dfa ? 'accept' : 'reject'}`, 'Hand derivation', sz.dfa === 2 && sz.dead === 1 && same(r, true) && same(r2, false));
  await loadJson({ states: ['q0', 'q1'], alphabet: ['a'], start: 'q0', accept: ['q1'], delta: { q0: { 'ε': ['q1'] }, q1: { 'ε': ['q0'] } } });
  sz = await sizes(); r = await run('');
  rec('T12', 'ε-cycle terminates', 'q0 and q1 with ε-moves in both directions', 'No hang; start set {q0, q1}; ε accepted', `start ${sz.start}; ε: ${r.nfa ? 'accept' : 'reject'}`, 'Definition of ε-closure', sz.start === '{q0, q1}' && same(r, true));
  await loadJson({ states: ['q0', 'q1'], alphabet: ['a', 'b'], start: 'q0', accept: [], delta: { q0: { a: ['q1'] }, q1: { b: ['q0'] } } });
  sz = await sizes(); r = await run('abab');
  rec('T13', 'Empty language', 'No accepting states', 'Minimal DFA has 1 state; every string rejected', `DFA ${sz.dfa}, minimal ${sz.min}; abab: ${r.nfa ? 'accept' : 'reject'}`, 'Theory: empty language needs one state', sz.min === 1 && same(r, false));
  const kth = k => { const states = Array.from({ length: k + 1 }, (_, i) => 'q' + i), delta = { q0: { 0: ['q0'], 1: ['q0', 'q1'] } }; for (let i = 1; i < k; i++) delta['q' + i] = { 0: ['q' + (i + 1)], 1: ['q' + (i + 1)] }; delta['q' + k] = {}; return { states, alphabet: ['0', '1'], start: 'q0', accept: ['q' + k], delta }; };
  await loadJson(kth(8)); sz = await sizes();
  rec('T14', 'Size cap, exactly at the limit', '8th symbol from the end is 1 (9 NFA states)', '256 DFA states, not truncated', `DFA ${sz.dfa} states, truncated: ${sz.trunc}`, 'Theory: 2^8 = 256', sz.dfa === 256 && !sz.trunc);
  const t0 = Date.now(); await loadJson(kth(9)); await p.click('.nv[data-view=convert]'); await p.click('#bLast'); sz = await sizes(); const note = await p.textContent('#tblNote');
  rec('T15', 'Size cap, above the limit', '9th symbol from the end is 1 (10 NFA states)', 'Stops at 256 DFA states with a message; minimisation skipped; no freeze', `DFA ${sz.dfa} states, truncated: ${sz.trunc}; minimal ${sz.min === null ? 'skipped' : sz.min}; message: "${note.slice(0, 40)}…"; ${Date.now() - t0} ms including page updates`, 'Theory: 2^9 = 512 > 256', sz.dfa === 256 && sz.trunc && sz.min === null && /Stopped at 256/.test(note));

  // ---------- input validation and editor ----------
  await p.click('#btnClear'); await p.waitForTimeout(150);
  const cell = p.locator('input.cell[data-s="q0"][data-sym="a"]'); await cell.click(); await cell.pressSequentially('q9', { delay: 30 }); await p.waitForTimeout(150);
  let st = await p.evaluate(() => ({ bad: document.querySelector('input.cell[data-s="q0"][data-sym="a"]').classList.contains('bad'), note: document.querySelector('#edNote').textContent, delta: S.nfa.delta.q0.a || null }));
  rec('T16', 'Unknown state in a transition cell', 'Blank NFA; type q9 in cell (q0, a)', 'Cell flagged, message shown, NFA unchanged', `flagged: ${st.bad}; message: "${st.note}"; delta(q0,a) = ${st.delta ? '{' + st.delta + '}' : 'empty'}`, 'q9 is not a state', st.bad && /Unknown state: q9/.test(st.note) && !st.delta);
  await cell.fill(''); await cell.pressSequentially('q0;q1', { delay: 20 }); await p.waitForTimeout(100);
  st = await p.evaluate(() => ({ bad: document.querySelector('input.cell[data-s="q0"][data-sym="a"]').classList.contains('bad'), note: document.querySelector('#edNote').textContent, delta: S.nfa.delta.q0.a || null }));
  rec('T17', 'Malformed definition', 'Cell text q0;q1 (semicolon instead of comma)', 'Treated as one unknown state; cell flagged; NFA unchanged', `flagged: ${st.bad}; message: "${st.note}"`, 'Only commas or spaces separate states', st.bad && /Unknown state: q0;q1/.test(st.note) && !st.delta);
  await cell.fill('');
  const nm = p.locator('input.nm[data-name="q0"]'); await nm.fill('q1'); await nm.press('Tab'); await p.waitForTimeout(150);
  st = await p.evaluate(() => ({ note: document.querySelector('#edNote').textContent, states: S.nfa.states.join(',') }));
  rec('T18', 'Duplicate state name', 'Rename q0 to q1', 'Rejected with message; names unchanged', `message: "${st.note}"; states ${st.states}`, 'State names must be unique', /already exists/.test(st.note) && st.states === 'q0,q1');
  const nm2 = p.locator('input.nm[data-name="q0"]'); await nm2.fill('a b'); await nm2.press('Tab'); await p.waitForTimeout(150);
  st = await p.evaluate(() => ({ note: document.querySelector('#edNote').textContent, states: S.nfa.states.join(',') }));
  rec('T19', 'Invalid state name', 'Rename q0 to "a b" (contains a space)', 'Rejected with message; name unchanged', `message: "${st.note.slice(0, 60)}…"; states ${st.states}`, 'Names have no spaces, commas or braces', /State names need/.test(st.note) && st.states === 'q0,q1');
  await p.fill('#newSym', 'a'); await p.click('#btnAddSym'); let n1 = await p.textContent('#edNote');
  await p.fill('#newSym', 'ε'); await p.click('#btnAddSym'); let n2 = await p.textContent('#edNote'); const al = await p.evaluate(() => S.nfa.alphabet.join(','));
  rec('T20', 'Invalid alphabet symbols', 'Add a (duplicate), then ε (reserved)', 'Both rejected; alphabet unchanged', `messages: "${n1}" / "${n2}"; alphabet ${al}`, 'ε is reserved; symbols are unique', /already in the alphabet/.test(n1) && /not already used/.test(n2) && al === 'a,b');
  await preset(0); await p.click('[data-del="q1"]'); await p.waitForTimeout(150);
  st = await p.evaluate(() => ({ states: S.nfa.states.join(','), refs: JSON.stringify(S.nfa.delta).includes('q1') }));
  rec('T21', 'Delete state', 'Ends with "ab"; delete q1', 'q1 removed with every transition into or out of it', `states ${st.states}; any reference to q1 left: ${st.refs}`, 'Referential integrity', st.states === 'q0,q2' && !st.refs);
  await p.click('#btnLoadNfa'); await p.fill('#jsonBox', '{bad'); await p.click('#btnApplyJson'); let m1 = await p.textContent('#edNote');
  await p.fill('#jsonBox', JSON.stringify({ states: ['x'], alphabet: ['a'], start: 'nope', accept: [], delta: {} })); await p.click('#btnApplyJson'); let m2 = await p.textContent('#edNote');
  await p.fill('#jsonBox', JSON.stringify({ states: ['s', 't'], alphabet: ['0', '1'], start: 's', accept: ['t'], delta: { s: { 0: ['s'], 1: ['s', 't'] }, t: {} } })); await p.click('#btnApplyJson'); await p.waitForTimeout(150);
  const loaded = await p.evaluate(() => S.nfa.states.join(','));
  rec('T22', 'JSON import', 'Invalid text; start state not in states; then a valid NFA', 'First two rejected with a message; valid one loaded', `invalid: "${m1.slice(0, 32)}…"; bad start: "${m2.slice(0, 32)}…"; valid loaded states ${loaded}`, 'Schema: states, alphabet, start, accept, delta', /not a valid NFA/.test(m1) && /not a valid NFA/.test(m2) && loaded === 's,t');

  // ---------- screens and controls ----------
  await preset(1); await p.click('.nv[data-view=convert]'); await p.waitForTimeout(200);
  const N = await p.evaluate(() => S.res.entries.length);
  await p.click('#bNext'); await p.click('#bNext'); await p.click('#bNext'); let s3 = await p.evaluate(() => S.step); await p.click('#bPrev'); let s2 = await p.evaluate(() => S.step);
  const logRows = await p.$$eval('#log .lg', l => l.length); await p.click('#bFirst'); let s0 = await p.evaluate(() => S.step); await p.click('#bLast'); let sN = await p.evaluate(() => S.step);
  await p.click('#bFirst'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); let sk = await p.evaluate(() => S.step);
  rec('T23', 'Conversion replay controls', `Contains "aba" (${N} steps); next ×3, back, first, last, ArrowRight ×2`, 'Steps 3, 2, 0, end, then 2 by keyboard; log has one row per step', `steps ${s3}, ${s2}, ${s0}, ${sN}/${N}, keyboard ${sk}; log rows after back: ${logRows}`, 'Specification FR4', s3 === 3 && s2 === 2 && s0 === 0 && sN === N && sk === 2 && logRows === 2);
  await p.click('#bFirst'); await p.fill('#speed', '5'); await p.dispatchEvent('#speed', 'input'); await p.click('#bPlay'); await p.waitForFunction(() => S.step === S.res.entries.length, null, { timeout: 20000 });
  const dn = await p.evaluate(() => document.querySelectorAll('#svgCvD .node').length), tr = await p.evaluate(() => S.res.states.length);
  rec('T24', 'Play to the end', 'Contains "aba"; speed fastest; press Play', 'Runs to the last step and draws every DFA state', `step ${N}/${N}; ${dn} of ${tr} DFA states drawn`, 'Specification FR3, FR4', dn === tr);
  await p.click('.nv[data-view=compare]'); await p.waitForTimeout(250);
  const cn = await p.evaluate(() => [document.querySelectorAll('#svgCmpN .node').length, document.querySelectorAll('#svgCmpD .node').length, document.querySelectorAll('#svgCmpM .node').length]);
  rec('T25', 'Compare screen shows all three machines', 'Contains "aba"', 'Diagrams with 4 (NFA), 6 (DFA) and 4 (minimal) states', `${cn[0]}, ${cn[1]}, ${cn[2]} states drawn`, 'Specification FR5, FR6', cn.join() === '4,6,4');
  await p.click('.nv[data-view=convert]'); await p.click('#cvTabs [data-cv=nfa]'); await p.waitForTimeout(150);
  const vis = await p.evaluate(() => ({ n: !document.querySelector('#paneCvN').hidden, d: !document.querySelector('#paneCvD').hidden }));
  rec('T26', 'Switch between DFA and source NFA', 'Convert screen, NFA tab', 'NFA pane visible, DFA pane hidden', `NFA pane visible: ${vis.n}; DFA pane visible: ${vis.d}`, 'Regression: hidden-SVG bug fixed', vis.n && !vis.d);
  await p.click('.nv[data-view=test]'); await p.waitForTimeout(150);
  const agree = await p.evaluate(() => document.querySelector('#prev .agree').textContent);
  rec('T27', 'Exhaustive agreement check in the UI', 'Contains "aba"; strings up to length 4', 'NFA and DFA agree on all 31 strings', agree.trim(), 'Specification FR9', /agree on all 31 strings/.test(agree));
  const dark0 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); await p.click('#btnTheme'); await p.waitForTimeout(150);
  const dark1 = await p.evaluate(() => ({ t: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor }));
  rec('T28', 'Theme toggle', 'Press the theme button', 'Page background changes between light and dark', `background ${dark0} → ${dark1.bg} (data-theme=${dark1.t})`, 'Non-functional requirement', dark0 !== dark1.bg);
  await p.click('#btnTheme');
  await p.click('.nv[data-view=convert]'); await p.click('#btnCopyTbl'); await p.waitForTimeout(250);
  const ex = await p.evaluate(() => ({ note: document.querySelector('#tblNote').textContent, box: document.querySelector('#exportBox').hidden ? '' : document.querySelector('#exportBox').value.split('\n')[0] }));
  rec('T29', 'Export DFA table', 'Press Copy table', 'Table text reaches the clipboard, or is shown selected if the clipboard is blocked', ex.box ? `clipboard blocked; fallback text starts "${ex.box.replace(/\t/g, ' | ')}"` : ex.note, 'Specification FR10', !!ex.box || /copied/.test(ex.note));

  // ---------- responsive ----------
  const mctx = await b.newContext({ viewport: { width: 390, height: 800 } }); const mp = await mctx.newPage(); await mp.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const ov = [];
  for (const v of ['define', 'convert', 'compare', 'test']) { await mp.goto(url + '#' + v); await mp.waitForTimeout(450); ov.push(await mp.evaluate(() => document.documentElement.scrollWidth - innerWidth)); }
  rec('T30', 'Phone-width layout', '390 px wide; all four screens', 'No horizontal scrolling of the page', `overflow in px per screen: ${ov.join(', ')}`, 'Non-functional requirement', ov.every(x => x <= 1));

  console.log('page errors:', errs.length ? errs : 'none');
  fs.writeFileSync(path.resolve(__dirname, 'results.json'), JSON.stringify({ rows, pageErrors: errs }, null, 1));
  const passed = rows.filter(x => x.status === 'Pass').length;
  console.log(`${passed}/${rows.length} passed`);
  if (passed !== rows.length || errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error('HARNESS ERROR', e.message); process.exit(1); });
