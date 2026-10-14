import type { ClassId } from '../types/common';
import type { PipDef, ClassVisualDef } from '../types/classes';
import type { ArmorWeight, ItemCategory } from '../types/items';
import type { ClassDef, SkillSlotKey } from '../types/skills';
import type { SpecId } from '../types/v2';

/**
 * OWNER: combat module (registry rows); the five GDD_CLASSES_V2 classes (NC04) are registry entries only until their
 * skills land. The 4 playable classes (KayKit Knight/Barbarian/Mage/Rogue), GDD_SYSTEMS 1.2 / 2.x.
 * Selectable classes are PLAYABLE_CLASSES (below); CLASS_IDS stays the four old ids for the dev pages.
 *
 * - `baseStats` = L1 attributes + class resource regen / passive trait stats (StatCalc folds them with perLevel).
 *   `maxResource` here is the BONUS over the fixed pool of 100 (GDD 1.3).
 * - The Şövalye's "Kararlılık" (resolve) is typed as 'rage' (ResourceType has no 'resolve'); resourceName shows the TR name.
 * - `skills` lists the 8 class skills in unlock order (levels 1,3,6,10,15,20,25,30).
 * - Extra (optional, ignored by older code): hpPerLevel / hpPerVit for StatCalc, mainStat for damage scaling.
 */
export interface ClassDefX extends ClassDef {
  hpPerLevel: number;
  hpPerVit: number;
  mainStat: 'str' | 'dex' | 'int';
  /** Resource the class STARTS with (fraction of max). */
  startResource: number;
  /** Combat role flavour, shown in the creation screen. */
  role: string;
  // ---- GDD_CLASSES_V2 §1.1 (NC04). All optional: the four KayKit classes keep working without them.
  /** Resource bar colour (hex). */
  resourceColor?: string;
  /** One-line identity under the class grid (GDD_CLASSES_V2 §13.2). */
  tagline?: string;
  /** Class icon: a name in public/assets/icons without path or extension (e.g. 'buff-strength'): menu card, party frame. */
  icon?: string;
  armorWeight?: ArmorWeight;
  /** Weapon / off-hand categories the class may equip (items module derives CLASS_WEAPONS / CLASS_OFFHANDS from these). */
  weapons?: ItemCategory[];
  offhands?: ItemCategory[];
  /** Secondary pip counter (GDD_CLASSES_V2 §1.2). */
  secondary?: PipDef;
  /** Spec ids of the class (SPECS registry, GDD_V2 §1.3). */
  specs?: SpecId[];
  /** Model recipe (GDD_CLASSES_V2 §2.2–§6.2). */
  visual?: ClassVisualDef;
  /** Voice pack and pitch (GDD_CLASSES_V2 §9.1; replaces the packFor() switch in audio/Audio.ts). */
  voice?: { pack: 'warrior' | 'mage' | 'orc'; pitch: number };
  anims?: { idle?: string; run?: string; walk?: string };
  cameraProfile?: 'melee' | 'ranged' | 'caster';
  /** WoW auto-attack mode override (CONTROLS_WOW §8.3). Unset = derived from the basic step and cameraProfile. */
  autoAttack?: 'melee' | 'ranged' | 'off';
  /** Class trait (GDD_CLASSES_V2 §x.1 "trait_*"). */
  trait?: { id: string; name: string; desc: string };
  /** Resource regen behaviour (GDD_CLASSES_V2 §1.2; replaces the mage/barbarian special cases in Combat). */
  regenRule?: 'default' | 'mana' | 'rage' | 'still' | 'fury';
  /** StatCalc adds 0.015 × Zeka to resource regen when true (mage, warlock). */
  manaScaling?: boolean;
}

