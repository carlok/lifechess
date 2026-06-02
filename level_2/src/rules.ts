export type PieceKey = "a" | "b" | "c" | "d";
export type Turn = "L" | "R";

export interface AutomatonPiece {
  key: PieceKey;
  ruleId: string;
  name: string;
}

export interface ParsedRule {
  id: string;
  nextColors: Uint8Array;
  turns: Int8Array;
}

export const ARENA_COLORS = 4;

export const PIECES: Record<PieceKey, AutomatonPiece> = {
  a: { key: "a", ruleId: "2R_0L_1R_0R", name: "a" },
  b: { key: "b", ruleId: "3L_0R_0R_1L", name: "b" },
  c: { key: "c", ruleId: "2L_2R_3L_0R", name: "c" },
  d: { key: "d", ruleId: "2L_1R_3L_0R", name: "d" }
};

export const PIECE_KEYS = Object.keys(PIECES) as PieceKey[];

export function isPieceKey(value: unknown): value is PieceKey {
  return typeof value === "string" && PIECE_KEYS.includes(value as PieceKey);
}

export function parseRule(ruleId: string): ParsedRule {
  const parts = ruleId.split("_");
  if (parts.length !== ARENA_COLORS) {
    throw new Error(`Rule ${ruleId} has ${parts.length} transitions, expected ${ARENA_COLORS}`);
  }

  const nextColors = new Uint8Array(ARENA_COLORS);
  const turns = new Int8Array(ARENA_COLORS);

  parts.forEach((part, index) => {
    const match = part.match(/^(\d+)([LR])$/);
    if (!match) {
      throw new Error(`Invalid transition "${part}" in rule ${ruleId}`);
    }

    const nextColor = Number(match[1]);
    if (!Number.isInteger(nextColor) || nextColor < 0 || nextColor >= ARENA_COLORS) {
      throw new Error(`Transition "${part}" uses color outside 0..${ARENA_COLORS - 1}`);
    }

    nextColors[index] = nextColor;
    turns[index] = match[2] === "L" ? -1 : 1;
  });

  return { id: ruleId, nextColors, turns };
}

export const PARSED_PIECES: Record<PieceKey, ParsedRule> = {
  a: parseRule(PIECES.a.ruleId),
  b: parseRule(PIECES.b.ruleId),
  c: parseRule(PIECES.c.ruleId),
  d: parseRule(PIECES.d.ruleId)
};
