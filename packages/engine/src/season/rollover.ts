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
import { clubOf, type WorldState } from '../world/types';

export function rolloverSeason(world: WorldState): void {
  for (const player of world.players) {
    player.age++;
    const clubRep = clubOf(world, player.clubId).reputation;
    player.value = playerValue({
      ovr: player.ovr,
      potential: player.potential,
      age: player.age,
      contractYearsLeft: 2,
      reputation: clamp(Math.round(0.9 * player.ovr + 0.3 * clubRep - 20), 1, 99),
      position: player.position,
    });
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
