/**
 * Yiğitler Sarayı (yigitler_sarayi) enemy defs: 13 trash types (incl. the Stag and the Purifier), the encounter adds (drake,
 * acolyte, pup, Skovald, Tideskorn add, Obliterator) and the four bosses (Heymdal, Hirya, Fenrür, Odyn).
 * Design source: docs/dungeons/yigitler_sarayi.md sections 4 and 5. Ids are prefixed yg_ (no collision with ENEMIES).
 * Registration: enemies.ts must `import './enemies_yigitler_sarayi'` (side effect: fills ENEMIES and BOSSES).
 *
 * Deviations from the design doc, all because the engine piece is not in place (see the report of the dungeon author):
 *  - multi-strike strings (followUps, SP-12) are one cone with the summed coefficient, as enemies_peri_sisleri.ts does;
 *  - no Sentinel aura passive (needs a new ally-aura handler, SP-6); no `fuse`, `stunOnBlock`, `minTargets` params;
 *  - no holy_scorch DoT (status not in StatusId) and no bear_snare (the Trapper's trap roots with the existing `root`);
 *  - the Storm Drake's breath strip (persist) is not drawn: the breath is a single line hit.
 * Poise bars: the doc's posture numbers (SP-11 units) are written onto the defs at the bottom of this file, the same way
 * enemies_peri_sisleri.ts sets `poise`. Check the unit scale against the poise system before tuning.
 * OWNER: enemies module (season dungeon Yiğitler Sarayı).
 */
import {
  add, boss, bp, cone, proj, aoe, line, charge, heal, buff, passive, custom, bleed, burn, ENEMIES, BOSSES,
  A_KAYKIT, A_WOLF, A_FLY, A_CHAR, A_GEN, R_BEAST, R_CULT, R_DEMON, KNIGHT_HIDE, ROGUE_HIDE, mageHide,
} from './enemyKit';
import type { EnemyDef } from '../types/enemies';
import { CHAR, MON, GEN, ITCH } from './enemyModels';

/** Valarjar (Yiğit) resist profile. */
export const R_VALARJAR: EnemyDef['resist'] = { physical: 0.1, lightning: 0.25, holy: 0.25, shadow: -0.15 };
/** Storm profile for the flyers. */
export const R_STORM: EnemyDef['resist'] = { lightning: 0.75, frost: -0.15 };

// ---- trash -----------------------------------------------------------------------------------------------------------------

add({ id: 'yg_shieldmaiden', name: 'Yiğit Kalkan Kızı', model: CHAR('Knight'), scale: 1.1, role: 'melee', rank: 'trash',
  hp: 1.6, dmg: 1.3, speed: 5.8, radius: 0.6, aggro: 11, forces: 4, anims: A_KAYKIT, resist: R_VALARJAR,
  visual: { hide: KNIGHT_HIDE.filter((n) => n !== '1H_Sword' && n !== 'Round_Shield'), runRef: 6 },
  basic: cone('yg_sm_bash', 'Kalkan Darbesi', 2.2, 100, 1.8, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.3,
    { windup: 0.7, statuses: [{ status: 'sunder', duration: 8, stacks: 1 }] }),
  abilities: [
    cone('yg_sm_hew', 'Ölümcül Biçme', 5, 180, 11, 2.2, '1H_Melee_Attack_Chop', 0.4,
      { initialCooldown: 4, windup: 1.0, telegraph: true, parryable: false, statuses: [{ status: 'necrotic', duration: 8, stacks: 4 }] }),
    charge('yg_sm_rush', 'Kalkan Atılışı', 8, 16, 0.75, 1.2, 'Lunge', 0.55,
      { initialCooldown: 7, statuses: [{ status: 'slow', duration: 3, magnitude: 0.3 }], params: { target: 3, dash: 0.4, minRange: 4 } }),
  ] });

add({ id: 'yg_thundercaller', name: 'Yiğit Gök Çağıran', model: MON('Giant'), scale: 0.85, role: 'caster', rank: 'elite',
  hp: 2.6, dmg: 1.5, speed: 4.2, radius: 1.0, aggro: 14, forces: 6, anims: A_KAYKIT, resist: R_VALARJAR, ai: { kite: [10, 16] },
  visual: { eyeEmissive: 0x9ad8ff, runRef: 4 },
  basic: proj('yg_tc_bolt', 'Şimşek Okuyu', 16, 18, 2.6, 0.70, 1.0, 'lightning', 'lightning_projectile', 'Attack', 0.47),
  abilities: [
    proj('yg_tc_thunderbolt', 'Gök Gürültüsü Okuyu', 18, 20, 9, 2.2, 3.2, 'lightning', 'lightning_projectile', 'Attack', 0.47,
      { initialCooldown: 3, castTime: 2.2, interruptible: true, kick: 2, sfx: 'lightning_cast' }),
    aoe('yg_tc_strike', 'Yıldırım Darbesi', 'ground_aoe', 4, 18, 16, 0.83, 1.5, 'lightning', 'Jump', 0.25,
      { initialCooldown: 8, statuses: [{ status: 'stun', duration: 2.0 }], vfx: 'lightning_strike', params: { target: 3 } }),
  ] });

