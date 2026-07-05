/**
 * Phase-1 gate integration: hydrate a real league from the authored world,
 * play a believable full season end-to-end, check realism + determinism
 * (PLAN §15 Phase 1 acceptance).
 */

import {
  endOfSeasonVerdict,
  leagueTable,
  leagueOutcome,
  simulateRestOfSeason,
  clubOf,
} from '@footy/engine';
import { describe, expect, it } from 'vitest';
import { buildWorldForLeague } from '../src/world/buildWorld';

describe('buildWorldForLeague + full season (Phase-1 gate)', () => {
  it('hydrates the Premier League deterministically', () => {
    const world = buildWorldForLeague({ leagueKey: 'eng.1', userClubKey: 'arsenal' });
    expect(world.clubs.length).toBe(20);
    expect(world.players.length).toBeGreaterThan(550);
    expect(world.fixtures.length).toBe(380);
    expect(world.totalMatchdays).toBe(38);
    expect(clubOf(world, world.userClubId).name).toBe('Arsenal');

    const replay = buildWorldForLeague({ leagueKey: 'eng.1', userClubKey: 'arsenal' });
    expect(JSON.stringify(replay.players[100])).toBe(JSON.stringify(world.players[100]));
  });

  it('simulates a believable full season (tables realistic, results deterministic)', () => {
    const world = buildWorldForLeague({ leagueKey: 'eng.1', userClubKey: 'arsenal' });
    simulateRestOfSeason(world);

    const table = leagueTable(world, 1);
    let goals = 0;
    let draws = 0;
    for (const fixture of world.fixtures) {
      expect(fixture.played).toBe(true);
      goals += fixture.homeGoals + fixture.awayGoals;
      if (fixture.homeGoals === fixture.awayGoals) draws++;
    }

    const goalsPerMatch = goals / world.fixtures.length;
    expect(goalsPerMatch).toBeGreaterThan(2.0);
    expect(goalsPerMatch).toBeLessThan(3.6);

    const drawShare = draws / world.fixtures.length;
    expect(drawShare).toBeGreaterThan(0.12);
    expect(drawShare).toBeLessThan(0.38);

    for (const row of table) expect(row.played).toBe(38);
    const champion = table[0]!;
    expect(champion.points).toBeGreaterThan(60);
    expect(champion.points).toBeLessThanOrEqual(114);
    // The champion should be one of the league's serious clubs.
    expect(clubOf(world, champion.clubId).reputation).toBeGreaterThanOrEqual(75);

    const verdict = endOfSeasonVerdict(world, world.userClubId);
    expect(verdict.actualPosition).toBeGreaterThanOrEqual(1);
    expect(verdict.actualPosition).toBeLessThanOrEqual(20);
    expect(verdict.message.length).toBeGreaterThan(10);

    const outcome = leagueOutcome(world, 1);
    expect(outcome.relegatedClubIds.length).toBe(3);

    // full-season determinism
    const replay = buildWorldForLeague({ leagueKey: 'eng.1', userClubKey: 'arsenal' });
    simulateRestOfSeason(replay);
    expect(leagueTable(replay, 1)).toEqual(table);
  });

  it('transfer windows produce plausible AI activity over a season', () => {
    const world = buildWorldForLeague({ leagueKey: 'eng.1', userClubKey: 'arsenal' });
    simulateRestOfSeason(world);
    // Some business should happen across summer + winter windows, but not a frenzy.
    expect(world.transfers.length).toBeGreaterThan(0);
    expect(world.transfers.length).toBeLessThan(120);
    for (const t of world.transfers) {
      expect(t.fee).toBeGreaterThan(0);
      expect(t.fromClubId).not.toBe(t.toClubId);
    }
  });
});
