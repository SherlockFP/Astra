import * as THREE from 'three';
import type { Fx } from './Fx';
import type { AtlasLike, V3 } from './Particles';

/**
 * Pixel-art sprite sheets (Super Pixel Effects + Brackeys VFX bundle, converted to clean frame grids by the asset pipeline,
 * see docs/assets/itch-fx-audio.md). They are packed at native size into ONE shared texture and played by the same
 * instanced particle shader as the Kenney tiles (frame = floor(age / life * frames)).
 *
 * Loading is lazy and non-blocking: until the images arrive `sheet()` returns false and the regular particle presets carry the effect.
 */

export interface SheetMeta {
  cols: number;
  rows: number;
  count: number;
  /** authored frames per second */
  fps: number;
  /** frame height / width */
  aspect: number;
  /** designed for additive blending */
  add: boolean;
}

interface SheetDef {
  name: string;
  path: string;
  cols: number;
  rows: number;
  count: number;
  fps: number;
  add?: boolean;
}

const SP = '/assets/vfx/itch/super-pixel-effects/';
const BK = '/assets/vfx/itch/brackeys-vfx-bundle/';

export const SHEET_DEFS: SheetDef[] = [
  // hits
  { name: 'impact_dir1', path: SP + 'impacts/directional-impact-001.png', cols: 3, rows: 3, count: 7, fps: 15 },
  { name: 'impact_dir3', path: SP + 'impacts/directional-impact-003.png', cols: 3, rows: 2, count: 6, fps: 15 },
  { name: 'impact_sym1', path: SP + 'impacts/symmetrical-impact-001.png', cols: 3, rows: 3, count: 7, fps: 15 },
  { name: 'impact_sym4', path: SP + 'impacts/symmetrical-impact-004.png', cols: 3, rows: 3, count: 8, fps: 15 },
  { name: 'impact_sym6', path: SP + 'impacts/symmetrical-impact-006.png', cols: 3, rows: 3, count: 8, fps: 15 },
  { name: 'bk_bighit', path: BK + 'predrawn/big-hit.png', cols: 4, rows: 3, count: 11, fps: 20 },
  { name: 'bk_impact_white', path: BK + 'predrawn/impact-white.png', cols: 5, rows: 3, count: 13, fps: 20 },
  { name: 'bk_blood', path: BK + 'predrawn/blood-impact.png', cols: 5, rows: 5, count: 23, fps: 20 },
  { name: 'splat1', path: SP + 'splatters/burst-splatter-001.png', cols: 4, rows: 3, count: 10, fps: 15 },
  { name: 'splat_dir1', path: SP + 'splatters/directional-splatter-001.png', cols: 3, rows: 3, count: 8, fps: 15 },
  { name: 'sparkburst', path: SP + 'sci-fi/scifi-spark-burst-001.png', cols: 4, rows: 3, count: 12, fps: 15, add: true },
  // explosions / fire
  { name: 'explosion1', path: SP + 'explosions/epic-explosion-001.png', cols: 4, rows: 4, count: 13, fps: 15 },
  { name: 'explosion_sym4', path: SP + 'explosions/symmetrical-explosion-004.png', cols: 4, rows: 3, count: 12, fps: 15 },
  { name: 'bk_explosion', path: BK + 'flipbooks/explosion-01.png', cols: 8, rows: 8, count: 64, fps: 30 },
  { name: 'bk_fire', path: BK + 'flipbooks/fire-01.png', cols: 8, rows: 8, count: 64, fps: 30, add: true },
  // lightning / magic
  { name: 'lightning_strike', path: SP + 'lightning/lightning-strike-001.png', cols: 3, rows: 3, count: 7, fps: 15, add: true },
  { name: 'lightning_burst', path: SP + 'lightning/lightning-burst-003.png', cols: 4, rows: 3, count: 10, fps: 15, add: true },
  { name: 'sparkle1', path: SP + 'magic-bursts/round-sparkle-burst-001.png', cols: 4, rows: 4, count: 14, fps: 15, add: true },
  { name: 'sparkle2', path: SP + 'magic-bursts/round-sparkle-burst-002.png', cols: 5, rows: 4, count: 18, fps: 15, add: true },
  { name: 'lightburst', path: SP + 'magic-bursts/round-light-burst-001.png', cols: 3, rows: 3, count: 9, fps: 15, add: true },
  { name: 'heal', path: SP + 'fantasy-spells/spell-heal-001.png', cols: 4, rows: 4, count: 16, fps: 15 },
  { name: 'warp', path: SP + 'sci-fi/scifi-warp-001.png', cols: 4, rows: 3, count: 10, fps: 15, add: true },
  { name: 'chargeup', path: SP + 'sci-fi/scifi-charge-up-001.png', cols: 4, rows: 3, count: 12, fps: 15, add: true },
  // smoke / dust
  { name: 'skullsmoke', path: SP + 'smoke-bursts/stylized-skull-smoke-burst-001.png', cols: 4, rows: 3, count: 12, fps: 15 },
  { name: 'dust', path: SP + 'smoke-bursts/symmetrical-smoke-burst-001.png', cols: 4, rows: 3, count: 10, fps: 15 },
  { name: 'dashdust', path: SP + 'smoke-bursts/directional-smoke-burst-001.png', cols: 5, rows: 5, count: 21, fps: 15 },
];

interface Packed {
  def: SheetDef;
  img: HTMLImageElement;
  x: number;
  y: number;
}

const PLACEHOLDER = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
})();

export class SheetAtlas implements AtlasLike {
  texture: THREE.Texture = PLACEHOLDER;
  private rects = new Map<string, [number, number, number, number]>();
  private meta = new Map<string, SheetMeta>();
  ready = false;
  private starting = false;

