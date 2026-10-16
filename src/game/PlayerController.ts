import * as THREE from 'three';
import { G } from './G';
import { isInteractable, type Interactable } from '../entities/Interactable';
import { angleDiff, clamp } from '../core/utils';
import { getItemBase } from '../data/items';
import { FEEL } from '../combat/feel';
import { SKILL_SLOT_KEYS, type AimInfo, type SkillDef, type SkillSlotKey } from '../types/skills';
import { cycleFriendly, friendlyTargetId, selectPartySlot } from '../combat/healing';
import { pickAutoTarget, wowTabNext, WOW_TARGET, type FrontCand } from '../combat/targetSelect';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { EntityId } from '../types/common';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import type { InputAction } from '../core/Input';
import { WowMouse, type WowMouseOut } from './WowMouse';
import { pickAtNdc, type PickHit } from './ClickPick';
import { setRim, setFarRim, cullFarRims, type RimKind } from '../vfx/TargetRim';
import { AutoAttack, AUTO, type AutoTarget } from './AutoAttack';
import { VERT } from '../world/Heightfield';
import { FallHandler, VOID_FADE_IN, VOID_FADE_OUT, VOID_INPUT_LOCK, VOID_INVULN_SEC, type FallEnv, type Spot } from './FallHandler';
import { MountRider, MOUNT_STEP_UP } from './Mount';
import { PetFollower } from './Pet';

/** Black-out / fade-back of the void fall (§11 screen:fade; the HUD listens, unknown events are a no-op). */
function screenFade(to: number, dur: number): void {
  (G.events as unknown as { emit(name: string, payload: { to: number; dur: number }): void }).emit('screen:fade', { to, dur });
}

// ---- feel constants -------------------------------------------------------------------------------------------------
const ACCEL_TIME = 0.08;          // seconds to full speed
const DECEL_TIME = 0.055;         // seconds to a stop
const AIR_CONTROL = 0.5;
const WOW_AIR_CONTROL = 0.15;     // WoW: the jump commits the horizontal velocity; keys only nudge it (15 % of the ground acceleration)
const WALK_MUL = 0.45;
const BACKPEDAL_MUL = 0.643;      // WoW: back-pedal 4.5 / run 7
const JUMP_V = 9.3;               // 1.5 m apex, ~0.65 s airtime
const GRAVITY = 28.5;
// WoW retail jump: 1.6 m apex in 0.58 s airtime (apex = g t^2 / 8, v = g t / 2). Aksiyon keeps JUMP_V / GRAVITY above.
export const WOW_JUMP_V = 11;
export const WOW_GRAVITY = 38;
// AE-3 (agile-evoker §3.0): İblis Avcısı movement signature. A second jump in the air (+60 % height) and a glide while jump is held on the way down.
const AIR_JUMP_V = JUMP_V * 1.265;   // sqrt(1.6): +60 % apex height
const GLIDE_FALL = 3.2;              // m/s terminal fall speed while gliding (about a quarter of a long fall)
/** WoW: a Shift press waits this long (s) for a Tab before it rolls, so Shift+Tab never rolls. */
const DODGE_TAB_WAIT = 0.12;
const DODGE_DIST = 5.2;
const DODGE_TIME = 0.4;
const DODGE_IFRAMES = 0.34;
const DODGE_ATTACK_AT = 0.3;      // roll-attack window (GDD 8.1)
const SOFT_TARGET_RANGE = 25;
const HARD_TARGET_RANGE = 30;
/**
 * External movement axis (Takip Et). Set by installPlayerSocial; returns null when nothing drives the character. Read once per frame
 * by moveAxisNow, so a follow stops the moment this returns null.
 */
export const autoMoveHook: { axis: (() => { x: number; y: number } | null) | null } = { axis: null };

