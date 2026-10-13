import { NATION_IDS, NATIONS, type NationId } from '../data/nations';
import { SIEGE, SIEGE_FORT, siegeStartOf, siegeWeekOf, type SiegeHolderRec } from '../data/siege';
import type { PvpDeny } from './PvpRules';

/**
 * KALE KUŞATMASI rules (WP-14). PURE: no G, no three.js, no clocks of its own. The schedule, the banner capture, the hostility rule and
 * the local benefits are functions of their arguments, so the host, the clients and dev/combat-sim/siege.mjs get the same answers.
 * The runtime (systems/Siege.ts) feeds them. Trust model: the host computes the banner; clients trust the host's `sgend` broadcast
 * and record it locally (not provable without a server).
 */

// ---------------------------------------------------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------------------------------------------------

export interface SiegeOcc {
  week: number;
  start: number;
  end: number;
}

const occOf = (w: number): SiegeOcc => {
  const start = siegeStartOf(w);
  return { week: w, start, end: start + SIEGE.DUR_SEC * 1000 };
};

/** The window running at `nowMs` (start <= now < end), or null. */
export function siegeAt(nowMs: number): SiegeOcc | null {
  const occ = occOf(siegeWeekOf(nowMs));
  return nowMs >= occ.start && nowMs < occ.end ? occ : null;
}

/** The next window that starts after `nowMs` (a running window is not "next"). */
export function nextSiege(nowMs: number): SiegeOcc {
  const occ = occOf(siegeWeekOf(nowMs));
  return occ.start > nowMs ? occ : occOf(occ.week + 1);
}

export type SiegePhase = 'soon' | 'start' | 'end';

export interface SiegeCrossing {
  phase: SiegePhase;
  /** Moment (epoch ms) the phase is due. */
  when: number;
  /** Payload `at`: the window start for soon / start, the end for end. */
  at: number;
  /** Seconds before the start (soon only). */
  lead?: number;
  week: number;
}

/** Every siege phase due in (fromMs, toMs], ascending. Pure: the calendar calls it with its last tick and the current time. */
export function siegeCrossings(fromMs: number, toMs: number): SiegeCrossing[] {
  const out: SiegeCrossing[] = [];
  for (let w = siegeWeekOf(fromMs) - 1; w <= siegeWeekOf(toMs) + 1; w++) {
    const occ = occOf(w);
    const cands: SiegeCrossing[] = SIEGE.LEADS_SEC.map((lead) => ({ phase: 'soon' as const, when: occ.start - lead * 1000, at: occ.start, lead, week: w }));
    cands.push({ phase: 'start', when: occ.start, at: occ.start, week: w }, { phase: 'end', when: occ.end, at: occ.end, week: w });
    for (const c of cands) if (c.when > fromMs && c.when <= toMs) out.push(c);
  }
  return out.sort((a, b) => a.when - b.when);
}

