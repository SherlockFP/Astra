import * as THREE from 'three';
import { G } from '../game/G';
import type { HitShapeSpec } from '../combat/HitShapes';
import { hyperArmorOf } from '../combat/poise';
import { clamp, dampAngle, yawFromDir } from '../core/utils';
import { F, VERT } from '../world/Heightfield';
import type { ReachMask } from '../world/NavGrid';
import { getDirector, hooks, isHeavyHit, type EnemyDirector } from './EnemyDirector';
import { bossMsg, bossText } from './bossNet';
import { CUSTOM, PASSIVES, runOnDeath, type CustomHandler, type PassiveHandler } from './abilities';
import { defaultLeashFor, fleesAtLowHp, healBelow, kiteBandFor, spellCastTime } from './trash/roles';
import type { Actor } from '../entities/Actor';
import type { Enemy } from '../entities/Enemy';
import type { Minion } from '../entities/Minion';
import type { Player } from '../entities/Player';
import type { DamageType, EntityId } from '../types/common';
import type { EnemyAbility } from '../types/enemies';
import type { StatusApply } from '../types/skills';
import type { TelegraphKind, TelegraphShape, VfxId } from '../types/vfx';

export type AIMode = 'idle' | 'patrol' | 'chase' | 'return' | 'flee' | 'dormant' | 'waking';

/** The ability currently being wound up / cast / channelled. */
export interface Busy {
  ab: EnemyAbility;
  t0: number;
  /** seconds from t0 until the effect resolves */
  delay: number;
  castTime: number;
  /** seconds from t0 until the enemy may act again */
  total: number;
  /** after this time the enemy stops turning toward its target */
  lockAt: number;
  clip: string | null;
  seq: number;
  impact: number;
  speed: number;
  resolved: boolean;
  channel: number;
  targetId: EntityId | null;
  tx: number; tz: number;
  dx: number; dz: number;
  castId: boolean;
  shapeIds: number[];
  /** scratch space for custom handlers */
  data: Record<string, number | string | boolean | null>;
}

interface Timer { at: number; fn: () => void; tag: string }

export interface ShapeOpts {
  shape: TelegraphShape;
  x: number; z: number;
  dx: number; dz: number;
  delay: number;
  coef?: number;
  damage?: number;
  type?: DamageType;
  statuses?: StatusApply[];
  knockback?: number;
  telegraph?: boolean;
  kind?: TelegraphKind;
  name?: string;
  persist?: HitShapeSpec['persist'];
  projectile?: HitShapeSpec['projectile'];
  /** K10: rotation of the shape in deg/s while pending or persisting (rotating beams). */
  spin?: HitShapeSpec['spin'];
  /** Vertical worlds: height tolerance; 'free' = room-wide mechanic that ignores height (ENGINE_VERTICALITY §12). */
  vert?: HitShapeSpec['vert'];
  follow?: boolean;
  vfxOnLand?: VfxId;
  soak?: boolean;
  y?: number;
  /** Entity the shape belongs to / follows (default: this enemy). Marks that follow a player use the player id. */
  sourceId?: EntityId;
  /** GDD_V2 §3.12: a parryable hit (default: cone swings only; projectiles never). */
  parryable?: boolean;
  /** GDD_V2 §3.12: neither parried nor guarded, dodge only (red flash + glyph during the windup). */
  perilous?: boolean;
}

/** Abilities that count as heavy windups for hyper-armour (GDD_V2 §3.7): big hits, long windups and casts. */
function isHeavyAbility(ab: EnemyAbility): boolean {
  return !!ab.tankBuster || !!ab.perilous || (ab.damage?.coef ?? 0) >= 2.5 || ab.windup >= 0.9 || (ab.castTime ?? 0) >= 1.2;
}

const IMPACT_VFX: Record<DamageType, VfxId> = {
  physical: 'ground_slam', fire: 'fire_burst', frost: 'frost_burst', lightning: 'lightning_strike', shadow: 'shadow_burst',
  poison: 'poison_burst', holy: 'holy_burst', arcane: 'arcane_burst', true: 'shadow_burst',
};
const CAST_SFX: Partial<Record<DamageType, 'fire_cast' | 'frost_cast' | 'shadow_cast' | 'lightning_cast' | 'spell_cast'>> = {
  fire: 'fire_cast', frost: 'frost_cast', shadow: 'shadow_cast', lightning: 'lightning_cast', arcane: 'spell_cast', holy: 'spell_cast', poison: 'spell_cast',
};
const GLOW_COLOR: Record<DamageType, number> = {
  physical: 0xffd8a0, fire: 0xff7a30, frost: 0x80d0ff, lightning: 0xffe040, shadow: 0xa060ff, poison: 0x80ff50, holy: 0xffe8a0, arcane: 0xff70e0, true: 0xff4040,
};

const MAX_MELEE_SLOTS = 6;
/** Idle enemies farther than this (m) from every living player skip perception and steering (see EnemyAI.canSleep). */
const SLEEP_DIST = 45;
/** ENGINE_VERTICALITY §13: a melee/charge unit with no path to its target (other region / unreachable) gives up after this. */
const NOPATH_LEASH = 6;
/** Open-world trash ambient wander: every point stays within this (m) of its camp centre (the camp's members spread up to ~6.6 m from it). */
const CAMP_WANDER_M = 8;
/** Fleeing / wandering run points come from ground the camp can walk to, inside this box (m) around the camp centre (leash + flee reach). */
const CAMP_REACH_M = 90;
/** WoW camp leash: a camp member chases only within its camp radius + this many m of the camp centre; past it the body evades home. */
export const CAMP_LEASH_PAD_M = 20;
/** ENGINE_VERTICALITY §10.2: lastSafe sampling period (s). */
const SAFE_SAMPLE_EVERY = 0.5;
/** Ability kinds a blinded enemy can miss with (mechanic scripts / custom casts are never nullified). */
const MISSABLE = new Set(['melee', 'cone', 'projectile', 'line', 'charge', 'ground_aoe', 'self_aoe']);
const DOT_STATUSES = new Set(['burn', 'bleed', 'poison']);
const _a = new THREE.Vector3();

/**
 * Host-side enemy brain. idle/patrol -> aggro (range + LOS, pack / linked / body pulls) -> threat-based target -> chase
 * (NavGrid paths, separation steering, melee slots) -> abilities (windup anim, telegraph HitShapes landing at the hit frame,
 * interruptible cast bars, ranged kiting, healers, buffers, summoners) -> leash (open world) / reset.
 * Never runs on clients. Every method is exception-safe at the update() boundary.
 * OWNER: enemies module.
 */
export class EnemyAI {
  readonly e: Enemy;
  readonly dir: EnemyDirector;
  mode: AIMode = 'idle';
  target: Actor | null = null;
  aggroed = false;
  slotRank = 0;
  slotDist = 0;
  busy: Busy | null = null;
  disposed = false;
  now = 0;
  readonly threat = new Map<EntityId, number>();
  /** Damage multiplier set by passives (Fanatik, enrage...). */
  dmgMul = 1;
  /** Attack-speed multiplier set by passives (Kızgınlık). */
  atkMul = 1;
  /**
   * Scripted encounter (an escort ambush, WoW scripted aggro): it engages the nearest player at once, ignores the low-level pull cap
   * and the village safe boxes (a wave spawned inside a village still fights; it used to drop its target there and idle).
   */
  scripted = false;
  /** Scripted charge: while it returns a point, the enemy walks to it and holds there (an escort wave that did not die in time). */
  scriptGoal: (() => { x: number; z: number } | null) | null = null;

  /** Per-instance cooldown overrides (boss phases: "cd -> 12 s"). */
  readonly cdOverride = new Map<string, number>();
  protected readyAt = new Map<string, number>();
  protected basicReadyAt = 0;
  protected used = new Set<string>();
  protected timers: Timer[] = [];
  protected abilityList: EnemyAbility[] = [];
  protected passives: { ab: EnemyAbility; h: PassiveHandler; state: Record<string, number> }[] = [];
  protected aggroAt = 0;
  protected scanT = Math.random() * 0.25;
  protected targetT = 0;
  protected reactUntil = 0;
  protected flinchGraceUntil = 0;
  protected lastActEnd = 0;
  protected patrolIdx = 0;
  protected patrolWait = 0;
  protected wanderT = 2 + Math.random() * 5;
  protected path: THREE.Vector3[] | null = null;
  protected pathI = 0;
  protected pathAt = -9;
  protected pathGX = 0;
  protected pathGZ = 0;
  protected los = true;
  protected losAt = -9;
  /** Vertical worlds: hasLos cache (raycastY), separate from the steering walkLine cache above. */
  protected aimLos = true;
  protected aimLosAt = -9;
  protected fleeT = 0;
  protected fleeX = 0;
  protected fleeZ = 0;
  protected backpedal = false;
  protected strafeDir = Math.random() < 0.5 ? -1 : 1;
  protected lastTargetPos = { x: 0, z: 0 };
  /** Sleeping = idle, not aggroed and far from every player (canSleep); re-checked every 0.5 s. */
  protected asleep = false;
  protected sleepCheckAt = 0;
  protected firstAttackUsed = false;
  protected spawnAt = 0;
  protected moveSpeedNow = 0;
  protected returning = false;
  /** A fleeing trash mob that goes home returns at no more than half HP (no full heal on the run home or at the reset). */
  protected fledSinceReturn = false;
  protected wakePending: Actor | null = null;
  protected escapeAt = 0;
  /** When this summoned mob's owner (a metin stone) was first seen gone; -1 while the owner lives. */
  protected orphanAt = -1;
  /** Vertical worlds: when the current target became unreachable (no path, other region); -1 while reachable. */
  protected unreachableSince = -1;
  /** Vertical worlds: next lastSafe sample time. */
  protected safeAt = 0;
  /** Called when any ability of this enemy resolves (champion modifiers: Vampir). */
  readonly onResolveHooks: ((b: Busy) => void)[] = [];
  /** Current basic attack (boss scripts may swap it, e.g. Zakhar's trident -> claw combo). */
  basic: EnemyAbility;
  basicCd: number;
  /** WoW fleeing (humanoids below 20 % HP): runs until fleeUntil, then fights again; fleeAgainAt = next allowed flee. */
  protected fleeing = false;
  protected fleeUntil = 0;
  protected fleeAgainAt = 0;
  /** Stuck check (WoW evade for a body that cannot reach its target): last sample and consecutive stuck samples. */
  protected stuckAt = 0;
  protected stuckX = 0;
  protected stuckZ = 0;
  protected stuckCount = 0;

  constructor(e: Enemy, dir: EnemyDirector) {
    this.e = e;
    this.dir = dir;
    const def = e.def;
    this.abilityList = [];
    this.basic = def.basicAttack;
    this.basicCd = def.attackCooldown;
    for (const ab of def.abilities) {
      if (ab.params?.passive) {
        const h = PASSIVES[ab.id];
        if (h) this.passives.push({ ab, h, state: {} });
      } else if (!ab.params?.onDeath) this.abilityList.push(this.tuned(ab, false));
    }
    const bp = def.basicAttack;
    if (bp.params?.passive) {
      const h = PASSIVES[bp.id];
      if (h) this.passives.push({ ab: bp, h, state: {} });
    }
    this.mode = e.dormant ? 'dormant' : 'idle';
    this.spawnAt = e.world?.time ?? 0;
    dir.register(this);
    for (const p of this.passives) p.h.init?.(this, p.ab, p.state);
    if (def.ai?.stealthReveal || e.packStealth) {
      e.hidden = true;
      e.setAlpha(0.15, true);
    }
  }

  // ===================================================================================================================
  // public helpers (used by abilities.ts and boss scripts)
  // ===================================================================================================================

  get world() {
    return this.e.world!;
  }

  players(): Player[] {
    const out: Player[] = [];
    for (const p of this.world.players) if (!p.isDead && !p.removed) out.push(p);
    return out;
  }

  /** Enemy-team allies (alive, not self) near (x,z). */
  allies(x: number, z: number, r: number, includeSelf = false): Enemy[] {
    const out: Enemy[] = [];
    for (const o of this.world.enemies) {
      if (o.isDead || o.removed || o.team !== 'enemy') continue;
      if (o === this.e && !includeSelf) continue;
      if (Math.hypot(o.position.x - x, o.position.z - z) <= r) out.push(o);
    }
    return out;
  }

  /** Attach an extra passive behaviour (champion modifiers). */
  addPassive(ab: EnemyAbility, h: PassiveHandler): void {
    const state: Record<string, number> = {};
    this.passives.push({ ab, h, state });
    h.init?.(this, ab, state);
  }

