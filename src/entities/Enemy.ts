import * as THREE from 'three';
import { Actor } from './Actor';
import { AnimController } from './AnimController';
import { Interpolator } from './Interpolator';
import { G } from '../game/G';
import { Assets } from '../core/Assets';
import { buildProcModel, type ProcModel } from '../ai/procModels';
import { BOSSES, ENEMIES } from '../data/enemies';
import type { EntityId } from '../types/common';
import type { BossDef, EnemyAttach, EnemyDef } from '../types/enemies';
import type { EnemyAI } from '../ai/EnemyAI';

// Hide lists and hp-driven node toggles address meshes by name: keep those meshes separate when models are merged on load.
for (const d of [...Object.values(ENEMIES), ...Object.values(BOSSES)]) {
  Assets.keepNodeNames(d.visual?.hide ?? []);
  if (d.visual?.hideBelowHp) Assets.keepNodeNames([d.visual.hideBelowHp.node]);
}

/** Compact replicated enemy state (host -> clients ~15 Hz). */
export interface EnemySyncState {
  id: EntityId;
  x: number; z: number; yaw: number;
  hp: number; maxHp: number;
  anim: string;                 // base clip
  targetId: EntityId | null;
  cast: string | null;          // ability id being cast
  dead: boolean;
  shot?: string | null;         // one-shot clip (melee swing / ability) for client replay, "Clip:speed"
  shotSeq?: number;             // increments per new one-shot
  aggroed?: boolean;
}

/** Champions with the Kalkanlı modifier (allies within 8 m take 40% less damage); filled by ai/champion.ts on every peer. */
export const SHIELDERS = new Set<Enemy>();

const EYE_RE = /eye|glow/i;
const SOFT_RE = /tongue|teeth/i;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** Distance LOD from the local player (squared metres): mixer every 4th frame beyond 35 m, frozen beyond 60 m (idle enemies only). */
const ANIM_MID2 = 35 * 35;
const ANIM_FAR2 = 60 * 60;
/** Culling of non-aggroed enemies: hidden beyond 70 m, shown again inside 66 m (hysteresis). */
const CULL_OUT2 = 70 * 70;
const CULL_IN2 = 66 * 66;

/** Enemies cast no real shadows and take none: the G.vfx.blobShadow under the feet is their shadow. */
function noShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
}
const _box = new THREE.Box3();
const HEIGHT_CACHE = new Map<string, number>();
const _v = new THREE.Vector3();
let lastAggroSfx = -9;
/** Attack barks (G.audio.voice, orc voice pack) by model file: pitch factor. Goblins squeak, brutes growl. */
const BARK_PITCH: Record<string, number> = {
  'Orc.glb': 1, 'Goblin.glb': 1.35, 'Demon.glb': 0.74, 'Demon_Lord.glb': 0.62, 'Blue_Demon.glb': 0.7, 'Giant.glb': 0.6, 'Yeti.glb': 0.72, 'Mushroom_King.glb': 0.66,
};

/** GLTFLoader strips '.' from node names ('handslot.r' -> 'handslotr'). */
function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  const sanitized = name.replace(/[.\[\]:/]/g, '');
  let found: THREE.Object3D | null = root.getObjectByName(sanitized) ?? root.getObjectByName(name) ?? null;
  if (!found) {
    root.traverse((o) => {
      if (!found && (o.userData?.name === name || o.name === name)) found = o;
    });
  }
  return found;
}

/**
 * Hostile actor. On the HOST (or offline) `ai` drives it; on clients it follows snapshots via `interp`.
 * OWNER: enemies module (model setup, AI in ai/EnemyAI.ts, bosses in ai/BossController.ts,
 * factory spawnEnemy() in entities/EnemyFactory.ts).
 */
export class Enemy extends Actor {
  readonly def: EnemyDef;
  readonly isBoss: boolean;
  /** Pack this enemy belongs to (dungeon pull logic / linked pulls). */
  packId: string | null = null;
  /** Home position (leash). */
  homeX = 0;
  homeZ = 0;
  /** Host-side AI brain (null on clients). */
  ai: EnemyAI | null = null;
  readonly interp: Interpolator;
  /** Base damage per hit before ability coefficients (level + rank + M+ scaling applied). */
  baseDamage = 10;
  /** Whether the enemy counted for M+ forces already (summoned / split / raised adds are created with this = true). */
  forcesCounted = false;
  /** Extra visual scale multiplier (bolstering etc.). */
  visualScale = 1;
  aggroed = false;

