import * as THREE from 'three';
import { G } from '../game/G';
import { RNG, hashString } from '../core/utils';
import { SCENE_GRADE } from '../core/Engine';
import { patchPSX } from '../render/psx';
import { freezeStatic } from '../render/staticTransforms';
import { TILE_SIZE, type DungeonDef, type LandmarkDef, type RegionTheme, type RoadDef, type VillageDef, type WorldRegion } from '../types/dungeons';
import { gp, hw, ip, kc, kf, kg, kn, tw } from '../data/dungeons/kit';
import type { NavGrid } from './NavGrid';
import { ChunkCuller, type CullLayer, type InstanceBatcher } from './Instancing';
import { designToPhysical, type LightPool } from './LightPool';
import { Sky, liftRingToGround, makeMountainRing } from './Sky';
import { DEFAULT_BLEND_M, RegionAtmosphere, atmoOf } from './RegionAtmosphere';
import { createTerrain, type SplatOp, type Terrain } from './Terrain';
import type { Relief } from './Relief';
import { ChunkedTerrain } from './TerrainChunks';
import { WorldStream, type WorldStreamStats } from './WorldStream';
import { getGfxQuality, lodPlans } from './WorldPerf';
import { GrassField, grassPaletteFor } from './GrassField';
import { ChunkScatter } from './chunks/ChunkScatter';
import type { StreamConfig } from './chunks/StreamConfig';
import { surfaceTexture } from './ProceduralAssets';
import { getPiece } from './Pieces';
import { placeTownProps } from './TownBuilder';
import { MagitechKit, addVillageMagitech } from './MagitechKit';
import { HouseKit, ROOF } from './HouseKit';
import { NightLight } from './NightLight';
import { fitHeight, fitScale, regionsByRoom, tileCentre, WorldScatter, worldSceneryUrls, worldSplatOps, worldTintRGB, yawAlong } from './WorldScenery';
import { placeDecor, placeNamedLandmark } from './WorldDecorFill';
import { decorAssetUrls, namedLandmarkUrls } from './decorRecipes';

/**
 * Open-world map decor (GDD_OPENWORLD §8, §9.1, §1.5): splat terrain with the region tint map, water planes, bridge and
 * boardwalks, village walls and props, landmarks, the sky dome and far mountain rings, scatter (WorldScenery), chunk culling
 * and the region ATMOSPHERE (RegionAtmosphere.ts): fog, hemisphere, sun, sky and ambient VFX blended by position over ~20 m
 * across region borders. Also the danger toast and the ambient region VFX. The region banner and world:regionEntered are
 * WorldRuntime's. OWNER: world module.
 */

const T = TILE_SIZE;
const PI = Math.PI;
const WALL = kc('wall');
const WALL_CORNER = kc('wall-corner');
const BRIDGE_DECK = ip('psx-medieval', 'building/stone_floor_4x4');
const PARAPET = ip('psx-walls-fences', 'drystone-wall/drystone_wall_capped');
const POST_LANTERN = hw('post_lantern');
const PATH_WOOD = kn('path_wood');
const MUSHROOMS = [kn('mushroom_redGroup'), kn('mushroom_tanGroup'), kn('mushroom_red'), kn('mushroom_tanTall')];

export interface WorldDecorHost {
  scene: THREE.Scene;
  root: THREE.Object3D;
  nav: NavGrid;
  /** Circles kept clear of scatter (landmarks, villages, arenas). */
  avoid: { x: number; z: number; r: number }[];
  isAvoided(x: number, z: number, pad: number): boolean;
  disposables: { dispose(): void }[];
  // ---- open-world additions (WP5) ----
  batcher: InstanceBatcher;
  lights: LightPool;
  /** Grid size in tiles and tile queries (same contract as the outdoor host). */
  W: number;
  H: number;
  tileRoom(i: number, j: number): number;
  hasH(i: number, j: number): boolean;
  hasV(i: number, j: number): boolean;
  /** Lighting driven by the region atmosphere. */
  fog: THREE.Fog | null;
  hemi: THREE.HemisphereLight | null;
  sun: THREE.DirectionalLight | null;
  /** Fog near/far changed: torch halos follow (the builder owns the glow fields). */
  onFog?(near: number, far: number): void;
  /** Streaming configuration (docs/ENGINE_BIGMAPS.md). `stream.on` = chunked terrain + scenery instead of one build-everything pass. */
  stream?: StreamConfig;
  /** Rolling terrain (world/Relief.ts); the ground meshes are built from it. Null / absent = flat ground. */
  relief?: Relief | null;
}

