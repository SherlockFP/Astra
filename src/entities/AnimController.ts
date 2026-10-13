import * as THREE from 'three';

/** Bones (sanitized-name prefixes) treated as "upper body" for move+attack layering on KayKit-like rigs. */
const UPPER_PREFIXES = ['spine', 'chest', 'upperarm', 'lowerarm', 'wrist', 'hand', 'head', 'neck', 'shoulder', 'elbowik', 'clavicle'];

type Mask = 'full' | 'upper' | 'lower';

/** GDD_LIFE §5.4: clip time scale while `freezeUntil` is active (selective hit-freeze). */
const FREEZE_TIME_SCALE = 0.04;

export interface PlayOpts {
  fade?: number;          // crossfade seconds (default 0.15)
  speed?: number;         // timeScale
  loop?: boolean;         // default true for base, false for one-shots
  restart?: boolean;      // restart even if already playing
}

export interface OneShotOpts extends PlayOpts {
  /** Play on the upper body only so locomotion continues on the legs (attack while running). */
  upperBody?: boolean;
  /** Called when the clip finishes (not when cancelled). */
  onDone?: () => void;
  /** Hold the last frame and lock the controller (death). */
  hold?: boolean;
  /** Seconds into the clip (unscaled clip time) at which `onEvent` fires — e.g. the hit frame. */
  eventAt?: number;
  onEvent?: () => void;
}

function isUpperTrack(trackName: string): boolean {
  const node = trackName.split('.')[0].toLowerCase();
  return UPPER_PREFIXES.some((p) => node.startsWith(p));
}

/**
 * Two-layer animation player for humanoid rigs (KayKit, Quaternius, generated creatures):
 *  - base layer: looping locomotion/idle via setBase(name) (cheap to call every frame)
 *  - one-shot layer: attacks/casts/hits/death via playOnce(); optionally upper-body only — then the base switches to a
 *    lower-body-only copy so legs keep running and arms play the attack at full weight (no 50/50 averaging).
 * Weights always sum to >= 1 during transitions (no bind/T-pose flicker).
 * Clip names are the GLB animation names; "Armature|Idle" style names are also registered as "Idle".
 */
