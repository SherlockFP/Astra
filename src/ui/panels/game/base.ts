import { G } from '../../../game/G';
import { h as hCore, formatTime } from '../../../core/utils';
import type { UIPanel } from '../../UI';
import type { SfxId } from '../../../types/audio';
import type { GameEventName, GameEvents } from '../../../core/events';
import type { ItemInstance } from '../../../types/items';
import type { ClassId } from '../../../types/common';
import { RARITY_COLORS, RARITY_NAMES_TR } from '../../../types/common';
import type { AffixId, MythicAffixDef } from '../../../types/mythic';
import type { DungeonDef } from '../../../types/dungeons';
import { DUNGEONS, DUNGEON_IDS, getDungeon } from '../../../data/dungeons';
import { MYTHIC_AFFIXES } from '../../../data/mythicAffixes';
import { getItemBase } from '../../../data/items';
import { STAT_INFO, type StatId } from '../../../types/stats';
import '../../styles/panels-game.css';
import { hintBar } from '../../kit';

export { formatTime };
export type Kids = (Node | string | number | null | undefined | false)[];

/** core/utils h() with an extra overload so computed class strings ('div.a' + (x ? '.b' : '')) type-check. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K | `${K}.${string}` | `${K}#${string}`, props?: Partial<Record<string, unknown>> | null, ...children: Kids): HTMLElementTagNameMap[K];
export function h(tag: string, props?: Partial<Record<string, unknown>> | null, ...children: Kids): HTMLElement;
export function h(tag: string, props: Partial<Record<string, unknown>> | null = null, ...children: Kids): HTMLElement {
  return hCore(tag as 'div', props, ...children);
}

/* ------------------------------------------------------------------ */
/* Small service wrappers (never throw)                                 */
/* ------------------------------------------------------------------ */

export function sfx(id: SfxId, volume?: number): void {
  try {
    G.audio?.play(id, volume != null ? { volume } : undefined);
  } catch {
    /* audio unavailable */
  }
}

export function toast(text: string, kind: 'info' | 'success' | 'warning' | 'error' | 'loot' | 'levelup' | 'boss' = 'info'): void {
  try {
    G.ui?.toast(text, kind);
  } catch {
    /* ui not ready */
  }
}

/** Open another panel through the UI registry (fall back to the event bus). */
export function openPanel(id: string, data?: unknown): void {
  try {
    G.ui.openPanel(id, data);
  } catch (e) {
    console.warn('[panels-game] openPanel failed', id, e);
  }
}

