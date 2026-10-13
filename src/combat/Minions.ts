/**
 * Minion manager (GDD_CLASSES_V2 §1.5 rules 4, 7, 8; NC41). `G.minions`, ticked once per frame from Game.ts after G.combat.
 * Owns the minion list (the entities live in World.minions), group / owner / world caps, summons, commands (focus / recall),
 * death and the free respawn of pets and demons. This manager only lists the LOCAL player's minions; other peers' minions are
 * remote copies created by net/Replication from the `minion` channel (NC43) and live in World.minions only.
 *   summon(owner, def, opts)   spawns `count` minions in a ring round the owner; past the group cap the oldest of that group leaves
 *   focus(owner, id, sec)      the owner's minions attack that enemy for `sec` seconds (behaviour minion_command)
 *   recall(owner)              clears the focus; minions return to formation
 *   strike(m, atk, target)     a minion's hit: Combat.playerHitEnemy with the owner's stat block (plus the minion damage bonus)
 *   taunt(m, atk)              a `taunt` attack: every enemy within its radius is forced onto the minion (Combat.minionTaunt)
 *   hurt(m, amount, type)      damage in (mitigation by armorFrac); reaching 0 calls die(). Enemies reach it through Combat.hitMinion
 */
import { G } from '../game/G';
import { Minion } from '../entities/Minion';
import { MINION_ID_BASE, PARTY_ID_BASE, type DamageType, type EntityId } from '../types/common';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { MinionAttack, MinionDef } from '../types/minions';
import { MINION_GROUP_CAPS } from '../data/minions';
import { clamp } from '../core/utils';

/** GDD §1.5 rule 4: hard caps per owner and per world (on top of the group caps). */
export const MINION_PER_OWNER_CAP = 14;
export const MINION_PER_WORLD_CAP = 40;
/** Default seconds before a pet returns after a scene change (MinionDef.respawn.scene overrides). */
const SCENE_RESPAWN_DEFAULT = 2;
const MAX_SLOT = 14;

export interface SummonOpts {
  /** Minions to spawn (default 1). */
  count?: number;
  /** Group cap override (default MINION_GROUP_CAPS[group]). */
  cap?: number;
  /** Cap bucket override (default def.group). */
  group?: string;
  /** Lifetime in seconds (default def.life; 0 = permanent). */
  life?: number;
  /** Skip the group cap (ghoul army: 8 per cast). Owner and world hard caps still apply. */
  ignoreCap?: boolean;
}

export type MinionDespawnReason = 'expired' | 'cap' | 'owner' | 'scene';

interface RespawnEntry { ownerId: EntityId; def: MinionDef; at: number }

export class Minions {
  /** Live minions in creation order (oldest first). Entities are owned by World.minions. */
  readonly list: Minion[] = [];
  private readonly counters = new Map<number, number>();
  private readonly focuses = new Map<EntityId, { targetId: EntityId; until: number }>();
  private respawns: RespawnEntry[] = [];
  private clock = 0;

  constructor() {
    G.events.on('scene:changed', () => this.onSceneChanged());
  }

  /** The enemy the owner's minions are focused on (Minions.focus), or null when expired, dead or gone. */
  focusTarget(ownerId: EntityId): Enemy | null {
    const f = this.focuses.get(ownerId);
    if (!f) return null;
    if (this.clock >= f.until) {
      this.focuses.delete(ownerId);
      return null;
    }
    const e = G.world?.get<Enemy>(f.targetId);
    if (!e || e.kind !== 'enemy' || e.isDead || e.removed) {
      this.focuses.delete(ownerId);
      return null;
    }
    return e;
  }

  /** The owner's minions attack `targetId` for `seconds` (behaviour minion_command). */
  focus(owner: Player, targetId: EntityId, seconds: number): void {
    this.focuses.set(owner.id, { targetId, until: this.clock + Math.max(0.1, seconds) });
    G.events.emit('minion:command', { ownerId: owner.id, command: 'focus', targetId });
  }

  /** Clears the owner's focus; the minions go back to formation. */
  recall(owner: Player): void {
    this.focuses.delete(owner.id);
    G.events.emit('minion:command', { ownerId: owner.id, command: 'recall', targetId: null });
  }

  /** Alive minions of an owner (optionally filtered), oldest first. */
  ownedBy(ownerId: EntityId, pred?: (m: Minion) => boolean): Minion[] {
    return this.list.filter((m) => m.ownerId === ownerId && !m.isDead && (!pred || pred(m)));
  }