const FACE_HOLD = 0.55;           // seconds the character keeps facing the aim point after a cast
// KayKit clips are chibi-short strides: ground speed (u/s) at which each clip plays at 1.0x. Cartoony speed-up (<= 2x) is intended.
const LOCO_REF = { run: 4.0, strafe: 4.2, back: 2.0, walk: 1.7 };
const SLOT_ACTION: Record<SkillSlotKey, InputAction | null> = {
  lmb: 'skill_lmb', rmb: 'skill_rmb', q: 'skill_q', e: 'skill_e', r: 'skill_r', s1: 'skill_s1', s2: 'skill_s2', s3: 'skill_s3',
  s4: 'skill_s4',
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
// ---- WoW (CONTROLS_WOW §4-§8) ----
const WOW_HARD_RANGE = 45;        // §6: a selection drops beyond 45 m (Aksiyon: HARD_TARGET_RANGE)
const WOW_TAB_RANGE = 40;         // §6: Tab candidates within 40 m
const WOW_TURN_RATE = 3.1;        // §5: TURN_RATE rad/s (~178 deg/s) for the turn keys
const WOW_FACE_LAMBDA = 20;       // §5 row 6: auto-face toward the auto-attack target
const WOW_FACE_MAX = 14;
const WOW_CURSOR_EVERY = 0.1;     // §4.5: context cursor refresh interval (s)
const WOW_TOAST_EVERY = 1;        // §4.4: "Çok uzak" throttle (s)
const WOW_CURSOR: Record<'enemy' | 'interact' | 'loot', string> = {
  enemy: 'url(/assets/cursors/attack.png) 6 6, crosshair',
  interact: 'url(/assets/cursors/interact.png) 6 6, pointer',
  loot: 'url(/assets/cursors/loot.png) 6 6, pointer',
};

/** Roll speed at normalised time u: fast burst that eases out to ~run speed (integrates to DODGE_DIST over DODGE_TIME). */
function dodgeSpeed(u: number): number {
  return (DODGE_DIST / DODGE_TIME) * (1.1 * (1 - u) + 0.45);
}

/** WoW targeting: what kind of enemy-targeting offensive ability a skill is (null = not one: buffs, heals, ground / self effects, movement). */
export function offensiveKind(def: SkillDef): 'melee' | 'ranged' | null {
  if (def.heal || def.allyTarget === 'friendly' || def.requires?.target === 'ally') return null;
  if (!def.damage && !(def.statuses && def.statuses.length)) return null;
  switch (def.targeting) {
    case 'melee_arc': return 'melee';
    case 'target_instant': return def.tags.includes('melee') ? 'melee' : 'ranged';
    case 'projectile': case 'target_projectile': case 'beam': return 'ranged';
    default: return null;
  }
}

export function turnToward(cur: number, want: number, lambda: number, maxRate: number, dt: number): number {
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
/** The live controller (set in the constructor, cleared in dispose): HUD reads its hard target through localHardTargetId(). */
let liveController: PlayerController | null = null;

/** Read-only: the local player's Tab-locked target id (null = none). Soft targets are not included. */
export function localHardTargetId(): EntityId | null {
  return liveController ? liveController.hardTargetId : null;
}

/** Read-only: the local player's focus target id (F8, null = none). A focus frame can read this later. */
export function localFocusTargetId(): EntityId | null {
  return liveController?.focusTarget?.id ?? null;
}

/**
 * Esc fallback (UI.ts): drops the local hard target. Returns true when there was one, so the caller keeps the game menu closed for
 * this press (the next Esc opens it).
 */
export function clearLocalHardTarget(): boolean {
  return liveController ? liveController.clearHardTarget() : false;
}

/** F priority of an interactable (Interactable.interactTier; unset: NPC 1, loot 2, anything else 4). Lower wins. */
function interactTier(e: Interactable): number {
  if (typeof e.interactTier === 'number') return e.interactTier;
  const k = (e as unknown as { kind?: string }).kind;
  return k === 'npc' ? 1 : k === 'loot' ? 2 : 4;
}

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
  /** AE-3: air jumps used since the last landing (İblis Avcısı: 1). */
  private airJumps = 0;
  /** Position at the previous stepVertical (rolling terrain: how far the player moved this frame). */
  private svX = 0;
  private svZ = 0;
  /** Height the current airborne spell started from (grounded height at take-off / walk-off): drop = fallStartY - groundY. */
  private fallStartY = 0;
  /** Falls and drops (§11): safe history, void trigger, landing damage, respawn after the fade. */
  private fall = new FallHandler();
  /** WoW ground mount (game/Mount.ts): cast, ride state and the run-speed multiplier. */
  private mount: MountRider;
  /** WP-12 cosmetic pet that follows the local character (game/Pet.ts). */
  private pet: PetFollower;
  /** Movement input is ignored until this controller time (void respawn: fade-in + VOID_INPUT_LOCK). */
  private inputLockUntil = -1;
  private landUntil = 0;
  private faceHold = 0;
  /** Readability rim (vfx/TargetRim): the hover under the cursor is re-picked every 0.1 s, the target is read every frame. */
  private rimT = 0;
  private farRimT = 0;
  private rimHover: PickHit | null = null;
  /** walkToggle state (walk / run toggle). */
  private walkOn = false;
  /** Autorun state: forward input is injected until W / S is pressed (or the player dies / a panel opens). */
  private autoRunOn = false;
  /** Focus target (F8). */
  private focus: Enemy | null = null;
  /** Input.blurSeq last seen: a change means the window lost focus, so held-press trackers must reset. */
  private seenBlur = 0;
  /** Frozen movement basis of the current jump / fall (WoW air momentum): the keys nudge along the take-off heading. */
  private airBasis: { fx: number; fz: number; rx: number; rz: number } | null = null;
  private loco: Loco = 'idle';
  private dispSpeed = 0;
  private wishSpeed = 0;
  private stepAcc = 0;
  private repeat: Record<SkillSlotKey, number> = { lmb: 0, rmb: 0, q: 0, e: 0, r: 0, s1: 0, s2: 0, s3: 0, s4: 0, m45: 0, m90: 0, m180: 0 };
  private pending: { slot: SkillSlotKey; until: number } | null = null;
  /** controller time until which a heavyAttack press that SkillSystem could not take yet stays buffered (F4). */
  private heavyUntil = -1;
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
  /** WoW: when the Shift press (dodge key) may roll, unless a Tab came in with it (Shift+Tab steps the target). -1 = none. */
  private dodgeDeferAt = -1;
  private tabPressAt = -9;
  /** Tab hold (lock-on, GDD_LIFE §4.7): when it went down, and whether the hold already toggled the lock. */
  private tabDownAt = -1;
  private tabLocked = false;
  /** Side (+1 / -1) the body slid to around a blocking collider last time: the slide keeps it, so it never flip-flops on an edge. */
  private slideSide = 1;
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

  // WoW mouse gestures (CONTROLS_WOW §4.1-§4.3)
  private wowMouse = new WowMouse();
  private wowOut: WowMouseOut = { mouseLook: false, orbit: false, both: false, wantLock: false };
  private wowLockAsked = false;
  /** Esc / alt-tab released the lock during a WoW hold: buttons are ignored until every button is up (§4.3). */
  private mouseSuspended = false;
  private cursorAt = -1;
  private cursorKey = '';
  private wowToastAt = -99;

  // WoW auto-attack (CONTROLS_WOW §8)
  private auto = new AutoAttack();
  private autoSent: string = '';
  /** Facing the auto-attack driver asks for this frame (idle, in reach): read by stepMovement's facing table. */
  private autoFaceWant: number | null = null;

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
    this.mount = new MountRider(player);
    this.pet = new PetFollower(player);
    liveController = this;
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.buildMarker();
    cam.setTarget(player.object3d);
    // first person (FirstPerson.ts): the saved state of this character, the eye at the model height, saved again on every change
    cam.setFirstPerson(!!G.character?.save.flags?.firstPerson);
    cam.setEyeHeight(() => this.player.height);
    cam.onFirstPersonChanged = (on) => {
      const c = G.character;
      if (!c) return;
      c.save.flags.firstPerson = on;
      try { c.persist(); } catch { /* the in-memory state still applies */ }
    };
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
      // CORE_MECHANICS §1.5 (solo-aware roles): StatCalc reads the party size, so a party change refolds the local stats
      G.events.on('party:changed', () => G.character?.recomputeStats()),
      // CONTROLS_WOW §2.3: runtime scheme switch (Ayarlar -> Kontroller)
      G.events.on('settings:changed', (e) => {
        if (e.key === 'controlScheme') this.onSchemeSwitched();
      }),
      // CONTROLS_WOW §8.4: auto-attack stops on scene change, release and (below) death
      G.events.on('scene:leaving', () => this.disarmAuto()),
      G.events.on('player:releaseRequested', () => this.disarmAuto()),
      // CONTROLS_WOW §8.4: a melee skill hit on an enemy starts the swing (setting autoAttackFromSkills, melee mode only)
      G.events.on('damage', (e) => this.onLocalDamage(e.sourceId, e.targetId, e.skillId)),
      // HUD click-to-select (nameplates, target-of-target): left = select, right = select + arm the auto-attack
      G.events.on('target:select', (e) => this.onHudSelect(e.entityId, e.attack === true)),
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
    this.fallStartY = p.position.y;
    this.grounded = true;
    this.fall.cancelPending();
    this.dodge = null;
    this.pending = null;
    this.autoRunOn = false; // a teleport must not carry an autorun on into the new spot
    this.airBasis = null;
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
    this.fall.reset();
    p.velocity.set(0, 0, 0);
    this.loco = 'idle';
  }

  /** Drop target locks etc. (scene changes, death). */
  clearTargets(): void {
    this.hardTarget = null;
    this.softTarget = null;
    this.focus = null;
    this.setLock(null);
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
    this.updateRim(dt);

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

    // WoW: open windows never stop walking, jump, F interact or mouse-look. Only text fields, menus, the layout editor and a modal
    // do (G.ui.gameKeysBlocked). Skills, targets, guard and auto-attack still wait for no window (canInput).
    const moveOk = this.enabled && !dead && !G.ui?.gameKeysBlocked?.();
    const canInput = moveOk && !uiOpen;
    if (!canInput) {
      this.dodgeBuf = -1;
      this.tabDownAt = -1;
      this.shoulderDownAt = -1;
    }
    // the window lost focus (alt-tab): the releases never arrive, so press trackers reset instead of resolving a click / Tab hold
    if (input.blurSeq !== this.seenBlur) {
      this.seenBlur = input.blurSeq;
      this.onWindowBlur();
    }
    this.updateWalkAndAutorun(moveOk);
    // mouse buttons only act on the world when the cursor is captured (action) or free over the game canvas (classic)
    // WoW: skills and potions cast with windows open; only text fields, the game menu, the layout editor and a modal stop them
    const skillsOk = this.enabled && !dead && !G.ui?.skillKeysBlocked?.();
    const mouseOk = skillsOk && (action ? input.isLocked() : true);

    if (canInput && action && input.pressed('toggleLock')) {
      this.cam.shiftLock = !this.cam.shiftLock;
      G.events.emit('ui:toast', { text: this.cam.shiftLock ? 'Kamera kilidi: AÇIK' : 'Kamera kilidi: KAPALI', kind: 'info' });
    }

    // WoW mouse (CONTROLS_WOW §4): gesture flags for the camera and movement, clicks resolved on release, lock, cursor.
    // Runs on dead frames too (canInput is false there), so a held lock is released.
    if (!action) this.updateWowMouse(dt, moveOk, uiOpen);

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
    if (moveOk && input.pressed('dodge')) {
      // WoW: a Tab just before the Shift press makes it a target step, not a roll; otherwise the roll waits for a Tab
      if (!this.wow) this.pressDodge(true);
      else if (this.time - this.tabPressAt > DODGE_TAB_WAIT) this.dodgeDeferAt = this.time + DODGE_TAB_WAIT;
    } else if (moveOk && this.dodgeBuf > this.time) this.pressDodge(false);
    if (this.dodgeDeferAt >= 0 && this.time >= this.dodgeDeferAt) {
      this.dodgeDeferAt = -1;
      if (moveOk) this.pressDodge(true);
    }
    this.updateDodge(dt);

    // ---------------- jump ----------------
    if (moveOk && input.pressed('jump')) this.tryJump();

    // ---------------- movement ----------------
    let axis = moveOk && !this.dodge ? this.moveAxisNow() : { x: 0, y: 0 };
    if (!action) {
      // WoW (§4.1): LMB + RMB runs forward unless S is held (A/D still strafe)
      if (moveOk && this.wowOut.both && !input.down('moveBack')) axis = { x: axis.x, y: 1 };
      // WoW auto-attack driver (§8): arm / disarm / swing decided per frame, before movement and facing
      this.updateAuto(dt, canInput, axis);
      // WoW camera smart pivot (§5, §7.4): only while steering forward (strafe and back-pedal leave it off), and not while one
      // mouse button orbits or mouselooks. A both-button run counts as forward.
      const orbitOnly = this.wowOut.orbit && !this.wowOut.both;
      this.cam.setFollow(moveOk && !this.dodge && axis.y > 0.5 && Math.abs(axis.x) < 0.71 && !orbitOnly && !p.isDead, p.yaw + Math.PI, this.dispSpeed);
    } else {
      // auto-follow (GDD_LIFE §4.4): only while steering straight forward, with nothing locked
      this.cam.setFollow(moveOk && !this.dodge && axis.y > 0.5 && Math.abs(axis.x) < 0.5 && !this.hardTarget && !p.isDead, p.yaw + Math.PI, this.dispSpeed);
    }
    // void respawn: the held key must not walk the player straight back to the edge (fade-in + 0.4 s, §11)
    if (this.time < this.inputLockUntil) {
      axis = { x: 0, y: 0 };
      this.autoRunOn = false;
    }
    this.mount.update(dt, moveOk, axis.x !== 0 || axis.y !== 0);
    this.pet.update(dt);
    this.stepMovement(dt, axis, moveOk, action);
    this.updateFall(dt);

    // ---------------- skills / potions / interact ----------------
    if (skillsOk) {
      this.handleSkills(dt, aim, mouseOk, action);
      if (input.pressed('potionHp')) G.combat.usePotion('hp');
      if (input.pressed('potionMp')) G.combat.usePotion('mp');
    } else {
      this.pending = null;
    }
    this.updateInteract(dt, moveOk);

    // ---------------- animation + sound ----------------
    this.updateLocomotionAnim(dt, axis);
    this.updateFootsteps(dt);
  }

  // =====================================================================================================================
  // Pointer lock
  // =====================================================================================================================

  // =====================================================================================================================
  // Walk toggle, autorun, window blur
  // =====================================================================================================================

  /** Movement axes with autorun applied: forward is injected unless S is held; strafing still adds in. */
  private moveAxisNow(): { x: number; y: number } {
    const input = G.input;
    // player-menu follow (Takip Et, systems/PlayerSocialNet.ts): an external axis wins while it is set and returns non-null
    const ext = autoMoveHook.axis?.();
    if (ext) return ext;
    if (!this.autoRunOn || input.down('moveBack')) return input.moveAxis();
    const x = (input.down('moveRight') ? 1 : 0) - (input.down('moveLeft') ? 1 : 0);
    const len = Math.hypot(x, 1);
    return { x: x / len, y: 1 / len };
  }

  /**
   * walkToggle flips walk / run. autorun starts a forward run along the facing that survives mouse turning and is cancelled by a
   * W or S press (WoW), by death and by any frame without input (a panel opens, a cutscene) so it never resumes unexpectedly.
   */
  private updateWalkAndAutorun(canInput: boolean): void {
    const input = G.input;
    if (!canInput) {
      this.autoRunOn = false;
      return;
    }
    if (input.pressed('walkToggle')) {
      this.walkOn = !this.walkOn;
      G.events.emit('ui:toast', { text: this.walkOn ? 'Yürüme: AÇIK' : 'Yürüme: KAPALI (koşu)', kind: 'info' });
    }
    if (input.pressed('autorun')) {
      this.autoRunOn = !this.autoRunOn;
      G.events.emit('ui:toast', { text: this.autoRunOn ? 'Otomatik koşu: AÇIK' : 'Otomatik koşu: KAPALI', kind: 'info' });
    } else if (this.autoRunOn && (input.pressed('moveForward') || input.pressed('moveBack'))) {
      this.autoRunOn = false;
    }
  }

  /** Window blur: every in-flight press (mouse gesture, Tab hold, shoulder hold) is abandoned, never resolved into a click. */
  private onWindowBlur(): void {
    this.wowMouse.reset();
    this.wowOut = { mouseLook: false, orbit: false, both: false, wantLock: false };
    this.wowLockAsked = false;
    this.tabDownAt = -1;
    this.tabLocked = false;
    this.shoulderDownAt = -1;
    this.shoulderHeld = false;
    this.dodgeBuf = -1;
  }

  private updatePointerLock(dt: number, uiOpen: boolean, action: boolean): void {
    const input = G.input;
    const locked = input.isLocked();

    if (!action) {
      // WoW: the cursor stays free; the lock is borrowed during orbit / mouselook holds (updateWowLock, CONTROLS_WOW §4.3)
      this.swallowLmb = false;
      this.autoRelockPending = false;
      return;
    }

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
    if (!this.enabled) return;
    // WoW (§4.3): Esc / alt-tab while a hold locked the mouse: ignore the buttons until they are all up, no game menu
    if (this.cam.mode !== 'action') {
      this.mouseSuspended = true;
      return;
    }
    // the browser released the lock (Esc / alt-tab): show the game menu unless a panel already wants the cursor
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
    this.disarmAuto(); // CONTROLS_WOW §8.4: death disarms
    this.setLock(null);
    if (this.softTarget) {
      this.softTarget = null;
      this.emitTarget();
    }
    if (this.marker) this.marker.visible = false;
    if (this.markerRing) this.markerRing.visible = false;
    // keep the body on the ground: airborne bodies fall, grounded ones snap to the floor under them (raised floors included)
    if (p.jumpY > 0 || !this.grounded) this.stepVertical(dt);
    else if (p.world) {
      p.position.y = p.world.groundY(p.position.x, p.position.z);
      p.jumpY = 0;
    }
  }

  // =====================================================================================================================
  // Movement
  // =====================================================================================================================

  private actionSpeedMul(): number {
    const p = this.player;
    let mul = p.getActionMoveMul();
    const cast = p.cast;
    // WoW: casting never roots or slows. Moving cuts a hard cast / channel instead (stepMovement), like retail
    if (cast && !this.wow) {
      const def = G.skills?.getDef(cast.skillId);
      if (def?.lockMovement) mul = 0;
      else if (cast.channel) mul *= 0.5;
      else if (cast.duration > 0 && def?.lockMovement !== false) mul = 0;
    }
    // Siper (GDD_V2 §3.4): guarding walks at x0.6
    return G.combat?.isGuarding(p) ? mul * 0.6 : mul;
  }

  /**
   * WoW: moving (or jumping) interrupts a hard cast or a channel, unless the skill is castable on the move (`lockMovement: false`) or
   * the caster hovers (Süzül). Instants are never touched: they run while the character keeps moving.
   */
  private cutCastOnMove(): void {
    const p = this.player;
    const cast = p.cast;
    if (!cast || p.isDead) return;
    const def = G.skills?.getDef(cast.skillId);
    if (def?.lockMovement === false || p.statuses.has('hover')) return;
    G.skills.interrupt(p);
  }

  private stepMovement(dt: number, axis: { x: number; y: number }, canInput: boolean, action: boolean): void {
    const p = this.player;
    const input = G.input;
    const world = p.world!;
    const forced = !!p.forcedMove && world.time < p.forcedMove.until;
    const steering = canInput && !this.dodge && !forced && p.canMove();

    // wish direction in world space
    this.moveBasis(_f, _r);
    let wx = 0, wz = 0;
    const hasInput = steering && (axis.x !== 0 || axis.y !== 0);
    p.moveIntent = hasInput;
    if (this.wow && hasInput) this.cutCastOnMove();
    // WoW air momentum: the jump commits its horizontal velocity, and the keys nudge along the take-off heading. Turning the
    // character / camera mid-air (mouselook, turn keys) must not redirect the velocity, so the basis freezes at take-off.
    const wowAir = this.wow && !this.grounded;
    if (!wowAir) this.airBasis = null;
    else if (!this.airBasis) this.airBasis = { fx: _f.x, fz: _f.z, rx: _r.x, rz: _r.z };
    if (wowAir && this.airBasis) {
      _f.set(this.airBasis.fx, 0, this.airBasis.fz);
      _r.set(this.airBasis.rx, 0, this.airBasis.rz);
    }
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
    let snapFace = false;
    if (this.wow) {
      // CONTROLS_WOW §5 facing table, first match wins. Movement input alone never turns the character (row 7).
      const turnL = !!input.down('turnLeft'), turnR = !!input.down('turnRight');
      if (this.dodge) {
        want = null; // row 1: the roll decides
      } else if (this.wowOut.mouseLook) {
        want = this.cam.faceYaw; // row 2: mouselook. 1:1 like retail: the character takes the camera heading in the same frame
        snapFace = true;
      } else if (G.combat?.isGuarding(p)) {
        // (row 3, "a cast faces the aim point", is gone: retail WoW never turns the character for a cast or an auto-attack)
        want = this.cam.faceYaw; // row 4: guard
        lambda = 30; maxRate = 14;
      } else if (steering && turnL !== turnR) {
        // row 5: turn keys. The character turns directly and the camera turns rigidly with it.
        const d = (turnL ? 1 : -1) * WOW_TURN_RATE * dt;
        p.yaw += d;
        this.cam.rotateYaw(d);
      } else if (this.cam.firstPerson) {
        // first person: the body is the camera (FirstPerson.ts), so casts, auto-attack and moves follow the view
        want = this.cam.faceYaw;
        snapFace = true;
      } else if (this.autoFaceWant !== null) {
        want = this.autoFaceWant; // row 6: auto-attack, idle, target in reach
        lambda = WOW_FACE_LAMBDA; maxRate = WOW_FACE_MAX;
      }
    } else if (this.dodge) {
      want = null; // the roll decides
    } else if (busy) {
      want = this.aimYaw;
      lambda = 42; maxRate = 24;
    } else if (G.combat?.isGuarding(p)) {
      want = this.cam.faceYaw; // Siper: the guarding character faces the camera (GDD_V2 §3.4)
      lambda = 30; maxRate = 14;
    } else if (this.cam.firstPerson) {
      want = this.cam.faceYaw; // first person: the body follows the view (FirstPerson.ts)
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
    if (want !== null && snapFace && p.canMove() && !forced) p.yaw = want;
    else if (want !== null && p.canMove() && !forced) p.yaw = turnToward(p.yaw, want, lambda, maxRate, dt);
    else if (want !== null && forced && busy) p.yaw = turnToward(p.yaw, want, lambda, maxRate, dt);
    // WoW: movement is character-relative, so a turn made this frame (mouselook, turn keys) steers this frame's step, not the next one
    if (this.wow && hasInput && !wowAir) {
      this.moveBasis(_f, _r);
      wx = _f.x * axis.y + _r.x * axis.x;
      wz = _f.z * axis.y + _r.z * axis.x;
      const l2 = Math.hypot(wx, wz) || 1;
      wx /= l2; wz /= l2;
    }

    // ---- speed ----
    let maxSpeed = p.moveSpeed();
    if (this.walking) maxSpeed *= WALK_MUL;
    else maxSpeed *= this.mount.speedMul(); // binek (Mount.ts): +%60 koşu hızı, yürüyüş hariç
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
      // WoW on the ground: full speed on the first frame and a dead stop on release (no ramp, no slide, whatever the frame time)
      if (this.wow && this.grounded) rate = Number.POSITIVE_INFINITY;
      if (!this.grounded) {
        // WoW: no braking in the air (released keys keep the momentum), a small steer while keys are held. Aksiyon keeps AIR_CONTROL.
        if (this.wow) rate = hasInput ? accel * WOW_AIR_CONTROL : 0;
        else rate *= AIR_CONTROL;
      }
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
      const stepUp = this.mount.mounted ? MOUNT_STEP_UP : undefined;
      const hit = world.nav.resolveMove(p.position, ox, oz, p.radius, p.position.y, !this.grounded, stepUp);
      if (hit) {
        // head-on into a circular collider (tree trunk, pillar, a staircase of blocked cells): the push cancels the step and the body
        // sticks. Turn the step by 35 / 65 / 90 deg towards the side it slid to last time (no flip-flop on an edge), else the other side.
        // Every candidate goes through resolveMove, so walls and floors still hold.
        const sx = v.x * dt, sz = v.z * dt;
        const stepLen = Math.hypot(sx, sz);
        const blockedLen = Math.hypot(p.position.x - ox, p.position.z - oz);
        if (stepLen > 1e-4 && blockedLen < stepLen * 0.5) {
          const a0 = Math.atan2(sz, sx);
          search: for (const side of [this.slideSide, -this.slideSide]) {
            for (const deg of [35, 65, 90]) {
              const a = a0 + (side * deg * Math.PI) / 180;
              const cand = new THREE.Vector3(ox + Math.cos(a) * stepLen, p.position.y, oz + Math.sin(a) * stepLen);
              world.nav.resolveMove(cand, ox, oz, p.radius, p.position.y, !this.grounded, stepUp);
              const len = Math.hypot(cand.x - ox, cand.z - oz);
              if (len >= stepLen * 0.5 && len > blockedLen + 0.02) {
                p.position.x = cand.x;
                p.position.z = cand.z;
                this.slideSide = side;
                break search;
              }
            }
          }
        }
      }
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

  /** Falls (§11): safe history, void trigger and the respawn after the fade. Vertical worlds only (flat: no-op). */
  private updateFall(dt: number): void {
    const p = this.player;
    const world = p.world;
    if (!world || !world.vertical) return;
    const pos = p.position;
    const started = this.fall.tick(this.time, dt, { x: pos.x, y: pos.y, z: pos.z, grounded: this.grounded }, this.fallEnv());
    if (started) this.startVoidFall();
    const due = this.fall.due(this.time);
    if (due) this.finishVoidFall(due.spot);
  }

  /** Fall environment for FallHandler: nav flags and the dungeon's kill height at a point. */
  private fallEnv(): FallEnv {
    const world = this.player.world;
    return {
      flagsAt: (x, z) => world?.nav.flagsAt(x, z) ?? 0,
      killY: (x, z) => world?.heights?.killY(x, z) ?? Number.NEGATIVE_INFINITY,
    };
  }

  /** Void fall, first half: black-out and the 25 % max HP damage, taken at the moment of the fall. */
  private startVoidFall(): void {
    if (!this.fall.startVoid(this.time, this.sceneCheckpoint(), this.fallEnv())) return;
    screenFade(1, VOID_FADE_OUT);
    this.applyVoidDamage(FallHandler.voidDamageTaken(this.player.hp, this.player.maxHp));
  }

  /**
   * Void-fall damage: written straight to HP. Armour, resistances, shields, damage-reduction buffs and regeneration are
   * not applied, so the amount is exactly 25 % of max HP (clamped so the player stays at 1 HP).
   */
  private applyVoidDamage(amount: number): void {
    const p = this.player;
    if (!(amount > 0) || p.isDead) return;
    p.hp = Math.max(1, p.hp - amount);
    p.combatTimer = 0;
    G.events.emit('damage', {
      targetId: p.id, sourceId: null, amount, crit: false, type: 'true', kind: 'player_hurt',
      pos: [p.position.x, p.position.y + p.height * 0.7, p.position.z], overkill: 0,
    });
  }

  /** Void fall, second half: teleport to the safe spot, invulnerability, fade back, short input lock. */
  private finishVoidFall(spot: Spot | null): void {
    const p = this.player;
    const world = p.world;
    let target: { x: number; z: number; yaw?: number } = spot ?? { x: p.position.x, z: p.position.z };
    if (!spot && world) {
      const n = world.nav.nearestWalkable(p.position.x, p.position.z, 6);
      if (n) target = { x: n.x, z: n.z };
    }
    this.teleport(target.x, target.z, target.yaw);
    this.fall.onRespawned(p.position.y);
    if (!p.statuses.apply('invulnerable', VOID_INVULN_SEC, { sourceId: null })) {
      console.warn('[fall] invulnerable was not applied after a void respawn');
    }
    this.inputLockUntil = this.time + VOID_FADE_IN + VOID_INPUT_LOCK;
    screenFade(0, VOID_FADE_IN);
    G.events.emit('ui:toast', { text: 'Düştün! (−%25 CAN)', kind: 'warning' });
  }

  /** Fall damage through the normal hit path: unavoidable, not blockable, never lethal (HP stays >= 1). */
  private fallHit(amount: number): void {
    if (!(amount > 0)) return;
    G.combat?.hitLocalPlayer({ sourceId: null, amount, type: 'physical', unavoidable: true, blockable: false, abilityName: 'Düşüş', floorHp: 1 });
  }

  /** DungeonScene keeps its Diriliş checkpoint in a private field; read it structurally (null in other scenes). */
  private sceneCheckpoint(): Spot | null {
    const sc = G.scenes?.current as unknown as { checkpoint?: { x: number; z: number; yaw: number } } | null | undefined;
    const c = sc?.checkpoint;
    return c ? { x: c.x, z: c.z, yaw: c.yaw } : null;
  }

  /** §10.1 absolute vertical integrator. Flat grids: gy = 0 and the arithmetic equals the former jumpY integrator. */
  private stepVertical(dt: number): void {
    const p = this.player;
    const world = p.world;
    if (!world) return;
    const pos = p.position;
    const gy = world.groundY(pos.x, pos.z);
    const fm = p.forcedMove;
    const stepX = this.svX, stepZ = this.svZ;
    this.svX = pos.x;
    this.svZ = pos.z;
    if (fm && fm.vy !== undefined && world.time < fm.until) {
      // skill-driven vertical motion (leaps): SkillSystem owns the arc, no landing call
      pos.y = Math.max(gy, pos.y + fm.vy * dt);
      this.vy = fm.vy;
      this.grounded = pos.y - gy <= 0.001;
    } else if (!this.grounded) {
      const vPrev = this.vy;
      this.vy -= (this.wow ? WOW_GRAVITY : GRAVITY) * dt;
      // AE-3: İblis Avcısı glide: holding jump while falling caps the fall speed; a glide also forgets the fall height (no landing damage)
      if (p.classId === 'demonhunter' && this.vy < -GLIDE_FALL && G.input?.down('jump') && !p.isDead && !this.dodge) {
        this.vy = -GLIDE_FALL;
        this.fallStartY = pos.y;
        const a = p.anim;
        if (a && a.has('Jump_Idle')) a.setBase('Jump_Idle', { fade: 0.1 });
      }
      // WoW: trapezoidal step (exact for constant gravity), so the jump apex and airtime do not depend on the frame rate
      let ny = pos.y + (this.wow ? 0.5 * (vPrev + this.vy) : this.vy) * dt;
      if (world.vertical) {
        // head clearance under a low ceiling: bonk and fall
        const ce = world.ceilingY(pos.x, pos.z);
        if (ny + p.height > ce) {
          ny = ce - p.height;
          this.vy = Math.min(this.vy, 0);
        }
      }
      pos.y = ny;
      // on vertical grids feet may clip AIR_STEP above a new floor while falling; flat grids land on contact, as before
      const reach = world.vertical && this.vy < 0 ? VERT.AIR_STEP : 0;
      if (pos.y <= gy + reach && this.vy <= 0) {
        pos.y = gy;
        this.land(Math.abs(this.vy), this.fallStartY - gy);
      }
    } else {
      const d = pos.y - gy;
      // rolling terrain: running down a 0.48 grade at a slow frame rate drops more than 0.3 m per frame; that is a slope, not a ledge
      const stick = world.terrain ? 0.3 + 0.7 * Math.hypot(pos.x - stepX, pos.z - stepZ) : 0.3;
      if (d <= 0) {
        pos.y = gy; // ground rose (rise <= STEP_UP is guaranteed by resolveMove)
      } else if (d <= stick) {
        pos.y = Math.max(gy, pos.y - 12 * dt); // stick to the ground: stairs down, descending lift
      } else {
        // walked off a ledge / the lift dropped away
        this.grounded = false;
        this.vy = 0;
        this.fallStartY = pos.y;
      }
      if (this.grounded) this.fallStartY = pos.y;
    }
    p.jumpY = Math.max(0, pos.y - gy);
  }

  /** drop = metres fallen since take-off / walk-off. Hard and void landings cost HP (§11). */
  private land(fallSpeed: number, drop: number): void {
    const p = this.player;
    p.jumpY = 0;
    this.vy = 0;
    this.airJumps = 0;
    const wasAir = !this.grounded || p.jumping;
    this.grounded = true;
    p.jumping = false;
    const kind = this.fall.onLand(drop);
    if (kind === 'void') this.startVoidFall();
    else if (kind === 'hard') this.fallHit(FallHandler.hardDamage(drop, p.maxHp));
    if (!wasAir) return;
    G.audio.play('land', { pos: [p.position.x, p.position.y, p.position.z], volume: clamp(fallSpeed / 12, 0.4, 1) });
    G.vfx.spawn('dodge_dust', p.position, { scale: kind === 'hard' ? 1.0 : 0.7 });
    if (fallSpeed > 6 || kind === 'hard') this.cam.punch(-0.1);
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
    // AE-3: İblis Avcısı double jump (once per airtime)
    if (!this.grounded && p.classId === 'demonhunter' && this.airJumps < 1 && !p.isDead && !p.dodging && p.canMove() && !this.dodge) {
      const fm = p.forcedMove;
      if (fm && p.world && p.world.time < fm.until) return;
      this.airJumps++;
      this.vy = this.wow ? WOW_JUMP_V * 1.265 : AIR_JUMP_V;
      p.jumping = true;
      this.fallStartY = p.position.y;
      const a = p.anim;
      if (a) {
        if (a.has('Jump_Idle')) a.setBase('Jump_Idle', { fade: 0.08 });
        if (a.has('Jump_Start')) a.playOnce('Jump_Start', { fade: 0.04, speed: 2.6 });
      }
      p.squash(-0.07);
      G.audio.play('jump', { pos: [p.position.x, p.position.y, p.position.z], pitch: 1.2 });
      G.vfx.spawn('fel_wings', p.position, { scale: 0.7, duration: 0.5 });
      G.vfx.spawn('dodge_dust', p.position, { scale: 0.5 });
      return;
    }
    if (!this.grounded || p.isDead || p.dodging || !p.canMove()) return;
    const world = p.world;
    if (p.forcedMove && world && world.time < p.forcedMove.until) return;
    if (this.wow) this.cutCastOnMove(); // retail: a jump cuts a hard cast
    this.grounded = false;
    p.jumping = true;
    this.vy = this.wow ? WOW_JUMP_V : JUMP_V;
    const gy = world?.groundY(p.position.x, p.position.z) ?? 0;
    this.fallStartY = gy;
    p.position.y = gy + 0.001;
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
    const axis = this.moveAxisNow();
    this.moveBasis(_f, _r);
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
    // WoW (§5): the character never turns into a roll (the clip is picked relative to its facing)
    const keepFacing = (this.cam.mode === 'action' && this.cam.shiftLock) || this.wow;
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

    // F4: the heavyAttack key (Mouse4 / keyboard fallback) starts the charge. A press that SkillSystem cannot take yet (roll, basic
    // step before its cancel window) is retried for 0.35 s, like the LMB buffer. Runs before the slot loop so LMB sees the charge.
    if (input.pressed('heavyAttack')) this.heavyUntil = this.time + 0.35;
    if (this.heavyUntil > this.time && canFireDuringRoll && G.skills.tryHeavyPress(p)) this.heavyUntil = -1;

    for (const slot of SKILL_SLOT_KEYS) {
      // s4 (skill_s4: G in Aksiyon, R in WoW) is wired in both schemes like every other slot
      const act = SLOT_ACTION[slot];
      if (!act) continue;
      const isMouse = slot === 'lmb' || slot === 'rmb';
      if (isMouse && !mouseOk) continue;
      // WoW: skill_rmb is the Digit1 key and the mouse clicks are gestures (updateWowMouse), so the slot loop takes it as any key
      let pressed = input.pressed(act);
      let down = input.down(act);
      // a heavy charge owns LMB until its release: a chain press must not cancel it (SkillSystem.isCharging)
      if (slot === 'lmb' && (this.swallowLmb || G.skills.isCharging(p))) {
        pressed = false;
        down = false;
      }
      // LMB: a press is a light step. Settings.autoCombo (F4 default on) re-fires the chain while held; with it off, holding LMB
      // charges the heavy in SkillSystem (chargeDown), and the heavyAttack key (Mouse4) charges either way
      if (slot === 'lmb' && !G.settings?.data.autoCombo) down = false;
      if (this.repeat[slot] > 0) this.repeat[slot] -= dt;
      if (!pressed && !down) continue;
      if (!pressed && (!p.canAct() || this.repeat[slot] > 0)) continue;
      if (rolling && !canFireDuringRoll) {
        if (pressed) this.pending = { slot, until: this.time + 0.35 };
        continue;
      }
      if (this.fireSlot(slot, aim)) this.repeat[slot] = slot === 'lmb' ? 0 : 0.05;
      else if (!pressed) this.repeat[slot] = slot === 'lmb' ? 0.03 : 0.12;
    }

  }

  /**
   * WoW (Midnight retail) ability targeting, run before a bar skill is cast. Returns false = refuse (a "Hedef yok" / "Menzil dışı" /
   * "Hedefe bakmıyorsun" error was reported), null = nothing to do (not an offensive target ability, or a free-aimed spell),
   * else the enemy the ability will hit.
   *  - no hard target: the enemy in front (else the nearest) within 8 m is acquired and selected (mouseover first);
   *  - melee: 5 m between both hitboxes; ranged: the skill's range and line of sight ("Görüş hattı yok");
   *  - in reach, the character turns to the target at once (auto-face), so facing is never a refusal;
   *  - the caller arms the auto-attack after a successful cast.
   */
  private wowPreCast(slot: SkillSlotKey): { target: Enemy; reaimed: boolean } | null | false {
    const p = this.player;
    const sk = G.skills;
    const id = sk.getSlotSkill(p, slot);
    const def = id ? sk.getDef(id) : undefined;
    const kind = def ? offensiveKind(def) : null;
    if (!def || !kind) return null;
    const act = SLOT_ACTION[slot];
    const edge = !!act && G.input.pressed(act);
    // melee: 5 m between both hitboxes (WOW_TARGET.meleeReachM) + the lunge step of a lunging skill; ranged: the skill's range
    const reach = kind === 'melee'
      ? WOW_TARGET.meleeReachM + (def.params?.lunge ? 1 : 0)
      : Math.min(def.range ?? AUTO.rangedMax, WOW_TAB_RANGE + 5);
    const gapTo = (e: Enemy) => Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) - e.radius - p.radius;
    let tgt = this.hardTarget;
    let reaimed = false;
    const live = !!tgt && !tgt.isDead && !tgt.removed;
    // a stale selection out of reach (a far mob picked earlier) must not refuse the cast while an enemy in reach is on us:
    // the enemy in front / nearest within 8 m takes over when it is in reach (no match: the range error stays)
    if (!live || gapTo(tgt!) > reach) {
      const alt = this.acquireEnemy(kind, WOW_TARGET.autoPickM);
      if (!alt && !live) {
        if (kind === 'melee') {
          if (edge) sk.fail('target');
          return false;
        }
        return null; // a free-aimed projectile still flies along the aim
      }
      if (alt && (!live || gapTo(alt) <= reach)) {
        tgt = alt;
        this.selectEnemy(tgt);
        this.aimFrame = -1;
        reaimed = true;
      }
    }
    if (!tgt) return null;
    const edgeDist = gapTo(tgt);
    if (edgeDist > reach) {
      if (edge) sk.fail('range');
      return false;
    }
    if (kind === 'ranged' && !p.world?.nav.lineOfSight(p.position.x, p.position.z, tgt.position.x, tgt.position.z)) {
      if (edge) sk.fail('los');
      return false;
    }
    // WoW auto-face: an ability at a hard target in reach turns the character to it (never refused for facing)
    this.faceEnemy(tgt);
    return { target: tgt, reaimed };
  }

  /**
   * Retail "auto target enemy": the enemy under the cursor if it is within `radius`, else the nearest living hostile within `radius`
   * (edge distance) in a 90 deg cone in front of the character (melee) or of the camera (ranged, with line of sight).
   */
  private acquireEnemy(kind: 'melee' | 'ranged', radius: number): Enemy | null {
    const p = this.player;
    const world = p.world;
    if (!world) return null;
    // edge to edge (both hitboxes) within `radius`, alive and hostile
    const near = (e: Enemy) => !e.isDead && !e.removed && e.alive && Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) - e.radius - p.radius <= radius;
    const over = this.softTarget;
    if (over && near(over) && (kind === 'melee' || world.nav.lineOfSight(p.position.x, p.position.z, over.position.x, over.position.z))) return over;
    if (kind === 'melee') this.moveBasis(_f, _r);
    else this.cam.getBasis(_f, _r);
    const fl = Math.hypot(_f.x, _f.z) || 1;
    const fx = _f.x / fl, fz = _f.z / fl;
    const byId = new Map<number, Enemy>();
    const cands: FrontCand[] = [];
    for (const e of world.enemies) {
      if (!near(e)) continue;
      const dx = e.position.x - p.position.x, dz = e.position.z - p.position.z;
      const d = Math.hypot(dx, dz);
      const cos = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      if (kind === 'ranged' && !world.nav.lineOfSight(p.position.x, p.position.z, e.position.x, e.position.z)) continue;
      byId.set(e.id, e);
      cands.push({ id: e.id, dist: d, cos, hpFrac: e.hpFrac });
    }
    // the front enemy first, else the nearest within 8 m (any side; the cast turns the character to it): targetSelect.ts
    const id = pickAutoTarget(cands);
    return id == null ? null : byId.get(id) ?? null;
  }

  /** WoW auto-face: the character turns to face `e` at once (ability cast at a target in reach). Camera stays where it is. */
  private faceEnemy(e: Enemy): void {
    const p = this.player;
    const dx = e.position.x - p.position.x, dz = e.position.z - p.position.z;
    if (Math.hypot(dx, dz) < 0.05) return;
    p.yaw = Math.atan2(dx, dz);
    this.aimFrame = -1;
  }

  private fireSlot(slot: SkillSlotKey, aim: AimInfo): boolean {
    const p = this.player;
    let ok = false;
    // WoW targeting (retail): auto-acquire an enemy in front, range / facing errors, auto-attack from the ability
    let wowTarget: Enemy | null = null;
    if (this.wow && slot !== 'lmb') {
      const pre = this.wowPreCast(slot);
      if (pre === false) return false;
      if (pre) {
        // the hit goes to the target (the character already faces it): the aim is the target itself
        wowTarget = pre.target;
        const t = pre.target, dx = t.position.x - p.position.x, dz = t.position.z - p.position.z, len = Math.hypot(dx, dz) || 1;
        aim = { point: [t.position.x, t.position.y, t.position.z], dir: [dx / len, 0, dz / len], targetId: t.id };
      }
    }
    try {
      ok = G.skills.tryCastSlot(p, slot, aim);
    } catch (e) {
      console.error('[controller] tryCastSlot failed', e);
    }
    if (ok && wowTarget && !wowTarget.isDead && !wowTarget.removed) this.armAuto(wowTarget.id); // an offensive ability starts the auto-attack
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

    // the focus target goes away with the enemy
    if (this.focus && (this.focus.isDead || this.focus.removed || !this.focus.alive)) this.focus = null;

    // validate hard target
    const hard = this.hardTarget;
    if (hard) {
      const d = Math.hypot(hard.position.x - px, hard.position.z - pz);
      let drop = hard.isDead || hard.removed || d > (this.wow ? WOW_HARD_RANGE : HARD_TARGET_RANGE);
      // CONTROLS_WOW §6: no LOS drop timer in WoW (a selection survives walls and corners)
      if (!drop && !this.wow) {
        if (!world.nav.lineOfSight(px, pz, hard.position.x, hard.position.z)) {
          this.losLost += 1 / 15;
          if (this.losLost > 2) drop = true;
        } else this.losLost = 0;
      }
      if (drop && (hard.isDead || hard.removed)) {
        // GDD_LIFE §4.7: the locked target died -> pick the nearest one within 8 m and the cone, else release
        // WoW default: the corpse is simply dropped, the next offensive ability auto-acquires (acquireEnemy)
        const alt = this.wow ? null : this.nearestInCone(60, 8, hard);
        this.hardTarget = alt;
        this.losLost = 0;
        this.setLock(alt);
      } else if (drop) {
        this.hardTarget = null;
        this.setLock(null);
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
      // §10.1: a body more than TOL_MELEE above/below needs a clear height-aware sight line (eye to chest)
      if (world.vertical && !world.terrain && Math.abs(e.position.y - p.position.y) > VERT.TOL_MELEE) {
        const eyeY = p.position.y + p.height * 0.9, chestY = e.position.y + e.height * 0.6;
        if (world.nav.raycastY(px, eyeY, pz, e.position.x, chestY, e.position.z) < 1) continue;
      }
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
    if (h) this.setLock(h);
    this.emitTarget();
  }

  /** dir 1 = Tab (next), dir -1 = targetPrev (reverse cycle). */
  private cycleTarget(_action: boolean, dir: 1 | -1 = 1): void {
    const p = this.player;
    const world = p.world;
    if (!world) return;
    const cam = this.cam.camera;
    const wow = this.wow;
    const list: { e: Enemy; x: number; d: number; ag: boolean }[] = [];
    for (const e of world.enemies) {
      if (e.isDead || e.removed || !e.alive) continue;
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
      if (d > (wow ? WOW_TAB_RANGE : HARD_TARGET_RANGE)) continue;
      _p.set(e.position.x, e.position.y + e.height * 0.5, e.position.z).project(cam);
      if (_p.z > 1 || _p.z < -1 || Math.abs(_p.x) > 1.05 || Math.abs(_p.y) > 1.05) continue; // not visible
      list.push({ e, x: _p.x, d, ag: !!e.aggroed });
    }
    const now = this.time;
    const cur = this.hardTarget;
    if (!list.length) {
      // WoW: nothing to cycle to keeps the current selection. Aksiyon keeps its release (Tab with nothing in view lets go).
      if (wow) return;
      if (cur) this.hardTarget = null;
      this.setLock(null);
      this.emitTarget();
      return;
    }
    let next: Enemy | null;
    if (wow) {
      // Midnight retail: Tab steps through the visible enemies nearest first, Shift+Tab backwards; nothing to step to keeps the target
      const id = wowTabNext(list.map((c) => ({ id: c.e.id, dist: c.d })), cur ? cur.id : null, dir);
      const pick = id == null ? null : (list.find((c) => c.e.id === id)?.e ?? null);
      if (!pick || pick === cur) return;
      next = pick;
    } else {
      // Aksiyon keeps screen order; a double-tap releases the target
      list.sort((a, b) => a.x - b.x);
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
        if (now - this.lastTabAt < 0.25) next = null;
        else if (list.length === 1 && i === 0) next = null;
        else if (i < 0) next = (dir > 0 ? list[0] : list[list.length - 1]).e;
        else next = list[(i + dir + list.length) % list.length].e;
      }
    }
    this.lastTabAt = now;
    this.hardTarget = next;
    this.losLost = 0;
    this.setLock(next);
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
    // CONTROLS_WOW §6: WoW cycles on press (no Tab-hold lock), whatever lockOnMode says
    const lockMode = this.wow ? 'tap-cycle' : (G.settings?.data.lockOnMode ?? 'hold-lock');
    if (canInput && input.pressed('targetNext')) {
      this.tabPressAt = this.time;
      this.dodgeDeferAt = -1; // a Tab with Shift held is a target step, never a roll
      // Shift held, or pressed in this same frame (a quick Shift+Tab can release Shift before the frame samples it)
      const back = ['ShiftLeft', 'ShiftRight'].some((k) => input.keyDown(k) || input.keyPressed(k));
      if (lockMode === 'tap-cycle') this.cycleTarget(action, back ? -1 : 1);
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

    // targetPrev: the reverse Tab cycle (a plain press, in both schemes); focusTarget: set / clear the focus target
    if (canInput && input.pressed('targetPrev')) this.cycleTarget(action, -1);
    if (canInput && input.pressed('focusTarget')) this.toggleFocus();

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

  /**
   * F8 (focusTarget): with a target selected, make it the focus (pressing it on the current focus clears it); with no target
   * selected, clear the focus. A focus that dies / despawns is dropped in updateTargets.
   */
  private toggleFocus(): void {
    const t = this.currentTarget();
    if (t && this.focus !== t) {
      this.focus = t;
      G.events.emit('ui:toast', { text: `Odak hedef: ${t.name}`, kind: 'info' });
    } else if (this.focus) {
      this.focus = null;
      G.events.emit('ui:toast', { text: 'Odak hedef temizlendi', kind: 'info' });
    }
  }

  /** Lock-on toggle (Tab hold): release when locked, otherwise lock the soft target or the nearest one in the 60 deg cone. */
  private toggleLockOn(): void {
    if (this.hardTarget) {
      this.hardTarget = null;
      this.losLost = 0;
      this.setLock(null);
    } else {
      const pick = this.softTarget ?? this.nearestInCone(60, HARD_TARGET_RANGE, null);
      if (!pick) {
        G.audio.play('ui_error', { volume: 0.35 });
        return;
      }
      this.hardTarget = pick;
      this.losLost = 0;
      this.setLock(pick);
      G.audio.play('ui_tab', { volume: 0.5 });
    }
    this.emitTarget();
  }

  /** Nearest living enemy within `range` m and inside a `coneDeg` cone around the camera heading (skips `except`). */
  private nearestInCone(coneDeg: number, range: number, except: Enemy | null): Enemy | null {
    const p = this.player;
    const world = p.world;
    if (!world) return null;
    this.moveBasis(_f, _r); // WoW: "facing" is the character's facing (CONTROLS_WOW §8.4)
    const cosLim =Math.cos((coneDeg / 2) * Math.PI / 180);
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
    this.setLock(boss);
    this.emitTarget();
  }

  /** Boss down or the fight wiped: release a boss lock. */
  private releaseBossLock(): void {
    const h = this.hardTarget;
    if (!h || !h.isBoss) return;
    this.hardTarget = null;
    this.setLock(null);
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

  // =====================================================================================================================
  // WoW controls (CONTROLS_WOW §4-§8). Runs only with the classic (WoW) camera; the Aksiyon paths never reach it.
  // =====================================================================================================================

  /** WoW = the classic camera (cameraMode mirrors controlScheme, Game.ts). */
  private get wow(): boolean {
    return this.cam.mode === 'classic';
  }

  /** §6: a WoW selection never locks the camera. */
  private setLock(t: Enemy | null): void {
    this.cam.setLockOn(this.wow ? null : t);
  }

  /** Movement basis: the character's facing in WoW (§5), the camera heading in Aksiyon. */
  private moveBasis(f: THREE.Vector3, r: THREE.Vector3): void {
    if (!this.wow) {
      this.cam.getBasis(f, r);
      return;
    }
    const s = Math.sin(this.player.yaw), c = Math.cos(this.player.yaw);
    f.set(s, 0, c);
    r.set(-c, 0, s);
  }

  /** One short WoW toast, at most one per WOW_TOAST_EVERY seconds. */
  private wowToast(text: string): void {
    if (this.time - this.wowToastAt < WOW_TOAST_EVERY) return;
    this.wowToastAt = this.time;
    G.events.emit('ui:toast', { text, kind: 'warning' });
  }

  /** Rim on one entity: a hovered NPC (yellow), else the hovered or targeted enemy (red). Nothing while the cursor is over UI. */
  private updateRim(dt: number): void {
    const input = G.input;
    this.rimT -= dt;
    if (this.rimT <= 0) {
      this.rimT = 0.1;
      const cursorFree = !!input && !input.pointerOverUI && !G.ui?.wantsCursor?.() && !document.pointerLockElement;
      this.rimHover = cursorFree ? this.wowPick(input.ndcX, input.ndcY) : null;
    }
    // WoW clarity: the hovered unit and the target each keep their own rim (green = friendly NPC, red = hostile enemy).
    const hov = this.rimHover;
    const enemyKind = (e: unknown): 'hostile' | 'neutral' => ((e as { def?: { ai?: { neutral?: boolean } } }).def?.ai?.neutral ? 'neutral' : 'hostile');
    if (hov?.kind === 'npc' && !hov.entity.removed) setRim('hover', hov.entity.object3d, 'friendly');
    else if (hov?.kind === 'enemy' && hov.entity.alive && !hov.entity.removed) setRim('hover', hov.entity.object3d, enemyKind(hov.entity));
    else setRim('hover', null, null);
    const tgt = this.currentTarget();
    if (tgt && tgt.alive && !tgt.removed && !(hov?.kind === 'enemy' && hov.entity === tgt)) setRim('target', tgt.object3d, enemyKind(tgt));
    else setRim('target', null, null);
    this.farRimT -= dt;
    if (this.farRimT <= 0) {
      // faint rim on living enemies beyond 25 m (read every 0.25 s; the shells follow the entity, not the cursor)
      this.farRimT = 0.25;
      const pl = this.player.position;
      for (const e of this.player.world?.enemies ?? []) {
        const want = e.alive && !e.removed && e !== tgt && e !== hov?.entity && Math.hypot(e.position.x - pl.x, e.position.z - pl.z) > 25 && Math.hypot(e.position.x - pl.x, e.position.z - pl.z) < 110;
        setFarRim(e.object3d, want ? enemyKind(e) : null);
      }
    }
    cullFarRims(this.cam.camera);
  }

  private wowPick(ndcX: number, ndcY: number): PickHit | null {
    const world = this.player.world;
    return world ? pickAtNdc(this.cam.camera, world, ndcX, ndcY) : null;
  }

  /** §4.1-§4.3: gesture state for this frame, clicks resolved on release, the pointer lock and the cursor. */
  private updateWowMouse(dt: number, canInput: boolean, uiOpen: boolean): void {
    const input = G.input;
    const p = this.player;
    // a suspended mouse (Esc / alt-tab during a hold) comes back once every button is up
    if (this.mouseSuspended && !input.keyDown('Mouse0') && !input.keyDown('Mouse2')) this.mouseSuspended = false;
    // Mouse presses over UI never reach Input's held / justDown sets while the cursor is free; pointerOverUI guards the
    // press frame as well, so a click on a panel can never select, orbit, confirm an aim or cancel one
    const out = this.wowMouse.update({
      dt,
      l: input.keyDown('Mouse0'),
      r: input.keyDown('Mouse2'),
      lPressed: input.keyPressed('Mouse0') && !input.pointerOverUI,
      rPressed: input.keyPressed('Mouse2') && !input.pointerOverUI,
      dx: input.mouseDX,
      dy: input.mouseDY,
      ndcX: input.ndcX,
      ndcY: input.ndcY,
      enabled: canInput && !this.mouseSuspended, // canInput here is moveOk: mouse-look works with windows open
      aiming: G.skills.isAiming(p),
    });
    this.wowOut = out;
    // a ground aim is confirmed by SkillSystem on the Mouse0 press itself; a click that lands while it waits (confirmAim) is
    // swallowed here: no selection, no orbit. RMB cancels the aim.
    if (out.cancelAim) G.skills.cancelAim(p);
    if (out.clickL) this.wowClickL(out.clickL.ndcX, out.clickL.ndcY);
    if (out.clickR) this.wowClickR(out.clickR.ndcX, out.clickR.ndcY);
    this.updateWowLock(out);
    this.updateWowCursor(dt, out, uiOpen);
  }

  /**
   * LMB click: an enemy under the cursor is selected, no attack (Midnight retail). Empty ground keeps the selection; only Esc
   * clears it (clearHardTarget).
   */
  private wowClickL(ndcX: number, ndcY: number): void {
    const hit = this.wowPick(ndcX, ndcY);
    if (hit?.kind === 'enemy') this.selectEnemy(hit.entity as Enemy);
    // a friendly NPC, loot or interactable under the cursor: nothing (§4.1)
  }

  /** RMB click (§4.1, §4.4): enemy -> select and arm; interactable in reach -> interact; too far -> "Çok uzak". */
  private wowClickR(ndcX: number, ndcY: number): void {
    const p = this.player;
    const hit = this.wowPick(ndcX, ndcY);
    if (!hit) return;
    if (hit.kind === 'enemy') {
      const e = hit.entity as Enemy;
      this.selectEnemy(e);
      this.armAuto(e.id);
      return;
    }
    const e = hit.entity;
    if (!isInteractable(e)) return;
    const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
    if (d > e.interactRange + e.radius) {
      this.wowToast('Çok uzak');
      return;
    }
    if (e.canInteract && !e.canInteract(p)) return;
    try {
      e.interact(p);
    } catch (err) {
      console.error('[controller] interact failed', err);
    }
  }

  /** WoW selection. Switching the selection while armed keeps the driver armed and moves it to the new enemy (§8.4). */
  private selectEnemy(e: Enemy | null): void {
    if (this.hardTarget === e) return;
    this.hardTarget = e;
    this.losLost = 0;
    this.setLock(e);
    if (e) {
      G.audio.play('ui_tab', { volume: 0.5 });
      if (this.auto.armed) {
        this.auto.setTarget(e.id);
        this.emitAuto();
      }
    }
    this.emitTarget();
  }

  /** target:select from the HUD. Only living enemies are selectable; the auto-attack arms on a right click. */
  private onHudSelect(id: number, attack: boolean): void {
    const a = (this.player.world ?? G.world)?.getActor(id);
    if (!a || a.kind !== 'enemy' || a.isDead || a.removed) return;
    const e = a as Enemy;
    this.selectEnemy(e);
    if (attack) this.armAuto(e.id);
  }

  /** §8.4: arming on an enemy. A class whose autoInfo().mode is 'off' never arms. */
  private armAuto(targetId: number): void {
    if (G.skills.autoInfo(this.player).mode === 'off') return;
    this.auto.arm(targetId);
    this.emitAuto();
  }

  /** §4.3: the lock is borrowed while a hold asks for it (once per hold), and released when no hold, a panel or a scheme change needs it. */
  private updateWowLock(out: WowMouseOut): void {
    const input = G.input;
    const locked = input.isLocked();
    // a hold that starts over a window never gets here (pointerOverUI), so an open window alone does not stop the mouse-look
    if (out.wantLock && this.enabled && !this.mouseSuspended) {
      if (!locked && !this.wowLockAsked && !input.pointerOverUI) {
        this.wowLockAsked = true; // a refused request is not retried within the same hold
        input.lock();
      }
      return;
    }
    if (!out.wantLock) this.wowLockAsked = false;
    if (locked) {
      this.expectedUnlock = true;
      input.unlock();
    }
  }

  /**
   * §4.5: the context cursor on the canvas (refreshed every 0.1 s). THE single writer of canvas.style.cursor while the WoW scheme
   * runs (ThirdPersonCamera no longer touches it). Hidden only once a press became a drag (D7: 3 px or 0.12 s, WowMouse.wantLock),
   * so a plain click never flickers the cursor.
   */
  private updateWowCursor(dt: number, out: WowMouseOut, uiOpen: boolean): void {
    const canvas = G.engine?.canvas;
    if (!canvas) return;
    let next = '';
    if (out.wantLock) next = 'none';
    else if (!uiOpen && !G.input.pointerOverUI && !G.input.isLocked()) next = this.hoverCursor(dt);
    if (canvas.style.cursor !== next) canvas.style.cursor = next;
  }

  private hoverCursor(dt: number): string {
    this.cursorAt -= dt;
    if (this.cursorAt <= 0) {
      this.cursorAt = WOW_CURSOR_EVERY;
      this.cursorKey = this.hoverKind();
    }
    return this.cursorKey;
  }

  private hoverKind(): string {
    const hit = this.wowPick(G.input.ndcX, G.input.ndcY);
    if (!hit) return '';
    if (hit.kind === 'enemy') return WOW_CURSOR.enemy;
    const e = hit.entity;
    if (!isInteractable(e)) return '';
    const d = Math.hypot(e.position.x - this.player.position.x, e.position.z - this.player.position.z);
    if (d > e.interactRange + e.radius) return '';
    return hit.kind === 'loot' ? WOW_CURSOR.loot : WOW_CURSOR.interact;
  }

  /**
   * §8: the auto-attack driver. Toggle key, the per-frame tick (reach, facing, leash, retarget) and the swing request.
   * SkillSystem owns the chain (autoSwing); this decides when to ask for the next step. Runs before movement.
   */
  private updateAuto(dt: number, canInput: boolean, axis: { x: number; y: number }): void {
    const p = this.player;
    const world = p.world;
    const sk = G.skills;
    this.autoFaceWant = null;
    if (!this.wow || !world) {
      if (this.auto.armed) this.disarmAuto();
      return;
    }
    const info = sk.autoInfo(p);

    // toggle key (MMB / =): disarm, or arm the selection / the nearest enemy in the cone (no arming when the mode is off)
    if (canInput && G.input.pressed('autoAttack')) {
      if (this.auto.armed) this.auto.disarm();
      else if (info.mode === 'off') this.wowToast('Bu sınıf otomatik saldırı yapamaz');
      else {
        const selected = this.hardTarget ? this.hardTarget.id : null;
        const nearest = selected === null ? this.nearestInCone(AUTO.retargetCone, AUTO.retargetRange, null) : null;
        const r = this.auto.toggle(selected, nearest ? nearest.id : null);
        if (r.toast) this.wowToast(r.toast);
      }
      this.emitAuto();
    }
    if (!this.auto.armed) return;

    const tgt = this.auto.targetId !== null ? world.get<Enemy>(this.auto.targetId) : undefined;
    const mouseLook = this.wowOut.mouseLook;
    const heading = mouseLook ? this.cam.faceYaw : p.yaw;
    let target: AutoTarget | null = null;
    if (tgt && tgt.kind === 'enemy') {
      const dx = tgt.position.x - p.position.x, dz = tgt.position.z - p.position.z;
      target = {
        id: tgt.id,
        // WoW melee reach: metres between both hitboxes
        dist: Math.max(0, Math.hypot(dx, dz) - tgt.radius - p.radius),
        angleDeg: Math.abs(angleDiff(heading, Math.atan2(dx, dz))) * 180 / Math.PI,
        los: info.mode !== 'ranged' || world.nav.lineOfSight(p.position.x, p.position.z, tgt.position.x, tgt.position.z),
        valid: !tgt.isDead && !tgt.removed && tgt.alive,
      };
    }
    // WoW default: a dead target is NOT replaced. The driver disarms; the next offensive ability auto-acquires (acquireEnemy)
    const nearestId: number | null = null;
    // stun, hard cast, charge, ground aim, roll before its attack window, !canAct, panels, chat: pause (never disarm)
    const paused = !canInput || p.statuses.stunned || !!p.cast || !p.canAct() || sk.isAiming(p) || sk.isCharging(p)
      || (!!this.dodge && this.dodge.t < DODGE_ATTACK_AT);
    const out = this.auto.tick({
      dt,
      mode: info.mode,
      reach: info.reach,
      ready: info.ready,
      paused,
      dead: false,
      target,
      nearestId,
      moving: axis.x !== 0 || axis.y !== 0,
      mouseLook,
      inCombat: p.inCombat,
    });
    if (out.toast) this.wowToast(out.toast);
    // auto-face: idle and in reach, the character turns toward the target (the swing is then always in front)
    if (out.faceTarget && target && tgt) {
      const dx = tgt.position.x - p.position.x, dz = tgt.position.z - p.position.z;
      this.autoFaceWant = Math.atan2(dx, dz);
    }
    if (out.swing && target && tgt) {
      const dx = tgt.position.x - p.position.x, dz = tgt.position.z - p.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const aim: AimInfo = { point: [tgt.position.x, tgt.position.y, tgt.position.z], dir: [dx / len, 0, dz / len], targetId: tgt.id };
      if (sk.autoSwing(p, aim)) this.timeSinceCast = 0;
    }
    this.emitAuto();
  }

  /** §8.4: a melee skill hit on an enemy starts the swing (WoW rule, setting autoAttackFromSkills, melee mode only). */
  private onLocalDamage(sourceId: number | null, targetId: number, skillId: string | undefined): void {
    const p = this.player;
    if (!this.wow || this.auto.armed || sourceId !== p.id || !skillId || !G.settings?.data.autoAttackFromSkills) return;
    if (G.skills.getDef(skillId)?.targeting !== 'melee_arc') return;
    const e = p.world?.get<Enemy>(targetId);
    if (!e || e.kind !== 'enemy' || e.isDead || e.removed) return;
    if (G.skills.autoInfo(p).mode !== 'melee') return;
    this.auto.arm(e.id);
    this.emitAuto();
  }

  /** Silent disarm (death, scene change, release, scheme change). */
  private disarmAuto(): void {
    this.auto.disarm();
    this.autoFaceWant = null;
    this.emitAuto();
  }

  /** `autoattack:state` (armed, target id) whenever either changes. */
  private emitAuto(): void {
    const armed = this.auto.armed;
    const targetId = armed ? this.auto.targetId : null;
    const key = `${armed}:${targetId}`;
    if (key === this.autoSent) return;
    this.autoSent = key;
    G.events.emit('autoattack:state', { armed, targetId });
  }

  /**
   * Ayarlar -> Kontroller switched the scheme at runtime (CONTROLS_WOW §2.3). Game.ts (earlier listener) has re-applied the
   * bindings and mirrored cameraMode already.
   */
  private onSchemeSwitched(): void {
    const input = G.input;
    if (input.isLocked()) {
      this.expectedUnlock = true;
      input.unlock();
    }
    this.wowLockAsked = false;
    this.mouseSuspended = false;
    this.wowMouse.reset();
    this.wowOut = { mouseLook: false, orbit: false, both: false, wantLock: false };
    this.disarmAuto();
    this.cam.onSchemeChanged();
    this.cursorAt = -1;
    this.cursorKey = '';
    if (G.engine?.canvas) G.engine.canvas.style.cursor = '';
    const toAksiyon = G.settings?.data.controlScheme === 'aksiyon';
    if (toAksiyon) this.autoRelockPending = true;
    G.events.emit('ui:toast', { text: `Kontrol şeması: ${toAksiyon ? 'Aksiyon' : 'WoW'}`, kind: 'info' });
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
    m.position.set(t.position.x, t.position.y + ((t as { visualHeight?: number }).visualHeight ?? t.height) + 0.45 + s * 0.35 + bob * s, t.position.z);
    m.rotation.y += dt * (hard ? 3.2 : 1.6);
    m.scale.setScalar(hard ? s * 1.2 : s);
    (m.material as THREE.MeshBasicMaterial).color.setHex(hard ? 0xffb020 : 0xff3a2a);
    r.visible = hard;
    if (hard) {
      // WoW selection ring: red for a hostile, yellow for a neutral
      (r.material as THREE.MeshBasicMaterial).color.setHex(t.kind === 'enemy' ? 0xff3a2a : 0xffd060);
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
      // F picks one target: in front of the player first (a thing right beside us counts as in front), then the F priority
      // tier (quest NPC, other NPC, loot, gather node, stall / board / object), then the nearer one. The prompt names that target.
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      let best: Interactable | null = null;
      let bestD = 1e9;
      let bestTier = 99;
      let bestFront = false;
      let bestId = -1;
      for (const e of world.entities.values()) {
        if (e.removed) continue;
        const k = e.kind;
        if (k !== 'npc' && k !== 'interactable' && k !== 'loot') continue;
        if (!isInteractable(e)) continue;
        const dx = e.position.x - p.position.x, dz = e.position.z - p.position.z;
        const d = Math.hypot(dx, dz);
        if (d > e.interactRange + e.radius) continue;
        if (e.canInteract && !e.canInteract(p)) continue;
        const front = d <= 1.5 || dx * fx + dz * fz >= 0;
        const tier = interactTier(e);
        const better = best === null || (front !== bestFront ? front : tier !== bestTier ? tier < bestTier : d < bestD);
        if (!better) continue;
        best = e;
        bestD = d;
        bestTier = tier;
        bestFront = front;
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
      a.setBase(this.idleClip(a), { fade: 0.15, speed: 1 });
      return;
    }
    if (speed < 0.35) {
      a.setBase(this.idleClip(a), { fade: 0.15, speed: 1 });
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

    const slow = this.walking || this.wishSpeed < p.baseMoveSpeed * 0.52;
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
      ts = clamp(speed / LOCO_REF.back, 0.7, 2.4);
    } else {
      const want = st === 'left' ? 'Running_Strafe_Left' : 'Running_Strafe_Right';
      name = a.has(want) ? want : a.pick('Running_A') ?? 'Idle';
      ts = clamp(speed / LOCO_REF.strafe, 0.6, 1.9);
    }
    a.setBase(name, { fade: 0.15, speed: ts });
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
    const walk = this.walking || this.dispSpeed < p.baseMoveSpeed * 0.52;
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

  /** Read-only id of the Tab-locked (hard) target, or null. The soft target is never reported here. */
  get hardTargetId(): EntityId | null {
    return this.hardTarget ? this.hardTarget.id : null;
  }

  /** Focus target (F8 / focusTarget): set or cleared by the key, independent of the hard / soft target. Null when none. */
  get focusTarget(): Enemy | null {
    return this.focus;
  }

  /** True while the player walks (held walk key or the walkToggle state). */
  get walking(): boolean {
    return this.walkOn || !!G.input?.down('walk');
  }

  /** True while autorun is on. */
  get autorunning(): boolean {
    return this.autoRunOn;
  }

  /** Drops the hard target. Returns false when there was none (Esc fallback in UI.ts). */
  clearHardTarget(): boolean {
    if (!this.hardTarget) return false;
    this.hardTarget = null;
    this.losLost = 0;
    this.setLock(null);
    if (this.wow) this.disarmAuto(); // Esc stops the auto-attack with the target
    this.emitTarget();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    if (liveController === this) liveController = null;
    const sk = G.skills as unknown as { aimProvider: (() => AimInfo) | null } | undefined;
    if (sk && sk.aimProvider === this.aimFn) sk.aimProvider = null;
    for (const off of this.unsubs) off();
    this.unsubs = [];
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.cam.onFirstPersonChanged = null;
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
    this.setLock(null);
    this.disarmAuto();
    this.mount.dispose();
    this.pet.dispose();
    if (G.engine?.canvas) G.engine.canvas.style.cursor = '';
  }
}
