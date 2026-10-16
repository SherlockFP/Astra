/**
 * PLAYER SOCIAL NET - duel, trade, party invite, gear view and follow between two players. OWNER: net module.
 *
 * Transport: the global lobby, channel `psoc` (systems/Social.ts addLobbyBinding), one peer id per message. The sender's character
 * name comes from the presence registry (never the payload). Both players must be in the same room (same instance) for a duel,
 * a trade or a follow: the fight, the flag radius and the 10 m trade range need both positions.
 *
 * Duel: req -> the target's popup (30 s) -> res -> countdown (3 s on both clients) -> active. Each client applies its own damage:
 * the attacker sends `hit` (7% of its max HP every 1.5 s while within 4 m), the victim keeps >= 1 HP (PlayerSocial DuelMachine.damage)
 * and sends `end` when it reaches 1 HP. Leaving the flag radius (40 m from the start midpoint) or surrendering forfeits.
 * Trust: each client is authoritative for its own HP (friends' rooms, documented, not solved).
 *
 * Trade: req -> res -> window. Offers (gold + bag item payloads) are mirrored with `tOffer`; `tLock` locks a side; `tAcc` accepts.
 * Any offer change clears the locks. When both sides accepted, each client applies its own half: its offered items and gold leave
 * the bag, the partner's arrive. Each side validates before it accepts, so the apply is deterministic on both clients.
 *
 * Pure rules live in systems/PlayerSocial.ts (tested headless in dev/combat-sim/social.mjs). This file wires them to the world, the
 * bag and the net through injected dependencies, so the round trip can run with two instances and a fake lobby.
 */
import {
  DUEL,
  DuelMachine,
  PSOC,
  TRADE,
  TradeMachine,
  friendKey,
  groundDist,
  newPsocId,
  parsePsoc,
  type DuelSnapshot,
  type PsocGearRow,
  type PsocItem,
  type PsocKind,
  type PsocMsg,
  type TradeSide,
} from './PlayerSocial';

/** A player in our room, as the rules need them. */
export interface RoomPlayer {
  name: string;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
}

/** The bag operations a trade needs (adapter over CharacterState in production). */
export interface TradeBag {
  gold(): number;
  addGold(n: number): void;
  spendGold(n: number): boolean;
  find(uid: string): PsocItem | null;
  removeItem(uid: string): boolean;
  addItem(item: PsocItem): boolean;
  freeSlots(): number;
}

export interface TradeView {
  partner: string;
  me: TradeSide;
  them: TradeSide;
  myItems: PsocItem[];
  theirItems: PsocItem[];
}

/** Callbacks into the UI (ui/hud/SocialUi.ts). */
export interface SocialUiHooks {
  request(r: { id: string; kind: PsocKind; from: string; deadline: number }): void;
  requestClosed(id: string): void;
  duel(snap: DuelSnapshot, now: number): void;
  trade(view: TradeView | null): void;
  gear(name: string, rows: PsocGearRow[]): void;
  follow(name: string | null): void;
}

export interface SocialNetDeps {
  now(): number;
  selfName(): string | null;
  /** Local player (position, HP); null while no world. */
  self(): RoomPlayer | null;
  /** Remote or local player by character name, in our room. */
  roomPlayer(name: string): RoomPlayer | null;
  /** Lobby peer id of an online character (presence), null when offline. */
  peerIdOf(name: string): string | null;
  /** Character name of a lobby peer id, null when unknown. */
  nameOf(peerId: string): string | null;
  /** Sends one `psoc` message to a lobby peer. False when the lobby is not connected. */
  send(peerId: string, msg: PsocMsg): boolean;
  setHp(hp: number): void;
  bag: TradeBag;
  gearRows(): PsocGearRow[];
  /** Room code when we host our party, null when solo or a guest. */
  partyCode(): string | null;
  /** Hosts a private room for a party (solo player). Resolves to the code, or null when that fails. */
  hostParty(): Promise<string | null>;
  joinParty(code: string): void;
  /** True while a movement key is held (cancels follow). */
  moveHeld(): boolean;
  faceToward(x: number, z: number): void;
  sys(text: string): void;
  toast(text: string): void;
  ui: SocialUiHooks;
  rnd?: () => number;
}

