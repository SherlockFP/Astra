import * as THREE from 'three';
import { G } from '../game/G';
import { RNG, hashString } from '../core/utils';
import type { DecorDef, LandmarkDef } from '../types/dungeons';
import { gp, hw, ip, kg, kn } from '../data/dungeons/kit';
import type { CullLayer } from './Instancing';
import type { WorldDecorHost } from './WorldDecor';
import { piecesOf, tileC } from './decorRecipes';

/**
 * Placement of the Sisli Vadi decor (layout `decor`, tools/world-fill.mjs) and of the landmark silhouettes added with it. OWNER:
 * world module. The recipes (which models, where) are pure data in decorRecipes.ts, shared with tools/content-check.mjs.
 * Models come from public/assets only (no downloads). A failing entry is reported and skipped; the map still builds.
 */

const CULL: { cast: boolean; receive: boolean; layer: CullLayer } = { cast: true, receive: true, layer: 'prop' };
/** Scatter keeps this many metres clear of each decor anchor (by kind). */
const AVOID: Record<DecorDef['kind'], number> = { vignette: 6, field: 10, signpost: 2, flora: 2.5, rocks: 3 };

/**
 * Culling layer of a decor piece by its model, so filler uses the open-world distance limits of the scatter layers (tuft 55 m,
 * flower 55 m, bush 80 m, rock 100 m; props 100 m). Small pieces do not cast shadows (the signposts do, and the towers and castles of the
 * hand-placed and fill-pass landmarks: WorldDecor.placeLandmark).
 */
function layerOf(url: string): CullLayer {
  if (url.includes('flowers')) return 'flower';
  if (url.includes('grass_tuft')) return 'tuft';
  if (url.includes('bush')) return 'bush';
  if (url.includes('rock')) return 'rock';
  return 'prop';
}

/** Draws the decor: vignettes, fields, flora and rocks as batched pieces (nav circles for the solid ones), signposts with labels. */
export function placeDecor(defs: readonly DecorDef[], host: WorldDecorHost): void {
  for (const d of defs) {
    try {
      if (d.kind === 'signpost') {
        placeSignpost(d, host);
        continue;
      }
      for (const e of piecesOf(d)) {
        host.batcher.add(e.p.url, e.x, 0, e.z, e.yaw, e.p.s ?? 1, null, { cast: false, receive: true, layer: layerOf(e.p.url) });
        if (e.p.solid) host.nav.setCircle(e.x, e.z, e.p.solid, false);
      }
      host.avoid.push({ x: tileC(d.pos[0]), z: tileC(d.pos[1]), r: AVOID[d.kind] });
    } catch (err) {
      console.warn(`[world] decor ${d.id} failed`, err);
    }
  }
}

