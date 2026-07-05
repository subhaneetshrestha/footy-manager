/**
 * THE single player-valuation function — owned by Finance (contract §3.3).
 * Data seeds initial `value` by calling this; no other formula may exist.
 *
 * Value = BASE(OVR) × f_age × f_pot × f_contract × f_reputation × f_position × inflation
 * (plan §8; McHale & Holmes + StatsBomb inverted-U age curve, see RESEARCH.md)
 */

import { clamp, type Position } from '@footy/shared';
import { interpolate, powInt } from '../math/detMath';

export interface PlayerValuationInput {
  ovr: number;
  potential: number;
  age: number;
  contractYearsLeft: number;
  /** Player reputation, 0-100. */
  reputation: number;
  position: Position;
}

export interface ValuationOptions {
  marketInflation?: number;
}

/** BASE(OVR) ≈ 10k × 1.18^(OVR−40) EUR — exponential in current overall. */
const BASE_VALUE_AT_40 = 10_000;
const BASE_VALUE_GROWTH = 1.18;

/** Inverted-U age curve peaking ~27 (calibration target). */
const AGE_CURVE = [
  [15, 0.65],
  [17, 0.7],
  [20, 0.85],
  [24, 0.98],
  [27, 1.05],
  [30, 1.0],
  [32, 0.75],
  [34, 0.5],
  [36, 0.3],
  [38, 0.18],
  [40, 0.1],
] as const;

/** f_pot strength: young high-potential premium (requirement #13). */
const POTENTIAL_PREMIUM_PER_POINT = 0.1;

/** youthFactor: 1 at ≤21, decaying to 0 by 29. */
function youthFactor(age: number): number {
  return clamp((29 - age) / 8, 0, 1);
}

/** Contract effect: expiring contracts collapse the fee (0 yrs → near-free). */
const CONTRACT_CURVE = [
  [0, 0.1],
  [1, 0.55],
  [2, 0.8],
  [3, 0.95],
  [4, 1.05],
] as const;

const POSITION_FACTOR: Record<Position, number> = {
  GK: 0.75,
  CB: 0.95,
  RB: 0.9,
  LB: 0.9,
  RWB: 0.9,
  LWB: 0.9,
  CDM: 1.0,
  CM: 1.0,
  CAM: 1.1,
  RM: 1.0,
  LM: 1.0,
  RW: 1.15,
  LW: 1.15,
  ST: 1.2,
};

export function playerValue(input: PlayerValuationInput, opts?: ValuationOptions): number {
  const base = BASE_VALUE_AT_40 * powInt(BASE_VALUE_GROWTH, Math.round(input.ovr) - 40);
  const potentialGap = Math.max(0, input.potential - input.ovr);
  const value =
    base *
    interpolate(AGE_CURVE, input.age) *
    (1 + POTENTIAL_PREMIUM_PER_POINT * potentialGap * youthFactor(input.age)) *
    interpolate(CONTRACT_CURVE, clamp(input.contractYearsLeft, 0, 4)) *
    (0.7 + 0.6 * (input.reputation / 100)) *
    POSITION_FACTOR[input.position] *
    (opts?.marketInflation ?? 1);
  if (value < 10_000) return Math.max(1_000, Math.round(value / 1_000) * 1_000);
  return Math.round(value / 10_000) * 10_000;
}

/**
 * Weekly wage in EUR, exponential in OVR and scaled by club reputation.
 * Same ownership rule: Data seeds wages by calling this.
 */
export function weeklyWage(ovr: number, clubReputation: number): number {
  const raw = 200 * powInt(1.13, Math.round(ovr) - 40) * (0.5 + clubReputation / 100);
  return Math.max(300, Math.round(raw / 50) * 50);
}
