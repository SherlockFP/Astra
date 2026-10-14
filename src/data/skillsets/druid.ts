/**
 * KIT Druid core skillset (WoW Midnight 12.0 druid, Turkish names). OWNER: druid kit. Spec-bound rows are in druidSpecs.ts.
 *
 * Shapeshift (combat/Forms.ts): Kedi (cat) and Ayı (bear) swap the LMB chain and, through SkillDef.replaces, the three caster buttons:
 *   rmb  Güneş Gazabı  -> Doğra (Kedi) / Parçalayıcı Pençe (Ayı)
 *   q    Ay Ateşi      -> Tırmık (Kedi) / Çırpınma (Ayı)
 *   e    Gençleşme     -> Yırtıcı Isırık (Kedi) / Demir Post (Ayı)
 * Skill tags: `f_cat` / `f_bear` (auto-enter that form), `f_any` (never changes form), `f_shift` (a form button); every other `spell`
 * drops Kedi / Ayı / Yolcu. The level-1 bar is basic + Güneş Gazabı + Ay Ateşi + Gençleşme + Kedi Biçimi (4 usable skills).
 * Cat rows build Kombo Puanı through `pip: combo` (the rogue counter; SkillSystem.addCombo allows druids); the finisher is the rogue's
 * `kit_finisher` behaviour. Eclipse is an active window (druidSpecs.ts); the AP pip is `astral_power` (class secondary, Denge only).
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;
const CAST = { end: 0.7, chain: 0.1, move: 0.2, stagger: 4, proc: 1, weight: 0, upper: 0 };

export function registerDruid(add: SkillAdd): void {
  // =====================================================================================================
  // LMB chains: human (Pençe Zinciri), Kedi (Pati Zinciri, step 3 +1 Kombo), Ayı (Ağır Pati, +4 Öfke per hit)
  // =====================================================================================================
  add({
    id: 'druid_basic', classId: 'druid', name: 'Pençe Zinciri', icon: I('skill-claw-strike'), defaultSlot: 'lmb',
    desc: 'Üç vuruşluk bir pençe zinciri: iki hızlı pençe, ardından güçlü bir tekme. Biçim değiştirince zincir değişir.',
    anim: 'Unarmed_Melee_Attack_Punch_A', targeting: 'melee_arc', range: 2.5, arc: 90, tags: ['melee', 'basic', 'combo', 'physical'],
    behavior: 'combo', params: { steps: 3, reset: 0.8 },
  });
  const humanSteps: [string, string, string, number, number, number, number][] = [
    ['Hızlı Pençe', 'Unarmed_Melee_Attack_Punch_A', 'İlk hızlı pençe.', 0.8, 1.9, 0.41, 0],
    ['Çapraz Pençe', 'Unarmed_Melee_Attack_Punch_B', 'İkinci, daha geniş pençe.', 0.85, 1.85, 0.5, 0],
    ['Ezici Tekme', 'Unarmed_Melee_Attack_Kick', 'Zincirin finali: düşmanı iten bir tekme.', 1.5, 1.5, 0.36, 4],
  ];
  humanSteps.forEach(([name, anim, desc, coef, spd, hit, weight], i) => {
    add({
      id: `druid_basic_${i + 1}`, classId: 'druid', name, icon: I('skill-claw-strike'), desc, anim, animSpeed: spd, hitTime: hit,
      targeting: 'melee_arc', range: i === 2 ? 3.0 : 2.5, arc: i === 2 ? 80 : 90, knockback: i === 2 ? 1.2 : 0.5, damage: { coef, type: 'physical' },
      tags: i === 2 ? ['melee', 'basic', 'finisher', 'physical'] : ['melee', 'basic', 'physical'],
      vfx: { trail: 'slash_arc', impact: 'hit_spark' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
      params: { end: 0.8 + i * 0.08, chain: 0.04, move: 0.1, stagger: 3 + i * 3, proc: 0.7, weight, lunge: 0.6, slow: 0.4, step: i + 1 },
    });
  });

  add({
    id: 'druid_cat_basic', classId: 'druid', name: 'Pati Zinciri', icon: I('skill-claw-strike'),
    desc: 'Kedi Biçimi: hızlı üç pati vuruşu. Son vuruş 1 Kombo Puanı kazandırır.',
    anim: 'Dualwield_Melee_Attack_Slice', targeting: 'melee_arc', range: 2.5, arc: 90, tags: ['melee', 'basic', 'combo', 'physical', 'f_cat'],
    behavior: 'combo', params: { steps: 3, reset: 0.8 },
  });
  const catSteps: [string, string, number, number, number][] = [
    ['Sağ Pati', 'Dualwield_Melee_Attack_Slice', 0.75, 1.8, 0.3], ['Sol Pati', 'Dualwield_Melee_Attack_Chop', 0.8, 1.75, 0.34],
    ['Çifte Pati', 'Dualwield_Melee_Attack_Stab', 1.25, 1.5, 0.42],
  ];
  catSteps.forEach(([name, anim, coef, spd, hit], i) => {
    add({
      id: `druid_cat_basic_${i + 1}`, classId: 'druid', name, icon: I('skill-claw-strike'), desc: 'Kedi zincirinin vuruşu.',
      anim, animSpeed: spd, hitTime: hit, targeting: 'melee_arc', range: 2.6, arc: 90, knockback: i === 2 ? 1.0 : 0.4, damage: { coef, type: 'physical' },
      ...(i === 2 ? { pip: { id: 'combo' as const, gain: 1 } } : {}),
      tags: i === 2 ? ['melee', 'basic', 'finisher', 'physical', 'f_cat'] : ['melee', 'basic', 'physical', 'f_cat'],
      vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
      params: { end: 0.7 + i * 0.06, chain: 0.03, move: 0.08, stagger: 3 + i * 3, proc: 0.7, weight: i === 2 ? 1 : 0, lunge: 0.8, slow: 0.35, step: i + 1 },
    });
  });

  add({
    id: 'druid_bear_basic', classId: 'druid', name: 'Ağır Pati', icon: I('skill-ground-slam'),
    desc: 'Ayı Biçimi: ağır üç pati. Her vuruş Öfke kazandırır.',
    anim: 'Unarmed_Melee_Attack_Punch_A', targeting: 'melee_arc', range: 2.8, arc: 100, tags: ['melee', 'basic', 'combo', 'physical', 'f_bear'],
    behavior: 'combo', params: { steps: 3, reset: 0.9 },
  });
  const bearSteps: [string, string, number, number, number][] = [
    ['Sağ Pençe', 'Unarmed_Melee_Attack_Punch_A', 0.85, 1.6, 0.4], ['Sol Pençe', 'Unarmed_Melee_Attack_Punch_B', 0.9, 1.6, 0.44],
    ['Ezici Pati', '2H_Melee_Attack_Chop', 1.55, 1.3, 0.55],
  ];
  bearSteps.forEach(([name, anim, coef, spd, hit], i) => {
    add({
      id: `druid_bear_basic_${i + 1}`, classId: 'druid', name, icon: I('skill-ground-slam'), desc: 'Ayı zincirinin vuruşu: Öfke kazandırır.',
      anim, animSpeed: spd, hitTime: hit, targeting: 'melee_arc', range: 2.9, arc: 100, knockback: i === 2 ? 1.6 : 0.5, damage: { coef, type: 'physical' },
      tags: i === 2 ? ['melee', 'basic', 'finisher', 'physical', 'f_bear'] : ['melee', 'basic', 'physical', 'f_bear'],
      vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
      params: { end: 0.8 + i * 0.06, chain: 0.04, move: 0.12, stagger: 5 + i * 4, proc: 0.8, weight: i === 2 ? 4 : 0, lunge: 0.7, slow: 0.4, step: i + 1, gain: 4, threatMult: 1.3 },
    });
  });

  // =====================================================================================================
  // Core 8 (ClassDef.skills order): rmb · q · e · s1 · s2 · s3 · bench · r
  // =====================================================================================================
  add({
    id: 'druid_wrath', classId: 'druid', name: 'Güneş Gazabı', icon: I('skill-fireball'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Hedefe %190 güneş hasarı veren bir ışık oku atarsın ve 8 Astral Güç kazanırsın. Güneş Tutulması varken %40 daha güçlüdür. Kedi/Ayı Biçimi\'nde Doğra/Parçalayıcı Pençe\'ye dönüşür.',
    cost: 5, cooldown: 0, castTime: 1.3, anim: 'Spellcast_Shoot', animSpeed: 1.15, hitTime: 0.373,
    targeting: 'target_projectile', range: 32, speed: 24, radius: 0.45, count: 1, pierce: 0, homing: 5, damage: { coef: 1.9, type: 'fire' },
    pip: { id: 'astral_power', gain: 8 }, whileStatusMult: { status: 'eclipse_solar', mult: 1.4 },
    tags: ['spell', 'projectile', 'fire', 'solar'], vfx: { projectile: 'fire_projectile', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
    params: { ...CAST, element: 1 },
  });
  add({
    id: 'druid_moonfire', classId: 'druid', name: 'Ay Ateşi', icon: I('debuff-curse'), unlockLevel: 1, defaultSlot: 'q',
    desc: 'Hedefe %60 gizem hasarı verir ve 16 saniye boyunca hasar veren bir ay ateşi bırakırsın (toplam %240). 2 Astral Güç kazanırsın.',
    cost: 6, cooldown: 0, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.6, hitTime: 0.3,
    targeting: 'custom', behavior: 'kit_druid_dot', range: 32, damage: { coef: 0.6, type: 'arcane' },
    statuses: [{ status: 'moonfire', duration: 16, magnitude: 4.0 }], pip: { id: 'astral_power', gain: 2 },
    tags: ['spell', 'dot', 'arcane', 'instant', 'lunar'], vfx: { cast: 'arcane_burst', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast' },
    params: { ...CAST, element: 3 },
  });
  add({
    id: 'druid_rejuvenation', classId: 'druid', name: 'Gençleşme', icon: I('skill-renew'), unlockLevel: 1, defaultSlot: 'e',
    desc: 'Seçtiğin müttefiği (ya da kendini) 12 saniye boyunca iyileştirirsin. Tekrar kullanmak süreyi tazeler. %12 ihtimalle bir sonraki Yeniden Büyüme %30 daha güçlü olur ve mana harcamaz.',
    cost: 10, cooldown: 0, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.5, hitTime: 0.3,
    targeting: 'custom', behavior: 'kit_druid_hot', range: 30, allyTarget: 'friendly', statuses: [{ status: 'rejuvenation', duration: 12 }],
    tags: ['spell', 'heal', 'hot', 'instant', 'nature'], vfx: { cast: 'buff_aura', impact: 'heal_burst' }, sfx: { cast: 'heal', impact: 'buff' },
    params: { ...CAST, hotCoef: 0.45, tick: 2, omen: 0.12 },
  });
  add({
    id: 'druid_cat_form', classId: 'druid', name: 'Kedi Biçimi', icon: I('skill-claw-strike'), unlockLevel: 1, defaultSlot: 's1',
    desc: 'Kediye dönüşürsün: Enerji kullanır, kombo puanı biriktirir ve daha hızlı koşarsın. Üç ana düğmen pençe saldırılarına dönüşür. Tekrar kullanırsan ya da bir büyü yaparsan biçimden çıkarsın.',
    cost: 0, cooldown: 1, castTime: 0, anim: 'Cheer', animSpeed: 2.4, hitTime: 0.15, targeting: 'custom', behavior: 'kit_druid_shift',
    tags: ['buff', 'f_shift', 'offgcd', 'cat'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'boss_roar' },
    params: { end: 0.3, chain: 0.05, move: 0.05, weight: 0, form: 2 },
  });
  add({
    id: 'druid_regrowth', classId: 'druid', name: 'Yeniden Büyüme', icon: I('skill-regeneration'), unlockLevel: 5, defaultSlot: 's2',
    desc: '1.5 saniyelik büyüyle seçtiğin müttefiği anında iyileştirir ve ardından 6 saniye boyunca iyileştirmeye devam edersin. Berraklık Alameti varken %30 daha güçlüdür ve mana harcamaz.',
    cost: 14, cooldown: 0, castTime: 1.5, anim: 'Spellcasting', animSpeed: 1.0, hitTime: 1.5,
    targeting: 'custom', behavior: 'kit_druid_hot', range: 30, allyTarget: 'friendly', heal: { coef: 1.8 }, statuses: [{ status: 'regrowth', duration: 6 }],
    tags: ['spell', 'heal', 'hot', 'nature'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'heal', impact: 'buff' },
    params: { end: 0.7, chain: 0.1, move: 0.2, weight: 0, hotCoef: 0.3, tick: 2, omenUse: 1 },
  });
  add({
    id: 'druid_bear_form', classId: 'druid', name: 'Ayı Biçimi', icon: I('skill-iron-skin'), unlockLevel: 8, defaultSlot: 's3',
    desc: 'Ayıya dönüşürsün: zırhın ve canın büyük ölçüde artar, Öfke kullanırsın (aldığın hasar da Öfke kazandırır). Ana düğmelerin ayı saldırılarına dönüşür.',
    cost: 0, cooldown: 1, castTime: 0, anim: 'Cheer', animSpeed: 2.0, hitTime: 0.15, targeting: 'custom', behavior: 'kit_druid_shift',
    tags: ['buff', 'f_shift', 'offgcd', 'bear'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'boss_roar' },
    params: { end: 0.3, chain: 0.05, move: 0.05, weight: 0, form: 3 },
  });
  // GDD slot is the bench: no defaultSlot, the player binds it
  add({
    id: 'druid_barkskin', classId: 'druid', name: 'Meşe Kabuğu', icon: I('skill-iron-skin'), unlockLevel: 10,
    desc: '12 saniye boyunca aldığın hasar %20 azalır ve zırhın %30 artar. Her biçimde kullanılabilir.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.2, targeting: 'custom', behavior: 'kit_druid_self',
    selfStatuses: [{ status: 'barkskin', duration: 12 }],
    tags: ['buff', 'defensive', 'f_any', 'offgcd'], vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' },
    params: { end: 0.4, chain: 0.1, move: 0.1, weight: 0 },
  });
  add({
    id: 'druid_travel_form', classId: 'druid', name: 'Yolcu Biçimi', icon: I('skill-dash'), unlockLevel: 10, defaultSlot: 'r',
    desc: 'Hızlı bir geyiğe dönüşür, %40 daha hızlı koşarsın. Saldırı yaptığında ya da hasar aldığında biçimin bozulur.',
    cost: 0, cooldown: 2, castTime: 0, anim: 'Cheer', animSpeed: 2.2, hitTime: 0.15, targeting: 'custom', behavior: 'kit_druid_shift',
    tags: ['buff', 'f_shift', 'offgcd', 'movement', 'travel'], vfx: { cast: 'haste_trail' }, sfx: { cast: 'whoosh' },
    params: { end: 0.3, chain: 0.05, move: 0.05, weight: 0, form: 4 },
  });
  // ---- G (s4): the class interrupt (silence 3 s, bosses lose the cast only). Granted by the class tree s05 pick A (druid_solar_beam), as the
  // other classes' interrupts are; bind it to s4 in the skill book.
  add({
    id: 'druid_solar_beam', classId: 'druid', name: 'Güneş Işını', icon: I('skill-lightning-bolt'), unlockLevel: 10,
    desc: '30 metre içindeki büyü yapan bir düşmanın büyüsünü keser ve 3 saniye susturursun (boss hariç). Her biçimde kullanılabilir.',
    cost: 0, cooldown: 20, castTime: 0, hitTime: 0.2, offGcd: true, anim: 'Spellcast_Shoot', animSpeed: 1.8, targeting: 'custom', range: 30, arc: 360,
    behavior: 'interrupt', tags: ['offgcd', 'spell', 'kick', 'f_any'], params: { silence: 3 }, vfx: { impact: 'interrupt_burst' }, sfx: { cast: 'spell_cast', impact: 'stun' },
  });
  add({
    id: 'druid_cat_dash', classId: 'druid', name: 'Atılma', icon: I('buff-haste'), unlockLevel: 15,
    desc: 'Kedi Biçimi\'ne geçip 8 saniye boyunca %60 daha hızlı koşarsın.',
    cost: 0, cooldown: 40, castTime: 0, anim: 'Cheer', animSpeed: 2.2, hitTime: 0.15, targeting: 'custom', behavior: 'kit_druid_self',
    selfStatuses: [{ status: 'cat_dash', duration: 8 }], tags: ['buff', 'movement', 'f_cat', 'offgcd'], vfx: { cast: 'haste_trail' }, sfx: { cast: 'whoosh' },
    params: { end: 0.3, chain: 0.05, move: 0.05, weight: 0 },
  });

  // =====================================================================================================
  // Kedi set: replaces the three caster buttons while form_cat is up. Kombo Puanı: builders +1, finisher kit_finisher (rogue).
  // =====================================================================================================
  add({
    id: 'druid_shred', classId: 'druid', name: 'Doğra', icon: I('skill-claw-strike'), unlockLevel: 1,
    desc: 'Kedi Biçimi: hedefi pençeleyerek %190 hasar verir ve 1 Kombo Puanı kazandırır. Hedefin arkasındayken daha güçlü vurur.',
    cost: 25, cooldown: 0, castTime: 0, hitTime: 0.32, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.8,
    targeting: 'melee_arc', range: 3.0, arc: 90, damage: { coef: 1.9, type: 'physical' }, pip: { id: 'combo', gain: 1 },
    replaces: { skill: 'druid_wrath', whileStatus: 'form_cat' },
    tags: ['melee', 'builder', 'physical', 'f_cat'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
    params: { end: 0.7, chain: 0.06, move: 0.12, stagger: 8, proc: 1, weight: 1, lunge: 1.0, slow: 0.5 },
  });
  add({
    id: 'druid_rake', classId: 'druid', name: 'Tırmık', icon: I('debuff-bleed'), unlockLevel: 1,
    desc: 'Kedi Biçimi: hedefi tırmıklayıp %80 hasar verir ve 15 saniye kanatırsın (toplam %340). 1 Kombo Puanı kazandırır.',
    cost: 25, cooldown: 0, castTime: 0, hitTime: 0.3, anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.8,
    targeting: 'melee_arc', range: 3.0, arc: 80, damage: { coef: 0.8, type: 'physical' }, statuses: [{ status: 'rake', duration: 15, magnitude: 4.25 }],
    pip: { id: 'combo', gain: 1 }, replaces: { skill: 'druid_moonfire', whileStatus: 'form_cat' },
    tags: ['melee', 'builder', 'bleed', 'physical', 'f_cat'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
    params: { end: 0.7, chain: 0.06, move: 0.12, stagger: 6, proc: 1, weight: 0, lunge: 1.0, slow: 0.5 },
  });
  add({
    id: 'druid_ferocious_bite', classId: 'druid', name: 'Yırtıcı Isırık', icon: I('skill-eviscerate'), unlockLevel: 1,
    desc: 'Kedi Biçimi: tüm Kombo Puanlarını harcayıp hedefi ısırırsın; her puan hasarı artırır (5 puanda %365).',
    cost: 30, cooldown: 0, castTime: 0, hitTime: 0.4, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.5,
    targeting: 'custom', behavior: 'kit_finisher', range: 3.0, arc: 70, damage: { coef: 0.9, type: 'physical' },
    replaces: { skill: 'druid_rejuvenation', whileStatus: 'form_cat' },
    tags: ['melee', 'finisher', 'spender', 'physical', 'f_cat'], vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
    params: { end: 0.75, chain: 0.08, move: 0.15, stagger: 10, weight: 1, mode: 0, base: 0.9, perCp: 0.55, minCp: 1, maxCp: 5, maxTargets: 1 },
  });

  // =====================================================================================================
  // Ayı set: Parçalayıcı Pençe (Öfke builder), Çırpınma (AoE bleed), Demir Post (armour stacks)
  // =====================================================================================================
  add({
    id: 'druid_mangle', classId: 'druid', name: 'Parçalayıcı Pençe', icon: I('skill-ground-slam'), unlockLevel: 8,
    desc: 'Ayı Biçimi: hedefe %240 hasar vurur, yüksek tehdit üretir ve 8 Öfke kazandırır. En çok 3 düşmana çarpar.',
    cost: 0, cooldown: 4, castTime: 0, hitTime: 0.45, anim: '2H_Melee_Attack_Chop', animSpeed: 1.5,
    targeting: 'melee_arc', range: 3.2, arc: 100, damage: { coef: 2.4, type: 'physical' }, knockback: 1.0,
    replaces: { skill: 'druid_wrath', whileStatus: 'form_bear' },
    tags: ['melee', 'builder', 'physical', 'f_bear'], vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
    params: { end: 0.8, chain: 0.08, move: 0.15, stagger: 14, proc: 1, weight: 2, lunge: 0.8, slow: 0.5, gain: 8, threatMult: 1.6 },
  });
  add({
    id: 'druid_thrash', classId: 'druid', name: 'Çırpınma', icon: I('skill-whirlwind'), unlockLevel: 8,
    desc: 'Ayı Biçimi: çevrendeki herkese %90 hasar verir ve 12 saniye kanatırsın (toplam %220). 5 Öfke kazandırır.',
    cost: 0, cooldown: 5, castTime: 0, hitTime: 0.35, anim: '2H_Melee_Attack_Spinning', animSpeed: 1.6,
    targeting: 'self_aoe', radius: 4.5, damage: { coef: 0.9, type: 'physical' }, statuses: [{ status: 'thrash', duration: 12, magnitude: 2.45 }],
    replaces: { skill: 'druid_moonfire', whileStatus: 'form_bear' },
    tags: ['melee', 'aoe', 'bleed', 'physical', 'f_bear'], vfx: { cast: 'spin_slash', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
    params: { end: 0.7, chain: 0.1, move: 0.15, stagger: 8, proc: 0.8, weight: 1, gain: 5, threatMult: 1.4 },
  });
  add({
    id: 'druid_ironfur', classId: 'druid', name: 'Demir Post', icon: I('buff-defense'), unlockLevel: 8,
    desc: 'Ayı Biçimi: 35 Öfke harcayıp 7 saniye boyunca zırhını %25 artırırsın. Üst üste en çok 4 kez birikir.',
    cost: 35, cooldown: 0, castTime: 0, anim: 'Cheer', animSpeed: 2.0, hitTime: 0.15, targeting: 'custom', behavior: 'kit_druid_self',
    replaces: { skill: 'druid_rejuvenation', whileStatus: 'form_bear' }, selfStatuses: [{ status: 'ironfur', duration: 7 }],
    tags: ['buff', 'defensive', 'f_bear', 'offgcd'], vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' },
    params: { end: 0.3, chain: 0.05, move: 0.05, weight: 0 },
  });
}