export interface WorldDecorHandle {
  /** Per-frame: region atmosphere blend, chunk culling, sky, water drift and ambient VFX. */
  update(dt: number): void;
  /** Local player position in world metres (drives atmosphere, culling and region detection). */
  setPlayerPos(x: number, z: number): void;
  dispose(): void;
  /** Region under a world position (null on bridges, islands and in the void). */
  regionAt(x: number, z: number): WorldRegion | null;
  /** Region under the player (null before the first update, on bridges and in the void). */
  readonly region: WorldRegion | null;
  /** The map's villages (walls and props are already placed). */
  readonly villages: VillageDef[];
  /** Bumped whenever streamed chunks came or went (0 and constant in a small zone). */
  readonly streamVersion: number;
  /** Streaming counters (null in a small zone). */
  streamStats(): WorldStreamStats | null;
  /** Builds the whole streamed ring around a point now (after the batches are built; a no-op in a small zone). */
  primeStream(x: number, z: number): void;
  /** True when the chunk under (x, z) is in the resident ring (always true in a small zone). Ambient life streams by it. */
  streamResident(x: number, z: number): boolean;
}

/** Every model url the open world needs (villages, roads, landmarks, scenery). Preloaded with the dungeon. */
export function worldAssetUrls(def: DungeonDef): string[] {
  const out = new Set<string>(worldSceneryUrls());
  out.add(WALL);
  out.add(WALL_CORNER);
  out.add(BRIDGE_DECK);
  out.add(PARAPET);
  out.add(POST_LANTERN);
  out.add(PATH_WOOD);
  out.add(gp('rock_large'));
  out.add(hw('post_skull'));
  for (const v of def.world?.villages ?? []) for (const p of v.props) out.add(p.model);
  for (const u of decorAssetUrls(def.world?.decor ?? [])) out.add(u);
  for (const u of namedLandmarkUrls()) out.add(u);
  return [...out];
}

// ---------------------------------------------------------------------------
// Atmosphere: fallback theme (the blend itself lives in RegionAtmosphere.ts)
// ---------------------------------------------------------------------------

/** Atmosphere used when the map has no region themes (keeps the dungeon's own fog and light). */
function fallbackTheme(def: DungeonDef): RegionTheme {
  const t = def.theme;
  return {
    fogColor: t.fogColor, fogNear: t.fogNear, fogFar: t.fogFar,
    hemiSky: t.hemiSky, hemiGround: t.hemiGround, hemiIntensity: 1.25,
    sunColor: 0xdfe8c8, sunIntensity: 1.05,
    skyZenith: t.hemiSky, skyHorizon: t.fogColor,
    groundTex: { grass: '', dirt: '', cobble: '', dark: '' },
    music: 'world_vale',
  };
}

// ---------------------------------------------------------------------------
// Runtime: OpenWorld handle
// ---------------------------------------------------------------------------

interface VfxLike { alive: boolean; stop(): void }

class OpenWorld implements WorldDecorHandle {
  readonly villages: VillageDef[];
  private curRegion: WorldRegion | null = null;
  private readonly atmo: RegionAtmosphere;
  private readonly regs: (WorldRegion | null)[];
  private px = 0;
  private pz = 0;
  private lastNear = -1;
  private lastFar = -1;
  private time = 0;
  private ambientTimer = 1;
  private readonly ambient: { h: VfxLike; t: number }[] = [];
  private readonly rng: RNG;
  /** Streamed zone: the fog never reaches past the built ring, so chunks never pop in view (content sets fogFar; this is the safety net). */
  private readonly fogFarCap: number;
  private streamFailed = false;
  /** Camera position the sky rings were last lifted for (relief zones). */
  private ringAt = { x: NaN, z: NaN };
  /** Dense grass near the camera (null in a zone without ground cover). */
  grass: GrassField | null = null;

  constructor(
    private readonly def: DungeonDef,
    private readonly host: WorldDecorHost,
    regs: (WorldRegion | null)[],
    regions: WorldRegion[],
    private readonly sky: Sky,
    private readonly rings: THREE.Mesh[],
    private readonly waters: { tex: THREE.Texture; speed: number }[],
    readonly culler: ChunkCuller,
    blendM: number,
    villages: VillageDef[],
    private readonly stream: WorldStream | null = null,
    private readonly night: NightLight | null = null,
  ) {
    this.villages = villages;
    this.fogFarCap = host.stream?.on ? host.stream.viewM - 24 : Infinity;
    this.regs = regs;
    this.rng = new RNG(hashString(def.id + ':ambient'));
    this.atmo = new RegionAtmosphere(regs, (i, j) => host.tileRoom(i, j), regions, fallbackTheme(def), blendM);
  }

  get region(): WorldRegion | null {
    return this.curRegion;
  }

  get streamVersion(): number {
    return this.stream?.version ?? 0;
  }

  streamStats(): WorldStreamStats | null {
    return this.stream?.stats ?? null;
  }

  primeStream(x: number, z: number): void {
    this.stream?.prime(x, z);
    this.culler.invalidate();
  }

  streamResident(x: number, z: number): boolean {
    if (!this.stream || !this.host.stream) return true;
    const size = this.host.stream.chunkM;
    return this.stream.visual.has(Math.floor(x / size), Math.floor(z / size));
  }

  setPlayerPos(x: number, z: number): void {
    this.px = x;
    this.pz = z;
  }

