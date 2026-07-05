/**
 * Phase-2 gate (§15): better/style-matched coaches measurably accelerate
 * development; smaller clubs are visibly budget-constrained. Runs on a
 * synthetic two-club world with identical squads.
 */

import {
  ALL_ATTRIBUTES,
  PLAY_STYLES,
  clamp,
  type PlayerRatings,
  type PlayStyle,
  type Position,
  type StaffRole,
} from '@footy/shared';
import { describe, expect, it } from 'vitest';
import {
  CORE_STAFF_ROLES,
  autoFillStaff,
  clubOf,
  coachWage,
  fireStaff,
  freeAgentStaff,
  generateLeagueFixtures,
  growthTick,
  hireStaff,
  staffWageBill,
  staffWageBudget,
  totalMatchdaysFor,
  type WorldPlayer,
  type WorldStaff,
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

function styleMap(value: number): Record<PlayStyle, number> {
  const map = {} as Record<PlayStyle, number>;
  for (const style of PLAY_STYLES) map[style] = value;
  return map;
}

function makeWorld(age: number): WorldState {
  const players: WorldPlayer[] = [];
  const clubs = [1, 2].map((clubId) => {
    const playerIds: number[] = [];
    SQUAD_TEMPLATE.forEach((position, slot) => {
      const id = players.length + 1;
      const ovr = clamp(60 + 2 - (slot % 6), 20, 99);
      playerIds.push(id);
      players.push({
        id,
        clubId,
        name: `P${id}`,
        age,
        position,
        secondaryPositions: [],
        ovr,
        potential: clamp(ovr + 25, 20, 99),
        value: 1_000_000,
        wage: 5_000,
        form: 0,
        fitness: 100,
        morale: 70,
        ratings: fullRatings(ovr),
      });
    });
    return {
      id: clubId,
      leagueId: 1,
      name: `Club ${clubId}`,
      shortName: `C${clubId}`,
      reputation: 70,
      colorPrimary: '#000000',
      colorSecondary: '#ffffff',
      balance: 50_000_000,
      budgetTransfer: 30_000_000,
      budgetWage: 200_000,
      budgetStaffWage: clubId === 1 ? 100_000 : 5_000,
      trainingFacilities: clubId === 1 ? 20 : 5,
      youthFacilities: 10,
      tactics: { formation: '4-4-2' as const, playStyle: 'balanced' as const },
      playerIds,
      staffIds: [],
    };
  });

  return {
    seed: 777,
    season: 2026,
    currentMatchday: 1,
    totalMatchdays: totalMatchdaysFor(2),
    userClubId: 1,
    leagues: [
      {
        id: 1,
        key: 't.1',
        name: 'T',
        nation: 'ENG',
        reputation: 70,
        relegationSlots: 0,
        clubIds: [1, 2],
      },
    ],
    clubs,
    players,
    staff: [],
    fixtures: generateLeagueFixtures(1, [1, 2], 1),
    transfers: [],
  };
}

function addStaff(
  world: WorldState,
  clubId: number,
  role: StaffRole,
  rating: number,
  styleRating: number,
  wage = 1_000,
): WorldStaff {
  const staff: WorldStaff = {
    id: world.staff.length + 1,
    clubId,
    name: `S${world.staff.length + 1}`,
    role,
    ratingGk: rating,
    ratingDef: rating,
    ratingMid: rating,
    ratingAtt: rating,
    playstyleRatings: styleMap(styleRating),
    wage,
  };
  world.staff.push(staff);
  if (clubId > 0) clubOf(world, clubId).staffIds.push(staff.id);
  return staff;
}

function eliteStaffFor(world: WorldState, clubId: number): void {
  for (const role of CORE_STAFF_ROLES) addStaff(world, clubId, role, 10, 10);
}

function meanOvr(world: WorldState, clubId: number): number {
  const ids = clubOf(world, clubId).playerIds;
  return ids.reduce((sum, id) => sum + world.players[id - 1]!.ovr, 0) / ids.length;
}

describe('staff budgets (§8, requirement #11)', () => {
  it('scale steeply with reputation', () => {
    expect(staffWageBudget(90)).toBeGreaterThan(staffWageBudget(45) * 5);
    expect(coachWage(9)).toBeGreaterThan(coachWage(3) * 5);
  });
});

describe('hiring + auto-manage (requirements #7/#8)', () => {
  it('hires within budget, enforces one person per role, fires cleanly', () => {
    const world = makeWorld(24);
    const coach = addStaff(world, 0, 'def_coach', 8, 5, 3_000);
    hireStaff(world, coach.id, 1);
    expect(coach.clubId).toBe(1);
    expect(staffWageBill(world, 1)).toBe(3_000);

    const rival = addStaff(world, 0, 'def_coach', 9, 5, 6_000);
    expect(() => hireStaff(world, rival.id, 1)).toThrow(/already filled/);
    expect(() => hireStaff(world, rival.id, 2)).toThrow(/budget/); // club 2 budget is 5k

    fireStaff(world, coach.id);
    expect(coach.clubId).toBe(0);
    expect(staffWageBill(world, 1)).toBe(0);
  });

  it('autoFillStaff fills every core role for a rich club; a poor club is constrained', () => {
    const world = makeWorld(24);
    for (const role of CORE_STAFF_ROLES) {
      addStaff(world, 0, role, 9, 6, 9_000);
      addStaff(world, 0, role, 4, 4, 900);
    }
    const hiredRich = autoFillStaff(world, 1);
    expect(hiredRich).toBe(CORE_STAFF_ROLES.length);
    const richMean =
      clubOf(world, 1).staffIds.reduce((s, id) => s + world.staff[id - 1]!.ratingDef, 0) /
      CORE_STAFF_ROLES.length;

    const hiredPoor = autoFillStaff(world, 2);
    const poorStaff = clubOf(world, 2).staffIds.map((id) => world.staff[id - 1]!);
    const poorMean =
      poorStaff.reduce((s, x) => s + x.ratingDef, 0) / Math.max(1, poorStaff.length);

    expect(staffWageBill(world, 2)).toBeLessThanOrEqual(clubOf(world, 2).budgetStaffWage);
    expect(richMean).toBeGreaterThan(poorMean); // small club visibly constrained
    expect(hiredPoor).toBeLessThanOrEqual(hiredRich);
  });
});

describe('coaching-driven growth (Phase-2 gate)', () => {
  it('elite matched coaching + facilities measurably accelerate development', () => {
    const world = makeWorld(18);
    eliteStaffFor(world, 1); // club 2 has no staff and poor facilities
    const before1 = meanOvr(world, 1);
    const before2 = meanOvr(world, 2);
    expect(before1).toBeCloseTo(before2, 6);

    for (let tick = 1; tick <= 30; tick++) growthTick(world, tick);

    const gain1 = meanOvr(world, 1) - before1;
    const gain2 = meanOvr(world, 2) - before2;
    expect(gain1).toBeGreaterThan(0.5);
    expect(gain1).toBeGreaterThan(gain2 * 1.5);

    for (const player of world.players) {
      expect(player.potential).toBeGreaterThanOrEqual(player.ovr);
      for (const attr of ALL_ATTRIBUTES) {
        expect(player.ratings[attr]).toBeGreaterThanOrEqual(0);
        expect(player.ratings[attr]).toBeLessThanOrEqual(99);
      }
    }
  });

  it('veterans decline, softened by a fitness coach', () => {
    const world = makeWorld(34);
    addStaff(world, 1, 'fitness', 10, 5);
    const before1 = meanOvr(world, 1);
    const before2 = meanOvr(world, 2);

    for (let tick = 1; tick <= 30; tick++) growthTick(world, tick);

    const drop1 = before1 - meanOvr(world, 1);
    const drop2 = before2 - meanOvr(world, 2);
    expect(drop2).toBeGreaterThan(0.3); // decline is real
    expect(drop1).toBeLessThan(drop2); // fitness coach slows it
    for (const player of world.players) {
      expect(player.potential).toBeGreaterThanOrEqual(player.ovr);
    }
  });

  it('growth ticks are deterministic', () => {
    const a = makeWorld(18);
    const b = makeWorld(18);
    eliteStaffFor(a, 1);
    eliteStaffFor(b, 1);
    for (let tick = 1; tick <= 10; tick++) {
      growthTick(a, tick);
      growthTick(b, tick);
    }
    expect(JSON.stringify(a.players)).toBe(JSON.stringify(b.players));
  });

  it('free agents remain available and unaffected by ticks', () => {
    const world = makeWorld(18);
    addStaff(world, 0, 'manager', 7, 7);
    growthTick(world, 4);
    expect(freeAgentStaff(world).length).toBe(1);
  });
});
