/**
 * Dev-time staff generator (§8): coaching quality scales with club
 * reputation, coaches specialize in their department, managers specialize in
 * a preferred play style. Wages come from the Finance-owned coachWage.
 */

import { CORE_STAFF_ROLES, coachWage, type WorldStaff } from '@footy/engine';
import { PLAY_STYLES, clamp, type PlayStyle, type Rng, type StaffRole } from '@footy/shared';
import type { NameBank } from '../config/types';

export type StaffSeed = Omit<WorldStaff, 'id' | 'clubId'>;

function gauss(rng: Rng): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += rng.nextFloat();
  return sum - 6;
}

function pickName(bank: NameBank, rng: Rng): string {
  const first = bank.firstNames[rng.nextInt(0, bank.firstNames.length - 1)] ?? 'Alex';
  const last = bank.lastNames[rng.nextInt(0, bank.lastNames.length - 1)] ?? 'Smith';
  return `${first.charAt(0)}. ${last}`;
}

function makeStaff(
  role: StaffRole,
  baseLevel: number,
  preferredStyle: PlayStyle,
  bank: NameBank,
  rng: Rng,
): StaffSeed {
  const dept = (bonus: number) => clamp(Math.round(baseLevel + bonus + gauss(rng) * 1.2), 1, 10);
  const specialty = (target: StaffRole, ratingBonus: number) =>
    role === target ? dept(ratingBonus) : dept(role === 'manager' ? 0.5 : -1);

  const ratingGk = specialty('gk_coach', 1.5);
  const ratingDef = specialty('def_coach', 1.5);
  const ratingMid = specialty('mid_coach', 1.5);
  const ratingAtt = specialty('att_coach', 1.5);
  const mean = (ratingGk + ratingDef + ratingMid + ratingAtt) / 4;

  const playstyleRatings = {} as Record<PlayStyle, number>;
  for (const style of PLAY_STYLES) {
    playstyleRatings[style] = clamp(Math.round(mean + gauss(rng) * 1.5), 1, 10);
  }
  if (role === 'manager') {
    playstyleRatings[preferredStyle] = clamp(playstyleRatings[preferredStyle] + 2, 1, 10);
  }

  return {
    name: pickName(bank, rng),
    role,
    ratingGk,
    ratingDef,
    ratingMid,
    ratingAtt,
    playstyleRatings,
    wage: coachWage(mean),
  };
}

/** Full core staff for one club, quality scaled by reputation. */
export function generateClubStaff(
  reputation: number,
  preferredStyle: PlayStyle,
  bank: NameBank,
  rng: Rng,
): StaffSeed[] {
  const baseLevel = reputation / 10;
  return CORE_STAFF_ROLES.map((role) => makeStaff(role, baseLevel, preferredStyle, bank, rng));
}

/** Free-agent coach pool for the hiring market, quality 1..10 spread. */
export function generateFreeAgentStaff(count: number, bank: NameBank, rng: Rng): StaffSeed[] {
  const seeds: StaffSeed[] = [];
  for (let i = 0; i < count; i++) {
    const role = CORE_STAFF_ROLES[i % CORE_STAFF_ROLES.length] ?? 'scout';
    const level = 1.5 + rng.nextFloat() * 7.5;
    const style = PLAY_STYLES[rng.nextInt(0, PLAY_STYLES.length - 1)] ?? 'balanced';
    seeds.push(makeStaff(role, level, style, bank, rng));
  }
  return seeds;
}
