import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { YARN_COLORS } from "./basket-assignment.js";
import { applyTap, buildInitialGameState, getPlayableNodeIds } from "./game-state.js";
import { ForestSVG, yarnFillStyle, yarnTitle } from "./layout.jsx";
import { generateYarnPullPuzzle } from "./puzzle-generation.js";

// APP
// ────────────────────────────────────────────────────────────────────────────

const FONT_DISPLAY = `"Fraunces", "Cormorant Garamond", "Iowan Old Style", Georgia, serif`;
const FONT_BODY = `"Inter Tight", "Söhne", "Helvetica Neue", system-ui, sans-serif`;
const FONT_MONO = `"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace`;
const MAX_PUZZLE_SEED = 1_000_000;
const DIFFICULTIES = [
  {
    id: "easy",
    label: "Easy",
    baskets: 12,
    spools: 5,
    maxLag: 8,
    forcedSpoolChance: 0.38,
    earlyCandidateRatio: 0.45,
    candidateBudget: 72,
    candidateLimit: 10,
  },
  {
    id: "medium",
    label: "Medium",
    baskets: 18,
    spools: 4,
    maxLag: 12,
    forcedSpoolChance: 0.76,
    earlyCandidateRatio: 0.6,
    candidateBudget: 420,
    candidateLimit: 14,
  },
  {
    id: "hard",
    label: "Hard",
    baskets: 24,
    spools: 3,
    maxLag: 16,
    forcedSpoolChance: 0.96,
    earlyCandidateRatio: 0.72,
    candidateBudget: 960,
    candidateLimit: 16,
  },
];

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

export function useYarnPullGame() {
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
      generateYarnPullPuzzle({
        numBaskets,
        seed,
        spoolCapacity: difficultyConfig.spools,
        maxLag: difficultyConfig.maxLag,
        forcedSpoolChance: difficultyConfig.forcedSpoolChance,
        earlyCandidateRatio: difficultyConfig.earlyCandidateRatio,
        candidateBudget: difficultyConfig.candidateBudget,
        candidateLimit: difficultyConfig.candidateLimit,
      }),
    [numBaskets, seed, difficultyConfig]
  );

  const [game, setGame] = useState(() =>
    buildInitialGameState(forest, baskets, difficultyConfig.spools)
  );
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setGame(buildInitialGameState(forest, baskets, difficultyConfig.spools));
    setHistory([]);
    setPullEvent(null);
  }, [forest, baskets, difficultyConfig.spools]);

  const reroll = useCallback(() => {
    setSeed((currentSeed) => createPuzzleSeed(currentSeed));
  }, []);

  const changeDifficulty = useCallback((nextDifficulty) => {
    setDifficulty(nextDifficulty);
    setSeed((currentSeed) => createPuzzleSeed(currentSeed));
  }, []);

  const restart = useCallback(() => {
    setGame(buildInitialGameState(forest, baskets, difficultyConfig.spools));
    setHistory([]);
    setPullEvent(null);
    setRecenterKey((key) => key + 1);
  }, [forest, baskets, difficultyConfig.spools]);

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
        result.reason === "no matching basket and no spool space" ||
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

