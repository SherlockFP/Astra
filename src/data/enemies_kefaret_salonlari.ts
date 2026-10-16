/**
 * Kefaret Salonları (kefaret_salonlari) enemy defs: 12 attacking trash and elite types, the neutral Tormented souls, the Halkor
 * shard (a mechanic add that is also a pack member), and the four bosses. Design source: docs/dungeons/kefaret_salonlari.md
 * sections 4 and 5. Ids are prefixed `kef_`.
 * Registration: enemies.ts must `import './enemies_kefaret_salonlari'` (side effect: fills ENEMIES and BOSSES).
 * Forces (sum per pack in the dungeon file): darkblade 4, tazici 5, gargon 3, obliterator 5, collector 5, healer 5, slasher 6,
 * reaver 8, eviscerator 6, anklebiter 2, groundskeeper 5, sigar 12, shard 4, tormented 0 (the dungeon uses these sums).
 * Windup: every melee / cone / charge / projectile / line / ground attack uses the design curve clamp(0.45 + 0.25 x coef,
 * 0.45, 1.2) (line and ground at least 0.9, perilous at least 1.0); swarms are exempt in content-check.
 * Deviations from the design doc, all because the engine piece is not in the repo today: no move-set strings (multi-strike
 * attacks are one cone with the summed coefficient), no `kefaret_brand` / `sin_mark` / `sin_amplified` statuses (curse and
 * exposed stand in), no Anima Kalkanı ally targeting (self shield), no Kefaret Kapları or Hayalet Cemaat adds (Alyez mechanics
 * are simplified in the boss script), no Ölümsüz Taş Canavarı regenerating adds, no Günah Heykeli entities (Velkaan uses beams).
 * OWNER: enemies module.
 */
import {
  add, boss, bp, cone, proj, aoe, charge, heal, buff, custom, line, NOOP, bleed, ENEMIES,
  A_KAYKIT, A_ENEMY, A_CHAR, A_WOLF, A_GEN, R_CULT, R_BEAST, R_GOLEM, KNIGHT_HIDE, ROGUE_HIDE, mageHide,
} from './enemyKit';
import { CHAR, MON, GEN, GENB } from './enemyModels';

/** Design windup curve (GDD_CREATURES 1.2 as used by this dungeon's trash). */
const W = (coef: number): number => Math.min(1.2, Math.max(0.45, 0.45 + 0.25 * coef));

// ---- trash -----------------------------------------------------------------------------------------------------------------

add({ id: 'kef_darkblade', name: 'Yozlaşmış Karabıçak', model: CHAR('Rogue'), scale: 1.0, tint: 0x5a1822, role: 'melee', rank: 'trash',
  hp: 1.3, dmg: 1.4, speed: 7.0, radius: 0.5, aggro: 10, forces: 4, anims: A_KAYKIT, resist: R_CULT,
  visual: { hide: ROGUE_HIDE.filter((n) => n !== 'Knife' && n !== 'Knife_Offhand'), eyeEmissive: 0xc8382f, runRef: 7 },
  basic: cone('kef_darkblade_slash', 'Kara Kesik', 1.9, 90, 1.5, 1.0, '1H_Melee_Attack_Slice_Diagonal', 0.38, { windup: W(1.0) }),
  abilities: [
    charge('kef_darkblade_dash', 'Gölge Atılışı', 8, 14, W(1.6), 1.6, '1H_Melee_Attack_Stab', 0.45, { initialCooldown: 5 }),
    cone('kef_darkblade_flurry', 'Çifte Kesik', 2.2, 120, 11, 0.9, '1H_Melee_Attack_Slice_Horizontal', 0.42,
      { windup: 0.7, statuses: [bleed(1, 0.2, 6)] }),
  ] });

