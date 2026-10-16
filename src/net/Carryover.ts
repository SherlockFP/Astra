/**
 * HOST-LOSS CARRY-OVER (public channels). Pure data, no three.js, no G: NetSession feeds it, the world runtime (CampDirector) reads it,
 * dev/combat-sim/hostloss.mjs tests it headless. OWNER: net module.
 *
 * Why: the authoritative world (enemy HP, positions, which camp members are dead) lives in the host's process. When the host leaves,
 * the successor re-seeds the zone from the deterministic data, which used to put every enemy back at full HP and revive the dead
 * members of half-cleared camps - a fight in progress was simply lost. Every MEMBER already holds replicas of the enemies near its
 * player (the host's 15 Hz snapshot), so each member keeps a small rolling record of them here. After a migration each member hands
 * its record to the new host (`ccarry` ctl messages), the host merges them (the freshest record of an enemy wins) and the re-seeded
 * world rebuilds those enemies from the record instead of from scratch: same ids, same HP fraction, same place, dead stays dead.
 *
 * Records are keyed by the enemy's entity id. Ids of camp members are deterministic (the same on every peer), host-dynamic ids
 * (rares, events) are restored under their old id so the replicas of the other members line up again.
 */
import { ident } from './messages';

/** One enemy as a member last saw it. */
export interface CarryRec {
  id: number;
  defId: string;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  level: number;
  packId: string | null;
  tag: string;
  dead: boolean;
  aggro: boolean;
  openWorld: boolean;
  stealth: boolean;
  dormant: boolean;
  /** Seconds since the record last changed (when dead: roughly how long ago it died). Wire / API value; the store keeps a clock. */
  age: number;
}

export const CARRY = {
  /** Records kept per peer (nearest enemies first are sent when more). */
  MAX: 400,
  /** Records per `ccarry` message (the transport frame is 16 KB; one tuple is ~130 bytes). */
  CHUNK: 60,
  /** Dead records are forgotten after this long (longer than any camp respawn the ledger covers). */
  DEAD_TTL_S: 3600,
  /** Live records that were not refreshed for this long are stale (the enemy is out of range, or gone). */
  ALIVE_TTL_S: 600,
} as const;

const ID_RE = /^[A-Za-z0-9_.:-]{1,48}$/;
const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Wire tuple: [id, defId, x, z, yaw, hp, maxHp, level, packId, flags, tag, age]; flags 1 dead, 2 aggro, 4 openWorld, 8 stealth, 16 dormant. */
export type CarryWire = [number, string, number, number, number, number, number, number, string, number, string, number];

interface Held {
  rec: CarryRec;
  /** Store clock (ms) when the record last changed. */
  at: number;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

export class CarryStore {
  private readonly m = new Map<number, Held>();

  get size(): number {
    return this.m.size;
  }

  has(id: number): boolean {
    return this.m.has(id);
  }

  /** The record of `id` with its age at `nowMs`, or null. */
  get(id: number, nowMs: number): CarryRec | null {
    const h = this.m.get(id);
    return h ? { ...h.rec, age: Math.max(0, (nowMs - h.at) / 1000) } : null;
  }

  /** Every record, ages relative to `nowMs`. */
  all(nowMs: number): CarryRec[] {
    const out: CarryRec[] = [];
    for (const h of this.m.values()) out.push({ ...h.rec, age: Math.max(0, (nowMs - h.at) / 1000) });
    return out;
  }

  /**
   * A member's own observation. A record that is already dead stays dead (its `at` is the moment of death and is not refreshed), a
   * living one refreshes its clock on every sighting.
   */
  note(r: Omit<CarryRec, 'age'>, nowMs: number): void {
    const prev = this.m.get(r.id);
    if (prev && prev.rec.dead && r.dead) return;
    if (!prev && this.m.size >= CARRY.MAX) this.prune(nowMs, true);
    if (!prev && this.m.size >= CARRY.MAX) return;
    this.m.set(r.id, { rec: { ...r, age: 0 }, at: nowMs });
  }

  /** The enemy is gone without dying (camp deactivated, escaped): nothing to restore. Dead records are kept (the camp is still wiped). */
  forgetAlive(id: number): void {
    const h = this.m.get(id);
    if (h && !h.rec.dead) this.m.delete(id);
  }

  delete(id: number): void {
    this.m.delete(id);
  }

  /** Removes and returns a record (the world used it). */
  take(id: number, nowMs: number): CarryRec | null {
    const r = this.get(id, nowMs);
    this.m.delete(id);
    return r;
  }

  prune(nowMs: number, force = false): void {
    for (const [id, h] of this.m) {
      const age = (nowMs - h.at) / 1000;
      if (age > (h.rec.dead ? CARRY.DEAD_TTL_S : CARRY.ALIVE_TTL_S)) this.m.delete(id);
    }
    if (force && this.m.size >= CARRY.MAX) {
      // still full: drop the oldest live records first
      const live = [...this.m].filter(([, h]) => !h.rec.dead).sort((a, b) => a[1].at - b[1].at);
      for (const [id] of live.slice(0, Math.max(8, Math.floor(CARRY.MAX / 10)))) this.m.delete(id);
    }
  }