/** Junction sign: the post, then a floating label with the destinations (the layout `lines`). */
function placeSignpost(d: DecorDef, host: WorldDecorHost): void {
  const x = tileC(d.pos[0]), z = tileC(d.pos[1]);
  host.batcher.add(gp('signpost'), x, 0, z, (d.rot * Math.PI) / 180, 1, null, CULL);
  host.nav.setCircle(x, z, 0.35, false);
  host.avoid.push({ x, z, r: AVOID.signpost });
  if (!d.lines || d.lines.length === 0) return;
  const anchor = new THREE.Object3D();
  const gy = host.batcher.groundY ? host.batcher.groundY(x, z) : 0;
  anchor.position.set(x, gy + 2.7, z);
  host.root.add(anchor);
  const rows = d.lines.map((l) => `<div class="s">${escapeHtml(l)}</div>`).join('');
  const handle = G.ui?.addWorldLabel(anchor, `<div class="efs-wl"><div class="n" style="color:#e8d6a0">Yol Tabelası</div>${rows}</div>`, {
    className: 'efs-wl-wrap', maxDistance: 46,
  });
  if (handle) host.disposables.push({ dispose: () => handle.remove() });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Draws one of the landmark silhouettes added with the fill pass (standing stones, giant tree, broken pier, roadside chapel) at
 * (x, z). Returns false when the recipe is not one of them (the older recipes are in WorldDecor.placeLandmark).
 */
export function placeNamedLandmark(lm: LandmarkDef, x: number, z: number, host: WorldDecorHost): boolean {
  const r = new RNG(hashString(`${lm.id}:landmark`));
  // the silhouettes of the fill pass cast no shadow (many small casters cost the shadow pass; WorldDecor.placeLandmark keeps the tower and castle)
  const add = (url: string, px: number, py: number, pz: number, yaw: number, s: number): void => {
    host.batcher.add(url, px, py, pz, yaw, s, null, { cast: false, receive: true, layer: 'prop' });
  };
  const jit = (a: number): number => r.range(-a, a);
  switch (lm.recipe) {
    case 'standing_stones': {
      // six broken pillars on a ring of 6.5 m, a stone altar in the middle, a boulder to one side
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + jit(0.2), d = 6.5;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        add(gp('pillar_broken'), px, 0, pz, r.range(0, Math.PI * 2), 2.2);
        host.nav.setCircle(px, pz, 0.9, false);
      }
      add(kg('altar-stone'), x, 0, z, 0.4, 1.6);
      host.nav.setCircle(x, z, 1.2, false);
      add(gp('rock_large'), x + 2.2, 0, z + 3.2, 0.7, 0.8);
      return true;
    }
    case 'giant_tree': {
      add(gp('tree_oak_b'), x, 0, z, 0, 2.6);
      host.nav.setCircle(x, z, 1.6, false);
      add(kg('bench'), x + 3.2, 0, z + 2.6, 0.6, 2);
      add(hw('lantern_standing'), x - 2.6, 0, z + 2.2, 0, 1.5);
      add(gp('bush_b'), x - 3.2, 0, z - 2.4, 1, 1.2);
      return true;
    }
    case 'broken_pier': {
      // planks run from the shore toward the lake (the anchor's rot) and stop short of it; two rails, a barrel, sacks
      const yaw = (lm.rot ?? 0) * (Math.PI / 180);
      const u = [Math.sin(yaw), Math.cos(yaw)], v = [Math.cos(yaw), -Math.sin(yaw)];
      for (let k = 0; k < 3; k++) {
        for (const side of [-1, 1]) {
          const along = 1.4 + k * 2.2, lat = side * 1.0;
          add(kn('bridge_side_wood'), x + u[0] * along + v[0] * lat, 0, z + u[1] * along + v[1] * lat, yaw, 2.6);
        }
      }
      add(gp('barrel'), x + u[0] * 0.5 + v[0] * 1.6, 0, z + u[1] * 0.5 + v[1] * 1.6, 0, 1);
      add(gp('sacks'), x + u[0] * 1.0 - v[0] * 1.5, 0, z + u[1] * 1.0 - v[1] * 1.5, yaw, 1);
      host.nav.setCircle(x, z, 0.8, false);
      return true;
    }
    case 'roadside_chapel': {
      add(hw('shrine'), x, 0, z, 0, 1.8);
      host.nav.setCircle(x, z, 1.0, false);
      add(hw('candle_triple'), x + 1.4, 0, z + 1.2, 0, 1.2);
      add(gp('gravestone_a'), x - 2.2, 0, z + 1.8, 0.4, 1);
      host.nav.setCircle(x - 2.2, z + 1.8, 0.4, false);
      add(gp('gravestone_b'), x - 2.8, 0, z + 0.4, 0, 1);
      host.nav.setCircle(x - 2.8, z + 0.4, 0.4, false);
      add(kg('cross-wood'), x + 2.4, 0, z - 1.6, 0.3, 1.6);
      host.nav.setCircle(x + 2.4, z - 1.6, 0.4, false);
      return true;
    }
    default:
      return false;
  }
}
