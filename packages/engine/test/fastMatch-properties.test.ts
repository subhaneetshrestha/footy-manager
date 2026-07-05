/**
 * Property tests for the Tier-B engine: the sampler must actually realise the
 * analytic λs, home advantage must appear exactly once, and the Dixon–Coles
 * correction must do its one job (boost low-score draws).
 */

import {
  HOME_ADVANTAGE_GAMMA,
  createRng,
  deriveSeed,
  neutralTacticalProfile,
} from '@footy/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FAST_MATCH_PARAMS,
  expectedGoalRates,
  simulateFastMatch,
  type FastMatchParams,
  type FastMatchTeam,
} from '../src/index';

function team(attack: number, defence: number): FastMatchTeam {
  return { attack, defence, profile: neutralTacticalProfile() };
}

function drawPct(
  home: FastMatchTeam,
  away: FastMatchTeam,
  params: FastMatchParams,
  n: number,
  seed: number,
): number {
  let draws = 0;
  for (let i = 0; i < n; i++) {
    const s = simulateFastMatch(home, away, createRng(deriveSeed(seed, i)), params);
    if (s.homeGoals === s.awayGoals) draws++;
  }
  return draws / n;
}

describe('sampler realises the analytic rates', () => {
  const cases: [FastMatchTeam, FastMatchTeam][] = [
    [team(70, 70), team(70, 70)],
    [team(88, 85), team(58, 55)],
    [team(55, 80), team(80, 55)],
  ];

  for (const [home, away] of cases) {
    it(`sampled means ≈ λ for ${home.attack}/${home.defence} vs ${away.attack}/${away.defence}`, () => {
      const { lambdaHome, lambdaAway } = expectedGoalRates(home, away);
      const n = 20_000;
      let sumHome = 0;
      let sumAway = 0;
      for (let i = 0; i < n; i++) {
        const s = simulateFastMatch(home, away, createRng(deriveSeed(0x5eed, i)));
        sumHome += s.homeGoals;
        sumAway += s.awayGoals;
      }
      // DC correction + truncation shift means only marginally.
      expect(Math.abs(sumHome / n - lambdaHome)).toBeLessThan(0.07);
      expect(Math.abs(sumAway / n - lambdaAway)).toBeLessThan(0.07);
    });
  }
});

describe('home advantage appears exactly once (contract §3.5)', () => {
  it('swapping venues divides exactly by γ', () => {
    const a = team(74, 68);
    const b = team(63, 71);
    const forward = expectedGoalRates(a, b);
    const reversed = expectedGoalRates(b, a);
    expect(forward.lambdaHome / HOME_ADVANTAGE_GAMMA).toBeCloseTo(reversed.lambdaAway, 12);
    expect(reversed.lambdaHome / HOME_ADVANTAGE_GAMMA).toBeCloseTo(forward.lambdaAway, 12);
  });
});

describe('Dixon–Coles correction', () => {
  it('negative ρ boosts draws relative to independent Poisson', () => {
    const home = team(70, 70);
    const away = team(70, 70);
    const n = 40_000;
    const withDc = drawPct(home, away, DEFAULT_FAST_MATCH_PARAMS, n, 0xd1ce);
    const without = drawPct(home, away, { ...DEFAULT_FAST_MATCH_PARAMS, rho: 0 }, n, 0xd1ce);
    expect(withDc).toBeGreaterThan(without + 0.005);
  });

  it('extreme ρ values stay well-defined (τ floors at 0)', () => {
    for (const rho of [-0.9, 0.9]) {
      const params = { ...DEFAULT_FAST_MATCH_PARAMS, rho };
      for (let i = 0; i < 1_000; i++) {
        const s = simulateFastMatch(
          team(90, 40),
          team(40, 90),
          createRng(deriveSeed(0xfeed, i)),
          params,
        );
        expect(Number.isInteger(s.homeGoals)).toBe(true);
        expect(Number.isInteger(s.awayGoals)).toBe(true);
        expect(s.homeGoals).toBeGreaterThanOrEqual(0);
        expect(s.homeGoals).toBeLessThanOrEqual(params.maxGoals);
        expect(s.awayGoals).toBeGreaterThanOrEqual(0);
        expect(s.awayGoals).toBeLessThanOrEqual(params.maxGoals);
      }
    }
  });
});

describe('tactical profile plumbing', () => {
  it('own attackMod and opponent defenceMod scale λ exactly', () => {
    const base = expectedGoalRates(team(70, 70), team(70, 70));
    const boosted = expectedGoalRates(
      { ...team(70, 70), profile: { ...neutralTacticalProfile(), attackMod: 1.2 } },
      team(70, 70),
    );
    expect(boosted.lambdaHome / base.lambdaHome).toBeCloseTo(1.2, 10);

    const leaky = expectedGoalRates(
      team(70, 70),
      { ...team(70, 70), profile: { ...neutralTacticalProfile(), defenceMod: 1.15 } },
    );
    expect(leaky.lambdaHome / base.lambdaHome).toBeCloseTo(1.15, 10);
  });

  it('repeated simulation with the same seed is bit-identical', () => {
    const scores1: string[] = [];
    const scores2: string[] = [];
    for (let i = 0; i < 200; i++) {
      const a = simulateFastMatch(team(72, 66), team(64, 70), createRng(deriveSeed(0xabcd, i)));
      const b = simulateFastMatch(team(72, 66), team(64, 70), createRng(deriveSeed(0xabcd, i)));
      scores1.push(`${a.homeGoals}-${a.awayGoals}`);
      scores2.push(`${b.homeGoals}-${b.awayGoals}`);
    }
    expect(scores1).toEqual(scores2);
  });
});
