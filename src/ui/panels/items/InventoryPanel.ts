import { G } from '../../../game/G';
import type { EventScope } from '../../../core/EventBus';
import { BAG_SIZE } from '../../../types/character';
import { RARITY_COLORS } from '../../../types/common';
import type { ItemLocation } from '../../../systems/CharacterState';
import { ItemPanel, makeTabs, registry, type TabsHandle } from './PanelBase';
import { moveItem, quickAction, sortContainer, useConsumable, vendorSells } from './actions';
import { vendorApi } from './backend';
import {
  ItemSlot, bindItemTip, bindTip, drag, esc, flashEl, fmt, h, isEquipItem, materialInfo, sfx, toast, type MaterialInfo,
} from './common';
import { chip, emptyState } from '../../kit';

const COLS = 8;

type PouchFilter = 'all' | 'consumable' | 'upgrade' | 'crafting' | 'other';
const FILTERS: { id: PouchFilter; label: string }[] = [
  { id: 'all', label: 'Hepsi' },
  { id: 'consumable', label: 'İksirler' },
  { id: 'upgrade', label: 'Yükseltme' },
  { id: 'crafting', label: 'Efsun / Taş' },
  { id: 'other', label: 'Diğer' },
];

function filterOf(m: MaterialInfo): PouchFilter {
  if (m.kind === 'consumable') return 'consumable';
  if (m.kind === 'upgrade') return 'upgrade';
  if (m.kind === 'crafting') return 'crafting';
  return 'other';
}

/** Çanta: 48-slot bag + Kese (materials / currencies). */
export class InventoryPanel extends ItemPanel {
  private slots: ItemSlot[] = [];
  private grid!: HTMLDivElement;
  private tabs!: TabsHandle;
  private bagView!: HTMLDivElement;
  private pouchView!: HTMLDivElement;
  private pouchList!: HTMLDivElement;
  private chips = new Map<PouchFilter, HTMLButtonElement>();
  private filter: PouchFilter = 'all';
  private goldEl!: HTMLSpanElement;
  private freeEl!: HTMLSpanElement;
  private fullEl!: HTMLElement;
  private emptyEl!: HTMLElement;
  private hintEl!: HTMLDivElement;
  private matSig = '';
  /** uids seen on the last refresh (null right after opening): new ones get a pickup flash. */
  private known: Set<string> | null = null;
  private lastGold = -1;

  constructor() {
    super('inventory', {
      title: 'Çanta',
      icon: 'ui-bag.svg',
      width: 480,
      height: 520,
      dock: 'right',
    });
  }

  protected build(body: HTMLElement): void {
    this.tabs = makeTabs(
      [
        { id: 'bag', label: 'Çanta', icon: 'item-bag.svg' },
        { id: 'pouch', label: 'Kese', icon: 'item-coins.svg' },
      ],
      (id) => this.showTab(id),
    );
    body.append(this.tabs.el);

    // ---- bag
    this.bagView = h('div', 'pi-inv-bag');
    this.grid = h('div', 'pi-grid');
    this.grid.style.gridTemplateColumns = `repeat(${COLS}, 46px)`;
    for (let i = 0; i < BAG_SIZE; i++) {
      const slot = new ItemSlot('md');
      this.slots.push(slot);
      this.wireSlot(slot, i);
      this.grid.append(slot.el);
    }
    const tools = h('div', 'pi-toolbar');
    const sort = h('button', 'pi-btn sm', 'Sırala');
    sort.addEventListener('click', () => {
      sortContainer('bag');
      this.refresh();
    });
    bindTip(sort, () => '<div class="pi-tip-name">Sırala</div><div class="pi-tip-dim">Silah, zırh, nadirlik ve eşya seviyesine göre dizer.</div>');
    this.freeEl = h('span', 'pi-free');
    tools.append(sort, this.freeEl);
    // header chip: bag fullness (section 7.3), placed before the close button
    this.fullEl = chip('');
    this.fullEl.classList.add('pi-bag-full');
    this.head.insertBefore(this.fullEl, this.head.querySelector('.k-x'));
    this.emptyEl = emptyState({ icon: '/assets/icons/item-bag.svg', title: 'Çantan boş', text: 'Yaratıklardan ve zindanlardan eşya düşer.' });
    this.emptyEl.hidden = true;
    this.bagView.append(this.emptyEl, this.grid, tools);

    // ---- pouch
    this.pouchView = h('div', 'pi-inv-pouch');
    const chipRow = h('div', 'pi-chips');
    for (const f of FILTERS) {
      const b = h('button', 'pi-chip', f.label);
      b.addEventListener('click', () => {
        this.filter = f.id;
        sfx('ui_tab');
        this.refreshPouch(true);
      });
      this.chips.set(f.id, b);
      chipRow.append(b);
    }
    this.pouchList = h('div', 'pi-pouch-list');
    this.pouchView.append(chipRow, this.pouchList);

    // ---- footer (gold + hint)
    const foot = h('div', 'pi-inv-foot');
    const gold = h('div', 'pi-gold');
    gold.append(h('i', 'pi-coin'), (this.goldEl = h('span', 'pi-gold-n', '0')));
    bindTip(gold, () => '<div class="pi-tip-name" style="color:#ffd35a">Altın</div><div class="pi-tip-dim">Satıcılar, Demirci ve eğitmenlerde harcanır.</div>');
    this.hintEl = h('div', 'pi-hint');
    foot.append(gold, this.hintEl);

    body.append(this.bagView, this.pouchView, foot);
    this.showTab('bag');
  }

