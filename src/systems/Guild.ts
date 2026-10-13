import { G } from '../game/G';
import type { ClassId } from '../types/common';
import type { ChatChannel } from '../types/net';
import type { GuildKeyWrap, GuildMemberRec, GuildRank, GuildRosterBody, GuildSave, SignedRoster } from '../types/guild';
import type { LobbyTransport } from '../net/lobby';
import type { Unsubscribe } from '../net/transport';
import { isObj } from '../net/messages';
import type { CharacterState } from './CharacterState';
import { TokenBucket, cleanChatText, cleanName, peekSocial, type PresenceApi, type PresenceEntry, type PresenceGuild } from './Social';
import {
  GUILD, RANK_NAMES, aesDecrypt, aesEncrypt, authorityHash, canDemote, canDisband, canInvite, canKick, canPromote, chatAad, chatSignText,
  checkTransition, cleanGuildName, generateMemberKey, guildCryptoAvailable, isGid, isNewer, isPk, issueCerts, keyHash, leaveSignText, memberOf,
  newChatKey, newGuildId, rosterVersion, signRoster, signText, unb64u, unwrapKey, verifyRoster, verifySig, wrapKey, type MemberKey, type VerifiedRoster,
} from './GuildCore';
import { emit } from './notify';

/**
 * LONCA (WP-05): serverless guilds on the global lobby. OWNER: net module. Pure crypto / roster rules: systems/GuildCore.ts. Threat model:
 * docs/NETCODE.md section 16.
 *
 * Lobby channels: `ginv` (invite / accept / decline), `gsync` (roster pull + push, chat key delivery, signed leave notice), `gchat`
 * (AES-GCM guild chat). All three are sent to single peer ids that the presence registry maps to roster names, so non-members never even
 * receive the ciphertext. The presence carries `g` (tag), `gid` and `gv` (roster version); a peer that announces a newer `gv` of our guild
 * is asked for its roster, a peer with an older one is sent ours (gossip). Every roster is verified (GuildCore.verifyRoster) before use.
 *
 * Persistence: CharacterSave.guild = {gid, member key pair, chat key, latest verified roster}. The leader's roster key IS the leader's
 * member key; officers sign with their member key under a leader-signed certificate.
 */

export type GuildResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): GuildResult => ({ ok: false, reason });
const OK: GuildResult = { ok: true };

export interface GuildMemberView {
  name: string;
  rank: GuildRank;
  rankName: string;
  self: boolean;
  online: boolean;
  cls: ClassId | '';
  lvl: number;
  zone: string;
  /** Transport peer id when online (not for self). */
  peerId: string;
}

export interface GuildInfo {
  gid: string;
  name: string;
  rank: GuildRank;
  leader: string;
  ep: number;
  rev: number;
  version: number;
  kv: number;
  /** The chat key of the current key version is held (chat works). */
  keyReady: boolean;
  max: number;
  members: GuildMemberView[];
}

export interface GuildInviteView {
  from: string;
  guild: string;
  expiresAt: number;
  accepted: boolean;
}

/** Everything Guild needs from the outside; tests replace it (several characters in one process). */
export interface GuildCtx {
  character(): CharacterState | null;
  now(): number;
  say(line: { from: string; text: string; channel: ChatChannel; to?: string }): void;
  /** Guild state, roster or invite changed (`guild:changed`). */
  changed(): void;
  presence(): PresenceApi | null;
  /** Re-announce the presence (new roster version / tag). */
  poke(): void;
  /** Invite popup. Resolves true = accept. */
  prompt(text: string): Promise<boolean>;
  expectNetwork(): boolean;
  openPanel(): void;
  newId(): string;
}

type Lease = () => Promise<{ tr: LobbyTransport; release: () => void } | null>;

interface Incoming {
  id: string;
  peerId: string;
  from: string;
  rs: VerifiedRoster;
  key: string;
  exp: number;
  accepted: boolean;
  mk: MemberKey | null;
}

const defaultCtx: GuildCtx = {
  character: () => G.character,
  now: () => Date.now(),
  say: (line) => emit('net:chat', line),
  changed: () => emit('guild:changed', {}),
  presence: () => G.presence ?? null,
  poke: () => peekSocial()?.poke(),
  prompt: (text) => (G.ui ? G.ui.confirm(text, 'Kabul Et', 'Reddet') : Promise.resolve(false)),
  expectNetwork: () => !!G.net?.defaultTransport,
  openPanel: () => emit('ui:openPanel', { panel: 'guild' }),
  newId: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
};

const HELP_LINES = [
  'Lonca komutları:',
  '/l mesaj - lonca sohbeti',
  '/lonca - lonca penceresi;  /lonca bilgi - üye listesi',
  '/lonca kur isim - lonca kur (' + GUILD.CREATE_COST.toLocaleString('tr-TR') + ' altın, Sv ' + GUILD.MIN_LEVEL + ')',
  '/lonca davet isim - oyuncuyu davet et (Lider, Subay)',
  '/lonca kabul, /lonca red - gelen daveti yanıtla',
  '/lonca at isim - üyeyi çıkar;  /lonca yukselt isim, /lonca dusur isim (Lider)',
  '/lonca ayril - loncadan ayrıl;  /lonca dagit evet - loncayı dağıt (Lider)',
];

/** Command word without Turkish letters and case ("ayrıl" == "ayril"). */
const norm = (s: string): string => s.toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

export class Guild {
  private vr: VerifiedRoster | null = null;
  private sv: GuildSave | null = null;
  private loadedFor: string | null = null;

