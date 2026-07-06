/**
 * Schema migration v1 → v2: columns/tables the live WorldState needs that the
 * seed template didn't carry (tactics, economy state, exact age, deferred
 * payments, sell-on clauses, world_state kv). Shared by the mobile migration
 * runner and the Node round-trip tests so both apply IDENTICAL DDL.
 */

export const SCHEMA_V2_SQL = `
CREATE TABLE world_state(key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE deferred_payments(
  id INTEGER PRIMARY KEY, club_id INTEGER NOT NULL,
  amount INTEGER NOT NULL, due_season INTEGER NOT NULL);

CREATE TABLE sell_on_clauses(
  player_id INTEGER PRIMARY KEY, beneficiary_club_id INTEGER NOT NULL,
  pct REAL NOT NULL);

ALTER TABLE leagues ADD COLUMN nation_code TEXT;
ALTER TABLE clubs ADD COLUMN budget_staff_wage INTEGER DEFAULT 0;
ALTER TABLE clubs ADD COLUMN formation TEXT DEFAULT '4-4-2';
ALTER TABLE clubs ADD COLUMN play_style TEXT DEFAULT 'balanced';
ALTER TABLE clubs ADD COLUMN ffp_strikes INTEGER DEFAULT 0;
ALTER TABLE clubs ADD COLUMN transfer_embargo INTEGER DEFAULT 0;
ALTER TABLE clubs ADD COLUMN season_spend INTEGER DEFAULT 0;
ALTER TABLE clubs ADD COLUMN season_income INTEGER DEFAULT 0;
ALTER TABLE clubs ADD COLUMN books_json TEXT;
ALTER TABLE clubs ADD COLUMN squad_order_json TEXT;
ALTER TABLE clubs ADD COLUMN staff_order_json TEXT;
ALTER TABLE players ADD COLUMN age INTEGER DEFAULT 20;
ALTER TABLE players ADD COLUMN contract_years INTEGER DEFAULT 2;
ALTER TABLE players ADD COLUMN retired INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN injury_json TEXT;
ALTER TABLE fixtures ADD COLUMN matchday INTEGER DEFAULT 0;
ALTER TABLE transfers ADD COLUMN season INTEGER DEFAULT 0;
ALTER TABLE transfers ADD COLUMN matchday INTEGER DEFAULT 0;
ALTER TABLE injuries ADD COLUMN season INTEGER DEFAULT 0;
ALTER TABLE injuries ADD COLUMN matchday INTEGER DEFAULT 0;
ALTER TABLE injuries ADD COLUMN club_id INTEGER DEFAULT 0;
ALTER TABLE loans ADD COLUMN start_season INTEGER DEFAULT 0;
`;

export const SCHEMA_VERSION_V2 = 2;
