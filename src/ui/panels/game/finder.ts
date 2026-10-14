import { G } from '../../../game/G';
import type { DungeonDef, BossPlacement } from '../../../types/dungeons';
import type { KeystoneData } from '../../../types/items';
import type { RunRecord } from '../../../types/mythic';
import type { ClassId } from '../../../types/common';
import type { RoleId, SpecId } from '../../../types/v2';
import type { LfgListing } from '../../../net/messages';
import type { RoomInfo } from '../../../net/NetSession';
import { DUNGEONS } from '../../../data/dungeons';
import { BOSSES } from '../../../data/enemyKit';
import { buildChrome, buildTabs, chip, emptyState, iconEl, type Chrome, type TabsApi } from '../../kit';
import { CLASS_META, GamePanel, affixChips, affixesForLevel, dungeonArt, dungeonName, h, mmss, openPanel, ratingTier, sfx, toast } from './base';
import { isUnderGeared, recommendedIlvl, type LadderDiff } from './ladder';
import {
  DIFF_NAME, FINDER_DIFFS, GROUP_SIZE, ROLE_GLYPH, ROLE_ORDER, ROLE_TR, allowedRoles, defaultRoles, diffRows, finderDungeons, joinBlocker,
  listingFor, lfgRows, memberGate, needFor, openSlots, recommendedDungeon, rowGateText, type DiffContext, type DiffRow, type LfgFilter,
} from './finderModel';
import { buildParams, partyLevels, startRun } from './runStart';
import { FissureTab } from './finderFissure';
import { PvpTab } from './finderPvp';
import { devUnlockOn } from '../../../systems/BetaTest';
import type { DungeonParams } from '../../../scenes/scenes';
import '../../styles/panels-finder.css';

/**
 * Zindan Bulucu (key I, `finder`, UI_REDESIGN section 6 / UX-40). Tabs Zindan · Kadim Yarıklar · Raid · Gruplar. The Zindan tab lists the
 * dungeons (levelling set + Mitik+ season pool), the detail pane holds the role row, difficulty selector, rewards and the
 * collapsed Mitik+ rating card; the footer picks the mode (Tek Başına / Grubumla / Grup Ara) and starts the run.
 * Rules live in finderModel.ts, the run start in runStart.ts. OWNER: panels-game module.
 */

type Tab = 'dungeons' | 'fissure' | 'raid' | 'pvp' | 'groups';
type Mode = 'solo' | 'party' | 'lfg';
type QState = 'idle' | 'listing' | 'proposal' | 'entering' | 'inrun' | 'failed';

interface Pending {
  def: DungeonDef;
  diff: LadderDiff;
  keyLevel: number;
  owner: string;
}

interface Listing {
  def: DungeonDef;
  diff: LadderDiff;
  keyLevel: number;
}

interface Primary {
  label: string;
  show: boolean;
  disabled: boolean;
  reason: string;
  run: () => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'dungeons', label: 'Zindan' },
  { id: 'fissure', label: 'Kadim Yarıklar' },
  { id: 'raid', label: 'Raid' },
  { id: 'pvp', label: 'Oyuncuya Karşı' },
  { id: 'groups', label: 'Gruplar' },
];
const MODES: { id: Mode; label: string }[] = [
  { id: 'solo', label: 'Tek Başına' },
  { id: 'party', label: 'Grubumla' },
  { id: 'lfg', label: 'Grup Ara' },
];
const PIP: Record<LadderDiff, string> = { normal: 'N', heroic: 'K', mythic: 'M', mythicplus: 'M+' };
const KEYS_HINTS = ['↑↓: zindan', '←→: zorluk', 'Enter: başla'];
const GROUP_HINTS = ['Katıl: listedeki satırdan'];
const FISSURE_HINTS = ['Tema ve zorluk seç', 'Yeniden Çevir: yeni yarık'];
const PVP_HINTS = ['Kartta: Kuyruğa Gir / Kuyruktan Çık', 'Sıralama: ayrıntılı tablo'];
const REWARDS: Record<LadderDiff, string[]> = {
  normal: ['Eşya', 'Deneyim (XP)', 'Altın'],
  heroic: ['Eşya', 'Deneyim (XP)', 'Altın', 'Set eşyası'],
  mythic: ['Eşya', 'Deneyim (XP)', 'Altın', 'İlk Mitik+ anahtarı'],
  mythicplus: ['Eşya', 'Deneyim (XP)', 'Altın', 'Anahtar yükseltme'],
};
const NOOP = (): void => undefined;

/** keystone.ts `?unlock` tester switch (skips the clear requirements only). */
const CLEAR_GATES_OFF = ((): boolean => {
  try {
    return new URLSearchParams(window.location.search).has('unlock') || window.localStorage.getItem('efsun.unlock') === '1';
  } catch {
    return false;
  }
})();
/** The Kadim Yarıklar tab (procedural rifts) is hidden for everyone but the dev tester switch (`?unlock` / efsun.unlock). */
const FISSURE_TAB_ON = devUnlockOn();

export class FinderPanel extends GamePanel {
  private chrome!: Chrome;
  private tabs!: TabsApi;
  private split!: HTMLElement;
  private listEl!: HTMLElement;
  private detailEl!: HTMLElement;
  private groupsEl!: HTMLElement;
  private raidEl!: HTMLElement;
  private fissure!: FissureTab;
  private pvp!: PvpTab;
  private pvpPoll = 0;
  private strip!: HTMLElement;
  private modeBtns = new Map<Mode, HTMLButtonElement>();
  private statusEl!: HTMLElement;
  private partyEl!: HTMLElement;
  private primaryBtn!: HTMLButtonElement;
  private primaryRun: () => void = NOOP;

