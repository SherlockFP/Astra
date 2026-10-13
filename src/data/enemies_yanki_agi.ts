/**
 * Yankı Ağı (yanki_agi) enemy defs: 13 trash types, 3 minibosses, 3 elites (posture bars), the summoned adds and the three bosses.
 * Design source: docs/dungeons/yanki_agi.md sections 4 and 5. Ids are `yk_` prefixed.
 * Registration: enemies.ts is NOT edited here. The dungeon file imports this module for its side effect (fills ENEMIES and BOSSES),
 * the same way src/data/dungeons/peri_sisleri.ts imports enemies_peri_sisleri.ts.
 *
 * Deviations from the design doc (the engine piece is missing today; these are listed in the orchestrator report):
 *  - No new models: the nerubian creatures use their fallbacks (Skeleton_Mage / Minion / Rogue / Warrior, spider, wasp, slime).
 *  - Move-set strings (YSP-17 chain): a 2-hit string is one cone with the summed coefficient, as in enemies_peri_sisleri.ts.
 *    Its windup follows the summed coefficient, so it stays at or above the trash floor.
 *  - Leaps (YSP-17 leap): Ezme Atlayışı is a charge with parryable off.
 *  - No CUSTOM handler `alarm` (YSP-07): Alarm Çığlığı summons one reinforcement with `once`. The same-room pull is not wired.
 *  - params.ranged (YSP-08), params.leech (YSP-08), params.target (random non-tank): written but not read by the engine yet.
 *  - No status `kara_kan` or `faded` in StatusId: those effects are dropped (see report). `exposed`, `root`, `poison`,
 *    `slow`, `fortify`, `fear`, `curse` are existing ids and are used where the doc asks for them.
 *  - Elden Ring layer on bosses lives in src/ai/bosses/yanki_agi.ts (bossString / bossLeap), not in these defs.
 * OWNER: enemies module.
 */
import {
  add, boss, bp, cone, proj, aoe, charge, heal, buff, passive, custom, onDeath, summonAb, line, NOOP, poison, bleed, BOSSES, ENEMIES,
  A_SKEL, A_WOLF, A_WASP, A_GEN, R_BEAST, R_SPIDER,
} from './enemyKit';
import { ITCH, SKEL } from './enemyModels';
import type { EnemyAbility, EnemyDef } from '../types/enemies';

/** Telegraph windup rule of the design doc (section 4): clamp(0.45 + 0.25 x coef, 0.45, 1.2). */
const W = (coef: number): number => Math.min(1.2, Math.max(0.45, 0.45 + 0.25 * coef));
/** Projectile floor 0.6 s (content check). */
const WP = (coef: number): number => Math.max(0.6, W(coef));
/** Line, ground and self AoE floor 0.9 s (content check). */
const WL = (coef: number): number => Math.max(0.9, W(coef));

/** Nerubian resist profile of the design doc (section 4.1). */
const R_NERUB: EnemyDef['resist'] = { physical: 0.05, fire: -0.1, shadow: 0.25, poison: 0.5 };

/** Black Blood puddle: one cast per fight (cd 99), a violet ground telegraph with a red outline (section 2.1). */
const puddle = (id: string, anim: string): EnemyAbility =>
  aoe(id, 'Kara Kan Damlası', 'ground_aoe', 2.2, 8, 99, WL(0.8), 0.8, 'shadow', anim, 0.4,
    { initialCooldown: 0, vfx: 'shadow_ground', params: { target: 3, persist: 14, tick: 0.5, persistCoef: 0.35, impact: 0.4 } });

// ---- trash ----------------------------------------------------------------------------------------------------------------

add({ id: 'yk_crawler', name: 'Aç Sürünen', model: ITCH('spider'), scale: 0.42, tint: 0xc8d4b0, role: 'swarm', rank: 'trash',
  hp: 0.55, dmg: 0.8, speed: 6.8, radius: 0.45, aggro: 9, forces: 1, anims: A_WOLF, resist: R_SPIDER,
  visual: { eyeEmissive: 0x86c93a },
  basic: cone('yk_crawler_bite', 'Isırık', 1.8, 100, 1.4, 1.0, 'Bite', 0.5, { windup: W(1.0) }),
  abilities: [charge('yk_crawler_ambush', 'Pusu', 12, 11, W(1.6), 1.6, 'Strike', 0.73,
    { initialCooldown: 5, params: { minRange: 8, impact: 0.73 } })] });

