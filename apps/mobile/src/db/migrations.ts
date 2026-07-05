/**
 * THE schema-migration runner — single owner (contract §3.4).
 * Saves are stamped with meta.schema_version; opening a save applies every
 * migration above its current version, in order, inside one transaction.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

export interface Migration {
  /** Target schema version after applying. Must be contiguous. */
  toVersion: number;
  sql: string;
}

/** seed.db ships at schema v1; future migrations append here. */
export const MIGRATIONS: Migration[] = [];

export async function currentSchemaVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'schema_version'",
  );
  return row ? Number(row.value) : 0;
}

export async function runMigrations(
  db: SQLiteDatabase,
  migrations: Migration[] = MIGRATIONS,
): Promise<number> {
  let version = await currentSchemaVersion(db);
  for (const migration of migrations) {
    if (migration.toVersion <= version) continue;
    if (migration.toVersion !== version + 1) {
      throw new Error(
        `migration gap: at v${version}, next migration targets v${migration.toVersion}`,
      );
    }
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(migration.sql);
      await txn.runAsync("UPDATE meta SET value = ? WHERE key = 'schema_version'", [
        String(migration.toVersion),
      ]);
    });
    version = migration.toVersion;
  }
  return version;
}
