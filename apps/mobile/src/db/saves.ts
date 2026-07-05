/**
 * Save-slot lifecycle (contract §3.4, §10):
 *   - per-slot save_<n>.db = byte-copy of the shipped seed.db template
 *   - a separate tiny index.db holds ONLY slot metadata (menu reads it alone)
 *   - Continue = open the slot with max(last_played_at)
 * No full-world serialization exists anywhere.
 */

import { SAVE_SLOT_COUNT } from '@footy/shared';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { Dal } from './dal';

export interface SaveSlotMeta {
  slot: number;
  save_name: string;
  club_name: string;
  manager_name: string;
  in_game_date: string;
  season: number;
  last_played_at: number;
  app_version: string;
  schema_version: number;
  content_version: string;
  file_bytes: number;
  avatar_seed: number;
}

const INDEX_DB = 'index.db';

function saveDbName(slot: number): string {
  if (slot < 1 || slot > SAVE_SLOT_COUNT) throw new Error(`slot out of range: ${slot}`);
  return `save_${slot}.db`;
}

function sqliteDir(): string {
  return `${FileSystem.documentDirectory}SQLite`;
}

async function openIndexDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(INDEX_DB);
  await db.execAsync(`CREATE TABLE IF NOT EXISTS save_index(
    slot INTEGER PRIMARY KEY, save_name TEXT, club_name TEXT, manager_name TEXT,
    in_game_date TEXT, season INTEGER, last_played_at INTEGER,
    app_version TEXT, schema_version INTEGER, content_version TEXT,
    file_bytes INTEGER, avatar_seed INTEGER);`);
  return db;
}

export async function listSaves(): Promise<SaveSlotMeta[]> {
  const db = await openIndexDb();
  try {
    return await db.getAllAsync<SaveSlotMeta>(
      'SELECT * FROM save_index ORDER BY last_played_at DESC',
    );
  } finally {
    await db.closeAsync();
  }
}

/** Continue = most recently played slot, straight from index.db (§10). */
export async function mostRecentSave(): Promise<SaveSlotMeta | null> {
  const saves = await listSaves();
  return saves[0] ?? null;
}

/**
 * New Game copy flow (§4): resolve bundled seed.db asset → copy bytes into
 * save_<n>.db → open (runs migrations) → stamp index.db.
 * TODO(phase0): SHA-256 verification of the copied template (expo-crypto).
 */
export async function createSave(slot: number, seedModule: number): Promise<Dal> {
  const asset = Asset.fromModule(seedModule);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('seed.db asset has no local uri');

  await FileSystem.makeDirectoryAsync(sqliteDir(), { intermediates: true });
  const target = `${sqliteDir()}/${saveDbName(slot)}`;
  await FileSystem.copyAsync({ from: asset.localUri, to: target });

  const dal = await Dal.open(saveDbName(slot));
  const info = await FileSystem.getInfoAsync(target);

  const indexDb = await openIndexDb();
  try {
    await indexDb.runAsync(
      `INSERT OR REPLACE INTO save_index(
        slot, save_name, club_name, manager_name, in_game_date, season,
        last_played_at, app_version, schema_version, content_version, file_bytes, avatar_seed)
       VALUES (?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        slot,
        `Save ${slot}`,
        (await dal.getMeta('created_at')) ?? '',
        0,
        Date.now(),
        '0.1.0',
        Number(await dal.getMeta('schema_version')),
        (await dal.getMeta('content_version')) ?? '',
        info.exists ? (info.size ?? 0) : 0,
      ],
    );
  } finally {
    await indexDb.closeAsync();
  }
  return dal;
}

export async function openSave(slot: number): Promise<Dal> {
  return Dal.open(saveDbName(slot));
}

export async function touchSave(slot: number): Promise<void> {
  const db = await openIndexDb();
  try {
    await db.runAsync('UPDATE save_index SET last_played_at = ? WHERE slot = ?', [
      Date.now(),
      slot,
    ]);
  } finally {
    await db.closeAsync();
  }
}