  protected subscribe(s: EventScope): void {
    s.on('inventory:changed', this.safeRefresh)
      .on('equipment:changed', this.safeRefresh)
      .on('player:gold', this.safeRefresh)
      .on('materials:changed', this.safeRefresh)
      .on('player:levelup', this.safeRefresh)
      .on('player:stats', this.safeRefresh);
  }

  protected onOpen(data?: unknown): void {
    this.known = null;
    this.lastGold = -1;
    const d = data as { tab?: string } | undefined;
    if (d?.tab === 'pouch' || d?.tab === 'bag') {
      this.tabs.set(d.tab, true);
      this.showTab(d.tab);
    }
  }

  private showTab(id: string): void {
    this.bagView.style.display = id === 'bag' ? '' : 'none';
    this.pouchView.style.display = id === 'pouch' ? '' : 'none';
    if (this.isOpen) this.refresh();
  }

  private context(): string {
    if (registry.stash?.isOpen) return 'Sağ tık: depoya koy';
    if (vendorSells()) return 'Shift + Sağ tık: sat';
    if (registry.blacksmith?.isOpen) return 'Sağ tık: örse koy';
    return 'Sağ tık: kuşan';
  }

  private wireSlot(slot: ItemSlot, index: number): void {
    const loc = (): ItemLocation => ({ where: 'bag', index });
    drag.bindSource(slot.el, {
      payload: () => (slot.item ? { kind: 'item', item: slot.item, loc: loc() } : null),
      onContext: (e) => {
        if (slot.item) quickAction(loc(), slot.item, e);
      },
      onDouble: (e) => {
        if (slot.item && isEquipItem(slot.item) && !vendorSells() && !registry.stash?.isOpen) quickAction(loc(), slot.item, e);
      },
      onClick: (e) => {
        if (e.ctrlKey && slot.item) quickAction(loc(), slot.item, e);
      },
    });
    drag.zone(slot.el, {
      accepts: (p) => p.kind === 'item',
      drop: (p) => {
        if (p.kind !== 'item') return false;
        return moveItem(p.loc, loc());
      },
    });
    bindItemTip(slot.el, () => slot.item, {
      footer: () => {
        const it = slot.item;
        if (!it) return '';
        return `<div class="pi-tip-hint">${this.context()}${it.locked ? '' : ' · Ctrl+Tık: kilitle'}</div>`;
      },
    });
  }

