import * as THREE from 'three';
import { G } from './G';
import { isInteractable, type Interactable } from '../entities/Interactable';
import { angleDiff, clamp } from '../core/utils';
import { getItemBase } from '../data/items';
import { FEEL } from '../combat/feel';
import { SKILL_SLOT_KEYS, type AimInfo, type SkillSlotKey } from '../types/skills';
import { cycleFriendly, friendlyTargetId, selectPartySlot } from '../combat/healing';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import type { InputAction } from '../core/Input';

// ---- feel constants -------------------------------------------------------------------------------------------------
const ACCEL_TIME = 0.08;          // seconds to full speed
const DECEL_TIME = 0.055;         // seconds to a stop
const AIR_CONTROL = 0.5;
const WALK_MUL = 0.45;
const BACKPEDAL_MUL = 0.78;
const JUMP_V = 9.3;               // 1.5 m apex, ~0.65 s airtime
const GRAVITY = 28.5;
const DODGE_DIST = 5.2;
const DODGE_TIME = 0.4;
const DODGE_IFRAMES = 0.34;
const DODGE_ATTACK_AT = 0.3;      // roll-attack window (GDD 8.1)
const SOFT_TARGET_RANGE = 25;
const HARD_TARGET_RANGE = 30;
const FACE_HOLD = 0.55;           // seconds the character keeps facing the aim point after a cast
// KayKit clips are chibi-short strides: ground speed (u/s) at which each clip plays at 1.0x. Cartoony speed-up (<= 2x) is intended.
const LOCO_REF = { run: 4.0, strafe: 4.2, back: 2.0, walk: 1.7 };
const SLOT_ACTION: Record<SkillSlotKey, InputAction> = {
  lmb: 'skill_lmb', rmb: 'skill_rmb', q: 'skill_q', e: 'skill_e', r: 'skill_r', s1: 'skill_s1', s2: 'skill_s2', s3: 'skill_s3',
  m45: 'skill_m45', m90: 'skill_m90', m180: 'skill_m180', // GDD_V2 major slots (WP1 typing only; input wired by WP5)
};

type Loco = 'idle' | 'fwd' | 'back' | 'left' | 'right';

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _g = new THREE.Vector3();
const _ray = new THREE.Ray();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const BODY_SAMPLES = [0.1, 0.5, 0.9];

/** Roll speed at normalised time u: fast burst that eases out to ~run speed (integrates to DODGE_DIST over DODGE_TIME). */
function dodgeSpeed(u: number): number {
  return (DODGE_DIST / DODGE_TIME) * (1.1 * (1 - u) + 0.45);
}

function turnToward(cur: number, want: number, lambda: number, maxRate: number, dt: number): number {
  const diff = angleDiff(cur, want);
  let step = diff * (1 - Math.exp(-lambda * dt));
  const lim = maxRate * dt;
  if (step > lim) step = lim;
  else if (step < -lim) step = -lim;
  return cur + step;
}

/**
 * Turns input into the LOCAL player's actions every frame:
 *  WASD movement relative to camera (accel/decel, turn smoothing, strafing in action mode), Space jump,
 *  Shift dodge-roll with i-frames (applies 'iframes' status), skills via G.skills.tryCastSlot with AimInfo,
 *  potions, interact (F) with the nearest interactable, Tab target cycling, soft-target under crosshair,
 *  pointer-lock management (lock on canvas click in action mode, unlock when G.ui.wantsCursor()).
 *  Collision via world.nav.resolveCircle. Footstep sounds. Locomotion anims (Idle/Running_A/Walking_Backwards/
 *  Running_Strafe_Left/Right) via player.anim.setBase.
 * OWNER: player module.
 */
export class PlayerController {
  player: Player;
  cam: ThirdPersonCamera;
  enabled = true;

  // ---- exposed state (HUD / other modules) ----
  /** Tab-locked target (null = none). */
  hardTarget: Enemy | null = null;
  softTarget: Enemy | null = null;
  /** Seconds since the last successful cast (combat feel: facing hold, camera). */
  timeSinceCast = 99;
  /** False while airborne. */
  grounded = true;

  private time = 0;
  private vy = 0;
  private landUntil = 0;
  private faceHold = 0;
  private loco: Loco = 'idle';
  private dispSpeed = 0;
  private wishSpeed = 0;
  private stepAcc = 0;
  private repeat: Record<SkillSlotKey, number> = { lmb: 0, rmb: 0, q: 0, e: 0, r: 0, s1: 0, s2: 0, s3: 0, m45: 0, m90: 0, m180: 0 };
  private pending: { slot: SkillSlotKey; until: number } | null = null;
  private dodge: { t: number; dx: number; dz: number; dust: boolean } | null = null;
  /** controller time until which a dodge press that could not start yet stays buffered (knockback, previous roll, charge almost back). */
  private dodgeBuf = -1;
  private stepCount = 0;
  /** ground distance per footfall of the locomotion clip that is currently playing (keeps footstep sounds on the foot plants). */
  private strideLen = 1.6;
  private wasExtForced = false;
  private lastTargetEmit: number | null = null;
  private targetTimer = 0;
  private losLost = 0;
  private lastTabAt = -9;
  /** Tab hold (lock-on, GDD_LIFE §4.7): when it went down, and whether the hold already toggled the lock. */
  private tabDownAt = -1;
  private tabLocked = false;
  /** Shoulder key hold (GDD_LIFE §4.5): when it went down, and whether the hold already centred the camera. */
  private shoulderDownAt = -1;
  private shoulderHeld = false;
  private interactTimer = 0;
  private nearest: Interactable | null = null;
  private nearestEntityId = -1;
  private promptText: string | null = null;
  private reviveHold = 0;
  private revivePrompt = false;

  // pointer lock
  private swallowLmb = false;
  private expectedUnlock = false;
  private autoRelockPending = true; // one silent lock attempt right at the start (works while the click that started the scene is fresh)
  private prevUiOpen = false;
  private hintShown = false;
  private hintTimer = 0;
  private disposed = false;
  private lastWorld: unknown = null;

  // classic-mode RMB click detection
  private rmbDown = false;
  private rmbMoved = 0;
  private rmbTime = 0;
  /** classic mode: true once an RMB press became a drag (pointer lock is requested for unlimited orbiting). */
  private rmbDragging = false;
  private classicLockAsked = false;

  // aim cache
  private aimFrame = -1;
  private aimCache: AimInfo = { point: [0, 0, 0], dir: [0, 0, 1], targetId: null };
  private aimYaw = 0;

  // target marker (small floating diamond above the soft/hard target)
  private marker: THREE.Mesh | null = null;
  private markerRing: THREE.Mesh | null = null;

  private unsubs: (() => void)[] = [];
  private readonly onLockChange = () => this.handleLockChange();
  private readonly aimFn = (): AimInfo => this.getAim();

