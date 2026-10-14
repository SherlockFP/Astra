import { G } from '../../../game/G';
import { ARENA_BRACKETS, type ArenaBracket } from '../../../types/finder';
import { ARENA_MIN_LEVEL } from '../../../scenes/arena/arenaRules';
import { arenaKey } from '../../../net/queue/matcher';
import { fetihThisWeek, onurToday } from '../../../systems/PvpGear';
import { chip } from '../../kit';
import { h, sfx, toast } from './base';
import '../../styles/arena.css';
import {
  ARENA_TR, TIER_TONE, bracketName, clockText, enterGate, estimatedWaitSec, ratingOf, seasonLine, seasonView, tierView, titleNames,
} from './arenaShared';

/**
 * "Oyuncuya Karşı" tab of the Zindan Bulucu (GDD_PVP_FINDER §2.5). One card per bracket (1v1 Düello, 2v2, 3v3) with the Derecesiz /
 * Dereceli toggle, the bracket rating and tier badge, the entry requirements and the queue button; a side column with the season,
 * Onur / Fetih caps and the titles. Re-renders only when the visible state changes (a click never lands on a node that was replaced);
 * the timers are plain text refreshed by `tick()`.
 */
export class PvpTab {
  readonly el: HTMLElement = h('div.fd-pvp');
  private readonly ranked: Record<ArenaBracket, boolean> = { '1v1': false, '2v2': false, '3v3': false };
  private sig = '';
  private live: (() => void)[] = [];

  constructor(private readonly hooks: { openRank(): void }) {}

  /** Full rebuild (tab opened, a toggle or a queue button was used, the state signature changed). */
  render(): void {
    this.el.textContent = '';
    this.live = [];
    this.sig = this.signature();
    this.el.append(this.queueLine(), h('div.fd-pvp-grid', null, h('div.fd-pvp-cards', null, ...ARENA_BRACKETS.map((b) => this.card(b))), this.side()));
  }

  /** Called every second while the tab is open: re-renders on a changed state, else refreshes the live texts. */
  tick(): void {
    if (this.signature() !== this.sig) {
      this.render();
      return;
    }
    for (const fn of this.live) fn();
  }

  // ------------------------------------------------------------------------------------------------------------------

  private signature(): string {
    const q = G.net?.queue?.state();
    const gate = enterGate();
    const ld = G.arenaLadder?.profile();
    return JSON.stringify({
      p: q?.phase ?? 'idle', k: q?.key ?? null, w: q?.window ?? null, pool: q?.pool ?? 0, r: this.ranked, g: gate.reason,
      rt: ARENA_BRACKETS.map((b) => ratingOf(b)), o: onurToday().earned, f: fetihThisWeek().earned, ti: titleNames().length,
      lv: G.character?.level ?? 0, s: ld?.season ?? 0,
    });
  }

  private queueLine(): HTMLElement {
    const q = G.net?.queue?.state();
    if (!q || q.phase === 'idle') return h('div.fd-pvp-status', null, h('span.fd-dim', null, 'Kuyrukta değilsin. Bir arena seç ve kuyruğa gir.'));
    const pk = q.key?.startsWith('arena:') ? q.key.split(':') : null;
    const b = (pk?.[1] as ArenaBracket | undefined) ?? '2v2';
    const elapsed = h('span.fd-pvp-elapsed', null, '');
    const paint = (): void => {
      const sec = q.since ? (performance.now() - q.since) / 1000 : 0;
      elapsed.textContent = clockText(sec);
    };
    paint();
    this.live.push(paint);
    const label = q.phase === 'joining' ? ARENA_TR.found : q.phase === 'proposed' ? ARENA_TR.proposed : q.phase === 'in_match' ? ARENA_TR.inMatch : ARENA_TR.searching;
    const cancel = h('button.k-btn.k-btn--sm', { type: 'button', disabled: q.phase === 'in_match' }, ARENA_TR.cancelQueue) as HTMLButtonElement;
    cancel.addEventListener('click', () => G.net?.queue?.cancel());
    const parts: (Node | string)[] = [h('b', null, `${ARENA_TR.inQueue}: `), elapsed, ` · ${bracketName(b)} · ${label}`];
    if (q.window) parts.push(` · ${ARENA_TR.range}: ${q.window[0]}–${q.window[1]}`);
    return h('div.fd-pvp-status', null, h('span', null, ...parts), cancel);
  }

