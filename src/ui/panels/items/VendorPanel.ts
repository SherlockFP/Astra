import { G } from '../../../game/G';
import type { EventScope } from '../../../core/EventBus';
import { RARITY_COLORS, RARITY_NAMES_TR } from '../../../types/common';
import type { VendorEntry } from '../../../systems/Vendor';
import type { ItemCategory, ItemInstance } from '../../../types/items';
import { ItemPanel, makeTabs, openCompanionBag, releaseCompanionBag, type TabsHandle } from './PanelBase';
import { pvpApi, vendorApi } from './backend';
import { sellItem } from './actions';
import { CATEGORY_ICON, ItemSlot, bindItemTip, bindTip, describe, drag, esc, fmt, h, iconUrl, materialInfo, sfx, toast } from './common';

/** merchant / alchemist: classic shops. gamble: Gizemli Tüccar (blind boxes). seal_vendor: Mühürdar (Av Mührü shop). */
type Kind = 'merchant' | 'alchemist' | 'bakkal' | 'gamble' | 'seal_vendor' | 'pvp_honor' | 'pvp_conquest' | 'stable';

const KIND_INFO: Record<Kind, { title: string; icon: string; line: string }> = {
  stable: { title: 'Ahır Ustası', icon: 'item-trinket.svg', line: 'At sever misin? Binicilik dersi al, dağ keçisini de getirebilirim. Binek, F9 ile çağrılır.' },
  merchant: { title: 'Tüccar', icon: 'ui-shop.svg', line: 'Hoş geldin, maceracı! Kaliteli mallarım var; satacaklarını da buraya bırakabilirsin.' },
  alchemist: { title: 'Simyacı', icon: 'item-potion-flask.svg', line: 'İksirler, tozlar, merhemler... Zindanlara hazırlıksız girme!' },
  bakkal: { title: 'Bakkal', icon: 'ui-shop.svg', line: 'Kızarmış ekmek, kaynak suyu, bir de güveç... Yolun için yeterli.' },
  gamble: { title: 'Gizemli Tüccar', icon: 'item-chest-locked.svg', line: 'Kutunun içinde ne var? Öde ve gör! Şansın varsa Efsanevi bile çıkar...' },
  seal_vendor: { title: 'Mühürdar', icon: 'item-trinket.svg', line: 'Mührünü getir, ödülünü al. Günlük görevlerden kazandığın Av Mührü burada geçer.' },
  pvp_honor: { title: 'Savaş Ustası', icon: 'ui-shop.svg', line: "Kızıl Sınır'da kanını döktün mü? Onurun burada Er tier zırha dönüşür." },
  pvp_conquest: { title: 'Fetih Muhafızı', icon: 'item-trinket.svg', line: 'Fetih kazandın, şimdi zırhını yükselt. Şampiyon tier haftalık sınırla satılır.' },
};

/**
 * Vendor kind from the open data: an explicit `kind` wins; otherwise an NPC id hint (`npcId` / `npc` / `id`) selects the special vendors,
 * so a Mühürdar / Gizemli Tüccar opened without a kind never degrades into the plain merchant shop.
 */
const isPvpKind = (k: Kind): boolean => k === 'pvp_honor' || k === 'pvp_conquest';

function parseKind(d: { kind?: unknown; npcId?: unknown; npc?: unknown; id?: unknown } | undefined): Kind {
  const v = d?.kind;
  if (v === 'alchemist' || v === 'bakkal' || v === 'gamble' || v === 'seal_vendor' || v === 'merchant' || v === 'pvp_honor' || v === 'pvp_conquest' || v === 'stable') return v;
  const hint = [d?.npcId, d?.npc, d?.id].find((x) => typeof x === 'string') as string | undefined;
  if (hint) {
    if (/gizemli|kumar|gamble/i.test(hint)) return 'gamble';
    if (/muhurdar|mühürdar|seal/i.test(hint)) return 'seal_vendor';
    if (/simyaci|simyacı|alchemist/i.test(hint)) return 'alchemist';
    if (/bakkal/i.test(hint)) return 'bakkal';
    if (/savas|savaş/i.test(hint)) return 'pvp_honor';
    if (/fetih/i.test(hint)) return 'pvp_conquest';
  }
  return 'merchant';
}

