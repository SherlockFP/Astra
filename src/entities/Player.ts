import * as THREE from 'three';
import { Actor } from './Actor';
import { Interpolator } from './Interpolator';
import { G } from '../game/G';
import { loadCharacterModel, classResource, type CharacterModel, type GearMap } from './CharacterModel';
import type { ClassId, EntityId } from '../types/common';
import type { CharacterState } from '../systems/CharacterState';
import type { EquipSlot, ItemInstance } from '../types/items';
import type { StatusId } from '../types/skills';
import type { SpecId } from '../types/v2';
import { foldSpecStats } from '../combat/specs';
import { specStatBlock } from '../data/specs';

/** State every player broadcasts about its own avatar ~15 Hz (net glue converts to/from wire format). */
export interface PlayerSyncState {
  x: number; y: number; z: number; yaw: number;
  vx: number; vz: number;
  anim: string;                 // current base clip name
  hp: number; maxHp: number;
  res: number; maxRes: number;
  dead: boolean;
  casting?: string | null;      // skill id being cast
  level: number;
  dodging?: boolean;
  statuses?: string[];          // active status ids (remote vfx + party frame icons)
  /** GDD_V2 §2.1: remaining seconds of the m45 / m90 / m180 major cooldowns (party cooldown tracker). */
  mcd?: [number, number, number];
  shot?: string | null;         // current one-shot clip (attack/cast) for remote replay
  shotSeq?: number;             // increments each time a new one-shot starts
}

const VISIBLE_SLOTS: EquipSlot[] = ['weapon', 'offhand', 'helm'];
/** Statuses that are local bookkeeping only (never replicated). */
const LOCAL_ONLY_STATUSES = new Set<string>(['potion_cd']);
/** Remote status entries are refreshed on every snapshot and expire shortly after the snapshots stop. */
const REMOTE_STATUS_TTL = 0.7;
const DEFAULT_MOVE_SPEED = 7;
/** Remote players keep gliding along their last velocity for at most this long when packets stall (dead reckoning), then hold. */
const EXTRAPOLATE_MAX = 0.25;

/**
 * A player avatar. The LOCAL player is driven by game/PlayerController; remote players are driven by
 * PlayerSyncState snapshots through `interp`.
 * OWNER: player module (model loading via entities/CharacterModel.ts, weapon attachment, animation state).
 */
export class Player extends Actor {
  readonly isLocal: boolean;
  peerId: string;
  slot: number;
  classId: ClassId;
  /** Local player only: persistent character (inventory, talents...). */
  character: CharacterState | null;
  /** Remote players only. */
  readonly interp: Interpolator | null;
  /** Visible equipment for remote players (weapon/offhand ids + upgrade) — local uses character.save.equipment. */
  visibleGear: Partial<Record<EquipSlot, ItemInstance>> = {};
  /** GDD_V2 WP5: spec of this player (local: from the save; remote: none until the spec channel lands). */
  spec: SpecId | null = null;
  /** GDD_V2 §0.3: Adalet (Kılıç Ustası) and Karışım (Simyacı) pip counters, separate from the combo points. */
  pips: { adalet?: number; karisim?: number } = {};
  dodging = false;
  jumping = false;
  /** Simple vertical offset for jumps (y position = ground + jumpY). */
  jumpY = 0;

