<!DOCTYPE html>

<html lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width,initial-scale=1.0" name="viewport"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }
  </style>
</head>
<body>
<!-- STITCH_THREEJS_START:ANIMATION_32 class="fixed inset-0 w-full h-full bg-transparent" -->
<div class="fixed inset-0 w-full h-full bg-transparent" style="display:block;">
<script src="https://ajax.googleapis.com/ajax/libs/threejs/r125/three.min.js"></script>
<div id="threejs-container-ANIMATION_32" style="width:100%;height:100%"></div>
<script>
(function() {
  const container = document.getElementById('threejs-container-ANIMATION_32');
  const devicePixelRatio = window.devicePixelRatio || 1;
  (async () => {
// ==========================================================================
// FAMILY ARCHIVE — js/app.js
// Родословная Новиковых из д. Чикаши
// ==========================================================================

// Load the published JSON before attaching the interface controls.
const loadJSON = async path => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
};
const [initialData, initialViews] = await Promise.all([
  loadJSON('data/tree-data.json?v=2.10.30'),
  loadJSON('data/tree-views.json?v=2.10.30')
]);

const stage = document.getElementById('stage'), panel = document.getElementById('panel');
const mobile = matchMedia('(max-width:760px)');
const stageActions = document.getElementById('stageActions');
const overviewLayer = document.getElementById('overviewLabels');
const zoomMenu = document.getElementById('zoomMenu');
const branchDialog = document.getElementById('branchDialog');
const branchList = document.getElementById('branchList');
const allButton = document.getElementById('allg');
const expandBranches = document.getElementById('expandBranches');
const collapseBranches = document.getElementById('collapseBranches');
const clanDialog = document.getElementById('clanDialog');
const clanList = document.getElementById('clanList');
// The controls share the stage's size but sit outside its gesture surface.
stage.append(overviewLayer, stageActions);
let svg = null, D = null, W = 1, H = 1;
const st = {s: 1, x: 0, y: 0};
let movT = null;
const OVERVIEW_SCALE = 0.55, BLEND_START = 0.63, BLEND_END = 0.47;
const inOverview = () => st.s <= OVERVIEW_SCALE;
const overviewScale = () => st.s / OVERVIEW_SCALE;
const FARZ = 0.85;                       // ниже порога видны имя, фамилия и годы
let isFar = null;
const apply = () => { if (!svg) return; svg.style.transform = `translate(${st.x}px,${st.y}px) scale(${st.s})`;
  const f = st.s < FARZ; if (f !== isFar) { isFar = f; svg.classList.toggle('far', f); }
  const mix = Math.max(0, Math.min(1, (BLEND_START - st.s) / (BLEND_START - BLEND_END)));
  const opacity = mix * mix * (3 - 2 * mix);
  const overview = inOverview();
  svg.style.opacity = 1 - opacity;
  svg.classList.toggle('overview', overview);
  svg.setAttribute('aria-hidden', overview);
  overviewLayer.hidden = false;
  overviewLayer.inert = !overview;
  overviewLayer.style.opacity = opacity;
  if (mix > 0) paintMacro();
  mmView();
};
// ускорение (готовый «снимок» схемы) — только при перетаскивании
const panning = () => { if (!svg) return; svg.classList.add('moving'); clearTimeout(movT); movT = setTimeout(() => svg.classList.remove('moving'), 250); };
const clampS = s => Math.max(0.001, Math.min(4, s));
function zoomAt(f, cx, cy) {
  stopMacroZoom();
  if (svg) { clearTimeout(movT); svg.classList.remove('moving'); }
  const next = clampS(st.s * f);
  if (next < BLEND_START) {
    ensureOverview();
    if (next <= macroFit().scale * OVERVIEW_SCALE) { fitAll(); return; }
  }
  macroFitted = false;
  const enter = st.s >= BLEND_START && next < BLEND_START;
  const leave = st.s <= BLEND_END && next > BLEND_END;
  const from = enter ? nearestMacro(cx, cy, true) : leave ? nearestMacro(cx, cy) : null;
  const ratio = next / st.s;
  st.x = cx - (cx - st.x) * ratio;
  st.y = cy - (cy - st.y) * ratio;
  if (macroOffset) {
    macroOffset.x = cx - (cx - macroOffset.x) * ratio;
    macroOffset.y = cy - (cy - macroOffset.y) * ratio;
  }
  st.s = next;
  if (from && enter) {
    alignMacro(from, st.x + from.target.x * next, st.y + from.target.y * next);
  }
  if (from && leave) {
    const pt = macroPoint(from);
    st.x = pt.x - from.target.x * next;
    st.y = pt.y - from.target.y * next;
  }
  apply();
}
function fitBox(x, y, w, h, pad = 40) {
  const r = stage.getBoundingClientRect();
  const s = clampS(Math.min((r.width - 2 * pad) / w, (r.height - 2 * pad) / h, 1.6));
  if (s < BLEND_START) { fitAll(); return; }
  stopMacroZoom();
  macroFitted = false;
  st.s = s; st.x = (r.width - w * s) / 2 - x * s; st.y = (r.height - h * s) / 2 - y * s; apply();
}
const fitAll = () => {
  stopMacroZoom();
  ensureOverview();
  macroFitted = true;
  st.s = macroFit().scale * OVERVIEW_SCALE;
  apply();
};
const norm = t => (t || '').toLowerCase().replace(/ё/g, 'е');
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const linkify = t => esc(t).replace(/https?:\/\/[^\s)»,;]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
const pName = id => D.people[id] ? D.people[id].name : id;
const pDates = id => { const l = D.people[id].lines; return l.find(t => /\d{4}|^~/.test(t)) || ''; };

/* --- перетаскивание и масштаб --- */
const ptrs = new Map(); let moved = 0, last = null, pinch = null, lastTap = {t: 0, x: 0, y: 0}, tapTimer = null;
function tapAction(x, y) {
  const hit = document.elementFromPoint(x, y);
  const chip = hit && hit.closest ? hit.closest('.chip') : null;
  if (chip) { clanOff(); if (chip.dataset.b != null) toggleBranch(+chip.dataset.b); else toggleGroup(+chip.dataset.g); return; } 
  const el = hit && hit.closest ? hit.closest('.person') : null;
  if (el) select(el.dataset.p); else clearSel();
}
{ 
  const mm = document.getElementById('mm'); let dn = false;
  mm.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); dn = true; mm.setPointerCapture(e.pointerId); mmGo(e); });
  mm.addEventListener('pointermove', e => { if (dn) { e.stopPropagation(); mmGo(e); } });
  mm.addEventListener('pointerup', e => { e.stopPropagation(); dn = false; });
}
stage.addEventListener('pointerdown', e => {
  if (stageActions.contains(e.target)) return;
  stopMacroZoom();
  zoomMenu.open = false;
  if (!e.target.closest('.overview-label')) {
    e.preventDefault(); var _s=window.getSelection&&window.getSelection(); if(_s) _s.removeAllRanges();
    stage.setPointerCapture(e.pointerId);
  }
  ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY}); moved = 0;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = {d: Math.hypot(a.x - b.x, a.y - b.y)}; }
  last = {x: e.clientX, y: e.clientY}; stage.classList.add('drag');
});
stage.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
  const r = stage.getBoundingClientRect();
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt(d / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch.d = d; moved += 10; return;
  }
  const dx = e.clientX - last.x, dy = e.clientY - last.y; moved += Math.abs(dx) + Math.abs(dy);
  if (inOverview() && macroOffset) {
    if (moved >= 6) {
      if (!stage.hasPointerCapture(e.pointerId)) stage.setPointerCapture(e.pointerId);
      if (!macroFitted) {
        macroOffset.x += dx; macroOffset.y += dy;
        st.x += dx; st.y += dy;
        apply();
      }
    }
    last = {x: e.clientX, y: e.clientY};
    return;
  }
  if (st.s < BLEND_START && macroOffset) {
    macroOffset.x += dx; macroOffset.y += dy;
  }
  st.x += dx; st.y += dy; last = {x: e.clientX, y: e.clientY}; panning(); apply();
});
const up = e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; stage.classList.remove('drag');
  if (inOverview()) {
    if (e.type === 'pointerup' && moved < 6 && overviewScale() < 0.28 &&
        !e.target.closest('.overview-label')) {
      const rect = stage.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const node = nearestMacro(x, y);
      if (node) {
        const point = macroPoint(node);
        if (Math.hypot(point.x - x, point.y - y) < 18) zoomToMacro(node);
      }
    }
    if (ptrs.size === 1) last = [...ptrs.values()][0];
    return;
  }
  if (e.type === 'pointerup' && moved < 6 && ptrs.size === 0) {
    const now = Date.now(), r0 = stage.getBoundingClientRect();
    if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      clearTimeout(tapTimer); lastTap.t = 0;
      animView(() => zoomAt(1.8, e.clientX - r0.left, e.clientY - r0.top));
      return;
    }
    lastTap = {t: now, x: e.clientX, y: e.clientY};
    const cx_ = e.clientX, cy_ = e.clientY;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => tapAction(cx_, cy_), e.pointerType === 'mouse' ? 0 : 260);
    return;
  }
  if (ptrs.size === 1) last = [...ptrs.values()][0];
};
stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
stage.addEventListener('wheel', e => { 
  if (stageActions.contains(e.target)) return; 
  e.preventDefault(); 
  const r = stage.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); 
}, {passive: false});
const center = () => { const r = stage.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
zoomMenu.addEventListener('click', e => {
  const button = e.target.closest('[data-zoom]');
  if (!button) return;
  if (button.dataset.zoom === 'fit') {
    clearSel();
    animView(fitAll);
    zoomMenu.open = false;
    zoomMenu.querySelector('summary').focus();
    return;
  }
  const step = button.dataset.zoom === 'in' ? 1.25 : 1 / 1.25;
  zoomAt(step, ...center());
});
function renderBranchList() {
  branchList.innerHTML = branchControls(VIEW).map(({group, index, title, count, open, color}) => {
    const detail = open
      ? '<span class="branch-state">Развёрнута</span> · Свернуть ветвь'
      : `Раскрыть ветвь · ${count} ${ppl(count)}`;
    return `<button type="button" data-${group ? 'g' : 'b'}="${index}" aria-expanded="${Boolean(open)}"><i style="--branch-color:${color}" aria-hidden="true"></i><span>${esc(title)}<small>${detail}</small></span><b aria-hidden="true">${open ? '−' : '+'}</b></button>`;
  }).join('');
}
document.getElementById('branchToggle').onclick = () => {
  zoomMenu.open = false;
  renderBranchList();
  branchDialog.showModal();
};
branchList.addEventListener('click', e => {
  const button = e.target.closest('button[data-g], button[data-b]');
  if (!button) return;
  const scrollTop = branchDialog.scrollTop;
  const group = button.dataset.g != null;
  const index = +(group ? button.dataset.g : button.dataset.b);
  const anchor = group ? VIEWS.groups[index][1] || 'I35' : VIEWS.branches[index][0];
  clearSel();
  if (group) toggleGroup(index);
  else toggleBranch(index);
  renderBranchList();
  branchList.querySelector(`[data-${group ? 'g' : 'b'}="${index}"]`)?.focus({preventScroll: true});
  branchDialog.scrollTop = scrollTop;
  const [x, y] = VIEW.cards[anchor];
  const [cx, cy] = center();
  animView(() => { st.x = cx - (x + CW / 2) * st.s; st.y = cy - (y + CH / 2) * st.s; apply(); });
});
mobile.addEventListener('change', e => {
  if (e.matches) return;
  setReading(false);
  zoomMenu.open = false;
  if (branchDialog.open) branchDialog.close();
  if (clanDialog.open) clanDialog.close();
});
function setAllBranches(expand) {
  if (branchDialog.open) branchDialog.close();
  clearSel();
  renderView(expand ? ALLG() : 0, expand ? ALLB() : 0);
  setTimeout(() => animView(fitAll), 50);
}
const allBranchesOpen = () => MASK === ALLG() && BMASK === ALLB();
allButton.onclick = () => setAllBranches(!allBranchesOpen());
expandBranches.onclick = () => setAllBranches(true);
collapseBranches.onclick = () => setAllBranches(false);
addEventListener('keydown', e => {
  if (e.key !== 'Escape' || branchDialog.open || clanDialog.open) return;
  if (lb.classList.contains('open')) lb.classList.remove('open', 'img');
  else if (panel.classList.contains('reading')) setReading(false, true);
  else if (zoomMenu.open) { zoomMenu.open = false; zoomMenu.querySelector('summary').focus(); }
  else clearSel();
});

/* --- выделение родни --- */
function relatives(id) {
  const anc = new Set(), desc = new Set();
  const goUp = p => ((D.people[p]||{}).par || []).forEach(q => { if (!anc.has(q)) { anc.add(q); goUp(q); } });
  const goDn = p => ((D.people[p]||{}).kids || []).forEach(k => { if (!desc.has(k)) { desc.add(k); goDn(k); } });
  goUp(id); goDn(id);
  const on = new Set([id, ...anc, ...desc, ...(D.people[id].sp || []), ...otherParentsOf(id)]);
  return {on, anc, desc};
}
function bboxOf(ids) {
  let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  ids.forEach(id => { const g = svg.querySelector(`.person[data-p="${id}"]`); if (!g) return; const b = g.getBBox();
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height); });
  return [x1, y1, x2 - x1, y2 - y1];
}

