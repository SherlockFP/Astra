import * as THREE from 'three';
import { G } from '../game/G';
import { clamp, yawFromDir, cosmeticRng } from '../core/utils';
import { SKILLS, comboSteps } from '../data/skills';
import { CLASSES, defaultSkillBar } from '../data/classes';
import { AUTO, type AutoMode } from '../game/AutoAttack';
import { specOf, specPatched, specSkillIds, isHeroDef, isMajorDef } from './specs';
import { applySkillMods, modsFor, withShape } from './skillMods';
import { applyDynamicBuff } from './StatusEffects';
import { xpFor } from '../systems/SkillMastery';
import { TALENT_PIPS } from '../data/specs_talents';
import { MAJOR_BASE, MAJOR_SLOTS, readMajorCd, writeMajorCd, resetMajorCooldowns } from './majors';
import { COMBAT_FEEL, FEEL, WOW, TYPE_COLORS, feelBeat, vfxScale, isAreaVfx, freezeActors, weaponTempoOf, weightFromParam, leadSkipSec, type HitWeight } from './feel';
import { gcdFor, isOffGcd } from './gcd';
import { beforeCast as beforeFormCast, formBasic } from './Forms';
import { resolveProcMods, consumeProcMods, cdMultFor, cleaveRidersOf, type CleaveRider, type ResolvedProcMods } from './procMods';
import { PUSHBACK_CFG, pushesBack, channelCut, lockoutSchool, LOCKOUT_SCHOOLS, type HitForPushback, type LockoutSchool } from './castRules';
import { ProcWatcher } from './procFx';
import { WatcherHost, WATCHER_RADIUS, type WatcherCtx } from '../data/watchers';
import { SpellQueue, type TakeState } from './spellQueue';
import { GUARD_COUNTER_BY_CLASS, GUARD_COUNTER_CD, GUARD_COUNTER_COST, HEAVY_BY_CLASS, KRT_BY_CLASS, RIPOSTE_BY_CLASS, weaponArtVfx, type ChargeProfile, type SwingProfile } from './heavy';
import { ART_BY_CATEGORY, getWeaponArt } from '../data/weaponArts';
import { getItemBase } from '../data/items';
import { finisherPctMaxHp } from './poise';
import { RouteTracker } from './routes';
import { MOVE_BY_KIND, moveBehavior, RUN_ATTACK_SEC, RUN_SPEED_FRAC, ROLL_ATTACK_AT, JUMP_ATTACK_AIR, JUMP_COOLDOWN, type MoveKind, type MoveProfile } from './moves';
import type { ComboRouteDef, WeaponArtDef } from '../types/v2';
import { softStat, type DamageResult, type HitSpec } from './Combat';
import { Projectile } from '../entities/Projectile';
import { behaviorFor, groundAt, aimSlope, isKitBehavior, selfStatusesByDispatch, type Behavior, type CastCtx } from './skills/behaviors';
import { isBehind } from './positional';
import { pvp } from '../systems/Pvp';
import { setGlowExtras, type GlowExtras } from '../data/procs';
import { sp, hasSp, combineChance, shockwave, fireWave, specHooksOf, allSpecHooks, weaponAvg, onSpend as spendSpecials } from './specials';
import { shieldStoreAdd, shieldStoreRelease } from './skills/plateKit';
import { skillRankCooldownMult } from './skillRanks';
import type { MageCastMods, MageCtx, TouchBurst } from './specs/mage';
import type { AimInfo, SkillDef, SkillSlotKey, StatusApply, StatusId } from '../types/skills';
import type { DamageType, EntityId, PipId } from '../types/common';
import type { PipDef } from '../types/classes';
import type { Actor } from '../entities/Actor';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { SfxId } from '../types/audio';
import type { VfxId, SpawnVfxOpts } from '../types/vfx';
import type { TelegraphHandle, VfxHandle } from '../vfx/VFX';

/** NC35: pip counters without a class row or TALENT_PIPS entry (GDD_V2 §0.3 Adalet / Karışım, GDD_CLASSES_V2 §1.2 Kombo). */
const V2_PIPS: Partial<Record<PipId, PipDef>> = {
  combo: { id: 'combo', name: 'Kombo Puanı', max: 5, color: '#ffd24a', icon: 'buff-haste' },
  adalet: { id: 'adalet', name: 'Adalet Puanı', max: 5, color: '#fff0a0', icon: 'skill-holy-light' },
  karisim: { id: 'karisim', name: 'Karışım Puanı', max: 5, color: '#7fdc8a', icon: 'buff-haste' },
};
const NO_PIPS: readonly PipDef[] = [];

export interface CooldownInfo {
  remaining: number;
  total: number;
  charges: number;
  maxCharges: number;
}

/** Options of SkillSystem.strike (one hit of a skill on one enemy). */
export interface StrikeOpts {
  coef?: number;
  flat?: number;
  /** Threat multiplier of this hit (defaults to the skill's `threatMult` param). */
  threatMult?: number;
  type?: HitSpec['type'];
  tick?: boolean;
  dir?: [number, number];
  weight?: HitWeight;
  knockback?: number;
  knockup?: number;
  statuses?: StatusApply[];
  stagger?: number;
  more?: number;
  noGain?: boolean;
  canCrit?: boolean;
  hitstop?: number;
  shake?: number;
  forceCrit?: boolean;
  pos?: [number, number, number];
  tickIndex?: number;
  /** PM-00b: no hit-stop on this hit (multi_strike, rider cleaves). */
  noHitstop?: boolean;
  /** PM-00b: this hit starts no cleave rider (the rider's own strikes). */
  noRider?: boolean;
}

/** PM-00b (plate-melee §g need 4): radius (m) around the primary target where a cleave rider finds its extra targets. */
const RIDER_RADIUS = 4;

/** A timed ground effect (consecration, meteor fire, blizzard, banner...). */
export interface Zone {
  x: number;
  z: number;
  radius: number;
  duration: number;
  tick: number;
  t: number;
  next: number;
  onTick?: (z: Zone, n: number) => void;
  onUpdate?: (z: Zone, dt: number) => void;
  onEnd?: (z: Zone) => void;
  n?: number;
}

interface Cd {
  charges: number;
  max: number;
  total: number;
  rechargeAt: number;
}

interface ChannelState {
  active: boolean;
  until: number;       // seconds after start when the channel ends
  every: number;
  next: number;
  n: number;
  slot: SkillSlotKey | null;
  fixed: boolean;
  min: number;
}

/** One replacing skill of a `replaces` row (SkillDef.replaces), indexed by the skill it replaces. */
interface ReplacerRow {
  id: string;
  classId: SkillDef['classId'];
  unlockLevel: number;
  whileStatus: StatusId;
}

/** DoT / bleed statuses the kit glow rules check for a refresh window (target copy below 30 % of its duration). */
const REFRESH_DOTS: StatusId[] = ['garrote', 'rupture', 'agony', 'corruption', 'immolate', 'unstable_affliction', 'burn', 'bleed', 'poison'];

/** The action a caster is currently executing. All times are seconds after `start` (real/sim seconds, speed applied). */
export interface Action {
  def: SkillDef;
  slot: SkillSlotKey | null;
  aim: AimInfo;
  start: number;
  speed: number;
  hitAt: number;
  endAt: number;
  chainAt: number;
  moveAt: number;
  fired: boolean;
  paid: boolean;
  basic: boolean;
  step: number;
  faceYaw: number | null;
  faceUntil: number;
  uninterruptible: boolean;
  channel: ChannelState | null;
  ctx: CastCtx;
  beh: Behavior;
  upper: boolean;
  ended: boolean;
  /** GDD_V2 §3.2: the charge pose is held (the swing has not released yet). */
  charging?: boolean;
  /** Charge tier: 1 = heavy, 2 = weapon art (tier 2 is set live at 0.75 s of hold). */
  tier?: 1 | 2;
  /** Sim time until which hyper-armour applies (tier-2 release, GDD_V2 §3.10). */
  hyperUntil?: number;
  /** Jump attack (GDD_V2 §3.3): airborne until the landing resolves the hit. Hit and end times are unknown until then. */
  airborne?: boolean;
  /** CW-07 §2.4: pushbacks applied to this cast so far (max 2). */
  pushes?: number;
  /** CW-07 §2.7: proc mods resolved when the action started; consumed by pay(). */
  procMods?: ResolvedProcMods | null;
}

interface Aiming {
  slot: SkillSlotKey;
  def: SkillDef;
  tele: TelegraphHandle | null;
  x: number;
  z: number;
  startedAt: number;
}

interface ActorState {
  player: Player;
  cds: Map<string, Cd>;
  gcdUntil: number;
  gcdTotal: number;
  cur: Action | null;
  buffer: { slot: SkillSlotKey | null; skillId: string | null; aim: AimInfo; at: number } | null;
  /** COMBAT_WOW §2.2 spell queue (one slot) and the aim it was pressed with. */
  queue: SpellQueue;
  queueAim: AimInfo | null;
  combo: { next: number; lastEnd: number };
  lastAim: AimInfo;
  lastLmbCall: number;
  aiming: Aiming | null;
  cp: number;
  cpTimer: number;
  wall: CastCtx | null;
  barrier: CastCtx | null;
  bannerT: number;
  seen: boolean;
  /** Büyücü: element (1 fire, 2 frost, 3 arcane) of the previous skill (Element Dengesi trait). */
  lastElement: number;
  /** Player.dodgeStartedAt seen last frame: a change = a dodge roll really started (a refused dodge keystroke never cancels anything). */
  dodgeSeen: number;
  dodgeStarted: boolean;
  /** Titan Kavrayışı: basic hits so far. */
  basicCount: number;
  /** Full-body clip of the last action: cancelled as soon as the player moves after the action ended (no sliding recovery). */
  tailClip: string | null;
  /** Local: seconds spent airborne in the current jump (0 on the ground). */
  airT: number;
  /** Local: airborne last frame (a true -> false edge is a landing). */
  wasAir: boolean;
  /** Local: seconds spent moving at running speed (GDD_V2 §3.3 running attack). */
  runT: number;
  /** Local: sim time when the next jump attack may start. */
  jumpReadyAt: number;
  /** Local: dodgeStartedAt of the roll that already had its roll attack (once per roll). */
  rollAtkFor: number;
  /** Local: sim time until which the personal kick lockout runs (Kes, GDD_V2 §3.8). */
  kickUntil: number;
  /** Local: sim time when the next guard counter may start (GUARD_COUNTER_CD). */
  counterReadyAt: number;
  /** Sim time until which the auto-attack driver waits after a finisher ended (CONTROLS_WOW §8.2). Manual LMB ignores it. */
  autoGapUntil: number;
  /** CW-07 §2.6: school locked by an enemy interrupt, and the sim time the lock ends. */
  lockSchool: LockoutSchool | null;
  lockUntil: number;
}

/** Auto-attack view of the LMB chain for the driver and the HUD (CONTROLS_WOW §8.1). Derived, read-only. */
export interface AutoInfo {
  mode: AutoMode;
  /** Metres from the target's edge: melee = next step range + slack, ranged = min(step range, rangedMax). 0 when off. */
  reach: number;
  /** Index of the NEXT step (0-based). */
  step: number;
  steps: number;
  finisherNext: boolean;
  /** No action in progress, or the current one is past chainAt with no buffered input, no finisher gap, not paused. */
  ready: boolean;
  /** Current action progress for the swing sweep (0,0 when idle). */
  elapsed: number;
  total: number;
  /** Seconds of finisher gap still to wait (0 when none). */
  gapLeft: number;
}

interface Timer { at: number; fn: () => void }

/** Special ids whose VISUALS depend on the caster's gear / talents: announced in the 'cast' message so remote peers draw the same cast. */
const VISUAL_SPECIALS: Record<string, string[]> = {
  knight_basic_3: ['leg_dragonfang'],
  knight_shield_bash: ['set_holy_vanguard_4'],
  mage_meteor: ['set_archmage_legacy_4'],
  barbarian_fissure: ['leg_skullsplitter'],
};

const DEFAULT_AIM: AimInfo = { point: [0, 0, 0], dir: [0, 0, 1], targetId: null };
/** Animation time (clip-scaled) of a frozen charge pose: effectively stopped (AnimController FREEZE_TIME_SCALE 0.04). */
const FREEZE_HOLD = 1e12;

const _ray = new THREE.Ray();
const _v = new THREE.Vector3();
let ringGeo: THREE.RingGeometry | null = null;

/**
 * Executes player skills (data in data/skills.ts) for the LOCAL player: cost, cooldown, cast/channel,
 * animation (hit frame), targeting (arc, projectile, ground aoe, dash, leap...), vfx/sfx, and damage via
 * G.combat.playerHitEnemy. Broadcasts a cast event so remote peers replay visuals (playRemoteCast).
 *
 * Feel features: LMB combo chains with input buffering (queue during the swing, executes at the chain point), cancel windows
 * (dodge cancels anything cancellable; any skill/basic may cancel the recovery after the hit), upper-body attacks while moving for
 * light hits / root on finishers (internal hidden statuses act_slow / act_root), soft-target facing + step-in lunges, ground skills
 * with a friendly telegraph preview while the key is held (release / LMB = cast, dodge = cancel), cast bars via actor.cast.
 * OWNER: combat module.
 */
export class SkillSystem {
  /** Sim clock (advances with the scaled frame dt, so hit-stop / slow-mo affect cooldowns and timelines consistently). */
  now = 0;
  /** PlayerController may set this so hold-to-aim and hold-to-repeat use its soft-target aim. */
  aimProvider: (() => AimInfo) | null = null;
  /** Seconds since the last major-cooldown save (CharacterSave.majorCd is written once per second). */
  private majorAcc = 0;
  /** KIT PM-BA: next time a `tauntIcd` skill may taunt an enemy again, keyed `skill:enemy` (Kükreyen Balta). */
  private tauntIcdUntil = new Map<string, number>();
  private states = new Map<EntityId, ActorState>();
  /** Sim time of the last resource gain (Öfke Makinesi: rage does not decay for a while after gaining). */
  lastResourceGainAt = -99;
  /** Kurt Kanı (4): Kasırga costs no Öfke until this sim time (after Savaş Narası). */
  freeWhirlUntil = 0;
  /** Remote players' running channels (visual replays): the owner's 'cast' {end: true} message stops them. */
  private remoteChannels = new Map<EntityId, { skillId: string; rec: { ended: boolean } }>();
  /** Seconds the charge key has been held (heavyAttack, or LMB while autoCombo is off; reset on release). Decides the charged heavy (GDD_V2 §3.2). */
  private lmbHeld = 0;
  private zones: Zone[] = [];
  private tasks: ((dt: number) => boolean)[] = [];
  private timers: Timer[] = [];
  private fogRestore: { color: THREE.Color; until: number } | null = null;
  /** Set while a REMOTE player's cast replay runs (also inside its timers / tasks / zones): camera shake is distance-scaled, no hit-stop. */
  private remoteScope: Player | null = null;
  /** Combo routes of the LOCAL player (GDD_V2 §3.9): token history, see combat/routes.ts. */
  private routes = new RouteTracker();
  /** GDD_TALENTS §4.4: resolved (talent-modded) skills, keyed by skill id; cleared by invalidateResolved(). */
  private resolved = new Map<string, { key: string; src: SkillDef; def: SkillDef }>();
  private resolveRev = 0;
  /** Last mastery award per skill id (world seconds; at most one per 0.5 s). */
  private masteryAt = new Map<string, number>();
  /** Passive pip decay clocks, keyed `playerId:pipId`. */
  private pipClock = new Map<string, number>();
  /** PM-NE: recharging pips with `regen.parallel` (runes): seconds left of each missing pip's own timer, per `actorId:pipId`. */
  private pipTimers = new Map<string, number[]>();
  /** NC35: PipDef lookups outside TALENT_PIPS (null = none) and the pips shown per `class:spec`. */
  private pipDefCache = new Map<PipId, PipDef | null>();
  private activePipCache = new Map<string, PipDef[]>();
  /** CW-07 §2.7: emits proc:gain / proc:fade for the local player's proc statuses (procFx.ts). */
  private procWatch = new ProcWatcher();
  private watchers = new WatcherHost();
  /** The local player while updateLocal runs (feeds glowExtras for the bar's glow rules); null outside a scene. */
  private localPlayer: Player | null = null;

  constructor() {
    // GDD_TALENTS T7: the dynamic-buff entry point of the proc actions (procActions.liveProcHost.buff reads G.status)
    Object.assign(G, { status: { applyDynamic: applyDynamicBuff } });
    G.net?.on('cast', (p) => {
      const w = G.world;
      const pl = w?.get<Player>(p.casterId);
      if (!pl || pl.kind !== 'player' || pl.isLocal) return;
      if (p.end) {
        const rc = this.remoteChannels.get(pl.id);
        if (rc && rc.skillId === p.skillId) rc.rec.ended = true;
        return;
      }
      if (p.fx) { this.playRemoteFx(pl, p.skillId, p.fx, p.aim, p.r); return; }
      this.playRemoteCast(pl, p.skillId, p.aim, Array.isArray(p.sp) ? p.sp.filter((s) => typeof s === 'string').slice(0, 8) : undefined);
    });
    G.events?.on('scene:leaving', () => this.clearAll());
    // NC35: a spec switch drops the old spec's pip counters (Gizem Yükü, Adalet, Karışım, shards...)
    G.events?.on('spec:changed', (d) => { const lp = G.player; if (lp && lp.id === d.entityId) this.resetPips(lp); });
    // KIT PK-0 (E4 / procs.ts GlowState): the local player's shards, behind, dance and refresh inputs for the glow rules
    setGlowExtras(() => this.glowExtras());
    // GDD_V2 §2.1: entering a dungeon / raid resets every major cooldown (never in the open world)
    G.events?.on('scene:changed', (d) => { if (d.to === 'dungeon') resetMajorCooldowns(); });
  }

  // ======================================================================================================
  // public API
  // ======================================================================================================

  /** Use the skill bound to a bar slot. Returns true if it started (or was buffered / entered aiming). */
  tryCastSlot(player: Player, slot: SkillSlotKey, aim: AimInfo): boolean {
    const id = this.activeSkillForSlot(player, slot);
    if (!id) return false;
    const edge = !G.input || G.input.pressed(`skill_${slot}` as 'skill_lmb');
    this.quiet = !edge && slot !== 'lmb';
    try {
      return this.tryCast(player, id, aim, slot);
    } finally {
      this.quiet = false;
    }
  }

  tryCast(player: Player, skillId: string, aim: AimInfo, slot: SkillSlotKey | null = null): boolean {
    const base = SKILLS[skillId];
    if (!base || !player || !player.isLocal || !G.world) return false;
    // GDD_V2 §1.3 + GDD_TALENTS §4.4: the spec's mods, then the talent layer's mods (resolveSkill)
    const def = this.resolveSkill(base, player);
    const st = this.state(player);
    st.lastAim = this.sanitizeAim(player, aim);
    if (slot === 'lmb' || def.behavior === 'combo') st.lastLmbCall = this.now;
    if (player.isDead) return false;
    if (player.level < def.unlockLevel && def.classId !== 'common') return false;
    // GDD_V2 §2.1: Yorgun (sated) blocks every hero effect until it expires
    if (isHeroDef(def) && player.statuses.has('sated')) { this.fail('cooldown'); return false; }
    // GDD_TALENTS OT2 / T7: a skill that an A node of the spec tree grants is refused until that node is taken
    if (this.isTreeLocked(player, def)) {
      if (!this.quiet) G.events.emit('ui:toast', { text: 'Beceri kilitli', kind: 'warning' });
      return false;
    }

    // KIT Druid: a form skill auto-shifts into its form, a caster spell drops Kedi / Ayı / Yolcu (combat/Forms.ts)
    beforeFormCast(player, def);

    // already aiming this slot: just refresh the aim (the controller may call every frame while held)
    if (st.aiming) {
      if (st.aiming.def.id === def.id) return true;
      if (slot === 'lmb' || def.behavior === 'combo') { this.confirmAim(player, st); return true; }
      return false;
    }
    if (player.statuses.stunned) { this.fail('stunned'); return false; }
    // the held key of a running channel is re-issued every 0.1 s by the controller: that must neither cancel nor restart it
    if (st.cur && st.cur.def.id === def.id && st.cur.channel?.active) return true;
    // LMB while a marked enemy is in reach (Kritik Vuruş) or a riposte is open: those replace the chain step (GDD_V2 §3.5 / §3.7)
    if (def.behavior === 'combo' && slot === 'lmb' && this.trySpecialLmb(player, st)) return true;
    if (def.behavior === 'combo') return this.tryBasic(player, st, def, st.lastAim, slot);

    if (this.needsAim(def) && slot) {
      // a ground skill still on GCD / cooldown / chain window goes to the spell queue (fires with the live aim)
      const wait = this.skillWait(st, def);
      if (wait > 0) return this.queueSkill(st, def, slot, st.lastAim, wait);
      return this.startAim(player, st, def, slot);
    }
    return this.tryStartSkill(player, st, def, slot, st.lastAim);
  }

  // ======================================================================================================
  // auto-attack driver API (CONTROLS_WOW §8.1). AutoAttack.ts decides; these answer and perform.
  // ======================================================================================================

  /** Read-only view of the LMB chain for the auto-attack driver and the HUD. */
  autoInfo(p: Player): AutoInfo {
    const st = this.state(p);
    const { steps, idx } = this.autoChain(p, st);
    const mode = this.autoMode(p, steps);
    const step = steps[idx] ?? steps[0];
    let reach = 0;
    if (step && mode === 'melee') reach = (step.range ?? 2.5) + AUTO.meleeSlack;
    else if (step && mode === 'ranged') reach = Math.min(step.range ?? AUTO.rangedMax, AUTO.rangedMax);
    const cur = st.cur;
    return {
      mode,
      reach,
      step: idx,
      steps: steps.length,
      finisherNext: !!step?.tags.includes('finisher'),
      ready: this.autoReady(p, st),
      elapsed: cur ? Math.min(this.now - cur.start, cur.endAt) : 0,
      total: cur ? cur.endAt : 0,
      gapLeft: Math.max(0, st.autoGapUntil - this.now),
    };
  }

  /**
   * One auto swing: starts the next LMB chain step iff autoInfo().ready. Never buffers and never overwrites a skill buffer.
   * Returns true when a step started.
   */
  autoSwing(p: Player, aim: AimInfo): boolean {
    if (!p.isLocal || !G.world) return false;
    const st = this.state(p);
    if (!this.autoReady(p, st)) return false;
    const { parent, steps } = this.autoChain(p, st);
    if (!parent || !steps.length) return false;
    st.lastLmbCall = this.now;
    if (this.trySpecialLmb(p, st)) return true;
    if (st.cur) this.endAction(st, 'cancel', true);
    st.lastAim = this.sanitizeAim(p, aim);
    return this.startBasicStep(p, st, parent, steps, st.lastAim);
  }

  /** A queued skill (not the LMB chain itself) waits in the input buffer: the driver must yield to it. */
  hasBufferedSkill(p: Player): boolean {
    const st = this.states.get(p.id);
    if (st?.queue.peek()?.kind === 'skill') return true;
    const b = st?.buffer;
    if (!b || !b.skillId) return false;
    return b.skillId !== this.skillIdForSlot(p, 'lmb');
  }

  /** A ground aim is waiting for its confirm. */
  isAiming(p: Player): boolean {
    return !!this.states.get(p.id)?.aiming;
  }

