/**
 * Aspektler (legendary aspects, GDD_V2 §5.1). COMPILE-ONLY STUB (WP1): empty until items owner fills it (WP3).
 * Ids `asp_*`. OWNER: items (data). Types: types/v2.ts.
 */
import type { AspectDef } from '../types/v2';

export const ASPECTS: Readonly<Record<string, AspectDef>> = {};

/** Aspect by id; undefined while the registry is empty or the id is unknown. */
export function getAspect(id: string | null | undefined): AspectDef | undefined {
  return id ? ASPECTS[id] : undefined;
}
