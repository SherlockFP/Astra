import '../../styles/panels-guide.css';
import { G } from '../../../game/G';
import { buildChrome, chip, emptyState } from '../../kit';
import { ICON, div, h, setText } from '../../widgets/dom';
import { getPinnedQuest, setPinnedQuest } from '../../hud/questMarks';
import { CLASS_META, GamePanel, button } from './base';
import { adviceSummary, recommend, zoneWaypointKnown, type GuideAdvice } from './guideEngine';

/** Re-render period while the panel is open (s). The content is small, so a full rebuild keeps the code simple. */
const REFRESH_S = 1;

/**
 * Ne Yapmalıyım? (key `.`, §4.6, UX-21): advice, never a gate. Cards: the recommended quest (track / map), where to farm
 * (region, spots, waypoint, map), the dungeon line, and a to-do list whose rows open their panel. Footer: the tips switch,
 * the welcome card again, close.
 * OWNER: panels-game.
 */
export class GuidePanel extends GamePanel {
  private body!: HTMLElement;
  private acc = 0;

  constructor() {
    super('guide', { cls: 'gd-guide' });
  }

  protected build(): void {
    const c = buildChrome({
      title: 'Ne Yapmalıyım?',
      icon: ICON('ui-quest'),
      keyAction: 'guide',
      size: 'M',
      onClose: () => this.requestClose(),
    });
    this.body = c.body;
    c.body.classList.add('gd-body');
    this.el.append(c.root);
  }

  protected onOpen(): void {
    this.render();
  }

  protected tick(dt: number): void {
    this.acc += dt;
    if (this.acc < REFRESH_S) return;
    this.acc = 0;
    this.render();
  }

  private render(): void {
    this.body.textContent = '';
    const ch = G.character;
    if (!ch) {
      this.body.append(emptyState({ icon: ICON('ui-quest'), title: 'Karakter yok', text: 'Bir karakterle oyuna girince öneriler burada çıkar.' }));
      return;
    }
    let a: GuideAdvice;
    try {
      a = recommend(ch);
    } catch (err) {
      console.warn('[guide] recommend failed', err);
      this.body.append(emptyState({ icon: ICON('ui-quest'), title: 'Öneri yok', text: 'Şimdilik önerecek bir şey bulamadık.' }));
      return;
    }
    this.header(a);
    this.questCard(a);
    this.zoneCard(a);
    this.dungeonCard(a);
    this.todoCard(a);
    this.footer();
  }

  /** Class, level, the average item level of the equipped gear, and the one-line summary. */
  private header(a: GuideAdvice): void {
    const ch = G.character!;
    const eq = Object.values(ch.save.equipment).filter((x): x is NonNullable<typeof x> => !!x);
    const ilvl = eq.length ? Math.round(eq.reduce((s, x) => s + x.itemLevel, 0) / eq.length) : 0;
    const meta = CLASS_META[ch.save.classId];
    const head = div('gd-head', this.body, `Sv. ${ch.save.level} ${meta?.name ?? ch.save.classId} · Eşya Seviyesi ${ilvl}`);
    if (meta?.color) head.style.color = meta.color;
    const summary = adviceSummary(a);
    if (summary) div('gd-summary', this.body, summary);
  }

  private card(title: string): HTMLElement {
    const c = div('k-card gd-card', this.body);
    div('gd-card-t', c, title);
    return c;
  }

  private questCard(a: GuideAdvice): void {
    const c = this.card('ÖNERİLEN GÖREV');
    const q = a.quest;
    if (!q) {
      div('gd-text', c, 'Şu an önerilen bir görev yok. Bölgede dolaşarak yeni görevler bul.');
      return;
    }
    const row = div('gd-row', c);
    div('gd-diamond', row, '◆');
    div('gd-name', row, q.name);
    if (q.main) row.append(chip('Ana', 'var(--gold-2)'));
    row.append(chip(`Sv. ${q.level}`));
    const open = q.rows.find((r) => !r.done);
    if (open) div('gd-text', c, `▸ ${open.text}  ${Math.min(open.have, open.need)} / ${open.need}`);
    const btns = div('gd-btns', c);
    if (q.state !== 'ready') {
      const pinned = q.state === 'active' && getPinnedQuest() === q.id;
      btns.append(
        button(pinned ? 'Takipte' : 'Takip Et', () => {
          setPinnedQuest(q.id);
          this.render();
        }, { variant: 'primary', disabled: pinned }),
      );
    }
    btns.append(button('Haritada', () => G.ui.openPanel('map'), { variant: 'ghost' }));
  }

  private zoneCard(a: GuideAdvice): void {
    const z = a.zone;
    if (!z) return;
    const c = this.card('NEREDE KASMALI?');
    const row = div('gd-row', c);
    div('gd-name', row, z.name);
    row.append(chip(`Sv. ${z.levels[0]}–${z.levels[1]}`));
    if (z.fit === 'fit') row.append(chip('★ Önerilen', 'var(--ok)'));
    else row.append(chip(z.fit === 'low' ? 'Düşük seviye' : 'Yüksek seviye', z.fit === 'low' ? 'var(--bad)' : 'var(--text-3)'));
    if (!z.built) {
      div('gd-text', c, 'Yakında');
      return;
    }
    if (z.mobs.length) div('gd-text', c, z.mobs.join(' · '));
    for (const s of z.spots) div('gd-spot', c, `${s.label} · Sv. ${s.levels[0]}`);
    const btns = div('gd-btns', c);
    if (zoneWaypointKnown(z.waypointId)) btns.append(button('Işınlan', () => G.ui.openPanel('waypoints'), { variant: 'ghost' }));
    btns.append(button('Haritada Göster', () => G.ui.openPanel('map'), { variant: 'ghost' }));
  }

  private dungeonCard(a: GuideAdvice): void {
    const d = a.dungeon;
    if (!d) return;
    const c = this.card('ÖNERİLEN ZİNDAN');
    const row = div('gd-row', c);
    div('gd-name', row, d.name);
    row.append(chip(`Sv. ${d.levels[0]}–${d.levels[1]}`));
    div('gd-text', c, d.note);
    const btns = div('gd-btns', c);
    btns.append(
      button('Zindan Bulucu', () => {
        const ch = G.character;
        if (ch && !ch.save.flags['onb.finder']) {
          ch.save.flags['onb.finder'] = 1;
          ch.persist();
        }
        G.ui.openPanel('finder');
      }, { variant: 'ghost' }),
    );
  }

  private todoCard(a: GuideAdvice): void {
    const c = this.card('YAPILACAKLAR');
    if (!a.todo.length) {
      div('gd-text', c, 'Şimdilik yapılacak bir şey yok.');
      return;
    }
    for (const t of a.todo) {
      const r = h('button', 'gd-todo' + (t.done ? ' done' : ''), c);
      r.type = 'button';
      setText(r, `${t.done ? '[x]' : '[ ]'} ${t.text}`);
      r.addEventListener('click', () => {
        if (t.action) G.ui.openPanel(t.action.panel, t.action.data);
      });
    }
  }

  private footer(): void {
    const f = div('gd-foot', this.body);
    const label = h('label', 'gd-check', f);
    const box = h('input', '', label);
    box.type = 'checkbox';
    box.checked = G.settings?.data.showTips !== false;
    box.addEventListener('change', () => G.settings?.set('showTips', box.checked));
    label.append(' Başlangıç ipuçlarını göster');
    f.append(button('Başlangıç Rehberi', () => G.ui.openPanel('welcome'), { variant: 'ghost' }));
    f.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
  }
}
