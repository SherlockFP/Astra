/**
 * AE-4 (docs/kits/agile-evoker.md §4): Ejderhasoy kit behaviours, installed into BEHAVIORS by the import at the end of behaviors.ts
 * (microtask fallback, as in warlockKit.ts). Ids carry the `kit_` prefix so SkillSystem.makeCtx resolves the soft target.
 *
 * behaviour id          used by (evoker skill ids)                                   reads (SkillDef / params)
 * --------------------  ----------------------------------------------------------  -----------------------------------------------------
 * kit_empower           evoker_fire_breath, _eternity_surge, _dream_breath,           channel 2 on a HELD key; params.kind 1..4, hold1..3
 *                       _upheaval                                                     (rank thresholds, divided by haste), per-kind rank tables
 * kit_living_flame      evoker_living_flame (Yıkım, Yüceltme), _unbound_flame         target_projectile; leaping_flames = extra bolts
 * kit_essence_beam      evoker_disintegrate                                           channel on one target, params.tick, damage.coef = whole channel
 * kit_aoe_strike        evoker_pyre, _eruption                                        target + enemies within def.radius; falloff, maxTargets, extendEbon
 * kit_dragonrage        evoker_dragonrage                                             impact in def.radius, Öz regen x2 task, unbound_flame after
 * kit_flight            evoker_deep_breath, _breath_of_eons                           straight flight def.range, params.pathCoef, landing, wound
 * kit_heal              evoker_reversion, _living_flame (Koruyucu patch)              def.heal, params.hotCoef hotDur absorbPct bounce echoable
 * kit_echo              evoker_echo                                                   params.dur echoes twinEchoes
 * kit_blossom           evoker_emerald_blossom                                        def.heal, def.radius, params.maxTargets
 * kit_verdant           evoker_verdant_embrace                                        def.heal, params.speed lifebindDur lifebindPct
 * kit_time_dilation     evoker_time_dilation                                          params.dur
 * kit_stasis(_release)  evoker_stasis, evoker_stasis_release                          params.store gap
 * kit_ebon_might        evoker_ebon_might                                             params.dur count allyMag selfMag
 * kit_prescience        evoker_prescience                                             params.dur max
 *
 * Mechanics the engine does not have, realised here with caster-side tables (module state keyed by the Evoker's entity id, so they work
 * for remote allies whose statuses live on another machine):
 *  - Empowered hold: the existing non-fixed channel machinery (SkillSystem.updateAction). The key is held; every frame the behaviour
 *    measures the hold, ranks 1..3 light up at hold1..3 / haste (empower_charge vfx + sfx), a release before rank 1 refunds the mana and sets
 *    ctx.data.noCooldown (no cooldown), holding to rank 3 ends the channel from `tick`, tip_scales fires rank 3 instantly, an interrupt fires nothing.
 *  - Yankı: `echo` entries per ally (count, expiry); the next direct heal on that ally repeats at 70 % after 0.5 s.
 *  - Yaşam Bağı: one bound ally; every heal on someone else also heals the bound ally for 60 %.
 *  - Durgunluk: while `stasis` is up the next 3 heal casts (kit_heal, Rüya Nefesi, Zümrüt Çiçek) are stored with their target and replayed free by
 *    Durgunluk Salımı.
 *  - Abanoz Kudret / Öngörü: the buff goes to the two best damage dealers of the last 20 s (a rolling log of the 'damage' event; a duo or a solo
 *    buffs whoever is there). Çağların Nefesi: banks 15 % of the damage the Abanoz Kudret holders deal to wounded enemies and detonates it when the wound ends.
 */
import { G } from '../../game/G';
import { clamp } from '../../core/utils';
import { TALENT_PIPS } from '../../data/specs_talents';
import { vfxScale } from '../feel';
import { HEAL_RANGE, addAbsorb, alliesInRange, healAmount, healFormula, resolveHealTarget } from '../healing';
import { specSpecial } from '../specs';
import { BEHAVIORS, at, castTarget, clearSight, dist2, enemiesIn, groundAt, muzzle, strikeMany, type Behavior, type CastCtx } from './behaviors';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { DamageResult } from '../Combat';
import type { PipDef } from '../../types/classes';
import type { AimInfo, SkillDef, StatusId } from '../../types/skills';
import type { VfxId } from '../../types/vfx';

export const BEHAVIORS_KIT_EVOKER: Record<string, Behavior> = {};

// ---- Öz pip (agile-evoker §4.0): max 5, +1 per 3.5 s (SkillSystem.regenPips divides the timer by haste), no decay. Shown for every evoker spec.
const ESSENCE_PIP: PipDef = { id: 'essence', name: 'Öz', max: 5, color: '#7fe3c4', icon: 'skill-fire-breath', regen: { every: 3.5 } };
if (!TALENT_PIPS.essence) Object.assign(TALENT_PIPS, { essence: ESSENCE_PIP });

const BOLT_Y = 1.35;

// ---------------------------------------------------------------------------------------------------------
// caster-side state
// ---------------------------------------------------------------------------------------------------------

/** One heal cast kept by Durgunluk. */
interface StoredHeal { kind: 'heal' | 'dream' | 'blossom'; def: SkillDef; aim: AimInfo; point: [number, number]; more: number; allyId: number | null; rank: number }

interface EvokerState {
  /** Yankı: ally id -> remaining echoes and expiry (sys clock). */
  echo: Map<number, { n: number; until: number }>;
  /** Yaşam Bağı: the bound ally. */
  lifebind: { id: number; until: number } | null;
  /** Öngörü holders, oldest first. */
  presc: { id: number; until: number }[];
  /** Abanoz Kudret holders (ally id -> expiry), the Evoker included. */
  ebon: Map<number, number>;
  stasis: StoredHeal[];
}

const STATE = new Map<number, EvokerState>();

function evState(p: Actor): EvokerState {
  let s = STATE.get(p.id);
  if (!s) { s = { echo: new Map(), lifebind: null, presc: [], ebon: new Map(), stasis: [] }; STATE.set(p.id, s); }
  return s;
}

/** Sim / scene hook: forget every caster-side table. */
export function resetEvokerKit(): void {
  STATE.clear();
  WOUNDS.clear();
  dmgLog.length = 0;
}

/** Sim hook: the Durgunluk store of a caster. */
export function stasisStored(p: Actor): number {
  return STATE.get(p.id)?.stasis.length ?? 0;
}

const now = (): number => G.skills?.now ?? 0;

