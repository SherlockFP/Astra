import { G } from '../../../game/G';
import type { PeerInfo, RoomInfo } from '../../../net/NetSession';
import type { ClassId } from '../../../types/common';
import {
  CLASS_META, GamePanel, affixView, askConfirm, bindTip, button, dungeonName, esc, h, icon, ratingTier, selectBox, sfx, toast, toggle, windowFrame,
} from './base';
import { emptyState } from '../../kit';
import { DUNGEONS } from '../../../data/dungeons';

const pingColor = (ms: number) => (ms < 70 ? '#7be37b' : ms < 140 ? '#ffd36a' : '#ff7a6a');

const TR_VOWELS = 'aıoueiöü';
const TR_BACK_VOWELS = 'aıou';
const TR_VOICELESS = 'çfhkpsşt';

/**
 * Turkish locative of a place name ("Sisli Vadi'de", "Bozkırı'da", "Kemikte"): last-vowel harmony, an apostrophe after a
 * vowel-final name, and -te/-ta after a voiceless consonant. Names without a vowel are returned as they are.
 */
function locativeTr(name: string): string {
  const s = name.trim();
  if (!s) return s;
  const lower = s.toLocaleLowerCase('tr-TR');
  const vowel = [...lower].reverse().find((c) => TR_VOWELS.includes(c));
  if (!vowel) return s;
  const back = TR_BACK_VOWELS.includes(vowel);
  const last = lower.slice(-1);
  if (TR_VOWELS.includes(last)) return `${s}'${back ? 'da' : 'de'}`;
  const t = TR_VOICELESS.includes(last) ? 't' : 'd';
  return `${s}${t}${back ? 'a' : 'e'}`;
}

function activityText(r: RoomInfo): string {
  if (r.activity === 'mythic') return `Mitik+ ${r.dungeonId ? DUNGEONS[r.dungeonId]?.shortName ?? r.dungeonId : ''} ${r.keyLevel ? '+' + r.keyLevel : ''}`.trim();
  if (r.activity === 'dungeon') return `Zindan: ${r.dungeonId ? dungeonName(r.dungeonId) : '?'}`;
  // open world: the room only carries the map id (RoomInfo has no region), so the region name is not shown
  if (r.activity === 'world') return r.dungeonId ? locativeTr(dungeonName(r.dungeonId)) : 'Açık dünyada';
  return 'Şehirde';
}

export class PartyPanel extends GamePanel {
  private listEl!: HTMLElement;
  private countEl!: HTMLElement;
  private membersEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private actionsEl!: HTMLElement;
  private readyBanner!: HTMLElement;
  private rcTitle!: HTMLElement;
  private rcTime!: HTMLElement;
  private rcBar!: HTMLElement;
  private rcBtn!: HTMLButtonElement;
  private rcAcc = 0;
  private nameIn!: HTMLInputElement;
  private pwIn!: HTMLInputElement;
  private maxSel!: HTMLElement & { set(v: string): void };
  private codeIn!: HTMLInputElement;
  private refreshBtn!: HTMLButtonElement;
  private maxPlayers = '4';
  private localTransport = false;
  private poll = 0;
  private lastSig = '';
  private busy = false;

