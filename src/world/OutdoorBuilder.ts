import * as THREE from 'three';
import { G } from '../game/G';
import { RNG, hashString } from '../core/utils';
import { TILE_SIZE, type DungeonDef } from '../types/dungeons';
import type { NavGrid } from './NavGrid';
import type { InstanceBatcher } from './Instancing';
import { ParticleField } from './Particles';
import { Sky, makeMountainRing } from './Sky';
import { createTerrain, type SplatOp, type Terrain } from './Terrain';
import { glowTexture } from './ProceduralAssets';
import { freezeStatic } from '../render/staticTransforms';

/**
 * Outdoor mode of the dungeon builder (DungeonDef.outdoor = open-world zone such as Sisli Koru): a splat-mapped PSX terrain
 * replaces the floor tiles, dense tree walls replace the stone walls, plus scattered nature, a hazy forest horizon, a sky dome,
 * ground mist and fireflies. Rooms are just regions of one open map (no walls between them). OWNER: world module.
 */

const T = TILE_SIZE;
/** Contract convention (types/dungeons.ts): a tile coordinate c maps to world (c + 0.5) * TILE_SIZE. */
const tc = (c: number): number => (c + 0.5) * T;
const PI = Math.PI;
const GP = '/assets/models/gen/props/';
const NK = '/assets/models/kenney/nature-kit/';

const TREES = ['tree_oak_a', 'tree_oak_b', 'tree_pine_a', 'tree_pine_b', 'tree_autumn'].map((n) => `${GP}${n}.glb`);
const PINES = ['tree_pine_a', 'tree_pine_b'].map((n) => `${GP}${n}.glb`);
const DEAD = `${GP}tree_dead.glb`;
const ROCKS = ['rock_small', 'rock_medium', 'rock_large'].map((n) => `${GP}${n}.glb`);
const BUSHES = ['bush_a', 'bush_b'].map((n) => `${GP}${n}.glb`);
const TUFT = `${GP}grass_tuft.glb`;
const FLOWERS = `${GP}flowers.glb`;
const MUSHROOMS = ['mushroom_redGroup', 'mushroom_tanGroup', 'mushroom_red', 'mushroom_tanTall'].map((n) => `${NK}${n}.glb`);

export function outdoorAssetUrls(): string[] {
  return [...TREES, DEAD, ...ROCKS, ...BUSHES, TUFT, FLOWERS, ...MUSHROOMS];
}

export interface OutdoorHost {
  def: DungeonDef;
  W: number;
  H: number;
  scene: THREE.Scene;
  tileRoom(i: number, j: number): number;
  hasH(i: number, j: number): boolean;
  hasV(i: number, j: number): boolean;
  nav: NavGrid;
  root: THREE.Object3D;
  batcher: InstanceBatcher;
  disposables: { dispose(): void }[];
  avoid: { x: number; z: number; r: number }[];
  isAvoided(x: number, z: number, pad: number): boolean;
  startPos: THREE.Vector3;
  exitPos: THREE.Vector3;
}

export class OutdoorScenery {
  private sky: Sky | null = null;
  private rings: THREE.Mesh[] = [];
  private terrain: Terrain | null = null;
  private fields: ParticleField[] = [];
  private readonly cx: number;
  private readonly cz: number;
  private readonly rng: RNG;
  private readonly walkTile: (x: number, z: number) => boolean;

  constructor(private h: OutdoorHost) {
    this.cx = (h.W * T) / 2;
    this.cz = (h.H * T) / 2;
    this.rng = new RNG(hashString(h.def.id + ':outdoor'));
    this.walkTile = (x, z) => h.tileRoom(Math.floor(x / T), Math.floor(z / T)) >= 0;
  }

  private col(k = 0.14): THREE.Color {
    return new THREE.Color(0xffffff).multiplyScalar(1 - k * 0.5 + this.rng.next() * k);
  }

