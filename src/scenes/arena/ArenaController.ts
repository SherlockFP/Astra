import * as THREE from 'three';
import { G } from '../../game/G';
import type { Player } from '../../entities/Player';
import type { World } from '../../world/World';
import type { BuiltDungeon } from '../../world/DungeonBuilder';
import type { NetChannels, PvpMsg, ArenaMsg } from '../../types/net';
import type { StatusApply } from '../../types/skills';
import type { CastCtx } from '../../combat/skills/behaviors';
import type { HitSpec } from '../../combat/Combat';
import type { ArenaDef, ArenaParams, ArenaPhase } from '../../types/arena';
import type { ArenaBracket } from '../../types/finder';
import { TILE_SIZE } from '../../types/dungeons';
import { PARTY_ID_BASE } from '../../types/common';
import { LEVEL_CAP } from '../../types/character';
import { SKILLS } from '../../data/skills';
import { monsterHP } from '../../data/mythicAffixes';
import { PVP_STATUSES, pvpShapeHit, type PvpDeny } from '../../systems/PvpRules';
import { cleanStatuses, reachOf, setPvpHook, type PvpHook } from '../../systems/Pvp';
import { setStatContext } from '../../systems/StatCalc';
import { partyEntityOf, vetPvpHit } from '../../net/guard';
import { clampNum, isObj, sanitizeArenaMsg, sanitizeText } from '../../net/messages';
import { ARENA_PVP, CcDiminish, arenaHitAmount, clampSlow, pvpOutgoing, setArenaCombat } from '../../combat/pvp';
import { ArenaMatch, type ArenaEvent, type ArenaResult } from './ArenaMatch';
import { arenaDeny, tileToWorld } from './arenaRules';
import { emit, toast } from '../../systems/notify';

/**
 * ARENA RUNTIME (GDD_PVP_FINDER §3.3 / §3.5, package PV-04). Lives while a DungeonScene with `params.arena` runs (`startArena` /
 * `dispose`). The round machine is scenes/arena/ArenaMatch.ts (pure, host-driven, tested by dev/combat-sim/arena.mjs); this file wires it:
 *
 *  - HOST: steps the ArenaMatch, turns its events into host-only `arena` messages (and applies them locally), watches deaths
 *    ('player:died') and leavers (peers missing from the room), echoes the team means in the result.
 *  - EVERY PEER: applies `arena` messages: prep (gates closed, everybody back at the team spawn with full HP / resource / cooldowns,
 *    invulnerable), live (gates open, damage allowed), round_end / match_end (invulnerable again), dampening, and the result, which each
 *    owner turns into ITS OWN rating change and rewards (systems/ArenaLadder.ts).
 *  - HITS: the open-world PvP path (systems/Pvp.ts / Siege.ts) with the arena rules, through the PvpHook door. Design delta vs GDD §3.5:
 *    no `phit` / `phack`. The existing path is already attacker-computed, host-vetted (net/guard.vetPvpHit) and victim-mitigated, so a
 *    second pair of channels would duplicate it. The arena victim applies combat/pvp.ts (damage x0.34, resilience, max-hit cap, CC caps +
 *    diminishing returns, knockback x0.5) before the normal Combat.hitLocalPlayer pipeline.
 *  - PREP: the gates are drawn and block the nav cells of their rects; a leash keeps the team near its spawn even if a map's gate rect
 *    does not seal the pocket.
 */

export interface ArenaOpts {
  world: World;
  scene: THREE.Scene;
  built: BuiltDungeon;
  params: ArenaParams;
  def: ArenaDef;
  teleport(x: number, z: number, yaw: number): void;
  /** Seconds clock (default performance.now). Injected by tests. */
  now?(): number;
}

