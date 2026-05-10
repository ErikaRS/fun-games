// Forest generation is intentionally UI-free so other yarn-pull variants can reuse it.

// ────────────────────────────────────────────────────────────────────────────
// FOREST GENERATION (Step 1 of the spec)
// ────────────────────────────────────────────────────────────────────────────

const CHILD_DIST = [
  { count: 0, p: 0.01 },
  { count: 1, p: 0.49 },
  { count: 2, p: 0.25 },
  { count: 3, p: 0.15 },
  { count: 4, p: 0.1 },
];

function rollChildCount(rng) {
  const r = rng();
  let acc = 0;
  for (const { count, p } of CHILD_DIST) {
    acc += p;
    if (r < acc) return count;
  }
  return 4;
}

export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateForest({ numBaskets, seed }) {
  const rng = makeRng(seed);
  const target = numBaskets * 3;
  const rootCount = 2 + Math.floor(rng() * 3);
  const initialRoots = Math.min(rootCount, target);

  let nextId = 0;
  const nodes = [];
  const roots = [];

  const makeNode = (parentId, depth) => {
    const node = { id: nextId++, parentId, depth, children: [] };
    nodes.push(node);
    return node;
  };

  for (let i = 0; i < initialRoots; i++) {
    roots.push(makeNode(null, 0));
  }

  let budget = target - nodes.length;
  let frontier = [...roots];

  while (frontier.length > 0 && budget > 0) {
    const next = [];
    for (const parent of frontier) {
      if (budget <= 0) break;
      const want = rollChildCount(rng);
      const give = Math.min(want, budget);
      for (let i = 0; i < give; i++) {
        const child = makeNode(parent.id, parent.depth + 1);
        parent.children.push(child.id);
        next.push(child);
        budget--;
      }
    }
    frontier = next;
  }

  return { nodes, rootIds: roots.map((r) => r.id), target, actual: nodes.length };
}

// ────────────────────────────────────────────────────────────────────────────
