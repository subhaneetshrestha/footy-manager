/**
 * Migration-runner behavior against a fake SQLiteDatabase: applies pending
 * migrations in order inside transactions, skips applied ones, refuses gaps.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';
import { runMigrations, type Migration } from '../src/db/migrations';

interface FakeDb {
  db: SQLiteDatabase;
  applied: string[];
  version(): number;
}

function fakeDb(initialVersion: number): FakeDb {
  let version = initialVersion;
  const applied: string[] = [];
  const txn = {
    execAsync: async (sql: string) => {
      applied.push(sql);
    },
    runAsync: async (_sql: string, params: string[]) => {
      version = Number(params[0]);
    },
  };
  const db = {
    getFirstAsync: async () => ({ value: String(version) }),
    withExclusiveTransactionAsync: async (cb: (t: typeof txn) => Promise<void>) => {
      await cb(txn);
    },
  } as unknown as SQLiteDatabase;
  return { db, applied, version: () => version };
}

const m2: Migration = { toVersion: 2, sql: 'ALTER TABLE x ADD COLUMN a;' };
const m3: Migration = { toVersion: 3, sql: 'ALTER TABLE x ADD COLUMN b;' };

describe('runMigrations', () => {
  it('applies pending migrations in order and stamps the version', async () => {
    const fake = fakeDb(1);
    const version = await runMigrations(fake.db, [m2, m3]);
    expect(version).toBe(3);
    expect(fake.version()).toBe(3);
    expect(fake.applied).toEqual([m2.sql, m3.sql]);
  });

  it('skips migrations at or below the current version', async () => {
    const fake = fakeDb(2);
    const version = await runMigrations(fake.db, [m2, m3]);
    expect(version).toBe(3);
    expect(fake.applied).toEqual([m3.sql]);
  });

  it('is a no-op when fully migrated', async () => {
    const fake = fakeDb(3);
    const version = await runMigrations(fake.db, [m2, m3]);
    expect(version).toBe(3);
    expect(fake.applied).toEqual([]);
  });

  it('refuses non-contiguous migration chains', async () => {
    const fake = fakeDb(1);
    await expect(runMigrations(fake.db, [m3])).rejects.toThrow(/migration gap/);
    expect(fake.applied).toEqual([]);
  });

  it('returns the current version for an empty migration list (seed ships v1)', async () => {
    const fake = fakeDb(1);
    expect(await runMigrations(fake.db, [])).toBe(1);
  });
});
