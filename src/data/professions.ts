/**
 * GDD_LIFE §1 MVP: the two gathering professions with data (Madencilik = ore, Bitki Toplama = herbs), their node types, the
 * skill-up colour curve and six starter recipes. Behaviour lives in systems/Professions.ts, node placement in
 * scenes/world/WorldGather.ts, the world entity in entities/interactables/GatherNode.ts.
 * Skins, fishing, tools and trainer tiers are not part of this MVP (see the GDD for them).
 */
import type { NodeTypeDef, ProfessionDef, ProfessionId, RecipeDef } from '../types/professions';

/** Skill runs 1..SKILL_MAX. */
export const SKILL_MAX = 300;
/** Skill needed to reach each tier (tier t covers 50(t-1)+1 .. 50t). Used for the tier label only in this MVP. */
export const TIER_START = [1, 41, 91, 141, 191, 241] as const;
/** Hold-F channel length of every gather node (s). */
export const GATHER_HOLD_SEC = 2;
/** Interaction distance of a node (m) and how far the character may drift during the channel before it is cancelled (m). */
export const GATHER_RANGE_M = 2.6;
export const GATHER_MOVE_TOL_M = 0.6;
/** Share of nodes that are rich veins (x2 yield, x1.5 respawn, bigger). */
export const RICH_CHANCE = 0.06;
/** Cap on the personal cooldown table kept in the save (oldest expired entries go first). */
export const COOLDOWN_CAP = 400;

export const PROFESSIONS: Record<'mine' | 'herb', ProfessionDef> = {
  mine: {
    id: 'mine', name: 'Madencilik', kind: 'gather', icon: '/assets/icons/item-ore.svg', color: '#b0b8c8',
    toolKind: 'pick', trainerNpc: '', desc: 'Cevher damarlarını kazarak cevher, kömür ve nadir taşlar çıkarırsın. Cevherden külçe ve bileme taşı üretirsin.',
  },
  herb: {
    id: 'herb', name: 'Bitki Toplama', kind: 'gather', icon: '/assets/icons/map-herb.svg', color: '#7adf7a',
    trainerNpc: '', desc: 'Şifalı ot ve mantarları elle toplarsın. Otlardan iksir üretirsin.',
  },
};

export const PROF_IDS: ('mine' | 'herb')[] = ['mine', 'herb'];

/** Tier of a skill value (1..6). 0 and 1 are tier 1. */
export function tierOfSkill(skill: number): number {
  return Math.min(6, Math.max(1, Math.ceil(skill / 50)));
}

/** Region (or any level band) to node tier: 1 + the number of thresholds the band's middle reaches. */
const TIER_LEVEL_THRESHOLDS = [11, 21, 31, 44, 54];
export function tierOfLevels(levels: [number, number]): number {
  const mid = (levels[0] + levels[1]) / 2;
  let t = 1;
  for (const th of TIER_LEVEL_THRESHOLDS) if (mid >= th) t++;
  return t;
}

export type SkillColor = 'locked' | 'orange' | 'yellow' | 'green' | 'grey';

/** GDD_LIFE §1.3 colours (WoW-style). `diff` = skill - skillReq of the node or recipe. */
export const SKILL_COLOR_HEX: Record<SkillColor, string> = {
  locked: '#ff4d4d', orange: '#ff8000', yellow: '#ffd100', green: '#1eff00', grey: '#9d9d9d',
};
export const SKILL_COLOR_NAME: Record<SkillColor, string> = {
  locked: 'Kilitli', orange: 'Zor', yellow: 'Orta', green: 'Kolay', grey: 'Önemsiz',
};

export function skillDiffColor(diff: number): SkillColor {
  if (diff < 0) return 'locked';
  if (diff < 15) return 'orange';
  if (diff < 30) return 'yellow';
  if (diff < 50) return 'green';
  return 'grey';
}

/** Skill-up chance: `1 - diff/60` for diff 0..49, 0 otherwise (orange 100 % to 77 %, grey never). */
export function skillUpChance(diff: number): number {
  return diff < 0 || diff >= 50 ? 0 : 1 - diff / 60;
}

const ore = (
  id: string, name: string, tier: number, skillReq: number, tint: number, emissive: number,
  yields: NodeTypeDef['yields'], rare: NodeTypeDef['rare'], nodeLevel: number,
): NodeTypeDef => ({
  id, name, prof: 'mine', tier, skillReq, model: 'voxel:ore', scale: 1, tint, emissive, gatherSec: GATHER_HOLD_SEC, strikes: 3,
  respawnSec: 300, yields, rare, nodeLevel, anim: 'mine',
});
const herb = (
  id: string, name: string, tier: number, skillReq: number, tint: number, yields: NodeTypeDef['yields'], nodeLevel: number,
): NodeTypeDef => ({
  id, name, prof: 'herb', tier, skillReq, model: 'voxel:herb', scale: 1, tint, gatherSec: GATHER_HOLD_SEC, strikes: 0,
  respawnSec: 240, yields, rare: [{ id: 'pollen', chance: 0.04 }], nodeLevel, anim: 'pick',
});

