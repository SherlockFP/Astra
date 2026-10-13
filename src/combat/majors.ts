/**
 * Major cooldowns (GDD_V2 §2): behaviours of the 15 non-mage majors and the persistence of the m45/m90/m180 timers in
 * CharacterSave.majorCd. OWNER: combat (WP5). The mage majors (§2.2 rows 11-15) belong to the GDD_TALENTS mage specs (T8).
 *
 * Behaviours are registered in combat/skills/behaviors.ts (BEHAVIORS). Each one checks `c.remote` before any state change:
 * remote replays only show visuals. Type-only imports from behaviors.ts keep this module free of runtime cycles.
 */
import { G } from '../game/G';
import type { Behavior, CastCtx } from './skills/behaviors';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { EntityId } from '../types/common';
import type { SkillSlotKey } from '../types/skills';
import { alliesInRange, healAlly, healAmount, addAbsorb, dispelUpTo, healFormula } from './healing';
import { isHeroDef } from './specs';

/** The three major slots and their cooldown seconds (GDD_V2 §2.1). */
export const MAJOR_SLOTS: readonly SkillSlotKey[] = ['m45', 'm90', 'm180'];
export const MAJOR_BASE: Record<'m45' | 'm90' | 'm180', number> = { m45: 45, m90: 90, m180: 180 };

const fxAt = (c: CastCtx): [number, number, number] => [c.caster.position.x, c.caster.position.y + 0.1, c.caster.position.z];

/** Visual for a cast (remote peers too): the skill's own `vfx.cast` at the caster. */
function fx(c: CastCtx): void {
  const id = c.def.vfx?.cast;
  if (id) c.sys.vfx(id, fxAt(c), { follow: c.caster.object3d, duration: 1.2, scale: 1.1 });
}

/** Threat added on the host side only (EnemyAI is authoritative on the host). */
function addThreat(e: Enemy, id: EntityId, amount: number): void {
  if (e.authority && e.ai) e.ai.addThreat(id, amount);
}

const notBoss = (e: Enemy): boolean => e.def.rank !== 'boss';

// ----------------------------------------------------------------------------------------------------------------
// hero effects (m180): Kurt Narası family
// ----------------------------------------------------------------------------------------------------------------

/** Applies hero_haste (40 s) to every living party member within 40 m and `sated` (150 s) to them. The caster must not be sated. */
export const heroBehavior: Behavior = {
  begin(c) {
    if (!isHeroDef(c.def)) return true;
    if (c.caster.statuses.has('sated')) { c.sys.fail('cooldown'); return false; }
    return true;
  },
  fire(c) {
    fx(c);
    if (c.remote) return;
    const { caster, sys, def } = c;
    const range = def.params?.range ?? 40;
    const dur = def.params?.dur ?? 40;
    const sated = def.params?.sated ?? 150;
    caster.statuses.apply('hero_haste', dur, { sourceId: caster.id });
    caster.statuses.apply('sated', sated, { sourceId: caster.id });
    for (const p of alliesInRange(caster, range)) {
      if (p === caster) continue;
      if (p.isLocal) {
        if (!p.statuses.has('sated')) p.statuses.apply('hero_haste', dur, { sourceId: caster.id });
        p.statuses.apply('sated', sated, { sourceId: caster.id });
      } else {
        const peer = G.net?.peerOfEntity(p.id);
        if (!peer) continue;
        G.net.sendTo(peer, 'pstatus', { targetId: p.id, status: 'hero_haste', duration: dur, magnitude: 0, sourceId: caster.id });
        G.net.sendTo(peer, 'pstatus', { targetId: p.id, status: 'sated', duration: sated, magnitude: 0, sourceId: caster.id });
      }
    }
  },
};

// ----------------------------------------------------------------------------------------------------------------
// knight (Koruyucu / Kılıç Ustası)
// ----------------------------------------------------------------------------------------------------------------

/** Sarsılmaz Bastion: DR and unstoppable on self (status), +resource, heal 10%, +100 threat within 8 m. */
const bastion: Behavior = {
  fire(c) {
    fx(c);
    if (c.remote) return;
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    c.caster.statuses.apply('bastion', def.selfStatuses?.[0]?.duration ?? 10, { sourceId: caster.id });
    sys.addResource(caster, p.resGain ?? 30);
    G.combat.healPlayer(caster, caster, caster.maxHp * (p.healPct ?? 0.1), { quiet: true });
    for (const e of sys.enemiesNear(caster.position.x, caster.position.z, p.threatR ?? 8)) addThreat(e, caster.id, p.threat ?? 100);
  },
};