export function uiRoot(): HTMLElement {
  return (G.ui && G.ui.root) || document.getElementById('ui-root') || document.body;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString('tr-TR');
export const pct = (v: number, digits = 0) => `%${(v * 100).toFixed(digits).replace('.', ',')}`;
export const clampN = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Time as mm:ss (handles hours for very long runs). */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function icon(src: string, cls = ''): HTMLImageElement {
  const img = h('img', { src, alt: '', draggable: false, class: 'pg-ico ' + cls }) as HTMLImageElement;
  img.addEventListener('error', () => {
    img.style.visibility = 'hidden';
  });
  return img;
}

/* ------------------------------------------------------------------ */
/* Static reference data (Turkish names)                                */
/* ------------------------------------------------------------------ */

export const CLASS_META: Record<ClassId, { name: string; icon: string; color: string }> = {
  knight: { name: 'Şövalye', icon: '/assets/icons/class-knight.svg', color: '#c7d3e6' },
  barbarian: { name: 'Barbar', icon: '/assets/icons/class-barbarian.svg', color: '#e0683c' },
  mage: { name: 'Büyücü', icon: '/assets/icons/class-mage.svg', color: '#7e8cff' },
  rogue: { name: 'Haydut', icon: '/assets/icons/class-rogue.svg', color: '#62c978' },
  monk: { name: 'Keşiş', icon: '/assets/icons/buff-strength.svg', color: '#4fd1c5' },
  archer: { name: 'Okçu', icon: '/assets/icons/class-ranger.svg', color: '#d9a441' },
  paladin: { name: 'Paladin', icon: '/assets/icons/class-cleric.svg', color: '#fff0b8' },
  necromancer: { name: 'Nekromant', icon: '/assets/icons/skill-summon-skeleton.svg', color: '#9ee07a' },
  warlock: { name: 'Warlock', icon: '/assets/icons/skill-curse.svg', color: '#c05ae0' },
  demonhunter: { name: 'İblis Avcısı', icon: '/assets/icons/skill-claw-strike.svg', color: '#a330c9' }, // CM1 stub
  evoker: { name: 'Ejderhasoy', icon: '/assets/icons/skill-fire-breath.svg', color: '#33937f' },        // CM1 stub
  priest: { name: 'Rahip', icon: '/assets/icons/skill-holy-light.svg', color: '#ffffff' },      // CLASS SCAFFOLD
  shaman: { name: 'Şaman', icon: '/assets/icons/skill-lightning-bolt.svg', color: '#0070dd' }, // CLASS SCAFFOLD
  druid: { name: 'Druid', icon: '/assets/icons/buff-regen.svg', color: '#ff7c0a' },           // CLASS SCAFFOLD
};

export const DIFFICULTY_NAMES: Record<string, string> = {
  normal: 'Normal',
  heroic: 'Kahramanlık',
  mythic: 'Mitik 0',
  mythicplus: 'Mitik+',
};

export function ratingTier(r: number): { name: string; color: string } {
  if (r >= 1800) return { name: 'Kadim', color: '#e6cc80' };
  if (r >= 1500) return { name: 'Efsanevi', color: '#ff8000' };
  if (r >= 1100) return { name: 'Destansı', color: '#a335ee' };
  if (r >= 700) return { name: 'Usta', color: '#0070dd' };
  if (r >= 300) return { name: 'Yetenekli', color: '#1eff00' };
  return { name: 'Acemi', color: '#ffffff' };
}

/** Fallback texts so panels stay readable while data/mythicAffixes.ts is empty. */
const AFFIX_FALLBACK: Record<string, { name: string; desc: string; minLevel: number }> = {
  fortified: { name: 'Tahkimli', desc: 'Boss olmayan düşmanların canı %20, verdikleri hasar %30 artar.', minLevel: 2 },
  tyrannical: { name: 'Zorba', desc: "Boss'ların canı %30, verdikleri hasar %15 artar.", minLevel: 2 },
  bolstering: { name: 'Güçlenen', desc: 'Bir düşman öldüğünde yakındaki müttefikleri güçlenir (en çok 10 yük).', minLevel: 4 },
  raging: { name: 'Öfkeli', desc: 'Canı %30 altındaki düşmanlar öfkelenir: %50 fazla hasar, kontrol etkilerine bağışık.', minLevel: 4 },
  sanguine: { name: 'Kan Dökücü', desc: 'Ölen düşmanlar kan gölü bırakır: düşmanları iyileştirir, oyunculara hasar verir.', minLevel: 4 },
  bursting: { name: 'Patlayan', desc: 'Her düşman ölümünde tüm oyuncular birikimli Patlama yükü alır.', minLevel: 4 },
  inspiring: { name: 'İlham Veren', desc: 'Bazı düşmanlar yakındaki müttefikleri kontrol etkilerine bağışık yapar.', minLevel: 4 },
  volcanic: { name: 'Volkanik', desc: 'Düşmanlardan uzak duran oyuncuların altında volkanik patlamalar oluşur.', minLevel: 4 },
  quaking: { name: 'Sarsıntılı', desc: 'Oyuncular düzenli olarak sarsıntı yayar: yakındakilere hasar verir, büyüleri keser.', minLevel: 4 },
  explosive: { name: 'Patlayıcı Küre', desc: 'Savaşta patlayıcı küreler belirir; tek vuruşla yok edilmezse tüm grubu yaralar.', minLevel: 7 },
  necrotic: { name: 'Nekrotik', desc: 'Yakın dövüş saldırıları birikimli çürüme uygular: iyileştirme azalır, zamanla hasar.', minLevel: 7 },
  spiteful: { name: 'Kin Dolu', desc: 'Ölen düşmanlar bir oyuncuyu kovalayan kin gölgesi bırakır.', minLevel: 7 },
  storming: { name: 'Fırtınalı', desc: 'Oyuncuların yakınında hortumlar belirir; temas edeni havaya fırlatır.', minLevel: 7 },
  grievous: { name: 'Ağır Yara', desc: 'Canı %90 altındaki oyuncular birikimli Ağır Yara alır.', minLevel: 7 },
  seasonal_efsun: { name: 'Efsunlu Yarık', desc: 'Zindan güçlendikçe efsun yarıkları açılır. Muhafızı öldürürsen efsun senindir.', minLevel: 10 },
};

export function affixIconPath(id: string): string {
  return id === 'seasonal_efsun' ? '/assets/icons/affix-seasonal.svg' : `/assets/icons/affix-${id}.svg`;
}

export interface AffixView {
  id: string;
  name: string;
  desc: string;
  icon: string;
  minLevel: number;
}

export function affixView(id: AffixId | string): AffixView {
  let def: MythicAffixDef | undefined;
  try {
    def = G.mplus?.getAffix(id as AffixId) ?? MYTHIC_AFFIXES[id as AffixId];
  } catch {
    def = MYTHIC_AFFIXES[id as AffixId];
  }
  const fb = AFFIX_FALLBACK[id];
  return {
    id,
    name: def?.name ?? fb?.name ?? String(id),
    desc: def?.desc ?? fb?.desc ?? '',
    icon: def?.icon || affixIconPath(id),
    minLevel: def?.minLevel ?? fb?.minLevel ?? 2,
  };
}

export function affixesForLevel(level: number, week?: number): AffixId[] {
  try {
    return G.mplus.affixesFor(level, week) ?? [];
  } catch {
    return [];
  }
}

/**
 * Dungeons offered at the Font of Power / keystone UI / M+ tables: DUNGEON_IDS only (stable progression order, level 8 -> 52).
 * Open-world zones (Sisli Koru, `outdoor: true`) live in OPEN_ZONES and are never selectable here.
 */
export function dungeonList(): DungeonDef[] {
  const out: DungeonDef[] = [];
  for (const id of DUNGEON_IDS) {
    const d = DUNGEONS[id];
    if (d && !d.outdoor) out.push(d);
  }
  return out.sort((a, b) => (a.levelRange?.[0] ?? 0) - (b.levelRange?.[0] ?? 0));
}

/** Id of the zone / dungeon the current scene runs (G.mplus.prepare is called by every DungeonScene, open world included). */
export function currentZoneId(): string | null {
  return G.mplus?.params?.dungeonId ?? G.mplus?.state?.dungeonId ?? null;
}

/** True while the local player is in an open-world zone (Sisli Koru): the 'dungeon' scene with an `outdoor` def. */
export function inOpenWorld(): boolean {
  if (G.scenes?.current?.id !== 'dungeon') return false;
  const id = currentZoneId();
  return !!id && !!getDungeon(id)?.outdoor;
}

export const dungeonName = (id: string): string => DUNGEONS[id]?.name ?? getDungeon(id)?.name ?? id;

export function dungeonArt(def: DungeonDef | undefined): string {
  return def?.loadingImage || def?.icon || '/assets/icons/ui-dungeon.svg';
}

/** Row of small affix chips (icon + name) with a hover tooltip; used by the M+ info table and the keystone services. */
export function affixChips(ids: (AffixId | string)[], dim = false): HTMLElement {
  const wrap = h('span.chips' + (dim ? '.dim' : ''));
  if (!ids.length) wrap.append(h('em', null, '-'));
  for (const id of ids) {
    const a = affixView(id);
    const c = h('span.chip', null, icon(a.icon, 'pg-chipico'), a.name);
    bindTip(c, `<div class="pg-ttip"><div class="pg-ttip-name">${esc(a.name)}</div><div class="pg-ttip-kind">+${a.minLevel} ve üzeri</div><div>${esc(a.desc)}</div></div>`);
    wrap.append(c);
  }
  return wrap;
}

/* ------------------------------------------------------------------ */
/* Stat formatting (works for ids that are not in STAT_INFO yet)       */
/* ------------------------------------------------------------------ */

const EXTRA_STATS: Record<string, { name: string; pct?: boolean }> = {
  allAttr: { name: 'Tüm Özellikler' },
  resourceRegenPct: { name: 'Kaynak Yenilenmesi', pct: true },
  resourceGainPct: { name: 'Kaynak Kazanımı', pct: true },
  costReductionPct: { name: 'Büyü Maliyeti Azaltma', pct: true },
  ccDurationPct: { name: 'Kontrol Etkisi Süresi', pct: true },
  chilledDamagePct: { name: 'Üşümüş Düşmana Hasar', pct: true },
  healReceivedPct: { name: 'Alınan İyileştirme', pct: true },
  staggerPct: { name: 'Sarsma', pct: true },
  damageToManaPct: { name: 'Hasar Manadan', pct: true },
};

export function statName(key: string): string {
  return STAT_INFO[key as StatId]?.name ?? EXTRA_STATS[key]?.name ?? key;
}

export function statLine(key: string, value: number): string {
  const info = STAT_INFO[key as StatId] ?? EXTRA_STATS[key];
  const isPct = !!info?.pct || (!info && /Pct$|Chance$|Damage$/.test(key));
  const sign = value >= 0 ? '+' : '-';
  const abs = Math.abs(value);
  const txt = isPct ? `%${String(Math.round(abs * 1000) / 10).replace('.', ',')}` : String(Math.round(abs * 10) / 10).replace('.', ',');
  return `${sign}${txt} ${info?.name ?? key}`;
}

/* ------------------------------------------------------------------ */
/* Tooltip (self contained so panels do not depend on UI.showTooltip)   */
/* ------------------------------------------------------------------ */

class Tip {
  private el: HTMLDivElement | null = null;

  private ensure(): HTMLDivElement {
    if (!this.el) {
      this.el = h('div.pg-tip') as HTMLDivElement;
      this.el.style.display = 'none';
    }
    const root = uiRoot();
    if (this.el.parentElement !== root) root.appendChild(this.el);
    return this.el;
  }

  show(html: string | HTMLElement, clientX: number, clientY: number, cls = ''): void {
    const el = this.ensure();
    el.className = 'pg-tip ' + cls;
    if (typeof html === 'string') el.innerHTML = html;
    else {
      el.innerHTML = '';
      el.appendChild(html);
    }
    el.style.display = 'block';
    this.move(clientX, clientY);
  }

  move(clientX: number, clientY: number): void {
    const el = this.el;
    if (!el || el.style.display === 'none') return;
    const root = uiRoot();
    const rr = root.getBoundingClientRect();
    const scale = root.offsetWidth ? rr.width / root.offsetWidth : 1;
    const vw = rr.width / scale;
    const vh = rr.height / scale;
    let x = (clientX - rr.left) / scale + 18;
    let y = (clientY - rr.top) / scale + 14;
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    if (x + w > vw - 8) x = (clientX - rr.left) / scale - w - 18;
    if (y + hgt > vh - 8) y = vh - hgt - 8;
    el.style.left = Math.max(4, x) + 'px';
    el.style.top = Math.max(4, y) + 'px';
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none';
  }
}
export const tip = new Tip();

/** Attach a hover tooltip to an element. `html` may be computed lazily. */
export function bindTip(el: HTMLElement, html: string | (() => string), cls = ''): void {
  el.addEventListener('mouseenter', (e) => {
    const content = typeof html === 'function' ? html() : html;
    if (content) tip.show(content, e.clientX, e.clientY, cls);
  });
  el.addEventListener('mousemove', (e) => tip.move(e.clientX, e.clientY));
  el.addEventListener('mouseleave', () => tip.hide());
}

/** Item tooltip HTML: prefers the UI module's version, falls back to a compact local one. */
export function itemTipHTML(item: ItemInstance): string {
  try {
    const html = G.ui?.itemTooltipHTML(item);
    if (html) return html;
  } catch {
    /* fall through */
  }
  const base = getItemBase(item.baseId);
  const color = RARITY_COLORS[item.rarity] ?? '#fff';
  const name = item.name || base?.name || item.baseId;
  const lines: string[] = [];
  lines.push(`<div class="pg-ttip-name" style="color:${color}">${esc(name)}${item.upgrade ? ` +${item.upgrade}` : ''}</div>`);
  lines.push(`<div class="pg-ttip-kind">${RARITY_NAMES_TR[item.rarity] ?? ''} · Eşya Seviyesi ${item.itemLevel}</div>`);
  if (item.weaponDamage) lines.push(`<div class="pg-ttip-stats">${Math.round(item.weaponDamage[0])} - ${Math.round(item.weaponDamage[1])} Hasar</div>`);
  if (item.implicit) for (const [k, v] of Object.entries(item.implicit)) lines.push(`<div class="pg-ttip-stats">${statLine(k, v as number)}</div>`);
  for (const a of item.affixes) lines.push(`<div class="pg-ttip-aff">${statLine(a.stat, a.value)}</div>`);
  if (item.keystone) lines.push(`<div class="pg-ttip-special">${esc(dungeonName(item.keystone.dungeonId))} +${item.keystone.level}</div>`);
  return lines.join('');
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function itemIcon(item: ItemInstance): string {
  return getItemBase(item.baseId)?.icon || (item.keystone ? '/assets/icons/item-keystone.svg' : '/assets/icons/item-bag.svg');
}

/** Rarity-framed item tile with tooltip (used by run summary, vault, bounty rewards). */
export function itemTile(item: ItemInstance, size = 52): HTMLElement {
  const color = RARITY_COLORS[item.rarity] ?? '#fff';
  const el = h('div.pg-itile', { style: { width: size + 'px', height: size + 'px', '--rc': color } }, icon(itemIcon(item)));
  if (item.upgrade) el.append(h('span.pg-itile-up', null, `+${item.upgrade}`));
  if ((item.quantity ?? 1) > 1) el.append(h('span.pg-itile-qty', null, String(item.quantity)));
  bindItemTip(el, item);
  return el;
}

const SLOT_BY_CATEGORY: Record<string, string> = {
  helm: 'helm', shoulders: 'shoulders', chest: 'chest', gloves: 'gloves', legs: 'legs', boots: 'boots', belt: 'belt', amulet: 'amulet', ring: 'ring1',
  sword1h: 'weapon', sword2h: 'weapon', axe1h: 'weapon', axe2h: 'weapon', mace: 'weapon', staff: 'weapon', wand: 'weapon', dagger: 'weapon', crossbow: 'weapon', bow: 'weapon',
  shield: 'offhand', tome: 'offhand', quiver: 'offhand',
};

/** The currently equipped item that `item` would replace (for comparison tooltips). */
export function equippedCounterpart(item: ItemInstance): ItemInstance | null {
  const cat = getItemBase(item.baseId)?.category;
  const slot = cat ? SLOT_BY_CATEGORY[cat] : undefined;
  if (!slot) return null;
  const eq = G.character?.save.equipment as Record<string, ItemInstance | undefined> | undefined;
  return eq?.[slot] ?? null;
}

/** Item hover tooltip: the hud's WoW-style tooltip (with equipped comparison) when available, else a compact local one. */
export function bindItemTip(el: HTMLElement, item: ItemInstance): void {
  el.addEventListener('mouseenter', (e) => {
    const ui = G.ui as unknown as { showItemTooltip?: (i: ItemInstance, x: number, y: number, o?: { compare?: ItemInstance | null; owner?: object }) => void } | undefined;
    if (ui && typeof ui.showItemTooltip === 'function' && G.ui.itemTooltipHTML(item)) {
      try {
        ui.showItemTooltip(item, e.clientX, e.clientY, { compare: equippedCounterpart(item), owner: el });
        return;
      } catch {
        /* fall back */
      }
    }
    tip.show(`<div class="pg-ttip">${itemTipHTML(item)}</div>`, e.clientX, e.clientY);
  });
  el.addEventListener('mousemove', (e) => tip.move(e.clientX, e.clientY));
  el.addEventListener('mouseleave', () => {
    tip.hide();
    try {
      const ui = G.ui as unknown as { hideTooltipIf?: (o: object) => void };
      ui.hideTooltipIf?.(el);
    } catch {
      /* ignore */
    }
  });
}

/* ------------------------------------------------------------------ */
/* Reusable widgets                                                     */
/* ------------------------------------------------------------------ */

export type BtnVariant = 'normal' | 'primary' | 'danger' | 'ghost';

export function button(label: string | Node, onClick: (e: MouseEvent) => void, opts: { variant?: BtnVariant; icon?: string; title?: string; cls?: string; disabled?: boolean } = {}): HTMLButtonElement {
  const b = h('button.pg-btn', { type: 'button' }) as HTMLButtonElement;
  if (opts.variant && opts.variant !== 'normal') b.classList.add('pg-btn--' + opts.variant);
  if (opts.cls) b.classList.add(...opts.cls.split(' '));
  if (opts.icon) b.append(icon(opts.icon, 'pg-btn-ico'));
  b.append(typeof label === 'string' ? h('span', null, label) : label);
  if (opts.title) b.title = opts.title;
  b.disabled = !!opts.disabled;
  b.addEventListener('click', (e) => {
    if (b.disabled) {
      sfx('ui_error');
      return;
    }
    sfx('ui_click');
    onClick(e);
  });
  b.addEventListener('mouseenter', () => {
    if (!b.disabled) sfx('ui_hover', 0.5);
  });
  return b;
}

export interface TabsHandle {
  el: HTMLElement;
  select(id: string, silent?: boolean): void;
  current(): string;
}

export function tabs(items: { id: string; label: string; icon?: string }[], onChange: (id: string) => void, initial?: string): TabsHandle {
  const el = h('div.pg-tabs');
  const btns = new Map<string, HTMLButtonElement>();
  let cur = '';
  const select = (id: string, silent = false) => {
    cur = id;
    for (const [k, b] of btns) b.classList.toggle('is-active', k === id);
    if (silent) return;
    sfx('ui_tab');
    onChange(id);
  };
  for (const it of items) {
    const b = h('button.pg-tab', { type: 'button' }) as HTMLButtonElement;
    if (it.icon) b.append(icon(it.icon, 'pg-tab-ico'));
    b.append(h('span', null, it.label));
    b.addEventListener('click', () => select(it.id));
    btns.set(it.id, b);
    el.append(b);
  }
  select(initial ?? items[0].id, true);
  return { el, select, current: () => cur };
}

export function toggle(value: boolean, onChange: (v: boolean) => void): HTMLElement & { set(v: boolean): void } {
  const el = h('button.pg-toggle', { type: 'button', role: 'switch' }, h('span.pg-toggle-knob')) as unknown as HTMLElement & { set(v: boolean): void };
  const set = (v: boolean) => {
    el.classList.toggle('is-on', v);
    el.setAttribute('aria-checked', String(v));
    el.dataset.on = v ? '1' : '0';
  };
  set(value);
  el.set = set;
  el.addEventListener('click', () => {
    const nv = el.dataset.on !== '1';
    set(nv);
    sfx(nv ? 'ui_open' : 'ui_close', 0.6);
    onChange(nv);
  });
  return el;
}

export interface SliderOpts {
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (v: number) => string;
  onInput: (v: number) => void;
  onChange?: (v: number) => void;
}

export function slider(o: SliderOpts): HTMLElement & { set(v: number): void } {
  const fmt = o.format ?? ((v: number) => String(v));
  const input = h('input.pg-range', { type: 'range', min: String(o.min), max: String(o.max), step: String(o.step) }) as HTMLInputElement;
  const val = h('span.pg-range-val');
  const wrap = h('div.pg-slider', null, input, val) as unknown as HTMLElement & { set(v: number): void };
  const paint = (v: number) => {
    input.style.setProperty('--pg-fill', `${((v - o.min) / (o.max - o.min || 1)) * 100}%`);
    val.textContent = fmt(v);
  };
  input.value = String(o.value);
  paint(o.value);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    paint(v);
    o.onInput(v);
  });
  input.addEventListener('change', () => o.onChange?.(parseFloat(input.value)));
  wrap.set = (v: number) => {
    input.value = String(v);
    paint(v);
  };
  return wrap;
}

