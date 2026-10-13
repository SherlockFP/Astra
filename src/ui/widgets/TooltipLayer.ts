import { div } from './dom';

/**
 * Single floating tooltip (optionally two boxes side by side for equipped-item comparison).
 * Follows the cursor and is clamped to the viewport; never intercepts the mouse.
 */
export class TooltipLayer {
  readonly el: HTMLElement;
  private inner: HTMLElement;
  private boxA: HTMLElement;
  private boxB: HTMLElement;
  private x = 0;
  private y = 0;
  private visible = false;
  owner: object | null = null;
  private zoom = 1;

  constructor(layer: HTMLElement) {
    this.el = div('tt-wrap', layer);
    this.inner = div('tt-inner', this.el);
    this.boxA = div('tt', this.inner);
    this.boxB = div('tt second', this.inner);
    this.el.style.display = 'none';
    window.addEventListener('mousemove', (e) => {
      if (!this.visible) return;
      this.x = e.clientX;
      this.y = e.clientY;
      this.place();
    }, { passive: true });
    document.addEventListener('mouseleave', () => this.hide());
    window.addEventListener('blur', () => this.hide());
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setScale(s: number): void {
    this.zoom = s;
    this.inner.style.zoom = String(s);
  }

  show(html: string, x: number, y: number, opts: { owner?: object | null; rc?: string; html2?: string; rc2?: string } = {}): void {
    this.owner = opts.owner ?? null;
    this.x = x;
    this.y = y;
    if (this.boxA.dataset.h !== html) {
      this.boxA.dataset.h = html;
      this.boxA.innerHTML = html;
    }
    this.boxA.style.setProperty('--rc', opts.rc ?? '');
    if (opts.html2) {
      if (this.boxB.dataset.h !== opts.html2) {
        this.boxB.dataset.h = opts.html2;
        this.boxB.innerHTML = opts.html2;
      }
      this.boxB.style.setProperty('--rc', opts.rc2 ?? '');
      this.boxB.style.display = '';
    } else {
      this.boxB.style.display = 'none';
    }
    if (!this.visible) {
      this.visible = true;
      this.el.style.display = '';
      this.el.style.visibility = 'hidden';
      this.place();
      // measure after layout, then reveal (avoids a 1-frame flash at the old position)
      requestAnimationFrame(() => {
        if (this.visible) {
          this.place();
          this.el.style.visibility = '';
        }
      });
    } else {
      this.el.style.visibility = '';
      this.place();
    }
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.owner = null;
    this.el.style.display = 'none';
  }

  private place(): void {
    const r = this.el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = r.width, h = r.height;
    const off = 16;
    let px = this.x + off;
    let py = this.y + off;
    if (px + w > vw - 6) px = this.x - off - w;
    if (py + h > vh - 6) py = this.y - off - h;
    px = Math.max(6, Math.min(px, vw - w - 6));
    py = Math.max(6, Math.min(py, vh - h - 6));
    this.el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
  }
}