add({ id: 'yk_wasp', name: 'Sokucu Arı', model: ITCH('wasp'), scale: 0.6, role: 'swarm', rank: 'trash',
  hp: 0.45, dmg: 0.7, speed: 6.2, radius: 0.4, aggro: 10, forces: 1, flying: true, hover: 1.3, anims: A_WASP, resist: R_BEAST,
  basic: cone('yk_wasp_jab', 'Kanamalı Dürtme', 2.0, 100, 1.5, 0.8, 'Sting', 0.6, { windup: W(0.8), statuses: [bleed(1, 0.2, 8)] }),
  abilities: [charge('yk_wasp_dive', 'Sokma Dalışı', 9, 8, W(1.0), 1.0, 'Dive', 0.7, { initialCooldown: 4, params: { minRange: 6, impact: 0.7 } })] });

add({ id: 'yk_carrier', name: 'Kanatlı Taşıyıcı', model: ITCH('wasp'), scale: 0.85, tint: 0x6a4a8a, role: 'melee', rank: 'trash',
  hp: 1.3, dmg: 1.1, speed: 5.8, radius: 0.55, aggro: 10, forces: 3, flying: true, hover: 1.4, anims: A_WASP, resist: R_BEAST,
  basic: cone('yk_carrier_jab', 'Dürtme', 2.2, 100, 1.8, 1.0, 'Sting', 0.6, { windup: W(1.0) }),
  abilities: [
    puddle('yk_carrier_drip', 'Sting'),
    charge('yk_carrier_dash', 'Atılış', 10, 9, W(1.5), 1.5, 'Dive', 0.9, { initialCooldown: 6, params: { minRange: 6, impact: 0.9 } }),
  ] });

add({ id: 'yk_attendant', name: 'Çınlayan Görevli', model: SKEL('Skeleton_Mage'), scale: 1.0, role: 'caster', rank: 'trash',
  hp: 1.5, dmg: 1.1, speed: 4.8, radius: 0.55, aggro: 12, forces: 4, anims: A_SKEL, resist: R_NERUB, ai: { kite: [9, 15] },
  basic: proj('yk_attendant_bolt', 'Ağ Oku', 16, 16, 2.4, WP(1.0), 1.0, 'poison', 'poison_projectile', 'Cast', 0.6,
    { statuses: [{ status: 'slow', duration: 3, magnitude: 0.4 }] }),
  abilities: [
    aoe('yk_attendant_barrage', 'Rezonans Yağmuru', 'self_aoe', 24, 24, 16, 3.2, 2.4, 'shadow', 'Cast', 1.0,
      { initialCooldown: 6, castTime: 3.2, interruptible: true, kick: 2, vfx: 'arcane_burst', params: { impact: 1.0, ranged: 1 } }),
    aoe('yk_attendant_chime', 'Çınlama Darbesi', 'self_aoe', 4.5, 4.5, 10, WL(1.2), 1.2, 'shadow', 'Attack', 0.5,
      { initialCooldown: 3, knockback: 5, vfx: 'arcane_burst', params: { impact: 0.5 } }),
  ] });

add({ id: 'yk_worker', name: 'Kan İşçisi', model: SKEL('Skeleton_Minion'), scale: 1.0, tint: 0x6a5a78, role: 'melee', rank: 'trash',
  hp: 1.2, dmg: 1.0, speed: 6.0, radius: 0.5, aggro: 9, forces: 3, anims: A_SKEL, resist: R_NERUB,
  basic: cone('yk_worker_claw', 'Pençe', 2.0, 100, 1.6, 1.0, 'Attack', 0.45, { windup: W(1.0) }),
  abilities: [
    cone('yk_worker_double', 'Çifte Pençe', 2.0, 100, 8, 1.6, 'Attack2', 0.5, { windup: W(1.6), parryable: true, initialCooldown: 3, params: { impact: 0.5 } }),
    charge('yk_worker_rush', 'Hücum', 14, 10, W(1.5), 1.5, 'Attack2', 0.5, { initialCooldown: 4, params: { minRange: 8, impact: 0.5 } }),
  ] });

add({ id: 'yk_assistant', name: 'Kana Bulanmış Yardımcı', model: SKEL('Skeleton_Rogue'), scale: 0.9, role: 'melee', rank: 'trash',
  hp: 1.5, dmg: 1.1, speed: 5.6, radius: 0.55, aggro: 9, forces: 4, anims: A_SKEL, resist: R_NERUB,
  basic: cone('yk_assistant_spear', 'Mızrak', 2.4, 90, 1.8, 1.0, 'Attack', 0.45, { windup: W(1.0) }),
  abilities: [
    aoe('yk_assistant_sweep', 'Mızrak Süpürmesi', 'self_aoe', 3.2, 3.2, 10, WL(1.3), 1.3, 'physical', 'Attack2', 0.5,
      { initialCooldown: 4, params: { impact: 0.5 } }),
    cone('yk_assistant_extract', 'Özüt Darbesi', 3.0, 70, 12, 2.4, 'Attack2', 0.5,
      { windup: W(2.4), telegraph: true, initialCooldown: 5, tankBuster: true, params: { impact: 0.5, leech: 1.0, leechCapPct: 0.08 } }),
  ] });

