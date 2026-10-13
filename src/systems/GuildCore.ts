import type {
  GuildKeyWrap, GuildMemberRec, GuildOfficerCert, GuildRank, GuildRosterBody, SignedRoster,
} from '../types/guild';
import { isObj } from '../net/messages';
import { cleanChatText, cleanName } from './Social';

/**
 * LONCA CORE (WP-05): the pure part of the guild system. No game state, no network, only WebCrypto (browser and node >= 19 have
 * `globalThis.crypto.subtle`). Threat model: docs/NETCODE.md section 16.
 *
 *  - Identity: a guild is a random 128-bit id plus the ECDSA P-256 public key of its leader. A roster is a JSON text signed by the
 *    leader, or by an officer (Subay) holding a leader-signed certificate {n, pk, ep, ah}. Members pin the leader key from the first
 *    roster they verify (via an invite) and accept later rosters only for that key.
 *  - Ordering: (epoch, revision, leader-signed first, signature text). The epoch is bumped only when the officer set changes, so a
 *    revoked officer's old certificate can never beat a newer leader roster.
 *  - Chat: AES-GCM 256 with a shared key; every chat line is also signed by the sender's member key, so a member cannot pose as
 *    another member. The key is rotated (new `kv`, wrapped per member with ECDH) when somebody leaves or is kicked.
 */

export const GUILD = {
  MIN_LEVEL: 10,
  CREATE_COST: 2500,
  NAME_MIN: 3,
  NAME_MAX: 20,
  MAX_MEMBERS: 40,
  MAX_OFFICERS: 8,
  INVITE_TTL_MS: 60000,
  CHAT_MAX: 200,
  /** Outgoing guild chat: minimum gap between two lines. */
  SEND_GAP_MS: 1000,
  /** Incoming token buckets (per peer): chat 5 + 0.8/s (like SOCIAL), invites and sync are rarer. */
  RECV_CHAT: { cap: 5, perSec: 0.8 },
  RECV_INV: { cap: 3, perSec: 0.1 },
  RECV_SYNC: { cap: 8, perSec: 1 },
  /** Chat lines older / newer than this (ms, sender clock) are dropped as replays. */
  CHAT_SKEW_MS: 10 * 60 * 1000,
  /** Largest accepted roster text (bytes of the JSON). */
  MAX_ROSTER_TEXT: 16000,
  /** Re-ask for a missing key / newer roster no more often than this. */
  RETRY_MS: 8000,
} as const;

export const RANK_NAMES: Record<GuildRank, string> = { 0: 'Lider', 1: 'Subay', 2: 'Üye' };

/* ------------------------------------------------------------------------------------------------ rank permissions */

export const canInvite = (actor: GuildRank): boolean => actor <= 1;
export const canKick = (actor: GuildRank, target: GuildRank): boolean => (actor === 0 ? target !== 0 : actor === 1 && target === 2);
export const canPromote = (actor: GuildRank, target: GuildRank): boolean => actor === 0 && target === 2;
export const canDemote = (actor: GuildRank, target: GuildRank): boolean => actor === 0 && target === 1;
export const canDisband = (actor: GuildRank): boolean => actor === 0;

/* ------------------------------------------------------------------------------------------------ validation */

const HEX32 = /^[0-9a-f]{32}$/;
const PK_RE = /^[A-Za-z0-9_-]{87}$/;
const SIG_RE = /^[A-Za-z0-9_-]{86}$/;
const KH_RE = /^[A-Za-z0-9_-]{22}$/;
const B64_RE = /^[A-Za-z0-9_-]+$/;

export const isGid = (x: unknown): x is string => typeof x === 'string' && HEX32.test(x);
export const isPk = (x: unknown): x is string => typeof x === 'string' && PK_RE.test(x);
export const isSig = (x: unknown): x is string => typeof x === 'string' && SIG_RE.test(x);