  /**
   * Spawns `count` minions of `def` around the owner. Caps first: the group cap, then the owner hard cap (14), then the world
   * hard cap (40); each removes the oldest minions it needs to make room (reason 'cap', death_poof).
   */
  summon(owner: Player, def: MinionDef, o: SummonOpts = {}): Minion[] {
    if (!G.world || !owner || owner.isDead || owner.removed) return [];
    const count = Math.max(1, Math.floor(o.count ?? 1));
    const group = o.group ?? def.group;
    const cap = o.ignoreCap ? Infinity : (o.cap ?? MINION_GROUP_CAPS[group] ?? Infinity);
    const life = o.life ?? def.life ?? 0;
    const out: Minion[] = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + owner.yaw;
      const r = count > 1 ? 2.2 : 0;
      const m = this.spawnOne(owner, def, life, owner.position.x + Math.sin(ang) * r, owner.position.z + Math.cos(ang) * r);
      if (m) out.push(m);
    }
    // the new minions are the newest, so the oldest of each bucket leave first (a summon larger than its cap keeps its last ones)
    const sameGroup = (m: Minion) => m.def.group === group;
    this.trimOldest(owner.id, sameGroup, this.ownedBy(owner.id, sameGroup).length - cap);
    this.trimOldest(owner.id, () => true, this.ownedBy(owner.id).length - MINION_PER_OWNER_CAP);
    this.trimOldest(null, () => true, this.list.filter((m) => !m.isDead).length - MINION_PER_WORLD_CAP);
    return out.filter((m) => !m.removed && !m.isDead);
  }

  /** Damage in: `amount` reduced by armorFrac for physical hits. Reaching 0 HP kills the minion. Returns the damage taken. */
  hurt(m: Minion, amount: number, type: DamageType = 'physical'): number {
    if (m.isDead || m.removed || amount <= 0) return 0;
    const armor = type === 'physical' ? clamp(m.def.armorFrac, 0, 0.6) : 0;
    const taken = Math.max(0, Math.round(amount * (1 - armor)));
    m.hp = Math.max(0, m.hp - taken);
    m.combatTimer = 0;
    if (m.hp <= 0) this.die(m);
    return taken;
  }

  /** A minion's hit on an enemy: Combat.playerHitEnemy with the owner as attacker (owner stat block, crit, mitigation, threat). */
  strike(m: Minion, atk: MinionAttack, target: Enemy): void {
    const owner = G.world?.get<Player>(m.ownerId);
    if (!owner || owner.isDead || target.isDead || target.removed) return;
    // Yoldaş Hasarı (minionDamagePct) as a `more` factor. GDD §1.5 rule 2 has it additive in the damage bucket: approximated here.
    // NC42: sourceId = owner, viaId = the minion (threat split 0.6 owner / 0.4 minion in EnemyAI.onDamaged), half the owner's crit chance.
    const dx = target.position.x - m.position.x, dz = target.position.z - m.position.z;
    G.combat.playerHitEnemy(owner, target, {
      skillId: atk.id,
      coef: atk.coef,
      type: atk.type,
      tags: ['minion'],
      viaId: m.id,
      critScale: 0.5,
      statuses: atk.statuses,
      knockback: atk.knockback,
      more: 1 + owner.getStat('minionDamagePct'),
      pos: [target.position.x, target.position.y + target.height * 0.5, target.position.z],
      dir: Math.hypot(dx, dz) > 1e-3 ? [dx / Math.hypot(dx, dz), dz / Math.hypot(dx, dz)] : [0, 1],
    });
  }

  /**
   * A `taunt` attack (MinionAttack.kind 'taunt'): every living enemy within `atk.radius ?? atk.range` of the minion that is not already
   * on it is forced onto the minion for `params.tauntSec` (default 3 s; bosses 2 s) and put at top threat x 1.10 + 100. Returns the count.
   */
  taunt(m: Minion, atk: MinionAttack): number {
    const w = G.world;
    if (!w || m.isDead || m.removed) return 0;
    const r = atk.radius ?? atk.range;
    const secs = atk.params?.tauntSec ?? 3;
    let n = 0;
    for (const e of w.enemies) {
      if (e.isDead || e.removed || e.team !== 'enemy' || e.targetId === m.id) continue;
      if (Math.hypot(e.position.x - m.position.x, e.position.z - m.position.z) > r + e.radius || !w.sameLevel(e, m.position.y)) continue;
      G.combat.minionTaunt(m, e, secs, atk.id);
      n++;
    }
    if (n > 0) G.vfx.spawn(atk.vfx?.cast ?? 'war_cry', m.pointAt(0.8));
    return n;
  }

  /** Death: death event, death_bones, and a respawn queued for pets (def.respawn.dead seconds). The body lingers, then goes. */
  die(m: Minion): void {
    if (!m.alive) return;   // guard on the flag: hurt() has already taken the HP to 0 (isDead)
    m.kill();
    const p = m.pointAt(0.2);
    G.events.emit('minion:died', { id: m.id, defId: m.def.id, ownerId: m.ownerId, pos: [p.x, p.y, p.z] });
    G.vfx.spawn(m.def.deathVfx ?? 'death_bones', p);
    if (m.def.respawn) this.respawns.push({ ownerId: m.ownerId, def: m.def, at: this.clock + m.def.respawn.dead });
  }

  /** Removes a minion without death (expiry, cap, owner gone, scene). Emits minion:despawned. */
  despawn(m: Minion, reason: MinionDespawnReason): void {
    this.forget(m);   // even when the world already removed it (scene reset): the list must not keep it
    if (m.removed) return;
    G.events.emit('minion:despawned', { id: m.id, defId: m.def.id, ownerId: m.ownerId, reason });
    if (reason !== 'scene') G.vfx.spawn('death_poof', m.pointAt(0.5));
    m.world?.remove(m);
  }

  /** Removes everything (scene reset, tests). No respawns are queued. */
  clearAll(reason: MinionDespawnReason = 'scene'): void {
    for (const m of [...this.list]) this.despawn(m, reason);
    this.respawns = [];
    this.focuses.clear();
  }

  /** Per frame: lifetimes, dead-body removal, out-of-world entries, and the pet respawns. */
  update(dt: number): void {
    this.clock += dt;
    const w = G.world;
    for (const m of [...this.list]) {
      if (m.removed || m.world !== w) {
        this.forget(m);
        continue;
      }
      if (m.isDead) {
        // the body lingers (Minion.kill sets deathLeft), then it goes without a second event: minion:died already fired
        m.deathLeft -= dt;
        if (m.deathLeft <= 0) {
          this.forget(m);
          m.world?.remove(m);
        }
        continue;
      }
      if (m.timed && m.life <= 0) this.despawn(m, 'expired');
    }
    if (!w || this.respawns.length === 0) return;
    for (const r of [...this.respawns]) {
      if (this.clock < r.at) continue;
      const owner = w.get<Player>(r.ownerId);
      if (!owner || owner.isDead) continue;   // the owner has to be in this world
      this.respawns.splice(this.respawns.indexOf(r), 1);
      this.summon(owner, r.def, { count: 1 });
    }
  }

  /** Scene change: every minion leaves; pets and demons queue a free respawn (MinionDef.respawn.scene). */
  private onSceneChanged(): void {
    for (const m of [...this.list]) {
      if (!m.isDead && m.def.respawn) this.respawns.push({ ownerId: m.ownerId, def: m.def, at: this.clock + (m.def.respawn.scene ?? SCENE_RESPAWN_DEFAULT) });
      this.despawn(m, 'scene');
    }
    this.focuses.clear();
  }

  private spawnOne(owner: Player, def: MinionDef, life: number, x: number, z: number): Minion | null {
    const w = G.world;
    if (!w) return null;
    const m = new Minion(this.nextId(clamp(owner.id - PARTY_ID_BASE, 0, MAX_SLOT)), def, owner.id, life);
    m.slot = this.ownedBy(owner.id).length;
    m.maxHp = Math.max(1, Math.round(owner.maxHp * def.hpFrac * (1 + owner.getStat('minionHpPct'))));
    m.hp = m.maxHp;
    m.position.set(x, owner.position.y, z);
    m.yaw = owner.yaw;
    w.add(m);
    this.list.push(m);
    G.events.emit('minion:spawned', { id: m.id, defId: def.id, ownerId: owner.id });
    G.vfx.spawn(def.spawnVfx ?? 'death_poof', m.pointAt(0.3));
    if (G.assets) void m.loadModel().catch((e) => console.error('[minions] model failed', def.id, e));
    return m;
  }

  /** GDD §1.5 rule 1: MINION_ID_BASE + slot * 1000 + counter % 1000, skipping ids still in use. */
  private nextId(slot: number): EntityId {
    const w = G.world;
    let c = this.counters.get(slot) ?? 0;
    let id = MINION_ID_BASE + slot * 1000 + (c % 1000);
    let tries = 0;
    while (w?.entities.has(id) && tries++ < 1000) {
      c++;
      id = MINION_ID_BASE + slot * 1000 + (c % 1000);
    }
    this.counters.set(slot, c + 1);
    return id;
  }

  /** Despawns the oldest alive minions matching the filter until `n` have gone (n <= 0 does nothing). */
  private trimOldest(ownerId: EntityId | null, pred: (m: Minion) => boolean, n: number): void {
    if (!(n > 0)) return;
    for (const m of [...this.list]) {
      if (n <= 0) break;
      if (m.isDead || (ownerId !== null && m.ownerId !== ownerId) || !pred(m)) continue;
      this.despawn(m, 'cap');
      n--;
    }
  }

  private forget(m: Minion): void {
    const i = this.list.indexOf(m);
    if (i >= 0) this.list.splice(i, 1);
  }
}
