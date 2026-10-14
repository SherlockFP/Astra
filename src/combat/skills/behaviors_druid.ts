/**
 * Druid behaviours (KIT Druid, WoW Midnight 12.0). Installed into BEHAVIORS by the import at the end of behaviors.ts, with the same
 * microtask fallback as behaviors_monk.ts (the module can load before BEHAVIORS is initialised). OWNER: druid kit. behaviors.ts is not
 * edited. Ids start with `kit_` so SkillSystem picks the target for them (makeCtx) and applies `def.selfStatuses` after `fire`.
 *
 * behaviour id           used by (druid skill ids)                         reads (SkillDef.params unless noted)
 * ---------------------  ------------------------------------------------  ------------------------------------------------------------
 * kit_druid_shift        druid_cat_form / _bear_form / _travel_form        form: 1 moonkin, 2 cat, 3 bear, 4 travel (Forms.toggleForm)
 * kit_druid_dot          druid_moonfire, druid_sunfire                     def.damage + def.statuses (DoT), splash: radius / maxTargets /
 *                                                                          splashMult (Güneş Ateşi hits the pack)
 * kit_druid_self         buttons with a self effect (Barkskin, Pars         def.selfStatuses (by dispatch), heal (share of max HP),
 *                        Öfkesi, Çılgın Yenilenme, Celestial Alignment...)  hotPct + hotDur (frenzied), energy / rage / ap (resource gain)
 * kit_druid_eclipse      druid_eclipse                                     dur, ap: alternates Güneş / Ay Tutulması
 * kit_druid_starfall     druid_starfall (channel)                          def.radius, def.damage per tick, tick, maxTargets
 * kit_druid_fury         druid_fury_of_elune (ground)                      def.radius, def.damage per pulse, pulses, interval, ap per hit
 * kit_druid_hot          druid_rejuvenation, _regrowth, _lifebloom,        def.heal (instant), def.statuses[0] (HoT or buff), hotCoef
 *                        _ironbark                                         per `tick` s, bloom (heal at the end), omen (chance)
 * kit_druid_wild_growth  druid_wild_growth                                 def.heal, def.radius, maxTargets, hotCoef, tick, def.statuses[0]
 * kit_druid_swiftmend    druid_swiftmend                                   def.heal.coef; consumes Gençleşme / Yeniden Büyüme / Yabani Büyüme
 * kit_druid_tranq        druid_tranquility (channel)                       def.heal.coef per tick, def.radius, tick
 *
 * Reused from other files: kit_finisher (rogueKit: druid_ferocious_bite, druid_rip), multi_strike (plateKit: druid_feral_frenzy),
 * provoke (druid_growl), interrupt (druid_solar_beam), heal_bolt (druid_resto_basic), heal_target (druid_natures_cure), the targeting
 * defaults melee_arc / self_aoe / target_projectile. Mastery: Harmony (Restorasyon): +6 % healing per own HoT on the target, up to 5.
 */
import { G } from '../../game/G';
import { yawFromDir } from '../../core/utils';
import { BEHAVIORS, at, clearSight, dist2, groundAt, type Behavior, type CastCtx } from './behaviors';
import { alliesInRange, healAmount, healFormula, resolveHealTarget } from '../healing';
import { specOf } from '../specs';
import { FORMS, toggleForm, addFormResource, type FormId } from '../Forms';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { DamageResult } from '../Combat';
import type { StatusId } from '../../types/skills';

export const BEHAVIORS_DRUID: Record<string, Behavior> = {};

const FORM_BY_NUM: Record<number, FormId> = { 1: 'moonkin', 2: 'cat', 3: 'bear', 4: 'travel' };
/** Own HoTs that Mastery: Harmony counts (cap 5) and Çabuk İyileşme may consume (in this order). */
const HOTS: readonly StatusId[] = ['rejuvenation', 'regrowth', 'lifebloom', 'wild_growth'];
const SWIFTMEND_FOOD: readonly StatusId[] = ['rejuvenation', 'regrowth', 'wild_growth'];
const HARMONY_PER_HOT = 0.06;
const HARMONY_CAP = 5;

