import express from "express";
import { setupLedger, recordMatch } from "./db.js";
import { getRules, isNColors, type NColors } from "./rules.js";
import { randomMatch, runMixedPoolTournament, runPoolTournament, runSampledTournament } from "./tournament.js";
import { simulateMatch, simulateSoloRule, type SimulationOptions } from "./sim.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const db = setupLedger();

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

function parseNColors(value: unknown): NColors {
  const nColors = Number(value ?? 3);
  if (!isNColors(nColors)) {
    throw new Error("n must be one of 2, 3, or 4");
  }
  return nColors;
}

function publicSimulationOptions(bodyOptions: unknown): SimulationOptions {
  const input = typeof bodyOptions === "object" && bodyOptions !== null ? bodyOptions as Record<string, unknown> : {};
  return {
    width: clampNumber(input.width, 16, 512, 128),
    height: clampNumber(input.height, 16, 512, 128),
    pulseSteps: clampNumber(input.pulseSteps, 1, 16_384, 2048),
    frameEvery: clampNumber(input.frameEvery, 1, 4096, 128),
    includeFrames: input.includeFrames === undefined ? true : Boolean(input.includeFrames)
  };
}

function tournamentSimulationOptions(bodyOptions: unknown): SimulationOptions {
  const input = typeof bodyOptions === "object" && bodyOptions !== null ? bodyOptions as Record<string, unknown> : {};
  return {
    width: clampNumber(input.width, 16, 512, 512),
    height: clampNumber(input.height, 16, 512, 512),
    pulseSteps: clampNumber(input.pulseSteps, 1, 16_384, 16_384),
    includeFrames: false
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

app.get("/api/rules", (request, response) => {
  try {
    const nColors = parseNColors(request.query.n);
    response.json({ nColors, rules: getRules(nColors) });
  } catch (error) {
    sendError(response, error);
  }
});

app.get("/api/random-match", (request, response) => {
  try {
    const nColors = parseNColors(request.query.n);
    const options = publicSimulationOptions({
      width: request.query.width,
      height: request.query.height,
      pulseSteps: request.query.pulseSteps,
      frameEvery: request.query.frameEvery,
      includeFrames: true
    });
    response.json(randomMatch(nColors, options));
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/simulate", (request, response) => {
  try {
    const nColors = parseNColors(request.body.nColors);
    const ruleA = String(request.body.ruleA ?? "");
    const ruleB = String(request.body.ruleB ?? "");
    const options = publicSimulationOptions(request.body.options);
    const result = simulateMatch(ruleA, ruleB, nColors, options);

    if (request.body.record === true) {
      recordMatch(db, result);
    }

    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
});

app.get("/api/solo-shape", (request, response) => {
  try {
    const nColors = parseNColors(request.query.n);
    const rule = String(request.query.rule ?? "");
    const pulses = clampNumber(request.query.pulses, 1, 64, 8);
    const options = publicSimulationOptions({
      width: request.query.width,
      height: request.query.height,
      pulseSteps: request.query.pulseSteps,
      frameEvery: request.query.frameEvery,
      includeFrames: true
    });
    response.json(simulateSoloRule(rule, nColors, options, pulses));
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/tournament/run", (request, response) => {
  try {
    const nColors = parseNColors(request.body.nColors);
    const matches = clampNumber(request.body.matches, 1, 10_000, 10);
    const summary = runSampledTournament({
      nColors,
      matches,
      simulation: tournamentSimulationOptions(request.body.options)
    });
    response.json(summary);
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/tournament/pool", (request, response) => {
  try {
    const nColors = parseNColors(request.body.nColors);
    const poolSize = clampNumber(request.body.poolSize, 2, 64, 16);
    const summary = runPoolTournament({
      nColors,
      poolSize,
      simulation: tournamentSimulationOptions(request.body.options)
    });
    response.json(summary);
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/tournament/mixed-pool", (request, response) => {
  try {
    const poolSize = clampNumber(request.body.poolSize, 3, 256, 128);
    const summary = runMixedPoolTournament({
      poolSize,
      simulation: tournamentSimulationOptions(request.body.options)
    });
    response.json(summary);
  } catch (error) {
    sendError(response, error);
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Level 1 Toroidal Crucible listening on http://0.0.0.0:${port}`);
});
