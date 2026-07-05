/**
 * Season advance loop (§6/§9): derive both sides' strengths + tactical
 * profiles from their available squads, run the Tier-B engine per fixture
 * with a per-fixture derived PRNG stream, sample injuries from the same
 * stream, and tick the world clock.
 */

import { createRng, deriveSeed } from '@footy/shared';
import { simulateFastMatch, type FastMatchTeam } from '../match/fastMatch';
import { simulateTierAMatch, type DetailedMatch } from '../match/tierA';
import { selectBestXi, teamStrength } from '../squad/strength';
import { computeTacticalProfile } from '../tactics/computeProfile';
import { clubOf, playerById, type Fixture, type WorldState } from '../world/types';
import { fixturesForMatchday, transferWindowFor } from './calendar';
import { runAiTransferWindowTick } from '../transfers/aiTransfers';
import { runAiLoanTick } from '../transfers/loans';
import { GROWTH_TICK_INTERVAL, growthTick } from '../growth/growth';
import {
  availableSquad,
  healTick,
  matchInjuryPass,
  trainingInjuryPass,
} from '../injury/injuries';

interface PreparedTeam {
  team: FastMatchTeam;
  xiPlayerIds: number[];
}

function prepareTeam(world: WorldState, clubId: number): PreparedTeam {
  const club = clubOf(world, clubId);
  let squad = availableSquad(world, clubId, world.currentMatchday);
  if (squad.length < 11) {
    // Injury crisis: field the walking wounded rather than forfeit.
    squad = club.playerIds.map((id) => playerById(world, id));
  }
  const xi = selectBestXi(squad, club.tactics.formation);
  const strength = teamStrength(xi);
  const profile = computeTacticalProfile(club.tactics.playStyle, xi);
  return {
    team: { attack: strength.attack, defence: strength.defence, profile },
    xiPlayerIds: xi.slots.map((s) => s.player.id),
  };
}

/** Availability-aware Tier-B input for a club (also used by UI previews). */
export function matchTeamFor(world: WorldState, clubId: number): FastMatchTeam {
  return prepareTeam(world, clubId).team;
}

export function isSeasonOver(world: WorldState): boolean {
  return world.currentMatchday > world.totalMatchdays;
}

/**
 * Play the next matchday across all leagues: heal, window business (buys +
 * loans), matches with injury exposure, training injuries, growth tick.
 * The user's fixture is resolved by the Tier-A detailed engine (§6); pass
 * onUserMatch to receive its pre-generated timeline for playback.
 */
export function playMatchday(
  world: WorldState,
  onUserMatch?: (detail: DetailedMatch) => void,
): Fixture[] {
  if (isSeasonOver(world)) return [];
  const matchday = world.currentMatchday;

  healTick(world, matchday);

  if (transferWindowFor(matchday, world.totalMatchdays) !== null) {
    runAiTransferWindowTick(world, matchday);
    runAiLoanTick(world, matchday);
  }

  const fixtures = fixturesForMatchday(world.fixtures, matchday);
  const playedIds = new Set<number>();
  for (const fixture of fixtures) {
    const home = prepareTeam(world, fixture.homeClubId);
    const away = prepareTeam(world, fixture.awayClubId);
    const rng = createRng(deriveSeed(world.seed, world.season, matchday, fixture.id));

    const isUserFixture =
      fixture.homeClubId === world.userClubId || fixture.awayClubId === world.userClubId;
    if (isUserFixture) {
      const detail = simulateTierAMatch(home.team, away.team, rng, {
        fixtureId: fixture.id,
        homeXi: home.xiPlayerIds,
        awayXi: away.xiPlayerIds,
      });
      fixture.homeGoals = detail.homeGoals;
      fixture.awayGoals = detail.awayGoals;
      onUserMatch?.(detail);
    } else {
      const score = simulateFastMatch(home.team, away.team, rng);
      fixture.homeGoals = score.homeGoals;
      fixture.awayGoals = score.awayGoals;
    }
    fixture.played = true;

    // Same stream, after the match draws: match-exposure injuries (§3.6).
    const participants = [...home.xiPlayerIds, ...away.xiPlayerIds];
    matchInjuryPass(world, matchday, participants, rng);
    for (const id of participants) playedIds.add(id);
  }

  trainingInjuryPass(
    world,
    matchday,
    playedIds,
    createRng(deriveSeed(world.seed, world.season, matchday, 0x12a1)),
  );

  if (matchday % GROWTH_TICK_INTERVAL === 0) {
    growthTick(world, matchday); // §5: development modulated by coaching (Phase 2)
  }

  world.currentMatchday++;
  return fixtures;
}

/** Simulate every remaining matchday of the season. */
export function simulateRestOfSeason(world: WorldState): void {
  while (!isSeasonOver(world)) playMatchday(world);
}
