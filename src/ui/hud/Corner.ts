import { G } from '../../game/G';
import { describeItem } from '../../systems/ItemGen';
import { getItemBase } from '../../data/items';
import { getMaterial } from '../../data/materials';
import { RARITY_COLORS, type Rarity } from '../../types/common';
import { BAG_SIZE } from '../../types/character';
import type { ItemInstance } from '../../types/items';
import type { InputAction } from '../../core/Input';
import type { UI } from '../UI';
import { equippedCounterpart } from '../panels/game/base';
import { ICON, div, esc, fmtNum, iconEl, pulse, setClass, setDisplay, setText, uiSound } from '../widgets/dom';
import { unspentTalentPoints } from './Extras';
import { skillPointsFree } from '../../systems/SkillPoints';
import type { HudCtx, HudDensity, HudWidget } from './types';

/** Lines on screen per HUD density (§2.10: 5 / 4 / 3). */
const LOOT_CAP: Record<HudDensity, number> = { lg: 5, md: 4, sm: 3 };
/** Lifetime of a loot line (ms); rare and better stay longer (§2.10). */
const LIFE_MS = 4000;
const LIFE_RARE_MS = 7000;
/** Same item within this window merges into `×N` on its line (ms). */
const MERGE_MS = 4000;
const RARE_PLUS: string[] = ['rare', 'epic', 'legendary', 'set'];

interface LootLine {
  el: HTMLElement;
  t: number;
  life: number;
  key: string;
  count: number;
  countEl?: HTMLElement;
  gold?: { amount: number; textEl: HTMLElement };
}

/**
 * Bottom-right loot feed (§2.10): newest at the bottom, at most 5 / 4 / 3 lines by density, 4 s (rare+ 7 s), identical
 * pickups merge into `×N`, gold lines merge, an upgrade for the equipped slot shows a green `▲`. Flat rows with a 2 px
 * rarity-coloured left stripe.
 * OWNER: hud module.
 */
export class LootFeed implements HudWidget {
  readonly el: HTMLElement;
  private lines: LootLine[] = [];

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
  }

  private cap(): number {
    return LOOT_CAP[this.ui.hud?.density ?? 'lg'];
  }

  private push(line: LootLine): void {
    this.el.appendChild(line.el);
    this.lines.push(line);
    while (this.lines.length > this.cap()) this.lines.shift()!.el.remove();
  }

  private findMerge(key: string, now: number): LootLine | undefined {
    const last = this.lines[this.lines.length - 1];
    return last && last.key === key && now - last.t < MERGE_MS ? last : undefined;
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
    } catch (err) {
      console.warn('[ui] describeItem not ready', err);
    }
    const now = performance.now();
    const key = `item:${item.baseId}:${name}:${item.rarity}`;
    const merge = this.findMerge(key, now);
    if (merge && merge.countEl) {
      merge.count += item.quantity && item.quantity > 1 ? item.quantity : 1;
      setText(merge.countEl, `×${merge.count}`);
      merge.countEl.style.display = '';
      merge.t = now;
      pulse(merge.el, 'bump');
      return;
    }
    const el = div('lf-line item hud-interactive r-' + item.rarity);
    el.style.setProperty('--rc', color);
    iconEl(icon, 'lf-ico', el);
    const t = div('lf-text', el);
    t.innerHTML = `<b>${esc(name)}</b>`;
    const countEl = div('lf-count', t, '');
    countEl.style.display = 'none';
    const upgrade = this.isUpgrade(item);
    if (upgrade) {
      const up = div('lf-up', el);
      up.textContent = '▲';
      up.title = 'Kuşandığın eşyadan daha yüksek eşya seviyesi';
    }
    el.addEventListener('mouseenter', (e) => this.ui.showItemTooltip(item, e.clientX, e.clientY));
    el.addEventListener('mouseleave', () => this.ui.hideTooltip());
    this.push({ el, t: now, life: RARE_PLUS.includes(item.rarity) ? LIFE_RARE_MS : LIFE_MS, key, count: 1, countEl });
    pulse(el, 'in');
    if (item.rarity === 'legendary' || item.rarity === 'set') {
      this.ui.flashEdge(color, 1);
      this.ui.toast(`${item.rarity === 'set' ? 'SET EŞYASI' : 'EFSANEVİ EŞYA'}  ${name}`, 'loot');
    } else if (item.rarity === 'epic') this.ui.flashEdge(color, 0.45);
  }

  /** True when the item is equipment with a higher item level than the one in its slot. */
  private isUpgrade(item: ItemInstance): boolean {
    try {
      const eq = equippedCounterpart(item);
      return !!eq && item.itemLevel > eq.itemLevel;
    } catch {
      return false;
    }
  }

  private addGold(amount: number): void {
    const now = performance.now();
    const last = this.lines[this.lines.length - 1];
    if (last?.gold && now - last.t < 1400) {
      last.gold.amount += amount;
      last.t = now;
      setText(last.gold.textEl, `+${fmtNum(last.gold.amount)} Altın`);
      pulse(last.el, 'bump');
      return;
    }
    const el = div('lf-line coin');
    iconEl(ICON('item-coins-pile'), 'lf-ico', el);
    const t = div('lf-text', el);
    t.textContent = `+${fmtNum(amount)} Altın`;
    this.push({ el, t: now, life: LIFE_MS, key: 'gold', count: 1, gold: { amount, textEl: t } });
    pulse(el, 'in');
  }

  private addMaterial(id: string, count: number): void {
    const m = getMaterial(id);
    const color = m ? RARITY_COLORS[m.rarity as Rarity] ?? '#fff' : '#d8d0c0';
    const el = div('lf-line mat');
    el.style.setProperty('--rc', color);
    iconEl(m?.icon ?? ICON('item-crystal-shard'), 'lf-ico', el);
    const t = div('lf-text', el);
    t.innerHTML = `<b>${esc(m?.name ?? id)}</b> <i>x${count}</i>`;
    this.push({ el, t: performance.now(), life: LIFE_MS, key: 'mat:' + id, count: 1 });
    pulse(el, 'in');
  }

  update(ctx: HudCtx): void {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      const age = ctx.now - l.t;
      if (age > l.life) {
        l.el.remove();
        this.lines.splice(i, 1);
      } else setClass(l.el, 'fade', age > l.life - 800);
    }
  }
}

