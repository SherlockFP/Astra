import * as THREE from 'three';
import { G } from '../game/G';
import { RNG, clamp, yawFromDir } from '../core/utils';
import { CLASSES } from '../data/classes';
import { SKILLS } from '../data/skills';
import { MATERIALS } from '../data/materials';
import { OPEN_ZONES } from '../data/dungeons';
import {
  DODGE_STACK_IDS, STATUSES, STATUS_RULES, dodgeStackLoss, stacksAfterLoss, takenPerStackTotal,
} from '../data/statuses';
import { ComboTracker } from './ComboTracker';
import { SpecialState, sp, hasSp, specHooksOf, weaponAvg } from './specials';
import { skillRankDamageMult } from './skillRanks';
import { COMBAT_FEEL, FEEL, FEEL_TABLE, KNOCKBACK, SLOWMO, SLOWMO_GAP, TYPE_COLORS, feelBeat, freezeActors, knockbackDuration, massFactor, resolveHitFeel, vfxScale, weaponKindOf, type HitWeight } from './feel';
import { DeathLog } from './deathLog';
import { GUARD_BREAK_STUN, PARRY_WINDOW, GuardState, guardCost, guardProfileOf } from './guard';
import { blockChanceCap, protectorCheat, specOf, warlordRageMult } from './specs';
import { weaknessOf } from '../data/families';
import { breakLock, breakSeconds, finisherPctMaxHp, hyperArmorOf, isSwarm, parryPoise, poiseDelay, poiseMax, poiseRegenRate } from './poise';
import { CombatMeters } from './meters';
import { vetHit, vetPlayerDeath } from '../net/guard';
import { pvp } from '../systems/Pvp';
import { arenaCombatActive, arenaHealMult } from './pvp';
import { Prd } from './prd';
import { absorbMagicShell } from './magicShell';
import { applyAlchemyLink } from './link';
import { SHADOW_TECHNIQUE } from '../data/procs_kit_rogue';
import { formRegen } from './Forms';
import './statusesFeel'; // marked_crit / riposte / critbuff defs (side-effect merge into the shared registries)
import { PARTY_ID_BASE, type DamageType, type EntityId } from '../types/common';
import type { StatusApply, StatusId } from '../types/skills';
import type { StatId } from '../types/stats';
import type { NetChannels } from '../types/net';
import type { Actor } from '../entities/Actor';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { Minion } from '../entities/Minion';

/** What a player skill/attack does to one target. Built by SkillSystem from SkillDef. */
/** PM-00b: damage-taken ring buffer horizon (s) and size cap. */
/** Share of an incoming hit that İlahi Siper (`bulwark`) reflects back as holy damage. */
const BULWARK_REFLECT = 0.2;
const TAKEN_WINDOW = 8;
const TAKEN_MAX = 512;

export interface HitSpec {
  skillId?: string;
  coef: number;                 // x attacker base damage (weapon damage for attacks, spell power for spells)
  type: DamageType;
  flat?: number;
  canCrit?: boolean;            // default true
  isDot?: boolean;
  isSpell?: boolean;            // scales with spellPower/int instead of weapon
  statuses?: StatusApply[];
  knockback?: number;
  tags?: string[];
  pos?: [number, number, number]; // impact point (vfx/damage numbers)
  dir?: [number, number];         // knockback direction (XZ)
  // ---- combat module extras (all optional) ----
  forceCrit?: boolean;
  /** Extra multiplicative damage (DAHA FAZLA) on top of statuses/combo. */
  more?: number;
  /** Threat multiplier of this hit (KIT PM-KN: Revenge x2). Default 1. */
  threatMult?: number;
  /** Feel class: drives hit-stop, shake, knockback class, flinch. */
  weight?: HitWeight;
  hitstop?: number;             // ms override (base, before crit/kill bonuses)
  shake?: number;               // trauma override
  stagger?: number;
  proc?: number;                // proc coefficient (life steal / on-hit)
  knockup?: number;             // hop height of the target (m)
  noReact?: boolean;
  /** Channel / zone tick: no hit-stop, no shake, no flinch, merged numbers. */
  tick?: boolean;
  /** Counts toward the combo counter (default true unless tick/isDot). */
  noCombo?: boolean;
  /** armour penetration / resist penetration additions for this hit */
  armorPen?: number;
  resPen?: number;
  /** extra crit damage (fraction) for this hit (Gece Avcısı Başlığı) */
  critAdd?: number;
  /** extra crit CHANCE for this hit (skill-local `crit` mods, mage cast mods); added to the attacker's critChance */
  critBonus?: number;
  /** PM-00b: no hit-stop for this hit (multi_strike: only the last hit of a chain stops time). */
  noHitstop?: boolean;
  /**
   * NC42 (GDD_CLASSES_V2 §1.5.2): id of the owner's minion that made this hit. The damage is still the owner's (sourceId = attacker),
   * the number reads as a minion hit and the enemy's threat is split 0.6 owner / 0.4 minion. Clients forward it as `hit.via`.
   */
  viaId?: EntityId;
  /** NC42: multiplies the crit CHANCE of this hit (minions crit with half the owner's chance: 0.5). Default 1. */
  critScale?: number;
}

export interface DamageResult {
  amount: number;
  crit: boolean;
  type: DamageType;
  killed: boolean;
  blocked?: boolean;
  dodged?: boolean;
  immune?: boolean;
  /** GDD_V2 §3.5: a perfect parry negated the hit (no damage, no statuses, no knockback). */
  parried?: boolean;
}

/**
 * New-player shield: monster damage taken by the local player is cut by this share at levels 1-5, so the first camps are survivable
 * for casters (mage base HP is the lowest). Levels 6+ get nothing. PvP starts at level 35 (data/pvpZone PVP_MIN_LEVEL), never here.
 */
const NEW_PLAYER_DR = [0.3, 0.25, 0.2, 0.12, 0.06];
export function newPlayerDr(level: number): number {
  return NEW_PLAYER_DR[Math.floor(level) - 1] ?? 0;
}

/** Damage arriving at the LOCAL player from enemies/hazards (raw, before the player's own mitigation). */
export interface IncomingHit {
  sourceId: EntityId | null;
  amount: number;
  type: DamageType;
  statuses?: StatusApply[];
  /** GDD_V2 §3.5: may be parried (default: blockable melee). */
  parryable?: boolean;
  /** GDD_V2 §3.4: ignores guard and parry, shatters the gauge (dodge only). */
  perilous?: boolean;
  /** GDD_V2 §3.12: melee shape (for squishy / guard rules). */
  melee?: boolean;
  /** Metres. NEGATIVE = pull toward `origin` / the source (Boşluk Çekimi style) instead of pushing away. */
  knockback?: number;
  /** World XZ the hit radiates from (shape origin): the target of a negative knockback. Defaults to the source entity. */
  origin?: [number, number];
  dir?: [number, number];
  abilityName?: string;
  unavoidable?: boolean;        // ignores dodge/block (still respects iframes unless `ignoreIframes`)
  ignoreIframes?: boolean;
  sourceLevel?: number;
  /** Periodic damage tick: no dodge/block, no flinch/hit-stop, merged number kind 'dot'. */
  isDot?: boolean;
  /** Melee/projectile hits can be blocked by a shield; spell/aoe hits cannot. Default true. */
  blockable?: boolean;
  /** Non-lethal damage over time (Kirlenme): the hit never takes the player below this absolute HP. */
  floorHp?: number;
  /** ENGINE_VERTICALITY §11 (V11): `false` = the hit never takes the player below 1 HP (fall damage). Default true (may kill). */
  lethal?: boolean;
}

/** Extra context for applyDamageToEnemy (all optional). */
export interface ApplyDamageOpts {
  dot?: boolean;
  /** The hit came from another peer (no local hit-stop / shake). */
  remote?: boolean;
  weight?: HitWeight;
  stagger?: number;
  knockup?: number;
  fling?: boolean;
  pos?: [number, number, number];
  noReact?: boolean;
  tick?: boolean;
  skillId?: string;
  /** Threat multiplier of the hit (EnemyAI.onDamaged). */
  threatMult?: number;
  /** NC42: the owner's minion that made the hit (threat split, taunt source). Already verified by the caller. */
  viaId?: EntityId;
}

/** NC42: damage arriving at one of the LOCAL player's minions (HitShapes / hostile projectiles; the owner's peer resolves it). */
export interface MinionHit {
  sourceId: EntityId | null;
  amount: number;
  type: DamageType;
  sourceLevel?: number;
  isDot?: boolean;
  abilityName?: string;
}

/** One frame of accumulated game feel (see Combat.noteFeel / flushFeel). */
interface FeelAcc {
  any: boolean;
  /** max hit-stop (ms) of the frame's hits, before the window budget */
  stop: number;
  /** max camera trauma of the frame's hits (already includes crit / kill) */
  shake: number;
  /** max shake duration (s) */
  dur: number;
  /** strongest directional kick (m) and its world XZ direction */
  kick: number;
  kx: number;
  kz: number;
  /** strongest FOV kick (deg) */
  fov: number;
  /** a global hit-stop is required (ultimate, stagger break, boss kill) */
  global: boolean;
  /** time-dilation candidate, highest priority wins (SLOW_ORDER) */
  slowmo: keyof typeof SLOWMO | null;
  attacker: Actor | null;
  victims: { a: Enemy; ms: number }[];
}
function newFeelAcc(): FeelAcc {
  return { any: false, stop: 0, shake: 0, dur: 0, kick: 0, kx: 0, kz: 0, fov: 0, global: false, slowmo: null, attacker: null, victims: [] };
}
/** CW-06: longest victim hit-stop of a projectile-weight hit (ms). */
const PROJECTILE_STOP_CAP_MS = 40;
/** Slow-mo priority: earlier wins within one frame (GDD_LIFE §5.7). */
const SLOW_ORDER: (keyof typeof SLOWMO)[] = ['bossDeath', 'eliteKill', 'lastKill', 'staggerBreak', 'ultimate', 'critHeavy'];

const MAIN_STAT_TYPE_PCT: Record<DamageType, StatId | null> = {
  physical: 'physicalDamagePct', fire: 'fireDamagePct', frost: 'frostDamagePct', lightning: 'lightningDamagePct',
  shadow: 'shadowDamagePct', poison: 'poisonDamagePct', holy: 'holyDamagePct', arcane: 'arcaneDamagePct', true: null,
};

const RES_STAT: Partial<Record<DamageType, StatId>> = {
  fire: 'resFire', frost: 'resFrost', lightning: 'resLightning', shadow: 'resShadow', poison: 'resPoison', arcane: 'resArcane',
};

const HARD_CC_IDS: StatusId[] = ['stun', 'freeze', 'knockdown', 'fear', 'root', 'petrify'];

/** P-21 K14: product of the actor's per-stack damage-taken multipliers (takenMorePerStack). 1 when none apply. */
const takenPerStack = (a: Actor): number => takenPerStackTotal((id) => a.statuses.stacks(id));

/** Poise bar of one enemy (GDD_V2 §3.7). Host owns the fill; clients keep a local `finished` set for Kritik Vuruş. */
interface StaggerState {
  v: number;
  max: number;
  delay: number;
  rate: number;
  brokenUntil: number;
  lockedUntil: number;
  lastGain: number;
  /** player ids that already executed a Kritik Vuruş during this break window */
  finished: Set<EntityId>;
}

interface HitFx {
  actor: Actor;
  t: number;
  dur: number;
  wx: number; wz: number;        // world shove direction * amplitude
  squash: number;
  hop: number;
  prevOff: number;
  prevHop: number;
  baseScale: THREE.Vector3 | null;
  lastScale: THREE.Vector3 | null;
}

const _v = new THREE.Vector3();

/** Soft stat read for ids that may not exist in StatId yet (GDD "NEW" stats appended later by the items module). */
export function softStat(a: Actor | null | undefined, key: string): number {
  if (!a) return 0;
  const s = (a.stats as Record<string, number>)[key] ?? 0;
  const m = (a.statuses.getStatMods() as Record<string, number>)[key] ?? 0;
  return s + m;
}

/** Normalise a resist value: fractions stay, "percent-looking" values (|v| > 1.5) are divided by 100. */
function normRes(v: number | undefined): number {
  if (!v) return 0;
  return Math.abs(v) > 1.5 ? v / 100 : v;
}

/**
 * Damage authority (see ARCHITECTURE.md):
 *  - Player -> enemy: computed on the ATTACKER's machine (rollOutgoing + mitigate), applied on the HOST
 *    (playerHitEnemy routes through G.net when we are a client; predicts damage numbers locally).
 *  - Enemy -> player: enemy abilities become HitShapes; each peer resolves them for its own local player via hitLocalPlayer().
 *  - Enemy HP, deaths, forces, loot triggers are host-authoritative; clients receive results via net.
 * Also the home of game FEEL: hit-stop / camera trauma accumulation (once per frame, max of all hits), enemy hit reactions
 * (flash, shove, squash, flinch clip), slow-mo on big crits, kill flings, combo counter, regen and potions.
 * OWNER: combat module.
 */
export class Combat {
  readonly combo = new ComboTracker();
  /** Runtime state of passive-tree / legendary / set specials (see specials.ts). */
  readonly sp = new SpecialState();
  /** Guard stance, Guard Gauge and the parry window of the LOCAL player (guard.ts). */
  readonly guard = new GuardState();
  /** Counters of the local player's combat feats (meters.ts). */
  readonly meters = new CombatMeters();
  /** GDD_V2 §3.9: +5% damage of the local player until this combat-clock time (a completed combo route). */
  private routeBuffUntil = -1;
  /** The enemy whose hit this player parried last, and when (combat clock): the riposte target for 1.6 s (GDD_V2 §3.5). */
  private lastParry: { id: EntityId; at: number } | null = null;
  /** Combat clock of the last backstab route token (one per swing). */
  private lastBskAt = -9;
  /** KIT PK-WARLOCK / PK-ROGUE: PRD state of the fragment and status procs (per source and key, see kitProc). */
  private readonly kitPrd = new Prd();
  /** KIT: clock of the last PRD roll per source and key (the DoT beat / internal cooldown gate). */
  private kitRollAt = new Map<string, number>();
  /** KIT PK-ROGUE Gölge Tekniği: Subtlety melee hits counted so far (every 4th grants a combo point). */
  private shadowTechHits = 0;
  /** KIT PK-ROGUE Gölge Bıçakları: clock of the last builder that granted its bonus combo point (one per swing). */
  private lastShadowCpAt = -9;
  /** PM-00b: clock of the last consume-on-hit removal per `playerId:status` (ICD gate). */
  private consumeAt = new Map<string, number>();
  /** PM-00b: recent damage taken by the players (ring buffer, see damageTakenWithin). */
  private takenLog: { id: EntityId; t: number; amount: number }[] = [];
  private wasDodging = false;
  private dodgeBase = new WeakMap<Player, { max: number; rec: number }>();
  private rng = new RNG((Date.now() ^ 0x5bd1e995) >>> 0);
  /** Feel accumulated over one frame (flushed in update): max hit-stop / trauma / kick / FOV kick, victims, slow-mo candidate. */
  private acc: FeelAcc = newFeelAcc();
  private stopLog: { t: number; ms: number }[] = [];
  /** Death recap ring buffer of the LOCAL player (GDD_V2 §8.5), published as `death:recap` on death. */
  readonly deathLog = new DeathLog();
  /** Second stage of two-stage enemy flashes (GDD_LIFE §5.5), applied when the first stage has played. */
  private flashQueue: { a: Enemy; at: number; c: number; ms: number }[] = [];
  private lastSlowAt = -99;
  /** CW-06: clock of the last weak_hit / resist_hit cue (shared gate, at most one per 0.15 s). */
  private lastElemCueAt = -9;
  /** Telemetry of the last feel frame (dev overlay: stop, freezes, trauma, kick, hits per second). */
  readonly feelTel = { weight: 'none', stop: 0, victims: 0, freezes: 0, trauma: 0, kick: 0, fov: 0, flashMs: 0, hitsPerSec: 0, hitTimes: [] as number[] };
  private fxList: HitFx[] = [];
  private reactCd = new Map<EntityId, number>();
  private stagger = new Map<EntityId, StaggerState>();
  /** enemy -> the `reviveCount` it already died at (a Diriltici champion brings enemies back: their next death must count again). */
  private deadEnemies = new WeakMap<object, number>();
  private corpses: { enemy: Enemy; t: number }[] = [];
  private seenPlayers = new WeakSet<object>();
  private localDead = false;
  private potionCd = { hp: 0, mp: 0, cleanse: 0 };
  private lastRes = { hp: -1, maxHp: -1, res: -1, maxRes: -1 };
  private slow: { until: number; recover: number; active: boolean; scale: number } = { until: 0, recover: 0, active: false, scale: 1 };
  private lifeStealLog: { t: number; amount: number }[] = [];
  private clock = 0;
  /** Seconds corpses stay before the safety-net removal (enemies module normally dissolves them earlier). */
  corpseLifetime = FEEL.corpseLifetime;

  constructor() {
    const net = G.net;
    if (net) {
      net.on('hit', (p, from) => this.onNetHit(p, from));
      net.on('dmg', (p) => this.onNetDmg(p));
      net.on('death', (p) => this.onNetDeath(p));
      net.on('estatus', (p) => this.onNetEnemyStatus(p));
      net.on('heal', (p) => this.onNetHeal(p));
      net.on('pstatus', (p) => this.onNetPlayerStatus(p));
      net.on('revive', (p) => this.onNetRevive(p));
      net.on('pdeath', (p, from) => this.onNetPlayerDeath(p, from));
    }
    this.combo.onTierUp = (tier) => this.comboTierFx(tier);
    G.events?.on('scene:leaving', () => this.clearScene());
    G.events?.on('player:releaseRequested', () => { /* scene teleports and calls reviveLocalPlayer */ });
  }

  // ======================================================================================================
  // Outgoing damage (player -> enemy)
  // ======================================================================================================

