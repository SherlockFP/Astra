import { G } from '../../../game/G';
import { ACH_CATEGORIES, ACHIEVEMENTS, ACHIEVEMENT_POINTS_TOTAL, type AchievementDef } from '../../../data/achievements';
import type { CharacterSave } from '../../../types/character';
import { isUnlocked, progressOf, setTitle, titleName, totalPoints } from '../../../systems/Achievements';
import { GamePanel, bar, button, fmtInt, h, selectBox, windowFrame } from './base';
import { emptyState } from '../../kit';
import '../../styles/panels-achievements.css';

/** Başarımlar (WP-08): the achievement list by category with progress, the points total and the title picker. */
export class AchievementsPanel extends GamePanel {
  private sumEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private listEl!: HTMLElement;

  constructor() {
    super('achievements', { backdropClose: true });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({
      title: 'Başarımlar',
      icon: '/assets/icons/ui-laurels.svg',
      cls: 'pg-ach',
      size: 'M',
      onClose: () => this.requestClose(),
    });
    this.sumEl = h('div.pg-ach-sum');
    this.titleEl = h('div.pg-ach-titles');
    this.listEl = h('div.pg-ach-list');
    body.append(this.sumEl, this.titleEl, this.listEl);
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(): void {
    this.listen('achievement:unlocked', () => this.render());
    this.listen('player:levelup', () => this.render());
    this.render();
  }

  private render(): void {
    this.sumEl.innerHTML = '';
    this.titleEl.innerHTML = '';
    this.listEl.innerHTML = '';
    const ch = G.character;
    if (!ch) {
      this.listEl.append(emptyState({ icon: '/assets/icons/ui-laurels.svg', title: 'Karakter seçili değil', text: 'Başarımlar bir karakter seçildiğinde görünür.' }));
      return;
    }
    const save = ch.save;
    const earned = ACHIEVEMENTS.filter((d) => isUnlocked(save, d.id)).length;
    this.sumEl.append(
      h('div.pg-ach-stat', null, h('b', null, fmtInt(totalPoints(save))), h('span', null, ` / ${fmtInt(ACHIEVEMENT_POINTS_TOTAL)} puan`)),
      h('div.pg-ach-stat', null, h('b', null, fmtInt(earned)), h('span', null, ` / ${ACHIEVEMENTS.length} başarım`)),
    );
    this.renderTitles(save);
    for (const cat of ACH_CATEGORIES) {
      const defs = ACHIEVEMENTS.filter((d) => d.cat === cat.id);
      const done = defs.filter((d) => isUnlocked(save, d.id)).length;
      this.listEl.append(h('div.pg-ach-cat', null, h('b', null, cat.name), h('span', null, `${done} / ${defs.length}`)));
      for (const d of defs) this.listEl.append(this.card(save, d));
    }
  }

  /** Title picker: the earned titles, or "Unvan yok". The choice is stored on the character (no nameplate shows it yet). */
  private renderTitles(save: CharacterSave): void {
    const earned = (save.titles ?? []).filter((id) => ACHIEVEMENTS.some((d) => d.id === id && d.title));
    const current = save.title && earned.includes(save.title) ? save.title : '';
    this.titleEl.append(h('span.pg-ach-tlabel', null, 'Seçili unvan'));
    if (!earned.length) {
      this.titleEl.append(h('span.pg-ach-hint', null, 'Başarımlardan unvan kazanabilirsin.'));
      return;
    }
    const options = [{ value: '', label: 'Unvan yok' }, ...earned.map((id) => ({ value: id, label: titleName(id) }))];
    this.titleEl.append(
      selectBox(options, current, (v) => {
        setTitle(v || null);
        this.render();
      }),
    );
  }

  private card(save: CharacterSave, d: AchievementDef): HTMLElement {
    const done = isUnlocked(save, d.id);
    const cur = Math.min(progressOf(save, d), d.target);
    const frac = cur / Math.max(1, d.target);
    return h(
      'div.pg-ach-card' + (done ? '.is-done' : ''),
      null,
      h('div.pg-ach-pts', null, `+${d.points}`),
      h(
        'div.pg-ach-main',
        null,
        h('b', null, d.name),
        h('span', null, d.desc),
        bar(frac, done ? 'linear-gradient(#7be37b,#2e8a3a)' : 'linear-gradient(#f4d27a,#b8862f)', `${fmtInt(cur)} / ${fmtInt(d.target)}`),
      ),
      h('div.pg-ach-side', null, done ? h('span.pg-ach-ok', null, '✓ Kazanıldı') : null, d.title ? h('em.pg-ach-title', null, `Unvan: ${d.title}`) : null),
    );
  }
}
