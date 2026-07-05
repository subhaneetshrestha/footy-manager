/**
 * Reconciled world constants — canonical contract §3.8.
 * Every subsystem imports these; none may redefine them.
 */

/** Single attribute scale everywhere (contract §3.1). No FM 1–20, no 1–200. */
export const ATTRIBUTE_MIN = 0;
export const ATTRIBUTE_MAX = 99;

/** OVR / POT share the attribute scale; POT >= OVR always. */
export const OVR_MIN = 0;
export const OVR_MAX = 99;

/** Home advantage — applied exactly once, by the engine (contract §3.5). */
export const HOME_ADVANTAGE_GAMMA = 1.08;

/** Club training/youth facilities scale (contract §3.8). */
export const FACILITIES_MIN = 1;
export const FACILITIES_MAX = 20;

/** roleSuitability is stored 0–1 internally, shown 0–100 in UI (contract §3.8). */
export const ROLE_SUITABILITY_INTERNAL_MAX = 1;

/**
 * Player-system compatibility multiplier bounds (§7):
 * M = M_role × M_familiarity × M_cohesion, clamped to this range.
 */
export const COMPATIBILITY_MIN = 0.8;
export const COMPATIBILITY_MAX = 1.2;

/** ~600 clubs → ~300 matches per matchday minus the user's (contract §3.8). */
export const BACKGROUND_MATCHES_PER_MATCHDAY = 299;

/** Save system: fixed slot count (requirement #9). */
export const SAVE_SLOT_COUNT = 20;

/** pace = round(0.45*acceleration + 0.55*sprint_speed) — derived, never stored (contract §3.8). */
export const PACE_ACCELERATION_WEIGHT = 0.45;
export const PACE_SPRINT_SPEED_WEIGHT = 0.55;

export function paceOf(acceleration: number, sprintSpeed: number): number {
  return Math.round(
    PACE_ACCELERATION_WEIGHT * acceleration + PACE_SPRINT_SPEED_WEIGHT * sprintSpeed,
  );
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
