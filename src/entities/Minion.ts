/**
 * Minion / pet / summon entity (GDD_CLASSES_V2 §1.5, NC39). Extends Actor, kind 'minion', team 'player'. The owner's peer
 * simulates it (authority = local owner). Created and removed only by combat/Minions.ts (`G.minions`); the brain is ai/MinionAI.ts.
 * Local-only for now: the `minion` net channel (NC43) is not wired (TODO NC43).
 */
import * as THREE from 'three';
import { Actor } from './Actor';
import { AnimController } from './AnimController';
import { MinionAI } from '../ai/MinionAI';
import { G } from '../game/G';
import type { EntityId } from '../types/common';
import type { MinionDef } from '../types/minions';

/** Seconds a dead minion stays on screen (bone pile) before it is removed. */
export const MINION_DEATH_LINGER = 2.0;

function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && o.name === name) found = o;
  });
  return found;
}

/** Multiplies every mesh material by `tint` on a per-mesh clone, so shared model materials stay untouched. */
function tintMeshes(root: THREE.Object3D, tint: number): void {
  const c = new THREE.Color(tint);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const cloned = mats.map((m) => {
      const cm = m.clone();
      const col = (cm as THREE.MeshStandardMaterial).color;
      if (col) col.multiply(c);
      return cm;
    });
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
  });
}

export class Minion extends Actor {
  readonly def: MinionDef;
  readonly ownerId: EntityId;
  /** Seconds left for timed summons. Only meaningful when `timed`; expiry is decided by Minions.update. */
  life: number;
  /** True for timed summons (life counts down to expiry); false for permanent pets. */
  readonly timed: boolean;
  /** Formation index (assigned by Minions.summon); spreads the minions around the owner. */
  slot = 0;
  readonly ai: MinionAI;
  /** Seconds left before a dead minion is removed (MINION_DEATH_LINGER after death). */
  deathLeft = 0;

  constructor(id: EntityId, def: MinionDef, ownerId: EntityId, life = 0) {
    super(id, 'minion', 'player');
    this.def = def;
    this.ownerId = ownerId;
    this.life = life;
    this.timed = life > 0;
    this.name = def.name;
    this.radius = def.radius;
    this.height = def.height;
    this.baseMoveSpeed = def.speed;
    this.authority = true;
    this.ai = new MinionAI();
  }

  /** The owning player (or undefined when the owner left the world). */
  get owner(): Actor | undefined {
    return this.world?.getActor(this.ownerId);
  }

  /** Loads the model (shared clips, own mixer, weapon attached to the hand bone, tint). Safe to call without G.assets. */
  async loadModel(): Promise<void> {
    const def = this.def;
    const holder = new THREE.Group();
    holder.name = `Minion_${def.id}`;
    await G.assets.load(def.model);
    if (this.removed) return;
    const root = G.assets.instantiate(def.model);
    root.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) sm.frustumCulled = false;
    });
    if (def.tint !== undefined) tintMeshes(root, def.tint);
    holder.add(root);
    for (const w of [def.weapon, def.offhand]) {
      if (!w) continue;
      const bone = findBone(root, w.bone);
      await G.assets.load(w.url);
      if (this.removed) return;
      const obj = G.assets.instantiate(w.url);
      obj.name = 'Prop';
      obj.position.set(...(w.pos ?? [0, 0.0333, 0]));
      obj.rotation.y = w.rotY ?? 0;
      if (w.scale) obj.scale.setScalar(w.scale);
      (bone ?? root).add(obj);
    }
    holder.scale.setScalar(def.scale);
    const anim = new AnimController(root, G.assets.get(def.model)?.clips ?? []);
    this.setModel(holder, anim);
    anim.setBase(anim.has(def.anims.idle) ? def.anims.idle : def.anims.run, { fade: 0 });
    if (def.anims.spawn && anim.has(def.anims.spawn)) anim.playOnce(def.anims.spawn, { speed: 2.2, fade: 0.05 });
  }

  /** Base locomotion layer. `speed` in m/s. */
  setLocomotion(kind: 'idle' | 'walk' | 'run', speed = 0): void {
    const a = this.anim;
    if (!a || a.locked) return;
    const an = this.def.anims;
    let clip = kind === 'run' ? an.run : kind === 'walk' ? an.walk : an.idle;
    if (!a.has(clip)) clip = a.pick(an.run, an.walk, an.idle) ?? clip;
    const ts = kind === 'idle' ? 1 : Math.min(1.8, Math.max(0.55, speed / Math.max(0.5, this.def.speed)));
    a.setBase(clip, { fade: 0.14, speed: ts });
  }

  /** One-shot (attack / death). Returns its duration in seconds, 0 when the clip is missing. */
  playShot(name: string | null | undefined, speed = 1, opts: { hold?: boolean } = {}): number {
    const a = this.anim;
    if (!a || !name || !a.has(name) || a.locked) return 0;
    return a.playOnce(name, { speed, fade: 0.08, hold: opts.hold, restart: true });
  }

  /** Marks the minion dead: death clip (held), linger timer. Minions.die emits the event and queues any respawn. */
  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.deathLeft = MINION_DEATH_LINGER;
    this.playShot(this.def.anims.death, 1, { hold: true });
  }

  /** Vertical worlds keep feet on the ground; flat worlds keep y = 0. */
  private stepFeet(): void {
    const w = this.world;
    this.position.y = w?.vertical && w.heights ? w.heights.groundY(this.position.x, this.position.z) : 0;
  }

  override update(dt: number): void {
    super.update(dt);
    // a dead minion only plays its death clip; Minions.update counts deathLeft and removes it
    if (this.isDead) return;
    if (this.timed) this.life = Math.max(0, this.life - dt);
    this.ai.update(this, dt);
    this.stepFeet();
  }
}
