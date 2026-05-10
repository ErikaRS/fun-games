import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { TILE_COLORS } from "./basket-assignment.js";
import { applyTap, buildInitialGameState, getPlayableNodeIds } from "./game-state.js";
import { generateColorTrailPuzzle } from "./puzzle-generation.js";

// APP
// ────────────────────────────────────────────────────────────────────────────

const FONT_DISPLAY = `"Fraunces", "Cormorant Garamond", "Iowan Old Style", Georgia, serif`;
const FONT_BODY = `"Inter Tight", "Söhne", "Helvetica Neue", system-ui, sans-serif`;
const FONT_MONO = `"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace`;
const MAX_PUZZLE_SEED = 1_000_000;
const TILE_BY_HEX = new Map(TILE_COLORS.map((color) => [color.hex, color]));
const DIFFICULTIES = [
  {
    id: "easy",
    label: "Easy",
    baskets: 12,
    reserves: 5,
    maxLag: 8,
    forcedReserveChance: 0.38,
    earlyCandidateRatio: 0.45,
    candidateBudget: 72,
    candidateLimit: 10,
  },
  {
    id: "medium",
    label: "Medium",
    baskets: 18,
    reserves: 4,
    maxLag: 12,
    forcedReserveChance: 0.76,
    earlyCandidateRatio: 0.6,
    candidateBudget: 420,
    candidateLimit: 14,
  },
  {
    id: "hard",
    label: "Hard",
    baskets: 24,
    reserves: 3,
    maxLag: 16,
    forcedReserveChance: 0.96,
    earlyCandidateRatio: 0.72,
    candidateBudget: 960,
    candidateLimit: 16,
  },
];

function colorTitle(color) {
  const meta = TILE_BY_HEX.get(color) || { hex: color, name: color };
  return `${meta.name} color (${meta.hex})`;
}

function createPuzzleSeed(previousSeed = null) {
  // The UI needs an unpredictable seed for each new puzzle. The generator then
  // turns that seed into deterministic RNG streams so a specific puzzle can be
  // reproduced for debugging, testing, or future share links.
  let nextSeed;
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    nextSeed = values[0] % MAX_PUZZLE_SEED;
  } else {
    nextSeed = Math.floor(Math.random() * MAX_PUZZLE_SEED);
  }

  if (nextSeed === previousSeed) {
    return (nextSeed + 1) % MAX_PUZZLE_SEED;
  }
  return nextSeed;
}

