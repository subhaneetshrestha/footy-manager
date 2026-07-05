/**
 * In-memory world model the engine simulates over. Hydrated either from a
 * save DB via the app DAL (device) or from bundled config + generator (web
 * preview / tests) — the engine never touches storage itself.
 *
 * INVARIANT (enforced by hydrators, relied on everywhere): entity arrays are
 * 1-based-contiguous — players[i].id === i + 1, same for clubs, leagues and
 * fixtures. Lookups are plain array indexing; no Maps (contract §3.9: no
 * unordered iteration in the engine).
 */

import type { PlayerRatings, PlayStyle, Position } from '@footy/shared';
import type { FormationKey } from './formations';

export interface WorldPlayer {
  id: number;
  clubId: number;
  name: string;
  age: number;
  position: Position;
  secondaryPositions: Position[];
  ovr: number;
  potential: number;
  value: number;
  wage: number;
  form: number;
  fitness: number;
  morale: number;
  ratings: PlayerRatings;
}

export interface ClubTactics {
  formation: FormationKey;
  playStyle: PlayStyle;
}

export interface WorldClub {
  id: number;
  leagueId: number;
  name: string;
  shortName: string;
  reputation: number;
  colorPrimary: string;
  colorSecondary: string;
  balance: number;
  budgetTransfer: number;
  budgetWage: number;
  tactics: ClubTactics;
  playerIds: number[];
}

export interface WorldLeague {
  id: number;
  key: string;
  name: string;
  nation: string;
  reputation: number;
  relegationSlots: number;
  clubIds: number[];
}

export interface Fixture {
  id: number;
  leagueId: number;
  /** 1-based matchday. */
  matchday: number;
  homeClubId: number;
  awayClubId: number;
  played: boolean;
  homeGoals: number;
  awayGoals: number;
}

export interface TransferRecord {
  playerId: number;
  fromClubId: number;
  toClubId: number;
  fee: number;
  season: number;
  matchday: number;
}

export interface WorldState {
  /** Master seed; all match/transfer streams derive from it (contract §3.9). */
  seed: number;
  /** 2026 means season 2026/27. */
  season: number;
  /** Next matchday to play (1-based). > totalMatchdays ⇒ season finished. */
  currentMatchday: number;
  totalMatchdays: number;
  userClubId: number;
  leagues: WorldLeague[];
  clubs: WorldClub[];
  players: WorldPlayer[];
  fixtures: Fixture[];
  transfers: TransferRecord[];
}

export function playerById(world: WorldState, id: number): WorldPlayer {
  const player = world.players[id - 1];
  if (player === undefined || player.id !== id) throw new Error(`bad player id ${id}`);
  return player;
}

export function clubOf(world: WorldState, id: number): WorldClub {
  const club = world.clubs[id - 1];
  if (club === undefined || club.id !== id) throw new Error(`bad club id ${id}`);
  return club;
}

export function leagueOf(world: WorldState, id: number): WorldLeague {
  const league = world.leagues[id - 1];
  if (league === undefined || league.id !== id) throw new Error(`bad league id ${id}`);
  return league;
}

/** Validates the 1-based-contiguous invariant after hydration. */
export function assertWorldInvariants(world: WorldState): void {
  world.players.forEach((p, i) => {
    if (p.id !== i + 1) throw new Error(`players[${i}].id = ${p.id}, expected ${i + 1}`);
  });
  world.clubs.forEach((c, i) => {
    if (c.id !== i + 1) throw new Error(`clubs[${i}].id = ${c.id}, expected ${i + 1}`);
  });
  world.leagues.forEach((l, i) => {
    if (l.id !== i + 1) throw new Error(`leagues[${i}].id = ${l.id}, expected ${i + 1}`);
  });
  world.fixtures.forEach((f, i) => {
    if (f.id !== i + 1) throw new Error(`fixtures[${i}].id = ${f.id}, expected ${i + 1}`);
  });
}