export const CLASSES: Record<ClassId, ClassDefX> = {
  knight: {
    id: 'knight',
    specs: ['knight_protector', 'knight_blademaster'],
    name: 'Şövalye',
    desc: 'Zırhlı ön saf savaşçısı. Kılıç ve kalkanıyla düşman dalgalarını durdurur, kutsal ışıkla müttefiklerini korur.',
    role: 'Tank / Kutsal Savaşçı',
    model: '/assets/models/characters/Knight.glb',
    resource: 'rage',
    resourceName: 'Kararlılık',
    baseStats: { str: 14, dex: 10, int: 8, vit: 16, resourceRegen: 4 },
    perLevel: { str: 3, dex: 1, int: 0, vit: 3 },
    hpPerLevel: 12,
    hpPerVit: 10,
    mainStat: 'str',
    startResource: 1,
    weaponNodes: {
      show: ['1H_Sword', 'Round_Shield', 'Knight_Cape'],
      hide: ['1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', 'Knight_Helmet'],
    },
    basicAttack: 'knight_basic',
    skills: [
      'knight_charge', 'knight_heroic_leap', 'knight_pummel', 'knight_avatar', 'knight_radiant_cleave',
      'knight_thunder_clap', 'knight_revenge', 'knight_shield_slam',
    ],
    startingItems: ['sword1h_t1', 'shield_t1'],
    color: '#e8c15a',
  },
  barbarian: {
    id: 'barbarian',
    specs: ['barbarian_warlord', 'barbarian_butcher'],
    name: 'Barbar',
    desc: 'Öfkesiyle beslenen vahşi savaşçı. Dev baltasıyla kalabalıkları biçer, kan döktükçe güçlenir.',
    role: 'Yakın Dövüş / Alan Hasarı',
    model: '/assets/models/characters/Barbarian.glb',
    resource: 'rage',
    resourceName: 'Öfke',
    baseStats: { str: 16, dex: 10, int: 6, vit: 16, resourceRegen: 0, lifeSteal: 0.005 },
    perLevel: { str: 4, dex: 1, int: 0, vit: 2 },
    hpPerLevel: 12,
    hpPerVit: 12,
    mainStat: 'str',
    startResource: 0,
    weaponNodes: {
      show: ['2H_Axe', 'Barbarian_Cape'],
      hide: ['1H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Mug', 'Barbarian_Hat'],
    },
    basicAttack: 'barbarian_basic',
    skills: [
      'barbarian_leap', 'barbarian_whirlwind', 'barbarian_pummel', 'barbarian_intimidating_shout', 'barbarian_execute',
      'barbarian_shield_slam', 'barbarian_revenge', 'barbarian_thunder_clap',
    ],
    startingItems: ['axe2h_t1'],
    color: '#d6452e',
  },
  mage: {
    id: 'mage',
    name: 'Büyücü',
    desc: 'Ateş, buz ve gizem büyüleriyle uzaktan yıkım saçan bilge. Kırılgandır ama elementlerin efendisidir.',
    role: 'Menzilli Büyücü',
    model: '/assets/models/characters/Mage.glb',
    resource: 'mana',
    resourceName: 'Mana',
    baseStats: { str: 6, dex: 10, int: 18, vit: 14, resourceRegen: 5 },
    perLevel: { str: 0, dex: 1, int: 4, vit: 2 },
    hpPerLevel: 8,
    hpPerVit: 9,
    mainStat: 'int',
    startResource: 1,
    weaponNodes: {
      show: ['2H_Staff', 'Mage_Cape'],
      hide: ['1H_Wand', 'Spellbook', 'Spellbook_open', 'Mage_Hat'],
    },
    basicAttack: 'mage_basic',
    skills: [
      'mage_fireball', 'mage_frost_nova', 'mage_blink', 'mage_meteor',
      'mage_blizzard', 'mage_arcane_orb',
      // KIT PK-MAGE: appended (no defaultSlot, so the class default bar keeps the slots of the six above)
      'mage_pyroblast', 'mage_fire_blast', 'mage_scorch', 'mage_flamestrike',
      'mage_frostbolt', 'mage_ice_lance', 'mage_flurry', 'mage_ice_barrier', 'mage_comet_storm', 'mage_glacial_spike',
      'mage_arcane_blast', 'mage_arcane_missiles', 'mage_arcane_barrage', 'mage_arcane_pulse', 'mage_prismatic_barrier',
      'mage_blazing_barrier', 'mage_combustion', 'mage_phoenix_flames', 'mage_living_bomb', 'mage_dragons_breath',
      'mage_frozen_orb', 'mage_ray_of_frost', 'mage_icy_veins', 'mage_ice_block', 'mage_counterspell',
      'mage_touch_of_magi', 'mage_arcane_surge', 'mage_evocation', 'mage_time_warp',
    ],
    startingItems: ['staff_t1'],
    color: '#6aa8ff',
  },
  rogue: {
    id: 'rogue',
    specs: ['rogue_assassin', 'rogue_outlaw', 'rogue_subtlety'],
    name: 'Haydut',
    desc: 'Gölgelerde dolaşan çevik suikastçı. Çift hançer ve arbaletle hızlı vurur, zehirle öldürür.',
    role: 'Çevik Suikastçı',
    model: '/assets/models/characters/Rogue.glb',
    resource: 'energy',
    resourceName: 'Enerji',
    baseStats: { str: 10, dex: 18, int: 6, vit: 14, resourceRegen: 12 },
    perLevel: { str: 1, dex: 4, int: 0, vit: 2 },
    hpPerLevel: 10,
    hpPerVit: 9,
    mainStat: 'dex',
    startResource: 1,
    weaponNodes: {
      show: ['Knife', 'Knife_Offhand', 'Rogue_Cape'],
      hide: ['1H_Crossbow', '2H_Crossbow', 'Throwable'],
    },
    basicAttack: 'rogue_basic',
    skills: [
      'rogue_shadow_step', 'rogue_kick', 'rogue_vanish', 'rogue_feint',
    ],
    startingItems: ['dagger_t1', 'dagger_t1'],
    color: '#8d6bd6',
  },

  // ---- GDD_CLASSES_V2 (NC04): registry rows of the five new classes. Skills (NC10–NC20), models, items and minions
  // land in their own packages. Not selectable: their ids are NOT in PLAYABLE_CLASSES until those packages are merged.
  monk: {
    id: 'monk',
    name: 'Keşiş',
    desc: 'Silah yerine yumruğu, tekmeyi ve nefesi (Çi) kullanan sis tekkesinin dövüşçüsü. Kombolarını zincirler, yuvarlanıp sıçrar; demci olarak darbeleri erteler, rüzgâr yürüyen olarak durmadan vurur.',
    role: 'Tank / DPS / Çi Ustası',
    model: '/assets/models/characters/Barbarian.glb',
    resource: 'energy',
    resourceName: 'Enerji',
    baseStats: { str: 10, dex: 16, int: 8, vit: 14, resourceRegen: 10 },
    perLevel: { str: 1, dex: 4, int: 0, vit: 2 },
    hpPerLevel: 11,
    hpPerVit: 10,
    mainStat: 'dex',
    startResource: 1,
    weaponNodes: {
      show: [],
      hide: ['2H_Axe', '1H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Barbarian_Hat', 'Barbarian_Cape', 'Mug'],
    },
    basicAttack: 'monk_basic',
    skills: [
      'monk_tiger_palm', 'monk_chi_torpedo', 'monk_spinning_crane', 'monk_blackout_kick',
      'monk_flying_serpent', 'monk_chi_wave', 'monk_tigers_lust', 'monk_fists_of_fury',
    ],
    startingItems: ['fist_t1'],
    color: '#4fd1c5',
    resourceColor: '#e2c22a',
    tagline: 'Bedenin ve Ruhun Ustası',
    icon: 'buff-strength',
    armorWeight: 'medium',
    weapons: ['fist'],
    offhands: [],
    secondary: { id: 'chi', name: 'Çi', max: 5, color: '#5de0a8', icon: 'buff-haste', decay: { after: 8, every: 4 } },
    specs: ['monk_brewmaster', 'monk_windwalker', 'monk_mistweaver'],
    visual: {
      url: '/assets/models/characters/Barbarian.glb',
      paletteClass: 'barbarian',
      defaultVariant: 4,
      defaultTint: 0xffe2b0,
      show: [],
      hide: ['2H_Axe', '1H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Barbarian_Hat', 'Barbarian_Cape', 'Mug'],
      main: [],
      off: [],
    },
    voice: { pack: 'warrior', pitch: 1.08 },
    anims: { idle: 'Unarmed_Idle' },
    cameraProfile: 'melee',
    trait: {
      id: 'trait_flow',
      name: 'Akış',
      desc: '+%6 hareket hızı. Kaçış yuvarlanması 6 → 8 m; mükemmel kaçış +1 Çi; yuvarlanmadan sonraki ilk temel zincir +%20 saldırı hızı (2.5 sn).',
    },
    regenRule: 'default',
  },
  archer: {
    id: 'archer',
    name: 'Okçu',
    desc: 'Bozkırın yay ustası. Uzaktan vurur, geri sıçrar, tuzak kurar ve kurt yoldaşıyla avlanır. Hareketsiz durdukça Odağı hızla dolar.',
    role: 'Uzak Menzil · Avcı',
    model: '/assets/models/characters/Rogue.glb',
    resource: 'focus',
    resourceName: 'Odak',
    baseStats: { str: 8, dex: 18, int: 8, vit: 12, resourceRegen: 8 },
    perLevel: { str: 0, dex: 4, int: 0, vit: 2 },
    hpPerLevel: 9,
    hpPerVit: 9,
    mainStat: 'dex',
    startResource: 1,
    weaponNodes: {
      show: ['Rogue_Cape'],
      hide: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
    },
    basicAttack: 'archer_basic',
    skills: [
      'archer_aimed_shot', 'archer_disengage', 'archer_multishot', 'archer_call_pet',
      'archer_snare_trap', 'archer_explosive_arrow', 'archer_hunters_mark', 'archer_arrow_storm',
    ],
    startingItems: ['bow_t1', 'quiver_t1'],
    color: '#d9a441',
    resourceColor: '#d9a441',
    tagline: 'Rüzgârın Gözü',
    icon: 'class-ranger',
    armorWeight: 'medium',
    weapons: ['bow'],
    offhands: ['quiver'],
    specs: ['archer_marksman', 'archer_beastmaster', 'archer_survival'],
    visual: {
      url: '/assets/models/characters/Rogue.glb',
      paletteClass: 'rogue',
      defaultVariant: 2,
      defaultTint: 0xd8ffd0,
      show: ['Rogue_Cape'],
      hide: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
      main: [],
      off: [],
      attach: { bow: true, quiver: true },
    },
    voice: { pack: 'warrior', pitch: 1.18 },
    anims: { idle: 'Idle' },
    cameraProfile: 'ranged',
    autoAttack: 'ranged',
    trait: {
      id: 'trait_hawkeye',
      name: 'Şahin Gözü',
      desc: '+%15 kritik hasarı; hedef 12 m’den uzaktaysa +%10 hasar; temel atışlar koşarken de atılabilir.',
    },
    regenRule: 'still',
  },
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    desc: 'Kılıcı, topuzu ve kalkanıyla ışığa yemin etmiş zırhlı rahip. Koruma ile düşman dalgalarını durdurur, Kutsal ile ölmekte olan dostu geri çağırır, Ceza ile hüküm verir.',
    role: 'Tank · Şifacı · Savaşçı',
    model: '/assets/models/characters/Knight.glb',
    resource: 'faith',
    resourceName: 'İnanç',
    baseStats: { str: 14, dex: 8, int: 10, vit: 16, resourceRegen: 5 },
    perLevel: { str: 3, dex: 0, int: 1, vit: 3 },
    hpPerLevel: 11,
    hpPerVit: 10,
    mainStat: 'str',
    startResource: 1,
    weaponNodes: {
      show: ['1H_Sword', 'Badge_Shield', 'Knight_Helmet', 'Knight_Cape'],
      hide: ['Round_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword', '1H_Sword_Offhand'],
    },
    basicAttack: 'paladin_basic',
    // PM-PA (plate-melee §h): the 8 class skills; spec rows (Koruma / Kutsal / Ceza) come from SpecDef.skills
    skills: [
      // default bar slots rmb, q, e, s1, s2 (steed has its own), s3, m90, m180: L1 = chain + Yargı (builder) + Haçlı Darbesi (builder) +
      // Işığın Sözü (Kutsal Güç spender, heals yourself without an ally), so a level-1 paladin already has four working buttons
      'paladin_judgement', 'paladin_crusader_strike', 'paladin_word_of_glory', 'paladin_rebuke',
      'paladin_divine_steed', 'paladin_avengers_shield', 'paladin_avenging_wrath', 'paladin_divine_shield',
    ],
    startingItems: ['mace_t1', 'shield_t1'],
    color: '#fff0b8',
    resourceColor: '#ffe9a0',
    tagline: 'Işığın Yeminli Kılıcı',
    icon: 'class-cleric',
    armorWeight: 'heavy',
    weapons: ['sword1h', 'mace'],
    offhands: ['shield'],
    secondary: { id: 'holypower', name: 'Kutsal Güç', max: 5, color: '#ffe27a', icon: 'skill-holy-light' },
    specs: ['paladin_protection', 'paladin_holy', 'paladin_retribution'],
    visual: {
      url: '/assets/models/characters/Knight.glb',
      paletteClass: 'knight',
      defaultVariant: 4,
      defaultTint: 0xfff0c0,
      show: ['Badge_Shield', 'Knight_Helmet', 'Knight_Cape'],
      hide: ['Round_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword', '1H_Sword_Offhand'],
      main: ['1H_Sword'],
      off: [],
    },
    voice: { pack: 'warrior', pitch: 0.94 },
    anims: { idle: 'Idle' },
    cameraProfile: 'melee',
    trait: {
      id: 'trait_devotion',
      name: 'Adanmışlık',
      desc: '+%10 kutsal hasar, +%10 şifa gücü; bir vuruşu bloklamak +4 İnanç kazandırır.',
    },
    regenRule: 'default',
  },
  necromancer: {
    id: 'necromancer',
    name: 'Nekromant',
    desc: 'Ölümü hammadde sayan kuzgun kastının büyücüsü. Düşen düşmanların cesetlerini iskelete, patlamaya ya da laneti dönüştürür.',
    role: 'Çağırıcı · Ölüm Büyücüsü',
    model: '/assets/models/characters/Mage.glb',
    resource: 'essence',
    resourceName: 'Öz',
    // PM-NE: Öz (Runic Power) is earned by hitting, not regenerated (resourceRegen 0) and decays out of combat (Combat: regenRule 'rage' branch)
    baseStats: { str: 6, dex: 8, int: 18, vit: 14, resourceRegen: 0 },
    perLevel: { str: 0, dex: 1, int: 4, vit: 2 },
    hpPerLevel: 8,
    hpPerVit: 9,
    mainStat: 'int',
    startResource: 1,
    weaponNodes: {
      show: ['2H_Staff', 'Mage_Cape'],
      hide: ['1H_Wand', 'Spellbook', 'Spellbook_open', 'Mage_Hat'],
    },
    basicAttack: 'necro_basic',
    // PM-NE (plate-melee §h): the 8 class skills (Death Knight kit, Ordu Efendisi rows + shared utilities); spec rows come from SpecDef.skills.
    // The rune pip is TALENT_PIPS.rune (SkillSystem.activePips adds it for the class): no `secondary` row here.
    skills: [
      'necro_scourge_strike', 'necro_death_coil', 'necro_festering_strike', 'necro_deaths_advance',
      'necro_mind_freeze', 'necro_anti_magic_shell', 'necro_icebound_fortitude', 'necro_outbreak',
    ],
    startingItems: ['staff_t1'],
    color: '#9ee07a',
    resourceColor: '#6fe3b0',
    tagline: 'Kemiklerin Fısıltısı',
    icon: 'skill-summon-skeleton',
    armorWeight: 'light',
    weapons: ['staff', 'wand'],
    offhands: ['tome'],
    specs: ['necromancer_summoner', 'necromancer_bone', 'necromancer_frost'],
    visual: {
      url: '/assets/models/characters/Mage.glb',
      paletteClass: 'mage',
      defaultVariant: 5,
      defaultTint: 0xb8ffd8,
      show: ['Mage_Cape'],
      hide: ['Mage_Hat', '1H_Wand', 'Spellbook', 'Spellbook_open'],
      main: ['2H_Staff'],
      off: [],
    },
    voice: { pack: 'mage', pitch: 0.84 },
    anims: { idle: 'Idle' },
    cameraProfile: 'caster',
    trait: {
      id: 'trait_corpse_harvest',
      name: 'Ceset Hasadı',
      desc: 'Düşmanlar 10 sn ceset bırakır; bir ceseti tüketmek +8 Öz verir; minion hasarı +%15.',
    },
    regenRule: 'rage',
  },
  warlock: {
    id: 'warlock',
    name: 'Warlock',
    desc: 'Ruhunu bir iblise rehin bırakmış kızıl pakt büyücüsü. Acıyı zamanla bir silaha çevirir; canını manaya, ruh parçalarını kaosa dönüştürür.',
    role: 'Lanetler · İblis Yoldaşı',
    model: '/assets/models/characters/Rogue_Hooded.glb',
    resource: 'mana',
    resourceName: 'Mana',
    baseStats: { str: 6, dex: 8, int: 17, vit: 15, resourceRegen: 6 },
    perLevel: { str: 0, dex: 1, int: 4, vit: 2 },
    hpPerLevel: 8,
    hpPerVit: 9,
    mainStat: 'int',
    startResource: 1,
    weaponNodes: {
      show: ['Rogue_Cape'],
      hide: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
    },
    basicAttack: 'warlock_basic',
    skills: [
      'warlock_shadow_bolt', 'warlock_agony', 'warlock_corruption', 'warlock_demonic_circle',
      'warlock_dark_pact', 'warlock_spell_lock', 'warlock_unending_resolve',
    ],
    startingItems: ['staff_t1'],
    color: '#c05ae0',
    resourceColor: '#4f8bff',
    tagline: 'Karanlığın Sözleşmesi',
    icon: 'skill-curse',
    armorWeight: 'light',
    weapons: ['staff', 'wand'],
    offhands: ['tome'],
    secondary: { id: 'shard', name: 'Ruh Parçası', max: 50, scale: 10, color: '#b06bff', icon: 'skill-curse' },
    specs: ['warlock_affliction', 'warlock_destruction', 'warlock_demonology'],
    visual: {
      url: '/assets/models/characters/Rogue_Hooded.glb',
      paletteClass: 'rogue',
      defaultVariant: 1,
      defaultTint: 0xffb0c8,
      show: ['Rogue_Cape'],
      hide: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
      main: [],
      off: [],
      attach: { book: true },
    },
    voice: { pack: 'mage', pitch: 0.76 },
    anims: { idle: 'Idle' },
    cameraProfile: 'caster',
    trait: {
      id: 'trait_blood_pact',
      name: 'Kan Pakti',
      desc: '+%20 zamanla hasar; zamanla hasar tikleri canını %3 yeniler; iblisinin verdiği hasarın %10’u kadar can kazanırsın.',
    },
    regenRule: 'mana',
    manaScaling: true,
  },
  // ---- AE-3 / AE-4 (docs/kits/agile-evoker.md §3 / §4, WoW Midnight 12.0): İblis Avcısı (Kaos, İntikam, Yutucu) and Ejderhasoy
  // (Yıkım Nefesi, Koruyucu Nefes, Yüceltme). Registry rows; both classes are in PLAYABLE_CLASSES below.
  demonhunter: {
    id: 'demonhunter',
    name: 'İblis Avcısı (Demon Hunter)',
    desc: 'Gözleri bağlı, ruhu uyanık şeytani gazap avcısı. Kaos ile iki hançerle doğrar ve Göz Işını saçar, İntikam ile ruh parçacıklarını yutup en önde durur, Yutucu ile boşluğu çağırıp ruhları biçer. Çift zıplama ve süzülmeyle haritayı aşar.',
    role: 'Hız · Gazap Savaşçısı · Tank',
    model: '/assets/models/characters/Rogue_Hooded.glb',
    resource: 'fury',
    resourceName: 'Gazap',
    // Fel Bıçakları engine: class base regen (in combat only, decays out of combat: Combat.updateLocalPlayer 'fury' rule); specs add to it
    // (Kaos +5 = 10/s, İntikam +1 = 6/s, Yutucu +0 = 5/s). maxResource 100 (fixed pool).
    baseStats: { str: 6, dex: 17, int: 6, vit: 14, resourceRegen: 5, critChance: 0.04, moveSpeedPct: 0.05 },
    perLevel: { str: 0, dex: 4, int: 0, vit: 2 },
    hpPerLevel: 10,
    hpPerVit: 10,
    mainStat: 'dex',
    startResource: 0,
    weaponNodes: {
      show: ['Rogue_Cape'],
      hide: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
    },
    basicAttack: 'demonhunter_basic',
    // Pre-spec level bar (before the level-10 spec choice): Kaos Darbesi + Yakıp Yok Etme Aurası + Fel Atılışı are usable at level 1.
    skills: [
      'demonhunter_chaos_strike', 'demonhunter_blade_dance', 'demonhunter_eye_beam', 'demonhunter_immolation_aura',
      'demonhunter_fel_rush', 'demonhunter_blur', 'demonhunter_disrupt', 'demonhunter_metamorphosis',
    ],
    startingItems: ['dagger_t1', 'dagger_t1'],
    color: '#a330c9',
    resourceColor: '#9cff4a',
    tagline: 'Gözleri Bağlı, Ruhu Uyanık',
    icon: 'skill-claw-strike',
    armorWeight: 'medium',
    weapons: ['dagger'],
    offhands: ['dagger'],
    specs: ['demonhunter_chaos', 'demonhunter_vengeance', 'demonhunter_devourer'],
    visual: {
      url: '/assets/models/characters/Rogue_Hooded.glb',
      paletteClass: 'rogue',
      defaultVariant: 5,
      defaultTint: 0xa88ac8,
      show: ['Rogue_Cape'],
      hide: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
      main: [],
      off: [],
    },
    voice: { pack: 'warrior', pitch: 0.9 },
    anims: { idle: 'Idle' },
    cameraProfile: 'melee',
    trait: {
      id: 'trait_demonhunter',
      name: 'Karanlık Görüş',
      desc: '+%4 kritik şansı, +%5 hareket hızı. Havada ikinci kez zıplayabilir; düşerken zıplama tuşunu basılı tutarak süzülürsün.',
    },
    regenRule: 'fury',
  },
  evoker: {
    id: 'evoker',
    name: 'Ejderhasoy',
    desc: 'Ejderha soyunun çocuğu. Tuş basılı tutulan güçlendirilmiş nefesleriyle (Ateş Nefesi, Rüya Nefesi) hasar ve şifa saçar: Yıkım Nefesi ile ateş ve Öz ışınları, Koruyucu Nefes ile Geri Dönüş ve Yankı ağı, Yüceltme ile en iyi iki dostunun hasarını büyütür.',
    role: 'Menzilli · Yıkım / Şifa / Destek',
    model: '/assets/models/characters/Mage.glb',
    // Mana is the bar; Öz (essence) is a pip (PipId 'essence', regen 1 per 3.5 s / haste), see combat/skills/evokerKit.ts
    resource: 'mana',
    resourceName: 'Mana',
    baseStats: { str: 6, dex: 8, int: 18, vit: 14, resourceRegen: 5, maxHpPct: 0.05 },
    perLevel: { str: 0, dex: 1, int: 4, vit: 2 },
    hpPerLevel: 9,
    hpPerVit: 9,
    mainStat: 'int',
    startResource: 1,
    weaponNodes: {
      show: ['2H_Staff', 'Mage_Cape'],
      hide: ['1H_Wand', 'Spellbook', 'Spellbook_open', 'Mage_Hat'],
    },
    basicAttack: 'evoker_basic',
    // Pre-spec level bar: Yaşayan Alev, Parçala (Öz), Ateş Nefesi (empowered hold) and Süzül are usable at level 1-3.
    skills: [
      'evoker_living_flame', 'evoker_disintegrate', 'evoker_fire_breath', 'evoker_pyre',
      'evoker_hover', 'evoker_obsidian_scales', 'evoker_quell', 'evoker_dragonrage',
    ],
    startingItems: ['staff_t1'],
    color: '#33937f',
    resourceColor: '#4f8bff',
    tagline: 'Alevin ve Zamanın Çocuğu',
    icon: 'skill-fire-breath',
    armorWeight: 'light',
    weapons: ['staff', 'wand'],
    offhands: ['tome'],
    specs: ['evoker_devastation', 'evoker_preservation', 'evoker_augmentation'],
    visual: {
      url: '/assets/models/characters/Mage.glb',
      paletteClass: 'mage',
      defaultVariant: 2,
      defaultTint: 0x9fe6c8,
      show: ['Mage_Cape'],
      hide: ['Mage_Hat', '1H_Wand', 'Spellbook', 'Spellbook_open'],
      main: ['2H_Staff'],
      off: [],
    },
    voice: { pack: 'mage', pitch: 0.85 },
    anims: { idle: 'Idle' },
    cameraProfile: 'caster',
    autoAttack: 'ranged',
    trait: {
      id: 'trait_evoker',
      name: 'Ejder Kanı',
      desc: 'Maks. can +%5. Öz pipleri 3.5 saniyede bir kendiliğinden dolar (büyü hızıyla hızlanır).',
    },
    regenRule: 'mana',
    manaScaling: true,
  },
  // ---- CLASS SCAFFOLD (Rahip / Şaman / Druid): registry rows only. Skills, specs, items and models land with their kit packages.
  // Not selectable: their ids are NOT in PLAYABLE_CLASSES (or CLASS_ORDER / CLASS_IDS) until those packages are merged.
  priest: {
    id: 'priest',
    name: 'Rahip',
    desc: 'Kutsal ışığı şifa için, gölgeyi ise zihin ve hasar için kullanan rahip. Yoldaşlarını ayakta tutar; Gölge yolunda zihni ayartır ve Delilik biriktirir.',
    role: 'Şifa · Gölge',
    model: '/assets/models/characters/Mage.glb',
    resource: 'mana',
    resourceName: 'Mana',
    baseStats: { str: 6, dex: 8, int: 18, vit: 12, resourceRegen: 6 },
    perLevel: { str: 0, dex: 0, int: 4, vit: 2 },
    hpPerLevel: 9,
    hpPerVit: 9,
    mainStat: 'int',
    startResource: 1,
    weaponNodes: {
      show: ['2H_Staff', 'Mage_Cape'],
      hide: ['1H_Wand', 'Spellbook', 'Spellbook_open', 'Mage_Hat'],
    },
    basicAttack: 'priest_basic',
    skills: ['priest_power_word_shield', 'priest_flash_heal', 'priest_smite', 'priest_renew', 'priest_dispel', 'priest_psychic_scream', 'priest_desperate_prayer', 'priest_fade'],
    startingItems: ['staff_t1'],
    color: '#ffffff',
    resourceColor: '#3d7bd9',
    tagline: 'Kutsal Işık ve Gölge',
    icon: 'skill-holy-light',
    armorWeight: 'light',
    weapons: ['staff', 'wand', 'mace'],
    offhands: ['tome'],
    secondary: { id: 'insanity', name: 'Delilik', max: 100, scale: 20, color: '#8a3bd1', icon: 'debuff-curse' },
    specs: ['priest_discipline', 'priest_holy', 'priest_shadow'],
    visual: {
      url: '/assets/models/characters/Mage.glb',
      paletteClass: 'mage',
      defaultVariant: 0,
      defaultTint: 0xffffff,
      show: ['Mage_Cape'],
      hide: ['Mage_Hat', '1H_Wand', 'Spellbook', 'Spellbook_open'],
      main: ['2H_Staff'],
      off: [],
    },
    cameraProfile: 'caster',
    regenRule: 'default',
    manaScaling: true,
  },
  shaman: {
    id: 'shaman',
    name: 'Şaman',
    desc: 'Elementlerin ve ruhların sesini duyan şaman. Yıldırım ve toprağı savurur, geliştirme yolunda silahına elementleri üfler, restorasyonda ruhları şifaya çağırır.',
    role: 'Elementler · Geliştirme · Şifa',
    model: '/assets/models/characters/Mage.glb',
    resource: 'mana',
    resourceName: 'Mana',
    baseStats: { str: 10, dex: 10, int: 14, vit: 14, resourceRegen: 8 },
    perLevel: { str: 1, dex: 1, int: 2, vit: 2 },
    hpPerLevel: 10,
    hpPerVit: 10,
    mainStat: 'int',
    startResource: 1,
    weaponNodes: {
      show: [],
      hide: ['2H_Staff', '1H_Wand', 'Spellbook', 'Spellbook_open', 'Mage_Hat'],
    },
    basicAttack: 'shaman_basic',
    skills: ['shaman_lightning_bolt', 'shaman_ghost_wolf', 'shaman_wind_shear', 'shaman_bloodlust', 'shaman_astral_shift', 'shaman_hex'],
    startingItems: ['mace_t1'],
    color: '#0070dd',
    resourceColor: '#3d7bd9',
    tagline: 'Ruhların ve Elementlerin Sesi',
    icon: 'skill-lightning-bolt',
    armorWeight: 'medium',
    weapons: ['mace', 'axe1h'],
    offhands: ['shield'],
    secondary: { id: 'maelstrom', name: 'Girdap', max: 100, scale: 20, color: '#2aa6ff', icon: 'skill-thunderstorm' },
    specs: ['shaman_elemental', 'shaman_enhancement', 'shaman_restoration'],
    visual: {
      url: '/assets/models/characters/Mage.glb',
      paletteClass: 'mage',
      defaultVariant: 3,
      defaultTint: 0x0070dd,
      show: [],
      hide: ['Mage_Hat', '1H_Wand', 'Spellbook', 'Spellbook_open', '2H_Staff'],
      main: [],
      off: [],
    },
    cameraProfile: 'caster',
    regenRule: 'default',
    manaScaling: true,
  },
  druid: {
    id: 'druid',
    name: 'Druid',
    desc: 'Doğanın ve biçim değiştirmenin ustası. Ay ışığıyla büyü yapar, ayıya, kurda ya da kuşa dönüşür; yıkıcı bir yol da iyileştiren bir yol da seçebilir.',
    role: 'Biçim Değiştiren · Hibrit',
    model: '/assets/models/characters/Rogue_Hooded.glb',
    resource: 'mana',
    resourceName: 'Mana',
    baseStats: { str: 8, dex: 12, int: 14, vit: 14, resourceRegen: 8 },
    perLevel: { str: 1, dex: 2, int: 2, vit: 2 },
    hpPerLevel: 10,
    hpPerVit: 10,
    mainStat: 'int',
    startResource: 1,
    weaponNodes: {
      show: ['Rogue_Cape'],
      hide: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
    },
    basicAttack: 'druid_basic',
    // KIT Druid: the 8 core skills in default-bar order (rmb wrath, q moonfire, e rejuvenation, s1 cat form, s2 regrowth, s3 bear form,
    // bench barkskin, r travel form), then the form sets that replace the caster buttons in Kedi / Ayı (data/skillsets/druid.ts). L1 bar:
    // basic + Güneş Gazabı + Ay Ateşi + Gençleşme + Kedi Biçimi.
    skills: [
      'druid_wrath', 'druid_moonfire', 'druid_rejuvenation', 'druid_cat_form', 'druid_regrowth', 'druid_bear_form', 'druid_barkskin', 'druid_travel_form',
      'druid_shred', 'druid_rake', 'druid_ferocious_bite', 'druid_mangle', 'druid_thrash', 'druid_ironfur',
    ],
    startingItems: ['staff_t1'],
    color: '#ff7c0a',
    resourceColor: '#3d7bd9',
    tagline: 'Doğanın Biçim Değiştireni',
    icon: 'buff-regen',
    armorWeight: 'medium',
    weapons: ['staff', 'dagger', 'mace'],
    offhands: [],
    secondary: { id: 'astral_power', name: 'Astral Güç', max: 100, scale: 20, color: '#8ab8ff', icon: 'buff-mana-regen' },
    specs: ['druid_balance', 'druid_feral', 'druid_guardian', 'druid_restoration'],
    visual: {
      url: '/assets/models/characters/Rogue_Hooded.glb',
      paletteClass: 'rogue',
      defaultVariant: 4,
      defaultTint: 0xff7c0a,
      show: ['Rogue_Cape'],
      hide: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
      main: [],
      off: [],
    },
    cameraProfile: 'caster',
    regenRule: 'default',
    manaScaling: true,
  },
};

