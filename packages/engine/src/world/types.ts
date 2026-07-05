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

import type { InjuryTier, PlayerRatings, PlayStyle, Position, StaffRole } from '@footy/shared';
import type { FormationKey } from './formations';

/** A player's current injury; healed lazily once returnMatchday is reached. */
export interface ActiveInjury {
  tier: InjuryTier;
  type: string;
  daysTotal: number;
  /** First matchday the player is available again (current season's frame). */
  returnMatchday: number;
}

export interface InjuryRecord {
  playerId: number;
  clubId: number;
  season: number;
  matchday: number;
  tier: InjuryTier;
  type: string;
  days: number;
}

/** An active loan (§8): the player's clubId points at the loan club. */
export interface WorldLoan {
  playerId: number;
  ownerClubId: number;
  loanClubId: number;
  /** Share of wages paid by the loan club, 0..1. */
  wageSplit: number;
  optionToBuyFee: number | null;
  obligationToBuy: boolean;
  recallAllowed: boolean;
  startSeason: number;
}

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
  /** Whole years left on the contract; 0 = expiring/free agent. */
  contractYearsLeft: number;
  form: number;
  fitness: number;
  morale: number;
  injury: ActiveInjury | null;
  /** Set at rollover when the player hangs up their boots; never re-signable. */
  retired?: boolean;
  ratings: PlayerRatings;
}

export interface ClubTactics {
  formation: FormationKey;
  playStyle: PlayStyle;
}

/**
 * Coach/staff member (§8): 1-10 rating per department plus a per-play-style
 * specialization map. clubId 0 = free agent.
 */
export interface WorldStaff {
  id: number;
  clubId: number;
  name: string;
  role: StaffRole;
  ratingGk: number;
  ratingDef: number;
  ratingMid: number;
  ratingAtt: number;
  playstyleRatings: Record<PlayStyle, number>;
  /** Weekly wage, EUR. */
  wage: number;
}

/** One season's income/expense books (§8 deep finances, Phase 6). */
export interface SeasonBooks {
  season: number;
  finalPosition: number;
  revenueGate: number;
  revenueTv: number;
  revenueSponsor: number;
  revenuePrize: number;
  revenueTransfers: number;
  expenseWages: number;
  expenseStaffWages: number;
  expenseTransfers: number;
  expenseOperating: number;
  net: number;
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
  /** Optional Phase-6 economy state (defaults applied by the economy module). */
  stadiumCapacity?: number;
  books?: SeasonBooks;
  ffpStrikes?: number;
  transferEmbargo?: boolean;
  seasonTransferSpend?: number;
  seasonTransferIncome?: number;
  /** Weekly staff wage budget (§8: smaller clubs afford fewer/worse coaches). */
  budgetStaffWage: number;
  /** 1-20 (contract §3.8). */
  trainingFacilities: number;
  youthFacilities: number;
  tactics: ClubTactics;
  playerIds: number[];
  staffIds: number[];
}

export interface WorldLeague {
  id: number;
  key: string;
  name: string;
  nation: string;
  reputation: number;
  relegationSlots: number;
  /** Season TV/prize pools, EUR (Phase-6 economy; defaults when absent). */
  tvPoolBase?: number;
  prizePoolBase?: number;
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

/** Half-now/half-later transfer fee instalment due at a future season. */
export interface DeferredPayment {
  clubId: number;
  amount: number;
  dueSeason: number;
}

/** Previous seller keeps a slice of the NEXT fee (§8 sell-on clauses). */
export interface SellOnClause {
  playerId: number;
  beneficiaryClubId: number;
  pct: number;
}

export interface WorldState {
  /** Master seed; all match/transfer streams derive from it (contract §3.9). */
  seed: number;
  /** The user's managerial reputation (0-100); moves with board verdicts. */
  managerReputation?: number;
  deferredPayments?: DeferredPayment[];
  sellOnClauses?: SellOnClause[];
  /** 2026 means season 2026/27. */
  season: number;
  /** Next matchday to play (1-based). > totalMatchdays ⇒ season finished. */
  currentMatchday: number;
  totalMatchdays: number;
  userClubId: number;
  leagues: WorldLeague[];
  clubs: WorldClub[];
  players: WorldPlayer[];
  staff: WorldStaff[];
  fixtures: Fixture[];
  transfers: TransferRecord[];
  injuries: InjuryRecord[];
  /** Active loans only; cleared/processed at season rollover. */
  loans: WorldLoan[];
}

export function staffById(world: WorldState, id: number): WorldStaff {
  const staff = world.staff[id - 1];
  if (staff === undefined || staff.id !== id) throw new Error(`bad staff id ${id}`);
  return staff;
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
  world.staff.forEach((s, i) => {
    if (s.id !== i + 1) throw new Error(`staff[${i}].id = ${s.id}, expected ${i + 1}`);
  });
}
