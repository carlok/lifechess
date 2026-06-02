import { describe, expect, it } from "vitest";
import { runMixedPoolTournamentCore, selectBalancedMixedRules } from "../src/mixedPool.js";

describe("mixed color pool tournaments", () => {
  it("selects a balanced mixed pool capped by the 2-color space", () => {
    const rules = selectBalancedMixedRules(128, () => 0.3);

    expect(rules).toHaveLength(128);
    expect(rules.filter((rule) => rule.nColors === 2)).toHaveLength(16);
    expect(rules.filter((rule) => rule.nColors === 3)).toHaveLength(56);
    expect(rules.filter((rule) => rule.nColors === 4)).toHaveLength(56);
  });

  it("runs and ranks a small mixed pool", () => {
    const summary = runMixedPoolTournamentCore({
      poolSize: 6,
      random: () => 0.2,
      simulation: {
        width: 16,
        height: 16,
        pulseSteps: 16,
        random: () => 0.4,
        includeFrames: false
      }
    });

    expect(summary.arenaColors).toBe(4);
    expect(summary.matchesCompleted).toBe(15);
    expect(summary.ranking).toHaveLength(6);
    expect(summary.ranking.every((entry) => entry.gamesPlayed === 5)).toBe(true);
  });
});
