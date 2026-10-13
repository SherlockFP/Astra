/**
 * Quest data model (GDD_OPENWORLD §6.1, §9.1). Data only: the runtime is systems/Quests.ts (G.quests).
 * Quests are one-time per character (flags `q.<id>`), progress is local per peer.
 */

export type QuestKind = 'talk' | 'kill' | 'collect' | 'skill' | 'boss' | 'metin' | 'dungeon' | 'explore';

export interface QuestObjective {
  kind: QuestKind;
  /** enemyId | family | itemId | npcId | placeId | dungeonId[:difficulty] */
  target?: string;
  count: number;
  /** Turkish objective line shown in the tracker / questlog. */
  text: string;
}

export interface QuestReward {
  /** % of xpToNext(quest level). */
  xpPct: number;
  goldPerLevel?: number;
  items?: { id: string; count: number }[];
  generic?: { rarity: 'uncommon' | 'rare' | 'epic'; slot?: 'weapon' | 'armor' | 'jewelry' }[];
}

export interface QuestDef {
  id: string;
  name: string;
  main?: boolean;
  level: number;
  region?: string;
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
}

/** locked = prerequisites not met yet; available = can be accepted; active = in progress; ready = turn in; done = finished. */
export type QuestState = 'locked' | 'available' | 'active' | 'ready' | 'done';
