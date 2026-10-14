import { G } from '../../../game/G';
import { RARITY_COLORS, RARITY_NAMES_TR, type Rarity } from '../../../types/common';
import { EQUIP_SLOT_NAMES_TR, type EquipSlot, type ItemBaseDef, type ItemCategory, type ItemInstance } from '../../../types/items';
import { STAT_INFO, type StatBlock, type StatId } from '../../../types/stats';
import type { SfxId } from '../../../types/audio';
import type { SkillSlotKey } from '../../../types/skills';
import type { CellRef } from '../../hud/barModel';
import { GEMS, getItemBase } from '../../../data/items';
import { getMaterial } from '../../../data/materials';
import type { ItemDescription } from '../../../systems/ItemGen';
import { itemApi } from './backend';
import type { ItemLocation } from '../../../systems/CharacterState';

/* ------------------------------------------------------------------ */
/* tiny DOM + misc helpers                                              */
/* ------------------------------------------------------------------ */

type Kid = Node | string | number | null | undefined | false;

/** Create an element with a class and children. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) {
    if (k == null || k === false) continue;
    e.append(k instanceof Node ? k : String(k));
  }
  return e;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function sfx(id: SfxId, volume?: number): void {
  try {
    G.audio?.play(id, volume !== undefined ? { volume } : undefined);
  } catch {
    /* sound must never break the UI */
  }
}

export function toast(text: string, kind: 'info' | 'success' | 'warning' | 'error' | 'loot' | 'levelup' | 'boss' = 'info'): void {
  try {
    G.ui?.toast(text, kind);
  } catch {
    /* ignore */
  }
}

/** Turkish thousands separator (12.345). */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('tr-TR');
}

/** Stat value formatting honouring STAT_INFO.pct (fractions -> percent). */
export function fmtStatValue(id: StatId, v: number, signed = false): string {
  const info = STAT_INFO[id];
  const sign = signed && v > 0 ? '+' : '';
  if (info?.pct) {
    const p = v * 100;
    const t = Math.abs(p) >= 100 ? p.toFixed(0) : p.toFixed(1).replace(/\.0$/, '');
    return `${sign}${t.replace('.', ',')}%`;
  }
  if (Math.abs(v) < 10 && Math.abs(v - Math.round(v)) > 0.001) return `${sign}${v.toFixed(1).replace('.', ',')}`;
  return `${sign}${fmt(v)}`;
}

export function statName(id: StatId): string {
  return STAT_INFO[id]?.name ?? id;
}

/** Restart a one-shot CSS animation class on an element (juice: pops, flashes). */
export function flashEl(el: HTMLElement, cls: string, ms = 900): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), ms);
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function locEq(a: ItemLocation, b: ItemLocation): boolean {
  if (a.where !== b.where) return false;
  if (a.where === 'equipment' && b.where === 'equipment') return a.slot === b.slot;
  if (a.where !== 'equipment' && b.where !== 'equipment') return a.index === b.index;
  return false;
}

/* ------------------------------------------------------------------ */
/* icons & material info                                                */
/* ------------------------------------------------------------------ */

const ICON_DIR = '/assets/icons/';

export const CATEGORY_ICON: Record<ItemCategory, string> = {
  fist: 'item-gloves-leather.svg',
  helm: 'item-helm.svg', shoulders: 'item-shoulders.svg', chest: 'item-chest-leather.svg', gloves: 'item-gloves.svg', legs: 'item-pants.svg',
  boots: 'item-boots.svg', belt: 'item-belt.svg', amulet: 'item-amulet.svg', ring: 'item-ring.svg',
  sword1h: 'item-sword.svg', sword2h: 'item-sword-2h.svg', axe1h: 'item-axe.svg', axe2h: 'item-axe-2h.svg', mace: 'item-mace.svg',
  staff: 'item-staff.svg', wand: 'item-wand.svg', dagger: 'item-dagger.svg', crossbow: 'item-crossbow.svg', bow: 'item-bow.svg',
  shield: 'item-shield.svg', tome: 'item-tome.svg', quiver: 'item-quiver.svg',
  material: 'item-ore.svg', consumable: 'item-potion-flask.svg', keystone: 'item-keystone.svg', gem: 'item-gem-diamond.svg', junk: 'item-junk.svg',
  flask: 'item-potion-flask.svg',
};

