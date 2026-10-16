/**
 * Yıldız Divanı (`yildiz_divani`) enemy and boss defs, from docs/dungeons/yildiz_divani.md section 4 (trash, Gerenth,
 * summons) and section 5 (bosses and the Zümrüt Alev emissaries).
 *
 * Registered into ENEMIES / BOSSES by the add() / boss() calls below when this module is imported. enemies.ts must import
 * it once (see the registration lines in the orchestrator report). Boss scripts are in src/ai/bosses/yildiz_divani.ts.
 *
 * Deferred (engine primitives not in the tree yet, see the report): trash move strings and holds (P-40 MoveSpec), the
 * Sürü Gücü passive (needs a PASSIVES registration), Gölge Atılışı / Casus Adımı jumps (custom handlers), the
 * disguiseBlind and healPriority AI hints (not in EnemyAiHints), the posture `stance` of Karşı Duruş, and the
 * P-22 params (chain, targets, interruptsCast, persist, minRange) which are carried as data for when the engine reads them.
 * Where a string was reduced to one telegraphed hit, the ability name stays and the reduction is noted on that row.
 */
import type { EnemyAbility, EnemyDef } from '../types/enemies';
import {
  A_CHAR, A_ENEMY, A_FLY, A_GEN, A_KAYKIT, A_WOLF, A_BLOB,
  KNIGHT_HIDE, ROGUE_HIDE, R_BEAST, R_DEMON, R_GOLEM, ENEMIES, BOSSES,
  add, aoe, boss, bp, burn, bleed, charge, cone, custom, heal, buff, line, NOOP, onDeath, poison, proj, summonAb, mageHide, type Anims,
} from './enemyKit';
import { CHAR, GEN, ITCH, MON, PROC } from './enemyModels';

/** Gecedoğan resist profile (doc section 4.1). */
const R_GECE: EnemyDef['resist'] = { physical: 0.05, arcane: 0.3, shadow: 0.1 };

/** Windup floor/cap rule from CORE_MECHANICS / ROADMAP F10: clamp(0.45 + 0.25 x coef, 0.45, 1.2). */
const wu = (coef: number): number => Math.min(1.2, Math.max(0.45, 0.45 + 0.25 * coef));

const A_KNIGHT: Anims = A_KAYKIT;
const A_MAGE: Anims = A_KAYKIT;
const A_ROGUE: Anims = A_KAYKIT;

// ---------------------------------------------------------------------------------------------------------------------
// 4.1 trash
// ---------------------------------------------------------------------------------------------------------------------

// Nöbet Muhafızı (G): melee guard, 3 attacks.
add({
  id: 'ys_nobet_muhafizi', name: 'Nöbet Muhafızı', model: CHAR('Knight'), scale: 1, tint: 0x5a64c8, role: 'melee', rank: 'trash',
  hp: 1.3, dmg: 1.1, speed: 5.6, radius: 0.6, aggro: 16, forces: 4, anims: A_KNIGHT, resist: R_GECE,
  visual: { hide: KNIGHT_HIDE.filter((n) => !['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'].includes(n)) },
  basic: cone('ys_guard_basic', 'Kılıç Darbesi', 2.4, 90, 1.8, 1.0, '1H_Melee_Attack_Chop', 0.5, { windup: wu(1.0) }),
  abilities: [
    // string of 2 in the doc; one telegraphed hit with knockback here (see the deferred list)
    cone('ys_guard_double', 'Çifte Vuruş', 2.6, 100, 7, 1.2, '1H_Melee_Attack_Slice_Horizontal', 0.5, { windup: wu(1.2), knockback: 2, initialCooldown: 3 }),
    cone('ys_guard_resonant', 'Rezonans Darbesi', 4.2, 110, 12, 1.9, '1H_Melee_Attack_Slice_Diagonal', 0.5, {
      windup: wu(1.9), statuses: [{ status: 'stun', duration: 1.2 }], initialCooldown: 5,
    }),
  ],
});

// Nöbet Büyücüsü (A): kick-caster, the must-kick Seal Magic.
add({
  id: 'ys_nobet_buyucusu', name: 'Nöbet Büyücüsü', model: CHAR('Mage'), scale: 1, tint: 0x4650d8, emissive: 0x2040a0,
  role: 'caster', rank: 'trash', hp: 0.9, dmg: 1.1, speed: 4.9, radius: 0.6, aggro: 18, forces: 5, anims: A_MAGE, resist: R_GECE,
  visual: { hide: mageHide(), emissiveIntensity: 0.3 }, ai: { kite: [9, 15] },
  basic: proj('ys_arcanist_bolt', 'Gece Oku', 16, 18, 2.4, wu(1.0), 1.0, 'arcane', 'arcane_projectile', 'Spellcast_Shoot', 0.5, { initialCooldown: 1.5 }),
  abilities: [
    proj('ys_arcanist_orb', 'Gece Küresi', 14, 18, 9, wu(1.7), 1.7, 'arcane', 'arcane_projectile', 'Spellcast_Long', 0.5, {
      initialCooldown: 3, params: { chain: 3, chainRange: 8, chainMul: 0.7 },
    }),
    aoe('ys_arcanist_seal', 'Mühür Büyüsü', 'self_aoe', 10, 0, 22, 2.5, 1.2, 'arcane', 'Spellcast_Raise', 0.5, {
      castTime: 2.5, interruptible: true, kick: 2, initialCooldown: 6, statuses: [{ status: 'silence', duration: 4 }], params: { interruptsCast: 1 },
    }),
  ],
});

