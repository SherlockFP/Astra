import * as THREE from 'three';
import { G } from '../game/G';
import { RNG, clamp } from '../core/utils';
import { ENEMIES } from '../data/enemies';
import { STATUSES, STATUS_RULES } from '../data/statuses';
import { getDungeon, DUNGEON_IDS } from '../data/dungeons';
import { DUNGEON_ENEMY_ID_BASE, type EntityId } from '../types/common';
import { TILE_SIZE, type DungeonDef } from '../types/dungeons';
import type { AffixId, RunState } from '../types/mythic';
import type { EnemyAbility, EnemyDef } from '../types/enemies';
import type { NetChannels } from '../types/net';
import type { StatusId } from '../types/skills';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { HitShapeSpec } from '../combat/HitShapes';
import type { VfxHandle } from '../vfx/VFX';
import type { MythicPlus, RunParams } from './MythicPlus';
import {
  EFSUN_INFO, EFSUN_ORDER, EFSUN_THRESHOLDS, MPLUS_TR, MYTHIC_AFFIXES, affixDamageScale, chestItemLevel, monsterDmg, monsterHP, mplusDmg, mplusHp,
  partyHpFactor, type EfsunType,
} from '../data/mythicAffixes';

/**
 * Affix behaviours (GDD_CONTENT 5.5). Owned and driven by MythicPlus.
 *
 * Authority split (ARCHITECTURE "Damage authority"):
 *  - HOST decides everything that touches enemies or spawns hazards: bolster/raging/inspiring/sanguine-heal, orb + shade +
 *    tornado + volcanic + quaking + rift spawns. Spatial player damage goes through G.hitShapes (host spawns, every peer
 *    resolves its OWN player); area/global effects are broadcast on the 'affix' channel and every peer hurts only its own
 *    local player with a %-max-HP hit (G.combat.hitLocalPlayer with type 'true').
 *  - EVERY peer runs the player-side parts for its own local player (bursting/necrotic/grievous/sanguine ticks, blessings)
 *    and all visuals (events arrive via handle()).
 * Special units are registered into ENEMIES at runtime (registerAffixUnits) on every peer so 'spawn' messages resolve.
 * OWNER: mythic+ module.
 */

type Msg = NetChannels['affix'];
type Spawner = (defId: string, pos: { x: number; z: number }, opts: { level: number; facing?: number; aggro?: boolean }) => Promise<Enemy | null>;
type Vec2 = { x: number; z: number };

export const ORB_ID = 'affix_explosive_orb';
export const SHADE_ID = 'affix_spiteful_shade';
export const isAffixUnitId = (id: string): boolean => id.startsWith('affix_') || id.startsWith('efsun_guardian');
export const isAffixUnit = (e: { def?: { id: string } } | null | undefined): boolean => !!e?.def && isAffixUnitId(e.def.id);
const isNonBoss = (e: Enemy): boolean => e.def.rank === 'trash' || e.def.rank === 'elite';
/** Regular enemies that affixes act on (not bosses, not affix units, not boss-mechanic entities like phylacteries). */
const isRegular = (e: Enemy): boolean => isNonBoss(e) && !isAffixUnit(e) && !e.def.id.startsWith('proc_');