// ---------------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------------

/** Friendly pick of a heal (aimed ally, friendly selection, crosshair ally, lowest HP in range, else the caster; healing.ts resolver). */
function healPick(c: CastCtx): Player {
  return resolveHealTarget(c.caster, c.aim, false) ?? c.caster;
}

/** The ally a stored pick still stands for: the caster when the pick died meanwhile. */
function pickedAlly(c: CastCtx): Player {
  const a = c.data.ally as Player | undefined;
  return a && !a.isDead && !a.removed ? a : c.caster;
}

/** Gives a status to an ally. A remote player gets the 'pstatus' message its owner applies; a local one is applied directly. */
function giveStatus(c: CastCtx, target: Actor, status: StatusId, duration: number, magnitude: number): void {
  if (target.kind === 'player' && !(target as Player).isLocal) {
    const peer = G.net?.peerOfEntity(target.id);
    if (peer) G.net?.sendTo(peer, 'pstatus', { targetId: target.id, status, duration, magnitude, sourceId: c.caster.id });
    return;
  }
  target.statuses.apply(status, duration, { magnitude, sourceId: c.caster.id });
}

/** Restorasyon Mastery: Harmony. 1 + 6 % per own HoT on the target (max 5); other specs heal at 1. */
export function harmonyMul(caster: Player, target: Actor): number {
  if (specOf(caster)?.id !== 'druid_restoration') return 1;
  let n = 0;
  for (const h of HOTS) if (target.statuses.has(h)) n++;
  return 1 + HARMONY_PER_HOT * Math.min(HARMONY_CAP, n);
}

/** Enemy the cast was aimed at (SkillSystem.makeCtx picks it for kit_ behaviours): alive, in range, in line of sight. */
function needEnemy(c: CastCtx): boolean {
  if (c.remote) return true;
  const t = c.target;
  if (!t || t.isDead || t.team !== 'enemy') { c.sys.fail('target'); return false; }
  if (dist2(t.position, c.caster.position) - t.radius > (c.def.range ?? 30) + 1) { c.sys.fail('range'); return false; }
  if (!clearSight(c.caster, t)) { c.sys.fail('range'); return false; }
  const d = c.sys.dirTo(c.caster, t);
  if (c.action) c.action.faceYaw = yawFromDir(d[0], d[1]);
  return true;
}

/** An ally is hurt enough to be worth a cast: the picked ally of the HoT rows is any living ally (HoTs refresh on a full-health target). */
const hpFrac = (a: Actor): number => a.hp / Math.max(1, a.maxHp);

// ---------------------------------------------------------------------------------------------------------------------
// forms
// ---------------------------------------------------------------------------------------------------------------------

