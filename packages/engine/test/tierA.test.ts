/**
 * Tier-A engine tests: the STANDING two-engine parity gate (§6 — Tier A and
 * Tier B must agree in expectation), timeline validity, determinism, and the
 * playMatchday integration (user fixture resolved by Tier A).
 */

import {
  ALL_ATTRIBUTES,
  clamp,
  createRng,
  deriveSeed,
  neutralTacticalProfile,
  type PlayerRatings,
  type Position,
  type TeamTacticalProfile,
} from '@footy/shared';
import { describe, expect, it } from 'vitest';
import {
  commentFor,
  expectedGoalRates,
  generateLeagueFixtures,
  playMatchday,
  simulateTierAMatch,
  totalMatchdaysFor,
  type DetailedMatch,
  type FastMatchTeam,
  type WorldPlayer,
  type WorldState,
} from '../src/index';

function team(attack: number, defence: number, profile?: Partial<TeamTacticalProfile>): FastMatchTeam {
  return { attack, defence, profile: { ...neutralTacticalProfile(), ...profile } };
}

describe('two-engine parity gate (§6 — standing calibration check)', () => {
  const configs: [string, FastMatchTeam, FastMatchTeam][] = [
    ['equal teams', team(70, 70), team(70, 70)],
    ['strong vs weak', team(88, 85), team(58, 55)],
    [
      'tactical profiles',
      team(74, 70, { possessionShare: 0.6, chanceQualityMod: 1.08, attackMod: 1.1 }),
      team(66, 72, { possessionShare: 0.45, chanceQualityMod: 0.94, defenceMod: 0.9 }),
    ],
  ];

  for (const [label, home, away] of configs) {
    it(`Tier A mean goals match Tier B λ for ${label}`, () => {
      const { lambdaHome, lambdaAway } = expectedGoalRates(home, away);
      const n = 800;
      let sumHome = 0;
      let sumAway = 0;
      for (let i = 0; i < n; i++) {
        const match = simulateTierAMatch(home, away, createRng(deriveSeed(0x71e4a, i)));
        sumHome += match.homeGoals;
        sumAway += match.awayGoals;
      }
      expect(Math.abs(sumHome / n - lambdaHome)).toBeLessThan(0.14);
      expect(Math.abs(sumAway / n - lambdaAway)).toBeLessThan(0.14);
    });
  }
});

describe('timeline validity', () => {
  const match = simulateTierAMatch(team(75, 70), team(68, 66), createRng(42), {
    fixtureId: 7,
    homeXi: Array.from({ length: 11 }, (_, i) => i + 1),
    awayXi: Array.from({ length: 11 }, (_, i) => i + 101),
  });

  it('is bookended and monotone in time', () => {
    expect(match.events[0]!.type).toBe('kickoff');
    expect(match.events[match.events.length - 1]!.type).toBe('full_time');
    let prev = 0;
    for (const event of match.events) {
      expect(event.minute).toBeGreaterThanOrEqual(prev);
      prev = event.minute;
      expect(event.x).toBeGreaterThanOrEqual(0);
      expect(event.x).toBeLessThanOrEqual(1);
      expect(event.y).toBeGreaterThanOrEqual(0);
      expect(event.y).toBeLessThanOrEqual(1);
    }
  });

  it('score and stats reconcile with the event stream', () => {
    const goals = match.events.filter((e) => e.type === 'goal');
    expect(goals.length).toBe(match.homeGoals + match.awayGoals);
    const shots = match.events.filter((e) => e.type === 'shot');
    expect(shots.length).toBe(match.stats.shotsHome + match.stats.shotsAway);
    expect(match.stats.onTargetHome).toBeLessThanOrEqual(match.stats.shotsHome);
    expect(match.stats.onTargetAway).toBeLessThanOrEqual(match.stats.shotsAway);
    expect(match.stats.possessionHome).toBeGreaterThanOrEqual(25);
    expect(match.stats.possessionHome).toBeLessThanOrEqual(75);
    expect(match.fixtureId).toBe(7);
  });

  it('attributes actors from the provided XIs', () => {
    const withActors = match.events.filter((e) => e.actorId !== undefined);
    expect(withActors.length).toBeGreaterThan(0);
    for (const event of withActors) {
      const pool = event.side === 'home' ? [1, 11] : [101, 111];
      expect(event.actorId!).toBeGreaterThanOrEqual(pool[0]!);
      expect(event.actorId!).toBeLessThanOrEqual(pool[1]!);
    }
  });

  it('is bit-identical for the same seed', () => {
    const a = simulateTierAMatch(team(75, 70), team(68, 66), createRng(42));
    const b = simulateTierAMatch(team(75, 70), team(68, 66), createRng(42));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('commentary covers headline events deterministically', () => {
    const ctx = { homeName: 'Home FC', awayName: 'Away FC' };
    for (const [index, event] of match.events.entries()) {
      const line = commentFor(event, index, ctx);
      if (['goal', 'shot', 'save', 'miss', 'kickoff', 'full_time'].includes(event.type)) {
        expect(line).toBeTruthy();
      }
      expect(line).toBe(commentFor(event, index, ctx));
    }
  });
});

describe('playMatchday integration', () => {
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

  function makeWorld(): WorldState {
    const players: WorldPlayer[] = [];
    const clubs = [70, 64].map((quality, index) => {
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
          age: 24,
          position,
          secondaryPositions: [],
          ovr,
          potential: ovr,
          value: 1_000_000,
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
        balance: 10_000_000,
        budgetTransfer: 10_000_000,
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
      seed: 4242,
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
      injuries: [],
      loans: [],
    };
  }

  it('resolves the user fixture with Tier A and hands back the timeline', () => {
    const world = makeWorld();
    let detail: DetailedMatch | null = null;
    const fixtures = playMatchday(world, (d) => {
      detail = d;
    });
    expect(detail).not.toBeNull();
    const userFixture = fixtures.find(
      (f) => f.homeClubId === world.userClubId || f.awayClubId === world.userClubId,
    )!;
    expect(userFixture.homeGoals).toBe(detail!.homeGoals);
    expect(userFixture.awayGoals).toBe(detail!.awayGoals);
    expect(detail!.events.length).toBeGreaterThan(50);

    // Watching vs. not watching must not change the world's trajectory.
    const silent = makeWorld();
    playMatchday(silent);
    const silentFixture = silent.fixtures.find((f) => f.matchday === 1 && f.played)!;
    expect(silentFixture.homeGoals).toBe(userFixture.homeGoals);
    expect(silentFixture.awayGoals).toBe(userFixture.awayGoals);
  });
});
