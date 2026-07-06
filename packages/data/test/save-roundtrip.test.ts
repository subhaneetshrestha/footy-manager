/**
 * Save-system gate (contract §3.4): a career persisted to a real SQLite save
 * DB (seed schema + migration v2) and loaded back must be BEHAVIORALLY
 * IDENTICAL — continuing a loaded save produces byte-identical seasons vs
 * never having saved. Runs the exact SQL the device DAL will run.
 */

import Database from 'better-sqlite3';
import {
  leagueTable,
  playerById,
  executeTransfer,
  executeLoan,
  playMatchday,
  rolloverSeason,
  simulateRestOfSeason,
  transferMarket,
  type WorldState,
} from '@footy/engine';
import { afterAll, describe, expect, it } from 'vitest';
import { SEED_SCHEMA } from '../src/schema';
import { SCHEMA_V2_SQL } from '../src/save/schemaV2';
import {
  SAVE_TABLE_QUERIES,
  worldFromTables,
  worldToStatements,
  type SaveTables,
} from '../src/save/serialize';
import { buildWorldForLeague } from '../src/world/buildWorld';
import { makeYouthIntakeGenerator } from '../src/generate/youth';

const db = new Database(':memory:');
db.exec(SEED_SCHEMA);
db.exec(SCHEMA_V2_SQL);
afterAll(() => db.close());

function saveWorld(world: WorldState): void {
  const run = db.transaction(() => {
    for (const statement of worldToStatements(world)) {
      const prepared = db.prepare(statement.sql);
      for (const row of statement.rows) prepared.run(...row);
    }
  });
  run();
}

function loadWorld(): WorldState {
  const tables = {} as SaveTables;
  for (const [table, sql] of Object.entries(SAVE_TABLE_QUERIES)) {
    tables[table as keyof SaveTables] = db.prepare(sql).all() as Record<string, unknown>[];
  }
  return worldFromTables(tables);
}

function makeLivedInWorld(): WorldState {
  const world = buildWorldForLeague({ leagueKey: 'eng.1', userClubKey: 'arsenal' });
  // Exercise every persisted collection: matches/injuries, a user transfer, a loan.
  playMatchday(world);
  playMatchday(world);
  const target = transferMarket(world, world.userClubId).find(
    (p) => p.value <= world.clubs[world.userClubId - 1]!.budgetTransfer,
  )!;
  executeTransfer(world, target.id, world.userClubId, world.currentMatchday);
  const kid = world.clubs[world.userClubId - 1]!.playerIds
    .map((id) => playerById(world, id))
    .find((p) => p.age <= 21)!;
  executeLoan(world, kid.id, world.userClubId === 1 ? 2 : 1, {
    wageSplit: 0.5,
    optionToBuyFee: kid.value,
    obligationToBuy: false,
    recallAllowed: true,
  });
  playMatchday(world);
  return world;
}

describe('save round-trip (contract §3.4)', () => {
  it('persist → load is idempotent (identical row emission)', () => {
    const original = makeLivedInWorld();
    saveWorld(original);
    const loaded = loadWorld();
    expect(worldToStatements(loaded)).toEqual(worldToStatements(original));
    expect(loaded.players.length).toBe(original.players.length);
    expect(loaded.loans).toEqual(original.loans);
    expect(loaded.injuries).toEqual(original.injuries);
    expect(loaded.transfers).toEqual(original.transfers);
    expect(loaded.currentMatchday).toBe(original.currentMatchday);
  });

  it('continuing a loaded save is byte-identical to never saving', () => {
    const original = makeLivedInWorld();
    saveWorld(original);
    const loaded = loadWorld();

    simulateRestOfSeason(original);
    simulateRestOfSeason(loaded);
    expect(leagueTable(loaded, 1)).toEqual(leagueTable(original, 1));
    expect(loaded.injuries).toEqual(original.injuries);
    expect(loaded.transfers).toEqual(original.transfers);

    // Across a rollover too (retirements, intakes, books, contracts).
    const intake = makeYouthIntakeGenerator();
    const summaryA = rolloverSeason(original, { youthIntake: intake });
    const summaryB = rolloverSeason(loaded, { youthIntake: intake });
    expect(summaryB).toEqual(summaryA);
    playMatchday(original);
    playMatchday(loaded);
    expect(loaded.fixtures.filter((f) => f.played)).toEqual(
      original.fixtures.filter((f) => f.played),
    );
  });

  it('a season-end world (books, verdicts, retirees) survives the trip', () => {
    const world = buildWorldForLeague({ leagueKey: 'eng.1', userClubKey: 'arsenal' });
    simulateRestOfSeason(world);
    rolloverSeason(world, { youthIntake: makeYouthIntakeGenerator() });
    saveWorld(world);
    const loaded = loadWorld();
    expect(worldToStatements(loaded)).toEqual(worldToStatements(world));
    expect(loaded.clubs[0]!.books).toBeDefined();
    expect(loaded.players.some((p) => p.retired === true)).toBe(
      world.players.some((p) => p.retired === true),
    );
  });
});
