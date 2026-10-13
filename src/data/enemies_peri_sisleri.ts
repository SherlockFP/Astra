/**
 * Peri Sisleri (peri_sisleri) enemy defs: 14 trash types, the elites, the mini-boss, the mechanic adds (larva, Vulpin,
 * Droman, 8 illusion clones, 3 parasites, Kibir) and the three bosses.
 * Design source: docs/dungeons/peri_sisleri.md sections 4 and 5.
 * Registration: enemies.ts must `import './enemies_peri_sisleri'` (side effect: fills ENEMIES and BOSSES).
 * Deviations from the design doc, all because the engine lacks the piece today: no move-set strings (a multi-strike attack is
 * one cone with the summed coefficient), no CUSTOM handlers for trash heals / shield coat / pounce (generic builders instead),
 * no befriend passive, no onBreak lock lists, no mask or wing attachments (their GLBs are not built yet), no fixate on larvae.
 * OWNER: enemies module.
 */
import {
  add, boss, bp, cone, proj, aoe, charge, heal, buff, passive, custom, onDeath, NOOP, poison, bleed, ENEMIES,
  A_KAYKIT, A_ENEMY, A_WOLF, A_WASP, A_GEN, R_CULT, R_BEAST, KNIGHT_HIDE, ROGUE_HIDE, mageHide,
} from './enemyKit';
import { CHAR, MON, GEN, ITCH } from './enemyModels';
import type { Ab } from './enemyKit';

// ---- trash -----------------------------------------------------------------------------------------------------------------

add({ id: 'ps_spiteclaw', name: 'Boynuz Pençesi', model: CHAR('Rogue_Hooded'), scale: 0.95, tint: 0x6a4a5a, role: 'swarm', rank: 'trash',
  hp: 0.45, dmg: 0.8, speed: 6.9, radius: 0.45, aggro: 9, forces: 2, anims: A_KAYKIT, resist: R_CULT,
  visual: { hide: ROGUE_HIDE.filter((n) => n !== 'Knife'), eyeEmissive: 0xc060ff, runRef: 7 },
  basic: cone('ps_spiteclaw_claw', 'Kanlı Pençe', 1.8, 100, 1.4, 1.0, '1H_Melee_Attack_Slice_Diagonal', 0.38, { windup: 0.45, statuses: [bleed(1, 0.2, 6)] }),
  abilities: [
    charge('ps_spiteclaw_leap', 'Atılış', 8, 10, 0.75, 1.2, '1H_Melee_Attack_Stab', 0.45),
    onDeath(aoe('ps_spiteclaw_curse', 'Kin Laneti', 'self_aoe', 5, 0, 0, 0.9, 0, 'shadow', '', 0,
      { telegraph: true, vfx: 'curse_loop', statuses: [{ status: 'kin_laneti', duration: 10, stacks: 1 }], dispel: 'kin_laneti' })),
  ] });

add({ id: 'ps_soulcleaver', name: 'Ruh Yarıcı', model: CHAR('Barbarian'), scale: 1.0, tint: 0x5a4452, role: 'melee', rank: 'trash',
  hp: 1.4, dmg: 1.2, speed: 5.8, radius: 0.6, aggro: 10, forces: 5, anims: A_KAYKIT, resist: R_CULT,
  visual: { eyeEmissive: 0xc060ff, runRef: 6.5 },
  basic: cone('ps_soulcleaver_cleave', 'Yarma', 2.6, 100, 2.0, 1.0, '2H_Melee_Attack_Slice', 0.5, { windup: 0.7 }),
  abilities: [
    cone('ps_soulcleaver_split', 'Ruh Yarığı', 3.6, 70, 11, 1.4, '2H_Melee_Attack_Chop', 0.55,
      { windup: 0.9, telegraph: true, statuses: [{ status: 'bleed', duration: 6, stacks: 1, magnitude: 0.3 }], dispel: 'bleed' }),
    cone('ps_soulcleaver_twin', 'Çifte Biçme', 3.0, 100, 9, 2.4, '2H_Melee_Attack_Slice', 0.5, { windup: 1.05, knockback: 3 }),
  ] });

