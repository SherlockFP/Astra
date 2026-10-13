import { G } from '../../../game/G';
import {
  claimBounty, claimDailyChest, claimWeeklyDecree, dailyBounties, dailyChestReady, rerollBounties, rerollCost, weeklyDecree, type Bounty,
} from '../../../systems/Bounties';
import type { ItemInstance } from '../../../types/items';
import { getMaterial } from '../../../data/materials';
import { GamePanel, askConfirm, bar, button, fmtInt, h, icon, itemTile, openPanel, sfx, toast, windowFrame } from './base';

const KIND_ICONS: Record<string, string> = {
  salvage: '/assets/icons/ui-gears.svg',
  globe: '/assets/icons/item-potion-health.svg',
  party: '/assets/icons/ui-party.svg',
  kill: '/assets/icons/ui-skull.svg',
  kill_elite: '/assets/icons/ui-elite.svg',
  elite_nodeath: '/assets/icons/ui-elite.svg',
  boss: '/assets/icons/ui-boss.svg',
  dungeon: '/assets/icons/ui-dungeon.svg',
  mplus: '/assets/icons/item-keystone.svg',
  gold: '/assets/icons/item-coins-pile.svg',
  upgrade: '/assets/icons/ui-anvil.svg',
};

/** Bounties reset at 04:00 local time (systems/Bounties.bountyDayKey). */
function msToReset(): number {
  const n = new Date();
  const t = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 4, 0, 0);
  if (t.getTime() <= n.getTime()) t.setDate(t.getDate() + 1);
  return t.getTime() - n.getTime();
}

/** Daily bounty board ("İlan Tahtası"): 3 dailies, reroll, daily chest and the weekly decree. */
export class BountyPanel extends GamePanel {
  private listEl!: HTMLElement;
  private sumEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private moneyEl!: HTMLElement;
  private extraEl!: HTMLElement;
  private timer = 0;

  constructor() {
    super('bounty', { backdropClose: true });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({ title: 'İlan Tahtası', icon: '/assets/icons/ui-quest.svg', cls: 'pg-bounty', onClose: () => this.requestClose() });
    this.sumEl = h('div.pg-bt-sum');
    this.timeEl = h('div.pg-bt-time');
    this.moneyEl = h('div.pg-bt-money');
    this.listEl = h('div.pg-bt-list');
    this.extraEl = h('div.pg-bt-extra');
    body.append(h('div.pg-bt-head', null, this.sumEl, this.moneyEl, this.timeEl), this.listEl, this.extraEl);
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(): void {
    // `data.bounties` lets dev pages inject test data; the game uses systems/Bounties.dailyBounties().
    for (const ev of ['bounty:changed', 'player:xp', 'player:gold', 'inventory:changed', 'materials:changed', 'run:completed', 'item:upgraded', 'loot:pickedUp', 'boss:defeated'] as const) this.listen(ev, () => this.render());
    this.render();
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tickTime(), 1000);
    this.tickTime();
  }

  protected onClose(): void {
    window.clearInterval(this.timer);
  }

  private injected(): Bounty[] | undefined {
    return (this.data as { bounties?: Bounty[] } | undefined)?.bounties;
  }

  private tickTime(): void {
    const ms = msToReset();
    const hh = Math.floor(ms / 3600000);
    const mm = Math.floor((ms % 3600000) / 60000);
    this.timeEl.innerHTML = '';
    this.timeEl.append(icon('/assets/icons/ui-hourglass.svg'), h('span', null, `Yenilenmeye: ${hh} sa ${String(mm).padStart(2, '0')} dk`));
  }

  private bounties(): Bounty[] {
    const inj = this.injected();
    if (inj) return inj;
    try {
      return dailyBounties();
    } catch {
      return [];
    }
  }

  private render(): void {
    const list = this.bounties();
    const done = list.filter((b) => b.claimed).length;
    this.sumEl.innerHTML = '';
    this.sumEl.append(h('b', null, `${done}/${list.length}`), h('span', null, ' görev ödülü alındı'));
    const seals = G.character?.save.materials?.['av_muhru'] ?? 0;
    this.moneyEl.innerHTML = '';
    this.moneyEl.append(icon(getMaterial('av_muhru')?.icon ?? '/assets/icons/item-coins.svg'), h('span', null, 'Av Mührü: '), h('b', null, fmtInt(seals)));
    this.listEl.innerHTML = '';
    if (!list.length) {
      this.listEl.append(h('div.pg-empty', null, 'Bugün için ilan yok. Yarın tekrar gel!'));
    } else for (const b of list) this.listEl.append(this.card(b));
    this.renderExtra(list);
  }

