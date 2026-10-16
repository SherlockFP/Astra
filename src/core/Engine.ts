import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

export type UpdateFn = (dt: number, time: number) => void;

/** Largest shadow map any light may use (per side). Each shadow texel costs a fill-rate hit every frame. */
const MAX_SHADOW_MAP = 1024;
/** Real seconds between shadow-budget checks (scene builders add lights after setView). */
const SHADOW_CHECK_EVERY = 0.5;
/** Frames kept per timed section: the window of the per-frame max (and of the GPU samples). */
const PROFILE_WINDOW = 120;
/** Weight of the newest frame in the rolling average (EMA). */
const PROFILE_EMA = 0.1;
/** Unresolved GPU timer queries kept at most; the oldest is dropped beyond this. */
const GPU_MAX_PENDING = 8;
/**
 * Bloom: only values above 1.0 (linear HDR) glow, so lit surfaces and the sky (<= 1) stay out of it. Strength is capped so
 * no single source can wash the frame, however the settings or a scene theme push it.
 */
export const BLOOM_THRESHOLD = 1.0;
export const BLOOM_MAX_STRENGTH = 1.0;
/** Per-channel ceiling of the bloom input. One emissive sprite stack can reach hundreds in HDR; the glow only needs a few. */
const HDR_CEILING = 10.0;

/**
 * Colour grade in the HDR guard pass (linear, before bloom, no extra pass): saturation around the luma and contrast around mid
 * grey. Regions set it per frame (Engine.setGrade, world/RegionAtmosphere look); every other scene keeps this default.
 */
export const SCENE_GRADE = { sat: 1.1, contrast: 1.03, exposure: 1.0 };

/**
 * Input guard in front of the bloom. A NaN or Inf texel is spread over the whole frame by the blur mip chain (the screen
 * goes flat grey), so non-finite and negative values become 0 and everything above HDR_CEILING is clamped.
 * `v >= 0.0` is false for NaN, so NaN takes the 0 branch on every driver.
 */
