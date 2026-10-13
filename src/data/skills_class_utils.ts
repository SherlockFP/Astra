/**
 * GDD_TALENTS §1.4 class utility skills (the s05 choice of every class tree, 18 new rows). OWNER: combat (T9).
 * Merged into SKILLS at the end of data/skills.ts (Object.assign). Behaviours: combat/skills/utilities.ts.
 *
 * Every row is granted by its class tree node only (`unlockLevel 99`, no default slot). All interrupts share the
 * behaviour `interrupt`: it cuts an interruptible cast, locks that ability for 4 s, and applies the silence / stun
 * given in `params` (default silence 3 s; bosses only lose the cast). `params.gainRes` is refunded on a successful cut.
 */
import type { SkillDef } from '../types/skills';

const I = (n: string) => `/assets/icons/${n}.svg`;

type Row = Pick<SkillDef, 'id' | 'classId' | 'name' | 'desc' | 'icon' | 'anim' | 'targeting' | 'cost' | 'cooldown' | 'behavior' | 'tags'>
  & Partial<Pick<SkillDef, 'animSpeed' | 'range' | 'arc' | 'radius' | 'statuses' | 'selfStatuses' | 'pip' | 'vfx' | 'params'>>;

/** Shared row defaults: unlockLevel 99 (granted by the node), instant, hit at 0.3 s, the template params of §1.4. */
function row(r: Row): SkillDef {
  return {
    unlockLevel: 99,
    castTime: 0,
    hitTime: 0.3,
    animSpeed: 1,
    ...r,
    params: { end: 0.5, chain: 0.1, move: 0.15, weight: 0, ...(r.params ?? {}) },
  } as SkillDef;
}

