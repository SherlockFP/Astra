import type { DamageType } from '../types/common';
import type { BossDef, BossArena, BossPhase, EnemyAbility, EnemyAttach, EnemyDef, EnemyRank, EnemyRole, EnemyVisual } from '../types/enemies';
import type { StatusApply } from '../types/skills';
import type { VfxId } from '../types/vfx';

/**
 * OWNER: enemies module. Trash/elite roster (GDD_CONTENT §3) and bosses (§4.x.5).
 *
 * `EnemyAbility.params` knobs understood by ai/EnemyAI.ts (all optional numbers):
 *   impact      seconds into the clip (at speed 1) where the hit lands; the clip is sped up/slowed so it lands at `windup`
 *   lunge       metres the enemy steps forward during a melee windup
 *   hpBelow / hpAbove   only usable while own hp fraction is below / above
 *   minRange    only usable when the target is farther away than this
 *   needAlly    1 = heal/buff only when a hurt ally exists
 *   radius      effect radius (buffs, summon scatter, pulls)
 *   self        1 = a buff also affects the caster
 *   single      1 = buff only the best single ally
 *   shieldPct   shield absorb as a fraction of the receiver's max HP
 *   persist/persistCoef/tick   lingering ground effect after the impact (seconds / coef per tick / tick interval)
 *   onDeath     1 = never selected in combat, runs when the enemy dies
 *   passive     1 = never selected, behaviour lives in ai/passives.ts under the same id
 *   once        1 = at most once per life
 *   target      0 threat/nearest, 1 random player, 2 farthest player, 3 random non-tank
 *   hitscan     1 = projectile volley resolved as instant telegraphed lines (skeleton archer Çoklu Atış)
 *   channel     seconds of channelled effect (animation loops)
 *   suicide     1 = the enemy dies when the ability resolves
 *   dash        seconds the charge takes
 *   delay       explicit extra delay after the cast before resolving
 *   firstCoef   damage coefficient of the first use after aggro (Pusu)
 *   lines       number of radial lines
 *
 * GDD_V2 §3.12 ability flags (EnemyAbility): `parryable` (builders: cones and charges yes, projectiles / AoE / lines no; tank busters
 * and breaths no), `perilous` (red flash + glyph in the windup, dodge only: big boss slams and grabs), `tankBuster` (big single-target
 * hit the tank mitigates, never parryable), `kick` (interrupt priority, roster column; not set yet).
 */

const MODELS = '/assets/models/';
const MON = (n: string) => `${MODELS}monsters/${n}.glb`;
const CHAR = (n: string) => `${MODELS}characters/${n}.glb`;
const SKEL = (n: string) => `${MODELS}enemies/${n}.glb`;
const GEN = (n: string) => `${MODELS}gen/creatures/${n}.glb`;
const GENB = (n: string) => `${MODELS}gen/bosses/${n}.glb`;
const WPN = (n: string) => `${MODELS}weapons/skeleton/${n}.gltf`;
const PROC = (n: string) => `PROC:${n}`;
const ITCH = (n: string) => `${MODELS}itch/creatures/${n}.glb`;
const PUG = `${MODELS}itch/bestiary/puglin.glb`;
const GRAVE = (n: string) => `${MODELS}kenney/graveyard-kit/${n}.glb`;

// ---------------------------------------------------------------------------------------------------------------------
// animation sets per model family (clip names differ; AnimController registers the part after the last '|')
// ---------------------------------------------------------------------------------------------------------------------
type Anims = EnemyDef['anims'];
const A_KAYKIT: Anims = { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', hit: 'Hit_A', death: 'Death_A' };
const A_SKEL: Anims = { idle: 'Idle', walk: 'Walking_D_Skeletons', run: 'Running_C', hit: 'Hit_A', death: 'Death_C_Skeletons', spawn: 'Spawn_Ground_Skeletons' };
const A_ENEMY: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'HitRecieve', death: 'Death' };      // Goblin Zombie Demon Yeti Giant
const A_CHAR: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'HitReact', death: 'Death' };         // Orc Blue_Demon Demon_Lord Mushroom_King
const A_FLY: Anims = { idle: 'Flying_Idle', walk: 'Flying_Idle', run: 'Fast_Flying', hit: 'HitReact', death: 'Death' }; // Imp Ghost Dragon
const A_BLOB: Anims = { idle: 'Idle', walk: 'Walk', run: 'Walk', hit: 'HitRecieve', death: 'Death' };         // Slime Skull
const A_MUSH: Anims = { idle: 'Idle', walk: 'Walk', run: 'Walk', hit: 'HitRecieve', death: 'Death' };         // Mushnub
const A_RAT: Anims = { idle: 'Rat_Idle', walk: 'Rat_Walk', run: 'Rat_Run', death: 'Rat_Death' };
const A_SPIDER: Anims = { idle: 'Spider_Idle', walk: 'Spider_Walk', run: 'Spider_Walk', death: 'Spider_Death' };
const A_BAT: Anims = { idle: 'Bat_Flying', walk: 'Bat_Flying', run: 'Bat_Flying', hit: 'Bat_Hit', death: 'Bat_Death' };
const A_GEN: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death' };                 // gen/creatures + gen/bosses
// open world (GDD_OPENWORLD §3.1): itch Fantasy Creatures share one clip vocabulary, the rest are per-model
const A_WOLF: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death' };                 // wolf warg bear rhino deer ooze spider centipede
const A_WASP: Anims = { idle: 'Fly', walk: 'Fly', run: 'Fly', death: 'Death' };                                // wasp
const A_PUGLIN: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit_Front', death: 'Death_A' };         // bestiary puglin
const A_KENNEY: Anims = { idle: 'idle', walk: 'walk', run: 'sprint', death: 'die' };                           // graveyard-kit characters (no hit clip)

// ---------------------------------------------------------------------------------------------------------------------
// ability builders
// ---------------------------------------------------------------------------------------------------------------------
type Ab = Partial<EnemyAbility>;

const poison = (stacks = 1, mag = 0.15, dur = 5, chance?: number): StatusApply => ({ status: 'poison', duration: dur, stacks, magnitude: mag, chance });
const bleed = (stacks = 1, mag = 0.2, dur = 6): StatusApply => ({ status: 'bleed', duration: dur, stacks, magnitude: mag });
const burn = (mag = 0.3, dur = 4): StatusApply => ({ status: 'burn', duration: dur, magnitude: mag });
const chill = (stacks = 1, dur = 4): StatusApply => ({ status: 'chill', duration: dur, stacks });

/** Melee swing = small cone landing at the hit frame. */
const cone = (id: string, name: string, range: number, arc: number, cd: number, coef: number, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'melee', range, cooldown: cd, windup: 0.45, parryable: true,
  shape: { type: 'cone', radius: range, angle: arc },
  damage: { coef, type: 'physical' }, anim,
  ...o,
  params: { impact, ...o.params },
});

const proj = (id: string, name: string, speed: number, range: number, cd: number, windup: number, coef: number, type: DamageType, vfx: VfxId, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'projectile', range, cooldown: cd, windup, parryable: false,
  damage: { coef, type }, projectile: { speed, radius: 0.5, vfx }, anim,
  ...o,
  params: { impact, ...o.params },
});

const aoe = (id: string, name: string, kind: 'ground_aoe' | 'self_aoe', radius: number, range: number, cd: number, windup: number, coef: number, type: DamageType, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind, range, cooldown: cd, windup, telegraph: true, parryable: false,
  shape: { type: 'circle', radius },
  damage: { coef, type }, anim,
  ...o,
  params: { impact, ...o.params },
});

const line = (id: string, name: string, length: number, width: number, cd: number, windup: number, coef: number, type: DamageType, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'line', range: length, cooldown: cd, windup, telegraph: true, parryable: false,
  shape: { type: 'line', length, width },
  damage: { coef, type }, anim,
  ...o,
  params: { impact, ...o.params },
});

const heal = (id: string, name: string, castTime: number, cd: number, pct: number, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'heal_ally', range: 18, cooldown: cd, windup: castTime, castTime, interruptible: true, healPct: pct, anim, vfx: 'heal_burst', sfx: 'spell_cast',
  ...o,
  params: { impact, needAlly: 1, ...o.params },
});

const buff = (id: string, name: string, castTime: number, cd: number, statuses: StatusApply[], anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'buff_ally', range: 14, cooldown: cd, windup: castTime, castTime, interruptible: castTime >= 1.5, statuses, anim, vfx: 'buff_aura',
  ...o,
  params: { impact, radius: 12, needAlly: 1, ...o.params },
});

const passive = (id: string, name: string, params: Record<string, number> = {}): EnemyAbility => ({
  id, name, kind: 'custom', range: 0, cooldown: 0, windup: 0, anim: '', params: { passive: 1, ...params },
});

const onDeath = (a: EnemyAbility): EnemyAbility => ({ ...a, cooldown: 0, params: { ...a.params, onDeath: 1 } });

/** Lunge / dash: a line of `length` metres the enemy runs along (kind 'charge', `params.dash` = seconds of the run). */
const charge = (id: string, name: string, length: number, cd: number, windup: number, coef: number, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'charge', range: length, cooldown: cd, windup, telegraph: true, parryable: true, shape: { type: 'line', length, width: 1.6 },
  damage: { coef, type: 'physical' }, anim,
  ...o,
  params: { impact, dash: 0.6, minRange: 3, ...o.params },
});

/** Call reinforcements (kind 'summon'); `params.once` / `params.hpBelow` make it a one-off / a low-HP call. */
const summonAb = (id: string, name: string, enemyId: string, count: number, cd: number, anim: string, impact: number, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'summon', range: 16, cooldown: cd, windup: 0.8, castTime: 0.8, summon: { enemyId, count }, anim, vfx: 'add_spawn',
  ...o,
  params: { impact, ...o.params },
});

/** Inert basic attack for stationary / passive bodies (never selected, see EnemyAI.chooseAbility). */
const NOOP = (id: string): EnemyAbility => ({ id, name: '-', kind: 'custom', range: 0, cooldown: 99, windup: 0, anim: '', params: { passive: 1 } });

// ---------------------------------------------------------------------------------------------------------------------
// def builder
// ---------------------------------------------------------------------------------------------------------------------
interface Spec {
  id: string; name: string; model: string; scale: number; tint?: number; emissive?: number;
  role: EnemyRole; rank: EnemyRank; hp: number; dmg: number; speed: number; radius: number; aggro: number; forces: number;
  anims: Anims; basic: EnemyAbility; abilities?: EnemyAbility[];
  xp?: number; resist?: EnemyDef['resist']; ccImmune?: boolean; flying?: boolean; hover?: number; leash?: number;
  visual?: EnemyVisual; ai?: EnemyDef['ai']; loot?: string; armor?: number;
}

/** Rank XP multipliers (GDD_SYSTEMS 6.2). Sürü (role swarm) is 0.35 above monster level 10; Progression.monsterXp floors it at 0.6 for levels 1-10. */
const SWARM_XP = 0.35;
const XP: Record<EnemyRank, number> = { trash: 1, elite: 5, miniboss: 25, boss: 100 };

