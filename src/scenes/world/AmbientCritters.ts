import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G } from '../../game/G';
import { AnimController } from '../../entities/AnimController';
import { inView } from '../../entities/ViewCull';
import { RNG, hashString } from '../../core/utils';
import type { CritterKind } from '../../types/ambient';
import type { World } from '../../world/World';

/**
 * Cosmetic critters of the open world (scenes/world/AmbientLife.ts streams them by chunk). Rabbits, birds, butterflies, frogs and
 * chickens are InstancedMesh pools: one draw call per kind, no entity, no hitbox, no loot, no XP, never aggro. Deer herds are plain
 * skinned deer (the existing deer.glb, its Graze / Walk / Run clips) with no entity: a neutral herd that stands aside when the player
 * comes close (Alert, then Run) and grazes again later. Everything is local to each peer and deterministic from the zone seed.
 * OWNER: scenes module.
 */

/** A critter is this far (m) from the player or further: its fleeing and flying stop reacting (cheap far life). */
const REACT_M = 60;

// ----------------------------------------------------------------------------------------------------------------------------------
// procedural meshes (one geometry per kind, vertex colours)
// ----------------------------------------------------------------------------------------------------------------------------------

function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A box or an ellipsoid at a local position, painted, ready to merge. */
function part(kind: 'box' | 'ball', size: [number, number, number], at: [number, number, number], hex: number): THREE.BufferGeometry {
  const g = kind === 'box' ? new THREE.BoxGeometry(size[0], size[1], size[2]) : new THREE.SphereGeometry(0.5, 6, 4);
  if (kind === 'ball') g.scale(size[0], size[1], size[2]);
  g.translate(at[0], at[1], at[2]);
  g.deleteAttribute('uv');
  return paint(g, hex);
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
  g.computeVertexNormals();
  return g;
}

/** Rabbit (about 0.34 m long): a body, a head, two long ears, a white tail. Facing +z. */
function rabbitGeo(): THREE.BufferGeometry {
  return merged([
    part('ball', [0.13, 0.11, 0.17], [0, 0.13, 0], 0xffffff),
    part('ball', [0.09, 0.09, 0.09], [0, 0.2, 0.11], 0xffffff),
    part('box', [0.03, 0.12, 0.02], [-0.03, 0.31, 0.1], 0xffffff),
    part('box', [0.03, 0.12, 0.02], [0.03, 0.31, 0.1], 0xffffff),
    part('ball', [0.04, 0.04, 0.04], [0, 0.14, -0.17], 0xf2f2ee),
  ]);
}

/** Frog (about 0.2 m): a squat body, two eyes on top. */
function frogGeo(): THREE.BufferGeometry {
  return merged([
    part('ball', [0.12, 0.06, 0.1], [0, 0.05, 0], 0x5a8a3a),
    part('ball', [0.03, 0.03, 0.03], [-0.04, 0.1, 0.05], 0xf0e060),
    part('ball', [0.03, 0.03, 0.03], [0.04, 0.1, 0.05], 0xf0e060),
  ]);
}

/** Chicken (about 0.4 m): a white body, a head, a red comb and a yellow beak. Facing +z. */
function chickenGeo(): THREE.BufferGeometry {
  return merged([
    part('ball', [0.13, 0.12, 0.17], [0, 0.2, 0], 0xf4f0e8),
    part('ball', [0.07, 0.07, 0.07], [0, 0.34, 0.11], 0xf4f0e8),
    part('box', [0.02, 0.04, 0.03], [0, 0.4, 0.11], 0xc02020),
    part('box', [0.03, 0.02, 0.04], [0, 0.33, 0.19], 0xf0b020),
    part('box', [0.14, 0.02, 0.2], [0, 0.23, -0.19], 0xe8e2d6),
  ]);
}

/** Butterfly (about 0.12 m across): two wings in one plane, the colour is per instance. */
function butterflyGeo(): THREE.BufferGeometry {
  const wing = (s: number): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, s * 0.06, 0, 0.05, s * 0.05, 0, -0.05], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
    return g;
  };
  return mergeGeometries([wing(1), wing(-1)], false)!;
}