add({ id: 'yg_sentinel', name: 'Fırtına Dövümlü Nöbetçi', model: CHAR('Knight'), scale: 1.3, role: 'tank', rank: 'elite',
  hp: 3.6, dmg: 1.6, speed: 5.2, radius: 0.8, aggro: 12, forces: 8, anims: A_KAYKIT, resist: R_VALARJAR,
  visual: { hide: KNIGHT_HIDE.filter((n) => n !== '1H_Sword' && n !== 'Round_Shield'), eyeEmissive: 0x80c0ff, runRef: 7 },
  basic: cone('yg_sn_slash', 'Çelik Kılıç', 3.0, 100, 2.2, 1.8, '1H_Melee_Attack_Slice_Diagonal', 0.38, { windup: 0.70 }),
  abilities: [
    aoe('yg_sn_pulse', 'Yüklü Nabız', 'self_aoe', 8, 8, 14, 0.90, 1.8, 'lightning', 'Block_Attack', 0.35,
      { initialCooldown: 6, knockback: 6, vfx: 'shockwave', sfx: 'lightning_impact' }),
    line('yg_sn_crackle', 'Çıtırtı', 14, 2, 9, 0.80, 1.4, 'lightning', '1H_Melee_Attack_Stab', 0.55,
      { initialCooldown: 3, params: { target: 1 } }),
    buff('yg_sn_light', 'Koruyucu Işık', 1.0, 99, [{ status: 'shield', duration: 8 }], 'Spellcast_Raise', 1.0,
      { interruptible: true, kick: 2, vfx: 'shield_bubble', params: { hpBelow: 0.3, once: 1, self: 1, single: 1, shieldPct: 0.25, radius: 1, needAlly: 0 } }),
  ] });

add({ id: 'yg_storm_drake', name: 'Fırtına Ejderi', model: MON('Dragon_Evolved'), scale: 0.6, role: 'ranged', rank: 'trash',
  hp: 1.6, dmg: 1.2, speed: 6.5, radius: 0.9, aggro: 14, forces: 4, flying: true, hover: 3.2, anims: A_FLY, resist: R_STORM,
  basic: proj('yg_dr_spit', 'Şimşek Tükürüğü', 18, 18, 2.4, 0.70, 1.0, 'lightning', 'lightning_projectile', 'Punch', 0.33),
  abilities: [
    stormBreath('yg_dr_breath', 12),
    aoe('yg_dr_buffet', 'Kanat Savrulması', 'self_aoe', 4, 4, 10, 0.75, 1.2, 'physical', 'Spin', 0.5,
      { initialCooldown: 6, knockback: 4 }),
  ] });

add({ id: 'yg_worg', name: 'Karapençe Kurt', model: ITCH('wolf'), scale: 0.8, role: 'melee', rank: 'trash',
  hp: 1.0, dmg: 1.2, speed: 8.2, radius: 0.6, aggro: 12, forces: 3, anims: A_WOLF, resist: R_BEAST,
  basic: cone('yg_wg_bite', 'Isırık', 2.0, 90, 1.5, 0.8, 'Bite', 0.47, { windup: 0.65, statuses: [bleed(1, 0.2, 6)] }),
  abilities: [worgLeap('yg_wg_leap'), passive('cult_acolyte_fanatic', 'Sürü Avı', { radius: 10, perStack: 0.05, maxStacks: 5 })] });

add({ id: 'yg_grizzly', name: 'Çeliçene Ayı', model: ITCH('bear'), scale: 1.15, role: 'tank', rank: 'elite',
  hp: 4.2, dmg: 1.8, speed: 5.6, radius: 1.1, aggro: 12, forces: 8, anims: A_WOLF, resist: R_BEAST, ai: { kite: [6, 12] },
  visual: { runRef: 5.6 },
  basic: cone('yg_bz_swipe', 'Pençe', 3.2, 110, 2.2, 1.9, 'Swipe', 0.42, { windup: 0.70 }),
  abilities: [
    aoe('yg_bz_slam', 'Yer Darbesi', 'self_aoe', 5, 5, 10, 1.00, 2.2, 'physical', 'Slam', 0.77, { initialCooldown: 5, vfx: 'ground_slam' }),
    charge('yg_bz_maul', 'Ayı Hamlesi', 10, 14, 0.90, 1.8, 'Lunge', 0.7,
      { initialCooldown: 8, statuses: [{ status: 'stun', duration: 1.0 }], params: { target: 3, dash: 0.6, minRange: 4 } }),
    passive('forge_demon_rage', 'Öfkeli Gümbürtü', { hpBelow: 0.3, atkSpeed: 0.4 }),
  ] });