// Gece Rahibi (R): healer.
add({
  id: 'ys_gece_rahibi', name: 'Gece Rahibi', model: CHAR('Mage'), scale: 1, tint: 0xd8d0a0, emissive: 0x90ffd0, role: 'healer', rank: 'trash',
  hp: 1.0, dmg: 0.9, speed: 4.8, radius: 0.6, aggro: 18, forces: 5, anims: A_MAGE, resist: R_GECE,
  visual: { hide: mageHide('Spellbook_open'), emissiveIntensity: 0.35 }, ai: { kite: [8, 14] },
  basic: proj('ys_cleric_bolt', 'Yıldız Oku', 16, 18, 2.4, wu(0.9), 0.9, 'arcane', 'arcane_projectile', 'Spellcast_Shoot', 0.5, { initialCooldown: 1.5 }),
  abilities: [
    heal('ys_cleric_heal', 'Ay Şifası', 2.0, 10, 0.35, 'Spellcast_Long', 0.5, { kick: 2, initialCooldown: 4 }),
    buff('ys_cleric_ward', 'Koruyucu Mühür', 1.2, 16, [{ status: 'shield', duration: 8, magnitude: 0.15 }], 'Spellcast_Raise', 0.5, {
      kick: 1, initialCooldown: 6,
    }),
    aoe('ys_cleric_smite', 'Cezalandırma', 'ground_aoe', 3, 16, 14, 0.9, 1.4, 'arcane', 'Spellcast_Shoot', 0.5, { initialCooldown: 8 }),
  ],
});

// Koruyucu Yapı (C): elite tank, posture 100.
add({
  id: 'ys_koruyucu_yapi', name: 'Koruyucu Yapı', model: GEN('golem_stone'), scale: 1, tint: 0x8aa4ff, role: 'tank', rank: 'elite',
  hp: 3.4, dmg: 1.5, speed: 4.4, radius: 1.0, aggro: 16, forces: 8, anims: A_GEN, resist: R_GOLEM,
  basic: cone('ys_construct_fist', 'Taş Yumruk', 3.4, 100, 2.4, 1.0, 'Attack', 0.5, { windup: wu(1.0) }),
  abilities: [
    cone('ys_construct_sweep', 'Taş Süpürme', 5, 120, 11, 1.3, 'Attack', 0.5, { windup: wu(1.3), initialCooldown: 4 }),
    cone('ys_construct_smash', 'Şarjlı Ezme', 6, 80, 14, 3.2, 'Attack', 0.5, {
      windup: wu(3.2), knockback: 3, tankBuster: true, parryable: false, initialCooldown: 7,
    }),
    aoe('ys_construct_pulse', 'Rün Nabzı', 'self_aoe', 7, 0, 18, 0.9, 1.4, 'arcane', 'Spellcast_Shoot', 0.5, {
      knockback: 4, initialCooldown: 11,
    }),
  ],
});
ENEMIES.ys_koruyucu_yapi.poise = 100;
ENEMIES.ys_koruyucu_yapi.hyperArmor = 0.4;

// Fel Bağlı Cellat (F): elite brute, posture 80.
add({
  id: 'ys_fel_cellat', name: 'Fel Bağlı Cellat', model: MON('Demon'), scale: 1.15, tint: 0x58d060, emissive: 0x20a030, role: 'melee',
  rank: 'elite', hp: 3.2, dmg: 1.6, speed: 5.4, radius: 0.8, aggro: 16, forces: 8, anims: A_ENEMY, resist: R_DEMON,
  visual: { eyeEmissive: 0xb0ff40 },
  basic: cone('ys_enf_claw', 'Fel Pençesi', 3.0, 100, 2.2, 1.0, 'Attack', 0.5, { windup: wu(1.0), statuses: [burn(0.2, 4)] }),
  abilities: [
    aoe('ys_enf_detonation', 'Fel Patlaması', 'ground_aoe', 4.5, 18, 20, 2.5, 2.4, 'fire', 'Spellcast_Long', 0.5, {
      castTime: 2.5, initialCooldown: 8, statuses: [burn(0.3, 8)], params: { targets: 2, spread: 9 },
    }),
    charge('ys_enf_rush', 'Fel Hücumu', 9, 12, wu(1.8), 1.8, 'Running_A', 0.5, {
      statuses: [{ status: 'knockdown', duration: 0.6 }], params: { recovery: 1.2 },
    }),
    cone('ys_enf_execute', 'İnfaz Kombosu', 3.2, 100, 15, 2.2, 'Attack', 0.5, {
      windup: wu(2.2), initialCooldown: 6, statuses: [{ status: 'knockdown', duration: 0.8 }], params: { hold: 0.8 },
    }),
  ],
});
ENEMIES.ys_fel_cellat.poise = 80;