/** Rarity weights shown to the player on the gamble screen (GDD 6.3). */
const GAMBLE_ODDS: { r: 'uncommon' | 'rare' | 'epic' | 'legendary'; p: string }[] = [
  { r: 'uncommon', p: '%70' },
  { r: 'rare', p: '%25' },
  { r: 'epic', p: '%4,5' },
  { r: 'legendary', p: '%0,5' },
];

const QTYS = [1, 5, 10, 25];

/** Satıcı (Tüccar / Simyacı / Gizemli Tüccar / Mühürdar): buy list, sell drop area, buyback, blind boxes, seal shop. */
export class VendorPanel extends ItemPanel {
  private kind: Kind = 'merchant';
  private tabs!: TabsHandle;
  private tab: 'buy' | 'back' = 'buy';
  private list!: HTMLDivElement;
  private entries: VendorEntry[] = [];
  private qty = 1;
  private qtyMax = false;
  private qtyRow!: HTMLDivElement;
  private qtyBtns: HTMLButtonElement[] = [];
  private goldEl!: HTMLSpanElement;
  private sellZone!: HTMLDivElement;
  private flavor!: HTMLDivElement;
  private flavorIco!: HTMLElement;
  private reveal!: HTMLDivElement;
  private junkBtn!: HTMLButtonElement;
  private sealWrap!: HTMLDivElement;
  private sealEl!: HTMLSpanElement;
  /** PvP vendors: weekly / daily cap line above the list (GDD_PVP_FINDER §4.4). */
  private pvpLine!: HTMLDivElement;
  /** Muhurdar: the open "Muhur Sandigi" category picker. */
  private chestPick = false;
  /** Gizemli Tuccar: the last results (newest first). */
  private history: ItemInstance[] = [];
  private revealTimer = 0;

  constructor() {
    super('vendor', {
      title: 'Tüccar',
      icon: 'ui-shop.svg',
      width: 500,
      height: 540,
      dock: 'left',
    });
  }

  protected build(body: HTMLElement): void {
    const top = h('div', 'pi-npc');
    this.flavorIco = h('i', 'pi-npc-ico');
    this.flavor = h('div', 'pi-npc-line');
    top.append(this.flavorIco, this.flavor);

    this.tabs = makeTabs(
      [
        { id: 'buy', label: 'Satın Al', icon: 'item-coins.svg' },
        { id: 'back', label: 'Geri Al', icon: 'ui-unlock.svg' },
      ],
      (id) => {
        this.tab = id as 'buy' | 'back';
        this.refresh();
      },
    );

    this.reveal = h('div', 'pi-greveal');
    this.reveal.style.display = 'none';
    this.list = h('div', 'pi-vlist');

    this.qtyRow = h('div', 'pi-qtyrow');
    this.qtyRow.append(h('span', 'pi-qtylabel', 'Adet:'));
    for (const q of QTYS) {
      const b = h('button', 'pi-chip', String(q));
      b.addEventListener('click', () => {
        this.qty = q;
        this.qtyMax = false;
        sfx('ui_tab');
        this.paintQty();
        this.refreshRows();
      });
      this.qtyBtns.push(b);
      this.qtyRow.append(b);
    }
    const mx = h('button', 'pi-chip', 'Maks');
    mx.addEventListener('click', () => {
      this.qtyMax = true;
      sfx('ui_tab');
      this.paintQty();
      this.refreshRows();
    });
    this.qtyBtns.push(mx);
    this.qtyRow.append(mx);
    bindTip(this.qtyRow, () => '<div class="pi-tip-name">Adet</div><div class="pi-tip-dim">İksir, parşömen ve malzemeleri bu adetle satın alırsın.</div>');

    this.sellZone = h('div', 'pi-sellzone');
    const sellIcon = h('i', 'pi-sell-ico');
    sellIcon.style.setProperty('--ico', 'url("/assets/icons/item-coins-pile.svg")');
    this.sellZone.append(sellIcon, h('span', '', 'Satmak için eşyayı buraya bırak'), h('em', '', 'Shift + Sağ tık: çantadan hızlı sat'));
    drag.zone(this.sellZone, {
      accepts: (p) => p.kind === 'item' && p.loc.where !== 'equipment' && !p.item.locked,
      drop: (p) => (p.kind === 'item' ? sellItem(p.item) : false),
    });

    const foot = h('div', 'pi-vfoot');
    const junk = h('button', 'pi-btn sm', 'Değersizleri Sat');
    this.junkBtn = junk;
    junk.addEventListener('click', () => this.sellJunk());
    bindTip(junk, () => '<div class="pi-tip-name">Değersizleri Sat</div><div class="pi-tip-dim">Çantandaki gri (değersiz) ve kilitsiz tüm eşyaları satar.</div>');
    const gold = h('div', 'pi-gold');
    gold.append(h('i', 'pi-coin'), (this.goldEl = h('span', 'pi-gold-n', '0')));
    // Av Muhru counter (Muhurdar only)
    this.sealWrap = h('div', 'pi-gold pi-seals');
    const sealIco = h('i', 'pi-seal-ico');
    sealIco.style.setProperty('--ico', `url("${materialInfo('av_muhru').icon}")`);
    this.sealWrap.append(sealIco, (this.sealEl = h('span', 'pi-gold-n', '0')));
    bindTip(this.sealWrap, () => {
      const m = materialInfo(this.kind === 'pvp_honor' ? 'onur_puani' : this.kind === 'pvp_conquest' ? 'fetih_puani' : 'av_muhru');
      return `<div class="pi-tip-name" style="color:${RARITY_COLORS[m.rarity]}">${esc(m.name)}</div><div class="pi-tip-line">${esc(m.desc)}</div>`;
    });
    const goldBox = h('div', 'pi-vgold');
    goldBox.append(this.sealWrap, gold);
    foot.append(junk, goldBox);

    this.pvpLine = h('div', 'pi-pvpline');
    this.pvpLine.style.display = 'none';
    body.append(top, this.tabs.el, this.reveal, this.pvpLine, this.list, this.qtyRow, this.sellZone, foot);
  }