/** Crow: the first mesh of the shipped crow.glb, its node transform applied and scaled to a 0.34 m body. Null when the model has no mesh. */
export function crowGeo(root: THREE.Object3D): THREE.BufferGeometry | null {
  const meshes: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const m = meshes[0];
  if (!m) return null;
  const g = m.geometry.clone();
  g.applyMatrix4(new THREE.Matrix4().copy(m.matrixWorld).premultiply(new THREE.Matrix4().copy(root.matrixWorld).invert()));
  g.computeBoundingBox();
  const size = new THREE.Vector3();
  g.boundingBox!.getSize(size);
  const s = 0.34 / Math.max(0.001, size.x, size.y, size.z);
  g.scale(s, s, s);
  g.center();
  g.translate(0, 0.1, 0);
  g.computeVertexNormals();
  return g;
}

// ----------------------------------------------------------------------------------------------------------------------------------
// critter state
// ----------------------------------------------------------------------------------------------------------------------------------

/** One critter: its home (ground point), its state and clock. The matrix is written every frame by CritterField.update. */
export interface Critter {
  kind: CritterKind;
  hx: number;
  hz: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  /** Seconds left in the current state. */
  timer: number;
  /** Walking / hopping: target and the state it goes to next. */
  tx: number;
  tz: number;
  state: 'sit' | 'walk' | 'flee' | 'fly' | 'land' | 'float';
  rng: RNG;
  /** Butterfly phase / wing clock. */
  clock: number;
  /** Instance slot in its kind's pool while the zone is active (-1 when parked). */
  slot: number;
  /** Colour of the instance (rabbits, butterflies), null = the mesh's own colours. */
  colour: number | null;
  /** The patch it belongs to (its zone's centre and radius): wander targets and perches stay inside it. */
  patch: { x: number; z: number; r: number };
}