  private tr: LobbyTransport | null = null;
  private offs: Unsubscribe[] = [];
  private releaseLease: (() => void) | null = null;
  private wantConnected = false;
  private connecting = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  private q: Promise<unknown> = Promise.resolve();
  private incoming: Incoming | null = null;
  private readonly outInv = new Map<string, { target: string; peerId: string; exp: number }>();
  private readonly seenChat = new Set<string>();
  private readonly pulledAt = new Map<string, number>();
  private readonly pushedAt = new Map<string, number>();
  private readonly badUntil = new Map<string, number>();
  private keyReqAt = -Infinity;
  private lastChatAt = -Infinity;
  private lastInviteAt = -Infinity;
  private lastText = '';
  private lastTextAt = -Infinity;
  private readonly bChat = new Map<string, TokenBucket>();
  private readonly bInv = new Map<string, TokenBucket>();
  private readonly bSync = new Map<string, TokenBucket>();

  constructor(private readonly ctx: GuildCtx = defaultCtx, opts: { autoTick?: boolean } = {}) {
    if (opts.autoTick !== false) this.timer = setInterval(() => this.tick(), 2000);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.wantConnected = false;
    this.detach();
  }

  /* ------------------------------------------------------------------------ connection (same pattern as Social / Market) */

  get connected(): boolean {
    return this.tr !== null;
  }

  start(lease?: Lease): void {
    this.wantConnected = true;
    this.ensureLoaded();
    void this.connect(lease);
  }

  stop(): void {
    this.wantConnected = false;
    this.detach();
  }

  async connect(lease?: Lease): Promise<void> {
    this.wantConnected = true;
    if (this.tr || this.connecting) return;
    this.connecting = true;
    try {
      const l = await (lease ?? (() => G.net?.leaseLobby?.() ?? Promise.resolve(null)))();
      if (!l) return;
      if (!this.wantConnected || this.tr) {
        l.release();
        return;
      }
      this.attach(l.tr, l.release);
    } catch (e) {
      console.warn('[guild] lobby unavailable', e);
    } finally {
      this.connecting = false;
    }
  }

  /** Bind to a lobby transport (tests pass a fake one). */
  attach(tr: LobbyTransport, release?: () => void): void {
    this.detach();
    this.tr = tr;
    this.releaseLease = release ?? null;
    this.offs.push(
      tr.on('ginv', (d, m) => void this.onInvite(d, m.from)),
      tr.on('gsync', (d, m) => void this.onSync(d, m.from)),
      tr.on('gchat', (d, m) => void this.onChat(d, m.from)),
    );
  }

  detach(): void {
    for (const o of this.offs.splice(0)) o();
    this.tr = null;
    const rel = this.releaseLease;
    this.releaseLease = null;
    rel?.();
    this.bChat.clear();
    this.bInv.clear();
    this.bSync.clear();
    this.pulledAt.clear();
    this.pushedAt.clear();
  }

  /* ------------------------------------------------------------------------ state access */

  private get ch(): CharacterState | null {
    return this.ctx.character();
  }

  private myName(): string {
    return cleanName(this.ch?.save.name);
  }

  /** (Re)loads the guild of the current character from its save, once per character. */
  private ensureLoaded(): void {
    const ch = this.ch;
    const id = ch?.save.id ?? null;
    if (id === this.loadedFor) return;
    this.loadedFor = id;
    this.vr = null;
    this.sv = null;
    this.incoming = null;
    this.outInv.clear();
    this.seenChat.clear();
    const g = ch?.save.guild;
    if (!ch || !g) {
      this.ctx.changed();
      return;
    }
    // the save was verified when it was stored; it is parsed here synchronously and re-verified in the background (tamper guard)
    const parsedOk = isObj(g) && isGid(g.gid) && isObj(g.mk) && isPk(g.mk.pub) && isObj(g.mk.priv) && typeof g.key === 'string' && isObj(g.roster);
    if (!parsedOk) {
      delete ch.save.guild;
      return;
    }
    void verifyRoster(g.roster, { gid: g.gid }).then((r) => {
      if (this.loadedFor !== id) return;
      if (!r.ok) {
        console.warn('[guild] saved roster failed verification', r.reason);
        this.clearLocal(false);
        return;
      }
      this.vr = r.v;
      this.sv = g;
      this.ctx.changed();
      this.ctx.poke();
    });
  }

  /** Loads and waits (tests and commands that need the state right now). */
  async ready(): Promise<void> {
    this.ensureLoaded();
    await this.q;
    // the background verification resolves on the microtask queue; give it a chance
    for (let i = 0; i < 50 && this.ch?.save.guild && !this.vr; i++) await new Promise((r) => setTimeout(r, 0));
  }

  get inGuild(): boolean {
    this.ensureLoaded();
    return this.vr !== null;
  }

  private rankOf(name: string): GuildRank | null {
    if (!this.vr) return null;
    return memberOf(this.vr.body, name)?.r ?? null;
  }

  private myRank(): GuildRank | null {
    return this.rankOf(this.myName());
  }

  private keyReady(): boolean {
    return !!this.vr && !!this.sv && this.sv.kv === this.vr.body.kv;
  }

  /** `gv` for the presence gossip. */
  presenceInfo(): PresenceGuild | null {
    this.ensureLoaded();
    if (!this.vr) return null;
    return { name: this.vr.body.name, gid: this.vr.body.gid, gv: rosterVersion(this.vr.body) };
  }

  /**
   * Guild tag of a player (by character name as shown in chat / presence), '' = none. Own guild members come from the verified roster;
   * a stranger's tag is what that peer announced on the presence (cosmetic, not provable without a server).
   */
  tagOf(peerName: string): string {
    return this.tagInfo(peerName)?.name ?? '';
  }

  tagInfo(peerName: string): { name: string; verified: boolean } | null {
    this.ensureLoaded();
    const nm = typeof peerName === 'string' ? peerName.trim() : '';
    if (!nm) return null;
    const mine = this.myName();
    if (this.vr && mine && nm.toLowerCase() === mine.toLowerCase()) return { name: this.vr.body.name, verified: true };
    const e = this.ctx.presence()?.find(nm);
    if (!e?.guild) return null;
    const verified = !!this.vr && e.guild.gid === this.vr.body.gid && !!memberOf(this.vr.body, e.raw);
    return { name: e.guild.name, verified };
  }

