import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";

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

const YARN_COLORS = [
  { hex: "#b51d2a", name: "brick", pattern: "cross" },
  { hex: "#e87500", name: "orange", pattern: "vertical" },
  { hex: "#c9a600", name: "ochre", pattern: "horizontal" },
  { hex: "#12823b", name: "emerald", pattern: "forward" },
  { hex: "#008b8b", name: "teal", pattern: "back" },
  { hex: "#0067b1", name: "azure", pattern: "dots-light" },
  { hex: "#7b2cbf", name: "purple", pattern: "grid" },
  { hex: "#b0006d", name: "berry", pattern: "wide-forward" },
  { hex: "#7f4f24", name: "umber", pattern: "dots-dark" },
  { hex: "#343a40", name: "charcoal", pattern: "wide-back" },
];

const PALETTE = YARN_COLORS.map((color) => color.hex);
const YARN_COLOR_BY_HEX = new Map(YARN_COLORS.map((color, i) => [color.hex, { ...color, i }]));

function yarnMeta(color) {
  return YARN_COLOR_BY_HEX.get(color) || { hex: color, name: color, pattern: "solid", i: 0 };
}

function yarnPatternId(color) {
  return `yarn-pattern-${yarnMeta(color).i}`;
}

function yarnTitle(color) {
  const meta = yarnMeta(color);
  return `${meta.name} yarn (${meta.hex})`;
}

const YARN_PATTERN_CACHE = new Map();

function yarnPatternSpec(pattern) {
  const light = "#fbf3df";
  const dark = "#2a1d10";
  const lightOpacity = pattern.includes("dark") ? 0.25 : 0.42;

  if (pattern === "vertical") {
    return {
      width: 7,
      height: 7,
      markup: `<rect x="0" y="0" width="2" height="7" fill="${light}" opacity="${lightOpacity}" />`,
    };
  }
  if (pattern === "cross") {
    return {
      width: 9,
      height: 9,
      markup: `<path d="M -2 9 L 9 -2 M 2 11 L 11 2 M -2 0 L 9 11 M 2 -2 L 11 7" stroke="${light}" stroke-width="1.7" opacity="${lightOpacity}" />`,
    };
  }
  if (pattern === "horizontal") {
    return {
      width: 7,
      height: 7,
      markup: `<rect x="0" y="0" width="7" height="1.5" fill="${dark}" opacity="0.24" />`,
    };
  }
  if (pattern === "forward" || pattern === "wide-forward") {
    const strokeWidth = pattern === "wide-forward" ? 3 : 2;
    return {
      width: 8,
      height: 8,
      markup: `<path d="M -2 8 L 8 -2 M 2 10 L 10 2" stroke="${light}" stroke-width="${strokeWidth}" opacity="${lightOpacity}" />`,
    };
  }
  if (pattern === "back" || pattern === "wide-back") {
    const strokeWidth = pattern === "wide-back" ? 3 : 2;
    return {
      width: 8,
      height: 8,
      markup: `<path d="M -2 0 L 8 10 M 2 -2 L 10 6" stroke="${light}" stroke-width="${strokeWidth}" opacity="${lightOpacity}" />`,
    };
  }
  if (pattern === "dots-light" || pattern === "dots-dark") {
    const fill = pattern === "dots-dark" ? dark : light;
    return {
      width: 8,
      height: 8,
      markup: `<circle cx="2" cy="2" r="1.8" fill="${fill}" opacity="${lightOpacity}" />`,
    };
  }
  if (pattern === "grid") {
    return {
      width: 7,
      height: 7,
      markup: `<path d="M 0 0 H 7 M 0 0 V 7" stroke="${light}" stroke-width="1.5" opacity="0.38" />`,
    };
  }
  return { width: 8, height: 8, markup: "" };
}

function yarnPatternDataUrl(pattern) {
  if (YARN_PATTERN_CACHE.has(pattern)) return YARN_PATTERN_CACHE.get(pattern);
  const spec = yarnPatternSpec(pattern);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">${spec.markup}</svg>`;
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  YARN_PATTERN_CACHE.set(pattern, href);
  return href;
}

function yarnFillStyle(color) {
  const { pattern } = yarnMeta(color);
  const spec = yarnPatternSpec(pattern);
  const style = { backgroundColor: color };

  if (spec.markup) {
    style.backgroundImage = `url("${yarnPatternDataUrl(pattern)}")`;
    style.backgroundSize = `${spec.width}px ${spec.height}px`;
  }

  return style;
}

