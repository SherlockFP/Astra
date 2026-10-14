/**
 * GDD_CLASSES_V2 §3.3–§3.4 Okçu: archer_basic "Ok Serisi" combo (4 steps) + the 8 core skills. OWNER: archer package.
 * Level-1 deviation (lead brief): archer_disengage (GDD L3) and archer_multishot (GDD L6) are unlockLevel 1 so the level-1 bar has
 * three usable skills. archer_call_pet keeps GDD L10. Custom behaviours are in combat/skills/behaviors_archer.ts (BEHAVIORS_ARCHER).
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;
const BASIC = 'Ok Serisi (Auto Shot)';

export function registerArcher(add: SkillAdd): void {
  // Coşku (Exhilaration): heals you and your pet
  add({
    id: 'archer_exhilaration', classId: 'archer', name: 'Coşku (Exhilaration)', icon: I('skill-heal'), unlockLevel: 10,
    desc: 'Kendini ve yoldaşını iyileştirirsin: sen maks. canının, yoldaşın da kendi canının bir kısmını geri kazanır. 90 saniye bekleme.',
    cost: 20, cooldown: 90, castTime: 0, hitTime: 0.2, anim: 'Spellcast_Shoot', animSpeed: 1.2,
    targeting: 'self_buff', behavior: 'heal_self_pet', heal: { coef: 0.8 },
    tags: ['spell', 'heal', 'defensive'], vfx: { cast: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { petCoef: 0.8, end: 0.5, chain: 0.1, move: 0.1, weight: 0 },
  });
  // Yanıltma (Misdirection): 8 s threat redirect to the picked ally (the tank); needs an ally in reach
  add({
    id: 'archer_misdirection', classId: 'archer', name: 'Yanıltma (Misdirection)', icon: I('skill-taunt'), unlockLevel: 10,
    desc: '25 metre içindeki seçtiğin müttefike 8 saniye boyunca tehdidini yönlendirirsin: senin verdiğin tehdit onun üstüne yazılır. Seçili müttefik yoksa kullanılamaz. 30 saniye bekleme.',
    cost: 0, cooldown: 30, castTime: 0, hitTime: 0.2, anim: 'Cheer', animSpeed: 1.4,
    targeting: 'custom', behavior: 'misdirect', allyTarget: 'friendly', range: 25,
    selfStatuses: [{ status: 'misdirection', duration: 8 }],
    tags: ['spell', 'utility', 'threat', 'ally'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.5, chain: 0.1, move: 0.1, weight: 0 },
  });
  // ---- LMB chain (GDD §3.3): 4 steps, cadence 0.220 + 0.190 + 0.243 + 0.467 = 1.120 s, sum of coef 3.59
  add({
    id: 'archer_basic', classId: 'archer', name: BASIC, icon: I('skill-piercing-shot'), defaultSlot: 'lmb',
    desc: 'Yayı kullanarak dört atışlık bir seri yaparsın: tek ok, çift ok, delici ok ve tüm hattı delen tam çekiş. Her isabet Odak kazandırır.',
    anim: '2H_Ranged_Shoot', targeting: 'projectile', range: 28, tags: ['ranged', 'basic', 'combo', 'projectile', 'physical'],
    behavior: 'combo', params: { steps: 4, reset: 0.8 },
  });
  add({
    id: 'archer_basic_1', classId: 'archer', name: BASIC, icon: I('skill-piercing-shot'),
    desc: 'Hızlı ok: tek bir ok atarsın.', anim: '2H_Ranged_Shoot', animSpeed: 2.0, hitTime: 0.32, targeting: 'projectile', range: 28,
    speed: 55, radius: 0.3, count: 1, pierce: 0, damage: { coef: 0.58, type: 'physical' }, knockback: 0.5,
    tags: ['ranged', 'basic', 'projectile', 'physical'], vfx: { projectile: 'arrow_projectile', trail: 'arrow_trail', impact: 'hit_spark' },
    sfx: { cast: 'bow_shot', impact: 'arrow_hit' },
    params: { end: 0.62, chain: 0.03, move: 0.08, stagger: 3, proc: 0.7, gain: 4, weight: 0, upper: 1, slow: 0.25, step: 1 },
  });
  add({
    id: 'archer_basic_2', classId: 'archer', name: BASIC, icon: I('skill-piercing-shot'),
    desc: 'Çift ok: iki ok yan yana gönderirsin.', anim: '2H_Ranged_Shoot', animSpeed: 2.0, hitTime: 0.32, targeting: 'projectile', range: 28,
    speed: 55, radius: 0.3, count: 2, spread: 6, pierce: 0, damage: { coef: 0.38, type: 'physical' }, knockback: 0.7,
    tags: ['ranged', 'basic', 'projectile', 'physical'], vfx: { projectile: 'arrow_projectile', trail: 'arrow_trail', impact: 'hit_spark' },
    sfx: { cast: 'bow_shot', impact: 'arrow_hit' },
    params: { end: 0.62, chain: 0.03, move: 0.08, stagger: 3, proc: 0.7, gain: 4, gainExtra: 2, gainMax: 2, weight: 0, upper: 1, slow: 0.25, step: 2 },
  });
  add({
    id: 'archer_basic_3', classId: 'archer', name: BASIC, icon: I('skill-piercing-shot'),
    desc: 'Delici ok: daha ağır, iki düşmanı delen bir ok.', anim: '2H_Ranged_Shoot', animSpeed: 1.5, hitTime: 0.32, targeting: 'projectile', range: 28,
    speed: 60, radius: 0.3, count: 1, pierce: 2, damage: { coef: 0.95, type: 'physical' }, knockback: 1.2,
    tags: ['ranged', 'basic', 'projectile', 'physical'], vfx: { projectile: 'arrow_projectile', trail: 'arrow_trail', impact: 'hit_spark' },
    sfx: { cast: 'bow_shot', impact: 'arrow_hit' },
    params: { end: 0.64, chain: 0.04, move: 0.1, stagger: 5, proc: 0.8, gain: 6, weight: 1, upper: 1, slow: 0.35, step: 3 },
  });
  add({
    id: 'archer_basic_4', classId: 'archer', name: BASIC, icon: I('skill-piercing-shot'),
    desc: 'Tam çekiş: hattaki her düşmanı delen, kalkan dalgası yaratan dördüncü ok.', anim: '2H_Ranged_Shoot', animSpeed: 0.75, hitTime: 0.32, targeting: 'projectile', range: 28,
    speed: 70, radius: 0.35, count: 1, pierce: 99, damage: { coef: 1.3, type: 'physical' }, knockback: 2.0,
    tags: ['ranged', 'basic', 'projectile', 'physical', 'finisher'], vfx: { projectile: 'arrow_projectile', trail: 'arrow_trail', impact: 'shockwave' },
    sfx: { cast: 'bow_shot', impact: 'arrow_hit' },
    params: { end: 0.64, chain: 0.06, move: 0.2, stagger: 9, proc: 1, gain: 8, weight: 1, upper: 0, slow: 0.6, step: 4, finisher: 1 },
  });

  // ---- Nişanlı Atış (rmb, GDD §3.4): hold to draw. Channel of up to 1.0 s; the arrow is released in behaviour archer_charge_shot.
  add({
    id: 'archer_aimed_shot', classId: 'archer', name: 'Nişanlı Atış (Aimed Shot)', icon: I('skill-aimed-shot'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Tuşu basılı tutarak yayı çeker, bırakınca %220–%400 hasar veren delici bir ok atarsın. Çekerken yavaşlarsın.',
    cost: 25, cooldown: 0, castTime: 0, channel: 1.0, hitTime: 0.2, anim: '2H_Ranged_Aiming', holdAnim: '2H_Ranged_Aiming',
    targeting: 'projectile', range: 35, speed: 75, radius: 0.35, count: 1, pierce: 1, damage: { coef: 2.2, type: 'physical' },
    behavior: 'archer_charge_shot', tags: ['ranged', 'projectile', 'physical', 'charge'],
    vfx: { projectile: 'arrow_projectile', trail: 'arrow_trail', impact: 'hit_spark' }, sfx: { cast: 'bow_draw', impact: 'arrow_hit' },
    // chargeMax 1.0 s (full draw); coefMin / coefMax = 2.2 / 4.0 (damage.coef is the minimum); critMax 0.25 is a hook (see the report)
    params: { chargeMax: 1, coefMin: 2.2, coefMax: 4.0, critMax: 0.25, minCharge: 0.25, zoomFov: -3, slow: 0.5, end: 0.7, chain: 0.08, move: 0.15, stagger: 8, proc: 1, weight: 1 },
  });

  // ---- Geri Sıçrayış (q, GDD §3.4): dash 7 m backwards, origin ring, free arrow on landing; quick_draw for the next Nişanlı Atış.
  add({
    id: 'archer_disengage', classId: 'archer', name: 'Geri Sıçrayış (Disengage)', icon: I('skill-vanish'), unlockLevel: 1, defaultSlot: 'q',
    desc: 'Geriye 7 metre sıçrar, çevrendekileri yavaşlatıp iter ve inerken en yakın düşmana %140 hasarlı bir ok atarsın. Sonraki Nişanlı Atış anında tam çekilir.',
    // the stock dash travels 0.8 x range without a target: range 8.75 gives the GDD's 7 m hop
    cost: 10, cooldown: 9, castTime: 0, anim: 'Dodge_Backward', animSpeed: 1.0, hitTime: 0.05, targeting: 'dash', range: 8.75,
    behavior: 'archer_disengage', damage: { coef: 1.4, type: 'physical' },
    selfStatuses: [{ status: 'iframes', duration: 0.25 }, { status: 'quick_draw', duration: 2.5 }],
    tags: ['movement', 'ranged', 'physical'], vfx: { cast: 'dodge_dust', impact: 'hit_spark' }, sfx: { cast: 'whoosh', impact: 'bow_shot' },
    // ring: origin radius 3 m, slow 40 % for 2 s, knockback 2 m; landShot = landing arrow coefficient (damage.coef)
    params: { back: 1, landShot: 1.4, speed: 30, unstoppable: 1, end: 0.45, chain: 0.05, move: 0, stagger: 6, proc: 0.5, weight: 0, ringRadius: 3, ringSlow: 0.4, ringSlowSec: 2, ringKnock: 2, landRange: 20 },
  });

  // ---- Çoklu Atış (e, GDD §3.4): five arrows, 0.9 each, spread 9 degrees
  add({
    id: 'archer_multishot', classId: 'archer', name: 'Çoklu Atış (Multi-Shot)', icon: I('skill-multishot'), unlockLevel: 1, defaultSlot: 'e',
    desc: 'Beş ok birden atarsın; her biri %90 hasar verir. Yakın mesafede tüm oklar çarpar.',
    cost: 30, cooldown: 4, castTime: 0, anim: '2H_Ranged_Shoot', animSpeed: 1.3, hitTime: 0.32, targeting: 'projectile', range: 22,
    speed: 55, radius: 0.3, count: 5, spread: 9, pierce: 0, damage: { coef: 0.9, type: 'physical' }, knockback: 0.6,
    tags: ['ranged', 'projectile', 'aoe', 'physical'], vfx: { projectile: 'arrow_projectile', impact: 'hit_spark' },
    sfx: { cast: 'bow_shot', impact: 'arrow_hit' },
    params: { end: 0.64, chain: 0.08, move: 0.15, stagger: 3, proc: 0.7, weight: 0, upper: 1, slow: 0.4 },
  });

  // ---- Yoldaş Çağır (s1, L10, GDD §3.4): summon the wolf; recast mends a hurt pet (<70 %) and dismisses a healthy one.
  add({
    id: 'archer_call_pet', classId: 'archer', name: 'Yoldaş Çağır (Call Pet)', icon: I('skill-battle-shout'), unlockLevel: 10, defaultSlot: 's1',
    desc: 'Kurt yoldaşını çağırır; yaşıyorsa ve yaralıysa iyileştirir, tam canındaysa geri gönderir. Yoldaş ölürse 10 sn sonra kendiliğinden döner.',
    cost: 0, cooldown: 6, castTime: 0, anim: 'Use_Item', animSpeed: 1.6, hitTime: 0.72, targeting: 'summon',
    behavior: 'archer_call_pet', minion: { id: 'archer_wolf', count: 1, cap: 1, group: 'pet' },
    tags: ['summon', 'pet', 'utility'], vfx: { cast: 'pet_summon' }, sfx: { cast: 'wolf_howl' },
    params: { end: 0.9, chain: 0.1, move: 0.15, weight: 0, mend: 0.35, mendSec: 3, mendBelow: 0.7 },
  });

  // ---- Pençe Tuzağı (s2, L15, GDD §3.4): ground trap, arms after 0.8 s, max 2 traps, 25 s life; trigger roots 2.5 s and bleeds
  add({
    id: 'archer_snare_trap', classId: 'archer', name: 'Pençe Tuzağı (Snare Trap)', icon: I('skill-snare-trap'), unlockLevel: 1, defaultSlot: 's2',
    desc: 'Yere bir tuzak kurarsın (25 sn, en fazla 2). Düşman basınca 2.5 sn köklenir, %150 hasar alır ve kanar.',
    cost: 20, cooldown: 14, castTime: 0, anim: 'Throw', animSpeed: 1.5, hitTime: 0.615, targeting: 'ground_aoe', range: 7, radius: 1.8,
    behavior: 'archer_trap', damage: { coef: 1.5, type: 'physical' },
    statuses: [{ status: 'root', duration: 2.5 }, { status: 'bleed', duration: 6, magnitude: 1.0 }],
    tags: ['trap', 'ground', 'aoe', 'physical'], vfx: { ground: 'trap_ring', impact: 'trap_snap' }, sfx: { cast: 'trap_arm', impact: 'trap_snap' },
    params: { trapArm: 0.8, trapMax: 2, trapLife: 25, stagger: 12, proc: 1, weight: 1, end: 0.95, chain: 0.1, move: 0.2 },
  });

  // ---- Patlayıcı Ok (s3, L20, GDD §3.4): explodes r 3.2, 2.4 fire, burn; +35 % when the target is rooted (route status form)
  add({
    id: 'archer_explosive_arrow', classId: 'archer', name: 'Patlayıcı Atış (Explosive Shot)', icon: I('skill-fire-arrow'), unlockLevel: 20, defaultSlot: 's3',
    desc: 'Çarptığında patlayan ok: %240 ateş hasarı verir ve yakar. Köklenmiş hedeflere Tuzak\'tan sonra %35 daha güçlüdür.',
    cost: 35, cooldown: 7, castTime: 0, anim: '2H_Ranged_Shoot', animSpeed: 1.0, hitTime: 0.32, targeting: 'projectile', range: 30,
    speed: 55, radius: 0.4, count: 1, pierce: 0, damage: { coef: 2.4, type: 'fire' }, knockback: 1.5,
    statuses: [{ status: 'burn', duration: 4, magnitude: 0.4 }],
    route: { from: ['@status:root'], window: 3, more: 0.35 },
    tags: ['ranged', 'projectile', 'fire', 'aoe'], vfx: { projectile: 'fire_projectile', impact: 'fire_burst' },
    sfx: { cast: 'bow_shot', impact: 'fire_impact' },
    params: { end: 0.66, chain: 0.1, move: 0.2, stagger: 8, proc: 1, weight: 1, upper: 0, slow: 0.5, explode: 3.2, element: 1 },
  });

  // ---- Avcı İşareti (kitap, L25, no bar slot, GDD §3.4): 12 s mark on the soft target. The mark is the Son Atış route window.
  add({
    id: 'archer_hunters_mark', classId: 'archer', name: "Avcı İşareti (Hunter's Mark)", icon: I('skill-curse'), unlockLevel: 25,
    desc: 'Hedefi 12 sn işaretlersin: hedef %8 fazla hasar alır. Son Atış bu işaretli hedefe +%25 hasar verir.',
    cost: 0, cooldown: 20, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.8, hitTime: 0.373, targeting: 'custom', range: 32,
    behavior: 'archer_hunters_mark', requires: { target: 'enemy' }, tags: ['utility', 'debuff', 'spell'],
    // the mark is applied by the behaviour (archer_hunters_mark); this row is the status the talent DSL reads (sdur=hunters_mark)
    statuses: [{ status: 'hunters_mark', duration: 12 }],
    vfx: { cast: 'mark_loop' }, sfx: { cast: 'buff' },
    params: { end: 0.5, chain: 0.05, move: 0.1, weight: 0, markSec: 12 },
  });

  // ---- Ok Fırtınası (r, L30, GDD §3.4): ground zone r 7, 14 waves of 0.8 over 3.5 s, slow 30 % per wave. Wind-up 0.5 s.
  add({
    id: 'archer_arrow_storm', classId: 'archer', name: 'Ok Yağmuru (Volley)', icon: I('skill-arrow-volley'), unlockLevel: 30, defaultSlot: 'r',
    desc: 'Hedef bölgeye 3.5 sn boyunca ok yağdırır, 14 dalgada her düşmana %80 hasar verir ve yavaşlatırsın.',
    cost: 40, cooldown: 60, castTime: 0.5, anim: '2H_Ranged_Shoot', animSpeed: 0.8, hitTime: 0.5, targeting: 'ground_aoe', range: 24, radius: 7,
    duration: 3.5, ticks: 14, damage: { coef: 0.8, type: 'physical' }, statuses: [{ status: 'slow', duration: 0.6, magnitude: 0.3 }],
    tags: ['ultimate', 'aoe', 'ranged', 'physical'], vfx: { ground: 'arrow_rain', impact: 'hit_spark' }, sfx: { cast: 'bow_shot', impact: 'arrow_hit' },
    params: { tick: 0.25, slow: 0.5, end: 0.9, chain: 0.2, move: 0.25, stagger: 1, proc: 0.25, weight: 3 },
  });
}
