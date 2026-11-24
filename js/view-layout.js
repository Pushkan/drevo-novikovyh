// Keep one row and one horizontal order per person in every overview state.
// The original views seed the positions; expansion only changes visibility.
window.NovikovyLayout = function (views, data, width, height) {
  const initial = views.b[0];
  const full = views.v[(1 << views.groups.length) - 1];
  const rows = new Map();
  const families = Object.entries(data.fams);
  const step = width + 10;
  for (const [id, [, y]] of Object.entries(full.cards)) {
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(id);
  }

  const relatedOnRow = new Map();
  function connect(a, b) {
    if (!a || !b || a === b || full.cards[a]?.[1] !== full.cards[b]?.[1]) return;
    if (!relatedOnRow.has(a)) relatedOnRow.set(a, new Set());
    relatedOnRow.get(a).add(b);
  }
  for (const [, {h, w, ks}] of families) {
    connect(h, w);
    connect(w, h);
    for (const child of ks) for (const sibling of ks) connect(child, sibling);
  }

  let rowOffset = 0;
  const rowPlans = [...rows].sort(([a], [b]) => a - b).map(([fullY, ids]) => {
    ids.sort((a, b) => full.cards[a][0] - full.cards[b][0]);
    const anchors = ids.filter(id => initial.cards[id])
      .sort((a, b) => initial.cards[a][0] - initial.cards[b][0]);
    if (anchors.length) rowOffset = initial.cards[anchors[0]][1] - fullY;
    const anchorOrder = new Map(anchors.map((id, i) => [id, i]));
    const slots = Array.from({length: anchors.length + 1}, () => []);
    const preferred = new Map();
    for (const id of ids) {
      if (anchorOrder.has(id)) continue;
      const x = full.cards[id][0];
      const relatives = anchors.filter(anchor => relatedOnRow.get(id)?.has(anchor));
      const candidates = relatives.length ? relatives : anchors;
      let nearest;
      for (const candidate of candidates) {
        if (!nearest || Math.abs(full.cards[candidate][0] - x) < Math.abs(full.cards[nearest][0] - x)) {
          nearest = candidate;
        }
      }
      const after = nearest && x > full.cards[nearest][0];
      slots[nearest ? anchorOrder.get(nearest) + (after ? 1 : 0) : 0].push(id);
      if (nearest) preferred.set(id, initial.cards[nearest][0] + (after ? step : -step));
    }
    return {y: fullY + rowOffset, ids: slots.flatMap((slot, i) => anchors[i] ? [...slot, anchors[i]] : slot), preferred};
  });

  const framePlans = full.frames.map(([id, x, y, w, h, members]) => ({
    id,
    members: members ?? Object.entries(full.cards).filter(([, [cx, cy]]) =>
      cx >= x && cx + width <= x + w + 0.1 && cy >= y && cy + height <= y + h + 0.1
    ).map(([person]) => person)
  }));

  const origin = Object.keys(initial.cards)[0];
  const fullOffset = initial.cards[origin][0] - full.cards[origin][0];

  // Fit positions in a fixed order with a minimum gap, merging only the
  // consecutive cards whose preferred positions would overlap.
  function placeRow(ids, preferred, cards, y) {
    const blocks = [];
    for (const [i, id] of ids.entries()) {
      const weight = initial.cards[id] ? 1000 : 1;
      let current = {start: i, end: i, weight, x: preferred(id) - i * step};
      while (blocks.length && blocks.at(-1).x > current.x) {
        const previous = blocks.pop();
        const total = previous.weight + current.weight;
        current = {start: previous.start, end: i, weight: total,
          x: (previous.x * previous.weight + current.x * current.weight) / total};
      }
      blocks.push(current);
    }
    for (const {start, end, x} of blocks) {
      for (let i = start; i <= end; i++) cards[ids[i]] = [x + i * step, y];
    }
  }

  function connectionsFor(cards) {
    return {
      pos: Object.fromEntries(Object.entries(cards).map(([id, [x, y]]) => [id, {x, y}])),
      fams: new Set(families.filter(([, {h, w, ks}]) =>
        [h, w, ...ks].filter(id => id && cards[id]).length > 1).map(([id]) => id))
    };
  }
  const initialView = {...initial, connections: connectionsFor(initial.cards)};
  const cache = new Map();
  return function viewOf(groups, branches) {
    if (!groups && !branches) return initialView;
    const key = `${groups}:${branches}`;
    if (cache.has(key)) return cache.get(key);

    const visible = new Set(Object.keys(initial.cards));
    const enabled = [...views.branches.filter((_, i) => branches & (1 << i)).map(([anchor, , ids]) => [anchor, ids]),
      ...views.groups.filter((_, i) => groups & (1 << i)).map(([, anchor, , ids]) => [anchor, ids])];
    let count;
    do {
      count = visible.size;
      for (const [anchor, ids] of enabled) {
        if (!anchor || visible.has(anchor)) ids.forEach(id => visible.add(id));
      }
    } while (count !== visible.size);

    const cards = {};
    for (const row of rowPlans) {
      const preferred = id => {
        if (initial.cards[id]) return initial.cards[id][0];
        if (row.preferred.has(id)) return row.preferred.get(id);
        const parents = data.people[id].par.filter(parent => cards[parent]);
        if (parents.length) return parents.reduce((x, parent) => x + cards[parent][0], 0) / parents.length;
        // Keep a spouse without visible parents near the other spouse's family.
        const spouseParents = data.people[id].sp.flatMap(spouse => data.people[spouse].par)
          .filter(parent => cards[parent]);
        if (spouseParents.length) return cards[spouseParents[0]][0];
        return full.cards[id][0] + fullOffset;
      };
      placeRow(row.ids.filter(id => visible.has(id)), preferred, cards, row.y);
    }
    const positions = Object.values(cards);
    const offset = Math.max(0, 24 - Math.min(...positions.map(([x]) => x)));
    positions.forEach(pos => { pos[0] += offset; });

    const frames = framePlans.flatMap(({id, members}) => {
      const positions = members.filter(person => cards[person]).map(person => cards[person]);
      if (!positions.length) return [];
      const xs = positions.map(([x]) => x), ys = positions.map(([, y]) => y);
      const left = Math.min(...xs) - 9, top = Math.min(...ys) - 22;
      return [[id, left, top, Math.max(...xs) + width + 9 - left, Math.max(...ys) + height + 16 - top]];
    });
    const layout = {
      cards, frames, roles: Object.fromEntries(Object.entries(full.roles).filter(([id]) => cards[id])),
      W: Math.max(...positions.map(([x]) => x)) + width + 40,
      H: Math.max(...positions.map(([, y]) => y)) + height + 60,
      connections: connectionsFor(cards)
    };
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(key, layout);
    return layout;
  };
};