// ---- rolling damage log (Abanoz Kudret / Öngörü targets) and the Zamansal Yara bank -----------------------------------
const DMG_WINDOW = 20;
const dmgLog: { src: number; amt: number; t: number }[] = [];
/** Enemy id -> wound (caster, banked damage, expiry). */
const WOUNDS = new Map<number, { caster: number; bank: number; until: number }>();
let boundBus: unknown = null;

function ensureTracker(): void {
  const bus = G.events;
  if (!bus || boundBus === bus) return;
  boundBus = bus;
  bus.on('damage', (e) => {
    const amt = e.amount ?? 0;
    if (amt <= 0 || e.sourceId === null || e.sourceId === undefined) return;
    const t = now();
    dmgLog.push({ src: e.sourceId, amt, t });
    while (dmgLog.length && t - dmgLog[0].t > 30) dmgLog.shift();
    const w = WOUNDS.get(e.targetId);
    if (w && w.until > t && e.skillId !== 'evoker_breath_of_eons') {
      const ebon = STATE.get(w.caster)?.ebon.get(e.sourceId);
      if (ebon !== undefined && ebon > t) w.bank += amt * 0.15;
    }
  });
}

/** The `count` best damage dealers (last 20 s) among the allies within `range`, never the caster. */
function topDamageAllies(caster: Player, range: number, count: number): Player[] {
  const t = now();
  const score = (a: Player): number => dmgLog.reduce((s, d) => (d.src === a.id && t - d.t <= DMG_WINDOW ? s + d.amt : s), 0);
  return alliesInRange(caster, range).filter((a) => a !== caster && !a.isDead)
    .sort((a, b) => score(b) - score(a) || a.id - b.id).slice(0, count);
}

// ---------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------

const hpFrac = (a: Actor): number => a.hp / Math.max(1, a.maxHp);
const facing = (c: CastCtx): [number, number] => [Math.sin(c.caster.yaw), Math.cos(c.caster.yaw)];

function playerOf(id: number | null | undefined): Player | null {
  if (id === null || id === undefined) return null;
  const p = G.world?.get<Player>(id);
  return p && p.kind === 'player' && !p.isDead && !p.removed ? p : null;
}

const inReach = (c: CastCtx, a: Player | null, range: number): Player | null =>
  a && dist2(a.position, c.caster.position) <= range + a.radius ? a : null;

/** Gives a status to an ally; a remote player gets the 'pstatus' message its owner applies (same path as behaviors_paladin giveStatus). */
function giveStatus(c: CastCtx, target: Actor, status: StatusId, duration: number, magnitude = 0): void {
  if (c.remote) return;
  if (target.kind === 'player' && !(target as Player).isLocal) {
    const peer = G.net?.peerOfEntity(target.id);
    if (peer) G.net?.sendTo(peer, 'pstatus', { targetId: target.id, status, duration, magnitude, sourceId: c.caster.id });
    return;
  }
  target.statuses.apply(status, duration, { magnitude, sourceId: c.caster.id });
}

/** The aimed / soft enemy within `range` (edge distance) and in sight. */
function enemyInReach(c: CastCtx, range: number): Enemy | null {
  const t = castTarget(c);
  if (!t || t.team !== 'enemy' || t.isDead) return null;
  if (dist2(t.position, c.caster.position) - t.radius > range) return null;
  return clearSight(c.caster, t) ? (t as Enemy) : null;
}

/** Ally of a heal / buff cast: the aimed one (party frame), else the smart pick. `notSelf` prefers somebody else (Öngörü, Yeşil Kucaklayış). */
function pickAlly(c: CastCtx, range: number, notSelf = false): Player | null {
  const explicit = inReach(c, playerOf(c.aim.allyId), range);
  if (explicit && !(notSelf && explicit === c.caster)) return explicit;
  let a = inReach(c, resolveHealTarget(c.caster, c.aim, false), range);
  if (a && notSelf && a === c.caster) a = null;
  if (!a && notSelf) {
    let best: Player | null = null;
    for (const o of alliesInRange(c.caster, range)) if (o !== c.caster && (!best || hpFrac(o) < hpFrac(best))) best = o;
    a = best;
  }
  return a;
}

function beamTo(c: CastCtx, to: Actor, id: VfxId): void {
  const dx = to.position.x - c.caster.position.x, dz = to.position.z - c.caster.position.z;
  const d = Math.hypot(dx, dz) || 1;
  c.sys.vfx(id, at(c.caster, 1.3), { dir: [dx / d, 0, dz / d], scale: clamp(d / 6, 0.7, 2.5) });
}

/** Trait `trait_preservation` (Taşan Şifa): the share of a heal's overheal that turns into a short absorb on the ally. */
function wardOverheal(c: CastCtx, ally: Player, over: number): void {
  if (c.remote || over <= 0) return;
  const share = specSpecial(c.caster, 'trait_preservation')?.overhealWard ?? 0;
  if (share <= 0) return;
  const cap = ally.maxHp * 0.15;
  const amount = Math.min(cap, over * share);
  if (amount < 1) return;
  if (ally.isLocal) addAbsorb(ally, amount, cap, 10, 'overheal_ward', c.caster.id);
  else giveStatus(c, ally, 'shield', 10, amount);
}

/** Yaşam Bağı: a heal on someone else also heals the bound ally for 60 % of `amount`. */
function lifebindHeal(c: CastCtx, ally: Player, amount: number): void {
  const lb = evState(c.caster).lifebind;
  if (!lb || lb.until < now() || lb.id === ally.id) return;
  const bound = playerOf(lb.id);
  if (!bound) return;
  healAmount(c.caster, bound, amount * 0.6);
  c.sys.vfx('heal_burst', at(bound, bound.height * 0.5), { scale: 0.5 });
}

/** One direct heal: the ally, the overheal ward and the Yaşam Bağı share. Echoes are triggered once per cast by echoTrigger. */
function healOne(c: CastCtx, ally: Player, amount: number): void {
  if (amount <= 0) return;
  wardOverheal(c, ally, healAmount(c.caster, ally, amount));
  lifebindHeal(c, ally, amount);
  c.sys.vfx('heal_burst', at(ally, ally.height * 0.6), { scale: 0.8 });
}

/** Yankı: the next heal cast on an ally repeats `base` at 70 % after 0.5 s. */
function echoTrigger(c: CastCtx, ally: Player, base: number): void {
  if (c.remote || base <= 0) return;
  const st = evState(c.caster);
  const e = st.echo.get(ally.id);
  if (!e || e.n <= 0 || e.until < now()) return;
  e.n--;
  if (e.n <= 0) {
    st.echo.delete(ally.id);
    if (ally.isLocal) ally.statuses.remove('echo');
  } else giveStatus(c, ally, 'echo', Math.max(0.5, e.until - now()), e.n);
  c.sys.schedule(0.5, () => {
    if (ally.isDead) return;
    healOne(c, ally, base * 0.7);
    c.sys.vfx('shape_echo', at(ally, ally.height * 0.5), { scale: 0.7 });
  });
}