add({ id: 'ps_harvester', name: 'Ruh Biçici', model: CHAR('Mage'), scale: 1.0, tint: 0x4a3a5a, role: 'caster', rank: 'trash',
  hp: 1.0, dmg: 1.2, speed: 4.9, radius: 0.55, aggro: 12, forces: 5, anims: A_KAYKIT, resist: R_CULT, ai: { kite: [10, 16] },
  visual: { hide: mageHide('2H_Staff'), glow: 0xb060ff, runRef: 7 },
  basic: proj('ps_harvester_bolt', 'Ruh Oku', 16, 18, 2.4, 0.6, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'shadow_cast' }),
  abilities: [
    heal('ps_harvester_harvest', 'Öz Biçme', 3.0, 13, 0.12, 'Spellcasting', 0.3, { kick: 2, initialCooldown: 4, vfx: 'shadow_burst' }),
    aoe('ps_harvester_thorn', 'Ruh Dikeni', 'ground_aoe', 1.8, 16, 9, 0.9, 1.3, 'shadow', 'Spellcast_Shoot', 0.3, { vfx: 'shadow_burst' }),
  ] });

add({ id: 'ps_guardian', name: 'Sis Muhafızı', model: CHAR('Knight'), scale: 1.0, tint: 0x6a9a78, role: 'melee', rank: 'trash',
  hp: 1.3, dmg: 1.1, speed: 5.8, radius: 0.6, aggro: 10, forces: 4, anims: A_KAYKIT, resist: R_BEAST,
  visual: { hide: KNIGHT_HIDE.filter((n) => n !== '1H_Sword' && n !== 'Round_Shield'), eyeEmissive: 0x80ffe0, runRef: 7 },
  basic: cone('ps_guardian_thrust', 'Mızrak', 3.0, 80, 2.0, 1.0, '1H_Melee_Attack_Stab', 0.4, { windup: 0.7 }),
  abilities: [
    cone('ps_guardian_flurry', 'Mızrak Yağmuru', 4.5, 70, 11, 1.5, '1H_Melee_Attack_Stab', 0.4, { windup: 1.0, telegraph: true }),
    aoe('ps_guardian_buck', 'Tepme Çılgınlığı', 'self_aoe', 4, 4, 12, 1.4, 1.6, 'physical', '2H_Melee_Attack_Spin', 0.6, { vfx: 'ground_slam', telegraph: true }),
    passive('cult_acolyte_fanatic', 'Yas Öfkesi', { radius: 10, perStack: 0.12, maxStacks: 5, duration: 10 }),
  ] });

add({ id: 'ps_villager', name: 'Peri Köylüsü', model: CHAR('Barbarian'), scale: 1.15, tint: 0x6a8a58, role: 'tank', rank: 'elite',
  hp: 5.5, dmg: 1.1, speed: 5.0, radius: 0.75, aggro: 9, forces: 8, anims: A_KAYKIT, resist: R_BEAST, visual: { runRef: 6 },
  basic: cone('ps_villager_club', 'Odun Darbesi', 2.8, 110, 2.4, 1.0, '2H_Melee_Attack_Chop', 0.5, { windup: 0.7 }),
  abilities: [
    cone('ps_villager_pollen', 'Şaşırtan Polen', 6, 60, 13, 0.6, 'Spellcast_Raise', 0.5,
      { windup: 1.2, telegraph: true, parryable: false, statuses: [{ status: 'fear', duration: 4 }] }),
    aoe('ps_villager_overgrowth', 'Aşırı Büyüme', 'ground_aoe', 2.2, 14, 16, 1.5, 0.8, 'poison', 'Spellcast_Raise', 0.5,
      { vfx: 'poison_burst', statuses: [{ status: 'stun', duration: 2 }] }),
    cone('ps_villager_slam', 'Dev Çakma', 3.4, 70, 15, 2.2, '2H_Melee_Attack_Chop', 0.5, { windup: 1.0, knockback: 3 }),
  ] });

add({ id: 'ps_stalker', name: 'Sis Avcısı', model: ITCH('wolf'), scale: 0.85, tint: 0x80c8d8, role: 'melee', rank: 'trash',
  hp: 1.0, dmg: 1.3, speed: 7.4, radius: 0.55, aggro: 10, forces: 4, anims: A_WOLF, resist: R_BEAST,
  visual: { opacity: 0.85, eyeEmissive: 0x80ffe0 },
  basic: cone('ps_stalker_bite', 'Isırık', 2.0, 90, 1.5, 1.0, 'Bite', 0.47, { windup: 0.7 }),
  abilities: [
    charge('ps_stalker_pounce', 'Sisten Atılış', 16, 15, 1.0, 2.2, 'Lunge', 0.87, { kick: 1, statuses: [bleed(2, 0.25, 8)] }),
    cone('ps_stalker_twin', 'Çifte Pençe', 2.2, 90, 8, 2.2, 'Bite', 0.47, { windup: 1.0 }),
  ] });

