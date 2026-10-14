import * as THREE from 'three';
import { G } from '../game/G';
import type { Player } from '../entities/Player';
import type { World } from '../world/World';
import type { NetChannels, PvpMsg } from '../types/net';
import type { StatusApply } from '../types/skills';
import type { EntityId } from '../types/common';
import type { CastCtx } from '../combat/skills/behaviors';
import type { HitSpec } from '../combat/Combat';
import { SKILLS } from '../data/skills';
import { monsterHP } from '../data/mythicAffixes';
import { LEVEL_CAP } from '../types/character';
import { NATIONS, cleanNation, nationOfSave, type NationId } from '../data/nations';
import { SIEGE, SIEGE_FORT } from '../data/siege';
import { PVP, PVP_STATUSES, pvpCcDuration, pvpHitCap, pvpShapeHit } from './PvpRules';
import { cleanStatuses, reachOf, setPvpHook, type PvpHook } from './Pvp';
import {
  BannerField, inArena, siegeAt, siegeDeny, type BannerEvent, type BannerHolder, type BannerPresence, type SiegeHitCtx, type SiegeOcc,
} from './SiegeRules';
import { partyEntityOf, vetPvpHit } from '../net/guard';
import { clampNum, isObj, sanitizeText } from '../net/messages';
import { emit, toast } from './notify';

/**
 * KALE KUŞATMASI RUNTIME (WP-14). Lives while the open-world map that hosts the fortress runs (WorldRuntime: `startSiege` /
 * `dispose`). The rules are in systems/SiegeRules.ts (pure, tested by dev/combat-sim/siege.mjs); this file wires them:
 *
 *  - HITS: the same path as Kızıl Sınır (systems/Pvp.ts), through the PvpHook door. Attacker: the skill's shape hits players in the
 *    arena whose guild differs (siegeDeny), damage is rolled locally and sent on the existing `hit` channel. Host: net/guard.vetPvpHit
 *    with the siege verdict, then forwarded to the victim, who re-checks the rule with its own view and takes 40 % of the hit.
 *  - BANNER: the host steps BannerField with the living players inside the capture circle (guild from the presence the peers
 *    announce: trust-based, not provable without a server) and broadcasts {k:'sg'} twice a second.
 *  - END: when the window closes the host broadcasts {k:'sgend'} with the holder; every peer records the holder (save.siege), and
 *    the members of the winning nation get the Zafer buff. The Pazar tax cut and the glow flag read the same record.
 *  - SCHEDULE: announced by the open-world calendar (scenes/world/EventCalendar.ts), not here.
 */

export interface SiegeOpts {
  world: World;
  scene: THREE.Scene;
  /** Wall clock in ms (default Date.now). Injected by the sim. */
  now?(): number;
}

let current: SiegeRuntime | null = null;

/** Starts the fortress runtime (replaces a running one). */
export function startSiege(o: SiegeOpts): SiegeRuntime {
  current?.dispose();
  current = new SiegeRuntime(o);
  return current;
}

export function siegeRuntime(): SiegeRuntime | null {
  return current;
}

const fortVec = (): THREE.Vector3 => new THREE.Vector3(SIEGE_FORT.center[0], 0, SIEGE_FORT.center[1]);

export class SiegeRuntime implements PvpHook {
  readonly field = new BannerField();
  private readonly o: SiegeOpts;
  private readonly now: () => number;
  private readonly offs: (() => void)[] = [];
  private readonly visual = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly beam: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly beamMat: THREE.MeshBasicMaterial;
  private seq = 0;
  private syncT = 0;
  /** Week of the window this peer last saw running (host: the one it steps). */
  private activeWeek: number | null = null;
  private clock = 0;
  private disposed = false;

