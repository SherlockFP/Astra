import type { DamageType } from './common';
import type { StatusApply, StatusId } from './skills';
import type { TelegraphShape } from './vfx';
import type { VfxId } from './vfx';
import type { SfxId } from './audio';
import type { FamilyId } from './v2';
import type { SkinDef } from './professions';

/** GDD_LIFE §5.11 (L-00): impact material of an enemy; drives the hit sfx / vfx map. */
export type HitMaterial = 'flesh' | 'bone' | 'metal' | 'stone' | 'goo' | 'ghost' | 'wood';

export type EnemyRole = 'melee' | 'ranged' | 'caster' | 'healer' | 'tank' | 'swarm' | 'support';
export type EnemyRank = 'trash' | 'elite' | 'miniboss' | 'boss';

/**
 * Anything an enemy does that can hurt players is an EnemyAbility. The host runs AI and decides WHEN;
 * the resulting HitShape is broadcast and every peer resolves it against ITS OWN local player
 * (see ARCHITECTURE.md "Damage authority").
 */
export interface EnemyAbility {
  id: string;
  name: string;               // Turkish (shown on cast bars)
  kind: 'melee' | 'cone' | 'projectile' | 'ground_aoe' | 'self_aoe' | 'line' | 'heal_ally' | 'buff_ally' | 'summon' | 'charge' | 'custom';
  range: number;              // AI uses it when target within range
  cooldown: number;
  initialCooldown?: number;
  windup: number;             // seconds of telegraph/cast before the hit lands
  castTime?: number;          // >0 shows a cast bar; interruptible casts can be stopped by stun/interrupt
  interruptible?: boolean;
  shape?: TelegraphShape;     // area of the hit (melee uses a small cone by default)
  telegraph?: boolean;        // show ground telegraph during windup
  damage?: { coef: number; type: DamageType };   // coef x enemy base damage
  statuses?: StatusApply[];
  projectile?: { speed: number; radius: number; count?: number; spread?: number; vfx: VfxId; homing?: number };
  summon?: { enemyId: string; count: number };
  healPct?: number;
  anim: string;               // clip name on the enemy model
  vfx?: VfxId;
  sfx?: SfxId;
  weight?: number;            // AI selection weight
  params?: Record<string, number>;
  /** enemies module: knockback distance in metres applied to the player hit (negative = pull toward the origin). */
  knockback?: number;
  // GDD_V2 §3.12 (WP1 contracts, all optional)
  /** Can be parried (default true for melee/cone/charge basic swings, false for projectile/ground/self AoE/summon/custom). */
  parryable?: boolean;
  /** Cannot be parried or guarded: dodge only, red glyph during the windup (implies blockable: false). */
  perilous?: boolean;
  /** Interrupt priority: 0 none, 1 medium, 2 high (mirrors the roster's "interrupt priority" column). */
  kick?: 0 | 1 | 2;
  /** Tank buster: a big single-target hit the tank must mitigate (GDD_V2 §1.5 / §1.7). */
  tankBuster?: boolean;
  /** P-23: the debuff that must be cleansed (potion or cleanse); shown as a green mark on the nameplate and tooltip. */
  dispel?: StatusId;
}

export interface EnemyDef {
  id: string;
  name: string;               // Turkish
  model: string;              // GLB url
  tint?: number;              // hex multiply tint applied to materials (recolor variants)
  emissive?: number;
  scale: number;
  role: EnemyRole;
  rank: EnemyRank;
  hpMult: number;             // x baseline HP for its level
  dmgMult: number;            // x baseline damage
  armorMult?: number;
  speed: number;              // units/sec
  radius: number;             // collision radius
  aggroRange: number;
  leashRange?: number;
  attackRange: number;        // basic attack range
  attackCooldown: number;
  basicAttack: EnemyAbility;
  abilities: EnemyAbility[];
  forces: number;             // M+ enemy forces value (count)
  xp: number;                 // xp multiplier vs baseline
  resist?: Partial<Record<DamageType, number>>;
  ccImmune?: boolean;
  anims: { idle: string; walk: string; run: string; hit?: string; death: string; spawn?: string };
  lootTable?: string;
  flying?: boolean;
  hoverHeight?: number;
  /** enemies module: model setup (weapons, hidden nodes, ghost opacity, procedural body...). */
  visual?: EnemyVisual;
  /** enemies module: behaviour hints for the AI. */
  ai?: EnemyAiHints;
  // GDD_V2 §3.12 / §7.1 (WP1 contracts, all optional; defaults by rank x family are applied by the enemies owner)
  /** Max poise (overrides the rank default). */
  poise?: number;
  /** Fraction of max poise regenerated per second after the delay (default 0.10). */
  poiseRegen?: number;
  /** Seconds without poise damage before regen starts (default 3). */
  poiseDelay?: number;
  /** 0..1 fraction of each windup that cannot be flinched. */
  hyperArmor?: number;
  /** false = poise bar hidden, only flinches (floating orbs, cages). */
  stanceBreakable?: boolean;
  /** Default true. */
  backstabbable?: boolean;
  /** Creature family (GDD_V2 §7); supplies default resists and status rules. */
  family?: FamilyId;
  /** Behaviour profile (GDD_V2 §1.7). */
  profile?: 'bruiser' | 'buster' | 'cleaver' | 'ranged_focus' | 'aoe_pulse' | 'stacker';
  // GDD_LIFE (L-00, all optional)
  /** Hide and meat drops of this creature (GDD_LIFE §1.5.4, skinning). */
  skin?: SkinDef;
  /** Impact material for hit sfx / vfx (GDD_LIFE §5.11). Default 'flesh'. */
  hitMaterial?: HitMaterial;
}

