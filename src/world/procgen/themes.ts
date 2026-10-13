import type { DungeonTheme, FloorStyle, FissureThemeId, WallStyle } from '../../types/dungeons';
import { KEMIK_MAHZENI } from '../../data/dungeons/kemik_mahzeni';
import { KIZIL_DOKUMHANE } from '../../data/dungeons/kizil_dokumhane';
import { BUZUL_TAHTI } from '../../data/dungeons/buzul_tahti';
import { GOLGE_TAPINAGI } from '../../data/dungeons/golge_tapinagi';
import { dg, gp, hw, kg, ks } from '../../data/dungeons/kit';

/**
 * Theme data of the generated maps (docs/GDD_PROCGEN.md §5.2, §5.3). OWNER: world module (content data).
 * Every enemy id is an existing EnemyDef, every model an existing asset, every boss an existing BossDef (checked by dev/combat-sim/procgen.mjs).
 */

export type PackRole = 'trash' | 'swarm' | 'caster' | 'mixed' | 'elite';
export interface PackTpl {
  id: string;
  role: PackRole;
  /** [enemyId, count] at Normal strength; the first entry is the melee front rank that scales with tier and level. */
  members: [string, number][];
  weight: number;
}

export type NamedKind = 'start' | 'chamber' | 'hall' | 'treasure' | 'shrine' | 'corridor' | 'ramp';

export interface ThemeDef {
  id: FissureThemeId;
  /** Map name (Turkish). */
  name: string;
  shortName: string;
  lore: string;
  /** Recommended enemy level band (hint only). */
  level: [number, number];
  floor: FloorStyle;
  floorAlt: FloorStyle;
  wall: WallStyle;
  ceilingDark: boolean;
  theme: DungeonTheme;
  lightColor: number;
  roomNames: Record<NamedKind, string[]>;
  packs: PackTpl[];
  elites: PackTpl[];
  props: { scatter: string[]; center: string; brazier: string };
  zoneColor: number;
  zoneGlow: number;
  dormant?: { kind: 'bones' | 'coffin' | 'egg' | 'ceiling' | 'statue'; chance: number; wake: number };
  stealthChance?: number;
}

const copyTheme = (t: DungeonTheme): DungeonTheme => ({ ...t, palette: t.palette ? [...t.palette] : undefined });

