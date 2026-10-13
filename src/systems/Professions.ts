/**
 * GDD_LIFE §1 MVP: gathering skill (Madencilik, Bitki Toplama), personal node cooldowns and the six starter recipes.
 *
 * The pure functions work on a CharacterSave only, so the headless sim (dev/combat-sim/gather.mjs) can drive them.
 * `Professions` (G.professions) is the facade the world nodes and the panel call; it adds the loot to the bag and emits
 * `gather:done`, `profession:skillUp` (read by systems/Achievements.ts) and toasts.
 *
 * Saved data: `CharacterSave.professions[prof] = { skill, tier }` (skill never below 1, a profession is learned for free)
 * and the flag `gather.cd` = JSON map of node key -> epoch ms when that node is back (personal, like loot).
 */
import { G } from '../game/G';
import type { CharacterSave } from '../types/character';
import type { NodeTypeDef, ProfessionDef, ProfessionId, RecipeDef } from '../types/professions';
import { RNG, hashString } from '../core/utils';
import {
  COOLDOWN_CAP, PROFESSIONS, RECIPE_BY_ID, RICH_CHANCE, SKILL_MAX, nodeTypesFor, skillDiffColor, skillUpChance, tierOfSkill,
  type SkillColor,
} from '../data/professions';
import { MATERIALS } from '../data/materials';
import { toast } from './notify';

export const CD_FLAG = 'gather.cd';

/** Display name of a profession id (falls back to the id). */
export function profName(prof: ProfessionId): string {
  return (PROFESSIONS as Partial<Record<string, ProfessionDef>>)[prof]?.name ?? prof;
}

// ---------------------------------------------------------------------------------------------- skill (pure)

/** Skill of a profession: 1 when never used (learned for free), capped at SKILL_MAX. */
export function skillOf(save: CharacterSave | null | undefined, prof: ProfessionId): number {
  const v = save?.professions?.[prof]?.skill;
  return Number.isFinite(v) ? Math.min(SKILL_MAX, Math.max(1, Math.floor(v as number))) : 1;
}

export function setSkillOf(save: CharacterSave, prof: ProfessionId, skill: number): void {
  const s = Math.min(SKILL_MAX, Math.max(1, Math.floor(skill)));
  (save.professions ??= {})[prof] = { skill: s, tier: tierOfSkill(s) };
}

export interface Gate {
  ok: boolean;
  color: SkillColor;
  diff: number;
  /** Tooltip when locked, e.g. "Madencilik 75 gerekli". */
  reason?: string;
}

/** Can the character gather or craft something that needs `skillReq`? `color` is the WoW difficulty colour. */
export function gateOf(save: CharacterSave | null | undefined, prof: ProfessionId, skillReq: number): Gate {
  const diff = skillOf(save, prof) - skillReq;
  const color = skillDiffColor(diff);
  return diff >= 0 ? { ok: true, color, diff } : { ok: false, color, diff, reason: `${profName(prof)} ${skillReq} gerekli` };
}

/** One skill-up roll (WoW curve, see skillUpChance). False at the cap or for grey work. */
export function rollSkillUp(save: CharacterSave, prof: ProfessionId, diff: number, rng: RNG): boolean {
  if (skillOf(save, prof) >= SKILL_MAX) return false;
  const p = skillUpChance(diff);
  return p > 0 && rng.chance(p);
}

// ---------------------------------------------------------------------------------------------- cooldowns (pure)

export function readCooldowns(save: CharacterSave | null | undefined): Record<string, number> {
  const raw = save?.flags?.[CD_FLAG];
  if (typeof raw !== 'string') return {};
  try {
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== 'object') return {};
    return Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)) as [string, number][]);
  } catch {
    return {};
  }
}

/** Epoch ms when a node comes back (0 = available). */
export function cooldownUntil(save: CharacterSave | null | undefined, key: string): number {
  return readCooldowns(save)[key] ?? 0;
}

/** Stores a node's respawn time. Expired entries are pruned; at most COOLDOWN_CAP entries are kept (latest first). */
export function setCooldown(save: CharacterSave, key: string, untilMs: number, nowMs: number): void {
  const map = readCooldowns(save);
  for (const [k, v] of Object.entries(map)) if (v <= nowMs) delete map[k];
  map[key] = untilMs;
  const kept = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, COOLDOWN_CAP);
  (save.flags ??= {})[CD_FLAG] = JSON.stringify(Object.fromEntries(kept));
}