  /** Sky dome + hazy forest horizon (follow the camera). */
  buildSky(): void {
    const th = this.h.def.theme;
    const fog = new THREE.Color(th.fogColor);
    const mid = fog.clone().lerp(new THREE.Color(th.hemiSky), 0.35);
    const zenith = fog.clone().lerp(new THREE.Color(th.hemiSky), 0.7).multiplyScalar(0.85);
    this.sky = new Sky({
      zenith: zenith.getHex(), mid: mid.getHex(), horizon: fog.getHex(),
      sunColor: 0xdce8b8, sunDir: [-0.4, 0.5, -0.5],
      cloudLight: fog.clone().lerp(new THREE.Color(0xffffff), 0.45).getHex(), cloudShade: fog.clone().multiplyScalar(0.55).getHex(),
      cloudCover: 0.82,
    });
    this.h.root.add(this.sky.dome);
    const ring = (radius: number, minH: number, maxH: number, base: number, hazeAmt: number, seed: string): THREE.Mesh => {
      const m = makeMountainRing({ radius, minH, maxH, segments: 72, seed: this.h.def.id + seed, baseColor: base, rockColor: base, haze: th.fogColor, hazeAmount: hazeAmt, slope: 1.2 });
      this.h.root.add(m);
      this.rings.push(m);
      this.h.disposables.push({ dispose: () => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
      return m;
    };
    ring(190, 8, 24, 0x2a3a2a, 0.55, ':far');
    ring(150, 5, 14, 0x233222, 0.4, ':near');
  }

  /** Ground: PSX splat terrain with dirt paths between the camps, moss around the bosses. */
  buildGround(): void {
    const def = this.h.def;
    const W = this.h.W * T, H = this.h.H * T;
    const half = Math.max(W, H) / 2;
    const ops: SplatOp[] = [];
    const L = (x: number, z: number): [number, number] => [x - this.cx, z - this.cz];
    const pts: { x: number; z: number }[] = [{ x: this.h.startPos.x, z: this.h.startPos.z }, { x: this.h.exitPos.x, z: this.h.exitPos.z }];
    for (const p of def.packs) pts.push({ x: tc(p.center[0]), z: tc(p.center[1]) });
    // minimum spanning tree of the camps = the path network
    const used = [0];
    const rest = pts.map((_, i) => i).slice(1);
    while (rest.length) {
      let bi = -1, bj = -1, bd = 1e9;
      for (const i of used) for (const j of rest) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
      used.push(bj);
      rest.splice(rest.indexOf(bj), 1);
      const [x0, z0] = L(pts[bi].x, pts[bi].z), [x1, z1] = L(pts[bj].x, pts[bj].z);
      ops.push({ t: 'line', ch: 'dirt', x0, z0, x1, z1, w: 3.4, soft: 1.3 });
    }
    for (const p of def.packs) {
      const [x, z] = L(tc(p.center[0]), tc(p.center[1]));
      const r = Math.min(9, Math.max(3.2, (p.radius ?? 10) * 0.42));
      ops.push({ t: 'disc', ch: 'dirt', x, z, r, soft: 1.6, amount: p.respawnSec ? 0.85 : 0.6 });
    }
    for (const b of def.bosses) {
      const [x, z] = L(tc(b.pos[0]), tc(b.pos[1]));
      ops.push({ t: 'disc', ch: 'dark', x, z, r: 15, soft: 3 });
      ops.push({ t: 'disc', ch: 'dirt', x, z, r: 3.2, soft: 1.5, amount: 0.7 });
    }
    for (const [px, pz] of [this.h.startPos, this.h.exitPos].map((v) => [v.x, v.z] as [number, number])) {
      const [x, z] = L(px, pz);
      ops.push({ t: 'disc', ch: 'dirt', x, z, r: 4.2, soft: 1.5 });
    }
    // generic worn patches so the grass is never one flat colour
    const rng = new RNG(hashString(def.id + ':ground'));
    for (let i = 0; i < 18; i++) {
      const x = rng.range(-half, half), z = rng.range(-half, half);
      ops.push({ t: 'disc', ch: rng.chance(0.5) ? 'dark' : 'dirt', x, z, r: rng.range(2.5, 6), soft: 2, amount: 0.35 });
    }
    this.terrain = createTerrain({ half: half + 160, splatHalf: half + 6, splatRes: 512, seed: def.id, ops, grassTint: def.theme.tint ?? 0xffffff, cell: 10 });
    this.terrain.mesh.position.set(this.cx, 0, this.cz);
    this.h.root.add(this.terrain.mesh);
    freezeStatic(this.terrain.mesh);
    this.h.disposables.push(this.terrain);
  }

  private treeAt(url: string, x: number, z: number, s: number, collide: number): void {
    const dim = 0.86 - this.rng.next() * 0.12;
    this.h.batcher.add(url, x, 0, z, this.rng.range(0, PI * 2), s, new THREE.Color(0xffffff).multiplyScalar(dim + this.rng.next() * 0.2), { cast: true, receive: true });
    if (collide > 0) this.h.nav.setCircle(x, z, collide, false);
  }

  /** Dense trees along every border of the walkable area + a forest beyond it. */
  buildTreeWall(): void {
    const h = this.h;
    const rng = new RNG(hashString(h.def.id + ':treewall'));
    const pick = (): string => rng.weighted(TREES, (u) => (u.includes('pine') ? 3 : u.includes('autumn') ? 0.8 : 2));
    const edge = (x0: number, z0: number, ux: number, uz: number, ox: number, oz: number): void => {
      // x0,z0 = edge start; (ux,uz) = unit along the edge; (ox,oz) = outward unit normal
      for (let t = 0.5; t < T; t += rng.range(1.2, 1.9)) {
        const off = rng.range(0.2, 1.8);
        const x = x0 + ux * t + ox * off + rng.range(-0.3, 0.3), z = z0 + uz * t + oz * off + rng.range(-0.3, 0.3);
        this.treeAt(pick(), x, z, rng.range(1.5, 2.3), 0);
      }
      for (let t = 1; t < T; t += rng.range(2.4, 3.6)) {
        const off = rng.range(3.4, 6.5);
        const x = x0 + ux * t + ox * off + rng.range(-0.8, 0.8), z = z0 + uz * t + oz * off + rng.range(-0.8, 0.8);
        this.treeAt(rng.chance(0.15) ? DEAD : pick(), x, z, rng.range(1.9, 2.8), 0);
      }
    };
    for (let j = 0; j <= h.H; j++)
      for (let i = 0; i < h.W; i++) {
        if (!h.hasH(i, j)) continue;
        const northWalk = h.tileRoom(i, j - 1) >= 0;
        edge(i * T, j * T, 1, 0, 0, northWalk ? 1 : -1);
      }
    for (let j = 0; j < h.H; j++)
      for (let i = 0; i <= h.W; i++) {
        if (!h.hasV(i, j)) continue;
        const westWalk = h.tileRoom(i - 1, j) >= 0;
        edge(i * T, j * T, 0, 1, westWalk ? 1 : -1, 0);
      }
    // forest beyond the border so the horizon is never empty
    const W = h.W * T, H = h.H * T;
    let n = 0;
    for (let a = 0; a < 5000 && n < 760; a++) {
      const x = rng.range(-90, W + 90), z = rng.range(-90, H + 90);
      if (this.walkTile(x, z) || this.walkTile(x + 7, z) || this.walkTile(x - 7, z) || this.walkTile(x, z + 7) || this.walkTile(x, z - 7)) continue;
      this.treeAt(rng.chance(0.62) ? rng.pick(PINES) : pick(), x, z, rng.range(1.7, 3.0), 0);
      n++;
    }
  }

  /** Inside the zone: trees, bushes, rocks, tufts, flowers, mushrooms. Keeps camps, paths, start/exit and props clear. */
  scatter(): void {
    const h = this.h, def = h.def;
    const rng = new RNG(hashString(def.id + ':scatter'));
    const W = h.W * T, H = h.H * T;
    const t = this.terrain!;
    const onPath = (x: number, z: number, lim = 0.08): boolean => {
      const w = t.weights(x - this.cx, z - this.cz);
      return w.dirt > lim || w.cobble > lim;
    };
    const camps = def.packs.map((p) => ({ x: tc(p.center[0]), z: tc(p.center[1]), r: (p.radius ?? 9) * 0.7 }));
    const bosses = def.bosses.map((b) => ({ x: tc(b.pos[0]), z: tc(b.pos[1]), r: 16 }));
    const inCamp = (x: number, z: number, extra = 0): boolean => camps.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + extra) || bosses.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + extra);
    const nearKey = (x: number, z: number, r: number): boolean =>
      Math.hypot(h.startPos.x - x, h.startPos.z - z) < r || Math.hypot(h.exitPos.x - x, h.exitPos.z - z) < r;
    const free = (x: number, z: number, pad: number): boolean => this.walkTile(x, z) && h.nav.isWalkable(x, z) && !h.isAvoided(x, z, pad) && !nearKey(x, z, 7);
    const pick = (): string => rng.weighted(TREES, (u) => (u.includes('pine') ? 3 : u.includes('autumn') ? 0.7 : 2));
    // trees (blocking trunks) - sparse inside camps
    let n = 0;
    const treeTarget = Math.round((W * H) / 520);
    for (let a = 0; a < treeTarget * 8 && n < treeTarget; a++) {
      const x = rng.range(0, W), z = rng.range(0, H);
      if (!free(x, z, 1.6) || onPath(x, z, 0.04) || inCamp(x, z, 2)) continue;
      const s = rng.range(0.95, 1.55);
      this.treeAt(rng.chance(0.07) ? DEAD : pick(), x, z, s, 0.7 * s);
      h.avoid.push({ x, z, r: 1.6 * s });
      n++;
    }
    // bushes
    for (let a = 0, k = 0; a < 2500 && k < Math.round((W * H) / 700); a++) {
      const x = rng.range(0, W), z = rng.range(0, H);
      if (!free(x, z, 0.8) || onPath(x, z, 0.12)) continue;
      this.h.batcher.add(rng.pick(BUSHES), x, 0, z, rng.range(0, PI * 2), rng.range(0.8, 1.5), this.col(0.22), { cast: false });
      k++;
    }
    // rocks (small colliders)
    for (let a = 0, k = 0; a < 1200 && k < Math.round((W * H) / 1400); a++) {
      const x = rng.range(0, W), z = rng.range(0, H);
      if (!free(x, z, 1.4) || inCamp(x, z, -2)) continue;
      const rk = rng.pick(ROCKS);
      const s = rk.includes('large') ? rng.range(0.6, 1.0) : rng.range(0.9, 1.7);
      this.h.batcher.add(rk, x, -0.05, z, rng.range(0, PI * 2), s, this.col(0.2), { cast: true });
      h.nav.setCircle(x, z, 0.75 * s, false);
      h.avoid.push({ x, z, r: 1.4 * s });
      k++;
    }
    // grass tufts + flowers (not on paths)
    const tufts = Math.min(9000, Math.round((W * H) / 5));
    for (let a = 0, k = 0; a < tufts * 2 && k < tufts; a++) {
      const x = rng.range(0, W), z = rng.range(0, H);
      if (!this.walkTile(x, z) || onPath(x, z, 0.05) || h.isAvoided(x, z, 0)) continue;
      this.h.batcher.add(TUFT, x, 0, z, rng.range(0, PI * 2), rng.range(0.8, 1.6), this.col(0.28), { cast: false, receive: false });
      k++;
    }
    for (let a = 0, k = 0; a < 3000 && k < Math.round((W * H) / 160); a++) {
      const x = rng.range(0, W), z = rng.range(0, H);
      if (!this.walkTile(x, z) || onPath(x, z, 0.05) || h.isAvoided(x, z, 0.3)) continue;
      this.h.batcher.add(FLOWERS, x, 0, z, rng.range(0, PI * 2), rng.range(0.8, 1.4), this.col(0.3), { cast: false, receive: false });
      k++;
    }
    // mushroom rings around the bosses (Curuk Hoyuk) and loose groups elsewhere
    for (const b of def.bosses) {
      const cx = tc(b.pos[0]), cz = tc(b.pos[1]);
      for (let k = 0; k < 22; k++) {
        const ang = (k / 22) * PI * 2 + rng.range(-0.1, 0.1), r = rng.range(14, 17);
        const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
        if (!this.walkTile(x, z)) continue;
        this.h.batcher.add(rng.pick(MUSHROOMS), x, 0, z, rng.range(0, PI * 2), rng.range(3, 4.4), this.col(0.2), { cast: true });
      }
    }
    for (let a = 0, k = 0; a < 800 && k < Math.round((W * H) / 2600); a++) {
      const x = rng.range(0, W), z = rng.range(0, H);
      if (!free(x, z, 1) || onPath(x, z, 0.1)) continue;
      this.h.batcher.add(rng.pick(MUSHROOMS), x, 0, z, rng.range(0, PI * 2), rng.range(2.4, 3.6), this.col(0.2), { cast: false });
      k++;
    }
  }

