/**
 * AE-3 (docs/kits/agile-evoker.md §3 + the WoW Midnight Yutucu): İblis Avcısı kit behaviours, installed into BEHAVIORS by the import at the
 * end of behaviors.ts (microtask fallback, as in warlockKit.ts). All ids carry the `kit_` prefix, so SkillSystem.makeCtx resolves the soft
 * target for them and applies `selfStatuses` after `fire` (behaviors.ts isKitBehavior / selfStatusesByDispatch).
 *   kit_dh_beam          Göz Işını / Boşluk Işını / Boşluk Fırtınası / Fel Yıkımı: channel, per-tick strike along the CURRENT facing (line of `width`
 *                        or cone of `arc`), optional per-second cost (`costPerSec`), heal (`healPct` of max HP over the channel), Kör Gazap (`furyEnd`)
 *   kit_dh_aura          Yakıp Yok Etme Aurası: `ticks` fire pulses around the caster's current position
 *   kit_dh_metamorphosis Metamorfoz: impact AoE + (via the row) the metamorphosis status; optional heal of the extra max HP
 *   kit_dh_void_meta     Boşluk Metamorfozu: 4 fragments in (pip cost), void_meta status (drain is Combat's 'fury' rule), Gazap burst, nova
 *   kit_dh_retreat       İntikam Geri Çekilişi: hop back, strike the take-off spot, iframes
 *   kit_dh_soul_cleave   Ruh Yarma: melee cone + self heal that grows with the swallowed fragment
 *   kit_dh_spirit_bomb   Ruh Bombası: AoE, heal when it hits enough enemies
 *   kit_dh_reap          Biç: AoE that swallows every fragment, Gazap per fragment
 *   kit_dh_collapsing_star Çöken Yıldız: only in void_meta, +20 % per earlier use (collapsing_star stacks)
 *   kit_dh_darkness      Karanlık: 8 s ground zone, allies inside take less damage
 *   kit_dh_leap_sigil    İnfernal Atılış: the shared leap, then a delayed Alev Mührü pulse at the landing point
 *   kit_dh_hunt          Av: the shared homing dash (the row's selfStatuses are applied after `fire`)
 */
import { G } from '../../game/G';
import { clamp } from '../../core/utils';
import { vfxScale } from '../feel';
import { healAmount } from '../healing';
import { BEHAVIORS, TARGETING_BEHAVIORS, at, castTarget, enemiesIn, groundAt, strikeMany, type Behavior, type CastCtx } from './behaviors';
import { TALENT_PIPS } from '../../data/specs_talents';
import type { PipDef } from '../../types/classes';
import type { Enemy } from '../../entities/Enemy';
import type { DamageResult } from '../Combat';
import type { VfxId } from '../../types/vfx';

export const BEHAVIORS_KIT_DEMONHUNTER: Record<string, Behavior> = {};

// ---- Ruh Parçacığı pip (agile-evoker §3.0): max 6, drains slowly out of combat; at 5+ the hidden status soul_overflow turns Ruh Yarma into Ruh Bombası
const SOUL_PIP: PipDef = {
  id: 'soul', name: 'Ruh Parçacığı', max: 6, color: '#b8ff9a', icon: 'skill-life-drain',
  decay: { after: 12, every: 4 }, statusAt: { min: 5, status: 'soul_overflow' },
};
if (!TALENT_PIPS.soul) Object.assign(TALENT_PIPS, { soul: SOUL_PIP });

// ---------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------

/** The caster's current facing (the beam follows the camera / body, the cast direction is only the start). */
const facing = (c: CastCtx): [number, number] => [Math.sin(c.caster.yaw), Math.cos(c.caster.yaw)];

/** Fury (Gazap) gain with the generation multipliers; remote replays never gain. */
function gainFury(c: CastCtx, n: number): void {
  if (c.remote || n <= 0) return;
  c.sys.gainResource(c.caster, n);
}

// ---------------------------------------------------------------------------------------------------------
// kit_dh_beam
// ---------------------------------------------------------------------------------------------------------

