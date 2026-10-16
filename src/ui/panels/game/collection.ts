import { G } from '../../../game/G';
import { ACHIEVEMENTS, type AchievementDef } from '../../../data/achievements';
import { PETS } from '../../../data/pets';
import { MOUNTS, mountItemId, type MountDef, type MountShape } from '../../../data/mounts';
import type { CharacterSave } from '../../../types/character';
import { isUnlocked, setTitle } from '../../../systems/Achievements';
import { activePetId, hasPet, setPet } from '../../../systems/Pets';
import { chosenMountId, hasMount, knownMounts, randomMount, setChosenMount, setFavourite } from '../../../systems/Mounts';
import { toast } from '../../../systems/notify';
import { drag } from '../items/common';
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
    this.listen('mount:changed', () => this.render());
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
    const petsOwned = PETS.filter((p) => hasPet(save, p.id)).length;
    const titles = ACHIEVEMENTS.filter((d) => d.title);
    const titlesOwned = titles.filter((d) => isUnlocked(save, d.id)).length;
    const mountsOwned = knownMounts(save).length;
    this.sumEl.append(
      h('div.pg-ach-stat', null, h('b', null, fmtInt(mountsOwned)), h('span', null, ` / ${MOUNTS.length} binek`)),
      h('div.pg-ach-stat', null, h('b', null, fmtInt(petsOwned)), h('span', null, ` / ${PETS.length} evcil hayvan`)),
      h('div.pg-ach-stat', null, h('b', null, fmtInt(titlesOwned)), h('span', null, ` / ${titles.length} unvan`)),
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

    if (this.tab === 'mounts') this.renderMounts(save);
    else if (this.tab === 'pets') this.renderPets(save);
    else this.renderTitles(save, titles);
  }

  /** Binekler: a grid of silhouettes (unowned = black silhouette + source line). Owned mounts drag onto the action bar. */
  private renderMounts(save: CharacterSave): void {
    const chosen = chosenMountId(save);
    const favs = save.mounts?.favs ?? [];
    this.listEl.append(
      h(
        'div.pg-mnt-bar',
        null,
        button('Rastgele binek', () => this.rollMount(), { variant: 'primary', cls: 'pg-col-act', title: 'Favorilerinden (yoksa öğrendiklerinden) rastgele birini çağır' }),
        h('span.pg-col-src', null, knownMounts(save).length ? `Favori: ${favs.length} · Sürükle: aksiyon çubuğuna koy` : 'Henüz binek öğrenmedin. Kuzgunkale Ahır Ustası\'na git.'),
      ),
    );
    const grid = h('div.pg-mnt-grid');
    for (const m of MOUNTS) grid.append(this.mountCard(save, m, chosen, favs.includes(m.id)));
    this.listEl.append(grid);
  }

  private mountCard(save: CharacterSave, m: MountDef, chosen: string | null, fav: boolean): HTMLElement {
    const owned = hasMount(save, m.id);
    const isChosen = owned && chosen === m.id;
    const sil = h('div.pg-mnt-sil');
    sil.style.setProperty('--c', '#' + m.color.toString(16).padStart(6, '0'));
    sil.style.setProperty('--a', '#' + m.accent.toString(16).padStart(6, '0'));
    sil.innerHTML = mountSilhouette(m.shape);
    const card = h(
      'div.pg-mnt-card' + (owned ? '.is-done' : '') + (isChosen ? '.is-active' : ''),
      null,
      sil,
      h('b', null, owned ? m.name : '???'),
      h('span.pg-col-src', null, owned ? m.desc : m.source.text),
      h(
        'div.pg-mnt-row',
        null,
        owned ? h('span.pg-ach-ok', null, isChosen ? '✓ Seçili' : '✓ Öğrenildi') : h('em.pg-col-lock', null, 'Kilitli'),
        owned ? button(isChosen ? 'Seçili' : 'Seç', () => this.chooseMount(m.id), { variant: isChosen ? 'ghost' : 'normal', cls: 'pg-col-act' }) : null,
        owned ? button(fav ? '★' : '☆', () => this.favourite(m.id), { variant: 'ghost', cls: 'pg-mnt-fav', title: fav ? 'Favorilerden çıkar' : 'Favorilere ekle' }) : null,
      ),
    );
    if (owned) {
      card.title = 'Sürükle: aksiyon çubuğuna koy (F9 ile de çağrılır)';
      drag.bindSource(card, { payload: () => ({ kind: 'mat', id: mountItemId(m.id) }) });
    }
    return card;
  }

  private chooseMount(id: string): void {
    setChosenMount(id);
  }

  private favourite(id: string): void {
    setFavourite(id);
  }

  private rollMount(): void {
    const ch = G.character;
    const id = ch ? randomMount(ch.save) : null;
    if (!id) {
      toast('Henüz çağrılabilir bir binek yok.', 'info');
      return;
    }
    setChosenMount(id);
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

/**
 * Side-view silhouette of a mount shape (80 x 56 SVG, boxes like the voxel model). Owned mounts show the colours (--c body,
 * --a accent); unowned ones are drawn black by the CSS (.pg-mnt-card:not(.is-done) .pg-mnt-sil).
 */
const SIL: Record<MountShape, { body: [number, number, number, number][]; legs: [number, number, number, number][] }> = {
  horse: { body: [[14, 22, 46, 16], [52, 10, 10, 22], [58, 4, 14, 10], [8, 20, 6, 14]], legs: [[18, 38, 5, 14], [26, 38, 5, 14], [48, 38, 5, 14], [56, 38, 5, 14]] },
  wolf: { body: [[16, 26, 44, 14], [50, 18, 10, 14], [56, 16, 18, 10], [68, 20, 8, 6], [8, 22, 10, 5], [58, 10, 4, 6], [64, 10, 4, 6]], legs: [[20, 38, 5, 12], [28, 38, 5, 12], [48, 38, 5, 12], [56, 38, 5, 12]] },
  ram: { body: [[14, 20, 44, 20], [12, 16, 48, 8], [56, 18, 10, 12], [58, 10, 12, 4], [10, 24, 5, 5]], legs: [[18, 38, 5, 14], [26, 38, 5, 14], [48, 38, 5, 14], [56, 38, 5, 14]] },
  boar: { body: [[12, 24, 56, 16], [60, 28, 14, 12], [66, 38, 4, 4], [8, 22, 4, 8]], legs: [[18, 38, 6, 10], [28, 38, 6, 10], [50, 38, 6, 10], [58, 38, 6, 10]] },
  stag: { body: [[20, 24, 36, 14], [50, 8, 8, 22], [54, 4, 16, 10], [60, 0, 3, 8], [68, 0, 3, 8], [14, 24, 4, 6]], legs: [[22, 36, 4, 18], [30, 36, 4, 18], [46, 36, 4, 18], [52, 36, 4, 18]] },
  drake: { body: [[16, 24, 46, 14], [52, 14, 10, 14], [58, 12, 16, 10], [24, 8, 22, 14], [4, 28, 14, 6]], legs: [[22, 38, 6, 10], [50, 38, 6, 10]] },
};

function mountSilhouette(shape: MountShape): string {
  const s = SIL[shape];
  const rect = (r: [number, number, number, number], cls: string): string => `<rect class="${cls}" x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}"/>`;
  return `<svg viewBox="0 0 80 56" aria-hidden="true">${s.body.map((r) => rect(r, 'b')).join('')}${s.legs.map((r) => rect(r, 'l')).join('')}</svg>`;
}
