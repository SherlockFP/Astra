/**
 * Small DOM controls shared by every panel and HUD widget (UI_REDESIGN §7.2, UX-00).
 * DOM only: no game state is read here. Classes come from ui/styles/kit.css.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Key cap. `dim` (default) is the small `.k-key--dim` label used in hints and titles; `dim = false` is the full key cap. */
export const keyCap = (label: string, dim = true): HTMLElement => el('span', dim ? 'k-key k-key--dim' : 'k-key', label);

/** Status chip; `color` sets the border colour (any CSS colour). */
export const chip = (text: string, color?: string): HTMLElement => {
  const e = el('span', 'k-chip', text);
  if (color) e.style.setProperty('--chip-c', color);
  return e;
};

/** Gold count / unread dot. */
export const badge = (n: number | string): HTMLElement => el('span', 'k-badge', String(n));

/**
 * Icon: a path ending in .svg / .png / .webp becomes a flat mask (`.k-ico`, colour from `--tint`);
 * anything else is shown as a text glyph. Pass `cls` to add sizing classes (e.g. 'k-ico k-head-ico').
 */
const PATH_RE = /^(\/|\.\/|https?:\/\/)?[\w\-./%]+\.(svg|png|webp)$/i;
export function iconEl(icon: string, cls = 'k-ico'): HTMLElement {
  if (PATH_RE.test(icon)) {
    const e = el('span', cls);
    e.style.setProperty('--ico', `url("${icon}")`);
    return e;
  }
  return el('span', cls.includes('k-ico') ? 'k-glyph' : cls, icon);
}