export const SLOT_ICON: Record<EquipSlot, string> = {
  helm: 'item-helm.svg', shoulders: 'item-shoulders.svg', chest: 'item-chest-leather.svg', gloves: 'item-gloves.svg', legs: 'item-pants.svg',
  boots: 'item-boots.svg', belt: 'item-belt.svg', amulet: 'item-amulet.svg', ring1: 'item-ring.svg', ring2: 'item-ring.svg',
  weapon: 'item-sword.svg', offhand: 'item-shield.svg',
};

const MATERIAL_ICON: Record<string, string> = {
  kara_demir: 'item-metal-bar.svg', buyulu_toz: 'item-crystal-shard.svg', ejderha_pulu: 'item-upgrade-stone.svg', ruh_tasi: 'item-crystal.svg',
  kutsama_kagidi: 'item-scroll-tied.svg', demirci_el_kitabi: 'item-book.svg', efsun_nesnesi: 'item-efsun-orb.svg', efsun_kilidi: 'ui-lock.svg',
  kadim_efsun: 'item-efsun-orb.svg', takviye_nesnesi: 'item-enchant-scroll.svg', oyma_kalemi: 'item-hammer.svg', av_muhru: 'item-trinket.svg',
  scroll_town: 'item-scroll.svg',
};

export const MATERIAL_TR: Record<string, string> = {
  kara_demir: 'Kara Demir', buyulu_toz: 'Büyülü Toz', ejderha_pulu: 'Ejderha Pulu', ruh_tasi: 'Ruh Taşı', kutsama_kagidi: 'Kutsama Kağıdı',
  demirci_el_kitabi: 'Demircinin El Kitabı', efsun_nesnesi: 'Efsun Nesnesi', efsun_kilidi: 'Efsun Kilidi', kadim_efsun: 'Kadim Efsun',
  takviye_nesnesi: 'Takviye Nesnesi', oyma_kalemi: 'Oyma Kalemi', av_muhru: 'Av Mührü', scroll_town: 'Dönüş Parşömeni',
};

export function iconUrl(file: string): string {
  if (!file) return ICON_DIR + 'item-junk.svg';
  if (file.startsWith('/') || file.startsWith('http') || file.startsWith('data:')) return file;
  return ICON_DIR + file;
}

export interface MaterialInfo {
  id: string;
  name: string;
  desc: string;
  icon: string;
  rarity: Rarity;
  kind: string;
  sellPrice: number;
  buyPrice?: number;
}

