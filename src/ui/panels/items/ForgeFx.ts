/** Tiny 2D canvas particle system for the Demirci anvil stage: sparks, embers, smoke, shards and shock rings. */

type Kind = 'spark' | 'ember' | 'smoke' | 'shard' | 'ring' | 'glint';

interface P {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  grav: number;
  drag: number;
  grow: number;
}

const MAX = 520;

export class ForgeFx {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private parts: P[] = [];
  private raf = 0;
  private running = false;
  private last = 0;
  private emberT = 0;
  ambient = true;
  /** Ambient ember intensity 0..1 (raised while the forge is "hot"). */
  heat = 0.2;

  constructor(private w: number, private h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pi-fx';
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
  }

  private push(p: Partial<P> & { kind: Kind; x: number; y: number }): void {
    if (this.parts.length >= MAX) this.parts.shift();
    this.parts.push({ vx: 0, vy: 0, life: 0, max: 1, size: 3, color: '#fff', rot: 0, vr: 0, grav: 0, drag: 0, grow: 0, ...p });
  }

  /** Radial spark burst. */
  sparks(x: number, y: number, n: number, color = '#ffb347', speed = 260, up = 0.5): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.75);
      this.push({
        kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * up * Math.random(),
        max: 0.45 + Math.random() * 0.55, size: 1.5 + Math.random() * 2.5, color, grav: 520, drag: 1.2,
      });
    }
  }

  /** Warm glints that twinkle (success). */
  glints(x: number, y: number, n: number, color = '#fff3b0'): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 70;
      this.push({ kind: 'glint', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vy: -12 - Math.random() * 20, max: 0.6 + Math.random() * 0.8, size: 3 + Math.random() * 5, color, rot: Math.random() * 3 });
    }
  }

  smoke(x: number, y: number, n: number, color = 'rgba(70,64,60,'): void {
    for (let i = 0; i < n; i++) {
      this.push({
        kind: 'smoke', x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 16, vx: (Math.random() - 0.5) * 24, vy: -30 - Math.random() * 40,
        max: 0.9 + Math.random() * 0.9, size: 12 + Math.random() * 14, color, grow: 26,
      });
    }
  }

  shards(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 140 + Math.random() * 280;
      this.push({
        kind: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 180, max: 0.9 + Math.random() * 0.7, size: 4 + Math.random() * 7,
        color, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18, grav: 760, drag: 0.6,
      });
    }
  }

  ring(x: number, y: number, color: string, size = 160): void {
    this.push({ kind: 'ring', x, y, max: 0.55, size: 8, color, grow: size / 0.55 });
  }

  /** Spawn a few ambient embers drifting up from the floor. */
  private ambientEmber(): void {
    this.push({
      kind: 'ember', x: Math.random() * this.w, y: this.h + 4, vx: (Math.random() - 0.5) * 14, vy: -(26 + Math.random() * 34),
      max: 2.2 + Math.random() * 2, size: 1 + Math.random() * 1.8, color: Math.random() < 0.3 ? '#ffd27a' : '#ff7a2a',
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.step(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  clear(): void {
    this.parts.length = 0;
  }

  private step(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.ambient) {
      this.emberT -= dt;
      if (this.emberT <= 0) {
        this.ambientEmber();
        this.emberT = (0.35 - this.heat * 0.28) * (0.6 + Math.random() * 0.8);
      }
    }
    ctx.clearRect(0, 0, this.w, this.h);
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) {
        parts.splice(i, 1);
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
      const t = p.life / p.max;
      switch (p.kind) {
        case 'spark': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * (1 - t * 0.6);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
          ctx.stroke();
          break;
        }
        case 'ember': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.sin(Math.min(1, t * 1.2) * Math.PI) * 0.8;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        }
        case 'glint': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.sin(t * Math.PI);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.6;
          const s = p.size * (0.5 + Math.sin(t * Math.PI));
          ctx.beginPath();
          ctx.moveTo(p.x - s, p.y);
          ctx.lineTo(p.x + s, p.y);
          ctx.moveTo(p.x, p.y - s);
          ctx.lineTo(p.x, p.y + s);
          ctx.stroke();
          break;
        }
        case 'smoke': {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.fillStyle = `${p.color}${(0.5 * (1 - t)).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'shard': {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1 - t * t;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(-p.size, -p.size * 0.4);
          ctx.lineTo(p.size, 0);
          ctx.lineTo(-p.size * 0.3, p.size * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'ring': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (1 - t) * 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * (1 - t) + 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