  regionAt(x: number, z: number): WorldRegion | null {
    const r = this.host.tileRoom(Math.floor(x / T), Math.floor(z / T));
    return r >= 0 ? this.regs[r] ?? null : null;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.grass) {
      const cam0 = G.engine?.activeCamera;
      this.grass.setDensity(G.settings?.data.grassDensity ?? 'mid');
      this.grass.update(this.time, dt, { x: this.px, z: this.pz }, cam0 ? { x: cam0.position.x, z: cam0.position.z } : { x: this.px, z: this.pz }, 0.9, 0.35);
    }
    // streamed zone: build / free the chunks around the player first, so the culler below sees them
    if (this.stream && !this.streamFailed) {
      try {
        if (this.stream.update(dt, this.px, this.pz)) this.culler.invalidate();
      } catch (e) {
        // never take the frame loop down: keep what is built, stop streaming
        this.streamFailed = true;
        console.warn('[world] chunk streaming failed, frozen at the current ring', e);
      }
    }
    this.atmo.update(this.px, this.pz);
    const r = this.regionAt(this.px, this.pz);
    if (r && r !== this.curRegion) this.enter(r);
    this.applyAtmosphere();

    const far = Math.min(this.atmo.cur.far, this.fogFarCap);
    const limits: Partial<Record<CullLayer, number>> = { tuft: 55, flower: 55, bush: 80, rock: 100, prop: 100, tree: far + 20, border: far };
    this.culler.limits = limits;
    // scatter layers draw in distance tiers (voxel LOD, world/Instancing LodSet); the plan object is cached, so it only changes with the fog or the quality
    this.culler.plans = lodPlans(far, getGfxQuality());
    this.culler.update(dt, this.px, this.pz);

    const cam = G.engine?.activeCamera;
    if (cam) {
      this.sky.update(cam, this.time);
      for (const ring of this.rings) ring.position.set(cam.position.x, 0, cam.position.z);
      this.followRings(cam.position.x, cam.position.z);
    }
    for (const w of this.waters) w.tex.offset.x += dt * w.speed / 8;
    this.updateAmbient(dt);
    this.night?.apply();
  }

  /** Relief zones: the sky rings stand on the ground under their radius; re-lifted every 4 m of camera travel (cheap: 72 samples). */
  private followRings(x: number, z: number): void {
    const relief = this.host.relief;
    if (!relief || this.rings.length === 0) return;
    if (Math.hypot(x - this.ringAt.x, z - this.ringAt.z) < 4) return;
    this.ringAt.x = x;
    this.ringAt.z = z;
    for (const ring of this.rings) liftRingToGround(ring, (px, pz) => relief.groundY(px, pz), x, z);
  }

  dispose(): void {
    try { G.engine?.setGrade(SCENE_GRADE); } catch { /* engine not ready (harness) */ }
    for (const a of this.ambient) {
      try { a.h.stop(); } catch { /* ignore */ }
    }
    this.ambient.length = 0;
    this.culler.limits = {};
  }

  /**
   * The player stepped into another region. The banner (ui:zoneName) and world:regionEntered (music, discovery XP) are emitted by
   * WorldRuntime.trackRegion, which owns the persisted first-entry flag; this only warns about a dangerous region.
   */
  private enter(r: WorldRegion): void {
    const initial = this.curRegion === null;
    this.curRegion = r;
    if (initial) return;
    try {
      const lvl = G.character?.level ?? 1;
      if (r.levels[0] >= lvl + 5) G.events.emit('ui:toast', { text: `Bu bölge sana göre tehlikeli (${r.levels[0]}-${r.levels[1]}. seviye).`, kind: 'warning' });
    } catch { /* feedback only */ }
  }

  private applyAtmosphere(): void {
    const c = this.atmo.cur, h = this.host;
    if (h.fog) {
      h.fog.color.copy(c.fog);
      h.fog.far = Math.min(c.far, this.fogFarCap);
      h.fog.near = this.fogFarCap < c.far ? Math.min(c.near, h.fog.far * 0.8) : c.near;
    }
    const bg = h.scene.background;
    if (bg && (bg as THREE.Color).isColor) (bg as THREE.Color).copy(c.fog);
    if (h.hemi) {
      h.hemi.color.copy(c.hemiSky);
      h.hemi.groundColor.copy(c.hemiGround);
      h.hemi.intensity = c.hemiI;
    }
    if (h.sun) {
      h.sun.color.copy(c.sunC);
      h.sun.intensity = c.sunI;
    }
    try { G.engine?.setGrade(c); } catch { /* engine not ready (harness) */ }
    this.sky.setColors({
      zenith: c.zen.getHex(), mid: c.mid.getHex(), horizon: c.hor.getHex(), sunColor: c.sunC.getHex(),
      cloudLight: c.cloudL.getHex(), cloudShade: c.cloudS.getHex(),
    });
    if (Math.abs(c.near - this.lastNear) > 0.3 || Math.abs(c.far - this.lastFar) > 0.3) {
      this.lastNear = c.near;
      this.lastFar = c.far;
      h.onFog?.(c.near, c.far);
    }
  }

  /** Region ambience: a short-lived VFX spawn 4-24 m around the player every 2.5-4.5 s (max 6 alive). The kind follows the blend. */
  private updateAmbient(dt: number): void {
    for (let k = this.ambient.length - 1; k >= 0; k--) {
      const a = this.ambient[k];
      a.t -= dt;
      if (a.t <= 0 || !a.h.alive) {
        try { a.h.stop(); } catch { /* ignore */ }
        this.ambient.splice(k, 1);
      }
    }
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = this.rng.range(2.5, 4.5);
    if (this.ambient.length >= 6) return;
    const pick = this.atmo.pickAmbient(this.rng.next());
    if (!pick) return;
    const a = this.rng.range(0, PI * 2), d = this.rng.range(4, 24);
    const ax = this.px + Math.cos(a) * d, az = this.pz + Math.sin(a) * d;
    const pos: [number, number, number] = [ax, (this.host.relief ? this.host.relief.groundY(ax, az) : 0) + this.rng.range(0.8, 3), az];
    try {
      const h = G.vfx.spawn(pick.id, pos, { scale: 1, color: pick.color }) as VfxLike;
      this.ambient.push({ h, t: 9 });
    } catch { /* unknown or unavailable vfx id: silent */ }
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

interface Sample { x: number; z: number; ux: number; uz: number }

/** Points every `step` metres along a road polyline (tile coords -> world), with the local direction. */
function sampleRoad(pts: [number, number][], step: number): Sample[] {
  const out: Sample[] = [];
  let carry = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = tileCentre(pts[i][0]), az = tileCentre(pts[i][1]);
    const bx = tileCentre(pts[i + 1][0]), bz = tileCentre(pts[i + 1][1]);
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-3) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    let d = carry;
    while (d < len) {
      out.push({ x: ax + ux * d, z: az + uz * d, ux, uz });
      d += step;
    }
    carry = d - len;
  }
  return out;
}