add({ id: 'yg_mystic', name: 'Yiğit Mistik', model: CHAR('Mage'), scale: 1.05, role: 'healer', rank: 'trash',
  hp: 1.3, dmg: 0.9, speed: 5.0, radius: 0.55, aggro: 13, forces: 4, anims: A_KAYKIT, resist: R_VALARJAR, ai: { kite: [10, 16] },
  visual: { hide: mageHide('1H_Wand'), glow: 0xffe8a0, runRef: 7 },
  basic: proj('yg_my_bolt', 'Kutsal Ok', 16, 18, 2.4, 0.70, 1.0, 'holy', 'holy_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    heal('yg_my_heal', 'Kutsal Şifa', 2.2, 9, 0.35, 'Spellcast_Raise', 1.0, { kick: 2 }),
    proj('yg_my_scorch', 'Kutsal Yanık', 18, 20, 14, 0.55, 0.4, 'holy', 'holy_projectile', 'Spellcast_Shoot', 0.3,
      { initialCooldown: 5, params: { target: 1 } }),
    buff('yg_my_ward', 'Kutsal Mühür', 1.5, 15, [{ status: 'shield', duration: 8 }], 'Spellcast_Raise', 1.0,
      { vfx: 'shield_bubble', kick: 1, params: { shieldPct: 0.15, single: 1, radius: 14 } }),
  ] });

add({ id: 'yg_trapper', name: 'Yiğit Tuzakçı', model: CHAR('Rogue_Hooded'), scale: 1.0, role: 'ranged', rank: 'trash',
  hp: 1.0, dmg: 1.2, speed: 5.8, radius: 0.5, aggro: 14, forces: 3, anims: A_KAYKIT, resist: R_BEAST, ai: { kite: [8, 14] },
  visual: { hide: ROGUE_HIDE.filter((n) => n !== '2H_Crossbow') },
  basic: proj('yg_tp_bolt', 'Arbalet Oku', 22, 20, 2.4, 0.70, 1.0, 'physical', 'arrow_projectile', '2H_Ranged_Shoot', 0.15, { sfx: 'crossbow_shot' }),
  abilities: [
    aoe('yg_tp_trap', 'Ayı Tuzağı', 'ground_aoe', 1.8, 18, 14, 0.60, 0.6, 'physical', 'Throw', 0.6,
      { initialCooldown: 4, statuses: [{ status: 'root', duration: 3 }], vfx: 'trap_snap', dispel: 'root', params: { target: 1 } }),
    line('yg_tp_pierce', 'Delici Ok', 22, 1.2, 12, 0.85, 1.6, 'physical', '2H_Ranged_Shoot', 0.15,
      { initialCooldown: 6, telegraph: true, sfx: 'crossbow_shot', params: { target: 1, pierce: 1 } }),
  ] });

add({ id: 'yg_runecarver', name: 'Rün Oymacısı', model: CHAR('Mage'), scale: 1.0, role: 'caster', rank: 'trash',
  hp: 1.2, dmg: 1.0, speed: 4.9, radius: 0.55, aggro: 12, forces: 5, anims: A_KAYKIT, resist: R_VALARJAR, ai: { kite: [9, 14] },
  visual: { hide: mageHide('2H_Staff'), glow: 0x70c0ff, runRef: 7 },
  basic: proj('yg_rc_bolt', 'Rün Oku', 16, 18, 2.4, 0.70, 1.0, 'lightning', 'lightning_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    proj('yg_rc_chain', 'Zincir Şimşek', 18, 20, 12, 2.0, 1.6, 'lightning', 'chain_lightning', 'Spellcast_Long', 1.55,
      { initialCooldown: 4, castTime: 2.0, interruptible: true, kick: 2 }),
    buff('yg_rc_rune', 'Rün Kalkanı', 1.2, 18, [{ status: 'shield', duration: 6 }], 'Spellcast_Raise', 1.0,
      { params: { shieldPct: 0.12, radius: 12 } }),
    aoe('yg_rc_mine', 'Rün Mayını', 'ground_aoe', 2.2, 16, 15, 0.75, 1.2, 'lightning', 'Throw', 0.5,
      { initialCooldown: 7, vfx: 'rune_pad_glow', params: { target: 1 } }),
  ] });