export function humanize(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function gemParts(id: string): { type: string; grade: number } | null {
  const m = /^gem_([a-z]+)_(\d)$/.exec(id);
  return m ? { type: m[1], grade: Number(m[2]) } : null;
}

const GEM_TYPE_TR: Record<string, string> = { ruby: 'Yakut', emerald: 'Zümrüt', sapphire: 'Safir', topaz: 'Topaz', amethyst: 'Ametist', diamond: 'Elmas' };
const GEM_GRADE_TR = ['', 'Kırık', 'Kusurlu', '', 'Kusursuz', 'Kraliyet', 'Kadim'];
const GEM_COLORS: Record<string, string> = { ruby: '#e0303a', emerald: '#2ecc71', sapphire: '#2f6fe0', topaz: '#f2c037', amethyst: '#9b59d0', diamond: '#e8f4ff' };

export function gemColor(id: string | null | undefined): string {
  if (!id) return '#777';
  const def = GEMS[id];
  if (def?.color) return def.color;
  const p = gemParts(id);
  if (p) return GEM_COLORS[p.type] ?? '#ccc';
  for (const k of Object.keys(GEM_COLORS)) if (id.includes(k)) return GEM_COLORS[k];
  return '#ccc';
}

export function gemName(id: string): string {
  const mat = getMaterial(id);
  if (mat?.name) return mat.name;
  if (GEMS[id]?.name) return GEMS[id].name;
  const p = gemParts(id);
  if (p) return `${GEM_GRADE_TR[p.grade] ? GEM_GRADE_TR[p.grade] + ' ' : ''}${GEM_TYPE_TR[p.type] ?? humanize(p.type)}`;
  return humanize(id);
}

export function materialInfo(id: string): MaterialInfo {
  const m = getMaterial(id);
  const gem = gemParts(id);
  const icon = m?.icon || (gem ? 'item-gem-' + (gem.type === 'ruby' ? 'fire' : gem.type === 'emerald' ? 'emerald' : 'diamond') + '.svg' : MATERIAL_ICON[id]) || (id.startsWith('pot_hp') ? 'item-potion-health.svg' : id.startsWith('pot_') ? 'item-potion-mana.svg' : id.startsWith('elixir') ? 'item-potion-elixir.svg' : 'item-ore.svg');
  return {
    id,
    name: m?.name ?? (gem ? gemName(id) : MATERIAL_TR[id] ?? humanize(id)),
    desc: m?.desc ?? '',
    icon: iconUrl(icon),
    rarity: m?.rarity ?? 'common',
    kind: m?.kind ?? (gem ? 'crafting' : id.startsWith('pot_') || id.startsWith('elixir') ? 'consumable' : 'upgrade'),
    sellPrice: m?.sellPrice ?? 0,
    buyPrice: m?.buyPrice,
  };
}

/* ------------------------------------------------------------------ */
/* item helpers                                                         */
/* ------------------------------------------------------------------ */

const NON_EQUIP: ItemCategory[] = ['material', 'consumable', 'keystone', 'gem', 'junk'];

export const CATEGORY_SLOTS: Partial<Record<ItemCategory, EquipSlot[]>> = {
  helm: ['helm'], shoulders: ['shoulders'], chest: ['chest'], gloves: ['gloves'], legs: ['legs'], boots: ['boots'], belt: ['belt'], amulet: ['amulet'],
  ring: ['ring1', 'ring2'],
  sword1h: ['weapon'], sword2h: ['weapon'], axe1h: ['weapon'], axe2h: ['weapon'], mace: ['weapon'], staff: ['weapon'], wand: ['weapon'],
  dagger: ['weapon', 'offhand'], crossbow: ['weapon'], bow: ['weapon'],
  shield: ['offhand'], tome: ['offhand'], quiver: ['offhand'],
};

// (CATEGORY_ICON above also has `fist`: item-gloves-leather, GDD_CLASSES_V2 §8)
export const CATEGORY_TR: Record<ItemCategory, string> = {
  fist: 'Yumruk Silahı',
  helm: 'Kask', shoulders: 'Omuzluk', chest: 'Zırh', gloves: 'Eldiven', legs: 'Pantolon', boots: 'Çizme', belt: 'Kemer', amulet: 'Kolye', ring: 'Yüzük',
  sword1h: 'Tek El Kılıç', sword2h: 'Çift El Kılıç', axe1h: 'Tek El Balta', axe2h: 'Çift El Balta', mace: 'Gürz', staff: 'Asa', wand: 'Değnek',
  dagger: 'Hançer', crossbow: 'Arbalet', bow: 'Yay', shield: 'Kalkan', tome: 'Büyü Kitabı', quiver: 'Ok Kılıfı',
  material: 'Malzeme', consumable: 'Kullanılabilir', keystone: 'Anahtar Taşı', gem: 'Taş', junk: 'Çerçöp',
  flask: 'Şişe',
};

/** Sorting weight by category (weapons first, then armour, jewelry, rest). */
export const CATEGORY_ORDER: ItemCategory[] = [
  'sword1h', 'sword2h', 'axe1h', 'axe2h', 'mace', 'staff', 'wand', 'dagger', 'bow', 'crossbow', 'shield', 'tome', 'quiver',
  'helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots', 'belt', 'amulet', 'ring', 'keystone', 'gem', 'consumable', 'material', 'junk',
];

export function baseOf(item: ItemInstance): ItemBaseDef | undefined {
  return getItemBase(item.baseId);
}

export function categoryOf(item: ItemInstance): ItemCategory | undefined {
  return baseOf(item)?.category;
}

export function isEquipItem(item: ItemInstance): boolean {
  const c = categoryOf(item);
  return !!c && !NON_EQUIP.includes(c);
}

export function slotsForItem(item: ItemInstance): EquipSlot[] {
  const c = categoryOf(item);
  return (c && CATEGORY_SLOTS[c]) || [];
}

export function isTwoHanded(item: ItemInstance | undefined | null): boolean {
  if (!item) return false;
  const b = baseOf(item);
  return !!b && (b.twoHanded === true || b.category === 'sword2h' || b.category === 'axe2h' || b.category === 'staff');
}

const descCache = new WeakMap<ItemInstance, { sig: string; d: ItemDescription }>();

function itemSig(item: ItemInstance): string {
  let s = `${item.uid}|${item.baseId}|${item.rarity}|${item.itemLevel}|${item.upgrade ?? 0}|${item.quantity ?? 1}|${item.name ?? ''}|${item.sockets ? item.sockets.join(',') : ''}`;
  for (const a of item.affixes) s += `|${a.affixId}:${a.value}:${a.locked ? 1 : 0}`;
  return s;
}

/** describeItem() wrapped with caching, error safety and fallbacks for data that is not there yet. */
export function describe(item: ItemInstance): ItemDescription {
  const sig = itemSig(item);
  const c = descCache.get(item);
  if (c && c.sig === sig) return c.d;
  let d: ItemDescription;
  try {
    d = itemApi.describe(item);
  } catch (e) {
    console.warn('[panels-items] describeItem failed', e);
    d = { name: item.name ?? item.baseId, rarity: item.rarity, color: '#fff', slotLabel: '', itemLevel: item.itemLevel, requiredLevel: 1, implicitLines: [], affixLines: [], socketLines: [], specialLines: [], sellPrice: 0, totalStats: {}, icon: '', isEquipment: false };
  }
  const base = baseOf(item);
  const out: ItemDescription = { ...d };
  if (!out.name || out.name === item.baseId) out.name = item.name ?? base?.name ?? item.baseId;
  if (item.upgrade && item.upgrade > 0 && !/\+\d+/.test(out.name)) out.name = `${out.name} +${item.upgrade}`;
  out.color = RARITY_COLORS[item.rarity];
  if (!out.icon) out.icon = base?.icon || (base ? CATEGORY_ICON[base.category] : '') || 'item-junk.svg';
  if (!out.slotLabel && base) out.slotLabel = CATEGORY_TR[base.category];
  if (!out.requiredLevel || out.requiredLevel < 2) out.requiredLevel = base?.minLevel ?? out.requiredLevel ?? 1;
  if (!out.isEquipment && base) out.isEquipment = !NON_EQUIP.includes(base.category);
  if (!out.sellPrice && base?.sellPrice) out.sellPrice = base.sellPrice;
  descCache.set(item, { sig, d: out });
  return out;
}

export function itemIcon(item: ItemInstance): string {
  return iconUrl(describe(item).icon);
}

export function itemName(item: ItemInstance): string {
  return describe(item).name;
}

/** Can the local character use (equip) this item? Falls back to own checks while CharacterState is a stub. */
export function isUsable(item: ItemInstance): boolean {
  const c = G.character;
  if (!c) return true;
  const base = baseOf(item);
  if (!base || NON_EQUIP.includes(base.category)) return true;
  try {
    const r = c.canEquip(item);
    if (r.ok) return true;
    if (r.reason) return false;
  } catch {
    /* fall through */
  }
  const req = describe(item).requiredLevel;
  if (c.level < req) return false;
  if (base.classes && !base.classes.includes(c.classId)) return false;
  return true;
}

/** Why an item can not be equipped (Turkish) — used for error toasts. */
export function whyNot(item: ItemInstance): string {
  const c = G.character;
  if (!c) return 'Karakter yok';
  try {
    const r = c.canEquip(item);
    if (r.reason) return r.reason;
  } catch {
    /* ignore */
  }
  const base = baseOf(item);
  const req = describe(item).requiredLevel;
  if (c.level < req) return `Gerekli seviye: ${req}`;
  if (base?.classes && !base.classes.includes(c.classId)) return 'Bu sınıf bu eşyayı kullanamaz';
  return 'Bu eşya kuşanılamaz';
}

/** The equipped item an item would replace (for tooltip comparison). */
export function compareFor(item: ItemInstance): ItemInstance | null {
  const c = G.character;
  if (!c) return null;
  const slots = slotsForItem(item);
  for (const s of slots) {
    const e = c.save.equipment[s];
    if (e && e.uid !== item.uid) return e;
  }
  return null;
}

export function rarityOrder(r: Rarity): number {
  return ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'set'].indexOf(r);
}

