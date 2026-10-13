import * as THREE from 'three';
import { G } from '../game/G';
import type { Player } from '../entities/Player';
import type { World } from '../world/World';
import type { NetChannels, PvpMsg } from '../types/net';
import type { StatusApply, StatusId } from '../types/skills';
import type { EntityId } from '../types/common';
import type { CastCtx } from '../combat/skills/behaviors';
import type { HitSpec } from '../combat/Combat';
import { SKILLS } from '../data/skills';
import { monsterHP } from '../data/mythicAffixes';
import { LEVEL_CAP } from '../types/character';
import { NATIONS, nationOfSave, nationTag, type NationId } from '../data/nations';
import { CAPTURE_POINTS, PVP_BASES, PVP_MIN_LEVEL, PVP_ZONE_ID, PVP_ZONE_NAME, nationAt, nationIdx } from '../data/pvpZone';
import {
  PVP, PVP_STATUSES, CaptureField, PvpBoard, pvpCcDuration, pvpDeny, pvpHitCap, pvpShapeHit, streakTitle,
  type CapPresence, type PvpDeny,
} from './PvpRules';
import { partyEntityOf, vetPvpHit } from '../net/guard';
import { clampNum, isObj, sanitizeText } from '../net/messages';

/**
 * KIZIL SINIR RUNTIME (WP-07). Lives while the PvP zone's DungeonScene lives (`startPvp` / `PvpRuntime.dispose`). The rules are in
 * systems/PvpRules.ts (pure, tested by dev/combat-sim/pvp.mjs); this file wires them to the game:
 *
 *  - HIT PATH (attacker-computed, victim-mitigated, host-vetted, GDD_PVP_FINDER D4 without a new channel):
 *      the attacker's SkillSystem calls `pvp.onFired` after a skill fired; the runtime finds hostile players in the skill's shape
 *      (PvpRules.pvpShapeHit), rolls the damage with Combat.rollOutgoing and sends it on the EXISTING `hit` channel (targetId = a
 *      player entity). The host (Combat.onNetHit -> `onClientHit`) vets it with net/guard.vetPvpHit (zone / nation / safe box, shared
 *      hit bucket, reach, PvP bucket, PvP amount cap), remembers it for kill credit and forwards it to the victim on the host-only
 *      `pvp` channel ({k:'hit'}). The victim re-checks the rules with its own view, applies the 60 % PvP reduction and runs the normal
 *      Combat.hitLocalPlayer pipeline (i-frames, parry, dodge, block, armour). Nobody else ever changes a player's HP.
 *  - KILLS: the victim's own death (pdeath -> 'player:died') triggers the host's credit: the last PvP hitter within CREDIT_SEC gets
 *      the kill, honour (anti-farm), streak; the host broadcasts {k:'pkill'}; every peer prints the kill feed line and each owner
 *      updates its OWN save (kills / deaths / Onur).
 *  - CAPTURE: the host steps PvpRules.CaptureField with the alive, level-gated players and publishes {k:'pcap'} twice a second.
 *  - RESPAWN: the dead are released at their own nation's graveyard after PVP.RESPAWN_SEC (no "Burada Diril", no XP penalty).
 */

export interface PvpOpts {
  world: World;
  scene: THREE.Scene;
  /** Walkable point near (x, z), or null. */
  nearestWalkable(x: number, z: number, r: number): { x: number; z: number } | null;
  teleport(x: number, z: number, yaw: number): void;
  /** Releases the dead local player (the scene's own release path: teleport to respawnPoint + revive). */
  release(): void;
  groundY?(x: number, z: number): number;
  /** Seconds clock (default: performance.now). Injected by the sim. */
  now?(): number;
}

export interface PvpSnapshot {
  scores: [number, number];
  points: { id: string; name: string; owner: number; side: number; prog: number }[];
  rows: { id: number; name: string; n: number; kills: number; deaths: number; honour: number; self: boolean }[];
  respawnLeft: number;
  nation: NationId | null;
}

interface Credit { a: EntityId; t: number }

let current: PvpRuntime | null = null;

/** True while the Kızıl Sınır scene runs (the death panel, the scene's release path and the skill system ask). */
export const pvpZoneActive = (): boolean => current !== null;