/** Durgunluk: stores a heal cast (max 3) while the status is up; replays never store. */
function recordStasis(c: CastCtx, rec: Pick<StoredHeal, 'kind' | 'allyId' | 'rank'>): void {
  if (c.remote || c.data.replay || !c.caster.statuses.has('stasis')) return;
  const st = evState(c.caster);
  if (st.stasis.length >= 3) return;
  st.stasis.push({ ...rec, def: c.def, aim: c.aim, point: c.point, more: c.more });
}

/** Direct essence_burst grant (the PRD triggers are spec fx rows; this is for behaviour-driven grants). */
const grantBurst = (c: CastCtx, n = 1): void => {
  if (!c.remote) c.caster.statuses.apply('essence_burst', 15, { stacks: n, sourceId: c.caster.id });
};

// ---------------------------------------------------------------------------------------------------------
// kit_empower: Ateş Nefesi / Ebedi Dalga / Rüya Nefesi / Yer Sarsıntısı
// ---------------------------------------------------------------------------------------------------------

const HOLD_DEFAULT = [0.67, 1.33, 2.0];

/** Hold threshold of rank i (seconds, divided by haste). */
function holdAt(c: CastCtx, i: number): number {
  return (c.def.params?.[`hold${i}`] ?? HOLD_DEFAULT[i - 1]) / c.sys.speedFactor(c.caster, c.def);
}

/** Highest rank (0..3) reached after `held` seconds of hold. */
function rankAt(c: CastCtx, held: number): number {
  return held >= holdAt(c, 3) - 1e-6 ? 3 : held >= holdAt(c, 2) - 1e-6 ? 2 : held >= holdAt(c, 1) - 1e-6 ? 1 : 0;
}

/** Rank feedback: a ring pops above the hands (one more lit per rank) with a rising tone. */
function rankFx(c: CastCtx, rank: number): void {
  c.sys.vfx('empower_charge', at(c.caster, 1.55), { follow: c.caster.object3d, duration: 0.9, scale: 0.55 + 0.22 * rank });
  c.sys.sfx('empower_charge', c.caster.position, { pitch: 0.85 + 0.17 * rank, volume: 0.7 });
}

/** Targets of Ebedi Dalga: the aimed target first, then the closest to it. */
function surgeTargets(c: CastCtx, n: number): Enemy[] {
  const range = c.def.range ?? 25;
  const primary = (c.target && !c.target.isDead && c.target.team === 'enemy' ? c.target : null) as Enemy | null;
  const pool = enemiesIn(c.caster.position.x, c.caster.position.z, range + 1, c.caster.position.y).filter((e) => !e.isDead);
  const ref = primary ?? pool.slice().sort((a, b) => dist2(a.position, c.caster.position) - dist2(b.position, c.caster.position))[0];
  if (!ref) return [];
  const rest = pool.filter((e) => e !== ref).sort((a, b) => dist2(a.position, ref.position) - dist2(b.position, ref.position));
  return [ref, ...rest].slice(0, n);
}

function releaseFireBreath(c: CastCtx, rank: number): void {
  const { caster, sys, def } = c;
  const p = def.params ?? {};
  const range = p[`range${rank}`] ?? 14, arc = p[`arc${rank}`] ?? 50, mult = p[`mult${rank}`] ?? 1, burn = p[`burn${rank}`] ?? 14;
  const dir = facing(c);
  const res: DamageResult[] = [];
  for (const e of sys.enemiesInCone(caster, dir, range, arc)) {
    const r = sys.strike(c, e, {
      more: mult, noGain: true, noHitstop: true, dir: sys.dirTo(caster, e), weight: rank >= 3 ? 'heavy' : 'light',
      statuses: [{ status: 'fire_breath_burn', duration: burn, magnitude: p.burnMag ?? 1.3333 }],
    });
    if (r) res.push(r);
  }
  if (res.length) sys.afterHits(c, res);
  sys.vfx('dragon_breath_cone', muzzle(c, dir, 0.9, 1.3), { dir: [dir[0], 0, dir[1]], scale: range / 14, color: 0xff7a30 });
  sys.shake(0.1 + 0.06 * rank);
  grantBurst(c, 1);
  caster.statuses.apply('leaping_flames', 20, { stacks: rank, sourceId: caster.id });
}

function releaseSurge(c: CastCtx, rank: number): void {
  const { caster, sys, def } = c;
  const p = def.params ?? {};
  const list = surgeTargets(c, Math.round(p[`targets${rank}`] ?? 1));
  const res: DamageResult[] = [];
  for (const e of list) {
    const d = sys.dirTo(caster, e);
    const r = sys.strike(c, e, { noGain: true, noHitstop: true, dir: d, weight: 'light' });
    if (r) res.push(r);
    sys.vfx('dragon_breath_cone', muzzle(c, d, 0.9, 1.3), { dir: [d[0], 0, d[1]], scale: Math.max(0.6, dist2(e.position, caster.position) / 14), color: 0x4aa8ff });
    sys.vfx(def.vfx?.impact ?? 'frost_burst', at(e, e.height * 0.5), { scale: 0.8 });
  }
  if (res.length) sys.afterHits(c, res);
  sys.sfx('ice_chime', caster.position);
  caster.statuses.apply('iridescence', 10, { stacks: 2, sourceId: caster.id });
}

function releaseDreamBreath(c: CastCtx, rank: number): void {
  const { caster, sys, def } = c;
  const p = def.params ?? {};
  const range = p[`range${rank}`] ?? 12;
  const dir = facing(c);
  const cosHalf = Math.cos((((def.arc ?? 60) / 2) * Math.PI) / 180);
  const list = alliesInRange(caster, range).filter((a) => {
    if (a.isDead || a.removed) return false;
    if (a === caster) return true;
    const dx = a.position.x - caster.position.x, dz = a.position.z - caster.position.z;
    const d = Math.hypot(dx, dz);
    return d < 0.5 || (dx * dir[0] + dz * dir[1]) / d >= cosHalf;
  }).sort((a, b) => hpFrac(a) - hpFrac(b) || a.id - b.id).slice(0, Math.round(p.maxTargets ?? 6));
  const dur = p[`hot${rank}`] ?? 4;
  const perSec = p.hotCoefPerSec ?? 0.25;
  sys.vfx('dragon_breath_cone', muzzle(c, dir, 0.9, 1.3), { dir: [dir[0], 0, dir[1]], scale: range / 14, color: 0x4fd19a });
  for (const a of list) {
    const direct = healFormula(caster, (def.heal?.coef ?? 0.8) * c.more).amount;
    healOne(c, a, direct);
    const perSecAmount = healFormula(caster, perSec * c.more).amount;
    giveStatus(c, a, 'dream_breath', dur, perSecAmount);
    if (p.echoable) echoTrigger(c, a, direct + 0.85 * perSecAmount * dur);
  }
  if (rank >= (p.blessRank ?? 2) && Math.random() < (p.blessChance ?? 0.25)) caster.statuses.apply('merithras_blessing', 30, { sourceId: caster.id });
  recordStasis(c, { kind: 'dream', allyId: null, rank });
  sys.sfx('heal_big', caster.position, { pitch: 1.1 });
}

