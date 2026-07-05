/**
 * Canonical SQLite schema — mirrors PLAN.md §4 exactly (locked contracts §3).
 * seed.db is the read-only template; save_<n>.db files are byte-copies of it.
 * index.db (separate file) holds only save-slot metadata.
 *
 * Deviation note: OVR coefficient tables live in @footy/shared (single source
 * of truth per contract §3); they are not duplicated into seed.db.
 */

export const SEED_SCHEMA = `
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
-- rows: schema_version, content_version, seed_build_id, master_seed, created_at

CREATE TABLE nations(
  id INTEGER PRIMARY KEY, code TEXT, name TEXT, name_fictional TEXT,
  confederation TEXT, reputation INTEGER, name_bank_id INTEGER);

CREATE TABLE name_banks(
  id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL);

CREATE TABLE name_bank_entries(
  id INTEGER PRIMARY KEY, bank_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('first','last')), name TEXT NOT NULL);

CREATE TABLE gen_config(key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE leagues(
  id INTEGER PRIMARY KEY, name TEXT, name_fictional TEXT, real_key TEXT, -- 'eng.1'
  nation_id INTEGER, tier INTEGER, reputation INTEGER,      -- 0-100
  num_clubs INTEGER, promotion_slots INTEGER, relegation_slots INTEGER,
  foreign_player_cap INTEGER, tv_pool_base INTEGER, prize_pool_base INTEGER,
  avg_attendance_base INTEGER);

CREATE TABLE clubs(
  id INTEGER PRIMARY KEY, league_id INTEGER, real_key TEXT,
  name TEXT, name_fictional TEXT, short_name TEXT, nation_id INTEGER, city TEXT,
  reputation INTEGER,                       -- 0-100 -> budgets, squad quality, targets
  stadium_name TEXT, stadium_capacity INTEGER,
  color_primary TEXT, color_secondary TEXT, crest_style_seed INTEGER,
  balance INTEGER, budget_transfer INTEGER, budget_wage INTEGER,
  training_facilities INTEGER, youth_facilities INTEGER,   -- 1-20
  is_generated INTEGER DEFAULT 1);

CREATE TABLE players(
  id INTEGER PRIMARY KEY, club_id INTEGER,   -- NULL = free agent
  first_name TEXT, last_name TEXT, known_as TEXT,
  nation_id INTEGER, second_nation_id INTEGER, dob TEXT,
  primary_position TEXT, secondary_positions TEXT,   -- CSV of pos codes
  height_cm INTEGER, weight_kg INTEGER, preferred_foot TEXT,
  ovr INTEGER, potential INTEGER,            -- 0-99 (cached; POT>=OVR)
  value INTEGER, wage INTEGER, reputation INTEGER,
  morale INTEGER, form REAL, fitness INTEGER, squad_status TEXT,
  avatar_seed INTEGER,
  is_generated INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1,
  real_key TEXT, generation_batch INTEGER);  -- batch = season regen id

-- SINGLE canonical ratings table (contract §3.2). All 0-99.
CREATE TABLE player_ratings(
  player_id INTEGER PRIMARY KEY,
  -- physical
  acceleration INTEGER, sprint_speed INTEGER, agility INTEGER, balance INTEGER,
  jumping INTEGER, stamina INTEGER, strength INTEGER, reactions INTEGER,
  -- technical
  finishing INTEGER, shot_power INTEGER, long_shots INTEGER, volleys INTEGER,
  short_passing INTEGER, long_passing INTEGER, crossing INTEGER,
  dribbling INTEGER, ball_control INTEGER, first_touch INTEGER,
  technique INTEGER, fk_accuracy INTEGER, heading INTEGER,
  -- defending
  marking INTEGER, standing_tackle INTEGER, sliding_tackle INTEGER, interceptions INTEGER,
  -- mental (needed by Tactics' role-suitability math)
  positioning INTEGER, vision INTEGER, composure INTEGER, work_rate INTEGER,
  aggression INTEGER, decisions INTEGER, anticipation INTEGER,
  concentration INTEGER, off_the_ball INTEGER, bravery INTEGER,
  -- goalkeeping (fixed set)
  gk_diving INTEGER, gk_handling INTEGER, gk_kicking INTEGER,
  gk_positioning INTEGER, gk_reflexes INTEGER,
  -- hidden / growth
  injury_proneness INTEGER, consistency INTEGER, potential_ability INTEGER);
  -- (potential_ability == players.potential, kept here for engine locality)

CREATE TABLE staff(
  id INTEGER PRIMARY KEY, club_id INTEGER, first_name TEXT, last_name TEXT,
  role TEXT,                                 -- manager|gk_coach|def_coach|mid_coach|att_coach|set_piece|fitness|physio|analyst|scout|youth
  rating_gk INTEGER, rating_def INTEGER, rating_mid INTEGER, rating_att INTEGER,   -- 1-10
  playstyle_ratings TEXT,                    -- JSON: {"gegenpressing":10,"tiki_taka":6,...} 1-10
  wage INTEGER, contract_until TEXT);

CREATE TABLE contracts(
  id INTEGER PRIMARY KEY, player_id INTEGER, club_id INTEGER,
  wage INTEGER, start_date TEXT, end_date TEXT,
  signing_bonus INTEGER, loyalty_bonus INTEGER, appearance_bonus INTEGER, goal_bonus INTEGER,
  release_clause INTEGER, squad_role TEXT);

CREATE TABLE loans(
  id INTEGER PRIMARY KEY, player_id INTEGER, owner_club_id INTEGER, loan_club_id INTEGER,
  wage_split REAL, start_date TEXT, end_date TEXT,
  option_to_buy INTEGER, obligation_to_buy INTEGER, buy_fee INTEGER,
  recall_allowed INTEGER, min_minutes_promise INTEGER);

CREATE TABLE competitions(
  id INTEGER PRIMARY KEY, name TEXT, type TEXT,   -- league|domestic_cup|continental
  scope TEXT, format TEXT, tv_pool INTEGER, prize_schedule TEXT);

CREATE TABLE fixtures(
  id INTEGER PRIMARY KEY, competition_id INTEGER, season INTEGER, round INTEGER,
  match_date TEXT, home_club_id INTEGER, away_club_id INTEGER,
  home_goals INTEGER, away_goals INTEGER, played INTEGER DEFAULT 0,
  is_user_match INTEGER DEFAULT 0);

CREATE TABLE injuries(
  id INTEGER PRIMARY KEY, player_id INTEGER, start_date TEXT, end_date TEXT,
  tier TEXT, type TEXT, days INTEGER);         -- tier: minimal|mild|moderate|severe|career_ending

CREATE TABLE transfers(
  id INTEGER PRIMARY KEY, player_id INTEGER, from_club_id INTEGER, to_club_id INTEGER,
  fee INTEGER, date TEXT, window TEXT);

CREATE TABLE finance_ledger(
  id INTEGER PRIMARY KEY, club_id INTEGER, date TEXT, category TEXT, amount INTEGER, note TEXT);

CREATE TABLE board_state(
  club_id INTEGER PRIMARY KEY, season INTEGER, target TEXT,
  confidence INTEGER, patience INTEGER, expectation_json TEXT);

CREATE INDEX idx_clubs_league ON clubs(league_id);
CREATE INDEX idx_players_club ON players(club_id);
CREATE INDEX idx_players_ovr ON players(ovr);
CREATE INDEX idx_contracts_player ON contracts(player_id);
CREATE INDEX idx_fixtures_comp ON fixtures(competition_id, season, round);
CREATE INDEX idx_fixtures_date ON fixtures(match_date);
CREATE INDEX idx_injuries_player ON injuries(player_id);
CREATE INDEX idx_transfers_player ON transfers(player_id);
CREATE INDEX idx_ledger_club ON finance_ledger(club_id, date);
CREATE INDEX idx_name_bank_entries ON name_bank_entries(bank_id, kind);
`;

/** index.db (separate file): one row per save slot, metadata only (contract §3.4). */
export const INDEX_DB_SCHEMA = `
CREATE TABLE save_index(
  slot INTEGER PRIMARY KEY, save_name TEXT, club_name TEXT, manager_name TEXT,
  in_game_date TEXT, season INTEGER, last_played_at INTEGER,
  app_version TEXT, schema_version INTEGER, content_version TEXT,
  file_bytes INTEGER, avatar_seed INTEGER);
`;

export const SCHEMA_VERSION = 1;