function YarnPullGlobalStyles() {
  return (
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
      button.ypbtn:disabled,
      button.ypbtn:disabled:hover {
        transform: none;
        background: rgba(251, 243, 223, 0.74);
        color: #2a1d10;
      }
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
      @keyframes yp-stuck-ring {
        0%, 100% { r: 29; opacity: 0.38; }
        50% { r: 33; opacity: 0.16; }
      }
      .yp-stuck-ring { animation: yp-stuck-ring 1300ms ease-in-out infinite; }
      @keyframes yp-node-tug {
        0% { transform: translate(0, 0); }
        52% { transform: translate(var(--yp-tug-x), var(--yp-tug-y)); }
        100% { transform: translate(0, 0); }
      }
      .yp-node-tug {
        animation: yp-node-tug 360ms ease-out;
        transform-box: fill-box;
        transform-origin: center;
      }
      @keyframes yp-pile-enter {
        0% { opacity: 1; }
        70% { opacity: 0.86; }
        100% { opacity: 1; }
      }
      .yp-pile-enter {
        animation: yp-pile-enter 560ms ease-out forwards;
        transform-box: fill-box;
        transform-origin: center;
      }
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
        60% { transform: scale(1); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      .yp-pop { animation: yp-pop 280ms ease-out; transform-origin: center; }
      @keyframes yp-snake-pulse {
        0%, 100% { opacity: 0.52; }
        50% { opacity: 0.14; }
      }
      .yp-snake-pulse { animation: yp-snake-pulse 1500ms ease-in-out infinite; }
      @keyframes yp-snake-open-flash {
        0% { opacity: 0.95; transform: scale(0.72); }
        70% { opacity: 0.22; transform: scale(1.45); }
        100% { opacity: 0; transform: scale(1.68); }
      }
      .yp-snake-open-flash {
        animation: yp-snake-open-flash 520ms ease-out forwards;
        transform-box: fill-box;
        transform-origin: center;
      }
      @keyframes yp-snake-reveal {
        0% { opacity: 0.45; transform: scale(0.72); }
        62% { opacity: 1; transform: scale(1.08); }
        100% { opacity: 1; transform: scale(1); }
      }
      .yp-snake-reveal {
        animation: yp-snake-reveal 360ms ease-out;
        transform-box: fill-box;
        transform-origin: center;
      }
      .yp-baskets { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      @media (max-width: 720px) {
        .yp-header { align-items: flex-start !important; flex-direction: column; }
        .yp-actions { width: 100%; }
        .yp-actions .ypbtn { flex: 1; min-width: 0; padding-left: 10px; padding-right: 10px; }
      }
      @media (max-width: 1040px) {
        .yp-snake-layout { grid-template-columns: 1fr !important; }
        .yp-snake-hud { order: -1; }
      }
      @media (max-width: 460px) {
        .yp-baskets { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}

export function ClassicYarnPullInterface({ game: interfaceGame }) {
  const {
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
  } = interfaceGame;

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
              left: 14,
              zIndex: 2,
            }}
          >
            <button
              className="ypbtn ghost"
              onClick={undo}
              disabled={history.length === 0}
              title="Undo last move"
              style={{
                padding: "8px 12px",
                background: history.length === 0 ? "rgba(251, 243, 223, 0.74)" : "#fbf3df",
                opacity: history.length === 0 ? 0.45 : 1,
                cursor: history.length === 0 ? "default" : "pointer",
                boxShadow: "2px 2px 0 rgba(42, 29, 16, 0.18)",
              }}
            >
              ↶ Undo
            </button>
          </div>
          {stuck && (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: "absolute",
                top: 42,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 2,
                border: "2px solid #2a1d10",
                background: "#f7ecd4",
                boxShadow: "4px 4px 0 rgba(42, 29, 16, 0.32)",
                padding: "11px 14px",
                maxWidth: "min(420px, calc(100% - 36px))",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  marginBottom: 3,
                }}
              >
                Stuck
              </div>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 21,
                  lineHeight: 1.1,
                  fontStyle: "italic",
                }}
              >
                no open basket or spool can take these threads.
              </div>
            </div>
          )}
          <ForestViewport focusKey={`${difficulty}-${seed}-${recenterKey}`}>
            <ForestSVG
              forest={forest}
              visibleIds={game.visible}
              clearedIds={game.cleared}
              tappableIds={tappableIds}
              playableIds={playableIds}
              stuck={stuck}
              pullEvent={pullEvent}
              clearedOrder={game.clearedOrder}
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
                      ? `${pressure.spoolPlacements} / ${pressure.peakSpoolOccupancy} · d${pressure.delayMoves}`
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

export function ClassicYarnPullApp() {
  return <ClassicYarnPullInterface game={useYarnPullGame()} />;
}

const SNAKE_DIRS = {
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
  north: { x: 0, y: -1 },
};
const SNAKE_CELL = 48;

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

