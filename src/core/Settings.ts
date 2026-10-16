import { SCHEME_ACTIONS, type ControlScheme, type InputAction } from './Input';

/** CONTROLS_WOW D1: cameraMode is derived from controlScheme (the camera keeps its internal 'action' / 'classic' names). */
function cameraModeOf(s: ControlScheme): 'action' | 'classic' {
  return s === 'wow' ? 'classic' : 'action';
}

export interface SettingsData {
  // graphics
  psx: boolean;
  psxPixelScale: number;     // 1..6 (render resolution divisor for the PSX look)
  psxJitter: number;         // 0..1 vertex snapping strength
  psxAffine: boolean;
  psxDither: boolean;
  psxColorDepth: number;     // bits per channel 3..8
  bloom: boolean;
  bloomStrength: number;
  shadows: boolean;
  renderScale: number;       // device pixel ratio cap 0.5..2
  fov: number;
  showFps: boolean;
  damageNumbers: boolean;
  screenShake: number;       // 0..1
  // camera / controls
  cameraMode: 'action' | 'classic'; // action = pointer-lock shift-lock style, classic = WoW RMB drag
  mouseSensitivity: number;  // 0.2..3
  invertY: boolean;
  cameraDistance: number;
  autoLoot: boolean;
  lootFilter: 'all' | 'uncommon' | 'rare' | 'epic';
  /** Loot V3 §6: gray items are sold, white / green ones salvaged on drop ('off' = keep everything). */
  autoSalvage: 'off' | 'poor' | 'common' | 'unneeded';
  // audio
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  uiVolume: number;
  // misc
  playerName: string;        // online display name fallback
  bindings: Partial<Record<InputAction, string[]>>;
  language: 'tr';
  /** Bottom HUD style. 'elvui' (UI_REDESIGN, the only mounted skin from UX-10 on, default) · 'metin2' (stone bar) · 'orbs' (Diablo orbs). Parked skins stay compiled. */
  hudStyle: 'elvui' | 'metin2' | 'orbs';
  // GDD_V2 (WP1 contracts). Defaults below; old settings files merge over them.
  /** Heal target picking mode (GDD_V2 §1.6). */
  healTargeting: 'smart' | 'frames' | 'crosshair';
  /** Hold LMB auto-repeats the light chain (GDD_V2 O2, F4 default ON). OFF = holding LMB charges the heavy; the heavyAttack keys (Mouse4, Minus) always charge. */
  autoCombo: boolean;
  /** Schema version of the stored settings (see SETTINGS_VERSION and the migration in Settings's constructor). */
  settingsVersion: number;
  /** M+ nameplate forces tag (GDD_V2 §8.1). */
  showForces: boolean;
  /** Enemy nameplates: always (within 40 m) · combat only (in a fight, aggro or target) · off (the target still shows). */
  nameplates: 'always' | 'combat' | 'off';
  /** Colour-blind-safe nameplates (Okabe-Ito palette: blue friends, orange / vermillion foes instead of green / red). Default off. */
  colorBlindNameplates: boolean;
  /** Kick tracker widget (GDD_V2 §8.4). */
  kickTracker: boolean;
  /** Tank route overlay (GDD_V2 §8.2 / §8.3). */
  showTankRoute: boolean;
  // GDD_TALENTS (T0 contracts). Default below; old settings files merge over it.
  /** Web (passive) view: pure additions auto-apply after 1.5 s without the Uygula step (GDD_TALENTS §5.5). Default ON. */
  autoApplyPassives: boolean;
  // GDD_ITEMS_V2 (IT-00). Armor glow quality (§1.8) and the forge fast mode (§2.9).
  /** Zırh Parlaması: off / low (shader only) / high (shader + particles + light). */
  armorGlow: 'off' | 'low' | 'high';
  /** Skip the blacksmith ceremony delays (× 0.15). */
  fastForge: boolean;
  // GDD_LIFE (L-00). Chat (§3.2): filter, font, opacity, timestamps, bubbles, trade mute, ignore list.
  /** Profanity-safe filter on incoming text (ChatFilter.ts, §3.7). */
  chatFilter: boolean;
  /** Chat font size in px. UI_REDESIGN UX-00: default 15, every reader clamps to 13..17. */
  chatFontSize: number;
  /** Chat background alpha 0.2..1 (idle). */
  chatOpacity: number;
  /** Show [HH:MM] timestamps in chat lines. */
  chatTimestamps: boolean;
  /** Speech bubbles above avatars: say / yell / emote (range 25 m, yell 100 m) and party lines. */
  chatBubbles: boolean;
  /** Mute the Ticaret (trade) channel. */
  chatTradeMuted: boolean;
  /** Character names whose chat lines and whispers are hidden locally. */
  chatIgnore: string[];
  // GDD_LIFE §4.14 (L-00): camera settings (rows in panels-game/settings.ts under "Kamera").
  /** Camera swings behind the player when moving (auto-follow). */
  cameraAutoFollow: boolean;
  /** Shoulder side swaps automatically away from walls. */
  cameraAutoShoulder: boolean;
  /** Zoom-in in combat (pivot / FOV curve). */
  cameraCombatZoom: boolean;
  /** Camera leads the movement direction a little. */
  cameraLookAhead: boolean;
  /** Pitch sensitivity relative to yaw, 0.5..1.5. */
  cameraSensYRatio: number;
  /** Mouse acceleration 0..1. */
  cameraAccel: number;
  /** Rotation smoothing 0..0.4 (time constant smoothing × 0.1 s). */
  cameraSmoothing: number;
  /** Props between camera and player turn transparent. */
  occluderFade: boolean;
  /** Cinematic boss intro: off / short (2.2 s) / full (3.4 s). */
  bossIntroCam: 'off' | 'short' | 'full';
  /** Lock-on camera on boss engage. */
  bossAutoLock: boolean;
  /** Tab behaviour of the lock-on: hold to lock or tap to cycle. */
  lockOnMode: 'hold-lock' | 'tap-cycle';
  /** Gamepad rumble (no effect on keyboard play). */
  rumble: boolean;
  /** Voxel-PSX model set (src/core/voxelRemap.ts). Read at page load: a change needs a reload. `?voxel=0` / `?voxel=1` override it. */
  voxelModels: boolean;
  // ---- WoW-faithful combat feel (COMBAT_WOW CW-01, append-only). Read by combat/gcd.ts, spellQueue.ts, procs and CW-05 text.
  /** Global cooldown profile: 'arpg' = 1.0 s / (1 + haste), floor 0.5 s (default); 'wow' = 1.5 s / (1 + haste) (CORE_MECHANICS §10.1). */
  gcdProfile: 'arpg' | 'wow';
  /** Spell queue window in ms (0 = off). A skill pressed during a cast / GCD fires as soon as it is ready. */
  spellQueueMs: number;
  /** Proc and ready glow on the ability bar and the spell overlay (CW-09 / CW-08). */
  abilityGlow: boolean;
  /** Lead skip: a cast starts partway into its windup so the hit lands on time (CW-04). Heavy skills are excluded by rule. */
  leadSkip: boolean;
  /** Damage number style: 'school' = school colour + amount scale (default), 'classic' = one colour (CW-05). */
  numberStyle: 'school' | 'classic';
  // ---- UI_REDESIGN UX-00 (append-only, Appendix A). Read by the HUD, the meter, the tracker and the chat.
  /** Dövüş Ölçer visibility: 'auto' = party ≥ 2, dungeon, or combat within 15 s (default); 'always'; 'never'. */
  meterVisibility: 'auto' | 'always' | 'never';
  /** Empty ghost cells in the action bar (false = quiet progressive bar, the default). */
  barGhostSlots: boolean;
  /** Çubukları kilitle (key kept from the old "Barları Kilitle"): while on, picking a cell up from an action bar needs Shift held (WoW). Default off. */
  barLock: boolean;
  /** Spec icon block in the player frame (off by default). */
  ufIcon: boolean;
  /** Chat stats line (Kritik · Hız · Soğuma · Kaçınma). */
  showStats: boolean;
  /** Minimap clock; with showFps also the FPS / ms text. */
  showMapInfo: boolean;
  /** One-time contextual tips (UX-20). */
  showTips: boolean;
  /** Objective arrow towards the pinned quest target (UX-20). */
  questArrow: boolean;
  /** Schema revision of the UI settings. Stored files below 2 are migrated once (hudStyle → 'elvui', chat font 13 → 15). */
  uiRev: number;
  /** Schema revision of the stored key bindings. Stored files below 1 are migrated once (see the constructor). */
  bindingsRev: number;
  // CONTROLS_WOW §2.1 (append-only). Source of truth for the scheme; cameraMode is derived from it.
  /** Control scheme (CONTROLS_WOW D1). 'wow' is the default. */
  controlScheme: ControlScheme;
  /** Revision of the control-scheme migration (migrateControlsRev). Stored files below 1 are migrated once. */
  controlsRev: number;
  /** Overrides of the scheme-specific actions (SCHEME_ACTIONS), per scheme. `bindings` keeps the shared overrides only. */
  schemeBindings: { wow?: Partial<Record<InputAction, string[]>>; aksiyon?: Partial<Record<InputAction, string[]>> };
  /** Wanted zoom of the WoW camera (m), 2..30. `cameraDistance` stays the Aksiyon zoom. */
  cameraDistanceWow: number;
  /** WoW smart pivot: the camera eases behind the character while it runs forward. */
  cameraSmartPivot: boolean;
  /** Revision of the WoW camera distance default (13 m, was 10). Stored files below 1 whose distance is the old 10 m default move to 13 once; a custom distance is kept. */
  cameraDistRev: number;
  /** Tekerlekle birinci şahıs: zooming in past the minimum enters first person (FirstPerson.ts). Off = the wheel never enters it. */
  firstPersonWheel: boolean;
  /** Casters auto-fire their LMB chain at range (CONTROLS_WOW Q1). */
  casterAutoShot: boolean;
  /** Revision of the casterAutoShot default (migrated once: stored files below 1 get casterAutoShot = true). */
  casterAutoShotRev: number;
  /** A melee skill that hits an enemy arms the WoW auto-attack. */
  autoAttackFromSkills: boolean;
  /** True once the one-time "scheme changed" hint has been shown. */
  controlsHintShown: boolean;
  /** Revision of the barGhostSlots default (migrated once: stored files below 1 get barGhostSlots = true). */
  barGhostRev: number;
  /** Görüntü Kalitesi (world/WorldPerf): scenery draw distances, voxel LOD tiers and ground-cover density. Visual only; same world on every peer. 'mid' (Orta) is the default. */
  graphicsQuality: 'low' | 'mid' | 'high';
  /** Çimen yoğunluğu (world/GrassField): dense grass blades and flowers near the camera. 'off' hides them. Default 'mid' (Orta). */
  grassDensity: 'off' | 'low' | 'mid' | 'high';
  /** Gün/Gece döngüsü (world/DayCycle): 'on' runs the 48 minute world clock; 'off' (Hep gündüz) pins it to midday. Visual only. */
  dayNightCycle: 'on' | 'off';
  /** Revision of the crisp-look defaults (psx off, no jitter / affine / dither). Stored files below 1 get them once (see the constructor). */
  gfxLookRev: number;
  /** Revision of the WoW-clarity defaults (renderScale 2 = native device pixels). Stored files below 1 get renderScale 2 once. */
  gfxClarityRev: number;
  // ---- AUDIO_MIX (append-only). Calmer mix: ambience slider, Savaş sesleri Az / Normal, hover blip, and the mix revision.
  /** Ambience bed (wind, dungeon bed) level, 0..1. Separate from the effects slider. */
  ambienceVolume: number;
  /** Savaş sesleri: 'normal' or 'low' (Az). Low = combat sounds 40 % quieter, at most 2 hits or swings per id, longer gaps. */
  combatSoundLevel: 'normal' | 'low';
  /** UI hover blip on buttons. Off by default (it fired on every pointer crossing). */
  uiHoverSfx: boolean;
  /** Revision of the calmer audio mix (audio levels, hover off). Stored files below 1 get the new defaults once. */
  audioRev: number;
  // ---- Karakter sözleri (systems/Barks.ts, append-only). Speech bubbles and the Söylenti chat line of the barks.
  /** Karakter sözleri: 'on' (Açık, default) · 'few' (Az: only the important moments, longer cooldowns, no NPC / enemy lines) · 'off' (Kapalı). */
  characterBarks: 'on' | 'few' | 'off';
}