add({ id: 'kef_tazici', name: 'Yozlaşmış Tazıcı', model: CHAR('Rogue_Hooded'), scale: 1.0, tint: 0x6a2430, role: 'ranged', rank: 'trash',
  hp: 1.1, dmg: 1.1, speed: 5.6, radius: 0.5, aggro: 12, forces: 5, anims: A_KAYKIT, resist: R_CULT, ai: { kite: [8, 14] },
  visual: { hide: ROGUE_HIDE.filter((n) => n !== '2H_Crossbow'), eyeEmissive: 0xc8382f, runRef: 6 },
  basic: proj('kef_tazici_shot', 'Zincirli Ok', 16, 18, 2.4, W(1.0), 1.0, 'physical', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    buff('kef_tazici_call', 'Sadık Av', 2.0, 18, [{ status: 'empower', duration: 10, magnitude: 0.5 }], 'Spellcast_Raise', 1.0,
      { kick: 2, interruptible: true, initialCooldown: 4, vfx: 'buff_aura' }),
    aoe('kef_tazici_snare', 'Zincirli Kement', 'ground_aoe', 2.5, 16, 15, 1.15, 1.2, 'physical', 'Spellcast_Shoot', 0.3,
      { statuses: [{ status: 'slow', duration: 3, magnitude: 0.3 }], dispel: 'slow', initialCooldown: 7 }),
  ] });

add({ id: 'kef_gargon', name: 'Vahşi Gargon', model: GEN('wolf_dire'), scale: 1.0, tint: 0x6f6c80, role: 'melee', rank: 'trash',
  hp: 1.2, dmg: 1.1, speed: 7.6, radius: 0.55, aggro: 9, forces: 3, anims: A_WOLF, resist: R_GOLEM,
  visual: { eyeEmissive: 0xc8382f, runRef: 7 },
  basic: cone('kef_gargon_bite', 'Taş Isırık', 1.9, 100, 1.4, 0.9, 'Bite', 0.4, { windup: 0.7, statuses: [bleed(1, 0.2, 8)] }),
  abilities: [
    charge('kef_gargon_pounce', 'Atlayış', 6, 10, 0.8, 1.3, 'Bite', 0.78, { initialCooldown: 6 }),
    buff('kef_gargon_howl', 'Gece Uluması', 1.2, 20, [{ status: 'haste', duration: 6, magnitude: 0.2 }], 'Bite', 0.4,
      { initialCooldown: 10, vfx: 'buff_aura' }),
  ] });

add({ id: 'kef_obliterator', name: 'Yozlaşmış Yok Edici', model: CHAR('Mage'), scale: 1.0, tint: 0x7a1c2a, role: 'caster', rank: 'trash',
  hp: 1.2, dmg: 1.2, speed: 4.9, radius: 0.55, aggro: 12, forces: 5, anims: A_KAYKIT, resist: R_CULT, ai: { kite: [9, 14] },
  visual: { hide: mageHide('2H_Staff'), glow: 0xc8382f, runRef: 7 },
  basic: proj('kef_obliterator_bolt', 'Kefaret Oku', 16, 18, 2.6, 0.7, 0.9, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    proj('kef_obliterator_wicked', 'Kötü Ok', 14, 20, 9, 2.2, 2.4, 'shadow', 'shadow_projectile', 'Spellcast_Long', 1.55,
      { castTime: 2.2, interruptible: true, kick: 1, initialCooldown: 5 }),
    aoe('kef_obliterator_mark', 'Yok Ediş İşareti', 'ground_aoe', 3, 16, 16, 1.5, 2.6, 'shadow', 'Spellcast_Raise', 0.5,
      { statuses: [{ status: 'curse', duration: 3 }], dispel: 'curse', initialCooldown: 6 }),
  ] });

add({ id: 'kef_toplayici', name: 'Yozlaşmış Toplayıcı', model: CHAR('Mage'), scale: 1.0, tint: 0x3a1a3c, role: 'caster', rank: 'trash',
  hp: 1.2, dmg: 1.0, speed: 4.9, radius: 0.55, aggro: 12, forces: 5, anims: A_KAYKIT, resist: R_CULT, ai: { kite: [9, 14] },
  visual: { hide: mageHide('2H_Staff', 'Mage_Hat'), glow: 0x8a3aa0, runRef: 7 },
  basic: proj('kef_toplayici_bolt', 'Ruh Oku', 16, 18, 2.6, 0.7, 0.9, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    heal('kef_toplayici_siphon', 'Can Emme', 3.0, 13, 0.12, 'Spellcasting', 0.3,
      { kick: 1, interruptible: true, initialCooldown: 4, vfx: 'shadow_burst' }),
    proj('kef_toplayici_stain', 'Ruh Lekesi', 16, 18, 15, 0.85, 1.5, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3,
      { statuses: [{ status: 'curse', duration: 6, magnitude: 0.2 }], dispel: 'curse', initialCooldown: 6 }),
  ] });