interface Outgoing {
  kind: PsocKind;
  name: string;
  peer: string;
  at: number;
}

interface Incoming {
  kind: PsocKind;
  from: string;
  peer: string;
  at: number;
  code?: string;
}

const REQ_MS = 30_000;
const same = (a: string, b: string): boolean => friendKey(a).toLowerCase() === friendKey(b).toLowerCase();

const REASON_TEXT: Record<string, string> = {
  hp: 'rakibi 1 cana indirdi',
  surrender: 'teslim oldu',
  leave: 'alanı terk etti',
  timeout: 'süre doldu',
  cancel: 'iptal edildi',
  declined: 'reddedildi',
};

export class PlayerSocialNet {
  readonly duel = new DuelMachine();
  readonly trade = new TradeMachine();

  private duelId = '';
  private duelOpp = '';
  private duelChallenger = false;
  private duelCenter: { x: number; z: number } | null = null;
  private duelLastStrike = -Infinity;
  private duelAbsentAt: number | null = null;
  private duelAnnounced = true;

  private tradeId = '';
  private tradePartner = '';
  private tradeReqAt = 0;
  private myItems: PsocItem[] = [];
  private theirItems: PsocItem[] = [];
  private theirGold = 0;
  private tradeAbsentAt: number | null = null;

  private readonly outgoing = new Map<string, Outgoing>();
  private readonly incoming = new Map<string, Incoming>();
  private readonly gearAsk = new Map<string, string>();
  private followName: string | null = null;

  constructor(private readonly d: SocialNetDeps) {}

  /* ---------------------------------------------------------------------------------------------- queries */

  get followTarget(): string | null {
    return this.followName;
  }

  private busy(): boolean {
    const ds = this.duel.state;
    const ts = this.trade.state;
    return ds === 'invited' || ds === 'countdown' || ds === 'active' || ts === 'requested' || ts === 'open';
  }

  tradeView(): TradeView | null {
    if (this.trade.state !== 'open' && this.trade.state !== 'requested') return null;
    const s = this.trade.sides();
    const meIsA = same(this.d.selfName() ?? '', s.a.name);
    const me = meIsA ? s.a : s.b;
    const them = meIsA ? s.b : s.a;
    return { partner: this.tradePartner, me, them, myItems: this.myItems, theirItems: this.theirItems };
  }

  /* ---------------------------------------------------------------------------------------------- actions */

  /** Duel challenge from the menu. Returns the error text, or null when the request went out. */
  requestDuel(name: string): string | null {
    const why = this.precheck(name);
    if (why) return why;
    const me = this.d.selfName() ?? '';
    const peer = this.d.peerIdOf(name) as string;
    const id = newPsocId(this.d.rnd);
    if (!this.duel.invite(this.d.now(), me, name)) return 'Düello başlatılamadı.';
    this.duelId = id;
    this.duelOpp = name;
    this.duelChallenger = true;
    this.duelAnnounced = false;
    this.outgoing.set(id, { kind: 'duel', name, peer, at: this.d.now() });
    if (!this.d.send(peer, { op: 'req', id, kind: 'duel', to: name })) return this.failSend();
    this.d.toast(`${name} kişisine düello önerdin.`);
    this.d.ui.duel(this.duel.snapshot(), this.d.now());
    return null;
  }

