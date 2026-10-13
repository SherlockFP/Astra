import type { Object3D } from 'three';
import { G } from '../../game/G';
import type { EngineProfile, ProfileStat } from '../../core/Engine';
import type { World } from '../../world/World';
import type { HudCtx, HudWidget } from '../hud/types';
import { div, h, setClass, setDisplay, setText } from './dom';

/**
 * Performance overlay: FPS, wall frame time, frame CPU time, render submit CPU, GPU time of composer.render, draw calls,
 * triangles, geometries / textures in memory, entity and enemy counts, active lights and the per-system CPU breakdown
 * (sorted by average cost). Shown with F3 (toggle) or whenever settings.showFps is on. A small monospace box under the
 * player frame. The text never takes the mouse; only the Kopyala button does. It copies a JSON snapshot of the same data.
 *
 * Draw counts: three.js resets renderer.info on every render() call, and the composer makes several per frame. While the
 * overlay is visible, autoReset is off and the counters are read and then reset once per HUD update. The HUD update runs
 * before this frame's render calls, so the totals read there are the previous frame's, summed over all its passes.
 * autoReset is restored when the overlay hides or the HUD is hidden.
 * GPU timer queries are armed (Engine.setGpuTiming) only while the overlay is visible, so a hidden overlay costs nothing.
 * OWNER: hud module (widget lives in widgets/ because it is a plain DOM readout).
 */

/** Text refresh period (s). Counters are still read every frame. */
const REFRESH = 0.25;
/** Light count refresh period (s): a scene traverse, so not every frame. */
const LIGHT_EVERY = 1;
/** Frame-time smoothing (0..1 per frame). */
const SMOOTH = 0.1;
/** Per-system rows in the readout. The Kopyala snapshot lists all of them. */
const SYSTEM_ROWS = 6;

export class PerfOverlay implements HudWidget {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly copyBtn: HTMLButtonElement;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  /** Toggled with F3. */
  private manual = false;
  /** The overlay is currently showing (drives the renderer autoReset switch and GPU timing). */
  private on = false;
  private acc = REFRESH;
  private frameMs = 16.7;
  private calls = 0;
  private tris = 0;
  private lights = 0;
  private lightAcc = LIGHT_EVERY;
  private lastText = '';

