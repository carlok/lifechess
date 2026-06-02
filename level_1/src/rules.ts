export type NColors = 2 | 3 | 4;
export type Turn = "L" | "R";

export interface Transition {
  nextColor: number;
  turn: Turn;
}

export interface ParsedRule {
  id: string;
  nColors: NColors;
  nextColors: Uint8Array;
  turns: Int8Array;
}

const VALID_COLOR_COUNTS = new Set([2, 3, 4]);

export function isNColors(value: number): value is NColors {
  return VALID_COLOR_COUNTS.has(value);
}

export function encodeRule(transitions: Transition[]): string {
  return transitions.map((transition) => `${transition.nextColor}${transition.turn}`).join("_");
}

export function parseRule(ruleId: string, nColors: NColors): ParsedRule {
  const parts = ruleId.split("_");

  if (parts.length !== nColors) {
    throw new Error(`Rule ${ruleId} has ${parts.length} transitions, expected ${nColors}`);
  }

  const nextColors = new Uint8Array(nColors);
  const turns = new Int8Array(nColors);

  parts.forEach((part, index) => {
    const match = part.match(/^(\d+)([LR])$/);
    if (!match) {
      throw new Error(`Invalid transition "${part}" in rule ${ruleId}`);
    }

    const nextColor = Number(match[1]);
    if (!Number.isInteger(nextColor) || nextColor < 0 || nextColor >= nColors) {
      throw new Error(`Transition "${part}" uses color outside 0..${nColors - 1}`);
    }

    nextColors[index] = nextColor;
    turns[index] = match[2] === "L" ? -1 : 1;
  });

  return { id: ruleId, nColors, nextColors, turns };
}

export function generateRules(nColors: NColors): string[] {
  const choices: Transition[] = [];
  for (let nextColor = 0; nextColor < nColors; nextColor += 1) {
    choices.push({ nextColor, turn: "L" }, { nextColor, turn: "R" });
  }

  const rules: string[] = [];
  const current: Transition[] = Array.from({ length: nColors }, () => ({ nextColor: 0, turn: "L" }));

  function visit(depth: number): void {
    if (depth === nColors) {
      rules.push(encodeRule(current));
      return;
    }

    for (const choice of choices) {
      current[depth] = choice;
      visit(depth + 1);
    }
  }

  visit(0);
  return rules;
}

export const RULES_BY_COLOR_COUNT: Record<NColors, string[]> = {
  2: generateRules(2),
  3: generateRules(3),
  4: generateRules(4)
};

export function getRules(nColors: NColors): string[] {
  return RULES_BY_COLOR_COUNT[nColors];
}

export function randomRule(nColors: NColors, random = Math.random): string {
  const rules = getRules(nColors);
  return rules[Math.floor(random() * rules.length)];
}