  /**
   * This brain's copy of an ability: trash casters and healers get an interruptible cast bar on their spells (trash/roles.ts).
   * The def itself is never changed, so other brains and the data stay as authored.
   */
  protected tuned(ab: EnemyAbility, isBasic: boolean): EnemyAbility {
    const ct = spellCastTime(this.e.def, ab, isBasic);
    return ct > 0 && ct !== ab.castTime ? { ...ab, castTime: ct, interruptible: true } : ab;
  }

  /** Pusu: the next basic attack uses its firstCoef again (Gölge Suikastçısı after the smoke bomb). */
  armAmbush(): void {
    this.firstAttackUsed = false;
  }

  /** Treasure goblin: the escape portal was interrupted, try again later. */
  delayEscape(seconds: number): void {
    this.escapeAt = this.now + seconds;
  }

  protected coefFor(ab: EnemyAbility): number {
    const fc = ab.params?.firstCoef;
    if (fc !== undefined && ab === this.basic && !this.firstAttackUsed) {
      this.firstAttackUsed = true;
      return fc;
    }
    return ab.damage?.coef ?? 0;
  }

  /** Damage of one hit with this coefficient (level, rank, M+ scaling and buffs applied). */
  dmg(coef: number): number {
    const e = this.e;
    return Math.max(0, e.baseDamage * coef * Math.max(0.05, 1 + e.getStat('damagePct')) * e.statuses.dealtMore() * this.dmgMul);
  }

  addThreat(id: EntityId, amount: number): void {
    this.threat.set(id, (this.threat.get(id) ?? 0) + amount);
  }

  /**
   * NC42 (GDD_CLASSES_V2 §1.5.2): a taunting minion jumps to the top of the table, `max(own, top x 1.10) + 100` (the same formula as
   * the `provoke` behaviour). Host only (Combat.applyStatusesToEnemy calls it for a taunt made through a minion).
   */
  tauntThreat(id: EntityId): void {
    if (this.disposed || this.e.isDead) return;
    let top = 0;
    for (const [k, v] of this.threat) if (k !== id && v > top) top = v;
    this.threat.set(id, Math.max(this.threat.get(id) ?? 0, top * 1.1) + 100);
  }

  schedule(delay: number, fn: () => void, tag = ''): void {
    this.timers.push({ at: this.now + delay, fn, tag });
  }

  cancelTimers(tag?: string): void {
    this.timers = tag ? this.timers.filter((t) => t.tag !== tag) : [];
  }

  setCooldown(id: string, seconds: number): void {
    this.readyAt.set(id, this.now + seconds);
  }

  cooldownLeft(id: string): number {
    return Math.max(0, (this.readyAt.get(id) ?? 0) - this.now);
  }

  /** True when a basic-attack style melee enemy should queue for one of the 6 slots around its target. */
  wantsSlot(): boolean {
    const e = this.e;
    return this.aggroed && this.mode === 'chase' && !this.fleeing && !e.def.flying && !kiteBandFor(e.def) && e.def.attackRange < 5 && !e.def.ai?.stationary;
  }

  // ===================================================================================================================
  // shapes
  // ===================================================================================================================

  /** Spawn a HitShape owned by this enemy (host). Applies M+ decoration and fills dot dps. Returns the id (0 on failure). */
  shape(o: ShapeOpts): number {
    const e = this.e;
    try {
      // Körlük: a blinded enemy's swing / shot of this ability goes off (telegraph, animation, projectile) but carries nothing
      const miss = !!this.busy?.data.miss && (o.sourceId === undefined || o.sourceId === e.id);
      const damage = miss ? 0 : o.damage ?? this.dmg(o.coef ?? 0);
      let statuses = miss ? undefined : o.statuses;
      if (statuses?.length) {
        statuses = statuses.map((s) => (DOT_STATUSES.has(s.status) && s.dps === undefined ? { ...s, dps: e.baseDamage * (s.magnitude ?? 0.2) * this.dmgMul } : { ...s }));
      }
      const len = Math.hypot(o.dx, o.dz) || 1;
      let spec: Omit<HitShapeSpec, 'id'> = {
        sourceId: o.sourceId ?? e.id,
        shape: o.shape,
        origin: [o.x, o.y ?? 0.05, o.z],
        dir: [o.dx / len, o.dz / len],
        delay: o.delay,
        damage,
        type: o.type ?? 'physical',
        statuses,
        knockback: miss ? 0 : o.knockback,
        telegraph: o.telegraph ?? false,
        kind: o.kind,
        abilityName: o.name,
        persist: o.persist,
        projectile: o.projectile,
        followSource: o.follow,
        vfxOnLand: o.vfxOnLand,
        soak: o.soak,
        // cones are melee swings (parryable); projectiles, circles and lines are not unless the ability says so
        parryable: o.parryable ?? (!o.projectile && o.shape.type === 'cone'),
        perilous: o.perilous ? true : undefined,
        spin: o.spin,
        vert: o.vert,
      };
      try {
        spec = G.mplus.decorateHitShape(e, spec);
      } catch { /* mythic not ready */ }
      const id = G.hitShapes.spawn(spec);
      if (this.busy && id) this.busy.shapeIds.push(id);
      return id;
    } catch (err) {
      console.error('[ai] shape spawn failed', err);
      return 0;
    }
  }

  /**
   * Elite and miniboss specials (anything but the basic attack, of a melee / area / line / charge kind) are telegraphed: the
   * ground shape shows during the windup and the windup is at least 0.9 s (WoW elite casts you can see and dodge).
   */
  protected eliteSpecial(ab: EnemyAbility): boolean {
    const r = this.e.def.rank;
    if (r !== 'elite' && r !== 'miniboss') return false;
    if (ab === this.basic || ab.params?.passive || ab.params?.onDeath) return false;
    return ab.kind === 'melee' || ab.kind === 'cone' || ab.kind === 'self_aoe' || ab.kind === 'ground_aoe' || ab.kind === 'line' || ab.kind === 'charge';
  }

  /** Shape for an ability whose geometry comes from `ab.shape` (cone/circle/line). */
  protected abilityShape(ab: EnemyAbility, b: Busy, extra: Partial<ShapeOpts> = {}): number {
    const e = this.e;
    const kind = ab.kind;
    let x = e.position.x, z = e.position.z;
    let shape: TelegraphShape = ab.shape ?? { type: 'cone', radius: ab.range, angle: 90 };
    let follow = false;
    if (kind === 'ground_aoe') {
      x = b.tx;
      z = b.tz;
    } else if (kind === 'melee' || kind === 'cone' || kind === 'self_aoe') {
      follow = true;
    }
    if (kind === 'line' || kind === 'charge') {
      shape = ab.shape ?? { type: 'line', length: ab.range, width: 2 };
    }
    const tel = this.eliteSpecial(ab) || (ab.telegraph ?? (kind === 'ground_aoe' || kind === 'line' || kind === 'charge' || kind === 'self_aoe'));
    const type = ab.damage?.type ?? 'physical';
    // GDD_V2 §3.12 flags: melee-style abilities are parryable by default; tank busters and perilous hits never are
    const parryable = ab.tankBuster || ab.perilous ? false : ab.parryable ?? (kind === 'melee' || kind === 'cone' || kind === 'charge');
    return this.shape({
      shape, x, z, dx: b.dx, dz: b.dz, delay: b.delay, coef: this.coefFor(ab), type, statuses: ab.statuses, knockback: ab.knockback,
      telegraph: tel, name: ab.name, follow, vfxOnLand: ab.vfx && !CAST_ONLY.has(ab.vfx) ? ab.vfx : kind === 'melee' || kind === 'cone' ? undefined : IMPACT_VFX[type],
      parryable, perilous: ab.perilous,
      ...extra,
    });
  }

  // ===================================================================================================================
  // lifecycle
  // ===================================================================================================================

  dispose(): void {
    this.disposed = true;
    this.timers.length = 0;
    this.dir.unregister(this);
  }

  /** Combat calls this for every point of damage (host). Threat + wake-ups. */
  onDamaged(sourceId: EntityId | null, amount: number, threatMult = 1, viaId?: EntityId): void {
    if (this.disposed || this.e.isDead || amount <= 0) return;
    const src = sourceId != null ? this.world.getActor(sourceId) : undefined;
    if (src && src.kind === 'player') {
      let mult = 1;
      if ((src as Player).classId === 'knight') mult = 2.5;
      // KIT PM-KN: a skill's threatMult (Revenge x2) scales the whole threat of the hit
      let th = (amount * mult + 1) * threatMult;
      // NC42 (GDD_CLASSES_V2 §1.5.2): a hit made through a minion splits its threat 0.6 owner / 0.4 minion (the minion's own table entry)
      const via = viaId !== undefined ? this.world.get<Minion>(viaId) : undefined;
      if (via && via.kind === 'minion' && !via.isDead && via.ownerId === src.id) {
        this.addThreat(via.id, th * 0.4);
        th *= 0.6;
      }
      // Midnight Tehdit Saptırma (misdirection): while the status is up, the caster's threat is booked on its redirect target (sourceId)
      const mis = (src as Player).statuses.get('misdirection');
      this.addThreat(mis && mis.sourceId != null && mis.sourceId !== src.id ? mis.sourceId : src.id, th);
      if (this.e.def.ai?.flee && !this.e.def.ai.neutral) this.onHurtFlee(amount); // gold piles: treasure goblins only, not deer
      if (!this.aggroed) this.dir.pullPack(this, src, true);
    } else if (!this.aggroed) {
      // a hit from a non-player source (pet, minion, hazard, DoT without a source) pulls only a player inside this mob's own aggro
      // range: an unaware camp never gets pulled across the map (a 60 m pull used to drag the whole camp to the hitter's side)
      const p = this.nearestPlayer(this.e.def.aggroRange);
      if (p) this.dir.pullPack(this, p);
    }
    if (this.e.dormant) this.wake(src ?? null);
    this.revealIfHidden();
    for (const p of this.passives) p.h.onDamaged?.(this, p.ab, p.state, amount);
  }

  /** Called by the director from the damage event (crit flag, skill) after Combat applied the hit. */
  onDamageEvent(d: { sourceId: EntityId | null; amount: number; crit: boolean; skillId?: string }): void {
    const e = this.e;
    if (this.disposed || e.isDead) return;
    // light enemies lose an interruptible cast to heavy hits (finishers, heavy skills, crits)
    const b = this.busy;
    if (b && b.castId && b.ab.interruptible && e.cast && (e.def.rank === 'trash') && isHeavyHit(d, e.maxHp)) this.interrupt('flinch', d.sourceId);
    for (const p of this.passives) p.h.onHp?.(this, p.ab, p.state);
    // runs after Combat applied the hit, so the HP read is the new one
    if (this.aggroed) this.maybeFlee(this.now);
  }

  onAllyDied(dead: Enemy): void {
    if (this.disposed) return;
    for (const p of this.passives) p.h.onAllyDied?.(this, p.ab, p.state, dead);
  }

  runDeathEffects(_killerId: EntityId | null): void {
    for (const ab of this.e.def.abilities) if (ab.params?.onDeath) runOnDeath(this, ab);
    for (const p of this.passives) p.h.onDeath?.(this, p.ab, p.state, _killerId);
  }

  protected revealIfHidden(): void {
    if (this.e.hidden) {
      this.e.hidden = false;
      this.e.setAlpha(1);
      G.vfx.spawn('stealth_smoke', this.e.pointAt(0.4));
    }
  }

  // ===================================================================================================================
  // aggro
  // ===================================================================================================================

  nearestPlayer(maxDist = Infinity): Player | null {
    return this.world.nearest(this.world.players, this.e.position, maxDist, (p) => !p.isDead);
  }

  /** Become hostile toward `target`. `pulled` = came from a pack/link/body pull (no further propagation). `answering` = `target` hit this enemy (WoW: an attacked mob always fights back, the pull cap only stops unprompted aggro). */
  acquire(target: Actor, pulled = false, answering = false): void {
    const e = this.e;
    if (this.disposed || e.isDead || !target) return;
    if (this.aggroed) {
      if (!this.threat.has(target.id)) this.addThreat(target.id, 1);
      return;
    }
    // the low-level pull cap is a hard rule at the one place every engagement passes (hits, sight, summons, respawns, revives)
    if (!answering && !this.scripted && !this.dir.hasRoom(e, target)) return;
    this.aggroed = true;
    e.aggroed = true;
    this.target = target;
    e.targetId = target.id;
    this.addThreat(target.id, 10);
    this.aggroAt = this.now;
    this.reactUntil = this.now + 0.05 + Math.random() * 0.25;
    this.targetT = 0;
    this.mode = 'chase';
    this.path = null;
    if (e.dormant) this.wake(target);
    this.revealIfHidden();
    // cooldowns: non-basic abilities start staggered, "first at" values honoured
    for (const ab of this.abilityList) {
      const first = ab.initialCooldown ?? 0.3 + Math.random() * 1.4;
      this.readyAt.set(ab.id, this.now + first);
    }
    this.basicReadyAt = this.now + 0.25 + Math.random() * 0.5;
    try {
      G.events.emit('enemy:aggro', { enemyId: e.id, targetId: target.id });
      e.aggroSfx();
    } catch { /* ignore */ }
    this.onAcquire(target);
    if (!pulled) this.dir.pullPack(this, target);
  }