add({ id: 'yk_webmage', name: 'Ağ Büyücüsü', model: SKEL('Skeleton_Mage'), scale: 1.0, tint: 0x70a860, role: 'caster', rank: 'trash',
  hp: 1.4, dmg: 1.1, speed: 4.8, radius: 0.55, aggro: 12, forces: 4, anims: A_SKEL, resist: R_NERUB, ai: { kite: [10, 16] },
  basic: proj('yk_webmage_bolt', 'Ağ Oku', 16, 18, 2.4, WP(0.9), 0.9, 'poison', 'poison_projectile', 'Cast', 0.6),
  abilities: [
    aoe('yk_webmage_volley', 'Berbat Yaylım', 'self_aoe', 22, 22, 14, 2.4, 1.2, 'poison', 'Cast', 1.0,
      { initialCooldown: 6, castTime: 2.4, interruptible: true, kick: 2, statuses: [poison(2, 0.3, 10)], vfx: 'poison_burst', params: { impact: 1.0, ranged: 1 } }),
    aoe('yk_webmage_net', 'Yapışkan Ağ', 'ground_aoe', 2.2, 16, 9, WL(0.6), 0.6, 'poison', 'Cast', 0.6,
      { initialCooldown: 4, vfx: 'web_burst', statuses: [{ status: 'slow', duration: 4, magnitude: 0.5 }], params: { target: 3, persist: 8, tick: 1.0, persistCoef: 0.3, impact: 0.6 } }),
  ] });

add({ id: 'yk_bloodtender', name: 'Kan Bakıcısı', model: SKEL('Skeleton_Mage'), scale: 0.95, tint: 0x7a3a9a, role: 'healer', rank: 'trash',
  hp: 1.4, dmg: 0.9, speed: 4.8, radius: 0.55, aggro: 12, forces: 4, anims: A_SKEL, resist: R_NERUB, ai: { kite: [10, 16] },
  basic: proj('yk_bloodtender_bolt', 'Kan Oku', 16, 18, 2.6, WP(0.8), 0.8, 'shadow', 'shadow_projectile', 'Cast', 0.6),
  abilities: [
    heal('yk_bloodtender_mend', 'Kara Kan Şifası', 2.0, 9, 0.2, 'Cast', 1.0, { kick: 1, initialCooldown: 3 }),
    buff('yk_bloodtender_clot', 'Pıhtı Kalkanı', 1.0, 14, [{ status: 'fortify', duration: 6, magnitude: 0.2 }], 'Cast', 0.7,
      { params: { radius: 14, mostHurt: 1 } }),
  ] });

add({ id: 'yk_drone', name: 'Zırhlı Dron', model: SKEL('Skeleton_Warrior'), scale: 0.95, tint: 0x4a3a6a, role: 'melee', rank: 'trash',
  hp: 1.5, dmg: 1.2, speed: 5.4, radius: 0.55, aggro: 9, forces: 4, anims: A_SKEL, resist: R_NERUB,
  basic: cone('yk_drone_claw', 'Kara Kanlı Pençe', 2.2, 100, 1.8, 1.0, 'Attack', 0.45, { windup: W(1.0) }),
  abilities: [
    cone('yk_drone_bash', 'Kalkan Çarpması', 2.6, 90, 9, 1.4, 'Attack2', 0.5, { windup: W(1.4), knockback: 3 }),
    puddle('yk_drone_puddle', 'Attack'),
  ] });

add({ id: 'yk_stagshell', name: 'Nöbetçi Boynuzkabuk', model: SKEL('Skeleton_Mage'), scale: 1.15, tint: 0x8a7a50, role: 'caster', rank: 'trash',
  hp: 1.6, dmg: 1.0, speed: 4.6, radius: 0.55, aggro: 14, forces: 6, anims: A_SKEL, resist: R_NERUB, ai: { kite: [9, 14] },
  basic: proj('yk_stagshell_horn', 'Boynuz Fırlat', 16, 18, 2.4, WP(0.9), 0.9, 'physical', 'shadow_projectile', 'Cast', 0.6),
  abilities: [
    aoe('yk_stagshell_gore', 'Boynuz Darbesi', 'self_aoe', 4, 4, 10, WL(1.2), 1.2, 'physical', 'Attack', 0.5,
      { knockback: 5, vfx: 'ground_slam', params: { impact: 0.5 } }),
    summonAb('yk_stagshell_alarm', 'Alarm Çığlığı', 'yk_bloodguard_alarm', 1, 99, 'Cast', 1.0,
      { windup: 2.6, castTime: 2.6, interruptible: true, kick: 2, initialCooldown: 10, params: { once: 1, impact: 1.0 } }),
  ] });

