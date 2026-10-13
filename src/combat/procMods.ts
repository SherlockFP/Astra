/**
 * COMBAT_WOW §2.7 item 3 / §4.3 CW-03 / Appendix B. OWNER: combat (generic proc modifiers).
 *
 * `PROC_MODS` maps a proc status to the engine effect its consumption grants on the listed skills (cost 0,
 * free cooldown, cooldown reset, more damage, bonus pips, heal on cast). Mage procs keep their own hook table
 * (CW-13); their glow still comes from `PROC_DEFS`, so they have no rows here.
 *
 * Pure pieces: `resolveProcMods(p, skillId)` merges every active proc mod for a skill, `consumeProcMods(p, r)` removes
 * the consumed statuses and returns the heal fraction. NOT WIRED: SkillSystem calls these in CW-07.
 */
import type { PipId } from '../types/common';
import type { StatusId } from '../types/skills';
import type { ProcStatusView } from '../data/procs';
// KIT PK-0 (docs/kits/casters-rogue.md §h): kit proc mods (empty until the class packages fill them), merged below.
import { PROC_MODS_KIT_MAGE } from '../data/procs_kit_mage';
import { PROC_MODS_KIT_ROGUE } from '../data/procs_kit_rogue';
import { PROC_MODS_KIT_WARLOCK } from '../data/procs_kit_warlock';

export interface ProcMod {
  /** Proc status that enables this mod. Also the key of PROC_MODS. */
  status: StatusId;
  /** Skill ids (or `@tag` tokens) this mod applies to. */
  skills: string[];
  /** Resource cost multiplier (0 = free). Multiplied across active mods. */
  costMult?: number;
  /** Cast time multiplier (0 = instant). Multiplied across active mods. */
  castTimeMult?: number;
  /** Damage "more" multiplier. Multiplied across active mods. */
  more?: number;
  /** Added to crit chance (0..1). Summed across active mods. */
  critBonus?: number;
  /** The next hit of the skill is a crit. */
  forceCrit?: boolean;
  /** The skill does not start its cooldown. */
  cdFree?: boolean;
  /** The skill's cooldown is reset when consumed. */
  cdReset?: boolean;
  /** Pips granted on cast (Adalet for knight, Kombo for rogue). */
  bonusPips?: { id: PipId; n: number };
  /** The skill's execute threshold ignores target HP (Ani Ölüm). */
  anyHp?: boolean;
  /** Consumed on a cast of a listed skill. */
  consume: 'cast';
  /** Effects applied when the proc is consumed. */
  onConsume?: { healPct?: number };
}

/** Appendix B rows (non-mage). Kit packages add their rows with `registerProcMods()`. */
export const PROC_MODS: Partial<Record<StatusId, ProcMod>> = {};

function seed(rows: readonly ProcMod[]): void {
  for (const row of rows) PROC_MODS[row.status] = row;
}

seed([
  { status: 'art_of_justice', skills: ['knight_wake_of_flames'], costMult: 0, cdReset: true,
    bonusPips: { id: 'adalet', n: 1 }, consume: 'cast' },
  { status: 'revenge_ready', skills: ['knight_shield_bash'], costMult: 0, cdFree: true, more: 1.4, consume: 'cast' },
  { status: 'sudden_death', skills: ['barbarian_execute'], costMult: 0, anyHp: true, consume: 'cast' },
  { status: 'wrath_return', skills: ['barbarian_cleave'], costMult: 0, onConsume: { healPct: 0.04 }, consume: 'cast' },
  { status: 'opportunity', skills: ['rogue_crossbow_shot'], costMult: 0, more: 1.6,
    bonusPips: { id: 'combo', n: 1 }, consume: 'cast' },
]);

/**
 * Extension point for kit packages (docs/kits/*.md `data/procs_kit_<class>.ts` PROC_MODS fragments). Throws on a
 * duplicate status so two merges can never silently overwrite each other.
 */
export function registerProcMods(rows: readonly ProcMod[]): void {
  for (const row of rows) {
    if (PROC_MODS[row.status]) throw new Error(`registerProcMods: duplicate ProcMod status "${row.status}"`);
    PROC_MODS[row.status] = row;
  }
}

// KIT PK-0: one merge line for the three kit files (empty until PK-MAGE / PK-ROGUE / PK-WARLOCK).
registerProcMods([...PROC_MODS_KIT_MAGE, ...PROC_MODS_KIT_ROGUE, ...PROC_MODS_KIT_WARLOCK]);

/** Merged effect of every active proc mod that applies to one skill. */
export interface ResolvedProcMods {
  skillId: string;
  /** Statuses that `consumeProcMods` removes. */
  sources: StatusId[];
  costMult: number;
  castTimeMult: number;
  more: number;
  critBonus: number;
  forceCrit: boolean;
  cdFree: boolean;
  cdReset: boolean;
  anyHp: boolean;
  bonusPips: { id: PipId; n: number }[];
  /** Heal fraction of max HP granted on consume (summed). */
  healPct: number;
}

/**
 * Merge the mods of every proc active on `p` that applies to `skillId`. Returns null when none applies.
 * Multipliers multiply, bonuses add, flags OR together.
 */
export function resolveProcMods(p: ProcStatusView, skillId: string): ResolvedProcMods | null {
  let out: ResolvedProcMods | null = null;
  for (const mod of Object.values(PROC_MODS)) {
    if (!mod || !p.has(mod.status) || !mod.skills.includes(skillId)) continue;
    out ??= {
      skillId, sources: [], costMult: 1, castTimeMult: 1, more: 1, critBonus: 0, forceCrit: false,
      cdFree: false, cdReset: false, anyHp: false, bonusPips: [], healPct: 0,
    };
    out.sources.push(mod.status);
    out.costMult *= mod.costMult ?? 1;
    out.castTimeMult *= mod.castTimeMult ?? 1;
    out.more *= mod.more ?? 1;
    out.critBonus += mod.critBonus ?? 0;
    out.forceCrit ||= mod.forceCrit ?? false;
    out.cdFree ||= mod.cdFree ?? false;
    out.cdReset ||= mod.cdReset ?? false;
    out.anyHp ||= mod.anyHp ?? false;
    if (mod.bonusPips) out.bonusPips.push(mod.bonusPips);
    out.healPct += mod.onConsume?.healPct ?? 0;
  }
  return out;
}

/** The part of StatusEffects that consumption needs. */
export interface ProcStatusHost extends ProcStatusView {
  remove(id: StatusId): void;
}

/**
 * Consume the procs behind a resolved mod set: removes each source status that is still active and returns the heal
 * fraction the caller should apply. Safe to call twice (the second call finds nothing to remove and returns 0).
 */
export function consumeProcMods(p: ProcStatusHost, r: ResolvedProcMods | null): number {
  if (!r) return 0;
  let consumed = 0;
  for (const id of r.sources) {
    if (!p.has(id)) continue;
    p.remove(id);
    consumed++;
  }
  return consumed > 0 ? r.healPct : 0;
}
