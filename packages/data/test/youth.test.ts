/**
 * Phase-5 gate (§15): a 5+ season save stays populated and produces
 * plausible youth prospects; academy quality follows facilities + youth
 * coach + stature.
 */

import {
  assertWorldInvariants,
  clubOf,
  rolloverSeason,
  simulateRestOfSeason,
  staffOf,
} from '@footy/engine';
import { createRng, deriveSeed } from '@footy/shared';
import { describe, expect, it } from 'vitest';
import { buildWorldForLeague } from '../src/world/buildWorld';
import { makeYouthIntakeGenerator } from '../src/generate/youth';

describe('youth intake quality', () => {
  it('a top academy produces clearly better prospects than a neglected one', () => {
    const world = buildWorldForLeague({ leagueKey: 'eng.1', userClubKey: 'arsenal' });
    const generate = makeYouthIntakeGenerator();

    const rich = clubOf(world, world.userClubId);
    rich.youthFacilities = 20;
    for (const staff of staffOf(world, rich.id)) {
      if (staff.role === 'youth') {
        staff.ratingGk = staff.ratingDef = staff.ratingMid = staff.ratingAtt = 10;
      }
    }
    const poor = world.clubs.find((c) => c.id !== rich.id)!;
    poor.youthFacilities = 3;
    poor.staffIds = poor.staffIds.filter(
      (id) => world.staff[id - 1]!.role !== 'youth',
    );

    let richSum = 0;
    let richCount = 0;
    let poorSum = 0;
    let poorCount = 0;
    for (let trial = 0; trial < 40; trial++) {
      for (const candidate of generate(world, rich.id, createRng(deriveSeed(1, trial)))) {
        richSum += candidate.potential;
        richCount++;
      }
      for (const candidate of generate(world, poor.id, createRng(deriveSeed(2, trial)))) {
        poorSum += candidate.potential;
        poorCount++;
      }
    }
    expect(richSum / richCount).toBeGreaterThan(poorSum / poorCount + 4);
  });
});

describe('5-season endurance (Phase-5 gate)', () => {
  it('the world stays populated and keeps producing prospects', () => {
    const world = buildWorldForLeague({ leagueKey: 'eng.1', userClubKey: 'arsenal' });
    const generate = makeYouthIntakeGenerator();
    const startingActive = world.players.filter((p) => p.clubId !== 0).length;
    let totalRetired = 0;
    let totalIntake = 0;

    for (let season = 0; season < 5; season++) {
      simulateRestOfSeason(world);
      const summary = rolloverSeason(world, { youthIntake: generate });
      totalRetired += summary.retiredCount;
      totalIntake += summary.intakeCount;
      assertWorldInvariants(world);
      for (const club of world.clubs) {
        expect(club.playerIds.length).toBeGreaterThanOrEqual(18);
        expect(club.playerIds.length).toBeLessThanOrEqual(34);
      }
    }

    const active = world.players.filter((p) => p.clubId !== 0 && p.retired !== true);
    expect(active.length).toBeGreaterThanOrEqual(Math.round(startingActive * 0.85));

    // life happened
    expect(totalRetired).toBeGreaterThan(10);
    expect(totalIntake).toBeGreaterThan(20 * 3 * 5 * 0.8); // ~3-6 per club per season

    // and the next generation looks plausible
    const prospects = active.filter((p) => p.age <= 19 && p.potential >= 78);
    expect(prospects.length).toBeGreaterThan(5);
    const avgSquad =
      world.clubs.reduce((sum, c) => sum + c.playerIds.length, 0) / world.clubs.length;
    expect(avgSquad).toBeGreaterThanOrEqual(24);
  }, 240_000);
});
