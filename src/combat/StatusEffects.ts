import { G } from '../game/G';
import {
  STATUSES, STATUS_RULES, dispelStackLoss, expireBurstOf, shouldFireOnExpire,
  type StatusRemoveReason, type StatusRule,
} from '../data/statuses';
import type { EntityId } from '../types/common';
import type { StatusId } from '../types/skills';
import type { StatBlock, StatId } from '../types/stats';
import type { Actor } from '../entities/Actor';
import type { Player } from '../entities/Player';
import type { HitSpec, IncomingHit } from './Combat';
import type { DynamicBuff } from './procActions';

export interface ActiveStatus {
  id: StatusId;
  remaining: number;
  duration: number;
  stacks: number;
  magnitude: number;
  sourceId: EntityId | null;
  /** periodic damage per second already resolved by the applier (dots), 0 if none */
  dps: number;
  tickTimer: number;
  /** KIT PK-0: the Kaybol stealth opener (x1.5 + forced crit on the first hit, consumed). Other stealth has no flag. */
  opener?: boolean;
}

export interface ApplyOpts {
  stacks?: number;
  magnitude?: number;
  sourceId?: EntityId | null;
  dps?: number;
  /** Stack cap override (talents such as Zehir Ustası). */
  maxStacks?: number;
  /** Visual replication from the network (estatus/pstatus): skips immunity / diminishing-returns / duration rules. */
  replicated?: boolean;
  /** KIT PK-0: marks the stealth as Kaybol's opener (see ActiveStatus.opener). */
  opener?: boolean;
}

/**
 * The dynamic buff entry point of the proc engine (`G.status.applyDynamic`, see SkillSystem's constructor): applies the
 * `tb:<key>` buff of a `buff(...)` action to the actor's own StatusEffects.
 */
export function applyDynamicBuff(actor: Actor, def: DynamicBuff): void {
  actor.statuses?.applyDynamic(def);
}

/** Minimal view of an enemy owner without importing the Enemy class (load-order rule). */
interface OwnerEnemyView { def?: { rank?: string; ccImmune?: boolean; role?: string } }

const DOT_TICK = 0.5;
const DR_WINDOW = 8;
const DR_STEPS = [1, 0.6, 0.3];

/**
 * IMPORT RULE: this file may only runtime-import data/* and core/utils (Actor runtime-imports it; importing
 * Player/Enemy/Actor/Combat at runtime would create a load-order cycle). Use `import type`, `owner.kind`, and G.
 *
 * Per-actor status effect container (buffs, debuffs, crowd control, dots).
 * OWNER: combat module. Rules per status live in data/statuses.ts (STATUS_RULES):
 *  - stacking (refresh / strongest / stack / dotstack), CC rules (bosses immune to hard CC, elites 50% duration, DR groups
 *    on enemies, ccReductionPct on players), immunities (iframes/invulnerable, bloodrage vs slow, inspiring vs CC),
 *  - dots tick every 0.5 s on the AUTHORITY peer (host for enemies, owner for the local player) using the snapshotted dps,
 *  - heal-over-time (regen), shield absorb, stat mods (cached), "more" damage multipliers, heal reduction.
 */
export class StatusEffects {
  readonly owner: Actor;
  protected active = new Map<StatusId, ActiveStatus>();
  private modsCache: StatBlock | null = null;
  private dealtCache = -1;
  private takenCache = -1;
  private clock = 0;
  private dr = new Map<string, { count: number; windowEnd: number; immuneUntil: number }>();
  private immune = { slow: 0, cc: 0 };
  private tauntIcd = 0;
  /** GDD_TALENTS T7: dynamic buffs `tb:<key>` (talent procs). No StatusDef: stats are summed × stacks while they last. */
  private dyn = new Map<string, { def: DynamicBuff; remaining: number; stacks: number }>();

  constructor(owner: Actor) {
    this.owner = owner;
  }

