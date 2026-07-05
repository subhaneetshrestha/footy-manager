/**
 * Tier-A detailed match engine (§6): generates the COMPLETE deterministic
 * event timeline up front; the UI only plays it back (sim and render never
 * compete for the frame). Consumes the same TeamTacticalProfile and the same
 * expectedGoalRates as Tier B, so the two engines agree in expectation by
 * construction — a standing statistical parity test enforces it (§6 Parity).
 *
 * Coordinates: x,y ∈ [0,1]; home attacks toward x = 1. All randomness comes
 * from the injected PRNG (contract §3.9).
 */

import { clamp, type Rng } from '@footy/shared';
import { expectedGoalRates, type FastMatchTeam } from './fastMatch';

export type MatchSide = 'home' | 'away';

export type MatchEventType =
  | 'kickoff'
  | 'pass'
  | 'carry'
  | 'shot'
  | 'goal'
  | 'save'
  | 'miss'
  | 'card_yellow'
  | 'card_red'
  | 'half_time'
  | 'full_time';

export interface MatchEvent {
  /** Game minute (1..90+); markers use the boundary minute. */
  minute: number;
  type: MatchEventType;
  /** Acting team. */
  side: MatchSide;
  x: number;
  y: number;
  /** Player id when XIs were provided. */
  actorId?: number;
  /** Shot quality for shot/goal/save/miss events. */
  xg?: number;
}

export interface MatchStats {
  possessionHome: number; // percent, possessionAway = 100 - this
  shotsHome: number;
  shotsAway: number;
  onTargetHome: number;
  onTargetAway: number;
  xgHome: number;
  xgAway: number;
  cardsHome: number;
  cardsAway: number;
}

export interface DetailedMatch {
  fixtureId: number;
  events: MatchEvent[];
  homeGoals: number;
  awayGoals: number;
  stats: MatchStats;
}

export interface TierAOptions {
  fixtureId?: number;
  /** XI player ids in formation-slot order (GK first) for actor attribution. */
  homeXi?: number[];
  awayXi?: number[];
}

/** Mean sampled xG per shot; the shot-rate calibration divides by this. */
const MEAN_XG = 0.12;

/** xG per shot: 0.02 + u³·0.4 has mean exactly 0.02 + 0.4/4 = MEAN_XG. */
function sampleXg(rng: Rng, chanceQualityMod: number): number {
  const u = rng.nextFloat();
  return clamp((0.02 + u * u * u * 0.4) * chanceQualityMod, 0.01, 0.85);
}

function pickActor(xi: number[] | undefined, rng: Rng, zone: 'attack' | 'defence' | 'any'): number | undefined {
  if (xi === undefined || xi.length < 11) return undefined;
  if (zone === 'attack') return xi[rng.nextInt(5, xi.length - 1)];
  if (zone === 'defence') return xi[rng.nextInt(1, 5)];
  return xi[rng.nextInt(1, xi.length - 1)];
}

