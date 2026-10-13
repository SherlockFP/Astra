import { G } from '../../../../game/G';
import { MARKET, saleTax } from '../../../../data/market';
import { getMarket, type ListingView, type Stall } from '../../../../systems/Market';
import { GamePanel, askConfirm, button, CLASS_META, fmtInt, h, icon, openPanel, sfx, toast, windowFrame } from '../base';
import { goldChip, marketTile, rarityName, GOLD_ICON } from './shared';

/**
 * `marketStall` - the buyer's window of one stall (CM14 Pazar, data `{ sellerId }`). Opened with F within 6 m of an announced stall.
 * One card per listing: tile with the hud item tooltip, name, price, the average price seen for that item base and a "Satın Al"
 * button. A buy reserves the gold at once and waits for the seller (10 s); the card shows "Bekleniyor". The window closes by itself
 * when the player walks out of range or the stall disappears. OWNER: panels-game module.
 */

const TILE = 52;

export class MarketStallPanel extends GamePanel {
  private titleEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private footEl!: HTMLElement;
  private sellerId = '';
  private queued = false;
  private checkT = 0;

  constructor() {
    super('marketStall', { backdropClose: false, modal: false });
  }

  protected build(): void {
    const { win, titleEl, body, foot } = windowFrame({
      title: 'Tezgâh', icon: '/assets/icons/item-bag.svg', cls: 'pm-win pm-win-stall', size: 'M', onClose: () => this.requestClose(),
      hints: ['Tık: satın al', 'Üzerine gel: eşya bilgisi'],
    });
    this.titleEl = titleEl;
    this.bodyEl = h('div.pm-buy');
    this.footEl = h('div.pm-footbtns');
    foot.append(this.footEl);
    body.append(this.bodyEl);
    this.el.append(win);
  }

  protected onOpen(data?: unknown): void {
    this.sellerId = String((data as { sellerId?: string } | undefined)?.sellerId ?? '');
    this.checkT = 0;
    this.listen('market:changed', () => this.queueRender());
    this.listen('player:gold', () => this.queueRender());
    this.listen('inventory:changed', () => this.queueRender());
    this.render();
  }

  protected tick(dt: number): void {
    this.checkT += dt;
    if (this.checkT < 0.5) return;
    this.checkT = 0;
    const m = getMarket();
    const s = m.stalls.get(this.sellerId);
    if (!s || s.hidden) {
      toast('Tezgâh kapandı.', 'info');
      this.requestClose();
      return;
    }
    const dist = m.distanceTo(s);
    if (!s.own && Number.isFinite(dist) && dist > MARKET.BUY_RANGE + 2.5) {
      toast('Tezgâhtan uzaklaştın.', 'info');
      this.requestClose();
    }
  }

  private queueRender(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      if (this.isOpen) this.render();
    });
  }

  private render(): void {
    const m = getMarket();
    const s = m.stalls.get(this.sellerId);
    this.bodyEl.textContent = '';
    this.footEl.textContent = '';
    if (!s) {
      this.titleEl.textContent = 'Tezgâh';
      this.bodyEl.append(h('div.pg-empty', null, 'Bu tezgâh artık yok.'));
      return;
    }
    this.titleEl.textContent = s.title;
    const cls = CLASS_META[s.look.c];
    this.bodyEl.append(
      h(
        'div.pm-seller',
        null,
        cls ? icon(cls.icon, 'pm-sellerico') : null,
        h('div.pm-sellertxt', null, h('b', null, s.look.n), h('small', null, `${cls?.name ?? ''} · Sv. ${s.look.l}`)),
        h('span.pm-sellernote', null, `${s.listings.length} eşya · her satıştan %${MARKET.SALE_TAX * 100} vergi satıcıdan kesilir`),
      ),
    );
    const list = h('div.pm-listings');
    const rows = [...s.listings].sort((a, b) => a.slot - b.slot);
    if (!rows.length) list.append(h('div.pg-empty', null, 'Tezgâh boş.'));
    for (const l of rows) list.append(this.card(s, l));
    this.bodyEl.append(list);
    const gold = G.character?.save.gold ?? 0;
    this.footEl.append(h('span.pm-foot-gold', null, 'Altının: ', goldChip(gold)), button('Pazar Arama', () => openPanel('marketSearch'), { variant: 'ghost' }));
    if (s.own) this.footEl.append(button('Tezgâhı Yönet', () => openPanel('marketOpen', { manage: true }), { variant: 'primary' }));
  }

  private card(s: Stall, l: ListingView): HTMLElement {
    const m = getMarket();
    const pend = m.pendingFor(s.sellerId, l.slot);
    const why = pend ? 'Bekleniyor...' : m.whyNotBuyable(s, l);
    const card = h('div.pm-card' + (why && !pend ? '.is-off' : ''));
    const hist = m.priceHistory(l.item);
    const unit = l.price / Math.max(1, l.qty);
    let tag: HTMLElement | null = null;
    if (hist && hist.n > 1) {
      const ratio = unit / Math.max(1, hist.avg);
      const label = ratio <= 0.8 ? 'Ucuz' : ratio >= 1.25 ? 'Pahalı' : 'Normal';
      tag = h('span.pm-tag.' + (ratio <= 0.8 ? 'is-cheap' : ratio >= 1.25 ? 'is-dear' : 'is-fair'), null, `${label} · ort. ${fmtInt(hist.avg * Math.max(1, l.qty))}`);
      tag.title = `${hist.n} gözlem: en düşük ${fmtInt(hist.min)}, en yüksek ${fmtInt(hist.max)} (birim fiyat)`;
    }
    const buy = button(pend ? 'Bekleniyor...' : 'Satın Al', () => void this.buy(s, l), { variant: 'primary', disabled: !!why });
    if (why) buy.title = why;
    card.append(
      marketTile(l.item, TILE),
      h('div.pm-card-txt', null, rarityName(l.item), h('small', null, `Eşya Seviyesi ${l.item.itemLevel}${l.qty > 1 ? ` · x${l.qty}` : ''}`), tag),
      h('div.pm-card-buy', null, h('span.pm-price-tag', null, fmtInt(l.price), icon(GOLD_ICON, 'pm-coin')), s.own ? h('small.pg-dim', null, `net ${fmtInt(l.price - saleTax(l.price))}`) : buy),
    );
    return card;
  }

  private async buy(s: Stall, l: ListingView): Promise<void> {
    const gold = G.character?.save.gold ?? 0;
    if (l.price >= 10_000 && l.price >= gold * 0.5) {
      const ok = await askConfirm(this.el, `${l.item.name ?? 'Eşya'} için ${fmtInt(l.price)} altın ödenecek. Onaylıyor musun?`, 'Satın Al', 'Vazgeç');
      if (!ok) return;
    }
    const r = getMarket().buy(s.sellerId, l.slot);
    if (!r.ok) {
      toast(r.reason ?? 'Satın alınamadı.', 'warning');
      sfx('ui_error');
    } else sfx('ui_click');
    this.queueRender();
  }
}