  // ---- enemies module additions ----
  /** Spawned mid-fight by the host (id >= HOST_DYNAMIC_ID_BASE): adds, splits, raised skeletons. */
  dynamic = false;
  /** Boss/summoner that created this entity (adds are removed when the boss resets). */
  ownerId: EntityId | null = null;
  /** Free-form tag set by boss scripts (e.g. 'add', 'image', 'clone'). */
  tag = '';
  /** Dormant (floor pose) until a player gets close or it is damaged. */
  dormant = false;
  /** Hidden by stealth (alpha 0.15). */
  hidden = false;
  /** Hover height of flyers / floating bodies. */
  hover = 0;
  /** Shield-like damage taken modifiers (frontal block, vulnerability windows). The attacker is the LOCAL player. */
  readonly takenHooks: ((attacker: Actor | null) => number)[] = [];
  /** Timed damage-taken windows (boss mechanics, replicated through bossNet 'boss_dmgwin'): arc undefined = from everywhere. */
  private windows: { until: number; mult: number; arc?: number; back: number }[] = [];
  /** Aggro / pack metadata for the director. */
  patrol: { x: number; z: number }[] | null = null;
  /** Şampiyon (GDD 1.5): set on every peer by ai/champion.ts makeChampion(); LootSystem reads `champion` for the guaranteed rare drop. */
  champion = false;
  championMod = '';
  /** Boss arena measurements (boss only). */
  arena: { cx: number; cz: number; w: number; h: number } | null = null;
  /** Times this enemy was brought back from the dead (Diriltici champions). Combat counts every life separately (loot / XP / forces). */
  reviveCount = 0;
  /** World time until which the corpse is kept (a Diriltici champion of its pack is alive and may raise it). Read by Combat's corpse sweep. */
  corpseHoldUntil = 0;
  /** Whole-pack stealth (PackDef.stealth): alpha 0.15 until the pack aggroes / is hit, on every peer. */
  packStealth = false;
  /** Wake-up radius override of a dormant spawn (PackDef.dormant.wakeRadius); 0 = def.ai.wakeRange. */
  wakeRange = 0;
  /** Last player (or enemy) whose knockback is pending on this enemy: Combat sets it, EnemyAI reads it when the push cuts a cast. */
  kbBy: EntityId | null = null;

  private holder: THREE.Group | null = null;
  /** Distance LOD state: 1 = mixer every frame, 4 = every 4th frame with the accumulated dt, 0 = frozen (see updateLod). */
  private animLod = 1;
  private animPhase = 0;
  private animAcc = 0;
  /** Hidden by distance culling (object3d.visible set by updateLod; not the stealth `hidden` flag). */
  private culled = false;
  private proc: ProcModel | null = null;
  private shadow: THREE.Object3D | null = null;
  private mats: { m: THREE.Material; base: number }[] = [];
  private alphaNow = 1;
  private alphaTarget = 1;
  private animT = Math.random() * 10;
  private deathHandled = false;
  private deadAt = 0;
  private spawnPop = 0;
  private lastShot = { name: '', speed: 1, loop: 0 };
  /** Seconds a looping one-shot will run (set by playShot(loopFor), replicated so clients stop the loop too). */
  private loopHint = 0;
  private runRef = 6;
  private walkRef = 3;

  // remote replication
  private readonly remoteOut = { x: 0, y: 0, z: 0, yaw: 0 };
  private remoteHasPos = false;
  private remoteAnim = '';
  private remoteShotSeq = -1;
  private remoteAggro = false;
  private pendingShots: { at: number; clip: string; speed: number; loop: number }[] = [];
  private remoteLoopEnd = 0;
  private lastSnapDead = 0;
  private blockerAt: { x: number; z: number; r: number } | null = null;
  private hideNode: THREE.Object3D | null | undefined;
  private holdCheckAt = 0;

