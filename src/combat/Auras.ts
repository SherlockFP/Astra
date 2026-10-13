/**
 * NC46 Auras (GDD_CLASSES_V2 §1.10). `G.auras` holds the LOCAL player's active aura: a selection, not a bar slot.
 *   arm(p, def)       a skill with `SkillDef.aura` (radius, cycle, interval) starts the aura; the status is the saved choice
 *                     (`flags['paladin.aura']`, default the first status of the cycle).
 *   select(p, status) the skill-panel radio chips: pick one status of the cycle (or null = off); saved in the character flags.
 *   cycle(p)          a slotted cycle skill advances in combat: cycle[0] -> cycle[1] -> ... -> off -> cycle[0].
 *   update(dt)        every `interval` s the status is re-applied to every party member (self included) within the radius, with
 *                     duration `interval + 1.5`, through the existing party channel (local statuses / net `pstatus`). Dead
 *                     paladins do not pulse; the armed aura survives deaths and scene changes (the record lives on G.auras).
 * `aura:changed {playerId, status|null}` is emitted on every change of the active status.
 * Pure helpers (nextAuraInCycle, auraRadius, auraDuration) are exported for the combat sim. Aura StatusDefs (aura_devotion,
 * aura_might, aura_clarity) are owned by NC21 (data/statuses*.ts); `statuses.apply` ignores an id without a StatusDef.
 */
import { G } from '../game/G';
import { softStat } from './Combat';
import type { Player } from '../entities/Player';
import type { SkillDef, StatusId } from '../types/skills';

/** Flag key of the saved aura choice (character save flags). */
export const AURA_FLAG = 'paladin.aura';
/** Status of a freshly armed aura whose saved choice is missing or outside the cycle (GDD §1.10: default aura_devotion). */
export const AURA_DEFAULT: StatusId = 'aura_devotion';
/** Extra seconds an aura pulse lasts beyond its re-apply interval (1 s + 1.5 s). */
export const AURA_GRACE = 1.5;

export interface AuraActive {
  skillId: string;
  status: StatusId;
  radius: number;
  interval: number;
}

/**
 * Next status of an aura cycle: null (off) -> cycle[0] -> ... -> last -> null. An unknown current status restarts at cycle[0].
 * An empty cycle is always off.
 */
export function nextAuraInCycle(cycle: readonly StatusId[], current: StatusId | null): StatusId | null {
  if (cycle.length === 0) return null;
  if (current === null) return cycle[0];
  const i = cycle.indexOf(current);
  if (i < 0) return cycle[0];
  return i + 1 < cycle.length ? cycle[i + 1] : null;
}

/** Aura radius in metres: the base times `1 + auraRadiusPct` (notables add to `auraRadiusPct` through softStat). */
export function auraRadius(base: number, bonusPct: number): number {
  return base * (1 + Math.max(0, bonusPct));
}

/** Duration of one pulse: the re-apply interval plus the grace (GDD §1.10). */
export function auraDuration(interval: number): number {
  return interval + AURA_GRACE;
}

export class Auras {
  /** The armed aura (its skill, radius, cycle and interval). Null when no aura skill is armed. */
  private armed: { skillId: string; cycle: StatusId[]; radius: number; interval: number } | null = null;
  /** The status currently applied (null = off). */
  private status: StatusId | null = null;
  /** Seconds until the next pulse. 0 right after a change, so the first pulse is immediate. */
  private timer = 0;

  /** The active aura as the GDD states it (`{skillId, status, radius, interval}`), or null when off / not armed. */
  get active(): AuraActive | null {
    if (!this.armed || this.status === null) return null;
    return { skillId: this.armed.skillId, status: this.status, radius: this.armed.radius, interval: this.armed.interval };
  }

  /**
   * Arms the aura of a skill with `SkillDef.aura`. Re-arming the same skill only refreshes radius / interval / cycle and keeps the
   * current status. The first arm takes the saved choice when it is in the cycle, else cycle[0]. Returns false when the def has no aura.
   */
  arm(p: Player, def: SkillDef): boolean {
    const a = def.aura;
    if (!a) return false;
    const same = this.armed?.skillId === def.id;
    this.armed = { skillId: def.id, cycle: [...a.cycle], radius: a.radius, interval: Math.max(0.1, a.interval) };
    if (!same) {
      const saved = savedChoice();
      this.setStatus(p, saved && a.cycle.includes(saved) ? saved : (a.cycle.includes(AURA_DEFAULT) ? AURA_DEFAULT : a.cycle[0] ?? null));
    }
    return true;
  }

  /** Disarms: the aura stops and the status goes off (the saved choice is kept for the next arm). */
  disarm(p: Player): void {
    this.armed = null;
    this.setStatus(p, null);
  }

  /** Skill-panel selection: `status` must be in the armed cycle, or null for off. Saved in the character flags. False when refused. */
  select(p: Player, status: StatusId | null): boolean {
    if (!this.armed) return false;
    if (status !== null && !this.armed.cycle.includes(status)) return false;
    if (status !== null) saveChoice(status);
    this.setStatus(p, status);
    return true;
  }

  /** In-combat cycle of a slotted cycle skill: advances to the next status of the armed cycle (off after the last). */
  cycle(p: Player): StatusId | null {
    if (!this.armed) return null;
    const next = nextAuraInCycle(this.armed.cycle, this.status);
    this.setStatus(p, next);
    return next;
  }

  /** Per frame (Game.ts combat service): re-applies the active aura every interval to the local party. */
  update(dt: number): void {
    const w = G.world;
    const p = w?.localPlayer;
    if (!this.armed || this.status === null || !p) { this.timer = 0; return; }
    this.timer -= dt;
    if (this.timer > 0) return;
    // the carry keeps the cadence exact across frames; a dead paladin's clock still runs but nothing is applied
    this.timer += this.armed.interval;
    if (p.isDead) return;
    this.pulse(p);
  }

  /** Applies the active status to every party member (self included) within the aura radius. Returns the number reached. */
  pulse(p: Player): number {
    const w = G.world;
    const a = this.active;
    if (!w || !a) return 0;
    const r = auraRadius(a.radius, softStat(p, 'auraRadiusPct'));
    const dur = auraDuration(a.interval);
    let n = 0;
    for (const m of w.players) {
      if (m.isDead) continue;
      if (Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z) > r + m.radius) continue;
      n++;
      if (m.isLocal) {
        m.statuses.apply(a.status, dur, { sourceId: p.id });
        continue;
      }
      // remote party member: the same `pstatus` message applyPartyAt sends
      const peer = G.net?.peerOfEntity(m.id);
      if (peer) G.net.sendTo(peer, 'pstatus', { targetId: m.id, status: a.status, duration: dur, magnitude: 0, sourceId: p.id });
    }
    return n;
  }

  private setStatus(p: Player, status: StatusId | null): void {
    if (this.status === status) return;
    this.status = status;
    this.timer = 0;
    G.events.emit('aura:changed', { playerId: p.id, status });
  }
}

/** The saved aura choice (character flags), or null. */
function savedChoice(): StatusId | null {
  const v = G.character?.save?.flags?.[AURA_FLAG];
  return typeof v === 'string' ? (v as StatusId) : null;
}

function saveChoice(status: StatusId): void {
  const save = G.character?.save;
  if (!save) return;
  save.flags ??= {};
  save.flags[AURA_FLAG] = status;
}
