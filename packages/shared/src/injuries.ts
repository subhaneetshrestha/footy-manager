/**
 * Injury severity tiers — Fuller consensus classification (§8, RESEARCH.md).
 * One Injury module samples durations from these; Data only stores (contract §3.6).
 */

export const INJURY_TIERS = [
  'minimal',
  'mild',
  'moderate',
  'severe',
  'career_ending',
] as const;
export type InjuryTier = (typeof INJURY_TIERS)[number];

/** Absence duration bounds in days per tier. */
export const INJURY_TIER_DAYS: Record<InjuryTier, { minDays: number; maxDays: number }> = {
  minimal: { minDays: 1, maxDays: 3 },
  mild: { minDays: 4, maxDays: 7 },
  moderate: { minDays: 8, maxDays: 28 },
  severe: { minDays: 29, maxDays: 270 },
  career_ending: { minDays: 100000, maxDays: 100000 },
} as const;
