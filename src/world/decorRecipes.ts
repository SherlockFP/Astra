import { RNG, hashString } from '../core/utils';
import { TILE_SIZE, type DecorDef } from '../types/dungeons';
import { gp, hw, ip, kf, kg, kn, ks } from '../data/dungeons/kit';

/**
 * Pure recipe data of the Sisli Vadi decor (layout `decor`, tools/world-fill.mjs) and of the landmark silhouettes added with it:
 * which kit models make each recipe, where. No rendering here, so tools/content-check.mjs can list every model the decor needs.
 * OWNER: world module. WorldDecorFill.ts places them.
 *
 * A recipe lists its pieces in metres in the anchor's frame (dx east, dz south). `solid` pieces block the nav grid with a circle.
 */

const T = TILE_SIZE;

/** One model of a recipe: metres from the anchor, local yaw (rad), scale, and the nav radius it blocks (m). */
export interface Piece { url: string; dx: number; dz: number; yaw?: number; s?: number; solid?: number }
export type Recipe = (r: RNG) => Piece[];

const jit = (r: RNG, a: number): number => r.range(-a, a);
const pickOf = <T,>(r: RNG, xs: readonly T[]): T => xs[Math.floor(r.next() * xs.length)];
/** Tile coordinate -> metres of the tile centre (the engine's tileToWorld). */
export const tileC = (c: number): number => (c + 0.5) * T;

export const RECIPES: Record<string, Recipe> = {
  campfire_camp: (r) => [
    { url: gp('campfire'), dx: 0, dz: 0, solid: 0.7 },
    { url: ks('bedroll'), dx: -1.5, dz: 1.8, yaw: 0.2 + jit(r, 0.3), s: 2.6 },
    { url: ks('bedroll'), dx: -0.7, dz: 2.5, yaw: 1.1 + jit(r, 0.3), s: 2.6 },
    { url: gp('sacks'), dx: 1.9, dz: -1.1, yaw: jit(r, 1), solid: 0.5 },
    { url: gp('barrel'), dx: 2.6, dz: 0.9, solid: 0.5 },
  ],
  abandoned_cart: (r) => [
    { url: kf('cart'), dx: 0, dz: 0, yaw: 0.3 + jit(r, 0.3), s: 3.2, solid: 1.8 },
    { url: gp('crate_a'), dx: 2.2, dz: 1.6, yaw: jit(r, 1), solid: 0.6 },
    { url: gp('crate_b'), dx: 2.8, dz: 2.5, yaw: jit(r, 1) },
    { url: gp('barrel'), dx: -2.4, dz: -1.5, solid: 0.5 },
    { url: kg('debris-wood'), dx: -1.8, dz: 2.1, yaw: jit(r, 2), s: 3 },
  ],
  hunter_camp: (r) => [
    { url: ks('tent-canvas'), dx: 0, dz: 0, yaw: jit(r, 3), s: 4.5, solid: 1.6 },
    { url: ks('campfire-pit'), dx: 2.8, dz: 1.5, solid: 0.6 },
    { url: gp('training_dummy'), dx: -3.2, dz: -2.1, yaw: 0.8 + jit(r, 0.4), solid: 0.6 },
    { url: gp('bone_pile'), dx: 3.3, dz: -2.3, s: 1.2 },
    { url: ks('bedroll'), dx: -1.4, dz: 1.9, yaw: 0.5, s: 2.6 },
  ],
  collapsed_wagon: (r) => [
    { url: gp('wagon'), dx: 0, dz: 0, yaw: jit(r, 3), solid: 2.2 },
    { url: kg('debris-wood'), dx: 2.6, dz: 1.2, yaw: jit(r, 2), s: 3 },
    { url: kg('debris-wood'), dx: -2.4, dz: -1.6, yaw: jit(r, 2), s: 3 },
    { url: gp('barrel'), dx: -3.2, dz: 1.4, solid: 0.5 },
    { url: gp('sacks'), dx: 3.0, dz: -2.0, solid: 0.5 },
  ],
  graveyard: (r) => {
    const stones = [gp('gravestone_a'), gp('gravestone_b'), gp('gravestone_c'), kg('gravestone-cross')];
    const out: Piece[] = [];
    for (const [dx, dz] of [[-2.4, -1.6], [0, -1.6], [2.4, -1.6], [-2.4, 1.6], [0, 1.6], [2.4, 1.6]]) {
      out.push({ url: pickOf(r, stones), dx, dz, yaw: jit(r, 0.25), solid: 0.45 });
    }
    out.push({ url: gp('tree_dead'), dx: -4.4, dz: 0.2, yaw: jit(r, 3), s: 1.3, solid: 0.8 });
    out.push({ url: gp('tree_dead'), dx: 4.6, dz: -1.0, yaw: jit(r, 3), s: 1.1, solid: 0.8 });
    out.push({ url: gp('bone_pile'), dx: 0.2, dz: 3.4, yaw: jit(r, 3), s: 1.1 });
    return out;
  },
  roadside_shrine: (r) => [
    { url: hw('shrine'), dx: 0, dz: 0, s: 1.2, solid: 0.9 },
    { url: hw('candle_triple'), dx: -0.9, dz: 0.8, s: 1 },
    { url: gp('flowers'), dx: 1.3, dz: -0.9, yaw: jit(r, 3), s: 1.1 },
    { url: gp('bush_a'), dx: -1.8, dz: -1.2, yaw: jit(r, 3), s: 0.8 },
  ],
  fishing_spot: (r) => [
    // the anchor's rot turns the canoe's length toward the water (tools/world-fill.mjs shoreRot)
    { url: kn('canoe'), dx: 0, dz: 0, s: 3.2, solid: 1.4 },
    { url: ks('campfire-fishing-stand'), dx: -1.9, dz: -2.2, yaw: jit(r, 0.3), s: 3 },
    { url: ks('bucket'), dx: 1.6, dz: -1.6, s: 3 },
    { url: gp('sacks'), dx: 2.2, dz: 1.0, yaw: jit(r, 1), s: 0.9, solid: 0.5 },
  ],
  farm_field: (r) => {
    // a 12 x 8 m field fenced on all four sides, crop rows, a scarecrow (a training dummy) and two hay bales
    const out: Piece[] = [];
    for (const x of [-4, 0, 4]) {
      out.push({ url: gp('fence_wood'), dx: x, dz: -4, solid: 0.5 });
      out.push({ url: gp('fence_wood'), dx: x, dz: 4, solid: 0.5 });
    }
    for (const z of [-2, 2]) {
      out.push({ url: gp('fence_wood'), dx: -6, dz: z, yaw: Math.PI / 2, solid: 0.5 });
      out.push({ url: gp('fence_wood'), dx: 6, dz: z, yaw: Math.PI / 2, solid: 0.5 });
    }
    // crop rows: grass tufts and small bushes (the nature-kit crop models render cyan in this palette)
    const crops = [gp('grass_tuft'), gp('grass_tuft'), gp('bush_b')];
    for (const dz of [-2.4, 0, 2.4]) for (const dx of [-1.2, 0.8, 2.8]) out.push({ url: pickOf(r, crops), dx, dz, yaw: jit(r, 0.4), s: 2.2 });
    out.push({ url: gp('training_dummy'), dx: -4.6, dz: 0, yaw: Math.PI / 2, solid: 0.5 });
    out.push({ url: ip('psx-medieval', 'market/haybale'), dx: 4.6, dz: -2.6, yaw: jit(r, 1), solid: 1.0 });
    out.push({ url: ip('psx-medieval', 'market/haybale_wrapped'), dx: 4.5, dz: 2.3, yaw: jit(r, 1), solid: 1.0 });
    return out;
  },
  signpost: () => [{ url: gp('signpost'), dx: 0, dz: 0, solid: 0.35 }],
  flora_cluster: (r) => {
    const flora = [gp('flowers'), gp('bush_a'), gp('bush_b'), gp('grass_tuft')];
    const n = 3 + r.int(0, 2);
    const out: Piece[] = [];
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2), d = r.range(0.4, 2.2);
      out.push({ url: pickOf(r, flora), dx: Math.cos(a) * d, dz: Math.sin(a) * d, yaw: r.range(0, Math.PI * 2), s: r.range(0.9, 1.3) });
    }
    return out;
  },
  rock_cluster: (r) => {
    const out: Piece[] = [
      { url: gp('rock_medium'), dx: 0, dz: 0, yaw: r.range(0, Math.PI * 2), solid: 0.9 },
      { url: gp('rock_small'), dx: 1.4, dz: 0.9, yaw: r.range(0, Math.PI * 2) },
      { url: gp('rock_small'), dx: -1.1, dz: 1.2, yaw: r.range(0, Math.PI * 2) },
    ];
    if (r.next() < 0.4) out.push({ url: gp('rock_large'), dx: -1.8, dz: -1.1, yaw: r.range(0, Math.PI * 2), s: 0.8, solid: 1.2 });
    return out;
  },
};

