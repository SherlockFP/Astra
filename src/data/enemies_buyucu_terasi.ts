/**
 * Büyücüler Terası (buyucu_terasi) enemy defs: 12 trash and elite types, the derived unstable voidling, the Gemellus clone and
 * the three mechanic / boss bodies (energy orb, boss models). Design source: docs/dungeons/buyucu_terasi.md sections 4 and 5.
 * Registration: the dungeon file imports './enemies_buyucu_terasi' (side effect: fills ENEMIES and BOSSES). Ids use the mt_ prefix.
 *
 * Windup rule (GDD_CREATURES 1.2, design section 4): melee-like windup = clamp(0.45 + 0.25 x coef, 0.45, 1.2); projectile 0.60;
 * ground circle / line / self circle 0.90; casts at least 1.00. `wu()` and the floors below apply it to every ability.
 *
 * Deviations from the design doc, all because the engine lacks the piece today (listed in the report): no move-set strings on
 * trash (a multi-strike attack is one cone with the summed coefficient); no polymorph, consuming void, arcane unstable, runic
 * mark, neural link, devouring entropy, umbral splinter or crystal power statuses (not in StatusId); no crystal shield; no line
 * of sight on Consuming Shadows (radius 12 instead of the 38 m room-wide cast); no rune wall; no librarian watcher (no GazePatrol
 * primitive); Canlı Kodeks uses the bat model (no PROC:codex builder); the Mechanoid burst and Kararsız patlama use plain circles.
 * OWNER: enemies module.
 */
import {
  add, boss, bp, cone, proj, aoe, line, charge, heal, buff, passive, custom, onDeath, summonAb, MECH, BOSSES, ENEMIES,
  A_KAYKIT, A_ENEMY, A_GEN, A_FLY, A_CHAR, R_GOLEM, R_DEMON, KNIGHT_HIDE, mageHide, burn,
} from './enemyKit';
import { CHAR, MON, GEN, GENB } from './enemyModels';
import type { EnemyDef } from '../types/enemies';

/** Windup of a melee-like swing from its damage coefficient (design section 4 rule, floors included). */
const wu = (coef: number): number => Math.min(1.2, Math.max(0.45, 0.45 + 0.25 * coef));
/** Ground circle, line or self circle windup: at least 0.9 s. */
const wuArea = (coef: number): number => Math.max(0.9, wu(coef));

/** Sets a poise override on a registered def (boss() and add() do not take it). */
const poise = (id: string, n: number): void => {
  const d: EnemyDef | undefined = ENEMIES[id] ?? BOSSES[id];
  if (d) d.poise = n;
};

// ---- trash ------------------------------------------------------------------------------------------------------------------