  /** Local player hits an enemy. Returns the predicted result (null if invalid target). */
  playerHitEnemy(attacker: Player, target: Enemy, spec: HitSpec): DamageResult | null {
    if (!attacker || !target || target.removed || target.isDead || attacker.isDead) return null;
    if (target.statuses.invulnerable) {
      this.statusEvent(target, 'immune', null);
      return { amount: 0, crit: false, type: spec.type, killed: false, immune: true };
    }
    // Patlayıcı Küre (M+): DoTs and zone ticks cannot pop it (G.mplus decides, nothing is spent / predicted)
    if ((spec.isDot || spec.tick) && !this.mayDamage(target, !!spec.isDot, !!spec.tick)) return null;
    const tags = spec.tags ?? [];
    const isMelee = tags.includes('melee');
    const wasFrozen = target.statuses.has('freeze');

    // stealth / ambush / Gölge Dansı window. KIT PK-0: the stealth opener (x1.5, forced crit, consumed on the hit) is only the
    // Kaybol stealth (ActiveStatus.opener). While Gölge Dansı (shadow_veil_cd) is up, hits neither consume stealth nor get the opener.
    let forceCrit = !!spec.forceCrit;
    let more = spec.more ?? 1;
    let critAdd = spec.critAdd ?? 0;
    if (!spec.isDot && !spec.tick) {
      const danceUp = attacker.statuses.has('shadow_veil_cd');
      if (!danceUp && attacker.statuses.get('stealth')?.opener === true) {
        more *= 1.5; forceCrit = true;
        critAdd += sp('leg_nightstalker_hood')?.critDamage ?? 0;
        attacker.statuses.remove('stealth');
        G.vfx.spawn('stealth_smoke', attacker.pointAt(0.4));
      }
      if (isMelee && attacker.statuses.has('ambush')) {
        forceCrit = true;
        attacker.statuses.remove('ambush');
      }
      if (attacker.statuses.has('dancer')) {
        forceCrit = true;
        attacker.statuses.remove('dancer');
      }
    }
    // backstab (GDD_V2 §3.6): a melee hit from inside the target's rear 100 deg. x1.3 damage (Suikastçı x1.6), poise x1.5 (boss x1.2)
    let stagger = spec.stagger;
    let hitstop = spec.hitstop;
    let shake = spec.shake;
    const backstab = !spec.isDot && !spec.tick && isMelee && target.def.backstabbable !== false && this.isBehind(attacker, target);
    if (backstab) {
      more *= sp('n_assassin') ? 1.6 : 1.3;
      // a poise-broken or stunned enemy hit from behind is a Kritik Vuruş: guaranteed crit (the flat finisher bonus is not applied here)
      if (target.statuses.has('marked_crit') || target.statuses.stunned) forceCrit = true;
      if (stagger) stagger *= target.isBoss ? 1.2 : 1.5;
      hitstop = Math.max(hitstop ?? 0, FEEL_TABLE.backstab.stop);
      shake = Math.max(shake ?? 0, FEEL_TABLE.backstab.trauma);
      const bp = this.impactPos(target);
      try {
        G.vfx.spawn('backstab_mark', bp, { scale: 1 });
        G.audio.play('backstab', { pos: bp, pitchVar: 0.05 });
      } catch { /* feedback only */ }
      this.numberAt(target, 0, 'crit', 'ARKADAN!');
      // one route token per swing (a sweep that backstabs three enemies is still one action)
      if (this.clock - this.lastBskAt > 0.05) {
        this.lastBskAt = this.clock;
        G.skills?.noteRoute(attacker, 'BSK');
      }
    }
    const s2: HitSpec = { ...spec, forceCrit, more, critAdd, stagger, hitstop, shake };
    const roll = this.rollOutgoing(attacker, s2, target);
    let amount = this.mitigate(target, roll.amount, spec.type, attacker.level, {
      armorPen: clamp(attacker.getStat('armorPen') + (spec.armorPen ?? 0), 0, 0.5),
      resPen: softStat(attacker, 'resPen') + (spec.resPen ?? 0),
    });
    amount *= target.statuses.takenMore() * takenPerStack(target);
    // PM-00b (plate-melee §g need 4): colossus / judged add damage from the applier only
    amount *= target.statuses.takenMoreFrom(attacker.id);
    if (wasFrozen) {
      const fc = sp('leg_frozen_crown');
      if (fc) amount *= 1 + (fc.frozenDamage ?? 0.25);
    }
    if (this.isStaggerBroken(target)) amount *= 1.25;
    amount *= this.levelDiffOut(attacker.level, target.level);
    amount = Math.max(1, Math.round(amount));

    const statuses = this.resolveStatuses(spec, roll, attacker);
    const pos = spec.pos ?? this.impactPos(target);
    const dir = spec.dir ?? this.dirFromTo(attacker, target);
    const weight = spec.weight ?? (spec.tick ? 'tick' : spec.isDot ? 'tick' : 'light');

    this.onPlayerDealt(attacker, amount, spec);
    if (!spec.isDot && !spec.tick && !spec.noCombo) this.combo.onHit(1);
    attacker.combatTimer = 0;

    let killed = false;
    const opts: ApplyDamageOpts = { skillId: spec.skillId, dot: spec.isDot, weight, stagger, knockup: spec.knockup, pos, noReact: spec.noReact, tick: spec.tick, threatMult: spec.threatMult, viaId: spec.viaId };
    if (!G.net || G.net.isAuthority) {
      this.applyDamageToEnemy(target, amount, roll.crit, spec.type, attacker.id, statuses, spec.skillId, spec.knockback, dir, opts);
      killed = target.isDead;
      if (killed && wasFrozen && !spec.isDot && this.shatterDepth < 2) this.shatter(attacker, target);
    } else {
      // client: predict number + flash, host applies
      this.showEnemyHit(target, amount, roll.crit, spec.type, attacker.id, dir, opts, Math.min(amount, Math.max(0, target.hp)));
      if (target.hp - amount >= 1) target.hp -= amount;
      else target.hp = Math.max(1, target.hp * 0.1);
      target.combatTimer = 0;
      G.net.sendToHost('hit', {
        targetId: target.id, amount, crit: roll.crit, type: spec.type, skillId: spec.skillId,
        statuses, knockback: spec.knockback, dir, isDot: spec.isDot || spec.tick, poise: stagger ?? 0, via: spec.viaId,
      });
    }
    if (!killed && isMelee && spec.type === 'physical' && !spec.isDot && !spec.tick) {
      const sb = sp('n_spellblade');
      if (sb) this.extraDamage(attacker, target, roll.noCrit * (sb.meleePhysAsExtraFire ?? 0.1), 'fire', spec.skillId, dir, pos);
    }
    this.noteFeel(s2, weight, roll.crit, killed, target, attacker, dir);
    this.afterPlayerHit(attacker, target, spec, amount, roll.crit, killed, wasFrozen, statuses);
    return { amount, crit: roll.crit, type: spec.type, killed };
  }

  /**
   * GDD_TALENTS T7: what a landed player hit feeds. Proc triggers hit / crit / status / kill (G.procs) and the spec hook
   * tables (mage onHit / onFreeze). DoT and zone ticks never count, and a proc's own hits (`proc` tag) cause no procs.
   */
  private afterPlayerHit(attacker: Player, target: Enemy, spec: HitSpec, amount: number, crit: boolean, killed: boolean, wasFrozen: boolean, statuses: StatusApply[] | undefined): void {
    if (spec.isDot || spec.tick || !(amount > 0)) return;
    const tags = spec.tags ?? [];
    if (!tags.includes('proc')) {
      const ctx = { player: attacker, skillId: spec.skillId, tags, target, crit, amount };
      G.procs?.emit('hit', ctx);
      if (crit) G.procs?.emit('crit', ctx);
      for (const s of statuses ?? []) G.procs?.emit('status', { ...ctx, status: s.status });
      if (killed) G.procs?.emit('kill', ctx);
    }
    if (attacker.isLocal) this.kitHitHooks(attacker, target, spec, tags, crit, amount);
    const hooks = specHooksOf(attacker);
    const def = spec.skillId ? G.skills?.getDef(spec.skillId) : undefined;
    if (hooks.length === 0 || !def) return;
    const mctx = { now: G.world?.time ?? 0, w: weaponAvg(attacker) };
    for (const h of hooks) h.onHit?.({ source: attacker, target, def, type: spec.type, crit, dot: false, amount }, mctx);
    if (!wasFrozen && target.statuses.has('freeze')) {
      for (const h of hooks) h.onFreeze?.(attacker, def, mctx);
    }
  }

  /**
   * KIT PK-WARLOCK / PK-ROGUE proc gate: a PRD roll (prd.ts) for `key` on `src`, at most one roll per `icd` seconds (0 = every call).
   * Azap and Yakıp Yıkma ticks use the 2 s DoT beat of the kit tables, so their rates match the §10 / §11 budgets.
   */
  private kitProc(src: Actor, key: string, p: number, icd: number): boolean {
    const id = `${src.id}:${key}`;
    if (icd > 0) {
      const last = this.kitRollAt.get(id) ?? -Infinity;
      if (this.clock - last < icd) return false;
      this.kitRollAt.set(id, this.clock);
    }
    return this.kitPrd.roll(id, p, () => this.rng.next());
  }

  /** KIT PK-WARLOCK: grants soul fragments (pip `shard`, stored in fragments: 10 = one shown shard). Warlocks only. */
  private shardGain(src: Actor, frags: number): void {
    if (src.kind !== 'player' || (src as Player).classId !== 'warlock') return;
    G.skills?.addPip(src, 'shard', frags);
  }

  /**
   * KIT hit feed of the local player's direct hits (after a landed hit, never a DoT tick):
   *   warlock: Gölge Oku PRD 6 % (+10), Kül Etme crit +1 and Şeytani Zalimlik PRD 8 % (icd 6 s), LMB step 4 PRD 20 % (+10);
   *   Simyacı: every damaging hit feeds Simya Bağı (link.ts);
   *   Suikastçı / Gölge Tekniği: every 4th Subtlety melee hit grants +1 Kombo Puanı (2nd while Gölge Dansı is up);
   *   Gölge Bıçakları: the first builder swing (combo-granting, not a finisher) of each swing gives +1 Kombo Puanı.
   *   Ateş Patlaması: a burning target passes the burn to spreadMax enemies within spreadR at spreadMult.
   */
  private kitHitHooks(attacker: Player, target: Enemy, spec: HitSpec, tags: readonly string[], crit: boolean, amount: number): void {
    const id = spec.skillId;
    const def = id ? G.skills?.getDef(id) : undefined;
    if (attacker.classId === 'warlock' && id) {
      if (id === 'warlock_shadow_bolt' && this.kitProc(attacker, id, 0.06, 0)) this.shardGain(attacker, 10);
      if (id === 'warlock_basic_4' && this.kitProc(attacker, id, 0.2, 0)) this.shardGain(attacker, 10);
      if (id === 'warlock_incinerate' && crit) {
        this.shardGain(attacker, 1);
        if (this.kitProc(attacker, 'fiendish_cruelty', 0.08, 6)) attacker.statuses.apply('fiendish_cruelty', 10, { sourceId: attacker.id });
      }
    }
    if (attacker.spec === 'rogue_alchemist') applyAlchemyLink(attacker, amount, G.world?.players ?? []);
    if (attacker.spec === 'rogue_subtlety' && tags.includes('melee')) {
      this.shadowTechHits++;
      const every = attacker.statuses.has('shadow_veil_cd') ? SHADOW_TECHNIQUE.everyInDance : SHADOW_TECHNIQUE.every;
      if (this.shadowTechHits % every === 0) {
        G.skills?.addCombo(attacker, SHADOW_TECHNIQUE.cp);
        G.skills?.gainResource(attacker, SHADOW_TECHNIQUE.energy);
      }
    }
    const builder = !!def && (def.params?.cp ?? 0) > 0 && def.behavior !== 'kit_finisher';
    if (builder && attacker.statuses.has('shadow_blades') && this.clock - this.lastShadowCpAt > 0.05) {
      this.lastShadowCpAt = this.clock;
      G.skills?.addCombo(attacker, 1);
    }
    if (id === 'mage_fire_blast' && target.statuses.has('burn')) {
      const burn = target.statuses.get('burn');
      const p = def?.params ?? {};
      if (burn && burn.dps > 0) {
        const pool = G.world?.enemiesInRadius({ x: target.position.x, z: target.position.z }, p.spreadR ?? 8, target.position.y) ?? [];
        const near = pool.filter((e) => e !== target && !e.isDead).slice(0, p.spreadMax ?? 2);
        for (const e of near) {
          this.applyEnemyStatuses(attacker, e, [{ status: 'burn', duration: burn.remaining, magnitude: burn.magnitude, dps: burn.dps * (p.spreadMult ?? 0.6) }]);
        }
      }
    }
  }

  private shatterDepth = 0;

  /** A frozen enemy died: it shatters (GDD 1.8 Donma) — frost burst, nearby enemies take 50% weapon damage as frost. */
  private shatter(attacker: Player, t: Enemy): void {
    const x = t.position.x, z = t.position.z;
    try {
      G.vfx.spawn('frost_burst', [x, t.position.y + t.height * 0.5, z], { scale: 1.6 });
      G.vfx.spawn('hit_spark', [x, t.position.y + t.height * 0.55, z], { scale: 1.2, color: 0xcff3ff });
      G.audio.play('frost_impact', { pos: [x, 0, z], pitch: 1.25 });
      this.numberAt(t, 0, 'crit', 'PARÇALANDI!');
      G.events.emit('camera:shake', { intensity: 0.16, duration: 0.2 });
    } catch { /* ignore */ }
    const list = G.world?.enemiesInRadius({ x, z }, 2.2, t.position.y) ?? [];
    this.shatterDepth++;
    try {
      for (const e of list) {
        if (e === t || e.isDead || e.removed) continue;
        const dx = e.position.x - x, dz = e.position.z - z;
        const l = Math.hypot(dx, dz) || 1;
        this.playerHitEnemy(attacker, e, {
          skillId: 'shatter', coef: 0.5, type: 'frost', isSpell: true, tags: ['spell', 'frost', 'aoe'], weight: 'light', noCombo: true,
          dir: [dx / l, dz / l], knockback: 0.8,
        });
      }
    } finally {
      this.shatterDepth--;
    }
  }

  /**
   * A second, already-rolled damage instance of the same blow (Büyülü Kılıç fire): mitigated, shown as a small number,
   * never feels like a new hit (no combo / hit-stop).
   */
  private extraDamage(attacker: Player, target: Enemy, raw: number, type: DamageType, skillId: string | undefined, dir: [number, number], pos: [number, number, number]): void {
    if (raw <= 0 || target.isDead) return;
    const amount = Math.max(1, Math.round(this.mitigate(target, raw, type, attacker.level, { resPen: softStat(attacker, 'resPen') }) * target.statuses.takenMore() * takenPerStack(target) * this.levelDiffOut(attacker.level, target.level)));
    const opts: ApplyDamageOpts = { skillId, weight: 'tick', tick: true, noReact: true, pos };
    if (!G.net || G.net.isAuthority) this.applyDamageToEnemy(target, amount, false, type, attacker.id, undefined, skillId, 0, dir, opts);
    else {
      this.showEnemyHit(target, amount, false, type, attacker.id, dir, opts, Math.min(amount, Math.max(0, target.hp)));
      if (target.hp - amount >= 1) target.hp -= amount;
      G.net.sendToHost('hit', { targetId: target.id, amount, crit: false, type, skillId, dir, isDot: true });
    }
  }

  /** Raw outgoing damage of an attacker for a spec (crit rolled, no target mitigation). */
  rollOutgoing(attacker: Actor, spec: HitSpec, target?: Actor): { amount: number; crit: boolean; base: number; noCrit: number } {
    const lvl = attacker.level;
    let wMin = attacker.getStat('weaponMin');
    let wMax = attacker.getStat('weaponMax');
    if (wMax <= 0) { // no gear stats (dev / unarmed fallback): level-scaled weapon so combat is never 0
      wMin = 4 + lvl * 2;
      wMax = wMin * 1.45;
    }
    if (wMin > wMax) wMin = wMax;
    let W = wMin + this.rng.next() * (wMax - wMin);
    if (spec.isSpell) W += attacker.getStat('spellPower');
    let base = W * spec.coef + (spec.flat ?? 0);

    const cls = attacker.kind === 'player' ? CLASSES[(attacker as Player).classId] : null;
    // PM-00a (plate-melee §g need 10): a spec's own mainStat (Kutsal int, Death Knights str) wins over the class default.
    if (cls) base *= 1 + Math.max(0, attacker.getStat(specOf(attacker)?.mainStat ?? cls.mainStat)) / 100;

    // increased bucket (one additive sum)
    const tags = spec.tags ?? [];
    const local = attacker.kind === 'player' && (attacker as Player).isLocal;
    let inc = attacker.getStat('damagePct');
    if (local) inc += this.sp.eyeBonus(spec.type);
    const tp = MAIN_STAT_TYPE_PCT[spec.type];
    if (tp) inc += attacker.getStat(tp);
    if (tags.includes('melee')) inc += softStat(attacker, 'meleeDamagePct');
    if (tags.includes('projectile')) inc += softStat(attacker, 'projectileDamagePct');
    if (tags.includes('aoe')) inc += attacker.getStat('aoePct');
    if (spec.isDot) inc += attacker.getStat('dotPct');
    if (tags.includes('bleed')) inc += softStat(attacker, 'bleedDamagePct');
    if (target && target.kind === 'enemy') {
      const rank = (target as Enemy).def.rank;
      if (rank === 'boss') inc += attacker.getStat('bossDamagePct');
      else if (rank === 'elite' || rank === 'miniboss') inc += attacker.getStat('eliteDamagePct');
      if (target.hpFrac < 0.35) inc += softStat(attacker, 'executeDamagePct');
      if (target.statuses.has('bleed') || target.statuses.has('poison')) inc += softStat(attacker, 'ailingDamagePct');
      if (target.statuses.has('chill') || target.statuses.has('freeze')) inc += softStat(attacker, 'chilledDamagePct');
    }
    base *= Math.max(0.05, 1 + inc);

    // more multipliers
    base *= attacker.statuses.dealtMore();
    if (local) {
      base *= this.combo.bonus;
      if (this.clock < this.routeBuffUntil) base *= 1.05; // combo route (GDD_V2 §3.9): +5% for 3 s
      base *= G.character?.moreDamage ?? 1; // keystones (Cam Top, Sabit El...)
      base *= skillRankDamageMult(spec.skillId); // Beceri Kitabı: +5% per rank above 1 (skill hits only)
      const bs = sp('ks_berserker_soul');
      if (bs) base *= 1 + Math.min(bs.maxMoreDamage ?? 0.6, (1 - attacker.hp / Math.max(1, attacker.maxHp)) * (bs.moreDamagePerMissingHpPct ?? 1));
    }
    base *= spec.more ?? 1;
    const noCrit = base;

    // crit
    let crit = false;
    if (spec.canCrit !== false && !spec.isDot) {
      let chance = clamp(Math.max(0.05, attacker.getStat('critChance')), 0, 0.75);
      if (cls?.id === 'rogue' && target && (target.statuses.stunned || target.statuses.has('slow') || target.statuses.has('blind'))) chance += 0.1;
      const behind = !!target && local && this.isBehind(attacker, target);
      if (behind) chance += sp('n_assassin')?.backstabCritChance ?? 0;
      chance += spec.critBonus ?? 0;
      if (spec.critScale !== undefined) chance *= spec.critScale; // NC42: minion hits crit with half the owner's chance
      // KIT PK-WARLOCK Kaos Oku (params.alwaysCrit): the hit always crits, no roll is spent
      const alwaysCrit = !!(spec.skillId && G.skills?.getDef(spec.skillId)?.params?.alwaysCrit);
      crit = !!spec.forceCrit || alwaysCrit || this.rng.next() < chance;
      if (crit) {
        let mult = 1.5 + attacker.getStat('critDamage') + (spec.critAdd ?? 0);
        if (cls?.id === 'rogue' && behind) mult += 0.25;
        if (local) {
          const pyro = sp('n_pyromancer');
          if (pyro && target?.statuses.has('burn')) mult += pyro.critDamageVsBurning ?? 0.1;
          const pa = sp('ks_perfect_agony');
          if (pa && !spec.isDot) mult = 1 + (mult - 1) * (pa.hitCritMultScale ?? 0.7);
        }
        base *= mult;
      }
    }
    return { amount: base, crit, base: W, noCrit };
  }