  info(): GuildInfo | null {
    this.ensureLoaded();
    const vr = this.vr;
    if (!vr) return null;
    const b = vr.body;
    const mine = this.myName();
    const pres = this.ctx.presence()?.list() ?? [];
    const members: GuildMemberView[] = b.m.map((m) => {
      const self = m.n.toLowerCase() === mine.toLowerCase();
      const e = self ? pres.find((x) => x.self) : pres.find((x) => !x.self && x.raw.toLowerCase() === m.n.toLowerCase() && x.guild?.gid === b.gid);
      return {
        name: m.n, rank: m.r, rankName: RANK_NAMES[m.r], self,
        online: self || !!e, cls: e?.cls ?? '', lvl: e?.lvl ?? 0, zone: e?.zoneName || e?.zone || '', peerId: e && !e.self ? e.id : '',
      };
    });
    members.sort((a, c) => Number(c.online) - Number(a.online) || a.rank - c.rank || a.name.localeCompare(c.name, 'tr'));
    return {
      gid: b.gid, name: b.name, rank: this.myRank() ?? 2, leader: b.m.find((m) => m.r === 0)?.n ?? '', ep: b.ep, rev: b.rev,
      version: rosterVersion(b), kv: b.kv, keyReady: this.keyReady(), max: GUILD.MAX_MEMBERS, members,
    };
  }

  pendingInvite(): GuildInviteView | null {
    const p = this.incoming;
    if (!p || this.ctx.now() > p.exp) return null;
    return { from: p.from, guild: p.rs.body.name, expiresAt: p.exp, accepted: p.accepted };
  }

  /* ------------------------------------------------------------------------ small helpers */

  private sys(text: string): void {
    this.ctx.say({ from: '', text, channel: 'system' });
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.q.then(fn);
    this.q = p.catch(() => undefined);
    return p;
  }

  private send(channel: 'ginv' | 'gsync' | 'gchat', data: unknown, to: string): void {
    try {
      this.tr?.send(channel, data as never, { to });
    } catch (e) {
      console.warn('[guild] send failed', channel, e);
    }
  }

  private bucket(map: Map<string, TokenBucket>, id: string, spec: { cap: number; perSec: number }): TokenBucket {
    let b = map.get(id);
    if (!b) {
      if (map.size >= 600) map.delete(map.keys().next().value as string);
      b = new TokenBucket(spec.cap, spec.perSec, this.ctx.now());
      map.set(id, b);
    }
    return b;
  }

  /** Online peers whose announced character name is on the roster (optionally also those that announced our guild id). */
  private memberPeers(includeGuildTag = false): { id: string; rec: GuildMemberRec | null; entry: PresenceEntry }[] {
    const vr = this.vr;
    const pres = this.ctx.presence();
    if (!vr || !pres) return [];
    const out: { id: string; rec: GuildMemberRec | null; entry: PresenceEntry }[] = [];
    for (const e of pres.list()) {
      if (e.self) continue;
      const rec = memberOf(vr.body, e.raw);
      if (rec || (includeGuildTag && e.guild?.gid === vr.body.gid)) out.push({ id: e.id, rec, entry: e });
    }
    return out;
  }

  private peerEntry(peerId: string): PresenceEntry | null {
    return this.ctx.presence()?.list().find((e) => e.id === peerId) ?? null;
  }

  private persist(): void {
    const ch = this.ch;
    if (!ch) return;
    if (this.sv) ch.save.guild = this.sv;
    else delete ch.save.guild;
    ch.persist();
  }

  /** Forget the guild locally (left, kicked, disbanded, corrupt save). */
  private clearLocal(persist = true): void {
    this.vr = null;
    this.sv = null;
    this.incoming = null;
    this.outInv.clear();
    this.seenChat.clear();
    if (persist) this.persist();
    else if (this.ch) {
      delete this.ch.save.guild;
      this.ch.persist();
    }
    this.ctx.changed();
    this.ctx.poke();
  }

  /* ------------------------------------------------------------------------ tick */

  tick(): void {
    const now = this.ctx.now();
    if (this.incoming && now > this.incoming.exp) {
      this.incoming = null;
      this.ctx.changed();
    }
    for (const [id, o] of this.outInv) if (now > o.exp) this.outInv.delete(id);
    if (this.vr && this.sv && !this.keyReady() && now - this.keyReqAt >= GUILD.RETRY_MS) this.requestKey();
    if (this.seenChat.size > 400) this.seenChat.clear();
  }

  private requestKey(): void {
    const vr = this.vr;
    if (!vr) return;
    this.keyReqAt = this.ctx.now();
    const me = this.myName();
    let n = 0;
    for (const p of this.memberPeers()) {
      this.send('gsync', { t: 'kreq', gid: vr.body.gid, kv: vr.body.kv, name: me }, p.id);
      if (++n >= 3) break;
    }
  }

  /* ------------------------------------------------------------------------ create */