function releaseUpheaval(c: CastCtx, rank: number): void {
  const { sys, def, caster } = c;
  const p = def.params ?? {};
  const [px, pz] = sys.liveGroundPoint(c);
  const radius = (p[`radius${rank}`] ?? 5) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
  sys.ring(px, pz, radius, 0xc9a24a);
  sys.vfx(def.vfx?.ground ?? 'quaking_ring', [px, 0.05, pz], { scale: vfxScale(def.vfx?.ground ?? 'quaking_ring', radius) });
  sys.vfx(def.vfx?.impact ?? 'ground_slam', [px, 0.1, pz], { scale: vfxScale(def.vfx?.impact ?? 'ground_slam', radius * 0.8) });
  sys.sfx('ground_slam', [px, 0, pz]);
  sys.shake(0.15 + 0.08 * rank);
  strikeMany(c, enemiesIn(px, pz, radius, groundAt(px, pz)), Math.round(p.maxTargets ?? 20), { noGain: true });
}

function releaseEmpower(c: CastCtx, rank: number): void {
  switch (Math.round(c.def.params?.kind ?? 1)) {
    case 2: releaseSurge(c, rank); break;
    case 3: releaseDreamBreath(c, rank); break;
    case 4: releaseUpheaval(c, rank); break;
    default: releaseFireBreath(c, rank);
  }
}

const empower: Behavior = {
  begin(c) {
    if (c.remote) return true;
    c.data.rank = 0;
    c.data.el = 0;
    if (Math.round(c.def.params?.kind ?? 1) === 2) {
      // Ebedi Dalga needs an enemy to aim at
      const t = enemyInReach(c, c.def.range ?? 25);
      if (!t) { c.sys.fail('target'); return false; }
      c.target = t;
    }
    return true;
  },
  frame(c, _dt, el) {
    c.data.el = el;
    if (c.data.instant) return;
    if (!c.remote && c.data.fired && !c.caster.statuses.has('hover')) c.sys.actSlow(c.caster, 0.8, 0.15);
    const r = rankAt(c, el);
    if (r > (c.data.rank ?? 0)) { c.data.rank = r; if (c.data.fired) rankFx(c, r); }
  },
  fire(c) {
    const { caster, sys } = c;
    c.data.fired = true;
    if (!c.remote) {
      caster.statuses.apply('empowering', 3, { sourceId: caster.id });
      // Terazi Eğimi: no hold, rank 3 at once
      if (caster.statuses.has('tip_scales')) {
        caster.statuses.remove('tip_scales');
        c.data.instant = true;
        c.data.rank = 3;
      }
    }
    sys.vfx('empower_charge', at(caster, 1.55), { follow: caster.object3d, duration: 1.4, scale: 0.6 });
    sys.sfx('empower_charge', caster.position, { pitch: 0.8, volume: 0.6 });
    if (c.data.instant) rankFx(c, 3);
  },
  tick(c) {
    if (c.data.instant) return false;
    if (c.remote) return true;
    // holding to rank 3 releases by itself
    return rankAt(c, c.data.el ?? 0) < 3;
  },
  end(c, reason) {
    const { caster, sys, def } = c;
    if (!c.remote) caster.statuses.remove('empowering');
    if (reason !== 'done') return; // interrupt / stun / cancel fire nothing
    const rank = c.data.instant ? 3 : rankAt(c, c.data.el ?? 0);
    sys.playClip(caster, 'Spellcast_Shoot', { speed: 1.5, fade: 0.05 });
    if (c.remote) {
      const dir = facing(c);
      sys.vfx('dragon_breath_cone', muzzle(c, dir, 0.9, 1.3), { dir: [dir[0], 0, dir[1]], scale: 1 + 0.2 * Math.max(1, rank) });
      return;
    }
    if (rank < 1) {
      // released before rank 1: no effect, the mana comes back and the skill keeps no cooldown
      sys.addResource(caster, def.cost * sys.costMult(caster, def));
      c.data.noCooldown = true;
      return;
    }
    releaseEmpower(c, rank);
  },
};

// ---------------------------------------------------------------------------------------------------------
// kit_living_flame: Yaşayan Alev (damage form) and Serbest Alev
// ---------------------------------------------------------------------------------------------------------

const livingFlame: Behavior = {
  fire(c) {
    const { caster, sys } = c;
    const t = castTarget(c);
    const d = t ? sys.dirTo(caster, t) : c.dir;
    sys.fireProjectile(c, d, BOLT_Y, t);
    if (c.def.vfx?.cast) sys.vfx(c.def.vfx.cast, muzzle(c, d, 0.9, BOLT_Y), { dir: [d[0], 0, d[1]], scale: 0.6 });
    if (c.remote) return;
    // Sıçrayan Alevler: one extra bolt per stack, each at another enemy near the target
    const stacks = caster.statuses.stacks('leaping_flames');
    if (stacks > 0) {
      const centre = (t ?? caster).position;
      const others = enemiesIn(centre.x, centre.z, 14, caster.position.y)
        .filter((e) => !e.isDead && e !== t)
        .sort((a, b) => dist2(a.position, centre) - dist2(b.position, centre)).slice(0, stacks);
      for (const e of others) sys.fireProjectile(c, sys.dirTo(caster, e), BOLT_Y, e);
      caster.statuses.remove('leaping_flames');
    }
  },
};

// ---------------------------------------------------------------------------------------------------------
// kit_essence_beam: Parçala
// ---------------------------------------------------------------------------------------------------------