add({ id: 'kef_rahip', name: 'Anima Rahibi', model: CHAR('Mage'), scale: 1.0, tint: 0xd8c8a0, role: 'healer', rank: 'trash',
  hp: 1.0, dmg: 0.9, speed: 4.8, radius: 0.55, aggro: 12, forces: 5, anims: A_KAYKIT, resist: R_CULT, ai: { kite: [10, 16] },
  visual: { hide: mageHide('2H_Staff', 'Mage_Hat'), glow: 0xc9a24a, runRef: 7 },
  basic: proj('kef_rahip_spark', 'Hüküm Kıvılcımı', 16, 18, 2.4, 0.65, 0.7, 'holy', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    heal('kef_rahip_heal', 'Anima Şifası', 2.5, 12, 0.25, 'Spellcasting', 0.3,
      { kick: 1, interruptible: true, initialCooldown: 4, vfx: 'heal_burst' }),
    buff('kef_rahip_ward', 'Anima Kalkanı', 1.6, 20, [{ status: 'shield', duration: 8, magnitude: 0.1 }], 'Spellcast_Raise', 1.0,
      { kick: 2, interruptible: true, initialCooldown: 9, vfx: 'shield_bubble' }),
  ] });

add({ id: 'kef_kiyici', name: 'Taş Kıyıcı', model: CHAR('Barbarian'), scale: 1.1, tint: 0x8a8898, role: 'melee', rank: 'trash',
  hp: 1.9, dmg: 1.5, speed: 6.0, radius: 0.6, aggro: 9, forces: 6, anims: A_KAYKIT, resist: R_GOLEM, ccImmune: true,
  visual: { hide: ['1H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Mug', 'Barbarian_Hat'], runRef: 6 },
  basic: cone('kef_kiyici_chop', 'Taş Balta', 2.6, 80, 2.0, 1.0, '2H_Melee_Attack_Chop', 0.5, { windup: 0.7 }),
  abilities: [
    cone('kef_kiyici_cleave', 'Kıyma', 5.0, 70, 11, 2.8, '2H_Melee_Attack_Slice', 0.5,
      { windup: W(2.8), telegraph: true, knockback: 4, statuses: [{ status: 'bleed', duration: 6, stacks: 1, magnitude: 0.3 }] }),
    aoe('kef_kiyici_screech', 'Taş Çığlığı', 'self_aoe', 8, 8, 16, 0.9, 0.6, 'physical', 'Spellcast_Raise', 0.5,
      { castTime: 1.5, interruptible: true, kick: 2, statuses: [{ status: 'silence', duration: 3 }], initialCooldown: 8 }),
  ] });

add({ id: 'kef_yagmaci', name: 'Taşkıran Yağmacı', model: CHAR('Knight'), scale: 1.2, tint: 0x6a6878, role: 'tank', rank: 'elite',
  hp: 2.8, dmg: 1.5, speed: 5.4, radius: 0.75, aggro: 10, forces: 8, anims: A_KAYKIT, resist: R_GOLEM, ccImmune: true,
  visual: { hide: KNIGHT_HIDE.filter((n) => n !== '1H_Sword' && n !== 'Round_Shield' && n !== 'Knight_Helmet'), runRef: 6 },
  basic: cone('kef_yagmaci_slash', 'Taş Pala', 2.8, 90, 2.2, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.4, { windup: 0.7 }),
  abilities: [
    cone('kef_yagmaci_mortal', 'Ölümcül Darbe', 3.2, 60, 10, 3.4, '2H_Melee_Attack_Chop', 0.5,
      { windup: 1.2, perilous: true, parryable: false, statuses: [{ status: 'mortal_wound', duration: 8 }] }),
    aoe('kef_yagmaci_stone', 'Taşa Çevir', 'self_aoe', 7, 7, 22, 0.9, 0.5, 'physical', 'Spellcast_Raise', 0.5,
      { castTime: 2.2, interruptible: true, kick: 2, statuses: [{ status: 'petrify', duration: 5 }], dispel: 'petrify', initialCooldown: 10 }),
    charge('kef_yagmaci_rush', 'Kalkan Hamlesi', 6, 15, W(1.5), 1.5, '1H_Melee_Attack_Stab', 0.4, { knockback: 3, initialCooldown: 9 }),
  ] });