add({ id: 'mt_magister', name: 'Arkan Büyücü', model: CHAR('Mage'), scale: 1.0, tint: 0x8a1c30, role: 'caster', rank: 'trash',
  hp: 1.0, dmg: 1.0, speed: 5.0, radius: 0.55, aggro: 12, forces: 4, anims: A_KAYKIT, resist: { arcane: 0.25, holy: 0.1 },
  ai: { kite: [9, 15] }, visual: { hide: mageHide('1H_Wand', 'Mage_Hat'), glow: 0x5fd3e8, runRef: 7 },
  basic: proj('mt_magister_bolt', 'Arkan Okçuk', 16, 18, 3.0, 0.6, 1.0, 'arcane', 'arcane_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'spell_cast' }),
  abilities: [
    proj('mt_magister_poly', 'Koyun Büyüsü', 16, 18, 16, 1.8, 1.0, 'arcane', 'arcane_projectile', 'Spellcast_Long', 0.8,
      { castTime: 1.8, interruptible: true, kick: 2, initialCooldown: 4 }),
    aoe('mt_magister_ring', 'Arkan Halka', 'ground_aoe', 3, 14, 11, wuArea(1.4), 1.4, 'arcane', 'Spellcast_Shoot', 0.9, { vfx: 'arcane_burst' }),
  ] });

add({ id: 'mt_sunblade', name: 'Güneşkılıç Muhafızı', model: CHAR('Knight'), scale: 1.0, tint: 0xd8a040, role: 'melee', rank: 'trash',
  hp: 1.4, dmg: 1.2, speed: 6.2, radius: 0.6, aggro: 10, forces: 4, anims: A_KAYKIT, resist: { arcane: 0.25, physical: 0.05 },
  visual: { hide: KNIGHT_HIDE.filter((n) => n !== '1H_Sword' && n !== 'Round_Shield' && n !== 'Knight_Helmet'), eyeEmissive: 0xffd77a, runRef: 7 },
  basic: cone('mt_sunblade_slash', 'Güneş Kılıcı', 2.2, 100, 2.0, 1.8, '1H_Melee_Attack_Slice_Horizontal', 0.5, { windup: wu(1.8) }),
  abilities: [
    buff('mt_sunblade_blade', 'Arkan Bıçak', 1.0, 14, [{ status: 'empower', duration: 8 }], 'Spellcast_Raise', 0.8, { initialCooldown: 6 }),
    charge('mt_sunblade_charge', 'Atılış', 10, 11, wu(1.3), 1.3, '1H_Melee_Attack_Stab', 0.6, { statuses: [{ status: 'slow', duration: 2, magnitude: 0.5 }] }),
  ] });

add({ id: 'mt_sifaci', name: 'Işık Şifacısı', model: CHAR('Mage'), scale: 1.0, tint: 0xf2e6b0, role: 'healer', rank: 'trash',
  hp: 1.1, dmg: 0.8, speed: 4.9, radius: 0.55, aggro: 12, forces: 4, anims: A_KAYKIT, resist: { holy: 0.5, shadow: -0.25 },
  ai: { kite: [10, 16] }, visual: { hide: mageHide('2H_Staff'), glow: 0xffd77a, runRef: 7 },
  basic: proj('mt_sifaci_bolt', 'Kutsal Ok', 16, 18, 2.6, 0.6, 0.9, 'holy', 'holy_burst', 'Spellcast_Shoot', 0.3),
  abilities: [
    proj('mt_sifaci_fire', 'Kutsal Ateş', 14, 18, 9, 1.6, 1.2, 'holy', 'holy_burst', 'Spellcast_Long', 0.8,
      { castTime: 1.6, interruptible: true, kick: 1, initialCooldown: 3, statuses: [burn(0.3, 8)] }),
    heal('mt_sifaci_heal', 'Işıkla Şifa', 1.8, 12, 0.4, 'Spellcasting', 0.3, { kick: 1, initialCooldown: 4 }),
  ] });

add({ id: 'mt_pyromancer', name: 'Alevli Piromant', model: CHAR('Mage'), scale: 1.15, tint: 0xff6a20, emissive: 0xff6a20, role: 'caster', rank: 'elite',
  hp: 3.2, dmg: 1.3, speed: 4.6, radius: 0.65, aggro: 12, forces: 7, anims: A_KAYKIT, resist: { fire: 0.75, frost: -0.25 }, ccImmune: true,
  ai: { kite: [10, 16] }, visual: { hide: mageHide('1H_Wand', 'Spellbook_open'), glow: 0xff6a20, runRef: 7 },
  basic: proj('mt_pyro_bolt', 'Ateş Oku', 18, 18, 2.4, 0.6, 1.0, 'fire', 'fire_burst', 'Spellcast_Shoot', 0.3),
  abilities: [
    proj('mt_pyro_pyroblast', 'Piroblast', 14, 20, 9, 3.0, 3.2, 'fire', 'fire_burst', 'Spellcast_Long', 1.0,
      { castTime: 3.0, interruptible: true, kick: 2, initialCooldown: 4 }),
    aoe('mt_pyro_flamestrike', 'Alev Sütunu', 'ground_aoe', 4, 18, 14, 1.2, 2.2, 'fire', 'Spellcast_Raise', 1.0, { vfx: 'fire_ground', initialCooldown: 8 }),
    buff('mt_pyro_ignition', 'Tutuşma', 1.0, 20, [{ status: 'empower', duration: 6 }], 'Spellcast_Raise', 0.6, { initialCooldown: 10 }),
  ] });
poise('mt_pyromancer', 100);

add({ id: 'mt_codex', name: 'Canlı Kodeks', model: GEN('bat_cave'), scale: 1.0, tint: 0xa0283a, role: 'swarm', rank: 'trash',
  hp: 0.5, dmg: 0.6, speed: 3.4, radius: 0.4, aggro: 10, forces: 2, flying: true, hover: 1.4, anims: A_GEN, resist: { arcane: 0.5, fire: -0.25 },
  visual: { glow: 0x5fd3e8 },
  basic: proj('mt_codex_volley', 'Arkan Yağmuru', 14, 14, 2.6, 0.6, 0.5, 'arcane', 'arcane_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    charge('mt_codex_dive', 'Sayfa Çırpışı', 7, 9, 0.45, 0.7, 'Run', 0.3, { initialCooldown: 4 }),
    passive('cult_acolyte_fanatic', 'Yankılanma', { radius: 8, perStack: 0.08, maxStacks: 5, duration: 10 }),
  ] });

add({ id: 'mt_spellbreaker', name: 'Rünlü Büyükıran', model: CHAR('Knight'), scale: 1.1, tint: 0x5a7aa8, role: 'tank', rank: 'elite',
  hp: 3.4, dmg: 1.5, speed: 5.4, radius: 0.8, aggro: 10, forces: 8, anims: A_KAYKIT, resist: { arcane: 0.5, physical: 0.15 }, ccImmune: true,
  visual: { hide: KNIGHT_HIDE.filter((n) => n !== '1H_Sword' && n !== 'Rectangle_Shield' && n !== 'Knight_Helmet'), eyeEmissive: 0x5fd3e8, runRef: 7 },
  basic: cone('mt_spl_slash', 'Rün Kılıcı', 3.0, 120, 2.2, 2.2, '1H_Melee_Attack_Slice_Horizontal', 0.6, { windup: wu(2.2), knockback: 2 }),
  abilities: [
    cone('mt_spl_slam', 'Kalkan Vuruşu', 5.5, 70, 11, 2.6, '1H_Melee_Attack_Chop', 0.8,
      { windup: wu(2.6), telegraph: true, knockback: 4, parryable: false, initialCooldown: 5 }),
    proj('mt_spl_glaive', 'Rünlü Mızrak', 14, 20, 13, 1.6, 1.8, 'arcane', 'arcane_projectile', 'Spellcast_Shoot', 0.8,
      { castTime: 1.6, initialCooldown: 6 }),
  ] });
poise('mt_spellbreaker', 140);

add({ id: 'mt_mechanoid', name: 'Kristalçekirdek Mekanoidi', model: GEN('golem_stone'), scale: 0.75, tint: 0x5fd3e8, emissive: 0x2090b0, role: 'melee', rank: 'trash',
  hp: 2.2, dmg: 1.2, speed: 4.4, radius: 0.7, aggro: 10, forces: 5, anims: A_GEN, resist: R_GOLEM,
  basic: cone('mt_mec_punch', 'Kristal Yumruk', 2.4, 90, 2.2, 2.0, 'Attack', 0.5, { windup: wu(2.0), knockback: 2 }),
  abilities: [
    aoe('mt_mec_slam', 'Yer Darbesi', 'self_aoe', 3, 0, 12, wuArea(1.6), 1.6, 'physical', 'Attack2', 0.6, { vfx: 'ground_slam', initialCooldown: 6 }),
    onDeath(aoe('mt_mec_burst', 'Kristal Patlaması', 'self_aoe', 4, 0, 0, wuArea(1.2), 1.2, 'arcane', 'Idle', 0.9, { vfx: 'arcane_burst' })),
  ] });
poise('mt_mechanoid', 40);

add({ id: 'mt_sentry', name: 'Gizem Nöbetçisi', model: GEN('golem_stone'), scale: 1.05, tint: 0x8a80ff, emissive: 0x4a40c0, role: 'tank', rank: 'elite',
  hp: 4.4, dmg: 1.5, speed: 4.2, radius: 1.1, aggro: 11, forces: 10, anims: A_GEN, resist: R_GOLEM, ccImmune: true,
  basic: cone('mt_sen_punch', 'Taş Yumruk', 3.2, 100, 2.8, 3.2, 'Attack', 0.6, { windup: wu(3.2), knockback: 3 }),
  abilities: [
    proj('mt_sen_shackles', 'Eterik Prangalar', 12, 22, 16, 1.6, 0.3, 'arcane', 'chain_lightning', 'Spellcast_Raise', 0.6,
      { castTime: 1.6, initialCooldown: 6, statuses: [{ status: 'root', duration: 6 }] }),
    line('mt_sen_beam', 'Arkan Işın', 14, 1.6, 15, wuArea(0.9), 0.9, 'arcane', 'Spellcast_Shoot', 0.6, { castTime: 1.0, initialCooldown: 8 }),
    aoe('mt_sen_disperse', 'Kalabalık Dağıtma', 'self_aoe', 6, 0, 20, wuArea(2.0), 2.0, 'physical', 'Attack2', 1.0,
      { knockback: 8, initialCooldown: 10 }),
  ] });
poise('mt_sentry', 180);

add({ id: 'mt_voidcaller', name: 'Boşluk Yarığı Çağırıcısı', model: GEN('wraith'), scale: 1.0, tint: 0x3a1060, emissive: 0x7a30ff, role: 'healer', rank: 'elite',
  hp: 2.8, dmg: 1.2, speed: 4.6, radius: 0.6, aggro: 12, forces: 6, anims: A_GEN, resist: { shadow: 0.5, arcane: -0.15, holy: -0.25 }, ccImmune: true,
  ai: { kite: [10, 16] }, visual: { opacity: 0.9, glow: 0x8a3cff },
  basic: proj('mt_voc_bolt', 'Boşluk Oku', 16, 18, 2.6, 0.6, 0.9, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    aoe('mt_voc_shadows', 'Tüketen Gölgeler', 'self_aoe', 12, 0, 14, 2.6, 2.4, 'shadow', 'Spellcast_Long', 1.0,
      { castTime: 2.6, interruptible: true, kick: 2, vfx: 'shadow_ground', initialCooldown: 7 }),
    heal('mt_voc_mend', 'Boşluk Şifası', 1.8, 11, 0.3, 'Spellcasting', 0.5, { kick: 1 }),
    summonAb('mt_voc_rift', 'Yarık Çağrısı', 'mt_voidling', 2, 22, 'Spellcast_Summon', 0.6, { initialCooldown: 12 }),
  ] });
poise('mt_voidcaller', 100);

add({ id: 'mt_infuser', name: 'Boşluk Aşılayıcı', model: CHAR('Mage'), scale: 1.0, tint: 0x4a2a7a, role: 'caster', rank: 'trash',
  hp: 1.2, dmg: 1.0, speed: 4.9, radius: 0.55, aggro: 12, forces: 5, anims: A_KAYKIT, resist: { shadow: 0.5, arcane: -0.15, holy: -0.25 },
  ai: { kite: [9, 15] }, visual: { hide: mageHide('2H_Staff'), glow: 0x8a3cff, runRef: 7 },
  basic: proj('mt_inf_bolt', 'Boşluk Oku', 16, 18, 2.4, 0.6, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    aoe('mt_inf_terror', 'Dehşet Dalgası', 'self_aoe', 9, 0, 15, 2.0, 0.8, 'shadow', 'Spellcast_Raise', 0.9,
      { castTime: 2.0, interruptible: true, kick: 2, initialCooldown: 6, statuses: [{ status: 'fear', duration: 3 }] }),
    proj('mt_inf_consume', 'Tüketen Boşluk', 14, 20, 12, 1.4, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Long', 0.8,
      { castTime: 1.4, interruptible: true, kick: 1, initialCooldown: 3 }),
  ] });

add({ id: 'mt_tyrant', name: 'Yutucu Tiran', model: MON('Demon'), scale: 1.55, tint: 0x1a0a30, emissive: 0x7a30ff, role: 'tank', rank: 'elite',
  hp: 5.2, dmg: 1.8, speed: 5.0, radius: 0.95, aggro: 10, forces: 12, anims: A_ENEMY, resist: R_DEMON, ccImmune: true,
  visual: { emissiveIntensity: 0.4 },
  basic: cone('mt_tyr_claw', 'Yutucu Pençe', 3.6, 100, 2.8, 2.2, 'Attack', 0.5, { windup: wu(2.2), knockback: 2 }),
  abilities: [
    cone('mt_tyr_strike', 'Yutucu Darbe', 4.4, 70, 12, 3.0, 'Attack2', 0.8,
      { windup: 1.2, telegraph: true, tankBuster: true, parryable: false, initialCooldown: 8 }),
    aoe('mt_tyr_rubble', 'Düşen Enkaz', 'ground_aoe', 3.2, 18, 13, wuArea(1.8), 1.8, 'physical', 'Attack', 0.8,
      { vfx: 'ground_slam', statuses: [{ status: 'slow', duration: 8, magnitude: 0.4 }], initialCooldown: 7 }),
    aoe('mt_tyr_dread', 'Dehşet Çağrısı', 'self_aoe', 12, 0, 15, 1.8, 0.3, 'shadow', 'Spellcast_Shout', 0.9,
      { castTime: 1.8, initialCooldown: 11, statuses: [{ status: 'fear', duration: 4 }] }),
  ] });
poise('mt_tyrant', 240);

add({ id: 'mt_voidling', name: 'Boşluk Yavrusu', model: MON('Imp'), scale: 0.55, tint: 0x3a1060, emissive: 0x6020ff, role: 'swarm', rank: 'trash',
  hp: 0.35, dmg: 0.5, speed: 7.2, radius: 0.35, aggro: 9, forces: 1, flying: true, hover: 1.0, anims: A_FLY, resist: { shadow: 0.25 },
  basic: cone('mt_vlg_bite', 'Isırık', 1.4, 100, 1.3, 0.5, 'Attack', 0.3, { windup: wu(0.5) }),
  abilities: [
    charge('mt_vlg_leap', 'Atlayış', 8, 8, wu(0.6), 0.6, 'Attack', 0.3, { initialCooldown: 3 }),
  ] });

add({ id: 'mt_voidling_unstable', name: 'Kararsız Boşluk Yavrusu', model: MON('Imp'), scale: 0.63, tint: 0x6020ff, emissive: 0x6020ff, role: 'swarm', rank: 'trash',
  hp: 0.35, dmg: 0.5, speed: 7.2, radius: 0.35, aggro: 9, forces: 1, flying: true, hover: 1.0, anims: A_FLY, resist: { shadow: 0.25 },
  basic: cone('mt_vlg_u_bite', 'Isırık', 1.4, 100, 1.3, 0.5, 'Attack', 0.3, { windup: wu(0.5) }),
  abilities: [
    charge('mt_vlg_u_leap', 'Atlayış', 8, 8, wu(0.6), 0.6, 'Attack', 0.3, { initialCooldown: 3 }),
    onDeath(aoe('mt_vlg_burst', 'Kararsız Patlama', 'self_aoe', 3, 0, 0, 0.9, 1.0, 'shadow', 'Idle', 0.5,
      { vfx: 'shadow_burst', statuses: [{ status: 'slow', duration: 2, magnitude: 0.4 }] })),
  ] });

// ---- mechanic bodies and the Gemellus clone ---------------------------------------------------------------------------------

/** Enerji Küresi: invulnerable seeker orb of Arkanotron, resolved by touch or arrival only (boss script moves it). */
MECH('proc_energy_orb', 'Enerji Küresi', 'energy_orb', 0.2, { forces: 0, ai: { summoned: true } });

add({ id: 'gemellus_clone', name: 'Gemellus Yankısı', model: GEN('wraith'), scale: 1.9, tint: 0x4a2a7a, emissive: 0x7a30ff, role: 'melee', rank: 'trash',
  hp: 1.0, dmg: 0.6, speed: 1.8, radius: 1.0, aggro: 18, forces: 0, flying: true, hover: 1.2, anims: A_GEN, resist: { shadow: 0.5, holy: -0.25 },
  ccImmune: true, ai: { summoned: true }, visual: { opacity: 0.75 },
  basic: cone('gemellus_clone_sting', 'Yankı Dokunuşu', 2.6, 100, 2.4, 1.0, 'Attack', 0.5, { windup: wu(1.0) }),
  abilities: [] });

// ---- bosses (live models are the existing fallbacks, see design section 2.6; MT-F swaps one path each) ---------------------

boss({
  id: 'boss_arkanotron', name: 'Bekçi Arkanotron', title: 'Kuralların Muhafız Otomatı', model: GENB('lav_golemi'), scale: 0.85, tint: 0x6a7ad0,
  emissive: 0x40d0ff, role: 'melee', hp: 65, dmg: 2.4, speed: 4.5, radius: 1.6, enrage: 240, arenaR: 30, loot: 'loot_mt_b1',
  anims: A_GEN, resist: { physical: 0.3, arcane: 0.5, lightning: -0.25 }, visual: { emissiveIntensity: 0.4, eyeEmissive: 0x80e8ff },
  basic: cone('arkanotron_fist', 'Kural Dizisi', 4.5, 100, 2.4, 1.0, 'Attack', 0.5, { windup: wu(1.0) }),
  abilities: [
    custom('arkanotron_slam', 'İtici Darbe', 18, 7, 1.2, 'Attack', { params: { hold: 0.45, coef: 4.5, knockback: 14 } }),
    custom('arkanotron_spin', 'Dönen Çevirim', 26, 16, 0.95, 'Attack2', { params: { coef: 1.2, ring: 6.5 } }),
    custom('arkanotron_judgment', 'Hüküm Yakalaması', 34, 21, 1.2, 'Attack', { params: { range: 8, root: 1.1, coef: 2.4 } }),
    custom('arkanotron_lunge', 'Sıçrayıp Ez', 24, 8, 1.05, 'Jump', { params: { airtime: 0.55, radius: 3.4, coef: 2.4 } }),
    custom('arkanotron_expulsion', 'Arkan Püskürtme', 26, 14, 2.0, 'Attack2', { params: { radius: 12, coef: 2.2, knockback: 9 } }),
    custom('arkanotron_shackles', 'Eterik Prangalar', 30, 10, 1.5, 'Cast', { castTime: 1.5, interruptible: true, kick: 2, params: { count: 3, root: 15 } }),
    custom('arkanotron_refuel', 'Yenileme Protokolü', 999, 9999, 1.0, 'Enrage', { params: { volleys: 3 } }),
  ],
  phases: [
    bp('p1', 1.01, ['arkanotron_slam', 'arkanotron_spin', 'arkanotron_judgment', 'arkanotron_expulsion', 'arkanotron_shackles']),
    bp('p2', 0.5, ['arkanotron_slam', 'arkanotron_spin', 'arkanotron_judgment', 'arkanotron_lunge', 'arkanotron_expulsion', 'arkanotron_shackles'],
      { yell: 'AŞIRI YÜK PROTOKOLÜ.' }),
  ],
  intro: 'KURALLAR BELİRLİ. İHLAL EDEN İMHA EDİLİR.', death: 'Kural... ihlal... edildi...',
  arena: { cx: 120, cz: 40, w: 80, h: 64, homeX: 120, homeZ: 26 },
});
poise('boss_arkanotron', 600);
// energy hooks are BossScript method names (BossController.hook), see ai/bosses/buyucu_terasi.ts
BOSSES.boss_arkanotron.energy = { max: 100, start: 100, regen: -2.7, onEmpty: 'refuelFromEmpty' };

boss({
  id: 'boss_seranel', name: 'Seranel Güneşkamçı', title: "Alacakaranlık Feneri'nin Bekçisi", model: CHAR('Knight'), scale: 1.85, tint: 0x5a7aa8,
  role: 'melee', hp: 70, dmg: 2.4, speed: 6.0, radius: 1.0, enrage: 270, arenaR: 26, loot: 'loot_mt_b2',
  anims: { ...A_KAYKIT, death: 'Death_B' }, resist: { arcane: 0.5, physical: 0.15 },
  visual: { hide: KNIGHT_HIDE.filter((n) => n !== 'Knight_Helmet' && n !== 'Rectangle_Shield'), eyeEmissive: 0x5fd3e8, runRef: 7 },
  basic: cone('seranel_slash', 'Rün Dizisi', 3.8, 110, 2.2, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.6, { windup: wu(1.0) }),
  abilities: [
    custom('seranel_flurry', 'Rün Fırtınası', 16, 9, 0.7, '1H_Melee_Attack_Slice_Horizontal', { params: { hold: 0.35, coef: 2.2, lunge: 3 } }),
    custom('seranel_dash', 'Atılış', 22, 13, 0.9, 'Running_A', { params: { length: 12, width: 2.2, speed: 18, coef: 1.8 } }),
    custom('seranel_leap', 'Sıçrayan Mızrak', 24, 6, 1.1, 'Jump_Full_Long', { params: { airtime: 0.55, radius: 3.0, coef: 2.6 } }),
    custom('seranel_glaive', 'Rünlü Mızrak', 24, 8, 1.4, 'Throw', { castTime: 1.4, params: { coef: 4.0, bounce: 12 } }),
    custom('seranel_wave', 'Sessizlik Dalgası', 999, 9999, 3.0, 'Spellcast_Raise', { castTime: 3.0, params: { coef: 3.0 } }),
    custom('seranel_hastening', 'Hızlandıran Koruma', 32, 16, 1.0, 'Spellcast_Raise', { castTime: 1.0, params: { seconds: 15 } }),
  ],
  phases: [
    bp('p1', 1.01, ['seranel_flurry', 'seranel_dash', 'seranel_glaive', 'seranel_hastening']),
    bp('p2', 0.5, ['seranel_flurry', 'seranel_dash', 'seranel_leap', 'seranel_glaive', 'seranel_hastening'], { yell: 'Büyülerin burada işe yaramaz!' }),
  ],
  intro: "Fener'e yaklaşan her büyü susar.", death: 'Fener... sönmesin...',
  arena: { cx: 204, cz: 100, w: 72, h: 56, homeX: 204, homeZ: 112 },
});
poise('boss_seranel', 500);
BOSSES.boss_seranel.energy = { max: 100, start: 0, regen: 2.6, onFull: 'waveFromFull' };

boss({
  id: 'boss_gemellus', name: 'Gemellus', title: 'Boşluğun Üçüzü', model: GEN('wraith'), scale: 1.9, tint: 0x2a0f3a, emissive: 0x7a30ff,
  role: 'melee', hp: 80, dmg: 2.5, speed: 5.2, radius: 1.4, enrage: 300, arenaR: 26, loot: 'loot_mt_b3',
  anims: A_GEN, resist: { shadow: 0.5, arcane: -0.15, holy: -0.25 }, flying: true, hover: 1.2,
  visual: { opacity: 0.9, eyeEmissive: 0xc080ff, hoverBob: 0.2 },
  basic: cone('gemellus_touch', 'Çifte Dokunuş', 4.0, 100, 2.2, 1.0, 'Attack', 0.5, { windup: wu(1.0) }),
  abilities: [
    custom('gemellus_triplicate', 'Üçleme', 999, 9999, 1.2, 'Cast', { castTime: 1.2 }),
    custom('gemellus_lash', 'Üçlü Kamçı', 20, 8, 0.7, 'Attack', { params: { coef: 1.0, echo: 1.2 } }),
    custom('gemellus_dive', 'Boşluğa Dalış', 26, 12, 1.15, 'Attack2', { params: { airtime: 0.6, radius: 3.2, coef: 2.8 } }),
    custom('gemellus_link', 'Sinirsel Bağ', 28, 9, 1.2, 'Cast', { castTime: 1.2, params: { dur: 12, coef: 3.5 } }),
    custom('gemellus_grasp', 'Astral Kavrama', 34, 15, 1.5, 'Cast', { castTime: 1.5, params: { dur: 8, coef: 0.5 } }),
    custom('gemellus_sting', 'Kozmik Iğne', 16, 6, 1.4, 'Attack2', { castTime: 1.4, params: { coef: 3.2 } }),
  ],
  phases: [
    bp('p1', 1.01, ['gemellus_lash', 'gemellus_dive', 'gemellus_link', 'gemellus_grasp', 'gemellus_sting'], { ability: 'gemellus_triplicate' }),
    bp('p2', 0.5, ['gemellus_lash', 'gemellus_dive', 'gemellus_link', 'gemellus_grasp', 'gemellus_sting'],
      { yell: 'Daha çok... daha çok biz!', ability: 'gemellus_triplicate' }),
  ],
  intro: 'Biz çoğuz. Siz azsınız.', death: 'Bir... olduk...',
  arena: { cx: 204, cz: 180, w: 72, h: 56, homeX: 204, homeZ: 168 },
});
poise('boss_gemellus', 600);

boss({
  id: 'boss_degentrius', name: 'Degentrius', title: 'Göksel Yörüngenin Efendisi', model: MON('Demon_Lord'), scale: 1.45, tint: 0x2a0f3a, emissive: 0x7a30ff,
  role: 'melee', hp: 105, dmg: 2.7, speed: 0, radius: 1.8, enrage: 420, arenaR: 21, loot: 'loot_mt_b4',
  anims: A_CHAR, resist: { shadow: 0.5, physical: 0.1, holy: -0.25 }, visual: { emissiveIntensity: 0.5, eyeEmissive: 0xc080ff },
  basic: cone('degentrius_blast', 'Parça Süpürmesi', 5.0, 100, 3.2, 1.6, 'Attack', 0.5, { windup: wu(1.6), knockback: 3 }),
  abilities: [
    custom('degentrius_fragment', 'Dev Parça', 26, 6, 1.2, 'Attack', { params: { hold: 0.4, radius: 8, coef: 1.0, knockback: 9, tankCoef: 4.2 } }),
    custom('degentrius_reach', 'Boşluk Eli', 38, 18, 1.2, 'Wave', { params: { range: 12, root: 1.5, coef: 2.6 } }),
    custom('degentrius_waves', 'Üç Dalga', 30, 14, 0.9, 'Wave', { params: { coef: 1.6 } }),
    custom('degentrius_entropy', 'Yutan Entropi', 42, 12, 1.6, 'Wave', { castTime: 1.6, params: { coef: 1.4 } }),
    custom('degentrius_torrent', 'Boşluk Seli', 46, 22, 2.5, 'Wave', { castTime: 2.5, params: { coef: 2.0, sweep: 14 } }),
    custom('degentrius_essence', 'Kararsız Boşluk Özü', 52, 36, 2.0, 'Wave', { params: { coef: 1.8, raid: 2.5 } }),
    custom('degentrius_nullbomb', 'Boşluk Bombası', 48, 30, 1.2, 'Wave', { params: { coef: 3.5, fuse: 5 } }),
  ],
  phases: [
    bp('p1', 1.01, ['degentrius_fragment', 'degentrius_reach', 'degentrius_waves', 'degentrius_entropy', 'degentrius_torrent', 'degentrius_essence', 'degentrius_nullbomb']),
    bp('p2', 0.6, ['degentrius_fragment', 'degentrius_reach', 'degentrius_waves', 'degentrius_entropy', 'degentrius_torrent', 'degentrius_essence', 'degentrius_nullbomb'],
      { yell: 'Mercekler hizalanıyor!' }),
    bp('p3', 0.3, ['degentrius_fragment', 'degentrius_reach', 'degentrius_waves', 'degentrius_entropy', 'degentrius_torrent', 'degentrius_essence', 'degentrius_nullbomb'],
      { yell: 'Gökler yırtılsın!' }),
  ],
  intro: 'Yörünge tamamlanıyor. Siz eksik parçasınız.', death: 'Yörünge... kırıldı...',
  arena: { cx: 140, cz: 252, w: 72, h: 56, homeX: 140, homeZ: 252 },
});
poise('boss_degentrius', 700);