export function selectBox<T extends string>(options: { value: T; label: string }[], value: T, onChange: (v: T) => void): HTMLElement & { set(v: T): void } {
  const wrap = h('div.pg-seg') as unknown as HTMLElement & { set(v: T): void };
  const btns = new Map<T, HTMLButtonElement>();
  const set = (v: T) => {
    for (const [k, b] of btns) b.classList.toggle('is-active', k === v);
  };
  for (const o of options) {
    const b = h('button.pg-seg-btn', { type: 'button' }, o.label) as HTMLButtonElement;
    b.addEventListener('click', () => {
      sfx('ui_tab', 0.7);
      set(o.value);
      onChange(o.value);
    });
    btns.set(o.value, b);
    wrap.append(b);
  }
  set(value);
  wrap.set = set;
  return wrap;
}

export function bar(frac: number, color: string, label?: string): HTMLElement {
  const fill = h('div.pg-bar-fill', { style: { width: `${clampN(frac, 0, 1) * 100}%`, background: color } });
  return h('div.pg-bar', null, fill, label ? h('span.pg-bar-label', null, label) : null);
}

export function row(label: string, control: Node, hint?: string): HTMLElement {
  return h('div.pg-row', null, h('div.pg-row-label', null, h('span', null, label), hint ? h('small', null, hint) : null), h('div.pg-row-ctl', null, control));
}

