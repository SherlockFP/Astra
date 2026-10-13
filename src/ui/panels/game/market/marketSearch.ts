import { G } from '../../../../game/G';
import { RARITY_NAMES_TR } from '../../../../types/common';
import { EQUIP_SLOT_NAMES_TR, type EquipSlot } from '../../../../types/items';
import { getMarket, type SearchFilter, type SearchRow } from '../../../../systems/Market';
import { GamePanel, button, fmtInt, h, icon, sfx, statLine, statName, toast, windowFrame } from '../base';
import { GOLD_ICON, goldChip, marketTile, parsePrice, rarityName, zoneName } from './shared';

/**
 * `marketSearch` - "Pazar Arama" (CM14 Pazar): every item of every announced stall, with filters (text, slot, rarity, stat, efsun
 * count, price range, sort), the average price seen for that item base from observed listings, and "Göster": a beam over the stall
 * plus a map pin (market:pin). Works from anywhere a market is mounted. OWNER: panels-game module.
 */

const SLOT_CHOICES: EquipSlot[] = ['weapon', 'offhand', 'helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots', 'belt', 'amulet', 'ring1'];
const RARITY_CHOICES: { v: number; label: string }[] = [
  { v: 0, label: 'Tüm nadirlikler' },
  { v: 2, label: 'Büyülü ve üstü' },
  { v: 3, label: 'Nadir ve üstü' },
  { v: 4, label: 'Destansı ve üstü' },
  { v: 5, label: 'Efsanevi ve üstü' },
];
const MAX_ROWS = 80;

export class MarketSearchPanel extends GamePanel {
  private bodyEl!: HTMLElement;
  private listEl!: HTMLElement;
  private countEl!: HTMLElement;
  private statSel!: HTMLSelectElement;
  private f: SearchFilter = { sort: 'price' };
  private queued = false;
  private lastStatSig = '';

  constructor() {
    super('marketSearch', { backdropClose: false, modal: false });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({
      title: 'Pazar Arama', icon: '/assets/icons/map-village.svg', cls: 'pm-win pm-win-search', size: 'L', onClose: () => this.requestClose(),
      hints: ['Göster: tezgâhı haritada işaretle'],
    });
    this.bodyEl = h('div.pm-search');
    body.append(this.bodyEl);
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);

    const text = h('input.pm-input', { type: 'search', placeholder: 'Eşya ya da tezgâh adı...', autocomplete: 'off' }) as HTMLInputElement;
    text.addEventListener('input', () => {
      this.f.text = text.value;
      this.refresh();
    });
    text.addEventListener('keydown', (e) => e.stopPropagation());
    text.addEventListener('keyup', (e) => e.stopPropagation());

    const slot = this.select<string>([{ v: 'any', label: 'Tüm türler' }, ...SLOT_CHOICES.map((s) => ({ v: s, label: EQUIP_SLOT_NAMES_TR[s] }))], 'any', (v) => {
      this.f.slot = v as EquipSlot | 'any';
      this.refresh();
    });
    const rar = this.select<number>(RARITY_CHOICES, 0, (v) => {
      this.f.minRarity = v || undefined;
      this.refresh();
    });
    this.statSel = this.select<string>([{ v: '', label: 'Her özellik' }], '', (v) => {
      this.f.stat = v || undefined;
      this.refresh();
    });
    const efs = this.select<number>([{ v: 0, label: 'Efsun: hepsi' }, { v: 1, label: '1+ efsun' }, { v: 2, label: '2+ efsun' }, { v: 3, label: '3+ efsun' }, { v: 4, label: '4+ efsun' }], 0, (v) => {
      this.f.minAffixes = v || undefined;
      this.refresh();
    });
    const pmin = this.numField('En az fiyat', (v) => {
      this.f.minPrice = v || undefined;
      this.refresh();
    });
    const pmax = this.numField('En çok fiyat', (v) => {
      this.f.maxPrice = v || undefined;
      this.refresh();
    });
    const sort = this.select<string>([{ v: 'price', label: 'Önce ucuz' }, { v: 'rarity', label: 'Önce nadir' }, { v: 'ilvl', label: 'Önce yüksek seviye' }], 'price', (v) => {
      this.f.sort = v as SearchFilter['sort'];
      this.refresh();
    });