/** The module-level door the combat code uses; every call is a no-op outside the PvP zone. */
export const pvp = {
  get runtime(): PvpRuntime | null { return current; },
  get active(): boolean { return current !== null; },
  /** SkillSystem: a skill fired for the local player. */
  onFired(c: CastCtx): void { current?.onFired(c); },
  /** Combat.onNetHit (host): a client hit whose target may be a player. Returns true when it was one (handled, never an enemy hit). */
  onClientHit(from: string, p: NetChannels['hit']): boolean { return current ? current.onClientHit(from, p) : false; },
  /** Scene release handler: the respawn timer is still running. */
  releaseBlocked(): boolean { return current?.releaseBlocked() ?? false; },
  respawnPoint(): { x: number; z: number; yaw: number } | null { return current?.respawnPoint() ?? null; },
  snapshot(): PvpSnapshot | null { return current?.snapshot() ?? null; },
};

export function startPvp(o: PvpOpts): PvpRuntime {
  current?.dispose();
  current = new PvpRuntime(o);
  return current;
}

const reachOf = (skillId: string | undefined): number => {
  const sk = typeof skillId === 'string' && Object.prototype.hasOwnProperty.call(SKILLS, skillId) ? SKILLS[skillId] : undefined;
  if (!sk || !Array.isArray(sk.tags)) return 30;
  const melee = sk.targeting === 'melee_arc' || sk.tags.includes('melee');
  const base = typeof sk.range === 'number' && sk.range > 0 ? sk.range : melee ? 6 : 30;
  return base + (typeof sk.radius === 'number' && sk.radius > 0 ? sk.radius : 0);
};

export class PvpRuntime {
  readonly field = new CaptureField();
  readonly board = new PvpBoard();
  private readonly o: PvpOpts;
  private readonly now: () => number;
  private readonly offs: (() => void)[] = [];
  private readonly credit = new Map<EntityId, Credit>();
  private seq = 0;
  private deadAt = -1;
  private syncT = 0;
  private capT = 0;
  private boardT = 0;
  private wireRows: PvpSnapshot['rows'] = [];
  private wireScore: [number, number] = [0, 0];
  private readonly visual = new THREE.Group();
  private rings: { ring: THREE.Mesh; beam: THREE.Mesh; mat: THREE.MeshBasicMaterial; bmat: THREE.MeshBasicMaterial }[] = [];
  private clock = 0;
  private disposed = false;

