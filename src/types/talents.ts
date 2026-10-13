/**
 * GDD_TALENTS shared types (core module, T0). Appendix A of docs/GDD_TALENTS.md, copied verbatim; the imports are the only addition.
 * Append-only for everyone: add optional fields / members, never rename or remove. See ARCHITECTURE.md "Talents contracts".
 */
import type { ClassId, PipId } from './common';
import type { StatBlock, StatId } from './stats';
import type { SpecId } from './v2';

export type TreeKind = 'class' | 'spec';
export type NodeType = 'P' | 'C' | 'M' | 'A' | 'K';
export type SlotId = 's01'|'s02'|'s03'|'s04'|'s05'|'s06'|'s07'|'s08'|'s09'|'s10'|'s11'|'s12'|'s13'|'s14'|'s15'|'s16'|'s17'|'s18'|'s19'|'s20'
                   | 's21'|'s22'|'s23'|'s24'|'s25'|'s26'|'s27'|'s28'|'s29'|'s30';
export interface FxText { name: string; desc: string; fx: string }
export interface TreeNodeDef {
  slot: SlotId; type: NodeType; row: number; col: number; gate: number; parents: SlotId[];
  ranks: 1 | 2; stat?: StatId; options: FxText[];
}
export interface TreeDef { id: string; kind: TreeKind; classId: ClassId; specId?: SpecId; name: string; nodes: TreeNodeDef[] }
export interface TalentLoadout { id: string; name: string; cls: number[]; spc: number[]; skl: number[]; at: number }
export interface TalentBuild { v: 1; active: Partial<Record<SpecId, TalentLoadout>>; saved: Partial<Record<SpecId, TalentLoadout[]>>; removals: number }
export interface SkillSpecRow { classId: ClassId; skill: string; tier: 1 | 2 | 3; opt: 'A' | 'B'; name: string; desc: string; fx: string }

// effect DSL (parsed form)
export type Cond = { c: 'hp<' | 'hp>' | 'res<' | 'res>' | 'thp<' | 'thp>'; v: number } | { c: 'pips>='; v: number; id: PipId }
                 | { c: 'tst' | 'sst'; status: string } | { c: 'still' | 'moving' | 'stealth' | 'elite' | 'boss' | 'shield' | 'inCombat' | 'solo' };
export type FxItem =
  | { k: 'S'; stats: StatBlock }
  | { k: 'M'; target: string; ops: { op: string; mode?: '=' | '+=' | '*='; v: string | number }[] }
  | { k: 'T'; trig: string; filter?: string; conds: Cond[]; ch: number; icd: number; actions: { a: string; args: string[] }[] }
  | { k: 'G'; skill: string }
  | { k: 'X'; id: string; params: Record<string, number> };
export interface ModEntry { target: string; op: string; mode?: '=' | '+=' | '*='; v: string | number; src: string }
export interface ProcEntry { id: string; on: string; filter?: string; conds: Cond[]; ch: number; icd: number; actions: { a: string; args: string[] }[]; src: string }
export interface ActiveFx { stats: StatBlock; mods: ModEntry[]; procs: ProcEntry[]; grants: string[]; bespoke: Record<string, Record<string, number>> }
