/**
 * Keşiş behaviours (GDD_CLASSES_V2 §2.3–§2.10, NC49). Installed into BEHAVIORS by the import at the end of behaviors.ts
 * (microtask fallback, as in plateKit.ts). Owner: monk package. behaviors.ts is not edited.
 *
 * behaviour id      used by (monk skill ids)                    reads (SkillDef.params unless noted)
 * ----------------  ------------------------------------------  ---------------------------------------------------------------
 * monk_torpedo      monk_chi_torpedo (dash)                     the dash path (TARGETING dash) + def.selfStatuses (chi_flow)
 * monk_keg         monk_keg_smash (melee arc)                  refundPurify: seconds off monk_purifying_brew's cooldown
 * monk_fists       monk_fists_of_fury (channel cone)           the channel cone (BEHAVIORS.channel_cone) + def.selfStatuses (fists_guard)
 * monk_self        monk_ww_tigers_fury, monk_bm_fortifying_brew, monk_purifying_brew, monk_tigers_lust, monk_mw_thunder_tea
 *                  heal (fraction of max HP), purify (fraction of the Sarsma pool removed), def.selfStatuses
 * monk_storm       monk_ww_storm_earth_fire                    summons monk_clone_fire + monk_clone_earth (life 15), def.selfStatuses (empower)
 * monk_mw_channel  monk_mw_soothing_mist (2.5 s channel)       def.heal.coef per tick (ally), tick interval params.tick
 * monk_mw_hot      monk_mw_renewing_mist, monk_mw_enveloping_mist  def.heal.coef (immediate, optional), hotCoef per tick, tick (s),
 *                  def.statuses[0] = the HoT (magnitude HP/s; the `hot` rule ticks it)
 * monk_revival     monk_mw_revival (m90)                       def.heal.coef per ally, def.radius (party range), dispel (count)
 *
 * Reused from other files (BEHAVIORS keys, no copy): provoke (monk_provoke), chain_projectile (monk_chi_wave), leap
 * (monk_flying_serpent), channel_aoe (monk_spinning_crane), minion_summon (monk_bm_black_ox), heal_bolt (monk_mw_basic),
 * heal_aoe (monk_mw_vivify), heal_target (monk_mw_detox, dispel rows), self_buff (none of the monk rows need it).
 *
 * Not in the engine yet (listed in the monk report): the Sarsma pool accrual (Combat.hitLocalPlayer), the Akış trait (+8 %
 * attack speed at Çi >= 3), Stamp's pool reduction on the Kara Öküz, Renewing Mist's jumps, Thunder Tea's free and +50 % heals,
 * the Demci parry purge, and the 8 % per-hit pool cut. Their numbers are in params and are read here where possible.
 */
import { G } from '../../game/G';
import { BEHAVIORS, TARGETING_BEHAVIORS, type Behavior, type CastCtx } from './behaviors';
import { alliesInRange, dispelUpTo, healAlly, healAmount, healFormula, resolveHealTarget } from '../healing';
import { minionDef } from '../../data/minions';
import type { Actor } from '../../entities/Actor';
import type { Player } from '../../entities/Player';
import type { StatusId } from '../../types/skills';
import { sarsmaPurge } from '../sarsma';

/** Friendly pick of a heal (friendly target, crosshair ally, lowest HP in range, else the caster; healing.ts resolver). */
function healPick(c: CastCtx): Player {
  return resolveHealTarget(c.caster, c.aim, false) ?? c.caster;
}

/** The ally a stored pick still stands for: the caster when the pick died meanwhile. */
function pickedAlly(c: CastCtx): Player {
  const a = c.data.ally as Player | undefined;
  return a && !a.isDead && !a.removed ? a : c.caster;
}

/** Gives a status to an ally. A remote player gets the 'pstatus' message its owner applies (paladin giveStatus pattern). */
function giveStatus(c: CastCtx, target: Actor, status: StatusId, duration: number, magnitude: number): void {
  if (target.kind === 'player' && !(target as Player).isLocal) {
    const peer = G.net?.peerOfEntity(target.id);
    if (peer) G.net?.sendTo(peer, 'pstatus', { targetId: target.id, status, duration, magnitude, sourceId: c.caster.id });
    return;
  }
  target.statuses.apply(status, duration, { magnitude, sourceId: c.caster.id });
}

/** Removes `pct` of the Sarsma pool (GDD §1.11: Arındırıcı İksir takes 55 %). The pool lives in sarsma.ts; its drain is cut by the same share. */
function purgePool(a: Actor, pct: number): void {
  sarsmaPurge(a, pct);
}

// ---- Çi Torpedo: the dash of TARGETING dash, plus its self status (chi_flow 2.5 s). The dash fires no selfStatuses itself.
const torpedo: Behavior = {
  begin(c) {
    return TARGETING_BEHAVIORS.dash?.begin?.(c);
  },
  frame(c, dt, elapsed) {
    TARGETING_BEHAVIORS.dash?.frame?.(c, dt, elapsed);
  },
  fire(c) {
    TARGETING_BEHAVIORS.dash?.fire?.(c);
    c.sys.applySelf(c, c.def.selfStatuses ?? []);
  },
};

// ---- Fıçı Darbesi: the melee arc, plus the Arındırıcı İksir cooldown cut (refundPurify seconds, GDD §2.4 keg row).
const keg: Behavior = {
  begin(c) {
    return TARGETING_BEHAVIORS.melee_arc?.begin?.(c);
  },
  frame(c, dt, elapsed) {
    TARGETING_BEHAVIORS.melee_arc?.frame?.(c, dt, elapsed);
  },
  fire(c) {
    TARGETING_BEHAVIORS.melee_arc?.fire?.(c);
    const sec = c.def.params?.refundPurify ?? 0;
    if (!c.remote && sec > 0) c.sys.reduceCooldown(c.caster, 'monk_purifying_brew', sec);
  },
  end(c, reason) {
    TARGETING_BEHAVIORS.melee_arc?.end?.(c, reason);
  },
};

