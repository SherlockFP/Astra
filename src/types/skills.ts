import type { ClassId, DamageType, EntityId, PipId, ResourceType } from './common';
import type { StatBlock } from './stats';
import type { VfxId } from './vfx';
import type { SfxId } from './audio';
import type { SpecId } from './v2';

/** `m45` / `m90` / `m180` = GDD_V2 major cooldown slots (§2), appended by WP1. */
/** `m45` / `m90` / `m180` = GDD_V2 major cooldown slots (§2), appended by WP1. `s4` = G (CORE_MECHANICS §10.1, CM1 / CM12: interrupt / utility). */
export type SkillSlotKey = 'lmb' | 'rmb' | 'q' | 'e' | 'r' | 's1' | 's2' | 's3' | 's4' | 'm45' | 'm90' | 'm180';
export const SKILL_SLOT_KEYS: SkillSlotKey[] = ['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4', 'm45', 'm90', 'm180'];

export type SkillTargeting =
  | 'melee_arc'     // instant arc in front: range + arc (deg)
  | 'projectile'    // count/spread/speed/radius/pierce
  | 'ground_aoe'    // at aim point (clamped to range), radius, optional delay
  | 'self_aoe'      // around caster, radius
  | 'self_buff'     // applies statuses to self (or party within radius)
  | 'dash'          // move caster forward `range` over `duration`, hitting along the path
  | 'leap'          // jump to aim point, AoE on landing
  | 'beam'          // channeled line
  | 'teleport'      // blink to aim point
  | 'summon'
  | 'custom'        // behavior key implemented in combat/skills/
  // COMBAT_WOW / CORE_MECHANICS §10.2 (CM1, append-only): aimed at the hard/soft target instead of the aim point.
  | 'target_projectile' // spawned toward the target with `homing` turn rate; flies straight along the aim with no target
  | 'target_instant';   // hits the target if in range and line of sight; melee ones lunge up to 3 m extra

export interface StatusApply {
  status: StatusId;
  duration: number;           // seconds
  chance?: number;            // 0..1, default 1
  stacks?: number;
  magnitude?: number;         // slow %, dot dps coefficient, shield amount, etc. (meaning per status)
  /** Precomputed damage per second for dots, filled by the ATTACKER's machine (host ticks it on enemies). */
  dps?: number;
  /** combat module: stack cap override for this application (Zehir Ustası: poison cap +5). */
  maxStacks?: number;
}

