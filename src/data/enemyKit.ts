/**
 * OWNER: enemies module. Shared kit for enemy defs (P-01): ability builders, anim sets, resist tables, hide lists,
 * the def builder, the ENEMIES / BOSSES registries and the boss / mechanic / derive helpers. Pure extraction from
 * enemies.ts, no behaviour change. Per-dungeon defs import from here.
 */
import type { DamageType } from '../types/common';
import type { EnemyAbility, EnemyAttach, EnemyDef, EnemyRank, EnemyRole, EnemyVisual, BossArena, BossDef, BossPhase } from '../types/enemies';
import type { StatusApply } from '../types/skills';
import type { VfxId } from '../types/vfx';
import { MON, CHAR, SKEL, GEN, WPN, PROC, PUG } from './enemyModels';

// ---------------------------------------------------------------------------------------------------------------------
// animation sets per model family (clip names differ; AnimController registers the part after the last '|')
// ---------------------------------------------------------------------------------------------------------------------
export type Anims = EnemyDef['anims'];
export const A_KAYKIT: Anims = { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', hit: 'Hit_A', death: 'Death_A' };
export const A_SKEL: Anims = { idle: 'Idle', walk: 'Walking_D_Skeletons', run: 'Running_C', hit: 'Hit_A', death: 'Death_C_Skeletons', spawn: 'Spawn_Ground_Skeletons' };
export const A_ENEMY: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'HitRecieve', death: 'Death' };      // Goblin Zombie Demon Yeti Giant
export const A_CHAR: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'HitReact', death: 'Death' };         // Orc Blue_Demon Demon_Lord Mushroom_King
export const A_FLY: Anims = { idle: 'Flying_Idle', walk: 'Flying_Idle', run: 'Fast_Flying', hit: 'HitReact', death: 'Death' }; // Imp Ghost Dragon
export const A_BLOB: Anims = { idle: 'Idle', walk: 'Walk', run: 'Walk', hit: 'HitRecieve', death: 'Death' };         // Slime Skull
export const A_MUSH: Anims = { idle: 'Idle', walk: 'Walk', run: 'Walk', hit: 'HitRecieve', death: 'Death' };         // Mushnub
export const A_RAT: Anims = { idle: 'Rat_Idle', walk: 'Rat_Walk', run: 'Rat_Run', death: 'Rat_Death' };
export const A_SPIDER: Anims = { idle: 'Spider_Idle', walk: 'Spider_Walk', run: 'Spider_Walk', death: 'Spider_Death' };
export const A_BAT: Anims = { idle: 'Bat_Flying', walk: 'Bat_Flying', run: 'Bat_Flying', hit: 'Bat_Hit', death: 'Bat_Death' };
export const A_GEN: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death' };                 // gen/creatures + gen/bosses
// open world (GDD_OPENWORLD §3.1): itch Fantasy Creatures share one clip vocabulary, the rest are per-model
export const A_WOLF: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death' };                 // wolf warg bear rhino deer ooze spider centipede
export const A_WASP: Anims = { idle: 'Fly', walk: 'Fly', run: 'Fly', death: 'Death' };                                // wasp
export const A_PUGLIN: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit_Front', death: 'Death_A' };         // bestiary puglin
export const A_KENNEY: Anims = { idle: 'idle', walk: 'walk', run: 'sprint', death: 'die' };                           // graveyard-kit characters (no hit clip)

// ---------------------------------------------------------------------------------------------------------------------
// ability builders
// ---------------------------------------------------------------------------------------------------------------------
export type Ab = Partial<EnemyAbility>;

export const poison = (stacks = 1, mag = 0.15, dur = 5, chance?: number): StatusApply => ({ status: 'poison', duration: dur, stacks, magnitude: mag, chance });
export const bleed = (stacks = 1, mag = 0.2, dur = 6): StatusApply => ({ status: 'bleed', duration: dur, stacks, magnitude: mag });
export const burn = (mag = 0.3, dur = 4): StatusApply => ({ status: 'burn', duration: dur, magnitude: mag });
export const chill = (stacks = 1, dur = 4): StatusApply => ({ status: 'chill', duration: dur, stacks });

/** Melee swing = small cone landing at the hit frame. */
export const cone = (id: string, name: string, range: number, arc: number, cd: number, coef: number, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'melee', range, cooldown: cd, windup: 0.45, parryable: true,
  shape: { type: 'cone', radius: range, angle: arc },
  damage: { coef, type: 'physical' }, anim,
  ...o,
  params: { impact, ...o.params },
});

export const proj = (id: string, name: string, speed: number, range: number, cd: number, windup: number, coef: number, type: DamageType, vfx: VfxId, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'projectile', range, cooldown: cd, windup, parryable: false,
  damage: { coef, type }, projectile: { speed, radius: 0.5, vfx }, anim,
  ...o,
  params: { impact, ...o.params },
});