  /** Ground mist, fireflies, floating spores. */
  buildAtmosphere(): void {
    const rng = new RNG(hashString(this.h.def.id + ':atmo'));
    const th = this.h.def.theme;
    // shared glow textures (ProceduralAssets caches them; not owned here)
    const soft = glowTexture(32, 6, 1.3);
    const puff = glowTexture(32, 5, 0.9);
    const mistCol = new THREE.Color(th.fogColor).lerp(new THREE.Color(0xffffff), 0.3).getHex();
    // the puffs are 7-13 m wide: none may stand within 40 m of the camera (they read as blurry squares), full strength from 80 m
    const mist = new ParticleField({ map: puff, blending: 'normal', wrap: [96, 8, 96], alpha: 0.16, fog: [th.fogNear * 1.3, th.fogFar * 1.5], near: [40, 80] });
    for (let i = 0; i < 150; i++)
      mist.add({ pos: [rng.range(-48, 48), rng.range(0.2, 2.2), rng.range(-48, 48)], vel: [rng.range(0.2, 0.8), 0, rng.range(-0.3, 0.3)], speed: rng.range(0.012, 0.03), size: rng.range(7, 13), sway: rng.range(1, 3), color: mistCol });
    mist.build();
    this.h.root.add(mist.mesh);
    this.fields.push(mist);
    const flies = new ParticleField({ map: soft, blending: 'additive', wrap: [60, 6, 60], alpha: 0.9, intensity: 2.2, fog: [th.fogNear, th.fogFar * 1.2] });
    for (let i = 0; i < 110; i++)
      flies.add({ pos: [rng.range(-30, 30), rng.range(0.4, 4), rng.range(-30, 30)], vel: [rng.range(-0.3, 0.3), rng.range(-0.05, 0.12), rng.range(-0.3, 0.3)], speed: rng.range(0.05, 0.12), size: rng.range(0.1, 0.2), sway: rng.range(0.6, 1.8), color: rng.pick([0xd8ff80, 0xc8f070, 0xf0ffa0]) });
    flies.build();
    this.h.root.add(flies.mesh);
    this.fields.push(flies);
    for (const f of this.fields) this.h.disposables.push(f);
  }

  update(dt: number, t: number): void {
    void dt;
    const cam = G.engine?.activeCamera;
    if (cam) {
      this.sky?.update(cam, t);
      for (const r of this.rings) r.position.set(cam.position.x, 0, cam.position.z);
    }
    const c = cam ? cam.position : undefined;
    for (const f of this.fields) f.update(t, c);
  }

  dispose(): void {
    this.sky?.dispose();
    this.sky = null;
    this.rings.length = 0;
    this.fields.length = 0;
  }
}
