import { ARENA_COLORS, isPieceKey, PARSED_PIECES, PIECES, type PieceKey } from "./rules.js";

export type Player = 0 | 1;
export type Direction = 0 | 1 | 2 | 3;
export type PieceStatus = "reserve" | "alive" | "dead";
export type Winner = "A" | "B" | "draw";

export interface GameOptions {
  width?: number;
  height?: number;
  pulseSteps?: number;
  frameEvery?: number;
  maxTurnsPerPlayer?: number;
  id?: string;
}

export interface PieceState {
  id: string;
  player: Player;
  slot: number;
  ruleKey: PieceKey;
  ruleId: string;
  status: PieceStatus;
  x?: number;
  y?: number;
  coreX?: number;
  coreY?: number;
  dir?: Direction;
  killCount: number;
}

export interface GameState {
  id: string;
  width: number;
  height: number;
  pulseSteps: number;
  frameEvery: number;
  maxTurnsPerPlayer: number;
  activePlayer: Player;
  turnsTaken: [number, number];
  colors: Uint8Array;
  owners: Int8Array;
  pieces: PieceState[];
  winner?: Winner;
  ended: boolean;
  endReason?: string;
}

export interface PublicGameState {
  id: string;
  width: number;
  height: number;
  nColors: number;
  pulseSteps: number;
  activePlayer: Player;
  turnsTaken: [number, number];
  biomassA: number;
  biomassB: number;
  pieces: PieceState[];
  winner?: Winner;
  ended: boolean;
  endReason?: string;
  board: {
    colors: number[];
    owners: number[];
  };
}

export interface GameFrame {
  step: number;
  actionStep: number;
  activePlayer: Player;
  activePieceId: string;
  biomassA: number;
  biomassB: number;
  pieces: PieceState[];
  colors: number[];
  owners: number[];
}

export type DeployAction = {
  type: "deploy";
  pieceId: string;
  x: number;
  y: number;
  dir: Direction;
};

export type ActivateAction = {
  type: "activate";
  pieceId: string;
};

export type GameAction = DeployAction | ActivateAction;

export interface ActionResult {
  game: PublicGameState;
  frames: GameFrame[];
  killedPieceIds: string[];
}

type MovingPiece = {
  x: number;
  y: number;
  dir: Direction;
};

const DEFAULT_WIDTH = 128;
const DEFAULT_HEIGHT = 128;
const DEFAULT_PULSE_STEPS = 16_384;
const DEFAULT_FRAME_EVERY = 512;
const DEFAULT_MAX_TURNS = 64;

export function createGame(rosterA: unknown, rosterB: unknown, options: GameOptions = {}): GameState {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const pulseSteps = options.pulseSteps ?? DEFAULT_PULSE_STEPS;
  const frameEvery = options.frameEvery ?? DEFAULT_FRAME_EVERY;
  const maxTurnsPerPlayer = options.maxTurnsPerPlayer ?? DEFAULT_MAX_TURNS;

  if (width <= 0 || height <= 0) throw new Error("Grid dimensions must be positive");
  if (pulseSteps < 0) throw new Error("Pulse steps cannot be negative");
  if (frameEvery <= 0) throw new Error("Frame interval must be positive");

  const pieces = [
    ...createPlayerPieces(0, parseRoster(rosterA, "rosterA")),
    ...createPlayerPieces(1, parseRoster(rosterB, "rosterB"))
  ];
  const owners = new Int8Array(width * height);
  owners.fill(-1);

  return {
    id: options.id ?? crypto.randomUUID(),
    width,
    height,
    pulseSteps,
    frameEvery,
    maxTurnsPerPlayer,
    activePlayer: 0,
    turnsTaken: [0, 0],
    colors: new Uint8Array(width * height),
    owners,
    pieces,
    ended: false
  };
}