  constructor() {
    super('party', { backdropClose: true, modal: false });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({ title: 'Grup ve Sunucular', icon: '/assets/icons/ui-party.svg', cls: 'pg-party', size: 'L', onClose: () => this.requestClose() });

    // ---- left: server browser
    this.listEl = h('div.pg-pt-list.pg-scroll');
    this.countEl = h('span.pg-dim.pg-small');
    this.refreshBtn = button('Yenile', () => this.refreshRooms(true), { variant: 'ghost', icon: '/assets/icons/ui-compass.svg' });
    this.codeIn = h('input.pg-input', { type: 'text', maxLength: 8, placeholder: 'ODA KODU', spellcheck: false, style: { width: '140px', textTransform: 'uppercase', letterSpacing: '0.2em', textAlign: 'center' } }) as HTMLInputElement;
    this.codeIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.joinByCode();
    });
    const join = h('div.pg-pt-join', null, h('span.pg-dim', null, 'Kodla katıl:'), this.codeIn, button('Katıl', () => void this.joinByCode(), { variant: 'primary' }));

    this.nameIn = h('input.pg-input', { type: 'text', maxLength: 28, placeholder: 'Oda adı', style: { width: '100%' } }) as HTMLInputElement;
    this.pwIn = h('input.pg-input', { type: 'text', maxLength: 16, placeholder: 'Şifre (isteğe bağlı)', autocomplete: 'off', style: { width: '100%' } }) as HTMLInputElement;
    this.maxSel = selectBox<string>(
      ['2', '3', '4', '5'].map((v) => ({ value: v, label: v })),
      this.maxPlayers,
      (v) => (this.maxPlayers = v),
    );
    const local = toggle(false, (v) => {
      this.localTransport = v;
      this.restartBrowsing();
    });
    const create = h(
      'div.pg-pt-create.pg-card',
      null,
      h('div.pg-h', null, 'Oda Kur'),
      this.nameIn,
      this.pwIn,
      h('div.pg-pt-crow', null, h('span', null, 'Oyuncu sayısı'), this.maxSel),
      h('div.pg-pt-crow', null, h('span.pg-dim', { title: 'Aynı bilgisayarda iki sekmeyle test için' }, 'Yerel test odası'), local),
      button('Oda Kur', () => void this.createRoom(), { variant: 'primary', icon: '/assets/icons/ui-portal.svg', cls: 'pg-pt-createbtn' }),
    );
    const left = h('div.pg-pt-left', null, h('div.pg-pt-lhead', null, h('div.pg-h', { style: { flex: '1', margin: '0' } }, 'Sunucular'), this.countEl, this.refreshBtn), this.listEl, join, create);

    // ---- right: current party
    this.statusEl = h('div.pg-pt-status');
    this.membersEl = h('div.pg-pt-members');
    this.rcTitle = h('b', null, 'Hazır mısın?');
    this.rcTime = h('span.pg-pt-rctime', null, '');
    this.rcBar = h('i.pg-pt-rcbar');
    this.rcBtn = button('Hazırım', () => this.setReady(true), { variant: 'primary' });
    this.readyBanner = h('div.pg-pt-rcheck.is-hidden', null, icon('/assets/icons/ui-check.svg'), this.rcTitle, this.rcTime, this.rcBtn, this.rcBar);
    this.actionsEl = h('div.pg-pt-actions');
    const right = h('div.pg-pt-right', null, h('div.pg-h', { style: { margin: '0 0 8px' } }, 'Grubum'), this.statusEl, this.readyBanner, this.membersEl, this.actionsEl);

    body.append(h('div.pg-pt-layout', null, left, right));
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(): void {
    if (!this.nameIn.value) this.nameIn.value = `${G.character?.save.name ?? 'Oyuncu'}'in Odası`;
    try {
      G.net.startBrowsing({ transport: this.localTransport ? 'local' : undefined });
    } catch {
      /* ignore */
    }
    for (const ev of ['net:rooms', 'party:changed', 'net:status', 'net:peerJoined', 'net:peerLeft'] as const) this.listen(ev, () => this.renderAll());
    this.listen('party:readyCheck', (p) => {
      if (p.active) sfx('ready_check');
      this.renderParty();
    });
    this.renderAll();
    window.clearInterval(this.poll);
    this.poll = window.setInterval(() => this.renderRooms(), 1500);
  }

  protected onClose(): void {
    window.clearInterval(this.poll);
    try {
      G.net.stopBrowsing();
    } catch {
      /* ignore */
    }
  }

  private renderAll(): void {
    this.renderRooms(true);
    this.renderParty();
  }

  /* ---------------------------------------------------------------- servers */

  private restartBrowsing(): void {
    try {
      G.net.stopBrowsing();
      G.net.startBrowsing({ transport: this.localTransport ? 'local' : undefined });
    } catch {
      /* ignore */
    }
    this.lastSig = '';
    this.renderRooms(true);
  }

  private refreshRooms(manual = false): void {
    if (manual) {
      sfx('ui_tab');
      this.refreshBtn.classList.add('is-spin');
      window.setTimeout(() => this.refreshBtn.classList.remove('is-spin'), 700);
      this.restartBrowsing();
      return;
    }
    this.renderRooms(true);
  }

  protected tick(dt: number): void {
    // ready-check countdown (the net module owns the deadline; we only mirror it)
    this.rcAcc += dt;
    if (this.rcAcc < 0.2) return;
    this.rcAcc = 0;
    this.paintReadyCheck();
  }

  private paintReadyCheck(): void {
    const rc = G.net.readyCheck;
    const on = !!rc?.active && G.net.isOnline;
    const me = G.net.peers.get(G.net.selfId);
    this.readyBanner.classList.toggle('is-hidden', !on);
    if (!on || !rc) return;
    const left = Math.max(0, rc.timeoutMs - (Date.now() - rc.startedAt));
    this.rcTitle.textContent = rc.by ? `${rc.by}: Hazır mısın?` : 'Hazır mısın?';
    this.rcTime.textContent = `${Math.ceil(left / 1000)} sn`;
    this.rcBar.style.width = `${Math.min(100, (left / Math.max(1, rc.timeoutMs)) * 100)}%`;
    const ready = !!me?.ready;
    this.rcBtn.style.display = ready ? 'none' : '';
    this.readyBanner.classList.toggle('is-ready', ready);
  }

  private renderRooms(force = false): void {
    if (!this.isOpen) return;
    let rooms: RoomInfo[] = [];
    try {
      rooms = G.net.listRooms() ?? [];
    } catch {
      rooms = [];
    }
    let signal: { open: number; total: number } | null = null;
    try {
      signal = G.net.signalStatus();
    } catch {
      signal = null;
    }
    const sig = JSON.stringify([rooms.map((r) => [r.roomId, r.players, r.maxPlayers, r.activity, r.keyLevel, r.name, r.inProgress, r.joinable, r.hostLevel]), signal, this.busy]);
    if (!force && sig === this.lastSig) return;
    this.lastSig = sig;
    this.listEl.innerHTML = '';
    this.countEl.textContent = rooms.length ? `${rooms.length} oda` : '';
    if (!rooms.length) {
      this.listEl.append(emptyState({ icon: '/assets/icons/ui-party.svg', title: 'Şu an açık oda yok', text: 'Kendi odanı kur ve kodu arkadaşlarınla paylaş.' }));
      if (signal && signal.total > 0) {
        this.listEl.append(h('div.pg-pt-signal' + (signal.open > 0 ? '.on' : ''), null, h('i'), signal.open > 0 ? `Sunuculara bağlı (${signal.open}/${signal.total}) · oda aranıyor...` : `Sunuculara bağlanılıyor (${signal.open}/${signal.total})...`));
      }
      return;
    }
    this.listEl.append(h('div.pg-pt-row.head', null, h('span', null, 'Oda'), h('span', null, 'Oyuncu'), h('span', null, 'Etkinlik'), h('span', null, 'Ping'), h('span')));
    const sorted = [...rooms].sort((a, b) => Number(isJoinable(b)) - Number(isJoinable(a)) || (a.ping ?? 999) - (b.ping ?? 999));
    for (const r of sorted) {
      const full = r.players >= r.maxPlayers;
      const incompatible = r.compatible === false;
      const inProg = r.inProgress === true;
      const blocked = full || incompatible || inProg || r.joinable === false;
      const label = full ? 'Dolu' : incompatible ? 'Sürüm' : inProg ? 'Oyunda' : 'Katıl';
      const joinBtn = button(label, () => void this.joinRoom(r), {
        variant: 'primary',
        disabled: blocked || this.busy,
        title: incompatible ? `Sürüm uyumsuz (oda: v${r.version})` : inProg ? 'Grup şu anda zindanda' : undefined,
      });
      const hostCls = r.hostClass ? CLASS_META[r.hostClass as ClassId] : undefined;
      const aff = h('span.pg-pt-aff');
      for (const id of (r.affixes ?? []).slice(0, 4)) {
        const av = affixView(id);
        const ic = icon(av.icon, 'pg-pt-affico');
        bindTip(ic, `<div class="pg-ttip"><div class="pg-ttip-name">${esc(av.name)}</div><div>${esc(av.desc)}</div></div>`);
        aff.append(ic);
      }
      this.listEl.append(
        h(
          'div.pg-pt-row' + (blocked ? '.is-full' : ''),
          null,
          h(
            'span.nm',
            null,
            h('b', null, r.name),
            h('small', null, hostCls ? icon(hostCls.icon, 'pg-pt-hcls') : null, `${r.hostName}${r.hostLevel ? ' · Sv. ' + r.hostLevel : ''} · ${r.roomId}`),
            r.hasPassword ? icon('/assets/icons/ui-lock.svg', 'pg-pt-lock') : null,
          ),
          h('span.pl', null, `${r.players}/${r.maxPlayers}`),
          h(
            'span.ac' + (r.activity === 'mythic' ? '.mythic' : ''),
            null,
            h('span', null, activityText(r)),
            aff.childElementCount ? aff : null,
            incompatible ? h('small.pg-bad', null, 'Sürüm uyumsuz') : r.minLevel ? h('small', null, `En az Sv. ${r.minLevel}`) : null,
          ),
          h('span.pg-pt-ping', { style: { color: pingColor(r.ping ?? 999) } }, r.ping != null ? `${Math.round(r.ping)} ms` : '-'),
          joinBtn,
        ),
      );
    }
  }

  private async joinRoom(r: RoomInfo): Promise<void> {
    if (this.busy) return;
    let password: string | undefined;
    if (r.hasPassword) {
      const pw = await this.promptText(`"${r.name}" odası şifreli. Şifreyi gir:`, 'Şifre');
      if (pw == null) return;
      password = pw;
    }
    await this.doJoin(r.roomId, password);
  }

  private async joinByCode(): Promise<void> {
    const code = this.codeIn.value.trim().toUpperCase();
    if (code.length < 3) {
      sfx('ui_error');
      return void toast('Geçerli bir oda kodu gir.', 'warning');
    }
    const known = G.net.listRooms().find((r) => r.roomId.toUpperCase() === code);
    let password: string | undefined;
    if (known?.hasPassword) {
      const pw = await this.promptText('Bu oda şifreli. Şifreyi gir:', 'Şifre');
      if (pw == null) return;
      password = pw;
    }
    await this.doJoin(code, password);
  }

  private async doJoin(code: string, password?: string): Promise<void> {
    this.busy = true;
    toast('Odaya bağlanılıyor...', 'info');
    try {
      await G.net.joinRoom(code, { password, transport: this.localTransport ? 'local' : undefined });
      if (G.net.isOnline) {
        sfx('party_join');
        toast('Odaya katıldın!', 'success');
      } else {
        // the net module already told the player why (version, full, wrong password...)
        sfx('ui_error');
        if (!G.net.lastError) toast('Odaya katılınamadı. Kodu ve şifreyi kontrol et.', 'error');
      }
    } catch (e) {
      console.warn('[party] join failed', e);
      sfx('ui_error');
      toast(G.net.lastError || 'Odaya katılınamadı. Kodu ve şifreyi kontrol et.', 'error');
    }
    this.busy = false;
    this.renderAll();
  }

  private async createRoom(): Promise<void> {
    if (this.busy) return;
    if (G.net.isOnline) return void toast('Zaten bir odadasın. Önce ayrıl.', 'warning');
    const name = this.nameIn.value.trim() || `${G.character?.save.name ?? 'Oyuncu'}'in Odası`;
    this.busy = true;
    toast('Oda kuruluyor...', 'info');
    try {
      const code = await G.net.hostRoom({ name, password: this.pwIn.value.trim() || undefined, maxPlayers: Number(this.maxPlayers), transport: this.localTransport ? 'local' : undefined });
      sfx('party_join');
      toast(code ? `Oda kuruldu! Kod: ${code}` : 'Oda kuruldu!', 'success');
    } catch (e) {
      console.warn('[party] host failed', e);
      sfx('ui_error');
      toast('Oda kurulamadı. Bağlantını kontrol et.', 'error');
    }
    this.busy = false;
    this.renderAll();
  }

  private promptText(text: string, placeholder: string): Promise<string | null> {
    return new Promise((resolve) => {
      const input = h('input.pg-input', { type: 'text', placeholder, maxLength: 24, autocomplete: 'off', style: { width: '100%', marginBottom: '14px' } }) as HTMLInputElement;
      const done = (v: string | null) => {
        layer.remove();
        resolve(v);
      };
      const layer = h(
        'div.pg-confirm',
        null,
        h('div.pg-confirm-box', null, h('p', null, text), input, h('div.pg-confirm-btns', null, button('Tamam', () => done(input.value), { variant: 'primary' }), button('Vazgeç', () => done(null), { variant: 'ghost' }))),
      );
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(input.value);
        if (e.key === 'Escape') {
          e.stopPropagation();
          done(null);
        }
      });
      this.el.append(layer);
      input.focus();
    });
  }

  /* ---------------------------------------------------------------- party */

  private members(): PeerInfo[] {
    const list = [...G.net.peers.values()];
    if (!list.some((p) => p.peerId === G.net.selfId) && G.character) {
      list.push({ peerId: G.net.selfId, slot: G.net.localSlot, name: G.character.save.name, summary: G.character.summary(), ready: true, ping: 0, isHost: G.net.role !== 'client', keystone: G.character.save.mythic.keystone, loadedScene: null });
    }
    return list.sort((a, b) => a.slot - b.slot);
  }

  private setReady(v: boolean): void {
    try {
      G.net.setReady(v);
    } catch {
      /* ignore */
    }
    sfx(v ? 'ready_check' : 'ui_click');
    this.renderParty();
  }

  private renderParty(): void {
    if (!this.isOpen) return;
    const net = G.net;
    const members = this.members();
    const me = members.find((p) => p.peerId === net.selfId);
    const online = net.isOnline;

    // status line
    this.statusEl.innerHTML = '';
    const roleTxt = net.isJoining ? 'Odaya bağlanılıyor...' : !online ? 'Çevrimdışı · tek başınasın' : net.role === 'host' ? 'Oda lideri sensin' : 'Odadasın';
    this.statusEl.append(h('span.pg-pt-role' + (online ? '.on' : ''), null, h('i'), roleTxt));
    if (online && net.roomId) {
      const copy = h('button.pg-pt-code', { type: 'button', title: 'Kopyala' }, h('small', null, 'ODA KODU'), h('b', null, net.roomId), h('span', null, '⧉')) as HTMLButtonElement;
      copy.addEventListener('click', () => {
        sfx('ui_click');
        try {
          void navigator.clipboard?.writeText(net.roomId ?? '');
          toast('Oda kodu kopyalandı.', 'success');
        } catch {
          toast(`Oda kodu: ${net.roomId}`, 'info');
        }
      });
      this.statusEl.append(copy);
    }

    // members
    this.membersEl.innerHTML = '';
    const iAmHost = net.role !== 'client';
    for (const p of members) {
      const cm = p.summary ? CLASS_META[p.summary.classId] : null;
      const tier = ratingTier(p.summary?.rating ?? 0);
      const isSelf = p.peerId === net.selfId;
      const key = p.keystone;
      const row = h(
        'div.pg-pt-member' + (isSelf ? '.is-self' : ''),
        { style: { '--cc': cm?.color ?? '#888' } },
        cm ? icon(cm.icon, 'pg-pt-cls') : h('span.pg-pt-cls'),
        h(
          'div.pg-pt-minfo',
          null,
          h('div.pg-pt-mname', null, p.isHost ? icon('/assets/icons/ui-crown.svg', 'pg-pt-crown') : null, h('b', { style: { color: cm?.color } }, p.name), isSelf ? h('small', null, ' (sen)') : null),
          h('div.pg-pt-msub', null, `${cm?.name ?? ''} · Sv. ${p.summary?.level ?? '?'} · EŞ ${p.summary?.itemLevel ?? '?'}`, h('span', { style: { color: tier.color, marginLeft: '8px' } }, `★ ${Math.round(p.summary?.rating ?? 0)}`)),
        ),
        key ? h('span.pg-pt-key', { title: 'Anahtar' }, icon('/assets/icons/item-keystone.svg'), `${DUNGEONS[key.dungeonId]?.shortName ?? key.dungeonId} +${key.level}`) : h('span'),
        h('span.pg-pt-ready' + (p.ready ? '.ok' : ''), null, p.ready ? '✓ Hazır' : '… Bekliyor'),
        h('span.pg-pt-ping', { style: { color: pingColor(p.ping) } }, isSelf ? '' : `${Math.round(p.ping)} ms`),
      );
      if (iAmHost && online && !isSelf) {
        const kick = h('button.pg-pt-kick', { type: 'button', title: 'Gruptan at' }, '✕') as HTMLButtonElement;
        kick.addEventListener('click', async () => {
          if (await askConfirm(this.el, `${p.name} gruptan atılsın mı?`, 'At', 'Vazgeç', true)) {
            try {
              G.net.kick(p.peerId);
            } catch {
              /* ignore */
            }
            sfx('party_leave');
            this.renderParty();
          }
        });
        row.append(kick);
      } else row.append(h('span'));
      this.membersEl.append(row);
    }
    for (let i = members.length; i < 5; i++) this.membersEl.append(h('div.pg-pt-member.is-empty', null, h('span.pg-dim', null, `Boş yuva ${i + 1}`)));

    // ready banner (mirrors G.net.readyCheck; counting down in tick())
    this.paintReadyCheck();

    // actions
    this.actionsEl.innerHTML = '';
    // UX-40: the finder is the front door to every instance (Zindan Bulucu, key I)
    this.actionsEl.append(button('Zindan Bulucu', () => G.ui.openPanel('finder'), { variant: 'normal', icon: '/assets/icons/ui-dungeon.svg' }));
    if (online) {
      this.actionsEl.append(
        button(me?.ready ? 'Hazır Değilim' : 'Hazırım', () => this.setReady(!me?.ready), { variant: me?.ready ? 'ghost' : 'primary', icon: '/assets/icons/ui-check.svg' }),
        ...(iAmHost ? [button('Hazır Kontrolü', () => { sfx('ready_check'); G.net.startReadyCheck(); }, { variant: 'normal', icon: '/assets/icons/ui-party.svg' })] : []),
        button('Odadan Ayrıl', async () => {
          if (await askConfirm(this.el, 'Odadan ayrılmak istediğine emin misin?', 'Ayrıl', 'Kal', true)) {
            G.net.leaveRoom();
            sfx('party_leave');
            this.renderAll();
          }
        }, { variant: 'danger', icon: '/assets/icons/ui-exit.svg' }),
      );
    } else if (net.isJoining) {
      this.actionsEl.append(button('Bağlantıyı İptal Et', () => G.net.leaveRoom(), { variant: 'ghost' }));
    } else {
      this.actionsEl.append(h('p.pg-dim.pg-small', null, 'Grupla oynamak için bir oda kur ya da soldaki listeden bir odaya katıl. En fazla 5 kişi.'));
    }
    void esc;
  }
}

function isJoinable(r: RoomInfo): boolean {
  return r.players < r.maxPlayers && r.compatible !== false && r.inProgress !== true && r.joinable !== false;
}
