import type { ClassId, DamageType, EntityId, PipId, ResourceType } from './common';
import type { StatBlock } from './stats';
import type { VfxId } from './vfx';
import type { SfxId } from './audio';
import type { SpecId } from './v2';

/** `m45` / `m90` / `m180` = GDD_V2 major cooldown slots (§2), appended by WP1. */
export type SkillSlotKey = 'lmb' | 'rmb' | 'q' | 'e' | 'r' | 's1' | 's2' | 's3' | 'm45' | 'm90' | 'm180';
export const SKILL_SLOT_KEYS: SkillSlotKey[] = ['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3', 'm45', 'm90', 'm180'];

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
  | 'custom';       // behavior key implemented in combat/skills/

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
  | 'weakness_chain' | 'shielded_poise' | 'marked_crit' | 'armored' | 'cursed_zone'
  // GDD_CLASSES_V2 §1.1 / §10 (NC02): each id needs a StatusDef + STATUS_RULES entry (NC21 / NC22, data/statuses.ts)
  | 'chi_flow' | 'tigerlust' | 'tigerfury' | 'fortifying' | 'brewed' | 'stagger_pool' | 'hunters_mark' | 'deadeye'
  | 'trueshot' | 'wild_wrath' | 'judged' | 'forbearance' | 'aura_devotion' | 'aura_might' | 'aura_clarity' | 'righteous'
  | 'wrath_wings' | 'bulwark' | 'ardent' | 'aura_mastery' | 'crusade' | 'sentenced' | 'curse_decay' | 'bone_armor'
  | 'frenzy_minions' | 'lich' | 'agony' | 'corruption' | 'unstable_affliction' | 'immolate' | 'seed' | 'havoc' | 'soul_misery'
  // GDD_TALENTS §0.4 (T0): 13 ids. Each needs a StatusDef (data/statuses_talents.ts, merged into STATUSES; T8 / T9).
  | 'hot_streak' | 'fingers_of_frost' | 'touch_of_magi' | 'arcane_surge' | 'blazing_barrier' | 'intercept_ward'
  | 'guardian_vow' | 'karma_ward' | 'spirit_walk' | 'feign_death' | 'cloak_ward' | 'resolve_pact' | 'ice_block';

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
