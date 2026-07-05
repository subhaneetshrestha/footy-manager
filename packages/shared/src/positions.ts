/**
 * Position codes + per-position OVR coefficient tables (§5).
 * OVR = round( Σ_attr coeff[pos][attr] × attr ), weights sum to 1 per position.
 * Coefficients are the Phase-0 starting point; calibration against reference
 * overalls is a tracked Phase-0/1 task (PLAN §16).
 */

import type { Attribute } from './attributes';
import { OVR_MAX, OVR_MIN, clamp } from './constants';

export const POSITIONS = [
  'GK',
  'RB',
  'CB',
  'LB',
  'RWB',
  'LWB',
  'CDM',
  'CM',
  'CAM',
  'RM',
  'LM',
  'RW',
  'LW',
  'ST',
] as const;
export type Position = (typeof POSITIONS)[number];

export type PositionGroup = 'goalkeeper' | 'defence' | 'midfield' | 'attack';

export const POSITION_GROUPS: Record<Position, PositionGroup> = {
  GK: 'goalkeeper',
  RB: 'defence',
  CB: 'defence',
  LB: 'defence',
  RWB: 'defence',
  LWB: 'defence',
  CDM: 'midfield',
  CM: 'midfield',
  CAM: 'midfield',
  RM: 'midfield',
  LM: 'midfield',
  RW: 'attack',
  LW: 'attack',
  ST: 'attack',
} as const;

type CoeffTable = Partial<Record<Attribute, number>>;

const GK_COEFFS: CoeffTable = {
  gk_diving: 0.21,
  gk_handling: 0.21,
  gk_positioning: 0.21,
  gk_reflexes: 0.21,
  gk_kicking: 0.05,
  reactions: 0.05,
  jumping: 0.02,
  composure: 0.02,
  concentration: 0.02,
};

const FULLBACK_COEFFS: CoeffTable = {
  standing_tackle: 0.11,
  marking: 0.1,
  interceptions: 0.08,
  positioning: 0.05,
  crossing: 0.09,
  short_passing: 0.07,
  dribbling: 0.05,
  ball_control: 0.05,
  acceleration: 0.07,
  sprint_speed: 0.08,
  stamina: 0.08,
  agility: 0.04,
  work_rate: 0.06,
  anticipation: 0.04,
  heading: 0.03,
};

const CB_COEFFS: CoeffTable = {
  marking: 0.13,
  standing_tackle: 0.14,
  sliding_tackle: 0.08,
  interceptions: 0.1,
  positioning: 0.08,
  heading: 0.1,
  strength: 0.1,
  jumping: 0.06,
  aggression: 0.04,
  composure: 0.05,
  short_passing: 0.05,
  ball_control: 0.03,
  acceleration: 0.02,
  sprint_speed: 0.02,
};

const WINGBACK_COEFFS: CoeffTable = {
  crossing: 0.11,
  standing_tackle: 0.09,
  marking: 0.07,
  interceptions: 0.06,
  positioning: 0.04,
  short_passing: 0.08,
  dribbling: 0.07,
  ball_control: 0.06,
  acceleration: 0.08,
  sprint_speed: 0.09,
  stamina: 0.1,
  agility: 0.04,
  work_rate: 0.06,
  anticipation: 0.03,
  heading: 0.02,
};

const CDM_COEFFS: CoeffTable = {
  standing_tackle: 0.11,
  interceptions: 0.11,
  marking: 0.08,
  positioning: 0.07,
  short_passing: 0.11,
  long_passing: 0.07,
  ball_control: 0.06,
  vision: 0.05,
  decisions: 0.06,
  anticipation: 0.05,
  composure: 0.05,
  stamina: 0.06,
  strength: 0.06,
  aggression: 0.04,
  work_rate: 0.02,
};

const CM_COEFFS: CoeffTable = {
  short_passing: 0.13,
  long_passing: 0.08,
  ball_control: 0.09,
  first_touch: 0.07,
  vision: 0.09,
  decisions: 0.07,
  dribbling: 0.06,
  positioning: 0.05,
  interceptions: 0.05,
  standing_tackle: 0.04,
  stamina: 0.08,
  long_shots: 0.04,
  composure: 0.05,
  work_rate: 0.05,
  off_the_ball: 0.05,
};

const CAM_COEFFS: CoeffTable = {
  short_passing: 0.11,
  vision: 0.11,
  ball_control: 0.1,
  first_touch: 0.08,
  dribbling: 0.09,
  long_shots: 0.06,
  finishing: 0.07,
  off_the_ball: 0.07,
  decisions: 0.06,
  composure: 0.06,
  agility: 0.06,
  technique: 0.07,
  acceleration: 0.04,
  long_passing: 0.02,
};

const WIDE_MID_COEFFS: CoeffTable = {
  crossing: 0.11,
  dribbling: 0.11,
  ball_control: 0.09,
  short_passing: 0.08,
  first_touch: 0.07,
  acceleration: 0.09,
  sprint_speed: 0.08,
  agility: 0.07,
  stamina: 0.07,
  off_the_ball: 0.06,
  vision: 0.05,
  decisions: 0.04,
  long_shots: 0.03,
  finishing: 0.05,
};

const WINGER_COEFFS: CoeffTable = {
  dribbling: 0.13,
  acceleration: 0.1,
  sprint_speed: 0.09,
  agility: 0.08,
  ball_control: 0.1,
  crossing: 0.08,
  finishing: 0.09,
  first_touch: 0.07,
  off_the_ball: 0.07,
  technique: 0.06,
  composure: 0.04,
  vision: 0.04,
  short_passing: 0.05,
};

const ST_COEFFS: CoeffTable = {
  finishing: 0.16,
  off_the_ball: 0.11,
  shot_power: 0.08,
  heading: 0.07,
  first_touch: 0.08,
  ball_control: 0.07,
  dribbling: 0.06,
  composure: 0.08,
  acceleration: 0.07,
  sprint_speed: 0.06,
  strength: 0.06,
  jumping: 0.04,
  volleys: 0.03,
  anticipation: 0.03,
};

export const OVR_COEFFICIENTS: Record<Position, CoeffTable> = {
  GK: GK_COEFFS,
  RB: FULLBACK_COEFFS,
  LB: FULLBACK_COEFFS,
  CB: CB_COEFFS,
  RWB: WINGBACK_COEFFS,
  LWB: WINGBACK_COEFFS,
  CDM: CDM_COEFFS,
  CM: CM_COEFFS,
  CAM: CAM_COEFFS,
  RM: WIDE_MID_COEFFS,
  LM: WIDE_MID_COEFFS,
  RW: WINGER_COEFFS,
  LW: WINGER_COEFFS,
  ST: ST_COEFFS,
} as const;

/** Position-weighted overall (contract §3 / §5). Deterministic: basic IEEE ops only. */
export function computeOvr(
  position: Position,
  ratings: Partial<Record<Attribute, number>>,
): number {
  const coeffs = OVR_COEFFICIENTS[position];
  let sum = 0;
  for (const attr in coeffs) {
    const weight = coeffs[attr as Attribute];
    const value = ratings[attr as Attribute];
    if (weight !== undefined && value !== undefined) {
      sum += weight * value;
    }
  }
  return clamp(Math.round(sum), OVR_MIN, OVR_MAX);
}
