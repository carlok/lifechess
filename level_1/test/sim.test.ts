import { describe, expect, it } from "vitest";
import { simulateMatch, simulateSoloRule, wrap } from "../src/sim.js";

describe("simulation", () => {
  it("wraps coordinates on toroidal edges", () => {
    expect(wrap(-1, 8)).toBe(7);
    expect(wrap(8, 8)).toBe(0);
    expect(wrap(4, 8)).toBe(4);
  });

  it("updates ownership when cells are written", () => {
    const result = simulateMatch("0R_0R", "0R_0R", 2, {
      width: 8,
      height: 8,
      pulseSteps: 1,
      macroTurns: [0, 1],
      random: () => 0.2,
      includeFrames: false
    });

    expect(result.biomassA).toBe(1);
    expect(result.biomassB).toBe(1);
    expect(result.totalSteps).toBe(2);
  });

  it("ends immediately when an opponent core is overwritten", () => {
    const result = simulateMatch("0R_0R", "0R_0R", 2, {
      width: 8,
      height: 8,
      pulseSteps: 8,
      macroTurns: [0, 1],
      spawnA: { coreX: 4, coreY: 4, dir: 1 },
      spawnB: { coreX: 4, coreY: 5 },
      includeFrames: false
    });

    expect(result.coreKill).toBe(true);
    expect(result.killedCore).toBe("B");
    expect(result.winner).toBe("A");
    expect(result.totalSteps).toBe(2);
  });

  it("starts each macro-turn pulse from the frozen core cell", () => {
    const result = simulateMatch("0R_0R", "0R_0R", 2, {
      width: 12,
      height: 12,
      pulseSteps: 2,
      macroTurns: [0, 0],
      spawnA: { coreX: 5, coreY: 5, dir: 1 },
      spawnB: { coreX: 10, coreY: 10, dir: 3 },
      includeFrames: true,
      frameEvery: 1
    });

    expect(result.frames?.[2].step).toBe(2);
    expect(result.frames?.[2].antA).toMatchObject({ x: 4, y: 6, dir: 3 });
    expect(result.frames?.[3].step).toBe(3);
    expect(result.frames?.[3].antA).toMatchObject({ x: 5, y: 4, dir: 0 });
  });

  it("places ants from random distinct core cells by default", () => {
    const result = simulateMatch("0R_0R", "0R_0R", 2, {
      width: 10,
      height: 10,
      pulseSteps: 0,
      includeFrames: true,
      random: mockRandom([0.12, 0.34, 0.1, 0.9])
    });

    const initial = result.frames?.[0];
    expect(initial?.antA).toMatchObject({ coreX: 2, coreY: 1, dir: 0 });
    expect(initial?.antB).toMatchObject({ coreX: 4, coreY: 3, dir: 3 });
  });

  it("renders a single rule shape without an opponent", () => {
    const result = simulateSoloRule("1R_0L", 2, {
      width: 16,
      height: 16,
      pulseSteps: 16,
      includeFrames: true,
      frameEvery: 8,
      random: mockRandom([0.2, 0.7, 0.1, 0.8])
    }, 2);

    expect(result.mode).toBe("solo");
    expect(result.ruleA).toBe("1R_0L");
    expect(result.ruleB).toBe("");
    expect(result.biomassA).toBeGreaterThan(0);
    expect(result.biomassB).toBe(0);
    expect(result.frames?.some((frame) => frame.antB === undefined)).toBe(true);
  });

  it("runs solo shapes continuously instead of respawning from the core", () => {
    const result = simulateSoloRule("1R_0L", 2, {
      width: 16,
      height: 16,
      pulseSteps: 5,
      includeFrames: true,
      frameEvery: 1,
      spawnA: { coreX: 8, coreY: 8, dir: 1 }
    }, 2);

    expect(result.totalSteps).toBe(10);
    expect(result.frames?.[5].antA).toMatchObject({ x: 8, y: 7, dir: 0 });
    expect(result.frames?.[6].antA).toMatchObject({ x: 9, y: 7, dir: 1 });
  });

  it("detects biomass draws", () => {
    const result = simulateMatch("0R_0R", "0R_0R", 2, {
      width: 8,
      height: 8,
      pulseSteps: 8,
      macroTurns: [],
      includeFrames: false
    });

    expect(result.biomassA).toBe(0);
    expect(result.biomassB).toBe(0);
    expect(result.winner).toBe("draw");
  });

  it("runs deterministic smoke matches for each color count", () => {
    const two = simulateMatch("0R_0R", "1L_1L", 2, { width: 16, height: 16, pulseSteps: 32 });
    const three = simulateMatch("0R_1L_2R", "2L_1R_0L", 3, { width: 16, height: 16, pulseSteps: 32 });
    const four = simulateMatch("0R_1L_2R_3L", "3L_2R_1L_0R", 4, { width: 16, height: 16, pulseSteps: 32 });

    expect(two.totalSteps).toBeGreaterThan(0);
    expect(three.totalSteps).toBeGreaterThan(0);
    expect(four.totalSteps).toBeGreaterThan(0);
  });
});

function mockRandom(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}