add({ id: 'ps_tender', name: 'Sis Bakıcısı', model: CHAR('Mage'), scale: 1.0, tint: 0x6ab890, role: 'healer', rank: 'trash',
  hp: 1.1, dmg: 0.9, speed: 4.9, radius: 0.55, aggro: 12, forces: 5, anims: A_KAYKIT, resist: R_BEAST, ai: { kite: [10, 16] },
  visual: { hide: mageHide('1H_Wand'), glow: 0x80ffe0, runRef: 7 },
  basic: proj('ps_tender_thorn', 'Dikenli Sarmaşık', 16, 18, 2.4, 0.6, 1.0, 'poison', 'poison_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    heal('ps_tender_nourish', 'Ormanı Besle', 2.2, 15, 0.28, 'Spellcast_Raise', 1.0, { kick: 2, initialCooldown: 5 }),
    buff('ps_tender_bloom', 'Çiçeklenme', 1.5, 22, [{ status: 'regen', duration: 8, magnitude: 0.02 }], 'Spellcast_Raise', 1.0, { kick: 1 }),
  ] });

add({ id: 'ps_shaper', name: 'Sis Şekillendirici', model: CHAR('Mage'), scale: 1.0, tint: 0x88c8a0, role: 'caster', rank: 'trash',
  hp: 1.0, dmg: 1.0, speed: 4.9, radius: 0.55, aggro: 12, forces: 5, anims: A_KAYKIT, resist: R_BEAST, ai: { kite: [9, 14] },
  visual: { hide: mageHide('1H_Wand'), glow: 0x80ffc0, runRef: 7 },
  basic: proj('ps_shaper_bolt', 'Dal Oku', 16, 18, 2.4, 0.6, 1.0, 'poison', 'poison_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    buff('ps_shaper_coat', 'Çalı Zırhı', 1.6, 14, [{ status: 'shield', duration: 8, magnitude: 0.2 }], 'Spellcast_Raise', 1.0,
      { kick: 2, initialCooldown: 4, vfx: 'buff_aura' }),
    aoe('ps_shaper_thorns', 'Diken Yağmuru', 'ground_aoe', 1.6, 16, 10, 1.0, 0.9, 'poison', 'Spellcast_Raise', 0.4),
  ] });

add({ id: 'ps_stinger', name: 'Sis Sokucu', model: ITCH('wasp'), scale: 0.62, tint: 0x80e0c8, role: 'swarm', rank: 'trash',
  hp: 0.5, dmg: 0.9, speed: 6.4, radius: 0.4, aggro: 10, forces: 3, flying: true, hover: 1.3, anims: A_WASP, resist: R_BEAST,
  basic: cone('ps_stinger_sting', 'Sokma', 1.8, 100, 1.4, 1.0, 'Sting', 0.6, { windup: 0.45 }),
  abilities: [proj('ps_stinger_inject', 'Anima Enjeksiyonu', 16, 14, 10, 0.8, 0.6, 'poison', 'poison_projectile', 'Sting', 0.6,
    { statuses: [poison(1, 0.2, 6)], dispel: 'poison' })] });

add({ id: 'ps_nightblossom', name: 'Gece Çiçeği', model: GEN('mushroom_brute'), scale: 1.15, tint: 0xa070d0, role: 'melee', rank: 'elite',
  hp: 5.5, dmg: 1.5, speed: 5.0, radius: 0.9, aggro: 10, forces: 9, anims: A_GEN, resist: R_BEAST, visual: { runRef: 5 },
  basic: cone('ps_nightblossom_hit', 'Çiçek Darbesi', 2.8, 100, 2.2, 1.0, 'Attack', 0.5, { windup: 0.7 }),
  abilities: [
    cone('ps_nightblossom_bite', 'Üçlü Isırık', 3.2, 100, 9, 2.3, 'Attack', 0.5, { windup: 1.03, statuses: [poison(1, 0.2, 8)], dispel: 'poison' }),
    aoe('ps_nightblossom_pollen', 'Zehirli Polen', 'self_aoe', 4.5, 4.5, 14, 0.9, 0.8, 'poison', 'Cast', 0.6,
      { vfx: 'poison_cloud', statuses: [{ status: 'slow', duration: 3, magnitude: 0.3 }] }),
    cone('ps_nightblossom_grasp', 'Kök Kavrama', 3.0, 70, 22, 2.2, 'Attack', 0.5,
      { windup: 1.0, perilous: true, statuses: [{ status: 'root', duration: 1.1 }] }),
  ] });