function buildWater(id: string, rect: { x: number; z: number; w: number; h: number }, seed: string, colour: number, host: WorldDecorHost, waters: { tex: THREE.Texture; speed: number }[], y = 0.03): void {
  const w = rect.w * T, d = rect.h * T;
  const base = surfaceTexture('water', seed + id, 64);
  const tex = base.clone();
  tex.repeat.set(w / 8, d / 8);
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: colour, transparent: true, opacity: 0.84, depthWrite: false });
  patchPSX(mat);
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((rect.x + rect.w / 2) * T, y, (rect.z + rect.h / 2) * T);
  mesh.name = `water:${id}`;
  host.root.add(mesh);
  host.disposables.push({ dispose() { geo.dispose(); mat.dispose(); tex.dispose(); } });
  waters.push({ tex, speed: 0.04 });
}

/** Stone bridge deck (4 m plates) with drystone parapets on both sides; the parapets block the nav. */
function buildBridge(r: RoadDef, host: WorldDecorHost): void {
  const deckScale = fitScale(BRIDGE_DECK, 4);
  for (const s of sampleRoad(r.pts, 4)) host.batcher.add(BRIDGE_DECK, s.x, 0.02, s.z, 0, deckScale, null, { cast: false, receive: true, layer: 'prop' });
  const off = r.width / 2 + 0.45;
  const sc = fitScale(PARAPET, 2.5);
  for (const s of sampleRoad(r.pts, 2.5)) {
    const px = -s.uz, pz = s.ux;
    for (const side of [1, -1]) {
      const x = s.x + px * off * side, z = s.z + pz * off * side;
      host.batcher.add(PARAPET, x, 0, z, yawAlong(PARAPET, s.ux, s.uz), sc, null, { cast: true, receive: true, layer: 'prop' });
      host.nav.setCircle(x, z, 0.6, false);
    }
  }
}

/** Boardwalk boards along the road centre; a cyan post lantern every ~24 m with a real light. */
function buildBoardwalk(r: RoadDef, host: WorldDecorHost, lightsOn: boolean): void {
  const L = getPiece(PATH_WOOD)?.size;
  const step = L ? Math.max(0.6, Math.min(2, Math.max(L.x, L.z))) : 1;
  const every = Math.max(1, Math.round(24 / step));
  sampleRoad(r.pts, step).forEach((s, k) => {
    host.batcher.add(PATH_WOOD, s.x, 0, s.z, yawAlong(PATH_WOOD, s.ux, s.uz), 1, null, { cast: false, receive: true, layer: 'prop' });
    if (k % every !== 0) return;
    const px = -s.uz * (r.width / 2 + 0.9), pz = s.ux * (r.width / 2 + 0.9);
    const x = s.x + px, z = s.z + pz;
    host.batcher.add(POST_LANTERN, x, 0, z, 0, 1, null, { cast: true, receive: true, layer: 'prop' });
    if (lightsOn) host.lights.add([x, 2.4, z], { color: 0x60ffd0, intensity: designToPhysical(1.1), distance: 6, flicker: 0.2 });
  });
}