/* ===== Режим «фокус» — раскладка вокруг выбранного человека ===== */
const CW = 126, CH = 86, IG = 6, PADF = 8, FG = 28, ROWH = CH + 120, AGAP = 28;
const SVGNS = 'http://www.w3.org/2000/svg';
let famsOf = {}, parentFam = {}, fullL = null, focL = null, focusId = null, curPos = {};

function initFocus() {
  famsOf = {}; parentFam = {};
  Object.entries(D.fams).forEach(([f, o]) => {
    [o.h, o.w].forEach(q => { if (q) (famsOf[q] = famsOf[q] || []).push(f); });
    o.ks.forEach(k => { parentFam[k] = f; });
  });
  focL = document.createElementNS(SVGNS, 'g'); focL.id = 'focL';
  svg.appendChild(focL);
  svg.style.overflow = 'visible';
}
const yr = p => D.people[p].card.yr;
const isM = p => D.people[p].sex === 'M';
const first = p => { const g = D.people[p].given || ''; return g.startsWith('Мать ') ? 'первая жена' : (g.replace(/[()]/g, '').split(' ')[0] || '?'); };
const famsSorted = p => (famsOf[p] || []).slice().sort((a, b) => D.fams[a].m - D.fams[b].m);
const otherParentIn = (f, p) => D.fams[f].h === p ? D.fams[f].w : D.fams[f].h;
const otherParentsOf = p => [...new Set((famsOf[p] || [])
  .filter(f => D.fams[f].unmarried).map(f => otherParentIn(f, p)).filter(Boolean))];

/* --- потомки: дерево по ширинам поддеревьев --- */
function unitOf(p) {
  const fs = famsSorted(p), sp = fs.map(f => otherParentIn(f, p));
  let m;
  if (!fs.length) m = [p];
  else if (fs.length === 1) m = sp[0] ? (isM(p) ? [p, sp[0]] : [sp[0], p]) : [p];
  else { m = []; if (sp[0]) m.push(sp[0]); m.push(p); sp.slice(1).forEach(s => s && m.push(s)); }
  return {p, m, fs};
}
function mergeCont(A, B, off) {
  const out = A.map(v => v.slice());
  B.forEach(([l, r], k) => { const L_ = l + off, R_ = r + off;
    if (!out[k]) out[k] = [L_, R_]; else out[k] = [Math.min(out[k][0], L_), Math.max(out[k][1], R_)]; });
  return out;
}
function sepCont(A, B, g0, g) {
  let d = -1e9;
  for (let k = 0; k < Math.min(A.length, B.length); k++) if (A[k] && B[k]) d = Math.max(d, A[k][1] - B[k][0] + (k ? g : g0));
  return d;
}
function measure(p, depth) {
  const u = unitOf(p);
  u.uw = u.m.length * CW + (u.m.length - 1) * IG;
  u.blocks = [];
  if (depth < 12) u.fs.forEach(f => {
    const ks = D.fams[f].ks.slice().sort((a, b) => yr(a) - yr(b));
    if (!ks.length) return;
    const kids = ks.map(k => measure(k, depth + 1));
    const STEP = (CW + IG) / 2;
    if (kids.length >= 3 && kids.every(k => k.m.length === 1 && !k.blocks.length)) {
      kids.forEach((k, i) => { k.off = i * STEP; k.lvl = i % 2; });
      const w = (kids.length - 1) * STEP + CW;
      u.blocks.push({f, kids, cont: [[-PADF, w + PADF]], chk: true});
      return;
    }
    let cont = null;
    kids.forEach(k => {
      if (!cont) { k.off = 0; cont = k.cont.map(v => v.slice()); return; }
      k.off = sepCont(cont, k.cont, IG, AGAP);
      cont = mergeCont(cont, k.cont, k.off);
    });
    cont[0] = [cont[0][0] - PADF, cont[0][1] + PADF];
    u.blocks.push({f, kids, cont});
  });
  let kc = null;
  u.blocks.forEach(b => {
    if (!kc) { b.off = 0; kc = b.cont.map(v => v.slice()); return; }
    b.off = sepCont(kc, b.cont, FG - 2 * PADF, AGAP);
    kc = mergeCont(kc, b.cont, b.off);
  });
  u.cont = [[0, u.uw]];
  if (kc) {
    u.koff = u.uw / 2 - (kc[0][0] + kc[0][1]) / 2;
    kc.forEach(([l, r], k) => { u.cont[k + 1] = [l + u.koff, r + u.koff]; });
  }
  return u;
}
function placeDesc(u, left, row, L) {
  let x = left;
  u.m.forEach(q => { L.pos[q] = {x, row, lvl: u.lvl || 0}; x += CW + IG; });
  if (u.m.length > 1) u.m.forEach(q => { if (q !== u.p) L.spouseOf[q] = u.p; });
  u.blocks.forEach(b => {
    b.kids.forEach(k => placeDesc(k, left + u.koff + b.off + k.off, row + 1, L));
    L.frames.push({f: b.f, members: b.kids.flatMap(k => k.m), row: row + 1});
    L.fams.add(b.f);
  });
}

