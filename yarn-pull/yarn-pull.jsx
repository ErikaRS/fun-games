import React, { useState, useMemo, useCallback, useEffect } from "react";

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

function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateForest({ numBaskets, seed }) {
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
// COLORING + BASKET CREATION (Step 2 of the spec)
// One pick at a time within a basket — parent promotion happens immediately
// so chains can collapse inside a single basket.
// ────────────────────────────────────────────────────────────────────────────

const PALETTE = [
  "#e63946", // cherry red
  "#f4a261", // tangerine
  "#ffd23f", // marigold
  "#a8d667", // lime
  "#2ec4b6", // turquoise
  "#3a86ff", // cobalt
  "#7b4bd6", // grape
  "#ff5d8f", // bubblegum
  "#5e3a1f", // chocolate
  "#1d3557", // navy
];

function colorForestAndMakeBaskets(forest, rng) {
  const { nodes } = forest;
  const ready = nodes.filter((n) => n.children.length === 0);
  const coloredChildCount = new Map(nodes.map((n) => [n.id, 0]));
  const baskets = [];
  let uncoloredCount = nodes.length;

  while (uncoloredCount > 0) {
    const color = PALETTE[Math.floor(rng() * PALETTE.length)];
    for (let k = 0; k < 3; k++) {
      if (ready.length === 0) {
        throw new Error(
          `Coloring failed: ready set empty with ${uncoloredCount} uncolored nodes remaining.`
        );
      }
      const idx = Math.floor(rng() * ready.length);
      const node = ready[idx];
      ready[idx] = ready[ready.length - 1];
      ready.pop();
      node.color = color;
      uncoloredCount--;
      if (node.parentId !== null) {
        const parent = nodes[node.parentId];
        const newCount = coloredChildCount.get(parent.id) + 1;
        coloredChildCount.set(parent.id, newCount);
        if (newCount === parent.children.length) ready.push(parent);
      }
    }
    baskets.push({ color });
  }
  return baskets;
}

// ────────────────────────────────────────────────────────────────────────────
// LAYOUT
// ────────────────────────────────────────────────────────────────────────────

function layoutForest(forest, opts) {
  const { nodes, rootIds } = forest;
  const xGap = opts.xGap;
  const yGap = opts.yGap;
  const pos = new Map();
  let cursorX = 0;

  const layoutSubtree = (id) => {
    const node = nodes[id];
    const y = node.depth * yGap;
    if (node.children.length === 0) {
      const x = cursorX;
      cursorX += xGap;
      pos.set(id, { x, y });
      return { x, y };
    }
    const childPositions = node.children.map(layoutSubtree);
    const minX = Math.min(...childPositions.map((p) => p.x));
    const maxX = Math.max(...childPositions.map((p) => p.x));
    const x = (minX + maxX) / 2;
    pos.set(id, { x, y });
    return { x, y };
  };

  for (const r of rootIds) {
    layoutSubtree(r);
    cursorX += xGap * 0.6;
  }

  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  return {
    pos,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// FOREST RENDERER
// Modes: full debug view (no filter props) OR gameplay (visibleIds, etc.)
// Layout is computed for the WHOLE forest, so positions are stable as
// children get revealed. Edges only render when both endpoints are visible.
// ────────────────────────────────────────────────────────────────────────────

function ForestSVG({ forest, visibleIds, clearedIds, onTap, tappableIds }) {
  const PAD = 60;
  const X_GAP = 52;
  const Y_GAP = 86;
  const NODE_R = 14;

  const layout = useMemo(
    () => layoutForest(forest, { xGap: X_GAP, yGap: Y_GAP }),
    [forest]
  );
  const { pos, minX, maxX, maxY } = layout;

  const width = maxX - minX + PAD * 2;
  const height = maxY + PAD * 2;
  const offsetX = -minX + PAD;
  const offsetY = PAD;

  const showAll = !visibleIds;
  const isVisible = (id) => showAll || visibleIds.has(id);
  const isCleared = (id) => clearedIds && clearedIds.has(id);
  const isTappable = (id) => tappableIds && tappableIds.has(id);

  const edges = [];
  for (const node of forest.nodes) {
    if (node.parentId === null) continue;
    if (!isVisible(node.id) || !isVisible(node.parentId)) continue;
    const a = pos.get(node.parentId);
    const b = pos.get(node.id);
    edges.push({
      key: node.id,
      ax: a.x + offsetX,
      ay: a.y + offsetY,
      bx: b.x + offsetX,
      by: b.y + offsetY,
    });
  }

  const edgePath = (e) => {
    const dx = e.bx - e.ax;
    const dy = e.by - e.ay;
    const c1x = e.ax + dx * 0.15;
    const c1y = e.ay + dy * 0.55;
    const c2x = e.bx - dx * 0.15;
    const c2y = e.by - dy * 0.45;
    return `M ${e.ax} ${e.ay} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${e.bx} ${e.by}`;
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      preserveAspectRatio="xMidYMin meet"
    >
      <defs>
        <filter id="paper-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <pattern id="grain" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="transparent" />
          <circle cx="1" cy="1" r="0.3" fill="#3b2a1a" opacity="0.06" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={width} height={height} fill="url(#grain)" />

      <g fill="none" stroke="#7a5a3a" strokeWidth="1.8" strokeOpacity="0.6" strokeLinecap="round">
        {edges.map((e) => (
          <path key={e.key} d={edgePath(e)} />
        ))}
      </g>

      <g>
        {forest.nodes.map((n) => {
          if (!isVisible(n.id)) return null;
          const p = pos.get(n.id);
          const cx = p.x + offsetX;
          const cy = p.y + offsetY;
          const isRoot = n.parentId === null;
          const cleared = isCleared(n.id);
          const tappable = isTappable(n.id);

          return (
            <g
              key={n.id}
              transform={`translate(${cx}, ${cy})`}
              style={{
                cursor: tappable && onTap ? "pointer" : "default",
                opacity: cleared ? 0.18 : 1,
                transition: "opacity 280ms ease",
              }}
              onClick={tappable && onTap ? () => onTap(n.id) : undefined}
            >
              {!cleared && (
                <circle
                  r={NODE_R + 2}
                  fill="#3b2a1a"
                  opacity="0.2"
                  filter="url(#paper-shadow)"
                  transform="translate(1, 2)"
                />
              )}
              {tappable && !cleared && (
                <circle
                  className="yp-pulse"
                  r={NODE_R + 5}
                  fill="none"
                  stroke={n.color}
                  strokeWidth="2"
                  strokeOpacity="0.55"
                />
              )}
              <circle
                r={NODE_R}
                fill={n.color || "#dba66a"}
                stroke="#3b2a1a"
                strokeWidth="1.6"
              />
              {isRoot && (
                <circle r={NODE_R - 6} fill="none" stroke="#2a1d10" strokeWidth="1.4" />
              )}
              {tappable && <circle r={NODE_R + 10} fill="transparent" />}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// GAME STATE
// Activation queue = reverse of basket creation order (Step 3 of spec).
//
// Spools: 5 holding slots that absorb nodes whose color doesn't match any
// active basket. After every placement (and after a basket fills + advances),
// auto-flush runs: any spool whose color now matches an active basket empties
// into that basket. This repeats until stable.
// ────────────────────────────────────────────────────────────────────────────

const NUM_SPOOLS = 5;

function buildInitialGameState(forest, baskets) {
  const queue = baskets.slice().reverse();
  const active = [];
  for (let i = 0; i < 3 && queue.length > 0; i++) {
    active.push({ color: queue.shift().color, slots: [] });
  }
  while (active.length < 3) active.push(null);

  const visible = new Set(forest.rootIds);
  const cleared = new Set();
  // spools: array of length NUM_SPOOLS; each entry is a color string or null
  const spools = new Array(NUM_SPOOLS).fill(null);
  return { queue, active, visible, cleared, spools };
}

// Internal helper: place a single node-color into the first matching active
// basket. Returns updated `active` and `queue`, or null if no slot available.
function tryPlaceColorInBasket(active, queue, color) {
  const slotIdx = active.findIndex((b) => b && b.color === color && b.slots.length < 3);
  if (slotIdx === -1) return null;

  // Note: when called from a spool flush, we don't have a node id to put in
  // the slot, so we use a placeholder marker. Slots are visual-only; the
  // engine just cares about length.
  const newActive = active.slice();
  newActive[slotIdx] = {
    ...newActive[slotIdx],
    slots: [...newActive[slotIdx].slots, "_spool_"],
  };
  let newQueue = queue;
  if (newActive[slotIdx].slots.length === 3) {
    if (queue.length > 0) {
      newActive[slotIdx] = { color: queue[0].color, slots: [] };
      newQueue = queue.slice(1);
    } else {
      newActive[slotIdx] = null;
    }
  }
  return { active: newActive, queue: newQueue };
}

// Auto-flush: empty any spool whose color matches an active basket.
// Repeat until stable, since each flush may advance the queue.
function autoFlush(active, queue, spools) {
  let curActive = active;
  let curQueue = queue;
  let curSpools = spools;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < curSpools.length; i++) {
      const color = curSpools[i];
      if (color === null) continue;
      const placed = tryPlaceColorInBasket(curActive, curQueue, color);
      if (placed) {
        curActive = placed.active;
        curQueue = placed.queue;
        curSpools = curSpools.slice();
        curSpools[i] = null;
        changed = true;
      }
    }
  }
  return { active: curActive, queue: curQueue, spools: curSpools };
}

function applyTap(state, forest, nodeId) {
  const node = forest.nodes[nodeId];
  if (state.cleared.has(nodeId)) return { state, ok: false, reason: "already cleared" };
  if (!state.visible.has(nodeId)) return { state, ok: false, reason: "not visible" };

  // Step 1: try to place in matching basket. If none, try spool. Else block.
  let newActive = state.active;
  let newQueue = state.queue;
  let newSpools = state.spools;

  const slotIdx = newActive.findIndex(
    (b) => b && b.color === node.color && b.slots.length < 3
  );

  if (slotIdx !== -1) {
    // Place in basket
    newActive = newActive.map((b, i) =>
      i === slotIdx ? { ...b, slots: [...b.slots, nodeId] } : b
    );
    if (newActive[slotIdx].slots.length === 3) {
      if (newQueue.length > 0) {
        newActive[slotIdx] = { color: newQueue[0].color, slots: [] };
        newQueue = newQueue.slice(1);
      } else {
        newActive[slotIdx] = null;
      }
    }
  } else {
    // Try spool
    const spoolIdx = newSpools.findIndex((s) => s === null);
    if (spoolIdx === -1) {
      return { state, ok: false, reason: "no matching basket and no spool space" };
    }
    newSpools = newSpools.slice();
    newSpools[spoolIdx] = node.color;
  }

  // Reveal children + mark cleared
  const newVisible = new Set(state.visible);
  for (const cId of node.children) newVisible.add(cId);
  const newCleared = new Set(state.cleared);
  newCleared.add(nodeId);

  // Auto-flush
  const flushed = autoFlush(newActive, newQueue, newSpools);

  return {
    state: {
      queue: flushed.queue,
      active: flushed.active,
      visible: newVisible,
      cleared: newCleared,
      spools: flushed.spools,
    },
    ok: true,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// APP
// ────────────────────────────────────────────────────────────────────────────

const FONT_DISPLAY = `"Fraunces", "Cormorant Garamond", "Iowan Old Style", Georgia, serif`;
const FONT_BODY = `"Inter Tight", "Söhne", "Helvetica Neue", system-ui, sans-serif`;
const FONT_MONO = `"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace`;

export default function App() {
  const [numBaskets, setNumBaskets] = useState(12);
  const [seed, setSeed] = useState(42);
  const [debugOpen, setDebugOpen] = useState(false);
  const [shake, setShake] = useState(0);

  const { forest, baskets } = useMemo(() => {
    const f = generateForest({ numBaskets, seed });
    const colorRng = makeRng(seed ^ 0xb45c0107);
    const b = colorForestAndMakeBaskets(f, colorRng);
    return { forest: f, baskets: b };
  }, [numBaskets, seed]);

  const [game, setGame] = useState(() => buildInitialGameState(forest, baskets));

  useEffect(() => {
    setGame(buildInitialGameState(forest, baskets));
  }, [forest, baskets]);

  const reroll = useCallback(() => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  }, []);

  const restart = useCallback(() => {
    setGame(buildInitialGameState(forest, baskets));
  }, [forest, baskets]);

  const tappableIds = useMemo(() => {
    const s = new Set();
    for (const id of game.visible) {
      if (!game.cleared.has(id)) s.add(id);
    }
    return s;
  }, [game]);

  const onTap = useCallback(
    (nodeId) => {
      const result = applyTap(game, forest, nodeId);
      if (result.ok) {
        setGame(result.state);
      } else if (
        result.reason === "no matching basket and no spool space" ||
        result.reason === "no matching basket"
      ) {
        setShake((x) => x + 1);
      }
    },
    [game, forest]
  );

  const won = game.cleared.size === forest.nodes.length;

  const stats = useMemo(() => {
    const rootCount = forest.rootIds.length;
    const leafCount = forest.nodes.filter((n) => n.children.length === 0).length;
    const maxDepth = forest.nodes.reduce((m, n) => Math.max(m, n.depth), 0);
    const branchHist = [0, 0, 0, 0, 0];
    for (const n of forest.nodes) branchHist[n.children.length]++;
    return { rootCount, leafCount, maxDepth, branchHist };
  }, [forest]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 20% 10%, #f7ecd4 0%, #efdcb4 40%, #e6cf9e 100%)",
        fontFamily: FONT_BODY,
        color: "#2a1d10",
        padding: "32px 24px 64px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..900,30..100&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        button.ypbtn {
          font-family: ${FONT_BODY};
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 10px 16px;
          border: 1.5px solid #2a1d10;
          background: #2a1d10;
          color: #f7ecd4;
          cursor: pointer;
          transition: transform 120ms ease, background 120ms ease;
        }
        button.ypbtn.ghost { background: transparent; color: #2a1d10; }
        button.ypbtn:hover { transform: translateY(-1px); }
        button.ypbtn.ghost:hover { background: #2a1d10; color: #f7ecd4; }
        input[type=range].ypslider {
          -webkit-appearance: none; appearance: none;
          width: 220px; height: 2px; background: #2a1d10; outline: none;
        }
        input[type=range].ypslider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: #c97b4a; border: 1.5px solid #2a1d10; cursor: pointer;
        }
        input[type=range].ypslider::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: #c97b4a; border: 1.5px solid #2a1d10; cursor: pointer;
        }
        @keyframes yp-pulse {
          0%, 100% { r: 19; opacity: 0.55; }
          50% { r: 23; opacity: 0.15; }
        }
        .yp-pulse { animation: yp-pulse 1800ms ease-in-out infinite; }
        @keyframes yp-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        .yp-shake { animation: yp-shake 360ms ease; }
        @keyframes yp-pop {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .yp-pop { animation: yp-pop 280ms ease-out; transform-origin: center; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            borderBottom: "1.5px solid #2a1d10",
            paddingBottom: 18,
            marginBottom: 28,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                opacity: 0.7,
                marginBottom: 6,
              }}
            >
              Yarn Pull · a sorting puzzle
            </div>
            <h1
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 400,
                fontStyle: "italic",
                fontSize: "clamp(40px, 7vw, 72px)",
                lineHeight: 0.95,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              tug a thread,
              <br />
              <span style={{ fontStyle: "normal", fontWeight: 600 }}>untangle</span>
              <span style={{ color: "#e63946" }}>.</span>
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="ypbtn ghost" onClick={restart}>
              ↺ Restart
            </button>
            <button className="ypbtn" onClick={reroll}>
              ↻ New puzzle
            </button>
          </div>
        </header>

        {/* BASKETS */}
        <BasketsRow active={game.active} shakeKey={shake} />

        {/* SPOOLS */}
        <SpoolsRow spools={game.spools} />

        {/* QUEUE PEEK */}
        {game.queue.length > 0 && (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: FONT_MONO,
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            <span>up next</span>
            <div style={{ display: "flex", gap: 6 }}>
              {game.queue.slice(0, 8).map((b, i) => (
                <div
                  key={i}
                  title={b.color}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: b.color,
                    border: "1.4px solid #2a1d10",
                    opacity: 1 - i * 0.08,
                  }}
                />
              ))}
              {game.queue.length > 8 && (
                <span style={{ alignSelf: "center", marginLeft: 4 }}>
                  +{game.queue.length - 8}
                </span>
              )}
            </div>
          </div>
        )}

        {/* FOREST CANVAS */}
        <section
          style={{
            background: "#fbf3df",
            border: "1.5px solid #2a1d10",
            padding: "12px 12px 4px",
            position: "relative",
            boxShadow: "6px 6px 0 #2a1d10",
            marginTop: 20,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 14,
              fontFamily: FONT_MONO,
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              opacity: 0.5,
            }}
          >
            {won ? "fin." : `${game.cleared.size} / ${forest.nodes.length}`}
          </div>
          <div style={{ overflowX: "auto" }}>
            <ForestSVG
              forest={forest}
              visibleIds={game.visible}
              clearedIds={game.cleared}
              tappableIds={tappableIds}
              onTap={onTap}
            />
          </div>
        </section>

        {won && (
          <div
            style={{
              marginTop: 18,
              border: "1.5px solid #2a1d10",
              padding: "16px 18px",
              background: "#fbf3df",
              fontFamily: FONT_DISPLAY,
              fontSize: 22,
              fontStyle: "italic",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <span>every thread tucked away.</span>
            <button className="ypbtn" onClick={reroll}>
              another?
            </button>
          </div>
        )}

        {/* DEBUG SECTION */}
        <section style={{ marginTop: 56 }}>
          <button
            className="ypbtn ghost"
            onClick={() => setDebugOpen((x) => !x)}
            style={{ width: "100%", textAlign: "left", padding: "12px 16px" }}
          >
            {debugOpen ? "▾" : "▸"}  Debug · generation internals
          </button>

          {debugOpen && (
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 28 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
                <div>
                  <DebugLabel>Baskets · {numBaskets}</DebugLabel>
                  <input
                    className="ypslider"
                    type="range"
                    min={9}
                    max={99}
                    value={numBaskets}
                    onChange={(e) => setNumBaskets(parseInt(e.target.value, 10))}
                  />
                  <div style={{ fontFamily: FONT_MONO, fontSize: 11, marginTop: 6, opacity: 0.6 }}>
                    target nodes = {numBaskets * 3}
                  </div>
                </div>
                <div>
                  <DebugLabel>Seed</DebugLabel>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)}
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 14,
                      background: "transparent",
                      border: "none",
                      borderBottom: "1.5px solid #2a1d10",
                      color: "#2a1d10",
                      padding: "4px 0",
                      width: 160,
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  border: "1.5px solid #2a1d10",
                }}
              >
                {[
                  ["Nodes", `${forest.actual} / ${forest.target}`],
                  ["Roots", stats.rootCount],
                  ["Leaves", stats.leafCount],
                  ["Max depth", stats.maxDepth],
                ].map(([label, value], i) => (
                  <div
                    key={label}
                    style={{
                      padding: "14px 16px",
                      borderRight: i < 3 ? "1.5px solid #2a1d10" : "none",
                    }}
                  >
                    <DebugLabel small>{label}</DebugLabel>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, lineHeight: 1 }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <DebugLabel>Full colored tree (all nodes revealed)</DebugLabel>
                <div
                  style={{
                    background: "#fbf3df",
                    border: "1.5px solid #2a1d10",
                    padding: "12px 12px 4px",
                    overflowX: "auto",
                  }}
                >
                  <ForestSVG forest={forest} />
                </div>
              </div>

              <div>
                <DebugLabel>Baskets · creation order ({baskets.length})</DebugLabel>
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 9,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    opacity: 0.55,
                    marginBottom: 10,
                  }}
                >
                  leaves first → roots last · activation reverses this
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
                    gap: 8,
                  }}
                >
                  {baskets.map((b, i) => {
                    const activationIdx = baskets.length - 1 - i;
                    return (
                      <div
                        key={i}
                        title={`creation #${i + 1}  ·  activates #${activationIdx + 1}  ·  ${b.color}`}
                        style={{
                          border: "1.5px solid #2a1d10",
                          background: "#fbf3df",
                          padding: "8px 6px 6px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: FONT_MONO,
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            opacity: 0.55,
                          }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[0, 1, 2].map((s) => (
                            <span
                              key={s}
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: "50%",
                                background: b.color,
                                border: "1.4px solid #2a1d10",
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <DebugLabel>Branching distribution (children per node)</DebugLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                  {stats.branchHist.map((count, i) => {
                    const max = Math.max(...stats.branchHist, 1);
                    const pct = (count / max) * 100;
                    const expected = [1, 49, 25, 15, 10][i];
                    const actualPct =
                      forest.actual > 0 ? Math.round((count / forest.actual) * 100) : 0;
                    return (
                      <div key={i}>
                        <div
                          style={{
                            height: 70,
                            border: "1.5px solid #2a1d10",
                            position: "relative",
                            background: "#fbf3df",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              bottom: 0,
                              left: 0,
                              right: 0,
                              height: `${pct}%`,
                              background: i === 0 ? "#e63946" : "#f4a261",
                              transition: "height 200ms ease",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: 6,
                          }}
                        >
                          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 18 }}>{i}</span>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 10, opacity: 0.7 }}>
                            {count} · {actualPct}% / {expected}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function DebugLabel({ children, small }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: small ? 9 : 10,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        opacity: 0.7,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function BasketsRow({ active, shakeKey }) {
  return (
    <section
      key={`shake-${shakeKey}`}
      className={shakeKey > 0 ? "yp-shake" : undefined}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 14,
      }}
    >
      {[0, 1, 2].map((i) => {
        const b = active[i];
        return (
          <BasketCell
            key={`slot-${i}-${b ? b.color + "-" + b.slots.length : "empty"}`}
            basket={b}
          />
        );
      })}
    </section>
  );
}

function BasketCell({ basket }) {
  if (!basket) {
    return (
      <div
        style={{
          border: "1.5px dashed #2a1d10",
          background: "transparent",
          padding: "16px 18px",
          minHeight: 92,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT_MONO,
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          opacity: 0.4,
        }}
      >
        — empty —
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1.5px solid #2a1d10",
        background: "#fbf3df",
        padding: "14px 16px",
        boxShadow: `4px 4px 0 ${basket.color}`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        minHeight: 92,
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: basket.color,
          border: "1.5px solid #2a1d10",
          flexShrink: 0,
        }}
      />
      <div style={{ display: "flex", gap: 8, flex: 1 }}>
        {[0, 1, 2].map((s) => {
          const filled = basket.slots[s] !== undefined;
          return (
            <div
              key={s}
              style={{
                flex: 1,
                aspectRatio: "1 / 1",
                maxWidth: 44,
                border: "1.5px solid #2a1d10",
                borderRadius: 6,
                background: filled ? "#fbf3df" : "rgba(0,0,0,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {filled && (
                <div
                  className="yp-pop"
                  style={{
                    width: "70%",
                    height: "70%",
                    borderRadius: "50%",
                    background: basket.color,
                    border: "1.4px solid #2a1d10",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11,
          letterSpacing: "0.18em",
          opacity: 0.55,
          flexShrink: 0,
        }}
      >
        {basket.slots.length}/3
      </div>
    </div>
  );
}

function SpoolsRow({ spools }) {
  return (
    <section
      style={{
        marginTop: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
        border: "1.5px solid #2a1d10",
        background: "#fbf3df",
        padding: "10px 14px",
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          opacity: 0.7,
          flexShrink: 0,
        }}
      >
        Spools
      </div>
      <div style={{ display: "flex", gap: 10, flex: 1 }}>
        {spools.map((color, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              maxWidth: 56,
              aspectRatio: "1 / 1",
              border: "1.5px solid #2a1d10",
              borderRadius: "50%",
              background: color || "rgba(0,0,0,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {color && (
              <div
                className="yp-pop"
                style={{
                  position: "absolute",
                  inset: 4,
                  borderRadius: "50%",
                  background: color,
                  border: "1.4px solid #2a1d10",
                }}
              />
            )}
            {!color && (
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 9,
                  letterSpacing: "0.15em",
                  opacity: 0.4,
                }}
              >
                {i + 1}
              </span>
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11,
          letterSpacing: "0.18em",
          opacity: 0.55,
          flexShrink: 0,
        }}
      >
        {spools.filter((s) => s !== null).length}/{spools.length}
      </div>
    </section>
  );
}