add({ id: 'kef_parcalayici', name: 'Taş Parçalayıcı', model: MON('Orc'), scale: 1.0, tint: 0x7a788c, role: 'melee', rank: 'trash',
  hp: 1.6, dmg: 1.5, speed: 5.8, radius: 0.6, aggro: 10, forces: 6, anims: A_CHAR, resist: R_GOLEM,
  basic: cone('kef_parcalayici_cleave', 'Taş Pala', 2.8, 90, 2.0, 1.0, 'Attack', 0.5, { windup: 0.7 }),
  abilities: [
    line('kef_parcalayici_glaive', 'Kılıç Fırlat', 22, 2.4, 11, 1.4, 2.2, 'physical', 'Attack', 0.5, { windup: 1.4 }),
    aoe('kef_parcalayici_whirl', 'Dönen Kılıç', 'self_aoe', 3.6, 3.6, 17, 1.3, 1.8, 'physical', 'Attack', 0.5, { windup: 1.3 }),
  ] });

add({ id: 'kef_kemirgen', name: 'Taş Kemirgen', model: GEN('golem_stone'), scale: 0.4, tint: 0x5c5a6c, role: 'swarm', rank: 'trash',
  hp: 0.6, dmg: 0.9, speed: 7.6, radius: 0.35, aggro: 9, forces: 2, anims: A_GEN, resist: R_GOLEM,
  visual: { eyeEmissive: 0xc8382f },
  basic: cone('kef_kemirgen_bite', 'Ayak Bileği Isırığı', 1.3, 100, 1.2, 0.7, 'Attack', 0.4, { windup: 0.6, statuses: [bleed(1, 0.2, 6)] }),
  abilities: [charge('kef_kemirgen_leap', 'Sıçrama', 6, 9, 0.7, 0.9, 'Attack', 0.4, { initialCooldown: 4 })] });

add({ id: 'kef_bahcivan', name: 'Bataklık Bahçıvanı', model: MON('Zombie'), scale: 1.05, tint: 0x5a5230, role: 'melee', rank: 'trash',
  hp: 1.9, dmg: 1.2, speed: 5.0, radius: 0.6, aggro: 9, forces: 5, anims: A_ENEMY, resist: R_BEAST,
  basic: cone('kef_bahcivan_spade', 'Kürek', 2.2, 100, 2.0, 1.0, 'Attack', 0.45, { windup: 0.7 }),
  abilities: [
    cone('kef_bahcivan_swing', 'Kürek Savurma', 2.4, 110, 9, 1.6, 'Attack', 0.5, { windup: W(1.6), knockback: 2, initialCooldown: 5 }),
    aoe('kef_bahcivan_muck', 'Bataklık Çamuru', 'ground_aoe', 3.2, 16, 13, 1.05, 0.8, 'poison', 'Attack', 0.5,
      { statuses: [{ status: 'slow', duration: 3, magnitude: 0.3 }], initialCooldown: 6 }),
  ] });

add({ id: 'kef_sigar', name: 'Engizisyoncu Sigar', model: CHAR('Mage'), scale: 1.25, tint: 0x8a1a2a, role: 'caster', rank: 'elite',
  hp: 4.4, dmg: 1.6, speed: 5.0, radius: 0.7, aggro: 12, forces: 12, anims: A_KAYKIT, resist: R_CULT, ccImmune: true, ai: { kite: [10, 14] },
  visual: { hide: mageHide('2H_Staff', 'Mage_Hat'), glow: 0xc8382f, runRef: 7 },
  basic: proj('kef_sigar_bolt', 'Hüküm Oku', 16, 18, 2.4, 0.75, 1.1, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    heal('kef_sigar_communion', 'Karanlık Komünyon', 4.0, 24, 0.1, 'Spellcasting', 0.3,
      { kick: 2, interruptible: true, initialCooldown: 8, vfx: 'shadow_burst' }),
    aoe('kef_sigar_disperse', 'Günah Dağıtımı', 'ground_aoe', 3.5, 16, 14, 1.25, 1.6, 'shadow', 'Spellcast_Raise', 0.5,
      { statuses: [{ status: 'poison', duration: 8, magnitude: 0.15 }], initialCooldown: 5 }),
    aoe('kef_sigar_display', 'Güç Gösterisi', 'self_aoe', 6, 6, 28, 1.2, 1.6, 'shadow', 'Spellcast_Raise', 0.6,
      { castTime: 1.2, statuses: [{ status: 'exposed', duration: 6 }], initialCooldown: 14 }),
  ] });

