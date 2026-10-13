import { G } from '../../../../game/G';
import type { ItemInstance } from '../../../../types/items';
import { RARITY_COLORS } from '../../../../types/common';
import { BOHCA_BIG_ID, BOHCA_DEFS, BOHCA_ID, MARKET, listingFee, saleTax } from '../../../../data/market';
import { sellValue } from '../../../../systems/ItemGen';
import { getMarket } from '../../../../systems/Market';
import { GamePanel, askConfirm, button, fmtInt, h, icon, openPanel, sfx, tabs, toast, windowFrame, type TabsHandle } from '../base';
import { clock, goldChip, marketTile, parsePrice, priceInput, rarityName, GOLD_ICON } from './shared';
import { pazarciMode } from './pazarci';

/**
 * `marketOpen` - "Tezgâhım" / Tezgâh Ustası (CM14 Pazar). Opened by the Tezgâh Ustası NPC, by using a Pazar Bohçası from the pouch
 * (data `{ licence }`) and by F on the player's own stall (data `{ manage: true }`).
 *   Tab "Tezgahim": set up a stall (title, items dragged or clicked from the bag into 12/24 slots, price per slot, fee preview) or,
 *                   while it is open, manage it (edit prices, take items off, sales log, Pazarci Modu, close).
 *   Tab "Bohca":    buy the stall licences for gold.
 * OWNER: panels-game module.
 */

interface Draft {
  uid: string;
  price: number;
}

const TILE = 46;

export class MarketOpenPanel extends GamePanel {
  private titleEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private footEl!: HTMLElement;
  private tabs!: TabsHandle;
  private tab: 'stall' | 'licence' = 'stall';
  private slots: (Draft | null)[] = new Array(MARKET.SLOTS_BIG).fill(null);
  private title = '';
  private licence: string = BOHCA_ID;
  private summaryEl: HTMLElement | null = null;
  private openBtn: HTMLButtonElement | null = null;
  private refreshQueued = false;

  constructor() {
    super('marketOpen', { backdropClose: false, modal: false });
  }

  protected build(): void {
    const { win, titleEl, body, foot } = windowFrame({
      title: 'Tezgâh', icon: '/assets/icons/item-bag.svg', cls: 'pm-win', size: 'L', onClose: () => this.requestClose(),
      hints: ['Sürükle: tezgâha koy', 'Tık: ekle / çıkar'],
    });
    this.titleEl = titleEl;
    this.tabs = tabs([{ id: 'stall', label: 'Tezgâhım' }, { id: 'licence', label: 'Bohça Al' }], (id) => {
      this.tab = id as 'stall' | 'licence';
      this.render();
    });
    this.bodyEl = h('div.pm-open');
    this.footEl = h('div.pm-footbtns');
    foot.append(this.footEl);
    body.append(this.tabs.el, this.bodyEl);
    this.el.append(win);
    titleEl.textContent = 'Tezgâh';
  }

  protected onOpen(data?: unknown): void {
    const d = (data ?? {}) as { licence?: string; manage?: boolean; tab?: string };
    const m = getMarket();
    m.init();
    if (!m.own) {
      this.licence = d.licence === BOHCA_BIG_ID ? BOHCA_BIG_ID : d.licence === BOHCA_ID ? BOHCA_ID : this.autoLicence();
      if (!this.title) this.title = m.titleSuggestion();
    }
    this.tab = d.tab === 'licence' ? 'licence' : 'stall';
    this.tabs.select(this.tab, true);
    this.listen('inventory:changed', () => this.queueRender());
    // announcements of other stalls ('stalls') never rebuild this window: it would steal the focus of the price fields
    this.listen('market:changed', (e) => {
      if (e.what === 'own' || e.what === 'sales') this.queueRender();
    });
    this.listen('materials:changed', () => this.queueRender());
    this.listen('player:gold', () => {
      this.paintSummary();
      if (this.tab === 'licence') this.queueRender();
    });
    this.render();
  }

  protected onClose(): void {
    // a half-built draft is kept for the next open; nothing is locked until the stall opens
  }

  private queueRender(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    const run = (): void => {
      if (!this.isOpen) {
        this.refreshQueued = false;
        return;
      }
      // typing in a field: wait, a rebuild would drop the caret
      const a = document.activeElement;
      if (a instanceof HTMLInputElement && this.bodyEl.contains(a)) {
        window.setTimeout(run, 400);
        return;
      }
      this.refreshQueued = false;
      this.render();
    };
    requestAnimationFrame(run);
  }

  private autoLicence(): string {
    const c = G.character;
    if (c && c.material(BOHCA_ID) < 1 && c.material(BOHCA_BIG_ID) > 0) return BOHCA_BIG_ID;
    return BOHCA_ID;
  }