/** The beam's target: the aimed / soft enemy in range, else the nearest enemy along the aim line. */
function beamTarget(c: CastCtx, range: number): Enemy | null {
  const hard = enemyInReach(c, range);
  if (hard) return hard;
  if (c.remote) return null;
  const line = G.world?.actorsInLine({ x: c.caster.position.x, z: c.caster.position.z }, { x: c.dir[0], z: c.dir[1] }, range, c.def.radius ?? 1.2, (a) => a.team === 'enemy' && !a.isDead, c.caster.position.y) ?? [];
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of line as unknown as Enemy[]) {
    const d = dist2(e.position, c.caster.position);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

const essenceBeam: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const t = beamTarget(c, c.def.range ?? 25);
    if (!t) { c.sys.fail('target'); return false; }
    c.target = t;
    // damage.coef is the whole channel: split it over the ticks this cast will really make (haste shortens the tick interval)
    const every = (c.def.params?.tick ?? 0.6) / c.sys.speedFactor(c.caster, c.def);
    const ticks = Math.floor((c.def.channel ?? 2.4) / every + 1e-6) + 1;
    c.data.tickCoef = (c.def.damage?.coef ?? 2.9) / ticks;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    sys.vfx(def.vfx?.cast ?? 'essence_beam', at(caster, 1.25), { follow: caster.object3d, duration: def.channel ?? 2.4, scale: 1 });
    if (c.target) sys.vfx(def.vfx?.cast ?? 'essence_beam', at(c.target, c.target.height * 0.5), { duration: def.channel ?? 2.4, scale: 0.8 });
  },
  tick(c) {
    if (c.remote) return true;
    const { caster, sys, def } = c;
    const every = (def.params?.tick ?? 0.6) / sys.speedFactor(caster, def);
    if (!caster.statuses.has('hover')) sys.actSlow(caster, def.params?.moveSlow ?? 0.5, every + 0.1);
    const t = c.target as Enemy | null;
    if (!t || t.isDead || t.removed || dist2(t.position, caster.position) - t.radius > (def.range ?? 25) + 2 || !clearSight(caster, t)) return false;
    const r = sys.strike(c, t, { tick: true, noGain: true, noHitstop: true, coef: c.data.tickCoef, dir: sys.dirTo(caster, t) });
    if (r) sys.vfx('arcane_burst', at(t, t.height * 0.55), { scale: 0.35 });
    return true;
  },
};

// ---------------------------------------------------------------------------------------------------------
// kit_aoe_strike: Pyre / Püskürme
// ---------------------------------------------------------------------------------------------------------

/** Abanoz Kudret (caster + holders) gets `sec` more seconds, at most 30 s remaining. */
function extendEbon(c: CastCtx, sec: number): void {
  const st = evState(c.caster);
  const t = now();
  const own = c.caster.statuses.get('ebon_might');
  if (own) c.caster.statuses.apply('ebon_might', Math.min(30, own.remaining + sec), { magnitude: own.magnitude, sourceId: c.caster.id });
  for (const [id, until] of st.ebon) {
    if (id === c.caster.id || until <= t) continue;
    const a = playerOf(id);
    if (!a) continue;
    const left = Math.min(30, until - t + sec);
    st.ebon.set(id, t + left);
    giveStatus(c, a, 'ebon_might', left, c.def.params?.allyMag ?? 0.11);
  }
}

const aoeStrike: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const t = enemyInReach(c, c.def.range ?? 25);
    if (!t) { c.sys.fail('range'); return false; }
    c.target = t;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const t = (c.target && !c.target.isDead ? c.target : castTarget(c)) as Enemy | null;
    const cx = t ? t.position.x : c.point[0], cz = t ? t.position.z : c.point[1];
    const radius = (def.radius ?? 8) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    sys.vfx(def.vfx?.cast ?? 'fire_burst', [cx, 0.8, cz], { scale: vfxScale(def.vfx?.cast ?? 'fire_burst', radius * 0.6) });
    sys.ring(cx, cz, radius, 0xff7a30);
    if (def.vfx?.ground) sys.vfx(def.vfx.ground, [cx, 0.05, cz], { scale: vfxScale(def.vfx.ground, radius), duration: 1.5 });
    sys.shake(0.12);
    if (c.remote) return;
    const pool = enemiesIn(cx, cz, radius, t ? t.position.y : groundAt(cx, cz)).filter((e) => !e.isDead)
      .sort((a, b) => (a === t ? -1 : b === t ? 1 : dist2(a.position, { x: cx, z: cz }) - dist2(b.position, { x: cx, z: cz })));
    const res: DamageResult[] = [];
    let i = 0;
    for (const e of pool) {
      if (i >= (p.maxTargets ?? 99)) break;
      const r = sys.strike(c, e, { more: i === 0 ? 1 : (p.falloff ?? 1), noGain: true, dir: sys.dirTo(caster, e), noHitstop: i > 0 });
      if (r) res.push(r);
      i++;
    }
    if (res.length) sys.afterHits(c, res);
    else sys.whiff(c);
    if ((p.extendEbon ?? 0) > 0) extendEbon(c, p.extendEbon);
  },
};

// ---------------------------------------------------------------------------------------------------------
// kit_dragonrage: Ejder Öfkesi
// ---------------------------------------------------------------------------------------------------------

const dragonrage: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    sys.vfx(def.vfx?.cast ?? 'wings_gold', at(caster, 1.1), { follow: caster.object3d, duration: 2, scale: 1.2, color: 0xff5a30 });
    sys.vfx(def.vfx?.impact ?? 'enrage_aura', at(caster, 0.1), { scale: 1.2 });
    sys.sfx('boss_roar', caster.position, { volume: 0.8 });
    sys.shake(0.2);
    if (c.remote) return;
    const p = def.params ?? {};
    sys.applySelf(c, def.selfStatuses ?? []);
    grantBurst(c, 1);
    const radius = (def.radius ?? 8) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    sys.ring(caster.position.x, caster.position.z, radius, 0xff5a30);
    strikeMany(c, enemiesIn(caster.position.x, caster.position.z, radius, caster.position.y), 99, { noGain: true });
    // Öz regen x2 while the window is up: one more pip per 3.5 s / haste
    let acc = 0;
    sys.addTask((dt) => {
      if (caster.isDead || !caster.statuses.has('dragonrage')) return true;
      acc += dt * (1 + Math.max(0, sys.softStat(caster, 'castSpeed')));
      while (acc >= 3.5) { acc -= 3.5; sys.addPip(caster, 'essence', 1); }
      return false;
    });
    // after the window: 4 free Serbest Alev
    sys.schedule(p.dur ?? 18, () => {
      if (!caster.isDead) caster.statuses.apply('unbound_flame', p.unboundDur ?? 15, { stacks: p.unbound ?? 4, sourceId: caster.id });
    });
  },
};

