import { describe, expect, it } from "vitest";
import { runPoolTournamentCore, selectDistinctRandomRules } from "../src/pool.js";

describe("pool tournaments", () => {
  it("selects a distinct random pool", () => {
    const rules = selectDistinctRandomRules(2, 16, () => 0.42);

    expect(rules).toHaveLength(16);
    expect(new Set(rules).size).toBe(16);
  });

  it("runs and ranks a small round-robin pool", () => {
    const summary = runPoolTournamentCore({
      nColors: 2,
      poolSize: 4,
      random: () => 0.25,
      simulation: {
        width: 16,
        height: 16,
        pulseSteps: 16,
        includeFrames: false,
        random: () => 0.1
      }
    });

    expect(summary.poolSize).toBe(4);
    expect(summary.matchesCompleted).toBe(6);
    expect(summary.ranking).toHaveLength(4);
    expect(summary.ranking.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
    expect(summary.ranking.every((entry) => entry.gamesPlayed === 3)).toBe(true);
  });
});
