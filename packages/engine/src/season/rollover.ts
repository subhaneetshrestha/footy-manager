/**
 * Minimal season rollover (§9 MVP slice): ages tick, values refresh through
 * THE valuation function, and fresh fixtures are generated. Development and
 * decline happen through in-season growth ticks (growth/growth.ts), so OVR
 * always stays consistent with the attribute ratings. Regens/intakes arrive
 * in Phase 5; promotion/relegation with multi-league careers.
 */

import { clamp, createRng, deriveSeed } from '@footy/shared';
import { computeSeasonBooks } from '../finance/economy';
import { playerValue } from '../finance/valuation';
import { generateLeagueFixtures } from './calendar';
import { processContractsAtRollover } from '../transfers/contracts';
import { processLoansAtRollover } from '../transfers/loans';
import {
  applyRetirements,
  applyYouthIntake,
  pruneOversizedSquads,
  type RolloverSummary,
  type YouthIntakeGenerator,
} from '../youth/academy';
import { clubOf, type WorldState } from '../world/types';

export interface RolloverOptions {
  /** Academy intake generator (§15 Phase 5); no intakes when omitted. */
  youthIntake?: YouthIntakeGenerator;
}

export function rolloverSeason(
  world: WorldState,
  options: RolloverOptions = {},
): RolloverSummary {
  processLoansAtRollover(world); // returns/options first — parents get players back
  computeSeasonBooks(world); // books off the final table, budgets re-derived (§8)
  processContractsAtRollover(world); // then contracts tick, renew or release

  for (const player of world.players) {
    if (player.retired === true) continue;
    player.age++;
    const clubRep = player.clubId === 0 ? 30 : clubOf(world, player.clubId).reputation;
    player.value = playerValue({
      ovr: player.ovr,
      potential: player.potential,
      age: player.age,
      contractYearsLeft: player.contractYearsLeft,
      reputation: clamp(Math.round(0.9 * player.ovr + 0.3 * clubRep - 20), 1, 99),
      position: player.position,
    });

    if (player.injury !== null) {
      const remaining = player.injury.returnMatchday - world.totalMatchdays;
      if (remaining <= 1) player.injury = null;
      else player.injury.returnMatchday = remaining;
    }
  }

  // Academy cycle (§15 Phase 5): veterans out, prospects in, squads trimmed.
  const academyRng = createRng(deriveSeed(world.seed, world.season, 0x2e71));
  const retiredCount = applyRetirements(world, academyRng);
  const intake =
    options.youthIntake !== undefined
      ? applyYouthIntake(world, options.youthIntake, academyRng)
      : { intakeCount: 0, userIntake: [] };
  const releasedCount = pruneOversizedSquads(world);

  world.fixtures = [];
  for (const league of world.leagues) {
    world.fixtures.push(
      ...generateLeagueFixtures(league.id, league.clubIds, world.fixtures.length + 1),
    );
  }

  world.season++;
  world.currentMatchday = 1;

  return {
    retiredCount,
    releasedCount,
    intakeCount: intake.intakeCount,
    userIntake: intake.userIntake,
  };
}
