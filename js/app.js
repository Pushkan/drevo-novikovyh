(async () => {
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
// ускорение (готовый «снимок» схемы) — только при перетаскивании: масштаб не меняется, текст остаётся чётким.
// При масштабировании его выключаем, чтобы браузер перерисовывал схему в каждом кадре.
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
  if (chip) { clanOff(); if (chip.dataset.b != null) toggleBranch(+chip.dataset.b); else toggleGroup(+chip.dataset.g); return; } const el = hit && hit.closest ? hit.closest('.person') : null;
  if (el) select(el.dataset.p); else clearSel();
}
{ const mm = document.getElementById('mm'); let dn = false;
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
    const cx_ = e.clientX, cy_ = e.clientY, pid = e.pointerId;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => tapAction(cx_, cy_), e.pointerType === 'mouse' ? 0 : 260);
    return;
  }
  if (false) {
    if (stage.releasePointerCapture) try { stage.releasePointerCapture(e.pointerId); } catch(_){}
    const hit = document.elementFromPoint(e.clientX, e.clientY); const el = hit && hit.closest ? hit.closest('.person') : null;
    if (el) select(el.dataset.p, false); else clearSel();
  }
  if (ptrs.size === 1) last = [...ptrs.values()][0];
};
stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
stage.addEventListener('wheel', e => { if (stageActions.contains(e.target)) return; e.preventDefault(); const r = stage.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, {passive: false});
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
  // A list action can come from anywhere on the sheet, so bring its branch into view.
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
/* ===== Релиз 2: режим «фокус» — раскладка вокруг выбранного человека прямо в браузере ===== */
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

/* --- потомки: «аккуратное дерево» по ширинам поддеревьев --- */
function unitOf(p) {
  const fs = famsSorted(p), sp = fs.map(f => otherParentIn(f, p));
  let m;
  if (!fs.length) m = [p];
  else if (fs.length === 1) m = sp[0] ? (isM(p) ? [p, sp[0]] : [sp[0], p]) : [p];
  else { m = []; if (sp[0]) m.push(sp[0]); m.push(p); sp.slice(1).forEach(s => s && m.push(s)); }
  return {p, m, fs};
}
function mergeCont(A, B, off) {           // B сдвинут на off
  const out = A.map(v => v.slice());
  B.forEach(([l, r], k) => { const L_ = l + off, R_ = r + off;
    if (!out[k]) out[k] = [L_, R_]; else out[k] = [Math.min(out[k][0], L_), Math.max(out[k][1], R_)]; });
  return out;
}
function sepCont(A, B, g0, g) {           // минимальный сдвиг B, чтобы не налезал на A
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
      // шашечка: дети в два яруса со сдвигом на полкарточки
      kids.forEach((k, i) => { k.off = i * STEP; k.lvl = i % 2; });
      const w = (kids.length - 1) * STEP + CW;
      u.blocks.push({f, kids, cont: [[-PADF, w + PADF]], chk: true});
      return;
    }
    // упаковка детей одной пары по контурам
    let cont = null;
    kids.forEach(k => {
      if (!cont) { k.off = 0; cont = k.cont.map(v => v.slice()); return; }
      k.off = sepCont(cont, k.cont, IG, AGAP);
      cont = mergeCont(cont, k.cont, k.off);
    });
    cont[0] = [cont[0][0] - PADF, cont[0][1] + PADF];     // серая рамка
    u.blocks.push({f, kids, cont});
  });
  // упаковка семей (несколько браков)
  let kc = null;
  u.blocks.forEach(b => {
    if (!kc) { b.off = 0; kc = b.cont.map(v => v.slice()); return; }
    b.off = sepCont(kc, b.cont, FG - 2 * PADF, AGAP);
    kc = mergeCont(kc, b.cont, b.off);
  });
  u.cont = [[0, u.uw]];
  if (kc) {
    // центр ряда детей — под центром пары
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

/* --- предки: родословная вверх с контурами (Рейнгольд–Тилфорд) --- */
function ancFam(f, depth) {
  // возвращает {cards:[[id,x,d]], cont:[[l,r]]} относительно точки, где стоит ребёнок (x = 0), d — глубина вверх (1 = родители)
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
  // братья и сёстры
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
    // единоутробные / единокровные братья и сёстры — в соседней рамке, со стороны общего родителя
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
    // предки
    const A = ancFam(pf, 1);
    A.cards.forEach(([q, x, d]) => { L.pos[q] = {x: center + x, row: -d, lvl: 0}; L.blood.add(q); });
    A.cards.forEach(([q]) => { const f2 = parentFam[q]; if (f2) L.fams.add(f2); });
  }
  // роли супругов «со стороны»
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
  // родство относительно выбранного человека
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
  // высоты рядов: ряд с шашечкой выше на одну карточку
  const rowsAll = [...new Set(Object.values(L.pos).map(v => v.row))].sort((a, b) => a - b);
  const extra = {}; Object.values(L.pos).forEach(v => { if (v.lvl) extra[v.row] = 1; });
  const ry = {}; let yy = 0;
  rowsAll.forEach(r => { ry[r] = yy; yy += ROWH + (extra[r] ? CH + 16 : 0); });
  Object.values(L.pos).forEach(v => { v.y = ry[v.row] + v.lvl * (CH + 16); });
  // перенос в координаты полной схемы: выбранный человек остаётся на своём месте
  const c0 = posInView(id), dx = c0.x - L.pos[id].x, dy = c0.y - L.pos[id].y;
  Object.values(L.pos).forEach(v => { v.x += dx; v.y += dy; });
  L.dy = dy; L.dx = dx;
  return L;
}

