/**
 * WP-05 LONCA (guild) shared types. OWNER: net module (systems/Guild.ts, systems/GuildCore.ts). Append-only for everyone else.
 * Trust model and threat model: docs/NETCODE.md section 16.
 */

/** 0 = Lider, 1 = Subay (officer), 2 = Uye (member). */
export type GuildRank = 0 | 1 | 2;

export interface GuildMemberRec {
  /** Character name (self-asserted; the roster binds it to `pk`). */
  n: string;
  r: GuildRank;
  /** The member's ECDSA P-256 public key, raw uncompressed point, base64url (87 chars). */
  pk: string;
}

/** Leader-signed delegation: "public key `pk` may sign rosters as officer `n` while the roster epoch is `ep` and the officer set hashes to `ah`". */
export interface GuildOfficerCert {
  n: string;
  pk: string;
  ep: number;
  /** Hash of the whole officer set (see authorityHash): an officer cannot add or drop officers in a roster they sign. */
  ah: string;
  /** Leader signature (base64url raw r||s, 86 chars). */
  sig: string;
}

/** The signed content of a roster (serialised once to JSON; the signature covers that exact text). */
export interface GuildRosterBody {
  v: 1;
  /** Guild id: 128 random bits, 32 lowercase hex chars. */
  gid: string;
  name: string;
  /** Epoch: bumped only by leader-signed changes of the officer set (invalidates every older officer cert). */
  ep: number;
  /** Revision inside the epoch, +1 per roster change. */
  rev: number;
  /** Leader public key (pinned by every member on the first verified roster). */
  lead: string;
  /** Guild chat key version and a hash of that key (so a delivered key can be checked against the signed roster). */
  kv: number;
  kh: string;
  ts: number;
  m: GuildMemberRec[];
  oc: GuildOfficerCert[];
  /** 1 = the guild was disbanded by the leader. */
  dis?: 1;
}

/** A roster on the wire / in the save: `b` = JSON text of GuildRosterBody, `s` = signature over it, `k` = signer public key. */
export interface SignedRoster {
  b: string;
  s: string;
  k: string;
}

/** Persisted per character (CharacterSave.guild). Optional; created by systems/Guild.ts. */
export interface GuildSave {
  gid: string;
  /** This character's member key pair (private part as JWK; the save is local, see the threat model). */
  mk: { pub: string; priv: JsonWebKey };
  /** Guild chat key version and key (AES-GCM 256, base64url). */
  kv: number;
  key: string;
  /** The latest signed roster this character verified. */
  roster: SignedRoster;
}

/* ------------------------------------------------------------------------------------------------ wire (lobby channels) */

/** Lobby channel `ginv`: invitation handshake. Always sent to ONE peer id. */
export type GuildInviteMsg =
  | { t: 'inv'; id: string; gid: string; from: string; rs: SignedRoster; key: string }
  | { t: 'acc'; id: string; gid: string; name: string; pk: string }
  | { t: 'dec'; id: string; gid: string; name: string };

export interface GuildKeyWrap {
  /** Ephemeral ECDH public key (raw, base64url), AES-GCM iv and ciphertext of the 32 byte chat key. */
  ep: string;
  iv: string;
  ct: string;
}

/** Lobby channel `gsync`: roster gossip (pull / push), key delivery, signed leave notice. Sent to one peer id. */
export type GuildSyncMsg =
  | { t: 'req'; gid: string; have: number }
  | { t: 'ros'; rs: SignedRoster }
  | { t: 'kreq'; gid: string; kv: number; name: string }
  | { t: 'key'; gid: string; kv: number; w: GuildKeyWrap }
  | { t: 'leave'; gid: string; name: string; ts: number; sig: string };

/** Lobby channel `gchat`: guild chat. `ct` is AES-GCM ciphertext of {n, t, ts, sig}; only members hold the key. */
export interface GuildChatMsg {
  t: 'gchat';
  gid: string;
  kv: number;
  iv: string;
  ct: string;
}