/**
 * Settings schema version. 1 = before F4 (autoCombo defaulted to false and every save wrote it out as false).
 * 2 = autoCombo defaults to true; stored v1 files get autoCombo flipped to true once, on load.
 * 3 = CM1 / CW-01 / UX-00 fields (combat feel, UI flags, uiRev, bindingsRev). The one-time migrations are keyed on
 *     their own revisions (uiRev, bindingsRev, settingsVersion < 2), so a v2 file runs only the ones it still needs.
 * 4 = CONTROLS_WOW fields (controlScheme, controlsRev, schemeBindings, WoW camera and auto-attack flags).
 *     The scheme migration is keyed on controlsRev (see migrateControlsRev).
 * 5 = crisp default look (gfxLookRev): PSX filter off by default, stored files below rev 1 are switched once.
 * 6 = calmer audio mix (audioRev): ambienceVolume, combatSoundLevel, uiHoverSfx; the level defaults move down once.
 * 7 = WoW-clarity defaults (gfxClarityRev): renderScale 2 = native device pixels (DPR capped at 2), migrated once.
 * 8 = WoW camera distance default 13 m (cameraDistRev) and the first-person wheel option (firstPersonWheel).
 */
export const SETTINGS_VERSION = 8;

/** Key codes of the guard and inventory defaults before CM1 / UX-00 (used only by the one-time bindings migration). */
const LEGACY_GUARD = ['KeyG', 'Mouse3'];
const LEGACY_INVENTORY = ['KeyI', 'KeyB'];

