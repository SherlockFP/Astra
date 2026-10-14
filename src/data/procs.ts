/**
 * COMBAT_WOW §2.7 / §4.3 CW-03 / Appendix B. OWNER: combat (proc data).
 *
 * Two data tables plus a set of pure glow rules:
 *  - `PROC_DEFS`: one ProcDef per proc state (the Spell Activation Overlay + button glow). The base rows are the
 *    Appendix B rows for the existing mage procs and the new knight / barbarian / rogue procs. Kit packages
 *    (docs/kits/*.md, e.g. `data/procs_kit_<class>.ts`) add their rows with `registerProcDefs()`.
 *  - `GLOW_RULES`: conditional glow (WoW "usable" glow) as pure predicates over a small `GlowState`.
 *  - `activeProcs(p)` / `glowSkillsOf(p, state)`: read-only helpers. Nothing here mutates player state.
 *
 * Glow entries are skill ids, or `@tag` tokens (for example `@lmb`, the bar's LMB slot) that the HUD resolves.
 * Skill ids that do not exist yet are listed in `PENDING_GLOW_SKILLS` (the self-check `tools/smoke/procs_data.mjs`
 * requires every glow id to be in SKILLS or in that set).
 */
import type { StatusId } from '../types/skills';
// KIT PK-0 (docs/kits/casters-rogue.md §h): empty kit tables (proc rows, glow rules) merged below.
import { PROC_DEFS_KIT_MAGE, GLOW_RULES_KIT_MAGE } from './procs_kit_mage';
import { PROC_DEFS_KIT_ROGUE, GLOW_RULES_KIT_ROGUE } from './procs_kit_rogue';
import { PROC_DEFS_KIT_WARLOCK, GLOW_RULES_KIT_WARLOCK } from './procs_kit_warlock';
// KIT PM-BA (docs/kits/plate-melee.md §3b / §4b): barbarian proc rows (gore, gory_maul, gory_iron, meat_cleaver, carnage, ursoc_form).
import { PROC_DEFS_KIT_BARBARIAN } from './procs_kit_barbarian';
// KIT PM-KN (docs/kits/plate-melee.md §1b / §2b): knight proc rows (sudden_death, battlelord, revenge_ready, sweeping); the legacy knight rows above are removed.
import { PROC_DEFS_KIT_KNIGHT } from './procs_kit_knight';
// KIT PM-PA (docs/kits/plate-melee.md §5b-§7b): paladin proc rows (shining_light, infusion_of_light, art_of_war, hammer_window).
import { PROC_DEFS_KIT_PALADIN } from './procs_kit_paladin';
// KIT PM-NE (docs/kits/plate-melee.md §8b / §9b): necromancer proc rows (sudden_doom, army, ...) and the Ölüm Darbesi glow rule.
import { PROC_DEFS_KIT_NECROMANCER, GLOW_RULES_KIT_NECROMANCER } from './procs_kit_necromancer';
// AE-3 / AE-4 (docs/kits/agile-evoker.md): İblis Avcısı and Ejderhasoy proc rows and glow rules.
import { PROC_DEFS_KIT_DEMONHUNTER, GLOW_RULES_KIT_DEMONHUNTER } from './procs_kit_demonhunter';
import { PROC_DEFS_KIT_EVOKER, GLOW_RULES_KIT_EVOKER } from './procs_kit_evoker';
// KIT ŞAMAN (Fırtına Bekçisi, Rüzgar Silahı, Lav Dalgası): proc rows.
import { PROC_DEFS_KIT_SHAMAN } from './procs_kit_shaman';

export type ProcOverlay = 'top' | 'left' | 'right' | 'center' | 'both';