/** Turkey wall clock (UTC+3, no DST) as "DD.MM HH:MM". */
export function trClock(ms: number): string {
  const d = new Date(ms + 3 * 3600 * 1000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Chat lines of `/kusatma`: the schedule, the next or running window, and the current banner holder. */
export function siegeLines(nowMs: number, holder: SiegeHolderRec | null | undefined): string[] {
  const out = [`Kale Kuşatması: her Cumartesi 20:00 (${SIEGE.DUR_SEC / 60} dk), ${SIEGE_FORT.name}.`];
  const run = siegeAt(nowMs);
  if (run) {
    out.push(`Kuşatma şu an sürüyor. Kalan ${Math.max(1, Math.ceil((run.end - nowMs) / 60000))} dk.`);
  } else {
    const nx = nextSiege(nowMs);
    const mins = Math.max(0, Math.round((nx.start - nowMs) / 60000));
    out.push(`Sonraki kuşatma: ${trClock(nx.start)} (${mins} dk sonra).`);
  }
  out.push(holder
    ? `Bayrak sahibi: ${holder.name}${holder.nation ? ` (${NATIONS[holder.nation].name})` : ''}.`
    : 'Bayrak sahibi: henüz yok.');
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Hostility
// ---------------------------------------------------------------------------------------------------------------------

export interface SiegeHitCtx {
  /** The window is running (the host and each client check it on their own clock). */
  open: boolean;
  aIn: boolean;
  vIn: boolean;
  aId: number;
  vId: number;
  aDead: boolean;
  vDead: boolean;
  /** Guild ids (null / '' = no guild). */
  aGid: string | null | undefined;
  vGid: string | null | undefined;
}

/**
 * May attacker hurt victim inside the fortress? Only while the window runs, only inside the arena, only between DIFFERENT guilds.
 * Same guild: never. Someone without a guild: never (the rule needs both guild ids). Null = allowed.
 */
export function siegeDeny(c: SiegeHitCtx): PvpDeny {
  if (!c.open || !c.aIn || !c.vIn) return 'zone';
  if (c.aId === c.vId) return 'self';
  if (!c.aGid || !c.vGid) return 'unknown';
  if (c.aGid === c.vGid) return 'guild';
  if (c.aDead || c.vDead) return 'dead';
  return null;
}

const dist2d = (x: number, z: number, cx: number, cz: number): number => Math.hypot(x - cx, z - cz);

/** Inside the fortress arena (PvP allowed during the window). */
export const inArena = (x: number, z: number): boolean => dist2d(x, z, SIEGE_FORT.center[0], SIEGE_FORT.center[1]) <= SIEGE.ARENA_R;
/** Inside the banner's capture circle. */
export const inBanner = (x: number, z: number): boolean => dist2d(x, z, SIEGE_FORT.center[0], SIEGE_FORT.center[1]) <= SIEGE.BANNER_R;

// ---------------------------------------------------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------------------------------------------------

export type BannerHolder = SiegeHolderRec;

export interface BannerPresence {
  id: number;
  gid: string;
  gname: string;
  nation: NationId | null;
  x: number;
  z: number;
}

export type BannerEvent = { type: 'flip'; to: BannerHolder; from: BannerHolder | null };

export interface BannerWire {
  h: BannerHolder | null;
  /** Challenger guild id ('' = none). */
  c: string;
  /** Challenger progress (s). */
  p: number;
}

/** Majority nation of a list (ties and empty lists: null, so no Zafer is granted on a tie). */
export function nationVote(list: readonly (NationId | null | undefined)[]): NationId | null {
  const n: Record<NationId, number> = { gok_kartal: 0, kizil_kurt: 0 };
  for (const x of list) if (x && x in n) n[x]++;
  const [a, b] = NATION_IDS;
  if (n[a] === n[b]) return null;
  return n[a] > n[b] ? a : b;
}

/**
 * The banner. Host-stepped. One guild alone in the capture circle fills the progress for HOLD_SEC and takes the banner. Two or more
 * guilds inside: the banner is contested and the progress freezes. The holder's guild alone: a challenger's progress runs back.
 * Nobody inside: the progress runs back. The holder keeps the banner until another guild takes it.
 */
export class BannerField {
  holder: BannerHolder | null = null;
  cap: BannerHolder | null = null;
  prog = 0;

  reset(): void {
    this.holder = null;
    this.cap = null;
    this.prog = 0;
  }

  step(dt: number, who: readonly BannerPresence[]): BannerEvent[] {
    const out: BannerEvent[] = [];
    if (!(dt > 0)) return out;
    const inside = who.filter((p) => inBanner(p.x, p.z));
    const gids = new Set(inside.map((p) => p.gid));
    if (gids.size > 1) return out; // contested: frozen
    if (gids.size === 0 || (this.holder && gids.has(this.holder.gid))) {
      if (this.prog > 0) {
        this.prog = Math.max(0, this.prog - dt * SIEGE.DECAY);
        if (this.prog === 0) this.cap = null;
      }
      return out;
    }
    const gid = [...gids][0];
    const members = inside.filter((p) => p.gid === gid);
    if (!this.cap || this.cap.gid !== gid) {
      this.cap = { gid, name: members[0].gname, nation: null };
      this.prog = 0;
    }
    this.cap.name = members[0].gname;
    this.cap.nation = nationVote(members.map((p) => p.nation));
    this.prog += dt;
    if (this.prog >= SIEGE.HOLD_SEC) {
      const from = this.holder;
      this.holder = { gid, name: this.cap.name, nation: this.cap.nation };
      this.cap = null;
      this.prog = 0;
      out.push({ type: 'flip', to: this.holder, from });
    }
    return out;
  }

  toWire(): BannerWire {
    return { h: this.holder ? { ...this.holder } : null, c: this.cap?.gid ?? '', p: Math.round(this.prog * 10) / 10 };
  }

  /** Copies a published state (clients). Wrong shapes are ignored; the progress is clamped. */
  applyWire(w: BannerWire): void {
    this.holder = w.h && typeof w.h.gid === 'string' ? { ...w.h } : null;
    this.cap = w.c ? { gid: w.c, name: '', nation: null } : null;
    this.prog = Math.max(0, Math.min(SIEGE.HOLD_SEC, Number(w.p) || 0));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Local benefits (saved on the character: `siege`)
// ---------------------------------------------------------------------------------------------------------------------

/** Pazar tax multiplier for a seller: members of the holding guild pay (1 - TAX_CUT) of the tax. */
export function siegeTaxMult(holder: { gid: string } | null | undefined, myGid: string | null | undefined): number {
  return holder && myGid && holder.gid === myGid ? 1 - SIEGE.TAX_CUT : 1;
}

/** Cosmetic weapon glow flag: the viewer's guild holds the banner. */
export const siegeGlow = (holder: { gid: string } | null | undefined, myGid: string | null | undefined): boolean =>
  !!holder && !!myGid && holder.gid === myGid;

/** XP multiplier while the winning nation's Zafer buff runs (1.05 for 1 hour). */
export function siegeXpMult(zaferUntil: number | null | undefined, nowMs: number = Date.now()): number {
  return zaferUntil && nowMs < zaferUntil ? 1 + SIEGE.ZAFER_XP_PCT / 100 : 1;
}

