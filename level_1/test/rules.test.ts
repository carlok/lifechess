import { describe, expect, it } from "vitest";
import { encodeRule, generateRules, parseRule } from "../src/rules.js";

describe("rule generation", () => {
  it("generates the complete rule spaces", () => {
    expect(generateRules(2)).toHaveLength(16);
    expect(generateRules(3)).toHaveLength(216);
    expect(generateRules(4)).toHaveLength(4096);
  });

  it("round-trips encoded rules", () => {
    const encoded = encodeRule([
      { nextColor: 1, turn: "L" },
      { nextColor: 2, turn: "R" },
      { nextColor: 1, turn: "L" }
    ]);
    const parsed = parseRule(encoded, 3);

    expect(encoded).toBe("1L_2R_1L");
    expect(Array.from(parsed.nextColors)).toEqual([1, 2, 1]);
    expect(Array.from(parsed.turns)).toEqual([-1, 1, -1]);
  });
});