export interface ProcDef {
  /** Unique row id (usually the status id). */
  id: string;
  /** Status applied to the player while the proc is up. */
  status: StatusId;
  /** Turkish display name. */
  name: string;
  /** Overlay colour school (fire, frost, arcane, holy, physical, bleed, shadow, ...). Kits may add schools. */
  school: string;
  /** Overlay position. `both` = left and right. */
  overlay: ProcOverlay;
  /** Overlay position per stack count (Buz Parmağı: left at 1 charge, both at 2). Falls back to `overlay`. */
  overlayByStacks?: Partial<Record<number, ProcOverlay>>;
  /** Action ids that glow while the proc is up: skill ids or `@tag` tokens. */
  glow: string[];
  /** Nominal duration in seconds (same as the StatusDef.defaultDuration; the applying code may override it). */
  durationHint: number;
  sfxGain?: string;
  sfxUse?: string;
  vfxGain?: string;
  vfxUse?: string;
  /** 3 = button-transform procs, 2 = free-cast procs, 1 = window buffs. Higher wins when overlays are capped. */
  priority: number;
}

/** Default sfx / vfx ids (docs/kits/agile-evoker.md §0 proc defaults). Applied by `proc()` below. */
const PROC_FX_DEFAULTS = {
  sfxGain: 'proc_gain',
  sfxUse: 'proc_use',
  vfxGain: 'proc_burst',
  vfxUse: 'proc_consume',
} as const;

/** COMBAT_WOW `maxOverlays`: at most this many Spell Activation Overlays are drawn at once. */
export const PROC_MAX_OVERLAYS = 3;

function proc(row: Omit<ProcDef, 'sfxGain' | 'sfxUse' | 'vfxGain' | 'vfxUse'> & Partial<Pick<ProcDef, 'sfxGain' | 'sfxUse' | 'vfxGain' | 'vfxUse'>>): ProcDef {
  return { ...PROC_FX_DEFAULTS, ...row };
}

/** Appendix B rows. Mage rows are the existing hot_streak / fingers_of_frost plus the CW-13 mage states. */
const BASE_PROC_DEFS: ProcDef[] = [
  proc({ id: 'heating_up', status: 'heating_up', name: 'Isınıyor', school: 'fire', overlay: 'left',
    glow: ['mage_fire_blast'], durationHint: 10, priority: 1 }),
  proc({ id: 'hot_streak', status: 'hot_streak', name: 'Sıcak Seri', school: 'fire', overlay: 'top',
    glow: ['mage_pyroblast', 'mage_flamestrike'], durationHint: 8, priority: 2 }),
  proc({ id: 'fingers_of_frost', status: 'fingers_of_frost', name: 'Buz Parmağı', school: 'frost', overlay: 'left',
    overlayByStacks: { 2: 'both' }, glow: ['mage_ice_lance'], durationHint: 15, priority: 2 }),
  proc({ id: 'brain_freeze', status: 'brain_freeze', name: 'Beyin Donması', school: 'frost', overlay: 'top',
    glow: ['mage_flurry'], durationHint: 12, priority: 2 }),
  proc({ id: 'clearcasting', status: 'clearcasting', name: 'Berrak Zihin', school: 'arcane', overlay: 'center',
    glow: ['mage_arcane_missiles', 'mage_arcane_barrage'], durationHint: 15, priority: 2 }),
  proc({ id: 'wrath_return', status: 'wrath_return', name: 'Misilleme', school: 'bleed', overlay: 'left',
    glow: ['barbarian_cleave'], durationHint: 6, priority: 2 }),
  proc({ id: 'opportunity', status: 'opportunity', name: 'Fırsat', school: 'shadow', overlay: 'right',
    glow: ['rogue_crossbow_shot'], durationHint: 10, priority: 2 }),
];

/**
 * Glow ids that do not exist in SKILLS yet (planned mage / kit skills). Each is listed so the glow still
 * resolves once the skill lands; the self-check requires every glow id to be in SKILLS or here.
 */
export const PENDING_GLOW_SKILLS: ReadonlySet<string> = new Set<string>([
  'mage_flame_wave',
]);

/** Live registry. Extended only through `registerProcDefs()`. */
export const PROC_DEFS: ProcDef[] = [...BASE_PROC_DEFS];

/**
 * Extension point for kit packages (docs/kits/*.md `data/procs_kit_<class>.ts`). Throws on a duplicate id so two
 * kit merges can never silently overwrite each other's rows. Missing sfx/vfx fields get the defaults.
 */