function colorForestAndMakeBaskets(forest, rng) {
  const { nodes } = forest;
  const ready = nodes.filter((n) => n.children.length === 0);
  const coloredChildCount = new Map(nodes.map((n) => [n.id, 0]));
  const baskets = [];
  let uncoloredCount = nodes.length;

  while (uncoloredCount > 0) {
    const color = PALETTE[Math.floor(rng() * PALETTE.length)];
    const nodeIds = [];
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
      node.basketId = baskets.length;
      nodeIds.push(node.id);
      uncoloredCount--;
      if (node.parentId !== null) {
        const parent = nodes[node.parentId];
        const newCount = coloredChildCount.get(parent.id) + 1;
        coloredChildCount.set(parent.id, newCount);
        if (newCount === parent.children.length) ready.push(parent);
      }
    }
    baskets.push({ id: baskets.length, color, nodeIds });
  }
  return baskets;
}

// ────────────────────────────────────────────────────────────────────────────
// LAYOUT
// ────────────────────────────────────────────────────────────────────────────

function layoutForest(forest, opts) {
  const { nodes, rootIds } = forest;
  const rootRadius = opts.rootRadius;
  const radialGap = opts.radialGap;
  const minNodeArc = opts.minNodeArc;
  const pos = new Map();
  const angles = new Map();

  const leaves = [];
  const collectLeaves = (id) => {
    const node = nodes[id];
    if (node.children.length === 0) {
      leaves.push(id);
      return;
    }
    node.children.forEach(collectLeaves);
  };

  rootIds.forEach(collectLeaves);

  const leafCount = Math.max(leaves.length, 1);
  leaves.forEach((id, i) => {
    angles.set(id, -Math.PI / 2 + (Math.PI * 2 * i) / leafCount);
  });

  const assignInternalAngles = (id) => {
    const node = nodes[id];
    if (node.children.length === 0) return angles.get(id);

    const childAngles = node.children.map(assignInternalAngles);
    const x = childAngles.reduce((sum, angle) => sum + Math.cos(angle), 0);
    const y = childAngles.reduce((sum, angle) => sum + Math.sin(angle), 0);
    const angle = Math.atan2(y, x);
    angles.set(id, angle);
    return angle;
  };

  rootIds.forEach(assignInternalAngles);

  const byDepth = new Map();
  for (const node of nodes) {
    if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
    byDepth.get(node.depth).push(node);
  }

  for (const [depth, depthNodes] of byDepth) {
    const count = depthNodes.length;
    const radius = Math.max(rootRadius + depth * radialGap, (count * minNodeArc) / (Math.PI * 2));
    const ordered = [...depthNodes].sort((a, b) => angles.get(a.id) - angles.get(b.id));
    for (let i = 0; i < ordered.length; i++) {
      const node = ordered[i];
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / count;
      pos.set(node.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
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

function YarnSvgPatterns() {
  return (
    <>
      {YARN_COLORS.map((color, i) => {
        const id = `yarn-pattern-${i}`;
        const spec = yarnPatternSpec(color.pattern);
        return (
          <pattern
            key={id}
            id={id}
            width={spec.width}
            height={spec.height}
            patternUnits="userSpaceOnUse"
          >
            {spec.markup && (
              <image href={yarnPatternDataUrl(color.pattern)} width={spec.width} height={spec.height} />
            )}
          </pattern>
        );
      })}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// FOREST RENDERER
// Modes: full debug view (no filter props) OR gameplay (visibleIds, etc.)
// Layout is computed for the WHOLE forest, so positions are stable as
// children get revealed. Edges only render when both endpoints are visible.
// ────────────────────────────────────────────────────────────────────────────

function ForestSVG({ forest, visibleIds, clearedIds, onTap, tappableIds }) {
  const PAD = 76;
  const ROOT_RADIUS = 36;
  const RADIAL_GAP = 88;
  const MIN_NODE_ARC = 72;
  const NODE_R = 24;

  const layout = useMemo(
    () =>
      layoutForest(forest, {
        rootRadius: ROOT_RADIUS,
        radialGap: RADIAL_GAP,
        minNodeArc: MIN_NODE_ARC,
      }),
    [forest]
  );
  const { pos, minX, maxX, minY, maxY } = layout;

  const width = maxX - minX + PAD * 2;
  const height = maxY - minY + PAD * 2;
  const offsetX = -minX + PAD;
  const offsetY = -minY + PAD;

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
    const c1x = e.ax + dx * 0.55;
    const c1y = e.ay + dy * 0.15;
    const c2x = e.bx - dx * 0.15;
    const c2y = e.by - dy * 0.55;
    return `M ${e.ax} ${e.ay} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${e.bx} ${e.by}`;
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{
        width: `max(100%, ${width}px)`,
        height: "auto",
        display: "block",
        touchAction: "manipulation",
      }}
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
        <YarnSvgPatterns />
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
              data-yarn-node="true"
              transform={`translate(${cx}, ${cy})`}
              style={{
                cursor: tappable && onTap ? "pointer" : "default",
                opacity: cleared ? 0.18 : 1,
                transition: "opacity 280ms ease",
              }}
              onClick={tappable && onTap ? () => onTap(n.id) : undefined}
            >
              <title>{`node ${n.id}: ${yarnTitle(n.color)}`}</title>
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
                  r={NODE_R + 9}
                  fill="none"
                  stroke={n.color}
                  strokeWidth="2.4"
                  strokeOpacity="0.55"
                />
              )}
              <circle
                r={NODE_R}
                fill={n.color || "#dba66a"}
                stroke="#3b2a1a"
                strokeWidth="2"
              />
              <circle r={NODE_R - 2} fill={`url(#${yarnPatternId(n.color)})`} />
              {isRoot && (
                <circle r={NODE_R - 10} fill="none" stroke="#2a1d10" strokeWidth="1.8" />
              )}
              {tappable && <circle r={NODE_R + 18} fill="transparent" />}
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
const PRESSURE_TARGET = {
  minPlacements: 1,
  maxPlacements: 3,
  maxPeak: 3,
};

function buildInitialGameStateFromActivationOrder(activationOrder, spoolCapacity = NUM_SPOOLS) {
  const queue = activationOrder.map((b) => ({ ...b }));
  const active = [];
  for (let i = 0; i < 3 && queue.length > 0; i++) {
    const basket = queue.shift();
    active.push({ ...basket, slots: [] });
  }
  while (active.length < 3) active.push(null);

  return { queue, active, spools: new Array(spoolCapacity).fill(null) };
}

function buildInitialGameState(forest, baskets, spoolCapacity = NUM_SPOOLS) {
  const routed = buildInitialGameStateFromActivationOrder(
    baskets.slice().reverse(),
    spoolCapacity
  );
  const visible = new Set(forest.rootIds);
  const cleared = new Set();
  return { ...routed, visible, cleared };
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
      newActive[slotIdx] = { ...queue[0], slots: [] };
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
  return applyTapWithOptions(state, forest, nodeId, { spoolCapacity: state.spools.length });
}

function applyTapWithOptions(state, forest, nodeId, opts = {}) {
  const spoolCapacity = opts.spoolCapacity ?? state.spools.length;
  const node = forest.nodes[nodeId];
  if (state.cleared.has(nodeId)) return { state, ok: false, reason: "already cleared" };
  if (!state.visible.has(nodeId)) return { state, ok: false, reason: "not visible" };

  // Step 1: try to place in matching basket. If none, try spool. Else block.
  let newActive = state.active;
  let newQueue = state.queue;
  let newSpools = state.spools;
  let wentToSpool = false;

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
        newActive[slotIdx] = { ...newQueue[0], slots: [] };
        newQueue = newQueue.slice(1);
      } else {
        newActive[slotIdx] = null;
      }
    }
  } else {
    // Try spool
    if (spoolCapacity === 0) {
      return { state, ok: false, reason: "no matching basket" };
    }
    const spoolIdx = newSpools.findIndex((s) => s === null);
    if (spoolIdx === -1) {
      return { state, ok: false, reason: "no matching basket and no spool space" };
    }
    newSpools = newSpools.slice();
    newSpools[spoolIdx] = node.color;
    wentToSpool = true;
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
    wentToSpool,
  };
}

function getTappableNodeIds(state) {
  const ids = [];
  for (const id of state.visible) {
    if (!state.cleared.has(id)) ids.push(id);
  }
  return ids;
}

function makeStateForSimulation(forest, activationOrder, spoolCapacity) {
  const routed = buildInitialGameStateFromActivationOrder(activationOrder, spoolCapacity);
  return {
    ...routed,
    visible: new Set(forest.rootIds),
    cleared: new Set(),
  };
}

function makeSafePreferenceOrder(baskets) {
  const order = [];
  for (const basket of baskets.slice().reverse()) {
    order.push(...basket.nodeIds);
  }
  return order;
}

function solveWithPreferredOrder(forest, activationOrder, preferredNodeOrder, spoolCapacity) {
  const rank = new Map(preferredNodeOrder.map((id, i) => [id, i]));
  let state = makeStateForSimulation(forest, activationOrder, spoolCapacity);
  const trace = [];
  let spoolPlacements = 0;
  let peakSpoolOccupancy = 0;

  while (state.cleared.size < forest.nodes.length) {
    const tappable = getTappableNodeIds(state).sort(
      (a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity)
    );
    let chosen = null;
    for (const id of tappable) {
      const result = applyTapWithOptions(state, forest, id, { spoolCapacity });
      if (result.ok) {
        chosen = { id, result };
        break;
      }
    }
    if (!chosen) {
      return { ok: false, trace, spoolPlacements, peakSpoolOccupancy };
    }

    state = chosen.result.state;
    if (chosen.result.wentToSpool) spoolPlacements++;
    peakSpoolOccupancy = Math.max(
      peakSpoolOccupancy,
      state.spools.filter((s) => s !== null).length
    );
    trace.push(chosen.id);
  }

  return { ok: true, trace, spoolPlacements, peakSpoolOccupancy };
}

function replayTrace(forest, activationOrder, trace, spoolCapacity) {
  let state = makeStateForSimulation(forest, activationOrder, spoolCapacity);
  let spoolPlacements = 0;
  let peakSpoolOccupancy = 0;

  for (const nodeId of trace) {
    const result = applyTapWithOptions(state, forest, nodeId, { spoolCapacity });
    if (!result.ok) {
      return { ok: false, spoolPlacements, peakSpoolOccupancy, reason: result.reason };
    }
    state = result.state;
    if (result.wentToSpool) spoolPlacements++;
    peakSpoolOccupancy = Math.max(
      peakSpoolOccupancy,
      state.spools.filter((s) => s !== null).length
    );
  }

  return {
    ok: state.cleared.size === forest.nodes.length,
    spoolPlacements,
    peakSpoolOccupancy,
  };
}

function pressureIsInTarget(metrics, target = PRESSURE_TARGET) {
  return (
    metrics.ok &&
    metrics.spoolPlacements >= target.minPlacements &&
    metrics.spoolPlacements <= target.maxPlacements &&
    metrics.peakSpoolOccupancy <= target.maxPeak
  );
}

function moveBasket(order, fromIdx, toIdx) {
  const next = order.slice();
  const [basket] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, basket);
  return next;
}

