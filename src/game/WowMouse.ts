/**
 * WoW mouse gestures (docs/CONTROLS_WOW.md §4.1, §4.2). Pure state machine: no imports from G, no three.
 *
 * The caller passes the frame's button state (already UI-filtered by Input), the mouse delta and the NDC cursor.
 * The machine answers with camera/controller intents. Clicks are resolved on RELEASE and use the NDC recorded at PRESS.
 */

export interface BtnState {
  down: boolean;
  /** Seconds held in the current gesture. */
  t: number;
  /** Sum of |dx| + |dy| while held (px). */
  moved: number;
  /** Cursor position at press. */
  ndcX: number;
  ndcY: number;
  /** True once the hold crossed lockSec or lockPx: the lock request is latched for this hold. */
  lockAsked: boolean;
  /** A chord (the other button was also down during this hold): never a click. */
  chorded: boolean;
  /** Aiming was active when the button went down. */
  aimAtPress: boolean;
}

export interface WowMouseIn {
  dt: number;
  l: boolean;
  r: boolean;
  lPressed: boolean;
  rPressed: boolean;
  dx: number;
  dy: number;
  ndcX: number;
  ndcY: number;
  /** canInput && !uiOpen && !dead. A press while disabled is ignored until release. */
  enabled: boolean;
  /** G.skills.isAiming(p): a ground aim waits for a confirm. */
  aiming: boolean;
}

export interface WowMouseOut {
  mouseLook: boolean;
  orbit: boolean;
  both: boolean;
  /** Ask Input.lock() once per hold (true from the frame the hold qualifies until the last release). */
  wantLock: boolean;
  clickL?: { ndcX: number; ndcY: number };
  clickR?: { ndcX: number; ndcY: number };
  confirmAim?: { ndcX: number; ndcY: number };
  cancelAim?: boolean;
}

export const WOW_MOUSE = { clickPx: 5, clickSec: 0.25, lockPx: 3, lockSec: 0.12 } as const;

function freshBtn(): BtnState {
  return { down: false, t: 0, moved: 0, ndcX: 0, ndcY: 0, lockAsked: false, chorded: false, aimAtPress: false };
}

export class WowMouse {
  l: BtnState = freshBtn();
  r: BtnState = freshBtn();
  /** Press began while disabled: ignored until that button is released. */
  private blockedL = false;
  private blockedR = false;

  reset(): void {
    this.l = freshBtn();
    this.r = freshBtn();
    this.blockedL = false;
    this.blockedR = false;
  }

  update(i: WowMouseIn): WowMouseOut {
    const out: WowMouseOut = { mouseLook: false, orbit: false, both: false, wantLock: false };

    // a blocked press ends with its release
    if (!i.l) this.blockedL = false;
    if (!i.r) this.blockedR = false;

    // disabled (panel open, dead, no input): abort held gestures, emit nothing, release any lock
    if (!i.enabled) {
      // a button held while disabled is blocked until its release, even if it never started a gesture
      if (i.l || this.l.down) { this.l.down = false; this.blockedL = true; }
      if (i.r || this.r.down) { this.r.down = false; this.blockedR = true; }
      return out;
    }

    // 1. press starts (a blocked press never starts)
    if (!this.blockedL && !this.l.down && (i.lPressed || i.l)) this.start(this.l, i);
    if (!this.blockedR && !this.r.down && (i.rPressed || i.r)) this.start(this.r, i);

    // 2. holds: accumulate, flag chords and lock thresholds
    const holdL = this.l.down && i.l;
    const holdR = this.r.down && i.r;
    if (holdL) this.accumulate(this.l, i);
    if (holdR) this.accumulate(this.r, i);
    if (this.l.down && this.r.down) { this.l.chorded = true; this.r.chorded = true; }

    // 3. releases: resolve clicks on release
    const relL = this.l.down && !i.l;
    const relR = this.r.down && !i.r;
    if (relL) this.release(this.l, 'l', i, out);
    if (relR) this.release(this.r, 'r', i, out);

    // 4. outputs (after releases)
    const dl = this.l.down, dr = this.r.down;
    out.mouseLook = dr;
    out.orbit = dl || dr;
    out.both = dl && dr;
    out.wantLock = (dl && this.l.lockAsked) || (dr && this.r.lockAsked);
    return out;
  }