  async create(nameIn: string): Promise<GuildResult> {
    this.ensureLoaded();
    const ch = this.ch;
    const me = this.myName();
    if (!ch || !me) return fail('Karakter yok.');
    if (!guildCryptoAvailable()) return fail('Lonca için güvenli bağlantı (https) gerekli.');
    if (this.vr) return fail('Zaten bir loncadasın.');
    if (ch.save.level < GUILD.MIN_LEVEL) return fail(`Lonca kurmak için Sv ${GUILD.MIN_LEVEL} gerekir.`);
    const name = cleanGuildName(nameIn);
    if (!name) return fail(`Lonca adı ${GUILD.NAME_MIN}-${GUILD.NAME_MAX} karakter olmalı (harf, rakam, boşluk, - ' .).`);
    if (ch.save.gold < GUILD.CREATE_COST) return fail(`Lonca kurmak için ${GUILD.CREATE_COST.toLocaleString('tr-TR')} altın gerekir.`);
    const taken = this.ctx.presence()?.list().some((e) => e.guild && e.guild.name.toLowerCase() === name.toLowerCase());
    if (taken) return fail('Bu isimde bir lonca zaten var.');
    return this.run(async () => {
      if (this.vr) return fail('Zaten bir loncada.');
      const mk = await generateMemberKey();
      const key = newChatKey();
      const body: GuildRosterBody = {
        v: 1, gid: newGuildId(), name, ep: 0, rev: 1, lead: mk.pub, kv: 1, kh: await keyHash(key), ts: this.ctx.now(),
        m: [{ n: me, r: 0, pk: mk.pub }], oc: [],
      };
      const sr = await signRoster(body, mk.priv, mk.pub);
      const v = await verifyRoster(sr);
      if (!v.ok) return fail('Lonca imzalanamadı: ' + v.reason);
      if (!ch.spendGold(GUILD.CREATE_COST)) return fail('Yeterli altın yok.');
      this.sv = { gid: body.gid, mk, kv: 1, key, roster: sr };
      this.vr = v.v;
      this.loadedFor = ch.save.id;
      this.persist();
      this.sys(`<${name}> loncasını kurdun. (-${GUILD.CREATE_COST.toLocaleString('tr-TR')} altın) Davet için: /lonca davet isim`);
      this.ctx.changed();
      this.ctx.poke();
      return OK;
    });
  }

  /* ------------------------------------------------------------------------ roster mutations (leader / officer) */

  /**
   * Builds, signs, verifies and adopts the next roster; pushes it to the online members (and `extra` peers, e.g. a kicked player), and when
   * the chat key rotates sends every online remaining member its wrapped copy. Must run inside this.run().
   */
  private async commit(mutate: (next: GuildRosterBody) => string | null, o: { rotate?: boolean; extra?: string[]; dissolve?: boolean } = {}): Promise<GuildResult> {
    const vr = this.vr;
    const sv = this.sv;
    if (!vr || !sv) return fail('Bir loncada değilsin.');
    const rank = this.myRank();
    if (rank === null || rank > 1) return fail('Bu işlem için yetkin yok.');
    const cur = vr.body;
    const next: GuildRosterBody = { ...cur, m: cur.m.map((x) => ({ ...x })), oc: cur.oc.map((x) => ({ ...x })), rev: cur.rev + 1, ts: this.ctx.now() };
    const err = mutate(next);
    if (err) return fail(err);
    if (next.m.length > GUILD.MAX_MEMBERS) return fail('Lonca dolu.');
    if (next.m.filter((x) => x.r === 1).length > GUILD.MAX_OFFICERS) return fail(`En fazla ${GUILD.MAX_OFFICERS} Subay olabilir.`);
    const officersChanged = (await authorityHash(next.m)) !== (await authorityHash(cur.m));
    if (officersChanged) {
      if (rank !== 0) return fail('Subay değişikliğini yalnızca Lider yapabilir.');
      next.ep = cur.ep + 1;
      next.oc = await issueCerts(sv.mk.priv, cur.gid, next.m, next.ep);
    }
    let newKey: string | null = null;
    if (o.rotate) {
      newKey = newChatKey();
      next.kv = cur.kv + 1;
      next.kh = await keyHash(newKey);
    }
    if (o.dissolve) next.dis = 1;
    const sr = await signRoster(next, sv.mk.priv, sv.mk.pub);
    const v = await verifyRoster(sr, { gid: cur.gid, lead: cur.lead });
    if (!v.ok) return fail('Liste imzalanamadı: ' + v.reason);
    const tr = checkTransition(cur, v.v.body);
    if (tr) return fail('Geçersiz değişiklik: ' + tr);
    const targets = new Set<string>([...this.memberPeers(true).map((p) => p.id), ...(o.extra ?? [])]);
    const before = cur;
    this.vr = v.v;
    sv.roster = sr;
    if (newKey) {
      sv.key = newKey;
      sv.kv = next.kv;
    }
    this.persist();
    this.announceDiff(before, v.v.body);
    for (const id of targets) this.send('gsync', { t: 'ros', rs: sr }, id);
    if (newKey) {
      for (const p of this.memberPeers()) {
        const rec = p.rec && next.m.find((x) => x.n === p.rec!.n);
        if (!rec) continue;
        const w = await wrapKey(newKey, rec.pk);
        if (w) this.send('gsync', { t: 'key', gid: cur.gid, kv: next.kv, w }, p.id);
      }
    }
    this.ctx.changed();
    this.ctx.poke();
    return OK;
  }

  private findPeerFor(name: string): string | null {
    const e = this.ctx.presence()?.find(name, false);
    return e && !e.self ? e.id : null;
  }

  async invite(nameIn: string): Promise<GuildResult> {
    this.ensureLoaded();
    const vr = this.vr;
    const sv = this.sv;
    const rank = this.myRank();
    if (!vr || !sv || rank === null) return fail('Bir loncada değilsin.');
    if (!canInvite(rank)) return fail('Davet etmek için Lider veya Subay olmalısın.');
    if (!this.tr) return fail('Genel sohbete bağlanılamadı.');
    if (!this.keyReady()) return fail('Lonca anahtarı bekleniyor, biraz sonra tekrar dene.');
    const target = cleanName(nameIn);
    if (!target) return fail('Kullanım: /lonca davet isim');
    if (vr.body.m.length >= GUILD.MAX_MEMBERS) return fail('Lonca dolu.');
    const e = this.ctx.presence()?.find(target, false);
    if (!e || e.self) return fail(`Oyuncu bulunamadı: ${target}`);
    if (memberOf(vr.body, e.raw)) return fail('Bu oyuncu zaten üye.');
    if (e.guild) return fail('Bu oyuncu zaten bir loncada.');
    const now = this.ctx.now();
    if (now - this.lastInviteAt < 2000) return fail('Çok hızlı davet ediyorsun.');
    this.lastInviteAt = now;
    const id = this.ctx.newId();
    this.outInv.set(id, { target: e.raw, peerId: e.id, exp: now + GUILD.INVITE_TTL_MS });
    this.send('ginv', { t: 'inv', id, gid: vr.body.gid, from: this.myName(), rs: vr.sr, key: sv.key }, e.id);
    this.sys(`${e.name} oyuncusuna lonca daveti gönderildi.`);
    return OK;
  }

