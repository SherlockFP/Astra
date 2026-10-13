import type { InputAction } from './Input';

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
  // audio
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  uiVolume: number;
  // misc
  playerName: string;        // online display name fallback
  bindings: Partial<Record<InputAction, string[]>>;
  language: 'tr';
  /** Bottom HUD style: Metin2-like stone bar with horizontal gauges + 4 EXP beads, or the Diablo-style orbs. */
  hudStyle: 'metin2' | 'orbs';
  // GDD_V2 (WP1 contracts). Defaults below; old settings files merge over them.
  /** Heal target picking mode (GDD_V2 §1.6). */
  healTargeting: 'smart' | 'frames' | 'crosshair';
  /** Hold LMB auto-repeats the light chain (GDD_V2 O2, F4 default ON). OFF = holding LMB charges the heavy; the heavyAttack keys (Mouse4, Minus) always charge. */
  autoCombo: boolean;
  /** Schema version of the stored settings (see SETTINGS_VERSION and the migration in Settings's constructor). */
  settingsVersion: number;
  /** M+ nameplate forces tag (GDD_V2 §8.1). */
  showForces: boolean;
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
  /** Chat font size 11..16 px. */
  chatFontSize: number;
  /** Chat background alpha 0.2..1 (idle). */
  chatOpacity: number;
  /** Show [HH:MM] timestamps in chat lines. */
  chatTimestamps: boolean;
  /** Speech bubbles above avatars for say / party lines. */
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
}

/**
 * Settings schema version. 1 = before F4 (autoCombo defaulted to false and every save wrote it out as false).
 * 2 = autoCombo defaults to true; stored v1 files get autoCombo flipped to true once, on load.
 */
export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: SettingsData = {
  psx: true,
  psxPixelScale: 3,
  psxJitter: 0.6,
  psxAffine: true,
  psxDither: true,
  psxColorDepth: 5,
  bloom: true,
  bloomStrength: 0.6,
  shadows: true,
  renderScale: 1,
  fov: 60,
  showFps: false,
  damageNumbers: true,
  // GDD_LIFE §4.11 and Appendix A.2 #2: default changed from 1 to 0.7 (GDD_SYSTEMS §8.4). Stored user values still win.
  screenShake: 0.7,
  cameraMode: 'action',
  mouseSensitivity: 1,
  invertY: false,
  cameraDistance: 9,
  autoLoot: true,
  lootFilter: 'all',
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  uiVolume: 0.7,
  playerName: '',
  bindings: {},
  language: 'tr',
  hudStyle: 'metin2',
  healTargeting: 'smart',
  autoCombo: true,
  settingsVersion: SETTINGS_VERSION,
  showForces: true,
  kickTracker: true,
  showTankRoute: true,
  autoApplyPassives: true,
  armorGlow: 'high',
  fastForge: false,
  chatFilter: true,
  chatFontSize: 13,
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
};

const KEY = 'efsun.settings.v1';

/** Persistent user settings. `set()` saves and notifies listeners (Game re-emits 'settings:changed'). */
export class Settings {
  data: SettingsData;
  private listeners = new Set<(key: keyof SettingsData) => void>();

  constructor() {
    let stored: Partial<SettingsData> = {};
    try {
      stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      stored = {};
    }
    // F4 migration, once: a stored file older than v2 saved autoCombo as false (the old default). Flip it, keep later choices.
    const migrate = !!stored && Object.keys(stored).length > 0 && (stored.settingsVersion ?? 1) < SETTINGS_VERSION;
    this.data = { ...DEFAULT_SETTINGS, ...stored };
    if (migrate) {
      this.data.autoCombo = true;
      this.data.settingsVersion = SETTINGS_VERSION;
      this.save();
    }
  }

  get<K extends keyof SettingsData>(key: K): SettingsData[K] {
    return this.data[key];
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
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
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[settings] save failed (storage full or blocked)', e);
    }
  }
}
