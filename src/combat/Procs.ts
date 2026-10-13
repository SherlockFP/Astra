/**
 * GDD_TALENTS §2.5 / §6.1 / Appendix D: the proc engine (`T` rows of the class and spec trees, spec fx, web nodes, skill
 * specialisations). OWNER: combat (T4). Created as `G.procs` by game/Game.ts.
 *
 * Who calls what:
 *  - CharacterState.recomputeStats (T6) calls setEntries(fx.procs) with the entries that collectProcs built;
 *  - the combat owner (T7) calls emit(trigger, ctx) at each event and update(dt) every frame while a world exists;
 *  - scene changes and respecs call reset().
 *
 * Rules (Appendix D and §6.1):
 *  - procs act for the LOCAL player only (ctx.player.isLocal); remote peers run their own engine;
 *  - an entry fires when its trigger filter matches (skill id, @tag, *, pip id, status id), its `if=` conditions hold,
 *    its internal cooldown is over, and its chance passes. Chance is `ch` for most triggers and `ch` × the source
 *    skill's `params.proc` for hit / crit / kill. The internal cooldown (`icd`, at least 0.25 s) starts when it fires;
 *  - chains are at most MAX_CHAIN procs deep (a proc's own hit may trigger one more level of procs, no more);
 *  - every `lethal` entry shares one LETHAL_LOCK (90 s) whatever the source. A fired lethal can save the player (its
 *    actions heal or grant invulnerable); the caller checks the HP after emit('lethal') and cancels the death;
 *  - `tick:<s>` fires every s seconds while in combat; `still:<s>` fires once per standing period (both from update);
 *  - `echo` actions run after their delay, on the engine clock (advanced by update).
 *
 * The engine never throws from the frame loop: bad actions and missing services warn once.
 */
import { RNG } from '../core/utils';
import { Prd } from './prd';
import { TRIGGERS, parseFx } from '../data/talentTrees/fx';
import type { FxItem, ProcEntry } from '../types/talents';
import type { DamageType, PipId } from '../types/common';
import type { StatusId } from '../types/skills';
import { dispelStackLoss } from '../data/statuses';
import type { Actor } from '../entities/Actor';
import type { Player } from '../entities/Player';
import { condsHold, isStanding } from './procConds';
import { liveProcHost, runAction, warnOnce, type ActionEnv, type DynamicBuff, type ProcHost, type SkillFacts } from './procActions';

/** Hidden internal cooldown floor (Appendix D: an entry with `icd=0` still waits 0.25 s). */
export const MIN_ICD = 0.25;
/** Shared lock of every `lethal` entry (§6.1). */
export const LETHAL_LOCK = 90;
/** Maximum depth of proc chains (a proc caused by a proc caused by a proc is not run). */
export const MAX_CHAIN = 2;

/** Triggers whose chance is multiplied by the source skill's `params.proc`. */
const PROC_TRIGGERS: ReadonlySet<string> = new Set(['hit', 'crit', 'kill']);
/** Timer triggers: update() drives them and emit() never does. */
const TIMER_TRIGGERS: ReadonlySet<string> = new Set(['tick', 'still']);

/** What the combat code tells the engine about one event. Only `player` is required. */
export interface ProcCtx {
  /** The player the event happened to or was caused by (the owner of the procs must be the local player). */
  player: Player;
  /** Skill of the event (cast, hit, crit, kill, heal, major). */
  skillId?: string;
  /** Tags of the skill; when absent they come from the host (skillInfo). */
  tags?: string[];
  /** The trigger's target (the enemy hit, the cast target). */
  target?: Actor | null;
  /** The trigger's ally (heal targets, ally buffs). */
  ally?: Actor | null;
  crit?: boolean;
  amount?: number;
  /** For `pip` and `spend` triggers. */
  pipId?: PipId;
  /** For `status` triggers: the status applied to an enemy. */
  status?: StatusId;
  /** Proc multiplier of the source skill (`params.proc`). When absent the host's skill facts are used. */
  proc?: number;
}

/**
 * The `T` items of a parsed fx as engine entries. `src` names the source (node, spec, skill spec) and makes the ids
 * unique (`<src>#<index>`). Rows with an unknown trigger or a timer without a positive interval are dropped.
 */
