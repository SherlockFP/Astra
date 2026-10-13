import { G } from '../../../game/G';
import { weekIndex } from '../../../core/utils';
import { currentWeek, weekStartMs } from '../../../data/mythicAffixes';
import type { ItemInstance } from '../../../types/items';
import type { AffixId, RunRecord } from '../../../types/mythic';
import { DUNGEONS } from '../../../data/dungeons';
import type { Rarity } from '../../../types/common';
import {
  GamePanel, affixChips, affixesForLevel, askConfirm, bar, button, dungeonList, fmtInt, h, icon, itemTile, mmss, ratingTier, sfx, windowFrame,
} from './base';

const BREAKPOINTS = [2, 4, 7, 10, 12];
const VAULT_SLOTS = [1, 4, 8];

/** Time until the next weekly rotation (the mythic module's week boundaries). */
function msToReset(): number {
  return Math.max(0, weekStartMs(currentWeek() + 1) - Date.now());
}

function fmtReset(ms: number): string {
  const m = Math.floor(ms / 60000);
  const days = Math.floor(m / 1440);
  const hrs = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  return days > 0 ? `${days} gün ${hrs} sa` : `${hrs} sa ${mins} dk`;
}

export class MplusInfoPanel extends GamePanel {
  private bodyEl!: HTMLElement;
  private vaultEl: HTMLElement | null = null;