  async kick(nameIn: string): Promise<GuildResult> {
    this.ensureLoaded();
    const vr = this.vr;
    const rank = this.myRank();
    if (!vr || rank === null) return fail('Bir loncada değilsin.');
    const t = memberOf(vr.body, nameIn.trim());
    if (!t) return fail(`Üye bulunamadı: ${nameIn.trim().slice(0, 24)}`);
    if (t.n.toLowerCase() === this.myName().toLowerCase()) return fail('Kendini çıkaramazsın. (Ayrılmak için /lonca ayril)');
    if (!canKick(rank, t.r)) return fail('Bu üyeyi çıkarma yetkin yok.');
    const peer = this.findPeerFor(t.n);
    return this.run(async () => {
      return this.commit((next) => {
        next.m = next.m.filter((x) => x.n !== t.n);
        return null;
      }, { rotate: true, extra: peer ? [peer] : [] });
    });
  }

  async promote(nameIn: string): Promise<GuildResult> {
    return this.setRank(nameIn, 1);
  }

  async demote(nameIn: string): Promise<GuildResult> {
    return this.setRank(nameIn, 2);
  }

  private async setRank(nameIn: string, to: 1 | 2): Promise<GuildResult> {
    this.ensureLoaded();
    const vr = this.vr;
    const rank = this.myRank();
    if (!vr || rank === null) return fail('Bir loncada değilsin.');
    const t = memberOf(vr.body, nameIn.trim());
    if (!t) return fail(`Üye bulunamadı: ${nameIn.trim().slice(0, 24)}`);
    if (to === 1 ? !canPromote(rank, t.r) : !canDemote(rank, t.r)) return fail(to === 1 ? 'Yalnızca Lider bir Üye\'yi Subay yapabilir.' : 'Yalnızca Lider bir Subay\'ı düşürebilir.');
    return this.run(async () => {
      return this.commit((next) => {
        const m = next.m.find((x) => x.n === t.n);
        if (!m) return 'Üye yok.';
        m.r = to;
        return null;
      });
    });
  }

  async disband(): Promise<GuildResult> {
    this.ensureLoaded();
    const vr = this.vr;
    const rank = this.myRank();
    if (!vr || rank === null) return fail('Bir loncada değilsin.');
    if (!canDisband(rank)) return fail('Loncayı yalnızca Lider dağıtabilir.');
    const name = vr.body.name;
    return this.run(async () => {
      const me = this.myName();
      const r = await this.commit((next) => {
        next.m = next.m.filter((x) => x.r === 0);
        return null;
      }, { dissolve: true });
      if (!r.ok) return r;
      this.clearLocal();
      this.sys(`<${name}> loncası dağıtıldı. (${me})`);
      return OK;
    });
  }

  /** Voluntary leave. A signed notice goes to the online officers; the leader must use disband. */
  async leave(): Promise<GuildResult> {
    this.ensureLoaded();
    const vr = this.vr;
    const sv = this.sv;
    const rank = this.myRank();
    if (!vr || !sv || rank === null) return fail('Bir loncada değilsin.');
    if (rank === 0) return fail('Lider ayrılamaz. Loncayı dağıtmak için: /lonca dagit evet');
    return this.run(async () => {
      const me = this.myName();
      const ts = this.ctx.now();
      const sig = await signText(sv.mk.priv, leaveSignText(vr.body.gid, me, ts));
      for (const p of this.memberPeers()) if (p.rec && p.rec.r <= 1) this.send('gsync', { t: 'leave', gid: vr.body.gid, name: me, ts, sig }, p.id);
      const name = vr.body.name;
      this.clearLocal();
      this.sys(`<${name}> loncasından ayrıldın.`);
      return OK;
    });
  }

  /* ------------------------------------------------------------------------ invite handshake */

  private async onInvite(d: unknown, from: string): Promise<void> {
    if (!isObj(d) || from === this.tr?.selfId) return;
    if (!this.bucket(this.bInv, from, GUILD.RECV_INV).take(this.ctx.now())) return;
    this.ensureLoaded();
    const now = this.ctx.now();
    if (d.t === 'inv') {
      if (this.vr || (this.incoming && now <= this.incoming.exp)) return;
      const fromName = cleanName(d.from);
      if (!fromName || typeof d.id !== 'string' || d.id.length > 40 || !isGid(d.gid) || typeof d.key !== 'string') return;
      const me = this.myName();
      if (!me) return;
      const key = unb64u(d.key);
      if (!key || key.length !== 32) return;
      const vr = await verifyRoster(d.rs, { gid: d.gid });
      if (!vr.ok) return;
      const b = vr.v.body;
      if (b.dis || b.m.length >= GUILD.MAX_MEMBERS || memberOf(b, me)) return;
      if ((await keyHash(d.key)) !== b.kh) return;
      const inviter = memberOf(b, fromName);
      if (!inviter || inviter.r > 1) return;
      if (this.vr || (this.incoming && this.ctx.now() <= this.incoming.exp)) return;
      const inc: Incoming = { id: d.id, peerId: from, from: fromName, rs: vr.v, key: d.key, exp: this.ctx.now() + GUILD.INVITE_TTL_MS, accepted: false, mk: null };
      this.incoming = inc;
      this.sys(`${fromName} seni <${b.name}> loncasına davet ediyor. (/lonca kabul, /lonca red)`);
      this.ctx.changed();
      const yes = await this.ctx.prompt(`${fromName} seni <${b.name}> loncasına davet ediyor. Katılmak ister misin?`);
      if (this.incoming !== inc || inc.accepted || this.ctx.now() > inc.exp) return;
      if (yes) await this.acceptInvite();
      else await this.declineInvite();
      return;
    }
    if (d.t === 'acc' || d.t === 'dec') {
      const out = typeof d.id === 'string' ? this.outInv.get(d.id) : undefined;
      if (!out || out.peerId !== from || now > out.exp) return;
      this.outInv.delete(d.id as string);
      const name = cleanName(d.name);
      if (!name || name.toLowerCase() !== out.target.toLowerCase()) return;
      if (d.t === 'dec') {
        this.sys(`${name} lonca davetini reddetti.`);
        return;
      }
      if (!isPk(d.pk)) return;
      const pk = d.pk;
      await this.run(async () => {
        if (!this.vr || !isGid(d.gid) || d.gid !== this.vr.body.gid) return;
        const r = await this.commit((next) => {
          if (next.m.some((x) => x.n.toLowerCase() === name.toLowerCase())) return 'Bu isimde bir üye zaten var.';
          if (next.m.some((x) => x.pk === pk)) return 'Anahtar zaten kayıtlı.';
          next.m.push({ n: name, r: 2, pk });
          return null;
        }, { extra: [from] });
        if (!r.ok) this.sys(`${name} loncaya eklenemedi: ${r.reason}`);
      });
    }
  }

