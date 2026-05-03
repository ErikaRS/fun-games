# Yarn Pull — Game Specification

## Concept
A puzzle game where the player sorts colored nodes from a hidden forest structure into color-matched baskets. The forest is revealed top-down as nodes are cleared. The puzzle is procedurally generated and guaranteed solvable by construction.

---

## Data Model

### Forest
A collection of trees where each **node** has:
- A color (assigned during generation)
- Zero or more children
- At most one parent (roots have none)

Roots are initially visible. A node becomes **available** (tappable) when its parent has been cleared, or it is a root.

### Baskets
- Each basket has a **color** and **3 slots**
- At most **3 baskets are active** at any time
- When a basket fills, it is replaced in-place by the next queued basket
- There are **N total baskets** in a puzzle (configurable)

### Spools
- **5 holding spools**, each can hold one node's color
- A spool is filled when a tapped node has no matching active basket
- After every state change, **auto-flush** runs: any spool whose color matches an active basket empties into that basket
- Auto-flush repeats until stable, since flushing can fill a basket, advance the queue, and unlock further flushes

---

## Gameplay

### On tap
1. Player taps an available node
2. Node's color is routed:
   - If an active basket matches and has space → place in basket
   - Else if any spool is empty → place in the first empty spool
   - Else → **tap is blocked** (this is the loss state, see below)
3. Node's children become available (revealed)
4. Node is marked cleared
5. If a basket was filled by step 2 → replace in-place with next queued basket
6. Auto-flush spools (repeat until stable)

### Loss condition
A tap is attempted on a node whose color matches no active basket AND all 5 spools are occupied. Equivalently: every available node's color matches no active basket, and all spools are full.

### Win condition
All nodes cleared. By construction, the nodes exactly fill all baskets, so this coincides with all baskets being completed.

---

## Procedural Generation

### Step 1 — Grow the forest
- Target node count = `numBaskets × 3`
- Generate **2–4 root nodes**
- Grow **breadth-first**, sharing a budget counter
- Each node independently picks its child count:
  - 0 children: 1%
  - 1 child: 49%
  - 2 children: 25%
  - 3 children: 15%
  - 4 children: 10%
- Most paths will be roughly — but not exactly — the same height
- If budget runs out, the current node gets fewer children than rolled

### Step 2 — Assign colors and create baskets simultaneously
This phase both colors the tree and creates the basket list. They are coupled by design to guarantee solvability.

**A node is "ready" when:** it is a leaf (no children) OR every one of its children already has an assigned color.

**Algorithm:**
1. Maintain a ready set, initially all leaf nodes
2. Repeat until all nodes are colored:
   - Randomly generate a new basket color (any color, no constraints)
   - For k = 1..3:
     - Pick any 1 ready node, **remove it from ready**, assign it the basket color
     - If its parent's children are now all colored, add the parent to ready **immediately** (so it can be picked later in this same basket)
3. Each iteration produces one basket; the order of iteration = basket creation order

**Key properties:**
- Picks happen one at a time, not three at once. A chain like root→child→grandchild can be fully colored within a single basket, because each pick promotes its parent into ready before the next pick happens. This is what keeps the ready set populated until the very end.
- No constraints on color relationships between parent and child
- Colors may repeat freely across baskets
- Not all palette colors need to appear
- By construction, exactly `numBaskets × 3` nodes are colored and exactly `numBaskets × 3` basket slots exist — win and all-cleared are identical events

**Failure mode:** if the ready set is ever empty while uncolored nodes remain, generation fails loudly. This should not occur given the forest shape distribution above, but the assertion catches any future regression.

### Step 3 — Derive basket activation order
The basket creation order from Step 2 goes leaves-first, roots-last. The last baskets created correspond to root nodes — the ones visible at game start.

**Approach:** reverse the creation order. Roots were colored last, so their baskets activate first. Leaves were colored first, so their baskets activate last. This guarantees that whenever a basket is active, nodes of that color are either already visible or will be revealed by clearing their parents, which are themselves already active or completed.

This reversal alone is sufficient in combination with spools — the spools absorb timing mismatches between when a node is revealed and when its corresponding basket is active.

### Step 4 — Add certified spool pressure
The reversed activation order is treated as a safe baseline. To keep puzzles from being trivially zero-spool, generation searches for a small basket delay that introduces controlled timing mismatch.

**Algorithm:**
1. Record the 3 node IDs assigned to each basket during coloring
2. Build the safe reversed activation order
3. Solve the safe order with zero spools to produce a legal tap trace
4. Pick candidate non-root tap events from that trace
5. Delay the tapped node's basket by a small lag in the activation order
6. Replay the same tap trace with normal spools
7. Accept the delayed order only if replay succeeds and lands in the target pressure band
8. Run a zero-spool solver against the delayed order and reject it if any zero-spool solution still exists

The accepted puzzle therefore has a witness solution and a measured pressure profile. If no order can be certified within the generation budget, the generator falls back to the safe reversed order.

---

## Parameters

| Parameter | Value |
|---|---|
| Total baskets | 9–99 (configurable) |
| Active baskets | Always 3 |
| Basket slots | 3 nodes each |
| Holding spools | 5 |
| Target spool placements | 1–3 for the certified solve |
| Target peak spool occupancy | At most 3 for the certified solve |
| Root count | 2–4 |
| Child count probabilities | 0: 1%, 1: 49%, 2: 25%, 3: 15%, 4: 10% |
| Color palette | Any size; colors assigned freely with no coverage requirements |

---

## Solvability vs. winnability
The puzzle is **solvable by construction** — there exists a sequence of taps that wins. However, the player can still lose by filling all spools with mismatched colors before the corresponding baskets activate. Strategic play means choosing which available node to tap when multiple are matchable, and being judicious about committing colors to spools when no basket matches.