export function useColorTrailGame() {
  const [difficulty, setDifficulty] = useState("medium");
  const [seed, setSeed] = useState(() => createPuzzleSeed());
  const [debugOpen, setDebugOpen] = useState(false);
  const [shake, setShake] = useState(0);
  const [recenterKey, setRecenterKey] = useState(0);
  const [pullEvent, setPullEvent] = useState(null);
  const difficultyConfig =
    DIFFICULTIES.find((option) => option.id === difficulty) || DIFFICULTIES[1];
  const numBaskets = difficultyConfig.baskets;

  const { forest, baskets, pressure } = useMemo(
    () =>
      generateColorTrailPuzzle({
        numBaskets,
        seed,
        reserveCapacity: difficultyConfig.reserves,
        maxLag: difficultyConfig.maxLag,
        forcedReserveChance: difficultyConfig.forcedReserveChance,
        earlyCandidateRatio: difficultyConfig.earlyCandidateRatio,
        candidateBudget: difficultyConfig.candidateBudget,
        candidateLimit: difficultyConfig.candidateLimit,
      }),
    [numBaskets, seed, difficultyConfig]
  );

  const [game, setGame] = useState(() =>
    buildInitialGameState(forest, baskets, difficultyConfig.reserves)
  );
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setGame(buildInitialGameState(forest, baskets, difficultyConfig.reserves));
    setHistory([]);
    setPullEvent(null);
  }, [forest, baskets, difficultyConfig.reserves]);

  const reroll = useCallback(() => {
    setSeed((currentSeed) => createPuzzleSeed(currentSeed));
  }, []);

  const changeDifficulty = useCallback((nextDifficulty) => {
    setDifficulty(nextDifficulty);
    setSeed((currentSeed) => createPuzzleSeed(currentSeed));
  }, []);

  const restart = useCallback(() => {
    setGame(buildInitialGameState(forest, baskets, difficultyConfig.reserves));
    setHistory([]);
    setPullEvent(null);
    setRecenterKey((key) => key + 1);
  }, [forest, baskets, difficultyConfig.reserves]);

  const tappableIds = useMemo(() => {
    const s = new Set();
    for (const id of game.visible) {
      if (!game.cleared.has(id)) s.add(id);
    }
    return s;
  }, [game]);

  const playableIds = useMemo(() => new Set(getPlayableNodeIds(game, forest)), [game, forest]);
  const won = game.cleared.size === forest.nodes.length;
  const stuck = !won && tappableIds.size > 0 && playableIds.size === 0;

  const onTap = useCallback(
    (nodeId) => {
      const result = applyTap(game, forest, nodeId);
      if (result.ok) {
        setHistory((items) => [...items, game]);
        setPullEvent((event) => ({ nodeId, key: (event?.key || 0) + 1 }));
        setGame(result.state);
      } else if (
        result.reason === "no matching basket and no reserve space" ||
        result.reason === "no matching basket"
      ) {
        setShake((x) => x + 1);
      }
    },
    [game, forest]
  );

  const undo = useCallback(() => {
    if (history.length === 0) return;
    setGame(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setPullEvent(null);
  }, [history]);

  const stats = useMemo(() => {
    const rootCount = forest.rootIds.length;
    const leafCount = forest.nodes.filter((n) => n.children.length === 0).length;
    const maxDepth = forest.nodes.reduce((m, n) => Math.max(m, n.depth), 0);
    const branchHist = [0, 0, 0, 0, 0];
    for (const n of forest.nodes) branchHist[n.children.length]++;
    return { rootCount, leafCount, maxDepth, branchHist };
  }, [forest]);

  return {
    baskets,
    changeDifficulty,
    debugOpen,
    difficulty,
    difficultyConfig,
    forest,
    game,
    history,
    onTap,
    playableIds,
    pressure,
    pullEvent,
    recenterKey,
    reroll,
    restart,
    seed,
    setDebugOpen,
    shake,
    stats,
    stuck,
    tappableIds,
    undo,
    won,
  };
}

function ColorTrailGlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..900,30..100&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
      button.ctbtn {
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
      button.ctbtn.ghost { background: transparent; color: #2a1d10; }
      button.ctbtn:hover { transform: translateY(-1px); }
      button.ctbtn.ghost:hover { background: #2a1d10; color: #f7ecd4; }
      button.ctbtn:disabled,
      button.ctbtn:disabled:hover {
        transform: none;
        background: rgba(251, 243, 223, 0.74);
        color: #2a1d10;
      }
      button.ctseg {
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
      button.ctseg:last-child { border-right: 0; }
      button.ctseg.active { background: #2a1d10; color: #f7ecd4; }
      @keyframes ct-shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-6px); }
        40% { transform: translateX(6px); }
        60% { transform: translateX(-3px); }
        80% { transform: translateX(3px); }
      }
      .ct-shake { animation: ct-shake 360ms ease; }
      @keyframes ct-trail-pulse {
        0%, 100% { opacity: 0.52; }
        50% { opacity: 0.14; }
      }
      .ct-trail-pulse { animation: ct-trail-pulse 1500ms ease-in-out infinite; }
      @keyframes ct-trail-open-flash {
        0% { opacity: 0.95; transform: scale(0.72); }
        70% { opacity: 0.22; transform: scale(1.45); }
        100% { opacity: 0; transform: scale(1.68); }
      }
      .ct-trail-open-flash {
        animation: ct-trail-open-flash 520ms ease-out forwards;
        transform-box: fill-box;
        transform-origin: center;
      }
      @keyframes ct-trail-reveal {
        0% { opacity: 0.45; transform: scale(0.72); }
        62% { opacity: 1; transform: scale(1.08); }
        100% { opacity: 1; transform: scale(1); }
      }
      .ct-trail-reveal {
        animation: ct-trail-reveal 360ms ease-out;
        transform-box: fill-box;
        transform-origin: center;
      }
      @media (max-width: 720px) {
        .ct-header { align-items: flex-start !important; flex-direction: column; }
        .ct-actions { width: 100%; }
        .ct-actions .ctbtn { flex: 1; min-width: 0; padding-left: 10px; padding-right: 10px; }
      }
      @media (max-width: 1040px) {
        .ct-trail-layout { grid-template-columns: 1fr !important; }
        .ct-trail-hud { order: -1; }
      }
      @media (max-width: 460px) {
        .ct-actions { justify-content: stretch !important; }
      }
    `}</style>
  );
}

const TRAIL_DIRS = {
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
  north: { x: 0, y: -1 },
};
const TRAIL_CELL = 48;

function coordKey(point) {
  return `${point.x},${point.y}`;
}

function sameDir(a, b) {
  return a.x === b.x && a.y === b.y;
}

function dirPriority(dir, preferredDirs) {
  const index = preferredDirs.findIndex((preferred) => sameDir(preferred, dir));
  return index === -1 ? preferredDirs.length : index;
}

function ribbonTurnStats(items) {
  let turns = 0;
  let longestRun = 1;
  let currentRun = 1;
  let previousDir = null;

  for (let i = 1; i < items.length; i++) {
    const dir = dirFromPoints(items[i - 1], items[i]);
    if (previousDir && sameDir(previousDir, dir)) {
      currentRun++;
    } else {
      if (previousDir) turns++;
      currentRun = 1;
      previousDir = dir;
    }
    longestRun = Math.max(longestRun, currentRun);
  }

  return { turns, longestRun };
}

function scoreTrailRibbon(items, childDir, preferredDirs) {
  const xs = items.map((item) => item.x);
  const ys = items.map((item) => item.y);
  const spanX = Math.max(...xs) - Math.min(...xs) + 1;
  const spanY = Math.max(...ys) - Math.min(...ys) + 1;
  const longSpan = Math.max(spanX, spanY);
  const shortSpan = Math.min(spanX, spanY);
  const area = spanX * spanY;
  const density = items.length / area;
  const first = items[0];
  const last = items[items.length - 1];
  const endpointDistance = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
  const { turns, longestRun } = ribbonTurnStats(items);
  const thinPenalty = shortSpan === 1 ? 60 : shortSpan === 2 ? 20 : 0;

  return (
    longSpan * 4 +
    Math.min(shortSpan, 5) * 18 -
    Math.max(0, shortSpan - 6) * 10 +
    turns * 7 +
    endpointDistance * 0.6 -
    longestRun * 1.2 -
    density * 5 -
    thinPenalty -
    dirPriority(childDir, preferredDirs) * 0.25
  );
}

function dirFromPoints(a, b, fallback = TRAIL_DIRS.east) {
  if (!a || !b) return fallback;
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) && dx !== 0) return { x: dx, y: 0 };
  if (dy !== 0) return { x: 0, y: dy };
  return fallback;
}

function turnLeft(dir) {
  return { x: dir.y, y: -dir.x };
}

function turnRight(dir) {
  return { x: -dir.y, y: dir.x };
}

function reverseDir(dir) {
  return { x: -dir.x, y: -dir.y };
}

function replayTrailRibbon(forest, clearedOrder) {
  let ribbon = forest.rootIds.map((id, index) => ({ id, x: index, y: 0 }));
  const clearedSet = new Set();
  const bendMap = new Map();

  for (const nodeId of clearedOrder || []) {
    const index = ribbon.findIndex((item) => item.id === nodeId);
    if (index === -1) {
      clearedSet.add(nodeId);
      continue;
    }

    const parent = ribbon[index];
    const node = forest.nodes[nodeId];
    const prev = ribbon[index - 1];
    const next = ribbon[index + 1];
    const incoming = prev
      ? dirFromPoints(prev, parent)
      : next
        ? dirFromPoints(parent, next)
        : TRAIL_DIRS.east;
    const outgoing = next ? dirFromPoints(parent, next, incoming) : incoming;
    const parity = (nodeId + clearedSet.size) % 2;
    const preferredTurns = parity === 0 ? [turnRight(incoming), turnLeft(incoming)] : [turnLeft(incoming), turnRight(incoming)];
    const preferredDirs = [outgoing, incoming, ...preferredTurns, reverseDir(incoming)];
    const children = node.children.filter((id) => !clearedSet.has(id));
    const before = ribbon.slice(0, index);
    const after = ribbon.slice(index + 1);

    clearedSet.add(nodeId);

    if (children.length === 0) {
      const delta = next && prev ? { x: prev.x + outgoing.x - next.x, y: prev.y + outgoing.y - next.y } : { x: 0, y: 0 };
      ribbon = [
        ...before,
        ...after.map((item) => ({ ...item, x: item.x + delta.x, y: item.y + delta.y })),
      ];
      continue;
    }

    const candidates = preferredDirs.filter(
      (dir, dirIndex, dirs) => dirs.findIndex((other) => sameDir(other, dir)) === dirIndex
    );

    let chosen = null;
    for (const childDir of candidates) {
      const childItems = children.map((id, childIndex) => ({
        id,
        x: parent.x + childDir.x * childIndex,
        y: parent.y + childDir.y * childIndex,
      }));
      const lastChild = childItems[childItems.length - 1];
      const desiredNext = next
        ? { x: lastChild.x + outgoing.x, y: lastChild.y + outgoing.y }
        : null;
      const delta = next && desiredNext
        ? { x: desiredNext.x - next.x, y: desiredNext.y - next.y }
        : { x: 0, y: 0 };
      const shiftedAfter = after.map((item) => ({
        ...item,
        x: item.x + delta.x,
        y: item.y + delta.y,
      }));
      const proposed = [...before, ...childItems, ...shiftedAfter];
      const occupied = new Set();
      let collides = false;
      for (const item of proposed) {
        const key = coordKey(item);
        if (occupied.has(key)) {
          collides = true;
          break;
        }
        occupied.add(key);
      }
      if (collides) continue;

      const score = scoreTrailRibbon(proposed, childDir, preferredDirs);
      if (!chosen || score > chosen.score) chosen = { ribbon: proposed, childDir, score };
    }

    if (!chosen) {
      const childDir = candidates[0] || incoming;
      const childItems = children.map((id, childIndex) => ({
        id,
        x: parent.x + childDir.x * childIndex,
        y: parent.y + childDir.y * childIndex,
      }));
      const lastChild = childItems[childItems.length - 1];
      const desiredNext = next
        ? { x: lastChild.x + outgoing.x, y: lastChild.y + outgoing.y }
        : null;
      const delta = next && desiredNext
        ? { x: desiredNext.x - next.x, y: desiredNext.y - next.y }
        : { x: 0, y: 0 };
      chosen = {
        ribbon: [
          ...before,
          ...childItems,
          ...after.map((item) => ({ ...item, x: item.x + delta.x, y: item.y + delta.y })),
        ],
        childDir,
      };
    }

    bendMap.set(nodeId, {
      x: parent.x,
      y: parent.y,
      dir: chosen.childDir,
      count: children.length,
    });
    ribbon = chosen.ribbon;
  }

  return { ribbon, bendMap };
}

function ColorTrailInterface({ game: interfaceGame }) {
  const {
    changeDifficulty,
    difficulty,
    forest,
    game,
    history,
    onTap,
    playableIds,
    pullEvent,
    reroll,
    restart,
    seed,
    shake,
    stuck,
    tappableIds,
    undo,
    won,
  } = interfaceGame;

  const { ribbon, bendMap } = useMemo(
    () => replayTrailRibbon(forest, game.clearedOrder),
    [forest, game.clearedOrder]
  );
  const layout = useMemo(() => {
    const points = ribbon.length > 0 ? ribbon : [{ id: "empty", x: 0, y: 0 }];
    const xs = points.map((item) => item.x);
    const ys = points.map((item) => item.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [ribbon]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#101511",
        color: "#f5ead6",
        fontFamily: FONT_BODY,
        padding: "28px 18px 48px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1220, margin: "0 auto", paddingTop: 28 }}>
        <header
          className="ct-header"
          style={{
            display: "flex",
            alignItems: "end",
            justifyContent: "space-between",
            gap: 16,
            paddingBottom: 12,
            borderBottom: "2px solid #d8c7a8",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "#9fb6a8",
                marginBottom: 6,
              }}
            >
              Trail interface
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: FONT_DISPLAY,
                fontSize: "clamp(34px, 6vw, 64px)",
                lineHeight: 0.9,
                fontWeight: 760,
                letterSpacing: 0,
              }}
            >
              Color Trail
            </h1>
          </div>
          <div
            className="ct-actions"
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <div aria-label="Difficulty" style={{ display: "flex", border: "1.5px solid #d8c7a8" }}>
              {DIFFICULTIES.map((option) => (
                <button
                  key={option.id}
                  className={`ctseg${difficulty === option.id ? " active" : ""}`}
                  onClick={() => changeDifficulty(option.id)}
                  style={{
                    color: difficulty === option.id ? "#101511" : "#f5ead6",
                    background: difficulty === option.id ? "#d8c7a8" : "transparent",
                    borderColor: "#d8c7a8",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              className="ctbtn ghost"
              onClick={undo}
              disabled={history.length === 0}
              style={{
                color: history.length === 0 ? "rgba(245, 234, 214, 0.42)" : "#f5ead6",
                borderColor: "#d8c7a8",
                background: "transparent",
              }}
            >
              Undo
            </button>
            <button
              className="ctbtn ghost"
              onClick={restart}
              style={{ color: "#f5ead6", borderColor: "#d8c7a8", background: "transparent" }}
            >
              Restart
            </button>
            <button
              className="ctbtn"
              onClick={reroll}
              style={{ color: "#101511", borderColor: "#d8c7a8", background: "#d8c7a8" }}
            >
              New
            </button>
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 310px)",
            gap: 14,
            marginTop: 14,
          }}
          className="ct-trail-layout"
        >
          <main
            style={{
              minWidth: 0,
              minHeight: "clamp(420px, 68vh, 760px)",
              border: "2px solid #d8c7a8",
              background: "#182019",
              position: "relative",
              overflow: "auto",
              boxShadow: "6px 6px 0 rgba(216, 199, 168, 0.18)",
            }}
          >
            {stuck && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  position: "sticky",
                  top: 12,
                  left: 12,
                  zIndex: 2,
                  width: "fit-content",
                  border: "1.5px solid #f0cf62",
                  background: "#2f2b15",
                  color: "#f7e6a6",
                  padding: "9px 11px",
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                no legal pull
              </div>
            )}
            {won && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  position: "sticky",
                  top: 12,
                  left: 12,
                  zIndex: 2,
                  width: "fit-content",
                  border: "1.5px solid #b9d8c2",
                  background: "#1c3428",
                  color: "#dff3df",
                  padding: "9px 11px",
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                cleared
              </div>
            )}
            <TrailRibbon
              forest={forest}
              ribbon={ribbon}
              bendMap={bendMap}
              layout={layout}
              tappableIds={tappableIds}
              playableIds={playableIds}
              pullEvent={pullEvent}
              stuck={stuck}
              shakeKey={shake}
              onTap={onTap}
            />
          </main>
          <aside
            className="ct-trail-hud"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              minWidth: 0,
            }}
          >
            <PanelBlock title="Baskets">
              <TrailBasketsRow active={game.active} shakeKey={shake} />
            </PanelBlock>
            <PanelBlock title="Reserves">
              <TrailReservesRow reserves={game.reserves} />
            </PanelBlock>
          </aside>
        </div>
      </div>
    </div>
  );
}

function PanelBlock({ children, title }) {
  return (
    <section
      style={{
        border: "1.5px solid #d8c7a8",
        padding: "12px 10px",
        background: "#141b16",
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 9,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "#9fb6a8",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function TrailBasketsRow({ active, shakeKey }) {
  return (
    <div
      key={`trail-baskets-${shakeKey}`}
      className={shakeKey > 0 ? "ct-shake" : undefined}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      {[0, 1, 2].map((i) => {
        const basket = active[i];
        if (!basket) {
          return (
            <div
              key={`trail-empty-${i}`}
              style={{
                border: "1.5px dashed rgba(216, 199, 168, 0.38)",
                padding: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.5,
              }}
            >
              <div style={{ display: "flex", gap: 5 }}>
                {[0, 1, 2].map((slot) => (
                  <span
                    key={slot}
                    style={{
                      width: TRAIL_CELL,
                      height: TRAIL_CELL,
                      border: "1.5px dashed rgba(216, 199, 168, 0.58)",
                      background: "rgba(24, 32, 25, 0.72)",
                    }}
                  />
                ))}
              </div>
            </div>
          );
        }

        return (
          <div
            key={`trail-basket-${i}-${basket.color}-${basket.slots.length}`}
            title={colorTitle(basket.color)}
            style={{
              border: "1.5px solid rgba(216, 199, 168, 0.9)",
              background: basket.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 5,
              boxShadow: "3px 3px 0 rgba(0, 0, 0, 0.28)",
            }}
          >
            <div style={{ display: "flex", gap: 5 }}>
              {[0, 1, 2].map((slot) => {
                const filled = basket.slots[slot] !== undefined;
                return (
                  <span
                    key={slot}
                    style={{
                      width: TRAIL_CELL,
                      height: TRAIL_CELL,
                      border: "2px solid #f5ead6",
                      background: filled ? basket.color : "#182019",
                      boxShadow: filled
                        ? "inset 0 0 0 6px rgba(245, 234, 214, 0.38)"
                        : "inset 0 0 0 5px rgba(0, 0, 0, 0.22)",
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrailReservesRow({ reserves }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        padding: "8px 2px 2px",
      }}
    >
      {reserves.map((color, i) => (
        <div
          key={i}
          title={color ? colorTitle(color) : `empty reserve ${i + 1}`}
          style={{
            width: TRAIL_CELL,
            height: TRAIL_CELL,
            border: "2px solid rgba(216, 199, 168, 0.9)",
            background: color ? color : "rgba(216, 199, 168, 0.08)",
            boxShadow: color
              ? "inset 0 0 0 7px rgba(15, 21, 17, 0.18), 0 0 0 1px rgba(0,0,0,0.35)"
              : "inset 0 0 0 7px rgba(0, 0, 0, 0.16)",
          }}
        />
      ))}
    </div>
  );
}

function TrailRibbon({
  forest,
  ribbon,
  bendMap,
  layout,
  tappableIds,
  playableIds,
  pullEvent,
  stuck,
  shakeKey,
  onTap,
}) {
  const CELL = TRAIL_CELL;
  const GAP = 8;
  const PAD = 92;
  const HOLD_PREVIEW_MS = 240;
  const holdRef = useRef(null);
  const [previewNodeId, setPreviewNodeId] = useState(null);
  const step = CELL + GAP;
  const width = Math.max(640, (layout.maxX - layout.minX + 1) * step + PAD * 2);
  const height = Math.max(420, (layout.maxY - layout.minY + 1) * step + PAD * 2);
  const pointFor = (item) => ({
    x: PAD + (item.x - layout.minX) * step + CELL / 2,
    y: PAD + (item.y - layout.minY) * step + CELL / 2,
  });
  const pointFromGrid = (point) => ({
    x: PAD + (point.x - layout.minX) * step + CELL / 2,
    y: PAD + (point.y - layout.minY) * step + CELL / 2,
  });
  const ribbonById = useMemo(() => new Map(ribbon.map((item) => [item.id, item])), [ribbon]);
  const previewNode = previewNodeId !== null ? forest.nodes[previewNodeId] : null;
  const previewAnchor = previewNodeId !== null ? ribbonById.get(previewNodeId) : null;
  const previewChildren = useMemo(
    () =>
      previewNode && previewAnchor
        ? previewNode.children.map((id, index) => ({
            id,
            x: previewAnchor.x,
            y: previewAnchor.y + index + 1,
          }))
        : [],
    [previewAnchor, previewNode]
  );
  const openFlash = pullEvent?.nodeId !== undefined ? bendMap.get(pullEvent.nodeId) : null;

  const clearHold = useCallback(() => {
    if (holdRef.current?.timer) clearTimeout(holdRef.current.timer);
    holdRef.current = null;
    setPreviewNodeId(null);
  }, []);

  useEffect(
    () => () => {
      if (holdRef.current?.timer) clearTimeout(holdRef.current.timer);
    },
    []
  );

  const onTilePointerDown = useCallback(
    (event, nodeId, canTap) => {
      if (!canTap || !onTap) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const press = {
        id: nodeId,
        pointerId: event.pointerId,
        previewed: false,
        timer: null,
      };
      press.timer = setTimeout(() => {
        press.previewed = true;
        setPreviewNodeId(nodeId);
      }, HOLD_PREVIEW_MS);
      holdRef.current = press;
    },
    [onTap]
  );

  const onTilePointerUp = useCallback(
    (event, nodeId) => {
      const press = holdRef.current;
      if (!press || press.id !== nodeId || press.pointerId !== event.pointerId) return;
      event.stopPropagation();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (press.timer) clearTimeout(press.timer);
      holdRef.current = null;
      setPreviewNodeId(null);
      if (!press.previewed) onTap?.(nodeId);
    },
    [onTap]
  );

  const onTilePointerCancel = useCallback(
    (event, nodeId) => {
      const press = holdRef.current;
      if (!press || press.id !== nodeId || press.pointerId !== event.pointerId) return;
      event.stopPropagation();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      clearHold();
    },
    [clearHold]
  );

  return (
    <svg
      className={shakeKey > 0 ? "ct-shake" : undefined}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: "block",
      }}
      role="img"
      aria-label="Trail-style Color Trail frontier"
    >
      <defs>
        <pattern id="trail-grid" width={step} height={step} patternUnits="userSpaceOnUse">
          <path d={`M ${step} 0 H 0 V ${step}`} fill="none" stroke="#d8c7a8" strokeWidth="1" opacity="0.08" />
        </pattern>
        <filter id="trail-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="3" dy="4" stdDeviation="0" floodColor="#050705" floodOpacity="0.45" />
        </filter>
      </defs>
      <rect x="0" y="0" width={width} height={height} fill="url(#trail-grid)" />

      <g fill="none" strokeLinecap="square" strokeLinejoin="round">
        {ribbon.slice(0, -1).map((item, index) => {
          const a = pointFor(item);
          const b = pointFor(ribbon[index + 1]);
          return (
            <path
              key={`${item.id}-${ribbon[index + 1].id}`}
              d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
              stroke="#d8c7a8"
              strokeWidth="13"
              strokeOpacity="0.24"
            />
          );
        })}
      </g>

      {openFlash && (
        <g
          key={`open-${pullEvent.key}`}
          transform={`translate(${pointFromGrid(openFlash).x}, ${pointFromGrid(openFlash).y})`}
          pointerEvents="none"
        >
          <rect
            className="ct-trail-open-flash"
            x={-CELL / 2 - 8}
            y={-CELL / 2 - 8}
            width={CELL + 16}
            height={CELL + 16}
            fill="none"
            stroke="#f5ead6"
            strokeWidth="3"
          />
        </g>
      )}

      {previewAnchor && previewChildren.length > 0 && (
        <g pointerEvents="none">
          {previewChildren.map((item) => {
            const anchor = pointFromGrid(previewAnchor);
            const child = pointFromGrid(item);
            return (
              <path
                key={`preview-line-${item.id}`}
                d={`M ${anchor.x} ${anchor.y} L ${child.x} ${child.y}`}
                fill="none"
                stroke="#f5ead6"
                strokeWidth="2"
                strokeDasharray="5 6"
                strokeOpacity="0.45"
              />
            );
          })}
          {previewChildren.map((item) => {
            const childNode = forest.nodes[item.id];
            const p = pointFromGrid(item);
            return (
              <g key={`preview-${item.id}`} transform={`translate(${p.x}, ${p.y})`} opacity="0.84">
                <rect
                  x={-CELL / 2}
                  y={-CELL / 2}
                  width={CELL}
                  height={CELL}
                  fill="#182019"
                  stroke="#f5ead6"
                  strokeWidth="2"
                  strokeDasharray="6 5"
                />
                <rect
                  x={-CELL / 2 + 7}
                  y={-CELL / 2 + 7}
                  width={CELL - 14}
                  height={CELL - 14}
                  fill={childNode.color || "#dba66a"}
                  stroke="#d8c7a8"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}
        </g>
      )}

      <g>
        {ribbon.map((item, index) => {
          const node = forest.nodes[item.id];
          const p = pointFor(item);
          const tappable = tappableIds.has(item.id);
          const playable = playableIds.has(item.id);
          const blocked = stuck && tappable && !playable;
          const revealedByLastPull =
            pullEvent?.nodeId !== undefined && node.parentId === pullEvent.nodeId;
          const previewing = previewNodeId === item.id;
          return (
            <g
              key={item.id}
              data-color-node="true"
              role="button"
              tabIndex={tappable ? 0 : -1}
              aria-label={`Pull node ${item.id}, ${colorTitle(node.color)}`}
              transform={`translate(${p.x}, ${p.y})`}
              style={{
                cursor: tappable ? "pointer" : "default",
                opacity: blocked ? 0.5 : 1,
                outline: "none",
              }}
              onPointerDown={(event) => onTilePointerDown(event, item.id, tappable)}
              onPointerUp={(event) => onTilePointerUp(event, item.id)}
              onPointerCancel={(event) => onTilePointerCancel(event, item.id)}
              onKeyDown={(event) => {
                if (!tappable || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault();
                onTap(item.id);
              }}
            >
              <title>{`frontier ${index + 1}: node ${item.id}, ${colorTitle(node.color)}`}</title>
              {previewing && (
                <rect
                  x={-CELL / 2 - 10}
                  y={-CELL / 2 - 10}
                  width={CELL + 20}
                  height={CELL + 20}
                  fill="none"
                  stroke="#f5ead6"
                  strokeWidth="2"
                  strokeDasharray="5 6"
                  strokeOpacity="0.68"
                />
              )}
              {playable && (
                <rect
                  className="ct-trail-pulse"
                  x={-CELL / 2 - 7}
                  y={-CELL / 2 - 7}
                  width={CELL + 14}
                  height={CELL + 14}
                  fill="none"
                  stroke={node.color}
                  strokeWidth="2.5"
                />
              )}
              {blocked && (
                <rect
                  x={-CELL / 2 - 5}
                  y={-CELL / 2 - 5}
                  width={CELL + 10}
                  height={CELL + 10}
                  fill="none"
                  stroke="#f0cf62"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />
              )}
              <rect
                className={revealedByLastPull ? "ct-trail-reveal" : undefined}
                x={-CELL / 2}
                y={-CELL / 2}
                width={CELL}
                height={CELL}
                fill={node.color || "#dba66a"}
                stroke="#f5ead6"
                strokeWidth="2"
                filter="url(#trail-shadow)"
              />
              <rect
                x={-CELL / 2}
                y={-CELL / 2}
                width={CELL}
                height={CELL}
                fill="transparent"
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default function ColorTrailApp() {
  return (
    <>
      <ColorTrailGlobalStyles />
      <ColorTrailInterface game={useColorTrailGame()} />
    </>
  );
}