  constructor(player: Player, cam: ThirdPersonCamera) {
    this.player = player;
    this.cam = cam;
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.buildMarker();
    cam.setTarget(player.object3d);
    // hold-to-aim / buffered casts in SkillSystem ask for the live aim
    if (G.skills) (G.skills as unknown as { aimProvider: (() => AimInfo) | null }).aimProvider = this.aimFn;
    // SceneManager.current is still null while a scene's enter() runs, so learn the scene from the 'scene:changed' event
    if (G.scenes?.current?.id === 'town') player.footstepSfx = 'footstep_dirt';
    this.unsubs.push(
      G.events.on('scene:changed', (e) => {
        this.player.footstepSfx = e.to === 'town' ? 'footstep_dirt' : 'footstep_stone';
      }),
    );
    // Kusursuz Kaçış (Combat): refund half a dodge charge
    this.unsubs.push(
      G.events.on('player:perfectDodge', () => {
        const pl = this.player;
        pl.dodgeCharges = Math.min(pl.dodgeMaxCharges, pl.dodgeCharges + 0.5);
      }),
      // Kritik Vuruş / big finishers (GDD_V2 §3.7): zoom-in FOV kick + a short dolly thump, springs back on its own
      G.events.on('camera:punch', (e) => {
        this.cam.kickFov(e.fov);
        this.cam.punch(Math.min(0.2, Math.max(0.05, e.out * 0.25)));
      }),
      G.events.on('player:revived', (e) => {
        if (e.local) this.onRevived();
      }),
      // GDD_LIFE §4.7: boss auto-lock on engage (setting bossAutoLock), released when the boss falls or the fight wipes
      G.events.on('boss:engaged', (e) => this.onBossEngaged(e.entityId)),
      G.events.on('boss:defeated', () => this.releaseBossLock()),
      G.events.on('boss:wipe', () => this.releaseBossLock()),
    );
    if (G.input) G.input.enabled = true;
  }

  // =====================================================================================================================
  // Public API
  // =====================================================================================================================

  /** Current aim (for skills and UI). Cached per frame. */
  getAim(): AimInfo {
    const frame = G.engine?.frame ?? 0;
    if (this.aimFrame === frame) return this.aimCache;
    this.aimFrame = frame;
    const p = this.player;
    const world = p.world;
    const px = p.position.x, pz = p.position.z;
    this.cam.getBasis(_f, _r);
    const ray = this.cam.getAimRay(_ray);
    const tgt = this.currentTarget();
    let tx: number, ty: number, tz: number;
    if (tgt) {
      tx = tgt.position.x; ty = tgt.position.y; tz = tgt.position.z;
    } else {
      const hit = world ? world.rayToGround(ray, _g) : null;
      if (hit && hit.distanceTo(ray.origin) < 140) {
        tx = hit.x; ty = hit.y; tz = hit.z;
      } else {
        tx = px + _f.x * 25; ty = p.position.y; tz = pz + _f.z * 25;
      }
    }
    let dx = tx - px, dz = tz - pz;
    // the aim point must lie ahead of the player along the camera heading (steep looks hit the ground behind/under us)
    if (!tgt && dx * _f.x + dz * _f.z < 1.0) {
      const d = Math.max(3.5, Math.hypot(dx, dz));
      tx = px + _f.x * d; tz = pz + _f.z * d;
      dx = tx - px; dz = tz - pz;
    }
    const len = Math.hypot(dx, dz);
    let nx: number, nz: number;
    if (len > 0.25) {
      nx = dx / len; nz = dz / len;
    } else {
      nx = Math.sin(p.yaw); nz = Math.cos(p.yaw);
    }
    this.aimYaw = Math.atan2(nx, nz);
    this.aimCache = { point: [tx, ty, tz], dir: [nx, 0, nz], targetId: tgt ? tgt.id : null, allyId: friendlyTargetId() };
    return this.aimCache;
  }

  /** Hard target if any, else the soft target under the crosshair. */
  currentTarget(): Enemy | null {
    return this.hardTarget ?? this.softTarget;
  }

  /** Instantly place the player (release, teleports): clears motion/dodge/jump and snaps the camera. */
  teleport(x: number, z: number, yaw?: number): void {
    const p = this.player;
    p.position.set(x, p.world?.groundY(x, z) ?? 0, z);
    if (yaw !== undefined) p.yaw = yaw;
    p.velocity.set(0, 0, 0);
    p.forcedMove = null;
    p.jumpY = 0;
    p.jumping = false;
    p.dodging = false;
    this.vy = 0;
    this.grounded = true;
    this.dodge = null;
    this.pending = null;
    p.interp?.clear();
    this.cam.snap();
  }

  private onRevived(): void {
    const p = this.player;
    this.dodge = null;
    p.dodging = false;
    this.pending = null;
    this.faceHold = 0;
    this.grounded = true;
    this.vy = 0;
    p.jumpY = 0;
    p.velocity.set(0, 0, 0);
    this.loco = 'idle';
  }

  /** Drop target locks etc. (scene changes, death). */
  clearTargets(): void {
    this.hardTarget = null;
    this.softTarget = null;
    this.cam.setLockOn(null);
    this.emitTarget();
  }

  // =====================================================================================================================
  // Frame
  // =====================================================================================================================

  update(dt: number): void {
    const p = this.player;
    const world = p.world;
    if (!world || dt <= 0) return;
    if (this.lastWorld !== world) {
      this.lastWorld = world;
      this.clearTargets();
    }
    this.time += dt;
    this.timeSinceCast += dt;
    this.faceHold = Math.max(0, this.faceHold - dt);

    const input = G.input;
    this.cam.handleInput(dt);
    this.cam.refreshAim(); // aim ray = this frame's yaw/pitch (no one-frame lag on fast flicks)
    const uiOpen = !!G.ui?.wantsCursor?.();
    const dead = p.isDead;
    const action = this.cam.mode === 'action';

    // a panel just closed: try to take the pointer back once (valid while the closing click / key press is still fresh)
    if (this.prevUiOpen && !uiOpen) this.autoRelockPending = true;
    this.prevUiOpen = uiOpen;
    this.updatePointerLock(dt, uiOpen, action);

    const canInput = this.enabled && !dead && !uiOpen;
    if (!canInput) {
      this.rmbDown = false;
      this.rmbDragging = false;
      this.dodgeBuf = -1;
      this.tabDownAt = -1;
      this.shoulderDownAt = -1;
    }
    // mouse buttons only act on the world when the cursor is captured (action) or free over the game canvas (classic)
    const mouseOk = canInput && (action ? input.isLocked() : true);

    if (canInput && action && input.pressed('toggleLock')) {
      this.cam.shiftLock = !this.cam.shiftLock;
      G.events.emit('ui:toast', { text: this.cam.shiftLock ? 'Kamera kilidi: AÇIK' : 'Kamera kilidi: KAPALI', kind: 'info' });
    }

    if (dead) {
      this.onDeadFrame(dt);
      this.updateInteractPrompt(false);
      return;
    }

    // ---------------- targeting ----------------
    this.targetTimer -= dt;
    if (this.targetTimer <= 0) {
      this.targetTimer = 1 / 15;
      this.updateTargets(dt + 1 / 15 - 0.0001);
    }
    this.updateTabAndShoulder(canInput, action);
    this.updateFriendlyKeys(canInput);
    this.updateMarker(dt);

    // aim for this frame (after targets)
    const aim = this.getAim();

    // ---------------- guard (G / Mouse3): hold = guard stance, press = parry window (GDD_V2 §3.4-3.5) ----------------
    G.combat?.guardInput(p, canInput && input.down('guard'), canInput && input.pressed('guard'), !!G.skills?.isBusy(p));

    // ---------------- dodge ----------------
    if (canInput && input.pressed('dodge')) this.pressDodge(true);
    else if (canInput && this.dodgeBuf > this.time) this.pressDodge(false);
    this.updateDodge(dt);

    // ---------------- jump ----------------
    if (canInput && input.pressed('jump')) this.tryJump();

    // ---------------- movement ----------------
    const axis = canInput && !this.dodge ? input.moveAxis() : { x: 0, y: 0 };
    // auto-follow (GDD_LIFE §4.4): only while steering straight forward, with nothing locked
    this.cam.setFollow(canInput && !this.dodge && axis.y > 0.5 && Math.abs(axis.x) < 0.5 && !this.hardTarget && !p.isDead, p.yaw + Math.PI, this.dispSpeed);
    this.stepMovement(dt, axis, canInput, action);

    // ---------------- skills / potions / interact ----------------
    if (canInput) {
      this.handleSkills(dt, aim, mouseOk, action);
      if (input.pressed('potionHp')) G.combat.usePotion('hp');
      if (input.pressed('potionMp')) G.combat.usePotion('mp');
    } else {
      this.pending = null;
    }
    this.updateInteract(dt, canInput);

    // ---------------- animation + sound ----------------
    this.updateLocomotionAnim(dt, axis);
    this.updateFootsteps(dt);
  }

