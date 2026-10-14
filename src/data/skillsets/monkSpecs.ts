/**
 * GDD_CLASSES_V2 §2.5 / §2.10 Keşiş specs: spec skills and majors of Rüzgâr Yürüyen (monk_windwalker), Demci (monk_brewmaster) and
 * Sis Dokuyan (monk_mistweaver) (NC11). SpecDef rows are in specs_kit_monk.ts.
 * Mistweaver: the GDD (§2.10) gives the heal coefficients of Soothing Mist (0.35 per tick), Renewing Mist (0.2 per tick), Enveloping
 * Mist (2.2 + 0.2 per tick, 1.4 s cast), Vivify (1.6), Revival (3.0). Its costs, the Vivify shape, the HoT durations and the
 * Thunder Tea numbers are NOT in the GDD: they are the monk package's picks, marked `(pick)` below. Turkish names for the
 * healer rows are also picks (the GDD gives none).
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerMonkSpecs(add: SkillAdd): void {
  // Yaşam Kozası (Life Cocoon), Sis Dokuyan: an absorb of 30 % of an ally's max HP for 12 s (the caster when no ally is picked).
  add({
    id: 'monk_life_cocoon', classId: 'monk', spec: 'monk_mistweaver', name: 'Yaşam Kozası (Life Cocoon)', icon: I('skill-healing-shield'), unlockLevel: 20,
    desc: 'Seçtiğin müttefikini 12 saniye boyunca bir koza ile sararsın: maks. canının %30\'u kadar hasarı emer. Seçili müttefik yoksa kendini sarar. 120 saniye bekleme.',
    cost: 15, cooldown: 120, castTime: 0, hitTime: 0.4, anim: 'Spellcast_Shoot', animSpeed: 1.2,
    targeting: 'custom', behavior: 'absorb_ally', allyTarget: 'friendly', range: 25,
    statuses: [{ status: 'life_cocoon', duration: 12 }],
    tags: ['spell', 'defensive', 'absorb', 'ally'], vfx: { cast: 'buff_aura', impact: 'shield_bubble' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { absorbPct: 0.3, capPct: 0.3, end: 0.6, chain: 0.1, move: 0.1, weight: 0 },
  });
  // Göksel Karışım (Celestial Brew), Demci: a self absorb of 20 % of max HP (cap 40 %) for 8 s
  add({
    id: 'monk_celestial_brew', classId: 'monk', spec: 'monk_brewmaster', name: 'Göksel Karışım (Celestial Brew)', icon: I('skill-iron-skin'), unlockLevel: 15,
    desc: 'Kendine 8 saniye boyunca maks. canının %20\'si kadar emici kalkan verirsin (en fazla %40). 45 saniye bekleme.',
    cost: 0, cooldown: 45, castTime: 0, hitTime: 0.2, anim: 'Cheer', animSpeed: 1.2,
    targeting: 'self_buff', behavior: 'absorb_self', selfStatuses: [{ status: 'celestial_brew', duration: 8 }],
    tags: ['spell', 'defensive', 'absorb', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'chi_cast' },
    params: { absorbPct: 0.2, capPct: 0.4, end: 0.5, chain: 0.1, move: 0.1, weight: 0 },
  });
  // =====================================================================================================
  // Rüzgâr Yürüyen (monk_windwalker, DPS), §2.5
  // =====================================================================================================
  add({
    id: 'monk_rising_sun_kick', classId: 'monk', spec: 'monk_windwalker', name: 'Doğan Güneş Tekmesi (Rising Sun Kick)', icon: I('skill-smite'), unlockLevel: 10,
    desc: '3 Çi harcayarak %650 hasar veren yükselen bir tekme atar, hedefi 6 sn boyunca %12 daha savunmasız bırakırsın. Kara Tekme\'den sonra 1 Çi iade eder.',
    cost: 0, cooldown: 9, castTime: 0, hitTime: 0.36, anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.15,
    targeting: 'melee_arc', range: 3.2, arc: 140, damage: { coef: 6.5, type: 'physical' }, knockback: 1.8, pip: { id: 'chi', cost: 3 },
    statuses: [{ status: 'rising_sun', duration: 6 }],
    // Kara Tekme -> Doğan Güneş within 1.2 s: +1 Çi back
    route: { from: ['monk_blackout_kick'], window: 1.2, pipGain: 1 },
    tags: ['melee', 'kick', 'spender', 'unarmed', 'spec'], vfx: { trail: 'kick_arc', impact: 'holy_burst' }, sfx: { cast: 'swing_heavy', impact: 'kick_hit' },
    params: { end: 0.85, chain: 0.1, move: 0.2, stagger: 25, proc: 1, weight: 2, lunge: 1.4, knockup: 0.8, root: 1, kick: 1 },
  });
  add({
    id: 'monk_whirling_dragon', classId: 'monk', spec: 'monk_windwalker', name: 'Dönen Ejder Yumruğu (Whirling Dragon Punch)', icon: I('skill-cleave'), unlockLevel: 15,
    desc: '2 Çi harcayarak çevrene %400 hasar veren bir ejder kasırgası yaratırsın. Doğan Güneş Tekmesi\'nden sonra %40 daha güçlüdür.',
    cost: 0, cooldown: 14, castTime: 0, hitTime: 0.6, anim: '2H_Melee_Attack_Spin', animSpeed: 2.4,
    targeting: 'self_aoe', radius: 5.2, damage: { coef: 4.0, type: 'physical' }, knockback: 3, pip: { id: 'chi', cost: 2 },
    route: { from: ['monk_rising_sun_kick'], window: 1.5, more: 0.4 },
    tags: ['melee', 'aoe', 'spec'], vfx: { cast: 'spin_slash', impact: 'shockwave' }, sfx: { cast: 'swing_heavy', impact: 'ground_slam' },
    params: { end: 1.0, chain: 0.1, move: 0.25, stagger: 25, proc: 1, weight: 2 },
  });
  // Kaplan Öfkesi (m45, L10): +30 % attack speed, double energy regen 12 s, +2 Çi now
  add({
    id: 'monk_ww_tigers_fury', classId: 'monk', spec: 'monk_windwalker', name: "Xuen'i Çağır (Invoke Xuen)", icon: I('skill-berserk'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '12 saniye boyunca %30 daha hızlı vurur, Enerji yenilenmen iki katına çıkar. Anında 2 Çi kazanırsın.',
    cost: 0, cooldown: 45, castTime: 0, hitTime: 0.3, anim: 'Cheer', animSpeed: 1.8,
    targeting: 'self_buff', behavior: 'monk_self', selfStatuses: [{ status: 'tigerfury', duration: 12 }], pip: { id: 'chi', gain: 2 },
    tags: ['major', 'buff', 'spec'], vfx: { cast: 'enrage_aura', impact: 'chi_burst' }, sfx: { cast: 'war_cry' },
    params: { major: 45, end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  });
  // Fırtına, Toprak ve Ateş (m90, L20): two clones 15 s, +10 % damage 15 s
  add({
    id: 'monk_ww_storm_earth_fire', classId: 'monk', spec: 'monk_windwalker', name: 'Fırtına, Toprak ve Ateş (Storm, Earth, and Fire)', icon: I('skill-summon-skeleton'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '15 saniye boyunca iki ruh kopyan yanında dövüşür; hasarın %10 artar.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.6,
    targeting: 'summon', behavior: 'monk_storm', selfStatuses: [{ status: 'empower', duration: 15, magnitude: 0.1 }],
    tags: ['major', 'summon', 'spec'], vfx: { cast: 'respawn' }, sfx: { cast: 'chi_cast' },
    params: { major: 90, end: 0.9, chain: 0.1, move: 0.2, weight: 2 },
  });

  // =====================================================================================================
  // Demci (monk_brewmaster, TANK), §2.5
  // =====================================================================================================
  add({
    id: 'monk_provoke', classId: 'monk', spec: 'monk_brewmaster', name: 'Alay Et (Provoke)', icon: I('skill-taunt'), unlockLevel: 10, defaultSlot: 's3',
    desc: 'Hedefi 3 saniye boyunca kendine kışkırtırsın ve tehdidini en üste çıkarırsın (patronlarda 2 sn, 12 sn bekleme).',
    cost: 0, cooldown: 8, castTime: 0, hitTime: 0.3, anim: 'Cheer', animSpeed: 2.2,
    targeting: 'custom', range: 25, behavior: 'provoke',
    tags: ['taunt', 'spec'], vfx: { impact: 'mark_loop' }, sfx: { cast: 'war_cry' },
    params: { end: 0.5, chain: 0.05, move: 0.1, weight: 0, tauntDur: 3, bossTauntDur: 2, threatBoost: 100 },
  });
  add({
    id: 'monk_keg_smash', classId: 'monk', spec: 'monk_brewmaster', name: 'Fıçı Darbesi (Keg Smash)', icon: I('skill-ground-slam'), unlockLevel: 10, defaultSlot: 'e',
    desc: 'Fıçıyla yere vurarak önündekilere %280 hasar verir, onları yavaşlatır ve zayıflatırsın; 2 Çi kazanırsın. Arındırıcı İksir\'in bekleme süresini 3 sn kısaltır.',
    cost: 20, cooldown: 8, castTime: 0, hitTime: 0.735, anim: '2H_Melee_Attack_Chop', animSpeed: 1.35,
    targeting: 'melee_arc', range: 3.4, arc: 140, behavior: 'monk_keg', damage: { coef: 2.8, type: 'physical' }, knockback: 1.2,
    pip: { id: 'chi', gain: 2 }, statuses: [{ status: 'slow', duration: 4, magnitude: 0.25 }, { status: 'brewed', duration: 6 }],
    tags: ['melee', 'aoe', 'spec', 'keg'], vfx: { ground: 'brew_splash', impact: 'ground_slam' }, sfx: { cast: 'ground_slam', impact: 'pot_break' },
    params: { end: 1.2, chain: 0.1, move: 0.25, stagger: 30, proc: 1, weight: 2, root: 1, lunge: 0.8, threatMult: 3, keg: 1, impactRadius: 2.0, refundPurify: 3 },
  });
  add({
    id: 'monk_purifying_brew', classId: 'monk', spec: 'monk_brewmaster', name: 'Arındırıcı İksir (Purifying Brew)', icon: I('skill-regeneration'), unlockLevel: 15, defaultSlot: 's2',
    desc: '1 Çi harcayarak Sarsma havuzunun %55\'ini anında temizler ve canının %6\'sını yenilersin.',
    cost: 0, cooldown: 8, charges: 2, castTime: 0, hitTime: 0.72, anim: 'Use_Item', animSpeed: 2.2,
    targeting: 'self_buff', behavior: 'monk_self', pip: { id: 'chi', cost: 1 },
    tags: ['defensive', 'heal', 'spec'], vfx: { cast: 'brew_splash', impact: 'heal_burst' }, sfx: { cast: 'potion_drink' },
    params: { end: 0.9, chain: 0.1, move: 0.15, purify: 0.55, heal: 0.06, keg: 1, weight: 0 },
  });
  // Güçlendirici İksir (m45, L10): +20 % max HP, -20 % damage taken 15 s, heal 20 % now
  add({
    id: 'monk_bm_fortifying_brew', classId: 'monk', spec: 'monk_brewmaster', name: 'Güçlendirici İksir (Fortifying Brew)', icon: I('skill-iron-skin'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '15 saniye boyunca maksimum canını %20 artırır, aldığın hasarı %20 azaltır ve canının %20\'sini yenilersin.',
    cost: 0, cooldown: 45, castTime: 0, hitTime: 0.72, anim: 'Use_Item', animSpeed: 1.8,
    targeting: 'self_buff', behavior: 'monk_self', selfStatuses: [{ status: 'fortifying', duration: 15 }],
    tags: ['major', 'defensive', 'heal', 'spec'], vfx: { cast: 'brew_splash', impact: 'shield_bubble' }, sfx: { cast: 'potion_drink' },
    params: { major: 45, end: 0.9, chain: 0.1, move: 0.15, keg: 1, heal: 0.2, weight: 1 },
  });
  // Kara Öküz Ruhu (m90, L20): guardian, 25 s
  add({
    id: 'monk_bm_black_ox', classId: 'monk', spec: 'monk_brewmaster', name: "Niuzao'yu Çağır (Invoke Niuzao)", icon: I('skill-war-cry'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '25 saniye boyunca yanında Kara Öküz savaşan bir ruh olarak dövüşür, düşmanları kışkırtır ve yere vurarak Sarsma havuzunu azaltır.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.4, anim: 'Spellcast_Raise', animSpeed: 1.5,
    targeting: 'summon', behavior: 'minion_summon', minion: { id: 'monk_black_ox', count: 1, group: 'guardian', life: 25 },
    tags: ['major', 'summon', 'spec'], vfx: { cast: 'pet_summon' }, sfx: { cast: 'boss_roar' },
    params: { major: 90, end: 0.9, chain: 0.1, move: 0.2, weight: 2 },
  });

  // =====================================================================================================
  // Sis Dokuyan (monk_mistweaver, HEALER), §2.10. Healer picks are marked (pick).
  // =====================================================================================================
  // basic (replaces monk_basic on this spec's bar): single heal-bolt; pick: Çi 1 on a hit
  add({
    id: 'monk_mw_basic', classId: 'monk', spec: 'monk_mistweaver', name: 'Sis Vuruşu (Mist Strike)', icon: I('skill-holy-light'), unlockLevel: 1,
    desc: 'Avucundan bir sis darbesi fırlatırsın: bir müttefiki iyileştirir, düşmana çarparsa hasar verir. Her isabet 1 Çi kazandırır.',
    cost: 8, cooldown: 0, castTime: 0, hitTime: 0.37, anim: 'Spellcast_Shoot', animSpeed: 1.6,
    targeting: 'projectile', range: 30, speed: 26, count: 1, spread: 0, behavior: 'heal_bolt',
    heal: { coef: 0.8 }, damage: { coef: 0.6, type: 'arcane' }, allyTarget: 'friendly', pip: { id: 'chi', gain: 1 },
    tags: ['spell', 'basic', 'projectile', 'heal'], vfx: { projectile: 'chi_projectile', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 2, weight: 0 },
  });
  // Uyandırıcı Sis (Dinginlik Sisi): 2.5 s channel on the picked ally, 0.35 per 0.5 s tick (GDD §2.10)
  add({
    id: 'monk_mw_soothing_mist', classId: 'monk', spec: 'monk_mistweaver', name: 'Dinginlik Sisi (Soothing Mist)', icon: I('skill-prayer'), unlockLevel: 10,
    desc: '2.5 saniye boyunca seçtiğin müttefike sis yayarak her yarım saniyede bir iyileştirirsin.',
    cost: 8, cooldown: 0, castTime: 0, channel: 2.5, hitTime: 0.1, anim: 'Spellcasting', animSpeed: 1.0,
    targeting: 'custom', behavior: 'monk_mw_channel', heal: { coef: 0.35 }, allyTarget: 'friendly',
    tags: ['spell', 'heal', 'channel', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.5, chain: 0.1, move: 0.15, weight: 0, tick: 0.5 },
  });
  // Yenileyen Sis: HoT 6 s, 0.2 per 2 s tick (GDD §2.10 coefficients; the 2 s tick and 2 charges are picks; jumps not modelled)
  add({
    id: 'monk_mw_renewing_mist', classId: 'monk', spec: 'monk_mistweaver', name: 'Yenileyen Sis (Renewing Mist)', icon: I('skill-renew'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Müttefike 6 saniye boyunca iyileştiren bir sis bırakırsın. İki yükü vardır, 8 saniyede yenilenir.',
    cost: 6, cooldown: 8, charges: 2, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'custom', behavior: 'monk_mw_hot', allyTarget: 'friendly', statuses: [{ status: 'renewing_mist', duration: 6 }],
    tags: ['spell', 'heal', 'hot', 'spec'], vfx: { cast: 'buff_aura', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0, hotCoef: 0.2, tick: 2 },
  });
  // Sis Arındırma (pick name): dispel 2, heal on the dispelled ally only (heal_target dispel rows)
  add({
    id: 'monk_mw_detox', classId: 'monk', spec: 'monk_mistweaver', name: 'Sis Arındırma (Detox)', icon: I('skill-holy-water'), unlockLevel: 12,
    desc: 'Bir müttefikin üzerindeki en çok 2 zehir ya da büyü etkisini kaldırırsın; ona hafif bir iyileştirme de verirsin.',
    cost: 8, cooldown: 8, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'custom', behavior: 'heal_target', allyTarget: 'friendly', heal: { coef: 0.5 },
    tags: ['spell', 'heal', 'dispel', 'spec'], vfx: { cast: 'buff_aura', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0, dispel: 2 },
  });
  // Sarmalayan Sis: 1.4 s cast, heal 2.2 + HoT 0.2 per tick (GDD); tick 1 s and 8 s duration are picks
  add({
    id: 'monk_mw_enveloping_mist', classId: 'monk', spec: 'monk_mistweaver', name: 'Sarmalayan Sis (Enveloping Mist)', icon: I('skill-regeneration'), unlockLevel: 1,
    desc: '1.4 saniyelik büyüyle müttefike bir sis sarar: anında iyileştirir ve 8 saniye boyunca her saniye iyileştirmeye devam eder.',
    cost: 14, cooldown: 0, castTime: 1.4, hitTime: 1.4, anim: 'Spellcasting', animSpeed: 1.0,
    targeting: 'custom', behavior: 'monk_mw_hot', allyTarget: 'friendly', heal: { coef: 2.2 }, statuses: [{ status: 'enveloping_mist', duration: 8 }],
    tags: ['spell', 'heal', 'hot', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { end: 0.7, chain: 0.1, move: 0.2, weight: 0, hotCoef: 0.2, tick: 1 },
  });
  // Canlandırma (pick shape): a cone of heal 1.6 around the picked ally (radius 8, 120 deg, up to 5 allies, injured first)
  add({
    id: 'monk_mw_vivify', classId: 'monk', spec: 'monk_mistweaver', name: 'Canlandırma (Vivify)', icon: I('skill-holy-nova'), unlockLevel: 1,
    desc: 'Seçtiğin müttefikin çevresindeki yaralı en çok 5 kişiyi iyileştirirsin.',
    cost: 12, cooldown: 6, castTime: 0, hitTime: 0.6, anim: 'Spellcast_Raise', animSpeed: 1.4,
    targeting: 'custom', behavior: 'heal_aoe', allyTarget: 'friendly', heal: { coef: 1.6 }, radius: 8, arc: 120,
    tags: ['spell', 'heal', 'aoe', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.7, chain: 0.1, move: 0.2, weight: 0, maxTargets: 5, needInjured: 1 },
  });
  // Yıldırım Çayı (m45, L10): the next 3 heals are free and +50 %; 20 s (pick). The heal hooks are not in the engine yet.
  add({
    id: 'monk_mw_thunder_tea', classId: 'monk', spec: 'monk_mistweaver', name: 'Yıldırım Odağı Çayı (Thunder Focus Tea)', icon: I('skill-thunderstorm'), unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Sonraki üç iyileştirmen ücretsiz olur ve %50 daha güçlü vurur. 20 saniye sürer.',
    cost: 0, cooldown: 45, castTime: 0, hitTime: 0.72, anim: 'Use_Item', animSpeed: 1.8,
    targeting: 'self_buff', behavior: 'monk_self', selfStatuses: [{ status: 'thunder_tea', duration: 20, stacks: 3 }],
    tags: ['major', 'buff', 'heal', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'chi_cast' },
    params: { major: 45, end: 0.9, chain: 0.1, move: 0.15, weight: 1 },
  });
  // Diriliş (m90, L20): instant party heal 3.0 per ally within 12 m, dispel 3 per ally (GDD §2.10)
  add({
    id: 'monk_mw_revival', classId: 'monk', spec: 'monk_mistweaver', name: 'Diriliş (Revival)', icon: I('skill-resurrect'), unlockLevel: 20, defaultSlot: 'm90',
    desc: 'Yakındaki tüm müttefiklerini anında iyileştirir ve üzerlerindeki en çok 3 etkiyi kaldırırsın.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.4,
    targeting: 'self_aoe', radius: 12, behavior: 'monk_revival', heal: { coef: 3.0 },
    tags: ['major', 'heal', 'aoe', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { major: 90, end: 0.9, chain: 0.1, move: 0.2, weight: 2, dispel: 3 },
  });

  // =====================================================================================================
  // Added rows (Midnight core list, docs/WOW_ABILITY_MAP.md §4). Keys: see the bars in specs_kit_monk.ts.
  // =====================================================================================================
  // Ölüm Dokunuşu (Touch of Death), Rüzgâr Yürüyen: melee burst. behavior execute_threshold: kills a target with less HP than the caster's max HP
  // (a boss below bossPct of its own max HP); otherwise the strike lands.
  add({
    id: 'monk_touch_of_death', classId: 'monk', spec: 'monk_windwalker', name: 'Ölüm Dokunuşu (Touch of Death)', icon: I('skill-smite'), unlockLevel: 25,
    desc: 'Yakındaki bir düşmana büyük fiziksel hasar verir. 90 saniye bekleme.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.4, anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.2,
    targeting: 'melee_arc', behavior: 'execute_threshold', range: 3.2, arc: 120, damage: { coef: 4.5, type: 'physical' }, knockback: 1.5,
    tags: ['melee', 'kick', 'spec', 'unarmed'], vfx: { trail: 'kick_arc', impact: 'chi_burst' }, sfx: { cast: 'swing_heavy', impact: 'kick_hit' },
    params: { end: 0.9, chain: 0.1, move: 0.2, stagger: 20, proc: 1, weight: 3, bossPct: 0.15 },
  });
  // Ateş Nefesi (Breath of Fire), Demci: cone fire, slow 6 s
  add({
    id: 'monk_breath_of_fire', classId: 'monk', spec: 'monk_brewmaster', name: 'Ateş Nefesi (Breath of Fire)', icon: I('skill-fire-wave'), unlockLevel: 15,
    desc: 'Önündeki düşmanlara ateş nefesi üfler: %160 hasar verir ve 6 saniye boyunca yavaşlatır. 15 saniye bekleme.',
    cost: 20, cooldown: 15, castTime: 0, hitTime: 0.5, anim: 'Unarmed_Melee_Attack_Punch_A', animSpeed: 1.3,
    targeting: 'melee_arc', range: 4.5, arc: 180, damage: { coef: 1.6, type: 'fire' }, knockback: 0.8,
    statuses: [{ status: 'slow', duration: 6, magnitude: 0.3 }], pip: { id: 'chi', gain: 1 },
    tags: ['melee', 'aoe', 'spec', 'fire'], vfx: { trail: 'slash_arc', impact: 'fire_burst' }, sfx: { cast: 'whoosh', impact: 'punch_hit' },
    params: { end: 0.9, chain: 0.1, move: 0.2, stagger: 10, proc: 1, weight: 2, threatMult: 2 },
  });
  // Zorla Savuşturma (Expel Harm), Demci: filler that heals the caster (the hit part is not in the engine: see the report)
  add({
    id: 'monk_expel_harm', classId: 'monk', spec: 'monk_brewmaster', name: 'Zorla Savuşturma (Expel Harm)', icon: I('skill-regeneration'), unlockLevel: 1,
    desc: 'Canının bir kısmını anında yenilersin. 15 saniye bekleme.',
    cost: 0, cooldown: 15, castTime: 0, hitTime: 0.4, anim: 'Use_Item', animSpeed: 1.6,
    targeting: 'self_buff', behavior: 'monk_self', tags: ['defensive', 'heal', 'spec'],
    vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'potion_drink' },
    params: { end: 0.6, chain: 0.05, move: 0.1, weight: 0, heal: 0.1 },
  });
  // Patlayan Fıçı (Exploding Keg), Demci: a keg thrown at a ground point, fire in r 3.2
  add({
    id: 'monk_exploding_keg', classId: 'monk', spec: 'monk_brewmaster', name: 'Patlayan Fıçı (Exploding Keg)', icon: I('skill-ground-slam'), unlockLevel: 20,
    desc: 'Hedef noktaya bir fıçı atarsın; yere çarpınca 3,2 metre yarıçapta ateş hasarı verir. 45 saniye bekleme.',
    cost: 0, cooldown: 45, castTime: 0, hitTime: 0.6, anim: '2H_Melee_Attack_Chop', animSpeed: 1.1,
    targeting: 'ground_aoe', range: 22, radius: 3.2, damage: { coef: 2.2, type: 'fire' }, pip: { id: 'chi', gain: 1 },
    tags: ['spell', 'ground', 'aoe', 'fire', 'keg', 'spec'], vfx: { ground: 'brew_splash', impact: 'fire_burst' }, sfx: { cast: 'whoosh', impact: 'explosion' },
    params: { end: 0.8, chain: 0.1, move: 0.2, stagger: 12, proc: 1, weight: 2, keg: 1, threatMult: 3 },
  });
  // Öz Çeşmesi (Essence Font), Sis Dokuyan: party heal around the caster. The lasting orb (6 targets over 6 s) is a stand-in here (hook).
  add({
    id: 'monk_essence_font', classId: 'monk', spec: 'monk_mistweaver', name: 'Öz Çeşmesi (Essence Font)', icon: I('skill-holy-nova'), unlockLevel: 1,
    desc: 'Çevrendeki müttefiklere öz çeşmesi gibi bir iyileştirme yayarsın. 15 saniye bekleme.',
    cost: 12, cooldown: 15, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'self_aoe', radius: 10, behavior: 'monk_revival', heal: { coef: 0.9 }, allyTarget: 'friendly',
    tags: ['spell', 'heal', 'aoe', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.7, chain: 0.1, move: 0.2, weight: 0, dispel: 0 },
  });
}