export function divider(): HTMLElement {
  return h('div.pg-divider', null, h('i'));
}

/* ------------------------------------------------------------------ */
/* Window chrome                                                        */
/* ------------------------------------------------------------------ */

export interface WinOpts {
  title: string;
  icon?: string;
  cls?: string;
  width?: string;
  height?: string;
  /** UX-50: optional size class (S 480 / M 780x600 / L 1180x720, section 7.1). Absent = the panel's own width. */
  size?: 'S' | 'M' | 'L';
  /** UX-52a (section 7.1): default place. 'left' / 'right' sit 24 px from the edge, top 56 px; 'center' (default) is centred. */
  dock?: 'left' | 'right' | 'center';
  /** UX-52a (section 7.6): key hints in the footer ("Tuş: açıklama"); "Esc: kapat" is always appended. */
  hints?: string[];
  noClose?: boolean;
  onClose?: () => void;
}

export interface WinParts {
  win: HTMLElement;
  head: HTMLElement;
  titleEl: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
}

export function windowFrame(o: WinOpts): WinParts {
  const titleEl = h('div.pg-title', null, o.title);
  const head = h('div.pg-head', null, o.icon ? icon(o.icon, 'pg-head-ico') : null, titleEl, h('div.pg-head-spacer'));
  if (!o.noClose) {
    const x = h('button.pg-x', { type: 'button', title: 'Kapat' }, 'X') as HTMLButtonElement;
    x.addEventListener('click', () => o.onClose?.()); // the hud plays ui_close when the panel closes
    head.append(x);
  }
  const body = h('div.pg-body');
  const foot = h('div.pg-foot');
  if (o.hints) foot.append(hintBar(o.hints));
  const win = h('div.pg-win', null, head, divider(), body, foot);
  if (o.cls) win.classList.add(...o.cls.split(' '));
  if (o.size) win.classList.add('pg-size-' + o.size);
  if (o.dock && o.dock !== 'center') win.classList.add('pg-dock-' + o.dock);
  if (o.width) win.style.width = o.width;
  if (o.height) win.style.height = o.height;
  return { win, head, titleEl, body, foot };
}

