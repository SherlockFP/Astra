import * as THREE from 'three';
import { G } from '../game/G';
import { clamp, damp, angleDiff, lerp } from '../core/utils';
import { OccluderFader } from './OccluderFade';
import type { Actor } from '../entities/Actor';
import type { Enemy } from '../entities/Enemy';
import { VERT } from '../world/Heightfield';

export type CameraMode = 'action' | 'classic';
/**
 * 'pull' (Town): the camera stops in front of the first occluder on the pivot -> camera ray.
 * 'fade' (dungeons, open world): the camera stays put and the occluders on the ray fade out (OccluderFade.ts), so the player is seen.
 */
export type OccluderMode = 'pull' | 'fade';

/**
 * CONTROLS_WOW §7.1 camera profile per control scheme. 'action' is Aksiyon and keeps today's values exactly; 'classic' is the WoW
 * profile. restPitch NaN = the zoom-driven rest pitch of Aksiyon (lerp 0.26..0.62). shoulder is informative only: the offset is
 * applied through SHOULDER in place().
 */
export interface CamProfile {
  zoomMin: number; zoomMaxOutdoor: number; zoomMaxIndoor: number; zoomDefault: number;
  restPitch: number; maxPitch: number;
  shoulder: number; lookAhead: boolean; combatZoom: boolean; lockOnFraming: boolean;
  pitchAutoReturn: boolean; wheelPitchPull: boolean;
}
export const CAM_PROFILES: Record<CameraMode, CamProfile> = {
  action: { zoomMin: 3, zoomMaxOutdoor: 18, zoomMaxIndoor: 18, zoomDefault: 9, restPitch: NaN, maxPitch: 1.38, shoulder: 0.55, lookAhead: true, combatZoom: true, lockOnFraming: true, pitchAutoReturn: true, wheelPitchPull: true },
  classic: { zoomMin: 2, zoomMaxOutdoor: 30, zoomMaxIndoor: 18, zoomDefault: 10, restPitch: 0.349, maxPitch: 1.45, shoulder: 0, lookAhead: false, combatZoom: false, lockOnFraming: false, pitchAutoReturn: false, wheelPitchPull: false },
};
/** WoW: the wheel moves the zoom by at least this many metres per notch. */
const WOW_MIN_ZOOM_STEP = 0.4;
/** WoW: indoor zoom maximum follows its goal at this speed (m/s). */
const ZOOM_MAX_SLEW = 4;
/** WoW: lateral wall probes sit this far (m) either side of the camera axis. */
const LATERAL_PROBE = 0.35;
/** WoW smart pivot (§7.4): dead zone (rad, 2 deg) and the speed/turn limits. */
const SMART_DEAD = 2 * Math.PI / 180;
const SMART_EASE = 3.0;
const SMART_MAX_RATE = 2.2;
const SHOULDER = 0.55;            // action-mode over-the-shoulder offset (metres, right)
const LOOK_SENS = 0.0022;         // rad per pixel at sensitivity 1
const MAX_SHAKES = 10;
const OCC_MARGIN = 0.6;           // the camera stops this far (m) in front of a scene mesh that stands between it and the player
const OCC_MIN_HIT = 0.5;          // scene hits this close to the pivot are ignored (the player's own surroundings)
/** GDD_LIFE §4.2: after the last block the camera waits this long before it eases back out. */
const COL_HOLD = 0.15;
/** GDD_LIFE §4.11 shake budget. */
const SHAKE_CAP = 0.85;
const SHAKE_ENTRY_CAP = 0.7;
const SHAKE_BUDGET = 2.2;
const SHAKE_MERGE_S = 0.06;
/** GDD_LIFE §4.11 directional kick spring (k 300, c 24: settles in about 0.2 s). */
const KICK_K = 300;
const KICK_C = 24;

interface ShakeEntry { amp: number; dur: number; t: number }

/**
 * CONTROLS_WOW settings this file reads and writes. Declared locally until core/Settings.ts (W1-A) carries the fields, so this
 * compiles before that lands. Remove the cast once SettingsData has `cameraDistanceWow` and `cameraSmartPivot`.
 */
type WowCamSettings = { cameraDistanceWow?: number; cameraSmartPivot?: boolean };
type WowSettingsWriter = { set(key: 'cameraDistanceWow', value: number): void };
const wowData = (): WowCamSettings | undefined => G.settings?.data as unknown as WowCamSettings | undefined;

// tiny smooth value noise (1D) so shakes are continuous instead of white noise
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash(i + seed * 17.13) * (1 - u) + hash(i + 1 + seed * 17.13) * u) * 2 - 1;
}
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeIO = (t: number): number => {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};

const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _occRay = new THREE.Raycaster();
const _occDir = new THREE.Vector3();
const _cf = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _cl = new THREE.Vector3();

/**
 * Cinematic camera pass (GDD_LIFE §4.12): the camera blends from its normal pose to a framing of `focus` and back. The aim pose
 * stays the normal one, so gameplay and aiming are unaffected. Local only and non-blocking.
 */
export interface CinematicSpec {
  /** Object whose position is the feet of the focus (its chest is `h * 0.55` above), or a function returning the focus point. */
  focus: THREE.Object3D | (() => THREE.Vector3);
  /** Height of the focus in metres (distance and height of the framing derive from it). */
  h: number;
  /** Blend in / hold / blend out (s). */
  blendIn: number;
  hold: number;
  blendOut: number;
  /** Orbit during the hold (deg) and dolly-in (m). */
  orbitDeg: number;
  dolly: number;
  /** FOV delta at full weight (deg). */
  fovDelta: number;
  /** Mouse movement > 15 px or a skill / dodge press ends the pass (ease-out 0.25 s). */
  skippable: boolean;
}

interface CineState {
  spec: CinematicSpec;
  t: number;
  /** combat time of the skip (-1 = not skipped) and the weight at that moment */
  skipAt: number;
  skipW: number;
  mouseAcc: number;
  shook: boolean;
}

/** Boss ids that already played their intro this session (GDD_LIFE §4.12: first engage per boss id). */
const introSeen = new Set<string>();
const SKIP_ACTIONS = ['skill_lmb', 'skill_rmb', 'skill_q', 'skill_e', 'skill_r', 'skill_s1', 'skill_s2', 'skill_s3', 'dodge'] as const;

