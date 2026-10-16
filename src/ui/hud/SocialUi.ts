/**
 * SOCIAL UI - the DOM for PlayerSocialNet: request popups (30 s, accept / decline), duel countdown and banner, trade window, gear
 * view and the follow banner. Also installPlayerSocial(): wires the service to the lobby (systems/Social.ts), the bag, the room and
 * the movement hook. OWNER: hud module. Logic: systems/PlayerSocialNet.ts + systems/PlayerSocial.ts.
 */
import { G } from '../../game/G';
import { autoMoveHook } from '../../game/PlayerController';
import { getSocial } from '../../systems/Social';
import { friendKey } from '../../systems/PlayerSocial';
import { PlayerSocialNet, type RoomPlayer, type SocialNetDeps, type SocialUiHooks, type TradeBag, type TradeView } from '../../systems/PlayerSocialNet';
import type { PsocGearRow, PsocItem, PsocKind, DuelSnapshot } from '../../systems/PlayerSocial';
import { TRADE, PSOC } from '../../systems/PlayerSocial';
import type { PsocWireMsg } from '../../net/messages';
import type { ItemInstance } from '../../types/items';
import { EQUIP_SLOTS } from '../../types/items';
import { uiSound } from '../widgets/dom';

const PANEL_CSS = [
  'position:fixed', 'z-index:9100', 'background:rgba(14,16,22,0.95)', 'border:1px solid rgba(255,255,255,0.14)',
  'border-radius:8px', 'box-shadow:0 8px 24px rgba(0,0,0,0.6)', 'color:#e8e6df', 'font:500 12px/16px var(--font-body, sans-serif)',
  'padding:10px 12px', 'user-select:none',
].join(';');
const BTN_CSS = 'font:700 12px/16px var(--font-head, sans-serif);color:#f2e7c4;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.22);border-radius:5px;padding:4px 10px;cursor:pointer;';
const TITLE_CSS = 'font:700 14px/18px var(--font-head, sans-serif);color:#f2e7c4;margin-bottom:6px;';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', BTN_CSS, label);
  b.addEventListener('mousedown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    uiSound('ui_click', 0.6);
    onClick();
  });
  return b;
}

function itemName(it: { name?: unknown; baseId?: unknown }): string {
  return typeof it.name === 'string' && it.name ? it.name : typeof it.baseId === 'string' ? it.baseId : '?';
}

/** The DOM. One instance; the service calls its hooks. */
export class SocialUi implements SocialUiHooks {
  private readonly stack: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly countdown: HTMLElement;
  private trader: HTMLElement | null = null;
  private traderSel = new Set<string>();
  private traderPartner = '';
  private gearPanel: HTMLElement | null = null;
  private readonly requests = new Map<string, { el: HTMLElement; bar: HTMLElement; deadline: number; timer: number }>();
  private followName: string | null = null;
  private duelShown: DuelSnapshot | null = null;
  private duelEndedAt = 0;
  /** Set by installPlayerSocial: the service the trade window calls. */
  svc: PlayerSocialNet | null = null;