const ROWS: SkillDef[] = [
  // ---- Şövalye ----
  row({
    id: 'knight_intercept', classId: 'knight', name: 'Müdahale', icon: I('skill-charge'),
    desc: 'Seçtiğin müttefike 20 metreye kadar atılırsın (seçili müttefik yoksa 12 metre ileri). Müttefik 4 saniye boyunca %25 daha az hasar alır; sen de 20 Kararlılık kazanırsın.',
    cost: 0, cooldown: 20, targeting: 'custom', anim: 'Dodge_Forward', animSpeed: 1.4, range: 20,
    behavior: 'intercept', tags: ['movement', 'defensive', 'ally'],
    statuses: [{ status: 'intercept_ward', duration: 4 }],
    params: { speed: 30, forward: 12, gainRes: 20 },
  }),
  row({
    id: 'knight_guardian_vow', classId: 'knight', name: 'Muhafız Yemini', icon: I('skill-shield-wall'),
    desc: '25 metre içindeki seçtiğin müttefike 8 saniye boyunca yemin edersin: onun aldığı hasarın %30\'unu sen üstlenirsin (saniyede en fazla maks. canının %15\'i).',
    cost: 0, cooldown: 30, targeting: 'custom', anim: 'Cheer', animSpeed: 1.6, range: 25,
    behavior: 'guardian_vow', tags: ['defensive', 'buff', 'ally'],
    statuses: [{ status: 'guardian_vow', duration: 8 }],
  }),

  // ---- Barbar ----
  row({
    id: 'barbarian_pummel', classId: 'barbarian', name: 'Yumruk Darbesi', icon: I('skill-double-strike'),
    desc: '3 metre içindeki büyü yapan bir düşmanı yumruklarsın: büyüsü kesilir, 4 saniye boyunca aynı büyüyü yapamaz ve 0,8 saniye sersemler (boss hariç).',
    cost: 10, cooldown: 12, targeting: 'melee_arc', range: 3, arc: 120, anim: 'Unarmed_Melee_Attack_Punch_A', animSpeed: 1.5,
    behavior: 'interrupt', tags: ['offgcd', 'melee', 'kick'],
    params: { silence: 0, stun: 0.8 },
  }),
  row({
    id: 'barbarian_intimidating_shout', classId: 'barbarian', name: 'Korkutucu Haykırış', icon: I('skill-battle-shout'),
    desc: 'Çevrendeki 6 metre içindeki boss olmayan düşmanlar 6 saniye korkar (seçkin düşmanlar 3 saniye); bosslar 6 saniye boyunca %20 daha az hasar verir.',
    cost: 0, cooldown: 40, targeting: 'self_aoe', radius: 6, anim: 'Cheer', animSpeed: 1.4,
    behavior: 'intimidate', tags: ['shout', 'cc'],
    params: { fear: 6, curse: 6 },
  }),

  // ---- Büyücü ----
  row({
    id: 'mage_counterspell', classId: 'mage', name: 'Büyü Kırma', icon: I('skill-arcane-missiles'),
    desc: '30 metre içindeki büyü yapan bir düşmanın büyüsünü keser ve 3 saniye sessizlik verir (boss hariç). Kesilen büyü 4 saniye boyunca yeniden yapılamaz.',
    cost: 10, cooldown: 20, targeting: 'custom', range: 30, arc: 360, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    behavior: 'interrupt', tags: ['offgcd', 'spell', 'kick'],
    params: { silence: 3 },
  }),
  row({
    id: 'mage_ice_block', classId: 'mage', name: 'Buz Küresi', icon: I('skill-ice-block'),
    desc: '4 saniye dokunulmaz olursun; bu sürede hareket edemez ve beceri kullanamazsın. Bitince maks. canının %20\'si yenilenir; kök ve yavaşlatmayı temizler.',
    cost: 0, cooldown: 120, targeting: 'self_buff', anim: 'Spellcast_Raise', animSpeed: 1.2,
    behavior: 'ice_block', tags: ['defensive'],
    params: { dur: 4, healPct: 0.2 },
  }),

  // ---- Haydut ----
  row({
    id: 'rogue_kick', classId: 'rogue', name: 'Tekme', icon: I('skill-quick-slash'),
    desc: '3 metre içindeki büyü yapan bir düşmanı tekmelersin: büyüsü kesilir ve 3 saniye sessizlik alır (boss hariç).',
    cost: 10, cooldown: 12, targeting: 'melee_arc', range: 3, arc: 120, anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.5,
    behavior: 'interrupt', tags: ['offgcd', 'melee', 'kick'],
  }),
  row({
    id: 'rogue_cloak_of_shadows', classId: 'rogue', name: 'Gölge Pelerini', icon: I('skill-smoke-bomb'),
    desc: '4 saniye boyunca tüm temizlenebilir olumsuz etkilerini kaldırır ve tüm dirençlerini %60 artırırsın.',
    cost: 0, cooldown: 60, targeting: 'self_buff', anim: 'Cheer', animSpeed: 1.8, vfx: { cast: 'buff_aura' },
    behavior: 'status_self', tags: ['defensive'],
    selfStatuses: [{ status: 'cloak_ward', duration: 4 }],
    params: { cleanse: 1 },
  }),

  // ---- Keşiş ----
  row({
    id: 'monk_spear_hand', classId: 'monk', name: 'Mızrak Eli', icon: I('skill-thrust'),
    desc: '4 metre önündeki koni içindeki büyü yapan bir düşmanı keser ve 4 saniye sessizlik verir (boss hariç).',
    cost: 15, cooldown: 15, targeting: 'melee_arc', range: 4, arc: 90, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.5,
    behavior: 'interrupt', tags: ['offgcd', 'melee', 'kick'],
    params: { silence: 4 },
  }),
  row({
    id: 'monk_touch_of_karma', classId: 'monk', name: 'Karma Dokunuşu', icon: I('skill-iron-skin'),
    desc: '6 saniye boyunca aldığın hasarın %60\'ı ertelenir ve izleyen 6 saniyede DoT olarak alınır. Bu DoT seni öldüremez (en az 1 canın kalır).',
    cost: 0, cooldown: 90, targeting: 'self_buff', anim: 'Cheer', animSpeed: 1.4, vfx: { cast: 'buff_aura' },
    behavior: 'karma', tags: ['defensive'],
    selfStatuses: [{ status: 'karma_ward', duration: 6 }],
  }),

  // ---- Okçu ----
  row({
    id: 'archer_muzzle', classId: 'archer', name: 'Susturucu Ok', icon: I('skill-piercing-shot'),
    desc: '25 metre menzildeki bir düşmana ok atarsın: büyüsü kesilir ve 3 saniye sessizlik alır (boss hariç).',
    cost: 15, cooldown: 20, targeting: 'custom', range: 25, arc: 360, anim: '2H_Ranged_Shoot', animSpeed: 1.4,
    behavior: 'interrupt', tags: ['offgcd', 'ranged', 'kick'],
    params: { silence: 3 },
  }),
  row({
    id: 'archer_feign_death', classId: 'archer', name: 'Ölü Taklidi', icon: I('skill-vanish'),
    desc: 'Tüm düşmanların tehdit listesinden çıkarsın ve 4 saniye boyunca gizlenirsin. Gizlilik hasar alsan da bozulmaz; saldırırsan bozulur.',
    cost: 0, cooldown: 30, targeting: 'self_buff', anim: 'Death_A', animSpeed: 0.6,
    behavior: 'feign', tags: ['utility', 'stealth'],
    selfStatuses: [{ status: 'stealth', duration: 4 }, { status: 'feign_death', duration: 4 }],
  }),

  // ---- Paladin ----
  row({
    id: 'paladin_rebuke', classId: 'paladin', name: 'Azarlama', icon: I('skill-smite'),
    desc: '4 metre içindeki büyü yapan bir düşmanı azarlarsın: büyüsü kesilir ve 3 saniye sessizlik alır (boss hariç). 1 Kutsal Güç kazanırsın.',
    cost: 10, cooldown: 15, targeting: 'melee_arc', range: 4, arc: 120, anim: '1H_Melee_Attack_Stab', animSpeed: 1.5,
    behavior: 'interrupt', tags: ['offgcd', 'melee', 'kick', 'holy'],
    pip: { id: 'holypower', gain: 1 },
  }),
  row({
    id: 'paladin_divine_shield', classId: 'paladin', name: 'İlahi Kalkan', icon: I('skill-divine-shield'),
    desc: '5 saniye dokunulmaz olursun ve olumsuz etkilerin hepsi temizlenir. Sonraki 90 saniye boyunca Şifa Eli ve İlahi Kalkan kullanamazsın.',
    cost: 0, cooldown: 150, targeting: 'self_buff', anim: 'Cheer', animSpeed: 1.2, vfx: { cast: 'buff_aura' },
    behavior: 'status_self', tags: ['defensive', 'holy'],
    // forbearance first: a hostile-kind status cannot land while invulnerable
    selfStatuses: [{ status: 'forbearance', duration: 90 }, { status: 'invulnerable', duration: 5 }],
    params: { cleanse: 1 },
  }),

  // ---- Nekromant ----
  row({
    id: 'necro_soul_snap', classId: 'necromancer', name: 'Ruh Koparma', icon: I('skill-curse'),
    desc: '20 metre içindeki büyü yapan bir düşmanın büyüsünü keser ve 3 saniye sessizlik verir (boss hariç). Başarılı kesmede 10 Öz geri kazanırsın.',
    cost: 10, cooldown: 20, targeting: 'custom', range: 20, arc: 360, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    behavior: 'interrupt', tags: ['offgcd', 'spell', 'kick'],
    params: { silence: 3, gainRes: 10 },
  }),
  row({
    id: 'necro_spirit_walk', classId: 'necromancer', name: 'Ruh Yürüyüşü', icon: I('skill-teleport'),
    desc: '4 saniye boyunca hareketin %40 artar, düşmanların içinden geçersin ve fiziksel hasarın %30 azalır.',
    cost: 15, cooldown: 45, targeting: 'self_buff', anim: 'Spellcast_Raise', animSpeed: 1.6, vfx: { cast: 'buff_aura' },
    behavior: 'spirit_walk', tags: ['movement', 'defensive'],
    selfStatuses: [{ status: 'spirit_walk', duration: 4 }],
  }),

  // ---- Warlock ----
  row({
    id: 'warlock_spell_lock', classId: 'warlock', name: 'Büyü Kilidi', icon: I('skill-curse'),
    desc: '30 metre içindeki büyü yapan bir düşmanın büyüsünü keser ve 3 saniye sessizlik verir (boss hariç).',
    cost: 10, cooldown: 24, targeting: 'custom', range: 30, arc: 360, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    behavior: 'interrupt', tags: ['offgcd', 'spell', 'kick'],
    params: { silence: 3 },
  }),
  row({
    id: 'warlock_unending_resolve', classId: 'warlock', name: 'Dayanıklılık Sözleşmesi', icon: I('skill-iron-skin'),
    desc: '8 saniye boyunca aldığın hasar %30 azalır ve kontrol etkilerine karşı bağışık olursun.',
    cost: 0, cooldown: 60, targeting: 'self_buff', anim: 'Cheer', animSpeed: 1.6, vfx: { cast: 'buff_aura' },
    behavior: 'status_self', tags: ['defensive'],
    selfStatuses: [{ status: 'resolve_pact', duration: 8 }],
    params: { ccImmune: 8 },
  }),
];

export const CLASS_UTIL_SKILLS: Record<string, SkillDef> = Object.fromEntries(ROWS.map((r) => [r.id, r]));
