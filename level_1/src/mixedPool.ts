import { getRules, type NColors } from "./rules.js";
import { simulateMixedMatch, type SimulationOptions, type SimulationResult } from "./sim.js";

export interface MixedRuleEntry {
  ruleId: string;
  nColors: NColors;
}

export interface MixedRankedRule extends MixedRuleEntry {
  rank: number;
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

interface MixedStanding extends MixedRuleEntry {
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

export interface MixedPoolTournamentOptions {
  poolSize: number;
  simulation?: SimulationOptions;
  random?: () => number;
  recordResult?: (result: SimulationResult) => void;
}

export interface MixedPoolTournamentSummary {
  arenaColors: NColors;
  poolSize: number;
  matchesCompleted: number;
  colorCounts: Record<NColors, number>;
  rules: MixedRuleEntry[];
  ranking: MixedRankedRule[];
}

export function selectBalancedMixedRules(poolSize: number, random = Math.random): MixedRuleEntry[] {
  const available: Record<NColors, string[]> = {
    2: shuffled(getRules(2), random),
    3: shuffled(getRules(3), random),
    4: shuffled(getRules(4), random)
  };
  const counts: Record<NColors, number> = { 2: 0, 3: 0, 4: 0 };
  const colorOrder: NColors[] = [2, 3, 4];
  const targetBase = Math.floor(poolSize / colorOrder.length);

  for (const nColors of colorOrder) {
    counts[nColors] = Math.min(targetBase, available[nColors].length);
  }

  let remaining = poolSize - sumCounts(counts);
  let cursor = 0;
  while (remaining > 0) {
    const nColors = colorOrder[cursor % colorOrder.length];
    if (counts[nColors] < available[nColors].length) {
      counts[nColors] += 1;
      remaining -= 1;
    }
    cursor += 1;

    if (cursor > poolSize * colorOrder.length * 2) {
      break;
    }
  }

  return colorOrder.flatMap((nColors) =>
    available[nColors].slice(0, counts[nColors]).map((ruleId) => ({ ruleId, nColors }))
  );
}

export function runMixedPoolTournamentCore(options: MixedPoolTournamentOptions): MixedPoolTournamentSummary {
  const rules = selectBalancedMixedRules(options.poolSize, options.random);
  const standings = new Map<string, MixedStanding>();
  const colorCounts: Record<NColors, number> = { 2: 0, 3: 0, 4: 0 };

  for (const rule of rules) {
    standings.set(ruleKey(rule), {
      ...rule,
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
    colorCounts[rule.nColors] += 1;
  }

  let matchesCompleted = 0;

  for (let aIndex = 0; aIndex < rules.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < rules.length; bIndex += 1) {
      const ruleA = rules[aIndex];
      const ruleB = rules[bIndex];
      const result = simulateMixedMatch(ruleA.ruleId, ruleA.nColors, ruleB.ruleId, ruleB.nColors, options.simulation);
      options.recordResult?.(result);
      updateStandings(standings.get(ruleKey(ruleA))!, standings.get(ruleKey(ruleB))!, result);
      matchesCompleted += 1;
    }
  }

  return {
    arenaColors: 4,
    poolSize: rules.length,
    matchesCompleted,
    colorCounts,
    rules,
    ranking: rankStandings(Array.from(standings.values()))
  };
}

function rankStandings(standings: MixedStanding[]): MixedRankedRule[] {
  return standings
    .map((standing) => ({
      ...standing,
      rank: 0,
      averageBiomass: standing.gamesPlayed === 0 ? 0 : standing.biomassFor / standing.gamesPlayed,
      averageBiomassAgainst: standing.gamesPlayed === 0 ? 0 : standing.biomassAgainst / standing.gamesPlayed,
      averageBiomassMargin: standing.gamesPlayed === 0 ? 0 : (standing.biomassFor - standing.biomassAgainst) / standing.gamesPlayed,
      score: standing.wins + standing.draws * 0.5
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.averageBiomassMargin !== a.averageBiomassMargin) return b.averageBiomassMargin - a.averageBiomassMargin;
      if (b.nColors !== a.nColors) return b.nColors - a.nColors;
      return a.ruleId.localeCompare(b.ruleId);
    })
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
}

function updateStandings(a: MixedStanding, b: MixedStanding, result: SimulationResult): void {
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

function shuffled<T>(values: T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function sumCounts(counts: Record<NColors, number>): number {
  return counts[2] + counts[3] + counts[4];
}

function ruleKey(rule: MixedRuleEntry): string {
  return `${rule.nColors}:${rule.ruleId}`;
}

function eloExpected(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}
