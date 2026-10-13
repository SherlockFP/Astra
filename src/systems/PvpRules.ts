import { nationsOpposed, type NationId } from '../data/nations';
import { CAPTURE_POINTS, PVP_MIN_LEVEL, PVP_ZONE_ID, baseAt, nationIdx, type CapturePointDef } from '../data/pvpZone';

/**
 * KIZIL SINIR RULES (WP-07). PURE: no G, no three.js, no clocks of its own. Everything here is a function of its arguments, so the
 * host, the clients and the node sim (dev/combat-sim/pvp.mjs) get the same answers. The runtime (systems/Pvp.ts) feeds it.
 */

export const PVP = {
  /** Fraction of the attacker's roll that reaches a player (60 % damage reduction against players: CC / burst sanity). */
  DAMAGE_MULT: 0.4,
  /** CC applied by a player lasts at most this long (s) and is halved first. */
  CC_MAX_SEC: 3,
  CC_DURATION_MULT: 0.5,
  /** A dead player is released at his own base after this many seconds. */
  RESPAWN_SEC: 10,
  /** A capture point flips after this many seconds of uncontested presence. */
  CAPTURE_HOLD_SEC: 30,
  /** Capture progress runs back this much faster than it builds when the capturers leave / the owner stands on the point. */
  CAPTURE_DECAY: 1,
  CAPTURE_WIPE: 2,
  /** Nation score: kill, flip, and per owned point every SCORE_TICK_SEC. */
  SCORE_KILL: 1,
  SCORE_FLIP: 10,
  SCORE_TICK: 1,
  SCORE_TICK_SEC: 10,
  /** Honour (Onur). */
  HONOUR_BASE: 10,
  HONOUR_FLIP: 25,
  HONOUR_STREAK_MAX: 20,
  /** Anti-farm: the same victim by the same killer inside this window pays 100 % / 50 % / 25 % / 0 %. */
  FARM_WINDOW_SEC: 600,
  FARM_MULT: [1, 0.5, 0.25, 0] as readonly number[],
  /** A hit counts for kill credit (and assists) for this long (s). */
  CREDIT_SEC: 10,
  /** Host-side cap of one PvP hit before the victim's reduction: max(FLOOR, MULT x monsterHP(attacker level)). */
  HIT_CAP_FLOOR: 6000,
  HIT_CAP_MULT: 12,
  /** Per-attacker PvP token bucket (host): burst and refill per second. */
  BUCKET_CAP: 10,
  BUCKET_REFILL: 6,
} as const;

/** Result of the hit rules: null = allowed, otherwise a short machine reason. */
export type PvpDeny = 'zone' | 'nation' | 'dead' | 'safe' | 'self' | 'level' | 'unknown' | null;

export interface PvpHitCtx {
  zoneId: string | null | undefined;
  aNation: NationId | null | undefined;
  vNation: NationId | null | undefined;
  aId: number;
  vId: number;
  aDead: boolean;
  vDead: boolean;
  aPos: { x: number; z: number };
  vPos: { x: number; z: number };
  aLevel: number;
  vLevel: number;
}

/**
 * May attacker hurt victim? Only inside Kızıl Sınır, only across nations, never while either stands in a base safe box, never
 * the dead, and only between characters of the zone's level gate (an under-levelled arrival is neither a target nor a threat).
 */
export function pvpDeny(c: PvpHitCtx): PvpDeny {
  if (c.zoneId !== PVP_ZONE_ID) return 'zone';
  if (c.aId === c.vId) return 'self';
  if (!c.aNation || !c.vNation) return 'unknown';
  if (!nationsOpposed(c.aNation, c.vNation)) return 'nation';
  if (c.aDead || c.vDead) return 'dead';
  if (c.aLevel < PVP_MIN_LEVEL || c.vLevel < PVP_MIN_LEVEL) return 'level';
  if (baseAt(c.aPos.x, c.aPos.z) || baseAt(c.vPos.x, c.vPos.z)) return 'safe';
  return null;
}

/** Hit cap (before the victim's reduction) for an attacker of `level`; `monsterHP` is passed in so the module stays dependency-free. */
export const pvpHitCap = (level: number, monsterHP: (l: number) => number): number =>
  Math.max(PVP.HIT_CAP_FLOOR, PVP.HIT_CAP_MULT * monsterHP(Math.max(1, Math.min(60, level || 1))));