  async acceptInvite(): Promise<GuildResult> {
    const inc = this.incoming;
    if (!inc || this.ctx.now() > inc.exp) return fail('Bekleyen davet yok.');
    if (inc.accepted) return OK;
    if (!guildCryptoAvailable()) return fail('Lonca için güvenli bağlantı (https) gerekli.');
    const me = this.myName();
    const mk = await generateMemberKey();
    if (this.incoming !== inc) return fail('Davet süresi doldu.');
    inc.mk = mk;
    inc.accepted = true;
    inc.exp = this.ctx.now() + GUILD.INVITE_TTL_MS;
    this.send('ginv', { t: 'acc', id: inc.id, gid: inc.rs.body.gid, name: me, pk: mk.pub }, inc.peerId);
    this.ctx.changed();
    return OK;
  }

  async declineInvite(): Promise<GuildResult> {
    const inc = this.incoming;
    if (!inc) return fail('Bekleyen davet yok.');
    this.send('ginv', { t: 'dec', id: inc.id, gid: inc.rs.body.gid, name: this.myName() }, inc.peerId);
    this.incoming = null;
    this.ctx.changed();
    return OK;
  }

  /* ------------------------------------------------------------------------ sync: rosters, keys, leave notices */

  /** Social hook: a peer announced a guild. Pull newer rosters of OUR guild, push ours to peers behind. */
  onPeerGuild(e: PresenceEntry): void {
    const vr = this.vr;
    if (!vr || !this.tr || !e.guild || e.guild.gid !== vr.body.gid || e.self) return;
    const now = this.ctx.now();
    if ((this.badUntil.get(e.id) ?? 0) > now) return;
    const mine = rosterVersion(vr.body);
    if (e.guild.gv > mine) {
      if (now - (this.pulledAt.get(e.id) ?? -Infinity) < 5000) return;
      this.pulledAt.set(e.id, now);
      this.send('gsync', { t: 'req', gid: vr.body.gid, have: mine }, e.id);
    } else if (e.guild.gv < mine && memberOf(vr.body, e.raw)) {
      if (now - (this.pushedAt.get(e.id) ?? -Infinity) < 5000) return;
      this.pushedAt.set(e.id, now);
      this.send('gsync', { t: 'ros', rs: vr.sr }, e.id);
    }
  }

  private async onSync(d: unknown, from: string): Promise<void> {
    if (!isObj(d) || from === this.tr?.selfId) return;
    if (!this.bucket(this.bSync, from, GUILD.RECV_SYNC).take(this.ctx.now())) return;
    this.ensureLoaded();
    switch (d.t) {
      case 'req': {
        const vr = this.vr;
        if (!vr || d.gid !== vr.body.gid) return;
        const e = this.peerEntry(from);
        if (!e || (e.guild?.gid !== vr.body.gid && !memberOf(vr.body, e.raw))) return;
        if (typeof d.have === 'number' && d.have >= rosterVersion(vr.body)) return;
        this.send('gsync', { t: 'ros', rs: vr.sr }, from);
        return;
      }
      case 'ros':
        await this.run(() => this.onRoster(d.rs, from));
        return;
      case 'kreq': {
        const vr = this.vr;
        const sv = this.sv;
        if (!vr || !sv || d.gid !== vr.body.gid || d.kv !== sv.kv || sv.kv !== vr.body.kv || typeof d.name !== 'string') return;
        const rec = memberOf(vr.body, cleanName(d.name));
        const e = this.peerEntry(from);
        if (!rec || !e || e.raw.toLowerCase() !== rec.n.toLowerCase()) return;
        const w = await wrapKey(sv.key, rec.pk);
        if (w) this.send('gsync', { t: 'key', gid: vr.body.gid, kv: sv.kv, w }, from);
        return;
      }
      case 'key':
        await this.run(() => this.onKey(d.gid, d.kv, d.w));
        return;
      case 'leave':
        await this.run(() => this.onLeave(d));
        return;
    }
  }

  private async onKey(gid: unknown, kv: unknown, w: unknown): Promise<void> {
    const vr = this.vr;
    const sv = this.sv;
    if (!vr || !sv || gid !== vr.body.gid || typeof kv !== 'number' || kv !== vr.body.kv || sv.kv >= kv) return;
    const key = await unwrapKey(w as GuildKeyWrap, sv.mk.priv, sv.mk.pub);
    if (!key || (await keyHash(key)) !== vr.body.kh) return;
    sv.key = key;
    sv.kv = kv;
    this.persist();
    this.sys('Lonca sohbet anahtarı yenilendi.');
    this.ctx.changed();
  }

