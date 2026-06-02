import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type NColors, getRules } from "./rules.js";
import type { SimulationResult } from "./sim.js";

export interface RuleStats {
  rule_id: string;
  n_colors: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  average_biomass: number;
  elo_rating: number;
}

const DEFAULT_ELO = 1000;
const ELO_K = 24;

type Db = InstanceType<typeof DatabaseSync>;

export function openDb(path = process.env.DB_PATH ?? "data/lifechess.sqlite"): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

export function initDb(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      rule_id TEXT PRIMARY KEY,
      n_colors INTEGER NOT NULL,
      games_played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      average_biomass REAL NOT NULL DEFAULT 0,
      elo_rating REAL NOT NULL DEFAULT 1000
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_a TEXT NOT NULL,
      rule_b TEXT NOT NULL,
      n_colors INTEGER NOT NULL,
      winner TEXT,
      biomass_a INTEGER NOT NULL,
      biomass_b INTEGER NOT NULL,
      core_kill INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function seedRules(db: Db): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO rules (rule_id, n_colors)
    VALUES (?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const nColors of [2, 3, 4] as NColors[]) {
      for (const rule of getRules(nColors)) {
        insert.run(rule, nColors);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

function actualScore(result: SimulationResult, ant: "A" | "B"): number {
  if (result.winner === "draw") return 0.5;
  return result.winner === ant ? 1 : 0;
}

function nextAverage(currentAverage: number, gamesPlayed: number, biomass: number): number {
  return (currentAverage * gamesPlayed + biomass) / (gamesPlayed + 1);
}

export function recordMatch(db: Db, result: SimulationResult): void {
  const getRule = db.prepare("SELECT * FROM rules WHERE rule_id = ?");
  const updateRule = db.prepare(`
    UPDATE rules
    SET games_played = ?,
        wins = ?,
        losses = ?,
        draws = ?,
        average_biomass = ?,
        elo_rating = ?
    WHERE rule_id = ?
  `);
  const insertMatch = db.prepare(`
    INSERT INTO matches (rule_a, rule_b, n_colors, winner, biomass_a, biomass_b, core_kill)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    const a = getRule.get(result.ruleA) as RuleStats | undefined;
    const b = getRule.get(result.ruleB) as RuleStats | undefined;
    if (!a || !b) {
      throw new Error("Both rules must be seeded before recording a match");
    }

    const scoreA = actualScore(result, "A");
    const scoreB = actualScore(result, "B");
    const expectedA = expectedScore(a.elo_rating, b.elo_rating);
    const expectedB = expectedScore(b.elo_rating, a.elo_rating);

    const aWins = result.winner === "A" ? 1 : 0;
    const bWins = result.winner === "B" ? 1 : 0;
    const draw = result.winner === "draw" ? 1 : 0;

    updateRule.run(
      a.games_played + 1,
      a.wins + aWins,
      a.losses + bWins,
      a.draws + draw,
      nextAverage(a.average_biomass, a.games_played, result.biomassA),
      a.elo_rating + ELO_K * (scoreA - expectedA),
      result.ruleA
    );

    updateRule.run(
      b.games_played + 1,
      b.wins + bWins,
      b.losses + aWins,
      b.draws + draw,
      nextAverage(b.average_biomass, b.games_played, result.biomassB),
      b.elo_rating + ELO_K * (scoreB - expectedB),
      result.ruleB
    );

    insertMatch.run(
      result.ruleA,
      result.ruleB,
      result.nColors,
      result.winner === "draw" ? null : result.winner,
      result.biomassA,
      result.biomassB,
      result.coreKill ? 1 : 0
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setupLedger(path?: string): Db {
  const db = openDb(path);
  initDb(db);
  seedRules(db);
  return db;
}
