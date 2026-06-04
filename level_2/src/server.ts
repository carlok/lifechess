import express from "express";
import {
  applyAction,
  createGame,
  serializeGame,
  type DeployAction,
  type Direction,
  type GameAction,
  type GameOptions,
  type GameState
} from "./game.js";
import { PIECES } from "./rules.js";

export class GameStore {
  private games = new Map<string, GameState>();

  create(rosterA: unknown, rosterB: unknown, options: GameOptions): GameState {
    const game = createGame(rosterA, rosterB, options);
    this.games.set(game.id, game);
    return game;
  }

  get(id: unknown): GameState {
    const game = this.games.get(String(id ?? ""));
    if (!game) {
      throw new Error("Game not found");
    }
    return game;
  }
}

export function createApp(store = new GameStore()): express.Express {
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use(express.static("public"));

  app.get("/api/pieces", (_request, response) => {
    response.json({ pieces: Object.values(PIECES) });
  });

  app.post("/api/game/new", (request, response) => {
    try {
      const options = publicGameOptions(request.body?.options);
      const game = store.create(request.body?.rosterA, request.body?.rosterB, options);
      response.json({ game: serializeGame(game) });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/game/action", (request, response) => {
    try {
      const game = store.get(request.body?.gameId);
      const result = applyAction(game, parseAction(request.body?.action));
      response.json(result);
    } catch (error) {
      sendError(response, error);
    }
  });

  return app;
}

function publicGameOptions(input: unknown): GameOptions {
  const options = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
  return {
    width: clampNumber(options.width, 32, 512, 128),
    height: clampNumber(options.height, 32, 512, 128),
    pulseSteps: clampNumber(options.pulseSteps, 1, 16_384, 16_384),
    frameEvery: clampNumber(options.frameEvery, 1, 4096, 512),
    maxTurnsPerPlayer: clampNumber(options.maxTurnsPerPlayer, 1, 64, 64)
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseAction(input: unknown): GameAction {
  if (typeof input !== "object" || input === null) {
    throw new Error("Action must be an object");
  }

  const action = input as Record<string, unknown>;
  if (action.type !== "deploy" && action.type !== "activate") {
    throw new Error("Action type must be deploy or activate");
  }
  if (typeof action.pieceId !== "string" || action.pieceId.length === 0) {
    throw new Error("Action must include a pieceId");
  }

  if (action.type === "activate") {
    return { type: "activate", pieceId: action.pieceId };
  }

  const x = action.x;
  const y = action.y;
  const dir = action.dir;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isInteger(x) ||
    !Number.isInteger(y)
  ) {
    throw new Error("Deploy action requires integer x and y coordinates");
  }
  if (typeof dir !== "number" || !Number.isInteger(dir) || dir < 0 || dir > 3) {
    throw new Error("Deploy action direction must be 0, 1, 2, or 3");
  }

  return {
    type: "deploy",
    pieceId: action.pieceId,
    x,
    y,
    dir: dir as Direction
  } satisfies DeployAction;
}

function sendError(response: express.Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  response.status(400).json({ error: message });
}

const port = Number(process.env.PORT ?? 3001);
if (process.env.NODE_ENV !== "test") {
  createApp().listen(port, "0.0.0.0", () => {
    console.log(`Level 2 Native Automata Skirmish listening on http://0.0.0.0:${port}`);
  });
}