  /** Target-side mitigation (armor for physical, resists for elemental). */
  mitigate(target: Actor, amount: number, type: DamageType, attackerLevel: number, opts?: { armorPen?: number; resPen?: number }): number {
    if (type === 'true' || amount <= 0) return amount;
    const resPen = opts?.resPen ?? 0;
    const aLvl = Math.max(1, attackerLevel || 1);
    const armorOf = (): number => target.getStat('armor') * (1 - clamp(opts?.armorPen ?? 0, 0, 0.5));
    const enemyDef = target.kind === 'enemy' ? (target as Enemy).def : null;
    const resist = (t: DamageType): number => {
      let r = 0;
      if (enemyDef) r += normRes(enemyDef.resist?.[t]);
      const rs = RES_STAT[t];
      if (rs) r += target.getStat(rs) + target.getStat('resAll');
      return r;
    };
    let mult: number;
    if (type === 'physical') {
      const armor = armorOf();
      let dr = armor > 0 ? armor / (armor + 50 * aLvl + 200) : 0;
      dr = Math.min(0.75, dr);
      if (enemyDef) dr = 1 - (1 - normRes(enemyDef.resist?.physical)) * (1 - dr);
      mult = 1 - clamp(dr, -1, 0.9);
    } else if (type === 'holy') {
      mult = 1 - clamp(enemyDef ? normRes(enemyDef.resist?.holy) : 0, -1, 0.9);
    } else if (type === 'arcane') {
      const r = Math.min(resist('fire'), resist('frost'), resist('lightning')) - resPen;
      mult = 1 - clamp(r, -1, target.kind === 'player' ? 0.75 : 0.9);
    } else {
      mult = 1 - clamp(resist(type) - resPen, -1, target.kind === 'player' ? 0.75 : 0.9);
    }
    return amount * mult;
  }

  /** M+ hook: may this damage hurt this enemy? (Explosive orbs ignore DoTs and zone ticks.) Never throws. */
  private mayDamage(target: Enemy, dot: boolean, tick: boolean): boolean {
    try {
      return G.mplus ? G.mplus.canDamageEnemy(target, { dot, tick }) : true;
    } catch {
      return true;
    }
  }

  /** True inside an open-world zone (Sisli Koru...): the GDD level-difference rule only applies there. */
  private openWorld(): boolean {
    const id = G.mplus?.state?.dungeonId;
    return !!id && id in OPEN_ZONES;
  }

  /** GDD_SYSTEMS 1.5 step 8 (open world only): player -> higher-level monster x max(0.40, 1 - 0.06 (Lm - Lp)). */
  private levelDiffOut(playerLevel: number, monsterLevel: number): number {
    const d = (monsterLevel || 0) - (playerLevel || 0);
    if (d <= 0 || !this.openWorld()) return 1;
    return Math.max(0.4, 1 - 0.06 * d);
  }

  /** GDD_SYSTEMS 1.5 (open world only): higher-level monster -> player x min(1.5, 1 + 0.05 (Lm - Lp)). */
  private levelDiffIn(monsterLevel: number | undefined, playerLevel: number): number {
    if (monsterLevel === undefined) return 1;
    const d = monsterLevel - (playerLevel || 0);
    if (d <= 0 || !this.openWorld()) return 1;
    return Math.min(1.5, 1 + 0.05 * d);
  }

  /**
   * Statuses with dot snapshots (dps filled by the ATTACKER: host ticks them). Venom adds a poison stack; on-hit ailment chances
   * (bleedChance/burnChance/poisonChance x proc), Fısıltı crit poison, talent duration / stack bonuses and ccDurationPct are folded in here.
   */
  private resolveStatuses(spec: HitSpec, roll: { base: number; noCrit: number; crit?: boolean }, attacker: Actor): StatusApply[] | undefined {
    const list: StatusApply[] = [];
    for (const s of spec.statuses ?? []) list.push({ ...s });
    const tags = spec.tags ?? [];
    const direct = !spec.isDot && !spec.tick;
    if (direct && attacker.statuses.has('venom') && tags.some((t) => t === 'melee' || t === 'projectile')) {
      list.push({ status: 'poison', duration: 4, magnitude: 0.15, stacks: 1 });
    }
    const local = attacker.kind === 'player' && (attacker as Player).isLocal;
    if (direct && local) {
      const proc = spec.proc ?? 1;
      const chanceOf = (status: StatusId, stat: string, dur: number, mag: number): void => {
        const ch = softStat(attacker, stat) * proc;
        if (ch > 0 && !list.some((x) => x.status === status) && this.rng.next() < ch) list.push({ status, duration: dur, magnitude: mag });
      };
      chanceOf('bleed', 'bleedChance', 4, 0.3);
      chanceOf('burn', 'burnChance', 3, 0.3);
      chanceOf('poison', 'poisonChance', 4, 0.15);
      const wh = sp('leg_whisper');
      if (wh && roll.crit) list.push({ status: 'poison', duration: 4, magnitude: 0.15, stacks: wh.poisonStacks ?? 2 });
    }
    if (!list.length) return undefined;
    const ccMul = 1 + Math.max(0, softStat(attacker, 'ccDurationPct'));
    const pyro = local ? sp('n_pyromancer') : null;
    const cryo = local ? sp('n_cryomancer') : null;
    const toxic = local ? sp('n_toxicologist') : null;
    const agony = local ? sp('ks_perfect_agony') : null;
    for (const s of list) {
      const rule = STATUS_RULES[s.status];
      if (rule?.hard || s.status === 'silence') s.duration *= ccMul;
      if (s.status === 'burn' && pyro) s.duration *= 1 + (pyro.burnDurationPct ?? 0.5);
      if (s.status === 'freeze' && cryo) s.duration *= 1 + (cryo.freezeDurationPct ?? 0.3);
      if (s.status === 'poison' && toxic) {
        s.duration *= 1 + (toxic.poisonDurationPct ?? 0.25);
        s.maxStacks = (STATUSES.poison?.maxStacks ?? 10) + (toxic.poisonMaxStacks ?? 5);
      }
      const def = STATUSES[s.status];
      // max-HP rot (Kirlenme) ticks from the owner's max HP, so it needs no attacker dps snapshot
      if (!def?.dotType || s.dps !== undefined || rule?.maxHpPctPerSec) continue;
      const mag = s.magnitude ?? 0.3;
      let dps: number;
      if (s.status === 'poison') dps = roll.base * mag * (attacker.statuses.has('venom') ? 1.5 : 1);
      else dps = (roll.noCrit * mag) / Math.max(0.5, s.duration);
      const tp = MAIN_STAT_TYPE_PCT[def.dotType];
      dps *= 1 + attacker.getStat('dotPct') + (tp ? attacker.getStat(tp) : 0) + (s.status === 'bleed' ? softStat(attacker, 'bleedDamagePct') : 0);
      // Kusursuz İşkence: bleed / poison snapshots may crit
      if (agony && (s.status === 'bleed' || s.status === 'poison') && this.rng.next() < clamp(Math.max(0.05, attacker.getStat('critChance')), 0, 0.75)) {
        dps *= 1.5 + attacker.getStat('critDamage');
      }
      // stacked applications (Fısıltı: 2 stacks) carry the dps of every stack
      if (STATUS_RULES[s.status]?.stack === 'dotstack') dps *= Math.max(1, s.stacks ?? 1);
      s.dps = Math.max(0.5, dps);
    }
    return list;
  }

  /** Life steal / on-hit healing of the LOCAL attacker (proc coefficient, capped at 10% max HP per rolling second). */
  private onPlayerDealt(attacker: Player, amount: number, spec: HitSpec): void {
    if (!attacker.isLocal || spec.isDot) return;
    const proc = spec.proc ?? 1;
    let heal = attacker.getStat('hpOnHit') * proc;
    heal += this.leech(attacker, amount, proc, 1);
    if (heal > 0.4) this.applyHeal(attacker, heal, attacker.id, { raw: true });
  }

  /** Life steal amount of a hit, capped per rolling second (10% max HP; Kan Kurbanı raises it, Çılgının Kemeri adds steal when low). */
  private leech(attacker: Player, amount: number, proc: number, eff: number): number {
    let ls = attacker.getStat('lifeSteal');
    const mm = sp('leg_madmans_belt');
    if (mm && attacker.hp / Math.max(1, attacker.maxHp) < (mm.hpBelow ?? 0.5)) ls += mm.lifeSteal ?? 0.03;
    if (ls <= 0) return 0;
    const cap = attacker.maxHp * (sp('ks_blood_sacrifice')?.lifeStealCapPct ?? 0.1);
    this.lifeStealLog = this.lifeStealLog.filter((e) => this.clock - e.t < 1);
    const used = this.lifeStealLog.reduce((a, e) => a + e.amount, 0);
    const v = Math.max(0, Math.min(amount * ls * proc * eff, cap - used));
    if (v > 0) this.lifeStealLog.push({ t: this.clock, amount: v });
    return v;
  }

  /** Kan Yüzüğü: damage-over-time ticks of the local player's statuses leech at 50%. */
  private dotLeech(sourceId: EntityId | null, amount: number): void {
    const lp = G.world?.localPlayer;
    if (!lp || sourceId !== lp.id || lp.isDead) return;
    const br = sp('leg_blood_ring');
    if (!br) return;
    const h = this.leech(lp, amount, 1, br.dotLifeSteal ?? 0.5);
    if (h > 0.4) this.applyHeal(lp, h, lp.id, { raw: true, quiet: true });
  }

  // ======================================================================================================
  // HOST: apply damage to an enemy
  // ======================================================================================================

  /** HOST: apply final damage to an enemy (from the local player or a remote HitReport). Handles death. */
  applyDamageToEnemy(target: Enemy, amount: number, crit: boolean, type: DamageType, sourceId: EntityId | null, statuses?: StatusApply[], skillId?: string, knockback?: number, dir?: [number, number], opts: ApplyDamageOpts = {}): void {
    if (!target || target.removed || target.isDead) return;
    if (target.statuses.invulnerable && amount > 0) {
      this.statusEvent(target, 'immune', null);
      return;
    }
    const dot = !!opts.dot;
    // explosive orb: only direct hits count (DoT ticks and zone ticks arrive here too, from the host's status ticks / remote 'hit's)
    if (amount > 0 && (dot || opts.tick) && !this.mayDamage(target, dot, !!opts.tick)) return;
    // KIT PK-WARLOCK (§10a, §11a): a landed Azap tick (14 %, +10 fragments) or Yakıp Yıkma tick (12 %, +1) rolls fragments
    if (dot && amount > 0 && sourceId !== null && (skillId === 'agony' || skillId === 'immolate')) {
      const src = G.world?.getActor(sourceId);
      if (src && src.kind === 'player') {
        const agony = skillId === 'agony';
        if (this.kitProc(src, skillId, agony ? 0.14 : 0.12, 2)) this.shardGain(src, agony ? 10 : 1);
      }
    }
    const hpBefore = target.hp;
    amount = Math.max(0, Math.round(amount));
    if (amount > 0) {
      target.hp = Math.max(0, target.hp - amount);
      target.combatTimer = 0;
      try { target.ai?.onDamaged?.(sourceId, amount, opts.threatMult, opts.viaId); } catch (e) { console.error('[combat] ai.onDamaged failed', e); }
      G.net?.broadcast('dmg', { targetId: target.id, amount, crit, type, sourceId, hp: target.hp, dot: dot || undefined });
      if (dot) this.dotLeech(sourceId, amount);
      this.showEnemyHit(target, amount, crit, type, sourceId, dir ?? [0, 1], { ...opts, skillId: opts.skillId ?? skillId }, Math.min(amount, hpBefore));
    }

    // stagger (elites+): from the skill table when the hit did not carry it
    if (!dot && amount > 0) {
      const pts = opts.stagger ?? (skillId ? SKILLS[skillId]?.params?.stagger ?? 0 : 0);
      if (pts > 0) this.addStagger(target, pts, sourceId);
    }

    if (statuses?.length) this.applyStatusesToEnemy(target, statuses, sourceId, opts.viaId);

    const dead = target.hp <= 0;
    if (!dot && knockback && knockback > 0 && !target.isBoss && !target.def.ccImmune && !this.isStaggerBroken(target)) {
      const d = dir ?? [0, 1];
      const dist = knockback * massFactor(target.def.rank, target.def.role);
      if (dist > 0.05) {
        const dur = knockbackDuration(dist);
        target.kbBy = sourceId; // EnemyAI attributes a cast this push cuts short to the hitter
        target.applyKnockback(d[0], d[1], dist, dur);
        if (amount > 0) this.checkWallSlam(target, d, dist, dur, amount, type, sourceId);
      }
    }
    if (!dot && amount > 0 && opts.knockup && opts.knockup > 0 && !target.isBoss && !target.def.ccImmune) this.addHop(target, opts.knockup);

    if (dead) {
      // GDD_LIFE §5.6 death fling: a killing blow of weight finisher or stronger, or any crit kill, throws the corpse 1.0-2.0 m
      // along the blow over 0.35 s (heavier blows throw further)
      const strongKill = opts.weight === 'finisher' || opts.weight === 'heavy' || opts.weight === 'ultimate' || opts.weight === 'stagger_break';
      if (!target.isBoss && !target.def.ccImmune && (opts.fling || strongKill || crit) && !dot) {
        const d = dir ?? [0, 1];
        const base = 1.0 + this.rng.next();
        const power = opts.weight === 'ultimate' ? Math.max(base, 2.0) : opts.weight === 'heavy' ? Math.max(base, 1.6) : base;
        target.applyKnockback(d[0], d[1], power * massFactor(target.def.rank, target.def.role), 0.35);
      }
      this.killEnemy(target, sourceId);
    }
  }

  private applyStatusesToEnemy(target: Enemy, statuses: StatusApply[], sourceId: EntityId | null, viaId?: EntityId): void {
    for (const s of statuses) {
      if (s.chance !== undefined && s.chance < 1 && this.rng.next() > s.chance) continue;
      // NC42: a taunt made by a minion belongs to the minion (EnemyAI.pickTarget reads taunt.sourceId), not to its owner
      const taunter = s.status === 'taunt' && viaId !== undefined ? viaId : sourceId;
      const ok = target.statuses.apply(s.status, s.duration, { stacks: s.stacks, magnitude: s.magnitude, sourceId: taunter, dps: s.dps });
      if (ok) {
        G.net?.broadcast('estatus', { targetId: target.id, status: s.status, duration: s.duration, stacks: target.statuses.stacks(s.status) || 1 });
        if (s.status === 'taunt' && taunter !== null) {
          target.targetId = taunter;
          if (viaId !== undefined) target.ai?.tauntThreat(viaId);
        }
        if (s.status === 'knockdown') this.addHop(target, 1);
      } else if (HARD_CC_IDS.includes(s.status)) {
        // CC-immune target: hard CC converts to stagger (x2 per second of duration)
        this.addStagger(target, s.duration * 25, sourceId);
        this.statusEvent(target, 'immune', null);
      }
    }
  }

  /**
   * Apply statuses to an enemy WITHOUT damage (taunt, blind, fear...). Host applies directly; a client sends a 0-damage
   * 'hit' that the host turns into the same statuses.
   */
  applyEnemyStatuses(attacker: Player, target: Enemy, statuses: StatusApply[]): void {
    if (!target || target.isDead || !statuses.length) return;
    if (!G.net || G.net.isAuthority) this.applyStatusesToEnemy(target, statuses, attacker.id);
    else G.net.sendToHost('hit', { targetId: target.id, amount: 0, crit: false, type: 'true', skillId: undefined, statuses, knockback: 0 });
  }

  /**
   * NC42 (GDD_CLASSES_V2 §1.5.2): a minion's taunt on one enemy. The taunt status belongs to the MINION (EnemyAI.pickTarget forces it
   * for `seconds`) and the enemy's threat table puts it at top x 1.10 + 100. Host applies directly; a client asks the host with a
   * 0-damage `hit` carrying `via`.
   */
  minionTaunt(m: Minion, target: Enemy, seconds: number, skillId = 'minion_taunt'): void {
    if (!m || !target || m.isDead || m.removed || target.isDead || target.removed) return;
    const statuses: StatusApply[] = [{ status: 'taunt', duration: Math.max(0.5, target.isBoss ? Math.min(seconds, 2) : seconds) }];
    if (!G.net || G.net.isAuthority) this.applyStatusesToEnemy(target, statuses, m.ownerId, m.id);
    else G.net.sendToHost('hit', { targetId: target.id, amount: 0, crit: false, type: 'true', skillId, statuses, knockback: 0, via: m.id });
  }

