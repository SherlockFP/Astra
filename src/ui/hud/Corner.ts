import { G } from '../../game/G';
import { describeItem } from '../../systems/ItemGen';
import { getItemBase } from '../../data/items';
import { getMaterial } from '../../data/materials';
import { RARITY_COLORS, type Rarity } from '../../types/common';
import type { ItemInstance } from '../../types/items';
import type { InputAction } from '../../core/Input';
import type { UI } from '../UI';
import { ICON, div, esc, fmtNum, iconEl, pulse, setClass, setText, uiSound } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/** Bottom-right loot feed: item/gold/material pickups with rarity colours, merged gold lines, glow for rare+. */
export class LootFeed implements HudWidget {
  readonly el: HTMLElement;
  private lines: { el: HTMLElement; t: number; gold?: { amount: number; textEl: HTMLElement } }[] = [];
  private lastGold: { amount: number; textEl: HTMLElement; t: number; line: HTMLElement } | null = null;

  constructor(private ui: UI) {
    this.el = div('lf');
    G.events.on('loot:pickedUp', (e) => {
      if (e.item) this.addItem(e.item);
      if (e.gold) this.addGold(e.gold);
      if (e.material) this.addMaterial(e.material.id, e.material.count);
    });
    G.events.on('scene:leaving', () => this.clear());
  }

  clear(): void {
    for (const l of this.lines) l.el.remove();
    this.lines = [];
    this.lastGold = null;
  }

  private push(el: HTMLElement): void {
    this.el.appendChild(el);
    this.lines.push({ el, t: performance.now() });
    while (this.lines.length > 7) this.lines.shift()!.el.remove();
  }

  private addItem(item: ItemInstance): void {
    let name = item.name ?? item.baseId;
    let icon = getItemBase(item.baseId)?.icon ?? ICON('item-bag');
    let color = RARITY_COLORS[item.rarity] ?? '#fff';
    try {
      const d = describeItem(item);
      if (d.name) name = d.name;
      if (d.icon) icon = d.icon;
      if (d.color && d.color !== '#fff') color = d.color;
    } catch { /* describeItem not ready */ }
    const el = div('lf-line item hud-interactive r-' + item.rarity);
    el.style.setProperty('--rc', color);
    iconEl(icon, 'lf-ico', el);
    const t = div('lf-text', el);
    t.innerHTML = `<b>${esc(name)}</b>${item.quantity && item.quantity > 1 ? ` <i>x${item.quantity}</i>` : ''}`;
    el.addEventListener('mouseenter', (e) => this.ui.showItemTooltip(item, e.clientX, e.clientY));
    el.addEventListener('mouseleave', () => this.ui.hideTooltip());
    this.push(el);
    pulse(el, 'in');
    if (item.rarity === 'legendary' || item.rarity === 'set') {
      this.ui.flashEdge(color, 1);
      this.ui.toast(`${item.rarity === 'set' ? 'SET EŞYASI' : 'EFSANEVİ EŞYA'}  ${name}`, 'loot');
    } else if (item.rarity === 'epic') this.ui.flashEdge(color, 0.45);
  }

  private addGold(amount: number): void {
    const now = performance.now();
    if (this.lastGold && now - this.lastGold.t < 1400 && this.lines.some((l) => l.el === this.lastGold!.line)) {
      this.lastGold.amount += amount;
      this.lastGold.t = now;
      setText(this.lastGold.textEl, `+${fmtNum(this.lastGold.amount)} Altın`);
      pulse(this.lastGold.line, 'bump');
      const l = this.lines.find((x) => x.el === this.lastGold!.line);
      if (l) l.t = now;
      return;
    }
    const el = div('lf-line coin');
    iconEl(ICON('item-coins-pile'), 'lf-ico', el);
    const t = div('lf-text', el);
    t.textContent = `+${fmtNum(amount)} Altın`;
    this.push(el);
    pulse(el, 'in');
    this.lastGold = { amount, textEl: t, t: now, line: el };
  }

