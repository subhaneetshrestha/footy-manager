/**
 * Phase-6 economy mechanics: season books, FFP embargos, installments,
 * agent fees, sell-on clauses, and the manager job market.
 */

import {
  ALL_ATTRIBUTES,
  clamp,
  type PlayerRatings,
  type Position,
} from '@footy/shared';
import { describe, expect, it } from 'vitest';
import {
  acceptJob,
  applyVerdictToManagerReputation,
  clubOf,
  computeSeasonBooks,
  executeTransfer,
  generateLeagueFixtures,
  jobOffersFor,
  managerReputationOf,
  playerById,
  simulateRestOfSeason,
  totalMatchdaysFor,
  type BoardVerdict,
  type WorldPlayer,
  type WorldState,
} from '../src/index';

const SQUAD_TEMPLATE: Position[] = [
  'GK', 'GK', 'GK',
  'RB', 'RB', 'LB', 'LB',
  'CB', 'CB', 'CB', 'CB',
  'CDM', 'CDM', 'CM', 'CM', 'CM',
  'CAM', 'CAM', 'RM', 'LM',
  'RW', 'LW',
  'ST', 'ST', 'ST', 'ST',
];

function fullRatings(value: number): PlayerRatings {
  const ratings = {} as PlayerRatings;
  for (const attr of ALL_ATTRIBUTES) ratings[attr] = clamp(value, 1, 99);
  return ratings;
}

function makeWorld(qualities: number[], seed = 321): WorldState {
  const players: WorldPlayer[] = [];
  const clubs = qualities.map((quality, index) => {
    const clubId = index + 1;
    const playerIds: number[] = [];
    SQUAD_TEMPLATE.forEach((position, slot) => {
      const id = players.length + 1;
      const ovr = clamp(quality + 2 - (slot % 6), 20, 99);
      playerIds.push(id);
      players.push({
        id,
        clubId,
        name: `P${id}`,
        age: 22 + (slot % 10),
        position,
        secondaryPositions: [],
        ovr,
        potential: clamp(ovr + 8, 20, 99),
        value: 2_000_000,
        wage: 8_000,
        contractYearsLeft: 3,
        form: 0,
        fitness: 100,
        morale: 70,
        injury: null,
        ratings: fullRatings(ovr),
      });
    });
    return {
      id: clubId,
      leagueId: 1,
      name: `Club ${clubId}`,
      shortName: `C${clubId}`,
      reputation: quality,
      colorPrimary: '#000000',
      colorSecondary: '#ffffff',
      stadiumCapacity: 30_000,
      balance: 50_000_000,
      budgetTransfer: 30_000_000,
      budgetWage: 400_000,
      budgetStaffWage: 30_000,
      trainingFacilities: 12,
      youthFacilities: 12,
      tactics: { formation: '4-4-2' as const, playStyle: 'balanced' as const },
      playerIds,
      staffIds: [],
    };
  });

  const clubIds = clubs.map((c) => c.id);
  return {
    seed,
    season: 2026,
    currentMatchday: 1,
    totalMatchdays: totalMatchdaysFor(clubIds.length),
    userClubId: 1,
    leagues: [
      {
        id: 1,
        key: 't.1',
        name: 'T',
        nation: 'ENG',
        reputation: 70,
        relegationSlots: 1,
        tvPoolBase: 200_000_000,
        prizePoolBase: 30_000_000,
        clubIds,
      },
    ],
    clubs,
    players,
    staff: [],
    fixtures: generateLeagueFixtures(1, clubIds, 1),
    transfers: [],
    injuries: [],
    loans: [],
  };
}