/** True when `a` holds exactly the codes of `b` (any order). */
function sameCodes(a: string[] | undefined, b: string[]): boolean {
  return Array.isArray(a) && a.length === b.length && b.every((c) => a.includes(c));
}

export const DEFAULT_SETTINGS: SettingsData = {
  // Crisp by default: the PSX filter (pixel downscale, snapping, affine, dither) is opt-in ('PSX Filtresi' in Görüntü).
  psx: false,
  psxPixelScale: 3,
  psxJitter: 0,
  psxAffine: false,
  psxDither: false,
  psxColorDepth: 5,
  bloom: true,
  bloomStrength: 0.6,
  shadows: true,
  renderScale: 2,            // WoW clarity (gfxClarityRev 1): native device pixels, capped at 2
  fov: 60,
  showFps: false,
  damageNumbers: true,
  // GDD_LIFE §4.11 and Appendix A.2 #2: default changed from 1 to 0.7 (GDD_SYSTEMS §8.4). Stored user values still win.
  screenShake: 0.7,
  cameraMode: 'classic',
  mouseSensitivity: 1,
  invertY: false,
  cameraDistance: 9,
  autoLoot: true,
  lootFilter: 'all',
  autoSalvage: 'off',
  masterVolume: 0.8,
  musicVolume: 0.35,
  sfxVolume: 0.5,
  uiVolume: 0.35,
  playerName: '',
  bindings: {},
  language: 'tr',
  hudStyle: 'elvui',
  healTargeting: 'smart',
  autoCombo: true,
  settingsVersion: SETTINGS_VERSION,
  showForces: true,
  nameplates: 'always',
  colorBlindNameplates: false,
  kickTracker: true,
  showTankRoute: true,
  autoApplyPassives: true,
  armorGlow: 'high',
  fastForge: false,
  chatFilter: true,
  chatFontSize: 15,
  chatOpacity: 0.35,
  chatTimestamps: false,
  chatBubbles: true,
  chatTradeMuted: true,
  chatIgnore: [],
  cameraAutoFollow: false,
  cameraAutoShoulder: true,
  cameraCombatZoom: true,
  cameraLookAhead: true,
  cameraSensYRatio: 0.85,
  cameraAccel: 0,
  cameraSmoothing: 0,
  occluderFade: true,
  bossIntroCam: 'short',
  bossAutoLock: true,
  lockOnMode: 'hold-lock',
  rumble: true,
  voxelModels: true,
  // CM1 / CW-01 (combat feel)
  gcdProfile: 'arpg',
  spellQueueMs: 400,
  abilityGlow: true,
  leadSkip: true,
  numberStyle: 'school',
  // UX-00 (UI_REDESIGN Appendix A)
  meterVisibility: 'auto',
  barGhostSlots: true,
  barLock: true, // WoW: Lock Action Bars is on by default (Shift-drag still moves)
  ufIcon: false,
  showStats: false,
  showMapInfo: false,
  showTips: true,
  questArrow: true,
  uiRev: 2,
  bindingsRev: 1,
  // CONTROLS_WOW §2.1. controlsHintShown is true for new players (no hint); the migration resets it to false.
  controlScheme: 'wow',
  controlsRev: 1,
  schemeBindings: {},
  cameraDistanceWow: 13,
  cameraDistRev: 1,
  cameraSmartPivot: true,
  firstPersonWheel: true,
  casterAutoShot: true,
  casterAutoShotRev: 1,
  autoAttackFromSkills: true,
  controlsHintShown: true,
  barGhostRev: 1,
  graphicsQuality: 'mid',
  grassDensity: 'mid',
  dayNightCycle: 'on',
  gfxLookRev: 1,
  gfxClarityRev: 1,
  // AUDIO_MIX (audioRev 1)
  ambienceVolume: 0.4,
  combatSoundLevel: 'normal',
  uiHoverSfx: false,
  audioRev: 1,
  characterBarks: 'on',
};