  // =====================================================================================================================
  // Pointer lock
  // =====================================================================================================================

  private updatePointerLock(dt: number, uiOpen: boolean, action: boolean): void {
    const input = G.input;
    const locked = input.isLocked();

    if (!action) {
      // classic mode: the cursor stays free; pointer lock is only borrowed while dragging with RMB (unlimited orbiting,
      // the cursor reappears exactly where it was)
      const want = this.enabled && !uiOpen && this.rmbDragging && input.down('skill_rmb');
      if (want) {
        if (!locked && !this.classicLockAsked) {
          this.classicLockAsked = true;
          input.lock();
        }
      } else {
        this.classicLockAsked = false;
        if (locked) {
          this.expectedUnlock = true;
          input.unlock();
        }
      }
      this.swallowLmb = false;
      this.autoRelockPending = false;
      return;
    }
    this.classicLockAsked = false;

    const free = input.down('freeCursor');
    const wantLock = this.enabled && !uiOpen && !free;

    if (wantLock) {
      if (!locked) {
        if (this.autoRelockPending) {
          this.autoRelockPending = false; // one silent attempt after a script-initiated unlock (allowed without a gesture)
          input.lock();
        }
        if (input.pressed('skill_lmb') && !input.pointerOverUI) {
          input.lock();
          this.swallowLmb = true; // this click only re-acquires the lock, it must not attack
        }
        if (!this.hintShown) {
          this.hintTimer += dt;
          if (this.hintTimer > 0.8) {
            this.hintShown = true;
            G.events.emit('ui:toast', { text: 'Fareyi yakalamak için oyuna tıkla', kind: 'info' });
          }
        }
      }
    } else if (locked) {
      this.expectedUnlock = true;
      this.autoRelockPending = true;
      input.unlock();
    }
    if (this.swallowLmb && !input.down('skill_lmb')) this.swallowLmb = false;
  }

  private handleLockChange(): void {
    if (this.disposed) return;
    if (document.pointerLockElement) return; // acquired
    if (this.expectedUnlock) {
      this.expectedUnlock = false;
      return;
    }
    // the browser released the lock (Esc / alt-tab): show the game menu unless a panel already wants the cursor
    if (!this.enabled || this.cam.mode !== 'action') return;
    if (!G.ui?.wantsCursor?.()) G.ui?.openPanel('gameMenu');
  }

  // =====================================================================================================================
  // Dead
  // =====================================================================================================================

  private onDeadFrame(dt: number): void {
    const p = this.player;
    // coast to a stop
    const sp = Math.hypot(p.velocity.x, p.velocity.z);
    if (sp > 0.01) {
      const k = Math.max(0, sp - 60 * dt) / sp;
      p.velocity.x *= k;
      p.velocity.z *= k;
    }
    this.dispSpeed = 0;
    this.dodge = null;
    p.dodging = false;
    this.pending = null;
    this.hardTarget = null;
    this.cam.setLockOn(null);
    if (this.softTarget) {
      this.softTarget = null;
      this.emitTarget();
    }
    if (this.marker) this.marker.visible = false;
    if (this.markerRing) this.markerRing.visible = false;
    // keep the body on the ground
    if (p.jumpY > 0 || !this.grounded) this.stepVertical(dt);
  }

  // =====================================================================================================================
  // Movement
  // =====================================================================================================================

  private actionSpeedMul(): number {
    const p = this.player;
    let mul = p.getActionMoveMul();
    const cast = p.cast;
    if (cast) {
      const def = G.skills?.getDef(cast.skillId);
      if (def?.lockMovement) mul = 0;
      else if (cast.channel) mul *= 0.5;
      else if (cast.duration > 0 && def?.lockMovement !== false) mul = 0;
    }
    // Siper (GDD_V2 §3.4): guarding walks at x0.6
    return G.combat?.isGuarding(p) ? mul * 0.6 : mul;
  }

