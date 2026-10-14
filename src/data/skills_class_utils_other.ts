/**
 * Mage, rogue, monk, archer and warlock class utility rows (moved verbatim, PM-00c). No plate-melee package touches this file.
 * Merged into CLASS_UTIL_SKILLS by data/skills_class_utils.ts.
 */
import type { SkillDef } from '../types/skills';
import { I, row } from './skills_class_utils_row';

export const OTHER_UTIL_ROWS: SkillDef[] = [
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
    id: 'rogue_cloak_of_shadows', classId: 'rogue', name: 'Gölge Pelerini (Cloak of Shadows)', icon: I('skill-smoke-bomb'),
    desc: '4 saniye boyunca tüm temizlenebilir olumsuz etkilerini kaldırır ve tüm dirençlerini %60 artırırsın. Shift+ çubuğunda.',
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