// Gölge Hanım (M): elite melee-caster, posture 50.
add({
  id: 'ys_golge_hanim', name: 'Gölge Hanım', model: CHAR('Rogue'), scale: 1, tint: 0xc040a0, emissive: 0x601050, role: 'melee', rank: 'elite',
  hp: 2.0, dmg: 1.3, speed: 6.4, radius: 0.6, aggro: 16, forces: 6, anims: A_ROGUE, resist: R_DEMON,
  visual: { hide: ROGUE_HIDE.filter((n) => !['Knife', 'Knife_Offhand'].includes(n)), emissiveIntensity: 0.25 },
  basic: cone('ys_mist_whip', 'Kırbaç', 3.2, 80, 1.8, 1.0, 'Attack', 0.5, { windup: wu(1.0), damage: { coef: 1.0, type: 'shadow' } }),
  abilities: [
    proj('ys_mist_bewitch', 'Büyüleme', 16, 18, 14, 1.8, 0.6, 'shadow', 'arcane_projectile', 'Spellcast_Shoot', 0.5, {
      castTime: 1.8, interruptible: true, kick: 1, initialCooldown: 4, statuses: [{ status: 'bewitch', duration: 8 }],
    }),
    cone('ys_mist_slash', 'Gölge Kesiği', 4, 90, 9, 1.8, 'Attack', 0.5, {
      windup: wu(1.8), damage: { coef: 1.8, type: 'shadow' }, initialCooldown: 3, statuses: [{ status: 'deep_wound', duration: 6 }],
    }),
    aoe('ys_mist_leap', 'Gölge Atılışı', 'ground_aoe', 2.5, 18, 13, 0.9, 1.4, 'shadow', 'Jump_Full_Short', 0.5, {
      initialCooldown: 7, statuses: [{ status: 'knockdown', duration: 0.5 }],
    }),
  ],
});
ENEMIES.ys_golge_hanim.poise = 50;

// Gece Düellocusu (D): elite duelist, posture 60.
add({
  id: 'ys_duellocu', name: 'Gece Düellocusu', model: CHAR('Knight'), scale: 1.05, tint: 0xc8d0f0, emissive: 0x4aa8ff, role: 'melee',
  rank: 'elite', hp: 2.4, dmg: 1.4, speed: 6.2, radius: 0.6, aggro: 16, forces: 6, anims: A_KNIGHT, resist: R_GECE,
  visual: { hide: KNIGHT_HIDE.filter((n) => !['1H_Sword', 'Knight_Cape'].includes(n)), emissiveIntensity: 0.2 },
  basic: line('ys_duel_thrust', 'Raper Atışı', 3.4, 1.0, 1.8, 0.9, 1.0, 'physical', 'Attack', 0.5, { parryable: true }),
  abilities: [
    line('ys_duel_triple', 'Üçlü Hamle', 6, 1.2, 10, wu(1.8), 1.8, 'physical', 'Attack', 0.5, {
      initialCooldown: 4, statuses: [bleed(1, 0.2, 4)], params: { hold: 0.5 },
    }),
    cone('ys_duel_parry', 'Karşı Duruş', 3.5, 100, 16, 2.0, 'Attack', 0.5, { windup: wu(2.0), initialCooldown: 8 }),
  ],
});
ENEMIES.ys_duellocu.poise = 60;

// Dehşet Gözü (E): ranged kick-caster, floating eye.
add({
  id: 'ys_dehset_gozu', name: 'Dehşet Gözü', model: PROC('eye_orb'), scale: 0.8, tint: 0xb040ff, emissive: 0xff3070, role: 'ranged',
  rank: 'trash', hp: 1.1, dmg: 1.2, speed: 4.0, radius: 0.6, aggro: 18, forces: 5, anims: A_FLY, resist: R_GECE, flying: true, hover: 2.0,
  visual: { hoverBob: 0.12, glow: 0xff3070 }, ai: { kite: [10, 16] },
  basic: proj('ys_eye_bolt', 'Işık Iğnesi', 18, 18, 2.4, wu(1.0), 1.0, 'arcane', 'arcane_projectile', 'Attack', 0.5, { initialCooldown: 1.5 }),
  abilities: [
    line('ys_eye_glare', 'Kavurucu Bakış', 18, 3, 15, 2.2, 2.4, 'fire', 'Spellcast_Long', 0.5, {
      castTime: 2.2, interruptible: true, kick: 2, initialCooldown: 6,
    }),
  ],
});

