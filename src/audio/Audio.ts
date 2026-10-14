import { SKILLS } from '../data/skills';
import { REGIONS } from '../data/world/regions';
import { G } from '../game/G';
import type { MusicId, PlaySfxOpts, SfxId } from '../types/audio';
import { AMBIENCE_MANIFEST, MUSIC_MANIFEST, SFX_MANIFEST, type SfxEntry } from './manifest';
import { MUSIC_ALIASES, resolveSfxAlias } from './aliases';
import { getProcDef } from '../data/procs';
import { COMBAT_LOW_CAP, COMBAT_LOW_GAIN, COMBAT_LOW_GAP, COMBAT_RX, MAX_SEC, mixTrim } from './mix';

/**
 * WebAudio sound manager: sfx (variants, pitch variation, per-id rate limits and voice caps, distance attenuation + stereo pan
 * relative to the listener), streamed music with crossfades (boss swap / restore, victory + defeat stingers), ambience beds,
 * class voice barks, a synthesized sub-bass "thump" for heavy impacts, and default feedback subscriptions
 * (damage, death, level up, loot, run, boss, status, upgrade, party events).
 *
 * The AudioContext is created on the first user gesture (browser autoplay policy). Until then play() is a silent no-op and the
 * last requested music/ambience is remembered and started on unlock. Nothing here ever throws into the caller.
 * OWNER: vfx-audio module. File lists live in audio/manifest.ts (generated from public/assets/audio/*.json, hand-editable).
 */

const BASE = '/assets/audio/';

export type VoicePack = 'warrior' | 'mage' | 'orc';
export type VoiceKind =
  | 'attack' | 'light' | 'heavy' | 'crit' | 'hurt' | 'death' | 'hup' | 'hut' | 'defend' | 'bleed' | 'fire' | 'poison'
  | 'angry' | 'laugh' | 'yes' | 'no' | 'thanks' | 'hello' | 'bye' | 'welcome';

export interface VoiceOpts {
  pack?: VoicePack;
  /** probability 0..1 that the bark actually plays (default 1) */
  chance?: number;
  pos?: [number, number, number];
  pitch?: number;
  volume?: number;
  /** enemy/NPC barks use their own rate limiter so they never mute the player's voice */
  other?: boolean;
}

const UI_RX = /^(ui_|quest_|achievement|level_up|countdown_|ready_check|party_|chat$|sell$|buy$|equip$|unequip$|keystone_|mplus_|upgrade_|passive_|skill_unlock|vault_open|reward_coin|efsun_|room_join|enemy_forces_complete|timer_warning|boss_phase)/;

/** ids that should be audible from further away (reference distance in metres) */
const FAR: Record<string, number> = {
  boss_roar: 22, boss_cast: 16, boss_death: 28, boss_pull: 24, explosion: 12, ground_slam: 12, lightning_impact: 10, fire_impact: 9,
  frost_impact: 9, war_cry: 14, enemy_death_brute: 10, portal_enter: 10, gate_heavy: 14, barrel_break: 8,
};

const TRANSIENT_MUSIC = new Set<string>(['boss', 'victory', 'defeat', 'combat']);

/** COMBAT_WOW §2.16: at most 3 impact sounds (hit_* / *_impact) per 100 ms, rolling window. */
const IMPACT_MAX = 3;
const IMPACT_WINDOW_SEC = 0.1;


/** CW-12: first-cast cue per damage school (volume 0.5 at the call site). Poison has no cast file, so it borrows shadow_cast higher. */
const CAST_START_CUE: Record<string, { id: SfxId; pitch?: number }> = {
  fire: { id: 'fire_cast' },
  frost: { id: 'frost_cast' },
  arcane: { id: 'arcane_cast' },
  holy: { id: 'holy_cast' },
  shadow: { id: 'shadow_cast' },
  lightning: { id: 'lightning_cast' },
  poison: { id: 'shadow_cast', pitch: 1.2 },
};

/** CW-12: proc gain bell pitch per overlay school (proc table in data/procs.ts). */
const PROC_GAIN_PITCH: Record<string, number> = { fire: 0.95, frost: 1.15, arcane: 1.2, holy: 1.3, physical: 0.9, bleed: 0.85, shadow: 0.8 };

/**
 * Synthesized sub-bass layer under a few feel ids (GDD_V2 §3.11 "sound layering"): [strength, f0 Hz, f1 Hz, dur s].
 * Plays only when the sample itself started (throttled or silent plays add nothing). Strength scales with the caller volume.
 */
const SYNTH_THUMP: Record<string, [number, number, number, number]> = {
  parry: [0.3, 150, 46, 0.14],
  heavy_hit: [0.34, 120, 40, 0.14],
  guard_break: [0.32, 110, 40, 0.18],
  stance_break: [0.5, 110, 34, 0.22],
  crit_finisher: [0.6, 90, 30, 0.24],
  heartbeat_loop: [0.42, 80, 42, 0.14],
  proc_use: [0.22, 180, 60, 0.12],
};

const RX_BONE = /skelet|bone|skull|lich/i;
const RX_STONE = /golem|elemental|statue|construct|giant/i;
const RX_METAL = /knight|armor|guard|warrior|plate|paladin|sentinel|champion/i;
const RX_GHOST = /ghost|wraith|spirit|shade|wisp|phantom|specter/i;

type Material = 'bone' | 'stone' | 'metal' | 'ghost' | 'flesh';

interface DefLike {
  id?: string;
  model?: string;
  rank?: string;
  role?: string;
}

function defOf(e: unknown): DefLike | undefined {
  return (e as { def?: DefLike } | undefined)?.def;
}

function materialOf(def: DefLike | undefined): Material {
  if (!def) return 'flesh';
  const s = `${def.id ?? ''} ${def.model ?? ''}`;
  if (RX_BONE.test(s)) return 'bone';
  if (RX_GHOST.test(s)) return 'ghost';
  if (RX_STONE.test(s)) return 'stone';
  if (RX_METAL.test(s)) return 'metal';
  return 'flesh';
}