/* ------------------------------------------------------------------ */
/* tooltips                                                             */
/* ------------------------------------------------------------------ */

class FloatingTip {
  el: HTMLDivElement;
  constructor() {
    this.el = h('div', 'pi-tip');
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }
  show(html: string, x: number, y: number): void {
    this.el.innerHTML = html;
    this.el.style.display = 'block';
    this.move(x, y);
  }
  move(x: number, y: number): void {
    const r = this.el.getBoundingClientRect();
    let px = x + 18;
    let py = y + 18;
    if (px + r.width > window.innerWidth - 6) px = Math.max(6, x - r.width - 14);
    if (py + r.height > window.innerHeight - 6) py = Math.max(6, window.innerHeight - r.height - 6);
    this.el.style.left = `${px}px`;
    this.el.style.top = `${py}px`;
  }
  hide(): void {
    this.el.style.display = 'none';
  }
}

let ownTip: FloatingTip | null = null;
function getOwnTip(): FloatingTip {
  return (ownTip ??= new FloatingTip());
}

export function hideTips(): void {
  ownTip?.hide();
  try {
    G.ui?.hideTooltip();
  } catch {
    /* ignore */
  }
}

/** Own (always available) tooltip — used for stats, skills, materials, buttons. */
export function bindTip(target: HTMLElement, getHtml: () => string | null | undefined): void {
  const place = (e: PointerEvent) => {
    if (drag.active) return;
    const html = getHtml();
    if (!html) return hideTips();
    getOwnTip().show(html, e.clientX, e.clientY);
  };
  target.addEventListener('pointerenter', place);
  target.addEventListener('pointermove', (e) => {
    if (drag.active) return;
    if (ownTip && ownTip.el.style.display !== 'none') ownTip.move(e.clientX, e.clientY);
    else place(e);
  });
  target.addEventListener('pointerleave', () => ownTip?.hide());
}

