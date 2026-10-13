import * as THREE from 'three';
import { Group } from 'three';
import {
  FLASH_STEPS,
  flashable,
  flashRest,
  flashVariant,
  isOwnCopy,
  shadeFlash,
  unflashed,
  type Flashable,
  type FlashRest,
} from '../entities/sharedMaterials';
import { G } from '../game/G';
import type { Rarity } from '../types/common';
import { VFX_IDS, type DamageNumberKind, type SpawnVfxOpts, type TelegraphKind, type TelegraphShape, type VfxId } from '../types/vfx';
import { DamageNumbers, type DamageNumberOpts } from './DamageNumbers';
import { DONE, type Ctx, type Fx, type LoopCtl, type LoopHandle } from './Fx';
import { resolveVfxAlias, type VfxAlias, type VfxAliasPart } from './aliases';
import { Pillar, shellGeometry, shellMaterial } from './Meshes';
import { Atlas, KENNEY_TILES, ParticleLayer, type V3 } from './Particles';
import { SheetAtlas } from './Sheets';
import { sheetOverlays } from './presets_sheets';
import { ProjectileVisual, isProjectileId } from './Projectiles';
import { Ribbon, TrailRibbon, jaggedPath } from './Ribbon';
import { TelegraphFx } from './Telegraph';
import { WeaponGlows } from './WeaponGlow';
import { combatPresets, type Preset } from './presets_combat';
import { elementalPresets } from './presets_elemental';
import { BEAM_TIERS, lootBeamFx, worldPresets } from './presets_world';
import { featPresets } from './presets_feel';
import { subscribeFeedback } from './feedback';
import { subscribeWowFeedback, wowPresets } from './presets_wow';

export interface VfxHandle {
  readonly alive: boolean;
  stop(): void;
  /** Move a looping effect (e.g. follow without parenting). */
  setPosition?(x: number, y: number, z: number): void;
}

export interface TelegraphHandle {
  /** 0..1 fill (WoW/FFXIV style growing fill toward impact). Driven automatically if duration was given. */
  setProgress(p: number): void;
  setTransform(origin: [number, number, number], dir: [number, number]): void;
  cancel(): void;
}

const PRESETS: Record<string, Preset> = { ...combatPresets, ...elementalPresets, ...worldPresets, ...featPresets, ...wowPresets };

/**
 * True when `spawn(id)` plays something: a registered preset, a projectile id, or an alias (vfx/aliases.ts) whose target exists.
 * Used by the dev pages to list ids that would be silent at play time. Never throws.
 */
export function vfxResolves(id: string): boolean {
  if (PRESETS[id] || isProjectileId(id)) return true;
  const alias = resolveVfxAlias(id);
  return !!alias && (!!PRESETS[alias.id] || isProjectileId(alias.id));
}

const LIGHT_SCALE = 0.32;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function bodyBounds(follow: THREE.Object3D | null): { radius: number; height: number } {
  if (!follow) return { radius: 0.5, height: 2 };
  const id = follow.userData?.entityId as number | undefined;
  const ent = id !== undefined ? G.world?.get(id) : undefined;
  if (ent && ent.height > 0) return { radius: Math.max(0.3, ent.radius), height: ent.height };
  try {
    const box = new THREE.Box3().setFromObject(follow);
    if (!box.isEmpty()) {
      const s = box.getSize(new THREE.Vector3());
      if (isFinite(s.y) && s.y > 0.2 && s.y < 40) return { radius: Math.max(0.3, Math.max(s.x, s.z) * 0.5), height: s.y };
    }
  } catch {
    /* ignore */
  }
  return { radius: 0.5, height: 2 };
}

const _w = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Loop effect
// ---------------------------------------------------------------------------

class LoopFx implements LoopHandle, LoopCtl {
  alive = true;
  t = 0;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  speed = 0;
  scale = 1;
  radius = 0.5;
  height = 2;
  follow: THREE.Object3D | null;
  private duration: number;
  private carry = new Map<number, number>();
  private k = 0;
  private seenParent = false;
  private last = new THREE.Vector3();
  private hasLast = false;
  tickCount = 0;

  constructor(
    private vfx: VFX,
    c: Ctx,
    defDuration: number,
    private tick: (dt: number, L: LoopCtl) => void,
    private onEnd?: () => void,
  ) {
    this.follow = c.follow;
    this.duration = c.o.duration ?? defDuration;
    this.scale = c.s;
    this.pos.copy(c.p);
    if (this.follow && !(this.follow as THREE.Camera).isCamera) {
      const b = bodyBounds(this.follow);
      this.radius = b.radius;
      this.height = b.height;
    } else {
      const sc = c.s;
      this.radius = 0.5 * sc;
      this.height = 2 * sc;
    }
  }

  rate(perSec: number, dt: number): number {
    const key = this.k++;
    const acc = (this.carry.get(key) ?? 0) + perSec * dt;
    const n = Math.floor(acc);
    this.carry.set(key, acc - n);
    return n;
  }

  at(f: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + this.height * f, this.pos.z);
  }

  far(d: number): boolean {
    return this.pos.distanceToSquared(this.vfx.camPos) > d * d;
  }

  setPosition(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
  }

  setDuration(sec: number): void {
    this.duration = this.t + sec;
  }

  setScale(s: number): void {
    this.scale = s;
  }

  update(dt: number): boolean {
    if (!this.alive) return false;
    this.t += dt;
    const f = this.follow;
    if (f) {
      if (f.parent) this.seenParent = true;
      if (!(f as THREE.Camera).isCamera) {
        if ((this.seenParent && !f.parent) || (!this.seenParent && this.t > 2.5)) {
          this.finish();
          return false;
        }
      }
      f.getWorldPosition(this.pos);
    }
    if (this.hasLast && dt > 1e-5) {
      this.vel.copy(this.pos).sub(this.last).divideScalar(dt);
      this.speed = Math.hypot(this.vel.x, this.vel.z);
    }
    this.last.copy(this.pos);
    this.hasLast = true;
    this.k = 0;
    try {
      this.tick(dt, this);
    } catch (e) {
      console.warn('[vfx] loop tick failed', e);
      this.alive = false;
      return false;
    }
    if (this.t >= this.duration) {
      this.finish();
      return false;
    }
    return true;
  }

  private finish(): void {
    if (!this.alive) return;
    this.alive = false;
    try {
      this.onEnd?.();
    } catch (e) {
      console.warn('[vfx] loop end failed', e);
    }
  }

  stop(): void {
    this.finish();
  }

  /** silent kill (scene clear) */
  kill(): void {
    this.alive = false;
  }
}

