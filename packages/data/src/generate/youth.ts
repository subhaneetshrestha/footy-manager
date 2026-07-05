/**
 * Youth-intake generator (§15 Phase 5): identity + ratings for the yearly
 * academy intake. Quality scales with youth facilities, the youth coach and
 * club reputation — a well-run academy at a big club produces genuinely
 * better prospects. Injected into the engine's rollover (engine ← data).
 */

import {
  clubOf,
  leagueOf,
  meanStaffRating,
  playerValue,
  staffOf,
  type YouthIntakeCandidate,
  type YouthIntakeGenerator,
} from '@footy/engine';
import { clamp, computeOvr, type Position, type Rng } from '@footy/shared';
import { WORLD as CONFIG } from '../config/index';
import { generateRatings } from './players';

/** Position mix of a typical intake class. */
const INTAKE_POSITIONS: Position[] = [
  'GK', 'CB', 'CB', 'RB', 'LB', 'CDM', 'CM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST', 'ST',
];

function gauss(rng: Rng): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += rng.nextFloat();
  return sum - 6;
}

export function makeYouthIntakeGenerator(): YouthIntakeGenerator {
  return (world, clubId, rng) => {
    const club = clubOf(world, clubId);
    const league = leagueOf(world, club.leagueId);
    const nation = CONFIG.nations.find((n) => n.code === league.nation);
    const bank = CONFIG.nameBanks[nation?.nameBank ?? 'english'];

    const youthCoach = staffOf(world, clubId).find((s) => s.role === 'youth');
    const coachRating = youthCoach === undefined ? 0 : meanStaffRating(youthCoach);
    /** 0..1 — facilities weigh heaviest, then the youth coach, then stature. */
    const academyScore =
      0.5 * (club.youthFacilities / 20) +
      0.3 * (coachRating / 10) +
      0.2 * (club.reputation / 100);

    const count = 3 + rng.nextInt(0, 3);
    const candidates: YouthIntakeCandidate[] = [];
    for (let i = 0; i < count; i++) {
      const age = 16 + rng.nextInt(0, 2);
      const position = INTAKE_POSITIONS[rng.nextInt(0, INTAKE_POSITIONS.length - 1)] ?? 'CM';
      const gem = rng.nextFloat() < 0.02 ? 10 : 0; // the once-a-decade one
      let potential = clamp(Math.round(50 + 28 * academyScore + gauss(rng) * 8 + gem), 42, 97);
      const targetOvr = clamp(
        Math.round(potential - 16 - (18 - age) * 2 + gauss(rng) * 3),
        22,
        potential - 4,
      );
      const ratings = generateRatings(position, targetOvr, rng);
      const ovr = computeOvr(position, ratings);
      potential = Math.max(potential, ovr);

      const first = bank.firstNames[rng.nextInt(0, bank.firstNames.length - 1)] ?? 'Alex';
      const last = bank.lastNames[rng.nextInt(0, bank.lastNames.length - 1)] ?? 'Smith';

      candidates.push({
        name: `${first.charAt(0)}. ${last}`,
        age,
        position,
        secondaryPositions: [],
        ovr,
        potential,
        value: playerValue({
          ovr,
          potential,
          age,
          contractYearsLeft: 3,
          reputation: clamp(Math.round(0.9 * ovr + 0.3 * club.reputation - 20), 1, 99),
          position,
        }),
        wage: 300 + rng.nextInt(0, 8) * 50,
        contractYearsLeft: 3,
        form: 0,
        fitness: 100,
        morale: 70 + rng.nextInt(0, 10),
        injury: null,
        ratings,
      });
    }
    return candidates;
  };
}