/** Pool of one critter kind: a single InstancedMesh, the active critters in slots 0..count-1. */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  readonly active: Critter[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, capacity));
    this.mesh.userData.ambient = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  add(c: Critter, colour: number | null): void {
    if (this.active.length >= this.mesh.instanceMatrix.count) return;
    c.slot = this.active.length;
    this.active.push(c);
    if (colour !== null) this.mesh.setColorAt(c.slot, new THREE.Color(colour));
    this.mesh.count = this.active.length;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  remove(c: Critter): void {
    const i = c.slot;
    if (i < 0) return;
    const last = this.active.pop()!;
    if (last !== c) {
      this.active[i] = last;
      last.slot = i;
      const col = new THREE.Color();
      if (this.mesh.instanceColor) {
        this.mesh.getColorAt(this.active.length, col);
        this.mesh.setColorAt(i, col);
      }
    }
    c.slot = -1;
    this.mesh.count = this.active.length;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Writes one matrix per active critter. Yaw turns the body; butterflies flap by pulsing their height (wing scale). */
  write(): void {
    if (!this.active.length) return;
    for (let i = 0; i < this.active.length; i++) {
      const c = this.active[i];
      this.q.setFromAxisAngle(this.up, c.yaw);
      this.p.set(c.x, c.y, c.z);
      const flap = c.kind === 'butterfly' ? 0.45 + 0.55 * Math.abs(Math.sin(c.clock * 14)) : 1;
      this.s.set(1, flap, 1);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const TYPE_COLOURS: Record<CritterKind, number[] | null> = {
  rabbit: [0x8a6a48, 0xa88060, 0x6e5438, 0xc8b08a],
  bird: null,
  butterfly: [0xf0c040, 0xe86a9a, 0x7fb0ff, 0xffffff, 0xff8a3a],
  frog: null,
  chicken: null,
};

/** The critter kinds of the open world and how one is moved by its state each frame. */
export class CritterField {
  private readonly pools = new Map<CritterKind, Pool>();
  private readonly colours = new Map<CritterKind, number[] | null>();

  /** `bird` is the crow geometry (crowGeo, the caller loads the model first); `capacity` = most critters of each kind at once; `rules` = the placement and air rules. */
  constructor(private readonly scene: THREE.Scene, private readonly world: World, bird: THREE.BufferGeometry, capacity: Record<CritterKind, number>, private readonly rules: CritterRules) {
    const vc = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.make('rabbit', rabbitGeo(), vc, capacity.rabbit);
    this.make('frog', frogGeo(), vc, capacity.frog);
    this.make('chicken', chickenGeo(), vc, capacity.chicken);
    this.make('bird', bird, new THREE.MeshLambertMaterial({ color: 0x2a2624, flatShading: true }), capacity.bird);
    this.make('butterfly', butterflyGeo(), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, vertexColors: true, flatShading: true }), capacity.butterfly);
  }

  private make(kind: CritterKind, geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number): void {
    const pool = new Pool(geo, mat, capacity);
    this.pools.set(kind, pool);
    this.colours.set(kind, TYPE_COLOURS[kind]);
    this.scene.add(pool.mesh);
  }

  /** Makes a critter of `kind` at its home (x, z) in its `patch`: not yet drawn (activate puts it in its pool). */
  create(kind: CritterKind, x: number, z: number, rng: RNG, patch: { x: number; z: number; r: number }): Critter {
    const pal = this.colours.get(kind);
    return {
      kind, hx: x, hz: z, x, z, y: this.world.groundY(x, z), yaw: rng.range(0, Math.PI * 2), timer: rng.range(1, 5),
      tx: x, tz: z, state: kind === 'butterfly' ? 'float' : 'sit', rng, clock: rng.range(0, 10), slot: -1,
      colour: pal ? rng.pick(pal) : null, patch,
    };
  }

  /** Puts a critter into its pool (its zone entered the stream ring). */
  activate(c: Critter): void {
    this.pools.get(c.kind)?.add(c, c.colour);
  }

  /** Takes a critter out of its pool (its zone left the stream ring). */
  park(c: Critter): void {
    this.pools.get(c.kind)?.remove(c);
  }

  /** Per frame: states, positions and matrices of every active critter. */
  update(dt: number, px: number, pz: number): void {
    for (const pool of this.pools.values()) {
      for (const c of pool.active) step(c, dt, px, pz, this.world, this.rules);
      pool.write();
    }
  }

  dispose(): void {
    for (const pool of this.pools.values()) {
      this.scene.remove(pool.mesh);
      pool.mesh.geometry.dispose();
      pool.mesh.dispose();
    }
    this.pools.clear();
  }
}

/** The placement rule of a critter kind (AmbientLife.placeable): walkable, outside camp rings and water, the kind's shore or village rule. */
export type PlaceFn = (kind: CritterKind, x: number, z: number) => boolean;

/** The rules the critters keep to: the placement rule of a kind on the ground, and the air rule of a flight (outside every camp ring). */
export interface CritterRules {
  place: PlaceFn;
  air: (x: number, z: number) => boolean;
}

/** A flight leg is clear when every 1 m sample of it passes `air` (a bird flies over the nav, but not over a camp ring). */
function airClear(air: (x: number, z: number) => boolean, x0: number, z0: number, x1: number, z1: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0)));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (!air(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
  }
  return true;
}

/**
 * A straight walk is clear when every 0.5 m sample of it passes `ok` and the nav allows the line: the rule holds along the whole leg, not
 * only at its end (a camp ring or the water can lie between two points). Shared by the critters and the deer.
 */
export function legClear(nav: { walkLine(ax: number, az: number, bx: number, bz: number): boolean }, ok: (x: number, z: number) => boolean, x0: number, z0: number, x1: number, z1: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5));
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    if (!ok(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
  }
  return nav.walkLine(x0, z0, x1, z1);
}

/** A point this critter may stand on: inside its own patch and passing the placement rule. */
function fits(c: Critter, place: PlaceFn, x: number, z: number): boolean {
  return Math.hypot(x - c.patch.x, z - c.patch.z) <= c.patch.r && place(c.kind, x, z);
}

/**
 * The critter's next walk: a wander target round its home, or with `away` a flight from the player (straight away first, then a little to
 * either side when that way is blocked). The target and the whole leg must fit (fits, legClear). False when no such leg turns up.
 */