/** Yemin Aegis'i: allies within 15 m get aegis (DR 25%, 8 s) and 8% heal; self absorbs 30% max HP. */
const oathAegis: Behavior = {
  fire(c) {
    fx(c);
    if (c.remote) return;
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const r = p.range ?? 15;
    const dur = def.selfStatuses?.[0]?.duration ?? 8;
    sys.applyPartyAt(c, 'aegis', dur, 0, caster.position.x, caster.position.z, r);
    for (const a of alliesInRange(caster, r)) healAmount(caster, a, a.maxHp * (p.healPct ?? 0.08));
    addAbsorb(caster, caster.maxHp * (p.absorbPct ?? 0.3), caster.maxHp * (p.absorbPct ?? 0.3), dur, undefined, caster.id);
  },
};

/** Hüküm Kanatları and Gayret are plain self buffs (selfStatuses): see data/skills.ts. */

// ----------------------------------------------------------------------------------------------------------------
// barbarian (Savaş Lordu / Kasap)
// ----------------------------------------------------------------------------------------------------------------

/** Son Direniş: +30% max HP (current HP raised by the same amount), DR -20%, unstoppable, +30 rage. */
const lastStand: Behavior = {
  fire(c) {
    fx(c);
    if (c.remote) return;
    const { caster, sys, def } = c;
    const before = caster.maxHp;
    caster.statuses.apply('last_stand', def.selfStatuses?.[0]?.duration ?? 10, { sourceId: caster.id });
    caster.hp = Math.min(caster.maxHp, caster.hp + Math.max(0, caster.maxHp - before));
    sys.addResource(caster, def.params?.resGain ?? 30);
  },
};

/** Toplayıcı Kükreme: allies within 20 m get rally (+15% max HP, 12 s) and a 15% heal; fears non-bosses within 8 m; threat. */
const rallyingRoar: Behavior = {
  fire(c) {
    fx(c);
    if (c.remote) return;
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const r = p.range ?? 20;
    const dur = def.selfStatuses?.[0]?.duration ?? 12;
    sys.applyPartyAt(c, 'rally', dur, 0, caster.position.x, caster.position.z, r);
    for (const a of alliesInRange(caster, r)) healAmount(caster, a, a.maxHp * (p.healPct ?? 0.15));
    for (const e of sys.enemiesNear(caster.position.x, caster.position.z, p.fearR ?? 8)) {
      if (notBoss(e)) e.statuses.apply('fear', p.fearDur ?? 1.5, { sourceId: caster.id });
    }
    for (const e of sys.enemiesNear(caster.position.x, caster.position.z, r)) addThreat(e, caster.id, p.threat ?? 100);
  },
};

/** Kan Banyosu: every bleed within 12 m detonates for 150% of its remaining damage; +20 rage and a heal per target. */
const bloodbath: Behavior = {
  fire(c) {
    fx(c);
    if (c.remote) return;
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const r = p.range ?? 12;
    const healCap = caster.maxHp * (p.healCap ?? 0.12);
    let healed = 0;
    for (const e of sys.enemiesNear(caster.position.x, caster.position.z, r)) {
      const b = e.statuses.get('bleed');
      if (!b) continue;
      const dmg = Math.max(0, b.dps * b.remaining) * (p.mult ?? 1.5);
      e.statuses.remove('bleed');
      if (dmg > 0) sys.strike(c, e, { coef: 0, flat: dmg, type: 'physical', canCrit: false, weight: 'light' });
      sys.addResource(caster, p.resGain ?? 20);
      healed = Math.min(healCap, healed + caster.maxHp * (p.healPct ?? 0.015));
    }
    if (healed > 0) G.combat.healPlayer(caster, caster, healed, { quiet: true });
  },
};

// ----------------------------------------------------------------------------------------------------------------
// rogue (Suikastçı / Simyacı)
// ----------------------------------------------------------------------------------------------------------------