const HDR_GUARD_SHADER = {
  uniforms: { tDiffuse: { value: null }, uMax: { value: HDR_CEILING }, uSat: { value: SCENE_GRADE.sat }, uContrast: { value: SCENE_GRADE.contrast } },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uMax;
uniform float uSat;
uniform float uContrast;
varying vec2 vUv;
float guard(float v) { return v >= 0.0 ? min(v, uMax) : 0.0; }
void main() {
  vec4 t = texture2D(tDiffuse, vUv);
  float a = t.a >= 0.0 ? min(t.a, 1.0) : 0.0;
  vec3 c = vec3(guard(t.r), guard(t.g), guard(t.b));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, uSat), 0.0);
  c = max((c - 0.18) * uContrast + 0.18, 0.0);
  gl_FragColor = vec4(c, a);
}`,
};

/** Average and worst case of one timed section, in ms. */
export interface ProfileStat {
  /** EMA of the per-frame time. */
  avg: number;
  /** Largest per-frame time over the last PROFILE_WINDOW frames. */
  max: number;
}

/**
 * Live frame profile, G.engine.profile. The objects are updated in place once per frame: read them, don't keep copies.
 * All times are CPU milliseconds except gpuMs.
 */
export interface EngineProfile {
  /** One row per labelled updater (onUpdate label) and per profileMark label. */
  cpu: Record<string, ProfileStat>;
  /** composer.render() CPU submit time. This is not GPU time. */
  renderCpu: ProfileStat;
  /** GPU ms of composer.render (WebGL2 timer query). null when unsupported, not armed, or no result yet. */
  gpuMs: ProfileStat | null;
  /** Whole frame on the CPU: every updater plus the render submit. */
  frameCpuMs: ProfileStat;
  /** EXT_disjoint_timer_query_webgl2 is available on this context. */
  gpuSupported: boolean;
  /** GPU timer queries are armed (the perf overlay arms them while it is visible). */
  gpuEnabled: boolean;
}

/**
 * One timed section. add() collects the ms spent this frame (several calls sum up); close() at the end of the frame pushes
 * the total into the window, but only when the section ran. Keeps an EMA and a max over the last PROFILE_WINDOW samples.
 * The max is rescanned only when the evicted sample was the max, so a push is O(1) in almost every frame.
 */
class RollingStat {
  /** Shared with G.engine.profile; updated on every push. */
  readonly out: ProfileStat = { avg: 0, max: 0 };
  private readonly ring = new Float64Array(PROFILE_WINDOW);
  private head = 0;
  private count = 0;
  private ema = 0;
  private acc = 0;
  private touched = false;

  /** Add time to the current frame. */
  add(ms: number): void {
    this.acc += ms;
    this.touched = true;
  }

  /** End of frame: push the accumulated time, but only if the section ran this frame. */
  close(): void {
    if (!this.touched) return;
    const v = this.acc;
    this.acc = 0;
    this.touched = false;
    this.push(v);
  }

  /** Samples in the window (up to PROFILE_WINDOW). */
  get samples(): number {
    return this.count;
  }

  push(v: number): void {
    const old = this.ring[this.head];
    this.ring[this.head] = v;
    this.head = (this.head + 1) % PROFILE_WINDOW;
    if (this.count < PROFILE_WINDOW) this.count++;
    this.ema = this.count === 1 ? v : this.ema + (v - this.ema) * PROFILE_EMA;
    let max = this.out.max;
    if (v >= max) max = v;
    else if (old >= max) {
      // the evicted sample was the maximum: rescan the window
      max = 0;
      for (let i = 0; i < PROFILE_WINDOW; i++) if (this.ring[i] > max) max = this.ring[i];
    }
    this.out.avg = this.ema;
    this.out.max = max;
  }
}

/** Extension constants of EXT_disjoint_timer_query_webgl2 (not part of lib.dom). */
interface DisjointTimerExt {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/**
 * GPU time of composer.render from EXT_disjoint_timer_query_webgl2. Results are read back without waiting: a query is
 * resolved on a later frame, once QUERY_RESULT_AVAILABLE says so. A disjoint GPU event discards everything in flight.
 * Browsers often hide this extension (timing side channels), so create() returns null and gpuMs stays null.
 */
class GpuTimer {
  readonly series = new RollingStat();
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: DisjointTimerExt;
  private readonly pending: WebGLQuery[] = [];
  private open: WebGLQuery | null = null;

  private constructor(gl: WebGL2RenderingContext, ext: DisjointTimerExt) {
    this.gl = gl;
    this.ext = ext;
  }

  static create(renderer: THREE.WebGLRenderer): GpuTimer | null {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.beginQuery !== 'function') return null;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as DisjointTimerExt | null;
    return ext ? new GpuTimer(gl, ext) : null;
  }

  begin(): void {
    const gl = this.gl;
    if (this.open || gl.isContextLost()) return;
    const q = gl.createQuery();
    if (!q) return;
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.open = q;
  }

  end(): void {
    if (!this.open) return;
    const gl = this.gl;
    gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    if (this.pending.length >= GPU_MAX_PENDING) gl.deleteQuery(this.pending.shift()!);
    this.pending.push(this.open);
    this.open = null;
  }

  /** Resolve finished queries in submit order. Never waits on the GPU. */
  poll(): void {
    const gl = this.gl;
    if (this.pending.length === 0) return;
    if (gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      // the GPU clock was disturbed (throttling, context hiccup): every timing in flight is unreliable
      for (const q of this.pending) gl.deleteQuery(q);
      this.pending.length = 0;
      return;
    }
    while (this.pending.length > 0) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      gl.deleteQuery(q);
      this.pending.shift();
      this.series.push(ns / 1e6);
    }
  }
}

/**
 * Owns the WebGLRenderer, the post-processing chain and the main loop.
 * Scenes don't render themselves: the Engine renders `activeScene` with `activeCamera` every frame.
 * Post chain: RenderPass -> HDR guard -> UnrealBloom -> [PSX pass] -> OutputPass.
 */
export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly hdrGuard: ShaderPass;
  readonly bloomPass: UnrealBloomPass;
  readonly outputPass: OutputPass;
  private psxPass: Pass | null = null;

  activeScene: THREE.Scene = new THREE.Scene();
  activeCamera: THREE.Camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

  /** Seconds since start (unscaled real time). */
  time = 0;
  /** Simulation time scale (hit-stop sets it near 0 briefly). */
  timeScale = 1;
  fps = 60;
  frame = 0;
  width = 1;
  height = 1;

  private updaters: { fn: UpdateFn; order: number; section: RollingStat }[] = [];
  /** Timed sections by label: updaters and profileMark rows. */
  private readonly sections = new Map<string, RollingStat>();
  private readonly renderSection = new RollingStat();
  private readonly frameSection = new RollingStat();
  private readonly gpu: GpuTimer | null;
  private gpuArmed = false;
  /** Live frame profile (see EngineProfile). Updated in place at the end of every frame. */
  readonly profile: EngineProfile;
  private lastT = 0;
  private running = false;
  private hitStopUntil = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private bgTimer: ReturnType<typeof setInterval> | null = null;
  private backgroundTick = false;
  /** Engine time at which the shadow budget is checked next. */
  private shadowCheckAt = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral (Khronos PBR) instead of ACES: keeps hue and saturation of the region tints, ACES greyed them out.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // basic PCF
    // The composer makes several render() calls per frame. With autoReset on, info only holds the last pass; step() resets
    // the counters once per frame so draw calls and triangles cover the whole frame.
    this.renderer.info.autoReset = false;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.activeScene, this.activeCamera);
    this.hdrGuard = new ShaderPass(HDR_GUARD_SHADER);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, BLOOM_THRESHOLD);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.hdrGuard);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);

    this.gpu = GpuTimer.create(this.renderer);
    this.profile = {
      cpu: {},
      renderCpu: this.renderSection.out,
      gpuMs: null,
      frameCpuMs: this.frameSection.out,
      gpuSupported: this.gpu !== null,
      gpuEnabled: false,
    };

    window.addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  /** Colour grade (saturation, contrast) and tone-mapping exposure of the frame. SCENE_GRADE is the default. */
  setGrade(g: { sat: number; contrast: number; exposure: number }): void {
    this.hdrGuard.uniforms.uSat.value = g.sat;
    this.hdrGuard.uniforms.uContrast.value = g.contrast;
    this.renderer.toneMappingExposure = g.exposure;
  }

  /** Insert/replace the PSX pass (render/psx). Pass null to remove. */
  setPSXPass(pass: Pass | null): void {
    const old = this.psxPass as (Pass & { unbindComposer?: () => void }) | null;
    if (old) {
      old.unbindComposer?.();
      this.composer.removePass(old);
    }
    this.psxPass = pass;
    // PSXPostPass does tone mapping + sRGB output itself, so it REPLACES the OutputPass.
    this.outputPass.enabled = !pass;
    if (pass) this.composer.addPass(pass);
    this.resize(true);
  }

  getPSXPass(): Pass | null {
    return this.psxPass;
  }

  setBloom(enabled: boolean, strength?: number): void {
    this.bloomPass.enabled = enabled;
    if (strength !== undefined) this.bloomPass.strength = Math.min(Math.max(strength, 0), BLOOM_MAX_STRENGTH);
  }

  setPixelRatio(ratio: number): void {
    this.renderer.setPixelRatio(ratio);
    this.resize(true);
  }

  setView(scene: THREE.Scene, camera: THREE.Camera): void {
    this.activeScene = scene;
    this.activeCamera = camera;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.enforceShadowBudget();
    this.resize(true);
  }

  /**
   * One shadow caster per scene: the first directional light that casts (else the first caster) keeps its shadows, the rest
   * are switched off and their maps freed. The kept map is capped at MAX_SHADOW_MAP. Runs on setView and every
   * SHADOW_CHECK_EVERY seconds, so lights added by scene builders are caught without a per-frame traversal.
   */
  enforceShadowBudget(): void {
    const casters: THREE.Light[] = [];
    this.activeScene.traverse((o) => {
      const l = o as THREE.Light;
      if (l.isLight && l.castShadow) casters.push(l);
    });
    if (casters.length === 0) return;
    const shadowOf = (l: THREE.Light): THREE.LightShadow | null => (l as THREE.Light & { shadow?: THREE.LightShadow | null }).shadow ?? null;
    const keep = casters.find((l) => (l as THREE.DirectionalLight).isDirectionalLight === true) ?? casters[0];
    for (const l of casters) {
      if (l === keep) continue;
      l.castShadow = false;
      releaseShadowMap(shadowOf(l));
    }
    const sh = shadowOf(keep);
    if (sh && (sh.mapSize.x > MAX_SHADOW_MAP || sh.mapSize.y > MAX_SHADOW_MAP)) {
      sh.mapSize.set(Math.min(sh.mapSize.x, MAX_SHADOW_MAP), Math.min(sh.mapSize.y, MAX_SHADOW_MAP));
      releaseShadowMap(sh);
    }
  }

  /**
   * Register a per-frame callback. Lower order runs first. Returns unregister fn.
   * `label` is the row name in G.engine.profile.cpu (default `upd<order>`); updaters sharing a label add up.
   */
  onUpdate(fn: UpdateFn, order = 0, label = `upd${order}`): () => void {
    const entry = { fn, order, section: this.section(label) };
    this.updaters.push(entry);
    this.updaters.sort((a, b) => a.order - b.order);
    return () => {
      const i = this.updaters.indexOf(entry);
      if (i >= 0) this.updaters.splice(i, 1);
    };
  }

  /**
   * Add CPU ms to a profile row for the current frame (G.engine.profileMark('entities', ms)). Lets a system report its share
   * of an updater that is timed as one row. The row appears in G.engine.profile.cpu on first use.
   */
  profileMark(label: string, ms: number): void {
    this.section(label).add(ms);
  }

  /**
   * GPU timer queries around composer.render. Each frame costs a query pair, so the perf overlay arms them only while it is
   * visible. Does nothing when EXT_disjoint_timer_query_webgl2 is missing; profile.gpuMs then stays null.
   */
  setGpuTiming(on: boolean): void {
    this.gpuArmed = on && this.gpu !== null;
    this.profile.gpuEnabled = this.gpuArmed;
  }

  private section(label: string): RollingStat {
    let s = this.sections.get(label);
    if (!s) {
      s = new RollingStat();
      this.sections.set(label, s);
      this.profile.cpu[label] = s.out;
    }
    return s;
  }

  /** Freeze simulation briefly for impact feel. */
  hitStop(ms: number): void {
    this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + ms);
  }

  /**
   * Keep simulating (without rendering) at 20 Hz while the tab is hidden — the network host must keep running AI,
   * timers and replication when the player alt-tabs (rAF stops in hidden tabs). NetSession enables it when hosting.
   */
  setBackgroundTick(enabled: boolean): void {
    this.backgroundTick = enabled;
    this.syncBackgroundTimer();
  }

  private syncBackgroundTimer(): void {
    const want = this.running && this.backgroundTick && typeof document !== 'undefined' && document.hidden;
    if (want && !this.bgTimer) {
      this.bgTimer = setInterval(() => this.step(performance.now(), false), 50);
    } else if (!want && this.bgTimer) {
      clearInterval(this.bgTimer);
      this.bgTimer = null;
      this.lastT = performance.now();
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this.syncBackgroundTimer());
    const loop = (t: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      if (this.bgTimer) return;
      this.step(t, true);
    };
    requestAnimationFrame(loop);
  }

  private step(t: number, render: boolean): void {
    const frame0 = performance.now();
    const realDt = Math.min(0.1, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    this.time += realDt;
    this.frame++;
    this.fpsAcc += realDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    const stopped = t < this.hitStopUntil;
    const dt = realDt * (stopped ? 0.05 : this.timeScale);
    for (const u of this.updaters) {
      const u0 = performance.now();
      try {
        u.fn(dt, this.time);
      } catch (e) {
        console.error('[engine] update error', e);
      }
      u.section.add(performance.now() - u0);
    }
    if (render) this.renderFrame(realDt);
    this.closeFrame(frame0);
  }

  private renderFrame(realDt: number): void {
    if (this.width < 2 || this.height < 2) {
      this.resize();
      return;
    }
    if (this.time >= this.shadowCheckAt) {
      this.shadowCheckAt = this.time + SHADOW_CHECK_EVERY;
      this.enforceShadowBudget();
    }
    const gpu = this.gpu;
    if (gpu) {
      gpu.poll();
      if (this.gpuArmed) gpu.begin();
    }
    this.renderer.info.reset(); // one reset per frame: counters cover every composer pass
    const r0 = performance.now();
    try {
      this.composer.render(realDt);
    } finally {
      this.renderSection.add(performance.now() - r0);
      gpu?.end();
    }
  }

  /** End of frame: close every timed section and refresh the live profile. */
  private closeFrame(frame0: number): void {
    this.frameSection.push(performance.now() - frame0);
    this.renderSection.close();
    for (const s of this.sections.values()) s.close();
    const gpu = this.gpu;
    this.profile.gpuMs = gpu && this.gpuArmed && gpu.series.samples > 0 ? gpu.series.out : null;
  }

  stop(): void {
    this.running = false;
  }

  resize(force = false): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (!force && w === this.width && h === this.height && this.width > 1) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    // the PSX pass lowers the composer resolution to its virtual pixel grid (bound composer mode)
    const psx = this.psxPass as (Pass & { bindComposer?: (c: EffectComposer, r: THREE.WebGLRenderer) => void }) | null;
    psx?.bindComposer?.(this.composer, this.renderer);
    const cam = this.activeCamera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  }
}

/** Frees a light's shadow render target; three.js allocates a new one on the next shadow pass. */
function releaseShadowMap(sh: THREE.LightShadow | null | undefined): void {
  if (!sh || !sh.map) return;
  sh.map.depthTexture?.dispose();
  sh.map.depthTexture = null;
  sh.map.dispose();
  sh.map = null;
}
