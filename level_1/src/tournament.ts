import { setupLedger } from "./db.js";
import { getRules, isNColors, randomRule, type NColors } from "./rules.js";
import { simulateMatch, type SimulationOptions, type SimulationResult } from "./sim.js";
import { recordMatch } from "./db.js";
import { runPoolTournamentCore, type PoolTournamentOptions, type PoolTournamentSummary } from "./pool.js";
import { runMixedPoolTournamentCore, type MixedPoolTournamentOptions, type MixedPoolTournamentSummary } from "./mixedPool.js";

export interface TournamentOptions {
  nColors: NColors;
  matches: number;
  simulation?: SimulationOptions;
}

export interface TournamentSummary {
  nColors: NColors;
  matchesRequested: number;
  matchesCompleted: number;
  ruleCount: number;
  winsA: number;
  winsB: number;
  draws: number;
}

export function runSampledTournament(options: TournamentOptions): TournamentSummary {
  const db = setupLedger();
  const rules = getRules(options.nColors);
  const summary: TournamentSummary = {
    nColors: options.nColors,
    matchesRequested: options.matches,
    matchesCompleted: 0,
    ruleCount: rules.length,
    winsA: 0,
    winsB: 0,
    draws: 0
  };

  try {
    for (let index = 0; index < options.matches; index += 1) {
      const result = simulateMatch(
        randomRule(options.nColors),
        randomRule(options.nColors),
        options.nColors,
        options.simulation
      );

      recordMatch(db, result);
      summary.matchesCompleted += 1;
      if (result.winner === "A") summary.winsA += 1;
      if (result.winner === "B") summary.winsB += 1;
      if (result.winner === "draw") summary.draws += 1;
    }
  } finally {
    db.close();
  }

  return summary;
}

export function randomMatch(nColors: NColors, options: SimulationOptions = {}): SimulationResult {
  return simulateMatch(randomRule(nColors), randomRule(nColors), nColors, options);
}

export function runPoolTournament(options: PoolTournamentOptions): PoolTournamentSummary {
  const db = setupLedger();
  try {
    return runPoolTournamentCore({
      ...options,
      recordResult: (result) => {
        recordMatch(db, result);
      }
    });
  } finally {
    db.close();
  }
}

export function runMixedPoolTournament(options: MixedPoolTournamentOptions): MixedPoolTournamentSummary {
  const db = setupLedger();
  try {
    return runMixedPoolTournamentCore({
      ...options,
      recordResult: (result) => {
        recordMatch(db, result);
      }
    });
  } finally {
    db.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const nColors = Number(process.argv[2] ?? 3);
  const matches = Number(process.argv[3] ?? 10);

  if (!isNColors(nColors)) {
    throw new Error("Usage: npm run tournament -- <2|3|4> <matches>");
  }

  const mode = process.argv[4] ?? "sampled";
  const summary = mode === "mixed"
    ? runMixedPoolTournament({ poolSize: matches })
    : mode === "pool"
      ? runPoolTournament({ nColors, poolSize: matches })
      : runSampledTournament({ nColors, matches });
  console.log(JSON.stringify(summary, null, 2));
}