/* --- предки: родословная вверх --- */
function ancFam(f, depth) {
  const o = D.fams[f], par = [o.h, o.w].filter(Boolean);
  if (!par.length || depth > 14) return {cards: [], cont: []};
  const sub = par.map(q => anc(q, depth + 1));
  let off;
  if (sub.length === 2) {
    let d = CW + IG;
    const n = Math.min(sub[0].cont.length, sub[1].cont.length);
    for (let k = 1; k < n; k++) d = Math.max(d, sub[0].cont[k][1] - sub[1].cont[k][0] + AGAP);
    off = [-d / 2, d / 2];
  } else off = [0];
  const cards = [], cont = [[0, CW]];
  sub.forEach((t, i) => {
    t.cards.forEach(([id, x, dd]) => cards.push([id, x + off[i], dd + 1]));
    t.cont.forEach(([l, r], k) => {
      const kk = k + 1; const L_ = l + off[i], R_ = r + off[i];
      if (!cont[kk]) cont[kk] = [L_, R_]; else cont[kk] = [Math.min(cont[kk][0], L_), Math.max(cont[kk][1], R_)];
    });
  });
  return {cards, cont};
}
function anc(p, depth) {
  const f = parentFam[p];
  const up = f ? ancFam(f, depth) : {cards: [], cont: []};
  const cont = [[0, CW]].concat(up.cont.slice(1));
  return {cards: [[p, 0, 0]].concat(up.cards), cont};
}

/* --- полная раскладка фокуса --- */
function focusLayout(id) {
  const L = {pos: {}, frames: [], fams: new Set(), spouseOf: {}, blood: new Set([id])};
  const root = measure(id, 0);
  placeDesc(root, 0, 0, L);
  const goDn = p => (D.people[p].kids || []).forEach(k => { L.blood.add(k); goDn(k); });
  goDn(id);
  const pf = parentFam[id];
  let center = L.pos[id].x + CW / 2;
  if (pf) {
    const sib = D.fams[pf].ks.filter(k => k !== id).sort((a, b) => yr(a) - yr(b));
    const older = sib.filter(k => yr(k) < yr(id)), younger = sib.filter(k => yr(k) >= yr(id));
    const xs = root.m.map(q => L.pos[q].x);
    let lx = Math.min(...xs), rx = Math.max(...xs);
    older.reverse().forEach(k => { lx -= CW + IG; L.pos[k] = {x: lx, row: 0, lvl: 0}; L.blood.add(k); });
    younger.forEach(k => { rx += CW + IG; L.pos[k] = {x: rx, row: 0, lvl: 0}; L.blood.add(k); });
    L.frames.push({f: pf, members: [...older, ...root.m, ...younger], row: 0});
    L.fams.add(pf);
    center = (lx + rx + CW) / 2 - CW / 2;
    [[D.fams[pf].h, -1], [D.fams[pf].w, 1]].forEach(([par, side]) => {
      if (!par) return;
      (famsOf[par] || []).filter(f => f !== pf).sort((a, b) => D.fams[a].m - D.fams[b].m).forEach(f => {
        const ks = D.fams[f].ks.filter(k => !L.pos[k]).sort((a, b) => yr(a) - yr(b));
        if (!ks.length) return;
        const list = side > 0 ? ks : ks.slice().reverse();
        list.forEach((k, i) => {
          if (side > 0) rx += CW + (i ? IG : FG); else lx -= CW + (i ? IG : FG);
          L.pos[k] = {x: side > 0 ? rx : lx, row: 0, lvl: 0}; L.blood.add(k);
          L.half = L.half || {}; L.half[k] = side > 0 ? 'по матери' : 'по отцу';
        });
        L.frames.push({f, members: ks, row: 0}); L.fams.add(f);
      });
    });
    const A = ancFam(pf, 1);
    A.cards.forEach(([q, x, d]) => { L.pos[q] = {x: center + x, row: -d, lvl: 0}; L.blood.add(q); });
    A.cards.forEach(([q]) => { const f2 = parentFam[q]; if (f2) L.fams.add(f2); });
  }
  L.roles = {};
  Object.entries(L.spouseOf).forEach(([q, p]) => {
    if (L.blood.has(q)) return;
    if (otherParentsOf(p).includes(q)) {
      L.roles[q] = isM(q) ? 'отец ребёнка' : 'мать ребёнка';
      return;
    }
    const marriages = famsSorted(p).filter(f => !D.fams[f].unmarried && otherParentIn(f, p));
    const i = marriages.findIndex(f => otherParentIn(f, p) === q) + 1;
    L.roles[q] = marriages.length > 1 ? (isM(q) ? `${i}-й муж` : `${i}-я жена`) : (isM(q) ? 'муж' : 'жена');
  });
  L.rel = {};
  const up = (d, m) => d === 1 ? (m ? 'отец' : 'мать') : d === 2 ? (m ? 'дед' : 'бабушка') : d === 3 ? (m ? 'прадед' : 'прабабушка') : `пра(${d - 2})${m ? 'дед' : 'бабушка'}`;
  const dn = (d, m) => d === 1 ? (m ? 'сын' : 'дочь') : d === 2 ? (m ? 'внук' : 'внучка') : d === 3 ? (m ? 'правнук' : 'правнучка') : `пра(${d - 2})${m ? 'внук' : 'внучка'}`;
  const dnG = (d, m) => d === 2 ? (m ? 'внука' : 'внучки') : d === 3 ? (m ? 'правнука' : 'правнучки') : `пра(${d - 2})${m ? 'внука' : 'внучки'}`;
  Object.entries(L.pos).forEach(([q, v]) => {
    if (q === id) return;
    const m = isM(q);
    if (L.blood.has(q)) {
      if (v.row < 0) L.rel[q] = up(-v.row, m);
      else if (v.row > 0) L.rel[q] = dn(v.row, m);
      else L.rel[q] = (m ? 'брат' : 'сестра') + (L.half && L.half[q] ? ' ' + L.half[q] : '');
    } else if (L.spouseOf[q]) {
      const p = L.spouseOf[q], r = L.pos[p].row, pm = isM(p);
      if (otherParentsOf(p).includes(q)) L.rel[q] = L.roles[q];
      else if (p === id) L.rel[q] = L.roles[q] || (m ? 'муж' : 'жена');
      else if (r === 1) L.rel[q] = pm ? 'невестка' : 'зять';
      else L.rel[q] = `${m ? 'муж' : 'жена'} ${dnG(r, pm)}`;
    }
  });
  const rowsAll = [...new Set(Object.values(L.pos).map(v => v.row))].sort((a, b) => a - b);
  const extra = {}; Object.values(L.pos).forEach(v => { if (v.lvl) extra[v.row] = 1; });
  const ry = {}; let yy = 0;
  rowsAll.forEach(r => { ry[r] = yy; yy += ROWH + (extra[r] ? CH + 16 : 0); });
  Object.values(L.pos).forEach(v => { v.y = ry[v.row] + v.lvl * (CH + 16); });
  const c0 = posInView(id), dx = c0.x - L.pos[id].x, dy = c0.y - L.pos[id].y;
  Object.values(L.pos).forEach(v => { v.x += dx; v.y += dy; });
  L.dy = dy; L.dx = dx;
  return L;
}

/* --- отрисовка карточки и текста --- */
const CARD_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const cardMeasure = document.createElement('canvas').getContext('2d');
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const AGE = {};
function ageOf(p) {
  if (p in AGE) return AGE[p];
  let r = '';
  const t = (D.people[p].card.ls.find(([f, sz, t]) => / – /.test(t)) || [])[2];
  if (t) {
    const [a, b] = t.split(' – ').map(x => x.trim());
    const approx = /~|ок\.|\?/.test(a + b);
    const pd = x => { let m = x.match(/(\d\d)\.(\d\d)\.(\d{4})/); if (m) return {y: +m[3], m: +m[2], d: +m[1], full: true};
      m = x.match(/(\d{4})/); return m ? {y: +m[1], full: false} : null; };
    const A = pd(a), B = pd(b);
    if (A && B) {
      if (A.full && B.full) {
        let y = B.y - A.y; if (B.m < A.m || (B.m === A.m && B.d < A.d)) y--;
        if (y >= 1) r = `${approx ? '~' : ''}${y} ${plural(y, 'год', 'года', 'лет')}`;
        else {
          const days = Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 864e5);
          const mo = Math.floor(days / 30.44);
          r = mo >= 1 ? `${mo} ${plural(mo, 'месяц', 'месяца', 'месяцев')}` : days >= 1 ? `${days} ${plural(days, 'день', 'дня', 'дней')}` : '';
        }
      } else { const y = B.y - A.y; if (y >= 1) r = `~${y} ${plural(y, 'год', 'года', 'лет')}`; }
    }
  }
  return AGE[p] = r;
}

