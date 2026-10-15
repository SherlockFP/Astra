import * as THREE from 'three';
import { G } from '../../game/G';
import { NPC, npcModelUrl, resolvePreset } from '../../entities/NPC';
import { RNG, hashString } from '../../core/utils';
import { ParticleField } from '../../world/Particles';
import { glowTexture } from '../../world/ProceduralAssets';
import type { World } from '../../world/World';
import type { WorldDecorHandle } from '../../world/WorldDecor';
import type { AmbientCritterZone, AmbientDef, AmbientDeerHerd, AmbientGlow, AmbientSmoke, CritterKind } from '../../types/ambient';
import type { PackDef, TownNpc, WorldExtras } from '../../types/dungeons';
import { tileToWorld } from './util';
import { CritterField, WildDeer, DEER_URL, BUTTERFLY_REACH, crowGeo, type Critter } from './AmbientCritters';

/**
 * Ambient life of an open-world zone (types/ambient.ts; the content is data, e.g. src/data/world/sisli_ambient.ts). OWNER: scenes module.
 *  - walkers: TownNpc routines (entities/NPC.ts, role citizen or guard: no panel, no quest) spawned while their anchor chunk is in the
 *    stream ring (WorldDecorHandle.streamResident) and removed when it leaves it; they keep their place on the routine (the clock is
 *    the world clock), so a walker that streams out and back in is where it should be;
 *  - critters: cosmetic pools (AmbientCritters.ts), one zone = one patch, active while its centre chunk is resident; no critter is
 *    placed on unwalkable ground, in water (frogs: on the shore), inside an enemy camp ring (+12 m) or inside a village, and while it
 *    wanders, lands or flees it only takes points inside its own patch that pass the same rule (a butterfly: its whole orbit);
 *  - deer herds: neutral skinned deer, active while their centre chunk is resident;
 *  - cues: chimney smoke and lit windows / torches as ParticleFields, one per 64 m cell, active while the cell is resident.
 * Local to every peer, no network. A small zone (no stream) has every chunk resident, so everything spawns at once.
 * `?ambient=0` in the URL turns the whole layer off (QA: the FPS before / after measure).
 */

/** Enemy camp ring margin (m): nothing ambient is placed closer to a camp centre than its radius plus this. */
export const CAMP_MARGIN_M = 12;
/** Seconds between two streaming decisions (spawn / park), and the most walkers started per decision. */
const TICK = 0.25;
const MAX_WALKER_STARTS = 3;
/** Cue cell edge (m) for the smoke and glow fields. */
const CELL_M = 64;
/** Distance culling (m from the local player): critter patches and deer herds are live inside the ON radius and parked beyond the OFF radius
 * (plus their own radius), so the far ring costs nothing. Deer are the heavy ones (5.4k triangles each). */
const CRITTER_ON_M = 110, CRITTER_OFF_M = 140;
const DEER_ON_M = 100, DEER_OFF_M = 130;

/** The layer is on unless the URL says `ambient=0` (QA switch). */
export function ambientEnabled(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('ambient') !== '0';
  } catch {
    return true;
  }
}

interface Walker { def: TownNpc; npc: NPC | null; loading: boolean; cancel: boolean; anchor: [number, number] }
interface ZoneRun { zone: AmbientCritterZone; critters: Critter[]; on: boolean; centre: [number, number] }
interface HerdRun { herd: AmbientDeerHerd; deer: WildDeer[] | null; centre: [number, number] }
interface Cell { cx: number; cz: number; smoke: AmbientSmoke[]; glow: AmbientGlow[]; field: ParticleField[] | null }

export interface AmbientLifeOpts {
  world: World;
  scene: THREE.Scene;
  decor: WorldDecorHandle | null;
  ext: WorldExtras;
  /** The zone's packs (camps and patrols): the enemy rings the ambient layer keeps clear of. */
  packs: PackDef[];
  seed: string;
}

export class AmbientLife {
  private readonly data: AmbientDef;
  private walkers: Walker[] = [];
  private zones: ZoneRun[] = [];
  private herds: HerdRun[] = [];
  private cells: Cell[] = [];
  private field: CritterField | null = null;
  private puff: THREE.Texture | null = null;
  private glow: THREE.Texture | null = null;
  private timer = 0;
  private time = 0;
  private disposed = false;
  private readonly waterRects: { x0: number; z0: number; x1: number; z1: number }[];
  private readonly camps: { x: number; z: number; r: number; pts: [number, number][] | null }[];
  private readonly villages: { x: number; z: number; hx: number; hz: number }[];

