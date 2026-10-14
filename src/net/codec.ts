/**
 * Wire codecs for the two high-rate channels. NetSession applies them transparently (gameplay code and Replication
 * still see the typed object shapes of types/net.ts); the wire form is a positional JSON array, ~2.7x smaller than
 * the keyed objects. Relays (host forwarding a client's pstate) forward the encoded form untouched.
 * decode*() never throws: anything that is not the expected array form is returned as-is so the receiver's own
 * sanitising (Replication.cleanPState / cleanEnemy) decides what to do with it.
 */
import type { EnemySyncState } from '../entities/Enemy';
import type { PlayerSyncState } from '../entities/Player';
import type { NetChannel, NetChannels } from '../types/net';

type PState = NetChannels['pstate'];
type Snap = NetChannels['snap'];

/**
 * [x, y, z, yaw, vx, vz, anim, hp, maxHp, res, maxRes, flags, casting, level, statuses, shot, shotSeq, t, id]
 * flags: 1 dead, 2 dodging, 4 mounted (sprint1, append-only: older peers ignore the bit).
 */
function encodePState(p: PState): unknown[] {
  return [
    p.x, p.y, p.z, p.yaw, p.vx, p.vz, p.anim, p.hp, p.maxHp, p.res, p.maxRes,
    (p.dead ? 1 : 0) | (p.dodging ? 2 : 0) | (p.mounted ? 4 : 0),
    p.casting ?? null, p.level, p.statuses ?? [], p.shot ?? null, p.shotSeq ?? 0, p.t, p.id,
  ];
}

function decodePState(a: unknown): unknown {
  if (!Array.isArray(a) || a.length < 19) return a;
  const flags = typeof a[11] === 'number' ? a[11] : 0;
  const s: PlayerSyncState & { id: number; t: number } = {
    x: a[0], y: a[1], z: a[2], yaw: a[3], vx: a[4], vz: a[5], anim: a[6], hp: a[7], maxHp: a[8], res: a[9], maxRes: a[10],
    dead: (flags & 1) !== 0, dodging: (flags & 2) !== 0, mounted: (flags & 4) !== 0,
    casting: a[12], level: a[13], statuses: a[14], shot: a[15], shotSeq: a[16], t: a[17], id: a[18],
  };
  return s;
}

/**
 * [id, x, z, yaw, hp, maxHp, anim, targetId, cast, flags, shot, shotSeq, y?]
 * flags: 1 dead, 2 aggroed, 4 has aggroed, 8 has shot, 16 has y (ENGINE_VERTICALITY §15). Element 12 (y) is appended only when
 * the host set EnemySyncState.y, so a grounded enemy keeps the legacy 12-element tuple and old peers see no change.
 */
function encodeEnemy(e: EnemySyncState): unknown[] {
  const hasAggro = e.aggroed !== undefined;
  const hasShot = e.shot !== undefined || e.shotSeq !== undefined;
  const hasY = typeof e.y === 'number' && Number.isFinite(e.y);
  const flags = (e.dead ? 1 : 0) | (e.aggroed ? 2 : 0) | (hasAggro ? 4 : 0) | (hasShot ? 8 : 0) | (hasY ? 16 : 0);
  const out: unknown[] = [e.id, e.x, e.z, e.yaw, e.hp, e.maxHp, e.anim, e.targetId, e.cast, flags, e.shot ?? null, e.shotSeq ?? 0];
  if (hasY) out.push(e.y);
  return out;
}

function decodeEnemy(a: unknown): unknown {
  if (!Array.isArray(a) || a.length < 12) return a;
  const flags = typeof a[9] === 'number' ? a[9] : 0;
  const e: Record<string, unknown> = {
    id: a[0], x: a[1], z: a[2], yaw: a[3], hp: a[4], maxHp: a[5], anim: a[6], targetId: a[7], cast: a[8], dead: (flags & 1) !== 0,
  };
  if (flags & 4) e.aggroed = (flags & 2) !== 0;
  if (flags & 8) {
    e.shot = a[10];
    e.shotSeq = a[11];
  }
  if ((flags & 16) && a.length >= 13 && typeof a[12] === 'number' && Number.isFinite(a[12])) e.y = a[12];
  return e;
}

/** Typed payload -> wire form (identity for every channel except pstate / snap). */
export function encodePayload<K extends NetChannel>(channel: K, payload: NetChannels[K]): unknown {
  if (channel === 'pstate') return encodePState(payload as PState);
  if (channel === 'snap') {
    const s = payload as Snap;
    return { t: s.t, e: s.enemies.map(encodeEnemy) };
  }
  return payload;
}

/** Wire form -> typed payload (identity for every channel except pstate / snap). Never throws. */
export function decodePayload(channel: NetChannel, wire: unknown): unknown {
  try {
    if (channel === 'pstate') return decodePState(wire);
    if (channel === 'snap') {
      if (typeof wire === 'object' && wire !== null && !Array.isArray(wire)) {
        const w = wire as { t?: unknown; e?: unknown; enemies?: unknown };
        if (Array.isArray(w.e)) return { t: w.t, enemies: w.e.slice(0, 256).map(decodeEnemy) };
      }
      return wire;
    }
  } catch {
    /* fall through */
  }
  return wire;
}