  /** Cancel a ground aim without casting (RMB in WoW). */
  cancelAim(p: Player): void {
    const st = this.states.get(p.id);
    if (st?.aiming) this.endAim(p, st, false);
  }

  private autoChain(p: Player, st: ActorState): { parent: SkillDef | null; steps: SkillDef[]; idx: number } {
    const id = this.skillIdForSlot(p, 'lmb');
    const base = id ? SKILLS[id] : undefined;
    if (!base) return { parent: null, steps: [], idx: 0 };
    const parent = this.resolveSkill(base, p);
    if (parent.behavior !== 'combo') return { parent: null, steps: [], idx: 0 };
    const steps = comboSteps(parent.id);
    const reset = parent.params?.reset ?? 0.85;
    let idx = st.combo.next;
    if (this.now - st.combo.lastEnd > reset || idx >= steps.length) idx = 0;
    return { parent, steps, idx };
  }

  /** CONTROLS_WOW §8.3: class override, else derived from the basic step, the camera profile and casterAutoShot. */
  private autoMode(p: Player, steps: SkillDef[]): AutoMode {
    const cls = CLASSES[p.classId];
    if (cls?.autoAttack) return cls.autoAttack;
    if (!steps.length) return 'off';
    if (steps[0].targeting === 'melee_arc') return 'melee';
    if (cls?.cameraProfile === 'ranged') return 'ranged';
    return G.settings?.data.casterAutoShot ? 'ranged' : 'off';
  }

  /** Chain idle, or the current step is past its cancel point with nothing queued; never during a finisher, gap or pause. */
  private autoReady(p: Player, st: ActorState): boolean {
    if (p.isDead || p.statuses.stunned || p.cast || st.aiming || st.buffer) return false;
    if (this.now < st.autoGapUntil) return false;
    const cur = st.cur;
    if (!cur) return true;
    if (cur.charging || cur.airborne || cur.channel?.active || cur.def.tags.includes('finisher')) return false;
    return this.now - cur.start >= cur.chainAt;
  }

  getCooldown(actor: Actor, skillId: string): CooldownInfo {
    const st = this.states.get(actor.id);
    const def = SKILLS[skillId];
    const c = st?.cds.get(skillId);
    const max = this.chargesOf(actor, def);
    if (!c) return { remaining: 0, total: this.cooldownOf(actor, def), charges: max, maxCharges: max };
    return { remaining: c.charges > 0 ? 0 : Math.max(0, c.rechargeAt - this.now), total: c.total, charges: c.charges, maxCharges: c.max };
  }

  /** Global cooldown remaining for the HUD sweep. */
  getGcd(actor: Actor): { remaining: number; total: number } {
    const st = this.states.get(actor.id);
    if (!st) return { remaining: 0, total: 0 };
    return { remaining: Math.max(0, st.gcdUntil - this.now), total: st.gcdTotal };
  }

  getDef(skillId: string): SkillDef | undefined {
    return SKILLS[skillId];
  }

  /**
   * GDD_TALENTS §4.4: the skill a player casts. The base row, then the spec's mods (specPatched), then every mod of the
   * local character's talent layer (`fx.mods`: tree M nodes, spec fx, web fx, skill specialisations) through
   * applySkillMods (a derived copy; SKILLS is never touched). Cached per skill until invalidateResolved().
   */
  resolveSkill(base: SkillDef, player: Player): SkillDef {
    const patched = specPatched(player, base);
    if (!player.isLocal || !G.character) return patched;
    const mods = modsFor(base.id, base.tags ?? [], G.character.fx?.mods ?? []);
    if (mods.length === 0) return patched;
    const key = `${player.spec ?? ''}|${this.resolveRev}`;
    const hit = this.resolved.get(base.id);
    if (hit && hit.key === key && hit.src === patched) return hit.def;
    const out = applySkillMods(patched, mods);
    // GDD_TALENTS §4.5 `shape=orbit`: a melee skill's arc becomes a full circle
    if (out.targeting === 'melee_arc' && withShape(out)?.kind === 'orbit') out.arc = 360;
    this.resolved.set(base.id, { key, src: patched, def: out });
    return out;
  }

  /** Drops every resolved skill (CharacterState.recomputeStats: the talent layer changed). */
  invalidateResolved(): void {
    this.resolveRev++;
    this.resolved.clear();
  }

  /** procActions `echo`: a free repeat of a skill's hit on the target, at `coef` of the skill's damage (no shapes). */
  castEcho(actor: Player, skillId: string, coef: number, target: Actor): void {
    if (target.kind !== 'enemy' || target.isDead || target.removed || actor.isDead) return;
    const base = SKILLS[skillId];
    if (!base) return;
    const def = this.resolveSkill(base, actor);
    const dm = def.damage;
    G.combat.playerHitEnemy(actor, target as Enemy, {
      skillId,
      coef: (dm?.coef ?? 1) * coef,
      type: dm?.type ?? 'physical',
      tags: [...def.tags, 'proc'],
      isSpell: def.tags.includes('spell'),
      canCrit: true,
      noCombo: true,
      pos: [target.position.x, target.position.y + target.height * 0.5, target.position.z],
    });
  }

  /**
   * Pips of an actor (Player.pips[id]; `arcane` = Gizem Yükü). NC35: `combo` is a wrapper over the rogue's combo points
   * (ActorState.cp), so every pip id answers through the same API. The value is in internal units (shard: fragments).
   */
  pipCount(actor: Actor, id: string): number {
    if (id === 'combo') return this.states.get(actor.id)?.cp ?? 0;
    return (actor as unknown as { pips?: Record<string, number> }).pips?.[id] ?? 0;
  }

  /** NC35: PipDef of an id: TALENT_PIPS first, then the class `secondary` rows, then the V2 counters (combo / adalet / karisim). */
  pipDef(id: PipId): PipDef | undefined {
    const t = TALENT_PIPS[id];
    if (t) return t;
    if (this.pipDefCache.has(id)) return this.pipDefCache.get(id) ?? undefined;
    let found: PipDef | undefined;
    for (const c of Object.values(CLASSES)) if (c.secondary?.id === id) { found = c.secondary; break; }
    found ??= V2_PIPS[id];
    this.pipDefCache.set(id, found ?? null);
    return found;
  }

  /** NC35: max of a pip in internal units (rogue combo: 5, Gölge 6; every other pip: its PipDef.max, default 5). */
  pipMax(actor: Actor, id: string): number {
    if (id === 'combo') return this.comboCap(actor);
    return this.pipDef(id as PipId)?.max ?? 5;
  }

  /**
   * NC35: the pips the HUD shows for a player (class `secondary`, rogue combo, spec pips: Karışım, Adalet, Gizem Yükü, the
   * Death Knight rune). Cached per class + spec, so callers may poll it; the returned array must not be mutated.
   */
  activePips(actor: Actor): readonly PipDef[] {
    if (actor.kind !== 'player') return NO_PIPS;
    const cls = (actor as Player).classId;
    const spec = specOf(actor)?.id ?? '';
    const key = cls + ':' + spec;
    let out = this.activePipCache.get(key);
    if (out) return out;
    const ids: PipId[] = [];
    const sec = CLASSES[cls]?.secondary;
    if (sec && !(cls === 'druid' && spec !== 'druid_balance')) ids.push(sec.id); // KIT Druid: Astral Güç only for Denge
    if (cls === 'rogue' || (cls === 'druid' && (spec === 'druid_feral' || !spec))) ids.push('combo'); // KIT Druid: Vahşi (and the no-spec cat) count combo points
    if (spec === 'rogue_alchemist') ids.push('karisim');
    if (spec === 'knight_blademaster') ids.push('adalet');
    if (spec === 'mage_arcane') ids.push('arcane');
    if (cls === 'necromancer') ids.push('rune');
    // AE-3 / AE-4: İblis Avcısı soul fragments (İntikam + Yutucu) and the Ejderhasoy Öz pips (every spec)
    if (cls === 'demonhunter' && (spec === 'demonhunter_vengeance' || spec === 'demonhunter_devourer')) ids.push('soul');
    if (cls === 'evoker') ids.push('essence');
    out = [];
    for (const id of ids) { const d = this.pipDef(id); if (d && !out.includes(d)) out.push(d); }
    this.activePipCache.set(key, out);
    return out;
  }

  /** NC35: progress 0..1 of the next timed regen tick of a pip (PipDef.regen, Death Knight runes); 0 when it has none or is full. */
  pipRegenFrac(actor: Actor, id: PipId): number {
    const every = this.pipDef(id)?.regen?.every ?? 0;
    if (every <= 0 || this.pipCount(actor, id) >= this.pipMax(actor, id)) return 0;
    if (this.pipDef(id)?.regen?.parallel) {
      const left = this.pipTimers.get(`${actor.id}:${id}`);
      return left?.length ? clamp(1 - Math.min(...left) / every, 0, 1) : 0;
    }
    return clamp((this.pipClock.get(`${actor.id}:${id}`) ?? 0) / every, 0, 1);
  }

  /** Gains `n` pips (capped at the pip's max). Emits the `pip` proc trigger when the count rises. */
  addPip(actor: Actor, id: string, n: number): void {
    if (id === 'combo') { this.addCombo(actor, n); return; }
    const max = this.pipMax(actor, id);
    const before = this.pipCount(actor, id);
    const after = clamp(before + Math.max(0, n), 0, max);
    if (after === before) return;
    this.setPip(actor, id, after, max);
    if (actor.kind === 'player') G.procs?.emit('pip', { player: actor as Player, pipId: id as PipId });
  }

  /** Spends `n` pips when there are enough (false otherwise). Emits the `spend` proc trigger. */
  spendPip(actor: Actor, id: string, n: number): boolean {
    const have = this.pipCount(actor, id);
    if (n <= 0) return true;
    if (have < n) return false;
    if (id === 'combo') {
      const st = this.states.get(actor.id);
      if (st) { st.cp -= n; this.emitCp(st); }
    } else {
      this.setPip(actor, id, have - n, this.pipMax(actor, id));
    }
    if (actor.kind === 'player') G.procs?.emit('spend', { player: actor as Player, pipId: id as PipId });
    return true;
  }

  /** NC35: spends every pip of an id and returns how many (internal units) were spent. */
  consumePips(actor: Actor, id: string): number {
    const have = this.pipCount(actor, id);
    if (have > 0) this.spendPip(actor, id, have);
    return have;
  }

  /** NC35: zeroes every pip counter of an actor (spec change, scene change) and emits `pips:changed` for each one that moved. */
  resetPips(actor: Actor): void {
    const bag = actor as unknown as { pips?: Record<string, number> };
    for (const id of Object.keys(bag.pips ?? {})) if (this.pipCount(actor, id) > 0) this.setPip(actor, id, 0, this.pipMax(actor, id));
    if (this.pipCount(actor, 'combo') > 0) this.consumeCombo(actor);
    const prefix = `${actor.id}:`;
    for (const k of [...this.pipClock.keys()]) if (k.startsWith(prefix)) this.pipClock.delete(k);
    for (const k of [...this.pipTimers.keys()]) if (k.startsWith(prefix)) this.pipTimers.delete(k);
  }

  private setPip(actor: Actor, id: string, n: number, max: number): void {
    const bag = actor as unknown as { pips?: Record<string, number> };
    bag.pips = { ...(bag.pips ?? {}), [id]: n };
    // AE-3: PipDef.statusAt keeps a hidden status up while the counter is at least `min` (soul_overflow turns Ruh Yarma into Ruh Bombası)
    const sa = this.pipDef(id as PipId)?.statusAt;
    if (sa && actor.statuses) {
      if (n >= sa.min) { if (!actor.statuses.has(sa.status)) actor.statuses.apply(sa.status, 3600, { sourceId: actor.id }); }
      else if (actor.statuses.has(sa.status)) actor.statuses.remove(sa.status);
    }
    // KIT PK-0: the event reports display pips (PipDef.scale; warlock shard: 50 fragments = 5 pips). Default scale 1.
    const scale = this.pipDef(id as PipId)?.scale ?? 1;
    G.events.emit('pips:changed', { id: id as PipId, points: Math.floor(n / scale), max: Math.floor(max / scale) });
  }

  /** Skill ids bound to the bar slot of this player (basic attack for lmb). */
  getSlotSkill(player: Player, slot: SkillSlotKey): string | null {
    return this.activeSkillForSlot(player, slot);
  }

  /** The skill a bar slot casts right now: the slot's own skill, or its replacement while `replaces.whileStatus` is up. */
  private activeSkillForSlot(player: Player, slot: SkillSlotKey): string | null {
    const base = this.skillIdForSlot(player, slot);
    if (!base || slot === 'lmb') return base;
    return this.replacementFor(player, base) ?? base;
  }

  /**
   * Button transform (SkillDef.replaces, CORE_MECHANICS §10.3): the first skill of the player's class that replaces `baseId`
   * and whose `whileStatus` the player holds (registration order). Null when none is active. ActionBar shows the result too.
   */
  replacementFor(player: Player, baseId: string): string | null {
    for (const r of this.replacersOf(baseId)) {
      if (r.classId !== player.classId && r.classId !== 'common') continue;
      if (r.unlockLevel > player.level) continue;
      if (player.statuses.has(r.whileStatus)) return r.id;
    }
    return null;
  }

  /** Replacing rows by the id they replace, built once from SKILLS. */
  private replacersOf(baseId: string): ReplacerRow[] {
    if (!this.replacerIndex) {
      const idx = new Map<string, ReplacerRow[]>();
      for (const d of Object.values(SKILLS)) {
        if (!d.replaces) continue;
        const list = idx.get(d.replaces.skill) ?? [];
        list.push({ id: d.id, classId: d.classId, unlockLevel: d.unlockLevel, whileStatus: d.replaces.whileStatus });
        idx.set(d.replaces.skill, list);
      }
      this.replacerIndex = idx;
    }
    return this.replacerIndex.get(baseId) ?? [];
  }
  private replacerIndex: Map<string, ReplacerRow[]> | null = null;

  /** Skills the local player has unlocked at its level (for the skill book). */
  unlockedFor(player: Player): SkillDef[] {
    const c = CLASSES[player.classId];
    if (!c) return [];
    const ids = [...c.skills, ...specSkillIds(player)];
    return ids.map((id) => SKILLS[id]).filter((s): s is SkillDef => !!s && s.unlockLevel <= player.level);
  }

  /** Dungeon / raid entry, boss wipes and M+ starts reset every major (GDD_V2 §2.1): clears the timers of the majors. */
  resetMajors(): void {
    for (const st of this.states.values()) {
      for (const slot of MAJOR_SLOTS) {
        const id = this.skillIdForSlot(st.player, slot);
        if (id) st.cds.delete(id);
      }
    }
  }

  /** Charges of a skill (Donmuş Taç gives Buz Halkası a second charge). */
  chargesOf(actor: Actor, def: SkillDef | undefined): number {
    if (!def) return 1;
    let n = def.charges ?? 1;
    if (def.id === 'mage_frost_nova' && actor.kind === 'player' && (actor as Player).isLocal) n = Math.max(n, sp('leg_frozen_crown')?.charges ?? 1);
    return n;
  }

  /** Shave `sec` seconds off a running cooldown (Dağın Kalbi). */
  reduceCooldown(actor: Actor, skillId: string, sec: number): void {
    const c = this.states.get(actor.id)?.cds.get(skillId);
    if (!c || c.charges >= c.max) return;
    c.rechargeAt -= sec;
    if (this.now >= c.rechargeAt) {
      c.charges++;
      if (c.charges < c.max) c.rechargeAt = this.now + c.total;
    }
  }

  /** Make a skill instantly ready again (set bonuses). */
  resetCooldown(actor: Actor, skillId: string): void {
    const c = this.states.get(actor.id)?.cds.get(skillId);
    if (c) c.charges = c.max;
  }

  isCasting(actor: Actor): boolean {
    return !!actor.cast;
  }

  /** True while an attack/skill animation lock is running (movement may still be partially free). */
  isBusy(actor: Actor): boolean {
    return !!this.states.get(actor.id)?.cur;
  }

  /** Current action info for the HUD / controller (null when idle). */
  getAction(actor: Actor): { skillId: string; elapsed: number; hitAt: number; endAt: number; channel: boolean; basic: boolean } | null {
    const a = this.states.get(actor.id)?.cur;
    if (!a) return null;
    return { skillId: a.def.id, elapsed: this.now - a.start, hitAt: a.hitAt, endAt: a.endAt, channel: !!a.channel?.active, basic: a.basic };
  }

  /** Stop the actor's cast/channel (stun, dodge-cancel). `force` also cancels dashes/leaps (death, stun). Returns true if something stopped. */
  interrupt(actor: Actor, force = false, cause?: 'enemyInterrupt'): boolean {
    const st = this.states.get(actor.id);
    if (!st) return false;
    let did = false;
    st.buffer = null; // a dodge / stun swallows any queued press (otherwise a swing would start in the middle of the roll)
    st.queue.clear('interrupt');
    if (st.aiming) { this.endAim(actor as Player, st, false); did = true; }
    const a = st.cur;
    if (!a) return did;
    if (!force) {
      if (a.uninterruptible) return did;
      if (a.def.tags.includes('ultimate') && this.now - a.start < 0.3) return did;
    }
    // CW-07 §2.6: an enemy interrupt locks the school of the cast it cut (local player only; melee has no school)
    const school = cause === 'enemyInterrupt' && actor.kind === 'player' && (actor as Player).isLocal ? lockoutSchool(a.def) : null;
    this.endAction(st, force ? 'interrupt' : 'cancel', true);
    if (school) this.applyLockout(actor as Player, st, school);
    return true;
  }

  /** CW-07 §2.6: the school is locked for WOW.lockout.sec; the `lockout` status carries the school index for the HUD. */
  private applyLockout(p: Player, st: ActorState, school: LockoutSchool): void {
    const sec = WOW.lockout.sec;
    st.lockSchool = school;
    st.lockUntil = this.now + sec;
    p.statuses.apply('lockout', sec, { magnitude: LOCKOUT_SCHOOLS.indexOf(school) + 1, sourceId: null });
    G.events.emit('skill:lockout', { school, sec });
  }

  /** True when `def` belongs to the school locked on this player right now. */
  private schoolLocked(st: ActorState, def: SkillDef): boolean {
    const school = lockoutSchool(def);
    return !!school && school === st.lockSchool && this.now < st.lockUntil;
  }

  /** Run `fn` with the remote-replay scope set to `rs` (null = local), restoring the previous scope. */
  private inRemote<T>(rs: Player | null, fn: () => T): T {
    const prev = this.remoteScope;
    this.remoteScope = rs;
    try { return fn(); } finally { this.remoteScope = prev; }
  }

  /**
   * Remote player cast visuals (animation + vfx/sfx + visual-only projectiles). No damage. `sp` = the special ids the owner announced
   * (CastCtx.rsp: fan of fissures, extra meteors, Ejderdişi wave...), so the replay matches the owner's gear instead of the viewer's.
   */
  playRemoteCast(player: Player, skillId: string, aim: AimInfo, sp?: string[]): void {
    const def = SKILLS[skillId];
    if (!def || !G.world || player.isLocal) return;
    this.inRemote(player, () => this.remoteCastBody(player, def, aim, sp));
  }

  private remoteCastBody(player: Player, def: SkillDef, aim: AimInfo, sp?: string[]): void {
    const skillId = def.id;
    try {
      const c = this.makeCtx(player, def, aim, true);
      if (sp?.length) c.rsp = new Set(sp);
      const beh = behaviorFor(def);
      const speed = def.animSpeed ?? 1;
      const hit = def.castTime > 0 ? def.castTime : (def.hitTime ?? 0.3) / speed;
      const upper = (def.params?.upper ?? 0) === 1 && player.velocity.lengthSq() > 1;
      if (def.anim && player.anim) {
        if (player.anim.oneShotName !== def.anim) {
          const fit = def.params?.fit ? (player.anim.clipDuration(def.anim) / Math.max(0.2, def.duration ?? 0.6)) : speed;
          player.anim.playOnce(def.anim, { speed: fit, fade: 0.06, upperBody: upper, loop: !!def.channel && !def.params?.fixed });
        }
      }
      player.yaw = yawFromDir(c.dir[0], c.dir[1]);
      this.playTrail(player, def, Math.max(0, hit - 0.16));
      if (def.sfx?.cast) this.schedule(Math.max(0, hit - 0.1), () => this.sfx(def.sfx!.cast!, player.position));
      else if (def.tags.includes('melee')) this.schedule(Math.max(0, hit - 0.1), () => this.sfx((def.params?.weight ?? 0) >= 1 ? 'swing_heavy' : 'swing_light', player.position, { pitchVar: 0.1 }));
      this.schedule(hit, () => {
        try {
          beh.begin?.call(beh, c);
          beh.fire(c);
          this.remoteSpecialsOnFire(c);
          if (def.channel) {
            // channels run until the owner's 'end' message (or the skill's full length as a safety net)
            const every = def.params?.tick ?? (def.duration ?? def.channel) / Math.max(1, def.ticks ?? 8);
            const dur = def.channel + 0.4;
            const rec = { ended: false };
            this.remoteChannels.set(player.id, { skillId: def.id, rec });
            let n = 0;
            this.addTask((dt) => {
              c.data.rt = (c.data.rt ?? 0) + dt;
              const rt = c.data.rt as number;
              if (beh.tick) {
                while (!rec.ended && rt >= n * every + every && n < 400) { beh.tick(c, n++); }
              }
              beh.frame?.(c, dt, rt);
              if (rec.ended || rt >= dur) {
                try { beh.end?.(c, 'done'); } catch { /* ignore */ }
                try { if (player.anim?.oneShotName === def.anim) player.anim.cancelOneShot(0.12); } catch { /* ignore */ }
                if (this.remoteChannels.get(player.id)?.rec === rec) this.remoteChannels.delete(player.id);
                return true;
              }
              return false;
            });
          }
        } catch (e) {
          console.error('[skills] remote cast failed', def.id, e);
        }
      });
    } catch (e) {
      console.error('[skills] playRemoteCast failed', skillId, e);
    }
  }

  /** Visual-only mirror of specialsOnFire for a remote cast (Ejderdişi wave, Kutsal Öncü shockwave). */
  private remoteSpecialsOnFire(c: CastCtx): void {
    const rsp = c.rsp;
    if (!rsp?.size) return;
    const p = c.caster;
    if (c.def.id === 'knight_basic_3' && rsp.has('leg_dragonfang')) fireWave(this, c, { range: 6, coef: 0 });
    if (c.def.id === 'knight_shield_bash' && rsp.has('set_holy_vanguard_4')) {
      shockwave(this, c, { radius: 4, coef: 0, color: 0xffe9a0, weight: 'heavy', vfx: 'holy_burst', x: p.position.x + c.dir[0] * 1.5, z: p.position.z + c.dir[1] * 1.5 });
    }
  }

  /** Owner side: tell the other peers a special just fired (the light 'cast' variant, visuals only on their side). */
  private broadcastFx(p: Player, skillId: string, fx: 'titan' | 'mountain' | 'phoenix' | 'echo', aim: AimInfo, r?: number): void {
    try {
      G.net?.broadcast('cast', { casterId: p.id, skillId, aim: { point: aim.point, dir: aim.dir, targetId: aim.targetId }, fx, r });
    } catch { /* offline */ }
  }