/** Modal yes/no dialog rendered inside `host` (a panel root). */
export function askConfirm(host: HTMLElement, text: string, okLabel = 'Evet', cancelLabel = 'Vazgeç', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      layer.remove();
      resolve(v);
    };
    const ok = button(okLabel, () => done(true), { variant: danger ? 'danger' : 'primary' });
    const cancel = button(cancelLabel, () => done(false), { variant: 'ghost' });
    const layer = h('div.pg-confirm', null, h('div.pg-confirm-box', null, h('p', null, text), h('div.pg-confirm-btns', null, ok, cancel)));
    layer.addEventListener('mousedown', (e) => {
      if (e.target === layer) done(false);
    });
    host.append(layer);
    sfx('ui_open', 0.7);
    ok.focus();
  });
}

/* ------------------------------------------------------------------ */
/* Panel base class                                                     */
/* ------------------------------------------------------------------ */

export interface PanelOpts {
  /** Clicking the dimmed backdrop closes the panel. */
  backdropClose?: boolean;
  /** UX-50: modal windows get the dim backdrop; every other window leaves the world visible. Default: = backdropClose. */
  modal?: boolean;
  /** Backdrop ignores the mouse (death screen): the card itself still captures it. */
  passthrough?: boolean;
  cls?: string;
}