  constructor(id: EntityId, def: EnemyDef) {
    super(id, 'enemy', 'enemy');
    this.def = def;
    this.isBoss = def.rank === 'boss';
    this.name = def.name;
    this.radius = def.radius;
    this.baseMoveSpeed = def.speed;
    this.interp = new Interpolator();
    this.hover = def.hoverHeight ?? 0;
    this.runRef = Math.max(0.5, def.visual?.runRef ?? def.speed);
    this.walkRef = Math.max(0.5, def.speed * (def.ai?.patrolMul ?? 0.45));
    this.height = 2;
    // frontal block passives (Kalkan Duruşu) must work on every peer: the attacker's machine computes the damage
    for (const ab of def.abilities) {
      if (ab.params?.passive && ab.params.arc !== undefined && ab.params.reduce !== undefined) {
        const arc = ab.params.arc, reduce = ab.params.reduce;
        this.takenHooks.push((atk) => (this.isFrontOf(atk, arc) ? 1 - reduce : 1));
      }
    }
    // damage-taken hooks piggy-back on StatusEffects.takenMore (Combat multiplies player->enemy damage by it on the attacker's
    // machine, where the attacker is always the local player)
    const st = this.statuses;
    const base = st.takenMore.bind(st);
    st.takenMore = () => {
      let m = base();
      if (this.takenHooks.length) {
        const atk = G.world?.localPlayer ?? null;
        for (const h of this.takenHooks) m *= h(atk);
      }
      if (this.windows.length) {
        const now = this.world?.time ?? 0;
        const atk = G.world?.localPlayer ?? null;
        for (let i = this.windows.length - 1; i >= 0; i--) {
          const w = this.windows[i];
          if (now >= w.until) {
            this.windows.splice(i, 1);
            continue;
          }
          m *= w.arc === undefined ? w.mult : this.isFrontOf(atk, w.arc) ? w.mult : w.back;
        }
      }
      if (SHIELDERS.size && !this.champion) {
        for (const s of SHIELDERS) {
          if (s === this || s.isDead || s.removed) continue;
          if (Math.hypot(s.position.x - this.position.x, s.position.z - this.position.z) <= 8) {
            m *= 0.6;
            break;
          }
        }
      }
      // Morkan's bone cage: the trapped player's own attacks hit it at 50% (tag 'cage:<playerId>' is replicated by the spawn message)
      if (this.tag.startsWith('cage:') && G.world?.localPlayer?.id === Number(this.tag.slice(5))) m *= 0.5;
      return m;
    };
  }

  /**
   * Timed damage-taken window (every peer calls this from the boss message): `mult` applies to everything, or — with `arc` — only
   * to hits from inside the frontal arc while `back` applies to hits from outside it (Kalkan Duvarı: 0.1 front, 1.2 behind).
   */
  addDamageWindow(seconds: number, mult: number, arc?: number, back = 1): void {
    const now = this.world?.time ?? 0;
    this.windows.push({ until: now + seconds, mult, arc, back });
    if (this.windows.length > 12) this.windows.shift();
  }

  /** Back from the dead (Diriltici champions): every peer plays this; the host then attaches a fresh AI. */
  revive(hpFrac: number): void {
    if (this.removed || !this.isDead) return;
    this.reviveCount++;
    this.corpseHoldUntil = 0;
    this.alive = true;
    this.hp = Math.max(1, Math.round(this.maxHp * hpFrac));
    this.deathHandled = false;
    this.deadAt = 0;
    this.lastSnapDead = 0;
    this.cast = null;
    this.statuses.clear();
    this.dormant = false;
    this.forcedMove = null;
    this.velocity.set(0, 0, 0);
    if (this.holder) this.holder.position.y = 0;
    this.alphaNow = 1;
    this.alphaTarget = 1;
    this.applyAlpha();
    this.shadow?.scale.setScalar(1);
    this.anim?.reset();
    this.setLocomotion('idle');
    try {
      G.vfx.spawn('heal_burst', this.pointAt(0.5));
      G.vfx.spawn('add_spawn', [this.position.x, 0.3, this.position.z], { scale: 0.8 });
      G.audio.play('heal', { pos: [this.position.x, 1, this.position.z], pitch: 0.8 });
    } catch { /* ignore */ }
  }

  get bossDef(): BossDef | null {
    return this.isBoss ? (this.def as BossDef) : null;
  }

  /** True when `attacker` stands inside the enemy's frontal arc (degrees). */
  isFrontOf(attacker: { position: THREE.Vector3 } | null, arcDeg: number): boolean {
    if (!attacker) return false;
    const dx = attacker.position.x - this.position.x, dz = attacker.position.z - this.position.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.01) return true;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    return (fx * dx + fz * dz) / l >= Math.cos(((arcDeg / 2) * Math.PI) / 180);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Model
  // -------------------------------------------------------------------------------------------------------------------