  protected subscribe(s: EventScope): void {
    s.on('player:gold', () => {
      this.updateGold();
      if (this.special()) this.safeRefresh();
      else this.refreshRows();
    })
      .on('inventory:changed', () => {
        if (this.tab === 'back' || this.special()) this.safeRefresh();
        this.refreshRows();
      })
      .on('player:levelup', this.safeRefresh)
      .on('materials:changed', () => {
        this.updateGold();
        if (this.special()) this.safeRefresh();
        else this.refreshRows();
      });
  }

  protected onOpen(data?: unknown): void {
    const kind = parseKind(data as { kind?: unknown; npcId?: unknown; npc?: unknown; id?: unknown } | undefined);
    if (kind !== this.kind) {
      this.chestPick = false;
      this.hideReveal();
    }
    this.kind = kind;
    const info = KIND_INFO[kind];
    this.setTitle(info.title);
    this.flavor.textContent = info.line;
    this.flavorIco.style.setProperty('--ico', `url("/assets/icons/${info.icon}")`);
    this.entries = [];
    const vk = kind === 'merchant' || kind === 'alchemist' || kind === 'bakkal' || kind === 'pvp_honor' || kind === 'pvp_conquest' ? kind : undefined;
    if (vk) {
      try {
        this.entries = vendorApi.entries(vk);
      } catch (e) {
        console.warn('[vendor] entries failed', e);
        this.entries = [];
      }
    }
    this.tab = 'buy';
    this.tabs.set('buy', true);
    this.paintQty();
    // layout per kind: shops have tabs + a sell zone; the gamble and seal screens are single-purpose
    const special = this.special();
    const shop = kind === 'merchant' || kind === 'alchemist' || kind === 'bakkal';
    this.tabs.el.style.display = shop ? '' : 'none';
    this.sellZone.style.display = shop ? '' : 'none';
    this.junkBtn.style.display = shop ? '' : 'none';
    this.sealWrap.style.display = kind === 'seal_vendor' || isPvpKind(kind) ? '' : 'none';
    this.pvpLine.style.display = isPvpKind(kind) ? '' : 'none';
    this.list.classList.toggle('special', special);
    openCompanionBag(this.id);
  }

  protected onClose(): void {
    window.clearTimeout(this.revealTimer);
    releaseCompanionBag(this.id);
  }

  /** Does this vendor buy items from the bag? (shop kinds only) */
  canSell(): boolean {
    return this.kind === 'merchant' || this.kind === 'alchemist' || this.kind === 'bakkal';
  }

  /** True for the gamble / seal screens (no classic buy list). */
  private special(): boolean {
    return this.kind === 'gamble' || this.kind === 'seal_vendor';
  }

  private paintQty(): void {
    this.qtyBtns.forEach((b, i) => b.classList.toggle('on', this.qtyMax ? i === this.qtyBtns.length - 1 : QTYS[i] === this.qty));
  }