export abstract class GamePanel implements UIPanel {
  readonly el: HTMLElement;
  isOpen = false;
  protected built = false;
  protected data: unknown;
  private offs: (() => void)[] = [];

  constructor(readonly id: string, protected opts: PanelOpts = {}) {
    this.el = h('div.pg-root', { dataset: { panel: id } });
    if (opts.cls) this.el.classList.add(...opts.cls.split(' '));
    if (opts.modal ?? opts.backdropClose) this.el.classList.add('is-modal');
    if (opts.passthrough) this.el.classList.add('pg-pass');
    else this.el.classList.add('panel', 'ui-capture');
    this.el.style.display = 'none';
    this.el.addEventListener('mousedown', (e) => {
      if (opts.backdropClose && e.target === this.el) this.requestClose();
    });
  }

  /** Create the DOM once (first open). */
  protected abstract build(): void;
  /** Called on every open (refresh data, start animations). */
  protected onOpen(_data?: unknown): void {}
  protected onClose(): void {}
  protected tick(_dt: number): void {}

  /** Subscribe to a game event for as long as the panel is open. */
  protected listen<K extends GameEventName>(name: K, fn: (p: GameEvents[K]) => void): void {
    try {
      this.offs.push(G.events.on(name, fn));
    } catch {
      /* no event bus (dev) */
    }
  }