  /**
   * Applies or refreshes a dynamic buff (`buff(key,dur,{…},max=n)` of a proc). A re-apply refreshes the duration and adds
   * one stack up to `maxStacks`. Stats are multiplied by the stack count in getStatMods.
   */
  applyDynamic(def: DynamicBuff): void {
    if (this.owner.isDead || !(def.duration > 0)) return;
    const cur = this.dyn.get(def.id);
    if (cur) {
      cur.stacks = Math.min(Math.max(1, def.maxStacks), cur.stacks + 1);
      cur.remaining = def.duration;
      cur.def = def;
    } else {
      this.dyn.set(def.id, { def, remaining: def.duration, stacks: 1 });
    }
    this.invalidate();
    this.owner.onStatusesChanged();
  }

  /** Stacks of a dynamic buff (0 when it is not active). */
  dynamicStacks(id: string): number {
    return this.dyn.get(id)?.stacks ?? 0;
  }

  private updateDynamic(dt: number): void {
    let gone = false;
    for (const [id, d] of this.dyn) {
      d.remaining -= dt;
      if (d.remaining <= 0) {
        this.dyn.delete(id);
        gone = true;
      }
    }
    if (gone) {
      this.invalidate();
      this.owner.onStatusesChanged();
    }
  }

  private get ownerEnemyDef(): OwnerEnemyView['def'] | undefined {
    return this.owner.kind === 'enemy' ? (this.owner as unknown as OwnerEnemyView).def : undefined;
  }

  private invalidate(): void {
    this.modsCache = null;
    this.dealtCache = -1;
    this.takenCache = -1;
  }

