/**
 * Leş Uyanışı (`les_uyanisi`) enemy defs: the 13 trash types (one of them the skull swarm), the two derived Amarth adds, the
 * Leş Kurdu worm, the Dikiş Yaratığı construct and the four bosses. Source: docs/dungeons/les_uyanisi.md sections 4 and 5.
 * Registration: enemies.ts must `import './enemies_les_uyanisi'` (side effect: fills ENEMIES and BOSSES, like peri).
 *
 * Deviations from the doc (the engine lacks the piece today; each one is a shared item listed in the report):
 * - no `EnemyAbility.string` and no `leap` builder: multi-hit attacks are one cone with the summed coefficient, leaps are charges.
 *   The boss strings run through bossString in the boss script instead.
 * - no `M()` / MODEL table entries (enemyModels.ts is shared and its MODEL table is empty): the NEW creature models are the
 *   doc's fallbacks, written into LES_MODEL here.
 * - no CUSTOM handler for the worm gorge (abilities.ts is shared): the worm stacks are counted by the Amarth-free Çürükkemik script.
 * - no Siphoner / Dark Exile (needs the `boss_tp` message and the exile room, see the report).
 * - the new statuses of the doc (heal_cut, tank_stack, frost_mark, weapon_mark, ...) are not used; the two statuses that exist
 *   are `root` and `shield`, plus `poison`, `bleed`, `chill`, `slow`, `silence`, `knockdown`, `stun`, `sunder`, `enrage`, `necrotic`.
 * - poise on elites and bosses is set through `Object.assign` after `add()` / `boss()` (the Spec type has no poise fields).
 * OWNER: enemies module.
 */
import type { EnemyAbility, EnemyDef } from '../types/enemies';
import {
  add, boss, BOSSES, charge, cone, aoe, buff, heal, line, onDeath, passive, proj, ENEMIES, bleed, poison, chill,
  A_ENEMY, A_GEN, A_KAYKIT, A_SKEL, A_WOLF, R_SKELETON, W_BLADE, ROGUE_HIDE, bp, custom, type Anims, type BossSpec,
} from './enemyKit';
import { CHAR, GEN, GENB, ITCH, MON, SKEL, WPN } from './enemyModels';

// ---------------------------------------------------------------------------------------------------------------------
// Local model table (the doc's section 2.8 fallbacks; the NEW models swap in here when their GLBs land)
// ---------------------------------------------------------------------------------------------------------------------
const A_DRAKE: Anims = { idle: 'Fly', walk: 'Fly', run: 'Fly', hit: 'Hit', death: 'Death' };
const A_SKULL: Anims = { idle: 'Idle', walk: 'Walk', run: 'Walk', hit: 'HitRecieve', death: 'Death' };
const LES_MODEL = {
  curukkemik: { model: GENB('mantar_kral'), scale: 0.8, tint: 0xa8b890, anims: A_GEN },
  hasatci_amarth: { model: GENB('kizil_ejder'), scale: 0.8, tint: 0xcfc8b0, anims: A_DRAKE },
  ayazbaglayan: { model: GENB('golge_rahibesi'), scale: 0.8, tint: 0xa8d8ff, anims: A_GEN },
  veba_torbasi: { model: GEN('slime_green'), scale: 1.8, tint: 0xb8a868, anims: A_GEN },
  iskelet_canavari: { model: GEN('golem_stone'), scale: 1.2, tint: 0xe0d8c0, anims: A_GEN },
  dikis_yaratigi: { model: MON('Giant'), scale: 1.2, tint: 0xb08070, anims: A_ENEMY },
} as const;

const GOLD_BONE = 0xe8d8a0;
const VIOLET_BONE = 0xc8b8e0;
const GREEN = 0x9aff50;
const R_FLESH: EnemyDef['resist'] = { poison: 0.75, shadow: 0.25, holy: -0.25 };
const R_NECRO: EnemyDef['resist'] = { shadow: 0.5, poison: 0.5, frost: 0.25, holy: -0.25 };
const ROGUE_KEEP_KNIFE = ROGUE_HIDE.filter((n) => n !== 'Knife');
const A_SKEL_COMBAT: Anims = { ...A_SKEL, idle: 'Idle_Combat', walk: 'Walking_A', run: 'Running_A' };

/** Posture fields the Spec type does not carry (elites and bosses). */
interface Posture { poise?: number; poiseRegen?: number; poiseDelay?: number; hyperArmor?: number; profile?: EnemyDef['profile'] }
const posture = (id: string, p: Posture): void => {
  const d = ENEMIES[id] ?? BOSSES[id];
  if (d) Object.assign(d, p);
};