  /**
   * NC42 (GDD_CLASSES_V2 §1.5.2 rule 3): damage arriving at one of the LOCAL player's minions. Called from HitShapes (shapes and hostile
   * projectiles) on the minion's OWNER peer only, exactly like hitLocalPlayer for the local player. Mitigation is the minion's
   * armorFrac (Minions.hurt); no dodge, block or parry. Reaching 0 HP kills it (Minions.die: minion:died, bones, respawn queue).
   * Statuses and knockback are not applied to minions in this wave. Returns null when the minion cannot be hurt here.
   */
  hitMinion(m: Minion, hit: MinionHit): DamageResult | null {
    if (!m || m.isDead || m.removed || !m.authority || !(hit.amount > 0) || !G.minions) return null;
    if (m.statuses.invulnerable) return { amount: 0, crit: false, type: hit.type, killed: false, immune: true };
    const ownerLevel = (m.owner?.level ?? G.world?.localPlayer?.level) ?? 1;
    const raw = hit.amount * this.levelDiffIn(hit.sourceLevel, ownerLevel);
    const taken = G.minions.hurt(m, raw, hit.type);
    if (taken <= 0) return { amount: 0, crit: false, type: hit.type, killed: false };
    try {
      G.events.emit('damage', {
        targetId: m.id, sourceId: hit.sourceId, amount: taken, crit: false, type: hit.type,
        kind: hit.isDot ? 'dot' : 'normal', pos: [m.position.x, m.position.y + m.height * 0.6, m.position.z], overkill: 0,
      });
    } catch (e) {
      console.error('[combat] minion damage event failed', e);
    }
    if (!m.isDead && !hit.isDot && taken >= m.maxHp * 0.05) m.playShot(m.def.anims.hit, 1.2);
    return { amount: taken, crit: false, type: hit.type, killed: m.isDead };
  }

  /** Drag an enemy along `dir` (Kasırganın Yüreği pull). Host applies directly; a client asks the host with a 0-damage hit. */
  pullEnemy(target: Enemy, dir: [number, number], dist: number): void {
    if (!target || target.isDead || target.isBoss || target.def.ccImmune || dist <= 0.05) return;
    if (!G.net || G.net.isAuthority) target.applyKnockback(dir[0], dir[1], dist * massFactor(target.def.rank, target.def.role), knockbackDuration(dist));
    else G.net.sendToHost('hit', { targetId: target.id, amount: 0, crit: false, type: 'true', knockback: dist, dir });
  }

  /**
   * Called by StatusEffects when a hard CC lands on an enemy (and by reactEnemy / addStagger): interrupt casts + windups.
   * `by` = the player (or enemy) whose stun / hit caused it, reported as castEnd.interruptedBy.
   */
  onHardCC(actor: Actor, by: EntityId | null = null): void {
    if (actor.kind !== 'enemy') return;
    const e = actor as Enemy;
    try {
      if (e.cast && e.cast.interruptible) {
        const cast = e.cast;
        e.cast = null;
        const interruptedBy = by ?? undefined;
        // CW-06: a cancelled cast reads "KESİLDİ" (Kes / Gırtlak Kesme / stun cut the windup)
        this.numberAt(e, 0, 'interrupt', 'KESİLDİ');
        G.events.emit('enemy:castEnd', { enemyId: e.id, abilityId: cast.skillId, interrupted: true, interruptedBy });
        // the host tells clients (they learn the cast ended and who ended it); a client's own prediction is not re-broadcast
        if (!G.net || G.net.isAuthority) {
          const endMsg = { enemyId: e.id, abilityId: cast.skillId, name: cast.name, castTime: 0, interruptible: false, ended: true, interrupted: true, interruptedBy };
          G.net?.broadcast('ecast', endMsg);
        }
      }
      G.hitShapes.cancelBySource(e.id);
    } catch (err) {
      console.error('[combat] onHardCC failed', err);
    }
  }

  // ---- poise (Duruş = the former stagger bar, GDD_V2 §3.7) ----

  private partySize(): number {
    return Math.max(1, Math.min(5, G.world?.players.length ?? 1));
  }

  /** The poise state of an enemy (created on demand; the max follows the party size). Callers check poiseMax first. */
  private stateOf(e: Enemy): StaggerState {
    let s = this.stagger.get(e.id);
    if (!s) {
      s = { v: 0, max: 0, delay: poiseDelay(e.def), rate: poiseRegenRate(e.def), brokenUntil: 0, lockedUntil: 0, lastGain: 0, finished: new Set() };
      this.stagger.set(e.id, s);
    }
    s.max = poiseMax(e.def, this.partySize());
    return s;
  }

  /** Adds poise damage. A full bar breaks (2 s window, marked_crit). Host / single player only. */
  private addStagger(e: Enemy, pts: number, by: EntityId | null = null): void {
    if (!poiseMax(e.def, this.partySize()) || e.isDead || !(pts > 0)) return;
    const s = this.stateOf(e);
    if (this.clock < s.lockedUntil || this.clock < s.brokenUntil) return;
    const lp = G.world?.localPlayer;
    // hyper-armour (GDD_V2 §3.7): during a heavy windup the enemy shrugs off part of the poise damage (armour x 0.5 cut)
    const armour = e.ai?.armoredNow() ? 1 - 0.5 * hyperArmorOf(e.def) : 1;
    s.v += pts * armour * (1 + softStat(lp, 'staggerPct') + softStat(lp, 'poiseDamagePct'));
    s.lastGain = this.clock;
    if (s.v >= s.max) this.breakPoise(e, by, breakSeconds(e.def));
  }

  /**
   * The bar is full (or a trash parry): the enemy is broken for `dur` s. Non-boss: stun (cancels its windup).
   * Everyone: `marked_crit` (Kritik Vuruş target) except swarm flinches; x1.25 damage taken while broken (playerHitEnemy).
   */
  private breakPoise(e: Enemy, by: EntityId | null, dur: number): void {
    const s = this.stateOf(e);
    const swarm = isSwarm(e.def);
    s.v = 0;
    s.brokenUntil = this.clock + dur;
    s.lockedUntil = s.brokenUntil + breakLock(e.def);
    s.finished.clear();
    if (!e.isBoss && !e.def.ccImmune) {
      e.statuses.apply('stun', dur, { replicated: true });
      G.net?.broadcast('estatus', { targetId: e.id, status: 'stun', duration: dur, stacks: 1 });
    }
    if (!swarm) {
      e.statuses.apply('marked_crit', dur, { replicated: true, sourceId: by });
      G.net?.broadcast('estatus', { targetId: e.id, status: 'marked_crit', duration: dur, stacks: 1 });
    }
    this.onHardCC(e, by);
    if (e.isBoss && e.def.stanceBreakable !== false) this.breakBossCast(e, by);
    this.numberAt(e, 0, 'crit', 'SENDELEDİ!');
    if (by !== null && G.world?.localPlayer?.id === by) this.meters.add('poiseBreak');
    G.events.emit('poise:break', { enemyId: e.id });
    feelBeat('poiseBreak', { pos: this.impactPos(e), sfx: 'stance_break', vfx: 'stance_break_shards' });
    try {
      G.vfx.spawn('stun_stars', e.pointAt(1.05), { duration: dur });
      G.vfx.flash(e.model ?? e.object3d, 0xffffff, 0.12);
    } catch { /* ignore */ }
  }

  /**
   * A broken boss drops its current cast even when the cast is not interruptible (GDD_V2 §3.7 OVERRIDE O1). Perilous casts
   * finish: they are the attacks the stance cannot stop. Host only (breakPoise runs on the host).
   */
  private breakBossCast(e: Enemy, by: EntityId | null): void {
    const ai = e.ai;
    const b = ai?.busy;
    if (!ai || !b || b.ab.perilous) return;
    ai.abortBusy('cc', by);
  }

  /** A finisher ends a trash / elite break (GDD_V2 §3.7): the mark and the stun go. Bosses keep their window. */
  private endPoiseBreak(e: Enemy): void {
    if (e.isBoss) return;
    const s = this.stagger.get(e.id);
    if (s) s.brokenUntil = this.clock;
    e.statuses.remove('marked_crit');
    e.statuses.remove('stun');
    // enemy statuses are host-authoritative: only the host (or offline) tells the others
    if (!G.net || G.net.isAuthority) G.net?.broadcast('estatus', { targetId: e.id, status: 'marked_crit', duration: 0, stacks: 1, removed: true });
  }

  /** HOST: a parry hit the enemy. Trash / swarm break at once (0.8 s recoil, windup cancelled); elite / mini / boss take poise. */
  applyParry(e: Enemy, by: EntityId | null): void {
    if (!e || e.isDead || e.removed) return;
    const pts = parryPoise(e.def, this.partySize());
    if (pts === Infinity) {
      if (!poiseMax(e.def, this.partySize())) return;
      const s = this.stateOf(e);
      if (this.clock < s.lockedUntil || this.clock < s.brokenUntil) return;
      this.breakPoise(e, by, COMBAT_FEEL.parryRecoilSec);
      return;
    }
    this.addStagger(e, pts, by);
  }

  /** Kritik Vuruş landed (attacker side): this player may not finish the same break again; trash / elite end the break. */
  markFinisher(e: Enemy, playerId: EntityId): void {
    const s = this.stagger.get(e.id);
    if (s) s.finished.add(playerId);
    this.endPoiseBreak(e);
  }

  /** May this player still execute a Kritik Vuruş on `e` in the current break window? */
  canFinish(e: Enemy, playerId: EntityId): boolean {
    const s = this.stagger.get(e.id);
    return !s || !s.finished.has(playerId);
  }

  /** Finisher damage bonus of the Kritik Vuruş by rank (GDD_V2 §3.7), before the 20 x W cap. */
  finisherPct(e: Enemy): number {
    return finisherPctMaxHp(e.def);
  }

  isStaggerBroken(e: Actor): boolean {
    const s = this.stagger.get(e.id);
    return !!s && this.clock < s.brokenUntil;
  }

  /** 0..1 poise bar fill of an enemy (for HUD / nameplates). */
  staggerFrac(e: Actor): number {
    const s = this.stagger.get(e.id);
    if (!s || e.kind !== 'enemy' || s.max <= 0) return 0;
    return clamp(s.v / s.max, 0, 1);
  }

  // ---- guard / parry (GDD_V2 §3.4, §3.5) ----

  /** LOCAL player per frame (PlayerController): `held` = guard key down, `pressed` = its press edge (opens the parry window). */
  guardInput(p: Player, held: boolean, pressed: boolean, busy: boolean): void {
    const can = !p.isDead && !p.statuses.stunned && !p.dodging;
    if (pressed && can) this.guard.press(this.clock, PARRY_WINDOW + softStat(p, 'parryWindow'));
    this.guard.held = held && can && !busy && this.guard.canGuard(this.clock);
  }

  /** Guard stance is up for this player this frame (movement x0.6, camera-facing, Siper block rules). */
  isGuarding(p: Player): boolean {
    return this.guard.held && !p.dodging && !p.isDead;
  }

  /** A parry landed on the victim's machine: riposte window, resource, feedback, poise to the host. */
  private onParried(p: Player, hit: IncomingHit): void {
    this.meters.add('parry');
    G.skills?.noteRoute(p, 'PAR'); // combo routes: "Parry -> Riposte" (GDD_V2 §3.9)
    const enemyId = hit.sourceId;
    G.events.emit('parry', { enemyId: enemyId ?? 0, perfect: true });
    const pos = this.impactPos(p);
    feelBeat('parry', { pos, sfx: 'parry', vfx: 'parry_flash' });
    this.slowmo(0.5, 0.06, 0.06); // 0.5x time for ~0.12 s
    G.skills?.addResource(p, COMBAT_FEEL.parryResource);
    try { p.statuses.apply('riposte', COMBAT_FEEL.riposteWindow, { sourceId: p.id }); } catch { /* ignore */ }
    this.numberAt(p, 0, 'block', 'SAVUŞTURMA!');
    if (enemyId === null) return;
    this.lastParry = { id: enemyId, at: this.clock };
    if (!G.net || G.net.isAuthority) {
      const e = G.world?.get<Enemy>(enemyId);
      if (e && e.kind === 'enemy') this.applyParry(e, p.id);
    } else {
      // the 'hit' channel carries the parry: amount 0 + skillId 'parry' (no new channel, see ARCHITECTURE V2 WP2 notes)
      G.net.sendToHost('hit', { targetId: enemyId, amount: 0, crit: false, type: 'true', skillId: 'parry', knockback: 0 });
    }
  }

  /** The enemy the local player parried most recently, while its riposte window (1.6 s) is open. Null otherwise. */
  parriedEnemy(): Enemy | null {
    const lp = this.lastParry;
    if (!lp || this.clock - lp.at > COMBAT_FEEL.riposteWindow) return null;
    const e = G.world?.get<Enemy>(lp.id);
    return e && e.kind === 'enemy' && !e.isDead && !e.removed ? e : null;
  }

  /**
   * Spends guard gauge outside a blocked hit (the LMB guard counter, GDD_V2 §3.4). A gauge that runs dry breaks the guard
   * exactly like a blocked break. Returns true when the gauge broke.
   */
  spendGuardGauge(p: Player, cost: number): boolean {
    if (!this.guard.profile || p.isDead || !(cost > 0)) return false;
    if (!this.guard.block(this.clock, cost)) return false;
    this.guardBroke(p, [p.position.x, p.position.y + p.height * 0.7, p.position.z]);
    return true;
  }

  /** Guard block of a frontal melee / projectile hit: the gauge pays, a break stuns and disables the guard. */
  private guardBlock(p: Player, raw: number, pos: [number, number, number]): void {
    if (!this.guard.block(this.clock, guardCost(raw, p.maxHp))) {
      this.meters.add('guardBlock');
      feelBeat('guardHit', { pos, sfx: 'guard_hit', vfx: 'guard_spark' });
      return;
    }
    this.guardBroke(p, pos);
  }

  /** Siper Kırıldı: stagger on the player, the guard drops for GUARD_BROKEN_SEC (set by GuardState.block). */
  private guardBroke(p: Player, pos: [number, number, number]): void {
    this.meters.add('guardBreak');
    G.events.emit('guard:broke', {});
    try { p.statuses.apply('stun', GUARD_BREAK_STUN, { sourceId: p.id }); } catch { /* ignore */ }
    feelBeat('guardBreak', { pos, sfx: 'guard_break', vfx: 'guard_break_shards' });
    this.numberAt(p, 0, 'block', 'SİPER KIRILDI!');
  }

  // ======================================================================================================
  // Enemy death
  // ======================================================================================================

  /** HOST: enemy death (xp/loot broadcast, forces, events). */
  killEnemy(enemy: Enemy, killerId: EntityId | null): void {
    this.finalizeDeath(enemy, killerId, true);
  }

  /**
   * HOST: an enemy's feet fell below the kill plane of a pit (ENGINE_VERTICALITY §10.2, §11, §13). Trash dies as a normal kill
   * (no killer credit: there is no last-damager record, so the killer is null). Elite / rare / champion take 25 % max HP and are
   * warped back to `lastSafe` (threat stays: the AI brain is not reset). Bosses, ccImmune and flying units never fall.
   */
  fallKill(e: Enemy): void {
    if (!e || e.isDead || e.removed) return;
    if (e.isBoss || e.def.ccImmune || e.def.flying) return;
    if (e.def.rank === 'trash' || !e.lastSafe) {
      G.events.emit('ui:toast', { text: `${e.def.name}: Boşluğa düştü`, kind: 'info' });
      this.killEnemy(e, null);
      return;
    }
    // 25 % max HP through the normal damage path (numbers, sync, death if it runs out)
    this.applyDamageToEnemy(e, e.maxHp * 0.25, false, 'physical', null, undefined, undefined, undefined, undefined, { noReact: true });
    if (e.isDead) return;
    const safe = e.lastSafe;
    const w = G.world;
    e.position.x = safe.x;
    e.position.z = safe.z;
    // snap to the ground of the safe spot; a pending fling or fall must not carry it back into the pit
    e.feetY = w ? w.groundY(safe.x, safe.z) : 0;
    e.airborne = false;
    e.vy = 0;
    e.forcedMove = null;
    G.events.emit('ui:toast', { text: `${e.def.name}: Boşluğa düştü (−%25 CAN)`, kind: 'info' });
  }

  /**
   * Units that never reward kills: M+ affix units (explosive orbs, spiteful shades, Efsun guardians) and boss mechanic entities
   * (bone cages, ice tombs, phylacteries...): no loot, no XP, no kill / bounty credit, no forces.
   */
  isRewardless(enemy: Enemy): boolean {
    const id = enemy.def.id;
    if (id.startsWith('proc_')) return true;
    try { return G.mplus?.isAffixUnit(enemy) ?? false; } catch { return false; }
  }

  private finalizeDeath(enemy: Enemy, killerId: EntityId | null, host: boolean): void {
    // every revival (Diriltici champion) bumps enemy.reviveCount: the enemy may die for real once per life
    const life = enemy.reviveCount;
    if (this.deadEnemies.get(enemy) === life) return;
    this.deadEnemies.set(enemy, life);
    enemy.hp = 0;
    enemy.alive = false;
    enemy.forcedMove = enemy.forcedMove; // keep a pending fling
    const pos: [number, number, number] = [enemy.position.x, enemy.position.y, enemy.position.z];
    const burn = enemy.statuses.get('burn');
    const burnSnap = burn && burn.dps > 0 ? { dps: burn.dps, remaining: burn.remaining } : null;
    try {
      enemy.cast = null;
      enemy.statuses.clear();
      G.hitShapes.cancelBySource(enemy.id);
      enemy.ai?.dispose?.();
    } catch (e) {
      console.error('[combat] death cleanup failed', e);
    }
    if (host) G.net?.broadcast('death', { entityId: enemy.id, killerId, pos });
    G.events.emit('death', { entityId: enemy.id, killerId, pos });

    // Death hooks — single caller (ARCHITECTURE "Death hooks")
    if (host) {
      try { G.mplus.onEnemyKilled(enemy); } catch (e) { console.error('[combat] mplus.onEnemyKilled failed', e); }
      if (enemy.isBoss) {
        try { G.mplus.onBossKilled(enemy.def.id); } catch (e) { console.error('[combat] mplus.onBossKilled failed', e); }
      }
    }
    if (!this.isRewardless(enemy)) {
      try { G.loot.onEnemyKilled(enemy); } catch (e) { console.error('[combat] loot.onEnemyKilled failed', e); }
      // NC45: every peer registers the corpse locally (boss ranks leave none); a Corpses failure never reaches the death flow
      try { G.corpses?.onEnemyKilled(enemy); } catch (e) { console.error('[combat] corpses.onEnemyKilled failed', e); }
    }

    // visuals: death clip (the enemies module may also play it; same clip restarts invisibly)
    try {
      const clip = enemy.def.anims?.death;
      if (clip && enemy.anim && !enemy.anim.locked) enemy.anim.playOnce(clip, { hold: true, fade: 0.05 });
    } catch { /* ignore */ }
    this.stagger.delete(enemy.id);
    // a revived enemy that dies again must not be removed by its first corpse timer
    for (let i = this.corpses.length - 1; i >= 0; i--) if (this.corpses[i].enemy === enemy) this.corpses.splice(i, 1);
    // safety-net removal: bone piles stay as long as their def says (Kemik Büyücüsü raises them), then a few seconds more
    this.corpses.push({ enemy, t: Math.max(this.corpseLifetime, (enemy.def.ai?.bonePile ?? 0) + 3) });

    // local player kill rewards
    const lp = G.world?.localPlayer;
    if (lp && killerId === lp.id && !this.isRewardless(enemy)) this.onLocalKill(lp, enemy, burnSnap);
  }