add({ id: 'ps_gorger', name: 'Dikenfak Oburu', model: ITCH('centipede'), scale: 0.95, tint: 0x9ab040, role: 'ranged', rank: 'trash',
  hp: 1.1, dmg: 1.3, speed: 5.6, radius: 0.7, aggro: 11, forces: 5, anims: { ...A_WOLF, spawn: 'Emerge' }, resist: R_BEAST, ai: { kite: [8, 14] },
  basic: proj('ps_gorger_spit', 'Asit Tükürüğü', 14, 16, 2.4, 0.6, 1.0, 'poison', 'poison_projectile', 'Bite', 0.55),
  abilities: [
    aoe('ps_gorger_globule', 'Asit Damlası', 'ground_aoe', 2.2, 16, 12, 1.3, 1.6, 'poison', 'Bite', 0.55,
      { castTime: 1.3, interruptible: true, kick: 2, knockback: 6, vfx: 'poison_burst' }),
    aoe('ps_gorger_volatile', 'Uçucu Asit', 'ground_aoe', 1.8, 16, 8, 1.6, 1.1, 'poison', 'Bite', 0.55, { vfx: 'poison_cloud' }),
  ] });

add({ id: 'ps_staghorn', name: 'Dikenfak Geyikboynuz', model: ITCH('rhino'), scale: 0.95, tint: 0x8a7a50, role: 'tank', rank: 'elite',
  hp: 4.4, dmg: 1.5, speed: 5.4, radius: 1.0, aggro: 10, forces: 8, anims: A_WOLF, resist: R_BEAST,
  basic: cone('ps_staghorn_gore', 'Boynuz', 3.0, 100, 2.4, 1.0, 'Gore', 0.45, { windup: 0.7 }),
  abilities: [
    buff('ps_staghorn_resist', 'Direnç Uyarımı', 1.8, 16, [{ status: 'shield', duration: 10, magnitude: 0.25 }], 'Roar', 0.4,
      { kick: 2, initialCooldown: 6, vfx: 'shield_bubble' }),
    heal('ps_staghorn_regen', 'Yenileme Uyarımı', 2.0, 18, 0.2, 'Roar', 0.4, { kick: 2, initialCooldown: 10 }),
    charge('ps_staghorn_rush', 'Boynuz Hücumu', 9, 16, 0.95, 2.0, 'Gore', 0.45, { initialCooldown: 8 }),
  ] });

add({ id: 'ps_reaver', name: 'Dikenfak Yağmacı', model: ITCH('wasp'), scale: 0.8, tint: 0x70a830, role: 'melee', rank: 'trash',
  hp: 0.9, dmg: 1.2, speed: 6.4, radius: 0.5, aggro: 14, forces: 4, flying: true, hover: 2.0, anims: A_WASP, resist: R_BEAST,
  basic: cone('ps_reaver_sting', 'Sokma', 1.8, 100, 1.4, 1.0, 'Sting', 0.6, { windup: 0.7 }),
  abilities: [charge('ps_reaver_assault', 'Delici Hücum', 9, 9, 0.83, 1.5, 'Dive', 0.9, { statuses: [poison(1, 0.25, 10)], dispel: 'poison' })] });

add({ id: 'ps_matriarch', name: 'Sis Ana', model: CHAR('Mage'), scale: 1.55, tint: 0x70c8a8, role: 'healer', rank: 'miniboss',
  hp: 9.0, dmg: 1.5, speed: 4.9, radius: 0.9, aggro: 10, forces: 14, anims: A_KAYKIT, resist: R_BEAST,
  visual: { hide: mageHide('2H_Staff'), glow: 0x80ffe0, runRef: 7 },
  basic: cone('ps_matriarch_claw', 'Sis Pençesi', 3.0, 100, 2.2, 1.0, 'Spellcast_Shoot', 0.3, { windup: 0.7 }),
  abilities: [
    heal('ps_matriarch_radiance', 'Işık Havuzları', 3.0, 16, 0.12, 'Spellcasting', 0.3, { kick: 2, initialCooldown: 6, vfx: 'heal_loop' }),
    cone('ps_matriarch_shred', 'Zırh Parçalama', 4.0, 90, 9, 1.6, 'Spellcast_Shoot', 0.3,
      { windup: 0.9, telegraph: true, statuses: [{ status: 'sunder', duration: 8 }] }),
    cone('ps_matriarch_triple', 'Üçlü Pençe', 3.6, 100, 11, 3.0, 'Spellcast_Shoot', 0.3, { windup: 1.2, knockback: 4 }),
  ] });

// ---- mechanic adds and summoned units ---------------------------------------------------------------------------------