  /**
   * Apply or refresh a status. `dps` is precomputed periodic damage for dots. Returns false if the owner is immune
   * (invulnerable, CC-immune boss, DR cap, slow immunity...). Never throws.
   */
  apply(id: StatusId, duration: number, opts: ApplyOpts = {}): boolean {
    const def = STATUSES[id];
    const rule: StatusRule = STATUS_RULES[id] ?? {};
    if (!def) return false;
    const owner = this.owner;
    if (!opts.replicated) {
      if (duration <= 0 && !rule.internal) return false;
      if (owner.isDead && def.kind === 'debuff') return false;
    }
    let dur = duration;
    let mag = opts.magnitude ?? 0;
    if (mag <= 0 && rule.defMag) mag = rule.defMag;
    const stackAdd = Math.max(1, opts.stacks ?? 1);
    const edef = this.ownerEnemyDef;

    if (!opts.replicated) {
      const isHostile = def.kind === 'debuff' && !rule.internal && id !== 'potion_cd';
      if (isHostile && this.invulnerable) return false;
      if (def.cc || rule.hard) {
        if (this.immune.cc > 0 || this.has('inspiring') || this.has('invulnerable')) return false;
        if (this.has('bloodrage') && (id === 'root' || id === 'slow')) return false;
      }
      if ((id === 'slow' || id === 'root') && (this.immune.slow > 0 || this.has('bloodrage'))) return false;
      if (owner.kind === 'enemy' && (def.cc || rule.hard)) {
        const rank = edef?.rank;
        if (rule.hard || id === 'silence') {
          if (edef?.ccImmune || rank === 'boss' || rank === 'miniboss') return false;
          if (rank === 'elite') dur *= 0.5;
        }
        if (rule.group) {
          const f = this.drFactor(rule.group);
          if (f <= 0) return false;
          dur *= f;
        }
      } else if (owner.kind === 'enemy' && id === 'taunt' && (edef?.rank === 'boss' || edef?.rank === 'miniboss')) {
        // forced target 4 s, then a 12 s internal cooldown per boss (GDD 1.8); slows on bosses are halved in getStatMods (bossFactor)
        if (this.clock < this.tauntIcd) return false;
        this.tauntIcd = this.clock + 12;
      }
      if (owner.kind === 'player' && (def.cc || rule.hard)) {
        const red = Math.min(0.6, Math.max(0, owner.getStat('ccReductionPct')));
        dur *= 1 - red;
      }
      if (id === 'poison' || id === 'bleed' || id === 'burn') {
        // enemy families immune to bleed (skeleton/ghost/golem) express it through def.resist; nothing to do here
      }
    }

    const maxStacks = Math.max(def.maxStacks ?? 1, opts.maxStacks ?? 0);
    const mode = rule.stack ?? 'refresh';
    const cur = this.active.get(id);
    let changed = false;
    let statusStacks = 1;
    if (!cur) {
      const s0 = mode === 'stack' || mode === 'dotstack' ? Math.min(maxStacks, stackAdd) : 1;
      this.active.set(id, {
        id, remaining: dur, duration: dur, stacks: s0, magnitude: mag,
        sourceId: opts.sourceId ?? null, dps: opts.dps ?? 0, tickTimer: 0, opener: opts.opener === true,
      });
      changed = true;
      statusStacks = s0;
    } else {
      switch (mode) {
        case 'override':
          cur.remaining = dur; cur.duration = dur;
          if (cur.magnitude !== mag) { cur.magnitude = mag; changed = true; }
          break;
        case 'strongest':
          if (mag > cur.magnitude || (opts.dps ?? 0) > cur.dps) {
            cur.magnitude = Math.max(cur.magnitude, mag);
            cur.dps = Math.max(cur.dps, opts.dps ?? 0);
            cur.sourceId = opts.sourceId ?? cur.sourceId;
            changed = true;
          }
          cur.remaining = Math.max(cur.remaining, dur);
          cur.duration = Math.max(cur.duration, dur);
          break;
        case 'stack': {
          const ns = Math.min(maxStacks, cur.stacks + stackAdd);
          if (ns !== cur.stacks) changed = true;
          cur.stacks = ns;
          cur.remaining = Math.max(cur.remaining, dur);
          cur.duration = Math.max(cur.duration, dur);
          if (mag > cur.magnitude) cur.magnitude = mag;
          break;
        }
        case 'dotstack': {
          const add = opts.dps ?? 0;
          if (cur.stacks < maxStacks) {
            cur.stacks = Math.min(maxStacks, cur.stacks + stackAdd);
            cur.dps += add;
            changed = true;
          } else {
            cur.dps = (cur.dps * (maxStacks - 1)) / maxStacks + add; // replace the average instance
          }
          cur.remaining = Math.max(cur.remaining, dur);
          cur.duration = Math.max(cur.duration, dur);
          break;
        }
        default:
          cur.remaining = Math.max(cur.remaining, dur);
          cur.duration = Math.max(cur.duration, dur);
          if (mag > 0 && mag !== cur.magnitude) { cur.magnitude = mag; changed = true; }
      }
      cur.sourceId = opts.sourceId ?? cur.sourceId;
      if (opts.opener) cur.opener = true;
      statusStacks = cur.stacks;
    }

    if (changed) this.invalidate();
    const st = this.active.get(id)!;

    // chill -> freeze on regular enemies at 5 stacks (elites cap at -50%, bosses at -30%: see getStatMods)
    if (id === 'chill' && !opts.replicated && st.stacks >= maxStacks && owner.kind === 'enemy') {
      const rank = edef?.rank;
      if (rank === 'trash' || rank === undefined) {
        this.remove('chill');
        this.apply('freeze', 1.5, { sourceId: opts.sourceId ?? null });
        return true;
      }
    }

    if (!rule.internal && changed) {
      try {
        G.events?.emit('status:applied', { targetId: owner.id, status: id, duration: st.duration, stacks: statusStacks });
        owner.onStatusesChanged();
      } catch (e) {
        console.error('[status] apply hook failed', e);
      }
    }
    if (id === 'freeze') this.setAnimPaused(true);
    if (!opts.replicated && rule.hard && owner.kind === 'enemy') {
      try { G.combat?.onHardCC(owner, opts.sourceId ?? null); } catch { /* combat not ready */ }
    }
    return true;
  }

  private setAnimPaused(paused: boolean): void {
    const anim = this.owner.anim;
    if (anim) anim.mixer.timeScale = paused ? 0 : 1;
  }

