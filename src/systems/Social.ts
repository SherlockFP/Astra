import { G } from '../game/G';
import { CLASSES } from '../data/classes';
import { LEVEL_CAP } from '../types/character';
import type { ClassId } from '../types/common';
import type { ChatChannel } from '../types/net';
import type { LobbyTransport } from '../net/lobby';
import type { Unsubscribe } from '../net/transport';
import { NET, clampNum, ident, isObj, sanitizeText } from '../net/messages';
import { emit } from './notify';
import { activePetId } from './Pets';
import { PET_BY_ID } from '../data/pets';
import { cleanGuildName, isGid } from './GuildCore';
import { NATIONS, cleanNation, nationOfSave, nationTag, type NationId } from '../data/nations';

/**
 * SOCIAL - the world feels shared even when the party is empty. OWNER: net module.
 *
 * Rides the global LOBBY room (the same leased transport the Pazar uses, so it works across parties and instances):
 *   lchat  Genel Sohbet (`/1`, `/g`) and Ticaret (`/2`, `/ticaret`): broadcast text, rendered as plain text by the chat.
 *   lwhis  Fisilti (`/w name text`, `/r text`): sent to ONE peer id, resolved from the presence registry by character name.
 *   lpres  presence {name, cls, lvl, zone}: every PRESENCE_EVERY_MS, immediately on change and to each newcomer.
 *
 * Trust model: everything from the wire is untrusted. The sender id comes from the transport meta (never the payload). Strings are
 * stripped of control / bidi / zero-width characters and capped, classes and levels are validated, every channel has a per-peer token
 * bucket, outgoing chat is rate limited, the peer table is capped. Character names are NOT unique in a serverless game and cannot be
 * proven: the first peer to hold a name keeps it, a later peer with the same name is shown as `Name~2`, `Name~3` (so nobody can pose as
 * a name that is already online). Offline (`?net=offline`) or with no lobby the channels answer "Genel sohbete bağlanılamadı".
 *
 * API for the UI: `G.presence.list()`, `.count()`, `.find(name)`, event `presence:changed {count}`. Chat lines travel through the
 * existing `net:chat` event (channels 'global' | 'trade' | 'whisper' | 'system').
 */

export const SOCIAL = {
  /** Minimum gap between two own Genel / Ticaret messages. */
  SEND_GAP_MS: 1500,
  /** Minimum gap between two own whispers. */
  WHISPER_GAP_MS: 1000,
  /** The same text twice inside this window is refused. */
  DUP_WINDOW_MS: 10000,
  MAX_TEXT: NET.MAX_CHAT_LEN,
  PRESENCE_EVERY_MS: 5000,
  /** A peer silent for longer than this is dropped from the registry. */
  PRESENCE_TTL_MS: 20000,
  /** A changed presence (level up, new zone) is sent right away, but never more often than this. */
  CHANGE_GAP_MS: 1000,
  /** Incoming token buckets (per peer, per kind): capacity and refill per second. The sender's own limit is 1 / SEND_GAP_MS. */
  RECV_CHAT: { cap: 5, perSec: 0.8 },
  RECV_WHISPER: { cap: 4, perSec: 0.5 },
  RECV_PRES: { cap: 6, perSec: 0.5 },
  /** At most this many remote peers are tracked (the rest are ignored). */
  MAX_PEERS: 300,
  /** A failed lobby connection is retried this often (tick) ... */
  RETRY_MS: 30000,
  /** ... or, when the player tries to talk, after this long. */
  RECONNECT_ON_SEND_MS: 5000,
  /** /who prints at most this many names. */
  WHO_MAX: 25,
} as const;

/* ------------------------------------------------------------------------------------------------ pure helpers */

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** Chat text from the wire or the input box: string only, control / bidi / zero-width stripped, whitespace collapsed, capped. Render with text nodes. */
export function cleanChatText(input: unknown, max: number = SOCIAL.MAX_TEXT): string {
  return sanitizeText(input, max).replace(LONE_SURROGATE, '').trim();
}