export interface SkillDef {
  id: string;
  classId: ClassId | 'common';
  name: string;               // Turkish
  desc: string;               // Turkish, may contain {dmg} {dur} placeholders for tooltips
  icon: string;               // /assets/icons/*.svg
  unlockLevel: number;
  defaultSlot?: SkillSlotKey;
  /** GDD_V2 §A: spec-bound skill (undefined = class skill). */
  spec?: SpecId;
  cost: number;               // resource cost (negative = generates resource)
  cooldown: number;           // seconds
  charges?: number;
  castTime: number;           // 0 = instant (still plays anim; effect at hitTime)
  channel?: number;           // channel duration
  hitTime?: number;           // seconds after start when the effect fires (instant skills)
  lockMovement?: boolean;     // root while casting
  anim: string;               // KayKit clip name
  animSpeed?: number;
  targeting: SkillTargeting;
  range?: number;
  radius?: number;
  arc?: number;               // degrees
  speed?: number;
  count?: number;
  spread?: number;            // degrees between projectiles
  pierce?: number;
  duration?: number;          // dash/beam/ground effect duration
  ticks?: number;             // for ground effects / channels
  damage?: { coef: number; type: DamageType; flat?: number; perTick?: boolean };
  heal?: { coef: number; flat?: number };
  statuses?: StatusApply[];   // applied to targets hit
  selfStatuses?: StatusApply[];
  knockback?: number;
  tags: string[];             // 'melee' 'spell' 'aoe' 'projectile' 'movement' 'fire' ... used by talents
  vfx?: { cast?: VfxId; projectile?: VfxId; impact?: VfxId; ground?: VfxId; trail?: VfxId };
  sfx?: { cast?: SfxId; impact?: SfxId };
  behavior?: string;          // custom behavior id (combat/skills registry)
  params?: Record<string, number>;
  // ---- GDD_CLASSES_V2 §1.1 (NC02, append-only). All optional: existing rows stay valid.
  /** Secondary pip counter (Çi, Kutsal Güç, Ruh Parçası, Kombo): `gain` on cast, `cost` / `min` / `consume` on spend (SkillSystem.pay). */
  pip?: { id: PipId; gain?: number; cost?: number; min?: number; consume?: 'all' | number; coefPerPip?: number };
  /** Skill-to-skill route (GDD_CLASSES_V2 §1.4). `from`: skill ids, '@<tag>' or '@status:<id>'; `window` seconds. */
  route?: { from: string[]; window: number; more?: number; free?: boolean; refund?: { skill: string; sec: number }; pipGain?: number; pipCostDelta?: number };
  /** Summon (SkillSystem / behaviours minion_summon). `id` = minion def id ('auto' = class default). */
  minion?: { id: string; count: number; cap?: number; group?: string; life?: number; ignoreCap?: boolean; cycle?: string[] };
  /** Toggle / cycle aura (Paladin): radius in metres, status cycle, re-apply interval in seconds. */
  aura?: { radius: number; cycle: StatusId[]; interval: number };
  /** Ally/heal targeting hint for V2's smart resolver: 'friendly' = injured ally priority, 'any' = enemy or ally by reticle. */
  allyTarget?: 'friendly' | 'any';
  /** Clips alternated per tick or hit (e.g. Cennet Yumrukları). */
  animCycle?: string[];
  /** Loop played while a charge / channel key is held. */
  holdAnim?: string;
  // ---- COMBAT_WOW / CORE_MECHANICS §10.3 (CM1, append-only). All optional; existing rows stay valid.
  /** Gating: needs a status on the caster, a position behind the target, or a target kind (CORE_MECHANICS §10.3). */
  requires?: { selfStatus?: StatusId; behind?: boolean; target?: 'enemy' | 'ally' };
  /** Proc-instant: while `status` is up the cast is instant (castTime 0); `consume` removes the status on cast (Sıcak Seri). */
  procInstant?: { status: StatusId; consume: boolean };
  /** Button transform: while `whileStatus` is up this slot casts `skill` instead (Gölge Vuruşu replaces Sırttan Bıçak). */
  replaces?: { skill: string; whileStatus: StatusId };
  /** Off the global cooldown (WoW off-GCD): casting it does not start or wait for the GCD. */
  offGcd?: boolean;
  /** Homing turn rate in rad/s for `target_projectile` (bolts 5, Kaos Oku 4, missiles 9). */
  homing?: number;
  // ---- PM-KN / PM-BA (plate-melee §g, append-only). Object-valued rules: `params` is numeric only, so they live here.
  /** Non-consuming damage multiplier while `status` is up on the caster when the cast starts (Kalkan Darbesi x1.3 under shield_block). */
  whileStatusMult?: { status: StatusId; mult: number };
  /** Rider: a cast that hits at least `n` enemies applies `status` to the caster for `dur` s (Çelik Girdap -> sweeping at 3+). */
  onHitsAtLeast?: { n: number; status: StatusId; dur: number };
  /** Statuses removed from the caster when the cast is paid (Savaş Avatarı cleanses root and slow). */
  cleanses?: StatusId[];
  /** Cooldown group: casting one skill starts the cooldown of every skill with the same `sharedCd` (Kan Susuzluğu / Kan Banyosu). */
  sharedCd?: string;
}