function delta(a: StatBlock, b: StatBlock): { id: StatId; v: number }[] {
  const ids = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  const out: { id: StatId; v: number }[] = [];
  for (const id of ids) {
    const v = (a[id as StatId] ?? 0) - (b[id as StatId] ?? 0);
    if (Math.abs(v) > 1e-6) out.push({ id: id as StatId, v });
  }
  return out;
}

/** Our own item tooltip (used when the hud's G.ui.itemTooltipHTML returns nothing). */
export function fallbackItemHTML(item: ItemInstance, cmp?: ItemInstance | null): string {
  const d = describe(item);
  const col = RARITY_COLORS[item.rarity];
  let s = `<div class="pi-tip-name" style="color:${col}">${esc(d.name)}</div>`;
  s += `<div class="pi-tip-sub"><span style="color:${col}">${RARITY_NAMES_TR[item.rarity]}</span> ${esc(d.slotLabel)}</div>`;
  if (d.damage) s += `<div class="pi-tip-big">${fmt(d.damage.min)} – ${fmt(d.damage.max)} Hasar</div><div class="pi-tip-dim">${d.damage.aps.toFixed(2).replace('.', ',')} saldırı/sn · ${d.damage.dps.toFixed(1).replace('.', ',')} DPS</div>`;
  if (d.armor) s += `<div class="pi-tip-big">${fmt(d.armor)} Zırh</div>`;
  for (const l of d.implicitLines) s += `<div class="pi-tip-line">${esc(l)}</div>`;
  for (const a of d.affixLines) s += `<div class="pi-tip-line pi-tip-affix${a.locked ? ' locked' : ''}">${esc(a.text)}${a.locked ? ' <span class="pi-tip-lock">(kilitli)</span>' : ''}</div>`;
  if (d.upgradeLine) s += `<div class="pi-tip-line pi-tip-up">${esc(d.upgradeLine)}</div>`;
  for (const so of d.socketLines) {
    s += so.gemName
      ? `<div class="pi-tip-line"><span class="pi-tip-gem" style="background:${so.color ?? '#ccc'}"></span>${esc(so.gemName)}${so.text ? ' · ' + esc(so.text) : ''}</div>`
      : `<div class="pi-tip-line pi-tip-dim"><span class="pi-tip-gem empty"></span>Boş Yuva</div>`;
  }
  if (!d.socketLines.length && item.sockets) {
    for (const g of item.sockets) {
      s += g
        ? `<div class="pi-tip-line"><span class="pi-tip-gem" style="background:${gemColor(g)}"></span>${esc(gemName(g))}</div>`
        : `<div class="pi-tip-line pi-tip-dim"><span class="pi-tip-gem empty"></span>Boş Yuva</div>`;
    }
  }
  if (d.setInfo) {
    s += `<div class="pi-tip-set">${esc(d.setInfo.name)}</div>`;
    for (const p of d.setInfo.pieces) s += `<div class="pi-tip-line ${p.owned ? 'pi-tip-setown' : 'pi-tip-dim'}">${esc(p.name)}</div>`;
    for (const b of d.setInfo.bonuses) s += `<div class="pi-tip-line ${b.active ? 'pi-tip-setown' : 'pi-tip-dim'}">(${b.count}) ${esc(b.text)}</div>`;
  }
  d.specialLines.forEach((l, i) => {
    s += d.specialInactive?.[i] ? `<div class="pi-tip-line pi-tip-special off" style="color:#8f8a80;opacity:.85">${esc(l)}</div>` : `<div class="pi-tip-line pi-tip-special">${esc(l)}</div>`;
  });
  if (d.flavor) s += `<div class="pi-tip-flavor">"${esc(d.flavor)}"</div>`;
  s += `<div class="pi-tip-foot">`;
  if (d.isEquipment) {
    const c = G.character;
    const bad = c && c.level < d.requiredLevel;
    s += `<span class="${bad ? 'pi-tip-bad' : ''}">Gerekli Seviye ${d.requiredLevel}</span> · Eşya Seviyesi ${d.itemLevel}`;
    if (d.classes?.length) s += `<div class="${isUsable(item) ? '' : 'pi-tip-bad'}">Sınıf: ${esc(d.classes.join(', '))}</div>`;
  }
  if (d.sellPrice) s += `<div class="pi-tip-gold">Satış: ${fmt(d.sellPrice)} altın</div>`;
  s += `</div>`;
  if (cmp) {
    const cd = describe(cmp);
    s += `<div class="pi-tip-cmp"><div class="pi-tip-dim">Kuşanılan: <span style="color:${RARITY_COLORS[cmp.rarity]}">${esc(cd.name)}</span></div>`;
    for (const dl of delta(d.totalStats, cd.totalStats).slice(0, 10)) {
      s += `<div class="${dl.v > 0 ? 'pi-tip-up2' : 'pi-tip-down'}">${fmtStatValue(dl.id, dl.v, true)} ${esc(statName(dl.id))}</div>`;
    }
    s += `</div>`;
  }
  return s;
}

