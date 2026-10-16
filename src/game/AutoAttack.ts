/**
 * WoW auto-attack driver (docs/CONTROLS_WOW.md §8). Pure state machine: no imports from G.
 *
 * It decides arm / disarm / swing-now. The swing itself is SkillSystem.autoSwing (the existing LMB chain), the
 * geometry (distance, facing, LOS) is computed by the caller and handed in as facts. PlayerController owns one instance.
 */

export const AUTO = {
  /** Seconds the chain waits after a finisher ends (divided by the attack speed factor). §8.2 */
  finisherGap: 0.2,
  /** Seconds without a valid swing (and not in combat) before the driver disarms itself. §8.4 */
  leashSec: 8,
  /** Retarget search: range (m, from the character) and total cone (deg, centred on facing). §8.4 */
  retargetRange: 8,
  retargetCone: 60,
  /** Ranged reach cap (m). §8.3 */
  rangedMax: 28,
  /** Melee reach slack on top of the step range (m, edge to edge). §8.3 */
  meleeSlack: 0.5,
  /** Facing cones (deg, absolute angle). Idle: swing up to idleFaceDeg. Moving or mouselook: moveFaceDeg. §8.3 */
  idleFaceDeg: 100,
  moveFaceDeg: 70,
  /** Throttle for the facing / no-target toasts (s). */
  toastEvery: 1,
} as const;

export type AutoMode = 'melee' | 'ranged' | 'off';

/** Facts about one candidate target, computed by the caller every frame. */
export interface AutoTarget {
  id: number;
  /** Metres from the character to the target's edge (centre distance minus target radius, >= 0). */
  dist: number;
  /** Absolute angle (0..180 deg) between the swing heading (facing, or camera heading in mouselook) and the target. */
  angleDeg: number;
  /** Line of sight from the character (only ranged needs it). */
  los: boolean;
  /** False when the target is dead, removed or no longer hostile: the driver retargets or disarms. */
  valid: boolean;
}

export interface AutoTickIn {
  dt: number;
  /** SkillSystem.autoInfo(p).mode. */
  mode: AutoMode;
  /** SkillSystem.autoInfo(p).reach (metres, edge to edge). */
  reach: number;
  /** SkillSystem.autoInfo(p).ready (chain idle or past chainAt, no gap, no buffer). */
  ready: boolean;
  /** Dead, stunned, hard cast, ground aim, charge, roll before its attack point, !canAct, panel open, chat focus. Pauses, never disarms. */
  paused: boolean;
  dead: boolean;
  /** The armed target as the caller resolved it (null when the id no longer exists). */
  target: AutoTarget | null;
  /** Nearest valid hostile within retargetRange and retargetCone, or null. Used when the target dies. */
  nearestId: number | null;
  moving: boolean;
  mouseLook: boolean;
  /** Player is in combat (AutoAttack arms it, so this is the leash exception). */
  inCombat: boolean;
}

export interface AutoTickOut {
  /** Call SkillSystem.autoSwing(p, aim) now. */
  swing: boolean;
  /** Idle and in reach: the caller turns the character toward the target (auto-face). */
  faceTarget: boolean;
  /** The driver turned itself off this frame (emit autoattack:state). */
  disarmed: boolean;
  /** A new target id when the old one was lost and a replacement was found, else null. */
  retargeted: number | null;
  toast: 'Hedefe bakmıyorsun' | 'Hedef yok' | null;
}

/** Retarget candidate test (caller helper): inside the search range and the cone. */
export function isRetargetCandidate(dist: number, angleDeg: number): boolean {
  return dist <= AUTO.retargetRange && angleDeg <= AUTO.retargetCone / 2;
}

export class AutoAttack {
  armed = false;
  targetId: number | null = null;
  /** Seconds since the last valid swing (or since arming). */
  idleT = 0;
  private clock = 0;
  private toastAt = -99;

  /** Arm on a target. A null id keeps the current target. */
  arm(targetId: number | null): void {
    this.armed = true;
    if (targetId != null) this.targetId = targetId;
    this.idleT = 0;
  }

  /** Turn off silently. Returns true when it was armed. */
  disarm(): boolean {
    const was = this.armed;
    this.armed = false;
    this.targetId = null;
    this.idleT = 0;
    return was;
  }

  /** Switch the target while armed (another enemy was selected). Keeps the driver armed. */
  setTarget(id: number | null): void {
    this.targetId = id;
  }

  /**
   * MMB / `=`: toggle. Arming uses the selected enemy, else the nearest in the cone. No candidate: toast, stays off.
   */
  toggle(selectedId: number | null, nearestId: number | null): { armed: boolean; toast: AutoTickOut['toast'] } {
    if (this.armed) { this.disarm(); return { armed: false, toast: null }; }
    const id = selectedId ?? nearestId;
    if (id == null) return { armed: false, toast: 'Hedef yok' };
    this.arm(id);
    return { armed: true, toast: null };
  }

