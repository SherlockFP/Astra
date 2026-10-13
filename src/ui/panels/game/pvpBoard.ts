import { G } from '../../../game/G';
import { NATIONS } from '../../../data/nations';
import { nationAt } from '../../../data/pvpZone';
import { PVP } from '../../../systems/PvpRules';
import { pvp } from '../../../systems/Pvp';
import { GamePanel, bar, button, fmtInt, h, windowFrame } from './base';

const colorOf = (i: number): string => {
  const n = nationAt(i);
  return n ? NATIONS[n].color : '#b8b8b8';
};

/**
 * Kızıl Sınır skor tablosu (WP-07). Opens with `/skor` (or `/pvp`) anywhere; it only has live data inside the PvP zone.
 * Nation scores, the three capture points (owner + progress) and the room's players by Onur / kills, plus the character's own PvP record.
 * Refreshes four times a second while open. Flat ElvUI look: the standard panel window, `.pg-pvp-*` rules in panels-game.css.
 */
export class PvpBoardPanel extends GamePanel {
  private bodyEl!: HTMLElement;
  private acc = 0;

  constructor() {
    super('pvpBoard', { backdropClose: true, modal: false });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({ title: 'Kızıl Sınır', icon: '/assets/icons/ui-leaderboard.svg', cls: 'pg-pvp', size: 'L', onClose: () => this.requestClose() });
    this.bodyEl = body;
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(): void {
    this.acc = 1;
    this.render();
  }

  protected tick(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    this.render();
  }

  private render(): void {
    const body = this.bodyEl;
    const snap = pvp.snapshot();
    const keep = body.scrollTop;
    body.innerHTML = '';
    if (!snap) {
      body.append(h('div.pg-empty', null, 'Skor tablosu yalnızca Kızıl Sınır bölgesinde canlıdır. Kuzgunkale\'nin Batı Kapısı\'ndan gir (Seviye 35).'));
      this.record(body);
      return;
    }
    // nation scores
    const sc = (i: number) => h('div.pg-pvp-nation', { style: { borderColor: colorOf(i), color: colorOf(i) } }, h('div.pg-pvp-nname', null, NATIONS[nationAt(i)!].name), h('div.pg-pvp-score', null, fmtInt(snap.scores[i])));
    body.append(h('div.pg-pvp-head', null, sc(0), h('div.pg-pvp-vs', null, 'KARŞI'), sc(1)));
    // capture points
    const pts = h('div.pg-pvp-points');
    for (const p of snap.points) {
      const owner = p.owner >= 0 ? NATIONS[nationAt(p.owner)!].name : 'Kimsenin';
      const side = p.side >= 0 && p.prog > 0 ? ` · ${NATIONS[nationAt(p.side)!].name} ${Math.floor(p.prog)}/${PVP.CAPTURE_HOLD_SEC} sn` : '';
      pts.append(h('div.pg-pvp-point', { style: { borderColor: colorOf(p.owner) } },
        h('b', { style: { color: colorOf(p.owner) } }, p.name),
        h('span', null, `${owner} elinde${side}`),
        bar(p.side >= 0 ? p.prog / PVP.CAPTURE_HOLD_SEC : 0, colorOf(p.side))));
    }
    body.append(pts);
    // players
    const tbl = h('div.pg-pvp-table');
    tbl.append(h('div.pg-pvp-row.is-head', null, h('span', null, ''), h('span', null, 'Oyuncu'), h('span', null, 'Öldürme'), h('span', null, 'Ölüm'), h('span', null, 'Onur')));
    if (!snap.rows.length) tbl.append(h('div.pg-empty', null, 'Henüz kimse yok.'));
    for (const r of snap.rows) {
      const row = h('div.pg-pvp-row' + (r.self ? '.is-self' : ''), null,
        h('span', { style: { color: colorOf(r.n) } }, NATIONS[nationAt(r.n)!].tag),
        h('span', { style: { color: colorOf(r.n) } }, r.name),
        h('span', null, String(r.kills)), h('span', null, String(r.deaths)), h('span', null, String(r.honour)));
      tbl.append(row);
    }
    body.append(tbl);
    if (snap.respawnLeft > 0) body.append(h('div.pg-pvp-note', null, `Dirilmene ${Math.ceil(snap.respawnLeft)} sn`));
    this.record(body);
    body.scrollTop = keep;
  }

  /** The character's own lifetime record (save). */
  private record(body: HTMLElement): void {
    const rec = G.character?.save.pvp;
    const nation = G.character ? NATIONS[G.character.nation] : null;
    body.append(h('div.pg-pvp-me', null,
      nation ? h('b', { style: { color: nation.color } }, nation.name) : null,
      h('span', null, `Onur ${fmtInt(rec?.honour ?? 0)} (toplam ${fmtInt(rec?.honourTotal ?? 0)})`),
      h('span', null, `Öldürme ${fmtInt(rec?.kills ?? 0)} · Ölüm ${fmtInt(rec?.deaths ?? 0)}`),
      h('span', null, `En iyi seri ${fmtInt(rec?.bestStreak ?? 0)} · Nokta ${fmtInt(rec?.captures ?? 0)}`)));
  }
}
