/**
 * The Data Access Layer — THE only module allowed to touch SQLite (§10).
 * UI reads through Zustand stores hydrated from here; the engine computes
 * off-thread and returns deltas that the DAL commits in batched transactions.
 */

import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

export class Dal {
  private constructor(private readonly db: SQLite.SQLiteDatabase) {}

  /** Open a save database with the locked runtime PRAGMAs (§4). */
  static async open(databaseName: string): Promise<Dal> {
    const db = await SQLite.openDatabaseAsync(databaseName);
    await db.execAsync(
      'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;',
    );
    await runMigrations(db);
    return new Dal(db);
  }

  async getMeta(key: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM meta WHERE key = ?',
      [key],
    );
    return row?.value ?? null;
  }

  /** Raw read for SoA hydration (§10): typed arrays are built from these rows. */
  async all<T>(sql: string, params: SQLite.SQLiteBindParams = []): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, params);
  }

  /** Batched delta commit: one WAL transaction, prepared statements (§2/§11). */
  async commitDeltas(
    statements: ReadonlyArray<{ sql: string; rows: SQLite.SQLiteBindParams[] }>,
  ): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (txn) => {
      for (const statement of statements) {
        const prepared = await txn.prepareAsync(statement.sql);
        try {
          for (const row of statement.rows) {
            await prepared.executeAsync(row);
          }
        } finally {
          await prepared.finalizeAsync();
        }
      }
    });
  }

  async close(): Promise<void> {
    await this.db.closeAsync();
  }
}