export interface BossPhase {
  id: string;
  hpBelow: number;            // enters when hp fraction < this (first phase uses 1.01)
  abilities: string[];        // ability ids active in this phase
  onEnter?: { yell?: string; ability?: string; summon?: { enemyId: string; count: number } };
}

/** P-38: boss energy bar (cyan second bar in the boss frame). Negative `regen` drains. */
export interface BossEnergyDef {
  max: number;
  start?: number;
  regen?: number;
  onFull?: string;            // boss script hook name
  onEmpty?: string;           // boss script hook name
  costs?: Record<string, number>;   // ability id -> energy cost
}

export interface BossDef extends EnemyDef {
  title: string;              // e.g. "Mahzenin Efendisi"
  phases: BossPhase[];
  enrageTimer: number;        // seconds after pull
  arenaRadius: number;
  introYell?: string;
  deathYell?: string;
  music?: string;
  arena?: BossArena;
  /** GDD_LIFE §4.12 (L-00): cinematic boss-intro camera. `false` = no intro; object = tuning (defaults in data). */
  introCam?: false | { hold?: number; dist?: number; height?: number };
  /** P-38: optional energy bar (BossController.energy). */
  energy?: BossEnergyDef;
}

// ---------------------------------------------------------------------------------------------------------------------
// enemies module additions (append-only, all optional)
// ---------------------------------------------------------------------------------------------------------------------

/** A rigid GLB attached to a bone of the enemy model (KayKit rigs: handslot.r / handslot.l / head / chest). */
export interface EnemyAttach {
  url: string;
  bone: 'handslot.r' | 'handslot.l' | 'head' | 'chest';
  pos?: [number, number, number];
  rotY?: number;
  quat?: [number, number, number, number];
  scale?: number;
}

export interface EnemyVisual {
  attach?: EnemyAttach[];
  /** Accessory node names hidden on load (a KayKit Knight shows every sword/shield by default). */
  hide?: string[];
  /** Emissive colour of eye materials. */
  eyeEmissive?: number;
  /** Strength of def.emissive (default 0.55). */
  emissiveIntensity?: number;
  /** < 1 = ghostly (transparent, no depth write). */
  opacity?: number;
  /** Extra GLB whose clips are merged into this model (KayKit rigs share every clip; skeleton-only clips for adventurers). */
  clipsFrom?: string;
  /** Speed (m/s) at which the run clip looks right at timeScale 1 (default def.speed). */
  runRef?: number;
  /** Vertical bob amplitude (m) of floating bodies. */
  hoverBob?: number;
  /** Body spin (rad/s) for crystals / orbs. */
  spin?: number;
  /** Colour of the windup glow (enemy_cast_glow). */
  glow?: number;
  /** Blocks movement: marks a nav circle of this radius unwalkable while the entity exists (ice pillars). */
  blocker?: number;
  /** Hide a model node once hp falls below a fraction (Zakhar hides the trident at 40%); evaluated on every peer. */
  hideBelowHp?: { node: string; frac: number };
  /** GDD_LIFE §2.3 (L-00): body texture url override (e.g. `/assets/textures/itch/creatures/wolf_black.png`). */
  texture?: string;
}

export interface EnemyAiHints {
  /** Preferred distance band [min, max] metres for ranged/caster units (they back away when closer than min). */
  kite?: [number, number];
  /** Never attacks, runs away from players (Hazine Goblini). */
  flee?: boolean;
  /** Starts dormant (floor pose) and wakes when a player gets within wakeRange (default 6). */
  dormant?: boolean;
  wakeRange?: number;
  /** Boss adds / summons: never leash, never aggro by range (they are aggroed on spawn). */
  summoned?: boolean;
  /** Walk speed while patrolling as a fraction of def.speed (default 0.45). */
  patrolMul?: number;
  /** Bone pile: leaves a corpse that stays this long (seconds) and can be raised / exploded. */
  bonePile?: number;
  /** Stealth: invisible until a player is within this distance or it takes damage (Gölge Suikastçısı). */
  stealthReveal?: number;
  // ---- open world additions (GDD_OPENWORLD §9.1, all optional) ----
  /** Never moves, never leashes (metin stones). */
  stationary?: boolean;
  /** Fights only when hit or cornered (deer). */
  neutral?: boolean;
  /** Metres from every player beyond which an unaggroed enemy skips AI / animation (default 45). */
  sleepRange?: number;
  /** Leash radius around its camp / home position (default 40). */
  homeRadius?: number;
}

export interface BossArena {
  /** World-space centre of the arena and its size (m). */
  cx: number; cz: number; w: number; h: number;
  /** World-space spawn of the boss this was measured against (the arena is shifted if the real spawn differs). */
  homeX: number; homeZ: number;
}
