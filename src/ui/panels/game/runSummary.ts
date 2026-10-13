import { G } from '../../../game/G';
import type { ItemInstance } from '../../../types/items';
import type { RunRecord, RunState } from '../../../types/mythic';
import { DUNGEONS, getDungeon } from '../../../data/dungeons';
import { isFissureId } from '../../../world/procgen';
import { GamePanel, affixView, bindTip, button, dungeonName, esc, h, icon, itemTile, mmss, ratingTier, sfx, windowFrame, DIFFICULTY_NAMES } from './base';

export interface RunSummaryData {
  state: RunState;
  record: RunRecord | null;
  rewards: ItemInstance[];
  /** Optional extras the mythic module may add. */
  ratingBefore?: number;
  ratingAfter?: number;
  /** Show again even if this run was already shown. */
  force?: boolean;
}

/** Rating snapshot taken when a run starts (so the summary can show the gain). */
let ratingAtStart: number | null = null;
export function noteRunStart(): void {
  ratingAtStart = G.character?.save.mythic.rating ?? null;
}

type Step = { at: number; fn: () => void };

export class RunSummaryPanel extends GamePanel {
  private bodyEl!: HTMLElement;
  private timers: number[] = [];
  private pending: Step[] = [];
  private confetti!: HTMLElement;
  lastOpened = 0;
  private shown = new Set<string>();

  constructor() {
    super('runSummary', { backdropClose: false, modal: true });
  }

  /** The same finished run is only shown once (both this module and the scene may ask for it). */
  open(data?: unknown): void {
    const d = data as RunSummaryData | undefined;
    if (d?.state && !d.force) {
      const key = `${d.state.dungeonId}|${d.state.seed}|${d.state.keyLevel}|${Math.round(d.state.elapsed)}`;
      if (this.shown.has(key)) return;
      this.shown.add(key);
    }
    super.open(data);
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({ title: 'Koşu Özeti', icon: '/assets/icons/ui-trophy.svg', cls: 'pg-rs', size: 'M', onClose: () => this.requestClose() });
    this.bodyEl = body;
    this.confetti = h('div.pg-confetti');
    win.append(this.confetti);
    foot.append(button('Devam', () => this.requestClose(), { variant: 'primary', cls: 'pg-big' }));
    win.addEventListener('click', () => this.skip());
    this.el.append(win);
  }

  protected onOpen(data?: unknown): void {
    this.lastOpened = Date.now();
    this.clearTimers();
    this.confetti.innerHTML = '';
    const d = data as RunSummaryData | undefined;
    this.bodyEl.innerHTML = '';
    if (!d || !d.state) {
      this.bodyEl.append(h('div.pg-empty', null, 'Koşu bilgisi bulunamadı.'));
      return;
    }
    this.renderSummary(d);
  }

  protected onClose(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.pending = [];
  }

  private schedule(at: number, fn: () => void): void {
    const step: Step = { at, fn };
    this.pending.push(step);
    this.timers.push(
      window.setTimeout(() => {
        const i = this.pending.indexOf(step);
        if (i >= 0) {
          this.pending.splice(i, 1);
          fn();
        }
      }, at),
    );
  }

  /** Click anywhere: finish the whole animation instantly. */
  private skip(): void {
    const rest = [...this.pending];
    this.pending = [];
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (const s of rest) {
      try {
        s.fn();
      } catch {
        /* ignore */
      }
    }
  }

  /* ---------------------------------------------------------------- content */