/**
 * Third-person orbit camera.
 *  - 'action' mode (default, Roblox shift-lock / modern action RPG): pointer locked, mouse orbits, crosshair aim,
 *    character faces camera yaw while attacking/moving. Alt or an open panel frees the cursor.
 *  - 'classic' mode (WoW): cursor visible, hold RMB to orbit (and turn the character), skills aim at the cursor.
 * Wheel zoom (distance 3..18) with zoom -> pitch / FOV curves (GDD_LIFE §4.6), wall collision against the nav grid and solid scene
 * meshes (occluders, with hysteresis), smooth follow with look-ahead, auto-follow, shoulder swap, lock-on framing, shake with a
 * trauma budget, directional kick, FOV kicks, the death cam and the boss intro pass.
 * OWNER: player module.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  target: THREE.Object3D | null = null;
  /** Orbit yaw: the camera looks along (-sin yaw, 0, -cos yaw). A character facing the same way has charYaw = yaw + PI. */
  yaw = 0;
  pitch = 0.45;
  /** Wanted zoom distance (the effective distance is smaller while a wall is behind the camera). */
  distance = 9;

  // ---- tunables / state read by PlayerController ----
  /** Height of the orbit pivot above the target's feet (KayKit is ~2.4 tall). */
  pivotHeight = 2.0;
  /** Shift-lock (middle mouse toggles, action mode): the character always faces the camera yaw. */
  shiftLock = true;
  /** Which shoulder the action camera sits on: 1 right, -1 left, 0 centred. */
  shoulderSide = 1;
  /** Enable the nav-grid collision pull-in. */
  collide = true;
  /**
   * Nav blockers whose hit point is higher than this many metres above the ground do not pull the camera in (the ray passes
   * over low blocked props such as fences, barrels, crates). Infinity (default) = every blocked cell counts, as before.
   * Towns with many low props can set ~2.4; dungeons (tall walls) keep Infinity.
   */
  collideMaxRayHeight = Infinity;
  /**
   * Solid scene meshes (buildings, walls, trees, bushes...) the camera must not sit behind. The pivot -> camera ray is tested against
   * their real triangles: in 'pull' mode the camera is pulled in in front of the first hit (Town); in 'fade' mode the hits fade out
   * instead (dungeons, open world; candidates from collectFadeOccluders). A low prop the camera looks over never triggers either.
   * Null = off (dungeons rely on the nav grid).
   */
  occluders: THREE.Object3D[] | null = null;
  /** How `occluders` are handled (see OccluderMode). */
  occluderMode: OccluderMode = 'pull';
  /** True on frames where the player drives the orbit (pointer locked / RMB held). */
  orbiting = false;

  private pivot = new THREE.Vector3();
  private pivotReady = false;
  private zoomTarget = 9;
  private zoomCur = 9;
  /** Effective zoom maximum (CONTROLS_WOW §7.1): 18 in Aksiyon; WoW indoor ceiling-based, slewed at 4 m/s. */
  private zoomMaxCur = 18;
  /** Set by scenes through setEnvironment (CONTROLS_WOW §7.2). */
  private outdoor = false;
  private colFrac = 1;
  private colHold = 0;
  private colByProp = false;
  /** Debug (debugStats): the ceiling cap over the pivot (Infinity = none) and the ceiling fraction of the last frame. */
  private dbgCapY = Infinity;
  private dbgFracCeil = 1;
  private shoulderCur = SHOULDER;
  private shakes: ShakeEntry[] = [];
  private shakeClock = 0;
  private punchOff = 0;
  private punchVel = 0;
  private fovOffset = 0;
  private fovVel = 0;
  /** Directional kick offset in camera axes (x right, y forward) and its velocity. */
  private kickX = 0;
  private kickY = 0;
  private kickVX = 0;
  private kickVY = 0;
  /** Trauma budget bookkeeping: recent added trauma, half-strength window, merge window. */
  private budget: { t: number; amp: number }[] = [];
  private halfUntil = -1;
  private lastShakeAt = -9;
  /** Camera clock (sum of input frames' dt). */
  private clock = 0;
  private lastInputFrame = -1;
  private idleLook = 1;
  /** seconds since the last orbit input */
  private idleOrbit = 99;
  private assistYaw: number | null = null;
  private assistPitch: number | null = null;
  private assistK = 0;
  private zoomSaveTimer = -1;
  private lastWheelAt = -99;
  private hideCursor = false;
  private unsubs: (() => void)[] = [];
  private readonly fader = new OccluderFader();
  /** Clean (shake-free) pose used for aiming. */
  private readonly aimOrigin = new THREE.Vector3();
  private readonly aimDir = new THREE.Vector3(0, 0, -1);
  /** Lock-on (GDD_LIFE §4.7): the locked actor, the auto-zoom bias (m), the manual-override timers. */
  private lockOnTarget: Actor | null = null;
  private lockBias = 0;
  private lockOverT = 0;
  private lockSuspendT = 0;
  private lockYawWant = 0;
  /** Precision aim (ground reticle held, GDD_LIFE §4.8). */
  private aimHeld = false;
  /** Auto-follow inputs set by PlayerController (GDD_LIFE §4.4). */
  private follow = { active: false, yaw: 0, speed: 0 };
  /** Shoulder swap state (GDD_LIFE §4.5). */
  private savedSide = 1;
  private shoulderCentred = false;
  private autoShoulderT = 0;
  private shoulderCooldown = 0;
  /** Look-ahead and target velocity (planar), smoothed. */
  private lastTX = NaN;
  private lastTZ = NaN;
  private tgtVX = 0;
  private tgtVZ = 0;
  private laX = 0;
  private laZ = 0;
  /** Rotation smoothing state (GDD_LIFE §4.1). */
  private smDx = 0;
  private smDy = 0;
  /** Combat zoom bias (GDD_LIFE §4.6). */
  private combatBias = 0;
  private combatHold = 0;
  private combatScanT = 0;
  /** Death cam (GDD_LIFE §4.13). */
  private deathCam = false;
  /** Cinematic boss intro (GDD_LIFE §4.12). */
  private cine: CineState | null = null;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    const d = G.settings?.data;
    if (d) {
      this.distance = this.zoomTarget = this.zoomCur = this.loadZoom();
    }
    if (this.mode === 'classic') this.shoulderSide = 0;
    this.unsubs.push(
      G.events.on('camera:shake', (e) => this.shake(e.intensity, e.duration)),
      // GDD_LIFE §4.10 / §5.6: directional kick and FOV kicks from combat / player events
      G.events.on('camera:kick', (e) => this.kick(e.dx, e.dz, e.amount)),
      G.events.on('camera:fov', (e) => this.kickFov(e.deg)),
      G.events.on('skill:aimStart', () => { this.aimHeld = true; }),
      G.events.on('skill:aimEnd', () => { this.aimHeld = false; }),
      G.events.on('player:levelup', () => this.kickFov(2.5)),
      G.events.on('player:died', (e) => { if (e.local) this.deathCam = true; }),
      G.events.on('player:revived', (e) => { if (e.local) this.deathCam = false; }),
      G.events.on('boss:engaged', (e) => this.onBossEngaged(e.bossId, e.entityId)),
    );
  }

  get mode(): CameraMode {
    return G.settings?.data.cameraMode === 'classic' ? 'classic' : 'action';
  }

  /** The active camera profile (CONTROLS_WOW §7.1). */
  get profile(): CamProfile {
    return CAM_PROFILES[this.mode];
  }

  /** Scene environment (CONTROLS_WOW §7.2): outdoor lifts the WoW zoom cap to 30 m; indoors it follows the ceiling. */
  setEnvironment(e: { outdoor: boolean }): void {
    this.outdoor = e.outdoor;
  }

  /** Rigid yaw turn with the character (WoW turn keys, CONTROLS_WOW §7.2). */
  rotateYaw(delta: number): void {
    this.yaw += delta;
  }

  /**
   * The control scheme changed: reload the zoom of the active scheme, swap the shoulder (WoW centres it, 0), and clear the smart
   * pivot state so it restarts after the next orbit-free second.
   */
  onSchemeChanged(): void {
    const classic = this.mode === 'classic';
    this.zoomTarget = this.zoomCur = this.loadZoom();
    this.shoulderCentred = false;
    if (classic) {
      if (this.shoulderSide) this.savedSide = this.shoulderSide;
      this.shoulderSide = 0;
      this.pitch = this.profile.restPitch;
    } else {
      this.shoulderSide = this.savedSide || 1;
    }
    this.follow.active = false;
    this.idleOrbit = 0;
  }

  /** Zoom to start from for the active scheme: `cameraDistance` (Aksiyon) or `cameraDistanceWow` (WoW), clamped to its profile. */
  private loadZoom(): number {
    const p = this.profile;
    if (this.mode === 'classic') return clamp(wowData()?.cameraDistanceWow ?? p.zoomDefault, p.zoomMin, p.zoomMaxOutdoor);
    return clamp(G.settings?.data.cameraDistance || 9, p.zoomMin, p.zoomMaxOutdoor);
  }

  setTarget(obj: THREE.Object3D | null): void {
    this.target = obj;
  }

  /** Ray used for aiming (through the crosshair in action mode, through the cursor in classic mode). */
  getAimRay(out = new THREE.Ray()): THREE.Ray {
    if (this.mode === 'classic' && !this.orbiting && G.input && !G.input.pointerOverUI) {
      this.camera.updateMatrixWorld();
      _ndc.set(G.input.ndcX, G.input.ndcY);
      _ray.setFromCamera(_ndc, this.camera);
      out.origin.copy(_ray.ray.origin);
      out.direction.copy(_ray.ray.direction);
      return out;
    }
    out.origin.copy(this.aimOrigin);
    out.direction.copy(this.aimDir);
    return out;
  }

  /**
   * Recompute the clean aim pose from the CURRENT yaw/pitch. PlayerController calls it right after handleInput() so skills
   * fired this frame aim where the crosshair points now instead of where it pointed one frame ago (fast mouse flicks).
   */
  refreshAim(): void {
    if (!this.pivotReady) return;
    const floorY = this.groundAt(this.pivot.x, this.pivot.z) + 0.45;
    const minPitch = Math.max(-0.95, Math.asin(clamp((floorY - this.pivot.y) / Math.max(1, this.zoomCur), -1, 1)));
    this.pitch = clamp(this.pitch, minPitch, this.pitchUpLimit(this.ceilCap(), minPitch));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _fwd.set(-Math.sin(this.yaw) * cp, -sp, -Math.cos(this.yaw) * cp);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _pos.copy(this.pivot).addScaledVector(_fwd, -this.zoomCur).addScaledVector(_right, this.shoulderCur);
    if (this.colFrac < 0.999) {
      _v.copy(_pos).sub(this.pivot).multiplyScalar(this.colFrac);
      _pos.copy(this.pivot).add(_v);
    }
    if (Math.abs(this.punchOff) > 0.001) _pos.addScaledVector(_fwd, this.punchOff);
    const gy = this.groundAt(_pos.x, _pos.z) + 0.35;
    if (_pos.y < gy) _pos.y = gy;
    this.aimOrigin.copy(_pos);
    this.aimDir.copy(_fwd);
  }

  /** Horizontal forward/right vectors of the camera (movement basis). */
  getBasis(forward = new THREE.Vector3(), right = new THREE.Vector3()): { forward: THREE.Vector3; right: THREE.Vector3 } {
    forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(-forward.z, 0, forward.x);
    return { forward, right };
  }

  /** The clean (shake-free) pivot the camera orbits (for aim / hard-target framing). */
  getPivot(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.pivot);
  }

  /** Yaw a character must have to face the same way the camera looks. */
  get faceYaw(): number {
    return this.yaw + Math.PI;
  }

  /** True while a lock-on target is set (GDD_LIFE §4.7). */
  get lockedOn(): boolean {
    return this.lockOnTarget !== null;
  }

  /** True while the boss intro pass runs (GDD_LIFE §4.12). */
  get cinematicActive(): boolean {
    return this.cine !== null;
  }

  /**
   * Screen shake. intensity ~0.05 (light hit) .. 0.5 (slam) .. 1 (ultimate); duration seconds. Scaled by settings.screenShake.
   * GDD_LIFE §4.11 budget: each entry <= 0.7, the active sum <= 0.85, at most one new entry per 60 ms (extras merge by max), and
   * the trauma added per sliding second is capped at 2.2 (beyond it new shakes are halved for 1 s).
   */
  shake(intensity: number, duration: number): void {
    const k = G.settings?.data.screenShake ?? 0.7;
    let amp = intensity * k;
    if (amp <= 0.002 || duration <= 0) return;
    const now = this.clock;
    this.budget = this.budget.filter((b) => now - b.t < 1);
    let spent = 0;
    for (const b of this.budget) spent += b.amp;
    if (now < this.halfUntil) amp *= 0.5;
    else if (spent + amp > SHAKE_BUDGET) { this.halfUntil = now + 1; amp *= 0.5; }
    amp = Math.min(amp, SHAKE_ENTRY_CAP);
    let active = 0;
    for (const s of this.shakes) {
      const e = 1 - s.t / s.dur;
      active += s.amp * e * e;
    }
    amp = Math.min(amp, Math.max(0, SHAKE_CAP - active));
    if (amp <= 0.002) return;
    this.budget.push({ t: now, amp });
    const last = this.shakes[this.shakes.length - 1];
    if (last && now - this.lastShakeAt < SHAKE_MERGE_S) {
      last.amp = Math.max(last.amp, amp);
      last.dur = Math.max(last.dur, duration);
    } else {
      if (this.shakes.length >= MAX_SHAKES) this.shakes.shift();
      this.shakes.push({ amp, dur: Math.max(0.05, duration), t: 0 });
    }
    this.lastShakeAt = now;
    // heavier shakes also thump the camera forward (impact punch)
    if (intensity > 0.12) this.punch(Math.min(0.7, intensity * 0.7) * k);
  }

  /**
   * Directional kick (GDD_LIFE §4.11): the world-space direction (dx, dz) of a blow is converted to camera axes and pushes a 2-D spring
   * offset, so the direction of the hit is readable. The offset is visual only (the aim pose does not move).
   */
  kick(dx: number, dz: number, amount: number): void {
    if (!(amount > 0)) return;
    const k = G.settings?.data.screenShake ?? 0.7;
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uz = dz / l;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.kickX = clamp(this.kickX + (ux * rx + uz * rz) * amount * k, -0.5, 0.5);
    this.kickY = clamp(this.kickY + (ux * fx + uz * fz) * amount * k, -0.5, 0.5);
  }

  /** Quick dolly-in thump (metres) that springs back. Negative pushes the camera away. */
  punch(strength: number): void {
    this.punchVel += strength * 26;
  }

  /** FOV kick in degrees (dodge, big hits); springs back to the settings FOV. Total offset stays clamped to [-6, +8]. */
  kickFov(deg: number): void {
    this.fovVel += deg * 16;
  }

  /** Nudge the orbit toward a yaw (hard-target framing). Pass null to stop. strength 0..1 per second. */
  setAssist(yaw: number | null, strength = 2.5, pitch: number | null = null): void {
    this.assistYaw = yaw;
    this.assistPitch = pitch;
    this.assistK = strength;
  }

  /**
   * Lock-on framing (GDD_LIFE §4.7): yaw toward the midpoint of player and target (both stay in frame), pitch so the target's chest sits
   * near 42% of the screen, and an auto-zoom bias. Pass null to release. Replaces `setAssist` for hard targets.
   */
  setLockOn(target: Actor | null): void {
    this.lockOnTarget = target;
    if (!target) this.lockOverT = 0;
    else this.lockSuspendT = 0;
  }

  /** Auto-follow input from PlayerController: `active` while steering forward, `yaw` = the character's facing yaw + PI, `speed` m/s. */
  setFollow(active: boolean, yaw: number, speed: number): void {
    this.follow.active = active;
    this.follow.yaw = yaw;
    this.follow.speed = speed;
  }

  /** Shoulder swap tap (GDD_LIFE §4.5): toggles right <-> left; while centred it returns to the last side. */
  tapShoulder(): void {
    if (this.shoulderCentred) {
      this.shoulderCentred = false;
      this.shoulderSide = this.savedSide || 1;
    } else {
      this.shoulderSide = -(this.shoulderSide || 1);
    }
    this.shoulderCooldown = 0.5;
  }

  /** Shoulder swap hold (0.4 s): centres the camera behind the character. */
  holdShoulder(): void {
    if (!this.shoulderCentred) this.savedSide = this.shoulderSide || this.savedSide || 1;
    this.shoulderCentred = true;
    this.shoulderSide = 0;
  }

  /** Snap behind the target immediately (scene start, teleport). */
  snap(): void {
    const t = this.target;
    if (t) {
      const s = smoothstep(3, 14, this.zoomCur);
      this.pivot.set(t.position.x, t.position.y + this.pivotHeight + lerp(-0.25, 0.6, s), t.position.z);
      this.yaw = t.rotation.y + Math.PI;
    }
    const rest = this.profile.restPitch;
    this.pitch = Number.isNaN(rest) ? 0.42 : rest;
    this.pivotReady = !!t;
    this.colFrac = 1;
    this.colHold = 0;
    this.shakes.length = 0;
    this.punchOff = this.punchVel = 0;
    this.fovOffset = this.fovVel = 0;
    this.kickX = this.kickY = this.kickVX = this.kickVY = 0;
    this.laX = this.laZ = 0;
    this.tgtVX = this.tgtVZ = 0;
    this.lastTX = NaN;
    this.lastTZ = NaN;
    this.zoomCur = this.zoomTarget;
    this.shoulderCur = this.shoulderSide * SHOULDER;
    this.fader.clear(); // a teleport must not leave faded scenery behind
    this.place(0, true);
  }

  /** Consume mouse/wheel input once per frame (PlayerController calls it first so movement uses this frame's yaw). */
  handleInput(dt: number): void {
    const frame = G.engine?.frame ?? 0;
    if (frame === this.lastInputFrame) return;
    this.lastInputFrame = frame;
    this.clock += dt;
    const input = G.input;
    const s = G.settings?.data;
    if (!input) return;

    const wow = this.mode === 'classic';
    const p = this.profile;

    // zoom (CONTROLS_WOW §7.1: WoW steps at least 0.4 m per notch)
    const w = input.wheel;
    if (w !== 0 && !(G.ui?.wantsCursor?.() ?? false)) {
      let next = this.zoomTarget * (1 + w * 0.12);
      if (wow && Math.abs(next - this.zoomTarget) < WOW_MIN_ZOOM_STEP) next = this.zoomTarget + Math.sign(w) * WOW_MIN_ZOOM_STEP;
      this.zoomTarget = clamp(next, p.zoomMin, p.zoomMaxOutdoor);
      this.zoomSaveTimer = 0.8;
      this.lastWheelAt = this.clock;
      // a wheel input drops the combat zoom bias (GDD_LIFE §4.6)
      this.combatHold = 0;
      this.combatBias = 0;
      // a wheel move also stops the WoW smart pivot (CONTROLS_WOW §7.4)
      if (wow) this.idleOrbit = 0;
    }
    if (input.pressed('zoomIn')) this.zoomTarget = clamp(this.zoomTarget - 1.5, p.zoomMin, p.zoomMaxOutdoor);
    if (input.pressed('zoomOut')) this.zoomTarget = clamp(this.zoomTarget + 1.5, p.zoomMin, p.zoomMaxOutdoor);
    if (this.zoomSaveTimer >= 0) {
      this.zoomSaveTimer -= dt;
      if (this.zoomSaveTimer < 0) {
        try {
          const v = Math.round(this.zoomTarget * 10) / 10;
          if (wow) (G.settings as unknown as WowSettingsWriter).set('cameraDistanceWow', v);
          else G.settings.set('cameraDistance', v);
        } catch { /* ignore */ }
      }
    }

    // orbit (GDD_LIFE §4.8: sensitivity curves, precision modes, optional acceleration and smoothing)
    // WoW orbits while LMB or RMB is held (CONTROLS_WOW §7.1); Aksiyon orbits under the pointer lock.
    const action = this.mode === 'action';
    this.orbiting = action ? input.isLocked() : (input.keyDown('Mouse0') || input.keyDown('Mouse2'));
    let orbited = false;
    if (this.orbiting) {
      const dx = clamp(input.mouseDX, -160, 160);
      const dy = clamp(input.mouseDY, -160, 160);
      if (dx !== 0 || dy !== 0) {
        const accelK = s?.cameraAccel ?? 0;
        const accel = (n: number) => 1 + accelK * 0.6 * smoothstep(8, 60, Math.abs(n));
        const base = LOOK_SENS * (s?.mouseSensitivity ?? 1) * ((s?.fov ?? 60) / 60);
        const prec = (this.aimHeld ? 0.65 : 1) * (this.lockOnTarget ? 0.8 : 1);
        const yawPx = base * prec * accel(dx);
        const pitchPx = base * prec * accel(dy) * (s?.cameraSensYRatio ?? 0.85);
        let ex = dx, ey = dy;
        const tau = (s?.cameraSmoothing ?? 0) * 0.1;
        if (tau > 0.001) {
          const kk = 1 - Math.exp(-dt / tau);
          this.smDx += (dx - this.smDx) * kk;
          this.smDy += (dy - this.smDy) * kk;
          ex = this.smDx;
          ey = this.smDy;
        } else {
          this.smDx = dx;
          this.smDy = dy;
        }
        this.yaw -= ex * yawPx;
        this.pitch += ey * pitchPx * (s?.invertY ? -1 : 1);
        this.idleLook = 0;
        orbited = true;
      }
    }
    // WoW: any held mouse button counts as orbit input for the smart pivot (CONTROLS_WOW §7.4)
    if (orbited || (wow && this.orbiting)) this.idleOrbit = 0;
    else this.idleOrbit += dt;
    this.idleLook = Math.min(1, this.idleLook + dt * 2.5);
    if (this.deathCam) this.yaw += 0.12 * dt; // GDD_LIFE §4.13: slow orbit while dead

    // hide the cursor while orbiting in classic mode; a click without drag never hides it (CONTROLS_WOW §4.3)
    const wantHide = !action && this.orbiting && (orbited || this.hideCursor);
    if (wantHide !== this.hideCursor) {
      this.hideCursor = wantHide;
      try {
        G.engine.canvas.style.cursor = wantHide ? 'none' : '';
      } catch { /* ignore */ }
    }

    // lock-on framing (GDD_LIFE §4.7): suspended for 1.5 s after an orbit > 14 deg away for more than 0.5 s
    const lt = this.lockOnTarget;
    const t = this.target;
    if (this.lockSuspendT > 0) this.lockSuspendT -= dt;
    if (lt && t && p.lockOnFraming) {
      if (this.orbiting && Math.abs(angleDiff(this.yaw, this.lockYawWant)) > 14 * Math.PI / 180) this.lockOverT += dt;
      else this.lockOverT = Math.max(0, this.lockOverT - dt * 2);
      if (this.lockOverT > 0.5) { this.lockSuspendT = 1.5; this.lockOverT = 0; }
      if (this.lockSuspendT <= 0) {
        const px = t.position.x, pz = t.position.z;
        const mx = lerp(px, lt.position.x, 0.62), mz = lerp(pz, lt.position.z, 0.62);
        this.lockYawWant = Math.atan2(-(mx - px), -(mz - pz));
        this.yaw += angleDiff(this.yaw, this.lockYawWant) * (1 - Math.exp(-3.2 * dt));
        const dist = Math.hypot(lt.position.x - px, lt.position.z - pz) + 0.01;
        const chestY = lt.position.y + lt.height * 0.55;
        const pivotY = t.position.y + this.pivotHeight;
        const wantPitch = clamp(Math.atan2(pivotY - chestY, dist) + 0.085, -0.15, 0.7);
        this.pitch += (wantPitch - this.pitch) * (1 - Math.exp(-2.0 * dt));
      }
    }

    // hard-target framing (legacy setAssist, only while the player is not steering the camera and no lock-on is set)
    if (!lt && this.assistYaw !== null && this.idleLook >= 0.7) {
      this.yaw += angleDiff(this.yaw, this.assistYaw) * (1 - Math.exp(-this.assistK * dt));
      if (this.assistPitch !== null) this.pitch += (this.assistPitch - this.pitch) * (1 - Math.exp(-this.assistK * 0.6 * dt));
    }

    // auto-follow (GDD_LIFE §4.4): swing behind the character while running forward, after 1.2 s without orbit input
    if (!wow && s?.cameraAutoFollow && this.follow.active && !lt && !this.orbiting && this.idleOrbit >= 1.2 && !this.shiftLock) {
      const sf = clamp(this.follow.speed / 7, 0, 1);
      const d = angleDiff(this.yaw, this.follow.yaw);
      const dead = 6 * Math.PI / 180;
      if (Math.abs(d) > dead && sf > 0) {
        const step = Math.sign(d) * (Math.abs(d) - dead);
        const maxStep = 0.9 * sf * dt;
        this.yaw += clamp(step, -maxStep, maxStep);
      }
    }
    // WoW smart pivot (CONTROLS_WOW §7.4): while running forward with no mouse button held, ease behind the character's facing.
    // Strafing and back-pedalling never reach here (follow.active is off for them, per §5).
    if (wow && wowData()?.cameraSmartPivot !== false && this.follow.active && !lt && !this.orbiting && !this.deathCam && this.cine === null
      && this.follow.speed > 1.5 && this.idleOrbit >= 0.8) {
      const d = angleDiff(this.yaw, this.follow.yaw);
      if (Math.abs(d) > SMART_DEAD) {
        const sf = clamp(this.follow.speed / 7, 0.4, 1);
        const step = (Math.abs(d) - SMART_DEAD) * (1 - Math.exp(-SMART_EASE * dt));
        this.yaw += Math.sign(d) * Math.min(step, SMART_MAX_RATE * sf * dt);
      }
    }
    this.yaw = ((this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  }

  update(dt: number): void {
    this.handleInput(dt);
    const t = this.target;
    if (t && !this.pivotReady) {
      this.snap();
      return;
    }
    const s = G.settings?.data;
    if (t) {
      const px = t.position.x, pz = t.position.z;
      // planar velocity of the target (position deltas, smoothed)
      if (Number.isFinite(this.lastTX) && dt > 1e-4) {
        const vx = (px - this.lastTX) / dt, vz = (pz - this.lastTZ) / dt;
        const kv = 1 - Math.exp(-10 * dt);
        this.tgtVX += (vx - this.tgtVX) * kv;
        this.tgtVZ += (vz - this.tgtVZ) * kv;
      }
      this.lastTX = px;
      this.lastTZ = pz;
      const sp = Math.hypot(this.tgtVX, this.tgtVZ);

      // look-ahead (GDD_LIFE §4.1): leads toward the camera's forward half-plane, not while locked on
      let wantLX = 0, wantLZ = 0;
      if (s?.cameraLookAhead !== false && this.profile.lookAhead && !this.lockOnTarget && sp > 0.3) {
        const amt = clamp(sp * 0.10, 0, 0.9);
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const dot = (this.tgtVX / sp) * fx + (this.tgtVZ / sp) * fz;
        if (dot > 0.3) {
          wantLX = (this.tgtVX / sp) * amt;
          wantLZ = (this.tgtVZ / sp) * amt;
        }
      }
      const kla = 1 - Math.exp(-3 * dt);
      this.laX += (wantLX - this.laX) * kla;
      this.laZ += (wantLZ - this.laZ) * kla;

      // follow: horizontal faster when slow, lagging a touch at speed (GDD_LIFE §4.1); vertical slower, dead zone in the air
      const kRate = 13 - 3 * clamp((sp - 5) / 4, 0, 1);
      const kx = 1 - Math.exp(-kRate * dt);
      this.pivot.x += (px + this.laX - this.pivot.x) * kx;
      this.pivot.z += (pz + this.laZ - this.pivot.z) * kx;
      const zs = smoothstep(3, 14, this.zoomCur);
      const wantY = t.position.y + this.pivotHeight + lerp(-0.25, 0.6, zs);
      const airborne = t.position.y - this.groundAt(px, pz) > 0.15;
      let ey = wantY - this.pivot.y;
      if (airborne) ey = Math.sign(ey) * Math.max(0, Math.abs(ey) - 0.35);
      this.pivot.y += ey * (1 - Math.exp(-(airborne ? 5.5 : 6.5) * dt));
      // never drift far from the target (teleports, forced moves)
      const ex = px - this.pivot.x, ez = pz - this.pivot.z;
      const e2 = ex * ex + ez * ez;
      if (e2 > 36) {
        const sc = 6 / Math.sqrt(e2);
        this.pivot.x = px - ex * sc;
        this.pivot.z = pz - ez * sc;
      }

      // lock-on auto-zoom bias (GDD_LIFE §4.7): clamp(0.35 * distance + 0.6 * targetHeight, 0, 6)
      const lt = this.lockOnTarget;
      let wantBias = 0;
      if (lt) wantBias = clamp(0.35 * Math.hypot(lt.position.x - px, lt.position.z - pz) + 0.6 * lt.height, 0, 6);
      this.lockBias = damp(this.lockBias, wantBias, 1.25, dt);

      // combat zoom (GDD_LIFE §4.6): >= 3 aggroed enemies within 12 m => +1.5 m for 3 s after the last one
      if (s?.cameraCombatZoom !== false && this.profile.combatZoom) {
        this.combatScanT -= dt;
        if (this.combatScanT <= 0) {
          this.combatScanT = 0.25;
          let near = 0;
          for (const e of G.world?.enemies ?? []) {
            if (e.isDead || e.removed || !e.aggroed) continue;
            if (Math.hypot(e.position.x - px, e.position.z - pz) <= 12) near++;
          }
          if (near >= 3) this.combatHold = 3;
        }
      }
      if (this.combatHold > 0) this.combatHold -= dt;
      this.combatBias = damp(this.combatBias, this.combatHold > 0 ? 1.5 : 0, 1 / 1.5, dt);
    }
    this.updateShoulder(dt);
    this.place(dt, false);
  }

  /** Auto shoulder swap (GDD_LIFE §4.5): every 0.2 s, when the shoulder side is blocked within 0.9 m and the other side is clear. */
  private updateShoulder(dt: number): void {
    if (this.shoulderCooldown > 0) this.shoulderCooldown -= dt;
    if (G.settings?.data.cameraAutoShoulder === false || this.mode !== 'action' || !this.pivotReady || this.shoulderCentred) return;
    this.autoShoulderT -= dt;
    if (this.autoShoulderT > 0) return;
    this.autoShoulderT = 0.2;
    if (this.shoulderCooldown > 0) return;
    const side = this.shoulderSide || 1;
    const here = this.probeDist(side);
    if (here === null || here > 0.9) return;
    if (this.probeDist(-side) !== null) return;
    this.shoulderSide = -side;
    this.shoulderCooldown = 1.5;
  }

  /** Distance (m) to the first solid hit on the pivot -> right*side probe, or null when clear. */
  private probeDist(side: number): number | null {
    const len = SHOULDER + 0.5;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const rx = cy * side, rz = -sy * side;
    let best = Infinity;
    const world = G.world;
    if (world) {
      const x1 = this.pivot.x + rx * len, z1 = this.pivot.z + rz * len;
      const f = world.vertical
        ? world.nav.raycastY(this.pivot.x, this.pivot.y, this.pivot.z, x1, this.pivot.y, z1)
        : world.nav.raycast(this.pivot.x, this.pivot.z, x1, z1);
      if (f < 1) best = Math.min(best, f * len);
    }
    if (this.occluders && this.occluders.length) {
      _occDir.set(rx, 0, rz);
      _occRay.set(this.pivot, _occDir);
      _occRay.near = OCC_MIN_HIT * 0.5;
      _occRay.far = len;
      const hits = _occRay.intersectObjects(this.occluders, false);
      if (hits.length) best = Math.min(best, hits[0].distance);
    }
    return best === Infinity ? null : best;
  }

  /** Compute and apply the camera pose from pivot/yaw/pitch/zoom (+ collision, shake, kicks, fov and the cinematic pass). */
  private place(dt: number, instant: boolean): void {
    const action = this.mode === 'action';
    const cam = this.camera;
    const s = G.settings?.data;

    const p = this.profile;
    const wow = this.mode === 'classic';

    // zoom maximum: WoW indoors follows the ceiling (CONTROLS_WOW §7.1), slewed at 4 m/s; Aksiyon stays at 18 m.
    // Vertical dungeons also cap it by the room's headroom (§14.4), so the slew covers both.
    const world = G.world;
    const vert = world?.vertical === true;
    const capY = this.ceilCap();
    this.dbgCapY = capY;
    const goalMax = this.zoomGoalMax(capY);
    this.zoomMaxCur = instant ? goalMax : this.zoomMaxCur + clamp(goalMax - this.zoomMaxCur, -ZOOM_MAX_SLEW * dt, ZOOM_MAX_SLEW * dt);

    // zoom: the target, plus combat and lock-on biases; the death cam pulls in to 5.5 m
    this.zoomTarget = clamp(this.zoomTarget, p.zoomMin, p.zoomMaxOutdoor);
    const zoomWant = this.deathCam ? 5.5 : clamp(this.zoomTarget + this.combatBias + this.lockBias, p.zoomMin, this.zoomMaxCur);
    this.zoomCur = instant ? zoomWant : damp(this.zoomCur, zoomWant, this.deathCam ? 2.5 : 12, dt);
    this.distance = this.zoomCur;
    const zs = smoothstep(3, 14, this.zoomCur);

    // pitch: rest pitch by zoom (GDD_LIFE §4.6); pulled toward it after a wheel move, eased after 2 s without orbit when auto-following.
    // WoW has neither (CONTROLS_WOW §7.1): its rest pitch is set on snap() and the player's pitch is kept.
    const restPitch = lerp(0.26, 0.62, zs);
    if (!instant && !this.orbiting) {
      if (p.wheelPitchPull && this.clock - this.lastWheelAt < 0.6) {
        this.pitch += clamp((restPitch - this.pitch) * (1 - Math.exp(-3.5 * dt)) * 0.5, -0.035, 0.035);
      } else if (p.pitchAutoReturn && this.follow.active && this.idleOrbit >= 2) {
        this.pitch += clamp(restPitch - this.pitch, -0.25 * dt, 0.25 * dt);
      }
    }
    // pitch limits depend on the distance so the camera never dips under the floor
    const floorY = this.groundAt(this.pivot.x, this.pivot.z) + 0.45;
    const minPitch = Math.max(-0.95, Math.asin(clamp((floorY - this.pivot.y) / Math.max(1, this.zoomCur), -1, 1)));
    this.pitch = clamp(this.pitch, minPitch, this.pitchUpLimit(capY, minPitch));

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _fwd.set(-Math.sin(this.yaw) * cp, -sp, -Math.cos(this.yaw) * cp);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // shoulder: the offset lerps to 0 when the effective distance is under 1.8 m, so the lens never clips a wall (GDD_LIFE §4.2)
    const near = smoothstep(1.0, 1.8, this.zoomCur * this.colFrac);
    const wantShoulder = action ? this.shoulderSide * SHOULDER * near : 0;
    this.shoulderCur = instant ? wantShoulder : damp(this.shoulderCur, wantShoulder, 9, dt);

    // desired camera position (before collision)
    _pos.copy(this.pivot).addScaledVector(_fwd, -this.zoomCur).addScaledVector(_right, this.shoulderCur);

    // wall collision: shorten the pivot -> camera segment where the nav grid blocks it
    // vertical dungeons use the height-aware ray (§5.2): LOW rails are looked over, tall walls still block
    let fracNav = 1;
    if (this.collide && world) {
      const dx = _pos.x - this.pivot.x, dz = _pos.z - this.pivot.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        const f = vert
          ? world.nav.raycastY(this.pivot.x, this.pivot.y, this.pivot.z, _pos.x, _pos.y, _pos.z)
          : world.nav.raycast(this.pivot.x, this.pivot.z, _pos.x, _pos.z);
        if (f < 1) {
          let blocks = true;
          if (this.collideMaxRayHeight < 1e6) {
            // the ray rises from the pivot to the camera: a blocker it passes high above is a low prop, not a wall
            const hy = this.pivot.y + (_pos.y - this.pivot.y) * f;
            blocks = hy - this.groundAt(this.pivot.x + dx * f, this.pivot.z + dz * f) <= this.collideMaxRayHeight;
          }
          if (blocks) fracNav = clamp(f - 0.55 / len, 0.12, 1);
        }
      }
    }
    // WoW (CONTROLS_WOW §7.3): two lateral probes at +-0.35 m so the lens does not clip a wall corner
    if (wow && this.collide && world) {
      const dx = _pos.x - this.pivot.x, dz = _pos.z - this.pivot.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        for (const side of [-LATERAL_PROBE, LATERAL_PROBE]) {
          const f = vert
            ? world.nav.raycastY(this.pivot.x + rx * side, this.pivot.y, this.pivot.z + rz * side, _pos.x + rx * side, _pos.y, _pos.z + rz * side)
            : world.nav.raycast(this.pivot.x + rx * side, this.pivot.z + rz * side, _pos.x + rx * side, _pos.z + rz * side);
          if (f < 1) fracNav = Math.min(fracNav, clamp(f - 0.55 / len, 0.12, 1));
        }
      }
    }
    // scene occluders (real geometry, so heights count): pull-in (Town), or fade the hits (dungeons / open world)
    const pull = this.occluderMode === 'pull';
    let fracProp = 1;
    if (pull && this.occluders && this.occluders.length) fracProp = this.occluderFrac(_pos);
    // ceilings: WoW (CONTROLS_WOW §7.3) always; vertical dungeons (§14.3) for both schemes. capY is Infinity for flat maps, open air,
    // the death cam and the boss intro, so those paths stay as they were.
    const fracCeil = wow || capY !== Infinity ? this.ceilingFrac(_pos) : 1;
    // raised floors between the pivot and the camera (§14.5); flat maps always 1
    const fracGround = this.groundFrac(_pos);
    const frac = Math.min(fracNav, fracProp, fracCeil, fracGround);
    this.dbgFracCeil = fracCeil;
    // pull in instantly; after the last block hold 0.15 s, then ease out (2.5/s for props, 4/s for nav walls)
    if (instant || frac < this.colFrac) {
      this.colFrac = frac;
      this.colHold = COL_HOLD;
      this.colByProp = fracProp < fracNav && fracProp <= fracCeil;
    } else if (this.colHold > 0) {
      this.colHold -= dt;
    } else {
      this.colFrac += (frac - this.colFrac) * (1 - Math.exp(-(this.colByProp ? 2.5 : 4) * dt));
    }
    if (this.colFrac < 0.999) {
      _v.copy(_pos).sub(this.pivot).multiplyScalar(this.colFrac);
      _pos.copy(this.pivot).add(_v);
    }
    const fadeOn = s?.occluderFade !== false;
    if (!pull && fadeOn) {
      if (instant) this.fader.clear();
      else this.fader.update(dt, this.occluders, this.pivot, _pos);
    } else if (this.fader.activeCount) this.fader.clear();

    // impact punch (spring toward the pivot)
    if (!instant) {
      const k = 260, c = 21;
      this.punchVel += (-k * this.punchOff - c * this.punchVel) * dt;
      this.punchOff += this.punchVel * dt;
      this.punchOff = clamp(this.punchOff, -0.7, 0.9);
    }
    if (Math.abs(this.punchOff) > 0.001) _pos.addScaledVector(_fwd, this.punchOff);

    // floor clamp
    const gy = this.groundAt(_pos.x, _pos.z) + 0.35;
    if (_pos.y < gy) _pos.y = gy;

    // clean pose = aiming pose (no shake, no kick)
    this.aimOrigin.copy(_pos);
    this.aimDir.copy(_fwd);

    // directional kick spring (visual only, applied after the aim pose is stored)
    if (!instant) {
      this.kickVX += (-KICK_K * this.kickX - KICK_C * this.kickVX) * dt;
      this.kickX += this.kickVX * dt;
      this.kickVY += (-KICK_K * this.kickY - KICK_C * this.kickVY) * dt;
      this.kickY += this.kickVY * dt;
      if (Math.abs(this.kickX) < 1e-5 && Math.abs(this.kickVX) < 1e-4) { this.kickX = 0; this.kickVX = 0; }
      if (Math.abs(this.kickY) < 1e-5 && Math.abs(this.kickVY) < 1e-4) { this.kickY = 0; this.kickVY = 0; }
    }
    if (Math.abs(this.kickX) > 1e-4 || Math.abs(this.kickY) > 1e-4) _pos.addScaledVector(_right, this.kickX).addScaledVector(_fwd, this.kickY);

    // camera pose: normal, blended toward the boss-intro framing while it plays
    _look.copy(_pos).add(_fwd);
    let cineFov = 0;
    if (this.cine) {
      const c = this.cine;
      if (!instant) c.t += dt;
      this.updateCinematic(c);
      const w = this.cineWeight(c);
      if (w > 0.0005 && this.cine) {
        const pose = this.cinePose(c);
        _cp.copy(_pos).lerp(pose.pos, w);
        _cl.copy(_look).lerp(pose.look, w);
        cineFov = pose.fovDelta * w;
        cam.position.copy(_cp);
        cam.lookAt(_cl);
      } else {
        cam.position.copy(_pos);
        cam.lookAt(_look);
      }
    } else {
      cam.position.copy(_pos);
      cam.lookAt(_look);
    }

    // shake (trauma sum with smooth noise)
    let mag = 0;
    if (this.shakes.length) {
      this.shakeClock += dt;
      for (let i = this.shakes.length - 1; i >= 0; i--) {
        const sh = this.shakes[i];
        sh.t += dt;
        if (sh.t >= sh.dur) {
          this.shakes.splice(i, 1);
          continue;
        }
        const e = 1 - sh.t / sh.dur;
        mag += sh.amp * e * e;
      }
      mag = Math.min(1, mag);
    }
    if (mag > 0.0005) {
      const m = Math.pow(mag, 0.85);
      const tt = this.shakeClock * 26;
      cam.translateX(noise1(tt, 1) * 0.5 * m);
      cam.translateY(noise1(tt, 2) * 0.42 * m);
      cam.rotateZ(noise1(tt, 3) * 0.05 * m);
      cam.rotateX(noise1(tt, 4) * 0.012 * m);
      cam.rotateY(noise1(tt, 5) * 0.012 * m);
    }

    // fov: settings + zoom curve (GDD_LIFE §4.6) + death cam + FOV spring + cinematic
    if (!instant) {
      const k = 150, c = 17;
      this.fovVel += (-k * this.fovOffset - c * this.fovVel) * dt;
      this.fovOffset += this.fovVel * dt;
      this.fovOffset = clamp(this.fovOffset, -6, 8);
    }
    const fovBase = (s?.fov ?? 60) + lerp(-4, 6, zs) + (this.deathCam ? 2 : 0);
    const fov = fovBase + this.fovOffset + cineFov;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    // audio listener: at the player (so attenuation feels right), facing where the camera looks
    const t = this.target;
    if (t && G.audio) G.audio.setListener(t.position.x, t.position.y + 1.5, t.position.z, this.yaw + Math.PI);
  }

  // ---- cinematic boss intro (GDD_LIFE §4.12) ----------------------------------------------------------------------------

  /** Start a cinematic pass (non-blocking; replaces one that is still running). */
  playCinematic(spec: CinematicSpec): void {
    this.cine = { spec, t: 0, skipAt: -1, skipW: 0, mouseAcc: 0, shook: false };
  }

  /** Ease the running pass out over 0.25 s (mouse move, skill or dodge press). */
  skipCinematic(): void {
    const c = this.cine;
    if (!c || c.skipAt >= 0) return;
    c.skipAt = c.t;
    c.skipW = this.cineWeight(c);
  }

  private onBossEngaged(bossId: string, entityId: number): void {
    const mode = G.settings?.data.bossIntroCam ?? 'short';
    if (mode === 'off' || introSeen.has(bossId)) return;
    const boss = G.world?.get<Enemy>(entityId);
    if (!boss || boss.kind !== 'enemy' || !boss.isBoss) return;
    const intro = boss.bossDef?.introCam;
    if (intro === false) return;
    introSeen.add(bossId);
    // GDD_LIFE §4.12: 'short' 2.2 s, 'full' 3.4 s; a BossDef.introCam.hold overrides the hold
    const holdOverride = typeof intro === 'object' && intro.hold !== undefined ? intro.hold : undefined;
    const hold = holdOverride ?? (mode === 'full' ? 2.0 : 1.1);
    this.playCinematic({
      focus: () => new THREE.Vector3(boss.position.x, boss.position.y, boss.position.z),
      h: Math.max(1, boss.height),
      blendIn: 0.5,
      hold,
      blendOut: 0.6,
      orbitDeg: 18,
      dolly: 0.8,
      fovDelta: -6,
      skippable: true,
    });
  }

  /** Weight of the pass at its own time: blend in, hold, blend out (or the skip ease-out). */
  private cineWeight(c: CineState): number {
    const sp = c.spec;
    const t = c.t;
    if (c.skipAt >= 0) {
      const k = clamp((t - c.skipAt) / 0.25, 0, 1);
      return c.skipW * (1 - easeIO(k));
    }
    const bi = sp.blendIn, ho = sp.hold, bo = sp.blendOut;
    if (t < bi) return easeIO(t / Math.max(0.001, bi));
    if (t < bi + ho) return 1;
    const k = (t - bi - ho) / Math.max(0.001, bo);
    return k >= 1 ? 0 : 1 - easeIO(k);
  }

  private updateCinematic(c: CineState): void {
    const sp = c.spec;
    const input = G.input;
    if (input && sp.skippable && c.skipAt < 0) {
      c.mouseAcc += Math.abs(input.mouseDX) + Math.abs(input.mouseDY);
      if (c.mouseAcc > 15 || SKIP_ACTIONS.some((a) => input.pressed(a))) this.skipCinematic();
    }
    if (!c.shook && c.t >= 0.55) {
      c.shook = true;
      G.events.emit('camera:shake', { intensity: 0.3, duration: 0.3 });
    }
    const end = c.skipAt >= 0 ? c.skipAt + 0.25 : sp.blendIn + sp.hold + sp.blendOut;
    if (c.t >= end) this.cine = null;
  }

  /** Framing of the pass: at the focus, dolly and orbit during the hold, camera 25 deg off the player line, -6 deg FOV. */
  private cinePose(c: CineState): { pos: THREE.Vector3; look: THREE.Vector3; fovDelta: number } {
    const sp = c.spec;
    if (typeof sp.focus === 'function') _cf.copy(sp.focus());
    else _cf.copy(sp.focus.position);
    _cf.y += sp.h * 0.55;
    const p = clamp(c.t - sp.blendIn, 0, sp.hold) / Math.max(0.001, sp.hold);
    const dx = this.pivot.x - _cf.x, dz = this.pivot.z - _cf.z;
    const base = Math.atan2(dx, dz);
    const ang = base + (25 * Math.PI / 180) + (sp.orbitDeg * Math.PI / 180) * p;
    const dist = clamp(sp.h * 2.6, 6, 14) - sp.dolly * p;
    const height = sp.h * 0.45;
    _cp.set(_cf.x + Math.sin(ang) * dist, _cf.y + height, _cf.z + Math.cos(ang) * dist);
    _cl.set(_cf.x, _cf.y + 0.1 * height, _cf.z);
    return { pos: _cp.clone(), look: _cl.clone(), fovDelta: sp.fovDelta };
  }

  // ---- internals ------------------------------------------------------------------------------------------------------

  private groundAt(x: number, z: number): number {
    return G.world ? G.world.groundY(x, z) : 0;
  }

  /**
   * Zoom maximum the effective zoom may reach (CONTROLS_WOW §7.1). Aksiyon: 18 m. WoW outdoors: 30 m. WoW indoors:
   * clamp(1.35 x ceiling under the pivot, 6, 18), which is 18 when no ceiling is known (World.ceilingY = Infinity).
   */
  private zoomGoalMax(capY: number): number {
    const p = this.profile;
    let goal: number;
    if (this.mode !== 'classic' || this.outdoor) goal = p.zoomMaxOutdoor;
    else {
      const ceil = G.world ? G.world.ceilingY(this.pivot.x, this.pivot.z) : Infinity;
      goal = ceil === Infinity ? p.zoomMaxIndoor : clamp(1.35 * ceil, 6, p.zoomMaxIndoor);
    }
    // §14.4 per-room zoom ceiling: the headroom under the pivot caps the zoom (vertical dungeons, both schemes)
    if (capY !== Infinity) goal = Math.min(goal, clamp((capY - this.pivot.y) * 2.2 + 2, 5, 18));
    return goal;
  }

  /**
   * §14.1 cap: the ceiling over the pivot minus CAM_CEIL_MARGIN, in vertical dungeons only. Infinity = no cap (flat maps, open air,
   * the death cam and the boss intro, which frame the player on their own).
   */
  private ceilCap(): number {
    const world = G.world;
    if (!world || !world.vertical || this.deathCam || this.cine !== null) return Infinity;
    const c = world.ceilingY(this.pivot.x, this.pivot.z);
    return c === Infinity ? Infinity : c - VERT.CAM_CEIL_MARGIN;
  }

  /**
   * §14.2: the highest pitch allowed. The profile's maxPitch, or the elevation that keeps the camera under `capY` at the current zoom
   * (never below CAM_MIN_CEIL_PITCH, so the camera still orbits in a low room). Never below `minPitch` (the floor limit wins).
   */
  private pitchUpLimit(capY: number, minPitch: number): number {
    const maxP = this.profile.maxPitch;
    if (capY === Infinity) return maxP;
    const pitchCeil = Math.asin(clamp((capY - this.pivot.y) / Math.max(1, this.zoomCur), -1, 1));
    return Math.max(minPitch, Math.min(maxP, Math.max(pitchCeil, VERT.CAM_MIN_CEIL_PITCH)));
  }

  /**
   * §14.5: the fraction of the pivot -> camera segment before the ray dips under a raised floor (8 samples, +0.35 m clearance).
   * 1 = clear. Never below 12%, like the other fractions. Flat maps are always 1.
   */
  private groundFrac(pos: THREE.Vector3): number {
    const world = G.world;
    if (!world || !world.vertical) return 1;
    const px = this.pivot.x, py = this.pivot.y, pz = this.pivot.z;
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      const x = px + (pos.x - px) * t, y = py + (pos.y - py) * t, z = pz + (pos.z - pz) * t;
      if (y < world.groundY(x, z) + 0.35) return clamp(t - 0.04, 0.12, 1);
    }
    return 1;
  }

  /**
   * CONTROLS_WOW §7.3 / GDD §14.3: the fraction of the pivot -> wanted-camera segment that stays CAM_CEIL_MARGIN under the ceiling
   * (sampled at 0.25 / 0.5 / 0.75 / 1, then bisected). 1 = clear. Never below 12%, like the wall fraction.
   */
  private ceilingFrac(pos: THREE.Vector3): number {
    const world = G.world;
    if (!world) return 1;
    const px = this.pivot.x, py = this.pivot.y, pz = this.pivot.z;
    const bad = (t: number): boolean => {
      const x = px + (pos.x - px) * t, y = py + (pos.y - py) * t, z = pz + (pos.z - pz) * t;
      return y > world.ceilingY(x, z) - VERT.CAM_CEIL_MARGIN;
    };
    let safe = 0;
    for (const t of [0.25, 0.5, 0.75, 1]) {
      if (bad(t)) {
        let lo = safe, hi = t;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) * 0.5;
          if (bad(mid)) hi = mid;
          else lo = mid;
        }
        return Math.max(0.12, lo);
      }
      safe = t;
    }
    return 1;
  }

  /** Fraction of the pivot -> wanted-camera segment that is clear of `occluders` (1 = clear; never closer than 12% of the distance). */
  private occluderFrac(pos: THREE.Vector3): number {
    _occDir.copy(pos).sub(this.pivot);
    const len = _occDir.length();
    if (len < 0.05) return 1;
    _occDir.multiplyScalar(1 / len);
    _occRay.set(this.pivot, _occDir);
    _occRay.near = OCC_MIN_HIT;
    _occRay.far = len;
    const hits = _occRay.intersectObjects(this.occluders ?? [], false);
    if (!hits.length) return 1;
    return clamp((hits[0].distance - OCC_MARGIN) / len, 0.12, 1);
  }

  /** Debug numbers for the camera overlay (dev/player.html ?camdebug=1, dev/combat.html telemetry). */
  debugStats(): { dist: number; colFrac: number; pitch: number; fov: number; shakeUsed: number; budgetUsed: number; kick: number; lock: boolean; cine: boolean; occluders: number; capY: number; fracCeil: number } {
    let shakeUsed = 0;
    for (const s of this.shakes) {
      const e = 1 - s.t / s.dur;
      shakeUsed += s.amp * e * e;
    }
    let budgetUsed = 0;
    for (const b of this.budget) if (this.clock - b.t < 1) budgetUsed += b.amp;
    return {
      dist: this.zoomCur, colFrac: this.colFrac, pitch: this.pitch, fov: this.camera.fov, shakeUsed, budgetUsed,
      kick: Math.hypot(this.kickX, this.kickY), lock: this.lockOnTarget !== null, cine: this.cine !== null,
      occluders: this.occluders ? this.occluders.length : 0,
      capY: this.dbgCapY, fracCeil: this.dbgFracCeil,
    };
  }

  /** Remove event subscriptions (called by scenes on exit). */
  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.fader.dispose(); // restore faded scenery before the level is disposed
    this.cine = null;
    this.lockOnTarget = null;
    if (this.hideCursor) {
      try {
        G.engine.canvas.style.cursor = '';
      } catch { /* ignore */ }
      this.hideCursor = false;
    }
  }
}