  private get slotCount(): number {
    return this.licence === BOHCA_BIG_ID ? MARKET.SLOTS_BIG : MARKET.SLOTS;
  }

  /* ---------------------------------------------------------------------------- render */

  private render(): void {
    const m = getMarket();
    this.bodyEl.textContent = '';
    this.footEl.textContent = '';
    this.summaryEl = null;
    this.openBtn = null;
    this.titleEl.textContent = m.own ? 'Tezgâhım (Açık)' : 'Tezgâh';
    if (this.tab === 'licence') this.renderLicences();
    else if (m.own) this.renderManage();
    else this.renderSetup();
  }

  /** Items of the draft are valid only while they are still listable bag items. */
  private pruneDraft(): void {
    const m = getMarket();
    const c = G.character;
    for (let i = 0; i < this.slots.length; i++) {
      const d = this.slots[i];
      if (!d) continue;
      const f = c?.findItem(d.uid);
      if (!f || f.loc.where !== 'bag' || m.whyNotListable(f.item)) this.slots[i] = null;
    }
  }

  private draftUids(): Set<string> {
    return new Set(this.slots.filter((s): s is Draft => !!s).map((s) => s.uid));
  }

  private suggest(item: ItemInstance): number {
    const hist = getMarket().priceHistory(item);
    if (hist && hist.n > 1) return Math.max(1, Math.round(hist.avg * (item.quantity ?? 1)));
    return Math.max(10, Math.round(sellValue(item) * 4));
  }

  /* ----------------------------------------------------------------- setup (stall closed) */

  private renderSetup(): void {
    const m = getMarket();
    const c = G.character;
    this.pruneDraft();

    if (!m.origin) {
      this.bodyEl.append(h('div.pg-empty', null, 'Burada bir pazar yok. Kuzgunkale\'deki Pazar Meydanı\'na ya da bir köy pazarına git, sonra tezgâhını kur.'));
    }

    // ---- left: the bag
    const bag = h('div.pm-bag');
    bag.append(h('div.pg-h', null, 'Çanta'), h('div.pm-hint', null, 'Eşyayı tezgâhtaki bir göze sürükle ya da tıkla.'));
    const grid = h('div.pm-bag-grid');
    const used = this.draftUids();
    c?.save.bag.forEach((it) => {
      if (!it) return;
      const why = m.whyNotListable(it);
      const inDraft = used.has(it.uid);
      const t = marketTile(it, TILE, { dim: !!why || inDraft });
      t.classList.add('pm-bagtile');
      if (why) t.title = why;
      else if (!inDraft) {
        t.draggable = true;
        t.addEventListener('dragstart', (e) => {
          e.dataTransfer?.setData('text/plain', it.uid);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });
        t.addEventListener('click', () => this.addToFirstFree(it));
      }
      grid.append(t);
    });
    if (!grid.childElementCount) grid.append(h('div.pg-empty', null, 'Çantan boş.'));
    bag.append(grid);

    // ---- right: the stall
    const stall = h('div.pm-stall');
    const titleInput = h('input.pm-title', { type: 'text', maxlength: MARKET.TITLE_MAX, placeholder: 'Tezgâh adı (en çok 32 harf)', autocomplete: 'off' }) as HTMLInputElement;
    titleInput.value = this.title;
    titleInput.addEventListener('input', () => {
      this.title = titleInput.value;
      this.paintSummary();
    });
    titleInput.addEventListener('keydown', (e) => e.stopPropagation());
    titleInput.addEventListener('keyup', (e) => e.stopPropagation());
    const lic = h('div.pm-lic');
    for (const b of BOHCA_DEFS) {
      const have = c?.material(b.id) ?? 0;
      const btn = button(`${b.name}: ${b.slots} göz (${have})`, () => {
        this.licence = b.id;
        this.render();
      }, { variant: this.licence === b.id ? 'primary' : 'ghost' });
      lic.append(btn);
    }
    stall.append(h('div.pg-h', null, 'Tezgâh'), h('div.pm-row', null, titleInput), lic);

    const slotGrid = h('div.pm-slots' + (this.slotCount > MARKET.SLOTS ? '.is-big' : ''));
    for (let i = 0; i < this.slotCount; i++) slotGrid.append(this.slotEl(i));
    stall.append(slotGrid);

    this.summaryEl = h('div.pm-summary');
    this.bodyEl.append(h('div.pm-cols', null, bag, stall));
    this.bodyEl.append(this.summaryEl);
    this.openBtn = button('Tezgâhı Aç', () => void this.doOpen(), { variant: 'primary', icon: GOLD_ICON });
    this.footEl.append(
      button('Pazar Arama', () => openPanel('marketSearch'), { variant: 'ghost' }),
      button('Temizle', () => {
        this.slots.fill(null);
        this.render();
      }, { variant: 'ghost' }),
      this.openBtn,
    );
    this.paintSummary();
  }