// Mana Ejderi (W): swarm flyer, pops on death.
add({
  id: 'ys_mana_ejderi', name: 'Mana Ejderi', model: MON('Dragon_Evolved'), scale: 0.42, tint: 0x58c8ff, emissive: 0x2080ff, role: 'swarm',
  rank: 'trash', hp: 0.5, dmg: 0.9, speed: 6.5, radius: 0.5, aggro: 16, forces: 2, anims: A_FLY, resist: R_GECE, flying: true, hover: 2.5,
  basic: proj('ys_wyrm_bolt', 'Mana Mermisi', 16, 16, 1.8, 0.65, 0.8, 'arcane', 'arcane_projectile', 'Attack', 0.5),
  abilities: [
    charge('ys_wyrm_dive', 'Dalış Atışı', 6, 8, wu(0.9), 0.9, 'Attack', 0.5, { initialCooldown: 3, params: { minRange: 2 } }),
    onDeath(aoe('ys_wyrm_pop', 'Mana Patlaması', 'self_aoe', 3, 0, 0, 0.1, 0.8, 'arcane', 'Attack', 0.5, { telegraph: false })),
  ],
});

// Mana Yutan (P): swarm feeder, leaves a puddle.
add({
  id: 'ys_mana_yutan', name: 'Mana Yutan', model: GEN('slime_frost'), scale: 0.8, tint: 0x40c0ff, role: 'swarm', rank: 'trash', hp: 0.35,
  dmg: 0.5, speed: 4.5, radius: 0.6, aggro: 14, forces: 1, anims: A_BLOB, resist: R_GECE,
  visual: { opacity: 0.85 },
  basic: cone('ys_feeder_bite', 'Emme', 1.4, 100, 1.6, 1.0, 'Attack', 0.5, { windup: wu(1.0) }),
  abilities: [
    charge('ys_feeder_hop', 'Zıplama Kapışı', 4, 9, wu(0.5), 0.5, 'Attack', 0.5, { initialCooldown: 4 }),
    onDeath(aoe('ys_feeder_burst', 'Mana Sızıntısı', 'self_aoe', 2.5, 0, 0, 0.1, 0.3, 'arcane', 'Attack', 0.5, {
      telegraph: false, params: { persist: 4, tick: 0.5 },
    })),
  ],
});

// Mana Kılıcı (S): melee runner.
add({
  id: 'ys_mana_kilici', name: 'Mana Kılıcı', model: ITCH('wolf'), scale: 0.85, tint: 0x70a8ff, emissive: 0x3070ff, role: 'melee',
  rank: 'trash', hp: 0.8, dmg: 1.1, speed: 8.0, radius: 0.6, aggro: 16, forces: 3, anims: A_WOLF, resist: R_BEAST,
  basic: cone('ys_saber_bite', 'Isırık', 2.0, 90, 1.4, 1.0, 'Attack', 0.5, { windup: wu(1.0) }),
  abilities: [
    cone('ys_saber_claws', 'Çifte Pençe', 2.2, 100, 6, 1.4, 'Attack', 0.5, { windup: wu(1.4), initialCooldown: 3 }),
    charge('ys_saber_leap', 'Atılma', 9, 8, wu(1.4), 1.4, 'Attack', 0.5, { initialCooldown: 5, params: { target: 2, minRange: 4 } }),
  ],
});

// Zümrüt Köpek (H): melee beast, fire.
add({
  id: 'ys_zumrut_kopek', name: 'Zümrüt Köpek', model: GEN('wolf_dire'), scale: 0.9, tint: 0x40ff60, emissive: 0x20c040, role: 'melee',
  rank: 'trash', hp: 0.9, dmg: 1.1, speed: 8.4, radius: 0.6, aggro: 16, forces: 3, anims: A_GEN, resist: R_BEAST,
  basic: cone('ys_hound_bite', 'Fel Isırığı', 2.2, 90, 1.4, 1.0, 'Attack', 0.5, { windup: wu(1.0), damage: { coef: 1.0, type: 'fire' }, statuses: [burn(0.15, 4)] }),
  abilities: [
    charge('ys_hound_lunge', 'Kovalayış', 5, 9, wu(1.1), 1.1, 'Attack', 0.5, { damage: { coef: 1.1, type: 'fire' }, initialCooldown: 3 }),
    cone('ys_hound_breath', 'Fel Soluğu', 6, 60, 10, 1.3, 'Attack', 0.5, { windup: wu(1.3), damage: { coef: 1.3, type: 'fire' }, initialCooldown: 5 }),
  ],
});

// ---------------------------------------------------------------------------------------------------------------------
// 4.2 summoned and mechanic units (0 forces)
// ---------------------------------------------------------------------------------------------------------------------

