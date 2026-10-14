/**
 * Ejderhasoy class rows (AE-4, docs/kits/agile-evoker.md §4.0-§4.3; WoW Midnight 12.0 Evoker): the weapon chain `evoker_basic` (+ steps)
 * and the rows shared by the three specs. These are the 8 ids of ClassDef.skills (a level-1 character without a spec has Yaşayan Alev,
 * Parçala and Ateş Nefesi on rmb / q / e from level 1, then Pyre, Süzül, Bastır, Obsidyen Pullar and Ejder Öfkesi) plus the m180 hero row.
 * Spec-only rows (Ebedi Dalga, Geri Dönüş, Püskürme, ...) live in evokerSpecs.ts; the per-spec numbers of the shared rows (Koruyucu's
 * Yaşayan Alev heal, Yüceltme's Ateş Nefesi) are SpecDef.mods patches (data/specs_kit_evoker.ts).
 *
 * Mana costs are percent of the 100-unit bar. Öz (essence) is a pip: `pip { id: 'essence', cost: 3 }` (proc mod pipFree = Öz Patlaması).
 * Empowered rows (`kit_empower`) are channels the key is held on: `channel 2`, `params.hold1..3` are the rank thresholds in seconds
 * (divided by haste), `params.kind` 1 Ateş Nefesi / 2 Ebedi Dalga / 3 Rüya Nefesi / 4 Yer Sarsıntısı (combat/skills/evokerKit.ts).
 * Called once by data/skills.ts with its local add().
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerEvoker(add: SkillAdd): void {
  // ======================================================================================================
  // Azur Darbesi (evoker_basic): 3-step ranged frost chain (every step an azure crescent, pierce 2 = the target and two behind it).
  // 0.10 / 0.10 / 0.14 = 0.34 per chain (doc 4.0). Finisher 6 % +1 Öz and the 1 % Öz Patlaması are spec fx rows.
  // ======================================================================================================
  add({
    id: 'evoker_basic', classId: 'evoker', name: 'Azur Darbesi', icon: I('skill-ice-lance'), defaultSlot: 'lmb',
    desc: 'Asandan üç hilal şeklinde mavi dalga fırlatırsın: her dalga hedefin ve arkasındaki iki düşmanın içinden geçer. Son vuruş %6 ihtimalle 1 Öz kazandırır.',
    anim: 'Spellcast_Shoot', targeting: 'projectile', range: 25, tags: ['spell', 'basic', 'combo', 'projectile', 'frost', 'ranged'],
    behavior: 'combo', params: { steps: 3, reset: 0.8 },
  });
  add({
    id: 'evoker_basic_1', classId: 'evoker', name: 'Mavi Pençe', icon: I('skill-ice-lance'),
    desc: 'İlk mavi hilal.', anim: 'Spellcast_Shoot', animSpeed: 2.0, hitTime: 0.30, targeting: 'target_projectile',
    range: 25, speed: 40, radius: 0.4, count: 1, pierce: 2, damage: { coef: 0.10, type: 'frost' }, knockback: 0.3,
    tags: ['spell', 'basic', 'projectile', 'frost', 'ranged'], vfx: { cast: 'frost_burst', projectile: 'frost_projectile', impact: 'hit_magic' },
    sfx: { cast: 'frost_cast', impact: 'frost_impact' },
    params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 2, weight: 0, upper: 1, slow: 0.4, step: 1, hand: 0, proc: 0.5 },
  });
  add({
    id: 'evoker_basic_2', classId: 'evoker', name: 'Mavi Pençe', icon: I('skill-ice-lance'),
    desc: 'İkinci mavi hilal.', anim: 'Spellcast_Shoot', animSpeed: 1.8, hitTime: 0.35, targeting: 'target_projectile',
    range: 25, speed: 40, radius: 0.4, count: 1, pierce: 2, damage: { coef: 0.10, type: 'frost' }, knockback: 0.3,
    tags: ['spell', 'basic', 'projectile', 'frost', 'ranged'], vfx: { cast: 'frost_burst', projectile: 'frost_projectile', impact: 'hit_magic' },
    sfx: { cast: 'frost_cast', impact: 'frost_impact' },
    params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 2, weight: 0, upper: 1, slow: 0.4, step: 2, hand: 1, proc: 0.5 },
  });
  add({
    id: 'evoker_basic_3', classId: 'evoker', name: 'Azur Süpürmesi', icon: I('skill-frost-nova'),
    desc: 'Geniş mavi hilal: önündeki hedefin ve arkasındaki iki düşmanın içinden geçer. Öz kazandırabilir.', anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.45,
    targeting: 'target_projectile', range: 25, speed: 36, radius: 0.9, count: 1, pierce: 2, damage: { coef: 0.14, type: 'frost' }, knockback: 0.8,
    tags: ['spell', 'basic', 'projectile', 'frost', 'finisher', 'ranged'], vfx: { cast: 'frost_nova', projectile: 'frost_projectile', impact: 'frost_burst' },
    sfx: { cast: 'frost_cast', impact: 'ice_chime' },
    params: { end: 0.95, chain: 0.05, move: 0.12, stagger: 6, weight: 1, upper: 0, slow: 0.5, step: 3, finisher: 1, proc: 0.8 },
  });

  // ======================================================================================================
  // Rmb: Yaşayan Alev (class row = Yıkım Nefesi's damage form; Koruyucu patches in the heal half, Yüceltme the 0.75 + Öz gain)
  // ======================================================================================================
  add({
    id: 'evoker_living_flame', classId: 'evoker', name: 'Yaşayan Alev', icon: I('skill-fireball'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: '1.6 saniyelik büyüyle hedefi izleyen bir ateş topu fırlatırsın: %100 ateş hasarı verir. Sıçrayan Alevler yükü başına bir düşmana daha uçar. Alev Tükenişi varken anında ve %30 güçlü atılır. %2.5 Mana harcar.',
    cost: 2.5, cooldown: 0, castTime: 1.6, anim: 'Spellcast_Shoot', animSpeed: 1.15, hitTime: 0.373, targeting: 'target_projectile', behavior: 'kit_living_flame',
    range: 25, speed: 28, radius: 0.45, homing: 5, damage: { coef: 1.0, type: 'fire' }, allyTarget: 'any',
    tags: ['spell', 'fire', 'projectile', 'builder'], vfx: { cast: 'fire_burst', projectile: 'fire_projectile', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
    params: { end: 0.9, chain: 0.05, move: 0.1, stagger: 3, weight: 0, proc: 1 },
  });

  // ======================================================================================================
  // Q: Parçala (channel 2.4 s, 3 Öz, 2.9 arcane in total over the ticks; Öz Patlaması makes it free)
  // ======================================================================================================
  add({
    id: 'evoker_disintegrate', classId: 'evoker', name: 'Parçala', icon: I('skill-arcane-missiles'), unlockLevel: 1, defaultSlot: 'q',
    desc: '2.4 saniye boyunca hedefine kesintisiz bir Öz ışını yöneltirsin: toplam %290 gizem hasarı. 3 Öz harcar; Öz Patlaması varken bedavadır. Gökkuşağı yükü hasarı %20 artırır. Süzül varken yürüyerek de kanalize edebilirsin.',
    cost: 0, cooldown: 0, castTime: 0, channel: 2.4, anim: 'Spellcasting', animSpeed: 1, hitTime: 0.1, targeting: 'custom', behavior: 'kit_essence_beam',
    range: 25, radius: 1.0, damage: { coef: 2.9, type: 'arcane' }, pip: { id: 'essence', cost: 3 },
    tags: ['spell', 'arcane', 'channel', 'spender', 'ranged'], vfx: { cast: 'essence_beam', impact: 'arcane_burst' }, sfx: { cast: 'eye_beam_loop', impact: 'arcane_impact' },
    params: { tick: 0.6, moveSlow: 0.5, fixed: 1, stagger: 2, weight: 0, proc: 0.5 },
  });

  // ======================================================================================================
  // E: Ateş Nefesi (empowered hold, kind 1). Initial 2.4 fire + burn 3.2 (magnitude 1.333) = 5.6; ranks x1 / x1.25 / x1.55
  // ======================================================================================================
  add({
    id: 'evoker_fire_breath', classId: 'evoker', name: 'Ateş Nefesi', icon: I('skill-fire-breath'), unlockLevel: 1, defaultSlot: 'e',
    desc: 'Tuşu basılı tut: nefesin üç kademe güçlenir (0.67 / 1.33 / 2 saniye). Bırakınca önündeki konide ateş yağar: 14 / 18 / 22 m, 50 / 60 / 70 derece, hasar x1 / x1.25 / x1.55 ve yanma. Her nefes bir Öz Patlaması ve kademe kadar Sıçrayan Alevler verir. 30 saniye, 2 yük. %1.8 Mana.',
    cost: 1.8, cooldown: 30, charges: 2, castTime: 0, channel: 2.0, anim: 'Spellcasting', animSpeed: 1, hitTime: 0.05, targeting: 'custom', behavior: 'kit_empower',
    range: 22, arc: 70, damage: { coef: 2.4, type: 'fire' }, tags: ['spell', 'fire', 'channel', 'aoe', 'empower'],
    vfx: { cast: 'dragon_breath_cone', impact: 'fire_burst' }, sfx: { cast: 'dragon_breath', impact: 'fire_impact' },
    params: {
      tick: 0.1, empower: 1, kind: 1, hold1: 0.67, hold2: 1.33, hold3: 2.0, stagger: 3, weight: 1, proc: 1,
      range1: 14, range2: 18, range3: 22, arc1: 50, arc2: 60, arc3: 70, mult1: 1, mult2: 1.25, mult3: 1.55,
      burn1: 14, burn2: 17, burn3: 20, burnMag: 1.3333,
    },
  });

  // ======================================================================================================
  // S1: Pyre (class row, Yıkım). 3 Öz, 2.10 fire to every enemy within 8 m of the target
  // ======================================================================================================
  add({
    id: 'evoker_pyre', classId: 'evoker', name: 'Pyre', icon: I('skill-fire-nova'), unlockLevel: 6, defaultSlot: 's1',
    desc: 'Hedefte patlayan bir ateş küresi: 8 metre içindeki her düşmana %210 ateş hasarı verir. 3 Öz harcar; Öz Patlaması varken bedavadır. Gökkuşağı yükü hasarı %20 artırır.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.5, targeting: 'target_instant', behavior: 'kit_aoe_strike',
    range: 25, radius: 8, damage: { coef: 2.1, type: 'fire' }, pip: { id: 'essence', cost: 3 },
    tags: ['spell', 'fire', 'aoe', 'spender'], vfx: { cast: 'meteor_fall', impact: 'fire_burst', ground: 'fire_ground' }, sfx: { cast: 'fire_cast', impact: 'explosion' },
    params: { maxTargets: 99, falloff: 1, stagger: 5, weight: 1, proc: 1, end: 1.0, chain: 0.08, move: 0.15 },
  });

  // ======================================================================================================
  // S2 / S3 / S4 and the majors shared by the specs
  // ======================================================================================================
  add({
    id: 'evoker_hover', classId: 'evoker', name: 'Süzül', icon: I('skill-leap'), unlockLevel: 10, defaultSlot: 's2',
    desc: '6 saniye boyunca hareket hızın %30 artar ve büyü yaparken yavaşlamazsın. 35 saniye bekleme, 2 yük.',
    cost: 0, cooldown: 35, charges: 2, castTime: 0, anim: 'Jump_Start', animSpeed: 1.5, hitTime: 0.2, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'hover', duration: 6 }], tags: ['offgcd', 'movement', 'buff', 'utility'],
    vfx: { cast: 'wings_aura' }, sfx: { cast: 'whoosh' }, params: { end: 0.6, chain: 0.05, move: 0.05, weight: 0 },
  });
  add({
    id: 'evoker_obsidian_scales', classId: 'evoker', name: 'Obsidyen Pullar', icon: I('skill-iron-skin'), unlockLevel: 15, defaultSlot: 's3',
    desc: '12 saniye boyunca aldığın hasar %30 azalır. 90 saniye bekleme, 2 yük.',
    cost: 0, cooldown: 90, charges: 2, castTime: 0, anim: 'Cheer', animSpeed: 2.0, hitTime: 0.3, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'obsidian', duration: 12 }], tags: ['offgcd', 'defensive', 'buff'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' }, params: { end: 0.7, chain: 0.05, move: 0.1, weight: 0 },
  });
  add({
    id: 'evoker_quell', classId: 'evoker', name: 'Bastır', icon: I('skill-thunderclap'), unlockLevel: 10, defaultSlot: 's4',
    desc: '25 metre içindeki büyü yapan bir düşmanın büyüsünü keser ve 3 saniye susturur (boss: yalnızca büyü kesilir). 40 saniye bekleme.',
    cost: 0, cooldown: 40, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 2.0, hitTime: 0.2, targeting: 'target_instant', behavior: 'interrupt', range: 25, offGcd: true,
    tags: ['offgcd', 'spell', 'kick', 'frost'], vfx: { cast: 'shockwave', impact: 'interrupt_burst' }, sfx: { cast: 'interrupt', impact: 'frost_impact' },
    params: { silence: 3, end: 0.5, chain: 0.05, move: 0.1, weight: 0 },
  });

  // Ejder Öfkesi (m90 of Yıkım Nefesi; class row so a spec-less level-20 character has it): 2.0 impact in 8 m, 18 s +15 % damage, Öz regen x2,
  // Ateş Nefesi / Ebedi Dalga cooldowns halved (STATUS_RULES cdMult), a Terazi Eğimi charge, +1 Öz Patlaması; after the window 4 Serbest Alev
  add({
    id: 'evoker_dragonrage', classId: 'evoker', name: 'Ejder Öfkesi', icon: I('skill-berserk'), unlockLevel: 20, defaultSlot: 'm90',
    desc: 'Etrafında 8 metrelik bir alev dalgası patlatır (%200 ateş hasarı). 18 saniye boyunca hasarın %15 artar, Öz yenilenmesi iki katına çıkar, Ateş Nefesi ve Ebedi Dalga %50 daha hızlı dolar. Terazi Eğimi ve Öz Patlaması kazanırsın; bitince 4 Serbest Alev verilir. 90 saniye bekleme.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.3, targeting: 'custom', behavior: 'kit_dragonrage', offGcd: true,
    radius: 8, damage: { coef: 2.0, type: 'fire' }, selfStatuses: [{ status: 'dragonrage', duration: 18 }, { status: 'tip_scales', duration: 30 }],
    tags: ['offgcd', 'major', 'offensive', 'buff', 'fire', 'aoe'], vfx: { cast: 'wings_gold', impact: 'enrage_aura' }, sfx: { cast: 'boss_roar', impact: 'hero_horn' },
    params: { dur: 18, unbound: 4, unboundDur: 15, end: 1.0, chain: 0.1, move: 0.2, weight: 3, stagger: 8 },
  });

  // Aspectlerin Öfkesi (m180, all three specs): Kurt Narası family (major_hero), sated 600 s as the doc states
  add({
    id: 'evoker_fury_of_aspects', classId: 'evoker', name: 'Aspectlerin Öfkesi', icon: I('skill-battle-shout'), unlockLevel: 30, defaultSlot: 'm180',
    desc: 'Grubuna 40 saniye boyunca %30 saldırı/büyü hızı ve %10 hareket hızı veren bir ejder narası atarsın. Etkilenenler 10 dakika Yorgun kalır. 180 saniye bekleme.',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Cheer', animSpeed: 1.2, hitTime: 0.3, targeting: 'custom', behavior: 'major_hero', offGcd: true,
    tags: ['offgcd', 'major', 'hero', 'buff'], vfx: { cast: 'hero_wave' }, sfx: { cast: 'hero_horn' }, params: { major: 180, range: 40, dur: 40, sated: 600 },
  });
}
