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
  // (pushed out: the 2x copy read as blurry blocks at 24-52 m, so the real meshes now hold to 40 m and the 2x copy runs to 90 m)
  // the voxel copies of trees read as large pale translucent blocks in the sky line past ~80 m (a 4x copy of a tall pine): full
  // models to 60 m, the 2x copy to 100 m, and no 4x copy (nothing is drawn beyond 100 m, the fog is already ~40 % there)
  tree: { d0: 60, d1: 100, end: 100, keep1: 1, keep2: 0, fog: 0 },
  // dense forest edge: full models to 18 m, the 2x copy out to the fog, no 4x copy (a 4x voxel of a 2.8x border tree was a 6 m block
  // at 40-60 m); bush likewise (its 4x copy ended at 56 m with 2 m voxels). The tiers scale with each instance (LodPlan.angular).
  border: { d0: 18, d1: 1e9, end: 1e9, keep1: 1, keep2: 0, fog: 0 },
  bush: { d0: 24, d1: 70, end: 70, keep1: 0.8, keep2: 0 },
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
    // the tiers scale with each instance (LodPlan.angular): a voxel copy keeps its on-screen size at any tree scale
    out[layer] = {
      d0, d1, end, keep1: Math.min(1, b.keep1 * sc.keep), keep2: Math.min(1, b.keep2 * sc.keep),
      angular: { d0: b.d0 * sc.dist, d1: b.d1 * sc.dist, end: b.end * sc.dist, cap },
    };
  }
  if (planCache.size > 64) planCache.clear();
  planCache.set(key, out);
  return out;
}

/**
 * Character LOD of the town NPCs (entities/CharacterLod.ts), per quality, in metres from the local player: `full` (shadows and
 * attachments inside it), `model` (the models end here: a character beyond it is a billboard), `hide` (nothing is drawn beyond it).
 * `maxDrawn` caps the models in view (nearest first, the rest are billboards); `mixerHz` is the animation rate of the mid tier.
 */
export interface CharLodPlan { full: number; model: number; hide: number; maxDrawn: number; mixerHz: number }
const CHAR_LOD: Record<GfxQuality, CharLodPlan> = {
  low: { full: 10, model: 28, hide: 55, maxDrawn: 14, mixerHz: 10 },
  mid: { full: 15, model: 40, hide: 70, maxDrawn: 20, mixerHz: 15 },
  high: { full: 20, model: 55, hide: 90, maxDrawn: 32, mixerHz: 30 },
};

/** The character LOD plan of a quality (default: the current one). The same object comes back for the same quality. */
export function charLodPlan(q: GfxQuality = current): CharLodPlan {
  return CHAR_LOD[q];
}