  private stepMovement(dt: number, axis: { x: number; y: number }, canInput: boolean, action: boolean): void {
    const p = this.player;
    const input = G.input;
    const world = p.world!;
    const forced = !!p.forcedMove && world.time < p.forcedMove.until;
    const steering = canInput && !this.dodge && !forced && p.canMove();

    // wish direction in world space
    this.cam.getBasis(_f, _r);
    let wx = 0, wz = 0;
    const hasInput = steering && (axis.x !== 0 || axis.y !== 0);
    if (hasInput) {
      wx = _f.x * axis.y + _r.x * axis.x;
      wz = _f.z * axis.y + _r.z * axis.x;
      const l = Math.hypot(wx, wz) || 1;
      wx /= l; wz /= l;
    }

    // ---- facing ----
    const busy = this.faceHold > 0 || !!p.cast;
    const hard = this.hardTarget;
    const rmbSteer = !action && this.cam.orbiting;
    let want: number | null = null;
    let lambda = 14, maxRate = 11;
    if (this.dodge) {
      want = null; // the roll decides
    } else if (busy) {
      want = this.aimYaw;
      lambda = 42; maxRate = 24;
    } else if (G.combat?.isGuarding(p)) {
      want = this.cam.faceYaw; // Siper: the guarding character faces the camera (GDD_V2 §3.4)
      lambda = 30; maxRate = 14;
    } else if (hard) {
      want = Math.atan2(hard.position.x - p.position.x, hard.position.z - p.position.z);
      lambda = 26; maxRate = 14;
    } else if (action && this.cam.shiftLock) {
      want = this.cam.faceYaw;
      lambda = 30; maxRate = 14;
    } else if (rmbSteer) {
      want = this.cam.faceYaw;
      lambda = 30; maxRate = 14;
    } else if (hasInput) {
      want = Math.atan2(wx, wz);
      lambda = 16; maxRate = 12;
    }
    if (want !== null && p.canMove() && !forced) p.yaw = turnToward(p.yaw, want, lambda, maxRate, dt);
    else if (want !== null && forced && busy) p.yaw = turnToward(p.yaw, want, lambda, maxRate, dt);

    // ---- speed ----
    let maxSpeed = p.moveSpeed();
    if (input.down('walk')) maxSpeed *= WALK_MUL;
    maxSpeed *= this.actionSpeedMul();
    if (hasInput) {
      // backpedal penalty relative to facing
      const back = -(wx * Math.sin(p.yaw) + wz * Math.cos(p.yaw));
      if (back > 0.3) maxSpeed *= 1 - (1 - BACKPEDAL_MUL) * Math.min(1, (back - 0.3) / 0.5);
    }
    this.wishSpeed = hasInput ? maxSpeed : 0;
    const tx = wx * maxSpeed, tz = wz * maxSpeed;
    const ref = Math.max(5, p.baseMoveSpeed);
    const accel = ref / ACCEL_TIME;
    const decel = ref / DECEL_TIME;
    const v = p.velocity;
    if (!this.dodge && !forced) {
      // a knockback / dash just ended: drop its leftover velocity instead of sliding on (the roll hands over its own speed)
      if (this.wasExtForced) {
        this.wasExtForced = false;
        v.x = 0;
        v.z = 0;
      }
      const dvx = tx - v.x, dvz = tz - v.z;
      const dl = Math.hypot(dvx, dvz);
      let rate = hasInput ? accel : decel;
      if (hasInput && v.x * tx + v.z * tz < 0) rate *= 1.4;      // quick reversals
      if (!this.grounded) rate *= AIR_CONTROL;
      const step = rate * dt;
      if (dl <= step || dl < 1e-5) {
        v.x = tx; v.z = tz;
      } else {
        v.x += (dvx / dl) * step;
        v.z += (dvz / dl) * step;
      }
    } else if (forced) {
      v.set(p.forcedMove!.vx, 0, p.forcedMove!.vz);
      if (!this.dodge) this.wasExtForced = true;
    }

    // ---- integrate (dodge/forced movement is integrated by Actor.update) ----
    const ox = p.position.x, oz = p.position.z;
    if (!this.dodge && !forced) {
      p.position.x += v.x * dt;
      p.position.z += v.z * dt;
      const hit = world.nav.resolveCircle(p.position, p.radius);
      if (hit && dt > 1e-4) {
        // slide: report the speed we actually achieved so animation/footsteps/network stay truthful
        const ax = (p.position.x - ox) / dt, az = (p.position.z - oz) / dt;
        v.x = ax; v.z = az;
      }
    }
    const moved = Math.hypot(p.position.x - ox, p.position.z - oz) / Math.max(dt, 1e-4);
    const measured = this.dodge || forced ? Math.hypot(v.x, v.z) : moved;
    this.dispSpeed += (measured - this.dispSpeed) * (1 - Math.exp(-20 * dt));

    // ---- vertical (jump physics) ----
    this.stepVertical(dt);
  }

  private stepVertical(dt: number): void {
    const p = this.player;
    const world = p.world;
    if (!world) return;
    const fm = p.forcedMove;
    if (fm && fm.vy !== undefined && world.time < fm.until) {
      // skill-driven vertical motion (leaps): SkillSystem owns the arc
      p.jumpY = Math.max(0, p.jumpY + fm.vy * dt);
      this.vy = fm.vy;
      this.grounded = p.jumpY <= 0.001;
    } else if (!this.grounded || p.jumpY > 0.001) {
      this.vy -= GRAVITY * dt;
      p.jumpY += this.vy * dt;
      if (p.jumpY <= 0) this.land(Math.abs(this.vy));
    }
    p.position.y = world.groundY(p.position.x, p.position.z) + p.jumpY;
  }

  private land(fallSpeed: number): void {
    const p = this.player;
    p.jumpY = 0;
    this.vy = 0;
    const wasAir = !this.grounded || p.jumping;
    this.grounded = true;
    p.jumping = false;
    if (!wasAir) return;
    G.audio.play('land', { pos: [p.position.x, p.position.y, p.position.z], volume: clamp(fallSpeed / 12, 0.4, 1) });
    G.vfx.spawn('dodge_dust', p.position, { scale: 0.7 });
    if (fallSpeed > 6) this.cam.punch(-0.1);
    p.squash(0.14);
    const a = p.anim;
    if (a && !p.isDead) {
      const moving = this.dispSpeed > 1.5;
      if (!moving && a.has('Jump_Land')) {
        a.playOnce('Jump_Land', { fade: 0.05, speed: 2.4 });
        this.landUntil = this.time + 0.3;
      } else {
        a.cancelOneShot(0.05);
      }
      this.loco = 'idle';
    }
  }

  private tryJump(): void {
    const p = this.player;
    if (!this.grounded || p.isDead || p.dodging || !p.canMove()) return;
    const world = p.world;
    if (p.forcedMove && world && world.time < p.forcedMove.until) return;
    this.grounded = false;
    p.jumping = true;
    this.vy = JUMP_V;
    p.jumpY = 0.001;
    const a = p.anim;
    if (a) {
      if (a.has('Jump_Idle')) a.setBase('Jump_Idle', { fade: 0.08 });
      if (a.has('Jump_Start')) a.playOnce('Jump_Start', { fade: 0.04, speed: 2.3 });
    }
    this.loco = 'idle';
    p.squash(-0.09);
    G.audio.play('jump', { pos: [p.position.x, p.position.y, p.position.z] });
    G.audio.voice('hup', { chance: 0.65 });
    G.vfx.spawn('dodge_dust', p.position, { scale: 0.55 });
  }

  // =====================================================================================================================
  // Dodge roll
  // =====================================================================================================================

  /** ok = can roll now; busy = temporarily blocked (bufferable); charge = no charge yet; never = not possible at all. */
  private dodgeBlock(): 'ok' | 'busy' | 'charge' | 'never' {
    const p = this.player;
    const world = p.world;
    if (!world || p.isDead || p.statuses.stunned) return 'never';
    if (p.dodging || this.dodge) return 'busy';
    // dashes/leaps/knockbacks of other systems are not cancellable (but a press during one is buffered)
    if (p.forcedMove && world.time < p.forcedMove.until) return 'busy';
    if (!this.grounded && p.jumpY > 0.6) return 'busy';
    if (p.dodgeCharges < 1) return 'charge';
    return 'ok';
  }

  /** A dodge key press (fresh) or a buffered retry. Presses that cannot start yet stay buffered for a short window. */
  private pressDodge(fresh: boolean): void {
    const r = this.tryDodge();
    if (r === 'ok' || r === 'never') {
      this.dodgeBuf = -1;
      return;
    }
    const p = this.player;
    if (r === 'charge' && p.dodgeCharges < 0.7) {
      this.dodgeBuf = -1;
      if (fresh) G.audio.play('ui_error', { volume: 0.35 });
      return;
    }
    if (fresh) this.dodgeBuf = this.time + FEEL.dodgeBuffer; // GDD_LIFE §5.8: dodge buffer 0.20 s during any recovery
  }