  private card(b: ArenaBracket): HTMLElement {
    const rating = ratingOf(b);
    const tier = tierView(rating);
    const ranked = this.ranked[b];
    const span = tier.next ? tier.next.min - tier.min : 0;
    const frac = tier.next && span > 0 ? Math.max(0, Math.min(1, (rating - tier.min) / span)) : 1;
    const badge = h('span.fd-pvp-tier', { style: { color: TIER_TONE[tier.id] ?? '#ffffff', borderColor: TIER_TONE[tier.id] ?? '#000' } }, tier.name);

    const toggle = h('div.fd-pvp-toggle', null, this.toggleBtn(b, false), this.toggleBtn(b, true));
    const gate = enterGate();
    const key = arenaKey(b, ranked);
    const q = G.net?.queue?.state();
    const mine = !!q && q.key === key && (q.phase === 'searching' || q.phase === 'proposed');
    const busyElsewhere = !!q && q.phase !== 'idle' && !mine;

    // requirement lines (GDD §2.5): level, town, party; arena gear is normalised, nothing to wear
    const lvl = G.character?.level ?? 0;
    const reqs = h(
      'div.fd-pvp-req', null,
      h('div' + (lvl >= ARENA_MIN_LEVEL ? '.is-ok' : '.is-bad'), null, ARENA_TR.reqLevel.replace('{n}', String(ARENA_MIN_LEVEL)) + ` · Sen: ${lvl}`),
      h('div' + (G.scenes?.current?.id === 'town' ? '.is-ok' : '.is-bad'), null, ARENA_TR.reqTown),
      h('div' + (G.net?.inParty ? '.is-bad' : '.is-ok'), null, G.net?.inParty ? ARENA_TR.inParty : ARENA_TR.reqSolo),
      h('div.is-info', null, ARENA_TR.reqGear),
    );

    let act: HTMLButtonElement;
    if (mine) {
      act = h('button.k-btn.k-btn--ghost', { type: 'button' }, ARENA_TR.leave) as HTMLButtonElement;
      act.addEventListener('click', () => {
        sfx('ui_click', 0.6);
        G.net?.queue?.cancel();
      });
    } else {
      const reason = busyElsewhere ? ARENA_TR.alreadyIn : gate.reason;
      act = h('button.k-btn.k-btn--primary', { type: 'button', disabled: !!reason, title: reason || undefined }, ARENA_TR.enter) as HTMLButtonElement;
      act.addEventListener('click', () => {
        const r = G.net?.queue?.enter(key, {});
        if (!r) return;
        if (r.ok) {
          sfx('ui_click');
          toast(ARENA_TR.searching + '…', 'info');
        } else toast(r.reason ?? ARENA_TR.reqFail, 'warning');
        this.render();
      });
    }

    const wait = mine && q ? h('div.fd-pvp-wait', null, `${ARENA_TR.estWait}: ~${estimatedWaitSec(b, q.pool)} sn · ${ARENA_TR.pool}: ${q.pool}`) : null;
    const bar = h('div.fd-pvp-bar', null, h('span', { style: { width: `${Math.round(frac * 100)}%`, background: TIER_TONE[tier.id] ?? '#c9a24a' } }));
    const nextTxt = tier.next ? `${ARENA_TR.rankNext}: ${tier.next.name} (${tier.toNext} puan)` : ARENA_TR.rankTop;

    return h(
      'section.k-card.fd-pvp-card' + (mine ? '.is-queued' : ''), null,
      h('div.fd-pvp-head', null, h('b', null, bracketName(b)), badge),
      toggle,
      h('div.fd-pvp-rating', null, `${ARENA_TR.rating}: ${rating}`, h('span.fd-dim', null, ` · ${nextTxt}`)),
      bar,
      reqs,
      wait,
      h('div.fd-pvp-foot', null, act),
    );
  }

  private toggleBtn(b: ArenaBracket, isRanked: boolean): HTMLButtonElement {
    const on = this.ranked[b] === isRanked;
    const btn = h('button.k-btn.k-btn--sm' + (on ? '.is-on' : ''), { type: 'button', 'aria-pressed': on ? 'true' : 'false' }, isRanked ? ARENA_TR.ranked : ARENA_TR.unranked) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      if (this.ranked[b] === isRanked) return;
      sfx('ui_tab', 0.6);
      this.ranked[b] = isRanked;
      this.render();
    });
    return btn;
  }

  private side(): HTMLElement {
    const season = seasonView();
    const onur = onurToday();
    const fetih = fetihThisWeek();
    const titles = titleNames();
    const seasonLeft = h('span', null, '');
    this.live.push(() => {
      const v = seasonView();
      seasonLeft.textContent = `${ARENA_TR.seasonLeft}: ${v.left}`;
    });
    seasonLeft.textContent = `${ARENA_TR.seasonLeft}: ${season.left}`;
    const capBar = (earned: number, cap: number): HTMLElement =>
      h('div.fd-pvp-bar', null, h('span', { style: { width: `${cap > 0 ? Math.round(Math.min(1, earned / cap) * 100) : 0}%` } }));
    return h(
      'aside.fd-pvp-side', null,
      h('div.fd-h', null, 'PVP PROFİLİ'),
      h('div.fd-pvp-line', null, seasonLine(season)),
      seasonLeft,
      h('div.fd-h', null, ARENA_TR.onur),
      h('div.fd-pvp-line', null, `${ARENA_TR.onur}: ${onur.earned} (${ARENA_TR.onurToday} ${onur.earned}/${onur.cap})`),
      capBar(onur.earned, onur.cap),
      h('div.fd-h', null, ARENA_TR.fetih),
      h('div.fd-pvp-line', null, `${ARENA_TR.fetih}: ${fetih.earned}/${fetih.cap} (${ARENA_TR.fetihWeek})`),
      capBar(fetih.earned, fetih.cap),
      h('div.fd-h', null, ARENA_TR.titles),
      titles.length ? h('div.fd-chips', null, ...titles.map((t) => chip(t))) : h('div.fd-dim', null, ARENA_TR.noTitles),
      h('div.fd-pvp-line.fd-dim', null, ARENA_TR.dampRule),
      h('div', null, h('button.k-btn.k-btn--sm', { type: 'button', onclick: () => this.hooks.openRank() }, ARENA_TR.rankBtn)),
    );
  }
}