  /** Trade request from the menu. Returns the error text, or null when the request went out. */
  requestTrade(name: string): string | null {
    const why = this.precheck(name);
    if (why) return why;
    const me = this.d.selfName() ?? '';
    const peer = this.d.peerIdOf(name) as string;
    const id = newPsocId(this.d.rnd);
    if (!this.trade.request(me, name)) return 'Takas başlatılamadı.';
    this.tradeId = id;
    this.tradePartner = name;
    this.tradeReqAt = this.d.now();
    this.outgoing.set(id, { kind: 'trade', name, peer, at: this.d.now() });
    if (!this.d.send(peer, { op: 'req', id, kind: 'trade', to: name })) {
      this.trade.cancel(me);
      return this.failSend();
    }
    this.d.toast(`${name} kişisine takas önerdin.`);
    return null;
  }

  /** Party invite: the inviter hosts a room (when solo) and sends its code to the invitee. */
  async requestParty(name: string): Promise<string | null> {
    const why = this.precheck(name, { skipRoom: true });
    if (why) return why;
    let code = this.d.partyCode();
    if (!code) code = await this.d.hostParty();
    if (!code) return 'Grup kurulamadı.';
    const peer = this.d.peerIdOf(name) as string;
    const id = newPsocId(this.d.rnd);
    this.outgoing.set(id, { kind: 'party', name, peer, at: this.d.now() });
    if (!this.d.send(peer, { op: 'party', id, code, room: 'Grup', to: name })) return this.failSend();
    this.d.toast(`${name} gruba davet edildi.`);
    return null;
  }

  /** Gear view: asks the player for their equipped items. */
  requestGear(name: string): string | null {
    const peer = this.d.peerIdOf(name);
    if (!peer) return `${name} çevrimiçi değil.`;
    const id = newPsocId(this.d.rnd);
    this.gearAsk.set(id, name);
    if (!this.d.send(peer, { op: 'gearReq', id })) return this.failSend();
    return null;
  }

  /** Answers an incoming request (popup). */
  respond(id: string, ok: boolean): void {
    const inc = this.incoming.get(id);
    if (!inc) return;
    this.incoming.delete(id);
    this.d.ui.requestClosed(id);
    const now = this.d.now();
    if (inc.kind === 'party') {
      if (ok && inc.code) this.d.joinParty(inc.code);
    } else if (inc.kind === 'duel') {
      if (ok) {
        if (this.duel.accept(now, this.d.selfName() ?? '')) this.startDuel(inc.from, false);
      } else {
        this.duel.decline(this.d.selfName() ?? '');
        this.afterDuel(false);
      }
    } else if (ok) {
      if (this.trade.accept(this.d.selfName() ?? '')) this.d.ui.trade(this.tradeView());
    } else {
      this.trade.cancel(this.d.selfName() ?? '');
      this.closeTrade();
    }
    this.d.send(inc.peer, { op: 'res', id, ok, kind: inc.kind });
    if (!ok && inc.kind === 'duel') this.d.ui.duel(this.duel.snapshot(), now);
  }

  /** Trade window: put these bag items and this much gold on offer. Returns an error text or null. */
  tradeOffer(gold: number, uids: string[]): string | null {
    if (this.trade.state !== 'open') return 'Takas penceresi açık değil.';
    const me = this.d.selfName() ?? '';
    const items: PsocItem[] = [];
    for (const uid of uids) {
      const it = this.d.bag.find(uid);
      if (!it) return 'Bu eşya çantanda değil.';
      items.push(it);
    }
    const g = Math.floor(Number(gold));
    if (!Number.isFinite(g) || g < 0 || g > this.d.bag.gold()) return 'Altın yetersiz.';
    if (!this.trade.offer(me, { gold: g, items: uids })) return 'Teklif geçersiz.';
    this.myItems = items;
    this.sendTrade({ op: 'tOffer', id: this.tradeId, gold: g, items });
    this.d.ui.trade(this.tradeView());
    return null;
  }

  tradeLock(): string | null {
    if (this.trade.state !== 'open') return 'Takas penceresi açık değil.';
    if (!this.trade.lock(this.d.selfName() ?? '')) return 'Kilitlenemedi.';
    this.sendTrade({ op: 'tLock', id: this.tradeId });
    this.d.ui.trade(this.tradeView());
    return null;
  }