/* --- миникарта --- */
let MM = {x: 0, y: 0, w: 1, h: 1};
function mmContent() {
  const mm = document.getElementById('mmS'); if (!mm) return;
  const pos = focusId ? Object.entries(curPos).map(([p, q]) => [p, q.x, q.y]) : Object.entries(VIEW.cards).map(([p, c]) => [p, c[0], c[1]]);
  if (!pos.length) return;
  const xs = pos.map(a => a[1]), ys = pos.map(a => a[2]);
  MM = {x: Math.min(...xs) - 40, y: Math.min(...ys) - 40}; MM.w = Math.max(...xs) + CW + 40 - MM.x; MM.h = Math.max(...ys) + CH + 40 - MM.y;
  const ar = Math.max(0.35, Math.min(1.2, MM.h / MM.w));
  mm.setAttribute('viewBox', `0 0 ${100} ${100 * ar}`);
  const k = Math.min(100 / MM.w, 100 * ar / MM.h); MM.k = k; MM.ox = (100 - MM.w * k) / 2; MM.oy = (100 * ar - MM.h * k) / 2;
  document.getElementById('mmC').innerHTML = pos.map(([p, x, y]) => `<rect x="${(MM.ox + (x - MM.x) * k).toFixed(2)}" y="${(MM.oy + (y - MM.y) * k).toFixed(2)}" width="${Math.max(0.6, CW * k).toFixed(2)}" height="${Math.max(0.5, CH * k).toFixed(2)}" fill="${D.people[p] ? D.people[p].card.strip : '#999'}"/>`).join('');
  mmView();
}
function mmView() {
  const box = document.getElementById('mm'); if (!box || !MM.k) return;
  if (inOverview()) { box.classList.remove('on'); return; }
  const r = stage.getBoundingClientRect();
  const vx = -st.x / st.s, vy = -st.y / st.s, vw = r.width / st.s, vh = r.height / st.s;
  const show = vw < MM.w * 0.7 || vh < MM.h * 0.7;
  box.classList.toggle('on', show); if (!show) return;
  const v = document.getElementById('mmV');
  v.setAttribute('x', (MM.ox + (vx - MM.x) * MM.k).toFixed(2)); v.setAttribute('y', (MM.oy + (vy - MM.y) * MM.k).toFixed(2));
  v.setAttribute('width', (vw * MM.k).toFixed(2)); v.setAttribute('height', (vh * MM.k).toFixed(2));
}
function mmGo(e) {
  const s_ = document.getElementById('mmS'), b = s_.getBoundingClientRect(), vb = s_.viewBox.baseVal;
  const ux = (e.clientX - b.left) / b.width * vb.width, uy = (e.clientY - b.top) / b.height * vb.height;
  const cx = MM.x + (ux - MM.ox) / MM.k, cy = MM.y + (uy - MM.oy) / MM.k, r = stage.getBoundingClientRect();
  st.x = r.width / 2 - cx * st.s; st.y = r.height / 2 - cy * st.s; apply();
}

function cardText(text, y, preferredSize, className, weight = 400) {
  if (!text) return '';
  const inset = 18, available = CW - inset - 8;
  cardMeasure.font = `${weight} ${preferredSize}px ${CARD_FONT}`;
  const measured = cardMeasure.measureText(text).width;
  const size = measured > available ? preferredSize * available / measured : preferredSize;
  return `<text class="${className}" x="${inset}" y="${y}" font-size="${size.toFixed(1)}" font-weight="${weight}">${esc(text)}</text>`;
}