  /** Remote peers: draw a special of another player (no damage, no hit-stop, distance-scaled shake). */
  private playRemoteFx(player: Player, skillId: string, fx: string, aim: AimInfo, r?: number): void {
    const def = SKILLS[skillId];
    if (!def || !G.world || player.isLocal) return;
    this.inRemote(player, () => {
      try {
        const c = this.makeCtx(player, def, aim, true);
        switch (fx) {
          case 'titan': shockwave(this, c, { radius: Math.min(8, r ?? 3), coef: 0, knockback: 0, weight: 'heavy', color: 0xffd9a0 }); break;
          case 'mountain': shockwave(this, c, { radius: Math.min(8, r ?? 3), coef: 0, color: 0xdcd2b8, weight: 'light', shake: 0.14 }); break;
          case 'phoenix': shockwave(this, c, { radius: Math.min(10, r ?? 6), coef: 0, type: 'fire', color: 0xff7a30, weight: 'ultimate', vfx: 'fire_burst', shake: 0.5 }); break;
          case 'echo': {
            c.echo = true;
            this.vfx('arcane_burst', [player.position.x + c.dir[0] * 0.9, player.position.y + 1.5, player.position.z + c.dir[1] * 0.9], { scale: 0.5, color: 0xc8a0ff });
            this.sfx('spell_cast', player.position, { pitch: 1.3, volume: 0.7 });
            behaviorFor(def).fire(c);
            break;
          }
          default: break;
        }
      } catch (e) {
        console.error('[skills] remote fx failed', skillId, fx, e);
      }
    });
  }

  /** Drop all cooldowns/casts (death, scene change). */
  reset(actor: Actor): void {
    const st = this.states.get(actor.id);
    if (!st) return;
    if (st.aiming) this.endAim(actor as Player, st, false);
    if (st.cur) this.endAction(st, 'interrupt', true);
    st.cds.clear();
    st.gcdUntil = 0;
    st.buffer = null;
    st.queue.clear('reset');
    st.combo.next = 0;
    st.autoGapUntil = -99;
    st.wall = null;
    st.barrier = null;
    st.bannerT = 0;
    if (st.cp) { st.cp = 0; this.emitCp(st); }
    actor.cast = null;
  }

  update(dt: number): void {
    this.now += dt;
    const w = G.world;
    if (!w) return;
    this.runTimers();
    this.runTasks(dt);
    this.runZones(dt);
    // GDD_TALENTS T7: proc timers (tick / still / delayed echoes) and the mage touch bursts (Büyücü Dokunuşu)
    G.procs?.update(dt);
    this.sweepTouchBursts();
    const p = w.localPlayer;
    if (p && p.isLocal) {
      const st = this.state(p);
      this.updateLocal(p, st, dt);
      this.majorAcc += dt;
      if (this.majorAcc >= 1) { this.majorAcc = 0; this.saveMajors(st); }
    }
    // cooldown recharge (charges)
    for (const st of this.states.values()) {
      for (const [id, c] of st.cds) {
        if (c.charges < c.max && this.now >= c.rechargeAt) {
          c.charges++;
          if (c.charges < c.max) c.rechargeAt += c.total;
        }
        if (c.charges >= c.max && this.now > c.rechargeAt + 30) st.cds.delete(id);
      }
    }
    if (this.fogRestore && this.now > this.fogRestore.until) this.restoreFog();
  }

  // ======================================================================================================
  // queries used by Combat / other systems
  // ======================================================================================================

  shieldWallActive(actor: Actor): boolean {
    return !!this.states.get(actor.id)?.wall;
  }

  bannerActive(actor: Actor): boolean {
    return (this.states.get(actor.id)?.bannerT ?? 0) > 0;
  }

  isUnstoppable(actor: Actor): boolean {
    // GDD_V2 §2.2: the defensive majors and Demir Duruş are unstoppable (no knockback / stagger / stun)
    if (actor.statuses.has('bastion') || actor.statuses.has('last_stand') || actor.statuses.has('iron_stance')) return true;
    const a = this.states.get(actor.id)?.cur;
    return !!a && (a.def.params?.unstoppable ?? 0) > 0;
  }

  comboPoints(actor: Actor): number {
    return this.states.get(actor.id)?.cp ?? 0;
  }

  onKill(_p: Player, _e: Enemy): void {
    /* hook for kill-triggered skill effects (talents) */
  }

  onBlocked(p: Player, amount: number, wall: boolean): void {
    // PM-00b (plate-melee §g need 12): Kalkan Kaldır stores a share of every frontal block for its release
    if (!wall && p.statuses.has('shield_block')) shieldStoreAdd(p, amount);
    const st = this.states.get(p.id);
    if (!st) return;
    if (wall && st.wall) {
      const d = st.wall.def.params ?? {};
      st.wall.data.stored = ((st.wall.data.stored as number) ?? 0) + amount * (d.store ?? 0.15);
      this.addResource(p, d.gainPerBlock ?? 5);
      this.vfx('block_spark', [p.position.x + Math.sin(p.yaw) * 0.9, p.position.y + 1.3, p.position.z + Math.cos(p.yaw) * 0.9], { scale: 1.3 });
      this.shake(0.1, 0.15);
      this.hitstopMs(35);
    }
  }

  /**
   * CW-07 §2.4 pushback (called from Combat for every hit on a player). A hard cast before its hit frame gets +0.5 s; a
   * channel loses 25 % of its total duration. Max 2 per cast; hits under 3 % max HP, absorbed hits and immune casts never push.
   * `amount` is the damage that landed (0 when fully absorbed). DoT ticks are not distinguishable here (see CW-07 report).
   */
  onPlayerDamaged(p: Player, amount: number): void {
    if (!p.isLocal) return;
    const st = this.states.get(p.id);
    const a = st?.cur;
    if (!st || !a || a.ended) return;
    const channeling = !!a.channel?.active;
    const hardCast = a.def.castTime > 0 && !a.fired;
    if (!channeling && !hardCast) return;
    const resisted = this.isUnstoppable(p) || p.statuses.has('shield') || p.statuses.has('blazing_barrier') || softStat(p, 'pushbackResistPct') >= 1;
    const hit: HitForPushback = { hitFrac: p.maxHp > 0 ? amount / p.maxHp : 0, absorbed: amount <= 0, resist: resisted };
    const before = a.pushes ?? 0;
    if (!pushesBack(before, hit)) return;
    a.pushes = before + 1;
    if (channeling && a.channel) {
      // the channel ends sooner: `until` is seconds after start, so the cut is subtracted from it and from the end time
      const cut = channelCut(a.def.channel ?? 0, before, hit);
      a.channel.until = Math.max(this.now - a.start, a.channel.until - cut);
      a.endAt = a.channel.until + 0.3;
      if (p.cast) p.cast.duration = Math.max(0, p.cast.duration - cut);
      G.events.emit('cast:pushback', { skillId: a.def.id, add: -cut, count: a.pushes });
      return;
    }
    const add = PUSHBACK_CFG.add;
    a.hitAt += add;
    a.endAt += add;
    a.chainAt += add;
    a.moveAt += add;
    if (p.cast && p.cast.skillId === a.def.id) p.cast.duration += add;
    G.events.emit('cast:pushback', { skillId: a.def.id, add, count: a.pushes });
  }

  /** PM-00b (plate-melee §g need 12): `shield_block` ended (expiry, dispel or recast): the stored damage is released. */
  onShieldBlockEnded(owner: Actor): void {
    shieldStoreRelease(owner);
  }

  /** The 'shield' status ended (absorbed or expired): Büyü Kalkanı frost burst. */
  onShieldEnded(owner: Actor): void {
    this.blazingNova(owner);
    const st = this.states.get(owner.id);
    const c = st?.barrier;
    if (!st || !c) return;
    st.barrier = null;
    const def = c.def;
    const r = def.params?.breakRadius ?? 4;
    const p = c.caster;
    this.vfx('frost_nova', [p.position.x, 0.2, p.position.z], { scale: vfxScale('frost_nova', r) });
    this.ring(p.position.x, p.position.z, r, 0x7fd8ff);
    this.sfx('frost_impact', p.position);
    this.shake(0.22, 0.25);
    if (c.remote || p.isDead) return;
    for (const e of this.enemiesNear(p.position.x, p.position.z, r, p.position.y)) {
      this.strike(c, e, { coef: def.damage?.coef ?? 1, weight: 'heavy', stagger: 10, noGain: true, statuses: [{ status: 'chill', duration: 3, stacks: 2 }], dir: this.dirTo(p, e), knockback: 1.2 });
    }
  }

  // ======================================================================================================
  // internals: slots, state
  // ======================================================================================================

  private state(p: Player): ActorState {
    let st = this.states.get(p.id);
    if (!st) {
      st = {
        player: p, cds: new Map(), gcdUntil: 0, gcdTotal: 0, cur: null, buffer: null, queue: new SpellQueue(), queueAim: null, combo: { next: 0, lastEnd: -99 },
        lastAim: { point: [p.position.x, 0, p.position.z + 1], dir: [Math.sin(p.yaw), 0, Math.cos(p.yaw)], targetId: null },
        lastLmbCall: -99, aiming: null, cp: 0, cpTimer: 0, wall: null, barrier: null, bannerT: 0, seen: false, lastElement: 0, dodgeSeen: p.dodgeStartedAt, dodgeStarted: false, basicCount: 0, tailClip: null,
        airT: 0, wasAir: false, runT: 0, jumpReadyAt: 0, rollAtkFor: -99, kickUntil: 0, counterReadyAt: -99, autoGapUntil: -99,
        lockSchool: null, lockUntil: 0,
      };
      this.states.set(p.id, st);
      if (p.isLocal) this.restoreMajors(p, st);
    }
    st.player = p;
    return st;
  }

  /** Major timers survive death and scene changes: re-arm them from CharacterSave.majorCd (remaining seconds). */
  private restoreMajors(p: Player, st: ActorState): void {
    const rem = readMajorCd();
    for (const slot of MAJOR_SLOTS) {
      const sec = rem[slot as 'm45' | 'm90' | 'm180'];
      const id = this.skillIdForSlot(p, slot);
      if (!id || sec <= 0) continue;
      st.cds.set(id, { charges: 0, max: 1, total: MAJOR_BASE[slot as 'm45' | 'm90' | 'm180'], rechargeAt: this.now + sec });
    }
  }

  /** Writes the remaining major cooldowns to the save once per second (ticked while in game). */
  private saveMajors(st: ActorState): void {
    for (const slot of MAJOR_SLOTS) {
      const id = this.skillIdForSlot(st.player, slot);
      if (!id) continue;
      const c = st.cds.get(id);
      const sec = c && c.charges <= 0 ? Math.max(0, c.rechargeAt - this.now) : 0;
      writeMajorCd(slot as 'm45' | 'm90' | 'm180', sec);
    }
  }

  private skillIdForSlot(player: Player, slot: SkillSlotKey): string | null {
    const cls = CLASSES[player.classId];
    if (!cls) return null;
    // GDD_V2 §1.1: a spec may replace the class basic attack (Simyacı: Şişe Fırlat)
    if (slot === 'lmb') return formBasic(player) ?? specOf(player)?.basic ?? cls.basicAttack; // KIT Druid: Kedi / Ayı chains
    const bar = G.character?.save.skillBar;
    let id = bar?.[slot];
    const def = id ? SKILLS[id] : undefined;
    if (!def || (def.classId !== player.classId && def.classId !== 'common')) id = undefined;
    if (!id) id = defaultSkillBar(player.classId)[slot];
    return id ?? null;
  }

