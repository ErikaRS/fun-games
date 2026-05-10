import {
  addReservePressure,
  assignBasketsToForest,
} from "./basket-assignment.js";
import { generateForest, makeRng } from "./forest-generation.js";

// End-to-end puzzle composition.
//
// This is the only module that knows how to turn a puzzle seed into all of the
// generator inputs. Forest generation owns shape. Basket assignment owns colors
// and basket pressure. This orchestrator wires those pieces together and keeps
// their RNG streams separate so each phase remains reproducible and testable.

const ATTEMPT_STRIDE = 7919;
const COLOR_RNG_SALT = 0xb45c0107;
const PRESSURE_RNG_SALT = 0x91e10da5;
const PRESSURE_ENABLED_SALT = 0x51a7e1ed;

export function buildPuzzleFromForest({
  forest,
  colorRng,
  pressureRng,
  pressureEnabled = true,
  reserveCapacity,
  maxLag,
  earlyCandidateRatio,
  candidateBudget,
  candidateLimit,
}) {
  const assignment = assignBasketsToForest(forest, colorRng);
  const pressured = addReservePressure(assignment.forest, assignment.baskets, pressureRng, {
    reserveCapacity,
    maxLag,
    forcedReserveChance: pressureEnabled ? 1 : 0,
    earlyCandidateRatio,
    candidateBudget,
    candidateLimit,
  });

  return {
    forest: assignment.forest,
    baskets: pressured.baskets,
    pressure: pressured.metrics,
  };
}

export function generateColorTrailPuzzle({
  numBaskets,
  seed,
  reserveCapacity,
  maxLag,
  forcedReserveChance,
  earlyCandidateRatio,
  candidateBudget,
  candidateLimit,
}) {
  // A puzzle seed fans out into separate deterministic RNG streams for forest
  // shape, coloring, and pressure search. Attempts nudge the seed by a fixed
  // stride so failed pressure searches can try nearby but reproducible puzzles.
  // The first valid colored forest is kept as fallback; pressure is a quality
  // upgrade, not a hard requirement.
  let fallback = null;
  const pressureEnabled =
    forcedReserveChance === undefined || makeRng(seed ^ PRESSURE_ENABLED_SALT)() <= forcedReserveChance;

  for (let attempt = 0; attempt < 8; attempt++) {
    const attemptSeed = (seed + attempt * ATTEMPT_STRIDE) >>> 0;
    const puzzle = buildPuzzleFromForest({
      forest: generateForest({ numBaskets, seed: attemptSeed }),
      colorRng: makeRng(attemptSeed ^ COLOR_RNG_SALT),
      pressureRng: makeRng(attemptSeed ^ PRESSURE_RNG_SALT),
      pressureEnabled,
      reserveCapacity,
      maxLag,
      earlyCandidateRatio,
      candidateBudget,
      candidateLimit,
    });

    if (!fallback) fallback = puzzle;
    if (puzzle.pressure.pressured) return puzzle;
  }

  return fallback;
}