  private card(b: Bounty): HTMLElement {
    const complete = b.progress >= b.target;
    const frac = Math.min(1, b.progress / Math.max(1, b.target));
    const rewards = h('div.pg-bt-rewards');
    if (b.reward.xp) rewards.append(h('span.pg-bt-r.xp', null, icon('/assets/icons/ui-level-up.svg'), `${fmtInt(b.reward.xp)} XP`));
    if (b.reward.gold) rewards.append(h('span.pg-bt-r.gold', null, icon('/assets/icons/item-coins.svg'), fmtInt(b.reward.gold)));
    for (const m of b.reward.materials ?? []) {
      const def = getMaterial(m.id);
      rewards.append(h('span.pg-bt-r', null, icon(def?.icon ?? '/assets/icons/item-bag.svg'), `${def?.name ?? m.id} ×${m.count}`));
    }
    const action = b.claimed
      ? h('div.pg-bt-claimed', null, '✓ Alındı')
      : button(complete ? 'Ödülü Al' : 'Devam Ediyor', () => this.claim(b), { variant: complete ? 'primary' : 'ghost', disabled: !complete });
    return h(
      'div.pg-bt-card' + (b.claimed ? '.is-claimed' : complete ? '.is-done' : ''),
      null,
      icon(b.icon || KIND_ICONS[b.kind] || '/assets/icons/ui-quest.svg', 'pg-bt-ico'),
      h(
        'div.pg-bt-main',
        null,
        h('b', null, b.title, b.timedOnly ? h('em.pg-bt-tag', null, 'Zamanında') : null),
        h('span', null, b.desc),
        bar(frac, complete ? 'linear-gradient(#7be37b,#2e8a3a)' : 'linear-gradient(#f4d27a,#b8862f)', `${fmtInt(Math.min(b.progress, b.target))} / ${fmtInt(b.target)}`),
        rewards,
      ),
      action,
    );
  }

  /** Reroll, daily chest and weekly decree (real data only; dev-injected lists skip them). */
  private renderExtra(list: Bounty[]): void {
    const ex = this.extraEl;
    ex.innerHTML = '';
    if (this.injected() || !G.character) return;
    const gold = G.character.save.gold;

    // ---- daily chest
    const allClaimed = list.length >= 3 && list.every((b) => b.claimed);
    let chestReady = false;
    try {
      chestReady = dailyChestReady();
    } catch {
      chestReady = false;
    }
    const chestOpened = allClaimed && !chestReady;
    ex.append(
      h(
        'div.pg-bt-box' + (chestReady ? '.is-ready' : chestOpened ? '.is-done' : ''),
        null,
        icon('/assets/icons/ui-vault.svg', 'pg-bt-boxico'),
        h(
          'div.pg-bt-boxtxt',
          null,
          h('b', null, 'Günlük Sandık'),
          h('span', null, chestOpened ? 'Bugünkü sandığı açtın. Yarın yeniden gel.' : 'Üç ilanı da tamamla: Nadir ya da Destansı bir eşya, Av Mührü ve şans eseri efsun malzemeleri.'),
        ),
        chestOpened ? h('div.pg-bt-claimed', null, '✓ Açıldı') : button('Sandığı Aç', () => this.openChest(), { variant: chestReady ? 'primary' : 'ghost', disabled: !chestReady }),
      ),
    );

    // ---- weekly decree
    let wd = { count: 0, target: 12, claimed: false, ready: false };
    try {
      wd = weeklyDecree();
    } catch {
      /* ignore */
    }
    ex.append(
      h(
        'div.pg-bt-box' + (wd.ready ? '.is-ready' : wd.claimed ? '.is-done' : ''),
        null,
        icon('/assets/icons/ui-laurels.svg', 'pg-bt-boxico'),
        h(
          'div.pg-bt-boxtxt',
          null,
          h('b', null, 'Haftalık Ferman'),
          h('span', null, `Bu hafta ${wd.target} günlük ilan tamamla: 1 Destansı eşya, 30 Av Mührü ve 1 Efsun Kilidi.`),
          bar(Math.min(1, wd.count / Math.max(1, wd.target)), wd.ready || wd.claimed ? 'linear-gradient(#7be37b,#2e8a3a)' : 'linear-gradient(#f4d27a,#b8862f)', `${wd.count} / ${wd.target}`),
        ),
        wd.claimed ? h('div.pg-bt-claimed', null, '✓ Alındı') : button('Fermanı Al', () => this.openDecree(), { variant: wd.ready ? 'primary' : 'ghost', disabled: !wd.ready }),
      ),
    );

    // ---- reroll
    let cost = 0;
    try {
      cost = rerollCost();
    } catch {
      cost = 0;
    }
    const anyClaimed = list.some((b) => b.claimed);
    ex.append(
      h(
        'div.pg-bt-reroll',
        null,
        h('span.pg-dim', null, 'Beğenmediğin ilanlar mı var? Yenilersen mevcut ilerleme sıfırlanır.'),
        button(cost > 0 ? `İlanları Yenile · ${fmtInt(cost)} altın` : 'İlanları Yenile · Ücretsiz', () => void this.reroll(cost), {
          variant: 'ghost',
          icon: '/assets/icons/ui-compass.svg',
          disabled: cost > gold || anyClaimed,
          title: anyClaimed ? 'Ödül aldıktan sonra yenilenemez' : cost > gold ? 'Yeterli altının yok.' : undefined,
        }),
      ),
    );
  }

