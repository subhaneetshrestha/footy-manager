/**
 * Tier-B fast match engine (§6): bivariate-Poisson-style score sampling with
 * the Dixon–Coles low-score correction, driven entirely by the injected PRNG.
 *
 * Consumes the TeamTacticalProfile emitted by Tactics (contract §3.5) and
 * applies home advantage γ exactly once, here.
 */

import {
  HOME_ADVANTAGE_GAMMA,
  clamp,
  type MatchScore,
  type Rng,
  type TeamTacticalProfile,
} from '@footy/shared';
import { detExp } from '../math/detMath';

export interface FastMatchTeam {
  /** Position-weighted attacking quality of the selected squad, 0-99. */
  attack: number;
  /** Position-weighted defensive quality, 0-99. */
  defence: number;
  profile: TeamTacticalProfile;
}

export interface FastMatchParams {
  /** League-average goals per team per match before modifiers. */
  baseLambda: number;
  /** λ ratio per OVR point of attack-vs-defence gap (calibration target). */
  ovrSensitivity: number;
  /** Dixon–Coles low-score dependence (typically slightly negative). */
  rho: number;
  /** Score-grid truncation; P(goals > maxGoals) is renormalised away. */
  maxGoals: number;
  lambdaMin: number;
  lambdaMax: number;
}

export const DEFAULT_FAST_MATCH_PARAMS: FastMatchParams = {
  baseLambda: 1.3,
  ovrSensitivity: 0.035,
  rho: -0.1,
  maxGoals: 12,
  lambdaMin: 0.15,
  lambdaMax: 4.5,
};

export interface GoalRates {
  lambdaHome: number;
  lambdaAway: number;
}

/** λ_home = base × γ × ovrGap × styleMods × compat (plan §6, Tier B). */
export function expectedGoalRates(
  home: FastMatchTeam,
  away: FastMatchTeam,
  params: FastMatchParams = DEFAULT_FAST_MATCH_PARAMS,
): GoalRates {
  const lambdaHome = clamp(
    params.baseLambda *
      HOME_ADVANTAGE_GAMMA *
      detExp(params.ovrSensitivity * (home.attack - away.defence)) *
      home.profile.attackMod *
      away.profile.defenceMod *
      home.profile.compatibility,
    params.lambdaMin,
    params.lambdaMax,
  );
  const lambdaAway = clamp(
    params.baseLambda *
      detExp(params.ovrSensitivity * (away.attack - home.defence)) *
      away.profile.attackMod *
      home.profile.defenceMod *
      away.profile.compatibility,
    params.lambdaMin,
    params.lambdaMax,
  );
  return { lambdaHome, lambdaAway };
}

function poissonPmf(lambda: number, maxGoals: number): number[] {
  const pmf: number[] = new Array<number>(maxGoals + 1);
  let p = detExp(-lambda);
  pmf[0] = p;
  for (let k = 1; k <= maxGoals; k++) {
    p = (p * lambda) / k;
    pmf[k] = p;
  }
  return pmf;
}

/** Dixon–Coles τ correction for the four low-score cells. */
function tau(h: number, a: number, lambdaHome: number, lambdaAway: number, rho: number): number {
  if (h === 0 && a === 0) return Math.max(0, 1 - lambdaHome * lambdaAway * rho);
  if (h === 1 && a === 0) return Math.max(0, 1 + lambdaAway * rho);
  if (h === 0 && a === 1) return Math.max(0, 1 + lambdaHome * rho);
  if (h === 1 && a === 1) return Math.max(0, 1 - rho);
  return 1;
}

/**
 * Simulate one background match. Fully deterministic for a given (inputs, rng
 * state): fixed-order grid walk, single uniform draw, no library transcendentals.
 */
export function simulateFastMatch(
  home: FastMatchTeam,
  away: FastMatchTeam,
  rng: Rng,
  params: FastMatchParams = DEFAULT_FAST_MATCH_PARAMS,
): MatchScore {
  const { lambdaHome, lambdaAway } = expectedGoalRates(home, away, params);
  const pmfHome = poissonPmf(lambdaHome, params.maxGoals);
  const pmfAway = poissonPmf(lambdaAway, params.maxGoals);

  let total = 0;
  const joint: number[] = new Array<number>((params.maxGoals + 1) * (params.maxGoals + 1));
  for (let h = 0; h <= params.maxGoals; h++) {
    const ph = pmfHome[h] ?? 0;
    for (let a = 0; a <= params.maxGoals; a++) {
      const cell = ph * (pmfAway[a] ?? 0) * tau(h, a, lambdaHome, lambdaAway, params.rho);
      joint[h * (params.maxGoals + 1) + a] = cell;
      total += cell;
    }
  }

  const u = rng.nextFloat() * total;
  let cumulative = 0;
  for (let h = 0; h <= params.maxGoals; h++) {
    for (let a = 0; a <= params.maxGoals; a++) {
      cumulative += joint[h * (params.maxGoals + 1) + a] ?? 0;
      if (u < cumulative) return { homeGoals: h, awayGoals: a };
    }
  }
  return { homeGoals: params.maxGoals, awayGoals: params.maxGoals };
}
