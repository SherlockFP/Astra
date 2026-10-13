/**
 * Shared window shell (UI_REDESIGN §7.1 / §7.2, UX-00): header, tabs, body, footer with hints and buttons.
 * Adopted later by windowFrame() (UX-50) and ItemPanel (UX-51) as thin adapters; this file only builds DOM.
 */
import { G } from '../../game/G';
import type { InputAction } from '../../core/Input';
import { badge, iconEl, keyCap } from './controls';

export type PanelSize = 'S' | 'M' | 'L';

export interface ChromeOpts {
  title: string;
  icon?: string;
  keyAction?: InputAction;
  size?: PanelSize;
  modal?: boolean;
  closable?: boolean;
  hints?: string[];
  onClose(): void;
}

export interface Chrome {
  root: HTMLElement;
  head: HTMLElement;
  titleEl: HTMLElement;
  tabsHost: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  hintsEl: HTMLElement;
  btnsEl: HTMLElement;
  setTitle(t: string): void;
  setHints(list: string[]): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

/** Panel hotkey label read from the live bindings; '' when unavailable (never throws). */
function hotkeyLabel(action: InputAction | undefined): string {
  if (!action) return '';
  try {
    const label = G.input.bindingLabel(action);
    return label === '-' ? '' : label;
  } catch (err) {
    console.warn('[kit] hotkey label unavailable', action, err);
    return '';
  }
}

/** Fills a `.k-hints` host. Items read "Key: action"; the key part becomes a dim key cap. The last item is always "Esc: kapat". */
function fillHints(host: HTMLElement, items: string[]): void {
  host.textContent = '';
  const list = items.filter((s) => s.trim() !== '' && !/^esc\s*:/i.test(s.trim()));
  list.push('Esc: kapat');
  list.forEach((item, i) => {
    if (i > 0) host.append(el('span', 'k-sep-dot'));
    const hint = el('span', 'k-hint');
    const sep = item.indexOf(':');
    if (sep > 0) {
      hint.append(keyCap(item.slice(0, sep).trim()), document.createTextNode(item.slice(sep + 1).trim()));
    } else {
      hint.textContent = item.trim();
    }
    host.append(hint);
  });
}

/** Standalone hint bar: "Sağ Tık: kuşan · Esc: kapat". */
export function hintBar(items: string[]): HTMLElement {
  const host = el('div', 'k-hints');
  fillHints(host, items);
  return host;
}

export function buildChrome(o: ChromeOpts): Chrome {
  const root = el('div', `k-win k-frame k-win--${o.size ?? 'M'}${o.modal ? ' k-win--modal' : ''}`);

  const head = el('div', 'k-head');
  if (o.icon) head.append(iconEl(o.icon, 'k-ico k-head-ico'));
  const titleEl = el('div', 'k-title');
  titleEl.textContent = o.title;
  head.append(titleEl);
  const key = hotkeyLabel(o.keyAction);
  if (key) {
    const k = keyCap(key);
    k.classList.add('k-title-key');
    head.append(k);
  }
  if (o.closable !== false) {
    const x = el('button', 'k-x');
    x.type = 'button';
    x.textContent = 'X';
    x.setAttribute('aria-label', 'Kapat');
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      o.onClose();
    });
    head.append(x);
  }

  const tabsHost = el('div', 'k-win-tabs');
  const body = el('div', 'k-body k-scroll');
  const foot = el('div', 'k-foot');
  const hintsEl = el('div', 'k-hints');
  fillHints(hintsEl, o.hints ?? []);
  const btnsEl = el('div', 'k-btns');
  foot.append(hintsEl, btnsEl);

  root.append(head, tabsHost, body, foot);

  return {
    root,
    head,
    titleEl,
    tabsHost,
    body,
    foot,
    hintsEl,
    btnsEl,
    setTitle(t: string) {
      titleEl.textContent = t;
    },
    setHints(list: string[]) {
      fillHints(hintsEl, list);
    },
  };
}

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
}

export interface TabsApi {
  el: HTMLElement;
  select(id: string, silent?: boolean): void;
  badge(id: string, text: string): void;
  current(): string;
}

/** Tab strip (`.k-tabs` / `.k-tab`). A click calls onChange; select(id, true) changes the tab without calling it. */
export function buildTabs(items: TabItem[], onChange: (id: string) => void, initial?: string): TabsApi {
  const strip = el('div', 'k-tabs');
  const buttons = new Map<string, HTMLButtonElement>();
  let cur = initial && items.some((t) => t.id === initial) ? initial : (items[0]?.id ?? '');

  function paint(): void {
    for (const [id, b] of buttons) {
      const on = id === cur;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function select(id: string, silent = false): void {
    if (!buttons.has(id)) return;
    const changed = id !== cur;
    cur = id;
    paint();
    if (changed && !silent) onChange(id);
  }

  function setBadge(id: string, text: string): void {
    const b = buttons.get(id);
    if (!b) return;
    b.querySelector('.k-badge')?.remove();
    if (text === '' || text === '0') return;
    b.append(badge(text));
  }

  for (const t of items) {
    const b = el('button', 'k-tab');
    b.type = 'button';
    b.dataset.id = t.id;
    if (t.icon) b.append(iconEl(t.icon, 'k-ico k-tab-ico'));
    b.append(document.createTextNode(t.label));
    b.addEventListener('click', () => select(t.id));
    buttons.set(t.id, b);
    strip.append(b);
  }
  paint();
  return { el: strip, select, badge: setBadge, current: () => cur };
}

export interface EmptyStateOpts {
  icon: string;
  title: string;
  text: string;
  action?: { label: string; onClick(): void };
}

/** Empty state (§7.5): a dim icon, a title, one sentence and an optional primary button. */
export function emptyState(o: EmptyStateOpts): HTMLElement {
  const wrap = el('div', 'k-empty');
  wrap.append(iconEl(o.icon, 'k-ico'));
  const title = el('div', 'k-empty-title');
  title.textContent = o.title;
  wrap.append(title);
  const text = el('div', 'k-empty-text');
  text.textContent = o.text;
  wrap.append(text);
  if (o.action) {
    const action = o.action;
    const b = el('button', 'k-btn k-btn--primary');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => action.onClick());
    wrap.append(b);
  }
  return wrap;
}