export function applyAction(game: GameState, action: GameAction): ActionResult {
  if (game.ended) {
    throw new Error("Game has already ended");
  }

  const piece = findPiece(game, action.pieceId);
  if (piece.player !== game.activePlayer) {
    throw new Error("Selected piece does not belong to the active player");
  }

  if (action.type === "deploy") {
    deployPiece(game, piece, action);
  } else {
    if (piece.status !== "alive") {
      throw new Error("Only living pieces can activate");
    }
  }

  const burst = runBurst(game, piece);
  game.turnsTaken[game.activePlayer] += 1;
  resolveEndState(game);
  if (!game.ended) {
    game.activePlayer = game.activePlayer === 0 ? 1 : 0;
  }

  return {
    game: serializeGame(game),
    frames: burst.frames,
    killedPieceIds: burst.killedPieceIds
  };
}

export function serializeGame(game: GameState): PublicGameState {
  const [biomassA, biomassB] = countBiomass(game.owners);
  return {
    id: game.id,
    width: game.width,
    height: game.height,
    nColors: ARENA_COLORS,
    pulseSteps: game.pulseSteps,
    activePlayer: game.activePlayer,
    turnsTaken: [...game.turnsTaken] as [number, number],
    biomassA,
    biomassB,
    pieces: clonePieces(game.pieces),
    winner: game.winner,
    ended: game.ended,
    endReason: game.endReason,
    board: {
      colors: Array.from(game.colors),
      owners: Array.from(game.owners)
    }
  };
}

export function countBiomass(owners: Int8Array): [number, number] {
  let biomassA = 0;
  let biomassB = 0;
  for (const owner of owners) {
    if (owner === 0) biomassA += 1;
    if (owner === 1) biomassB += 1;
  }
  return [biomassA, biomassB];
}

function parseRoster(input: unknown, name: string): PieceKey[] {
  if (!Array.isArray(input) || input.length !== 4) {
    throw new Error(`${name} must contain exactly four piece keys`);
  }

  return input.map((value) => {
    if (!isPieceKey(value)) {
      throw new Error(`Invalid piece key "${String(value)}" in ${name}`);
    }
    return value;
  });
}

function createPlayerPieces(player: Player, roster: PieceKey[]): PieceState[] {
  return roster.map((ruleKey, slot) => ({
    id: `${player === 0 ? "A" : "B"}${slot + 1}`,
    player,
    slot,
    ruleKey,
    ruleId: PIECES[ruleKey].ruleId,
    status: "reserve",
    killCount: 0
  }));
}

function findPiece(game: GameState, pieceId: string): PieceState {
  const piece = game.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) {
    throw new Error(`Unknown piece ${pieceId}`);
  }
  return piece;
}

function deployPiece(game: GameState, piece: PieceState, action: DeployAction): void {
  if (piece.status !== "reserve") {
    throw new Error("Only reserve pieces can deploy");
  }
  if (!isDirection(action.dir)) {
    throw new Error("Direction must be 0, 1, 2, or 3");
  }
  if (!Number.isInteger(action.x) || !Number.isInteger(action.y) || action.x < 0 || action.y < 0 || action.x >= game.width || action.y >= game.height) {
    throw new Error("Deployment cell is outside the board");
  }

  const opponent = piece.player === 0 ? 1 : 0;
  const blocked = game.pieces.some((candidate) =>
    candidate.player === opponent &&
    candidate.status === "alive" &&
    candidate.coreX === action.x &&
    candidate.coreY === action.y
  );
  if (blocked) {
    throw new Error("Cannot deploy on a living opponent core");
  }

  piece.status = "alive";
  piece.x = action.x;
  piece.y = action.y;
  piece.coreX = action.x;
  piece.coreY = action.y;
  piece.dir = action.dir;
}