export function collectProcs(items: readonly FxItem[], src: string): ProcEntry[] {
  const out: ProcEntry[] = [];
  items.forEach((it, i) => {
    if (it.k !== 'T') return;
    if (!TRIGGERS.has(it.trig)) {
      warnOnce(`trig:${it.trig}`, `${src}: unknown trigger "${it.trig}" dropped`);
      return;
    }
    if (TIMER_TRIGGERS.has(it.trig) && !(Number(it.filter) > 0)) {
      warnOnce(`timer:${src}#${i}`, `${src}: ${it.trig} needs a positive interval`);
      return;
    }
    out.push({
      id: `${src}#${i}`,
      on: it.trig,
      filter: it.filter,
      conds: it.conds.slice(),
      ch: it.ch,
      icd: it.icd,
      actions: it.actions.map((a) => ({ a: a.a, args: a.args.slice() })),
      src,
    });
  });
  return out;
}

interface EntryState {
  /** Engine time until which the entry is on its internal cooldown. */
  icdUntil: number;
  /** Seconds accumulated towards the next `tick:<s>`. */
  tick: number;
  /** A `still:<s>` entry already fired in the current standing period. */
  stillFired: boolean;
}

interface Delayed {
  at: number;
  run: () => void;
}

export class ProcEngine {
  private readonly host: ProcHost;
  private entries: ProcEntry[] = [];
  private byTrigger = new Map<string, ProcEntry[]>();
  private state = new Map<string, EntryState>();
  private clock = 0;
  private nest = 0;
  private lethalUntil = 0;
  private standFor = 0;
  private delayed: Delayed[] = [];
  private rng = new RNG((Date.now() ^ 0x7f4a7c15) >>> 0);
  /** CW-07 §2.7: bad-luck protection per entry id (combat/prd.ts). Chances below 1 roll through it. */
  private prd = new Prd();

  constructor(host: ProcHost = liveProcHost) {
    this.host = host;
  }

  /** The entries in force (read-only; debug pages). */
  get active(): readonly ProcEntry[] {
    return this.entries;
  }

  /** Replaces the entries. Runtime state (cooldowns, timers) of entries that stay is kept. */
  setEntries(entries: ProcEntry[]): void {
    this.entries = entries.slice();
    this.byTrigger.clear();
    const keep = new Set<string>();
    for (const e of this.entries) {
      keep.add(e.id);
      const list = this.byTrigger.get(e.on);
      if (list) list.push(e);
      else this.byTrigger.set(e.on, [e]);
    }
    for (const id of [...this.state.keys()]) {
      if (!keep.has(id)) this.state.delete(id);
    }
  }

  /** An event happened. Runs every entry of that trigger whose gates pass. Never throws. */
  emit(trigger: string, ctx: ProcCtx): void {
    if (TIMER_TRIGGERS.has(trigger)) return;
    const list = this.byTrigger.get(trigger);
    if (!list || list.length === 0 || this.nest >= MAX_CHAIN) return;
    const self = ctx.player;
    if (!self?.isLocal) return;
    if (self.isDead && trigger !== 'lethal') return;
    for (const e of list.slice()) {
      if (this.filterOk(e, trigger, ctx)) this.tryFire(e, ctx);
    }
  }

  /** Forgets cooldowns, timers, delayed echoes and the lethal lock (scene change, death, respec). */
  reset(): void {
    this.state.clear();
    this.lethalUntil = 0;
    this.standFor = 0;
    this.delayed = [];
    this.nest = 0;
    this.prd.reset();
  }

  /** Advances the engine clock and runs the timers (`tick`, `still`) and delayed echoes. Call once per frame. */
  update(dt: number): void {
    if (!(dt > 0)) return;
    this.clock += dt;
    this.flushDelayed();
    const self = this.host.localPlayer();
    if (!self || self.isDead) {
      this.standFor = 0;
      for (const st of this.state.values()) {
        st.tick = 0;
        st.stillFired = false;
      }
      return;
    }

    const standing = isStanding(self);
    this.standFor = standing ? this.standFor + dt : 0;
    for (const e of this.byTrigger.get('still') ?? []) {
      const st = this.stateOf(e.id);
      if (!standing) {
        st.stillFired = false;
        continue;
      }
      if (st.stillFired || this.standFor < Number(e.filter)) continue;
      if (this.tryFire(e, { player: self })) st.stillFired = true;
    }

    for (const e of this.byTrigger.get('tick') ?? []) {
      const st = this.stateOf(e.id);
      if (!self.inCombat) {
        st.tick = 0;
        continue;
      }
      const sec = Number(e.filter);
      st.tick += dt;
      if (st.tick < sec) continue;
      // at most one firing per frame; a long frame does not bank a burst
      st.tick = Math.min(st.tick - sec, sec);
      this.tryFire(e, { player: self });
    }
  }

