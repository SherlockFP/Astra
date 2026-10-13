import { RARITY_COLORS } from '../../../../types/common';
import type { ItemInstance } from '../../../../types/items';
import { getItemBase } from '../../../../data/items';
import { itemDisplayName } from '../../../../systems/ItemGen';
import { MARKET_ZONE_TOWN } from '../../../../data/market';
import { bindItemTip, fmtInt, h, icon, itemIcon } from '../base';
import '../../../styles/panels-market.css';

/** Shared widgets of the three Pazar panels (marketOpen / marketStall / marketSearch). OWNER: panels-game module. */

export const GOLD_ICON = '/assets/icons/item-gold-coins.svg';

/** Rarity-framed item tile with +N / quantity badges and the hud's item tooltip. `size` in px. */
export function marketTile(item: ItemInstance, size = 48, opts: { dim?: boolean; tip?: boolean } = {}): HTMLElement {
  const el = h('div.pg-itile.pm-tile', null, icon(itemIcon(item)));
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.setProperty('--rc', RARITY_COLORS[item.rarity] ?? '#fff');
  if (item.upgrade) el.append(h('span.pg-itile-up', null, `+${item.upgrade}`));
  if ((item.quantity ?? 1) > 1) el.append(h('span.pg-itile-qty', null, String(item.quantity)));
  if (opts.dim) el.classList.add('is-dim');
  if (opts.tip !== false) bindItemTip(el, item);
  return el;
}

export function rarityName(item: ItemInstance): HTMLElement {
  const base = getItemBase(item.baseId);
  const n = h('span.pm-name', null, itemDisplayName(item) || base?.name || item.baseId);
  n.style.color = RARITY_COLORS[item.rarity] ?? '#fff';
  return n;
}

/** "12.345" with a gold coin. */
export function goldChip(n: number, cls = ''): HTMLElement {
  return h('span.pm-gold' + (cls ? '.' + cls : ''), null, fmtInt(n), icon(GOLD_ICON, 'pm-coin'));
}

/**
 * Parses what a player types into a price field: "12.500", "12 500", "5k" (5 000), "1,5m" (1 500 000). NaN when it is not a number.
 * Fractions are rounded; the market clamps the range.
 */
export function parsePrice(raw: string): number {
  const t = raw.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, '');
  const m = /^([0-9.,]+)([km]?)$/.exec(t);
  if (!m) return NaN;
  let numStr = m[1];
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1;
  if (mult > 1) numStr = numStr.replace(/\./g, '').replace(',', '.'); // "1,5m"
  else numStr = numStr.replace(/[.,]/g, ''); // thousands separators
  const v = Number(numStr);
  return Number.isFinite(v) ? Math.round(v * mult) : NaN;
}

/** A numeric text field that formats with thousands separators on blur and reports parsed values on input. */
export function priceInput(value: number, onChange: (v: number) => void, cls = ''): HTMLInputElement {
  const el = h('input.pm-price' + (cls ? '.' + cls : ''), { type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: 14, placeholder: 'Fiyat' }) as HTMLInputElement;
  el.value = value > 0 ? fmtInt(value) : '';
  el.addEventListener('input', () => {
    const v = parsePrice(el.value);
    el.classList.toggle('is-bad', el.value !== '' && !(v >= 1));
    onChange(Number.isNaN(v) ? 0 : v);
  });
  el.addEventListener('blur', () => {
    const v = parsePrice(el.value);
    if (v >= 1) el.value = fmtInt(v);
  });
  // never let a key reach the game while typing
  el.addEventListener('keydown', (e) => e.stopPropagation());
  el.addEventListener('keyup', (e) => e.stopPropagation());
  return el;
}

export function zoneName(zone: string): string {
  return zone === MARKET_ZONE_TOWN ? 'Kuzgunkale Pazar Meydanı' : 'Köy Pazarı';
}

export const clock = (t: number): string => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
