/**
 * Snapshot interpolation buffer for remote entities (enemies on clients, other players everywhere).
 * push() samples stamped with the sender clock converted to local time by the caller (or local receive time);
 * sample() returns the state `delay` seconds in the past, lerping position and slerping yaw.
 */
export interface InterpSample {
  t: number;          // local time (seconds) the state represents
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Metres per snapshot segment above which remote motion is treated as a teleport (no lerp). Dashes stay below it. */
export const SNAP_DIST = 7;
/** Metres of height change per snapshot segment above which remote motion is treated as a teleport (vertical world, §10.3). */
export const SNAP_DY = 3;

export class Interpolator {
  private buf: InterpSample[] = [];
  delay = 0.1;
  maxSamples = 30;

  push(s: InterpSample): void {
    const b = this.buf;
    if (b.length && s.t <= b[b.length - 1].t) {
      // out of order or duplicate: replace the last if equal time, else drop
      if (s.t === b[b.length - 1].t) b[b.length - 1] = s;
      return;
    }
    b.push(s);
    if (b.length > this.maxSamples) b.shift();
  }

  get latest(): InterpSample | null {
    return this.buf.length ? this.buf[this.buf.length - 1] : null;
  }

  clear(): void {
    this.buf.length = 0;
  }

  /** Writes the interpolated state at (now - delay) into out. Returns false if no data. */
  sample(now: number, out: { x: number; y: number; z: number; yaw: number }): boolean {
    const b = this.buf;
    if (!b.length) return false;
    const t = now - this.delay;
    if (t <= b[0].t) {
      Object.assign(out, { x: b[0].x, y: b[0].y, z: b[0].z, yaw: b[0].yaw });
      return true;
    }
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1];
      const c = b[i];
      if (t >= a.t) {
        let k = Math.min(1, (t - a.t) / Math.max(1e-4, c.t - a.t));
        // teleports (Shadowstep, Blink, portals): a segment longer than SNAP_DIST is a jump, never a slide; so is a height
        // change above SNAP_DY (falls and vertical blinks under 7 m XZ). The horizontal rule is unchanged.
        const jx = c.x - a.x, jz = c.z - a.z;
        if (jx * jx + jz * jz > SNAP_DIST * SNAP_DIST || Math.abs(c.y - a.y) > SNAP_DY) k = k < 0.5 ? 0 : 1;
        out.x = a.x + (c.x - a.x) * k;
        out.y = a.y + (c.y - a.y) * k;
        out.z = a.z + (c.z - a.z) * k;
        let d = c.yaw - a.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        out.yaw = a.yaw + d * k;
        // drop samples that are fully in the past
        if (i > 2) b.splice(0, i - 2);
        return true;
      }
    }
    const l = b[b.length - 1];
    Object.assign(out, { x: l.x, y: l.y, z: l.z, yaw: l.yaw });
    return true;
  }
}