  private updateGold(): void {
    const c = G.character;
    this.goldEl.textContent = c ? fmt(c.save.gold) : '-';
    if (this.kind === 'seal_vendor') this.sealEl.textContent = c ? fmt(c.material('av_muhru')) : '-';
    if (isPvpKind(this.kind)) this.paintPvpHeader();
  }

  private unitQty(e: VendorEntry): number {
    if (e.item) return 1;
    const c = G.character;
    const stockCap = e.stock ?? 99;
    if (this.qtyMax) {
      const afford = e.price > 0 && c ? Math.floor(c.save.gold / e.price) : 99;
      return Math.max(1, Math.min(99, stockCap, afford));
    }
    return Math.max(1, Math.min(this.qty, stockCap));
  }

  protected refresh(): void {
    this.updateGold();
    if (this.kind === 'seal_vendor') {
      this.qtyRow.style.display = 'none';
      this.renderSeal();
      return;
    }
    if (this.kind === 'gamble') {
      this.qtyRow.style.display = 'none';
      this.renderGamble();
      return;
    }
    this.qtyRow.style.display = this.tab === 'buy' && this.entries.some((e) => e.materialId) ? '' : 'none';
    this.list.replaceChildren();
    const c = G.character;
    if (this.tab === 'buy') {
      if (!this.entries.length) this.list.append(h('div', 'pi-empty', 'Şu an satacak bir şeyim yok.'));
      this.entries.forEach((e, i) => this.list.append(this.buyRow(e, i)));
      if (this.kind === 'pvp_conquest') this.list.append(this.upgradeSection());
    } else {
      let back: { item: ItemInstance; price: number }[] = [];
      try {
        back = vendorApi.buybackEntries();
      } catch {
        back = [];
      }
      this.tabs.badge('back', back.length ? String(back.length) : '');
      if (!back.length) {
        this.list.append(h('div', 'pi-empty', 'Geri alınacak bir şey yok. Sattığın son eşyalar burada görünür.'));
        return;
      }
      back.forEach((b, i) => this.list.append(this.backRow(b.item, b.price, i)));
    }
    void c;
  }

  /** PvP header (GDD_PVP_FINDER §4.4): the vendor's currency in the header, the cap line above the list. */
  private paintPvpHeader(): void {
    const c = G.character;
    const honor = this.kind === 'pvp_honor';
    const cur = honor ? 'onur_puani' : 'fetih_puani';
    const ico = this.sealWrap.querySelector<HTMLElement>('.pi-seal-ico');
    ico?.style.setProperty('--ico', `url("${materialInfo(cur).icon}")`);
    this.sealEl.textContent = c ? fmt(c.material(cur)) : '-';
    if (!c) {
      this.pvpLine.textContent = '';
      return;
    }
    if (honor) {
      const t = pvpApi.onurToday();
      this.pvpLine.textContent = `Onur: ${fmt(c.material(cur))} (bugün ${fmt(t.earned)}/${fmt(t.cap)})${t.left <= 0 ? ' · Günlük sınır doldu.' : ''}`;
    } else {
      const t = pvpApi.fetihThisWeek();
      this.pvpLine.textContent = `Fetih: ${fmt(c.material(cur))} (bu hafta ${fmt(t.earned)}/${fmt(t.cap)})${t.left <= 0 ? ' · Haftalık sınır doldu.' : ''}`;
    }
  }