  private tryDodge(): 'ok' | 'busy' | 'charge' | 'never' {
    const p = this.player;
    const world = p.world!;
    const block = this.dodgeBlock();
    if (block !== 'ok') return block;

    // cancel whatever recovery we are in (a protected action, e.g. an ultimate wind-up, refuses: retry from the buffer)
    try {
      G.skills.interrupt(p);
      if (G.skills.isBusy(p)) return 'busy';
    } catch (e) {
      console.warn('[controller] interrupt failed', e);
    }

    const input = G.input;
    const action = this.cam.mode === 'action';
    const axis = input.moveAxis();
    this.cam.getBasis(_f, _r);
    let dx: number, dz: number;
    const hasInput = axis.x !== 0 || axis.y !== 0;
    if (hasInput) {
      dx = _f.x * axis.y + _r.x * axis.x;
      dz = _f.z * axis.y + _r.z * axis.x;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
    } else {
      // no input: roll backwards, away from where we face
      dx = -Math.sin(p.yaw); dz = -Math.cos(p.yaw);
    }

    // free-facing mode: turn into the roll so every roll plays Dodge_Forward; shift-lock keeps facing and picks the clip
    const keepFacing = action && this.cam.shiftLock;
    if (!keepFacing && hasInput && !this.hardTarget) p.yaw = Math.atan2(dx, dz);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
    const fwd = dx * fx + dz * fz, rgt = dx * rx + dz * rz;
    const ang = Math.atan2(rgt, fwd);
    const clip = Math.abs(ang) < Math.PI * 0.25 ? 'Dodge_Forward' : Math.abs(ang) > Math.PI * 0.75 ? 'Dodge_Backward' : ang > 0 ? 'Dodge_Right' : 'Dodge_Left';

    const a = p.anim;
    a?.cancelOneShot(0);
    p.clearActionMove();
    this.faceHold = 0;

    p.dodgeCharges -= 1;
    p.dodging = true;
    p.dodgeStartedAt = world.time;
    p.statuses.apply('iframes', DODGE_IFRAMES, { sourceId: p.id });
    this.dodge = { t: 0, dx, dz, dust: false };
    this.ghostAt = 0;
    p.velocity.set(dx * 12, 0, dz * 12);
    const v0 = dodgeSpeed(0);
    p.forcedMove = { vx: dx * v0, vz: dz * v0, until: world.time + DODGE_TIME };

    if (a && a.has(clip)) a.playOnce(clip, { fade: 0.04, speed: 1.0 });
    G.vfx.spawn('dodge_dust', p.position, { dir: [-dx, 0, -dz] });
    p.spawnAfterImage(0x9fd8ff, 0.4, 0.32);
    G.audio.play('dodge', { pos: [p.position.x, p.position.y, p.position.z] });
    G.audio.voice('hut', { chance: 0.6 });
    this.cam.kickFov(4.5); // GDD_LIFE §4.10: dodge start
    this.cam.shake(0.05, 0.12);
    return 'ok';
  }

  private ghostAt = 0;

  private updateDodge(dt: number): void {
    const d = this.dodge;
    const p = this.player;
    if (!d) return;
    const world = p.world;
    if (!world) return;
    d.t += dt;
    if (p.isDead) {
      this.dodge = null;
      p.dodging = false;
      return;
    }
    if (d.t >= DODGE_TIME) {
      this.dodge = null;
      p.dodging = false;
      if (p.forcedMove && world.time < p.forcedMove.until) p.forcedMove = null;
      // the roll ends at ~run speed so it flows straight into running
      const out = Math.min(dodgeSpeed(1), p.moveSpeed());
      p.velocity.set(d.dx * out, 0, d.dz * out);
      return;
    }
    const sp = dodgeSpeed(d.t / DODGE_TIME);
    p.forcedMove = { vx: d.dx * sp, vz: d.dz * sp, until: world.time + (DODGE_TIME - d.t) + 0.02 };
    p.velocity.set(d.dx * sp, 0, d.dz * sp);
    if (this.ghostAt < 1 && d.t > 0.12) {
      this.ghostAt = 1;
      p.spawnAfterImage(0x9fd8ff, 0.3, 0.28);
    }
    if (!d.dust && d.t > 0.16) {
      d.dust = true;
      G.vfx.spawn('dodge_dust', p.position, { dir: [-d.dx, 0, -d.dz], scale: 0.75 });
    }
  }

  // =====================================================================================================================
  // Skills
  // =====================================================================================================================

  private handleSkills(dt: number, aim: AimInfo, mouseOk: boolean, action: boolean): void {
    const input = G.input;
    const p = this.player;
    const rolling = !!this.dodge;
    const canFireDuringRoll = this.dodge ? this.dodge.t >= DODGE_ATTACK_AT : true;

    // buffered press from the roll
    if (this.pending) {
      if (this.time > this.pending.until) this.pending = null;
      else if (canFireDuringRoll) {
        const slot = this.pending.slot;
        this.pending = null;
        this.fireSlot(slot, this.getAim());
      }
    }

    for (const slot of SKILL_SLOT_KEYS) {
      const act = SLOT_ACTION[slot];
      const isMouse = slot === 'lmb' || slot === 'rmb';
      if (isMouse && !mouseOk) continue;
      if (slot === 'rmb' && !action) continue; // classic RMB: click-vs-drag handled below
      let pressed = input.pressed(act);
      let down = input.down(act);
      if (slot === 'lmb' && this.swallowLmb) {
        pressed = false;
        down = false;
      }
      // LMB: a press is a light step; holding charges the heavy (GDD_V2 §3.2) unless Settings.autoCombo re-fires the chain while held
      if (slot === 'lmb' && !G.settings?.data.autoCombo) down = false;
      if (this.repeat[slot] > 0) this.repeat[slot] -= dt;
      if (!pressed && !down) continue;
      if (!pressed && (!p.canAct() || this.repeat[slot] > 0)) continue;
      if (rolling && !canFireDuringRoll) {
        if (pressed) this.pending = { slot, until: this.time + 0.35 };
        continue;
      }
      if (this.fireSlot(slot, aim)) this.repeat[slot] = slot === 'lmb' ? 0 : 0.1;
      else if (!pressed) this.repeat[slot] = slot === 'lmb' ? 0.03 : 0.12;
    }

    // classic mode: a quick RMB click (no drag) casts the RMB skill at the cursor
    if (!action) {
      if (input.pressed('skill_rmb') && !input.pointerOverUI) {
        this.rmbDown = true;
        this.rmbDragging = false;
        this.rmbMoved = 0;
        this.rmbTime = 0;
      }
      if (this.rmbDown) {
        this.rmbMoved += Math.abs(input.mouseDX) + Math.abs(input.mouseDY);
        this.rmbTime += dt;
        if (!this.rmbDragging && (this.rmbMoved >= 7 || this.rmbTime >= 0.3)) this.rmbDragging = true;
        // a press + release inside one frame has pressed() true and down() false: still a click
        if (!input.down('skill_rmb')) {
          const click = this.rmbMoved < 7 && this.rmbTime < 0.3;
          this.rmbDown = false;
          this.rmbDragging = false;
          if (click) {
            if (rolling && !canFireDuringRoll) this.pending = { slot: 'rmb', until: this.time + 0.35 };
            else this.fireSlot('rmb', aim);
          }
        }
      }
    } else {
      this.rmbDown = false;
      this.rmbDragging = false;
    }
  }

  private fireSlot(slot: SkillSlotKey, aim: AimInfo): boolean {
    const p = this.player;
    let ok = false;
    try {
      ok = G.skills.tryCastSlot(p, slot, aim);
    } catch (e) {
      console.error('[controller] tryCastSlot failed', e);
    }
    if (ok) {
      this.timeSinceCast = 0;
      this.faceHold = FACE_HOLD;
      // SkillSystem owns the swing facing (it snaps to its melee-assist target); we turn to the aim point afterwards
      // an attack cancels the landing animation
      this.landUntil = 0;
    }
    return ok;
  }