// Uyanık Nöbetçi: Gerdan's reinforcements.
add({
  id: 'ys_uyanik_nobetci', name: 'Uyanık Nöbetçi', model: CHAR('Knight'), scale: 1, role: 'melee', rank: 'trash', hp: 0.8, dmg: 0.9,
  speed: 6.0, radius: 0.6, aggro: 0, forces: 0, anims: A_KNIGHT, resist: R_GECE, ai: { summoned: true },
  visual: { hide: KNIGHT_HIDE.filter((n) => !['1H_Sword', 'Round_Shield', 'Knight_Helmet'].includes(n)) },
  basic: cone('ys_guard_strike', 'Kılıç Darbesi', 2.2, 90, 1.8, 0.7, 'Attack', 0.5, { windup: wu(0.7) }),
  abilities: [
    cone('ys_guard_hinder', 'Engel', 2.4, 90, 14, 0.9, 'Attack', 0.5, {
      windup: wu(0.9), initialCooldown: 3, statuses: [{ status: 'curse', duration: 12 }], dispel: 'curse',
    }),
  ],
});

// Yanan İblis: Taliksa's cracks.
add({
  id: 'ys_yanan_iblis', name: 'Yanan İblis', model: MON('Imp'), scale: 1, role: 'ranged', rank: 'trash', hp: 0.5, dmg: 0.9, speed: 6.5,
  radius: 0.5, aggro: 0, forces: 0, anims: A_FLY, resist: R_DEMON, flying: true, hover: 1.5, ai: { kite: [6, 12], summoned: true },
  basic: proj('ys_imp_bolt', 'Ateş Oku', 16, 16, 2.4, wu(0.9), 0.9, 'fire', 'fire_projectile', 'Attack', 0.5),
  abilities: [
    aoe('ys_imp_embers', 'Sürüklenen Közler', 'ground_aoe', 2, 14, 9, wu(0.9), 0.9, 'fire', 'Attack', 0.5, { initialCooldown: 4 }),
  ],
});

// Öfkeli Asil: the wrongly accused noble.
add({
  id: 'ys_supheli_asil', name: 'Öfkeli Asil', model: CHAR('Mage'), scale: 1, role: 'caster', rank: 'elite', hp: 2.5, dmg: 1.3,
  speed: 5.0, radius: 0.6, aggro: 0, forces: 0, anims: A_MAGE, resist: R_GECE, ai: { kite: [8, 14], summoned: true },
  visual: { hide: mageHide() },
  basic: proj('ys_noble_bolt', 'Mana Oku', 16, 18, 2.4, 0.7, 1.0, 'arcane', 'arcane_projectile', 'Spellcast_Shoot', 0.5),
  abilities: [
    aoe('ys_noble_ring', 'Alev Halkası', 'self_aoe', 5, 0, 10, wu(1.8), 1.8, 'arcane', 'Spellcast_Long', 0.5, { initialCooldown: 5 }),
    proj('ys_noble_orb', 'Asil Küresi', 14, 18, 12, wu(1.8), 1.8, 'arcane', 'arcane_projectile', 'Spellcast_Shoot', 0.5, {
      initialCooldown: 6, params: { chain: 2 },
    }),
  ],
});

// Melandros' blade image: no attacks, killable.
add({
  id: 'ys_melandros_imaj', name: 'Bıçak Hayali', model: CHAR('Rogue'), scale: 1.8, tint: 0x3a4ac8, role: 'support', rank: 'trash',
  hp: 1.2, dmg: 0, speed: 0, radius: 0.8, aggro: 0, forces: 0, anims: A_ROGUE, resist: R_GECE, ccImmune: true, ai: { summoned: true },
  visual: { hide: ROGUE_HIDE, opacity: 0.5 },
  basic: NOOP('ys_melandros_imaj_none'),
});