// ---------------------------------------------------------------------------
// Lightning
// ---------------------------------------------------------------------------

class LightningFx implements VfxHandle {
  alive = true;
  private t = 0;
  private reroll = 0;
  private ribbons: Ribbon[] = [];
  private pts: Float32Array;
  private bpts: Float32Array[] = [];
  private widths: Float32Array;
  private cols: Float32Array;
  private n = 0;
  private a: THREE.Vector3;
  private b: THREE.Vector3;
  private flick = 1;
  private col = new THREE.Color();

  constructor(
    a: THREE.Vector3,
    b: THREE.Vector3,
    color: number,
    private width: number,
    private dur: number,
    private opts: { segs?: number; amp?: number; branches?: number; glow?: number },
    root: THREE.Object3D,
  ) {
    this.a = a.clone();
    this.b = b.clone();
    this.col.setHex(color);
    const segs = Math.min(23, opts.segs ?? 9);
    opts.segs = segs;
    const maxPts = segs + 1;
    this.pts = new Float32Array(maxPts * 3);
    this.widths = new Float32Array(maxPts);
    this.cols = new Float32Array(maxPts * 4);
    const nr = 2 + (opts.branches ?? 0);
    for (let i = 0; i < nr; i++) {
      const r = new Ribbon(Math.max(8, maxPts), true, i === 1 ? 0.9 : 1.6);
      root.add(r.mesh);
      this.ribbons.push(r);
      if (i >= 2) this.bpts.push(new Float32Array(8 * 3));
    }
  }

  update(dt: number, cam: THREE.Vector3): boolean {
    if (!this.alive) return false;
    this.t += dt;
    if (this.t >= this.dur) {
      this.kill();
      return false;
    }
    this.reroll -= dt;
    const segs = this.opts.segs ?? 9;
    if (this.reroll <= 0) {
      this.reroll = 0.045;
      this.n = jaggedPath(this.a, this.b, segs, this.opts.amp ?? 0.5, this.pts);
      this.flick = 0.7 + Math.random() * 0.3;
      // branches
      for (let i = 0; i < this.bpts.length; i++) {
        const si = Math.max(1, Math.min(this.n - 2, Math.floor(this.n * (0.2 + Math.random() * 0.6))));
        const sp = new THREE.Vector3(this.pts[si * 3], this.pts[si * 3 + 1], this.pts[si * 3 + 2]);
        const len = this.a.distanceTo(this.b) * (0.18 + Math.random() * 0.15);
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4 - 0.3, Math.random() - 0.5).normalize().multiplyScalar(len);
        jaggedPath(sp, sp.clone().add(dir), 5, this.opts.amp ? this.opts.amp * 0.4 : 0.2, this.bpts[i]);
      }
    }
    const k = this.t / this.dur;
    const fade = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5;
    const glow = this.opts.glow ?? 1.6;
    const n = this.n;
    // glow + core
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const env = 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * t), 0.5);
        this.widths[i] = this.width * env * (pass === 0 ? 1.0 : 0.32);
        const c = pass === 0 ? this.col : null;
        this.cols[i * 4] = (c ? c.r : 1) * glow * (pass === 0 ? 1 : 1.4);
        this.cols[i * 4 + 1] = (c ? c.g : 1) * glow * (pass === 0 ? 1 : 1.4);
        this.cols[i * 4 + 2] = (c ? c.b : 1) * glow * (pass === 0 ? 1 : 1.4);
        this.cols[i * 4 + 3] = (pass === 0 ? 0.65 : 1) * this.flick * fade;
      }
      this.ribbons[pass].build(cam, this.pts, n, this.widths, this.cols);
    }
    for (let i = 0; i < this.bpts.length; i++) {
      const bw = new Float32Array(6);
      const bc = new Float32Array(24);
      for (let j = 0; j < 6; j++) {
        bw[j] = this.width * 0.45 * (1 - j / 6);
        bc[j * 4] = this.col.r * glow;
        bc[j * 4 + 1] = this.col.g * glow;
        bc[j * 4 + 2] = this.col.b * glow;
        bc[j * 4 + 3] = 0.8 * this.flick * fade * (1 - j / 7);
      }
      this.ribbons[2 + i].build(cam, this.bpts[i], 6, bw, bc);
    }
    return true;
  }

  stop(): void {
    this.kill();
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    for (const r of this.ribbons) r.dispose();
  }
}

// ---------------------------------------------------------------------------
// Pillar / Shell effects
// ---------------------------------------------------------------------------

class PillarFx implements VfxHandle {
  alive = true;
  private t = 0;
  private stopT = -1;
  private pos = new THREE.Vector3();
  readonly pillar: Pillar;

  constructor(
    pos: THREE.Vector3,
    color: number,
    height: number,
    radius: number,
    private dur: number,
    private o: { rise?: boolean; follow?: THREE.Object3D | null; spin?: number; fadeIn?: number; hot?: number; alpha?: number },
    root: THREE.Object3D,
  ) {
    this.pillar = new Pillar(color, height, radius, { hot: o.hot });
    this.pos.copy(pos);
    this.pillar.group.position.copy(pos);
    root.add(this.pillar.group);
  }

