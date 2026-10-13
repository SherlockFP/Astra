import { G } from '../../../game/G';
import { getGuild, type GuildInfo, type GuildMemberView, type GuildResult } from '../../../systems/Guild';
import { GUILD, RANK_NAMES, canDemote, canDisband, canInvite, canKick, canPromote } from '../../../systems/GuildCore';
import { classColor } from '../../widgets/classColors';
import { GamePanel, askConfirm, button, fmtInt, h, sfx, toast, windowFrame } from './base';
import '../../styles/panels-guild.css';

/**
 * `guild` - "Lonca" (WP-05): create / roster / invite / leave. The roster shows rank and online status (from the lobby presence),
 * with promote, demote and remove buttons that only appear for the ranks allowed to use them (Lider: everything; Subay: invite and
 * remove Üye; Üye: leave). Every action goes through systems/Guild.ts, which signs and verifies; this panel only renders and asks.
 * ElvUI language (docs/UI_WOW_CLASSIC.md): flat neutral backdrops, 1 px black borders, square, normal case, class-coloured names.
 * Opened with /lonca or from the game menu. OWNER: panels-game module.
 */

const RANK_CLS = ['gd-r0', 'gd-r1', 'gd-r2'] as const;

export class GuildPanel extends GamePanel {
  private bodyEl!: HTMLElement;
  private footEl!: HTMLElement;
  private queued = false;
  private nameInput = '';
  private inviteInput = '';

  constructor() {
    super('guild', { backdropClose: false, modal: false });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({
      title: 'Lonca', icon: '/assets/icons/ui-party.svg', cls: 'gd-win', size: 'M', onClose: () => this.requestClose(),
      hints: ['/l mesaj: lonca sohbeti', '/lonca: komutlar'],
    });
    this.bodyEl = h('div.gd');
    this.footEl = h('div.gd-foot');
    body.append(this.bodyEl);
    foot.append(this.footEl);
    this.el.append(win);
  }

  protected onOpen(): void {
    const g = getGuild();
    g.start(); // join the lobby (no-op when already connected)
    this.listen('guild:changed', () => this.queueRender());
    this.listen('presence:changed', () => this.queueRender());
    this.listen('player:gold', () => this.queueRender());
    this.render();
  }