function hop(c: Critter, world: World, rules: CritterRules, dist: number, away?: { x: number; z: number }): boolean {
  const ok = (x: number, z: number): boolean => fits(c, rules.place, x, z);
  if (away) {
    const base = Math.atan2(c.x - away.x, c.z - away.z);
    for (const turn of [0, 0.6, -0.6]) {
      const a = base + turn;
      const tx = c.x + Math.sin(a) * dist, tz = c.z + Math.cos(a) * dist;
      if (legClear(world.nav, ok, c.x, c.z, tx, tz)) {
        c.tx = tx;
        c.tz = tz;
        return true;
      }
    }
    return false;
  }
  for (let i = 0; i < 3; i++) {
    const a = c.rng.range(0, Math.PI * 2), d = c.rng.range(0, dist);
    const tx = c.hx + Math.sin(a) * d, tz = c.hz + Math.cos(a) * d;
    if (legClear(world.nav, ok, c.x, c.z, tx, tz)) {
      c.tx = tx;
      c.tz = tz;
      return true;
    }
  }
  return false;
}

/** A perch for a landing bird: a point 6-16 m from its home that fits the rule and is reached over clear air; null when six tries find none. */
function perch(c: Critter, rules: CritterRules): [number, number] | null {
  for (let i = 0; i < 6; i++) {
    const a = c.rng.range(0, Math.PI * 2), r = c.rng.range(6, 16);
    const x = c.hx + Math.sin(a) * r, z = c.hz + Math.cos(a) * r;
    if (fits(c, rules.place, x, z) && airClear(rules.air, c.x, c.z, x, z)) return [x, z];
  }
  return null;
}

/** A butterfly's flight point at orbit parameter `a`: a lazy figure of eight round its flower-patch home (hx, hz). */
export function butterflyAt(hx: number, hz: number, a: number): [number, number] {
  return [hx + Math.cos(a) * 2.6 + Math.sin(a * 2.3) * 0.8, hz + Math.sin(a) * 2.2];
}

/** Largest offsets of butterflyAt from its home (m): the whole orbit lies inside this box. */
export const BUTTERFLY_REACH = { x: 3.4, z: 2.2 };