  update(dt: number): boolean {
    if (!this.alive) return false;
    this.t += dt;
    const f = this.o.follow;
    if (f) {
      if (!f.parent) {
        this.kill();
        return false;
      }
      f.getWorldPosition(_w);
      this.pillar.group.position.set(_w.x, _w.y > 0.9 ? _w.y - 0.5 : 0.06, _w.z);
    }
    const fadeIn = this.o.fadeIn ?? 0.15;
    let a = Math.min(1, this.t / Math.max(0.01, fadeIn));
    if (isFinite(this.dur)) {
      const k = this.t / this.dur;
      a *= k < 0.4 ? 1 : Math.max(0, 1 - (k - 0.4) / 0.6);
      if (this.t >= this.dur) {
        this.kill();
        return false;
      }
    }
    if (this.stopT >= 0) {
      this.stopT += dt;
      a *= Math.max(0, 1 - this.stopT / 0.35);
      if (this.stopT >= 0.35) {
        this.kill();
        return false;
      }
    }
    this.pillar.grow = this.o.rise ? 1 - Math.pow(1 - Math.min(1, this.t / 0.3), 3) : 1;
    this.pillar.alpha = a * (this.o.alpha ?? 1);
    this.pillar.update(dt);
    return true;
  }

  stop(): void {
    if (this.stopT < 0) this.stopT = 0;
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.pillar.dispose();
  }
}

class ShellFx implements VfxHandle {
  alive = true;
  private t = 0;
  private stopT = -1;
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private bounds: { radius: number; height: number };
  private pos = new THREE.Vector3();