/** Character name: like chat text, 20 chars, and no `~` (reserved for the duplicate-name suffix). */
export function cleanName(input: unknown): string {
  return cleanChatText(typeof input === 'string' ? input.replace(/~/g, '') : input, NET.MAX_NAME_LEN);
}

export function cleanClass(x: unknown): ClassId | '' {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(CLASSES, x) ? (x as ClassId) : '';
}

/** Fixed-size token bucket on a caller-supplied millisecond clock (the same idea as net/guard.ts). */
export class TokenBucket {
  private tokens: number;
  private at: number;
  constructor(private readonly cap: number, private readonly perSec: number, now: number) {
    this.tokens = cap;
    this.at = now;
  }
  take(now: number): boolean {
    this.tokens = Math.min(this.cap, this.tokens + Math.max(0, now - this.at) * this.perSec / 1000);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/* ------------------------------------------------------------------------------------------------ types */

export interface PresenceEntry {
  /** Transport peer id ('self' for the local player). */
  id: string;
  /** Name to display and to type after /w (a duplicate of an older entry carries `~2`). */
  name: string;
  /** The name as the peer announced it. */
  raw: string;
  cls: ClassId | '';
  lvl: number;
  zone: string;
  zoneName: string;
  /** WP-06: nation announced by the peer (absent for old clients). */
  nat?: NationId;
  /** ms clock of the last message from this peer. */
  seen: number;
  self: boolean;
  /** WP-05 Lonca: the guild the peer announced (self-asserted for strangers; systems/Guild.ts checks it against the roster for members). */
  guild?: { name: string; gid: string; gv: number };
  /** WP-12: summoned cosmetic pet of the peer (data/pets.ts id), absent = none. Replicated in lpres. */
  pet?: string;
}

/** What the local player announces about their guild on the presence (systems/Guild.ts presenceInfo). */
export interface PresenceGuild {
  name: string;
  gid: string;
  gv: number;
}

export interface SocialSelf {
  name: string;
  cls: ClassId;
  level: number;
  zone: string;
  zoneName: string;
  nation?: NationId;
  /** WP-12: summoned cosmetic pet (absent = none). */
  pet?: string;
}

export interface SocialCtx {
  self(): SocialSelf | null;
  now(): number;
  /** A chat line for the player (the game routes it to the `net:chat` event). */
  say(line: { from: string; text: string; channel: ChatChannel; to?: string }): void;
  /** Presence list changed (`presence:changed`). */
  changed(count: number): void;
  /** True when a lobby connection is expected (online play). */
  expectNetwork(): boolean;
  /** Names the player ignores (case-insensitive, raw character names). */
  ignored(rawName: string): boolean;
  /** WP-05 Lonca: the local player's guild for the presence (name, id, roster version), null = none. Optional. */
  guild?(): PresenceGuild | null;
}

type Lease = () => Promise<{ tr: LobbyTransport; release: () => void } | null>;

export type SocialStatus = 'offline' | 'connecting' | 'online';

/** The slice of the Social service the rest of the game uses (`G.presence`). */
export interface PresenceApi {
  list(): PresenceEntry[];
  count(): number;
  find(name: string, includeSelf?: boolean): PresenceEntry | null;
  readonly status: SocialStatus;
}

const FAIL_OFFLINE = 'Genel sohbete bağlanılamadı.';

const defaultCtx: SocialCtx = {
  self: () => {
    const ch = G.character;
    if (!ch) return null;
    const scene = G.scenes?.current?.id ?? '';
    const zone = regionNow.id && (scene === 'dungeon' || scene === 'town') ? regionNow.id : scene;
    const name = cleanName(ch.save.name);
    if (!name) return null;
    return {
      name,
      cls: cleanClass(ch.save.classId) || 'knight',
      level: Math.max(1, Math.min(LEVEL_CAP, Math.floor(ch.save.level || 1))),
      zone: ident(zone, 32) || 'town',
      zoneName: regionNow.id === zone ? regionNow.name : zoneLabel(zone),
      nation: nationOfSave(ch.save),
      pet: activePetId(ch.save) ?? undefined,
    };
  },
  now: () => Date.now(),
  say: (line) => emit('net:chat', line),
  changed: (count) => emit('presence:changed', { count }),
  expectNetwork: () => !!G.net?.defaultTransport,
  ignored: (raw) => {
    const list = G.settings?.data.chatIgnore;
    if (!Array.isArray(list)) return false;
    const low = raw.toLowerCase();
    return list.some((n) => typeof n === 'string' && n.toLowerCase() === low);
  },
  guild: () => G.guild?.presenceInfo() ?? null,
};

/** Region the local player is in (open world), from `region:entered`. Cleared when a scene ends. */
const regionNow = { id: '', name: '' };

function zoneLabel(zone: string): string {
  switch (zone) {
    case 'town': return 'Kuzgunkale';
    case 'dungeon': return 'Zindan';
    case 'menu':
    case 'loading': return 'Menü';
    default: return zone;
  }
}

const HELP_LINES = [
  'Sohbet komutları:',
  '/g veya /1 mesaj - Genel Sohbet (tüm oyuncular)',
  '/ticaret veya /2 mesaj - Ticaret kanalı',
  '/w isim mesaj - fısıltı;  /r mesaj - son fısıldayana yanıt',
  '/kim - çevrimiçi oyuncuları listele ([GK] Gök Kartal, [KK] Kızıl Kurt)',
  '/skor veya /pvp - Kızıl Sınır skor tablosu;  /ulus - ulusun',
  '/temizle, /arayuz, /zindan - diğer komutlar',
];

/* ------------------------------------------------------------------------------------------------ Social */

export class Social implements PresenceApi {
  private readonly peers = new Map<string, PresenceEntry>();
  private readonly joined = new Map<string, number>();
  private joinSeq = 0;
  private selfEntry: PresenceEntry | null = null;
  private listSig = '';

  private tr: LobbyTransport | null = null;
  private offs: Unsubscribe[] = [];
  private releaseLease: (() => void) | null = null;
  private wantConnected = false;
  private connecting = false;
  private netFailed = false;
  private lastTry = -Infinity;
  private timer: ReturnType<typeof setInterval> | null = null;

  private lastAnnounceAt = -Infinity;
  private lastSentKey = '';
  private lastChatAt = -Infinity;
  private lastWhisperAt = -Infinity;
  private lastText = '';
  private lastTextAt = -Infinity;
  /** Display name of the last player who whispered us (target of /r). */
  replyTo = '';
  /** WP-05 Lonca: called after every valid presence of a peer that announced a guild (the guild service pulls newer rosters from it). */
  onGuildPresence: ((e: PresenceEntry) => void) | null = null;

  private readonly bChat = new Map<string, TokenBucket>();
  private readonly bWhis = new Map<string, TokenBucket>();
  private readonly bPres = new Map<string, TokenBucket>();

  constructor(private readonly ctx: SocialCtx = defaultCtx, opts: { autoTick?: boolean } = {}) {
    if (opts.autoTick !== false) this.timer = setInterval(() => this.tick(), 1000);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.wantConnected = false;
    this.detach();
  }

  /* ------------------------------------------------------------------------ connection */

  get status(): SocialStatus {
    return this.tr ? 'online' : this.connecting ? 'connecting' : 'offline';
  }

  get connected(): boolean {
    return this.tr !== null;
  }

  /** Wants the lobby (call when a character is in the game). Safe to call repeatedly. */
  start(lease?: Lease): void {
    this.wantConnected = true;
    this.refreshSelf();
    void this.connect(lease);
  }

  /** Leaves the lobby (character left the game). Tells the others first. */
  stop(): void {
    this.wantConnected = false;
    this.detach();
    this.refreshSelf();
  }

  async connect(lease?: Lease): Promise<void> {
    this.wantConnected = true;
    if (this.tr || this.connecting) return;
    this.connecting = true;
    this.lastTry = this.ctx.now();
    try {
      const l = await (lease ?? (() => G.net?.leaseLobby?.() ?? Promise.resolve(null)))();
      if (!l) {
        this.netFailed = true;
        return;
      }
      this.netFailed = false;
      if (!this.wantConnected || this.tr) {
        l.release();
        return;
      }
      this.attach(l.tr, l.release);
    } catch (e) {
      this.netFailed = true;
      console.warn('[social] lobby unavailable', e);
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
      tr.on('lchat', (d, m) => this.onChat(d, m.from)),
      tr.on('lwhis', (d, m) => this.onWhisper(d, m.from)),
      tr.on('lpres', (d, m) => this.onPresence(d, m.from)),
      tr.onPeerLeave((peer) => this.drop(peer)),
      tr.onPeerJoin((peer) => {
        const msg = this.presenceMsg();
        if (msg) this.send('lpres', msg, peer);
      }),
    );
    this.refreshSelf();
    this.announce(true);
  }

  detach(): void {
    for (const o of this.offs.splice(0)) o();
    const tr = this.tr;
    this.tr = null;
    if (tr) {
      const msg = this.presenceMsg();
      if (msg) {
        try { tr.send('lpres', { ...msg, bye: true }); } catch { /* lobby already closed */ }
      }
    }
    const rel = this.releaseLease;
    this.releaseLease = null;
    rel?.();
    if (this.peers.size) {
      this.peers.clear();
      this.joined.clear();
      this.bChat.clear();
      this.bWhis.clear();
      this.bPres.clear();
    }
    this.lastSentKey = '';
    this.lastAnnounceAt = -Infinity;
    this.touch();
  }

  /* ------------------------------------------------------------------------ tick / presence */

  /** Once a second: expire silent peers, announce when due or changed, retry a failed connection. */
  tick(): void {
    const now = this.ctx.now();
    let dropped = false;
    for (const [id, e] of this.peers) {
      if (now - e.seen > SOCIAL.PRESENCE_TTL_MS) {
        this.peers.delete(id);
        this.forget(id);
        dropped = true;
      }
    }
    if (dropped) this.recompute();
    this.refreshSelf();
    if (this.tr) this.announce(false);
    else if (this.wantConnected && !this.connecting && this.ctx.expectNetwork() && now - this.lastTry >= SOCIAL.RETRY_MS) void this.connect();
  }

  /** Re-reads the local character (level up, zone change) and announces right away when it changed. Cheap; safe from event handlers. */
  poke(): void {
    this.refreshSelf();
    if (this.tr) this.announce(false);
  }

  private presenceMsg(): { t: 'lpres'; name: string; cls: ClassId; lvl: number; zone: string; zn?: string; g?: string; gid?: string; gv?: number; nat?: NationId; pet?: string } | null {
    const s = this.ctx.self();
    if (!s) return null;
    const g = this.ctx.guild?.() ?? null;
    return {
      t: 'lpres', name: s.name, cls: s.cls, lvl: s.level, zone: s.zone,
      ...(s.zoneName ? { zn: s.zoneName.slice(0, 24) } : {}),
      ...(g ? { g: g.name, gid: g.gid, gv: g.gv } : {}),
      ...(s.nation ? { nat: s.nation } : {}),
      ...(s.pet ? { pet: s.pet } : {}),
    };
  }

  private announce(force: boolean): void {
    const msg = this.presenceMsg();
    if (!msg || !this.tr) return;
    const now = this.ctx.now();
    const key = `${msg.name}|${msg.cls}|${msg.lvl}|${msg.zone}|${msg.gid ?? ''}|${msg.gv ?? 0}|${msg.nat ?? ''}|${msg.pet ?? ''}`;
    const changed = key !== this.lastSentKey;
    const due = now - this.lastAnnounceAt >= SOCIAL.PRESENCE_EVERY_MS;
    if (!force && !due && !(changed && now - this.lastAnnounceAt >= SOCIAL.CHANGE_GAP_MS)) return;
    this.lastSentKey = key;
    this.lastAnnounceAt = now;
    this.send('lpres', msg);
  }

  /** Keeps the local player's own entry in the registry (name / class / level / zone). */
  private refreshSelf(): void {
    const s = this.ctx.self();
    if (!s || (!this.tr && !this.wantConnected)) {
      if (this.selfEntry) {
        this.selfEntry = null;
        this.recompute();
        this.touch();
      }
      return;
    }
    const first = !this.selfEntry;
    const e = this.selfEntry ?? { id: 'self', name: s.name, raw: s.name, cls: s.cls, lvl: s.level, zone: s.zone, zoneName: s.zoneName, seen: 0, self: true };
    const renamed = e.raw !== s.name;
    e.raw = s.name;
    e.name = s.name;
    e.cls = s.cls;
    e.lvl = s.level;
    e.zone = s.zone;
    e.zoneName = s.zoneName;
    e.nat = s.nation;
    if (s.pet) e.pet = s.pet;
    else delete e.pet;
    e.seen = this.ctx.now();
    const g = this.ctx.guild?.() ?? null;
    if (g) e.guild = { name: g.name, gid: g.gid, gv: g.gv };
    else delete e.guild;
    this.selfEntry = e;
    if (first || renamed) this.recompute();
    this.touch();
  }

  /* ------------------------------------------------------------------------ registry */

  /** Display names: the oldest holder of a name keeps it, later holders get `~2`, `~3` (self counts as oldest). */
  private recompute(): void {
    const all = this.entries();
    const used = new Map<string, number>();
    for (const e of all) {
      const low = e.raw.toLowerCase();
      const n = (used.get(low) ?? 0) + 1;
      used.set(low, n);
      e.name = n === 1 ? e.raw : `${e.raw}~${n}`;
    }
  }

  /** Self first, then remote peers in the order they were first seen. */
  private entries(): PresenceEntry[] {
    const out: PresenceEntry[] = [];
    if (this.selfEntry) out.push(this.selfEntry);
    const remote = [...this.peers.values()].sort((a, b) => (this.joined.get(a.id) ?? 0) - (this.joined.get(b.id) ?? 0));
    out.push(...remote);
    return out;
  }

  list(): PresenceEntry[] {
    return this.entries().map((e) => ({ ...e })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  count(): number {
    return this.entries().length;
  }

  /** Entry by display name (case-insensitive), or by raw name when that is unambiguous. */
  find(name: string, includeSelf = true): PresenceEntry | null {
    const low = name.trim().toLowerCase();
    if (!low) return null;
    const all = this.entries().filter((e) => includeSelf || !e.self);
    return all.find((e) => e.name.toLowerCase() === low) ?? null;
  }

  private touch(): void {
    const sig = this.entries().map((e) => `${e.id}|${e.name}|${e.cls}|${e.lvl}|${e.zone}|${e.guild?.gid ?? ''}${e.guild?.gv ?? ''}`).join(';');
    if (sig === this.listSig) return;
    this.listSig = sig;
    this.ctx.changed(this.count());
  }

  private forget(id: string): void {
    this.joined.delete(id);
    this.bChat.delete(id);
    this.bWhis.delete(id);
    this.bPres.delete(id);
  }

  private drop(id: string): void {
    if (this.peers.delete(id)) {
      this.forget(id);
      this.recompute();
      this.touch();
    } else this.forget(id);
  }

  private bucket(map: Map<string, TokenBucket>, id: string, spec: { cap: number; perSec: number }): TokenBucket {
    let b = map.get(id);
    if (!b) {
      if (map.size >= SOCIAL.MAX_PEERS * 2) map.delete(map.keys().next().value as string);
      b = new TokenBucket(spec.cap, spec.perSec, this.ctx.now());
      map.set(id, b);
    }
    return b;
  }

  /** Insert / update the entry of a remote peer from validated fields. Returns it, or null when the table is full. */
  private upsert(id: string, raw: string, cls: ClassId | '', lvl: number | null, zone: string | null, zoneName: string | null, nat?: NationId): PresenceEntry | null {
    let e = this.peers.get(id);
    const now = this.ctx.now();
    if (!e) {
      if (this.peers.size >= SOCIAL.MAX_PEERS) return null;
      e = { id, name: raw, raw, cls, lvl: lvl ?? 1, zone: zone ?? '', zoneName: zoneName ?? '', seen: now, self: false };
      this.peers.set(id, e);
      this.joined.set(id, ++this.joinSeq);
      this.recompute();
    } else if (e.raw !== raw) {
      e.raw = raw;
      this.recompute();
    }
    e.seen = now;
    if (cls) e.cls = cls;
    if (lvl !== null) e.lvl = lvl;
    if (zone !== null) e.zone = zone;
    if (zoneName !== null) e.zoneName = zoneName;
    if (nat) e.nat = nat;
    this.touch();
    return e;
  }

  /* ------------------------------------------------------------------------ receive */

  private onPresence(d: unknown, from: string): void {
    if (!isObj(d) || from === this.tr?.selfId) return;
    if (!this.bucket(this.bPres, from, SOCIAL.RECV_PRES).take(this.ctx.now())) return;
    if (d.bye === true) {
      this.drop(from);
      return;
    }
    const name = cleanName(d.name);
    if (!name) return;
    const zone = ident(d.zone, 32);
    const e = this.upsert(
      from,
      name,
      cleanClass(d.cls),
      Math.round(clampNum(d.lvl, 1, LEVEL_CAP, 1)),
      zone,
      cleanChatText(d.zn, 24),
      cleanNation(d.nat),
    );
    if (!e) return;
    // WP-12: a pet id this build does not know means "no pet" (strict validation, like the nation)
    const pet = typeof d.pet === 'string' && PET_BY_ID[d.pet] ? d.pet : undefined;
    if (pet !== e.pet) {
      if (pet) e.pet = pet;
      else delete e.pet;
      this.touch();
    }
    // WP-05 Lonca: strict validation of the guild fields (a bad one just means "no guild")
    const gname = cleanGuildName(d.g);
    const gid = isGid(d.gid) ? d.gid : '';
    const gv = typeof d.gv === 'number' && Number.isInteger(d.gv) && d.gv >= 0 && d.gv <= 1e11 ? d.gv : -1;
    const before = e.guild ? `${e.guild.gid}${e.guild.gv}` : '';
    if (gname && gid && gv >= 0) e.guild = { name: gname, gid, gv };
    else delete e.guild;
    if ((e.guild ? `${e.guild.gid}${e.guild.gv}` : '') !== before) this.touch();
    if (e.guild) {
      try { this.onGuildPresence?.(e); } catch (err) { console.warn('[social] guild hook failed', err); }
    }
  }

  /** Common sender resolution for chat / whisper: validates the name, registers the peer implicitly (messages may beat the presence). */
  private sender(d: Record<string, unknown>, from: string): PresenceEntry | null {
    if (from === this.tr?.selfId) return null;
    const name = cleanName(d.name);
    if (!name) return null;
    const lvlRaw = d.lvl;
    return this.upsert(from, name, cleanClass(d.cls), typeof lvlRaw === 'number' ? Math.round(clampNum(lvlRaw, 1, LEVEL_CAP, 1)) : null, null, null);
  }

  private onChat(d: unknown, from: string): void {
    if (!isObj(d)) return;
    if (!this.bucket(this.bChat, from, SOCIAL.RECV_CHAT).take(this.ctx.now())) return;
    const text = cleanChatText(d.text);
    if (!text) return;
    const e = this.sender(d, from);
    if (!e || this.ctx.ignored(e.raw)) return;
    this.ctx.say({ from: e.name, text, channel: d.trade === true ? 'trade' : 'global' });
  }

  private onWhisper(d: unknown, from: string): void {
    if (!isObj(d)) return;
    if (!this.bucket(this.bWhis, from, SOCIAL.RECV_WHISPER).take(this.ctx.now())) return;
    const me = this.ctx.self();
    if (!me) return;
    // routed by peer id, but the sender must have meant THIS character (a stale name after a character switch is dropped)
    if (cleanName(d.to).toLowerCase() !== me.name.toLowerCase()) return;
    const text = cleanChatText(d.text);
    if (!text) return;
    const e = this.sender(d, from);
    if (!e || this.ctx.ignored(e.raw)) return;
    this.replyTo = e.name;
    this.ctx.say({ from: e.name, text, channel: 'whisper', to: me.name });
  }

  /* ------------------------------------------------------------------------ send */

  private send(channel: 'lchat' | 'lpres' | 'lwhis', data: unknown, to?: string): void {
    try {
      if (to) this.tr?.send(channel, data as never, { to });
      else this.tr?.send(channel, data as never);
    } catch (e) {
      console.warn('[social] send failed', channel, e);
    }
  }

  private sys(text: string): void {
    this.ctx.say({ from: '', text, channel: 'system' });
  }

  /** Why the lobby cannot be used right now (null = ok). Starts a retry when it failed before. */
  private unavailable(): string | null {
    if (this.tr) return null;
    if (this.connecting) return 'Genel sohbete bağlanılıyor...';
    if (!this.ctx.expectNetwork()) return FAIL_OFFLINE;
    if (!this.netFailed || this.ctx.now() - this.lastTry >= SOCIAL.RECONNECT_ON_SEND_MS) {
      void this.connect();
      if (this.connecting) return 'Genel sohbete bağlanılıyor...';
    }
    return FAIL_OFFLINE;
  }

  /** Genel Sohbet / Ticaret message. Prints its own error as a system line; returns true when the message was sent. */
  sendChannel(channel: 'global' | 'trade', textIn: string): boolean {
    const me = this.ctx.self();
    const text = cleanChatText(textIn);
    if (!me || !text) return false;
    const why = this.unavailable();
    if (why) {
      this.sys(why);
      return false;
    }
    const now = this.ctx.now();
    if (now - this.lastChatAt < SOCIAL.SEND_GAP_MS) {
      this.sys('Çok hızlı yazıyorsun. Biraz bekle.');
      return false;
    }
    if (text === this.lastText && now - this.lastTextAt < SOCIAL.DUP_WINDOW_MS) {
      this.sys('Aynı mesajı tekrar gönderemezsin.');
      return false;
    }
    this.lastChatAt = now;
    this.lastText = text;
    this.lastTextAt = now;
    this.send('lchat', { t: 'lchat', name: me.name, text, cls: me.cls, lvl: me.level, ...(channel === 'trade' ? { trade: true } : {}) });
    this.ctx.say({ from: me.name, text, channel });
    return true;
  }

  /** `/w name text`: the target is resolved from the presence registry. Returns true when sent. */
  whisper(targetName: string, textIn: string): boolean {
    const me = this.ctx.self();
    const text = cleanChatText(textIn);
    if (!me || !text) return false;
    const why = this.unavailable();
    if (why) {
      this.sys(why);
      return false;
    }
    const e = this.find(targetName, true);
    if (!e) {
      this.sys(`Oyuncu bulunamadı: ${targetName.slice(0, NET.MAX_NAME_LEN + 4)}`);
      return false;
    }
    if (e.self) {
      this.sys('Kendine fısıldayamazsın.');
      return false;
    }
    const now = this.ctx.now();
    if (now - this.lastWhisperAt < SOCIAL.WHISPER_GAP_MS) {
      this.sys('Çok hızlı yazıyorsun. Biraz bekle.');
      return false;
    }
    this.lastWhisperAt = now;
    this.send('lwhis', { t: 'lwhis', name: me.name, to: e.raw, text, cls: me.cls, lvl: me.level }, e.id);
    this.ctx.say({ from: me.name, text, channel: 'whisper', to: e.name });
    return true;
  }

  /* ------------------------------------------------------------------------ commands */

  /**
   * Chat slash command (without the `/`). Returns true when it was one of ours (the caller then does nothing else).
   * `/g` `/1` `/genel` | `/ticaret` `/2` | `/w` `/fisilti` `/whisper` | `/r` `/yanit` | `/kim` `/who` | `/yardim`.
   */
  command(body: string): boolean {
    const m = /^(\S+)\s*([\s\S]*)$/.exec(body.trim());
    if (!m) return false;
    const cmd = m[1].toLowerCase().replace(/ı/g, 'i');
    const rest = m[2].trim();
    switch (cmd) {
      case 'g': case '1': case 'genel':
        if (!rest) this.sys('Kullanım: /g mesaj');
        else this.sendChannel('global', rest);
        return true;
      case 'ticaret': case '2':
        if (!rest) this.sys('Kullanım: /ticaret mesaj');
        else this.sendChannel('trade', rest);
        return true;
      case 'w': case 'whisper': case 'fisilti': case 'fisilda':
        this.whisperCommand(rest);
        return true;
      case 'r': case 'reply': case 'yanit':
        if (!this.replyTo) this.sys('Yanıtlanacak kimse yok.');
        else if (!rest) this.sys(`Kullanım: /r mesaj (${this.replyTo} kişisine)`);
        else this.whisper(this.replyTo, rest);
        return true;
      case 'kim': case 'who':
        this.who();
        return true;
      case 'skor': case 'pvp': case 'siralama':
        try { G.ui?.openPanel('pvpBoard'); } catch { /* ui not ready */ }
        return true;
      case 'ulus': case 'nation': {
        const n = G.character ? nationOfSave(G.character.save) : null;
        this.sys(n ? `Ulusun: ${NATIONS[n].name} [${NATIONS[n].tag}]. Karşı ulus yalnızca Kızıl Sınır'da düşmandır; aynı ulustan olanlar grup kurabilir.` : 'Karakter seçilmedi.');
        return true;
      }
      case 'yardim': case 'help':
        for (const l of HELP_LINES) this.sys(l);
        return true;
      default:
        return false;
    }
  }

  /** `name text` where the name may contain spaces: the longest prefix that is an online player wins. */
  private whisperCommand(rest: string): void {
    const tokens = rest.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) {
      this.sys('Kullanım: /w isim mesaj');
      return;
    }
    for (let k = tokens.length - 1; k >= 1; k--) {
      const name = tokens.slice(0, k).join(' ');
      if (this.find(name)) {
        this.whisper(name, tokens.slice(k).join(' '));
        return;
      }
    }
    this.whisper(tokens[0], tokens.slice(1).join(' '));
  }

  who(): void {
    const list = this.list();
    if (!this.tr) this.sys(FAIL_OFFLINE);
    this.sys(`Çevrimiçi oyuncular (${list.length}):`);
    for (const e of list.slice(0, SOCIAL.WHO_MAX)) {
      const cn = e.cls ? CLASSES[e.cls]?.name ?? '' : '';
      this.sys(`${e.nat ? `[${nationTag(e.nat)}] ` : ''}${e.name} - Sv ${e.lvl}${cn ? ' ' + cn : ''}${e.zoneName || e.zone ? ' - ' + (e.zoneName || e.zone) : ''}`);
    }
    if (list.length > SOCIAL.WHO_MAX) this.sys(`... ve ${list.length - SOCIAL.WHO_MAX} oyuncu daha.`);
  }
}

/* ------------------------------------------------------------------------------------------------ singleton */

let instance: Social | null = null;

/** The game's Social service (created on first use, exposed as `G.presence`). */
export function getSocial(): Social {
  if (!instance) {
    instance = new Social();
    G.presence = instance;
  }
  return instance;
}
export function peekSocial(): Social | null {
  return instance;
}

/** Game.ts hook: wire the service to the scene lifecycle (join the global lobby in town / dungeons, leave in the menu). */
export function installSocial(): Social {
  const s = getSocial();
  const ev = G.events;
  ev?.on('scene:changed', ({ to }) => {
    if (to === 'town' || to === 'dungeon') {
      if (G.character) s.start();
      s.poke();
    } else if (to === 'menu') s.stop();
  });
  ev?.on('scene:leaving', () => {
    regionNow.id = '';
    regionNow.name = '';
  });
  ev?.on('region:entered', ({ id, name }) => {
    regionNow.id = ident(id, 32);
    regionNow.name = name;
    s.poke();
  });
  ev?.on('player:levelup', () => s.poke());
  return s;
}