export const CLASS_IDS: ClassId[] = ['knight', 'barbarian', 'mage', 'rogue'];

/**
 * Classes the character-creation screen offers: the four KayKit classes, the paladin (Knight rig, golden palette variant), the
 * necromancer (Mage rig) and the warlock (Rogue rig), WP-01. The other new classes join when their skills, model and items are merged
 * (GDD_CLASSES_V2 §13.1 / NC60).
 */
export const PLAYABLE_CLASSES: readonly ClassId[] = ['knight', 'barbarian', 'mage', 'rogue', 'paladin', 'necromancer', 'warlock', 'monk', 'archer', 'shaman', 'demonhunter', 'evoker', 'priest', 'druid'];
export const isPlayableClass = (id: ClassId): boolean => (PLAYABLE_CLASSES as readonly string[]).includes(id);
export const getClass = (id: ClassId): ClassDefX => CLASSES[id];

/** Skill unlock levels in order (GDD 2.0 loadout rules). */
export const SKILL_UNLOCK_LEVELS = [1, 3, 6, 10, 15, 20, 25, 30];

/**
 * Default bar slots by unlock order: L1 -> RMB, L3 -> Q, L6 -> E, L10 -> 1, L15 -> 2, L20 -> 3, L25 -> book (no slot), L30 -> R.
 * Used by CharacterState.create / Progression when a skill unlocks, and by SkillSystem as a fallback when the
 * saved skillBar has no entry for a slot.
 */
export const DEFAULT_SLOT_ORDER: (SkillSlotKey | null)[] = ['rmb', 'q', 'e', 's1', 's2', 's3', null, 'r'];

/** Default skill bar of a class for a character level (only unlocked skills). `lmb` is always the basic attack. */
export function defaultSkillBar(classId: ClassId, level = 60): Partial<Record<SkillSlotKey, string>> {
  const c = CLASSES[classId];
  const bar: Partial<Record<SkillSlotKey, string>> = { lmb: c.basicAttack };
  c.skills.forEach((id, i) => {
    const slot = DEFAULT_SLOT_ORDER[i];
    if (slot && level >= SKILL_UNLOCK_LEVELS[i]) bar[slot] = id;
  });
  return bar;
}
