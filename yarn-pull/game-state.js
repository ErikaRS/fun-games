// Yarn-pull runtime rules: basket routing, spools, visibility, and taps.
//
// State model:
// - `queue` contains future baskets in activation order.
// - `active` is the fixed set of up to three currently visible baskets. A full
//   basket is immediately replaced by the next queued basket, or by null.
// - `spools` are temporary holding slots for colors that do not currently match
//   an active basket.
// - `visible` starts with roots; clearing a node reveals its children.
// - `cleared` and `clearedOrder` are the immutable history used by rendering,
//   win checks, and undo snapshots.
//
// Tap algorithm:
// 1. Reject taps on cleared or hidden nodes.
// 2. Route the node color to a matching active basket when possible.
// 3. Otherwise place the color in the first open spool, or reject if full.
// 4. Mark the node cleared, reveal its children, then auto-flush any spooled
//    colors that now match active baskets. Flushing repeats because filling one
//    basket can activate another basket that accepts more spooled colors.

export const NUM_SPOOLS = 5;

export function buildInitialGameStateFromActivationOrder(activationOrder, spoolCapacity = NUM_SPOOLS) {
  // Generation and gameplay both provide baskets in activation order here. The
  // public buildInitialGameState wrapper reverses creation order because basket
  // creation is leaf-first while play begins at roots.
  const queue = activationOrder.map((b) => ({ ...b }));
  const active = [];
  for (let i = 0; i < 3 && queue.length > 0; i++) {
    const basket = queue.shift();
    active.push({ ...basket, slots: [] });
  }
  while (active.length < 3) active.push(null);

  return { queue, active, spools: new Array(spoolCapacity).fill(null) };
}

export function buildInitialGameState(forest, baskets, spoolCapacity = NUM_SPOOLS) {
  const routed = buildInitialGameStateFromActivationOrder(
    baskets.slice().reverse(),
    spoolCapacity
  );
  const visible = new Set(forest.rootIds);
  const cleared = new Set();
  return { ...routed, visible, cleared, clearedOrder: [] };
}

function findPreferredBasketSlot(active, color) {
  // Prefer partially filled baskets of the same color before empty baskets.
  // This keeps duplicate active colors from splitting one color across baskets
  // unnecessarily.
  const partialIdx = active.findIndex(
    (b) => b && b.color === color && b.slots.length > 0 && b.slots.length < 3
  );
  if (partialIdx !== -1) return partialIdx;
  return active.findIndex((b) => b && b.color === color && b.slots.length < 3);
}

// Internal helper: place a single node-color into the first matching active
// basket. Returns updated `active` and `queue`, or null if no slot available.
function tryPlaceColorInBasket(active, queue, color) {
  const slotIdx = findPreferredBasketSlot(active, color);
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

export function applyTap(state, forest, nodeId) {
  return applyTapWithOptions(state, forest, nodeId, { spoolCapacity: state.spools.length });
}

export function applyTapWithOptions(state, forest, nodeId, opts = {}) {
  // Reducer-style transition: this function returns a new state object and
  // avoids mutating the caller's sets/arrays. Generation relies on that when it
  // branches through many hypothetical states during solver searches.
  const spoolCapacity = opts.spoolCapacity ?? state.spools.length;
  const node = forest.nodes[nodeId];
  if (state.cleared.has(nodeId)) return { state, ok: false, reason: "already cleared" };
  if (!state.visible.has(nodeId)) return { state, ok: false, reason: "not visible" };

  // Step 1: try to place in matching basket. If none, try spool. Else block.
  let newActive = state.active;
  let newQueue = state.queue;
  let newSpools = state.spools;
  let wentToSpool = false;

  const slotIdx = findPreferredBasketSlot(newActive, node.color);

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
  const newClearedOrder = [...(state.clearedOrder || []), nodeId];

  // Auto-flush
  const flushed = autoFlush(newActive, newQueue, newSpools);

  return {
    state: {
      queue: flushed.queue,
      active: flushed.active,
      visible: newVisible,
      cleared: newCleared,
      clearedOrder: newClearedOrder,
      spools: flushed.spools,
    },
    ok: true,
    wentToSpool,
  };
}

export function getTappableNodeIds(state) {
  const ids = [];
  for (const id of state.visible) {
    if (!state.cleared.has(id)) ids.push(id);
  }
  return ids;
}

export function getPlayableNodeIds(state, forest) {
  return getTappableNodeIds(state).filter(
    (id) => applyTapWithOptions(state, forest, id).ok
  );
}