// ---------------------------------------------------------------------------------------------------------
// kit_flight: Derin Nefes / Çağların Nefesi
// ---------------------------------------------------------------------------------------------------------

/** Detonates the banked Zamansal Yara damage of `e` when the wound ends. */
function detonateWound(c: CastCtx, e: Enemy): void {
  const w = WOUNDS.get(e.id);
  WOUNDS.delete(e.id);
  if (!w || e.isDead || e.removed || w.bank < 1) return;
  const pos: [number, number, number] = [e.position.x, e.position.y + e.height * 0.5, e.position.z];
  G.combat.applyDamageToEnemy(e, w.bank, false, 'fire', c.caster.id, undefined, 'evoker_breath_of_eons', 0, undefined, { skillId: 'evoker_breath_of_eons', weight: 'tick', tick: true, noReact: true, pos });
  c.sys.vfx('fire_burst', pos, { scale: 1.1 });
  c.sys.vfx('temporal_wound', pos, { scale: 0.9 });
}

const flight: Behavior = {
  begin(c) {
    if (c.remote) return true;
    ensureTracker();
    const { def, caster, sys } = c;
    const p = def.params ?? {};
    const speed = p.speed ?? 24;
    const dir = c.dir;
    let D = def.range ?? 25;
    const w = G.world;
    if (w?.nav) {
      const f = w.nav.raycast(caster.position.x, caster.position.z, caster.position.x + dir[0] * D, caster.position.z + dir[1] * D);
      D *= Math.min(1, f) * (f < 1 ? 0.92 : 1);
    }
    if (D < 1) D = 1;
    const dur = Math.max(0.15, D / speed);
    c.data.dir = dir;
    c.data.hit = new Set<number>();
    const a = c.action!;
    a.hitAt = dur;
    a.endAt = Math.max(a.endAt, dur + 0.35);
    a.chainAt = dur + 0.12;
    a.moveAt = dur + 0.1;
    a.uninterruptible = true;
    a.faceYaw = Math.atan2(dir[0], dir[1]);
    a.faceUntil = dur + 0.1;
    sys.moveActor(caster, dir[0] * speed, dir[1] * speed, dur);
    caster.statuses.addImmunity('cc', dur + 0.25);
    sys.vfx('wings_aura', at(caster, 1.2), { follow: caster.object3d, duration: dur + 0.6, scale: 1.2 });
    sys.vfx(def.vfx?.trail ?? 'fire_ground', at(caster, 0.1), { dir: [dir[0], 0, dir[1]], duration: dur + 0.2, follow: caster.object3d, scale: 1.3 });
    sys.sfx(def.sfx?.cast ?? 'fire_whoosh', caster.position);
    sys.shake(0.12);
    return true;
  },
  frame(c) {
    if (c.remote || !c.data.hit) return;
    const { def, caster, sys } = c;
    const p = def.params ?? {};
    const hit = c.data.hit as Set<number>;
    const dir = c.data.dir as [number, number];
    for (const e of enemiesIn(caster.position.x, caster.position.z, (p.pathWidth ?? 5) * 0.5 + 0.2, caster.position.y)) {
      if (e.isDead || hit.has(e.id)) continue;
      hit.add(e.id);
      sys.strike(c, e, { coef: p.pathCoef ?? 3, type: 'fire', weight: 'light', noGain: true, noHitstop: true, statuses: [], dir });
      sys.vfx('fire_burst', at(e, e.height * 0.5), { scale: 0.6 });
      if (p.wound) {
        sys.statusOnly(c, e, [{ status: 'temporal_wound', duration: p.woundDur ?? 10 }]);
        WOUNDS.set(e.id, { caster: caster.id, bank: 0, until: now() + (p.woundDur ?? 10) });
        sys.schedule(p.woundDur ?? 10, () => detonateWound(c, e));
      }
    }
  },
  fire(c) {
    const { def, caster, sys } = c;
    const p = def.params ?? {};
    const radius = def.radius ?? 6;
    const pos: [number, number, number] = [caster.position.x, 0.1, caster.position.z];
    sys.vfx(def.vfx?.impact ?? 'meteor_fall', pos, { scale: vfxScale(def.vfx?.impact ?? 'meteor_fall', radius) });
    sys.ring(pos[0], pos[2], radius, 0xff7a30);
    sys.shake(0.25);
    if (c.remote || p.landing === 0 || !def.damage) return;
    strikeMany(c, enemiesIn(caster.position.x, caster.position.z, radius, caster.position.y), 99, { noGain: true });
  },
};

// ---------------------------------------------------------------------------------------------------------
// healing: kit_heal / kit_echo / kit_blossom / kit_verdant / kit_time_dilation / Durgunluk
// ---------------------------------------------------------------------------------------------------------

/** Remote replay of a heal cast: a green beam toward the announced ally frame, else the cast vfx at the caster. */
function remoteHealFx(c: CastCtx): void {
  const id = c.aim.allyId ?? c.aim.targetId;
  const t = id !== null && id !== undefined ? G.world?.getActor(id) : undefined;
  if (t && !t.isDead) {
    beamTo(c, t, c.def.vfx?.cast ?? 'heal_loop');
    c.sys.vfx('heal_burst', at(t, t.height * 0.6), { scale: 0.8 });
  } else c.sys.vfx(c.def.vfx?.cast ?? 'heal_loop', at(c.caster, 1.3), { dir: [c.dir[0], 0, c.dir[1]], scale: 1 });
}

/** Merithra'nın Lütfu: the heal bounces to the 4 most injured other allies at 50 %. */
function merithrasBounce(c: CastCtx, ally: Player, amount: number): void {
  const { caster, sys } = c;
  if (!caster.statuses.has('merithras_blessing')) return;
  caster.statuses.remove('merithras_blessing');
  const others = alliesInRange(caster, HEAL_RANGE).filter((a) => a !== ally && !a.isDead).sort((a, b) => hpFrac(a) - hpFrac(b)).slice(0, 4);
  for (const a of others) {
    healOne(c, a, amount * 0.5);
    sys.vfx('heal_loop', at(a, a.height * 0.6), { scale: 0.6 });
  }
}

