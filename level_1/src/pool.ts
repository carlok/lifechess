import { getRules, type NColors } from "./rules.js";
import { simulateMatch, type SimulationOptions, type SimulationResult } from "./sim.js";

export interface RankedRule {
  rank: number;
  ruleId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  biomassFor: number;
  biomassAgainst: number;
  averageBiomass: number;
  averageBiomassAgainst: number;
  averageBiomassMargin: number;
  score: number;
  eloRating: number;
  coreKillsFor: number;
  coreKillsAgainst: number;
}

interface PoolStanding {
  ruleId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  biomassFor: number;
  biomassAgainst: number;
  eloRating: number;
  coreKillsFor: number;
  coreKillsAgainst: number;
}

export interface PoolTournamentOptions {
  nColors: NColors;
  poolSize: number;
  simulation?: SimulationOptions;
  random?: () => number;
  recordResult?: (result: SimulationResult) => void;
}

export interface PoolTournamentSummary {
  nColors: NColors;
  poolSize: number;
  matchesCompleted: number;
  rules: string[];
  ranking: RankedRule[];
}

export function selectDistinctRandomRules(nColors: NColors, poolSize: number, random = Math.random): string[] {
  const rules = [...getRules(nColors)];
  const limit = Math.min(poolSize, rules.length);

  for (let index = rules.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [rules[index], rules[swapIndex]] = [rules[swapIndex], rules[index]];
  }

  return rules.slice(0, limit);
}

export function runPoolTournamentCore(options: PoolTournamentOptions): PoolTournamentSummary {
  const rules = selectDistinctRandomRules(options.nColors, options.poolSize, options.random);
  const standings = new Map<string, PoolStanding>();

  for (const rule of rules) {
    standings.set(rule, {
      ruleId: rule,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      biomassFor: 0,
      biomassAgainst: 0,
      eloRating: 1000,
      coreKillsFor: 0,
      coreKillsAgainst: 0
    });
  }

  let matchesCompleted = 0;

  for (let aIndex = 0; aIndex < rules.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < rules.length; bIndex += 1) {
      const result = simulateMatch(rules[aIndex], rules[bIndex], options.nColors, options.simulation);
      options.recordResult?.(result);
      updatePoolStandings(standings.get(result.ruleA)!, standings.get(result.ruleB)!, result);
      matchesCompleted += 1;
    }
  }

  const ranking = Array.from(standings.values())
    .map((standing) => ({
      rank: 0,
      ruleId: standing.ruleId,
      gamesPlayed: standing.gamesPlayed,
      wins: standing.wins,
      losses: standing.losses,
      draws: standing.draws,
      biomassFor: standing.biomassFor,
      biomassAgainst: standing.biomassAgainst,
      averageBiomass: standing.gamesPlayed === 0 ? 0 : standing.biomassFor / standing.gamesPlayed,
      averageBiomassAgainst: standing.gamesPlayed === 0 ? 0 : standing.biomassAgainst / standing.gamesPlayed,
      averageBiomassMargin: standing.gamesPlayed === 0 ? 0 : (standing.biomassFor - standing.biomassAgainst) / standing.gamesPlayed,
      score: standing.wins + standing.draws * 0.5,
      eloRating: standing.eloRating,
      coreKillsFor: standing.coreKillsFor,
      coreKillsAgainst: standing.coreKillsAgainst
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.averageBiomass !== a.averageBiomass) return b.averageBiomass - a.averageBiomass;
      return a.ruleId.localeCompare(b.ruleId);
    })
    .map((standing, index) => ({ ...standing, rank: index + 1 }));

  return {
    nColors: options.nColors,
    poolSize: rules.length,
    matchesCompleted,
    rules,
    ranking
  };
}

function updatePoolStandings(a: PoolStanding, b: PoolStanding, result: SimulationResult): void {
  const expectedA = eloExpected(a.eloRating, b.eloRating);
  const expectedB = eloExpected(b.eloRating, a.eloRating);
  const scoreA = result.winner === "draw" ? 0.5 : result.winner === "A" ? 1 : 0;
  const scoreB = result.winner === "draw" ? 0.5 : result.winner === "B" ? 1 : 0;

  a.gamesPlayed += 1;
  b.gamesPlayed += 1;
  a.biomassFor += result.biomassA;
  a.biomassAgainst += result.biomassB;
  b.biomassFor += result.biomassB;
  b.biomassAgainst += result.biomassA;
  a.eloRating += 24 * (scoreA - expectedA);
  b.eloRating += 24 * (scoreB - expectedB);

  if (result.coreKill && result.winner === "A") {
    a.coreKillsFor += 1;
    b.coreKillsAgainst += 1;
  }

  if (result.coreKill && result.winner === "B") {
    b.coreKillsFor += 1;
    a.coreKillsAgainst += 1;
  }

  if (result.winner === "draw") {
    a.draws += 1;
    b.draws += 1;
  } else if (result.winner === "A") {
    a.wins += 1;
    b.losses += 1;
  } else {
    b.wins += 1;
    a.losses += 1;
  }
}

function eloExpected(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}
