/**
 * Healing pipeline and ally targeting (GDD_V2 §0.5 formula, §1.6 smart heals). OWNER: combat (WP5).
 * Heals travel through G.combat.healPlayer (local apply or the 'heal' channel). Threat from heals is produced by the
 * enemy director (WP4) from the 'heal' event.
 */
import { G } from '../game/G';
import { STATUSES } from '../data/statuses';
import { specOf } from './specs';
import type { Player } from '../entities/Player';
import type { Actor } from '../entities/Actor';
import type { AimInfo, StatusId } from '../types/skills';
import type { EntityId } from '../types/common';
import type { StatId } from '../types/stats';

/** Heal range of the caster's targeting (GDD §1.6 ally reach). */
export const HEAL_RANGE = 30;

const MAIN_STAT: Record<string, StatId> = { knight: 'str', barbarian: 'str', paladin: 'str', rogue: 'dex', mage: 'int' };

/** Friendly target selected with U / F1..F5 (null = self / smart pick). */
let friendly: EntityId | null = null;

/** Live friendly target id, or null when that player is gone. */
export function friendlyTargetId(): EntityId | null {
  if (friendly == null) return null;
  const w = G.world;
  const p = w?.get<Player>(friendly);
  if (!p || p.kind !== 'player' || p.isDead) { friendly = null; return null; }
  return friendly;
}

export function setFriendlyTarget(id: EntityId | null): void {
  friendly = id;
}

/** Party order used by F1..F5: the local player first, then the others by entity id. */
export function partyOrder(self: Player): Player[] {
  const list = (G.world?.players ?? []).filter((p) => p.kind === 'player');
  const others = list.filter((p) => p !== self).sort((a, b) => a.id - b.id);
  return [self, ...others];
}

const hpFrac = (p: Player): number => p.hp / Math.max(1, p.maxHp);

/** U: cycle friendly targets, lowest HP% first (wraps around; the list includes self). */
export function cycleFriendly(self: Player): Player {
  const sorted = partyOrder(self).filter((p) => !p.isDead).sort((a, b) => hpFrac(a) - hpFrac(b) || a.id - b.id);
  if (!sorted.length) return self;
  const cur = friendlyTargetId();
  const idx = sorted.findIndex((p) => p.id === cur);
  const next = sorted[(idx + 1) % sorted.length];
  friendly = next.id;
  return next;
}

/** F1..F5: select the party member in slot n (F1 = self). Returns the selected player or null. */
export function selectPartySlot(self: Player, slot: number): Player | null {
  const p = partyOrder(self)[Math.max(0, slot - 1)];
  if (!p || p.isDead) return null;
  friendly = p.id;
  return p;
}

/** Living players within `range` metres of `from` (self included). */
export function alliesInRange(from: Actor, range: number): Player[] {
  const out: Player[] = [];
  for (const p of G.world?.players ?? []) {
    if (p.isDead) continue;
    if (Math.hypot(p.position.x - from.position.x, p.position.z - from.position.z) <= range + p.radius) out.push(p);
  }
  return out;
}

/**
 * Smart heal resolver (GDD §1.6, Settings.healTargeting). Order for `smart`: aimed ally (Alt frame, passed in
 * aim.allyId) > friendly selection (U / F1..F5) > crosshair ally > lowest HP% in range > self.
 * `frames`: aimed ally > friendly > self. `crosshair`: crosshair ally > self.
 * `injuredOnly` skips full-HP allies (params.smartPriority = 'injured'); the result may then be null.
 */
