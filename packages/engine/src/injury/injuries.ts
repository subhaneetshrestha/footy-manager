/**
 * THE Injury module — single owner (contract §3.6). Samples injuries from an
 * exposure model (match exposure for the XI, training exposure otherwise),
 * modulated by hidden injury_proneness and the club physio; durations follow
 * the Fuller tiers (§8). Data only stores; the engine only asks availability.
 *
 * Incidence rates are parameterized calibration targets (RESEARCH.md notes
 * frequency is under-evidenced). Tier-A's per-minute hazard replaces the
 * per-match exposure constant in Phase 4 without changing this module's API.
 */

import {
  INJURY_TIERS,
  INJURY_TIER_DAYS,
  clamp,
  type InjuryTier,
  type Rng,
} from '@footy/shared';
import { staffOf } from '../staff/hiring';
import {
  clubOf,
  playerById,
  type WorldClub,
  type WorldPlayer,
  type WorldState,
} from '../world/types';

/** P(injury) per XI player per match, before modifiers (≈ 90min exposure). */
export const MATCH_INJURY_PROB = 0.018;
/** P(injury) per non-playing player per matchday (training exposure). */
export const TRAINING_INJURY_PROB = 0.0035;

/** Tier mix, worst-case last (career-ending is deliberately rare). */
const TIER_CUMULATIVE: readonly [InjuryTier, number][] = [
  ['minimal', 0.35],
  ['mild', 0.65],
  ['moderate', 0.9],
  ['severe', 0.995],
  ['career_ending', 1],
];

const INJURY_TYPES: Record<InjuryTier, readonly string[]> = {
  minimal: ['knock', 'bruised ankle', 'tight calf', 'dead leg'],
  mild: ['strained thigh', 'twisted ankle', 'back spasm', 'gashed shin'],
  moderate: ['hamstring strain', 'groin pull', 'sprained knee', 'torn calf'],
  severe: ['torn hamstring', 'ruptured ligaments', 'broken leg', 'ACL damage'],
  career_ending: ['catastrophic knee injury'],
};

export function sampleTier(rng: Rng): InjuryTier {
  const u = rng.nextFloat();
  for (const [tier, cumulative] of TIER_CUMULATIVE) {
    if (u < cumulative) return tier;
  }
  return 'severe';
}

/** Duration in days within the Fuller band; severe skews toward the low end. */
export function sampleDurationDays(tier: InjuryTier, rng: Rng): number {
  if (tier === 'career_ending') return 999;
  const { minDays, maxDays } = INJURY_TIER_DAYS[tier];
  const span = maxDays - minDays + 1;
  const u = rng.nextFloat();
  const skewed = tier === 'severe' ? u * u : u;
  return minDays + Math.floor(skewed * span);
}

function physioRating(world: WorldState, club: WorldClub): number {
  const physio = staffOf(world, club.id).find((s) => s.role === 'physio');
  if (physio === undefined) return 0;
  return (physio.ratingGk + physio.ratingDef + physio.ratingMid + physio.ratingAtt) / 4;
}

/** Proneness 0-99 → hazard multiplier ≈ [0.6, 1.4]. */
function pronenessFactor(player: WorldPlayer): number {
  return 0.6 + ((player.ratings.injury_proneness ?? 50) / 99) * 0.8;
}

/** Physio prevention: incidence multiplier ≈ [0.8, 1.05]. */
export function incidenceModifier(physio: number): number {
  return clamp(1.05 - 0.025 * physio, 0.7, 1.1);
}

/** Physio recovery: duration multiplier ≈ [0.75, 1.05]. */
export function durationModifier(physio: number): number {
  return clamp(1.05 - 0.03 * physio, 0.7, 1.1);
}

export function daysToMatchdays(days: number): number {
  return Math.ceil(days / 7);
}

/**
 * Roll one exposure for one player; applies and logs the injury when it hits.
 */
export function rollInjury(
  world: WorldState,
  player: WorldPlayer,
  matchday: number,
  baseProb: number,
  rng: Rng,
): boolean {
  if (player.injury !== null) return false;
  if (player.clubId === 0) return false; // free agents don't train with a club
  const club = clubOf(world, player.clubId);
  const physio = physioRating(world, club);
  const probability = baseProb * pronenessFactor(player) * incidenceModifier(physio);
  if (rng.nextFloat() >= probability) return false;

  const tier = sampleTier(rng);
  const rawDays = sampleDurationDays(tier, rng);
  const days = Math.max(1, Math.round(rawDays * durationModifier(physio)));
  const types = INJURY_TYPES[tier];
  const type = types[rng.nextInt(0, types.length - 1)] ?? 'knock';

  player.injury = {
    tier,
    type,
    daysTotal: days,
    returnMatchday: matchday + daysToMatchdays(days),
  };
  world.injuries.push({
    playerId: player.id,
    clubId: player.clubId,
    season: world.season,
    matchday,
    tier,
    type,
    days,
  });
  return true;
}

export function isAvailable(player: WorldPlayer, matchday: number): boolean {
  return player.injury === null || player.injury.returnMatchday <= matchday;
}

/** Fit players of a club for the given matchday. */
export function availableSquad(
  world: WorldState,
  clubId: number,
  matchday: number,
): WorldPlayer[] {
  return clubOf(world, clubId)
    .playerIds.map((id) => playerById(world, id))
    .filter((p) => isAvailable(p, matchday));
}

/** Clear healed injuries at the start of a matchday. */
export function healTick(world: WorldState, matchday: number): void {
  for (const player of world.players) {
    if (player.injury !== null && player.injury.returnMatchday <= matchday) {
      player.injury = null;
    }
  }
}

/** Match exposure for everyone who played this matchday. */
export function matchInjuryPass(
  world: WorldState,
  matchday: number,
  playedPlayerIds: number[],
  rng: Rng,
): void {
  for (const id of playedPlayerIds) {
    rollInjury(world, playerById(world, id), matchday, MATCH_INJURY_PROB, rng);
  }
}

/** Training exposure for fit players who did not play. */
export function trainingInjuryPass(
  world: WorldState,
  matchday: number,
  playedPlayerIds: Set<number>,
  rng: Rng,
): void {
  for (const player of world.players) {
    if (player.clubId === 0 || player.retired === true) continue;
    if (playedPlayerIds.has(player.id)) continue;
    rollInjury(world, player, matchday, TRAINING_INJURY_PROB, rng);
  }
}
