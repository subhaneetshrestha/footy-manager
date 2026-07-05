/**
 * Loan market (§8): wage-contribution split, option/obligation to buy,
 * recall clause. The player's clubId points at the loan club while active;
 * loans resolve (buy or return) at season rollover.
 */

import { createRng, deriveSeed, type Rng } from '@footy/shared';
import { positionFit, selectBestXi } from '../squad/strength';
import { availableSquad } from '../injury/injuries';
import {
  clubOf,
  playerById,
  type WorldLoan,
  type WorldPlayer,
  type WorldState,
} from '../world/types';

export interface LoanTerms {
  wageSplit: number;
  optionToBuyFee: number | null;
  obligationToBuy: boolean;
  recallAllowed: boolean;
}

export const STANDARD_LOAN_TERMS: LoanTerms = {
  wageSplit: 0.5,
  optionToBuyFee: null,
  obligationToBuy: false,
  recallAllowed: true,
};

export function activeLoanFor(world: WorldState, playerId: number): WorldLoan | undefined {
  return world.loans.find((l) => l.playerId === playerId);
}

/** Rank of a player within their club by OVR (1 = best). */
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

/** Young fringe players an owner would loan out for development. */
export function loanCandidatesFrom(world: WorldState, ownerClubId: number): WorldPlayer[] {
  const club = clubOf(world, ownerClubId);
  if (club.playerIds.length <= 25) return [];
  return club.playerIds
    .map((id) => playerById(world, id))
    .filter(
      (p) =>
        p.age <= 22 &&
        p.potential - p.ovr >= 8 &&
        p.injury === null &&
        activeLoanFor(world, p.id) === undefined &&
        squadRank(world, p) > 14,
    );
}

export function executeLoan(
  world: WorldState,
  playerId: number,
  loanClubId: number,
  terms: LoanTerms = STANDARD_LOAN_TERMS,
): WorldLoan {
  const player = playerById(world, playerId);
  const owner = clubOf(world, player.clubId);
  const loanClub = clubOf(world, loanClubId);

  if (owner.id === loanClub.id) throw new Error('cannot loan to the owning club');
  if (activeLoanFor(world, playerId) !== undefined) throw new Error('player already on loan');
  if (loanClub.playerIds.length >= 34) throw new Error('loan club squad full');
  if (owner.playerIds.length <= 24) throw new Error('owner squad too small to loan out');

  owner.playerIds = owner.playerIds.filter((id) => id !== playerId);
  loanClub.playerIds.push(playerId);
  player.clubId = loanClub.id;

  const loan: WorldLoan = {
    playerId,
    ownerClubId: owner.id,
    loanClubId: loanClub.id,
    wageSplit: terms.wageSplit,
    optionToBuyFee: terms.optionToBuyFee,
    obligationToBuy: terms.obligationToBuy,
    recallAllowed: terms.recallAllowed,
    startSeason: world.season,
  };
  world.loans.push(loan);
  return loan;
}

function endLoan(world: WorldState, loan: WorldLoan, keepAtLoanClub: boolean): void {
  const player = playerById(world, loan.playerId);
  if (!keepAtLoanClub) {
    const loanClub = clubOf(world, loan.loanClubId);
    const owner = clubOf(world, loan.ownerClubId);
    loanClub.playerIds = loanClub.playerIds.filter((id) => id !== loan.playerId);
    owner.playerIds.push(loan.playerId);
    player.clubId = owner.id;
  }
  world.loans = world.loans.filter((l) => l !== loan);
}

export function recallLoan(world: WorldState, playerId: number): void {
  const loan = activeLoanFor(world, playerId);
  if (loan === undefined) throw new Error('no active loan for player');
  if (!loan.recallAllowed) throw new Error('the loan has no recall clause');
  endLoan(world, loan, false);
}

/**
 * Resolve every loan at season end: obligations always buy, options buy when
 * affordable (deterministic stream), everyone else goes home.
 */