/**
 * CONTROLS_WOW §2.4 (pure, DOM-free): the one-time control-scheme migration. Returns the patch to apply to a stored file, or {}.
 * Legacy shared rebinds of scheme actions were made against the Aksiyon layout, so they move into schemeBindings.aksiyon.
 * Idempotent: a file with controlsRev >= 1 returns {}.
 */
export function migrateControlsRev(stored: Partial<SettingsData>): Partial<SettingsData> {
  if ((stored.controlsRev ?? 0) >= 1) return {};
  const shared: Partial<Record<InputAction, string[]>> = { ...(stored.bindings ?? {}) };
  const aks: Partial<Record<InputAction, string[]>> = { ...(stored.schemeBindings?.aksiyon ?? {}) };
  for (const a of SCHEME_ACTIONS) {
    const codes = shared[a];
    if (codes) {
      aks[a] = codes;
      delete shared[a];
    }
  }
  return {
    bindings: shared,
    schemeBindings: { ...(stored.schemeBindings ?? {}), aksiyon: aks },
    // Every stored file has cameraMode written (defaults are serialised), so the old choice cannot be inferred: everybody goes to WoW.
    controlScheme: 'wow',
    cameraMode: 'classic',
    cameraDistanceWow: 10,
    controlsHintShown: false,
    controlsRev: 1,
  };
}