  // =====================================================================================================================
  // Targeting
  // =====================================================================================================================

  private updateTargets(_dt: number): void {
    const p = this.player;
    const world = p.world;
    if (!world) return;
    const px = p.position.x, pz = p.position.z;

    // validate hard target
    const hard = this.hardTarget;
    if (hard) {
      const d = Math.hypot(hard.position.x - px, hard.position.z - pz);
      let drop = hard.isDead || hard.removed || d > HARD_TARGET_RANGE;
      if (!drop) {
        if (!world.nav.lineOfSight(px, pz, hard.position.x, hard.position.z)) {
          this.losLost += 1 / 15;
          if (this.losLost > 2) drop = true;
        } else this.losLost = 0;
      }
      if (drop && (hard.isDead || hard.removed)) {
        // GDD_LIFE §4.7: the locked target died -> pick the nearest one within 8 m and the cone, else release
        const alt = this.nearestInCone(60, 8, hard);
        this.hardTarget = alt;
        this.losLost = 0;
        this.cam.setLockOn(alt);
      } else if (drop) {
        this.hardTarget = null;
        this.cam.setLockOn(null);
      }
    }

    // soft target: enemy nearest the crosshair ray
    const ray = this.cam.getAimRay(_ray);
    const origin = ray.origin, dir = ray.direction;
    let best: Enemy | null = null;
    let bestScore = 1e9;
    const cands: { e: Enemy; score: number }[] = [];
    // where the crosshair ray meets the ground (steep camera angles aim at the floor next to the enemy)
    const gHit = world.rayToGround(ray, _g);
    const gx = gHit ? gHit.x : 0, gz = gHit ? gHit.z : 0;
    const gOk = !!gHit && gHit.distanceTo(origin) < 90;
    for (const e of world.enemies) {
      if (e.isDead || e.removed || !e.alive) continue;
      const pd = Math.hypot(e.position.x - px, e.position.z - pz);
      if (pd > SOFT_TARGET_RANGE) continue;
      // ray distance to the enemy's body (feet / chest / head samples)
      let ratio = 1e9;
      for (const f of BODY_SAMPLES) {
        _q.set(e.position.x - origin.x, e.position.y + e.height * f - origin.y, e.position.z - origin.z);
        const t = _q.dot(dir);
        if (t < 1) continue;
        const perp = Math.sqrt(Math.max(0, _q.lengthSq() - t * t));
        const allowed = e.radius + 0.9 + t * 0.035;
        ratio = Math.min(ratio, perp / allowed);
      }
      if (gOk) ratio = Math.min(ratio, Math.hypot(e.position.x - gx, e.position.z - gz) / (e.radius + 1.7));
      if (ratio > 1) continue;
      let score = ratio + pd * 0.012;
      if (e === this.softTarget) score -= 0.14; // hysteresis
      cands.push({ e, score });
    }
    cands.sort((a, b) => a.score - b.score);
    for (const c of cands) {
      if (world.nav.lineOfSight(px, pz, c.e.position.x, c.e.position.z)) {
        best = c.e;
        bestScore = c.score;
        break;
      }
    }
    void bestScore;
    this.softTarget = best;

    // hard-target camera framing (lock-on, GDD_LIFE §4.7)
    const h = this.hardTarget;
    if (h) this.cam.setLockOn(h);
    this.emitTarget();
  }

