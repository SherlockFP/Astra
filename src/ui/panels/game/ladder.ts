import { G } from '../../../game/G';
import type { DungeonDef } from '../../../types/dungeons';
import type { KeystoneData } from '../../../types/items';
import { DUNGEONS } from '../../../data/dungeons';
import { hasCleared } from '../../../systems/Bounties';
import { normalLevelGate } from '../../../systems/instanceScaling';
import { LADDER_TR } from '../../../scenes/world/Ladder';

/**
 * Difficulty ladder rules for the dungeon UI (GDD_OPENWORLD §7.2-7.6). Pure functions (no DOM), so the keystone panel, the
 * world-entrance variant and any test can ask the same question: "is this difficulty open for this character, and if not, why?".
 * OWNER: panels-game module.
 */

/** 'mythicplus' is the GDD id; the keystone panel's internal id is 'mplus'. */
export type LadderDiff = 'normal' | 'heroic' | 'mythic' | 'mythicplus';

export type DiffKind =
  | 'open'
  | 'cleared'
  | 'locked_level'
  | 'locked_quest'
  | 'locked_clear'
  | 'locked_key'
  | 'key_other'
  | 'depleted';

export interface DiffState {
  kind: DiffKind;
  /** locked_level: level; locked_quest: quest id; locked_clear: prerequisite difficulty; key_other / open / depleted: dungeon id or key level. */
  need?: number | string;
  /** The keystone the state refers to (mythicplus only). */
  key?: KeystoneData | null;
}

/** The part of a character the rules read. CharacterState satisfies it. */
export interface LadderChar {
  level: number;
  save: { flags: Record<string, number | boolean | string>; mythic: { keystone: KeystoneData | null } };
}

export const HEROIC_LEVEL = 50;
export const MYTHIC_LEVEL = 60;

/** Normal unlock quest per dungeon (GDD_OPENWORLD §7.2). The quest shows the door; the level fallback opens it anyway. */
export const UNLOCK_QUEST: Record<string, string> = {
  kemik_mahzeni: 'mq_09_mezarligin_sirri',
  kizil_dokumhane: 'mq_14_bataklik_cadisi',
  buzul_tahti: 'mq_19_kuzgunkaleye_donus',
  golge_tapinagi: 'mq_30_golge_muhru',
};

const QUEST_TITLE_FALLBACK: Record<string, string> = {
  mq_09_mezarligin_sirri: 'Mezarlığın Sırrı',
  mq_14_bataklik_cadisi: 'Bataklık Cadısı',
  mq_19_kuzgunkaleye_donus: "Kuzgunkale'ye Dönüş",
  mq_30_golge_muhru: 'Gölge Mührü',
};

/** Turkish quest title for a gate text (live quest data first, then the fallback table). */
export function questTitle(questId: string): string {
  return G.quests?.def(questId)?.name ?? QUEST_TITLE_FALLBACK[questId] ?? 'Karakır zinciri';
}

/** Map the keystone panel's internal difficulty id to the GDD id. */
export function toLadder(d: 'normal' | 'heroic' | 'mythic' | 'mplus'): LadderDiff {
  return d === 'mplus' ? 'mythicplus' : d;
}

/** Level a character needs to enter this difficulty (party members are checked against it too). */
export function requiredLevel(def: DungeonDef, d: LadderDiff): number {
  if (d === 'normal') return normalLevelGate(def.levelRange);
  if (d === 'heroic') return HEROIC_LEVEL;
  return MYTHIC_LEVEL;
}

/**
 * State of one difficulty card (GDD_OPENWORLD §7.3 difficultyState). `party` holds the keystones the local player may use
 * through the leader (the leader passes the other members' keys; everybody else passes []). `clearGatesOff` is the tester
 * switch of the keystone panel (`?unlock`): it skips only the clear requirements.
 */
