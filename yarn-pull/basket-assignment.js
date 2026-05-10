import { generateForest, makeRng } from "./forest-generation.js";
import {
  NUM_SPOOLS,
  applyTapWithOptions,
  buildInitialGameStateFromActivationOrder,
  getTappableNodeIds,
} from "./game-state.js";

// Basket assignment and basket-order pressure are UI-free.
// COLORING + BASKET CREATION (Step 2 of the spec)
// One pick at a time within a basket — parent promotion happens immediately
// so chains can collapse inside a single basket.
// ────────────────────────────────────────────────────────────────────────────

export const YARN_COLORS = [
  { hex: "#36b7c9", name: "aqua", pattern: "cross" },
  { hex: "#ffe055", name: "sunshine", pattern: "vertical" },
  { hex: "#b9dc4a", name: "lime", pattern: "horizontal" },
  { hex: "#4fb487", name: "mint leaf", pattern: "forward" },
  { hex: "#ffad7a", name: "peach", pattern: "back" },
  { hex: "#e170b8", name: "dragonfruit", pattern: "dots-light" },
  { hex: "#ff7c86", name: "watermelon", pattern: "grid" },
  { hex: "#a98be8", name: "ube", pattern: "wide-forward" },
  { hex: "#4f7fe8", name: "blue smoothie", pattern: "dots-dark" },
  { hex: "#ffd0a6", name: "papaya cream", pattern: "wide-back" },
];

export const PALETTE = YARN_COLORS.map((color) => color.hex);
export function assignBasketsToForest(forest, rng) {
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

export const colorForestAndMakeBaskets = assignBasketsToForest;

// ────────────────────────────────────────────────────────────────────────────
function makeStateForSimulation(forest, activationOrder, spoolCapacity) {
  const routed = buildInitialGameStateFromActivationOrder(activationOrder, spoolCapacity);
  return {
    ...routed,
    visible: new Set(forest.rootIds),
    cleared: new Set(),
    clearedOrder: [],
  };
}

export function makeSafePreferenceOrder(baskets) {
  const order = [];
  for (const basket of baskets.slice().reverse()) {
    order.push(...basket.nodeIds);
  }
  return order;
}

export function solveWithPreferredOrder(forest, activationOrder, preferredNodeOrder, spoolCapacity) {
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

function makePressureCandidateEvents(forest, trace, rng, opts = {}) {
  const earlyCandidateRatio = opts.earlyCandidateRatio ?? 0.6;
  const candidateLimit = opts.candidateLimit ?? Infinity;
  const randomJitter = opts.randomJitter ?? 4;
  const events = trace
    .map((nodeId, traceIdx) => ({ nodeId, traceIdx, node: forest.nodes[nodeId] }))
    .filter(({ node }) => node.parentId !== null)
    .map(({ nodeId, traceIdx, node }) => ({
      nodeId,
      // Low trace positions are colors the player encounters early. Depth keeps
      // the search from only targeting root-adjacent nodes on very broad trees.
      priority: traceIdx + node.depth * 2 + rng() * randomJitter,
    }))
    .sort((a, b) => a.priority - b.priority);

  const preferredCount = Math.max(6, Math.ceil(events.length * earlyCandidateRatio));
  const preferred = events.slice(0, preferredCount).map((event) => event.nodeId);
  const rest = shuffleCopy(events.slice(preferredCount).map((event) => event.nodeId), rng);
  return [...preferred, ...rest].slice(0, candidateLimit);
}

export function addSpoolPressure(forest, baskets, rng, opts = {}) {
  const spoolCapacity = opts.spoolCapacity ?? NUM_SPOOLS;
  const maxLag = opts.maxLag ?? 8;
  const forcedSpoolChance = opts.forcedSpoolChance ?? 1;
  if (rng() > forcedSpoolChance) {
    return { baskets, metrics: { pressured: false, reason: "pressure-skipped" } };
  }

  const safeActivationOrder = baskets.slice().reverse();
  const safePreference = makeSafePreferenceOrder(baskets);
  const safeSolve = solveWithPreferredOrder(forest, safeActivationOrder, safePreference, 0);
  if (!safeSolve.ok) {
    return { baskets, metrics: { pressured: false, reason: "safe-solve-failed" } };
  }

  const candidateEvents = makePressureCandidateEvents(forest, safeSolve.trace, rng, opts);
  let checkedCandidates = 0;
  const candidateBudget =
    opts.candidateBudget ?? (forest.nodes.length > 90 ? 36 : forest.nodes.length > 60 ? 72 : 120);
  const zeroSpoolStateBudget =
    forest.nodes.length > 90 ? 300 : forest.nodes.length > 60 ? 1200 : 4000;

  for (const nodeId of candidateEvents) {
    const basketId = forest.nodes[nodeId].basketId;
    const fromIdx = safeActivationOrder.findIndex((b) => b.id === basketId);
    if (fromIdx === -1) continue;

    for (let lag = maxLag; lag >= 1; lag--) {
      checkedCandidates++;
      if (checkedCandidates > candidateBudget) {
        return {
          baskets,
          metrics: { pressured: false, reason: "pressure-search-budget-exhausted" },
        };
      }

      const toIdx = Math.min(safeActivationOrder.length - 1, fromIdx + lag);
      if (toIdx === fromIdx) continue;

      const candidateOrder = moveBasket(safeActivationOrder, fromIdx, toIdx);
      const witness = solveWithPreferredOrder(
        forest,
        candidateOrder,
        safePreference,
        spoolCapacity
      );
      if (!witness.ok) continue;

      const zeroSpool = hasZeroSpoolSolution(forest, candidateOrder, zeroSpoolStateBudget);
      if (zeroSpool !== false) continue;

      return {
        baskets: candidateOrder.slice().reverse(),
        metrics: {
          pressured: true,
          forcedSpool: true,
          delayMoves: 1,
          spoolPlacements: witness.spoolPlacements,
          peakSpoolOccupancy: witness.peakSpoolOccupancy,
          zeroSpoolRejected: true,
        },
      };
    }
  }

  return {
    baskets,
    metrics: { pressured: false, reason: "no-certified-pressure-order" },
  };
}

export function generatePressuredPuzzle({
  numBaskets,
  seed,
  spoolCapacity,
  maxLag,
  forcedSpoolChance,
  earlyCandidateRatio,
  candidateBudget,
  candidateLimit,
}) {
  let fallback = null;
  const pressureEnabled =
    forcedSpoolChance === undefined || makeRng(seed ^ 0x51a7e1ed)() <= forcedSpoolChance;
  for (let attempt = 0; attempt < 8; attempt++) {
    const attemptSeed = (seed + attempt * 7919) >>> 0;
    const forest = generateForest({ numBaskets, seed: attemptSeed });
    const colorRng = makeRng(attemptSeed ^ 0xb45c0107);
    const baskets = assignBasketsToForest(forest, colorRng);
    const pressureRng = makeRng(attemptSeed ^ 0x91e10da5);
    const pressured = addSpoolPressure(forest, baskets, pressureRng, {
      spoolCapacity,
      maxLag,
      forcedSpoolChance: pressureEnabled ? 1 : 0,
      earlyCandidateRatio,
      candidateBudget,
      candidateLimit,
    });
    if (!fallback) fallback = { forest, baskets, pressure: pressured.metrics };
    if (pressured.metrics.pressured) {
      return { forest, baskets: pressured.baskets, pressure: pressured.metrics };
    }
  }
  return fallback;
}

export const generateYarnPullPuzzle = generatePressuredPuzzle;

// ────────────────────────────────────────────────────────────────────────────
