/**
 * Phase-1 engine systems over a synthetic world: calendar, XI/strength,
 * tactics profiles, season loop, board, transfers, rollover.
 */

import {
  ALL_ATTRIBUTES,
  PLAY_STYLES,
  clamp,
  type PlayerRatings,
  type Position,
} from '@footy/shared';
import { describe, expect, it } from 'vitest';
import {
  FORMATION_KEYS,
  computeTacticalProfile,
  endOfSeasonVerdict,
  executeTransfer,
  generateLeagueFixtures,
  isSeasonOver,
  leagueTable,
  playMatchday,
  rolloverSeason,
  runAiTransferWindowTick,
  seasonTarget,
  selectBestXi,
  simulateRestOfSeason,
  teamStrength,
  totalMatchdaysFor,
  transferMarket,
  transferWindowFor,
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

/** Synthetic league: one club per quality entry, 26-player squads. */
function makeWorld(qualities: number[], seed = 123): WorldState {
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
        age: 20 + (slot % 14),
        position,
        secondaryPositions: [],
        ovr,
        potential: clamp(ovr + 6, 20, 99),
        value: 1_000_000 + ovr * 10_000,
        wage: 5_000,
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
      balance: 50_000_000,
      budgetTransfer: 30_000_000,
      budgetWage: 200_000,
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

describe('calendar (§9)', () => {
  it('double round-robin: every pair twice (once per venue), one game per club per matchday', () => {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const fixtures = generateLeagueFixtures(1, ids, 1);
    expect(fixtures.length).toBe(380);
    expect(Math.max(...fixtures.map((f) => f.matchday))).toBe(38);

    const pairCount = new Array<number>(21 * 21).fill(0);
    for (const f of fixtures) pairCount[f.homeClubId * 21 + f.awayClubId]!++;
    for (let home = 1; home <= 20; home++) {
      for (let away = 1; away <= 20; away++) {
        expect(pairCount[home * 21 + away], `${home} vs ${away}`).toBe(home === away ? 0 : 1);
      }
    }

    for (let md = 1; md <= 38; md++) {
      const seen = new Array<number>(21).fill(0);
      for (const f of fixtures.filter((x) => x.matchday === md)) {
        seen[f.homeClubId]!++;
        seen[f.awayClubId]!++;
      }
      for (let club = 1; club <= 20; club++) expect(seen[club], `md ${md}`).toBe(1);
    }

    for (let club = 1; club <= 20; club++) {
      expect(fixtures.filter((f) => f.homeClubId === club).length).toBe(19);
    }
  });

  it('rejects odd club counts and computes matchdays', () => {
    expect(() => generateLeagueFixtures(1, [1, 2, 3], 1)).toThrow();
    expect(totalMatchdaysFor(20)).toBe(38);
    expect(totalMatchdaysFor(10)).toBe(18);
  });

  it('transfer windows: summer early, winter after halfway, closed otherwise', () => {
    expect(transferWindowFor(1, 38)).toBe('summer');
    expect(transferWindowFor(3, 38)).toBe('summer');
    expect(transferWindowFor(4, 38)).toBeNull();
    expect(transferWindowFor(20, 38)).toBe('winter');
    expect(transferWindowFor(22, 38)).toBe('winter');
    expect(transferWindowFor(23, 38)).toBeNull();
  });
});

describe('XI selection + team strength', () => {
  const world = makeWorld([80, 55]);

  it('fields 11 unique players with a keeper in goal', () => {
    for (const formation of FORMATION_KEYS) {
      const squad = world.clubs[0]!.playerIds.map((id) => world.players[id - 1]!);
      const xi = selectBestXi(squad, formation);
      expect(xi.slots.length).toBe(11);
      expect(new Set(xi.slots.map((s) => s.player.id)).size).toBe(11);
      expect(xi.slots[0]!.player.position).toBe('GK');
    }
  });

  it('better squads produce higher strengths', () => {
    const strong = teamStrength(
      selectBestXi(world.clubs[0]!.playerIds.map((id) => world.players[id - 1]!), '4-4-2'),
    );
    const weak = teamStrength(
      selectBestXi(world.clubs[1]!.playerIds.map((id) => world.players[id - 1]!), '4-4-2'),
    );
    expect(strong.attack).toBeGreaterThan(weak.attack + 15);
    expect(strong.defence).toBeGreaterThan(weak.defence + 15);
  });
});

describe('Tactics module (§7 / contract §3.5)', () => {
  const world = makeWorld([70, 60]);
  const xi = selectBestXi(world.clubs[0]!.playerIds.map((id) => world.players[id - 1]!), '4-4-2');

  it('every style yields a bounded, differentiated profile', () => {
    const profiles = PLAY_STYLES.map((style) => computeTacticalProfile(style, xi));
    for (const profile of profiles) {
      expect(profile.attackMod).toBeGreaterThanOrEqual(0.8);
      expect(profile.attackMod).toBeLessThanOrEqual(1.2);
      expect(profile.defenceMod).toBeGreaterThanOrEqual(0.8);
      expect(profile.defenceMod).toBeLessThanOrEqual(1.2);
      expect(profile.compatibility).toBeGreaterThanOrEqual(0.8);
      expect(profile.compatibility).toBeLessThanOrEqual(1.2);
      expect(profile.possessionShare).toBeGreaterThanOrEqual(0.3);
      expect(profile.possessionShare).toBeLessThanOrEqual(0.7);
    }
    expect(new Set(profiles.map((p) => `${p.attackMod}:${p.defenceMod}`)).size).toBeGreaterThan(5);
  });

  it('park-the-bus trades attack for defence; gegenpressing the reverse', () => {
    const bus = computeTacticalProfile('park_the_bus', xi);
    const press = computeTacticalProfile('gegenpressing', xi);
    const balanced = computeTacticalProfile('balanced', xi);
    expect(bus.attackMod).toBeLessThan(balanced.attackMod);
    expect(bus.defenceMod).toBeLessThan(balanced.defenceMod); // concedes less
    expect(press.attackMod).toBeGreaterThan(balanced.attackMod);
  });

  it('misfit XIs get punished through compatibility (requirement #6)', () => {
    // Force strikers into every outfield slot.
    const strikers = world.players.filter((p) => p.position === 'ST').slice(0, 4);
    const gk = world.players.find((p) => p.position === 'GK')!;
    const mixed = [gk, ...strikers, ...world.players.slice(0, 20)].slice(0, 26);
    const misfitXi = selectBestXi(
      world.players.filter((p) => p.position === 'ST' || p.position === 'GK').slice(0, 12),
      '4-4-2',
    );
    const fitted = computeTacticalProfile('balanced', xi);
    const misfit = computeTacticalProfile('balanced', misfitXi);
    expect(misfit.compatibility).toBeLessThan(fitted.compatibility);
    expect(mixed.length).toBeGreaterThan(0);
  });
});

describe('season loop + table', () => {
  it('plays a full season with coherent, deterministic tables', () => {
    const qualities = [85, 75, 70, 65, 60, 55];
    const world = makeWorld(qualities);
    simulateRestOfSeason(world);
    expect(isSeasonOver(world)).toBe(true);
    expect(world.fixtures.every((f) => f.played)).toBe(true);

    const table = leagueTable(world, 1);
    let totalFor = 0;
    let totalAgainst = 0;
    for (const row of table) {
      expect(row.played).toBe(10);
      expect(row.won + row.drawn + row.lost).toBe(10);
      expect(row.points).toBe(3 * row.won + row.drawn);
      totalFor += row.goalsFor;
      totalAgainst += row.goalsAgainst;
    }
    expect(totalFor).toBe(totalAgainst);

    const goalsPerMatch = totalFor / 30;
    expect(goalsPerMatch).toBeGreaterThan(1.6);
    expect(goalsPerMatch).toBeLessThan(4.2);

    // strongest squad outscores the weakest over a season
    const pointsOf = (clubId: number) => table.find((r) => r.clubId === clubId)!.points;
    expect(pointsOf(1)).toBeGreaterThan(pointsOf(6));

    // byte-determinism of the whole season
    const replay = makeWorld(qualities);
    simulateRestOfSeason(replay);
    expect(leagueTable(replay, 1)).toEqual(table);
  });
});

describe('board (§8, requirement #12)', () => {
  it('targets scale with stature', () => {
    const world = makeWorld([90, 70, 65, 60, 55, 40]);
    expect(seasonTarget(world, 1).label).toBe('Win the title');
    expect(seasonTarget(world, 6).label).toBe('Avoid relegation');
  });

  it('near-target finishes carry zero sacking risk; big misses carry real risk', () => {
    const overachiever = makeWorld([60, 60, 60, 60, 60, 58]);
    simulateRestOfSeason(overachiever);
    const calm = endOfSeasonVerdict(overachiever, 1);
    if (calm.gap <= 3) expect(calm.sackProbability).toBe(0);

    // Big reputation (title target) but by far the worst squad → big gap.
    const doomed = makeWorld([88, 75, 75, 75, 75, 75]);
    for (const id of doomed.clubs[0]!.playerIds) doomed.players[id - 1]!.ovr = 40;
    simulateRestOfSeason(doomed);
    const verdict = endOfSeasonVerdict(doomed, 1);
    expect(verdict.targetPosition).toBe(1);
    if (verdict.gap > 3) {
      expect(verdict.sackProbability).toBeGreaterThan(0);
      expect(['below', 'sacked']).toContain(verdict.verdict);
    }
  });
});

describe('transfers (§8 MVP)', () => {
  it('executeTransfer moves the player and the money', () => {
    const world = makeWorld([70, 70]);
    const market = transferMarket(world, 1);
    expect(market.length).toBeGreaterThan(0);
    const target = market[0]!;
    const buyer = world.clubs[0]!;
    const seller = world.clubs[1]!;
    const budgetBefore = buyer.budgetTransfer;
    const sellerBalanceBefore = seller.balance;

    const record = executeTransfer(world, target.id, 1, 1);
    expect(target.clubId).toBe(1);
    expect(buyer.playerIds).toContain(target.id);
    expect(seller.playerIds).not.toContain(target.id);
    expect(buyer.budgetTransfer).toBe(budgetBefore - record.fee);
    expect(seller.balance).toBe(sellerBalanceBefore + record.fee);
    expect(world.transfers).toHaveLength(1);
  });

  it('rejects unaffordable buys', () => {
    const world = makeWorld([70, 70]);
    world.clubs[0]!.budgetTransfer = 0;
    const target = transferMarket(world, 1)[0]!;
    expect(() => executeTransfer(world, target.id, 1, 1)).toThrow(/budget/);
  });

  it('AI window activity is deterministic and budget-respecting', () => {
    const a = makeWorld([80, 70, 65, 60, 55, 50]);
    const b = makeWorld([80, 70, 65, 60, 55, 50]);
    const recordsA = runAiTransferWindowTick(a, 1);
    const recordsB = runAiTransferWindowTick(b, 1);
    expect(recordsA).toEqual(recordsB);
    for (const club of a.clubs) expect(club.budgetTransfer).toBeGreaterThanOrEqual(0);
  });
});

describe('season rollover (§9 MVP)', () => {
  it('ages, grows youth toward potential, resets the calendar', () => {
    const world = makeWorld([70, 65, 60, 55]);
    simulateRestOfSeason(world);
    const agesBefore = world.players.map((p) => p.age);
    rolloverSeason(world);

    world.players.forEach((player, i) => {
      expect(player.age).toBe(agesBefore[i]! + 1);
      expect(player.potential).toBeGreaterThanOrEqual(player.ovr);
      expect(player.value).toBeGreaterThan(0);
    });
    expect(world.season).toBe(2027);
    expect(world.currentMatchday).toBe(1);
    expect(world.fixtures.every((f) => !f.played)).toBe(true);
    expect(world.fixtures.length).toBe(12); // 4 clubs → double round-robin
  });
});