  constructor() {
    this.stack = el('div', 'position:fixed;top:14%;left:50%;transform:translateX(-50%);z-index:9100;display:flex;flex-direction:column;gap:8px;pointer-events:none;');
    this.banner = el('div', 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9050;display:none;padding:4px 12px;border-radius:12px;background:rgba(14,16,22,0.85);border:1px solid rgba(255,255,255,0.14);font:700 12px/16px var(--font-head, sans-serif);color:#f2e7c4;pointer-events:none;');
    this.countdown = el('div', 'position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);z-index:9050;display:none;font:700 72px/80px var(--font-head, sans-serif);color:#f2e7c4;text-shadow:0 3px 0 #000,0 0 18px rgba(255,190,80,0.6);pointer-events:none;');
    document.body.append(this.stack, this.banner, this.countdown);
  }

  /* ---------------------------------------------------------------------------------------------- requests */

  request(r: { id: string; kind: PsocKind; from: string; deadline: number }): void {
    this.requestClosed(r.id);
    const card = el('div', PANEL_CSS + ';pointer-events:auto;min-width:260px;');
    const title = r.kind === 'duel' ? `${r.from} sana düello önerdi` : r.kind === 'trade' ? `${r.from} sana takas önerdi` : `${r.from} seni gruba davet etti`;
    card.append(el('div', TITLE_CSS, title));
    const row = el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:6px;');
    const bar = el('div', 'height:3px;background:#e8c15a;width:100%;border-radius:2px;margin-top:8px;');
    const track = el('div', 'height:3px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:8px;');
    track.append(bar);
    row.append(
      button('Kabul', () => this.answer(r.id, true)),
      button('Reddet', () => this.answer(r.id, false)),
    );
    card.append(row, track);
    this.stack.appendChild(card);
    const timer = window.setInterval(() => {
      const left = Math.max(0, r.deadline - Date.now());
      bar.style.width = `${(left / 300).toFixed(1)}%`;
      if (left <= 0) this.requestClosed(r.id);
    }, 200);
    this.requests.set(r.id, { el: card, bar, deadline: r.deadline, timer });
    uiSound('ui_click', 0.5);
  }

  requestClosed(id: string): void {
    const r = this.requests.get(id);
    if (!r) return;
    window.clearInterval(r.timer);
    r.el.remove();
    this.requests.delete(id);
  }

  private answer(id: string, ok: boolean): void {
    this.requestClosed(id);
    this.svc?.respond(id, ok);
  }

  /* ---------------------------------------------------------------------------------------------- duel */

  duel(snap: DuelSnapshot, now: number): void {
    this.duelShown = snap;
    if (snap.state === 'countdown') {
      const left = Math.max(1, Math.ceil((snap.liveAt - Date.now()) / 1000));
      this.countdown.style.display = '';
      this.countdown.textContent = String(Math.min(3, left));
      this.setBanner(`Düello: ${snap.challenger} vs ${snap.target}`);
    } else if (snap.state === 'active') {
      this.countdown.style.display = 'none';
      this.setBanner(`Düello: ${snap.challenger} vs ${snap.target}`);
    } else if (snap.state === 'invited') {
      this.countdown.style.display = 'none';
      this.setBanner('Düello yanıtı bekleniyor...');
    } else if (snap.state === 'ended') {
      this.countdown.style.display = 'none';
      this.duelEndedAt = now;
      this.setBanner('Düello bitti');
      window.setTimeout(() => {
        if (this.duelShown?.state === 'ended') this.setBanner(null);
      }, 4000);
    }
  }

  private setBanner(text: string | null): void {
    if (text === null) {
      this.banner.style.display = 'none';
      return;
    }
    this.banner.textContent = text;
    this.banner.style.display = '';
  }

  /* ---------------------------------------------------------------------------------------------- follow */

  follow(name: string | null): void {
    this.followName = name;
    if (name) {
      this.setBanner(`Takip: ${name}`);
    } else if (this.duelShown?.state !== 'active' && this.duelShown?.state !== 'countdown') {
      this.setBanner(null);
    }
  }

  /* ---------------------------------------------------------------------------------------------- trade */

  trade(view: TradeView | null): void {
    if (!view) {
      this.trader?.remove();
      this.trader = null;
      this.traderSel.clear();
      return;
    }
    if (!this.trader || this.traderPartner !== view.partner) {
      this.trader?.remove();
      this.traderSel.clear();
      this.traderPartner = view.partner;
      this.trader = el('div', PANEL_CSS + ';left:50%;top:22%;transform:translateX(-50%);width:520px;pointer-events:auto;');
      document.body.appendChild(this.trader);
    }
    this.renderTrade(view);
  }

  private renderTrade(v: TradeView): void {
    const root = this.trader;
    if (!root || !this.svc) return;
    root.textContent = '';
    root.append(el('div', TITLE_CSS, `Takas: ${v.partner}`));
    const cols = el('div', 'display:flex;gap:12px;');
    const mine = el('div', 'flex:1;min-width:0;');
    const theirs = el('div', 'flex:1;min-width:0;');
    mine.append(el('div', 'font-weight:700;margin-bottom:4px;', 'Senin teklifin'));
    const gold = el('input', 'width:120px;background:#0b0d12;color:#f2e7c4;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:2px 4px;');
    gold.type = 'number';
    gold.min = '0';
    gold.value = String(v.me.gold);
    gold.disabled = v.me.locked;
    gold.addEventListener('mousedown', (e) => e.stopPropagation());
    gold.addEventListener('change', () => this.offerNow(Number(gold.value)));
    mine.append(el('div', 'margin-bottom:4px;', 'Altın:'), gold);
    mine.append(el('div', 'margin:6px 0 4px;', `Eşya (en fazla ${TRADE.MAX_ITEMS}):`));
    const bag = (G.character?.save.bag ?? []).filter((x): x is ItemInstance => !!x && !x.listed);
    for (const it of bag) {
      const row = el('label', 'display:flex;gap:6px;align-items:center;cursor:pointer;');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = this.traderSel.has(it.uid);
      box.disabled = v.me.locked || (!box.checked && this.traderSel.size >= TRADE.MAX_ITEMS);
      box.addEventListener('mousedown', (e) => e.stopPropagation());
      box.addEventListener('change', () => {
        if (box.checked) this.traderSel.add(it.uid);
        else this.traderSel.delete(it.uid);
        this.offerNow(Number(gold.value));
      });
      row.append(box, el('span', '', itemName(it)));
      mine.append(row);
    }
    if (bag.length === 0) mine.append(el('div', 'color:#8a877e;', 'Çantanda eşya yok.'));
    theirs.append(el('div', 'font-weight:700;margin-bottom:4px;', `${v.partner} teklifi`));
    theirs.append(el('div', 'margin-bottom:4px;', `Altın: ${v.them.gold}`));
    for (const it of v.theirItems) theirs.append(el('div', '', itemName(it)));
    if (v.theirItems.length === 0) theirs.append(el('div', 'color:#8a877e;', 'Eşya yok.'));
    cols.append(mine, theirs);
    root.append(cols);
    const status = el('div', 'margin-top:8px;color:#a9a69c;');
    const parts: string[] = [];
    parts.push(v.me.locked ? 'Sen: kilitli' : 'Sen: düzenliyorsun');
    parts.push(v.them.locked ? `${v.partner}: kilitli` : `${v.partner}: düzenliyor`);
    if (v.me.accepted) parts.push('Sen kabul ettin');
    if (v.them.accepted) parts.push(`${v.partner} kabul etti`);
    status.textContent = parts.join(' · ');
    root.append(status);
    const row = el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px;');
    const svc = this.svc;
    if (!v.me.locked) row.append(button('Kilitle', () => this.tradeAction(svc.tradeLock())));
    else row.append(button('Kabul Et', () => this.tradeAction(svc.tradeAccept())));
    row.append(button('Vazgeç', () => svc.tradeCancel()));
    root.append(row);
  }

  private offerNow(gold: number): void {
    if (!this.svc) return;
    const uids = [...this.traderSel];
    this.tradeAction(this.svc.tradeOffer(Number.isFinite(gold) ? gold : 0, uids));
  }

  private tradeAction(err: string | null): void {
    if (err) G.events.emit('ui:toast', { text: err, kind: 'warning' });
  }

  /* ---------------------------------------------------------------------------------------------- gear */

  gear(name: string, rows: PsocGearRow[]): void {
    this.gearPanel?.remove();
    const panel = el('div', PANEL_CSS + ';left:50%;top:18%;transform:translateX(-50%);width:300px;pointer-events:auto;');
    panel.append(el('div', TITLE_CSS, `${name} - kuşanılanlar`));
    const order = new Map<string, number>(EQUIP_SLOTS.map((s, i) => [s, i]));
    const sorted = [...rows].sort((a, b) => (order.get(a.s as never) ?? 99) - (order.get(b.s as never) ?? 99));
    if (sorted.length === 0) panel.append(el('div', 'color:#8a877e;', 'Hiçbir eşya kuşanılmamış.'));
    for (const r of sorted) panel.append(el('div', 'padding:2px 0;', `${r.n}  (il ${r.l})`));
    panel.append(el('div', 'color:#8a877e;font-size:11px;margin-top:4px;', 'Salt okunur. Rakibin seçimi görünür, değiştiremezsin.'));
    panel.append(button('Kapat', () => {
      panel.remove();
      if (this.gearPanel === panel) this.gearPanel = null;
    }));
    document.body.appendChild(panel);
    this.gearPanel = panel;
  }
}

/* ------------------------------------------------------------------------------------------------ install */

let current: PlayerSocialNet | null = null;
let ui: SocialUi | null = null;

/** The running service (null before installPlayerSocial). The player menu calls it. */
export function getPlayerSocial(): PlayerSocialNet | null {
  return current;
}

/** Wires the duel / trade / party / gear / follow service to the lobby, the bag, the room and the movement hook. Call once at boot. */
export function installPlayerSocial(): PlayerSocialNet {
  if (current) return current;
  const social = getSocial();
  ui = new SocialUi();
  const svc = new PlayerSocialNet(makeDeps(() => ui as SocialUi));
  ui.svc = svc;
  current = svc;
  social.addLobbyBinding((tr) => tr.on('psoc', (d, m) => svc.onWire(d, m.from)));
  window.setInterval(() => svc.tick(), 100);
  autoMoveHook.axis = () => svc.followAxis();
  return svc;
}

function selfRoom(): RoomPlayer | null {
  const p = G.player;
  if (!p) return null;
  return { name: p.name, x: p.position.x, z: p.position.z, hp: p.hp, maxHp: p.maxHp };
}

function makeDeps(uiOf: () => SocialUi): SocialNetDeps {
  const bag: TradeBag = {
    gold: () => G.character?.save.gold ?? 0,
    addGold: (n) => G.character?.addGold(n),
    spendGold: (n) => G.character?.spendGold(n) ?? false,
    find: (uid) => (G.character?.save.bag.find((x) => !!x && x.uid === uid) as unknown as PsocItem | undefined) ?? null,
    removeItem: (uid) => !!G.character?.removeItem(uid),
    addItem: (item) => G.character?.addItem(item as unknown as ItemInstance) ?? false,
    freeSlots: () => (G.character?.save.bag ?? []).filter((x) => !x).length,
  };
  return {
    now: () => Date.now(),
    selfName: () => {
      const n = G.character?.save.name;
      return typeof n === 'string' && n.trim() ? friendKey(n) : null;
    },
    self: selfRoom,
    roomPlayer: (name) => {
      const low = friendKey(name).toLowerCase();
      const p = G.world?.players.find((x) => !x.removed && !x.isDead && friendKey(x.name).toLowerCase() === low);
      if (!p || (G.player && p === G.player)) return null;
      return { name: p.name, x: p.position.x, z: p.position.z, hp: p.hp, maxHp: p.maxHp };
    },
    peerIdOf: (name) => G.presence?.find(name, false)?.id ?? null,
    nameOf: (peer) => G.presence?.list().find((e) => e.id === peer)?.raw ?? null,
    send: (peer, msg) => {
      const tr = getSocial().lobbyTransport();
      if (!tr) return false;
      try {
        tr.send('psoc', { t: 'psoc', ...msg } as PsocWireMsg, { to: peer });
        return true;
      } catch {
        return false;
      }
    },
    setHp: (hp) => {
      if (G.player) G.player.hp = hp;
    },
    bag,
    gearRows: () => {
      const eq = G.character?.save.equipment ?? {};
      return Object.entries(eq)
        .filter((e): e is [string, ItemInstance] => !!e[1])
        .map(([s, it]) => ({ s, n: itemName(it), r: String(it.rarity), l: Math.max(0, Math.min(999, Math.floor(it.itemLevel || 0))) }))
        .slice(0, PSOC.GEAR_MAX);
    },
    partyCode: () => (G.net && G.net.role === 'host' && G.net.roomId ? G.net.roomId : null),
    hostParty: async () => {
      if (!G.net || G.net.role !== 'offline') return null;
      try {
        return await G.net.hostRoom({ name: 'Grup', public: false });
      } catch {
        return null;
      }
    },
    joinParty: (code) => {
      if (!G.net) return;
      if (G.net.role !== 'offline') {
        G.events.emit('ui:toast', { text: 'Önce mevcut grubundan ayrıl.', kind: 'warning' });
        return;
      }
      G.net.joinRoom(code).catch((e: unknown) => console.warn('[social] party join failed', e));
    },
    moveHeld: () => !!G.input && (G.input.down('moveForward') || G.input.down('moveBack') || G.input.down('moveLeft') || G.input.down('moveRight')),
    faceToward: (x, z) => {
      const p = G.player;
      if (!p) return;
      p.yaw = Math.atan2(x - p.position.x, z - p.position.z);
    },
    sys: (text) => G.events.emit('net:chat', { from: '', text, channel: 'system' }),
    toast: (text) => G.events.emit('ui:toast', { text, kind: 'info' }),
    ui: {
      request: (r) => uiOf().request(r),
      requestClosed: (id) => uiOf().requestClosed(id),
      duel: (s, now) => uiOf().duel(s, now),
      trade: (v) => uiOf().trade(v),
      gear: (n, rows) => uiOf().gear(n, rows),
      follow: (n) => uiOf().follow(n),
    },
  };
}