export function simulateTierAMatch(
  home: FastMatchTeam,
  away: FastMatchTeam,
  rng: Rng,
  options: TierAOptions = {},
): DetailedMatch {
  const { lambdaHome, lambdaAway } = expectedGoalRates(home, away);

  // Relative possession from the two profiles' neutral-opponent shares.
  const rawHome = home.profile.possessionShare;
  const rawAway = away.profile.possessionShare;
  const possHome = clamp(rawHome / (rawHome + rawAway), 0.25, 0.75);

  // Shot-per-possessed-minute rates calibrated so E[goals] = λ exactly,
  // independent of possession share and chance quality (parity!).
  const shotProbHome = clamp(
    lambdaHome / (90 * MEAN_XG * home.profile.chanceQualityMod) / possHome,
    0,
    0.9,
  );
  const shotProbAway = clamp(
    lambdaAway / (90 * MEAN_XG * away.profile.chanceQualityMod) / (1 - possHome),
    0,
    0.9,
  );

  const events: MatchEvent[] = [];
  const stats: MatchStats = {
    possessionHome: 0,
    shotsHome: 0,
    shotsAway: 0,
    onTargetHome: 0,
    onTargetAway: 0,
    xgHome: 0,
    xgAway: 0,
    cardsHome: 0,
    cardsAway: 0,
  };
  let homeGoals = 0;
  let awayGoals = 0;
  let possMinutesHome = 0;
  let ballX = 0.5;
  let ballY = 0.5;

  events.push({ minute: 1, type: 'kickoff', side: 'home', x: 0.5, y: 0.5 });

  for (let minute = 1; minute <= 90; minute++) {
    if (minute === 46) {
      events.push({ minute: 45, type: 'half_time', side: 'home', x: 0.5, y: 0.5 });
      ballX = 0.5;
      ballY = 0.5;
      events.push({ minute: 46, type: 'kickoff', side: 'away', x: 0.5, y: 0.5 });
    }

    const side: MatchSide = rng.nextFloat() < possHome ? 'home' : 'away';
    if (side === 'home') possMinutesHome++;
    const attackDir = side === 'home' ? 1 : -1;
    const xi = side === 'home' ? options.homeXi : options.awayXi;
    const tempo = side === 'home' ? home.profile.tempoMod : away.profile.tempoMod;

    // Ball progression (cosmetic for playback; expectation-neutral).
    const step = (0.06 + rng.nextFloat() * 0.2) * tempo;
    ballX = clamp(ballX + attackDir * step, 0.04, 0.96);
    ballY = clamp(ballY + (rng.nextFloat() - 0.5) * 0.3, 0.08, 0.92);
    events.push({
      minute,
      type: rng.nextFloat() < 0.6 ? 'pass' : 'carry',
      side,
      x: ballX,
      y: ballY,
      actorId: pickActor(xi, rng, 'any'),
    });

    // Chance?
    const shotProb = side === 'home' ? shotProbHome : shotProbAway;
    if (rng.nextFloat() < shotProb) {
      // Attack arrives in the final third for the strike.
      ballX = side === 'home' ? 0.78 + rng.nextFloat() * 0.16 : 0.06 + rng.nextFloat() * 0.16;
      ballY = 0.25 + rng.nextFloat() * 0.5;
      const profile = side === 'home' ? home.profile : away.profile;
      const xg = sampleXg(rng, profile.chanceQualityMod);
      const shooter = pickActor(xi, rng, 'attack');
      events.push({ minute, type: 'shot', side, x: ballX, y: ballY, actorId: shooter, xg });

      if (side === 'home') {
        stats.shotsHome++;
        stats.xgHome += xg;
      } else {
        stats.shotsAway++;
        stats.xgAway += xg;
      }

      const goalX = side === 'home' ? 0.97 : 0.03;
      if (rng.nextFloat() < xg) {
        events.push({ minute, type: 'goal', side, x: goalX, y: 0.5, actorId: shooter, xg });
        if (side === 'home') {
          homeGoals++;
          stats.onTargetHome++;
        } else {
          awayGoals++;
          stats.onTargetAway++;
        }
        ballX = 0.5;
        ballY = 0.5;
      } else if (rng.nextFloat() < 0.28 + xg) {
        events.push({ minute, type: 'save', side, x: goalX, y: 0.5, actorId: shooter, xg });
        if (side === 'home') stats.onTargetHome++;
        else stats.onTargetAway++;
        ballX = side === 'home' ? 0.85 : 0.15;
      } else {
        events.push({ minute, type: 'miss', side, x: goalX, y: 0.5, actorId: shooter, xg });
        ballX = 0.5;
      }
    }

    // Discipline: fouls by the side OUT of possession.
    const defending: MatchSide = side === 'home' ? 'away' : 'home';
    const defendingXi = defending === 'home' ? options.homeXi : options.awayXi;
    if (rng.nextFloat() < 0.019) {
      events.push({
        minute,
        type: 'card_yellow',
        side: defending,
        x: ballX,
        y: ballY,
        actorId: pickActor(defendingXi, rng, 'defence'),
      });
      if (defending === 'home') stats.cardsHome++;
      else stats.cardsAway++;
    } else if (rng.nextFloat() < 0.0006) {
      events.push({
        minute,
        type: 'card_red',
        side: defending,
        x: ballX,
        y: ballY,
        actorId: pickActor(defendingXi, rng, 'defence'),
      });
      if (defending === 'home') stats.cardsHome++;
      else stats.cardsAway++;
    }
  }

  const finalMinute = 90 + rng.nextInt(1, 5);
  events.push({ minute: finalMinute, type: 'full_time', side: 'home', x: 0.5, y: 0.5 });
  stats.possessionHome = Math.round((possMinutesHome / 90) * 100);

  return {
    fixtureId: options.fixtureId ?? 0,
    events,
    homeGoals,
    awayGoals,
    stats,
  };
}
