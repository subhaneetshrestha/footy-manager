/**
 * The fixed simulation battery behind the CI determinism gate (contract §3.9).
 * Same seed → byte-identical output on every host. Do not change without
 * regenerating test/golden.json (pnpm --filter @footy/engine golden).
 */

import {
  createRng,
  deriveSeed,
  neutralTacticalProfile,
} from '@footy/shared';
import {
  fnv1a64,
  playerValue,
  simulateFastMatch,
  weeklyWage,
  type FastMatchTeam,
} from '../src/index';

const MASTER_SEED = 0x20260701;

export function prngGolden(): string {
  const rng = createRng(MASTER_SEED);
  const values: number[] = [];
  for (let i = 0; i < 64; i++) values.push(rng.nextUint32());
  for (let i = 0; i < 8; i++) values.push(rng.fork(i).nextUint32());
  return fnv1a64(values.join(','));
}

export function matchGolden(): string {
  const lines: string[] = [];
  let streamId = 0;
  for (let homeAtt = 50; homeAtt <= 90; homeAtt += 10) {
    for (let homeDef = 50; homeDef <= 90; homeDef += 10) {
      for (let awayAtt = 50; awayAtt <= 90; awayAtt += 20) {
        for (let awayDef = 50; awayDef <= 90; awayDef += 20) {
          for (let rep = 0; rep < 4; rep++) {
            const rng = createRng(deriveSeed(MASTER_SEED, streamId++));
            const home: FastMatchTeam = {
              attack: homeAtt,
              defence: homeDef,
              profile: neutralTacticalProfile(),
            };
            const away: FastMatchTeam = {
              attack: awayAtt,
              defence: awayDef,
              profile: neutralTacticalProfile(),
            };
            const score = simulateFastMatch(home, away, rng);
            lines.push(
              `${homeAtt},${homeDef},${awayAtt},${awayDef},${rep}:${score.homeGoals}-${score.awayGoals}`,
            );
          }
        }
      }
    }
  }
  return fnv1a64(lines.join(';'));
}

export function valuationGolden(): string {
  const lines: string[] = [];
  for (let ovr = 45; ovr <= 95; ovr += 10) {
    for (let age = 17; age <= 35; age += 6) {
      for (const pot of [ovr, Math.min(99, ovr + 15)]) {
        lines.push(
          String(
            playerValue({
              ovr,
              potential: pot,
              age,
              contractYearsLeft: 3,
              reputation: ovr,
              position: 'CM',
            }),
          ),
        );
        lines.push(String(weeklyWage(ovr, 70)));
      }
    }
  }
  return fnv1a64(lines.join(','));
}

export interface GoldenSnapshot {
  prng: string;
  match: string;
  valuation: string;
}

export function computeGolden(): GoldenSnapshot {
  return { prng: prngGolden(), match: matchGolden(), valuation: valuationGolden() };
}
