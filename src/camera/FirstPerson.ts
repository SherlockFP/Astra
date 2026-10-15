/**
 * First-person mode (WoW style), pure rules shared by ThirdPersonCamera.ts and tools/controls-check.mjs. No three.js here, so the
 * node validator can load it without a bundler.
 *  - Wheel in past the zoom minimum enters first person; wheel out leaves it (back to the orbit lens at the minimum distance).
 *  - The keybind (Input 'firstPerson') toggles it. The wanted state persists per character (save.flags.firstPerson).
 *  - The camera eye sits at FP_EYE_RATIO of the character's height, pitch is clamped to +-FP_PITCH_MAX, the near plane drops to
 *    FP_NEAR so the eye never clips a wall face.
 * OWNER: camera module.
 */

/** Eye height as a share of the character's height (Player.height 2.3 m: the eye sits at about 2.0 m). */
export const FP_EYE_RATIO = 0.87;
/** Eye height used before a character height is known (m). */
export const FP_EYE_FALLBACK = 1.95;
/** Pitch clamp in first person (rad): +-85 deg. */
export const FP_PITCH_MAX = 85 * Math.PI / 180;
/** Near plane in first person (m). The third-person lens keeps its own (0.1). */
export const FP_NEAR = 0.07;
/** Keep the eye this far (m) under a ceiling in vertical dungeons. */
export const FP_CEIL_CLEAR = 0.2;
/** A zoom within this many metres of the minimum counts as "all the way in". */
export const FP_ZOOM_EPS = 0.05;
/** Blend rate of the transition (1/s, exponential): about 0.4 s to settle. */
export const FP_BLEND_RATE = 7;
/** The character's own meshes are hidden once the blend passes this value. */
export const FP_BODY_HIDE = 0.5;

/**
 * One wheel / zoom-key step. `dir` -1 = zoom in (wheel toward the player), +1 = zoom out. `zoom` is the wanted zoom distance and
 * `zoomMin` its minimum. Returns the new wanted first-person state, and whether the step was used by the mode (then the zoom distance
 * must not change for this step).
 * `wheelEnters`: false keeps the wheel from entering first person (Ayarlar: Tekerlekle birinci şahıs off); leaving always works.
 */
export function stepFirstPersonZoom(
  s: { zoom: number; zoomMin: number; fp: boolean; wheelEnters: boolean },
  dir: -1 | 1,
): { fp: boolean; consumed: boolean } {
  if (dir > 0) {
    // zoom out from first person returns to the third-person lens (the zoom distance stays at the minimum)
    return s.fp ? { fp: false, consumed: true } : { fp: false, consumed: false };
  }
  if (s.fp) return { fp: true, consumed: true };
  if (s.wheelEnters && s.zoom <= s.zoomMin + FP_ZOOM_EPS) return { fp: true, consumed: true };
  return { fp: false, consumed: false };
}

/** Eye height (m) of a character of the given height. */
export function fpEyeHeight(characterHeight: number): number {
  return Number.isFinite(characterHeight) && characterHeight > 0 ? characterHeight * FP_EYE_RATIO : FP_EYE_FALLBACK;
}
