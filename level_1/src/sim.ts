import { type NColors, parseRule, type ParsedRule } from "./rules.js";

export interface SimulationOptions {
  width?: number;
  height?: number;
  pulseSteps?: number;
  macroTurns?: number[];
  frameEvery?: number;
  includeFrames?: boolean;
  spawnA?: Partial<AntState>;
  spawnB?: Partial<AntState>;
  random?: () => number;
}

export interface AntState {
  x: number;
  y: number;
  dir: number;
  coreX: number;
  coreY: number;
}

interface PulseAntState {
  x: number;
  y: number;
  dir: number;
}

export interface SimulationFrame {
  step: number;
  macroTurn: number;
  activeAnt: 0 | 1;
  biomassA: number;
  biomassB: number;
  antA: AntState;
  antB?: AntState;
  colors: number[];
  owners: number[];
}

export interface SimulationResult {
  ruleA: string;
  ruleB: string;
  nColors: NColors;
  ruleAColors?: NColors;
  ruleBColors?: NColors;
  width: number;
  height: number;
  pulseSteps: number;
  biomassA: number;
  biomassB: number;
  winner: "A" | "B" | "draw";
  coreKill: boolean;
  killedCore?: "A" | "B";
  totalSteps: number;
  mode?: "match" | "solo";
  frames?: SimulationFrame[];
}

const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;
const DEFAULT_PULSE_STEPS = 16_384;
const DEFAULT_MACRO_TURNS = [0, 1, 0, 1];

export function wrap(value: number, limit: number): number {
  return ((value % limit) + limit) % limit;
}

function cloneAnt(ant: AntState): AntState {
  return { x: ant.x, y: ant.y, dir: ant.dir, coreX: ant.coreX, coreY: ant.coreY };
}

function startPulseAtCore(ant: AntState): PulseAntState {
  return { x: ant.coreX, y: ant.coreY, dir: ant.dir };
}

function finishPulse(ant: AntState, pulseAnt: PulseAntState): void {
  ant.x = pulseAnt.x;
  ant.y = pulseAnt.y;
  ant.dir = pulseAnt.dir;
}

function randomInt(limit: number, random: () => number): number {
  return Math.floor(random() * limit);
}

function randomAnts(width: number, height: number, random: () => number): [AntState, AntState] {
  const cellCount = width * height;
  const aIndex = randomInt(cellCount, random);
  let bIndex = randomInt(cellCount, random);
  if (bIndex === aIndex) {
    bIndex = (bIndex + 1) % cellCount;
  }

  const aX = aIndex % width;
  const aY = Math.floor(aIndex / width);
  const bX = bIndex % width;
  const bY = Math.floor(bIndex / width);

  return [
    { x: aX, y: aY, dir: randomInt(4, random), coreX: aX, coreY: aY },
    { x: bX, y: bY, dir: randomInt(4, random), coreX: bX, coreY: bY }
  ];
}

function mergeAnt(base: AntState, override?: Partial<AntState>): AntState {
  const ant = { ...base, ...override };
  if (override?.coreX !== undefined && override.x === undefined) {
    ant.x = override.coreX;
  }
  if (override?.coreY !== undefined && override.y === undefined) {
    ant.y = override.coreY;
  }
  ant.dir = ((ant.dir % 4) + 4) % 4;
  return ant;
}

function moveForward(ant: PulseAntState, width: number, height: number): void {
  if (ant.dir === 0) ant.y = wrap(ant.y - 1, height);
  if (ant.dir === 1) ant.x = wrap(ant.x + 1, width);
  if (ant.dir === 2) ant.y = wrap(ant.y + 1, height);
  if (ant.dir === 3) ant.x = wrap(ant.x - 1, width);
}

function countBiomass(owners: Int8Array): [number, number] {
  let biomassA = 0;
  let biomassB = 0;

  for (const owner of owners) {
    if (owner === 0) biomassA += 1;
    if (owner === 1) biomassB += 1;
  }

  return [biomassA, biomassB];
}

function ownerSnapshot(owners: Int8Array): number[] {
  return Array.from(owners);
}