  private slotEl(i: number): HTMLElement {
    const d = this.slots[i];
    const cell = h('div.pm-slot' + (d ? '.has' : ''));
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      cell.classList.add('is-over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('is-over'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('is-over');
      const uid = e.dataTransfer?.getData('text/plain');
      const it = uid ? G.character?.findItem(uid)?.item : null;
      if (it) this.put(i, it);
    });
    if (!d) {
      cell.append(h('div.pm-slot-empty', null, '+'));
      return cell;
    }
    const f = G.character?.findItem(d.uid);
    if (!f) return cell;
    const tile = marketTile(f.item, TILE);
    tile.title = 'Tezgâhtan çıkar';
    tile.addEventListener('click', () => {
      this.slots[i] = null;
      this.render();
    });
    const price = priceInput(d.price, (v) => {
      d.price = v;
      this.paintSummary();
    });
    cell.append(tile, rarityName(f.item), price);
    return cell;
  }

  private addToFirstFree(it: ItemInstance): void {
    const i = this.slots.slice(0, this.slotCount).findIndex((s) => !s);
    if (i < 0) {
      toast(`Tezgâh dolu (${this.slotCount} göz).`, 'warning');
      sfx('ui_error');
      return;
    }
    this.put(i, it);
  }

  private put(i: number, it: ItemInstance): void {
    if (i >= this.slotCount) return;
    const why = getMarket().whyNotListable(it);
    if (why) {
      toast(why, 'warning');
      sfx('ui_error');
      return;
    }
    // moving an item that is already in another slot just moves it
    for (let k = 0; k < this.slots.length; k++) if (this.slots[k]?.uid === it.uid) this.slots[k] = null;
    this.slots[i] = { uid: it.uid, price: this.slots[i]?.price || this.suggest(it) };
    sfx('ui_click', 0.6);
    this.render();
  }

  private draftList(): { uid: string; price: number }[] {
    return this.slots.slice(0, this.slotCount).filter((s): s is Draft => !!s).map((s) => ({ uid: s.uid, price: s.price }));
  }

  /** Totals, fee, tax example, licence check; enables / disables the open button. */
  private paintSummary(): void {
    const el = this.summaryEl;
    if (!el) return;
    const m = getMarket();
    const c = G.character;
    const list = this.draftList();
    const total = list.reduce((a, s) => a + (s.price > 0 ? s.price : 0), 0);
    const fee = listingFee(total);
    const gold = c?.save.gold ?? 0;
    const have = c?.material(this.licence) ?? 0;
    let why = '';
    if (!m.origin) why = 'Pazar alanında değilsin.';
    else if (!list.length) why = 'Tezgâha en az bir eşya koy.';
    else if (list.some((s) => !(s.price >= MARKET.MIN_PRICE && s.price <= MARKET.MAX_PRICE))) why = 'Her eşyaya geçerli bir fiyat yaz.';
    else if (!this.title.trim()) why = 'Tezgâha bir ad ver.';
    else if (have < 1) why = `${this.licence === BOHCA_BIG_ID ? 'Büyük Bohça' : 'Pazar Bohçası'} gerekir (Bohça Al sekmesi).`;
    else if (gold < fee) why = `Harç için ${fmtInt(fee)} altın gerekir.`;
    el.textContent = '';
    const net = total - list.reduce((a, s) => a + saleTax(Math.max(0, s.price)), 0);
    el.append(
      h('span', null, 'Toplam fiyat: ', goldChip(total)),
      h('span', null, `Harç (%${MARKET.LISTING_FEE * 100}): `, goldChip(fee, gold < fee ? 'is-bad' : '')),
      h('span', null, `Satış vergisi %${MARKET.SALE_TAX * 100} → hepsi satılırsa eline geçen: `, goldChip(Math.max(0, net))),
      h('span.pm-why' + (why ? '.is-bad' : '.is-ok'), null, why || 'Hazır.'),
    );
    if (this.openBtn) {
      this.openBtn.disabled = !!why;
      this.openBtn.title = why;
    }
  }

  private async doOpen(): Promise<void> {
    const m = getMarket();
    const list = this.draftList();
    const total = list.reduce((a, s) => a + s.price, 0);
    if (total >= 100_000 || list.length >= 18) {
      const okk = await askConfirm(this.el, `${list.length} eşya, toplam ${fmtInt(total)} altın fiyatla tezgâh açılsın mı? Harç: ${fmtInt(listingFee(total))} altın.`, 'Aç', 'Vazgeç');
      if (!okk) return;
    }
    const r = m.openShop({ title: this.title, listings: list, licence: this.licence });
    if (!r.ok) {
      toast(r.reason ?? 'Tezgâh açılamadı.', 'warning');
      sfx('ui_error');
      return;
    }
    sfx('ui_open');
    this.slots.fill(null);
    this.requestClose();
  }

  /* ----------------------------------------------------------------- manage (stall open) */

  private renderManage(): void {
    const m = getMarket();
    const o = m.own;
    if (!o) return;
    const c = G.character;
    const head = h(
      'div.pm-manage-head',
      null,
      h('div.pm-mh-title', null, `"${o.title}"`),
      h('div.pm-mh-sub', null, `${m.connected ? 'Pazarda yayında' : 'Çevrimdışı: yalnızca sen görüyorsun'} · açıldı ${clock(o.openedAt)} · ${o.listings.length}/${o.big ? MARKET.SLOTS_BIG : MARKET.SLOTS} göz dolu`),
      h('div.pm-mh-stats', null, h('span', null, 'Satılan: ', h('b', null, String(o.sales.length))), h('span', null, 'Kazanç: ', goldChip(o.netGold)), h('span', null, 'Vergi: ', goldChip(o.grossGold - o.netGold))),
    );
    const slotGrid = h('div.pm-slots.pm-manage-slots' + (o.big ? '.is-big' : ''));
    for (const l of o.listings) {
      const f = c?.findItem(l.uid);
      if (!f) continue;
      const cell = h('div.pm-slot.has');
      const price = priceInput(l.price, () => undefined);
      price.addEventListener('change', () => {
        const r = m.setPrice(l.slot, parsePrice(price.value));
        if (!r.ok) {
          toast(r.reason ?? 'Fiyat değişmedi.', 'warning');
          price.value = fmtInt(l.price);
        }
      });
      const rm = button('Çıkar', () => {
        const r = m.delist(l.slot);
        if (!r.ok) toast(r.reason ?? 'Olmadı.', 'warning');
      }, { variant: 'ghost' });
      cell.append(marketTile(f.item, TILE), rarityName(f.item), price, rm);
      slotGrid.append(cell);
    }
    const log = h('div.pm-log');
    log.append(h('div.pg-h', null, 'Satış Günlüğü'));
    const rows = (c?.save.market?.sales ?? []).slice(-14).reverse();
    if (!rows.length) log.append(h('div.pm-hint', null, 'Henüz satış yok.'));
    for (const s of rows) {
      const n = h('span.n', null, s.name);
      n.style.color = RARITY_COLORS[s.rarity as keyof typeof RARITY_COLORS] ?? '#fff';
      log.append(h('div.pm-logrow', null, h('span.t', null, clock(s.t)), n, h('span.g', null, `+${fmtInt(s.net)}`, icon(GOLD_ICON, 'pm-coin')), h('span.b', null, s.buyer ? `← ${s.buyer}` : '')));
    }
    this.bodyEl.append(h('div.pm-cols', null, h('div.pm-stall', null, head, h('div.pg-h', null, 'Tezgâhtakiler'), slotGrid), log));
    this.footEl.append(
      button('Pazar Arama', () => openPanel('marketSearch'), { variant: 'ghost' }),
      button('Pazarcı Modu', () => {
        this.requestClose();
        pazarciMode().enter();
      }, { variant: 'normal', title: 'Görüntüyü yavaşlat, sesi kapat; satışları izle' }),
      button('Tezgâhı Kapat', () => {
        m.closeShop();
      }, { variant: 'danger' }),
    );
  }

  /* ----------------------------------------------------------------- licences */

  private renderLicences(): void {
    const c = G.character;
    const m = getMarket();
    const box = h('div.pm-licences');
    box.append(
      h('p.pm-hint', null, 'Tezgâh açarken bir bohça harcanır. Pazar Bohçası 12, Büyük Bohça 24 göz verir. Açılışta toplam fiyatın %1\'i harç alınır; her satıştan %3 vergi kesilir.'),
    );
    for (const b of BOHCA_DEFS) {
      const have = c?.material(b.id) ?? 0;
      const afford = (c?.save.gold ?? 0) >= b.price;
      box.append(
        h(
          'div.pm-licrow',
          null,
          icon('/assets/icons/item-bag.svg', 'pm-licico'),
          h('div.pm-lictxt', null, h('b', null, b.name), h('small', null, `${b.slots} göz · elinde ${have}`)),
          goldChip(b.price, afford ? '' : 'is-bad'),
          button('Satın Al', () => {
            const r = m.buyLicence(b.id);
            if (!r.ok) {
              toast(r.reason ?? 'Olmadı.', 'warning');
              sfx('ui_error');
            } else sfx('ui_click');
          }, { variant: 'primary', disabled: !afford }),
        ),
      );
    }
    this.bodyEl.append(box);
    this.footEl.append(h('span.pm-foot-gold', null, 'Altının: ', goldChip(c?.save.gold ?? 0)));
  }
}
