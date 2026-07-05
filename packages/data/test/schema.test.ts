/**
 * The DDL is a contract: player_ratings columns must equal the locked
 * attribute vocabulary EXACTLY (contract §3.2), and every §4 table/index
 * must exist. Runs against in-memory SQLite.
 */

import Database from 'better-sqlite3';
import { ALL_ATTRIBUTES } from '@footy/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { INDEX_DB_SCHEMA, SEED_SCHEMA } from '../src/schema';

const db = new Database(':memory:');
db.exec(SEED_SCHEMA);
afterAll(() => db.close());

function columnsOf(database: Database.Database, table: string): string[] {
  return (database.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name);
}

describe('seed schema (§4)', () => {
  it('creates every canonical table', () => {
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    const expected = [
      'meta',
      'nations',
      'name_banks',
      'name_bank_entries',
      'gen_config',
      'leagues',
      'clubs',
      'players',
      'player_ratings',
      'staff',
      'contracts',
      'loans',
      'competitions',
      'fixtures',
      'injuries',
      'transfers',
      'finance_ledger',
      'board_state',
    ];
    for (const table of expected) expect(tables, table).toContain(table);
  });

  it('player_ratings columns equal the locked vocabulary exactly, in order (contract §3.2)', () => {
    expect(columnsOf(db, 'player_ratings')).toEqual([
      'player_id',
      ...ALL_ATTRIBUTES,
      'potential_ability',
    ]);
  });

  it('players carries the cached OVR/POT pair and generation bookkeeping', () => {
    const cols = columnsOf(db, 'players');
    for (const col of [
      'ovr',
      'potential',
      'value',
      'wage',
      'squad_status',
      'avatar_seed',
      'is_generated',
      'is_active',
      'real_key',
      'generation_batch',
    ]) {
      expect(cols, col).toContain(col);
    }
  });

  it('creates the hot-path indices', () => {
    const indices = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    for (const idx of [
      'idx_clubs_league',
      'idx_players_club',
      'idx_players_ovr',
      'idx_contracts_player',
      'idx_fixtures_comp',
      'idx_fixtures_date',
      'idx_injuries_player',
      'idx_transfers_player',
      'idx_ledger_club',
      'idx_name_bank_entries',
    ]) {
      expect(indices, idx).toContain(idx);
    }
  });

  it('index.db schema is self-contained metadata only (contract §3.4)', () => {
    const indexDb = new Database(':memory:');
    indexDb.exec(INDEX_DB_SCHEMA);
    expect(columnsOf(indexDb, 'save_index')).toEqual([
      'slot',
      'save_name',
      'club_name',
      'manager_name',
      'in_game_date',
      'season',
      'last_played_at',
      'app_version',
      'schema_version',
      'content_version',
      'file_bytes',
      'avatar_seed',
    ]);
    indexDb.close();
  });
});