  private cycleTarget(_action: boolean): void {
    const p = this.player;
    const world = p.world;
    if (!world) return;
    const cam = this.cam.camera;
    const list: { e: Enemy; x: number }[] = [];
    for (const e of world.enemies) {
      if (e.isDead || e.removed || !e.alive) continue;
      if (Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) > HARD_TARGET_RANGE) continue;
      _p.set(e.position.x, e.position.y + e.height * 0.5, e.position.z).project(cam);
      if (_p.z > 1 || _p.z < -1 || Math.abs(_p.x) > 1.05 || Math.abs(_p.y) > 1.05) continue; // not visible
      list.push({ e, x: _p.x });
    }
    const now = this.time;
    const cur = this.hardTarget;
    if (!list.length) {
      if (cur) this.hardTarget = null;
      this.cam.setLockOn(null);
      this.emitTarget();
      return;
    }
    list.sort((a, b) => a.x - b.x);
    let next: Enemy | null;
    if (!cur) {
      // first press: the visible enemy closest to the screen centre
      let bi = 0, bd = 1e9;
      for (let i = 0; i < list.length; i++) {
        const d = Math.abs(list[i].x);
        if (d < bd) { bd = d; bi = i; }
      }
      next = list[bi].e;
    } else {
      const i = list.findIndex((c) => c.e === cur);
      if (now - this.lastTabAt < 0.25 || (list.length === 1 && i === 0)) next = null; // double-tap / only target: release
      else next = list[(i + 1) % list.length].e;
    }
    this.lastTabAt = now;
    this.hardTarget = next;
    this.losLost = 0;
    this.cam.setLockOn(next);
    this.emitTarget();
    G.audio.play('ui_tab', { volume: 0.5 });
  }

  // =====================================================================================================================
  // Lock-on, shoulder and boss auto-lock (GDD_LIFE §4.5, §4.7)
  // =====================================================================================================================

  /**
   * GDD_V2 §0.4 / §1.6: U cycles friendly targets (lowest HP% first); F1..F5 select the party member in that slot (F1 = self).
   * The selection rides on every AimInfo as `allyId` (healing.ts resolveHealTarget).
   */
  private updateFriendlyKeys(canInput: boolean): void {
    const input = G.input;
    if (!canInput || !input || !this.player.isLocal) return;
    if (input.pressed('targetAlly')) cycleFriendly(this.player);
    for (let n = 1; n <= 5; n++) {
      if (input.pressed(`partySel${n}` as 'partySel1')) selectPartySlot(this.player, n);
    }
  }

  /** Tab: a tap cycles (tap-cycle mode: on press; hold-lock mode: on release), a hold of 0.3 s toggles the lock-on. */
  private updateTabAndShoulder(canInput: boolean, action: boolean): void {
    const input = G.input;
    const lockMode = G.settings?.data.lockOnMode ?? 'hold-lock';
    if (canInput && input.pressed('targetNext')) {
      if (lockMode === 'tap-cycle') this.cycleTarget(action);
      this.tabDownAt = this.time;
      this.tabLocked = false;
    }
    if (this.tabDownAt >= 0 && lockMode === 'hold-lock' && !this.tabLocked && input.down('targetNext') && this.time - this.tabDownAt >= 0.3) {
      this.tabLocked = true;
      this.toggleLockOn();
    }
    if (this.tabDownAt >= 0 && input.released('targetNext')) {
      if (lockMode === 'hold-lock' && !this.tabLocked) this.cycleTarget(action);
      this.tabDownAt = -1;
      this.tabLocked = false;
    }

    // shoulder key: tap = swap sides, hold 0.4 s = centre (a further tap returns to the last side)
    if (canInput && input.pressed('camShoulder')) {
      this.shoulderDownAt = this.time;
      this.shoulderHeld = false;
    }
    if (this.shoulderDownAt >= 0 && !this.shoulderHeld && input.down('camShoulder') && this.time - this.shoulderDownAt >= 0.4) {
      this.shoulderHeld = true;
      this.cam.holdShoulder();
    }
    if (this.shoulderDownAt >= 0 && input.released('camShoulder')) {
      if (!this.shoulderHeld) this.cam.tapShoulder();
      this.shoulderDownAt = -1;
      this.shoulderHeld = false;
    }
  }

  /** Lock-on toggle (Tab hold): release when locked, otherwise lock the soft target or the nearest one in the 60 deg cone. */
  private toggleLockOn(): void {
    if (this.hardTarget) {
      this.hardTarget = null;
      this.losLost = 0;
      this.cam.setLockOn(null);
    } else {
      const pick = this.softTarget ?? this.nearestInCone(60, HARD_TARGET_RANGE, null);
      if (!pick) {
        G.audio.play('ui_error', { volume: 0.35 });
        return;
      }
      this.hardTarget = pick;
      this.losLost = 0;
      this.cam.setLockOn(pick);
      G.audio.play('ui_tab', { volume: 0.5 });
    }
    this.emitTarget();
  }

  /** Nearest living enemy within `range` m and inside a `coneDeg` cone around the camera heading (skips `except`). */
  private nearestInCone(coneDeg: number, range: number, except: Enemy | null): Enemy | null {
    const p = this.player;
    const world = p.world;
    if (!world) return null;
    this.cam.getBasis(_f, _r);
    const cosLim = Math.cos((coneDeg / 2) * Math.PI / 180);
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of world.enemies) {
      if (e === except || e.isDead || e.removed || !e.alive) continue;
      const dx = e.position.x - p.position.x, dz = e.position.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.01) continue;
      if ((dx * _f.x + dz * _f.z) / d < cosLim) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /** Boss engage (setting bossAutoLock): lock the boss when it is within 25 m. */
  private onBossEngaged(entityId: number): void {
    if (!G.settings?.data.bossAutoLock || !this.enabled) return;
    const boss = this.player.world?.get<Enemy>(entityId);
    if (!boss || boss.isDead || boss.removed || boss.kind !== 'enemy') return;
    const d = Math.hypot(boss.position.x - this.player.position.x, boss.position.z - this.player.position.z);
    if (d > 25) return;
    this.hardTarget = boss;
    this.losLost = 0;
    this.cam.setLockOn(boss);
    this.emitTarget();
  }

  /** Boss down or the fight wiped: release a boss lock. */
  private releaseBossLock(): void {
    const h = this.hardTarget;
    if (!h || !h.isBoss) return;
    this.hardTarget = null;
    this.cam.setLockOn(null);
    this.emitTarget();
  }

  private emitTarget(): void {
    const t = this.currentTarget();
    const id = t ? t.id : null;
    this.player.targetId = id;
    if (id !== this.lastTargetEmit) {
      this.lastTargetEmit = id;
      G.events.emit('target:changed', { targetId: id });
    }
  }

  // ---- target marker (floating diamond; the HUD may add its own frame) ----

  private buildMarker(): void {
    try {
      const geo = new THREE.OctahedronGeometry(0.3, 0);
      geo.scale(0.8, 1.2, 0.8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, depthTest: false, fog: false, transparent: true, opacity: 0.95 });
      this.marker = new THREE.Mesh(geo, mat);
      this.marker.renderOrder = 998;
      this.marker.visible = false;
      this.marker.frustumCulled = false;
      const rg = new THREE.RingGeometry(0.55, 0.78, 24);
      rg.rotateX(-Math.PI / 2);
      const rm = new THREE.MeshBasicMaterial({ color: 0xffd060, depthTest: false, fog: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      this.markerRing = new THREE.Mesh(rg, rm);
      this.markerRing.renderOrder = 997;
      this.markerRing.visible = false;
      this.markerRing.frustumCulled = false;
      const scene = this.player.world?.scene ?? G.world?.scene;
      scene?.add(this.marker, this.markerRing);
    } catch (e) {
      console.warn('[controller] marker failed', e);
    }
  }

  private updateMarker(dt: number): void {
    const m = this.marker, r = this.markerRing;
    if (!m || !r) return;
    if (!m.parent) (this.player.world?.scene ?? G.world?.scene)?.add(m, r);
    const t = this.currentTarget();
    if (!t || t.isDead) {
      m.visible = false;
      r.visible = false;
      return;
    }
    const hard = !!this.hardTarget;
    // keep a readable on-screen size at any distance
    const camDist = this.cam.camera.position.distanceTo(t.position);
    const s = clamp(camDist * 0.055, 0.8, 2.6) * Math.max(0.9, t.height * 0.3);
    const bob = Math.sin(this.time * 4.2) * 0.07;
    m.visible = true;
    m.position.set(t.position.x, t.position.y + t.height + 0.45 + s * 0.35 + bob * s, t.position.z);
    m.rotation.y += dt * (hard ? 3.2 : 1.6);
    m.scale.setScalar(hard ? s * 1.2 : s);
    (m.material as THREE.MeshBasicMaterial).color.setHex(hard ? 0xffb020 : 0xff3a2a);
    r.visible = hard;
    if (hard) {
      r.position.set(t.position.x, t.position.y + 0.06, t.position.z);
      r.scale.setScalar(Math.max(1, t.radius * 1.9) * (1 + Math.sin(this.time * 5) * 0.03));
      r.rotation.y += dt * 0.8;
    }
  }

  // =====================================================================================================================
  // Interact / revive
  // =====================================================================================================================

  private updateInteract(dt: number, canInput: boolean): void {
    const p = this.player;
    const world = p.world;
    if (!world) return;
    if (!canInput) {
      this.updateInteractPrompt(false);
      return;
    }
    this.interactTimer -= dt;
    if (this.interactTimer <= 0) {
      this.interactTimer = 0.1;
      let best: Interactable | null = null;
      let bestD = 1e9;
      let bestId = -1;
      for (const e of world.entities.values()) {
        if (e.removed) continue;
        const k = e.kind;
        if (k !== 'npc' && k !== 'interactable' && k !== 'loot') continue;
        if (!isInteractable(e)) continue;
        const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
        if (d > e.interactRange + e.radius || d >= bestD) continue;
        if (e.canInteract && !e.canInteract(p)) continue;
        best = e;
        bestD = d;
        bestId = (e as unknown as { id: number }).id;
      }
      this.nearest = best;
      this.nearestEntityId = bestId;
    }
    const n = this.nearest;
    if (n && (n as unknown as { removed?: boolean }).removed) this.nearest = null;
    const text = this.nearest ? this.nearest.interactPrompt : null;
    this.updateInteractPrompt(!!this.nearest, text);
    if (this.nearest && G.input.pressed('interact')) {
      try {
        this.nearest.interact(p);
      } catch (e) {
        console.error('[controller] interact failed', e);
      }
      return;
    }

    // revive a dead ally: hold Z for 3 s next to them
    this.updateRevive(dt);
  }

  private updateInteractPrompt(has: boolean, text?: string | null): void {
    if (this.revivePrompt) return;
    const t = has ? text ?? null : null;
    if (t !== this.promptText) {
      this.promptText = t;
      G.events.emit('interact:prompt', t ? { text: t, key: G.input.bindingLabel('interact') } : { text: null });
    }
  }

  private updateRevive(dt: number): void {
    const p = this.player;
    const world = p.world;
    if (!world || world.players.length < 2) {
      this.reviveHold = 0;
      return;
    }
    let target: Player | null = null;
    let bd = 3.2;
    for (const o of world.players) {
      if (o === p || !o.isDead) continue;
      const d = Math.hypot(o.position.x - p.position.x, o.position.z - p.position.z);
      if (d < bd) { bd = d; target = o; }
    }
    if (!target || this.nearest) {
      if (this.revivePrompt) {
        this.revivePrompt = false;
        this.promptText = null;
        G.events.emit('interact:prompt', { text: null });
      }
      this.reviveHold = 0;
      return;
    }
    const key = G.input.bindingLabel('revive');
    if (G.input.down('revive')) {
      this.reviveHold += dt;
      const pct = Math.min(100, Math.round((this.reviveHold / 3) * 100));
      this.revivePrompt = true;
      const text = `${target.name} diriltiliyor... %${pct}`;
      if (text !== this.promptText) {
        this.promptText = text;
        G.events.emit('interact:prompt', { text, key });
      }
      if (this.reviveHold >= 3) {
        this.reviveHold = 0;
        const peer = G.net.peerOfEntity(target.id);
        if (peer) G.net.sendTo(peer, 'revive', { targetId: target.id, hpFrac: 0.35, sourceId: p.id });
        G.events.emit('ui:toast', { text: `${target.name} diriltildi!`, kind: 'success' });
      }
    } else {
      this.reviveHold = 0;
      const text = `${target.name} dirilt (basılı tut)`;
      this.revivePrompt = true;
      if (text !== this.promptText) {
        this.promptText = text;
        G.events.emit('interact:prompt', { text, key });
      }
    }
  }

  // =====================================================================================================================
  // Animation & sound
  // =====================================================================================================================

  private updateLocomotionAnim(dt: number, axis: { x: number; y: number }): void {
    const p = this.player;
    const a = p.anim;
    if (!a || p.isDead) return;
    if (!this.grounded) return; // Jump_Idle is the base while airborne
    if (this.dodge) return;
    // knockbacks / lunges / dashes move us without legs running
    if (p.forcedMove && p.world && p.world.time < p.forcedMove.until) {
      a.setBase(this.idleClip(a), { fade: 0.1, speed: 1 });
      return;
    }
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    const wantsMove = (axis.x !== 0 || axis.y !== 0) && p.canMove();
    // a landing animation yields to movement
    if (this.landUntil > this.time && (wantsMove || speed > 2)) {
      this.landUntil = 0;
      a.cancelOneShot(0.06);
    }
    if (speed < 1.2 && !wantsMove) {
      if (this.loco !== 'idle') this.loco = 'idle';
      a.setBase(this.idleClip(a), { fade: 0.14, speed: 1 });
      return;
    }
    if (speed < 0.35) {
      a.setBase(this.idleClip(a), { fade: 0.14, speed: 1 });
      return;
    }
    // direction of travel relative to the facing
    const vx = p.velocity.x, vz = p.velocity.z;
    const vl = Math.hypot(vx, vz);
    if (vl < 0.05) return;
    const ux = vx / vl, uz = vz / vl;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
    const ang = Math.atan2(ux * rx + uz * rz, ux * fx + uz * fz); // 0 fwd, +pi/2 right, pi back
    const aa = Math.abs(ang) * (180 / Math.PI);
    const cur = this.loco;
    const fwdLim = cur === 'fwd' ? 68 : 52;
    const backLim = cur === 'back' ? 112 : 128;
    let st: Loco;
    if (aa <= fwdLim) st = 'fwd';
    else if (aa >= backLim) st = 'back';
    else st = ang > 0 ? 'right' : 'left';
    this.loco = st;

    const slow = G.input.down('walk') || this.wishSpeed < p.baseMoveSpeed * 0.52;
    let name: string;
    let ts: number;
    if (st === 'fwd') {
      if (slow && a.has('Walking_A')) {
        name = 'Walking_A';
        ts = clamp(speed / LOCO_REF.walk, 0.6, 2.0);
      } else {
        name = a.pick('Running_A', 'Running_B') ?? 'Idle';
        ts = clamp(speed / LOCO_REF.run, 0.6, 1.9);
      }
    } else if (st === 'back') {
      name = a.pick('Walking_Backwards') ?? 'Idle';
      ts = clamp(speed / LOCO_REF.back, 0.7, 2.2);
    } else {
      const want = st === 'left' ? 'Running_Strafe_Left' : 'Running_Strafe_Right';
      name = a.has(want) ? want : a.pick('Running_A') ?? 'Idle';
      ts = clamp(speed / LOCO_REF.strafe, 0.6, 1.9);
    }
    a.setBase(name, { fade: name === 'Walking_A' || st === 'back' ? 0.14 : 0.12, speed: ts });
    // two footfalls per clip cycle: ground covered between foot plants at the applied playback speed
    const dur = a.clipDuration(name);
    if (dur > 0.1) this.strideLen = clamp((speed / ts) * dur * 0.5, 0.6, 3.2);
    void dt;
  }

  /** Idle stance: two-handed melee weapons get the ready stance while in combat. */
  private idleClip(a: { has(n: string): boolean }): string {
    const p = this.player;
    if (p.inCombat && a.has('2H_Melee_Idle')) {
      const w = p.currentGear().weapon;
      const base = w ? getItemBase(w.baseId) : undefined;
      if (base ? !!base.twoHanded && (base.category === 'sword2h' || base.category === 'axe2h') : p.classId === 'barbarian') return '2H_Melee_Idle';
    }
    return 'Idle';
  }

  private updateFootsteps(dt: number): void {
    const p = this.player;
    if (!this.grounded || this.dodge || p.isDead || this.dispSpeed < 1.2) {
      this.stepAcc = Math.min(this.stepAcc, this.strideLen * 0.45); // the first step lands soon after starting to move
      return;
    }
    const walk = G.input.down('walk') || this.dispSpeed < p.baseMoveSpeed * 0.52;
    const stride = this.strideLen;
    this.stepAcc += this.dispSpeed * dt;
    if (this.stepAcc >= stride) {
      this.stepAcc -= stride;
      G.audio.play(p.footstepSfx, { pos: [p.position.x, p.position.y, p.position.z], volume: walk ? 0.22 : 0.4, pitchVar: 0.12 });
      // a small kick of dust on every other full-speed stride
      if (!walk && (++this.stepCount & 1) === 0 && this.dispSpeed > p.baseMoveSpeed * 0.75) G.vfx.spawn('dodge_dust', p.position, { scale: 0.32 });
    }
  }

  // =====================================================================================================================
  // Lifecycle
  // =====================================================================================================================

  dispose(): void {
    this.disposed = true;
    const sk = G.skills as unknown as { aimProvider: (() => AimInfo) | null } | undefined;
    if (sk && sk.aimProvider === this.aimFn) sk.aimProvider = null;
    for (const off of this.unsubs) off();
    this.unsubs = [];
    document.removeEventListener('pointerlockchange', this.onLockChange);
    if (G.input?.isLocked()) {
      this.expectedUnlock = true;
      G.input.unlock();
    }
    if (this.promptText !== null) {
      this.promptText = null;
      G.events.emit('interact:prompt', { text: null });
    }
    if (this.lastTargetEmit !== null) {
      this.lastTargetEmit = null;
      G.events.emit('target:changed', { targetId: null });
    }
    for (const m of [this.marker, this.markerRing]) {
      if (!m) continue;
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.marker = this.markerRing = null;
    this.cam.setLockOn(null);
  }
}