  constructor(private readonly o: AmbientLifeOpts) {
    this.data = o.ext.ambient!;
    this.waterRects = o.ext.water.map((w) => ({
      x0: w.rect.x * 4, z0: w.rect.z * 4, x1: (w.rect.x + w.rect.w) * 4, z1: (w.rect.z + w.rect.h) * 4,
    }));
    this.camps = o.packs.map((pk) => ({
      x: tileToWorld(pk.center[0]),
      z: tileToWorld(pk.center[1]),
      r: pk.radius ?? 12,
      pts: pk.patrol?.length ? pk.patrol.map(([tx, tz]) => [tileToWorld(tx), tileToWorld(tz)] as [number, number]) : null,
    }));
    this.villages = o.ext.villages.map((v) => ({
      x: tileToWorld(v.center[0]),
      z: tileToWorld(v.center[1]),
      hx: v.bounds[0] + 2,
      hz: v.bounds[1] + 2,
    }));
  }

  /** Loads the models, lays out the critter and herd patches, builds the cues. Never throws (the caller guards it). */
  async start(): Promise<void> {
    const urls = new Set<string>([DEER_URL, '/assets/models/itch/nocturnal-watch/crow.glb', '/assets/models/kenney/fantasy-town-kit/cart.glb']);
    for (const n of this.data.npcs) urls.add(npcModelUrl(resolvePreset(n).base));
    await G.assets.loadMany([...urls]);
    if (this.disposed) return;
    this.puff = glowTexture(32, 5, 1.0);
    this.glow = glowTexture(32, 6, 1.4);

    // walkers: one NPC per routine, spawned by streaming
    this.walkers = this.data.npcs
      .filter((n) => n.routine && n.routine.stops.length)
      .map((def) => ({ def, npc: null, loading: false, cancel: false, anchor: def.routine!.stops[0].pos }));

    // critters: every point laid out once, deterministic from the zone id
    const capacity: Record<CritterKind, number> = { rabbit: 0, bird: 0, butterfly: 0, frog: 0, chicken: 0 };
    for (const z of this.data.critters) capacity[z.kind] += z.count;
    if (this.disposed) return;
    this.field = new CritterField(this.o.scene, this.o.world, this.birdGeometry(), capacity, {
      place: (kind, x, z) => this.placeable(kind, x, z),
      air: (x, z) => !this.inCamp(x, z),
    });
    this.zones = this.data.critters.map((zone) => {
      const centre = zone.center;
      const rng = new RNG(hashString(`${this.o.seed}:critter:${zone.id}`));
      // a critter wanders, lands and flees only inside its own patch (AmbientCritters.fits)
      const patch = { x: zone.center[0], z: zone.center[1], r: zone.radius };
      const critters = this.layOut(zone.kind, zone.center, zone.radius, zone.count, rng).map((p) => this.field!.create(zone.kind, p[0], p[1], rng, patch));
      return { zone, critters, on: false, centre };
    });
    this.herds = this.data.herds.map((herd) => ({ herd, deer: null, centre: herd.center }));

    // cues: chimney smoke and lit windows, grouped per 64 m cell
    const cells = new Map<number, Cell>();
    const cellOf = (p: [number, number]): Cell => {
      const cx = Math.floor(p[0] / CELL_M), cz = Math.floor(p[1] / CELL_M);
      const k = cx * 100003 + cz;
      let c = cells.get(k);
      if (!c) cells.set(k, (c = { cx, cz, smoke: [], glow: [], field: null }));
      return c;
    };
    for (const s of this.data.smoke) cellOf(s.pos).smoke.push(s);
    for (const g of this.data.glows) cellOf(g.pos).glow.push(g);
    this.cells = [...cells.values()];
    this.update(0);
  }

