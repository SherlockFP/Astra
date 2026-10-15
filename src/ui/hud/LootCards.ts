import { G } from '../../game/G';
import type { ItemInstance } from '../../types/items';
import { RARITY_COLORS, RARITY_NAMES_TR } from '../../types/common';
import { rarityIndex } from '../../systems/ItemGen';
import { upgradeInfo } from '../../systems/LootUpgrade';
import { describe, itemIcon, sfx } from '../panels/items/common';
import { div, esc } from '../widgets/dom';
import '../styles/hud-loot.css';

/** Items from this rarity index (uncommon) up get a loot card; below it only a direct upgrade gets one (with the equip prompt). */
const CARD_MIN_RARITY = 2;
/** From this rarity index (rare) the card is the big one with sparkles. */
const BIG_RARITY = 3;
/** The "Kuşanılsın mı?" prompt is offered for upgrades up to this character level (WoW's early-levels new-item prompt). */
export const EQUIP_PROMPT_MAX_LEVEL = 20;
const LIFE_MS = 4800;
const BIG_LIFE_MS = 6500;
const EQUIP_LIFE_MS = 9000;
const MAX_CARDS = 3;
const FADE_MS = 350;
/** Fixed sparkle positions (percent of the card) and delays: deterministic so the look is the same every time. */
const SPARKS: [number, number, number][] = [[6, 12, 0], [90, 8, 0.45], [18, 84, 0.9], [84, 80, 0.2], [50, 2, 1.3], [97, 46, 0.7]];

interface Card {
  el: HTMLElement;
  until: number;
}

/**
 * Bottom-centre loot cards: a picked-up item of uncommon quality or better (quality frame, icon, name, item level and the
 * "+X ilvl" delta against the equipped item; rare and better are bigger with sparkles), and an "Equip?" prompt for a direct
 * upgrade at character level 20 or below (its Kuşan button equips the item and plays the equip sound; the character model
 * follows through equipment:changed). Owned by the UI root; fed from 'loot:pickedUp' and from quest reward choices.
 */
export class LootCards {
  private cards: Card[] = [];

  constructor(private layer: HTMLElement) {}

  /** Show the card for `item`. Nothing is shown for a common item that is not an upgrade. */
  show(item: ItemInstance, source: 'pickup' | 'reward' = 'pickup'): void {
    try {
      this.build(item, source);
    } catch (e) {
      console.warn('[ui] loot card failed', e);
    }
  }

  private build(item: ItemInstance, source: 'pickup' | 'reward'): void {
    const rIdx = rarityIndex(item.rarity);
    const info = upgradeInfo(item);
    const equipPrompt = info.upgrade && info.slot !== null && (G.character?.level ?? 1) <= EQUIP_PROMPT_MAX_LEVEL;
    if (rIdx < CARD_MIN_RARITY && !equipPrompt) return;
    const d = describe(item);
    const rarity = item.rarity;
    const big = rIdx >= BIG_RARITY;
    const rarityName = RARITY_NAMES_TR[rarity] ?? rarity;
    const head = source === 'reward' ? 'ÖDÜL EŞYASI' : big ? `${rarityName.toLocaleUpperCase('tr-TR')} EŞYA` : 'EŞYA ALINDI';

    let ilvl = `<div class="lc-ilvl">Eşya Seviyesi <b>${item.itemLevel}</b>`;
    if (info.counterpart) {
      const dl = info.ilvlDelta;
      ilvl += ` <span class="lc-delta ${dl > 0 ? 'up' : dl < 0 ? 'down' : 'same'}">${dl > 0 ? '+' : ''}${dl} ilvl</span>`;
    }
    ilvl += '</div>';
    const upTag = info.upgrade ? '<div class="lc-up">▲ Kuşandığından iyi</div>' : '';
    const eqRow = equipPrompt ? '<div class="lc-eq"><span>Kuşanılsın mı?</span><button type="button" class="lc-btn">Kuşan</button></div>' : '';
    const sparks = big ? SPARKS.map(([x, y, dl]) => `<i class="lc-sp" style="--x:${x}%;--y:${y}%;--d:${dl}s"></i>`).join('') : '';

    const el = div(`lc k-${rarity}${big ? ' big' : ''}`, this.layer);
    el.style.setProperty('--rc', RARITY_COLORS[rarity] ?? '#fff');
    el.innerHTML = `${sparks}<button type="button" class="lc-x" aria-label="Kapat">✕</button>
      <div class="lc-head">${esc(head)}</div>
      <div class="lc-body">
        <div class="lc-frame"><div class="lc-ico" style="background-image:url('${esc(itemIcon(item))}')"></div></div>
        <div class="lc-text">
          <div class="lc-name">${esc(d.name)}</div>
          <div class="lc-sub">${esc(rarityName)}${d.slotLabel ? ' · ' + esc(d.slotLabel) : ''}</div>
          ${ilvl}${upTag}
        </div>
      </div>${eqRow}`;

    const card: Card = { el, until: performance.now() + (equipPrompt ? EQUIP_LIFE_MS : big ? BIG_LIFE_MS : LIFE_MS) };
    this.cards.push(card);
    while (this.cards.length > MAX_CARDS) this.remove(this.cards[0]);

    el.querySelector('.lc-x')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.remove(card);
    });
    el.querySelector('.lc-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      // CharacterState.equip toasts its own refusal reason; the sound and the done state only follow a real equip
      const ok = G.character?.equip(item.uid) ?? false;
      if (!ok) {
        sfx('ui_error');
        return;
      }
      sfx('equip');
      el.classList.add('done');
      const row = el.querySelector('.lc-eq');
      if (row) row.innerHTML = '<span class="lc-ok">✓ Kuşanıldı</span>';
      card.until = performance.now() + 1500;
    });
    el.addEventListener('mouseenter', (e) => {
      const cmp = info.counterpart;
      if (cmp) G.ui?.showCompareTooltip(item, cmp, e.clientX, e.clientY, { owner: el });
      else G.ui?.showItemTooltip(item, e.clientX, e.clientY, { owner: el });
    });
    el.addEventListener('mouseleave', () => G.ui?.hideTooltipIf(el));
  }

  /** Fades and drops finished cards (called from the UI tick with the same clock as the toasts). */
  update(now: number): void {
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i];
      if (now > c.until + FADE_MS) this.remove(c);
      else if (now > c.until && !c.el.classList.contains('out')) c.el.classList.add('out');
    }
  }

  clear(): void {
    for (const c of [...this.cards]) this.remove(c);
  }

  private remove(c: Card): void {
    const i = this.cards.indexOf(c);
    if (i >= 0) this.cards.splice(i, 1);
    c.el.remove();
  }
}
