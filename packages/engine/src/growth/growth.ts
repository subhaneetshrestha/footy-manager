/**
 * Player development ticks (§5 + Phase-2 gate): every GROWTH_TICK_INTERVAL
 * matchdays, players gain attribute points toward their potential ceiling at
 * a rate driven by department-coach quality, the manager's fit with the
 * club's play style, training facilities, playing time and morale. Age 31+
 * declines instead (softened by the fitness coach).
 *
 * OVR is always recomputed from ratings via the canonical coefficients —
 * ratings stay the single source of truth (contract §3.2).
 */

import {
  OVR_COEFFICIENTS,
  PHYSICAL_ATTRIBUTES,
  POSITION_GROUPS,
  clamp,
  computeOvr,
  createRng,
  deriveSeed,
  type Attribute,
  type PositionGroup,
  type Rng,
} from '@footy/shared';
import { availableSquad } from '../injury/injuries';
import { selectBestXi } from '../squad/strength';
import { staffOf } from '../staff/hiring';
import {
  playerById,
  type WorldClub,
  type WorldPlayer,
  type WorldState,
} from '../world/types';

export const GROWTH_TICK_INTERVAL = 4; // matchdays ≈ monthly

/** Development points per tick by age (before modifiers). Negative = decline. */
export function basePointsFor(age: number): number {
  if (age <= 19) return 1.1;
  if (age <= 21) return 0.9;
  if (age <= 24) return 0.55;
  if (age <= 28) return 0.25;
  if (age <= 30) return 0;
  if (age <= 33) return -0.35;
  return -0.7;
}

function deptRatingFor(world: WorldState, club: WorldClub, group: PositionGroup): number {
  const staff = staffOf(world, club.id);
  for (const member of staff) {
    if (group === 'goalkeeper' && member.role === 'gk_coach') return member.ratingGk;
    if (group === 'defence' && member.role === 'def_coach') return member.ratingDef;
    if (group === 'midfield' && member.role === 'mid_coach') return member.ratingMid;
    if (group === 'attack' && member.role === 'att_coach') return member.ratingAtt;
  }
  return 0;
}

/** Academy players train under the youth coach when that's the better option. */
function youthCoachRating(world: WorldState, club: WorldClub): number {
  const coach = staffOf(world, club.id).find((s) => s.role === 'youth');
  if (coach === undefined) return 0;
  return (coach.ratingGk + coach.ratingDef + coach.ratingMid + coach.ratingAtt) / 4;
}

function managerStyleRating(world: WorldState, club: WorldClub): number {
  const manager = staffOf(world, club.id).find((s) => s.role === 'manager');
  return manager?.playstyleRatings[club.tactics.playStyle] ?? 0;
}

function fitnessRating(world: WorldState, club: WorldClub): number {
  const coach = staffOf(world, club.id).find((s) => s.role === 'fitness');
  return coach === undefined ? 0 : (coach.ratingGk + coach.ratingDef + coach.ratingMid + coach.ratingAtt) / 4;
}

/** Stochastic rounding: 1.4 points → 1 or 2, expectation preserved. */
function pointsToBumps(points: number, rng: Rng): number {
  const whole = Math.floor(points);
  return whole + (rng.nextFloat() < points - whole ? 1 : 0);
}

function growableAttributesFor(player: WorldPlayer): Attribute[] {
  return Object.keys(OVR_COEFFICIENTS[player.position]) as Attribute[];
}

function applyGrowth(player: WorldPlayer, bumps: number, rng: Rng): void {
  const pool = growableAttributesFor(player);
  for (let i = 0; i < bumps; i++) {
    const attr = pool[rng.nextInt(0, pool.length - 1)];
    if (attr === undefined) return;
    const current = player.ratings[attr] ?? 0;
    if (current >= 99) continue;
    player.ratings[attr] = current + 1;
    const newOvr = computeOvr(player.position, player.ratings);
    if (newOvr > player.potential) {
      player.ratings[attr] = current; // ceiling reached (POT >= OVR always)
      return;
    }
    player.ovr = newOvr;
  }
}

function applyDecline(player: WorldPlayer, bumps: number, rng: Rng): void {
  for (let i = 0; i < bumps; i++) {
    const attr = PHYSICAL_ATTRIBUTES[rng.nextInt(0, PHYSICAL_ATTRIBUTES.length - 1)];
    if (attr === undefined) return;
    const current = player.ratings[attr] ?? 0;
    if (current <= 20) continue;
    player.ratings[attr] = current - 1;
  }
  player.ovr = computeOvr(player.position, player.ratings);
  player.potential = Math.max(player.potential, player.ovr);
}

export interface GrowthFactors {
  coach: number;
  style: number;
  facilities: number;
  minutes: number;
  morale: number;
}

export function growthFactorsFor(
  world: WorldState,
  club: WorldClub,
  player: WorldPlayer,
  inXi: boolean,
): GrowthFactors {
  const deptRating = deptRatingFor(world, club, POSITION_GROUPS[player.position]);
  const coachRating =
    player.age <= 18 ? Math.max(deptRating, youthCoachRating(world, club)) : deptRating;
  return {
    coach: 0.6 + 0.05 * coachRating,
    style: 0.85 + 0.03 * managerStyleRating(world, club),
    facilities: 0.8 + 0.02 * clamp(club.trainingFacilities, 1, 20),
    minutes: inXi ? 1.05 : 0.95,
    morale: 0.85 + player.morale * 0.002,
  };
}

/** Run one development tick across every club in the world. Deterministic. */
export function growthTick(world: WorldState, matchday: number): void {
  const rng = createRng(deriveSeed(world.seed, world.season, matchday, 0x6407));

  for (const club of world.clubs) {
    const squad = club.playerIds.map((id) => playerById(world, id));
    let xiIds: Set<number>;
    try {
      const fit = availableSquad(world, club.id, matchday);
      xiIds = new Set(
        selectBestXi(fit.length >= 11 ? fit : squad, club.tactics.formation).slots.map(
          (s) => s.player.id,
        ),
      );
    } catch {
      xiIds = new Set();
    }

    for (const player of squad) {
      if (player.injury !== null) continue; // rehab, not training
      const base = basePointsFor(player.age);
      if (base === 0) continue;

      if (base < 0) {
        const soften = 1.1 - 0.03 * fitnessRating(world, club); // 0.8..1.1
        applyDecline(player, pointsToBumps(-base * soften, rng), rng);
        continue;
      }

      if (player.ovr >= player.potential) continue;
      const f = growthFactorsFor(world, club, player, xiIds.has(player.id));
      const points = base * f.coach * f.style * f.facilities * f.minutes * f.morale;
      applyGrowth(player, pointsToBumps(points, rng), rng);
    }
  }
}