export const aoe = (id: string, name: string, kind: 'ground_aoe' | 'self_aoe', radius: number, range: number, cd: number, windup: number, coef: number, type: DamageType, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind, range, cooldown: cd, windup, telegraph: true, parryable: false,
  shape: { type: 'circle', radius },
  damage: { coef, type }, anim,
  ...o,
  params: { impact, ...o.params },
});

export const line = (id: string, name: string, length: number, width: number, cd: number, windup: number, coef: number, type: DamageType, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'line', range: length, cooldown: cd, windup, telegraph: true, parryable: false,
  shape: { type: 'line', length, width },
  damage: { coef, type }, anim,
  ...o,
  params: { impact, ...o.params },
});

export const heal = (id: string, name: string, castTime: number, cd: number, pct: number, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'heal_ally', range: 18, cooldown: cd, windup: castTime, castTime, interruptible: true, healPct: pct, anim, vfx: 'heal_burst', sfx: 'spell_cast',
  ...o,
  params: { impact, needAlly: 1, ...o.params },
});

export const buff = (id: string, name: string, castTime: number, cd: number, statuses: StatusApply[], anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'buff_ally', range: 14, cooldown: cd, windup: castTime, castTime, interruptible: castTime >= 1.5, statuses, anim, vfx: 'buff_aura',
  ...o,
  params: { impact, radius: 12, needAlly: 1, ...o.params },
});

export const passive = (id: string, name: string, params: Record<string, number> = {}): EnemyAbility => ({
  id, name, kind: 'custom', range: 0, cooldown: 0, windup: 0, anim: '', params: { passive: 1, ...params },
});

export const onDeath = (a: EnemyAbility): EnemyAbility => ({ ...a, cooldown: 0, params: { ...a.params, onDeath: 1 } });

/** Lunge / dash: a line of `length` metres the enemy runs along (kind 'charge', `params.dash` = seconds of the run). */
export const charge = (id: string, name: string, length: number, cd: number, windup: number, coef: number, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'charge', range: length, cooldown: cd, windup, telegraph: true, parryable: true, shape: { type: 'line', length, width: 1.6 },
  damage: { coef, type: 'physical' }, anim,
  ...o,
  params: { impact, dash: 0.6, minRange: 3, ...o.params },
});

/** Call reinforcements (kind 'summon'); `params.once` / `params.hpBelow` make it a one-off / a low-HP call. */
export const summonAb = (id: string, name: string, enemyId: string, count: number, cd: number, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'summon', range: 16, cooldown: cd, windup: 0.8, castTime: 0.8, summon: { enemyId, count }, anim, vfx: 'add_spawn',
  ...o,
  params: { impact, ...o.params },
});

/** Inert basic attack for stationary / passive bodies (never selected, see EnemyAI.chooseAbility). */
export const NOOP = (id: string): EnemyAbility => ({ id, name: '-', kind: 'custom', range: 0, cooldown: 99, windup: 0, anim: '', params: { passive: 1 } });

// ---------------------------------------------------------------------------------------------------------------------
// def builder
// ---------------------------------------------------------------------------------------------------------------------
export interface Spec {
  id: string; name: string; model: string; scale: number; tint?: number; emissive?: number;
  role: EnemyRole; rank: EnemyRank; hp: number; dmg: number; speed: number; radius: number; aggro: number; forces: number;
  anims: Anims; basic: EnemyAbility; abilities?: EnemyAbility[];
  xp?: number; resist?: EnemyDef['resist']; ccImmune?: boolean; flying?: boolean; hover?: number; leash?: number;
  visual?: EnemyVisual; ai?: EnemyDef['ai']; loot?: string; armor?: number;
}

/** Rank XP multipliers (GDD_SYSTEMS 6.2). Sürü (role swarm) is 0.35 above monster level 10; Progression.monsterXp floors it at 0.6 for levels 1-10. */
export const SWARM_XP = 0.35;
export const XP: Record<EnemyRank, number> = { trash: 1, elite: 5, miniboss: 25, boss: 100 };

export function def(s: Spec): EnemyDef {
  return {
    id: s.id, name: s.name, model: s.model, tint: s.tint, emissive: s.emissive, scale: s.scale,
    role: s.role, rank: s.rank, hpMult: s.hp, dmgMult: s.dmg, armorMult: s.armor,
    speed: s.speed, radius: s.radius, aggroRange: s.aggro, leashRange: s.leash,
    attackRange: s.basic.range, attackCooldown: s.basic.cooldown,
    basicAttack: s.basic, abilities: s.abilities ?? [],
    forces: s.forces, xp: s.xp ?? (s.role === 'swarm' ? SWARM_XP : XP[s.rank]),
    resist: s.resist, ccImmune: s.ccImmune, anims: s.anims, lootTable: s.loot,
    flying: s.flying, hoverHeight: s.hover, visual: s.visual, ai: s.ai,
  };
}

