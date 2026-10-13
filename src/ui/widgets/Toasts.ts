import { div, esc, pulse } from './dom';

export type ToastKind = 'info' | 'success' | 'warning' | 'error' | 'loot' | 'levelup' | 'boss';

const GLYPH: Record<ToastKind, string> = { info: 'i', success: '✓', warning: '!', error: '✕', loot: '★', levelup: '▲', boss: '☠' };
const DURATION: Record<ToastKind, number> = { info: 3200, success: 3000, warning: 3800, error: 3000, loot: 3600, levelup: 4600, boss: 4600 };

interface Toast {
  el: HTMLElement;
  text: string;
  kind: ToastKind;
  count: number;
  textEl: HTMLElement;
  countEl: HTMLElement;
  until: number;
  born: number;
}

/** Stacked top-centre toasts: coloured by kind, de-duplicated (x2), capped, slide/fade animations. */
export class Toasts {
  private list: Toast[] = [];

  constructor(private layer: HTMLElement) {}

  show(text: string, kind: ToastKind = 'info', html?: string): void {
    const now = performance.now();
    const key = html ?? esc(text);
    const prev = this.list.find((t) => t.text === key && t.kind === kind && now - t.born < 2600);
    if (prev) {
      prev.count++;
      prev.countEl.textContent = 'x' + prev.count;
      prev.countEl.style.display = '';
      prev.until = now + DURATION[kind];
      prev.el.classList.remove('out');
      pulse(prev.el, 'bump');
      return;
    }
    const el = div('toast k-' + kind, this.layer);
    div('toast-glyph', el).textContent = GLYPH[kind];
    const textEl = div('toast-text', el);
    textEl.innerHTML = key;
    const countEl = div('toast-count', el);
    countEl.style.display = 'none';
    const t: Toast = { el, text: key, kind, count: 1, textEl, countEl, until: now + DURATION[kind], born: now };
    this.list.push(t);
    while (this.list.length > 5) this.remove(this.list[0]);
  }

  private remove(t: Toast): void {
    const i = this.list.indexOf(t);
    if (i >= 0) this.list.splice(i, 1);
    t.el.remove();
  }

  update(now: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      if (now > t.until + 350) this.remove(t);
      else if (now > t.until && !t.el.classList.contains('out')) t.el.classList.add('out');
    }
  }

  clear(): void {
    for (const t of [...this.list]) this.remove(t);
  }
}