/** Ölümcül Gölge Dansı: stealth that does not break; Gölge Adımı is reset. */
const shadowDance: Behavior = {
  fire(c) {
    fx(c);
    if (c.remote) return;
    const { caster, sys, def } = c;
    sys.applySelf(c, def.selfStatuses ?? []);
    caster.statuses.apply('stealth', def.selfStatuses?.[0]?.duration ?? 8, { sourceId: caster.id });
    if (def.params?.resetStep) sys.resetCooldown(caster, 'rogue_shadow_step');
  },
};

/** Hayat İksiri Yağmuru: allies within 15 m get 1.8×W heal, elixir_regen (6 s) and one dispel. */
const elixirOfLife: Behavior = {
  fire(c) {
    fx(c);
    if (c.remote) return;
    const { caster, def } = c;
    const p = def.params ?? {};
    const r = p.range ?? 15;
    const dur = p.regenDur ?? 6;
    const perSec = healFormula(caster, p.regenCoef ?? 0.3).amount;
    for (const a of alliesInRange(caster, r)) {
      healAlly(caster, a, p.heal ?? 1.8);
      a.statuses.apply('elixir_regen', dur, { magnitude: perSec, sourceId: caster.id });
      dispelUpTo(a, p.cleanse ?? 1);
    }
  },
};

/** Mucize Karışım: a cauldron at the ground point for 10 s: DR 25%, 6% max HP per second, poison/bleed cleanse every 2 s. */
const miracleBrew: Behavior = {
  fire(c) {
    fx(c);
    if (c.remote) return;
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const r = def.radius ?? 6;
    const [x, z] = c.point;
    const dur = def.duration ?? 10;
    const tick = (n: number): void => {
      sys.applyPartyAt(c, 'fortify', 1.2, p.drPct ?? 0.25, x, z, r);
      sys.applyPartyAt(c, 'brew_zone', 1.2, 0, x, z, r);
      for (const a of G.world?.players ?? []) {
        if (a.isDead || Math.hypot(a.position.x - x, a.position.z - z) > r + a.radius) continue;
        healAmount(caster, a, a.maxHp * (p.healPct ?? 0.06));
        if (n % (p.cleanseEvery ?? 2) === 0) dispelUpTo(a, 2, ['poison', 'bleed']);
      }
    };
    tick(0);
    for (let i = 1; i < dur; i++) sys.schedule(i, () => tick(i));
  },
};

/** Behaviours of the 15 non-mage majors, keyed by SkillDef.behavior. */
export const MAJOR_BEHAVIORS: Record<string, Behavior> = {
  major_hero: heroBehavior,
  major_bastion: bastion,
  major_aegis: oathAegis,
  major_last_stand: lastStand,
  major_rally: rallyingRoar,
  major_bloodbath: bloodbath,
  major_shadow_dance: shadowDance,
  major_elixir: elixirOfLife,
  major_brew: miracleBrew,
};

// ----------------------------------------------------------------------------------------------------------------
// persistence (CharacterSave.majorCd: remaining seconds per slot, ticked while in game)
// ----------------------------------------------------------------------------------------------------------------

/** Remaining seconds of the three major slots from the save (0 = ready). */
export function readMajorCd(): Record<'m45' | 'm90' | 'm180', number> {
  const m = G.character?.save.majorCd;
  return { m45: Math.max(0, m?.m45 ?? 0), m90: Math.max(0, m?.m90 ?? 0), m180: Math.max(0, m?.m180 ?? 0) };
}

/** Sets the remaining seconds of one major slot in the save (called from SkillSystem every second). */
export function writeMajorCd(slot: 'm45' | 'm90' | 'm180', sec: number): void {
  const ch = G.character;
  if (!ch) return;
  ch.save.majorCd ??= { m45: 0, m90: 0, m180: 0 };
  ch.save.majorCd[slot] = Math.max(0, Math.round(sec));
}

/** Dungeon / raid entry, a boss wipe, and an M+ start reset every major (GDD_V2 §2.1). Never in the open world. */
export function resetMajorCooldowns(): void {
  const ch = G.character;
  if (!ch) return;
  ch.save.majorCd = { m45: 0, m90: 0, m180: 0 };
  G.skills?.resetMajors?.();
}
