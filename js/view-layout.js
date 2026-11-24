// Keep one row and one horizontal order per person in every overview state.
// The original views seed the positions; expansion only changes visibility.
window.NovikovyLayout = function (views, data, width, height) {
  const initial = views.b[0];
  const full = views.v[(1 << views.groups.length) - 1];
  const rows = new Map();
  const families = Object.entries(data.fams);
  const siblingGap = 6, familyGap = 28, framePadding = 8;
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

  const framePlans = full.frames.map(([id, x, y, w, h, members]) => ({
    id,
    members: members ?? Object.entries(full.cards).filter(([, [cx, cy]]) =>
      cx >= x && cx + width <= x + w + 0.1 && cy >= y && cy + height <= y + h + 0.1
    ).map(([person]) => person)
  }));

  // A recorded child belongs to its own family frame. A person shown there
  // alongside a spouse uses the frame from the saved layout as a fallback.
  const childFamily = new Map(families.flatMap(([id, family]) => family.ks.map(child => [child, id])));
  const frameOf = new Map();
  for (const {id, members} of framePlans) {
    for (const member of members) {
      if (!frameOf.has(member) || childFamily.get(member) === id) frameOf.set(member, id);
    }
  }

  // Keep partners displayed beside a spouse in the starting view in that
  // household's packing group, even if their birth family is elsewhere.
  const roles = {...full.roles, ...initial.roles};
  const packingGroup = new Map(frameOf);
  for (const id of Object.keys(initial.roles)) {
    const spouse = data.people[id].sp.find(partner => initial.cards[partner] &&
      !initial.roles[partner] && initial.cards[partner][1] === initial.cards[id]?.[1] &&
      full.cards[partner]?.[1] === full.cards[id]?.[1]);
    if (spouse) packingGroup.set(id, frameOf.get(spouse) || spouse);
  }
  const packedFrames = new Map(framePlans.map(({id}) => [id, []]));
  for (const [person, group] of packingGroup) packedFrames.get(group)?.push(person);

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
      if (nearest) preferred.set(id, initial.cards[nearest][0] + (after ? 1 : -1) * (width +
        ((packingGroup.get(id) || id) === (packingGroup.get(nearest) || nearest) ? siblingGap : familyGap)));
    }
    const ordered = slots.flatMap((slot, i) => anchors[i] ? [...slot, anchors[i]] : slot);
    const groups = new Map();
    for (const id of ordered) {
      const group = packingGroup.get(id) || id;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(id);
    }
    return {y: fullY + rowOffset, groups: [...groups.values()], preferred};
  });

  const origin = Object.keys(initial.cards)[0];
  const fullOffset = initial.cards[origin][0] - full.cards[origin][0];

  // Pack each family as a unit, then fit the units in their saved order.
  // The minimum gaps are measured between card edges.
  function placeRow(groups, preferred, cards, y) {
    let offset = 0;
    const blocks = [];
    const clusters = [];
    let previousParents = [];
    for (const ids of groups) {
      const frame = data.fams[packingGroup.get(ids[0])];
      const parents = frame ? [frame.h, frame.w].filter(Boolean) : [];
      if (parents.some(parent => previousParents.includes(parent))) clusters.at(-1).push(ids);
      else clusters.push([ids]);
      previousParents = parents;
    }
    const packed = clusters.map(cluster => {
      let left = 0, weight = 0, weightedX = 0;
      const members = [];
      for (const ids of cluster) {
        ids.forEach((id, i) => {
          const anchorWeight = initial.cards[id] ? 1000 : 1;
          const localX = left + i * (width + siblingGap);
          members.push({id, localX});
          weightedX += (preferred(id) - localX) * anchorWeight;
          weight += anchorWeight;
        });
        left += ids.length * width + (ids.length - 1) * siblingGap + familyGap;
      }
      const group = {members, offset, x: weightedX / weight - offset, weight};
      offset += left;
      return group;
    });
    packed.forEach((group, i) => {
      let current = {start: i, end: i, x: group.x, weight: group.weight};
      while (blocks.length && blocks.at(-1).x > current.x) {
        const previous = blocks.pop();
        const total = previous.weight + current.weight;
        current = {start: previous.start, end: i, weight: total,
          x: (previous.x * previous.weight + current.x * current.weight) / total};
      }
      blocks.push(current);
    });
    for (const {start, end, x} of blocks) {
      for (let i = start; i <= end; i++) {
        const {members, offset: left} = packed[i];
        members.forEach(({id, localX}) => { cards[id] = [x + left + localX, y]; });
      }
    }
  }

  function connectionsFor(cards) {
    return {
      pos: Object.fromEntries(Object.entries(cards).map(([id, [x, y]]) => [id, {x, y}])),
      fams: new Set(families.filter(([, {h, w, ks}]) =>
        [h, w, ...ks].filter(id => id && cards[id]).length > 1).map(([id]) => id))
    };
  }
  const cache = new Map();
  return function viewOf(groups, branches) {
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
      const groupsOnRow = row.groups.map(group => group.filter(id => visible.has(id))).filter(group => group.length);
      placeRow(groupsOnRow, preferred, cards, row.y);
    }
    const positions = Object.values(cards);
    const offset = Math.max(0, 24 - Math.min(...positions.map(([x]) => x)));
    positions.forEach(pos => { pos[0] += offset; });

    const frames = [...packedFrames].flatMap(([id, members]) => {
      const positions = members.filter(person => cards[person]).map(person => cards[person]);
      if (!positions.length) return [];
      const xs = positions.map(([x]) => x), ys = positions.map(([, y]) => y);
      const left = Math.min(...xs) - framePadding, top = Math.min(...ys) - 22;
      return [[id, left, top, Math.max(...xs) + width + framePadding - left, Math.max(...ys) + height + framePadding - top]];
    });
    const layout = {
      cards, frames, roles: Object.fromEntries(Object.entries(roles).filter(([id]) => cards[id])),
      W: Math.max(...positions.map(([x]) => x)) + width + 40,
      H: Math.max(...positions.map(([, y]) => y)) + height + 60,
      connections: connectionsFor(cards)
    };
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(key, layout);
    return layout;
  };
};