export function registerProcDefs(rows: readonly ProcDef[]): void {
  for (const row of rows) {
    if (PROC_DEFS.some((d) => d.id === row.id)) throw new Error(`registerProcDefs: duplicate ProcDef id "${row.id}"`);
    PROC_DEFS.push({ ...PROC_FX_DEFAULTS, ...row });
  }
}

export function getProcDef(id: string): ProcDef | undefined {
  return PROC_DEFS.find((d) => d.id === id);
}

// KIT PK-0: one merge line per kit file (rows are empty until PK-MAGE / PK-ROGUE / PK-WARLOCK fill them).
registerProcDefs([...PROC_DEFS_KIT_MAGE, ...PROC_DEFS_KIT_ROGUE, ...PROC_DEFS_KIT_WARLOCK, ...PROC_DEFS_KIT_KNIGHT, ...PROC_DEFS_KIT_BARBARIAN, ...PROC_DEFS_KIT_PALADIN, ...PROC_DEFS_KIT_NECROMANCER, ...PROC_DEFS_KIT_DEMONHUNTER, ...PROC_DEFS_KIT_EVOKER, ...PROC_DEFS_KIT_SHAMAN]);

/** Overlay position for a proc at a given stack count (falls back to the row's `overlay`). */
export function procOverlayFor(def: ProcDef, stacks: number): ProcOverlay {
  return def.overlayByStacks?.[stacks] ?? def.overlay;
}

// ------------------------------------------------------------------------------------------------------------
// Glow rules (COMBAT_WOW §3 state rows and Appendix B "rule" rows). Pure: they read only the GlowState fields.
// ------------------------------------------------------------------------------------------------------------

/**
 * Snapshot of what the glow rules need. The caller (combat / HUD) fills it from the player and target; the rules
 * never reach into the world. Booleans and counts are the already-resolved state (for example `stealthed` is true
 * when the player has stealth, ambush or dancer).
 */
export interface GlowState {
  /** Primary resource as a fraction 0..1 (rage / energy / mana). */
  resourcePct: number;
  /** Best spender of the bar (its skill id), or null when the bar has none. Used by `resource90`. */
  bestSpender: string | null;
  /** Adalet pips (knight). */
  pips: number;
  /** Kombo points (rogue). */
  combo: number;
  /** Gizem Yükü charges (arcane). */
  arcane: number;
  /** Target HP as a fraction 0..1, or null when there is no target. */
  targetHpPct: number | null;
  /** Player is stealthed (stealth / ambush / dancer). */
  stealthed: boolean;
  /** Player holds the riposte window (status `riposte`). */
  riposteOpen: boolean;
  /** Target has its guard broken (status `guard_broken`). */
  targetGuardBroken: boolean;
  /** Enemies within 12 m with at least 5 bleed stacks. */
  bleedingEnemies: number;
  // ---- KIT PK-0 fields (optional: glowSkillsOf fills aoeMode / execWindow from the statuses, the rest from setGlowExtras)
  /** Ruh Parçası shards (display units: fragments / PipDef.scale). */
  shards?: number;
  /** The player is behind the hard target (angle > 110 deg, CORE_MECHANICS §10.2), or in behind_grace. */
  behind?: boolean;
  /** Gölge Dansı is off cooldown. */
  danceReady?: boolean;
  /** `aoe_mode` watcher (data/watchers.ts): at least 3 enemies within 10 m of the target. */
  aoeMode?: boolean;
  /** `exec_window` watcher (data/watchers.ts): the target is below 20 % HP. */
  execWindow?: boolean;
  /** Refresh window per DoT status on the target: true when less than 30 % of its duration is left. */
  dotRefresh?: Partial<Record<string, boolean>>;
}

/** The non-status glow inputs SkillSystem supplies for the local player (see setGlowExtras). */
export interface GlowExtras {
  shards: number;
  behind: boolean;
  danceReady: boolean;
  dotRefresh: Partial<Record<string, boolean>>;
}