  protected onAcquire(_target: Actor): void {}

  /** Custom ability handler lookup (bosses add their script handlers). */
  protected handler(id: string): CustomHandler | undefined {
    return CUSTOM[id];
  }

  /** Stand still for a while (spawn animation, wake-up). */
  holdFor(seconds: number): void {
    this.reactUntil = Math.max(this.reactUntil, this.now + seconds);
  }

  /** Drop aggro (all players dead / left). */
  deaggro(): void {
    this.aggroed = false;
    this.e.aggroed = false;
    this.target = null;
    this.e.targetId = null;
    this.threat.clear();
    this.mode = this.e.patrol ? 'patrol' : 'idle';
    this.path = null;
    this.unreachableSince = -1;
  }

  protected wake(by: Actor | null): void {
    const e = this.e;
    if (!e.dormant) return;
    e.dormant = false;
    this.mode = 'waking';
    this.wakePending = by;
    const a = e.anim;
    let dur = 0.6;
    if (a && a.has('Skeletons_Awaken_Floor')) {
      dur = a.clipDuration('Skeletons_Awaken_Floor') / 2;
      e.playShot('Skeletons_Awaken_Floor', 2, { fade: 0.02 });
    }
    this.reactUntil = this.now + dur;
    try {
      G.vfx.spawn('add_spawn', e.position);
      G.events.emit('camera:shake', { intensity: 0.08, duration: 0.3 });
    } catch { /* ignore */ }
    if (!this.aggroed) {
      const p = by && by.kind === 'player' ? by : this.nearestPlayer(60);
      if (p) this.dir.pullPack(this, p);
    }
  }

  // ===================================================================================================================
  // frame
  // ===================================================================================================================

  update(dt: number): void {
    if (this.disposed) return;
    const e = this.e;
    if (e.isDead || !e.world) return;
    try {
      this.tick(dt);
    } catch (err) {
      console.error(`[ai] ${e.def.id}#${e.id} update failed`, err);
    }
  }

  protected tick(dt: number): void {
    const e = this.e;
    const now = (this.now = e.world!.time);

    // timers
    if (this.timers.length) {
      // scan first: the filters below allocate, and most frames have nothing due
      let anyDue = false;
      for (const t of this.timers) {
        if (t.at <= now) {
          anyDue = true;
          break;
        }
      }
      if (anyDue) {
        const due = this.timers.filter((t) => t.at <= now);
        this.timers = this.timers.filter((t) => t.at > now);
        for (const t of due) t.fn();
      }
    }
    for (const p of this.passives) p.h.tick?.(this, p.ab, p.state, dt);
    this.orphanTick(now);
    if (e.world!.vertical && this.verticalTick(now)) return;

    // statuses that stop the brain
    const st = e.statuses;
    if (st.has('stun') || st.has('freeze') || st.has('knockdown')) {
      if (this.busy) this.abortBusy('cc');
      this.halt(dt);
      return;
    }
    if (e.forcedMove) {
      // a knockback from a player's hit cuts an interruptible cast; the pusher is consumed here (one frame, not stale)
      if (this.busy && this.busy.castId && this.busy.ab.interruptible && !this.busy.resolved) this.interrupt('cc', e.kbBy);
      e.kbBy = null;
      this.halt(dt, true);
      return;
    }

    // falling off a ledge (vertical worlds): no steering or casting until landed
    if (e.airborne) {
      this.halt(dt, true);
      return;
    }

    if (this.mode === 'dormant') {
      this.dormantTick(dt);
      return;
    }
    if (this.mode === 'waking') {
      if (now >= this.reactUntil) {
        this.mode = this.aggroed ? 'chase' : 'idle';
        e.setLocomotion('idle');
      }
      this.halt(dt);
      return;
    }

    // hit-react / external interrupt watchdog
    if (this.busy) this.watchBusy(now);

    if (st.has('fear')) {
      this.fear(dt);
      return;
    }

    // busy: windup / cast / recovery
    if (this.busy) {
      this.tickBusy(dt, now);
      return;
    }

    // staggered by a flinch clip: stand still for the length of the clip
    const a = e.anim;
    if (a && a.isPlayingOneShot && a.oneShotName === e.def.anims.hit) {
      this.halt(dt);
      return;
    }

    // scripted charge (an escort wave that did not die in time): walks to the goal and holds there; contact hurts the escort
    const goal = this.scriptGoal?.();
    if (goal) {
      if (Math.hypot(goal.x - e.position.x, goal.z - e.position.z) > 2.5) this.steerTo(goal.x, goal.z, e.moveSpeed(), dt, 'run');
      else this.halt(dt);
      return;
    }

    // far idle enemies sleep: no perception, no steering (canSleep re-checks the distance every 0.5 s; aggro wakes at once)
    if (this.mode === 'idle' && this.canSleep(now)) return;

    switch (this.mode) {
      case 'idle':
      case 'patrol':
        this.idleTick(dt, now);
        break;
      case 'return':
        this.returnTick(dt, now);
        break;
      case 'flee':
      case 'chase':
        this.combatTick(dt, now);
        break;
    }
  }

  /** Metin wave mobs and adds leave 8 s after their stone is gone (killed, removed or despawned by the idle rule). */
  protected orphanTick(now: number): void {
    const e = this.e;
    if (e.ownerId == null || !e.tag || !e.tag.startsWith('metin_')) return;
    const owner = this.world.get<Enemy>(e.ownerId);
    if (owner && !owner.isDead && !owner.removed) {
      this.orphanAt = -1;
      return;
    }
    if (this.orphanAt < 0) {
      this.orphanAt = now;
      return;
    }
    if (now - this.orphanAt >= 8) e.escape();
  }

  /**
   * Vertical worlds, host only (ENGINE_VERTICALITY §10.2): a trash enemy whose feet are below the kill plane (knocked or
   * walked into a pit) dies; every other enemy on the ground samples lastSafe every 0.5 s. Returns true when the enemy died
   * (the caller stops this tick: death disposes the brain).
   */
  protected verticalTick(now: number): boolean {
    const e = this.e;
    const x = e.position.x, z = e.position.z;
    const killY = this.world.heights?.killY(x, z);
    if (!e.def.flying && killY !== undefined && (e.feetY ?? 0) < killY) {
      // Combat.fallKill: trash dies, elites/rares/champions take 25 % and warp to lastSafe, bosses are skipped
      G.combat.fallKill(e);
      return !e.isDead ? false : true;
    }
    if (!e.airborne && now >= this.safeAt) {
      this.safeAt = now + SAFE_SAMPLE_EVERY;
      if (this.isSafeSpot(x, z)) e.lastSafe = { x, z };
    }
    return false;
  }