add({ id: 'kef_tormented', name: 'Işkence Gören Ruh', model: MON('Ghost'), scale: 0.6, tint: 0xc8c0e0, role: 'support', rank: 'trash',
  hp: 0.3, dmg: 0, speed: 3.0, radius: 0.4, aggro: 0, forces: 0, flying: true, hover: 1.5, ccImmune: true, xp: 0, anims: A_KAYKIT,
  visual: { opacity: 0.5 }, ai: { neutral: true, stationary: true },
  basic: NOOP('kef_tormented_none'), abilities: [] });

// Halkor's shard. Forces 4 (a pack member of the three shard chambers). Dies in ~9 s at HP x4, awakens Halkor when all three die.
add({ id: 'kef_shard', name: 'Halkor Kıymığı', model: GEN('golem_stone'), scale: 1.2, tint: 0x1d1826, emissive: 0xc8382f, role: 'tank', rank: 'elite',
  hp: 4, dmg: 1.0, speed: 0, radius: 0.7, aggro: 14, forces: 4, anims: A_GEN, resist: R_GOLEM, ccImmune: true, ai: { stationary: true },
  visual: { eyeEmissive: 0xc8382f },
  basic: cone('kef_shard_crack', 'Kıyım', 2.2, 120, 2.2, 1.0, 'Attack', 0.5, { windup: 0.7 }),
  abilities: [aoe('kef_shard_tremor', 'Günah Depremi', 'ground_aoe', 2.5, 8, 9, 1.0, 0.8, 'physical', 'Attack', 0.5, { initialCooldown: 5 })] });

// ---- bosses ----------------------------------------------------------------------------------------------------------------

boss({
  id: 'boss_halkor', name: 'Halkor', title: "Kefaret'in Günah Taşı Devi", model: GEN('golem_stone'), scale: 1.65, tint: 0x3a3048,
  role: 'melee', hp: 70, dmg: 2.2, speed: 4.0, radius: 2.2, enrage: 300, arenaR: 22, loot: 'loot_kef_b1',
  anims: { ...A_GEN, death: 'Death' }, resist: R_GOLEM,
  visual: { eyeEmissive: 0xc8382f, runRef: 4 },
  basic: cone('halkor_slam', 'Taş Yumruğu', 4.5, 90, 2.0, 1.0, 'Attack', 0.5, { windup: 0.9 }),
  abilities: [
    // tank buster: a telegraphed stone cone on the tank (not parryable), sunder stacks
    cone('halkor_crush', 'Günah Ezişi', 6, 80, 12, 4.0, 'Attack', 0.7, { initialCooldown: 8, windup: 1.4, telegraph: true, tankBuster: true, parryable: false, statuses: [{ status: 'sunder', duration: 10 }], sfx: 'ground_slam' }),
    // raid beat with a 2.5 s cast bar: a r 10 rockfall on the rotunda; the ring outside it is the safe spot
    aoe('halkor_rockfall', 'Taş Çöküşü', 'self_aoe', 10, 10, 16, 2.5, 0.9, 'physical', 'Taunt', 2.5, { initialCooldown: 10, castTime: 2.5, sfx: 'boss_cast' }),
    custom('halkor_quake', 'Günah Depremi', 14, 6, 1.2, 'Attack', { params: { impact: 0.8 } }),
    custom('halkor_beams', 'Kızıl Işın', 16, 9, 1.2, 'Spellcast_Raise', { params: { impact: 0.6 } }),
    custom('halkor_rage', 'Mezar Öfkesi', 999, 9999, 1.5, 'Taunt', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['halkor_crush', 'halkor_rockfall', 'halkor_quake', 'halkor_beams']),
    bp('p2', 0.5, ['halkor_crush', 'halkor_rockfall', 'halkor_quake', 'halkor_beams'], { yell: 'Taşlar ağlıyor!', ability: 'halkor_rage' }),
  ],
  intro: 'Günahlarınız taşa kazındı. Kalkın, ağırlığınızı taşıyın.', death: 'Taş... çatlıyor...',
  arena: { cx: 128, cz: 132, w: 64, h: 56, homeX: 128, homeZ: 132 } });