export function resolveHealTarget(caster: Player, aim: AimInfo | null, injuredOnly = false): Player | null {
  const mode = G.settings?.data.healTargeting ?? 'smart';
  const w = G.world;
  const inRange = (p: Player | null | undefined): p is Player =>
    !!p && !p.isDead && Math.hypot(p.position.x - caster.position.x, p.position.z - caster.position.z) <= HEAL_RANGE + p.radius;
  const ok = (p: Player | null | undefined): p is Player => inRange(p) && (!injuredOnly || p.hp < p.maxHp);
  const byId = (id: EntityId | null | undefined): Player | null => (id == null ? null : (w?.get<Player>(id) ?? null));
  const crosshair = aim?.targetId != null ? byId(aim.targetId) : null;
  const crosshairAlly = crosshair && crosshair.kind === 'player' ? crosshair : null;
  if (mode === 'crosshair') {
    if (ok(crosshairAlly)) return crosshairAlly;
    return injuredOnly ? null : caster;
  }
  const aimed = aim?.allyId != null ? byId(aim.allyId) : null;
  if (ok(aimed)) return aimed;
  const sel = byId(friendlyTargetId());
  if (ok(sel)) return sel;
  if (mode === 'frames') return injuredOnly ? null : caster;
  if (ok(crosshairAlly)) return crosshairAlly;
  let best: Player | null = null;
  for (const p of alliesInRange(caster, HEAL_RANGE)) {
    if (!ok(p)) continue;
    if (!best || hpFrac(p) < hpFrac(best)) best = p;
  }
  return best ?? (injuredOnly ? null : caster);
}

/**
 * Heal formula (GDD_V2 §0.5): randWeapon * coef * (1 + mainStat/100) * (1 + healingPct) * crit. The target's
 * healReceived / healMult are applied by Combat.healPlayer. Returns the raw amount and whether it crit.
 */
export function healFormula(caster: Player, coef: number, flat = 0): { amount: number; crit: boolean } {
  const lo = caster.getStat('weaponMin'), hi = caster.getStat('weaponMax');
  const weapon = (lo > 0 || hi > 0 ? lo + Math.random() * Math.max(0, hi - lo) : 10 + caster.level * 2);
  // PM-PA: a spec may override the class main stat (Kutsal heals with int, SpecDef.mainStat)
  const main = caster.getStat(specOf(caster)?.mainStat ?? MAIN_STAT[caster.classId] ?? 'str');
  const crit = Math.random() < clampCrit(caster.getStat('critChance'));
  const critMult = crit ? 1.5 + Math.max(0, caster.getStat('critDamage')) : 1;
  const amount = (weapon * coef + flat) * (1 + main / 100) * (1 + caster.getStat('healingPct')) * critMult;
  return { amount: Math.max(0, amount), crit };
}

const clampCrit = (c: number): number => Math.max(0, Math.min(0.95, c));

/**
 * Heal one ally (or self) with the formula above and report the overheal. Returns the overheal (the part above max HP,
 * 0 when none); callers turn it into absorbs (Taşan Şifa) where a spec asks for it.
 */
export function healAlly(caster: Player, target: Player, coef: number, opts: { flat?: number; quiet?: boolean } = {}): number {
  const { amount } = healFormula(caster, coef, opts.flat ?? 0);
  return healAmount(caster, target, amount, opts.quiet ?? true);
}

/** Heals a precomputed amount (HoT ticks, flat effects). Returns the overheal amount. */
export function healAmount(caster: Player, target: Player, amount: number, quiet = true): number {
  if (!target || target.isDead || amount <= 0 || !G.combat) return 0;
  const missing = Math.max(0, target.maxHp - target.hp);
  G.combat.healPlayer(caster, target, amount, { quiet });
  return Math.max(0, amount - missing);
}

/**
 * Adds an absorb (the `shield` status is what Actor.statuses.absorb reads). `cap` is the total ceiling. `label` is an
 * optional named status for the HUD (carries the absorbed amount as magnitude, no effect of its own).
 */
export function addAbsorb(target: Actor, amount: number, cap: number, dur: number, label?: StatusId, sourceId?: EntityId | null): void {
  if (amount <= 0) return;
  const cur = target.statuses.get('shield')?.magnitude ?? 0;
  const next = Math.min(Math.max(cap, cur), cur + amount);
  target.statuses.apply('shield', dur, { magnitude: next, sourceId: sourceId ?? null });
  if (label) target.statuses.apply(label, dur, { magnitude: amount, sourceId: sourceId ?? null });
}

/** Removes up to `n` dispellable debuffs from `target` (Arındır / Panzehir rules). Returns the count removed. */
export function dispelUpTo(target: Actor, n: number, only?: StatusId[]): number {
  let k = 0;
  for (const s of target.statuses.list()) {
    if (k >= n) break;
    const def = STATUSES[s.id];
    if (!def || def.kind !== 'debuff' || !def.dispellable) continue;
    if (only && !only.includes(s.id)) continue;
    if (target.statuses.dispel(s.id)) k++;
  }
  return k;
}