const shift: Behavior = {
  fire(c) {
    const id = FORM_BY_NUM[Math.round(c.def.params?.form ?? 0)];
    if (!id) return;
    c.sys.vfx('buff_aura', at(c.caster, 0.2), { follow: c.caster.object3d, duration: 0.8, scale: 1.1 });
    if (c.remote) return;
    toggleForm(c.caster, id);
    c.sys.sfx(c.def.sfx?.cast ?? 'boss_roar', c.caster.position, { volume: 0.7, pitch: id === 'cat' ? 1.3 : id === 'bear' ? 0.8 : 1 });
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Denge
// ---------------------------------------------------------------------------------------------------------------------

/** Ay Ateşi / Güneş Ateşi: an instant ranged hit with a DoT on the target; `splash` also hits (and burns) the pack around it. */
const dot: Behavior = {
  begin(c) {
    return needEnemy(c);
  },
  fire(c) {
    const { caster, sys, def } = c;
    const t = c.target as Enemy | null;
    if (c.remote) {
      sys.vfx(def.vfx?.cast ?? 'arcane_burst', at(caster, 1.3), { dir: [c.dir[0], 0, c.dir[1]], scale: 0.7 });
      return;
    }
    if (!t || t.isDead) { sys.whiff(c); return; }
    const p = def.params ?? {};
    const d = sys.dirTo(caster, t);
    const results: DamageResult[] = [];
    const first = sys.strike(c, t, { dir: d });
    if (first) results.push(first);
    sys.vfx(def.vfx?.impact ?? 'arcane_burst', [t.position.x, t.position.y + t.height * 0.55, t.position.z], { scale: 0.8 });
    if (p.splash && def.radius) {
      const near = sys.enemiesNear(t.position.x, t.position.z, def.radius, t.position.y).filter((e) => e !== t && !e.isDead);
      for (const e of near.slice(0, Math.max(0, Math.round(p.maxTargets ?? 6) - 1))) {
        const r = sys.strike(c, e, { coef: (def.damage?.coef ?? 0.4) * (p.splashMult ?? 0.8), dir: sys.dirTo(caster, e), noGain: true, noHitstop: true });
        if (r) results.push(r);
      }
      sys.ring(t.position.x, t.position.z, def.radius, def.damage?.type === 'fire' ? 0xffa040 : 0xa0b8ff);
    }
    if (results.length) sys.afterHits(c, results);
    else sys.whiff(c);
  },
};

/** Self effects: heal share, Frenzied Regeneration (a 3 s HoT of a share of max HP), energy / rage / Astral Güç gain. Statuses by dispatch. */
const self: Behavior = {
  fire(c) {
    const { caster, def, sys } = c;
    sys.vfx(def.vfx?.cast ?? 'buff_aura', at(caster, 1.0), { follow: caster.object3d, duration: 1.2, scale: 1 });
    if (c.remote) return;
    const p = def.params ?? {};
    if (p.heal) healAmount(caster, caster, p.heal * caster.maxHp);
    if (p.hotPct) {
      const dur = p.hotDur ?? 3;
      caster.statuses.apply('frenzied', dur, { magnitude: (p.hotPct * caster.maxHp) / dur, sourceId: caster.id });
    }
    if (p.energy && caster.resourceType === FORMS.cat.resource) addFormResource(caster, p.energy);
    if (p.rage && caster.resourceType === FORMS.bear.resource) addFormResource(caster, p.rage);
    if (p.ap) sys.addPip(caster, 'astral_power', p.ap);
    sys.sfx(def.sfx?.cast ?? 'buff', caster.position);
  },
};

/** Which Eclipse comes next for a caster (they alternate). */
const LAST_ECLIPSE = new WeakMap<Actor, 'solar' | 'lunar'>();

const eclipse: Behavior = {
  fire(c) {
    const { caster, def, sys } = c;
    sys.vfx('buff_aura', at(caster, 1.0), { follow: caster.object3d, duration: 1.2, scale: 1.2 });
    if (c.remote) return;
    const p = def.params ?? {};
    const next = LAST_ECLIPSE.get(caster) === 'solar' ? 'lunar' : 'solar';
    LAST_ECLIPSE.set(caster, next);
    const dur = p.dur ?? 15;
    const other: StatusId = next === 'solar' ? 'eclipse_lunar' : 'eclipse_solar';
    if (!caster.statuses.has('celestial_alignment')) caster.statuses.remove(other);
    caster.statuses.apply(next === 'solar' ? 'eclipse_solar' : 'eclipse_lunar', dur, { sourceId: caster.id });
    if (p.ap) sys.addPip(caster, 'astral_power', p.ap);
    sys.sfx('buff', caster.position);
  },
};

/** Yıldız Yağmuru: a 6 s channel; every tick up to `maxTargets` of the nearest enemies in the radius take a star (the caster may move). */
const starfall: Behavior = {
  fire(c) {
    c.sys.vfx('arcane_burst', at(c.caster, 2.2), { follow: c.caster.object3d, duration: c.def.channel ?? 6, scale: 1.4 });
  },
  tick(c) {
    const { caster, sys, def } = c;
    const radius = (def.radius ?? 9) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    const list = sys.enemiesNear(caster.position.x, caster.position.z, radius, caster.position.y)
      .filter((e) => !e.isDead)
      .sort((a, b) => dist2(a.position, caster.position) - dist2(b.position, caster.position))
      .slice(0, Math.round(def.params?.maxTargets ?? 5));
    for (const e of list) {
      sys.vfx('arcane_burst', [e.position.x, e.position.y + 0.3, e.position.z], { scale: 0.7 });
      if (!c.remote) sys.strike(c, e, { tick: true, noGain: true, noHitstop: true, dir: sys.dirTo(caster, e) });
    }
    if (list.length) sys.sfx('spell_cast', caster.position, { volume: 0.4, pitchVar: 0.3 });
    return true;
  },
};

/** Elune'nin Hiddeti: a moonlight column on the aimed point, `pulses` hits `interval` s apart on everything inside; each hit feeds Astral Güç. */
const fury: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const x = c.point[0], z = c.point[1];
    const y = groundAt(x, z) ?? caster.position.y;
    const radius = (def.radius ?? 6) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    const pulses = Math.max(1, Math.round(p.pulses ?? 8));
    const interval = p.interval ?? 1;
    sys.vfx('holy_ground', [x, y, z], { scale: radius / 3, duration: pulses * interval });
    for (let n = 0; n < pulses; n++) {
      sys.schedule(n * interval + 0.05, () => {
        sys.vfx('arcane_burst', [x, y + 0.2, z], { scale: radius / 4 });
        if (c.remote || caster.isDead) return;
        let hit = 0;
        for (const e of sys.enemiesNear(x, z, radius, y)) {
          if (e.isDead) continue;
          if (sys.strike(c, e, { tick: true, noGain: true, noHitstop: true, dir: sys.dirTo(caster, e) })) hit++;
        }
        if (hit > 0 && p.ap) sys.addPip(caster, 'astral_power', p.ap);
      });
    }
    sys.sfx('spell_cast', [x, y, z]);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Restorasyon
// ---------------------------------------------------------------------------------------------------------------------

/** One bloom per target: a recast supersedes the bloom scheduled by the earlier Yaşam Çiçeği. */
const BLOOM = new WeakMap<Actor, number>();

/**
 * Heals the picked ally (def.heal, instant), then gives def.statuses[0]: a HoT whose magnitude is HP per second (hotCoef per `tick`
 * seconds), or a plain buff (Demir Kabuk: no hotCoef). `bloom` heals again when the status would run out (Yaşam Çiçeği), `omen` is
 * the chance of Berraklık Alameti (next Yeniden Büyüme +30 % and free; `omenUse` on that row consumes it).
 */
const hot: Behavior = {
  begin(c) {
    if (!c.remote) c.data.ally = healPick(c);
    return true;
  },
  fire(c) {
    const { caster, def, sys } = c;
    const ally = c.remote ? caster : pickedAlly(c);
    sys.vfx(def.vfx?.impact ?? 'heal_burst', at(ally, ally.height * 0.6), { scale: 0.8 });
    if (c.remote) return;
    const p = def.params ?? {};
    let mul = harmonyMul(caster, ally) * c.more;
    // Berraklık Alameti (Omen of Clarity): the next Yeniden Büyüme is 30 % stronger and costs no mana (consumed here)
    if (p.omenUse && caster.statuses.has('omen_clarity')) {
      caster.statuses.remove('omen_clarity');
      sys.addResource(caster, def.cost);
      mul *= 1.3;
    }
    if (def.heal?.coef) healAmount(caster, ally, healFormula(caster, def.heal.coef * mul).amount);
    const st = def.statuses?.[0];
    if (st) {
      const perSec = p.hotCoef ? healFormula(caster, p.hotCoef * mul).amount / (p.tick ?? 2) : 0;
      giveStatus(c, ally, st.status, st.duration, perSec);
      if (p.bloom) {
        const token = (BLOOM.get(ally) ?? 0) + 1;
        BLOOM.set(ally, token);
        sys.schedule(st.duration, () => {
          if (BLOOM.get(ally) !== token || ally.isDead || ally.removed) return;
          healAmount(caster, ally, healFormula(caster, p.bloom * mul).amount);
          sys.vfx('heal_pillar', at(ally, 0.1), { scale: 0.9 });
        });
      }
    }
    if (p.omen && Math.random() < p.omen) caster.statuses.apply('omen_clarity', 15, { sourceId: caster.id });
    sys.sfx(def.sfx?.cast ?? 'heal', ally.position);
  },
};

/** Yabani Büyüme: the picked ally and the most injured allies around it (up to maxTargets) heal at once and get a 7 s HoT. */
const wildGrowth: Behavior = {
  begin(c) {
    if (!c.remote) c.data.ally = healPick(c);
    return true;
  },
  fire(c) {
    const { caster, def, sys } = c;
    const p = def.params ?? {};
    const centre = c.remote ? caster : pickedAlly(c);
    sys.vfx('heal_loop', at(centre, 0.1), { scale: 1.6, duration: 1.2 });
    sys.ring(centre.position.x, centre.position.z, def.radius ?? 14, 0x9affb0);
    if (c.remote) return;
    const group = alliesInRange(centre, def.radius ?? 14).filter((a) => !a.isDead && a !== centre);
    group.sort((a, b) => hpFrac(a) - hpFrac(b) || a.id - b.id);
    const list = [centre, ...group].slice(0, Math.max(1, Math.round(p.maxTargets ?? 5)));
    const st = def.statuses?.[0];
    for (const a of list) {
      const mul = harmonyMul(caster, a) * c.more;
      if (def.heal?.coef) healAmount(caster, a, healFormula(caster, def.heal.coef * mul).amount);
      if (st && p.hotCoef) giveStatus(c, a, st.status, st.duration, healFormula(caster, p.hotCoef * mul).amount / (p.tick ?? 1));
      sys.vfx('heal_burst', at(a, a.height * 0.6), { scale: 0.7 });
    }
    sys.sfx('heal_big', caster.position);
  },
};

/** Çabuk İyileşme: needs one of the target's HoTs; consumes it and heals at once. */
const swiftmend: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const ally = healPick(c);
    if (!SWIFTMEND_FOOD.some((h) => ally.statuses.has(h))) { c.sys.fail('target'); return false; }
    c.data.ally = ally;
    return true;
  },
  fire(c) {
    const { caster, def, sys } = c;
    if (c.remote) { sys.vfx('heal_pillar', at(caster, 0.1), { scale: 0.8 }); return; }
    const ally = pickedAlly(c);
    const food = SWIFTMEND_FOOD.find((h) => ally.statuses.has(h));
    if (!food) { sys.whiff(c); return; }
    const mul = harmonyMul(caster, ally) * c.more;
    ally.statuses.remove(food);
    healAmount(caster, ally, healFormula(caster, (def.heal?.coef ?? 3.2) * mul).amount);
    sys.vfx('heal_pillar', at(ally, 0.1), { scale: 1 });
    sys.sfx('heal_big', ally.position);
  },
};