  constructor(o: PvpOpts) {
    this.o = o;
    this.now = o.now ?? (() => performance.now() / 1000);
    this.buildVisuals();
    const ev = G.events;
    if (ev) {
      this.offs.push(ev.on('player:died', (e) => this.onDied(e.entityId, e.local)));
      this.offs.push(ev.on('player:revived', (e) => { if (e.local) this.deadAt = -1; }));
    }
    if (G.net) this.offs.push(G.net.on('pvp', (m, from) => this.onMsg(m, from)));
    this.enter();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    this.o.scene.remove(this.visual);
    this.visual.traverse((c) => {
      const m = c as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    for (const r of this.rings) { r.mat.dispose(); r.bmat.dispose(); }
    this.rings = [];
    if (current === this) current = null;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // identity helpers
  // ------------------------------------------------------------------------------------------------------------------

  private auth(): boolean { return !G.net || G.net.isAuthority; }
  private me(): Player | null { return this.o.world.localPlayer ?? null; }

  /** Nation of a player entity: set by Player (local) / Replication (remote); the local save is the fallback. */
  nationOf(p: Player): NationId | null {
    if (p.nation) return p.nation;
    if (p.isLocal && G.character) return nationOfSave(G.character.save);
    return null;
  }

  private ctxOf(a: Player, v: Player) {
    return {
      zoneId: PVP_ZONE_ID, aNation: this.nationOf(a), vNation: this.nationOf(v), aId: a.id, vId: v.id, aDead: a.isDead, vDead: v.isDead,
      aPos: a.position, vPos: v.position, aLevel: a.level, vLevel: v.level,
    };
  }

  // ------------------------------------------------------------------------------------------------------------------
  // zone entry
  // ------------------------------------------------------------------------------------------------------------------

  private enter(): void {
    const me = this.me();
    if (!me) return;
    const n = this.nationOf(me);
    if (n) {
      const b = PVP_BASES[n];
      const p = this.o.nearestWalkable(b.spawn[0], b.spawn[1], 8) ?? { x: b.spawn[0], z: b.spawn[1] };
      this.o.teleport(p.x, p.z, b.yaw);
    }
    const nm = n ? NATIONS[n].name : '?';
    G.ui?.toast(`${PVP_ZONE_NAME}: ${nm} olarak savaşıyorsun. Karargâh güvenli bölgedir. Skor: /skor`, 'info');
    if (me.level < PVP_MIN_LEVEL) G.ui?.toast(`Seviye ${PVP_MIN_LEVEL} altındasın: bu bölgede PvP dışındasın (ne vurabilirsin ne vurulursun).`, 'warning');
  }

  respawnPoint(): { x: number; z: number; yaw: number } | null {
    const me = this.me();
    const n = me ? this.nationOf(me) : null;
    if (!n) return null;
    const b = PVP_BASES[n];
    const p = this.o.nearestWalkable(b.spawn[0], b.spawn[1], 8) ?? { x: b.spawn[0], z: b.spawn[1] };
    return { x: p.x, z: p.z, yaw: b.yaw };
  }

  respawnLeft(): number {
    return this.deadAt < 0 ? 0 : Math.max(0, PVP.RESPAWN_SEC - (this.now() - this.deadAt));
  }

  releaseBlocked(): boolean {
    const me = this.me();
    return !!me?.isDead && this.deadAt >= 0 && this.respawnLeft() > 0.05;
  }

  private onDied(entityId: EntityId, local: boolean): void {
    if (local) {
      this.deadAt = this.now();
      G.ui?.toast(`Düştün. ${PVP.RESPAWN_SEC} sn sonra karargâhında dirileceksin.`, 'warning');
    }
    if (this.auth()) this.hostDeath(entityId);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // tick
  // ------------------------------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.disposed) return;
    this.clock += dt;
    this.updateVisuals();
    const me = this.me();
    if (me?.isDead && this.deadAt >= 0 && this.respawnLeft() <= 0) {
      this.deadAt = -2;
      try { this.o.release(); } catch (e) { console.warn('[pvp] release failed', e); }
    }
    if (this.auth()) this.hostTick(dt);
  }

  private presence(): CapPresence[] {
    const out: CapPresence[] = [];
    for (const p of this.o.world.players) {
      if (p.isDead || p.level < PVP_MIN_LEVEL) continue;
      const n = nationIdx(this.nationOf(p));
      if (n < 0) continue;
      out.push({ id: p.id, n: n as 0 | 1, x: p.position.x, z: p.position.z });
    }
    return out;
  }

  private hostTick(dt: number): void {
    const evs = this.field.step(dt, this.presence());
    this.syncT += dt;
    if (this.syncT >= 1) { this.syncT = 0; this.syncBoard(); }
    for (const e of evs) {
      for (const id of e.by) this.board.pay(id, PVP.HONOUR_FLIP);
      this.broadcast({ k: 'pcap', p: this.field.toWire(), sc: this.scores(), ev: { id: e.point, to: e.to, by: e.by } });
      this.applyFlip(e.point, e.to, e.by);
      this.capT = 0;
    }
    this.capT += dt;
    if (this.capT >= 0.5) { this.capT = 0; this.broadcast({ k: 'pcap', p: this.field.toWire(), sc: this.scores() }); }
    this.boardT += dt;
    if (this.boardT >= 2) { this.boardT = 0; this.broadcast({ k: 'pboard', rows: this.board.toWire(), sc: this.scores() }); }
  }

  /** Board rows follow the room: everybody in the world joins (names / levels refresh), the gone leave. */
  private syncBoard(): void {
    const seen = new Set<number>();
    for (const p of this.o.world.players) {
      const n = nationIdx(this.nationOf(p));
      if (n < 0 || p.level < PVP_MIN_LEVEL) continue;
      seen.add(p.id);
      this.board.join(p.id, p.name, n as 0 | 1, p.level);
    }
    for (const id of [...this.board.rows.keys()]) if (!seen.has(id)) this.board.leave(id);
  }

  /** Nation score: capture score (flips + held points) + kills. */
  scores(): [number, number] {
    return [this.field.score[0] + this.board.kills[0] * PVP.SCORE_KILL, this.field.score[1] + this.board.kills[1] * PVP.SCORE_KILL];
  }

  private broadcast(m: PvpMsg): void {
    if (!G.net || !G.net.isOnline) return;
    G.net.broadcast('pvp', m);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // attacker side: SkillSystem hook
  // ------------------------------------------------------------------------------------------------------------------

  onFired(c: CastCtx): void {
    if (c.remote || this.disposed) return;
    const me = c.caster;
    if (!me.isLocal || me.isDead) return;
    const d = c.def;
    const dm = d.damage;
    if (!dm || !(dm.coef > 0)) return;
    const myNation = this.nationOf(me);
    if (!myNation || me.level < PVP_MIN_LEVEL) return;
    const shapeCtx = { caster: { x: me.position.x, z: me.position.z }, dir: c.dir, point: c.point } as const;
    let hits = 0;
    for (const v of this.o.world.players) {
      if (v === me || v.isLocal || hits >= 6) continue;
      if (pvpDeny(this.ctxOf(me, v)) !== null) continue;
      if (!pvpShapeHit(d, shapeCtx, { x: v.position.x, z: v.position.z, radius: v.radius })) continue;
      hits++;
      this.strikePlayer(c, me, v);
    }
  }

  private strikePlayer(c: CastCtx, me: Player, v: Player): void {
    const d = c.def;
    const dm = d.damage!;
    const dx = v.position.x - me.position.x, dz = v.position.z - me.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const dir: [number, number] = [dx / len, dz / len];
    const spec: HitSpec = {
      skillId: d.id, coef: dm.coef, flat: dm.flat, type: dm.type, isSpell: d.tags.includes('spell'), tags: d.tags, more: c.more || 1, dir,
    };
    const roll = G.combat.rollOutgoing(me, spec);
    const amount = Math.max(1, Math.round(roll.amount));
    // chances are rolled here; the victim applies what survives (shortened) and never rolls again
    const statuses: StatusApply[] = [];
    for (const s of d.statuses ?? []) {
      if (!PVP_STATUSES.has(s.status)) continue;
      if (s.chance !== undefined && s.chance < 1 && Math.random() > s.chance) continue;
      statuses.push({ status: s.status, duration: s.duration, stacks: s.stacks, magnitude: s.magnitude });
    }
    const hit: NetChannels['hit'] = { targetId: v.id, amount, crit: roll.crit, type: dm.type, skillId: d.id, statuses, knockback: d.knockback ?? 0, dir };
    // the attacker's cue: the predicted number after the 60 % reduction (the real result is the victim's)
    try {
      G.events.emit('damage', {
        targetId: v.id, sourceId: me.id, amount: Math.round(amount * PVP.DAMAGE_MULT), crit: roll.crit, type: dm.type, kind: roll.crit ? 'crit' : 'normal',
        pos: [v.position.x, v.position.y + v.height * 0.7, v.position.z], skillId: d.id,
      });
    } catch { /* feedback only */ }
    if (this.auth()) this.hostHit(null, me, v, hit);
    else G.net.sendToHost('hit', hit);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // host: vet, remember, forward
  // ------------------------------------------------------------------------------------------------------------------

  /** Combat.onNetHit (host): true when the target was a player entity. */
  onClientHit(from: string, p: NetChannels['hit']): boolean {
    const v = this.o.world.get<Player>(p.targetId);
    if (!v || v.kind !== 'player') return false;
    const id = partyEntityOf(from);
    const a = id === null ? undefined : this.o.world.get<Player>(id);
    if (!a || a.kind !== 'player') return true;
    this.hostHit(from, a, v, p);
    return true;
  }

  /** `from` = the sending peer (null: the host's own player). */
  hostHit(from: string | null, a: Player, v: Player, h: NetChannels['hit']): void {
    if (!this.auth()) return;
    const deny: PvpDeny = pvpDeny(this.ctxOf(a, v));
    const raw = Number(h.amount);
    let amount: number | null;
    if (from) amount = vetPvpHit(from, v, h.skillId, !!h.isDot, raw, deny);
    else if (deny !== null || h.isDot) amount = null;
    else amount = Math.min(Math.max(0, Number.isNaN(raw) ? 0 : raw), pvpHitCap(clampNum(a.level, 1, LEVEL_CAP, 1), monsterHP));
    if (amount === null || !(amount > 0)) return;
    this.credit.set(v.id, { a: a.id, t: this.now() });
    const dir = Array.isArray(h.dir) && Number.isFinite(h.dir[0]) && Number.isFinite(h.dir[1]) ? [clampNum(h.dir[0], -1, 1, 0), clampNum(h.dir[1], -1, 1, 1)] as [number, number] : [0, 1] as [number, number];
    const msg: Extract<PvpMsg, { k: 'hit' }> = {
      k: 'hit', to: v.isLocal ? 'self' : G.net?.peerOfEntity(v.id) ?? '', amount: Math.round(amount), type: h.type, crit: !!h.crit, skillId: typeof h.skillId === 'string' ? h.skillId.slice(0, 48) : undefined,
      statuses: cleanStatuses(h.statuses), knockback: clampNum(h.knockback, -6, 6, 0), dir, aLvl: clampNum(a.level, 1, LEVEL_CAP, 1), aIlvl: 0, seq: ++this.seq, from: a.id,
    };
    if (v.isLocal) this.victimReceive(msg);
    else if (msg.to && G.net) G.net.sendTo(msg.to, 'pvp', msg);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // victim side
  // ------------------------------------------------------------------------------------------------------------------

  private victimReceive(m: Extract<PvpMsg, { k: 'hit' }>): void {
    const me = this.me();
    if (!me || me.isDead || this.disposed) return;
    const a = typeof m.from === 'number' ? this.o.world.get<Player>(m.from) : undefined;
    if (!a || a.kind !== 'player') return;
    // the victim's own view of the rules (positions, nations, safe boxes): a host that forwards what it should not changes nothing
    if (pvpDeny(this.ctxOf(a, me)) !== null) return;
    const reach = reachOf(m.skillId) + 8 + me.radius;
    if (Math.hypot(a.position.x - me.position.x, a.position.z - me.position.z) > reach) return;
    const cap = pvpHitCap(clampNum(m.aLvl, 1, LEVEL_CAP, 1), monsterHP);
    const amount = Math.max(1, Math.round(Math.min(Math.max(0, Number(m.amount) || 0), cap) * PVP.DAMAGE_MULT));
    const sk = typeof m.skillId === 'string' && Object.prototype.hasOwnProperty.call(SKILLS, m.skillId) ? SKILLS[m.skillId] : undefined;
    const melee = !!sk && (sk.targeting === 'melee_arc' || sk.tags.includes('melee'));
    const statuses = (m.statuses ?? []).map((s) => ({ ...s, duration: pvpCcDuration(s.duration) })).filter((s) => s.duration > 0);
    G.combat.hitLocalPlayer({
      sourceId: a.id, amount, type: m.type, statuses, melee, parryable: melee, blockable: sk ? sk.targeting !== 'ground_aoe' && sk.targeting !== 'self_aoe' : true,
      knockback: Math.min(Math.max(m.knockback ?? 0, -4), 4), dir: m.dir, abilityName: sk?.name ?? 'Oyuncu saldırısı',
      // PvP skips the monster level-difference bonus: the source never counts as higher than the victim
      sourceLevel: Math.min(clampNum(m.aLvl, 1, LEVEL_CAP, 1), me.level),
    });
  }

  // ------------------------------------------------------------------------------------------------------------------
  // kills
  // ------------------------------------------------------------------------------------------------------------------

  private hostDeath(victimId: EntityId): void {
    const cr = this.credit.get(victimId);
    this.credit.delete(victimId);
    if (!cr || this.now() - cr.t > PVP.CREDIT_SEC) return;
    this.syncBoard();
    const aw = this.board.kill(cr.a, victimId, this.now());
    if (!aw) return;
    const k = this.board.rows.get(cr.a)!, v = this.board.rows.get(victimId)!;
    const m: Extract<PvpMsg, { k: 'pkill' }> = { k: 'pkill', killer: cr.a, victim: victimId, kn: k.name, vn: v.name, ka: k.n, va: v.n, h: aw.honour, s: aw.streak, sc: this.scores() };
    this.broadcast(m);
    this.applyKill(m);
  }

  private applyKill(m: Extract<PvpMsg, { k: 'pkill' }>): void {
    const kt = nationTag(nationAt(m.ka)), vt = nationTag(nationAt(m.va));
    const line = `[${kt}] ${m.kn}, [${vt}] ${m.vn} adlı oyuncuyu alt etti!${m.h > 0 ? ` (+${m.h} Onur)` : ''}`;
    G.events?.emit('net:chat', { from: '', text: line, channel: 'system' });
    const title = streakTitle(m.s);
    if (title && m.s >= 3) G.events?.emit('net:chat', { from: '', text: `[${kt}] ${m.kn}: ${title}! (${m.s} galibiyet serisi)`, channel: 'system' });
    this.wireScore = [m.sc[0], m.sc[1]];
    const me = this.me();
    const ch = G.character;
    if (!me || !ch) return;
    if (m.killer === me.id) {
      const rec = ch.pvpRecord();
      rec.kills++;
      rec.honour += m.h;
      rec.honourTotal += m.h;
      rec.bestStreak = Math.max(rec.bestStreak, m.s);
      ch.persist();
      G.events.emit('pvp:honor', { amount: m.h, total: rec.honourTotal, rank: 0 });
      G.ui?.toast(m.h > 0 ? `${m.vn} alt edildi: +${m.h} Onur` : `${m.vn} alt edildi (aynı kurban: Onur yok)`, m.h > 0 ? 'loot' : 'info');
      if (title && m.s >= 3) G.ui?.toast(`${title}! ${m.s} galibiyet serisi`, 'boss');
    } else if (m.victim === me.id) {
      ch.pvpRecord().deaths++;
      ch.persist();
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // capture flips (every peer)
  // ------------------------------------------------------------------------------------------------------------------

  private applyFlip(point: number, to: number, by: readonly number[]): void {
    const def = CAPTURE_POINTS[point];
    const n = nationAt(to);
    if (!def || !n) return;
    const nm = NATIONS[n].name;
    G.events?.emit('net:chat', { from: '', text: `[${NATIONS[n].tag}] ${nm}, ${def.name} noktasını ele geçirdi!`, channel: 'system' });
    G.events?.emit('ui:zoneName', { title: `${def.name}: ${nm}`, subtitle: `${PVP_ZONE_NAME} · nokta ele geçirildi` });
    const me = this.me();
    const ch = G.character;
    if (me && ch && by.includes(me.id)) {
      const rec = ch.pvpRecord();
      rec.captures++;
      rec.honour += PVP.HONOUR_FLIP;
      rec.honourTotal += PVP.HONOUR_FLIP;
      ch.persist();
      G.events.emit('pvp:honor', { amount: PVP.HONOUR_FLIP, total: rec.honourTotal, rank: 0 });
      G.ui?.toast(`${def.name} ele geçirildi: +${PVP.HONOUR_FLIP} Onur`, 'loot');
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // incoming messages (clients; the host authors them)
  // ------------------------------------------------------------------------------------------------------------------

  private onMsg(m: PvpMsg, from: string): void {
    if (this.disposed || !isObj(m as unknown) || G.net.isAuthority || from !== G.net.hostId) return;
    switch (m.k) {
      case 'hit': {
        if (!Number.isFinite(m.amount) || typeof m.from !== 'number') return;
        this.victimReceive({ ...m, statuses: cleanStatuses(m.statuses), dir: Array.isArray(m.dir) && m.dir.length === 2 ? [clampNum(m.dir[0], -1, 1, 0), clampNum(m.dir[1], -1, 1, 1)] : [0, 1] });
        return;
      }
      case 'pcap': {
        this.field.applyWire(m.p, m.sc);
        if (Array.isArray(m.sc) && m.sc.length === 2) this.wireScore = [Math.max(0, Math.round(Number(m.sc[0]) || 0)), Math.max(0, Math.round(Number(m.sc[1]) || 0))];
        const e = m.ev;
        if (isObj(e as unknown) && Number.isInteger(e!.id) && Array.isArray(e!.by)) this.applyFlip(e!.id, Number(e!.to), e!.by.filter((x) => typeof x === 'number').slice(0, 16));
        return;
      }
      case 'pkill': {
        if (typeof m.killer !== 'number' || typeof m.victim !== 'number') return;
        this.applyKill({ k: 'pkill', killer: m.killer, victim: m.victim, kn: sanitizeText(m.kn, 20), vn: sanitizeText(m.vn, 20), ka: m.ka === 1 ? 1 : 0, va: m.va === 1 ? 1 : 0,
          h: Math.round(clampNum(m.h, 0, 200, 0)), s: Math.round(clampNum(m.s, 0, 999, 0)), sc: [clampNum(m.sc?.[0], 0, 1e6, 0), clampNum(m.sc?.[1], 0, 1e6, 0)] });
        return;
      }
      case 'pboard': {
        if (!Array.isArray(m.rows)) return;
        const me = this.me();
        this.wireRows = m.rows.slice(0, 16).filter((r) => Array.isArray(r)).map((r) => ({
          id: Math.round(clampNum(r[0], 0, 1e9, 0)), name: sanitizeText(r[1], 20), n: r[2] === 1 ? 1 : 0, kills: Math.round(clampNum(r[3], 0, 1e5, 0)),
          deaths: Math.round(clampNum(r[4], 0, 1e5, 0)), honour: Math.round(clampNum(r[5], 0, 1e7, 0)), self: me?.id === r[0],
        }));
        if (Array.isArray(m.sc)) this.wireScore = [clampNum(m.sc[0], 0, 1e6, 0), clampNum(m.sc[1], 0, 1e6, 0)];
        return;
      }
      default:
        return;
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // scoreboard data
  // ------------------------------------------------------------------------------------------------------------------

  snapshot(): PvpSnapshot {
    const me = this.me();
    const host = this.auth();
    const rows: PvpSnapshot['rows'] = host
      ? this.board.sorted().map((r) => ({ id: r.id, name: r.name, n: r.n, kills: r.kills, deaths: r.deaths, honour: r.honour, self: me?.id === r.id }))
      : this.wireRows;
    return {
      scores: host ? this.scores() : this.wireScore,
      points: CAPTURE_POINTS.map((d, i) => ({ id: d.id, name: d.name, owner: this.field.pts[i].owner, side: this.field.pts[i].side, prog: this.field.pts[i].prog })),
      rows,
      respawnLeft: this.respawnLeft(),
      nation: me ? this.nationOf(me) : null,
    };
  }

  // ------------------------------------------------------------------------------------------------------------------
  // visuals: one ring + beam per capture point (colour = owner, mixes towards the capturer with the progress)
  // ------------------------------------------------------------------------------------------------------------------

  private buildVisuals(): void {
    const gy = this.o.groundY ?? ((x: number, z: number) => this.o.world.groundY(x, z));
    for (const d of CAPTURE_POINTS) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
      const bmat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(d.r - 0.7, d.r, 48), mat);
      ring.rotation.x = -Math.PI / 2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 16, 16, 1, true), bmat);
      const y = gy(d.x, d.z);
      ring.position.set(d.x, y + 0.12, d.z);
      beam.position.set(d.x, y + 8, d.z);
      this.visual.add(ring, beam);
      this.rings.push({ ring, beam, mat, bmat });
    }
    this.o.scene.add(this.visual);
  }

  private updateVisuals(): void {
    const col = new THREE.Color();
    const tmp = new THREE.Color();
    this.rings.forEach((r, i) => {
      const st = this.field.pts[i];
      col.set(st.owner >= 0 ? NATIONS[nationAt(st.owner)!].hex : 0xb8b8b8);
      if (st.side >= 0 && st.prog > 0) col.lerp(tmp.set(NATIONS[nationAt(st.side)!].hex), Math.min(1, st.prog / PVP.CAPTURE_HOLD_SEC));
      r.mat.color.copy(col);
      r.bmat.color.copy(col);
      const pulse = st.side >= 0 && st.prog > 0 ? 0.5 + 0.5 * Math.sin(this.clock * 6) : 0;
      r.mat.opacity = 0.45 + 0.25 * pulse;
      r.bmat.opacity = 0.16 + 0.22 * Math.min(1, st.prog / PVP.CAPTURE_HOLD_SEC) + 0.1 * pulse;
    });
  }
}

/** Wire statuses -> a safe list: known PvP statuses only, short, no precomputed dps, no chance (rolled by the attacker). */
function cleanStatuses(x: unknown): StatusApply[] {
  if (!Array.isArray(x)) return [];
  const out: StatusApply[] = [];
  for (const s of x.slice(0, 8)) {
    if (out.length >= 3) break;
    if (!isObj(s) || typeof s.status !== 'string' || !PVP_STATUSES.has(s.status)) continue;
    const dur = clampNum(s.duration, 0, 8, 0);
    if (dur <= 0) continue;
    out.push({ status: s.status as StatusId, duration: dur, stacks: Math.round(clampNum(s.stacks, 1, 3, 1)), magnitude: clampNum(s.magnitude, 0, 2, 0) || undefined });
  }
  return out;
}
