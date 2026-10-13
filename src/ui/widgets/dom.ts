/** Tiny DOM helpers shared by every HUD widget (hud module). No framework: plain elements, cached writes. */

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: Element | null, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function div(cls = '', parent?: Element | null, html?: string): HTMLDivElement {
  const e = document.createElement('div');
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export function span(cls = '', parent?: Element | null, text?: string): HTMLSpanElement {
  return h('span', cls, parent, text);
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Set the mask image of an `.ico` element (white game-icons SVG tinted by CSS gradients). */
export function setIconUrl(el: HTMLElement, url: string | null | undefined): void {
  el.style.setProperty('--i', url ? `url("${url}")` : 'none');
}

/** Create `<span class="ico">` showing a white SVG icon through a CSS mask. */
export function iconEl(url: string | null | undefined, cls = '', parent?: Element | null): HTMLSpanElement {
  const e = h('span', cls ? 'ico ' + cls : 'ico', parent);
  setIconUrl(e, url);
  return e;
}

/** HTML string for an `.ico` span (tooltips). */
export function iconHTML(url: string | null | undefined, cls = ''): string {
  return `<span class="ico ${cls}" style="--i:url('${url ?? ''}')"></span>`;
}

const NUM = new Intl.NumberFormat('tr-TR');
export function fmtNum(n: number): string {
  return NUM.format(Math.round(n));
}

/** 1.2K / 3.4M style compact numbers for HP text and combo totals. */
export function fmtCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.0', '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.0', '') + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace('.0', '') + 'K';
  return fmtNum(n);
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Cooldown text: whole seconds from 10 s, one decimal below. */
export function fmtCd(sec: number): string {
  if (sec >= 3600) return Math.ceil(sec / 3600) + 's';
  if (sec >= 60) return Math.ceil(sec / 60) + 'dk';
  if (sec >= 10) return String(Math.ceil(sec));
  return sec.toFixed(1);
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clampN = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Write textContent only when it changed (cheap per-frame updates). */
export function setText(el: HTMLElement, text: string): void {
  if ((el as HTMLElement & { _t?: string })._t !== text) {
    (el as HTMLElement & { _t?: string })._t = text;
    el.textContent = text;
  }
}

/** Write innerHTML only when it changed. */
export function setHTML(el: HTMLElement, html: string): void {
  if ((el as HTMLElement & { _h?: string })._h !== html) {
    (el as HTMLElement & { _h?: string })._h = html;
    el.innerHTML = html;
  }
}

/** Set a style property only when it changed. */
export function setStyle(el: HTMLElement, prop: string, value: string): void {
  const cache = ((el as HTMLElement & { _s?: Record<string, string> })._s ??= {});
  if (cache[prop] !== value) {
    cache[prop] = value;
    if (prop.startsWith('--')) el.style.setProperty(prop, value);
    else (el.style as unknown as Record<string, string>)[prop] = value;
  }
}

export function setClass(el: HTMLElement, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

export function setDisplay(el: HTMLElement, show: boolean, display = ''): void {
  const v = show ? display : 'none';
  if (el.style.display !== v) el.style.display = v;
}

/** Restart a CSS animation class (flash/pop effects). */
export function pulse(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/** Frame-rate independent smoothing. */
export function approach(cur: number, target: number, lambda: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Asset URL helpers (white SVG icons from public/assets/icons). */
export const ICON = (name: string): string => `/assets/icons/${name}.svg`;

export const DAMAGE_COLORS: Record<string, string> = {
  physical: '#d8d8e0', fire: '#ff7a2a', frost: '#6fd8ff', lightning: '#ffe84a', shadow: '#b060ff',
  poison: '#7cd23a', holy: '#ffe08a', arcane: '#ff6ad8', true: '#ffffff',
};

/** Play a UI sound without ever throwing (audio may be a stub or missing the id). */
export function uiSound(id: string, volume = 1): void {
  try {
    // dynamic access keeps this file free of a runtime G import cycle risk
    const g = (window as unknown as { G?: { audio?: { play(id: string, o?: { volume?: number }): void } } }).G;
    g?.audio?.play(id, { volume });
  } catch {
    /* ignore */
  }
}