add({ id: 'yk_bloodworker_run', name: 'Kaçak İşçi', model: SKEL('Skeleton_Minion'), scale: 0.9, tint: 0x6a5a78, role: 'swarm', rank: 'trash',
  hp: 0.5, dmg: 0.5, speed: 9, radius: 0.45, aggro: 0, forces: 0, xp: 0, anims: A_SKEL, resist: R_NERUB, ai: { summoned: true },
  basic: NOOP('yk_bloodworker_run_none'), abilities: [] });

// ---- elites (posture bars set below) -------------------------------------------------------------------------------------

const engorgedAbs = (): EnemyAbility[] => [
  proj('yk_engorged_spit', 'Zehirli Tükürük', 14, 16, 9, WP(0.6), 0.6, 'poison', 'poison_projectile', 'Bite', 0.55,
    { statuses: [poison(1, 0.2, 6)] }),
  charge('yk_engorged_leap', 'Ezme Atlayışı', 4, 14, W(2.0), 2.0, 'Strike', 0.6, { parryable: false, params: { minRange: 3, impact: 0.6 } }),
  onDeath(aoe('yk_engorged_rupture', 'Toksik Patlama', 'self_aoe', 5, 0, 0, WL(1.8), 1.8, 'poison', '', 0,
    { telegraph: true, vfx: 'poison_cloud', params: { suicide: 1 } })),
];
add({ id: 'yk_engorged', name: 'Şişkin Sürünen', model: ITCH('spider'), scale: 0.8, tint: 0x9ab060, role: 'melee', rank: 'elite',
  hp: 4.0, dmg: 1.4, speed: 5.4, radius: 0.6, aggro: 11, forces: 9, anims: A_WOLF, resist: R_SPIDER,
  basic: cone('yk_engorged_bite', 'Isırık', 2.6, 90, 2.0, 1.0, 'Bite', 0.5, { windup: W(1.0), statuses: [poison(1, 0.2, 6)] }),
  abilities: engorgedAbs() });

const bloodguardAbs = (): EnemyAbility[] => [
  cone('yk_bloodguard_mace', 'Tokmak Zinciri', 3.4, 100, 4, 2.0, 'Attack2', 0.5, { windup: 1.0, perilous: true, initialCooldown: 3 }),
  line('yk_bloodguard_spear', 'Mızrak Atışı', 16, 2.0, 11, W(2.4), 2.4, 'physical', 'Attack2', 0.5, { initialCooldown: 6, params: { impact: 0.5 } }),
  aoe('yk_bloodguard_swarm', 'Çekirge Fırtınası', 'self_aoe', 11, 11, 28, 1.5, 0.45, 'poison', 'Cast', 0.45,
    { initialCooldown: 12, vfx: 'poison_cloud', params: { persist: 4, tick: 1.0, persistCoef: 0.45, impact: 0.45 } }),
  buff('yk_bloodguard_siper', 'Zayıfın Siperi', 0.5, 18, [{ status: 'fortify', duration: 8, magnitude: 0.35 }], 'Cast', 0.5,
    { initialCooldown: 8, params: { radius: 10 } }),
];
add({ id: 'yk_bloodguard', name: 'İri Kan Muhafızı', model: SKEL('Skeleton_Warrior'), scale: 1.4, tint: 0x4a5a78, role: 'tank', rank: 'elite',
  hp: 6.0, dmg: 1.8, speed: 4.8, radius: 0.65, aggro: 10, forces: 11, ccImmune: true, anims: A_SKEL, resist: R_NERUB,
  visual: { eyeEmissive: 0x40ffe0 },
  basic: cone('yk_bloodguard_strike', 'Tokmak Darbesi', 3.4, 100, 2.4, 1.0, 'Attack', 0.45, { windup: W(1.0) }),
  abilities: bloodguardAbs() });

const overseerAbs = (): EnemyAbility[] => [
  aoe('yk_overseer_volley', 'Zehir Yaylımı', 'self_aoe', 24, 24, 15, 2.6, 1.6, 'poison', 'Cast', 1.0,
    { initialCooldown: 6, castTime: 2.6, interruptible: true, kick: 2, statuses: [poison(2, 0.3, 10)], vfx: 'poison_burst', params: { impact: 1.0, ranged: 1 } }),
  aoe('yk_overseer_web', 'Çıkıntılı Ağlar', 'ground_aoe', 2.6, 16, 7, WL(1.2), 1.2, 'poison', 'Cast', 0.6,
    { initialCooldown: 5, vfx: 'poison_cloud', params: { target: 3, impact: 0.6 } }),
];
add({ id: 'yk_overseer', name: 'Kan Gözcüsü', model: SKEL('Skeleton_Mage'), scale: 1.25, tint: 0x5a3a7a, role: 'caster', rank: 'elite',
  hp: 4.0, dmg: 1.5, speed: 4.6, radius: 0.6, aggro: 13, forces: 8, ccImmune: true, anims: A_SKEL, resist: R_NERUB, ai: { kite: [9, 14] },
  basic: proj('yk_overseer_bolt', 'Kan Oku', 16, 18, 2.4, W(1.1), 1.1, 'shadow', 'shadow_projectile', 'Cast', 0.6),
  abilities: overseerAbs() });