/** Dinginlik: a 6 s channel that heals every ally in range each tick. */
const tranq: Behavior = {
  fire(c) {
    c.sys.vfx('heal_loop', at(c.caster, 0.1), { follow: c.caster.object3d, duration: c.def.channel ?? 6, scale: 2.4 });
    c.sys.sfx('heal_big', c.caster.position);
  },
  tick(c) {
    if (c.remote) return true;
    const { caster, def, sys } = c;
    const list = alliesInRange(caster, def.radius ?? 25);
    if (!list.includes(caster)) list.push(caster);
    for (const a of list) {
      healAmount(caster, a, healFormula(caster, (def.heal?.coef ?? 0.95) * harmonyMul(caster, a) * c.more).amount);
      sys.vfx('heal_burst', at(a, a.height * 0.6), { scale: 0.6 });
    }
    return true;
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Yeniden Doğuş (Rebirth) and Çiçeklenme (Efflorescence)
// ---------------------------------------------------------------------------------------------------------------------

/** Yeniden Doğuş: battle res of the aimed dead ally in range, else the nearest one. The owner of a remote ally gets the 'revive'
 *  message (PlayerController pattern: the owner's Combat.reviveLocalPlayer runs on its machine). */
const rebirth: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const { caster, def } = c;
    const range = def.range ?? 30;
    const dist = (p: Actor): number => Math.hypot(p.position.x - caster.position.x, p.position.z - caster.position.z);
    const dead = (G.world?.players ?? []).filter((p) => p.isDead && !p.removed && dist(p) <= range + p.radius);
    const aimedId = c.aim?.targetId;
    const aimed = aimedId != null ? dead.find((p) => p.id === aimedId) : undefined;
    const pick = aimed ?? dead.sort((a, b) => dist(a) - dist(b) || a.id - b.id)[0];
    if (!pick) { c.sys.fail('target'); return false; }
    c.data.ally = pick;
    return true;
  },
  fire(c) {
    const { caster, def, sys } = c;
    if (c.remote) { sys.vfx('heal_pillar', at(caster, 0.1), { scale: 0.8 }); return; }
    const ally = c.data.ally as Player | undefined;
    if (!ally || !ally.isDead || ally.removed) { sys.whiff(c); return; }
    const hpFrac = def.params?.hpFrac ?? 0.35;
    if (!ally.isLocal) {
      const peer = G.net?.peerOfEntity(ally.id);
      if (peer) G.net?.sendTo(peer, 'revive', { targetId: ally.id, hpFrac, sourceId: caster.id });
    }
    sys.vfx('heal_pillar', at(ally, 0.1), { scale: 1 });
    sys.sfx('heal_big', ally.position);
  },
};