/** Node types (GDD_LIFE §1.5.2 and §1.5.3, tiers 1-6). Positions come from the layout, the type from the field's tier. */
export const NODE_TYPES: NodeTypeDef[] = [
  ore('ore_copper_node', 'Bakır Damarı', 1, 1, 0xb87333, 0x402010, [{ id: 'ore_copper', min: 1, max: 3 }], [{ id: 'gem_ruby_1', chance: 0.015 }], 5),
  ore('ore_iron_node', 'Demir Damarı', 2, 41, 0x8a8f9a, 0x202428, [{ id: 'ore_iron', min: 1, max: 3 }, { id: 'coal', min: 1, max: 2, chance: 0.25 }], [{ id: 'gem_emerald_1', chance: 0.02 }], 15),
  ore('ore_silver_node', 'Gümüş Damarı', 3, 91, 0xd8e0f0, 0x304060, [{ id: 'ore_silver', min: 1, max: 2 }, { id: 'coal', min: 1, max: 1, chance: 0.2 }], [{ id: 'gem_sapphire_1', chance: 0.03 }], 25),
  ore('ore_gold_node', 'Altın Damarı', 4, 141, 0xffd24a, 0x604010, [{ id: 'ore_gold', min: 1, max: 2 }], [{ id: 'gem_topaz_1', chance: 0.04 }], 38),
  ore('ore_dragon_node', 'Ejder Taşı Damarı', 5, 191, 0xd04a2a, 0x801808, [{ id: 'ore_dragon', min: 1, max: 2 }, { id: 'coal', min: 1, max: 1, chance: 0.2 }], [{ id: 'gem_amethyst_1', chance: 0.05 }], 50),
  ore('ore_ancient_node', 'Kadim Kristal Damarı', 6, 241, 0x9a60ff, 0x4020a0, [{ id: 'ore_ancient', min: 1, max: 2 }], [{ id: 'gem_diamond_1', chance: 0.02 }], 58),

  herb('herb_daisy_node', 'Ak Papatya', 1, 1, 0xfff27a, [{ id: 'herb_daisy', min: 1, max: 2 }], 5),
  herb('shroom_tan_node', 'Kahverengi Mantar', 1, 1, 0xc08a50, [{ id: 'shroom_tan', min: 1, max: 3 }], 5),
  herb('herb_sage_node', 'Adaçayı', 2, 41, 0x8fb08a, [{ id: 'herb_sage', min: 1, max: 2 }], 15),
  herb('shroom_red_node', 'Zehirli Mantar', 2, 46, 0xd04040, [{ id: 'shroom_red', min: 1, max: 2 }], 15),
  herb('herb_wolfsbane_node', 'Kurt Otu', 3, 91, 0xa070e0, [{ id: 'herb_wolfsbane', min: 1, max: 2 }], 25),
  herb('herb_dragontongue_node', 'Ejder Dili', 4, 141, 0xff8a30, [{ id: 'herb_dragontongue', min: 1, max: 2 }], 38),
  herb('herb_moonviolet_node', 'Ay Menekşesi', 5, 191, 0x7070ff, [{ id: 'herb_moonviolet', min: 1, max: 2 }], 50),
  herb('herb_lotus_node', 'Kadim Nilüfer', 6, 241, 0x30ffc0, [{ id: 'herb_lotus', min: 1, max: 2 }], 58),
];
export const NODE_TYPE_BY_ID: Record<string, NodeTypeDef> = Object.fromEntries(NODE_TYPES.map((n) => [n.id, n]));

/** Node types of one profession and tier (empty when the tier has none). */
export function nodeTypesFor(prof: ProfessionId, tier: number): NodeTypeDef[] {
  return NODE_TYPES.filter((n) => n.prof === prof && n.tier === tier);
}

const rec = (
  id: string, name: string, prof: ProfessionId, station: RecipeDef['station'], skillReq: number,
  inputs: RecipeDef['inputs'], outId: string, outCount = 1,
): RecipeDef => ({
  id, name, prof, station, tier: tierOfSkill(skillReq), skillReq, inputs, output: { id: outId, count: outCount }, timeSec: 2, learn: 'auto',
});

/** Six starter recipes: two smelting (Madencilik), two sharpening stones (Madencilik), two potions (Bitki Toplama). */
export const RECIPES: RecipeDef[] = [
  rec('rc_ingot_copper', 'Bakır Külçe', 'mine', 'forge', 1, [{ id: 'ore_copper', count: 2 }], 'ingot_copper'),
  rec('rc_ingot_iron', 'Demir Külçe', 'mine', 'forge', 41, [{ id: 'ore_iron', count: 2 }, { id: 'coal', count: 1 }], 'ingot_iron'),
  rec('rc_stone_1', 'Bileme Taşı I', 'mine', 'forge', 21, [{ id: 'ingot_copper', count: 1 }, { id: 'ore_copper', count: 2 }], 'bileme_tasi_1'),
  rec('rc_stone_2', 'Bileme Taşı II', 'mine', 'forge', 61, [{ id: 'ingot_iron', count: 1 }, { id: 'ore_iron', count: 2 }], 'bileme_tasi_2'),
  rec('rc_pot_hp_1', 'Şifa İksiri I', 'herb', 'alchemy', 1, [{ id: 'herb_daisy', count: 2 }, { id: 'shroom_tan', count: 1 }], 'pot_hp_1'),
  rec('rc_pot_res_1', 'Zihin İksiri I', 'herb', 'alchemy', 41, [{ id: 'herb_sage', count: 2 }, { id: 'herb_daisy', count: 1 }], 'pot_res_1'),
];
export const RECIPE_BY_ID: Record<string, RecipeDef> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
export const recipesOf = (prof: ProfessionId): RecipeDef[] => RECIPES.filter((r) => r.prof === prof);
