import { G } from '../../../game/G';
import { GAME_VERSION as NET_GAME_VERSION } from '../../../net/messages';
import { CLASS_META, GamePanel, askConfirm, button, h, icon, inOpenWorld, openPanel, sfx, toast } from './base';

/** Same version string the room browser compares (net/messages.ts). */
export const GAME_VERSION = `v${NET_GAME_VERSION}`;

/** Esc menu. */
export class GameMenuPanel extends GamePanel {
  private whoEl!: HTMLElement;
  private roomEl!: HTMLElement;
  private btns!: HTMLElement;

  constructor() {
    super('gameMenu', { backdropClose: true });
  }

  protected build(): void {
    this.whoEl = h('div.pg-gm-who');
    this.roomEl = h('div.pg-gm-room');
    this.btns = h('div.pg-gm-btns');
    const card = h(
      'div.pg-card.pg-gm',
      null,
      h('div.pg-gm-logo', null, h('div.pg-gm-t1', null, 'EFSUN ONLINE'), h('div.pg-gm-t2', null, 'Kadim Zindanlar')),
      h('div.pg-divider', null, h('i')),
      this.whoEl,
      this.roomEl,
      this.btns,
      h('div.pg-gm-ver', null, `${GAME_VERSION} · three.js`),
    );
    this.el.append(card);
    this.el.classList.add('pg-gm-root');
  }

  protected onOpen(): void {
    const c = G.character?.save;
    this.whoEl.innerHTML = '';
    if (c) {
      const cm = CLASS_META[c.classId];
      this.whoEl.append(icon(cm.icon, 'pg-gm-cls'), h('div', null, h('b', { style: { color: cm.color } }, c.name), h('small', null, `${cm.name} · Seviye ${c.level}`)));
    }
    this.renderRoom();
    this.renderButtons();
    this.listen('scene:changed', () => this.renderButtons());
    for (const ev of ['party:changed', 'net:status'] as const) this.listen(ev, () => this.renderRoom());
  }

  /** "Oda: ABCDEF · 3/5" when in a party. */
  private renderRoom(): void {
    const net = G.net;
    this.roomEl.innerHTML = '';
    if (!net?.isOnline) {
      this.roomEl.style.display = 'none';
      return;
    }
    this.roomEl.style.display = 'flex';
    const n = net.peers.size;
    if (net.channel) {
      this.roomEl.append(icon('/assets/icons/ui-party.svg'), h('span', null, 'Kanal ', h('b', null, net.channelTag), ` · ${n}/${net.maxPlayers} oyuncu (/kanal)`));
      return;
    }
    this.roomEl.append(icon('/assets/icons/ui-party.svg'), h('span', null, `${net.role === 'host' ? 'Lider' : 'Üye'} · Oda `, h('b', null, net.roomId ?? '?'), ` · ${n}/${net.maxPlayers}`));
  }

  private renderButtons(): void {
    const inDungeon = G.scenes?.current?.id === 'dungeon';
    this.btns.innerHTML = '';
    // text-only buttons like WoW's game menu (the icons rendered as plain white squares)
    const mk = (label: string, fn: () => void, v: 'normal' | 'primary' | 'danger' | 'ghost' = 'normal', _ico?: string) =>
      this.btns.append(button(label, fn, { variant: v, cls: 'pg-gm-btn' }));
    mk('Devam', () => this.requestClose(), 'primary', '/assets/icons/ui-check.svg');
    mk('Ayarlar', () => openPanel('settings'), 'normal', '/assets/icons/ui-settings.svg');
    mk('Başlangıç Rehberi', () => this.openGuide(), 'normal', '/assets/icons/ui-quest.svg');
    mk('Arayüzü Düzenle', () => this.editHud(), 'normal');
    mk('Zindan Bulucu', () => this.openFinder(), 'normal', '/assets/icons/ui-dungeon.svg');
    mk('Grup / Sunucular', () => openPanel('party'), 'normal', '/assets/icons/ui-party.svg');
    mk('Başarımlar', () => this.openAchievements(), 'normal', '/assets/icons/ui-laurels.svg');
    mk('Koleksiyon', () => this.openCollection(), 'normal', '/assets/icons/ui-laurels.svg');
    mk('Meslekler', () => this.openProfessions(), 'normal', '/assets/icons/item-ore.svg');
    mk('Lonca', () => openPanel('guild'), 'normal', '/assets/icons/ui-party.svg');
    if (inDungeon) mk(inOpenWorld() ? 'Şehre Dön' : 'Zindandan Ayrıl', () => void this.leaveDungeon(), 'danger', '/assets/icons/ui-exit.svg');
    mk('Karakter Seçimine Dön', () => void this.toCharSelect(), 'normal', '/assets/icons/ui-character.svg');
    mk('Jenerik', () => openPanel('credits'), 'ghost', '/assets/icons/ui-laurels.svg');
  }

