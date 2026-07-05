/**
 * Commentary selector (§6): deterministic template pick per event — no PRNG
 * needed, the (minute, event index) pair rotates the phrasing. Returns null
 * for routine events the ticker should skip.
 */

import type { MatchEvent } from './tierA';

export interface CommentaryContext {
  homeName: string;
  awayName: string;
  playerName?: (playerId: number) => string;
}

const SHOT_LINES = [
  '{player} lets fly from a promising position!',
  '{player} shapes to shoot… and pulls the trigger!',
  'Chance here for {team} — {player} strikes it!',
  '{player} finds half a yard and has a go!',
];

const GOAL_LINES = [
  'GOAL! {player} finishes it off for {team}!',
  'IT’S IN! {player} sends the {team} fans wild!',
  'GOAL for {team}! Clinical from {player}!',
  '{player} scores! {team} have their reward!',
];

const SAVE_LINES = [
  'Brilliant save! {player}’s effort is kept out!',
  'The keeper stands tall and denies {player}!',
  'Tipped away! So close for {team}!',
];

const MISS_LINES = [
  'Wide! {player} can’t keep it on target.',
  'Over the bar — {player} will want that one back.',
  '{player} drags it past the post!',
];

const YELLOW_LINES = [
  'Yellow card — {player} goes into the book.',
  'The referee reaches for a yellow. {player} can have no complaints.',
];

const RED_LINES = ['RED CARD! {player} is off! Down to ten for {team}!'];

const PASS_LINES = [
  '{team} knocking it around patiently.',
  '{team} probing for an opening.',
  '{team} building from deep.',
  'Nice interchange from {team} in midfield.',
];

function pick(lines: readonly string[], seed: number): string {
  return lines[seed % lines.length] ?? lines[0] ?? '';
}

function fill(template: string, event: MatchEvent, ctx: CommentaryContext): string {
  const team = event.side === 'home' ? ctx.homeName : ctx.awayName;
  const player =
    event.actorId !== undefined && ctx.playerName !== undefined
      ? ctx.playerName(event.actorId)
      : team;
  return template.replace(/\{team\}/g, team).replace(/\{player\}/g, player);
}

/** Text for an event, or null when the ticker should stay quiet. */
export function commentFor(
  event: MatchEvent,
  index: number,
  ctx: CommentaryContext,
): string | null {
  const seed = event.minute * 7 + index;
  switch (event.type) {
    case 'kickoff':
      return event.minute <= 1
        ? `We’re under way — ${ctx.homeName} against ${ctx.awayName}!`
        : 'The second half begins!';
    case 'half_time':
      return 'The referee blows for half-time.';
    case 'full_time':
      return 'Full time!';
    case 'shot':
      return fill(pick(SHOT_LINES, seed), event, ctx);
    case 'goal':
      return fill(pick(GOAL_LINES, seed), event, ctx);
    case 'save':
      return fill(pick(SAVE_LINES, seed), event, ctx);
    case 'miss':
      return fill(pick(MISS_LINES, seed), event, ctx);
    case 'card_yellow':
      return fill(pick(YELLOW_LINES, seed), event, ctx);
    case 'card_red':
      return fill(pick(RED_LINES, seed), event, ctx);
    case 'pass':
    case 'carry':
      // Speak roughly one movement event in eight to keep the ticker calm.
      return seed % 8 === 0 ? fill(pick(PASS_LINES, seed), event, ctx) : null;
    default:
      return null;
  }
}