function scoreSnakeRibbon(items, childDir, preferredDirs) {
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

function dirFromPoints(a, b, fallback = SNAKE_DIRS.east) {
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

function replaySnakeRibbon(forest, clearedOrder) {
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
        : SNAKE_DIRS.east;
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

      const score = scoreSnakeRibbon(proposed, childDir, preferredDirs);
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

function SnakeYarnPullInterface({ game: interfaceGame }) {
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
    () => replaySnakeRibbon(forest, game.clearedOrder),
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
          className="yp-header"
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
              Snake interface
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
              Yarn Pull
            </h1>
          </div>
          <div
            className="yp-actions"
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
                  className={`ypseg${difficulty === option.id ? " active" : ""}`}
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
              className="ypbtn ghost"
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
              className="ypbtn ghost"
              onClick={restart}
              style={{ color: "#f5ead6", borderColor: "#d8c7a8", background: "transparent" }}
            >
              Restart
            </button>
            <button
              className="ypbtn"
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
          className="yp-snake-layout"
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
            <SnakeRibbon
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
            className="yp-snake-hud"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              minWidth: 0,
            }}
          >
            <PanelBlock title="Baskets">
              <SnakeBasketsRow active={game.active} shakeKey={shake} />
            </PanelBlock>
            <PanelBlock title="Spools">
              <SnakeSpoolsRow spools={game.spools} />
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

function SnakeBasketsRow({ active, shakeKey }) {
  return (
    <div
      key={`snake-baskets-${shakeKey}`}
      className={shakeKey > 0 ? "yp-shake" : undefined}
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
              key={`snake-empty-${i}`}
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
                      width: SNAKE_CELL,
                      height: SNAKE_CELL,
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
            key={`snake-basket-${i}-${basket.color}-${basket.slots.length}`}
            title={yarnTitle(basket.color)}
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
                      width: SNAKE_CELL,
                      height: SNAKE_CELL,
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

function SnakeSpoolsRow({ spools }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        padding: "8px 2px 2px",
      }}
    >
      {spools.map((color, i) => (
        <div
          key={i}
          title={color ? yarnTitle(color) : `empty spool ${i + 1}`}
          style={{
            width: SNAKE_CELL,
            height: SNAKE_CELL,
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

function SnakeRibbon({
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
  const CELL = SNAKE_CELL;
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
      className={shakeKey > 0 ? "yp-shake" : undefined}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: "block",
      }}
      role="img"
      aria-label="Snake-style Yarn Pull frontier"
    >
      <defs>
        <pattern id="snake-grid" width={step} height={step} patternUnits="userSpaceOnUse">
          <path d={`M ${step} 0 H 0 V ${step}`} fill="none" stroke="#d8c7a8" strokeWidth="1" opacity="0.08" />
        </pattern>
        <filter id="snake-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="3" dy="4" stdDeviation="0" floodColor="#050705" floodOpacity="0.45" />
        </filter>
      </defs>
      <rect x="0" y="0" width={width} height={height} fill="url(#snake-grid)" />

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
            className="yp-snake-open-flash"
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
              data-yarn-node="true"
              role="button"
              tabIndex={tappable ? 0 : -1}
              aria-label={`Pull node ${item.id}, ${yarnTitle(node.color)}`}
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
              <title>{`frontier ${index + 1}: node ${item.id}, ${yarnTitle(node.color)}`}</title>
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
                  className="yp-snake-pulse"
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
                className={revealedByLastPull ? "yp-snake-reveal" : undefined}
                x={-CELL / 2}
                y={-CELL / 2}
                width={CELL}
                height={CELL}
                fill={node.color || "#dba66a"}
                stroke="#f5ead6"
                strokeWidth="2"
                filter="url(#snake-shadow)"
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

export const YARN_PULL_INTERFACES = [
  {
    id: "classic",
    label: "Classic",
    Component: ClassicYarnPullInterface,
  },
  {
    id: "snake",
    label: "Snake",
    Component: SnakeYarnPullInterface,
  },
];

function IndependentYarnPullInterface({ interfaceDef, active }) {
  const game = useYarnPullGame();
  const InterfaceComponent = interfaceDef.Component;

  return (
    <div
      aria-hidden={!active}
      style={{
        display: active ? "block" : "none",
      }}
    >
      <InterfaceComponent game={game} />
    </div>
  );
}

export default function YarnPullApp() {
  const [activeInterfaceId, setActiveInterfaceId] = useState(YARN_PULL_INTERFACES[0].id);

  return (
    <>
      <YarnPullGlobalStyles />
      <nav
        aria-label="Yarn Pull interface"
        style={{
          position: "fixed",
          zIndex: 10,
          top: 12,
          right: 12,
          display: "flex",
          border: "1.5px solid #2a1d10",
          background: "#fbf3df",
          boxShadow: "3px 3px 0 rgba(42, 29, 16, 0.28)",
        }}
      >
        {YARN_PULL_INTERFACES.map((interfaceDef) => (
          <button
            key={interfaceDef.id}
            className={`ypseg${activeInterfaceId === interfaceDef.id ? " active" : ""}`}
            onClick={() => setActiveInterfaceId(interfaceDef.id)}
          >
            {interfaceDef.label}
          </button>
        ))}
      </nav>
      {YARN_PULL_INTERFACES.map((interfaceDef) => (
        <IndependentYarnPullInterface
          key={interfaceDef.id}
          interfaceDef={interfaceDef}
          active={activeInterfaceId === interfaceDef.id}
        />
      ))}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function ForestViewport({ children, focusKey }) {
  const DEFAULT_ZOOM = 0.35;
  const ref = useRef(null);
  const contentRef = useRef(null);
  const dragRef = useRef(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [needsScroll, setNeedsScroll] = useState(false);
  const canZoomOut = zoom > 0.36;
  const canZoomIn = zoom < 0.99;

  const updateScrollNeed = useCallback(() => {
    const viewport = ref.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    setNeedsScroll(
      content.offsetWidth * zoom > viewport.clientWidth + 1 ||
        content.offsetHeight * zoom > viewport.clientHeight + 1
    );
  }, [zoom]);

  const recenter = useCallback(() => {
    const viewport = ref.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
  }, []);

  const updateZoom = useCallback((nextZoom) => {
    setZoom((currentZoom) => {
      const viewport = ref.current;
      const clampedZoom = Math.max(DEFAULT_ZOOM, Math.min(1, nextZoom));
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
    setZoom(DEFAULT_ZOOM);
    requestAnimationFrame(recenter);
  }, [focusKey, recenter]);

  useEffect(() => {
    requestAnimationFrame(updateScrollNeed);
    window.addEventListener("resize", updateScrollNeed);
    return () => window.removeEventListener("resize", updateScrollNeed);
  }, [children, updateScrollNeed]);

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
          overflow: needsScroll ? "auto" : "hidden",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <div
          ref={contentRef}
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