  private onLocalKill(p: Player, enemy: Enemy, burnSnap: { dps: number; remaining: number } | null = null): void {
    this.combo.extend(0.6);
    // KIT PK-WARLOCK (§10a): Azap kills grant +1 shard (trait_affliction shardOnKill 1)
    if (p.spec === 'warlock_affliction') this.shardGain(p, 10);
    // Kül Asası: a burning enemy's flames jump to everything around it
    const es = burnSnap ? sp('leg_ember_staff') : null;
    if (es && burnSnap) {
      const r = es.spreadRadius ?? 4;
      try {
        G.vfx.spawn('fire_burst', [enemy.position.x, enemy.position.y + enemy.height * 0.5, enemy.position.z], { scale: vfxScale('fire_burst', r * 0.6) });
        for (const e of G.world?.enemiesInRadius({ x: enemy.position.x, z: enemy.position.z }, r, enemy.position.y) ?? []) {
          if (e === enemy || e.isDead) continue;
          this.applyEnemyStatuses(p, e, [{ status: 'burn', duration: Math.max(2, burnSnap.remaining), magnitude: 0.3, dps: burnSnap.dps }]);
        }
      } catch (err) { console.error('[combat] burn spread failed', err); }
    }
    const hk = p.getStat('hpOnKill') + softStat(p, 'hpOnKillPct') * p.maxHp;
    if (hk > 0) this.applyHeal(p, hk, p.id, { raw: true });
    G.skills?.onKill(p, enemy);
  }

  // ======================================================================================================
  // Visual feedback on enemies (host + clients)
  // ======================================================================================================

  private impactPos(t: Actor): [number, number, number] {
    return [t.position.x, t.position.y + t.height * 0.55, t.position.z];
  }

