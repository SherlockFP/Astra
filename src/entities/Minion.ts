/**
 * Minion / pet / summon entity (GDD_CLASSES_V2 §1.5, NC39). Extends Actor, kind 'minion', team 'player'. The owner's peer
 * simulates it (authority = local owner). Created and removed only by combat/Minions.ts (`G.minions`); the brain is ai/MinionAI.ts.
 * NC43: other peers hold a REMOTE copy (`authority = false`, created by net/Replication from the `minion` channel): no AI, it follows
 * the interpolated snapshots (`applySyncState`) and replays the owner's one-shots. HP lives on the owner; damage to a remote copy is
 * resolved by its owner's peer (Combat.hitMinion), so the copy only mirrors `hp` from the snapshots.
 */
import * as THREE from 'three';
import { Actor } from './Actor';
import { AnimController } from './AnimController';
import { Interpolator } from './Interpolator';
import { MinionAI } from '../ai/MinionAI';
import { G } from '../game/G';
import { clamp } from '../core/utils';
import type { EntityId } from '../types/common';
import type { MinionDef, MinionSync } from '../types/minions';

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
  /** One-shots played so far and the last one (name, speed): the `minion` snapshot carries them so remote copies replay swings. */
  shotSeq = 0;
  private lastShot: { name: string; speed: number } | null = null;
  /** Remote copy only (authority false): snapshot buffer and replay state. */
  readonly interp = new Interpolator();
  private readonly remoteOut = { x: 0, y: 0, z: 0, yaw: 0 };
  private remoteShotSeq = -1;
  private remoteBase = '';
  private readonly pendingShots: { at: number; name: string; speed: number }[] = [];
  /** Engine time of the last snapshot (remote copy; Replication drops the copy 1.5 s after the last one). */
  lastSeen = 0;

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
    if (name !== this.def.anims.death) {
      this.lastShot = { name, speed };
      this.shotSeq++;
    }
    return a.playOnce(name, { speed, fade: 0.08, hold: opts.hold, restart: true });
  }

  // ---- NC43 net -----------------------------------------------------------------------------------------------------------

  /**
   * The owner's snapshot of this minion (`minion` channel, 10 Hz). `anim` = the base clip name, plus `@shot:speed#seq` once a
   * one-shot has played (the receiver replays it when `seq` changes). Positions are rounded to 1 cm.
   */
  getSyncState(): MinionSync {
    const base = this.anim?.baseName ?? '';
    const ls = this.lastShot;
    const anim = ls && this.shotSeq > 0 ? `${base}@${ls.name}:${ls.speed.toFixed(2)}#${this.shotSeq}` : base;
    return {
      id: this.id, defId: this.def.id, ownerId: this.ownerId,
      x: Math.round(this.position.x * 100) / 100, z: Math.round(this.position.z * 100) / 100, yaw: Math.round(this.yaw * 100) / 100,
      anim, hp: Math.max(0, Math.round(this.hp)), maxHp: Math.max(1, Math.round(this.maxHp)), life: this.timed ? Math.round(this.life * 10) / 10 : 0,
    };
  }

  /** Remote copy: take a snapshot (`now` = the sender time mapped onto the local clock). Death is the hp <= 0 edge. */
  applySyncState(s: MinionSync, now: number): void {
    this.interp.push({ t: now, x: s.x, y: NaN, z: s.z, yaw: s.yaw });
    this.lastSeen = G.engine?.time ?? 0;
    this.maxHp = s.maxHp;
    if (s.hp <= 0) {
      this.hp = 0;
      if (this.alive) this.kill();
      return;
    }
    this.hp = s.hp;
    if (this.timed) this.life = s.life;
    const at = s.anim.indexOf('@');
    this.remoteBase = at >= 0 ? s.anim.slice(0, at) : s.anim;
    if (at < 0) return;
    const m = /^([^:]+):([0-9.]+)#(\d+)$/.exec(s.anim.slice(at + 1));
    if (!m) return;
    const seq = parseInt(m[3], 10);
    if (this.remoteShotSeq === -1) this.remoteShotSeq = seq;   // first snapshot: do not replay history
    else if (seq !== this.remoteShotSeq) {
      this.remoteShotSeq = seq;
      this.pendingShots.push({ at: now + this.interp.delay, name: m[1], speed: clamp(parseFloat(m[2]) || 1, 0.3, 4) });
      if (this.pendingShots.length > 4) this.pendingShots.shift();
    }
  }

  /** Remote copy per-frame: interpolated pose, locomotion from the snapshot's base clip, delayed one-shots. */
  private updateRemote(dt: number): void {
    if (!this.world) return;
    const now = G.engine?.time ?? 0;
    if (this.interp.sample(now, this.remoteOut)) {
      const o = this.remoteOut;
      if (dt > 1e-4) {
        const k = 1 - Math.exp(-12 * dt);
        this.velocity.x += (clamp((o.x - this.position.x) / dt, -40, 40) - this.velocity.x) * k;
        this.velocity.z += (clamp((o.z - this.position.z) / dt, -40, 40) - this.velocity.z) * k;
      }
      this.position.x = o.x;
      this.position.z = o.z;
      this.yaw = o.yaw;
    }
    this.stepFeet();
    const a = this.anim;
    if (!a) return;
    for (let i = this.pendingShots.length - 1; i >= 0; i--) {
      const sh = this.pendingShots[i];
      if (now < sh.at) continue;
      this.pendingShots.splice(i, 1);
      this.playShot(sh.name, sh.speed);
    }
    if (this.remoteBase && a.has(this.remoteBase)) a.setBase(this.remoteBase, { fade: 0.14 });
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
    // a dead minion only plays its death clip; Minions.update counts deathLeft and removes it (a remote copy: Replication does)
    if (this.isDead) {
      if (!this.authority) this.deathLeft -= dt;
      return;
    }
    if (!this.authority) {
      this.updateRemote(dt);
      return;
    }
    if (this.timed) this.life = Math.max(0, this.life - dt);
    this.ai.update(this, dt);
    this.stepFeet();
  }
}