/** Çiçeklenme: a ground heal zone on the aimed point. Every interval s for pulses pulses each living ally inside the radius
 *  is healed (def.heal.coef per pulse, Harmony applies). Remote casts heal nothing here (the owner's machine does it). */
const efflorescence: Behavior = {
  fire(c) {
    const { caster, def, sys } = c;
    if (c.remote) return;
    const p = def.params ?? {};
    const x = c.point[0], z = c.point[1];
    const y = groundAt(x, z) ?? caster.position.y;
    const radius = (def.radius ?? 6) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    const pulses = Math.max(1, Math.round(p.pulses ?? 6));
    const interval = p.interval ?? 2;
    sys.vfx('heal_loop', [x, y, z], { scale: radius / 3, duration: pulses * interval });
    for (let n = 0; n < pulses; n++) {
      sys.schedule(n * interval + 0.05, () => {
        if (caster.isDead) return;
        for (const a of G.world?.players ?? []) {
          if (a.isDead || a.removed) continue;
          if (Math.hypot(a.position.x - x, a.position.z - z) > radius + a.radius) continue;
          healAmount(caster, a, healFormula(caster, (def.heal?.coef ?? 0.6) * harmonyMul(caster, a) * c.more).amount);
          sys.vfx('heal_burst', at(a, a.height * 0.6), { scale: 0.5 });
        }
      });
    }
    sys.sfx('heal_big', [x, y, z]);
  },
};

Object.assign(BEHAVIORS_DRUID, {
  kit_druid_shift: shift,
  kit_druid_dot: dot,
  kit_druid_self: self,
  kit_druid_eclipse: eclipse,
  kit_druid_starfall: starfall,
  kit_druid_fury: fury,
  kit_druid_hot: hot,
  kit_druid_wild_growth: wildGrowth,
  kit_druid_swiftmend: swiftmend,
  kit_druid_tranq: tranq,
  kit_druid_rebirth: rebirth,
  kit_druid_efflorescence: efflorescence,
});

function installDruid(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_DRUID);
}

try {
  installDruid();
} catch {
  queueMicrotask(installDruid);
}