describe('season books (§8)', () => {
  it('computes coherent books and re-derives budgets', () => {
    const world = makeWorld([80, 70, 60, 50]);
    simulateRestOfSeason(world);
    const balancesBefore = world.clubs.map((c) => c.balance);
    computeSeasonBooks(world);

    world.clubs.forEach((club, i) => {
      const books = club.books!;
      expect(books).toBeDefined();
      const revenue =
        books.revenueGate +
        books.revenueTv +
        books.revenueSponsor +
        books.revenuePrize +
        books.revenueTransfers;
      const expenses =
        books.expenseWages +
        books.expenseStaffWages +
        books.expenseTransfers +
        books.expenseOperating;
      expect(books.net).toBe(revenue - expenses);
      expect(club.balance).toBe(balancesBefore[i]! + books.net);
      expect(club.budgetTransfer).toBeGreaterThanOrEqual(200_000);
      expect(club.budgetWage).toBeGreaterThan(0);
      expect(club.seasonTransferSpend).toBe(0);
      expect(Number.isFinite(club.balance)).toBe(true);
    });

    // Better-placed, bigger clubs earn more TV money.
    const first = world.clubs.find((c) => c.books!.finalPosition === 1)!;
    const last = world.clubs.find((c) => c.books!.finalPosition === 4)!;
    expect(first.books!.revenueTv).toBeGreaterThan(last.books!.revenueTv);
  });

  it('repeated heavy losses trigger an FFP transfer embargo', () => {
    const world = makeWorld([60, 60, 55, 50]);
    const spender = clubOf(world, 1);
    for (const id of spender.playerIds) playerById(world, id).wage = 600_000; // ruinous

    computeSeasonBooks(world);
    expect(spender.ffpStrikes).toBe(1);
    expect(spender.transferEmbargo).toBe(false);

    computeSeasonBooks(world);
    expect(spender.ffpStrikes).toBe(2);
    expect(spender.transferEmbargo).toBe(true);

    spender.budgetTransfer = 50_000_000;
    const target = world.players.find((p) => p.clubId === 2)!;
    expect(() => executeTransfer(world, target.id, 1, 1)).toThrow(/embargo/);
  });
});

describe('transfer depth (§8: installments, agents, sell-ons)', () => {
  it('splits big fees into installments and books the deferred half', () => {
    const world = makeWorld([70, 70]);
    const buyer = clubOf(world, 1);
    buyer.budgetTransfer = 10_000_000;
    const target = world.players.find((p) => p.clubId === 2)!;
    target.value = 16_000_000;
    // make him buyable (outside seller's protected ranks)
    target.ovr = 30;

    executeTransfer(world, target.id, 1, 1);
    expect(buyer.budgetTransfer).toBe(10_000_000 - 8_000_000);
    expect(world.deferredPayments).toHaveLength(1);
    expect(world.deferredPayments![0]!.amount).toBe(8_000_000);
    expect(world.deferredPayments![0]!.dueSeason).toBe(world.season + 1);
  });

  it('charges agent fees and honors sell-on clauses across two moves', () => {
    const world = makeWorld([70, 70, 70, 70]);
    const player = world.players.find((p) => p.clubId === 2)!;
    player.ovr = 30;
    player.value = 4_000_000;

    const firstSeller = clubOf(world, 2);
    executeTransfer(world, player.id, 1, 1); // C2 → C1: C2 now holds a 15% sell-on
    expect(world.sellOnClauses!.some((c) => c.playerId === player.id && c.beneficiaryClubId === 2)).toBe(true);

    const sellerBalanceBefore = clubOf(world, 1).balance;
    const beneficiaryBefore = firstSeller.balance;
    player.value = 10_000_000;
    // C1 must be allowed to sell him: he's fringe (ovr 30) so listable.
    executeTransfer(world, player.id, 3, 2); // C1 → C3
    expect(firstSeller.balance).toBe(beneficiaryBefore + 1_500_000); // 15% of 10M
    expect(clubOf(world, 1).balance).toBe(sellerBalanceBefore + 8_500_000);
    // clause rolls over to the new seller
    expect(world.sellOnClauses!.find((c) => c.playerId === player.id)!.beneficiaryClubId).toBe(1);

    const buyer = clubOf(world, 3);
    expect(buyer.seasonTransferSpend).toBe(10_000_000 + 500_000); // fee + 5% agent
  });
});

describe('manager job market (§8)', () => {
  it('reputation moves with verdicts and drives offers', () => {
    const world = makeWorld([80, 70, 60, 50]);
    const initial = managerReputationOf(world);
    expect(initial).toBeGreaterThan(20);

    const sackedVerdict: BoardVerdict = {
      targetPosition: 1,
      targetLabel: 'Win the title',
      actualPosition: 4,
      gap: 3,
      sackProbability: 0.5,
      verdict: 'sacked',
      message: '',
    };
    const after = applyVerdictToManagerReputation(world, sackedVerdict);
    expect(after).toBe(initial - 6);

    const offers = jobOffersFor(world);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((c) => c.id !== world.userClubId)).toBe(true);
    expect(offers.every((c) => c.reputation <= after + 8)).toBe(true);

    acceptJob(world, offers[0]!.id);
    expect(world.userClubId).toBe(offers[0]!.id);
  });
});