  private queueRender(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      if (this.isOpen) this.render();
    });
  }

  private fail(r: GuildResult): void {
    if (r.ok) return;
    toast(r.reason, 'warning');
    sfx('ui_error');
  }

  private render(): void {
    const g = getGuild();
    this.bodyEl.textContent = '';
    this.footEl.textContent = '';
    const info = g.info();
    if (!info) this.renderNone();
    else this.renderGuild(info);
    this.footEl.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
  }

  /* ------------------------------------------------------------------------ no guild */

  private renderNone(): void {
    const g = getGuild();
    const ch = G.character;
    const inv = g.pendingInvite();
    if (inv) {
      this.bodyEl.append(
        h(
          'div.gd-invite',
          null,
          h('div.gd-invite-txt', null, h('b', null, inv.from), ' seni ', h('b.gd-tag', null, `<${inv.guild}>`), ' loncasına davet ediyor.'),
          inv.accepted
            ? h('span.gd-dim', null, 'Yanıt gönderildi, onay bekleniyor...')
            : h(
                'div.gd-invite-btns',
                null,
                button('Kabul Et', () => void g.acceptInvite().then((r) => this.fail(r)), { variant: 'primary' }),
                button('Reddet', () => void g.declineInvite().then((r) => this.fail(r)), { variant: 'ghost' }),
              ),
        ),
      );
    }
    const level = ch?.save.level ?? 1;
    const gold = ch?.save.gold ?? 0;
    const why = level < GUILD.MIN_LEVEL ? `Lonca kurmak için Sv ${GUILD.MIN_LEVEL} gerekir.` : gold < GUILD.CREATE_COST ? 'Yeterli altın yok.' : '';
    const input = h('input.gd-input', { type: 'text', maxlength: GUILD.NAME_MAX, placeholder: 'Lonca adı (3-20 karakter)', autocomplete: 'off' }) as HTMLInputElement;
    input.value = this.nameInput;
    this.stopKeys(input);
    input.addEventListener('input', () => { this.nameInput = input.value; });
    const create = button(`Lonca Kur (${fmtInt(GUILD.CREATE_COST)} altın)`, () => void this.create(), { variant: 'primary', disabled: !!why });
    if (why) create.title = why;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !why) void this.create();
    });
    this.bodyEl.append(
      h('div.gd-head', null, h('span.gd-name.gd-dim', null, 'Bir loncan yok')),
      h(
        'div.gd-box',
        null,
        h('p', null, 'Lonca; arkadaşlarınla ortak bir isim, üye listesi ve özel bir sohbet kanalı paylaşmanı sağlar. Adın oyuncuların isminin altında <Lonca Adı> olarak görünür.'),
        h('p.gd-dim', null, `Kurmak için Sv ${GUILD.MIN_LEVEL} ve ${fmtInt(GUILD.CREATE_COST)} altın gerekir (Sv ${level}, ${fmtInt(gold)} altın). Rütbeler: Lider, Subay, Üye. En çok ${GUILD.MAX_MEMBERS} üye.`),
        h('div.gd-bar', null, input, create),
        h('p.gd-dim', null, 'Katılmak için bir Lider ya da Subay\'ın seni davet etmesi gerekir. Davet gelince bir pencere açılır (/lonca kabul, /lonca red).'),
      ),
    );
  }

  private async create(): Promise<void> {
    const r = await getGuild().create(this.nameInput);
    if (!r.ok) this.fail(r);
    else {
      sfx('ui_open', 0.8);
      this.nameInput = '';
    }
    this.queueRender();
  }

  /* ------------------------------------------------------------------------ member of a guild */

  private renderGuild(i: GuildInfo): void {
    const g = getGuild();
    const online = i.members.filter((m) => m.online).length;
    this.bodyEl.append(
      h(
        'div.gd-head',
        null,
        h('span.gd-name', null, `<${i.name}>`),
        h('span.gd-sub', null, `Lider: ${i.leader} · ${i.members.length}/${i.max} üye · ${online} çevrimiçi · Sen: ${RANK_NAMES[i.rank]}`),
        h('span.gd-ver', null, `sürüm ${i.rev}`),
      ),
    );
    if (!i.keyReady) this.bodyEl.append(h('div.gd-warn', null, 'Lonca sohbet anahtarı bekleniyor (başka bir üye çevrimiçi olunca gelir). /l o zamana kadar çalışmaz.'));

    const bar = h('div.gd-bar');
    if (canInvite(i.rank)) {
      const input = h('input.gd-input', { type: 'text', maxlength: 20, placeholder: 'Davet edilecek oyuncu', autocomplete: 'off' }) as HTMLInputElement;
      input.value = this.inviteInput;
      this.stopKeys(input);
      input.addEventListener('input', () => { this.inviteInput = input.value; });
      const go = (): void => {
        const name = input.value.trim();
        if (!name) return;
        void g.invite(name).then((r) => {
          if (r.ok) {
            this.inviteInput = '';
            input.value = '';
            sfx('ui_click');
          } else this.fail(r);
        });
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') go();
      });
      bar.append(input, button('Davet Et', go, { variant: 'primary' }));
    } else bar.append(h('span.gd-dim', null, 'Davet için Lider veya Subay olmalısın.'));
    bar.append(h('span.gd-grow'));
    if (canDisband(i.rank)) bar.append(button('Loncayı Dağıt', () => void this.confirmDisband(i), { variant: 'danger' }));
    else bar.append(button('Loncadan Ayrıl', () => void this.confirmLeave(i), { variant: 'danger' }));
    this.bodyEl.append(bar);

    const table = h('div.gd-table');
    table.append(h('div.gd-th', null, h('span', null, 'Ad'), h('span', null, 'Rütbe'), h('span', null, 'Sv'), h('span', null, 'Durum'), h('span', null, 'Konum'), h('span', null, '')));
    const rows = h('div.gd-rows.pg-scroll');
    for (const m of i.members) rows.append(this.row(i, m));
    table.append(rows);
    this.bodyEl.append(table);
  }

  private row(i: GuildInfo, m: GuildMemberView): HTMLElement {
    const g = getGuild();
    const name = h('span.gd-cell.gd-nm', null, m.name);
    if (m.cls) name.style.color = classColor(m.cls);
    if (m.self) name.append(h('em', null, ' (sen)'));
    const acts = h('span.gd-acts');
    if (!m.self) {
      if (canPromote(i.rank, m.rank)) acts.append(this.mini('▲', 'Subay yap', () => void g.promote(m.name).then((r) => this.fail(r))));
      if (canDemote(i.rank, m.rank)) acts.append(this.mini('▼', 'Üye yap', () => void g.demote(m.name).then((r) => this.fail(r))));
      if (canKick(i.rank, m.rank)) acts.append(this.mini('✕', 'Loncadan çıkar', () => void this.confirmKick(m)));
    }
    const row = h(
      'div.gd-tr' + (m.online ? '' : '.is-off'),
      null,
      name,
      h(`span.gd-cell.${RANK_CLS[m.rank]}`, null, m.rankName),
      h('span.gd-cell', null, m.online && m.lvl ? String(m.lvl) : '-'),
      h('span.gd-cell', null, h('i.gd-dot' + (m.online ? '.on' : '')), m.online ? 'Çevrimiçi' : 'Çevrimdışı'),
      h('span.gd-cell.gd-dim', null, m.online ? m.zone || '' : ''),
      acts,
    );
    return row;
  }

  private mini(label: string, title: string, fn: () => void): HTMLButtonElement {
    const b = button(label, fn, { variant: 'ghost', cls: 'gd-mini', title });
    return b;
  }

  private async confirmKick(m: GuildMemberView): Promise<void> {
    if (!(await askConfirm(this.el, `${m.name} loncadan çıkarılsın mı? Sohbet anahtarı yenilenecek.`, 'Çıkar', 'Vazgeç', true))) return;
    this.fail(await getGuild().kick(m.name));
  }

  private async confirmLeave(i: GuildInfo): Promise<void> {
    if (!(await askConfirm(this.el, `<${i.name}> loncasından ayrılmak istiyor musun?`, 'Ayrıl', 'Vazgeç', true))) return;
    this.fail(await getGuild().leave());
  }

  private async confirmDisband(i: GuildInfo): Promise<void> {
    if (!(await askConfirm(this.el, `<${i.name}> loncası herkes için dağıtılacak. Bu geri alınamaz. Emin misin?`, 'Dağıt', 'Vazgeç', true))) return;
    this.fail(await getGuild().disband());
  }

  private stopKeys(el: HTMLElement): void {
    // never let a key reach the game while typing
    el.addEventListener('keydown', (e) => e.stopPropagation());
    el.addEventListener('keyup', (e) => e.stopPropagation());
  }
}