  private start(b: BtnState, i: WowMouseIn): void {
    b.down = true;
    b.t = 0;
    b.moved = 0;
    b.ndcX = i.ndcX;
    b.ndcY = i.ndcY;
    b.lockAsked = false;
    b.chorded = false;
    b.aimAtPress = i.aiming;
  }

  private accumulate(b: BtnState, i: WowMouseIn): void {
    b.t += i.dt;
    b.moved += Math.abs(i.dx) + Math.abs(i.dy);
    if (!b.lockAsked && (b.t >= WOW_MOUSE.lockSec || b.moved >= WOW_MOUSE.lockPx)) b.lockAsked = true;
  }

  private release(b: BtnState, which: 'l' | 'r', i: WowMouseIn, out: WowMouseOut): void {
    const isClick = !b.chorded && b.moved < WOW_MOUSE.clickPx && b.t < WOW_MOUSE.clickSec;
    if (isClick) {
      const at = { ndcX: b.ndcX, ndcY: b.ndcY };
      if (i.aiming) {
        // the click lands while a ground aim waits: confirm (LMB) or cancel (RMB)
        if (which === 'l') out.confirmAim = at;
        else out.cancelAim = true;
      } else if (!b.aimAtPress) {
        if (which === 'l') out.clickL = at;
        else out.clickR = at;
      }
      // aimAtPress && !aiming: the aim was consumed during the press, so the click is swallowed
    }
    b.down = false;
    b.lockAsked = false;
    b.chorded = false;
    b.aimAtPress = false;
  }
}

// ------------------------------------------------------------------------------------------------------
// self test (dev/player.html?selftest=1). Returns failure messages; empty array = pass.
// ------------------------------------------------------------------------------------------------------

