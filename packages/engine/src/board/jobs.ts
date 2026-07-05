/**
 * Manager reputation + job market (§8 Phase 6): your reputation persists
 * across clubs, moves with board verdicts, and drives the offers you get
 * after a sacking — the career continues instead of ending.
 */

import { clamp } from '@footy/shared';
import type { BoardVerdict } from './board';
import { clubOf, type WorldClub, type WorldState } from '../world/types';

export function managerReputationOf(world: WorldState): number {
  return (
    world.managerReputation ??
    clamp(Math.round(30 + clubOf(world, world.userClubId).reputation * 0.35), 20, 80)
  );
}

const VERDICT_DELTA: Record<BoardVerdict['verdict'], number> = {
  exceeded: 4,
  met: 1,
  below: -2,
  sacked: -6,
};

export function applyVerdictToManagerReputation(
  world: WorldState,
  verdict: BoardVerdict,
): number {
  const updated = clamp(managerReputationOf(world) + VERDICT_DELTA[verdict.verdict], 5, 99);
  world.managerReputation = updated;
  return updated;
}

/** Clubs willing to hire you right now (best three within reach). */
export function jobOffersFor(world: WorldState): WorldClub[] {
  const reach = managerReputationOf(world) + 8;
  return world.clubs
    .filter((club) => club.id !== world.userClubId && club.reputation <= reach)
    .sort((a, b) => b.reputation - a.reputation || a.id - b.id)
    .slice(0, 3);
}

/** Take the job: the career continues at the new club. */
export function acceptJob(world: WorldState, clubId: number): void {
  const club = clubOf(world, clubId); // validates
  world.userClubId = club.id;
}