  private renderSummary(d: RunSummaryData): void {
    const st = d.state;
    const rec = d.record;
    const def = DUNGEONS[st.dungeonId] ?? getDungeon(st.dungeonId);
    const fissure = isFissureId(st.dungeonId);
    const mplus = st.difficulty === 'mythicplus';
    const timer = st.timerSec || def?.timerSec || 0;
    const elapsed = rec?.timeSec ?? st.elapsed;
    const up = rec?.upgrade ?? st.upgradeLevels ?? 0;
    const timed = mplus ? (rec?.inTime ?? st.inTime) : true;
    const diffName = DIFFICULTY_NAMES[st.difficulty] ?? '';

    // ---- banner
    const headline = mplus ? (timed ? 'ZAMANINDA TAMAMLANDI!' : 'SÜRE DOLDU') : 'ZİNDAN TAMAMLANDI';
    const banner = h(
      'div.pg-rs-banner' + (mplus && !timed ? '.is-fail' : ''),
      null,
      h('div.pg-rs-head', null, headline),
      h(
        'div.pg-rs-sub',
        null,
        h('b', null, dungeonName(st.dungeonId)),
        mplus ? h('span.pg-rs-key', null, `+${st.keyLevel}`) : h('span.pg-rs-diff', null, diffName),
      ),
    );
    const affRow = h('div.pg-rs-affixes');
    for (const id of st.affixes ?? []) {
      const a = affixView(id);
      const ic = icon(a.icon, 'pg-rs-aff');
      bindTip(ic, `<div class="pg-ttip"><div class="pg-ttip-name">${esc(a.name)}</div><div>${esc(a.desc)}</div></div>`);
      affRow.append(ic);
    }
    banner.append(affRow);
    this.bodyEl.append(banner);

    // ---- stars + time bar (mythic+ only)
    const stars: HTMLElement[] = [];
    if (mplus) {
      const starRow = h('div.pg-rs-stars');
      for (let i = 0; i < 3; i++) {
        const thr = [1, 0.8, 0.6][i];
        const s = h('div.pg-rs-star', null, icon('/assets/icons/ui-star.svg'), h('small', null, `≤ ${mmss(timer * thr)}`));
        stars.push(s);
        starRow.append(s);
      }
      this.bodyEl.append(starRow);
      const max = Math.max(timer * 1.3, elapsed * 1.05, 1);
      const tier = elapsed <= timer * 0.6 ? 'gold' : elapsed <= timer * 0.8 ? 'silver' : elapsed <= timer ? 'bronze' : 'fail';
      const fill = h('div.pg-rs-fill.t-' + tier);
      const track = h(
        'div.pg-rs-track',
        null,
        fill,
        h('i.pg-rs-mark', { style: { left: `${((timer * 0.6) / max) * 100}%` } }, h('em', null, '+3')),
        h('i.pg-rs-mark', { style: { left: `${((timer * 0.8) / max) * 100}%` } }, h('em', null, '+2')),
        h('i.pg-rs-mark', { style: { left: `${(timer / max) * 100}%` } }, h('em', null, '+1')),
      );
      const tlabel = h('div.pg-rs-time', null, h('b', null, mmss(elapsed)), h('span', null, ` / ${mmss(timer)}`), st.deaths ? h('span.pg-bad', null, `   (${st.deaths} ölüm: +${mmss(st.deathPenaltySec)})`) : null);
      this.bodyEl.append(tlabel, track);
      this.schedule(250, () => {
        fill.style.width = `${Math.min(1, elapsed / max) * 100}%`;
        sfx('countdown_tick', 0.6);
      });
      for (let i = 0; i < up; i++) {
        this.schedule(1300 + i * 520, () => {
          stars[i].classList.add('is-lit');
          sfx(i === 2 ? 'achievement' : 'keystone_upgrade', 0.9);
        });
      }
      if (timed && up > 0) this.schedule(1300, () => this.burst(up));
      this.schedule(1300 + Math.max(1, up) * 520, () => {
        if (timed) sfx('mplus_complete');
        else sfx('mplus_fail');
      });
    } else {
      this.bodyEl.append(h('div.pg-rs-time.solo', null, h('span', null, 'Tamamlanma süresi: '), h('b', null, mmss(elapsed))));
      this.schedule(300, () => {
        sfx('quest_complete');
        this.burst(1);
      });
    }

    // ---- stats grid
    const score = rec?.score ?? 0;
    const rating = d.ratingAfter ?? G.character?.save.mythic.rating ?? 0;
    // the mythic module records the exact gain of the run it just completed; fall back to the snapshot taken at run start
    let delta = 0;
    if (d.ratingBefore != null) delta = rating - d.ratingBefore;
    else if (rec && G.mplus?.lastRecord === rec) delta = G.mplus.lastRatingDelta;
    else if (ratingAtStart != null) delta = rating - ratingAtStart;
    const tierInfo = ratingTier(rating);
    const scoreEl = h('b', null, '0');
    const ratingEl = h('b', { style: { color: tierInfo.color } }, '0');
    const stats = h(
      'div.pg-rs-grid',
      null,
      cell('Ölümler', h('b', { class: st.deaths ? 'pg-bad' : 'pg-good' }, String(st.deaths))),
      cell('Düşman Gücü', h('b', null, `%${Math.round(Math.min(1, st.forces / Math.max(1, st.forcesRequired)) * 100)}`)),
      cell('Bosslar', h('b', null, `${st.bossesKilled?.length ?? 0}/${st.bossesTotal}`)),
      mplus ? cell('Koşu Puanı', scoreEl) : null,
      mplus ? cell('Mitik+ Puanı', h('span', null, ratingEl, delta ? h('small.pg-good', null, ` (${delta > 0 ? '+' : ''}${delta.toFixed(1)})`) : null)) : null,
    );
    this.bodyEl.append(stats);
    if (mplus) {
      this.schedule(1500, () => countUp(scoreEl, score, 900, 1));
      this.schedule(1800, () => {
        countUp(ratingEl, rating, 1100, 1);
        if (delta > 0) sfx('achievement', 0.7);
      });
    }

    // ---- keystone result
    const ks = G.character?.save.mythic.keystone ?? null;
    let ksBlock: HTMLElement | null = null;
    if (mplus) {
      const newName = ks ? `${dungeonName(ks.dungeonId)} +${ks.level}` : null;
      // only the key owner's key is upgraded / lowered by the run; the others just get their own key topped up (mythic module)
      // MythicPlus.lastKeyOwner / lastParams survive end() (leaving the dungeon), so the owner text is right after the town transition too
      const keyOwner = G.mplus?.params?.keyOwner ?? G.mplus?.lastParams?.keyOwner;
      const isOwner: boolean | null = typeof G.mplus?.lastKeyOwner === 'boolean' ? G.mplus.lastKeyOwner : keyOwner ? keyOwner === (G.net?.selfId ?? 'local') : null;
      const title = isOwner === false ? (timed ? 'Anahtar sahibinin anahtarı yükseldi' : 'Süre doldu') : timed ? `Anahtar +${Math.max(1, up)} yükseldi` : 'Süre doldu: anahtar 1 seviye düştü';
      const sub = newName ? (isOwner === false ? `Anahtarın: ${newName}` : `Yeni anahtar: ${newName}`) : isOwner === false ? 'Anahtarın yok.' : 'Yeni anahtar bilgisi bekleniyor...';
      ksBlock = h(
        'div.pg-rs-ks' + (timed ? '' : '.is-down'),
        null,
        icon(timed ? '/assets/icons/ui-key-upgrade.svg' : '/assets/icons/ui-key-depleted.svg', 'pg-rs-ksico'),
        h('div', null, h('b', null, title), h('span', null, sub)),
      );
    } else if (st.difficulty === 'mythic' && ks && !fissure) {
      ksBlock = h('div.pg-rs-ks', null, icon('/assets/icons/item-keystone.svg', 'pg-rs-ksico'), h('div', null, h('b', null, 'Kadim Anahtar Taşı kazandın!'), h('span', null, `${dungeonName(ks.dungeonId)} +${ks.level}`)));
    }
    if (ksBlock) {
      ksBlock.classList.add('is-hidden');
      this.bodyEl.append(ksBlock);
      this.schedule(2300, () => {
        ksBlock!.classList.remove('is-hidden');
        sfx(timed ? 'keystone_upgrade' : 'keystone_deplete');
      });
    }

    // ---- rewards
    const rw = d.rewards ?? [];
    this.bodyEl.append(h('div.pg-h', { style: { marginTop: '14px' } }, `Ödüller (${rw.length})`));
    const grid = h('div.pg-rs-rewards');
    if (!rw.length) grid.append(h('div.pg-empty', null, fissure ? 'Eşyalar patronlardan düştü; sandıktan altın ve malzeme geldi.' : 'Bu koşudan ödül çıkmadı.'));
    rw.forEach((item, i) => {
      const t = itemTile(item, 58);
      t.classList.add('is-hidden');
      grid.append(t);
      this.schedule(2700 + i * 140, () => {
        t.classList.remove('is-hidden');
        t.classList.add('pg-pop');
        if (i < 6) sfx(item.rarity === 'legendary' ? 'loot_drop_legendary' : item.rarity === 'epic' ? 'loot_drop_epic' : item.rarity === 'rare' ? 'loot_drop_rare' : 'loot_drop', 0.8);
      });
    });
    this.bodyEl.append(grid);
  }

