import { G } from '../../../game/G';
import type { EventScope } from '../../../core/EventBus';
import { STASH_SIZE } from '../../../types/character';
import type { ItemLocation } from '../../../systems/CharacterState';
import { ItemPanel, makeTabs, openCompanionBag, releaseCompanionBag, type TabsHandle } from './PanelBase';
import { moveItem, quickAction, sortContainer } from './actions';
import { ItemSlot, bindItemTip, bindTip, drag, h } from './common';

const PER_TAB = 60;
const COLS = 10;
const TABS = STASH_SIZE / PER_TAB;

/** Depo: 120 slots in 2 tabs of 60 (10x6). Drag between bag and stash, or right click to deposit / withdraw. */
export class StashPanel extends ItemPanel {
  private slots: ItemSlot[] = [];
  private tabs!: TabsHandle;
  private tab = 0;
  private countEl!: HTMLSpanElement;

  constructor() {
    super('stash', {
      title: 'Depo',
      icon: 'item-chest-plain.svg',
      width: 480,
      height: 470,
      dock: 'left',
    });
  }

  /** Index range of the visible tab (used by quick-deposit from the bag). */
  currentRange(): [number, number] {
    return [this.tab * PER_TAB, this.tab * PER_TAB + PER_TAB];
  }

  protected build(body: HTMLElement): void {
    const items = [] as { id: string; label: string; icon: string }[];
    for (let i = 0; i < TABS; i++) items.push({ id: String(i), label: `Sekme ${['I', 'II', 'III', 'IV'][i] ?? i + 1}`, icon: 'item-chest.svg' });
    this.tabs = makeTabs(items, (id) => {
      this.tab = Number(id);
      this.refresh();
    });
    body.append(this.tabs.el);

    const grid = h('div', 'pi-grid');
    grid.style.gridTemplateColumns = `repeat(${COLS}, 42px)`;
    for (let i = 0; i < PER_TAB; i++) {
      const slot = new ItemSlot('md');
      this.slots.push(slot);
      const loc = (): ItemLocation => ({ where: 'stash', index: this.tab * PER_TAB + i });
      drag.bindSource(slot.el, {
        payload: () => (slot.item ? { kind: 'item', item: slot.item, loc: loc() } : null),
        onContext: (e) => {
          if (slot.item) quickAction(loc(), slot.item, e);
        },
        onDouble: (e) => {
          if (slot.item) quickAction(loc(), slot.item, e);
        },
      });
      drag.zone(slot.el, {
        accepts: (p) => p.kind === 'item',
        drop: (p) => (p.kind === 'item' ? moveItem(p.loc, loc()) : false),
      });
      bindItemTip(slot.el, () => slot.item, { footer: () => '<div class="pi-tip-hint">Sağ tık: çantaya al</div>' });
      grid.append(slot.el);
    }
    const tools = h('div', 'pi-toolbar');
    const sort = h('button', 'pi-btn sm', 'Sırala');
    sort.addEventListener('click', () => {
      sortContainer('stash', this.tab * PER_TAB, this.tab * PER_TAB + PER_TAB);
      this.refresh();
    });
    bindTip(sort, () => '<div class="pi-tip-name">Sırala</div><div class="pi-tip-dim">Bu sekmedeki eşyaları dizer.</div>');
    this.countEl = h('span', 'pi-free');
    const hint = h('span', 'pi-hint', 'Sağ tık: çanta ⇄ depo');
    tools.append(sort, this.countEl, hint);
    body.append(grid, tools);
  }

  protected subscribe(s: EventScope): void {
    s.on('inventory:changed', this.safeRefresh).on('equipment:changed', this.safeRefresh).on('player:levelup', this.safeRefresh);
  }

  protected onOpen(): void {
    // the bag must be reachable to drag things in and out
    openCompanionBag(this.id);
  }

  protected onClose(): void {
    releaseCompanionBag(this.id);
  }

  protected refresh(): void {
    const c = G.character;
    if (!c) return;
    const base = this.tab * PER_TAB;
    let used = 0;
    for (let i = 0; i < PER_TAB; i++) {
      const it = c.save.stash[base + i] ?? null;
      this.slots[i].set(it);
      if (it) used++;
    }
    this.countEl.textContent = `Dolu: ${used} / ${PER_TAB}`;
    for (let t = 0; t < TABS; t++) {
      let n = 0;
      for (let i = 0; i < PER_TAB; i++) if (c.save.stash[t * PER_TAB + i]) n++;
      this.tabs.badge(String(t), n ? String(n) : '');
    }
  }
}