/** Duration (s) of a CC a player applied to a player: halved, capped. */
export const pvpCcDuration = (sec: number): number => Math.min(PVP.CC_MAX_SEC, Math.max(0, sec) * PVP.CC_DURATION_MULT);

/** Statuses a player hit may put on another player. Everything else (buffs, taunt, internal locks) is dropped by the victim. */
export const PVP_STATUSES: ReadonlySet<string> = new Set(['stun', 'slow', 'root', 'freeze', 'knockdown', 'silence', 'fear', 'blind', 'chill', 'shock', 'burn', 'bleed', 'poison']);

// ---------------------------------------------------------------------------------------------------------------------
// Skill shapes against players
// ---------------------------------------------------------------------------------------------------------------------

/** The part of a SkillDef the shape test reads. */
export interface PvpShapeDef {
  targeting: string;
  range?: number;
  radius?: number;
  arc?: number;
  count?: number;
  tags: readonly string[];
}

export interface PvpShapeCtx {
  caster: { x: number; z: number };
  /** Normalised horizontal facing of the cast. */
  dir: readonly [number, number];
  /** Ground point of the cast (ground_aoe / leap), clamped to range by the skill system. */
  point: readonly [number, number];
}

/**
 * Does a skill that fired with `ctx` reach a player standing at `t` (radius `t.radius`)? Players are not enemies, so the skill
 * system's own target queries never see them: this is the PvP stand-in. One test per skill shape:
 *   melee_arc / target_instant / unknown melee   cone in front of the caster (range + arc)
 *   self_aoe                                     circle around the caster
 *   ground_aoe / leap                            circle around the cast point
 *   projectile / target_projectile / beam / dash line along the facing (a projectile is treated as a hitscan: first contact is not
 *                                                modelled, every victim on the line is hit, one hit per victim per cast)
 */