/** Gold chip (§2.10): coin icon + amount, with a floating delta. */
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

/** What the micro menu knows about the character, read once per frame. */
interface MicroState {
  level: number;
  bagFull: boolean;
  unspent: number;
  /** Unspent Yetenek Puanı (SkillsPanel). */
  skillPts: number;
  skillOff: boolean;
  questStarted: boolean;
  questReady: boolean;
}

type MicroBadge = { kind: 'dot' } | { kind: 'num'; text: string };

interface MicroDef {
  panel: string;
  icon: string;
  action: InputAction;
  label: string;
  /** Level at which the button appears (§2.10 reveal table). */
  minLevel: number;
  /** Extra condition on top of the level. */
  shown?: (s: MicroState) => boolean;
  badge?: (s: MicroState) => MicroBadge | null;
}

const MICRO: MicroDef[] = [
  { panel: 'inventory', icon: 'ui-bag', action: 'inventory', label: 'Çanta', minLevel: 1, badge: (s) => (s.bagFull ? { kind: 'dot' } : null) },
  { panel: 'character', icon: 'ui-character', action: 'character', label: 'Karakter', minLevel: 1 },
  { panel: 'map', icon: 'ui-map', action: 'map', label: 'Harita', minLevel: 1 },
  { panel: 'party', icon: 'ui-party', action: 'party', label: 'Grup', minLevel: 1 },
  {
    panel: 'talents', icon: 'ui-passive-tree', action: 'talents', label: 'Yetenekler', minLevel: 2,
    badge: (s) => (s.unspent > 0 ? { kind: 'num', text: String(s.unspent) } : null),
  },
  {
    panel: 'skills', icon: 'ui-spellbook', action: 'skills', label: 'Yetenek Kitabı', minLevel: 3,
    badge: (s) => (s.skillPts > 0 ? { kind: 'num', text: String(s.skillPts) } : s.skillOff ? { kind: 'num', text: '!' } : null),
  },
  {
    panel: 'questlog', icon: 'ui-quest', action: 'quests', label: 'Görevler', minLevel: 1,
    shown: (s) => s.questStarted,
    badge: (s) => (s.questReady ? { kind: 'num', text: '?' } : null),
  },
  { panel: 'finder', icon: 'ui-dungeon', action: 'groupFinder', label: 'Zindan Bulucu', minLevel: 8 },
  { panel: 'gameMenu', icon: 'ui-gears', action: 'menu', label: 'Menü', minLevel: 1 },
];