add({ id: 'ps_larva', name: 'Dikenfak Larvası', model: ITCH('centipede'), scale: 0.32, tint: 0xdce890, role: 'swarm', rank: 'trash',
  hp: 0.3, dmg: 0.6, speed: 6.0, radius: 0.35, aggro: 10, forces: 1, anims: A_WOLF, resist: R_BEAST,
  basic: cone('ps_larva_bite', 'Larva Isırığı', 1.2, 100, 1.4, 0.5, 'Bite', 0.5, { windup: 0.45 }),
  abilities: [onDeath(aoe('ps_larva_pool', 'Çürüme Birikintisi', 'ground_aoe', 2.6, 0, 0, 0.5, 0.3, 'poison', '', 0,
    { telegraph: false, vfx: 'poison_cloud' }))] });

add({ id: 'ps_vulpin', name: 'Sis Tilkisi', model: ITCH('wolf'), scale: 0.55, tint: 0xd8f0ff, role: 'melee', rank: 'trash',
  hp: 6, dmg: 1.0, speed: 5.6, radius: 0.5, aggro: 30, forces: 0, anims: A_WOLF, resist: R_BEAST,
  visual: { opacity: 0.8 }, ai: { summoned: true },
  basic: aoe('ps_vulpin_burst', 'Donduran Patlama', 'self_aoe', 8, 2.0, 1.0, 0.4, 1.2, 'frost', 'Attack', 0.3,
    { statuses: [{ status: 'freeze', duration: 6 }] }),
  abilities: [] });

add({ id: 'ps_droman', name: 'Droman Ulfaran', model: CHAR('Barbarian'), scale: 1.6, tint: 0x7a6a4a, role: 'tank', rank: 'elite',
  hp: 28, dmg: 1.6, speed: 5.2, radius: 0.9, aggro: 40, forces: 0, anims: A_KAYKIT, resist: R_CULT,
  visual: { eyeEmissive: 0xc060ff, runRef: 5.2 }, ai: { summoned: true },
  basic: cone('droman_club', 'Hasır Gürz', 3.2, 110, 2.6, 1.0, '2H_Melee_Attack_Chop', 0.5, { windup: 0.7 }),
  abilities: [
    cone('droman_bash', 'Kalkan Vuruşu', 2.8, 100, 11, 1.0, '1H_Melee_Attack_Stab', 0.4, { windup: 0.7 }),
    cone('droman_slam', 'Ezme', 3.6, 90, 11, 2.6, '2H_Melee_Attack_Chop', 0.5, { windup: 0.9, knockback: 4 }),
    charge('droman_leap', 'Hasır Fırtınası', 8, 18, 0.95, 2.4, '2H_Melee_Attack_Chop', 0.5, { initialCooldown: 9 }),
    aoe('droman_tears', 'Ormanın Gözyaşları', 'ground_aoe', 2.5, 12, 20, 1.6, 1.4, 'poison', 'Spellcast_Raise', 1.0, { initialCooldown: 6 }),
    cone('droman_pollen', 'Şaşırtan Polen', 6, 60, 14, 0.6, 'Spellcast_Raise', 0.5,
      { windup: 1.2, telegraph: true, parryable: false, statuses: [{ status: 'fear', duration: 4 }] }),
  ] });

// Illusion clones of the Guessing Game: one def per sigil code (F|L, D|B, H|N). Killed by one hit, they never attack.
for (const shape of ['F', 'L']) for (const fill of ['D', 'B']) for (const ring of ['H', 'N']) {
  const code = shape + fill + ring;
  add({ id: 'ps_mist_clone_' + code, name: 'Sis İllüzyonu', model: CHAR('Mage'), scale: 1.3, tint: 0x80e8d8, role: 'support', rank: 'trash',
    hp: 0.05, dmg: 0, speed: 0, radius: 0.6, aggro: 0, forces: 0, ccImmune: true, xp: 0, anims: A_KAYKIT, resist: R_BEAST,
    visual: { hide: mageHide(), glow: 0x80ffe0, runRef: 7 }, ai: { summoned: true, stationary: true },
    basic: NOOP('ps_mist_clone_' + code + '_none'), abilities: [] });
}