    this.countEl = h('div.pm-count');
    this.listEl = h('div.pm-results.pg-scroll');
    this.bodyEl.append(h('div.pm-filters', null, text, slot, rar, this.statSel, efs, pmin, pmax, sort), this.countEl, this.listEl);
  }

  private select<T extends string | number>(opts: { v: T; label: string }[], value: T, onChange: (v: T) => void): HTMLSelectElement {
    const el = h('select.pm-select') as HTMLSelectElement;
    for (const o of opts) el.append(h('option', { value: String(o.v) }, o.label));
    el.value = String(value);
    el.addEventListener('change', () => {
      const raw = el.value;
      onChange((typeof value === 'number' ? Number(raw) : raw) as T);
      sfx('ui_tab', 0.6);
    });
    el.addEventListener('keydown', (e) => e.stopPropagation());
    return el;
  }

  private numField(placeholder: string, onChange: (v: number) => void): HTMLInputElement {
    const el = h('input.pm-input.pm-num', { type: 'text', inputmode: 'numeric', placeholder, autocomplete: 'off', maxlength: 14 }) as HTMLInputElement;
    el.addEventListener('input', () => {
      const v = parsePrice(el.value);
      onChange(Number.isNaN(v) ? 0 : v);
    });
    el.addEventListener('keydown', (e) => e.stopPropagation());
    el.addEventListener('keyup', (e) => e.stopPropagation());
    return el;
  }

  protected onOpen(): void {
    const m = getMarket();
    m.init();
    void m.connect(); // browsing from anywhere a market exists; no-op when already connected
    this.listen('market:changed', () => this.queueRefresh());
    this.refresh();
  }

  private queueRefresh(): void {
    if (this.queued) return;
    this.queued = true;
    window.setTimeout(() => {
      this.queued = false;
      if (this.isOpen) this.refresh();
    }, 250);
  }

  /** Stats seen on any announced item feed the "Her özellik" choices. */
  private updateStatChoices(): void {
    const seen = new Set<string>();
    for (const r of getMarket().search({ sort: 'price' })) {
      for (const a of r.listing.item.affixes) seen.add(a.stat);
      if (r.listing.item.implicit) for (const k of Object.keys(r.listing.item.implicit)) seen.add(k);
    }
    const sig = [...seen].sort().join(',');
    if (sig === this.lastStatSig) return;
    this.lastStatSig = sig;
    const cur = this.f.stat ?? '';
    this.statSel.textContent = '';
    this.statSel.append(h('option', { value: '' }, 'Her özellik'));
    for (const s of [...seen].sort((a, b) => statName(a).localeCompare(statName(b), 'tr'))) this.statSel.append(h('option', { value: s }, statName(s)));
    this.statSel.value = seen.has(cur) ? cur : '';
    if (!seen.has(cur)) this.f.stat = undefined;
  }

  private refresh(): void {
    const m = getMarket();
    this.updateStatChoices();
    const rows = m.search(this.f);
    const stalls = new Set([...m.stalls.values()].filter((s) => !s.hidden).map((s) => s.sellerId)).size;
    this.countEl.textContent = '';
    this.countEl.append(
      h('span', null, `${stalls} tezgâh · ${rows.length} eşya${rows.length > MAX_ROWS ? ` (ilk ${MAX_ROWS} gösteriliyor)` : ''}`),
      h('span.pm-count-gold', null, 'Altının: ', goldChip(G.character?.save.gold ?? 0)),
    );
    this.listEl.textContent = '';
    if (!rows.length) {
      this.listEl.append(h('div.pg-empty', null, m.stalls.size ? 'Bu filtrelere uyan eşya yok.' : m.connected ? 'Şu an açık tezgâh yok.' : 'Pazar ağına bağlanılıyor ya da çevrimdışısın: yalnızca kendi tezgâhın görünür.'));
      return;
    }
    for (const r of rows.slice(0, MAX_ROWS)) this.listEl.append(this.row(r));
  }

  private row(r: SearchRow): HTMLElement {
    const { stall, listing } = r;
    const it = listing.item;
    const chips = h('div.pm-chips');
    for (const a of it.affixes.slice(0, 4)) chips.append(h('span.pm-chip', null, statLine(a.stat, a.value)));
    const avg = r.avg;
    let cmp: HTMLElement | null = null;
    if (avg !== null) {
      const ratio = r.unit / Math.max(1, avg);
      cmp = h('small.pm-cmp.' + (ratio <= 0.8 ? 'is-cheap' : ratio >= 1.25 ? 'is-dear' : 'is-fair'), null, `ort. ${fmtInt(avg * Math.max(1, listing.qty))} (${ratio <= 0.8 ? 'ucuz' : ratio >= 1.25 ? 'pahalı' : 'normal'})`);
      const hs = getMarket().priceHistory(it);
      if (hs) cmp.title = `${hs.n} gözlem: en düşük ${fmtInt(hs.min)}, en yüksek ${fmtInt(hs.max)} (birim fiyat)`;
    }
    const row = h(
      'div.pm-result' + (stall.own ? '.is-own' : ''),
      null,
      marketTile(it, 46),
      h(
        'div.pm-res-main',
        null,
        h('div.pm-res-name', null, rarityName(it), h('small', null, ` ${RARITY_NAMES_TR[it.rarity]} · Sv. ${it.itemLevel}${listing.qty > 1 ? ` · x${listing.qty}` : ''}`)),
        chips,
      ),
      h('div.pm-res-price', null, h('span.pm-price-tag', null, fmtInt(listing.price), icon(GOLD_ICON, 'pm-coin')), cmp),
      h('div.pm-res-seller', null, h('b', null, stall.title), h('small', null, `${stall.look.n} · ${zoneName(stall.zone)}${stall.own ? ' · senin' : ''}`)),
      button('Göster', () => {
        const res = getMarket().show(stall.sellerId);
        if (!res.ok) {
          toast(res.reason ?? 'Gösterilemedi.', 'warning');
          return;
        }
        toast(`"${stall.title}" tezgâhı işaretlendi.`, 'success');
        this.requestClose();
      }, { variant: 'primary' }),
    );
    return row;
  }
}
