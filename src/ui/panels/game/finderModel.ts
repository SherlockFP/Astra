import type { DungeonDef } from '../../../types/dungeons';
import type { KeystoneData } from '../../../types/items';
import type { ClassId } from '../../../types/common';
import type { RoleId, SpecId } from '../../../types/v2';
import type { LfgListing } from '../../../net/messages';
import type { RoomInfo } from '../../../net/NetSession';
import { DUNGEONS, DUNGEON_IDS, MPLUS_POOL } from '../../../data/dungeons';
import { specRole, specsForClass } from '../../../data/specs';
import {
  cardText, difficultyState, gateToast, isStartable, recommendedIlvl, requiredLevel, type DiffState, type LadderChar, type LadderDiff,
} from './ladder';
import { enemyLevelFor } from './runStart';

/**
 * Zindan Bulucu rules (UI_REDESIGN section 6, UX-40). Pure functions: no DOM, no G calls except through the arguments
 * (the panel passes the character, the party and the rooms). Unit-checkable from dev/panels-game.html.
 * OWNER: panels-game module.
 */

export const FINDER_DIFFS: readonly LadderDiff[] = ['normal', 'heroic', 'mythic', 'mythicplus'];
export const DIFF_NAME: Record<LadderDiff, string> = { normal: 'Normal', heroic: 'Kahramanlık', mythic: 'Mitik 0', mythicplus: 'Mitik+' };
export const ROLE_ORDER: readonly RoleId[] = ['tank', 'healer', 'dps'];
export const ROLE_TR: Record<RoleId, string> = { tank: 'Tank', healer: 'Şifacı', dps: 'Hasarcı' };
export const ROLE_GLYPH: Record<RoleId, string> = { tank: 'T', healer: 'Ş', dps: 'H' };

/** Composition of a 5-player group: 1 tank, 1 healer, 3 damage. */
export const GROUP_BASE: Record<RoleId, number> = { tank: 1, healer: 1, dps: 3 };
export const GROUP_SIZE = 5;

/** Dungeons the finder lists: the levelling set (DUNGEON_IDS) plus the Mitik+ season pool (MPLUS_POOL), by level. */
export function finderDungeons(): DungeonDef[] {
  const seen = new Set<string>();
  const out: DungeonDef[] = [];
  for (const id of [...DUNGEON_IDS, ...MPLUS_POOL]) {
    const d = DUNGEONS[id];
    if (!d || d.outdoor || seen.has(id)) continue;
    seen.add(id);
    out.push(d);
  }
  return out.sort((a, b) => (a.levelRange?.[0] ?? 0) - (b.levelRange?.[0] ?? 0));
}

/** Season pool dungeons offer Kahramanlık, Mitik 0 and Mitik+ (no Normal); every other dungeon Normal, Kahramanlık, Mitik 0. */
export function difficultiesFor(def: DungeonDef): LadderDiff[] {
  return MPLUS_POOL.includes(def.id) ? ['heroic', 'mythic', 'mythicplus'] : ['normal', 'heroic', 'mythic'];
}

/** Pinned "ÖNERİLEN" dungeon: the highest one the character's level already meets (the first one otherwise). */
export function recommendedDungeon(list: readonly DungeonDef[], level: number): DungeonDef | undefined {
  let best: DungeonDef | undefined;
  for (const d of list) {
    const min = d.levelRange?.[0] ?? 1;
    if (level >= min && (!best || min > (best.levelRange?.[0] ?? 1))) best = d;
  }
  return best ?? list[0];
}

export interface DiffContext {
  /** The local character (CharacterState satisfies LadderChar). */
  ch: LadderChar;
  level: number;
  /** Keystones the local player may use through the leader (the leader passes the other members' keys). */
  party: readonly KeystoneData[];
  avgLevel: number;
  /** Tester switch: skips the clear requirements only (keystone.ts `?unlock`). */
  clearGatesOff: boolean;
}

/** One difficulty button of the detail pane. */
export interface DiffRow {
  diff: LadderDiff;
  name: string;
  st: DiffState;
  /** Enemy level shown on line 2 (Kahramanlık shows the fixed 50-60 band). */
  enemy: number;
  line2: string;
  /** State line (line 3 of the difficulty table in section 6.2). */
  line3: string;
  startable: boolean;
  /** Startable row whose enemy level is closest to the character's level (the recommended chip). */
  recommended: boolean;
}

/** State line of a difficulty (section 6.2 table, line 3). */
export function stateLine(def: DungeonDef, diff: LadderDiff, st: DiffState): string {
  switch (st.kind) {
    case 'open':
      return 'Açık';
    case 'cleared':
      return '✓ Temizlendi';
    case 'depleted':
      return 'Tükenmiş anahtar';
    case 'locked_level':
      return `Gereken seviye: ${st.need}`;
    case 'locked_quest':
      return cardText(def, diff, st);
    case 'locked_clear':
      return st.need === 'normal' ? 'Normal temizliği gerekli' : 'Kahramanlık temizliği gerekli';
    case 'locked_key':
      return 'Anahtar yok';
    case 'key_other':
      return cardText(def, diff, st);
  }
}