// ---- minibosses (poise 400, kick priorities as in the design) ------------------------------------------------------------

add({ id: 'yk_ixin', name: 'Çınlatıcı Iksin', model: SKEL('Skeleton_Mage'), scale: 1.5, tint: 0x3a5a7a, role: 'caster', rank: 'miniboss',
  hp: 9.0, dmg: 1.6, speed: 5.0, radius: 0.6, aggro: 12, forces: 14, anims: A_SKEL, resist: R_NERUB, ai: { kite: [9, 14] },
  basic: proj('yk_ixin_bolt', 'Yankı Atışı', 16, 18, 2.4, WP(1.0), 1.0, 'shadow', 'shadow_projectile', 'Cast', 0.6),
  abilities: [
    aoe('yk_ixin_dread', 'Dehşet Çığlığı', 'self_aoe', 10, 10, 12, 2.0, 0.8, 'shadow', 'Cast', 0.8,
      { initialCooldown: 6, castTime: 2.0, interruptible: true, kick: 2, statuses: [{ status: 'fear', duration: 2 }], vfx: 'arcane_burst', params: { impact: 0.8 } }),
    aoe('yk_ixin_chime', 'Çınlama Patlaması', 'self_aoe', 6, 6, 9, WL(1.6), 1.6, 'shadow', 'Attack', 0.6,
      { initialCooldown: 4, knockback: 4, vfx: 'arcane_burst', params: { impact: 0.6 } }),
  ] });

add({ id: 'yk_nakt', name: 'Yuva Çağıran Nakat', model: SKEL('Skeleton_Mage'), scale: 1.5, tint: 0x6a8a60, role: 'caster', rank: 'miniboss',
  hp: 9.0, dmg: 1.6, speed: 5.0, radius: 0.6, aggro: 12, forces: 14, anims: A_SKEL, resist: R_NERUB, ai: { kite: [10, 16] },
  basic: proj('yk_nakt_bolt', 'Ağ Oku', 16, 18, 2.4, WP(1.0), 1.0, 'poison', 'poison_projectile', 'Cast', 0.6),
  abilities: [
    summonAb('yk_nakt_call', 'Sürü Çağrısı', 'yk_crawler_summoned', 3, 18, 'Cast', 1.0,
      { windup: 2.0, castTime: 2.0, interruptible: true, kick: 1, initialCooldown: 8, params: { impact: 1.0 } }),
    aoe('yk_nakt_net', 'Yapışkan Ağ', 'ground_aoe', 2.2, 16, 9, WL(0.6), 0.6, 'poison', 'Cast', 0.6,
      { initialCooldown: 4, vfx: 'web_burst', statuses: [{ status: 'slow', duration: 4, magnitude: 0.5 }], params: { target: 3, impact: 0.6 } }),
  ] });

add({ id: 'yk_atik', name: 'Zehir Dökücü Atik', model: SKEL('Skeleton_Mage'), scale: 1.5, tint: 0x88b040, role: 'caster', rank: 'miniboss',
  hp: 9.0, dmg: 1.6, speed: 5.0, radius: 0.6, aggro: 12, forces: 14, anims: A_SKEL, resist: R_NERUB, ai: { kite: [9, 14] },
  basic: proj('yk_atik_dart', 'Zehir Oku', 16, 18, 3.0, WP(1.0), 1.0, 'poison', 'poison_projectile', 'Cast', 0.6,
    { statuses: [poison(2, 0.2, 8)], dispel: 'poison' }),
  abilities: [
    aoe('yk_atik_cloud', 'Zehir Bulutu', 'ground_aoe', 2.6, 16, 12, WL(1.4), 1.4, 'poison', 'Cast', 0.6,
      { initialCooldown: 5, kick: 1, vfx: 'poison_cloud', params: { target: 3, persist: 6, tick: 1.0, persistCoef: 0.3, impact: 0.6 } }),
    passive('yk_atik_aura', 'Zehir Aurası', { radius: 6, interval: 3 }),
  ] });

// ---- summoned and mechanic units (forces 0) ---------------------------------------------------------------------------------

add({ id: 'yk_crawler_summoned', name: 'Aç Sürünen', model: ITCH('spider'), scale: 0.42, tint: 0xc8d4b0, role: 'swarm', rank: 'trash',
  hp: 0.55, dmg: 0.8, speed: 6.8, radius: 0.45, aggro: 9, forces: 0, xp: 0, anims: A_WOLF, resist: R_SPIDER, ai: { summoned: true },
  basic: cone('yk_crawler_summoned_bite', 'Isırık', 1.8, 100, 1.4, 1.0, 'Bite', 0.5, { windup: W(1.0) }), abilities: [] });

