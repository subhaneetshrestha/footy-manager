/**
 * Academy & regens (§5/§15 Phase 5): yearly youth intakes keep the world
 * populated across an infinite career; veterans retire; oversized squads
 * shed surplus seniors. The ENGINE owns these mechanics; the identity/rating
 * generation is injected (the data package provides it — name banks live
 * there), so the dependency direction stays engine ← data.
 */

import { createRng, deriveSeed, type Rng } from '@footy/shared';
import { clubOf, playerById, type WorldPlayer, type WorldState } from '../world/types';

/** Everything a new academy prospect needs except its world identity. */
export type YouthIntakeCandidate = Omit<WorldPlayer, 'id' | 'clubId'>;

/** Provided by the data package (or tests); must be deterministic in rng. */
export type YouthIntakeGenerator = (
  world: WorldState,
  clubId: number,
  rng: Rng,
) => YouthIntakeCandidate[];

export interface RolloverSummary {
  retiredCount: number;
  releasedCount: number;
  intakeCount: number;
  /** The user club's new academy prospects (for the intake news card). */
  userIntake: WorldPlayer[];
}

/** P(retire) AFTER the rollover age increment. */
function retirementProbability(player: WorldPlayer): number {
  const effectiveAge = player.position === 'GK' ? player.age - 1 : player.age;
  if (effectiveAge >= 39) return 1;
  if (effectiveAge >= 38) return 0.9;
  if (effectiveAge >= 37) return 0.75;
  if (effectiveAge >= 36) return 0.55;
  if (effectiveAge >= 35) return 0.35;
  if (effectiveAge >= 34) return 0.18;
  return 0;
}

/** Mark retirements and pull them out of their squads. */
export function applyRetirements(world: WorldState, rng: Rng): number {
  let retired = 0;
  for (const player of world.players) {
    if (player.retired === true || player.clubId === 0) continue;
    if (rng.nextFloat() >= retirementProbability(player)) continue;
    const club = clubOf(world, player.clubId);
    club.playerIds = club.playerIds.filter((id) => id !== player.id);
    player.clubId = 0;
    player.retired = true;
    player.contractYearsLeft = 0;
    player.value = 0;
    player.wage = 0;
    player.injury = null;
    retired++;
  }
  return retired;
}

/** Append this season's academy intakes (append-only: the id invariant holds). */
export function applyYouthIntake(
  world: WorldState,
  generate: YouthIntakeGenerator,
  rng: Rng,
): { intakeCount: number; userIntake: WorldPlayer[] } {
  let intakeCount = 0;
  const userIntake: WorldPlayer[] = [];
  for (const club of world.clubs) {
    const clubRng = createRng(deriveSeed(world.seed, world.season, 0xacad, club.id));
    for (const candidate of generate(world, club.id, clubRng)) {
      if (club.playerIds.length >= 34) break;
      const player: WorldPlayer = { ...candidate, id: world.players.length + 1, clubId: club.id };
      world.players.push(player);
      club.playerIds.push(player.id);
      intakeCount++;
      if (club.id === world.userClubId) userIntake.push(player);
    }
  }
  // rng reserved for future league-wide intake events; per-club streams above.
  void rng;
  return { intakeCount, userIntake };
}

/** Oversized squads release surplus seniors to free agency (never the kids). */
export function pruneOversizedSquads(world: WorldState, maxSize = 32): number {
  let released = 0;
  for (const club of world.clubs) {
    while (club.playerIds.length > maxSize) {
      const candidates = club.playerIds
        .map((id) => playerById(world, id))
        .filter((p) => p.age >= 22)
        .sort((a, b) => a.value - b.value || a.id - b.id);
      const drop = candidates[0];
      if (drop === undefined) break;
      club.playerIds = club.playerIds.filter((id) => id !== drop.id);
      drop.clubId = 0;
      drop.contractYearsLeft = 0;
      released++;
    }
  }
  return released;
}