add({ id: 'yg_tideskorn', name: 'Gelgitkıran Akıncı', model: CHAR('Orc'), scale: 1.0, role: 'melee', rank: 'elite',
  hp: 3.2, dmg: 1.7, speed: 5.8, radius: 0.8, aggro: 12, forces: 7, anims: A_CHAR, resist: R_DEMON,
  basic: cone('yg_ts_axe', 'Gelgit Baltası', 3.0, 100, 2.2, 2.2, 'Weapon', 0.45, { windup: 0.70 }),
  abilities: tideskornAbilities(),
});

add({ id: 'yg_revel', name: 'Ziyafet Delisi', model: CHAR('Barbarian'), scale: 0.9, role: 'swarm', rank: 'trash',
  hp: 0.5, dmg: 0.7, speed: 6.2, radius: 0.5, aggro: 9, forces: 1, anims: A_KAYKIT, resist: R_BEAST,
  basic: cone('yg_rv_axe', 'Kupa Darbesi', 1.6, 100, 1.5, 0.6, '1H_Melee_Attack_Chop', 0.4, { windup: 0.60 }),
  abilities: [
    proj('yg_rv_mug', 'Kadeh Fırlatma', 12, 12, 8, 0.58, 0.5, 'physical', 'arrow_projectile', 'Throw', 0.4, { initialCooldown: 3, params: { target: 3 } }),
    charge('yg_rv_stagger', 'Sarhoş Atılış', 6, 10, 0.65, 0.8, 'Lunge', 0.5, { initialCooldown: 4, params: { target: 3, dash: 0.4, minRange: 2 } }),
    passive('cult_acolyte_fanatic', 'Sarhoş Coşku', { radius: 8, perStack: 0.08, maxStacks: 5, duration: 8 }),
  ] });

add({ id: 'yg_stag', name: 'Altın Tüylü Geyik', model: ITCH('deer'), scale: 1.3, role: 'melee', rank: 'trash',
  hp: 2.0, dmg: 1.4, speed: 8.0, radius: 0.9, aggro: 12, forces: 3, anims: A_WOLF, resist: R_BEAST,
  basic: cone('yg_st_horn', 'Boynuz Darbesi', 2.8, 90, 2.0, 1.0, 'Attack', 0.45, { windup: 0.70 }),
  abilities: [
    charge('yg_st_charge', 'Altın Hücum', 16, 13, 0.95, 2.0, 'Run', 0.9,
      { initialCooldown: 5, knockback: 5, params: { target: 3, dash: 0.8, minRange: 6 } }),
    aoe('yg_st_stomp', 'Toynak Darbesi', 'self_aoe', 4, 4, 9, 0.78, 1.3, 'physical', 'Slam', 0.6, { initialCooldown: 4 }),
  ] });

add({ id: 'yg_purifier', name: 'Yiğit Arındırıcı', model: CHAR('Rogue'), scale: 1.0, tint: 0xf0e8c8, role: 'support', rank: 'trash',
  hp: 1.3, dmg: 0.9, speed: 5.0, radius: 0.55, aggro: 13, forces: 4, anims: A_KAYKIT, resist: R_VALARJAR, ai: { kite: [10, 16] },
  visual: { hide: ROGUE_HIDE, glow: 0xfff0c0, runRef: 7 },
  basic: proj('yg_pu_bolt', 'Arınma Oku', 16, 18, 2.4, 0.70, 1.0, 'holy', 'holy_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    aoe('yg_pu_circle', 'Kutsal Çember', 'ground_aoe', 3.2, 18, 14, 0.75, 1.2, 'holy', 'Spellcast_Raise', 0.5,
      { initialCooldown: 5, vfx: 'holy_burst', params: { target: 0, persist: 8, persistCoef: 0.4, tick: 2 } }),
    heal('yg_pu_fire', 'Arınma Ateşi', 2.0, 12, 0.18, 'Spellcast_Raise', 1.0, { kick: 1, params: { cleanse: 1 } }),
  ] });

// ---- encounter adds and summoned units (forces 0) ---------------------------------------------------------------------

add({ id: 'yg_hym_drake', name: 'Gök Kapısı Ejderi', model: MON('Dragon_Evolved'), scale: 0.75, tint: 0x88b0ff, emissive: 0x3050ff,
  role: 'ranged', rank: 'trash', hp: 1.2, dmg: 1.2, speed: 8.0, radius: 0.9, aggro: 30, forces: 0, xp: 0, flying: true, hover: 4.5,
  anims: A_FLY, resist: R_STORM, ai: { summoned: true }, visual: { runRef: 8 },
  basic: proj('yg_hd_spit', 'Şimşek Tükürüğü', 18, 22, 2.4, 0.70, 0.8, 'lightning', 'lightning_projectile', 'Punch', 0.33),
  abilities: [stormBreath('yg_hd_breath', 16)] });