  tick(i: AutoTickIn): AutoTickOut {
    this.clock += i.dt;
    const out: AutoTickOut = { swing: false, faceTarget: false, disarmed: false, retargeted: null, toast: null };
    if (!this.armed) return out;

    if (i.dead || i.mode === 'off') {
      out.disarmed = this.disarm();
      return out;
    }

    // target lost: retarget to the nearest candidate, else disarm silently
    if (!i.target || !i.target.valid) {
      if (i.nearestId != null) {
        this.targetId = i.nearestId;
        out.retargeted = i.nearestId;
        return out;
      }
      out.disarmed = this.disarm();
      return out;
    }

    // paused (stun, cast, dodge, panel, ...): neither swings nor counts the leash
    if (i.paused) return out;

    const t = i.target;
    const inReach = t.dist <= i.reach && (i.mode === 'melee' || t.los);
    const freeMove = i.moving || i.mouseLook;
    const cone = freeMove ? AUTO.moveFaceDeg : AUTO.idleFaceDeg;
    const facingOk = t.angleDeg <= cone;

    if (inReach && !freeMove) out.faceTarget = true;

    const canSwing = inReach && facingOk && i.ready;
    if (canSwing) {
      out.swing = true;
      this.idleT = 0;
    } else {
      // in reach but off the facing cone: say so in every mode (a silent armed driver looked like a broken attack)
      if (inReach && !facingOk && this.clock - this.toastAt >= AUTO.toastEvery) {
        out.toast = 'Hedefe bakmıyorsun';
        this.toastAt = this.clock;
      }
      this.idleT += i.dt;
      if (this.idleT >= AUTO.leashSec && !i.inCombat) {
        out.disarmed = this.disarm();
      }
    }
    return out;
  }
}

// ------------------------------------------------------------------------------------------------------
// self test (dev/player.html?selftest=1). Returns failure messages; empty array = pass.
// ------------------------------------------------------------------------------------------------------

export function selfTest(): string[] {
  const fails: string[] = [];
  const check = (ok: boolean, msg: string) => { if (!ok) fails.push(msg); };
  const tgt = (over: Partial<AutoTarget> = {}): AutoTarget => ({ id: 7, dist: 1, angleDeg: 0, los: true, valid: true, ...over });
  const base: AutoTickIn = {
    dt: 0.1, mode: 'melee', reach: 2.5, ready: true, paused: false, dead: false, target: tgt(), nearestId: null,
    moving: false, mouseLook: false, inCombat: false,
  };

  // 1. armed, in reach, facing, ready -> swing and face
  {
    const a = new AutoAttack();
    a.arm(7);
    const o = a.tick(base);
    check(o.swing && o.faceTarget && !o.disarmed, 'melee in reach: must swing');
  }

  // 2. not ready (chain running) -> no swing, no disarm
  {
    const a = new AutoAttack();
    a.arm(7);
    const o = a.tick({ ...base, ready: false });
    check(!o.swing && !o.disarmed, 'not ready: no swing and no disarm');
  }

  // 3. target dead, a replacement exists -> retarget, no disarm
  {
    const a = new AutoAttack();
    a.arm(7);
    const o = a.tick({ ...base, target: tgt({ valid: false }), nearestId: 9 });
    check(o.retargeted === 9 && !o.disarmed && a.targetId === 9, 'target dead: must retarget to nearest');
  }

  // 4. target dead, no replacement -> silent disarm
  {
    const a = new AutoAttack();
    a.arm(7);
    const o = a.tick({ ...base, target: null, nearestId: null });
    check(o.disarmed && !a.armed, 'target gone and no candidate: must disarm');
  }

  // 5. leash: out of reach for 8 s, not in combat -> disarm; in combat -> stays armed
  {
    const a = new AutoAttack();
    a.arm(7);
    let disarmed = false;
    for (let k = 0; k < 90; k++) {
      const o = a.tick({ ...base, dt: 0.1, target: tgt({ dist: 20 }) });
      if (o.disarmed) { disarmed = true; break; }
    }
    check(disarmed, 'leash: must disarm after 8 s out of reach');
    const b = new AutoAttack();
    b.arm(7);
    let dis2 = false;
    for (let k = 0; k < 90; k++) if (b.tick({ ...base, dt: 0.1, inCombat: true, target: tgt({ dist: 20 }) }).disarmed) dis2 = true;
    check(!dis2, 'leash: in combat must not disarm');
  }

  // 6. mouselook with the target outside 70 deg: no swing, a toast
  {
    const a = new AutoAttack();
    a.arm(7);
    const o = a.tick({ ...base, mouseLook: true, target: tgt({ angleDeg: 80 }) });
    check(!o.swing && o.toast === 'Hedefe bakmıyorsun', 'mouselook facing: no swing and facing toast');
  }

  // 7. paused: no swing, no disarm, and the leash does not run
  {
    const a = new AutoAttack();
    a.arm(7);
    for (let k = 0; k < 200; k++) a.tick({ ...base, paused: true, target: tgt({ dist: 20 }) });
    check(a.armed && a.idleT === 0, 'paused: must stay armed and not count idle time');
  }

  // 8. mode off disarms
  {
    const a = new AutoAttack();
    a.arm(7);
    const o = a.tick({ ...base, mode: 'off' });
    check(o.disarmed && !a.armed, 'mode off: must disarm');
  }

  // 9. ranged needs line of sight
  {
    const a = new AutoAttack();
    a.arm(7);
    const o = a.tick({ ...base, mode: 'ranged', reach: 28, target: tgt({ dist: 15, los: false }) });
    check(!o.swing, 'ranged without LOS: no swing');
    const o2 = a.tick({ ...base, mode: 'ranged', reach: 28, target: tgt({ dist: 15, los: true }) });
    check(o2.swing, 'ranged with LOS in reach: swing');
  }

  // 10. toggle: no selection and no nearest -> toast; with nearest -> armed
  {
    const a = new AutoAttack();
    const t1 = a.toggle(null, null);
    check(!t1.armed && t1.toast === 'Hedef yok', 'toggle: no candidate must toast');
    const t2 = a.toggle(null, 4);
    check(t2.armed && a.targetId === 4, 'toggle: nearest must arm');
    const t3 = a.toggle(null, null);
    check(!t3.armed && !a.armed, 'toggle: armed -> disarm');
  }

  return fails;
}