  /** Accept the locked trade. The swap runs here when the partner accepted first, or when they accept after. */
  tradeAccept(): string | null {
    if (this.trade.state !== 'open') return 'Takas penceresi açık değil.';
    const me = this.d.selfName() ?? '';
    if (!this.trade.sides()[same(me, this.trade.sides().a.name) ? 'a' : 'b'].locked) return 'Önce teklifini kilitle.';
    const sw = this.trade.confirm(me);
    this.sendTrade({ op: 'tAcc', id: this.tradeId });
    if (sw) this.applySwap();
    else this.d.ui.trade(this.tradeView());
    return null;
  }

  tradeCancel(): void {
    if (this.trade.state !== 'open' && this.trade.state !== 'requested') return;
    this.trade.cancel(this.d.selfName() ?? '');
    this.sendTrade({ op: 'end', id: this.tradeId, why: 'cancel' });
    this.closeTrade();
    this.d.toast('Takas iptal edildi.');
  }

  /** Duel: the local player gives up (during countdown or active). */
  surrenderDuel(): void {
    if (this.duel.state !== 'active' && this.duel.state !== 'countdown') return;
    this.duel.surrender(this.d.selfName() ?? '', 'surrender');
    this.d.send(this.peerOf(this.duelOpp), { op: 'end', id: this.duelId, why: 'surrender' });
    this.afterDuel(false);
  }

  /** Follow: the character walks behind `name` until a move key, the target is lost, or it is more than FOLLOW_MAX away. */
  follow(name: string): string | null {
    if (!this.d.roomPlayer(name)) return `${name} aynı bölgede değil.`;
    this.followName = name;
    this.d.ui.follow(name);
    this.d.toast(`${name} takip ediliyor.`);
    return null;
  }

  stopFollow(text?: string): void {
    if (!this.followName) return;
    this.followName = null;
    this.d.ui.follow(null);
    if (text) this.d.toast(text);
  }

  /** Per-frame movement axis for the follow (null = not following). Installed as autoMoveHook.axis. */
  followAxis(): { x: number; y: number } | null {
    if (!this.followName) return null;
    if (this.d.moveHeld()) {
      this.stopFollow('Takip durdu.');
      return null;
    }
    const me = this.d.self();
    const opp = this.d.roomPlayer(this.followName);
    if (!me || !opp) {
      this.stopFollow('Takip edilen hedef kayboldu.');
      return null;
    }
    const dist = groundDist(me, opp);
    if (dist > PSOC.FOLLOW_MAX) {
      this.stopFollow('Hedef çok uzakta, takip bitti.');
      return null;
    }
    this.d.faceToward(opp.x, opp.z);
    return dist <= PSOC.FOLLOW_STOP ? { x: 0, y: 0 } : { x: 0, y: 1 };
  }

  /* ---------------------------------------------------------------------------------------------- clock */

  /** Called about every 100 ms: timeouts, duel strikes and range checks. */
  tick(): void {
    const now = this.d.now();
    for (const [id, inc] of this.incoming) {
      if (now - inc.at >= REQ_MS) {
        this.incoming.delete(id);
        this.d.ui.requestClosed(id);
        this.d.send(inc.peer, { op: 'res', id, ok: false, kind: inc.kind });
        // a duel invite times out inside DuelMachine.tick (reason 'timeout'); only the trade request needs closing here
        if (inc.kind === 'trade') this.trade.cancel(this.d.selfName() ?? '');
      }
    }
    for (const [id, out] of this.outgoing) if (now - out.at >= REQ_MS + 2000) this.outgoing.delete(id);
    if (this.trade.state === 'requested' && now - this.tradeReqAt >= REQ_MS) {
      this.trade.cancel(this.d.selfName() ?? '');
      this.closeTrade();
      this.d.toast('Takas isteğine yanıt gelmedi.');
    }
    this.tickDuel(now);
    this.tickTrade(now);
    this.duel.tick(now);
    if (this.duel.state === 'countdown' || this.duel.state === 'active' || this.duel.state === 'invited') this.d.ui.duel(this.duel.snapshot(), now);
    this.afterDuel(false);
  }