  private dirFromTo(a: Actor, b: Actor): [number, number] {
    const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  /** Attacker inside the target's rear 100 deg (+-50 around -facing, GDD_V2 §3.6): cos(130 deg) = -0.643. Used by backstab and rogue crit. */
  private isBehind(attacker: Actor, target: Actor): boolean {
    const fx = Math.sin(target.yaw), fz = Math.cos(target.yaw);
    const dx = attacker.position.x - target.position.x, dz = attacker.position.z - target.position.z;
    const l = Math.hypot(dx, dz) || 1;
    return (fx * dx + fz * dz) / l <= -0.6428;
  }

  /** A completed combo route (GDD_V2 §3.9): +5% damage of the local player for `sec` seconds. */
  grantRouteBuff(sec: number): void {
    this.routeBuffUntil = this.clock + sec;
  }

  /** Damage number event + flash + reaction. Never throws. */
  private showEnemyHit(target: Enemy, amount: number, crit: boolean, type: DamageType, sourceId: EntityId | null, dir: [number, number], opts: ApplyDamageOpts, effective: number): void {
    const pos = opts.pos ?? this.impactPos(target);
    // CW-06: GDD_V2 §7.3 weakness / resist flags of the target's family + def (ZAYIF! / Dirençli on the number)
    const wk = amount > 0 ? weaknessOf(target.def, type) : null;
    const weak = !!wk?.weak;
    const resisted = !!wk?.resisted;
    try {
      G.events.emit('damage', {
        targetId: target.id, sourceId, amount, crit, type,
        kind: opts.dot || opts.tick ? 'dot' : crit ? 'crit' : 'normal',
        pos, overkill: Math.max(0, amount - effective), skillId: opts.skillId,
        weak, resisted,
      });
    } catch (e) {
      console.error('[combat] damage event failed', e);
    }
    if (opts.dot) return;
    const heavy = opts.weight === 'finisher' || opts.weight === 'heavy' || opts.weight === 'ultimate' || opts.weight === 'stagger_break';
    const strong = heavy || crit;
    if (opts.tick) return;
    if ((weak || resisted) && this.clock - this.lastElemCueAt >= 0.15) {
      this.lastElemCueAt = this.clock;
      try { G.audio.play(weak ? 'weak_hit' : 'resist_hit', { pos, pitchVar: 0.05 }); } catch { /* feedback only */ }
    }
    try {
      // GDD_LIFE §5.2 / §5.5: flash colour, jiggle and squash of this weight (crit: gold second stage)
      const f = resolveHitFeel({ weight: opts.weight ?? 'light', crit, boss: target.isBoss }, TYPE_COLORS[type]);
      this.flashVictim(target, f.flashC1, f.flashMs1, f.flashC2, f.flashMs2);
      this.addJiggle(target, dir, f.jiggle, f.squash, 0);
      if (!opts.noReact) this.reactEnemy(target, strong, sourceId, f.flinch);
    } catch (e) {
      console.error('[combat] hit visuals failed', e);
    }
  }

  /** Enemy flinch: strong hits always flinch; light / medium hits flinch with the table's chance (GDD_LIFE §5.2) behind the cooldown. */
  private reactEnemy(t: Enemy, strong: boolean, by: EntityId | null = null, flinch = 1): void {
    if (t.isBoss || t.isDead) return;
    const rank = t.def.rank;
    if (rank === 'elite' || rank === 'miniboss') return; // stagger bar instead of flinch
    if (t.ai?.armoredNow()) return; // hyper-armour: a heavy windup cannot be flinched (GDD_V2 §3.7)
    if (t.cast) {
      // strong hits (finishers, heavy skills, crits) knock regular enemies out of an interruptible windup; weak ones are ignored
      if (!strong || !t.cast.interruptible) return;
      this.onHardCC(t, by);
    }
    const clip = t.def.anims?.hit;
    if (!clip || !t.anim) return;
    const now = this.clock;
    if (!strong && now < (this.reactCd.get(t.id) ?? 0)) return;
    if (!strong && this.rng.next() >= flinch) return;
    this.reactCd.set(t.id, now + FEEL.reactCooldown);
    t.anim.playOnce(clip, { speed: 1.7, fade: 0.04, restart: true });
    if (strong) {
      // flinching enemies lose their windup
      try { G.hitShapes.cancelBySource(t.id); } catch { /* ignore */ }
    }
  }

  /**
   * Two-stage victim flash (GDD_LIFE §5.5): stage 1 at once (the impact frame), stage 2 after `ms1` from the table. A newer hit on the
   * same enemy replaces its pending stage 2. Never throws.
   */
  private flashVictim(t: Enemy, c1: number, ms1: number, c2: number | null, ms2: number): void {
    if (!t.model || ms1 <= 0) return;
    try {
      G.vfx.flash(t.model, c1, ms1 / 1000);
      this.feelTel.flashMs = ms1;
      if (c2 !== null && ms2 > 0) {
        if (this.flashQueue.length) this.flashQueue = this.flashQueue.filter((q) => q.a !== t);
        if (this.flashQueue.length < 60) this.flashQueue.push({ a: t, at: this.clock + ms1 / 1000, c: c2, ms: ms2 / 1000 });
      }
    } catch { /* feedback only */ }
  }

  private updateFlashQueue(): void {
    if (!this.flashQueue.length) return;
    const keep: { a: Enemy; at: number; c: number; ms: number }[] = [];
    for (const q of this.flashQueue) {
      if (this.clock < q.at) { keep.push(q); continue; }
      try {
        if (q.a.model && !q.a.removed && !q.a.isDead) G.vfx.flash(q.a.model, q.c, q.ms);
      } catch { /* feedback only */ }
    }
    this.flashQueue = keep;
  }

  private addJiggle(a: Actor, dir: [number, number], ampMul: number, squashMul: number, hop: number): void {
    if (!a.model || a.isDead) return;
    const big = a.kind === 'enemy' && (a as Enemy).isBoss;
    const k = big ? 0.3 : 1;
    // merge into an existing effect on the same actor (rapid hits keep it alive instead of stacking offsets)
    const ex = this.fxList.find((f) => f.actor === a);
    const fx: HitFx = {
      actor: a, t: 0, dur: 0.16, wx: dir[0] * FEEL.jiggle * ampMul * k, wz: dir[1] * FEEL.jiggle * ampMul * k,
      squash: FEEL.squash * squashMul * k, hop, prevOff: 0, prevHop: 0, baseScale: null, lastScale: null,
    };
    if (ex) {
      ex.t = Math.min(ex.t, 0.05);
      ex.wx = fx.wx; ex.wz = fx.wz; ex.squash = Math.max(ex.squash, fx.squash);
      ex.hop = Math.max(ex.hop, hop);
      if (hop > 0) ex.dur = 0.55;
    } else {
      if (hop > 0) fx.dur = 0.55;
      if (this.fxList.length < 80) this.fxList.push(fx);
    }
  }

  /** Visual hop (knock-up / knockdown). */
  addHop(a: Actor, height: number): void {
    this.addJiggle(a, [0, 0], 0, 0.6, height);
  }

  private updateFx(dt: number): void {
    for (let i = this.fxList.length - 1; i >= 0; i--) {
      const f = this.fxList[i];
      const a = f.actor;
      const m = a.model;
      if (!m || a.removed) { this.fxList.splice(i, 1); continue; }
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      // shove: quick out, spring back (relative deltas on the model's local position)
      const off = Math.sin(Math.PI * k) * (1 - k);
      const dOff = off - f.prevOff;
      f.prevOff = off;
      if (dOff !== 0 && (f.wx !== 0 || f.wz !== 0)) {
        const yaw = a.yaw;
        const c = Math.cos(yaw), s = Math.sin(yaw);
        m.position.x += (f.wx * c - f.wz * s) * dOff;
        m.position.z += (f.wx * s + f.wz * c) * dOff;
      }
      // squash & stretch around the scale the model had when the effect started (rebased if someone else rescales it)
      if (f.squash > 0) {
        if (!f.baseScale || !f.lastScale) { f.baseScale = m.scale.clone(); f.lastScale = m.scale.clone(); }
        else if (!m.scale.equals(f.lastScale)) f.baseScale.copy(m.scale);
        const sq = f.squash * Math.sin(Math.PI * k) * (1 - k * 0.5);
        const sx = 1 + sq * 0.55;
        m.scale.set(f.baseScale.x * sx, f.baseScale.y * (1 - sq), f.baseScale.z * sx);
        f.lastScale.copy(m.scale);
      }
      if (f.hop > 0) {
        const h = f.hop * 4 * k * (1 - k);
        m.position.y += h - f.prevHop;
        f.prevHop = h;
      }
      if (k >= 1) {
        if (f.baseScale && f.lastScale && m.scale.equals(f.lastScale)) m.scale.copy(f.baseScale);
        if (f.prevHop !== 0) m.position.y -= f.prevHop;
        if (f.prevOff !== 0 && (f.wx !== 0 || f.wz !== 0)) {
          const yaw = a.yaw;
          const c = Math.cos(yaw), s = Math.sin(yaw);
          m.position.x -= (f.wx * c - f.wz * s) * f.prevOff;
          m.position.z -= (f.wx * s + f.wz * c) * f.prevOff;
        }
        this.fxList.splice(i, 1);
      }
    }
  }

  /** Emits a text-only 'damage' event (BAĞIŞIK / KAÇTI / BLOK are drawn by the vfx feedback subscriber). */
  private statusEvent(a: Actor, kind: 'immune' | 'dodge' | 'block', sourceId: EntityId | null, type: DamageType = 'physical', pos?: [number, number, number]): void {
    try {
      G.events.emit('damage', { targetId: a.id, sourceId, amount: 0, crit: false, type, kind, pos: pos ?? [a.position.x, a.position.y + a.height * 0.6, a.position.z] });
    } catch { /* ignore */ }
  }

  private numberAt(a: Actor, amount: number, kind: import('../types/vfx').DamageNumberKind, text?: string): void {
    try {
      _v.set(a.position.x, a.position.y + a.height * 0.9, a.position.z);
      G.vfx.damageNumber(_v, amount, kind, text);
    } catch { /* ignore */ }
  }

  // ======================================================================================================
  // Game feel: hit-stop / shake accumulation (once per frame, max over all hits), slow-mo
  // ======================================================================================================

  /**
   * Accumulate one landed hit into the frame's feel (GDD_LIFE §5.2–§5.7): the weight row x weapon x crit / kill / boss from
   * `resolveHitFeel`. Skill overrides (`spec.hitstop` / `spec.shake`) stay absolute, the crit and kill bonuses are added on top.
   */
  private noteFeel(spec: HitSpec, weight: HitWeight, crit: boolean, killed: boolean, target: Enemy, attacker: Player, dir: [number, number]): void {
    // GDD_LIFE §4.11: remote players' hits add no feel here (no shake, no freeze of the local avatar)
    if (weight === 'tick' || !attacker.isLocal) return;
    const a = this.acc;
    a.any = true;
    const boss = target.isBoss;
    const eliteRank = target.def.rank === 'elite' || target.def.rank === 'miniboss';
    const f = resolveHitFeel({ weight, weapon: weaponKindOf(attacker), crit, kill: killed, eliteKill: killed && (eliteRank || boss), boss }, TYPE_COLORS[spec.type]);
    const exempt = weight === 'ultimate' || weight === 'stagger_break';
    let stop = f.stop;
    if (spec.hitstop !== undefined) {
      stop = spec.hitstop + (crit ? FEEL.hitstopCrit : 0) + (killed ? FEEL.hitstopKill : 0);
      if (boss && !exempt) stop = Math.min(stop, FEEL.hitstopBossCap);
    }
    if (spec.noHitstop) stop = 0;
    // CW-06: a projectile / spell / bow hit is a ranged impact: the victim keeps a short stop (40 ms cap), the shooter never freezes
    const ranged = weight === 'projectile' || !!spec.isSpell || weaponKindOf(attacker) === 'bow';
    if (weight === 'projectile') stop = Math.min(stop, PROJECTILE_STOP_CAP_MS);
    let trauma = f.trauma;
    if (spec.shake !== undefined) trauma = Math.min(1, spec.shake + (crit ? FEEL.shakeCrit : 0) + (killed ? FEEL.shakeKill : 0));
    a.stop = Math.max(a.stop, stop);
    a.shake = Math.max(a.shake, trauma);
    a.dur = Math.max(a.dur, f.shakeDur);
    if (f.kick > a.kick) { a.kick = f.kick; a.kx = dir[0]; a.kz = dir[1]; }
    a.fov = Math.max(a.fov, f.fov);
    if (weight === 'ultimate' || weight === 'stagger_break' || (killed && boss)) a.global = true;
    if (!ranged) a.attacker = attacker;
    a.victims.push({ a: target, ms: stop });
    // time dilation (GDD_LIFE §5.7): the highest-priority candidate of the frame
    let sl: keyof typeof SLOWMO | null = null;
    if (killed && boss) sl = 'bossDeath';
    else if (killed && eliteRank) sl = 'eliteKill';
    else if (killed && this.isLastKill(target)) sl = 'lastKill';
    else if (weight === 'stagger_break') sl = 'staggerBreak';
    else if (weight === 'ultimate') sl = 'ultimate';
    else if (crit && (weight === 'finisher' || weight === 'heavy')) sl = 'critHeavy';
    if (sl && (!a.slowmo || SLOW_ORDER.indexOf(sl) < SLOW_ORDER.indexOf(a.slowmo))) a.slowmo = sl;
    this.feelTel.weight = weight;
    this.feelTel.hitTimes.push(this.clock);
  }

  /** No other aggroed living enemy within 14 m of the dead one (GDD_LIFE §5.7 "last kill"). */
  private isLastKill(target: Enemy): boolean {
    try {
      const list = G.world?.enemiesInRadius({ x: target.position.x, z: target.position.z }, 14, target.position.y) ?? [];
      return !list.some((e) => e !== target && !e.isDead && !e.removed && e.aggroed);
    } catch {
      return false;
    }
  }

  /**
   * Once per frame: hit-stop, freezes, camera trauma / kick / FOV kick and slow-mo of everything that landed this frame.
   * - hit-stop = the frame's max, capped by the 160 ms per 0.3 s budget (GDD_LIFE §5.2);
   * - selective (default): the attacker freezes for that stop, each victim for its own, at most FEEL.freezeMaxAtOnce actors (§5.4);
   * - global `hitstop` only for ultimate, stagger break, boss kills, or when FEEL.selectiveFreeze is off (v1 A/B).
   */
  private flushFeel(): void {
    const a = this.acc;
    const tel = this.feelTel;
    tel.hitTimes = tel.hitTimes.filter((t) => this.clock - t < 1);
    tel.hitsPerSec = tel.hitTimes.length;
    if (!a.any) {
      tel.stop = 0; tel.victims = 0; tel.freezes = 0; tel.trauma = 0; tel.kick = 0; tel.fov = 0; tel.flashMs = 0;
      return;
    }
    this.stopLog = this.stopLog.filter((e) => this.clock - e.t < FEEL.hitstopWindow);
    const used = this.stopLog.reduce((s, e) => s + e.ms, 0);
    const room = Math.max(0, FEEL.hitstopCap - used);
    const ms = Math.min(a.stop, room);
    let frozen = 0;
    let stopUsed = 0;
    if (ms >= 8) {
      if (a.global || !FEEL.selectiveFreeze) {
        G.events.emit('hitstop', { ms });
        stopUsed = ms;
      } else {
        const attackerLive = a.attacker && a.attacker.kind === 'player' ? a.attacker : null;
        if (attackerLive) { freezeActors([attackerLive], ms, 1); frozen++; }
        stopUsed = ms;
        const victims = a.victims.slice().sort((x, y) => y.ms - x.ms);
        for (const v of victims) {
          if (frozen >= FEEL.freezeMaxAtOnce) break;
          const vm = Math.min(v.ms, room);
          if (vm < 8) continue;
          freezeActors([v.a], vm, 1);
          frozen++;
        }
      }
      if (stopUsed >= 8) this.stopLog.push({ t: this.clock, ms: stopUsed });
    }
    const trauma = Math.min(FEEL.shakeCap, a.shake);
    if (trauma > 0.01) G.events.emit('camera:shake', { intensity: trauma, duration: Math.max(0.12, a.dur || 0.2) });
    if (a.kick > 0.001) G.events.emit('camera:kick', { dx: a.kx, dz: a.kz, amount: Math.min(0.5, a.kick) });
    if (a.fov > 0.05) G.events.emit('camera:fov', { deg: Math.min(6, a.fov) });
    if (a.slowmo) {
      const s = SLOWMO[a.slowmo];
      this.slowmo(s.scale, s.hold, s.recover, a.slowmo === 'bossDeath');
    }
    tel.stop = ms; tel.victims = a.victims.length; tel.freezes = frozen; tel.trauma = trauma; tel.kick = a.kick; tel.fov = a.fov;
    this.acc = newFeelAcc();
  }

  /** Brief slow motion (real-time based): scale for `hold` s, then ease back over `recover` s. One per SLOWMO_GAP unless forced (boss death). */
  slowmo(scale: number, hold: number, recover: number, force = false): void {
    if (!G.engine) return;
    const now = performance.now();
    if (!force && now - this.lastSlowAt < SLOWMO_GAP * 1000) return;
    if (!force && this.slow.active && now < this.slow.until + this.slow.recover * 1000) return;
    this.lastSlowAt = now;
    this.slow = { until: now + hold * 1000, recover, active: true, scale };
    G.engine.timeScale = scale;
  }

  private updateSlowmo(): void {
    const s = this.slow;
    if (!s.active || !G.engine) return;
    const now = performance.now();
    if (now < s.until) return;
    const k = (now - s.until) / (s.recover * 1000);
    if (k >= 1) {
      G.engine.timeScale = 1;
      s.active = false;
    } else {
      G.engine.timeScale = s.scale + (1 - s.scale) * k * k;
    }
  }

  // ======================================================================================================
  // Incoming damage (enemy -> local player)
  // ======================================================================================================

  /** Resolve a hit on the LOCAL player: iframes, dodge, block, armor/resist, statuses, death. */
  hitLocalPlayer(hit: IncomingHit): DamageResult | null {
    const p = G.world?.localPlayer ?? G.player;
    if (!p || p.isDead || !p.isLocal) return null;
    const type = hit.type;
    const dot = !!hit.isDot;
    const posArr: [number, number, number] = [p.position.x, p.position.y + p.height * 0.7, p.position.z];

    // a hit that carries no damage (pure status / pull: Ağ Atışı, Kışkırtma, Boşluk Çekimi...) is not an "attack": it is never dodged,
    // blocked or rewarded as a perfect dodge, and it never shows DODGE / BLOK text. i-frames and invulnerability still stop it.
    const noDamage = !(hit.amount > 0);
    // 1. i-frames / invulnerability
    if (!hit.ignoreIframes && p.statuses.invulnerable) {
      if (!dot && !noDamage && p.dodging && G.world && G.world.time - p.dodgeStartedAt <= 0.15 && G.world.time - p.dodgeStartedAt >= 0) this.onPerfectDodge(p);
      if (!dot && !noDamage && p.dodging) this.energyOnDodge(p);
      return { amount: 0, crit: false, type, killed: false, immune: true };
    }
    // 1b. parry (GDD_V2 §3.5, step 0 before the dodge): a parryable melee hit inside the open window is negated outright
    if (!hit.unavoidable && !dot && !noDamage && hit.perilous !== true && (hit.parryable ?? hit.blockable !== false) && this.guard.consumeParry(this.clock)) {
      this.onParried(p, hit);
      G.procs?.emit('parry', { player: p });
      return { amount: 0, crit: false, type, killed: false, parried: true };
    }

    let amount = Math.max(0, hit.amount);
    const rawIn = amount;
    const lvlSrc = hit.sourceLevel ?? 1;
    amount *= this.levelDiffIn(hit.sourceLevel, p.level);
    const dir = hit.dir ?? this.dirFromSource(p, hit.sourceId);
    // hyper-armour (GDD_V2 §3.10): a charged release shrugs off flinch and knockback from small hits
    const armored = !!G.skills?.hyperArmorActive(p) && hit.amount < COMBAT_FEEL.hyperArmorHitFrac * Math.max(1, p.maxHp);

    // 2. dodge
    if (!hit.unavoidable && !dot && !noDamage) {
      const dodge = clamp(p.getStat('dodgeChance'), 0, 0.4);
      if (dodge > 0 && this.rng.next() < dodge) {
        this.statusEvent(p, 'dodge', hit.sourceId, type);
        G.audio.play('dodge', { pos: posArr });
        this.energyOnDodge(p);
        G.procs?.emit('dodge', { player: p });
        return { amount: 0, crit: false, type, killed: false, dodged: true };
      }
    }

    // 3. block (frontal 160 deg, melee/projectile; shield wall blocks everything frontal)
    let blocked = false;
    // perilous hits (GDD_V2 §3.4) ignore the guard and shatter the gauge
    if (hit.perilous && !dot && !noDamage && this.isGuarding(p) && this.guard.block(this.clock, Number.POSITIVE_INFINITY)) this.guardBroke(p, posArr);
    if (!hit.unavoidable && !dot && !noDamage && hit.blockable !== false) {
      const frontal = this.isFrontal(p, dir, 160);
      const wall = G.skills?.shieldWallActive(p) ?? false;
      const prof = this.guard.profile;
      // Siper: the guard stance blocks frontal melee / projectiles on the Guard Gauge (not spells: blockable false)
      const guardArc = prof && this.isGuarding(p) && !hit.perilous && !wall ? prof.arc : 0;
      if (prof && guardArc > 0 && this.isFrontal(p, dir, guardArc)) {
        blocked = true;
        const raw = amount;
        amount *= 1 - clamp(prof.blockBase + p.getStat('blockAmount'), 0, 0.95);
        this.guardBlock(p, raw, posArr);
      } else if (frontal) {
        if (wall) {
          blocked = true;
          G.skills.onBlocked(p, amount, true);
          amount = 0;
        } else {
          // Kalkan Kaldır (shield_block): every frontal hit is blocked; otherwise the spec's block cap (Koruyucu 0.60)
          const bc = p.statuses.has('shield_block') ? 1 : clamp(p.getStat('blockChance'), 0, blockChanceCap(p));
          if (bc > 0 && this.rng.next() < bc) {
            blocked = true;
            const ba = clamp(0.6 + p.getStat('blockAmount'), 0, 0.95);
            G.skills?.onBlocked(p, amount, false);
            amount *= 1 - ba;
          }
        }
      } else if (wall) {
        amount *= 0.5;
      }
      if (blocked) {
        this.statusEvent(p, 'block', hit.sourceId, type, [p.position.x - dir[0] * 0.6, p.position.y + 1.3, p.position.z - dir[1] * 0.6]);
        G.procs?.emit('block', { player: p });
        G.audio.play('block', { pos: posArr });
        // PM-00b: Kalkan Kaldır blocks give no rage (`gainPerBlock 0`, plate-melee §g need 12)
        if (p.classId === 'knight' && !G.skills.shieldWallActive(p) && !p.statuses.has('shield_block')) G.skills.addResource(p, 6);
        G.events.emit('camera:shake', { intensity: 0.12, duration: 0.15 });
        this.onBlockSpecials(p);
        if (amount <= 0) return { amount: 0, crit: false, type, killed: false, blocked: true };
      }
    }

    // 4. armour / resist, damage reduction buffs, takenMore, absorb shields
    amount = this.mitigate(p, amount, type, lvlSrc);
    amount *= 1 - clamp(p.getStat('damageReductionPct'), 0, 0.9);
    amount *= 1 - newPlayerDr(p.level);
    // KIT PK-ROGUE Aldatma (§5): −40 % from area hits (circle / ring telegraphs arrive with melee === false), −15 % from the rest
    if (amount > 0 && p.statuses.has('feint')) amount *= hit.melee === false && !dot ? 0.6 : 0.85;
    // Savaş Lordu Öfke Zırhı (GDD_V2 §1.3.3): -0.25% damage taken per rage point, up to -25%
    amount *= warlordRageMult(p);
    amount *= p.statuses.takenMore() * takenPerStack(p);
    if (G.skills?.shieldWallActive(p) && amount > 0) amount *= 1; // (frontal handled above)
    const before = amount;
    amount = absorbMagicShell(p, amount, type); // NC52 Büyü Karşıtı Kalkan: magic-only absorb, before the type-blind shield
    amount = p.statuses.absorb(amount);
    // GDD_PVP_FINDER §3.3.2 Yıpranma: absorbs are worth less as the round drags on (the soaked part leaks through by the dampening share)
    if (arenaCombatActive() && before > amount) amount += (before - amount) * (1 - arenaHealMult());
    const absorbed = before - amount;
    // non-lethal floor (Kirlenme): clipped before the mana shield so no mana is spent on damage that never lands
    // lethal:false (fall damage) adds the 1 HP floor on top of any explicit floorHp
    const floorHp = hit.lethal === false ? Math.max(1, hit.floorHp ?? 1) : hit.floorHp;
    const floorRoom = floorHp !== undefined ? Math.max(0, p.hp - floorHp) : Infinity;
    amount = Math.min(amount, floorRoom);
    // Zihin Kalkanı: a share of the damage is paid with mana first (4 damage = 1 mana)
    const ms = sp('ks_mind_shield');
    if (ms && amount > 0 && p.resourceType === 'mana' && p.resource > 0) {
      const per = ms.damagePerMana ?? 4;
      const useMana = Math.min(p.resource, (amount * (ms.damageToManaPct ?? 0.3)) / per);
      p.resource -= useMana;
      amount -= useMana * per;
    }
    amount = Math.min(Math.round(amount), Math.floor(floorRoom));
    // CW-06: the soaked part of a direct hit reads as its own `absorb` number (blue-white "(emildi) N")
    if (absorbed > 0 && !dot) {
      try {
        G.events.emit('damage', {
          targetId: p.id, sourceId: hit.sourceId, amount: absorbed, crit: false, type,
          kind: 'absorb', pos: posArr, overkill: 0,
        });
      } catch (e) { console.error('[combat] absorb event failed', e); }
    }
    if (before > 0 && amount <= 0 && !dot && absorbed <= 0) {
      this.numberAt(p, 0, 'block', 'EMİLDİ');
    }

    // 4b. Koruyucu Son Savunma (GDD_V2 §1.3.1): a lethal hit leaves the protector at 15% max HP (once per 90 s)
    if (amount > 0 && !dot && protectorCheat(p, amount)) amount = 0;

    // 5. apply HP
    const hpBefore = p.hp;
    if (amount > 0) {
      p.hp = Math.max(0, p.hp - amount);
      p.combatTimer = 0;
      this.recordTaken(p, amount);
      // PM-00b (plate-melee §g need 2): Kemik Zırhı and other consume-on-hit stacks lose one stack per melee hit taken
      if (hit.melee && !dot) this.consumeOnHit(p);
    }
    if (absorbed > 0 || amount > 0) p.combatTimer = 0;

    // 6. statuses
    if (hit.statuses?.length) this.applyStatusesToLocal(p, hit.statuses, hit.sourceId, hit.amount);

    // 7. knockback (positive = away from the hit, negative = pulled toward its origin)
    if (!dot && hit.knockback && !p.statuses.invulnerable && !p.forcedMove && p.statuses.get('act_root') === undefined) {
      const immune = p.statuses.get('bloodrage') || G.skills?.isUnstoppable(p) || armored || p.statuses.immuneKnockback();
      if (!immune) {
        if (hit.knockback > 0) {
          p.applyKnockback(dir[0], dir[1], hit.knockback, knockbackDuration(hit.knockback));
          if (hit.knockback >= 2 && !noDamage) this.knockDust(p, dir);
        } else this.pullLocal(p, hit, dir);
      }
    }

    // 8. feedback
    if (amount > 0) {
      try {
        G.events.emit('damage', {
          targetId: p.id, sourceId: hit.sourceId, amount, crit: false, type,
          kind: dot ? 'dot' : 'player_hurt', pos: posArr, overkill: Math.max(0, amount - hpBefore),
        });
      } catch (e) { console.error('[combat] damage event failed', e); }
      if (!dot) {
        const frac = amount / Math.max(1, p.maxHp);
        G.events.emit('camera:shake', { intensity: frac > 0.1 ? FEEL.shakeHurt : 0.12, duration: 0.2 });
        // GDD_LIFE §4.10 / §4.11: a hurt > 10% kicks the camera away from the attacker; > 15% squeezes the FOV and freezes the world
        if (frac > 0.1) G.events.emit('camera:kick', { dx: dir[0], dz: dir[1], amount: 0.15 });
        if (frac > FEEL.hurtBigFrac) G.events.emit('camera:fov', { deg: -1.5 });
        if (frac > FEEL.hurtBigFrac) G.events.emit('hitstop', { ms: FEEL.hurtBigStop });
        if (frac > 0.1 && !armored && !G.skills?.isBusy(p) && !p.statuses.stunned) p.playHitReaction(frac > 0.25);
        if (frac > 0.04) G.audio.play('player_hurt', { pos: posArr, pitchVar: 0.08 });
        if (p.classId === 'barbarian') G.skills?.addResource(p, Math.min(8, (frac / 0.02) * (1 + softStat(p, 'resourceGainPct'))));
        // thorns
        const th = p.getStat('thorns');
        if (th > 0 && hit.sourceId !== null) this.reflectThorns(p, hit.sourceId, th);
        // PM-PA İlahi Siper (bulwark, plate-melee.md §5a): 20 % of the incoming hit comes back as holy damage
        if (hit.sourceId !== null && p.statuses.has('bulwark')) this.reflectThorns(p, hit.sourceId, rawIn * BULWARK_REFLECT, 'holy', 'paladin_prot_bulwark', 30);
      }
    }
    G.skills?.onPlayerDamaged(p, amount);

    // death recap (GDD_V2 §8.5): every hit that landed, with what the mitigation removed and whether it was avoidable
    const avoidable = !hit.unavoidable && !dot && !noDamage;
    if (amount > 0) {
      this.deathLog.recordHit({
        t: this.clock, source: hit.sourceId, sourceName: this.nameOfSource(hit.sourceId), ability: hit.abilityName ?? 'Saldırı',
        amount, mitigated: Math.max(0, rawIn - amount), type, avoidable, hpPct: p.hp / Math.max(1, p.maxHp),
      });
    }

    // GDD_TALENTS T7: `hurt` procs, Alev Bariyeri thorns (mage hook), then `lethal` procs before the death is decided
    if (amount > 0) {
      G.procs?.emit('hurt', { player: p, amount });
      this.applyBarrierThorn(p, hit.sourceId, !!hit.melee);
    }
    if (p.hp <= 0) {
      if (this.tryPhoenix(p)) return { amount, crit: false, type, killed: false, blocked };
      if (this.lethalSaved(p, amount)) return { amount, crit: false, type, killed: false, blocked };
      this.killLocalPlayer(hit.sourceId, { by: hit.abilityName, av: avoidable });
    }
    return { amount, crit: false, type, killed: p.hp <= 0, blocked };
  }

  /** PM-00b (plate-melee §g need 3): damage the player took in the last `sec` seconds (ring buffer, 8 s kept). */
  damageTakenWithin(p: Actor, sec: number): number {
    let sum = 0;
    for (const e of this.takenLog) if (e.id === p.id && this.clock - e.t <= sec) sum += e.amount;
    return sum;
  }

  private recordTaken(p: Actor, amount: number): void {
    const now = this.clock;
    while (this.takenLog.length && now - this.takenLog[0].t > TAKEN_WINDOW) this.takenLog.shift();
    this.takenLog.push({ id: p.id, t: now, amount });
    if (this.takenLog.length > TAKEN_MAX) this.takenLog.splice(0, this.takenLog.length - TAKEN_MAX);
  }

  /** PM-00b (plate-melee §g need 2): one stack per consume-on-hit status, at most once per its `icd` (clock seconds). */
  private consumeOnHit(p: Player): void {
    for (const id of p.statuses.ids()) {
      const icd = STATUS_RULES[id]?.consumeOnHit?.icd;
      if (!icd) continue;
      const key = `${p.id}:${id}`;
      const last = this.consumeAt.get(key) ?? -Infinity;
      if (this.clock - last < icd) continue;
      if (!p.statuses.consumeStack(id)) continue;
      this.consumeAt.set(key, this.clock);
    }
  }

  /**
   * GDD_TALENTS T7 `lethal`: a hit that would kill the local player runs the lethal procs first. A proc that heals ≥ 1 HP
   * or grants `invulnerable` cancels the death (HP is held at 1 for the invulnerable case). Returns true when saved.
   */
  private lethalSaved(p: Player, amount: number): boolean {
    // PM-PA: hold 1 HP while the procs run, so a `heal(..)` action is not refused for a dead target (Yılmaz Savunucu leaves 25 % HP)
    const raw = p.hp;
    p.hp = 1;
    G.procs?.emit('lethal', { player: p, amount });
    if (p.hp > 1) return true;
    p.hp = raw;
    if (p.statuses.invulnerable) {
      p.hp = 1;
      return true;
    }
    return false;
  }

  /** Alev Bariyeri (mage hook): a melee attacker of the barrier burns. Applied from the local player's side. */
  private applyBarrierThorn(p: Player, sourceId: EntityId | null, melee: boolean): void {
    const hooks = specHooksOf(p);
    if (hooks.length === 0 || sourceId === null) return;
    const attacker = G.world?.get<Actor>(sourceId) ?? null;
    if (!attacker) return;
    for (const h of hooks) {
      const thorn = h.onDamageTaken?.(p, attacker, melee) ?? null;
      if (thorn && thorn.target.kind === 'enemy') {
        this.applyEnemyStatuses(p, thorn.target as unknown as Enemy, [{ status: thorn.status, duration: thorn.duration, magnitude: thorn.magnitude }]);
      }
    }
  }

  /** Dust kicked up when a heavy hit throws the player back (feedback, local only). */
  private knockDust(p: Player, dir: [number, number]): void {
    try {
      G.vfx.spawn('dodge_dust', [p.position.x, p.position.y + 0.1, p.position.z], { dir: [dir[0], 0, dir[1]], scale: 1.2 });
    } catch { /* ignore */ }
  }

  /**
   * Negative knockback: drag the player toward the hit origin (shape centre, else the source entity) for |knockback| metres but never
   * past a ring of ~1.3 m around it, so a pull gathers the party instead of throwing it through the boss.
   */
  private pullLocal(p: Player, hit: IncomingHit, awayDir: [number, number]): void {
    const dist = Math.abs(hit.knockback ?? 0);
    if (dist < 0.05) return;
    let ox: number | null = null, oz: number | null = null;
    if (hit.origin) { ox = hit.origin[0]; oz = hit.origin[1]; }
    else {
      const s = hit.sourceId !== null ? G.world?.get(hit.sourceId) : undefined;
      if (s) { ox = s.position.x; oz = s.position.z; }
    }
    let ux = -awayDir[0], uz = -awayDir[1];
    let d = dist;
    if (ox !== null && oz !== null) {
      const dx = ox - p.position.x, dz = oz - p.position.z;
      const l = Math.hypot(dx, dz);
      if (l > 0.05) { ux = dx / l; uz = dz / l; d = Math.min(dist, Math.max(0, l - 1.3)); }
    }
    if (d < 0.15) return;
    p.applyKnockback(ux, uz, d, Math.max(0.18, Math.min(0.35, d * 0.07 + 0.14)));
    try {
      G.audio.play('whoosh', { pos: [p.position.x, p.position.y + 1, p.position.z], pitch: 0.7, volume: 0.7 });
      G.vfx.spawn('charge_trail', [p.position.x, p.position.y + 0.8, p.position.z], { dir: [ux, 0, uz], duration: 0.3 });
      G.events.emit('camera:shake', { intensity: 0.16, duration: 0.25 });
    } catch { /* ignore */ }
  }

  /** n_like_a_shadow: every avoided attack grants Enerji. */
  private energyOnDodge(p: Player): void {
    const e = sp('n_like_a_shadow');
    if (e) G.skills?.gainResource(p, e.energyOnDodge ?? 10);
  }

  /** Demir Kale heal-on-block, Dağın Kalbi shockwave (called from the block branch of hitLocalPlayer). */
  private onBlockSpecials(p: Player): void {
    const fort = sp('ks_iron_fortress');
    if (fort && this.clock >= this.sp.fortressIcdUntil) {
      this.sp.fortressIcdUntil = this.clock + (fort.healOnBlockIcd ?? 0.5);
      this.applyHeal(p, p.maxHp * (fort.healOnBlockPct ?? 0.02), p.id, { raw: true, quiet: true });
    }
    const mh = sp('leg_mountain_heart');
    if (mh && this.clock >= this.sp.mountainIcdUntil) {
      this.sp.mountainIcdUntil = this.clock + (mh.icd ?? 1);
      try { G.skills?.mountainHeartWave(p, mh.radius ?? 3, mh.coef ?? 1, mh.cdReduce ?? 0.5); } catch (e) { console.error('[combat] mountain heart failed', e); }
    }
  }

  /** Anka Omuzluğu: lethal damage is turned into a revive with a fire explosion (180 s cooldown, no M+ death counted). */
  private tryPhoenix(p: Player): boolean {
    const ph = sp('leg_phoenix_mantle');
    if (!ph || this.clock < this.sp.phoenixReadyAt) return false;
    this.sp.phoenixReadyAt = this.clock + (ph.cooldown ?? 180);
    p.hp = Math.max(1, Math.round(p.maxHp * (ph.hpFrac ?? 0.4)));
    p.statuses.apply('invulnerable', 1.5, { sourceId: p.id });
    try {
      G.vfx.spawn('fire_burst', [p.position.x, p.position.y + 1, p.position.z], { scale: 3 });
      G.vfx.spawn('respawn', [p.position.x, 0, p.position.z], { follow: p.object3d });
      G.audio.play('explosion', { pos: [p.position.x, p.position.y, p.position.z] });
      this.numberAt(p, 0, 'heal', 'ANKA!');
      G.events.emit('camera:shake', { intensity: 0.6, duration: 0.5 });
      G.events.emit('hitstop', { ms: 110 });
      G.events.emit('ui:toast', { text: 'Anka Omuzluğu seni ölümden kurtardı!', kind: 'success' });
      G.skills?.phoenixBurst(p, ph.radius ?? 6, ph.coef ?? 4);
    } catch (e) {
      console.error('[combat] phoenix failed', e);
    }
    return true;
  }

  private applyStatusesToLocal(p: Player, list: StatusApply[], sourceId: EntityId | null, hitAmount: number): void {
    for (const s of list) {
      if (s.chance !== undefined && s.chance < 1 && this.rng.next() > s.chance) continue;
      let dps = s.dps;
      const def = STATUSES[s.status];
      if (dps === undefined && def?.dotType && !STATUS_RULES[s.status]?.maxHpPctPerSec) dps = (hitAmount * (s.magnitude && s.magnitude > 0 && s.magnitude <= 2 ? s.magnitude : 0.5)) / Math.max(0.5, s.duration);
      p.statuses.apply(s.status, s.duration, { stacks: s.stacks, magnitude: s.magnitude, sourceId, dps });
    }
  }

  private onPerfectDodge(p: Player): void {
    p.statuses.apply('empower', 2, { magnitude: 0.3, sourceId: p.id });
    G.vfx.flash(p.model ?? p.object3d, 0xffffff, 0.15);
    G.vfx.spawn('dodge_dust', p.position);
    this.numberAt(p, 0, 'dodge', 'KUSURSUZ KAÇIŞ');
    G.events.emit('player:perfectDodge', {});
    this.slowmo(SLOWMO.perfectDodge.scale, SLOWMO.perfectDodge.hold, SLOWMO.perfectDodge.recover); // brief "witch time" beat on a perfect dodge
    G.events.emit('camera:fov', { deg: 3 }); // GDD_LIFE §4.10: perfect dodge FOV kick
    G.audio.play('dodge', { pos: [p.position.x, p.position.y, p.position.z], pitch: 1.35 });
  }

  private reflectThorns(p: Player, sourceId: EntityId, dmg: number, type: DamageType = 'physical', skillId = 'thorns', range = 4): void {
    const e = G.world?.get<Enemy>(sourceId);
    if (!e || e.kind !== 'enemy' || e.isDead) return;
    if (Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) > range) return;
    const amount = Math.max(1, Math.round(this.mitigate(e, dmg, type, p.level)));
    if (!G.net || G.net.isAuthority) this.applyDamageToEnemy(e, amount, false, type, p.id, undefined, skillId, 0, undefined, { tick: true, weight: 'tick', noReact: true });
    else G.net.sendToHost('hit', { targetId: e.id, amount, crit: false, type, skillId, isDot: true });
  }