function baseSVG(id) {
  const person = D.people[id], c = person.card;
  const given = person.given || '';
  const isSpecialLabel = /^(?:\(|Имя неизвестно$|Сын |Мать )/.test(given);
  const parts = given.trim().split(/\s+/);
  const firstName = (isSpecialLabel ? given : parts[0]) || person.name;
  const patronymic = isSpecialLabel ? '' : parts.slice(1).join(' ');
  const surname = given && person.name.endsWith(given)
    ? person.name.slice(0, -given.length).trim() : (person.lines && person.lines[0] ? person.lines[0] : '');
  const shortSurname = surname.split(' (')[0];
  const dates = pDates(id);
  const years = dates.split(' – ').map(date => {
    const year = date.match(/\d{4}/)?.[0];
    return year ? (/^(?:~|ок\.)/.test(date) ? '~' : '') + year : '';
  }).filter(Boolean).join('–');
  const fill = person.sex === 'M' ? 'node-man' : person.sex === 'F' ? 'node-woman' : 'node-neutral';
  const hasDoc = person.status === 'doc' || (person.docs && person.docs.length > 0);
  const outline = hasDoc ? ' node-archive' : '';
  const age = ageOf(id);

  // Компактный вид (для дальнего/среднего масштаба)
  const overview =
    cardText(firstName, 30, 18, 'node-name', 700) +
    cardText(shortSurname, 49, 13, 'node-family', 500) +
    cardText(years, 69, 11.5, 'node-fact', 400);

  // Детальный вид (при приближении)
  const details =
    cardText(firstName, 23, 18, 'node-name', 750) +
    cardText(surname, 38, 12, 'node-family', 550) +
    cardText(patronymic, 50, 10.5, 'node-family', 400) +
    cardText(dates, 66, 10, 'node-fact', 400) +
    cardText(age, 77, 9, 'node-fact', 400);

  return `<rect class="node-surface ${fill}${outline}" width="${CW}" height="${CH}" rx="8" stroke-width="${c.lw || 1.2}"${c.dash ? ' stroke-dasharray="3 2"' : ''}/>` +
    `<rect class="node-clan" x="5" y="8" width="6" height="${CH - 16}" rx="3" fill="${c.strip}"/>` +
    `<g class="cp">${overview}</g><g class="dt">${details}</g>`;
}

function underSVG(roleTxt) { return ''; }
function roleBox(x, y, roleTxt) {
  return `<g transform="translate(${x},${y})">` + roleSVG(roleTxt) + '</g>';
}
function roleSVG(roleTxt) {
  return roleTxt ? `<rect class="tree-spouse-frame" x="-4" y="-13" width="${CW + 8}" height="${CH + 17}" rx="6" fill="#fff" stroke="#9a9a9a" stroke-width="0.8" stroke-dasharray="3 2"/><text class="role-label" x="0" y="-5" font-size="7.5" fill="#888">${esc(roleTxt)}</text>` : '';
}
function overSVG(p, relTxt) {
  return cardText(relTxt, ageOf(p) ? 84 : 78, 8.5, 'node-relation', 650);
}
function mkG(cls, html) { const g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', cls); g.innerHTML = html; return g; }
function setLayer(card, cls, html) {
  const old = card.querySelector(`:scope > .${cls}:not(.gone)`);
  if (old && old.dataset.h === html) return;
  if (old) { old.classList.add('gone'); old.style.opacity = '0'; setTimeout(() => old.remove(), 450); }
  if (!html) return;
  const g = mkG(`fx ${cls}`, html); g.dataset.h = html; g.style.opacity = '0';
  if (cls === 'under') card.insertBefore(g, card.firstChild); else card.appendChild(g);
  requestAnimationFrame(() => requestAnimationFrame(() => { g.style.opacity = '1'; }));
}
function linesSVG(L) {
  let gold = '', col = '';
  const ln = (x1, y1, x2, y2, c, g, kind = '') => {
    const a = `x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"`;
    if (g) gold += `<line ${a} stroke="#f4c430" stroke-width="7" stroke-linecap="round"/>`;
    col += `<line class="tree-connector${kind ? ' tree-' + kind : ''}" ${a} stroke="${c}" stroke-width="${kind === 'comb' ? 2 : 1.5}" stroke-linecap="round"/>`;
  };
  const kinS = id => !!D.people[id].kin || id === 'I1';
  const spans = [];
  L.fams.forEach(f => {
    const o = D.fams[f], pr = [o.h, o.w].filter(q => q && L.pos[q]), ks = o.ks.filter(k => L.pos[k]);
    if (!pr.length || !ks.length) return;
    const pxs = pr.map(q => L.pos[q].x + CW / 2), kxs = ks.map(k => L.pos[k].x + CW / 2);
    const xc = pxs.length === 2 ? (pxs[0] + pxs[1]) / 2 : pxs[0];
    spans.push({f, row: Math.min(...ks.map(k => L.pos[k].y)), lo: Math.min(xc, ...kxs), hi: Math.max(xc, ...kxs)});
  });
  const lane = {};
  const byRow = {}; spans.forEach(sp => (byRow[sp.row] = byRow[sp.row] || []).push(sp));
  Object.values(byRow).forEach(list => {
    list.sort((a, b) => a.lo - b.lo); const ends = [];
    list.forEach(sp => { let i = ends.findIndex(e => e + 12 < sp.lo); if (i < 0) { i = ends.length; ends.push(0); } ends[i] = sp.hi; lane[sp.f] = i; });
  });
  L.fams.forEach(f => {
    const o = D.fams[f], c = o.col;
    const pr = [o.h, o.w].filter(q => q && L.pos[q]);
    const ks = o.ks.filter(k => L.pos[k]);
    if (!pr.length) return;
    if (!ks.length) {
      if (pr.length === 2 && !o.unmarried) {
        const a = L.pos[pr[0]], b = L.pos[pr[1]];
        const [left, right] = a.x < b.x ? [a, b] : [b, a];
        if (Math.abs(left.y - right.y) < 1) ln(left.x + CW, left.y + CH / 2 + 8, right.x, right.y + CH / 2 + 8, c, false, 'pair');
      }
      return;
    }
    const g = false;
    const ky = Math.min(...ks.map(k => L.pos[k].y));
    const bus = ky - 26 - 14 - (lane[f] || 0) * 9;
    if (o.unmarried) {
      const parents = pr.map(q => L.pos[q].x + CW / 2);
      const children = ks.map(k => L.pos[k].x + CW / 2);
      pr.forEach((q, i) => ln(parents[i], L.pos[q].y + CH, parents[i], bus, c, false));
      ln(Math.min(...parents, ...children), bus, Math.max(...parents, ...children), bus, c, false, ks.length > 1 ? 'comb' : '');
      ks.forEach((k, i) => ln(children[i], bus, children[i], L.pos[k].y, c, false));
      return;
    }
    let xc, y0;
    const P0 = pr.map(q => L.pos[q]).sort((a, b) => a.x - b.x);
    const far = pr.length === 2 && Math.abs(P0[0].y - P0[1].y) < 1 && P0[1].x - P0[0].x > CW + IG + 2;
    const otherShown = far && pr.some(z => (famsOf[z] || []).some(f2 => f2 !== f && [D.fams[f2].h, D.fams[f2].w].some(w => w && w !== z && L.pos[w])));
    if (far && !otherShown) {
      const yb = P0[0].y + CH + 16 + (lane[f] || 0) * 6;
      const xa = P0[0].x + CW / 2, xb = P0[1].x + CW / 2;
      ln(xa, P0[0].y + CH, xa, yb, c, false); ln(xb, P0[1].y + CH, xb, yb, c, false); ln(xa, yb, xb, yb, c, false);
      const km = ks.map(k => L.pos[k].x + CW / 2), kc = (Math.min(...km) + Math.max(...km)) / 2;
      xc = Math.max(xa, Math.min(xb, kc)); y0 = yb;
      col += `<circle cx="${xc.toFixed(1)}" cy="${y0.toFixed(1)}" r="2.4" fill="${c}"/>`;
    } else if (far) {
      const q = pr.find(z => (famsOf[z] || []).length === 1) || pr[1];
      xc = L.pos[q].x + CW / 2; y0 = L.pos[q].y + CH;
    } else if (pr.length === 2) {
      const ym = P0[0].y + CH / 2 + 8;
      ln(P0[0].x + CW, ym, P0[1].x, ym, c, g && pr.every(kinS), 'pair');
      xc = (P0[0].x + CW + P0[1].x) / 2; y0 = ym;
      if (Math.abs(P0[0].y - P0[1].y) > 1) { xc = P0[0].x + CW / 2; y0 = P0[0].y + CH; }
    } else { xc = P0[0].x + CW / 2; y0 = P0[0].y + CH; }
    ln(xc, y0, xc, bus, c, g);
    const xs = ks.map(k => L.pos[k].x + CW / 2);
    if (ks.length > 1) {
      const left = Math.min(...xs), right = Math.max(...xs);
      if (xc < left) ln(xc, bus, left, bus, c, false);
      if (xc > right) ln(right, bus, xc, bus, c, false);
      ln(left, bus, right, bus, c, false, 'comb');
    } else ln(xc, bus, xs[0], bus, c, false);
    ks.forEach(k => {
      const kx = L.pos[k].x + CW / 2;
      if (g && kinS(k)) ln(Math.min(xc, kx), bus, Math.max(xc, kx), bus, c, true);
      ln(kx, bus, kx, L.pos[k].y, c, g && kinS(k));
    });
    if (pr.length === 2 && !far && Math.abs(P0[0].y - P0[1].y) < 1)
      col += `<circle cx="${xc.toFixed(1)}" cy="${y0.toFixed(1)}" r="2.4" fill="${c}"/>`;
  });
  return gold + col;
}

function framesSVG(L) {
  return L.frames.map(fr => {
    const ps = fr.members.filter(q => L.pos[q]);
    if (!ps.length) return '';
    const x1 = Math.min(...ps.map(q => L.pos[q].x)) - PADF;
    const x2 = Math.max(...ps.map(q => L.pos[q].x)) + CW + PADF;
    const y = Math.min(...ps.map(q => L.pos[q].y)) - 26;
    const hh = Math.max(...ps.map(q => L.pos[q].y)) + CH + PADF - y;
    const lab = frameLabel(fr.f);
    return `<rect x="${x1.toFixed(1)}" y="${y.toFixed(1)}" width="${(x2 - x1).toFixed(1)}" height="${hh.toFixed(1)}" class="tree-family-frame" data-family="${fr.f}" rx="9" stroke-width="0.8"/>` +
      `<text x="${(x1 + 7).toFixed(1)}" y="${(y + 11).toFixed(1)}" font-size="8" class="tree-family-caption">${esc(lab)}</text>`;
  }).join('');
}

/* --- анимация: фокус на человеке --- */
const T = 650;
const MINZ = 1.15;
let backG = null, cardsG = null, timer = null;
function setT(el, x, y) { el.style.transform = `translate(${x}px,${y}px)`; }
function focusOn(id) {
  clearTimeout(timer);
  const L = focusLayout(id);
  const ids = Object.keys(L.pos);
  const entering = !focusId;
  fullL.style.opacity = '0'; fullL.style.pointerEvents = 'none'; if (chipsG) chipsG.style.display = 'none';
  fullL.querySelectorAll('.person').forEach(g => { g.style.transition = 'none'; g.style.opacity = '0'; });
  if (backG) backG.remove();
  backG = document.createElementNS(SVGNS, 'g'); backG.setAttribute('class', 'focusBack');
  backG.innerHTML = framesSVG(L) + Object.entries(L.roles).map(([q, t]) => L.pos[q] ? roleBox(L.pos[q].x, L.pos[q].y, t) : '').join('') + linesSVG(L);
  placeFamilyCaptions(backG);
  backG.style.opacity = '0';
  focL.appendChild(backG);
  if (!cardsG) { cardsG = document.createElementNS(SVGNS, 'g'); focL.appendChild(cardsG); }
  else focL.appendChild(cardsG);
  const keep = new Set(ids);
  cardsG.querySelectorAll('.person').forEach(g => {
    const p = g.dataset.p;
    if (!keep.has(p)) { const c = posInView(p); setT(g, c.x, c.y); g.style.opacity = '0'; setTimeout(() => g.remove(), T); }
  });
  ids.forEach(p => {
    let g = cardsG.querySelector(`.person[data-p="${p}"]`);
    if (!g) {
      g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', 'person fc'); g.dataset.p = p;
      g.appendChild(mkG('ring', `<rect x="-5" y="-5" width="${CW + 10}" height="${CH + 10}" rx="11" fill="none" stroke="#c8553d" stroke-width="2.5"/>`));
      g.appendChild(mkG('base', baseSVG(p)));
      const c = posInView(p); setT(g, c.x, c.y);
      g.style.opacity = entering ? '1' : '0';
      cardsG.appendChild(g);
    }
    setLayer(g, 'under', underSVG(L.roles[p] || ''));
    setLayer(g, 'over', overSVG(p, L.rel[p] || ''));
    g.classList.toggle('me', p === id);
  });
  void cardsG.getBoundingClientRect();
  requestAnimationFrame(() => {
    ids.forEach(p => { const g = cardsG.querySelector(`.person[data-p="${p}"]`); if (!g) return; setT(g, L.pos[p].x, L.pos[p].y); g.style.opacity = '1'; });
    timer = setTimeout(() => { if (backG) backG.style.opacity = '1'; }, T * 0.6);
  });
  curPos = L.pos; focusId = id; rebuildOverview(); mmContent();
  const pp = D.people[id];
  const core = [id, ...(pp.par || []), ...(pp.sp || []), ...otherParentsOf(id), ...(pp.kids || [])].filter(p => L.pos[p]);
  const xs = core.map(p => L.pos[p].x), ys = core.map(p => L.pos[p].y);
  const x1 = Math.min(...xs) - 20, y1 = Math.min(...ys) - 50, x2 = Math.max(...xs) + CW + 20, y2 = Math.max(...ys) + CH + 30;
  animView(() => {
    const r = stage.getBoundingClientRect();
    let s_ = Math.min((r.width - 40) / (x2 - x1), (r.height - 40) / (y2 - y1));
    s_ = Math.max(MINZ, Math.min(1.7, s_));
    const c = L.pos[id];
    const fits = (x2 - x1) * s_ <= r.width - 30 && (y2 - y1) * s_ <= r.height - 30;
    const cx = fits ? (x1 + x2) / 2 : c.x + CW / 2, cy = fits ? (y1 + y2) / 2 : c.y + CH / 2;
    st.s = s_; st.x = r.width / 2 - cx * s_; st.y = r.height * (fits ? 0.5 : 0.42) - cy * s_; apply();
  });
}
function focusOff() {
  if (!focusId) return;
  clearTimeout(timer);
  if (backG) { backG.style.opacity = '0'; const b = backG; setTimeout(() => b.remove(), T); backG = null; }
  const back = new Set();
  if (cardsG) {
    cardsG.querySelectorAll('.person').forEach(g => { const c = posInView(g.dataset.p); setT(g, c.x, c.y); if (VIEW.cards[g.dataset.p]) back.add(g.dataset.p); else g.style.opacity = '0';
      g.classList.remove('me'); g.querySelectorAll('.fx').forEach(x => { x.style.opacity = '0'; }); });
    const cg = cardsG; cardsG = null;
    setTimeout(() => {
      fullL.querySelectorAll('.person').forEach(g => { g.style.opacity = '1'; });
      cg.remove();
    }, T + 30);
  }
  fullL.querySelectorAll('.person').forEach(g => { if (!back.has(g.dataset.p)) g.style.opacity = '1'; });
  fullL.style.opacity = '1'; fullL.style.pointerEvents = ''; if (chipsG) chipsG.style.display = '';
  focusId = null; curPos = {}; rebuildOverview(); mmContent();
}
function animView(fn) {
  svg.classList.add('anim'); fn();
  setTimeout(() => svg.classList.remove('anim'), T + 50);
}

/* ===== Свёрнутые рода ===== */
let VIEWS = null, VIEW = null, MASK = 0, BMASK = 0, viewBackG = null, viewCardsG = null, chipsG = null, ANCH = {};
const ALLB = () => (1 << VIEWS.branches.length) - 1;
const ALLG = () => (1 << VIEWS.groups.length) - 1;
const mixedView = window.NovikovyLayout(initialViews, initialData, CW, CH);
const viewOf = (m, b) => mixedView(m, b);
function buildAnch() {
  VIEWS.branches.forEach(([r, t, mem]) => mem.forEach(p => { ANCH[p] = r; }));
  VIEWS.groups.forEach(([k, sp, t, mem]) => mem.forEach(p => { ANCH[p] = sp || 'I35'; }));
}
function posIn(v, p) {
  let q = p, dy = 0;
  for (let i = 0; i < 6 && q; i++) {
    if (v.cards[q]) return {x: v.cards[q][0], y: v.cards[q][1] + dy};
    q = ANCH[q]; if (!dy) dy = CH + 60;
  }
  return {x: v.W / 2, y: 0};
}
const posInView = p => posIn(VIEW, p);
function familyTitle(f) {
  const {h, w, ks} = D.fams[f];
  const parents = [h, w].filter(Boolean);
  if (parents.length) return parents.map(first).join(' и ');
  const clans = new Set(ks.map(id => D.people[id].clan));
  return clans.size === 1 && [...clans][0] || 'Семья';
}
function frameLabel(f) {
  const {h, w} = D.fams[f];
  return (h || w ? 'дети: ' : '') + familyTitle(f);
}
function placeFamilyCaptions(layer) {
  const segments = [...layer.querySelectorAll('line')].map(line =>
    ['x1', 'x2', 'y1', 'y2'].map(key => Number(line.getAttribute(key))));
  cardMeasure.font = `8px ${CARD_FONT}`;
  for (const caption of layer.querySelectorAll('.tree-family-caption')) {
    const frame = caption.previousElementSibling;
    const left = Number(caption.getAttribute('x'));
    const right = Number(frame.getAttribute('x')) + Number(frame.getAttribute('width'));
    const y = Number(caption.getAttribute('y'));
    const width = cardMeasure.measureText(caption.textContent).width;
    const obstacles = segments.filter(([x1, x2, y1, y2]) =>
      x1 === x2 && Math.min(y1, y2) < y + 2 && Math.max(y1, y2) > y - 8)
      .map(([x]) => x).sort((a, b) => a - b);
    let x = left;
    for (const obstacle of obstacles) {
      if (obstacle + 4 <= x) continue;
      if (obstacle - 4 >= x + width) break;
      x = obstacle + 4;
    }
    if (x + width <= right - 4) caption.setAttribute('x', x);
    layer.appendChild(caption);
  }
}
function backHTML(v) {
  let s = '';
  v.frames.forEach(([f, x, y, w, h]) => {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="tree-family-frame" data-family="${f}" rx="9" stroke-width="0.8"/>` +
      `<text x="${x + 7}" y="${y + 11}" font-size="8" class="tree-family-caption">${esc(frameLabel(f))}</text>`;
  });
  Object.entries(v.roles).forEach(([q, t]) => { if (t && v.cards[q]) s += roleBox(v.cards[q][0], v.cards[q][1], t); });
  if (v.connections) return s + linesSVG(v.connections);
  const pal = VIEWS.pal;
  v.segs.forEach(([x1, y1, x2, y2, c, w]) => { s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${pal[c]}" stroke-width="${w}" stroke-linecap="round"/>`; });
  v.dots.forEach(([x, y, c]) => { s += `<circle cx="${x}" cy="${y}" r="2.4" fill="${pal[c]}"/>`; });
  return s;
}

let overviewLayout = null, macroOffset = null, overviewDirty = true, overviewFrame = 0;
let macroFitted = false, macroZoomFrame = 0;
const macroPlane = document.createElement('div');
macroPlane.className = 'macro-plane';
overviewLayer.appendChild(macroPlane);

function rebuildOverview() {
  overviewDirty = true;
  queueOverview();
}

function drawOverview() {
  if (!VIEW) return;
  const positions = focusId ? curPos : VIEW.connections.pos;
  const matches = id => !CLAN || D.people[id].card.stripT === CLAN;
  overviewLayout = window.NovikovyMacroLayout(D, positions, matches, familyTitle, CW, CH);
  const {nodes, links, width, height} = overviewLayout;
  const connectors = document.createElementNS(SVGNS, 'svg');
  connectors.classList.add('macro-links');
  connectors.setAttribute('aria-hidden', 'true');
  connectors.setAttribute('width', width);
  connectors.setAttribute('height', height);
  for (const {source, path: route} of links) {
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', route);
    path.setAttribute('stroke', D.fams[source.family].col);
    connectors.appendChild(path);
  }
  const buttons = nodes.map(node => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'overview-label ' + (node.family ? 'macro-family' : 'macro-single');
    button.style.cssText = 'left:' + node.x + 'px;top:' + node.y + 'px;width:' + node.width + 'px;height:' + node.height + 'px';
    const label = document.createElement('span');
    label.className = 'macro-title';
    label.textContent = node.label;
    button.appendChild(label);
    button.title = node.label;
    let accessibleLabel = 'Приблизить ' + node.label;
    if (node.family) {
      button.dataset.family = node.family;
      button.style.setProperty('--macro-clan', D.fams[node.family].col);
      const row = document.createElement('span');
      row.className = 'macro-children';
      row.setAttribute('aria-hidden', 'true');
      for (const id of node.children) {
        const child = D.people[id];
        const pill = document.createElement('i');
        pill.className = 'macro-child ' + (child.sex === 'M' ? 'boy' : child.sex === 'F' ? 'girl' : '');
        row.appendChild(pill);
      }
      button.appendChild(row);
      button.title += '\n' + node.children.map(id => D.people[id].given || pName(id)).join(', ');
      accessibleLabel += ', детей ' + node.children.length;
    } else {
      button.dataset.person = node.person;
      button.style.setProperty('--macro-clan', D.people[node.person].card.strip);
    }
    button.setAttribute('aria-label', accessibleLabel);
    button.onclick = event => { if (!event.detail || moved < 6) zoomToMacro(node); };
    button.addEventListener('focus', () => {
      if (!button.matches(':focus-visible') || !macroOffset || macroFitted) return;
      const {clientWidth, clientHeight} = stage;
      const s = overviewScale();
      macroOffset.x += Math.max(0, 12 - (node.x * s + macroOffset.x)) -
        Math.max(0, (node.x + node.width) * s + macroOffset.x - clientWidth + 12);
      macroOffset.y += Math.max(0, 12 - (node.y * s + macroOffset.y)) -
        Math.max(0, (node.y + node.height) * s + macroOffset.y - clientHeight + 60);
      queueOverview();
    });
    return button;
  });
  macroPlane.replaceChildren(connectors, ...buttons);
  overviewDirty = false;
}

function ensureOverview() {
  if (overviewDirty) drawOverview();
}

function macroFit() {
  const {clientWidth: width, clientHeight: height} = stage;
  const usableW = Math.max(1, width - 24);
  const usableH = Math.max(1, height - 72);
  const scale = Math.min(BLEND_END / OVERVIEW_SCALE, usableW / Math.max(1, overviewLayout.width),
    usableH / Math.max(1, overviewLayout.height));
  return {scale, x: (width - overviewLayout.width * scale) / 2,
    y: 12 + (usableH - overviewLayout.height * scale) / 2};
}

function macroPoint(node) {
  const scale = overviewScale();
  return {
    x: (macroOffset?.x ?? 0) + (node.x + node.width / 2) * scale,
    y: (macroOffset?.y ?? 0) + (node.y + node.height / 2) * scale
  };
}

function alignMacro(node, x, y) {
  const scale = overviewScale();
  macroOffset = {x: x - (node.x + node.width / 2) * scale, y: y - (node.y + node.height / 2) * scale};
}

function stopMacroZoom() {
  cancelAnimationFrame(macroZoomFrame);
  macroZoomFrame = 0;
}

function zoomToMacro(node) {
  stopMacroZoom();
  svg.classList.remove('anim', 'moving');
  const {width, height} = stage.getBoundingClientRect();
  const targetScale = Math.max(0.68, Math.min(0.83, (width - 28) / node.target.width));
  const startScale = st.s;
  const start = macroPoint(node);
  const begin = performance.now();
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420;
  macroFitted = false;
  const draw = now => {
    const time = duration ? Math.min(1, (now - begin) / duration) : 1;
    const progress = time * time * (3 - 2 * time);
    st.s = startScale * (targetScale / startScale) ** progress;
    const x = start.x + (width / 2 - start.x) * progress;
    const y = start.y + (height * 0.48 - start.y) * progress;
    alignMacro(node, x, y);
    st.x = x - node.target.x * st.s;
    st.y = y - node.target.y * st.s;
    apply();
    if (time < 1) macroZoomFrame = requestAnimationFrame(draw);
  };
  macroZoomFrame = requestAnimationFrame(draw);
}

function nearestMacro(x, y, fromTarget = false) {
  ensureOverview();
  let best = null, bestDistance = Infinity;
  for (const node of overviewLayout.nodes) {
    const point = fromTarget
      ? {x: st.x + node.target.x * st.s, y: st.y + node.target.y * st.s}
      : macroPoint(node);
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return best;
}

function paintMacro() {
  ensureOverview();
  const fit = macroFit();
  const scale = macroFitted ? fit.scale : overviewScale();
  const x = macroFitted ? fit.x : macroOffset?.x ?? 0;
  const y = macroFitted ? fit.y : macroOffset?.y ?? 0;
  macroPlane.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
}

function queueOverview() {
  cancelAnimationFrame(overviewFrame);
  overviewFrame = requestAnimationFrame(paintMacro);
}

function chipBox(x, y, label, open, color, extra = '') {
  const w = 120, h = 26;
  const cx = x + (CW - w) / 2;
  const cy = y + CH + 6;
  const bg = open ? '#ffffff' : color;
  const fg = open ? '#1f2421' : '#ffffff';
  const border = open ? 'stroke="#dfdbd2" stroke-width="1"' : '';
  return `<g class="chip" transform="translate(${cx},${cy})" ${extra} cursor="pointer">` +
    `<rect class="tb" width="${w}" height="${h}" rx="13" fill="${bg}" ${border}/>` +
    `<text x="${w / 2}" y="17" font-size="11" font-weight="650" fill="${fg}" text-anchor="middle" font-family="${CARD_FONT}">${esc(label)}</text>` +
  `</g>`;
}

function branchControls(v) {
  const list = [];
  VIEWS.groups.forEach(([k, sp, t, mem], i) => {
    const open = (MASK & (1 << i)) !== 0;
    const anchor = sp || 'I35';
    const color = D.people[mem[0]] ? D.people[mem[0]].card.strip : '#4a7c59';
    list.push({group: true, index: i, anchor, title: t, count: mem.length, open, color});
  });
  VIEWS.branches.forEach(([r, t, mem], i) => {
    const open = (BMASK & (1 << i)) !== 0;
    const color = D.people[mem[0]] ? D.people[mem[0]].card.strip : '#4a7c59';
    list.push({group: false, index: i, anchor: r, title: t, count: mem.length, open, color});
  });
  return list;
}

function chipsHTML(v) {
  let s = '';
  branchControls(v).forEach(({group, index, anchor, title, count, open, color}) => {
    if (!v.cards[anchor]) return;
    const [x, y] = v.cards[anchor];
    const lbl = open ? '− свернуть' : `＋ ${title} · ${count}`;
    s += chipBox(x, y, lbl, open, color, `data-${group ? 'g' : 'b'}="${index}"`);
  });
  return s;
}

function renderView(m, b) {
  MASK = m; BMASK = b;
  const nextV = viewOf(m, b);
  VIEW = nextV;
  fullL.innerHTML = '';
  viewBackG = document.createElementNS(SVGNS, 'g'); viewBackG.setAttribute('class', 'viewBack');
  viewBackG.innerHTML = backHTML(nextV);
  placeFamilyCaptions(viewBackG);
  fullL.appendChild(viewBackG);

  viewCardsG = document.createElementNS(SVGNS, 'g'); viewCardsG.setAttribute('class', 'viewCards');
  Object.keys(nextV.cards).forEach(p => {
    const [x, y] = nextV.cards[p];
    const g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', 'person'); g.dataset.p = p;
    g.setAttribute('transform', `translate(${x},${y})`);
    g.appendChild(mkG('base', baseSVG(p)));
    viewCardsG.appendChild(g);
  });
  fullL.appendChild(viewCardsG);

  chipsG = document.createElementNS(SVGNS, 'g'); chipsG.setAttribute('class', 'chipsLayer');
  chipsG.innerHTML = chipsHTML(nextV);
  fullL.appendChild(chipsG);

  allButton.textContent = allBranchesOpen() ? 'Свернуть всё' : 'Раскрыть всё';
  rebuildOverview();
  mmContent();
}

function toggleGroup(i) {
  renderView(MASK ^ (1 << i), BMASK);
}
function toggleBranch(i) {
  renderView(MASK, BMASK ^ (1 << i));
}

/* --- легенда родов --- */
let CLAN = null;
function clanOff() {
  CLAN = null;
  document.querySelectorAll('#legend button, #clanList button').forEach(b => {
    b.classList.remove('on');
    b.removeAttribute('aria-pressed');
  });
  if (svg) svg.classList.remove('clan');
  rebuildOverview();
}
function filterClan(clan) {
  if (CLAN === clan) { clanOff(); return; }
  CLAN = clan;
  document.querySelectorAll('#legend button, #clanList button').forEach(b => {
    const active = b.dataset.clan === clan;
    b.classList.toggle('on', active);
    if (active) b.setAttribute('aria-pressed', 'true');
    else b.removeAttribute('aria-pressed');
  });
  svg.classList.add('clan');
  svg.querySelectorAll('.person').forEach(g => {
    const p = g.dataset.p;
    g.classList.toggle('on', D.people[p] && D.people[p].card.stripT === clan);
  });
  rebuildOverview();
}

function initLegend() {
  const clans = {};
  Object.values(D.people).forEach(p => {
    const c = p.card.stripT;
    if (c) clans[c] = (clans[c] || 0) + 1;
  });
  const nav = document.getElementById('legend');
  const buttons = Object.entries(clans).map(([c, count]) => {
    const color = Object.values(D.people).find(p => p.card.stripT === c)?.card.strip || '#4a7c59';
    return `<button type="button" data-clan="${esc(c)}"><i style="background:${color}" aria-hidden="true"></i>${esc(c)}<b>${count}</b></button>`;
  }).join('');
  nav.innerHTML = buttons;
  clanList.innerHTML = Object.entries(clans).map(([c, count]) => {
    const color = Object.values(D.people).find(p => p.card.stripT === c)?.card.strip || '#4a7c59';
    return `<button type="button" data-clan="${esc(c)}"><i style="background:${color}" aria-hidden="true"></i><span>${esc(c)}</span><b>${count}</b></button>`;
  }).join('');

  const handler = e => {
    const b = e.target.closest('button[data-clan]');
    if (!b) return;
    filterClan(b.dataset.clan);
    if (clanDialog.open) clanDialog.close();
  };
  nav.onclick = handler;
  clanList.onclick = handler;
  document.getElementById('clanToggle').onclick = () => {
    zoomMenu.open = false;
    clanDialog.showModal();
  };
}

/* --- поиск персон --- */
function initSearch() {
  const q = document.getElementById('q'), res = document.getElementById('results');
  let selIdx = -1;
  const doSearch = () => {
    const val = norm(q.value.trim());
    if (!val || val.length < 2) { res.style.display = 'none'; return; }
    const hits = Object.entries(D.people).filter(([id, p]) => {
      return norm(p.name).includes(val) || (p.alt || []).some(a => norm(a).includes(val));
    }).slice(0, 15);
    if (!hits.length) {
      res.innerHTML = '<div style="padding:10px 14px;color:var(--mute);font-size:13.5px;">Ничего не найдено</div>';
      res.style.display = 'block';
      return;
    }
    res.innerHTML = hits.map(([id, p]) => {
      const dates = pDates(id);
      return `<button type="button" data-p="${id}"><b>${esc(p.name)}</b><small>${esc(dates)}</small></button>`;
    }).join('');
    res.style.display = 'block';
    selIdx = -1;
  };
  q.addEventListener('input', doSearch);
  q.addEventListener('focus', () => { if (q.value.trim().length >= 2) doSearch(); });
  res.addEventListener('click', e => {
    const b = e.target.closest('button[data-p]');
    if (!b) return;
    const id = b.dataset.p;
    q.value = '';
    res.style.display = 'none';
    select(id);
  });
  addEventListener('click', e => { if (!q.contains(e.target) && !res.contains(e.target)) res.style.display = 'none'; });
}

/* --- выбор персоны и показ боковой шторки --- */
let selId = null;
function select(id, anim = true) {
  if (selId === id) return;
  selId = id;
  clanOff();
  renderPanel(id);
  focusOn(id);
}
function clearSel() {
  if (!selId && !focusId) return;
  selId = null;
  panel.classList.remove('open');
  setReading(false);
  focusOff();
}

function setReading(enable, scroll = false) {
  panel.classList.toggle('reading', enable);
  document.querySelector('main').classList.toggle('reading', enable);
}

/* ==========================================================================
   ОБНОВЛЁННАЯ ФУНКЦИЯ renderPanel — боковая шторка персоны (aside)
   ========================================================================== */
function renderPanel(id) {
  const p = D.people[id];
  if (!p) return;
  const clanColor = p.card.strip || 'var(--primary)';
  const clanName = p.clan || p.card.stripT || 'Род';
  const hasDoc = p.status === 'doc' || (p.docs && p.docs.length > 0);

  // Фотография
  const photoHTML = (p.photos && p.photos.length) 
    ? `<button class="pph" type="button" data-img="${esc(p.photos[0])}" aria-label="Открыть фото крупно">
         <img src="${esc(p.photos[0])}" alt="${esc(p.name)}" loading="lazy">
       </button>`
    : '';

  // Степень родства
  const kinBadge = p.kin 
    ? `<span class="kin" style="background:${clanColor}; color:#fff; font-weight:700; padding:2px 8px; border-radius:6px; font-size:12px; margin-right:6px;">${esc(p.kin)}</span>` 
    : '';

  // Архивные документы
  let docsHTML = '';
  if (p.docs && p.docs.length) {
    const list = p.docs.map(docId => {
      return `<button class="doc" type="button" data-doc="${esc(docId)}">
        <div style="width:80px; height:52px; background:var(--chip); border-radius:6px; display:grid; place-items:center; color:var(--primary); font-size:11px; font-weight:700;">АРХИВ</div>
        <div>
          <b>Метрическая выпись ${esc(docId)}</b>
          <small>ГАПК, архивный фонд д. Чикаши</small>
        </div>
      </button>`;
    }).join('');

    docsHTML = `
      <details class="sec" open>
        <summary>
          <span>Архивные документы</span>
          <b>${p.docs.length}</b>
          <span class="cv">▾</span>
        </summary>
        <div class="sb docs">${list}</div>
      </details>`;
  }

  // Список родственников
  const renderKinList = (ids, title, open = false) => {
    if (!ids || !ids.length) return '';
    const items = ids.map(kId => {
      const k = D.people[kId];
      if (!k) return '';
      return `<button type="button" data-p="${kId}">
        <b>${esc(k.name)}</b>
        <small>${esc(pDates(kId))}</small>
      </button>`;
    }).filter(Boolean).join('');
    if (!items) return '';
    return `
      <details class="sec"${open ? ' open' : ''}>
        <summary>
          <span>${title}</span>
          <b>${ids.length}</b>
          <span class="cv">▾</span>
        </summary>
        <div class="sb chips">${items}</div>
      </details>`;
  };

  // События
  let eventsHTML = '';
  if (p.events && p.events.length) {
    const list = p.events.map(ev => `
      <div class="ev">
        <b>${esc(ev.t)}: ${esc(ev.d || '')}</b>
        ${ev.pl ? `<div>${esc(ev.pl)}</div>` : ''}
        ${ev.s ? `<div class="s">${esc(ev.s)}</div>` : ''}
        ${ev.n ? `<div style="font-size:13px; color:var(--mute); margin-top:2px;">${esc(ev.n)}</div>` : ''}
      </div>
    `).join('');
    eventsHTML = `
      <details class="sec">
        <summary>
          <span>События</span>
          <b>${p.events.length}</b>
          <span class="cv">▾</span>
        </summary>
        <div class="sb">${list}</div>
      </details>`;
  }

  // Заметки
  let notesHTML = '';
  if (p.notes && p.notes.length) {
    const list = p.notes.map(n => `<p>${linkify(n)}</p>`).join('');
    notesHTML = `
      <details class="sec">
        <summary>
          <span>Заметки</span>
          <b>${p.notes.length}</b>
          <span class="cv">▾</span>
        </summary>
        <div class="sb notes">${list}</div>
      </details>`;
  }

  // Верхняя полоска
  const grabHTML = `
    <div class="grab">
      <button class="tg" type="button" aria-label="Свернуть панель">
        <span>${esc(p.name)}</span>
        <span class="hd">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          <b>Скрыть</b>
        </span>
      </button>
      <button class="panel-mode reading-enter" type="button">На весь экран</button>
      <button class="panel-mode reading-exit" type="button">К древу</button>
      <button class="x" type="button" aria-label="Закрыть">×</button>
    </div>`;

  // Главная плашка
  const plateHTML = `
    <div class="plate" style="--c:${clanColor};">
      ${photoHTML}
      <div class="pc">${esc(clanName)}</div>
      <h2>${esc(p.given || p.name)}</h2>
      <div class="pd">${kinBadge}${esc(pDates(id))}</div>
      ${hasDoc ? '<div class="ps" style="color:var(--primary); font-weight:600; margin-top:4px;">✓ Есть подтверждение в архиве</div>' : ''}
    </div>`;

  panel.innerHTML = grabHTML + plateHTML + docsHTML +
    renderKinList(p.par, 'Родители', true) +
    renderKinList(p.sp, 'Супруги', true) +
    renderKinList(p.kids, 'Дети', true) +
    renderKinList(p.siblings, 'Братья и сёстры', false) +
    eventsHTML + notesHTML;

  panel.classList.add('open');
  panel.classList.remove('min');

  // Обработчики внутри шторки
  panel.querySelector('.x').onclick = () => clearSel();
  panel.querySelector('.tg').onclick = () => panel.classList.toggle('min');
  panel.querySelector('.reading-enter').onclick = () => setReading(true, true);
  panel.querySelector('.reading-exit').onclick = () => setReading(false, true);

  panel.querySelectorAll('.chips button[data-p]').forEach(b => {
    b.onclick = () => select(b.dataset.p);
  });
}

/* --- полноэкранный лайтбокс --- */
const lb = document.getElementById('lb');
document.getElementById('help').onclick = () => {
  const t = document.getElementById('helpT');
  lb.className = 'open';
  lb.querySelector('.box').innerHTML = t.innerHTML;
  lb.querySelector('.close').onclick = () => lb.classList.remove('open');
};
lb.onclick = e => { if (e.target === lb || e.target.classList.contains('close')) lb.classList.remove('open', 'img'); };

/* --- инициализация данных --- */
D = initialData;
VIEWS = initialViews;
buildAnch();

// Создание основного холста SVG
const stageEl = document.getElementById('stage');
document.getElementById('loading')?.remove();
svg = document.createElementNS(SVGNS, 'svg');
svg.id = 'tree';
svg.setAttribute('width', 1);
svg.setAttribute('height', 1);
stageEl.prepend(svg);

fullL = document.createElementNS(SVGNS, 'g'); fullL.id = 'fullL';
svg.appendChild(fullL);

initFocus();
initLegend();
initSearch();

// Первоначальный рендер
renderView(0, 0);
stageActions.hidden = false;

// Подгон масштаба по центру
setTimeout(() => {
  fitAll();
}, 60);

})();

})();
</script>
</div>
<!-- STITCH_THREEJS_END:ANIMATION_32 -->
</body>
</html>
