import {
  createRng,
  deriveSeed,
  neutralTacticalProfile,
  type TeamTacticalProfile,
} from '@footy/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FAST_MATCH_PARAMS,
  detExp,
  expectedGoalRates,
  simulateFastMatch,
  type FastMatchTeam,
} from '../src/index';

function team(attack: number, defence: number, profile?: Partial<TeamTacticalProfile>): FastMatchTeam {
  return { attack, defence, profile: { ...neutralTacticalProfile(), ...profile } };
}

function simulateMany(home: FastMatchTeam, away: FastMatchTeam, n: number, seed: number) {
  let homeGoals = 0;
  let awayGoals = 0;
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  for (let i = 0; i < n; i++) {
    const rng = createRng(deriveSeed(seed, i));
    const score = simulateFastMatch(home, away, rng);
    homeGoals += score.homeGoals;
    awayGoals += score.awayGoals;
    if (score.homeGoals > score.awayGoals) homeWins++;
    else if (score.homeGoals === score.awayGoals) draws++;
    else awayWins++;
  }
  return {
    meanHome: homeGoals / n,
    meanAway: awayGoals / n,
    homeWinPct: homeWins / n,
    drawPct: draws / n,
    awayWinPct: awayWins / n,
  };
}

describe('detExp', () => {
  it('matches Math.exp to double precision over the working range', () => {
    for (let x = -12; x <= 12; x += 0.0625) {
      const expected = Math.exp(x); // allowed in tests, not in engine src
      expect(Math.abs(detExp(x) - expected) / expected).toBeLessThan(1e-12);
    }
  });
});

describe('Tier-B fast match (§6)', () => {
  it('equal teams produce realistic score distributions', () => {
    const stats = simulateMany(team(70, 70), team(70, 70), 20000, 0xabc);
    expect(stats.meanHome).toBeGreaterThan(1.25);
    expect(stats.meanHome).toBeLessThan(1.6);
    expect(stats.meanAway).toBeGreaterThan(1.1);
    expect(stats.meanAway).toBeLessThan(1.45);
    expect(stats.drawPct).toBeGreaterThan(0.18);
    expect(stats.drawPct).toBeLessThan(0.32);
    // home advantage applied exactly once → home wins more often
    expect(stats.homeWinPct).toBeGreaterThan(stats.awayWinPct);
  });

  it('stronger squads win more', () => {
    const strong = simulateMany(team(88, 85), team(58, 55), 5000, 0xdef);
    expect(strong.homeWinPct).toBeGreaterThan(0.7);
    expect(strong.meanHome).toBeGreaterThan(2.2);
  });

  it('tactics materially move expected goals (requirement #4)', () => {
    const neutral = expectedGoalRates(team(70, 70), team(70, 70));
    const aggressive = expectedGoalRates(
      team(70, 70, { attackMod: 1.15 }),
      team(70, 70, { defenceMod: 1.1 }),
    );
    expect(aggressive.lambdaHome).toBeGreaterThan(neutral.lambdaHome * 1.2);

    const misfit = expectedGoalRates(team(70, 70, { compatibility: 0.8 }), team(70, 70));
    const suited = expectedGoalRates(team(70, 70, { compatibility: 1.2 }), team(70, 70));
    expect(suited.lambdaHome / misfit.lambdaHome).toBeCloseTo(1.5, 5);
  });

  it('λ is clamped to sane bounds', () => {
    const blowout = expectedGoalRates(team(99, 99), team(1, 1));
    expect(blowout.lambdaHome).toBeLessThanOrEqual(DEFAULT_FAST_MATCH_PARAMS.lambdaMax);
    const stalemate = expectedGoalRates(team(1, 99), team(1, 99));
    expect(stalemate.lambdaHome).toBeGreaterThanOrEqual(DEFAULT_FAST_MATCH_PARAMS.lambdaMin);
  });
});