  /* ---------------------------------------------------------------------------------------------- wire in */

  /** One `psoc` message from a lobby peer. Malformed or unknown senders are dropped. */
  onWire(data: unknown, fromPeer: string): void {
    const msg = parsePsoc(data);
    const who = this.d.nameOf(fromPeer);
    if (!msg || !who) return;
    const me = this.d.selfName() ?? '';
    const now = this.d.now();
    switch (msg.op) {
      case 'req': {
        if (!same(msg.to, me)) return;
        if (this.busy() || !this.d.self() || !this.d.roomPlayer(who)) {
          this.d.send(fromPeer, { op: 'res', id: msg.id, ok: false, kind: msg.kind });
          return;
        }
        if (msg.kind === 'duel') {
          if (!this.duel.invite(now, who, me)) {
            this.d.send(fromPeer, { op: 'res', id: msg.id, ok: false, kind: 'duel' });
            return;
          }
          this.duelId = msg.id;
          this.duelOpp = who;
          this.duelChallenger = false;
          this.duelAnnounced = false;
        } else {
          if (!this.trade.request(who, me)) {
            this.d.send(fromPeer, { op: 'res', id: msg.id, ok: false, kind: 'trade' });
            return;
          }
          this.tradeId = msg.id;
          this.tradePartner = who;
          this.tradeReqAt = now;
        }
        this.incoming.set(msg.id, { kind: msg.kind, from: who, peer: fromPeer, at: now });
        this.d.ui.request({ id: msg.id, kind: msg.kind, from: who, deadline: now + REQ_MS });
        return;
      }
      case 'party': {
        if (!same(msg.to, me)) return;
        this.incoming.set(msg.id, { kind: 'party', from: who, peer: fromPeer, at: now, code: msg.code });
        this.d.ui.request({ id: msg.id, kind: 'party', from: who, deadline: now + REQ_MS });
        return;
      }
      case 'res': {
        const out = this.outgoing.get(msg.id);
        if (!out || out.peer !== fromPeer) return;
        this.outgoing.delete(msg.id);
        if (msg.kind === 'duel') {
          if (msg.ok) {
            if (this.duel.accept(now, out.name)) this.startDuel(out.name, true);
          } else {
            this.duel.decline(out.name);
            this.d.toast(`${out.name} düelloyu reddetti.`);
            this.afterDuel(false);
          }
        } else if (msg.kind === 'trade') {
          if (msg.ok) {
            if (this.trade.accept(out.name)) this.d.ui.trade(this.tradeView());
          } else {
            this.trade.cancel(out.name);
            this.closeTrade();
            this.d.toast(`${out.name} takası reddetti.`);
          }
        } else {
          this.d.toast(msg.ok ? `${out.name} daveti kabul etti.` : `${out.name} daveti reddetti.`);
        }
        return;
      }
      case 'end': {
        if (msg.id === this.duelId && this.duel.opponentOf(me) && same(this.duelOpp, who)) {
          if (this.duel.state === 'active' || this.duel.state === 'countdown') {
            this.duel.surrender(who, msg.why);
            this.afterDuel(false);
          }
          return;
        }
        if (msg.id === this.tradeId && same(this.tradePartner, who)) {
          if (this.trade.state === 'open' || this.trade.state === 'requested') {
            this.trade.cancel(who);
            this.closeTrade();
            this.d.toast(msg.why === 'leave' ? 'Takas iptal: uzaklaştın.' : `${who} takası iptal etti.`);
          }
        }
        return;
      }
      case 'hit': {
        if (this.duel.state !== 'active' || !same(this.duelOpp, who)) return;
        const self = this.d.self();
        if (!self) return;
        const hp = this.duel.damage(me, self.hp, msg.dmg);
        if (hp !== self.hp) this.d.setHp(hp);
        this.afterDuel(true);
        return;
      }
      case 'tOffer': {
        if (this.trade.state !== 'open' || msg.id !== this.tradeId || !same(this.tradePartner, who)) return;
        if (!this.trade.offer(who, { gold: msg.gold, items: msg.items.map((i) => i.uid) })) return;
        this.theirItems = msg.items;
        this.theirGold = msg.gold;
        this.d.ui.trade(this.tradeView());
        return;
      }
      case 'tLock': {
        if (this.trade.state !== 'open' || msg.id !== this.tradeId || !same(this.tradePartner, who)) return;
        if (this.trade.lock(who)) this.d.ui.trade(this.tradeView());
        return;
      }
      case 'tAcc': {
        if (this.trade.state !== 'open' || msg.id !== this.tradeId || !same(this.tradePartner, who)) return;
        const sw = this.trade.confirm(who);
        if (sw) this.applySwap();
        else this.d.ui.trade(this.tradeView());
        return;
      }
      case 'gearReq':
        this.d.send(fromPeer, { op: 'gear', id: msg.id, slots: this.d.gearRows().slice(0, PSOC.GEAR_MAX) });
        return;
      case 'gear': {
        const name = this.gearAsk.get(msg.id);
        if (!name || !same(name, who)) return;
        this.gearAsk.delete(msg.id);
        this.d.ui.gear(name, msg.slots);
        return;
      }
      default:
        return;
    }
  }