/** Item tooltip on hover: hud tooltip when available, else our fallback. */
export function bindItemTip(target: HTMLElement, getItem: () => ItemInstance | null | undefined, opts: { compare?: boolean; footer?: () => string } = {}): void {
  let html = '';
  let useHud = false;
  const build = (): boolean => {
    const item = getItem();
    if (!item) return false;
    const cmp = opts.compare === false ? null : compareFor(item);
    const foot = opts.footer?.() ?? '';
    let hud = '';
    try {
      hud = G.ui?.itemTooltipHTML(item, cmp) ?? '';
    } catch {
      hud = '';
    }
    useHud = !!hud;
    html = (hud || fallbackItemHTML(item, cmp)) + foot;
    return true;
  };
  const put = (x: number, y: number) => {
    if (useHud) {
      try {
        G.ui.showTooltip(html, x, y);
      } catch {
        /* ignore */
      }
    } else getOwnTip().show(html, x, y);
  };
  target.addEventListener('pointerenter', (e) => {
    if (drag.active) return;
    if (build()) put(e.clientX, e.clientY);
  });
  target.addEventListener('pointermove', (e) => {
    if (drag.active || !html) return;
    if (!getItem()) return hideTips();
    if (useHud) put(e.clientX, e.clientY);
    else if (ownTip && ownTip.el.style.display !== 'none') ownTip.move(e.clientX, e.clientY);
    else if (build()) put(e.clientX, e.clientY);
  });
  target.addEventListener('pointerleave', () => {
    html = '';
    hideTips();
  });
}

/* ------------------------------------------------------------------ */
/* item slot widget                                                     */
/* ------------------------------------------------------------------ */

function upTier(n: number): string {
  if (n >= 15) return 'u15';
  if (n >= 12) return 'u12';
  if (n >= 9) return 'u9';
  if (n >= 7) return 'u7';
  if (n >= 1) return 'u1';
  return 'u0';
}

export interface SlotExtra {
  /** Dim the slot (e.g. locked by a two-handed weapon). */
  disabled?: boolean;
  /** Badge override for the bottom-right corner. */
  count?: number | string | null;
}

/** One inventory/equipment/stash cell. Cheap to update: it only touches the DOM when something changed. */
export class ItemSlot {
  readonly el: HTMLDivElement;
  item: ItemInstance | null = null;
  private ico: HTMLDivElement;
  private up: HTMLSpanElement;
  private qty: HTMLSpanElement;
  private lockEl: HTMLSpanElement;
  private socks: HTMLDivElement;
  private label: HTMLSpanElement;
  private sig = '\u0000';

