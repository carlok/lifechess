import express from "express";
import { applyAction, createGame, serializeGame, type GameAction, type GameOptions, type GameState } from "./game.js";
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
      const result = applyAction(game, request.body?.action as GameAction);
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