function healFire(c: CastCtx): void {
  const { caster, sys, def } = c;
  const p = def.params ?? {};
  if (c.remote) { remoteHealFx(c); return; }
  const foe = c.data.foe as Enemy | undefined;
  if (foe && !foe.isDead && !foe.removed) {
    // damage mode (Yaşayan Alev on an enemy under the reticle): the same bolt as the Yıkım row
    const d = sys.dirTo(caster, foe);
    sys.fireProjectile(c, d, BOLT_Y, foe);
    if (def.vfx?.cast) sys.vfx(def.vfx.cast, muzzle(c, d, 0.9, BOLT_Y), { dir: [d[0], 0, d[1]], scale: 0.6 });
    return;
  }
  let ally = (c.data.replay ? playerOf(c.data.allyId) : (c.data.ally as Player | undefined)) ?? null;
  if (!ally || ally.isDead) ally = inReach(c, resolveHealTarget(caster, c.aim, false), def.range ?? HEAL_RANGE);
  if (!ally) { sys.whiff(c); return; }
  const direct = (def.heal?.coef ?? 0) > 0 ? healFormula(caster, def.heal!.coef * c.more).amount : 0;
  const hotDur = p.hotDur ?? 12;
  const hotTotal = (p.hotCoef ?? 0) > 0 ? healFormula(caster, p.hotCoef * c.more).amount : 0;
  beamTo(c, ally, def.vfx?.cast ?? 'heal_loop');
  if (direct > 0) healOne(c, ally, direct);
  if (hotTotal > 0) {
    giveStatus(c, ally, 'reversion', hotDur, hotTotal / hotDur);
    if ((p.absorbPct ?? 0) > 0) {
      const absorb = hotTotal * p.absorbPct;
      if (ally.isLocal) addAbsorb(ally, absorb, ally.maxHp * 0.3, hotDur, undefined, caster.id);
      else giveStatus(c, ally, 'shield', hotDur, absorb);
    }
    sys.vfx('heal_loop', at(ally, ally.height * 0.5), { follow: ally.object3d, duration: 2, scale: 0.9 });
    lifebindHeal(c, ally, hotTotal * 0.5);
  }
  if (p.echoable) echoTrigger(c, ally, direct + hotTotal * 0.85);
  if (p.bounce) merithrasBounce(c, ally, direct + hotTotal * 0.5);
  sys.sfx('heal', ally.position);
  recordStasis(c, { kind: 'heal', allyId: ally.id, rank: 0 });
}

const heal: Behavior = {
  begin(c) {
    if (c.remote || c.data.replay) return true;
    const range = c.def.range ?? HEAL_RANGE;
    const aimed = inReach(c, playerOf(c.aim.allyId), range);
    if (aimed) { c.data.ally = aimed; return true; }
    // Yaşayan Alev (allyTarget 'any'): an enemy under the reticle is the damage mode, unless a badly hurt ally needs it
    if (c.def.allyTarget === 'any' && c.def.damage) {
      const foe = enemyInReach(c, range);
      if (foe) {
        const below = c.def.params?.healBelow ?? 0.4;
        let low: Player | null = null;
        for (const a of alliesInRange(c.caster, range)) if (hpFrac(a) < below && (!low || hpFrac(a) < hpFrac(low))) low = a;
        if (low) c.data.ally = low; else c.data.foe = foe;
        return true;
      }
    }
    const a = inReach(c, resolveHealTarget(c.caster, c.aim, false), range);
    if (!a) { c.sys.fail('target'); return false; }
    c.data.ally = a;
    return true;
  },
  fire: healFire,
};

const echo: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const a = pickAlly(c, c.def.range ?? HEAL_RANGE);
    if (!a) { c.sys.fail('target'); return false; }
    c.data.ally = a;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    if (c.remote) { remoteHealFx(c); return; }
    const ally = (c.data.ally as Player | undefined) ?? caster;
    const twin = caster.statuses.has('twin_echoes');
    const add = twin ? (p.twinEchoes ?? 2) : (p.echoes ?? 1);
    if (twin) caster.statuses.remove('twin_echoes');
    const dur = p.dur ?? 20;
    const st = evState(caster);
    const cur = st.echo.get(ally.id);
    const n = Math.min(2, (cur && cur.until > now() ? cur.n : 0) + add);
    st.echo.set(ally.id, { n, until: now() + dur });
    giveStatus(c, ally, 'echo', dur, n);
    beamTo(c, ally, 'heal_loop');
    sys.vfx(def.vfx?.impact ?? 'shape_echo', at(ally, ally.height * 0.55), { scale: 0.9 });
    sys.sfx('buff', ally.position);
  },
};

const blossom: Behavior = {
  begin(c) {
    if (c.remote || c.data.replay) return true;
    const a = pickAlly(c, c.def.range ?? HEAL_RANGE);
    if (!a) { c.sys.fail('target'); return false; }
    c.data.ally = a;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    if (c.remote) { remoteHealFx(c); return; }
    const centre = (c.data.replay ? playerOf(c.data.allyId) : (c.data.ally as Player | undefined)) ?? caster;
    const radius = (def.radius ?? 8) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    sys.ring(centre.position.x, centre.position.z, radius, 0x4fd19a);
    sys.vfx(def.vfx?.cast ?? 'heal_pillar', [centre.position.x, centre.position.y + 0.1, centre.position.z], { scale: vfxScale(def.vfx?.cast ?? 'heal_pillar', radius) });
    const list = alliesInRange(centre, radius).filter((a) => !a.isDead).sort((a, b) => hpFrac(a) - hpFrac(b) || a.id - b.id).slice(0, Math.round(p.maxTargets ?? 3));
    for (const a of list) {
      const amount = healFormula(caster, (def.heal?.coef ?? 2.3) * c.more).amount;
      healOne(c, a, amount);
      if (p.echoable) echoTrigger(c, a, amount);
    }
    sys.sfx('heal_big', centre.position);
    recordStasis(c, { kind: 'blossom', allyId: centre.id, rank: 0 });
  },
};

const verdant: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const { caster, def, sys } = c;
    const range = def.range ?? 25;
    const ally = pickAlly(c, range, true);
    if (!ally) {
      // nobody else around: the embrace heals the Evoker itself, no flight
      c.data.ally = caster;
      c.data.noDash = true;
      return true;
    }
    c.data.ally = ally;
    const dx = ally.position.x - caster.position.x, dz = ally.position.z - caster.position.z;
    const dist = Math.hypot(dx, dz);
    const gap = ally.radius + caster.radius + 0.6;
    if (dist <= gap + 0.3) { c.data.noDash = true; return true; }
    const dir: [number, number] = [dx / dist, dz / dist];
    const D = Math.max(0.4, dist - gap);
    const speed = def.params?.speed ?? 28;
    const dur = Math.max(0.1, D / speed);
    const a = c.action!;
    a.hitAt = dur;
    a.endAt = Math.max(a.endAt, dur + 0.35);
    a.chainAt = dur + 0.12;
    a.moveAt = dur + 0.1;
    a.uninterruptible = true;
    a.faceYaw = Math.atan2(dir[0], dir[1]);
    a.faceUntil = dur + 0.1;
    sys.moveActor(caster, dir[0] * speed, dir[1] * speed, dur);
    caster.statuses.addImmunity('cc', dur + 0.25);
    sys.vfx('dragon_trail', at(caster, 0.1), { dir: [dir[0], 0, dir[1]], duration: dur + 0.2, follow: caster.object3d, scale: 1.2 });
    sys.sfx('whoosh', caster.position);
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    if (c.remote) { remoteHealFx(c); return; }
    const ally = (c.data.ally as Player | undefined) ?? caster;
    const dur = p.lifebindDur ?? 8;
    const amount = healFormula(caster, (def.heal?.coef ?? 2.0) * c.more).amount;
    healOne(c, ally, amount);
    if (p.echoable) echoTrigger(c, ally, amount);
    evState(caster).lifebind = { id: ally.id, until: now() + dur };
    giveStatus(c, ally, 'lifebind', dur);
    sys.vfx('heal_pillar', at(ally, 0.1), { scale: 0.8 });
    sys.sfx('heal', ally.position);
  },
};