// Tred'ova's parasites (M+ key 7 and up): a 2.4 s interruptible cast on their own position that applies a control status.
for (const [id, name, status, dur] of [
  ['ps_parasite_p', 'Boyun Eğdiren', 'silence', 8],
  ['ps_parasite_i', 'Sersemleten', 'stun', 6],
  ['ps_parasite_d', 'Hükmeden', 'fear', 6],
] as const) {
  add({ id, name: `Asalak (${name})`, model: ITCH('centipede'), scale: 0.2, tint: 0xc060ff, role: 'support', rank: 'trash',
    hp: 0.4, dmg: 0.5, speed: 0, radius: 0.3, aggro: 0, forces: 0, ccImmune: true, xp: 0, anims: A_WOLF, resist: R_BEAST,
    ai: { summoned: true, stationary: true },
    basic: NOOP(id + '_none'),
    abilities: [aoe(id + '_cast', name, 'self_aoe', 3, 0, 6, 2.4, 0.1, 'shadow', 'Bite', 0.5,
      { castTime: 2.4, interruptible: true, kick: 2, statuses: [{ status, duration: dur }] } as Ab)] });
}

add({ id: 'ps_kibir', name: 'Kibir Tecessümü', model: MON('Giant'), scale: 1.2, tint: 0xffd060, role: 'melee', rank: 'elite',
  hp: 4, dmg: 1.2, speed: 4.4, radius: 1.1, aggro: 10, forces: 0, ccImmune: true, xp: 0, anims: A_ENEMY, resist: R_CULT, ai: { summoned: true },
  basic: cone('ps_kibir_smash', 'Kibir Darbesi', 3.4, 120, 2.6, 1.0, 'Attack', 0.47, { windup: 0.7 }),
  abilities: [] });

add({ id: 'ps_boughbreaker', name: 'Dal Kıran', model: MON('Giant'), scale: 1.1, tint: 0x6a5a40, role: 'tank', rank: 'elite',
  hp: 4.2, dmg: 1.6, speed: 4.4, radius: 1.1, aggro: 10, forces: 10, anims: A_ENEMY, resist: { physical: 0.1, fire: -0.25, poison: 0.25 },
  visual: { runRef: 4.4 },
  basic: cone('ps_boughbreaker_smash', 'Dal Darbesi', 3.4, 120, 2.6, 1.0, 'Attack', 0.47, { windup: 0.7 }),
  abilities: [
    aoe('ps_boughbreaker_burst', 'Dikenli Patlama', 'self_aoe', 5.5, 5.5, 14, 1.2, 1.3, 'poison', 'Attack', 0.47,
      { vfx: 'poison_burst', statuses: [{ status: 'slow', duration: 4, magnitude: 0.4 }], dispel: 'slow' }),
    cone('ps_boughbreaker_sweep', 'Dal Savurma', 3.6, 120, 12, 2.0, 'Attack', 0.47, { windup: 0.95, knockback: 4 }),
    passive('forge_demon_rage', 'Çılgın Dövünme', { hpBelow: 0.5, atkSpeed: 0.4 }),
  ] });

// Poise bars (elites, mini-boss and the Droman guardian). def() does not carry poise, so it is set on the registered defs.
const POISE: Record<string, number> = {
  ps_boughbreaker: 130, ps_villager: 120, ps_staghorn: 120, ps_nightblossom: 130, ps_matriarch: 300, ps_droman: 220,
};
for (const [id, v] of Object.entries(POISE)) {
  const d = ENEMIES[id];
  if (d) d.poise = v;
  else console.warn(`[peri_sisleri] poise: unknown enemy ${id}`);
}

// ---- bosses ----------------------------------------------------------------------------------------------------------------