function encodeZeroSpoolState(state) {
  const visible = [...state.visible].sort((a, b) => a - b).join(",");
  const cleared = [...state.cleared].sort((a, b) => a - b).join(",");
  const active = state.active
    .map((b) => (b ? `${b.id}:${b.slots.length}` : "_"))
    .join(",");
  const queue = state.queue.map((b) => b.id).join(",");
  return `${visible}|${cleared}|${active}|${queue}`;
}

function hasZeroSpoolSolution(forest, activationOrder, maxStates = 4000) {
  const seen = new Set();
  let searched = 0;

  const dfs = (state) => {
    if (state.cleared.size === forest.nodes.length) return true;
    if (searched++ > maxStates) return null;

    const key = encodeZeroSpoolState(state);
    if (seen.has(key)) return false;
    seen.add(key);

    const activeColors = new Set(state.active.filter(Boolean).map((b) => b.color));
    const tappable = getTappableNodeIds(state)
      .filter((id) => activeColors.has(forest.nodes[id].color))
      .sort((a, b) => forest.nodes[b].depth - forest.nodes[a].depth);

    for (const nodeId of tappable) {
      const result = applyTapWithOptions(state, forest, nodeId, { spoolCapacity: 0 });
      if (!result.ok) continue;
      const child = dfs(result.state);
      if (child === true) return true;
      if (child === null) return null;
    }

    return false;
  };

  return dfs(makeStateForSimulation(forest, activationOrder, 0));
}