  open(data?: unknown): void {
    if (!this.built) {
      this.built = true;
      try {
        this.build();
      } catch (e) {
        console.error(`[panels-game] build "${this.id}" failed`, e);
      }
    }
    const wasOpen = this.isOpen;
    this.data = data;
    const root = uiRoot();
    // The hud's UI wraps every registered panel in its own host element (layering, z-index, display): never move it.
    // Only when there is no host at all (dev harness / standalone) attach to the UI root, newest on top.
    if (!this.el.isConnected) root.appendChild(this.el);
    else if (this.el.parentElement === root && this.el.nextSibling) root.appendChild(this.el);
    this.el.style.display = 'flex';
    this.isOpen = true;
    if (wasOpen) this.dropListeners();
    this.el.classList.remove('pg-closing');
    void this.el.offsetWidth;
    this.el.classList.add('pg-opening');
    try {
      this.onOpen(data);
    } catch (e) {
      console.error(`[panels-game] open "${this.id}" failed`, e);
    }
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.dropListeners();
    tip.hide();
    this.el.style.display = 'none';
    this.el.classList.remove('pg-opening');
    try {
      this.onClose();
    } catch (e) {
      console.error(`[panels-game] close "${this.id}" failed`, e);
    }
  }

  update(dt: number): void {
    if (!this.isOpen) return;
    try {
      this.tick(dt);
    } catch (e) {
      console.error(`[panels-game] update "${this.id}" failed`, e);
    }
  }

  /** Close through the UI registry so its bookkeeping (cursor lock, panel stack) stays in sync. */
  requestClose(): void {
    try {
      G.ui.closePanel(this.id);
    } catch {
      /* ignore */
    }
    if (this.isOpen) this.close();
  }

  private dropListeners(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }
}