function runBurst(game: GameState, piece: PieceState): { frames: GameFrame[]; killedPieceIds: string[] } {
  assertAliveWithPosition(piece);
  const rule = PARSED_PIECES[piece.ruleKey];
  const moving: MovingPiece = { x: piece.coreX, y: piece.coreY, dir: piece.dir };
  const frames: GameFrame[] = [];
  const killedPieceIds: string[] = [];

  for (let actionStep = 0; actionStep < game.pulseSteps; actionStep += 1) {
    const index = moving.y * game.width + moving.x;
    const color = game.colors[index];

    game.colors[index] = rule.nextColors[color];
    game.owners[index] = piece.player;

    const killedNow = killOpponentCoresAt(game, piece, moving.x, moving.y);
    if (killedNow.length > 0) {
      piece.killCount += killedNow.length;
      killedPieceIds.push(...killedNow);
    }

    moving.dir = normalizeDirection(moving.dir + rule.turns[color]);
    moveForward(moving, game.width, game.height);
    finishPiecePulse(piece, moving);

    if ((actionStep + 1) % game.frameEvery === 0) {
      frames.push(makeFrame(game, piece, actionStep + 1));
    }
  }

  if (frames.length === 0 || frames[frames.length - 1].actionStep !== game.pulseSteps) {
    frames.push(makeFrame(game, piece, game.pulseSteps));
  }

  return { frames, killedPieceIds };
}

function killOpponentCoresAt(game: GameState, activePiece: PieceState, x: number, y: number): string[] {
  const killed: string[] = [];
  for (const piece of game.pieces) {
    if (
      piece.player !== activePiece.player &&
      piece.status === "alive" &&
      piece.coreX === x &&
      piece.coreY === y
    ) {
      piece.status = "dead";
      killed.push(piece.id);
    }
  }
  return killed;
}

function resolveEndState(game: GameState): void {
  const playerAOut = hasNoLivingOrReserve(game, 0);
  const playerBOut = hasNoLivingOrReserve(game, 1);
  if (playerAOut || playerBOut) {
    game.ended = true;
    game.winner = playerAOut && playerBOut ? "draw" : playerAOut ? "B" : "A";
    game.endReason = "elimination";
    return;
  }

  if (game.turnsTaken[0] >= game.maxTurnsPerPlayer && game.turnsTaken[1] >= game.maxTurnsPerPlayer) {
    const [biomassA, biomassB] = countBiomass(game.owners);
    game.ended = true;
    game.winner = biomassA > biomassB ? "A" : biomassB > biomassA ? "B" : "draw";
    game.endReason = "turn limit";
  }
}

function hasNoLivingOrReserve(game: GameState, player: Player): boolean {
  return !game.pieces.some((piece) => piece.player === player && (piece.status === "alive" || piece.status === "reserve"));
}

function makeFrame(game: GameState, activePiece: PieceState, actionStep: number): GameFrame {
  const [biomassA, biomassB] = countBiomass(game.owners);
  return {
    step: game.turnsTaken[0] + game.turnsTaken[1],
    actionStep,
    activePlayer: activePiece.player,
    activePieceId: activePiece.id,
    biomassA,
    biomassB,
    pieces: clonePieces(game.pieces),
    colors: Array.from(game.colors),
    owners: Array.from(game.owners)
  };
}

function finishPiecePulse(piece: PieceState, moving: MovingPiece): void {
  piece.x = moving.x;
  piece.y = moving.y;
  piece.coreX = moving.x;
  piece.coreY = moving.y;
  piece.dir = moving.dir;
}

function moveForward(piece: MovingPiece, width: number, height: number): void {
  if (piece.dir === 0) piece.y = wrap(piece.y - 1, height);
  if (piece.dir === 1) piece.x = wrap(piece.x + 1, width);
  if (piece.dir === 2) piece.y = wrap(piece.y + 1, height);
  if (piece.dir === 3) piece.x = wrap(piece.x - 1, width);
}

function wrap(value: number, limit: number): number {
  if (value < 0) return limit - 1;
  if (value >= limit) return 0;
  return value;
}

function isDirection(value: number): value is Direction {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

function normalizeDirection(value: number): Direction {
  return ((value % 4) + 4) % 4 as Direction;
}

function clonePieces(pieces: PieceState[]): PieceState[] {
  return pieces.map((piece) => ({ ...piece }));
}

function assertAliveWithPosition(piece: PieceState): asserts piece is PieceState & Required<Pick<PieceState, "x" | "y" | "coreX" | "coreY" | "dir">> {
  if (
    piece.status !== "alive" ||
    piece.x === undefined ||
    piece.y === undefined ||
    piece.coreX === undefined ||
    piece.coreY === undefined ||
    piece.dir === undefined
  ) {
    throw new Error("Piece must be alive and positioned");
  }
}