  /** Load the model, tint/scale it, set up animations. */
  async loadModel(): Promise<void> {
    const def = this.def;
    const vis = def.visual ?? {};
    const holder = new THREE.Group();
    holder.name = `Enemy_${def.id}`;
    let anim: AnimController | null = null;

    if (def.model.startsWith('PROC:')) {
      const proc = buildProcModel(def.model.slice(5), def.tint);
      if (proc) {
        this.proc = proc;
        holder.add(proc.root);
      } else console.warn(`[enemy] unknown procedural model ${def.model}`);
    } else {
      const asset = await G.assets.load(def.model);
      const root = G.assets.instantiate(def.model);
      Assets.cloneMaterials(root);
      let clips = asset?.clips ?? [];
      if (vis.clipsFrom) {
        const extra = await G.assets.load(vis.clipsFrom);
        if (extra) {
          const have = new Set(clips.map((c) => c.name));
          clips = clips.concat(extra.clips.filter((c) => !have.has(c.name)));
        }
      }
      if (this.removed) return;
      const hide = new Set(vis.hide ?? []);
      root.traverse((o) => {
        if (hide.has(o.name)) o.visible = false;
        const sm = o as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh) sm.frustumCulled = false;
      });
      this.styleMaterials(root);
      holder.add(root);
      if (vis.attach?.length) await this.attachProps(root, vis.attach);
      if (this.removed) return;
      const ac = new AnimController(root, clips);
      anim = ac;
      // distance LOD: Actor.update calls anim.update(dt) every frame; far enemies only step the mixer every animLod-th frame
      // (accumulated dt, so timing is kept) and idle ones beyond 60 m are frozen (animLod 0, dt dropped)
      const rawUpdate = ac.update.bind(ac);
      ac.update = (dt: number) => {
        if (this.animLod === 0) {
          this.animAcc = 0;
          return;
        }
        this.animAcc += dt;
        if (++this.animPhase < this.animLod) return;
        this.animPhase = 0;
        const step = this.animAcc;
        this.animAcc = 0;
        rawUpdate(step);
      };
      // remember the last one-shot (also those started by Combat's hit reactions) for client replay
      const orig = ac.playOnce.bind(ac);
      ac.playOnce = (name, opts) => {
        const r = orig(name, opts);
        this.lastShot = { name, speed: (opts?.speed ?? 1) * (anim?.shotSpeed ?? 1), loop: opts?.loop ? this.loopHint || 4 : 0 };
        this.loopHint = 0;
        return r;
      };
    }

    holder.scale.setScalar(def.scale * this.visualScale);
    holder.position.y = 0;
    // every enemy mesh (model, attached props, procedural parts) skips the shadow map
    noShadows(holder);
    this.setModel(holder, anim);
    this.holder = holder;