function colorSnapshot(colors: Uint8Array): number[] {
  return Array.from(colors);
}

function makeFrame(
  step: number,
  macroTurn: number,
  activeAnt: 0 | 1,
  colors: Uint8Array,
  owners: Int8Array,
  antA: AntState,
  antB?: AntState
): SimulationFrame {
  const [biomassA, biomassB] = countBiomass(owners);
  return {
    step,
    macroTurn,
    activeAnt,
    biomassA,
    biomassB,
    antA: cloneAnt(antA),
    antB: antB ? cloneAnt(antB) : undefined,
    colors: colorSnapshot(colors),
    owners: ownerSnapshot(owners)
  };
}

export function simulateMatch(ruleAId: string, ruleBId: string, nColors: NColors, options: SimulationOptions = {}): SimulationResult {
  return simulateParsedRules(parseRule(ruleAId, nColors), parseRule(ruleBId, nColors), nColors, options);
}

export function simulateMixedMatch(
  ruleAId: string,
  ruleAColors: NColors,
  ruleBId: string,
  ruleBColors: NColors,
  options: SimulationOptions = {}
): SimulationResult {
  const arenaColors = Math.max(ruleAColors, ruleBColors) as NColors;
  return simulateParsedRules(parseRule(ruleAId, ruleAColors), parseRule(ruleBId, ruleBColors), arenaColors, options);
}

export function simulateSoloRule(ruleId: string, nColors: NColors, options: SimulationOptions = {}, pulses = 4): SimulationResult {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const pulseSteps = options.pulseSteps ?? DEFAULT_PULSE_STEPS;
  const frameEvery = options.frameEvery ?? 512;
  const includeFrames = options.includeFrames ?? false;
  const random = options.random ?? Math.random;

  if (width <= 0 || height <= 0) {
    throw new Error("Grid dimensions must be positive");
  }

  const cellCount = width * height;
  const colors = new Uint8Array(cellCount);
  const owners = new Int8Array(cellCount);
  owners.fill(-1);

  const rule = parseRule(ruleId, nColors);
  const [baseA] = randomAnts(width, height, random);
  const antA = mergeAnt(baseA, options.spawnA);
  antA.coreX = wrap(antA.coreX, width);
  antA.coreY = wrap(antA.coreY, height);
  antA.x = wrap(antA.x, width);
  antA.y = wrap(antA.y, height);

  const frames: SimulationFrame[] = [];
  let totalSteps = 0;

  if (includeFrames) {
    frames.push(makeFrame(0, 0, 0, colors, owners, antA));
  }

  const soloAnt: PulseAntState = { x: antA.x, y: antA.y, dir: antA.dir };
  const totalTargetSteps = pulseSteps * pulses;

  for (let step = 0; step < totalTargetSteps; step += 1) {
    const index = soloAnt.y * width + soloAnt.x;
    const color = colors[index];
    const ruleColor = color % rule.nColors;

    colors[index] = rule.nextColors[ruleColor];
    owners[index] = 0;
    totalSteps += 1;

    soloAnt.dir = (soloAnt.dir + rule.turns[ruleColor] + 4) % 4;
    moveForward(soloAnt, width, height);
    finishPulse(antA, soloAnt);

    if (includeFrames && totalSteps % frameEvery === 0) {
      frames.push(makeFrame(totalSteps, Math.floor(step / pulseSteps), 0, colors, owners, antA));
    }
  }

  const [biomassA] = countBiomass(owners);
  if (includeFrames && (frames.length === 0 || frames[frames.length - 1].step !== totalSteps)) {
    frames.push(makeFrame(totalSteps, Math.max(0, pulses - 1), 0, colors, owners, antA));
  }

  return {
    ruleA: rule.id,
    ruleB: "",
    nColors,
    ruleAColors: nColors,
    width,
    height,
    pulseSteps,
    biomassA,
    biomassB: 0,
    winner: "A",
    coreKill: false,
    totalSteps,
    mode: "solo",
    frames: includeFrames ? frames : undefined
  };
}