const beam: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const dir = facing(c);
    const dur = def.channel ?? 2;
    const id = (def.vfx?.cast ?? 'essence_beam') as VfxId;
    sys.vfx(id, [caster.position.x + dir[0] * 0.5, caster.position.y + 1.45, caster.position.z + dir[1] * 0.5], {
      dir: [dir[0], 0, dir[1]], follow: caster.object3d, duration: dur, scale: clamp((def.range ?? 18) / 9, 0.8, 2.4),
    });
    sys.sfx('eye_beam_loop', caster.position);
    if (c.remote) return;
    if (p.unstoppable) caster.statuses.addImmunity('cc', dur + 0.2);
    // number of ticks this channel will run (the first tick fires at the opening frame): the heal is spread over them
    const every = (p.tick ?? 0.5) / Math.max(0.3, sys.speedFactor(caster, def));
    c.data.ticks = Math.max(1, Math.floor((dur - 0.001) / every) + 1);
  },
  tick(c, n) {
    const { caster, sys, def } = c;
    if (c.remote) return true;
    const p = def.params ?? {};
    const every = (p.tick ?? 0.5) / Math.max(0.3, sys.speedFactor(caster, def));
    // per-second cost (Boşluk Fırtınası): the opening tick is free, a tick the bar cannot pay ends the channel
    if (n > 0 && (p.costPerSec ?? 0) > 0 && !sys.spend(caster, p.costPerSec * every * sys.costMult(caster, def))) return false;
    sys.actSlow(caster, p.moveSlow ?? 0.6, every + 0.12);
    const dir = facing(c);
    const range = def.range ?? 18;
    let list: Enemy[];
    if ((def.arc ?? 0) > 0) list = sys.enemiesInCone(caster, dir, range, def.arc as number);
    else {
      list = (G.world?.actorsInLine({ x: caster.position.x, z: caster.position.z }, { x: dir[0], z: dir[1] }, range, p.width ?? 2, (a) => a.team === 'enemy' && !a.isDead, caster.position.y) ?? []) as unknown as Enemy[];
    }
    list = list.slice(0, Math.max(1, Math.round(p.maxTargets ?? 5)));
    const res: DamageResult[] = [];
    for (const e of list) {
      const r = sys.strike(c, e, { tick: true, noGain: true, noHitstop: true, dir: sys.dirTo(caster, e), statuses: [] });
      if (r) res.push(r);
      sys.vfx('hit_magic', at(e, e.height * 0.5), { scale: 0.5, color: def.damage?.type === 'fire' ? 0xff7a30 : 0xb06bff });
    }
    if (res.length) sys.afterHits(c, res);
    if ((p.healPct ?? 0) > 0) healAmount(caster, caster, caster.maxHp * (p.healPct / ((c.data.ticks as number | undefined) ?? 4)));
    sys.shake(0.05, 0.1);
    return true;
  },
  end(c, reason) {
    // Kör Gazap: a beam that ran to its end pays back Gazap
    if (reason !== 'done') return;
    gainFury(c, c.def.params?.furyEnd ?? 0);
  },
};

// ---------------------------------------------------------------------------------------------------------
// kit_dh_aura
// ---------------------------------------------------------------------------------------------------------

const aura: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const radius = (def.radius ?? 7) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    const ticks = Math.max(1, Math.round(p.ticks ?? 6));
    const interval = p.interval ?? 1;
    sys.vfx('fire_ground', at(caster, 0.1), { follow: caster.object3d, duration: ticks * interval, scale: vfxScale('fire_ground', radius) });
    sys.vfx((def.vfx?.cast ?? 'sigil_ground') as VfxId, at(caster, 0.1), { scale: 0.9 });
    sys.sfx('fire_cast', caster.position);
    if (c.remote) return;
    for (let n = 0; n < ticks; n++) {
      sys.schedule(n * interval, () => {
        if (caster.isDead) return;
        const list = enemiesIn(caster.position.x, caster.position.z, radius, caster.position.y).filter((e) => !e.isDead).slice(0, Math.round(p.maxTargets ?? 8));
        for (const e of list) sys.strike(c, e, { tick: true, noGain: true, noHitstop: true, dir: sys.dirTo(caster, e), statuses: [] });
      });
    }
  },
};

// ---------------------------------------------------------------------------------------------------------
// kit_dh_metamorphosis / kit_dh_void_meta
// ---------------------------------------------------------------------------------------------------------

const metamorphosis: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const radius = (def.radius ?? 5) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    const fire = def.damage?.type === 'fire';
    sys.vfx((def.vfx?.cast ?? 'fel_wings') as VfxId, at(caster, 0.1), { follow: caster.object3d, duration: 2, scale: 1.3 });
    sys.vfx('enrage_aura', at(caster, 0.1), { follow: caster.object3d, duration: 1.5, scale: 1.2, color: fire ? 0xff7a30 : 0x9cff4a });
    sys.vfx('shockwave', [caster.position.x, 0.1, caster.position.z], { scale: vfxScale('shockwave', radius), color: fire ? 0xff7a30 : 0xb06bff });
    sys.sfx('demon_summon', caster.position);
    sys.sfx('boss_roar', caster.position, { volume: 0.4 });
    sys.shake(0.4, 0.3);
    if (c.remote) return;
    const hp = def.params?.healMaxPct ?? 0;
    if (hp > 0) healAmount(caster, caster, caster.maxHp * hp);
    strikeMany(c, enemiesIn(caster.position.x, caster.position.z, radius, caster.position.y), def.params?.maxTargets ?? 99, { noGain: true });
  },
};