export type StatusId =
  | 'stun' | 'slow' | 'root' | 'freeze' | 'knockdown' | 'silence' | 'fear'
  | 'burn' | 'bleed' | 'poison' | 'chill' | 'shock' | 'curse' | 'sunder'
  | 'shield' | 'haste' | 'enrage' | 'regen' | 'fortify' | 'invulnerable' | 'stealth' | 'empower'
  | 'bolstered' | 'raging' | 'bursting' | 'necrotic' | 'grievous' | 'inspiring' | 'fortified_aura' | 'tyrannical_aura'
  | 'iframes' | 'potion_cd' | 'taunt'
  // combat module additions (append-only): blind = 50% miss, banner/blessed/bloodrage/venom/ambush = class skill buffs,
  // act_slow/act_root = INTERNAL hidden movement locks applied by SkillSystem while swinging (never shown in the HUD)
  | 'blind' | 'banner' | 'blessed' | 'bloodrage' | 'venom' | 'ambush' | 'act_slow' | 'act_root' | 'balance' | 'windrunner' | 'veil' | 'dancer'
  // mythic module additions (append-only; registered at runtime by systems/Affixes.ts): Efsunlu Yarik blessings + possessed pack
  | 'blessing_kor' | 'blessing_ayaz' | 'blessing_golge' | 'efsunlu'
  // combat module addition (append-only): Metin tier 5-6 rot, 1% max HP/s per stack, non-lethal below 25% HP (data/statuses.ts)
  | 'kirlenme'
  // GDD_V2 §0.3 (WP1 contracts): every id needs a StatusDef in data/statuses.ts (WP5). Durations/numbers live in the doc.
  | 'guard' | 'riposte' | 'guard_broken' | 'critbuff' | 'shield_block' | 'oath_ward' | 'bastion' | 'aegis' | 'iron_stance'
  | 'blood_shield' | 'last_stand' | 'rally' | 'zeal' | 'wings' | 'carnage' | 'icy_veins' | 'combustion' | 'shadow_blades'
  | 'shadow_veil_cd' | 'clarity' | 'dawn_hot' | 'renew' | 'overheal_ward' | 'brew_zone' | 'elixir_regen' | 'hero_haste' | 'sated'
  | 'weakness_chain' | 'shielded_poise' | 'marked_crit' | 'armored' | 'cursed_zone' | 'consecrated'
  // GDD_CLASSES_V2 §1.1 / §10 (NC02): each id needs a StatusDef + STATUS_RULES entry (NC21 / NC22, data/statuses.ts)
  | 'chi_flow' | 'tigerlust' | 'tigerfury' | 'fortifying' | 'brewed' | 'stagger_pool' | 'hunters_mark' | 'deadeye'
  | 'trueshot' | 'wild_wrath' | 'judged' | 'forbearance' | 'aura_devotion' | 'aura_might' | 'aura_clarity' | 'righteous'
  | 'wrath_wings' | 'bulwark' | 'ardent' | 'aura_mastery' | 'crusade' | 'sentenced' | 'curse_decay' | 'bone_armor'
  | 'frenzy_minions' | 'lich' | 'agony' | 'corruption' | 'unstable_affliction' | 'immolate' | 'seed' | 'havoc' | 'soul_misery'
  // GDD_TALENTS §0.4 (T0): 13 ids. Each needs a StatusDef (data/statuses_talents.ts, merged into STATUSES; T8 / T9).
  | 'hot_streak' | 'fingers_of_frost' | 'touch_of_magi' | 'arcane_surge' | 'blazing_barrier' | 'intercept_ward'
  | 'guardian_vow' | 'karma_ward' | 'spirit_walk' | 'feign_death' | 'cloak_ward' | 'resolve_pact' | 'ice_block'
  // COMBAT_WOW §3 / Appendix B (CW-03, append-only): proc states and the school lockout. StatusDefs in data/statuses_talents.ts.
  // hot_streak and fingers_of_frost (above) are the existing procs; these are the new ones.
  | 'heating_up' | 'brain_freeze' | 'winters_chill' | 'clearcasting' | 'art_of_justice' | 'revenge_ready' | 'sudden_death'
  | 'wrath_return' | 'opportunity' | 'lockout'
  // Season 1 shared primitives P-21 / P-18 (K1, append-only; StatusDef rows arrive in K4 / data/statuses.ts)
  | 'petrify' | 'mortal_wound' | 'disguise' | 'bewitch' | 'exposed' | 'kin_laneti' | 'asit_yarasi'
  | 'arcane_lockdown' | 'withering_soul' | 'deep_wound' | 'ys_intensity' | 'ay_cesmesi'
  | 'mead_sticky' | 'rod_charged'
  // ---- KIT PK-0 (docs/kits/casters-rogue.md §g, append-only): mage / rogue / warlock kit statuses. StatusDef rows live in
  // data/statuses_kit_<class>.ts (`freezing` is max 12, `arcane_salvo` max 20, `pyroclasm` 2 stacks, `backdraft` 2 stacks).
  // aoe_mode / exec_window are hidden watcher statuses (data/watchers.ts).
  | 'arcane_salvo' | 'prismatic_ready' | 'pyroclasm' | 'icicles' | 'glacial_ready' | 'comet_ready' | 'freezing_rain'
  | 'freezing' | 'prismatic_barrier' | 'ice_barrier'
  | 'garrote' | 'rupture' | 'kingsbane' | 'deathmark' | 'darkest_night' | 'improved_garrote' | 'find_weakness'
  | 'shadow_technique' | 'shadowstep_haste' | 'behind_grace' | 'feint' | 'goremaw' | 'alchemy_link' | 'elixir_ramp'
  | 'brew_boost' | 'ascendant'
  // KIT Druid (append-only): shapeshift forms (combat/Forms.ts), Denge / Vahşi / Koruyucu / Restorasyon statuses. StatusDefs in data/statuses_kit_druid.ts.
  | 'form_moonkin' | 'form_cat' | 'form_bear' | 'form_travel' | 'eclipse_solar' | 'eclipse_lunar' | 'moonfire' | 'sunfire'
  | 'celestial_alignment' | 'rake' | 'rip' | 'thrash' | 'feral_fury' | 'berserk' | 'cat_dash' | 'ironfur' | 'barkskin' | 'frenzied'
  | 'survival_instincts' | 'sleeper_rage' | 'rejuvenation' | 'regrowth' | 'lifebloom' | 'wild_growth' | 'ironbark' | 'omen_clarity'
  | 'haunt' | 'malevolence' | 'darkglare_active' | 'backdraft' | 'fiendish_cruelty' | 'dark_pact'
  | 'aoe_mode' | 'exec_window'
  // Kibir Tecessumu (P-27, append-only): Kibirli elite buff (+dmg, +move speed). StatusDef + STATUS_RULES registered by systems/Affixes.ts.
  | 'kibirli'
  // Taşkasa (SP-21, append-only): boss and mechanic statuses, StatusDefs + STATUS_RULES rows in data/statuses.ts (docs/dungeons/taskasa.md §9).
  | 'seismic_echo' | 'seismic_ward' | 'earth_fracture' | 'unstable_energy' | 'void_mark' | 'void_corruption'
  // Yiğitler Sarayı / Leş Uyanışı (SP-05, append-only): StatusDefs + STATUS_RULES rows in data/statuses.ts (YS_LU block).
  | 'holy_scorch' | 'aegis_ward' | 'odyn_favor' | 'odyn_blessing' | 'rune_blessed' | 'bear_snare' | 'heal_cut' | 'heal_absorb'
  | 'tank_stack' | 'frost_mark' | 'morbid_fixation' | 'exile_cold' | 'champion_boon' | 'weapon_mark' | 'anima_exhaust'
  // PM-00a (docs/kits/plate-melee.md §g 'New StatusIds'): plate-melee kit statuses. StatusDefs + STATUS_RULES in data/statuses_kit_plate.ts.
  // (sudden_death, revenge_ready, mortal_wound, exec_window are already in the union above; exec_window is defined in data/watchers.ts.)
  | 'battlelord' | 'colossus' | 'sweeping' | 'avatar' | 'die_by_sword' | 'rend' | 'meat_cleaver' | 'gore'
  | 'gory_maul' | 'gory_iron' | 'ursoc_form' | 'shining_light' | 'infusion_of_light' | 'art_of_war' | 'hammer_window'
  | 'templar_combo' | 'divine_steed' | 'blood_plague' | 'vampiric_blood' | 'dancing_rune_weapon' | 'icebound'
  | 'anti_magic_shell' | 'deaths_advance' | 'vile_contagion' | 'virulent_plague' | 'sudden_doom' | 'dark_transformation' | 'army'
  // WP-02 Okçu kit (append-only): quick_draw (Geri Sıçrayış window for a full-charge Nişanlı Atış), survivor_ward (Son Siper).
  // hunters_mark, deadeye, trueshot, wild_wrath are in the union above. StatusDefs in data/statuses_kit_archer.ts.
  | 'quick_draw' | 'survivor_ward'
  // KIT Keşiş (monk, append-only): the chi/stagger statuses already above (chi_flow, tigerlust, tigerfury, fortifying, brewed,
  // stagger_pool) get StatusDefs in data/statuses_kit_monk.ts; these five are new monk-only ids.
  | 'fists_guard' | 'rising_sun' | 'thunder_tea' | 'renewing_mist' | 'enveloping_mist'
  // KIT Şaman (shaman, append-only): StatusDefs in data/statuses_kit_shaman.ts.
  | 'ghost_wolf' | 'stormkeeper' | 'unleash' | 'bloodlust' | 'swiftness' | 'riptide' | 'rain_hot' | 'stream_totem'
  // Şaman rework (append-only): Astral Shift (40 % damage reduction) and Hex (hard incapacitate)
  | 'astral_shift' | 'hex'
  // AE-3 (docs/kits/agile-evoker.md §3, WoW Midnight Devourer added): İblis Avcısı. StatusDefs in data/statuses_kit_demonhunter.ts.
  | 'metamorphosis' | 'metamorphosis_v' | 'void_meta' | 'initiative' | 'exergy' | 'essence_break' | 'chaos_brand' | 'blur'
  | 'soul_overflow' | 'demon_spikes' | 'fiery_brand' | 'frailty' | 'the_hunt' | 'collapsing_star' | 'darkness' | 'sigil_flame'
  | 'immolation' | 'void_ray_mark' | 'fel_rush_guard' | 'soul_feast'
  // AE-4 (docs/kits/agile-evoker.md §4): Ejderhasoy. StatusDefs in data/statuses_kit_evoker.ts.
  | 'essence_burst' | 'leaping_flames' | 'burnout' | 'iridescence' | 'tip_scales' | 'dragonrage' | 'unbound_flame' | 'hover'
  | 'obsidian' | 'merithras_blessing' | 'echo' | 'twin_echoes' | 'lifebind' | 'stasis' | 'time_dilation' | 'ebon_might'
  | 'prescience' | 'temporal_wound' | 'bronze_blessing' | 'reversion' | 'dream_breath' | 'empowering' | 'fire_breath_burn'
  // KIT Rahip (priest, append-only): Atonement mark, Acı Bastırma, the two Shadow DoTs and Boşluk Formu. StatusDefs in data/statuses_kit_priest.ts.
  | 'atonement' | 'pain_suppression' | 'shadow_word_pain' | 'vampiric_touch' | 'voidform'
  // KIT Büyücü (mage, append-only): Zaman Bükme and Büyü Çağırma. StatusDefs in data/statuses_kit_mage.ts.
  | 'time_warp' | 'evocation';