// Gerenth's hound summon and the Zümrüt Alev Üçlüsü emissaries (rank miniboss, posture 40 each).
const emissary = (id: string, name: string, model: string, scale: number, tint: number, role: EnemyDef['role'], hp: number, dmg: number,
  speed: number, anims: Anims, resist: EnemyDef['resist'], abilities: EnemyAbility[], basic: EnemyAbility, kite?: [number, number]): void => {
  add({
    id, name, model, scale, tint, role, rank: 'miniboss', hp, dmg, speed, radius: 0.8, aggro: 0, forces: 0, anims, resist, ccImmune: false,
    ai: { summoned: true, ...(kite ? { kite } : {}) }, basic, abilities,
  });
  ENEMIES[id].poise = 40;
};
emissary('ys_cazsar', 'Cazşar', MON('Orc'), 1.5, 0x58d060, 'melee', 18, 1.5, 5.0, A_CHAR, R_DEMON, [
  cone('ys_cazsar_hack', 'Dehşet Darbesi', 7, 120, 13, 3.0, 'Attack', 0.5, {
    windup: wu(3.0), perilous: true, statuses: [{ status: 'stun', duration: 2 }], initialCooldown: 6,
  }),
  cone('ys_cazsar_chain', 'Zincirli Pençe', 4.5, 110, 15, 2.4, 'Attack', 0.5, { windup: wu(2.4), initialCooldown: 9 }),
], cone('ys_cazsar_claw', 'Fel Pençesi', 4.5, 110, 2.4, 1.0, 'Attack', 0.5, { windup: wu(1.0) }));
emissary('ys_baalgar', 'Gözcü Baalgar', CHAR('Mage'), 1.5, 0x2aa070, 'caster', 14, 1.5, 5.0, A_MAGE, R_GECE, [
  line('ys_baalgar_beam', 'Parçalayıcı Işın', 9, 1.2, 14, 3.2, 0.7, 'shadow', 'Spellcast_Long', 0.5, {
    castTime: 3.2, interruptible: true, kick: 2, initialCooldown: 6, statuses: [{ status: 'curse', duration: 6 }],
  }),
], proj('ys_baalgar_bolt', 'Gölge Oku', 16, 18, 2.4, wu(0.9), 0.9, 'shadow', 'arcane_projectile', 'Spellcast_Shoot', 0.5), [10, 16]);
emissary('ys_imakutya', 'İmakutya', MON('Orc'), 1.5, 0x70e060, 'melee', 16, 1.5, 6.0, A_CHAR, R_GECE, [
  aoe('ys_imakutya_blades', 'Dönen Bıçaklar', 'self_aoe', 5.5, 0, 11, wu(0.9), 0.9, 'physical', 'Attack', 0.5, {
    initialCooldown: 5, statuses: [bleed(1, 0.2, 4)],
  }),
  charge('ys_imakutya_dash', 'Üçlü Süzülme', 8, 18, wu(1.0), 1.0, 'Attack', 0.5, { initialCooldown: 12, statuses: [bleed(1, 0.2, 4)] }),
], cone('ys_imakutya_slash', 'Kılıç Savurma', 3, 100, 1.8, 1.0, 'Attack', 0.5, { windup: wu(1.0) }));

// Rezil Gerenth: event mini-boss (spawned by the spy hunt, 0 forces; the event grants +10 on death).
add({
  id: 'ys_gerenth', name: 'Rezil Gerenth', model: CHAR('Rogue_Hooded'), scale: 1.25, tint: 0x9a3ad0, role: 'caster', rank: 'miniboss',
  hp: 16, dmg: 1.9, speed: 6.4, radius: 0.8, aggro: 18, forces: 0, anims: A_ROGUE, resist: R_GECE, ccImmune: false,
  basic: cone('gerenth_dagger', 'Zehirli Hançer', 2.2, 90, 1.5, 1.0, 'Attack', 0.5, { windup: wu(1.0), statuses: [poison(1, 0.15, 5)] }),
  abilities: [
    line('gerenth_lash', 'Fel Kırbacı', 14, 1.6, 8, wu(2.0), 2.0, 'fire', 'Attack', 0.5, { initialCooldown: 4 }),
    aoe('gerenth_vial', 'Zehirli İksir', 'ground_aoe', 3.5, 16, 12, wu(1.6), 1.6, 'poison', 'Attack', 0.5, {
      initialCooldown: 6, statuses: [poison(3, 0.15, 8)],
    }),
    summonAb('gerenth_hounds', 'Köpek Çağrısı', 'ys_zumrut_kopek', 2, 999, 'Attack', 0.5, { params: { hpBelow: 0.5, once: 1 } }),
  ],
});

// ---------------------------------------------------------------------------------------------------------------------
// 5 bosses (BossDef). Posture (SPX-22) is the engine poise bar: poise = posture max, set after boss().
// ---------------------------------------------------------------------------------------------------------------------
const KNIGHT_SHOW_GERDAN = KNIGHT_HIDE.filter((n) => !['2H_Sword', 'Knight_Helmet', 'Knight_Cape'].includes(n));
const ROGUE_SHOW_MELANDROS = ROGUE_HIDE.filter((n) => !['Knife', 'Knife_Offhand'].includes(n));

