/**
 * Phase-5 academy mechanics: retirements leave the game for good, intakes
 * append without breaking the id invariant, oversized squads shed seniors,
 * and the whole rollover cycle stays deterministic.
 */

import {
  ALL_ATTRIBUTES,
  clamp,
  createRng,
  type PlayerRatings,
  type Position,
} from '@footy/shared';
import { describe, expect, it } from 'vitest';
import {
  applyRetirements,
  applyYouthIntake,
  assertWorldInvariants,
  clubOf,
  generateLeagueFixtures,
  playerById,
  pruneOversizedSquads,
  rolloverSeason,
  totalMatchdaysFor,
  transferMarket,
  type WorldPlayer,
  type WorldState,
  type YouthIntakeCandidate,
  type YouthIntakeGenerator,
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

function makePlayer(id: number, clubId: number, position: Position, ovr: number, age: number): WorldPlayer {
  return {
    id,
    clubId,
    name: `P${id}`,
    age,
    position,
    secondaryPositions: [],
    ovr,
    potential: clamp(ovr + 10, 20, 99),
    value: 1_000_000,
    wage: 5_000,
    contractYearsLeft: 3,
    form: 0,
    fitness: 100,
    morale: 70,
    injury: null,
    ratings: fullRatings(ovr),
  };
}

function makeWorld(): WorldState {
  const players: WorldPlayer[] = [];
  const clubs = [70, 62].map((quality, index) => {
    const clubId = index + 1;
    const playerIds: number[] = [];
    SQUAD_TEMPLATE.forEach((position, slot) => {
      const id = players.length + 1;
      playerIds.push(id);
      players.push(makePlayer(id, clubId, position, clamp(quality + 2 - (slot % 6), 20, 99), 20 + (slot % 13)));
    });
    return {
      id: clubId,
      leagueId: 1,
      name: `Club ${clubId}`,
      shortName: `C${clubId}`,
      reputation: quality,
      colorPrimary: '#000000',
      colorSecondary: '#ffffff',
      balance: 20_000_000,
      budgetTransfer: 20_000_000,
      budgetWage: 400_000,
      budgetStaffWage: 30_000,
      trainingFacilities: 12,
      youthFacilities: 12,
      tactics: { formation: '4-4-2' as const, playStyle: 'balanced' as const },
      playerIds,
      staffIds: [],
    };
  });

  return {
    seed: 555,
    season: 2026,
    currentMatchday: 1,
    totalMatchdays: totalMatchdaysFor(2),
    userClubId: 1,
    leagues: [
      { id: 1, key: 't.1', name: 'T', nation: 'ENG', reputation: 70, relegationSlots: 0, clubIds: [1, 2] },
    ],
    clubs,
    players,
    staff: [],
    fixtures: generateLeagueFixtures(1, [1, 2], 1),
    transfers: [],
    injuries: [],
    loans: [],
  };
}

const fakeIntake: YouthIntakeGenerator = (world, clubId, rng) => {
  const make = (position: Position): YouthIntakeCandidate => ({
    name: `Y${clubId}-${rng.nextInt(0, 9999)}`,
    age: 16,
    position,
    secondaryPositions: [],
    ovr: 40,
    potential: 80,
    value: 500_000,
    wage: 400,
    contractYearsLeft: 3,
    form: 0,
    fitness: 100,
    morale: 72,
    injury: null,
    ratings: fullRatings(40),
  });
  return [make('CM'), make('ST')];
};

describe('retirements', () => {
  it('a 39-year-old always retires and vanishes from the market', () => {
    const world = makeWorld();
    const veteran = playerById(world, 5);
    veteran.age = 40;
    const retired = applyRetirements(world, createRng(1));
    expect(retired).toBeGreaterThanOrEqual(1);
    expect(veteran.retired).toBe(true);
    expect(veteran.clubId).toBe(0);
    expect(veteran.value).toBe(0);
    expect(clubOf(world, 1).playerIds).not.toContain(veteran.id);
    expect(transferMarket(world, 2).some((p) => p.id === veteran.id)).toBe(false);
  });
});

describe('youth intake', () => {
  it('appends prospects without breaking the id invariant', () => {
    const world = makeWorld();
    const before = world.players.length;
    const { intakeCount, userIntake } = applyYouthIntake(world, fakeIntake, createRng(2));
    expect(intakeCount).toBe(4); // 2 per club
    expect(world.players.length).toBe(before + 4);
    expect(userIntake).toHaveLength(2);
    expect(userIntake.every((p) => p.clubId === 1 && p.age === 16)).toBe(true);
    assertWorldInvariants(world);
  });
});

describe('squad pruning', () => {
  it('sheds surplus seniors, never the kids', () => {
    const world = makeWorld();
    const club = clubOf(world, 1);
    for (let i = 0; i < 8; i++) {
      const id = world.players.length + 1;
      world.players.push(makePlayer(id, 1, 'CM', 50, i < 4 ? 30 : 17));
      club.playerIds.push(id);
    }
    expect(club.playerIds.length).toBe(34);
    const released = pruneOversizedSquads(world);
    expect(released).toBe(2);
    expect(club.playerIds.length).toBe(32);
    // every remaining under-22 survived
    const kids = club.playerIds.map((id) => playerById(world, id)).filter((p) => p.age <= 21);
    expect(kids.length).toBeGreaterThanOrEqual(4);
    assertWorldInvariants(world);
  });
});

describe('rollover with academy cycle', () => {
  it('returns a coherent summary and stays deterministic', () => {
    const run = () => {
      const world = makeWorld();
      const summary = rolloverSeason(world, { youthIntake: fakeIntake });
      return { world, summary };
    };
    const a = run();
    const b = run();
    expect(a.summary).toEqual(b.summary);
    expect(a.summary.intakeCount).toBe(4);
    expect(a.world.players.length).toBe(b.world.players.length);
    expect(JSON.stringify(a.world.players.slice(-4))).toBe(
      JSON.stringify(b.world.players.slice(-4)),
    );
    assertWorldInvariants(a.world);
    expect(a.world.season).toBe(2027);
  });
});