// monster family resist profiles (GDD_SYSTEMS §1.10, fractions)
export const R_BEAST = {};
export const R_SKELETON: EnemyDef['resist'] = { physical: 0.15, fire: -0.25, frost: 0.25, shadow: 0.5, poison: 0.75, holy: -0.25 };
export const R_GHOST: EnemyDef['resist'] = { physical: 0.5, shadow: 0.75, poison: 0.75, holy: -0.5 };
export const R_SPIDER: EnemyDef['resist'] = { fire: -0.25, poison: 0.5 };
export const R_CULT: EnemyDef['resist'] = { physical: 0.05, fire: 0.1, frost: 0.1, lightning: 0.1, shadow: 0.25 };
export const R_GOLEM: EnemyDef['resist'] = { physical: 0.3, fire: 0.5, frost: 0.5, lightning: -0.25, poison: 0.75 };
export const R_DEMON: EnemyDef['resist'] = { physical: 0.1, fire: 0.5, frost: -0.25, shadow: 0.25, poison: 0.25, holy: -0.25 };

export const W_BLADE: EnemyAttach[] = [{ url: WPN('Skeleton_Blade'), bone: 'handslot.r', pos: [0, 0.0333, 0], rotY: Math.PI }];

// KayKit rigs: hide every accessory that is not in the loadout (they all render by default)
export const MAGE_HIDE = ['2H_Staff', '1H_Wand', 'Spellbook', 'Spellbook_open', 'Mage_Hat'];
export const mageHide = (...keep: string[]) => MAGE_HIDE.filter((n) => !keep.includes(n));
export const KNIGHT_HIDE = ['1H_Sword', '2H_Sword', '1H_Sword_Offhand', 'Round_Shield', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', 'Knight_Helmet', 'Knight_Cape'];
export const ROGUE_HIDE = ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'];

export const ENEMIES: Record<string, EnemyDef> = {};
export const add = (s: Spec) => {
  ENEMIES[s.id] = def(s);
};

// ---- mechanic entities (procedural bodies; spawned by boss scripts, replicated like any enemy) -----------------------------
export const MECH = (id: string, name: string, proc: string, hpMult: number, extra: Partial<Spec> = {}): void =>
  add({
    id, name, model: PROC(proc), scale: 1, role: 'support', rank: 'trash', hp: hpMult, dmg: 0, speed: 0, radius: 0.8, aggro: 0, forces: 0, ccImmune: true, xp: 0,
    anims: { idle: 'Idle', walk: 'Idle', run: 'Idle', death: 'Death' },
    basic: { id: `${id}_none`, name: '-', kind: 'custom', range: 0, cooldown: 99, windup: 0, anim: '', params: { passive: 1 } },
    ai: { summoned: true }, ...extra,
  });
// ---- derived defs: a copy of a base def with its own scale / tint / HP / XP and special abilities (GDD_OPENWORLD §3.5-3.6)
export interface Derive {
  scale: number; tint?: number; hp: number; rank: EnemyRank; xp: number; loot: string; abilities: EnemyAbility[];
  basic?: EnemyAbility; resist?: EnemyDef['resist']; ai?: EnemyDef['ai']; ccImmune?: boolean;
}
export function derive(id: string, name: string, base: string, o: Derive): void {
  const b = ENEMIES[base];
  if (!b) {
    console.warn(`[enemy] derive "${id}": unknown base "${base}"`);
    return;
  }
  const basic = o.basic ?? b.basicAttack;
  ENEMIES[id] = {
    ...b, id, name, scale: b.scale * o.scale, tint: o.tint ?? b.tint, rank: o.rank, hpMult: o.hp, forces: 0, xp: o.xp, lootTable: o.loot,
    basicAttack: basic, attackRange: basic.range, attackCooldown: basic.cooldown, abilities: o.abilities,
    resist: o.resist ?? b.resist, ai: o.ai ?? b.ai, ccImmune: o.ccImmune ?? b.ccImmune, leashRange: 40,
  };
}

export const BOSSES: Record<string, BossDef> = {};

export interface BossSpec extends Omit<Spec, 'hp' | 'dmg' | 'rank' | 'aggro' | 'forces' | 'basic'> {
  title: string; hp: number; dmg: number; aggro?: number; basic: EnemyAbility; phases: BossPhase[]; enrage: number; arenaR: number;
  intro?: string; death?: string; arena: BossArena; music?: string; loot: string;
}

export function boss(s: BossSpec): void {
  const base = def({ ...s, rank: 'boss', forces: 0, aggro: s.aggro ?? 18, ccImmune: true, xp: 100, leash: 0 });
  BOSSES[s.id] = {
    ...base,
    title: s.title, phases: s.phases, enrageTimer: s.enrage, arenaRadius: s.arenaR, introYell: s.intro, deathYell: s.death, music: 'boss', arena: s.arena,
  };
}

export const bp = (id: string, hpBelow: number, abilities: string[], onEnter?: BossPhase['onEnter']): BossPhase => ({ id, hpBelow, abilities, onEnter });
export const custom = (id: string, name: string, cd: number, first: number | undefined, windup: number, anim: string, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'custom', range: 60, cooldown: cd, initialCooldown: first, windup, anim, ...o, params: { ...o.params },
});

export const A_EJDER: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death' };