  private dirFromSource(p: Actor, sourceId: EntityId | null): [number, number] {
    const s = sourceId !== null ? G.world?.get(sourceId) : undefined;
    if (!s) return [-Math.sin(p.yaw), -Math.cos(p.yaw)];
    const dx = p.position.x - s.position.x, dz = p.position.z - s.position.z;
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  /** True when the hit (travelling along `dir`, from the source towards the player) comes from the player's front arc. */
  private isFrontal(p: Actor, dir: [number, number], arcDeg: number): boolean {
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const fromX = -dir[0], fromZ = -dir[1];
    const l = Math.hypot(fromX, fromZ) || 1;
    return (fx * fromX + fz * fromZ) / l >= Math.cos(((arcDeg / 2) * Math.PI) / 180);
  }

  /** Heal a player (routes to the owning peer if remote). */
  healPlayer(source: Actor | null, target: Player, amount: number, opts?: { raw?: boolean; quiet?: boolean }): void {
    if (!target || target.isDead || amount <= 0) return;
    if (target.isLocal) {
      this.applyHeal(target, amount, source?.id ?? null, opts);
      this.healProc(source, target, amount);
      return;
    }
    const peer = G.net?.peerOfEntity(target.id);
    if (!peer) return;
    this.healProc(source, target, amount);
    G.net.sendTo(peer, 'heal', { targetId: target.id, amount, sourceId: source?.id ?? null });
    // the owner applies the heal and emits 'heal' on ITS machine; emit it here as well so the healer's own damage meter counts
    // outgoing heals. Only attributable heals (a source) are echoed: unattributed ticks (HoTs) would just spam numbers.
    // The amount is the healer-side estimate (the target's healReceivedPct / healMult are not known here).
    const shown = Math.round(amount);
    if (source && shown >= 1) {
      try {
        G.events.emit('heal', { targetId: target.id, sourceId: source.id, amount: shown, pos: [target.position.x, target.position.y + target.height * 0.8, target.position.z] });
      } catch { /* ignore */ }
    }
  }

  /** GDD_TALENTS T7 `heal` trigger: a heal the LOCAL player caused (on itself or an ally). The amount is the healer-side estimate. */
  private healProc(source: Actor | null, target: Player, amount: number): void {
    if (!source || source.kind !== 'player' || !(source as Player).isLocal) return;
    const shown = Math.round(amount);
    if (shown < 1) return;
    G.procs?.emit('heal', { player: source as Player, ally: target === source ? null : target, amount: shown });
  }

  private applyHeal(p: Player, amount: number, sourceId: EntityId | null, opts?: { raw?: boolean; quiet?: boolean }): void {
    if (p.isDead || amount <= 0) return;
    let a = amount;
    if (!opts?.raw) a *= 1 + softStat(p, 'healReceivedPct');
    a *= p.statuses.healMult();
    a *= arenaHealMult(); // GDD_PVP_FINDER §3.3.2 Yıpranma (1 outside arenas)
    const eff = Math.min(a, p.maxHp - p.hp);
    if (eff > 0) p.hp += eff;
    if (p.isLocal) this.deathLog.recordHeal({ t: this.clock, source: sourceId, amount: Math.max(0, eff), overheal: Math.max(0, a - Math.max(0, eff)) });
    if (opts?.quiet && eff < 1) return;
    if (a >= 1) {
      G.events.emit('heal', { targetId: p.id, sourceId, amount: Math.round(a), pos: [p.position.x, p.position.y + p.height * 0.8, p.position.z] });
    }
  }

  // ======================================================================================================
  // Player death / revive
  // ======================================================================================================

  /** Local player death handling (release/revive flow is in scenes/UI). */
  killLocalPlayer(killerId: EntityId | null, cause?: { by?: string; av?: boolean }): void {
    const p = G.world?.localPlayer ?? G.player;
    if (!p || !p.isLocal || this.localDead) return;
    this.localDead = true;
    p.hp = 0;
    p.alive = false;
    try {
      G.skills.interrupt(p, true);
      G.skills.reset(p);
      p.statuses.clear();
      p.cast = null;
      p.forcedMove = null;
    } catch (e) { console.error('[combat] death cleanup failed', e); }
    this.combo.reset();
    try {
      const clip = p.anim?.pick('Death_B', 'Death_A');
      if (clip && p.anim) p.anim.playOnce(clip, { hold: true, speed: clip === 'Death_B' ? 1.5 : 1, fade: 0.05 });
    } catch { /* ignore */ }
    G.events.emit('player:died', { entityId: p.id, local: true });
    G.net?.broadcast('pdeath', { entityId: p.id, dead: true, by: cause?.by, av: cause?.av });
    // death recap (GDD_V2 §8.5): the last 10 s of hits and heals, published for the death panel's "Ölüm Özeti" tab
    try {
      G.events.emit('death:recap', this.deathLog.recap(this.clock, this.readyDefensives(p)));
    } catch (e) { console.error('[combat] death recap failed', e); }
    if (!G.net || G.net.isAuthority) {
      try { G.mplus.onPlayerDeath(p); } catch (e) { console.error('[combat] mplus.onPlayerDeath failed', e); }
    }
    G.audio.play('player_death', { pos: [p.position.x, p.position.y, p.position.z] });
    G.events.emit('camera:shake', { intensity: 0.5, duration: 0.5 });
    this.slowmo(0.25, 0.25, 0.5, true);
    if (G.character) { G.character.save.stats.deaths++; G.character.persist?.(); }
    void killerId;
  }

  /** Turkish display name of a damage source for the death recap ("Çevre" for hazards and unknown sources). */
  private nameOfSource(id: EntityId | null): string {
    if (id === null) return 'Çevre';
    try {
      const e = G.world?.get<Enemy>(id);
      if (e && e.kind === 'enemy') return e.def.name || 'Düşman';
      if (e && e.kind === 'player') return 'Oyuncu';
    } catch { /* ignore */ }
    return 'Düşman';
  }

  /** Defensives that were ready at death (GDD_V2 §8.5 "Kullanılmayan:"): a potion with stock and off cooldown, a dodge charge. */
  private readyDefensives(p: Player): string[] {
    const out: string[] = [];
    try {
      const ch = G.character;
      const hasPotion = !!ch && [1, 2, 3, 4, 5].some((t) => ch.material(`pot_hp_${t}`) > 0);
      if (hasPotion && this.potionCd.hp <= 0) out.push('Can İksiri');
      if (p.dodgeCharges >= 1) out.push('Takla');
    } catch { /* ignore */ }
    return out;
  }

  /** Revive local player with a fraction of HP. */
  reviveLocalPlayer(hpFrac: number): void {
    const p = G.world?.localPlayer ?? G.player;
    if (!p || !p.isLocal) return;
    this.localDead = false;
    p.alive = true;
    p.hp = Math.max(1, Math.round(p.maxHp * clamp(hpFrac, 0.01, 1)));
    p.forcedMove = null;
    p.cast = null;
    p.combatTimer = 99;
    try { p.anim?.reset(); } catch { /* ignore */ }
    p.statuses.clear();
    G.events.emit('player:revived', { entityId: p.id, local: true });
    G.net?.broadcast('pdeath', { entityId: p.id, dead: false });
    this.lastRes.hp = -1;
  }

  // ======================================================================================================
  // Potions
  // ======================================================================================================

  /** Drink a potion (consumes G.character material, heals/restores, applies 'potion_cd'). False if on cooldown/none left. */
  usePotion(kind: 'hp' | 'mp' | 'cleanse'): boolean {
    const p = G.world?.localPlayer ?? G.player;
    const ch = G.character;
    if (!p || p.isDead || !ch) return false;
    if (this.potionCd[kind] > 0) {
      const text = kind === 'hp' ? 'Can İksiri henüz hazır değil.' : kind === 'mp' ? 'Ruh İksiri henüz hazır değil.' : 'Panzehir İksiri henüz hazır değil.';
      G.events.emit('ui:toast', { text, kind: 'warning' });
      return false;
    }
    if (kind === 'hp' && p.hp >= p.maxHp - 0.5) return false;
    if (kind === 'mp' && p.resource >= p.maxResource - 0.5) return false;
    if (kind === 'cleanse') {
      // Panzehir İksiri (potion_panzehir): dispels every active poison / bleed / kirlenme (rot) debuff on the local player.
      const CLEANSE_IDS: StatusId[] = ['poison', 'bleed', 'kirlenme'];
      const cleansable = CLEANSE_IDS.filter((id) => p.statuses.has(id));
      if (cleansable.length === 0) {
        G.events.emit('ui:toast', { text: 'Temizlenecek bir etki yok.', kind: 'info' });
        return false;
      }
      if (!ch.useMaterial('potion_panzehir', 1)) {
        G.events.emit('ui:toast', { text: 'Panzehir İksirin kalmadı!', kind: 'warning' });
        return false;
      }
      for (const id of cleansable) p.statuses.dispel(id);
      this.potionCd.cleanse = 15;
      p.statuses.apply('potion_cd', 15, { magnitude: 1 });
      G.vfx.spawn('potion_drink', [p.position.x, p.position.y + 1.2, p.position.z]);
      G.audio.play('potion_drink', { pos: [p.position.x, p.position.y, p.position.z] });
      if (!G.skills?.isBusy(p)) p.anim?.playOnce('Use_Item', { upperBody: true, speed: 2.3, fade: 0.05 });
      G.events.emit('materials:changed', {});
      G.events.emit('ui:toast', { text: `Panzehir: ${cleansable.length} olumsuz etki temizlendi.`, kind: 'success' });
      return true;
    }
    const pref = kind === 'hp' ? 'pot_hp_' : 'pot_res_';
    let id: string | null = null;
    let tier = 1;
    for (let t = 5; t >= 1; t--) {
      const cand = pref + t;
      if (ch.material(cand) > 0) { id = cand; tier = t; break; }
    }
    if (!id) {
      // tolerate other id schemes from the items module: any consumable whose id hints at the kind
      const hint = kind === 'hp' ? /(^|_)(hp|health|can)(_|$)/ : /(^|_)(mp|mana|res|ruh)(_|$)/;
      let best = -1;
      for (const m of Object.values(MATERIALS)) {
        if (m.kind !== 'consumable' || !hint.test(m.id) || ch.material(m.id) <= 0) continue;
        const score = m.sellPrice ?? 0;
        if (score > best) { best = score; id = m.id; tier = Math.min(5, Math.max(1, Number(/(\d)$/.exec(m.id)?.[1] ?? 1))); }
      }
    }
    if (!id || !ch.useMaterial(id, 1)) {
      G.events.emit('ui:toast', { text: kind === 'hp' ? 'Can İksirin kalmadı!' : 'Ruh İksirin kalmadı!', kind: 'warning' });
      return false;
    }
    const frac = [0.25, 0.35, 0.45, 0.55, 0.65][clamp(tier, 1, 5) - 1];
    const pm = 1 + p.getStat('potionPct');
    if (kind === 'hp') {
      const total = p.maxHp * frac * pm;
      this.applyHeal(p, total * 0.6, p.id, { raw: true });
      p.statuses.apply('regen', 3, { magnitude: (total * 0.4) / 3, sourceId: p.id });
      this.potionCd.hp = 10;
    } else {
      p.resource = Math.min(p.maxResource, p.resource + p.maxResource * frac * pm);
      this.potionCd.mp = 15;
    }
    const cdNow = Math.max(this.potionCd.hp, this.potionCd.mp);
    p.statuses.apply('potion_cd', kind === 'hp' ? 10 : 15, { magnitude: 1 });
    void cdNow;
    G.vfx.spawn('potion_drink', [p.position.x, p.position.y + 1.2, p.position.z]);
    G.audio.play('potion_drink', { pos: [p.position.x, p.position.y, p.position.z] });
    if (!G.skills?.isBusy(p)) p.anim?.playOnce('Use_Item', { upperBody: true, speed: 2.3, fade: 0.05 });
    G.events.emit('materials:changed', {});
    return true;
  }

  /** Seconds left on a potion cooldown (HUD). */
  potionCooldown(kind: 'hp' | 'mp' | 'cleanse'): number {
    return Math.max(0, this.potionCd[kind]);
  }

  // ======================================================================================================
  // Per-frame
  // ======================================================================================================

  /** Per-frame: regen for the local player, dot ticks (host for enemies), combat timers. */
  update(dt: number): void {
    this.clock += dt;
    this.combo.update(dt);
    if (this.potionCd.hp > 0) this.potionCd.hp -= dt;
    if (this.potionCd.mp > 0) this.potionCd.mp -= dt;
    if (this.potionCd.cleanse > 0) this.potionCd.cleanse -= dt;
    this.updateLocalPlayer(dt);
    this.updateGuard(dt);
    this.updateFx(dt);
    this.updateFlashQueue();
    this.updateStagger(dt);
    this.updateCorpses(dt);
    this.updateSlams();
    this.flushFeel();
    this.updateSlowmo();
    if (this.reactCd.size > 200) {
      for (const [id, t] of this.reactCd) if (t < this.clock) this.reactCd.delete(id);
    }
  }

  /** Guard profile follows the local class; the gauge regenerates and a whiffed parry window lowers the guard. */
  private updateGuard(dt: number): void {
    const lp = G.world?.localPlayer;
    this.guard.setProfile(lp && lp.isLocal ? guardProfileOf(lp.classId) : undefined);
    this.guard.update(dt, this.clock);
    if (!lp || !lp.isLocal || lp.isDead || lp.dodging) this.guard.held = false;
  }

  private updateLocalPlayer(dt: number): void {
    const p = G.world?.localPlayer;
    if (!p || !p.isLocal) return;
    if (!this.seenPlayers.has(p)) {
      this.seenPlayers.add(p);
      this.localDead = p.isDead;
      const cls = CLASSES[p.classId];
      if (cls && p.maxResource > 0) p.resource = p.maxResource * cls.startResource;
    }
    if (p.isDead) { this.emitResources(p); return; }
    if (this.localDead) this.localDead = false;
    this.updateSpecialsLocal(p);
    const cls = CLASSES[p.classId];
    const ooc = p.combatTimer > 5;

    // HP regen
    let hpr = p.getStat('hpRegen') + softStat(p, 'hpRegenPct') * p.maxHp;
    if (ooc) hpr += 0.04 * p.maxHp;
    if (hpr > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + hpr * dt);

    // resource
    if (cls && p.maxResource > 0) {
      const noStats = Object.keys(p.stats).length === 0;
      let regen = p.getStat('resourceRegen');
      if (noStats) regen = (cls.baseStats.resourceRegen ?? 0) + (cls.id === 'mage' ? 0.015 * 18 : 0);
      regen *= 1 + softStat(p, 'resourceRegenPct');
      if (formRegen(p, dt, ooc, softStat(p, 'resourceRegenPct'))) {
        // KIT Druid: Kedi energy refill / Ayı rage decay (combat/Forms.ts) replaces the class regen
      } else if (cls.id === 'barbarian' || cls.regenRule === 'rage') {
        // PM-NE: the Nekromant's Öz (regenRule 'rage', Runic Power) decays out of combat like rage and has no passive regen
        // Öfke Makinesi: rage does not decay for 8 s after the last gain
        const hold = sp('n_rage_engine')?.rageDecayDelay ?? 0;
        const held = hold > 0 && !!G.skills && G.skills.now - G.skills.lastResourceGainAt < hold;
        if (ooc && !held) p.resource = Math.max(0, p.resource - 4 * dt);
      } else {
        if (cls.id === 'mage' && ooc) regen *= 3;
        if (regen > 0 && p.resource < p.maxResource) p.resource = Math.min(p.maxResource, p.resource + regen * dt);
      }
      if (cls.id === 'knight' && G.skills?.bannerActive(p)) p.resource = Math.min(p.maxResource, p.resource + 3 * dt);
    }
    this.emitResources(p);
  }

  /** Small flourish when the hit-combo reaches a new tier (ring at the feet + rising chime). */
  private comboTierFx(tier: number): void {
    const p = G.world?.localPlayer;
    if (!p || p.isDead) return;
    const cols = [0xffffff, 0xffe27a, 0xffa23a, 0xff5a3a, 0xff2a6a];
    try {
      G.vfx.spawn('shockwave', [p.position.x, 0.1, p.position.z], { scale: 0.32 + tier * 0.06, color: cols[Math.min(tier, 4)] });
      G.vfx.spawn('crit_burst', [p.position.x, p.position.y + 2.2, p.position.z], { scale: 0.5 + tier * 0.1, color: cols[Math.min(tier, 4)] });
      G.audio.play('buff', { pos: [p.position.x, p.position.y, p.position.z], pitch: 0.9 + tier * 0.14, volume: 0.55 });
      G.events.emit('camera:shake', { intensity: 0.05 + tier * 0.02, duration: 0.18 });
    } catch { /* ignore */ }
  }

  /** Keystone / legendary effects that live on the player: extra dodge charges, roll buffs. */
  private updateSpecialsLocal(p: Player): void {
    let b = this.dodgeBase.get(p);
    if (!b) { b = { max: p.dodgeMaxCharges, rec: p.dodgeRecharge }; this.dodgeBase.set(p, b); }
    let bonus = 0, recPct = 0;
    const sd = sp('ks_shadow_dance');
    if (sd) { bonus += sd.dodgeRollCharges ?? 1; recPct += sd.dodgeRollRechargePct ?? -0.3; }
    const wr = sp('leg_windrunner');
    if (wr) bonus += wr.charges ?? 1;
    const want = b.max + bonus;
    if (p.dodgeMaxCharges !== want) {
      if (want > p.dodgeMaxCharges) p.dodgeCharges += want - p.dodgeMaxCharges;
      p.dodgeMaxCharges = want;
      p.dodgeCharges = Math.min(p.dodgeCharges, want);
    }
    p.dodgeRecharge = b.rec * (1 + recPct);
    const dodging = !!p.dodging;
    if (dodging && !this.wasDodging) this.onDodgeStart(p, sd, wr);
    this.wasDodging = dodging;
  }

  private onDodgeStart(p: Player, sd: Record<string, number> | null, wr: Record<string, number> | null): void {
    if (wr) p.statuses.apply('windrunner', wr.buffSec ?? 3, { sourceId: p.id });
    if (sd) p.statuses.apply('dancer', 0.4 + (sd.guaranteedCritWindow ?? 1.5), { sourceId: p.id });
    if (hasSp('set_shadow_veil_2')) p.statuses.apply('veil', 3.4, { sourceId: p.id });
    this.applyDodgeStackLoss(p);
  }

  /**
   * P-21 onDodge (K14): a dodge roll removes stacks of every status whose rule has onDodge (arcane_lockdown: 1 stack).
   * StatusEffects has no stack-decrement API, so the status is re-applied with the remaining stacks (same timer and magnitude).
   */
  private applyDodgeStackLoss(p: Player): void {
    for (const id of DODGE_STACK_IDS) {
      const s = p.statuses.get(id);
      if (!s) continue;
      const left = stacksAfterLoss(s.stacks, dodgeStackLoss(id));
      if (left === s.stacks) continue;
      const { remaining, magnitude, sourceId, dps } = s;
      p.statuses.remove(id);
      if (left > 0) p.statuses.apply(id, remaining, { stacks: left, magnitude, sourceId, dps, replicated: true });
    }
  }

  private emitResources(p: Player): void {
    const l = this.lastRes;
    const hp = Math.round(p.hp * 10) / 10, mx = Math.round(p.maxHp), r = Math.round(p.resource * 10) / 10, mr = Math.round(p.maxResource);
    if (hp === l.hp && mx === l.maxHp && r === l.res && mr === l.maxRes) return;
    l.hp = hp; l.maxHp = mx; l.res = r; l.maxRes = mr;
    G.events.emit('player:resources', { hp: p.hp, maxHp: p.maxHp, res: p.resource, maxRes: p.maxResource });
  }

  // ---- Duvara Çarpma (GDD 8.5): an enemy flung into a wall takes an extra hit and is stunned ----

  private slams: { e: Enemy; at: number; amount: number; type: DamageType; sourceId: EntityId | null; x: number; z: number; dx: number; dz: number }[] = [];

  /** HOST: if the knockback ends against a wall before 70% of its distance, schedule the slam (50% of the hit, 0.5 s stun). */
  private checkWallSlam(e: Enemy, d: [number, number], dist: number, dur: number, amount: number, type: DamageType, sourceId: EntityId | null): void {
    const w = G.world;
    if (!w || dist < 0.9 || e.isDead || this.slams.length > 24 || this.slams.some((s) => s.e === e)) return;
    const sx = e.position.x, sz = e.position.z;
    const reach = dist + e.radius;
    const f = w.nav.raycast(sx, sz, sx + d[0] * reach, sz + d[1] * reach);
    if (f >= 1) return;
    const travel = Math.max(0, f * reach - e.radius);
    if (travel > dist * 0.7) return;
    this.slams.push({
      e, at: this.clock + Math.max(0.05, dur * (travel / dist)), amount: Math.max(1, Math.round(amount * 0.5)), type, sourceId,
      x: sx + d[0] * (travel + e.radius), z: sz + d[1] * (travel + e.radius), dx: d[0], dz: d[1],
    });
  }

  private updateSlams(): void {
    for (let i = this.slams.length - 1; i >= 0; i--) {
      const s = this.slams[i];
      if (s.e.removed || s.e.isDead) { this.slams.splice(i, 1); continue; }
      if (this.clock < s.at) continue;
      this.slams.splice(i, 1);
      try {
        const e = s.e;
        G.vfx.spawn('ground_slam', [s.x, 0.05, s.z], { scale: 0.55 });
        G.vfx.spawn('hit_spark', [e.position.x, e.position.y + e.height * 0.5, e.position.z], { scale: 1.2, dir: [-s.dx, 0.2, -s.dz] });
        G.audio.play('ground_slam', { pos: [s.x, 0, s.z], pitch: 1.2, volume: 0.8 });
        const lp = G.world?.localPlayer;
        if (lp && s.sourceId === lp.id) {
          G.events.emit('camera:shake', { intensity: 0.2, duration: 0.2 });
          G.events.emit('hitstop', { ms: 45 });
        }
        this.applyDamageToEnemy(e, s.amount, false, s.type, s.sourceId, [{ status: 'stun', duration: 0.5 }], 'wall_slam', 0, [-s.dx, -s.dz], { weight: 'heavy', noReact: true, pos: [e.position.x, e.position.y + e.height * 0.6, e.position.z] });
      } catch (err) {
        console.error('[combat] wall slam failed', err);
      }
    }
  }

  private updateStagger(dt: number): void {
    if (!this.stagger.size) return;
    for (const [id, s] of this.stagger) {
      // poise regen: a fraction of max per second after the enemy's delay (GDD_V2 §3.7)
      if (s.v > 0 && s.max > 0 && this.clock - s.lastGain > s.delay) s.v = Math.max(0, s.v - s.max * s.rate * dt);
      if (s.v <= 0 && this.clock > s.lockedUntil && this.clock > s.brokenUntil) {
        const e = G.world?.get(id);
        if (!e || e.removed) this.stagger.delete(id);
      }
    }
  }

  private updateCorpses(dt: number): void {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.t -= dt;
      if (c.enemy.removed) { this.corpses.splice(i, 1); continue; }
      if (!c.enemy.isDead) { this.corpses.splice(i, 1); continue; } // revived (Diriltici)
      // a Diriltici champion is still alive in the pack: keep its corpses lying around so it has something to raise
      if (c.enemy.corpseHoldUntil > (G.world?.time ?? 0)) { c.t = Math.max(c.t, 0.5); continue; }
      if (c.t <= 0) {
        try { c.enemy.destroy(); } catch { /* ignore */ }
        this.corpses.splice(i, 1);
      }
    }
  }

