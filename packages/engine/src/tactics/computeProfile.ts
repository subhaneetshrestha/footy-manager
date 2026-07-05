/**
 * THE Tactics module (§7, contract §3.5): owns all tactic math and emits the
 * TeamTacticalProfile both engine tiers consume. Nothing outside this module
 * may translate play styles into match modifiers, and home advantage is NOT
 * applied here (the engine applies γ exactly once).
 *
 * MVP scope: role suitability from position fit + style-fit from key
 * attributes. Familiarity/cohesion arrive with Phase 2 training.
 */

import {
  COMPATIBILITY_MAX,
  COMPATIBILITY_MIN,
  PLAY_STYLE_PARAMS,
  clamp,
  type Attribute,
  type PlayStyle,
  type TeamTacticalProfile,
} from '@footy/shared';
import type { SelectedXi } from '../squad/strength';

/** The attributes each play style leans on (style-fit measurement). */
export const STYLE_KEY_ATTRIBUTES: Record<PlayStyle, readonly Attribute[]> = {
  tiki_taka: ['short_passing', 'ball_control', 'vision', 'first_touch', 'composure'],
  gegenpressing: ['work_rate', 'stamina', 'aggression', 'acceleration', 'anticipation'],
  counter_attack: ['acceleration', 'sprint_speed', 'off_the_ball', 'long_passing', 'finishing'],
  park_the_bus: ['marking', 'positioning', 'standing_tackle', 'concentration', 'strength'],
  high_press: ['work_rate', 'stamina', 'anticipation', 'aggression', 'acceleration'],
  wing_play: ['crossing', 'dribbling', 'acceleration', 'agility', 'off_the_ball'],
  direct: ['strength', 'heading', 'jumping', 'long_passing', 'shot_power'],
  balanced: ['decisions', 'work_rate', 'composure', 'ball_control', 'positioning'],
  tempo_control: ['short_passing', 'composure', 'decisions', 'vision', 'first_touch'],
};

/** Centered slider: 55 (the 'balanced' anchor) → 0, range ≈ [-0.55, 0.45]. */
function t(value: number): number {
  return (value - 55) / 100;
}

/**
 * Style-fit: how strong the XI's key attributes for this style are RELATIVE
 * to their own overall level. Self-normalizing, so weak teams aren't punished
 * twice — only ill-suited ones (requirement #6).
 */
function styleFitRatio(style: PlayStyle, xi: SelectedXi): number {
  const keyAttrs = STYLE_KEY_ATTRIBUTES[style];
  let attrSum = 0;
  let ovrSum = 0;
  let count = 0;
  for (const entry of xi.slots) {
    if (entry.slot === 'GK') continue;
    let playerAttrSum = 0;
    for (const attr of keyAttrs) playerAttrSum += entry.player.ratings[attr] ?? 0;
    attrSum += playerAttrSum / keyAttrs.length;
    ovrSum += entry.player.ovr;
    count++;
  }
  if (count === 0 || ovrSum === 0) return 1;
  return attrSum / count / (ovrSum / count);
}

/** M = M_role × M_style (× M_familiarity=1 in MVP), clamped to [0.8, 1.2] (§7). */
export function computeCompatibility(style: PlayStyle, xi: SelectedXi): number {
  const roleM = clamp(0.55 + 0.45 * xi.avgFit, 0.78, 1.02);
  const styleM = clamp(styleFitRatio(style, xi), 0.9, 1.1);
  return clamp(roleM * styleM, COMPATIBILITY_MIN, COMPATIBILITY_MAX);
}

/** The one-way Tactics → Engine emission (contract §3.5). */
export function computeTacticalProfile(style: PlayStyle, xi: SelectedXi): TeamTacticalProfile {
  const p = PLAY_STYLE_PARAMS[style];

  const attackMod = clamp(
    1 + 0.18 * t(p.tempo) + 0.12 * t(p.pressIntensity) + 0.1 * t(p.width) + 0.08 * t(p.lineHeight),
    0.8,
    1.2,
  );
  // Multiplies the OPPONENT's λ: high line/tempo leak, compactness protects.
  const defenceMod = clamp(
    1 +
      0.16 * t(p.lineHeight) +
      0.1 * t(p.tempo) -
      0.2 * t(p.compactness) -
      0.06 * t(p.pressIntensity),
    0.8,
    1.2,
  );
  const possessionShare = clamp(0.5 - 0.2 * t(p.directness) + 0.05 * t(p.pressIntensity), 0.3, 0.7);
  const chanceQualityMod = clamp(1 - 0.08 * t(p.directness), 0.9, 1.1);
  const tempoMod = clamp(0.8 + 0.4 * (p.tempo / 100), 0.8, 1.2);

  return {
    attackMod,
    defenceMod,
    possessionShare,
    chanceQualityMod,
    tempoMod,
    compatibility: computeCompatibility(style, xi),
  };
}