export const THEMES: Record<FissureThemeId, ThemeDef> = {
  crypt: {
    id: 'crypt', name: 'Mezarlık Yarığı', shortName: 'Mezarlık',
    lore: 'Kadim bir yarıktan sızan ölü nefesi, unutulmuş kralların mezarlığını yeniden uyandırdı.',
    level: [1, 35], floor: 'stone_dark', floorAlt: 'dirt', wall: 'stone', ceilingDark: true, theme: copyTheme(KEMIK_MAHZENI.theme), lightColor: 0x7affc0,
    roomNames: {
      start: ['Mezarlık Girişi', 'Nöbetçi Avlusu', 'Yıkık Kapı Odası', 'Mumlu Antre'],
      chamber: ['Kemik Odası', 'Sessiz Mahzen', 'Ağıt Odası', 'Lahit Odası', 'Çürük Koğuş'],
      hall: ['Lahit Salonu', 'Kemik Geçidi Meydanı', 'Unutulmuş Revak', 'Ağıt Galerisi'],
      treasure: ['Gömü Mahzeni', 'Kral Hazinesi', 'Sır Odası', 'Define Hücresi'],
      shrine: ['Adak Odası', 'Ruh Sunağı', 'Mum Sunağı', 'Dua Hücresi'],
      corridor: ['Taş Geçit', 'Kemik Koridoru', 'Karanlık Geçit', 'Nemli Dehliz'],
      ramp: ['Mezar Merdiveni', 'Aşınmış Basamaklar', 'İnişli Geçit'],
    },
    packs: [
      { id: 'crypt_t1', role: 'trash', members: [['skel_minion', 3], ['skel_archer', 1]], weight: 1 },
      { id: 'crypt_t2', role: 'trash', members: [['crypt_ghoul', 2], ['skel_archer', 2]], weight: 1 },
      { id: 'crypt_s1', role: 'swarm', members: [['skel_rattler', 8]], weight: 1 },
      { id: 'crypt_s2', role: 'swarm', members: [['crypt_rat', 10]], weight: 1 },
      { id: 'crypt_s3', role: 'swarm', members: [['bone_skull', 6]], weight: 1 },
      { id: 'crypt_c1', role: 'caster', members: [['skel_mage', 2], ['crypt_wraith', 1]], weight: 1 },
      { id: 'crypt_m1', role: 'mixed', members: [['skel_warrior', 1], ['skel_minion', 2], ['skel_mage', 1]], weight: 1 },
    ],
    elites: [
      { id: 'crypt_e1', role: 'elite', members: [['bone_golem', 1], ['skel_rattler', 3]], weight: 1 },
      { id: 'crypt_e2', role: 'elite', members: [['skel_warrior', 1], ['skel_mage', 1], ['skel_minion', 2]], weight: 1 },
    ],
    props: {
      scatter: [gp('bone_pile'), hw('skull'), dg('rubble_large'), hw('gravestone'), gp('chains_hanging')],
      center: hw('coffin_decorated'), brazier: gp('brazier'),
    },
    zoneColor: 0x142a24, zoneGlow: 0x7affc0,
    dormant: { kind: 'bones', chance: 0.25, wake: 9 },
  },
  forge: {
    id: 'forge', name: 'Kor Yarığı', shortName: 'Kor',
    lore: 'Yarığın öbür ucunda hâlâ kızgın bir ocak yanıyor; demirciler çoktan gitti, alevler kaldı.',
    level: [10, 50], floor: 'lava_rock', floorAlt: 'stone_dark', wall: 'forge', ceilingDark: false, theme: copyTheme(KIZIL_DOKUMHANE.theme), lightColor: 0xff6a20,
    roomNames: {
      start: ['Ocak Girişi', 'Kızgın Avlu', 'Köz Antresi', 'Cürüf Kapısı'],
      chamber: ['Örs Odası', 'Cüruf Odası', 'Körük Odası', 'Kor Koğuşu', 'Tulum Odası'],
      hall: ['Büyük Ocak', 'Dökümhane Salonu', 'Magma Galerisi', 'Kızıl Meydan'],
      treasure: ['Demir Hazine', 'Külçe Odası', 'Gizli Ocak', 'Altın Kalıp Odası'],
      shrine: ['Alev Sunağı', 'Köz Sunağı', 'Ateş Adağı', 'Isı Hücresi'],
      corridor: ['Isıtmalı Geçit', 'Cüruf Koridoru', 'Köz Dehlizi', 'Demir Geçit'],
      ramp: ['Örs Merdiveni', 'Kızgın Basamaklar', 'Ocak Rampası'],
    },
    packs: [
      { id: 'forge_t1', role: 'trash', members: [['forge_goblin', 3], ['forge_imp', 1]], weight: 1 },
      { id: 'forge_t2', role: 'trash', members: [['lava_slime', 2], ['forge_imp', 1]], weight: 1 },
      { id: 'forge_s1', role: 'swarm', members: [['forge_goblin', 8]], weight: 1 },
      { id: 'forge_s2', role: 'swarm', members: [['flame_skull', 6]], weight: 1 },
      { id: 'forge_c1', role: 'caster', members: [['fire_priest', 1], ['forge_imp', 2]], weight: 1 },
      { id: 'forge_m1', role: 'mixed', members: [['forge_orc', 1], ['forge_goblin', 2], ['fire_priest', 1]], weight: 1 },
    ],
    elites: [
      { id: 'forge_e1', role: 'elite', members: [['magma_golem', 1], ['flame_skull', 3]], weight: 1 },
      { id: 'forge_e2', role: 'elite', members: [['forge_demon', 1], ['fire_priest', 1], ['forge_goblin', 2]], weight: 1 },
    ],
    props: {
      scatter: [dg('barrel_large'), dg('crates_stacked'), gp('rock_medium'), ks('resource-stone'), gp('chains_hanging')],
      center: ks('workbench-anvil'), brazier: kg('fire-basket'),
    },
    zoneColor: 0x2a1208, zoneGlow: 0xff6a20,
  },
  frost: {
    id: 'frost', name: 'Buzul Yarığı', shortName: 'Buzul',
    lore: 'Yarıktan esen soğuk rüzgâr her şeyi donduruyor; buzun altında eski bir tahtın uykusu bozuldu.',
    level: [15, 60], floor: 'ice', floorAlt: 'stone', wall: 'ice', ceilingDark: false, theme: copyTheme(BUZUL_TAHTI.theme), lightColor: 0x80c8ff,
    roomNames: {
      start: ['Buz Girişi', 'Donmuş Avlu', 'Kırağı Antresi', 'Ayaz Kapısı'],
      chamber: ['Buz Mağarası', 'Kırağı Odası', 'Don Koğuşu', 'Sarkıt Odası', 'Kar Odası'],
      hall: ['Ayaz Salonu', 'Buz Katedrali', 'Donmuş Meydan', 'Kristal Galeri'],
      treasure: ['Buz Hazine', 'Donmuş Define', 'Kristal Oda', 'Gizli Buzluk'],
      shrine: ['Kırağı Sunağı', 'Buz Adağı', 'Kristal Sunak', 'Don Hücresi'],
      corridor: ['Buz Geçidi', 'Donmuş Koridor', 'Ayaz Dehlizi', 'Kar Geçidi'],
      ramp: ['Buz Merdiveni', 'Kaygan Basamaklar', 'Donmuş Rampa'],
    },
    packs: [
      { id: 'frost_t1', role: 'trash', members: [['frost_dead', 3], ['snow_spider', 1]], weight: 1 },
      { id: 'frost_t2', role: 'trash', members: [['frost_slime', 2], ['snow_spider', 1]], weight: 1 },
      { id: 'frost_s1', role: 'swarm', members: [['ice_bat', 8]], weight: 1 },
      { id: 'frost_s2', role: 'swarm', members: [['frost_dead', 7]], weight: 1 },
      { id: 'frost_c1', role: 'caster', members: [['frost_wraith', 2], ['snow_spider', 1]], weight: 1 },
      { id: 'frost_m1', role: 'mixed', members: [['frost_knight', 1], ['frost_dead', 2], ['frost_wraith', 1]], weight: 1 },
    ],
    elites: [
      { id: 'frost_e1', role: 'elite', members: [['yeti_brute', 1], ['ice_bat', 2]], weight: 1 },
      { id: 'frost_e2', role: 'elite', members: [['frost_knight', 1], ['ice_elemental', 1], ['frost_dead', 2]], weight: 1 },
    ],
    props: {
      scatter: [gp('rock_cliff'), gp('rock_large'), gp('crystal_blue'), gp('bone_pile')],
      center: gp('crystal_blue'), brazier: kg('fire-basket'),
    },
    zoneColor: 0x143048, zoneGlow: 0x80c8ff,
  },
  shadow: {
    id: 'shadow', name: 'Gölge Yarığı', shortName: 'Gölge',
    lore: 'Yarığın içinde ışık geri çekiliyor; gölge tapınağın sessiz rahipleri seni bekliyor.',
    level: [20, 60], floor: 'temple', floorAlt: 'stone_dark', wall: 'temple', ceilingDark: true, theme: copyTheme(GOLGE_TAPINAGI.theme), lightColor: 0xb060ff,
    roomNames: {
      start: ['Gölge Eşiği', 'Sessiz Avlu', 'Karanlık Antre', 'Rahip Kapısı'],
      chamber: ['Fısıltı Odası', 'Ayin Odası', 'Gölge Koğuşu', 'Boşluk Odası', 'Mühür Odası'],
      hall: ['Gölge Salonu', 'Ayin Meydanı', 'Karanlık Revak', 'Mühürler Galerisi'],
      treasure: ['Karanlık Hazine', 'Mühürlü Oda', 'Gizli Kutsal Oda', 'Gölge Defineleri'],
      shrine: ['Gölge Sunağı', 'Ayin Adağı', 'Mühür Sunağı', 'Boşluk Hücresi'],
      corridor: ['Gölge Geçidi', 'Sessiz Koridor', 'Fısıltı Dehlizi', 'Karanlık Geçit'],
      ramp: ['Tapınak Merdiveni', 'Karanlık Basamaklar', 'Gölgeli Rampa'],
    },
    packs: [
      { id: 'shadow_t1', role: 'trash', members: [['cult_acolyte', 3], ['void_imp', 1]], weight: 1 },
      { id: 'shadow_t2', role: 'trash', members: [['shadow_spider', 2], ['cult_assassin', 1]], weight: 1 },
      { id: 'shadow_s1', role: 'swarm', members: [['cult_acolyte', 8]], weight: 1 },
      { id: 'shadow_s2', role: 'swarm', members: [['shadow_spiderling', 9]], weight: 1 },
      { id: 'shadow_c1', role: 'caster', members: [['shadow_priest', 1], ['void_imp', 2]], weight: 1 },
      { id: 'shadow_c2', role: 'caster', members: [['cult_summoner', 1], ['shade', 1]], weight: 1 },
      { id: 'shadow_m1', role: 'mixed', members: [['void_demon', 1], ['cult_acolyte', 2], ['shade', 1]], weight: 1 },
    ],
    elites: [
      { id: 'shadow_e1', role: 'elite', members: [['void_demon', 1], ['cult_summoner', 1], ['cult_acolyte', 2]], weight: 1 },
      { id: 'shadow_e2', role: 'elite', members: [['cult_assassin', 2], ['shade', 2]], weight: 1 },
    ],
    props: {
      scatter: [gp('crystal_purple'), hw('skull_candle'), dg('rubble_half'), kg('coffin-old')],
      center: hw('shrine_candles'), brazier: gp('brazier'),
    },
    zoneColor: 0x1a1030, zoneGlow: 0xb060ff,
    stealthChance: 0.2,
  },
};