  constructor() {
    this.el = div('perf');
    this.body = div('perf-body', this.el);
    this.copyBtn = h('button', 'perf-copy', this.el, 'Kopyala');
    this.copyBtn.type = 'button';
    // no focus on mouse down, so Space (jump) and the other game keys keep working after a click
    this.copyBtn.addEventListener('mousedown', (e) => e.preventDefault());
    this.copyBtn.addEventListener('click', () => this.copySnapshot());
    setDisplay(this.el, false);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F3' || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      if (e.repeat) return;
      this.manual = !this.manual;
    });
  }

  update(ctx: HudCtx): void {
    const on = this.manual || !!G.settings?.data.showFps;
    const info = G.engine?.renderer?.info;
    if (on !== this.on) {
      this.on = on;
      if (info) {
        info.autoReset = !on;
        info.reset();
      }
      G.engine?.setGpuTiming(on);
      this.acc = REFRESH;
      this.lastText = '';
    }
    setDisplay(this.el, on);
    if (!on) return;

    if (info) {
      // totals of the previous frame (all of its render calls), then start the count of this frame's renders
      this.calls = info.render.calls;
      this.tris = info.render.triangles;
      info.reset();
    }

    this.frameMs += (ctx.dt * 1000 - this.frameMs) * SMOOTH;
    this.lightAcc += ctx.dt;
    if (this.lightAcc >= LIGHT_EVERY) {
      this.lightAcc = 0;
      this.lights = countLights(G.engine?.activeScene);
    }

    this.acc += ctx.dt;
    if (this.acc < REFRESH) return;
    this.acc = 0;

    const text = this.buildText();
    if (text !== this.lastText) {
      this.lastText = text;
      setText(this.body, text);
    }
    const fps = G.engine?.fps ?? 0;
    setClass(this.el, 'warn', fps > 0 && fps < 30);
    setClass(this.el, 'bad', fps > 0 && fps < 15);
  }

  reset(): void {
    // the HUD was hidden: hand the renderer back its per-call reset and stop the GPU queries
    if (this.on) {
      const info = G.engine?.renderer?.info;
      if (info) info.autoReset = true;
      G.engine?.setGpuTiming(false);
    }
    this.on = false;
    this.lastText = '';
    setDisplay(this.el, false);
  }

  private buildText(): string {
    const eng = G.engine;
    const p = eng?.profile;
    const fps = eng?.fps ?? 0;
    const mem = eng?.renderer?.info.memory;
    const w = G.world;
    const lines = [`FPS ${fps}  kare ${this.frameMs.toFixed(1)} ms`];
    if (p) {
      lines.push(`CPU kare ${statText(p.frameCpuMs)}`, `CPU çizim ${statText(p.renderCpu)}`, `GPU ${gpuText(p)}`);
    }
    lines.push(
      `Çizim ${formatCount(this.calls)}  üçgen ${formatCount(this.tris)}`,
      `Geometri ${mem?.geometries ?? 0}  doku ${mem?.textures ?? 0}`,
      `Varlık ${w ? w.entities.size : 0}  düşman ${countEnemies(w)}  Işık ${this.lights}`,
    );
    if (p) {
      const rows = sortedRows(p.cpu).slice(0, SYSTEM_ROWS);
      if (rows.length > 0) {
        const nw = Math.max(...rows.map(([name]) => name.length));
        lines.push('Sistemler (ms ort / maks)');
        for (const [name, s] of rows) {
          lines.push(`${name.padEnd(nw)}  ${s.avg.toFixed(2).padStart(5)} / ${s.max.toFixed(2).padStart(5)}`);
        }
      }
    }
    return lines.join('\n');
  }

  /** The Kopyala payload: the readout's numbers plus the full per-system list, as plain JSON values. */
  private snapshot(): object {
    const eng = G.engine;
    const p = eng?.profile;
    const info = eng?.renderer?.info;
    const w = G.world;
    return {
      at: new Date().toISOString(),
      mode: G.ui?.mode ?? null,
      fps: eng?.fps ?? 0,
      wallFrameMs: round3(this.frameMs),
      frameCpuMs: p ? msStat(p.frameCpuMs) : null,
      renderCpuMs: p ? msStat(p.renderCpu) : null,
      gpu: p ? { supported: p.gpuSupported, enabled: p.gpuEnabled, ms: p.gpuMs ? msStat(p.gpuMs) : null } : null,
      systems: p ? sortedRows(p.cpu).map(([name, s]) => ({ name, ...msStat(s) })) : [],
      drawCalls: this.calls,
      triangles: this.tris,
      geometries: info?.memory.geometries ?? 0,
      textures: info?.memory.textures ?? 0,
      entities: w ? w.entities.size : 0,
      enemies: countEnemies(w),
      lights: this.lights,
      note: 'systems: avg = EMA of the per-frame ms, max = largest frame over the last 120 frames',
    };
  }

  private copySnapshot(): void {
    const json = JSON.stringify(this.snapshot(), null, 2);
    copyText(json)
      .catch(() => false)
      .then((ok) => this.flashCopy(ok ? 'Kopyalandı' : 'Kopyalanamadı'));
  }

  private flashCopy(label: string): void {
    this.copyBtn.textContent = label;
    if (this.copyTimer !== null) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => {
      this.copyTimer = null;
      this.copyBtn.textContent = 'Kopyala';
    }, 1500);
  }
}

/** Visible lights in a scene (a traverse; only called once a second while the overlay shows). */
function countLights(scene: Object3D | undefined): number {
  if (!scene) return 0;
  let n = 0;
  scene.traverseVisible((o) => {
    if ((o as Object3D & { isLight?: boolean }).isLight) n++;
  });
  return n;
}

function countEnemies(w: World | null): number {
  let n = 0;
  if (w) for (const e of w.enemies) if (!e.isDead && !e.removed) n++;
  return n;
}

/** Systems sorted by average cost, most expensive first. */
function sortedRows(cpu: EngineProfile['cpu']): [string, ProfileStat][] {
  return Object.entries(cpu).sort((a, b) => b[1].avg - a[1].avg);
}

/** "4.21 ms  maks 9.10" */
function statText(s: ProfileStat): string {
  return `${s.avg.toFixed(2)} ms  maks ${s.max.toFixed(2)}`;
}

function gpuText(p: EngineProfile): string {
  if (!p.gpuSupported) return 'desteklenmiyor';
  if (!p.gpuMs) return '...';
  return statText(p.gpuMs);
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function msStat(s: ProfileStat): { avg: number; max: number } {
  return { avg: round3(s.avg), max: round3(s.max) };
}

/**
 * Write text to the clipboard. Falls back to a hidden textarea + execCommand when the async API is missing or refused.
 * Resolves to whether the copy went through.
 */
function copyText(text: string): Promise<boolean> {
  const viaTextarea = (): boolean => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  };
  try {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).then(
        () => true,
        () => viaTextarea(),
      );
    }
  } catch {
    /* no async clipboard: use the fallback below */
  }
  return Promise.resolve(viaTextarea());
}

/** 950 -> "950", 12345 -> "12,3 K" (thousands; "B" read as billions in QA), 1234567 -> "1,23 M" (Turkish decimal comma). */
function formatCount(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + ' M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace('.', ',') + ' K';
  return Math.round(n).toLocaleString('tr-TR');
}