    // collectable materials (alpha / disposal)
    this.mats = [];
    holder.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) this.mats.push({ m: mat, base: mat.opacity });
    });

    // shadow
    try {
      const sh = G.vfx.blobShadow(Math.max(0.5, this.radius * 1.5));
      sh.position.y = 0.03;
      this.object3d.add(sh);
      this.shadow = sh;
    } catch { /* vfx not ready */ }

    // measure (cached per def: skinning-accurate bounds are expensive)
    this.height = clamp(this.measureHeight(holder), 0.8, 14) + this.hover;

    if (anim) {
      this.animT = Math.random() * 3;
      const idle = this.idleClip();
      anim.setBase(idle, { fade: 0 });
      anim.update(this.animT); // desync identical enemies
    }
  }

  private measureHeight(holder: THREE.Group): number {
    const def = this.def;
    if (this.proc) return this.proc.height * def.scale;
    let h = HEIGHT_CACHE.get(def.id);
    if (h === undefined) {
      holder.updateWorldMatrix(true, true);
      _box.makeEmpty();
      try {
        _box.setFromObject(holder, true);
      } catch { /* ignore */ }
      h = _box.isEmpty() ? 2 : Math.max(0.5, _box.max.y - Math.min(0, _box.min.y));
      HEIGHT_CACHE.set(def.id, h);
    }
    return h * def.scale * this.visualScale;
  }

  /** Tint / emissive / eye / ghost opacity on the cloned materials. */
  private styleMaterials(root: THREE.Object3D): void {
    const def = this.def;
    const vis = def.visual ?? {};
    const tint = def.tint !== undefined ? new THREE.Color(def.tint) : null;
    const emissive = def.emissive !== undefined ? new THREE.Color(def.emissive) : null;
    const eye = vis.eyeEmissive !== undefined ? new THREE.Color(vis.eyeEmissive) : null;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of list) {
        const m = raw as THREE.MeshStandardMaterial;
        const nm = m.name ?? '';
        const isEye = EYE_RE.test(nm) || EYE_RE.test(mesh.name);
        if (!isEye && !SOFT_RE.test(nm) && tint && m.color) m.color.multiply(tint);
        if (isEye) {
          if (eye && m.emissive) {
            m.emissive.copy(eye);
            m.emissiveIntensity = 1.6;
          }
        } else if (emissive && m.emissive) {
          m.emissive.copy(emissive);
          m.emissiveIntensity = vis.emissiveIntensity ?? 0.55;
        }
        if (vis.opacity !== undefined && vis.opacity < 1) {
          m.transparent = true;
          m.opacity = vis.opacity;
          m.depthWrite = false;
        }
        if ((m as THREE.MeshStandardMaterial).metalness !== undefined && !m.map && !m.vertexColors && m.metalness > 0.05) {
          // FBX2glTF flat-colour monsters (metalness 0.4) render muddy without an environment map
          m.metalness = 0;
          m.roughness = 1;
        }
      }
    });
  }

  private async attachProps(root: THREE.Object3D, list: EnemyAttach[]): Promise<void> {
    for (const a of list) {
      const bone = findBone(root, a.bone);
      if (!bone) continue;
      await G.assets.load(a.url);
      if (this.removed) return;
      const obj = G.assets.instantiate(a.url);
      Assets.cloneMaterials(obj);
      obj.name = 'Prop';
      obj.position.set(...(a.pos ?? [0, 0.0333, 0]));
      if (a.quat) obj.quaternion.set(...a.quat);
      else obj.rotation.y = a.rotY ?? 0;
      if (a.scale) obj.scale.setScalar(a.scale);
      // shadows: noShadows(holder) in loadModel covers attached props too
      bone.add(obj);
    }
  }

  onAdded(world: import('../world/World').World): void {
    super.onAdded(world);
    const r = this.def.visual?.blocker;
    if (r) {
      world.nav.setCircle(this.position.x, this.position.z, r, false);
      this.blockerAt = { x: this.position.x, z: this.position.z, r };
    }
  }

  /** Scale multiplier for bolstering / enrage swell. */
  setVisualScale(k: number): void {
    this.visualScale = k;
    if (this.holder) this.holder.scale.setScalar(this.def.scale * k);
  }

  /** Alpha 0..1 on top of the def opacity (stealth, fade-out). Smoothed in update(). */
  setAlpha(a: number, instant = false): void {
    this.alphaTarget = clamp(a, 0, 1);
    if (instant) {
      this.alphaNow = this.alphaTarget;
      this.applyAlpha();
    }
  }

  private applyAlpha(): void {
    const a = this.alphaNow;
    for (const e of this.mats) {
      const baseOp = this.def.visual?.opacity ?? 1;
      const op = Math.min(1, baseOp) * a;
      e.m.opacity = op;
      const transparent = op < 0.995;
      if (e.m.transparent !== transparent && baseOp >= 1) {
        e.m.transparent = transparent;
        e.m.depthWrite = !transparent;
      }
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Animation helpers (host AI + clients)
  // -------------------------------------------------------------------------------------------------------------------

  /** Preferred idle clip (dormant enemies use their floor pose). */
  idleClip(): string {
    const a = this.anim;
    if (this.dormant && a?.has('Skeletons_Inactive_Floor_Pose')) return 'Skeletons_Inactive_Floor_Pose';
    return this.def.anims.idle;
  }

  /** Base locomotion layer. `speed` = current horizontal speed in m/s. */
  setLocomotion(kind: 'idle' | 'walk' | 'run' | 'back', speed = 0): void {
    const a = this.anim;
    if (!a || a.locked) return;
    const an = this.def.anims;
    let clip: string;
    let ts = 1;
    switch (kind) {
      case 'walk':
        clip = an.walk;
        ts = clamp(speed / this.walkRef, 0.55, 1.8);
        break;
      case 'run':
        clip = an.run;
        ts = clamp(speed / this.runRef, 0.55, 1.6);
        break;
      case 'back':
        clip = a.has('Walking_Backwards') ? 'Walking_Backwards' : an.walk;
        ts = clamp(speed / 3.2, 0.6, 1.5);
        break;
      default:
        clip = this.idleClip();
    }
    if (!a.has(clip)) clip = a.pick(an.run, an.walk, an.idle) ?? clip;
    a.setBase(clip, { fade: 0.14, speed: ts });
  }

  /** Play a one-shot (attack / cast / roar). Returns its duration in seconds (0 if the clip does not exist). */
  playShot(name: string | null | undefined, speed = 1, opts: { fade?: number; hold?: boolean; loop?: boolean; loopFor?: number } = {}): number {
    const a = this.anim;
    if (!a || !name || !a.has(name) || a.locked) return 0;
    this.loopHint = opts.loop ? Math.max(0.3, opts.loopFor ?? 4) : 0;
    return a.playOnce(name, { speed, fade: opts.fade ?? 0.08, hold: opts.hold, loop: opts.loop, restart: true });
  }

  clipDuration(name: string): number {
    return this.anim?.clipDuration(name) ?? 0;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Network
  // -------------------------------------------------------------------------------------------------------------------

  getSyncState(): EnemySyncState {
    const a = this.anim;
    const ls = this.lastShot;
    const shot = a && a.shotSeq > 0 && ls.name ? `${ls.name}:${ls.speed.toFixed(2)}${ls.loop > 0 ? `:${ls.loop.toFixed(1)}` : ''}` : null;
    return {
      id: this.id, x: this.position.x, z: this.position.z, yaw: this.yaw, hp: this.hp, maxHp: this.maxHp,
      anim: a?.baseName ?? '', targetId: this.targetId, cast: this.cast?.skillId ?? null, dead: this.isDead,
      shot, shotSeq: a?.shotSeq ?? 0, aggroed: this.aggroed,
    };
  }

  applySyncState(s: EnemySyncState, now: number): void {
    this.interp.push({ t: now, x: s.x, y: 0, z: s.z, yaw: s.yaw });
    const prevHp = this.hp;
    this.hp = s.hp;
    this.maxHp = s.maxHp;
    this.targetId = s.targetId;
    this.remoteAnim = s.anim || this.def.anims.idle;
    if (s.dead && !this.isDead) this.lastSnapDead = G.engine.time;
    else if (!s.dead) this.lastSnapDead = 0;

    // heal burst when the host healed this enemy (hp jumped up by a lot)
    if (!s.dead && s.hp - prevHp >= this.maxHp * 0.08 && prevHp > 0 && this.world) {
      try {
        G.vfx.spawn('heal_burst', this.pointAt(0.5));
        G.events.emit('heal', { targetId: this.id, sourceId: null, amount: Math.round(s.hp - prevHp), pos: [this.position.x, this.position.y + this.height * 0.9, this.position.z] });
      } catch { /* ignore */ }
    }

    if (s.aggroed !== undefined) {
      if (s.aggroed && !this.remoteAggro) this.onRemoteAggro(s.targetId);
      this.remoteAggro = s.aggroed;
      this.aggroed = s.aggroed;
      if (s.aggroed) this.dormant = false;
      if (this.def.ai?.stealthReveal || this.packStealth) {
        this.hidden = !s.aggroed;
        this.setAlpha(s.aggroed ? 1 : 0.15);
      }
    }

    if (s.shotSeq !== undefined) {
      if (this.remoteShotSeq === -1) this.remoteShotSeq = s.shotSeq;
      else if (s.shotSeq !== this.remoteShotSeq) {
        this.remoteShotSeq = s.shotSeq;
        if (s.shot) {
          const [clip, sp, lp] = s.shot.split(':');
          this.pendingShots.push({ at: now + this.interp.delay, clip, speed: sp ? clamp(parseFloat(sp) || 1, 0.3, 4) : 1, loop: lp ? clamp(parseFloat(lp) || 0, 0, 120) : 0 });
        }
      }
    }
  }

  private onRemoteAggro(targetId: EntityId | null): void {
    try {
      G.events.emit('enemy:aggro', { enemyId: this.id, targetId: targetId ?? 0 });
      this.aggroSfx();
      if (this.def.ai?.dormant) {
        G.vfx.spawn('add_spawn', this.position);
        G.events.emit('camera:shake', { intensity: 0.08, duration: 0.3 });
      }
    } catch { /* ignore */ }
  }

  /**
   * Orc / goblin / brute attack bark (G.audio.voice keeps its own per-kind rate limit; the chance keeps a pack from shouting in chorus).
   * Called by EnemyAI when an attack starts (host) and by updateRemote when a client replays the swing.
   */
  bark(heavy = false): void {
    try {
      const pitch = BARK_PITCH[this.def.model.split('/').pop() ?? ''];
      if (pitch === undefined) return;
      G.audio.voice(heavy ? 'heavy' : 'attack', { pack: 'orc', pos: [this.position.x, this.position.y + 1.4, this.position.z], other: true, chance: heavy ? 0.55 : 0.3, pitch });
    } catch { /* ignore */ }
  }

  /** Rate-limited aggro bark (a 20-pack aggroing together is one sound, not twenty). */
  aggroSfx(): void {
    const t = G.engine?.time ?? 0;
    if (t - lastAggroSfx < 0.6) return;
    lastAggroSfx = t;
    try {
      G.audio.play('enemy_aggro', { pos: [this.position.x, this.position.y + 1, this.position.z], pitchVar: 0.1 });
    } catch { /* ignore */ }
  }

  private updateRemote(dt: number): void {
    const world = this.world;
    if (!world) return;
    if (this.interp.sample(G.engine.time, this.remoteOut)) {
      const o = this.remoteOut;
      if (this.remoteHasPos && dt > 1e-4) {
        const vx = (o.x - this.position.x) / dt, vz = (o.z - this.position.z) / dt;
        const k = 1 - Math.exp(-12 * dt);
        const lim = 40;
        this.velocity.x += (clamp(vx, -lim, lim) - this.velocity.x) * k;
        this.velocity.z += (clamp(vz, -lim, lim) - this.velocity.z) * k;
      }
      this.position.x = o.x;
      this.position.z = o.z;
      this.yaw = o.yaw;
      this.remoteHasPos = true;
    }
    const a = this.anim;
    if (!a) return;
    const now = G.engine.time;
    for (let i = this.pendingShots.length - 1; i >= 0; i--) {
      const sh = this.pendingShots[i];
      if (now < sh.at) continue;
      this.pendingShots.splice(i, 1);
      if (this.isDead || !a.has(sh.clip) || sh.clip === this.def.anims.death) continue;
      a.playOnce(sh.clip, { speed: sh.speed, fade: 0.06, restart: true, loop: sh.loop > 0 });
      this.remoteLoopEnd = sh.loop > 0 ? now + sh.loop : 0;
      if (sh.clip !== this.def.anims.hit && sh.clip !== this.def.anims.spawn) this.bark(false);
    }
    if (this.remoteLoopEnd && now >= this.remoteLoopEnd) {
      this.remoteLoopEnd = 0;
      if (!this.isDead) a.cancelOneShot(0.12);
    }
    if (this.pendingShots.length > 6) this.pendingShots.splice(0, this.pendingShots.length - 6);
    if (!this.isDead && !this.statuses.has('freeze')) {
      let name = this.remoteAnim || this.def.anims.idle;
      if (!a.has(name)) name = this.def.anims.idle;
      const sp = Math.hypot(this.velocity.x, this.velocity.z);
      let ts = 1;
      if (name === this.def.anims.run) ts = clamp(sp / this.runRef, 0.55, 1.6);
      else if (name === this.def.anims.walk) ts = clamp(sp / this.walkRef, 0.55, 1.8);
      else if (name === 'Walking_Backwards') ts = clamp(sp / 3.2, 0.6, 1.5);
      a.setBase(name, { fade: 0.14, speed: ts });
    }
    // cast bar watchdog (the 'ecast' end message may be lost)
    if (this.cast && world.time > this.cast.start + Math.max(0.5, this.cast.duration) + 0.8) this.cast = null;
    // snapshot says dead but the 'death' message never came: fall over anyway
    if (this.lastSnapDead && !this.isDead && G.engine.time - this.lastSnapDead > 1.5) {
      this.hp = 0;
      this.alive = false;
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------------------------------------------------

  /**
   * Distance LOD + culling against the local player (squared distances, no sqrt). Culled = object3d hidden while the enemy is
   * not aggroed (fog hides it anyway); animation runs every 4th frame beyond 35 m and is frozen beyond 60 m while the enemy is
   * idle and alive (a frozen one-shot would otherwise stall a flinch or cast). Bosses never freeze or cull.
   */
  private updateLod(): void {
    const lp = this.world?.localPlayer ?? null;
    let d2 = 0;
    if (lp) {
      const dx = this.position.x - lp.position.x, dz = this.position.z - lp.position.z;
      d2 = dx * dx + dz * dz;
    }
    const o3 = this.object3d;
    if (!this.isBoss) {
      if (this.aggroed) {
        if (this.culled) {
          this.culled = false;
          o3.visible = true;
        }
      } else if (!this.culled) {
        if (d2 > CULL_OUT2) {
          this.culled = true;
          o3.visible = false;
        }
      } else if (d2 < CULL_IN2) {
        this.culled = false;
        o3.visible = true;
      }
    }
    let lod = d2 > ANIM_MID2 ? 4 : 1;
    if (!this.isBoss && !this.aggroed && !this.isDead && (this.culled || d2 > ANIM_FAR2)) lod = 0;
    if (lod !== this.animLod) {
      this.animLod = lod;
      this.animPhase = 0;
    }
  }

  update(dt: number): void {
    this.updateLod();
    if (!this.authority) this.updateRemote(dt);
    super.update(dt);
    const t = (this.animT += dt);

    // procedural bodies
    this.proc?.update(dt, t, this.hpFrac);

    // hover / bob
    const vis = this.def.visual;
    if (this.holder) {
      const bob = vis?.hoverBob ? Math.sin(t * 2.4 + this.id) * vis.hoverBob : 0;
      this.position.y = this.hover + bob;
      if (vis?.spin && this.proc) this.holder.rotation.y += vis.spin * dt;
    }

    // alpha smoothing
    if (Math.abs(this.alphaNow - this.alphaTarget) > 0.004) {
      this.alphaNow += (this.alphaTarget - this.alphaNow) * Math.min(1, dt * 8);
      this.applyAlpha();
    }
    // nodes that disappear below an HP threshold (Zakhar hides the trident)
    const hb = vis?.hideBelowHp;
    if (hb && this.holder) {
      if (this.hideNode === undefined) this.hideNode = this.holder.getObjectByName(hb.node) ?? null;
      if (this.hideNode) this.hideNode.visible = !(this.hpFrac < hb.frac && !this.isDead);
    }
    // spawn pop-in
    if (this.spawnPop > 0 && this.holder) {
      this.spawnPop = Math.max(0, this.spawnPop - dt);
      const k = 1 - this.spawnPop / 0.35;
      const s = this.def.scale * this.visualScale * (0.25 + 0.75 * (k * (2 - k)));
      this.holder.scale.setScalar(s);
      if (this.spawnPop === 0) this.holder.scale.setScalar(this.def.scale * this.visualScale);
    }

    if (this.isDead) this.updateCorpse(dt);
    else if (this.authority && this.ai) this.ai.update(dt);
  }

  /** Leave the world without dying (treasure goblin portal, reset adds): replicated through the 'spawn' channel (remove). */
  escape(): void {
    if (this.authority) {
      try {
        G.net?.broadcast('spawn', { id: this.id, defId: this.def.id, x: this.position.x, z: this.position.z, level: this.level, packId: this.packId, remove: true });
      } catch { /* ignore */ }
    }
    this.destroy();
  }

  /** Pop-in animation for adds that have no spawn clip. */
  playSpawnPop(): void {
    this.spawnPop = 0.35;
  }

  private updateCorpse(_dt: number): void {
    const world = this.world;
    if (!world) return;
    if (!this.deathHandled) {
      this.deathHandled = true;
      this.deadAt = world.time;
      this.pendingShots.length = 0;
      this.cast = null;
      this.statuses.clear();
      try {
        this.ai?.dispose?.();
      } catch { /* ignore */ }
      const a = this.anim;
      if (a && !a.locked) {
        a.playOnce(this.def.anims.death, { hold: true, fade: 0.05 });
      }
      if (this.dormant) this.dormant = false;
    }
    const t = world.time - this.deadAt;
    // skeletons stay as a bone pile for their pile time (a Kemik Büyücüsü can raise them), everything else sinks after ~3.4 s
    let sinkAt = this.def.ai?.bonePile ? Math.max(5.4, this.def.ai.bonePile) : this.isBoss ? 8 : 3.4;
    // a living Diriltici champion in the pack keeps the corpses lying around (up to 40 s) so it has something to raise
    if (!this.isBoss && this.packId && t < 40 && t >= sinkAt - 0.8 && world.time >= this.holdCheckAt) {
      this.holdCheckAt = world.time + 0.4;
      let hold = false;
      for (const o of world.enemies) {
        if (o.championMod === 'diriltici' && !o.isDead && !o.removed && o.packId === this.packId) {
          hold = true;
          break;
        }
      }
      this.corpseHoldUntil = hold ? world.time + 0.7 : 0;
    }
    if (this.corpseHoldUntil > world.time) sinkAt = Math.max(sinkAt, t + 1);
    if (this.shadow) {
      const k = clamp(1 - (t - 1.0) / 1.5, 0, 1);
      this.shadow.scale.setScalar(Math.max(0.001, k));
    }
    if (t > sinkAt && this.holder) {
      const k = clamp((t - sinkAt) / 1.3, 0, 1);
      this.holder.position.y = -k * Math.max(1.2, this.height * 0.6);
      this.setAlpha(1 - k * 0.9);
      // the corpse is gone: free the entity (every peer runs this for its own copy; bosses stay for the scene logic that reads them)
      if (k >= 1 && !this.isBoss && !this.removed) this.destroy();
    }
  }

  onRemoved(): void {
    SHIELDERS.delete(this);
    if (this.blockerAt && this.world) {
      this.world.nav.setCircle(this.blockerAt.x, this.blockerAt.z, this.blockerAt.r, true);
      this.blockerAt = null;
    }
    try {
      this.ai?.dispose?.();
    } catch { /* ignore */ }
    this.ai = null;
    this.proc?.dispose();
    this.proc = null;
    // every material on the model is this entity's own clone
    for (const e of this.mats) {
      try {
        e.m.dispose();
      } catch { /* ignore */ }
    }
    this.mats = [];
    if (this.shadow) {
      this.shadow.removeFromParent();
      this.shadow = null;
    }
    this.holder = null;
    super.onRemoved();
  }

  /** World position of the hand / chest for projectile origins. */
  muzzle(out = _v, heightFrac = 0.62): THREE.Vector3 {
    const f = Math.max(0.4, this.radius + 0.25);
    return out.set(this.position.x + Math.sin(this.yaw) * f, this.position.y + Math.max(0.5, (this.height - this.hover) * heightFrac), this.position.z + Math.cos(this.yaw) * f);
  }
}