  constructor(size: 'sm' | 'md' | 'lg' | 'xl' = 'md', private emptyIcon?: string, emptyLabel?: string) {
    this.el = h('div', `pi-slot sz-${size}`);
    this.ico = h('div', 'pi-ico');
    this.up = h('span', 'pi-up');
    this.qty = h('span', 'pi-qty');
    this.lockEl = h('span', 'pi-lockmark');
    this.socks = h('div', 'pi-socks');
    this.label = h('span', 'pi-slot-label', emptyLabel ?? '');
    const bad = h('div', 'pi-bad');
    this.el.append(this.ico, this.label, this.socks, this.up, this.qty, this.lockEl, bad);
    this.set(null);
  }

  set(item: ItemInstance | null, extra: SlotExtra = {}): void {
    const usable = item ? isUsable(item) : true;
    const sig = item
      ? `${itemSig(item)}|${usable ? 1 : 0}|${item.locked ? 1 : 0}|${extra.disabled ? 1 : 0}|${extra.count ?? ''}`
      : `empty|${extra.disabled ? 1 : 0}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.item = item;
    const el = this.el;
    el.classList.toggle('empty', !item);
    el.classList.toggle('disabled', !!extra.disabled);
    el.classList.toggle('unusable', !usable);
    if (!item) {
      el.className = el.className.replace(/\brar-\w+/g, '').replace(/\bu\d+\b/g, '').trim();
      el.style.removeProperty('--rc');
      this.setIcon(this.emptyIcon ? iconUrl(this.emptyIcon) : null);
      this.up.textContent = '';
      this.qty.textContent = '';
      this.lockEl.style.display = 'none';
      this.socks.replaceChildren();
      return;
    }
    const col = RARITY_COLORS[item.rarity];
    el.className = el.className.replace(/\brar-\w+/g, '').replace(/\bu\d+\b/g, '').trim();
    el.classList.add(`rar-${item.rarity}`, upTier(item.upgrade ?? 0));
    el.style.setProperty('--rc', col);
    this.setIcon(itemIcon(item));
    this.up.textContent = item.upgrade && item.upgrade > 0 ? `+${item.upgrade}` : '';
    const q = extra.count ?? (item.quantity && item.quantity > 1 ? item.quantity : '');
    this.qty.textContent = q === null ? '' : String(q);
    this.lockEl.style.display = item.locked ? 'block' : 'none';
    this.socks.replaceChildren();
    if (item.sockets?.length) {
      for (const g of item.sockets) {
        const dot = h('i', g ? 'filled' : '');
        if (g) dot.style.setProperty('--gc', gemColor(g));
        this.socks.append(dot);
      }
    }
  }

  private setIcon(url: string | null): void {
    const ico = this.ico;
    if (!url) {
      ico.style.removeProperty('--ico');
      ico.className = 'pi-ico none';
      return;
    }
    const isSvg = /\.svg(\?|$)/i.test(url);
    ico.className = isSvg ? 'pi-ico' : 'pi-ico img';
    ico.style.setProperty('--ico', `url("${url}")`);
  }
}

/* ------------------------------------------------------------------ */
/* drag & drop (pointer based, shared by every panel)                   */
/* ------------------------------------------------------------------ */

export type DragPayload =
  | { kind: 'item'; item: ItemInstance; loc: ItemLocation }
  | { kind: 'skill'; skillId: string; from?: SkillSlotKey; cell?: CellRef }
  | { kind: 'mat'; id: string; cell?: CellRef };

export interface DropSpec {
  accepts(p: DragPayload): boolean;
  /** Return false to signal a refused drop (plays the error sound). */
  drop(p: DragPayload): boolean | void;
}

export interface SourceSpec {
  /** The pointer event of the first move past the threshold (shiftKey gates action bar pickups). */
  payload(ev?: PointerEvent): DragPayload | null;
  /** Released with no drop zone under the pointer (drag off an action bar removes the cell). */
  onDropOutside?(p: DragPayload): void;
  onClick?(e: MouseEvent): void;
  onDouble?(e: MouseEvent): void;
  onContext?(e: MouseEvent): void;
}

class DragManager {
  active: DragPayload | null = null;
  private zones = new WeakMap<HTMLElement, DropSpec>();
  private ghost: HTMLElement | null = null;
  private srcEl: HTMLElement | null = null;
  private srcSpec: SourceSpec | null = null;
  private hover: HTMLElement | null = null;
  private lastClick = new WeakMap<HTMLElement, number>();

  zone(el: HTMLElement, spec: DropSpec): void {
    this.zones.set(el, spec);
    el.classList.add('pi-drop');
  }

  bindSource(el: HTMLElement, spec: SourceSpec): void {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.active) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let started = false;
      const move = (ev: PointerEvent) => {
        if (!started) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
          const p = spec.payload(ev);
          if (!p) {
            cleanup();
            return;
          }
          started = true;
          this.begin(p, el, ev, spec);
        }
        this.moveTo(ev);
      };
      const up = (ev: PointerEvent) => {
        cleanup();
        if (started) {
          this.end(ev, true);
          return;
        }
        const now = performance.now();
        const last = this.lastClick.get(el) ?? 0;
        this.lastClick.set(el, now);
        if (now - last < 320 && spec.onDouble) {
          this.lastClick.set(el, 0);
          spec.onDouble(ev);
        } else spec.onClick?.(ev);
      };
      const cancel = () => {
        cleanup();
        if (started) this.end(null, false);
      };
      const key = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape' && started) cancel();
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', key);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', key);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.active) return;
      spec.onContext?.(e);
    });
  }

  private begin(p: DragPayload, src: HTMLElement, ev: PointerEvent, spec: SourceSpec): void {
    this.active = p;
    this.srcEl = src;
    this.srcSpec = spec;
    hideTips();
    src.classList.add('is-dragging');
    const g = src.cloneNode(true) as HTMLElement;
    g.classList.remove('is-dragging', 'pi-drop', 'pi-accept', 'hover-ok', 'hover-bad');
    g.classList.add('pi-ghost');
    const r = src.getBoundingClientRect();
    g.style.width = `${Math.min(r.width, 64)}px`;
    g.style.height = `${Math.min(r.height, 64)}px`;
    document.body.appendChild(g);
    this.ghost = g;
    document.body.classList.add('pi-dragging');
    sfx('ui_drag');
    document.querySelectorAll<HTMLElement>('.pi-drop').forEach((z) => {
      if (z === src) return;
      const spec = this.zones.get(z);
      if (spec && z.offsetParent !== null && spec.accepts(p)) z.classList.add('pi-accept');
    });
    this.moveTo(ev);
  }

  private moveTo(ev: PointerEvent): void {
    if (this.ghost) this.ghost.style.transform = `translate(${ev.clientX - 22}px, ${ev.clientY - 22}px) scale(1.12) rotate(-4deg)`;
    const t = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    const z = (t?.closest('.pi-drop') as HTMLElement | null) ?? null;
    if (z !== this.hover) {
      this.hover?.classList.remove('hover-ok', 'hover-bad');
      this.hover = z;
    }
    if (z && this.active) {
      const spec = this.zones.get(z);
      const ok = !!spec && spec.accepts(this.active);
      z.classList.toggle('hover-ok', ok);
      z.classList.toggle('hover-bad', !ok);
    }
  }

  private end(ev: PointerEvent | null, drop: boolean): void {
    const p = this.active;
    const z = this.hover;
    const src = this.srcSpec;
    this.srcSpec = null;
    this.ghost?.remove();
    this.ghost = null;
    this.srcEl?.classList.remove('is-dragging');
    this.srcEl = null;
    document.body.classList.remove('pi-dragging');
    document.querySelectorAll('.pi-accept, .hover-ok, .hover-bad').forEach((x) => x.classList.remove('pi-accept', 'hover-ok', 'hover-bad'));
    this.hover = null;
    this.active = null;
    if (drop && ev && p && !z) src?.onDropOutside?.(p);
    if (drop && ev && p && z) {
      const spec = this.zones.get(z);
      if (spec && spec.accepts(p)) {
        let r: boolean | void = true;
        try {
          r = spec.drop(p);
        } catch (e) {
          console.error('[panels-items] drop failed', e);
          r = false;
        }
        sfx(r === false ? 'ui_error' : 'ui_drop');
      } else sfx('ui_error');
    }
  }
}

export const drag = new DragManager();

/* ------------------------------------------------------------------ */
/* coin / gold widget                                                   */
/* ------------------------------------------------------------------ */

export function coinIcon(): HTMLElement {
  const c = h('i', 'pi-coin');
  return c;
}

export function slotLabelTR(slot: EquipSlot): string {
  return EQUIP_SLOT_NAMES_TR[slot];
}
