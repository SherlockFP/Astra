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
import { STATUS_RULES } from '../data/statuses';
// KIT PK-0 (docs/kits/casters-rogue.md §h): kit proc mods (empty until the class packages fill them), merged below.
import { PROC_MODS_KIT_MAGE } from '../data/procs_kit_mage';
import { PROC_MODS_KIT_ROGUE } from '../data/procs_kit_rogue';
import { PROC_MODS_KIT_WARLOCK } from '../data/procs_kit_warlock';
// KIT PM-BA (docs/kits/plate-melee.md §4b): barbarian proc mods (gore, gory_maul, gory_iron).
import { PROC_MODS_KIT_BARBARIAN } from '../data/procs_kit_barbarian';
// KIT PM-KN (docs/kits/plate-melee.md §1b / §2b): knight proc mods (sudden_death shared with barbarian_execute).
import { PROC_MODS_KIT_KNIGHT } from '../data/procs_kit_knight';
// KIT PM-PA (docs/kits/plate-melee.md §5b-§7b): paladin proc mods (shining_light, infusion_of_light, art_of_war, hammer_window, templar_combo).
import { PROC_MODS_KIT_PALADIN } from '../data/procs_kit_paladin';

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
  /** The skill's Kutsal Güç (pip) cost is waived: a free Işığın Sözü (Parlak Işık, PM-PA). */
  pipFree?: boolean;
  /** The skill's cooldown is reset when consumed. */
  cdReset?: boolean;
  /** Pips granted on cast (Adalet for knight, Kombo for rogue). */
  bonusPips?: { id: PipId; n: number };
  /** The skill's execute threshold ignores target HP (Ani Ölüm). */
  anyHp?: boolean;
  /** Consumed on a cast of a listed skill. */
  consume: 'cast';
  /** Consume one stack only (the status keeps its other stacks). Ani Ölüm: 2 stacks, one per Cellat / İdam. */
  consumeOne?: boolean;
  /** Resource gained when the proc is consumed (Kanlı Fırsat: +5 Öfke on Yarma). */
  resource?: number;
  /** Effects applied when the proc is consumed. */
  onConsume?: { healPct?: number };
}

/** Appendix B rows (non-mage). Kit packages add their rows with `registerProcMods()`. */
export const PROC_MODS: Partial<Record<StatusId, ProcMod>> = {};

function seed(rows: readonly ProcMod[]): void {
  for (const row of rows) PROC_MODS[row.status] = row;
}

seed([
  // art_of_justice / revenge_ready / sudden_death: knight rows moved to data/procs_kit_knight.ts (PM-KN)
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
registerProcMods([...PROC_MODS_KIT_MAGE, ...PROC_MODS_KIT_ROGUE, ...PROC_MODS_KIT_WARLOCK, ...PROC_MODS_KIT_KNIGHT, ...PROC_MODS_KIT_BARBARIAN, ...PROC_MODS_KIT_PALADIN]);

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
  /** A pip-cost spender is free (Parlak Işık). */
  pipFree: boolean;
  anyHp: boolean;
  bonusPips: { id: PipId; n: number }[];
  /** Heal fraction of max HP granted on consume (summed). */
  healPct: number;
  /** Sources that lose one stack on consume instead of the whole status. */
  oneStack: StatusId[];
  /** Resource granted on consume (summed). */
  resource: number;
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
      cdFree: false, cdReset: false, pipFree: false, anyHp: false, bonusPips: [], healPct: 0, oneStack: [], resource: 0,
    };
    out.sources.push(mod.status);
    out.costMult *= mod.costMult ?? 1;
    out.castTimeMult *= mod.castTimeMult ?? 1;
    out.more *= mod.more ?? 1;
    out.critBonus += mod.critBonus ?? 0;
    out.forceCrit ||= mod.forceCrit ?? false;
    out.cdFree ||= mod.cdFree ?? false;
    out.cdReset ||= mod.cdReset ?? false;
    out.pipFree ||= mod.pipFree ?? false;
    out.anyHp ||= mod.anyHp ?? false;
    if (mod.bonusPips) out.bonusPips.push(mod.bonusPips);
    out.healPct += mod.onConsume?.healPct ?? 0;
    if (mod.consumeOne) out.oneStack.push(mod.status);
    out.resource += mod.resource ?? 0;
  }
  return out;
}

/** The part of StatusEffects that consumption needs. */
export interface ProcStatusHost extends ProcStatusView {
  remove(id: StatusId): void;
  /** One stack off (StatusEffects.consumeStack). Optional: fakes without it lose the whole status. */
  consumeStack?(id: StatusId): boolean;
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
    if (r.oneStack.includes(id) && p.consumeStack) p.consumeStack(id);
    else p.remove(id);
    consumed++;
  }
  return consumed > 0 ? r.healPct : 0;
}

// ---- PM-00b (plate-melee §g need 4): status riders read from STATUS_RULES -----------------------------------------------

/** Anything that lists its active statuses (StatusEffects.ids). */
export interface StatusIdsView { ids(): StatusId[] }

/** Cooldown multiplier of one skill from the `cdMult` riders of the active statuses (`ursoc_form`: Yarma / Paralama x0.5). */
export function cdMultFor(p: StatusIdsView, skillId: string): number {
  let m = 1;
  for (const id of p.ids()) {
    const r = STATUS_RULES[id]?.cdMult;
    if (r && r.skills.includes(skillId)) m *= r.mult;
  }
  return m;
}

/** A cleave rider that is up on the caster (`sweeping` 2 / 0.6, `meat_cleaver` 3 / 0.6): the largest extra-target count wins. */
export interface CleaveRider { status: StatusId; extraTargets: number; extraMult: number }

export function cleaveRidersOf(p: StatusIdsView): CleaveRider[] {
  const out: CleaveRider[] = [];
  for (const id of p.ids()) {
    const r = STATUS_RULES[id];
    if (r?.extraTargets && r.extraTargets > 0) out.push({ status: id, extraTargets: r.extraTargets, extraMult: r.extraMult ?? 1 });
  }
  return out.sort((a, b) => b.extraTargets - a.extraTargets);
}