  /** CC diminishing returns on enemies: 100% -> 60% -> 30% -> immune for 6 s. Returns the duration factor. */
  private drFactor(group: string): number {
    let d = this.dr.get(group);
    if (d && this.clock < d.immuneUntil) return 0;
    if (!d || this.clock >= d.windowEnd) {
      d = { count: 0, windowEnd: this.clock + DR_WINDOW, immuneUntil: 0 };
      this.dr.set(group, d);
    }
    const f = DR_STEPS[d.count] ?? 0;
    d.count++;
    d.windowEnd = this.clock + DR_WINDOW;
    if (d.count >= DR_STEPS.length) d.immuneUntil = this.clock + 6 + 2; // 6 s after the third application's own duration
    return f;
  }

  remove(id: StatusId, reason: StatusRemoveReason = 'remove'): void {
    const s = this.active.get(id);
    if (!s) return;
    this.active.delete(id);
    this.invalidate();
    this.afterRemoved(s, reason);
  }

  /**
   * A dispel. A status with an onDispel stack loss (arcane_lockdown) gives up that many stacks and keeps its timer,
   * magnitude and source, as long as it has more stacks than the loss. Any other status is removed whole (reason
   * 'dispel', so onExpire never fires). Returns true when the dispel took effect, false when the status is not active.
   */
  dispel(id: StatusId): boolean {
    const s = this.active.get(id);
    if (!s) return false;
    const loss = dispelStackLoss(id);
    if (loss > 0 && s.stacks > loss) {
      s.stacks -= loss;
      this.invalidate();
      try {
        G.events?.emit('status:applied', { targetId: this.owner.id, status: id, duration: s.duration, stacks: s.stacks });
        this.owner.onStatusesChanged();
      } catch (e) {
        console.error('[status] dispel hook failed', e);
      }
      return true;
    }
    this.remove(id, 'dispel');
    return true;
  }

  private afterRemoved(s: ActiveStatus, reason: StatusRemoveReason): void {
    const rule = STATUS_RULES[s.id] ?? {};
    if (s.id === 'freeze') this.setAnimPaused(false);
    if (shouldFireOnExpire(reason)) this.fireExpireBurst(s);
    if (rule.internal) return;
    try {
      G.events?.emit('status:removed', { targetId: this.owner.id, status: s.id, reason });
      this.owner.onStatusesChanged();
      if (s.id === 'shield') G.skills?.onShieldEnded(this.owner);
    } catch (e) {
      console.error('[status] remove hook failed', e);
    }
  }

  /**
   * onExpire burst (P-21): an area hit centred on the owner, fired only on a natural expiry and only by the authority.
   * A player owner hits enemies in range (attributed to the status source when that is a player). An enemy owner hits
   * the local player in range; remote players are not hit from here (deferred: needs a networked hit).
   */
  private fireExpireBurst(s: ActiveStatus): void {
    const burst = expireBurstOf(s.id);
    const owner = this.owner;
    if (!burst || !owner.authority || owner.isDead) return;
    const world = G.world;
    const combat = G.combat;
    if (!world || !combat) return;
    try {
      const ox = owner.position.x, oz = owner.position.z;
      const inside = (a: Actor): boolean =>
        !a.isDead && Math.hypot(a.position.x - ox, a.position.z - oz) <= burst.radius + a.radius;
      const spec: HitSpec = { skillId: s.id, coef: burst.coef, type: burst.type, tags: ['aoe'], pos: [ox, owner.position.y, oz] };
      if (owner.kind === 'enemy') {
        for (const p of world.players) {
          if (!p.isLocal || !inside(p)) continue;
          const amount = combat.rollOutgoing(owner, spec, p).amount;
          const hit: IncomingHit = { sourceId: owner.id, amount, type: burst.type, abilityName: STATUSES[s.id]?.name, sourceLevel: owner.level };
          combat.hitLocalPlayer(hit);
        }
      } else {
        const src = world.getActor(s.sourceId);
        if (!src || src.kind !== 'player') return;
        const attacker = src as Player;
        for (const e of world.enemies) {
          if (inside(e)) combat.playerHitEnemy(attacker, e, spec);
        }
      }
    } catch (e) {
      console.error('[status] expire burst failed', e);
    }
  }