  /** Wire form, `CHUNK` records per message (always at least one, possibly empty, so the receiver sees an end marker). */
  encode(nowMs: number): CarryWire[][] {
    this.prune(nowMs);
    const rows: CarryWire[] = [];
    for (const h of this.m.values()) {
      const r = h.rec;
      rows.push([
        r.id, r.defId, r2(r.x), r2(r.z), r2(r.yaw), Math.round(r.hp), Math.round(r.maxHp), r.level, r.packId ?? '',
        (r.dead ? 1 : 0) | (r.aggro ? 2 : 0) | (r.openWorld ? 4 : 0) | (r.stealth ? 8 : 0) | (r.dormant ? 16 : 0), r.tag, Math.round(Math.max(0, (nowMs - h.at) / 1000)),
      ]);
    }
    const chunks: CarryWire[][] = [];
    for (let i = 0; i < rows.length; i += CARRY.CHUNK) chunks.push(rows.slice(i, i + CARRY.CHUNK));
    if (!chunks.length) chunks.push([]);
    return chunks;
  }

  /** Merge a list from a peer (untrusted): per enemy the FRESHEST record wins, a death beats any living record of the same age or older. */
  merge(list: unknown, nowMs: number): number {
    if (!Array.isArray(list)) return 0;
    let n = 0;
    for (const row of list.slice(0, CARRY.CHUNK)) {
      const r = parseWire(row);
      if (!r) continue;
      const at = nowMs - r.age * 1000;
      const cur = this.m.get(r.id);
      if (cur) {
        const newer = at > cur.at;
        const deathWins = r.dead && !cur.rec.dead && at >= cur.at - 2000;
        if (!newer && !deathWins) continue;
        if (cur.rec.dead && !r.dead && !newer) continue;
      }
      if (!cur && this.m.size >= CARRY.MAX) continue;
      this.m.set(r.id, { rec: r, at });
      n++;
    }
    return n;
  }

  clear(): void {
    this.m.clear();
  }
}

/** A validated record from one wire tuple, or null. */
export function parseWire(row: unknown): CarryRec | null {
  if (!Array.isArray(row) || row.length < 12) return null;
  const id = row[0];
  const def = row[1];
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 1e9) return null;
  if (typeof def !== 'string' || !ID_RE.test(def)) return null;
  if (typeof row[2] !== 'number' || typeof row[3] !== 'number' || !Number.isFinite(row[2]) || !Number.isFinite(row[3])) return null;
  const flags = num(row[9], 0, 255, 0) | 0;
  const pack = typeof row[8] === 'string' && row[8] ? ident(row[8], 48) : '';
  const maxHp = num(row[6], 1, 1e12, 1);
  return {
    id, defId: def, x: num(row[2], -3000, 3000, 0), z: num(row[3], -3000, 3000, 0), yaw: num(row[4], -100, 100, 0),
    hp: num(row[5], 0, maxHp, maxHp), maxHp, level: Math.round(num(row[7], 1, 200, 1)), packId: pack || null,
    tag: typeof row[10] === 'string' ? ident(row[10], 24) : '', dead: (flags & 1) !== 0, aggro: (flags & 2) !== 0, openWorld: (flags & 4) !== 0,
    stealth: (flags & 8) !== 0, dormant: (flags & 16) !== 0, age: num(row[11], 0, CARRY.DEAD_TTL_S, 0),
  };
}

/** The part of an Enemy the carry-over reads (a structural type so the sims can pass plain objects). */
export interface CarrySource {
  id: number;
  kind?: string;
  removed?: boolean;
  authority?: boolean;
  isDead: boolean;
  hp: number;
  maxHp: number;
  level: number;
  yaw: number;
  position: { x: number; z: number };
  def: { id: string };
  packId?: string | null;
  tag?: string;
  ownerId?: number | null;
  aggroed?: boolean;
  openWorld?: boolean;
  packStealth?: boolean;
  dormant?: boolean;
}

/** Record of one enemy replica; null for bodies the carry-over does not cover (own simulation, summons, bad numbers). */
export function recOf(e: CarrySource): Omit<CarryRec, 'age'> | null {
  if (e.kind !== undefined && e.kind !== 'enemy') return null;
  if (e.authority || e.removed) return null;
  if (e.ownerId !== undefined && e.ownerId !== null) return null; // adds are re-summoned by their owner
  if (!Number.isFinite(e.position.x) || !Number.isFinite(e.position.z) || !Number.isFinite(e.hp) || !(e.maxHp > 0)) return null;
  return {
    id: e.id, defId: e.def.id, x: e.position.x, z: e.position.z, yaw: Number.isFinite(e.yaw) ? e.yaw : 0, hp: Math.max(0, e.hp), maxHp: e.maxHp, level: e.level,
    packId: e.packId ?? null, tag: e.tag ?? '', dead: e.isDead, aggro: !!e.aggroed, openWorld: !!e.openWorld, stealth: !!e.packStealth, dormant: !!e.dormant,
  };
}