  /** Fetih Muhafızı: the owned PvP pieces with their next ilvl step and mühür cost (GDD_PVP_FINDER §4.5). */
  private upgradeSection(): HTMLElement {
    const wrap = h('div', 'pi-pvpup');
    wrap.append(h('div', 'pi-pvpup-title', 'Yükselt'));
    const items = pvpApi.owned();
    if (!items.length) {
      wrap.append(h('div', 'pi-empty', 'Üzerinde ya da çantanda PvP eşyası yok.'));
      return wrap;
    }
    const muhur = G.character?.material('fetih_muhru') ?? 0;
    for (const it of items) {
      const step = pvpApi.nextStep(it);
      const row = h('div', 'pi-vrow');
      const text = h('div', 'pi-vtext');
      const d = describe(it);
      const name = h('div', 'pi-vname', d.name);
      name.style.color = RARITY_COLORS[it.rarity];
      const line = step
        ? `${pvpApi.tierLabel(it.itemLevel)} → ${pvpApi.tierLabel(step.to)} · ${step.cost} Fetih mührü (sende ${muhur})`
        : `${pvpApi.tierLabel(it.itemLevel)} · en yüksek seviye`;
      text.append(name, h('div', 'pi-vsub', line));
      const btn = h('button', 'pi-btn sm', step ? 'Yükselt' : 'Son');
      (btn as HTMLButtonElement).disabled = !step || muhur < step.cost;
      btn.addEventListener('click', () => {
        const r = pvpApi.upgrade(it);
        if (r.ok) {
          sfx('buy');
          toast(`${d.name}: ${pvpApi.tierLabel(r.to ?? it.itemLevel)} seviyesine yükseltildi`, 'success');
        } else {
          toast(r.reason ?? 'Yükseltilemedi', 'warning');
          sfx('ui_error');
        }
        this.refresh();
      });
      const slot = new ItemSlot('md');
      slot.set(it);
      row.append(slot.el, text, btn);
      wrap.append(row);
    }
    return wrap;
  }

  /** Money the vendor takes for an entry: gold, or the entry's currency (PvP stock). */
  private have(e: VendorEntry): number {
    const c = G.character;
    if (!c) return 0;
    return e.currency ? c.material(e.currency) : c.save.gold;
  }

  /** Shop list kind for vendorApi.entries (after a purchase the list is rebuilt). */
  private entriesKind(): 'merchant' | 'alchemist' | 'bakkal' | 'pvp_honor' | 'pvp_conquest' {
    return this.kind === 'alchemist' || this.kind === 'bakkal' || this.kind === 'pvp_honor' || this.kind === 'pvp_conquest' ? this.kind : 'merchant';
  }

  /** Recolor prices / stock without rebuilding the rows. */
  private refreshRows = (): void => {
    if (!this.isOpen || this.tab !== 'buy' || this.special()) return;
    const c = G.character;
    const rows = this.list.querySelectorAll<HTMLElement>('.pi-vrow');
    rows.forEach((row, i) => {
      const e = this.entries[i];
      if (!e) return;
      const q = this.unitQty(e);
      const total = e.price * q;
      const price = row.querySelector('.pi-vprice-n');
      if (price) price.textContent = fmt(total);
      row.classList.toggle('poor', !!c && this.have(e) < total);
      const sub = row.querySelector('.pi-vq');
      if (sub) sub.textContent = !e.item && q > 1 ? `×${q}` : '';
      const out = e.stock !== undefined && e.stock <= 0;
      row.classList.toggle('soldout', out);
      const st = row.querySelector('.pi-vstock');
      if (st) st.textContent = e.stock !== undefined ? (out ? (e.weeklyLimit ? 'Haftalık sınır doldu.' : 'Tükendi') : `Stok: ${e.stock}`) : e.currency ? (materialInfo(e.currency).name) : '';
    });
  };

  /* ------------------------------------------------------------ reveal strip (gamble / chest) */

  private hideReveal(): void {
    window.clearTimeout(this.revealTimer);
    if (this.reveal) {
      this.reveal.style.display = 'none';
      this.reveal.replaceChildren();
    }
  }

  /** Big "you got..." card above the list (blind boxes, Muhur Sandigi). */
  private showReveal(item: ItemInstance, title: string): void {
    const el = this.reveal;
    el.replaceChildren();
    const d = describe(item);
    const col = RARITY_COLORS[item.rarity];
    el.style.setProperty('--rc', col);
    const slot = new ItemSlot('lg');
    slot.set(item);
    bindItemTip(slot.el, () => item);
    const txt = h('div', 'pi-greveal-txt');
    const nm = h('div', 'pi-greveal-name', d.name);
    nm.style.color = col;
    txt.append(h('div', 'pi-greveal-title', title), nm, h('div', 'pi-greveal-sub', `${RARITY_NAMES_TR[item.rarity]} · ${d.slotLabel} · Eşya Seviyesi ${item.itemLevel}`));
    el.append(slot.el, txt);
    el.style.display = '';
    el.className = `pi-greveal rar-${item.rarity}`;
    void el.offsetWidth;
    el.classList.add('pop');
    window.clearTimeout(this.revealTimer);
    this.revealTimer = window.setTimeout(() => this.hideReveal(), 14000);
  }

  /* ------------------------------------------------------------ Muhurdar (Av Muhru shop) */