// ---- Cennet Yumrukları: the channel cone (sharedBehaviors channel_cone: ticks, then the finisher), plus fists_guard (-30 %).
const fists: Behavior = {
  fire(c) {
    BEHAVIORS.channel_cone?.fire?.(c);
    c.sys.applySelf(c, c.def.selfStatuses ?? []);
  },
  tick(c, n) {
    return BEHAVIORS.channel_cone?.tick?.(c, n);
  },
  end(c, reason) {
    BEHAVIORS.channel_cone?.end?.(c, reason);
  },
};

// ---- self buffs: the status list of the row (selfStatuses, applied here like selfBuff does), heal (fraction of max HP) and the
// Sarsma purge (fraction of the pool). Used by the majors, the brews, Kaplan Hırsı and Yıldırım Çayı.
const self: Behavior = {
  fire(c) {
    const { def, caster, sys } = c;
    const p = def.params ?? {};
    sys.applySelf(c, def.selfStatuses ?? []);
    if (c.remote) return;
    if (p.heal) healAmount(caster, caster, p.heal * caster.maxHp);
    if (p.purify) purgePool(caster, p.purify);
    sys.sfx('buff', caster.position);
  },
};

// ---- Ruh Kopyaları (m90): one row can name one minion only, so this summons the fire and the earth clone itself (both group
// `clone`, cap 2, 15 s), then gives the owner Storm's empower (selfStatuses, +10 %).
const storm: Behavior = {
  fire(c) {
    c.sys.applySelf(c, c.def.selfStatuses ?? []);
    if (c.remote) return;
    for (const id of ['monk_clone_fire', 'monk_clone_earth']) {
      const def = minionDef(id);
      if (def) G.minions.summon(c.caster, def, { count: 1, group: 'clone', life: 15 });
    }
  },
};

// ---- Uyandırıcı Sis (Soothing Mist): a 2.5 s channel that heals the picked ally every `params.tick` seconds (heal.coef each).
const mwChannel: Behavior = {
  begin(c) {
    if (!c.remote) c.data.ally = healPick(c);
    return true;
  },
  fire(c) {
    c.sys.sfx('buff', c.caster.position);
  },
  tick(c) {
    if (c.remote) return true;
    healAlly(c.caster, pickedAlly(c), c.def.heal?.coef ?? 0.35);
    return true;
  },
};

// ---- Sis Örgüsü HoTs (Renewing / Enveloping Mist): an immediate heal (optional), then a heal-over-time status whose magnitude is
// HP per second: hotCoef x W per `tick` seconds. Jumps (Renewing Mist, 3x) are not modelled (see the monk report).
const mwHot: Behavior = {
  begin(c) {
    if (!c.remote) c.data.ally = healPick(c);
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const target = pickedAlly(c);
    if (c.def.heal?.coef) healAlly(c.caster, target, c.def.heal.coef);
    const st = c.def.statuses?.[0];
    if (st && p.hotCoef) {
      const perSec = healFormula(c.caster, p.hotCoef).amount / (p.tick ?? 2);
      giveStatus(c, target, st.status, st.duration, perSec);
    }
    c.sys.sfx('buff', c.caster.position);
  },
};

// ---- Diriliş (m90): an instant party heal (heal.coef per ally) inside `def.radius`, plus a dispel of `params.dispel`
// debuffs per ally. The caster counts as a party member.
const revival: Behavior = {
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const list = alliesInRange(c.caster, c.def.radius ?? 12);
    if (!list.includes(c.caster)) list.push(c.caster);
    for (const a of list) {
      healAlly(c.caster, a, c.def.heal?.coef ?? 3);
      if (p.dispel) dispelUpTo(a, Math.round(p.dispel));
    }
    c.sys.sfx('buff', c.caster.position);
  },
};

// ---- Sheilun'un Armağanı (Mistweaver): spends every sheilun_gift stack; each of the (up to) maxTargets most injured allies within
// the radius (the caster included) is healed for perStack x stacks. Nothing to spend fails the cast (no cost, no cooldown).
const sheilunGift: Behavior = {
  begin(c) {
    if (c.remote) return true;
    if (c.caster.statuses.stacks('sheilun_gift') <= 0) { c.sys.fail('target'); return false; }
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const stacks = c.caster.statuses.stacks('sheilun_gift');
    if (stacks <= 0) return;
    c.caster.statuses.remove('sheilun_gift');
    const p = c.def.params ?? {};
    const pool: Actor[] = [c.caster, ...alliesInRange(c.caster, p.radius ?? 25)]
      .filter((a, i, arr) => arr.indexOf(a) === i && !a.isDead && !a.removed && a.hp < a.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
      .slice(0, Math.max(1, Math.round(p.maxTargets ?? 5)));
    for (const a of pool) healAlly(c.caster, a as Player, (p.perStack ?? 0.6) * stacks);
    c.sys.sfx('buff', c.caster.position);
  },
};

export const BEHAVIORS_MONK: Record<string, Behavior> = {
  monk_sheilun_gift: sheilunGift,
  monk_torpedo: torpedo,
  monk_keg: keg,
  monk_fists: fists,
  monk_self: self,
  monk_storm: storm,
  monk_mw_channel: mwChannel,
  monk_mw_hot: mwHot,
  monk_revival: revival,
};

function installMonk(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_MONK);
}

try {
  installMonk();
} catch {
  queueMicrotask(installMonk);
}