const warned = new Set<string>();
function warnOnce(key: string, err: unknown): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[affixes] ${key}`, err);
}
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const P = (id: AffixId): Record<string, number> => MYTHIC_AFFIXES[id]?.params ?? {};
const toast = (text: string, kind: 'info' | 'success' | 'warning' | 'error' | 'loot' | 'levelup' | 'boss' = 'info'): void => {
  try { G.events.emit('ui:toast', { text, kind }); } catch { /* ignore */ }
};
const vpos = (x: number, z: number, y = 0): [number, number, number] => [x, y, z];
const dist = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);

/* ------------------------------------------------------------------------------------------------ runtime registries */

const ability = (o: Partial<EnemyAbility> & Pick<EnemyAbility, 'id' | 'name' | 'kind' | 'anim'>): EnemyAbility => ({ range: 2, cooldown: 2, windup: 0.5, ...o });

function guardianDef(type: EfsunType): EnemyDef {
  const info = EFSUN_INFO[type];
  const common = { hpMult: 15, dmgMult: 2.0, forces: 0, xp: 2, ccImmune: true, rank: 'elite' as const, aggroRange: 40, radius: 0.9 };
  if (type === 'kor') {
    return {
      ...common, id: info.unit, name: 'Kor Yarık Muhafızı', model: '/assets/models/monsters/Demon.glb', tint: 0xff6a00, emissive: 0xff3000, scale: 1.33,
      role: 'melee', speed: 4.2, attackRange: 2.6, attackCooldown: 1.8,
      basicAttack: ability({ id: 'kor_pence', name: 'Kor Pençesi', kind: 'melee', range: 2.6, cooldown: 1.8, windup: 0.55, damage: { coef: 1.5, type: 'fire' }, anim: 'Attack' }),
      abilities: [ability({
        id: 'alev_halkasi', name: 'Alev Halkası', kind: 'self_aoe', range: 8, cooldown: 6, initialCooldown: 3, windup: 1.2, castTime: 1.2,
        shape: { type: 'ring', inner: 3, outer: 8 }, telegraph: true, damage: { coef: 2.0, type: 'fire' }, anim: 'Attack', vfx: 'fire_burst',
      })],
      anims: { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'HitRecieve', death: 'Death' },
    };
  }
  if (type === 'ayaz') {
    return {
      ...common, id: info.unit, name: 'Ayaz Yarık Muhafızı', model: '/assets/models/monsters/Yeti.glb', tint: 0x9fd8ff, emissive: 0x2060a0, scale: 1.07,
      role: 'tank', speed: 3.8, attackRange: 2.8, attackCooldown: 2,
      basicAttack: ability({ id: 'ayaz_pence', name: 'Buz Pençesi', kind: 'melee', range: 2.8, cooldown: 2, windup: 0.6, damage: { coef: 1.5, type: 'frost' }, anim: 'Attack' }),
      abilities: [ability({
        id: 'buz_kirici', name: 'Buz Kırıcı', kind: 'cone', range: 8, cooldown: 8, initialCooldown: 3, windup: 1.4, castTime: 1.4,
        shape: { type: 'cone', radius: 8, angle: 90 }, telegraph: true, damage: { coef: 3.0, type: 'frost' },
        statuses: [{ status: 'freeze', duration: 1.5 }], anim: 'Attack', vfx: 'frost_burst',
      })],
      anims: { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'HitRecieve', death: 'Death' },
    };
  }
  return {
    ...common, id: info.unit, name: 'Gölge Yarık Muhafızı', model: '/assets/models/monsters/Ghost.glb', tint: 0x6020a0, emissive: 0x401080, scale: 1.33,
    role: 'caster', speed: 4.6, attackRange: 6, attackCooldown: 2.2, flying: true,
    basicAttack: ability({ id: 'golge_vurus', name: 'Gölge Vuruşu', kind: 'melee', range: 2.6, cooldown: 2.2, windup: 0.5, damage: { coef: 1.5, type: 'shadow' }, anim: 'Punch' }),
    abilities: [ability({
      id: 'golge_sicramasi', name: 'Gölge Sıçraması', kind: 'custom', range: 30, cooldown: 7, initialCooldown: 3, windup: 1.0, castTime: 1.0, interruptible: true,
      shape: { type: 'circle', radius: 3 }, telegraph: true, damage: { coef: 2.0, type: 'shadow' }, anim: 'Headbutt', vfx: 'shadow_burst', params: { blink: 1 },
    })],
    anims: { idle: 'Flying_Idle', walk: 'Fast_Flying', run: 'Fast_Flying', hit: 'HitReact', death: 'Death' },
  };
}

/** Register the special units (explosive orb, spiteful shade, 3 rift guardians) into ENEMIES. Idempotent, every peer. */
export function registerAffixUnits(): void {
  const reg = (d: EnemyDef) => { if (!ENEMIES[d.id]) ENEMIES[d.id] = d; };
  reg({
    id: ORB_ID, name: 'Patlayıcı Küre', model: 'PROC:explosive_orb', scale: 1, role: 'support', rank: 'trash', hpMult: 0.0001, dmgMult: 0, speed: 0, radius: 0.6,
    aggroRange: 0, attackRange: 0, attackCooldown: 99, forces: 0, xp: 0, ccImmune: true, flying: true, hoverHeight: 1.4,
    basicAttack: ability({ id: 'orb_none', name: 'Patlama', kind: 'custom', range: 0, cooldown: 99, windup: 0, anim: '', params: { passive: 1 } }),
    abilities: [],
    anims: { idle: 'Idle', walk: 'Idle', run: 'Idle', death: 'Idle' },
    ai: { summoned: true },
  });
  reg({
    id: SHADE_ID, name: 'Kin Ruhu', model: '/assets/models/monsters/Ghost.glb', tint: 0x200010, scale: 0.67, role: 'melee', rank: 'trash', hpMult: 0.3, dmgMult: 0, speed: 5.6,
    radius: 0.6, aggroRange: 60, attackRange: 1.6, attackCooldown: 1.5, forces: 0, xp: 0, ccImmune: true, flying: true,
    basicAttack: ability({ id: 'shade_hit', name: 'Kin Dokunuşu', kind: 'melee', range: 1.6, cooldown: 1.5, windup: 0.3, anim: 'Punch' }),
    abilities: [],
    anims: { idle: 'Flying_Idle', walk: 'Fast_Flying', run: 'Fast_Flying', hit: 'HitReact', death: 'Death' },
  });
  for (const t of EFSUN_ORDER) reg(guardianDef(t));
}

/** Register runtime statuses used by the seasonal affix (blessings + possessed pack). Idempotent. */
export function registerAffixStatuses(): void {
  const I = (n: string) => `/assets/icons/${n}.svg`;
  STATUSES.blessing_kor ??= { id: 'blessing_kor', name: 'Kor Efsunu', icon: I('buff-strength'), kind: 'buff', stats: { damagePct: 0.15 }, vfx: 'buff_aura' };
  STATUSES.blessing_ayaz ??= { id: 'blessing_ayaz', name: 'Ayaz Efsunu', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.15 }, vfx: 'buff_aura' };
  STATUSES.blessing_golge ??= { id: 'blessing_golge', name: 'Gölge Efsunu', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.2, critChance: 0.1, cdr: 0.1 }, vfx: 'buff_aura' };
  STATUSES.efsunlu ??= { id: 'efsunlu', name: 'Efsunlu', icon: I('affix-seasonal'), kind: 'buff', stats: { damagePct: 0.2 } };
  STATUS_RULES.blessing_kor ??= { stack: 'refresh' };
  STATUS_RULES.blessing_ayaz ??= { stack: 'refresh' };
  STATUS_RULES.blessing_golge ??= { stack: 'refresh' };
  STATUS_RULES.efsunlu ??= { stack: 'refresh' };
  // GDD 5.5: Necrotic -3 % healing received per stack (max 99 %); the affix params are the single source of truth
  const necro = (STATUS_RULES.necrotic ??= { stack: 'stack' });
  necro.healMult = (stacks: number) => Math.max(0.01, 1 - (MYTHIC_AFFIXES.necrotic?.params.healReducePerStack ?? 0.03) * stacks);
}

/* ------------------------------------------------------------------------------------------------ model helpers */

type MatLike = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; opacity: number; transparent: boolean; userData: Record<string, unknown> };

function eachMesh(root: THREE.Object3D, fn: (m: THREE.Mesh) => void): void {
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) fn(o as THREE.Mesh); });
}

function forMaterials(root: THREE.Object3D, fn: (mat: MatLike) => void): void {
  eachMesh(root, (m) => {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) fn(mat as MatLike);
  });
}

/** Blend base colour toward `hex` (and add a little emissive so bloom catches it). */
function applyTint(root: THREE.Object3D | null | undefined, hex: number, blend: number, emissive = 0): void {
  if (!root) return;
  // Enemy.loadModel clones every material per entity, so recolouring in place never leaks to other enemies
  const c = new THREE.Color(hex);
  forMaterials(root, (mat) => {
    if (mat.color) {
      if (!mat.userData.affixBase) mat.userData.affixBase = mat.color.clone();
      mat.color.copy(mat.userData.affixBase as THREE.Color).lerp(c, blend);
    }
    if (emissive > 0 && mat.emissive) {
      if (!mat.userData.affixEmi) mat.userData.affixEmi = mat.emissive.clone();
      mat.emissive.copy(mat.userData.affixEmi as THREE.Color).lerp(c, emissive);
    }
  });
}

/** Detach a procedural effect group and free its GPU resources. */
function disposeGroup(g: THREE.Object3D | null | undefined): void {
  if (!g) return;
  g.removeFromParent();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) mt?.dispose();
  });
}

function setOpacity(root: THREE.Object3D | null | undefined, opacity: number): void {
  if (!root) return;
  forMaterials(root, (mat) => { mat.transparent = true; mat.opacity = opacity; mat.needsUpdate = true; });
}

/* ------------------------------------------------------------------------------------------------ state shapes */

interface Pool { id: number; x: number; z: number; r: number; until: number; vfx: VfxHandle | null }
interface Tornado { id: number; x: number; z: number; heading: number; speed: number; r: number; t0: number; life: number; simT: number; rng: RNG; turnT: number; hit: boolean; vfx: VfxHandle | null }
interface OrbHost { enemy: Enemy; born: number; cast: number }
interface OrbView { id: number; t0: number; cast: number; x: number; z: number; mesh: THREE.Group | null; castStarted: boolean }
interface Shade { enemy: Enemy; initial: number; targetId: EntityId | null; nextAttack: number; moving: boolean }
interface HostRift { number: number; type: EfsunType; x: number; z: number; phase: 'opening' | 'guardian'; t: number; guardian: Enemy | null; spawning: boolean }
interface RiftView { number: number; type: EfsunType; x: number; z: number; group: THREE.Group; vfx: VfxHandle | null; t: number }

const TYPE_INDEX: Record<EfsunType, number> = { kor: 0, ayaz: 1, golge: 2 };

/**
 * All affix gameplay. One instance lives inside MythicPlus (`G.mplus.fx`).
 */
export class Affixes {
  active = false;

  private st!: RunState;
  private prm!: RunParams;
  private def: DungeonDef | undefined;
  private rng = new RNG(1);
  /** Test seam / custom spawner: dev pages install one when the enemy factory is still a stub. */
  private spawner: Spawner | null = null;
  private offs: (() => void)[] = [];

  // host clocks
  private combatClock = 0;
  private lastCombatAt = -999;
  private inCombat = false;
  private nextVolcanic = 0;
  private nextExplosive = 0;
  private nextStorm = 0;
  private stormClock = 0;
  private nextQuake = new Map<number, number>();
  private acc025 = 0;
  private acc05 = 0;
  // every-peer clocks
  private accLocal = 0;
  private grievousT = 0;
  private grievousN = 0;
  private grievousShown = 0;

  private waiting: { id: number; fn: (e: Enemy) => void; ttl: number }[] = [];
  private polls: { test: () => boolean; fn: () => void; ttl: number }[] = [];
  private pending: { at: number; fn: () => void }[] = [];

  private pools: Pool[] = [];
  private poolSeq = 0;
  private tornadoes: Tornado[] = [];
  private tornadoSeq = 0;
  private orbs = new Map<number, OrbHost>();
  private orbViews = new Map<number, OrbView>();
  private shades = new Map<number, Shade>();
  private inspirers = new Set<number>();
  private inspirerFx = new Map<number, VfxHandle>();
  private hpMods = new WeakMap<Enemy, { base: number; stacks: number; efsun: boolean }>();
  private possessed = new Set<number>();
  private guardians = new Set<number>();
  private auras = new Map<number, VfxHandle>();
  /** Enemies already passed through onSpawned (the enemy factory only notifies the host; every peer also scans the world). */
  private seen = new WeakSet<Enemy>();
  private scanT = 0;
  private burnAt = new Map<number, number>();
  private chillAt = new Map<number, number>();

  // seasonal affix
  private riftNumber = 0;
  private riftQueue: number[] = [];
  private riftSpotsUsed = new Set<number>();
  private rift: HostRift | null = null;
  private riftViews = new Map<number, RiftView>();
  private lastFracShown = 0;
  /** Efsun blessing of the LOCAL player (for combat hooks: burn on hit / chill attackers). */
  blessing: EfsunType | null = null;

  constructor(readonly mp: MythicPlus) {}

  /* ================================================================================ lifecycle */

  start(state: RunState, params: RunParams): void {
    this.stop();
    registerAffixUnits();
    registerAffixStatuses();
    this.st = state;
    this.prm = params;
    this.def = getDungeon(params.dungeonId);
    this.rng = new RNG(((params.seed ^ 0x5bd1e995) >>> 0) || 1);
    this.active = true;
    this.combatClock = 0;
    this.nextVolcanic = P('volcanic').interval ?? 7;
    this.nextExplosive = P('explosive').interval ?? 8;
    this.nextStorm = P('storming').interval ?? 30;
    this.offs.push(G.events.on('death', (d) => this.onDeathEvent(d.entityId)));
    if (this.has('seasonal_efsun')) this.offs.push(G.events.on('damage', (d) => this.onDamageEvent(d)));
    if (this.has('inspiring')) this.inspirers = this.computeInspirers();
  }

  stop(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.active = false;
    for (const p of this.pools) p.vfx?.stop();
    for (const t of this.tornadoes) t.vfx?.stop();
    for (const h of this.inspirerFx.values()) h.stop();
    for (const h of this.auras.values()) h.stop();
    for (const v of this.orbViews.values()) disposeGroup(v.mesh);
    for (const v of this.riftViews.values()) this.disposeRiftView(v);
    this.pools = []; this.tornadoes = []; this.orbs.clear(); this.orbViews.clear(); this.shades.clear();
    this.inspirers.clear(); this.inspirerFx.clear(); this.auras.clear(); this.possessed.clear(); this.guardians.clear();
    this.riftViews.clear(); this.riftQueue = []; this.riftSpotsUsed.clear(); this.rift = null; this.riftNumber = 0;
    this.waiting = []; this.polls = []; this.pending = []; this.nextQuake.clear();
    this.grievousN = 0; this.grievousT = 0; this.grievousShown = 0; this.lastFracShown = 0;
    this.acc025 = 0; this.acc05 = 0; this.accLocal = 0; this.stormClock = 0;
    this.blessing = null;
    this.seen = new WeakSet(); this.scanT = 0; this.burnAt.clear(); this.chillAt.clear();
  }

  /** Replace the unit spawner (dev pages / tests). null restores spawnEnemy from entities/EnemyFactory. */
  setSpawner(fn: Spawner | null): void {
    this.spawner = fn;
  }

  has(id: AffixId): boolean {
    return this.active && this.st.affixes.includes(id);
  }

  private get live(): boolean {
    return this.active && this.st.started && !this.st.completed && !this.st.failed;
  }

  private get host(): boolean {
    return !G.net || G.net.isAuthority;
  }

  /** Affix damage given as % max HP: scaled by key level above the affix's own start level. */
  private scale(id: AffixId): number {
    return affixDamageScale(this.prm?.keyLevel ?? 0, MYTHIC_AFFIXES[id]?.minLevel ?? 2);
  }

  private localPlayer(): Player | null {
    const p = G.world?.localPlayer ?? G.player;
    return p && !p.isDead && p.isLocal ? p : null;
  }

  private emit(msg: Msg): void {
    try { G.net?.broadcast('affix', msg); } catch (e) { warnOnce('broadcast', e); }
    this.handle(msg);
  }

  private later(delay: number, fn: () => void): void {
    this.pending.push({ at: (G.engine?.time ?? 0) + delay, fn });
  }

  private enemy(id: EntityId | undefined): Enemy | null {
    const e = id === undefined ? undefined : G.world?.get<Enemy>(id);
    return e && e.kind === 'enemy' ? e : null;
  }

  private whenEnemy(id: EntityId | undefined, fn: (e: Enemy) => void): void {
    if (id === undefined) return;
    const e = this.enemy(id);
    if (e) fn(e);
    else this.waiting.push({ id, fn, ttl: 10 });
  }

  private whenModel(e: Enemy, fn: () => void): void {
    if (e.model) fn();
    else this.polls.push({ test: () => !!e.model || e.removed, fn: () => { if (!e.removed) fn(); }, ttl: 10 });
  }

  /** Average max HP of living players (reference for shapes that may hit several players). */
  private partyMaxHp(): number {
    const ps = (G.world?.players ?? []).filter((p) => !p.isDead && p.maxHp > 0);
    if (!ps.length) return this.localPlayer()?.maxHp ?? 1000;
    return ps.reduce((a, p) => a + p.maxHp, 0) / ps.length;
  }

  /** Hurt the LOCAL player for pct of its own max HP (true damage, not avoidable by dodge/block). */
  private hurtLocal(pct: number, name: string, id: AffixId, opts: { dot?: boolean; amount?: number } = {}): void {
    const p = this.localPlayer();
    if (!p) return;
    const amount = opts.amount ?? pct * p.maxHp * this.scale(id);
    if (amount <= 0) return;
    try {
      G.combat.hitLocalPlayer({ sourceId: null, amount, type: 'true', unavoidable: true, isDot: !!opts.dot, abilityName: name, sourceLevel: 60 + (this.prm?.keyLevel ?? 0) });
    } catch (e) { warnOnce('hurtLocal', e); }
  }

  /* ================================================================================ per-frame */

  update(dt: number): void {
    if (!this.active) return;
    const now = G.engine?.time ?? 0;
    try { this.tickWaiting(dt); } catch (e) { warnOnce('waiting', e); }
    try { this.tickPending(now); } catch (e) { warnOnce('pending', e); }
    if (!G.world) return;
    this.scanT += dt;
    if (this.scanT >= 0.4) { this.scanT = 0; try { this.scanNewEnemies(); } catch (e) { warnOnce('scan', e); } }
    if (this.live) {
      if (this.host) { try { this.hostTick(dt, now); } catch (e) { warnOnce('hostTick', e); } }
      try { this.localTick(dt); } catch (e) { warnOnce('localTick', e); }
    }
    try { this.visualTick(dt, now); } catch (e) { warnOnce('visualTick', e); }
  }

  private tickWaiting(dt: number): void {
    if (this.waiting.length) {
      for (let i = this.waiting.length - 1; i >= 0; i--) {
        const w = this.waiting[i];
        const e = this.enemy(w.id);
        w.ttl -= dt;
        if (e) { this.waiting.splice(i, 1); try { w.fn(e); } catch (err) { warnOnce('whenEnemy', err); } }
        else if (w.ttl <= 0) this.waiting.splice(i, 1);
      }
    }
    if (this.polls.length) {
      for (let i = this.polls.length - 1; i >= 0; i--) {
        const p = this.polls[i];
        p.ttl -= dt;
        if (p.test()) { this.polls.splice(i, 1); try { p.fn(); } catch (err) { warnOnce('poll', err); } }
        else if (p.ttl <= 0) this.polls.splice(i, 1);
      }
    }
  }

  private tickPending(now: number): void {
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => p.at <= now);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => p.at > now);
    for (const p of due) { try { p.fn(); } catch (e) { warnOnce('pending-fn', e); } }
  }

  /* ================================================================================ HOST simulation */

  private partyInCombat(): boolean {
    const w = G.world!;
    for (const e of w.enemies) if (!e.isDead && e.aggroed && !isAffixUnit(e)) return true;
    for (const p of w.players) if (!p.isDead && p.combatTimer < 4) return true;
    return false;
  }

  private hostTick(dt: number, now: number): void {
    const inC = this.partyInCombat();
    this.inCombat = inC;
    if (inC) { this.combatClock += dt; this.lastCombatAt = now; }

    this.acc025 += dt;
    if (this.acc025 >= 0.25) { this.acc025 = 0; if (this.has('raging')) this.scanRaging(); }
    this.acc05 += dt;
    if (this.acc05 >= 0.5) {
      const step = this.acc05;
      this.acc05 = 0;
      if (this.has('inspiring')) this.tickInspiring();
      if (this.has('sanguine')) this.tickSanguineHeal(step);
    }

    if (inC) {
      if (this.has('volcanic') && this.combatClock >= this.nextVolcanic) {
        this.nextVolcanic = this.combatClock + P('volcanic').interval;
        this.doVolcanic();
      }
      if (this.has('quaking')) this.tickQuaking();
      if (this.has('explosive') && this.combatClock >= this.nextExplosive) {
        this.nextExplosive = this.combatClock + P('explosive').interval;
        this.spawnOrb();
      }
    }
    if (this.has('storming')) {
      if (inC || now - this.lastCombatAt < 15) this.stormClock += dt;
      if (this.stormClock >= this.nextStorm) {
        this.stormClock = 0;
        this.spawnTornado();
      }
    }
    if (this.orbs.size) this.tickOrbs(now);
    if (this.shades.size) this.tickShades(dt, now);
    if (this.has('seasonal_efsun')) this.tickRift(dt);
  }

  /* ---- raging ---- */
  private scanRaging(): void {
    const th = P('raging').hpBelow;
    for (const e of G.world!.enemies) {
      if (e.isDead || !isRegular(e) || e.statuses.has('raging') || e.maxHp <= 0) continue;
      if (e.hp / e.maxHp < th) this.makeRage(e);
    }
  }

  private makeRage(e: Enemy): void {
    e.statuses.apply('raging', 3600, { sourceId: null });
    e.statuses.addImmunity('cc', 3600);
    this.emit({ kind: 'rage', targetId: e.id });
  }

  /* ---- inspiring ---- */
  private computeInspirers(): Set<number> {
    const out = new Set<number>();
    const def = this.def;
    if (!def) return out;
    const p = P('inspiring');
    const every = Math.max(1, p.every | 0);
    const seed = (this.prm.seed >>> 0) % every;
    let eligible = 0;
    let idx = 0;
    for (const pack of def.packs) {
      const base = DUNGEON_ENEMY_ID_BASE + idx;
      idx += pack.members.length;
      if (pack.members.length < p.minPackSize) continue;
      if (eligible % every === seed) {
        let best = -1;
        let bestHp = -1;
        pack.members.forEach((m, i) => {
          const d = ENEMIES[m.enemyId];
          if (!d || d.role === 'swarm') return;
          if (d.hpMult > bestHp) { bestHp = d.hpMult; best = i; }
        });
        if (best >= 0) out.add(base + best);
      }
      eligible++;
    }
    return out;
  }

  private tickInspiring(): void {
    const w = G.world!;
    const r = P('inspiring').radius;
    for (const id of this.inspirers) {
      const src = w.get<Enemy>(id);
      if (!src || src.kind !== 'enemy' || src.isDead || src.removed) continue;
      for (const a of w.enemiesInRadius(src.position, r)) {
        if (a.isDead || !isRegular(a)) continue;
        a.statuses.apply('inspiring', 1.4, { sourceId: src.id });
      }
    }
  }

  /* ---- sanguine ---- */
  private inAnyPool(x: number, z: number, rad = 0): boolean {
    for (const p of this.pools) if (dist(x, z, p.x, p.z) <= p.r + rad) return true;
    return false;
  }

  private tickSanguineHeal(step: number): void {
    if (!this.pools.length) return;
    const pct = P('sanguine').healPctPerSec * step;
    for (const e of G.world!.enemies) {
      if (e.isDead || isAffixUnit(e) || e.hp >= e.maxHp) continue;
      if (this.inAnyPool(e.position.x, e.position.z, 0)) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * pct);
    }
  }

  /* ---- volcanic / quaking ---- */
  private doVolcanic(): void {
    const w = G.world!;
    const p = P('volcanic');
    const hostile = w.enemies.filter((e) => !e.isDead && e.aggroed && !isAffixUnit(e));
    if (!hostile.length) return;
    for (const pl of w.players) {
      if (pl.isDead) continue;
      let min = Infinity;
      for (const e of hostile) min = Math.min(min, dist(pl.position.x, pl.position.z, e.position.x, e.position.z));
      if (min < p.minDistance) continue;
      this.spawnPlume(pl.position.x, pl.position.z, pl.maxHp);
    }
  }

  /** One plume: HitShape (telegraph + damage on every peer's own player) + landing visuals. */
  spawnPlume(x: number, z: number, refMaxHp: number): void {
    const p = P('volcanic');
    const spec: Omit<HitShapeSpec, 'id'> = {
      sourceId: null, shape: { type: 'circle', radius: p.radius }, origin: vpos(x, z), dir: [0, 1], delay: p.delay,
      damage: p.dmgPct * refMaxHp * this.scale('volcanic'), type: 'true', statuses: [{ status: 'knockdown', duration: p.knockup }], knockback: 0,
      telegraph: true, kind: 'danger', abilityName: 'Volkanik Patlama',
    };
    try { G.hitShapes.spawn(spec); } catch (e) { warnOnce('plume-shape', e); }
    this.emit({ kind: 'volcanic', data: { x, z, delay: p.delay, r: p.radius } });
  }

  private tickQuaking(): void {
    const w = G.world!;
    const p = P('quaking');
    for (const pl of w.players) {
      if (!this.nextQuake.has(pl.slot)) this.nextQuake.set(pl.slot, this.combatClock + p.interval + p.slotOffset * pl.slot);
      const at = this.nextQuake.get(pl.slot)!;
      if (this.combatClock < at) continue;
      this.nextQuake.set(pl.slot, at + p.interval);
      if (pl.isDead) continue;
      this.spawnQuake(pl);
    }
  }

  spawnQuake(pl: Player): void {
    const p = P('quaking');
    const spec: Omit<HitShapeSpec, 'id'> = {
      sourceId: pl.id, shape: { type: 'circle', radius: p.radius }, origin: vpos(pl.position.x, pl.position.z), dir: [0, 1], delay: p.delay,
      damage: p.dmgPct * this.partyMaxHp() * this.scale('quaking'), type: 'true', telegraph: true, kind: 'danger', followSource: true, abilityName: 'Sarsıntı',
    };
    try { G.hitShapes.spawn(spec); } catch (e) { warnOnce('quake-shape', e); }
    this.emit({ kind: 'quake', targetId: pl.id, data: { r: p.radius, delay: p.delay } });
  }

  /* ---- explosive orb ---- */
  private spawnOrb(): void {
    const w = G.world!;
    const p = P('explosive');
    if (this.orbs.size >= p.maxOrbs) return;
    const cands = w.enemies.filter((e) => !e.isDead && e.aggroed && !isAffixUnit(e));
    if (!cands.length) return;
    const e = this.rng.pick(cands);
    const pt = w.nav.randomNear(e.position.x, e.position.z, p.spawnRadius, () => this.rng.next());
    void this.spawnOrbAt(pt.x, pt.z);
  }

  /** Spawn an explosive orb at a position (host). Resolves with the orb entity. */
  async spawnOrbAt(x: number, z: number): Promise<Enemy | null> {
    const p = P('explosive');
    const en = await this.spawnUnit(ORB_ID, { x, z }, { level: this.prm.enemyLevel });
    if (!en) return null;
    en.hp = 1; en.maxHp = 1;
    en.forcesCounted = true;
    try { en.ai?.dispose?.(); } catch { /* ignore */ }
    en.ai = null;
    this.orbs.set(en.id, { enemy: en, born: G.engine.time, cast: p.castTime });
    this.emit({ kind: 'orb', targetId: en.id, data: { x, z, cast: p.castTime } });
    return en;
  }

  private tickOrbs(now: number): void {
    for (const [id, o] of this.orbs) {
      if (o.enemy.isDead || o.enemy.removed) { this.orbs.delete(id); continue; }
      if (now - o.born >= o.cast) this.explodeOrb(o);
    }
  }

  private explodeOrb(o: OrbHost): void {
    const e = o.enemy;
    this.orbs.delete(e.id);
    this.emit({ kind: 'orb_boom', targetId: e.id, data: { x: e.position.x, z: e.position.z, pct: P('explosive').dmgPct } });
    try { G.world?.remove(e); } catch { /* ignore */ }
  }

  /* ---- tornado ---- */
  private spawnTornado(): void {
    const w = G.world!;
    const p = P('storming');
    const alive = w.players.filter((pl) => !pl.isDead);
    if (!alive.length) return;
    const pl = this.rng.pick(alive);
    let x = pl.position.x, z = pl.position.z;
    for (let i = 0; i < 8; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const tx = pl.position.x + Math.cos(a) * p.spawnDist, tz = pl.position.z + Math.sin(a) * p.spawnDist;
      if (w.nav.isWalkable(tx, tz)) { x = tx; z = tz; break; }
    }
    this.emit({ kind: 'tornado', data: { id: ++this.tornadoSeq, x, z, seed: Math.floor(this.rng.next() * 2 ** 31), life: p.lifetime, speed: p.speed } });
  }

  /* ---- spiteful shade ---- */
  private spawnShade(dead: Enemy): void {
    if (this.shades.size >= 12) return;
    const p = P('spiteful');
    const initial = Math.max(10, Math.round(dead.maxHp * p.hpPctOfDead));
    void this.spawnUnit(SHADE_ID, { x: dead.position.x, z: dead.position.z }, { level: this.prm.enemyLevel }).then((en) => {
      if (!en) return;
      en.maxHp = initial; en.hp = initial;
      en.forcesCounted = true;
      try { en.ai?.dispose?.(); } catch { /* ignore */ }
      en.ai = null;
      this.shades.set(en.id, { enemy: en, initial, targetId: null, nextAttack: G.engine.time + 0.9, moving: false });
    });
  }

  private pickShadeTarget(): Player | null {
    const alive = (G.world?.players ?? []).filter((p) => !p.isDead);
    if (!alive.length) return null;
    const nonTank = alive.filter((p) => p.classId !== 'knight');
    return this.rng.pick(nonTank.length ? nonTank : alive);
  }

  private tickShades(dt: number, now: number): void {
    const p = P('spiteful');
    for (const [id, s] of this.shades) {
      const e = s.enemy;
      if (e.isDead || e.removed) { this.shades.delete(id); continue; }
      e.hp -= s.initial * p.decayPctPerSec * dt;
      if (e.hp <= 0) { this.endShade(e); continue; }
      let t = s.targetId !== null ? G.world?.get<Player>(s.targetId) : undefined;
      if (!t || t.isDead) { t = this.pickShadeTarget() ?? undefined; s.targetId = t?.id ?? null; }
      if (!t) continue;
      const dx = t.position.x - e.position.x, dz = t.position.z - e.position.z;
      const d = Math.hypot(dx, dz);
      const moving = d > 1.5;
      if (moving) {
        const step = Math.min(d, p.speed * dt);
        e.position.x += (dx / d) * step; e.position.z += (dz / d) * step;
        e.yaw = Math.atan2(dx, dz);
        try { e.world?.nav.resolveCircle(e.position, e.radius); } catch { /* ignore */ }
        e.velocity.set((dx / d) * p.speed, 0, (dz / d) * p.speed);
      } else {
        e.velocity.set(0, 0, 0);
        if (d > 0.05) e.yaw = Math.atan2(dx, dz);
        if (now >= s.nextAttack) {
          s.nextAttack = now + p.attackCd;
          this.shadeStrike(e, t);
        }
      }
      if (moving !== s.moving) {
        s.moving = moving;
        try { e.anim?.setBase(moving ? 'Fast_Flying' : 'Flying_Idle'); } catch { /* ignore */ }
      }
    }
  }

  private shadeStrike(e: Enemy, target: Player): void {
    const p = P('spiteful');
    try { e.anim?.playOnce('Punch', { fade: 0.05 }); } catch { /* ignore */ }
    const spec: Omit<HitShapeSpec, 'id'> = {
      sourceId: e.id, shape: { type: 'circle', radius: 1.8 }, origin: vpos(e.position.x, e.position.z), dir: [Math.sin(e.yaw), Math.cos(e.yaw)], delay: 0.3,
      damage: p.hitDmgPct * target.maxHp * this.scale('spiteful'), type: 'true', telegraph: false, kind: 'danger', abilityName: 'Kin Dokunuşu',
    };
    try { G.hitShapes.spawn(spec); } catch (err) { warnOnce('shade-shape', err); }
  }

  private endShade(e: Enemy): void {
    this.shades.delete(e.id);
    this.emit({ kind: 'shade_end', targetId: e.id, data: { x: e.position.x, z: e.position.z } });
    try { G.world?.remove(e); } catch { /* ignore */ }
  }

  /* ================================================================================ host hooks (called by MythicPlus) */

  /** Any enemy died (host). `deathAffixes` = this death may trigger Güçlenen/Kan Dökücü/Patlayan/Kin Dolu (checked by MythicPlus). */
  onEnemyKilled(e: Enemy, deathAffixes: boolean): void {
    if (!this.active) return;
    const id = e.id;
    if (this.possessed.has(id)) {
      this.possessed.delete(id);
      this.emit({ kind: 'efsun_loot', data: { x: e.position.x, z: e.position.z } });
    }
    if (isAffixUnit(e)) { this.onUnitKilled(e); return; }
    if (!deathAffixes || !this.live || !isRegular(e)) return;
    if (this.has('bolstering')) this.bolster(e);
    if (this.has('sanguine')) this.emit({ kind: 'sanguine', data: { id: ++this.poolSeq, x: e.position.x, z: e.position.z, r: P('sanguine').radius, dur: P('sanguine').duration } });
    if (this.has('bursting')) this.emit({ kind: 'burst', data: { x: e.position.x, z: e.position.z } });
    if (this.has('spiteful')) this.spawnShade(e);
  }

  private onUnitKilled(e: Enemy): void {
    if (e.def.id === ORB_ID) {
      if (this.orbs.delete(e.id)) this.emit({ kind: 'orb_pop', targetId: e.id, data: { x: e.position.x, z: e.position.z } });
    } else if (e.def.id === SHADE_ID) {
      this.shades.delete(e.id);
    } else if (this.guardians.has(e.id)) {
      this.guardians.delete(e.id);
      if (this.rift?.guardian?.id === e.id) this.riftSuccess(this.rift);
    }
  }

  private bolster(dead: Enemy): void {
    const p = P('bolstering');
    for (const a of G.world!.enemiesInRadius(dead.position, p.radius)) {
      if (a === dead || a.isDead || !isRegular(a)) continue;
      if (a.statuses.stacks('bolstered') >= p.maxStacks) continue;
      a.statuses.apply('bolstered', 3600, { stacks: 1, sourceId: null });
      const n = Math.min(p.maxStacks, a.statuses.stacks('bolstered'));
      this.setHpMods(a, n, undefined);
      this.emit({ kind: 'bolster', targetId: a.id, data: { stacks: n } });
    }
  }

  /** Recompute max HP from bolster stacks (+20 % each) and the possessed bonus (+30 %); keeps the HP ratio gain. */
  private setHpMods(e: Enemy, stacks: number | undefined, efsun: boolean | undefined): void {
    let m = this.hpMods.get(e);
    if (!m) { m = { base: e.maxHp, stacks: 0, efsun: false }; this.hpMods.set(e, m); }
    if (stacks !== undefined) m.stacks = stacks;
    if (efsun !== undefined) m.efsun = efsun;
    const mult = (1 + P('bolstering').hpPct * m.stacks) * (m.efsun ? 1 + P('seasonal_efsun').possessHpPct : 1);
    const nm = Math.max(1, Math.round(m.base * mult));
    const delta = nm - e.maxHp;
    e.maxHp = nm;
    e.hp = clamp(e.hp + delta, 1, nm);
  }

  /** Forces crossed a threshold: open Efsun rifts (host). */
  onForces(prevFrac: number, frac: number): void {
    if (!this.has('seasonal_efsun') || !this.host) return;
    for (const t of EFSUN_THRESHOLDS) if (prevFrac < t && frac >= t) this.riftQueue.push(t);
  }

  /** Called on every peer for every spawned enemy (visual set-up of special units / designated inspirers). */
  onSpawned(e: Enemy): void {
    if (!this.active || this.seen.has(e)) return;
    this.seen.add(e);
    try {
      const id = e.def.id;
      if (id === ORB_ID) this.attachOrbMesh(e);
      else if (id === SHADE_ID) this.decorateShade(e);
      else if (id.startsWith('efsun_guardian')) this.guardians.add(e.id);
      if (this.inspirers.has(e.id)) this.attachInspirerFx(e);
    } catch (err) { warnOnce('onSpawned', err); }
  }

  /** Every peer: enemies the factory did not announce (clients) get their affix visuals from this slow scan. */
  private scanNewEnemies(): void {
    const list = G.world?.enemies;
    if (!list) return;
    for (const e of list) if (!this.seen.has(e) && !e.removed) this.onSpawned(e);
  }

  /** HOST: Necrotic adds a stack to melee hits (the HitShape applies it to the victim's own status list). */
  decorateHitShape<T extends { statuses?: HitShapeSpec['statuses']; shape: HitShapeSpec['shape']; abilityName?: string; projectile?: unknown; persist?: unknown }>(enemy: Enemy, spec: T): T {
    if (!this.has('necrotic') || !this.live || enemy.def.id.startsWith('affix_')) return spec;
    if (!this.isMeleeHit(enemy, spec)) return spec;
    const p = P('necrotic');
    return { ...spec, statuses: [...(spec.statuses ?? []), { status: 'necrotic', duration: p.duration, stacks: 1 }] };
  }

  private isMeleeHit(enemy: Enemy, spec: { shape: HitShapeSpec['shape']; abilityName?: string; projectile?: unknown; persist?: unknown }): boolean {
    if (spec.projectile || spec.persist) return false;
    const name = spec.abilityName;
    if (name) {
      const ab = [enemy.def.basicAttack, ...enemy.def.abilities].find((a) => a.name === name || a.id === name);
      if (ab) return ab.kind === 'melee';
    }
    const s = spec.shape;
    if (s.type === 'cone') return s.radius <= 4.5;
    if (s.type === 'circle') return s.radius <= 3.2;
    return false;
  }

  /** Orb: only direct hits may hurt it (DoTs and zone ticks do 0). Combat can ask before applying damage. */
  canDamage(e: Enemy, o: { dot?: boolean; tick?: boolean }): boolean {
    if (e.def.id === ORB_ID && (o.dot || o.tick)) return false;
    return true;
  }

  /** Efsun blessing id of an actor (combat uses it for burn-on-hit / chill-attackers). */
  blessingOf(actor: { statuses: { has(id: StatusId): boolean } }): EfsunType | null {
    for (const t of EFSUN_ORDER) if (actor.statuses.has(EFSUN_INFO[t].status)) return t;
    return null;
  }

  isPossessed(id: EntityId): boolean {
    return this.possessed.has(id);
  }

  /* ================================================================================ EVERY-peer: player-side effects */

  private localTick(dt: number): void {
    const p = this.localPlayer();
    if (!p) {
      this.grievousN = 0; this.grievousT = 0; this.grievousShown = 0;
      return;
    }
    if (this.has('grievous')) {
      const g = P('grievous');
      if (p.hpFrac < g.hpBelow) {
        this.grievousT += dt;
        if (this.grievousT >= g.stackInterval) { this.grievousT = 0; this.grievousN = Math.min(g.maxStacks, this.grievousN + 1); }
      } else {
        this.grievousT = 0;
        if (this.grievousN > 0) { this.grievousN = 0; p.statuses.remove('grievous'); this.grievousShown = 0; }
      }
      if (this.grievousN > 0 && this.grievousN !== this.grievousShown) {
        this.grievousShown = this.grievousN;
        p.statuses.apply('grievous', 3600, { magnitude: this.grievousN, sourceId: null });
      }
    }
    this.accLocal += dt;
    while (this.accLocal >= 0.5) {
      this.accLocal -= 0.5;
      this.dotTick(p, 0.5);
    }
  }

  /** Bursting, Necrotic, Grievous and Sanguine ticks merged into ONE periodic hit (clean numbers, one hurt event). */
  private dotTick(p: Player, step: number): void {
    let total = 0;
    let label = '';
    let best = 0;
    const add = (pct: number, id: AffixId, name: string) => {
      const a = pct * p.maxHp * step * this.scale(id);
      total += a;
      if (a > best) { best = a; label = name; }
    };
    if (this.has('bursting')) {
      const b = P('bursting');
      const st = p.statuses.get('bursting');
      if (st) { if (st.stacks > b.maxStacks) st.stacks = b.maxStacks; add(b.dmgPctPerStackPerSec * st.stacks, 'bursting', 'Patlayan'); }
    }
    if (this.has('necrotic')) {
      const n = P('necrotic');
      const st = p.statuses.get('necrotic');
      if (st) { if (st.stacks > n.maxStacks) st.stacks = n.maxStacks; add(n.dotPctPerStack * st.stacks, 'necrotic', 'Nekrotik'); }
    }
    if (this.has('grievous') && this.grievousN > 0) add(P('grievous').dotPctPerStack * this.grievousN, 'grievous', 'Ağır Yara');
    if (this.has('sanguine') && this.inAnyPool(p.position.x, p.position.z, p.radius * 0.5)) add(P('sanguine').playerDmgPctPerSec, 'sanguine', 'Kan Dökücü');
    if (total >= 1) this.hurtLocal(0, label, 'bursting', { dot: true, amount: total });
  }

  /* ================================================================================ visual tick (every peer) */

  private visualTick(dt: number, now: number): void {
    // pools
    if (this.pools.length) {
      for (let i = this.pools.length - 1; i >= 0; i--) {
        if (this.pools[i].until <= now) { this.pools[i].vfx?.stop(); this.pools.splice(i, 1); }
      }
    }
    // tornadoes (identical wander on every peer from the shared seed)
    for (let i = this.tornadoes.length - 1; i >= 0; i--) {
      const t = this.tornadoes[i];
      const target = Math.min(now - t.t0, t.life);
      let guard = 0;
      while (t.simT + 1 / 30 <= target && guard++ < 90) this.stepTornado(t, 1 / 30);
      try { t.vfx?.setPosition?.(t.x, 0, t.z); } catch { /* ignore */ }
      if (this.live) this.tornadoContact(t);
      if (now - t.t0 >= t.life) { t.vfx?.stop(); this.tornadoes.splice(i, 1); }
    }
    // orbs: pulsing mesh + cast bar bookkeeping
    for (const v of this.orbViews.values()) {
      const prog = clamp((now - v.t0) / v.cast, 0, 1);
      if (!v.castStarted) {
        const e = this.enemy(v.id);
        if (e) {
          v.castStarted = true;
          try { G.events.emit('enemy:castStart', { enemyId: v.id, abilityId: 'affix_orb', name: 'Patlama', castTime: v.cast, interruptible: false }); } catch { /* ignore */ }
        }
      }
      if (v.mesh) {
        const pulse = 1 + Math.sin(now * (6 + prog * 18)) * (0.06 + prog * 0.14);
        v.mesh.scale.setScalar((0.9 + prog * 0.6) * pulse);
        v.mesh.rotation.y += dt * (1.5 + prog * 6);
        const inner = v.mesh.children[0] as THREE.Mesh | undefined;
        const mat = inner?.material as THREE.MeshBasicMaterial | undefined;
        if (mat) mat.color.setHex(prog > 0.75 && Math.floor(now * 8) % 2 === 0 ? 0xffffff : 0xff8a30);
      }
    }
    // rift visuals
    for (const v of this.riftViews.values()) {
      v.t += dt;
      v.group.rotation.y += dt * 0.8;
      const ring = v.group.children[0];
      if (ring) ring.rotation.z += dt * 1.6;
      v.group.position.y = 1.5 + Math.sin(v.t * 2) * 0.12;
    }
  }

  private stepTornado(t: Tornado, step: number): void {
    t.simT += step;
    t.turnT -= step;
    if (t.turnT <= 0) { t.heading += t.rng.range(-1.1, 1.1); t.turnT = t.rng.range(0.8, 1.8); }
    const nx = t.x + Math.cos(t.heading) * t.speed * step;
    const nz = t.z + Math.sin(t.heading) * t.speed * step;
    if (G.world?.nav.isWalkable(nx, nz) !== false) { t.x = nx; t.z = nz; }
    else t.heading += Math.PI + t.rng.range(-0.6, 0.6);
  }

  private tornadoContact(t: Tornado): void {
    if (t.hit) return;
    const p = this.localPlayer();
    if (!p || p.statuses.invulnerable) return;
    if (dist(p.position.x, p.position.z, t.x, t.z) > t.r + p.radius) return;
    t.hit = true;
    const kn = P('storming').knockup;
    this.hurtLocal(P('storming').dmgPct, 'Fırtına Hortumu', 'storming');
    try { p.statuses.apply('knockdown', kn, { sourceId: null }); } catch { /* ignore */ }
    const dx = p.position.x - t.x, dz = p.position.z - t.z;
    p.applyKnockback(dx || 1, dz, 3.5, 0.4);
    G.events.emit('camera:shake', { intensity: 0.4, duration: 0.35 });
  }

  /* ================================================================================ network / event messages */

  /** Handle an affix message (own broadcasts are applied through here too). Untrusted data is clamped. */
  handle(m: Msg): void {
    if (!this.active || !m || typeof m.kind !== 'string') return;
    try {
      const d = m.data ?? {};
      switch (m.kind) {
        case 'bolster': return this.hBolster(m.targetId, num(d.stacks, 1));
        case 'rage': return this.hRage(m.targetId);
        case 'sanguine': return this.hSanguine(num(d.id), num(d.x), num(d.z), clamp(num(d.r, 4), 1, 12), clamp(num(d.dur, 20), 1, 60));
        case 'burst': return this.hBurst(num(d.x), num(d.z));
        case 'orb': return this.hOrb(m.targetId, num(d.x), num(d.z), clamp(num(d.cast, 6), 1, 30));
        case 'orb_boom': return this.hOrbBoom(m.targetId, num(d.x), num(d.z), clamp(num(d.pct, 0.35), 0, 1));
        case 'orb_pop': return this.hOrbPop(m.targetId, num(d.x), num(d.z));
        case 'shade_end': return this.hShadeEnd(m.targetId, num(d.x), num(d.z));
        case 'tornado': return this.hTornado(num(d.id), num(d.x), num(d.z), num(d.seed, 1), clamp(num(d.life, 12), 1, 60), clamp(num(d.speed, 3.5), 0.5, 10));
        case 'volcanic': return this.hVolcanic(num(d.x), num(d.z), clamp(num(d.delay, 1.5), 0, 10), clamp(num(d.r, 2), 0.5, 10));
        case 'quake': return this.hQuake(m.targetId, clamp(num(d.r, 5), 1, 20), clamp(num(d.delay, 2.5), 0, 10));
        case 'rift': return this.hRift(num(d.n), num(d.x), num(d.z), num(d.type, 0), clamp(num(d.delay, 3), 0, 10));
        case 'rift_close': return this.hRiftClose(num(d.n), num(d.ok, 0) > 0);
        case 'guardian': return this.hGuardian(m.targetId, num(d.type, 0));
        case 'guardian_dive': return this.hGuardianDive(m.targetId, num(d.x), num(d.z), num(d.px), num(d.pz));
        case 'blessing': return this.hBlessing(num(d.type, 0), clamp(num(d.dur, 60), 1, 600));
        case 'efsunlu': return this.hEfsunlu(Array.isArray(m.ids) ? m.ids.filter((n) => Number.isFinite(n)).slice(0, 64) : []);
        case 'efsun_loot': return this.hEfsunLoot(num(d.x), num(d.z));
        default: return;
      }
    } catch (e) { warnOnce('handle:' + m.kind, e); }
  }

  private hBolster(id: EntityId | undefined, stacks: number): void {
    this.whenEnemy(id, (e) => {
      const k = 1 + P('bolstering').scalePerStack * stacks;
      if (typeof e.setVisualScale === 'function') e.setVisualScale(k);
      else e.visualScale = k;
      G.vfx.spawn('bolster_burst', e.position, { scale: 0.7 + stacks * 0.06 });
    });
  }

  private hRage(id: EntityId | undefined): void {
    this.whenEnemy(id, (e) => {
      this.whenModel(e, () => applyTint(e.model, 0xff4040, 0.5, 0.25));
      G.vfx.spawn('enrage_aura', e.position, { follow: e.object3d, duration: 3600 });
    });
  }

  private hSanguine(id: number, x: number, z: number, r: number, dur: number): void {
    if (this.pools.length > 40) { const old = this.pools.shift(); old?.vfx?.stop(); }
    const vfx = G.vfx.spawn('sanguine_pool', vpos(x, z), { scale: r / 2.4, duration: dur }) ?? null;
    this.pools.push({ id, x, z, r, until: G.engine.time + dur, vfx });
  }

  private hBurst(x: number, z: number): void {
    G.vfx.spawn('bursting_pop', vpos(x, z));
    const p = this.localPlayer();
    if (!p || !this.live) return;
    const b = P('bursting');
    const st = p.statuses.get('bursting');
    if (st && st.stacks >= b.maxStacks) st.remaining = st.duration;
    else p.statuses.apply('bursting', b.duration, { stacks: 1, sourceId: null });
  }

  private hOrb(id: EntityId | undefined, x: number, z: number, cast: number): void {
    if (id === undefined) return;
    this.orbViews.set(id, { id, t0: G.engine.time, cast, x, z, mesh: this.orbViews.get(id)?.mesh ?? null, castStarted: false });
    G.vfx.spawn('add_spawn', vpos(x, z, 0.5), { scale: 0.7, color: 0xff8a30 });
    this.whenEnemy(id, (e) => this.attachOrbMesh(e));
  }

  private hOrbBoom(id: EntityId | undefined, x: number, z: number, pct: number): void {
    G.vfx.spawn('explosive_orb_pop', vpos(x, z), { scale: 1 });
    this.endOrbView(id);
    const p = this.localPlayer();
    if (p && this.live) {
      this.hurtLocal(pct, 'Patlayıcı Küre', 'explosive');
      G.events.emit('camera:shake', { intensity: 0.7, duration: 0.5 });
    } else G.events.emit('camera:shake', { intensity: 0.3, duration: 0.3 });
    G.audio.play('explosion', { pos: vpos(x, z, 1) });
    if (!this.host && id !== undefined) { try { G.world?.remove(id); } catch { /* ignore */ } }
  }

  private hOrbPop(id: EntityId | undefined, x: number, z: number): void {
    G.vfx.spawn('explosive_orb_pop', vpos(x, z), { scale: 0.4 });
    this.endOrbView(id);
  }

  private endOrbView(id: EntityId | undefined): void {
    if (id === undefined) return;
    const v = this.orbViews.get(id);
    if (v) {
      disposeGroup(v.mesh);
      this.orbViews.delete(id);
      try { G.events.emit('enemy:castEnd', { enemyId: id, abilityId: 'affix_orb', interrupted: false }); } catch { /* ignore */ }
    }
  }

  private hShadeEnd(id: EntityId | undefined, x: number, z: number): void {
    G.vfx.spawn('death_poof', vpos(x, z, 1), { color: 0xa890ff, scale: 0.8 });
    if (!this.host && id !== undefined) { try { G.world?.remove(id); } catch { /* ignore */ } }
  }

  private hTornado(id: number, x: number, z: number, seed: number, life: number, speed: number): void {
    if (this.tornadoes.length > 6) { const old = this.tornadoes.shift(); old?.vfx?.stop(); }
    const rng = new RNG(seed);
    const vfx = G.vfx.spawn('storm_tornado', vpos(x, z), { scale: 0.8, duration: life }) ?? null;
    this.tornadoes.push({ id, x, z, heading: rng.range(0, Math.PI * 2), speed, r: 1.6, t0: G.engine.time, life, simT: 0, rng, turnT: 1, hit: false, vfx });
    toast(MPLUS_TR.stormWarn, 'warning');
  }

  private hVolcanic(x: number, z: number, delay: number, r: number): void {
    this.later(delay, () => {
      G.vfx.spawn('volcanic_plume', vpos(x, z), { scale: r * 0.3 });
      const p = G.world?.localPlayer;
      if (p && dist(p.position.x, p.position.z, x, z) < 12) G.events.emit('camera:shake', { intensity: 0.3, duration: 0.3 });
    });
  }

  private hQuake(id: EntityId | undefined, r: number, delay: number): void {
    this.later(delay, () => {
      const src = id !== undefined ? G.world?.get(id) : undefined;
      if (!src) return;
      G.vfx.spawn('quaking_ring', src.position, { scale: r / 5 });
      const lp = G.world?.localPlayer;
      if (lp && !lp.isDead && dist(lp.position.x, lp.position.z, src.position.x, src.position.z) <= r + lp.radius) {
        try { G.skills.interrupt(lp, true); } catch { /* ignore */ }
        G.events.emit('camera:shake', { intensity: 0.5, duration: 0.4 });
      }
    });
  }

  /* ---- seasonal: rift + guardian + blessing + possession ---- */

  private hRift(n: number, x: number, z: number, typeIdx: number, delay: number): void {
    const type = EFSUN_ORDER[clamp(typeIdx | 0, 0, 2)];
    const info = EFSUN_INFO[type];
    if (this.riftViews.has(n)) return;
    const group = new THREE.Group();
    const col = new THREE.Color(info.color);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 8, 28), new THREE.MeshBasicMaterial({ color: col }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    group.add(ring, disc);
    group.position.set(x, 1.5, z);
    G.world?.scene.add(group);
    const vfx = G.vfx.spawn('portal_swirl', vpos(x, z, 1.4), { color: info.color, duration: 70, scale: 1 }) ?? null;
    this.riftViews.set(n, { number: n, type, x, z, group, vfx, t: 0 });
    toast(MPLUS_TR.riftOpen, 'boss');
    try { G.events.emit('ui:zoneName', { title: MPLUS_TR.riftOpen, subtitle: `${info.name} Yarığı · Muhafız ${delay.toFixed(0)} sn içinde çıkıyor` }); } catch { /* ignore */ }
    G.audio.play('boss_cast', { pos: vpos(x, z, 1) });
    G.events.emit('camera:shake', { intensity: 0.25, duration: 0.4 });
  }

  private hRiftClose(n: number, ok: boolean): void {
    const v = this.riftViews.get(n);
    if (!v) return;
    this.riftViews.delete(n);
    G.vfx.spawn(ok ? 'upgrade_success' : 'shadow_burst', vpos(v.x, v.z, 1), { color: EFSUN_INFO[v.type].color });
    this.disposeRiftView(v);
  }

  private disposeRiftView(v: RiftView): void {
    v.vfx?.stop();
    v.group.removeFromParent();
    v.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
  }

  private hGuardian(id: EntityId | undefined, typeIdx: number): void {
    const info = EFSUN_INFO[EFSUN_ORDER[clamp(typeIdx | 0, 0, 2)]];
    if (id !== undefined) this.guardians.add(id);
    this.whenEnemy(id, (e) => {
      G.vfx.spawn('boss_spawn', e.position, { color: info.color, scale: 0.9 });
      G.events.emit('camera:shake', { intensity: 0.35, duration: 0.4 });
    });
  }

  private hGuardianDive(id: EntityId | undefined, x: number, z: number, px: number, pz: number): void {
    G.vfx.spawn('portal_swirl', vpos(x, z, 1), { color: 0xb060ff, duration: 1.6 });
    G.vfx.spawn('portal_swirl', vpos(px, pz, 1), { color: 0xb060ff, duration: 1.6, scale: 1.2 });
    const steps = 6;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      this.later(t * 0.5, () => G.vfx.spawn('shadow_burst', vpos(x + (px - x) * t, z + (pz - z) * t, 1), { color: 0xb060ff, scale: 0.5 }));
    }
    if (!this.host && id !== undefined) { try { G.world?.remove(id); } catch { /* ignore */ } }
  }

  private hBlessing(typeIdx: number, dur: number): void {
    const type = EFSUN_ORDER[clamp(typeIdx | 0, 0, 2)];
    const info = EFSUN_INFO[type];
    toast(MPLUS_TR.riftWin(info.blessing), 'success');
    const p = this.localPlayer();
    if (!p) return;
    for (const t of EFSUN_ORDER) if (t !== type) p.statuses.remove(EFSUN_INFO[t].status);
    p.statuses.apply(info.status, dur, { sourceId: null });
    this.blessing = type;
    G.vfx.spawn('upgrade_success', p.position, { color: info.color, follow: p.object3d });
    G.audio.play('upgrade_success');
    this.later(dur, () => { if (this.blessing === type) this.blessing = null; });
  }

  private hEfsunlu(ids: number[]): void {
    toast(MPLUS_TR.riftFail, 'boss');
    for (const id of ids) {
      this.possessed.add(id);
      this.whenEnemy(id, (e) => {
        this.whenModel(e, () => applyTint(e.model, 0xb060ff, 0.35, 0.45));
        this.auras.get(id)?.stop();
        const h = G.vfx.spawn('buff_aura', e.position, { color: 0xb060ff, follow: e.object3d, duration: 3600 });
        if (h) this.auras.set(id, h);
      });
    }
  }

  private hEfsunLoot(x: number, z: number): void {
    const p = this.localPlayer();
    if (!p || !G.loot || !G.world) return;
    if (dist(p.position.x, p.position.z, x, z) > 60) return;
    try {
      const key = this.prm?.keyLevel ?? 0;
      const item = G.loot.rollItem({ itemLevel: Math.min(75, 60 + key), classId: G.character?.classId, rarityBonus: 1.5 });
      G.loot.dropItem(item, new THREE.Vector3(x, 0.5, z));
    } catch (e) { warnOnce('efsun-loot', e); }
  }

  /* ================================================================================ rift host logic */

  private riftSpots(): Vec2[] {
    const def = this.def as (DungeonDef & { extras?: { riftSpots?: [number, number][] } }) | undefined;
    const ex = def?.extras?.riftSpots;
    if (ex && ex.length) return ex.map(([tx, tz]) => ({ x: (tx + 0.5) * TILE_SIZE, z: (tz + 0.5) * TILE_SIZE }));
    if (def?.rooms?.length) {
      return def.rooms.slice(0, 12).map((r) => ({ x: (r.rect.x + r.rect.w / 2) * TILE_SIZE, z: (r.rect.z + r.rect.h / 2) * TILE_SIZE }));
    }
    // no dungeon data (dev pages): scatter on a ring around the origin
    return Array.from({ length: 6 }, (_, i) => ({ x: Math.cos((i / 6) * Math.PI * 2) * 22, z: Math.sin((i / 6) * Math.PI * 2) * 22 }));
  }

  private inBossArena(x: number, z: number): boolean {
    const def = this.def;
    if (!def) return false;
    for (const b of def.bosses) {
      const room = def.rooms.find((r) => r.id === b.roomId);
      if (!room) continue;
      const r = room.rect;
      if (x >= r.x * TILE_SIZE && x < (r.x + r.w) * TILE_SIZE && z >= r.z * TILE_SIZE && z < (r.z + r.h) * TILE_SIZE) return true;
    }
    return false;
  }

  /** Spot nearest to the party centroid that is far enough away, outside boss arenas and unused. */
  private pickRiftSpot(): { spot: Vec2; index: number } | null {
    const w = G.world!;
    const alive = w.players.filter((p) => !p.isDead);
    const cx = alive.length ? alive.reduce((a, p) => a + p.position.x, 0) / alive.length : 0;
    const cz = alive.length ? alive.reduce((a, p) => a + p.position.z, 0) / alive.length : 0;
    const spots = this.riftSpots();
    const min = P('seasonal_efsun').minDistance;
    for (const minDist of [min, min * 0.5, 0]) {
      let best = -1;
      let bd = Infinity;
      spots.forEach((s, i) => {
        if (this.riftSpotsUsed.has(i) || this.inBossArena(s.x, s.z)) return;
        const d = dist(s.x, s.z, cx, cz);
        if (d >= minDist && d < bd) { bd = d; best = i; }
      });
      if (best >= 0) return { spot: spots[best], index: best };
    }
    return null;
  }

  private tickRift(dt: number): void {
    if (!this.rift) {
      if (this.riftQueue.length) { this.riftQueue.shift(); this.openRift(); }
      return;
    }
    const r = this.rift;
    const p = P('seasonal_efsun');
    r.t += dt;
    if (r.phase === 'opening' && r.t >= p.spawnDelay) {
      r.phase = 'guardian';
      r.t = 0;
      this.spawnGuardian(r);
    } else if (r.phase === 'guardian' && !r.spawning && r.t >= p.killWindow) {
      this.riftFail(r);
    }
  }

  /** Open the next rift now (host). Also used by the dev page. */
  openRift(): boolean {
    const pick = this.pickRiftSpot();
    if (!pick) return false;
    this.riftSpotsUsed.add(pick.index);
    const dIdx = Math.max(0, DUNGEON_IDS.indexOf(this.prm.dungeonId));
    const type = EFSUN_ORDER[(this.riftNumber + dIdx) % 3];
    const n = this.riftNumber++;
    this.rift = { number: n, type, x: pick.spot.x, z: pick.spot.z, phase: 'opening', t: 0, guardian: null, spawning: false };
    this.emit({ kind: 'rift', data: { n, x: pick.spot.x, z: pick.spot.z, type: TYPE_INDEX[type], delay: P('seasonal_efsun').spawnDelay } });
    return true;
  }

  private spawnGuardian(r: HostRift): void {
    r.spawning = true;
    const info = EFSUN_INFO[r.type];
    void this.spawnUnit(info.unit, { x: r.x, z: r.z }, { level: this.prm.enemyLevel, aggro: true }).then((en) => {
      r.spawning = false;
      if (!en || this.rift !== r) { if (this.rift === r) this.closeRift(r, false); return; }
      const L = this.prm.keyLevel;
      // GDD 5.5.4: HP 15 x TRASH_HP x M+ HP curve x partyHp (no Tahkimli factor); damage x M+ damage curve
      const hpMult = en.def.hpMult > 0 ? en.def.hpMult : P('seasonal_efsun').guardianHp;
      const hp = Math.round(hpMult * monsterHP(en.level) * mplusHp(L) * partyHpFactor(this.prm.partySize, true));
      en.maxHp = hp; en.hp = hp;
      // GDD 5.5.4: dmgMult 2.0, 0 forces, CC immune, rooted for its first 3 s
      en.baseDamage = monsterDmg(en.level) * Math.max(P('seasonal_efsun').guardianDmg ?? 2, en.def.dmgMult) * mplusDmg(L);
      en.forcesCounted = true;
      try { en.statuses.addImmunity('cc', 3600); } catch { /* ignore */ }
      try { en.statuses.apply('act_root', P('seasonal_efsun').rootSec); } catch { /* ignore */ }
      r.guardian = en;
      r.t = 0;
      this.guardians.add(en.id);
      this.emit({ kind: 'guardian', targetId: en.id, data: { n: r.number, type: TYPE_INDEX[r.type] } });
    });
  }

  private riftSuccess(r: HostRift): void {
    this.emit({ kind: 'blessing', data: { type: TYPE_INDEX[r.type], dur: P('seasonal_efsun').buffDuration } });
    this.closeRift(r, true);
  }

  private riftFail(r: HostRift): void {
    const g = r.guardian;
    const pos = g ? { x: g.position.x, z: g.position.z } : { x: r.x, z: r.z };
    const pack = this.nearestPack(pos);
    if (g) {
      this.guardians.delete(g.id);
      this.emit({ kind: 'guardian_dive', targetId: g.id, data: { x: pos.x, z: pos.z, px: pack?.cx ?? pos.x, pz: pack?.cz ?? pos.z } });
      try { G.world?.remove(g); } catch { /* ignore */ }
    }
    if (pack) {
      for (const e of pack.members) {
        this.possessed.add(e.id);
        e.statuses.apply('efsunlu', 3600, { sourceId: null });
        this.setHpMods(e, undefined, true);
      }
      this.emit({ kind: 'efsunlu', ids: pack.members.map((e) => e.id) });
    }
    this.closeRift(r, false);
  }

  private closeRift(r: HostRift, ok: boolean): void {
    this.emit({ kind: 'rift_close', data: { n: r.number, ok: ok ? 1 : 0 } });
    if (this.rift === r) this.rift = null;
  }

  /** Nearest pack (by centroid of living members) that is not already possessed. */
  private nearestPack(from: Vec2): { members: Enemy[]; cx: number; cz: number } | null {
    const groups = new Map<string, Enemy[]>();
    for (const e of G.world!.enemies) {
      if (e.isDead || !e.packId || !isRegular(e) || this.possessed.has(e.id)) continue;
      const g = groups.get(e.packId);
      if (g) g.push(e); else groups.set(e.packId, [e]);
    }
    let best: { members: Enemy[]; cx: number; cz: number } | null = null;
    let bd = Infinity;
    for (const members of groups.values()) {
      const cx = members.reduce((a, e) => a + e.position.x, 0) / members.length;
      const cz = members.reduce((a, e) => a + e.position.z, 0) / members.length;
      const d = dist(cx, cz, from.x, from.z);
      if (d < bd) { bd = d; best = { members, cx, cz }; }
    }
    return best;
  }

  /* ================================================================================ special-unit visuals */

  private attachOrbMesh(e: Enemy): void {
    const view = this.orbViews.get(e.id);
    if (view?.mesh) return;
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), new THREE.MeshBasicMaterial({ color: 0xff8a30 }));
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 0), new THREE.MeshBasicMaterial({ color: 0xffd080, wireframe: true, transparent: true, opacity: 0.8 }));
    group.add(core, shell);
    // the enemy entity itself floats at def.hoverHeight (Enemy.update), so the mesh sits at its origin
    group.position.y = 0.05;
    e.object3d.add(group);
    if (view) view.mesh = group;
    else this.orbViews.set(e.id, { id: e.id, t0: G.engine.time, cast: 6, x: e.position.x, z: e.position.z, mesh: group, castStarted: false });
    G.vfx.spawn('explosive_orb', e.position, { follow: e.object3d, duration: 8 });
  }

  private decorateShade(e: Enemy): void {
    this.whenModel(e, () => { setOpacity(e.model, 0.6); applyTint(e.model, 0x200010, 0.55, 0.1); });
    G.vfx.spawn('spiteful_shade', e.position, { follow: e.object3d, duration: 14 });
  }

  private attachInspirerFx(e: Enemy): void {
    if (this.inspirerFx.has(e.id)) return;
    const h = G.vfx.spawn('inspiring_aura', e.position, { follow: e.object3d, duration: 3600, scale: 1 });
    if (h) this.inspirerFx.set(e.id, h);
  }

  /**
   * Efsun blessings that need a combat hook (feedback event, local player only; statuses go through the public Combat API so the
   * host stays authoritative): Kor = the local player's hits set the enemy ablaze, Ayaz = enemies that hurt the local player get chilled.
   */
  private onDamageEvent(d: { targetId: EntityId; sourceId: EntityId | null; amount: number; kind: string }): void {
    if (!this.live || d.amount <= 0 || d.sourceId === null) return;
    const lp = G.world?.localPlayer;
    if (!lp || lp.isDead || !lp.isLocal) return;
    const b = this.blessingOf(lp);
    if (!b || b === 'golge') return;
    const now = G.engine?.time ?? 0;
    try {
      if (b === 'kor' && d.sourceId === lp.id && d.kind !== 'dot' && d.kind !== 'player_hurt') {
        const e = this.enemy(d.targetId);
        if (!e || e.isDead || isAffixUnit(e) || now < (this.burnAt.get(e.id) ?? 0)) return;
        this.burnAt.set(e.id, now + 0.7);
        G.combat.applyEnemyStatuses(lp, e, [{ status: 'burn', duration: 3, dps: Math.max(1, (d.amount * 0.4) / 3) }]);
      } else if (b === 'ayaz' && d.targetId === lp.id) {
        const e = this.enemy(d.sourceId);
        if (!e || e.isDead || isAffixUnit(e) || now < (this.chillAt.get(e.id) ?? 0)) return;
        this.chillAt.set(e.id, now + 1.2);
        G.combat.applyEnemyStatuses(lp, e, [{ status: 'chill', duration: 3 }]);
      }
    } catch (err) { warnOnce('blessing-hook', err); }
  }

  private onDeathEvent(id: EntityId): void {
    const h = this.inspirerFx.get(id);
    if (h) { h.stop(); this.inspirerFx.delete(id); }
    const a = this.auras.get(id);
    if (a) { a.stop(); this.auras.delete(id); }
    if (this.orbViews.has(id) && !this.orbs.has(id)) this.endOrbView(id);
  }

  /* ================================================================================ unit spawning */

  private async spawnUnit(defId: string, pos: Vec2, opts: { level: number; facing?: number; aggro?: boolean }): Promise<Enemy | null> {
    try {
      if (this.spawner) return await this.spawner(defId, pos, opts);
      const w = G.world;
      if (!w) return null;
      const mod = await import('../entities/EnemyFactory');
      return await mod.spawnEnemy(w, defId, pos, { level: opts.level, scaled: false, aggro: opts.aggro, facing: opts.facing });
    } catch (e) {
      warnOnce('spawnUnit:' + defId, e);
      return null;
    }
  }

  /* ================================================================================ dev / preview */

  /** Trigger the visual of an affix at a spot without any gameplay side effects (dev page). */
  preview(kind: AffixId | 'orb' | 'orb_boom' | 'shade' | 'rift', x: number, z: number): void {
    if (!this.active) return;
    const at = vpos(x, z);
    switch (kind) {
      case 'bolstering': G.vfx.spawn('bolster_burst', at, { scale: 1.2 }); break;
      case 'raging': G.vfx.spawn('enrage_aura', at, { duration: 4 }); break;
      case 'sanguine': this.hSanguine(++this.poolSeq, x, z, P('sanguine').radius, 8); break;
      case 'bursting': G.vfx.spawn('bursting_pop', at); break;
      case 'inspiring': G.vfx.spawn('inspiring_aura', at, { duration: 4 }); break;
      case 'volcanic': G.vfx.telegraph({ type: 'circle', radius: P('volcanic').radius }, at, [0, 1], P('volcanic').delay, 'danger'); this.hVolcanic(x, z, P('volcanic').delay, P('volcanic').radius); break;
      case 'quaking': G.vfx.telegraph({ type: 'circle', radius: P('quaking').radius }, at, [0, 1], 1.2, 'danger'); this.later(1.2, () => G.vfx.spawn('quaking_ring', at, { scale: 1 })); break;
      case 'explosive': case 'orb_boom': G.vfx.spawn('explosive_orb_pop', at, { scale: 1 }); break;
      case 'orb': G.vfx.spawn('explosive_orb', vpos(x, z, 0.5), { duration: 4 }); break;
      case 'necrotic': G.vfx.spawn('necrotic_hit', vpos(x, z, 1)); break;
      case 'spiteful': case 'shade': G.vfx.spawn('spiteful_shade', vpos(x, z, 0.4), { duration: 4 }); break;
      case 'storming': this.hTornado(++this.tornadoSeq, x, z, (Math.random() * 2 ** 31) | 0, 8, 3.5); break;
      case 'grievous': G.vfx.spawn('hit_blood', vpos(x, z, 1)); break;
      case 'seasonal_efsun': case 'rift': this.hRift(900 + (this.riftViews.size % 3), x, z, this.riftViews.size % 3, 3); break;
      case 'fortified': case 'tyrannical': G.vfx.spawn('boss_enrage', at, { scale: 0.8 }); break;
    }
  }

  /** Dev: fire an affix mechanic right now on the host (bypasses the combat clocks). Returns false when it cannot run. */
  debugTrigger(kind: 'volcanic' | 'quaking' | 'orb' | 'tornado' | 'rift' | 'shade' | 'bolster' | 'rage' | 'burst' | 'sanguine', target?: Enemy): boolean {
    if (!this.active || !G.world) return false;
    const lp = G.world.localPlayer;
    switch (kind) {
      case 'volcanic': if (!lp) return false; this.spawnPlume(lp.position.x, lp.position.z, lp.maxHp); return true;
      case 'quaking': if (!lp) return false; this.spawnQuake(lp); return true;
      case 'orb': { if (!lp) return false; const a = this.rng.range(0, Math.PI * 2); void this.spawnOrbAt(lp.position.x + Math.cos(a) * 5, lp.position.z + Math.sin(a) * 5); return true; }
      case 'tornado': this.spawnTornado(); return true;
      case 'rift': return this.openRift();
      case 'shade': if (!target) return false; this.spawnShade(target); return true;
      case 'bolster': if (!target) return false; this.bolster(target); return true;
      case 'rage': if (!target) return false; this.makeRage(target); return true;
      case 'burst': if (!lp) return false; this.emit({ kind: 'burst', data: { x: lp.position.x, z: lp.position.z } }); return true;
      case 'sanguine': if (!lp) return false; this.emit({ kind: 'sanguine', data: { id: ++this.poolSeq, x: lp.position.x + 3, z: lp.position.z, r: P('sanguine').radius, dur: P('sanguine').duration } }); return true;
    }
    return false;
  }

  /** Counters for the dev overlay. */
  debugInfo(): Record<string, number | string> {
    return {
      pools: this.pools.length, tornadoes: this.tornadoes.length, orbs: this.orbs.size, shades: this.shades.size,
      inspirers: this.inspirers.size, possessed: this.possessed.size, rift: this.rift ? `${this.rift.type}:${this.rift.phase}:${this.rift.t.toFixed(0)}s` : '-',
      riftQueue: this.riftQueue.length, combatClock: +this.combatClock.toFixed(1), grievous: this.grievousN, blessing: this.blessing ?? '-',
    };
  }
}