function shuffleCopy(items, rng) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function addSpoolPressure(forest, baskets, rng, opts = {}) {
  const spoolCapacity = opts.spoolCapacity ?? NUM_SPOOLS;
  const pressureTarget = opts.pressureTarget ?? PRESSURE_TARGET;
  const maxLag = opts.maxLag ?? 8;
  const safeActivationOrder = baskets.slice().reverse();
  const safePreference = makeSafePreferenceOrder(baskets);
  const safeSolve = solveWithPreferredOrder(forest, safeActivationOrder, safePreference, 0);
  if (!safeSolve.ok) {
    return { baskets, metrics: { pressured: false, reason: "safe-solve-failed" } };
  }

  const candidateEvents = shuffleCopy(
    safeSolve.trace.filter((nodeId) => forest.nodes[nodeId].parentId !== null),
    rng
  );
  let checkedCandidates = 0;
  const candidateBudget = forest.nodes.length > 90 ? 18 : forest.nodes.length > 60 ? 36 : 72;
  const zeroSpoolStateBudget =
    forest.nodes.length > 90 ? 300 : forest.nodes.length > 60 ? 1200 : 4000;
  let bestPressured = null;

  for (const nodeId of candidateEvents) {
    const basketId = forest.nodes[nodeId].basketId;
    const fromIdx = safeActivationOrder.findIndex((b) => b.id === basketId);
    if (fromIdx === -1) continue;

    for (let lag = 1; lag <= maxLag; lag++) {
      checkedCandidates++;
      if (checkedCandidates > candidateBudget) {
        return bestPressured || {
          baskets,
          metrics: { pressured: false, reason: "pressure-search-budget-exhausted" },
        };
      }
      const toIdx = Math.min(safeActivationOrder.length - 1, fromIdx + lag);
      if (toIdx === fromIdx) continue;

      const candidateOrder = moveBasket(safeActivationOrder, fromIdx, toIdx);
      const replay = replayTrace(forest, candidateOrder, safeSolve.trace, spoolCapacity);
      if (!replay.ok || replay.peakSpoolOccupancy > pressureTarget.maxPeak) continue;

      const zeroSpool = hasZeroSpoolSolution(forest, candidateOrder, zeroSpoolStateBudget);
      if (zeroSpool !== false) continue;

      const pressuredCandidate = {
        baskets: candidateOrder.slice().reverse(),
        metrics: {
          pressured: true,
          spoolPlacements: replay.spoolPlacements,
          peakSpoolOccupancy: replay.peakSpoolOccupancy,
          zeroSpoolRejected: true,
        },
      };

      if (pressureIsInTarget(replay, pressureTarget)) return pressuredCandidate;

      if (
        !bestPressured ||
        replay.spoolPlacements > bestPressured.metrics.spoolPlacements ||
        (replay.spoolPlacements === bestPressured.metrics.spoolPlacements &&
          replay.peakSpoolOccupancy > bestPressured.metrics.peakSpoolOccupancy)
      ) {
        bestPressured = pressuredCandidate;
      }
    }
  }

  return bestPressured || {
    baskets,
    metrics: { pressured: false, reason: "no-certified-pressure-order" },
  };
}

