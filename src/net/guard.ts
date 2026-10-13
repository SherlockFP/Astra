import { G } from '../game/G';
import { PARTY_ID_BASE } from '../types/common';
import type { SkillDef } from '../types/skills';
import type { Player } from '../entities/Player';
import { SKILLS } from '../data/skills';
import { monsterHP } from '../data/mythicAffixes';
import { LEVEL_CAP } from '../types/character';
import { toast } from '../systems/notify';
import { clampNum } from './messages';

/**
 * Host-side validation of client-sent combat messages (ROADMAP F6, ARCHITECTURE "Damage authority"). The attacker computes
 * the damage and the host applies it, so a stranger in a public room could otherwise kill bosses from across the map, fail
 * key timers with fake deaths or flood hits. Each check is cheap. A rejected message is dropped and counted per peer; the
 * first rejection per peer per 10 s is logged as console.warn('[net-guard]', reason, peer). A peer with more than 200
 * rejections in 60 s gets one local warning toast on the host. pdeath ownership, rate and revive order are checked on every peer.
 * OWNER: net module.
 */

/**
 * Height range accepted from the wire for `y` in pstate and in the enemy tuple (element 12, flag 16; ENGINE_VERTICALITY §15).
 * Same bounds as Replication.cleanPState (−100..300). Validator floors (VERT.Y_MIN..Y_MAX) are stricter and live in the content check.
 */
export const SYNC_Y_MIN = -100;
export const SYNC_Y_MAX = 300;
/** True when a wire height is a finite number inside SYNC_Y_MIN..SYNC_Y_MAX. A false result means the message's y must be dropped. */
export function syncYOk(y: unknown): y is number {
  return typeof y === 'number' && Number.isFinite(y) && y >= SYNC_Y_MIN && y <= SYNC_Y_MAX;
}

/** `hit` token bucket per peer (ROADMAP F6: about 40 hits/s). */
export const HIT_BUCKET_CAPACITY = 60;
export const HIT_BUCKET_REFILL = 40;      // tokens / s
/** Reach slack (m) on top of the skill range. */
export const REACH_SLACK = 4;
/** Reach (m): melee without a skill range, unknown skill, and DoT / tick hits (they can outlive the caster's position). */
const MELEE_REACH = 6;
const UNKNOWN_REACH = 30;
/**
 * Single hit cap = max(floor, mult x monsterHP(sender level)), level clamped to 1..LEVEL_CAP. Hits above it are clamped, not
 * dropped. The old 1.5 x monsterHP term peaked at 3369 (level 60), under the 5000 floor, so the level term never applied and
 * honest heavy and crit hits were cut. At level 60 the cap is about 112k, roughly 8x the GDD_CLASSES_V2 7.1 reference
 * ultimate (about 14k).
 */
export const AMOUNT_CAP_FLOOR = 20000;
export const AMOUNT_CAP_MULT = 50;
/** Minimum real-clock gap (s) between two accepted deaths of one player. A repeat inside it is dropped (its +15 s penalty is lost). */
export const DEATH_MIN_GAP_SEC = 5;
/** More rejections than this inside SUSPECT_WINDOW_SEC raise the host toast (once per peer). */
const SUSPECT_REJECTS = 200;
const SUSPECT_WINDOW_SEC = 60;
const LOG_EVERY_SEC = 10;
/** Per-peer state is kept for at most this many peers (oldest dropped first). */
const MAX_PEERS = 128;

interface PeerRecord {
  tokens: number;
  tokensAt: number;     // s, last refill
  winAt: number;        // s, start of the current rejection window
  winCount: number;     // rejections in that window
  toasted: boolean;
  logAt: number;        // s, last console line for this peer
}

const peers = new Map<string, PeerRecord>();
/** Players whose death the host already accepted (until a revive). Keyed by the entity object, so a recreated player starts clean. */
const deathSeen = new WeakSet<Player>();
/** Real-clock time (s) of the last accepted death per player entity (rate limit against repeated pdeath). */
const deathAt = new WeakMap<Player, number>();

/** Seconds on the real clock (rate limits must not depend on the sim clock, which pauses and scales). */
function now(): number {
  return performance.now() / 1000;
}

function recOf(peer: string): PeerRecord {
  let r = peers.get(peer);
  if (!r) {
    if (peers.size >= MAX_PEERS) {
      const oldest = peers.keys().next().value;
      if (oldest !== undefined) peers.delete(oldest);
    }
    const t = now();
    r = { tokens: HIT_BUCKET_CAPACITY, tokensAt: t, winAt: t, winCount: 0, toasted: false, logAt: -Infinity };
    peers.set(peer, r);
  }
  return r;
}

function nameOf(peer: string): string {
  return (G.net?.peers.get(peer)?.name ?? peer).slice(0, 24);
}

/** Console line for one peer at most every LOG_EVERY_SEC (shared by rejections and clamps). */
function logOnce(peer: string, reason: string): void {
  const r = recOf(peer);
  const t = now();
  if (t - r.logAt < LOG_EVERY_SEC) return;
  r.logAt = t;
  console.warn('[net-guard]', reason, peer);
}