  /** HUD edit mode (drag and resize the widgets). Entry point of the HUD edit button removed in UX-13. */
  private editHud(): void {
    this.requestClose();
    try {
      G.ui.hud.startEdit();
    } catch (e) {
      console.error('[gameMenu] HUD edit failed', e);
      toast('Arayüz düzenleme açılamadı.', 'error');
    }
  }

  /** Başlangıç Rehberi: reopens the welcome card (section 4.2). */
  private openGuide(): void {
    this.requestClose();
    openPanel('welcome');
  }

  private openAchievements(): void {
    this.requestClose();
    openPanel('achievements');
  }

  /** Koleksiyon (WP-12): mounts, pets and titles. */
  private openCollection(): void {
    this.requestClose();
    openPanel('collection');
  }

  private openProfessions(): void {
    this.requestClose();
    openPanel('professions');
  }

  private openFinder(): void {
    this.requestClose();
    openPanel('finder');
  }

  private async leaveDungeon(): Promise<void> {
    const st = G.mplus?.state;
    const mplus = !!st && st.difficulty === 'mythicplus' && !st.completed;
    // open world (Sisli Koru): back through the town's south gate, nothing is lost
    const open = inOpenWorld();
    const wholeParty = G.net.inParty && G.net.isPartyLeader && G.net.peers.size > 1;
    let text = open
      ? 'Sisli Koru\'dan ayrılıp şehre dönmek istiyor musun?'
      : mplus
        ? 'Zindandan ayrılırsan Mitik+ koşusu terk edilmiş sayılır: anahtarın 1 seviye düşer, puan ve ödül alamazsın. Emin misin?'
        : 'Zindandan ayrılıp şehre dönmek istediğine emin misin? İlerleme kaybolur.';
    if (wholeParty) text += ' Oda lideri olduğun için tüm grup şehre döner.';
    else if (G.net.isPartyGuest) text += ' Grup zindanda kalır, sen tek başına şehre dönersin.';
    if (!(await askConfirm(this.el, text, open ? 'Şehre Dön' : 'Ayrıl', 'Kal', !open))) return;
    this.requestClose();
    sfx('portal_enter');
    const spawnAt = open ? 'south' : 'portal';
    try {
      if (!G.net.isPartyGuest) G.net.requestScene('town', { spawnAt }); // offline, party host or channel player (a channel is left by itself)
      else void G.scenes.go('town', { spawnAt });
    } catch (e) {
      console.error('[gameMenu] leave dungeon failed', e);
      toast('Zindandan ayrılırken bir sorun oluştu.', 'error');
    }
  }

  private async toCharSelect(): Promise<void> {
    const online = G.net.inParty;
    const text = online ? 'Karakter seçimine dönersen odadan da ayrılırsın. Emin misin?' : 'Karakter seçimine dönmek istediğine emin misin?';
    if (!(await askConfirm(this.el, text, 'Evet, dön', 'Vazgeç'))) return;
    try {
      if (G.net.isOnline) G.net.leaveRoom(); // a public channel too (hands the host role over)
      G.character?.persist(true);
    } catch (e) {
      console.warn('[gameMenu] cleanup failed', e);
    }
    try {
      G.ui.closeAll();
    } catch {
      /* ignore */
    }
    this.requestClose();
    void G.scenes.go('menu');
  }
}