  constructor(o: SiegeOpts) {
    this.o = o;
    this.now = o.now ?? (() => Date.now());
    const y = o.world.groundY ? o.world.groundY(SIEGE_FORT.center[0], SIEGE_FORT.center[1]) : 0;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xb8b8b8, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xb8b8b8, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(SIEGE.BANNER_R - 0.7, SIEGE.BANNER_R, 48), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(fortVec()).setY(y + 0.12);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 16, 16, 1, true), this.beamMat);
    this.beam.position.copy(fortVec()).setY(y + 8);
    this.visual.add(this.ring, this.beam);
    o.scene.add(this.visual);
    setPvpHook(this);
    if (G.net) this.offs.push(G.net.on('pvp', (m, from) => this.onMsg(m, from)));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    this.o.scene.remove(this.visual);
    this.ring.geometry.dispose();
    this.beam.geometry.dispose();
    this.ringMat.dispose();
    this.beamMat.dispose();
    setPvpHook(null);
    if (current === this) current = null;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // identity helpers
  // ------------------------------------------------------------------------------------------------------------------

  private auth(): boolean { return !G.net || G.net.isAuthority; }
  private me(): Player | null { return this.o.world.localPlayer ?? null; }
  private open(): SiegeOcc | null { return siegeAt(this.now()); }

  private nationOf(p: Player): NationId | null {
    if (p.nation) return p.nation;
    if (p.isLocal && G.character) return nationOfSave(G.character.save);
    return null;
  }

  /** Guild of a player: our own from the save, a peer's from the presence it announces (trust-based). */
  private guildOf(p: Player): { gid: string; name: string } | null {
    if (p.isLocal) {
      const g = G.guild?.presenceInfo();
      if (g) return { gid: g.gid, name: g.name };
      const sv = G.character?.save.guild;
      return sv ? { gid: sv.gid, name: 'Lonca' } : null;
    }
    const gu = G.presence?.find(p.name)?.guild;
    return gu && typeof gu.gid === 'string' && gu.gid ? { gid: gu.gid, name: gu.name } : null;
  }

  private ctxOf(a: Player, v: Player): SiegeHitCtx {
    return {
      open: this.open() !== null, aIn: inArena(a.position.x, a.position.z), vIn: inArena(v.position.x, v.position.z),
      aId: a.id, vId: v.id, aDead: a.isDead, vDead: v.isDead, aGid: this.guildOf(a)?.gid, vGid: this.guildOf(v)?.gid,
    };
  }

  // ------------------------------------------------------------------------------------------------------------------
  // tick
  // ------------------------------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.disposed) return;
    this.clock += dt;
    this.updateVisuals();
    if (this.auth()) this.hostTick(dt);
    else this.clientTick();
  }

  private hostTick(dt: number): void {
    const occ = this.open();
    if (occ && this.activeWeek !== occ.week) {
      this.activeWeek = occ.week;
      this.field.reset();
    }
    if (!occ) {
      if (this.activeWeek !== null) {
        const week = this.activeWeek;
        this.activeWeek = null;
        this.finish(week);
      }
      return;
    }
    const evs = this.field.step(dt, this.presence());
    for (const e of evs) this.onFlip(e);
    this.syncT += dt;
    if (evs.length || this.syncT >= 0.5) {
      this.syncT = 0;
      this.broadcast({ k: 'sg', ...this.field.toWire() });
    }
  }

  /** Clients only mirror the window (the host sends the banner and the result). A window that started here resets the mirror. */
  private clientTick(): void {
    const occ = this.open();
    if (occ && this.activeWeek !== occ.week) {
      this.activeWeek = occ.week;
      this.field.reset();
    }
    if (!occ) this.activeWeek = null;
  }

  private presence(): BannerPresence[] {
    const out: BannerPresence[] = [];
    for (const p of this.o.world.players) {
      if (p.isDead || p.level < SIEGE.MIN_LEVEL) continue;
      const g = this.guildOf(p);
      if (!g) continue;
      out.push({ id: p.id, gid: g.gid, gname: g.name, nation: this.nationOf(p), x: p.position.x, z: p.position.z });
    }
    return out;
  }

  private onFlip(e: BannerEvent): void {
    this.announceHolder(e.to.name, e.to.nation);
  }

  private announceHolder(name: string, nation: NationId | null): void {
    const tag = nation ? NATIONS[nation].tag : '';
    const text = `${tag ? `[${tag}] ` : ''}${name} Kale Kuşatması bayrağını ele geçirdi!`;
    emit('net:chat', { from: '', text, channel: 'system' });
    toast(text, 'boss');
  }

  /** Host: the window closed. The holder at the end wins. Broadcast, then apply locally. */
  private finish(week: number): void {
    const h = this.field.holder;
    const m: Extract<PvpMsg, { k: 'sgend' }> = { k: 'sgend', w: week, h: h ? { ...h } : null, n: h?.nation ?? null };
    this.broadcast(m);
    this.applyEnd(m);
    this.field.reset();
  }

  /** Every peer: save the holder and grant the Zafer buff to the winning nation. */
  private applyEnd(m: Extract<PvpMsg, { k: 'sgend' }>): void {
    const ch = G.character;
    if (!ch) return;
    const prev = ch.save.siege;
    const h = m.h && typeof m.h.gid === 'string' && m.h.gid.length <= 64 ? { gid: m.h.gid, name: sanitizeText(m.h.name, 40), nation: cleanNation(m.h.nation) ?? null } : null;
    const won = !!h && !!h.nation && h.nation === ch.nation;
    const zaferUntil = won ? this.now() + SIEGE.ZAFER_SEC * 1000 : prev?.zaferUntil;
    ch.save.siege = { holder: h ? { ...h, week: Math.round(clampNum(m.w, 0, 1e9, 0)) } : null, ...(zaferUntil ? { zaferUntil } : {}) };
    ch.persist();
    G.player?.refreshSiegeAura?.(); // the winning guild's weapon glow follows the new record
    const line = h
      ? `Kale Kuşatması sona erdi. Bayrağı tutan: ${h.name}.${won ? ` ${NATIONS[ch.nation].name} için Zafer: 1 saat +${SIEGE.ZAFER_XP_PCT}% XP.` : ''}`
      : 'Kale Kuşatması sona erdi. Bayrağı kimse tutamadı.';
    emit('net:chat', { from: '', text: line, channel: 'system' });
    toast(line, 'loot');
    emit('world:announce', { text: line, kind: 'info' });
  }

  // ------------------------------------------------------------------------------------------------------------------
  // attacker side: SkillSystem hook (PvpHook)
  // ------------------------------------------------------------------------------------------------------------------

  onFired(c: CastCtx): void {
    if (c.remote || this.disposed) return;
    const me = c.caster;
    if (!me.isLocal || me.isDead) return;
    const d = c.def;
    const dm = d.damage;
    if (!dm || !(dm.coef > 0)) return;
    if (!this.open() || me.level < SIEGE.MIN_LEVEL) return;
    const shapeCtx = { caster: { x: me.position.x, z: me.position.z }, dir: c.dir, point: c.point } as const;
    let hits = 0;
    for (const v of this.o.world.players) {
      if (v === me || v.isLocal || hits >= 6) continue;
      if (siegeDeny(this.ctxOf(me, v)) !== null) continue;
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
    const amount = Math.max(1, Math.round(roll.amount));
    const statuses: StatusApply[] = [];
    for (const s of d.statuses ?? []) {
      if (!PVP_STATUSES.has(s.status)) continue;
      if (s.chance !== undefined && s.chance < 1 && Math.random() > s.chance) continue;
      statuses.push({ status: s.status, duration: s.duration, stacks: s.stacks, magnitude: s.magnitude });
    }
    const hit: NetChannels['hit'] = { targetId: v.id, amount, crit: roll.crit, type: dm.type, skillId: d.id, statuses, knockback: d.knockback ?? 0, dir };
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
  // host: vet and forward
  // ------------------------------------------------------------------------------------------------------------------

  /** Combat.onNetHit (host): true when the target was a player entity. */
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
    const deny = siegeDeny(this.ctxOf(a, v));
    const raw = Number(h.amount);
    let amount: number | null;
    if (from) amount = vetPvpHit(from, v, h.skillId, !!h.isDot, raw, deny);
    else if (deny !== null || h.isDot) amount = null;
    else amount = Math.min(Math.max(0, Number.isNaN(raw) ? 0 : raw), pvpHitCap(clampNum(a.level, 1, LEVEL_CAP, 1), monsterHP));
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
  // victim side
  // ------------------------------------------------------------------------------------------------------------------

  private victimReceive(m: Extract<PvpMsg, { k: 'hit' }>): void {
    const me = this.me();
    if (!me || me.isDead || this.disposed) return;
    const a = typeof m.from === 'number' ? this.o.world.get<Player>(m.from) : undefined;
    if (!a || a.kind !== 'player') return;
    if (siegeDeny(this.ctxOf(a, me)) !== null) return;
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
      sourceLevel: Math.min(clampNum(m.aLvl, 1, LEVEL_CAP, 1), me.level),
    });
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
      case 'sg': {
        const h = m.h && typeof m.h.gid === 'string' && m.h.gid.length <= 64 ? { gid: m.h.gid, name: sanitizeText(m.h.name, 40), nation: cleanNation(m.h.nation) ?? null } as BannerHolder : null;
        const before = this.field.holder?.gid ?? null;
        this.field.applyWire({ h, c: typeof m.c === 'string' ? m.c.slice(0, 64) : '', p: Number(m.p) });
        if (h && h.gid !== before) this.announceHolder(h.name, h.nation);
        return;
      }
      case 'sgend': {
        if (typeof m.w !== 'number') return;
        this.applyEnd(m);
        return;
      }
      default:
        return;
    }
  }

  private broadcast(m: PvpMsg): void {
    if (!G.net || !G.net.isOnline) return;
    G.net.broadcast('pvp', m);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // visuals: the banner ring and beam, grey while unclaimed, the holder's nation colour
  // ------------------------------------------------------------------------------------------------------------------

  private updateVisuals(): void {
    const h = this.field.holder;
    const hex = h?.nation ? NATIONS[h.nation].hex : 0xb8b8b8;
    this.ringMat.color.setHex(hex);
    this.beamMat.color.setHex(hex);
    const pulse = this.field.cap ? 0.5 + 0.5 * Math.sin(this.clock * 6) : 0;
    this.ringMat.opacity = 0.45 + 0.25 * pulse;
    this.beamMat.opacity = 0.16 + 0.22 * Math.min(1, this.field.prog / SIEGE.HOLD_SEC) + 0.1 * pulse;
  }
}