boss({
  id: 'boss_ekelon', name: 'Taş Komutan Ekelon', title: "Kefaret'in Gökyüzü Gözcüsü", model: CHAR('Knight'), scale: 2.0, tint: 0x7c7a90,
  role: 'melee', hp: 85, dmg: 2.4, speed: 5.0, radius: 1.2, enrage: 300, arenaR: 24, loot: 'loot_kef_b2',
  anims: { ...A_KAYKIT, death: 'Death' }, resist: R_GOLEM, visual: { runRef: 5 },
  basic: cone('ekelon_slash', 'Gökyüzü Kılıcı', 4.0, 110, 2.0, 1.0, '2H_Melee_Attack_Slice_Horizontal', 0.5, { windup: 0.9 }),
  abilities: [
    // tank buster: a telegraphed sky cleave on the tank (not parryable), sunder stacks
    cone('ekelon_sky_cleave', 'Gökyüzü Yarması', 5, 90, 12, 4.0, '2H_Melee_Attack_Slice', 0.7, { initialCooldown: 7, windup: 1.4, telegraph: true, tankBuster: true, parryable: false, statuses: [{ status: 'sunder', duration: 10 }] }),
    // raid beat with a 2.5 s cast bar: a r 12 thunder burst around the boss (the far side of the 96 m terrace is the safe spot)
    aoe('ekelon_thunder', 'Gök Gürültüsü', 'self_aoe', 12, 12, 16, 2.5, 0.9, 'lightning', '2H_Melee_Attack_Slice', 2.5, { initialCooldown: 12, castTime: 2.5, sfx: 'boss_cast' }),
    custom('ekelon_leap', 'Taş Parçalayan Sıçrayış', 14, 8, 1.2, 'Jump', { params: { impact: 1.0, radius: 6 } }),
    custom('ekelon_cross', 'Haç Kılıcı', 12, 6, 1.0, '2H_Melee_Attack_Slice', { params: { impact: 0.9 } }),
    custom('ekelon_charge', 'Ölüm Hücumu', 14, 12, 1.1, 'Run', { params: { length: 22, width: 4, speed: 16, impact: 1.0 } }),
  ],
  phases: [
    bp('p1', 1.01, ['ekelon_sky_cleave', 'ekelon_thunder', 'ekelon_leap', 'ekelon_cross']),
    bp('p2', 0.5, ['ekelon_sky_cleave', 'ekelon_thunder', 'ekelon_leap', 'ekelon_cross', 'ekelon_charge'], { yell: 'Gözcü yükseliyor!' }),
  ],
  intro: 'Terasta yalnızca yükseklik vardır. Düşmeyi bekle.', death: 'Gökyüzü... kapanıyor...',
  arena: { cx: 48, cz: 24, w: 96, h: 48, homeX: 48, homeZ: 18 } });

boss({
  id: 'boss_alyez', name: 'Yüce Hâkim Alyez', title: 'Ruhların Hâkimi', model: GENB('golge_rahibesi'), scale: 1.25, tint: 0xb0384a,
  role: 'caster', hp: 95, dmg: 2.2, speed: 4.6, radius: 1.0, enrage: 330, arenaR: 28, loot: 'loot_kef_b3',
  anims: { ...A_KAYKIT, death: 'Death_B' }, resist: R_CULT,
  visual: { glow: 0xc9a24a, eyeEmissive: 0xc9a24a, runRef: 6 },
  basic: proj('alyez_bolt', 'Hüküm Oku', 16, 40, 2.4, 0.7, 1.0, 'holy', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    // tank buster: a telegraphed holy line through the tank (not parryable), sunder stacks
    line('alyez_verdict', 'Yargı Kılıcı', 14, 2.5, 12, 1.6, 3.5, 'holy', 'Spellcast_Raise', 1.2, { initialCooldown: 8, tankBuster: true, parryable: false, statuses: [{ status: 'sunder', duration: 10 }], sfx: 'boss_cast' }),
    // raid beat with a 2.5 s cast bar: a r 12 bell toll over the whole chapel; the far corners are the safe spots
    aoe('alyez_bell', 'Kutsal Çan', 'self_aoe', 12, 12, 16, 2.5, 0.9, 'holy', 'Spellcast_Summon', 2.5, { initialCooldown: 10, castTime: 2.5, sfx: 'boss_cast' }),
    custom('alyez_judgment', 'Hüküm Işığı', 12, 6, 1.2, 'Spellcast_Raise', { castTime: 2.0, interruptible: true, kick: 2, params: { impact: 0.9 } }),
    custom('alyez_seal', 'Mühür', 16, 10, 1.2, 'Spellcast_Summon', { params: { impact: 0.7, radius: 6 } }),
    custom('alyez_bind', 'Zincir Kilidi', 14, 12, 1.0, 'Spellcast_Raise', { params: { impact: 0.4 } }),
  ],
  phases: [
    bp('p1', 1.01, ['alyez_verdict', 'alyez_bell', 'alyez_judgment', 'alyez_seal']),
    bp('p2', 0.5, ['alyez_verdict', 'alyez_bell', 'alyez_judgment', 'alyez_seal', 'alyez_bind'], { yell: 'Kefaret kabul edildi!' }),
  ],
  intro: 'Kilisenin ortasında hüküm verilecek. Kimse kaçamaz.', death: 'Hüküm... ben... kabul...',
  arena: { cx: 160, cz: 28, w: 80, h: 56, homeX: 170, homeZ: 28 } });