  private renderSeal(): void {
    const c = G.character;
    this.list.replaceChildren();
    let offers: ReturnType<typeof vendorApi.sealOffers> = [];
    try {
      offers = vendorApi.sealOffers();
    } catch (e) {
      console.warn('[vendor] sealOffers failed', e);
    }
    if (!c || !offers.length) {
      this.list.append(h('div', 'pi-empty', 'Mühürdar şu an boş elle.'));
      return;
    }
    const seals = c.material('av_muhru');
    this.sealEl.textContent = fmt(seals);
    for (const o of offers) {
      const lvBad = !!o.requiredLevel && c.level < o.requiredLevel;
      const poor = seals < o.cost;
      const row = h('div', 'pi-vrow' + (poor || lvBad ? ' poor' : ''));
      const ico = h('div', `pi-slot sz-md rar-${o.rarity}`);
      ico.style.setProperty('--rc', RARITY_COLORS[o.rarity]);
      const i = h('div', 'pi-ico');
      i.style.setProperty('--ico', `url("${iconUrl(o.icon)}")`);
      ico.append(i);
      const name = h('div', 'pi-vname', o.name);
      name.style.color = RARITY_COLORS[o.rarity];
      const sub = h('div', 'pi-vsub', o.desc);
      if (o.requiredLevel && o.requiredLevel > 1) sub.append(h('span', lvBad ? 'pi-lvbad' : 'pi-lvok', ` Sv ${o.requiredLevel}`));
      const text = h('div', 'pi-vtext');
      text.append(name, sub);
      const price = h('div', 'pi-vprice');
      const sealIco = h('i', 'pi-seal-ico');
      sealIco.style.setProperty('--ico', `url("${materialInfo('av_muhru').icon}")`);
      price.append(h('div', 'pi-vprice-line', sealIco, h('span', 'pi-vprice-n', fmt(o.cost))));
      row.append(ico, text, price);
      bindTip(row, () => {
        let t = `<div class="pi-tip-name" style="color:${RARITY_COLORS[o.rarity]}">${esc(o.name)}</div>`;
        if (o.desc) t += `<div class="pi-tip-line">${esc(o.desc)}</div>`;
        if (o.materialId) t += `<div class="pi-tip-dim">Elinde: ${fmt(c.material(o.materialId))}</div>`;
        if (lvBad) t += `<div class="pi-tip-bad">Gerekli seviye: ${o.requiredLevel}</div>`;
        t += o.kind === 'chest' ? '<div class="pi-tip-hint">Tık: eşya türü seç</div>' : '<div class="pi-tip-hint">Tık: satın al</div>';
        return t;
      });
      row.addEventListener('click', () => {
        if (o.kind === 'chest') {
          this.chestPick = !this.chestPick;
          sfx('ui_tab');
          this.refresh();
        } else this.buySeal(o.id);
      });
      this.list.append(row);
      if (o.kind === 'chest' && this.chestPick) {
        let opts: ReturnType<typeof vendorApi.gambleOptions> = [];
        try {
          opts = vendorApi.gambleOptions();
        } catch {
          opts = [];
        }
        const grid = h('div', 'pi-gcats pi-gcats-in');
        for (const op of opts) grid.append(this.categoryButton(op.category, op.name, poor, () => this.buySeal(o.id, op.category)));
        this.list.append(grid);
      }
    }
  }

  private buySeal(id: string, category?: ItemCategory): void {
    const r = vendorApi.buySealOffer(id, category);
    if (!r.ok) {
      toast(r.reason ?? 'Satın alınamadı', 'warning');
      sfx('ui_error');
      return;
    }
    sfx('buy');
    if (r.item) {
      this.chestPick = false;
      this.showReveal(r.item, 'Mühür Sandığı');
      if (r.item.rarity === 'epic' || r.item.rarity === 'legendary' || r.item.rarity === 'set') sfx('upgrade_success');
    } else if (r.materialId) {
      const info = materialInfo(r.materialId);
      toast(`${info.name}${(r.count ?? 1) > 1 ? ` ×${r.count}` : ''} alındı`, 'loot');
    }
    this.refresh();
  }

  private categoryButton(category: ItemCategory, label: string, poor: boolean, onClick: () => void): HTMLButtonElement {
    const b = h('button', `pi-gcat${poor ? ' poor' : ''}`);
    const ico = h('i', 'pi-gcat-ico');
    ico.style.setProperty('--ico', `url("${iconUrl(CATEGORY_ICON[category] ?? 'item-junk.svg')}")`);
    b.append(ico, h('span', 'pi-gcat-name', label));
    b.addEventListener('click', onClick);
    return b;
  }