  private burst(strength: number): void {
    const colors = ['#ffd36a', '#fff1b8', '#ff9d4a', '#c9a8ff', '#7ff0ff', '#ff7a8a'];
    const n = 36 + strength * 22;
    for (let i = 0; i < n; i++) {
      const p = h('i');
      p.style.left = 20 + Math.random() * 60 + '%';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', (Math.random() - 0.5) * 520 + 'px');
      p.style.setProperty('--dy', 120 + Math.random() * 360 + 'px');
      p.style.setProperty('--rot', Math.random() * 900 - 450 + 'deg');
      p.style.animationDelay = Math.random() * 0.25 + 's';
      p.style.width = 6 + Math.random() * 6 + 'px';
      p.style.height = 8 + Math.random() * 8 + 'px';
      this.confetti.append(p);
    }
    this.timers.push(window.setTimeout(() => (this.confetti.innerHTML = ''), 2600));
  }
}

function cell(label: string, value: Node): HTMLElement {
  return h('div.pg-rs-cell', null, h('small', null, label), value);
}

function countUp(el: HTMLElement, to: number, ms: number, digits: number): void {
  const t0 = performance.now();
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - (1 - k) * (1 - k) * (1 - k);
    el.textContent = (to * e).toFixed(digits).replace('.', ',');
    if (k < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