/** Palisade walls from the village bounds, with gaps at the gates, corner towers. */
function buildPalisade(v: VillageDef, ox: number, oz: number, host: WorldDecorHost): void {
  const piece = getPiece(WALL);
  if (!piece) return;
  const len = Math.max(piece.size.x, piece.size.z) || 4;
  const [bx, bz] = v.bounds;
  const corners: [number, number][] = [[-bx, -bz], [bx, -bz], [bx, bz], [-bx, bz]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k], [cx2, cz2] = corners[(k + 1) % 4];
    const L = Math.hypot(cx2 - ax, cz2 - az);
    const n = Math.max(1, Math.round(L / len));
    const step = L / n;
    const ux = (cx2 - ax) / L, uz = (cz2 - az) / L;
    for (let i = 0; i < n; i++) {
      const mx = ax + ux * step * (i + 0.5), mz = az + uz * step * (i + 0.5);
      if (v.gates.some((g) => Math.hypot(mx - g.pos[0], mz - g.pos[1]) < g.width / 2 + step / 2)) continue;
      const wx = ox + mx, wz = oz + mz;
      host.batcher.add(WALL, wx, 0, wz, yawAlong(WALL, ux, uz), step / len, null, { cast: true, receive: true, layer: 'prop' });
      const hx = Math.abs(ux) * step / 2 + 0.6 * Math.abs(uz), hz = Math.abs(uz) * step / 2 + 0.6 * Math.abs(ux);
      host.nav.setRect(wx - hx, wz - hz, wx + hx, wz + hz, false);
    }
  }
  for (const [cx2, cz2] of corners) {
    host.batcher.add(WALL_CORNER, ox + cx2, 0, oz + cz2, 0, 1, null, { cast: true, receive: true, layer: 'prop' });
    host.nav.setCircle(ox + cx2, oz + cz2, 1.2, false);
  }
}

/** Signature landmark per region (GDD_OPENWORLD §8.2), built from existing kit models. Unknown recipes do nothing. */
function placeLandmark(lm: LandmarkDef, x: number, z: number, host: WorldDecorHost, lightsOn: boolean): void {
  const rng = new RNG(hashString(lm.id + ':landmark'));
  // a landmark of the fill pass (id lm_f*, tools/world-fill.mjs) casts shadow from its tower or castle only (`main`): its other pieces
  // are many small casters, and those cost the shadow pass (WorldDecorFill.placeNamedLandmark casts none). Hand-placed ones cast as before.
  const fill = /^lm_f\d+$/.test(lm.id);
  const add = (url: string, px: number, py: number, pz: number, rot: number, s: number, main = false): void =>
    host.batcher.add(url, px, py, pz, rot, s, null, { cast: main || !fill, receive: true, layer: 'prop' });
  switch (lm.recipe) {
    case 'windmill_cluster': {
      add(kf('windmill'), x, 0, z, 0, 4);
      host.nav.setCircle(x, z, 3.5, false);
      add(gp('sacks'), x + 4.5, 0, z + 2, 0.4, 1.1);
      add(gp('crate_a'), x - 4, 0, z + 2.5, 0.2, 1.1);
      add(gp('barrel'), x + 3, 0, z - 3.5, 0, 1);
      return;
    }
    case 'mushroom_ring': {
      for (let k = 0; k < 22; k++) {
        const ang = (k / 22) * PI * 2 + rng.range(-0.1, 0.1), r = rng.range(14, 17);
        add(rng.pick(MUSHROOMS), x + Math.cos(ang) * r, 0, z + Math.sin(ang) * r, rng.range(0, PI * 2), rng.range(3, 4.4));
      }
      return;
    }
    case 'watch_tower_ruin': {
      const tower = ip('nocturnal-watch', 'tower');
      add(tower, x, 0, z, 0, fitHeight(tower, 14), true);
      host.nav.setCircle(x, z, 3, false);
      add(gp('rock_large'), x + 5, 0, z + 3, 0.7, 1.2);
      add(gp('rock_large'), x - 4, 0, z - 4, 2.1, 0.9);
      add(kc('wall-half'), x + 4, 0, z - 6, 0.5, fitScale(kc('wall-half'), 3));
      return;
    }
    case 'dead_tree_lanterns': {
      for (let k = 0; k < 3; k++) {
        const ang = k * 2.1;
        add(gp('tree_dead'), x + Math.cos(ang) * 6, 0, z + Math.sin(ang) * 6, rng.range(0, PI * 2), 1.6);
      }
      add(gp('cauldron'), x, 0, z, 0, 1.2);
      add(hw('post_skull'), x - 3, 0, z + 3, 0, 1.2);
      for (let k = 0; k < 3; k++) {
        const ang = 0.6 + k * 2.1, r = 3.5;
        const lx = x + Math.cos(ang) * r, lz = z + Math.sin(ang) * r;
        add(POST_LANTERN, lx, 0, lz, 0, 1.2);
        if (lightsOn) host.lights.add([lx, 2.6, lz], { color: 0x60ffd0, intensity: designToPhysical(1.4), distance: 8, flicker: 0.3, priority: 1 });
      }
      return;
    }
    case 'red_castle_ruin': {
      const castle = tw('buildings/red/building_castle_red');
      add(castle, x, 0, z, 0.3, fitHeight(castle, 14), true);
      host.nav.setCircle(x, z, 6, false);
      for (let k = 0; k < 4; k++) {
        const ang = 0.5 + k * (PI / 2), r = 13;
        add(kc('wall-half'), x + Math.cos(ang) * r, 0, z + Math.sin(ang) * r, ang + PI / 2, fitScale(kc('wall-half'), 3));
      }
      return;
    }
    case 'obelisk_shrine': {
      for (let k = 0; k < 9; k++) {
        const ang = (k / 9) * PI * 2, r = 8;
        const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
        add(kg('pillar-obelisk'), px, 0, pz, 0, 1.2);
        host.nav.setCircle(px, pz, 0.8, false);
      }
      add(hw('shrine'), x, 0, z, 0, 1.2);
      if (lightsOn) host.lights.add([x, 2.2, z], { color: 0xb060ff, intensity: designToPhysical(1.2), distance: 10, flicker: 0.25, priority: 2 });
      return;
    }
    default:
      // the silhouettes added with the fill pass (standing stones, giant tree, broken pier, roadside chapel)
      placeNamedLandmark(lm, x, z, host);
      return;
  }
}