function def(s: Spec): EnemyDef {
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
const R_BEAST = {};
const R_SKELETON: EnemyDef['resist'] = { physical: 0.15, fire: -0.25, frost: 0.25, shadow: 0.5, poison: 0.75, holy: -0.25 };
const R_GHOST: EnemyDef['resist'] = { physical: 0.5, shadow: 0.75, poison: 0.75, holy: -0.5 };
const R_SPIDER: EnemyDef['resist'] = { fire: -0.25, poison: 0.5 };
const R_CULT: EnemyDef['resist'] = { physical: 0.05, fire: 0.1, frost: 0.1, lightning: 0.1, shadow: 0.25 };
const R_GOLEM: EnemyDef['resist'] = { physical: 0.3, fire: 0.5, frost: 0.5, lightning: -0.25, poison: 0.75 };
const R_DEMON: EnemyDef['resist'] = { physical: 0.1, fire: 0.5, frost: -0.25, shadow: 0.25, poison: 0.25, holy: -0.25 };

const W_BLADE: EnemyAttach[] = [{ url: WPN('Skeleton_Blade'), bone: 'handslot.r', pos: [0, 0.0333, 0], rotY: Math.PI }];

// KayKit rigs: hide every accessory that is not in the loadout (they all render by default)
const MAGE_HIDE = ['2H_Staff', '1H_Wand', 'Spellbook', 'Spellbook_open', 'Mage_Hat'];
const mageHide = (...keep: string[]) => MAGE_HIDE.filter((n) => !keep.includes(n));
const KNIGHT_HIDE = ['1H_Sword', '2H_Sword', '1H_Sword_Offhand', 'Round_Shield', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', 'Knight_Helmet', 'Knight_Cape'];
const ROGUE_HIDE = ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'];

export const ENEMIES: Record<string, EnemyDef> = {};
const add = (s: Spec) => {
  ENEMIES[s.id] = def(s);
};

// =====================================================================================================================
// 3.2 Open world and global
// =====================================================================================================================
add({
  id: 'ow_goblin', name: 'Goblin Yağmacı', model: MON('Goblin'), scale: 0.59, role: 'melee', rank: 'trash', hp: 0.8, dmg: 0.8, speed: 6.2, radius: 0.4, aggro: 9, forces: 0, leash: 40,
  anims: A_ENEMY, resist: R_BEAST,
  basic: cone('ow_goblin_hit', 'Pala Darbesi', 2.0, 90, 1.8, 1.0, 'Attack', 0.37),
  abilities: [proj('ow_goblin_rock', 'Taş Fırlat', 14, 14, 6, 0.6, 1.2, 'physical', 'rock_projectile', 'Attack', 0.37, { range: 14 })],
});
add({
  id: 'ow_goblin_shaman', name: 'Goblin Şamanı', model: MON('Goblin'), scale: 0.61, tint: 0x7a9a40, role: 'healer', rank: 'trash', hp: 0.9, dmg: 0.8, speed: 5.3, radius: 0.4, aggro: 10, forces: 0, leash: 40,
  anims: A_ENEMY, ai: { kite: [7, 13] },
  basic: proj('ow_shaman_bolt', 'Zehir Oku', 16, 16, 2.4, 0.5, 1.0, 'poison', 'poison_projectile', 'Attack', 0.37, { statuses: [poison(1)] }),
  abilities: [heal('ow_shaman_heal', 'Şifa Duası', 2.0, 10, 0.2, 'Attack', 0.37, { range: 14 })],
});
add({
  id: 'ow_rat', name: 'Orman Sıçanı', model: MON('Rat'), scale: 0.31, role: 'swarm', rank: 'trash', hp: 0.3, dmg: 0.4, speed: 7.7, radius: 0.3, aggro: 8, forces: 0, leash: 40,
  anims: A_RAT, resist: R_BEAST,
  basic: cone('ow_rat_bite', 'Isırık', 1.2, 90, 1.2, 1.0, 'Rat_Attack', 0.43, { windup: 0.4 }),
});
add({
  id: 'ow_spider', name: 'Orman Örümceği', model: MON('Spider'), scale: 0.63, tint: 0x6a7a3a, role: 'melee', rank: 'trash', hp: 0.9, dmg: 0.9, speed: 7, radius: 0.6, aggro: 9, forces: 0, leash: 40,
  anims: A_SPIDER, resist: R_SPIDER,
  basic: cone('ow_spider_bite', 'Isırık', 1.8, 90, 1.6, 1.0, 'Spider_Attack', 0.42),
  abilities: [proj('ow_spider_web', 'Ağ Atışı', 16, 12, 9, 0.6, 0.3, 'physical', 'bolt_projectile', 'Spider_Attack', 0.42, { statuses: [{ status: 'root', duration: 1.5 }] })],
});
add({
  id: 'ow_slime', name: 'Yeşil Balçık', model: GEN('slime_green'), scale: 1.07, role: 'melee', rank: 'trash', hp: 0.8, dmg: 0.7, speed: 4.8, radius: 0.65, aggro: 8, forces: 0, leash: 40,
  anims: A_GEN,
  basic: cone('ow_slime_hit', 'Gövde Çarpması', 1.5, 100, 1.8, 1.0, 'Attack', 0.57),
  abilities: [onDeath({ id: 'ow_slime_split', name: 'Bölünme', kind: 'summon', range: 0, cooldown: 0, windup: 0, anim: '', summon: { enemyId: 'ow_slimelet', count: 2 }, vfx: 'add_spawn' })],
});
add({
  id: 'ow_slimelet', name: 'Küçük Balçık', model: GEN('slime_green'), scale: 0.64, role: 'swarm', rank: 'trash', hp: 0.24, dmg: 0.5, speed: 5.4, radius: 0.4, aggro: 10, forces: 0, leash: 40,
  anims: A_GEN, ai: { summoned: true },
  basic: cone('ow_slimelet_hit', 'Çarpma', 1.2, 100, 1.6, 1.0, 'Attack', 0.57, { windup: 0.4 }),
});
add({
  id: 'ow_mushnub', name: 'Mantarcık', model: MON('Mushnub'), scale: 0.36, role: 'swarm', rank: 'trash', hp: 0.4, dmg: 0.5, speed: 6.4, radius: 0.35, aggro: 8, forces: 0, leash: 40,
  anims: A_MUSH,
  basic: cone('ow_mushnub_bite', 'Isırık', 1.2, 90, 1.4, 1.0, 'Bite_Front', 0.24, { windup: 0.4 }),
  abilities: [onDeath(aoe('ow_mushnub_spores', 'Spor Bulutu', 'self_aoe', 2, 0, 0, 0.3, 0.3, 'poison', '', 0, { telegraph: false, vfx: 'poison_cloud', params: { persist: 3, tick: 0.5 } }))],
});
add({
  id: 'ow_bat', name: 'Mağara Yarasası', model: MON('Bat'), scale: 0.47, role: 'swarm', rank: 'trash', hp: 0.3, dmg: 0.4, speed: 8.4, radius: 0.4, aggro: 10, forces: 0, leash: 40, flying: true,
  anims: A_BAT,
  basic: cone('ow_bat_bite', 'Dalış Isırığı', 1.5, 100, 1.3, 1.0, 'Bat_Attack2', 0.33, { windup: 0.4 }),
});
add({
  id: 'ow_zombie', name: 'Çürümüş Köylü', model: MON('Zombie'), scale: 0.88, role: 'melee', rank: 'trash', hp: 1.3, dmg: 1.1, speed: 3.6, radius: 0.5, aggro: 8, forces: 0, leash: 40,
  anims: A_ENEMY,
  basic: cone('ow_zombie_claw', 'Pençe', 2.0, 100, 2.0, 1.0, 'Attack', 0.37),
  abilities: [cone('ow_zombie_breath', 'Çürük Nefes', 4, 60, 10, 0.4, 'Attack', 0.37, { windup: 0.8, telegraph: true, parryable: false, damage: { coef: 0.4, type: 'poison' }, statuses: [poison(3)] } as Ab)],
});
add({
  id: 'ow_orc_chief', name: 'Ork Reisi', model: MON('Orc'), scale: 1.05, role: 'melee', rank: 'elite', hp: 4, dmg: 1.6, speed: 5.6, radius: 0.8, aggro: 11, forces: 0, leash: 40,
  anims: A_CHAR,
  basic: cone('ow_orc_axe', 'Balta', 3, 110, 2.2, 1.0, 'Weapon', 0.45, { windup: 0.55 }),
  abilities: [
    buff('ow_orc_warcry', 'Savaş Narası', 0.9, 20, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Wave', 0.8, { vfx: 'war_cry', sfx: 'war_cry', params: { radius: 12, self: 1, impact: 0.8 }, interruptible: false }),
    line('ow_orc_cleave', 'Yarma', 7, 2, 9, 1.0, 2.2, 'physical', 'Weapon', 0.45),
  ],
});
add({
  id: 'treasure_goblin', name: 'Hazine Goblini', model: MON('Goblin'), scale: 0.67, tint: 0xffd040, role: 'support', rank: 'elite', hp: 12, dmg: 0, speed: 7.7, radius: 0.45, aggro: 14, forces: 0, xp: 5, leash: 0,
  anims: A_ENEMY, ai: { flee: true }, loot: 'treasure_goblin',
  basic: { id: 'tg_none', name: 'Kaçış', kind: 'custom', range: 0, cooldown: 99, windup: 0, anim: '', params: { passive: 1 } },
  abilities: [{ id: 'tg_portal', name: 'Kaçış Portalı', kind: 'custom', range: 0, cooldown: 99, windup: 3.0, castTime: 3.0, interruptible: true, anim: 'Jump', params: { passive: 1, escape: 1 } }],
});

// =====================================================================================================================
// 3.2b Open-world roster (GDD_OPENWORLD §3.1): 34 new defs + wasp_swamp variant, appended by the enemies module
// =====================================================================================================================
// ---- wildlife / beasts
add({
  id: 'ow_wolf', name: 'Orman Kurdu', model: ITCH('wolf'), scale: 0.8, role: 'melee', rank: 'trash', hp: 0.8, dmg: 0.9, speed: 7.4, radius: 0.55, aggro: 10, forces: 0, leash: 40,
  anims: A_WOLF, resist: R_BEAST,
  basic: cone('ow_wolf_bite', 'Isırık', 2.0, 90, 1.4, 1.0, 'Bite', 0.47),
  abilities: [
    charge('ow_wolf_lunge', 'Atılma', 7, 7, 0.6, 1.2, 'Lunge', 0.87),
    summonAb('ow_wolf_howl', 'Uluma', 'ow_wolf', 1, 30, 'Howl', 0.8, { params: { hpBelow: 0.5, once: 1 } }),
  ],
});
add({
  id: 'ow_wolf_dire', name: 'Dehşet Kurdu', model: GEN('wolf_dire'), scale: 1.0, role: 'melee', rank: 'elite', hp: 3.5, dmg: 1.4, speed: 7.8, radius: 0.7, aggro: 12, forces: 0, leash: 40,
  anims: A_GEN, resist: R_BEAST,
  basic: cone('ow_wolf_dire_bite', 'Isırık', 2.4, 90, 1.8, 1.0, 'Attack', 0.5),
  abilities: [
    charge('ow_wolf_dire_rend', 'Kemik Kıran', 8, 9, 0.8, 1.8, 'Attack', 0.5, { statuses: [{ status: 'knockdown', duration: 1 }] }),
    // approximation: +25% damage for allies instead of attack speed (the buff table has no attack-speed status of that size)
    buff('ow_wolf_dire_pack', 'Sürü Emri', 0.5, 20, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Howl', 0.8, { params: { radius: 12, impact: 0.8 } }),
  ],
});
add({
  id: 'ow_warg', name: 'Savaş Kurdu', model: ITCH('warg'), scale: 0.95, role: 'melee', rank: 'elite', hp: 4.2, dmg: 1.5, speed: 8.0, radius: 0.8, aggro: 12, forces: 0, leash: 40,
  anims: A_WOLF, resist: R_BEAST,
  basic: cone('ow_warg_bite', 'Isırık', 2.6, 100, 1.9, 1.0, 'Bite', 0.5),
  abilities: [
    charge('ow_warg_lunge', 'Atılma', 9, 9, 0.8, 1.9, 'Lunge', 0.93),
    summonAb('ow_warg_call', 'Savaş Uluması', 'ow_wolf', 2, 40, 'Howl', 0.8, { params: { once: 1, radius: 14 } }),
    buff('ow_warg_roar', 'Savaş Uluması Gücü', 0.8, 30, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Howl', 0.8, { params: { radius: 14, self: 1, once: 1 } }),
  ],
});
add({
  id: 'ow_boar', name: 'Yaban Domuzu', model: ITCH('rhino'), scale: 0.42, tint: 0x7a5a40, role: 'melee', rank: 'trash', hp: 1.1, dmg: 1.0, speed: 6.4, radius: 0.6, aggro: 9, forces: 0, leash: 40,
  anims: A_WOLF, resist: R_BEAST, visual: { hide: ['Spear'] },
  basic: cone('ow_boar_gore', 'Boynuz', 1.8, 100, 1.6, 1.0, 'Gore', 0.45),
  abilities: [charge('ow_boar_charge', 'Hücum', 8, 8, 0.8, 1.6, 'Charge', 0.6, { shape: { type: 'line', length: 8, width: 1.6 } })],
});
add({
  id: 'ow_bear', name: 'Boz Ayı', model: ITCH('bear'), scale: 0.9, role: 'melee', rank: 'elite', hp: 3.6, dmg: 1.5, speed: 5.6, radius: 0.95, aggro: 11, forces: 0, leash: 40,
  anims: A_WOLF, resist: R_BEAST, ai: { dormant: true, wakeRange: 6 },
  basic: cone('ow_bear_swipe', 'Pençe', 2.8, 110, 2.0, 1.0, 'Swipe', 0.42),
  abilities: [
    aoe('ow_bear_slam', 'Yer Darbesi', 'self_aoe', 4, 4, 11, 1.0, 2.0, 'physical', 'Slam', 0.77),
    buff('ow_bear_roar', 'Kükreme', 0.5, 20, [{ status: 'empower', duration: 8, magnitude: 0.2 }], 'Roar', 0.3, { params: { self: 1 } }),
  ],
});
add({
  id: 'ow_rhino', name: 'Dağ Gergedanı', model: ITCH('rhino'), scale: 0.95, role: 'melee', rank: 'elite', hp: 4.0, dmg: 1.7, speed: 5.0, radius: 1.1, aggro: 11, forces: 0, leash: 40,
  anims: A_WOLF, resist: R_BEAST,
  basic: cone('ow_rhino_gore', 'Boynuz', 3.0, 100, 2.2, 1.0, 'Gore', 0.45),
  abilities: [
    charge('ow_rhino_charge', 'Hücum', 12, 10, 1.1, 2.4, 'Charge', 0.6, { shape: { type: 'line', length: 12, width: 2.2 }, statuses: [{ status: 'knockdown', duration: 0.8 }] }),
    aoe('ow_rhino_stamp', 'Tepinme', 'self_aoe', 4.2, 4.2, 12, 1.0, 1.8, 'physical', 'Stamp', 1.0),
  ],
});
add({
  id: 'ow_wasp', name: 'Orman Arısı', model: ITCH('wasp'), scale: 0.55, role: 'swarm', rank: 'trash', hp: 0.3, dmg: 0.5, speed: 6.0, radius: 0.4, aggro: 10, forces: 0, leash: 40, flying: true, hover: 1.2,
  anims: A_WASP, resist: R_BEAST,
  basic: cone('ow_wasp_sting', 'İğne', 1.6, 100, 1.3, 1.0, 'Sting', 0.6, { statuses: [poison(1, 0.15, 5, 0.25)] }),
  abilities: [charge('ow_wasp_dive', 'Dalış', 6, 6, 0.5, 1.2, 'Dive', 0.9)],
});
add({
  id: 'ow_wasp_swamp', name: 'Bataklık Arısı', model: ITCH('wasp'), scale: 0.55, tint: 0x88a838, role: 'swarm', rank: 'trash', hp: 0.35, dmg: 0.6, speed: 6.0, radius: 0.4, aggro: 10, forces: 0, leash: 40, flying: true, hover: 1.2,
  anims: A_WASP, resist: R_BEAST,
  basic: cone('ow_wasp_swamp_sting', 'İğne', 1.6, 100, 1.3, 1.0, 'Sting', 0.6, { statuses: [poison(2, 0.15, 5, 0.25)] }),
  abilities: [charge('ow_wasp_swamp_dive', 'Dalış', 6, 6, 0.5, 1.2, 'Dive', 0.9)],
});
add({
  id: 'ow_deer', name: 'Geyik', model: ITCH('deer'), scale: 0.8, role: 'support', rank: 'trash', hp: 0.5, dmg: 0.6, speed: 9.5, radius: 0.7, aggro: 14, forces: 0, xp: 0, leash: 40,
  anims: A_WOLF, resist: R_BEAST, ai: { flee: true, neutral: true, sleepRange: 30 },
  basic: cone('ow_deer_horn', 'Boynuz Vuruşu', 2.0, 100, 2.0, 0.6, 'Attack', 0.5),
});
add({
  id: 'ow_spider_giant', name: 'Dev Örümcek', model: ITCH('spider'), scale: 0.8, role: 'melee', rank: 'elite', hp: 3.5, dmg: 1.4, speed: 6.4, radius: 1.2, aggro: 12, forces: 0, leash: 40,
  anims: A_WOLF, resist: R_SPIDER,
  basic: cone('ow_spider_giant_bite', 'Isırık', 2.8, 100, 1.8, 1.0, 'Bite', 0.5, { statuses: [poison(2)] }),
  abilities: [
    charge('ow_spider_giant_strike', 'Atılma', 8, 9, 0.7, 1.8, 'Strike', 0.73),
    proj('ow_spider_giant_web', 'Ağ Atışı', 16, 12, 12, 0.6, 0.3, 'physical', 'bolt_projectile', 'WebSpit', 0.67, { statuses: [{ status: 'root', duration: 2 }] }),
  ],
});
add({
  id: 'ow_centipede', name: 'Çürük Çıyanı', model: ITCH('centipede'), scale: 1.0, role: 'melee', rank: 'trash', hp: 1.2, dmg: 1.1, speed: 6.0, radius: 0.7, aggro: 7, forces: 0, leash: 40,
  anims: { ...A_WOLF, spawn: 'Emerge' }, resist: R_BEAST, ai: { dormant: true, wakeRange: 7 },
  basic: cone('ow_centipede_bite', 'Zehirli Isırık', 2.6, 90, 1.8, 1.0, 'Bite', 0.55, { statuses: [poison(2)] }),
});
add({
  id: 'ow_ooze', name: 'Bataklık Çamuru', model: ITCH('ooze'), scale: 0.55, tint: 0xcaa040, role: 'melee', rank: 'trash', hp: 1.5, dmg: 1.0, speed: 2.8, radius: 0.9, aggro: 8, forces: 0, leash: 40,
  anims: A_WOLF, resist: R_BEAST,
  basic: cone('ow_ooze_lash', 'Kırbaç', 3.0, 110, 2.2, 1.0, 'Lash', 0.67),
  abilities: [
    proj('ow_ooze_spit', 'Asit Tükürüğü', 12, 12, 7, 0.7, 0.9, 'poison', 'poison_projectile', 'Spit', 0.7, { statuses: [poison(1)] }),
    onDeath(summonAb('ow_ooze_split', 'Bölünme', 'ow_ooze_half', 2, 0, '', 0, { vfx: 'add_spawn' })),
  ],
});
add({
  id: 'ow_ooze_half', name: 'Çamur Parçası', model: ITCH('ooze'), scale: 0.34, tint: 0xcaa040, role: 'swarm', rank: 'trash', hp: 0.25, dmg: 0.5, speed: 3.6, radius: 0.5, aggro: 10, forces: 0, leash: 40,
  anims: A_WOLF, resist: R_BEAST, ai: { summoned: true },
  basic: cone('ow_ooze_half_lash', 'Kırbaç', 1.8, 100, 1.6, 1.0, 'Lash', 0.67),
});
// ---- bandits (KayKit Rogue / Barbarian / Knight)
add({
  id: 'ow_bandit', name: 'Haydut', model: CHAR('Rogue'), scale: 1.0, tint: 0x8a6a48, role: 'melee', rank: 'trash', hp: 1.0, dmg: 1.0, speed: 6.0, radius: 0.5, aggro: 10, forces: 0, leash: 40,
  anims: A_KAYKIT, resist: R_BEAST, visual: { hide: ROGUE_HIDE, runRef: 6 },
  basic: cone('ow_bandit_dagger', 'Hançer', 2.2, 100, 1.5, 1.0, 'Dualwield_Melee_Attack_Slice', 0.55),
  abilities: [proj('ow_bandit_knife', 'Bıçak Fırlat', 15, 14, 6, 0.6, 1.1, 'physical', 'dagger_projectile', 'Throw', 0.75)],
});
add({
  id: 'ow_bandit_archer', name: 'Haydut Okçusu', model: CHAR('Rogue'), scale: 1.0, tint: 0x6a5a40, role: 'ranged', rank: 'trash', hp: 0.8, dmg: 1.0, speed: 5.6, radius: 0.5, aggro: 14, forces: 0, leash: 40,
  anims: A_KAYKIT, resist: R_BEAST, ai: { kite: [9, 15] }, visual: { hide: ROGUE_HIDE.filter((n) => n !== '2H_Crossbow'), runRef: 6 },
  basic: proj('ow_bandit_archer_bolt', 'Ok', 22, 18, 2.4, 0.6, 1.0, 'physical', 'arrow_projectile', '2H_Ranged_Shoot', 0.15, { sfx: 'crossbow_shot' }),
  abilities: [{
    id: 'ow_bandit_archer_volley', name: 'Çoklu Ok', kind: 'projectile', range: 15, cooldown: 10, windup: 1.0, telegraph: true, damage: { coef: 0.9, type: 'physical' },
    projectile: { speed: 30, radius: 0.6, vfx: 'arrow_projectile', count: 3, spread: 15 }, anim: '2H_Ranged_Shoot', params: { impact: 0.15, hitscan: 1 }, sfx: 'crossbow_shot',
  }],
});
add({
  id: 'ow_bandit_brute', name: 'Haydut Pehlivanı', model: CHAR('Barbarian'), scale: 1.12, tint: 0x6a4a38, role: 'melee', rank: 'elite', hp: 4.0, dmg: 1.5, speed: 5.2, radius: 0.8, aggro: 11, forces: 0, leash: 40,
  anims: A_KAYKIT, resist: R_BEAST,
  basic: cone('ow_bandit_brute_axe', 'Balta', 3.0, 110, 2.2, 1.0, '2H_Melee_Attack_Slice', 0.5),
  abilities: [
    aoe('ow_bandit_brute_quake', 'Yer Sarsıntısı', 'self_aoe', 4.2, 4.2, 11, 1.0, 2.0, 'physical', '2H_Melee_Attack_Chop', 0.6),
    buff('ow_bandit_brute_cry', 'Savaş Narası', 0.6, 20, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Wave', 0.6, { params: { radius: 12, self: 1 } }),
  ],
});
add({
  id: 'ow_bandit_chief', name: 'Haydut Başı', model: CHAR('Knight'), scale: 1.25, tint: 0x5a3a30, role: 'melee', rank: 'elite', hp: 6.0, dmg: 1.6, speed: 5.4, radius: 0.7, aggro: 12, forces: 0, leash: 40,
  anims: A_KAYKIT, resist: R_BEAST, visual: { hide: KNIGHT_HIDE.filter((n) => n !== '1H_Sword' && n !== 'Round_Shield'), runRef: 6 },
  basic: cone('ow_bandit_chief_sword', 'Kılıç', 2.8, 100, 2.0, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.3),
  abilities: [
    cone('ow_bandit_chief_shield', 'Kalkan Darbesi', 3, 90, 12, 0.8, '1H_Melee_Attack_Chop', 0.4, { windup: 0.8, telegraph: true, statuses: [{ status: 'stun', duration: 1.5 }] }),
    summonAb('ow_bandit_chief_call', 'Yardım Çağır', 'ow_bandit', 3, 40, 'Cheer', 0.8, { params: { hpBelow: 0.6, once: 1 } }),
  ],
});
// ---- puglins (bestiary)
add({
  id: 'ow_puglin', name: 'Puglin Yağmacı', model: PUG, scale: 0.9, role: 'melee', rank: 'trash', hp: 0.9, dmg: 0.9, speed: 5.6, radius: 0.55, aggro: 10, forces: 0, leash: 40,
  anims: A_PUGLIN, resist: R_BEAST,
  basic: cone('ow_puglin_club', 'Sopa', 2.0, 100, 1.6, 1.0, 'Attack_1H_1', 0.25),
  abilities: [proj('ow_puglin_spear', 'Mızrak Fırlat', 14, 14, 6, 0.7, 1.2, 'physical', 'arrow_projectile', 'Throw', 0.6)],
});
add({
  id: 'ow_puglin_chief', name: 'Puglin Reisi', model: PUG, scale: 1.4, role: 'melee', rank: 'elite', hp: 4.0, dmg: 1.5, speed: 5.2, radius: 0.9, aggro: 12, forces: 0, leash: 40,
  anims: A_PUGLIN, resist: R_BEAST,
  basic: cone('ow_puglin_chief_club', 'Sopa Fırtınası', 3.2, 110, 2.4, 1.2, 'Attack_1H_2', 0.35),
  abilities: [
    buff('ow_puglin_chief_cry', 'Savaş Narası', 0.6, 20, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Taunt', 0.8, { params: { radius: 12, self: 1 } }),
    aoe('ow_puglin_chief_slam', 'Yere Vur', 'self_aoe', 3.5, 3.5, 10, 0.9, 1.8, 'physical', 'Attack_2H', 0.8),
  ],
});
// ---- scarecrow (dormant field guard) and the rest of the open-world beasts / undead
add({
  id: 'ow_scarecrow', name: 'Korkuluk', model: CHAR('Barbarian'), scale: 1.05, tint: 0xc8a860, role: 'melee', rank: 'trash', hp: 1.2, dmg: 1.0, speed: 3.8, radius: 0.55, aggro: 8, forces: 0, leash: 40,
  anims: A_KAYKIT, resist: R_BEAST, ai: { dormant: true, wakeRange: 7 }, visual: { runRef: 4 },
  basic: cone('ow_scarecrow_fork', 'Çatal', 2.6, 90, 2.0, 1.0, 'Unarmed_Melee_Attack_Punch_A', 0.45),
  abilities: [onDeath(aoe('ow_scarecrow_straw', 'Saman Bulutu', 'self_aoe', 3, 0, 0, 0.3, 0, 'physical', '', 0, { telegraph: false, vfx: 'poison_cloud', statuses: [{ status: 'blind', duration: 2 }] }))],
});
add({
  id: 'ow_mushroom_brute', name: 'Mantar Zorbası', model: GEN('mushroom_brute'), scale: 1.0, role: 'melee', rank: 'trash', hp: 1.8, dmg: 1.0, speed: 3.8, radius: 0.9, aggro: 9, forces: 0, leash: 40,
  anims: A_GEN, resist: R_BEAST,
  basic: cone('ow_mushroom_brute_bonk', 'Kafa Darbesi', 2.4, 100, 2.0, 1.0, 'Attack', 0.5),
  abilities: [
    aoe('ow_mushroom_spores', 'Spor Patlaması', 'self_aoe', 3, 3, 12, 0.9, 0.4, 'poison', 'Cast', 0.6, { vfx: 'poison_cloud', statuses: [poison(1)], params: { persist: 4, tick: 0.5 } }),
    onDeath(summonAb('ow_mushroom_brute_spawn', 'Mantarcık Doğuşu', 'ow_mushnub', 2, 0, '', 0, { vfx: 'add_spawn' })),
  ],
});
add({
  id: 'ow_ghoul', name: 'Bataklık Gulyabanisi', model: MON('Zombie'), scale: 0.95, tint: 0x7a9a6a, role: 'melee', rank: 'trash', hp: 1.4, dmg: 1.2, speed: 4.2, radius: 0.55, aggro: 9, forces: 0, leash: 40,
  anims: A_ENEMY, resist: R_BEAST,
  basic: cone('ow_ghoul_claw', 'Pençe', 2.2, 100, 2.0, 1.0, 'Attack', 0.37),
  abilities: [
    cone('ow_ghoul_breath', 'Çürük Nefes', 4, 60, 10, 0.4, 'Attack', 0.37, { windup: 0.8, telegraph: true, parryable: false, damage: { coef: 0.4, type: 'poison' }, statuses: [poison(3)] } as Ab),
    summonAb('ow_ghoul_call', 'Leş Çağrısı', 'ow_zombie', 2, 30, 'Attack', 0.37, { params: { hpBelow: 0.5, once: 1 } }),
  ],
});
add({
  id: 'ow_wraith', name: 'Ağıt Hortlağı', model: GEN('wraith'), scale: 1.0, role: 'caster', rank: 'trash', hp: 1.0, dmg: 1.2, speed: 4.8, radius: 0.6, aggro: 12, forces: 0, leash: 40, flying: true, hover: 0.8,
  anims: A_GEN, resist: R_GHOST, visual: { opacity: 0.8 }, ai: { kite: [8, 14] },
  basic: proj('ow_wraith_arrow', 'Gölge Oku', 15, 16, 2.6, 0.6, 1.2, 'shadow', 'shadow_projectile', 'Attack', 0.6),
  abilities: [{
    id: 'ow_wraith_scream', name: 'Korku Çığlığı', kind: 'cone', range: 8, cooldown: 14, windup: 1.6, castTime: 1.6, interruptible: true, shape: { type: 'cone', radius: 8, angle: 70 },
    damage: { coef: 0, type: 'shadow' }, statuses: [{ status: 'fear', duration: 1.5 }], anim: 'Cast', vfx: 'shadow_burst', params: { impact: 0.9 },
  }],
});
add({
  id: 'ow_will', name: 'Bataklık Işığı', model: MON('Ghost'), scale: 0.5, tint: 0x60ffd0, emissive: 0x60ffd0, role: 'swarm', rank: 'trash', hp: 0.3, dmg: 1.5, speed: 6.5, radius: 0.4, aggro: 10, forces: 0, leash: 40, flying: true, hover: 1.2,
  anims: A_FLY, resist: R_GHOST, visual: { emissiveIntensity: 0.9, eyeEmissive: 0x60ffd0, hoverBob: 0.12 },
  basic: aoe('ow_will_burst', 'Patlama', 'self_aoe', 2.5, 2.5, 99, 0.8, 2.0, 'shadow', 'Punch', 0.3, { params: { suicide: 1, impact: 0.3 }, vfx: 'shadow_burst', statuses: [] }),
});
add({
  id: 'ow_witch', name: 'Bataklık Cadısı', model: CHAR('Mage'), scale: 1.1, tint: 0x3a8a58, role: 'caster', rank: 'elite', hp: 3.2, dmg: 1.2, speed: 5.0, radius: 0.55, aggro: 14, forces: 0, leash: 40,
  anims: A_KAYKIT, resist: R_CULT, ai: { kite: [8, 14] }, visual: { hide: mageHide('Mage_Hat', '1H_Wand'), runRef: 6 },
  basic: proj('ow_witch_bolt', 'Zehir Topu', 16, 16, 2.2, 0.6, 1.3, 'poison', 'poison_projectile', 'Spellcast_Shoot', 0.3, { statuses: [poison(2)] }),
  abilities: [
    proj('ow_witch_hex', 'Kurbağa Laneti', 16, 16, 12, 1.5, 0, 'shadow', 'shadow_projectile', 'Spellcast_Raise', 0.3, { castTime: 1.5, interruptible: true, statuses: [{ status: 'root', duration: 2 }, { status: 'curse', duration: 6 }] }),
    heal('ow_witch_heal', 'Şifa Duası', 2.0, 10, 0.25, 'Spellcast_Raise', 1.0),
  ],
});
// ---- orcs and canyon
add({
  id: 'ow_orc', name: 'Ork Savaşçısı', model: MON('Orc'), scale: 0.95, role: 'melee', rank: 'trash', hp: 1.3, dmg: 1.2, speed: 5.2, radius: 0.75, aggro: 11, forces: 0, leash: 40,
  anims: A_CHAR, resist: R_BEAST,
  basic: cone('ow_orc_axe', 'Balta', 3.0, 110, 2.2, 1.0, 'Weapon', 0.45, { windup: 0.55 }),
  abilities: [aoe('ow_orc_spin', 'Dönen Balta', 'self_aoe', 3.5, 3.5, 9, 0.9, 1.4, 'physical', 'Weapon', 0.45)],
});
add({
  id: 'ow_orc_archer', name: 'Ork Fırlatıcısı', model: MON('Orc'), scale: 0.9, tint: 0x9a8a40, role: 'ranged', rank: 'trash', hp: 1.0, dmg: 1.2, speed: 5.0, radius: 0.7, aggro: 14, forces: 0, leash: 40,
  anims: A_CHAR, resist: R_BEAST, ai: { kite: [9, 14] },
  basic: proj('ow_orc_archer_spear', 'Zıpkın', 20, 18, 2.8, 0.5, 1.3, 'physical', 'arrow_projectile', 'Weapon', 0.45),
  abilities: [proj('ow_orc_archer_chain', 'Zincirli Zıpkın', 20, 16, 14, 1.0, 1.0, 'physical', 'arrow_projectile', 'Weapon', 0.45, { statuses: [{ status: 'root', duration: 1 }] })],
});
add({
  id: 'ow_orc_shaman', name: 'Ork Şamanı', model: CHAR('Mage'), scale: 1.1, tint: 0x6a9a30, role: 'support', rank: 'trash', hp: 1.0, dmg: 1.0, speed: 5.0, radius: 0.55, aggro: 14, forces: 0, leash: 40,
  anims: A_KAYKIT, resist: R_CULT, ai: { kite: [8, 14] }, visual: { hide: mageHide('1H_Wand'), runRef: 6 },
  basic: proj('ow_orc_shaman_bolt', 'Ateş Oku', 16, 16, 2.4, 0.6, 1.2, 'fire', 'fire_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    buff('ow_orc_shaman_rage', 'Kan Kızgınlığı', 1.2, 16, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Spellcast_Raise', 0.3, { params: { radius: 14, impact: 0.3 } }),
    heal('ow_orc_shaman_heal', 'Şifa Duası', 2.0, 10, 0.2, 'Spellcast_Raise', 1.0),
  ],
});
add({
  id: 'ow_orc_brute', name: 'Ork Cellatı', model: MON('Orc'), scale: 1.3, tint: 0xb8a090, role: 'melee', rank: 'elite', hp: 4.8, dmg: 1.7, speed: 4.8, radius: 1.0, aggro: 12, forces: 0, leash: 40,
  anims: A_CHAR, resist: R_BEAST,
  basic: cone('ow_orc_brute_blade', 'Pala', 3.4, 110, 2.4, 1.3, 'Weapon', 0.45),
  abilities: [
    line('ow_orc_brute_rend', 'Yarma', 8, 2.2, 9, 1.1, 2.4, 'physical', 'Weapon', 0.45),
    buff('ow_orc_brute_cry', 'Savaş Narası', 0.6, 20, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Wave', 0.8, { params: { radius: 12, self: 1 } }),
  ],
});
add({
  id: 'ow_imp', name: 'Kanyon İblisçiği', model: MON('Imp'), scale: 0.7, tint: 0xff8040, role: 'ranged', rank: 'trash', hp: 0.8, dmg: 1.1, speed: 6.5, radius: 0.5, aggro: 14, forces: 0, leash: 40, flying: true, hover: 0.8,
  anims: A_FLY, resist: R_DEMON, ai: { kite: [8, 14] }, visual: { eyeEmissive: 0xffa020, hoverBob: 0.15 },
  basic: proj('ow_imp_fireball', 'Ateş Topu', 16, 16, 2.4, 0.6, 1.2, 'fire', 'fire_projectile', 'Punch', 0.33),
  abilities: [aoe('ow_imp_rain', 'Kıvılcım Yağmuru', 'ground_aoe', 3, 16, 8, 1.0, 1.0, 'fire', 'Punch', 0.33, { vfx: 'fire_burst' })],
});
add({
  id: 'ow_golem', name: 'Kanyon Golemi', model: GEN('golem_stone'), scale: 1.0, role: 'tank', rank: 'elite', hp: 5.0, dmg: 1.6, speed: 3.2, radius: 1.5, aggro: 11, forces: 0, leash: 40,
  anims: A_GEN, resist: R_GOLEM,
  basic: cone('ow_golem_fist', 'Taş Yumruk', 3.6, 110, 2.4, 1.2, 'Attack2', 0.57, { windup: 0.6 }),
  abilities: [aoe('ow_golem_slam', 'Yer Darbesi', 'self_aoe', 4.5, 4.5, 11, 1.1, 2.2, 'physical', 'Attack', 0.67)],
});
add({
  id: 'ow_ember', name: 'Kor Elementali', model: GEN('elemental_fire'), scale: 1.0, role: 'caster', rank: 'elite', hp: 3.5, dmg: 1.5, speed: 4.5, radius: 1.1, aggro: 13, forces: 0, leash: 40, flying: true, hover: 0.1,
  anims: A_GEN, resist: R_DEMON, ai: { kite: [6, 12] }, visual: { hoverBob: 0.1 },
  basic: proj('ow_ember_orb', 'Alev Topu', 15, 16, 2.6, 0.9, 1.4, 'fire', 'fire_projectile', 'Cast', 0.9),
  abilities: [aoe('ow_ember_ring', 'Ateş Halkası', 'self_aoe', 6, 6, 12, 1.3, 1.8, 'fire', 'Cast', 0.9, { vfx: 'fire_burst' })],
});
add({
  id: 'ow_grave_knight', name: 'Mezar Şövalyesi', model: CHAR('Knight'), scale: 1.1, tint: 0x4a4a68, role: 'tank', rank: 'elite', hp: 4.5, dmg: 1.5, speed: 5.0, radius: 0.7, aggro: 11, forces: 0, leash: 40,
  anims: A_KAYKIT, resist: R_SKELETON, visual: { hide: KNIGHT_HIDE.filter((n) => n !== '1H_Sword' && n !== 'Rectangle_Shield'), eyeEmissive: 0x80a0ff, runRef: 5 },
  basic: cone('ow_grave_knight_slash', 'Kılıç', 2.8, 100, 2.2, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.3),
  abilities: [
    buff('ow_grave_knight_wall', 'Kalkan Duvarı', 0.8, 18, [{ status: 'shield', duration: 8 }], '1H_Melee_Attack_Slice_Horizontal', 0.3, { vfx: 'shield_bubble', params: { shieldPct: 0.25, self: 1 } }),
    cone('ow_grave_knight_tomb', 'Mezar Darbesi', 3.2, 100, 12, 1.6, '1H_Melee_Attack_Slice_Horizontal', 0.4, { windup: 1.0, telegraph: true, statuses: [{ status: 'stun', duration: 1.2 }] }),
  ],
});
add({
  id: 'ow_vampire', name: 'Kan Lordu', model: GRAVE('character-vampire'), scale: 3.0, role: 'melee', rank: 'elite', hp: 4.2, dmg: 1.5, speed: 6.0, radius: 0.7, aggro: 13, forces: 0, leash: 40,
  anims: A_KENNEY, resist: R_GHOST,
  basic: cone('ow_vampire_claw', 'Pençe', 2.4, 100, 1.8, 1.0, 'attack-melee-right', 1.0),
  abilities: [
    summonAb('ow_vampire_bats', 'Yarasa Sürüsü', 'ow_bat', 4, 25, 'attack-melee-right', 0.8),
    aoe('ow_vampire_drain', 'Kan Hasadı', 'self_aoe', 5, 5, 12, 1.1, 1.8, 'shadow', 'attack-melee-right', 0.5),
  ],
});
add({
  id: 'ow_keeper', name: 'Mezarlık Bekçisi', model: GRAVE('character-keeper'), scale: 3.0, role: 'melee', rank: 'elite', hp: 6.0, dmg: 1.4, speed: 5.0, radius: 0.7, aggro: 11, forces: 0, leash: 40,
  anims: A_KENNEY, resist: R_BEAST,
  basic: cone('ow_keeper_shovel', 'Kürek', 2.6, 110, 2.2, 1.0, 'attack-melee-left', 1.0),
  abilities: [
    proj('ow_keeper_clod', 'Toprak Fırlat', 14, 14, 8, 0.8, 1.0, 'physical', 'rock_projectile', 'attack-melee-left', 0.5, { statuses: [{ status: 'blind', duration: 2 }] }),
    summonAb('ow_keeper_rattlers', 'Mezar Aç', 'skel_rattler', 3, 20, 'attack-melee-left', 0.5, { params: { hpBelow: 0.5, once: 1 } }),
  ],
});

// 3.3 Kemik Mahzeni
// =====================================================================================================================
add({
  id: 'skel_rattler', name: 'Takırdayan İskelet', model: SKEL('Skeleton_Minion'), scale: 0.8, tint: 0xcfc4a8, role: 'swarm', rank: 'trash', hp: 0.35, dmg: 0.5, speed: 6.7, radius: 0.45, aggro: 8, forces: 1,
  anims: A_SKEL, resist: R_SKELETON, ai: { dormant: true, wakeRange: 6, bonePile: 12 }, visual: { hide: ['Skeleton_Minion_Cloak'], eyeEmissive: 0xffe030, runRef: 7 },
  basic: cone('skel_rattler_punch', 'Yumruk', 1.6, 100, 1.6, 1.0, 'Unarmed_Melee_Attack_Punch_A', 0.45, { windup: 0.4 }),
});
add({
  id: 'crypt_rat', name: 'Mahzen Faresi', model: MON('Rat'), scale: 0.31, tint: 0x6a5a50, role: 'swarm', rank: 'trash', hp: 0.25, dmg: 0.4, speed: 7.7, radius: 0.3, aggro: 8, forces: 1,
  anims: A_RAT,
  basic: cone('crypt_rat_bite', 'Veba Isırığı', 1.2, 90, 1.2, 1.0, 'Rat_Attack', 0.43, { windup: 0.4, statuses: [poison(1, 0.15, 5, 0.2)] }),
});
add({
  id: 'bone_skull', name: 'Uçan Kafatası', model: MON('Skull'), scale: 0.71, tint: 0xe8e0c8, role: 'swarm', rank: 'trash', hp: 0.4, dmg: 1, speed: 7.7, radius: 0.4, aggro: 10, forces: 1, flying: true, hover: 0.8,
  anims: A_BLOB, resist: R_SKELETON, visual: { eyeEmissive: 0x60ff90, hoverBob: 0.12 },
  basic: aoe('bone_skull_blast', 'Kafatası Patlaması', 'self_aoe', 2.5, 2.5, 99, 0.8, 2.0, 'physical', 'Bite_Front', 0.30, { params: { suicide: 1, impact: 0.3 }, vfx: 'fire_burst', statuses: [] }),
});
add({
  id: 'skel_minion', name: 'İskelet Er', model: SKEL('Skeleton_Minion'), scale: 1, role: 'melee', rank: 'trash', hp: 1, dmg: 1, speed: 5.9, radius: 0.55, aggro: 9, forces: 2,
  anims: A_SKEL, resist: R_SKELETON, ai: { bonePile: 12 }, visual: { attach: W_BLADE, eyeEmissive: 0xffe030, runRef: 7 },
  basic: cone('skel_minion_chop', 'Kılıç', 2.4, 90, 2.0, 1.0, '1H_Melee_Attack_Chop', 0.58, { windup: 0.5 }),
});
add({
  id: 'skel_archer', name: 'İskelet Okçu', model: SKEL('Skeleton_Rogue'), scale: 1, role: 'ranged', rank: 'trash', hp: 0.8, dmg: 1, speed: 5.6, radius: 0.5, aggro: 12, forces: 3,
  anims: A_SKEL, resist: R_SKELETON, ai: { kite: [8, 14], bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Crossbow'), bone: 'handslot.r', pos: [-0.105, -0.01, 0], rotY: Math.PI / 2 }], eyeEmissive: 0xffe030, runRef: 7 },
  basic: proj('skel_archer_bolt', 'Kemik Ok', 22, 18, 2.4, 0.6, 1.0, 'physical', 'arrow_projectile', '2H_Ranged_Shoot', 0.15, { sfx: 'crossbow_shot' }),
  abilities: [{
    id: 'skel_archer_volley', name: 'Çoklu Atış', kind: 'projectile', range: 18, cooldown: 10, windup: 1.0, telegraph: true, damage: { coef: 0.9, type: 'physical' },
    projectile: { speed: 30, radius: 0.6, vfx: 'arrow_projectile', count: 3, spread: 15 }, anim: '2H_Ranged_Shoot', params: { impact: 0.15, hitscan: 1 }, sfx: 'crossbow_shot',
  }],
});
add({
  id: 'skel_mage', name: 'Kemik Büyücüsü', model: SKEL('Skeleton_Mage'), scale: 1, role: 'caster', rank: 'trash', hp: 1.1, dmg: 1.2, speed: 4.9, radius: 0.5, aggro: 12, forces: 4,
  anims: A_SKEL, resist: R_SKELETON, ai: { kite: [9, 16], bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Staff'), bone: 'handslot.r', pos: [0, 0, 0], rotY: Math.PI }], eyeEmissive: 0xffe030, runRef: 7 },
  basic: proj('skel_mage_bolt', 'Gölge Oku', 16, 20, 2.6, 0.8, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [{
    id: 'skel_mage_raise', name: 'Ölüleri Kaldır', kind: 'custom', range: 18, cooldown: 14, initialCooldown: 4, windup: 2.5, castTime: 2.5, interruptible: true,
    anim: 'Spellcast_Summon', vfx: 'shadow_burst', sfx: 'shadow_cast', params: { impact: 4.2, raise: 1, count: 3, piles: 15 },
  }],
});
add({
  id: 'crypt_ghoul', name: 'Gulyabani', model: MON('Zombie'), scale: 0.93, tint: 0x9fb59a, role: 'melee', rank: 'trash', hp: 1.4, dmg: 1.2, speed: 6.4, radius: 0.5, aggro: 9, forces: 4,
  anims: A_ENEMY,
  basic: cone('crypt_ghoul_claw', 'Yırtıcı Pençe', 2.2, 90, 1.6, 1.0, 'Attack', 0.37, { statuses: [bleed(1, 0.2, 6)] }),
  abilities: [{
    id: 'crypt_ghoul_feast', name: 'Leş Yiyici', kind: 'custom', range: 6, cooldown: 12, windup: 2.0, castTime: 2.0, interruptible: true, healPct: 0.3, anim: 'Idle',
    params: { hpBelow: 0.4, needCorpse: 1, corpseRange: 6, loop: 1 },
  }],
});
add({
  id: 'crypt_wraith', name: 'Mahzen Hortlağı', model: MON('Ghost'), scale: 0.79, tint: 0x88ffcc, role: 'caster', rank: 'trash', hp: 1.2, dmg: 1.1, speed: 5, radius: 0.5, aggro: 11, forces: 5, flying: true,
  anims: A_FLY, resist: R_GHOST, visual: { opacity: 0.65, eyeEmissive: 0x88ffcc, hoverBob: 0.1 }, ai: { kite: [7, 14] },
  basic: proj('crypt_wraith_touch', 'Ruh Dokunuşu', 14, 18, 2.2, 0.6, 1.0, 'shadow', 'shadow_projectile', 'Punch', 0.33),
  abilities: [
    aoe('crypt_wraith_scream', 'Korkunç Çığlık', 'self_aoe', 8, 8, 16, 2.0, 0, 'shadow', 'No', 0.6, { castTime: 2.0, interruptible: true, statuses: [{ status: 'fear', duration: 3 }], vfx: 'shadow_burst', sfx: 'boss_cast', params: { impact: 0.6 } }),
    { id: 'crypt_wraith_drain', name: 'Ruh Emme', kind: 'custom', range: 13, cooldown: 12, windup: 0.5, castTime: 3.0, interruptible: true, damage: { coef: 0.5, type: 'shadow' }, anim: 'Punch', params: { loop: 1, tick: 0.5, healMult: 3.0, impact: 0.33 } },
  ],
});
add({
  id: 'skel_warrior', name: 'İskelet Muhafız', model: SKEL('Skeleton_Warrior'), scale: 1.07, role: 'tank', rank: 'elite', hp: 2.6, dmg: 1.3, speed: 5.3, radius: 0.65, aggro: 10, forces: 6,
  anims: { ...A_SKEL, idle: 'Idle_Combat', walk: 'Walking_A', run: 'Running_A' }, resist: R_SKELETON, ai: { bonePile: 12 },
  visual: { attach: [...W_BLADE, { url: WPN('Skeleton_Shield_Large_A'), bone: 'handslot.l', pos: [0, 0.017, 0.05] }], eyeEmissive: 0xffe030, runRef: 7 },
  basic: cone('skel_warrior_slash', 'Yatay Kesik', 2.6, 100, 2.2, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.3, { windup: 0.55 }),
  abilities: [
    passive('skel_warrior_stance', 'Kalkan Duruşu', { arc: 120, reduce: 0.6 }),
    cone('skel_warrior_bash', 'Kalkan Darbesi', 3.5, 60, 12, 2.0, 'Block_Attack', 0.4, { windup: 0.8, telegraph: true, knockback: 5, params: { interrupt: 1 } } as Ab),
  ],
});
add({
  id: 'bone_golem', name: 'Kemik Golemi', model: MON('Giant'), scale: 1.07, tint: 0xe8dcc0, role: 'tank', rank: 'elite', hp: 6, dmg: 2, speed: 4.2, radius: 1.1, aggro: 10, forces: 12, ccImmune: true,
  anims: A_ENEMY, resist: R_GOLEM,
  basic: cone('bone_golem_smash', 'Ezme', 3.5, 120, 2.8, 1.0, 'Attack', 0.47, { windup: 0.65 }),
  abilities: [
    aoe('bone_golem_quake', 'Yer Sarsıntısı', 'self_aoe', 6, 6, 14, 1.4, 2.5, 'physical', 'Attack', 0.47, { statuses: [{ status: 'knockdown', duration: 1 }], vfx: 'ground_slam', sfx: 'ground_slam' }),
    passive('bone_golem_armor', 'Kemik Zırhı', { hpBelow: 0.5, shieldPct: 0.2, duration: 10 }),
    onDeath({ id: 'bone_golem_burst', name: 'Kemik Patlaması', kind: 'summon', range: 0, cooldown: 0, windup: 0, anim: '', summon: { enemyId: 'skel_rattler', count: 4 }, vfx: 'death_bones' }),
  ],
});

// =====================================================================================================================
// 3.4 Kızıl Dökümhane
// =====================================================================================================================
add({
  id: 'forge_goblin', name: 'Dökümhane Goblini', model: MON('Goblin'), scale: 0.59, tint: 0x8a6a50, role: 'swarm', rank: 'trash', hp: 0.45, dmg: 0.6, speed: 7, radius: 0.4, aggro: 9, forces: 1,
  anims: A_ENEMY,
  basic: cone('forge_goblin_hammer', 'Çekiç', 1.6, 100, 1.4, 1.0, 'Attack', 0.37, { windup: 0.4 }),
  abilities: [aoe('forge_goblin_ember', 'Kor Fırlat', 'ground_aoe', 1.5, 13, 8, 0.9, 1.2, 'fire', 'Attack', 0.37, { vfx: 'fire_ground', params: { persist: 3, persistCoef: 0.3, tick: 0.5, minRange: 4 } })],
});
add({
  id: 'flame_skull', name: 'Alevli Kafatası', model: MON('Skull'), scale: 0.71, tint: 0xff8040, emissive: 0xff4000, role: 'swarm', rank: 'trash', hp: 0.5, dmg: 1, speed: 7.7, radius: 0.4, aggro: 10, forces: 1, flying: true, hover: 0.8,
  anims: A_BLOB, resist: { ...R_SKELETON, fire: 0.75, frost: -0.25 }, visual: { eyeEmissive: 0xff4000, hoverBob: 0.12, emissiveIntensity: 0.7, glow: 0xff6020 },
  basic: cone('flame_skull_bite', 'Isırık', 1.4, 100, 1.4, 1.0, 'Bite_Front', 0.3, { windup: 0.4, damage: { coef: 1.0, type: 'fire' } } as Ab),
  abilities: [{
    id: 'flame_skull_dash', name: 'Alev Hücumu', kind: 'charge', range: 8, cooldown: 9, windup: 0.8, telegraph: true, shape: { type: 'line', length: 8, width: 1.5 },
    damage: { coef: 1.6, type: 'fire' }, statuses: [burn(0.3, 4)], anim: 'Bite_Front', vfx: 'fire_burst', params: { impact: 0.3, dash: 0.3, minRange: 3 },
  }],
});
add({
  id: 'forge_imp', name: 'Ateş İblisçiği', model: MON('Imp'), scale: 0.67, tint: 0xff6030, role: 'ranged', rank: 'trash', hp: 0.7, dmg: 1, speed: 7, radius: 0.45, aggro: 12, forces: 2, flying: true,
  anims: A_FLY, resist: R_DEMON, ai: { kite: [8, 14] }, visual: { eyeEmissive: 0xffa020, hoverBob: 0.15 },
  basic: proj('forge_imp_fireball', 'Ateş Topu', 18, 18, 2.0, 0.5, 1.0, 'fire', 'fire_projectile', 'Punch', 0.33, { sfx: 'fire_cast' }),
  abilities: [aoe('forge_imp_rain', 'Ateş Yağmuru', 'ground_aoe', 4, 16, 15, 2.0, 0.6, 'fire', 'Punch', 0.33, { castTime: 2.0, interruptible: true, vfx: 'fire_burst', params: { persist: 1.0, tick: 0.5, impact: 0.33 } })],
});
add({
  id: 'lava_slime', name: 'Lav Balçığı', model: GEN('slime_lava'), scale: 1.33, role: 'melee', rank: 'trash', hp: 1, dmg: 1, speed: 5, radius: 0.8, aggro: 9, forces: 2,
  anims: A_GEN, resist: { fire: 0.75, frost: -0.25 },
  basic: cone('lava_slime_hit', 'Kızgın Çarpma', 1.6, 100, 1.8, 1.0, 'Attack', 0.57, { damage: { coef: 1.0, type: 'fire' } } as Ab),
  abilities: [
    onDeath({ id: 'lava_slime_split', name: 'Bölünme', kind: 'summon', range: 0, cooldown: 0, windup: 0, anim: '', summon: { enemyId: 'lava_slimelet', count: 2 }, vfx: 'add_spawn' }),
    onDeath(aoe('lava_slime_puddle', 'Lav Birikintisi', 'self_aoe', 2, 0, 0, 0.3, 0.4, 'fire', '', 0, { telegraph: false, vfx: 'fire_ground', params: { persist: 5, tick: 0.5 } })),
  ],
});
add({
  id: 'lava_slimelet', name: 'Lav Damlası', model: GEN('slime_lava'), scale: 0.8, role: 'swarm', rank: 'trash', hp: 0.25, dmg: 0.5, speed: 6.2, radius: 0.5, aggro: 10, forces: 0,
  anims: A_GEN, resist: { fire: 0.75, frost: -0.25 }, ai: { summoned: true },
  basic: cone('lava_slimelet_hit', 'Çarpma', 1.2, 100, 1.4, 1.0, 'Attack', 0.57, { windup: 0.4, damage: { coef: 1.0, type: 'fire' } } as Ab),
});
add({
  id: 'fire_priest', name: 'Ateş Rahibi', model: CHAR('Mage'), scale: 1, tint: 0x7a2020, role: 'healer', rank: 'trash', hp: 1.3, dmg: 0.9, speed: 4.9, radius: 0.55, aggro: 12, forces: 5,
  anims: A_KAYKIT, resist: R_CULT, ai: { kite: [10, 16] }, visual: { hide: mageHide('2H_Staff', 'Mage_Hat'), runRef: 7 },
  basic: proj('fire_priest_bolt', 'Kor Oku', 16, 18, 2.4, 0.6, 1.0, 'fire', 'fire_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'fire_cast' }),
  abilities: [
    heal('fire_priest_heal', 'Alev Şifası', 2.0, 10, 0.25, 'Spellcast_Raise', 1.0),
    buff('fire_priest_shield', 'Kızıl Kalkan', 1.5, 16, [{ status: 'shield', duration: 10 }], 'Spellcast_Raise', 1.0, { vfx: 'shield_bubble', params: { shieldPct: 0.2, single: 1, radius: 16, impact: 1.0 } }),
  ],
});
add({
  id: 'forge_demon', name: 'Kor İblisi', model: MON('Demon'), scale: 1.09, tint: 0xc03020, role: 'melee', rank: 'elite', hp: 2.2, dmg: 1.6, speed: 5.9, radius: 0.7, aggro: 10, forces: 6,
  anims: A_ENEMY, resist: { ...R_DEMON },
  basic: cone('forge_demon_claw', 'Alevli Pençe', 2.6, 100, 2.0, 1.0, 'Attack', 0.37, { windup: 0.55, statuses: [burn(0.25, 4)] }),
  abilities: [
    cone('forge_demon_breath', 'Alev Soluğu', 6, 60, 12, 1.8, 'Attack', 0.37, { windup: 1.0, telegraph: true, damage: { coef: 1.8, type: 'fire' }, vfx: 'fire_burst' } as Ab),
    passive('forge_demon_rage', 'Kızgınlık', { hpBelow: 0.3, atkSpeed: 0.4 }),
  ],
});
add({
  id: 'forge_orc', name: 'Ork Köle Başı', model: MON('Orc'), scale: 1.05, tint: 0x8a4a3a, role: 'melee', rank: 'elite', hp: 2.8, dmg: 1.5, speed: 5.6, radius: 0.8, aggro: 10, forces: 7,
  anims: A_CHAR,
  basic: cone('forge_orc_axe', 'Balta', 3, 110, 2.2, 1.0, 'Weapon', 0.45, { windup: 0.55 }),
  abilities: [
    cone('forge_orc_whip', 'Kırbaç Şaklaması', 7, 90, 10, 1.6, 'Weapon', 0.45, { windup: 0.9, telegraph: true, statuses: [{ status: 'slow', duration: 3, magnitude: 0.3 }] } as Ab),
    buff('forge_orc_haste', 'Çalışın!', 2.0, 18, [{ status: 'haste', duration: 10, magnitude: 0.3 }], 'Wave', 0.8, { vfx: 'war_cry', sfx: 'war_cry', params: { radius: 12, self: 1, impact: 0.8 } }),
  ],
});
add({
  id: 'magma_golem', name: 'Magma Golemi', model: GEN('elemental_fire'), scale: 1.4, role: 'tank', rank: 'elite', hp: 4, dmg: 1.8, speed: 3.9, radius: 1.2, aggro: 10, forces: 10, ccImmune: true,
  anims: A_GEN, resist: { ...R_GOLEM, fire: 0.9, frost: -0.25 }, visual: { runRef: 3.3 },
  basic: cone('magma_golem_punch', 'Yumruk', 3, 100, 2.6, 1.0, 'Attack', 0.5, { windup: 0.65 }),
  abilities: [
    aoe('magma_golem_slam', 'Lav Yumruğu', 'self_aoe', 5, 5, 12, 1.3, 2.2, 'fire', 'Cast', 0.9, { vfx: 'ground_slam', sfx: 'ground_slam' }),
    onDeath(aoe('magma_golem_meltdown', 'Çekirdek Erimesi', 'self_aoe', 6, 0, 0, 3.0, 3.0, 'fire', '', 0, { vfx: 'fire_burst', params: { impact: 0 } })),
  ],
});

// =====================================================================================================================
// 3.5 Buzul Tahtı
// =====================================================================================================================
add({
  id: 'ice_bat', name: 'Buz Yarasası', model: MON('Bat'), scale: 0.47, tint: 0xdff4ff, role: 'swarm', rank: 'trash', hp: 0.3, dmg: 0.5, speed: 8.4, radius: 0.4, aggro: 11, forces: 1, flying: true,
  anims: A_BAT,
  basic: cone('ice_bat_bite', 'Dondurucu Isırık', 1.4, 100, 1.3, 1.0, 'Bat_Attack2', 0.33, { windup: 0.4, damage: { coef: 1.0, type: 'frost' }, statuses: [chill(1, 4)] } as Ab),
});
add({
  id: 'frost_slime', name: 'Ayaz Balçığı', model: GEN('slime_frost'), scale: 1.33, role: 'melee', rank: 'trash', hp: 0.8, dmg: 0.8, speed: 5, radius: 0.8, aggro: 9, forces: 2,
  anims: A_GEN, resist: { frost: 0.75, fire: -0.25 },
  basic: cone('frost_slime_hit', 'Buz Çarpması', 1.6, 100, 1.8, 1.0, 'Attack', 0.57, { damage: { coef: 1.0, type: 'frost' } } as Ab),
  abilities: [onDeath(aoe('frost_slime_nova', 'Buz Patlaması', 'self_aoe', 3, 0, 0, 0.8, 1.0, 'frost', '', 0, { statuses: [chill(2, 4)], vfx: 'frost_nova' }))],
});
add({
  id: 'frost_dead', name: 'Donmuş Ölü', model: SKEL('Skeleton_Minion'), scale: 1, tint: 0x9fd8ff, role: 'melee', rank: 'trash', hp: 1, dmg: 1, speed: 5.9, radius: 0.55, aggro: 9, forces: 2,
  anims: A_SKEL, resist: { ...R_SKELETON, fire: -0.5, frost: 0.3 }, ai: { bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Axe'), bone: 'handslot.r', pos: [0, 0.0333, 0], rotY: Math.PI }], eyeEmissive: 0x80d0ff, runRef: 7 },
  basic: cone('frost_dead_axe', 'Buz Baltası', 2.4, 90, 2.0, 1.0, '1H_Melee_Attack_Chop', 0.58, { windup: 0.5, damage: { coef: 1.0, type: 'frost' }, statuses: [chill(1, 4)] } as Ab),
});
add({
  id: 'snow_spider', name: 'Kar Örümceği', model: MON('Spider'), scale: 0.63, tint: 0xf0f6ff, role: 'ranged', rank: 'trash', hp: 0.9, dmg: 1, speed: 7, radius: 0.6, aggro: 10, forces: 3,
  anims: A_SPIDER, resist: { ...R_SPIDER, frost: 0.5 }, ai: { kite: [5, 10] },
  basic: cone('snow_spider_bite', 'Isırık', 1.8, 90, 1.6, 1.0, 'Spider_Attack', 0.42),
  abilities: [proj('snow_spider_web', 'Buz Ağı', 16, 14, 10, 0.6, 0.3, 'frost', 'frost_projectile', 'Spider_Attack', 0.42, { statuses: [{ status: 'root', duration: 2 }, chill(2, 4)] })],
});
add({
  id: 'frost_wraith', name: 'Buz Hortlağı', model: MON('Ghost'), scale: 0.79, tint: 0xb0e8ff, role: 'caster', rank: 'trash', hp: 1.1, dmg: 1.2, speed: 5, radius: 0.5, aggro: 11, forces: 4, flying: true,
  anims: A_FLY, resist: { ...R_GHOST, frost: 0.75, fire: -0.25 }, visual: { opacity: 0.7, eyeEmissive: 0x80d0ff, hoverBob: 0.1 }, ai: { kite: [8, 15] },
  basic: proj('frost_wraith_bolt', 'Buz Oku', 16, 18, 2.2, 0.6, 1.0, 'frost', 'frost_projectile', 'Punch', 0.33, { sfx: 'frost_cast' }),
  abilities: [
    proj('frost_wraith_lance', 'Buz Mızrağı', 24, 22, 9, 2.5, 2.4, 'frost', 'frost_projectile', 'Punch', 0.33, { castTime: 2.5, interruptible: true, statuses: [{ status: 'freeze', duration: 1 }], sfx: 'frost_cast', params: { impact: 0.33 } }),
    aoe('frost_wraith_storm', 'Kar Fırtınası', 'ground_aoe', 4, 16, 16, 0.9, 0.4, 'frost', 'Punch', 0.33, { statuses: [chill(1, 3)], vfx: 'blizzard', params: { persist: 4, tick: 0.5, impact: 0.33, target: 1 } }),
  ],
});
add({
  id: 'ice_elemental', name: 'Buz Elementali', model: GEN('elemental_ice'), scale: 1.05, role: 'support', rank: 'elite', hp: 2, dmg: 1, speed: 4.2, radius: 0.85, aggro: 11, forces: 6,
  anims: A_GEN, resist: { ...R_GOLEM, frost: 0.9, fire: -0.25 }, ai: { kite: [7, 13] }, visual: { runRef: 3.2 },
  basic: proj('ice_elemental_shard', 'Kristal Kıymığı', 18, 16, 2.4, 0.6, 1.0, 'frost', 'frost_projectile', 'Cast', 0.9, { sfx: 'frost_cast' }),
  abilities: [
    buff('ice_elemental_armor', 'Buz Zırhı', 2.0, 14, [{ status: 'shield', duration: 10 }], 'Cast', 0.9, { vfx: 'shield_bubble', params: { shieldPct: 0.25, single: 1, radius: 15, impact: 0.9 } }),
    onDeath({ id: 'ice_elemental_shatter', name: 'Parçalanma', kind: 'custom', range: 0, cooldown: 0, windup: 1.0, anim: '', damage: { coef: 1.2, type: 'frost' }, shape: { type: 'line', length: 10, width: 1 }, params: { onDeath: 1, lines: 8 }, vfx: 'frost_burst' }),
  ],
});
add({
  id: 'yeti_brute', name: 'Genç Yeti', model: MON('Yeti'), scale: 1, role: 'melee', rank: 'elite', hp: 3.5, dmg: 1.7, speed: 6.2, radius: 0.95, aggro: 10, forces: 8,
  anims: A_ENEMY, resist: { frost: 0.5, fire: -0.25 },
  basic: cone('yeti_claw', 'Pençe', 3, 120, 2.4, 1.0, 'Attack', 0.5, { windup: 0.6 }),
  abilities: [
    { id: 'yeti_snowball', name: 'Kar Topu', kind: 'projectile', range: 16, cooldown: 11, windup: 1.0, telegraph: true, damage: { coef: 2.0, type: 'frost' }, statuses: [{ status: 'knockdown', duration: 1 }],
      projectile: { speed: 14, radius: 1.2, vfx: 'frost_projectile' }, anim: 'Attack', params: { impact: 0.5 } },
    aoe('yeti_leap', 'Sarsıcı Sıçrayış', 'ground_aoe', 5, 14, 15, 1.2, 1.8, 'physical', 'Jump', 0.25, { vfx: 'ground_slam', sfx: 'ground_slam', params: { leap: 1, minRange: 4 } }),
    passive('yeti_chest', 'Göğüs Yumruklama', { hpBelow: 0.5, damage: 0.3, duration: 10, once: 1 }),
  ],
});
add({
  id: 'frost_knight', name: 'Ayaz Şövalyesi', model: CHAR('Knight'), scale: 1.07, tint: 0x8ab8e0, role: 'tank', rank: 'elite', hp: 3, dmg: 1.6, speed: 5.3, radius: 0.65, aggro: 10, forces: 8,
  anims: A_KAYKIT, resist: { frost: 0.5, fire: -0.1, physical: 0.15 }, visual: { hide: KNIGHT_HIDE.filter((n) => n !== '2H_Sword' && n !== 'Knight_Helmet' && n !== 'Knight_Cape'), runRef: 7 },
  basic: cone('frost_knight_slice', '2H Kesik', 3, 120, 2.4, 1.0, '2H_Melee_Attack_Slice', 0.4, { windup: 0.55 }),
  abilities: [
    cone('frost_knight_cleave', 'Dondurucu Kesik', 5, 120, 9, 2.5, '2H_Melee_Attack_Slice', 0.4, { windup: 1.0, telegraph: true, damage: { coef: 2.5, type: 'frost' }, statuses: [chill(3, 5)] } as Ab),
    passive('frost_knight_aura', 'Ayaz Aurası', { radius: 6, interval: 2 }),
  ],
});

// =====================================================================================================================
// 3.6 Gölge Tapınağı
// =====================================================================================================================
add({
  id: 'cult_acolyte', name: 'Tarikat Müridi', model: CHAR('Rogue_Hooded'), scale: 1, tint: 0x4a2a6a, role: 'swarm', rank: 'trash', hp: 0.5, dmg: 0.7, speed: 6.4, radius: 0.5, aggro: 9, forces: 1,
  anims: A_KAYKIT, resist: R_CULT, visual: { hide: ROGUE_HIDE.filter((n) => n !== 'Knife'), runRef: 7 },
  basic: cone('cult_acolyte_stab', 'Hançer', 1.6, 100, 1.4, 1.0, '1H_Melee_Attack_Slice_Diagonal', 0.38, { windup: 0.4 }),
  abilities: [passive('cult_acolyte_fanatic', 'Fanatik', { radius: 10, perStack: 0.1, maxStacks: 5, duration: 8 })],
});
add({
  id: 'cult_assassin', name: 'Gölge Suikastçısı', model: CHAR('Rogue'), scale: 1, tint: 0x2a1a3a, role: 'melee', rank: 'trash', hp: 1, dmg: 1.5, speed: 7.3, radius: 0.5, aggro: 6, forces: 3,
  anims: A_KAYKIT, resist: R_CULT, ai: { stealthReveal: 5 }, visual: { hide: ROGUE_HIDE.filter((n) => n !== 'Knife' && n !== 'Knife_Offhand'), runRef: 7 },
  basic: cone('cult_assassin_stab', 'Zehirli Bıçak', 1.8, 90, 1.5, 1.0, 'Dualwield_Melee_Attack_Slice', 0.55, { windup: 0.45, statuses: [poison(1, 0.25, 6)], params: { firstCoef: 2.5 } }),
  abilities: [{ id: 'cult_assassin_smoke', name: 'Duman Bombası', kind: 'custom', range: 6, cooldown: 99, windup: 0.5, anim: 'Throw', vfx: 'stealth_smoke', params: { hpBelow: 0.5, once: 1, vanish: 2, impact: 0.75 } }],
});
add({
  id: 'shade', name: 'Gölge', model: MON('Ghost'), scale: 0.79, tint: 0x301040, role: 'caster', rank: 'trash', hp: 1, dmg: 1.2, speed: 5.6, radius: 0.5, aggro: 11, forces: 3, flying: true,
  anims: A_FLY, resist: R_GHOST, visual: { opacity: 0.55, eyeEmissive: 0xc080ff, hoverBob: 0.1 }, ai: { kite: [8, 15] },
  basic: proj('shade_touch', 'Gölge Dokunuşu', 16, 16, 2.2, 0.6, 1.0, 'shadow', 'shadow_projectile', 'Punch', 0.33, { sfx: 'shadow_cast' }),
  abilities: [aoe('shade_nightmare', 'Kabus', 'ground_aoe', 1.6, 16, 14, 2.0, 0, 'shadow', 'Yes', 0.6, { castTime: 2.0, interruptible: true, statuses: [{ status: 'fear', duration: 4 }], vfx: 'shadow_burst', params: { target: 3, impact: 0.6 } })],
});
add({
  id: 'shadow_spider', name: 'Gece Örümceği', model: MON('Spider'), scale: 0.67, tint: 0x201028, role: 'melee', rank: 'trash', hp: 1.2, dmg: 1.2, speed: 7, radius: 0.6, aggro: 9, forces: 3,
  anims: A_SPIDER, resist: R_SPIDER, visual: { eyeEmissive: 0xa040ff },
  basic: cone('shadow_spider_bite', 'Zehirli Isırık', 1.8, 90, 1.6, 1.0, 'Spider_Attack', 0.42, { statuses: [poison(1)] }),
  abilities: [onDeath({ id: 'shadow_spider_sac', name: 'Yavru Kesesi', kind: 'summon', range: 0, cooldown: 0, windup: 0, anim: '', summon: { enemyId: 'shadow_spiderling', count: 3 }, vfx: 'add_spawn' })],
});
add({
  id: 'shadow_spiderling', name: 'Örümcek Yavrusu', model: MON('Spider'), scale: 0.24, tint: 0x201028, role: 'swarm', rank: 'trash', hp: 0.15, dmg: 0.3, speed: 8, radius: 0.25, aggro: 10, forces: 0,
  anims: A_SPIDER, resist: R_SPIDER, visual: { eyeEmissive: 0xa040ff }, ai: { summoned: true },
  basic: cone('shadow_spiderling_bite', 'Isırık', 1.0, 100, 1.2, 0.3, 'Spider_Attack', 0.42, { windup: 0.35 }),
});
add({
  id: 'void_imp', name: 'Boşluk İblisçiği', model: MON('Imp'), scale: 0.67, tint: 0x8040ff, emissive: 0x6020ff, role: 'ranged', rank: 'trash', hp: 0.6, dmg: 1, speed: 7.3, radius: 0.45, aggro: 12, forces: 2, flying: true,
  anims: A_FLY, resist: R_DEMON, ai: { kite: [8, 14] }, visual: { eyeEmissive: 0xc080ff, hoverBob: 0.15, emissiveIntensity: 0.5 },
  basic: proj('void_imp_bolt', 'Boşluk Oku', 18, 18, 2.0, 0.5, 1.0, 'shadow', 'shadow_projectile', 'Punch', 0.33, { sfx: 'shadow_cast' }),
  abilities: [{ id: 'void_imp_hop', name: 'Sıçrama', kind: 'custom', range: 3, cooldown: 8, windup: 0.15, anim: 'Fast_Flying', vfx: 'blink', params: { blink: 8, trigger: 3 } }],
});
add({
  id: 'shadow_priest', name: 'Gölge Rahibi', model: CHAR('Mage'), scale: 1, tint: 0x3a1050, role: 'healer', rank: 'trash', hp: 1.2, dmg: 0.9, speed: 4.9, radius: 0.55, aggro: 12, forces: 5,
  anims: A_KAYKIT, resist: R_CULT, ai: { kite: [10, 16] }, visual: { hide: mageHide('1H_Wand', 'Spellbook_open', 'Mage_Hat'), runRef: 7 },
  basic: proj('shadow_priest_bolt', 'Zihin Delgisi', 16, 18, 2.4, 0.6, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { statuses: [{ status: 'curse', duration: 6 }], sfx: 'shadow_cast' }),
  abilities: [
    heal('shadow_priest_heal', 'Karanlık Şifa', 2.0, 9, 0.3, 'Spellcast_Raise', 1.0),
    buff('shadow_priest_shield', 'Gölge Kalkanı', 1.5, 15, [{ status: 'shield', duration: 10 }], 'Spellcast_Raise', 1.0, { vfx: 'shield_bubble', params: { shieldPct: 0.2, single: 1, radius: 16, impact: 1.0 } }),
  ],
});
add({
  id: 'cult_summoner', name: 'Tarikat Çağırıcısı', model: CHAR('Mage'), scale: 1, tint: 0x5a1a40, role: 'caster', rank: 'trash', hp: 1.3, dmg: 1, speed: 4.9, radius: 0.55, aggro: 12, forces: 5,
  anims: A_KAYKIT, resist: R_CULT, ai: { kite: [10, 16] }, visual: { hide: mageHide('2H_Staff'), runRef: 7, clipsFrom: SKEL('Skeleton_Mage') },
  basic: proj('cult_summoner_bolt', 'Boşluk Oku', 16, 18, 2.4, 0.6, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'shadow_cast' }),
  abilities: [
    { id: 'cult_summoner_call', name: 'İblis Çağır', kind: 'summon', range: 18, cooldown: 16, initialCooldown: 3, windup: 3.0, castTime: 3.0, interruptible: true, summon: { enemyId: 'void_imp', count: 2 },
      anim: 'Spellcast_Summon', vfx: 'shadow_burst', sfx: 'shadow_cast', params: { impact: 4.2, radius: 2.5 } },
    buff('cult_summoner_rite', 'Karanlık Ayin', 0.5, 20, [{ status: 'empower', duration: 10, magnitude: 0.3 }], 'Spellcasting', 0, { castTime: 4.0, windup: 4.0, interruptible: true, vfx: 'buff_aura', params: { radius: 12, loop: 1 } }),
  ],
});
add({
  id: 'void_demon', name: 'Boşluk Muhafızı', model: MON('Demon'), scale: 1.2, tint: 0x5020a0, emissive: 0x6030ff, role: 'tank', rank: 'elite', hp: 3.2, dmg: 1.7, speed: 5.6, radius: 0.75, aggro: 10, forces: 8,
  anims: A_ENEMY, resist: R_DEMON, visual: { emissiveIntensity: 0.3, eyeEmissive: 0xc080ff },
  basic: cone('void_demon_claw', 'Pençe', 2.8, 100, 2.2, 1.0, 'Attack', 0.37, { windup: 0.55 }),
  abilities: [
    cone('void_demon_crush', 'Ezici Darbe', 4, 70, 12, 3.0, 'Attack', 0.37, { windup: 1.1, telegraph: true, statuses: [{ status: 'sunder', duration: 10 }], vfx: 'shadow_burst' } as Ab),
    aoe('void_demon_pull', 'Boşluk Çekimi', 'self_aoe', 3, 10, 18, 1.5, 1.2, 'shadow', 'Attack', 0.37, { knockback: -4, vfx: 'shadow_burst', params: { pull: 10 } }),
  ],
});
add({
  id: 'cult_ritualist', name: 'Ayin Rahibi', model: CHAR('Mage'), scale: 1.07, tint: 0x5a1a40, role: 'caster', rank: 'trash', hp: 6, dmg: 1, speed: 0, radius: 0.6, aggro: 0, forces: 0,
  anims: A_KAYKIT, resist: R_CULT, ai: { summoned: true }, visual: { hide: mageHide('Spellbook_open', 'Mage_Hat'), runRef: 7, glow: 0xa040ff },
  basic: { id: 'cult_ritualist_none', name: 'Ayin', kind: 'custom', range: 0, cooldown: 99, windup: 0, anim: '', params: { passive: 1 } },
});

// ---- affix / system units owned by the enemies module so G.mplus can spawn them by id ---------------------------------
add({
  id: 'affix_spiteful_shade', name: 'Kin Ruhu', model: MON('Ghost'), scale: 0.67, tint: 0x200010, role: 'melee', rank: 'trash', hp: 0.3, dmg: 1, speed: 6.4, radius: 0.45, aggro: 0, forces: 0, flying: true,
  anims: A_FLY, resist: R_GHOST, ai: { summoned: true }, visual: { opacity: 0.6, eyeEmissive: 0xff3040, hoverBob: 0.1 },
  basic: cone('spiteful_shade_touch', 'Kin Dokunuşu', 1.6, 100, 1.4, 1.0, 'Headbutt', 0.3, { windup: 0.5, damage: { coef: 1.0, type: 'shadow' } } as Ab),
});
for (const [k, o] of Object.entries({
  kor: { model: MON('Demon'), scale: 1.33, tint: 0xff6a00, emissive: 0xff3000, anims: A_ENEMY, type: 'fire' as DamageType, name: 'Kor Yarık Muhafızı' },
  ayaz: { model: MON('Yeti'), scale: 1.07, tint: 0x9fd8ff, emissive: 0x2060a0, anims: A_ENEMY, type: 'frost' as DamageType, name: 'Ayaz Yarık Muhafızı' },
  golge: { model: MON('Ghost'), scale: 1.33, tint: 0x6020a0, emissive: 0x4010a0, anims: A_FLY, type: 'shadow' as DamageType, name: 'Gölge Yarık Muhafızı' },
})) {
  add({
    id: `efsun_guardian_${k}`, name: o.name, model: o.model, scale: o.scale, tint: o.tint, emissive: o.emissive, role: 'melee', rank: 'elite', hp: 15, dmg: 2.0, speed: 5.6, radius: 1.0, aggro: 14, forces: 0, ccImmune: true,
    anims: o.anims, flying: k === 'golge', ai: { summoned: true }, visual: { opacity: k === 'golge' ? 0.75 : undefined, emissiveIntensity: 0.5 },
    basic: cone(`efsun_guardian_${k}_hit`, 'Yarık Darbesi', 3, 110, 2.2, 1.5, k === 'golge' ? 'Headbutt' : 'Attack', k === 'golge' ? 0.3 : 0.4, { windup: 0.55, type: o.type, damage: { coef: 1.5, type: o.type } } as Ab),
    abilities: [aoe(`efsun_guardian_${k}_slam`, 'Yarık Sarsıntısı', 'self_aoe', 5, 5, 12, 1.2, 2.0, o.type, k === 'golge' ? 'Punch' : 'Attack', 0.4, { vfx: 'ground_slam' })],
  });
}

// ---- mechanic entities (procedural bodies; spawned by boss scripts, replicated like any enemy) -----------------------------
const MECH = (id: string, name: string, proc: string, hpMult: number, extra: Partial<Spec> = {}): void =>
  add({
    id, name, model: PROC(proc), scale: 1, role: 'support', rank: 'trash', hp: hpMult, dmg: 0, speed: 0, radius: 0.8, aggro: 0, forces: 0, ccImmune: true, xp: 0,
    anims: { idle: 'Idle', walk: 'Idle', run: 'Idle', death: 'Death' },
    basic: { id: `${id}_none`, name: '-', kind: 'custom', range: 0, cooldown: 99, windup: 0, anim: '', params: { passive: 1 } },
    ai: { summoned: true }, ...extra,
  });
MECH('proc_phylactery', 'Filakter', 'phylactery', 10, { radius: 0.9, visual: { hoverBob: 0.0 } });
MECH('proc_soul_orb', 'Ruh Küresi', 'soul_orb', 0.02, { radius: 0.5, speed: 4, visual: { hoverBob: 0.15 } });
MECH('proc_bone_cage', 'Kemik Kafesi', 'bone_cage', 4, { radius: 0.9 });
MECH('proc_ice_tomb', 'Buz Mezarı', 'ice_tomb', 5, { radius: 0.9 });
MECH('proc_rift', 'Boşluk Yarığı', 'rift', 1, { radius: 1.0, tint: 0x8040ff });
MECH('proc_ice_pillar', 'Buz Sarkıtı', 'ice_pillar', 3, { radius: 1.0, visual: { blocker: 1.1 } });

// ---- derived defs: a copy of a base def with its own scale / tint / HP / XP and special abilities (GDD_OPENWORLD §3.5-3.6)
interface Derive {
  scale: number; tint?: number; hp: number; rank: EnemyRank; xp: number; loot: string; abilities: EnemyAbility[];
  basic?: EnemyAbility; resist?: EnemyDef['resist']; ai?: EnemyDef['ai']; ccImmune?: boolean;
}
function derive(id: string, name: string, base: string, o: Derive): void {
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

// ---- named rares (GDD_OPENWORLD §3.5): elite, xp x10, one special each (approximations noted per line)
derive('rare_gumus_yele', 'Gümüş Yele', 'ow_wolf', {
  scale: 1.35, tint: 0xe8e8f0, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_gumus_yele',
  abilities: [charge('rare_gumus_yele_lunge', 'Atılma', 7, 7, 0.6, 1.2, 'Lunge', 0.87), summonAb('rare_gumus_yele_howl', 'Uluma', 'ow_wolf', 3, 30, 'Howl', 0.8, { params: { hpBelow: 0.7, once: 1 } })],
});
derive('rare_kizil_kuyruk', 'Kızıl Kuyruk', 'ow_rat', {
  scale: 2.2, tint: 0xa04030, hp: 10, rank: 'elite', xp: 10, loot: 'loot_rare_kizil_kuyruk',
  abilities: [summonAb('rare_kizil_kuyruk_plague', 'Veba Sürüsü', 'ow_rat', 3, 10, 'Rat_Attack', 0.4)],
});
derive('rare_korkuluk_kral', 'Korkuluk Kral', 'ow_scarecrow', {
  scale: 1.5, tint: 0xe0c060, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_korkuluk_kral',
  abilities: [
    summonAb('rare_korkuluk_kral_crows', 'Karga Sürüsü', 'ow_bat', 4, 20, 'Attack', 0.6),
    aoe('rare_korkuluk_kral_storm', 'Saman Fırtınası', 'self_aoe', 6, 6, 14, 1.0, 0.3, 'physical', 'Attack', 0.5, { statuses: [{ status: 'blind', duration: 2 }] }),
  ],
});
derive('rare_buyuk_boz', 'Büyük Boz', 'ow_bear', {
  scale: 1.15, tint: 0xb8a898, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_buyuk_boz', ccImmune: true,
  abilities: [
    passive('yeti_chest', 'Yaralı Öfke', { hpBelow: 0.4, damage: 0.4, duration: 9999, once: 1 }),
    aoe('rare_buyuk_boz_slam', 'Yer Darbesi', 'self_aoe', 4, 4, 11, 1.0, 2.0, 'physical', 'Slam', 0.77),
  ],
});
derive('rare_mantar_ana', 'Mantar Ana', 'ow_mushroom_brute', {
  scale: 1.6, tint: 0xe090b0, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_mantar_ana',
  abilities: [
    aoe('rare_mantar_ana_cloud', 'Spor Fırtınası', 'ground_aoe', 4, 14, 12, 1.2, 0.4, 'poison', 'Cast', 0.6, { vfx: 'poison_cloud', params: { persist: 6, tick: 0.5 } }),
    onDeath(summonAb('rare_mantar_ana_spawn', 'Mantar Doğuşu', 'ow_mushnub', 4, 0, '', 0, { vfx: 'add_spawn' })),
  ],
});
derive('rare_golge_alfa', 'Gölge Alfa', 'ow_warg', {
  scale: 1.3, tint: 0x404050, hp: 8, rank: 'elite', xp: 10, loot: 'loot_rare_golge_alfa',
  basic: cone('rare_golge_alfa_bite', 'Isırık', 2.6, 100, 1.9, 1.0, 'Bite', 0.5, { statuses: [bleed(1, 0.2, 6)] }),
  abilities: [
    charge('rare_golge_alfa_lunge', 'Atılma', 9, 9, 0.8, 1.9, 'Lunge', 0.93),
    summonAb('rare_golge_alfa_pack', 'Karanlık Uluma', 'ow_wolf_dire', 4, 30, 'Howl', 0.8, { params: { once: 1 } }),
  ],
});
derive('rare_demir_boynuz', 'Demir Boynuz', 'ow_rhino', {
  scale: 1.3, tint: 0x808890, hp: 8, rank: 'elite', xp: 10, loot: 'loot_rare_demir_boynuz', resist: { physical: 0.5 },
  abilities: [
    charge('rare_demir_boynuz_charge', 'Hücum', 12, 10, 1.1, 2.4, 'Charge', 0.6, { shape: { type: 'line', length: 12, width: 2.2 }, statuses: [{ status: 'knockdown', duration: 0.8 }] }),
    aoe('rare_demir_boynuz_stamp', 'Tepinme', 'self_aoe', 4.2, 4.2, 12, 1.0, 1.8, 'physical', 'Stamp', 1.0),
  ],
});
derive('rare_agit_kralicesi', 'Ağıt Kraliçesi', 'ow_wraith', {
  scale: 1.5, tint: 0x80ffe0, hp: 8, rank: 'elite', xp: 10, loot: 'loot_rare_agit_kralicesi',
  abilities: [aoe('rare_agit_kralicesi_wail', 'Ağıt', 'self_aoe', 10, 10, 20, 8, 0.4, 'shadow', 'Cast', 0.5, { castTime: 8, interruptible: true, statuses: [{ status: 'fear', duration: 2 }], vfx: 'shadow_burst' })],
});
derive('rare_zehir_ana', 'Zehir Ana', 'ow_spider_giant', {
  scale: 1.6, tint: 0x50a040, hp: 8, rank: 'elite', xp: 10, loot: 'loot_rare_zehir_ana',
  abilities: [
    summonAb('rare_zehir_ana_eggs', 'Yavru Yumurtaları', 'ow_spider', 6, 25, 'Bite', 0.4),
    proj('rare_zehir_ana_web', 'Ağ Atışı', 16, 12, 12, 0.6, 0.3, 'physical', 'bolt_projectile', 'WebSpit', 0.67, { statuses: [{ status: 'root', duration: 2 }] }),
  ],
});
derive('rare_camur_baba', 'Çamur Baba', 'ow_ooze', {
  scale: 0.9, tint: 0x806030, hp: 10, rank: 'elite', xp: 10, loot: 'loot_rare_camur_baba',
  abilities: [
    proj('rare_camur_baba_spit', 'Asit Tükürüğü', 12, 12, 7, 0.7, 0.9, 'poison', 'poison_projectile', 'Spit', 0.7, { statuses: [poison(1)] }),
    onDeath(summonAb('rare_camur_baba_split', 'Dev Bölünme', 'ow_ooze_half', 4, 0, '', 0, { vfx: 'add_spawn' })),
  ],
});
derive('rare_kor_efendisi', 'Kor Efendisi', 'ow_ember', {
  scale: 1.4, tint: 0xff6020, hp: 8, rank: 'elite', xp: 10, loot: 'loot_rare_kor_efendisi',
  abilities: [
    aoe('rare_kor_efendisi_rain', 'Kor Yağmuru', 'ground_aoe', 3, 14, 14, 1.5, 0.8, 'fire', 'Cast', 0.9, { vfx: 'fire_burst', params: { persist: 4, tick: 0.5 } }),
    aoe('rare_kor_efendisi_ring', 'Ateş Halkası', 'self_aoe', 6, 6, 12, 1.3, 1.8, 'fire', 'Cast', 0.9, { vfx: 'fire_burst' }),
  ],
});
derive('rare_tas_yurek', 'Taş Yürek', 'ow_golem', {
  scale: 1.4, tint: 0xa0a0b8, hp: 8, rank: 'elite', xp: 10, loot: 'loot_rare_tas_yurek',
  abilities: [
    buff('rare_tas_yurek_shield', 'Taş Kalkan', 0.8, 20, [{ status: 'fortify', duration: 5 }], 'Cast', 0.5, { params: { self: 1 } }),
    aoe('rare_tas_yurek_slam', 'Yer Darbesi', 'self_aoe', 4.5, 4.5, 11, 1.1, 4.4, 'physical', 'Attack', 0.67),
  ],
});
derive('rare_kizil_boynuz', 'Kızıl Boynuz', 'ow_rhino', {
  scale: 1.3, tint: 0xb05040, hp: 8, rank: 'elite', xp: 10, loot: 'loot_rare_kizil_boynuz',
  abilities: [
    charge('rare_kizil_boynuz_rush', 'Öfke Hücumu', 12, 9, 1.0, 1.2, 'Charge', 0.6, { shape: { type: 'line', length: 12, width: 2.2 } }),
    aoe('rare_kizil_boynuz_stamp', 'Tepinme', 'self_aoe', 4.2, 4.2, 12, 1.0, 1.8, 'physical', 'Stamp', 1.0),
  ],
});
derive('rare_gece_gezgini', 'Gece Gezgini', 'ow_vampire', {
  scale: 1.2, tint: 0x6a5090, hp: 8, rank: 'elite', xp: 10, loot: 'loot_rare_gece_gezgini',
  abilities: [
    { id: 'cult_assassin_smoke', name: 'Gece Perdesi', kind: 'custom', range: 6, cooldown: 20, windup: 0.5, anim: '', params: { hpBelow: 0.5, once: 1, vanish: 6, impact: 0.75 } },
    aoe('rare_gece_gezgini_drain', 'Kan Hasadı', 'self_aoe', 5, 5, 12, 1.1, 1.8, 'shadow', 'attack-melee-right', 0.5),
  ],
});
derive('rare_kemik_kral', 'Kemik Kral Hargar', 'skel_warrior', {
  scale: 1.5, tint: 0xd8d0c0, hp: 8, rank: 'elite', xp: 10, loot: 'loot_rare_kemik_kral',
  abilities: [
    summonAb('rare_kemik_kral_army', 'Kemik Ordusu', 'skel_minion', 6, 25, 'Spellcast_Summon', 0.6),
    cone('rare_kemik_kral_bash', 'Kalkan Darbesi', 3.5, 60, 12, 2.0, 'Block_Attack', 0.4, { windup: 0.8, telegraph: true, knockback: 5 }),
  ],
});
derive('rare_sessiz_rahip', 'Sessiz Rahip', 'cult_summoner', {
  scale: 1.4, tint: 0x302040, hp: 8, rank: 'elite', xp: 10, loot: 'loot_rare_sessiz_rahip',
  abilities: [
    aoe('rare_sessiz_rahip_silence', 'Sessizlik', 'self_aoe', 12, 12, 18, 1.5, 0, 'shadow', 'Cast', 0.4, { statuses: [{ status: 'silence', duration: 3 }], vfx: 'shadow_burst' }),
    summonAb('rare_sessiz_rahip_shades', 'Gölge Çağrısı', 'shade', 2, 18, 'Spellcast_Summon', 0.6),
  ],
});

// ---- mini-bosses (GDD_OPENWORLD §3.6): fixed lairs, leash to the camp (ai.homeRadius), 20 min respawn (MiniBossDirector)
derive('mb_girtlak', 'Yağmacı Başı Gırtlak', 'ow_puglin_chief', {
  scale: 1.25, hp: 14, rank: 'miniboss', xp: 25, loot: 'loot_mb_r1', ai: { homeRadius: 30 },
  abilities: [
    aoe('mb_girtlak_rocks', 'Taş Yağmuru', 'ground_aoe', 4, 14, 12, 1.2, 1.2, 'physical', 'Attack_2H', 0.8, { vfx: 'ground_slam' }),
    summonAb('mb_girtlak_call', 'Gırtlak Çağrısı', 'ow_goblin', 4, 25, 'Attack_1H_2', 0.6),
    cone('mb_girtlak_combo', 'Sopa Fırtınası', 3.2, 110, 8, 1.0, 'Attack_1H_2', 0.35, { windup: 0.5 }),
  ],
});
derive('mb_hovardan', 'Mezarlık Bekçisi Hovardan', 'ow_keeper', {
  scale: 1.2, tint: 0x80a090, hp: 18, rank: 'miniboss', xp: 25, loot: 'loot_mb_r2', ai: { homeRadius: 30 },
  abilities: [
    proj('mb_hovardan_clod', 'Toprak Fırlat', 14, 14, 8, 0.8, 1.0, 'physical', 'rock_projectile', 'attack-melee-left', 0.5, { statuses: [{ status: 'blind', duration: 2 }] }),
    summonAb('mb_hovardan_graves', 'Mezar Aç', 'skel_rattler', 3, 20, 'attack-melee-left', 0.5),
    aoe('mb_hovardan_sweep', 'Kürek Savurma', 'self_aoe', 4.5, 4.5, 14, 1.1, 2.0, 'physical', 'attack-melee-left', 0.5),
  ],
});
derive('mb_karabiyik', 'Haydut Kralı Karabıyık', 'ow_bandit_chief', {
  scale: 1.45, tint: 0x402020, hp: 20, rank: 'miniboss', xp: 25, loot: 'loot_mb_r3', ai: { homeRadius: 30 },
  abilities: [
    summonAb('mb_karabiyik_call', 'Yardım Çağır', 'ow_bandit', 4, 30, 'Cheer', 0.8),
    cone('mb_karabiyik_shield', 'Kalkan Darbesi', 3, 90, 12, 0.8, '1H_Melee_Attack_Chop', 0.4, { windup: 0.8, telegraph: true, statuses: [{ status: 'stun', duration: 1.5 }] }),
    aoe('mb_karabiyik_price', 'Kanlı Fiyat', 'ground_aoe', 3, 14, 20, 3.0, 2.4, 'physical', 'Cast', 0.8, { telegraph: true }),
  ],
});
derive('mb_zehra', 'Cadı Zehra', 'ow_witch', {
  scale: 1.4, tint: 0x206840, hp: 20, rank: 'miniboss', xp: 25, loot: 'loot_mb_r4', ai: { homeRadius: 30 },
  abilities: [
    aoe('mb_zehra_rain', 'Zehir Yağmuru', 'ground_aoe', 3.5, 16, 12, 1.5, 0.8, 'poison', 'Cast', 0.3, { vfx: 'poison_cloud', params: { persist: 5, tick: 0.5 } }),
    proj('mb_zehra_hex', 'Kurbağa Laneti', 16, 16, 12, 1.5, 0, 'shadow', 'shadow_projectile', 'Spellcast_Raise', 0.3, { castTime: 1.5, interruptible: true, statuses: [{ status: 'root', duration: 2 }, { status: 'curse', duration: 6 }] }),
    summonAb('mb_zehra_cauldron', 'Kazan Çağrısı', 'ow_ooze', 3, 25, 'Spellcast_Raise', 0.8),
  ],
});
derive('mb_gorak', 'Ork Reisi Gorak', 'ow_orc_brute', {
  scale: 1.5, tint: 0x806040, hp: 22, rank: 'miniboss', xp: 25, loot: 'loot_mb_r5', ai: { homeRadius: 30 },
  abilities: [
    buff('mb_gorak_cry', 'Savaş Narası', 0.6, 20, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Wave', 0.8, { params: { radius: 14, self: 1 } }),
    line('mb_gorak_rend', 'Yarma', 10, 2.6, 9, 1.1, 2.8, 'physical', 'Weapon', 0.45),
    charge('mb_gorak_charge', 'Zincir Hücumu', 14, 14, 1.0, 1.4, 'Charge', 0.6, { shape: { type: 'line', length: 14, width: 2 }, statuses: [{ status: 'knockdown', duration: 1 }] }),
    summonAb('mb_gorak_orcs', 'Ork Çağrısı', 'ow_orc', 4, 30, 'Wave', 0.8),
  ],
});
derive('mb_valdemar', 'Kan Lordu Valdemar', 'ow_vampire', {
  scale: 1.3, tint: 0x802030, hp: 24, rank: 'miniboss', xp: 25, loot: 'loot_mb_r6', ai: { homeRadius: 30 },
  abilities: [
    aoe('mb_valdemar_drain', 'Kan Hasadı', 'self_aoe', 6, 6, 12, 1.1, 1.8, 'shadow', 'attack-melee-right', 0.5),
    summonAb('mb_valdemar_bats', 'Yarasa Bulutu', 'ow_bat', 8, 25, 'attack-melee-right', 0.8),
  ],
});

// =====================================================================================================================
// 4. Metin stones (GDD_OPENWORLD §4): stationary procedural monoliths. Waves, aura, pulse and idle heal: ai/metin.ts
// =====================================================================================================================
const METIN_CORE = (): EnemyAbility => ({ id: 'metin_core', name: 'Metin Çekirdeği', kind: 'custom', range: 0, cooldown: 0, windup: 0, anim: '', params: { passive: 1 } });
const metinStone = (id: string, name: string, tint: number, hp: number, armor: number, loot: string): void =>
  add({
    // dmg 1: the stone never swings, but its pulse / aura coefficients are relative to this base damage
    id, name, model: PROC('metin_stone'), scale: 1, tint, role: 'support', rank: 'miniboss', hp, dmg: 1, speed: 0, radius: 1.2, aggro: 0, forces: 0, xp: 15,
    armor, ccImmune: true, leash: 0, loot,
    anims: { idle: 'Idle', walk: 'Idle', run: 'Idle', death: 'Death' },
    basic: NOOP(`${id}_none`), abilities: [METIN_CORE()], ai: { stationary: true },
  });
metinStone('metin_keder', 'Keder Metini', 0x60a0ff, 28, 1.5, 'loot_metin_t1');
metinStone('metin_hirs', 'Hırs Metini', 0xffc040, 34, 1.7, 'loot_metin_t2');
metinStone('metin_nefret', 'Nefret Metini', 0xff6040, 40, 1.9, 'loot_metin_t3');
metinStone('metin_aci', 'Acı Metini', 0x40ffa0, 46, 2.1, 'loot_metin_t4');
metinStone('metin_ofke', 'Öfke Metini', 0xff3020, 52, 2.3, 'loot_metin_t5');
metinStone('metin_olum', 'Ölüm Metini', 0xb040ff, 58, 2.5, 'loot_metin_t6');

/** One wave: spawns at this share of max HP (waves fire in order: 85 / 65 / 45 / 25 / 10 %). */
export interface MetinWaveSpec { hpBelow: number; members: { enemyId: string; count: number }[] }
/**
 * Tier script of a metin stone, keyed by the stone's def id. Field names match MetinTierDef (types/dungeons.ts) so the content
 * module can build its tiers from this table (single source). The AI reads it in ai/metin.ts.
 */
export interface MetinSpec {
  waves: MetinWaveSpec[];
  add: { enemyId: string; count: number; everySec: number; cap: number };
  aura: { radius: number; slowPct: number; curse?: boolean; dotPctPerSec?: number };
  pulse?: { everySec: number; coef: number; rMax: number };
}
const METIN_WAVE_HP = [0.85, 0.65, 0.45, 0.25, 0.1];
const metinWaves = (rows: [string, number][][]): MetinWaveSpec[] =>
  rows.map((members, i) => ({ hpBelow: METIN_WAVE_HP[i], members: members.map(([enemyId, count]) => ({ enemyId, count })) }));

export const METIN_SPECS: Record<string, MetinSpec> = {
  metin_keder: {
    waves: metinWaves([
      [['ow_wolf', 6]], [['ow_goblin', 4], ['ow_goblin_shaman', 1]], [['ow_rat', 8]], [['ow_boar', 4], ['ow_puglin_chief', 1]], [['ow_mushnub', 10]],
    ]),
    add: { enemyId: 'ow_rat', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15 },
  },
  metin_hirs: {
    waves: metinWaves([
      [['ow_bandit', 6]], [['ow_scarecrow', 4], ['ow_bandit_archer', 2]], [['ow_bat', 8]], [['ow_bear', 1], ['ow_boar', 4]], [['ow_wasp', 10]],
    ]),
    add: { enemyId: 'ow_bat', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15 },
  },
  metin_nefret: {
    waves: metinWaves([
      [['ow_bandit', 6]], [['ow_puglin', 4], ['ow_bandit_archer', 2]], [['ow_wasp', 8]], [['ow_warg', 1], ['ow_wolf', 4]], [['ow_bandit_brute', 1], ['ow_bandit', 6]],
    ]),
    add: { enemyId: 'ow_wasp', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15, curse: true },
    pulse: { everySec: 12, coef: 1.0, rMax: 12 },
  },
  metin_aci: {
    waves: metinWaves([
      [['ow_ghoul', 6]], [['ow_wraith', 4], ['ow_ooze', 2]], [['ow_will', 8]], [['ow_spider_giant', 1], ['ow_centipede', 4]], [['ow_wasp_swamp', 10]],
    ]),
    add: { enemyId: 'ow_will', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15, curse: true },
    pulse: { everySec: 12, coef: 1.0, rMax: 12 },
  },
  metin_ofke: {
    waves: metinWaves([
      [['ow_orc', 6]], [['ow_orc_archer', 4], ['ow_orc_shaman', 2]], [['ow_imp', 8]], [['ow_orc_brute', 1], ['ow_orc', 4]], [['ow_ember', 2], ['ow_imp', 6]],
    ]),
    add: { enemyId: 'ow_imp', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15, curse: true, dotPctPerSec: 0.01 },
    pulse: { everySec: 12, coef: 1.0, rMax: 12 },
  },
  metin_olum: {
    waves: metinWaves([
      [['skel_minion', 6]], [['cult_acolyte', 4], ['skel_archer', 2]], [['shade', 8]], [['ow_grave_knight', 1], ['skel_minion', 4]], [['ow_vampire', 1], ['ow_bat', 8]],
    ]),
    add: { enemyId: 'shade', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15, curse: true, dotPctPerSec: 0.01 },
    pulse: { everySec: 12, coef: 1.0, rMax: 12 },
  },
};

// =====================================================================================================================
// Bosses (GDD_CONTENT §4.x.5). Timings (first at / cd / windup) are the table values; scripts live in ai/bosses/*.ts.
// =====================================================================================================================
export const BOSSES: Record<string, BossDef> = {};

interface BossSpec extends Omit<Spec, 'hp' | 'dmg' | 'rank' | 'aggro' | 'forces' | 'basic'> {
  title: string; hp: number; dmg: number; aggro?: number; basic: EnemyAbility; phases: BossPhase[]; enrage: number; arenaR: number;
  intro?: string; death?: string; arena: BossArena; music?: string; loot: string;
}

function boss(s: BossSpec): void {
  const base = def({ ...s, rank: 'boss', forces: 0, aggro: s.aggro ?? 18, ccImmune: true, xp: 100, leash: 0 });
  BOSSES[s.id] = {
    ...base,
    title: s.title, phases: s.phases, enrageTimer: s.enrage, arenaRadius: s.arenaR, introYell: s.intro, deathYell: s.death, music: 'boss', arena: s.arena,
  };
}

const bp = (id: string, hpBelow: number, abilities: string[], onEnter?: BossPhase['onEnter']): BossPhase => ({ id, hpBelow, abilities, onEnter });
const custom = (id: string, name: string, cd: number, first: number | undefined, windup: number, anim: string, o: Ab = {}): EnemyAbility => ({
  id, name, kind: 'custom', range: 60, cooldown: cd, initialCooldown: first, windup, anim, ...o, params: { ...o.params },
});

// ---------------------------------------------------------------- 4.1 Kemik Mahzeni
boss({
  id: 'boss_bekci_kaldur', name: 'Bekçi Kaldur', title: 'Mahzen Kapısının Bekçisi', model: SKEL('Skeleton_Warrior'), scale: 1.75, tint: 0xd8d0c0, role: 'tank',
  hp: 60, dmg: 2.5, speed: 5.0, radius: 1.3, enrage: 180, arenaR: 20, loot: 'loot_d1_b1',
  anims: { idle: 'Idle_Combat', walk: 'Walking_A', run: 'Running_A', hit: 'Hit_A', death: 'Death_C_Skeletons' }, resist: R_SKELETON,
  visual: { attach: [...W_BLADE, { url: WPN('Skeleton_Shield_Large_A'), bone: 'handslot.l', pos: [0, 0.017, 0.05] }], eyeEmissive: 0xff5030, runRef: 7, glow: 0xff4020 },
  basic: cone('kaldur_cleave', 'Kesik', 4, 100, 2.2, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.3, { windup: 0.6, telegraph: true }),
  abilities: [
    line('kaldur_shield_slam', 'Kalkan Yarması', 8, 3, 16, 1.0, 4.0, 'physical', 'Block_Attack', 0.4, { initialCooldown: 6, knockback: 6, statuses: [{ status: 'sunder', duration: 10 }], sfx: 'shield_bash', perilous: true, params: { impact: 0.4 } }),
    custom('kaldur_whirl', 'Kemik Kasırgası', 30, 15, 1.5, '2H_Melee_Attack_Spinning', { sfx: 'boss_cast', damage: { coef: 0.8, type: 'physical' }, params: { impact: 0.667 } }),
    custom('kaldur_shield_wall', 'Kalkan Duvarı', 40, 25, 0.3, '', { sfx: 'buff' }),
    custom('kaldur_call', 'Mezarlık Çağrısı', 99, 9999, 1.4, 'Taunt', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['kaldur_shield_slam', 'kaldur_whirl', 'kaldur_shield_wall']),
    bp('p2', 0.7, ['kaldur_shield_slam', 'kaldur_whirl', 'kaldur_shield_wall'], { yell: 'Kalkın, kardeşlerim!', ability: 'kaldur_call' }),
    bp('p3', 0.35, ['kaldur_shield_slam', 'kaldur_whirl', 'kaldur_shield_wall'], { yell: 'Kalkın, kardeşlerim!', ability: 'kaldur_call' }),
  ],
  intro: 'Mahzenin kapısını hiçbir canlı geçemez!', death: 'Nöbetim... sona erdi...',
  arena: { cx: 28, cz: 30, w: 40, h: 44, homeX: 28, homeZ: 26 },
});

boss({
  id: 'boss_olucagiran_morkan', name: 'Ölüçağıran Morkan', title: 'Ruh Kuyusunun Efendisi', model: SKEL('Skeleton_Mage'), scale: 1.6, tint: 0xc0a8ff, role: 'caster',
  hp: 75, dmg: 2.0, speed: 4.5, radius: 1.0, enrage: 210, arenaR: 18, loot: 'loot_d1_b2',
  anims: { idle: 'Idle_B', walk: 'Walking_B', run: 'Running_A', hit: 'Hit_A', death: 'Death_C_Skeletons' }, resist: R_SKELETON,
  visual: { attach: [{ url: WPN('Skeleton_Staff'), bone: 'handslot.r', pos: [0, 0, 0], rotY: Math.PI }], eyeEmissive: 0x60ff90, runRef: 7, glow: 0x60ff90 },
  basic: proj('morkan_bolt', 'Gölge Oku', 16, 40, 2.5, 0.8, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'shadow_cast' }),
  abilities: [
    custom('morkan_raise', 'Ölüleri Kaldır', 20, 10, 3.0, 'Spellcast_Summon', { castTime: 3.0, interruptible: true, sfx: 'boss_cast', params: { impact: 4.2 } }),
    custom('morkan_prison', 'Kemik Hapsi', 25, 14, 1.5, 'Spellcast_Raise', { sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('morkan_corpse_explosion', 'Ceset Patlaması', 18, 20, 3.0, 'Spellcast_Long', { sfx: 'boss_cast', params: { impact: 1.55 } }),
    custom('morkan_soul_storm', 'Ruh Fırtınası', 999, 9999, 0.5, 'Spellcasting', { castTime: 0.5, interruptible: false, sfx: 'boss_cast', params: { channel: 8, loop: 1 } }),
  ],
  phases: [
    bp('p1', 1.01, ['morkan_raise', 'morkan_prison', 'morkan_corpse_explosion']),
    bp('p2', 0.4, ['morkan_raise', 'morkan_prison', 'morkan_corpse_explosion'], { yell: 'Kuyu! Bana güç ver!', ability: 'morkan_soul_storm' }),
  ],
  intro: 'Ruhlarınız kuyuyu besleyecek!', death: 'Ölüm... beni de... çağırıyor...',
  arena: { cx: 132, cz: 84, w: 40, h: 40, homeX: 134, homeZ: 76 },
});

boss({
  id: 'boss_azrakel', name: 'Kemik Lordu Azrakel', title: 'Mahzenin Ölümsüz Hükümdarı', model: GENB('kemik_lordu'), scale: 1.0, role: 'melee',
  hp: 110, dmg: 2.3, speed: 4.8, radius: 1.3, enrage: 300, arenaR: 22, loot: 'loot_d1_b3', anims: A_GEN, resist: R_SKELETON, visual: { runRef: 5 },
  basic: cone('azrakel_swing', 'Asa Savuruşu', 5, 90, 2.4, 1.0, 'Attack', 0.63, { windup: 0.7, telegraph: true }),
  abilities: [
    custom('azrakel_spears', 'Kemik Mızrakları', 14, 6, 1.4, 'Cast', { sfx: 'boss_cast', params: { impact: 1.57 } }),
    cone('azrakel_grave_chill', 'Mezar Soğuğu', 7, 60, 18, 4.5, 'Attack2', 0.63, { initialCooldown: 10, windup: 1.2, telegraph: true, tankBuster: true, parryable: false, damage: { coef: 4.5, type: 'frost' }, statuses: [chill(3, 6)], vfx: 'frost_burst', sfx: 'boss_cast' } as Ab),
    custom('azrakel_soul_reap', 'Ruh Hasadı', 28, 18, 0.8, 'Cast', { sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('azrakel_phylactery', 'Filakter Evresi', 999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),
    custom('azrakel_death_rings', 'İç / Dış Ölüm', 22, 8, 2.0, 'Cast', { sfx: 'boss_cast', params: { impact: 1.57 } }),
    custom('azrakel_last_breath', 'Son Nefes', 999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['azrakel_spears', 'azrakel_grave_chill', 'azrakel_soul_reap']),
    bp('p2', 0.6, [], { yell: 'Filakterlerim beni sonsuza dek yaşatacak!', ability: 'azrakel_phylactery' }),
    bp('p3', 0.599, ['azrakel_spears', 'azrakel_grave_chill', 'azrakel_soul_reap', 'azrakel_death_rings']),
    bp('p4', 0.3, ['azrakel_spears', 'azrakel_grave_chill', 'azrakel_soul_reap', 'azrakel_death_rings'], { yell: 'Kemiklerinizi tahtıma ekleyeceğim!', ability: 'azrakel_last_breath' }),
  ],
  intro: 'Diriler... Mahzenime hoş geldiniz. Bir daha asla çıkamayacaksınız!', death: 'İmkânsız... ben... ölümsüzdüm...',
  arena: { cx: 82, cz: 136, w: 52, h: 40, homeX: 82, homeZ: 140 },
});

// ---------------------------------------------------------------- 4.2 Kızıl Dökümhane
boss({
  id: 'boss_dokumcu_gurz', name: 'Dökümcü Usta Gurz', title: 'Kızıl Örsün Ustası', model: MON('Orc'), scale: 1.65, tint: 0xc8744c, emissive: 0x401000, role: 'melee',
  hp: 60, dmg: 2.5, speed: 5.3, radius: 1.3, enrage: 180, arenaR: 20, loot: 'loot_d2_b1', anims: A_CHAR, resist: R_DEMON, visual: { emissiveIntensity: 0.25, eyeEmissive: 0xff8030 },
  basic: cone('gurz_swing', 'Çekiç Savuruşu', 4.5, 110, 2.2, 1.0, 'Weapon', 0.45, { windup: 0.65, telegraph: true }),
  abilities: [
    custom('gurz_anvil_slam', 'Örs Darbesi', 15, 7, 1.2, 'Jump', { sfx: 'boss_cast', params: { impact: 0.25 } }),
    custom('gurz_molten_pour', 'Erimiş Döküm', 24, 12, 2.0, 'Wave', { sfx: 'boss_cast', params: { impact: 0.8 } }),
    custom('gurz_bellows', 'Körük Esintisi', 35, 20, 1.0, 'Yes', { sfx: 'boss_roar', params: { impact: 0.8 } }),
    custom('gurz_call_slaves', 'Çalışın Köleler!', 99, 9999, 1.2, 'Wave', { sfx: 'boss_roar', params: { impact: 0.8 } }),
  ],
  phases: [
    bp('p1', 1.01, ['gurz_anvil_slam', 'gurz_molten_pour', 'gurz_bellows']),
    bp('p2', 0.66, ['gurz_anvil_slam', 'gurz_molten_pour', 'gurz_bellows'], { yell: 'Köleler! İşbaşına!', ability: 'gurz_call_slaves' }),
    bp('p3', 0.33, ['gurz_anvil_slam', 'gurz_molten_pour', 'gurz_bellows'], { yell: 'Köleler! İşbaşına!', ability: 'gurz_call_slaves' }),
  ],
  intro: 'Örsüm aç! Kemiklerinizi döveceğim!', death: 'Ateş... sönüyor...',
  arena: { cx: 60, cz: 18, w: 48, h: 36, homeX: 62, homeZ: 25.2 },
});

boss({
  id: 'boss_atesyurek', name: 'Magma Devi Ateşyürek', title: 'Dökümhanenin Kalbi', model: GENB('lav_golemi'), scale: 0.85, role: 'melee',
  hp: 75, dmg: 2.7, speed: 3.4, radius: 2.2, enrage: 210, arenaR: 16, loot: 'loot_d2_b2', anims: A_GEN, resist: { ...R_GOLEM, fire: 0.9 }, visual: { runRef: 3.4 },
  basic: cone('atesyurek_punch', 'Ezici Yumruk', 5, 120, 2.8, 1.0, 'Attack', 0.77, { windup: 0.8, telegraph: true, sfx: 'ground_slam' }),
  abilities: [
    custom('atesyurek_eruption', 'Volkanik Patlama', 20, 8, 1.8, 'Cast', { sfx: 'boss_cast', params: { impact: 1.67 } }),
    custom('atesyurek_magma_wave', 'Magma Dalgası', 30, 18, 2.0, 'Cast', { sfx: 'boss_cast', params: { impact: 1.67 } }),
    custom('atesyurek_heat', 'Kızgın Kalp', 0, 0, 0, '', { params: { passive: 1 } }),
    custom('atesyurek_spawn_slimes', 'Lav Dökümü', 999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['atesyurek_eruption', 'atesyurek_magma_wave']),
    bp('p2', 0.5, ['atesyurek_eruption', 'atesyurek_magma_wave'], { yell: '*Lav kaynıyor!*', ability: 'atesyurek_spawn_slimes' }),
    bp('p3', 0.25, ['atesyurek_eruption', 'atesyurek_magma_wave'], { yell: '*Erimiş öfke!*' }),
  ],
  intro: '*Ateşyürek lav gölünden yükseliyor!*', death: '*Ateşyürek soğuyarak taşa dönüşüyor...*',
  arena: { cx: 122, cz: 134, w: 44, h: 44, homeX: 122, homeZ: 136 },
});

boss({
  id: 'boss_ignaroth', name: 'Mavi Alev Ignaroth', title: 'Dökümhanenin İblis Efendisi', model: MON('Blue_Demon'), scale: 1.5, role: 'melee',
  hp: 110, dmg: 2.3, speed: 5.9, radius: 1.5, enrage: 300, arenaR: 22, loot: 'loot_d2_b3', anims: { ...A_CHAR, run: 'Run' }, resist: R_DEMON, visual: { eyeEmissive: 0x60b0ff }, tint: 0xa0c8ff, emissive: 0x2050ff,
  basic: cone('ignaroth_combo', 'Pençe Kombosu', 5, 120, 2.3, 1.0, 'Weapon', 0.45, { windup: 0.65, telegraph: true, damage: { coef: 1.0, type: 'fire' } } as Ab),
  abilities: [
    custom('ignaroth_charge', 'Mavi Alev Hücumu', 18, 10, 1.0, 'Run2', { sfx: 'boss_roar', params: { impact: 0.1, target: 2 } }),
    custom('ignaroth_meteor', 'Göktaşı', 30, 20, 1.0, 'Yes', { sfx: 'boss_cast', params: { impact: 0.6 } }),
    custom('ignaroth_flame_walls', 'Alev Duvarları', 26, 14, 1.2, 'Wave', { sfx: 'boss_cast', params: { impact: 0.8 } }),
    custom('ignaroth_gates', 'Dökümhane Kapıları', 999, 9999, 1.0, 'Jump', { sfx: 'boss_roar' }),
    custom('ignaroth_fury', 'Mavi Öfke', 999, 9999, 1.0, 'No', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['ignaroth_charge', 'ignaroth_meteor', 'ignaroth_flame_walls']),
    bp('p2', 0.65, [], { yell: 'Dökümhane, efendine hizmet et!', ability: 'ignaroth_gates' }),
    bp('p3', 0.649, ['ignaroth_charge', 'ignaroth_meteor', 'ignaroth_flame_walls']),
    bp('p4', 0.3, ['ignaroth_charge', 'ignaroth_meteor', 'ignaroth_flame_walls'], { yell: 'YETER! Hepiniz kül olacaksınız!', ability: 'ignaroth_fury' }),
  ],
  intro: 'Mavi alev, kızıl alevi yutar. Siz de yanacaksınız!', death: 'Bu alev... sönmez... bir gün... dönerim...',
  arena: { cx: 16, cz: 132, w: 32, h: 48, homeX: 16, homeZ: 134 },
});

// ---------------------------------------------------------------- 4.3 Buzul Tahtı
boss({
  id: 'boss_ak_pence', name: 'Ak Pençe', title: 'Buzulların Yaşlı Yetisi', model: MON('Yeti'), scale: 1.75, tint: 0xf0f6ff, role: 'melee',
  hp: 60, dmg: 2.7, speed: 6.4, radius: 1.6, enrage: 180, arenaR: 19, loot: 'loot_d3_b1', anims: A_ENEMY, resist: { frost: 0.75, fire: -0.25 }, visual: { eyeEmissive: 0x80d0ff },
  basic: cone('akpence_claw', 'Pençe', 5, 120, 2.5, 1.0, 'Attack', 0.5, { windup: 0.65, telegraph: true }),
  abilities: [
    cone('akpence_frost_cleave', 'Buz Yarması', 9, 70, 14, 4.0, 'Attack', 0.5, { initialCooldown: 6, windup: 1.2, telegraph: true, tankBuster: true, parryable: false, damage: { coef: 4.0, type: 'frost' }, statuses: [chill(3, 6)], vfx: 'frost_burst', sfx: 'boss_cast' } as Ab),
    custom('akpence_avalanche', 'Kar Çığı', 25, 12, 2.0, 'Jump', { sfx: 'boss_roar', params: { impact: 0.2 } }),
    custom('akpence_charge', 'Öfkeli Hücum', 30, 18, 3.0, 'Run', { sfx: 'boss_roar' }),
    custom('akpence_frenzy', 'Yaşlı Öfke', 999, 9999, 0, '', {}),
  ],
  phases: [
    bp('p1', 1.01, ['akpence_frost_cleave', 'akpence_avalanche', 'akpence_charge']),
    bp('p2', 0.3, ['akpence_frost_cleave', 'akpence_avalanche', 'akpence_charge'], { ability: 'akpence_frenzy' }),
  ],
  intro: '*Ak Pençe öfkeyle kükrüyor!*', death: '*Ak Pençe son kez inleyip karlara yığılıyor.*',
  arena: { cx: 16, cz: 82, w: 32, h: 44, homeX: 16, homeZ: 84 },
});

boss({
  id: 'boss_ayaz_ana', name: 'Ayaz Ana', title: 'Buz Cadısı', model: CHAR('Mage'), scale: 1.55, tint: 0xa8d8ff, role: 'caster',
  hp: 75, dmg: 2.0, speed: 5.0, radius: 1.0, enrage: 210, arenaR: 18, loot: 'loot_d3_b2', anims: { ...A_KAYKIT, death: 'Death_B' }, resist: { frost: 0.9, fire: -0.25 },
  visual: { hide: mageHide('2H_Staff', 'Mage_Hat'), runRef: 7, eyeEmissive: 0x80d0ff, glow: 0x80c8ff },
  basic: proj('ayazana_bolt', 'Buz Oku', 18, 40, 2.2, 0.5, 1.1, 'frost', 'frost_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'frost_cast', projectile: { speed: 18, radius: 0.55, vfx: 'frost_projectile', homing: 0.5 } }),
  abilities: [
    custom('ayazana_nova', 'Dondurucu Nova', 22, 12, 2.5, 'Spellcast_Raise', { castTime: 2.5, interruptible: false, sfx: 'frost_cast', params: { impact: 1.0 } }),
    custom('ayazana_ice_tomb', 'Buz Mezarı', 28, 15, 1.0, 'Spellcast_Long', { sfx: 'frost_cast', params: { impact: 1.55 } }),
    custom('ayazana_blizzard', 'Kar Fırtınası', 18, 8, 1.0, 'Spellcast_Raise', { sfx: 'frost_cast', params: { impact: 1.0 } }),
    custom('ayazana_mirror', 'Ayna Sureti', 999, 9999, 1.0, 'Spellcast_Raise', { sfx: 'boss_cast', params: { impact: 1.0 } }),
  ],
  phases: [
    bp('p1', 1.01, ['ayazana_nova', 'ayazana_ice_tomb', 'ayazana_blizzard']),
    bp('p2', 0.7, ['ayazana_nova', 'ayazana_ice_tomb', 'ayazana_blizzard'], { yell: 'Hangisi gerçek? Hiçbiri... hepsi!', ability: 'ayazana_mirror' }),
    bp('p3', 0.4, ['ayazana_nova', 'ayazana_ice_tomb', 'ayazana_blizzard'], { yell: 'Hangisi gerçek? Hiçbiri... hepsi!', ability: 'ayazana_mirror' }),
  ],
  intro: 'Ayaz sizi öpecek, çocuklar. Bir daha uyanmamak üzere...', death: 'Bahar... gelmeyecek... asla...',
  arena: { cx: 80, cz: 20, w: 40, h: 40, homeX: 80, homeZ: 20 },
});

// Image of Ayaz Ana (mirror phase) and Frost King's dragon
ENEMIES.ayaz_image = def({
  id: 'ayaz_image', name: 'Ayaz Ana Suretı', model: CHAR('Mage'), scale: 1.3, tint: 0xa8d8ff, role: 'caster', rank: 'elite', hp: 4, dmg: 1.0, speed: 0, radius: 0.7, aggro: 0, forces: 0, ccImmune: true,
  anims: { ...A_KAYKIT, death: 'Death_B' }, ai: { summoned: true, kite: [0, 80] }, visual: { hide: mageHide('2H_Staff', 'Mage_Hat'), opacity: 0.6, runRef: 7, glow: 0x80c8ff },
  basic: proj('ayaz_image_spear', 'Buz Mızrağı', 20, 80, 2, 3.0, 3.0, 'frost', 'frost_projectile', 'Spellcast_Long', 1.55, { castTime: 3.0, interruptible: true, sfx: 'frost_cast', params: { target: 1, impact: 1.55 } }),
  abilities: [],
});

boss({
  id: 'boss_tugrul', name: 'Donmuş Kral Tuğrul', title: 'Buzul Tahtının Sahibi', model: CHAR('Knight'), scale: 1.7, tint: 0xb8d8ff, role: 'tank',
  hp: 110, dmg: 2.5, speed: 5.3, radius: 1.3, enrage: 300, arenaR: 22, loot: 'loot_d3_b3', anims: { ...A_KAYKIT, idle: '2H_Melee_Idle', death: 'Death_B' }, resist: { frost: 0.75, fire: -0.15, physical: 0.1 },
  visual: { hide: KNIGHT_HIDE.filter((n) => n !== '2H_Sword' && n !== 'Knight_Helmet' && n !== 'Knight_Cape'), runRef: 7, clipsFrom: SKEL('Skeleton_Warrior'), eyeEmissive: 0x80d0ff, glow: 0x80c8ff },
  basic: cone('tugrul_slash', 'Kraliyet Kılıcı', 5, 120, 2.4, 1.0, '2H_Melee_Attack_Slice', 0.4, { windup: 0.6, telegraph: true }),
  abilities: [
    line('tugrul_verdict', 'Kraliyet Hükmü', 10, 3, 16, 1.2, 4.5, 'physical', '2H_Melee_Attack_Chop', 0.72, { initialCooldown: 8, tankBuster: true,statuses: [{ status: 'sunder', duration: 10 }], sfx: 'boss_cast' }),
    custom('tugrul_frost_mark', 'Ayaz İşareti', 25, 15, 1.0, 'Taunt', { sfx: 'frost_cast' }),
    custom('tugrul_spin', 'Ölümcül Dönüş', 30, 22, 1.5, 'Taunt', { sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('tugrul_dragon_phase', 'Kırağı Göklerde', 999, 9999, 1.0, 'Taunt', { sfx: 'boss_roar' }),
    custom('tugrul_wrath', 'Tahtın Gazabı', 999, 9999, 1.0, 'Taunt', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['tugrul_verdict', 'tugrul_frost_mark', 'tugrul_spin']),
    bp('p2', 0.55, ['tugrul_verdict', 'tugrul_frost_mark'], { yell: 'Kırağı! Göklerden in ve onları dondur!', ability: 'tugrul_dragon_phase' }),
    bp('p3', 0.25, ['tugrul_verdict', 'tugrul_frost_mark', 'tugrul_spin'], { yell: 'Taht... benimdir! SONSUZA DEK!', ability: 'tugrul_wrath' }),
  ],
  intro: 'Tahtım buzdan, kalbim buzdan. Sizinki de olacak!', death: 'Sonunda... sıcak... ne kadar... sıcak...',
  arena: { cx: 136, cz: 132, w: 48, h: 48, homeX: 136, homeZ: 138 },
});

ENEMIES.npc_kiragi = def({
  id: 'npc_kiragi', name: 'Kırağı', model: MON('Dragon_Evolved'), scale: 1.5, tint: 0xb0e0ff, emissive: 0x2060c0, role: 'support', rank: 'elite', hp: 1, dmg: 0, speed: 10, radius: 2, aggro: 0, forces: 0, ccImmune: true,
  flying: true, hover: 10, anims: A_FLY, ai: { summoned: true }, visual: { emissiveIntensity: 0.35, eyeEmissive: 0x80d0ff, hoverBob: 0.5 },
  basic: { id: 'kiragi_none', name: '-', kind: 'custom', range: 0, cooldown: 99, windup: 0, anim: '', params: { passive: 1 } },
});

// ---------------------------------------------------------------- 4.4 Gölge Tapınağı
boss({
  id: 'boss_nefris', name: 'Gözcü Nefris', title: 'Tarikatın Gölge Bıçağı', model: CHAR('Rogue'), scale: 1.55, tint: 0x6a4a9a, role: 'melee',
  hp: 60, dmg: 2.3, speed: 7.0, radius: 0.9, enrage: 180, arenaR: 19, loot: 'loot_d4_b1', anims: { ...A_KAYKIT, death: 'Death_B' }, resist: R_CULT,
  visual: { hide: ROGUE_HIDE.filter((n) => n !== 'Knife' && n !== 'Knife_Offhand'), runRef: 7, eyeEmissive: 0xff2040 },
  basic: cone('nefris_slash', 'Çift Hançer', 3.5, 90, 1.6, 1.0, 'Dualwield_Melee_Attack_Slice', 0.55, { windup: 0.5, telegraph: false, statuses: [poison(1, 0.3, 8)] }),
  abilities: [
    custom('nefris_shadowstep', 'Gölge Adımı', 15, 8, 1.0, 'Spellcast_Raise', { sfx: 'blink', params: { impact: 0.5 } }),
    custom('nefris_fan', 'Hançer Yelpazesi', 20, 12, 1.2, 'Throw', { sfx: 'dagger_throw', params: { impact: 0.75 } }),
    custom('nefris_clones', 'Gölge Klonları', 999, 9999, 1.0, 'Spellcast_Raise', { sfx: 'shadow_cast' }),
  ],
  phases: [
    bp('p1', 1.01, ['nefris_shadowstep', 'nefris_fan']),
    bp('p2', 0.66, ['nefris_shadowstep', 'nefris_fan'], { yell: 'Hangimi vuracaksın?', ability: 'nefris_clones' }),
    bp('p3', 0.33, ['nefris_shadowstep', 'nefris_fan'], { yell: 'Hangimi vuracaksın?', ability: 'nefris_clones' }),
  ],
  intro: 'Sizi saatlerdir izliyorum. Sıkıcısınız.', death: 'Efendim... uyan...',
  arena: { cx: 20, cz: 46, w: 40, h: 44, homeX: 20, homeZ: 38 },
});

ENEMIES.nefris_clone = def({
  id: 'nefris_clone', name: 'Nefris Klonu', model: CHAR('Rogue'), scale: 1.55, tint: 0x4a2a7a, role: 'melee', rank: 'elite', hp: 3, dmg: 1.15, speed: 7.0, radius: 0.9, aggro: 0, forces: 0, ccImmune: false,
  anims: { ...A_KAYKIT, death: 'Death_B' }, ai: { summoned: true }, visual: { hide: ROGUE_HIDE.filter((n) => n !== 'Knife' && n !== 'Knife_Offhand'), runRef: 7, eyeEmissive: 0xc040ff, opacity: 0.85 },
  basic: cone('nefris_clone_slash', 'Çift Hançer', 3.5, 90, 1.6, 1.0, 'Dualwield_Melee_Attack_Slice', 0.55, { windup: 0.5, statuses: [poison(1, 0.3, 8)] }),
  abilities: [onDeath(aoe('nefris_clone_burst', 'Gölge Patlaması', 'self_aoe', 3, 0, 0, 1.0, 1.5, 'shadow', '', 0, { vfx: 'shadow_burst' }))],
});

boss({
  id: 'boss_kevvas', name: 'Yutucu Kevvas', title: 'Boşluktan Gelen Açlık', model: MON('Demon'), scale: 2.0, tint: 0x6a3ab0, emissive: 0x3010a0, role: 'melee',
  hp: 75, dmg: 2.7, speed: 5.0, radius: 1.5, enrage: 210, arenaR: 19, loot: 'loot_d4_b2', anims: A_ENEMY, resist: R_DEMON, visual: { emissiveIntensity: 0.35, eyeEmissive: 0xc080ff },
  basic: cone('kevvas_claw', 'Pençe', 5, 120, 2.5, 1.0, 'Attack', 0.37, { windup: 0.65, telegraph: true }),
  abilities: [
    cone('kevvas_devour', 'Açlık', 5, 60, 16, 4.5, 'Attack', 0.37, { initialCooldown: 6, windup: 1.0, telegraph: true, tankBuster: true, parryable: false, damage: { coef: 4.5, type: 'shadow' }, statuses: [{ status: 'necrotic', duration: 8, stacks: 6 }], vfx: 'shadow_burst', sfx: 'boss_cast' } as Ab),
    custom('kevvas_void_pull', 'Boşluk Çekimi', 30, 15, 1.2, 'Attack', { sfx: 'boss_cast', params: { impact: 0.5 } }),
    custom('kevvas_rifts', 'Boşluk Yarıkları', 22, 10, 1.2, 'Jump', { sfx: 'boss_cast', params: { impact: 0.25 } }),
    custom('kevvas_feast', 'Ziyafet', 999, 9999, 1.2, 'Jump', { sfx: 'boss_roar', params: { impact: 0.3 } }),
    custom('kevvas_roar', 'Boşluk Kükremesi', 25, 25, 2.0, 'Jump', { sfx: 'boss_roar', params: { impact: 0.3 } }),
  ],
  phases: [
    bp('p1', 1.01, ['kevvas_devour', 'kevvas_void_pull', 'kevvas_rifts']),
    bp('p2', 0.5, ['kevvas_devour', 'kevvas_void_pull', 'kevvas_rifts', 'kevvas_roar'], { yell: 'ZİYAFET!', ability: 'kevvas_feast' }),
  ],
  intro: 'AÇ... ÇOK AÇ...', death: 'Boşluk... beni... geri... çağırıyor...',
  arena: { cx: 140, cz: 46, w: 40, h: 44, homeX: 140, homeZ: 46 },
});

boss({
  id: 'boss_zakhar', name: 'İblis Lordu Zakhar', title: 'Gölge Tapınağının Uyanan Tanrısı', model: MON('Demon_Lord'), scale: 1.5, role: 'melee',
  hp: 120, dmg: 2.5, speed: 5.6, radius: 1.6, enrage: 330, arenaR: 26, loot: 'loot_d4_b3', anims: A_CHAR, resist: R_DEMON, visual: { eyeEmissive: 0xff3040, hideBelowHp: { node: 'Trident', frac: 0.4 } },
  basic: line('zakhar_thrust', 'Üç Dişli Saplama', 6, 2, 2.3, 0.7, 1.0, 'physical', 'Weapon', 0.45, { telegraph: true, cooldown: 2.3, parryable: true }),
  abilities: [
    line('zakhar_impale', 'Üç Dişli Mızrak', 12, 2.5, 15, 1.2, 4.5, 'physical', 'Weapon', 0.45, { initialCooldown: 8, tankBuster: true, statuses: [bleed(1, 0.3, 8)], sfx: 'boss_cast' }),
    aoe('zakhar_nova', 'Cehennem Novası', 'self_aoe', 10, 10, 24, 2.5, 3.0, 'fire', 'Punch', 0.5, { initialCooldown: 14, castTime: 2.5, vfx: 'fire_burst', sfx: 'boss_cast' }),
    custom('zakhar_seals', 'Gölge Mühürleri', 30, 20, 1.0, 'Wave', { sfx: 'boss_cast', params: { impact: 0.8 } }),
    custom('zakhar_ritual', 'Tarikat Ayini', 999, 9999, 1.0, 'Duck', { sfx: 'boss_roar' }),
    custom('zakhar_awaken', 'Uyanış', 999, 9999, 1.0, 'Yes', { sfx: 'boss_roar' }),
    cone('zakhar_claws', 'Pençe Kombosu', 4.5, 120, 1.6, 1.0, 'Punch', 0.5, { windup: 0.5, telegraph: false }),
    custom('zakhar_hellrain', 'Ateş Yağmuru', 12, 5, 1.5, 'Wave', { sfx: 'boss_cast', params: { impact: 0.8 } }),
  ],
  phases: [
    bp('p1', 1.01, ['zakhar_impale', 'zakhar_nova', 'zakhar_seals']),
    bp('p2', 0.7, [], { yell: 'Müritlerim! Ayini tamamlayın!', ability: 'zakhar_ritual' }),
    bp('p3', 0.699, ['zakhar_impale', 'zakhar_nova', 'zakhar_seals']),
    bp('p4', 0.4, ['zakhar_nova', 'zakhar_seals', 'zakhar_hellrain'], { yell: 'Bu beden artık yeterince güçlü. UYANIYORUM!', ability: 'zakhar_awaken' }),
  ],
  intro: 'Tarikatım beni uyandırdı. Siz de bana kurban olarak sunuldunuz.', death: 'Gölgeler... asla... ölmez...',
  arena: { cx: 80, cz: 28, w: 56, h: 56, homeX: 80, homeZ: 26 },
});

// ---------------------------------------------------------------- 1.7 Open-world boss (Sisli Koru, Çürük Höyük)
boss({
  id: 'wb_curukkok', name: 'Çürükkök', title: 'Mantar Kral', model: MON('Mushroom_King'), scale: 1.36, role: 'melee',
  hp: 100, dmg: 2.5, speed: 4.4, radius: 1.7, enrage: 36000, arenaR: 24, loot: 'wb_curukkok', anims: A_CHAR, resist: { poison: 0.5, physical: 0.05 },
  visual: { eyeEmissive: 0xb060ff, runRef: 4.4, glow: 0xb060ff },
  basic: cone('curukkok_smash', 'Asa Darbesi', 5, 110, 2.6, 1.0, 'Weapon', 0.45, { windup: 0.65, telegraph: true }),
  abilities: [
    custom('curukkok_spores', 'Spor Bulutu', 15, 8, 0.9, 'Punch', { sfx: 'boss_cast', params: { impact: 0.45 } }),
    custom('curukkok_call', 'Mantarcık Çağrısı', 25, 15, 1.2, 'Wave', { sfx: 'boss_roar', params: { impact: 0.8 } }),
    custom('curukkok_jump', 'Zıplayan Ezici', 20, 12, 1.5, 'Jump', { sfx: 'boss_cast', params: { impact: 0.25 } }),
    custom('curukkok_rot_ring', 'Çürüme Halkası', 12, 4, 1.0, 'Wave', { sfx: 'boss_roar', params: { impact: 0.8 } }),
  ],
  phases: [
    bp('p1', 1.01, ['curukkok_spores', 'curukkok_call', 'curukkok_jump']),
    bp('p2', 0.2, ['curukkok_spores', 'curukkok_call', 'curukkok_jump', 'curukkok_rot_ring'], { yell: 'Çürüme her yere yayılıyor!' }),
  ],
  intro: 'Çürük höyüğüme basan kök olur, kök olan çürür!', death: 'Köklerim... kuruyor...',
  // Çürük Höyük: tile (25, 44) = world (102, 178), r 6 tiles = 24 m (the boss shifts this baked arena to where it really spawned)
  arena: { cx: 102, cz: 178, w: 48, h: 48, homeX: 102, homeZ: 178 },
});

// ---------------------------------------------------------------- 3.8 Open-world boss (Sisli Vadi, Ejder Yuvası, R5)
const A_EJDER: Anims = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death' };
// Ejder Yuvası: tile (12, 148) = world (50, 594), r 7 tiles = 28 m (WORLD ids: scripts in ai/bosses/world.ts)
boss({
  id: 'wb_alevkanat', name: 'Alevkanat', title: 'Kızıl Ejder', model: GENB('kizil_ejder'), scale: 1.0, role: 'melee',
  hp: 140, dmg: 2.6, speed: 5.0, radius: 2.2, enrage: 36000, arenaR: 28, loot: 'wb_alevkanat', anims: A_EJDER,
  resist: { fire: 0.5, frost: -0.25 }, armor: 1.5,
  visual: { runRef: 5, glow: 0xff6020, eyeEmissive: 0xff8020 },
  basic: cone('alevkanat_claw', 'Pençe Darbesi', 7, 100, 2.8, 1.0, 'Attack', 0.6, { windup: 0.7, telegraph: true }),
  abilities: [
    custom('alevkanat_tail', 'Kuyruk Savurma', 12, 10, 1.0, 'Attack2', { sfx: 'boss_cast', params: { impact: 0.65 } }),
    custom('alevkanat_breath', 'Alev Soluğu', 16, 14, 1.6, 'Cast', { sfx: 'boss_cast', params: { impact: 1.6 } }),
    custom('alevkanat_gust', 'Kanat Çırpma', 22, 20, 1.2, 'Attack', { sfx: 'boss_roar', params: { impact: 0.8 } }),
    custom('alevkanat_brood', 'Yavru Çağrısı', 30, undefined, 1.0, 'Wave', { sfx: 'boss_roar', params: { impact: 0.8 } }),
    custom('alevkanat_meteors', 'Meteor Yağmuru', 20, undefined, 2.0, 'Cast', { sfx: 'boss_cast', params: { impact: 1.2 } }),
    custom('alevkanat_dive', 'Ejder Dalışı', 18, undefined, 1.5, 'Attack', { sfx: 'boss_cast', params: { impact: 0.5 } }),
  ],
  phases: [
    bp('p1', 1.01, ['alevkanat_tail', 'alevkanat_breath', 'alevkanat_gust']),
    bp('p2', 0.7, ['alevkanat_tail', 'alevkanat_breath', 'alevkanat_gust', 'alevkanat_brood'], { yell: 'Yavrularım, yakın onları!' }),
    bp('p3', 0.5, ['alevkanat_tail', 'alevkanat_breath', 'alevkanat_gust', 'alevkanat_brood', 'alevkanat_meteors'], { yell: 'Kül olun!' }),
    bp('p4', 0.25, ['alevkanat_tail', 'alevkanat_breath', 'alevkanat_gust', 'alevkanat_brood', 'alevkanat_meteors', 'alevkanat_dive'], { yell: 'Gökyüzü benimdir!' }),
  ],
  intro: 'Kül olun, ey küçük kemikler!', death: 'Alevler... sönüyor...',
  arena: { cx: 50, cz: 594, w: 56, h: 56, homeX: 50, homeZ: 594 },
});

export const getEnemyDef = (id: string): EnemyDef | undefined => ENEMIES[id] ?? BOSSES[id];