export function pvpShapeHit(def: PvpShapeDef, ctx: PvpShapeCtx, t: { x: number; z: number; radius: number }): boolean {
  const dx = t.x - ctx.caster.x, dz = t.z - ctx.caster.z;
  const dist = Math.hypot(dx, dz);
  const tags = def.tags;
  const r = def.radius ?? 0;
  const circle = (cx: number, cz: number, rad: number): boolean => Math.hypot(t.x - cx, t.z - cz) <= rad + t.radius;
  const cone = (range: number, arc: number): boolean => {
    if (dist - t.radius > range) return false;
    if (dist < 0.01) return true;
    const cos = (dx * ctx.dir[0] + dz * ctx.dir[1]) / dist;
    return cos >= Math.cos(((arc / 2) * Math.PI) / 180) || dist - t.radius < 0.8;
  };
  const line = (len: number, width: number): boolean => {
    const along = dx * ctx.dir[0] + dz * ctx.dir[1];
    if (along < -t.radius || along > len + t.radius) return false;
    const perp = Math.abs(dx * ctx.dir[1] - dz * ctx.dir[0]);
    return perp <= width + t.radius;
  };
  switch (def.targeting) {
    case 'melee_arc': return cone(def.range ?? 2.6, def.arc ?? 120);
    case 'target_instant': return cone(def.range ?? 3.5, def.arc ?? 90);
    case 'self_aoe': return circle(ctx.caster.x, ctx.caster.z, r || def.range || 5);
    case 'ground_aoe':
    case 'leap': return circle(ctx.point[0], ctx.point[1], r || 4);
    case 'projectile':
    case 'target_projectile':
    case 'beam':
    case 'dash': return line(def.range ?? 24, Math.max(0.8, r) + ((def.count ?? 1) > 1 ? 1.5 : 0));
    default:
      if (tags.includes('projectile')) return line(def.range ?? 24, Math.max(0.8, r));
      if (tags.includes('aoe') && r > 0) return circle(ctx.caster.x, ctx.caster.z, r);
      return cone(def.range ?? 3, def.arc ?? 120);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Capture points
// ---------------------------------------------------------------------------------------------------------------------

/** One capture point. owner / side: -1 none, 0 Gök Kartal, 1 Kızıl Kurt. `prog` = seconds `side` has held it (0..CAPTURE_HOLD_SEC). */
export interface CapState { owner: number; side: number; prog: number }

export interface CapPresence { id: number; n: 0 | 1; x: number; z: number }

export type CapEvent = { type: 'flip'; point: number; to: 0 | 1; from: number; by: number[] };

/**
 * The three capture points. `step` is deterministic: the same state, dt sequence and presence lists give the same states and events.
 * Only the host steps it; clients copy the state it publishes (pcap).
 */
export class CaptureField {
  readonly pts: CapState[];
  /** Nation scores [Gök Kartal, Kızıl Kurt]. */
  readonly score: [number, number] = [0, 0];
  private tick = 0;

  constructor(readonly defs: readonly CapturePointDef[] = CAPTURE_POINTS) {
    this.pts = defs.map(() => ({ owner: -1, side: -1, prog: 0 }));
  }

  /** Alive players of each nation inside the point's radius. */
  static counts(def: CapturePointDef, who: readonly CapPresence[]): { c: [number, number]; ids: [number[], number[]] } {
    const ids: [number[], number[]] = [[], []];
    for (const p of who) if (Math.hypot(p.x - def.x, p.z - def.z) <= def.r) ids[p.n].push(p.id);
    return { c: [ids[0].length, ids[1].length], ids };
  }

  step(dt: number, who: readonly CapPresence[]): CapEvent[] {
    const out: CapEvent[] = [];
    if (!(dt > 0)) return out;
    for (let i = 0; i < this.pts.length; i++) {
      const st = this.pts[i];
      const { c, ids } = CaptureField.counts(this.defs[i], who);
      if (c[0] > 0 && c[1] > 0) continue; // contested: frozen
      if (c[0] === 0 && c[1] === 0) {
        if (st.prog > 0) {
          st.prog = Math.max(0, st.prog - dt * PVP.CAPTURE_DECAY);
          if (st.prog === 0) st.side = -1;
        }
        continue;
      }
      const n = c[0] > 0 ? 0 : 1;
      if (st.owner === n) {
        // the owner stands on its own point: an attempt against it is wiped quickly
        if (st.prog > 0) {
          st.prog = Math.max(0, st.prog - dt * PVP.CAPTURE_WIPE);
          if (st.prog === 0) st.side = -1;
        }
        continue;
      }
      if (st.side !== -1 && st.side !== n) {
        // the other nation's progress is undone first
        st.prog -= dt * PVP.CAPTURE_WIPE;
        if (st.prog <= 0) { st.prog = 0; st.side = n; }
        continue;
      }
      st.side = n;
      st.prog += dt;
      if (st.prog >= PVP.CAPTURE_HOLD_SEC) {
        const from = st.owner;
        st.owner = n;
        st.prog = 0;
        st.side = -1;
        this.score[n] += PVP.SCORE_FLIP;
        out.push({ type: 'flip', point: i, to: n as 0 | 1, from, by: ids[n].slice() });
      }
    }
    this.tick += dt;
    while (this.tick >= PVP.SCORE_TICK_SEC) {
      this.tick -= PVP.SCORE_TICK_SEC;
      for (const st of this.pts) if (st.owner === 0 || st.owner === 1) this.score[st.owner] += PVP.SCORE_TICK;
    }
    return out;
  }

  /** Wire form: [owner, side, progress seconds] per point (progress rounded to 0.1 s). */
  toWire(): [number, number, number][] {
    return this.pts.map((s) => [s.owner, s.side, Math.round(s.prog * 10) / 10]);
  }

  /** Copies a published state (clients). Out-of-range values are clamped, wrong lengths ignored. */
  applyWire(p: unknown, sc?: unknown): void {
    if (Array.isArray(p) && p.length === this.pts.length) {
      for (let i = 0; i < p.length; i++) {
        const w = p[i];
        if (!Array.isArray(w)) continue;
        const o = Number(w[0]), s = Number(w[1]), g = Number(w[2]);
        this.pts[i].owner = o === 0 || o === 1 ? o : -1;
        this.pts[i].side = s === 0 || s === 1 ? s : -1;
        this.pts[i].prog = Number.isFinite(g) ? Math.max(0, Math.min(PVP.CAPTURE_HOLD_SEC, g)) : 0;
      }
    }
    if (Array.isArray(sc) && sc.length === 2) {
      this.score[0] = Math.max(0, Math.round(Number(sc[0]) || 0));
      this.score[1] = Math.max(0, Math.round(Number(sc[1]) || 0));
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Honour, anti-farm, kill streaks, scoreboard
// ---------------------------------------------------------------------------------------------------------------------

/** Honour for one kill before the anti-farm multiplier: 10 base, +-2 per level of difference (max 5), + 2 per streak the victim had (max 20). */
export function honourBase(killerLevel: number, victimLevel: number, victimStreak: number): number {
  const d = Math.max(-5, Math.min(5, Math.round(victimLevel - killerLevel)));
  return Math.max(1, PVP.HONOUR_BASE + d * 2) + Math.min(PVP.HONOUR_STREAK_MAX, Math.max(0, victimStreak) * 2);
}

/** Streak banner text for a kill streak (null below 3). */
export function streakTitle(s: number): string | null {
  if (s >= 20) return 'DESTANSI KATLİAM';
  if (s >= 15) return 'DURDURULAMAZ';
  if (s >= 10) return 'KAN BANYOSU';
  if (s >= 7) return 'KATLİAM';
  if (s >= 5) return 'ÖLÜM MAKİNESİ';
  if (s >= 3) return 'SERİ KATİL';
  return null;
}

/** Same killer / same victim inside FARM_WINDOW_SEC. `note` returns how many such kills came before this one. */
export class AntiFarm {
  private readonly m = new Map<string, { n: number; t: number }>();

  note(killer: number, victim: number, now: number): number {
    const k = `${killer}>${victim}`;
    const e = this.m.get(k);
    const before = e && now - e.t <= PVP.FARM_WINDOW_SEC ? e.n : 0;
    this.m.set(k, { n: before + 1, t: now });
    if (this.m.size > 512) {
      for (const [key, v] of this.m) if (now - v.t > PVP.FARM_WINDOW_SEC) this.m.delete(key);
    }
    return before;
  }

  mult(before: number): number {
    return PVP.FARM_MULT[Math.min(before, PVP.FARM_MULT.length - 1)];
  }
}

export interface BoardRow {
  id: number;
  name: string;
  /** 0 Gök Kartal, 1 Kızıl Kurt. */
  n: 0 | 1;
  level: number;
  kills: number;
  deaths: number;
  honour: number;
  streak: number;
}

export interface KillAward {
  honour: number;
  streak: number;
  /** Victim's streak that this kill ended (shutdown). */
  ended: number;
  /** Times the killer had already killed this victim inside the window. */
  repeat: number;
}

/** Host-side scoreboard: kills / deaths / honour per player entity plus the nation kill score. Pure bookkeeping. */
export class PvpBoard {
  readonly rows = new Map<number, BoardRow>();
  /** Kill score per nation (the capture field adds its own flip / tick score). */
  readonly kills: [number, number] = [0, 0];
  readonly farm = new AntiFarm();

  join(id: number, name: string, n: 0 | 1, level: number): BoardRow {
    let r = this.rows.get(id);
    if (!r) {
      r = { id, name, n, level, kills: 0, deaths: 0, honour: 0, streak: 0 };
      this.rows.set(id, r);
    } else {
      r.name = name;
      r.n = n;
      r.level = level;
    }
    return r;
  }

  leave(id: number): void {
    this.rows.delete(id);
  }

  /** Credit a kill. Both players must have joined. Returns null for an unknown or same-nation pair. */
  kill(killerId: number, victimId: number, now: number): KillAward | null {
    const k = this.rows.get(killerId), v = this.rows.get(victimId);
    if (!k || !v || k.n === v.n) return null;
    const repeat = this.farm.note(killerId, victimId, now);
    const honour = Math.round(honourBase(k.level, v.level, v.streak) * this.farm.mult(repeat));
    const ended = v.streak;
    v.deaths++;
    v.streak = 0;
    k.kills++;
    k.streak++;
    k.honour += honour;
    this.kills[k.n]++;
    return { honour, streak: k.streak, ended, repeat };
  }

  /** Honour paid outside kills (capture help). */
  pay(id: number, honour: number): void {
    const r = this.rows.get(id);
    if (r) r.honour += honour;
  }

  /** Rows sorted by honour, then kills (scoreboard order). */
  sorted(): BoardRow[] {
    return [...this.rows.values()].sort((a, b) => b.honour - a.honour || b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
  }

  toWire(): [number, string, number, number, number, number][] {
    return this.sorted().slice(0, 16).map((r) => [r.id, r.name, r.n, r.kills, r.deaths, r.honour]);
  }
}

/** Index helper for callers that hold NationId. */
export const idxOf = nationIdx;