  /* ------------------------------------------------------------ Gizemli Tuccar (gamble) */

  private renderGamble(): void {
    const c = G.character;
    this.list.replaceChildren();
    if (!c) return;
    const minLv = vendorApi.gambleMinLevel;
    if (c.level < minLv) {
      this.list.append(h('div', 'pi-empty', `Gizemli Tüccar ${minLv}. seviyeden itibaren hizmet verir.`));
      return;
    }
    const cost = vendorApi.gambleCost();
    const poor = c.save.gold < cost;
    const odds = h('div', 'pi-godds');
    odds.append(h('span', 'pi-godds-t', 'Şans:'));
    for (const o of GAMBLE_ODDS) {
      const sp = h('span', 'pi-godd', `${RARITY_NAMES_TR[o.r]} ${o.p}`);
      sp.style.color = RARITY_COLORS[o.r];
      odds.append(sp);
    }
    const price = h('div', 'pi-gprice' + (poor ? ' poor' : ''));
    price.append('Her deneme: ', h('i', 'pi-coin'), h('b', '', fmt(cost)), ' altın · Eşya seviyesi = seviyen');
    this.list.append(odds, price, h('div', 'pi-hint', 'Bir eşya türü seç, kutuyu aç. Efsanevi ve Set eşyalar ruha bağlanır.'));

    let opts: ReturnType<typeof vendorApi.gambleOptions> = [];
    try {
      opts = vendorApi.gambleOptions();
    } catch {
      opts = [];
    }
    const grid = h('div', 'pi-gcats');
    for (const o of opts) grid.append(this.categoryButton(o.category, o.name, poor, () => this.gamble(o.category)));
    this.list.append(grid);

    if (this.history.length) {
      const hist = h('div', 'pi-ghist');
      hist.append(h('div', 'pi-shop-title', 'Son Açılanlar'));
      const row = h('div', 'pi-ghist-row');
      for (const it of this.history) {
        const sl = new ItemSlot('md');
        sl.set(it);
        bindItemTip(sl.el, () => it, { compare: false });
        row.append(sl.el);
      }
      hist.append(row);
      this.list.append(hist);
    }
  }

  private gamble(category: ItemCategory): void {
    const c = G.character;
    if (!c) return;
    const r = vendorApi.gamble(category);
    if (!r.ok || !r.item) {
      toast(r.reason ?? 'Kutu açılamadı', 'warning');
      sfx('ui_error');
      return;
    }
    this.history.unshift(r.item);
    if (this.history.length > 8) this.history.pop();
    const rar = r.item.rarity;
    sfx('buy');
    sfx(rar === 'legendary' || rar === 'set' ? 'upgrade_success' : 'item_pickup', 0.9);
    this.showReveal(r.item, 'Kutudan çıkan');
    if (rar === 'legendary' || rar === 'set') toast('Efsanevi bir eşya çıktı!', 'levelup');
    this.refresh();
  }