function packFor(classId: string | undefined): { pack: VoicePack; pitch: number } {
  switch (classId) {
    case 'mage': return { pack: 'mage', pitch: 1 };
    case 'barbarian': return { pack: 'warrior', pitch: 0.88 };
    case 'rogue': return { pack: 'warrior', pitch: 1.14 };
    default: return { pack: 'warrior', pitch: 1 };
  }
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const now = (): number => (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000);

interface MusicSlot {
  el: HTMLAudioElement;
  node: MediaElementAudioSourceNode;
  gain: GainNode;
  id: MusicId | null;
  idx: number;
  active: boolean;
  killAt: number;
  busy: boolean;
}

export class Audio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private musicBus: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private ambBus: GainNode | null = null;

  private buffers = new Map<string, AudioBuffer>();
  private inflight = new Map<string, Promise<AudioBuffer | null>>();
  private failed = new Set<string>();
  private warned = new Set<string>();
  private active = new Map<string, number>();
  private lastPlay = new Map<string, number>();
  private lastVariant = new Map<string, number>();
  private frameCount = 0;
  /** start times (audio clock) of the impact sounds played in the last IMPACT_WINDOW_SEC */
  private impactTimes: number[] = [];
  private lastVoiceAt = -9;
  private lastOtherVoiceAt = -9;
  private lastThumpAt = -9;

  private inited = false;
  private wired = false;
  private ranOnRunning = false;
  private unlockHandler: (() => void) | null = null;

  // listener
  private lx = 0;
  private ly = 0;
  private lz = 0;
  private lyaw = 0;
  private listenerSetAt = -9;

  // music
  private slots: MusicSlot[] = [];
  private curId: MusicId | null = null;
  private curSlot: MusicSlot | null = null;
  private wantId: MusicId | null = null;
  private wantFade = 1.5;
  private baseId: MusicId | null = null;
  private lastTrack = new Map<string, number>();
  private duckTarget = 1;
  private duckValue = 1;
  private duckUntil = 0;
  private deathDuck = false;
  private bossRestoreAt = 0;
  private needKick = false;
  private lastMusicRetry = 0;
  // open world: set by world:regionEntered, cleared on scene:leaving; worldMusic is the theme of the region under the player
  private worldActive = false;
  private worldMusic: MusicId | null = null;

  // ambience bed
  private ambWant: string | null = null;
  private ambId: string | null = null;
  private ambNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private ambToken = 0;

  private preloadQueue: string[] = [];
  private preloadActive = 0;

  // ------------------------------------------------------------------------------------------------------------ lifecycle

  /** Safe to call early; the context itself is created on the first user gesture. */
  async init(): Promise<void> {
    if (this.inited) return;
    this.inited = true;
    this.wireEvents();
    this.installUnlock();
  }

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get musicId(): MusicId | null {
    return this.curId;
  }

  private installUnlock(): void {
    if (typeof window === 'undefined') return;
    const events = ['pointerdown', 'mousedown', 'keydown', 'touchend', 'click'];
    const handler = () => {
      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state === 'running') {
        this.onRunning();
        this.removeUnlock(events);
        return;
      }
      ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') {
            this.onRunning();
            this.removeUnlock(events);
          }
        })
        .catch(() => {
          /* keep listening */
        });
    };
    this.unlockHandler = handler;
    for (const e of events) window.addEventListener(e, handler, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      const ctx = this.ctx;
      if (!ctx) return;
      try {
        if (document.hidden) void ctx.suspend();
        else void ctx.resume();
      } catch {
        /* ignore */
      }
    });
  }

  private removeUnlock(events: string[]): void {
    if (!this.unlockHandler) return;
    for (const e of events) window.removeEventListener(e, this.unlockHandler, { capture: true } as EventListenerOptions);
    this.unlockHandler = null;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      const master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      master.connect(comp);
      comp.connect(ctx.destination);
      const musicBus = ctx.createGain();
      const musicDuck = ctx.createGain();
      const sfxBus = ctx.createGain();
      const uiBus = ctx.createGain();
      const ambBus = ctx.createGain();
      musicDuck.connect(musicBus);
      musicBus.connect(master);
      sfxBus.connect(master);
      uiBus.connect(master);
      ambBus.connect(master);
      this.master = master;
      this.comp = comp;
      this.musicBus = musicBus;
      this.musicDuck = musicDuck;
      this.sfxBus = sfxBus;
      this.uiBus = uiBus;
      this.ambBus = ambBus;
      this.applyVolumes();
      ctx.onstatechange = () => {
        if (ctx.state === 'running') this.onRunning();
      };
      return ctx;
    } catch (e) {
      this.warnOnce('ctx', `[audio] AudioContext unavailable: ${String(e)}`);
      return null;
    }
  }

  /** Runs when the context is (or becomes) running: preload the hot set, start any music/ambience that was requested early. */
  private onRunning(): void {
    if (this.needKick) this.kickMusic();
    if (this.ranOnRunning) return;
    this.ranOnRunning = true;
    this.queuePreload();
    this.applyMusic();
    this.applyAmbience();
  }

  private queuePreload(): void {
    const hot: string[] = [
      'hit_flesh', 'hit_metal', 'hit_bone', 'hit_crit', 'swing_light', 'swing_heavy', 'block', 'dodge', 'player_hurt', 'enemy_death',
      'skeleton_death', 'ui_click', 'ui_hover', 'ui_open', 'ui_close', 'gold_pickup', 'item_pickup', 'footstep_stone', 'footstep_dirt',
      'jump', 'land', 'level_up', 'potion_drink', 'heal', 'spell_cast', 'fire_cast', 'fire_impact', 'frost_cast', 'frost_impact',
      'lightning_cast', 'lightning_impact', 'explosion', 'whoosh', 'loot_drop', 'enemy_aggro', 'buff', 'ui_error', 'ui_tab',
      // combat feel: a first parry / stance break must not be silent while its file decodes
      'parry', 'riposte', 'stance_break', 'crit_finisher', 'guard_hit', 'guard_break', 'backstab', 'heavy_hit', 'weapon_art', 'charge_full',
    ];
    const queue: string[] = [];
    for (const id of hot) {
      const d = SFX_MANIFEST[id];
      if (!d) continue;
      // a few variants each; the rest stream in lazily on demand
      const files = [...d.f].sort(() => Math.random() - 0.5).slice(0, 3);
      for (const f of files) queue.push(f);
      if (d.ly && d.ly.length) queue.push(d.ly[Math.floor(Math.random() * d.ly.length)]);
    }
    for (const p of ['warrior', 'mage']) for (const k of ['attack', 'hurt', 'light']) {
      const d = SFX_MANIFEST[`voice_${p}_${k}`];
      if (d) queue.push(d.f[0], d.f[1] ?? d.f[0]);
    }
    this.preloadQueue.push(...queue);
    this.pumpPreload();
  }

  private pumpPreload(): void {
    while (this.preloadActive < 3 && this.preloadQueue.length) {
      const f = this.preloadQueue.shift()!;
      if (this.buffers.has(f) || this.failed.has(f) || this.inflight.has(f)) continue;
      this.preloadActive++;
      void this.load(f).finally(() => {
        this.preloadActive--;
        this.pumpPreload();
      });
    }
  }

  /** Warm the buffers of some ids (e.g. a dungeon's boss sounds). */
  preload(ids: SfxId[]): void {
    if (!this.ctx) return;
    for (const id of ids) {
      const d = SFX_MANIFEST[id];
      if (d) this.preloadQueue.push(...d.f.slice(0, 4));
    }
    this.pumpPreload();
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(msg);
  }

  // ------------------------------------------------------------------------------------------------------------ volumes

  applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.musicBus || !this.sfxBus || !this.uiBus) return;
    try {
      const s = G.settings?.data;
      const t = ctx.currentTime;
      const v = (x: number | undefined, d: number): number => clamp01(typeof x === 'number' ? x : d);
      this.master.gain.setTargetAtTime(v(s?.masterVolume, 0.8), t, 0.03);
      this.musicBus.gain.setTargetAtTime(v(s?.musicVolume, 0.35) * 0.7, t, 0.05);
      this.sfxBus.gain.setTargetAtTime(v(s?.sfxVolume, 0.5), t, 0.03);
      this.uiBus.gain.setTargetAtTime(v(s?.uiVolume, 0.35), t, 0.03);
      this.ambBus?.gain.setTargetAtTime(v(s?.ambienceVolume, 0.4), t, 0.03);
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------------------------------------------------ listener

  /** Listener position and facing yaw (forward = (sin yaw, cos yaw)). Set by the camera each frame. */
  setListener(x: number, y: number, z: number, yaw: number): void {
    this.lx = x;
    this.ly = y;
    this.lz = z;
    this.lyaw = yaw;
    this.listenerSetAt = now();
  }

  // ------------------------------------------------------------------------------------------------------------ buffers

  private load(path: string): Promise<AudioBuffer | null> {
    const ex = this.inflight.get(path);
    if (ex) return ex;
    const ctx = this.ctx;
    if (!ctx || this.failed.has(path)) return Promise.resolve(this.buffers.get(path) ?? null);
    const cached = this.buffers.get(path);
    if (cached) return Promise.resolve(cached);
    const p = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(BASE + path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(data);
        this.buffers.set(path, buf);
        return buf;
      } catch (e) {
        this.failed.add(path);
        this.warnOnce(`file:${path}`, `[audio] could not load ${path}: ${String(e)}`);
        return null;
      } finally {
        this.inflight.delete(path);
      }
    })();
    this.inflight.set(path, p);
    return p;
  }

  /** Index of a file to play: prefers files that are already decoded, and trickles the rest in. */
  private pick(id: string, files: string[]): number {
    const n = files.length;
    if (n === 1) return 0;
    const loaded: number[] = [];
    for (let i = 0; i < n; i++) if (this.buffers.has(files[i])) loaded.push(i);
    if (loaded.length < n && this.ctx && Math.random() < 0.6) {
      const pending: string[] = [];
      for (const f of files) if (!this.buffers.has(f) && !this.failed.has(f) && !this.inflight.has(f)) pending.push(f);
      if (pending.length) void this.load(pending[Math.floor(Math.random() * pending.length)]);
    }
    let pool = loaded;
    if (!pool.length) {
      pool = [];
      for (let i = 0; i < n; i++) if (!this.failed.has(files[i])) pool.push(i);
      if (!pool.length) return 0;
    }
    if (pool.length === 1) return pool[0];
    const last = this.lastVariant.get(id) ?? -1;
    let idx = pool[Math.floor(Math.random() * pool.length)];
    if (idx === last) idx = pool[(pool.indexOf(idx) + 1) % pool.length];
    this.lastVariant.set(id, idx);
    return idx;
  }

  // ------------------------------------------------------------------------------------------------------------ sfx

  private gapFor(id: string): number {
    if (id.startsWith('voice_')) return 0.25;
    if (id.startsWith('hit_') || id === 'block' || id === 'shield_bash') return 0.07;
    if (id.startsWith('footstep')) return 0.1;
    if (id.startsWith('swing') || id === 'whoosh' || id === 'dodge') return 0.12;
    if (id === 'ui_hover') return 0.06;
    if (id.startsWith('upgrade_')) return 0.4;
    if (id === 'level_up' || id === 'mplus_start' || id === 'mplus_complete' || id === 'mplus_fail') return 0.5;
    if (id === 'gold_pickup') return 0.045;
    if (id === 'explosion' || id.endsWith('_impact')) return 0.07;
    if (id.startsWith('enemy_')) return 0.06;
    return 0.025;
  }

  /** Play a one-shot. Never throws; silent until the audio context is unlocked. */
  play(id: SfxId, opts?: PlaySfxOpts): void {
    try {
      if (!this.playInternal(id, opts)) return;
      const t = SYNTH_THUMP[id];
      if (t) {
        // the sub layer follows the sample's distance falloff (no thump for far-away positional events)
        let k = opts?.volume ?? 1;
        if (opts?.pos) k *= Math.max(0, Math.min(1, 1 - Math.hypot(opts.pos[0] - this.lx, opts.pos[2] - this.lz) / 28));
        if (k > 0.02) this.thump(t[0] * k, t[1], t[2], t[3]);
      }
    } catch (e) {
      this.warnOnce(`play:${id}`, `[audio] play(${id}) failed: ${String(e)}`);
    }
  }

  /** COMBAT_WOW §2.16: true while fewer than IMPACT_MAX impacts started inside the last IMPACT_WINDOW_SEC. Prunes old entries. */
  private impactAllowed(t: number): boolean {
    while (this.impactTimes.length && t - this.impactTimes[0] > IMPACT_WINDOW_SEC) this.impactTimes.shift();
    return this.impactTimes.length < IMPACT_MAX;
  }

  /** AUDIO_MIX: impacts that started within the last `sec` (no pruning). */
  private recentImpacts(t: number, sec: number): number {
    let n = 0;
    for (const x of this.impactTimes) if (t - x <= sec) n++;
    return n;
  }

  /** AUDIO_MIX: Savaş sesleri 'low' (Az). */
  private lowCombat(): boolean {
    return G.settings?.data?.combatSoundLevel === 'low';
  }

  private playInternal(id: string, opts?: PlaySfxOpts): boolean {
    // AUDIO_MIX: the hover blip is opt-in (Settings > Ses > Düğme üstü sesi)
    if (id === 'ui_hover' && G.settings?.data?.uiHoverSfx !== true) return false;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.sfxBus || !this.uiBus) return false;
    const def: SfxEntry | undefined = SFX_MANIFEST[id];
    if (!def) {
      // GDD_CLASSES_V2 §11.2 (NC03): a class sfx id without a manifest entry plays its alias (audio/aliases.ts)
      const alias = resolveSfxAlias(id);
      if (alias && SFX_MANIFEST[alias.id]) {
        return this.playInternal(alias.id, {
          ...opts,
          pitch: (opts?.pitch ?? 1) * (alias.pitch ?? 1),
          volume: (opts?.volume ?? 1) * (alias.volume ?? 1),
        });
      }
      this.warnOnce(`id:${id}`, `[audio] unknown sfx id "${id}"`);
      return false;
    }
    const t0 = now();
    const ui = UI_RX.test(id);
    const impact = id.startsWith('hit_') || id.endsWith('_impact');
    const combat = COMBAT_RX.test(id);
    const low = combat && this.lowCombat();
    if (t0 - (this.lastPlay.get(id) ?? -9) < this.gapFor(id) * (low ? COMBAT_LOW_GAP : 1)) return false;
    if (!ui) {
      if (this.frameCount >= 14) return false;
      if (impact && !this.impactAllowed(t0)) return false;
      // AUDIO_MIX: a hit that stacks on another hit inside 250 ms is kept half of the time
      if (impact && this.recentImpacts(t0, 0.25) >= 1 && Math.random() < 0.5) return false;
    }
    const act = this.active.get(id) ?? 0;
    // AUDIO_MIX per-id limiter: hits and swings never stack past 3 voices (2 on Az)
    const cap = impact || id.startsWith('swing_') ? Math.min(def.mv, low ? COMBAT_LOW_CAP : 3) : def.mv;
    if (act >= cap) return false;

    // spatialisation
    let atten = 1;
    let pan = 0;
    if (opts?.pos && !def.np) {
      const dx = opts.pos[0] - this.lx;
      const dz = opts.pos[2] - this.lz;
      const dy = opts.pos[1] - this.ly;
      const d = Math.sqrt(dx * dx + dy * dy * 0.25 + dz * dz);
      const ref = FAR[id] ?? 5;
      // AUDIO_MIX: distant sounds (other players, enemies) fall off faster and stop at 45 m (was 55 m)
      const max = Math.max(45, ref * 8);
      if (d > max) return false;
      atten = d <= ref ? 1 : ref / (ref + (d - ref) * 1.6);
      if (d > max - 12) atten *= (max - d) / 12;
      if (d > 2.5) {
        // right vector for forward (sin yaw, cos yaw) is (-cos yaw, 0, sin yaw)
        const side = (dx * -Math.cos(this.lyaw) + dz * Math.sin(this.lyaw)) / d;
        pan = Math.max(-0.85, Math.min(0.85, side * 0.85)) * Math.min(1, (d - 2.5) / 5);
      }
      if (atten < 0.012) return false;
    }

    // AUDIO_MIX: per-id trim, Az level, and +/-5 % volume and pitch on every play so repeats do not sound copy-pasted
    const jitter = 1 + (Math.random() * 2 - 1) * 0.05;
    const trim = mixTrim(id) * (low ? COMBAT_LOW_GAIN : 1);
    const vol = (opts?.volume ?? 1) * def.v * atten * trim * jitter;
    const pv = Math.max(0.05, opts?.pitchVar ?? def.pv);
    const rate = (opts?.pitch ?? 1) * (def.p ?? 1) * (1 + (Math.random() * 2 - 1) * pv);
    const bus = ui ? this.uiBus : this.sfxBus;
    const maxSec = MAX_SEC[id] ?? 0;

    const idx = this.pick(id, def.f);
    const file = def.f[idx];
    const buf = this.buffers.get(file);
    if (!buf) {
      // not decoded yet: fetch it and play it late if the moment hasn't passed
      const asked = t0;
      void this.load(file).then((b) => {
        if (!b || now() - asked > 0.35) return;
        this.fire(id, b, vol * (def.fg?.[idx] ?? 1), rate, pan, bus, true, maxSec);
      });
      this.lastPlay.set(id, t0);
      if (impact && !ui) this.impactTimes.push(t0);
      return true;
    }
    this.lastPlay.set(id, t0);
    this.fire(id, buf, vol * (def.fg?.[idx] ?? 1), rate, pan, bus, true, maxSec);
    if (!ui) {
      this.frameCount++;
      if (impact) this.impactTimes.push(t0);
    }
    // layer
    if (def.ly && def.ly.length) {
      const li = this.pick(id + '#ly', def.ly);
      const lb = this.buffers.get(def.ly[li]);
      if (lb) this.fire(id, lb, (opts?.volume ?? 1) * (def.lv ?? 0.6) * (def.lg?.[li] ?? 1) * atten, rate * (0.97 + Math.random() * 0.06), pan, bus, false);
    }
    return true;
  }

  private fire(id: string, buf: AudioBuffer, gain: number, rate: number, pan: number, bus: GainNode, count: boolean, maxSec = 0): void {
    const ctx = this.ctx;
    if (!ctx || gain <= 0.002) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.25, Math.min(4, rate));
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    let tail: AudioNode = g;
    let panner: StereoPannerNode | null = null;
    if (Math.abs(pan) > 0.01 && typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      g.connect(panner);
      tail = panner;
    }
    tail.connect(bus);
    if (count) this.active.set(id, (this.active.get(id) ?? 0) + 1);
    src.onended = () => {
      if (count) this.active.set(id, Math.max(0, (this.active.get(id) ?? 1) - 1));
      try {
        src.disconnect();
        g.disconnect();
        panner?.disconnect();
      } catch {
        /* ignore */
      }
    };
    const r = src.playbackRate.value;
    if (maxSec > 0 && buf.duration / r > maxSec) {
      // AUDIO_MIX: cut to maxSec (real time) and fade out over the last 40 ms
      const at = ctx.currentTime;
      g.gain.setValueAtTime(gain, at + Math.max(0, maxSec - 0.04));
      g.gain.linearRampToValueAtTime(0, at + maxSec);
      src.start(0, 0, maxSec * r);
    } else src.start(0);
  }

  /** Synthesized sub-bass drop that gives crits, slams and explosions weight (no sample needed). */
  thump(strength = 0.6, f0 = 120, f1 = 36, dur = 0.17): void {
    try {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running' || !this.sfxBus) return;
      const t = now();
      if (t - this.lastThumpAt < 0.07) return;
      this.lastThumpAt = t;
      const at = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      const g = ctx.createGain();
      const peak = Math.max(0.01, Math.min(1, strength));
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.06);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(at);
      o.stop(at + dur + 0.12);
      o.onended = () => {
        try {
          o.disconnect();
          g.disconnect();
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------------------------------------------------ voices

  /** Class / enemy voice bark. Returns true if something played. */
  voice(kind: VoiceKind, o: VoiceOpts = {}): boolean {
    try {
      if (o.chance !== undefined && Math.random() > o.chance) return false;
      const pk = o.pack ? { pack: o.pack, pitch: 1 } : packFor(G.player?.classId ?? G.character?.save?.classId);
      let id = `voice_${pk.pack}_${kind}`;
      if (!SFX_MANIFEST[id]) id = `voice_${pk.pack}_attack`;
      if (!SFX_MANIFEST[id]) return false;
      const t = now();
      if (o.other) {
        if (t - this.lastOtherVoiceAt < 0.45) return false;
      } else if (t - this.lastVoiceAt < 0.3) return false;
      const ok = this.playInternal(id, { pos: o.pos, volume: o.volume, pitch: (o.pitch ?? 1) * pk.pitch });
      if (ok) {
        if (o.other) this.lastOtherVoiceAt = t;
        else this.lastVoiceAt = t;
      }
      return ok;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------------------------------------------------ ducking

  /** Briefly lower the music (impacts, stingers). amount 0..1 = how much is removed. */
  duck(amount = 0.4, sec = 0.4): void {
    this.duckTarget = Math.min(this.duckTarget, 1 - clamp01(amount));
    this.duckUntil = Math.max(this.duckUntil, now() + sec);
  }

  // ------------------------------------------------------------------------------------------------------------ music

  /** Crossfade to a music track (null = silence). Safe before unlock: the request is remembered. */
  music(id: MusicId | null, fadeSec = 1.5): void {
    try {
      this.wantId = id;
      this.wantFade = fadeSec;
      if (id && !TRANSIENT_MUSIC.has(id)) this.baseId = id;
      if (id === null) this.baseId = null;
      this.applyMusic();
    } catch (e) {
      this.warnOnce('music', `[audio] music(${String(id)}) failed: ${String(e)}`);
    }
  }

  /** Open-world region theme: crossfades like music(), but while a boss, combat or stinger holds the speakers the theme only
   *  becomes the base track they restore to when they end. */
  private areaMusic(id: MusicId, fadeSec: number): void {
    const w = this.wantId;
    if (w === 'boss' || w === 'combat' || w === 'victory' || w === 'defeat') {
      this.baseId = id;
      return;
    }
    this.music(id, fadeSec);
  }

  private makeSlots(): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.musicDuck) return false;
    if (this.slots.length) return true;
    try {
      for (let i = 0; i < 3; i++) {
        const el = document.createElement('audio');
        el.preload = 'auto';
        const node = ctx.createMediaElementSource(el);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        node.connect(gain);
        gain.connect(this.musicDuck);
        const slot: MusicSlot = { el, node, gain, id: null, idx: 0, active: false, killAt: 0, busy: false };
        el.addEventListener('ended', () => this.onTrackEnded(slot));
        el.addEventListener('error', () => this.onTrackError(slot));
        this.slots.push(slot);
      }
      return true;
    } catch (e) {
      this.warnOnce('slots', `[audio] music elements unavailable: ${String(e)}`);
      return false;
    }
  }

  private freeSlot(): MusicSlot | null {
    let best: MusicSlot | null = null;
    for (const s of this.slots) if (!s.busy) return s;
    for (const s of this.slots) if (!s.active && (!best || s.killAt < best.killAt)) best = s;
    if (best) this.stopSlot(best);
    return best;
  }

  private stopSlot(s: MusicSlot): void {
    try {
      s.el.pause();
      s.el.removeAttribute('src');
      s.el.load();
    } catch {
      /* ignore */
    }
    s.busy = false;
    s.active = false;
    s.killAt = 0;
    s.id = null;
    try {
      s.gain.gain.cancelScheduledValues(0);
      s.gain.gain.value = 0;
    } catch {
      /* ignore */
    }
  }

  private fadeOutSlot(s: MusicSlot, fade: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    s.active = false;
    const t = ctx.currentTime;
    const f = Math.max(0.05, fade);
    try {
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setValueAtTime(s.gain.gain.value, t);
      s.gain.gain.linearRampToValueAtTime(0, t + f);
    } catch {
      /* ignore */
    }
    s.killAt = now() + f + 0.15;
  }

  /** K3 / P-06: a music id without a manifest entry plays its MUSIC_ALIASES track; anything else is returned unchanged (and stays silent). */
  private musicKey(id: MusicId): MusicId {
    return MUSIC_MANIFEST[id] ? id : (MUSIC_ALIASES[id] ?? id);
  }

  private applyMusic(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const id = this.wantId;
    if (id === this.curId && (id === null || (this.curSlot && this.curSlot.active))) return;
    if (!this.makeSlots()) return;
    const fade = this.wantFade;
    const prev = this.curSlot;
    if (prev) this.fadeOutSlot(prev, fade);
    this.curSlot = null;
    this.curId = id;
    if (!id) return;
    const key = this.musicKey(id);
    const entry = MUSIC_MANIFEST[key];
    if (!entry) {
      this.warnOnce(`music:${id}`, `[audio] unknown music id "${id}"`);
      this.curId = null;
      return;
    }
    const slot = this.freeSlot();
    if (!slot) return;
    let idx = 0;
    if (key === 'victory' || key === 'defeat' || key === 'menu') idx = 0;
    else if (entry.t.length > 1) {
      const last = this.lastTrack.get(key) ?? -1;
      idx = Math.floor(Math.random() * entry.t.length);
      if (idx === last) idx = (idx + 1) % entry.t.length;
    }
    this.lastTrack.set(key, idx);
    slot.id = key;
    slot.active = true;
    slot.busy = true;
    this.curSlot = slot;
    this.startTrack(slot, idx, fade);
    if (entry.intro) this.stinger(entry.intro, 0.8);
  }

  private startTrack(slot: MusicSlot, idx: number, fade: number): void {
    const ctx = this.ctx;
    const id = slot.id;
    if (!ctx || !id) return;
    const entry = MUSIC_MANIFEST[id];
    if (!entry) return;
    const [file, g] = entry.t[Math.max(0, Math.min(entry.t.length - 1, idx))];
    slot.idx = idx;
    slot.killAt = 0;
    const el = slot.el;
    try {
      el.src = BASE + file;
      el.loop = entry.loop && entry.t.length === 1;
      el.currentTime = 0;
      const t = ctx.currentTime;
      const target = entry.v * g;
      slot.gain.gain.cancelScheduledValues(t);
      if (fade > 0.05) {
        slot.gain.gain.setValueAtTime(0, t);
        slot.gain.gain.linearRampToValueAtTime(target, t + fade);
      } else slot.gain.gain.setValueAtTime(target, t);
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err: unknown) => {
          // autoplay still blocked or the file is missing: retry on the next gesture / state change
          this.needKick = true;
          this.warnOnce(`play:${file}`, `[audio] music play deferred (${file}): ${String(err)}`);
        });
      }
    } catch (e) {
      this.warnOnce(`track:${file}`, `[audio] music track failed (${file}): ${String(e)}`);
    }
  }

  private kickMusic(): void {
    this.needKick = false;
    const s = this.curSlot;
    if (!s || !s.active) return;
    try {
      const p = s.el.play();
      if (p && typeof p.catch === 'function') p.catch(() => (this.needKick = true));
    } catch {
      this.needKick = true;
    }
  }

  private onTrackEnded(slot: MusicSlot): void {
    if (!slot.active || !slot.id) return;
    const entry = MUSIC_MANIFEST[slot.id];
    if (!entry) return;
    const n = entry.t.length;
    if (entry.loop) {
      if (n > 1) {
        let next = Math.floor(Math.random() * n);
        if (next === slot.idx) next = (next + 1) % n;
        this.lastTrack.set(slot.id, next);
        this.startTrack(slot, next, 1.2);
      } else this.startTrack(slot, 0, 0.2);
      return;
    }
    if (slot.idx + 1 < n) {
      this.startTrack(slot, slot.idx + 1, 0.2);
      return;
    }
    // finished a one-shot theme (victory / defeat): go back to the area music
    const was = slot.id;
    slot.active = false;
    slot.busy = false;
    if (this.curSlot === slot) {
      this.curSlot = null;
      this.curId = null;
    }
    if (this.wantId === was) this.wantId = this.baseId;
    if (this.baseId) this.music(this.baseId, 3);
  }

  private onTrackError(slot: MusicSlot): void {
    if (!slot.id || !slot.el.getAttribute('src')) return;
    this.warnOnce(`musicerr:${slot.id}`, `[audio] music file failed to load for "${slot.id}"`);
    if (!slot.active) return;
    const entry = MUSIC_MANIFEST[slot.id];
    if (entry && entry.t.length > 1) {
      const next = (slot.idx + 1) % entry.t.length;
      if (next !== slot.idx) this.startTrack(slot, next, 0.5);
    }
  }

  /** One-shot musical sting on the music bus (not affected by ducking). */
  private stinger(path: string, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    void this.load(path).then((b) => {
      if (!b || !this.ctx || !this.musicBus) return;
      this.fire('stinger', b, gain, 1, 0, this.musicBus, false);
    });
  }

  // ------------------------------------------------------------------------------------------------------------ ambience

  /** Looping ambience bed ('amb_dungeon_bed' | 'amb_wind' | null). Scenes are handled automatically via scene:changed. */
  ambience(id: string | null, fadeSec = 2): void {
    this.ambWant = id;
    this.applyAmbience(fadeSec);
  }

  private applyAmbience(fade = 2): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.sfxBus) return;
    const id = this.ambWant;
    if (id === this.ambId) return;
    const token = ++this.ambToken;
    const old = this.ambNode;
    this.ambNode = null;
    this.ambId = id;
    if (old) {
      const t = ctx.currentTime;
      try {
        old.gain.gain.cancelScheduledValues(t);
        old.gain.gain.setValueAtTime(old.gain.gain.value, t);
        old.gain.gain.linearRampToValueAtTime(0, t + fade);
        old.src.stop(t + fade + 0.1);
        old.src.onended = () => {
          try {
            old.src.disconnect();
            old.gain.disconnect();
          } catch {
            /* ignore */
          }
        };
      } catch {
        /* ignore */
      }
    }
    if (!id) return;
    const def = AMBIENCE_MANIFEST[id];
    if (!def) return;
    void this.load(def.f[0]).then((buf) => {
      const c = this.ctx;
      if (!buf || !c || token !== this.ambToken || !this.sfxBus) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = def.loop;
      const gain = c.createGain();
      const t = c.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(def.v * 0.45, t + fade);
      src.connect(gain);
      gain.connect(this.ambBus ?? this.sfxBus);
      src.start(0, Math.random() * Math.max(0.1, buf.duration - 0.2));
      this.ambNode = { src, gain };
    });
  }

  // ------------------------------------------------------------------------------------------------------------ frame

  update(dt: number): void {
    this.frameCount = 0;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = now();
    // fallback listener from the render camera when nobody calls setListener (menu, dev pages)
    if (t - this.listenerSetAt > 0.6) {
      const cam = G.vfx?.camera;
      if (cam) {
        const e = cam.matrixWorld.elements;
        const fx = -e[8];
        const fz = -e[10];
        this.lx = e[12] + fx * 12;
        this.ly = e[13] - e[9] * 12;
        this.lz = e[14] + fz * 12;
        this.lyaw = Math.atan2(fx, fz);
      }
    }
    // music ducking (timed + death)
    if (t > this.duckUntil) this.duckTarget = 1;
    const want = Math.min(this.duckTarget, this.deathDuck ? 0.3 : 1);
    if (want !== this.duckValue && this.musicDuck) {
      const k = want < this.duckValue ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 2.2);
      this.duckValue += (want - this.duckValue) * k;
      if (Math.abs(want - this.duckValue) < 0.002) this.duckValue = want;
      try {
        this.musicDuck.gain.value = this.duckValue;
      } catch {
        /* ignore */
      }
    }
    // finished fades
    for (const s of this.slots) if (s.busy && !s.active && s.killAt > 0 && t >= s.killAt) this.stopSlot(s);
    // delayed boss music restore
    if (this.bossRestoreAt > 0 && t >= this.bossRestoreAt) {
      this.bossRestoreAt = 0;
      if (this.curId === 'boss') this.music(this.baseId, 3);
    }
    // late-bound requests
    if (ctx.state === 'running') {
      if (this.wantId !== this.curId && t - this.lastMusicRetry > 0.4) {
        this.lastMusicRetry = t;
        this.applyMusic();
      }
      if (this.ambWant !== this.ambId) this.applyAmbience();
    }
  }

  stats(): { state: string; buffers: number; loading: number; music: string | null; voices: number } {
    let v = 0;
    for (const n of this.active.values()) v += n;
    return { state: this.ctx?.state ?? 'none', buffers: this.buffers.size, loading: this.inflight.size, music: this.curId, voices: v };
  }

  // ------------------------------------------------------------------------------------------------------------ default feedback

  private wireEvents(): void {
    if (this.wired || !G.events) return;
    this.wired = true;
    const ev = G.events;

    ev.on('settings:changed', ({ key }) => {
      if (/volume/i.test(key)) this.applyVolumes();
    });

    ev.on('damage', (e) => {
      try {
        this.onDamage(e);
      } catch {
        /* never break combat for sound */
      }
    });

    ev.on('death', (e) => {
      try {
        this.onDeath(e);
      } catch {
        /* ignore */
      }
    });

    ev.on('heal', (e) => {
      if (G.player && e.targetId === G.player.id && e.amount > 1) this.play('heal', { volume: 0.6 });
    });

    ev.on('player:levelup', () => {
      this.play('level_up');
      this.voice('laugh', { chance: 0.5 });
      this.duck(0.55, 1.4);
    });

    ev.on('player:died', (e) => {
      if (!e.local) return;
      this.voice('death');
      this.deathDuck = true;
    });
    ev.on('player:revived', (e) => {
      if (e.local) this.deathDuck = false;
    });

    ev.on('loot:pickedUp', (e) => {
      if (e.gold !== undefined) {
        this.play('gold_pickup', { volume: 0.6 + clamp01(e.gold / 600) * 0.4, pitch: 0.95 + clamp01(e.gold / 800) * 0.2 });
        return;
      }
      if (e.globe) {
        this.play('heal', { volume: 0.5, pitch: 1.2 });
        return;
      }
      if (e.material) {
        this.play('item_pickup', { pitch: 1.15, volume: 0.8 });
        return;
      }
      const r = e.item?.rarity;
      this.play('item_pickup');
      if (r === 'rare') this.play('loot_drop_rare', { volume: 0.5 });
      else if (r === 'epic') this.play('loot_drop_epic', { volume: 0.6 });
      else if (r === 'legendary') {
        this.play('loot_drop_legendary', { volume: 0.8 });
        this.duck(0.4, 1.2);
      }
    });

    ev.on('item:upgraded', (e) => {
      if (e.destroyed) {
        this.play('upgrade_destroy');
        this.thump(0.8, 90, 30, 0.3);
      } else if (e.success) this.play('upgrade_success');
      else this.play('upgrade_fail');
    });

    ev.on('run:countdown', ({ seconds }) => {
      if (seconds >= 1 && seconds <= 5) this.play('countdown_tick', { pitch: seconds === 1 ? 1.25 : 1 });
    });
    ev.on('run:started', () => {
      this.play('mplus_start');
      this.duck(0.4, 1);
    });
    ev.on('run:completed', ({ state }) => {
      if (state.failed) {
        this.play('mplus_fail');
        this.music('defeat', 1);
        return;
      }
      this.play('mplus_complete');
      this.music('victory', 0.6);
    });
    ev.on('run:playerDeath', () => this.play('keystone_deplete', { volume: 0.5, pitch: 0.8 }));

    ev.on('boss:engaged', () => {
      this.bossRestoreAt = 0;
      if (this.curId !== 'boss') this.music('boss', 1.2);
    });
    ev.on('boss:defeated', () => {
      this.bossRestoreAt = now() + 2.2;
      this.thump(0.9, 80, 28, 0.4);
    });
    ev.on('boss:wipe', () => {
      this.bossRestoreAt = 0;
      if (this.curId === 'boss') this.music(this.baseId, 2.5);
    });
    ev.on('boss:phase', () => this.play('boss_phase'));

    // open world: WorldRuntime emits this on every region change and once when the map starts (inside DungeonScene.enter, so
    // before scene:changed). The region theme crossfades in; boss / combat / stingers keep the speakers and restore it later.
    ev.on('world:regionEntered', ({ regionId }) => {
      try {
        const theme = REGIONS.find((r) => r.id === regionId)?.theme.music;
        this.worldActive = true;
        if (theme) {
          this.worldMusic = theme;
          this.areaMusic(theme, 3);
        }
        this.ambience('amb_wind', 2.5);
      } catch {
        /* feedback only */
      }
    });
    ev.on('scene:changed', ({ to }) => {
      this.bossRestoreAt = 0;
      this.deathDuck = false;
      if (this.worldActive && to === 'dungeon') {
        // the open world runs in the 'dungeon' scene. DungeonScene starts its def theme after the region was announced, so the
        // region theme is applied again here, as the last word.
        if (this.worldMusic) this.areaMusic(this.worldMusic, 2);
        this.ambience('amb_wind', 2.5);
        return;
      }
      this.ambience(to === 'town' ? 'amb_wind' : to === 'dungeon' ? 'amb_dungeon_bed' : null, 2.5);
    });
    ev.on('scene:leaving', () => {
      this.bossRestoreAt = 0;
      this.deathDuck = false;
      this.worldActive = false;
      this.worldMusic = null;
    });

    ev.on('status:applied', (e) => {
      const isMe = !!G.player && e.targetId === G.player.id;
      if (isMe) {
        if (e.status === 'burn') this.voice('fire', { chance: 0.5 });
        else if (e.status === 'bleed') this.voice('bleed', { chance: 0.5 });
        else if (e.status === 'poison') this.voice('poison', { chance: 0.5 });
        else if (e.status === 'stun' || e.status === 'freeze') this.play('stun', { volume: 0.6 });
        return;
      }
      if (e.status === 'stun' || e.status === 'freeze' || e.status === 'knockdown') {
        const t = G.world?.get(e.targetId);
        if (t) this.play('stun', { pos: [t.position.x, t.position.y + 1, t.position.z], volume: 0.7 });
      }
    });

    ev.on('skill:cast', (e) => {
      if (!G.player || e.casterId !== G.player.id) return;
      this.onLocalCast(e.skillId);
    });
    ev.on('skill:fail', () => this.play('ui_error', { volume: 0.5 }));
    // CW-12 (COMBAT_WOW §2.16): proc bell, proc pop, cooldown-ready chime, pushback tick, burst sting
    ev.on('proc:gain', (e) => {
      const school = getProcDef(e.id)?.school ?? '';
      this.play('proc_gain', { pitch: PROC_GAIN_PITCH[school] ?? 1, volume: 0.8 });
    });
    ev.on('proc:fade', (e) => {
      if (e.consumed) this.play('proc_use');
    });
    // majors at full volume; other >= 8 s cooldowns get the quieter chime
    ev.on('skill:ready', (e) => this.play('cd_ready', { volume: e.major ? 1 : 0.5 }));
    ev.on('cast:pushback', () => this.play('cast_pushback'));
    ev.on('burst:window', (e) => {
      if (e.active) this.play('burst_window', { volume: 0.8 });
    });
    ev.on('combo:changed', ({ tier }) => {
      if (tier >= 1) this.play('ui_tab', { pitch: 1 + tier * 0.14, volume: 0.45 });
    });
    ev.on('camera:shake', ({ intensity }) => {
      if (intensity >= 0.25) this.thump(Math.min(0.85, 0.25 + intensity * 0.7), 100, 34, 0.2);
    });
    ev.on('hitstop', ({ ms }) => {
      if (ms >= 90) this.duck(0.35, 0.3);
    });

    ev.on('net:peerJoined', () => this.play('party_join'));
    ev.on('net:peerLeft', () => this.play('party_leave'));
    ev.on('party:readyCheck', ({ active }) => {
      if (active) this.play('ready_check');
    });
    ev.on('net:chat', (e) => {
      if (e.channel === 'party') this.play('chat');
    });
  }

  private onLocalCast(skillId: string): void {
    const def = SKILLS[skillId];
    const pk = packFor(G.player?.classId ?? G.character?.save?.classId);
    const cue = CAST_START_CUE[def?.damage?.type ?? ''];
    if (cue) this.play(cue.id, { volume: 0.5, pitch: cue.pitch });
    const slot = def?.defaultSlot;
    const basic = slot === 'lmb' || /_basic/.test(skillId);
    if (pk.pack === 'mage') {
      const type = def?.damage?.type;
      const tags = def?.tags ?? [];
      let kind: string | null = null;
      if (tags.includes('haste')) kind = 'haste';
      else if (tags.includes('shield') || def?.selfStatuses?.some((s) => s.status === 'shield')) kind = 'shield';
      else if (type === 'fire') kind = 'fire';
      else if (type === 'frost') kind = def?.targeting === 'ground_aoe' ? 'blizzard' : 'freeze';
      else if (type === 'lightning') kind = 'thunder';
      else if (!basic) kind = 'cast';
      if (kind && Math.random() < (basic ? 0.12 : 0.4)) {
        const id = `voice_mage_spell_${kind}`;
        const t = now();
        if (SFX_MANIFEST[id] && t - this.lastVoiceAt > 0.3 && this.playInternal(id, { volume: 0.9 })) this.lastVoiceAt = t;
        return;
      }
    }
    const heavy = (def?.params?.weight ?? 0) >= 1 || def?.targeting === 'leap' || def?.targeting === 'self_aoe';
    this.voice(basic ? 'light' : heavy ? 'heavy' : 'attack', { chance: basic ? 0.16 : heavy ? 0.5 : 0.32 });
  }

  private onDamage(e: { targetId: number; sourceId: number | null; amount: number; crit: boolean; type: string; kind: string; pos: [number, number, number]; skillId?: string }): void {
    if (e.kind === 'block') {
      // Combat plays the block clang itself; the shield-bearer grunts
      if (G.player && e.targetId === G.player.id) this.voice('defend', { chance: 0.55 });
      return;
    }
    if (e.kind === 'immune' || e.kind === 'dodge') return; // Combat plays those itself
    if (e.amount <= 0) return;
    const world = G.world;
    const target = world?.get(e.targetId);
    const me = G.player;
    const hurtMe = !!me && e.targetId === me.id;
    const pos = e.pos;
    if (hurtMe || target?.kind === 'player') {
      if (hurtMe && e.kind !== 'dot') {
        const maxHp = (me as unknown as { maxHp?: number }).maxHp || 100;
        const frac = e.amount / maxHp;
        if (frac > 0.05) this.voice('hurt', { chance: Math.min(0.85, 0.3 + frac * 3) });
        if (frac > 0.25) this.thump(0.55, 90, 30, 0.22);
      }
      return;
    }
    if (e.kind === 'dot') return;
    // local player landing a crit gets a battle shout now and then
    if (e.crit && me && e.sourceId === me.id) this.voice('crit', { chance: 0.22 });

    const material = materialOf(defOf(target));
    const p: [number, number, number] = pos;
    const phys = e.type === 'physical' || e.type === 'true';
    if (phys) {
      if (e.crit) {
        this.playInternal('hit_crit', { pos: p });
        this.thump(0.5, 130, 40, 0.15);
        return;
      }
      switch (material) {
        case 'bone': this.playInternal('hit_bone', { pos: p }); break;
        case 'metal': this.playInternal('hit_metal', { pos: p }); break;
        case 'stone': this.playInternal('hit_armor_plate', { pos: p, pitch: 0.8, volume: 0.8 }); break;
        case 'ghost': this.playInternal('hit_blunt', { pos: p, pitch: 1.25, volume: 0.6 }); break;
        default: this.playInternal('hit_flesh', { pos: p });
      }
      return;
    }
    // elemental: a body thud underneath the spell sound
    this.playInternal(material === 'bone' ? 'hit_bone' : 'hit_flesh', { pos: p, volume: 0.45 });
    const crit = e.crit ? 1.25 : 1;
    switch (e.type) {
      case 'fire': this.playInternal('fire_impact', { pos: p, volume: 0.5 * crit }); break;
      case 'frost': this.playInternal('frost_impact', { pos: p, volume: 0.5 * crit }); break;
      case 'lightning': this.playInternal('lightning_impact', { pos: p, volume: 0.45 * crit }); break;
      case 'shadow': this.playInternal('shadow_impact', { pos: p, volume: 0.9 * crit }); break;
      case 'poison': this.playInternal('poison_impact', { pos: p, volume: 0.55 * crit }); break;
      case 'holy': this.playInternal('spell_cast', { pos: p, pitch: 1.5, volume: 0.5 }); break;
      case 'arcane': this.playInternal('arcane_impact', { pos: p, volume: 0.5 * crit }); break;
      default: break;
    }
    if (e.crit) {
      this.playInternal('hit_crit', { pos: p, volume: 0.6 });
      this.thump(0.45, 120, 38, 0.15);
    }
  }

  private onDeath(e: { entityId: number; killerId: number | null; pos: [number, number, number] }): void {
    const target = G.world?.get(e.entityId);
    if (!target || target.kind === 'player') return; // players: player:died
    const def = defOf(target);
    const pos = e.pos;
    if (def?.rank === 'boss') return; // BossController plays boss_death
    const s = `${def?.id ?? ''} ${def?.model ?? ''}`;
    const big = def?.rank === 'elite' || def?.rank === 'miniboss';
    let id: string;
    let pitch = 1;
    if (RX_BONE.test(s)) id = 'skeleton_death';
    else if (/slime/i.test(s)) id = 'enemy_death_slime';
    else if (RX_GHOST.test(s)) id = 'enemy_death_ghost';
    else if (/spider|rat|bat|bug|insect|mush/i.test(s)) id = 'enemy_death_bug';
    else if (/golem|elemental|giant|yeti/i.test(s)) id = 'enemy_death_brute';
    else if (/demon|imp\b|imp_|_imp/i.test(s)) id = 'enemy_death_demon';
    else if (/zombie|ghoul|wolf|beast|boar/i.test(s)) id = 'enemy_death_beast';
    else if (/orc|goblin/i.test(s)) {
      const gob = /goblin/i.test(s);
      if (Math.random() < 0.75 && this.voice('death', { pack: 'orc', pos, other: true, pitch: gob ? 1.35 : big ? 0.85 : 1 })) {
        if (big) this.thump(0.5, 100, 34, 0.2);
        return;
      }
      id = 'enemy_death';
    } else id = 'enemy_death';
    if (big) pitch = 0.88;
    this.playInternal(id, { pos, pitch, volume: big ? 1.15 : 1 });
    if (big) this.thump(0.55, 100, 34, 0.2);
  }
}