  private stateOf(id: string): EntryState {
    let st = this.state.get(id);
    if (!st) {
      st = { icdUntil: 0, tick: 0, stillFired: false };
      this.state.set(id, st);
    }
    return st;
  }

  /** Trigger filter: `f` is a skill id, `@tag`, `*` or empty; pip and status triggers compare their own id. */
  private filterOk(e: ProcEntry, trigger: string, ctx: ProcCtx): boolean {
    const f = e.filter;
    if (!f || f === '*') return true;
    if (trigger === 'pip' || trigger === 'spend') return ctx.pipId === f;
    if (trigger === 'status') return ctx.status === f;
    if (f.startsWith('@')) return this.tagsOf(ctx).includes(f.slice(1));
    return ctx.skillId === f;
  }

  private tagsOf(ctx: ProcCtx): string[] {
    if (ctx.tags) return ctx.tags;
    const info: SkillFacts | undefined = ctx.skillId ? this.host.skillInfo(ctx.skillId) : undefined;
    return info?.tags ?? [];
  }

  private procMul(ctx: ProcCtx): number {
    if (ctx.proc !== undefined) return ctx.proc;
    const info: SkillFacts | undefined = ctx.skillId ? this.host.skillInfo(ctx.skillId) : undefined;
    return info?.proc ?? 1;
  }

  /**
   * The gates of one entry, in order: internal cooldown (event triggers only), lethal lock, conditions, chance.
   * Fires it when all pass and returns true. The cooldown starts only when the entry fires.
   */
  private tryFire(e: ProcEntry, ctx: ProcCtx): boolean {
    if (this.nest >= MAX_CHAIN) return false;
    const timed = TIMER_TRIGGERS.has(e.on);
    const st = this.stateOf(e.id);
    if (!timed && this.clock < st.icdUntil) return false;
    if (e.on === 'lethal' && this.clock < this.lethalUntil) return false;
    const target = ctx.target ?? null;
    if (!condsHold(e.conds, { self: ctx.player, target, host: this.host })) return false;
    const mul = PROC_TRIGGERS.has(e.on) ? this.procMul(ctx) : 1;
    const p = e.ch * mul;
    if (p < 1 && !this.prd.roll(e.id, p, () => this.rng.next())) return false;
    if (!timed) st.icdUntil = this.clock + Math.max(MIN_ICD, e.icd);
    if (e.on === 'lethal') this.lethalUntil = this.clock + LETHAL_LOCK;
    this.run(e, ctx, target);
    return true;
  }

  private run(e: ProcEntry, ctx: ProcCtx, target: Actor | null): void {
    const env: ActionEnv = {
      self: ctx.player,
      target,
      ally: ctx.ally ?? null,
      host: this.host,
      src: e.id,
      schedule: (delay, fn) => {
        this.delayed.push({ at: this.clock + Math.max(0, delay), run: fn });
      },
    };
    this.nest++;
    try {
      for (const a of e.actions) {
        try {
          runAction(a.a, a.args, env);
        } catch (err) {
          warnOnce(`run:${e.id}`, `proc ${e.id} action "${a.a}" failed: ${String(err)}`);
        }
      }
    } finally {
      this.nest--;
    }
  }