  protected refresh(): void {
    const c = G.character;
    if (!c) {
      for (const s of this.slots) s.set(null);
      this.goldEl.textContent = '-';
      return;
    }
    let free = 0;
    const seen = new Set<string>();
    const fresh: number[] = [];
    for (let i = 0; i < this.slots.length; i++) {
      const it = c.save.bag[i] ?? null;
      this.slots[i].set(it);
      if (!it) free++;
      else {
        seen.add(it.uid);
        if (this.known && !this.known.has(it.uid)) fresh.push(i);
      }
    }
    this.known = seen;
    for (const i of fresh.slice(0, 6)) flashEl(this.slots[i].el, 'fresh', 800);
    const used = BAG_SIZE - free;
    this.freeEl.textContent = `Boş yuva: ${free} / ${BAG_SIZE}`;
    this.freeEl.classList.toggle('low', free <= 4);
    this.fullEl.textContent = `${used} / ${BAG_SIZE}`;
    this.fullEl.classList.toggle('low', free <= 4);
    this.emptyEl.hidden = used > 0;
    if (this.lastGold >= 0 && c.save.gold !== this.lastGold) flashEl(this.goldEl, c.save.gold > this.lastGold ? 'gain' : 'loss', 700);
    this.lastGold = c.save.gold;
    this.goldEl.textContent = fmt(c.save.gold);
    this.hintEl.textContent = `${this.context()} · Ctrl+Tık: kilitle`;
    this.refreshPouch(false);
  }

  private refreshPouch(force: boolean): void {
    const c = G.character;
    if (!c || this.pouchView.style.display === 'none') return;
    for (const [id, b] of this.chips) b.classList.toggle('on', id === this.filter);
    const ids = Object.keys(c.save.materials).filter((id) => (c.save.materials[id] ?? 0) > 0);
    const rows = ids
      .map((id) => ({ id, n: c.save.materials[id], info: materialInfo(id) }))
      .filter((r) => this.filter === 'all' || filterOf(r.info) === this.filter);
    const kindOrder = ['consumable', 'upgrade', 'crafting', 'currency', 'key'];
    rows.sort((a, b) => kindOrder.indexOf(a.info.kind) - kindOrder.indexOf(b.info.kind) || a.info.name.localeCompare(b.info.name, 'tr'));
    const sig = this.filter + '|' + rows.map((r) => `${r.id}:${r.n}`).join(',');
    if (!force && sig === this.matSig) return;
    this.matSig = sig;
    this.pouchList.replaceChildren();
    if (!rows.length) {
      this.pouchList.append(h('div', 'pi-empty', 'Kesende bu türde bir şey yok.'));
      return;
    }
    for (const r of rows) {
      const row = h('div', 'pi-prow');
      const ico = h('div', `pi-slot sz-sm rar-${r.info.rarity}`);
      ico.style.setProperty('--rc', RARITY_COLORS[r.info.rarity]);
      const i = h('div', 'pi-ico');
      i.style.setProperty('--ico', `url("${r.info.icon}")`);
      ico.append(i);
      const txt = h('div', 'pi-prow-txt');
      const name = h('div', 'pi-prow-name', r.info.name);
      name.style.color = RARITY_COLORS[r.info.rarity];
      txt.append(name, h('div', 'pi-prow-desc', r.info.desc || (r.info.kind === 'consumable' ? 'Sağ tık: kullan' : '')));
      row.append(ico, txt, h('div', 'pi-prow-n', fmt(r.n)));
      bindTip(row, () => {
        let s = `<div class="pi-tip-name" style="color:${RARITY_COLORS[r.info.rarity]}">${esc(r.info.name)}</div>`;
        if (r.info.desc) s += `<div class="pi-tip-line">${esc(r.info.desc)}</div>`;
        s += `<div class="pi-tip-dim">Elinde: ${fmt(r.n)}</div>`;
        if (r.info.sellPrice) s += `<div class="pi-tip-gold">Satış: ${fmt(r.info.sellPrice)} altın</div>`;
        if (r.info.kind === 'consumable') s += `<div class="pi-tip-hint">Sağ tık: kullan</div>`;
        if (vendorSells() && r.info.sellPrice) s += `<div class="pi-tip-hint">Shift + Sağ tık: 1 adet sat · Ctrl + Shift + Sağ tık: hepsini sat</div>`;
        return s;
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (e.shiftKey && vendorSells()) {
          const n = e.ctrlKey ? r.n : 1;
          const res = vendorApi.sellMaterial(r.id, n);
          if (res.ok) {
            sfx('sell');
            toast(`+${fmt(res.gold)} altın`, 'loot');
          } else {
            sfx('ui_error');
            toast('Bu malzeme satılamaz', 'warning');
          }
          return;
        }
        if (r.info.kind === 'consumable' && useConsumable(r.id)) {
          sfx('potion_drink');
          this.refresh();
        }
      });
      this.pouchList.append(row);
    }
  }
}
