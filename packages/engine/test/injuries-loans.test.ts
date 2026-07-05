/**
 * Phase-3 gate (§15): injuries occur at believable rates/lengths; the
 * loan/transfer market behaves plausibly. Distribution checks use large-N
 * direct sampling; lifecycle checks use synthetic worlds.
 */

import {
  ALL_ATTRIBUTES,
  INJURY_TIER_DAYS,
  clamp,
  createRng,
  type PlayerRatings,
  type Position,
} from '@footy/shared';
import { describe, expect, it } from 'vitest';
import {
  activeLoanFor,
  availableSquad,
  clubOf,
  durationModifier,
  executeLoan,
  executeTransfer,
  generateLeagueFixtures,
  incidenceModifier,
  isAvailable,
  matchTeamFor,
  playerById,
  processContractsAtRollover,
  processLoansAtRollover,
  recallLoan,
  renewContract,
  rolloverSeason,
  sampleDurationDays,
  sampleTier,
  simulateRestOfSeason,
  totalMatchdaysFor,
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

function makeWorld(qualities: number[], seed = 999): WorldState {
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
        age: 17 + (slot % 16),
        position,
        secondaryPositions: [],
        ovr,
        potential: clamp(ovr + 12, 20, 99),
        value: 1_000_000,
        wage: 5_000,
        contractYearsLeft: 1 + (slot % 4),
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
        key: 'test.1',
        name: 'Test League',
        nation: 'ENG',
        reputation: 70,
        relegationSlots: 1,
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

describe('injury sampling (Fuller tiers, §3.6)', () => {
  it('tier mix and durations stay within the locked bands', () => {
    const rng = createRng(0x111);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20_000; i++) {
      const tier = sampleTier(rng);
      counts[tier] = (counts[tier] ?? 0) + 1;
      const days = sampleDurationDays(tier, rng);
      if (tier !== 'career_ending') {
        expect(days).toBeGreaterThanOrEqual(INJURY_TIER_DAYS[tier].minDays);
        expect(days).toBeLessThanOrEqual(INJURY_TIER_DAYS[tier].maxDays);
      }
    }
    expect((counts['minimal'] ?? 0) / 20_000).toBeGreaterThan(0.3);
    expect((counts['severe'] ?? 0) / 20_000).toBeLessThan(0.15);
    expect((counts['career_ending'] ?? 0) / 20_000).toBeLessThan(0.02);
  });

  it('physios prevent and shorten injuries', () => {
    expect(incidenceModifier(10)).toBeLessThan(incidenceModifier(0));
    expect(durationModifier(10)).toBeLessThan(durationModifier(0));
  });

  it('a full season produces believable injury volume and availability', () => {
    const world = makeWorld([70, 66, 62, 58, 54, 50]);
    simulateRestOfSeason(world);

    // 6 clubs × 10 matchdays → expect ≈ 3 injuries/club; league total is the
    // stable statistic (per-club counts are small-N Poisson).
    expect(world.injuries.length).toBeGreaterThanOrEqual(8);
    expect(world.injuries.length).toBeLessThanOrEqual(60);
    const perClub = world.clubs.map(
      (c) => world.injuries.filter((r) => r.clubId === c.id).length,
    );
    for (const count of perClub) expect(count).toBeLessThanOrEqual(25);
    for (const record of world.injuries) {
      expect(record.days).toBeGreaterThanOrEqual(1);
      expect(record.matchday).toBeGreaterThanOrEqual(1);
    }
    // determinism
    const replay = makeWorld([70, 66, 62, 58, 54, 50]);
    simulateRestOfSeason(replay);
    expect(replay.injuries).toEqual(world.injuries);
  });

  it('injured players drop out of selection until they return', () => {
    const world = makeWorld([70, 60]);
    const star = playerById(world, world.clubs[0]!.playerIds[3]!);
    star.injury = { tier: 'moderate', type: 'hamstring strain', daysTotal: 21, returnMatchday: 4 };

    expect(isAvailable(star, 1)).toBe(false);
    expect(isAvailable(star, 4)).toBe(true);
    expect(availableSquad(world, 1, 1).some((p) => p.id === star.id)).toBe(false);
    expect(() => matchTeamFor(world, 1)).not.toThrow();
  });

  it('long injuries carry over the season boundary', () => {
    const world = makeWorld([70, 60]);
    const player = playerById(world, 1);
    player.injury = {
      tier: 'severe',
      type: 'ACL damage',
      daysTotal: 200,
      returnMatchday: world.totalMatchdays + 10,
    };
    rolloverSeason(world);
    expect(player.injury).not.toBeNull();
    expect(player.injury!.returnMatchday).toBe(10);
  });
});

describe('loans (§8: clauses + lifecycle)', () => {
  it('loan → recall round-trip', () => {
    const world = makeWorld([80, 55]);
    const player = playerById(world, world.clubs[0]!.playerIds[20]!);
    executeLoan(world, player.id, 2);
    expect(player.clubId).toBe(2);
    expect(clubOf(world, 2).playerIds).toContain(player.id);
    expect(activeLoanFor(world, player.id)).toBeDefined();
    expect(() => executeTransfer(world, player.id, 2, 1)).toThrow(/loan/);

    recallLoan(world, player.id);
    expect(player.clubId).toBe(1);
    expect(activeLoanFor(world, player.id)).toBeUndefined();
  });

  it('obligation-to-buy converts into a permanent transfer at rollover', () => {
    const world = makeWorld([80, 55]);
    const player = playerById(world, world.clubs[0]!.playerIds[20]!);
    executeLoan(world, player.id, 2, {
      wageSplit: 0.5,
      optionToBuyFee: 5_000_000,
      obligationToBuy: true,
      recallAllowed: false,
    });
    const buyerBudget = world.clubs[1]!.budgetTransfer;
    processLoansAtRollover(world);
    expect(player.clubId).toBe(2);
    expect(world.loans).toHaveLength(0);
    expect(world.clubs[1]!.budgetTransfer).toBe(Math.max(0, buyerBudget - 5_000_000));
    expect(world.transfers.some((t) => t.playerId === player.id && t.fee === 5_000_000)).toBe(true);
  });

  it('plain loans go home at rollover', () => {
    const world = makeWorld([80, 55]);
    const player = playerById(world, world.clubs[0]!.playerIds[20]!);
    executeLoan(world, player.id, 2);
    processLoansAtRollover(world);
    expect(player.clubId).toBe(1);
    expect(world.loans).toHaveLength(0);
  });
});

describe('contracts (§8: depth + expiries)', () => {
  it('rollover decrements, renews wanted AI players, releases the unwanted', () => {
    const world = makeWorld([70, 60]);
    // An old, bottom-of-squad AI player on an expiring deal gets released.
    const fringe = playerById(world, world.clubs[1]!.playerIds[25]!);
    fringe.age = 34;
    fringe.ovr = 25;
    fringe.contractYearsLeft = 1;

    const starter = playerById(world, world.clubs[1]!.playerIds[0]!);
    starter.contractYearsLeft = 1;

    processContractsAtRollover(world);
    expect(fringe.clubId).toBe(0); // released
    expect(starter.clubId).toBe(2); // renewed
    expect(starter.contractYearsLeft).toBeGreaterThanOrEqual(1);
  });

  it("the user's expiring players get one grace season, then walk", () => {
    const world = makeWorld([70, 60]);
    const own = playerById(world, world.clubs[0]!.playerIds[5]!);
    own.contractYearsLeft = 1;
    processContractsAtRollover(world);
    expect(own.clubId).toBe(1);
    expect(own.contractYearsLeft).toBe(0);
    processContractsAtRollover(world);
    expect(own.clubId).toBe(0); // walked
  });

  it('renewContract meets the wage demand within budget', () => {
    const world = makeWorld([70, 60]);
    const own = playerById(world, world.clubs[0]!.playerIds[5]!);
    own.contractYearsLeft = 0;
    renewContract(world, own.id, 3);
    expect(own.contractYearsLeft).toBe(3);
    expect(own.wage).toBeGreaterThan(0);

    world.clubs[0]!.budgetWage = 0;
    expect(() => renewContract(world, own.id, 3)).toThrow(/budget/);
  });

  it('free agents can be signed via the normal transfer path', () => {
    const world = makeWorld([70, 60]);
    const released = playerById(world, world.clubs[1]!.playerIds[25]!);
    released.age = 34;
    released.ovr = 25;
    released.contractYearsLeft = 1;
    processContractsAtRollover(world);
    expect(released.clubId).toBe(0);

    const record = executeTransfer(world, released.id, 1, 1);
    expect(record.fromClubId).toBe(0);
    expect(released.clubId).toBe(1);
    expect(released.contractYearsLeft).toBeGreaterThanOrEqual(2);
  });
});