// ---------------------------------------------------------------------------------------------------------------------
// Reanimated Gökbekçi dead (plaza, Bastion, the courtyard)
// ---------------------------------------------------------------------------------------------------------------------
add({
  id: 'les_kirik_savasci', name: 'Kırık Kemik Savaşçısı', model: SKEL('Skeleton_Minion'), scale: 1.0, tint: GOLD_BONE, role: 'melee', rank: 'trash',
  hp: 1.2, dmg: 1.0, speed: 5.9, radius: 0.55, aggro: 9, forces: 3, anims: A_SKEL, resist: R_SKELETON, ai: { bonePile: 12 },
  visual: { attach: W_BLADE, hide: ['Skeleton_Minion_Cloak'], eyeEmissive: 0xa8ff60, runRef: 7 },
  basic: cone('les_ks_chop', 'Kemik Kılıcı', 2.4, 90, 2.0, 1.0, '1H_Melee_Attack_Chop', 0.58, { windup: 0.7 }),
  abilities: [
    // Parçalayıcı Vuruş (2 hits with bleed) as one cone with the summed coefficient (no `string` field yet)
    cone('les_ks_rend', 'Parçalayıcı Vuruş', 2.8, 70, 9, 1.8, '1H_Melee_Attack_Slice_Diagonal', 0.38,
      { initialCooldown: 3, windup: 0.91, telegraph: true, statuses: [bleed(2, 0.25, 8)], dispel: 'bleed' }),
    charge('les_ks_leap', 'Atılış Kesiği', 7, 14, 0.8, 1.4, '1H_Melee_Attack_Jump_Chop', 0.5, { initialCooldown: 5, parryable: false }),
  ],
});
add({
  id: 'les_kirik_buyucu', name: 'Kırık Kemik Büyücüsü', model: SKEL('Skeleton_Mage'), scale: 1.0, tint: VIOLET_BONE, role: 'caster', rank: 'trash',
  hp: 1.0, dmg: 1.2, speed: 4.9, radius: 0.5, aggro: 12, forces: 4, anims: A_SKEL, resist: R_SKELETON, ai: { kite: [9, 16], bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Staff'), bone: 'handslot.r', pos: [0, 0, 0], rotY: Math.PI }], eyeEmissive: 0x9a60ff, runRef: 7 },
  basic: proj('les_kb_spark', 'Gölge Kıvılcımı', 16, 20, 2.6, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    proj('les_kb_frostbolt', 'Don Oku', 14, 22, 7, 1.8, 1.8, 'frost', 'frost_projectile', 'Spellcast_Shoot', 0.3,
      { castTime: 1.8, interruptible: true, kick: 2, initialCooldown: 2, statuses: [chill(1, 5)], sfx: 'frost_cast' }),
    aoe('les_kb_nova', 'Don Halkası', 'self_aoe', 4.5, 0, 12, 0.91, 1.2, 'frost', 'Spellcast_Long', 0.5,
      { initialCooldown: 6, statuses: [chill(1, 4)], vfx: 'frost_burst' }),
  ],
});
add({
  id: 'les_arbaletci', name: 'Diriltilmiş Arbaletçi', model: SKEL('Skeleton_Rogue'), scale: 1.0, tint: GOLD_BONE, role: 'ranged', rank: 'trash',
  hp: 0.9, dmg: 1.2, speed: 5.6, radius: 0.5, aggro: 12, forces: 4, anims: A_SKEL, resist: R_SKELETON, ai: { kite: [8, 14], bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Crossbow'), bone: 'handslot.r', pos: [-0.105, -0.01, 0], rotY: Math.PI / 2 }], eyeEmissive: 0xa8ff60, runRef: 7 },
  basic: proj('les_ar_bolt', 'Kemik Ok', 22, 18, 2.4, 0.7, 1.0, 'physical', 'arrow_projectile', '2H_Ranged_Shoot', 0.15, { sfx: 'crossbow_shot' }),
  abilities: [
    proj('les_ar_rot', 'Çürük Ok', 20, 18, 8, 0.85, 1.6, 'poison', 'poison_projectile', '2H_Ranged_Shoot', 0.15,
      { telegraph: true, initialCooldown: 4, statuses: [poison(2, 0.2, 8)], dispel: 'poison' }),
    // Çoklu Ok: three hitscan lines in one volley (projectile count, spread)
    { id: 'les_ar_volley', name: 'Çoklu Ok', kind: 'projectile', range: 18, cooldown: 12, windup: 1.1, telegraph: true,
      damage: { coef: 0.9, type: 'physical' }, projectile: { speed: 30, radius: 0.6, vfx: 'arrow_projectile', count: 3, spread: 15 },
      anim: '2H_Ranged_Shoot', params: { impact: 0.15, hitscan: 1 }, sfx: 'crossbow_shot' } satisfies EnemyAbility,
  ],
});

// ---------------------------------------------------------------------------------------------------------------------
// Plague (bloated, patrols) and the Stitchwerks flesh
// ---------------------------------------------------------------------------------------------------------------------
add({
  id: 'les_veba_torbasi', name: 'Veba Torbası', model: LES_MODEL.veba_torbasi.model, scale: LES_MODEL.veba_torbasi.scale,
  tint: LES_MODEL.veba_torbasi.tint, role: 'melee', rank: 'trash', hp: 2.0, dmg: 0.8, speed: 3.4, radius: 0.9, aggro: 6, forces: 5,
  anims: LES_MODEL.veba_torbasi.anims, resist: R_FLESH, emissive: 0x405010, ai: { patrolMul: 0.5 }, visual: { emissiveIntensity: 0.3 },
  basic: cone('les_vt_slam', 'Şişkin Yumruk', 2.2, 100, 2.4, 1.0, 'Attack', 0.57, { windup: 0.7 }),
  abilities: [
    cone('les_vt_vomit', 'Kusma Dalgası', 6, 60, 10, 1.8, 'Attack', 0.5, { initialCooldown: 4, windup: 0.9, telegraph: true, parryable: false,
      statuses: [poison(1, 0.2, 6)], dispel: 'poison' }),
    charge('les_vt_roll', 'Yuvarlanış', 10, 16, 0.87, 1.6, 'Attack', 0.5, { initialCooldown: 7 }),
    onDeath(aoe('les_vt_guts', 'İçini Boşalt', 'self_aoe', 4, 0, 0, 0.91, 1.4, 'poison', '', 0,
      { telegraph: true, vfx: 'poison_cloud', params: { persist: 8, tick: 1, persistCoef: 0.4 } })),
  ],
});
add({
  id: 'les_canavar', name: 'İskelet Canavarı', model: LES_MODEL.iskelet_canavari.model, scale: LES_MODEL.iskelet_canavari.scale,
  tint: LES_MODEL.iskelet_canavari.tint, role: 'tank', rank: 'elite', hp: 5.5, dmg: 1.8, speed: 4.4, radius: 1.15, aggro: 10, forces: 12,
  anims: LES_MODEL.iskelet_canavari.anims, resist: R_SKELETON, ai: { bonePile: 20 },
  basic: cone('les_cn_smash', 'Kemik Ezici', 3.6, 120, 3.0, 1.2, 'Attack', 0.47, { windup: 0.77 }),   // 2-hit smash, summed
  abilities: [
    aoe('les_cn_quake', 'Kemik Sarsıntısı', 'self_aoe', 6, 6, 13, 1.0, 2.2, 'physical', 'Attack2', 0.47,
      { statuses: [{ status: 'knockdown', duration: 0.8 }], vfx: 'ground_slam', sfx: 'ground_slam' }),
    cone('les_cn_gore', 'Parçalayıcı Pençe', 5, 60, 18, 3.6, 'Attack', 0.47, { initialCooldown: 6, windup: 1.2, telegraph: true, tankBuster: true,
      perilous: true, parryable: false, statuses: [bleed(3, 0.3, 10)], dispel: 'bleed' }),
    charge('les_cn_leap', 'Kemik Atılışı', 9, 22, 0.9, 1.8, 'Attack2', 0.5, { initialCooldown: 10, parryable: false }),
  ],
});
posture('les_canavar', { poise: 300, poiseRegen: 0.1, poiseDelay: 3, profile: 'buster' });

add({
  id: 'les_dikisli_onder', name: 'Dikişli Öncü', model: MON('Zombie'), scale: 1.05, tint: 0xc8a898, role: 'melee', rank: 'trash',
  hp: 1.6, dmg: 1.2, speed: 5.2, radius: 0.6, aggro: 9, forces: 5, anims: A_ENEMY, resist: R_FLESH, visual: { eyeEmissive: GREEN },
  basic: cone('les_do_claw', 'Dikişli Pençe', 2.4, 100, 3.0, 1.0, 'Attack', 0.37, { windup: 0.7 }),
  abilities: [
    buff('les_do_rage', 'Kaynayan Öfke', 1.5, 16, [{ status: 'enrage', duration: 10 }], 'Attack', 0.37,
      { interruptible: true, kick: 1, initialCooldown: 4 }),
    charge('les_do_hop', 'Dikiş Sıçrayışı', 8, 15, 0.8, 1.4, 'Jump', 0.5, { initialCooldown: 6, parryable: false }),
  ],
});
posture('les_dikisli_onder', { profile: 'bruiser' });

add({
  id: 'les_les_toplayici', name: 'Leş Toplayıcı', model: CHAR('Rogue_Hooded'), scale: 1.0, tint: 0x7a8a60, role: 'caster', rank: 'trash',
  hp: 1.2, dmg: 1.2, speed: 5.0, radius: 0.5, aggro: 11, forces: 5, anims: A_KAYKIT, resist: R_FLESH, ai: { kite: [7, 13] },
  visual: { hide: ROGUE_KEEP_KNIFE, runRef: 6 },
  basic: proj('les_lt_scrap', 'Çürük Et', 14, 16, 2.6, 0.7, 1.0, 'poison', 'poison_projectile', 'Throw', 0.75),
  abilities: [
    aoe('les_lt_throw', 'Et Fırlat', 'ground_aoe', 2.5, 16, 8, 0.91, 1.2, 'poison', 'Throw', 0.75,
      { vfx: 'poison_cloud', params: { target: 1, persist: 4, tick: 1, persistCoef: 0.3 } }),
    // Sıvı Çek: 3 s channel that heals the caster (must be interrupted)
    { id: 'les_lt_drain', name: 'Sıvı Çek', kind: 'custom', range: 13, cooldown: 14, initialCooldown: 5, windup: 0.5, castTime: 3.0,
      interruptible: true, kick: 2, damage: { coef: 0.55, type: 'poison' }, anim: 'Spellcast_Raise',
      params: { loop: 1, tick: 0.5, healMult: 2.5, impact: 0.33 } } satisfies EnemyAbility,
    line('les_lt_hook', 'Tırpan Kancası', 12, 1.4, 20, 0.91, 1.4, 'physical', 'Throw', 0.6,
      { telegraph: true, initialCooldown: 9, knockback: -4 }),
  ],
});
add({
  id: 'les_et_zanaatkari', name: 'Et Zanaatkârı', model: CHAR('Barbarian'), scale: 1.1, tint: 0xa88070, role: 'support', rank: 'trash',
  hp: 1.3, dmg: 1.0, speed: 4.8, radius: 0.6, aggro: 11, forces: 5, anims: A_KAYKIT, resist: R_FLESH, ai: { kite: [5, 10] }, visual: { runRef: 6 },
  basic: cone('les_ez_cleaver', 'Satır', 2.4, 90, 2.4, 1.2, '1H_Melee_Attack_Chop', 0.5, { windup: 0.77 }),
  abilities: [
    line('les_ez_throw', 'Satır Fırlat', 16, 1.6, 10, 0.91, 1.4, 'physical', 'Throw', 0.6, { telegraph: true, initialCooldown: 3 }),
    heal('les_ez_repair', 'Et Onarımı', 2.5, 12, 0.3, 'Spellcast_Raise', 0.5, { kick: 2, initialCooldown: 5 }),
    cone('les_ez_saw', 'Kemik Testeresi', 3, 60, 11, 1.8, '1H_Melee_Attack_Slice_Horizontal', 0.4,
      { windup: 0.9, telegraph: true, statuses: [bleed(1, 0.25, 8)], initialCooldown: 6 }),
  ],
});
add({
  id: 'les_dikis_yaratigi', name: 'Dikiş Yaratığı', model: LES_MODEL.dikis_yaratigi.model, scale: LES_MODEL.dikis_yaratigi.scale,
  tint: LES_MODEL.dikis_yaratigi.tint, role: 'tank', rank: 'elite', hp: 7, dmg: 1.4, speed: 4.2, radius: 1.1, aggro: 0, forces: 0,
  anims: LES_MODEL.dikis_yaratigi.anims, resist: R_FLESH, ai: { summoned: true }, visual: { eyeEmissive: GREEN },
  basic: cone('les_dy_slam', 'Yama Yumruğu', 3.6, 120, 3.0, 1.2, 'Attack', 0.47, { windup: 0.7 }),
  abilities: [],
});
posture('les_dikis_yaratigi', { poise: 300, poiseRegen: 0.1, poiseDelay: 3, profile: 'bruiser' });

// ---------------------------------------------------------------------------------------------------------------------
// Zolramus (violet bone, the ascent)
// ---------------------------------------------------------------------------------------------------------------------
add({
  id: 'les_zol_bekci', name: 'Zolramus Kapı Bekçisi', model: SKEL('Skeleton_Warrior'), scale: 1.2, tint: 0x8a78b8, role: 'tank', rank: 'elite',
  hp: 2.8, dmg: 1.4, speed: 5.0, radius: 0.7, aggro: 10, forces: 7, anims: A_SKEL_COMBAT, resist: R_NECRO, ai: { bonePile: 12 },
  visual: { attach: [...W_BLADE, { url: WPN('Skeleton_Shield_Large_A'), bone: 'handslot.l', pos: [0, 0.017, 0.05] }], eyeEmissive: 0xb070ff, runRef: 7 },
  basic: cone('les_zb_slash', 'Zolramus Kılıcı', 2.8, 100, 2.6, 1.2, '1H_Melee_Attack_Slice_Horizontal', 0.3, { windup: 0.77 }),
  abilities: [
    proj('les_zb_bolt', 'Nekrotik Ok', 16, 20, 8, 2.0, 2.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3,
      { castTime: 2.0, interruptible: true, kick: 2, initialCooldown: 2, statuses: [{ status: 'necrotic', duration: 8, stacks: 4 }], sfx: 'shadow_cast' }),
    cone('les_zb_bash', 'Kalkan Vuruşu', 2.4, 90, 14, 1.6, 'Block_Attack', 0.4,
      { initialCooldown: 5, windup: 0.87, telegraph: true, statuses: [{ status: 'slow', duration: 2, magnitude: 0.4 }] }),
    aoe('les_zb_wrath', "Zolramus'un Gazabı", 'self_aoe', 6, 6, 20, 2.0, 2.8, 'shadow', 'Block_Attack', 0.4,
      { initialCooldown: 8, castTime: 2.0, vfx: 'shadow_burst' }),
  ],
});
posture('les_zol_bekci', { poise: 240, poiseRegen: 0.1, poiseDelay: 3, hyperArmor: 0.25, profile: 'buster' });

add({
  id: 'les_zol_buyucu', name: 'Zolramus Büyücüsü', model: SKEL('Skeleton_Mage'), scale: 1.1, tint: 0x7a5aa8, role: 'caster', rank: 'trash',
  hp: 1.1, dmg: 1.4, speed: 4.9, radius: 0.5, aggro: 12, forces: 5, anims: A_SKEL, resist: R_NECRO, ai: { kite: [9, 16], bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Staff'), bone: 'handslot.r', pos: [0, 0, 0], rotY: Math.PI }], eyeEmissive: 0xb070ff, runRef: 7 },
  basic: proj('les_zs_spark', 'Gölge Kıvılcımı', 16, 20, 2.6, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    proj('les_zs_bolt', 'Nekrotik Ok', 16, 20, 9, 2.0, 2.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3,
      { castTime: 2.0, interruptible: true, kick: 2, initialCooldown: 3, statuses: [{ status: 'necrotic', duration: 8, stacks: 4 }], sfx: 'shadow_cast' }),
    aoe('les_zs_well', 'Gölge Kuyusu', 'ground_aoe', 3, 18, 12, 0.91, 1.4, 'shadow', 'Spellcast_Long', 0.6,
      { initialCooldown: 6, vfx: 'shadow_ground', params: { target: 1, persist: 8, tick: 1, persistCoef: 0.5 } }),
    aoe('les_zs_nova', 'Ruh Patlaması', 'self_aoe', 4.5, 0, 14, 0.91, 1.6, 'shadow', 'Spellcast_Long', 0.6,
      { initialCooldown: 8, vfx: 'shadow_burst' }),
  ],
});
add({
  id: 'les_zol_heykeltiras', name: 'Zolramus Kemik Heykeltıraşı', model: SKEL('Skeleton_Warrior'), scale: 1.35, tint: 0xe8e0c8, role: 'melee', rank: 'elite',
  hp: 4.6, dmg: 1.7, speed: 5.4, radius: 0.8, aggro: 10, forces: 10, anims: A_SKEL_COMBAT, resist: R_NECRO, ai: { bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Axe'), bone: 'handslot.r', pos: [0, 0, 0] }, { url: WPN('Skeleton_Axe'), bone: 'handslot.l', pos: [0, 0, 0] }],
    eyeEmissive: 0xb070ff, runRef: 7 },
  basic: cone('les_zh_axe', 'Kemik Satırı', 3.0, 100, 4.0, 1.3, 'Dualwield_Melee_Attack_Slice', 0.3, { windup: 0.79 }),   // 3-hit, summed
  abilities: [
    line('les_zh_spear', 'Kemik Mızrağı', 14, 1.6, 11, 1.05, 2.4, 'physical', '1H_Melee_Attack_Stab', 0.4,
      { initialCooldown: 4, statuses: [bleed(3, 0.3, 10)], dispel: 'bleed' }),
    cone('les_zh_carve', 'Kemik Oyma', 4.5, 80, 16, 3.2, '1H_Melee_Attack_Chop', 0.4,
      { initialCooldown: 8, windup: 1.2, telegraph: true, tankBuster: true, perilous: true, parryable: false }),
    aoe('les_zh_spin', 'Sarmal Kesiş', 'self_aoe', 4.5, 0, 16, 0.95, 2.0, 'physical', '2H_Melee_Attack_Spin', 0.4, { initialCooldown: 10 }),
    passive('les_zh_armor', 'Kemik Kabuğu', { hpBelow: 0.5, shieldPct: 0.15, duration: 10 }),
  ],
});
posture('les_zol_heykeltiras', { poise: 360, poiseRegen: 0.1, poiseDelay: 3, hyperArmor: 0.3, profile: 'buster' });

add({
  id: 'les_zol_sifaci', name: 'Zolramus Kemik Şifacısı', model: SKEL('Skeleton_Mage'), scale: 1.05, tint: 0x9ad8b0, role: 'healer', rank: 'trash',
  hp: 1.3, dmg: 0.9, speed: 4.9, radius: 0.5, aggro: 12, forces: 5, anims: A_SKEL, resist: R_NECRO, ai: { kite: [8, 14], bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Staff'), bone: 'handslot.r', pos: [0, 0, 0], rotY: Math.PI }], eyeEmissive: 0x60ff90, runRef: 7 },
  basic: proj('les_zsf_spark', 'Gölge Kıvılcımı', 16, 20, 2.8, 0.7, 0.8, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    heal('les_zsf_mend', 'Kemik Şifası', 2.2, 9, 0.25, 'Spellcast_Raise', 0.5, { kick: 2, initialCooldown: 4 }),
    buff('les_zsf_ward', 'Ruh Kalkanı', 1.6, 16, [{ status: 'shield', duration: 8 }], 'Spellcast_Raise', 0.5, { kick: 1 }),
    aoe('les_zsf_shrap', 'Kemik Şarapneli', 'self_aoe', 4, 0, 12, 0.91, 1.2, 'physical', 'Spellcast_Shoot', 0.4, { initialCooldown: 7 }),
  ],
});

add({
  id: 'les_kafatasi', name: 'Gezgin Kafatası', model: MON('Skull'), scale: 0.8, tint: 0xd8d0b8, role: 'swarm', rank: 'trash',
  hp: 0.35, dmg: 0.6, speed: 6.2, radius: 0.35, aggro: 10, forces: 2, anims: A_SKULL, resist: R_NECRO, visual: { eyeEmissive: GREEN },
  basic: cone('les_kf_bite', 'Isırık', 1.8, 90, 1.6, 0.6, 'Bite_Front', 0.3, { windup: 0.6 }),
  abilities: [
    charge('les_kf_lunge', 'Kafatası Sıçraması', 5, 9, 0.7, 0.9, 'Jump', 0.4, { initialCooldown: 3, parryable: false }),
    onDeath(aoe('les_kf_burst', 'Patlayan Kafatası', 'self_aoe', 2, 0, 0, 0.3, 0.5, 'shadow', '', 0, { telegraph: false, vfx: 'shadow_burst' })),
  ],
});

// ---------------------------------------------------------------------------------------------------------------------
// Boss adds: the Leş Kurdu worm of Çürükkemik, and the Amarth minions (derived from the trash defs, 0 forces)
// ---------------------------------------------------------------------------------------------------------------------
add({
  id: 'les_ceset_kurdu', name: 'Leş Kurdu', model: ITCH('centipede'), scale: 0.7, tint: 0xb8c870, role: 'swarm', rank: 'trash',
  hp: 1.0, dmg: 0.8, speed: 5.0, radius: 0.5, aggro: 0, forces: 0, anims: { ...A_WOLF, spawn: 'Emerge' }, ai: { summoned: true },
  basic: cone('les_cs_bite', 'Isırık', 2.0, 90, 1.8, 1.0, 'Bite', 0.55, { windup: 0.7 }),
  abilities: [
    onDeath(aoe('les_cs_gas', 'Zehirli Gaz', 'self_aoe', 3, 0, 0, 0.5, 0.3, 'poison', '', 0,
      { telegraph: false, vfx: 'poison_cloud', statuses: [{ status: 'silence', duration: 1 }, { status: 'root', duration: 0.7 }],
        params: { persist: 60, tick: 0.5, persistCoef: 0.35 } })),
  ],
});

for (const [id, base, name] of [
  ['les_am_savasci', 'les_kirik_savasci', 'Diriltilmiş Savaşçı'],
  ['les_am_buyucu', 'les_kirik_buyucu', 'Diriltilmiş Büyücü'],
  ['les_am_arbaletci', 'les_arbaletci', 'Diriltilmiş Arbaletçi'],
] as const) {
  const b = ENEMIES[base];
  ENEMIES[id] = { ...b, id, name, forces: 0, ai: { ...b.ai, summoned: true, bonePile: 30 } };
}

// ---------------------------------------------------------------------------------------------------------------------
// Bosses (section 5). Strings, leaps and posture breaks are scripted in src/ai/bosses/les_uyanisi.ts.
// ---------------------------------------------------------------------------------------------------------------------
function lesBoss(s: BossSpec, p: Posture): void {
  boss(s);
  posture(s.id, p);
}

lesBoss({
  id: 'les_boss_curukkemik', name: 'Çürükkemik', title: 'Hasat Çukurunun Dikişli Devi', model: LES_MODEL.curukkemik.model,
  scale: LES_MODEL.curukkemik.scale, tint: LES_MODEL.curukkemik.tint, role: 'melee', hp: 60, dmg: 2.4, speed: 4.4, radius: 1.7, enrage: 300,
  arenaR: 28, loot: 'loot_mp_les_b1', anims: LES_MODEL.curukkemik.anims, resist: { poison: 0.9, physical: 0.1, fire: -0.15, holy: -0.25 },
  visual: { eyeEmissive: GREEN, runRef: 4.4, glow: GREEN },
  basic: cone('les_cur_claw', 'Pençe', 5, 110, 3.2, 1.0, 'Attack', 0.6, { windup: 0.7, telegraph: true }),
  abilities: [
    custom('les_cur_string', 'Üçlü Pençe', 3.2, 0, 0.7, 'Attack', { telegraph: true, sfx: 'boss_cast' }),
    cone('les_cur_crunch', 'Kemik Kırıcı', 7, 70, 18, 4.2, 'Attack2', 0.6, { initialCooldown: 9, windup: 1.4, telegraph: true, tankBuster: true,
      perilous: true, parryable: false, statuses: [{ status: 'sunder', duration: 10 }] }),
    custom('les_cur_retch', 'Boğucu Kusma', 20, 5, 1.8, 'Cast', { sfx: 'boss_cast', params: { impact: 1.8 } }),
    // raid beat with a 2.5 s cast bar: a r 11 miasma on the boss, the corners of the arena outside it are the safe spots
    aoe('les_cur_miasma', 'Leş Buharı', 'self_aoe', 11, 11, 16, 2.5, 0.8, 'poison', 'Cast', 2.5, { initialCooldown: 12, castTime: 2.5, sfx: 'boss_cast', vfx: 'poison_cloud' }),
    custom('les_cur_leap', 'Leş Sıçrayışı', 28, 24, 1.1, 'Attack2', { initialCooldown: 16, sfx: 'boss_roar', params: { impact: 1.1 } }),
    custom('les_cur_burst', 'Dikişler Patlıyor', 999, 9999, 1.2, 'Enrage', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['les_cur_string', 'les_cur_crunch', 'les_cur_miasma', 'les_cur_retch', 'les_cur_leap']),
    bp('p2', 0.6, ['les_cur_string', 'les_cur_crunch', 'les_cur_miasma', 'les_cur_retch', 'les_cur_leap'], { yell: 'Hasat zamanı!' }),
    bp('p3', 0.3, ['les_cur_string', 'les_cur_crunch', 'les_cur_miasma', 'les_cur_retch', 'les_cur_leap', 'les_cur_burst'],
      { yell: 'Dikişlerim... çözülüyor!', ability: 'les_cur_burst' }),
  ],
  intro: 'Hasat zamanı geldi. Hepiniz toprağa dönecek!', death: 'Dikişlerim... çözülüyor...',
  arena: { cx: 164, cz: 212, w: 56, h: 56, homeX: 170, homeZ: 212 },
}, { poise: 900, poiseRegen: 0.08, poiseDelay: 5, hyperArmor: 0.2, profile: 'buster' });

lesBoss({
  id: 'les_boss_hasatci_amarth', name: 'Hasatçı Amarth', title: "Cesaret'in Düşüşünün Hasatçısı", model: LES_MODEL.hasatci_amarth.model,
  scale: LES_MODEL.hasatci_amarth.scale, tint: LES_MODEL.hasatci_amarth.tint, role: 'melee', flying: true, hover: 1.2, hp: 72, dmg: 2.2,
  speed: 5.2, radius: 1.6, enrage: 330, arenaR: 32, loot: 'loot_mp_les_b2', anims: LES_MODEL.hasatci_amarth.anims,
  resist: { shadow: 0.75, frost: 0.5, holy: -0.25, fire: -0.1 }, visual: { eyeEmissive: GREEN, glow: 0x9060ff },
  basic: cone('les_amr_bite', 'Kemikdiş Isırığı', 6, 110, 3.4, 1.0, 'Attack', 0.5, { windup: 0.7, telegraph: true }),
  abilities: [
    // tank buster: a telegraphed bone spike line from the flyer through the tank (not parryable), bleed
    line('les_amr_impale', 'Kemik Kazığı', 12, 2.5, 10, 1.4, 3.6, 'physical', 'Attack2', 1.2, { initialCooldown: 7, tankBuster: true, statuses: [bleed(1, 0.3, 8)], sfx: 'swing_heavy' }),
    custom('les_amr_scythe', 'Tırpan Dizisi', 8, 14, 0.85, 'Attack', { initialCooldown: 11, sfx: 'swing_heavy' }),
    proj('les_amr_frostbolt', 'Don Oku', 18, 40, 7, 1.8, 2.0, 'frost', 'frost_projectile', 'Cast', 0.3,
      { castTime: 1.8, interruptible: true, kick: 1, initialCooldown: 3, statuses: [chill(1, 6)], sfx: 'frost_cast' }),
    proj('les_amr_bolt', 'Nekrotik Ok', 18, 40, 9, 1.2, 1.6, 'shadow', 'shadow_projectile', 'Cast', 0.3,
      { initialCooldown: 4, sfx: 'shadow_cast' }),
    aoe('les_amr_volley', 'Don Oku Yağmuru', 'self_aoe', 16, 16, 15, 2.4, 1.7, 'frost', 'Cast', 1.0,
      { castTime: 2.4, interruptible: true, kick: 2, initialCooldown: 8, statuses: [chill(2, 5)], vfx: 'frost_burst' }),
    custom('les_amr_land', 'Ölüler Diyarı', 32, 10, 1.2, 'Cast', { sfx: 'boss_cast', params: { impact: 1.2 } }),
    custom('les_amr_final', 'Son Hasat', 999, 9999, 3.0, 'Cast', { castTime: 3.0, interruptible: false, sfx: 'boss_roar', params: { impact: 3.0 } }),
    custom('les_amr_breath', 'Nekrotik Nefes', 24, 14, 1.6, 'Cast', { sfx: 'boss_cast', params: { impact: 1.6 } }),
    custom('les_amr_dive', 'Dalış', 40, 30, 1.6, 'Attack2', { initialCooldown: 25, sfx: 'boss_roar', params: { impact: 1.6 } }),
  ],
  phases: [
    bp('p1', 1.01, ['les_amr_impale', 'les_amr_frostbolt', 'les_amr_bolt', 'les_amr_volley', 'les_amr_land', 'les_amr_scythe']),
    bp('p2', 0.65, ['les_amr_impale', 'les_amr_frostbolt', 'les_amr_bolt', 'les_amr_volley', 'les_amr_land', 'les_amr_scythe', 'les_amr_breath', 'les_amr_dive'],
      { yell: 'Kemikdiş, kanlarını iç!' }),
    bp('p3', 0.3, ['les_amr_impale', 'les_amr_frostbolt', 'les_amr_bolt', 'les_amr_volley', 'les_amr_land', 'les_amr_scythe', 'les_amr_breath', 'les_amr_dive'],
      { yell: 'Hasat bitmedi!' }),
  ],
  intro: "Cesaret Tapınağı yıkıldı! Ruhlarınızı da hasat edeceğim!", death: 'Hasat... bitmedi...',
  arena: { cx: 64, cz: 120, w: 80, h: 64, homeX: 54, homeZ: 120 },
}, { poise: 1000, poiseRegen: 0.08, poiseDelay: 5, hyperArmor: 0.2 });

lesBoss({
  id: 'les_boss_cerrah_dikisat', name: 'Cerrah Dikişet', title: 'Dikişhanenin Efendisi', model: CHAR('Rogue_Hooded'), scale: 1.55,
  tint: 0x9aa890, role: 'melee', hp: 60, dmg: 2.3, speed: 5.2, radius: 1.0, enrage: 240, arenaR: 28, loot: 'loot_mp_les_b3', anims: A_KAYKIT,
  resist: R_FLESH, visual: { hide: ROGUE_HIDE, eyeEmissive: GREEN, runRef: 7, glow: GREEN },
  basic: cone('les_dks_slice', 'Cerrah Dizisi', 4, 100, 3.0, 1.0, 'Dualwield_Melee_Attack_Slice', 0.3, { windup: 0.7, telegraph: true }),
  abilities: [
    custom('les_dks_string', 'Cerrah Dizisi', 3.0, 0, 0.7, 'Dualwield_Melee_Attack_Slice', { telegraph: true }),
    aoe('les_dks_ichor', 'Mumyalama Sıvısı', 'ground_aoe', 4.5, 40, 11, 1.4, 1.2, 'poison', 'Throw', 0.6,
      { initialCooldown: 3, vfx: 'poison_cloud', params: { target: 1, persist: 20, tick: 1, persistCoef: 0.35 } }),
    proj('les_dks_needle', 'Dikiş İğnesi', 24, 40, 8, 0.6, 1.8, 'physical', 'dagger_projectile', 'Throw', 0.5,
      { initialCooldown: 5, statuses: [bleed(1, 0.3, 10)] }),
    proj('les_dks_mutilate', 'Parçalama', 20, 40, 16, 1.3, 4.0, 'physical', 'dagger_projectile', 'Throw', 0.5,
      { initialCooldown: 9, tankBuster: true, parryable: false, telegraph: true }),
    custom('les_dks_creation', 'Yaratığı Uyandır', 34, 5, 1.5, 'Spellcast_Raise', { sfx: 'boss_cast', params: { impact: 1.5 } }),
    custom('les_dks_hook', 'Et Kancası', 18, 11, 2.0, 'Throw', { sfx: 'boss_cast', params: { impact: 2.0 } }),
    custom('les_dks_sutures', 'Sürünen Dikişler', 22, 14, 1.0, 'Spellcast_Long', { initialCooldown: 14, sfx: 'boss_cast', params: { impact: 1.0 } }),
    cone('les_dks_sever', 'Etin Ayrılışı', 6, 80, 9, 4.2, 'Dualwield_Melee_Attack_Chop', 0.4,
      { initialCooldown: 2, windup: 1.4, telegraph: true, tankBuster: true, perilous: true, parryable: false, statuses: [bleed(2, 0.3, 8)] }),
    // raid beat with a 2.5 s cast bar, only on the arena stage: a r 12 operating-lamp burst on the whole room (the edges are the safe spots)
    aoe('les_dks_lamp', 'Ameliyat Lambası', 'self_aoe', 12, 12, 15, 2.5, 1.0, 'poison', 'Cast', 2.5, { initialCooldown: 10, castTime: 2.5, sfx: 'boss_cast', vfx: 'poison_cloud' }),
    custom('les_dks_lunge', 'Cerrahi Sıçrama', 16, 99, 1.0, 'Jump_Full_Short', { sfx: 'boss_roar', params: { impact: 1.0 } }),
    custom('les_dks_escape', 'Kaçış', 999, 9999, 1.5, 'Jump_Full_Long', { castTime: 1.5, interruptible: false, sfx: 'boss_cast' }),
  ],
  phases: [
    bp('p1', 1.01, ['les_dks_lamp', 'les_dks_ichor', 'les_dks_needle', 'les_dks_mutilate', 'les_dks_creation', 'les_dks_hook', 'les_dks_sutures', 'les_dks_sever', 'les_dks_lunge']),
    bp('p2', 0.66, ['les_dks_lamp', 'les_dks_ichor', 'les_dks_needle', 'les_dks_mutilate', 'les_dks_creation', 'les_dks_hook', 'les_dks_sutures', 'les_dks_sever', 'les_dks_lunge'],
      { yell: 'İkinci yaratığı uyandırın!' }),
    bp('p3', 0.33, ['les_dks_lamp', 'les_dks_ichor', 'les_dks_needle', 'les_dks_mutilate', 'les_dks_creation', 'les_dks_hook', 'les_dks_sutures', 'les_dks_sever', 'les_dks_lunge'],
      { yell: 'Ameliyat daha bitmedi!' }),
  ],
  intro: 'Yeni bir hasta! Ne güzel... Masaya yatın!', death: 'Dikişlerim... çözülüyor... hayır...',
  arena: { cx: 148, cz: 36, w: 72, h: 56, homeX: 148, homeZ: 24 },
}, { poise: 700, poiseRegen: 0.08, poiseDelay: 5, hyperArmor: 0.2 });

lesBoss({
  id: 'les_boss_ayazbaglayan_nalthor', name: 'Ayazbağlayan Nalthor', title: 'Kadim Mührün Buz Bağlayıcısı', model: LES_MODEL.ayazbaglayan.model,
  scale: LES_MODEL.ayazbaglayan.scale, tint: LES_MODEL.ayazbaglayan.tint, role: 'caster', hp: 105, dmg: 2.5, speed: 5.0, radius: 1.1, enrage: 360,
  arenaR: 36, loot: 'loot_mp_les_b4', anims: LES_MODEL.ayazbaglayan.anims, resist: { frost: 0.9, shadow: 0.5, fire: -0.25, holy: -0.1 },
  visual: { eyeEmissive: 0x80d0ff, glow: 0x80c8ff },
  basic: cone('les_nal_blade', 'Don Kılıcı', 5.5, 100, 3.4, 1.0, 'Attack', 0.5, { windup: 0.7, telegraph: true }),
  abilities: [
    custom('les_nal_string', 'Don Kılıcı Dizisi', 3.4, 0, 0.7, 'Attack', { telegraph: true }),
    custom('les_nal_comet', 'Kuyruklu Yıldız Yağmuru', 24, 9, 1.2, 'Cast', { sfx: 'frost_cast', params: { impact: 1.2 } }),
    custom('les_nal_aegis', 'Buzlu Kalkan', 40, 20, 1.0, 'Cast', { sfx: 'frost_cast', params: { impact: 1.0 } }),
    custom('les_nal_binds', 'Donmuş Bağlar', 26, 14, 1.0, 'Cast', { sfx: 'frost_cast', params: { impact: 1.0 } }),
    custom('les_nal_blink', 'Don Sıçraması', 40, 28, 1.0, 'Attack2', { initialCooldown: 20, sfx: 'blink', params: { impact: 0.9 } }),
    custom('les_nal_lance', 'Kırağı Mızrağı', 40, 26, 1.2, 'Attack2', { initialCooldown: 14, tankBuster: true, sfx: 'frost_cast', params: { impact: 1.2 } }),
    custom('les_nal_winter', 'Sonsuz Kış', 999, 9999, 1.5, 'Enrage', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['les_nal_string', 'les_nal_comet', 'les_nal_binds']),
    bp('p2', 0.7, ['les_nal_string', 'les_nal_comet', 'les_nal_binds', 'les_nal_aegis', 'les_nal_blink'],
      { yell: 'Kırağı hepinizi çoktan bağladı.' }),
    bp('p3', 0.5, ['les_nal_string', 'les_nal_comet', 'les_nal_binds', 'les_nal_aegis', 'les_nal_blink', 'les_nal_lance'],
      { yell: 'Sonsuz kış başlıyor!', ability: 'les_nal_winter' }),
  ],
  intro: 'Nöbetçiler donarak öldü. Siz de aynı kaderi paylaşacaksınız.', death: 'Mühür... kırılmadı... daha...',
  arena: { cx: 284, cz: 180, w: 72, h: 72, homeX: 284, homeZ: 186 },
}, { poise: 1200, poiseRegen: 0.08, poiseDelay: 5, hyperArmor: 0.2 });

/** Ids this module registers (the dungeon file and the boss script read them). */
export const LES_UYANISI_ENEMY_IDS = [
  'les_kirik_savasci', 'les_kirik_buyucu', 'les_arbaletci', 'les_veba_torbasi', 'les_canavar', 'les_dikisli_onder', 'les_les_toplayici',
  'les_et_zanaatkari', 'les_zol_bekci', 'les_zol_buyucu', 'les_zol_heykeltiras', 'les_zol_sifaci', 'les_kafatasi',
  'les_ceset_kurdu', 'les_am_savasci', 'les_am_buyucu', 'les_am_arbaletci', 'les_dikis_yaratigi',
] as const;
export const LES_UYANISI_BOSS_IDS = [
  'les_boss_curukkemik', 'les_boss_hasatci_amarth', 'les_boss_cerrah_dikisat', 'les_boss_ayazbaglayan_nalthor',
] as const;