  // ---- additions (player module) ----
  /** The built character model (weapon tip / bones / variants). `Actor.model` is its root. */
  charModel: CharacterModel | null = null;
  /** Dodge roll charges: integer part = ready charges, fraction = recharge progress. Max/recharge are talent-tunable. */
  dodgeCharges = 2;
  dodgeMaxCharges = 2;
  dodgeRecharge = 1.4;
  /** world.time when the current/last dodge started (Combat uses it for the perfect-dodge window). */
  dodgeStartedAt = -99;
  /** Colour variant override (remote players / previews); local players use character.save.appearance. */
  variant = 0;
  /** Remote players: tint / hide-helm replicated by net (setRemoteLook). */
  private remoteTint: number | undefined;
  private remoteHideHelm = false;
  /** Footstep sound id: town = dirt, other scenes = stone by default; scenes may set any of these for the floor they build
   *  (wood floors / bridges, forest grass, ice-and-snow, carpet) after PlayerController's 'scene:changed' reset. */
  footstepSfx: 'footstep_stone' | 'footstep_dirt' | 'footstep_wood' | 'footstep_grass' | 'footstep_snow' | 'footstep_carpet' = 'footstep_stone';
  /** Multiplier applied to the player's steering speed by the active action (SkillSystem sets it via setActionMove). */
  private actionMul = 1;
  private actionMulUntil = 0;

  private gearKnown: boolean;
  private gearDirty = false;
  private statsInit = false;
  private hooked = false;
  private wasDead = false;
  private unsubs: (() => void)[] = [];
  private modelLoading: Promise<void> | null = null;

  // remote replication state
  private readonly remoteOut = { x: 0, y: 0, z: 0, yaw: 0 };
  private remoteHasPos = false;
  private remoteAnim = 'Idle';
  private remoteSpeed = 0;
  private remoteShotSeq = -1;
  private remoteDodging = false;
  /** last replicated velocity (dead reckoning while snapshots are late) */
  private remoteVx = 0;
  private remoteVz = 0;
  /** true while the shown position is extrapolated; the visual lead is eased out when a fresh snapshot catches up */
  private extraActive = false;
  private extraOffX = 0;
  private extraOffZ = 0;
  private remoteStatusSeen = new Set<string>();
  private pendingShots: { at: number; clip: string }[] = [];
  /** one-shots started on this model by somebody else (SkillSystem.playRemoteCast, hit reactions): the snapshot replay skips them */
  private seenShotSeq = -1;
  private foreignShot: { name: string; at: number } | null = null;
  private ghosts: { obj: THREE.Object3D; mat: THREE.MeshBasicMaterial; t: number; life: number; op: number }[] = [];
  private squashVal = 0;
  private squashVel = 0;