  /** Per frame (WorldRuntime.update): the streaming decisions every TICK, then the per-frame motion of what is on. */
  update(dt: number): void {
    if (this.disposed || !this.field) return;
    this.time += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = TICK;
      try {
        this.stream();
      } catch (e) {
        console.warn('[ambient] streaming failed', e);
      }
    }
    const p = this.o.world.localPlayer?.position;
    const px = p?.x ?? 0, pz = p?.z ?? 0;
    this.field.update(dt, px, pz);
    for (const h of this.herds) for (const d of h.deer ?? []) d.update(dt, px, pz);
    for (const c of this.cells) if (c.field) for (const f of c.field) f.update(this.time);
  }

  /** Stops everything: walkers removed, pools and fields disposed. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const w of this.walkers) {
      w.cancel = true;
      if (w.npc) this.o.world.remove(w.npc);
      w.npc = null;
    }
    for (const z of this.zones) for (const c of z.critters) this.field?.park(c);
    for (const h of this.herds) {
      for (const d of h.deer ?? []) d.dispose();
      h.deer = null;
    }
    for (const c of this.cells) this.dropCell(c);
    this.field?.dispose();
    this.field = null;
  }

  // ------------------------------------------------------------------------------------------------------------------------------
  // streaming
  // ------------------------------------------------------------------------------------------------------------------------------

  private resident(x: number, z: number): boolean {
    return !this.o.decor || this.o.decor.streamResident(x, z);
  }

  private stream(): void {
    const pl = this.o.world.localPlayer?.position;
    const near = (x: number, z: number, reach: number): boolean => !pl || Math.hypot(pl.x - x, pl.z - z) < reach;
    let starts = 0;
    for (const w of this.walkers) {
      const want = this.resident(w.anchor[0], w.anchor[1]);
      if (want && !w.npc && !w.loading && starts < MAX_WALKER_STARTS) {
        starts++;
        this.startWalker(w);
      } else if (!want && (w.npc || w.loading)) {
        w.cancel = true;
        if (w.npc) this.o.world.remove(w.npc);
        w.npc = null;
      }
    }
    for (const z of this.zones) {
      const want = this.resident(z.centre[0], z.centre[1]) && near(z.centre[0], z.centre[1], (z.on ? CRITTER_OFF_M : CRITTER_ON_M) + z.zone.radius);
      if (want && !z.on) {
        z.on = true;
        for (const c of z.critters) this.field?.activate(c);
      } else if (!want && z.on) {
        z.on = false;
        for (const c of z.critters) this.field?.park(c);
      }
    }
    for (const h of this.herds) {
      const want = this.resident(h.centre[0], h.centre[1]) && near(h.centre[0], h.centre[1], (h.deer ? DEER_OFF_M : DEER_ON_M) + h.herd.radius);
      if (want && !h.deer) h.deer = this.spawnHerd(h.herd);
      else if (!want && h.deer) {
        for (const d of h.deer) d.dispose();
        h.deer = null;
      }
    }
    for (const c of this.cells) {
      const want = this.resident((c.cx + 0.5) * CELL_M, (c.cz + 0.5) * CELL_M);
      if (want && !c.field) this.buildCell(c);
      else if (!want && c.field) this.dropCell(c);
    }
  }

  private startWalker(w: Walker): void {
    const npc = new NPC(this.o.world.allocLocalId(), w.def);
    npc.object3d.userData.ambient = true;
    const [x, z] = w.anchor;
    npc.position.set(x, this.o.world.groundY(x, z), z);
    w.loading = true;
    w.cancel = false;
    npc.load().then(
      () => {
        w.loading = false;
        if (w.cancel || this.disposed) return;
        this.o.world.add(npc);
        w.npc = npc;
      },
      (err) => {
        w.loading = false;
        console.warn(`[ambient] walker ${w.def.id} failed to load`, err);
      },
    );
  }

  // ------------------------------------------------------------------------------------------------------------------------------
  // placement
  // ------------------------------------------------------------------------------------------------------------------------------

  /**
   * Points of one patch: walkable, outside water (frogs: on the shore), outside camp rings and villages, 1.5 m apart. A butterfly point
   * also needs its whole orbit to fit (orbitClear), since a butterfly flies its orbit and does not stay on its home point.
   */
  private layOut(kind: CritterKind, c: [number, number], r: number, n: number, rng: RNG): [number, number][] {
    const out: [number, number][] = [];
    for (let tries = 0; tries < n * 60 && out.length < n; tries++) {
      const a = rng.range(0, Math.PI * 2), d = r * Math.sqrt(rng.next());
      const x = c[0] + Math.sin(a) * d, z = c[1] + Math.cos(a) * d;
      if (!this.placeable(kind, x, z)) continue;
      if (kind === 'butterfly' && !this.orbitClear(x, z)) continue;
      if (out.some((p) => Math.hypot(p[0] - x, p[1] - z) < 1.5)) continue;
      out.push([x, z]);
    }
    return out;
  }

  /** The butterfly's orbit box (butterflyAt, BUTTERFLY_REACH) on a 0.25 m grid: every point passes the placement rule. */
  private orbitClear(x: number, z: number): boolean {
    const sx = BUTTERFLY_REACH.x, sz = BUTTERFLY_REACH.z;
    for (let i = -Math.ceil(sx / 0.25); i <= Math.ceil(sx / 0.25); i++) {
      for (let j = -Math.ceil(sz / 0.25); j <= Math.ceil(sz / 0.25); j++) {
        if (!this.placeable('butterfly', x + i * 0.25, z + j * 0.25)) return false;
      }
    }
    return true;
  }

  /** The placement rule of every critter and deer point (also the sim's rule). */
  placeable(kind: CritterKind, x: number, z: number): boolean {
    if (!this.o.world.nav.isWalkable(x, z)) return false;
    if (this.inCamp(x, z)) return false;
    // wild animals keep out of villages; chickens and butterflies (the flower beds) live there
    if ((kind === 'rabbit' || kind === 'bird') && this.inVillage(x, z)) return false;
    const w = this.waterDist(x, z);
    if (kind === 'frog') return w > 0 && w <= 5;
    return w > 0;
  }

  /** True inside an enemy camp ring (radius + CAMP_MARGIN_M), or within the same margin of a patrol's route. */
  inCamp(x: number, z: number): boolean {
    for (const c of this.camps) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + CAMP_MARGIN_M) return true;
      if (c.pts) for (let i = 0; i < c.pts.length - 1; i++) if (segDist(x, z, c.pts[i], c.pts[i + 1]) < c.r + CAMP_MARGIN_M) return true;
    }
    return false;
  }

  /** True inside a village palisade (bounds + 2 m). */
  inVillage(x: number, z: number): boolean {
    return this.villages.some((v) => Math.abs(x - v.x) < v.hx && Math.abs(z - v.z) < v.hz);
  }

  /** Distance (m) to the nearest water rect; 0 when inside one; Infinity when the zone has no water. */
  waterDist(x: number, z: number): number {
    let best = Infinity;
    for (const w of this.waterRects) {
      const dx = Math.max(w.x0 - x, 0, x - w.x1), dz = Math.max(w.z0 - z, 0, z - w.z1);
      const d = Math.hypot(dx, dz);
      if (d === 0) return 0;
      best = Math.min(best, d);
    }
    return best;
  }

  private spawnHerd(herd: AmbientDeerHerd): WildDeer[] {
    const seed = `${this.o.seed}:herd:${herd.id}`;
    // deer walk on open ground: the same rule as the birds (walkable, dry, outside camps and villages)
    const ok = (x: number, z: number): boolean => this.placeable('bird', x, z);
    const out: WildDeer[] = [];
    for (let i = 0; i < herd.count; i++) {
      out.push(new WildDeer(this.o.world, { x: herd.center[0], z: herd.center[1], r: herd.radius }, `${seed}:${i}`, this.o.scene, ok));
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------------------------------------------
  // cues
  // ------------------------------------------------------------------------------------------------------------------------------

  private buildCell(c: Cell): void {
    const fields: ParticleField[] = [];
    if (c.smoke.length && this.puff) {
      const rng = new RNG(hashString(`${this.o.seed}:smoke:${c.cx},${c.cz}`));
      const smoke = new ParticleField({ map: this.puff, blending: 'normal', gravity: [0.05, 0.1, 0], sizeEnd: 3.4, alpha: 0.5, fog: [40, 140] });
      for (const s of c.smoke) {
        for (let i = 0; i < 6; i++) {
          smoke.add({
            pos: [s.pos[0], s.y, s.pos[1]], vel: [rng.range(0.25, 0.5), rng.range(0.9, 1.3), rng.range(-0.1, 0.1)], speed: 0.16,
            phase: i / 6, size: 0.9, sway: 0.15, color: 0xd9d2c8,
          });
        }
      }
      smoke.build();
      smoke.mesh.userData.ambient = true;
      this.o.scene.add(smoke.mesh);
      fields.push(smoke);
    }
    if (c.glow.length && this.glow) {
      const warm = new ParticleField({ map: this.glow, blending: 'additive', sizeEnd: 1, alpha: 0.85, fog: [40, 160] });
      for (const g of c.glow) {
        const torch = g.kind === 'torch';
        warm.add({ pos: [g.pos[0], g.y, g.pos[1]], speed: 0, phase: 0.3, size: torch ? 2.4 : 1.7, color: torch ? 0xffa040 : 0xffc070 });
      }
      warm.build();
      warm.mesh.userData.ambient = true;
      this.o.scene.add(warm.mesh);
      fields.push(warm);
    }
    c.field = fields;
  }

  private dropCell(c: Cell): void {
    for (const f of c.field ?? []) {
      f.dispose();
    }
    c.field = null;
  }

  /** The bird geometry (the crow model, loaded in start()); a small box when the model has no mesh. */
  private birdGeometry(): THREE.BufferGeometry {
    const root = G.assets.instantiate('/assets/models/itch/nocturnal-watch/crow.glb');
    return crowGeo(root) ?? new THREE.BoxGeometry(0.2, 0.14, 0.3);
  }
}

/** Distance (m) from (x, z) to the segment a-b. */
function segDist(x: number, z: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
}