export function processLoansAtRollover(world: WorldState): void {
  const rng = createRng(deriveSeed(world.seed, world.season, 0x10a2));
  for (const loan of [...world.loans]) {
    const player = playerById(world, loan.playerId);
    const buyer = clubOf(world, loan.loanClubId);
    const seller = clubOf(world, loan.ownerClubId);
    const fee = loan.obligationToBuy
      ? (loan.optionToBuyFee ?? player.value)
      : loan.optionToBuyFee;

    const wantsToBuy =
      loan.obligationToBuy ||
      (fee !== null && fee <= buyer.budgetTransfer && rng.nextFloat() < 0.35);

    if (wantsToBuy && fee !== null) {
      buyer.budgetTransfer = Math.max(0, buyer.budgetTransfer - fee);
      buyer.balance -= fee;
      buyer.seasonTransferSpend = (buyer.seasonTransferSpend ?? 0) + fee;
      seller.balance += fee;
      seller.budgetTransfer += Math.round(fee * 0.5);
      seller.seasonTransferIncome = (seller.seasonTransferIncome ?? 0) + fee;
      world.transfers.push({
        playerId: loan.playerId,
        fromClubId: seller.id,
        toClubId: buyer.id,
        fee,
        season: world.season,
        matchday: world.totalMatchdays,
      });
      endLoan(world, loan, true);
    } else {
      endLoan(world, loan, false);
    }
  }
}

/**
 * Best AI club that would take this player on loan (their weakest XI slot
 * improves), or null if nobody is interested. Used by the user's loan-out.
 */
export function findLoanTaker(world: WorldState, playerId: number): number | null {
  const player = playerById(world, playerId);
  let bestClubId: number | null = null;
  let bestGain = 0;
  for (const club of world.clubs) {
    if (club.id === player.clubId || club.id === world.userClubId) continue;
    if (club.playerIds.length >= 34) continue;
    const squad = availableSquad(world, club.id, world.currentMatchday);
    if (squad.length < 11) continue;
    const xi = selectBestXi(squad, club.tactics.formation);
    let weakest = xi.slots[0];
    for (const slot of xi.slots) {
      if (weakest === undefined || slot.effectiveOvr < weakest.effectiveOvr) weakest = slot;
    }
    if (weakest === undefined) continue;
    const fit = positionFit(player, weakest.slot);
    if (fit < 0.9) continue;
    const gain = player.ovr * fit - weakest.effectiveOvr;
    if (gain > bestGain || (gain === bestGain && bestClubId !== null && club.id < bestClubId)) {
      bestClubId = club.id;
      bestGain = gain;
    }
  }
  return bestClubId;
}

/** AI development-loan activity during open windows. Deterministic. */
export function runAiLoanTick(world: WorldState, matchday: number): WorldLoan[] {
  const made: WorldLoan[] = [];
  for (const club of world.clubs) {
    if (club.id === world.userClubId) continue;
    const rng = createRng(deriveSeed(world.seed, world.season, matchday, 0x10af, club.id));
    if (rng.nextFloat() > 0.12) continue;

    const squad = availableSquad(world, club.id, matchday);
    if (squad.length < 11 || club.playerIds.length >= 34) continue;
    const xi = selectBestXi(squad, club.tactics.formation);
    let weakest = xi.slots[0];
    for (const slot of xi.slots) {
      if (weakest === undefined || slot.effectiveOvr < weakest.effectiveOvr) weakest = slot;
    }
    if (weakest === undefined) continue;

    let best: WorldPlayer | null = null;
    let bestGain = 1;
    for (const donor of world.clubs) {
      if (donor.id === club.id || donor.id === world.userClubId) continue;
      if (donor.reputation <= club.reputation) continue; // develop bigger clubs' kids
      for (const candidate of loanCandidatesFrom(world, donor.id)) {
        const fit = positionFit(candidate, weakest.slot);
        if (fit < 0.9) continue;
        const gain = candidate.ovr * fit - weakest.effectiveOvr;
        if (gain > bestGain || (gain === bestGain && best !== null && candidate.id < best.id)) {
          best = candidate;
          bestGain = gain;
        }
      }
    }
    if (best === null) continue;
    made.push(
      executeLoan(world, best.id, club.id, {
        ...STANDARD_LOAN_TERMS,
        optionToBuyFee: best.value,
      }),
    );
  }
  return made;
}