boss({
  id: 'boss_gerdan', name: 'Devriye Kaptanı Gerdan', title: 'Şehir Nöbetinin Kaptanı', model: CHAR('Knight'), scale: 1.75, tint: 0x5d68d8,
  role: 'melee', hp: 62, dmg: 2.4, speed: 6.0, radius: 1.2, enrage: 240, arenaR: 26, loot: 'loot_ys_b1', anims: A_KAYKIT, resist: R_GECE,
  visual: { hide: KNIGHT_SHOW_GERDAN, glow: 0x7fb0ff, eyeEmissive: 0x9fe0ff, runRef: 7 },
  basic: cone('gerdan_cleave', 'Kılıç Savuruşu', 4.0, 100, 2.1, 1.0, '2H_Melee_Attack_Slice', 0.55, { windup: 0.70, telegraph: true }),
  abilities: [
    custom('gerdan_resonant', 'Rezonans Darbesi', 14, 6, 1.1, '2H_Melee_Attack_Chop', { perilous: true, tankBuster: true, telegraph: true, params: { impact: 0.5 } }),
    custom('gerdan_sweeper', 'Caddeyi Süpürme', 20, 12, 3.0, 'Spellcast_Shoot', { params: { impact: 0.5 } }),
    custom('gerdan_lockdown', 'Arcane Kilitlenme', 30, 20, 2.0, 'Spellcast_Raise'),
    custom('gerdan_signal', 'Sinyal Fenerini Yak', 28, 4, 2.2, 'Spellcast_Long', { castTime: 2.2, interruptible: true, kick: 1 }),
    custom('gerdan_flask', 'Solemn Gecesi Şişesi', 999, 9999, 2.5, 'Use_Item', { castTime: 2.5, interruptible: true, kick: 2 }),
    custom('gerdan_string', 'Nöbet Üçlemesi', 9, 3, 1.0, '2H_Melee_Attack_Slice', { params: { string: 3, gap: 0.4, hold: 0.6 } }),
    custom('gerdan_gate', 'Şehir Kapısı Atılışı', 22, 14, 1.05, '2H_Melee_Attack_Stab', { params: { recovery: 1.5, impact: 0.8 } }),
    custom('gerdan_leap', 'Nöbet Atlayışı', 24, 10, 1.0, 'Jump_Full_Short', { params: { recovery: 1.2, impact: 1.0 } }),
  ],
  phases: [
    bp('p1', 1.01, ['gerdan_resonant', 'gerdan_sweeper', 'gerdan_lockdown', 'gerdan_string', 'gerdan_gate']),
    bp('p2', 0.65, ['gerdan_resonant', 'gerdan_sweeper', 'gerdan_lockdown', 'gerdan_string', 'gerdan_gate', 'gerdan_signal', 'gerdan_leap'], { yell: 'Nöbet! Fenerleri yakın!' }),
    bp('p3', 0.30, ['gerdan_resonant', 'gerdan_sweeper', 'gerdan_lockdown', 'gerdan_string', 'gerdan_gate', 'gerdan_signal', 'gerdan_leap'], { yell: 'Son şişemi içiyorum!', ability: 'gerdan_flask' }),
  ],
  intro: 'Davetsiz misafire yer yok! Divan bu gece kapalı!', death: 'Nöbet... bozuldu... Ay ışığı... sönüyor...',
  arena: { cx: 104, cz: 180, w: 64, h: 48, homeX: 104, homeZ: 176 },
});
BOSSES.boss_gerdan.poise = 100;