/** Recipe pieces for one entry, in the anchor's frame: x / z in metres from the anchor's centre, yaw in radians (anchor included). */
export function piecesOf(d: DecorDef): { x: number; z: number; yaw: number; p: Piece }[] {
  const recipe = RECIPES[d.recipe];
  if (!recipe) return [];
  const r = new RNG(hashString(`${d.id}:decor`));
  const a = (d.rot * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const ax = tileC(d.pos[0]), az = tileC(d.pos[1]);
  return recipe(r).map((p) => ({
    x: ax + p.dx * ca + p.dz * sa,
    z: az - p.dx * sa + p.dz * ca,
    yaw: (p.yaw ?? 0) + a,
    p,
  }));
}

/** Every model url the decor needs (the placement and the content check both read this list). */
export function decorAssetUrls(defs: readonly DecorDef[]): string[] {
  const out = new Set<string>();
  for (const d of defs) for (const e of piecesOf(d)) out.add(e.p.url);
  return [...out];
}

/** Model urls of the landmark silhouettes added with the fill pass (WorldDecorFill.placeNamedLandmark draws them). */
export function namedLandmarkUrls(): string[] {
  return [gp('pillar_broken'), gp('rock_large'), kg('altar-stone'), gp('tree_oak_b'), kg('bench'), hw('lantern_standing'), gp('bush_b'),
    kn('bridge_side_wood'), gp('barrel'), gp('sacks'), hw('shrine'), hw('candle_triple'), gp('gravestone_a'), gp('gravestone_b'), kg('cross-wood')];
}