add({ id: 'yk_bloodguard_alarm', name: 'İri Kan Muhafızı (takviye)', model: SKEL('Skeleton_Warrior'), scale: 1.4, tint: 0x4a5a78, role: 'tank', rank: 'elite',
  hp: 6.0, dmg: 1.8, speed: 4.8, radius: 0.65, aggro: 10, forces: 0, xp: 0, ccImmune: true, anims: A_SKEL, resist: R_NERUB, ai: { summoned: true },
  basic: cone('yk_bloodguard_alarm_strike', 'Tokmak Darbesi', 3.4, 100, 2.4, 1.0, 'Attack', 0.45, { windup: W(1.0) }),
  abilities: bloodguardAbs().slice(0, 2) });

add({ id: 'yk_starved_crawler', name: 'Açlıktan Çılgın Sürünen', model: ITCH('spider'), scale: 0.34, tint: 0xd6dfae, role: 'swarm', rank: 'trash',
  hp: 0.6, dmg: 0.6, speed: 5.8, radius: 0.4, aggro: 9, forces: 0, xp: 0, anims: A_WOLF, resist: R_SPIDER, ai: { summoned: true },
  basic: cone('yk_starved_bite', 'Açlık Isırığı', 1.4, 100, 1.2, 0.6, 'Bite', 0.5, { windup: W(0.6) }), abilities: [] });

add({ id: 'yk_webmage_add', name: 'Ağ Bağlayıcı', model: SKEL('Skeleton_Mage'), scale: 1.0, tint: 0xb9c6d8, role: 'caster', rank: 'trash',
  hp: 1.2, dmg: 1.0, speed: 4.8, radius: 0.55, aggro: 12, forces: 0, xp: 0, anims: A_SKEL, resist: R_NERUB, ai: { summoned: true, kite: [8, 14] },
  basic: proj('yk_webmage_add_bolt', 'Ağ Oku', 16, 18, 2.4, WP(0.9), 0.9, 'poison', 'poison_projectile', 'Cast', 0.6),
  abilities: [
    aoe('yk_webmage_add_bind', 'Ağ Bağlama', 'self_aoe', 3, 14, 8, 1.8, 0.6, 'poison', 'Cast', 0.6,
      { castTime: 1.8, windup: 1.8, interruptible: true, kick: 1, statuses: [{ status: 'root', duration: 4 }], params: { impact: 0.6 } }),
  ] });

add({ id: 'yk_web_spinner', name: 'Ağ Örücü', model: SKEL('Skeleton_Mage'), scale: 0.8, tint: 0xb9c6d8, role: 'caster', rank: 'trash',
  hp: 0.9, dmg: 0.9, speed: 4.8, radius: 0.5, aggro: 12, forces: 0, xp: 0, anims: A_SKEL, resist: R_NERUB, ai: { summoned: true, kite: [8, 12] },
  basic: NOOP('yk_web_spinner_none'),
  abilities: [
    proj('yk_web_spinner_fling', 'Ağ Fırlat', 16, 16, 15, 1.2, 0.6, 'physical', 'web_burst', 'Cast', 0.6,
      { castTime: 1.2, windup: 1.2, interruptible: true, kick: 1, statuses: [{ status: 'root', duration: 3 }, { status: 'exposed', duration: 15, magnitude: 0.15 }] }),
  ] });

// Kara Kan Havuzu: a breakable slime body stands in for the PROC pool (no PROC builder exists yet).
add({ id: 'yk_blood_pool', name: 'Kara Kan Havuzu', model: SKEL('slime_green'), scale: 1.2, tint: 0x3a1245, role: 'support', rank: 'trash',
  hp: 0.5, dmg: 0.5, speed: 0, radius: 0.8, aggro: 0, forces: 0, xp: 0, ccImmune: true, anims: A_GEN, resist: R_NERUB, ai: { summoned: true, stationary: true },
  basic: NOOP('yk_blood_pool_none'), abilities: [] });

// Aralıksız Sürü: the roaming swarm cloud. The PROC body is a placeholder (energy_orb) until a swarm_cloud builder exists.
add({ id: 'yk_ceaseless_swarm', name: 'Aralıksız Sürü', model: 'PROC:energy_orb', scale: 1.0, tint: 0xd09a3c, role: 'support', rank: 'trash',
  hp: 0.5, dmg: 0.5, speed: 3, radius: 1.5, aggro: 0, forces: 0, xp: 0, ccImmune: true, anims: A_GEN, ai: { summoned: true },
  basic: NOOP('yk_ceaseless_swarm_none'), abilities: [] });