  constructor() {
    super('mplusInfo', { backdropClose: true });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({ title: 'Mitik+ Bilgisi', icon: '/assets/icons/ui-leaderboard.svg', cls: 'pg-mi', onClose: () => this.requestClose() });
    this.bodyEl = body;
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(data?: unknown): void {
    for (const ev of ['keystone:changed', 'run:completed', 'inventory:changed'] as const) this.listen(ev, () => this.render());
    this.bodyEl.scrollTop = 0;
    this.render();
    // Lord Tarhan opens the keystone panel with { tab: 'vault' } which forwards here with { focus: 'vault' }
    if ((data as { focus?: string } | undefined)?.focus === 'vault') {
      window.requestAnimationFrame(() => {
        try {
          this.vaultEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          this.vaultEl?.classList.add('pg-flash');
          window.setTimeout(() => this.vaultEl?.classList.remove('pg-flash'), 1400);
        } catch {
          /* ignore */
        }
      });
    }
  }

  private render(): void {
    const body = this.bodyEl;
    const keepScroll = body.scrollTop;
    body.innerHTML = '';
    try {
      (G.mplus as unknown as { weeklyMaintenance?: () => void }).weeklyMaintenance?.();
    } catch {
      /* ignore */
    }
    const save = G.character?.save;
    if (!save) {
      body.append(h('div.pg-empty', null, 'Karakter seçilmedi.'));
      return;
    }
    const m = save.mythic;
    const tier = ratingTier(m.rating);

    // ---- top row
    const ks = m.keystone;
    const ratingCard = h(
      'div.pg-mi-rating',
      { style: { '--rc': tier.color } },
      h('small', null, 'Mitik+ Puanı'),
      h('b', null, m.rating.toFixed(1).replace('.', ',')),
      h('span', null, tier.name),
      h('em', null, `${save.name} · Sv. ${save.level}`),
    );
    const keyCard = h(
      'div.pg-mi-key',
      null,
      icon('/assets/icons/item-keystone.svg', 'pg-mi-keyico'),
      h(
        'div',
        null,
        h('small', null, 'Anahtarın'),
        ks ? h('b', null, `${DUNGEONS[ks.dungeonId]?.name ?? ks.dungeonId} +${ks.level}`) : h('b.pg-dim', null, 'Anahtar yok'),
        ks?.depleted ? h('span.pg-bad', null, 'Tükenmiş') : h('span.pg-dim', null, ks ? 'Kehanet Taşı\'na yerleştir' : 'Mitik 0 bitirerek kazan'),
      ),
      ks ? button('Aç', () => this.openKeystone(), { variant: 'ghost' }) : null,
    );
    const resetCard = h('div.pg-mi-reset', null, icon('/assets/icons/ui-hourglass.svg'), h('div', null, h('small', null, 'Haftalık sıfırlanma'), h('b', null, fmtReset(msToReset()))));
    body.append(h('div.pg-mi-top', null, ratingCard, keyCard, resetCard));

    // ---- affixes
    body.append(h('div.pg-h', null, 'Eklentiler'));
    const week = weekIndex();
    const tbl = h('div.pg-mi-aff');
    tbl.append(h('div.pg-mi-affrow.head', null, h('span', null, 'Anahtar'), h('span', null, 'Bu Hafta'), h('span', null, 'Gelecek Hafta')));
    let prevNow: AffixId[] = [];
    let prevNext: AffixId[] = [];
    for (const lv of BREAKPOINTS) {
      const nowA = affixesForLevel(lv);
      const nextA = affixesForLevel(lv, week + 1);
      const addNow = nowA.filter((a) => !prevNow.includes(a));
      const addNext = nextA.filter((a) => !prevNext.includes(a));
      prevNow = nowA;
      prevNext = nextA;
      const row = h('div.pg-mi-affrow', null, h('span.lv', null, `+${lv}`), affixChips(addNow), affixChips(addNext, true));
      tbl.append(row);
    }
    body.append(tbl);

    // ---- best runs
    body.append(h('div.pg-h', null, 'En İyi Koşular'));
    const grid = h('div.pg-mi-best');
    grid.append(h('div.pg-mi-brow.head', null, h('span', null, 'Zindan'), h('span', null, 'Tahkimli'), h('span', null, 'Zorba'), h('span', null, 'Puan')));
    let any = false;
    const dungeons = dungeonList();
    const idsInBest = Object.keys(m.best).filter((id) => !dungeons.some((d) => d.id === id));
    const rows: { id: string; name: string }[] = [...dungeons.map((d) => ({ id: d.id, name: d.name })), ...idsInBest.map((id) => ({ id, name: id }))];
    for (const d of rows) {
      const b = m.best[d.id] ?? {};
      const F = b.fortified;
      const T = b.tyrannical;
      if (F || T) any = true;
      const score = 1.5 * Math.max(F?.score ?? 0, T?.score ?? 0) + 0.5 * Math.min(F?.score ?? 0, T?.score ?? 0);
      grid.append(h('div.pg-mi-brow', null, h('span.dn', null, d.name), runCell(F), runCell(T), h('span.sc', null, score ? score.toFixed(1).replace('.', ',') : '-')));
    }
    if (!rows.length) grid.append(h('div.pg-empty', null, 'Zindan verisi yok.'));
    else if (!any) grid.append(h('div.pg-empty', null, 'Henüz Mitik+ koşusu tamamlamadın. Anahtarını Kehanet Taşı\'na yerleştir!'));
    body.append(grid);

    // ---- vault
    body.append(h('div.pg-h', null, 'Kadim Hazine (Haftalık Kasa)'));
    this.vaultEl = this.vaultView();
    body.append(this.vaultEl);
    body.scrollTop = keepScroll;
  }

  private openKeystone(): void {
    this.requestClose();
    try {
      G.ui.openPanel('keystone');
    } catch {
      /* ignore */
    }
  }

  /* ---------------------------------------------------------------- vault */

  private vaultItems(opts: { unlocked: number; itemLevels: number[] }): ItemInstance[] {
    const save = G.character!.save;
    const wk = weekIndex();
    const fkey = `vault.items.${wk}`;
    const cached = save.flags[fkey];
    let items: ItemInstance[] = [];
    if (typeof cached === 'string') {
      try {
        const parsed = JSON.parse(cached) as ItemInstance[];
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        items = [];
      }
    }
    // GDD 7.4: at least Destansı; 15% Efsanevi, 15% Set. A better key during the week raises the slot's item level: re-roll that slot.
    let dirty = false;
    for (let i = 0; i < opts.unlocked; i++) {
      const il = opts.itemLevels[i] ?? 120;
      if (items[i] && items[i].itemLevel === il) continue;
      const roll = Math.random();
      const rarity: Rarity = roll < 0.15 ? 'legendary' : roll < 0.3 ? 'set' : 'epic';
      try {
        items[i] = G.loot.rollItem({ itemLevel: il, rarity, classId: save.classId });
        dirty = true;
      } catch (e) {
        console.warn('[mplusInfo] vault roll failed', e);
        break;
      }
    }
    if (dirty) {
      save.flags[fkey] = JSON.stringify(items);
      G.character?.persist();
    }
    return items;
  }

  private vaultView(): HTMLElement {
    const save = G.character!.save;
    const runs: RunRecord[] = save.mythic.weekly.runs ?? [];
    const count = runs.length;
    let opts: { unlocked: number; itemLevels: number[] } = { unlocked: 0, itemLevels: [] };
    try {
      opts = G.mplus.vaultOptions();
    } catch {
      /* ignore */
    }
    const unlocked = opts.unlocked;
    const claimed = save.mythic.vaultClaimedWeek === weekIndex();
    const items = unlocked > 0 && !claimed ? this.vaultItems(opts) : [];
    const wrap = h('div.pg-mi-vault');
    const frac = Math.min(1, count / 8);
    const summary = unlocked > 0 ? ` · ${unlocked} seçenek açık (${opts.itemLevels.slice(0, unlocked).join(', ')} eşya seviyesi)` : '';
    const prog = h('div.pg-mi-vprog', null, h('b', null, `Kadim Kasa: ${count}/8 koşu${summary}`), bar(frac, 'linear-gradient(#f4d27a,#b8862f)'));
    for (const n of VAULT_SLOTS) prog.append(h('i.pg-mi-vmark', { style: { left: `${(n / 8) * 100}%` } }));
    wrap.append(prog);

    const slots = h('div.pg-mi-slots');
    VAULT_SLOTS.forEach((need, i) => {
      const open = i < unlocked;
      const il = opts.itemLevels[i];
      const item = items[i];
      const cell = h(
        'div.pg-mi-slot' + (open ? '.is-open' : '') + (open && claimed ? '.is-claimed' : ''),
        null,
        open && item ? itemTile(item, 64) : icon(open ? '/assets/icons/ui-unlock.svg' : '/assets/icons/ui-lock.svg', 'pg-mi-slotico'),
        h('b', null, open ? (il ? `Eşya Seviyesi ${il}` : 'Açıldı') : 'Kilitli'),
        h('small', null, open ? `${need} koşu tamamlandı` : `${need - count} koşu daha`),
      );
      if (open && !claimed && item) cell.append(button('Bunu Al', () => void this.claim(i, item), { variant: 'primary' }));
      slots.append(cell);
    });
    wrap.append(slots);

    const actions = h('div.pg-mi-vact');
    if (claimed) actions.append(h('div.pg-good.pg-mi-claimed', null, '✓ Bu haftanın ödülünü aldın. Yeni kasa pazartesi açılır.'));
    else if (unlocked > 0) actions.append(h('span.pg-dim', null, 'Yalnızca birini seçebilirsin: seçimini dikkatle yap.'));
    else actions.append(h('span.pg-dim', null, 'İlk Mitik+ koşunu tamamla: Kadim Hazine açılır.'));
    wrap.append(actions);
    return wrap;
  }

  private async claim(i: number, item: ItemInstance): Promise<void> {
    const ok = await askConfirm(this.el, `Seçenek ${i + 1} (Eşya Seviyesi ${item.itemLevel}) alınsın mı? Haftada yalnızca bir ödül alabilirsin.`, 'Al', 'Vazgeç');
    if (!ok) return;
    let done = false;
    try {
      done = G.mplus.claimVault(i); // toasts on success / full bag by itself
    } catch (e) {
      console.warn('[mplusInfo] claimVault failed', e);
    }
    if (done) {
      sfx('vault_open');
      sfx('reward_coin', 0.7);
      sfx('quest_complete', 0.6);
    } else sfx('ui_error');
    this.render();
  }
}

function runCell(r: RunRecord | undefined): HTMLElement {
  if (!r) return h('span.rc.none', null, '-');
  const stars = '★'.repeat(Math.max(0, r.upgrade)) + '☆'.repeat(Math.max(0, 3 - r.upgrade));
  return h('span.rc', null, h('b', null, `+${r.keyLevel}`), h('em' + (r.inTime ? '.ok' : '.late'), null, stars), h('small', null, `${mmss(r.timeSec)} · ${fmtInt(r.score)}`));
}
