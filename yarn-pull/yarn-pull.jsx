import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { YARN_COLORS, generateYarnPullPuzzle } from "./basket-assignment.js";
import { applyTap, buildInitialGameState, getPlayableNodeIds } from "./game-state.js";
import { ForestSVG, yarnFillStyle, yarnTitle } from "./layout.jsx";

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

function useYarnPullGame() {
  const [difficulty, setDifficulty] = useState("medium");
  const [seed, setSeed] = useState(42);
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
    setSeed(Math.floor(Math.random() * 1_000_000));
  }, []);

  const changeDifficulty = useCallback((nextDifficulty) => {
    setDifficulty(nextDifficulty);
    setSeed(Math.floor(Math.random() * 1_000_000));
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

export function ClassicYarnPullApp() {
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
  } = useYarnPullGame();

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

export function CozyYarnPullApp() {
  const {
    changeDifficulty,
    difficulty,
    forest,
    game,
    history,
    onTap,
    playableIds,
    pullEvent,
    recenterKey,
    reroll,
    restart,
    shake,
    stuck,
    tappableIds,
    undo,
    won,
  } = useYarnPullGame();

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f5f3ef 0%, #f8f7f3 48%, #eef4ee 100%)",
        fontFamily: FONT_BODY,
        color: "#25313a",
        padding: "14px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700;800&family=JetBrains+Mono:wght@500&display=swap');
        .cozy-shell button {
          font-family: ${FONT_BODY};
        }
        button.cozy-btn {
          border: 1px solid rgba(61, 78, 91, 0.14);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.92);
          color: #25313a;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 5px 16px rgba(54, 64, 70, 0.09);
          transition: transform 140ms ease, background 140ms ease, box-shadow 140ms ease;
        }
        button.cozy-btn:hover {
          transform: translateY(-1px);
          background: #ffffff;
          box-shadow: 0 8px 20px rgba(54, 64, 70, 0.12);
        }
        button.cozy-btn.primary {
          background: #e277ba;
          color: white;
          border-color: #d75faa;
        }
        button.cozy-btn:disabled,
        button.cozy-btn:disabled:hover {
          opacity: 0.42;
          transform: none;
          cursor: default;
          box-shadow: none;
        }
        button.cozy-seg {
          border: 0;
          background: transparent;
          color: #52606a;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }
        button.cozy-seg.active {
          background: #4bb7c9;
          color: white;
          box-shadow: inset 0 -2px 0 rgba(0, 98, 116, 0.16);
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
        .cozy-layout {
          max-width: 1240px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .cozy-topbar {
          min-height: 42px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 9px 7px 14px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.82);
          border: 1px solid rgba(61, 78, 91, 0.12);
          box-shadow: 0 8px 24px rgba(54, 64, 70, 0.08);
        }
        .cozy-title {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 0;
          white-space: nowrap;
        }
        .cozy-actions {
          display: flex;
          gap: 7px;
          margin-left: auto;
        }
        .cozy-tray {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 9px 10px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(61, 78, 91, 0.12);
          box-shadow: 0 8px 24px rgba(54, 64, 70, 0.07);
        }
        @media (max-width: 820px) {
          .cozy-topbar { flex-wrap: wrap; }
          .cozy-actions { margin-left: 0; }
          .cozy-tray { align-items: flex-start; flex-direction: column; }
        }
      `}</style>

      <main className="cozy-shell cozy-layout">
        <header className="cozy-topbar">
          <div className="cozy-title">Untangle</div>
          <div
            aria-label="Difficulty"
            style={{
              display: "flex",
              gap: 4,
              padding: 3,
              borderRadius: 999,
              background: "rgba(244, 244, 239, 0.92)",
              border: "1px solid rgba(61, 78, 91, 0.1)",
            }}
          >
            {DIFFICULTIES.map((option) => (
              <button
                key={option.id}
                className={`cozy-seg${difficulty === option.id ? " active" : ""}`}
                onClick={() => changeDifficulty(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="cozy-actions">
            <button className="cozy-btn" onClick={restart}>
              Restart
            </button>
            <button className="cozy-btn primary" onClick={reroll}>
              New puzzle
            </button>
          </div>
        </header>

        <section
          style={{
            minWidth: 0,
            borderRadius: 20,
            background: "#f7f5ef",
            border: "1px solid rgba(61, 78, 91, 0.12)",
            boxShadow: "0 18px 44px rgba(54, 64, 70, 0.1)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 2,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              className="cozy-btn"
              onClick={undo}
              disabled={history.length === 0}
              title="Undo last move"
              style={{ padding: "8px 12px", background: "rgba(255, 255, 255, 0.92)" }}
            >
              Undo
            </button>
          </div>

          {stuck && (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: "absolute",
                top: 58,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 2,
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.94)",
                border: "1px solid rgba(61, 78, 91, 0.13)",
                boxShadow: "0 10px 26px rgba(54, 64, 70, 0.12)",
                padding: "10px 14px",
                maxWidth: "min(360px, calc(100% - 32px))",
                textAlign: "center",
                fontWeight: 700,
              }}
            >
              No open basket or spool can take these threads.
            </div>
          )}

          <ForestViewport
            focusKey={`cozy-${difficulty}-${forest.actual}-${recenterKey}`}
            variant="cozy"
          >
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
              variant="cozy"
            />
          </ForestViewport>

          {won && (
            <div
              style={{
                position: "absolute",
                right: 14,
                bottom: 14,
                zIndex: 2,
                display: "flex",
                gap: 10,
                alignItems: "center",
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.94)",
                border: "1px solid rgba(61, 78, 91, 0.13)",
                padding: "10px 12px",
                boxShadow: "0 10px 26px rgba(54, 64, 70, 0.12)",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 900 }}>All tucked away.</span>
              <button className="cozy-btn primary" onClick={reroll}>
                Another
              </button>
            </div>
          )}
        </section>

        <section className="cozy-tray">
          <CozyBasketsRow active={game.active} shakeKey={shake} />
          <CozySpoolsRow spools={game.spools} />
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return <CozyYarnPullApp />;
}

// ────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function ForestViewport({ children, focusKey, variant = "classic" }) {
  const cozy = variant === "cozy";
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

  if (cozy) {
    return (
      <div
        style={{
          height: "clamp(340px, 54vh, 600px)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          touchAction: "manipulation",
          userSelect: "none",
        }}
      >
        <div
          style={{
            width: "100%",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

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
          height: cozy ? "clamp(340px, 54vh, 600px)" : "clamp(360px, 58vh, 640px)",
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
          background: cozy ? "rgba(255, 255, 255, 0.9)" : "rgba(251, 243, 223, 0.86)",
          border: cozy ? "1px solid rgba(34, 102, 143, 0.18)" : "1.5px solid #2a1d10",
          borderRadius: cozy ? 999 : 0,
          boxShadow: cozy ? "0 6px 18px rgba(24, 91, 135, 0.13)" : "2px 2px 0 rgba(42, 29, 16, 0.24)",
        }}
      >
        <button
          className={cozy ? "cozy-map" : "ypmapbtn"}
          disabled={!canZoomOut}
          onClick={() => updateZoom(zoom - 0.12)}
          title="Zoom out"
        >
          -
        </button>
        <button className={cozy ? "cozy-map" : "ypmapbtn"} onClick={recenter} title="Recenter">
          ⊙
        </button>
        <button
          className={cozy ? "cozy-map" : "ypmapbtn"}
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

function CozyBasketsRow({ active, shakeKey }) {
  return (
    <section
      key={`cozy-shake-${shakeKey}`}
      className={shakeKey > 0 ? "yp-shake" : ""}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
      }}
    >
      {active.map((basket, i) => (
        <CozyBasketCell
          key={`cozy-slot-${i}-${basket ? basket.color + "-" + basket.slots.length : "empty"}`}
          basket={basket}
          index={i}
        />
      ))}
    </section>
  );
}

function CozyBasketCell({ basket, index }) {
  return (
    <div
      title={basket ? yarnTitle(basket.color) : `empty basket ${index + 1}`}
      style={{
        width: 112,
        minWidth: 112,
        height: 54,
        borderRadius: 14,
        border: `3px solid ${basket ? basket.color : "rgba(126, 168, 194, 0.45)"}`,
        background: "linear-gradient(180deg, #ffffff 0%, #eef9ff 100%)",
        boxShadow: basket
          ? `0 7px 16px rgba(54, 64, 70, 0.1), inset 0 -4px 0 ${basket.color}22`
          : "inset 0 -4px 0 rgba(126, 168, 194, 0.12)",
        opacity: basket ? 1 : 0.68,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        {[0, 1, 2].map((s) => {
          const filled = basket?.slots[s] !== undefined;
          return (
            <div
              key={s}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: `2px solid ${basket ? basket.color : "rgba(126, 168, 194, 0.5)"}`,
                background: filled
                  ? `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.38), transparent 34%), ${basket.color}`
                  : "linear-gradient(180deg, #e2f5ff 0%, #f9fdff 100%)",
                boxShadow: filled
                  ? "inset 0 0 0 5px rgba(255, 255, 255, 0.32)"
                  : "inset 0 2px 4px rgba(54, 64, 70, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxSizing: "border-box",
              }}
            >
              {filled && (
                <div
                  className="yp-pop"
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: "rgba(0, 80, 130, 0.18)",
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

function CozySpoolsRow({ spools }) {
  return (
    <section
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 7,
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      {spools.map((color, i) => (
        <div
          key={i}
          title={color ? yarnTitle(color) : `empty spool ${i + 1}`}
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "2px solid rgba(84, 139, 172, 0.45)",
            background: color
              ? `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.36), transparent 32%), ${color}`
              : "linear-gradient(180deg, #e2f5ff 0%, #ffffff 100%)",
            boxShadow: color
              ? "inset 0 0 0 7px rgba(255, 255, 255, 0.34), 0 4px 10px rgba(54, 64, 70, 0.1)"
              : "inset 0 2px 4px rgba(54, 64, 70, 0.1)",
          }}
        />
      ))}
    </section>
  );
}