// ---- posture bars: elites, minibosses and the bloodguard add (design section 4 and 5) ---------------------------------------
const POISE: Record<string, number> = {
  yk_engorged: 140, yk_bloodguard: 260, yk_overseer: 180, yk_ixin: 400, yk_nakt: 400, yk_atik: 400,
};
for (const [id, v] of Object.entries(POISE)) {
  const d = ENEMIES[id];
  if (d) d.poise = v;
  else console.warn(`[yanki_agi] poise: unknown enemy ${id}`);
}

// ---- bosses ---------------------------------------------------------------------------------------------------------------

const RAID_POISE = 900;

boss({
  id: 'boss_avanoksa', name: 'Doyumsuz Avanoksa', title: "Parçalanmış Tellerin Anası", model: ITCH('spider'), scale: 2.6, tint: 0xc8d4b0,
  role: 'melee', hp: 85, dmg: 2.4, speed: 5.6, radius: 2.1, enrage: 270, arenaR: 22, loot: 'loot_yk_b1',
  anims: { ...A_WOLF, death: 'Death' }, resist: R_SPIDER,
  visual: { eyeEmissive: 0x70e0c8, glow: 0x70e0c8, runRef: 5.6 },
  basic: cone('yk_avanoksa_claw', 'Pençe', 5.0, 120, 3.2, 1.0, 'Bite', 0.5, { windup: 1.0 }),
  abilities: [
    custom('yk_av_string', 'Üçlü Pençe Zinciri', 3.2, undefined, 0.7, 'Bite', { params: { impact: 0.5 } }),
    custom('yk_av_bite', 'Oburca Isırık', 16, 5, 1.0, 'Bite', { tankBuster: true, params: { impact: 0.5 } }),
    custom('yk_av_leap', 'Sıçrayan Ezme', 24, 10, 1.4, 'Strike', { params: { impact: 0.6 } }),
    custom('yk_av_shrill', 'Uyarı Çığlığı', 42, 12, 3.0, 'Threat', { sfx: 'boss_roar', params: { impact: 0.45 } }),
    custom('yk_av_onslaught', 'Ağ Yağmuru', 45, 24, 1.0, 'Cast', { vfx: 'web_burst', params: { impact: 0.55 } }),
    custom('yk_av_infest', 'Sürü Hastalığı', 38, 18, 0, 'Cast', { vfx: 'poison_cloud', params: { impact: 0.35 } }),
  ],
  phases: [
    bp('p1', 1.01, ['yk_av_string', 'yk_av_bite', 'yk_av_leap', 'yk_av_shrill', 'yk_av_onslaught', 'yk_av_infest']),
    bp('p2', 0.4, ['yk_av_string', 'yk_av_bite', 'yk_av_leap', 'yk_av_shrill', 'yk_av_onslaught', 'yk_av_infest'], { yell: 'AÇIM! AÇIM!' }),
  ],
  intro: 'Tssk... tssk... AÇIM!', death: '...Ağlarım... boşa...',
  arena: { cx: 162, cz: 154, w: 52, h: 44, homeX: 164, homeZ: 150 } });

boss({
  id: 'boss_anubzek', name: 'Gözetmen Anubzek', title: 'Hasat Başgözetmeni', model: SKEL('Skeleton_Warrior'), scale: 2.1, tint: 0x4a5a78,
  role: 'melee', hp: 95, dmg: 2.6, speed: 6.0, radius: 1.5, enrage: 300, arenaR: 26, loot: 'loot_yk_b2',
  anims: { ...A_SKEL, death: 'Death_C_Skeletons' }, resist: R_NERUB,
  visual: { eyeEmissive: 0x40ffe0, runRef: 6 },
  basic: cone('yk_anubzek_thrust', 'Mızrak', 6.0, 60, 3.0, 1.0, 'Attack', 0.5, { windup: 1.0 }),
  abilities: [
    custom('yk_an_string', 'Mızrak Zinciri', 3.0, undefined, 0.7, 'Attack', { params: { impact: 0.5 } }),
    custom('yk_an_impale', 'Mızraklama', 14, 7, 1.2, 'Attack2', { tankBuster: true, statuses: [bleed(3, 0.2, 10)], params: { impact: 0.5 } }),
    custom('yk_an_burrow', 'Yer Altı Hücumu', 32, 14, 1.0, 'Cast', { params: { impact: 0.8 } }),
    custom('yk_an_echo', 'Yankı Basışı', 26, 20, 1.3, 'Attack', { params: { impact: 0.8 } }),
    custom('yk_an_infest', 'Sürü Hastalığı', 40, 20, 0, 'Cast', { vfx: 'poison_cloud', params: { impact: 0.4 } }),
    custom('yk_an_webmages', 'Ağ Büyücüleri', 26, 10, 0.5, 'Cast', { params: { impact: 0.5 } }),
  ],
  phases: [
    bp('p1', 1.01, ['yk_an_string', 'yk_an_impale', 'yk_an_burrow', 'yk_an_echo', 'yk_an_infest', 'yk_an_webmages']),
    bp('p2', 0.3, ['yk_an_string', 'yk_an_impale', 'yk_an_burrow', 'yk_an_echo', 'yk_an_infest', 'yk_an_webmages'], { yell: 'Yankı bitmez! Sürü, uyan!' }),
  ],
  intro: 'Hasat durmaz. Kovan sizi de dokuyacak.', death: 'Yankı... bende... susmuyor...',
  arena: { cx: 110, cz: 42, w: 52, h: 52, homeX: 110, homeZ: 30 } });