  private tab: Tab = 'dungeons';
  private mode: Mode = 'solo';
  private selId = '';
  private selDiff: LadderDiff = 'normal';
  private roles: RoleId[] = ['dps'];
  private rolesManual = false;
  private mplusOpen = false;
  private queue: { state: QState; dungeonId?: string; since?: number } = { state: 'idle' };
  private listing: Listing | null = null;
  private lastNeed = '';
  private pending: Pending | null = null;
  private filter: LfgFilter = { dungeon: '', diff: '', role: '', noPassword: false };
  private poll = 0;
  private onKey = (e: KeyboardEvent): void => this.keyNav(e);

  constructor() {
    super('finder');
  }

  protected build(): void {
    const c = buildChrome({
      title: 'Zindan Bulucu',
      icon: '/assets/icons/ui-dungeon.svg',
      keyAction: 'groupFinder',
      size: 'L',
      hints: KEYS_HINTS,
      onClose: () => this.requestClose(),
    });
    this.chrome = c;
    this.tabs = buildTabs(FISSURE_TAB_ON ? TABS : TABS.filter((t) => t.id !== 'fissure'), (id) => this.setTab(id as Tab), 'dungeons');
    c.tabsHost.append(this.tabs.el);

    this.listEl = h('div.fd-list.k-scroll');
    this.detailEl = h('div.fd-detail.k-scroll');
    this.split = h('div.fd-split', null, this.listEl, this.detailEl);
    this.groupsEl = h('div.fd-groups');
    this.raidEl = h('div.fd-raid');
    this.fissure = new FissureTab({
      rerender: () => this.render(),
      inDungeon: () => this.inDungeon(),
      launch: (params, label) => this.launchFissure(params, label),
    });
    this.pvp = new PvpTab({ openRank: () => openPanel('arenaRank') });

    for (const m of MODES) {
      const b = h('button.k-btn.fd-mode', { type: 'button' }, m.label) as HTMLButtonElement;
      b.addEventListener('click', () => this.setMode(m.id));
      this.modeBtns.set(m.id, b);
    }
    this.statusEl = h('div.fd-status');
    this.partyEl = h('div.fd-party');
    const modeWrap = h('div.fd-modes', null, ...Array.from(this.modeBtns.values()));
    this.strip = h('div.fd-strip', null, h('div.fd-strip-top', null, modeWrap, this.statusEl), this.partyEl);

    this.primaryBtn = h('button.k-btn.k-btn--primary.k-btn--lg', { type: 'button' }) as HTMLButtonElement;
    this.primaryBtn.addEventListener('click', () => this.primaryRun());
    const closeBtn = h('button.k-btn.k-btn--ghost', { type: 'button' }, 'Kapat') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.requestClose());
    c.btnsEl.append(this.primaryBtn, closeBtn);
    c.root.insertBefore(this.strip, c.foot);
    this.el.append(c.root);

