/**
 * Basic transfer market (Phase-1 MVP slice of §8): AI clubs strengthen their
 * weakest XI slot within budget during open windows; the user buys/sells via
 * the same executeTransfer path. Fees come from THE valuation function via
 * player.value (single owner, contract §3.3).
 */

import { createRng, deriveSeed, type Rng } from '@footy/shared';
import { positionFit, selectBestXi } from '../squad/strength';
import {
  clubOf,
  playerById,
  type TransferRecord,
  type WorldClub,
  type WorldPlayer,
  type WorldState,
} from '../world/types';

const MAX_SQUAD_SIZE = 34;
const MIN_SQUAD_SIZE = 24;
/** Sellers only part with players outside their strongest N. */
const PROTECTED_RANK = 13;

/** Rank of a player within their club by OVR (1 = best). Deterministic. */
function squadRank(world: WorldState, player: WorldPlayer): number {
  const club = clubOf(world, player.clubId);
  let rank = 1;
  for (const id of club.playerIds) {
    const other = playerById(world, id);
    if (other.id === player.id) continue;
    if (other.ovr > player.ovr || (other.ovr === player.ovr && other.id < player.id)) rank++;
  }
  return rank;
}

/** Can this player be prised away (seller-side willingness only)? */
export function isListable(world: WorldState, player: WorldPlayer): boolean {
  const club = clubOf(world, player.clubId);
  if (club.playerIds.length <= MIN_SQUAD_SIZE) return false;
  return squadRank(world, player) > PROTECTED_RANK;
}

/** Players another club could try to sign (world-visible market, MVP: all leagues loaded). */
export function transferMarket(world: WorldState, buyingClubId: number): WorldPlayer[] {
  return world.players.filter(
    (player) => player.clubId !== buyingClubId && isListable(world, player),
  );
}

/**
 * Execute a transfer at the player's market value. Validates budget and squad
 * sizes; the caller is responsible for window state.
 */
export function executeTransfer(
  world: WorldState,
  playerId: number,
  buyingClubId: number,
  matchday: number,
): TransferRecord {
  const player = playerById(world, playerId);
  const buyer = clubOf(world, buyingClubId);
  const seller = clubOf(world, player.clubId);
  const fee = player.value;

  if (buyer.id === seller.id) throw new Error('cannot buy own player');
  if (buyer.budgetTransfer < fee) throw new Error('insufficient transfer budget');
  if (buyer.playerIds.length >= MAX_SQUAD_SIZE) throw new Error('buying squad full');
  if (seller.playerIds.length <= MIN_SQUAD_SIZE) throw new Error('selling squad too small');

  seller.playerIds = seller.playerIds.filter((id) => id !== playerId);
  buyer.playerIds.push(playerId);
  player.clubId = buyer.id;

  buyer.budgetTransfer -= fee;
  buyer.balance -= fee;
  seller.balance += fee;
  seller.budgetTransfer += Math.round(fee * 0.5); // part of the fee is reinvestable

  const record: TransferRecord = {
    playerId,
    fromClubId: seller.id,
    toClubId: buyer.id,
    fee,
    season: world.season,
    matchday,
  };
  world.transfers.push(record);
  return record;
}

function attemptAiSigning(
  world: WorldState,
  club: WorldClub,
  matchday: number,
  rng: Rng,
): TransferRecord | null {
  if (club.playerIds.length >= MAX_SQUAD_SIZE) return null;

  const squad = club.playerIds.map((id) => playerById(world, id));
  const xi = selectBestXi(squad, club.tactics.formation);
  let weakest = xi.slots[0];
  for (const slot of xi.slots) {
    if (weakest === undefined || slot.effectiveOvr < weakest.effectiveOvr) weakest = slot;
  }
  if (weakest === undefined) return null;

  let best: WorldPlayer | null = null;
  let bestGain = 2; // require a real upgrade
  for (const candidate of transferMarket(world, club.id)) {
    if (candidate.value > club.budgetTransfer) continue;
    if (candidate.age > 31) continue;
    const fit = positionFit(candidate, weakest.slot);
    if (fit < 0.9) continue;
    const gain = candidate.ovr * fit - weakest.effectiveOvr;
    if (gain > bestGain || (gain === bestGain && best !== null && candidate.id < best.id)) {
      best = candidate;
      bestGain = gain;
    }
  }
  if (best === null) return null;
  if (rng.nextFloat() < 0.4) return null; // negotiations fall through sometimes
  return executeTransfer(world, best.id, club.id, matchday);
}

/** One window tick: a fraction of AI clubs try to strengthen. Deterministic. */
export function runAiTransferWindowTick(world: WorldState, matchday: number): TransferRecord[] {
  const done: TransferRecord[] = [];
  for (const club of world.clubs) {
    if (club.id === world.userClubId) continue;
    const rng = createRng(deriveSeed(world.seed, world.season, matchday, 0x7a5f, club.id));
    if (rng.nextFloat() > 0.25) continue;
    const record = attemptAiSigning(world, club, matchday, rng);
    if (record !== null) done.push(record);
  }
  return done;
}
