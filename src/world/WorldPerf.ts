import type { CullLayer, LodPlan } from './Instancing';

/**
 * Scenery quality ("Görüntü Kalitesi" in the settings: Düşük / Orta / Yüksek) and the distance tiers it implies for the voxel LOD
 * (Instancing.LodSet). PURE and DOM-free (the node sims import it). The setting lives in core/Settings (`graphicsQuality`);
 * game/graphics.ts forwards changes here with setGfxQuality(), and the open world (WorldDecor) reads the plans every time the fog or the
 * quality changes. Quality only changes what is DRAWN (distances, thinning of far ground cover): colliders, spawns and the
 * generated world are the same on every peer. OWNER: world module.
 */

export type GfxQuality = 'low' | 'mid' | 'high';

export const GFX_QUALITIES: readonly GfxQuality[] = ['low', 'mid', 'high'];
export const DEFAULT_GFX_QUALITY: GfxQuality = 'mid';

let current: GfxQuality = DEFAULT_GFX_QUALITY;
const listeners = new Set<(q: GfxQuality) => void>();

export function getGfxQuality(): GfxQuality {
  return current;
}

export function setGfxQuality(q: GfxQuality): void {
  if (!GFX_QUALITIES.includes(q) || q === current) return;
  current = q;
  for (const l of listeners) l(q);
}

export function onGfxQuality(fn: (q: GfxQuality) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Distance multiplier and share-kept multiplier of each quality. */
const SCALE: Record<GfxQuality, { dist: number; keep: number }> = {
  low: { dist: 0.72, keep: 0.7 },
  mid: { dist: 1, keep: 1 },
  high: { dist: 1.35, keep: 1.25 },
};

/** The Orta tiers (m from the focus). `end` is capped by the fog below, `fog` entries follow it. */
interface Base { d0: number; d1: number; end: number; keep1: number; keep2: number; fog?: number }
const BASE: Partial<Record<CullLayer, Base>> = {
  // trees: the full model near (and the only shadow caster), a 2x voxel copy to mid range, a 4x copy out to the fog
  tree: { d0: 24, d1: 52, end: 1e9, keep1: 1, keep2: 1, fog: 4 },
  border: { d0: 18, d1: 44, end: 1e9, keep1: 1, keep2: 0.6, fog: 4 },
  bush: { d0: 16, d1: 38, end: 70, keep1: 0.8, keep2: 0.5 },
  rock: { d0: 24, d1: 55, end: 95, keep1: 1, keep2: 0.8 },
  // ground cover: short range, thinned with distance
  // (their 4x copy is empty: the 2x copy runs out to the end distance)
  tuft: { d0: 14, d1: 38, end: 38, keep1: 0.7, keep2: 0 },
  flower: { d0: 14, d1: 36, end: 36, keep1: 0.75, keep2: 0 },
};

const planCache = new Map<string, Partial<Record<CullLayer, LodPlan>>>();

/**
 * LOD plans for a fog far plane (m) and a quality. Cached: the SAME object comes back for the same inputs, which is what the sets use
 * to know nothing changed. Nothing is drawn beyond the fog (the fog is opaque there), so `end` never exceeds fogFar + a few metres.
 */
export function lodPlans(fogFar: number, q: GfxQuality = current): Partial<Record<CullLayer, LodPlan>> {
  const key = `${Math.round(fogFar)}:${q}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const sc = SCALE[q];
  const out: Partial<Record<CullLayer, LodPlan>> = {};
  for (const [layer, b] of Object.entries(BASE) as [CullLayer, Base][]) {
    const cap = fogFar * (q === 'low' ? 0.85 : 1) + (b.fog ?? 0);
    const end = Math.min(cap, b.end * sc.dist);
    const d0 = Math.min(b.d0 * sc.dist, end);
    const d1 = Math.min(Math.max(b.d1 * sc.dist, d0), end);
    out[layer] = { d0, d1, end, keep1: Math.min(1, b.keep1 * sc.keep), keep2: Math.min(1, b.keep2 * sc.keep) };
  }
  if (planCache.size > 64) planCache.clear();
  planCache.set(key, out);
  return out;
}