function generatePressuredPuzzle({ numBaskets, seed, spoolCapacity, pressureTarget, maxLag }) {
  let fallback = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const attemptSeed = (seed + attempt * 7919) >>> 0;
    const forest = generateForest({ numBaskets, seed: attemptSeed });
    const colorRng = makeRng(attemptSeed ^ 0xb45c0107);
    const baskets = colorForestAndMakeBaskets(forest, colorRng);
    const pressureRng = makeRng(attemptSeed ^ 0x91e10da5);
    const pressured = addSpoolPressure(forest, baskets, pressureRng, {
      spoolCapacity,
      pressureTarget,
      maxLag,
    });
    if (!fallback) fallback = { forest, baskets, pressure: pressured.metrics };
    if (pressured.metrics.pressured) {
      return { forest, baskets: pressured.baskets, pressure: pressured.metrics };
    }
  }
  return fallback;
}

// ────────────────────────────────────────────────────────────────────────────
// APP
// ────────────────────────────────────────────────────────────────────────────

const FONT_DISPLAY = `"Fraunces", "Cormorant Garamond", "Iowan Old Style", Georgia, serif`;
const FONT_BODY = `"Inter Tight", "Söhne", "Helvetica Neue", system-ui, sans-serif`;
const FONT_MONO = `"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace`;
const DIFFICULTIES = [
  {
    id: "easy",
    label: "Easy",
    baskets: 12,
    spools: 5,
    pressureTarget: { minPlacements: 1, maxPlacements: 3, maxPeak: 3 },
    maxLag: 8,
  },
  {
    id: "medium",
    label: "Medium",
    baskets: 18,
    spools: 4,
    pressureTarget: { minPlacements: 2, maxPlacements: 5, maxPeak: 4 },
    maxLag: 12,
  },
  {
    id: "hard",
    label: "Hard",
    baskets: 24,
    spools: 3,
    pressureTarget: { minPlacements: 3, maxPlacements: 7, maxPeak: 3 },
    maxLag: 16,
  },
];

