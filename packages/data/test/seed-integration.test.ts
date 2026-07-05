/**
 * Full-pipeline integration test: builds a REAL seed.db (same code path as the
 * CLI) into a scratch file, then interrogates it with SQL for every invariant
 * the Phase-0 gate cares about — referential integrity, scale, distributions,
 * budgets and license-safety fields.
 */

import Database from 'better-sqlite3';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ATTRIBUTES } from '@footy/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSeed, type BuildSeedResult } from '../src/build/buildSeed';

const outPath = join(fileURLToPath(new URL('..', import.meta.url)), 'out', 'test-seed.db');

let result: BuildSeedResult;
let db: Database.Database;

beforeAll(() => {
  result = buildSeed({ outPath, writeManifest: false });
  db = new Database(outPath, { readonly: true });
}, 300_000);

afterAll(() => {
  db?.close();
  rmSync(outPath, { force: true });
});

function one<T>(sql: string): T {
  return db.prepare(sql).get() as T;
}

function count(sql: string): number {
  return one<{ n: number }>(sql).n;
}

describe('seed.db integration (Phase-0 gate)', () => {
  it('hits the world-scale targets (~30 leagues / ~520 clubs / 15-18k players)', () => {
    expect(result.counts.leagues).toBeGreaterThanOrEqual(28);
    expect(result.counts.clubs).toBeGreaterThanOrEqual(480);
    expect(result.counts.players).toBeGreaterThanOrEqual(14_000);
    expect(result.counts.players).toBeLessThanOrEqual(19_000);
    expect(result.counts.ratings).toBe(result.counts.players);
    expect(result.counts.contracts).toBe(result.counts.players);
    expect(result.fileBytes).toBeGreaterThan(1_000_000);
    expect(result.fileBytes).toBeLessThan(15_000_000);
  });

  it('has zero referential orphans anywhere', () => {
    expect(
      count('SELECT COUNT(*) n FROM players p LEFT JOIN clubs c ON c.id = p.club_id WHERE p.club_id IS NOT NULL AND c.id IS NULL'),
    ).toBe(0);
    expect(
      count('SELECT COUNT(*) n FROM player_ratings r LEFT JOIN players p ON p.id = r.player_id WHERE p.id IS NULL'),
    ).toBe(0);
    expect(
      count('SELECT COUNT(*) n FROM players p LEFT JOIN player_ratings r ON r.player_id = p.id WHERE r.player_id IS NULL'),
    ).toBe(0);
    expect(
      count('SELECT COUNT(*) n FROM contracts k LEFT JOIN players p ON p.id = k.player_id WHERE p.id IS NULL'),
    ).toBe(0);
    expect(
      count('SELECT COUNT(*) n FROM clubs c LEFT JOIN leagues l ON l.id = c.league_id WHERE l.id IS NULL'),
    ).toBe(0);
    expect(
      count('SELECT COUNT(*) n FROM players p LEFT JOIN nations x ON x.id = p.nation_id WHERE x.id IS NULL'),
    ).toBe(0);
    expect(
      count('SELECT COUNT(*) n FROM nations x LEFT JOIN name_banks b ON b.id = x.name_bank_id WHERE b.id IS NULL'),
    ).toBe(0);
  });

  it('meta carries the versioning contract rows', () => {
    const meta = new Map(
      (db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map(
        (r) => [r.key, r.value],
      ),
    );
    for (const key of [
      'schema_version',
      'content_version',
      'seed_build_id',
      'master_seed',
      'created_at',
    ]) {
      expect(meta.get(key), key).toBeTruthy();
    }
    expect(meta.get('schema_version')).toBe('1');
  });

  it('uses the locked page size (§4 PRAGMAs)', () => {
    expect(db.pragma('page_size', { simple: true })).toBe(4096);
  });

  it('every rating column is within 0-99 and POT >= OVR everywhere', () => {
    expect(count('SELECT COUNT(*) n FROM players WHERE potential < ovr')).toBe(0);
    expect(count('SELECT COUNT(*) n FROM players WHERE ovr < 0 OR ovr > 99 OR potential > 99')).toBe(0);
    for (const attr of ALL_ATTRIBUTES) {
      const row = one<{ lo: number; hi: number }>(
        `SELECT MIN(${attr}) lo, MAX(${attr}) hi FROM player_ratings`,
      );
      expect(row.lo, attr).toBeGreaterThanOrEqual(0);
      expect(row.hi, attr).toBeLessThanOrEqual(99);
    }
    expect(
      count('SELECT COUNT(*) n FROM player_ratings r JOIN players p ON p.id = r.player_id WHERE r.potential_ability != p.potential'),
    ).toBe(0);
  });

  it('league quality follows reputation (tier ordering)', () => {
    const stats = result.leagueStats;
    const top5 = stats.slice(0, 5).reduce((s, r) => s + r.avg_ovr, 0) / 5;
    const bottom5 = stats.slice(-5).reduce((s, r) => s + r.avg_ovr, 0) / 5;
    expect(top5 - bottom5).toBeGreaterThan(8);
    const overall = one<{ avg: number }>('SELECT AVG(ovr) avg FROM players').avg;
    expect(overall).toBeGreaterThan(50);
    expect(overall).toBeLessThan(68);
  });

  it('market values and wages are economically plausible', () => {
    const value = one<{ lo: number; hi: number }>('SELECT MIN(value) lo, MAX(value) hi FROM players');
    expect(value.lo).toBeGreaterThan(0);
    expect(value.hi).toBeLessThan(400_000_000);
    const median = one<{ v: number }>(
      'SELECT value v FROM players ORDER BY value LIMIT 1 OFFSET (SELECT COUNT(*) FROM players) / 2',
    ).v;
    expect(median).toBeGreaterThan(30_000);
    expect(median).toBeLessThan(5_000_000);
    expect(count('SELECT COUNT(*) n FROM players WHERE wage < 300')).toBe(0);
  });

  it('club finances are coherent (wage budget covers the wage bill)', () => {
    expect(
      count(`SELECT COUNT(*) n FROM clubs c WHERE c.budget_wage <
             (SELECT COALESCE(SUM(p.wage), 0) FROM players p WHERE p.club_id = c.id)`),
    ).toBe(0);
    expect(count('SELECT COUNT(*) n FROM clubs WHERE budget_transfer <= 0 OR balance <= 0')).toBe(0);
    expect(
      count('SELECT COUNT(*) n FROM clubs WHERE training_facilities < 1 OR training_facilities > 20 OR youth_facilities < 1 OR youth_facilities > 20'),
    ).toBe(0);
  });

  it('every club fields a legal, structured squad', () => {
    expect(
      count(`SELECT COUNT(*) n FROM (
        SELECT club_id, COUNT(*) size FROM players GROUP BY club_id
        HAVING size < 28 OR size > 32)`),
    ).toBe(0);
    expect(
      count(`SELECT COUNT(*) n FROM (
        SELECT club_id FROM players WHERE primary_position = 'GK'
        GROUP BY club_id HAVING COUNT(*) < 3)`),
    ).toBe(0);
    expect(
      count(`SELECT COUNT(*) n FROM (
        SELECT club_id FROM players WHERE squad_status = 'star'
        GROUP BY club_id HAVING COUNT(*) != 3)`),
    ).toBe(0);
  });

  it('license-safety fields are populated (fictional identities, generated flags)', () => {
    expect(
      count("SELECT COUNT(*) n FROM clubs WHERE name_fictional IS NULL OR name_fictional = '' OR name_fictional = name"),
    ).toBe(0);
    expect(
      count("SELECT COUNT(*) n FROM leagues WHERE name_fictional IS NULL OR name_fictional = ''"),
    ).toBe(0);
    expect(count('SELECT COUNT(*) n FROM players WHERE is_generated != 1')).toBe(0);
    expect(
      count("SELECT COUNT(*) n FROM players WHERE first_name = '' OR last_name = ''"),
    ).toBe(0);
  });

  it('name banks shipped complete for runtime regen use', () => {
    expect(count('SELECT COUNT(*) n FROM name_banks')).toBe(34);
    expect(
      count(`SELECT COUNT(*) n FROM (
        SELECT bank_id FROM name_bank_entries WHERE kind = 'first'
        GROUP BY bank_id HAVING COUNT(*) < 30)`),
    ).toBe(0);
    expect(
      count(`SELECT COUNT(*) n FROM (
        SELECT bank_id FROM name_bank_entries WHERE kind = 'last'
        GROUP BY bank_id HAVING COUNT(*) < 40)`),
    ).toBe(0);
  });

  it('contract dates are coherent with the season-0 world', () => {
    expect(count("SELECT COUNT(*) n FROM contracts WHERE end_date <= start_date")).toBe(0);
    expect(count("SELECT COUNT(*) n FROM contracts WHERE start_date != '2026-07-01'")).toBe(0);
    expect(
      count("SELECT COUNT(*) n FROM contracts WHERE end_date < '2027-06-30' OR end_date > '2030-06-30'"),
    ).toBe(0);
  });
});
