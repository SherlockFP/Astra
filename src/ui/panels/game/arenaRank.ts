import { G } from '../../../game/G';
import { ARENA_BRACKETS, type ArenaBracket } from '../../../types/finder';
import { ARENA_TIERS } from '../../../scenes/arena/arenaRules';
import { GamePanel, button, h, tabs, windowFrame, type TabsHandle } from './base';
import { ARENA_TR, TIER_TONE, bracketName, ratingOf, seasonLine, seasonView, tierView } from './arenaShared';
import '../../styles/arena.css';

/**
 * "Sıralama" panel (GDD_PVP_FINDER §3.4): per bracket, the tier ladder with the thresholds, the local player's place on it, the season
 * history (best rating per ended season) and this season's peak. There is no global ladder (no server); the online ratings line says so.
 * Opened from the PvP tab of the Zindan Bulucu ('arenaRank').
 */
export class ArenaRankPanel extends GamePanel {
  private bodyEl!: HTMLElement;
  private tabsH!: TabsHandle;
  private bracket: ArenaBracket = '2v2';

  constructor() {
    super('arenaRank', { backdropClose: true, modal: false });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({
      title: ARENA_TR.rankTitle, icon: '/assets/icons/ui-leaderboard.svg', cls: 'pg-arena-rank', size: 'M', onClose: () => this.requestClose(),
    });
    this.tabsH = tabs(
      ARENA_BRACKETS.map((b) => ({ id: b, label: ARENA_TR.short[b] })),
      (id) => {
        this.bracket = id as ArenaBracket;
        this.render();
      },
      this.bracket,
    );
    this.bodyEl = h('div.ar-body');
    body.append(this.tabsH.el, this.bodyEl);
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(): void {
    this.tabsH.select(this.bracket, true);
    this.render();
  }

  private render(): void {
    const el = this.bodyEl;
    el.textContent = '';
    const profile = G.arenaLadder?.profile() ?? null;
    if (!profile) {
      el.append(h('div.ar-empty', null, 'Sıralama için bir karakter seçmelisin.'));
      return;
    }
    const b = this.bracket;
    const rating = ratingOf(b);
    const tier = tierView(rating);
    const season = seasonView();
    el.append(
      h('div.ar-head', null,
        h('b', null, bracketName(b)),
        h('span.ar-season', null, `${seasonLine(season)} · ${season.left}`),
      ),
      h('div.ar-now', null,
        h('span.ar-now-tier', { style: { color: TIER_TONE[tier.id] ?? '#fff' } }, tier.name),
        h('span.ar-now-r', null, `${rating} puan`),
        h('span.ar-now-g', null, `${profile.games[b]} maç · ${profile.wins[b]} galibiyet`),
      ),
      this.placeLine(tier.next ? `${ARENA_TR.rankNext}: ${tier.next.name} · ${tier.toNext} puan` : ARENA_TR.rankTop, tier.index, rating),
    );

    const list = h('div.ar-ladder');
    for (const t of ARENA_TIERS) {
      const mine = t.id === tier.id;
      list.append(
        h(`div.ar-tier${mine ? '.is-me' : ''}`, null,
          h('span.ar-tier-dot', { style: { background: TIER_TONE[t.id] ?? '#777' } }),
          h('span.ar-tier-name', null, t.name),
          h('span.ar-tier-min', null, t.min > 0 ? `${t.min}+` : 'Başlangıç'),
          mine ? h('span.ar-tier-you', null, 'Sen') : null,
        ),
      );
    }
    el.append(h('div.fd-h', null, 'KADEMELER'), list);

    el.append(h('div.fd-h', null, ARENA_TR.rankHistory));
    const hist = profile.history.filter((x) => x.best[b] !== undefined);
    if (!hist.length) el.append(h('div.ar-line.fd-dim', null, ARENA_TR.rankNoHistory));
    else {
      for (const s of hist.slice(-8).reverse()) el.append(h('div.ar-line', null, `Sezon ${s.season + 1}: ${ARENA_TR.rankBest} ${s.best[b]}`));
    }
    el.append(h('div.ar-line', null, `${ARENA_TR.rankSeasonPeak}: ${profile.peak[b]}`));

    el.append(h('div.fd-h', null, 'ÇEVRİMİÇİ OYUNCULAR'), h('div.ar-line.fd-dim', null, ARENA_TR.rankOnline));
  }

  private placeLine(text: string, index: number, rating: number): HTMLElement {
    return h('div.ar-place', null, h('span.fd-dim', null, `${ARENA_TR.rankPlace}: ${index + 1}/${ARENA_TIERS.length} · ${rating}`), h('span', null, ` · ${text}`));
  }
}