/** The Metamorfoz costs 4 fragments (the row's pip.cost, checked by SkillSystem); nothing else gates it. */
const voidMeta: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const radius = (def.radius ?? 6) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    sys.vfx('fel_wings', at(caster, 0.1), { follow: caster.object3d, duration: 2, scale: 1.3, color: 0xb06bff });
    sys.vfx('void_burst', [caster.position.x, caster.position.y + 0.2, caster.position.z], { scale: vfxScale('shockwave', radius) });
    sys.sfx('demon_summon', caster.position);
    sys.shake(0.4, 0.3);
    if (c.remote) return;
    // a fresh form starts a fresh Çöken Yıldız series
    caster.statuses.remove('collapsing_star');
    gainFury(c, def.params?.furyGain ?? 40);
    strikeMany(c, enemiesIn(caster.position.x, caster.position.z, radius, caster.position.y), 99, { noGain: true });
  },
};

// ---------------------------------------------------------------------------------------------------------
// kit_dh_retreat
// ---------------------------------------------------------------------------------------------------------

const retreat: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const back: [number, number] = [-c.dir[0], -c.dir[1]];
    sys.vfx('fel_aura', at(caster, 0.1), { scale: 1.1, duration: 0.8 });
    sys.vfx('dodge_dust', at(caster, 0.1), { scale: 0.9 });
    sys.sfx('whoosh', caster.position);
    if (c.remote) return;
    strikeMany(c, enemiesIn(caster.position.x, caster.position.z, def.radius ?? 6, caster.position.y), 99, { knockback: 1.5, noGain: true });
    caster.statuses.apply('iframes', p.iframes ?? 0.25, { sourceId: caster.id });
    sys.lunge(caster, back, p.back ?? 8, p.backDur ?? 0.28);
  },
};

// ---------------------------------------------------------------------------------------------------------
// İntikam: Ruh Yarma, Ruh Bombası
// ---------------------------------------------------------------------------------------------------------

const soulCleave: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    // the melee cone strikes with the fragment bonus (coefPerPip x swallowed), the heal grows the same way
    TARGETING_BEHAVIORS.melee_arc.fire(c);
    if (c.remote) return;
    const p = def.params ?? {};
    const spent = (c.data.pipSpent as number | undefined) ?? 0;
    healAmount(caster, caster, caster.maxHp * (p.healPct ?? 0.033) * (1 + (p.healPerPip ?? 0.4) * Math.min(1, spent)));
    sys.vfx('heal_burst', at(caster, 1.1), { scale: 0.6 });
  },
};

const spiritBomb: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const radius = (def.radius ?? 7) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    sys.vfx('soul_fragment_orb', at(caster, 1.2), { scale: 1.2, duration: 0.6 });
    sys.vfx('fire_burst', [caster.position.x, caster.position.y + 0.1, caster.position.z], { scale: vfxScale('fire_burst', radius) });
    sys.ring(caster.position.x, caster.position.z, radius, 0xb8ff9a);
    sys.sfx('fel_impact', caster.position);
    sys.shake(0.25, 0.2);
    if (c.remote) return;
    const res = strikeMany(c, enemiesIn(caster.position.x, caster.position.z, radius, caster.position.y), p.maxTargets ?? 8, { noGain: true });
    if (res.length >= (p.healMin ?? 3)) {
      healAmount(caster, caster, caster.maxHp * (p.healPct ?? 0.06));
      sys.vfx('heal_burst', at(caster, 1.1), { scale: 0.9 });
    }
  },
};

// ---------------------------------------------------------------------------------------------------------
// Yutucu: Biç, Çöken Yıldız
// ---------------------------------------------------------------------------------------------------------

const reap: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const radius = (def.radius ?? 8) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    sys.vfx('void_burst', [caster.position.x, caster.position.y + 0.15, caster.position.z], { scale: vfxScale('shadow_burst', radius) });
    sys.vfx('soul_fragment_orb', at(caster, 1.2), { scale: 1.1, duration: 0.5 });
    sys.ring(caster.position.x, caster.position.z, radius, 0xb06bff);
    sys.sfx('shadow_cast', caster.position);
    if (c.remote) return;
    const spent = (c.data.pipSpent as number | undefined) ?? 0;
    // coefficient: the row's base plus pip.coefPerPip per swallowed fragment (SkillSystem.strike)
    const res = strikeMany(c, enemiesIn(caster.position.x, caster.position.z, radius, caster.position.y), p.maxTargets ?? 8, { noGain: true });
    if (res.length === 0) sys.whiff(c);
    gainFury(c, (p.furyPerPip ?? 4) * spent);
  },
};