  has(name: string): boolean {
    return this.meta.has(name);
  }

  info(name: string): SheetMeta | undefined {
    return this.meta.get(name);
  }

  sheet(name: string): { cols: number; rows: number; count: number } | undefined {
    return this.meta.get(name);
  }

  rect(name: string): [number, number, number, number] {
    return this.rects.get(name) ?? [0, 0, 0, 0];
  }

  /** Load + pack every sheet into one texture. Resolves when done (failures are skipped). Calls `onTexture` with the final texture. */
  async load(onTexture: (t: THREE.Texture) => void, timeoutMs = 20000): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    const loaded: { def: SheetDef; img: HTMLImageElement }[] = [];
    const jobs = SHEET_DEFS.map(
      (def) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            if (img.naturalWidth > 0) loaded.push({ def, img });
            resolve();
          };
          img.onerror = () => {
            console.warn(`[vfx] sprite sheet missing: ${def.name}`);
            resolve();
          };
          img.src = def.path;
        }),
    );
    await Promise.race([Promise.all(jobs), new Promise<void>((r) => setTimeout(r, timeoutMs))]);
    if (!loaded.length) return;

    // shelf packing, tallest first, fixed width
    const W = 2048;
    const GAP = 2;
    loaded.sort((a, b) => b.img.naturalHeight - a.img.naturalHeight || b.img.naturalWidth - a.img.naturalWidth);
    const packed: Packed[] = [];
    let x = 0;
    let y = 0;
    let shelfH = 0;
    for (const l of loaded) {
      const w = l.img.naturalWidth;
      const h = l.img.naturalHeight;
      if (x + w > W) {
        x = 0;
        y += shelfH + GAP;
        shelfH = 0;
      }
      packed.push({ def: l.def, img: l.img, x, y });
      x += w + GAP;
      shelfH = Math.max(shelfH, h);
    }
    const H = Math.min(4096, Math.ceil((y + shelfH) / 4) * 4);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    for (const p of packed) {
      if (p.y + p.img.naturalHeight > H) continue; // would not fit (never expected)
      g.drawImage(p.img, p.x, p.y);
      const w = p.img.naturalWidth;
      const h = p.img.naturalHeight;
      // uv rect (v up): flipY texture, canvas y grows down
      this.rects.set(p.def.name, [p.x / W, 1 - (p.y + h) / H, w / W, h / H]);
      this.meta.set(p.def.name, {
        cols: p.def.cols,
        rows: p.def.rows,
        count: p.def.count,
        fps: p.def.fps,
        aspect: h / p.def.rows / (w / p.def.cols),
        add: !!p.def.add,
      });
    }
    const tex = new THREE.CanvasTexture(canvas);
    // sheets carry their own (sRGB authored) colours, unlike the white+alpha Kenney tiles
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.flipY = true;
    tex.premultiplyAlpha = false;
    tex.needsUpdate = true;
    this.texture = tex;
    this.ready = true;
    onTexture(tex);
  }
}

// ---------------------------------------------------------------------------
// Spawn helper used by presets_sheets.ts
// ---------------------------------------------------------------------------

export interface SheetOpts {
  /** tint multiplied with the sheet's own colours (0xffffff = native) */
  color?: number;
  a?: number;
  /** playback speed multiplier (1 = authored fps) */
  speed?: number;
  /** override total life in seconds (takes precedence over speed) */
  life?: number;
  glow?: number;
  /** force the layer (default: the sheet's designed blend) */
  add?: boolean;
  /** lie on the ground instead of facing the camera */
  flat?: boolean;
  rot?: number | [number, number];
  /** lift in metres */
  up?: number;
  /** draw size end multiplier (sprite grows while playing) */
  grow?: number;
  delay?: number;
  /** random horizontal scatter */
  jit?: number;
  n?: number;
}

/** Plays a sprite sheet effect. Returns false if no listed sheet is loaded yet (the caller's other layers still work). */
export function sheet(fx: Fx, names: string | string[], p: V3 | THREE.Vector3, size: number, o: SheetOpts = {}): boolean {
  const list = typeof names === 'string' ? [names] : names;
  const avail = list.filter((n) => fx.sheets.has(n));
  if (!avail.length) return false;
  const px = Array.isArray(p) ? p[0] : p.x;
  const py = Array.isArray(p) ? p[1] : p.y;
  const pz = Array.isArray(p) ? p[2] : p.z;
  const dx = px - fx.camPos.x;
  const dz = pz - fx.camPos.z;
  if (dx * dx + dz * dz > 80 * 80) return true; // too far to notice
  const emit = (): void => {
    const name = avail[Math.floor(Math.random() * avail.length)];
    const m = fx.sheets.info(name);
    if (!m) return;
    const life = o.life ?? m.count / (m.fps * (o.speed ?? 1));
    const add = o.add ?? m.add;
    const layer = add ? fx.sheetAdd : fx.sheetAlpha;
    const flat = !!o.flat;
    layer.spawn({
      tex: name,
      n: o.n ?? 1,
      at: [px, py + (o.up ?? 0) + (flat ? 0.06 : 0), pz],
      jit: o.jit ? [o.jit, 0, o.jit] : undefined,
      area: 'disc',
      mode: flat ? 'flat' : 'bb',
      life,
      size,
      grow: o.grow ?? 1,
      asp: m.aspect,
      rot: o.rot ?? (flat ? [0, 6.283] : [-0.35, 0.35]),
      c0: o.color ?? 0xffffff,
      a: o.a ?? 1,
      fi: 0,
      fp: 0.35,
      glow: o.glow ?? (add ? 1.25 : 1),
    });
  };
  if (o.delay && o.delay > 0.001) fx.after(o.delay, emit);
  else emit();
  return true;
}
