/**
 * Minimal season rollover (§9 MVP slice): ages tick, simple growth toward
 * potential / age decline, values refresh through THE valuation function, and
 * fresh fixtures are generated. Regens/intakes arrive in Phase 5; promotion/
 * relegation processing arrives with multi-league careers.
 */

import { clamp, createRng, deriveSeed } from '@footy/shared';
import { playerValue } from '../finance/valuation';
import { generateLeagueFixtures } from './calendar';
import { clubOf, type WorldState } from '../world/types';

export function rolloverSeason(world: WorldState): void {
  const rng = createRng(deriveSeed(world.seed, world.season, 0x5011));

  for (const player of world.players) {
    player.age++;
    if (player.age <= 24 && player.ovr < player.potential) {
      player.ovr = Math.min(player.potential, player.ovr + rng.nextInt(1, 3));
    } else if (player.age >= 31) {
      player.ovr = Math.max(30, player.ovr - rng.nextInt(1, 3));
      player.potential = Math.max(player.potential, player.ovr);
    }
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