export interface StatusDef {
  id: StatusId;
  name: string;               // Turkish
  icon: string;
  kind: 'buff' | 'debuff';
  cc?: boolean;               // crowd control (blocked on bosses unless flagged)
  maxStacks?: number;
  dotType?: DamageType;       // periodic damage
  stats?: StatBlock;          // per stack stat modifiers (e.g. slow: moveSpeedPct -0.3)
  vfx?: VfxId;                // looping effect on the actor while active
  dispellable?: boolean;
  /** combat module: never listed by StatusEffects.list() (internal movement locks). */
  hidden?: boolean;
  /** COMBAT_WOW §3 (CW-03, append-only): nominal duration in seconds for statuses applied by procs. The applying code may override it. */
  defaultDuration?: number;
}

/** Runtime aim info produced by PlayerController from the camera. */
export interface AimInfo {
  point: [number, number, number];  // world point under crosshair/cursor (ground or enemy)
  dir: [number, number, number];    // normalized horizontal direction from caster to point
  targetId: EntityId | null;        // soft/hard target
  /** GDD_V2 §A: friendly target for ally-targeted heals (smart heal resolver / F1-F5 / U). */
  allyId?: EntityId | null;
}

export interface ClassDef {
  id: ClassId;
  name: string;               // Turkish
  desc: string;
  model: string;              // /assets/models/characters/Knight.glb
  resource: ResourceType;     // GDD_CLASSES_V2 §1.2 widened the union (focus / faith / essence)
  resourceName: string;
  baseStats: StatBlock;       // at level 1
  perLevel: StatBlock;        // added per level
  weaponNodes: { show: string[]; hide: string[] }; // KayKit child meshes to show/hide by default
  basicAttack: string;        // skill id
  skills: string[];           // skill ids in unlock order
  startingItems: string[];    // item base ids
  color: string;              // UI accent
}