export function difficultyState(def: DungeonDef, d: LadderDiff, ch: LadderChar, party: readonly KeystoneData[] = [], clearGatesOff = false): DiffState {
  const lvl = ch.level;
  const min = def.levelRange?.[0] ?? 1;
  switch (d) {
    case 'normal': {
      if (lvl < min) return { kind: 'locked_level', need: min };
      const q = UNLOCK_QUEST[def.id];
      if (q && ch.save.flags['q.' + q] !== 'done' && lvl < min + 2) return { kind: 'locked_quest', need: q };
      return { kind: hasCleared(def.id, 'normal') ? 'cleared' : 'open' };
    }
    case 'heroic': {
      if (lvl < HEROIC_LEVEL) return { kind: 'locked_level', need: HEROIC_LEVEL };
      if (!clearGatesOff && !hasCleared(def.id, 'normal')) return { kind: 'locked_clear', need: 'normal' };
      return { kind: hasCleared(def.id, 'heroic') ? 'cleared' : 'open' };
    }
    case 'mythic': {
      if (lvl < MYTHIC_LEVEL) return { kind: 'locked_level', need: MYTHIC_LEVEL };
      if (!clearGatesOff && !hasCleared(def.id, 'heroic')) return { kind: 'locked_clear', need: 'heroic' };
      return { kind: hasCleared(def.id, 'mythic') ? 'cleared' : 'open' };
    }
    case 'mythicplus': {
      if (lvl < MYTHIC_LEVEL) return { kind: 'locked_level', need: MYTHIC_LEVEL };
      const keys = [ch.save.mythic.keystone, ...party].filter((k): k is KeystoneData => !!k);
      if (!keys.length) return { kind: 'locked_key' };
      const mine = keys.find((k) => k.dungeonId === def.id);
      if (!mine) return { kind: 'key_other', need: keys[0].dungeonId, key: keys[0] };
      return { kind: mine.depleted ? 'depleted' : 'open', need: mine.level, key: mine };
    }
  }
}

/** True when the card can be entered (the party gates are checked separately). */
export const isStartable = (st: DiffState): boolean => st.kind === 'open' || st.kind === 'cleared' || st.kind === 'depleted';

/** Recommended item level for the portal text (GDD_OPENWORLD §7.2): Normal min-2, Heroic 50, Mythic 0 60, M+ by key level. */
export function recommendedIlvl(def: DungeonDef, d: LadderDiff, keyLevel = 2): number {
  switch (d) {
    case 'normal':
      return (def.levelRange?.[0] ?? 1) - 2;
    case 'heroic':
      return 50;
    case 'mythic':
      return 60;
    case 'mythicplus':
      if (keyLevel <= 4) return 62;
      if (keyLevel <= 7) return 66;
      if (keyLevel <= 10) return 72;
      if (keyLevel <= 13) return 78;
      if (keyLevel <= 15) return 84;
      return 90;
  }
}

/** Red warning line: the character's item level is more than 6 below the recommendation (never a hard gate). */
export const isUnderGeared = (itemLevel: number, rec: number): boolean => itemLevel < rec - 6;

/** Card text of a locked / special state (GDD_OPENWORLD §7.5). Empty for open / cleared. */
export function cardText(def: DungeonDef, d: LadderDiff, st: DiffState): string {
  switch (st.kind) {
    case 'locked_level':
      return `Gereken seviye: ${st.need}`;
    case 'locked_quest': {
      const n = (def.levelRange?.[0] ?? 1) + 2;
      return `Kapı mühürlü: '${questTitle(String(st.need))}' görevini bitir (${n}. seviyede kapı kendiliğinden açılır).`;
    }
    case 'locked_clear':
      return d === 'heroic' ? 'Önce bu zindanı Normal zorlukta bitir.' : 'Önce bu zindanı Kahramanlık zorluğunda bitir.';
    case 'locked_key':
      return LADDER_TR.needKey;
    case 'key_other':
      return `Anahtarın ${DUNGEONS[String(st.need)]?.name ?? st.need} için; grup lideri başka bir üyenin anahtarını seçebilir.`;
    case 'depleted':
      return 'Tükenmiş anahtar: son koşu zamanında bitmedi.';
    default:
      return '';
  }
}

/** Toast text when a locked card is clicked (GDD_OPENWORLD §7.6 `ladder.need_*`). Empty for playable states. */
export function gateToast(def: DungeonDef, d: LadderDiff, st: DiffState): string {
  const zone = def.name;
  switch (st.kind) {
    case 'locked_level':
      return LADDER_TR.needLevel(zone, Number(st.need));
    case 'locked_quest':
      return `${zone} kapısı mühürlü: '${questTitle(String(st.need))}' görevini bitir (${(def.levelRange?.[0] ?? 1) + 2}. seviyede kapı kendiliğinden açılır).`;
    case 'locked_clear':
      return d === 'heroic' ? LADDER_TR.needClearNormal(zone) : LADDER_TR.needClearHeroic(zone);
    case 'locked_key':
      return LADDER_TR.needKey;
    case 'key_other':
      return cardText(def, d, st);
    default:
      return '';
  }
}

/** Best Mitik 0 time (seconds) stored by the ladder bookkeeping, or null. */
export function bestM0Sec(def: DungeonDef): number | null {
  const v = G.character?.save.flags[`m0.best.${def.id}`];
  return typeof v === 'number' && v > 0 ? v : null;
}