/* --- рисование --- */
const CARD_FONT = 'system-ui, sans-serif';
const cardMeasure = document.createElement('canvas').getContext('2d');
// возраст: если известны и рождение, и смерть
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
// крупная подпись для отдалённой схемы: только фамилия и имя
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
function mmGo(e) {                          // нажатие на миникарту — туда и переместиться
  const s_ = document.getElementById('mmS'), b = s_.getBoundingClientRect(), vb = s_.viewBox.baseVal;
  const ux = (e.clientX - b.left) / b.width * vb.width, uy = (e.clientY - b.top) / b.height * vb.height;
  const cx = MM.x + (ux - MM.ox) / MM.k, cy = MM.y + (uy - MM.oy) / MM.k, r = stage.getBoundingClientRect();
  st.x = r.width / 2 - cx * st.s; st.y = r.height / 2 - cy * st.s; apply();
}
function cardText(text, y, preferredSize, className, weight = 400) {
  if (!text) return '';
  const inset = 17, available = CW - inset - 9;
  cardMeasure.font = `${weight} ${preferredSize}px ${CARD_FONT}`;
  const measured = cardMeasure.measureText(text).width;
  const size = measured > available ? preferredSize * available / measured : preferredSize;
  return `<text class="${className}" x="${inset}" y="${y}" font-size="${size.toFixed(2)}" font-weight="${weight}">${esc(text)}</text>`;
}
function baseSVG(id) {
  const person = D.people[id], c = person.card;
  const given = person.given || '';
  const label = /^(?:\(|Имя неизвестно$|Сын |Мать )/.test(given);
  const [first, ...rest] = given.split(/\s+/);
  const name = (label ? given : first) || person.name;
  const patronymic = label ? '' : rest.join(' ');
  const surname = given && person.name.endsWith(given)
    ? person.name.slice(0, -given.length).trim() : '';
  const shortSurname = surname.split(' (')[0];
  const dates = pDates(id);
  const years = dates.split(' – ').map(date => {
    const year = date.match(/\d{4}/)?.[0];
    return year ? (/^(?:~|ок\.)/.test(date) ? '~' : '') + year : '';
  }).filter(Boolean).join('–');
  const fill = person.sex === 'M' ? 'node-man' : person.sex === 'F' ? 'node-woman' : 'node-neutral';
  const outline = person.status === 'doc' ? ' node-archive' : '';
  const age = ageOf(id);
  const overview =
    cardText(name, 30, 19, 'node-name', 700) +
    cardText(shortSurname, 49, 13, 'node-family') +
    cardText(years, 70, 11.5, 'node-fact');
  const details =
    cardText(name, 23, 19, 'node-name', 700) +
    cardText(surname, 37, 12, 'node-family') +
    cardText(patronymic, 49, 11, 'node-family') +
    cardText(dates, 65, 10.5, 'node-fact') +
    cardText(age, 76, 9, 'node-fact');
  return `<rect class="node-surface ${fill}${outline}" width="${CW}" height="${CH}" rx="8" stroke-width="${c.lw}"${c.dash ? ' stroke-dasharray="3 2"' : ''}/>` +
    `<rect class="node-clan" x="5" y="9" width="7" height="${CH - 18}" rx="3" fill="${c.strip}"/>` +
    `<g class="cp">${overview}</g><g class="dt">${details}</g>`;
}
function underSVG(roleTxt) { return ''; }  // подложка теперь рисуется в слое рамок, под линиями
function roleBox(x, y, roleTxt) {          // подложка «жена/муж»: белая, но под линиями брака
  return `<g transform="translate(${x},${y})">` + roleSVG(roleTxt) + '</g>';
}
function roleSVG(roleTxt) {
  return roleTxt ? `<rect class="tree-spouse-frame" x="-4" y="-13" width="${CW + 8}" height="${CH + 17}" rx="6" fill="#fff" stroke="#9a9a9a" stroke-width="0.8" stroke-dasharray="3 2"/><text class="role-label" x="0" y="-5" font-size="7.5" fill="#888">${esc(roleTxt)}</text>` : '';
}
function overSVG(p, relTxt) {              // подпись родства — поверх
  return cardText(relTxt, ageOf(p) ? 84 : 78, 8.5, 'node-relation', 650);
}
function mkG(cls, html) { const g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', cls); g.innerHTML = html; return g; }
function setLayer(card, cls, html) {       // плавная смена слоя: старый гаснет, новый проявляется
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
  // уровни шин: семьи, чьи линии к детям в одном промежутке перекрываются, — на разной высоте
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
    // другой брак кого-то из супругов тоже на экране?
    const otherShown = far && pr.some(z => (famsOf[z] || []).some(f2 => f2 !== f && [D.fams[f2].h, D.fams[f2].w].some(w => w && w !== z && L.pos[w])));
    if (far && !otherShown) {
      // супруги разнесены предками: оба спускаются к общей линии под рядом, от неё — к детям
      const yb = P0[0].y + CH + 16 + (lane[f] || 0) * 6;
      const xa = P0[0].x + CW / 2, xb = P0[1].x + CW / 2;
      ln(xa, P0[0].y + CH, xa, yb, c, false); ln(xb, P0[1].y + CH, xb, yb, c, false); ln(xa, yb, xb, yb, c, false);
      const km = ks.map(k => L.pos[k].x + CW / 2), kc = (Math.min(...km) + Math.max(...km)) / 2;
      xc = Math.max(xa, Math.min(xb, kc)); y0 = yb;
      col += `<circle cx="${xc.toFixed(1)}" cy="${y0.toFixed(1)}" r="2.4" fill="${c}"/>`;
    } else if (far) {
      // супруги стоят не рядом (несколько браков): линия к детям идёт прямо от жены/мужа этого брака
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

/* --- анимация: карточки переезжают, линии и рамки проявляются --- */
const T = 650;
const MINZ = 1.15;  // меньше — текст карточек мелковат
let backG = null, cardsG = null, timer = null;
function setT(el, x, y) { el.style.transform = `translate(${x}px,${y}px)`; }
function focusOn(id) {
  clearTimeout(timer);
  const L = focusLayout(id);
  const ids = Object.keys(L.pos);
  const entering = !focusId;
  fullL.style.opacity = '0'; fullL.style.pointerEvents = 'none'; if (chipsG) chipsG.style.display = 'none';
  fullL.querySelectorAll('.person').forEach(g => { g.style.transition = 'none'; g.style.opacity = '0'; });
  // старое — убрать
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
  // приближение: читаемый масштаб (текст карточек виден), в кадре — человек, его родители, супруги и дети
  const pp = D.people[id];
  const core = [id, ...(pp.par || []), ...(pp.sp || []), ...otherParentsOf(id), ...(pp.kids || [])].filter(p => L.pos[p]);
  const xs = core.map(p => L.pos[p].x), ys = core.map(p => L.pos[p].y);
  const x1 = Math.min(...xs) - 20, y1 = Math.min(...ys) - 50, x2 = Math.max(...xs) + CW + 20, y2 = Math.max(...ys) + CH + 30;
  animView(() => {
    const r = stage.getBoundingClientRect();
    let s_ = Math.min((r.width - 40) / (x2 - x1), (r.height - 40) / (y2 - y1));
    s_ = Math.max(MINZ, Math.min(1.7, s_));
    const c = L.pos[id];
    // если всё ближнее влезает — центр ближнего круга, иначе — сам человек чуть выше центра
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
    setTimeout(() => {          // карточка доехала — показываем «родную» и убираем летевшую
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


/* ===== Свёрнутые рода: заранее рассчитанные виды для каждого сочетания раскрытых групп ===== */
let VIEWS = null, VIEW = null, MASK = 0, BMASK = 0, viewBackG = null, viewCardsG = null, chipsG = null, ANCH = {};
// MASK — раскрытые рода (биты VIEWS.groups), BMASK — раскрытые ветви потомков (биты VIEWS.branches).
// Смешанные состояния вычисляются независимо, без раскрытия остальных ветвей.
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
    st.x = x - st.s * node.target.x;
    st.y = y - st.s * node.target.y;
    apply();
    macroZoomFrame = time < 1 ? requestAnimationFrame(draw) : 0;
  };
  draw(begin);
}

function nearestMacro(x, y, detailed = false) {
  let closest, distance = Infinity;
  for (const node of overviewLayout?.nodes ?? []) {
    const point = detailed ? {x: st.x + node.target.x * st.s, y: st.y + node.target.y * st.s} : macroPoint(node);
    const d = Math.hypot(x - point.x, y - point.y);
    if (d < distance) { closest = node; distance = d; }
  }
  return closest;
}

function paintMacro() {
  ensureOverview();
  if (!overviewLayout) return;
  const {clientWidth, clientHeight} = stage;
  const scale = overviewScale();
  const w = overviewLayout.width * scale, h = overviewLayout.height * scale;
  if (macroFitted) {
    const {x, y} = macroFit();
    macroOffset = {x, y};
  } else if (!macroOffset) {
    macroOffset = {x: (clientWidth - w) / 2, y: 12};
  }
  if (!macroFitted && st.s <= BLEND_END && !macroZoomFrame) {
    const clamp = (value, size, viewport, endPad) => {
      const a = viewport - size - endPad;
      return Math.max(Math.min(a, 12), Math.min(Math.max(a, 12), value));
    };
    macroOffset.x = clamp(macroOffset.x, w, clientWidth, 12);
    macroOffset.y = clamp(macroOffset.y, h, clientHeight, 60);
  }
  macroPlane.classList.toggle('macro-map', scale < 0.33);
  macroPlane.style.transform = 'translate(' + macroOffset.x + 'px,' + macroOffset.y + 'px) scale(' + scale + ')';
}

function queueOverview() {
  if (st.s >= BLEND_START || overviewFrame) return;
  overviewFrame = requestAnimationFrame(() => {
    overviewFrame = 0;
    if (st.s >= BLEND_START) return;
    if (macroFitted) fitAll();
    else paintMacro();
  });
}

new ResizeObserver(queueOverview).observe(stage);

// язычок под карточкой (или справа от неё): цвет рода, большая зона нажатия
function tabSVG(attr, x, y, w, h, label, sub, col, open, side) {
  const r = 9, fs = Math.min(9, (w - 14) / (label.length * 0.6));
  const d = side ? `M${x},${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} Z`
    : `M${x},${y} H${x + w} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} Z`;
  const tc = open ? col : '#ffffff', ty = sub ? y + h / 2 - 1.5 : y + h / 2 + fs * 0.36;
  return `<g class="chip" ${attr} style="cursor:pointer"><rect x="${x - 8}" y="${y - (side ? 8 : 2)}" width="${w + 16}" height="${h + (side ? 16 : 12)}" fill="transparent"/>` +
    `<path class="tb" d="${d}" fill="${open ? '#ffffff' : col}" stroke="${col}" stroke-width="${open ? 1.4 : 0}"/>` +
    `<text x="${x + w / 2}" y="${ty}" font-size="${fs.toFixed(1)}" font-weight="bold" text-anchor="middle" fill="${tc}">${esc(label)}</text>` +
    (sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 9}" font-size="7.5" text-anchor="middle" fill="${tc}" opacity=".9">${esc(sub)}</text>` : '') + '</g>';
}
const ppl = n => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'человека' : 'человек';
const BRCOL = '#8a7560';
function grpCol(mem) { const p = mem.find(q => D.people[q]); return p ? D.people[p].card.strip : '#666'; }
function branchControls(v) {
  const controls = [];
  const countNew = w => Object.keys(w.cards).filter(p => !v.cards[p]).length;
  VIEWS.groups.forEach(([, spouse, title, members], index) => {
    const anchor = spouse || 'I35';
    if (!v.cards[anchor] || !members.some(p => D.people[p])) return;
    const open = MASK >> index & 1;
    controls.push({group: true, side: !spouse, anchor, title, index, open, color: grpCol(members),
      count: open ? 0 : countNew(viewOf(MASK | 1 << index, BMASK))});
  });
  VIEWS.branches.forEach(([anchor, title], index) => {
    if (!v.cards[anchor]) return;
    const open = BMASK >> index & 1;
    controls.push({group: false, side: false, anchor, title, index, open, color: BRCOL,
      count: open ? 0 : countNew(viewOf(MASK, BMASK | 1 << index))});
  });
  return controls;
}
function chipsHTML(v) {
  let s = '';
  const under = (a, attr, label, sub, col, open) => {
    const [cx, cy] = v.cards[a], w = CW - 6, h = sub ? 30 : 20;
    s += tabSVG(attr, cx + 3, cy + CH, w, h, label, sub, col, open, false);
  };
  for (const {group, side, anchor, title, index, open, count, color} of branchControls(v)) {
    const attr = `data-${group ? 'g' : 'b'}="${index}"`;
    const label = open ? group ? '− свернуть' : '− свернуть потомков' : `＋ ${title}`;
    const sub = open ? '' : `${count} ${ppl(count)}`;
    if (side) {
      const [cx, cy] = v.cards[anchor];
      s += tabSVG(attr, cx + CW + 16, cy + CH / 2 - 17, 120, 34, label, sub, color, open, true);
    } else under(anchor, attr, label, sub, color, open);
  }
  return s;
}
function renderView(mask, bmask, anchorId) {
  const old = VIEW, oldA = anchorId && old ? posIn(old, anchorId) : null;
  MASK = mask; BMASK = bmask; VIEW = viewOf(mask, bmask); W = VIEW.W; H = VIEW.H;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
  if (viewBackG) { const b = viewBackG; b.style.opacity = '0'; setTimeout(() => b.remove(), 400); }
  viewBackG = mkG('viewBack fx', backHTML(VIEW)); viewBackG.style.opacity = old ? '0' : '1';
  placeFamilyCaptions(viewBackG);
  fullL.insertBefore(viewBackG, viewCardsG);
  const keep = new Set(Object.keys(VIEW.cards));
  viewCardsG.querySelectorAll('.person').forEach(g => {
    if (keep.has(g.dataset.p)) return;
    const a = posInView(g.dataset.p); setT(g, a.x, a.y); g.style.opacity = '0'; setTimeout(() => { if (!VIEW.cards[g.dataset.p]) g.remove(); }, T);
  });
  Object.keys(VIEW.cards).forEach(p => {
    let g = viewCardsG.querySelector(`.person[data-p="${p}"]`);
    if (!g) {
      g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', 'person fc vc'); g.dataset.p = p;
      g.appendChild(mkG('base', baseSVG(p)));
      const a = old ? posIn(old, p) : posInView(p); setT(g, a.x, a.y);
      if (old) g.style.opacity = '0';
      viewCardsG.appendChild(g);
    }
    setLayer(g, 'under', underSVG(VIEW.roles[p] || ''));
  });
  chipsG.innerHTML = chipsHTML(VIEW);
  updAllBtn(); rebuildOverview(); mmContent();
  if (!old) return;
  void viewCardsG.getBoundingClientRect();
  requestAnimationFrame(() => {
    viewCardsG.querySelectorAll('.person').forEach(g => { if (!keep.has(g.dataset.p)) return; const a = posInView(g.dataset.p); setT(g, a.x, a.y); g.style.opacity = '1'; });
    const b = viewBackG; setTimeout(() => { b.style.opacity = '1'; }, T * 0.6);
  });
  if (oldA) {                       // нажатая точка остаётся на том же месте экрана
    const na = posInView(anchorId);
    animView(() => { st.x -= (na.x - oldA.x) * st.s; st.y -= (na.y - oldA.y) * st.s; apply(); });
  }
}
// Each control changes only its own visibility bit.
function toggleGroup(i) {
  const g = VIEWS.groups[i];
  renderView(MASK ^ (1 << i), BMASK, g[1] || 'I35');
}
function toggleBranch(j) {
  renderView(MASK, BMASK ^ (1 << j), VIEWS.branches[j][0]);
}
function updAllBtn() {
  const all = allBranchesOpen();
  allButton.textContent = all ? 'Свернуть всё' : 'Раскрыть всё';
  expandBranches.disabled = all;
  collapseBranches.disabled = !MASK && !BMASK;
}

/* --- легенда родов: численность и фокус на роду --- */
let CLAN = null;
function buildLegend() {
  const cnt = new Map();
  Object.entries(D.people).forEach(([id, p]) => { const t = p.card.stripT; if (!t) return;
    const o = cnt.get(t) || {n: 0, col: p.card.strip, ids: []}; o.n++; o.ids.push(id); cnt.set(t, o); });
  const nav = document.getElementById('legend');
  const sorted = [...cnt.entries()].sort((a, b) => b[1].n - a[1].n);
  nav.innerHTML = sorted.map(([t, o]) =>
    `<button data-clan="${esc(t)}" aria-pressed="false" title="Показать род на схеме"><i style="background:${o.col}"></i>${esc(t)} <b>${o.n}</b></button>`
  ).join('');
  const choose = e => {
    const button = e.target.closest('[data-clan]');
    if (!button) return;
    if (clanDialog.open) clanDialog.close();
    const t = button.dataset.clan;
    if (CLAN === t) clanOff();
    else clanOn(t, cnt.get(t).ids);
  };
  nav.onclick = clanList.onclick = choose;
  document.getElementById('clanToggle').onclick = () => {
    zoomMenu.open = false;
    clanList.innerHTML = sorted.map(([title, {n, col}]) =>
      `<button type="button" data-clan="${esc(title)}" aria-pressed="${CLAN === title}"><i style="--branch-color:${col}" aria-hidden="true"></i><span>${esc(title)}<small>${n} ${ppl(n)}</small></span><b aria-hidden="true">${CLAN === title ? '✓' : '›'}</b></button>`
    ).join('');
    clanDialog.showModal();
  };
}
function clanOn(t, ids) {
  clearSel(); clanOff();
  let m = MASK, b = BMASK;
  // Include the anchors needed to reach the selected people.
  const needed = new Set(ids);
  for (const p of needed) {
    VIEWS.groups.forEach(([, anchor, , members], i) => {
      if (!members.includes(p)) return;
      m |= 1 << i;
      if (anchor) needed.add(anchor);
    });
    VIEWS.branches.forEach(([anchor, , members], i) => {
      if (!members.includes(p)) return;
      b |= 1 << i;
      needed.add(anchor);
    });
  }
  if (m !== MASK || b !== BMASK) renderView(m, b);
  CLAN = t; rebuildOverview(); const on = new Set(ids);
  svg.classList.add('clan');
  viewCardsG.querySelectorAll('.person').forEach(g => g.classList.toggle('on', on.has(g.dataset.p)));
  document.querySelectorAll('#legend button').forEach(x => {
    const active = x.dataset.clan === t;
    x.classList.toggle('on', active);
    x.setAttribute('aria-pressed', active);
  });
  const vis = ids.filter(p => VIEW.cards[p]);
  if (!vis.length) return;
  const xs = vis.map(p => VIEW.cards[p][0]), ys = vis.map(p => VIEW.cards[p][1]);
  const x1 = Math.min(...xs) - 30, y1 = Math.min(...ys) - 40, x2 = Math.max(...xs) + CW + 30, y2 = Math.max(...ys) + CH + 40;
  setTimeout(() => animView(() => fitBox(x1, y1, x2 - x1, y2 - y1, 20)), 30);
}
function clanOff() {
  if (!CLAN) return; CLAN = null; rebuildOverview();
  svg.classList.remove('clan');
  viewCardsG.querySelectorAll('.person.on').forEach(g => g.classList.remove('on'));
  document.querySelectorAll('#legend button.on').forEach(x => {
    x.classList.remove('on');
    x.setAttribute('aria-pressed', false);
  });
}

/* --- история изменений --- */
const CHANGES = [
  ['2.10.30', 'Ноябрь 2026', ['Средний и дальний виды плавно сменяют друг друга. Команда «Вписать схему» показывает всё раскрытое древо на телефоне и компьютере.']],
  ['2.10.29', 'Ноябрь 2026', ['На дальнем масштабе семьи показаны компактными плашками с индикаторами детей. Подписи групп разведены с линиями, а связь между супругами стала заметнее на среднем масштабе.']],
  ['2.10.28', 'Ноябрь 2026', ['Увеличена метка рода, осветлены карточки и улучшена группировка детей одной семьи.']],
  ['2.10.27', 'Ноябрь 2026', ['Цветная метка рода возвращена на левый край карточки. Упрощено расположение подписей.']],
  ['2.10.26', 'Ноябрь 2026', ['Добавлен дальний масштаб с читаемыми названиями семей. На карточках выделена строка дат и обновлена метка рода.']],
  ['2.10.25', 'Ноябрь 2026', ['Усилены голубая и сливочная заливки карточек, границы и метки рода. Фон семейных групп стал спокойнее.']],
  ['2.10.24', 'Ноябрь 2026', ['На телефоне и компьютере карточки на схеме оформлены в сливочных и голубых тонах с крупными именами и цветной меткой рода.']],
  ['2.10.23', 'Ноябрь 2026', ['Сокращён заголовок сайта. Развёрнутые ветви выделены в списке, который остаётся открытым при выборе нескольких ветвей.']],
  ['2.10.22', 'Ноябрь 2026', ['На телефоне команды для всех ветвей перенесены в список «Ветви», а инструкция открывается кнопкой «?».']],
  ['2.10.21', 'Ноябрь 2026', ['В мобильной версии выбор рода вынесен в отдельную кнопку «Роды» внизу схемы.']],
  ['2.10.20', 'Ноябрь 2026', ['На телефоне добавлены кнопки масштаба, список ветвей с крупными кнопками и полноэкранный режим карточки.']],
  ['2.10.19', 'Ноябрь 2026', ['Васса Новикова перенесена в семью Ивана Гавриловича и Евдокии Тимофеевны. Уточнено отчество.']],
  ['2.10.18', 'Ноябрь 2026', ['Во всей истории версий указан месяц выпуска: ноябрь 2026 года.']],
  ['2.10.17', 'Ноябрь 2026', ['Уточнены семейные связи Бычиных. В ветку Логиновых добавлен Егор, сын Александра и Светланы.']],
  ['2.10.16', 'Ноябрь 2026', ['Уточнена заметка о годе рождения Ксении Матвеевны Левкиной.']],
  ['2.10.15', 'Ноябрь 2026', ['Добавлены даты браков и сведения о смерти из архивных выписок. Разночтения отмечены в карточках.']],
  ['2.10.14', 'Ноябрь 2026', ['Уточнены связи детей с единственными известными супругами родителей и добавлены недостающие отчества.']],
  ['2.10.13', 'Ноябрь 2026', ['Добавлены отчества и даты по надписям на надгробиях Нины Бычиной, Николая и Владимира Огуля.']],
  ['2.10.12', 'Ноябрь 2026', ['Нина Бычина указана матерью обоих детей Михаила Павловича. В карточках жён с неизвестной фамилией указаны фамилии по мужу.']],
  ['2.10.11', 'Ноябрь 2026', ['Уточнены имена, даты, места и семейные связи. При отдалении скрываются подписи родства.']],
  ['2.10.10', 'Ноябрь 2026', ['Добавлены потомки Надежды Николаевны и семейные сведения о Петре Николаевиче и его матери.']],
  ['2.10.9', 'Ноябрь 2026', ['Уточнена запись о семейном предании происхождения Новиковых с Дона.']],
  ['2.10.8', 'Ноябрь 2026', ['Сведения об обстоятельствах смерти из выписок и схемы эксперта добавлены в заметки со ссылками на источники.']],
  ['2.10.7', 'Ноябрь 2026', ['Восстановлены три семейные заметки в ветке Шестаковых.']],
  ['2.10.6', 'Ноябрь 2026', ['Порядок карточек в каждом ряду сохраняется при раскрытии родов и ветвей.']],
  ['2.10.3', 'Ноябрь 2026', ['Рода и ветви потомков раскрываются независимо. Счётчики показывают число карточек, которые появятся по нажатию.']],
  ['2.10.2', 'Ноябрь 2026', ['Сайт разделён на HTML, CSS, JavaScript и JSON. Публикация напрямую, без сборки.']],
  ['2.10.1', 'Ноябрь 2026', ['Карточка человека: все разделы открываются свёрнутыми; архивные документы — сразу под плашкой; фотография — маленькая в плашке, по нажатию открывается на весь экран.', 'На телефоне при открытии схема опущена: сверху видны предки, снизу — дети, без пустоты внизу.']],
  ['2.10.0', 'Ноябрь 2026', ['Карточка человека: сверху — плашка в цвет рода с именем, годами жизни и возрастом; разделы (родители, супруги, дети, братья и сёстры, крещение, документы, события, заметки) сворачиваются, открытые запоминаются.', 'Крупные подписи издалека: имя крупно, фамилия под ним, годы жизни внизу.', 'На телефоне схема открывается чуть дальше.']],
  ['2.9.0', 'Ноябрь 2026', ['При отдалении на карточках остаются только крупные фамилия и имя — схему можно читать и издалека; при приближении возвращаются даты и отчества.', 'Миникарта в углу: показывает, какая часть схемы на экране; нажмите или ведите по ней, чтобы перейти.', 'На телефоне схема открывается сразу крупно — на Николае Долматовиче и Ефросинье.']],
  ['2.8.3', 'Ноябрь 2026', ['Уточнено: Елена Алексеевна Баранова родилась 21.04.1999; фамилия Арнольда и Виктора — Лапины (без «скорее всего»).']],
  ['2.8.2', 'Ноябрь 2026', ['Линии под карточками опущены чуть ниже, чтобы язычки «＋ род» их не закрывали.']],
  ['2.8.1', 'Ноябрь 2026', ['В фокусе: если муж и жена разнесены своими предками далеко друг от друга, оба теперь соединены линией с детьми (например, Николай Долматович и Ефросинья над Таисией).']],
  ['2.8.0', 'Ноябрь 2026', ['На карточках — сколько прожил человек, если известны даты рождения и смерти; у младенцев — в месяцах или днях, при неточных датах — «~».']],
  ['2.7.2', 'Ноябрь 2026', ['Скрытая карточка снова раскрывается, когда выбираешь другого человека.']],
  ['2.7.1', 'Ноябрь 2026', ['На полоске карточки — заметная кнопка «скрыть / показать» со стрелкой.', 'На компьютере карточку тоже можно скрыть: она сворачивается в узкую полоску справа, нажатие снова открывает её.']],
  ['2.7.0', 'Ноябрь 2026', ['Телефон: карточку человека можно свернуть в полоску со стрелкой — схема остаётся на виду, нажатие на полоску снова открывает карточку.', 'Телефон: верхнее меню стало компактным — название, поиск и кнопка ☰; рода и кнопки открываются по ней.']],
  ['2.6.3', 'Ноябрь 2026', ['Пунктирная рамка «муж/жена» осталась белой, но теперь лежит под линиями — линия брака видна целиком.']],
  ['2.6.2', 'Ноябрь 2026', ['Если супруги стоят не рядом, а дети — под линией их брака, линия к детям спускается прямо над ними: меньше изломов и пересечений (например, у Павла).']],
  ['2.6.1', 'Ноябрь 2026', ['Братья и сёстры от разных отцов или матерей стоят рядом: Павел — вплотную к Данилу и Марии; Порсевы — справа от Елены, Александр Юрьевич — слева.', 'В фокусе на человеке видны и братья и сёстры по матери или по отцу — в соседней рамке, с подписью «брат по матери».']],
  ['2.6.0', 'Ноябрь 2026', ['Новая семья — Порсевы: второй муж Елены Александр Васильевич Порсев, его родители Василий и Устинья Андреевна, сёстры Татьяна и Ирина, брат Пётр с детьми; Черёмухины. Данил и Мария — дети Елены и Александра Порсева (фамилия у них Железняк).', 'Порсевы раскрываются вместе с ветвью Таисии.']],
  ['2.5.0', 'Ноябрь 2026', ['Фамилии и отчества, которых не было в исходных записях, выведены по родителям: фамилия — по отцу (если отца нет — по фамилии матери по мужу), отчество — по имени отца. В заметках человека отмечено, что это выведено.', 'На язычке ветви — сумма: сама ветвь и все свёрнутые рода внутри неё (у Таисии — вместе с Логиновыми, Шестаковыми и Железняками).']],
  ['2.4.1', 'Ноябрь 2026', ['На язычке свёрнутой части — сколько карточек появится именно по этому нажатию; вложенные рода внутри ветви считаются на своих язычках.', 'Убраны кнопки «Всё», «+» и «−»: масштаб — колёсиком и жестами, весь лист — кнопкой «Раскрыть всё».', 'Виктор Арнольдович — Лапин; добавлен его отец Арнольд Лапин.']],
  ['2.4.0', 'Ноябрь 2026', ['Линия Логиновых расширена по таблице родных: Иван Михайлович (пчеловод из д. Вашутино), его сыновья Владимир, Пётр и Илья с детьми и внуками; Глазырины, Барановы, Шевчук, Ноздрюхины, Бузиловы.', 'Новый род — Шестаковы: родители Елены Алексеевны Логиновой, её сёстры и брат Ефим с семьёй.', 'Уточнены даты Владимира Ильича Логинова (29.12.1948 – 30.05.1993) и его родителей.', 'Свёрнутый род Логиновых теперь — 54 человека.']],
  ['2.3.1', 'Ноябрь 2026', ['В заголовке — сколько всего человек на схеме.', 'Неизвестная дата смерти больше не показывается как «– ?»: остаётся только дата рождения.', 'Карточка Павла больше не выделяется жирным — на схеме все равны.', 'Крёстная Любови Глаголько — Евгения Безолуцких (со слов родных).']],
  ['2.3.0', 'Ноябрь 2026', ['Под заголовком снова легенда родов, теперь с числом людей; нажатие на род раскрывает и показывает его, остальных приглушает.',
    'Большие ветви внуков Николая и Ефросиньи (потомки Таисии, Валентины, Лидии, Раисы, Михаила, Зои) свёрнуты и раскрываются по нажатию.',
    'Вместо маленьких чёрных плашек — цветные язычки под карточкой в цвет рода, в них легче попасть.',
    'Кнопка «Раскрыть всё» раскрывает и рода, и ветви.', 'Подпись автора и эта история изменений.']],
  ['2.2.0', 'Ноябрь 2026', ['Новое название: «Родословная Новиковых из деревни Чикаши».', 'Рода, из которых пришли жёны и мужья, свёрнуты; раскрываются по нажатию, нажатое место остаётся на экране.', 'Кнопка «Раскрыть все рода».']],
  ['2.1.5', 'Ноябрь 2026', ['Распутаны рамки детей: «дети: Таисья» и «дети: Валерий» поменяны местами, меньше пересечений линий.']],
  ['2.1.4', 'Ноябрь 2026', ['Текст больше не размывается при увеличении колёсиком.']],
  ['2.1.3', 'Ноябрь 2026', ['Текст остаётся чётким после перемещения схемы.']],
  ['2.1.2', 'Ноябрь 2026', ['Мягкая рамка выделения вместо ярко-красной.', 'Подписи родства исчезают плавно.', 'Цветная полоска рода со скруглёнными углами, не выходит за карточку.']],
  ['2.1.1', 'Ноябрь 2026', ['В фокусе схема крупнее — текст читается сразу.', 'Масштаб двойным тапом.', 'Выбранный человек выделен рамкой.']],
  ['2.1.0', 'Ноябрь 2026', ['Подписи родства («отец», «бабушка», «пра(3)дед»…) — относительно выбранного человека.']],
  ['2.0.1', 'Ноябрь 2026', ['Убраны золотая линия и кнопка «Моя линия»: сайт для всех родственников.', 'Плавное возвращение карточек без двойников.']],
  ['2.0.0', 'Ноябрь 2026', ['Режим фокуса: нажмите на человека — схема перестроится вокруг него, с предками, потомками, братьями и сёстрами.']],
  ['1.3.3', 'Ноябрь 2026', ['Релиз 1. Данные встроены в страницу, внешние шрифты убраны — сайт открывается без лишних загрузок.']],
  ['1.3.2', 'Ноябрь 2026', ['Девичьи фамилии на карточках.']],
  ['1.3.1', 'Ноябрь 2026', ['Поиск в любых падежах; девичьи фамилии, выведенные по отцу.']],
  ['1.3.0', 'Ноябрь 2026', ['Инструкция «Как читать схему».', 'Поиск по девичьей фамилии.']],
  ['1.2.6', 'Ноябрь 2026', ['Порядок линий, Левкины переставлены; текст на схеме не выделяется при перетаскивании.']],
  ['1.2.5', 'Ноябрь 2026', ['Родители стоят точно над детьми.']],
  ['1.2.4', 'Ноябрь 2026', ['Ветви Михаила, Зои, Лидии и Раисы подняты выше — схема уже.']],
  ['1.2.3', 'Ноябрь 2026', ['Линии обходят карточки.']],
  ['1.2.2', 'Ноябрь 2026', ['Братья Бычины в одной рамке.']],
  ['1.2.1', 'Ноябрь 2026', ['Белозеровы собраны вместе, семья Афанасия — рядом ниже.']],
  ['1.2.0', 'Ноябрь 2026', ['Братья и сёстры в карточке человека; компактные рамки.']],
  ['1.1.2', 'Ноябрь 2026', ['Распутаны жёны Гаврилы и Белозеровы.']],
  ['1.1.1', 'Ноябрь 2026', ['Прямые вертикальные линии; ветви Савелия и Бычиных — справа.']],
  ['1.1.0', 'Ноябрь 2026', ['Сканы архивных документов с расшифровками, крёстные, фотографии.']],
  ['1.0.0', 'Ноябрь 2026', ['Интерактивная схема: поиск, подсветка предков и потомков, карточка человека.']],
];
const hdr = document.querySelector('header');
document.getElementById('ver').onclick = () => {
  lb.querySelector('.box').innerHTML = `<button class="close" aria-label="Закрыть">×</button><div class="cl"><h2>История изменений</h2>
    <p class="meta">Версии — major.minor.patch: большое обновление · новая возможность · исправление.</p>` +
    CHANGES.map(([v, d, items]) => `<h3>${v}${d ? ` <small>${esc(d)}</small>` : ''}</h3><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('') + '</div>';
  lb.classList.add('open'); lb.scrollTop = 0;
};
function select(id) {
  if (!D.people[id]) return;
  clanOff();
  showPanel(id);
  focusOn(id);
}
function clearSel() {
  setReading(false);
  clanOff();
  panel.classList.remove('open');
  focusOff();
}
function chips(ids) { return ids.length ? `<div class="chips">${ids.map(i => `<button data-go="${i}">${esc(pName(i))} <small>${esc(pDates(i))}</small></button>`).join('')}</div>` : '<p class="meta">нет на схеме</p>'; }
function sibHtml(id) {
  const p = D.people[id], par = p.par || [];
  const seen = new Map();
  par.forEach(q => ((D.people[q]||{}).kids || []).forEach(k => { if (k !== id) seen.set(k, (seen.get(k) || new Set()).add(q)); }));
  if (!seen.size) return '<p class="meta">нет на схеме</p>';
  const by = id_ => { const e = D.people[id_].lines.join(' ').match(/(\d{4})/); return e ? +e[1] : 9999; };
  const list = [...seen.entries()].sort((a, b) => by(a[0]) - by(b[0]));
  return `<div class="chips">${list.map(([k, ps]) => { const half = par.length > 1 && ps.size < par.length;
    const via = half ? (D.people[[...ps][0]].sex === 'M' ? ' · по отцу' : ' · по матери') : '';
    return `<button data-go="${k}">${esc(pName(k))} <small>${esc(pDates(k))}${via}</small></button>`; }).join('')}</div>`;
}
function godHtml(p) {
  const a = (p.godp || []).map(g => `<p class="god">Крёстный(ая): ${g.id ? `<button class="chipx" data-go="${g.id}">${esc(pName(g.id))}</button>` : esc(g.name)}${g.y ? ' — ' + esc(g.y) : ''}${g.unsure ? ' (прочтение неуверенное)' : ''}</p>`).join('');
  const b = (p.godc || []).map(g => `<p class="god">Крестил(а): <button class="chipx" data-go="${g.id}">${esc(pName(g.id))}</button>${g.y ? ' — ' + esc(g.y) : ''}${g.unsure ? ' (прочтение неуверенное)' : ''}</p>`).join('');
  return a || b ? `<h3>Крещение</h3>${a}${b}` : '';
}
const lb = document.getElementById('lb');
function openDoc(d) {
  const o = D.docs[d];
  lb.querySelector('.box').innerHTML = `<button class="close" aria-label="Закрыть">×</button><h2>${esc(o.title)}</h2>
    <p class="meta">${esc(o.fond)}; unit ${esc(o.unit)}, кадр ${esc(o.frame)} · <a href="${o.url}" target="_blank" rel="noopener">дело на сайте архива</a></p>
    <img src="${o.img}" alt="${esc(o.title)}"><p><b>Расшифровка.</b> ${esc(o.text)}</p>${o.note ? `<p class="meta">Примечание: ${esc(o.note)}</p>` : ''}
    <h3>Упомянуты на схеме</h3><div class="chips">${o.who.filter(w => D.people[w]).map(w => `<button data-go="${w}">${esc(pName(w))}</button>`).join('')}</div>`;
  lb.classList.remove('img'); lb.classList.add('open'); lb.scrollTop = 0;
}
document.getElementById('help').onclick = () => {
  lb.querySelector('.box').innerHTML = document.getElementById('helpT').innerHTML;
  lb.classList.add('open'); lb.scrollTop = 0;
};
lb.addEventListener('click', e => {
  if (e.target === lb || e.target.closest('.close') || lb.classList.contains('img')) { lb.classList.remove('open', 'img'); return; }
  const b = e.target.closest('[data-go]'); if (b) { lb.classList.remove('open'); select(b.dataset.go); }
});
function showPanel(id) {
  const p = D.people[id];
  const otherParents = otherParentsOf(id);
  const ev = p.events.filter(e => e.d || e.n || e.pl).map(e => `<div class="ev"><b>${esc(e.t)}${e.d ? ': ' + esc(e.d) : ''}</b>${e.pl ? '<br>' + esc(e.pl) : ''}${e.n ? '<br>' + linkify(e.n) : ''}${e.s ? `<div class="s">${esc(e.s)}${e.pg ? ' · ' + esc(e.pg) : ''}</div>` : ''}</div>`).join('');
  const mar = p.marr.map(m => `<div class="ev"><b>брак${m.d ? ': ' + esc(m.d) : ''}</b> — с ${esc(pName(m.with))}${m.n ? '<br>' + esc(m.n) : ''}${m.s ? `<div class="s">${esc(m.s)}</div>` : ''}</div>`).join('');
  const short = p.lines.filter(t => !/\d{4}|^~|^\?/.test(t) && t !== p.kin && t !== '2-я жена Николая').join(' ');
  panel.innerHTML = `<div class="grab"><button class="tg" aria-label="Свернуть или развернуть карточку"><span>${esc(short)}</span><em class="hd"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><b class="h1t">скрыть</b><b class="h2t">показать</b></em></button><button class="panel-mode" type="button"><span class="reading-enter">На весь экран</span><span class="reading-exit">‹ К схеме</span></button><button class="x close" aria-label="Закрыть">×</button></div><button class="close" aria-label="Закрыть">×</button>
    ${plateHtml(id)}
    ${p.est ? `<p class="meta">Год рождения ~${p.est} — примерная оценка по родным.</p>` : ''}
    ${(p.docs || []).length ? sec('docs', 'Архивные документы', p.docs.length, `<div class="docs">${p.docs.map(d => { const o = D.docs[d]; return `<button class="doc" data-doc="${d}"><img src="${o.img}" alt="" loading="lazy"><span>${esc(o.title)}<small>кадр ${esc(o.frame)} · нажмите, чтобы открыть скан</small></span></button>`; }).join('')}</div>`) : ''}
    ${sec('par', 'Родители', p.par.length, chips(p.par))}
    ${sec('sp', 'Супруги', p.sp.length, chips(p.sp))}
    ${sec('otherParents', 'Другие родители детей', otherParents.length, chips(otherParents))}
    ${sec('kids', 'Дети', p.kids.length, chips(p.kids))}
    ${(() => { const h = sibHtml(id); return sec('sib', 'Братья и сёстры', (h.match(/data-go=/g) || []).length, h); })()}
    ${godHtml(p) ? sec('god', 'Крещение', null, godHtml(p).replace('<h3>Крещение</h3>', '')) : ''}
    ${ev || mar ? sec('ev', 'События', null, ev + mar) : ''}
    ${p.notes.length ? sec('notes', 'Заметки', p.notes.length, `<div class="notes">${p.notes.map(n => `<p>${linkify(n)}</p>`).join('')}</div>`) : ''}`;
  PMIN = false; panel.classList.add('open'); panel.classList.remove('min'); panel.scrollTop = 0;
}
// разделы карточки — сворачиваются; какие открыты, запоминаем для следующего человека
const OPEN = new Set();            // каждый раз все разделы свёрнуты
const CHEV = '<svg class="cv" width="16" height="16" viewBox="0 0 14 14"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function sec(k, title, n, html) {
  return `<details class="sec" data-k="${k}"${OPEN.has(k) ? ' open' : ''}><summary><span>${title}</span>${n != null ? `<b>${n}</b>` : ''}${CHEV}</summary><div class="sb">${html}</div></details>`;
}
function plateHtml(id) {
  const p = D.people[id], c = p.card, ln = p.lines.filter(t => !/\d{4}|^~|^\?/.test(t) && t !== p.kin && t !== '2-я жена Николая');
  const ag = ageOf(id), st_ = p.status === 'doc' ? 'есть архивный документ' : p.status === 'oral' ? 'по преданию' : '';
  const ph = (p.photos || [])[0];
  return `<div class="plate" style="--c:${c.strip}">${ph ? `<button class="pph" data-img="${ph}" aria-label="Открыть фотографию"><img src="${ph}" alt="${esc(p.name)}" loading="lazy"></button>` : ''}<div class="pc">${esc(p.clan)}${p.role ? ' · ' + esc(p.role) : ''}</div>
    <h2>${esc(ln[0] || '')}${ln.length > 1 ? `<span>${esc(ln.slice(1).join(' '))}</span>` : ''}</h2>
    <div class="pd">${esc(pDates(id)) || 'даты неизвестны'}${ag ? ' · ' + esc(ag) : ''}</div>${st_ ? `<div class="ps">${st_}</div>` : ''}</div>`;
}
function setReading(open, moveFocus = false) {
  if (panel.classList.contains('reading') === open) return;
  const main = panel.parentElement;
  if (open) main.style.setProperty('--reading-space', `${panel.getBoundingClientRect().height}px`);
  else main.style.removeProperty('--reading-space');
  panel.classList.toggle('reading', open);
  main.classList.toggle('reading', open);
  for (const element of [stage, hdr, document.querySelector('footer')]) element.inert = open;
  if (open) {
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Карточка человека');
  } else {
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    panel.removeAttribute('aria-label');
  }
  mmView();
  if (moveFocus) panel.querySelector('.panel-mode')?.focus({preventScroll: true});
}
let PMIN = false;                         // на телефоне карточка человека может быть свёрнута в полоску
function recenter() {                     // после изменения размеров сцены выбранный человек остаётся в кадре
  if (!focusId || !curPos[focusId]) return;
  const r = stage.getBoundingClientRect(), c = curPos[focusId];
  animView(() => { st.x = r.width / 2 - (c.x + CW / 2) * st.s; st.y = r.height * 0.42 - (c.y + CH / 2) * st.s; apply(); });
}
panel.addEventListener('click', e => {
  if (e.target.closest('.panel-mode')) {
    setReading(!panel.classList.contains('reading'), true);
    return;
  }
  if (e.target.closest('.tg')) { PMIN = !PMIN; panel.classList.toggle('min', PMIN); if (!PMIN) panel.scrollTop = 0; setTimeout(recenter, 280); return; }
  if (e.target.closest('.close')) return clearSel();
  const im = e.target.closest('[data-img]'); if (im) { lb.querySelector('.box').innerHTML = `<button class="close" aria-label="Закрыть">×</button><img src="${im.dataset.img}" alt="">`; lb.classList.add('open', 'img'); return; }
  const dc = e.target.closest('[data-doc]'); if (dc) return openDoc(dc.dataset.doc);
  const b = e.target.closest('[data-go]'); if (b) select(b.dataset.go);
});

/* --- поиск --- */
const q = document.getElementById('q'), res = document.getElementById('results');
q.addEventListener('input', () => {
  const t = norm(q.value.trim()); if (t.length < 2) { res.style.display = 'none'; return; }
  const stem = w => w.length > 4 ? w.replace(/(ых|их|ой|ей|ою|ею|ие|ии|ию|ья|ью|ым|им|ом|ем|ам|ах|ы|и|а|я|у|ю|е)$/, '') : w;
  const words = t.split(/\s+/).map(stem);
  const hits = Object.entries(D.people).filter(([id, p]) => { const n = norm(p.lines.join(' ') + ' ' + (p.alt || []).join(' ')); return words.every(w => n.includes(w)); }).slice(0, 30);
  res.innerHTML = hits.length ? hits.map(([id, p]) => { const via = (p.alt || []).find(a => words.every(w => norm(a).includes(w)) && !words.every(w => norm(p.lines.join(' ')).includes(w)));
    return `<button data-go="${id}">${esc(p.name)} <small>${esc(pDates(id))}${via ? ' · также: ' + esc(via) : ''}</small></button>`; }).join('') : '<button disabled>Никого не нашлось</button>';
  res.style.display = 'block';
});
res.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { select(b.dataset.go); res.style.display = 'none'; q.blur(); } });
addEventListener('click', e => { if (!e.target.closest('.search')) res.style.display = 'none'; });

/* --- загрузка --- */
function start() {
  try {
    D = initialData;
    VIEWS = initialViews;
    document.getElementById('loading').remove();
    stage.insertAdjacentHTML('afterbegin', '<svg xmlns="http://www.w3.org/2000/svg" id="tree" font-family="DejaVu Sans, Verdana, sans-serif"></svg>');
    svg = stage.querySelector('svg'); svg.style.overflow = 'visible';
    initFocus();
    fullL = document.createElementNS(SVGNS, 'g'); fullL.id = 'fullL'; svg.insertBefore(fullL, focL);
    viewCardsG = mkG('viewCards', ''); fullL.appendChild(viewCardsG);
    chipsG = mkG('chips', ''); svg.appendChild(chipsG);
    buildAnch(); buildLegend();
    { const n = Object.keys(D.people).length, w = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'человека' : 'человек'; document.getElementById('total').textContent = `${n} ${w} на схеме · `; }
    renderView(0, 0);
    stageActions.hidden = false;
    fitAll();
    if (matchMedia('(max-width:760px)').matches && VIEW.cards.I5 && VIEW.cards.I7) {
      // по центру — Николай с жёнами; по высоте — так, чтобы сверху были видны его родители и деды, снизу — дети
      const a = VIEW.cards.I5, b = VIEW.cards.I7, r = stage.getBoundingClientRect();
      const cx = (Math.min(a[0], b[0]) + Math.max(a[0], b[0]) + CW) / 2, cy = a[1] + CH / 2;
      st.s = 0.7; st.x = r.width / 2 - cx * st.s; st.y = r.height * 0.6 - cy * st.s; apply();
    }
    setTimeout(() => { const h = document.getElementById('hint'); if (h) h.remove(); }, 6000);
  } catch (err) {
    const l = document.getElementById('loading');
    if (l) l.textContent = 'Не удалось показать древо: ' + err;
  }
}
window.__dbg = {st: () => [MASK, BMASK, viewCardsG.querySelectorAll('.person').length, Object.keys(VIEW.cards).length], fitFocus: () => { const v = Object.values(curPos), xs = v.map(q => q.x), ys = v.map(q => q.y); fitBox(Math.min(...xs) - 20, Math.min(...ys) - 20, Math.max(...xs) - Math.min(...xs) + CW + 40, Math.max(...ys) - Math.min(...ys) + CH + 40, 10); }, zoomTo: p => { const c = VIEW.cards[p]; fitBox(c[0] - 200, c[1] - 150, CW + 400, CH + 300, 10); }};
start();

})().catch(error => {
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = location.protocol === 'file:'
    ? 'Для этой версии откройте сайт по HTTP/HTTPS: загрузите папку site на хостинг или используйте локальный веб-сервер.'
    : 'Не удалось загрузить данные древа: ' + error.message;
});