/** Runs one optional decor block; a failure is reported and the rest of the map still builds. */
function guard(label: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    console.warn(`[world] ${label} failed`, e);
  }
}

/**
 * Builds the open-world decor (called by DungeonBuilder after the props, before the batches are built). Order: avoid list,
 * ground (splat + tint), sky and rings, water, bridge / boardwalks, villages (props + palisade), landmarks, scatter.
 * Never throws for missing data: every block degrades to nothing.
 */
export async function buildWorldDecor(def: DungeonDef, host: WorldDecorHost): Promise<WorldDecorHandle> {
  const world = def.world;
  if (!world) return new OpenWorld(def, host, [], [], new Sky(), [], [], new ChunkCuller(host.batcher, 40), DEFAULT_BLEND_M, []);
  const W = host.W, H = host.H;
  const cx = (W * T) / 2, cz = (H * T) / 2;
  const regs = regionsByRoom(def);
  const regionAtTile = (i: number, j: number): WorldRegion | null => {
    const r = host.tileRoom(i, j);
    return r >= 0 ? regs[r] ?? null : null;
  };
  const lightsOn = true;

  // ---- avoid list: POIs keep scatter away (radii: tiles converted to metres where the data says tiles) ----
  for (const v of world.villages) host.avoid.push({ x: tileCentre(v.center[0]), z: tileCentre(v.center[1]), r: Math.max(v.bounds[0], v.bounds[1]) + 10 });
  for (const lm of world.landmarks) host.avoid.push({ x: tileCentre(lm.pos[0]), z: tileCentre(lm.pos[1]), r: 12 });
  for (const b of def.bosses) host.avoid.push({ x: tileCentre(b.pos[0]), z: tileCentre(b.pos[1]), r: 16 });
  for (const m of world.metin.spots) host.avoid.push({ x: tileCentre(m.pos[0]), z: tileCentre(m.pos[1]), r: 6 });
  for (const rr of world.rares) for (const s of rr.spots) host.avoid.push({ x: tileCentre(s[0]), z: tileCentre(s[1]), r: 6 });
  for (const mb of world.minibosses) host.avoid.push({ x: tileCentre(mb.lair[0]), z: tileCentre(mb.lair[1]), r: 10 });
  for (const g of world.gather) host.avoid.push({ x: tileCentre(g.center[0]), z: tileCentre(g.center[1]), r: g.radius * T });
  for (const h of world.hidden) host.avoid.push({ x: tileCentre(h.pos[0]), z: tileCentre(h.pos[1]), r: h.radius * T });
  for (const p of [...world.shrines, ...world.chests, ...world.cursed, ...world.vistas, ...world.waypoints]) host.avoid.push({ x: tileCentre(p.pos[0]), z: tileCentre(p.pos[1]), r: 3 });
  for (const e of world.entrances) host.avoid.push({ x: tileCentre(e.pos[0]), z: tileCentre(e.pos[1]), r: 4 });

  // ---- ground: splat ops + region tint (one 2048 splat, 640 m tint) ----
  const ops: SplatOp[] = worldSplatOps(def, cx, cz);
  const tint = worldTintRGB(def);
  const stream = host.stream?.on ? host.stream : null;
  let weights: (x: number, z: number) => { dirt: number; cobble: number; dark: number };
  let chunkTerrain: ChunkedTerrain | null = null;
  if (stream) {
    // big zone: one flat quad + one small splat per chunk, built when the streamer asks (WorldStream)
    chunkTerrain = new ChunkedTerrain({
      seed: def.id, ops, mapCx: cx, mapCz: cz, chunkM: stream.chunkM, grassTint: 0xffffff,
      tint: { w: tint.w, h: tint.h, rgb: tint.rgb, snow: tint.snow, half: Math.max(cx, cz) }, parent: host.root, relief: host.relief ?? null,
    });
    const ct = chunkTerrain;
    weights = (x, z) => ct.weights(x, z);
  } else {
    const terrain: Terrain = createTerrain({
      // rolling terrain: 440 m around the centre (80k triangles at 4 m cells; the fog hides what is beyond); flat ground keeps 480 m / 10 m cells
      half: host.relief ? 440 : 480, splatHalf: Math.max(cx, cz) + 6, splatRes: 2048, seed: def.id, ops, cell: 10, grassTint: 0xffffff,
      tint: { w: tint.w, h: tint.h, rgb: tint.rgb, snow: tint.snow, half: Math.max(cx, cz) },
      relief: host.relief ? { relief: host.relief, centreX: cx, centreZ: cz } : undefined,
    });
    terrain.mesh.position.set(cx, 0, cz);
    host.root.add(terrain.mesh);
    freezeStatic(terrain.mesh); // placed once, never moves
    host.disposables.push(terrain);
    weights = (x, z) => terrain.weights(x - cx, z - cz);
  }

  // ---- sky dome + far mountain rings (beyond the map edge, above the fog) ----
  const first = world.regions[0] ?? null;
  const a0 = first ? atmoOf(first.theme) : null;
  const sky = new Sky({
    zenith: a0?.zen.getHex() ?? 0x8fa090, mid: a0?.mid.getHex() ?? 0x9aa890, horizon: a0?.hor.getHex() ?? def.theme.fogColor,
    sunColor: a0?.sunC.getHex() ?? 0xdce8b8, sunDir: [-0.45, 0.8, -0.4],
    cloudLight: a0?.cloudL.getHex() ?? 0xdfe6d8, cloudShade: a0?.cloudS.getHex() ?? 0x5c6650, cloudCover: 0.55,
  });
  host.root.add(sky.dome);
  host.disposables.push(sky);
  const rings: THREE.Mesh[] = [];
  const ring = (radius: number, minH: number, maxH: number, base: number, hazeAmt: number, seed: string, baseHaze = 0): void => {
    const m = makeMountainRing({ radius, minH, maxH, segments: 72, seed: def.id + seed, baseColor: base, rockColor: base, haze: def.theme.fogColor, hazeAmount: hazeAmt, baseHaze, slope: 1.2 });
    host.root.add(m);
    rings.push(m);
    host.disposables.push({ dispose: () => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  };
  // less haze than before: the rings read as dark forested hills against the fog instead of grey slabs
  ring(430, 20, 60, 0x2a3a2a, 0.35, ':far', 0.85);
  ring(380, 6, 20, 0x233222, 0.25, ':near');

  // ---- water ----
  // every optional block below degrades to a warning: a broken scenery entry must not fail the map load
  const waters: { tex: THREE.Texture; speed: number }[] = [];
  guard('water', () => {
    world.water.forEach((wt, wi) => {
      const i = Math.floor((wt.rect.x + wt.rect.w / 2)), j = Math.floor((wt.rect.z + wt.rect.h / 2));
      const reg = regionAtTile(i, j) ?? regionAtTile(i - 1, j);
      // rolling terrain: each lake lies at the height of its valley (Relief.waterLevels); flat zones keep the plane at 0.03
      buildWater(wt.id, wt.rect, def.id, reg?.id === 'r4' ? 0x3f7a5a : 0x3f7f9a, host, waters, host.relief ? host.relief.waterY(wi) : 0.03);
    });
  });

  // ---- roads: bridge deck and boardwalks (dirt / cobble are splat only) ----
  guard('roads', () => {
    for (const r of world.roads) {
      if (r.kind === 'bridge') buildBridge(r, host);
      else if (r.kind === 'boardwalk') buildBoardwalk(r, host, lightsOn);
    }
  });

  // ---- villages: props (shared TownBuilder helper) and palisades; two procedural houses each; night pools under the lamps ----
  const night = new NightLight({ scene: host.scene, hemi: host.hemi, sun: host.sun, sky });
  host.disposables.push({ dispose: () => night.dispose() });
  const houses = new HouseKit();
  const gy = (x: number, z: number): number => (host.relief ? host.relief.groundY(x, z) : 0);
  for (const [vi, v] of world.villages.entries()) {
    const ox = tileCentre(v.center[0]), oz = tileCentre(v.center[1]);
    try {
      await placeTownProps(v.props, { x: ox, z: oz }, host);
      buildPalisade(v, ox, oz, host);
      const kit = new MagitechKit();
      addVillageMagitech(kit, ox, oz, v.bounds, gy);
      kit.build();
      host.root.add(kit.root);
      host.disposables.push({ dispose: () => kit.dispose() });
      night.addPools(host.root, kit.lampSpots());
      addVillageHouses(houses, v, ox, oz, vi, host, gy);
    } catch (e) {
      console.warn('[world] village failed', v.id, e);
    }
  }
  houses.build();
  host.root.add(houses.root);
  host.disposables.push({ dispose: () => houses.dispose() });

  // ---- landmarks ----
  guard('landmarks', () => {
    for (const lm of world.landmarks) placeLandmark(lm, tileCentre(lm.pos[0]), tileCentre(lm.pos[1]), host, lightsOn);
  });
  // ---- decor: vignettes, fields, signposts, filler clusters (before scatter, so scatter keeps clear of them) ----
  guard('decor', () => placeDecor(world.decor ?? [], host));

  // ---- scatter (borders, forests, regions, specials) ----
  let worldStream: WorldStream | null = null;
  if (stream && chunkTerrain) {
    // streamed zone: the scatter is a pure per-chunk generator, run by WorldStream as chunks come into range
    const scatter = new ChunkScatter({
      def, W, H, chunkM: stream.chunkM, avoid: host.avoid,
      tileRoom: (i, j) => host.tileRoom(i, j),
      hasH: (i, j) => host.hasH(i, j),
      hasV: (i, j) => host.hasV(i, j),
      weights,
    });
    worldStream = new WorldStream({
      cfg: stream, tilesW: W, tilesH: H, batcher: host.batcher, nav: host.nav, terrain: chunkTerrain, scatter,
      players: () => (G.world?.players ?? []).filter((p) => !p.removed).map((p) => ({ x: p.position.x, z: p.position.z })),
    });
    const ws = worldStream, ct = chunkTerrain;
    host.disposables.push({ dispose() { ws.dispose(); ct.dispose(); } });
  } else {
    guard('scatter', () => {
      new WorldScatter({
        def, W, H, batcher: host.batcher, nav: host.nav, avoid: host.avoid,
        isAvoided: (x, z, p) => host.isAvoided(x, z, p),
        tileRoom: (i, j) => host.tileRoom(i, j),
        hasH: (i, j) => host.hasH(i, j),
        hasV: (i, j) => host.hasV(i, j),
        weights,
      }).run();
    });
  }

  // ---- grass: dense stylized blades + flowers near the camera (one draw call each; density from Settings.grassDensity) ----
  const grass = new GrassField({
    parent: host.root,
    ground: (x, z) => weights(x, z),
    height: (x, z) => (host.relief ? host.relief.groundY(x, z) : 0) + 0.03,
    clear: (x, z) => host.nav.isWalkable(x, z) && !host.isAvoided(x, z, 1.5) && (!host.relief || host.relief.slopeAt(x, z) < 0.6),
    palette: (x, z) => {
      const r = regionAtTile(Math.floor(x / T), Math.floor(z / T));
      return grassPaletteFor(r?.id ?? null, (r?.theme.snowCover ?? 0) > 0.5);
    },
  }, hashString(def.id + ':grass') >>> 0);

  const culler = new ChunkCuller(host.batcher, stream ? stream.chunkM : world.perf?.chunkM ?? 40);
  const blendM = world.regions.reduce((m, r) => Math.max(m, r.blendM ?? 0), 0) || DEFAULT_BLEND_M;
  const ow = new OpenWorld(def, host, regs, world.regions, sky, rings, waters, culler, blendM, world.villages, worldStream, night);
  ow.grass = grass;
  host.disposables.push(grass);
  return ow;
}

/**
 * Two house lots of a village (pure): the inner cells with the most clearance from its props, at least 9 m clear of them, 14 m
 * apart, and inside the palisade with a margin. The cross roads (|x| or |z| under 5 m: the gates and the square) stay free.
 */
export function villageLots(bounds: [number, number], props: { pos: [number, number, number] }[]): [number, number][] {
  const [bx, bz] = bounds;
  const cands: [number, number, number][] = [];
  for (let x = -(bx - 9); x <= bx - 9; x += 3) {
    for (let z = -(bz - 9); z <= bz - 9; z += 3) {
      if (Math.abs(x) < 5 || Math.abs(z) < 5) continue;
      let clear = Infinity;
      for (const p of props) clear = Math.min(clear, Math.hypot(p.pos[0] - x, p.pos[2] - z));
      if (clear >= 9) cands.push([x, z, clear]);
    }
  }
  cands.sort((a, b) => b[2] - a[2]);
  const out: [number, number][] = [];
  for (const [x, z] of cands) {
    if (out.every(([px, pz]) => Math.hypot(px - x, pz - z) >= 14)) out.push([x, z]);
    if (out.length >= 2) break;
  }
  return out;
}

/** Adds the village's two houses to the shared HouseKit: the door faces the square, the roof colour follows the village. */
function addVillageHouses(houses: HouseKit, v: VillageDef, ox: number, oz: number, index: number, host: WorldDecorHost, gy: (x: number, z: number) => number): void {
  const roofs = [ROOF.red, ROOF.teal, ROOF.blue, ROOF.purple];
  villageLots(v.bounds, v.props).forEach(([dx, dz], k) => {
    const x = ox + dx, z = oz + dz;
    houses.add({ arch: k === 0 ? 'timber' : 'hall', x, y: gy(x, z), z, rotY: Math.atan2(-dx, -dz), roof: roofs[(index + k) % roofs.length] });
    host.nav.setRect(x - 2.6, z - 2.6, x + 2.6, z + 2.6, false);
  });
}