/** One frame of one critter, by its kind. Cheap: a few trig calls, no allocations. */
function step(c: Critter, dt: number, px: number, pz: number, world: World, rules: CritterRules): void {
  const dPlayer = Math.hypot(c.x - px, c.z - pz);
  const near = dPlayer < REACT_M;
  c.clock += dt;
  switch (c.kind) {
    case 'butterfly': {
      // a lazy figure of eight round the flower patch (butterflyAt); AmbientLife lays one out only where its whole orbit fits
      const a = c.clock * 0.35 + c.hx * 0.07;
      [c.x, c.z] = butterflyAt(c.hx, c.hz, a);
      c.y = world.groundY(c.x, c.z) + 0.9 + 0.35 * Math.sin(c.clock * 1.7 + c.hz);
      c.yaw = Math.atan2(Math.cos(a), Math.sin(a) * 0.9);
      return;
    }
    case 'rabbit':
    case 'chicken':
    case 'frog': {
      c.timer -= dt;
      if (c.state === 'flee' || c.state === 'walk') {
        // move towards the target at the kind's speed
        const sp = c.state === 'flee' ? (c.kind === 'rabbit' ? 5.5 : 3.2) : c.kind === 'frog' ? 1.2 : 0.7;
        const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
        const s = Math.min(d, sp * dt);
        if (d > 1e-3) {
          c.yaw = Math.atan2(dx, dz);
          c.x += (dx / d) * s;
          c.z += (dz / d) * s;
        }
        c.y = world.groundY(c.x, c.z) + (c.kind === 'frog' ? 0.04 : 0) + Math.abs(Math.sin(c.clock * 9)) * (c.state === 'flee' && c.kind === 'rabbit' ? 0.08 : 0);
        if (d <= 0.05 || c.timer <= 0) {
          c.state = 'sit';
          c.timer = c.rng.range(2, 6);
          // the new home is where it stopped when that spot fits (a stop between two samples of a checked leg may not)
          if (fits(c, rules.place, c.x, c.z)) {
            c.hx = c.x;
            c.hz = c.z;
          }
        }
        return;
      }
      c.y = world.groundY(c.x, c.z);
      if (near && dPlayer < (c.kind === 'chicken' ? 3.5 : c.kind === 'frog' ? 3.2 : 4.5)) {
        if (hop(c, world, rules, c.kind === 'rabbit' ? 6 : c.kind === 'frog' ? 2.8 : 4, { x: px, z: pz })) {
          c.state = 'flee';
          c.timer = 2;
        }
        return;
      }
      if (c.timer <= 0) {
        if (hop(c, world, rules, c.kind === 'rabbit' ? 3.5 : c.kind === 'frog' ? 1.6 : 3.2)) {
          c.state = 'walk';
          c.timer = 4;
        } else c.timer = c.rng.range(2, 5);
      }
      return;
    }
    case 'bird': {
      if (c.state === 'fly' || c.state === 'land') {
        // fly up and away, then glide down onto a new perch near the home
        c.timer -= dt;
        const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
        const s = Math.min(d, 9 * dt);
        if (d > 1e-3) {
          c.yaw = Math.atan2(dx, dz);
          c.x += (dx / d) * s;
          c.z += (dz / d) * s;
        }
        const ground = world.groundY(c.x, c.z);
        const cruise = ground + 10 + 3 * Math.sin(c.clock * 2);
        c.y = c.state === 'fly' ? Math.min(cruise, c.y + 9 * dt) : Math.max(ground + 0.2, c.y - 2.5 * dt);
        if (c.state === 'fly' && c.timer <= 0) {
          // a perch that fits the rule and is reached over clear air; until one turns up the bird keeps flying
          const p = perch(c, rules);
          if (p) {
            c.state = 'land';
            c.timer = 12;
            c.tx = p[0];
            c.tz = p[1];
          } else c.timer = 2;
        }
        if (c.state === 'land' && (c.timer <= 0 || (Math.abs(c.y - ground) < 0.25 && d < 0.5))) {
          // it settles on the perch it was checked for, not on the point it stopped at (up to 0.5 m short of it)
          c.state = 'sit';
          c.x = c.tx;
          c.z = c.tz;
          c.hx = c.x;
          c.hz = c.z;
          c.y = world.groundY(c.x, c.z);
          c.timer = c.rng.range(3, 8);
        }
        return;
      }
      c.y = world.groundY(c.x, c.z);
      if (near && dPlayer < 9) {
        // take off: away from the player, and up; the flight goes round the camp rings (straight away first, then to either side).
        // When no way out is clear the bird stays on its perch.
        const base = Math.atan2(c.x - px, c.z - pz);
        for (const turn of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
          const a = base + turn;
          const tx = c.x + Math.sin(a) * 30, tz = c.z + Math.cos(a) * 30;
          if (airClear(rules.air, c.x, c.z, tx, tz)) {
            c.tx = tx;
            c.tz = tz;
            c.state = 'fly';
            c.timer = 5;
            break;
          }
        }
        return;
      }
      c.timer -= dt;
      if (c.timer <= 0) {
        // a small hop on the perch, a peck
        c.timer = c.rng.range(3, 8);
        c.yaw = c.rng.range(0, Math.PI * 2);
      }
      return;
    }
    default:
      return;
  }
}

// ----------------------------------------------------------------------------------------------------------------------------------
// deer herds: skinned deer (deer.glb), no entity, neutral
// ----------------------------------------------------------------------------------------------------------------------------------

export const DEER_URL = '/assets/models/itch/creatures/deer.glb';
const DEER_SCALE = 0.8;
const DEER_FLEE_M = 9;
/** View sphere of a deer (m): its body, plus the camera-lag margin the NPCs use (entities/NPC.ts NPC_VIEW_MARGIN). */
const DEER_VIEW_M = 9;

/** One deer of a herd: a skinned model with an AnimController; it grazes, walks to a new spot, and flees when the player comes close. */
export class WildDeer {
  readonly obj: THREE.Object3D;
  private readonly anim: AnimController | null;
  private shown = '';
  private state: 'graze' | 'walk' | 'alert' | 'run' = 'graze';
  private timer: number;
  private tx: number;
  private tz: number;
  private x: number;
  private z: number;
  private yaw = 0;
  private readonly rng: RNG;

