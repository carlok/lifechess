import { describe, expect, it } from "vitest";
import { ARENA_COLORS, PARSED_PIECES, PIECES, parseRule } from "../src/rules.js";

describe("level 2 automata rules", () => {
  it("defines four named 4-color automata", () => {
    expect(Object.keys(PIECES)).toEqual(["a", "b", "c", "d"]);
    for (const piece of Object.values(PIECES)) {
      const parsed = parseRule(piece.ruleId);
      expect(parsed.nextColors).toHaveLength(ARENA_COLORS);
      expect(parsed.turns).toHaveLength(ARENA_COLORS);
    }
  });

  it("pre-parses every available depot piece", () => {
    expect(PARSED_PIECES.a.id).toBe("2R_0L_1R_0R");
    expect(PARSED_PIECES.b.id).toBe("3L_0R_0R_1L");
    expect(PARSED_PIECES.c.id).toBe("2L_2R_3L_0R");
    expect(PARSED_PIECES.d.id).toBe("2L_1R_3L_0R");
  });
});
