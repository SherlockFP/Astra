/**
 * Ability tips for the death recap (GDD_V2 §8.5): abilityId -> short TR tip (e.g. "Kırmızı alandan çık").
 * COMPILE-ONLY STUB (WP1): empty until the enemies owner fills it (WP4, ~40 avoidable abilities).
 * OWNER: enemies (data).
 */
export const ABILITY_TIPS: Readonly<Record<string, string>> = {};

/** TR tip for an ability id; undefined while the table is empty or the id is unknown. */
export function abilityTip(abilityId: string): string | undefined {
  return ABILITY_TIPS[abilityId];
}
