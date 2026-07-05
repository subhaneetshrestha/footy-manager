/**
 * Builds the shippable seed.db (Layer A, §4): CC0-style league/club base +
 * generated license-safe player pool. Deterministic: fixed master seed, fixed
 * insert order, fixed created_at → byte-reproducible output.
 */

import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ALL_ATTRIBUTES, clamp, createRng, deriveSeed } from '@footy/shared';
import { clubStartingBalance, clubTransferBudget } from '@footy/engine';
import { NAME_BANK_KEYS } from '../config/types';
import { WORLD, validateWorldConfig, type WorldConfig } from '../config/index';
import { SCHEMA_VERSION, SEED_SCHEMA } from '../schema';
import { generateSquad, makeNationPicker } from '../generate/players';

export const MASTER_SEED = 0x20260701;
export const CONTENT_VERSION = '0.1.0';
/** Fixed for reproducible builds; the real build date lives in the manifest. */
const CREATED_AT = '2026-07-05T00:00:00Z';

export interface BuildSeedOptions {
  outPath: string;
  /** Also copy the built db here (e.g. the mobile asset path). */
  copyToPath?: string;
  /** Write seed-manifest.json next to outPath. Default true. */
  writeManifest?: boolean;
  world?: WorldConfig;
  log?: (message: string) => void;
}

export interface BuildSeedResult {
  outPath: string;
  sha256: string;
  fileBytes: number;
  counts: {
    nations: number;
    leagues: number;
    clubs: number;
    players: number;
    ratings: number;
    contracts: number;
  };
  leagueStats: { key: string; avg_ovr: number; players: number }[];
}

