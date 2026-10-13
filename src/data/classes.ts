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
  regenRule?: 'default' | 'mana' | 'rage' | 'still';
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
      'knight_shield_bash', 'knight_charge', 'knight_radiant_cleave', 'knight_challenge',
      'knight_shield_wall', 'knight_consecration', 'knight_war_banner', 'knight_heavens_judgment',
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
      'barbarian_cleave', 'barbarian_leap', 'barbarian_whirlwind', 'barbarian_war_cry',
      'barbarian_fissure', 'barbarian_axe_throw', 'barbarian_blood_rage', 'barbarian_ancestral_tempest',
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
    ],
    startingItems: ['staff_t1'],
    color: '#6aa8ff',
  },
  rogue: {
    id: 'rogue',
    specs: ['rogue_assassin', 'rogue_alchemist', 'rogue_subtlety'],
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
      'rogue_shadow_step', 'rogue_fan_of_knives', 'rogue_eviscerate', 'rogue_vanish',
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
    specs: ['monk_brewmaster', 'monk_windwalker'],
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
    specs: ['archer_marksman', 'archer_beastmaster'],
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
    specs: ['necromancer_summoner', 'necromancer_bone'],
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
    specs: ['warlock_affliction', 'warlock_destruction'],
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
  // ---- CORE_MECHANICS §2 (CM1): compile-only registry rows of the two new classes. NOT selectable (PLAYABLE_CLASSES below),
  // no skills, items or spec rows yet: the kits arrive with CM10 (design) / CM12 (WoW-faithful kits). Numbers are placeholders.
  demonhunter: {
    id: 'demonhunter',
    name: 'İblis Avcısı',
    desc: 'Gözünü şeytani bir nefretle açan avcı. İki hançerle ve kanatlarıyla hızlıca yer değiştirir; düşman ateşiyle beslenir.',
    role: 'Hız · Gazap Savaşçısı',
    model: '/assets/models/characters/Rogue_Hooded.glb',
    resource: 'fury',
    resourceName: 'Gazap',
    baseStats: { str: 6, dex: 17, int: 6, vit: 14, resourceRegen: 6 },
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
    skills: [],
    startingItems: [],
    color: '#a330c9',
    resourceColor: '#b8ff3a',
    tagline: 'Şeytani Öfkenin Avcısı',
    icon: 'skill-claw-strike',
    armorWeight: 'medium',
    weapons: ['sword1h', 'dagger'],
    offhands: ['dagger'],
    specs: ['demonhunter_chaos', 'demonhunter_vengeance'],
    visual: {
      url: '/assets/models/characters/Rogue_Hooded.glb',
      paletteClass: 'rogue',
      defaultVariant: 1,
      show: ['Rogue_Cape'],
      hide: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
      main: [],
      off: [],
    },
    cameraProfile: 'melee',
    regenRule: 'default',
  },
  evoker: {
    id: 'evoker',
    name: 'Ejderhasoy',
    desc: 'Ejderha soyunun son büyücüsü. Tunç ve yeşil nefesiyle yakın ve uzak düşmanları yakar; müttefiklerini kanatlarının altına alır.',
    role: 'Ejderha Nefesi · Destek',
    model: '/assets/models/characters/Mage.glb',
    resource: 'essence',
    resourceName: 'Öz',
    baseStats: { str: 6, dex: 8, int: 18, vit: 14, resourceRegen: 6 },
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
    skills: [],
    startingItems: ['staff_t1'],
    color: '#33937f',
    resourceColor: '#d9a441',
    tagline: 'Ejderhanın Nefesi',
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
export const PLAYABLE_CLASSES: readonly ClassId[] = ['knight', 'barbarian', 'mage', 'rogue', 'paladin', 'necromancer', 'warlock'];
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
