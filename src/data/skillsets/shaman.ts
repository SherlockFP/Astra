/**
 * Şaman (shaman) class-level skillset (WoW Midnight reference: docs/WOW_ABILITY_MAP.md, section 12). Class rows: the Şimşek
 * auto attack, Yıldırım Oku (Lightning Bolt), Hayalet Kurt (Ghost Wolf), Rüzgâr Kesişi (Wind Shear), Kan Coşkusu (Bloodlust),
 * Astral Kayma (Astral Shift) and Lanet (Hex). The spec-bound rows are in shamanSpecs.ts.
 * Pip: `maelstrom` = Girdap (class secondary, 0-100). Mana is the resource (CLASSES.shaman.resource).
 * Cast and cooldown numbers are picks (no reference table in the repo); the WoW names and levels are indicative.
 * OWNER: shaman kit.
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerShaman(add: SkillAdd): void {
  // ---- Auto attack (lmb, Elementel default): one lightning bolt, +8 Girdap on hit. Geliştirme and Restorasyon replace it with their own basic.
  add({
    id: 'shaman_basic', classId: 'shaman', name: 'Şimşek Atışı (Auto Attack)', icon: I('skill-lightning-bolt'), defaultSlot: 'lmb',
    desc: 'Tek bir şimşek fırlatırsın. Vuruşu Girdap kazandırır.',
    anim: 'Spellcast_Shoot', targeting: 'projectile', range: 25, tags: ['spell', 'basic', 'projectile', 'lightning'],
    speed: 40, radius: 0.3, count: 1, pierce: 0, damage: { coef: 1.0, type: 'lightning' }, hitTime: 0.4,
    pip: { id: 'maelstrom', gain: 8 },
    params: { end: 0.6, chain: 0.03, move: 0.1, stagger: 2, proc: 0.5, weight: 0 },
  });

  // ---- Yıldırım Oku (Lightning Bolt, rmb, L1): a cast bolt, the shaman's main filler (Girdap +8)
  add({
    id: 'shaman_lightning_bolt', classId: 'shaman', name: 'Yıldırım Oku (Lightning Bolt)', icon: I('skill-lightning-bolt'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: '1.5 saniyede bir yıldırım okunu fırlatır; %240 yıldırım hasarı verir ve 8 Girdap kazandırır.',
    cost: 12, cooldown: 0, castTime: 1.5, hitTime: 1.5, anim: 'Spellcast_Shoot', animSpeed: 1.2,
    targeting: 'projectile', range: 30, speed: 30, radius: 0.4, count: 1, pierce: 0,
    damage: { coef: 2.4, type: 'lightning' }, pip: { id: 'maelstrom', gain: 8 },
    tags: ['spell', 'projectile', 'lightning'], vfx: { projectile: 'chi_projectile', impact: 'hit_spark' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 4, proc: 0.8, weight: 0, upper: 0 },
  });

  // ---- Hayalet Kurt (Ghost Wolf, q, L1): 15 s +40 % move speed, removes slow and root
  add({
    id: 'shaman_ghost_wolf', classId: 'shaman', name: 'Hayalet Kurt (Ghost Wolf)', icon: I('buff-haste'), unlockLevel: 1, defaultSlot: 'q',
    desc: '15 saniye boyunca kurt biçimine girersin: hareket hızın %40 artar ve yavaşlatma ile kök etkilerinden kurtulursun.',
    cost: 10, cooldown: 20, castTime: 0, hitTime: 0.2, anim: 'Running_A', animSpeed: 1.4,
    targeting: 'self_buff', selfStatuses: [{ status: 'ghost_wolf', duration: 15 }], cleanses: ['slow', 'root'],
    tags: ['buff', 'movement'], vfx: { cast: 'haste_trail' }, sfx: { cast: 'buff' },
    params: { end: 0.6, chain: 0.05, move: 0.1, weight: 0, cleanse: 1 },
  });

  // ---- Rüzgâr Kesişi (Wind Shear, s4, L1): ranged interrupt, silences the cast for 3 s (shared `interrupt` behaviour)
  add({
    id: 'shaman_wind_shear', classId: 'shaman', name: 'Rüzgâr Kesişi (Wind Shear)', icon: I('skill-quick-slash'), unlockLevel: 1, defaultSlot: 's4',
    desc: 'Uzaktan bir rüzgâr kesişi atarsın: hedefin büyüsünü keser ve 3 saniye sustururken, bu yetenek 4 saniye kilitlenir.',
    cost: 6, cooldown: 12, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'melee_arc', range: 25, arc: 360, damage: { coef: 0.3, type: 'lightning' },
    behavior: 'interrupt', tags: ['spell', 'kick', 'interrupt'], vfx: { impact: 'hit_spark' }, sfx: { cast: 'swing_light', impact: 'punch_hit' },
    params: { end: 0.5, chain: 0.05, move: 0.05, stagger: 3, weight: 0, silence: 3, stun: 0 },
  });

  // ---- Kan Coşkusu (Bloodlust, r, L25): party-wide haste for 30 s within 12 m (cooldown 120 s; Heroism is the same spell for the other faction)
  add({
    id: 'shaman_bloodlust', classId: 'shaman', name: 'Kan Coşkusu (Bloodlust)', icon: I('skill-berserk'), unlockLevel: 25, defaultSlot: 'r',
    desc: 'Yakındaki müttefiklerin 30 saniye boyunca %30 daha hızlı vurur ve %20 daha hızlı koşar.',
    cost: 0, cooldown: 120, castTime: 0, hitTime: 0.3, anim: 'Cheer', animSpeed: 1.6,
    targeting: 'self_buff', radius: 12, selfStatuses: [{ status: 'bloodlust', duration: 30 }],
    tags: ['buff', 'party'], vfx: { cast: 'haste_trail' }, sfx: { cast: 'war_cry' },
    params: { end: 0.7, chain: 0.1, move: 0.15, weight: 0 },
  });

  // ---- Astral Kayma (Astral Shift, s3, L10): 40 % damage reduction for 8 s, 90 s cooldown (the personal defensive)
  add({
    id: 'shaman_astral_shift', classId: 'shaman', name: 'Astral Kayma (Astral Shift)', icon: I('buff-absorb'), unlockLevel: 1, defaultSlot: 's3',
    desc: '8 saniye boyunca aldığın hasar %40 azalır. 90 saniyede bir kullanılır.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.2, anim: 'Cheer', animSpeed: 1.2,
    targeting: 'self_buff', selfStatuses: [{ status: 'astral_shift', duration: 8 }],
    tags: ['buff', 'defensive'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
    params: { end: 0.6, chain: 0.05, move: 0.1, weight: 0 },
  });

  // ---- Lanet (Hex, L15): a 6 s hard incapacitate on an enemy (a frog). The projectile's small hit breaks nothing.
  add({
    id: 'shaman_hex', classId: 'shaman', name: 'Lanet (Hex)', icon: I('debuff-silence'), unlockLevel: 15,
    desc: 'Bir düşmanı 6 saniye boyunca bir kurbağaya çevirirsin: hareket edemez ve hiçbir şey yapamaz.',
    cost: 14, cooldown: 30, castTime: 1.5, hitTime: 1.5, anim: 'Spellcast_Shoot', animSpeed: 1.0,
    targeting: 'projectile', range: 25, speed: 30, radius: 0.4, count: 1,
    damage: { coef: 0.2, type: 'shadow' }, statuses: [{ status: 'hex', duration: 6 }],
    tags: ['spell', 'projectile', 'cc', 'hex'], vfx: { projectile: 'chi_projectile', impact: 'hit_spark' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 2, weight: 0 },
  });
}