  private addMaterial(id: string, count: number): void {
    const m = getMaterial(id);
    const color = m ? RARITY_COLORS[m.rarity as Rarity] ?? '#fff' : '#d8d0c0';
    const el = div('lf-line mat');
    el.style.setProperty('--rc', color);
    iconEl(m?.icon ?? ICON('item-crystal-shard'), 'lf-ico', el);
    const t = div('lf-text', el);
    t.innerHTML = `<b>${esc(m?.name ?? id)}</b> <i>x${count}</i>`;
    this.push(el);
    pulse(el, 'in');
  }

  update(ctx: HudCtx): void {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      const age = ctx.now - l.t;
      if (age > 6500) {
        l.el.remove();
        this.lines.splice(i, 1);
      } else setClass(l.el, 'fade', age > 5200);
    }
  }
}

/** Gold counter with a floating delta. */
export class GoldWidget implements HudWidget {
  readonly el: HTMLElement;
  private val: HTMLElement;
  private floats: HTMLElement;
  private shown = -1;

  constructor() {
    this.el = div('gold hud-interactive');
    iconEl(ICON('item-coins'), 'gold-ico', this.el);
    this.val = div('gold-val', this.el);
    this.floats = div('gold-floats', this.el);
    G.events.on('player:gold', ({ delta }) => {
      if (!delta) return;
      const f = div('gold-float ' + (delta > 0 ? 'up' : 'down'), this.floats);
      f.textContent = (delta > 0 ? '+' : '−') + fmtNum(Math.abs(delta));
      setTimeout(() => f.remove(), 1300);
      pulse(this.el, delta > 0 ? 'gain' : 'spend');
    });
  }

  update(ctx: HudCtx): void {
    const g = ctx.character?.save.gold ?? 0;
    if (g !== this.shown) {
      this.shown = g;
      setText(this.val, fmtNum(g));
    }
  }
}

interface MicroBtn {
  panel: string;
  icon: string;
  action: InputAction;
  label: string;
  el?: HTMLElement;
}

const MICRO: MicroBtn[] = [
  { panel: 'inventory', icon: 'ui-bag', action: 'inventory', label: 'Envanter' },
  { panel: 'character', icon: 'ui-character', action: 'character', label: 'Karakter' },
  { panel: 'talents', icon: 'ui-passive-tree', action: 'talents', label: 'Yetenek Ağacı' },
  { panel: 'skills', icon: 'ui-spellbook', action: 'skills', label: 'Yetenek Kitabı' },
  { panel: 'map', icon: 'ui-map', action: 'map', label: 'Harita' },
  { panel: 'party', icon: 'ui-party', action: 'party', label: 'Grup / Sunucular' },
  { panel: 'mplusInfo', icon: 'ui-timer', action: 'mplus', label: 'Mitik+ Bilgisi' },
  { panel: 'gameMenu', icon: 'ui-gears', action: 'menu', label: 'Menü' },
];

/** Row of clickable panel buttons (for when the cursor is free): inventory, character, talents, skills, map, party, M+, menu. */
export class MicroMenu implements HudWidget {
  readonly el: HTMLElement;
  private btns: MicroBtn[] = MICRO.map((b) => ({ ...b }));

  constructor(private ui: UI) {
    this.el = div('micro');
    for (const b of this.btns) {
      const el = div('mb hud-interactive', this.el);
      iconEl(ICON(b.icon), 'mb-ico', el);
      const key = div('mb-key', el);
      key.textContent = G.input ? G.input.bindingLabel(b.action) : '';
      el.addEventListener('click', () => {
        uiSound('ui_click', 0.6);
        this.ui.togglePanel(b.panel);
      });
      el.addEventListener('mouseenter', (e) => {
        uiSound('ui_hover', 0.25);
        this.ui.showTooltipFor(el, `<div class="st"><div class="st-name">${esc(b.label)}</div><div class="st-kind">Kısayol: ${esc(G.input?.bindingLabel(b.action) ?? '')}</div></div>`, e.clientX, e.clientY);
      });
      el.addEventListener('mouseleave', () => this.ui.hideTooltipIf(el));
      b.el = el;
    }
  }

  update(_ctx: HudCtx): void {
    for (const b of this.btns) {
      if (!b.el) continue;
      setClass(b.el, 'open', this.ui.isPanelOpen(b.panel));
      const key = b.el.lastElementChild as HTMLElement;
      setText(key, G.input ? G.input.bindingLabel(b.action) : '');
    }
  }
}