/** localStorage key of the settings object (exported so the early model resolver can read it before G.settings exists). */
export const SETTINGS_KEY = 'efsun.settings.v1';

/** Persistent user settings. `set()` saves and notifies listeners (Game re-emits 'settings:changed'). */
export class Settings {
  data: SettingsData;
  private listeners = new Set<(key: keyof SettingsData) => void>();

  constructor() {
    let stored: Partial<SettingsData> = {};
    try {
      stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch {
      stored = {};
    }
    if (!stored || typeof stored !== 'object') stored = {};
    const hasStored = Object.keys(stored).length > 0;
    this.data = { ...DEFAULT_SETTINGS, ...stored };
    // One-time migrations run only on a stored file (a new player already has the defaults). Each checks its own revision.
    let changed = false;
    if (hasStored) {
      // F4 (settingsVersion 1 → 2): autoCombo defaulted to false and every save wrote it out as false. Flip it once, keep later choices.
      if ((stored.settingsVersion ?? 1) < 2) {
        this.data.autoCombo = true;
        changed = true;
      }
      // UX-00 (uiRev 1 → 2): ElvUI is the only HUD skin; the chat font default moved 13 → 15 (a stored 13 is the old default).
      if ((stored.uiRev ?? 1) < 2) {
        this.data.hudStyle = 'elvui';
        if (stored.chatFontSize === 13) this.data.chatFontSize = 15;
        this.data.uiRev = 2;
        changed = true;
      }
      // CM1 / UX-00 (bindingsRev 0 → 1): guard G → CapsLock (skill_s4 takes G), inventory I → B only (groupFinder takes I).
      // A stored override is dropped only while it still equals the old default; a player who rebound the action keeps it.
      if ((stored.bindingsRev ?? 0) < 1) {
        const all: Partial<Record<InputAction, string[]>> = { ...(stored.bindings ?? {}) };
        if (sameCodes(all.guard, LEGACY_GUARD)) delete all.guard;
        if (sameCodes(all.inventory, LEGACY_INVENTORY)) delete all.inventory;
        this.data.bindings = all;
        this.data.bindingsRev = 1;
        changed = true;
      }
      // CONTROLS_WOW §2.4 (controlsRev 0 → 1). Runs after the bindingsRev step, so it sees the already-cleaned shared bindings.
      const controlsPatch = migrateControlsRev({ ...stored, bindings: this.data.bindings });
      if (Object.keys(controlsPatch).length > 0) {
        Object.assign(this.data, controlsPatch);
        changed = true;
      }
      // casterAutoShot default false → true (WoW casters had no auto-attack). Stored files always carry the old explicit false,
      // so the choice cannot be told apart from a deliberate one: flipped once, then the rev flag keeps later choices.
      if ((stored.casterAutoShotRev ?? 0) < 1) {
        this.data.casterAutoShot = true;
        this.data.casterAutoShotRev = 1;
        changed = true;
      }
      // Ghost cells in the action bar default on (ElvUI look). Stored files below rev 1 get barGhostSlots = true once;
      // the choice made after that (the settings toggle) is kept by the rev flag.
      if ((stored.barGhostRev ?? 0) < 1) {
        this.data.barGhostSlots = true;
        this.data.barGhostRev = 1;
        changed = true;
      }
      // Crisp look (gfxLookRev 0 → 1): the PSX filter and its wobble / dither go off for stored files once. A choice made
      // afterwards (the Görüntü toggle or sliders) is kept by the rev flag.
      if ((stored.gfxLookRev ?? 0) < 1) {
        Object.assign(this.data, { psx: false, psxJitter: 0, psxAffine: false, psxDither: false, gfxLookRev: 1 });
        changed = true;
      }
      // WoW clarity (gfxClarityRev 0 → 1): the render scale moves from 1x to native device pixels (cap 2) once.
      // A later choice on the Çözünürlük Ölçeği slider is kept by the rev flag.
      if ((stored.gfxClarityRev ?? 0) < 1) {
        Object.assign(this.data, { renderScale: 2, gfxClarityRev: 1 });
        changed = true;
      }
      // WoW camera distance (cameraDistRev 0 -> 1): the old 10 m default moves to 13 m once. A custom distance is kept.
      if ((stored.cameraDistRev ?? 0) < 1) {
        if (this.data.cameraDistanceWow === 10) this.data.cameraDistanceWow = 13;
        this.data.cameraDistRev = 1;
        changed = true;
      }
      // AUDIO_MIX (audioRev 0 -> 1): calmer level defaults and the hover blip off, once. A level changed afterwards is kept by the rev flag.
      if ((stored.audioRev ?? 0) < 1) {
        Object.assign(this.data, { sfxVolume: 0.5, musicVolume: 0.35, uiVolume: 0.35, ambienceVolume: 0.4, uiHoverSfx: false, audioRev: 1 });
        changed = true;
      }
    }
    // The scheme is the source of truth: cameraMode always follows it, whatever was stored.
    if (this.data.controlScheme !== 'wow' && this.data.controlScheme !== 'aksiyon') this.data.controlScheme = 'wow';
    this.data.cameraMode = cameraModeOf(this.data.controlScheme);
    this.data.schemeBindings = this.data.schemeBindings ?? {};
    this.data.cameraDistanceWow = Number.isFinite(this.data.cameraDistanceWow) ? Math.min(35, Math.max(2, this.data.cameraDistanceWow)) : 13;
    if (this.data.graphicsQuality !== 'low' && this.data.graphicsQuality !== 'mid' && this.data.graphicsQuality !== 'high') this.data.graphicsQuality = 'mid';
    if (!['off', 'low', 'mid', 'high'].includes(this.data.grassDensity as string)) this.data.grassDensity = 'mid';
    if (this.data.dayNightCycle !== 'on' && this.data.dayNightCycle !== 'off') this.data.dayNightCycle = 'on';
    if (this.data.combatSoundLevel !== 'low' && this.data.combatSoundLevel !== 'normal') this.data.combatSoundLevel = 'normal';
    this.data.ambienceVolume = Number.isFinite(this.data.ambienceVolume) ? Math.min(1, Math.max(0, this.data.ambienceVolume)) : 0.4;
    this.data.settingsVersion = SETTINGS_VERSION;
    if (changed || (hasStored && stored.settingsVersion !== SETTINGS_VERSION)) this.save();
  }

  get<K extends keyof SettingsData>(key: K): SettingsData[K] {
    return this.data[key];
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    // CONTROLS_WOW D1: cameraMode mirrors controlScheme, written in the same save (no second change event).
    if (key === 'controlScheme') this.data.cameraMode = cameraModeOf(value as ControlScheme);
    this.save();
    for (const l of this.listeners) l(key);
  }

  onChange(fn: (key: keyof SettingsData) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  reset(): void {
    this.data = structuredClone(DEFAULT_SETTINGS);
    this.save();
    for (const l of this.listeners) l('psx');
    // Bindings and scheme may have changed too: 'bindings' makes Game re-apply them (no scheme-switch side effects).
    for (const l of this.listeners) l('bindings');
  }

  save(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[settings] save failed (storage full or blocked)', e);
    }
  }
}