  constructor(opts: { id: EntityId; slot: number; classId: ClassId; name: string; level: number; isLocal: boolean; peerId?: string; character?: CharacterState | null }) {
    super(opts.id, 'player', 'player');
    this.isLocal = opts.isLocal;
    this.peerId = opts.peerId ?? '';
    this.slot = opts.slot;
    this.classId = opts.classId;
    this.name = opts.name;
    this.level = opts.level;
    this.character = opts.character ?? null;
    this.interp = opts.isLocal ? null : new Interpolator();
    this.authority = opts.isLocal;
    this.radius = 0.55;
    this.height = 2.3;
    this.baseMoveSpeed = DEFAULT_MOVE_SPEED;
    this.gearKnown = opts.isLocal;
    this.resourceType = classResource(opts.classId);
    this.variant = this.character?.save.appearance.variant ?? 0;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Model
  // -------------------------------------------------------------------------------------------------------------------

  /** Load the class model (KayKit), set up AnimController, attach weapons from equipment. */
  loadModel(): Promise<void> {
    if (this.modelLoading) return this.modelLoading;
    this.modelLoading = this.doLoadModel();
    return this.modelLoading;
  }

  private async doLoadModel(): Promise<void> {
    const save = this.character?.save;
    const variant = save?.appearance.variant ?? this.variant;
    const tint = save ? save.appearance.tint : this.remoteTint;
    const hideHelm = save ? !!save.flags?.hideHelm : this.remoteHideHelm;
    const gear = this.gearKnown ? this.currentGear() : undefined;
    this.gearDirty = false;

    // local player: stats/equipment hooks must work even if the model fails to load (HP pools, potions, HUD)
    if (this.isLocal && !this.hooked) {
      this.hooked = true;
      this.unsubs.push(G.events.on('equipment:changed', () => this.refreshEquipmentVisuals()));
      this.unsubs.push(G.events.on('item:upgraded', () => this.refreshEquipmentVisuals())); // +N glow
      this.unsubs.push(G.events.on('player:stats', () => this.refreshStats()));
      // GDD_V2 §1.1: a spec change swaps the passive stat block (Talents.setSpec emits spec:changed)
      this.unsubs.push(G.events.on('spec:changed', () => this.refreshStats()));
      this.refreshStats();
    }

    let cm: CharacterModel;
    try {
      cm = await loadCharacterModel(this.classId, { variant, tint, gear, hideHelm, hooded: save?.flags?.hooded !== false });
    } catch (e) {
      console.error('[player] model load failed', e);
      return;
    }
    if (this.removed) {
      cm.dispose();
      return;
    }
    this.charModel = cm;
    this.setModel(cm.root, cm.anim);
    cm.anim?.setBase('Idle', { fade: 0 });
    this.wasDead = false;
    if (this.gearDirty) this.refreshEquipmentVisuals();
  }

  /** Visible items (weapon / offhand / helm) of this player. */
  currentGear(): GearMap {
    const src: Partial<Record<EquipSlot, ItemInstance>> = this.isLocal ? this.character?.save.equipment ?? {} : this.visibleGear;
    const out: GearMap = {};
    for (const s of VISIBLE_SLOTS) if (src[s]) out[s] = src[s];
    return out;
  }

  /** Re-attach weapon/offhand visuals + upgrade glow after equipment changes. */
  refreshEquipmentVisuals(): void {
    this.gearKnown = true;
    const cm = this.charModel;
    if (!cm) {
      this.gearDirty = true;
      return;
    }
    cm.setHideHelm(this.isLocal ? !!this.character?.save.flags?.hideHelm : this.remoteHideHelm);
    void cm.setGear(this.currentGear()).catch((e) => console.warn('[player] setGear failed', e));
  }

  /** Remote players: apply the sender's colour variant / tint / hide-helm (net 'gear' look). Safe before the model loads. */
  setRemoteLook(look: { variant: number; tint?: number; hideHelm?: boolean }): void {
    if (this.isLocal) return;
    this.variant = look.variant;
    this.remoteTint = look.tint;
    this.remoteHideHelm = !!look.hideHelm;
    const cm = this.charModel;
    if (!cm) return;
    cm.setVariant(this.variant, this.remoteTint ?? 0xffffff);
    cm.setHideHelm(this.remoteHideHelm);
  }

  /** Re-apply the saved colour variant (character panel / menu changed it). */
  refreshAppearance(): void {
    const a = this.character?.save.appearance;
    this.charModel?.setVariant(a?.variant ?? this.variant, a?.tint);
  }

  /** Temporary tool nodes (rogue crossbow, open spellbook...). null restores the gear loadout. */
  setToolNodes(names: string[] | null): void {
    this.charModel?.setNodeOverride(names);
  }

  getBone(name: string): THREE.Object3D | null {
    return this.charModel?.getBone(name) ?? null;
  }
  getWeaponRoot(slot: 'weapon' | 'offhand' = 'weapon'): THREE.Object3D | null {
    return this.charModel?.getWeaponRoot(slot) ?? null;
  }
  /** Object at the weapon tip (trail/spark anchor); falls back to the hand bone, then the player root. */
  getWeaponTip(slot: 'weapon' | 'offhand' = 'weapon'): THREE.Object3D {
    return this.charModel?.getWeaponTip(slot) ?? this.object3d;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------------------------------------------------

  /**
   * Local player: copy G.character final stats into `stats`, fold status modifiers (getStat), set maxHp/maxResource/
   * resourceType from class + stats, clamp hp/resource. Call on 'player:stats' and from onStatusesChanged().
   */
  refreshStats(): void {
    const ch = this.character ?? G.character;
    if (!this.isLocal || !ch) return;
    this.spec = (ch.save.spec as SpecId | undefined) ?? null;
    this.stats = foldSpecStats({ ...ch.stats }, this.spec);
    this.level = ch.level;
    this.resourceType = classResource(this.classId);
    const mods = this.statuses.getStatMods();
    const baseHp = (this.stats.maxHp ?? 0) > 0 ? (this.stats.maxHp as number) : 100 + this.level * 20;
    const baseRes = (this.stats.maxResource ?? 0) > 0 ? (this.stats.maxResource as number) : 100;
    // the spec's maxHpPct (Koruyucu +30%, Savaş Lordu +30%) is not part of the item stats: added here
    const specHpPct = specStatBlock(this.spec).maxHpPct ?? 0;
    this.maxHp = Math.max(1, Math.round((baseHp + (mods.maxHp ?? 0)) * (1 + (mods.maxHpPct ?? 0) + specHpPct)));
    this.maxResource = Math.max(1, Math.round(baseRes + (mods.maxResource ?? 0)));
    this.baseMoveSpeed = DEFAULT_MOVE_SPEED;
    if (!this.statsInit) {
      this.statsInit = true;
      this.hp = this.maxHp;
      this.resource = this.resourceType === 'rage' ? 0 : this.maxResource;
    }
    this.hp = Math.min(this.hp, this.maxHp);
    this.resource = Math.min(this.resource, this.maxResource);
    G.events.emit('player:resources', { hp: this.hp, maxHp: this.maxHp, res: this.resource, maxRes: this.maxResource });
  }

  onStatusesChanged(): void {
    if (this.isLocal) this.refreshStats();
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Action movement modifier (SkillSystem): "moves at x0.35 speed while the swing winds up"
  // -------------------------------------------------------------------------------------------------------------------

  /** Scale steering speed to `mul` (0 = rooted) for `duration` seconds. Later calls replace earlier ones. */
  setActionMove(mul: number, duration: number): void {
    this.actionMul = Math.max(0, mul);
    this.actionMulUntil = (G.engine?.time ?? 0) + duration;
  }
  getActionMoveMul(): number {
    return (G.engine?.time ?? 0) < this.actionMulUntil ? this.actionMul : 1;
  }
  clearActionMove(): void {
    this.actionMulUntil = 0;
  }

  /** Face a world position/direction instantly (swing start). */
  faceTowards(x: number, z: number): void {
    const dx = x - this.position.x, dz = z - this.position.z;
    if (dx * dx + dz * dz > 1e-6) this.yaw = Math.atan2(dx, dz);
  }

  /** Translucent afterimage of the current pose (dodge roll / blink). */
  spawnAfterImage(color = 0x9fd8ff, opacity = 0.36, life = 0.3): void {
    const scene = this.world?.scene;
    const g = this.charModel?.createGhost(color, opacity);
    if (!g || !scene) return;
    scene.add(g.object);
    this.ghosts.push({ obj: g.object, mat: g.material, t: 0, life, op: opacity });
  }

  /** Squash & stretch of the model (positive = squash on landing, negative = stretch on take-off). */
  squash(amount: number): void {
    this.squashVel += amount * 28;
  }

  /** Hit reaction (upper body, never blocks locomotion). `heavy` plays the bigger clip. */
  playHitReaction(heavy = false): void {
    const a = this.anim;
    if (!a || this.isDead || a.locked) return;
    if (this.dodging) return;
    const clip = heavy ? 'Hit_B' : 'Hit_A';
    a.playOnce(clip, { upperBody: this.velocity.lengthSq() > 0.5, fade: 0.04, speed: 1.35 });
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Network
  // -------------------------------------------------------------------------------------------------------------------

  /** Snapshot of the local avatar for the network. */
  /** Remaining major cooldowns of the local character (m45, m90, m180), rounded; undefined for remote copies. */
  private majorCdTuple(): [number, number, number] | undefined {
    if (!this.isLocal) return undefined;
    const m = (this.character ?? G.character)?.save.majorCd;
    if (!m) return undefined;
    return [Math.max(0, Math.round(m.m45)), Math.max(0, Math.round(m.m90)), Math.max(0, Math.round(m.m180))];
  }

  getSyncState(): PlayerSyncState {
    const p = this.position;
    const statuses: string[] = [];
    for (const s of this.statuses.list()) if (!LOCAL_ONLY_STATUSES.has(s.id)) statuses.push(s.id);
    // yaw accumulates unbounded while turning: send it wrapped to (-PI, PI] (receivers interpolate through atan2)
    const yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    return {
      x: p.x, y: p.y, z: p.z, yaw, vx: this.velocity.x, vz: this.velocity.z,
      anim: this.anim?.baseName ?? 'Idle', hp: this.hp, maxHp: this.maxHp, res: this.resource, maxRes: this.maxResource,
      dead: this.isDead, casting: this.cast?.skillId ?? null, level: this.level,
      dodging: this.dodging, statuses, shot: this.anim?.oneShotName ?? null, shotSeq: this.anim?.shotSeq ?? 0,
      mcd: this.majorCdTuple(),
    };
  }

  /** Remote players: queue a received state (now = local receive time in seconds). */
  applySyncState(s: PlayerSyncState, now: number): void {
    if (this.isLocal) return;
    this.interp?.push({ t: now, x: s.x, y: s.y, z: s.z, yaw: s.yaw });
    this.hp = s.hp;
    this.maxHp = s.maxHp;
    this.resource = s.res;
    this.maxResource = s.maxRes;
    this.level = s.level;
    this.remoteAnim = s.anim || 'Idle';
    this.remoteVx = Number.isFinite(s.vx) ? s.vx : 0;
    this.remoteVz = Number.isFinite(s.vz) ? s.vz : 0;
    // pdeath (Combat) owns alive/revive; a snapshot only marks a player dead that we have not heard about yet (late joiners)
    if (s.dead && this.alive) {
      this.alive = false;
      this.hp = 0;
    }

    // statuses: mirror the owner's list (short TTL refreshed by every snapshot)
    if (s.statuses) {
      const seen = new Set<string>(s.statuses);
      for (const id of seen) {
        const cur = this.statuses.get(id as StatusId);
        if (cur) cur.remaining = Math.max(cur.remaining, REMOTE_STATUS_TTL);
        else this.statuses.apply(id as StatusId, REMOTE_STATUS_TTL);
      }
      for (const id of this.remoteStatusSeen) if (!seen.has(id)) this.statuses.remove(id as StatusId);
      this.remoteStatusSeen = seen;
    }

    // casting indicator
    if (s.casting) {
      if (!this.cast || this.cast.skillId !== s.casting) {
        const def = G.skills?.getDef(s.casting);
        this.cast = { skillId: s.casting, name: def?.name ?? s.casting, start: this.world?.time ?? 0, duration: 0, channel: false, interruptible: true };
      }
    } else this.cast = null;

    // dodge roll start: dust + sound at the sender's position
    if (s.dodging && !this.remoteDodging) {
      G.vfx.spawn('dodge_dust', [s.x, s.y, s.z]);
      G.audio.play('dodge', { pos: [s.x, s.y, s.z] });
    }
    this.remoteDodging = !!s.dodging;
    this.dodging = !!s.dodging;

    // one-shot replay (attack / cast / dodge clip), delayed by the interpolation delay so it lines up with the motion
    if (s.shotSeq !== undefined) {
      if (this.remoteShotSeq === -1) this.remoteShotSeq = s.shotSeq;
      else if (s.shotSeq !== this.remoteShotSeq) {
        this.remoteShotSeq = s.shotSeq;
        if (s.shot) this.pendingShots.push({ at: now + (this.interp?.delay ?? 0.1), clip: s.shot });
      }
    }
  }

  private updateRemote(dt: number): void {
    const interp = this.interp;
    const a = this.anim;
    if (interp && interp.sample(G.engine.time, this.remoteOut)) {
      const o = this.remoteOut;
      // dead reckoning: the render time (now - delay) ran past the newest snapshot (packet stall / burst loss): keep gliding
      // along the last velocity for a moment (decelerating) instead of freezing, then hold. Not for the dead or the idle.
      let extrap = false;
      const last = interp.latest;
      const t = G.engine.time - interp.delay;
      if (last && !this.isDead && t > last.t + 0.004) {
        const sp2 = this.remoteVx * this.remoteVx + this.remoteVz * this.remoteVz;
        if (sp2 > 0.09) {
          const ahead = Math.min(t - last.t, EXTRAPOLATE_MAX);
          const f = ahead - (ahead * ahead) / (2 * EXTRAPOLATE_MAX); // integral of a velocity that fades to 0 at EXTRAPOLATE_MAX
          o.x = last.x + this.remoteVx * f;
          o.z = last.z + this.remoteVz * f;
          o.y = last.y;
          o.yaw = last.yaw;
          extrap = true;
        }
      }
      if (extrap) this.extraActive = true;
      else if (this.extraActive) {
        // a snapshot caught up: ease out the lead we had built up instead of snapping back
        this.extraActive = false;
        if (this.remoteHasPos) {
          let ox = this.position.x - o.x, oz = this.position.z - o.z;
          const l = Math.hypot(ox, oz);
          if (l > 2.5) { ox *= 2.5 / l; oz *= 2.5 / l; }
          this.extraOffX = ox;
          this.extraOffZ = oz;
        }
      }
      if (this.extraOffX !== 0 || this.extraOffZ !== 0) {
        o.x += this.extraOffX;
        o.z += this.extraOffZ;
        const k = Math.exp(-9 * Math.max(dt, 0));
        this.extraOffX *= k;
        this.extraOffZ *= k;
        if (Math.abs(this.extraOffX) < 0.01 && Math.abs(this.extraOffZ) < 0.01) this.extraOffX = this.extraOffZ = 0;
      }
      if (this.remoteHasPos && dt > 1e-4) {
        const vx = (o.x - this.position.x) / dt, vz = (o.z - this.position.z) / dt;
        // low-pass + clamp (teleports must not read as 500 u/s)
        const k = 1 - Math.exp(-14 * dt);
        const lim = 40;
        this.velocity.x += (Math.max(-lim, Math.min(lim, vx)) - this.velocity.x) * k;
        this.velocity.z += (Math.max(-lim, Math.min(lim, vz)) - this.velocity.z) * k;
      }
      this.position.set(o.x, o.y, o.z);
      if (extrap) this.world?.nav.resolveCircle(this.position, this.radius); // a guess must not walk through walls
      this.yaw = o.yaw;
      this.remoteHasPos = true;
      this.jumpY = Math.max(0, o.y - (this.world?.groundY(o.x, o.z) ?? 0));
    }
    this.remoteSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    if (!a) return;
    const now = G.engine.time;
    // a one-shot somebody else started on this model (cast replay / hit reaction) must not be replayed a second time from the
    // snapshot, even when it has already finished by the time the (interpolation-delayed) snapshot replay comes due
    if (a.shotSeq !== this.seenShotSeq) {
      this.seenShotSeq = a.shotSeq;
      this.foreignShot = { name: a.oneShotName ?? '', at: now };
    }
    // fire queued one-shots, oldest first
    while (this.pendingShots.length && now >= this.pendingShots[0].at) {
      const sh = this.pendingShots.shift()!;
      if (!a.has(sh.clip) || this.isDead) continue;
      const fs = this.foreignShot;
      if (fs && fs.name === sh.clip && now - fs.at < 0.9) continue; // already played by playRemoteCast / a hit reaction
      if (a.oneShotName === sh.clip && a.isPlayingOneShot) continue;
      const full = sh.clip.startsWith('Dodge') || sh.clip.startsWith('Jump') || sh.clip.startsWith('Death');
      a.playOnce(sh.clip, { upperBody: !full && this.remoteSpeed > 0.8, fade: 0.06 });
      this.seenShotSeq = a.shotSeq; // our own replay is not a foreign shot
    }
    if (this.pendingShots.length > 6) this.pendingShots.splice(0, this.pendingShots.length - 6);

    // base locomotion layer
    if (!this.isDead) {
      let name = this.remoteAnim;
      if (!a.has(name)) name = 'Idle';
      let speed = 1;
      if (name === 'Running_A' || name === 'Running_B' || name.startsWith('Running_Strafe')) speed = clamp(this.remoteSpeed / DEFAULT_MOVE_SPEED, 0.6, 1.7);
      else if (name.startsWith('Walking')) speed = clamp(this.remoteSpeed / 3.2, 0.6, 1.5);
      a.setBase(name, { fade: 0.12, speed });
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.isLocal) this.updateRemote(dt);
    super.update(dt);

    if (this.isLocal && this.dodgeCharges < this.dodgeMaxCharges) {
      this.dodgeCharges = Math.min(this.dodgeMaxCharges, this.dodgeCharges + dt / Math.max(0.1, this.dodgeRecharge));
    }

    // Combat plays the death/revive animation + vfx for local and remote players; this is only the safety net for
    // players that died/revived without it (late joiners, dev pages).
    const dead = this.isDead;
    if (dead !== this.wasDead) {
      this.wasDead = dead;
      const a = this.anim;
      if (dead) {
        this.dodging = false;
        this.jumping = false;
        this.pendingShots.length = 0;
        if (a && !a.locked) a.playOnce(a.pick('Death_B', 'Death_A') ?? 'Death_A', { hold: true, fade: 0.06 });
      } else if (a && a.locked) {
        a.reset();
        a.setBase('Idle', { fade: 0 });
      }
    }

    this.updateJuice(dt);

    // blob shadow stays on the ground while jumping and shrinks with height
    const sh = this.charModel?.shadow;
    if (sh) {
      sh.position.y = 0.03 - this.jumpY;
      const s = Math.max(0.55, 1 - this.jumpY * 0.18);
      sh.scale.setScalar(s);
    }
  }

  private updateJuice(dt: number): void {
    // afterimages fade out
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt;
      if (g.t >= g.life) {
        g.obj.removeFromParent();
        g.mat.dispose();
        this.ghosts.splice(i, 1);
      } else g.mat.opacity = g.op * Math.pow(1 - g.t / g.life, 1.3);
    }
    // squash & stretch spring
    const root = this.charModel?.root;
    if (!root) return;
    if (this.squashVal !== 0 || this.squashVel !== 0) {
      const step = Math.min(dt, 0.033);
      this.squashVel += (-230 * this.squashVal - 15 * this.squashVel) * step;
      this.squashVal = Math.max(-0.3, Math.min(0.3, this.squashVal + this.squashVel * step));
      if (Math.abs(this.squashVal) < 0.002 && Math.abs(this.squashVel) < 0.02) this.squashVal = this.squashVel = 0;
      root.scale.set(1 + this.squashVal * 0.5, 1 - this.squashVal, 1 + this.squashVal * 0.5);
    }
  }

  onRemoved(): void {
    for (const g of this.ghosts) {
      g.obj.removeFromParent();
      g.mat.dispose();
    }
    this.ghosts.length = 0;
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.charModel?.dispose();
    this.charModel = null;
    this.anim = null; // already disposed together with the model
    this.model = null;
    super.onRemoved();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
