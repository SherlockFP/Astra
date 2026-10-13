/**
 * Spec runtime helpers (GDD_V2 §1): spec lookup, passive folding, per-spec skill patches (SpecDef.mods), tank specials.
 * OWNER: combat (WP5). Data lives in data/specs.ts; the cast path calls `specPatched` in SkillSystem.tryCast.
 */
import { G } from '../game/G';
import { getSpec } from '../data/specs';
import type { SpecDef, SpecId, RoleId } from '../types/v2';
import type { SkillDef } from '../types/skills';
import type { StatBlock } from '../types/stats';
import type { Actor } from '../entities/Actor';
import type { Player } from '../entities/Player';

/** Spec of a player (undefined for enemies, for players without a spec, and for unknown ids). */
export function specOf(a: Actor | null | undefined): SpecDef | undefined {
  if (!a || a.kind !== 'player') return undefined;
  return getSpec((a as Player).spec ?? null);
}

export function specRole(a: Actor | null | undefined): RoleId | undefined {
  return specOf(a)?.role;
}

/** Parameters of a spec special (`SpecDef.specials[].params`), null when the spec does not own it. */
export function specSpecial(a: Actor | null | undefined, id: string): Record<string, number> | null {
  const s = specOf(a)?.specials?.find((x) => x.id === id);
  if (!s) return null;
  return s.params ?? {};
}

export const specHas = (a: Actor | null | undefined, id: string): boolean => specSpecial(a, id) !== null;

/** Adds a spec's passive stat block into `stats` (additive, the same rule as the other flat stat sources). */
export function foldSpecStats(stats: StatBlock, spec: SpecId | null | undefined): StatBlock {
  const s = getSpec(spec);
  if (!s) return stats;
  for (const [k, v] of Object.entries(s.stats)) {
    const key = k as keyof StatBlock;
    stats[key] = (stats[key] ?? 0) + (v ?? 0);
  }
  return stats;
}

// ----------------------------------------------------------------------------------------------------------------
// per-spec skill patches (SpecDef.mods): `patch` shallow-merges onto the SkillDef, `params` onto its params
// ----------------------------------------------------------------------------------------------------------------

const patchCache = new Map<string, SkillDef>();

/** The skill as seen by a player of its current spec (the original object when the spec does not change it). */
export function specPatched(a: Actor | null | undefined, def: SkillDef): SkillDef {
  const spec = specOf(a);
  if (!spec || !spec.mods.length) return def;
  const key = `${spec.id}|${def.id}`;
  const hit = patchCache.get(key);
  if (hit) return hit;
  let out: SkillDef = def;
  for (const m of spec.mods) {
    if (m.skill !== def.id) continue;
    out = { ...out, ...(m.patch ?? {}), params: { ...(out.params ?? {}), ...(m.params ?? {}) } } as SkillDef;
  }
  patchCache.set(key, out);
  return out;
}

/** Spec-bound skill (row with `spec`) of any class. */
export const isSpecSkill = (def: SkillDef | undefined): boolean => !!def?.spec;

/** Major cooldown skill: m45 / m90 / m180 slot (GDD_V2 §2). */
export const isMajorDef = (def: SkillDef | undefined): boolean =>
  !!def && (def.defaultSlot === 'm45' || def.defaultSlot === 'm90' || def.defaultSlot === 'm180');

/** Hero effect (3-minute party buff, `params.major === 180`): blocked by `sated`. */
export const isHeroDef = (def: SkillDef | undefined): boolean => !!def && def.params?.major === 180;

/** Skill ids a player may learn through the spec of the moment (for the skill book and the unlock list). */
export function specSkillIds(a: Actor | null | undefined): string[] {
  const s = specOf(a);
  return s ? [...s.skills] : [];
}

/** Block chance ceiling of the local guard (GDD_V2 §1.3.1: Koruyucu block cap 0.60, others 0.75). */
export function blockChanceCap(a: Actor | null | undefined): number {
  return specOf(a)?.id === 'knight_protector' ? 0.6 : 0.75;
}

// ----------------------------------------------------------------------------------------------------------------
// tank specials
// ----------------------------------------------------------------------------------------------------------------

let cheatReadyAt = -1e9;

/**
 * Koruyucu "Son Savunma" (GDD_V2 §1.3.1): a hit that would kill the protector leaves it at 15% max HP with 1.5 s of
 * invulnerability, once per 90 s. Returns true when it triggered (the caller then ignores the hit's damage).
 */
export function protectorCheat(p: Player, incoming: number): boolean {
  const cheat = specSpecial(p, 'protector_cheat');
  if (!cheat || incoming <= 0 || p.hp - incoming > 0) return false;
  const now = G.world?.time ?? 0;
  if (now < cheatReadyAt) return false;
  cheatReadyAt = now + (cheat.cooldown ?? 90);
  p.hp = Math.max(1, Math.round(p.maxHp * (cheat.hpLeft ?? 0.15)));
  p.statuses.apply('invulnerable', cheat.invul ?? 1.5, { sourceId: p.id });
  return true;
}

/** Seconds left on the protector cheat (for the HUD and the tests). */
export function protectorCheatLeft(): number {
  return Math.max(0, cheatReadyAt - (G.world?.time ?? 0));
}

/** Savaş Lordu "Öfke Zırhı": damage taken multiplier from the current rage (1 = no reduction). */
export function warlordRageMult(p: Player): number {
  const z = specSpecial(p, 'warlord_rage_armor');
  if (!z) return 1;
  const cap = z.max ?? 0.25;
  return 1 - Math.min(cap, (z.perPoint ?? 0.0025) * Math.max(0, p.resource));
}

/** Adalet / Karışım pip counters of a player (GDD_V2 §0.3: separate counters, like Kombo Puanı). */
export function pipsOf(p: Player): { adalet: number; karisim: number } {
  return { adalet: p.pips?.adalet ?? 0, karisim: p.pips?.karisim ?? 0 };
}

/** Role of the spec in tooltips and party frames (Tank / Şifacı / Hasarcı). */
export const ROLE_TR: Record<RoleId, string> = { tank: 'Tank', healer: 'Şifacı', dps: 'Hasarcı' };