  private sanitizeAim(p: Player, aim: AimInfo): AimInfo {
    let dx = aim.dir?.[0] ?? 0, dz = aim.dir?.[2] ?? 0;
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) { dx = Math.sin(p.yaw); dz = Math.cos(p.yaw); } else { dx /= l; dz /= l; }
    const pt = aim.point ?? [p.position.x + dx * 3, 0, p.position.z + dz * 3];
    return { point: [pt[0], pt[1] ?? 0, pt[2]], dir: [dx, 0, dz], targetId: aim.targetId ?? null, allyId: aim.allyId ?? null };
  }

  /** Up-to-date aim: provider (controller) > camera ray to ground > last aim passed in. */
  private liveAim(p: Player, st: ActorState): AimInfo {
    if (this.aimProvider) {
      try { return this.sanitizeAim(p, this.aimProvider()); } catch { /* fall through */ }
    }
    const cam = G.camera;
    const w = G.world;
    if (cam && w) {
      try {
        const ray = cam.getAimRay(_ray);
        const g = w.rayToGround(ray, _v);
        if (g) {
          const dx = g.x - p.position.x, dz = g.z - p.position.z;
          const l = Math.hypot(dx, dz);
          if (l > 0.3) return { point: [g.x, 0, g.z], dir: [dx / l, 0, dz / l], targetId: st.lastAim.targetId };
        }
      } catch { /* ignore */ }
    }
    return st.lastAim;
  }

  private needsAim(def: SkillDef): boolean {
    // (channels such as Kar Fırtınası start immediately: their reticle follows the live aim while the key is held)
    return def.targeting === 'ground_aoe' && !def.params?.atCaster && !def.channel;
  }

  // ======================================================================================================
  // starting skills
  // ======================================================================================================

  /**
   * `timed` = also check cooldown and GCD. Off-GCD skills (COMBAT_WOW §2.1) never wait for the GCD. `timed = false` is the
   * validity-only check used for queued presses (their timing is handled by skillWait).
   */
  private canUse(p: Player, st: ActorState, def: SkillDef, report: boolean, timed = true): boolean {
    const basic = !!def.tags.includes('basic');
    if (p.statuses.silenced && !basic) { if (report) this.fail('silenced'); return false; }
    if (this.schoolLocked(st, def)) { if (report) this.fail('lockout', Math.max(0, st.lockUntil - this.now)); return false; }
    const c = st.cds.get(def.id);
    if (timed && c && c.charges <= 0) { if (report) this.fail('cooldown', Math.max(0, c.rechargeAt - this.now)); return false; }
    if (timed && !basic && !isOffGcd(def) && this.now < st.gcdUntil) { if (report) this.fail('cooldown', st.gcdUntil - this.now); return false; }
    // CW-07: a proc can make the cost free (costMult 0), so the resource check reads the proc multiplier too
    const procCost = resolveProcMods(p.statuses, def.id)?.costMult ?? 1;
    if (def.cost > 0 && p.resource + 0.01 < def.cost * this.costMult(p, def) * procCost) { if (report) this.fail('resource'); return false; }
    const min = def.params?.minResource;
    if (min && p.resource + 0.01 < min) { if (report) this.fail('resource'); return false; }
    if (def.params?.hpCostPct && p.hp <= p.maxHp * 0.1) { if (report) this.fail('resource'); return false; }
    const minCp = def.params?.minCp;
    if (minCp && st.cp < minCp) { if (report) this.fail('resource'); return false; }
    if (def.pip?.min && this.pipCount(p, def.pip.id) < def.pip.min) { if (report) this.fail('resource'); return false; }
    // PM-NE: a pip spender (runes, Holy Power) the counter cannot pay is refused at the press, not after the GCD and the swing have been spent
    if (def.pip?.cost && !resolveProcMods(p.statuses, def.id)?.pipFree && this.pipCount(p, def.pip.id) < def.pip.cost) { if (report) this.fail('resource'); return false; }
    return true;
  }

  private tryStartSkill(p: Player, st: ActorState, def: SkillDef, slot: SkillSlotKey | null, aim: AimInfo): boolean {
    // silence / resource refusals are reported now and never queued
    if (!this.canUse(p, st, def, true, false)) return false;
    if (st.cur?.channel?.active) return false;
    const wait = this.skillWait(st, def);
    if (wait > 0) return this.queueSkill(st, def, slot, aim, wait);
    if (st.cur) this.endAction(st, 'cancel', true); // wait == 0: the chain window is open
    st.combo.next = 0; // skills reset the LMB chain
    return this.startAction(p, st, def, slot, aim, false, 0);
  }

  /**
   * Seconds until `def` may start: GCD (on-GCD skills only), own cooldown, and the current action's chain window.
   * Infinity = cannot be queued (channel). Charge / other non-cancellable actions with no chain end are Infinity too.
   */
  private skillWait(st: ActorState, def: SkillDef): number {
    let w = 0;
    const c = st.cds.get(def.id);
    if (c && c.charges <= 0) w = Math.max(w, c.rechargeAt - this.now);
    if (!isOffGcd(def)) w = Math.max(w, st.gcdUntil - this.now);
    const cur = st.cur;
    if (cur) {
      if (cur.channel?.active) return Infinity;
      w = Math.max(w, cur.chainAt - (this.now - cur.start));
    }
    return Math.max(0, w);
  }

  /** COMBAT_WOW §2.2 window in seconds: Settings.spellQueueMs (0 disables the queue), capped at WOW.queue.window. */
  private spellQueueWindow(): number {
    const ms = G.settings?.data.spellQueueMs ?? WOW.queue.window * 1000;
    return Math.max(0, Math.min(WOW.queue.window, ms / 1000));
  }

  /** Holds a press that is `wait` seconds early. Too early (> window) is rejected with the remaining time. */
  private queueSkill(st: ActorState, def: SkillDef, slot: SkillSlotKey | null, aim: AimInfo, wait: number): boolean {
    if (!Number.isFinite(wait)) { this.buffer(st, slot, def.id, aim); return true; }
    if (wait > this.spellQueueWindow()) { this.fail('cooldown', wait); return false; }
    const prev = st.queue.peek();
    st.queue.offer(wait, { kind: 'skill', skillId: def.id, slot }, this.now);
    st.queueAim = aim;
    if (!prev || prev.skillId !== def.id) G.events.emit('skill:queued', { skillId: def.id, slot });
    return true;
  }

  /** Fires the queued press once it is legal (called every frame from updateLocal). Invalid presses are dropped quietly. */
  private serviceQueue(p: Player, st: ActorState): void {
    const e = st.queue.peek();
    if (!e || st.aiming) return;
    const base = e.skillId ? SKILLS[e.skillId] : undefined;
    const def = base ? this.resolveSkill(base, p) : null;
    const valid = !!def && !p.isDead && !p.statuses.stunned && this.canUse(p, st, def, false, false);
    const wait = def ? this.skillWait(st, def) : 0;
    const state: TakeState = !valid ? 'invalid' : wait > 0 ? 'wait' : 'ready';
    const t = st.queue.take(this.now, state);
    if (!t || !def) return;
    if (st.cur) this.endAction(st, 'cancel', true);
    st.combo.next = 0;
    const live = this.liveAim(p, st);
    const aim: AimInfo = { ...live, targetId: st.queueAim?.targetId ?? live.targetId };
    this.startAction(p, st, def, (t.slot as SkillSlotKey | null), aim, false, 0);
  }

  private buffer(st: ActorState, slot: SkillSlotKey | null, skillId: string | null, aim: AimInfo): void {
    st.buffer = { slot, skillId, aim, at: this.now };
  }

  private tryBasic(p: Player, st: ActorState, parent: SkillDef, aim: AimInfo, slot: SkillSlotKey | null): boolean {
    const steps = comboSteps(parent.id);
    if (!steps.length) return false;
    const cur = st.cur;
    if (cur) {
      const el = this.now - cur.start;
      if (el < cur.chainAt || cur.channel?.active) {
        if (cur.channel?.active) return false;
        this.buffer(st, slot ?? 'lmb', parent.id, aim);
        return true;
      }
      this.endAction(st, 'cancel', true);
    }
    return this.startBasicStep(p, st, parent, steps, aim);
  }

  private startBasicStep(p: Player, st: ActorState, parent: SkillDef, steps: SkillDef[], aim: AimInfo): boolean {
    const reset = parent.params?.reset ?? 0.85;
    let idx = st.combo.next;
    if (this.now - st.combo.lastEnd > reset || idx >= steps.length) idx = 0;
    const def = steps[idx];
    if (!def) return false;
    if (p.statuses.stunned) return false;
    // running / jump / roll attacks replace the chain step they are triggered from (GDD_V2 §3.3)
    if (this.tryMoveAttack(p, st, idx)) return true;
    const ok = this.startAction(p, st, def, 'lmb', aim, true, idx);
    if (ok) st.combo.next = idx + 1 >= steps.length ? 0 : idx + 1;
    return ok;
  }

  // ------------------------------------------------------------------------------------------------------
  // timeline + action start
  // ------------------------------------------------------------------------------------------------------

  /** Attack/cast speed factor (>= 0.4). */
  speedFactor(p: Actor, def: SkillDef): number {
    const spell = def.tags.includes('spell');
    let f = 1 + clamp(p.getStat(spell ? 'castSpeed' : 'attackSpeed'), -0.6, 1);
    if (p.kind === 'player') {
      const cls = (p as Player).classId;
      if (cls === 'barbarian') f += Math.min(0.1, (p.resource / 10) * 0.01);
      if (spell && this.states.get(p.id)?.barrier && p.statuses.has('shield')) f += 0.2;
      if ((p as Player).isLocal && G.character) f += this.specSpeed(p as Player, spell);
    }
    return Math.max(0.4, f);
  }

  /** Attack / cast speed from passives, legendaries and sets. */
  private specSpeed(p: Player, spell: boolean): number {
    let b = 0;
    if (!spell && p.classId === 'knight') b += sp('n_oath_blade')?.attackSpeedWithSword1h ?? 0;
    if (p.classId === 'barbarian' && p.statuses.has('enrage') && hasSp('set_wolfblood_2')) b += 0.15;
    const mm = sp('leg_madmans_belt');
    if (mm && p.hp / Math.max(1, p.maxHp) < (mm.hpBelow ?? 0.5)) b += mm.speed ?? 0.25;
    return b;
  }

  private makeCtx(p: Player, def: SkillDef, aim: AimInfo, remote: boolean): CastCtx {
    let dx = aim.dir?.[0] ?? 0, dz = aim.dir?.[2] ?? 0;
    let l = Math.hypot(dx, dz);
    if (l < 1e-4) { dx = Math.sin(p.yaw); dz = Math.cos(p.yaw); l = 1; }
    let dir: [number, number] = [dx / l, dz / l];
    let target: Actor | null = null;
    if (!remote) {
      // CM §10.2 targeted kinds and the kit behaviours (kit_*, mage kit) + `requires.target` take the hard / soft target
      const wantsTarget = def.targeting === 'melee_arc' || def.targeting === 'dash' || def.targeting === 'target_projectile'
        || def.targeting === 'target_instant' || def.behavior === 'shadow_step' || isKitBehavior(def.behavior) || !!def.requires?.target;
      if (wantsTarget) target = this.pickTarget(p, def, aim, dir);
      if (target && def.targeting === 'melee_arc') {
        const tdx = target.position.x - p.position.x, tdz = target.position.z - p.position.z;
        const tl = Math.hypot(tdx, tdz);
        if (tl > 0.05) dir = [tdx / tl, tdz / tl];
      }
    }
    // ground point clamped to range
    let px = aim.point?.[0] ?? p.position.x + dir[0] * 4, pz = aim.point?.[2] ?? p.position.z + dir[1] * 4;
    if (def.params?.atCaster) { px = p.position.x; pz = p.position.z; }
    else if (def.range) {
      const ddx = px - p.position.x, ddz = pz - p.position.z;
      const dd = Math.hypot(ddx, ddz);
      if (dd > def.range) { px = p.position.x + (ddx / dd) * def.range; pz = p.position.z + (ddz / dd) * def.range; }
      if (!remote && dd < 0.01) { px = p.position.x + dir[0] * 2; pz = p.position.z + dir[1] * 2; }
    }
    return { sys: this, caster: p, def, aim, dir, remote, action: null, target, point: [px, pz], data: {}, more: 1 };
  }

  private pickTarget(p: Player, def: SkillDef, aim: AimInfo, dir: [number, number]): Actor | null {
    const w = G.world;
    if (!w) return null;
    // target_instant up to 5 m also lunges up to 3 m (behaviors.ts targetInstant): the pick reaches that far too
    const instantMelee = def.targeting === 'target_instant' && (def.range ?? 25) <= 5;
    const melee = def.targeting === 'melee_arc' || instantMelee;
    const reach = (def.range ?? 3) + (melee ? FEEL.meleeAssistExtra : 0) + (instantMelee ? 3 : 0);
    const hardId = aim.targetId;
    if (hardId !== null && hardId !== undefined) {
      const t = w.getActor(hardId);
      if (t && !t.isDead && t.team === 'enemy') {
        const d = Math.hypot(t.position.x - p.position.x, t.position.z - p.position.z) - t.radius;
        // melee: |Δy| ≤ 2.5 (sameLevel default tol); ranged single-target picks are gated by the instant rule elsewhere
        if (d <= reach + (melee ? 1.5 : 3) && (!melee || w.sameLevel(t, p.position.y))) return t;
      }
    }
    const cone = def.targeting === 'melee_arc' ? FEEL.meleeAssistCone : 70;
    const cosHalf = Math.cos(((cone / 2) * Math.PI) / 180);
    let best: Actor | null = null;
    let bestScore = -1;
    for (const e of w.enemies) {
      if (e.isDead) continue;
      if (melee && !w.sameLevel(e, p.position.y)) continue;
      const dx = e.position.x - p.position.x, dz = e.position.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      const edge = dist - e.radius;
      if (edge > reach) continue;
      const cos = dist > 0.01 ? (dx * dir[0] + dz * dir[1]) / dist : 1;
      if (cos < cosHalf && edge > 0.6) continue;
      const ang = Math.acos(clamp(cos, -1, 1)) / ((cone / 2) * (Math.PI / 180));
      const score = 0.6 * (1 - Math.min(1, ang)) + 0.4 * (1 - Math.min(1, edge / reach));
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  private startAction(p: Player, st: ActorState, def: SkillDef, slot: SkillSlotKey | null, aim: AimInfo, basic: boolean, step: number): boolean {
    if (!this.canUse(p, st, def, true)) return false;
    const beh = behaviorFor(def);
    // GDD_TALENTS T8 hooks (resolveCast): cost and cast-time multipliers change the cast itself; the rest rides on the ctx
    const mm = this.castMods(p, def);
    // CW-07 §2.7: proc mods sit next to the mage hooks: cost and cast time here, more / crit on the ctx, pips and consumption in pay()
    const pm = resolveProcMods(p.statuses, def.id);
    // PM-PA: Parlak Işık waives the Kutsal Güç cost of the spender (Işığın Sözü); pay() reads the rewritten def
    if (pm?.pipFree && def.pip?.cost) def = { ...def, pip: { ...def.pip, cost: 0 } };
    const costMul = (mm?.costMult ?? 1) * (pm?.costMult ?? 1);
    const castMul = (mm?.castTimeMult ?? 1) * (pm?.castTimeMult ?? 1);
    if (costMul !== 1 || castMul !== 1) def = { ...def, cost: def.cost * costMul, castTime: def.castTime * castMul };
    // WoW feel (retail rules): a hard cast or a channel cannot start on the move; instants always can, and never slow, root or turn the runner.
    const wowMove = p.isLocal && G.input?.scheme === 'wow';
    const hardCast = def.castTime > 0 || !!def.channel;
    if (wowMove && hardCast && p.moveIntent && def.lockMovement !== false && !p.statuses.has('hover')) {
      this.fail('moving');
      return false;
    }
    const c = this.makeCtx(p, def, aim, false);
    if (mm) {
      c.more *= mm.more;
      c.data.mage = mm;
    }
    if (pm) {
      c.more *= pm.more;
      c.data.procMods = pm;
    }
    // KIT PM-KN (Kalkan Darbesi x1.3 under shield_block): a status read at cast start, the status is not consumed
    if (def.whileStatusMult && p.statuses.has(def.whileStatusMult.status)) c.more *= def.whileStatusMult.mult;
    const params = def.params ?? {};
    const rate = this.speedFactor(p, def);
    // GDD_LIFE §5.3: the LMB chain tempo follows the equipped weapon (FEEL.basicTempo x FEEL_WEAPON.tempo)
    const animSpeed = (def.animSpeed ?? 1) * rate * (basic ? FEEL.basicTempo * weaponTempoOf(p) : 1);
    const hitClip = def.hitTime ?? 0.3;
    const isChannel = !!def.channel;
    let hit = def.castTime > 0 ? def.castTime / rate : isChannel ? Math.max(0.05, hitClip / animSpeed) : hitClip / animSpeed;
    let end = (params.end ?? hitClip + 0.3) / animSpeed;
    if (def.castTime > 0) end = hit + Math.max(0.2, ((params.end ?? hitClip + 0.4) - hitClip) / animSpeed);
    if (end < hit + 0.06) end = hit + 0.1;
    let chain = hit + (params.chain ?? (basic ? 0.05 : 0.1)) / animSpeed * (isChannel ? 0 : 1);
    let move = hit + (params.move ?? (basic ? 0.15 : 0.2)) / animSpeed;
    // COMBAT_WOW §2.3 lead skip: the clip starts later so the hit lands at the lead target (instants and LMB steps 1-2 only)
    const movement = def.targeting === 'dash' || def.targeting === 'leap' || def.targeting === 'teleport' || def.behavior === 'shadow_step';
    const leadable = WOW.lead.enabled && !isChannel && !movement && !def.tags.includes('finisher')
      && (basic ? step <= 1 : def.castTime === 0 && (params.weight ?? 0) < 2);
    const leadTarget = leadable ? (params.lead ?? (basic ? WOW.lead.basic : WOW.lead.instant)) : 0;
    const leadSkip = G.settings?.data.leadSkip === false ? 0 : leadSkipSec(hit, leadTarget);
    hit -= leadSkip; end -= leadSkip; chain -= leadSkip; move -= leadSkip;
    const moving = p.isLocal && (G.input?.moveAxis?.().x !== 0 || G.input?.moveAxis?.().y !== 0);
    // WoW: an instant used on the move plays on the upper body, so the legs keep their run cycle (no foot sliding, no pose pop)
    const wowNoTurn = wowMove && !movement; // WoW never turns or lunges the character for a cast (RMB mouselook is the only auto-turn)
    const wowKeepRun = wowNoTurn && p.moveIntent && !hardCast && !def.tags.includes('finisher');
    const upper = (params.upper === 1 && !!moving) || wowKeepRun;

    const a: Action = {
      def, slot, aim, start: this.now, speed: animSpeed, hitAt: hit, endAt: end, chainAt: chain, moveAt: move,
      fired: false, paid: false, basic, step, faceYaw: yawFromDir(c.dir[0], c.dir[1]), faceUntil: hit + 0.15,
      uninterruptible: false, channel: null, ctx: c, beh, upper, ended: false, pushes: 0, procMods: pm,
    };
    c.action = a;
    if (def.id === 'knight_shield_bash' && hasSp('set_holy_vanguard_4')) c.more = 3; // 200% DAHA FAZLA
    if (beh.begin && beh.begin(c) === false) return false;

    // pay up-front for movement / channel skills; everything else pays at the hit frame (dodge before = free)
    const payNow = isChannel || def.targeting === 'dash' || def.targeting === 'leap' || def.targeting === 'teleport' || params.payStart === 1;
    if (payNow && !this.pay(p, st, def, a)) return false;

    // COMBAT_WOW §2.1: GCD from Settings.gcdProfile + haste; off-GCD skills (gcdFor = 0) never touch it
    if (!basic) {
      const g = gcdFor(G.settings?.data.gcdProfile ?? 'arpg', p.classId, rate, def);
      if (g > 0) { st.gcdUntil = this.now + g; st.gcdTotal = g; }
    }
    st.cur = a;
    st.buffer = null;
    if (p.classId === 'mage' && params.element) this.elementBalance(p, st, params.element);

    // facing + step-in lunge
    // WoW: no cast turns the character; the hit still goes to the aim (PlayerController checks "target in front 180 deg" first)
    if (!wowNoTurn) p.yaw = a.faceYaw!;
    else a.faceYaw = null;
    if (def.targeting === 'melee_arc' && params.lunge && !upper && !wowNoTurn) {
      const t = c.target;
      let lunge = 0;
      if (t) {
        const edge = Math.hypot(t.position.x - p.position.x, t.position.z - p.position.z) - t.radius - p.radius;
        const range = def.range ?? 2.5;
        // a target out of reach pulls the swing up to 1 m closer (GDD 8.2 step-in); inside reach only the skill's own small lunge
        if (edge > range * 0.55) lunge = Math.min(edge > range ? Math.max(params.lunge, 1.0) : params.lunge, edge - range * 0.5);
      } else lunge = params.lunge * 0.35;
      if (lunge > 0.1) this.lunge(p, c.dir, lunge, 0.12);
    }

    // movement lock
    // AE-4 (agile-evoker §g.2 #7): Süzül (hover) lets hard casts run without the movement slow
    if (!isChannel && !wowMove) { // WoW: neither instants nor hard casts slow or root (moving cuts a cast instead)
      if (params.root === 1 || def.lockMovement) this.actRoot(p, move);
      else if (!(p.statuses.has('hover') && def.castTime > 0)) this.actSlow(p, params.slow ?? (basic ? 0.5 : 0.55), move);
    }
    if (def.castTime > 0 || isChannel) {
      p.cast = { skillId: def.id, name: def.name, start: G.world?.time ?? this.now, duration: def.castTime > 0 ? hit : (def.channel ?? 0), channel: isChannel, interruptible: true };
      if (def.castTime > 0) G.events.emit('skill:cast', { casterId: p.id, skillId: def.id, castTime: hit });
    }
    if (!(def.castTime > 0)) G.events.emit('skill:cast', { casterId: p.id, skillId: def.id, castTime: 0 });

    // animation
    if (def.anim && p.anim) {
      const fit = params.fit ? (p.anim.clipDuration(def.anim) / Math.max(0.2, def.duration ?? 0.6)) : animSpeed;
      const loop = isChannel && !params.fixed;
      if (def.targeting !== 'dash' && def.targeting !== 'leap' && def.targeting !== 'teleport' && def.behavior !== 'shadow_step') {
        p.anim.playOnce(def.anim, { speed: fit, fade: 0.06, upperBody: upper, loop, restart: true, startAt: leadSkip * fit });
        st.tailClip = upper || loop ? null : def.anim;
      }
    }
    // props (crossbow / throwable) + trails + sounds
    this.props(p, def);
    if (def.tags.includes('melee') || params.trail) this.playTrail(p, def, Math.max(0, hit - 0.16));
    const whoosh = def.sfx?.cast ?? (def.tags.includes('melee') ? ((params.weight ?? 0) >= 1 ? 'swing_heavy' : 'swing_light') : undefined);
    if (whoosh && !isChannel) this.schedule(Math.max(0, hit - 0.1), () => this.sfx(whoosh as SfxId, p.position, { pitchVar: 0.1 }));

    const announced = VISUAL_SPECIALS[def.id]?.filter((id) => hasSp(id));
    G.net?.broadcast('cast', { casterId: p.id, skillId: def.id, aim: { point: aim.point, dir: [c.dir[0], 0, c.dir[1]], targetId: aim.targetId }, sp: announced?.length ? announced : undefined, sf: this.skillSf(def.id) || undefined });
    return true;
  }

  private pay(p: Player, st: ActorState, def: SkillDef, a?: Action): boolean {
    // pips are read before any resource is spent, so a missing `cost` pip refuses the cast cleanly
    let pipUse: { id: PipId; spent: number; gain: number } | null = null;
    if (def.pip) {
      const r = this.pipPayment(p, def.pip);
      if (!r) { this.fail('resource'); return false; }
      pipUse = r;
    }
    let cost = def.cost;
    if (cost > 0) {
      cost *= this.costMult(p, def);
      if (p.resource + 0.01 < cost) { this.fail('resource'); return false; }
      p.resource = Math.max(0, p.resource - cost);
      // PM-00b (plate-melee §g need 7): Anger Management reads every paid spend
      spendSpecials(this, p, p.resourceType, cost);
    } else if (cost < 0) {
      this.gainResource(p, -cost);
    }
    // CW-07 §2.7: a proc spends its effects here: cdFree skips the cooldown, cdReset clears this skill's own cooldown
    const pm = a?.procMods ?? null;
    if (!def.channel && !pm?.cdFree) this.startCooldown(p, st, def);
    if (pm?.cdReset) st.cds.delete(def.id);
    if (pipUse) {
      if (pipUse.spent > 0) this.spendPip(p, pipUse.id, pipUse.spent);
      if (pipUse.gain > 0) this.addPip(p, pipUse.id, pipUse.gain);
      // the consumed count scales the damage of the skill (`coefPerPip`, Gizem Barajı: 1.8 + 0.9 per charge)
      if (a) a.ctx.data.pipSpent = pipUse.spent;
    }
    if (pm) for (const b of pm.bonusPips) this.addPip(p, b.id, b.n);
    // PM-00b (plate-melee §g need 4): a cleave rider is spent by the cast it starts; every hit of that cast cleaves
    if (a) {
      const riders = cleaveRidersOf(p.statuses);
      if (riders.length) {
        a.ctx.data.rider = riders[0];
        p.statuses.consumeStack(riders[0].status);
      }
    }
    if (a) {
      a.paid = true;
      const mm = a.ctx.data.mage as MageCastMods | undefined;
      if (mm) {
        const ctx = this.mageCtx(p);
        for (const h of specHooksOf(p)) h.commitCast?.(p, def, mm, ctx);
      }
    }
    if (pm) {
      // the procs this cast was made under are spent now; onConsume.healPct heals once per cast, `resource` is granted once
      const heal = consumeProcMods(p.statuses, pm);
      if (heal > 0) G.combat.healPlayer(p, p, p.maxHp * heal, { quiet: true });
      if (pm.resource > 0) this.addResource(p, pm.resource);
    }
    // KIT PM-KN (Savaş Avatarı): the cast cleanses the listed statuses from the caster
    for (const s of def.cleanses ?? []) p.statuses.dispel(s);
    // GDD_TALENTS T7 triggers: `cast` (every paid cast) and `major` (the m45 / m90 / m180 slots)
    G.procs?.emit('cast', { player: p, skillId: def.id, tags: def.tags, target: a?.ctx.target ?? null });
    if (isMajorDef(def)) G.procs?.emit('major', { player: p, skillId: def.id, tags: def.tags });
    return true;
  }

  /** `pip` block of a skill: null when the counter cannot pay it, else what is spent and gained. */
  private pipPayment(p: Player, pip: NonNullable<SkillDef['pip']>): { id: PipId; spent: number; gain: number } | null {
    const have = this.pipCount(p, pip.id);
    if (pip.min && have < pip.min) return null;
    let spent = 0;
    if (pip.consume !== undefined) spent = pip.consume === 'all' ? have : Math.min(have, pip.consume);
    else if (pip.cost) {
      if (have < pip.cost) return null;
      spent = pip.cost;
    }
    return { id: pip.id, spent, gain: pip.gain ?? 0 };
  }

  /** Mage cast modifiers (specs/mage.ts resolveCast) of every trait table the caster owns, merged; null without any. */
  private castMods(p: Player, def: SkillDef): MageCastMods | null {
    if (!p.isLocal) return null;
    const hooks = specHooksOf(p);
    if (hooks.length === 0) return null;
    const ctx = this.mageCtx(p);
    const m: MageCastMods = { costMult: 1, castTimeMult: 1, critBonus: 0, more: 1, frozenMult: 1, spendCharges: 0, consumeHot: false, consumeFingers: 0 };
    for (const h of hooks) {
      if (!h.resolveCast) continue;
      const x = h.resolveCast(p, def, ctx);
      m.costMult *= x.costMult;
      m.castTimeMult *= x.castTimeMult;
      m.critBonus += x.critBonus;
      m.more *= x.more;
      m.frozenMult = Math.max(m.frozenMult, x.frozenMult);
      m.spendCharges += x.spendCharges;
      m.consumeHot = m.consumeHot || x.consumeHot;
      m.consumeFingers += x.consumeFingers;
    }
    return m;
  }

  private mageCtx(p: Player): MageCtx {
    return { now: G.world?.time ?? this.now, w: weaponAvg(p) };
  }

  /** Skill-specialisation picks for the cast message (`sf`): 3 tiers × 2 bits, tier t at bits 2(t-1)..2(t-1)+1. */
  private skillSf(skillId: string): number {
    const t = G.talents;
    if (!t) return 0;
    let sf = 0;
    for (let tier = 1; tier <= 3; tier++) sf |= (t.skillPick(skillId, tier) & 3) << (2 * (tier - 1));
    return sf;
  }

  /** The tree-gated skill (an A node of the active spec, OT2) that the character has not taken yet. */
  private isTreeLocked(p: Player, def: SkillDef): boolean {
    if (!p.isLocal || !G.character) return false;
    const gated = specOf(p)?.treeSkills?.[def.id] !== undefined;
    return gated && !(G.talents?.grantedSkills() ?? []).includes(def.id);
  }

  /** Passive pip decay (TALENT_PIPS `decay`: Gizem Yükü −1 every 5 s after 8 s out of combat). */
  /**
   * PM-00b (plate-melee §g need 1): timed pip regeneration (PipDef.regen): +1 per `every` seconds up to `max`, in or out of combat.
   * Only the Death Knight's rune pip (class `necromancer`) regenerates, so no other class ever gains it.
   */
  private regenPips(p: Player, dt: number): void {
    // PM-NE: rune (necromancer); AE-4: Ejderhasoy Öz (1 pip per 3.5 s, divided by haste). Only the pips this player shows regenerate.
    if (p.classId !== 'necromancer' && p.classId !== 'evoker') return;
    for (const pd of this.activePips(p)) {
      if (!pd.regen) continue;
      const id = pd.id;
      const key = `${p.id}:${id}`;
      if (pd.regen.parallel) { this.regenParallel(p, id, pd.max, pd.regen.every, key, dt); continue; }
      if (this.pipCount(p, id) >= pd.max) { this.pipClock.set(key, 0); continue; }
      const t = (this.pipClock.get(key) ?? 0) + dt * (id === 'essence' ? 1 + Math.max(0, softStat(p, 'castSpeed')) : 1);
      if (t < pd.regen.every) { this.pipClock.set(key, t); continue; }
      this.pipClock.set(key, t - pd.regen.every);
      this.addPip(p, id, 1);
    }
  }

  /**
   * PM-NE: parallel recharge (runes). Every missing pip owns a timer of `every` seconds that starts the frame after it was spent;
   * they all run at once, so 6 spent runes are all back 10 s later. Pips granted by other means (addPip) cancel the timer closest to done.
   */
  private regenParallel(p: Player, id: PipId, max: number, every: number, key: string, dt: number): void {
    let timers = this.pipTimers.get(key);
    if (!timers) { timers = []; this.pipTimers.set(key, timers); }
    const missing = Math.max(0, max - this.pipCount(p, id));
    while (timers.length < missing) timers.push(every);
    while (timers.length > missing) timers.splice(timers.indexOf(Math.min(...timers)), 1);
    for (let i = timers.length - 1; i >= 0; i--) {
      timers[i] -= dt;
      if (timers[i] > 0) continue;
      timers.splice(i, 1);
      this.addPip(p, id, 1);
    }
  }

  private decayPips(p: Player, dt: number): void {
    for (const [id, pd] of Object.entries(TALENT_PIPS) as [PipId, PipDef | undefined][]) if (pd) this.decayOne(p, id, pd, dt);
    // NC35: the class's own `secondary` pip decays by the same rule (Çi: -1 every 4 s after 8 s out of combat)
    const sec = CLASSES[p.classId]?.secondary;
    if (sec && !TALENT_PIPS[sec.id]) this.decayOne(p, sec.id, sec, dt);
  }

  private decayOne(p: Player, id: PipId, pd: PipDef, dt: number): void {
    if (!pd.decay) return;
    const key = `${p.id}:${id}`;
    if (this.pipCount(p, id) <= 0 || p.combatTimer <= pd.decay.after) { this.pipClock.set(key, 0); return; }
    const t = (this.pipClock.get(key) ?? 0) + dt;
    if (t < pd.decay.every) { this.pipClock.set(key, t); return; }
    this.pipClock.set(key, 0);
    this.setPip(p, id, Math.max(0, this.pipCount(p, id) - (pd.scale ?? 1)), pd.max);
  }

  /** Büyücü Dokunuşu bursts (specs/mage.ts collectTouchBursts), once per frame across the registered trait tables. */
  private sweepTouchBursts(): void {
    for (const h of allSpecHooks()) {
      const bursts = h.collectTouchBursts?.();
      if (bursts) for (const b of bursts) this.applyTouchBurst(b);
    }
  }

  private applyTouchBurst(b: TouchBurst): void {
    if (b.owner.kind !== 'player' || !(b.owner as Player).isLocal) return;
    const owner = b.owner as Player;
    for (const e of this.enemiesNear(b.x, b.z, b.radius, groundAt(b.x, b.z))) {
      G.combat.playerHitEnemy(owner, e, {
        skillId: 'mage_touch_of_magi', coef: 0, flat: b.amount, type: b.type, tags: ['spell', 'arcane', 'aoe', 'proc'],
        isSpell: true, canCrit: false, noCombo: true, pos: [e.position.x, e.position.y + e.height * 0.5, e.position.z],
      });
    }
  }

  /** Alev Bariyeri nova (specs/mage.ts onBarrierBroken) when the barrier's shield runs out. Local casters only. */
  private blazingNova(owner: Actor): void {
    if (owner.kind !== 'player' || !(owner as Player).isLocal || owner.isDead) return;
    for (const h of specHooksOf(owner)) {
      const nova = h.onBarrierBroken?.(owner);
      if (!nova) continue;
      this.ring(nova.x, nova.z, nova.radius, 0xff7a2e);
      this.shake(0.2, 0.2);
      for (const e of this.enemiesNear(nova.x, nova.z, nova.radius, groundAt(nova.x, nova.z))) {
        G.combat.playerHitEnemy(owner as Player, e, {
          skillId: 'mage_blazing_barrier', coef: nova.coef, type: nova.type, tags: ['spell', 'fire', 'aoe'], isSpell: true,
          canCrit: true, noCombo: true, pos: [e.position.x, e.position.y + e.height * 0.5, e.position.z],
        });
      }
    }
  }

  /** The cast shape of a skill (GDD_TALENTS §4.4 / Appendix D): split / return / orbit / echo after the first landed hit, pull on every hit. */
  private applyShape(c: CastCtx, e: Enemy): void {
    if (c.remote || c.echo || c.caster.isDead) return;
    const shape = withShape(c.def);
    if (!shape) return;
    if (shape.kind === 'pull') {
      const dx = c.point[0] - e.position.x, dz = c.point[1] - e.position.z;
      const l = Math.hypot(dx, dz);
      if (l > 0.5) G.combat.pullEnemy(e, [dx / l, dz / l], Math.min(shape.strength ?? 1, l - 0.5));
      return;
    }
    if (c.data.shapeDone) return; // the form happens once per cast
    c.data.shapeDone = true;
    const base = c.def.damage?.coef ?? 0;
    if (base <= 0) return;
    // children are casts of the same skill that never split, return, orbit or echo again
    const child: CastCtx = { ...c, data: {}, echo: true, action: null };
    switch (shape.kind) {
      case 'split': {
        // n small radial blasts (r 1.5 m) around the struck enemy, each at `coef` of the skill's damage
        const n = Math.min(6, Math.max(1, Math.round(shape.n ?? 3)));
        const coef = (shape.coef ?? 0.5) * base;
        const cx = e.position.x, cz = e.position.z;
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * 2 * i) / n;
          const px = cx + Math.cos(a) * 1.5, pz = cz + Math.sin(a) * 1.5;
          this.schedule(0.1 + 0.05 * i, () => {
            this.vfx('hit_spark', [px, 0.8, pz], { scale: 0.7 });
            for (const v of this.enemiesNear(px, pz, 1.5, groundAt(px, pz))) this.strike(child, v, { coef, noGain: true, weight: 'light' });
          });
        }
        return;
      }
      case 'return': {
        // the returning projectile hits the same enemy again 0.45 s later (0.7 coef by default)
        const coef = (shape.coef ?? 0.7) * base;
        this.schedule(0.45, () => {
          if (e.isDead || e.removed) return;
          this.vfx('hit_spark', [e.position.x, 1, e.position.z], { scale: 0.6 });
          this.strike(child, e, { coef, noGain: true, weight: 'light' });
        });
        return;
      }
      case 'orbit': {
        // n copies orbit the caster at 2.5 m for 3 s; every 0.5 s they hit enemies within 1.2 m at 0.35 coef
        const n = Math.min(6, Math.max(1, Math.round(shape.n ?? 1)));
        const coef = (shape.coef ?? 0.35) * base;
        const caster = c.caster;
        let t = 0;
        let tick = 0;
        this.addTask((dt) => {
          t += dt;
          tick += dt;
          if (tick >= 0.5) {
            tick -= 0.5;
            for (let i = 0; i < n; i++) {
              const a = t * 2.5 + (Math.PI * 2 * i) / n;
              const ox = caster.position.x + Math.cos(a) * 2.5, oz = caster.position.z + Math.sin(a) * 2.5;
              for (const v of this.enemiesNear(ox, oz, 1.2, groundAt(ox, oz))) this.strike(child, v, { coef, tick: true, noGain: true });
            }
          }
          return t >= 3;
        });
        return;
      }
      case 'echo': {
        // the hit repeats at the same place after `delay` seconds
        const coef = (shape.coef ?? 0.5) * base;
        this.schedule(shape.delay ?? 0.4, () => {
          if (e.isDead || e.removed) return;
          this.strike(child, e, { coef, noGain: true });
        });
        return;
      }
    }
  }

  /** GDD_TALENTS §4.2: a cast that hit at least one enemy awards mastery XP to its base skill (once per 0.5 s per skill). */
  private awardMastery(def: SkillDef): void {
    const last = this.masteryAt.get(def.id) ?? -99;
    if (this.now - last < 0.5) return;
    this.masteryAt.set(def.id, this.now);
    G.progression?.addSkillMastery(def.id, xpFor(SKILLS[def.id] ?? def));
  }

  private startCooldown(p: Actor, st: ActorState, def: SkillDef): void {
    const cd = this.cooldownOf(p, def);
    if (cd <= 0) return;
    this.spendCooldown(p, st, def, cd);
    // KIT PM-BA (Kan Susuzluğu / Kan Banyosu): a `sharedCd` group starts every member's cooldown together
    if (def.sharedCd) {
      for (const sib of Object.values(SKILLS)) {
        if (sib.id !== def.id && sib.sharedCd === def.sharedCd) {
          const sibCd = this.cooldownOf(p, sib);
          if (sibCd > 0) this.spendCooldown(p, st, sib, sibCd);
        }
      }
    }
  }

  private spendCooldown(p: Actor, st: ActorState, def: SkillDef, cd: number): void {
    const max = this.chargesOf(p, def);
    let c = st.cds.get(def.id);
    if (!c) { c = { charges: max, max, total: cd, rechargeAt: 0 }; st.cds.set(def.id, c); }
    else if (c.max !== max) { c.charges = clamp(c.charges + (max - c.max), 0, max); c.max = max; }
    c.total = cd;
    if (c.charges >= c.max) c.rechargeAt = this.now + cd;
    c.charges = Math.max(0, c.charges - 1);
  }

  private cooldownOf(p: Actor, def: SkillDef | undefined): number {
    if (!def) return 0;
    // Beceri Kitabı: -2% cooldown per rank above 1 (local player's skills only)
    const local = p.kind === 'player' && (p as Player).isLocal;
    // PM-00b (plate-melee §g need 4): `cdMult` riders (ursoc_form halves Yarma / Paralama)
    return def.cooldown * (1 - Math.min(0.4, Math.max(0, p.getStat('cdr')))) * (local ? skillRankCooldownMult(def.id) : 1) * cdMultFor(p.statuses, def.id);
  }

  // ------------------------------------------------------------------------------------------------------
  // per frame (local player)
  // ------------------------------------------------------------------------------------------------------

  private updateLocal(p: Player, st: ActorState, dt: number): void {
    this.localPlayer = p;
    this.procWatch.update(p, dt);
    // KIT PK-0 (E4): hidden watcher statuses (aoe_mode, exec_window), evaluated every 0.25 s
    this.watchers.update(dt, p.statuses, () => this.watcherCtx(p));
    // charge hold clock (GDD_V2 §3.2): time the charge key has been down (see chargeDown); 0 once released
    this.lmbHeld = this.chargeDown() ? this.lmbHeld + dt : 0;
    // a charge pose can only outlive its action through a missed reset: never leave the clip frozen
    if (p.anim && p.anim.freezeUntil >= FREEZE_HOLD * 0.5 && !st.cur?.charging) p.anim.freezeUntil = 0;
    if (p.isDead) {
      st.queue.clear('death');
      if (st.cur || st.aiming) { this.interrupt(p, true); }
      return;
    }
    if (st.bannerT > 0) st.bannerT -= dt;
    // combo points decay (-1 every 3 s after 8 s out of combat)
    if (st.cp > 0 && p.combatTimer > 8) {
      st.cpTimer += dt;
      if (st.cpTimer >= 3) { st.cpTimer = 0; st.cp--; this.emitCp(st); }
    } else st.cpTimer = 0;
    this.decayPips(p, dt);
    this.regenPips(p, dt);

    if (p.statuses.stunned) st.queue.clear('stun');
    if (p.statuses.stunned && (st.cur || st.aiming)) this.interrupt(p, true);
    // F4: the heavyAttack press starts the charge in tryHeavyPress (PlayerController calls it behind its input gates)
    // (PlayerController calls interrupt() itself when a dodge roll really starts: pressing Shift without charges must not cancel swings;
    //  st.dodgeStarted is the rising edge of that roll, so nothing here keys off the raw dodge key either)
    st.dodgeStarted = p.dodgeStartedAt !== st.dodgeSeen;
    st.dodgeSeen = p.dodgeStartedAt;
    if (st.dodgeStarted) this.noteRoute(p, 'DOD'); // combo routes: "Dodge -> L" (GDD_V2 §3.9)

    // airtime (jump attack, GDD_V2 §3.3): a landing resolves a jump attack that is waiting for it
    const air = this.isAirborne(p);
    if (air) st.airT += dt;
    else {
      if (st.wasAir && st.cur?.airborne) this.resolveLanding(st, st.airT);
      st.airT = 0;
    }
    st.wasAir = air;
    // running attack clock (GDD_V2 §3.3): on the ground at >= 85% move speed, not rolling
    const axis = G.input?.moveAxis?.();
    const moving = !!axis && (axis.x !== 0 || axis.y !== 0);
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    st.runT = moving && !air && !p.dodging && p.canMove() && speed >= RUN_SPEED_FRAC * p.moveSpeed() ? st.runT + dt : 0;

    if (st.aiming) this.updateAim(p, st);

    if (!st.cur && st.tailClip) {
      const an = p.anim;
      if (!an || an.oneShotName !== st.tailClip) st.tailClip = null;
      else {
        const m = G.input?.moveAxis?.();
        if (m && (m.x !== 0 || m.y !== 0)) { an.cancelOneShot(0.1); st.tailClip = null; }
      }
    }

    if (st.cur) this.updateAction(p, st, dt);
    this.serviceQueue(p, st);
    if (!st.cur && st.buffer) this.runBuffer(p, st);
  }

  private runBuffer(p: Player, st: ActorState): void {
    const b = st.buffer;
    if (!b) return;
    if (this.now - b.at > FEEL.inputBuffer) { st.buffer = null; return; }
    st.buffer = null;
    const aim = this.liveAim(p, st);
    const use = { ...aim, targetId: b.aim.targetId ?? aim.targetId };
    if (b.skillId) {
      const def = SKILLS[b.skillId];
      if (!def) return;
      if (def.behavior === 'combo') { this.tryBasic(p, st, def, use, b.slot); return; }
      if (this.canUse(p, st, def, false)) { st.combo.next = 0; this.startAction(p, st, def, b.slot, use, false, 0); }
    }
  }

  private updateAction(p: Player, st: ActorState, dt: number): void {
    const a = st.cur!;
    if (a.charging) { this.updateCharge(p, st, a); return; }
    // jump attack in the air: nothing happens until the landing (resolveLanding); a safety cut keeps it from hanging
    if (a.airborne) { if (this.now - a.start > 3) this.endAction(st, 'cancel', true); return; }
    const el = this.now - a.start;
    if (a.faceYaw !== null && el <= a.faceUntil && !(p.moveIntent && G.input?.scheme === 'wow' && p.isLocal && !a.def.castTime && !a.def.channel && !a.airborne && a.def.targeting !== 'dash' && a.def.targeting !== 'leap' && a.def.targeting !== 'teleport')) p.yaw = a.faceYaw;
    try { a.beh.frame?.(a.ctx, dt, el); } catch (e) { console.error('[skills] frame failed', a.def.id, e); }
    if (st.cur !== a) return;

    // charged heavy (GDD_V2 §3.2): a basic step still held at its decision point gives way to the charge pose (its hit never lands)
    if (a.basic && a.slot === 'lmb' && !a.fired && this.lmbHeld >= this.chargeAt(a) && this.beginCharge(p, st, a)) return;

    if (!a.fired && el >= a.hitAt) {
      a.fired = true;
      if (!a.paid && !this.pay(p, st, a.def, a)) { this.endAction(st, 'cancel', true); return; }
      try { a.beh.fire(a.ctx); } catch (e) { console.error('[skills] fire failed', a.def.id, e); }
      // WP-07 Kızıl Sınır: the skill's shape against hostile-nation players (no-op outside the PvP zone)
      try { pvp.onFired(a.ctx); } catch (e) { console.error('[skills] pvp failed', a.def.id, e); }
      // kit behaviours that do not apply their own selfStatuses get them here (generic, once per hit)
      if (selfStatusesByDispatch(a.def) && a.def.selfStatuses) this.applySelf(a.ctx, a.def.selfStatuses);
      try { this.specialsOnFire(p, st, a); } catch (e) { console.error('[skills] specials failed', a.def.id, e); }
      this.noteActionToken(p, a);
      if (st.cur !== a) return;
      if (a.def.channel) {
        const p2 = a.def.params ?? {};
        // haste (cast / attack speed factor) shortens the tick interval, like the channel's cast time
        const every = (p2.tick ?? (a.def.duration ?? a.def.channel) / Math.max(1, a.def.ticks ?? 8)) / this.speedFactor(p, a.def);
        a.channel = {
          active: true, until: el + a.def.channel, every, next: el, n: 0, slot: p2.fixed ? null : a.slot, fixed: !!p2.fixed || !a.slot,
          min: a.slot ? 0.4 : 0,
        };
        a.endAt = a.channel.until + 0.3;
        if (a.def.castTime === 0) p.cast = { skillId: a.def.id, name: a.def.name, start: G.world?.time ?? this.now, duration: a.def.channel, channel: true, interruptible: true };
      }
    }

    const ch = a.channel;
    if (ch?.active) {
      let guard = 0;
      while (el >= ch.next && ch.active && guard++ < 4) {
        let ok: boolean | void = true;
        try { ok = a.beh.tick?.(a.ctx, ch.n++); } catch (e) { console.error('[skills] tick failed', a.def.id, e); ok = false; }
        ch.next += ch.every;
        if (ok === false) { ch.active = false; break; }
      }
      const released = !ch.fixed && ch.slot && !(G.input?.down(`skill_${ch.slot}` as 'skill_lmb')) && el - 0 > ch.min;
      if (ch.active && (el >= ch.until || released)) ch.active = false;
      if (!ch.active) {
        this.endAction(st, 'done', false);
        return;
      }
      return;
    }

    if (el >= a.endAt) {
      this.endAction(st, 'done', false);
      return;
    }
    if (st.buffer && el >= a.chainAt) {
      // the buffered press fires at the chain point (cancel recovery)
      const b = st.buffer;
      if (this.now - b.at <= FEEL.inputBuffer) {
        this.endAction(st, 'cancel', true);
        this.runBuffer(p, st);
      } else st.buffer = null;
    }
  }

  /**
   * Finish the current action. `cancel` = true cuts the animation recovery (new action / dodge); a channel runs its `end`
   * behaviour first.
   */
  private endAction(st: ActorState, reason: 'done' | 'cancel' | 'interrupt', cutAnim: boolean): void {
    const a = st.cur;
    if (!a || a.ended) return;
    a.ended = true;
    const p = st.player;
    const ch = a.channel;
    try { a.beh.end?.(a.ctx, reason); } catch (e) { console.error('[skills] end failed', a.def.id, e); }
    if (a.def.channel && a.fired) {
      // a cdFree proc (Beyin Donması) skips the cooldown and the charge of a channel too (pay() does this for other casts)
      // AE-4: an empowered hold released before rank 1 (ctx.data.noCooldown) costs no cooldown
      if (!a.procMods?.cdFree && !a.ctx.data.noCooldown) this.startCooldown(p, st, a.def);
      G.net?.broadcast('cast', { casterId: p.id, skillId: a.def.id, aim: a.aim, end: true });
    }
    if (a.def.castTime > 0 && !a.fired || (a.def.channel && reason === 'interrupt')) {
      G.events.emit('skill:castInterrupted', { casterId: p.id, skillId: a.def.id });
    }
    p.cast = null;
    st.cur = null;
    st.combo.lastEnd = this.now;
    // CONTROLS_WOW §8.2: a finished finisher step opens a short gap for the auto driver (manual LMB ignores it)
    if (reason === 'done' && a.basic && a.def.tags.includes('finisher')) {
      st.autoGapUntil = this.now + AUTO.finisherGap / Math.max(0.4, this.speedFactor(p, a.def));
    }
    if (reason === 'interrupt' || reason === 'cancel' || a.def.channel) this.clearActionMove(p);
    if (ch || cutAnim) {
      try { if (ch || reason !== 'done') p.anim?.cancelOneShot(ch ? 0.12 : 0.08); } catch { /* ignore */ }
    }
    this.restoreProps(p);
    if (reason === 'interrupt') st.buffer = null;
  }

  // ======================================================================================================
  // specials: legendaries / set bonuses / notables bound to casts (see specials.ts)
  // ======================================================================================================

  /** Minimal CastCtx for effects that are not a cast (block waves, phoenix). */
  private specialCtx(p: Player, defId: string): CastCtx {
    const def = SKILLS[defId];
    const st = this.state(p);
    const dir: [number, number] = [Math.sin(p.yaw), Math.cos(p.yaw)];
    return { sys: this, caster: p, def, aim: st.lastAim, dir, remote: false, action: null, target: null, point: [p.position.x, p.position.z], data: {}, more: 1 };
  }

  /** Dağın Kalbi: a blocked hit releases a shockwave and shortens Kalkan Darbesi's cooldown. */
  mountainHeartWave(p: Player, radius: number, coef: number, cdReduce: number): void {
    const c = this.specialCtx(p, 'knight_shield_bash');
    this.broadcastFx(p, 'knight_shield_bash', 'mountain', c.aim, radius);
    shockwave(this, c, { radius, coef, knockback: 1.6, type: 'physical', color: 0xdcd2b8, weight: 'light', shake: 0.14 });
    this.reduceCooldown(p, 'knight_shield_bash', cdReduce);
  }

  /** Anka Omuzluğu: fire explosion around the revived player. */
  phoenixBurst(p: Player, radius: number, coef: number): void {
    const c = this.specialCtx(p, 'mage_meteor');
    this.broadcastFx(p, 'mage_meteor', 'phoenix', c.aim, radius);
    shockwave(this, c, { radius, coef, knockback: 4, type: 'fire', color: 0xff7a30, weight: 'ultimate', vfx: 'fire_burst', shake: 0.5 });
  }

  /** Effects that trigger when a skill / basic attack fires. */
  private specialsOnFire(p: Player, st: ActorState, a: Action): void {
    if (!G.character) return;
    const def = a.def, c = a.ctx;
    switch (def.id) {
      case 'knight_basic_3': {
        const df = sp('leg_dragonfang');
        if (df) fireWave(this, c, { range: df.range ?? 6, coef: df.coef ?? 1.5 });
        break;
      }
      case 'knight_challenge':
        if (hasSp('set_holy_vanguard_4')) { this.resetCooldown(p, 'knight_shield_bash'); this.vfx('buff_aura', [p.position.x, p.position.y + 0.1, p.position.z], { scale: 0.8, duration: 0.8 }); }
        break;
      case 'knight_shield_bash':
        if (hasSp('set_holy_vanguard_4')) {
          shockwave(this, c, { radius: 4, coef: 2, knockback: 1.5, type: 'holy', color: 0xffe9a0, weight: 'heavy', vfx: 'holy_burst', x: p.position.x + c.dir[0] * 1.5, z: p.position.z + c.dir[1] * 1.5 });
        }
        break;
      case 'mage_meteor':
        if (hasSp('set_archmage_legacy_4')) { this.resetCooldown(p, 'mage_blink'); this.vfx('blink', [p.position.x, p.position.y + 1, p.position.z], { scale: 0.7 }); }
        break;
      case 'barbarian_war_cry':
        if (hasSp('set_wolfblood_4')) this.freeWhirlUntil = this.now + 4;
        break;
      case 'rogue_shadow_step': {
        const nh = sp('leg_nightstalker_hood');
        if (nh) p.statuses.apply('stealth', nh.stealthSec ?? 2, { sourceId: p.id });
        break;
      }
      default:
    }
    // Titan Kavrayışı: every 3rd basic hit sends out a shockwave
    if (a.basic && (p.classId === 'knight' || p.classId === 'barbarian')) {
      const tg = sp('leg_titan_grip');
      if (tg && ++st.basicCount % 3 === 0) {
        shockwave(this, c, { radius: tg.radius ?? 3, coef: tg.coef ?? 2, knockback: 3, weight: 'heavy', color: 0xffd9a0 });
        this.broadcastFx(p, def.id, 'titan', a.aim, tg.radius ?? 3);
      }
    }
    this.maybeEcho(p, a);
  }

  /** Yankı (n_spell_echo / Yankılar Kitabı): projectile spells are sometimes cast a second time for free at reduced damage. */
  private maybeEcho(p: Player, a: Action): void {
    const def = a.def;
    if (def.targeting !== 'projectile' || !def.tags.includes('spell') || a.channel || a.ctx.echo) return;
    let chance = 0, mult = 0.7;
    const e1 = sp('n_spell_echo');
    if (e1) { chance = e1.echoChance ?? 0.12; mult = e1.echoDamageMult ?? 0.7; }
    const e2 = def.tags.includes('arcane') ? sp('leg_tome_of_echoes') : null;
    if (e2) chance = combineChance(chance, e2.echoChance ?? 0.2);
    if (chance <= 0 || cosmeticRng.next() >= chance) return;
    const beh = a.beh;
    const ctx = a.ctx;
    this.schedule(0.2, () => {
      if (p.isDead || !G.world) return;
      this.broadcastFx(p, def.id, 'echo', a.aim);
      const c2: CastCtx = { ...ctx, data: {}, more: mult, echo: true, action: null, dir: [Math.sin(p.yaw), Math.cos(p.yaw)] };
      this.vfx('arcane_burst', [p.position.x + c2.dir[0] * 0.9, p.position.y + 1.5, p.position.z + c2.dir[1] * 0.9], { scale: 0.5, color: 0xc8a0ff });
      this.sfx('spell_cast', p.position, { pitch: 1.3, volume: 0.7 });
      try { beh.fire(c2); } catch (e) { console.error('[skills] echo failed', e); }
    });
  }

  // ======================================================================================================
  // ground aiming (preview while the key is held)
  // ======================================================================================================

  private startAim(p: Player, st: ActorState, def: SkillDef, slot: SkillSlotKey): boolean {
    if (!this.canUse(p, st, def, true)) return false;
    const aim = this.liveAim(p, st);
    const [x, z] = this.clampPoint(p, aim.point[0], aim.point[2], def.range);
    let tele: TelegraphHandle | null = null;
    try {
      tele = G.vfx.telegraph({ type: 'circle', radius: def.radius ?? 3 }, [x, 0.05, z], [aim.dir[0], aim.dir[2]], 600, 'friendly');
      tele.setProgress(1);
    } catch { /* vfx not ready */ }
    st.aiming = { slot, def, tele, x, z, startedAt: this.now };
    G.events.emit('skill:aimStart', { skillId: def.id });
    return true;
  }

  private clampPoint(p: Actor, x: number, z: number, range?: number): [number, number] {
    if (!range) return [x, z];
    const dx = x - p.position.x, dz = z - p.position.z;
    const d = Math.hypot(dx, dz);
    if (d <= range) return [x, z];
    return [p.position.x + (dx / d) * range, p.position.z + (dz / d) * range];
  }

  private updateAim(p: Player, st: ActorState): void {
    const ai = st.aiming!;
    const aim = this.liveAim(p, st);
    st.lastAim = aim;
    const [x, z] = this.clampPoint(p, aim.point[0], aim.point[2], ai.def.range);
    ai.x = x; ai.z = z;
    try {
      ai.tele?.setTransform([x, 0.05, z], [aim.dir[0], aim.dir[2]]);
      ai.tele?.setProgress(1);
    } catch { /* ignore */ }
    const act = `skill_${ai.slot}` as 'skill_lmb';
    const cancel = st.dodgeStarted || G.input?.pressed('jump') || p.statuses.stunned;
    if (cancel) { this.endAim(p, st, false); return; }
    // WoW: skill_lmb is unbound, so a left click confirms through Mouse0 directly (Aksiyon: Mouse0 is skill_lmb anyway)
    const confirm = !(G.input?.down(act)) || G.input?.pressed('skill_lmb') || G.input?.keyPressed('Mouse0');
    if (confirm) this.confirmAim(p, st);
  }

  private confirmAim(p: Player, st: ActorState): void {
    const ai = st.aiming;
    if (!ai) return;
    const def = ai.def, slot = ai.slot;
    const aim: AimInfo = { point: [ai.x, 0, ai.z], dir: this.liveAim(p, st).dir, targetId: st.lastAim.targetId };
    this.endAim(p, st, true);
    st.lastAim = aim;
    const cur = st.cur;
    if (cur) {
      if (this.now - cur.start < cur.chainAt) { this.buffer(st, slot, def.id, aim); return; }
      this.endAction(st, 'cancel', true);
    }
    st.combo.next = 0;
    this.startAction(p, st, def, slot, aim, false, 0);
  }

  private endAim(_p: Actor, st: ActorState, cast: boolean): void {
    const ai = st.aiming;
    if (!ai) return;
    try { ai.tele?.cancel(); } catch { /* ignore */ }
    st.aiming = null;
    G.events.emit('skill:aimEnd', { skillId: ai.def.id, cast });
  }

  // ======================================================================================================
  // behaviour API (used by skills/behaviors.ts)
  // ======================================================================================================

  // ======================================================================================================
  // charged heavy / weapon art / riposte / Kritik Vuruş (GDD_V2 §3.2, §3.5, §3.7, §3.8)
  // ======================================================================================================

  private autoCombo(): boolean {
    return !!G.settings?.data.autoCombo;
  }

  /**
   * The charge key is held (F4): the heavyAttack key (Mouse4) always charges. LMB charges only while autoCombo is off, because
   * with autoCombo on holding LMB keeps chaining the light combo.
   */
  private chargeDown(): boolean {
    if (!G.input) return false;
    return G.input.down('heavyAttack') || (!this.autoCombo() && G.input.down('skill_lmb'));
  }

  /**
   * The heavyAttack press (Mouse4 or its keyboard fallback) starts the charge from an idle or cancellable state. PlayerController
   * calls it through its input gates and a short buffer. A finisher or riposte is never cut, and a basic step gives way only once
   * its cancel window (chainAt) is open, so a mashed key cannot cancel a heavy before its hit lands.
   */
  tryHeavyPress(p: Player): boolean {
    const st = this.state(p);
    if (!p.canAct() || st.aiming || st.cur?.charging) return false;
    if (st.cur && (st.cur.uninterruptible || this.now - st.cur.start < st.cur.chainAt)) return false;
    return this.beginCharge(p, st, null);
  }

  /** A heavy charge is held or still running its release: PlayerController keeps LMB presses from cancelling it. */
  isCharging(p: Actor): boolean {
    return !!this.states.get(p.id)?.cur?.charging;
  }

  /** Decision point of a basic step (real seconds after its start): the hold threshold, always before the step's hit frame. */
  private chargeAt(a: Action): number {
    return Math.max(0.1, Math.min(COMBAT_FEEL.chargeThreshold, a.hitAt - 0.04));
  }

  /** Hyper-armour window of a charged release (tier 2): flinch and knockback from small hits do not land (GDD_V2 §3.10). */
  hyperArmorActive(actor: Actor): boolean {
    const a = this.states.get(actor.id)?.cur;
    return !!a && (a.hyperUntil ?? 0) > this.now;
  }

  /**
   * The class heavy starts: the held basic step gives way to the charge pose (LMB with autoCombo off), or heavyAttack (Mouse4)
   * starts it from any press (`_basic` null). The clip plays to its hold frame and freezes there
   * (AnimController eventAt / freezeUntil). The hit comes on release (releaseCharge).
   */
  private beginCharge(p: Player, st: ActorState, _basic: Action | null): boolean {
    const hv = HEAVY_BY_CLASS[p.classId];
    const def = hv ? SKILLS[hv.id] : undefined;
    if (!hv || !def || p.isDead || p.statuses.stunned) return false;
    const aim = this.liveAim(p, st);
    this.endAction(st, 'cancel', false);
    st.combo.next = 0; // a heavy resets the LMB chain
    const c = this.makeCtx(p, def, aim, false);
    const speed = (def.animSpeed ?? 1) * this.speedFactor(p, def);
    const base = behaviorFor(def);
    const beh: Behavior = {
      fire: (cx) => {
        // combo-route token of the release: tier 1 = heavy "H", tier 2 = weapon art "A" (GDD_V2 §3.9)
        if (cx.data.tier === 2) { this.noteRoute(p, 'A', cx.action); this.fireWeaponArt(cx, hv); }
        else { this.noteRoute(p, 'H', cx.action); base.fire(cx); }
      },
      end: (cx, reason) => { if (cx.caster.anim) cx.caster.anim.freezeUntil = 0; base.end?.(cx, reason); },
    };
    const act: Action = {
      def, slot: 'lmb', aim, start: this.now, speed, hitAt: Infinity, endAt: Infinity, chainAt: 0, moveAt: Infinity,
      fired: false, paid: true, basic: false, step: 0, faceYaw: null, faceUntil: 0, uninterruptible: false, channel: null,
      ctx: c, beh, upper: false, ended: false, charging: true, tier: 1,
    };
    c.action = act;
    c.data.tier = 1;
    c.data.holdSec = this.lmbHeld;
    st.cur = act;
    st.buffer = null;
    p.yaw = yawFromDir(c.dir[0], c.dir[1]);
    this.actSlow(p, 1 - COMBAT_FEEL.chargeMoveMul, 60); // charging walks at half speed
    if (p.anim) {
      p.anim.playOnce(def.anim, {
        speed, fade: 0.04, restart: true, eventAt: hv.holdFrame,
        onEvent: () => { if (p.anim) p.anim.freezeUntil = FREEZE_HOLD; },
      });
    }
    try {
      G.vfx.spawn('charge_glow', [p.position.x, p.position.y + 1.1, p.position.z], { follow: p.object3d, scale: 0.7, duration: 1.4 });
    } catch { /* ignore */ }
    feelBeat('charge', { pos: [p.position.x, p.position.y + 1, p.position.z], sfx: 'charge_loop' });
    return true;
  }

  /** While charging: track the hold, announce tier 2 (0.75 s) once, pulse the glow. */
  private updateCharge(p: Player, st: ActorState, a: Action): void {
    if (!this.chargeDown()) { this.releaseCharge(p, st, a); return; }
    a.ctx.data.holdSec = this.lmbHeld;
    const pos: [number, number, number] = [p.position.x, p.position.y + 1, p.position.z];
    if (a.tier !== 2 && this.lmbHeld >= COMBAT_FEEL.chargeTier2) {
      a.tier = 2;
      a.ctx.data.tier = 2;
      feelBeat('charge', { pos, sfx: 'charge_full', vfx: 'charge_ring' });
      try { G.vfx.flash(p.model ?? p.object3d, 0xffd060, 0.08); } catch { /* ignore */ }
    }
    if (this.now >= ((a.ctx.data.pulseAt as number) ?? 0)) {
      a.ctx.data.pulseAt = this.now + 0.3;
      try {
        G.vfx.spawn('charge_glow', [p.position.x, p.position.y + 1.1, p.position.z], { follow: p.object3d, scale: 0.5 + Math.min(1, this.lmbHeld) * 0.6, duration: 0.5 });
      } catch { /* ignore */ }
    }
  }

  /** Button up: the held pose plays on to its impact (tier 1 heavy, tier 2 weapon art with hyper-armour until hit + 0.10 s). */
  private releaseCharge(p: Player, st: ActorState, a: Action): void {
    const hv = HEAVY_BY_CLASS[p.classId];
    if (!hv) { this.endAction(st, 'cancel', true); return; }
    const holdSec = (a.ctx.data.holdSec as number) ?? this.lmbHeld;
    const tier: 1 | 2 = holdSec >= COMBAT_FEEL.chargeTier2 ? 2 : 1;
    a.charging = false;
    a.tier = tier;
    a.ctx.data.tier = tier;
    if (p.anim) p.anim.freezeUntil = 0;
    this.clearActionMove(p);
    const el = this.now - a.start;
    const remaining = Math.max(0.05, (hv.hitTime - hv.holdFrame) / a.speed);
    a.hitAt = el + remaining;
    a.endAt = a.hitAt + Math.max(0.25, (hv.endTime - hv.hitTime) / a.speed);
    a.chainAt = a.hitAt + 0.12;
    a.faceUntil = a.hitAt + 0.15;
    const aim = this.liveAim(p, st);
    const dir: [number, number] = [aim.dir[0], aim.dir[2]];
    a.ctx.dir = dir;
    a.ctx.aim = aim;
    a.faceYaw = yawFromDir(dir[0], dir[1]);
    p.yaw = a.faceYaw;
    if (tier === 2) a.hyperUntil = this.now + remaining + 0.1;
    this.playTrail(p, a.def, Math.max(0, remaining - 0.16));
    this.schedule(Math.max(0, remaining - 0.1), () => this.sfx(tier === 2 ? 'weapon_art' : 'swing_heavy', p.position, { pitchVar: 0.08 }));
    G.combat?.meters.add(tier === 2 ? 'chargeArt' : 'chargeHeavy');
    G.net?.broadcast('cast', {
      casterId: p.id, skillId: a.def.id, aim: { point: aim.point, dir: [dir[0], 0, dir[1]], targetId: aim.targetId },
      sp: tier === 2 ? ['tier2'] : undefined,
    });
  }

  /** Tier-2 release: the class weapon art (`WEAPON_ARTS`) in a wider cone, +30% damage, and Kes (interrupt) on casts in reach. */
  private fireWeaponArt(c: CastCtx, hv: ChargeProfile): void {
    const sys = c.sys;
    const p = c.caster;
    const art = getWeaponArt(this.artIdFor(p, hv.art));
    const artId = art?.id ?? hv.art;
    const range = art?.params.range ?? (c.def.range ?? 3) + 1;
    const arc = art?.params.arc ?? c.def.arc ?? 120;
    const d = c.dir;
    const ax = p.position.x + d[0] * 1.2, az = p.position.z + d[1] * 1.2;
    feelBeat('weaponArt', { pos: [ax, p.position.y + 1, az], sfx: 'weapon_art', vfx: weaponArtVfx(artId), scale: 1.1, dir: [d[0], 0, d[1]] });
    if (c.remote) return;
    const mul = 1.3 * (1 + sys.softStat(p, 'weaponArtPct')); // GDD_V2 §3.8: +30% art damage, scaled by weaponArtPct
    const poise = art?.poise ?? hv.poise;
    if (art?.id === 'wa_starfall_beam' || art?.id === 'wa_piercing_bolt') {
      this.beamHit(c, art, mul); // hitscan lines: Yıldız Işını (staff) and Delici Ok (crossbow / bow)
    } else {
      // art.coef is per strike (Hançer Fırtınası: 6 x 0.7); the single strike here carries the whole art
      const coef = art ? art.coef * (art.params.strikes ?? 1) : hv.coef;
      const maxT = art?.params.bolts ?? 99;
      const hit = new Set<EntityId>();
      let n = 0;
      for (const e of sys.enemiesInCone(p, d, range, arc)) {
        if (n++ >= maxT) break;
        hit.add(e.id);
        sys.strike(c, e, { coef, weight: 'heavy', stagger: poise, more: mul, knockup: 0.8, knockback: 2.2 });
      }
      // Yer Kıran: the impact shockwave around the caster hits the enemies the cone missed
      const sr = art?.params.shockRadius ?? 0;
      if (sr > 0) {
        sys.vfx('ground_slam', [p.position.x, 0.05, p.position.z], { scale: vfxScale('ground_slam', sr * 1.3, 0.35) });
        for (const e of sys.enemiesNear(p.position.x, p.position.z, sr, p.position.y)) {
          if (hit.has(e.id)) continue;
          sys.strike(c, e, { coef: art?.params.shockCoef ?? 1.2, weight: 'heavy', stagger: poise, more: mul, knockback: 1.5 });
        }
      }
    }
    this.kes(p, ax, az, art);
  }

  /** Yıldız Işını (staff): hitscan beam along the cast direction, pierces every enemy inside its width (GDD_V2 §3.8). */
  private beamHit(c: CastCtx, art: WeaponArtDef, mul: number): void {
    const p = c.caster;
    const d = c.dir;
    const range = art.params.range ?? 22;
    const half = (art.params.width ?? 1.2) / 2;
    for (const e of G.world?.enemies ?? []) {
      if (e.isDead || e.removed) continue;
      const dx = e.position.x - p.position.x, dz = e.position.z - p.position.z;
      const along = dx * d[0] + dz * d[1];
      if (along < 0 || along > range + e.radius) continue;
      if (Math.abs(dz * d[0] - dx * d[1]) > half + e.radius) continue;
      this.strike(c, e, { coef: art.coef, weight: 'heavy', stagger: art.poise, more: mul });
    }
  }

  /**
   * Kes (GDD_V2 §3.8): the first interruptible cast in reach is cut ("KESİLDİ!") and the personal kick lockout starts. While the
   * lockout runs, the art still hits but does not interrupt.
   */
  private kes(p: Player, x: number, z: number, art: WeaponArtDef | undefined): void {
    if (!art?.kick || this.kickLeft(p) > 0) return;
    for (const e of this.enemiesNear(x, z, 2.4, p.position.y)) {
      if (!e.cast?.interruptible) continue;
      G.events.emit('kick:request', { enemyId: e.id, casterId: p.id });
      G.combat.onHardCC(e, p.id);
      // CW-07 §2.6: Kes silences trash and elites for 3 s (bosses are cast-cut only)
      if (!e.isBoss) e.statuses.apply('silence', WOW.lockout.silenceSec, { sourceId: p.id });
      G.combat.meters.add('interrupt');
      feelBeat('interrupt', { pos: [e.position.x, e.position.y + 1.2, e.position.z], vfx: 'interrupt_burst' });
      this.startKickLockout(p, art.kickLockout);
      return;
    }
  }

  /** Seconds left of the personal kick lockout (0 = Kes ready). HUD: the kick tracker reads this. */
  kickLeft(p: Actor): number {
    const st = this.states.get(p.id);
    return st ? Math.max(0, st.kickUntil - this.now) : 0;
  }

  private startKickLockout(p: Player, sec: number): void {
    this.state(p).kickUntil = this.now + sec;
    // net 'kick' channel: the others show this player's lockout on the kick tracker (ready = seconds until the next kick)
    G.net?.broadcast('kick', { id: p.id, ready: sec });
  }

  /** Weapon art id for the caster's equipped weapon category (GDD_V2 §3.8); the class art when the category has none. */
  private artIdFor(p: Player, fallback: string): string {
    const weapon = p.currentGear().weapon;
    const cat = weapon ? getItemBase(weapon.baseId)?.category : undefined;
    return (cat && ART_BY_CATEGORY[cat]) || fallback;
  }

  // ------------------------------------------------------------------------------------------------------
  // running / jump / roll attacks (GDD_V2 §3.3) and combo-route tokens (§3.9)
  // ------------------------------------------------------------------------------------------------------

  /** Dev harness (combat page): start a run / jump / roll attack now, skipping its trigger condition. False when the class has none. */
  debugMove(p: Player, kind: MoveKind): boolean {
    const st = this.state(p);
    if (st.cur) this.endAction(st, 'cancel', true);
    return this.startMoveAttack(p, st, kind);
  }

  private isAirborne(p: Player): boolean {
    return p.jumping || p.jumpY > 0.02;
  }

  /**
   * LMB at chain step `idx`: a roll attack (from ROLL_ATTACK_AT into a roll, once per roll), a jump attack (airborne long enough, off
   * cooldown) or a running attack (first step, running long enough) takes the step. False = the chain step goes on as usual.
   */
  private tryMoveAttack(p: Player, st: ActorState, idx: number): boolean {
    const w = G.world;
    if (!w || p.isDead || p.statuses.stunned) return false;
    if (p.dodging) {
      if (w.time - p.dodgeStartedAt < ROLL_ATTACK_AT || st.rollAtkFor === p.dodgeStartedAt) return false;
      st.rollAtkFor = p.dodgeStartedAt;
      return this.startMoveAttack(p, st, 'roll');
    }
    if (this.isAirborne(p)) {
      if (st.airT < JUMP_ATTACK_AIR || this.now < st.jumpReadyAt) return false;
      return this.startMoveAttack(p, st, 'jump');
    }
    // the running attack replaces step 1 only; a chain already past step 1 keeps its own steps
    if (idx === 0 && st.runT >= RUN_ATTACK_SEC) return this.startMoveAttack(p, st, 'run');
    return false;
  }

  /** Starts a run / jump / roll attack of the caster's class (free: no cost, no cooldown except the jump's). */
  private startMoveAttack(p: Player, st: ActorState, kind: MoveKind): boolean {
    const prof: MoveProfile | undefined = MOVE_BY_KIND[kind][p.classId];
    const def = prof ? SKILLS[prof.id] : undefined;
    // free like the chain: no GCD, no cost, no cooldown (the jump's own cooldown is in jumpReadyAt)
    if (!prof || !def) return false;
    // a run goes where the body moves; a roll or jump goes where the body faces (a roll turns the body into its direction)
    let dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
    if (kind === 'run') {
      const l = Math.hypot(p.velocity.x, p.velocity.z);
      if (l > 0.1) { dx = p.velocity.x / l; dz = p.velocity.z / l; }
    }
    const speed = (def.animSpeed ?? 1) * this.speedFactor(p, def);
    const landing = kind === 'jump' && prof.landing !== false;
    const aim: AimInfo = { point: [p.position.x + dx * 3, 0, p.position.z + dz * 3], dir: [dx, 0, dz], targetId: null };
    const c = this.makeCtx(p, def, aim, false);
    const hitAt = landing ? Infinity : prof.hitTime / speed;
    const endAt = landing ? Infinity : Math.max(hitAt + 0.3, prof.endTime / speed);
    const act: Action = {
      def, slot: 'lmb', aim, start: this.now, speed, hitAt, endAt, chainAt: landing ? Infinity : hitAt + 0.1, moveAt: hitAt,
      fired: false, paid: true, basic: false, step: 0, faceYaw: yawFromDir(c.dir[0], c.dir[1]), faceUntil: landing ? 0 : hitAt + 0.15,
      uninterruptible: false, channel: null, ctx: c, beh: moveBehavior(kind, prof), upper: false, ended: false, airborne: landing,
    };
    c.action = act;
    st.cur = act;
    st.buffer = null;
    p.yaw = act.faceYaw ?? p.yaw;
    if (kind === 'run') {
      if (prof.lunge) this.lunge(p, c.dir, prof.lunge, 0.12);
      this.actSlow(p, 0.35, hitAt + 0.1);
      // GDD_V2 §3.11: dust trail + run slash trail on the step-in
      this.vfx('run_slash_trail', [p.position.x, p.position.y + 0.6, p.position.z], { dir: [dx, 0, dz], follow: p.object3d, duration: 0.5 });
      this.vfx('dodge_dust', p.position, { dir: [-dx, 0, -dz], scale: 0.6 });
    }
    if (p.anim) p.anim.playOnce(def.anim, { speed, fade: 0.05, restart: true });
    if (!landing) this.playTrail(p, def, Math.max(0, hitAt - 0.16));
    G.net?.broadcast('cast', { casterId: p.id, skillId: def.id, aim: { point: aim.point, dir: [dx, 0, dz], targetId: null } });
    if (kind === 'run') st.combo.next = prof.nextStep ?? 0;
    else if (kind === 'roll') st.combo.next = prof.nextStep ?? 0;
    else { st.combo.next = 0; st.jumpReadyAt = this.now + JUMP_COOLDOWN; }
    return true;
  }

  /** The jump attack lands: the hit comes on the next frame; +25% when the air time was 0.4 s or more (GDD_V2 §3.3). */
  private resolveLanding(st: ActorState, airT: number): void {
    const a = st.cur;
    if (!a?.airborne) return;
    const el = this.now - a.start;
    a.airborne = false;
    a.hitAt = el + 0.02;
    a.endAt = el + 0.5;
    a.chainAt = el + 0.22;
    a.faceUntil = el + 0.2;
    a.ctx.more = airT >= 0.4 ? 1.25 : 1;
  }

  /** Combo-route token of a fired action: a basic step is "L", a right-button skill "RMB", other keyed skills "S:<id>". Charges, moves and riposte record their own. */
  private noteActionToken(p: Player, a: Action): void {
    if (a.basic && a.slot === 'lmb') this.noteRoute(p, 'L', a);
    else if (a.slot === 'rmb') this.noteRoute(p, 'RMB', a);
    else if (a.slot && a.slot !== 'lmb') this.noteRoute(p, `S:${a.def.id}`, a);
  }

  /**
   * Combo-route token (GDD_V2 §3.9) of the LOCAL player. `a` gives the end of the action's recovery (instant tokens omit it). A
   * completed 'bonus' route: one extra combo tier, +5% damage for 3 s, and the `combo:route` banner. Never throws.
   */
  noteRoute(p: Player, k: string, a?: Action | null): void {
    if (!p.isLocal || !G.combat) return;
    const now = this.now;
    const end = a ? Math.max(now, a.start + a.endAt) : now;
    let r: ComboRouteDef | null = null;
    try { r = this.routes.push(p.classId, k, now, end); } catch { return; }
    if (!r || r.effect !== 'bonus') return;
    G.combat.combo.bumpTier();
    G.combat.grantRouteBuff(3);
    G.events.emit('combo:route', { id: r.id, name: r.name, tier: G.combat.combo.tier });
    this.sfx('charge_full', p.position, { volume: 0.5 });
  }

  /**
   * LMB special, in priority order: Kritik Vuruş on a marked enemy in reach, a riposte while the parry's riposte status runs,
   * then the guard counter (Siper Karşılığı) while the guard stance is up.
   */
  private trySpecialLmb(p: Player, st: ActorState): boolean {
    if (p.isDead || p.statuses.stunned || !G.world) return false;
    const cur = st.cur;
    if (cur && (cur.charging || this.now - cur.start < cur.chainAt)) return false;
    const krt = this.finisherTarget(p);
    if (krt && this.startFinisher(p, st, krt)) return true;
    if (p.statuses.has('riposte')) {
      const t = this.riposteTarget(p, st);
      if (t && this.startRiposte(p, st, t)) return true;
    }
    return this.tryGuardCounter(p, st);
  }

  /** Metres between the player and an enemy's surface (centre distance minus its radius). */
  private gapTo(p: Player, e: Enemy): number {
    return Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) - e.radius;
  }

  /**
   * Riposte target (GDD_V2 §3.5): the enemy this player just parried (1.6 s memory, so an elite that hit us is the target even
   * when a trash mob stands closer), else the locked / aimed enemy, else the nearest enemy in front. Null when nothing is in reach.
   */
  private riposteTarget(p: Player, st: ActorState): Enemy | null {
    const reach = COMBAT_FEEL.riposteRange;
    const ok = (e: Enemy | null | undefined): e is Enemy => !!e && e.kind === 'enemy' && !e.isDead && !e.removed && this.gapTo(p, e) <= reach;
    const parried = G.combat?.parriedEnemy() ?? null;
    if (ok(parried)) return parried;
    const tid = st.lastAim.targetId;
    const aimed = tid != null ? G.world?.get<Enemy>(tid) : undefined;
    if (ok(aimed)) return aimed;
    return this.nearestEnemyInFront(p, reach);
  }

  /** Nearest living enemy within `reach` metres of the surface and inside the player's forward arc (about +-70 deg). */
  private nearestEnemyInFront(p: Player, reach: number, minDot = 0.35): Enemy | null {
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemiesNear(p.position.x, p.position.z, reach + 2.5, p.position.y)) {
      if (e.isDead || e.removed) continue;
      const dx = e.position.x - p.position.x, dz = e.position.z - p.position.z;
      const dist = Math.hypot(dx, dz) || 1e-3;
      const d = dist - e.radius;
      if (d > reach || d >= bd) continue;
      if ((fx * dx + fz * dz) / dist < minDot) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  /**
   * Guard counter (Siper Karşılığı, GDD_V2 §3.4): LMB while the guard stance is up and an enemy is in reach. A quick bash for a
   * little poise, spending GUARD_COUNTER_COST gauge. Without a target in reach the LMB keeps its normal chain.
   */
  private tryGuardCounter(p: Player, st: ActorState): boolean {
    const prof = GUARD_COUNTER_BY_CLASS[p.classId];
    const def = prof ? SKILLS[prof.id] : undefined;
    const combat = G.combat;
    if (!prof || !def || !combat || this.now < st.counterReadyAt) return false;
    if (!combat.isGuarding(p) || combat.guard.gauge <= GUARD_COUNTER_COST) return false;
    const e = this.nearestEnemyInFront(p, prof.range);
    if (!e) return false;
    const dx = e.position.x - p.position.x, dz = e.position.z - p.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const dir: [number, number] = [dx / dist, dz / dist];
    if (!this.startFixed(p, st, def, this.guardCounterBehavior(prof), { hitAt: prof.hitTime, endAt: prof.endTime, dir, target: e, anim: prof.anim, animSpeed: prof.animSpeed })) return false;
    combat.spendGuardGauge(p, GUARD_COUNTER_COST);
    st.counterReadyAt = this.now + GUARD_COUNTER_CD;
    return true;
  }

  private guardCounterBehavior(gp: SwingProfile): Behavior {
    return {
      fire: (c) => {
        const t = c.target;
        if (!t || t.kind !== 'enemy' || c.remote) return;
        c.sys.strike(c, t as Enemy, { coef: gp.coef, weight: 'medium', stagger: gp.poise, knockback: gp.knockback, hitstop: 60, shake: 0.2 });
      },
    };
  }

  /** The nearest marked (poise-broken) enemy this player may still finish (Kritik Vuruş reach). */
  private finisherTarget(p: Player): Enemy | null {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemiesNear(p.position.x, p.position.z, COMBAT_FEEL.krtRange + 2, p.position.y)) {
      if (e.isDead || e.removed || !e.statuses.has('marked_crit') || !G.combat.canFinish(e, p.id)) continue;
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) - e.radius;
      if (d <= COMBAT_FEEL.krtRange && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private startFinisher(p: Player, st: ActorState, e: Enemy): boolean {
    const kp = KRT_BY_CLASS[p.classId];
    const def = kp ? SKILLS[kp.id] : undefined;
    if (!kp || !def) return false;
    const dx = e.position.x - p.position.x, dz = e.position.z - p.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const dir: [number, number] = [dx / dist, dz / dist];
    if (!this.startFixed(p, st, def, this.finisherBehavior(kp), { hitAt: kp.hitTime, endAt: kp.endTime, dir, target: e, anim: kp.anim, animSpeed: kp.animSpeed, uninterruptible: true })) return false;
    p.statuses.apply('invulnerable', COMBAT_FEEL.krtInvuln, { sourceId: p.id });
    const step = Math.min(3, dist - 1.2); // lunge to 1.2 m from the target (GDD_V2 §3.7)
    if (step > 0.1) this.lunge(p, dir, step, 0.15);
    return true;
  }

  private startRiposte(p: Player, st: ActorState, e: Enemy): boolean {
    const rp = RIPOSTE_BY_CLASS[p.classId];
    const def = rp ? SKILLS[rp.id] : undefined;
    if (!rp || !def) return false;
    const dx = e.position.x - p.position.x, dz = e.position.z - p.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const dir: [number, number] = [dx / dist, dz / dist];
    if (!this.startFixed(p, st, def, this.riposteBehavior(rp), { hitAt: rp.hitTime, endAt: rp.endTime, dir, target: e, anim: rp.anim, animSpeed: rp.animSpeed })) return false;
    // the riposte status is spent by riposteBehavior when the strike lands: a windup that is cancelled keeps it for its window.
    // Invulnerability covers the impact frame (a stun cannot land on it: StatusEffects), the knight's 0.35 s was short of its 0.4 s hit
    p.statuses.apply('invulnerable', Math.max(COMBAT_FEEL.riposteInvuln, rp.hitTime + 0.05), { sourceId: p.id });
    G.events.emit('riposte', { targetId: e.id });
    const step = Math.min(2.5, Math.max(0, dist - 1));
    if (step > 0.1) this.lunge(p, dir, step, 0.12);
    return true;
  }

  /** A fixed-timeline action (riposte, Kritik Vuruş): aimed at `target`, rooted until the impact, no cost, no cooldown. */
  private startFixed(p: Player, st: ActorState, def: SkillDef, beh: Behavior, o: { hitAt: number; endAt: number; dir: [number, number]; target: Enemy; anim: string; animSpeed: number; uninterruptible?: boolean }): boolean {
    const aim: AimInfo = { point: [o.target.position.x, 0, o.target.position.z], dir: [o.dir[0], 0, o.dir[1]], targetId: o.target.id };
    const c = this.makeCtx(p, def, aim, false);
    c.dir = o.dir;
    c.target = o.target;
    const speed = o.animSpeed * this.speedFactor(p, def);
    const act: Action = {
      def, slot: 'lmb', aim, start: this.now, speed, hitAt: o.hitAt, endAt: o.endAt, chainAt: o.endAt, moveAt: o.hitAt,
      fired: false, paid: true, basic: false, step: 0, faceYaw: yawFromDir(o.dir[0], o.dir[1]), faceUntil: o.hitAt + 0.15,
      uninterruptible: !!o.uninterruptible, channel: null, ctx: c, beh, upper: false, ended: false,
    };
    c.action = act;
    if (beh.begin && beh.begin(c) === false) return false;
    st.cur = act;
    st.buffer = null;
    p.yaw = act.faceYaw ?? p.yaw;
    this.actRoot(p, o.hitAt);
    if (p.anim) p.anim.playOnce(o.anim, { speed, fade: 0.05, restart: true });
    this.playTrail(p, def, Math.max(0, o.hitAt - 0.16));
    G.net?.broadcast('cast', { casterId: p.id, skillId: def.id, aim: { point: aim.point, dir: aim.dir, targetId: aim.targetId } });
    return true;
  }

  /**
   * Riposte strike: forced crit, the class poise, finisherPct scaling (GDD_V2 §3.5). It spends the `riposte` status and counts
   * the local meter once the strike actually resolves on a living target.
   */
  private riposteBehavior(rp: SwingProfile): Behavior {
    return {
      fire: (c) => {
        const t = c.target;
        if (!t || t.kind !== 'enemy') return;
        c.sys.noteRoute(c.caster, 'RIP', c.action);
        c.sys.sfx('riposte', c.caster.position);
        c.sys.vfx('riposte_trail', [c.caster.position.x + c.dir[0], c.caster.position.y + 1, c.caster.position.z + c.dir[1]], { dir: [c.dir[0], 0, c.dir[1]] });
        if (rp.projectile) {
          behaviorFor(c.def).fire(c);
          if (!c.remote) { c.caster.statuses.remove('riposte'); G.combat?.meters.add('riposte'); }
          return;
        }
        if (c.remote) return;
        const e = t as Enemy;
        if (e.isDead || e.removed) return;
        const res = c.sys.strike(c, e, { coef: rp.coef, forceCrit: true, weight: 'finisher', stagger: rp.poise, knockback: rp.knockback, hitstop: 140, shake: 0.35, more: 1 + Math.max(0, softStat(c.caster, 'finisherPct')) });
        if (!res) return;
        c.caster.statuses.remove('riposte');
        if (res.amount > 0 && !res.immune) G.combat?.meters.add('riposte');
      },
    };
  }

  /** Kritik Vuruş: the big hit (x5 coef, guaranteed crit, +pct max HP capped at 20 x W), then the rewards and the feel. */
  private finisherBehavior(kp: SwingProfile): Behavior {
    return {
      fire: (c) => {
        const t = c.target;
        const p = c.caster;
        if (!t || t.kind !== 'enemy' || t.isDead || t.removed || c.remote) return;
        const e = t as Enemy;
        const W = Math.max(1, (p.getStat('weaponMin') + p.getStat('weaponMax')) / 2 || 4 + p.level * 2);
        const flat = Math.min(finisherPctMaxHp(e.def) * e.maxHp, 20 * W);
        const res = c.sys.strike(c, e, {
          coef: kp.coef, forceCrit: true, flat, weight: 'finisher', stagger: 0, more: 1 + Math.max(0, softStat(p, 'finisherPct')),
          hitstop: 160, shake: 0.55,
        });
        G.combat.markFinisher(e, p.id);
        if (!res) return;
        G.combat.meters.add('finisher');
        G.events.emit('crit:finisher', { targetId: e.id, damage: res.amount });
        const pos: [number, number, number] = [e.position.x, e.position.y + e.height * 0.55, e.position.z];
        c.sys.sfx('crit_finisher', pos);
        c.sys.vfx('crit_finisher_slash', pos, { dir: [c.dir[0], 0, c.dir[1]] });
        c.sys.vfx('bone_burst', pos);
        G.combat.slowmo(0.35, 0.22, 0.3);
        G.events.emit('camera:punch', { fov: -9, in: 0.07, out: 0.45 });
        p.statuses.apply('critbuff', COMBAT_FEEL.krtCritBuff, { sourceId: p.id });
        c.sys.addResource(p, COMBAT_FEEL.krtResource);
        try { G.vfx.flash(e.model ?? e.object3d, 0xffffff, 0.06); } catch { /* ignore */ }
      },
    };
  }

  softStat(a: Actor | null | undefined, key: string): number {
    return softStat(a, key);
  }

  fail(reason: 'cooldown' | 'resource' | 'range' | 'target' | 'stunned' | 'casting' | 'silenced' | 'lockout' | 'moving' | 'facing', remaining?: number): void {
    // the controller re-issues held keys every 0.05 s: only report on the press edge (and for non-key casts)
    if (this.quiet) return;
    G.events.emit('skill:fail', remaining !== undefined ? { reason, remaining } : { reason });
  }

  /** Suppresses skill:fail while a held key is being re-issued. */
  private quiet = false;

  costMult(p: Actor, def?: SkillDef): number {
    const m = 1 - Math.min(0.4, Math.max(0, softStat(p, 'costReductionPct')));
    if (def && def.id === 'barbarian_whirlwind' && p.kind === 'player' && (p as Player).isLocal) {
      if (this.now < this.freeWhirlUntil) return 0; // Kurt Kanı (4)
      const hs = sp('leg_heart_of_storm');
      if (hs) return m * (1 - (hs.costReduce ?? 0.3));
    }
    return m;
  }

  spend(p: Actor, amount: number): boolean {
    if (amount <= 0) return true;
    if (p.resource + 0.01 < amount) return false;
    p.resource = Math.max(0, p.resource - amount);
    return true;
  }

  /** Raw resource change (no multipliers). */
  addResource(p: Actor, amount: number): void {
    if (amount > 0) this.lastResourceGainAt = this.now;
    p.resource = clamp(p.resource + amount, 0, p.maxResource);
  }

  /** Resource gain with generation multipliers (resourceGainPct, Kan Hiddeti). */
  gainResource(p: Actor, amount: number): void {
    let m = 1 + Math.max(0, softStat(p, 'resourceGainPct'));
    if (p.statuses.has('bloodrage')) m += 0.5;
    this.addResource(p, amount * m);
  }

  addCombo(p: Actor, n: number): void {
    const st = this.states.get(p.id);
    if (!st || ((p as Player).classId !== 'rogue' && (p as Player).classId !== 'druid')) return;
    st.cp = Math.min(this.comboCap(p), st.cp + Math.max(0, Math.round(n)));
    st.cpTimer = 0;
    this.emitCp(st);
  }

  /** KIT PK-0 (docs/kits/casters-rogue.md §g / E6): combo point cap per spec. Gölge (rogue_subtlety) = 6, every other spec 5. */
  comboCap(p: Actor): number {
    return specOf(p)?.id === 'rogue_subtlety' ? 6 : 5;
  }

  consumeCombo(p: Actor): number {
    const st = this.states.get(p.id);
    if (!st) return 0;
    const n = st.cp;
    st.cp = 0;
    this.emitCp(st);
    return n;
  }

  private emitCp(st: ActorState): void {
    const max = this.comboCap(st.player);
    G.events.emit('combopoints:changed', { points: st.cp, max });
    G.events.emit('pips:changed', { id: 'combo', points: st.cp, max }); // NC35: combo is a pip like the others
  }

  /** One hit of a skill on one enemy (no-op for remote visuals). */
  strike(c: CastCtx, e: Enemy, o: StrikeOpts = {}): DamageResult | null {
    if (c.remote || !e || e.isDead || e.removed) return null;
    const d = c.def;
    const dm = d.damage;
    // pips spent by this cast add `coefPerPip` each to the default coefficient; mage cast mods: ×frozenMult vs Frozen
    const pipBonus = o.coef === undefined ? (c.data.pipSpent ?? 0) * (d.pip?.coefPerPip ?? 0) : 0;
    const mage = c.data.mage as MageCastMods | undefined;
    // CW-07: a proc's forceCrit applies to the first strike of the cast only
    const pm = c.data.procMods as ResolvedProcMods | undefined;
    const procForce = !!pm?.forceCrit && !c.data.procCritSpent;
    if (procForce) c.data.procCritSpent = true;
    const frozenMul = mage && e.statuses.has('freeze') ? mage.frozenMult : 1;
    const coef = ((o.coef ?? dm?.coef ?? 0) + pipBonus) * frozenMul;
    if (coef <= 0 && !o.flat) return null;
    const pr = d.params ?? {};
    const w = pr.weight;
    const weight: HitWeight = o.tick ? 'tick' : o.weight ?? weightFromParam(w, pr.step, d.tags.includes('basic'), d.targeting === 'projectile');
    const spec: HitSpec = {
      skillId: d.id,
      coef,
      flat: o.flat,
      type: o.type ?? dm?.type ?? 'physical',
      isSpell: d.tags.includes('spell'),
      canCrit: o.canCrit,
      critBonus: (pr.critBonus ?? 0) + (mage?.critBonus ?? 0) + (pm?.critBonus ?? 0),
      statuses: o.tick ? (o.statuses ?? d.statuses) : this.tauntRule(d, e, o.statuses ?? d.statuses),
      knockback: o.knockback ?? (o.tick ? 0 : d.knockback),
      threatMult: o.threatMult ?? pr.threatMult,
      tags: d.tags,
      dir: o.dir ?? this.dirTo(c.caster, e),
      pos: o.pos,
      weight,
      stagger: o.stagger ?? pr.stagger,
      proc: pr.proc,
      tick: o.tick,
      forceCrit: o.forceCrit || procForce,
      more: (o.more ?? 1) * (c.more ?? 1) * (o.tick ? 1 : this.routeStatusMore(d, e)),
      knockup: o.tick ? undefined : o.knockup ?? pr.knockup,
      hitstop: o.hitstop ?? (pr.hitstop || undefined),
      shake: o.shake ?? (pr.shake || undefined),
    };
    if (o.tick && d.tags.includes('melee')) spec.tags = d.tags.filter((t) => t !== 'melee');
    if (o.noHitstop) spec.noHitstop = true;
    const res = G.combat.playerHitEnemy(c.caster, e, spec);
    // KIT PM-BA (Kan Susuzluğu): a landed hit heals the caster `hitHealPct` of max HP
    if (res && !o.tick && pr.hitHealPct && res.amount > 0 && !res.dodged && !res.immune && !res.parried) {
      G.combat.healPlayer(c.caster, c.caster as Player, c.caster.maxHp * pr.hitHealPct, { quiet: true });
    }
    // GDD_LIFE §5.9: finishing a full chain at combo tier >= 2 refunds a share of max resource, once per chain (per cast)
    if (res && pr.finisher && !c.data.comboRefund && G.combat.combo.tier >= 2 && c.caster.maxResource > 0) {
      c.data.comboRefund = true;
      this.addResource(c.caster, c.caster.maxResource * FEEL.comboRefundPct);
    }
    // GDD_TALENTS §4 `shape`: the form of the skill after a landed direct hit (DoT-like ticks never shape)
    if (res && !o.tick && res.amount > 0 && !res.dodged && !res.immune && !res.parried) this.applyShape(c, e);
    // PM-00b (plate-melee §g need 4): a cast carrying a cleave rider (sweeping / meat_cleaver) also strikes nearby enemies
    const rider = c.data.rider as CleaveRider | undefined;
    if (res && rider && !o.tick && !o.noRider && res.amount > 0 && !res.dodged && !res.immune && !res.parried) this.riderCleave(c, e, rider, o);
    return res;
  }

  /**
   * `SkillDef.route` status form (plate-melee.md §7a Kutsal Hüküm: +25 % on a judged target): every '@status:<id>' entry of `route.from`
   * that the struck enemy carries multiplies the hit by `1 + route.more` (once, whatever the number of matching statuses).
   * The skill-to-skill form of `route` (`from` skill ids, `window`) is not read here.
   */
  private routeStatusMore(d: SkillDef, e: Enemy): number {
    const r = d.route;
    if (!r || !r.more) return 1;
    for (const f of r.from) if (f.startsWith('@status:') && e.statuses.has(f.slice(8) as StatusId)) return 1 + r.more;
    return 1;
  }

  /**
   * KIT PM-BA (Kükreyen Balta): a `tauntIcd` skill taunts each enemy at most once per `tauntIcd` seconds, and a boss gets the
   * shorter `bossTaunt` duration. Non-taunt statuses always pass through.
   */
  private tauntRule(d: SkillDef, e: Enemy, statuses: StatusApply[] | undefined): StatusApply[] | undefined {
    const pr = d.params ?? {};
    if (!statuses || !pr.tauntIcd || !statuses.some((s) => s.status === 'taunt')) return statuses;
    const key = `${d.id}:${e.id}`;
    if (this.now < (this.tauntIcdUntil.get(key) ?? -Infinity)) return statuses.filter((s) => s.status !== 'taunt');
    this.tauntIcdUntil.set(key, this.now + pr.tauntIcd);
    if (e.def.rank !== 'boss' || pr.bossTaunt === undefined) return statuses;
    return statuses.map((s) => (s.status === 'taunt' ? { ...s, duration: pr.bossTaunt } : s));
  }

  /** PM-00b: the cleave rider's extra strikes (nearest first, `extraTargets` of them, `extraMult` damage, no hit-stop, no riders). */
  private riderCleave(c: CastCtx, e: Enemy, rider: CleaveRider, o: StrikeOpts): void {
    const w = G.world;
    if (!w) return;
    const near = w.enemiesInRadius({ x: e.position.x, z: e.position.z }, RIDER_RADIUS, e.position.y)
      .filter((x) => x !== e && !x.isDead && !x.removed)
      .sort((a, b) => Math.hypot(a.position.x - e.position.x, a.position.z - e.position.z) - Math.hypot(b.position.x - e.position.x, b.position.z - e.position.z))
      .slice(0, rider.extraTargets);
    for (const x of near) {
      this.strike(c, x, {
        coef: o.coef, flat: o.flat, type: o.type, weight: 'light', knockback: 0, statuses: [], noGain: true, noHitstop: true, noRider: true,
        more: (o.more ?? 1) * rider.extraMult, dir: this.dirTo(c.caster, x),
      });
    }
  }

  /** After a swing/cast: resource gain, combo points, skill impact sound (once). */
  afterHits(c: CastCtx, results: DamageResult[]): void {
    const n = results.length;
    if (!n || c.remote) return;
    const p = c.def.params ?? {};
    if (p.gain) this.gainResource(c.caster, p.gain + Math.min(p.gainMax ?? 0, (p.gainExtra ?? 0) * (n - 1)));
    // PM-00b (plate-melee §g need 11): per enemy hit. Chain steps are multiplied by resourceGainPct, ability gains are flat
    // KIT PM-KN: `gainExtraOnly` counts the hits beyond the first (Arms chain "+1 R per extra target hit", §1a)
    if (p.gainPerTarget) {
      const hits = p.gainExtraOnly ? Math.max(0, n - 1) : n;
      const g = p.gainPerTarget * Math.min(hits, p.gainPerTargetMax ?? hits);
      if (c.def.tags.includes('basic')) this.gainResource(c.caster, g);
      else this.addResource(c.caster, g);
    }
    // KIT PM-KN (Çelik Girdap): a cast that hits enough enemies applies its rider to the caster (sweeping at 3+ targets)
    const oh = c.def.onHitsAtLeast;
    if (oh && results.filter((r) => r.amount > 0).length >= oh.n) this.applySelf(c, [{ status: oh.status, duration: oh.dur }]);
    if (p.cp) this.addCombo(c.caster, p.cp);
    if (c.def.sfx?.impact && !c.data.impactSfx) {
      c.data.impactSfx = true;
      this.sfx(c.def.sfx.impact, c.caster.position);
    }
    // GDD_TALENTS §4.2: a cast that hit at least one enemy earns Ustalık XP (the rule of the caller, see SkillMastery)
    if (c.caster.isLocal && results.some((r) => r.amount > 0)) this.awardMastery(c.def);
  }

  /** Swing connected with nothing: a tiny scrape of feedback. */
  whiff(c: CastCtx): void {
    if (c.remote) return;
    if (c.def.tags.includes('basic')) return;
    G.camera?.shake?.(0.02, 0.08);
  }

  gainFromCost(_c: CastCtx): void { /* resource generation happens in pay() for negative costs */ }
  addStaggerPoints(_c: CastCtx, _list: Enemy[]): void { /* stagger is applied through hits */ }

  statusOnly(c: CastCtx, e: Enemy, statuses: StatusApply[]): void {
    if (c.remote) return;
    G.combat.applyEnemyStatuses(c.caster, e, statuses);
  }

  enemiesNear(x: number, z: number, r: number, y?: number | null): Enemy[] {
    return G.world ? G.world.enemiesInRadius({ x, z }, r, y) : [];
  }

  enemiesInCone(caster: Actor, dir: [number, number], range: number, arc: number): Enemy[] {
    const w = G.world;
    if (!w) return [];
    return w.actorsInCone({ x: caster.position.x, z: caster.position.z }, { x: dir[0], z: dir[1] }, range, arc, (a) => a.team === 'enemy' && !a.isDead, caster.position.y) as unknown as Enemy[];
  }

  dirTo(a: Actor, b: Actor): [number, number] {
    const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  applySelf(c: CastCtx, list: StatusApply[]): void {
    if (c.remote) return;
    for (const s of list) {
      if (s.chance !== undefined && s.chance < 1 && Math.random() > s.chance) continue;
      c.caster.statuses.apply(s.status, s.duration, { stacks: s.stacks, magnitude: s.magnitude, sourceId: c.caster.id });
    }
  }

  applyParty(c: CastCtx, status: StatusId, duration: number, magnitude: number, radius: number): void {
    this.applyPartyAt(c, status, duration, magnitude, c.caster.position.x, c.caster.position.z, radius);
  }

  applyPartyAt(c: CastCtx, status: StatusId, duration: number, magnitude: number, x: number, z: number, radius: number): void {
    if (c.remote) return;
    const w = G.world;
    if (!w) return;
    for (const p of w.players) {
      if (p.isDead) continue;
      if (Math.hypot(p.position.x - x, p.position.z - z) > radius + p.radius) continue;
      if (p.isLocal) p.statuses.apply(status, duration, { magnitude, sourceId: c.caster.id });
      else {
        const peer = G.net?.peerOfEntity(p.id);
        if (peer) G.net.sendTo(peer, 'pstatus', { targetId: p.id, status, duration, magnitude, sourceId: c.caster.id });
      }
    }
  }

  healAlliesIn(c: CastCtx, x: number, z: number, r: number, frac: number): void {
    if (c.remote) return;
    const w = G.world;
    if (!w) return;
    for (const p of w.players) {
      if (p.isDead || Math.hypot(p.position.x - x, p.position.z - z) > r + p.radius) continue;
      G.combat.healPlayer(c.caster, p, p.maxHp * frac, { quiet: true });
    }
  }

  sacrificeHp(c: CastCtx, pct: number): void {
    const p = c.caster;
    const loss = Math.min(p.hp - 1, p.hp * pct);
    if (loss <= 0) return;
    p.hp -= loss;
    this.vfx('hit_blood', [p.position.x, p.position.y + 1.2, p.position.z], { scale: 1.2 });
    G.events.emit('damage', { targetId: p.id, sourceId: p.id, amount: Math.round(loss), crit: false, type: 'true', kind: 'player_hurt', pos: [p.position.x, p.position.y + 2, p.position.z] });
  }

  moveActor(a: Actor, vx: number, vz: number, dur: number): void {
    const t = G.world?.time ?? 0;
    a.forcedMove = { vx, vz, until: t + dur };
    // GDD_LIFE §4.10: dash / charge start kicks the FOV (+5 deg) for the local player
    if ((a as { isLocal?: boolean }).isLocal && Math.hypot(vx, vz) >= 12) G.events.emit('camera:fov', { deg: 5 });
  }

  /**
   * Short eased step-in towards the target (swing start). Moves the position directly instead of using forcedMove so the
   * controller's dodge is never blocked by it (forcedMove vetoes rolls) and steering input keeps working.
   */
  lunge(p: Actor, dir: [number, number], dist: number, dur: number): void {
    let t = 0;
    this.addTask((dt) => {
      const w = G.world;
      if (!w || p.removed || p.isDead || (p as Player).dodging || p.statuses.stunned) return true;
      const t0 = t;
      t = Math.min(dur, t + dt);
      const e0 = 1 - (1 - t0 / dur) * (1 - t0 / dur), e1 = 1 - (1 - t / dur) * (1 - t / dur);
      const d = dist * (e1 - e0);
      p.position.x += dir[0] * d;
      p.position.z += dir[1] * d;
      w.nav.resolveCircle(p.position, p.radius);
      return t >= dur;
    });
  }

  /** Büyücü trait Element Dengesi: a skill of a different element than the previous one grants +15% DAHA FAZLA damage for 5 s. */
  private elementBalance(p: Player, st: ActorState, element: number): void {
    const prev = st.lastElement;
    st.lastElement = element;
    if (!prev || prev === element) return;
    p.statuses.apply('balance', 5, { sourceId: p.id });
    this.vfx('arcane_burst', [p.position.x, p.position.y + 2.3, p.position.z], { scale: 0.45, color: element === 1 ? 0xff8a2a : element === 2 ? 0x7fd8ff : 0xff6bd8 });
  }

  /** Slow the player's steering by `mag` (0..1) for `dur` s through Player.setActionMove (the controller multiplies its speed by it). */
  actSlow(p: Actor, mag: number, dur: number): void {
    if (dur > 0 && p.kind === 'player') (p as Player).setActionMove(clamp(1 - mag, 0, 1), dur);
  }

  actRoot(p: Actor, dur: number): void {
    if (dur > 0 && p.kind === 'player') (p as Player).setActionMove(0, dur);
  }

  private clearActionMove(p: Actor): void {
    if (p.kind === 'player') (p as Player).clearActionMove();
  }

  setShieldWall(p: Player, on: boolean, c: CastCtx): void {
    const st = this.states.get(p.id);
    if (st) st.wall = on ? c : null;
  }

  setBarrier(p: Player, on: boolean, c?: CastCtx): void {
    const st = this.states.get(p.id);
    if (st) st.barrier = on ? c ?? null : null;
  }

  setBanner(p: Player, dur: number): void {
    const st = this.states.get(p.id);
    if (st) st.bannerT = dur;
  }

  /** Play a clip on an actor (safe). */
  playClip(p: Actor, clip: string, o: { speed?: number; fade?: number; loop?: boolean; upper?: boolean } = {}): void {
    try { p.anim?.playOnce(clip, { speed: o.speed ?? 1, fade: o.fade ?? 0.06, loop: o.loop, upperBody: o.upper, restart: true }); } catch { /* ignore */ }
  }

  /** `aimAt`: the enemy the aim assist bent toward (ENGINE_VERTICALITY §12: Projectile.dirY slope, vertical worlds only). */
  fireProjectile(c: CastCtx, dir: [number, number], height: number, aimAt: Actor | null = null): void {
    const { def, caster } = c;
    const pr = def.params ?? {};
    const hand = pr.hand ?? 0;
    const side = hand === 1 ? -0.25 : hand === 0 ? 0.25 : 0;
    const px = caster.position.x + dir[0] * 0.9 + dir[1] * side;
    const pz = caster.position.z + dir[1] * 0.9 - dir[0] * side;
    const speedMul = 1 + Math.max(0, softStat(caster, 'projectileSpeedPct'));
    const pierce = (def.pierce ?? 0) + Math.round(softStat(caster, 'pierce'));
    const explode = pr.explode ?? 0;
    const id = (def.vfx?.projectile as VfxId) ?? 'arcane_projectile';
    Projectile.spawn({
      mode: c.remote ? 'visual' : 'player', owner: caster, vfx: id, scale: def.radius && def.radius > 0.45 ? 1.4 : 1,
      origin: [px, caster.position.y + height, pz], dir, speed: (def.speed ?? 25) * speedMul, radius: def.radius ?? 0.4, range: def.range ?? 25, pierce,
      dirY: aimSlope(caster, caster.position.y + height, aimAt),
      // target_projectile: turns toward the target every frame (turn rate per skill); no target = straight flight
      homing: def.targeting === 'target_projectile' && aimAt && def.homing ? { targetId: aimAt.id, turn: def.homing } : undefined,
      onHit: (e, pr2) => this.projectileHit(c, e, pr2, explode),
      onEnd: (pr2, reason) => this.projectileEnd(c, pr2, reason, explode),
    });
  }

  private projectileHit(c: CastCtx, e: Enemy, pr: Projectile, explode: number): void {
    const dir: [number, number] = [pr.dirX, pr.dirZ];
    if (explode > 0) {
      this.explodeAt(c, pr.position.x, pr.position.z, explode, dir);
      return;
    }
    const r = this.strike(c, e, { dir });
    if (r) {
      this.afterHits(c, [r]);
      if (c.def.vfx?.impact) this.vfx(c.def.vfx.impact, [e.position.x, e.position.y + e.height * 0.55, e.position.z], { dir: [dir[0], 0, dir[1]], color: TYPE_COLORS[c.def.damage?.type ?? 'physical'], scale: isAreaVfx(c.def.vfx.impact) ? (c.def.tags.includes('basic') ? 0.4 : 0.6) : 1 });
    }
  }

  private explodeAt(c: CastCtx, x: number, z: number, radius: number, dir: [number, number]): void {
    const def = c.def;
    this.vfx(def.vfx?.impact ?? 'fire_burst', [x, 0.8, z], { scale: vfxScale(def.vfx?.impact ?? 'fire_burst', radius * 1.1) });
    this.ring(x, z, radius, TYPE_COLORS[def.damage?.type ?? 'fire']);
    this.sfx(def.sfx?.impact ?? 'explosion', [x, 0, z] as unknown as THREE.Vector3);
    this.shake(0.12, 0.2);
    if (c.remote) return;
    const list = this.enemiesNear(x, z, radius, groundAt(x, z));
    const res: DamageResult[] = [];
    for (const e of list) {
      const r = this.strike(c, e, { dir: this.dirFromPoint(x, z, e) ?? dir });
      if (r) res.push(r);
    }
    this.afterHits(c, res);
    if (def.id === 'mage_fireball') this.emberSplit(c, x, z);
  }

  /** Kül Asası: the fireball bursts into small fireballs that fly outwards. */
  private emberSplit(c: CastCtx, x: number, z: number): void {
    const es = sp('leg_ember_staff');
    if (!es) return;
    const n = Math.max(1, Math.round(es.splitCount ?? 3));
    const coef = es.splitCoef ?? 0.4;
    const base = cosmeticRng.next() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * Math.PI * 2;
      const d: [number, number] = [Math.sin(a), Math.cos(a)];
      Projectile.spawn({
        mode: 'player', owner: c.caster, vfx: 'fire_projectile', scale: 0.55, origin: [x + d[0] * 0.7, 1.0, z + d[1] * 0.7], dir: d,
        speed: 17, radius: 0.4, range: 6.5, pierce: 0,
        onHit: (e, pr) => {
          const r = this.strike(c, e, { coef, weight: 'projectile', noGain: true, dir: [pr.dirX, pr.dirZ] });
          if (r) this.vfx('fire_burst', [e.position.x, e.position.y + e.height * 0.5, e.position.z], { scale: 0.5 });
        },
        onEnd: (pr, reason) => { if (reason === 'wall') this.vfx('hit_spark', [pr.position.x, pr.position.y, pr.position.z], { scale: 0.5 }); },
      });
    }
  }

  private dirFromPoint(x: number, z: number, e: Actor): [number, number] | null {
    const dx = e.position.x - x, dz = e.position.z - z;
    const l = Math.hypot(dx, dz);
    return l > 0.05 ? [dx / l, dz / l] : null;
  }

  private projectileEnd(c: CastCtx, pr: Projectile, reason: string, explode: number): void {
    if (reason === 'removed') return;
    const dir: [number, number] = [pr.dirX, pr.dirZ];
    if (reason === 'wall' && explode > 0) { this.explodeAt(c, pr.position.x, pr.position.z, explode, dir); return; }
    if (reason === 'wall') this.vfx('hit_spark', [pr.position.x, pr.position.y, pr.position.z], { scale: 0.6 });
    else if (reason === 'hit' && c.remote) {
      if (explode > 0) this.explodeAt(c, pr.position.x, pr.position.z, explode, dir);
      else if (c.def.vfx?.impact) this.vfx(c.def.vfx.impact, [pr.position.x, pr.position.y, pr.position.z], { dir: [dir[0], 0, dir[1]], scale: isAreaVfx(c.def.vfx.impact) ? 0.5 : 1 });
    }
  }

  /** Ground point under the live reticle (blizzard follow); falls back to the cast point. */
  liveGroundPoint(c: CastCtx): [number, number] {
    const st = this.states.get(c.caster.id);
    if (c.remote || !st) return c.point;
    const a = this.liveAim(c.caster, st);
    const [x, z] = this.clampPoint(c.caster, a.point[0], a.point[2], c.def.range);
    return [x, z];
  }

  // ------------------------------------------------------------------------------------------------------
  // generic effects
  // ------------------------------------------------------------------------------------------------------

  vfx(id: VfxId, pos: THREE.Vector3 | [number, number, number], o?: SpawnVfxOpts): VfxHandle | null {
    try { return G.vfx.spawn(id, pos, o); } catch { return null; }
  }

  sfx(id: SfxId, pos?: THREE.Vector3 | [number, number, number] | null, o?: { volume?: number; pitch?: number; pitchVar?: number }): void {
    try {
      const pp = pos ? (Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z] as [number, number, number]) : undefined;
      G.audio.play(id, { pos: pp, volume: o?.volume, pitch: o?.pitch, pitchVar: o?.pitchVar });
    } catch { /* ignore */ }
  }

  shake(trauma: number, dur = 0.2): void {
    const rs = this.remoteScope;
    if (rs) {
      // another player's cast: only felt when it happens near the local player, and softer
      const lp = G.world?.localPlayer;
      if (!lp) return;
      trauma *= Math.max(0, 1 - Math.hypot(rs.position.x - lp.position.x, rs.position.z - lp.position.z) / 16) * 0.5;
      if (trauma < 0.03) return;
    }
    G.events.emit('camera:shake', { intensity: trauma, duration: dur });
  }

  /**
   * Skill-level hit-stop. Below 110 ms only the local caster freezes (GDD_LIFE §5.4 selective freeze); longer stops and the
   * legacy mode stay global. Never freezes the local game for somebody else's hit.
   */
  hitstopMs(ms: number): void {
    if (this.remoteScope) return;
    if (FEEL.selectiveFreeze && ms < 110) {
      const lp = G.world?.localPlayer ?? G.player;
      if (lp) { freezeActors([lp], ms, 1); return; }
    }
    G.events.emit('hitstop', { ms });
  }

  addZone(z: Zone): void {
    z.n = 0;
    const rs = this.remoteScope;
    if (rs) {
      const ou = z.onUpdate, ot = z.onTick, oe = z.onEnd;
      if (ou) z.onUpdate = (zz, dt) => this.inRemote(rs, () => ou(zz, dt));
      if (ot) z.onTick = (zz, n) => this.inRemote(rs, () => ot(zz, n));
      if (oe) z.onEnd = (zz) => this.inRemote(rs, () => oe(zz));
    }
    this.zones.push(z);
  }

  addTask(fn: (dt: number) => boolean): void {
    const rs = this.remoteScope;
    this.tasks.push(rs ? (dt: number) => this.inRemote(rs, () => fn(dt)) : fn);
  }

  schedule(delay: number, fn: () => void): void {
    const rs = this.remoteScope;
    this.timers.push({ at: this.now + Math.max(0, delay), fn: rs ? () => this.inRemote(rs, fn) : fn });
  }

  /** Expanding ground ring (shockwave look, tinted). */
  ring(x: number, z: number, radius: number, color: number): void {
    const w = G.world;
    if (!w) return;
    if (!ringGeo) {
      ringGeo = new THREE.RingGeometry(0.88, 1, 40);
      ringGeo.rotateX(-Math.PI / 2);
    }
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(ringGeo, mat);
    m.position.set(x, 0.09, z);
    m.scale.setScalar(Math.max(0.2, radius * 0.15));
    m.renderOrder = 5;
    w.scene.add(m);
    let t = 0;
    const dur = 0.4;
    this.addTask((dt) => {
      t += dt;
      const k = Math.min(1, t / dur);
      const e = 1 - (1 - k) * (1 - k);
      m.scale.setScalar(Math.max(0.2, radius * (0.15 + 0.85 * e)));
      mat.opacity = 0.85 * (1 - k);
      if (k >= 1) {
        m.removeFromParent();
        mat.dispose();
        return true;
      }
      return false;
    });
  }

  telegraphFriendly(x: number, z: number, radius: number, dur: number): void {
    try { G.vfx.telegraph({ type: 'circle', radius }, [x, 0.05, z], [0, 1], Math.max(0.05, dur), 'friendly'); } catch { /* ignore */ }
  }

  landingMarker(x: number, z: number, radius: number, dur: number): void {
    this.telegraphFriendly(x, z, radius, dur);
  }

  hideModel(p: Actor, seconds: number): void {
    const m = p.model;
    if (!m) return;
    m.visible = false;
    this.schedule(seconds, () => { m.visible = true; });
  }

  hideModelFor(_p: Actor, _seconds: number, _alpha: number): void { /* death blossom keeps the model visible */ }

  showModel(p: Actor): void {
    if (p.model) p.model.visible = true;
  }

  fogTint(color: number, dur: number): void {
    const f = G.world?.scene.fog;
    if (!f) return;
    if (!this.fogRestore) this.fogRestore = { color: f.color.clone(), until: this.now + dur };
    else this.fogRestore.until = this.now + dur;
    const target = new THREE.Color(color);
    f.color.lerp(target, 0.5);
  }

  private restoreFog(): void {
    const f = G.world?.scene.fog;
    if (f && this.fogRestore) f.color.copy(this.fogRestore.color);
    this.fogRestore = null;
  }

  makeBanner(): THREE.Group {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6), new THREE.MeshLambertMaterial({ color: 0x5a3a20 }));
    pole.position.y = 1.7;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.9, 6, 6), new THREE.MeshBasicMaterial({ color: 0xc9302c, side: THREE.DoubleSide }));
    cloth.name = 'cloth';
    cloth.position.set(0.7, 2.5, 0);
    const trim = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.22), new THREE.MeshBasicMaterial({ color: 0xe8c15a, side: THREE.DoubleSide }));
    trim.position.set(0, -0.82, 0.01);
    cloth.add(trim);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.3, 6), new THREE.MeshBasicMaterial({ color: 0xe8c15a, side: THREE.DoubleSide }));
    emblem.position.set(0, 0.1, 0.01);
    cloth.add(emblem);
    const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xe8c15a }));
    top.position.y = 3.5;
    g.add(pole, cloth, top);
    return g;
  }

  disposeBanner(g: THREE.Object3D): void {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }

  // ------------------------------------------------------------------------------------------------------
  // props (crossbow swap), trails
  // ------------------------------------------------------------------------------------------------------

  private props(p: Player, def: SkillDef): void {
    const pr = def.params ?? {};
    if (p.classId !== 'rogue') return;
    if (pr.crossbow === 1) this.toolNodes(p, ['1H_Crossbow'], 0.85);
    else if (pr.crossbow2 === 1) this.toolNodes(p, ['2H_Crossbow'], 1.1);
    else if (def.id === 'rogue_fan_of_knives' || def.id === 'rogue_vanish') this.toolNodes(p, ['Throwable'], 0.7);
  }

  private tools = new Map<Player, number>();

  /** Temporary tool loadout (crossbow / throwable) through Player.setToolNodes; restored automatically. */
  private toolNodes(p: Player, names: string[], dur: number): void {
    const token = (this.tools.get(p) ?? 0) + 1;
    this.tools.set(p, token);
    try { p.setToolNodes(names); } catch { /* ignore */ }
    this.schedule(dur, () => { if (this.tools.get(p) === token) this.restoreProps(p); });
  }

  private restoreProps(p: Player): void {
    if (!this.tools.has(p)) return;
    this.tools.delete(p);
    try { p.setToolNodes(null); } catch { /* ignore */ }
  }

  private getTips(p: Player): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    try {
      const a = p.getWeaponTip('weapon');
      if (a && a !== p.object3d) out.push(a);
      if (p.classId === 'rogue') {
        const b = p.getWeaponTip('offhand');
        if (b && b !== p.object3d && b !== a) out.push(b);
      }
    } catch { /* ignore */ }
    return out;
  }

  private playTrail(p: Player, def: SkillDef, delay: number): void {
    const color = TYPE_COLORS[def.damage?.type ?? 'physical'];
    const heavy = (def.params?.weight ?? 0) >= 1;
    this.schedule(delay, () => {
      try {
        for (const tip of this.getTips(p)) G.vfx.trail(tip, color, heavy ? 0.42 : 0.32, heavy ? 0.5 : 0.34);
      } catch { /* ignore */ }
    });
  }

  // ------------------------------------------------------------------------------------------------------
  // timers / tasks / zones
  // ------------------------------------------------------------------------------------------------------

  private runTimers(): void {
    if (!this.timers.length) return;
    const due: Timer[] = [];
    this.timers = this.timers.filter((t) => {
      if (t.at <= this.now) { due.push(t); return false; }
      return true;
    });
    due.sort((a, b) => a.at - b.at);
    for (const t of due) {
      try { t.fn(); } catch (e) { console.error('[skills] timer failed', e); }
    }
  }

  private runTasks(dt: number): void {
    if (!this.tasks.length) return;
    this.tasks = this.tasks.filter((fn) => {
      try { return !fn(dt); } catch (e) { console.error('[skills] task failed', e); return false; }
    });
  }

  private runZones(dt: number): void {
    if (!this.zones.length) return;
    this.zones = this.zones.filter((z) => {
      z.t += dt;
      try { z.onUpdate?.(z, dt); } catch (e) { console.error('[skills] zone update failed', e); }
      let guard = 0;
      while (z.t >= z.next && z.next <= z.duration + 1e-6 && guard++ < 6) {
        try { z.onTick?.(z, z.n ?? 0); } catch (e) { console.error('[skills] zone tick failed', e); }
        z.n = (z.n ?? 0) + 1;
        z.next += z.tick;
      }
      if (z.t >= z.duration) {
        try { z.onEnd?.(z); } catch (e) { console.error('[skills] zone end failed', e); }
        return false;
      }
      return true;
    });
  }

  /**
   * KIT PK-0 glow inputs that are not statuses (procs.ts GlowExtras): Ruh Parçası shards (display units), behind the hard
   * target (or behind_grace), dance ready (Gölge Dansı off cooldown) and the target's DoT refresh windows (< 30 % left).
   */
  private glowExtras(): GlowExtras {
    const none: GlowExtras = { shards: 0, behind: false, danceReady: false, dotRefresh: {} };
    const p = this.localPlayer;
    if (!p || p.isDead) return none;
    const w = G.world;
    const t = p.targetId && w ? w.getActor(p.targetId) : undefined;
    const live = t && !t.isDead && t.team === 'enemy' ? t : null;
    const dotRefresh: Partial<Record<string, boolean>> = {};
    let behind = p.statuses.has('behind_grace');
    if (live) {
      behind = behind || isBehind([Math.sin(live.yaw), Math.cos(live.yaw)], [p.position.x - live.position.x, p.position.z - live.position.z]);
      for (const id of REFRESH_DOTS) {
        const s = live.statuses.get(id);
        if (s && s.duration > 0) dotRefresh[id] = s.remaining < 0.3 * s.duration;
      }
    }
    const scale = TALENT_PIPS['shard' as PipId]?.scale ?? 1;
    return {
      shards: Math.floor(this.pipCount(p, 'shard') / scale),
      behind,
      danceReady: this.getCooldown(p, 'rogue_shadow_dance').remaining <= 0,
      dotRefresh,
    };
  }

  /** KIT PK-0 (E4): condition inputs of the watchers, from the local player's selected target. */
  private watcherCtx(p: Player): WatcherCtx {
    const t = p.targetId && G.world ? G.world.getActor(p.targetId) : undefined;
    if (!t || t.isDead || !G.world) return { targetHpPct: null, enemiesNearTarget: 0 };
    const near = G.world.enemiesInRadius({ x: t.position.x, z: t.position.z }, WATCHER_RADIUS, t.position.y);
    return { targetHpPct: t.maxHp > 0 ? t.hp / t.maxHp : null, enemiesNearTarget: near.length };
  }

  private clearAll(): void {
    const lp = this.localPlayer ?? G.player;
    if (lp) this.resetPips(lp); // NC35: pips do not survive a scene change
    this.pipClock.clear();
    this.pipTimers.clear();
    G.procs?.reset();
    this.procWatch.reset();
    this.watchers.reset();
    this.localPlayer = null;
    this.masteryAt.clear();
    for (const st of this.states.values()) {
      try { if (st.aiming) this.endAim(st.player, st, false); } catch { /* ignore */ }
    }
    for (const z of this.zones) { try { z.onEnd?.(z); } catch { /* ignore */ } }
    this.zones.length = 0;
    this.tasks.length = 0;
    this.timers.length = 0;
    for (const pl of [...this.tools.keys()]) this.restoreProps(pl);
    this.states.clear();
    this.remoteChannels.clear();
    this.routes.reset();
    this.restoreFog();
    G.events.emit('combopoints:changed', { points: 0, max: 5 });
    G.events.emit('pips:changed', { id: 'combo', points: 0, max: 5 });
  }
}