export function selfTest(): string[] {
  const fails: string[] = [];
  const check = (ok: boolean, msg: string) => { if (!ok) fails.push(msg); };
  const base: WowMouseIn = {
    dt: 0, l: false, r: false, lPressed: false, rPressed: false, dx: 0, dy: 0,
    ndcX: 0, ndcY: 0, enabled: true, aiming: false,
  };
  const frame = (m: WowMouse, patch: Partial<WowMouseIn>): WowMouseOut => m.update({ ...base, ...patch });

  // 1. quick LMB click: press at (0.1, 0.2), release after 0.1 s, no move
  {
    const m = new WowMouse();
    frame(m, { l: true, lPressed: true, ndcX: 0.1, ndcY: 0.2, dt: 0.016 });
    frame(m, { l: true, dt: 0.1 });
    const o = frame(m, { l: false, dt: 0.016 });
    check(!!o.clickL && o.clickL.ndcX === 0.1 && o.clickL.ndcY === 0.2, 'click: LMB quick click not emitted at press NDC');
    check(!o.wantLock, 'click: quick click must not request the lock');
    check(!o.orbit && !o.mouseLook, 'click: no hold outputs after release');
  }

  // 2. drag: LMB held and moved 10 px -> no click, lock requested, orbit on
  {
    const m = new WowMouse();
    frame(m, { l: true, lPressed: true, dt: 0.016 });
    const o1 = frame(m, { l: true, dx: 10, dt: 0.016 });
    check(o1.wantLock && o1.orbit, 'drag: movement past lockPx must request lock and orbit');
    const o2 = frame(m, { l: false, dt: 0.016 });
    check(!o2.clickL, 'drag: a moved gesture is not a click');
    check(!o2.wantLock, 'drag: lock must drop on release');
  }

  // 3. chord: LMB held, RMB quick click inside it -> no RMB click, and no LMB click on release
  {
    const m = new WowMouse();
    frame(m, { l: true, lPressed: true, dt: 0.016 });
    const oc = frame(m, { l: true, r: true, rPressed: true, dt: 0.016, ndcX: 0.5, ndcY: 0.5 });
    check(oc.both && oc.mouseLook && oc.orbit, 'chord: both-held outputs');
    const orr = frame(m, { l: true, r: false, dt: 0.016 });
    check(!orr.clickR, 'chord: RMB release inside a chord is not a click');
    const ol = frame(m, { l: false, dt: 0.016 });
    check(!ol.clickL, 'chord: LMB release after a chord is not a click');
  }

  // 4. aiming: a click while a ground aim waits confirms (LMB) and cancels (RMB)
  {
    const m = new WowMouse();
    frame(m, { l: true, lPressed: true, aiming: true, ndcX: 0.3, ndcY: -0.1, dt: 0.016 });
    const o = frame(m, { l: false, aiming: true, dt: 0.016 });
    check(!!o.confirmAim && !o.clickL, 'aim: LMB click while aiming must confirm, not select');
    const m2 = new WowMouse();
    frame(m2, { r: true, rPressed: true, aiming: true, dt: 0.016 });
    const o2 = frame(m2, { r: false, aiming: true, dt: 0.016 });
    check(!!o2.cancelAim && !o2.clickR, 'aim: RMB click while aiming must cancel');
  }

  // 5. aim consumed during the press (key press confirmed it): the click is swallowed
  {
    const m = new WowMouse();
    frame(m, { l: true, lPressed: true, aiming: true, dt: 0.016 });
    const o = frame(m, { l: false, aiming: false, dt: 0.016 });
    check(!o.clickL && !o.confirmAim, 'aim consumed during press must swallow the click');
  }

  // 6. press while disabled is ignored until release, and no click is emitted for it
  {
    const m = new WowMouse();
    frame(m, { l: true, lPressed: true, enabled: false, dt: 0.016 });
    frame(m, { l: true, enabled: true, dt: 0.016 });
    const o = frame(m, { l: false, dt: 0.016 });
    check(!o.clickL, 'disabled press must not become a click');
    check(!o.wantLock, 'disabled press must not request the lock');
  }

  // 7. RMB hold = mouselook; LMB+RMB = both
  {
    const m = new WowMouse();
    const o = frame(m, { r: true, rPressed: true, dt: 0.016 });
    check(o.mouseLook && !o.both, 'mouselook: RMB held');
    const o2 = frame(m, { l: true, lPressed: true, r: true, dt: 0.016 });
    check(o2.both && o2.mouseLook, 'both: LMB and RMB held');
  }

  // 8. reset clears everything
  {
    const m = new WowMouse();
    frame(m, { l: true, lPressed: true, dt: 0.016 });
    m.reset();
    check(!m.l.down && !m.r.down, 'reset: buttons cleared');
  }

  // 9. window blur: the caller resets the machine, then the buttons read as released -> no click, no drag output
  {
    const m = new WowMouse();
    frame(m, { l: true, lPressed: true, ndcX: 0.2, ndcY: 0.2, dt: 0.016 });
    frame(m, { l: true, dt: 0.05 });
    m.reset(); // PlayerController.onWindowBlur
    const o = frame(m, { l: false, dt: 0.016 });
    check(!o.clickL && !o.clickR, 'blur: a reset press must not release into a click');
    check(!o.wantLock && !o.orbit, 'blur: no hold outputs after the reset');
    // without the reset the same sequence WOULD click (documents why the caller must reset)
    const n = new WowMouse();
    frame(n, { l: true, lPressed: true, dt: 0.016 });
    frame(n, { l: true, dt: 0.05 });
    check(!!frame(n, { l: false, dt: 0.016 }).clickL, 'blur: control case (no reset) must click');
  }

  return fails;
}
