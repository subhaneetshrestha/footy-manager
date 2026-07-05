/**
 * Single attribute vocabulary — canonical contract §3.2.
 * One `player_ratings` table owns exactly these columns (plus potential_ability).
 * No subsystem may introduce a parallel attribute list.
 */

export const PHYSICAL_ATTRIBUTES = [
  'acceleration',
  'sprint_speed',
  'agility',
  'balance',
  'jumping',
  'stamina',
  'strength',
  'reactions',
] as const;

export const TECHNICAL_ATTRIBUTES = [
  'finishing',
  'shot_power',
  'long_shots',
  'volleys',
  'short_passing',
  'long_passing',
  'crossing',
  'dribbling',
  'ball_control',
  'first_touch',
  'technique',
  'fk_accuracy',
  'heading',
] as const;

export const DEFENDING_ATTRIBUTES = [
  'marking',
  'standing_tackle',
  'sliding_tackle',
  'interceptions',
] as const;

/** Mental set required by Tactics' role-suitability math (contract §3.2). */
export const MENTAL_ATTRIBUTES = [
  'positioning',
  'vision',
  'composure',
  'work_rate',
  'aggression',
  'decisions',
  'anticipation',
  'concentration',
  'off_the_ball',
  'bravery',
] as const;

/** The one fixed GK attribute set (contract §3.8). */
export const GK_ATTRIBUTES = [
  'gk_diving',
  'gk_handling',
  'gk_kicking',
  'gk_positioning',
  'gk_reflexes',
] as const;

/** Hidden attributes (never shown raw in UI). */
export const HIDDEN_ATTRIBUTES = ['injury_proneness', 'consistency'] as const;

export const OUTFIELD_ATTRIBUTES = [
  ...PHYSICAL_ATTRIBUTES,
  ...TECHNICAL_ATTRIBUTES,
  ...DEFENDING_ATTRIBUTES,
  ...MENTAL_ATTRIBUTES,
] as const;

export const ALL_ATTRIBUTES = [
  ...OUTFIELD_ATTRIBUTES,
  ...GK_ATTRIBUTES,
  ...HIDDEN_ATTRIBUTES,
] as const;

export type PhysicalAttribute = (typeof PHYSICAL_ATTRIBUTES)[number];
export type TechnicalAttribute = (typeof TECHNICAL_ATTRIBUTES)[number];
export type DefendingAttribute = (typeof DEFENDING_ATTRIBUTES)[number];
export type MentalAttribute = (typeof MENTAL_ATTRIBUTES)[number];
export type GkAttribute = (typeof GK_ATTRIBUTES)[number];
export type HiddenAttribute = (typeof HIDDEN_ATTRIBUTES)[number];
export type OutfieldAttribute = (typeof OUTFIELD_ATTRIBUTES)[number];
export type Attribute = (typeof ALL_ATTRIBUTES)[number];

/** A full 0–99 rating set for one player (the in-memory shape of a player_ratings row). */
export type PlayerRatings = Record<Attribute, number>;