let glowExtrasSource: (() => GlowExtras) | null = null;

/** SkillSystem registers the local player's extra glow inputs here (null clears them). */
export function setGlowExtras(fn: (() => GlowExtras) | null): void {
  glowExtrasSource = fn;
}

export type GlowRuleId =
  | 'resource90' | 'pips5' | 'execute35' | 'stealthOpener' | 'combo5' | 'arcane4'
  | 'riposteOpen' | 'breakFinisher' | 'bloodbath3'
  // KIT PK-0: kit packages add their rule ids (GLOW_RULES_KIT_*), so any string is accepted.
  | (string & {});

export interface GlowRule {
  id: GlowRuleId;
  /** True when the rule's glow is active for this state. */
  test: (s: GlowState) => boolean;
  /** Glow ids while the rule is true (skill ids or `@tag`). */
  skills: (s: GlowState) => readonly string[];
}

export const GLOW_RULES: Record<GlowRuleId, GlowRule> = {
  resource90: {
    id: 'resource90',
    test: (s) => s.resourcePct >= 0.9 && s.bestSpender !== null,
    skills: (s) => (s.bestSpender ? [s.bestSpender] : []),
  },
  pips5: { id: 'pips5', test: (s) => s.pips >= 5, skills: () => ['knight_templar_verdict'] },
  execute35: {
    id: 'execute35',
    test: (s) => s.targetHpPct !== null && s.targetHpPct < 0.35,
    skills: () => ['barbarian_execute'],
  },
  stealthOpener: { id: 'stealthOpener', test: (s) => s.stealthed, skills: () => ['rogue_backstab'] },
  combo5: { id: 'combo5', test: (s) => s.combo >= 5, skills: () => ['rogue_eviscerate'] },
  arcane4: { id: 'arcane4', test: (s) => s.arcane >= 4, skills: () => ['mage_arcane_barrage'] },
  riposteOpen: { id: 'riposteOpen', test: (s) => s.riposteOpen, skills: () => ['@lmb'] },
  breakFinisher: { id: 'breakFinisher', test: (s) => s.targetGuardBroken, skills: () => ['@lmb'] },
  bloodbath3: { id: 'bloodbath3', test: (s) => s.bleedingEnemies >= 3, skills: () => ['barbarian_bloodbath'] },
};
// KIT PK-0: kit glow rules (empty until the class packages fill them).
Object.assign(GLOW_RULES, GLOW_RULES_KIT_MAGE, GLOW_RULES_KIT_ROGUE, GLOW_RULES_KIT_WARLOCK, GLOW_RULES_KIT_NECROMANCER, GLOW_RULES_KIT_DEMONHUNTER, GLOW_RULES_KIT_EVOKER);

// ------------------------------------------------------------------------------------------------------------
// Read-only helpers
// ------------------------------------------------------------------------------------------------------------

/** The part of StatusEffects this module reads (structurally satisfied by `Actor.statuses`). */
export interface ProcStatusView {
  has(id: StatusId): boolean;
  stacks(id: StatusId): number;
}

/** ProcDefs whose status is currently active on the player, highest priority first. */
export function activeProcs(p: ProcStatusView): ProcDef[] {
  return PROC_DEFS.filter((d) => p.has(d.status)).sort((a, b) => b.priority - a.priority);
}

/** Union of the glow ids of the active procs and of every true glow rule. Tokens (`@lmb`) are returned as-is. */
export function glowSkillsOf(p: ProcStatusView, s: GlowState): Set<string> {
  const out = new Set<string>();
  for (const d of activeProcs(p)) for (const id of d.glow) out.add(id);
  // the watcher statuses are read from p here; the caller's state wins where it sets a field
  const full: GlowState = { aoeMode: p.has('aoe_mode'), execWindow: p.has('exec_window'), ...(glowExtrasSource?.() ?? {}), ...s };
  for (const rule of Object.values(GLOW_RULES)) {
    if (rule.test(full)) for (const id of rule.skills(full)) out.add(id);
  }
  return out;
}
