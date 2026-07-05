/**
 * Minimal season rollover (§9 MVP slice): ages tick, values refresh through
 * THE valuation function, and fresh fixtures are generated. Development and
 * decline happen through in-season growth ticks (growth/growth.ts), so OVR
 * always stays consistent with the attribute ratings. Regens/intakes arrive
 * in Phase 5; promotion/relegation with multi-league careers.
 */

import { clamp } from '@footy/shared';
import { playerValue } from '../finance/valuation';
import { generateLeagueFixtures } from './calendar';
import { processContractsAtRollover } from '../transfers/contracts';
import { processLoansAtRollover } from '../transfers/loans';
import { clubOf, type WorldState } from '../world/types';

export function rolloverSeason(world: WorldState): void {
  processLoansAtRollover(world); // returns/options first — parents get players back
  processContractsAtRollover(world); // then contracts tick, renew or release

  for (const player of world.players) {
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

  world.fixtures = [];
  for (const league of world.leagues) {
    world.fixtures.push(
      ...generateLeagueFixtures(league.id, league.clubIds, world.fixtures.length + 1),
    );
  }

  world.season++;
  world.currentMatchday = 1;
}