  private flushDelayed(): void {
    if (this.delayed.length === 0) return;
    const due = this.delayed.filter((d) => d.at <= this.clock);
    if (due.length === 0) return;
    this.delayed = this.delayed.filter((d) => d.at > this.clock);
    for (const d of due) {
      this.nest++;
      try {
        d.run();
      } catch (err) {
        warnOnce('delayed', `delayed proc action failed: ${String(err)}`);
      } finally {
        this.nest--;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Self test: a fake world, no G. Scripted events against real fx strings (parseFx + collectProcs).
// ---------------------------------------------------------------------------------------------------------------

interface FakeStatus {
  id: string;
  magnitude: number;
  stacks: number;
}

class FakeStatuses {
  readonly map = new Map<string, FakeStatus>();
  /** apply() calls per status id (the shield test counts them). */
  readonly applies = new Map<string, number>();

  apply(id: string, duration: number, opts: { magnitude?: number; stacks?: number } = {}): boolean {
    if (duration <= 0) return false;
    this.map.set(id, { id, magnitude: opts.magnitude ?? 0, stacks: opts.stacks ?? 1 });
    this.applies.set(id, (this.applies.get(id) ?? 0) + 1);
    return true;
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  stacks(id: string): number {
    return this.map.get(id)?.stacks ?? 0;
  }

  remove(id: string): void {
    this.map.delete(id);
  }

  /** Mirrors StatusEffects.dispel: a status with an onDispel stack loss keeps its rest, any other is removed whole. */
  dispel(id: string): boolean {
    const s = this.map.get(id);
    if (!s) return false;
    const loss = dispelStackLoss(id as StatusId);
    if (loss > 0 && s.stacks > loss) s.stacks -= loss;
    else this.map.delete(id);
    return true;
  }

  list(): { id: string }[] {
    return [...this.map.values()].map((s) => ({ id: s.id }));
  }
}

interface FakeUnit {
  id: number;
  kind: 'player' | 'enemy';
  isLocal: boolean;
  hp: number;
  maxHp: number;
  resource: number;
  maxResource: number;
  velocity: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  height: number;
  radius: number;
  removed: boolean;
  inCombat: boolean;
  forcedMove: null;
  def?: { rank: string };
  statuses: FakeStatuses;
  readonly hpFrac: number;
  readonly isDead: boolean;
}

function fakeUnit(id: number, o: { local?: boolean; kind?: 'player' | 'enemy'; rank?: string } = {}): FakeUnit {
  const u: FakeUnit = {
    id,
    kind: o.kind ?? 'player',
    isLocal: o.local ?? false,
    hp: 100,
    maxHp: 100,
    resource: 50,
    maxResource: 100,
    velocity: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    height: 2,
    radius: 0.5,
    removed: false,
    inCombat: true,
    forcedMove: null,
    def: o.rank ? { rank: o.rank } : undefined,
    statuses: new FakeStatuses(),
    get hpFrac(): number {
      return Math.max(0, this.hp / this.maxHp);
    },
    get isDead(): boolean {
      return this.hp <= 0;
    },
  };
  return u;
}

const SKILL_FACTS: Record<string, SkillFacts> = {
  hitskill: { tags: ['basic', 'melee'], proc: 1, cooldown: 0 },
  spellskill: { tags: ['spell', 'fire'], proc: 1, cooldown: 3 },
  other: { tags: ['spell'], proc: 1, cooldown: 0 },
};

class FakeHost implements ProcHost {
  me: FakeUnit = fakeUnit(1, { local: true });
  allies: FakeUnit[] = [];
  foe: FakeUnit = fakeUnit(50, { kind: 'enemy', rank: 'elite' });
  log: string[] = [];
  buffs = new Map<string, number>();
  pips = new Map<string, number>();
  hitCalls = 0;
  /** Chain depth at which the deepest proc hit happened. */
  maxDepth = 0;
  /** When true, every proc hit re-emits 'hit' (chain-depth test). */
  reentrant = false;
  engine: ProcEngine | null = null;
  private depth = 0;

  private get self(): Player {
    return this.me as unknown as Player;
  }

  localPlayer(): Player | null {
    return this.self;
  }

  party(self: Player, _radius: number): Player[] {
    return [self, ...this.allies.map((a) => a as unknown as Player)];
  }

  nearestEnemy(_self: Player, _radius: number): Actor | null {
    return this.foe as unknown as Actor;
  }

  skillInfo(skillId: string): SkillFacts | undefined {
    return SKILL_FACTS[skillId];
  }

  skillsWithTag(tag: string): string[] {
    return tag === 'minion' ? ['necro_a', 'necro_b'] : [];
  }

  pipCount(_self: Player, id: string): number {
    return this.pips.get(id) ?? 0;
  }

  addPip(_self: Player, id: string, n: number): void {
    this.pips.set(id, (this.pips.get(id) ?? 0) + n);
  }

  reduceCooldown(_self: Player, skillId: string, sec: number): void {
    this.log.push(`cdr:${skillId}:${sec}`);
  }

  resetCooldown(_self: Player, skillId: string): void {
    this.log.push(`rst:${skillId}`);
  }

  heal(_source: Player, target: Player, amount: number): void {
    const t = target as unknown as FakeUnit;
    t.hp = Math.min(t.maxHp, t.hp + amount);
    this.log.push(`heal:${amount}`);
  }

  buff(_self: Player, def: DynamicBuff): boolean {
    const cur = this.buffs.get(def.id) ?? 0;
    this.buffs.set(def.id, Math.min(def.maxStacks, cur + 1));
    return true;
  }

  hit(_self: Player, target: Actor, coef: number, type: DamageType): void {
    this.hitCalls++;
    this.maxDepth = Math.max(this.maxDepth, this.depth);
    this.log.push(`hit:${type}:${coef}`);
    if (this.reentrant && this.engine) {
      this.depth++;
      try {
        this.engine.emit('hit', { player: this.self, skillId: 'hitskill', target });
      } finally {
        this.depth--;
      }
    }
  }

  explode(_self: Player, _target: Actor, _coef: number, radius: number, type: DamageType): void {
    this.log.push(`exp:${type}:${radius}`);
  }

  echo(_self: Player, skillId: string, _coef: number, _target: Actor): void {
    this.log.push(`echo:${skillId}`);
  }
}

/** Parses an fx string, collects its procs and binds them to a new engine on the fake host. */
function engineWith(host: FakeHost, fx: string, fails: string[]): ProcEngine {
  const parsed = parseFx(fx);
  if (parsed.errors.length > 0) fails.push(`parse "${fx}": ${parsed.errors.join('; ')}`);
  const eng = new ProcEngine(host);
  eng.setEntries(collectProcs(parsed.items, 'test'));
  host.engine = eng;
  return eng;
}

const ctxOf = (h: FakeHost, extra: Partial<ProcCtx> = {}): ProcCtx => ({
  player: h.me as unknown as Player,
  skillId: 'hitskill',
  target: h.foe as unknown as Actor,
  ...extra,
});

/** Drives a fake world through scripted events and returns the failed checks (empty when all pass). */
export function selfTestProcs(): string[] {
  const fails: string[] = [];
  const expect = (label: string, ok: boolean): void => {
    if (!ok) fails.push(label);
  };
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

  // 1-2: crit stacks a dynamic buff up to its cap of 5
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T crit => buff(crit_rage,4,{damagePct=.05},max=5)', fails);
    const stacks: number[] = [];
    for (let i = 0; i < 6; i++) {
      eng.update(0.3);
      eng.emit('crit', ctxOf(h));
      stacks.push(h.buffs.get('tb:crit_rage') ?? 0);
    }
    expect(`crit stacks ${stacks.join(',')}`, stacks.join(',') === '1,2,3,4,5,5');
  }

  // 3: internal cooldown of a hit entry (icd=2): the second hit inside 2 s does nothing
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T hit icd=2 => res(10)', fails);
    eng.emit('hit', ctxOf(h));
    const first = h.me.resource;
    eng.emit('hit', ctxOf(h));
    const blocked = h.me.resource;
    eng.update(2.1);
    eng.emit('hit', ctxOf(h));
    expect(`icd res ${first} ${blocked} ${h.me.resource}`, first === 60 && blocked === 60 && h.me.resource === 70);
  }

  // 4-6: lethal save heals and grants invulnerable; the shared 90 s lock then holds
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)', fails);
    h.me.hp = 0;
    eng.emit('lethal', ctxOf(h));
    expect(`lethal saves hp=${h.me.hp}`, near(h.me.hp, 20) && h.me.statuses.has('invulnerable'));
    h.me.hp = 0;
    eng.emit('lethal', ctxOf(h));
    expect('lethal locked right after', h.me.hp === 0);
    eng.update(89);
    eng.emit('lethal', ctxOf(h));
    expect('lethal still locked at 89 s', h.me.hp === 0);
    eng.update(2);
    eng.emit('lethal', ctxOf(h));
    expect(`lethal fires after 90 s hp=${h.me.hp}`, near(h.me.hp, 20));
  }

  // 6b: the 90 s lock is shared: a second lethal entry does not fire in the same save window
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T lethal icd=90 => heal(.2) ;; T lethal icd=90 => heal(.1)', fails);
    h.me.hp = 0;
    eng.emit('lethal', ctxOf(h));
    expect(`shared lethal lock hp=${h.me.hp} (expect 20)`, near(h.me.hp, 20));
  }