  private claim(b: Bounty): void {
    let ok = false;
    try {
      ok = claimBounty(b.id);
    } catch (e) {
      console.warn('[bounty] claim failed', e);
    }
    if (ok) {
      sfx('quest_complete');
    } else if (this.injected()) {
      // local override for injected dev data
      b.claimed = true;
      sfx('quest_complete');
      toast(`"${b.title}" ödülü alındı!`, 'loot');
    } else {
      sfx('ui_error');
      toast('Ödül alınamadı.', 'warning');
    }
    this.render();
  }

  private async reroll(cost: number): Promise<void> {
    const text = cost > 0 ? `Bugünkü ilanlar yenilensin mi? Bedel: ${fmtInt(cost)} altın. Mevcut ilerleme sıfırlanır.` : 'Bugünkü ilanlar ücretsiz yenilensin mi? Mevcut ilerleme sıfırlanır.';
    if (!(await askConfirm(this.el, text, 'Yenile', 'Vazgeç'))) return;
    let ok = false;
    try {
      ok = rerollBounties();
    } catch (e) {
      console.warn('[bounty] reroll failed', e);
    }
    if (ok) {
      sfx('ui_tab');
      toast('Yeni ilanlar asıldı.', 'info');
    } else {
      sfx('ui_error');
      toast('İlanlar yenilenemedi.', 'warning');
    }
    this.render();
  }

  private openChest(): void {
    let items: ItemInstance[] | null = null;
    try {
      items = claimDailyChest();
    } catch (e) {
      console.warn('[bounty] chest failed', e);
    }
    if (!items) {
      sfx('ui_error');
      this.render();
      return;
    }
    sfx('chest_open');
    sfx('reward_coin', 0.6);
    this.showReward('Günlük Sandık', items);
    this.render();
  }

  private openDecree(): void {
    let item: ItemInstance | null = null;
    try {
      item = claimWeeklyDecree();
    } catch (e) {
      console.warn('[bounty] decree failed', e);
    }
    sfx(item ? 'quest_complete' : 'ui_error');
    if (item) this.showReward('Haftalık Ferman', [item]);
    this.render();
  }

  private showReward(title: string, items: ItemInstance[]): void {
    const layer = h('div.pg-confirm');
    const close = () => layer.remove();
    const row = h('div.pg-mi-choices');
    for (const it of items) row.append(itemTile(it, 72));
    layer.append(
      h(
        'div.pg-confirm-box',
        null,
        h('div.pg-title', { style: { fontSize: '18px', marginBottom: '12px' } }, title),
        row,
        h('p', { style: { margin: '12px 0 0' } }, 'Ödüllerin çantana eklendi (çanta doluysa yere düştü).'),
        h('div.pg-confirm-btns', { style: { marginTop: '14px' } }, button('Harika', close, { variant: 'primary' })),
      ),
    );
    layer.addEventListener('mousedown', (e) => {
      if (e.target === layer) close();
    });
    this.el.append(layer);
  }
}

/** Passive tree reset ("Yetenek Eğitmeni"). */
export class TrainerPanel extends GamePanel {
  private bodyEl!: HTMLElement;

