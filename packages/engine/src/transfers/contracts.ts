/**
 * Contract lifecycle (§8 Phase-3 slice): years tick down at rollover; AI
 * clubs renew the players they want and release the rest to free agency;
 * the user renews through renewContract. Wages come from THE Finance-owned
 * weeklyWage.
 */

import { createRng, deriveSeed } from '@footy/shared';
import { weeklyWage } from '../finance/valuation';
import { activeLoanFor } from './loans';
import { clubOf, playerById, type WorldPlayer, type WorldState } from '../world/types';

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

/** Renew a player's contract at their wage demand. Throws if unaffordable. */
export function renewContract(world: WorldState, playerId: number, years: number): void {
  const player = playerById(world, playerId);
  if (player.clubId === 0) throw new Error('free agents must be signed, not renewed');
  const club = clubOf(world, player.clubId);
  const demand = Math.round((weeklyWage(player.ovr, club.reputation) * 1.1) / 50) * 50;
  const billWithoutPlayer = club.playerIds.reduce(
    (sum, id) => sum + (id === playerId ? 0 : playerById(world, id).wage),
    0,
  );
  if (billWithoutPlayer + demand > club.budgetWage) {
    throw new Error('wage budget cannot cover the demand');
  }
  player.wage = demand;
  player.contractYearsLeft = Math.max(1, Math.round(years));
}

function releaseToFreeAgency(world: WorldState, player: WorldPlayer): void {
  const club = clubOf(world, player.clubId);
  club.playerIds = club.playerIds.filter((id) => id !== player.id);
  player.clubId = 0;
  player.contractYearsLeft = 0;
}

/**
 * Rollover pass: contracts tick down one year. AI clubs renew expiring
 * players they want and release the rest. The user's expiring players get
 * one grace season at 0 years — renew them during the season or they walk
 * at the following rollover.
 */
export function processContractsAtRollover(world: WorldState): void {
  const rng = createRng(deriveSeed(world.seed, world.season, 0xc047));
  for (const player of world.players) {
    if (player.clubId === 0) continue;
    if (activeLoanFor(world, player.id) !== undefined) continue; // parent decides after return

    const yearsBefore = player.contractYearsLeft;
    if (yearsBefore === 0) {
      releaseToFreeAgency(world, player); // ran the whole season unrenewed
      continue;
    }
    player.contractYearsLeft = yearsBefore - 1;
    if (player.contractYearsLeft > 0) continue;

    if (player.clubId === world.userClubId) continue; // user's grace season

    const rank = squadRank(world, player);
    const wanted = rank <= 28 && !(player.age >= 33 && rank > 18);
    if (wanted) {
      const club = clubOf(world, player.clubId);
      player.wage = weeklyWage(player.ovr, club.reputation);
      player.contractYearsLeft = 1 + rng.nextInt(0, 3);
    } else {
      releaseToFreeAgency(world, player);
    }
  }
}