export default function App() {
  const [difficulty, setDifficulty] = useState("medium");
  const [seed, setSeed] = useState(42);
  const [debugOpen, setDebugOpen] = useState(false);
  const [shake, setShake] = useState(0);
  const [recenterKey, setRecenterKey] = useState(0);
  const difficultyConfig =
    DIFFICULTIES.find((option) => option.id === difficulty) || DIFFICULTIES[1];
  const numBaskets = difficultyConfig.baskets;

  const { forest, baskets, pressure } = useMemo(
    () =>
      generatePressuredPuzzle({
        numBaskets,
        seed,
        spoolCapacity: difficultyConfig.spools,
        pressureTarget: difficultyConfig.pressureTarget,
        maxLag: difficultyConfig.maxLag,
      }),
    [numBaskets, seed, difficultyConfig]
  );

  const [game, setGame] = useState(() =>
    buildInitialGameState(forest, baskets, difficultyConfig.spools)
  );

  useEffect(() => {
    setGame(buildInitialGameState(forest, baskets, difficultyConfig.spools));
  }, [forest, baskets, difficultyConfig.spools]);

  const reroll = useCallback(() => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  }, []);

  const changeDifficulty = useCallback((nextDifficulty) => {
    setDifficulty(nextDifficulty);
    setSeed(Math.floor(Math.random() * 1_000_000));
  }, []);

  const restart = useCallback(() => {
    setGame(buildInitialGameState(forest, baskets, difficultyConfig.spools));
    setRecenterKey((key) => key + 1);
  }, [forest, baskets, difficultyConfig.spools]);

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
        button.ypseg {
          font-family: ${FONT_MONO};
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          padding: 7px 10px;
          border: 0;
          border-right: 1.5px solid #2a1d10;
          background: transparent;
          color: #2a1d10;
          cursor: pointer;
        }
        button.ypseg:last-child { border-right: 0; }
        button.ypseg.active { background: #2a1d10; color: #f7ecd4; }
        button.ypmapbtn {
          width: 30px;
          height: 30px;
          border: 0;
          background: transparent;
          color: #2a1d10;
          font-family: ${FONT_MONO};
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
        }
        button.ypmapbtn:hover { background: rgba(42, 29, 16, 0.1); }
        button.ypmapbtn:disabled {
          opacity: 0.35;
          cursor: default;
        }
        button.ypmapbtn:disabled:hover { background: transparent; }
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
        .yp-baskets { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        @media (max-width: 720px) {
          .yp-header { align-items: flex-start !important; flex-direction: column; }
          .yp-actions { width: 100%; }
          .yp-actions .ypbtn { flex: 1; min-width: 0; padding-left: 10px; padding-right: 10px; }
        }
        @media (max-width: 460px) {
          .yp-baskets { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <header
          className="yp-header"
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            borderBottom: "1.5px solid #2a1d10",
            paddingBottom: 14,
            marginBottom: 18,
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
                fontSize: "clamp(34px, 5.6vw, 58px)",
                lineHeight: 0.95,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              tug a thread,
              <br />
              <span style={{ fontStyle: "normal", fontWeight: 600 }}>untangle</span>
              <span style={{ color: YARN_COLORS[0].hex }}>.</span>
            </h1>
          </div>
          <div className="yp-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div
              aria-label="Difficulty"
              style={{
                display: "flex",
                border: "1.5px solid #2a1d10",
              }}
            >
              {DIFFICULTIES.map((option) => (
                <button
                  key={option.id}
                  className={`ypseg${difficulty === option.id ? " active" : ""}`}
                  onClick={() => changeDifficulty(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
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

        {/* FOREST CANVAS */}
        <section
          style={{
            background: "#fbf3df",
            border: "2px solid #2a1d10",
            padding: "14px 14px 6px",
            position: "relative",
            boxShadow: "8px 8px 0 #2a1d10",
            marginTop: 16,
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
          <ForestViewport focusKey={`${difficulty}-${seed}-${recenterKey}`}>
            <ForestSVG
              forest={forest}
              visibleIds={game.visible}
              clearedIds={game.cleared}
              tappableIds={tappableIds}
              onTap={onTap}
            />
          </ForestViewport>
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
            {debugOpen ? "▾" : "▸"}  Debug · current puzzle
          </button>

          {debugOpen && (
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 28 }}>
              <div>
                <DebugLabel>Up next</DebugLabel>
                <QueuePeek queue={game.queue} />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(6, 1fr)",
                  border: "1.5px solid #2a1d10",
                }}
              >
                {[
                  ["Difficulty", difficultyConfig.label],
                  ["Spools", difficultyConfig.spools],
                  ["Nodes", `${forest.actual} / ${forest.target}`],
                  ["Roots", stats.rootCount],
                  ["Leaves", stats.leafCount],
                  [
                    "Pressure",
                    pressure.pressured
                      ? `${pressure.spoolPlacements} / ${pressure.peakSpoolOccupancy}`
                      : "safe",
                  ],
                ].map(([label, value], i) => (
                  <div
                    key={label}
                    style={{
                      padding: "14px 16px",
                      borderRight: i < 5 ? "1.5px solid #2a1d10" : "none",
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
                <DebugLabel>Basket order</DebugLabel>
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
                  {pressure.pressured ? " · pressure order certified" : " · pressure fallback"}
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
                        title={`creation #${i + 1}  ·  activates #${activationIdx + 1}  ·  ${yarnTitle(b.color)}`}
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
                                ...yarnFillStyle(b.color),
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
                              background: i === 0 ? YARN_COLORS[0].hex : YARN_COLORS[1].hex,
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

function ForestViewport({ children, focusKey }) {
  const ref = useRef(null);
  const dragRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const canZoomOut = zoom > 0.36;
  const canZoomIn = zoom < 0.99;

  const recenter = useCallback(() => {
    const viewport = ref.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
  }, []);

  const updateZoom = useCallback((nextZoom) => {
    setZoom((currentZoom) => {
      const viewport = ref.current;
      const clampedZoom = Math.max(0.35, Math.min(1, nextZoom));
      if (!viewport || clampedZoom === currentZoom) return clampedZoom;

      const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
      const centerY = viewport.scrollTop + viewport.clientHeight / 2;
      const ratio = clampedZoom / currentZoom;
      requestAnimationFrame(() => {
        viewport.scrollLeft = centerX * ratio - viewport.clientWidth / 2;
        viewport.scrollTop = centerY * ratio - viewport.clientHeight / 2;
      });
      return clampedZoom;
    });
  }, []);

  useEffect(() => {
    setZoom(1);
    requestAnimationFrame(recenter);
  }, [focusKey, recenter]);

  const onPointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target.closest?.("[data-yarn-node='true']")) return;
    const viewport = ref.current;
    if (!viewport) return;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    const viewport = ref.current;
    if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    viewport.scrollLeft = drag.scrollLeft - dx;
    viewport.scrollTop = drag.scrollTop - dy;
  }, []);

  const endPointerDrag = useCallback((event) => {
    const drag = dragRef.current;
    const viewport = ref.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    requestAnimationFrame(() => {
      if (dragRef.current === drag) dragRef.current = null;
    });
  }, []);

  const onClickCapture = useCallback((event) => {
    if (!dragRef.current?.moved) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onWheel = useCallback(
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      updateZoom(zoom + delta);
    },
    [updateZoom, zoom]
  );

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
        onClickCapture={onClickCapture}
        onWheel={onWheel}
        style={{
          height: "clamp(360px, 58vh, 640px)",
          overflow: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <div
          style={{
            display: "inline-block",
            zoom,
            minWidth: "100%",
          }}
        >
          {children}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          display: "flex",
          gap: 4,
          padding: 4,
          background: "rgba(251, 243, 223, 0.86)",
          border: "1.5px solid #2a1d10",
          boxShadow: "2px 2px 0 rgba(42, 29, 16, 0.24)",
        }}
      >
        <button
          className="ypmapbtn"
          disabled={!canZoomOut}
          onClick={() => updateZoom(zoom - 0.12)}
          title="Zoom out"
        >
          -
        </button>
        <button className="ypmapbtn" onClick={recenter} title="Recenter">
          ⊙
        </button>
        <button
          className="ypmapbtn"
          disabled={!canZoomIn}
          onClick={() => updateZoom(zoom + 0.12)}
          title="Zoom toward default"
        >
          +
        </button>
      </div>
    </div>
  );
}

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

function QueuePeek({ queue }) {
  if (queue.length === 0) {
    return (
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          opacity: 0.45,
        }}
      >
        no queued baskets
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {queue.slice(0, 12).map((b, i) => (
        <div
          key={i}
          title={yarnTitle(b.color)}
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            ...yarnFillStyle(b.color),
            border: "1.4px solid #2a1d10",
            opacity: 1 - i * 0.045,
          }}
        />
      ))}
      {queue.length > 12 && (
        <span
          style={{
            alignSelf: "center",
            marginLeft: 4,
            fontFamily: FONT_MONO,
            fontSize: 10,
            letterSpacing: "0.18em",
            opacity: 0.6,
          }}
        >
          +{queue.length - 12}
        </span>
      )}
    </div>
  );
}

function BasketsRow({ active, shakeKey }) {
  return (
    <section
      key={`shake-${shakeKey}`}
      className={`yp-baskets${shakeKey > 0 ? " yp-shake" : ""}`}
      style={{
        display: "grid",
        gap: 6,
        maxWidth: 410,
        margin: "0 auto",
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
          border: "1.5px dashed rgba(42, 29, 16, 0.42)",
          background: "transparent",
          padding: "5px 6px",
          display: "flex",
          alignItems: "center",
          minHeight: 38,
          opacity: 0.4,
        }}
      >
        <div style={{ display: "flex", gap: 4, flex: 1, justifyContent: "center" }}>
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                aspectRatio: "1 / 1",
                maxWidth: 28,
                border: "1.5px dashed rgba(42, 29, 16, 0.46)",
                borderRadius: "50%",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      title={yarnTitle(basket.color)}
      style={{
        border: "1.5px solid #2a1d10",
        ...yarnFillStyle(basket.color),
        padding: "5px 6px",
        boxShadow: "2px 2px 0 rgba(42, 29, 16, 0.34)",
        display: "flex",
        alignItems: "center",
        minHeight: 38,
        opacity: 0.92,
      }}
    >
      <div style={{ display: "flex", gap: 4, flex: 1, justifyContent: "center" }}>
        {[0, 1, 2].map((s) => {
          const filled = basket.slots[s] !== undefined;
          return (
            <div
              key={s}
              style={{
                flex: 1,
                aspectRatio: "1 / 1",
                maxWidth: 28,
                border: "1.5px solid #2a1d10",
                borderRadius: "50%",
                background: "#fbf3df",
                boxShadow: filled
                  ? "inset 0 1px 0 rgba(255,255,255,0.42)"
                  : "inset 2px 2px 0 rgba(42, 29, 16, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {filled && (
                <div
                  className="yp-pop"
                  style={{
                    width: "72%",
                    height: "72%",
                    borderRadius: "50%",
                    ...yarnFillStyle(basket.color),
                    border: "1.4px solid #2a1d10",
                    boxShadow: "inset 0 0 0 3px rgba(251, 243, 223, 0.5)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpoolsRow({ spools }) {
  return (
    <section
      style={{
        marginTop: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "4px 0",
      }}
    >
      {spools.map((color, i) => (
        <div
          key={i}
          title={color ? yarnTitle(color) : `empty spool ${i + 1}`}
          style={{
            width: 28,
            height: 28,
            border: "1.5px solid rgba(42, 29, 16, 0.7)",
            borderRadius: "50%",
            ...(color ? yarnFillStyle(color) : { background: "rgba(42, 29, 16, 0.035)" }),
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
                inset: 3,
                borderRadius: "50%",
                ...yarnFillStyle(color),
                border: "1.25px solid #2a1d10",
                boxShadow: "inset 0 0 0 3px rgba(251, 243, 223, 0.45)",
              }}
            />
          )}
        </div>
      ))}
    </section>
  );
}
