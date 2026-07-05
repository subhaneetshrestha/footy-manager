/**
 * Phase-6 gate (§15): the multi-season economy is stable — a 10-season
 * career doesn't explode, drain, or produce nonsense budgets.
 */

import { rolloverSeason, simulateRestOfSeason } from '@footy/engine';
import { describe, expect, it } from 'vitest';
import { buildWorldForLeague } from '../src/world/buildWorld';
import { makeYouthIntakeGenerator } from '../src/generate/youth';

describe('10-season economic stability (Phase-6 gate)', () => {
  it('balances stay finite and sane, budgets bounded, embargos rare', () => {
    const world = buildWorldForLeague({ leagueKey: 'eng.1', userClubKey: 'arsenal' });
    const generate = makeYouthIntakeGenerator();
    const initialWealth = world.clubs.reduce((sum, c) => sum + c.balance, 0);
    let embargoClubSeasons = 0;

    for (let season = 0; season < 10; season++) {
      simulateRestOfSeason(world);
      rolloverSeason(world, { youthIntake: generate });

      for (const club of world.clubs) {
        expect(Number.isFinite(club.balance)).toBe(true);
        expect(club.budgetTransfer).toBeGreaterThanOrEqual(200_000);
        expect(club.budgetTransfer).toBeLessThanOrEqual(300_000_000);
        expect(club.budgetWage).toBeGreaterThan(0);
        expect(club.books).toBeDefined();
        if (club.transferEmbargo === true) embargoClubSeasons++;
        // Post-rollover floor: the summer window refill hasn't run yet.
        expect(club.playerIds.length).toBeGreaterThanOrEqual(16);
      }
      const avgSquad =
        world.clubs.reduce((sum, c) => sum + c.playerIds.length, 0) / world.clubs.length;
      expect(avgSquad).toBeGreaterThanOrEqual(23);
    }

    // Wealth grows (big clubs accumulate) but within a bounded band.
    const finalWealth = world.clubs.reduce((sum, c) => sum + c.balance, 0);
    expect(finalWealth).toBeGreaterThan(initialWealth * 0.3);
    expect(finalWealth).toBeLessThan(initialWealth * 40);

    // Solvency: the median club is comfortably alive.
    const balances = world.clubs.map((c) => c.balance).sort((a, b) => a - b);
    expect(balances[Math.floor(balances.length / 2)]!).toBeGreaterThan(0);

    // FFP bites occasionally, not everywhere.
    expect(embargoClubSeasons).toBeLessThan(world.clubs.length * 10 * 0.3);

    // Books stay coherent at the end of a decade.
    const sample = world.clubs[0]!.books!;
    const revenue =
      sample.revenueGate +
      sample.revenueTv +
      sample.revenueSponsor +
      sample.revenuePrize +
      sample.revenueTransfers;
    const expenses =
      sample.expenseWages +
      sample.expenseStaffWages +
      sample.expenseTransfers +
      sample.expenseOperating;
    expect(sample.net).toBe(revenue - expenses);
  }, 240_000);
});