  private clearScene(): void {
    this.fxList.length = 0;
    this.flashQueue.length = 0;
    this.deathLog.clear();
    this.acc = newFeelAcc();
    this.corpses.length = 0;
    this.slams.length = 0;
    this.stagger.clear();
    this.guard.held = false;
    this.guard.setProfile(undefined);
    this.meters.reset();
    this.reactCd.clear();
    this.potionCd.hp = this.potionCd.mp = this.potionCd.cleanse = 0;
    this.localDead = false;
    this.combo.reset();
    this.sp.reset();
    this.wasDodging = false;
    this.acc.any = false;
    if (this.slow.active && G.engine) { G.engine.timeScale = 1; this.slow.active = false; }
    this.lastRes.hp = -1;
  }

  // ======================================================================================================
  // Net receivers
  // ======================================================================================================

  private entityOfPeer(peerId: string): EntityId | null {
    const info = G.net?.peers.get(peerId);
    return info ? PARTY_ID_BASE + info.slot : null;
  }

  private onNetHit(p: NetChannels['hit'], from: string): void {
    if (!G.net.isAuthority || !G.world) return;
    // WP-07 Kızıl Sınır: a hit on another PLAYER goes to the PvP runtime (zone / nation rules, guard.vetPvpHit, forward to the victim)
    if (pvp.onClientHit(from, p)) return;
    const t = G.world.get<Enemy>(p.targetId);
    if (!t || t.kind !== 'enemy' || t.isDead) return;
    // F6 host validation (net/guard.ts): known live sender, rate, reach and the amount cap (clamped); a rejected hit is dropped
    const amount = vetHit(from, t, p.skillId, !!p.isDot, Number(p.amount) || 0);
    if (amount === null) return;
    const sourceId = this.entityOfPeer(from);
    // a client's parry request (GDD_V2 §3.5): the host applies the poise hit
    if (p.skillId === 'parry') { this.applyParry(t, sourceId); return; }
    const sk = p.skillId ? SKILLS[p.skillId] : undefined;
    const w = sk?.params?.weight;
    const weight: HitWeight = p.isDot ? 'tick' : w === 3 ? 'ultimate' : w === 2 ? 'heavy' : w === 1 ? 'finisher' : sk?.targeting === 'projectile' ? 'projectile' : 'light';
    // Kritik Vuruş (GDD_V2 §3.7): the crit only counts while the target is still marked; the finisher ends a trash / elite break
    const finisher = p.skillId === 'crit_finisher';
    const crit = !!p.crit && (!finisher || t.statuses.has('marked_crit'));
    if (finisher && sourceId !== null) this.markFinisher(t, sourceId);
    const stagger = typeof p.poise === 'number' && p.poise > 0 ? clamp(p.poise, 0, 500) : undefined;
    // NC42: `via` is honoured only for a live minion that belongs to the sender (the host sees remote minions through the `minion` channel)
    let viaId: EntityId | undefined;
    if (typeof p.via === 'number' && sourceId !== null) {
      const vm = G.world.get<Minion>(p.via);
      if (vm && vm.kind === 'minion' && vm.ownerId === sourceId && !vm.isDead) viaId = vm.id;
    }
    this.applyDamageToEnemy(t, amount, crit, p.type, sourceId, p.statuses, p.skillId, p.knockback, p.dir, { remote: true, dot: false, weight, tick: !!p.isDot, noReact: false, knockup: sk?.params?.knockup, stagger, viaId });
  }

  private onNetDmg(p: NetChannels['dmg']): void {
    const t = G.world?.get<Enemy>(p.targetId);
    if (!t || t.kind !== 'enemy') return;
    const lp = G.world?.localPlayer;
    t.hp = clamp(p.hp, 0, t.maxHp || p.hp);
    t.combatTimer = 0;
    if (lp && p.sourceId === lp.id) {
      // own hits were predicted locally; dot ticks (host-side statuses) were not
      if (p.dot) { this.dotLeech(p.sourceId, p.amount); this.showEnemyHit(t, p.amount, p.crit, p.type, p.sourceId, [0, 1], { remote: true, dot: true }, p.amount); }
      return;
    }
    const dir: [number, number] = p.sourceId !== null && G.world?.get(p.sourceId) ? this.dirFromTo(G.world.get(p.sourceId) as Actor, t) : [0, 1];
    this.showEnemyHit(t, p.amount, p.crit, p.type, p.sourceId, dir, { remote: true }, p.amount);
  }

  private onNetDeath(p: NetChannels['death']): void {
    const e = G.world?.get<Enemy>(p.entityId);
    if (!e || e.kind !== 'enemy') return;
    this.finalizeDeath(e, p.killerId, false);
  }

  private onNetEnemyStatus(p: NetChannels['estatus']): void {
    const e = G.world?.get<Enemy>(p.targetId);
    if (!e || e.kind !== 'enemy') return;
    if (p.removed) { e.statuses.remove(p.status); return; }
    e.statuses.apply(p.status, p.duration, { stacks: Math.max(1, p.stacks), replicated: true });
    if (p.status === 'knockdown') this.addHop(e, 1);
  }

  private onNetHeal(p: NetChannels['heal']): void {
    const lp = G.world?.localPlayer;
    if (!lp || lp.id !== p.targetId || lp.isDead) return;
    this.applyHeal(lp, p.amount, p.sourceId);
  }

  private onNetPlayerStatus(p: NetChannels['pstatus']): void {
    const lp = G.world?.localPlayer;
    if (!lp || lp.id !== p.targetId || lp.isDead) return;
    lp.statuses.apply(p.status, p.duration, { stacks: p.stacks, magnitude: p.magnitude, sourceId: p.sourceId });
  }

  private onNetRevive(p: NetChannels['revive']): void {
    const lp = G.world?.localPlayer;
    if (!lp || lp.id !== p.targetId) return;
    this.reviveLocalPlayer(p.hpFrac);
  }

  private onNetPlayerDeath(p: NetChannels['pdeath'], from: string): void {
    const w = G.world;
    if (!w) return;
    const pl = w.get<Player>(p.entityId);
    if (!pl || pl.kind !== 'player' || pl.isLocal) return;
    // F6 (net/guard.ts): only the owning peer may kill or revive its player, and a repeated death is ignored (no double key penalty)
    if (!vetPlayerDeath(from, pl, p.dead)) return;
    if (p.dead) {
      pl.hp = 0;
      pl.alive = false;
      try { pl.anim?.playOnce(pl.anim.pick('Death_B', 'Death_A') ?? 'Death_A', { hold: true, fade: 0.05 }); } catch { /* ignore */ }
      G.events.emit('player:died', { entityId: pl.id, local: false });
      if (G.net.isAuthority) {
        try { G.mplus.onPlayerDeath(pl); } catch (e) { console.error('[combat] mplus.onPlayerDeath failed', e); }
      }
    } else {
      pl.alive = true;
      try { pl.anim?.reset(); } catch { /* ignore */ }
      G.events.emit('player:revived', { entityId: pl.id, local: false });
    }
  }
}

void yawFromDir;
void KNOCKBACK;