/** Respawn time of a node depleted at `nowMs`: base x U(0.9, 1.1), x1.5 for a rich vein. Deterministic per node and second. */
export function respawnAtMs(baseSec: number, key: string, nowMs: number, rich: boolean): number {
  const jitter = 0.9 + 0.2 * new RNG(`${key}:${Math.floor(nowMs / 1000)}`).next();
  return nowMs + baseSec * (rich ? 1.5 : 1) * jitter * 1000;
}

// ---------------------------------------------------------------------------------------------- placement (pure)

export interface GatherFieldLike {
  id: string;
  kind: 'ore' | 'herb';
  /** Centre in tile units (the tile centre of tile c is at c). */
  center: [number, number];
  /** Radius in tiles. */
  radius: number;
  count: number;
}

export interface PlannedNode {
  key: string;
  index: number;
  type: NodeTypeDef;
  /** Tile units (float). */
  x: number;
  z: number;
  rich: boolean;
}

/**
 * Deterministic plan of one gather field: positions, node types and rich veins depend only on the field id, the node index
 * and the map seed, so every party member sees the same nodes. The type comes from the field's tier.
 */
export function planField(field: GatherFieldLike, tier: number, seed: number): PlannedNode[] {
  const prof: ProfessionId = field.kind === 'ore' ? 'mine' : 'herb';
  const pool = nodeTypesFor(prof, tier);
  const types = pool.length ? pool : nodeTypesFor(prof, 1);
  const out: PlannedNode[] = [];
  for (let i = 0; i < field.count; i++) {
    const rng = new RNG(hashString(`${field.id}:${i}:${seed}`));
    const a = rng.range(0, Math.PI * 2);
    const r = field.radius * Math.sqrt(rng.next());
    const type = types[rng.int(0, types.length - 1)];
    out.push({
      key: `${field.id}#${i}`,
      index: i,
      type,
      x: field.center[0] + r * Math.cos(a),
      z: field.center[1] + r * Math.sin(a),
      rich: rng.chance(RICH_CHANCE),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- harvest (pure)

export interface Drop { id: string; count: number }

/** Yields of one harvest: each entry rolls its chance and count, +1 with the skill bonus, x2 for rich veins, Bol Hasat 2 % x2. */
export function rollYields(node: NodeTypeDef, skill: number, rng: RNG, rich: boolean): Drop[] {
  const bonus = Math.min(0.35, 0.002 * Math.min(100, Math.max(0, skill - node.skillReq)));
  const bol = rng.chance(0.02);
  const out: Drop[] = [];
  for (const y of node.yields) {
    if (y.chance !== undefined && !rng.chance(y.chance)) continue;
    let n = rng.int(y.min, y.max);
    if (rng.chance(bonus)) n += 1;
    if (rich) n *= 2;
    if (bol) n *= 2;
    if (n > 0) out.push({ id: y.id, count: n });
  }
  return out;
}

/** Rare procs: chance + 0.0003 per skill point, capped at 50 %. */
export function rollRares(node: NodeTypeDef, skill: number, rng: RNG): Drop[] {
  const out: Drop[] = [];
  for (const r of node.rare ?? []) {
    if (rng.chance(Math.min(0.5, r.chance + 0.0003 * skill))) out.push({ id: r.id, count: rng.int(r.min ?? 1, r.max ?? 1) });
  }
  return out;
}

export interface HarvestOutcome {
  ok: boolean;
  reason?: string;
  gained: Drop[];
  rares: Drop[];
  skillUp: boolean;
  /** Skill after the roll. */
  skill: number;
  /** Epoch ms the node is back (set when ok). */
  respawnAt?: number;
}

/**
 * One completed hold on a node: gate, cooldown, yields, skill-up and the cooldown write. Mutates the save only (no bag, no
 * events): the facade adds the items. A locked or cooling node changes nothing.
 */
export function applyHarvest(
  save: CharacterSave, node: NodeTypeDef, key: string, rng: RNG, rich: boolean, nowMs: number, baseRespawnSec: number,
): HarvestOutcome {
  const none = { gained: [], rares: [], skillUp: false, skill: skillOf(save, node.prof) };
  const gate = gateOf(save, node.prof, node.skillReq);
  if (!gate.ok) return { ok: false, reason: gate.reason, ...none };
  if (cooldownUntil(save, key) > nowMs) return { ok: false, reason: 'Bu damar henüz yenilenmedi.', ...none };
  const before = skillOf(save, node.prof);
  const gained = rollYields(node, before, rng, rich);
  const rares = rollRares(node, before, rng);
  const skillUp = rollSkillUp(save, node.prof, gate.diff, rng);
  if (skillUp) setSkillOf(save, node.prof, before + 1);
  const respawnAt = respawnAtMs(baseRespawnSec, key, nowMs, rich);
  setCooldown(save, key, respawnAt, nowMs);
  return { ok: true, gained, rares, skillUp, skill: skillOf(save, node.prof), respawnAt };
}

// ---------------------------------------------------------------------------------------------- crafting (pure)

/** Can the recipe be made with `owned` materials at this skill? */
export function craftCheck(save: CharacterSave | null | undefined, recipe: RecipeDef, owned: (id: string) => number): { ok: boolean; reason?: string } {
  const gate = gateOf(save, recipe.prof, recipe.skillReq);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  for (const i of recipe.inputs) {
    if (owned(i.id) < i.count) return { ok: false, reason: `${MATERIALS[i.id]?.name ?? i.id} ×${i.count} gerekli` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------- service

/** Gathering and crafting service (G.professions). Created by Game.ts. */
export class Professions {
  private readonly rng = new RNG(Math.floor(Math.random() * 0x7fffffff) + 1);

  /** Skill of the local character in a profession (1 when unused). */
  skill(prof: ProfessionId): number {
    return skillOf(G.character?.save, prof);
  }

  /** Gate of the local character for a node or recipe requirement. */
  gate(prof: ProfessionId, skillReq: number): Gate {
    return gateOf(G.character?.save, prof, skillReq);
  }

  /** Personal respawn time of a node (epoch ms, 0 = available). */
  cooldownUntil(key: string): number {
    return cooldownUntil(G.character?.save, key);
  }

  /** A completed hold: items to the bag, skill-up, personal cooldown, events and toasts. */
  harvest(node: NodeTypeDef, key: string, rich: boolean, entityId: number, baseRespawnSec: number): { ok: boolean; reason?: string; respawnAt?: number } {
    const ch = G.character;
    if (!ch) return { ok: false, reason: 'Karakter yok.' };
    const r = applyHarvest(ch.save, node, key, this.rng, rich, Date.now(), baseRespawnSec);
    if (!r.ok) return { ok: false, reason: r.reason };
    for (const d of [...r.gained, ...r.rares]) ch.addMaterial(d.id, d.count);
    ch.persist();
    const lines = r.gained.map((d) => `+${d.count} ${MATERIALS[d.id]?.name ?? d.id}`);
    if (lines.length) toast(`${node.name}: ${lines.join(', ')}`, 'loot');
    for (const d of r.rares) toast(`Nadir Bulgu: ${d.count > 1 ? d.count + ' ' : ''}${MATERIALS[d.id]?.name ?? d.id}!`, 'loot');
    G.events?.emit('gather:done', { id: entityId, ok: true });
    if (r.skillUp) this.announceSkill(node.prof, r.skill);
    return { ok: true, respawnAt: r.respawnAt };
  }

  /** Crafting: can the recipe be made now? */
  canCraft(id: string): { ok: boolean; reason?: string } {
    const ch = G.character;
    const recipe = RECIPE_BY_ID[id];
    if (!ch || !recipe) return { ok: false, reason: 'Tarif yok.' };
    return craftCheck(ch.save, recipe, (m) => ch.material(m));
  }

  /** Crafting: consumes the inputs, adds the output, rolls a skill-up (same colour curve as gathering). */
  craft(id: string): { ok: boolean; reason?: string } {
    const ch = G.character;
    const recipe = RECIPE_BY_ID[id];
    const check = this.canCraft(id);
    if (!ch || !recipe || !check.ok) return { ok: false, reason: check.reason };
    const out = recipe.output;
    if (!('id' in out)) return { ok: false, reason: 'Bu tarif henüz yok.' };
    const diff = skillOf(ch.save, recipe.prof) - recipe.skillReq;
    for (const i of recipe.inputs) ch.useMaterial(i.id, i.count);
    ch.addMaterial(out.id, out.count);
    const up = rollSkillUp(ch.save, recipe.prof, diff, this.rng);
    if (up) setSkillOf(ch.save, recipe.prof, skillOf(ch.save, recipe.prof) + 1);
    ch.persist();
    toast(`Üretildi: ${out.count > 1 ? out.count + ' ' : ''}${MATERIALS[out.id]?.name ?? out.id}`, 'success');
    if (up) this.announceSkill(recipe.prof, skillOf(ch.save, recipe.prof));
    return { ok: true };
  }

  private announceSkill(prof: ProfessionId, skill: number): void {
    toast(`${profName(prof)} becerin ${skill}'e yükseldi!`, 'success');
    G.events?.emit('profession:skillUp', { prof, skill });
  }
}
