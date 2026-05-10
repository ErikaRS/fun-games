// Forest generation is intentionally UI-free so other color-trail variants can reuse it.
//
// High-level algorithm:
// 1. Use a seeded RNG so a puzzle seed always rebuilds the same forest.
// 2. Create a small set of roots, then grow the forest breadth-first.
// 3. For each frontier node, roll a child count from CHILD_DIST and spend from
//    a fixed node budget. The target budget is `numBaskets * 3` because each
//    basket later owns exactly three nodes.
// 4. Stop when the budget is exhausted or the frontier dies out. The caller can
//    inspect `actual` versus `target`; generation is allowed to produce a
//    smaller forest if random growth terminates early.
//
// Node ids are array indexes. Parent/child links are stored as ids so later
// generation and gameplay phases can mutate node metadata without rebuilding
// references.

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
  // Mulberry32: small deterministic PRNG for puzzle reproducibility. It is not
  // cryptographic; browser crypto is only used by the UI to choose fresh seeds.
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