  private buyRow(e: VendorEntry, index: number): HTMLElement {
    const row = h('div', 'pi-vrow');
    const text = h('div', 'pi-vtext');
    if (e.item) {
      const slot = new ItemSlot('md');
      slot.set(e.item);
      const d = describe(e.item);
      const name = h('div', 'pi-vname', d.name);
      name.style.color = RARITY_COLORS[e.item.rarity];
      text.append(name, h('div', 'pi-vsub', `${d.slotLabel}${d.isEquipment ? ` · Sv ${d.requiredLevel} · EL ${d.itemLevel}` : ''}`));
      row.append(slot.el, text);
      bindItemTip(row, () => e.item, { footer: () => '<div class="pi-tip-hint">Tık: satın al</div>' });
    } else {
      const info = materialInfo(e.materialId ?? '');
      const ico = h('div', `pi-slot sz-md rar-${info.rarity}`);
      ico.style.setProperty('--rc', RARITY_COLORS[info.rarity]);
      const i = h('div', 'pi-ico');
      i.style.setProperty('--ico', `url("${info.icon}")`);
      ico.append(i);
      const name = h('div', 'pi-vname', info.name);
      name.style.color = RARITY_COLORS[info.rarity];
      const reqLv = e.requiredLevel ?? 0;
      const sub = h('div', 'pi-vsub', info.desc || '');
      if (reqLv > 1) {
        const lv = h('span', G.character && G.character.level < reqLv ? 'pi-lvbad' : 'pi-lvok', " Sv " + reqLv);
        sub.append(lv);
      }
      text.append(name, sub);
      row.append(ico, text);
      bindTip(row, () => {
        let s = `<div class="pi-tip-name" style="color:${RARITY_COLORS[info.rarity]}">${esc(info.name)}</div>`;
        if (info.desc) s += `<div class="pi-tip-line">${esc(info.desc)}</div>`;
        const c = G.character;
        if (c && e.materialId) s += `<div class="pi-tip-dim">Elinde: ${fmt(c.material(e.materialId))}</div>`;
        s += `<div class="pi-tip-hint">Tık: satın al</div>`;
        return s;
      });
    }
    const price = h('div', 'pi-vprice');
    price.append(h('span', 'pi-vstock'), h('div', 'pi-vprice-line', h('span', 'pi-vq'), h('i', 'pi-coin'), h('span', 'pi-vprice-n', fmt(e.price))));
    row.append(price);
    const buy = () => this.buy(e, row);
    row.addEventListener('click', buy);
    row.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      buy();
    });
    void index;
    queueMicrotask(this.refreshRows);
    return row;
  }

  private buy(e: VendorEntry, row: HTMLElement): void {
    const c = G.character;
    if (!c) return;
    const q = this.unitQty(e);
    if (e.stock !== undefined && e.stock <= 0) {
      toast('Bu ürün tükendi', 'warning');
      sfx('ui_error');
      return;
    }
    if (this.have(e) < e.price * q) {
      toast(e.currency ? `Yeterli ${materialInfo(e.currency).name} yok` : 'Yeterli altının yok', 'warning');
      sfx('ui_error');
      return;
    }
    const r = vendorApi.buy(e, q);
    if (r.ok) {
      sfx('buy');
      if (e.item) {
        // the vendor removes sold equipment from its stock
        try {
          this.entries = vendorApi.entries(this.entriesKind());
        } catch {
          /* keep the old list */
        }
        this.refresh();
        return;
      }
      row.classList.remove('bought');
      void row.offsetWidth;
      row.classList.add('bought');
      this.refreshRows();
    } else {
      toast(r.reason ?? 'Satın alınamadı', 'warning');
      sfx('ui_error');
    }
  }

  private backRow(it: ItemInstance, price: number, index: number): HTMLElement {
    const row = h('div', 'pi-vrow');
    const slot = new ItemSlot('md');
    slot.set(it);
    const d = describe(it);
    const name = h('div', 'pi-vname', d.name);
    name.style.color = RARITY_COLORS[it.rarity];
    const text = h('div', 'pi-vtext');
    text.append(name, h('div', 'pi-vsub', d.slotLabel));
    const p = h('div', 'pi-vprice');
    p.append(h('div', 'pi-vprice-line', h('i', 'pi-coin'), h('span', 'pi-vprice-n', fmt(price))));
    row.append(slot.el, text, p);
    const c = G.character;
    row.classList.toggle('poor', !!c && c.save.gold < price);
    bindItemTip(row, () => it, { compare: false, footer: () => '<div class="pi-tip-hint">Tık: geri al</div>' });
    row.addEventListener('click', () => {
      const r = vendorApi.buyback(index);
      if (r.ok) {
        sfx('buy');
        this.refresh();
      } else {
        toast(r.reason ?? 'Geri alınamadı', 'warning');
        sfx('ui_error');
      }
    });
    return row;
  }

  private sellJunk(): void {
    const c = G.character;
    if (!c) return;
    const junk = c.save.bag.filter((it) => it && it.rarity === 'poor' && !it.locked);
    if (!junk.length) {
      toast('Satılacak değersiz eşya yok', 'info');
      sfx('ui_error');
      return;
    }
    let gold = 0;
    let n = 0;
    for (const it of junk) {
      if (!it) continue;
      const before = c.save.gold;
      const r = vendorApi.sell(it.uid);
      if (r.ok) {
        n++;
        gold += r.gold || Math.max(0, c.save.gold - before);
      }
    }
    if (n) {
      sfx('sell');
      toast(`${n} eşya satıldı: +${fmt(gold)} altın`, 'loot');
    }
  }
}