const collapsingStar: Behavior = {
  begin(c) {
    if (c.remote) return true;
    // only in the void form (the glow rule of void_meta lights the button)
    if (!c.caster.statuses.has('void_meta')) { c.sys.fail('resource'); return false; }
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const t = castTarget(c);
    const x = t ? t.position.x : c.point[0];
    const z = t ? t.position.z : c.point[1];
    const y = groundAt(x, z) ?? caster.position.y;
    const radius = (def.radius ?? 6) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    sys.vfx('meteor_fall', [x, y, z], { scale: 0.9, color: 0xb06bff });
    sys.vfx('void_burst', [x, y + 0.1, z], { scale: vfxScale('shadow_burst', radius) });
    sys.ring(x, z, radius, 0xb06bff);
    sys.sfx('explosion', [x, y, z]);
    sys.shake(0.35, 0.3);
    sys.hitstopMs(60);
    if (c.remote) return;
    const stacks = caster.statuses.get('collapsing_star')?.stacks ?? 0;
    const more = 1 + (p.perStack ?? 0.2) * Math.min(stacks, p.maxStacks ?? 10);
    strikeMany(c, enemiesIn(x, z, radius, y), p.maxTargets ?? 8, { more, noGain: true });
    // the row's selfStatuses (collapsing_star) add the next stack after this fire
  },
};

// ---------------------------------------------------------------------------------------------------------
// Karanlık, İnfernal Atılış, Av
// ---------------------------------------------------------------------------------------------------------

const darkness: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const radius = (def.radius ?? 8) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    const dur = def.params?.dur ?? 8;
    const x = caster.position.x, z = caster.position.z;
    sys.vfx('shadow_ground', [x, 0.05, z], { scale: vfxScale('shadow_ground', radius), duration: dur });
    sys.vfx('void_burst', [x, 0.1, z], { scale: 0.9 });
    sys.ring(x, z, radius, 0x6a3ab0);
    sys.sfx('shadow_cast', caster.position);
    if (c.remote) return;
    sys.addZone({
      x, z, radius, duration: dur, tick: 1, t: 0, next: 0.05,
      onTick: (zn) => { sys.applyPartyAt(c, 'darkness', 1.6, 0, zn.x, zn.z, radius); },
    });
  },
};

const leapSigil: Behavior = {
  begin: (c) => TARGETING_BEHAVIORS.leap.begin?.(c),
  frame: (c, dt, el) => TARGETING_BEHAVIORS.leap.frame?.(c, dt, el),
  fire(c) {
    TARGETING_BEHAVIORS.leap.fire(c);
    const { sys, def } = c;
    const p = def.params ?? {};
    const land = c.data.land as [number, number] | undefined;
    const x = land?.[0] ?? c.caster.position.x, z = land?.[1] ?? c.caster.position.z;
    const y = groundAt(x, z) ?? c.caster.position.y;
    const radius = p.sigilRadius ?? 5;
    sys.vfx('sigil_ground', [x, y + 0.05, z], { scale: vfxScale('fire_ground', radius), duration: p.sigilDelay ?? 2 });
    if (c.remote) return;
    sys.schedule(p.sigilDelay ?? 2, () => {
      sys.vfx('fire_burst', [x, y + 0.1, z], { scale: vfxScale('fire_burst', radius) });
      for (const e of enemiesIn(x, z, radius, y)) {
        if (e.isDead) continue;
        sys.strike(c, e, { coef: p.sigilCoef ?? 0.65, noGain: true, noHitstop: true, statuses: [{ status: 'burn', duration: 4, magnitude: 0.35 }] });
      }
    });
  },
  end: (c, r) => TARGETING_BEHAVIORS.leap.end?.(c, r),
};

/** Av: the shared homing dash (behaviors.ts `dash`), plus the row's selfStatuses (a kit_ id gets them applied after `fire`). */
const hunt: Behavior = {
  begin: (c) => TARGETING_BEHAVIORS.dash.begin?.(c),
  frame: (c, dt, el) => TARGETING_BEHAVIORS.dash.frame?.(c, dt, el),
  fire: (c) => TARGETING_BEHAVIORS.dash.fire(c),
};

Object.assign(BEHAVIORS_KIT_DEMONHUNTER, {
  kit_dh_hunt: hunt,
  kit_dh_beam: beam,
  kit_dh_aura: aura,
  kit_dh_metamorphosis: metamorphosis,
  kit_dh_void_meta: voidMeta,
  kit_dh_retreat: retreat,
  kit_dh_soul_cleave: soulCleave,
  kit_dh_spirit_bomb: spiritBomb,
  kit_dh_reap: reap,
  kit_dh_collapsing_star: collapsingStar,
  kit_dh_darkness: darkness,
  kit_dh_leap_sigil: leapSigil,
});

function installKitDemonhunter(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_KIT_DEMONHUNTER);
}

try {
  installKitDemonhunter();
} catch {
  queueMicrotask(installKitDemonhunter);
}