export function buildSeed(options: BuildSeedOptions): BuildSeedResult {
  const world = options.world ?? WORLD;
  const log = options.log ?? (() => {});
  const outPath = options.outPath;

  const errors = validateWorldConfig(world);
  if (errors.length > 0) {
    throw new Error(`world config invalid (${errors.length} problems):\n  ${errors.join('\n  ')}`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${outPath}${suffix}`, { force: true });

  const db = new Database(outPath);
  db.pragma('page_size = 4096');
  db.pragma('journal_mode = MEMORY');
  db.pragma('foreign_keys = ON');
  db.exec(SEED_SCHEMA);

  const insertMeta = db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)');
  const insertBank = db.prepare('INSERT INTO name_banks(id, key) VALUES (?, ?)');
  const insertBankEntry = db.prepare(
    'INSERT INTO name_bank_entries(id, bank_id, kind, name) VALUES (?, ?, ?, ?)',
  );
  const insertNation = db.prepare(
    'INSERT INTO nations(id, code, name, name_fictional, confederation, reputation, name_bank_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insertLeague = db.prepare(
    `INSERT INTO leagues(id, name, name_fictional, real_key, nation_id, tier, reputation,
      num_clubs, promotion_slots, relegation_slots, foreign_player_cap,
      tv_pool_base, prize_pool_base, avg_attendance_base)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertClub = db.prepare(
    `INSERT INTO clubs(id, league_id, real_key, name, name_fictional, short_name, nation_id, city,
      reputation, stadium_name, stadium_capacity, color_primary, color_secondary, crest_style_seed,
      balance, budget_transfer, budget_wage, training_facilities, youth_facilities, is_generated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  const insertPlayer = db.prepare(
    `INSERT INTO players(id, club_id, first_name, last_name, known_as, nation_id, second_nation_id,
      dob, primary_position, secondary_positions, height_cm, weight_kg, preferred_foot,
      ovr, potential, value, wage, reputation, morale, form, fitness, squad_status,
      avatar_seed, is_generated, is_active, real_key, generation_batch)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NULL, 0)`,
  );
  const ratingCols = [...ALL_ATTRIBUTES, 'potential_ability'];
  const insertRatings = db.prepare(
    `INSERT INTO player_ratings(player_id, ${ratingCols.join(', ')})
     VALUES (?, ${ratingCols.map(() => '?').join(', ')})`,
  );
  const insertContract = db.prepare(
    `INSERT INTO contracts(id, player_id, club_id, wage, start_date, end_date,
      signing_bonus, loyalty_bonus, appearance_bonus, goal_bonus, release_clause, squad_role)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, NULL, ?)`,
  );
  const insertGenConfig = db.prepare('INSERT INTO gen_config(key, value) VALUES (?, ?)');

  const buildAll = db.transaction(() => {
    insertMeta.run('schema_version', String(SCHEMA_VERSION));
    insertMeta.run('content_version', CONTENT_VERSION);
    insertMeta.run('seed_build_id', `phase0-${CONTENT_VERSION}`);
    insertMeta.run('master_seed', String(MASTER_SEED));
    insertMeta.run('created_at', CREATED_AT);

    insertGenConfig.run('master_seed', String(MASTER_SEED));
    insertGenConfig.run('generator_version', '1');
    insertGenConfig.run('season_start', '2026-07-01');

    const bankIdByKey = new Map<string, number>();
    let bankEntryId = 0;
    NAME_BANK_KEYS.forEach((key, index) => {
      const bankId = index + 1;
      bankIdByKey.set(key, bankId);
      insertBank.run(bankId, key);
      const bank = world.nameBanks[key];
      for (const name of bank.firstNames) insertBankEntry.run(++bankEntryId, bankId, 'first', name);
      for (const name of bank.lastNames) insertBankEntry.run(++bankEntryId, bankId, 'last', name);
    });

    const nationIdByCode = new Map<string, number>();
    world.nations.forEach((nation, index) => {
      const nationId = index + 1;
      nationIdByCode.set(nation.code, nationId);
      insertNation.run(
        nationId,
        nation.code,
        nation.name,
        nation.fictionalName,
        nation.confederation,
        nation.reputation,
        bankIdByKey.get(nation.nameBank) ?? null,
      );
    });

    let clubId = 0;
    let playerId = 0;
    let contractId = 0;

    world.leagues.forEach((league, leagueIndex) => {
      const leagueId = leagueIndex + 1;
      const leagueNationId = nationIdByCode.get(league.nation);
      if (leagueNationId === undefined) throw new Error(`unknown nation ${league.nation}`);
      insertLeague.run(
        leagueId,
        league.name,
        league.fictionalName,
        league.key,
        leagueNationId,
        league.tier,
        league.reputation,
        league.clubs.length,
        league.promotionSlots,
        league.relegationSlots,
        league.foreignPlayerCap,
        league.tvPoolBase,
        league.prizePoolBase,
        league.avgAttendanceBase,
      );

      const picker = makeNationPicker(league, world.nations);

      for (const club of league.clubs) {
        clubId += 1;
        const rng = createRng(deriveSeed(MASTER_SEED, clubId));
        const squad = generateSquad({
          league,
          club,
          nations: world.nations,
          nameBanks: world.nameBanks,
          picker,
          rng,
        });

        const weeklyWageBill = squad.reduce((sum, p) => sum + p.wage, 0);
        const budgetTransfer = clubTransferBudget(club.reputation);
        const facilities = clamp(Math.round(club.reputation / 5), 1, 20);

        insertClub.run(
          clubId,
          leagueId,
          `${league.key}:${club.key}`,
          club.name,
          club.fictionalName,
          club.shortName,
          leagueNationId,
          club.city,
          club.reputation,
          club.stadiumName,
          club.stadiumCapacity,
          club.colorPrimary,
          club.colorSecondary,
          rng.fork(0xc0e5).nextUint32(),
          clubStartingBalance(club.reputation),
          budgetTransfer,
          Math.round(weeklyWageBill * 1.15),
          facilities,
          clamp(facilities + rng.nextInt(-2, 1), 1, 20),
        );

        for (const player of squad) {
          playerId += 1;
          const nationId = nationIdByCode.get(player.nationCode);
          if (nationId === undefined) throw new Error(`unknown nation ${player.nationCode}`);
          insertPlayer.run(
            playerId,
            clubId,
            player.firstName,
            player.lastName,
            player.knownAs,
            nationId,
            player.dob,
            player.primaryPosition,
            player.secondaryPositions,
            player.heightCm,
            player.weightKg,
            player.preferredFoot,
            player.ovr,
            player.potential,
            player.value,
            player.wage,
            player.reputation,
            player.morale,
            player.form,
            player.fitness,
            player.squadStatus,
            player.avatarSeed,
          );
          insertRatings.run(
            playerId,
            ...ALL_ATTRIBUTES.map((attr) => player.ratings[attr]),
            player.potential,
          );
          contractId += 1;
          insertContract.run(
            contractId,
            playerId,
            clubId,
            player.wage,
            player.contractStartDate,
            player.contractEndDate,
            player.squadStatus,
          );
        }
      }
    });
  });

  buildAll();

  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`integrity_check failed: ${String(integrity)}`);

  const counts = {
    nations: countOf(db, 'nations'),
    leagues: countOf(db, 'leagues'),
    clubs: countOf(db, 'clubs'),
    players: countOf(db, 'players'),
    ratings: countOf(db, 'player_ratings'),
    contracts: countOf(db, 'contracts'),
  };
  const badPotential = countWhere(db, 'players', 'potential < ovr');
  if (badPotential > 0) throw new Error(`${badPotential} players violate POT >= OVR`);

  const leagueStats = db
    .prepare(
      `SELECT l.real_key AS key, ROUND(AVG(p.ovr), 1) AS avg_ovr, COUNT(p.id) AS players
       FROM leagues l JOIN clubs c ON c.league_id = l.id JOIN players p ON p.club_id = c.id
       GROUP BY l.id ORDER BY avg_ovr DESC`,
    )
    .all() as { key: string; avg_ovr: number; players: number }[];

  db.exec('VACUUM');
  db.close();

  const bytes = readFileSync(outPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  if (options.writeManifest !== false) {
    writeFileSync(
      join(dirname(outPath), 'seed-manifest.json'),
      `${JSON.stringify(
        { contentVersion: CONTENT_VERSION, sha256, fileBytes: bytes.length, counts },
        null,
        2,
      )}\n`,
    );
  }

  if (options.copyToPath) {
    mkdirSync(dirname(options.copyToPath), { recursive: true });
    copyFileSync(outPath, options.copyToPath);
    log(`  copied to ${options.copyToPath}`);
  }

  return { outPath, sha256, fileBytes: bytes.length, counts, leagueStats };
}

function countOf(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

function countWhere(db: Database.Database, table: string, where: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as {
    n: number;
  };
  return row.n;
}
