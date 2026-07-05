/**
 * Play-style parameter bundles (§7) + the Tactics→Engine contract (§3.5).
 *
 * Tactics owns ALL tactic math and emits a TeamTacticalProfile; the engine
 * consumes it once and never re-implements playstyle tables. Home advantage
 * is NOT part of the profile — the engine applies γ exactly once itself.
 */

export const PLAY_STYLES = [
  'tiki_taka',
  'gegenpressing',
  'counter_attack',
  'park_the_bus',
  'high_press',
  'wing_play',
  'direct',
  'balanced',
  'tempo_control',
] as const;
export type PlayStyle = (typeof PLAY_STYLES)[number];

export type BuildUp = 'short' | 'mixed' | 'direct' | 'long' | 'wide' | 'clear';
export type Marking = 'zonal' | 'man' | 'high_zonal' | 'man_zonal';

/** Engine-facing parameter bundle; sliders are 0–100. Values tuned in calibration. */
export interface PlayStyleParams {
  tempo: number;
  lineHeight: number;
  pressIntensity: number;
  width: number;
  directness: number;
  buildUp: BuildUp;
  marking: Marking;
  compactness: number;
}

export const PLAY_STYLE_PARAMS: Record<PlayStyle, PlayStyleParams> = {
  tiki_taka: { tempo: 45, lineHeight: 60, pressIntensity: 55, width: 70, directness: 20, buildUp: 'short', marking: 'zonal', compactness: 55 },
  gegenpressing: { tempo: 75, lineHeight: 75, pressIntensity: 90, width: 60, directness: 45, buildUp: 'mixed', marking: 'high_zonal', compactness: 70 },
  counter_attack: { tempo: 80, lineHeight: 40, pressIntensity: 40, width: 55, directness: 80, buildUp: 'direct', marking: 'zonal', compactness: 65 },
  park_the_bus: { tempo: 30, lineHeight: 25, pressIntensity: 25, width: 40, directness: 60, buildUp: 'clear', marking: 'man_zonal', compactness: 85 },
  high_press: { tempo: 70, lineHeight: 70, pressIntensity: 85, width: 65, directness: 50, buildUp: 'mixed', marking: 'high_zonal', compactness: 65 },
  wing_play: { tempo: 65, lineHeight: 55, pressIntensity: 55, width: 85, directness: 60, buildUp: 'wide', marking: 'zonal', compactness: 50 },
  direct: { tempo: 70, lineHeight: 45, pressIntensity: 45, width: 60, directness: 90, buildUp: 'long', marking: 'zonal', compactness: 60 },
  balanced: { tempo: 55, lineHeight: 55, pressIntensity: 55, width: 60, directness: 50, buildUp: 'mixed', marking: 'zonal', compactness: 55 },
  tempo_control: { tempo: 40, lineHeight: 55, pressIntensity: 50, width: 60, directness: 30, buildUp: 'short', marking: 'zonal', compactness: 60 },
} as const;

/**
 * The one-way Tactics → Engine contract (§3.5). Both engine tiers consume this
 * and nothing else from Tactics. All modifiers are multiplicative around 1.0.
 */
export interface TeamTacticalProfile {
  /** Multiplies own expected-goal rate (λ). */
  attackMod: number;
  /** Multiplies the OPPONENT's λ; < 1.0 = better defence. */
  defenceMod: number;
  /** Expected possession share vs a neutral opponent, 0..1. */
  possessionShare: number;
  /** Tier-A: shifts xG per shot. */
  chanceQualityMod: number;
  /** Tier-A: scales events per minute. */
  tempoMod: number;
  /** M = M_role × M_familiarity × M_cohesion, clamped to [0.8, 1.2] (§7). */
  compatibility: number;
}

export function neutralTacticalProfile(): TeamTacticalProfile {
  return {
    attackMod: 1,
    defenceMod: 1,
    possessionShare: 0.5,
    chanceQualityMod: 1,
    tempoMod: 1,
    compatibility: 1,
  };
}