export interface ArenaFighter { peer: string; name: string; team: 'A' | 'B'; alive: boolean; self: boolean }
export interface ArenaSnapshot {
  phase: ArenaPhase;
  round: number;
  /** Seconds left in the phase (prep countdown, live timer, intermission). */
  left: number;
  score: [number, number];
  myTeam: 'A' | 'B';
  dampPct: number;
  bracket: ArenaBracket;
  ranked: boolean;
  mapName: string;
  fighters: ArenaFighter[];
  result: { winner: 'A' | 'B' | 'draw'; why: ArenaResult['why']; won: boolean | null } | null;
  /** Seconds until the automatic return to town after the result (0 = not decided). */
  exitIn: number;
}

/** Prep leash (m) around the team's first spawn. */
export const PREP_LEASH = 14;
/** Seconds the results stay up before the automatic return to town. */
export const RESULT_HOLD_SEC = 20;

let current: ArenaController | null = null;
export const arenaController = (): ArenaController | null => current;
export const arenaActive = (): boolean => current !== null;

export function startArena(o: ArenaOpts): ArenaController {
  current?.dispose();
  current = new ArenaController(o);
  return current;
}

/** Spawn of `peer` (world metres + yaw): the slot of the peer inside its team picks the spawn point; A faces east, B faces west. */
export function arenaSpawnFor(params: ArenaParams, def: ArenaDef, peer: string): { x: number; z: number; yaw: number; team: 'A' | 'B' } {
  const team: 'A' | 'B' = params.teams.B.includes(peer) ? 'B' : 'A';
  const idx = Math.max(0, params.teams[team].indexOf(peer));
  const list = def.spawns[team];
  const p = tileToWorld(list[idx % list.length]);
  return { ...p, yaw: team === 'A' ? Math.PI / 2 : -Math.PI / 2, team };
}

const fmtName = (s: string): string => sanitizeText(s, 20) || 'Savaşçı';

