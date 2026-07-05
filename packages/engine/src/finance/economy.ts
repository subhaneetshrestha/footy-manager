/**
 * Deep finances (§8, Phase 6) — Finance-owned season books: gate receipts,
 * TV pool split (half equal, half merit), sponsorship, prize money and
 * transfer flows against wage bills and operating costs. Applied once per
 * season at rollover; budgets re-derive from the resulting balance, and an
 * FFP-style constraint embargoes clubs that post repeated heavy losses.
 */

import { clamp } from '@footy/shared';
import { leagueTable } from '../season/table';
import { staffWageBill } from '../staff/hiring';
import { playerById, type SeasonBooks, type WorldClub, type WorldState } from '../world/types';
import { powInt } from '../math/detMath';
import { staffWageBudget } from './budgets';

/** Fallback when the hydrator didn't provide a real capacity. */
export function stadiumCapacityOf(club: WorldClub): number {
  return club.stadiumCapacity ?? Math.round(8_000 + club.reputation * 420);
}

/** Share of match/commercial revenue eaten by operations (calibration knob). */
const OPERATING_COST_SHARE = 0.7;
/** Net loss beyond this share of revenue earns an FFP strike. */
const FFP_LOSS_TOLERANCE = 0.2;

function meritShare(position: number, size: number): number {
  // 1st gets size units, last gets 1 unit, normalized.
  return (size - position + 1) / ((size * (size + 1)) / 2);
}

/** Settle last season's transfer instalments into this season's books. */
function settleDeferredPayments(world: WorldState): void {
  const due = (world.deferredPayments ?? []).filter((p) => p.dueSeason === world.season);
  world.deferredPayments = (world.deferredPayments ?? []).filter(
    (p) => p.dueSeason !== world.season,
  );
  for (const payment of due) {
    const club = world.clubs[payment.clubId - 1];
    if (club === undefined) continue;
    club.seasonTransferSpend = (club.seasonTransferSpend ?? 0) + payment.amount;
  }
}

/**
 * Compute and apply every club's books for the season that just finished.
 * Call BEFORE fixtures are reset (needs the final table).
 */
export function computeSeasonBooks(world: WorldState): void {
  settleDeferredPayments(world);

  for (const league of world.leagues) {
    const table = leagueTable(world, league.id);
    const size = league.clubIds.length;
    const tvPool = league.tvPoolBase ?? 40_000_000;
    const prizePool = league.prizePoolBase ?? 8_000_000;

    table.forEach((row, index) => {
      const club = world.clubs[row.clubId - 1];
      if (club === undefined) return;
      const position = index + 1;
      const homeMatches = size - 1;

      const fillRate = clamp(
        0.45 + club.reputation / 150 + ((size - position) / size) * 0.15,
        0.3,
        1,
      );
      const ticketPrice = 15 + club.reputation / 4;
      const revenueGate = Math.round(
        stadiumCapacityOf(club) * fillRate * ticketPrice * homeMatches,
      );
      const revenueTv = Math.round((tvPool * 0.5) / size + tvPool * 0.5 * meritShare(position, size));
      const revenueSponsor = Math.round(500_000 * powInt(1.06, club.reputation - 50));
      const revenuePrize = Math.round(prizePool * meritShare(position, size));
      const revenueTransfers = club.seasonTransferIncome ?? 0;

      const expenseWages = club.playerIds.reduce(
        (sum, id) => sum + playerById(world, id).wage * 52,
        0,
      );
      const expenseStaffWages = staffWageBill(world, club.id) * 52;
      const expenseTransfers = club.seasonTransferSpend ?? 0;
      const expenseOperating = Math.round(
        OPERATING_COST_SHARE * (revenueGate + revenueTv + revenueSponsor + revenuePrize),
      );

      const revenue = revenueGate + revenueTv + revenueSponsor + revenuePrize + revenueTransfers;
      const net =
        revenue - expenseWages - expenseStaffWages - expenseTransfers - expenseOperating;

      club.balance += net;
      club.books = {
        season: world.season,
        finalPosition: position,
        revenueGate,
        revenueTv,
        revenueSponsor,
        revenuePrize,
        revenueTransfers,
        expenseWages,
        expenseStaffWages,
        expenseTransfers,
        expenseOperating,
        net,
      };

      // FFP: repeated heavy losses trigger a transfer embargo (§8).
      if (net < -FFP_LOSS_TOLERANCE * Math.max(1, revenue)) {
        club.ffpStrikes = (club.ffpStrikes ?? 0) + 1;
      } else {
        club.ffpStrikes = 0;
      }
      club.transferEmbargo = (club.ffpStrikes ?? 0) >= 2;

      // Next season's budgets flow from the balance sheet.
      club.budgetTransfer = clamp(
        Math.round((club.balance * 0.2) / 50_000) * 50_000,
        200_000,
        300_000_000,
      );
      const weeklyWageBill = club.playerIds.reduce(
        (sum, id) => sum + playerById(world, id).wage,
        0,
      );
      club.budgetWage = Math.round(weeklyWageBill * 1.2);
      club.budgetStaffWage = Math.max(
        Math.round(staffWageBill(world, club.id) * 1.25),
        staffWageBudget(club.reputation),
      );

      club.seasonTransferSpend = 0;
      club.seasonTransferIncome = 0;
    });
  }
}