function simulateParsedRules(ruleA: ParsedRule, ruleB: ParsedRule, arenaColors: NColors, options: SimulationOptions): SimulationResult {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const pulseSteps = options.pulseSteps ?? DEFAULT_PULSE_STEPS;
  const macroTurns = options.macroTurns ?? DEFAULT_MACRO_TURNS;
  const frameEvery = options.frameEvery ?? 512;
  const includeFrames = options.includeFrames ?? false;
  const random = options.random ?? Math.random;

  if (width <= 0 || height <= 0) {
    throw new Error("Grid dimensions must be positive");
  }

  const cellCount = width * height;
  const colors = new Uint8Array(cellCount);
  const owners = new Int8Array(cellCount);
  owners.fill(-1);

  const [baseA, baseB] = randomAnts(width, height, random);
  const antA = mergeAnt(baseA, options.spawnA);
  const antB = mergeAnt(baseB, options.spawnB);
  antA.coreX = wrap(antA.coreX, width);
  antA.coreY = wrap(antA.coreY, height);
  antB.coreX = wrap(antB.coreX, width);
  antB.coreY = wrap(antB.coreY, height);
  antA.x = wrap(antA.x, width);
  antA.y = wrap(antA.y, height);
  antB.x = wrap(antB.x, width);
  antB.y = wrap(antB.y, height);

  const ants = [antA, antB] as const;
  const rules = [ruleA, ruleB] as const;
  const frames: SimulationFrame[] = [];
  let totalSteps = 0;
  let coreKill = false;
  let killedCore: "A" | "B" | undefined;

  if (includeFrames) {
    frames.push(makeFrame(0, 0, 0, colors, owners, antA, antB));
  }

  outer:
  for (let macroTurn = 0; macroTurn < macroTurns.length; macroTurn += 1) {
    const activeAnt = macroTurns[macroTurn] as 0 | 1;
    const opponent = activeAnt === 0 ? 1 : 0;
    const ant = ants[activeAnt];
    const opponentAnt = ants[opponent];
    const rule = rules[activeAnt];
    const pulseAnt = startPulseAtCore(ant);

    for (let pulseStep = 0; pulseStep < pulseSteps; pulseStep += 1) {
      const index = pulseAnt.y * width + pulseAnt.x;
      const color = colors[index];
      const ruleColor = color % rule.nColors;

      colors[index] = rule.nextColors[ruleColor];
      owners[index] = activeAnt;

      totalSteps += 1;

      if (pulseAnt.x === opponentAnt.coreX && pulseAnt.y === opponentAnt.coreY) {
        coreKill = true;
        killedCore = opponent === 0 ? "A" : "B";
        finishPulse(ant, pulseAnt);
        if (includeFrames) {
          frames.push(makeFrame(totalSteps, macroTurn, activeAnt, colors, owners, antA, antB));
        }
        break outer;
      }

      pulseAnt.dir = (pulseAnt.dir + rule.turns[ruleColor] + 4) % 4;
      moveForward(pulseAnt, width, height);
      finishPulse(ant, pulseAnt);

      if (includeFrames && totalSteps % frameEvery === 0) {
        frames.push(makeFrame(totalSteps, macroTurn, activeAnt, colors, owners, antA, antB));
      }
    }
  }

  const [biomassA, biomassB] = countBiomass(owners);
  let winner: "A" | "B" | "draw" = "draw";
  if (coreKill) {
    winner = killedCore === "A" ? "B" : "A";
  } else if (biomassA > biomassB) {
    winner = "A";
  } else if (biomassB > biomassA) {
    winner = "B";
  }

  if (includeFrames && (frames.length === 0 || frames[frames.length - 1].step !== totalSteps)) {
    frames.push(makeFrame(totalSteps, macroTurns.length - 1, macroTurns.at(-1) as 0 | 1, colors, owners, antA, antB));
  }

  return {
    ruleA: ruleA.id,
    ruleB: ruleB.id,
    nColors: arenaColors,
    ruleAColors: ruleA.nColors,
    ruleBColors: ruleB.nColors,
    width,
    height,
    pulseSteps,
    biomassA,
    biomassB,
    winner,
    coreKill,
    killedCore,
    totalSteps,
    mode: "match",
    frames: includeFrames ? frames : undefined
  };
}
