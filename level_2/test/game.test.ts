import { describe, expect, it } from "vitest";
import { applyAction, countBiomass, createGame, serializeGame, type Direction, type GameState, type PieceState } from "../src/game.js";

const roster = ["a", "b", "c", "d"];

describe("level 2 game engine", () => {
  it("initializes a clean board with four reserve pieces per player", () => {
    const game = createGame(roster, roster, { width: 8, height: 8, pulseSteps: 1, id: "test" });
    const publicGame = serializeGame(game);

    expect(publicGame.id).toBe("test");
    expect(publicGame.activePlayer).toBe(0);
    expect(publicGame.pieces).toHaveLength(8);
    expect(publicGame.pieces.filter((piece) => piece.player === 0 && piece.status === "reserve")).toHaveLength(4);
    expect(publicGame.pieces.filter((piece) => piece.player === 1 && piece.status === "reserve")).toHaveLength(4);
    expect(publicGame.board.colors.every((color) => color === 0)).toBe(true);
    expect(publicGame.board.owners.every((owner) => owner === -1)).toBe(true);
  });

  it("deploys a reserve piece, writes immediately, and advances the turn", () => {
    const game = createGame(roster, roster, { width: 8, height: 8, pulseSteps: 1, frameEvery: 1 });
    const result = applyAction(game, { type: "deploy", pieceId: "A1", x: 2, y: 3, dir: 1 });

    expect(result.game.activePlayer).toBe(1);
    expect(result.game.turnsTaken).toEqual([1, 0]);
    expect(result.game.pieces.find((piece) => piece.id === "A1")).toMatchObject({ status: "alive" });
    expect(result.game.board.owners[3 * 8 + 2]).toBe(0);
    expect(result.frames).toHaveLength(1);
  });

  it("allows deployment on trails and own cores but rejects living opponent cores", () => {
    const game = createGame(roster, roster, { width: 8, height: 8, pulseSteps: 1 });
    applyAction(game, { type: "deploy", pieceId: "A1", x: 2, y: 2, dir: 1 });
    applyAction(game, { type: "deploy", pieceId: "B1", x: 3, y: 3, dir: 3 });
    applyAction(game, { type: "deploy", pieceId: "A2", x: 2, y: 2, dir: 0 });

    const opponentCore = game.pieces.find((piece) => piece.id === "A2");
    expect(opponentCore?.status).toBe("alive");
    expect(() => applyAction(game, { type: "deploy", pieceId: "B2", x: opponentCore?.coreX ?? 0, y: opponentCore?.coreY ?? 0, dir: 0 })).toThrow("Cannot deploy on a living opponent core");
  });

  it("activates from the frozen core and updates the core to the final burst position", () => {
    const game = createGame(roster, roster, { width: 8, height: 8, pulseSteps: 1, frameEvery: 1 });
    const piece = game.pieces.find((candidate) => candidate.id === "A1") as PieceState;
    makeAlive(piece, 4, 4, 1);
    game.activePlayer = 0;

    const result = applyAction(game, { type: "activate", pieceId: "A1" });
    const updated = result.game.pieces.find((candidate) => candidate.id === "A1");

    expect(result.game.board.owners[4 * 8 + 4]).toBe(0);
    expect(updated?.coreX).toBe(4);
    expect(updated?.coreY).toBe(5);
  });

  it("kills all opponent cores at the written cell and continues the burst", () => {
    const game = createGame(roster, roster, { width: 8, height: 8, pulseSteps: 3, frameEvery: 1 });
    makeAlive(game.pieces.find((piece) => piece.id === "A1") as PieceState, 0, 0, 1);
    makeAlive(game.pieces.find((piece) => piece.id === "B1") as PieceState, 0, 0, 0);
    makeAlive(game.pieces.find((piece) => piece.id === "B2") as PieceState, 0, 0, 2);

    const result = applyAction(game, { type: "activate", pieceId: "A1" });

    expect(result.killedPieceIds.sort()).toEqual(["B1", "B2"]);
    expect(result.frames.at(-1)?.actionStep).toBe(3);
    expect(result.game.pieces.find((piece) => piece.id === "B1")?.status).toBe("dead");
    expect(result.game.pieces.find((piece) => piece.id === "A1")?.killCount).toBe(2);
  });

  it("counts biomass by player, including cells written by dead pieces", () => {
    const game = createGame(roster, roster, { width: 4, height: 4, pulseSteps: 1 });
    game.owners[0] = 0;
    game.owners[1] = 1;
    game.owners[2] = 1;
    const dead = game.pieces.find((piece) => piece.id === "B1") as PieceState;
    dead.status = "dead";

    expect(countBiomass(game.owners)).toEqual([1, 2]);
    expect(serializeGame(game)).toMatchObject({ biomassA: 1, biomassB: 2 });
  });

  it("does not eliminate a player while reserve pieces remain", () => {
    const game = createGame(roster, roster, { width: 8, height: 8, pulseSteps: 1 });
    for (const piece of game.pieces.filter((candidate) => candidate.player === 1)) {
      if (piece.id !== "B4") piece.status = "dead";
    }

    expect(serializeGame(game).ended).toBe(false);
    expect(() => applyAction(game, { type: "deploy", pieceId: "A1", x: 1, y: 1, dir: 0 })).not.toThrow();
  });

  it("ends by elimination when a player has no living pieces and no reserve pieces", () => {
    const game = createGame(roster, roster, { width: 8, height: 8, pulseSteps: 1 });
    for (const piece of game.pieces.filter((candidate) => candidate.player === 1)) {
      piece.status = "dead";
    }

    const result = applyAction(game, { type: "deploy", pieceId: "A1", x: 1, y: 1, dir: 0 });
    expect(result.game.ended).toBe(true);
    expect(result.game.winner).toBe("A");
    expect(result.game.endReason).toBe("elimination");
  });

  it("ends by turn clock and resolves by biomass or draw", () => {
    const game = createGame(roster, roster, { width: 8, height: 8, pulseSteps: 1, maxTurnsPerPlayer: 1 });
    game.owners[0] = 0;
    game.owners[1] = 0;
    game.owners[2] = 1;

    applyAction(game, { type: "deploy", pieceId: "A1", x: 1, y: 1, dir: 0 });
    const result = applyAction(game, { type: "deploy", pieceId: "B1", x: 2, y: 2, dir: 0 });

    expect(result.game.ended).toBe(true);
    expect(result.game.endReason).toBe("turn limit");
    expect(result.game.winner).toBe("A");
  });
});

function makeAlive(piece: PieceState, x: number, y: number, dir: Direction): void {
  piece.status = "alive";
  piece.x = x;
  piece.y = y;
  piece.coreX = x;
  piece.coreY = y;
  piece.dir = dir;
}