export class AnimController {
  readonly mixer: THREE.AnimationMixer;
  private clips = new Map<string, THREE.AnimationClip>();
  private masked = new Map<string, THREE.AnimationClip>();
  private actions = new Map<string, THREE.AnimationAction>();
  /** Requested base clip (applied immediately, or after a full-body one-shot ends). */
  baseName: string | null = null;
  private baseAction: THREE.AnimationAction | null = null;
  private baseMask: Mask = 'full';
  private shot: { action: THREE.AnimationAction; opts: OneShotOpts; name: string; eventFired: boolean; mask: Mask } | null = null;
  /** Global speed multiplier for one-shots (attack speed, slows). */
  shotSpeed = 1;
  /** True after a `hold` one-shot (death) until reset(). */
  locked = false;
  /** Increments whenever a new one-shot starts (network replication of attacks). */
  shotSeq = 0;
  /** GDD_LIFE §5.4 (L-00): performance.now() ms until which the clip time runs at FREEZE_TIME_SCALE (selective hit-freeze). 0 = off. */
  freezeUntil = 0;
  /**
   * Off-camera pause (NPCs and off-screen enemies, see entities/ViewCull.ts): while set and no one-shot plays, update() only
   * accumulates dt. Anything that starts or changes a clip first applies the accumulated time (catchUp), so the base timeline
   * is exact when the entity comes back. One-shots are never paused, so their events and onDone fire on time.
   */
  paused = false;
  private pendingDt = 0;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) {
      this.clips.set(c.name, c);
      const bar = c.name.lastIndexOf('|');
      if (bar >= 0) {
        const short = c.name.slice(bar + 1);
        if (!this.clips.has(short)) this.clips.set(short, c);
      }
    }
    this.mixer.addEventListener('finished', (e) => this.onFinished(e.action as THREE.AnimationAction));
  }

  has(name: string): boolean {
    return this.clips.has(name);
  }

  /** First clip name that exists (fallback chains like pick('Running_A', 'Run', 'Walk')). */
  pick(...names: string[]): string | null {
    for (const n of names) if (this.clips.has(n)) return n;
    return null;
  }

  clipNames(): string[] {
    return [...this.clips.keys()];
  }

  clipDuration(name: string): number {
    return this.clips.get(name)?.duration ?? 0;
  }

  get oneShotName(): string | null {
    return this.shot?.name ?? null;
  }

  get isPlayingOneShot(): boolean {
    return !!this.shot;
  }

  private action(name: string, mask: Mask): THREE.AnimationAction | null {
    const key = `${name}#${mask}`;
    const cached = this.actions.get(key);
    if (cached) return cached;
    const src = this.clips.get(name);
    if (!src) return null;
    let clip = src;
    if (mask !== 'full') {
      let mc = this.masked.get(key);
      if (!mc) {
        mc = src.clone();
        mc.name = key;
        mc.tracks = mc.tracks.filter((t) => (mask === 'upper' ? isUpperTrack(t.name) : !isUpperTrack(t.name)));
        this.masked.set(key, mc);
      }
      clip = mc;
    }
    const a = this.mixer.clipAction(clip);
    this.actions.set(key, a);
    return a;
  }

  /** Start `name` as the base loop with the given mask, synced to the previous base phase. */
  private startBase(name: string, mask: Mask, fade: number, speed?: number): void {
    const a = this.action(name, mask);
    if (!a) return;
    const prev = this.baseAction;
    if (prev === a) {
      if (speed !== undefined) a.timeScale = speed;
      return;
    }
    const phase = prev ? prev.time / (prev.getClip().duration || 1) : 0;
    a.reset();
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.enabled = true;
    if (speed !== undefined) a.timeScale = speed;
    a.play();
    a.time = phase * a.getClip().duration;
    a.setEffectiveWeight(1);
    if (prev) {
      if (fade > 0) prev.fadeOut(fade);
      else prev.stop();
    }
    this.baseAction = a;
    this.baseMask = mask;
  }

  /** Set the looping base animation (idle / run / walk / strafe...). */
  setBase(name: string, opts: PlayOpts = {}): void {
    if (this.locked || !this.clips.has(name)) return;
    if (this.baseName === name && !opts.restart) {
      if (opts.speed !== undefined && this.baseAction && this.baseAction.timeScale !== opts.speed) {
        this.catchUp();
        this.baseAction.timeScale = opts.speed;
      }
      return;
    }
    this.catchUp();
    this.baseName = name;
    const fade = opts.fade ?? 0.18;
    if (this.shot && this.shot.mask === 'full') return; // applied when the full-body shot ends
    this.startBase(name, this.shot && this.shot.mask === 'upper' ? 'lower' : 'full', fade, opts.speed);
  }

  /** Play a one-shot over the base layer. Returns its duration in seconds (after speed), 0 if missing. */
  playOnce(name: string, opts: OneShotOpts = {}): number {
    if (this.locked) return 0;
    const mask: Mask = opts.upperBody && this.baseName ? 'upper' : 'full';
    const a = this.action(name, mask);
    if (!a) {
      opts.onEvent?.();
      opts.onDone?.();
      return 0;
    }
    this.catchUp();
    const fade = opts.fade ?? 0.08;
    const old = this.shot;
    if (old && old.action !== a) old.action.fadeOut(fade);
    const speed = (opts.speed ?? 1) * this.shotSpeed;
    a.reset();
    a.timeScale = speed;
    a.setLoop(opts.loop ? THREE.LoopRepeat : THREE.LoopOnce, opts.loop ? Infinity : 1);
    a.clampWhenFinished = true;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    this.shot = { action: a, opts, name, eventFired: !opts.onEvent, mask };
    this.shotSeq++;
    if (this.baseName) {
      if (mask === 'upper') this.startBase(this.baseName, 'lower', fade);
      else if (this.baseAction) this.baseAction.fadeOut(fade);
    }
    if (opts.hold) this.locked = true;
    return a.getClip().duration / Math.max(0.01, speed);
  }

  /** Stop the current one-shot (interrupted cast, dodge cancel). */
  cancelOneShot(fade = 0.1): void {
    const s = this.shot;
    if (!s) return;
    this.shot = null;
    this.locked = false;
    s.action.fadeOut(fade);
    this.restoreBase(fade);
  }

  private restoreBase(fade: number): void {
    if (!this.baseName) return;
    const want = this.baseName;
    if (this.baseMask !== 'full' || !this.baseAction || this.baseAction.getClip().name !== this.clips.get(want)?.name) {
      this.startBase(want, 'full', fade);
    }
    if (this.baseAction) {
      // a completed fadeOut disables the action; re-enable before restoring weight
      this.baseAction.enabled = true;
      this.baseAction.setEffectiveWeight(1);
    }
  }

  /** Back to the alive state (respawn). */
  reset(): void {
    this.locked = false;
    this.shot = null;
    this.pendingDt = 0;
    this.mixer.stopAllAction();
    this.baseAction = null;
    const b = this.baseName;
    this.baseName = null;
    if (b) this.setBase(b, { fade: 0 });
  }

  /** Applies the time skipped while paused, before a clip starts or changes (keeps the base timeline exact). */
  private catchUp(): void {
    if (this.pendingDt <= 0) return;
    const d = this.pendingDt;
    this.pendingDt = 0;
    this.mixer.update(d);
  }

  update(dt: number): void {
    const step = this.freezeUntil > 0 && performance.now() < this.freezeUntil ? dt * FREEZE_TIME_SCALE : dt;
    if (this.paused && !this.shot) {
      this.pendingDt += step;
      return;
    }
    const total = this.pendingDt + step;
    this.pendingDt = 0;
    this.mixer.update(total);
    const s = this.shot;
    if (s && !s.eventFired && s.opts.eventAt !== undefined && s.action.time >= s.opts.eventAt) {
      s.eventFired = true;
      s.opts.onEvent?.();
    }
  }

  private onFinished(action: THREE.AnimationAction): void {
    const s = this.shot;
    if (!s || s.action !== action) return;
    if (!s.eventFired) {
      s.eventFired = true;
      s.opts.onEvent?.();
    }
    if (s.opts.hold) {
      s.opts.onDone?.();
      return;
    }
    this.shot = null;
    action.fadeOut(0.15);
    this.restoreBase(0.15);
    s.opts.onDone?.();
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
