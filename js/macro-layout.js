(function () {
  const FAMILY_WIDTH = 150;
  const COLUMN_GAP = 14;
  const ROW_GAP = 36;

  window.NovikovyMacroLayout = function (data, positions, matches, familyTitle, cardWidth, cardHeight) {
    const nodes = [];
    const parentNodes = new Map();
    const childNodes = new Map();
    const generations = [...new Set(Object.values(positions).map(card => card.y))].sort((a, b) => a - b);
    const generation = new Map(generations.map((y, index) => [y, index]));
    const add = (node, ids) => {
      const cards = ids.map(id => positions[id]);
      const left = Math.min(...cards.map(card => card.x));
      const right = Math.max(...cards.map(card => card.x)) + cardWidth;
      node.target = {x: (left + right) / 2, y: Math.min(...cards.map(card => card.y)) + cardHeight / 2, width: right - left};
      node.incoming = new Set();
      node.outgoing = new Set();
      node.depth = Math.min(...cards.map(card => generation.get(card.y)));
      nodes.push(node);
    };
    for (const [id, family] of Object.entries(data.fams)) {
      const children = family.ks.filter(child => positions[child] && matches(child));
      if (!children.length) continue;
      const parents = [family.h, family.w].filter(Boolean);
      const shownParents = parents.filter(parent => positions[parent] && matches(parent));
      const node = {
        family: id, label: familyTitle(id), children, width: FAMILY_WIDTH,
        height: 46 + 9 * (Math.ceil(children.length / 10) - 1)
      };
      add(node, children);
      node.depth -= 1;
      if (shownParents.length) {
        const parentY = Math.min(...shownParents.map(parent => positions[parent].y));
        node.depth = Math.min(node.depth, generation.get(parentY));
        node.target.y = (parentY + node.target.y) / 2 + cardHeight / 4;
      }
      for (const parent of parents) {
        if (!parentNodes.has(parent)) parentNodes.set(parent, []);
        parentNodes.get(parent).push(node);
      }
      for (const child of children) {
        if (!childNodes.has(child)) childNodes.set(child, []);
        childNodes.get(child).push(node);
      }
    }
    for (const id of Object.keys(positions)) {
      if (!matches(id) || childNodes.has(id) || parentNodes.has(id)) continue;
      const person = data.people[id];
      const label = person.given || person.name;
      const node = {person: id, label, width: Math.max(84, Math.min(150, label.length * 7 + 24)), height: 44};
      add(node, [id]);
    }

    for (const [person, sources] of childNodes) {
      for (const source of sources) {
        for (const destination of parentNodes.get(person) || []) {
          if (source === destination) continue;
          source.outgoing.add(destination);
          destination.incoming.add(source);
        }
      }
    }
    const remaining = new Map(nodes.map(node => [node, node.incoming.size]));
    const depthHints = new Map(nodes.map(node => [node, node.depth]));
    const ready = nodes.filter(node => !node.incoming.size);
    for (const node of nodes) if (node.incoming.size) node.depth = -Infinity;
    for (const node of ready) {
      for (const destination of node.outgoing) {
        destination.depth = Math.max(destination.depth, node.depth + 1);
        const count = remaining.get(destination) - 1;
        remaining.set(destination, count);
        if (!count) ready.push(destination);
      }
    }

    const groups = new Map();
    for (const node of nodes) {
      if (!Number.isFinite(node.depth)) node.depth = depthHints.get(node);
      if (!groups.has(node.depth)) groups.set(node.depth, []);
      groups.get(node.depth).push(node);
    }
    const rows = [...groups.keys()].sort((a, b) => a - b).map(depth => groups.get(depth));
    const rowWidths = rows.map(row => row.reduce((width, node) => width + node.width + COLUMN_GAP, -COLUMN_GAP));
    const width = Math.max(0, ...rowWidths);
    let height = 0;
    rows.forEach((row, index) => {
      row.sort((a, b) => a.target.x - b.target.x);
      let x = (width - rowWidths[index]) / 2;
      for (const node of row) {
        node.x = x;
        node.y = height;
        node.row = index;
        x += node.width + COLUMN_GAP;
      }
      height += Math.max(...row.map(node => node.height)) + ROW_GAP;
    });
    const links = nodes.flatMap(source => [...source.outgoing]
      .filter(destination => destination.row > source.row)
      .map(destination => ({source, destination})));
    const occupied = rows.map(() => []);
    const channelY = (row, from, to) => {
      const spans = occupied[row];
      const left = Math.min(from, to), right = Math.max(from, to);
      const lanes = [18, 11, 25, 6, 30];
      const lane = lanes.find(value => !spans.some(span =>
        span.lane === value && left <= span.right + 4 && right >= span.left - 4)) ?? 18;
      spans.push({left, right, lane});
      return rows[row + 1][0].y - lane;
    };
    for (const link of links) {
      const {source, destination} = link;
      let x = source.x + source.width / 2;
      const end = destination.x + destination.width / 2;
      let path = 'M' + x + ' ' + (source.y + source.height);
      for (let row = source.row; row < destination.row; row++) {
        let nextX = end;
        if (row + 1 < destination.row) {
          const across = rows[row + 1];
          const node = across.find(candidate => end >= candidate.x - 4 && end <= candidate.x + candidate.width + 4);
          if (node) {
            const left = node.x - COLUMN_GAP / 2, right = node.x + node.width + COLUMN_GAP / 2;
            nextX = Math.abs(left - end) <= Math.abs(right - end) ? left : right;
          }
        }
        path += ' V' + channelY(row, x, nextX) + ' H' + nextX;
        x = nextX;
      }
      link.path = path + ' V' + destination.y;
    }
    return {nodes, links, width, height: Math.max(0, height - ROW_GAP)};
  };
})();