  /* ---------------------------------------------------------------------------------------------- internals */

  /** Shared checks for a request to `name`. Null when it may go out. */
  private precheck(name: string, opts: { skipRoom?: boolean } = {}): string | null {
    const me = this.d.selfName();
    if (!me) return 'Karakter yok.';
    if (same(name, me)) return 'Kendine bunu yapamazsın.';
    if (!this.d.peerIdOf(name)) return `${name} çevrimiçi değil.`;
    if (!opts.skipRoom && !this.d.roomPlayer(name)) return `${name} aynı bölgede değil.`;
    if (!opts.skipRoom && this.busy()) return 'Zaten bir düello veya takas içindesin.';
    return null;
  }

  private failSend(): string {
    return 'Genel sohbete bağlanılamadı.';
  }

  private peerOf(name: string): string {
    const p = this.d.peerIdOf(name);
    return p ?? '';
  }

  private sendTrade(msg: PsocMsg): void {
    if (!this.tradePartner) return;
    this.d.send(this.peerOf(this.tradePartner), msg);
  }

  private startDuel(opp: string, challengerSide: boolean): void {
    this.duelOpp = opp;
    this.duelChallenger = challengerSide;
    this.duelAnnounced = false;
    // the flag ring is centred on the midpoint of the two players when the duel is accepted (both clients see the same pair)
    const me = this.d.self();
    const other = this.d.roomPlayer(opp);
    this.duelCenter = me && other ? { x: (me.x + other.x) / 2, z: (me.z + other.z) / 2 } : null;
    this.duelLastStrike = -Infinity;
    this.duelAbsentAt = null;
    this.d.sys(`Düello: ${opp} ile 3 saniye sonra başlıyor.`);
    this.d.ui.duel(this.duel.snapshot(), this.d.now());
  }

  private tickDuel(now: number): void {
    const st = this.duel.state;
    if (st !== 'countdown' && st !== 'active') return;
    const me = this.d.self();
    const opp = this.d.roomPlayer(this.duelOpp);
    if (!me) return;
    if (!opp) {
      this.duelAbsentAt ??= now;
      if (now - this.duelAbsentAt >= PSOC.ABSENT_MS) {
        this.duel.surrender(this.duelOpp, 'leave');
        this.afterDuel(true);
      }
      return;
    }
    this.duelAbsentAt = null;
    if (st !== 'active') return;
    if (!this.duelCenter) this.duelCenter = { x: (me.x + opp.x) / 2, z: (me.z + opp.z) / 2 };
    const dMe = groundDist(me, this.duelCenter);
    const dOpp = groundDist(opp, this.duelCenter);
    this.duel.tick(now, this.duelChallenger ? { a: dMe, b: dOpp } : { a: dOpp, b: dMe });
    if (this.duel.state !== 'active') {
      this.afterDuel(true);
      return;
    }
    if (groundDist(me, opp) <= PSOC.STRIKE_RANGE && now - this.duelLastStrike >= PSOC.STRIKE_MS) {
      this.duelLastStrike = now;
      const dmg = Math.max(1, Math.round(me.maxHp * PSOC.STRIKE_FRAC));
      this.d.send(this.peerOf(this.duelOpp), { op: 'hit', id: this.duelId, dmg });
    }
  }

