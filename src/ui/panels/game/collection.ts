import { G } from '../../../game/G';
import { MOUNT_LEVEL } from '../../../game/Mount';
import { ACHIEVEMENTS, type AchievementDef } from '../../../data/achievements';
import { PETS } from '../../../data/pets';
import type { CharacterSave } from '../../../types/character';
import { isUnlocked, setTitle } from '../../../systems/Achievements';
import { activePetId, hasPet, setPet } from '../../../systems/Pets';
import { GamePanel, button, fmtInt, h, windowFrame } from './base';
import { emptyState } from '../../kit';
import '../../styles/panels-achievements.css';
import '../../styles/panels-collection.css';

type Tab = 'mounts' | 'pets' | 'titles';

const TABS: { id: Tab; name: string }[] = [
  { id: 'mounts', name: 'Binekler' },
  { id: 'pets', name: 'Evcil Hayvanlar' },
  { id: 'titles', name: 'Unvanlar' },
];

/**
 * Koleksiyon (WP-12): mounts, cosmetic pets and titles with their owned / unowned state, in the flat ElvUI-style cards of the
 * achievements panel. Pets are summoned or dismissed here (one at a time); titles are chosen in the Başarımlar panel.
 * Opened from the game menu.
 */
export class CollectionPanel extends GamePanel {
  private tab: Tab = 'mounts';
  private sumEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private listEl!: HTMLElement;

  constructor() {
    super('collection', { backdropClose: true });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({
      title: 'Koleksiyon',
      icon: '/assets/icons/ui-laurels.svg',
      cls: 'pg-ach pg-col',
      size: 'M',
      onClose: () => this.requestClose(),
    });
    this.sumEl = h('div.pg-ach-sum');
    this.tabsEl = h('div.pg-col-tabs');
    this.listEl = h('div.pg-ach-list');
    body.append(this.sumEl, this.tabsEl, this.listEl);
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(): void {
    this.listen('pet:changed', () => this.render());
    this.listen('achievement:unlocked', () => this.render());
    this.listen('player:levelup', () => this.render());
    this.render();
  }

  private render(): void {
    this.sumEl.innerHTML = '';
    this.tabsEl.innerHTML = '';
    this.listEl.innerHTML = '';
    const ch = G.character;
    if (!ch) {
      this.listEl.append(emptyState({ icon: '/assets/icons/ui-laurels.svg', title: 'Karakter seçili değil', text: 'Koleksiyon bir karakter seçildiğinde görünür.' }));
      return;
    }
    const save = ch.save;
    const mountOwned = save.level >= MOUNT_LEVEL;
    const petsOwned = PETS.filter((p) => hasPet(save, p.id)).length;
    const titles = ACHIEVEMENTS.filter((d) => d.title);
    const titlesOwned = titles.filter((d) => isUnlocked(save, d.id)).length;
    this.sumEl.append(
      h('div.pg-ach-stat', null, h('b', null, fmtInt(petsOwned)), h('span', null, ` / ${PETS.length} evcil hayvan`)),
      h('div.pg-ach-stat', null, h('b', null, fmtInt(titlesOwned)), h('span', null, ` / ${titles.length} unvan`)),
      h('div.pg-ach-stat', null, h('b', null, mountOwned ? '1' : '0'), h('span', null, ' / 1 binek')),
    );

    for (const t of TABS) {
      const on = t.id === this.tab;
      this.tabsEl.append(
        button(t.name, () => {
          this.tab = t.id;
          this.render();
        }, { variant: on ? 'primary' : 'ghost', cls: 'pg-col-tab' + (on ? ' is-active' : '') }),
      );
    }

    if (this.tab === 'mounts') this.renderMounts(mountOwned);
    else if (this.tab === 'pets') this.renderPets(save);
    else this.renderTitles(save, titles);
  }

  private renderMounts(owned: boolean): void {
    this.listEl.append(
      h(
        'div.pg-ach-card' + (owned ? '.is-done' : ''),
        null,
        h('div.pg-ach-pts', null, 'Binek'),
        h(
          'div.pg-ach-main',
          null,
          h('b', null, 'Sisli Atı'),
          h('span', null, `Seviye ${MOUNT_LEVEL}'da açılır. Koşu hızını artırır, zindanda kullanılamaz.`),
        ),
        h('div.pg-ach-side', null, owned ? h('span.pg-ach-ok', null, '✓ Açık') : h('em.pg-col-lock', null, `Sv ${MOUNT_LEVEL} gerekli`)),
      ),
    );
  }

  private renderPets(save: CharacterSave): void {
    const active = activePetId(save);
    for (const p of PETS) {
      const owned = hasPet(save, p.id);
      const isActive = active === p.id;
      const side: (Node | null)[] = [
        owned ? h('span.pg-ach-ok', null, '✓ Öğrenildi') : h('em.pg-col-lock', null, 'Kilitli'),
        owned
          ? button(isActive ? 'Bırak' : 'Çağır', () => setPet(isActive ? null : p.id), { variant: isActive ? 'ghost' : 'normal', cls: 'pg-col-act' })
          : null,
      ];
      this.listEl.append(
        h(
          'div.pg-ach-card' + (owned ? '.is-done' : '') + (isActive ? '.is-active' : ''),
          null,
          h('div.pg-ach-pts', null, owned ? 'Evcil' : '?'),
          h('div.pg-ach-main', null, h('b', null, p.name), h('span', null, p.desc), h('span.pg-col-src', null, p.source.text)),
          h('div.pg-ach-side', null, ...side),
        ),
      );
    }
  }

  private renderTitles(save: CharacterSave, titles: AchievementDef[]): void {
    for (const d of titles) {
      const owned = isUnlocked(save, d.id);
      const selected = save.title === d.id;
      const side: (Node | null)[] = [
        owned ? h('span.pg-ach-ok', null, '✓ Kazanıldı') : h('em.pg-col-lock', null, 'Kilitli'),
        owned && selected ? h('em.pg-ach-title', null, 'Seçili') : null,
        owned && !selected ? button('Seç', () => this.choose(d.id), { cls: 'pg-col-act' }) : null,
      ];
      this.listEl.append(
        h(
          'div.pg-ach-card' + (owned ? '.is-done' : ''),
          null,
          h('div.pg-ach-pts', null, `+${d.points}`),
          h('div.pg-ach-main', null, h('b', null, d.title ?? d.name), h('span', null, `${d.name}: ${d.desc}`)),
          h('div.pg-ach-side', null, ...side),
        ),
      );
    }
  }

  private choose(id: string): void {
    setTitle(id);
    this.render();
  }
}