  // 7-8: kill with `if=tst:burn` only explodes while the dead target still burns
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T kill if=tst:burn => exp(.8,4,fire)', fails);
    eng.emit('kill', ctxOf(h));
    expect('kill without burn does nothing', !h.log.some((s) => s.startsWith('exp')));
    h.foe.statuses.apply('burn', 5);
    eng.emit('kill', ctxOf(h));
    expect('kill with burn explodes', h.log.includes('exp:fire:4'));
  }

  // 9: chain depth: every proc hit re-emits 'hit' (three entries). Hits happen at chain depth 0 and 1 only
  {
    const h = new FakeHost();
    h.reentrant = true;
    const eng = engineWith(h, 'T hit => dmg(.5,fire) ;; T hit => dmg(.1,frost) ;; T hit => dmg(.2,holy)', fails);
    eng.emit('hit', ctxOf(h));
    expect(`chain depth 2 (hits=${h.hitCalls} maxDepth=${h.maxDepth})`, h.hitCalls === 3 && h.maxDepth === 1);
  }

  // 10: ch=0 never fires
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T hit ch=0 => res(5)', fails);
    for (let i = 0; i < 3; i++) {
      eng.update(0.3);
      eng.emit('hit', ctxOf(h));
    }
    expect('ch=0 never fires', h.me.resource === 50);
  }

  // 11: cast filter by skill id, crit filter by tag
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T cast:other => res(10) ;; T crit:@melee => res(1)', fails);
    eng.emit('cast', ctxOf(h, { skillId: 'hitskill' }));
    expect('cast filter rejects another skill', h.me.resource === 50);
    eng.emit('cast', ctxOf(h, { skillId: 'other' }));
    expect('cast filter accepts its skill', h.me.resource === 60);
    eng.update(0.3);
    eng.emit('crit', ctxOf(h, { skillId: 'spellskill' }));
    expect('crit:@melee rejects a spell', h.me.resource === 60);
    eng.emit('crit', ctxOf(h, { skillId: 'hitskill' }));
    expect('crit:@melee accepts a melee skill', h.me.resource === 61);
  }

  // 12-13: status and pip triggers compare their own id
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T status:burn => res(2) ;; T pip:arcane => pip(arcane,1)', fails);
    eng.emit('status', ctxOf(h, { status: 'chill' }));
    expect('status:burn ignores chill', h.me.resource === 50);
    eng.emit('status', ctxOf(h, { status: 'burn' }));
    expect('status:burn fires on burn', h.me.resource === 52);
    eng.emit('pip', ctxOf(h, { pipId: 'combo' }));
    expect('pip:arcane ignores combo', !h.pips.has('arcane'));
    eng.emit('pip', ctxOf(h, { pipId: 'arcane' }));
    expect('pip:arcane adds one arcane pip', h.pips.get('arcane') === 1);
  }

  // 14-15: still:<s> fires once per standing period
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T still:1.5 => resp(.1)', fails);
    h.me.velocity.x = 1;
    eng.update(2);
    h.me.velocity.x = 0;
    eng.update(1.0);
    const early = h.me.resource;
    eng.update(0.6);
    const firstFire = h.me.resource;
    eng.update(3);
    const sameStanding = h.me.resource;
    h.me.velocity.x = 1;
    eng.update(0.1);
    h.me.velocity.x = 0;
    eng.update(1.6);
    expect(`still ${early} ${firstFire} ${sameStanding} ${h.me.resource}`,
      early === 50 && firstFire === 60 && sameStanding === 60 && h.me.resource === 70);
  }

  // 16: tick:<s> with if=inCombat fires only in combat
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T tick:1 if=inCombat => res(3)', fails);
    eng.update(1.0);
    eng.update(0.5);
    eng.update(0.5);
    const inCombat = h.me.resource;
    h.me.inCombat = false;
    eng.update(5);
    expect(`tick in combat ${inCombat} out ${h.me.resource}`, inCombat === 56 && h.me.resource === 56);
  }

  // 17-18: hurt with hp<.4 applies a shield once inside its cooldown
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T hurt if=hp<.4 icd=45 => abs(.15,6)', fails);
    h.me.hp = 90;
    eng.emit('hurt', ctxOf(h));
    expect('hurt at 90% hp does nothing', !h.me.statuses.has('shield'));
    h.me.hp = 30;
    eng.emit('hurt', ctxOf(h));
    eng.update(1);
    eng.emit('hurt', ctxOf(h));
    const shield = h.me.statuses.map.get('shield');
    expect(`abs shield once (applies=${h.me.statuses.applies.get('shield')})`,
      h.me.statuses.applies.get('shield') === 1 && shield !== undefined && near(shield.magnitude, 15));
  }

  // 19: healally heals the lowest-HP% ally (self excluded)
  {
    const h = new FakeHost();
    const ally = fakeUnit(2);
    ally.hp = 50;
    h.allies.push(ally);
    const eng = engineWith(h, 'T dodge => healally(.1)', fails);
    eng.emit('dodge', ctxOf(h));
    expect(`healally ally hp ${ally.hp}`, near(ally.hp, 60));
  }

  // 20: cdr with @tag reduces every skill of the tag
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T major => cdr(@minion,2)', fails);
    eng.emit('major', ctxOf(h));
    expect('cdr @minion hits both skills', h.log.includes('cdr:necro_a:2') && h.log.includes('cdr:necro_b:2'));
  }

  // 21: purge removes a dispellable debuff from the owner
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T hurt => purge(1)', fails);
    h.me.statuses.apply('burn', 5);
    eng.emit('hurt', ctxOf(h));
    expect('purge removes burn', !h.me.statuses.has('burn'));
  }

  // 21b: purge on arcane_lockdown (onDispel: 1 stack) drops one stack and keeps the status
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T hurt => purge(1)', fails);
    h.me.statuses.apply('arcane_lockdown', 5, { stacks: 3 });
    eng.emit('hurt', ctxOf(h));
    expect('purge drops one arcane_lockdown stack', h.me.statuses.stacks('arcane_lockdown') === 2);
  }

  // 22: echo replays after its delay, not before
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T crit => echo(necro_bone_spear,.5,.1)', fails);
    eng.emit('crit', ctxOf(h));
    const before = h.log.some((s) => s.startsWith('echo'));
    eng.update(0.05);
    const mid = h.log.some((s) => s.startsWith('echo'));
    eng.update(0.1);
    expect(`echo timing before=${before} mid=${mid}`, !before && !mid && h.log.includes('echo:necro_bone_spear'));
  }

  // 23: a remote player's events never run the local procs
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T hit => res(10)', fails);
    const remote = fakeUnit(3);
    eng.emit('hit', { player: remote as unknown as Player, target: h.foe as unknown as Actor });
    expect('remote player ignored', h.me.resource === 50);
  }

  // 24-25: reset() clears the lethal lock; setEntries([]) silences the engine
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T lethal => heal(.2)', fails);
    h.me.hp = 0;
    eng.emit('lethal', ctxOf(h));
    eng.reset();
    h.me.hp = 0;
    eng.emit('lethal', ctxOf(h));
    expect(`reset clears the lock hp=${h.me.hp}`, near(h.me.hp, 20));
    eng.setEntries([]);
    h.me.hp = 0;
    eng.emit('lethal', ctxOf(h));
    expect('setEntries([]) silences the engine', h.me.hp === 0);
  }

  // 26: the minimum internal cooldown (icd=0 waits 0.25 s)
  {
    const h = new FakeHost();
    const eng = engineWith(h, 'T hit => res(1)', fails);
    eng.emit('hit', ctxOf(h));
    eng.emit('hit', ctxOf(h));
    const sameFrame = h.me.resource;
    eng.update(0.3);
    eng.emit('hit', ctxOf(h));
    expect(`min icd same frame ${sameFrame} later ${h.me.resource}`, sameFrame === 51 && h.me.resource === 52);
  }

  // 27: collectProcs keeps only well-formed T rows
  {
    const bad = collectProcs(parseFx('T zzz => res(1)').items, 't');
    const zeroTimer = collectProcs(parseFx('T tick:0 => res(1)').items, 't');
    const mixed = collectProcs(parseFx('S maxHpPct=.1 ;; G knight_intercept ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)').items, 't');
    expect('collectProcs drops unknown trigger', bad.length === 0);
    expect('collectProcs drops tick:0', zeroTimer.length === 0);
    expect('collectProcs keeps only the T row', mixed.length === 1 && mixed[0].icd === 90 && mixed[0].actions.length === 2);
  }

  return fails;
}
