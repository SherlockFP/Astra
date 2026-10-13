/**
 * Şişe bases (flasks, GDD_V2 §4.2). COMPILE-ONLY STUB (WP1): empty until items owner fills it (WP3).
 * Base ids `flask_*`; affixes `fl_pre_*` / `fl_suf_*`. OWNER: items (data). Types: types/v2.ts.
 */
import type { FlaskBaseDef } from '../types/v2';

/** Şişe Kemeri slots: flask1..flask5 (keys 6 7 8 9 0). */
export const FLASK_SLOT_COUNT = 5;

export const FLASK_BASES: Readonly<Record<string, FlaskBaseDef>> = {};

/** Flask base by id; undefined while the registry is empty or the id is unknown. */
export function getFlaskBase(id: string): FlaskBaseDef | undefined {
  return FLASK_BASES[id];
}
