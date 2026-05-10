import {
  NUM_SPOOLS,
  applyTapWithOptions,
  buildInitialGameStateFromActivationOrder,
  getTappableNodeIds,
} from "./game-state.js";

// Basket assignment and basket-order pressure are UI-free.
//
// This module owns the basket phase only. It accepts a forest with this minimal
// interface:
// - `forest.nodes`: array of nodes indexed by id.
// - node fields: `{ id, parentId, children, depth }`.
// - `forest.rootIds`: ids visible at game start.
//
// It deliberately does not create forests or seeds. Callers provide the forest
// and RNG streams so basket assignment can be tested independently from forest
// shape generation.
//
// High-level basket algorithm:
// 1. Clone and color the supplied forest from leaves toward roots. A node can
//    only enter the ready pool after all children are colored, which guarantees
//    that the reversed basket order has a safe solution.
// 2. Build baskets in groups of three nodes. Every basket owns exactly the
//    three nodes colored during that loop, and all three share one color.
// 3. Optionally perturb the otherwise-safe basket activation order. A candidate
//    perturbation is accepted only if a witness solver can still finish with
//    spools, and a zero-spool search cannot finish. That gives the puzzle some
//    pressure without abandoning solvability-by-construction.

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

function cloneForestForBasketAssignment(forest) {
  return {
    ...forest,
    rootIds: forest.rootIds.slice(),
    nodes: forest.nodes.map((node) => ({
      ...node,
      children: node.children.slice(),
    })),
  };
}

export function assignBasketsToForest(forest, rng) {
  // Ready is the moving frontier of nodes that are legal to color now. It
  // starts at leaves and promotes a parent the instant its last child is
  // colored. Because promotion happens inside the basket loop, a basket may
  // contain a child and an ancestor from the same chain.
  const coloredForest = cloneForestForBasketAssignment(forest);
  const { nodes } = coloredForest;
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
  return { forest: coloredForest, baskets };
}

export const colorForestAndMakeBaskets = assignBasketsToForest;

// Simulation helpers use the same reducer as real gameplay. They differ only
// in activation order and spool capacity, which lets generation prove facts
// about a candidate puzzle without maintaining a parallel rules engine.
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
  // Baskets are created leaf-first. Activating them in reverse means currently
  // visible roots wait until their descendants have been cleared, so this order
  // is the baseline certificate that the colored forest is solvable.
  const order = [];
  for (const basket of baskets.slice().reverse()) {
    order.push(...basket.nodeIds);
  }
  return order;
}

export function solveWithPreferredOrder(forest, activationOrder, preferredNodeOrder, spoolCapacity) {
  // Greedy witness solver: repeatedly scan currently tappable nodes in a known
  // safe preference order and take the first legal move. This is not a player
  // hint system; it is a deterministic certificate used while generating.
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
  // DFS over the game state with spoolCapacity = 0. `true` means the candidate
  // is too easy because it can be solved without spools. `false` means spools
  // are required. `null` means the search budget ran out, so generation rejects
  // the candidate rather than trusting an incomplete proof.
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
  // Pressure is easiest to feel when an early player-facing color is delayed.
  // Start from the safe witness trace, prioritize early non-root nodes, add
  // slight seeded jitter for variety, then cap the list for generation cost.
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
  // Start from the safe activation order, then try moving one basket later in
  // that order. A move is accepted only when the normal solver can complete
  // with the configured spools and the zero-spool solver cannot complete.
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
