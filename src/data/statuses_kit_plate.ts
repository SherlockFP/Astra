/**
 * KIT PLATE (docs/kits/plate-melee.md §g "New StatusIds" + the "10 pending" existing ids of the §b tables). StatusDef and
 * STATUS_RULES rows of the plate-melee kits (Şövalye, Barbar, Paladin, Nekromant), merged into STATUSES / STATUS_RULES by
 * data/statuses.ts AFTER the shared rows (same pattern as statuses_kit_rogue.ts).
 *
 * Numbers follow the kit tables (§1b-§9b). `stats` are per stack, except on statuses with `perMag` rules (avatar / wrath_wings),
 * where they are per unit of magnitude (wrath_wings: critChance 1 x magnitude 0.15 = +15 %).
 * Riders (`extraTargets`, `takenMoreFromSource`, `cdMult`, `pandemic`, `immuneKnockback`) are rule fields only; PM-00b wires
 * their behaviour (plate-melee §g needs 4 and 7).
 *
 * Not defined here (already defined elsewhere): `mortal_wound` (data/statuses.ts), `revenge_ready` (data/statuses_talents.ts),
 * `exec_window` (watcher, data/watchers.ts). Retuned existing defs are edited in place in data/statuses.ts.
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_PLATE: Partial<Record<StatusId, StatusDef>> = {
  // ---- Şövalye (Arms / Prot) and Barbar (Fury / Savaş Lordu) rows
  sudden_death: { id: 'sudden_death', name: 'Ani Ölüm', icon: I('buff-crit'), kind: 'buff', maxStacks: 2, defaultDuration: 12 },
  battlelord: { id: 'battlelord', name: 'Savaş Efendisi', icon: I('buff-strength'), kind: 'buff', defaultDuration: 8 },
  colossus: { id: 'colossus', name: 'Dev Ezme', icon: I('debuff-armor-break'), kind: 'debuff', defaultDuration: 10 },
  sweeping: { id: 'sweeping', name: 'Süpürme', icon: I('buff-strength'), kind: 'buff', defaultDuration: 6 },
  avatar: { id: 'avatar', name: 'Savaş Avatarı', icon: I('buff-strength'), kind: 'buff', vfx: 'zeal_aura', defaultDuration: 20 },
  die_by_sword: { id: 'die_by_sword', name: 'Kılıç Perdesi', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.40, parryWindow: 0.20 }, defaultDuration: 8 },
  rend: { id: 'rend', name: 'Parçalama', icon: I('debuff-bleed'), kind: 'debuff', dotType: 'physical', maxStacks: 1, defaultDuration: 15 },
  meat_cleaver: { id: 'meat_cleaver', name: 'Et Satırı', icon: I('buff-strength'), kind: 'buff', maxStacks: 2, defaultDuration: 8 },
  gore: { id: 'gore', name: 'Kanlı Fırsat', icon: I('buff-strength'), kind: 'buff', defaultDuration: 10 },
  gory_maul: { id: 'gory_maul', name: 'Kanlı Kürk: Balta', icon: I('buff-lifesteal'), kind: 'buff', defaultDuration: 12 },
  gory_iron: { id: 'gory_iron', name: 'Kanlı Kürk: Demir', icon: I('buff-defense'), kind: 'buff', defaultDuration: 12 },
  ursoc_form: { id: 'ursoc_form', name: 'Ata Kılığı', icon: I('buff-defense'), kind: 'buff', stats: { maxHpPct: 0.15, damageReductionPct: 0.15 }, defaultDuration: 20 },

  // ---- Koruma / Kutsal / Ceza (paladin) rows
  shining_light: { id: 'shining_light', name: 'Parlak Işık', icon: I('buff-blessing'), kind: 'buff', maxStacks: 3, defaultDuration: 15 },
  infusion_of_light: { id: 'infusion_of_light', name: 'Işık Aşısı', icon: I('buff-blessing'), kind: 'buff', defaultDuration: 15 },
  art_of_war: { id: 'art_of_war', name: 'Adalet Savaşı', icon: I('buff-crit'), kind: 'buff', defaultDuration: 12 },
  hammer_window: { id: 'hammer_window', name: 'Işık Çekici Hazır', icon: I('buff-blessing'), kind: 'buff', maxStacks: 2, defaultDuration: 12 },
  templar_combo: { id: 'templar_combo', name: 'Tapınakçı Zinciri', icon: I('buff-crit'), kind: 'buff', hidden: true, defaultDuration: 4 },
  divine_steed: { id: 'divine_steed', name: 'İlahi Binek', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.40 }, defaultDuration: 3 },
  judged: { id: 'judged', name: 'Yargılı', icon: I('debuff-marked'), kind: 'debuff', stats: { damagePct: -0.10 }, defaultDuration: 10 },
  forbearance: { id: 'forbearance', name: 'Cezalandırıldı', icon: I('debuff-marked'), kind: 'debuff', dispellable: false, defaultDuration: 90 },
  righteous: { id: 'righteous', name: 'Doğruluk', icon: I('buff-defense'), kind: 'buff', stats: { armorPct: 0.40, blockChance: 0.20 }, defaultDuration: 6 },
  wrath_wings: { id: 'wrath_wings', name: 'İntikam Kanatları', icon: I('buff-blessing'), kind: 'buff', stats: { critChance: 1, healingPct: 1 }, defaultDuration: 20 },
  bulwark: { id: 'bulwark', name: 'İlahi Siper', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.45 }, vfx: 'shield_bubble', defaultDuration: 8 },
  ardent: { id: 'ardent', name: 'Yılmaz Savunucu', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.20 }, defaultDuration: 10 },
  aura_mastery: { id: 'aura_mastery', name: 'Aura Ustalığı', icon: I('buff-aura'), kind: 'buff', stats: { damageReductionPct: 0.20 }, vfx: 'aura_ring', defaultDuration: 10 },
  crusade: { id: 'crusade', name: 'Sefer', icon: I('buff-crit'), kind: 'buff', maxStacks: 10, stats: { attackSpeed: 0.02, castSpeed: 0.02 }, defaultDuration: 20 },
  sentenced: { id: 'sentenced', name: 'Hükümlü', icon: I('debuff-marked'), kind: 'debuff', dotType: 'holy', defaultDuration: 10 },
  // Kutsal Zemin: allies standing in the zone get +3 % armour (re-applied every tick, 1.6 s); plate-melee.md §5a
  consecrated: { id: 'consecrated', name: 'Kutsal Zemin', icon: I('buff-defense'), kind: 'buff', stats: { armorPct: 0.03 }, defaultDuration: 1.6 },

  // ---- Nekromant (Kemik Muhafızı / Ordu Efendisi) rows
  bone_armor: { id: 'bone_armor', name: 'Kemik Zırhı', icon: I('buff-defense'), kind: 'buff', maxStacks: 10, stats: { damageReductionPct: 0.03, armorPct: 0.06 }, vfx: 'bone_armor', defaultDuration: 30 },
  blood_plague: { id: 'blood_plague', name: 'Kan Vebası', icon: I('debuff-poison'), kind: 'debuff', dotType: 'shadow', defaultDuration: 24 },
  vampiric_blood: { id: 'vampiric_blood', name: 'Vampirik Kan', icon: I('buff-lifesteal'), kind: 'buff', stats: { maxHpPct: 0.30, healReceivedPct: 0.30 }, defaultDuration: 10 },
  dancing_rune_weapon: { id: 'dancing_rune_weapon', name: 'Hayalet Orak', icon: I('buff-aura'), kind: 'buff', stats: { parryWindow: 0.30 }, defaultDuration: 12 },
  icebound: { id: 'icebound', name: 'Buz Gibi Sebat', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.30 }, defaultDuration: 8 },
  anti_magic_shell: { id: 'anti_magic_shell', name: 'Büyü Karşıtı Kalkan', icon: I('buff-absorb'), kind: 'buff', defaultDuration: 8 },
  deaths_advance: { id: 'deaths_advance', name: 'Ölüm Atılışı', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.40 }, defaultDuration: 6 },
  vile_contagion: { id: 'vile_contagion', name: 'Çürük Bulaşı', icon: I('debuff-curse'), kind: 'debuff', maxStacks: 3, defaultDuration: 20 },
  virulent_plague: { id: 'virulent_plague', name: 'Zehirli Veba', icon: I('debuff-poison'), kind: 'debuff', dotType: 'shadow', defaultDuration: 21 },
  sudden_doom: { id: 'sudden_doom', name: 'Ani Kıyamet', icon: I('buff-mana-regen'), kind: 'buff', defaultDuration: 12 },
  dark_transformation: { id: 'dark_transformation', name: 'Karanlık Dönüşüm', icon: I('buff-strength'), kind: 'buff', defaultDuration: 15 },
  army: { id: 'army', name: 'Ölüler Ordusu', icon: I('buff-aura'), kind: 'buff', defaultDuration: 30 },
  // ---- Buz Kıyıcısı (Frost) rows: procs are read by procs_kit_necromancer.ts
  killing_machine: { id: 'killing_machine', name: 'Öldürücü Makine', icon: I('buff-crit'), kind: 'buff', defaultDuration: 8 },
  rime: { id: 'rime', name: 'Kırağı', icon: I('buff-aura'), kind: 'buff', defaultDuration: 15 },
  frost_fever: { id: 'frost_fever', name: 'Buz Humması', icon: I('debuff-poison'), kind: 'debuff', dotType: 'frost', defaultDuration: 24 },
  death_and_decay: { id: 'death_and_decay', name: 'Ölüm ve Çürüme', icon: I('debuff-curse'), kind: 'debuff', dotType: 'shadow', defaultDuration: 10 },
  pillar_of_frost: { id: 'pillar_of_frost', name: 'Buz Sütunu', icon: I('buff-strength'), kind: 'buff', stats: { damagePct: 0.2 }, defaultDuration: 12 },
};

export const STATUS_RULES_KIT_PLATE: Partial<Record<StatusId, StatusRule>> = {
  sudden_death: { stack: 'stack' },
  // (revenge_ready: def in data/statuses_talents.ts; plate-melee §2b / §g table: refresh 6 s)
  revenge_ready: { stack: 'refresh' },
  battlelord: { stack: 'refresh' },
  colossus: { stack: 'refresh', takenMoreFromSource: 0.30 },
  sweeping: { stack: 'refresh', extraTargets: 2, extraMult: 0.6 },
  // Savaş Avatarı: dealtMore = magnitude (0.20 from Savaş Lordu / Şövalye m90, 0.10 from Kasap m45)
  avatar: { stack: 'refresh', perMag: true, defMag: 0.2, dealtMore: 1 },
  die_by_sword: { stack: 'refresh' },
  rend: { stack: 'refresh', pandemic: 0.3 },
  meat_cleaver: { stack: 'stack', extraTargets: 3, extraMult: 0.6 },
  gore: { stack: 'refresh' },
  gory_maul: { stack: 'refresh' },
  gory_iron: { stack: 'refresh' },
  // Yarma (barbarian_cleave) and Paralama (barbarian_thrash) cooldowns x0.5
  ursoc_form: { stack: 'refresh', cdMult: { mult: 0.5, skills: ['barbarian_cleave', 'barbarian_thrash'] } },
  shining_light: { stack: 'stack' },
  infusion_of_light: { stack: 'refresh' },
  art_of_war: { stack: 'refresh' },
  hammer_window: { stack: 'stack' },
  templar_combo: { stack: 'refresh' },
  divine_steed: { stack: 'refresh' },
  judged: { stack: 'refresh', takenMoreFromSource: 0.10 },
  forbearance: { stack: 'refresh' },
  righteous: { stack: 'refresh' },
  // İntikam Kanatları: magnitude 0.10 (Koruma) / 0.15 (Kutsal, Ceza); critChance 1 x magnitude, healingPct 1 x magnitude (Kutsal +15 % healing), dealtMore = magnitude
  wrath_wings: { stack: 'strongest', perMag: true, defMag: 0.15, dealtMore: 1 },
  bulwark: { stack: 'refresh', immuneCC: true },
  // Yılmaz Savunucu: 'override' so the lethal-save proc (T lethal => st(self,ardent,0.2)) can cut the status short; a recast sets 10 s again
  ardent: { stack: 'override' },
  aura_mastery: { stack: 'refresh' },
  crusade: { stack: 'stack' },
  sentenced: { stack: 'refresh' },
  consecrated: { stack: 'refresh' },
  bone_armor: { stack: 'stack', consumeOnHit: { icd: 2.5 } },
  blood_plague: { stack: 'refresh' },
  vampiric_blood: { stack: 'refresh' },
  dancing_rune_weapon: { stack: 'refresh' },
  icebound: { stack: 'refresh', immuneCC: true },
  anti_magic_shell: { stack: 'refresh' },
  deaths_advance: { stack: 'refresh', immuneKnockback: true },
  vile_contagion: { stack: 'stack' },
  virulent_plague: { stack: 'refresh', pandemic: 0.3 },
  sudden_doom: { stack: 'refresh' },
  dark_transformation: { stack: 'refresh' },
  army: { stack: 'refresh' },
  killing_machine: { stack: 'refresh' },
  rime: { stack: 'refresh' },
  frost_fever: { stack: 'refresh', pandemic: 0.3 },
  death_and_decay: { stack: 'refresh' },
  pillar_of_frost: { stack: 'refresh' },
};