  has(id: StatusId): boolean {
    return this.active.has(id);
  }

  get(id: StatusId): ActiveStatus | undefined {
    return this.active.get(id);
  }

  stacks(id: StatusId): number {
    return this.active.get(id)?.stacks ?? 0;
  }

  /** For HUD buff/debuff bars (internal/hidden statuses are excluded). */
  list(): ActiveStatus[] {
    const out: ActiveStatus[] = [];
    for (const s of this.active.values()) if (!STATUSES[s.id]?.hidden) out.push(s);
    return out;
  }

  /** All active status ids (including hidden) — for replication/debug. */
  ids(): StatusId[] {
    return [...this.active.keys()];
  }

  /**
   * Summed stat modifiers from all active statuses (folded into final stats by StatCalc / Actor).
   * Cached until a status changes: callers must not mutate the result.
   */
  getStatMods(): StatBlock {
    if (this.modsCache) return this.modsCache;
    const out: StatBlock = {};
    if (this.active.size) {
      const edef = this.ownerEnemyDef;
      const bossLike = edef?.rank === 'boss' || edef?.rank === 'miniboss';
      for (const s of this.active.values()) {
        const def = STATUSES[s.id];
        if (!def?.stats) continue;
        const rule = STATUS_RULES[s.id] ?? {};
        let f = rule.perMag ? s.magnitude : s.stacks;
        if (rule.bossFactor && bossLike) f *= rule.bossFactor;
        for (const k in def.stats) {
          const id = k as StatId;
          out[id] = (out[id] ?? 0) + (def.stats[id] ?? 0) * f;
        }
      }
    }
    for (const d of this.dyn.values()) {
      for (const k in d.def.stats) {
        const id = k as StatId;
        out[id] = (out[id] ?? 0) + (d.def.stats[id] ?? 0) * d.stacks;
      }
    }
    this.modsCache = out;
    return out;
  }

  /** Multiplicative "DAHA FAZLA" damage the owner DEALS from statuses (empower, enrage, banner...). */
  dealtMore(): number {
    if (this.dealtCache >= 0) return this.dealtCache;
    let m = 1;
    for (const s of this.active.values()) {
      const r = STATUS_RULES[s.id];
      if (r?.dealtMore) m *= 1 + r.dealtMore * (r.perMag ? s.magnitude : s.stacks);
    }
    return (this.dealtCache = m);
  }

  /** Multiplicative damage the owner TAKES from statuses (sunder, shock...). */
  takenMore(): number {
    if (this.takenCache >= 0) return this.takenCache;
    let m = 1;
    for (const s of this.active.values()) {
      const r = STATUS_RULES[s.id];
      if (r?.takenMore) m *= 1 + r.takenMore * (r.perMag ? s.magnitude : s.stacks);
    }
    return (this.takenCache = m);
  }

  /** Healing received multiplier (necrotic stacks, grievous). */
  healMult(): number {
    let m = 1;
    for (const s of this.active.values()) {
      const r = STATUS_RULES[s.id]?.healMult;
      if (r === undefined) continue;
      m *= typeof r === 'function' ? r(s.stacks) : r;
    }
    return m;
  }

  /** Absorb damage with the 'shield' status. Returns the damage that goes through. */
  absorb(amount: number): number {
    const s = this.active.get('shield');
    if (!s || s.magnitude <= 0) return amount;
    const take = Math.min(s.magnitude, amount);
    s.magnitude -= take;
    if (s.magnitude <= 0.5) this.remove('shield');
    return amount - take;
  }

  /** Temporary immunity to slows/roots (`slow`) or all hard CC (`cc`) — unstoppable dashes, whirlwind, tempest. */
  addImmunity(kind: 'slow' | 'cc', seconds: number): void {
    this.immune[kind] = Math.max(this.immune[kind], seconds);
    if (kind === 'cc') this.immune.slow = Math.max(this.immune.slow, seconds);
  }