boss({
  id: 'boss_ingra_malok', name: 'Ingra Malok', title: 'Boynuzlu Ahalinin Ruh Bilgesi', model: CHAR('Mage'), scale: 1.55, tint: 0x6a3a6a,
  role: 'caster', hp: 70, dmg: 2.2, speed: 4.5, radius: 1.0, enrage: 270, arenaR: 22, loot: 'loot_ps_b1',
  anims: { ...A_KAYKIT, death: 'Death_B' }, resist: R_CULT,
  visual: { hide: mageHide('2H_Staff'), eyeEmissive: 0xc060ff, glow: 0xb060ff, runRef: 7 },
  basic: proj('ingra_bolt', 'Karanlık Ok', 16, 40, 2.6, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'shadow_cast' }),
  abilities: [
    proj('ingra_spirit_bolt', 'Ruh Oku', 14, 40, 8, 2.0, 2.4, 'shadow', 'shadow_projectile', 'Spellcast_Long', 1.55,
      { initialCooldown: 5, castTime: 2.0, interruptible: true, kick: 2 }),
    custom('ingra_staff', 'Boynuz Biçişi', 12, 12, 0.75, '2H_Melee_Attack_Slice', { params: { impact: 0.4 } }),
    custom('ingra_sweep', 'Ruh Süpürmesi', 24, 24, 0.9, 'Spellcast_Long', { params: { impact: 1.0 } }),
    custom('ingra_embrace', 'Karanlığa Sarıl', 40, 16, 1.2, 'Spellcast_Raise', { sfx: 'shadow_cast', params: { impact: 1.0 } }),
    custom('ingra_visage', 'İtici Görünüm', 50, 30, 2.0, 'Spellcast_Raise', { castTime: 2.0, interruptible: false, sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('ingra_breakfree', 'Zincirler Kırıldı', 999, 9999, 1.5, 'Taunt', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['ingra_spirit_bolt', 'ingra_staff', 'ingra_sweep', 'ingra_embrace', 'ingra_visage']),
    bp('p2', 0.2, ['ingra_spirit_bolt', 'ingra_staff', 'ingra_sweep', 'ingra_visage'], { yell: 'Hayır! Zincirler!', ability: 'ingra_breakfree' }),
  ],
  intro: "Bu koruluk artık Boynuzlu Ahali'nin. Anima bize aittir!", death: 'Döngü... beni de... kabul etmedi...',
  arena: { cx: 88, cz: 142, w: 56, h: 52, homeX: 88, homeZ: 134 } });

boss({
  id: 'boss_sis_cagiran', name: 'Sis Çağıran', title: 'Sisin Oyuncu Sahibi', model: CHAR('Mage'), scale: 1.3, tint: 0x80e8d8,
  role: 'caster', hp: 85, dmg: 2.0, speed: 5.0, radius: 0.9, enrage: 300, arenaR: 24, loot: 'loot_ps_b2',
  anims: { ...A_KAYKIT, death: 'Death_B' }, resist: R_BEAST,
  visual: { hide: mageHide('1H_Wand'), eyeEmissive: 0x80ffe0, glow: 0x80ffe0, hoverBob: 0.1, runRef: 7 },
  basic: proj('mist_touch', 'Sis Dokunuşu', 14, 40, 2.4, 0.6, 1.0, 'poison', 'poison_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    custom('mist_patty', 'Pasta Pasta', 14, 6, 1.5, 'Spellcast_Raise', { castTime: 1.5, interruptible: true, kick: 2, sfx: 'spell_cast', params: { impact: 1.0 } }),
    custom('mist_burst', 'Cezalı Patlama', 21, 11, 2.0, 'Spellcast_Long', { sfx: 'boss_cast', params: { impact: 1.55 } }),
    custom('mist_dodgeball', 'Kaçınma Topu', 19, 15, 1.3, 'Spellcast_Shoot', { sfx: 'boss_cast', params: { impact: 0.3 } }),
    custom('mist_freeze', 'Dondurmaca', 38, 24, 1.0, 'Cheer', { sfx: 'frost_cast', params: { impact: 0.5 } }),
    custom('mist_dance', 'Sis Dansı', 40, 22, 1.1, 'Jump', { initialCooldown: 17, sfx: 'blink', params: { impact: 0.6 } }),
    custom('mist_guess', 'Sis Oyunu', 999, 9999, 1.2, 'Spellcast_Summon', { sfx: 'boss_cast' }),
  ],
  phases: [
    bp('p1', 1.01, ['mist_patty', 'mist_burst', 'mist_dodgeball', 'mist_freeze', 'mist_dance']),
    bp('g1', 0.70, [], { yell: 'Saklambaç oynayalım!', ability: 'mist_guess' }),
    bp('p2', 0.699, ['mist_patty', 'mist_burst', 'mist_dodgeball', 'mist_freeze', 'mist_dance']),
    bp('g2', 0.40, [], { yell: 'Yine! Yine!', ability: 'mist_guess' }),
    bp('p3', 0.399, ['mist_patty', 'mist_burst', 'mist_dodgeball', 'mist_freeze', 'mist_dance']),
    bp('g3', 0.10, [], { yell: 'Son bir oyun!', ability: 'mist_guess' }),
    bp('p4', 0.099, ['mist_patty', 'mist_burst', 'mist_dodgeball', 'mist_freeze', 'mist_dance']),
  ],
  intro: 'Oh, misafirler! Hadi oynayalım, kaybedenler sisin içinde kalır!', death: 'Yakalandım... ne güzel oyundu...',
  arena: { cx: 218, cz: 54, w: 52, h: 60, homeX: 228, homeZ: 54 } });

boss({
  id: 'boss_tredova', name: "Tred'ova", title: 'Dikenfak Yuvasının Anası', model: ITCH('centipede'), scale: 3.4, tint: 0xa8c060,
  role: 'melee', hp: 130, dmg: 2.5, speed: 4.6, radius: 2.2, enrage: 330, arenaR: 28, loot: 'loot_ps_b3',
  anims: A_WOLF, resist: { poison: 0.75, physical: 0.1, fire: -0.25 }, visual: { runRef: 4.6, glow: 0x9cff6a },
  basic: proj('tred_spit', 'Asit Tükürüğü', 18, 30, 3.0, 0.6, 0.8, 'poison', 'poison_projectile', 'Bite', 0.4),
  abilities: [
    custom('tred_bite', 'Çift Isırık', 4.5, 0, 0.7, 'Bite', { params: { impact: 0.5 } }),
    cone('tred_maul', 'Ezici Isırık', 7, 60, 18, 4.5, 'Attack2', 0.6, { initialCooldown: 8, windup: 1.5, telegraph: true, tankBuster: true,
      parryable: false, statuses: [{ status: 'asit_yarasi', duration: 8, stacks: 1 }] }),
    custom('tred_tail', 'Kuyruk Savurma', 13, 0, 1.0, 'Attack', { params: { impact: 0.5 } }),
    custom('tred_acid', 'Asit Fırlatma', 11, 6, 1.5, 'Cast', { sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('tred_marked', 'Hedef İşareti', 32, 14, 1.0, 'Cast', { sfx: 'boss_roar', params: { impact: 0.8 } }),
    custom('tred_mindlink', 'Zihin Bağı', 38, 22, 1.0, 'Cast', { sfx: 'shadow_cast', params: { impact: 0.8 } }),
    custom('tred_coalesce', 'Zehir Birikimi', 30, 20, 1.5, 'Enrage', { sfx: 'boss_cast', params: { impact: 1.2 } }),
    custom('tred_leap', 'Sıçrayıp Ezme', 28, 26, 1.2, 'Attack2', { sfx: 'ground_slam', params: { impact: 0.6, radius: 4.5 } }),
    custom('tred_rush', 'Kovuk Hücumu', 38, 30, 1.2, 'Run', { sfx: 'boss_roar', params: { length: 24, width: 4, speed: 18 } }),
    custom('tred_consume', 'Tüketme', 999, 9999, 1.2, 'Enrage', { sfx: 'boss_roar' }),
    custom('tred_frenzy', 'Açlık Çılgınlığı', 999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['tred_bite', 'tred_maul', 'tred_tail', 'tred_acid', 'tred_marked', 'tred_mindlink', 'tred_coalesce']),
    bp('c1', 0.70, [], { yell: "Lakali'nin tohumu... benim!", ability: 'tred_consume' }),
    bp('p2', 0.699, ['tred_bite', 'tred_maul', 'tred_tail', 'tred_acid', 'tred_marked', 'tred_mindlink', 'tred_coalesce', 'tred_leap']),
    bp('c2', 0.40, [], { yell: 'Daha... daha çok!', ability: 'tred_consume' }),
    bp('p3', 0.399, ['tred_bite', 'tred_maul', 'tred_tail', 'tred_acid', 'tred_marked', 'tred_mindlink', 'tred_coalesce', 'tred_leap', 'tred_rush']),
    bp('p4', 0.15, ['tred_bite', 'tred_maul', 'tred_tail', 'tred_acid', 'tred_marked', 'tred_mindlink', 'tred_coalesce', 'tred_leap', 'tred_rush'],
      { yell: 'AÇIM! AÇIM!', ability: 'tred_frenzy' }),
  ],
  intro: 'Tohum benim! Lakali benim! Hepiniz benim olacaksınız!', death: 'Açlık... dinmedi... ama... kozaları... kıracak...',
  arena: { cx: 248, cz: 210, w: 64, h: 52, homeX: 248, homeZ: 214 } });

/** Ids this module registers (the dungeon file and the boss script read them). */
export const PERI_SISLERI_ENEMY_IDS = [
  'ps_spiteclaw', 'ps_soulcleaver', 'ps_harvester', 'ps_guardian', 'ps_villager', 'ps_stalker', 'ps_tender', 'ps_shaper', 'ps_stinger',
  'ps_nightblossom', 'ps_gorger', 'ps_staghorn', 'ps_reaver', 'ps_matriarch', 'ps_boughbreaker',
  'ps_larva', 'ps_vulpin', 'ps_droman', 'ps_parasite_p', 'ps_parasite_i', 'ps_parasite_d', 'ps_kibir',
] as const;
export const PERI_SISLERI_BOSS_IDS = ['boss_ingra_malok', 'boss_sis_cagiran', 'boss_tredova'] as const;
