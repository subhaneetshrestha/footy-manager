/**
 * Calendar / competition subsystem (§9) — MVP scope: double round-robin
 * league fixtures (Berger circle method), matchday-indexed transfer windows,
 * and the season-frame arithmetic everything else consumes.
 */

import type { Fixture } from '../world/types';
import type { TransferWindow } from '@footy/shared';

/**
 * Double round-robin for an even club count: every pair meets twice (once per
 * venue), every club plays exactly once per matchday. Deterministic.
 */
export function generateLeagueFixtures(
  leagueId: number,
  clubIds: number[],
  firstFixtureId: number,
): Fixture[] {
  const n = clubIds.length;
  if (n < 2 || n % 2 !== 0) throw new Error(`league ${leagueId}: club count ${n} must be even`);

  const rounds = n - 1;
  const half = n / 2;
  const fixtures: Fixture[] = [];
  let fixtureId = firstFixtureId;

  // Circle method: pivot fixed, the rest rotate each round.
  const rotating = clubIds.slice(1);
  const pivot = clubIds[0]!;

  for (let round = 0; round < rounds; round++) {
    const pairs: [number, number][] = [];
    // Pivot pairing alternates venue so the pivot isn't always at home.
    const opponent = rotating[rotating.length - 1]!;
    pairs.push(round % 2 === 0 ? [pivot, opponent] : [opponent, pivot]);
    for (let i = 0; i < half - 1; i++) {
      const a = rotating[i]!;
      const b = rotating[rotating.length - 2 - i]!;
      pairs.push((round + i) % 2 === 0 ? [a, b] : [b, a]);
    }

    for (const [home, away] of pairs) {
      fixtures.push({
        id: fixtureId++,
        leagueId,
        matchday: round + 1,
        homeClubId: home,
        awayClubId: away,
        played: false,
        homeGoals: 0,
        awayGoals: 0,
      });
    }

    rotating.unshift(rotating.pop()!);
  }

  // Second half of the season mirrors the first with venues swapped.
  const firstHalfCount = fixtures.length;
  for (let i = 0; i < firstHalfCount; i++) {
    const f = fixtures[i]!;
    fixtures.push({
      id: fixtureId++,
      leagueId,
      matchday: f.matchday + rounds,
      homeClubId: f.awayClubId,
      awayClubId: f.homeClubId,
      played: false,
      homeGoals: 0,
      awayGoals: 0,
    });
  }

  return fixtures;
}

export function totalMatchdaysFor(clubCount: number): number {
  return (clubCount - 1) * 2;
}

/**
 * Transfer-window state by matchday (MVP: matchday-indexed frame).
 * Summer: up to and including matchday 3. Winter: 3 matchdays after halfway.
 */
export function transferWindowFor(
  matchday: number,
  totalMatchdays: number,
): TransferWindow | null {
  if (matchday <= 3) return 'summer';
  const mid = Math.floor(totalMatchdays / 2);
  if (matchday > mid && matchday <= mid + 3) return 'winter';
  return null;
}

export function fixturesForMatchday(fixtures: Fixture[], matchday: number): Fixture[] {
  return fixtures.filter((f) => f.matchday === matchday);
}