  get stunned(): boolean {
    return this.has('stun') || this.has('freeze') || this.has('knockdown') || this.has('fear');
  }
  get rooted(): boolean {
    return this.stunned || this.has('root') || this.has('act_root');
  }
  get silenced(): boolean {
    return this.stunned || this.has('silence');
  }
  get invulnerable(): boolean {
    return this.has('invulnerable') || this.has('iframes');
  }
  get blinded(): boolean {
    return this.has('blind');
  }

  /** Remove everything (death, scene change). */
  clear(): void {
    if (this.dyn.size) {
      this.dyn.clear();
      this.invalidate();
    }
    if (!this.active.size) return;
    const all = [...this.active.values()];
    this.active.clear();
    this.invalidate();
    this.immune.slow = this.immune.cc = 0;
    for (const s of all) this.afterRemoved(s, 'clear');
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.immune.slow > 0) this.immune.slow -= dt;
    if (this.immune.cc > 0) this.immune.cc -= dt;
    if (this.dyn.size) this.updateDynamic(dt);
    if (!this.active.size) return;
    const owner = this.owner;
    let expired: ActiveStatus[] | null = null;
    for (const s of this.active.values()) {
      s.remaining -= dt;
      const def = STATUSES[s.id];
      const rule = STATUS_RULES[s.id];
      if (owner.authority && !owner.isDead && ((def?.dotType && (s.dps > 0 || rule?.maxHpPctPerSec)) || (rule?.hot && s.magnitude > 0))) {
        s.tickTimer += dt;
        while (s.tickTimer >= DOT_TICK) {
          s.tickTimer -= DOT_TICK;
          this.tick(s, def?.dotType, !!rule?.hot);
        }
      }
      if (s.remaining <= 0) (expired ??= []).push(s);
    }
    if (expired) {
      for (const s of expired) {
        this.active.delete(s.id);
      }
      this.invalidate();
      for (const s of expired) this.afterRemoved(s, 'expire');
    }
  }

  /** Dots hit through Combat (host for enemies, owner for players); hots heal the owning player. */
  private tick(s: ActiveStatus, dotType: import('../types/common').DamageType | undefined, hot: boolean): void {
    const owner = this.owner;
    try {
      if (hot) {
        if (owner.kind === 'player') G.combat.healPlayer(null, owner as never, s.magnitude * DOT_TICK, { raw: true, quiet: true });
        return;
      }
      if (!dotType) return;
      const src = G.world?.getActor(s.sourceId);
      const lvl = src?.level ?? 1;
      const rule = STATUS_RULES[s.id];
      // max-HP rot (Kirlenme): per stack x owner max HP, and never below its non-lethal floor
      const pct = rule?.maxHpPctPerSec;
      const raw = pct !== undefined ? owner.maxHp * pct * s.stacks * DOT_TICK : s.dps * DOT_TICK;
      const floorHp = pct !== undefined && rule?.hpFloorPct !== undefined ? owner.maxHp * rule.hpFloorPct : undefined;
      if (owner.kind === 'enemy') {
        let dmg = G.combat.mitigate(owner, raw, dotType, lvl, s.id === 'bleed' ? { armorPen: 0.5 } : undefined);
        if (floorHp !== undefined) dmg = Math.min(dmg, Math.max(0, Math.floor(owner.hp - floorHp)));
        G.combat.applyDamageToEnemy(owner as never, dmg, false, dotType, s.sourceId, undefined, s.id, 0, undefined, { dot: true });
      } else if (owner.kind === 'player') {
        G.combat.hitLocalPlayer({ sourceId: s.sourceId, amount: raw, type: dotType, unavoidable: true, abilityName: STATUSES[s.id]?.name, sourceLevel: lvl, isDot: true, floorHp });
      }
    } catch (e) {
      console.error('[status] tick failed', e);
    }
  }
}