/** Guild name: 3-20 chars, letters / digits / space / apostrophe / dot / hyphen, starts with a letter or digit. '' = invalid. */
export function cleanGuildName(input: unknown): string {
  if (typeof input !== 'string') return '';
  const t = cleanChatText(input, 64);
  if (t.length < GUILD.NAME_MIN || t.length > GUILD.NAME_MAX) return '';
  return /^[\p{L}\p{N}][\p{L}\p{N} '.-]*$/u.test(t) ? t : '';
}

const int = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;

/** Roster version used on the presence gossip (`gv`): epoch then revision. */
export const rosterVersion = (b: Pick<GuildRosterBody, 'ep' | 'rev'>): number => b.ep * 1_000_000 + b.rev;

/** Strict parse of a roster body (untrusted JSON). Returns a clean copy with only the known fields, or an error text. */
export function parseBody(text: string): GuildRosterBody | string {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return 'json';
  }
  if (!isObj(o) || o.v !== 1) return 'version';
  if (!isGid(o.gid)) return 'gid';
  const name = cleanGuildName(o.name);
  if (!name || name !== o.name) return 'name';
  if (!int(o.ep, 0, 100000) || !int(o.rev, 1, 999999) || !int(o.kv, 0, 1000000)) return 'numbers';
  if (!isPk(o.lead)) return 'leader';
  if (typeof o.kh !== 'string' || !KH_RE.test(o.kh)) return 'kh';
  if (typeof o.ts !== 'number' || !Number.isFinite(o.ts)) return 'ts';
  if (!Array.isArray(o.m) || o.m.length < 1 || o.m.length > GUILD.MAX_MEMBERS) return 'members';
  if (!Array.isArray(o.oc) || o.oc.length > GUILD.MAX_OFFICERS) return 'certs';
  const names = new Set<string>();
  const keys = new Set<string>();
  const m: GuildMemberRec[] = [];
  let leaders = 0;
  let officers = 0;
  for (const r of o.m) {
    if (!isObj(r) || typeof r.n !== 'string' || !isPk(r.pk) || (r.r !== 0 && r.r !== 1 && r.r !== 2)) return 'member';
    if (!r.n || cleanName(r.n) !== r.n) return 'member name';
    const low = r.n.toLowerCase();
    if (names.has(low) || keys.has(r.pk)) return 'duplicate member';
    names.add(low);
    keys.add(r.pk);
    if (r.r === 0) {
      leaders++;
      if (r.pk !== o.lead) return 'leader key';
    }
    if (r.r === 1) officers++;
    m.push({ n: r.n, r: r.r, pk: r.pk });
  }
  if (leaders !== 1 || officers > GUILD.MAX_OFFICERS) return 'leader count';
  const oc: GuildOfficerCert[] = [];
  for (const c of o.oc) {
    if (!isObj(c) || typeof c.n !== 'string' || !isPk(c.pk) || !int(c.ep, 0, 100000) || !isSig(c.sig) || typeof c.ah !== 'string' || !KH_RE.test(c.ah)) return 'cert';
    oc.push({ n: c.n, pk: c.pk, ep: c.ep, ah: c.ah, sig: c.sig });
  }
  const body: GuildRosterBody = { v: 1, gid: o.gid, name, ep: o.ep, rev: o.rev, lead: o.lead, kv: o.kv, kh: o.kh, ts: o.ts, m, oc };
  if (o.dis === 1) body.dis = 1;
  return body;
}

/* ------------------------------------------------------------------------------------------------ base64url / bytes */