  private tickTrade(now: number): void {
    if (this.trade.state !== 'open') return;
    const me = this.d.self();
    const opp = this.d.roomPlayer(this.tradePartner);
    if (!me) return;
    if (!opp) {
      this.tradeAbsentAt ??= now;
      if (now - this.tradeAbsentAt >= PSOC.ABSENT_MS) this.cancelTradeFar();
      return;
    }
    this.tradeAbsentAt = null;
    if (groundDist(me, opp) > PSOC.TRADE_RANGE) this.cancelTradeFar();
  }

  private cancelTradeFar(): void {
    this.trade.cancel(this.d.selfName() ?? '');
    this.sendTrade({ op: 'end', id: this.tradeId, why: 'leave' });
    this.closeTrade();
    this.d.toast('Takas iptal: çok uzaklaştın.');
  }

  /** Runs the swap on this client (both clients run it once both sides accepted). Validated first, so it is all or nothing here. */
  private applySwap(): void {
    const me = this.d.selfName() ?? '';
    const sides = this.trade.sides();
    const mine = same(me, sides.a.name) ? sides.a : sides.b;
    const bag = this.d.bag;
    const missing = this.myItems.some((it) => !bag.find(it.uid));
    const noGold = bag.gold() < mine.gold;
    const noRoom = bag.freeSlots() + this.myItems.length < this.theirItems.length;
    if (missing || noGold || noRoom) {
      this.trade.cancel(me);
      this.sendTrade({ op: 'end', id: this.tradeId, why: 'cancel' });
      this.closeTrade();
      this.d.toast('Takas iptal: eşya, altın ya da çanta yetersiz.');
      return;
    }
    for (const it of this.myItems) bag.removeItem(it.uid);
    for (const it of this.theirItems) bag.addItem(it);
    bag.spendGold(mine.gold);
    bag.addGold(this.theirGold);
    this.d.sys(`Takas tamamlandı: ${this.tradePartner} ile.`);
    this.closeTrade();
  }

  private closeTrade(): void {
    this.myItems = [];
    this.theirItems = [];
    this.theirGold = 0;
    this.tradeAbsentAt = null;
    this.d.ui.trade(null);
  }

  /** Announces a finished duel once; sends `end` to the opponent when this client ended it (`local`). */
  private afterDuel(local: boolean): void {
    const snap = this.duel.snapshot();
    if (snap.state !== 'ended') return;
    if (!this.duelAnnounced) {
      this.duelAnnounced = true;
      const me = this.d.selfName() ?? '';
      const reason = snap.reason ?? '';
      if (snap.winner && same(snap.winner, me)) this.d.sys(`Düelloyu kazandın! (${REASON_TEXT[reason] ?? reason})`);
      else if (snap.winner) this.d.sys(`Düello bitti: ${snap.winner} kazandı (${REASON_TEXT[reason] ?? reason}).`);
      else this.d.toast(`Düello ${REASON_TEXT[reason] ?? 'bitti'}.`);
      this.d.ui.duel(snap, this.d.now());
      if (local && (reason === 'hp' || reason === 'leave')) {
        this.d.send(this.peerOf(this.duelOpp), { op: 'end', id: this.duelId, why: reason });
      }
    }
  }
}
