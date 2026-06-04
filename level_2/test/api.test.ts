import { afterEach, describe, expect, it } from "vitest";
import { createApp, GameStore } from "../src/server.js";

const servers: Array<{ close: () => void }> = [];

afterEach(() => {
  while (servers.length > 0) {
    servers.pop()?.close();
  }
});

describe("level 2 API", () => {
  it("creates a game and resolves a deploy action with frames", async () => {
    const baseUrl = await startTestServer();

    const piecesResponse = await fetch(`${baseUrl}/api/pieces`);
    expect(piecesResponse.ok).toBe(true);
    const piecesBody = await piecesResponse.json() as { pieces: unknown[] };
    expect(piecesBody.pieces).toHaveLength(4);

    const newResponse = await fetch(`${baseUrl}/api/game/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rosterA: ["a", "a", "b", "c"],
        rosterB: ["d", "c", "b", "a"],
        options: { width: 32, height: 32, pulseSteps: 8, frameEvery: 4 }
      })
    });
    expect(newResponse.ok).toBe(true);
    const newBody = await newResponse.json() as { game: { id: string } };

    const actionResponse = await fetch(`${baseUrl}/api/game/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: newBody.game.id,
        action: { type: "deploy", pieceId: "A1", x: 4, y: 4, dir: 1 }
      })
    });
    expect(actionResponse.ok).toBe(true);
    const actionBody = await actionResponse.json() as { game: { activePlayer: number }; frames: unknown[] };
    expect(actionBody.game.activePlayer).toBe(1);
    expect(actionBody.frames.length).toBeGreaterThan(0);
  });

  it("rejects malformed game actions with a stable error", async () => {
    const baseUrl = await startTestServer();
    const gameId = await createGame(baseUrl);

    const actionResponse = await fetch(`${baseUrl}/api/game/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        action: { pieceId: "A1" }
      })
    });

    expect(actionResponse.status).toBe(400);
    const actionBody = await actionResponse.json() as { error: string };
    expect(actionBody.error).toBe("Action type must be deploy or activate");
  });

  it("rejects deploy actions with missing coordinates before engine dispatch", async () => {
    const baseUrl = await startTestServer();
    const gameId = await createGame(baseUrl);

    const actionResponse = await fetch(`${baseUrl}/api/game/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        action: { type: "deploy", pieceId: "A1", dir: 1 }
      })
    });

    expect(actionResponse.status).toBe(400);
    const actionBody = await actionResponse.json() as { error: string };
    expect(actionBody.error).toBe("Deploy action requires integer x and y coordinates");
  });
});

async function createGame(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/game/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rosterA: ["a", "a", "b", "c"],
      rosterB: ["d", "c", "b", "a"],
      options: { width: 32, height: 32, pulseSteps: 8, frameEvery: 4 }
    })
  });
  expect(response.ok).toBe(true);
  const body = await response.json() as { game: { id: string } };
  return body.game.id;
}

async function startTestServer(): Promise<string> {
  const app = createApp(new GameStore());
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start test server");
  }
  return `http://127.0.0.1:${address.port}`;
}