/** Rows of the difficulty selector for one dungeon, in the section 6.2 order (N, K, M, M+ where applicable). */
export function diffRows(def: DungeonDef, ctx: DiffContext): DiffRow[] {
  const rows: DiffRow[] = difficultiesFor(def).map((diff) => {
    const st = difficultyState(def, diff, ctx.ch, ctx.party, ctx.clearGatesOff);
    const enemy = enemyLevelFor(def, diff, ctx.avgLevel);
    let name = DIFF_NAME[diff];
    let line2: string;
    if (diff === 'normal') line2 = `Düşman Sv. ${enemy}`;
    else if (diff === 'heroic') line2 = 'Düşman Sv. 50–60';
    else if (diff === 'mythic') line2 = `Düşman Sv. ${enemy}`;
    else if (st.key) {
      name = `Mitik+ +${st.key.level}`;
      line2 = `Anahtar +${st.key.level}`;
    } else line2 = 'Anahtar yok';
    return { diff, name, st, enemy, line2, line3: stateLine(def, diff, st), startable: isStartable(st), recommended: false };
  });
  let best: DiffRow | undefined;
  for (const r of rows) if (r.startable && (!best || Math.abs(r.enemy - ctx.level) < Math.abs(best.enemy - ctx.level))) best = r;
  if (best) best.recommended = true;
  return rows;
}

/** Toast / reason text of a locked row (empty when startable). */
export function rowGateText(def: DungeonDef, row: DiffRow): string {
  return row.startable ? '' : gateToast(def, row.diff, row.st) || row.line3;
}

/** First party member below the level gate of a difficulty (null when everybody meets it). */
export function memberGate(def: DungeonDef, diff: LadderDiff, members: readonly { name: string; level: number }[]): string | null {
  const need = requiredLevel(def, diff);
  for (const m of members) if (m.level < need) return `${m.name} için seviye yetersiz (${need} gerekli).`;
  return null;
}

/** Roles a class can fill (roles of its specs; all three when no spec is registered for the class yet). */
export function allowedRoles(classId: ClassId | null | undefined): RoleId[] {
  if (!classId) return [...ROLE_ORDER];
  const set = new Set<RoleId>();
  for (const id of specsForClass(classId)) {
    const r = specRole(id as SpecId);
    if (r) set.add(r);
  }
  return set.size ? ROLE_ORDER.filter((r) => set.has(r)) : [...ROLE_ORDER];
}

/** Default role selection: the role of the active spec, else damage (below level 10 there is no spec). */
export function defaultRoles(spec: SpecId | undefined): RoleId[] {
  const r = spec ? specRole(spec) : undefined;
  return [r ?? 'dps'];
}

/**
 * Open slots by role for a group. Every member fills one slot: the first of its selected roles (in T, Ş, H order) that still
 * has an open slot. The group starts from 1 tank, 1 healer, 3 damage (a damage host alone: 1 / 1 / 2).
 */
export function needFor(members: readonly (readonly RoleId[])[]): Record<RoleId, number> {
  const need: Record<RoleId, number> = { ...GROUP_BASE };
  for (const roles of members) {
    const r = ROLE_ORDER.find((x) => roles.includes(x) && need[x] > 0);
    if (r) need[r] -= 1;
  }
  return need;
}

/** Open slots of a listing (sum of need). */
export const openSlots = (l: LfgListing): number => l.need.tank + l.need.healer + l.need.dps;

/** Filters of the Gruplar tab. */
export interface LfgFilter {
  dungeon: string;
  diff: LadderDiff | '';
  /** Only listings with an open slot for this role. */
  role: RoleId | '';
  noPassword: boolean;
}

/** Listing rows of the Gruplar tab (rooms with an LFG listing), after the filters. */
export function lfgRows(rooms: readonly RoomInfo[], f: LfgFilter): RoomInfo[] {
  return rooms.filter(
    (r) =>
      !!r.lfg &&
      (!f.dungeon || r.lfg.dungeon === f.dungeon) &&
      (!f.diff || r.lfg.diff === f.diff) &&
      (!f.role || r.lfg.need[f.role] > 0) &&
      (!f.noPassword || !r.hasPassword),
  );
}

/** Why a listing cannot be joined right now ('' = joinable). */
export function joinBlocker(r: RoomInfo, level: number, itemLevel: number): string {
  if (r.hasPassword) return 'Şifreli oda: Grup panelinden katıl.';
  if (r.inProgress) return 'Grup şu anda zindanda.';
  if (r.compatible === false) return `Sürüm uyumsuz (oda: v${r.version})`;
  if (r.players >= r.maxPlayers) return 'Oda dolu.';
  if (r.minLevel && level < r.minLevel) return `Seviye yetersiz (${r.minLevel} gerekli).`;
  if (r.lfg?.ilvl && itemLevel < r.lfg.ilvl) return `Eşya seviyesi yetersiz (${r.lfg.ilvl} gerekli).`;
  return '';
}

/** The listing a leader announces for a dungeon and difficulty; `members` = the selected roles of every member. */
export function listingFor(def: DungeonDef, diff: LadderDiff, keyLevel: number, members: readonly (readonly RoleId[])[]): LfgListing {
  const need = needFor(members);
  return {
    dungeon: def.id,
    diff,
    ...(diff === 'mythicplus' && keyLevel ? { key: keyLevel } : {}),
    need: { tank: need.tank, healer: need.healer, dps: need.dps },
    ilvl: recommendedIlvl(def, diff, keyLevel || 2),
  };
}