  private async onLeave(d: Record<string, unknown>): Promise<void> {
    const vr = this.vr;
    const rank = this.myRank();
    if (!vr || rank === null || rank > 1 || d.gid !== vr.body.gid || typeof d.name !== 'string' || typeof d.ts !== 'number' || typeof d.sig !== 'string') return;
    const rec = memberOf(vr.body, cleanName(d.name));
    if (!rec || !canKick(rank, rec.r)) return;
    if (Math.abs(this.ctx.now() - d.ts) > GUILD.CHAT_SKEW_MS) return;
    if (!(await verifySig(rec.pk, leaveSignText(vr.body.gid, rec.n, d.ts), d.sig))) return;
    const peer = this.findPeerFor(rec.n);
    const r = await this.commit((next) => {
      next.m = next.m.filter((x) => x.n !== rec.n);
      return null;
    }, { rotate: true, extra: peer ? [peer] : [] });
    if (!r.ok) console.warn('[guild] leave not applied', r.reason);
  }

  /** A roster arrived (invite answer, gossip push / pull). Inside this.run(). */
  private async onRoster(raw: unknown, from: string): Promise<void> {
    const inc = this.incoming;
    if (!this.vr) {
      // invitee: the roster that lists us under the key we sent commits the membership
      if (!inc || !inc.accepted || !inc.mk || !isObj(raw)) return;
      const res = await verifyRoster(raw, { gid: inc.rs.body.gid, lead: inc.rs.body.lead });
      if (!res.ok) return;
      const b = res.v.body;
      const me = this.myName();
      const rec = memberOf(b, me);
      if (!rec || rec.pk !== inc.mk.pub || b.dis || (await keyHash(inc.key)) !== b.kh) return;
      const ch = this.ch;
      if (!ch || this.incoming !== inc) return;
      this.sv = { gid: b.gid, mk: inc.mk, kv: b.kv, key: inc.key, roster: res.v.sr };
      this.vr = res.v;
      this.incoming = null;
      this.persist();
      this.sys(`<${b.name}> loncasına katıldın!`);
      this.ctx.changed();
      this.ctx.poke();
      return;
    }
    const cur = this.vr;
    const sv = this.sv;
    if (!sv) return;
    const res = await verifyRoster(raw, { gid: cur.body.gid, lead: cur.body.lead });
    if (!res.ok) {
      this.badUntil.set(from, this.ctx.now() + 60000);
      return;
    }
    if (!isNewer(res.v, this.vr)) return;
    const bad = checkTransition(this.vr.body, res.v.body);
    if (bad) {
      this.badUntil.set(from, this.ctx.now() + 60000);
      return;
    }
    const b = res.v.body;
    const me = this.myName();
    const rec = memberOf(b, me);
    const old = this.vr.body;
    if (b.dis) {
      this.clearLocal();
      this.sys(`<${old.name}> loncası dağıtıldı.`);
      return;
    }
    if (!rec || rec.pk !== sv.mk.pub) {
      this.clearLocal();
      this.sys(`<${old.name}> loncasından çıkarıldın.`);
      return;
    }
    this.vr = res.v;
    sv.roster = res.v.sr;
    // a fork with the same key version can carry a different key (two officers handling the same leave): the signed hash decides
    if (sv.kv >= 0 && (await keyHash(sv.key)) !== b.kh) sv.kv = -1;
    this.persist();
    this.announceDiff(old, b);
    if (b.kv > sv.kv) this.requestKey();
    this.ctx.changed();
    this.ctx.poke();
    // keep the gossip going: peers that announced an older version get this one
    for (const p of this.memberPeers(true)) {
      if (p.id === from) continue;
      if ((p.entry.guild?.gv ?? 0) < rosterVersion(b)) this.send('gsync', { t: 'ros', rs: res.v.sr }, p.id);
    }
  }

  /** Chat lines for joins, leaves and rank changes between two rosters. */
  private announceDiff(a: GuildRosterBody, b: GuildRosterBody): void {
    const me = this.myName().toLowerCase();
    const before = new Map(a.m.map((x) => [x.n.toLowerCase(), x]));
    const after = new Map(b.m.map((x) => [x.n.toLowerCase(), x]));
    for (const [k, m] of after) {
      const o = before.get(k);
      if (!o) {
        if (k !== me) this.sys(`${m.n} loncaya katıldı.`);
      } else if (o.r !== m.r) this.sys(`${m.n} artık ${RANK_NAMES[m.r]}.`);
    }
    for (const [k, m] of before) if (!after.has(k) && k !== me) this.sys(`${m.n} loncadan ayrıldı.`);
  }

  /* ------------------------------------------------------------------------ guild chat */

  async chat(textIn: string): Promise<boolean> {
    this.ensureLoaded();
    const vr = this.vr;
    const sv = this.sv;
    if (!vr || !sv) {
      this.sys('Bir loncada değilsin.');
      return false;
    }
    const text = cleanChatText(textIn, GUILD.CHAT_MAX);
    if (!text) return false;
    if (!this.keyReady()) {
      this.sys('Lonca sohbet anahtarı bekleniyor, biraz sonra tekrar dene.');
      return false;
    }
    const now = this.ctx.now();
    if (now - this.lastChatAt < GUILD.SEND_GAP_MS) {
      this.sys('Çok hızlı yazıyorsun. Biraz bekle.');
      return false;
    }
    if (text === this.lastText && now - this.lastTextAt < 10000) {
      this.sys('Aynı mesajı tekrar gönderemezsin.');
      return false;
    }
    this.lastChatAt = now;
    this.lastText = text;
    this.lastTextAt = now;
    const me = this.myName();
    const sig = await signText(sv.mk.priv, chatSignText(vr.body.gid, me, text, now));
    const e = await aesEncrypt(sv.key, JSON.stringify({ n: me, t: text, ts: now, sig }), chatAad(vr.body.gid, sv.kv));
    if (!e) return false;
    for (const p of this.memberPeers()) this.send('gchat', { t: 'gchat', gid: vr.body.gid, kv: sv.kv, iv: e.iv, ct: e.ct }, p.id);
    this.ctx.say({ from: me, text, channel: 'guild' });
    return true;
  }