boss({
  id: 'boss_velkaan', name: 'Baş Kamarar Velkaan', title: 'Kefaret Salonlarının Kibirli Efendisi', model: GENB('kemik_lordu'), scale: 1.1,
  tint: 0x9a2a3a, role: 'caster', hp: 110, dmg: 2.6, speed: 4.4, radius: 1.1, enrage: 360, arenaR: 30, loot: 'loot_kef_b4',
  anims: { ...A_KAYKIT, death: 'Death_B' }, resist: R_CULT,
  visual: { eyeEmissive: 0xc8382f, runRef: 5 },
  basic: proj('velkaan_bolt', 'Kibir Oku', 18, 40, 2.4, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    // tank buster: a telegraphed shadow staff line through the tank (not parryable), sunder stacks
    line('velkaan_scepter', 'Asa Yarması', 12, 2.5, 12, 1.5, 3.5, 'shadow', 'Spellcast_Shoot', 1.2, { initialCooldown: 8, tankBuster: true, parryable: false, statuses: [{ status: 'sunder', duration: 10 }], sfx: 'shadow_cast' }),
    // raid beat with a 2.5 s cast bar: a r 13 majesty wave on the whole hall; the outer edge is the safe spot
    aoe('velkaan_wrath', 'Haşmet Dalgası', 'self_aoe', 13, 13, 16, 2.5, 0.9, 'shadow', 'Spellcast_Long', 2.5, { initialCooldown: 12, castTime: 2.5, sfx: 'boss_cast' }),
    custom('velkaan_harvest', 'Hasat Halkası', 14, 7, 1.2, 'Spellcast_Raise', { params: { impact: 0.9, radius: 5 } }),
    custom('velkaan_statues', 'Dört Heykel', 16, 10, 1.2, 'Spellcast_Long', { params: { impact: 0.7 } }),
    custom('velkaan_pride', 'Kibir Yükselişi', 999, 9999, 1.5, 'Taunt', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['velkaan_scepter', 'velkaan_wrath', 'velkaan_harvest', 'velkaan_statues']),
    bp('p2', 0.5, ['velkaan_scepter', 'velkaan_wrath', 'velkaan_harvest', 'velkaan_statues'], { yell: 'Kibrim son bulmaz!', ability: 'velkaan_pride' }),
  ],
  intro: 'Hasat başladı. Kibrinizin bedelini ödeyeceksiniz.', death: 'Kibir... kırıldı...',
  arena: { cx: 224, cz: 120, w: 64, h: 64, homeX: 224, homeZ: 120 } });

// Poise bars (elites and the Halkor / Ekelon / Alyez / Velkaan bosses keep the rank default). def() does not carry poise,
// so it is set on the registered defs. The shard and the souls keep the default.
const POISE: Record<string, number> = { kef_kiyici: 60, kef_yagmaci: 140, kef_parcalayici: 40, kef_bahcivan: 30, kef_sigar: 120 };
for (const [id, v] of Object.entries(POISE)) {
  const d = ENEMIES[id];
  if (d) d.poise = v;
  else console.warn(`[kefaret_salonlari] poise: unknown enemy ${id}`);
}

/** Ids this module registers (the dungeon file and the boss script read them). */
export const KEF_ENEMY_IDS = [
  'kef_darkblade', 'kef_tazici', 'kef_gargon', 'kef_obliterator', 'kef_toplayici', 'kef_rahip', 'kef_kiyici', 'kef_yagmaci',
  'kef_parcalayici', 'kef_kemirgen', 'kef_bahcivan', 'kef_sigar', 'kef_tormented', 'kef_shard',
] as const;
export const KEF_BOSS_IDS = ['boss_halkor', 'boss_ekelon', 'boss_alyez', 'boss_velkaan'] as const;

