/**
 * Season advance loop (§6/§9): derive both sides' strengths + tactical
 * profiles from their current squads, run the Tier-B engine per fixture with
 * a per-fixture derived PRNG stream, and tick the world clock.
 */

import { createRng, deriveSeed } from '@footy/shared';
import { simulateFastMatch, type FastMatchTeam } from '../match/fastMatch';
import { selectBestXi, teamStrength } from '../squad/strength';
import { computeTacticalProfile } from '../tactics/computeProfile';
import { clubOf, playerById, type Fixture, type WorldState } from '../world/types';
import { fixturesForMatchday, transferWindowFor } from './calendar';
import { runAiTransferWindowTick } from '../transfers/aiTransfers';

/** Build the Tier-B input for a club from its live squad + tactics. */
export function matchTeamFor(world: WorldState, clubId: number): FastMatchTeam {
  const club = clubOf(world, clubId);
  const squad = club.playerIds.map((id) => playerById(world, id));
  const xi = selectBestXi(squad, club.tactics.formation);
  const strength = teamStrength(xi);
  const profile = computeTacticalProfile(club.tactics.playStyle, xi);
  return { attack: strength.attack, defence: strength.defence, profile };
}

export function isSeasonOver(world: WorldState): boolean {
  return world.currentMatchday > world.totalMatchdays;
}

/**
 * Play the next matchday across all leagues in the world. Runs AI transfer
 * activity first when a window is open. Returns the played fixtures.
 */
export function playMatchday(world: WorldState): Fixture[] {
  if (isSeasonOver(world)) return [];
  const matchday = world.currentMatchday;

  if (transferWindowFor(matchday, world.totalMatchdays) !== null) {
    runAiTransferWindowTick(world, matchday);
  }

  const fixtures = fixturesForMatchday(world.fixtures, matchday);
  for (const fixture of fixtures) {
    const home = matchTeamFor(world, fixture.homeClubId);
    const away = matchTeamFor(world, fixture.awayClubId);
    const rng = createRng(deriveSeed(world.seed, world.season, matchday, fixture.id));
    const score = simulateFastMatch(home, away, rng);
    fixture.homeGoals = score.homeGoals;
    fixture.awayGoals = score.awayGoals;
    fixture.played = true;
  }

  world.currentMatchday++;
  return fixtures;
}

/** Simulate every remaining matchday of the season. */
export function simulateRestOfSeason(world: WorldState): void {
  while (!isSeasonOver(world)) playMatchday(world);
}
