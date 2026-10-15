/**
 * Quest data model (GDD_OPENWORLD §6.1, §9.1). Data only: the runtime is systems/Quests.ts (G.quests).
 * Quests are one-time per character (flags `q.<id>`), progress is local per peer.
 */

/**
 * talk, kill, collect, skill, boss, metin, dungeon, explore: the original kinds.
 * elite: one named elite (rank elite / miniboss) by id.
 * drop: `count` items of `target` roll from the kills in `from` (chance `chance` per kill); bag-based like collect.
 * interact: `count` world objects (target = object id) reported through onEvent('interact', id).
 * use: the quest item `item` used on `target` (place / npc / object id) through QuestSystem.useItem; one item per use.
 * escort: stay alive near the escorted NPC for `count` seconds (QuestSystem.tickEscort).
 */
export type QuestKind = 'talk' | 'kill' | 'collect' | 'skill' | 'boss' | 'metin' | 'dungeon' | 'explore'
  | 'elite' | 'drop' | 'interact' | 'use' | 'escort';

export interface QuestObjective {
  kind: QuestKind;
  /** enemyId | family | itemId | npcId | placeId | dungeonId[:difficulty] | object id (interact) */
  target?: string;
  count: number;
  /** Turkish objective line shown in the tracker / questlog. */
  text: string;
  /** drop: enemy ids / families the item rolls from. Without it the source is the quest's kill objectives (collect rule). */
  from?: string[];
  /** drop: chance per matching kill (0..1). Default: the collect chance (systems/Quests.ts). */
  chance?: number;
  /** use: the quest item consumed by each use (data/materials.ts id). */
  item?: string;
}

export interface QuestReward {
  /** % of xpToNext(quest level). */
  xpPct: number;
  goldPerLevel?: number;
  items?: { id: string; count: number }[];
  generic?: { rarity: 'uncommon' | 'rare' | 'epic'; slot?: 'weapon' | 'armor' | 'jewelry' }[];
  /** WoW-style choice: one class-appropriate item per listed slot is offered when the quest is turned in; the player keeps one. */
  choice?: { rarity: 'uncommon' | 'rare' | 'epic'; slots: ('weapon' | 'armor' | 'jewelry')[] };
}

export interface QuestDef {
  id: string;
  name: string;
  main?: boolean;
  level: number;
  region?: string;
  /** Layout place (camp / region / village id). The objective arrow points at its camp while no enemy of a kill objective is streamed in. */
  place?: string;
  /** TownNpc id that offers the quest. */
  giver: string;
  /** TownNpc id that turns it in (default: giver). */
  turnIn?: string;
  /** Quest ids that must be done first. */
  prereq?: string[];
  objectives: QuestObjective[];
  reward: QuestReward;
  text: { offer: string; progress: string; done: string };
  /** Quest ids / flags unlocked on completion. */
  unlocks?: string[];
  /** Repeatable once per local calendar day: a turned-in daily is offered again on the next day (systems/Quests.ts). */
  daily?: boolean;
  /** Bonus objective of a region: mixed objectives, one shared progress bar (QuestSystem.progressPct). */
  bonus?: boolean;
  /** Quest items handed over on accept (use objectives need the item in the bag). */
  startItems?: { id: string; count: number }[];
}

/** locked = prerequisites not met yet; available = can be accepted; active = in progress; ready = turn in; done = finished. */
export type QuestState = 'locked' | 'available' | 'active' | 'ready' | 'done';

/**
 * Chance per matching kill that a quest item (`collect`, `drop`) drops while its quest is active. WoW low-level quest items drop
 * 60-80 % per kill from the right mob. At 0.7 the expected kills per objective are count / 0.7 (~1.43 x count); content-check
 * (dev/contentCheck.ts checkQuests) fails any objective above 1.6 x count, i.e. a chance below 0.625.
 */
export const QUEST_DROP_CHANCE = 0.7;