export function b64u(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(str: unknown): Uint8Array<ArrayBuffer> | null {
  if (typeof str !== 'string' || !B64_RE.test(str) || str.length % 4 === 1) return null;
  try {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const enc = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
const dec = (b: ArrayBuffer): string => new TextDecoder().decode(b);

/* ------------------------------------------------------------------------------------------------ crypto primitives */

const subtle = (): SubtleCrypto | null => (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle ? globalThis.crypto.subtle : null);

/** WebCrypto needs a secure context (https or localhost). False = the guild feature is unavailable. */
export const guildCryptoAvailable = (): boolean => subtle() !== null;

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const ECDSA_SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** Guild id: 128 random bits as 32 hex chars. */
export function newGuildId(): string {
  return [...randomBytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fresh AES-GCM chat key (32 random bytes, base64url). */
export const newChatKey = (): string => b64u(randomBytes(32));

export interface MemberKey {
  pub: string;
  priv: JsonWebKey;
}

export async function generateMemberKey(): Promise<MemberKey> {
  const s = subtle();
  if (!s) throw new Error('no WebCrypto');
  const kp = await s.generateKey(ECDSA, true, ['sign', 'verify']);
  const raw = new Uint8Array(await s.exportKey('raw', kp.publicKey));
  return { pub: b64u(raw), priv: await s.exportKey('jwk', kp.privateKey) };
}

const pubCache = new Map<string, CryptoKey>();
const privCache = new Map<string, CryptoKey>();
const aesCache = new Map<string, CryptoKey>();

function remember<T>(map: Map<string, T>, key: string, value: T, cap = 128): void {
  if (map.size >= cap) map.delete(map.keys().next().value as string);
  map.set(key, value);
}

async function importPub(pk: string): Promise<CryptoKey | null> {
  const hit = pubCache.get(pk);
  if (hit) return hit;
  const s = subtle();
  const raw = unb64u(pk);
  if (!s || !raw || raw.length !== 65 || raw[0] !== 4) return null;
  try {
    const k = await s.importKey('raw', raw, ECDSA, false, ['verify']);
    remember(pubCache, pk, k, 512);
    return k;
  } catch {
    return null;
  }
}

export async function signText(priv: JsonWebKey, text: string): Promise<string> {
  const s = subtle();
  if (!s) throw new Error('no WebCrypto');
  const id = String(priv.d ?? '');
  let key = privCache.get(id);
  if (!key) {
    key = await s.importKey('jwk', priv, ECDSA, false, ['sign']);
    remember(privCache, id, key, 16);
  }
  return b64u(new Uint8Array(await s.sign(ECDSA_SIGN, key, enc(text))));
}

export async function verifySig(pk: string, text: string, sig: string): Promise<boolean> {
  const s = subtle();
  const key = await importPub(pk);
  const raw = unb64u(sig);
  if (!s || !key || !raw || raw.length !== 64) return false;
  try {
    return await s.verify(ECDSA_SIGN, key, raw, enc(text));
  } catch {
    return false;
  }
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await (subtle() as SubtleCrypto).digest('SHA-256', bytes));
}

/** Hash of a chat key (first 16 bytes, base64url): lets the signed roster vouch for the key a member receives. */
export async function keyHash(key: string): Promise<string> {
  const raw = unb64u(key);
  if (!raw) return '';
  return b64u((await sha256(enc('efsun-gkh|' + b64u(raw)))).subarray(0, 16));
}

async function aesKey(key: string): Promise<CryptoKey | null> {
  const hit = aesCache.get(key);
  if (hit) return hit;
  const s = subtle();
  const raw = unb64u(key);
  if (!s || !raw || raw.length !== 32) return null;
  const k = await s.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  remember(aesCache, key, k, 16);
  return k;
}

export async function aesEncrypt(key: string, plain: string, aad: string): Promise<{ iv: string; ct: string } | null> {
  const s = subtle();
  const k = await aesKey(key);
  if (!s || !k) return null;
  const iv = randomBytes(12);
  const ct = await s.encrypt({ name: 'AES-GCM', iv, additionalData: enc(aad) }, k, enc(plain));
  return { iv: b64u(iv), ct: b64u(new Uint8Array(ct)) };
}

export async function aesDecrypt(key: string, iv: string, ct: string, aad: string): Promise<string | null> {
  const s = subtle();
  const k = await aesKey(key);
  const ivRaw = unb64u(iv);
  const ctRaw = unb64u(ct);
  if (!s || !k || !ivRaw || ivRaw.length !== 12 || !ctRaw || ctRaw.length < 16 || ctRaw.length > 4096) return null;
  try {
    return dec(await s.decrypt({ name: 'AES-GCM', iv: ivRaw, additionalData: enc(aad) }, k, ctRaw));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------------------------------ key wrapping (ECDH P-256) */

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

async function kek(bits: ArrayBuffer): Promise<CryptoKey> {
  const s = subtle() as SubtleCrypto;
  const raw = await sha256(enc('efsun-gwrap|' + b64u(new Uint8Array(bits))));
  return s.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypts the chat key for ONE member public key (ephemeral-static ECDH + AES-GCM). Only that member's private key opens it. */
export async function wrapKey(chatKey: string, recipientPk: string): Promise<GuildKeyWrap | null> {
  const s = subtle();
  const rraw = unb64u(recipientPk);
  const keyRaw = unb64u(chatKey);
  if (!s || !rraw || rraw.length !== 65 || !keyRaw) return null;
  try {
    const eph = await s.generateKey(ECDH, true, ['deriveBits']);
    const recip = await s.importKey('raw', rraw, ECDH, false, []);
    const bits = await s.deriveBits({ name: 'ECDH', public: recip }, eph.privateKey, 256);
    const iv = randomBytes(12);
    const ct = await s.encrypt({ name: 'AES-GCM', iv, additionalData: enc(recipientPk) }, await kek(bits), keyRaw);
    return { ep: b64u(new Uint8Array(await s.exportKey('raw', eph.publicKey))), iv: b64u(iv), ct: b64u(new Uint8Array(ct)) };
  } catch {
    return null;
  }
}

export async function unwrapKey(w: unknown, myPriv: JsonWebKey, myPk: string): Promise<string | null> {
  const s = subtle();
  if (!s || !isObj(w)) return null;
  const ep = unb64u(w.ep);
  const iv = unb64u(w.iv);
  const ct = unb64u(w.ct);
  if (!ep || ep.length !== 65 || !iv || iv.length !== 12 || !ct || ct.length !== 48) return null;
  try {
    const jwk: JsonWebKey = { ...myPriv };
    delete jwk.key_ops;
    delete jwk.ext;
    delete jwk.alg;
    const priv = await s.importKey('jwk', jwk, ECDH, false, ['deriveBits']);
    const pub = await s.importKey('raw', ep, ECDH, false, []);
    const bits = await s.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
    const raw = await s.decrypt({ name: 'AES-GCM', iv, additionalData: enc(myPk) }, await kek(bits), ct);
    return b64u(new Uint8Array(raw));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------------------------------ roster signing / verification */

const ROSTER_TAG = 'efsun-groster-v1|';
const certText = (gid: string, n: string, pk: string, ep: number, ah: string): string => `efsun-gcert-v1|${gid}|${n}|${pk}|${ep}|${ah}`;

/** Commitment to the officer set: every certificate carries it, so an officer cannot add or drop officers in a roster they sign. */
export async function authorityHash(m: readonly GuildMemberRec[]): Promise<string> {
  const list = m.filter((x) => x.r === 1).map((x) => `${x.n}|${x.pk}`).sort().join(',');
  return b64u((await sha256(enc('efsun-gah|' + list))).subarray(0, 16));
}

/** Leader only: certificates for every current officer at epoch `ep`. */
export async function issueCerts(leaderPriv: JsonWebKey, gid: string, m: readonly GuildMemberRec[], ep: number): Promise<GuildOfficerCert[]> {
  const ah = await authorityHash(m);
  const out: GuildOfficerCert[] = [];
  for (const x of m) if (x.r === 1) out.push({ n: x.n, pk: x.pk, ep, ah, sig: await signText(leaderPriv, certText(gid, x.n, x.pk, ep, ah)) });
  return out;
}

export async function signRoster(body: GuildRosterBody, priv: JsonWebKey, signerPk: string): Promise<SignedRoster> {
  const b = JSON.stringify(body);
  return { b, s: await signText(priv, ROSTER_TAG + b), k: signerPk };
}

export interface VerifiedRoster {
  sr: SignedRoster;
  body: GuildRosterBody;
  leaderSigned: boolean;
}

export type VerifyResult = { ok: true; v: VerifiedRoster } | { ok: false; reason: string };

const certOk = new Set<string>();

/**
 * Full check of an untrusted roster: schema, pinned guild id / leader key (when known), officer certificates, signer authority and the
 * signature. Does NOT compare with an older roster (see checkTransition / isNewer).
 */
export async function verifyRoster(input: unknown, expect: { gid?: string; lead?: string } = {}): Promise<VerifyResult> {
  if (!isObj(input) || typeof input.b !== 'string' || input.b.length > GUILD.MAX_ROSTER_TEXT || !isSig(input.s) || !isPk(input.k)) return { ok: false, reason: 'shape' };
  const sr: SignedRoster = { b: input.b, s: input.s, k: input.k };
  const body = parseBody(sr.b);
  if (typeof body === 'string') return { ok: false, reason: body };
  if (expect.gid && body.gid !== expect.gid) return { ok: false, reason: 'gid' };
  if (expect.lead && body.lead !== expect.lead) return { ok: false, reason: 'leader' };
  const officers = body.m.filter((x) => x.r === 1);
  if (body.oc.length !== officers.length) return { ok: false, reason: 'certs' };
  const ah = await authorityHash(body.m);
  for (const o of officers) {
    const c = body.oc.find((x) => x.pk === o.pk);
    if (!c || c.n !== o.n || c.ep !== body.ep || c.ah !== ah) return { ok: false, reason: 'cert mismatch' };
    const text = certText(body.gid, c.n, c.pk, c.ep, c.ah);
    const memo = text + '|' + c.sig;
    if (!certOk.has(memo)) {
      if (!(await verifySig(body.lead, text, c.sig))) return { ok: false, reason: 'cert signature' };
      if (certOk.size > 512) certOk.clear();
      certOk.add(memo);
    }
  }
  const leaderSigned = sr.k === body.lead;
  if (!leaderSigned && !officers.some((o) => o.pk === sr.k)) return { ok: false, reason: 'signer' };
  if (body.dis && !leaderSigned) return { ok: false, reason: 'disband' };
  if (!(await verifySig(sr.k, ROSTER_TAG + sr.b, sr.s))) return { ok: false, reason: 'signature' };
  return { ok: true, v: { sr, body, leaderSigned } };
}

/** Is `a` strictly better than `held`? (epoch, revision, leader-signed, signature text: every peer picks the same winner.) */
export function isNewer(a: VerifiedRoster, held: VerifiedRoster | null): boolean {
  if (!held) return true;
  if (a.body.ep !== held.body.ep) return a.body.ep > held.body.ep;
  if (a.body.rev !== held.body.rev) return a.body.rev > held.body.rev;
  if (a.leaderSigned !== held.leaderSigned) return a.leaderSigned;
  return a.sr.s > held.sr.s;
}

/**
 * Rules for replacing the roster a member already holds with a newer, verified one. null = allowed, else the reason.
 * Both leader and officers: same guild / leader / name, member keys never change, chat key version moves by at most +1.
 * A disband must be leader-signed (checked in verifyRoster).
 */
export function checkTransition(held: GuildRosterBody | null, next: GuildRosterBody): string | null {
  if (!held) return null;
  if (held.gid !== next.gid) return 'gid';
  if (held.lead !== next.lead) return 'leader';
  if (held.name !== next.name) return 'name';
  if (held.dis) return 'disbanded';
  if (next.kv < held.kv || next.kv > held.kv + 1) return 'kv';
  const old = new Map(held.m.map((x) => [x.n.toLowerCase(), x]));
  for (const x of next.m) {
    const o = old.get(x.n.toLowerCase());
    if (o && o.pk !== x.pk) return 'member key';
  }
  return null;
}

export const memberOf = (b: GuildRosterBody, name: string): GuildMemberRec | null => b.m.find((x) => x.n.toLowerCase() === name.toLowerCase()) ?? null;

/* ------------------------------------------------------------------------------------------------ chat / leave signatures */

export const chatSignText = (gid: string, n: string, t: string, ts: number): string => `efsun-gchat-v1|${gid}|${n}|${ts}|${t}`;
export const leaveSignText = (gid: string, n: string, ts: number): string => `efsun-gleave-v1|${gid}|${n}|${ts}`;
export const chatAad = (gid: string, kv: number): string => `${gid}|${kv}`;