  /** Standable and with no VOID/LEDGE cell within SAFE_EDGE_PAD (8 directions). */
  protected isSafeSpot(x: number, z: number): boolean {
    const nav = this.world.nav;
    if (!nav.isStandable(x, z)) return false;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      if (nav.flagsAt(x + Math.cos(a) * VERT.SAFE_EDGE_PAD, z + Math.sin(a) * VERT.SAFE_EDGE_PAD) & (F.VOID | F.LEDGE)) return false;
    }
    return true;
  }

  /**
   * Closest standable cell of the enemy's own region to (x,z), searched within 8 cells of the enemy (ENGINE_VERTICALITY §13
   * hold point for an unreachable target). null when the enemy stands on no region.
   */
  protected closestOwnCell(x: number, z: number): { x: number; z: number } | null {
    const e = this.e;
    const nav = this.world.nav;
    const own = nav.regionAt(e.position.x, e.position.z);
    if (!own) return null;
    const c0 = nav.cx(e.position.x), r0 = nav.cz(e.position.z);
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (let dr = -8; dr <= 8; dr++) {
      for (let dc = -8; dc <= 8; dc++) {
        const wx = nav.centerX(c0 + dc), wz = nav.centerZ(r0 + dr);
        if (!nav.isStandable(wx, wz) || nav.regionAt(wx, wz) !== own) continue;
        const d = Math.hypot(wx - x, wz - z);
        if (d < bestD) {
          bestD = d;
          best = { x: wx, z: wz };
        }
      }
    }
    return best;
  }

  /** Stationary bodies (metin stones) never steer: face the target and hold. */
  protected moveOrHold(dt: number, now: number, target: Actor, dist: number, edge: number): void {
    const e = this.e;
    if (e.def.ai?.stationary) {
      this.faceTo(target.position.x - e.position.x, target.position.z - e.position.z, 6, dt);
      this.halt(dt);
      return;
    }
    this.moveForRole(dt, now, target, dist, edge);
  }

  // ---- sleep----------------------------------------------------------------------------------------------------------

  /**
   * True when this idle enemy can skip its brain this frame: not aggroed, no patrol, not a boss, no ability in progress, and
   * no living player within SLEEP_DIST (or the enemy's own aggro reach, whichever is larger). The distance test runs every
   * 0.5 s; aggro / pack pulls / damage clear `asleep` at once because they flip `aggroed` before this is reached.
   */
  protected canSleep(now: number): boolean {
    const e = this.e;
    if (this.aggroed || e.isBoss || e.patrol || this.busy) {
      this.asleep = false;
      return false;
    }
    if (now < this.sleepCheckAt) return this.asleep;
    this.sleepCheckAt = now + 0.5;
    const r = Math.max(e.def.ai?.sleepRange ?? SLEEP_DIST, (e.def.aggroRange ?? 0) + 8);
    const r2 = r * r;
    let near = false;
    for (const p of this.world.players) {
      if (p.isDead || p.removed) continue;
      const dx = p.position.x - e.position.x, dz = p.position.z - e.position.z;
      if (dx * dx + dz * dz <= r2) {
        near = true;
        break;
      }
    }
    const sleep = !near;
    if (sleep && !this.asleep) {
      // settle into the idle pose once, then nothing moves it
      e.velocity.set(0, 0, 0);
      this.moveSpeedNow = 0;
      this.path = null;
      e.setLocomotion('idle');
    }
    this.asleep = sleep;
    return sleep;
  }

  // ---- idle / patrol ------------------------------------------------------------------------------------------------

  protected idleTick(dt: number, now: number): void {
    const e = this.e;
    const def = e.def;
    // treasure goblin (flee, not neutral): runs off once a player is near. A neutral flee body (deer) is not a goblin: it idles and
    // wanders like any critter, and runs only once hit (onDamaged -> acquire -> combatTick's flee branch)
    if (def.ai?.flee && !def.ai.neutral) return this.fleeIdle(dt, now);
    // perception (throttled)
    this.scanT -= dt;
    // neutral (deer): never picks a fight on sight, only when hit (onDamaged)
    if (this.scanT <= 0 && def.aggroRange > 0 && !def.ai?.summoned && !def.ai?.neutral) {
      this.scanT = 0.2 + Math.random() * 0.1;
      const reveal = def.ai?.stealthReveal ?? (e.packStealth ? 7 : 0);
      const range = reveal > 0 && e.hidden ? reveal : def.aggroRange;
      for (const p of this.world.players) {
        if (p.isDead || p.removed) continue;
        if (this.dir.inSafeZone(p.position.x, p.position.z)) continue;
        const stealthy = p.statuses.has('stealth');
        const r = range * (stealthy ? 0.3 : 1);
        const d = Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z);
        if (d > r) continue;
        if (!def.flying) {
          // vertical: a shot-height ray (low rails do not block) instead of XZ LOS; a player on another level with no clear ray never aggroes
          const nav = this.world.nav;
          const clear = nav.vertical
            ? nav.raycastY(e.position.x, e.position.y + e.height * 0.8, e.position.z, p.position.x, p.position.y + p.height * 0.6, p.position.z) >= 1
            : nav.lineOfSight(e.position.x, e.position.z, p.position.x, p.position.z);
          if (!clear) continue;
        }
        this.dir.pullPack(this, p);
        return;
      }
    }
    if (this.aggroed) return;
    // patrol
    if (e.patrol && e.patrol.length > 1) {
      this.mode = 'patrol';
      if (this.patrolWait > 0) {
        this.patrolWait -= dt;
        this.halt(dt);
        return;
      }
      const wp = e.patrol[this.patrolIdx % e.patrol.length];
      const dx = wp.x - e.position.x, dz = wp.z - e.position.z;
      if (Math.hypot(dx, dz) < 0.8) {
        this.patrolIdx++;
        this.patrolWait = 0.6 + Math.random() * 1.2;
        this.halt(dt);
        return;
      }
      this.steerTo(wp.x, wp.z, e.moveSpeed() * (def.ai?.patrolMul ?? 0.45), dt, 'walk');
      return;
    }
    // open-world ambient wander
    if (def.leashRange && def.leashRange > 0) {
      this.wanderT -= dt;
      if (this.wanderT <= 0 && !this.path) {
        this.wanderT = 4 + Math.random() * 6;
        // a camp member wanders around its camp centre (<= CAMP_WANDER_M); a loose spawn keeps its own 4 m around home
        const reach = this.campReach();
        const onReach = (x: number, z: number): boolean => reach.has(x, z);
        const p = e.campX !== null && e.campZ !== null
          ? this.world.nav.randomNear(e.campX, e.campZ, CAMP_WANDER_M, Math.random, onReach)
          : this.world.nav.randomNear(e.homeX, e.homeZ, 4, Math.random, onReach);
        this.fleeX = p.x;
        this.fleeZ = p.z;
        this.fleeT = 3.5;
      }
      if (this.fleeT > 0) {
        this.fleeT -= dt;
        if (Math.hypot(this.fleeX - e.position.x, this.fleeZ - e.position.z) > 0.6) {
          this.steerTo(this.fleeX, this.fleeZ, e.moveSpeed() * 0.35, dt, 'walk');
          return;
        }
        this.fleeT = 0;
      }
    }
    this.halt(dt);
  }

  protected dormantTick(dt: number): void {
    const e = this.e;
    this.halt(dt);
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.2;
    const wr = e.wakeRange > 0 ? e.wakeRange : e.def.ai?.wakeRange ?? 6;
    for (const p of this.world.players) {
      if (p.isDead) continue;
      if (Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z) <= wr) {
        this.wake(p);
        return;
      }
    }
  }

  // ---- combat -------------------------------------------------------------------------------------------------------

  protected validTarget(a: Actor | null | undefined): a is Actor {
    if (!a || a.isDead || a.removed || a.team !== 'player') return false;
    // safe zones (villages): enemies never pick a player standing inside one (a scripted ambush does)
    if (!this.scripted && this.dir.inSafeZone(a.position.x, a.position.z)) return false;
    return true;
  }

  /** Threat table + taunt + hysteresis. */
  protected pickTarget(now: number): Actor | null {
    const e = this.e;
    const taunt = e.statuses.get('taunt');
    if (taunt?.sourceId != null) {
      const t = this.world.getActor(taunt.sourceId);
      if (this.validTarget(t)) return t;
    }
    let best: Actor | null = null;
    let bestT = -1;
    for (const [id, th] of this.threat) {
      const a = this.world.getActor(id);
      if (!a || a.isDead || a.removed) {
        this.threat.delete(id);
        continue;
      }
      if (!this.validTarget(a)) continue;
      if (a.statuses.has('stealth') && Math.hypot(a.position.x - e.position.x, a.position.z - e.position.z) > 4) continue;
      if (th > bestT) {
        bestT = th;
        best = a;
      }
    }
    const cur = this.target;
    if (this.validTarget(cur) && best && best !== cur) {
      const curT = this.threat.get(cur.id) ?? 0;
      const d = Math.hypot(cur.position.x - e.position.x, cur.position.z - e.position.z);
      const need = d <= e.def.attackRange + 1.5 ? 1.1 : 1.3;
      if (bestT <= curT * need) return cur;
    }
    if (!best) {
      // nothing on the table (everyone stealthed or dead): nearest living player in range keeps us honest
      const p = this.nearestPlayer(e.def.aggroRange * 2.5);
      return p && (this.scripted || !this.dir.inSafeZone(p.position.x, p.position.z)) ? p : null;
    }
    void now;
    return best;
  }

  protected combatTick(dt: number, now: number): void {
    const e = this.e;
    const def = e.def;
    if (def.ai?.flee) {
      // a fleeing mob with a camp leash (deer) runs home once it is pulled out of it, instead of running off across the map
      if (this.pastLeash(def.ai.homeRadius ?? def.leashRange ?? 0)) {
        this.startReturn();
        return;
      }
      return this.fleeCombat(dt, now);
    }
    // retarget
    this.targetT -= dt;
    if (this.targetT <= 0 || !this.validTarget(this.target)) {
      this.targetT = 0.35;
      const t = this.pickTarget(now);
      if (t !== this.target) {
        this.target = t;
        this.path = null;
      }
      e.targetId = t?.id ?? null;
    }
    const target = this.target;
    if (!target) {
      // WoW evade: the fight is over for this mob (its target died, left or hid). It walks home and resets on arrival (full HP,
      // statuses and cooldowns cleared, see evadeReset) instead of standing damaged where it won. Idle bodies just drop aggro.
      if (this.aggroed && !e.isBoss) this.startReturn();
      else this.deaggro();
      this.halt(dt);
      return;
    }
    // open-world leash (pastLeash): a camp member within its camp reach, else ai.homeRadius / leashRange from its spawn; stationary bodies never leash
    const leash = def.ai?.homeRadius ?? def.leashRange ?? defaultLeashFor(def);
    if (!def.ai?.stationary && this.pastLeash(leash)) {
      this.startReturn();
      return;
    }
    // ENGINE_VERTICALITY §13: no route to the target for NOPATH_LEASH seconds and no clear shot => evade / reset home (bosses never leash by height)
    if (this.world.nav.vertical && this.unreachableSince >= 0 && !e.isBoss && now - this.unreachableSince > NOPATH_LEASH && !this.hasLos(target)) {
      this.unreachableSince = -1;
      this.startReturn();
      return;
    }
    const px = e.position.x, pz = e.position.z;
    const tx = target.position.x, tz = target.position.z;
    const dx = tx - px, dz = tz - pz;
    const dist = Math.hypot(dx, dz);
    const edge = dist - target.radius; // distance to the target's edge
    this.lastTargetPos.x = tx;
    this.lastTargetPos.z = tz;

    // WoW fleeing: a humanoid below 20 % HP keeps running for its flee window, then fights again
    if (this.fleeing) {
      if (now < this.fleeUntil) {
        this.fleeCombat(dt, now);
        return;
      }
      this.fleeing = false;
      this.path = null;
    }

    if (now < this.reactUntil) {
      this.faceTo(dx, dz, 14, dt);
      this.halt(dt);
      return;
    }
    if (!e.canAct() || e.statuses.silenced) {
      this.moveOrHold(dt, now, target, dist, edge);
      return;
    }

    const ab = this.chooseAbility(now, target, dist, edge);
    if (ab) {
      this.startAbility(ab, target, dist);
      return;
    }
    if (this.checkStuck(now, edge, target)) return;
    this.moveOrHold(dt, now, target, dist, edge);
  }

  /**
   * Stuck recovery (WoW: a mob that cannot reach its target does not stand in a corner forever). While the enemy wants to close
   * in and has not moved 0.2 m in the last 0.5 s, it repaths after 1.5 s and evades home after 4 s (startReturn: full reset).
   * Waiting for a melee slot, kiting in the sweet spot, and bodies jammed in a crowd or against a player do not count.
   * Returns true when it started the evade.
   */
  protected checkStuck(now: number, edge: number, target: Actor): boolean {
    const e = this.e;
    // a body that cannot move (a metin stone, a totem: stationary or speed 0) cannot be stuck: a player at range is its fight, not a
    // blocked path, and an evade here would reset its HP every few seconds
    if (e.def.ai?.stationary || !(e.def.speed > 0)) return false;
    if (now < this.stuckAt) return false;
    this.stuckAt = now + 0.5;
    const kite = kiteBandFor(e.def);
    const reach = Math.max(1.2, this.basic.range * 0.9);
    let wantsIn = edge > reach && (!kite || edge > kite[1] || !this.hasLos(target)) && this.canAttackMelee();
    // a body jammed in a crowd (allies or a player in the way) is not stuck on the map: it is blocked, and the crowd moves
    if (wantsIn && this.dir.near(e.position.x, e.position.z, 2.5).some((o) => o !== e && !o.isDead)) wantsIn = false;
    if (wantsIn && this.world.players.some((p) => !p.isDead && Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z) < 2.5)) wantsIn = false;
    // position delta, not velocity: a body pressed into a wall keeps its velocity but does not move
    const moved = Math.hypot(e.position.x - this.stuckX, e.position.z - this.stuckZ);
    this.stuckX = e.position.x;
    this.stuckZ = e.position.z;
    if (!wantsIn || moved >= 0.2) {
      this.stuckCount = 0;
      return false;
    }
    this.stuckCount++;
    if (this.stuckCount === 3) this.path = null;
    if (this.stuckCount >= 8) {
      this.stuckCount = 0;
      this.startReturn();
      return true;
    }
    return false;
  }

  /** WoW fleeing mob: a humanoid trash / elite at low HP runs for 7 s and calls the pack within 14 m onto its attacker. */
  protected maybeFlee(now: number): void {
    const e = this.e;
    if (this.fleeing || now < this.fleeAgainAt || !this.target || e.isDead || !fleesAtLowHp(e.def)) return;
    if (e.hpFrac >= 0.2) return;
    this.fleeing = true;
    this.fledSinceReturn = true;
    this.fleeUntil = now + 7;
    this.fleeAgainAt = now + 25;
    this.fleeT = 0;
    this.path = null;
    if (this.busy) this.abortBusy('external');
    this.callForHelp(14);
  }

  // ---- ability selection -------------------------------------------------------------------------------------------

  protected cdReady(ab: EnemyAbility, now: number): boolean {
    return now >= (this.readyAt.get(ab.id) ?? 0);
  }

  protected cdRate(ab: EnemyAbility): number {
    const e = this.e;
    const isCast = (ab.castTime ?? 0) > 0;
    return Math.max(0.4, 1 + e.getStat(isCast ? 'castSpeed' : 'attackSpeed')) * this.atkMul;
  }

  /** Can this special ability be used right now? */
  protected usable(ab: EnemyAbility, now: number, target: Actor, dist: number, edge: number): boolean {
    const e = this.e;
    const p = ab.params ?? {};
    if (!this.cdReady(ab, now)) return false;
    if (p.once && this.used.has(ab.id)) return false;
    const hpf = e.hpFrac;
    if (p.hpBelow !== undefined && hpf >= p.hpBelow) return false;
    if (p.hpAbove !== undefined && hpf <= p.hpAbove) return false;
    if (p.minRange !== undefined && edge < p.minRange) return false;
    const c = this.handler(ab.id);
    if (c?.usable && !c.usable(this, ab, target, dist)) return false;
    switch (ab.kind) {
      case 'heal_ally':
        return this.findHealTarget(ab) !== null;
      case 'buff_ally': {
        if (ab.id === 'cult_summoner_rite' || ab.id.includes('rite')) return this.allies(e.position.x, e.position.z, p.radius ?? 12).some((a) => a.def.id === 'cult_acolyte' && a.aggroed);
        const rad = p.radius ?? 12;
        const allies = this.allies(e.position.x, e.position.z, rad, !!p.self);
        if (p.self) return edge <= 22;
        return allies.length > 0 && allies.some((a) => a.aggroed || a.ai?.aggroed);
      }
      case 'summon': {
        if (edge > ab.range) return false;
        const alive = this.world.enemies.filter((o) => o.ownerId === e.id && !o.isDead).length;
        return alive < 6;
      }
      // P-22 `ranged`: a melee-kind ability fired from range (a reach or a ranged cone) does not take a melee slot
      case 'melee':
      case 'cone':
        return edge <= ab.range * 0.92 && (!!p.ranged || this.canAttackMelee());
      case 'self_aoe':
        return edge <= Math.max(ab.range, 1.5) && (ab.range > 0 ? (!!p.ranged || this.canAttackMelee()) : true);
      case 'projectile':
      case 'line':
      case 'ground_aoe':
      case 'charge':
        if (p.target) return this.players().length > 0;
        if (dist > ab.range + target.radius * 0.5) return false;
        return this.hasLos(target);
      case 'custom':
        return c ? dist <= (ab.range || 60) + target.radius : false;
      default:
        return false;
    }
  }

  protected canAttackMelee(): boolean {
    return this.slotRank < MAX_MELEE_SLOTS;
  }

  protected hasLos(target: Actor): boolean {
    const now = this.now;
    if (this.world.nav.vertical) {
      // vertical: shot-height ray from the head to the target's chest (ENGINE_VERTICALITY §12); kept apart from steering's walkLine cache
      if (now - this.aimLosAt > 0.25) {
        this.aimLosAt = now + Math.random() * 0.05;
        const e = this.e;
        this.aimLos = e.def.flying || this.world.nav.raycastY(e.position.x, e.position.y + e.height * 0.8, e.position.z, target.position.x, target.position.y + target.height * 0.6, target.position.z) >= 1;
      }
      return this.aimLos;
    }
    if (now - this.losAt > 0.25) {
      this.losAt = now + Math.random() * 0.05;
      const e = this.e;
      this.los = this.e.def.flying || this.world.nav.lineOfSight(e.position.x, e.position.z, target.position.x, target.position.z);
    }
    return this.los;
  }

  protected chooseAbility(now: number, target: Actor, dist: number, edge: number): EnemyAbility | null {
    const e = this.e;
    const cands: EnemyAbility[] = [];
    for (const ab of this.abilityList) {
      if (this.usable(ab, now, target, dist, edge)) cands.push(ab);
    }
    if (cands.length) {
      // WoW healer priority: a heal on an ally below 50 % HP goes before any damage spell
      const urgent = cands.find((c) => c.kind === 'heal_ally' && (this.findHealTarget(c)?.hpFrac ?? 1) < 0.5);
      if (urgent) return urgent;
      let total = 0;
      for (const c of cands) total += c.weight ?? 1;
      let r = Math.random() * total;
      for (const c of cands) {
        r -= c.weight ?? 1;
        if (r <= 0) return c;
      }
      return cands[0];
    }
    const basic = this.basic;
    if (basic.params?.passive) return null;
    if (now >= this.basicReadyAt) {
      const reach = basic.range + target.radius * 0.5;
      const isMelee = basic.kind === 'melee' || basic.kind === 'cone' || basic.kind === 'self_aoe';
      if (isMelee) {
        if (dist <= Math.max(reach * 0.95, 1.2) && this.canAttackMelee()) return basic;
      } else if (dist <= basic.range && this.hasLos(target) && edge >= 0) return basic;
    }
    return null;
  }

  // ---- movement for roles -------------------------------------------------------------------------------------------

  protected moveForRole(dt: number, now: number, target: Actor, dist: number, edge: number): void {
    const e = this.e;
    const def = e.def;
    const kite = kiteBandFor(def);
    const speed = e.moveSpeed();
    const px = e.position.x, pz = e.position.z;
    const tx = target.position.x, tz = target.position.z;
    const dx = tx - px, dz = tz - pz;
    this.backpedal = false;
    if (kite) {
      const [kmin, kmax] = kite;
      if (edge < kmin) {
        // back away from the target (keep facing it); sidestep when a wall is behind
        const l = dist || 1;
        let ax = -dx / l, az = -dz / l;
        const probe = 1.4;
        if (!this.world.nav.isWalkable(px + ax * probe, pz + az * probe)) {
          const sx = -az * this.strafeDir, sz = ax * this.strafeDir;
          if (this.world.nav.isWalkable(px + sx * probe, pz + sz * probe)) {
            ax = sx;
            az = sz;
          } else {
            this.strafeDir *= -1;
            ax = 0;
            az = 0;
          }
        }
        if (ax !== 0 || az !== 0) {
          this.faceTo(dx, dz, 14, dt);
          this.backpedal = true;
          this.applyMove(ax, az, speed * 0.85, dt, 'back');
          return;
        }
        this.faceTo(dx, dz, 14, dt);
        this.halt(dt);
        return;
      }
      if (edge <= kmax && this.hasLos(target)) {
        // in the sweet spot: hold, face, gentle strafe
        this.faceTo(dx, dz, 12, dt);
        if (Math.sin(now * 0.8 + e.id) > 0.6) {
          const l = dist || 1;
          this.applyMove((-dz / l) * this.strafeDir, (dx / l) * this.strafeDir, speed * 0.3, dt, 'walk', false);
        } else this.halt(dt);
        return;
      }
      this.steerTo(tx, tz, speed, dt, 'run');
      return;
    }
    // melee-style
    const basicR = this.basic.range;
    const stand = Math.max(e.radius + target.radius + 0.15, basicR * 0.62);
    if (!this.canAttackMelee() && def.attackRange < 5 && !def.flying) {
      // no free slot: wait in a ring around the target (3.5-4.5 m), shuffling slowly
      const ring = 3.6 + (this.slotRank % 3) * 0.55;
      if (dist > ring + 0.8) {
        this.steerTo(tx, tz, speed, dt, 'run');
        return;
      }
      if (dist < ring - 0.7) {
        const l = dist || 1;
        this.faceTo(dx, dz, 10, dt);
        this.applyMove(-dx / l, -dz / l, speed * 0.5, dt, 'back', false);
        return;
      }
      const l = dist || 1;
      this.faceTo(dx, dz, 10, dt);
      this.applyMove((-dz / l) * this.strafeDir, (dx / l) * this.strafeDir, speed * 0.28, dt, 'walk', false);
      return;
    }
    if (dist > stand) this.steerTo(tx, tz, speed, dt, 'run');
    else {
      this.faceTo(dx, dz, 14, dt);
      this.halt(dt);
    }
  }

  // ---- steering -----------------------------------------------------------------------------------------------------

  /** Follow a nav path toward (x,z) and move. */
  protected steerTo(x: number, z: number, speed: number, dt: number, anim: 'walk' | 'run'): void {
    const e = this.e;
    const px = e.position.x, pz = e.position.z;
    const nav = this.world.nav;
    const now = this.now;
    let gx = x, gz = z;
    if (!e.def.flying) {
      if (now - this.losAt > 0.2) {
        this.losAt = now + Math.random() * 0.05;
        // vertical: walkLine also refuses cliffs, VOID and ledges between us and the goal (ENGINE_VERTICALITY §5.2)
        this.los = nav.vertical ? nav.walkLine(px, pz, x, z) : nav.lineOfSight(px, pz, x, z);
      }
      if (!this.los) {
        const stale = !this.path || now - this.pathAt > 0.55 || Math.hypot(this.pathGX - x, this.pathGZ - z) > 2.5;
        if (stale && this.dir.pathBudget > 0) {
          this.dir.pathBudget--;
          const from = { x: px, z: pz };
          const direct = nav.findPath(from, { x, z });
          if (nav.vertical && !direct) {
            // unreachable (other region, no route): hold at the closest own-region cell and start the NOPATH clock (§13)
            if (this.unreachableSince < 0) this.unreachableSince = now;
            const hold = this.closestOwnCell(x, z);
            this.path = hold ? nav.findPath(from, hold) : null;
          } else {
            this.path = direct;
            if (nav.vertical) this.unreachableSince = -1;
          }
          this.pathI = 0;
          this.pathAt = now;
          this.pathGX = x;
          this.pathGZ = z;
        }
        if (this.path && this.pathI < this.path.length) {
          let wp = this.path[this.pathI];
          while (Math.hypot(wp.x - px, wp.z - pz) < 0.7 && this.pathI < this.path.length - 1) wp = this.path[++this.pathI];
          gx = wp.x;
          gz = wp.z;
        }
        // vertical: never walk straight at a goal with no route (it would press into a cliff); hold instead
        if (nav.vertical && !this.path) {
          this.halt(dt);
          return;
        }
      } else this.path = null;
    }
    const dx = gx - px, dz = gz - pz;
    const l = Math.hypot(dx, dz);
    if (l < 0.05 || (nav.vertical && !this.los && l < 0.35)) {
      this.halt(dt);
      return;
    }
    this.applyMove(dx / l, dz / l, speed, dt, anim);
  }

  /** Integrate movement with separation steering, collision and locomotion animation. */
  protected applyMove(dirx: number, dirz: number, speed: number, dt: number, anim: 'walk' | 'run' | 'back', faceMove = true): void {
    const e = this.e;
    if (!e.canMove() || e.def.speed <= 0) {
      this.halt(dt);
      return;
    }
    let vx = dirx * speed, vz = dirz * speed;
    // separation from neighbours + players
    const near = this.dir.near(e.position.x, e.position.z, e.radius + 1.6);
    let sx = 0, sz = 0;
    let n = 0;
    for (let i = 0; i < near.length && n < 8; i++) {
      const o = near[i];
      if (o === e) continue;
      if (!!o.def.flying !== !!e.def.flying && Math.abs(o.hover - e.hover) > 1) continue;
      const ox = e.position.x - o.position.x, oz = e.position.z - o.position.z;
      const d = Math.hypot(ox, oz);
      const min = (e.radius + o.radius) * 0.92 + 0.12;
      if (d >= min) continue;
      const k = (min - d) / min;
      if (d < 0.001) {
        sx += (Math.random() - 0.5) * 2;
        sz += (Math.random() - 0.5) * 2;
      } else {
        sx += (ox / d) * k;
        sz += (oz / d) * k;
      }
      n++;
    }
    for (const p of this.world.players) {
      if (p.isDead) continue;
      const ox = e.position.x - p.position.x, oz = e.position.z - p.position.z;
      const d = Math.hypot(ox, oz);
      const min = e.radius + p.radius * 0.8;
      if (d < min && d > 0.001) {
        sx += (ox / d) * ((min - d) / min) * 1.3;
        sz += (oz / d) * ((min - d) / min) * 1.3;
      }
    }
    const sl = Math.hypot(sx, sz);
    if (sl > 0) {
      const f = Math.min(1, sl) * speed * 1.5;
      vx += (sx / sl) * f;
      vz += (sz / sl) * f;
    }
    const vl = Math.hypot(vx, vz);
    const cap = speed * 1.35;
    if (vl > cap) {
      vx = (vx / vl) * cap;
      vz = (vz / vl) * cap;
    }
    // acceleration (snappy, but not instant)
    const k = 1 - Math.exp(-16 * dt);
    e.velocity.x += (vx - e.velocity.x) * k;
    e.velocity.z += (vz - e.velocity.z) * k;
    const prevX = e.position.x, prevZ = e.position.z;
    e.position.x += e.velocity.x * dt;
    e.position.z += e.velocity.z * dt;
    this.world.nav.resolveMove(e.position, prevX, prevZ, e.radius, e.moveBaseY());
    const sp = Math.hypot(e.velocity.x, e.velocity.z);
    this.moveSpeedNow = sp;
    if (faceMove && sp > 0.3) {
      e.yaw = dampAngle(e.yaw, yawFromDir(e.velocity.x, e.velocity.z), 14, dt);
    }
    e.setLocomotion(sp > 0.35 ? anim : 'idle', sp);
  }

  /** Stand still (damp velocity). `hold` keeps the current animation (forced movement). */
  protected halt(dt: number, hold = false): void {
    const e = this.e;
    const k = 1 - Math.exp(-18 * dt);
    e.velocity.x -= e.velocity.x * k;
    e.velocity.z -= e.velocity.z * k;
    this.moveSpeedNow = Math.hypot(e.velocity.x, e.velocity.z);
    if (!hold) {
      if (this.moveSpeedNow < 0.3) e.setLocomotion('idle');
    }
  }

  faceTo(dx: number, dz: number, lambda: number, dt: number): void {
    if (dx * dx + dz * dz < 1e-6) return;
    this.e.yaw = dampAngle(this.e.yaw, yawFromDir(dx, dz), lambda, dt);
  }

  protected fear(dt: number): void {
    const e = this.e;
    const src = e.statuses.get('fear')?.sourceId;
    const a = src != null ? this.world.getActor(src) : this.target;
    let ax = Math.sin(e.yaw + Math.PI), az = Math.cos(e.yaw + Math.PI);
    if (a) {
      const dx = e.position.x - a.position.x, dz = e.position.z - a.position.z;
      const l = Math.hypot(dx, dz) || 1;
      ax = dx / l;
      az = dz / l;
    }
    this.applyMove(ax, az, e.moveSpeed() * 0.9, dt, 'run');
  }

  // ---- leash / return -----------------------------------------------------------------------------------------------

  /**
   * True when the body is past its leash (WoW: a chase ends at the leash, the body evades home). A camp member is leashed to its
   * camp: its camp centre + camp radius + CAMP_LEASH_PAD_M (it never walks out of the camp to a fight across the map). Any other
   * body is leashed `leash` m from its spawn point. `leash` <= 0 = no leash.
   */
  protected pastLeash(leash: number): boolean {
    if (!(leash > 0)) return false;
    const e = this.e;
    if (e.campX !== null && e.campZ !== null && e.campR > 0) return Math.hypot(e.position.x - e.campX, e.position.z - e.campZ) > e.campR + CAMP_LEASH_PAD_M;
    return Math.hypot(e.position.x - e.homeX, e.position.z - e.homeZ) > leash;
  }

  /** Ground the camp can walk to: the mask that flee and wander run points are drawn from (anchor: camp centre, else spawn). */
  protected campReach(): ReachMask {
    const e = this.e;
    return this.world.nav.reachFrom(e.campX ?? e.homeX, e.campZ ?? e.homeZ, CAMP_REACH_M);
  }

  protected startReturn(): void {
    const e = this.e;
    // WoW evade: the cast in progress is dropped at once, the body walks home
    if (this.busy) this.abortBusy('external');
    this.mode = 'return';
    this.returning = true;
    this.aggroed = false;
    this.fleeing = false;
    this.stuckCount = 0;
    e.aggroed = false;
    this.target = null;
    e.targetId = null;
    this.threat.clear();
    this.path = null;
    e.statuses.apply('invulnerable', 30, { sourceId: e.id });
  }

  /**
   * WoW evade reset, on arrival home: full HP, every DoT / debuff / buff gone, all cooldowns and pending timers cleared, and
   * the next pull starts from a clean brain. Bosses keep their statuses and timers (their scripts own them); they only get the
   * HP restore the leash always gave.
   */
  protected evadeReset(): void {
    const e = this.e;
    e.hp = this.fledSinceReturn ? Math.max(e.hp, e.maxHp * 0.5) : e.maxHp;
    this.fledSinceReturn = false;
    e.cast = null;
    if (!e.isBoss) {
      e.statuses.clear();
      this.readyAt.clear();
      this.basicReadyAt = this.now + 1;
      this.timers = [];
      this.threat.clear();
    }
    e.statuses.remove('invulnerable');
    this.fleeing = false;
    this.stuckCount = 0;
    this.path = null;
  }

  protected returnTick(dt: number, _now: number): void {
    const e = this.e;
    const dx = e.homeX - e.position.x, dz = e.homeZ - e.position.z;
    if (Math.hypot(dx, dz) < 1.0) {
      this.evadeReset();
      this.returning = false;
      this.mode = 'idle';
      this.halt(dt);
      return;
    }
    // heal while running home
    if (!this.fledSinceReturn) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25 * dt);
    this.steerTo(e.homeX, e.homeZ, e.moveSpeed() * 1.15, dt, 'run');
  }

  // ---- treasure goblin / fleeing -----------------------------------------------------------------------------------

  protected fleeIdle(dt: number, now: number): void {
    const e = this.e;
    // nobody ever came close: the goblin still slips away after 150 s (spawn cue is global, so the temptation must expire)
    this.idleAge += dt;
    if (this.idleAge > 150 && now >= this.escapeAt && !this.busy) {
      const portal = e.def.abilities.find((a) => a.id === 'tg_portal');
      if (portal) {
        this.startAbility(portal, e, 99);
        return;
      }
    }
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.25;
      const p = this.nearestPlayer(e.def.aggroRange);
      if (p) {
        this.aggroed = true;
        e.aggroed = true;
        this.target = p;
        this.mode = 'flee';
        this.escapeAt = now + (G.mplus?.state ? 20 : 30);
        try {
          G.audio.play('gold_pickup', { pos: [e.position.x, 1, e.position.z], pitch: 0.8 });
          G.events.emit('ui:toast', { text: 'Hazine Goblini ortaya çıktı!', kind: 'loot' });
        } catch { /* ignore */ }
        return;
      }
    }
    this.halt(dt);
  }

  protected fleeCombat(dt: number, now: number): void {
    const e = this.e;
    // escape portal
    const portal = e.def.abilities.find((a) => a.id === 'tg_portal');
    if (portal && now >= this.escapeAt && !this.busy) {
      this.startAbility(portal, this.target ?? e, 99);
      return;
    }
    this.fleeT -= dt;
    const px = e.position.x, pz = e.position.z;
    let nearest: Player | null = null;
    let nd = Infinity;
    for (const p of this.world.players) {
      if (p.isDead) continue;
      const d = Math.hypot(p.position.x - px, p.position.z - pz);
      if (d < nd) {
        nd = d;
        nearest = p;
      }
    }
    if (!nearest) {
      this.halt(dt);
      return;
    }
    // a fleeing body on ground its camp cannot walk (a stone step, an island) has no run to make from there: it evades home
    const reach = this.campReach();
    if (!reach.near(px, pz)) {
      this.startReturn();
      return;
    }
    if (this.fleeT <= 0 || Math.hypot(this.fleeX - px, this.fleeZ - pz) < 1.5) {
      this.fleeT = 1.3;
      // pick the random nav point (within 22 m) that is farthest from every player; only ground the camp can walk to
      let best = { x: px, z: pz };
      let bd = -1;
      for (let i = 0; i < 8; i++) {
        const c = this.world.nav.randomNear(px, pz, 22, Math.random, (x, z) => reach.has(x, z));
        let dmin = Infinity;
        for (const p of this.world.players) if (!p.isDead) dmin = Math.min(dmin, Math.hypot(p.position.x - c.x, p.position.z - c.z));
        // a fleeing mob stays in its attacker's reach (casters hit to 30 m): it does not run off out of range
        const score = dmin - Math.hypot(c.x - px, c.z - pz) * 0.15 - Math.max(0, dmin - 18) * 10;
        if (score > bd) {
          bd = score;
          best = c;
        }
      }
      this.fleeX = best.x;
      this.fleeZ = best.z;
      this.path = null;
    }
    this.steerTo(this.fleeX, this.fleeZ, e.moveSpeed() * (e.def.ai?.fleeMul ?? 1.05), dt, 'run');
  }

  protected onHurtFlee(_amount: number): void {
    const e = this.e;
    // one gold pile for every 10% of its HP lost
    const step = Math.floor((1 - e.hpFrac) * 10);
    if (step > this.dropped) {
      this.dropped = step;
      try {
        G.loot.dropGold(Math.round((2 + 0.5 * e.level) * 2.5), e.position.clone());
      } catch { /* ignore */ }
    }
  }
  protected dropped = 0;
  protected idleAge = 0;

  // ===================================================================================================================
  // abilities
  // ===================================================================================================================

  protected pickAbilityTarget(ab: EnemyAbility, fallback: Actor): Actor {
    const mode = ab.params?.target ?? 0;
    if (!mode) return fallback;
    const ps = this.players();
    if (!ps.length) return fallback;
    const ex = this.e.position.x, ez = this.e.position.z;
    if (mode === 1) return ps[Math.floor(Math.random() * ps.length)];
    if (mode === 2) return ps.reduce((a, b) => (Math.hypot(a.position.x - ex, a.position.z - ez) >= Math.hypot(b.position.x - ex, b.position.z - ez) ? a : b));
    if (mode === 3) {
      const nonTank = ps.filter((p) => (p as Player).classId !== 'knight');
      const pool = nonTank.length ? nonTank : ps;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    return fallback;
  }

  /**
   * P-24 call for help: every idle enemy within `radius` of this caster is pulled onto the caster's target together with
   * its pack (EnemyDirector.pullPack). Same rules as the body pulls: enemies that never aggro (totems, summons, fleers)
   * are left alone. `sameRoom` keeps only enemies with a clear line of sight to the caster (rooms have no runtime id).
   * Returns how many enemies were called.
   */
  callForHelp(radius: number, sameRoom = false): number {
    const target = this.target;
    const e = this.e;
    if (!target || !(radius > 0) || e.isDead) return 0;
    let called = 0;
    for (const o of this.dir.ais.slice()) {
      if (o === this || o.disposed || o.aggroed || o.e.isDead || o.e.removed) continue;
      const od = o.e.def;
      if (od.aggroRange <= 0 || od.ai?.summoned || od.ai?.flee) continue;
      const ox = o.e.position.x, oz = o.e.position.z;
      if (Math.hypot(ox - e.position.x, oz - e.position.z) > radius) continue;
      if (sameRoom && !this.world.nav.lineOfSight(e.position.x, e.position.z, ox, oz)) continue;
      this.dir.pullPack(o, target);
      if (o.aggroed) called++;
    }
    return called;
  }

  /** Begin an ability: facing, animation, cast bar, telegraph shapes; the effect resolves after the windup. */
  startAbility(ab: EnemyAbility, target: Actor, _dist = 0): void {
    const e = this.e;
    const now = this.now;
    target = this.pickAbilityTarget(ab, target);
    const isBasic = ab === this.basic;
    const isCast = (ab.castTime ?? 0) > 0;
    const rate = Math.max(0.4, 1 + e.getStat(isCast ? 'castSpeed' : 'attackSpeed')) * this.atkMul;
    const windup = Math.max(this.eliteSpecial(ab) ? 0.9 : 0.05, ab.windup / (isCast ? 1 : rate));
    const castTime = isCast ? (ab.castTime as number) / Math.max(0.5, 1 + e.getStat('castSpeed')) : 0;
    const delay = Math.max(windup, castTime, ab.params?.delay !== undefined ? ab.params.delay : 0);
    const channel = ab.params?.channel ?? 0;
    const looping = channel > 0 || !!ab.params?.loop;

    // aim
    let dx = target.position.x - e.position.x, dz = target.position.z - e.position.z;
    let l = Math.hypot(dx, dz);
    if (l < 0.01) {
      dx = Math.sin(e.yaw);
      dz = Math.cos(e.yaw);
      l = 1;
    }
    dx /= l;
    dz /= l;

    // animation
    const a = e.anim;
    let clip: string | null = ab.anim && a?.has(ab.anim) ? ab.anim : null;
    const clipDur = clip ? a!.clipDuration(clip) : 0;
    let impact = ab.params?.impact ?? clipDur * 0.4;
    if (!clip && ab.anim) this.warnClip(ab.anim);
    let speed = 1;
    let total = delay + 0.25;
    if (clip) {
      if (looping) {
        speed = 1;
        total = delay + channel + 0.2;
      } else {
        speed = clamp(Math.max(0.05, impact) / Math.max(0.1, delay), 0.3, 3);
        total = Math.max(delay + 0.16, Math.min(clipDur / speed, delay + 1.0));
      }
    }
    if (channel > 0) total = Math.max(total, delay + channel + 0.2);
    const telegraphLock = (ab.telegraph ?? false) && (ab.kind === 'line' || ab.kind === 'charge' || ab.kind === 'projectile');
    const b: Busy = {
      ab, t0: now, delay, castTime, total, lockAt: now + (telegraphLock ? 0.02 : Math.max(0.08, delay * 0.62)), clip, seq: 0, impact, speed,
      resolved: false, channel, targetId: target.id, tx: target.position.x, tz: target.position.z, dx, dz, castId: false, shapeIds: [], data: {},
    };
    this.busy = b;
    // Körlük (GDD 1.8): 50% of a blinded enemy's attacks miss (bosses / minibosses 25%)
    if (e.statuses.blinded && MISSABLE.has(ab.kind) && (ab.damage?.coef ?? 0) > 0 && Math.random() < (e.def.rank === 'boss' || e.def.rank === 'miniboss' ? 0.25 : 0.5)) {
      b.data.miss = 1;
    }
    e.setLocomotion('idle');
    e.velocity.x *= 0.3;
    e.velocity.z *= 0.3;
    // face right away (snap for telegraphed shots)
    if (telegraphLock || delay < 0.3) e.yaw = yawFromDir(dx, dz);

    // cooldowns start now
    if (isBasic) {
      const bcd = this.cdOverride.get(ab.id) ?? this.basicCd;
      this.basicReadyAt = now + bcd / Math.max(0.4, 1 + e.getStat('attackSpeed')) / this.atkMul * (0.92 + Math.random() * 0.16);
    } else if (ab.cooldown > 0 || this.cdOverride.has(ab.id)) {
      this.readyAt.set(ab.id, now + (this.cdOverride.get(ab.id) ?? ab.cooldown) / this.cdRate(ab));
    } else this.readyAt.set(ab.id, now + 9999);
    if (ab.params?.once) this.used.add(ab.id);
    // P-24: a cast with `callRadius` calls for help (host-side: the brain only runs on the authority)
    if ((ab.params?.callRadius ?? 0) > 0) this.callForHelp(ab.params!.callRadius, !!ab.params!.sameRoom);

    // cast bar
    if (castTime > 0) {
      b.castId = true;
      e.cast = { skillId: ab.id, name: ab.name, start: now, duration: channel > 0 ? channel + castTime : castTime, channel: channel > 0, interruptible: !!ab.interruptible };
      try {
        G.events.emit('enemy:castStart', { enemyId: e.id, abilityId: ab.id, name: ab.name, castTime: e.cast.duration, interruptible: !!ab.interruptible });
        G.net?.broadcast('ecast', { enemyId: e.id, abilityId: ab.id, name: ab.name, castTime: e.cast.duration, interruptible: !!ab.interruptible });
      } catch { /* ignore */ }
    }
    this.bark(ab, isBasic);
    // windup glow + cast sound
    try {
      const type = ab.damage?.type ?? 'physical';
      if (delay >= 0.7 || castTime > 0) {
        G.vfx.spawn('enemy_cast_glow', e.pointAt(0.55), { follow: e.model ?? e.object3d, duration: delay, color: e.def.visual?.glow ?? GLOW_COLOR[type] });
      }
      const sfx = ab.sfx ?? (castTime > 0 ? CAST_SFX[type] : undefined);
      if (sfx) G.audio.play(sfx, { pos: [e.position.x, 1.2, e.position.z], pitchVar: 0.06 });
    } catch { /* ignore */ }

    // play the clip so its impact frame lands at `delay`
    if (clip) {
      e.playShot(clip, speed, { loop: looping, fade: 0.06, loopFor: total });
      b.seq = a!.shotSeq;
    }

    // custom handlers own their own geometry
    const c = this.handler(ab.id);
    if (ab.kind === 'custom') {
      c?.start?.(this, b);
      return;
    }

    // telegraph / hitshape at t0 for shape-based abilities
    switch (ab.kind) {
      case 'melee':
      case 'cone':
      case 'self_aoe':
      case 'ground_aoe':
      case 'line':
      case 'charge':
        if (ab.params?.pull) {
          b.total += 0.45;
          this.abilityShape(ab, b, { delay: b.delay + 0.45 });
        } else this.abilityShape(ab, b);
        if (ab.params?.persist && (ab.kind === 'ground_aoe' || ab.kind === 'self_aoe')) this.persistShape(ab, b);
        break;
      case 'projectile':
        if (ab.telegraph && ab.params?.hitscan !== 1) this.projectileShapes(ab, b, true);
        else if (ab.telegraph && ab.params?.hitscan === 1) this.hitscanShapes(ab, b);
        break;
      default:
        break;
    }
    c?.start?.(this, b);
  }

  protected persistShape(ab: EnemyAbility, b: Busy): void {
    const p = ab.params ?? {};
    const type = ab.damage?.type ?? 'fire';
    const ground = ab.kind === 'ground_aoe';
    const radius = ab.shape && ab.shape.type === 'circle' ? ab.shape.radius : 2;
    if (p.persistCoef === undefined && ab.kind === 'ground_aoe' && p.tick === undefined) return;
    this.shape({
      shape: { type: 'circle', radius }, x: ground ? b.tx : this.e.position.x, z: ground ? b.tz : this.e.position.z, dx: b.dx, dz: b.dz, delay: b.delay,
      coef: p.persistCoef ?? ab.damage?.coef ?? 0.3, type, telegraph: false, persist: { duration: p.persist, tick: p.tick ?? 0.5 }, vfxOnLand: ab.vfx ?? IMPACT_VFX[type], name: ab.name,
      statuses: ab.statuses,
    });
  }

  /** Projectile(s) toward the aim point: `now` = fire now (delay 0) or after b.delay with a telegraph line. */
  protected projectileShapes(ab: EnemyAbility, b: Busy, telegraphed: boolean): void {
    const e = this.e;
    const pr = ab.projectile;
    if (!pr) return;
    const n = Math.max(1, pr.count ?? 1);
    const spread = ((pr.spread ?? 0) * Math.PI) / 180;
    const base = Math.atan2(b.dx, b.dz);
    const m = e.muzzle(_a);
    const type = ab.damage?.type ?? 'physical';
    for (let i = 0; i < n; i++) {
      const ang = base + (i - (n - 1) / 2) * spread;
      const dx = Math.sin(ang), dz = Math.cos(ang);
      this.shape({
        shape: { type: 'circle', radius: pr.radius }, x: m.x, y: m.y, z: m.z, dx, dz, delay: telegraphed ? b.delay : 0, coef: ab.damage?.coef ?? 1, type,
        statuses: ab.statuses, knockback: ab.knockback, telegraph: telegraphed, name: ab.name, vfxOnLand: IMPACT_VFX[type] === 'ground_slam' ? 'hit_spark' : IMPACT_VFX[type],
        projectile: { speed: pr.speed, radius: pr.radius, range: Math.max(10, ab.range + 2), vfx: pr.vfx, homing: pr.homing, homingTargetId: pr.homing ? b.targetId : undefined },
      });
    }
  }

  /** Instant lines (telegraphed hitscan volley) + cosmetic bolts. */
  protected hitscanShapes(ab: EnemyAbility, b: Busy): void {
    const e = this.e;
    const pr = ab.projectile!;
    const n = Math.max(1, pr.count ?? 1);
    const spread = ((pr.spread ?? 0) * Math.PI) / 180;
    const base = Math.atan2(b.dx, b.dz);
    const type = ab.damage?.type ?? 'physical';
    for (let i = 0; i < n; i++) {
      const ang = base + (i - (n - 1) / 2) * spread;
      this.shape({
        shape: { type: 'line', length: ab.range, width: pr.radius * 2 }, x: e.position.x, z: e.position.z, dx: Math.sin(ang), dz: Math.cos(ang), delay: b.delay,
        coef: ab.damage?.coef ?? 1, type, statuses: ab.statuses, telegraph: true, name: ab.name,
      });
    }
    b.data.hitscan = 1;
  }

  /**
   * Longest walkable run (m, at most `max`, sampled every 0.5 m) from the enemy along (dx, dz) with a clear line. Charges and
   * leaps use it so the body stops at a wall instead of passing through it. Vertical worlds use the walk line.
   */
  protected clearRun(dx: number, dz: number, max: number): number {
    const nav = this.world.nav;
    const px = this.e.position.x, pz = this.e.position.z;
    let best = 0;
    for (let d = 0.5; d <= max + 1e-6; d += 0.5) {
      const x = px + dx * d, z = pz + dz * d;
      const clear = nav.vertical ? nav.walkLine(px, pz, x, z) : nav.lineOfSight(px, pz, x, z);
      if (!clear || !nav.isWalkable(x, z)) break;
      best = d;
    }
    return Math.min(best, max);
  }

  /** The windup is over: the effect lands (or the projectile leaves). */
  protected resolveAbility(b: Busy): void {
    const e = this.e;
    const ab = b.ab;
    b.resolved = true;
    for (const hk of this.onResolveHooks) {
      try {
        hk(b);
      } catch { /* ignore */ }
    }
    const type = ab.damage?.type ?? 'physical';
    const c = this.handler(ab.id);
    if (b.data.miss) {
      try {
        bossText('KAÇIRDI', e.position.x, e.height + 0.4, e.position.z, 1);
      } catch { /* ignore */ }
    }
    try {
      if (ab.kind === 'custom') {
        c?.resolve?.(this, b);
        return;
      }
      switch (ab.kind) {
        case 'melee':
        case 'cone': {
          const heavy = e.def.rank !== 'trash' || (ab.damage?.coef ?? 1) >= 2;
          G.audio.play(ab.sfx ?? (heavy ? 'swing_heavy' : 'swing_light'), { pos: [e.position.x, 1.2, e.position.z], pitchVar: 0.08 });
          const r = ab.shape && ab.shape.type === 'cone' ? ab.shape.radius : ab.range;
          const vfx = ab.vfx ?? (type === 'physical' ? (r > 3.4 ? 'slash_arc_big' : 'slash_arc') : IMPACT_VFX[type] === 'ground_slam' ? 'slash_arc' : IMPACT_VFX[type]);
          if (type === 'physical' || ab.vfx) {
            const f = Math.min(r * 0.55, 2.2);
            G.vfx.spawn(vfx, [e.position.x + Math.sin(e.yaw) * f, e.position.y + 0.9, e.position.z + Math.cos(e.yaw) * f], { dir: [Math.sin(e.yaw), 0, Math.cos(e.yaw)], scale: clamp(r / 3, 0.6, 1.6) });
          }
          if (ab.params?.suicide) this.suicide();
          break;
        }
        case 'projectile':
          if (ab.projectile) {
            if (b.data.hitscan === 1) {
              const m = e.muzzle(_a);
              const n = Math.max(1, ab.projectile.count ?? 1);
              const spread = ((ab.projectile.spread ?? 0) * Math.PI) / 180;
              const base = Math.atan2(b.dx, b.dz);
              for (let i = 0; i < n; i++) {
                const ang = base + (i - (n - 1) / 2) * spread;
                G.vfx.spawn(ab.projectile.vfx, [m.x, m.y, m.z], { dir: [Math.sin(ang), 0, Math.cos(ang)], target: [m.x + Math.sin(ang) * ab.range, m.y, m.z + Math.cos(ang) * ab.range] });
              }
            } else if (!ab.telegraph) {
              // aim at the target's position at release (with a little lead)
              const t = b.targetId != null ? this.world.getActor(b.targetId) : null;
              if (t && !t.isDead) {
                const dxx = t.position.x - e.position.x, dzz = t.position.z - e.position.z;
                const dd = Math.hypot(dxx, dzz) || 1;
                const lead = Math.min(0.45, dd / Math.max(8, ab.projectile.speed)) * 0.55;
                const ax = t.position.x + t.velocity.x * lead - e.position.x, az = t.position.z + t.velocity.z * lead - e.position.z;
                const al = Math.hypot(ax, az) || 1;
                b.dx = ax / al;
                b.dz = az / al;
              }
              this.projectileShapes(ab, b, false);
            }
            const sfx = ab.sfx ?? CAST_SFX[type];
            if (sfx && !b.castId) G.audio.play(sfx, { pos: [e.position.x, 1.2, e.position.z], pitchVar: 0.06 });
          }
          break;
        case 'ground_aoe':
        case 'self_aoe': {
          if (ab.params?.pull) {
            // Boşluk Çekimi: drag every player within params.pull metres to the caster, the damage circle lands right after
            bossMsg('boss_pull', { x: e.position.x, z: e.position.z, speed: 16, dur: 0.4, stop: 1.6, r: ab.params.pull });
          }
          if (ab.params?.suicide) this.suicide();
          break;
        }
        case 'line':
          G.audio.play(ab.sfx ?? 'swing_heavy', { pos: [e.position.x, 1.2, e.position.z], pitchVar: 0.06 });
          break;
        case 'charge': {
          // no wall clipping: the dash stops at the first wall on its line
          const len = this.clearRun(b.dx, b.dz, ab.shape && ab.shape.type === 'line' ? ab.shape.length : ab.range);
          const dash = ab.params?.dash ?? 0.35;
          e.forcedMove = { vx: (b.dx * len) / dash, vz: (b.dz * len) / dash, until: this.now + dash };
          G.vfx.spawn('charge_trail', e.pointAt(0.3), { dir: [b.dx, 0, b.dz], duration: dash });
          if (ab.params?.trail) {
            this.shape({ shape: { type: 'line', length: len, width: 2.6 }, x: e.position.x, z: e.position.z, dx: b.dx, dz: b.dz, delay: 0, coef: ab.params.trailCoef ?? 0.5, type, persist: { duration: ab.params.trail, tick: 0.5 }, vfxOnLand: 'fire_ground', name: ab.name });
          }
          G.audio.play(ab.sfx ?? 'whoosh', { pos: [e.position.x, 1, e.position.z] });
          break;
        }
        case 'heal_ally':
          this.doHeal(ab);
          break;
        case 'buff_ally':
          this.doBuff(ab);
          break;
        case 'summon':
          this.doSummon(ab);
          break;
      }
      if (ab.vfx && (ab.kind === 'ground_aoe' || ab.kind === 'self_aoe')) {
        // landing effect is spawned by HitShapes (vfxOnLand)
      }
    } catch (err) {
      console.error(`[ai] resolve ${ab.id} failed`, err);
    }
  }

  /** Orc / goblin / brute attack bark at the start of a damaging ability (clients bark when they replay the swing, see Enemy.updateRemote). */
  protected bark(ab: EnemyAbility, basic: boolean): void {
    if ((ab.damage?.coef ?? 0) > 0) this.e.bark(!basic);
  }

  protected suicide(): void {
    const e = this.e;
    this.schedule(0.05, () => {
      if (e.isDead) return;
      e.hp = 0;
      G.combat.killEnemy(e, null);
    });
  }

  protected doHeal(ab: EnemyAbility): void {
    const e = this.e;
    const t = this.findHealTarget(ab);
    if (!t) return;
    const amt = t.maxHp * (ab.healPct ?? 0.2);
    t.hp = Math.min(t.maxHp, t.hp + amt);
    G.vfx.spawn('heal_burst', t.pointAt(0.5));
    G.events.emit('heal', { targetId: t.id, sourceId: e.id, amount: Math.round(amt), pos: [t.position.x, t.position.y + t.height * 0.9, t.position.z] });
    G.audio.play('heal', { pos: [t.position.x, 1, t.position.z] });
  }

  protected findHealTarget(ab: EnemyAbility): Enemy | null {
    const e = this.e;
    let best: Enemy | null = null;
    // WoW healers top up what is hurt: trash / elite healers only act on allies below 80 % (bosses keep 97 %)
    let bf = healBelow(e.def);
    for (const o of this.world.enemies) {
      if (o.isDead || o.removed || o.team !== 'enemy' || o.def.ccImmune && o.def.rank === 'trash' && o.def.speed === 0) continue;
      if (o.def.id.startsWith('proc_')) continue;
      if (Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z) > ab.range) continue;
      const f = o.hpFrac;
      if (f < bf) {
        bf = f;
        best = o;
      }
    }
    return best;
  }

  protected doBuff(ab: EnemyAbility): void {
    const e = this.e;
    const p = ab.params ?? {};
    const rad = p.radius ?? 12;
    let targets = this.allies(e.position.x, e.position.z, rad, !!p.self);
    if (ab.id.includes('rite')) targets = targets.filter((t) => t.def.id === 'cult_acolyte');
    if (p.single) {
      let best: Enemy | null = null;
      let bf = 2;
      for (const t of this.allies(e.position.x, e.position.z, rad, true)) {
        if (t.statuses.has('shield')) continue;
        const f = t.hpFrac + (t === e ? 0.15 : 0);
        if (f < bf) {
          bf = f;
          best = t;
        }
      }
      targets = best ? [best] : [];
    }
    if (p.self && !targets.includes(e) && !p.single) targets.push(e);
    for (const t of targets) {
      for (const s of ab.statuses ?? []) {
        const mag = s.status === 'shield' ? t.maxHp * (p.shieldPct ?? 0.2) : s.magnitude;
        t.statuses.apply(s.status, s.duration, { stacks: s.stacks, magnitude: mag, sourceId: e.id });
        G.net?.broadcast('estatus', { targetId: t.id, status: s.status, duration: s.duration, stacks: s.stacks ?? 1 });
      }
      try {
        G.vfx.spawn(ab.vfx ?? 'buff_aura', t.pointAt(0.5), { follow: t.model ?? t.object3d, duration: 1.2 });
      } catch { /* ignore */ }
    }
    if (ab.vfx === 'war_cry') G.events.emit('camera:shake', { intensity: 0.1, duration: 0.2 });
  }

  protected doSummon(ab: EnemyAbility): void {
    const s = ab.summon;
    if (!s) return;
    this.spawnAdds(s.enemyId, s.count, { radius: ab.params?.radius ?? 2.2, level: this.e.level + (ab.params?.addLevel ?? 0) });
    G.vfx.spawn(ab.vfx ?? 'add_spawn', this.e.position);
  }

  /** Spawn dynamic adds around (x,z) (host): deterministic ids from world.allocHostId, replicated through the 'spawn' channel. */
  spawnAdds(defId: string, count: number, o: { x?: number; z?: number; radius?: number; aggro?: boolean; tag?: string; hpFrac?: number; hpMult?: number; positions?: { x: number; z: number }[]; facing?: number; level?: number } = {}): void {
    const e = this.e;
    const spawn = hooks.spawn;
    if (!spawn) return;
    const cx = o.x ?? e.position.x, cz = o.z ?? e.position.z;
    const rad = o.radius ?? 2.2;
    for (let i = 0; i < count; i++) {
      let x = cx, z = cz;
      if (o.positions?.[i]) {
        x = o.positions[i].x;
        z = o.positions[i].z;
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = rad * (0.5 + Math.random() * 0.7);
        x = cx + Math.cos(a) * r;
        z = cz + Math.sin(a) * r;
        if (!this.world.nav.isWalkable(x, z)) {
          const w = this.world.nav.nearestWalkable(x, z, 5);
          if (w) {
            x = w.x;
            z = w.z;
          }
        }
      }
      void spawn(this.world, defId, { x, z }, { level: o.level ?? e.level, packId: e.packId, aggro: o.aggro !== false, owner: e.id, tag: o.tag, hpFrac: o.hpFrac, hpMult: o.hpMult, facing: o.facing });
    }
  }

  // ---- busy handling ------------------------------------------------------------------------------------------------

  protected tickBusy(dt: number, now: number): void {
    const e = this.e;
    const b = this.busy!;
    const t = now - b.t0;
    const target = b.targetId != null ? this.world.getActor(b.targetId) : null;
    // turn toward the target until the lock
    if (now < b.lockAt && target && !target.isDead && target !== e) {
      this.faceTo(target.position.x - e.position.x, target.position.z - e.position.z, 18, dt);
      if (b.ab.kind === 'melee' || b.ab.kind === 'cone') {
        b.dx = Math.sin(e.yaw);
        b.dz = Math.cos(e.yaw);
      }
    }
    // lunge during the second half of a melee windup
    const lunge = b.ab.params?.lunge ?? (b.ab.kind === 'melee' && e.def.rank === 'trash' && !e.def.flying ? 0.55 : 0);
    if (lunge > 0 && !b.resolved && t > b.delay * 0.35 && t < b.delay * 0.85 && b.ab.kind === 'melee') {
      const sp = lunge / Math.max(0.1, b.delay * 0.5);
      const step = sp * dt;
      const tx = e.position.x + Math.sin(e.yaw) * step, tz = e.position.z + Math.cos(e.yaw) * step;
      // never lunge into the target
      if (!target || Math.hypot(target.position.x - tx, target.position.z - tz) > e.radius + target.radius * 0.6) {
        e.position.x = tx;
        e.position.z = tz;
        this.world.nav.resolveCircle(e.position, e.radius);
      }
    }
    // leaping slams (Sarsıcı Sıçrayış): hop to the telegraphed spot during the last 0.4 s of the windup
    if (b.ab.params?.leap && !b.data.leaped && !b.resolved && t >= b.delay - 0.42) {
      b.data.leaped = true;
      const ldx = b.tx - e.position.x, ldz = b.tz - e.position.z;
      const ld = Math.hypot(ldx, ldz);
      // the leap lands short of a wall instead of inside it
      const run = ld > 0.8 ? this.clearRun(ldx / ld, ldz / ld, ld) : 0;
      if (run > 0.8) {
        e.forcedMove = { vx: (ldx / ld) * run / 0.4, vz: (ldz / ld) * run / 0.4, until: now + 0.4 };
        e.yaw = yawFromDir(ldx, ldz);
      }
    }
    this.halt(dt, true);
    if (!b.resolved && t >= b.delay) this.resolveAbility(b);
    const c = this.handler(b.ab.id);
    if (c?.tick && this.busy === b) c.tick(this, b, dt, t);
    if (this.busy === b && t >= b.total) this.endBusy();
  }

  protected endBusy(): void {
    const e = this.e;
    const b = this.busy;
    if (!b) return;
    if (b.castId) {
      e.cast = null;
      try {
        G.events.emit('enemy:castEnd', { enemyId: e.id, abilityId: b.ab.id, interrupted: false });
        G.net?.broadcast('ecast', { enemyId: e.id, abilityId: b.ab.id, name: b.ab.name, castTime: 0, interruptible: false, ended: true, interrupted: false });
      } catch { /* ignore */ }
    }
    if (b.channel > 0 || b.ab.params?.loop) e.anim?.cancelOneShot(0.1);
    const c = this.handler(b.ab.id);
    c?.end?.(this, b);
    this.busy = null;
    this.lastActEnd = this.now;
    if (b.ab.params?.escape) return;
  }

  /** Cancel the current ability (hit-react, hard CC, external cast clear). */
  abortBusy(reason: 'cc' | 'flinch' | 'external' | 'death', by: EntityId | null = null): void {
    const e = this.e;
    const b = this.busy;
    if (!b) return;
    this.busy = null;
    try {
      G.hitShapes.cancelBySource(e.id);
    } catch { /* ignore */ }
    if (b.castId) {
      const wasCast = !!e.cast;
      e.cast = null;
      try {
        // interruptedBy = whoever caused it (a player's hit / stun / knockback); the same field rides the 'ecast' end to clients
        const interruptedBy = by ?? undefined;
        if (wasCast) G.events.emit('enemy:castEnd', { enemyId: e.id, abilityId: b.ab.id, interrupted: true, interruptedBy });
        const endMsg = { enemyId: e.id, abilityId: b.ab.id, name: b.ab.name, castTime: 0, interruptible: false, ended: true, interrupted: true, interruptedBy };
        G.net?.broadcast('ecast', endMsg);
      } catch { /* ignore */ }
    }
    if (b.clip && reason !== 'flinch') e.anim?.cancelOneShot(0.1);
    if (b.channel > 0 || b.ab.params?.loop) e.anim?.cancelOneShot(0.1);
    const c = this.handler(b.ab.id);
    c?.abort?.(this, b, reason);
    this.cancelTimers('ab');
    // interrupted casts go on their full cooldown (already set); melee retries soon
    if (b.ab === this.basic) this.basicReadyAt = this.now + 0.35;
    this.lastActEnd = this.now;
  }

  /**
   * Hyper-armour (GDD_V2 §3.7): inside a heavy windup or cast, the first `hyperArmor` share of its length cannot be flinched
   * and takes half the poise damage at that rate (Combat.addStagger). Elites 50%, mini-bosses 80%, bosses 100%.
   */
  armoredNow(): boolean {
    const b = this.busy;
    if (!b || b.resolved) return false;
    const armour = hyperArmorOf(this.e.def);
    if (armour <= 0 || !isHeavyAbility(b.ab)) return false;
    return this.now - b.t0 < b.delay * armour;
  }

  /** Interrupt an interruptible cast (flinch / stun). Public for bosses (interrupt window mechanics). `by` = who caused it. */
  interrupt(reason: 'cc' | 'flinch' | 'external', by: EntityId | null = null): void {
    const b = this.busy;
    if (!b) return;
    if (reason === 'flinch' && !(b.castId && b.ab.interruptible)) return;
    this.abortBusy(reason, by);
    try {
      G.audio.play('block', { pos: [this.e.position.x, 1.2, this.e.position.z], pitch: 1.4 });
    } catch { /* ignore */ }
  }

  protected watchBusy(now: number): void {
    const e = this.e;
    const b = this.busy!;
    // Combat's onHardCC clears e.cast: the cast was interrupted from outside
    if (b.castId && !e.cast) {
      this.abortBusy('external');
      return;
    }
    const a = e.anim;
    if (b.clip && a && a.shotSeq !== b.seq && !b.resolved) {
      // another one-shot replaced our swing (hit reaction)
      const elapsed = now - b.t0;
      if (b.castId || b.channel > 0 || b.ab.params?.loop) {
        b.seq = a.shotSeq;
        return;
      }
      if (!this.armoredNow() && now >= this.flinchGraceUntil && elapsed < b.delay * 0.62) {
        this.abortBusy('flinch');
        this.flinchGraceUntil = now + 1.6;
      } else {
        // committed: swing again fast enough to still land on time
        const remaining = Math.max(0.12, b.delay - elapsed);
        e.playShot(b.clip, clamp(Math.max(0.05, b.impact) / remaining, 0.5, 4), { fade: 0.03 });
        b.seq = a.shotSeq;
      }
    }
  }

  protected warnClip(clip: string): void {
    const key = `${this.e.def.id}:${clip}`;
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[ai] ${this.e.def.id}: animation clip "${clip}" not found (available: ${this.e.anim?.clipNames().slice(0, 12).join(', ')}...)`);
  }

}

const warned = new Set<string>();
const CAST_ONLY = new Set<VfxId>(['buff_aura', 'war_cry', 'heal_burst', 'shield_bubble', 'enrage_aura', 'add_spawn', 'stealth_smoke', 'blink', 'death_bones', 'enemy_cast_glow']);