const timeDilation: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const a = pickAlly(c, c.def.range ?? HEAL_RANGE);
    if (!a) { c.sys.fail('target'); return false; }
    c.data.ally = a;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    if (c.remote) { remoteHealFx(c); return; }
    const ally = (c.data.ally as Player | undefined) ?? caster;
    giveStatus(c, ally, 'time_dilation', def.params?.dur ?? 8);
    sys.vfx(def.vfx?.cast ?? 'time_ripple', at(ally, 0.2), { follow: ally.object3d, duration: 2, scale: 1.1 });
    sys.sfx('time_warp', ally.position);
  },
};

const stasis: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    sys.vfx(def.vfx?.cast ?? 'time_ripple', at(caster, 1), { follow: caster.object3d, duration: 2, scale: 1.2 });
    sys.sfx('time_warp', caster.position);
    if (c.remote) return;
    evState(caster).stasis = [];
  },
};

/** Replays a stored heal cast for free at its original target (Durgunluk Salımı). */
function replayHeal(c: CastCtx, s: StoredHeal): void {
  const ctx: CastCtx = {
    sys: c.sys, caster: c.caster, def: s.def, aim: s.aim, dir: facing(c), remote: false, action: null, target: null, point: s.point,
    data: { replay: true, allyId: s.allyId, rank: s.rank }, more: s.more,
  };
  if (s.kind === 'dream') releaseDreamBreath(ctx, s.rank);
  else if (s.kind === 'blossom') BEHAVIORS.kit_blossom.fire(ctx);
  else healFire(ctx);
}

const stasisRelease: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    sys.vfx(def.vfx?.cast ?? 'time_ripple', at(caster, 1), { follow: caster.object3d, duration: 1.5, scale: 1.2 });
    if (c.remote) return;
    const st = evState(caster);
    const list = st.stasis.splice(0);
    caster.statuses.remove('stasis');
    const gap = def.params?.gap ?? 0.35;
    list.forEach((s, i) => sys.schedule(i * gap, () => { if (!caster.isDead) replayHeal(c, s); }));
    sys.sfx('heal_big', caster.position);
  },
};

// ---------------------------------------------------------------------------------------------------------
// Yüceltme: Abanoz Kudret / Öngörü
// ---------------------------------------------------------------------------------------------------------

const ebonMight: Behavior = {
  begin() {
    ensureTracker();
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    sys.vfx(def.vfx?.cast ?? 'ebon_wings', at(caster, 1.4), { follow: caster.object3d, duration: 1.5, scale: 1 });
    sys.sfx('choir_sting', caster.position, { volume: 0.7 });
    if (c.remote) return;
    const dur = p.dur ?? 20;
    const st = evState(caster);
    st.ebon.clear();
    caster.statuses.apply('ebon_might', dur, { magnitude: p.selfMag ?? 0.08, sourceId: caster.id });
    st.ebon.set(caster.id, now() + dur);
    for (const a of topDamageAllies(caster, def.range ?? 40, Math.round(p.count ?? 2))) {
      giveStatus(c, a, 'ebon_might', dur, p.allyMag ?? 0.11);
      st.ebon.set(a.id, now() + dur);
      sys.vfx('ebon_wings', at(a, 1.4), { follow: a.object3d, duration: 1.5, scale: 0.9 });
      beamTo(c, a, 'prescience_rune');
    }
  },
};

const prescience: Behavior = {
  begin(c) {
    if (c.remote) return true;
    ensureTracker();
    const a = pickAlly(c, c.def.range ?? 25, true) ?? c.caster;
    c.data.ally = a;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    if (c.remote) { remoteHealFx(c); return; }
    const ally = (c.data.ally as Player | undefined) ?? caster;
    const dur = p.dur ?? 20;
    const st = evState(caster);
    st.presc = st.presc.filter((x) => x.until > now() && x.id !== ally.id);
    st.presc.push({ id: ally.id, until: now() + dur });
    while (st.presc.length > (p.max ?? 2)) {
      const old = st.presc.shift()!;
      const o = playerOf(old.id);
      if (o?.isLocal) o.statuses.remove('prescience');
    }
    giveStatus(c, ally, 'prescience', dur);
    if (ally !== caster) beamTo(c, ally, def.vfx?.cast ?? 'prescience_rune');
    sys.vfx('prescience_rune', at(ally, 1.2), { scale: 0.8 });
    sys.sfx('buff', ally.position);
  },
};

/** Zaman Atlatma (Time Skip): resets every other cooldown of the caster (SkillSystem.resetAllCooldowns). */
const timeSkip: Behavior = {
  fire(c) {
    if (c.remote) return;
    c.sys.resetAllCooldowns(c.caster, c.def.id);
    c.sys.sfx('buff', c.caster.position);
  },
};

Object.assign(BEHAVIORS_KIT_EVOKER, {
  kit_time_skip: timeSkip,
  kit_empower: empower,
  kit_living_flame: livingFlame,
  kit_essence_beam: essenceBeam,
  kit_aoe_strike: aoeStrike,
  kit_dragonrage: dragonrage,
  kit_flight: flight,
  kit_heal: heal,
  kit_echo: echo,
  kit_blossom: blossom,
  kit_verdant: verdant,
  kit_time_dilation: timeDilation,
  kit_stasis: stasis,
  kit_stasis_release: stasisRelease,
  kit_ebon_might: ebonMight,
  kit_prescience: prescience,
});

function installKitEvoker(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_KIT_EVOKER);
}

try {
  installKitEvoker();
} catch {
  queueMicrotask(installKitEvoker);
}
