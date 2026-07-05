/**
 * Minimal board (§8, requirement #12 — an MVP acceptance criterion).
 * Season targets scale with club reputation rank inside the league; sacking
 * probability rises only beyond a tolerance band around the target, so
 * near-misses are treated leniently.
 */

import { clamp, createRng, deriveSeed } from '@footy/shared';
import { leagueTable, tablePositionOf } from '../season/table';
import { clubOf, leagueOf, type WorldState } from '../world/types';

export interface BoardExpectation {
  targetPosition: number;
  label: string;
}

/** Reputation rank of a club within its league (1 = biggest club). */
function reputationRank(world: WorldState, clubId: number): { rank: number; size: number } {
  const club = clubOf(world, clubId);
  const league = leagueOf(world, club.leagueId);
  const ranked = league.clubIds
    .map((id) => clubOf(world, id))
    .sort((a, b) => b.reputation - a.reputation || a.id - b.id);
  return { rank: ranked.findIndex((c) => c.id === clubId) + 1, size: ranked.length };
}

export function seasonTarget(world: WorldState, clubId: number): BoardExpectation {
  const club = clubOf(world, clubId);
  const league = leagueOf(world, club.leagueId);
  const { rank, size } = reputationRank(world, clubId);
  const continental = Math.max(2, Math.ceil(size * 0.2));

  if (rank === 1 && club.reputation >= 85) {
    return { targetPosition: 1, label: 'Win the title' };
  }
  if (rank <= 2) {
    return { targetPosition: 2, label: 'Challenge for the title' };
  }
  if (rank <= continental) {
    return { targetPosition: continental, label: 'Qualify for continental football' };
  }
  if (rank <= Math.ceil(size / 2)) {
    return { targetPosition: Math.ceil(size / 2), label: 'Finish in the top half' };
  }
  const safety = size - Math.max(1, league.relegationSlots);
  return { targetPosition: safety, label: 'Avoid relegation' };
}

export interface BoardVerdict {
  targetPosition: number;
  targetLabel: string;
  actualPosition: number;
  /** actual − target; positive = underperformed. */
  gap: number;
  sackProbability: number;
  verdict: 'exceeded' | 'met' | 'below' | 'sacked';
  message: string;
}

/** Leniency band (§8): no sacking risk within `tolerance` of the target. */
const TOLERANCE = 3;
const SACK_SCALE = 6;

export function endOfSeasonVerdict(world: WorldState, clubId: number): BoardVerdict {
  const expectation = seasonTarget(world, clubId);
  const actualPosition = tablePositionOf(world, clubId);
  const gap = actualPosition - expectation.targetPosition;
  const sackProbability = clamp((gap - TOLERANCE) / SACK_SCALE, 0, 1);

  const rng = createRng(deriveSeed(world.seed, world.season, 0xb0a2d, clubId));
  const sacked = sackProbability > 0 && rng.nextFloat() < sackProbability;

  let verdict: BoardVerdict['verdict'];
  let message: string;
  if (sacked) {
    verdict = 'sacked';
    message = `Finishing ${ordinal(actualPosition)} against a target of ${ordinal(expectation.targetPosition)} was too much for the board — you have been dismissed.`;
  } else if (gap <= -3) {
    verdict = 'exceeded';
    message = `Outstanding: ${ordinal(actualPosition)} smashed the board's target of ${ordinal(expectation.targetPosition)}.`;
  } else if (gap <= TOLERANCE) {
    verdict = 'met';
    message = `The board is satisfied: ${ordinal(actualPosition)} against a target of ${ordinal(expectation.targetPosition)}.`;
  } else {
    verdict = 'below';
    message = `Below expectations: ${ordinal(actualPosition)} against a target of ${ordinal(expectation.targetPosition)}. The board expects better next season.`;
  }

  return {
    targetPosition: expectation.targetPosition,
    targetLabel: expectation.label,
    actualPosition,
    gap,
    sackProbability,
    verdict,
    message,
  };
}

/** Champion + relegated clubs for a league (season summary). */
export function leagueOutcome(world: WorldState, leagueId: number) {
  const table = leagueTable(world, leagueId);
  const league = leagueOf(world, leagueId);
  return {
    championClubId: table[0]?.clubId ?? 0,
    relegatedClubIds:
      league.relegationSlots > 0 ? table.slice(-league.relegationSlots).map((r) => r.clubId) : [],
  };
}

function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}