/** Counts a rejection, logs it (throttled) and raises the host toast once a peer crosses the suspicion threshold. */
function reject(peer: string, reason: string): void {
  const r = recOf(peer);
  const t = now();
  if (t - r.winAt > SUSPECT_WINDOW_SEC) { r.winAt = t; r.winCount = 0; }
  r.winCount++;
  logOnce(peer, reason);
  if (r.winCount > SUSPECT_REJECTS && !r.toasted && G.net?.isAuthority) {
    r.toasted = true;
    toast(`Şüpheli oyuncu: ${nameOf(peer)}`, 'warning');
  }
}

/** Party entity id of a peer (PARTY_ID_BASE + slot, as Replication and Combat use), or null when it is not in the roster. */
export function partyEntityOf(peer: string): number | null {
  const info = G.net?.peers.get(peer);
  return info ? PARTY_ID_BASE + info.slot : null;
}

/** One token per hit; false when the bucket is empty. */
function takeToken(peer: string): boolean {
  const r = recOf(peer);
  const t = now();
  r.tokens = Math.min(HIT_BUCKET_CAPACITY, r.tokens + (t - r.tokensAt) * HIT_BUCKET_REFILL);
  r.tokensAt = t;
  if (r.tokens < 1) return false;
  r.tokens -= 1;
  return true;
}

/** Reach (m) of a hit measured from the sender's last known position. */
function reachOf(skillId: string | undefined, isDot: boolean): number {
  // skillId comes from the wire: only own keys count (SKILLS['constructor'] is an inherited function, not a skill)
  const own = typeof skillId === 'string' && !isDot && Object.prototype.hasOwnProperty.call(SKILLS, skillId);
  const sk: SkillDef | undefined = own ? SKILLS[skillId as string] : undefined;
  if (!sk || !Array.isArray(sk.tags)) return UNKNOWN_REACH;
  const melee = sk.targeting === 'melee_arc' || sk.tags.includes('melee');
  const base = typeof sk.range === 'number' && sk.range > 0 ? sk.range : melee ? MELEE_REACH : UNKNOWN_REACH;
  return base + (typeof sk.radius === 'number' && sk.radius > 0 ? sk.radius : 0);
}

/**
 * Host gate for one client `hit` (also parries and status-only hits). Returns the damage to apply (clamped) or null when the
 * hit must be dropped. Checks, in order: known party sender whose player is alive, token bucket, reach, amount cap.
 */
export function vetHit(
  peer: string,
  target: { position: { x: number; z: number }; radius?: number },
  skillId: string | undefined,
  isDot: boolean,
  amount: number,
): number | null {
  const id = partyEntityOf(peer);
  if (id === null) { reject(peer, 'hit-unknown-peer'); return null; }
  const sender = G.world?.get<Player>(id);
  if (!sender || sender.kind !== 'player') { reject(peer, 'hit-no-player'); return null; }
  if (sender.isDead) { reject(peer, 'hit-sender-dead'); return null; }
  if (!takeToken(peer)) { reject(peer, 'hit-rate'); return null; }
  const dx = sender.position.x - target.position.x;
  const dz = sender.position.z - target.position.z;
  // the target's body radius counts too (a swing at the edge of a big monster is centre-to-centre further than its reach)
  const body = typeof target.radius === 'number' && target.radius > 0 ? target.radius : 0;
  if (Math.hypot(dx, dz) > reachOf(skillId, isDot) + REACH_SLACK + body) { reject(peer, 'hit-range'); return null; }
  const raw = Number.isNaN(amount) ? 0 : Math.max(0, amount);
  // the level is clamped, so a forged huge level cannot lift the cap
  const cap = Math.max(AMOUNT_CAP_FLOOR, AMOUNT_CAP_MULT * monsterHP(clampNum(sender.level, 1, LEVEL_CAP, 1)));
  if (raw > cap) { logOnce(peer, 'hit-amount-clamped'); return cap; }
  return raw;
}

/**
 * Gate for `pdeath` (death or revive of a player entity). Accepted only from the peer that owns the entity. A death needs
 * DEATH_MIN_GAP_SEC since the last accepted one, and a death the host already sees is ignored, so one peer cannot fail a
 * key timer by repeating its own death (+15 s each). A revive is accepted only while the host sees the entity dead, so a
 * forged revive cannot re-arm the death check. Returns false to drop the message.
 */
export function vetPlayerDeath(peer: string, pl: Player, dead: boolean): boolean {
  if (partyEntityOf(peer) !== pl.id) { reject(peer, 'death-not-owner'); return false; }
  if (!dead) {
    if (!deathSeen.has(pl) && !pl.isDead) { reject(peer, 'revive-not-dead'); return false; }
    deathSeen.delete(pl);
    return true;
  }
  if (deathSeen.has(pl) && pl.isDead) { reject(peer, 'death-repeat'); return false; }
  const t = now();
  const last = deathAt.get(pl);
  if (last !== undefined && t - last < DEATH_MIN_GAP_SEC) { reject(peer, 'death-rate'); return false; }
  deathAt.set(pl, t);
  deathSeen.add(pl);
  return true;
}