/**
 * Micro menu (§2.10): one row of flat square buttons, revealed progressively by level and progress. Clicking toggles the panel
 * (also reachable with the keys). Badges: bag ≥ 90 % full (dot), unspent talent points, unspent Yetenek Puanı (count), a learned skill that is not on the bar
 * (`!`), a ready quest (`?`).
 * OWNER: hud module.
 */
export class MicroMenu implements HudWidget {
  readonly el: HTMLElement;
  private btns: { def: MicroDef; el: HTMLElement; badge: HTMLElement; key: HTMLElement; shown: boolean; keyText: string; badgeSig: string }[] = [];

  constructor(private ui: UI) {
    this.el = div('micro');
    for (const def of MICRO) {
      const el = div('mb hud-interactive', this.el);
      el.dataset.panel = def.panel;
      iconEl(ICON(def.icon), 'mb-ico', el);
      const badge = div('mb-badge', el);
      const key = div('mb-key', el);
      el.addEventListener('click', () => {
        uiSound('ui_click', 0.6);
        this.ui.togglePanel(def.panel);
      });
      el.addEventListener('mouseenter', (e) => {
        uiSound('ui_hover', 0.25);
        this.ui.showTooltipFor(el, `<div class="st"><div class="st-name">${esc(def.label)}</div><div class="st-kind">Kısayol: ${esc(G.input?.bindingLabel(def.action) ?? '')}</div></div>`, e.clientX, e.clientY);
      });
      el.addEventListener('mouseleave', () => this.ui.hideTooltipIf(el));
      this.btns.push({ def, el, badge, key, shown: true, keyText: '', badgeSig: '' });
    }
  }

  update(ctx: HudCtx): void {
    const s = this.state(ctx);
    for (const b of this.btns) {
      const show = s.level >= b.def.minLevel && (!b.def.shown || b.def.shown(s));
      if (show !== b.shown) {
        b.shown = show;
        setDisplay(b.el, show, 'flex');
      }
      if (!show) continue;
      setClass(b.el, 'open', this.ui.isPanelOpen(b.def.panel));
      const keyText = G.input ? G.input.bindingLabel(b.def.action) : '';
      if (keyText !== b.keyText) {
        b.keyText = keyText;
        setText(b.key, keyText);
      }
      const badge = b.def.badge?.(s) ?? null;
      const sig = badge ? (badge.kind === 'dot' ? 'dot' : 'num:' + badge.text) : '';
      if (sig !== b.badgeSig) {
        b.badgeSig = sig;
        setClass(b.el, 'has-badge', !!badge);
        setDisplay(b.badge, !!badge);
        b.badge.className = 'mb-badge' + (badge?.kind === 'dot' ? ' dot' : '');
        if (badge?.kind === 'num') setText(b.badge, badge.text);
      }
    }
  }

  private state(ctx: HudCtx): MicroState {
    const ch = ctx.character;
    const save = ch?.save;
    const bag = save?.bag ?? [];
    const filled = bag.filter((x) => !!x).length;
    const ranks = save?.skillRanks ?? {};
    const learned = Object.keys(ranks).filter((id) => (ranks[id] ?? 0) > 0);
    const onBar = new Set(Object.values(save?.skillBar ?? {}));
    const quests = G.quests;
    let questStarted = false;
    let questReady = false;
    try {
      for (const d of quests?.all() ?? []) {
        const st = quests?.state(d.id);
        if (st === 'active' || st === 'ready' || st === 'done') questStarted = true;
        if (st === 'ready') questReady = true;
      }
    } catch (err) {
      console.warn('[ui] quest data not ready', err);
    }
    return {
      level: save?.level ?? 1,
      bagFull: bag.length > 0 && filled / BAG_SIZE >= 0.9,
      unspent: unspentTalentPoints(),
      skillPts: save ? skillPointsFree(save) : 0,
      skillOff: learned.some((id) => !onBar.has(id)),
      questStarted,
      questReady,
    };
  }
}
