'use strict';
/* Graph layout and SVG rendering, dragging. */
/* ---------- layout + graph rendering ---------- */
const R = 24;
function layout(ids, edges, startId) {
  const adj = new Map(ids.map(i => [i, []]));
  for (const e of edges) if (adj.has(e.from)) adj.get(e.from).push(e.to);
  const layer = new Map([[startId, 0]]), q = [startId];
  while (q.length) { const u = q.shift(); for (const v of adj.get(u) || []) if (!layer.has(v)) { layer.set(v, layer.get(u) + 1); q.push(v); } }
  let mx = Math.max(0, ...layer.values());
  const loose = ids.filter(i => !layer.has(i));
  if (loose.length) { mx++; loose.forEach(i => layer.set(i, mx)); }
  const cols = new Map();
  for (const id of ids) { const l = layer.get(id); if (!cols.has(l)) cols.set(l, []); cols.get(l).push(id); }
  const pos = {};
  for (const [l, list] of cols) list.forEach((id, i) => { pos[id] = { x: l * 165, y: (i - (list.length - 1) / 2) * 120 }; });
  const ys = Object.values(pos).map(p => p.y), minY = Math.min(...ys);
  for (const id in pos) { pos[id].x += 90; pos[id].y += -minY + 90; }
  return pos;
}

function mergeEdges(list) {
  const m = new Map();
  for (const e of list) {
    const k = e.from + '\u0001' + e.to;
    if (!m.has(k)) m.set(k, { from: e.from, to: e.to, syms: [] });
    if (!m.get(k).syms.includes(e.sym)) m.get(k).syms.push(e.sym);
  }
  return [...m.values()].map(e => ({ from: e.from, to: e.to, label: e.syms.join(','), eps: e.syms.length === 1 && e.syms[0] === EPS }));
}