  /** `ok(x, z)` is the placement rule (walkable, dry, outside camps): the deer never walks onto ground it may not be placed on. */
  constructor(
    private readonly world: World,
    private readonly home: { x: number; z: number; r: number },
    seed: string,
    scene: THREE.Scene,
    private readonly ok: (x: number, z: number) => boolean,
  ) {
    this.rng = new RNG(hashString(seed));
    this.x = home.x;
    this.z = home.z;
    for (let i = 0; i < 12; i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(0, home.r);
      const x = home.x + Math.sin(a) * d, z = home.z + Math.cos(a) * d;
      if (ok(x, z)) {
        this.x = x;
        this.z = z;
        break;
      }
    }
    this.tx = this.x;
    this.tz = this.z;
    this.timer = this.rng.range(2, 8);
    this.obj = G.assets.instantiate(DEER_URL);
    this.obj.userData.ambient = true;
    this.obj.scale.setScalar(DEER_SCALE);
    this.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = false;
      }
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).frustumCulled = false;
    });
    this.obj.position.set(this.x, world.groundY(this.x, this.z), this.z);
    this.obj.rotation.y = this.yaw;
    scene.add(this.obj);
    this.anim = new AnimController(this.obj, G.assets.clips(DEER_URL));
    this.anim.setBase(this.anim.pick('Graze', 'Idle') ?? 'Idle', { fade: 0 });
    this.shown = this.anim.pick('Graze', 'Idle') ?? 'Idle';
  }

  update(dt: number, px: number, pz: number): void {
    const a = this.anim;
    const dp = Math.hypot(this.x - px, this.z - pz);
    // out of the view a deer is not drawn (no draw call, no triangles) and its clip rests; its walk and state still run
    const seen = inView(this.x, this.world.groundY(this.x, this.z) + 1, this.z, DEER_VIEW_M);
    this.obj.visible = seen;
    if (a && seen) a.update(dt);
    this.timer -= dt;
    if (this.state !== 'run' && dp < DEER_FLEE_M && this.state !== 'alert') {
      this.state = 'alert';
      this.timer = 1.1;
      this.set(a, 'Alert');
    }
    if (this.state === 'alert' && this.timer <= 0) {
      // away from the player, 22 m, at a run
      const dx = this.x - px, dz = this.z - pz, d = Math.hypot(dx, dz) || 1;
      this.tx = this.x + (dx / d) * 22;
      this.tz = this.z + (dz / d) * 22;
      if (!legClear(this.world.nav, this.ok, this.x, this.z, this.tx, this.tz)) {
        // no open ground that way: the herd gives up the run and stands where it is
        this.tx = this.x;
        this.tz = this.z;
      }
      this.state = 'run';
      this.timer = 6;
    }
    if (this.state === 'graze') {
      this.set(a, 'Graze');
      if (this.timer <= 0) {
        this.pickSpot();
        this.state = 'walk';
        this.timer = 14;
      }
    } else if (this.state === 'walk' || this.state === 'run') {
      const sp = this.state === 'run' ? 6.2 : 1.1;
      this.set(a, this.state === 'run' ? 'Run' : 'Walk');
      const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
      const s = Math.min(d, sp * dt);
      if (d > 1e-3) {
        this.yaw = Math.atan2(dx, dz);
        this.x += (dx / d) * s;
        this.z += (dz / d) * s;
      }
      if (d <= 0.2 || this.timer <= 0) {
        if (this.state === 'run') {
          this.state = 'walk';
          this.pickSpot();
          this.timer = 16;
        } else {
          this.state = 'graze';
          this.timer = this.rng.range(6, 12);
        }
      }
    } else if (this.state === 'alert' && this.timer > 0) {
      this.set(a, 'Alert');
    }
    this.obj.position.set(this.x, this.world.groundY(this.x, this.z), this.z);
    this.obj.rotation.y = this.yaw;
  }

  private pickSpot(): void {
    for (let i = 0; i < 6; i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(0, this.home.r);
      const tx = this.home.x + Math.sin(a) * d, tz = this.home.z + Math.cos(a) * d;
      if (legClear(this.world.nav, this.ok, this.x, this.z, tx, tz)) {
        this.tx = tx;
        this.tz = tz;
        return;
      }
    }
    this.tx = this.x;
    this.tz = this.z;
  }

  private set(a: AnimController | null, clip: string): void {
    if (!a || this.shown === clip || !a.has(clip)) return;
    this.shown = clip;
    a.setBase(clip, { fade: 0.25 });
  }

  dispose(): void {
    this.obj.removeFromParent();
    this.anim?.dispose();
  }
}