boss({
  id: 'boss_taliksa', name: 'Taliksa Alevçelenk', title: "Gece Mahkemesi'nin İstilacısı", model: CHAR('Mage'), scale: 1.8, tint: 0x7a3ad0,
  emissive: 0x30ff50, role: 'caster', hp: 70, dmg: 2.2, speed: 5.0, radius: 1.0, enrage: 270, arenaR: 28, loot: 'loot_ys_b2', anims: A_KAYKIT,
  resist: R_DEMON, visual: { hide: mageHide('1H_Wand', 'Spellbook_open'), glow: 0x58ff70, eyeEmissive: 0x80ff60, runRef: 7 },
  basic: proj('taliksa_firebolt', 'Alev Oku', 16, 40, 2.2, 0.8, 1.0, 'fire', 'fire_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'fire_cast', windup: 0.70 }),
  abilities: [
    custom('taliksa_eruption', 'Cehennem Patlaması', 26, 12, 2.2, 'Spellcast_Long', { sfx: 'boss_cast', params: { impact: 1.5 } }),
    custom('taliksa_intensity', 'Yakıcı Şiddet', 34, 20, 1.0, 'Spellcasting', { castTime: 1.0, params: { channel: 8, loop: 1 } }),
    custom('taliksa_withering', 'Solan Ruh', 15, 8, 2.0, 'Spellcast_Raise', { castTime: 2.0, interruptible: true, kick: 2 }),
    custom('taliksa_whip', 'Alev Kırbacı', 10, 5, 1.0, '1H_Melee_Attack_Slice', { tankBuster: true, telegraph: true, params: { string: 2, gap: 0.5, hold: 0.4 } }),
    custom('taliksa_orbs', 'Gecikmiş Alev Küreleri', 17, 9, 1.0, 'Spellcast_Shoot', { params: { orbs: 3, step: 0.45, fuse: 1.2 } }),
    custom('taliksa_leap', 'Cehennem Sıçrayışı', 28, 18, 1.1, 'Jump_Full_Short', { params: { recovery: 1.2, impact: 1.0 } }),
  ],
  phases: [
    bp('p1', 1.01, ['taliksa_eruption', 'taliksa_intensity', 'taliksa_withering', 'taliksa_whip', 'taliksa_orbs']),
    bp('p2', 0.5, ['taliksa_eruption', 'taliksa_intensity', 'taliksa_withering', 'taliksa_whip', 'taliksa_orbs', 'taliksa_leap'], { yell: 'Alev beni çevreliyor!' }),
  ],
  intro: 'Bu gece Divan Zümrüt Alev için dans edecek!', death: 'Alev... beni... bırakma...',
  arena: { cx: 204, cz: 172, w: 56, h: 56, homeX: 214, homeZ: 162 },
});
BOSSES.boss_taliksa.poise = 80;

boss({
  id: 'boss_melandros', name: 'Danışman Melandros', title: "Müneccim'in İlk Kılıcı", model: CHAR('Rogue'), scale: 1.8, tint: 0x3a4ac8,
  role: 'melee', hp: 120, dmg: 2.5, speed: 8.0, radius: 1.0, enrage: 300, arenaR: 30, loot: 'loot_ys_b3', anims: A_KAYKIT, resist: R_GECE,
  visual: { hide: ROGUE_SHOW_MELANDROS, eyeEmissive: 0x9fe0ff, glow: 0x4aa8ff, runRef: 8 },
  basic: cone('melandros_slash', 'Çifte Kesik', 3.2, 100, 1.6, 1.0, 'Dualwield_Melee_Attack_Slice', 0.5, { windup: 0.70 }),
  abilities: [
    custom('melandros_surge', 'Bıçak Dalgası', 16, 7, 1.6, 'Dodge_Forward'),
    custom('melandros_gale', 'Delici Rüzgar', 18, 12, 1.8, 'Spellcast_Shoot'),
    custom('melandros_maelstrom', 'Dilimleyen Kasırga', 34, 22, 1.0, '2H_Melee_Attack_Spinning', { castTime: 1.0, params: { channel: 6, loop: 1 } }),
    custom('melandros_winds', 'Kuşatan Rüzgârlar', 30, 10, 1.5, 'Spellcast_Long'),
    custom('melandros_echo', 'Yankılanan Bıçaklar', 999, 9999, 1.0, 'Jump_Full_Short'),
    custom('melandros_nightwell', "Gece Pınarı'ndan İç", 999, 9999, 1.0, 'Use_Item', { castTime: 1.0, params: { channel: 5, loop: 1 } }),
    custom('melandros_overflow', 'Pınar Taşması', 12, 6, 1.5, 'Spellcast_Long'),
    custom('melandros_dance', 'Rüzgâr Dansı', 11, 4, 1.0, 'Dualwield_Melee_Attack_Slice', { tankBuster: true, telegraph: true, params: { string: 3, gap: 0.4, hold: 0.5 } }),
    custom('melandros_feint', 'Sahte Hamle', 20, 15, 1.05, 'Dodge_Forward', { params: { feintAt: 0.6, hold: 0.5, recovery: 1.2 } }),
  ],
  phases: [
    bp('p1', 1.01, ['melandros_surge', 'melandros_gale', 'melandros_maelstrom', 'melandros_dance', 'melandros_feint']),
    bp('p2', 0.70, [], { yell: 'Yankılar... bana!', ability: 'melandros_echo' }),
    bp('p3', 0.699, ['melandros_surge', 'melandros_gale', 'melandros_maelstrom', 'melandros_winds', 'melandros_dance', 'melandros_feint']),
    bp('p4', 0.25, ['melandros_surge', 'melandros_gale', 'melandros_maelstrom', 'melandros_winds', 'melandros_overflow', 'melandros_dance', 'melandros_feint'], { yell: 'Pınar benim!', ability: 'melandros_nightwell' }),
  ],
  intro: "Müneccim'in sırrı artık benim. Yıldızlar bana yeter!", death: 'Kılıcım... ışığını... yitirdi...',
  arena: { cx: 120, cz: 32, w: 76, h: 44, homeX: 122, homeZ: 34 },
});
BOSSES.boss_melandros.poise = 120;

/** Every id this module registers (smoke and content checks read it). */
export const YILDIZ_ENEMY_IDS: string[] = [
  'ys_nobet_muhafizi', 'ys_nobet_buyucusu', 'ys_gece_rahibi', 'ys_koruyucu_yapi', 'ys_fel_cellat', 'ys_golge_hanim', 'ys_duellocu',
  'ys_dehset_gozu', 'ys_mana_ejderi', 'ys_mana_yutan', 'ys_mana_kilici', 'ys_zumrut_kopek', 'ys_gerenth', 'ys_uyanik_nobetci',
  'ys_yanan_iblis', 'ys_supheli_asil', 'ys_melandros_imaj', 'ys_cazsar', 'ys_baalgar', 'ys_imakutya',
];
export const YILDIZ_BOSS_IDS: string[] = ['boss_gerdan', 'boss_taliksa', 'boss_melandros'];