const _seen = new WeakMap();
function renderGraph(svg, g, posMap, opts = {}) {
  const { active = new Set(), current = null, hotEdge = null, emptyText = '' } = opts;
  const prev = _seen.get(svg) || { n: new Set(), e: new Set() };
  const nowN = new Set(), nowE = new Set();
  const nodes = g.nodes;
  if (!nodes.length) {
    svg.setAttribute('viewBox', '0 0 520 260');
    svg.innerHTML = `<text class="empty" x="260" y="135" text-anchor="middle">${esc(emptyText)}</text>`;
    _seen.set(svg, { n: nowN, e: nowE });
    return;
  }
  const P = id => posMap[id] || { x: 0, y: 0 };
  const uid = 'm' + (svg.id || 'g');
  let edgesHtml = '', labelsHtml = '';
  const ext = [];
  const keys = new Set(g.edges.map(e => e.from + '>' + e.to));
  for (const e of g.edges) {
    const a = P(e.from), b = P(e.to);
    const ek = e.from + '>' + e.to; nowE.add(ek);
    const cls = 'edge' + (prev.e.has(ek) ? '' : ' enter') + (e.eps ? ' eps' : '') + (hotEdge === ek ? ' hot' : '');
    let d, lx, ly;
    if (e.from === e.to) {
      d = `M${a.x - R * .62} ${a.y - R * .8} C${a.x - 38} ${a.y - R - 46} ${a.x + 38} ${a.y - R - 46} ${a.x + R * .62} ${a.y - R * .8 - 3}`;
      lx = a.x; ly = a.y - R - 38;
    } else {
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
      const rev = keys.has(e.to + '>' + e.from), back = b.x <= a.x + 1 && Math.abs(dy) < 1;
      const c = rev ? 36 : back ? Math.max(46, L * 0.3) : (Math.abs(dy) > 1 && Math.abs(dx) > 1 && L > 260 ? 20 : 0);
      const mx = (a.x + b.x) / 2 + nx * c * 2, my = (a.y + b.y) / 2 + ny * c * 2;
      const da = Math.hypot(mx - a.x, my - a.y) || 1, db = Math.hypot(mx - b.x, my - b.y) || 1;
      const sx = a.x + (mx - a.x) / da * R, sy = a.y + (my - a.y) / da * R;
      const ex = b.x + (mx - b.x) / db * (R + 3), ey = b.y + (my - b.y) / db * (R + 3);
      d = `M${sx} ${sy} Q${mx} ${my} ${ex} ${ey}`;
      const px = .25 * sx + .5 * mx + .25 * ex, py = .25 * sy + .5 * my + .25 * ey;
      const side = c ? 1 : -1;
      lx = px + nx * side * 12; ly = py + ny * side * 12 + 4;
    }
    ext.push([lx, ly]);
    edgesHtml += `<g class="${cls}"><path class="p" pathLength="1" d="${d}" marker-end="url(#${uid})"/></g>`;
    labelsHtml += `<g class="${cls}"><text x="${lx}" y="${ly}">${esc(e.label)}</text></g>`;
  }
  let nodesHtml = '';
  for (const n of nodes) {
    const p = P(n.id); nowN.add(n.id);
    const cls = 'node' + (prev.n.has(n.id) ? '' : ' enter') + (active.has(n.id) ? ' active' : '') + (current === n.id ? ' current' : '') + (n.dead ? ' dead' : '');
    const small = n.label.length > 2;
    nodesHtml += `<g class="${cls}" data-id="${esc(n.id)}" transform="translate(${p.x} ${p.y})"><g class="body">` +
      (active.has(n.id) || current === n.id ? `<circle class="ring" r="${R}"/>` : '') +
      (n.start ? `<path class="startarrow" d="M${-R - 40} 0 H${-R - 3}" marker-end="url(#${uid})"/>` : '') +
      `<circle class="main" r="${R}"/>` + (n.accept ? `<circle class="inner" r="${R - 5}"/>` : '') +
      `<text class="lbl"${small ? ' style="font-size:12px"' : ''}>${esc(n.label)}</text>` +
      (n.sub ? `<text class="set" y="${R + 15}">${esc(n.sub)}</text>` : '') + `</g></g>`;
  }
  const xs = nodes.map(n => P(n.id).x), ys = nodes.map(n => P(n.id).y);
  let x0 = Math.min(...xs) - 85, x1 = Math.max(...xs) + 55, y0 = Math.min(...ys) - 90, y1 = Math.max(...ys) + 62;
  if (svg._lock) { const o = svg._vb; x0 = Math.min(x0, o[0]); y0 = Math.min(y0, o[1]); x1 = Math.max(x1, o[0] + o[2]); y1 = Math.max(y1, o[1] + o[3]); }
  for (const [ex, ey] of ext) { x0 = Math.min(x0, ex - 30); x1 = Math.max(x1, ex + 30); y0 = Math.min(y0, ey - 22); y1 = Math.max(y1, ey + 14); }
  let w = x1 - x0, h = y1 - y0;
  if (w < 440) { x0 -= (440 - w) / 2; w = 440; }
  if (h < 210) { y0 -= (210 - h) / 2; h = 210; }
  svg._vb = [x0, y0, w, h];
  svg.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
  svg.style.minWidth = opts.scroll ? Math.min(w * .6, 900) + 'px' : '';
  svg.innerHTML = `<defs><marker id="${uid}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="var(--edge)"/></marker></defs>` +
    edgesHtml + nodesHtml + labelsHtml;
  _seen.set(svg, { n: nowN, e: nowE });
}

/* drag support: svg -> { posMap getter, redraw } */
function enableDrag(svg, getPos, redraw) {
  let drag = null;
  svg.addEventListener('pointerdown', ev => {
    const g = ev.target.closest('.node'); if (!g) return;
    const id = g.dataset.id, pos = getPos(); if (!pos[id]) return;
    const m = svg.getScreenCTM().inverse(), pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const q = pt.matrixTransform(m);
    drag = { id, dx: pos[id].x - q.x, dy: pos[id].y - q.y };
    svg._lock = true; svg.setPointerCapture(ev.pointerId); ev.preventDefault();
  });
  svg.addEventListener('pointermove', ev => {
    if (!drag) return;
    const m = svg.getScreenCTM().inverse(), pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const q = pt.matrixTransform(m), pos = getPos();
    pos[drag.id] = { x: q.x + drag.dx, y: q.y + drag.dy };
    redraw();
  });
  const end = () => { if (drag) { drag = null; svg._lock = false; redraw(); } };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}