  constructor(
    c: Ctx,
    private kind: 'shield' | 'ice' | 'aura',
    color: number,
    private dur: number,
    root: THREE.Object3D,
  ) {
    this.bounds = bodyBounds(c.follow);
    this.mat =
      kind === 'ice'
        ? shellMaterial(color, { power: 1.2, flat: true, base: 0.04, pulse: 0.2, alpha: 0.85 })
        : kind === 'shield'
          ? shellMaterial(color, { power: 2.4, base: 0.1, pulse: 0.3, scan: 1, alpha: 0.9 })
          : shellMaterial(color, { power: 2.2, base: 0.05, pulse: 0.3, alpha: 0.8 });
    this.mesh = new THREE.Mesh(shellGeometry(kind), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    this.follow = c.follow;
    this.pos.copy(c.p);
    root.add(this.mesh);
    this.place();
  }
  private follow: THREE.Object3D | null;

  private place(): void {
    const { radius: R, height: H } = this.bounds;
    if (this.follow) {
      if (!this.follow.parent) return;
      this.follow.getWorldPosition(this.pos);
    }
    if (this.kind === 'ice') this.mesh.scale.set(R * 2.6, H * 1.15, R * 2.6);
    else this.mesh.scale.set(R * 2.7, H * 1.15, R * 2.7);
    this.mesh.position.set(this.pos.x, this.pos.y + H * 0.5, this.pos.z);
  }

  update(dt: number): boolean {
    if (!this.alive) return false;
    this.t += dt;
    if (this.follow && !this.follow.parent) {
      this.kill();
      return false;
    }
    this.place();
    let a = Math.min(1, this.t / 0.15);
    const left = this.dur - this.t;
    if (left < 0.3) a *= Math.max(0, left / 0.3);
    if (this.stopT >= 0) {
      this.stopT += dt;
      a *= Math.max(0, 1 - this.stopT / 0.25);
      if (this.stopT >= 0.25) {
        this.kill();
        return false;
      }
    }
    if (this.t >= this.dur) {
      this.kill();
      return false;
    }
    this.mat.uniforms.uAlpha.value = a;
    this.mat.uniforms.uTime.value += dt;
    return true;
  }

  stop(): void {
    if (this.stopT < 0) this.stopT = 0;
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.mesh.removeFromParent();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Pooled lights
// ---------------------------------------------------------------------------

class LightPool {
  private lights: THREE.PointLight[] = [];
  private st: { t: number; dur: number; peak: number }[] = [];
  constructor(n: number, root: THREE.Object3D) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      root.add(l);
      this.lights.push(l);
      this.st.push({ t: 1, dur: 1, peak: 0 });
    }
  }
  flash(pos: THREE.Vector3 | V3, color: number, intensity: number, dur: number, dist = 10): void {
    let best = 0;
    let bestScore = Infinity;
    for (let i = 0; i < this.st.length; i++) {
      const s = this.st[i];
      const rem = Math.max(0, 1 - s.t / s.dur) * s.peak;
      if (rem < bestScore) {
        bestScore = rem;
        best = i;
      }
    }
    if (bestScore > intensity * LIGHT_SCALE * 1.2) return;
    const l = this.lights[best];
    if (Array.isArray(pos)) l.position.set(pos[0], pos[1], pos[2]);
    else l.position.copy(pos);
    l.color.setHex(color);
    l.distance = dist;
    this.st[best] = { t: 0, dur: Math.max(0.05, dur), peak: intensity * LIGHT_SCALE };
    l.intensity = intensity * LIGHT_SCALE;
  }
  update(dt: number): void {
    for (let i = 0; i < this.lights.length; i++) {
      const s = this.st[i];
      if (s.t >= s.dur) {
        this.lights[i].intensity = 0;
        continue;
      }
      s.t += dt;
      const k = Math.max(0, 1 - s.t / s.dur);
      this.lights[i].intensity = s.peak * k * k;
    }
  }
  clear(): void {
    for (let i = 0; i < this.lights.length; i++) {
      this.st[i].t = this.st[i].dur;
      this.lights[i].intensity = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Hit flash
// ---------------------------------------------------------------------------

/**
 * One material slot of a flashing mesh. A shared (or per-entity) material is swapped for its flash variants while the flash
 * runs; an own copy (sharedMaterials.copyMeshMaterials) keeps its place and is shaded in place.
 */
interface FlashSlot {
  index: number; // array index, -1 for a single material
  origin: Flashable; // what the slot holds when no flash runs (never a flash variant)
  shown: THREE.Material; // what the slot holds now: the origin or the flash variant this flash put there
  lost: boolean; // something else replaced the slot during the flash: the flash leaves it alone
  rest: FlashRest | null; // own copies only: the values to put back when the flash ends
}
interface FlashState {
  root: THREE.Object3D; // the model the flash was asked for: the flash ends when it leaves the scene
  t: number;
  dur: number;
  color: THREE.Color;
  step: number; // the flash step the slots show (-1: none yet)
  slots: FlashSlot[];
}

const materialAt = (mesh: THREE.Mesh, index: number): THREE.Material | undefined =>
  index < 0 ? (mesh.material as THREE.Material) : (mesh.material as THREE.Material[])[index];

/** Writes one slot. Array materials are replaced, never edited: a restore may still hold the old array. */
function setMaterialAt(mesh: THREE.Mesh, index: number, next: THREE.Material): void {
  if (index < 0) {
    mesh.material = next;
    return;
  }
  const list = (mesh.material as THREE.Material[]).slice();
  list[index] = next;
  mesh.material = list;
}

/** Plans a flash on one mesh: what each flashable material slot stands for. Null when the mesh has nothing to flash. */
function planMeshFlash(mesh: THREE.Mesh, root: THREE.Object3D, color: THREE.Color, dur: number): FlashState | null {
  const cur = mesh.material;
  const list = Array.isArray(cur) ? cur : [cur];
  const slots: FlashSlot[] = [];
  list.forEach((x, i) => {
    if (!x || !flashable(x)) return;
    const origin = unflashed(x); // a leftover flash variant stands for the material it replaced
    const own = isOwnCopy(origin);
    slots.push({ index: Array.isArray(cur) ? i : -1, origin, shown: x, lost: false, rest: own ? flashRest(origin) : null });
  });
  return slots.length ? { root, t: 0, dur, color, step: -1, slots } : null;
}

/** Moves a mesh's swapped slots to the flash variants of `step` (0: the originals). A slot changed by someone else is left alone. */
function swapFlash(mesh: THREE.Mesh, st: FlashState, step: number): void {
  for (const s of st.slots) {
    if (s.rest || s.lost) continue;
    if (materialAt(mesh, s.index) !== s.shown) {
      s.lost = true;
      continue;
    }
    const next = step > 0 ? flashVariant(s.origin, st.color, step) : s.origin;
    if (next === s.shown) continue;
    setMaterialAt(mesh, s.index, next);
    s.shown = next;
  }
}

/** Ends a flash: the mesh holds its own materials again and own copies get their values back. */
function endMeshFlash(mesh: THREE.Mesh, st: FlashState): void {
  swapFlash(mesh, st, 0);
  for (const s of st.slots) if (s.rest) shadeFlash(s.origin, s.rest, st.color, 0);
}

// ---------------------------------------------------------------------------
// VFX facade
// ---------------------------------------------------------------------------

const DEFAULT_STATUS_VFX: Record<string, VfxId> = {
  burn: 'burn_loop',
  freeze: 'freeze_loop',
  stun: 'stun_stars',
  curse: 'curse_loop',
  poison: 'poison_loop',
  shock: 'shock_loop',
  shield: 'shield_bubble',
  stealth: 'stealth_smoke',
  haste: 'haste_trail',
  enrage: 'enrage_aura',
  raging: 'enrage_aura',
  regen: 'heal_loop',
  inspiring: 'inspiring_aura',
  bolstered: 'bolster_burst',
  necrotic: 'necrotic_hit',
};

/**
 * Visual effects facade. Every id in types/vfx.ts VFX_IDS produces an effect (pooled GPU particle layers sharing one
 * texture atlas, ribbons, pillars, fresnel shells, pooled point-light flashes, decals).
 * OWNER: vfx module.
 */
export class VFX {
  scene: THREE.Scene | null = null;
  camera: THREE.Camera | null = null;
  readonly root = new Group();
  readonly camPos = new THREE.Vector3();
  readonly atlas = new Atlas();
  readonly sheets = new SheetAtlas();
  private layers: { add: ParticleLayer; alpha: ParticleLayer; decal: ParticleLayer; sheetA: ParticleLayer; sheetAdd: ParticleLayer };
  private lights: LightPool;
  private numbers = new DamageNumbers();
  private glows: WeaponGlows;

  private loops: LoopFx[] = [];
  private timers: { t: number; fn: () => void; owner?: LoopHandle }[] = [];
  private lightnings: LightningFx[] = [];
  private pillars: PillarFx[] = [];
  private shells: ShellFx[] = [];
  private telegraphs: TelegraphFx[] = [];
  private trails: TrailRibbon[] = [];
  private visuals = new Set<ProjectileVisual>();
  private flashes = new Map<THREE.Mesh, FlashState>();
  private unique = new Map<string, VfxHandle>();
  private warned = new Set<string>();
  private blobMat: THREE.MeshBasicMaterial | null = null;
  private blobGeo: THREE.PlaneGeometry | null = null;
  private time = 0;
  private ready = false;
  private subscribed = false;
  /** per-frame budget for event-driven hit effects (hordes) */
  hitBudget = 0;
  /** local player's HP fraction (feedback.ts keeps it current): below 30% a red vignette pulse + heartbeat warns the player */
  lowHpFrac = 1;
  private lowHpT = 0;
  readonly fxApi: Fx;
  private lastNumber = new Map<string, number>();
  status = new Map<string, VfxHandle>();

  constructor() {
    this.root.name = 'vfx-root';
    const atlas = this.atlas;
    this.layers = {
      decal: new ParticleLayer(atlas, { cap: 700, additive: false, renderOrder: 2, polygonOffset: -2 }),
      alpha: new ParticleLayer(atlas, { cap: 3200, additive: false, renderOrder: 10, polygonOffset: -1 }),
      add: new ParticleLayer(atlas, { cap: 4800, additive: true, renderOrder: 11, polygonOffset: -1 }),
      sheetA: new ParticleLayer(this.sheets, { cap: 500, additive: false, renderOrder: 12, polygonOffset: -1 }),
      sheetAdd: new ParticleLayer(this.sheets, { cap: 500, additive: true, renderOrder: 13, polygonOffset: -1 }),
    };
    this.root.add(this.layers.decal.mesh, this.layers.alpha.mesh, this.layers.add.mesh, this.layers.sheetA.mesh, this.layers.sheetAdd.mesh);
    // always exactly 2 PointLights: the count never changes (a change recompiles every lit shader); idle ones sit at intensity 0
    this.lights = new LightPool(2, this.root);
    const self = this;
    this.fxApi = {
      add: this.layers.add,
      alpha: this.layers.alpha,
      decal: this.layers.decal,
      sheetAlpha: this.layers.sheetA,
      sheetAdd: this.layers.sheetAdd,
      sheets: this.sheets,
      camPos: this.camPos,
      get scene() {
        return self.scene;
      },
      light: (p, c, i, d, dist) => this.lights.flash(p, c, i, d, dist),
      after: (delay, fn, owner) => {
        this.timers.push({ t: delay, fn, owner });
      },
      loop: (c, def, tick, onEnd) => {
        const l = new LoopFx(this, c, def, tick, onEnd);
        this.loops.push(l);
        return l;
      },
      lightning: (a, b, color, width, dur, opts) => {
        const l = new LightningFx(a, b, color, width, dur, { ...(opts ?? {}) }, this.root);
        this.lightnings.push(l);
        return l;
      },
      pillar: (pos, color, height, radius, dur, opts) => {
        const p = new PillarFx(pos, color, height, radius, dur, opts ?? {}, this.root);
        this.pillars.push(p);
        return p;
      },
      shell: (c, kind, color, dur) => {
        const s = new ShellFx(c, kind, color, dur, this.root);
        this.shells.push(s);
        return s;
      },
      screenFlash: (color, peak, dur) => this.numbers.screenFlash(color, peak, dur),
      projectileMesh: () => null,
      spawnId: (id, pos, opts) => this.spawn(id as VfxId, pos, opts),
      frame: () => G.engine?.frame ?? 0,
    };
    this.glows = new WeaponGlows(this.fxApi);
  }

  // ------------------------------------------------------------------ lifecycle

  /** Load textures/materials. Called once by Game before the first scene. */
  async init(): Promise<void> {
    if (this.ready) return;
    this.ready = true;
    try {
      await Promise.race([this.atlas.loadImages(KENNEY_TILES), new Promise<void>((r) => setTimeout(r, 7000))]);
    } catch (e) {
      console.warn('[vfx] atlas load failed', e);
    }
    // pixel-art sprite sheets stream in the background; presets work without them
    this.sheets
      .load((t) => {
        this.layers.sheetA.setTexture(t);
        this.layers.sheetAdd.setTexture(t);
      })
      .catch((e) => console.warn('[vfx] sprite sheets failed', e));
    this.subscribe();
  }

  private subscribe(): void {
    if (this.subscribed || !G.events) return;
    this.subscribed = true;
    subscribeFeedback(this);
    subscribeWowFeedback(this);
  }

  /** Re-parent pools to the active scene. Idempotent. Scenes call it as the FIRST line of enter(). */
  attach(scene: THREE.Scene, camera: THREE.Camera): void {
    this.subscribe();
    if (this.scene !== scene) {
      this.root.removeFromParent();
      this.scene = scene;
      scene.add(this.root);
    } else if (this.root.parent !== scene) {
      scene.add(this.root);
    }
    this.camera = camera;
    this.numbers.camera = camera;
  }

  // ------------------------------------------------------------------ spawning

  private makeCtx(pos: THREE.Vector3 | [number, number, number], opts?: SpawnVfxOpts): Ctx {
    const o: SpawnVfxOpts = opts ?? {};
    const p = Array.isArray(pos) ? new THREE.Vector3(pos[0], pos[1], pos[2]) : pos.clone();
    if (o.follow && o.follow.parent) o.follow.getWorldPosition(p);
    const dir3 = new THREE.Vector3(0, 0, 1);
    let hasDir = false;
    if (o.dir && o.dir[0] * o.dir[0] + o.dir[1] * o.dir[1] + o.dir[2] * o.dir[2] > 1e-8) {
      dir3.set(o.dir[0], o.dir[1], o.dir[2]).normalize();
      hasDir = true;
    }
    const dir = new THREE.Vector3(dir3.x, 0, dir3.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    else dir.normalize();
    return {
      p,
      o,
      s: o.scale ?? 1,
      dir,
      hasDir,
      dir3,
      color: (def) => (o.color !== undefined ? o.color : def),
      dur: (def) => (o.duration !== undefined ? o.duration : def),
      target: o.target ? new THREE.Vector3(o.target[0], o.target[1], o.target[2]) : null,
      follow: o.follow ?? null,
    };
  }

  /**
   * Plays an alias entry (vfx/aliases.ts, GDD_CLASSES_V2 §11.1): each existing preset at the same spot. Caller opts win
   * for colour; caller scale multiplies the alias scale. Parts without a preset are skipped (silently nothing).
   */
  private spawnAlias(alias: VfxAlias, pos: THREE.Vector3 | [number, number, number], opts?: SpawnVfxOpts): VfxHandle {
    const base: [number, number, number] = Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z];
    const parts: VfxAliasPart[] = [alias, ...(alias.extra ?? [])];
    const handles: VfxHandle[] = [];
    for (const part of parts) {
      // projectile ids have no preset but are spawned by spawn() through launchFlash, so they count as playable
      if (!PRESETS[part.id] && !isProjectileId(part.id)) continue;
      const o: SpawnVfxOpts = { ...opts };
      if (o.color === undefined && part.color !== undefined) o.color = part.color;
      if (part.scale !== undefined) o.scale = (opts?.scale ?? 1) * part.scale;
      if (o.duration === undefined && part.duration !== undefined) o.duration = part.duration;
      handles.push(this.spawn(part.id, [base[0], base[1] + (alias.yOffset ?? 0), base[2]], o));
    }
    if (handles.length === 0) return DONE;
    return {
      get alive() { return handles.some((h) => h.alive); },
      stop() { for (const h of handles) h.stop(); },
    };
  }

  spawn(id: VfxId, pos: THREE.Vector3 | [number, number, number], opts?: SpawnVfxOpts): VfxHandle {
    try {
      // GDD_CLASSES_V2 §11.1 (NC03): an id without a preset resolves through the alias table; unknown ids stay silent
      if (!PRESETS[id] && !isProjectileId(id)) {
        const alias = resolveVfxAlias(id);
        if (alias) return this.spawnAlias(alias, pos, opts);
      }
      const c = this.makeCtx(pos, opts);
      // looping effects attached to one object are unique per (id, object): refresh instead of stacking
      let key = '';
      if (c.follow) {
        key = `${id}|${c.follow.id}`;
        const ex = this.unique.get(key);
        if (ex && ex.alive) {
          if ((ex as LoopFx).setDuration && opts?.duration !== undefined) (ex as LoopFx).setDuration(opts.duration);
          if ((ex as LoopFx).setScale && opts?.scale !== undefined) (ex as LoopFx).setScale(opts.scale);
          return ex;
        }
      }
      const preset = PRESETS[id];
      let h: VfxHandle | void;
      if (preset) {
        h = preset(this.fxApi, c);
        const ov = sheetOverlays[id];
        if (ov && this.sheets.ready) {
          try {
            ov(this.fxApi, c);
          } catch (e) {
            this.warnOnce(`ov:${id}`, `[vfx] sheet overlay "${id}" failed: ${String(e)}`);
          }
        }
      }
      else if (isProjectileId(id)) h = this.launchFlash(id, c);
      else {
        this.warnOnce(`id:${id}`, `[vfx] unknown id "${id}"`);
        return DONE;
      }
      const handle = h ?? DONE;
      if (key && handle.alive) this.unique.set(key, handle);
      return handle;
    } catch (e) {
      this.warnOnce(`err:${id}`, `[vfx] preset "${id}" failed: ${String(e)}`);
      return DONE;
    }
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(msg);
  }

  /** Muzzle flash for projectile ids; flies a visual to opts.target when given. */
  private launchFlash(id: string, c: Ctx): VfxHandle {
    const fam: Record<string, { col: number; impact: VfxId; sfx?: string }> = {
      fire_projectile: { col: 0xff7a20, impact: 'fire_burst' },
      frost_projectile: { col: 0x8fdcff, impact: 'frost_burst' },
      lightning_projectile: { col: 0xaed2ff, impact: 'hit_magic' },
      shadow_projectile: { col: 0x9a4cff, impact: 'shadow_burst' },
      poison_projectile: { col: 0x6aff30, impact: 'poison_burst' },
      holy_projectile: { col: 0xffe28a, impact: 'holy_burst' },
      arcane_projectile: { col: 0xe060ff, impact: 'arcane_burst' },
    };
    const f = fam[id] ?? { col: 0xfff0d0, impact: 'hit_spark' as VfxId };
    const col = c.color(f.col);
    const s = c.s;
    const fx = this.fxApi;
    fx.add.spawn({ tex: 'soft', at: c.p, life: 0.16, size: 0.7 * s, size1: 1.7 * s, ease: 1, c0: 0xffffff, c1: col, glow: 2.2, fi: 0, fp: 1.3 });
    fx.add.spawn({ tex: 'star-05', at: c.p, life: 0.12, size: 0.5 * s, size1: 1.1 * s, ease: 1, c0: 0xffffff, c1: col, glow: 3, fi: 0, fp: 1.3, rot: [0, 6] });
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 6, at: c.p, dir: c.hasDir ? c.dir3 : undefined, cone: 0.5, speed: [3, 8], life: [0.12, 0.25], size: 0.07, asp: 1.2, c0: 0xffffff, c1: col, glow: 2.6, fi: 0, fp: 1 });
    if (!c.target) return DONE;
    const vis = this.createProjectileVisual(id as VfxId, s);
    this.root.add(vis.object);
    vis.object.position.copy(c.p);
    const to = c.target.clone();
    const dist = c.p.distanceTo(to);
    const dur = c.o.duration ?? Math.max(0.2, dist / 18);
    vis.object.lookAt(to);
    const c2: Ctx = { ...c, follow: null };
    return fx.loop(
      c2,
      dur,
      (_dt, L) => {
        const k = Math.min(1, L.t / dur);
        vis.object.position.lerpVectors(c.p, to, k);
      },
      () => {
        vis.dispose();
        fx.spawnId(f.impact, to, { scale: s * 0.8, color: c.o.color });
      },
    );
  }

  /** Ground telegraph; auto-removes after `duration` seconds (fill animates 0->1). */
  telegraph(shape: TelegraphShape, origin: [number, number, number], dir: [number, number], duration: number, kind?: TelegraphKind): TelegraphHandle {
    try {
      const t = new TelegraphFx(shape, origin, dir, duration, kind);
      this.root.add(t.group);
      this.telegraphs.push(t);
      return t;
    } catch (e) {
      this.warnOnce('telegraph', `[vfx] telegraph failed: ${String(e)}`);
      return { setProgress() {}, setTransform() {}, cancel() {} };
    }
  }

  /** Floating combat text. */
  damageNumber(pos: THREE.Vector3 | [number, number, number], amount: number, kind: DamageNumberKind, text?: string, opts?: DamageNumberOpts): void {
    if (kind === 'xp' || kind === 'gold') {
      const k = `${kind}:${Math.round(amount)}`;
      const last = this.lastNumber.get(k);
      if (last !== undefined && this.time - last < 0.35) return;
      this.lastNumber.set(k, this.time);
    }
    this.numbers.spawn(pos, amount, kind, text, opts);
  }

  /** Rarity-coloured light pillar on a dropped item (Diablo/PoE style). */
  lootBeam(object: THREE.Object3D, rarity: Rarity): VfxHandle {
    const tier = BEAM_TIERS[rarity];
    if (!tier) return DONE;
    const key = `loot|${object.id}`;
    const ex = this.unique.get(key);
    if (ex && ex.alive) return ex;
    try {
      const p = new THREE.Vector3();
      if (object.parent) object.getWorldPosition(p);
      const c = this.makeCtx(p, { follow: object });
      const h = lootBeamFx(this.fxApi, c, tier, object);
      this.unique.set(key, h);
      return h;
    } catch (e) {
      this.warnOnce('lootBeam', `[vfx] lootBeam failed: ${String(e)}`);
      return DONE;
    }
  }

  /** Metin2-style weapon glow by upgrade level (+7 blue, +9 purple, +12 red/gold, +15 rainbow). 0 removes. */
  weaponGlow(weaponRoot: THREE.Object3D, upgrade: number): void {
    try {
      this.glows.set(weaponRoot, upgrade);
    } catch (e) {
      this.warnOnce('weaponGlow', `[vfx] weaponGlow failed: ${String(e)}`);
    }
  }

  /**
   * White/red emissive flash on a model (hit feedback). Shared materials show flash variants (no clones per hit); own copies are
   * shaded in place; every mesh gets its own materials back when the flash ends. Overlapping flashes share one state per mesh.
   */
  flash(model: THREE.Object3D, color = 0xffffff, duration = 0.09): void {
    try {
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || o.userData.vfxShell || o.userData.vfxLayer || o.userData.noFlash) return;
        const st = this.flashes.get(m);
        if (st) {
          st.root = model;
          st.t = 0;
          st.dur = Math.max(st.dur * 0.5, duration);
          if (st.color.getHex() !== color) {
            st.color.setHex(color);
            st.step = -1; // re-swap to the variants of the new colour
          }
          return;
        }
        const fresh = planMeshFlash(m, model, new THREE.Color(color), duration);
        if (fresh) this.flashes.set(m, fresh);
      });
    } catch (e) {
      this.warnOnce('flash', `[vfx] flash failed: ${String(e)}`);
    }
  }

  /** Visual-only projectile mesh/sprite for an id (combat moves it). Dispose via returned handle. */
  createProjectileVisual(id: VfxId, scale = 1): { object: THREE.Object3D; update(dt: number): void; dispose(): void } {
    const v = new ProjectileVisual(this.fxApi, id, scale, (x) => this.visuals.delete(x));
    this.visuals.add(v);
    return v;
  }

  /** Weapon swing trail attached to an object (e.g. weapon tip) for `duration`. */
  trail(object: THREE.Object3D, color: number, duration: number, width = 0.55): VfxHandle {
    try {
      const t = new TrailRibbon(object, color, duration, width, this.root);
      this.trails.push(t);
      return {
        get alive() {
          return t.alive;
        },
        stop: () => t.stop(),
      };
    } catch (e) {
      this.warnOnce('trail', `[vfx] trail failed: ${String(e)}`);
      return DONE;
    }
  }

  /** Blob shadow under an actor (cheap PSX shadow). Returns the mesh (caller parents it). */
  blobShadow(radius: number): THREE.Object3D {
    if (!this.blobMat) {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(0,0,0,0.62)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.5)');
      gr.addColorStop(0.9, 'rgba(0,0,0,0.12)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 32, 32);
      // posterise to 4 alpha steps (PSX look)
      const img = g.getImageData(0, 0, 32, 32);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.round(img.data[i] / 64) * 64;
      g.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      this.blobMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.blobGeo = new THREE.PlaneGeometry(1, 1);
      this.blobGeo.rotateX(-Math.PI / 2);
    }
    const m = new THREE.Mesh(this.blobGeo!, this.blobMat);
    m.scale.set(radius * 2, 1, radius * 2);
    m.position.y = 0.03;
    m.renderOrder = 1;
    m.name = 'blobShadow';
    m.userData.noFlash = true;
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  }

  // ------------------------------------------------------------------ frame

  update(dt: number): void {
    this.time += dt;
    this.hitBudget = 14;
    this.updateLowHp(dt);
    const cam = this.camera;
    if (cam) {
      cam.updateMatrixWorld();
      const e = cam.matrixWorld.elements;
      const right = new THREE.Vector3(e[0], e[1], e[2]);
      const upv = new THREE.Vector3(e[4], e[5], e[6]);
      this.camPos.set(e[12], e[13], e[14]);
      this.layers.add.setCamera(right, upv, this.camPos);
      this.layers.alpha.setCamera(right, upv, this.camPos);
      this.layers.decal.setCamera(right, upv, this.camPos);
      this.layers.sheetA.setCamera(right, upv, this.camPos);
      this.layers.sheetAdd.setCamera(right, upv, this.camPos);
    }
    // timers
    if (this.timers.length) {
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const t = this.timers[i];
        t.t -= dt;
        if (t.t <= 0) {
          this.timers.splice(i, 1);
          if (t.owner && !t.owner.alive) continue;
          try {
            t.fn();
          } catch (e) {
            this.warnOnce('timer', `[vfx] timer failed: ${String(e)}`);
          }
        }
      }
    }
    // loops, ribbons, meshes
    this.loops = this.loops.filter((l) => l.update(dt));
    this.lightnings = this.lightnings.filter((l) => l.update(dt, this.camPos));
    this.pillars = this.pillars.filter((l) => l.update(dt));
    this.shells = this.shells.filter((l) => l.update(dt));
    this.telegraphs = this.telegraphs.filter((l) => l.update(dt));
    this.trails = this.trails.filter((l) => l.update(dt, this.camPos));
    // projectile visuals the combat module forgot to update
    const frame = G.engine?.frame ?? 0;
    for (const v of this.visuals) if (v.lastFrame !== frame && v.object.parent) v.step(dt, frame);
    this.glows.update(dt);
    this.updateFlashes(dt);
    // particles last so everything emitted this frame is simulated/uploaded
    this.layers.decal.update(dt);
    this.layers.alpha.update(dt);
    this.layers.add.update(dt);
    this.layers.sheetA.update(dt);
    this.layers.sheetAdd.update(dt);
    this.lights.update(dt);
    this.numbers.update(dt);
    if (this.unique.size > 64) for (const [k, h] of this.unique) if (!h.alive) this.unique.delete(k);
  }

  /** Below 30% HP: a slow red vignette pulse with a double heartbeat thump (faster and stronger the lower the HP). */
  private updateLowHp(dt: number): void {
    const f = this.lowHpFrac;
    if (!(f > 0 && f < 0.3)) {
      this.lowHpT = 0;
      return;
    }
    this.lowHpT -= dt;
    if (this.lowHpT > 0) return;
    const k = 1 - f / 0.3;
    this.lowHpT = 1.5 - 0.55 * k;
    const shake = G.settings?.data.screenShake ?? 1; // "screen shake 0" also silences the flashing
    if (shake > 0) this.numbers.screenFlash('rgba(150,0,0,0.9)', (0.09 + 0.2 * k) * Math.min(1, shake), 0.75);
    const a = G.audio;
    if (a) {
      a.thump(0.2 + 0.2 * k, 70, 38, 0.13);
      this.timers.push({ t: 0.17, fn: () => G.audio?.thump(0.14 + 0.16 * k, 62, 36, 0.11) });
    }
  }

  private updateFlashes(dt: number): void {
    if (!this.flashes.size) return;
    for (const [mesh, st] of this.flashes) {
      try {
        st.t += dt;
        if (st.t >= st.dur || !st.root.parent) {
          endMeshFlash(mesh, st);
          this.flashes.delete(mesh);
          continue;
        }
        // the decay is continuous for own copies and steps through the shared variants (quantised, so variants are reused)
        const k = Math.pow(1 - st.t / st.dur, 0.7);
        const step = Math.min(FLASH_STEPS, Math.max(1, Math.ceil(k * FLASH_STEPS)));
        if (step !== st.step) {
          st.step = step;
          swapFlash(mesh, st, step);
        }
        for (const s of st.slots) if (s.rest) shadeFlash(s.origin, s.rest, st.color, k);
      } catch (e) {
        this.flashes.delete(mesh);
        this.warnOnce('flashFrame', `[vfx] flash update failed: ${String(e)}`);
      }
    }
  }

  /** Remove every active effect (scene change). */
  clear(): void {
    for (const l of this.loops) l.kill();
    this.loops = [];
    this.timers = [];
    for (const l of this.lightnings) l.kill();
    this.lightnings = [];
    for (const l of this.pillars) l.kill();
    this.pillars = [];
    for (const l of this.shells) l.kill();
    this.shells = [];
    for (const l of this.telegraphs) l.dispose();
    this.telegraphs = [];
    for (const l of this.trails) l.kill();
    this.trails = [];
    for (const v of [...this.visuals]) v.dispose();
    this.visuals.clear();
    this.unique.clear();
    this.status.clear();
    this.lowHpT = 0;
    this.layers.add.clear();
    this.layers.alpha.clear();
    this.layers.decal.clear();
    this.layers.sheetA.clear();
    this.layers.sheetAdd.clear();
    this.lights.clear();
    this.numbers.clear();
    for (const [mesh, st] of this.flashes) endMeshFlash(mesh, st);
    this.flashes.clear();
  }

  // ------------------------------------------------------------------ extras

  /** Edge-of-screen colour flash (e.g. legendary drop). */
  screenFlash(color: string, peak = 0.5, dur = 0.5): void {
    this.numbers.screenFlash(color, peak, dur);
  }

  /** Immediate point-light flash (pooled, 2 lights). */
  lightFlash(pos: THREE.Vector3 | [number, number, number], color: number, intensity = 60, dur = 0.2, dist = 10): void {
    this.lights.flash(pos, color, intensity, dur, dist);
  }

  /** Remove the weapon glow from a weapon (same as weaponGlow(root, 0)). */
  clearWeaponGlow(root: THREE.Object3D): void {
    this.glows.remove(root);
  }

  /** Live counters (dev gallery / debugging). */
  stats(): { add: number; alpha: number; decal: number; loops: number; ribbons: number; visuals: number } {
    return {
      add: this.layers.add.count + this.layers.sheetAdd.count,
      alpha: this.layers.alpha.count + this.layers.sheetA.count,
      decal: this.layers.decal.count,
      loops: this.loops.length,
      ribbons: this.lightnings.length + this.trails.length,
      visuals: this.visuals.size,
    };
  }

  /** All ids this module implements. */
  get ids(): readonly string[] {
    return [...VFX_IDS];
  }
}

export type { Preset };