add({ id: 'yg_valkyr_acolyte', name: 'Valkyr Yardımcısı', model: CHAR('Mage'), scale: 1.0, tint: 0xf8f0c8, role: 'healer', rank: 'trash',
  hp: 2.5, dmg: 1.0, speed: 4.8, radius: 0.55, aggro: 30, forces: 0, xp: 0, anims: A_KAYKIT, resist: R_VALARJAR, ai: { summoned: true, kite: [8, 14] },
  visual: { hide: mageHide('1H_Wand'), glow: 0xfff0b0, runRef: 7 },
  basic: proj('yg_va_bolt', 'Kutsal Mızrak', 16, 18, 2.4, 0.70, 1.0, 'holy', 'holy_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [heal('yg_val_mend', 'Kutsal Onarım', 2.0, 9, 0.06, 'Spellcast_Raise', 1.0, { range: 30, kick: 2 })] });

add({ id: 'yg_worg_summoned', name: 'Karapençe Yavrusu', model: ITCH('wolf'), scale: 0.6, role: 'melee', rank: 'trash',
  hp: 1.0, dmg: 1.2, speed: 8.2, radius: 0.5, aggro: 14, forces: 0, xp: 0, anims: A_WOLF, resist: R_BEAST, ai: { summoned: true },
  basic: cone('yg_wg_bite', 'Isırık', 2.0, 90, 1.5, 0.8, 'Bite', 0.47, { windup: 0.65, statuses: [bleed(1, 0.2, 6)] }),
  abilities: [worgLeap('yg_wg_leap_s')] });

add({ id: 'yg_skovald', name: 'Tanrı-Kral Skovald', model: CHAR('Orc'), scale: 1.55, tint: 0x7a3a28, emissive: 0x40ff60, role: 'melee', rank: 'miniboss',
  hp: 48, dmg: 2.6, speed: 5.6, radius: 1.4, aggro: 18, forces: 0, xp: 0, ccImmune: true, anims: A_CHAR, resist: R_DEMON,
  visual: { eyeEmissive: 0x40ff60, runRef: 5.6 }, ai: { summoned: true },
  basic: cone('yg_skv_slash', 'Gelgit Baltası', 4.5, 100, 2.2, 1.0, 'Weapon', 0.45, { windup: 0.7 }),
  abilities: [
    cone('yg_skv_savage', 'Vahşi Kılıç', 5.5, 80, 9, 4.2, 'Weapon', 0.45,
      { initialCooldown: 5, windup: 1.1, telegraph: true, tankBuster: true, parryable: false, statuses: [bleed(1, 0.3, 20)] }),
    charge('yg_skv_felblaze', 'Alev Hamlesi', 24, 10, 1.0, 3.2, 'Run', 0.5,
      { initialCooldown: 10, damage: { coef: 3.2, type: 'fire' }, statuses: [burn(0.3, 8)], params: { target: 3, dash: 0.8, minRange: 6 } }),
    aoe('yg_skv_tide', 'Gelgit Yıkımı', 'ground_aoe', 6, 14, 14, 1.2, 3.6, 'physical', 'Jump', 0.6,
      { initialCooldown: 6, params: { target: 3 } }),
  ] });

add({ id: 'yg_tideskorn_add', name: 'Gelgitkıran Akıncı', model: CHAR('Orc'), scale: 1.0, role: 'melee', rank: 'elite',
  hp: 3.2, dmg: 1.7, speed: 5.8, radius: 0.8, aggro: 12, forces: 0, xp: 0, anims: A_CHAR, resist: R_DEMON, ai: { summoned: true },
  basic: cone('yg_ts_axe', 'Gelgit Baltası', 3.0, 100, 2.2, 2.2, 'Weapon', 0.45, { windup: 0.70 }),
  abilities: tideskornAbilities() });

add({ id: 'yg_obliterator', name: 'Yok Edici Golem', model: GEN('golem_stone'), scale: 1.0, tint: 0x8aa8ff, emissive: 0x4080ff, role: 'caster', rank: 'elite',
  hp: 7, dmg: 1.0, speed: 3.4, radius: 1.0, aggro: 30, forces: 0, xp: 0, ccImmune: true, anims: A_GEN, resist: R_CULT, ai: { summoned: true },
  basic: cone('yg_ob_smash', 'Yıldırım Yumruğu', 3.6, 110, 2.4, 1.0, 'Attack2', 0.57, { windup: 0.7 }),
  abilities: [
    aoe('yg_surge', 'Dalgalanma', 'self_aoe', 30, 0, 6, 3.0, 1.4, 'lightning', 'Attack2', 0.9,
      { castTime: 3.0, interruptible: true, kick: 2, vfx: 'shockwave' }),
  ] });

// ---- helpers for shared ability shapes (fresh objects per def) -------------------------------------------------------------

/** Storm breath: a single lightning line (the persistent Statik strip of the doc is not drawn yet). */
function stormBreath(id: string, range: number) {
  return line(id, 'Şimşek Nefesi', range, 4, 12, 1.05, 2.4, 'lightning', 'Punch', 0.37,
    { initialCooldown: 5, telegraph: true, vfx: 'lightning_strike' });
}

function worgLeap(id: string) {
  return charge(id, 'Atılış', 12, 9, 0.85, 1.6, 'Lunge', 0.87,
    { initialCooldown: 3, statuses: [bleed(1, 0.2, 6)], params: { target: 3, dash: 0.5, minRange: 5 } });
}

function tideskornAbilities() {
  return [
    charge('yg_ts_rush', 'Alev Hamlesi', 14, 14, 1.05, 2.4, 'Weapon', 0.45,
      { initialCooldown: 5, damage: { coef: 2.4, type: 'fire' }, statuses: [burn(0.3, 4)], vfx: 'fire_burst', params: { target: 3, dash: 0.7, minRange: 5 } }),
    cone('yg_ts_scream', 'Yakıcı Çığlık', 8, 90, 12, 2.0, 'Punch', 0.5,
      { initialCooldown: 8, windup: 0.95, telegraph: true, parryable: false, damage: { coef: 2.0, type: 'fire' }, statuses: [burn(0.3, 4)] }),
  ];
}

// ---- bosses ----------------------------------------------------------------------------------------------------------------

boss({
  id: 'boss_heymdal', name: 'Heymdal', title: "Gök Kapısı'nın Bekçisi", model: CHAR('Knight'), scale: 2.05, tint: 0xd8c890, role: 'melee',
  hp: 52, dmg: 2.3, speed: 5.2, radius: 1.3, enrage: 210, arenaR: 30, loot: 'loot_yg_b1',
  anims: { ...A_KAYKIT, idle: '2H_Melee_Idle', death: 'Death_B' }, resist: { lightning: 0.75, physical: 0.1, shadow: -0.1 },
  visual: { hide: KNIGHT_HIDE.filter((n) => !['2H_Sword', 'Knight_Cape'].includes(n)), runRef: 7, eyeEmissive: 0x80c0ff, glow: 0x80b0ff },
  basic: cone('hym_slash', 'Yiğit Kılıcı', 4.5, 100, 2.4, 1.0, '2H_Melee_Attack_Slice', 0.4, { windup: 0.7, telegraph: true }),
  abilities: [
    cone('hym_sweep', 'Kanlı Süpürme', 8, 110, 12, 3.6, '2H_Melee_Attack_Chop', 0.72,
      { initialCooldown: 7, windup: 1.2, telegraph: true, tankBuster: true, parryable: false, sfx: 'boss_cast',
        statuses: [bleed(1, 0.3, 4), { status: 'necrotic', duration: 8, stacks: 8 }] }),
    custom('hym_combo', 'Gök Kapısı Üçlemesi', 16, 4, 0.75, '2H_Melee_Attack_Slice', { sfx: 'swing_heavy' }),
    custom('hym_leap', 'Kapı Çarpması', 24, 18, 0.9, 'Jump', { sfx: 'boss_cast' }),
    custom('hym_blade', 'Dans Eden Bıçak', 14, 5, 1.0, 'Throw', { sfx: 'dagger_throw' }),
    custom('hym_horn', 'Gökgürültüsü Borusu', 34, 12, 2.5, 'Cheer', { sfx: 'hero_horn' }),
    custom('hym_storm_call', 'Fırtına Çağrısı', 999, 9999, 1.0, 'Taunt', { sfx: 'boss_roar' }),
    custom('hym_wrath', 'Fırtına Gazabı', 999, 9999, 1.0, 'Taunt', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['hym_sweep', 'hym_combo', 'hym_blade', 'hym_horn']),
    bp('p2', 0.7, ['hym_sweep', 'hym_combo', 'hym_leap', 'hym_blade', 'hym_horn'], { yell: 'Gökler öfkelensin!', ability: 'hym_storm_call' }),
    bp('p3', 0.4, ['hym_sweep', 'hym_combo', 'hym_leap', 'hym_blade', 'hym_horn'], { yell: 'Fırtına sizi parçalasın!', ability: 'hym_wrath' }),
  ],
  intro: 'Bu kapıdan yalnızca layık olanlar geçer!', death: 'Kapı... sizin için açıldı...',
  arena: { cx: 40, cz: 116, w: 64, h: 56, homeX: 40, homeZ: 106 },
});

boss({
  id: 'boss_hirya', name: 'Hirya', title: "Eyra'nın Seçilmişi", model: CHAR('Mage'), scale: 1.75, tint: 0xf4e8b8, role: 'caster',
  hp: 66, dmg: 2.3, speed: 5.4, radius: 1.1, enrage: 240, arenaR: 28, loot: 'loot_yg_b2',
  anims: { ...A_KAYKIT, death: 'Death_B' }, resist: { lightning: 0.9, holy: 0.9, physical: 0.05 },
  visual: { hide: mageHide('1H_Wand'), runRef: 7, eyeEmissive: 0xfff0b0, glow: 0xfff0b0 },
  basic: proj('hir_bolt', 'Kutsal Mızrak', 22, 24, 2.2, 0.8, 1.0, 'holy', 'holy_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    line('hir_shield', 'Işık Kalkanı', 16, 3, 14, 1.3, 3.4, 'holy', 'Spellcast_Long', 1.0,
      { initialCooldown: 8, telegraph: true, tankBuster: true, parryable: false, knockback: 8, sfx: 'boss_cast' }),
    custom('hir_spear', 'Çifte Mızrak', 10, 5, 0.7, 'Spellcast_Shoot', { sfx: 'spell_cast' }),
    custom('hir_dive', 'Valkyr Dalışı', 22, 16, 1.0, 'Spellcast_Summon', { sfx: 'choir_sting' }),
    custom('hir_arcing', 'Ark Şimşeği', 20, 12, 1.0, 'Spellcast_Raise', { sfx: 'lightning_cast' }),
    custom('hir_eye', 'Fırtına Gözü', 32, 18, 3.0, 'Spellcast_Long', { castTime: 3.0, interruptible: false, sfx: 'boss_cast' }),
    custom('hir_sanctify', 'Kutsal Küreler', 24, 14, 1.2, 'Spellcast_Raise', { sfx: 'spell_cast' }),
    custom('hir_expel', 'Arınma Patlaması', 18, 10, 1.0, 'Spellcast_Raise', { sfx: 'spell_cast' }),
    custom('hir_call', 'Valkyr Çağrısı', 9999, 9999, 1.2, 'Spellcast_Summon', { sfx: 'choir_sting' }),
  ],
  phases: [
    bp('p1', 1.01, ['hir_shield', 'hir_spear', 'hir_dive', 'hir_arcing', 'hir_eye', 'hir_sanctify', 'hir_expel']),
    bp('p2', 0.5, ['hir_shield', 'hir_spear', 'hir_dive', 'hir_arcing', 'hir_eye', 'hir_sanctify', 'hir_expel'], { yell: 'Eyra, bana güç ver!', ability: 'hir_call' }),
  ],
  intro: 'Yükseliş koltuğuna layık mısınız?', death: 'Eyra... beni... çağırıyor...',
  arena: { cx: 112, cz: 60, w: 56, h: 56, homeX: 112, homeZ: 54 },
});

boss({
  id: 'boss_fenrur', name: 'Fenrür', title: "Sonsuz Av'ın Efendisi", model: GEN('wolf_dire'), scale: 2.3, tint: 0x5a2e2e, role: 'melee',
  hp: 62, dmg: 2.5, speed: 6.2, radius: 1.5, enrage: 210, arenaR: 26, loot: 'loot_yg_b3',
  anims: A_GEN, resist: { physical: 0.05, frost: 0.1 }, visual: { eyeEmissive: 0xff3030, emissiveIntensity: 0.3, runRef: 6.2 },
  basic: cone('fen_bite', 'Parçalayan Isırık', 4.5, 110, 2.2, 1.0, 'Attack', 0.45, { windup: 0.7, telegraph: true, statuses: [bleed(1, 0.2, 6)] }),
  abilities: [
    custom('fen_string', 'Av Üçlüsü', 11, 5, 0.6, 'Attack', { sfx: 'boss_cast' }),
    custom('fen_frenzy', 'Pençe Çılgınlığı', 16, 9, 1.2, 'Attack', { sfx: 'boss_cast' }),
    custom('fen_howl', 'Sessiz Uluma', 24, 14, 1.4, 'Attack', { sfx: 'wolf_howl' }),
    custom('fen_leap', 'Çifte Atılış', 14, 6, 1.2, 'Attack', { sfx: 'boss_cast' }),
    custom('fen_scent', 'Kan Kokusu', 28, 20, 1.0, 'Attack', { sfx: 'boss_roar' }),
    custom('fen_retreat', 'İne Çekilme', 999, 9999, 1.0, 'Attack', { sfx: 'wolf_howl' }),
  ],
  phases: [
    bp('p1', 1.01, ['fen_string', 'fen_frenzy', 'fen_howl', 'fen_leap']),
    bp('p2', 0.6, [], { yell: 'Av başlıyor!', ability: 'fen_retreat' }),
    bp('p3', 0.599, ['fen_string', 'fen_frenzy', 'fen_howl', 'fen_leap', 'fen_scent']),
    bp('p4', 0.3, [], { yell: 'SÜRÜ! BANA GELİN!', ability: 'fen_retreat' }),
    bp('p5', 0.299, ['fen_string', 'fen_frenzy', 'fen_howl', 'fen_leap', 'fen_scent']),
  ],
  intro: 'Kokunuzu aldım... yiğitler!', death: 'Av... bitti...',
  arena: { cx: 204, cz: 192, w: 56, h: 48, homeX: 204, homeZ: 190 },
});

boss({
  id: 'boss_odyn', name: 'Odyn', title: 'Yiğitlerin Koruyucusu', model: MON('Demon_Lord'), scale: 2.1, role: 'melee',
  hp: 82, dmg: 2.7, speed: 5.4, radius: 1.8, enrage: 540, arenaR: 34, loot: 'loot_yg_b4',
  anims: A_CHAR, resist: { lightning: 0.9, holy: 0.9, physical: 0.1, shadow: -0.25 },
  visual: { eyeEmissive: 0xffe090, glow: 0xffe090, emissiveIntensity: 0.4, runRef: 5.4 },
  basic: line('odn_thrust', 'Titan Mızrağı', 9, 2.4, 2.6, 0.8, 1.0, 'physical', 'Attack', 0.5, { telegraph: true, parryable: true }),
  abilities: [
    custom('odn_trinity', 'Üçlü Hüküm', 7, 4, 0.8, 'Attack', { sfx: 'swing_heavy' }),
    custom('odn_trial', 'Gelgitkıran Sınavı', 9999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),
    custom('odn_brand', 'Rünik Damga', 46, 9, 1.5, 'Cast', { sfx: 'choir_sting' }),
    custom('odn_spears', 'Işık Mızrakları', 30, 22, 1.5, 'Cast', { sfx: 'spell_cast' }),
    custom('odn_tempest', 'Parlak Fırtına', 58, 40, 4.0, 'Enrage', { castTime: 4.0, interruptible: false, sfx: 'choir_swell' }),
    custom('odn_obliterator', 'Yok Edici Çağrısı', 70, 35, 1.2, 'Wave', { sfx: 'boss_roar' }),
    custom('odn_plunge', 'Yargı Düşüşü', 30, 28, 1.0, 'Jump', { sfx: 'boss_cast' }),
    custom('odn_rain', 'Yıldırım Yağmuru', 12, 12, 1.5, 'Cast', { sfx: 'lightning_cast' }),
    custom('odn_judgment', 'Hüküm', 999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, [], { ability: 'odn_trial' }),
    bp('p2', 0.999, ['odn_trinity', 'odn_brand', 'odn_spears', 'odn_tempest', 'odn_obliterator', 'odn_plunge']),
    bp('p3', 0.35, ['odn_trinity', 'odn_brand', 'odn_spears', 'odn_tempest', 'odn_obliterator', 'odn_plunge', 'odn_rain'],
      { yell: 'Fırtınam sizi sınasın!', ability: 'odn_judgment' }),
  ],
  intro: 'Yiğitler! Sınavınız başlıyor!', death: 'Layıksınız... yiğitler... Sofram sizindir.',
  arena: { cx: 208, cz: 32, w: 64, h: 64, homeX: 208, homeZ: 10 },
});

// ---- posture (poise) bars: doc SP-11 values, set on the registered defs like enemies_peri_sisleri.ts does ----------------

const POISE: Record<string, number> = {
  yg_thundercaller: 40, yg_sentinel: 60, yg_grizzly: 50, yg_tideskorn: 45, yg_skovald: 300,
  boss_heymdal: 320, boss_hirya: 300, boss_fenrur: 280, boss_odyn: 500,
};
for (const [id, v] of Object.entries(POISE)) {
  const d = ENEMIES[id] ?? BOSSES[id];
  if (d) d.poise = v;
  else console.warn(`[yigitler_sarayi] poise: unknown enemy ${id}`);
}

/** Ids this module registers (the dungeon file and the boss script read them). */
export const YIGITLER_SARAYI_ENEMY_IDS = [
  'yg_shieldmaiden', 'yg_thundercaller', 'yg_sentinel', 'yg_storm_drake', 'yg_worg', 'yg_grizzly', 'yg_mystic', 'yg_trapper',
  'yg_runecarver', 'yg_tideskorn', 'yg_revel', 'yg_stag', 'yg_purifier',
  'yg_hym_drake', 'yg_valkyr_acolyte', 'yg_worg_summoned', 'yg_skovald', 'yg_tideskorn_add', 'yg_obliterator',
] as const;
export const YIGITLER_SARAYI_BOSS_IDS = ['boss_heymdal', 'boss_hirya', 'boss_fenrur', 'boss_odyn'] as const;