boss({
  id: 'boss_kikatal', name: 'Hasatçı Kikatal', title: 'Kara Kan Hasatçısı', model: SKEL('Skeleton_Warrior'), scale: 2.3, tint: 0x6a3a8a,
  role: 'melee', hp: 120, dmg: 2.7, speed: 5.2, radius: 1.4, enrage: 330, arenaR: 28, loot: 'loot_yk_b3',
  anims: { ...A_SKEL, death: 'Death_C_Skeletons' }, resist: R_NERUB,
  visual: { eyeEmissive: 0x8a40c0, glow: 0x8a40c0, runRef: 5.2 },
  basic: cone('yk_kikatal_sweep', 'Hasat Savurması', 6.0, 180, 3.5, 1.2, 'Attack', 0.5, { windup: 1.0 }),
  abilities: [
    custom('yk_kk_string', 'Hasat Zinciri', 3.5, undefined, 0.7, 'Attack', { params: { impact: 0.5 } }),
    custom('yk_kk_hook', 'Kan Kancası', 18, 6, 1.3, 'Attack2', { tankBuster: true, params: { impact: 0.5 } }),
    custom('yk_kk_tide', 'Kan Gelgiti', 26, 16, 1.2, 'Attack', { params: { impact: 0.8 } }),
    custom('yk_kk_haul', 'Kan İşçileri', 22, 8, 0.5, 'Cast', { params: { impact: 0.5 } }),
    custom('yk_kk_singularity', 'Kozmik Teklik', 48, 20, 3.0, 'Cast', { interruptible: true, kick: 2, params: { impact: 3.0 } }),
    custom('yk_kk_poisons', 'İşlenmiş Zehirler', 30, 14, 0, 'Cast', { vfx: 'poison_burst', params: { impact: 0.3 } }),
    custom('yk_kk_webs', 'Patlayan Ağlar', 26, 10, 1.8, 'Cast', { vfx: 'web_burst', params: { impact: 1.8 } }),
  ],
  phases: [
    bp('p1', 1.01, ['yk_kk_string', 'yk_kk_hook', 'yk_kk_tide', 'yk_kk_haul', 'yk_kk_singularity', 'yk_kk_poisons', 'yk_kk_webs']),
    bp('p2', 0.4, ['yk_kk_string', 'yk_kk_hook', 'yk_kk_tide', 'yk_kk_haul', 'yk_kk_singularity', 'yk_kk_poisons', 'yk_kk_webs'], { yell: 'Hasat hızlansın!' }),
  ],
  intro: 'Kara Kan şehri yükseltecek. Siz yalnızca akacaksınız.', death: 'Ağ... yırtıldı... yankı... susuyor...',
  arena: { cx: 222, cz: 116, w: 60, h: 56, homeX: 222, homeZ: 128 } });

for (const id of ['boss_avanoksa', 'boss_anubzek', 'boss_kikatal']) {
  const b = BOSSES[id];
  if (b) b.poise = RAID_POISE;
  else console.warn(`[yanki_agi] poise: unknown boss ${id}`);
}

/** Ids this module registers (the dungeon file and the boss script read them). */
export const YANKI_AGI_ENEMY_IDS = [
  'yk_crawler', 'yk_wasp', 'yk_carrier', 'yk_attendant', 'yk_worker', 'yk_assistant', 'yk_webmage', 'yk_bloodtender', 'yk_drone',
  'yk_stagshell', 'yk_engorged', 'yk_bloodguard', 'yk_overseer', 'yk_ixin', 'yk_nakt', 'yk_atik',
  'yk_crawler_summoned', 'yk_bloodguard_alarm', 'yk_starved_crawler', 'yk_webmage_add', 'yk_web_spinner', 'yk_bloodworker_run',
  'yk_blood_pool', 'yk_ceaseless_swarm',
] as const;
export const YANKI_AGI_BOSS_IDS = ['boss_avanoksa', 'boss_anubzek', 'boss_kikatal'] as const;