export class ArenaController implements PvpHook {
  readonly params: ArenaParams;
  readonly def: ArenaDef;
  readonly myTeam: 'A' | 'B';
  private readonly o: ArenaOpts;
  private readonly now: () => number;
  private readonly offs: (() => void)[] = [];
  private readonly selfPeer: string;
  private readonly match: ArenaMatch | null;
  private readonly dr = new CcDiminish();
  private readonly seen = new Map<string, number[]>();
  private readonly visual = new THREE.Group();
  private readonly gateMeshes: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; rect: [number, number, number, number] }[] = [];
  private phase: ArenaPhase = 'loading';
  private round = 1;
  private score: [number, number] = [0, 0];
  private left = 0;
  private damp = 0;
  private result: ArenaResult | null = null;
  private resultApplied = false;
  private exitIn = 0;
  private exiting = false;
  private begun = false;
  private disposed = false;
  private seq = 0;
  private poll = 0;
  private mySpawn: { x: number; z: number; yaw: number };
  private readonly out = new Set<string>();
  private lastSeqIn = new Map<number, number>();

  constructor(o: ArenaOpts) {
    this.o = o;
    this.params = o.params;
    this.def = o.def;
    this.now = o.now ?? (() => performance.now() / 1000);
    this.selfPeer = G.net.selfId;
    const sp = arenaSpawnFor(o.params, o.def, this.selfPeer);
    this.myTeam = sp.team;
    this.mySpawn = sp;
    this.match = this.auth()
      ? new ArenaMatch(
        { matchId: o.params.matchId, bracket: o.params.bracket, ranked: o.params.ranked, teams: o.params.teams, mean: o.params.mean ?? [1500, 1500] },
        (e) => this.hostEmit(e),
        (peer) => this.hpFrac(peer),
      )
      : null;
    this.buildGates();
    setPvpHook(this);
    setArenaCombat(true, 0);
    try {
      setStatContext({ arena: true });
      G.character?.recomputeStats();
    } catch (e) {
      console.warn('[arena] stat context failed', e);
    }
    if (G.net) {
      this.offs.push(G.net.on('pvp', (m, from) => this.onPvp(m, from)));
      this.offs.push(G.net.on('arena', (m, from) => this.onArena(m, from)));
    }
    const ev = G.events;
    this.offs.push(ev.on('player:died', (e) => this.onDied(e.entityId)));
    this.offs.push(ev.on('net:status', (e) => this.onStatus(e.role)));
  }

  // ------------------------------------------------------------------------------------------------------------------
  // identity helpers
  // ------------------------------------------------------------------------------------------------------------------

  private auth(): boolean { return !G.net || G.net.isAuthority; }
  private me(): Player | null { return this.o.world.localPlayer ?? null; }
  isHost(): boolean { return this.auth(); }

  private peerOf(entityId: number): string | null {
    const p = G.net?.peerOfEntity(entityId);
    return p ?? null;
  }
  private teamOfPeer(peer: string | null): 'A' | 'B' | undefined {
    if (!peer) return undefined;
    if (this.params.teams.A.includes(peer)) return 'A';
    if (this.params.teams.B.includes(peer)) return 'B';
    return undefined;
  }
  private teamOfEntity(id: number): 'A' | 'B' | undefined { return this.teamOfPeer(this.peerOf(id)); }
  private entityOf(peer: string): number | null {
    if (peer === this.selfPeer) return this.me()?.id ?? null;
    return partyEntityOf(peer);
  }
  private nameOf(peer: string): string {
    if (peer === this.selfPeer) return fmtName(G.character?.save.name ?? 'Sen');
    return fmtName(G.net?.peers.get(peer)?.name ?? 'Savaşçı');
  }
  private hpFrac(peer: string): number {
    const id = this.entityOf(peer);
    const p = id === null ? undefined : this.o.world.get<Player>(id);
    return p && p.maxHp > 0 ? p.hp / p.maxHp : 0;
  }

  private ctxOf(a: Player, v: Player) {
    return {
      phase: this.phase, aId: a.id, vId: v.id, aTeam: this.teamOfEntity(a.id), vTeam: this.teamOfEntity(v.id), aDead: a.isDead, vDead: v.isDead,
    };
  }
  /** arenaDeny -> the PvpDeny vocabulary of net/guard.vetPvpHit. */
  private denyOf(a: Player, v: Player): PvpDeny {
    const d = arenaDeny(this.ctxOf(a, v));
    if (d === null) return null;
    return d === 'phase' ? 'zone' : d === 'team' ? 'nation' : d;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // snapshot (HUD)
  // ------------------------------------------------------------------------------------------------------------------

  snapshot(): ArenaSnapshot {
    const fighters: ArenaFighter[] = [];
    for (const team of ['A', 'B'] as const) {
      for (const peer of this.params.teams[team]) fighters.push({ peer, name: this.nameOf(peer), team, alive: !this.out.has(peer), self: peer === this.selfPeer });
    }
    const r = this.result;
    return {
      phase: this.phase, round: this.round, left: Math.max(0, this.left), score: [...this.score] as [number, number], myTeam: this.myTeam,
      dampPct: this.damp, bracket: this.params.bracket, ranked: this.params.ranked, mapName: this.def.name, fighters,
      result: r ? { winner: r.winner, why: r.why, won: r.winner === 'draw' ? null : r.winner === this.myTeam } : null, exitIn: this.exitIn,
    };
  }

  // ------------------------------------------------------------------------------------------------------------------
  // host: begin / events
  // ------------------------------------------------------------------------------------------------------------------

  /** Host: every peer finished loading (or the load timed out): start round 1's prep. */
  hostBegin(): void {
    if (!this.match || this.begun || this.disposed) return;
    this.begun = true;
    this.send({ k: 'start', m: this.params.matchId, arenaId: this.params.arenaId, bracket: this.params.bracket, ranked: this.params.ranked, teams: this.params.teams, seed: this.params.seed });
    this.match.begin();
  }

  private send(m: ArenaMsg): void {
    if (G.net?.isOnline) G.net.broadcast('arena', m);
  }

  private hostEmit(e: ArenaEvent): void {
    const m = this.params.matchId;
    let msg: ArenaMsg;
    switch (e.k) {
      case 'phase': msg = { k: 'phase', m, ph: e.ph, round: e.round, left: e.left, score: e.score, ...(e.rw ? { rw: e.rw } : {}) }; break;
      case 'damp': msg = { k: 'damp', m, pct: e.pct }; break;
      case 'out': msg = { k: 'out', m, peer: e.peer, team: e.team }; break;
      case 'forfeit': msg = { k: 'forfeit', m, peer: e.peer }; break;
      case 'result': msg = { k: 'result', m, winner: e.result.winner, why: e.result.why, score: e.result.score, mean: e.result.mean }; break;
    }
    this.send(msg);
    this.apply(msg);
  }

  private onDied(entityId: number): void {
    if (!this.match || this.disposed) return;
    const peer = this.peerOf(entityId);
    if (peer && this.teamOfPeer(peer)) this.match.down(peer);
  }

  private onStatus(role: 'offline' | 'host' | 'client'): void {
    void role; // the verdict (void vs forfeit) is taken in dispose(), from NetSession.lastLeave
  }

  // ------------------------------------------------------------------------------------------------------------------
  // messages
  // ------------------------------------------------------------------------------------------------------------------

  private onArena(raw: NetChannels['arena'], from: string): void {
    if (this.disposed || G.net.isAuthority || from !== G.net.hostId) return;
    const m = sanitizeArenaMsg(raw);
    if (!m || m.m !== this.params.matchId) return;
    this.apply(m);
  }

  /** Applies one arena message (host: its own, clients: the host's). */
  private apply(m: ArenaMsg): void {
    switch (m.k) {
      case 'start':
        return;
      case 'phase': return this.applyPhase(m);
      case 'damp':
        this.damp = m.pct;
        setArenaCombat(true, m.pct);
        emit('arena:damp', { pct: m.pct });
        return;
      case 'out': {
        this.out.add(m.peer);
        const local = m.peer === this.selfPeer;
        emit('arena:out', { peer: m.peer, name: this.nameOf(m.peer), team: m.team, local });
        G.events?.emit('net:chat', { from: '', text: `${this.nameOf(m.peer)} düştü`, channel: 'system' });
        return;
      }
      case 'forfeit':
        toast(`${this.nameOf(m.peer)} maçtan ayrıldı. Maç sonlandı.`, 'warning');
        return;
      case 'result': return this.applyResult(m);
    }
  }

  private applyPhase(m: Extract<ArenaMsg, { k: 'phase' }>): void {
    this.phase = m.ph;
    this.round = m.round;
    this.left = m.left;
    this.score = m.score;
    const me = this.me();
    if (m.ph === 'prep') {
      this.out.clear();
      this.damp = 0;
      setArenaCombat(true, 0);
      this.dr.clear();
      this.closeGates();
      this.resetSelf(m.left);
      toast(`Tur ${Math.min(3, m.round)}/3: kapılar ${Math.round(m.left)} sn sonra açılır`, 'info');
    } else if (m.ph === 'live') {
      this.openGates();
      me?.statuses.remove('invulnerable');
      toast('Kapılar açıldı! Savaş!', 'boss');
    } else {
      // round_end / match_end: nobody can be hurt any more
      me?.statuses.apply('invulnerable', Math.max(m.left, 25), { sourceId: null });
      if (m.ph === 'round_end') {
        toast(m.rw === 'draw' ? 'Tur berabere, tekrar oynanacak.' : m.rw === this.myTeam ? 'Turu kazandın!' : 'Turu kaybettin.', m.rw === this.myTeam ? 'success' : 'warning');
      }
    }
    emit('arena:phase', { ph: m.ph, round: m.round, left: m.left, score: m.score, ...(m.rw ? { rw: m.rw } : {}) });
  }

  /** Prep: everybody is back at the team spawn, full, cooldown-free and invulnerable (arena rounds are fresh, GDD §3.3.1). */
  private resetSelf(prepSec: number): void {
    const me = this.me();
    if (!me) return;
    const sp = this.mySpawn;
    try {
      if (me.isDead) G.combat.reviveLocalPlayer(1);
      this.o.teleport(sp.x, sp.z, sp.yaw);
      me.statuses.clear();
      me.hp = me.maxHp;
      me.resource = me.resourceType === 'rage' ? 0 : me.maxResource;
      G.skills.reset(me);
      me.statuses.apply('invulnerable', prepSec + 0.5, { sourceId: null });
    } catch (e) {
      console.warn('[arena] round reset failed', e);
    }
  }

  private applyResult(m: Extract<ArenaMsg, { k: 'result' }>): void {
    if (this.resultApplied) return;
    this.resultApplied = true;
    this.result = { winner: m.winner, why: m.why, score: m.score, mean: m.mean };
    this.phase = 'match_end';
    const won = m.winner === 'draw' ? null : m.winner === this.myTeam;
    const opp = this.params.teams[this.myTeam === 'A' ? 'B' : 'A'];
    let applied = null as ReturnType<NonNullable<typeof G.arenaLadder>['applyResult']> | null;
    try {
      applied = G.arenaLadder?.applyResult({
        bracket: this.params.bracket, ranked: this.params.ranked, winner: m.winner, why: m.why, myTeam: this.myTeam, mean: m.mean, opponents: opp,
      }) ?? null;
    } catch (e) {
      console.warn('[arena] result apply failed', e);
    }
    const rating = applied?.rating ? { before: applied.rating.before, after: applied.rating.after, delta: applied.rating.delta } : null;
    const rewards = applied ? { onur: applied.rewards.onur, fetih: applied.rewards.fetih, muhru: applied.rewards.muhru } : { onur: 0, fetih: 0, muhru: 0 };
    emit('arena:result', { winner: m.winner, won, why: m.why, score: m.score, bracket: this.params.bracket, ranked: this.params.ranked, rating, rewards });
    if (rating) emit('pvp:rating', { bracket: this.params.bracket, before: rating.before, after: rating.after });
    if (m.why === 'void') toast('Maç sonlandı (lider ayrıldı). Puan ve ödül yok.', 'warning');
    else {
      toast(won === null ? 'Maç berabere' : won ? 'Kazandın!' : 'Kaybettin', won ? 'success' : 'warning');
      if (rating) toast(`Puan: ${rating.before} → ${rating.after} (${rating.delta >= 0 ? '+' : ''}${rating.delta})`, 'info');
      if (rewards.onur || rewards.fetih) toast(`+${rewards.onur} Onur · +${rewards.fetih} Fetih`, 'loot');
      for (const t of applied?.titles ?? []) toast(`Yeni unvan: ${t}`, 'levelup');
    }
    this.exitIn = RESULT_HOLD_SEC;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // tick
  // ------------------------------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.disposed) return;
    if (this.match) {
      this.match.tick(dt);
      this.poll += dt;
      if (this.poll >= 0.5) {
        this.poll = 0;
        this.hostWatchPeers();
      }
    } else if (this.left > 0 && (this.phase === 'prep' || this.phase === 'live' || this.phase === 'round_end')) {
      this.left -= dt;
    }
    if (this.match && (this.phase === 'prep' || this.phase === 'live' || this.phase === 'round_end')) this.left = this.match.left;
    if (this.phase === 'prep') this.leash();
    if (this.exitIn > 0) {
      this.exitIn -= dt;
      if (this.exitIn <= 0) this.exit();
    }
    this.pulseGates();
  }

  private hostWatchPeers(): void {
    const m = this.match;
    if (!m || m.over || !G.net) return;
    for (const team of ['A', 'B'] as const) {
      for (const peer of this.params.teams[team]) {
        if (peer === this.selfPeer || G.net.peers.has(peer)) continue;
        if (!this.begun || m.present.has(peer)) m.leave(peer);
      }
    }
  }

  private leash(): void {
    const me = this.me();
    if (!me || me.isDead) return;
    const sp = this.mySpawn;
    if (Math.hypot(me.position.x - sp.x, me.position.z - sp.z) > PREP_LEASH) this.o.teleport(sp.x, sp.z, sp.yaw);
  }

  /** Leave the arena now (results card button) or when the timer ends. */
  exit(): void {
    if (this.exiting) return;
    this.exiting = true;
    try {
      G.net?.queue?.matchOver?.();
      const net = G.net;
      if (!net || net.role === 'offline') {
        void G.scenes.go('town');
        return;
      }
      const wasHost = net.role === 'host';
      net.leaveRoom();
      if (wasHost) void net.enterScene('town');
    } catch (e) {
      console.warn('[arena] exit failed', e);
      void G.scenes.go('town');
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // gates
  // ------------------------------------------------------------------------------------------------------------------

  private buildGates(): void {
    const nav = this.o.built.nav;
    for (const g of this.def.gates) {
      const x0 = g.rect.x * TILE_SIZE, z0 = g.rect.z * TILE_SIZE, w = g.rect.w * TILE_SIZE, d = g.rect.h * TILE_SIZE;
      const mat = new THREE.MeshBasicMaterial({ color: g.team === 'A' ? 0xff4a3a : 0x3a7aff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.3, w), 4, Math.max(0.3, d)), mat);
      mesh.position.set(x0 + w / 2, 2, z0 + d / 2);
      this.visual.add(mesh);
      this.gateMeshes.push({ mesh, mat, rect: [x0, z0, x0 + w, z0 + d] });
      void nav;
    }
    this.o.scene.add(this.visual);
  }

  private closeGates(): void {
    const nav = this.o.built.nav;
    for (const g of this.gateMeshes) {
      g.mesh.visible = true;
      nav.setRect(g.rect[0], g.rect[1], g.rect[2], g.rect[3], false);
    }
  }
  private openGates(): void {
    const nav = this.o.built.nav;
    for (const g of this.gateMeshes) {
      g.mesh.visible = false;
      nav.setRect(g.rect[0], g.rect[1], g.rect[2], g.rect[3], true);
    }
  }
  private pulseGates(): void {
    if (this.phase !== 'prep') return;
    const k = 0.3 + 0.12 * Math.sin(this.now() * 5);
    for (const g of this.gateMeshes) g.mat.opacity = k;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // hits: attacker (PvpHook)
  // ------------------------------------------------------------------------------------------------------------------

  onFired(c: CastCtx): void {
    if (c.remote || this.disposed) return;
    const me = c.caster;
    if (!me.isLocal || me.isDead || this.phase !== 'live') return;
    const d = c.def;
    const dm = d.damage;
    if (!dm || !(dm.coef > 0)) return;
    const shapeCtx = { caster: { x: me.position.x, z: me.position.z }, dir: c.dir, point: c.point } as const;
    let hits = 0;
    for (const v of this.o.world.players) {
      if (v === me || v.isLocal || hits >= 6) continue;
      if (arenaDeny(this.ctxOf(me, v)) !== null) continue;
      if (!pvpShapeHit(d, shapeCtx, { x: v.position.x, z: v.position.z, radius: v.radius })) continue;
      hits++;
      this.strike(c, me, v);
    }
  }

  private strike(c: CastCtx, me: Player, v: Player): void {
    const d = c.def;
    const dm = d.damage!;
    const dx = v.position.x - me.position.x, dz = v.position.z - me.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const dir: [number, number] = [dx / len, dz / len];
    const spec: HitSpec = {
      skillId: d.id, coef: dm.coef, flat: dm.flat, type: dm.type, isSpell: d.tags.includes('spell'), tags: d.tags, more: c.more || 1, dir,
    };
    const roll = G.combat.rollOutgoing(me, spec);
    // GDD §3.6 pvpOutgoing: x (1 + pvpPower), only against players
    const amount = Math.max(1, Math.round(pvpOutgoing(roll.amount, me.getStat('pvpPower'))));
    const statuses: StatusApply[] = [];
    for (const s of d.statuses ?? []) {
      if (!PVP_STATUSES.has(s.status)) continue;
      if (s.chance !== undefined && s.chance < 1 && Math.random() > s.chance) continue;
      statuses.push({ status: s.status, duration: s.duration, stacks: s.stacks, magnitude: s.magnitude });
    }
    const hit: NetChannels['hit'] = { targetId: v.id, amount, crit: roll.crit, type: dm.type, skillId: d.id, statuses, knockback: d.knockback ?? 0, dir };
    // the attacker's cue: the predicted number after the arena multiplier (the real result is the victim's)
    try {
      G.events.emit('damage', {
        targetId: v.id, sourceId: me.id, amount: Math.round(amount * ARENA_PVP.damageMult), crit: roll.crit, type: dm.type, kind: roll.crit ? 'crit' : 'normal',
        pos: [v.position.x, v.position.y + v.height * 0.7, v.position.z], skillId: d.id,
      });
    } catch { /* feedback only */ }
    if (this.auth()) this.hostHit(null, me, v, hit);
    else G.net.sendToHost('hit', hit);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // hits: host vet + forward
  // ------------------------------------------------------------------------------------------------------------------

  onClientHit(from: string, p: NetChannels['hit']): boolean {
    if (this.disposed) return false;
    const v = this.o.world.get<Player>(p.targetId);
    if (!v || v.kind !== 'player') return false;
    const id = partyEntityOf(from);
    const a = id === null ? undefined : this.o.world.get<Player>(id);
    if (!a || a.kind !== 'player') return true;
    this.hostHit(from, a, v, p);
    return true;
  }

  private hostHit(from: string | null, a: Player, v: Player, h: NetChannels['hit']): void {
    if (!this.auth()) return;
    const deny = this.denyOf(a, v);
    const raw = Number(h.amount);
    let amount: number | null;
    if (from) amount = vetPvpHit(from, v, h.skillId, !!h.isDot, raw, deny);
    else if (deny !== null || h.isDot) amount = null;
    else amount = Math.max(0, Number.isNaN(raw) ? 0 : raw);
    if (amount === null || !(amount > 0)) return;
    const dir = Array.isArray(h.dir) && Number.isFinite(h.dir[0]) && Number.isFinite(h.dir[1]) ? [clampNum(h.dir[0], -1, 1, 0), clampNum(h.dir[1], -1, 1, 1)] as [number, number] : [0, 1] as [number, number];
    const msg: Extract<PvpMsg, { k: 'hit' }> = {
      k: 'hit', to: v.isLocal ? 'self' : G.net?.peerOfEntity(v.id) ?? '', amount: Math.round(amount), type: h.type, crit: !!h.crit, skillId: typeof h.skillId === 'string' ? h.skillId.slice(0, 48) : undefined,
      statuses: cleanStatuses(h.statuses), knockback: clampNum(h.knockback, -6, 6, 0), dir, aLvl: clampNum(a.level, 1, LEVEL_CAP, 1), aIlvl: 0, seq: ++this.seq, from: a.id,
    };
    if (v.isLocal) this.victimReceive(msg);
    else if (msg.to && G.net) G.net.sendTo(msg.to, 'pvp', msg);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // hits: victim
  // ------------------------------------------------------------------------------------------------------------------

  private onPvp(m: PvpMsg, from: string): void {
    if (this.disposed || !isObj(m as unknown) || G.net.isAuthority || from !== G.net.hostId) return;
    if (m.k !== 'hit') return;
    if (!Number.isFinite(m.amount) || typeof m.from !== 'number') return;
    this.victimReceive({ ...m, statuses: cleanStatuses(m.statuses), dir: Array.isArray(m.dir) && m.dir.length === 2 ? [clampNum(m.dir[0], -1, 1, 0), clampNum(m.dir[1], -1, 1, 1)] : [0, 1] });
  }

  private victimReceive(m: Extract<PvpMsg, { k: 'hit' }>): void {
    const me = this.me();
    if (!me || me.isDead || this.disposed) return;
    const a = typeof m.from === 'number' ? this.o.world.get<Player>(m.from) : undefined;
    if (!a || a.kind !== 'player') return;
    // dedupe (GDD §3.5.5 step 1): the host's counter is per match, so a repeated seq of the same attacker is a replay
    const last = this.lastSeqIn.get(a.id) ?? -1;
    if (m.seq <= last && last - m.seq < 64) return;
    this.lastSeqIn.set(a.id, m.seq);
    // the victim's own view of the rules: a host that forwards what it should not changes nothing
    if (arenaDeny(this.ctxOf(a, me)) !== null) return;
    const reach = reachOf(m.skillId) + 6 + me.radius;
    if (Math.hypot(a.position.x - me.position.x, a.position.z - me.position.z) > reach) return;
    const amount = arenaHitAmount({ raw: Number(m.amount) || 0, attackerLevel: clampNum(m.aLvl, 1, LEVEL_CAP, 1), victimPvpResilience: me.getStat('pvpResilience'), maxHp: me.maxHp }, monsterHP);
    const sk = typeof m.skillId === 'string' && Object.prototype.hasOwnProperty.call(SKILLS, m.skillId) ? SKILLS[m.skillId] : undefined;
    const melee = !!sk && (sk.targeting === 'melee_arc' || sk.tags.includes('melee'));
    const t = this.now();
    const cc = me.getStat('ccReductionPct');
    const statuses: StatusApply[] = [];
    for (const s of m.statuses ?? []) {
      if (s.status === 'slow') {
        const mag = clampSlow(s.magnitude ?? 0.3);
        statuses.push({ ...s, magnitude: mag, duration: Math.min(s.duration, 6) });
        continue;
      }
      const dur = this.dr.apply(s.status, s.duration, t, cc);
      if (dur > 0) statuses.push({ ...s, duration: dur });
    }
    G.combat.hitLocalPlayer({
      sourceId: a.id, amount, type: m.type, statuses, melee, parryable: melee, blockable: sk ? sk.targeting !== 'ground_aoe' && sk.targeting !== 'self_aoe' : true,
      knockback: Math.min(Math.max((m.knockback ?? 0) * ARENA_PVP.knockbackMult, -4), 4), dir: m.dir, abilityName: sk?.name ?? 'Oyuncu saldırısı',
      sourceLevel: Math.min(clampNum(m.aLvl, 1, LEVEL_CAP, 1), me.level),
    });
  }

  // ------------------------------------------------------------------------------------------------------------------
  // dispose
  // ------------------------------------------------------------------------------------------------------------------

  dispose(): void {
    if (this.disposed) return;
    // leaving a live match: a client whose host went away gets a void match; anybody who walked out forfeits (loss + queue lock)
    if (!this.resultApplied && this.phase !== 'loading') this.onLeftEarly();
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    this.o.scene.remove(this.visual);
    this.visual.traverse((c) => {
      const m = c as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    for (const g of this.gateMeshes) g.mat.dispose();
    this.gateMeshes.length = 0;
    setPvpHook(null);
    setArenaCombat(false);
    try {
      setStatContext({ arena: false });
      G.character?.recomputeStats();
    } catch (e) {
      console.warn('[arena] stat context reset failed', e);
    }
    if (current === this) current = null;
    G.net?.queue?.matchOver?.();
  }

  private onLeftEarly(): void {
    const leftBy = G.net?.lastLeave ?? null;
    const hostGone = !this.auth() && G.net.role === 'offline' && leftBy !== 'self';
    if (hostGone) {
      this.applyResult({ k: 'result', m: this.params.matchId, winner: 'draw', why: 'void', score: this.score, mean: this.params.mean ?? [1500, 1500] });
      return;
    }
    // the local player walks out: a loss (ranked), no rewards, and a queue lock
    try {
      const other: 'A' | 'B' = this.myTeam === 'A' ? 'B' : 'A';
      G.arenaLadder?.applyResult({
        bracket: this.params.bracket, ranked: this.params.ranked, winner: other, why: 'forfeit', myTeam: this.myTeam, mean: this.params.mean ?? [1500, 1500],
        opponents: this.params.teams[other], leaver: true,
      });
      const min = G.arenaLadder?.penalizeLeave() ?? 0;
      if (min > 0) toast(`Maçtan ayrıldın: ${min} dk kuyruğa giremezsin.`, 'warning');
    } catch (e) {
      console.warn('[arena] leave penalty failed', e);
    }
  }
}