  constructor() {
    super('trainer', { backdropClose: true });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({ title: 'Yetenek Eğitmeni', icon: '/assets/icons/ui-talent-tree.svg', cls: 'pg-trainer', onClose: () => this.requestClose() });
    this.bodyEl = body;
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(): void {
    for (const ev of ['player:gold', 'talents:changed', 'player:levelup'] as const) this.listen(ev, () => this.render());
    this.render();
  }

  private cost(): number {
    const s = G.character?.save;
    if (!s) return 0;
    try {
      return G.progression.refundAllCost();
    } catch {
      return (s.talentRefunds ?? 0) === 0 ? 0 : 1000 * s.level;
    }
  }

  private render(): void {
    const body = this.bodyEl;
    body.innerHTML = '';
    const c = G.character;
    if (!c) {
      body.append(h('div.pg-empty', null, 'Karakter seçilmedi.'));
      return;
    }
    const total = (() => {
      try {
        return G.progression.talentPointsTotal();
      } catch {
        return 0;
      }
    })();
    const avail = (() => {
      try {
        return G.progression.talentPointsAvailable();
      } catch {
        return 0;
      }
    })();
    const spent = Math.max(0, total - avail);
    const cost = this.cost();
    const inDungeon = G.scenes?.current?.id === 'dungeon';
    const canPay = c.save.gold >= cost;
    const firstFree = (c.save.talentRefunds ?? 0) === 0;
    const can = !inDungeon && spent > 0 && canPay;
    const orbs = c.material('orb_regret');
    const singleCost = (() => {
      try {
        return G.progression.refundCost();
      } catch {
        return 25 * c.level;
      }
    })();

    body.append(
      h('div.pg-tr-wrap', null,
      h('div.pg-tr-intro', null, h('p', null, '"Yolun bir kez yanlış seçildiyse, kadim parşömen hafızanı siler. Harcadığın tüm puanlar sana geri döner."'), h('small', null, '— Yetenek Eğitmeni')),
      h(
        'div.pg-tr-grid',
        null,
        h('div.pg-tr-cell', null, h('small', null, 'Harcanan Puan'), h('b', null, `${spent}`)),
        h('div.pg-tr-cell', null, h('small', null, 'Kalan Puan'), h('b', null, `${avail}`)),
        h('div.pg-tr-cell', null, h('small', null, 'Sıfırlama Bedeli'), h('b', { class: firstFree ? 'pg-good' : canPay ? 'pg-gold' : 'pg-bad' }, firstFree ? 'ÜCRETSİZ' : `${fmtInt(cost)} altın`)),
        h('div.pg-tr-cell', null, h('small', null, 'Altının'), h('b', { class: 'pg-gold' }, fmtInt(c.save.gold))),
      ),
      firstFree ? h('p.pg-good.pg-small', { style: { textAlign: 'center' } }, 'İlk sıfırlama bedava! Sonrakiler seviyene göre altın ister.') : null,
      inDungeon ? h('p.pg-bad', { style: { textAlign: 'center' } }, 'Zindanın içinde yetenekler sıfırlanamaz. Şehre dön.') : null,
      !canPay && !firstFree ? h('p.pg-bad', { style: { textAlign: 'center' } }, 'Yeterli altının yok.') : null,
      spent <= 0 ? h('p.pg-dim', { style: { textAlign: 'center' } }, 'Henüz harcanmış puanın yok.') : null,
      h('p.pg-tr-note', null, `Envanterindeki Pişmanlık Küresi: ${fmtInt(orbs)} adet. Tek bir düğümü küreyle iade etmek için Pasif Ağaç'ta düğüme sağ tıkla.`),
      h('p.pg-tr-note', null, `Tek bir düğümü altınla iade etmek için Pasif Ağaç'ta düğüme sağ tıkla (düğüm başına ${fmtInt(singleCost)} altın).`),
      h(
        'div.pg-tr-btns',
        null,
        button('Yetenekleri Sıfırla', () => void this.reset(cost), { variant: 'danger', cls: 'pg-big', icon: '/assets/icons/ui-upgrade-fail.svg', disabled: !can }),
        button('Uzmanlık Odası', () => {
          this.requestClose();
          openPanel('talents');
        }, { variant: 'normal', icon: '/assets/icons/ui-talent-tree.svg', title: 'Uzmanlık ve Yetenekler (N): uzmanlık değişimi burada ücretsiz' }),
      ),
      ),
    );
  }

  private async reset(cost: number): Promise<void> {
    const c = G.character;
    if (!c) return;
    const text = cost > 0 ? `Tüm yetenek puanların sıfırlansın mı? Bedel: ${fmtInt(cost)} altın.` : 'Tüm yetenek puanların ücretsiz sıfırlansın mı? Bu ilk sıfırlaman.';
    if (!(await askConfirm(this.el, text, 'Sıfırla', 'Vazgeç', true))) return;
    if (c.save.gold < cost) return void toast('Yeterli altının yok.', 'warning');
    let ok = false;
    try {
      ok = G.progression.refundAll() !== false;
    } catch (e) {
      console.error('[trainer] refundAll failed', e);
    }
    if (!ok) {
      sfx('ui_error');
      return void toast('Sıfırlama başarısız oldu.', 'error');
    }
    sfx('upgrade_destroy');
    toast('Yetenek puanların geri verildi!', 'success');
    this.render();
  }
}