  private async onChat(d: unknown, from: string): Promise<void> {
    if (!isObj(d) || from === this.tr?.selfId) return;
    if (!this.bucket(this.bChat, from, GUILD.RECV_CHAT).take(this.ctx.now())) return;
    this.ensureLoaded();
    const vr = this.vr;
    const sv = this.sv;
    if (!vr || !sv || d.gid !== vr.body.gid || typeof d.kv !== 'number' || typeof d.iv !== 'string' || typeof d.ct !== 'string') return;
    if (d.kv !== sv.kv) {
      if (d.kv > sv.kv) this.requestKey();
      return;
    }
    const plain = await aesDecrypt(sv.key, d.iv, d.ct, chatAad(vr.body.gid, sv.kv));
    if (!plain) return;
    let o: unknown;
    try {
      o = JSON.parse(plain);
    } catch {
      return;
    }
    if (!isObj(o) || typeof o.n !== 'string' || typeof o.t !== 'string' || typeof o.ts !== 'number' || typeof o.sig !== 'string') return;
    const rec = memberOf(vr.body, o.n);
    if (!rec || rec.n !== o.n) return;
    if (Math.abs(this.ctx.now() - o.ts) > GUILD.CHAT_SKEW_MS) return;
    if (this.seenChat.has(o.sig)) return;
    const text = cleanChatText(o.t, GUILD.CHAT_MAX);
    if (!text || text !== o.t) return;
    if (!(await verifySig(rec.pk, chatSignText(vr.body.gid, rec.n, text, o.ts), o.sig))) return;
    this.seenChat.add(o.sig);
    this.ctx.say({ from: rec.n, text, channel: 'guild' });
  }

  /* ------------------------------------------------------------------------ chat commands */

  /** `/l text`, `/lonca ...`. Returns true when the command was ours. */
  command(body: string): boolean {
    const m = /^(\S+)\s*([\s\S]*)$/.exec(body.trim());
    if (!m) return false;
    const cmd = norm(m[1]);
    const rest = m[2].trim();
    if (cmd === 'l' || cmd === 'lonca_sohbet') {
      if (!rest) this.sys('Kullanım: /l mesaj');
      else void this.chat(rest);
      return true;
    }
    if (cmd !== 'lonca' && cmd !== 'guild') return false;
    const sm = /^(\S+)\s*([\s\S]*)$/.exec(rest);
    if (!sm) {
      this.ctx.openPanel();
      return true;
    }
    const sub = norm(sm[1]);
    const arg = sm[2].trim();
    const report = (p: Promise<GuildResult>): void => {
      void p.then((r) => {
        if (!r.ok) this.sys(r.reason);
      });
    };
    switch (sub) {
      case 'kur': case 'olustur':
        if (!arg) this.sys('Kullanım: /lonca kur isim');
        else report(this.create(arg));
        break;
      case 'davet': case 'ekle':
        if (!arg) this.sys('Kullanım: /lonca davet isim');
        else report(this.invite(arg));
        break;
      case 'kabul':
        report(this.acceptInvite());
        break;
      case 'red': case 'reddet':
        report(this.declineInvite());
        break;
      case 'ayril':
        report(this.leave());
        break;
      case 'at': case 'cikar':
        if (!arg) this.sys('Kullanım: /lonca at isim');
        else report(this.kick(arg));
        break;
      case 'yukselt': case 'terfi':
        if (!arg) this.sys('Kullanım: /lonca yukselt isim');
        else report(this.promote(arg));
        break;
      case 'dusur':
        if (!arg) this.sys('Kullanım: /lonca dusur isim');
        else report(this.demote(arg));
        break;
      case 'dagit':
        if (norm(arg) !== 'evet') this.sys('Loncayı dağıtmak kalıcıdır. Onaylamak için: /lonca dagit evet');
        else report(this.disband());
        break;
      case 'bilgi': case 'liste': case 'uyeler':
        this.printInfo();
        break;
      case 'yardim': case 'help':
        for (const l of HELP_LINES) this.sys(l);
        break;
      default:
        for (const l of HELP_LINES) this.sys(l);
    }
    return true;
  }

  private printInfo(): void {
    const i = this.info();
    if (!i) {
      this.sys('Bir loncada değilsin. Lonca kurmak için: /lonca kur isim');
      return;
    }
    this.sys(`<${i.name}> - ${i.members.length}/${i.max} üye, ${i.members.filter((x) => x.online).length} çevrimiçi (sürüm ${i.rev})`);
    for (const m of i.members) this.sys(`${m.name} - ${m.rankName} - ${m.online ? 'çevrimiçi' : 'çevrimdışı'}`);
  }
}

/* ------------------------------------------------------------------------------------------------ singleton */

let instance: Guild | null = null;

/** The game's Guild service (created on first use, exposed as `G.guild`). */
export function getGuild(): Guild {
  if (!instance) {
    instance = new Guild();
    G.guild = instance;
  }
  return instance;
}
export function peekGuild(): Guild | null {
  return instance;
}

/** Game.ts hook: join the lobby with the character and wire the presence gossip. */
export function installGuild(social: { onGuildPresence: ((e: PresenceEntry) => void) | null }): Guild {
  const g = getGuild();
  social.onGuildPresence = (e) => g.onPeerGuild(e);
  const ev = G.events;
  ev?.on('scene:changed', ({ to }) => {
    if (to === 'town' || to === 'dungeon') {
      if (G.character) g.start();
    } else if (to === 'menu') g.stop();
  });
  return g;
}