    // events that matter while the panel is closed too (a ready check can end after the window was shut)
    try {
      G.events.on('party:readyCheck', (p) => this.onReadyCheck(p.active));
      G.events.on('scene:changed', (p) => this.onScene(p.to));
    } catch {
      /* no event bus (dev) */
    }
  }

  protected onOpen(data?: unknown): void {
    const d = (data ?? {}) as { dungeonId?: string; tab?: Tab };
    this.fissure.open();
    if (!this.rolesManual) this.roles = defaultRoles(G.character?.save.spec as SpecId | undefined);
    const list = finderDungeons();
    if (d.dungeonId && list.some((x) => x.id === d.dungeonId)) this.selId = d.dungeonId;
    if (!list.some((x) => x.id === this.selId)) this.selId = (recommendedDungeon(list, G.character?.level ?? 1) ?? list[0])?.id ?? '';
    this.pickDiff();
    this.mode = this.queue.state === 'listing' ? 'lfg' : G.net.inParty && G.net.partyRemotePeers().length > 0 ? 'party' : 'solo';
    for (const ev of ['net:status', 'keystone:changed', 'player:levelup'] as const) this.listen(ev, () => this.render());
    this.listen('party:changed', () => {
      this.refreshListingNeed();
      this.render();
    });
    this.listen('net:rooms', () => {
      if (this.tab === 'groups') this.renderGroups();
    });
    window.addEventListener('keydown', this.onKey);
    this.setTab(d.tab ?? this.tab);
  }

  protected onClose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.stopBrowsing();
    this.stopPvpPoll();
  }

  /* ------------------------------------------------------------ state helpers */

  private ctx(): DiffContext | null {
    const ch = G.character;
    if (!ch) return null;
    const party: KeystoneData[] = [];
    if (G.net.isPartyLeader) {
      for (const p of G.net.partyMembers()) {
        const k = p.keystone;
        if (p.peerId !== G.net.selfId && k) party.push(k);
      }
    }
    return { ch, level: ch.level, party, avgLevel: partyLevels().avgLevel, clearGatesOff: CLEAR_GATES_OFF };
  }

  private inDungeon(): boolean {
    return G.scenes?.current?.id === 'dungeon';
  }

  private isLeader(): boolean {
    return !G.net.inParty || G.net.isPartyLeader;
  }

  /** The key the run would use for this dungeon: the own key, else (leader only) a member's key for the same dungeon. */
  private keyHolder(def: DungeonDef): { key: KeystoneData; owner: string } | null {
    const own = G.character?.save.mythic.keystone ?? null;
    if (own && own.dungeonId === def.id) return { key: own, owner: G.net.selfId };
    if (G.net.isPartyLeader) {
      for (const p of G.net.partyMembers()) {
        const k = p.keystone;
        if (p.peerId !== G.net.selfId && k && k.dungeonId === def.id) return { key: k, owner: p.peerId };
      }
    }
    return null;
  }

  /** Keeps the difficulty if it is still startable for the selected dungeon, else takes the first startable one. */
  private pickDiff(): void {
    const def = DUNGEONS[this.selId];
    const ctx = this.ctx();
    if (!def || !ctx) return;
    const rows = diffRows(def, ctx);
    const cur = rows.find((r) => r.diff === this.selDiff);
    if (cur?.startable) return;
    this.selDiff = (rows.find((r) => r.startable) ?? rows[0])?.diff ?? 'normal';
  }

  private setQueue(state: QState, dungeonId?: string): void {
    this.queue = { state, dungeonId, since: Date.now() };
    try {
      G.events?.emit('finder:queue', { state, dungeonId, since: this.queue.since });
    } catch {
      /* ignore */
    }
  }

  private onReadyCheck(active: boolean): void {
    if (active || !this.pending) return;
    const pend = this.pending;
    this.pending = null;
    if (G.net.readyCheck?.result?.ok) this.launch(pend);
    else this.setQueue('idle');
    if (this.isOpen) this.render();
  }

  private onScene(to: string): void {
    if (to === 'dungeon') {
      // a run started (by us or by the party): the listing is over, the queue shows the run
      if (this.listing) {
        this.listing = null;
        try {
          G.net.setLfg(null);
        } catch {
          /* ignore */
        }
      }
      if (['entering', 'proposal', 'listing'].includes(this.queue.state)) this.setQueue('inrun', this.queue.dungeonId);
    } else if (this.queue.state === 'inrun' || this.queue.state === 'entering') {
      this.setQueue('idle');
    }
    if (this.isOpen) this.render();
  }

  /* ------------------------------------------------------------ actions */

  private setTab(id: Tab): void {
    if (id === 'fissure' && !FISSURE_TAB_ON) id = 'dungeons';
    this.tab = id;
    this.tabs.select(id, true);
    if (id === 'groups') this.startBrowsing();
    else this.stopBrowsing();
    if (id === 'pvp') this.startPvpPoll();
    else this.stopPvpPoll();
    this.render();
  }

  /** The PvP tab refreshes its timers and buttons once a second while it is the visible tab. */
  private startPvpPoll(): void {
    if (!this.pvpPoll) this.pvpPoll = window.setInterval(() => this.isOpen && this.tab === 'pvp' && this.pvp.tick(), 1000);
  }

  private stopPvpPoll(): void {
    if (this.pvpPoll) {
      window.clearInterval(this.pvpPoll);
      this.pvpPoll = 0;
    }
  }

  private setMode(m: Mode): void {
    if (m === this.mode) return;
    sfx('ui_tab');
    this.mode = m;
    this.render();
  }

  private select(id: string): void {
    this.selId = id;
    this.pickDiff();
    sfx('ui_tab');
    this.render();
  }

  private startBrowsing(): void {
    try {
      G.net.startBrowsing();
    } catch {
      /* ignore */
    }
    if (!this.poll) this.poll = window.setInterval(() => this.isOpen && this.tab === 'groups' && this.renderGroups(), 1500);
  }

  private stopBrowsing(): void {
    if (this.poll) {
      window.clearInterval(this.poll);
      this.poll = 0;
    }
    try {
      G.net.stopBrowsing();
    } catch {
      /* ignore */
    }
  }

  /** Starts the run for the selected dungeon: the leader with peers runs a ready check first, otherwise it starts at once. */
  private startSelected(def: DungeonDef, diff: LadderDiff): void {
    const holder = diff === 'mythicplus' ? this.keyHolder(def) : null;
    const pend: Pending = { def, diff, keyLevel: holder?.key.level ?? 0, owner: holder?.owner ?? G.net.selfId };
    if (this.mode === 'party' && G.net.inParty && G.net.partyRemotePeers().length > 0) {
      if (G.net.readyCheck?.active) return;
      this.pending = pend;
      this.setQueue('proposal', def.id);
      G.net.startReadyCheck(`${def.name} · ${DIFF_NAME[diff]}`);
      this.render();
      return;
    }
    this.launch(pend);
  }

  private launch(p: Pending): void {
    if (this.listing) {
      this.listing = null;
      try {
        G.net.setLfg(null);
      } catch {
        /* ignore */
      }
    }
    const params = buildParams(p.def, p.diff, { keyLevel: p.keyLevel, keyOwner: p.owner });
    sfx(p.diff === 'mythicplus' ? 'keystone_insert' : 'portal_enter');
    toast(`${p.def.name} · ${DIFF_NAME[p.diff]}`, 'info');
    this.setQueue('entering', p.def.id);
    if (startRun(params)) this.requestClose();
    else this.setQueue('failed', p.def.id);
  }

  /** Kadim Yarık: the host (or an offline player) opens the generated map through the same path as every other run. */
  private launchFissure(params: DungeonParams, label: string): void {
    sfx('portal_enter');
    toast(label, 'info');
    this.setQueue('entering', params.dungeonId);
    if (startRun(params)) this.requestClose();
    else this.setQueue('failed', params.dungeonId);
  }

  /** Grup Ara: a solo player hosts a room first; the listing carries the open slots by role. */
  private async startLfg(def: DungeonDef, diff: LadderDiff): Promise<void> {
    if (G.net.inParty && !G.net.isPartyLeader) {
      toast('Grubu yalnızca lider listeleyebilir.', 'warning');
      return;
    }
    const holder = diff === 'mythicplus' ? this.keyHolder(def) : null;
    if (diff === 'mythicplus' && !holder) {
      toast('Bu anahtarla yalnızca oda lideri başlatabilir.', 'warning');
      return;
    }
    if (!G.net.inParty) {
      const code = await G.net.hostRoom({ name: `Zindan: ${def.name} (${DIFF_NAME[diff]})`, maxPlayers: GROUP_SIZE });
      if (!code) return;
    }
    this.listing = { def, diff, keyLevel: holder?.key.level ?? 0 };
    this.setQueue('listing', def.id);
    this.refreshListingNeed(true);
    toast(`Grup aranıyor: ${def.name} (${DIFF_NAME[diff]})`, 'info');
    this.render();
  }

  private stopLfg(): void {
    this.listing = null;
    try {
      G.net.setLfg(null);
    } catch {
      /* ignore */
    }
    this.setQueue('idle');
    this.render();
  }

  /** Re-announces the listing when the party changes (open slots follow the members' roles). */
  private refreshListingNeed(force = false): void {
    if (!this.listing || this.queue.state !== 'listing' || !G.net.inParty || !G.net.isPartyLeader) return;
    const members: RoleId[][] = [this.roles];
    for (const p of G.net.partyRemotePeers()) members.push([p.summary?.role ?? 'dps']);
    const l = this.listing;
    const lf: LfgListing = listingFor(l.def, l.diff, l.keyLevel, members);
    const key = JSON.stringify([lf.dungeon, lf.diff, lf.need]);
    if (!force && key === this.lastNeed) return;
    this.lastNeed = key;
    try {
      G.net.setLfg(lf);
    } catch (e) {
      console.warn('[finder] setLfg failed', e);
    }
  }

  private toggleRole(r: RoleId): void {
    const allowed = allowedRoles(G.character?.classId as ClassId | undefined);
    if (!allowed.includes(r)) return;
    this.rolesManual = true;
    const on = this.roles.includes(r);
    if (on && this.roles.length === 1) return; // at least one role
    this.roles = on ? this.roles.filter((x) => x !== r) : ROLE_ORDER.filter((x) => x === r || this.roles.includes(x));
    sfx('ui_tab', 0.6);
    this.refreshListingNeed();
    this.render();
  }

  private joinRoom(r: RoomInfo): void {
    sfx('ui_click', 0.6);
    G.net.joinRoom(r.roomId).catch((e: unknown) => console.warn('[finder] joinRoom failed', e));
  }

  /* ------------------------------------------------------------ keyboard */

  private keyNav(e: KeyboardEvent): void {
    if (!this.isOpen || this.tab !== 'dungeons') return;
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    const list = finderDungeons();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const i = list.findIndex((d) => d.id === this.selId);
      const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next && next.id !== this.selId) this.select(next.id);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const def = DUNGEONS[this.selId];
      const ctx = this.ctx();
      if (!def || !ctx) return;
      const rows = diffRows(def, ctx).filter((r) => r.startable);
      const i = rows.findIndex((r) => r.diff === this.selDiff);
      const next = rows[i + (e.key === 'ArrowRight' ? 1 : -1)];
      if (next) {
        this.selDiff = next.diff;
        sfx('ui_tab', 0.6);
        this.render();
      }
    } else if (e.key === 'Enter') {
      if (this.primaryBtn.disabled || this.primaryBtn.hidden) return;
      this.primaryRun();
    } else return;
    e.preventDefault();
  }

  /* ------------------------------------------------------------ render */

  private render(): void {
    if (!this.isOpen) return;
    const c = this.chrome;
    c.body.textContent = '';
    this.strip.hidden = this.tab !== 'dungeons';
    c.setHints(this.tab === 'groups' ? GROUP_HINTS : this.tab === 'fissure' ? FISSURE_HINTS : this.tab === 'pvp' ? PVP_HINTS : KEYS_HINTS);
    if (this.tab === 'dungeons') this.renderDungeons();
    else if (this.tab === 'pvp') {
      c.body.append(this.pvp.el);
      this.pvp.render();
    } else if (this.tab === 'fissure') {
      c.body.append(this.fissure.el);
      this.fissure.render();
    } else if (this.tab === 'groups') {
      c.body.append(this.groupsEl);
      this.renderGroups();
    } else this.renderRaid();
    this.renderFooter();
  }

  private renderDungeons(): void {
    this.chrome.body.append(this.split);
    const ctx = this.ctx();
    if (!ctx) {
      this.listEl.textContent = '';
      this.detailEl.textContent = '';
      this.detailEl.append(emptyState({ icon: '/assets/icons/ui-dungeon.svg', title: 'Karakter yok', text: 'Zindan Bulucu bir karakterle açılır.' }));
      return;
    }
    const list = finderDungeons();
    this.renderList(list, ctx);
    const def = DUNGEONS[this.selId];
    if (def) this.renderDetail(def, ctx);
    else {
      this.detailEl.textContent = '';
      this.detailEl.append(emptyState({ icon: '/assets/icons/ui-dungeon.svg', title: 'Zindan yok', text: 'Listede gösterilecek zindan bulunamadı.' }));
    }
  }

  private renderList(list: DungeonDef[], ctx: DiffContext): void {
    const el = this.listEl;
    el.textContent = '';
    const il = G.character?.itemLevel() ?? 0;
    const cls = G.character ? CLASS_META[G.character.classId]?.name ?? '' : '';
    el.append(h('div.fd-who', null, `Sv. ${ctx.level} · EŞ ${il}${cls ? ` · ${cls}` : ''}`));
    const rec = recommendedDungeon(list, ctx.level);
    if (rec) {
      el.append(h('div.fd-h', null, 'ÖNERİLEN'), this.dungeonCard(rec, ctx));
    }
    el.append(h('div.fd-h', null, 'ZİNDANLAR'));
    for (const d of list) el.append(this.dungeonCard(d, ctx));
  }

  private dungeonCard(def: DungeonDef, ctx: DiffContext): HTMLElement {
    const rows = diffRows(def, ctx);
    const [lo, hi] = def.levelRange ?? [1, 1];
    const locked = !rows.some((r) => r.startable);
    const pips = rows.map((r) => {
      const state = r.st.kind === 'cleared' ? 'is-cleared' : r.startable ? 'is-open' : 'is-locked';
      const sym = r.st.kind === 'cleared' ? '✓' : r.startable ? '◆' : '◇';
      return h(`span.fd-pip.${state}`, { title: `${r.name}: ${r.line3}` }, `${sym}${PIP[r.diff]}`);
    });
    const card = h(
      'button.fd-card' + (def.id === this.selId ? '.is-sel' : '') + (locked ? '.is-locked' : ''),
      { type: 'button' },
      h('div.fd-art', { style: { backgroundImage: `url("${dungeonArt(def)}")` } }),
      h(
        'div.fd-ctext',
        null,
        h('b', null, def.name),
        h('small', null, `Sv. ${lo}–${hi} · EŞ ${recommendedIlvl(def, 'normal')} · ${mmss(def.timerSec ?? 0)}`),
        h('div.fd-pips', null, ...pips),
      ),
    ) as HTMLButtonElement;
    card.addEventListener('click', () => this.select(def.id));
    return card;
  }

  private renderDetail(def: DungeonDef, ctx: DiffContext): void {
    const el = this.detailEl;
    el.textContent = '';
    const rows = diffRows(def, ctx);
    const row = rows.find((r) => r.diff === this.selDiff) ?? rows[0];
    if (!row) return;
    el.append(this.roleRow(), this.banner(def), h('p.fd-lore', null, def.lore ?? ''));
    el.append(h('div.fd-h', null, 'ZORLUK'), this.diffGrid(def, rows, row));
    el.append(this.lines(def, row));
    el.append(this.bossRow(def));
    const keyLevel = row.st.key?.level ?? 0;
    if (row.diff === 'mythicplus' && keyLevel) el.append(h('div.fd-h', null, 'EKLENTİLER'), affixChips(affixesForLevel(keyLevel)));
    el.append(h('div.fd-h', null, 'ÖDÜL'), h('div.fd-chips', null, ...REWARDS[row.diff].map((t) => chip(t))));
    el.append(this.mplusCard());
  }

  private roleRow(): HTMLElement {
    const allowed = allowedRoles(G.character?.classId as ClassId | undefined);
    const btns = ROLE_ORDER.map((r) => {
      const on = this.roles.includes(r);
      const b = h(
        `button.fd-role.fd-role--${r}` + (on ? '.is-on' : ''),
        { type: 'button', title: ROLE_TR[r], disabled: !allowed.includes(r) },
        h('span.fd-role-g', null, ROLE_GLYPH[r]),
        on ? h('i.fd-check', null, '✓') : null,
      ) as HTMLButtonElement;
      b.addEventListener('click', () => this.toggleRole(r));
      return b;
    });
    const lead = h('span.fd-lead' + (this.isLeader() ? '.is-on' : ''), { title: 'Grup lideri başlatır' }, 'Lider');
    return h('div.fd-roles', null, ...btns, lead, h('span.fd-rolename', null, `Rolün: ${this.roles.map((r) => ROLE_TR[r]).join(' · ')}`));
  }

  private banner(def: DungeonDef): HTMLElement {
    const bosses = def.bosses?.length ?? 0;
    return h(
      'div.fd-banner',
      { style: { backgroundImage: `linear-gradient(90deg, rgba(8, 8, 10, 0.92), rgba(8, 8, 10, 0.35)), url("${dungeonArt(def)}")` } },
      h('div.fd-bname', null, def.name),
      h(
        'div.fd-bstats',
        null,
        h('span', null, `Sv. ${def.levelRange?.[0] ?? '?'}–${def.levelRange?.[1] ?? '?'}`),
        h('span', null, iconEl('/assets/icons/ui-timer.svg', 'k-ico k-ico-16'), mmss(def.timerSec ?? 0)),
        h('span', null, iconEl('/assets/icons/ui-enemy-forces.svg', 'k-ico k-ico-16'), `Düşman Gücü ${def.forcesRequired ?? '?'}`),
        h('span', null, iconEl('/assets/icons/ui-boss.svg', 'k-ico k-ico-16'), `${bosses} boss`),
      ),
    );
  }

  private diffGrid(def: DungeonDef, rows: DiffRow[], sel: DiffRow): HTMLElement {
    const grid = h('div.fd-diffs');
    for (const r of rows) {
      const cls = [r.diff === sel.diff ? 'is-sel' : '', r.startable ? '' : 'is-locked', r.st.kind === 'cleared' ? 'is-cleared' : ''].filter(Boolean).join('.');
      const b = h(
        'button.fd-diff' + (cls ? `.${cls}` : ''),
        { type: 'button' },
        h('div.fd-dtop', null, h('b', null, r.name), r.recommended ? h('span.fd-rec', null, 'Önerilen') : null),
        h('small', null, r.line2),
        h('em', null, r.line3),
      ) as HTMLButtonElement;
      b.addEventListener('click', () => {
        if (!r.startable) {
          sfx('ui_error');
          toast(rowGateText(def, r) || r.line3, 'warning');
          return;
        }
        sfx('ui_tab', 0.7);
        this.selDiff = r.diff;
        this.render();
      });
      grid.append(b);
    }
    return grid;
  }

  /** Recommended item level (never a gate) and the party's level gates for this difficulty. */
  private lines(def: DungeonDef, row: DiffRow): HTMLElement {
    const il = G.character?.itemLevel() ?? 0;
    const rec = recommendedIlvl(def, row.diff, row.st.key?.level ?? 2);
    const low = isUnderGeared(il, rec);
    const wrap = h('div.fd-lines');
    wrap.append(h('div.fd-recline' + (low ? '.is-low' : ''), null, `Önerilen eşya seviyesi ${rec} · Sen: ${il}`, low ? h('span', null, ' — eşyaların zayıf') : null));
    const members = G.net.inParty ? G.net.partyRemotePeers().filter((p) => !!p.summary).map((p) => ({ name: p.name, level: p.summary?.level ?? 0 })) : [];
    const gate = memberGate(def, row.diff, members);
    if (gate) wrap.append(h('div.fd-warn', null, gate));
    return wrap;
  }

  private bossRow(def: DungeonDef): HTMLElement {
    const bosses: BossPlacement[] = [...(def.bosses ?? [])].sort((a, b) => a.order - b.order);
    return h(
      'div.fd-bosses',
      null,
      h('div.fd-h', null, 'BOSSLAR'),
      h('div.fd-chips', null, ...bosses.map((b) => chip(BOSSES[b.bossId]?.name ?? b.bossId))),
    );
  }

  /** Collapsed rating card (Mitik+ Puanı): score, best run; expanded: this week's runs and the best run per dungeon. */
  private mplusCard(): HTMLElement {
    const m = G.character?.save.mythic;
    const rating = m?.rating ?? 0;
    const tier = ratingTier(rating);
    const best = this.bestRun();
    const head = h(
      'button.fd-mplus-head',
      { type: 'button' },
      h('span.fd-mplus-t', null, 'MİTİK+ PUANI'),
      h('b', { style: { color: tier.color } }, rating.toLocaleString('tr-TR', { maximumFractionDigits: 1 })),
      h('span.fd-dim', null, best ? `En iyi: +${best.keyLevel} ${dungeonName(best.dungeonId)}` : 'Henüz koşu yok'),
      h('span.fd-mplus-caret', null, this.mplusOpen ? '▴' : '▾'),
    ) as HTMLButtonElement;
    head.addEventListener('click', () => {
      this.mplusOpen = !this.mplusOpen;
      this.render();
    });
    const card = h('div.k-card.fd-mplus', null, head);
    if (this.mplusOpen && m) {
      const week = m.weekly?.runs ?? [];
      const inTime = week.filter((r) => r.inTime).length;
      const runs = finderDungeons().map((d) => {
        const b = bestOf(m.best?.[d.id]);
        const label = `${d.shortName || d.name} ${b ? `+${b.keyLevel}` : '-'}`;
        const stars = b ? '★'.repeat(Math.max(0, Math.min(3, b.upgrade))) : '';
        return chip(`${label}${stars ? ` ${stars}` : ''}${b ? (b.inTime ? ' ✓' : ' ✕') : ''}`);
      });
      card.append(
        h('div.fd-mplus-body', null, h('div.fd-dim', null, `Bu hafta: ${week.length} koşu · ${inTime} süresinde`), h('div.fd-chips', null, ...runs)),
        h('div.fd-mplus-foot', null, this.smallBtn('Mitik+ bilgisi', () => openPanel('mplusInfo'))),
      );
    }
    return card;
  }

  private bestRun(): RunRecord | null {
    const m = G.character?.save.mythic;
    if (!m) return null;
    let best: RunRecord | null = null;
    for (const id of Object.keys(m.best ?? {})) {
      const b = bestOf(m.best[id]);
      if (b && (!best || b.keyLevel > best.keyLevel)) best = b;
    }
    return best;
  }

  private renderRaid(): void {
    this.chrome.body.append(this.raidEl);
    const open = !!DUNGEONS['efsun_kalesi'];
    this.raidEl.textContent = '';
    const card = h(
      'div.k-card.fd-raidcard' + (open ? '' : '.is-dim'),
      null,
      open ? null : h('div.fd-ribbon', null, 'YAKINDA'),
      h('div.fd-bname', null, 'Efsun Kalesi'),
      h('p.fd-lore', null, 'Efsun Kalesi henüz açılmadı. Beş boss, üç zorluk ve haftalık kilit burada olacak.'),
      h('div.fd-h', null, 'BOSSLAR'),
      h('div.fd-chips', null, ...Array.from({ length: 5 }, () => chip('???'))),
      h('div.fd-h', null, 'ÖNERİLEN EŞYA SEVİYESİ'),
      h('div.fd-chips', null, chip('Normal 62'), chip('Kahramanlık 70'), chip('Mitik 76')),
      h('div.fd-h', null, 'AÇILMA KOŞULU'),
      h('div.fd-lines', null, h('div', null, 'Normal: Seviye 60 + bir Mitik 0 temizliği'), h('div', null, "Kahramanlık: Normal'de Yıldızkanat"), h('div', null, "Mitik: Kahramanlık'ta Yıldızkanat + Mitik+ puanı ≥ 800")),
    );
    this.raidEl.append(card);
  }

  /* ---- Gruplar tab */

  private renderGroups(): void {
    const el = this.groupsEl;
    el.textContent = '';
    let rooms: RoomInfo[] = [];
    try {
      rooms = G.net.listRooms();
    } catch {
      rooms = [];
    }
    const listed = lfgRows(rooms, this.filter);
    const unlisted = rooms.filter((r) => !r.lfg);
    this.tabs.badge('groups', listed.length ? String(listed.length) : '');
    el.append(this.filterRow());
    if (!listed.length) {
      el.append(emptyState({ icon: '/assets/icons/ui-party.svg', title: 'Şu an listelenmiş grup yok', text: 'Kendi grubunu listele ya da tek başına gir.' }));
      const listBtn = h('button.k-btn.k-btn--primary', { type: 'button' }, 'Kendi Grubunu Listele') as HTMLButtonElement;
      listBtn.addEventListener('click', () => this.setTabMode('dungeons', 'lfg'));
      const soloBtn = h('button.k-btn', { type: 'button' }, 'Tek Başına Gir') as HTMLButtonElement;
      soloBtn.addEventListener('click', () => this.setTabMode('dungeons', 'solo'));
      el.append(h('div.fd-empty-btns', null, listBtn, soloBtn));
    } else {
      el.append(h('div.fd-trow.fd-thead', null, h('span', null, 'Zindan'), h('span', null, 'Zorluk'), h('span', null, 'Lider'), h('span', null, 'Roller'), h('span', null, 'EŞ'), h('span', null, 'Ping'), h('span', null)));
      for (const r of listed) el.append(this.roomRow(r));
    }
    if (unlisted.length) {
      el.append(h('details.fd-other', null, h('summary', null, `Diğer odalar (${unlisted.length})`), ...unlisted.map((r) => this.plainRoom(r))));
    }
  }

  private setTabMode(tab: Tab, mode: Mode): void {
    this.mode = mode;
    this.setTab(tab);
  }

  private smallBtn(label: string, onClick: () => void): HTMLButtonElement {
    const b = h('button.k-btn.k-btn--sm', { type: 'button' }, label) as HTMLButtonElement;
    b.addEventListener('click', onClick);
    return b;
  }

  private filterRow(): HTMLElement {
    const dsel = h('select.fd-select', null) as HTMLSelectElement;
    dsel.append(h('option', { value: '' }, 'Tüm zindanlar'));
    for (const d of finderDungeons()) dsel.append(h('option', { value: d.id }, d.name));
    dsel.value = this.filter.dungeon;
    dsel.addEventListener('change', () => {
      this.filter.dungeon = dsel.value;
      this.renderGroups();
    });
    const diffSel = h('select.fd-select', null) as HTMLSelectElement;
    diffSel.append(h('option', { value: '' }, 'Tüm zorluklar'));
    for (const d of FINDER_DIFFS) diffSel.append(h('option', { value: d }, DIFF_NAME[d]));
    diffSel.value = this.filter.diff;
    diffSel.addEventListener('change', () => {
      this.filter.diff = diffSel.value as LadderDiff | '';
      this.renderGroups();
    });
    const myRole = this.roles[0];
    const roleBtn = h('button.k-btn.k-btn--ghost' + (this.filter.role ? '.is-on' : ''), { type: 'button' }, 'Rolüme uygun') as HTMLButtonElement;
    roleBtn.addEventListener('click', () => {
      this.filter.role = this.filter.role ? '' : myRole;
      this.renderGroups();
    });
    const noPw = h('button.k-btn.k-btn--ghost' + (this.filter.noPassword ? '.is-on' : ''), { type: 'button' }, 'Şifresiz') as HTMLButtonElement;
    noPw.addEventListener('click', () => {
      this.filter.noPassword = !this.filter.noPassword;
      this.renderGroups();
    });
    return h('div.fd-filters', null, dsel, diffSel, roleBtn, noPw);
  }

  private roomRow(r: RoomInfo): HTMLElement {
    const l = r.lfg;
    const il = G.character?.itemLevel() ?? 0;
    const level = G.character?.level ?? 1;
    const def = l ? DUNGEONS[l.dungeon] : undefined;
    const open = l ? openSlots(l) : 0;
    const pips: HTMLElement[] = [];
    for (let i = 0; i < GROUP_SIZE - open; i++) pips.push(h('span.fd-pip.is-filled', null, '●'));
    if (l) {
      for (const role of ROLE_ORDER) for (let i = 0; i < l.need[role]; i++) pips.push(h(`span.fd-pip.fd-role--${role}`, null, ROLE_GLYPH[role]));
    }
    const ilvl = l?.ilvl ?? 0;
    const blocker = joinBlocker(r, level, il);
    const join = h('button.k-btn.k-btn--sm', { type: 'button', disabled: !!blocker, title: blocker || undefined }, 'Katıl') as HTMLButtonElement;
    join.addEventListener('click', () => this.joinRoom(r));
    const ping = r.ping ?? null;
    return h(
      'div.fd-trow',
      null,
      h('span.fd-zn', null, def?.name ?? r.name),
      h('span', null, l ? chip(DIFF_NAME[l.diff]) : null),
      h('span', null, `${r.hostName} · Sv. ${r.hostLevel ?? '?'}`),
      h('span.fd-pips', null, ...pips),
      h('span', { style: { color: ilvl > il ? '#ff7a6a' : '' } }, ilvl ? String(ilvl) : '-'),
      h('span', { style: { color: pingColor(ping) } }, ping != null ? `${ping} ms` : '-'),
      join,
    );
  }

  /** Room without a listing (collapsed group): name and activity only. */
  private plainRoom(r: RoomInfo): HTMLElement {
    const blocker = joinBlocker(r, G.character?.level ?? 1, G.character?.itemLevel() ?? 0);
    const join = h('button.k-btn.k-btn--sm', { type: 'button', disabled: !!blocker, title: blocker || undefined }, 'Katıl') as HTMLButtonElement;
    join.addEventListener('click', () => this.joinRoom(r));
    return h('div.fd-trow.is-plain', null, h('span.fd-zn', null, r.name), h('span', null, `${r.players}/${r.maxPlayers}`), h('span', null, r.hostName), h('span', null), h('span', null), h('span', null), join);
  }

  /* ---- footer */

  private renderFooter(): void {
    for (const [id, b] of this.modeBtns) b.classList.toggle('is-on', id === this.mode);
    this.renderParty();
    this.statusEl.textContent = this.statusText();
    const p = this.primary();
    this.primaryBtn.hidden = !p.show;
    this.primaryBtn.textContent = p.label;
    this.primaryBtn.disabled = p.disabled;
    this.primaryBtn.title = p.reason;
    this.primaryRun = p.run;
  }

  private statusText(): string {
    switch (this.queue.state) {
      case 'inrun':
        return `Zindandasın: ${dungeonName(this.queue.dungeonId ?? '')}`;
      case 'entering':
        return 'Giriliyor…';
      case 'proposal':
        return 'Hazır kontrolü sürüyor';
      case 'failed':
        return 'Başlatılamadı';
      case 'listing': {
        const n = G.net.inParty ? G.net.partyMembers().length : 1;
        return `Grubun listelendi · ${n} / ${GROUP_SIZE} · aranıyor`;
      }
      default:
        break;
    }
    if (this.inDungeon()) return 'Zindandasın';
    if (this.mode === 'lfg') return G.net.inParty ? 'Grup aramak için bir zindan ve zorluk seç.' : 'Çevrimiçi değilsin: O → Oda Kur ile grup aç.';
    if (this.mode === 'party') {
      const n = G.net.inParty ? G.net.partyMembers().length : 1;
      return n > 1 ? `Grup: ${n} / ${GROUP_SIZE} · lider başlatır` : 'Grupta değilsin: Oda kurup arkadaşlarını davet et.';
    }
    return 'Tek başına';
  }

  /** Party strip: the player first, then the members; empty slots are dashed with the role pips still needed. */
  private renderParty(): void {
    const el = this.partyEl;
    el.textContent = '';
    const members = G.net.inParty ? G.net.partyMembers() : [];
    const slots = members.length
      ? members.map((p) => ({ name: p.peerId === G.net.selfId ? (G.character?.save.name ?? p.name) : p.name, cls: p.summary?.classId ?? null, role: (p.summary?.role ?? 'dps') as RoleId, lead: p.isHost }))
      : [{ name: G.character?.save.name ?? 'Sen', cls: G.character?.classId ?? null, role: this.roles[0], lead: true }];
    const open = needFor(slots.map((s) => [s.role]));
    const openList: RoleId[] = [];
    for (const r of ROLE_ORDER) for (let i = 0; i < open[r]; i++) openList.push(r);
    for (let i = 0; i < GROUP_SIZE; i++) {
      const s = slots[i];
      if (s) {
        const color = s.cls ? CLASS_META[s.cls]?.color ?? '#c9a24a' : '#c9a24a';
        el.append(h('div.fd-pslot' + (s.lead ? '.is-lead' : ''), { style: { borderLeftColor: color } }, h('span.fd-pname', null, s.name), h('span.fd-prole', null, ROLE_GLYPH[s.role])));
      } else {
        const need = openList[i - slots.length];
        el.append(h('div.fd-pslot.is-empty', null, h('span.fd-prole', null, need ? ROLE_GLYPH[need] : '')));
      }
    }
  }

  private primary(): Primary {
    const none: Primary = { label: '', show: false, disabled: true, reason: '', run: NOOP };
    if (this.tab === 'groups' || this.tab === 'pvp') return none;
    if (this.tab === 'fissure') return this.fissure.primary();
    if (this.tab === 'raid') {
      return { label: "Raid'e Gir", show: true, disabled: true, reason: 'Efsun Kalesi henüz açılmadı.', run: NOOP };
    }
    const def = DUNGEONS[this.selId];
    const ctx = this.ctx();
    if (!def || !ctx) return { label: 'Zindan seç', show: true, disabled: true, reason: 'Listeden bir zindan seç.', run: NOOP };
    if (this.inDungeon()) return { label: 'Zindandasın', show: true, disabled: true, reason: 'Zindan içindeyken yeni koşu başlatılamaz.', run: NOOP };

    // a member of a led group only answers the ready check
    if (G.net.inParty && !G.net.isPartyLeader) {
      const me = G.net.partyMembers().find((p) => p.peerId === G.net.selfId);
      const ready = !!me?.ready;
      return { label: ready ? 'Hazır Değilim' : 'Hazırım', show: true, disabled: false, reason: 'Lider hazır kontrolünü başlatır.', run: () => G.net.setReady(!ready) };
    }
    const rows = diffRows(def, ctx);
    const row = rows.find((r) => r.diff === this.selDiff) ?? rows[0];
    if (!row) return none;

    if (this.mode === 'lfg') {
      if (this.listing) return { label: 'Aramayı Durdur', show: true, disabled: false, reason: '', run: () => this.stopLfg() };
      const gate = row.startable ? (row.diff === 'mythicplus' && !this.keyHolder(def) ? 'Bu anahtarla yalnızca oda lideri başlatabilir.' : '') : rowGateText(def, row);
      return { label: 'Grup Ara', show: true, disabled: !!gate, reason: gate, run: () => void this.startLfg(def, row.diff) };
    }

    const party = this.mode === 'party' && G.net.inParty && G.net.partyRemotePeers().length > 0;
    const members = G.net.partyRemotePeers().filter((p) => !!p.summary).map((p) => ({ name: p.name, level: p.summary?.level ?? 0 }));
    const holderBlock = row.diff === 'mythicplus' && !this.keyHolder(def) ? 'Bu anahtarla yalnızca oda lideri başlatabilir.' : '';
    const gate = row.startable ? '' : rowGateText(def, row);
    const levelGate = memberGate(def, row.diff, members) ?? '';
    const busy = G.net.readyCheck?.active ? 'Hazır kontrolü sürüyor.' : '';
    const reason = gate || holderBlock || levelGate || busy;
    const label = party ? 'Hazır Kontrolünü Başlat' : row.diff === 'mythicplus' ? 'Anahtarı Yerleştir' : 'Zindana Gir';
    return { label, show: true, disabled: !!reason, reason, run: () => this.startSelected(def, row.diff) };
  }
}

/** Best run of a dungeon: the highest key among the fortified and tyrannical records. */
function bestOf(b: { fortified?: RunRecord; tyrannical?: RunRecord } | undefined): RunRecord | null {
  if (!b) return null;
  const list = [b.fortified, b.tyrannical].filter((r): r is RunRecord => !!r);
  if (!list.length) return null;
  return list.reduce((a, c) => (c.keyLevel > a.keyLevel ? c : a));
}

/** Ping colour: green < 80 ms, gold < 150 ms, red above. */
function pingColor(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 80) return '#4fe06a';
  if (ms < 150) return '#ffe27a';
  return '#ff7a6a';
}
