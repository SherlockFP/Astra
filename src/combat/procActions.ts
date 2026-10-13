/**
 * GDD_TALENTS §2.5 / Appendix D: the 15 proc actions of a `T` row (`=> action ; action`). OWNER: combat (T4).
 *
 * The actions resolve their targets here and hand everything that belongs to another module to a ProcHost, so the proc
 * engine compiles and self-tests without a world. `liveProcHost` is the production host (it reaches the game through G).
 * Calls it makes into systems that do not exist yet warn once and do nothing: the dynamic buff API of StatusEffects
 * (`G.status.applyDynamic`), `SkillSystem.addPip` and `SkillSystem.castEcho`. The `echo` fallback is a plain hit.
 *
 * Procs act for the LOCAL player only; Procs.ts checks that before any action runs.
 * Hits caused by `dmg` / `exp` / `echo` carry the `proc` tag in `HitSpec.tags`, so the hit owner can leave them out of
 * the proc triggers (no further procs from a proc, Appendix D).
 */
import { G } from '../game/G';
import { SKILLS } from '../data/skills';
import { STATUSES } from '../data/statuses';
import type { DamageType, EntityId } from '../types/common';
import type { SkillDef, StatusId } from '../types/skills';
import type { StatBlock, StatId } from '../types/stats';
import type { Actor } from '../entities/Actor';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { HitSpec } from './Combat';

/** Static facts of a skill that the engine needs (tags for filters, the proc multiplier, damage for the echo fallback). */
export interface SkillFacts {
  tags: string[];
  /** `params.proc`, default 1. Multiplies the chance of hit / crit / kill entries. */
  proc: number;
  cooldown: number;
  damage?: { coef: number; type: DamageType };
}

/** A `buff(key,dur,{…},max=n)` row: the dynamic status `tb:<key>` (no StatusDef; one instance per key). */
export interface DynamicBuff {
  id: string;
  name: string;
  icon: string;
  stats: StatBlock;
  duration: number;
  /** Stack cap (`max=`, 1 when absent, at most 5). Re-applying refreshes the duration and adds a stack. */
  maxStacks: number;
}

/**
 * Everything an action may touch outside its own target. The engine passes this; tests pass a fake. Methods take the
 * local player as `self` (procs act for it only).
 */
export interface ProcHost {
  /** The local player, or null outside a world. */
  localPlayer(): Player | null;
  /** Living players around `self` within `radius` m (Infinity = the whole party). `self` is always included. */
  party(self: Player, radius: number): Player[];
  /** Nearest living enemy within `radius` m, or null. */
  nearestEnemy(self: Player, radius: number): Actor | null;
  skillInfo(skillId: string): SkillFacts | undefined;
  /** Ids of the skills that carry `tag` (for `cdr(@tag,…)`). */
  skillsWithTag(tag: string): string[];
  pipCount(self: Player, id: string): number;
  addPip(self: Player, id: string, n: number): void;
  reduceCooldown(self: Player, skillId: string, sec: number): void;
  resetCooldown(self: Player, skillId: string): void;
  /** Heals `target` by `amount` (the existing heal path: local or sent to the owner peer). */
  heal(source: Player, target: Player, amount: number): void;
  /** Applies (or refreshes) the dynamic buff on `self`. False when the buff API is not wired. */
  buff(self: Player, def: DynamicBuff): boolean;
  /** One extra player hit on `target` (weapon damage × coef, no combo credit). */
  hit(self: Player, target: Actor, coef: number, type: DamageType): void;
  /** Hit on every enemy within `radius` m of `target`, the target included. */
  explode(self: Player, target: Actor, coef: number, radius: number, type: DamageType): void;
  /** Replays a skill's hit on `target` after the echo delay (`coef` of the skill's damage). */
  echo(self: Player, skillId: string, coef: number, target: Actor): void;
}

/** What an action receives: the local player, the trigger's target and ally, and a delayed-call hook. */
export interface ActionEnv {
  self: Player;
  target: Actor | null;
  ally: Actor | null;
  host: ProcHost;
  /** Runs `fn` after `delay` seconds of engine time (used by `echo`). */
  schedule(delay: number, fn: () => void): void;
}

const warned = new Set<string>();

/** Logs a message once per key (console only; the proc engine never throws from the frame loop). */
export function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[procs] ${msg}`);
}

const DAMAGE_TYPES: readonly DamageType[] = ['physical', 'fire', 'frost', 'lightning', 'shadow', 'poison', 'holy', 'arcane'];
const BUFF_ICON = '/assets/icons/buff-blessing.svg';
const MAX_BUFF_STACKS = 5;
const ECHO_RANGE = 12;

/** Parses a numeric argument ("+1", ".8", "-3"). Anything that is not a finite number reads as 0. */
function num(s: string | undefined): number {
  const n = Number(String(s ?? '').replace(/^\+/, ''));
  return Number.isFinite(n) ? n : 0;
}

function dmgType(s: string | undefined): DamageType {
  if (s !== undefined && (DAMAGE_TYPES as readonly string[]).includes(s)) return s as DamageType;
  warnOnce(`type:${s}`, `unknown damage type "${s}" in a proc; using physical`);
  return 'physical';
}

/** `{a=1,b=.5}` to a StatBlock. */
function parseStats(block: string): StatBlock {
  const out: StatBlock = {};
  for (const kv of block.replace(/^\{/, '').replace(/\}$/, '').split(',')) {
    const [k, v] = kv.split('=');
    if (k && v !== undefined) out[k.trim() as StatId] = num(v);
  }
  return out;
}

function clampResource(self: Player, v: number): number {
  return Math.max(0, Math.min(self.maxResource, v));
}

/** Applies a status to an actor. Unknown status ids warn once and do nothing. */
function applyStatus(a: Actor, id: string, dur: number, mag: number | undefined, sourceId: EntityId): boolean {
  if (!STATUSES[id as StatusId]) {
    warnOnce(`status:${id}`, `unknown status "${id}" in a proc`);
    return false;
  }
  return a.statuses.apply(id as StatusId, dur, { magnitude: mag, sourceId });
}

/** The lowest-HP-fraction ally of `self` (self excluded), or null when alone. */
function lowestHpAlly(self: Player, host: ProcHost): Player | null {
  let best: Player | null = null;
  for (const p of host.party(self, Infinity)) {
    if (p === self) continue;
    if (!best || p.hpFrac < best.hpFrac) best = p;
  }
  return best;
}

/** `st` / `ally` resolution: the trigger's ally, else the lowest-HP% ally, else self. */
function allyOf(env: ActionEnv): Actor {
  return env.ally ?? lowestHpAlly(env.self, env.host) ?? env.self;
}

/** Targets of a `who` argument: self · tgt · ally · party · near(r). */
function resolveWho(who: string, env: ActionEnv): Actor[] {
  const { self, target, host } = env;
  switch (who) {
    case 'self': return [self];
    case 'tgt': return target ? [target] : [];
    case 'ally': return [allyOf(env)];
    case 'party': return host.party(self, Infinity);
    default: {
      const m = /^near\((\d+(?:\.\d+)?)\)$/.exec(who);
      if (m) return host.party(self, num(m[1]));
      warnOnce(`who:${who}`, `bad proc target "${who}"`);
      return [];
    }
  }
}

/** A skill selector of `cdr` / `rst`: a skill id or `@tag`. */
function skillSel(sel: string, host: ProcHost): string[] {
  return sel.startsWith('@') ? host.skillsWithTag(sel.slice(1)) : [sel];
}

/** Removes up to `n` dispellable debuffs from the owner. */
function purge(self: Player, n: number): void {
  let left = n;
  for (const s of self.statuses.list()) {
    if (left <= 0) break;
    const def = STATUSES[s.id];
    if (def && def.kind === 'debuff' && def.dispellable) {
      self.statuses.remove(s.id);
      left--;
    }
  }
}

/**
 * Runs one action of a proc. `name` and `args` come from the parsed `T` row (`buff` keeps its `{…}` block as one arg,
 * `max=n` is its own arg). Never throws for bad data: unknown names and targets warn once.
 */
export function runAction(name: string, args: readonly string[], env: ActionEnv): void {
  const { self, host } = env;
  switch (name) {
    case 'st': {
      const mag = args.length > 3 ? num(args[3]) : undefined;
      for (const a of resolveWho(args[0] ?? '', env)) applyStatus(a, args[1] ?? '', num(args[2]), mag, self.id);
      return;
    }
    case 'buff': {
      const key = args[0] ?? '';
      if (!key) return;
      const block = args.find((s) => s.startsWith('{')) ?? '{}';
      const maxArg = args.find((s) => s.startsWith('max='));
      const max = maxArg ? Math.floor(num(maxArg.slice(4))) : 1;
      host.buff(self, {
        id: `tb:${key}`,
        name: key,
        icon: BUFF_ICON,
        stats: parseStats(block),
        duration: num(args[1]),
        maxStacks: Math.max(1, Math.min(MAX_BUFF_STACKS, max)),
      });
      return;
    }
    case 'cdr': {
      const sec = num(args[1]);
      for (const id of skillSel(args[0] ?? '', host)) host.reduceCooldown(self, id, sec);
      return;
    }
    case 'rst': {
      for (const id of skillSel(args[0] ?? '', host)) host.resetCooldown(self, id);
      return;
    }
    case 'res': {
      self.resource = clampResource(self, self.resource + num(args[0]));
      return;
    }
    case 'resp': {
      self.resource = clampResource(self, self.resource + num(args[0]) * self.maxResource);
      return;
    }
    case 'pip': {
      host.addPip(self, args[0] ?? '', num(args[1]));
      return;
    }
    case 'exp': {
      if (env.target) host.explode(self, env.target, num(args[0]), num(args[1]), dmgType(args[2]));
      return;
    }
    case 'dmg': {
      if (env.target) host.hit(self, env.target, num(args[0]), dmgType(args[1]));
      return;
    }
    case 'heal': {
      host.heal(self, self, num(args[0]) * self.maxHp);
      return;
    }
    case 'healally': {
      const ally = lowestHpAlly(self, host) ?? self;
      host.heal(self, ally, num(args[0]) * ally.maxHp);
      return;
    }
    case 'abs': {
      applyStatus(self, 'shield', num(args[1]), num(args[0]) * self.maxHp, self.id);
      return;
    }
    case 'echo': {
      const target = env.target ?? host.nearestEnemy(self, ECHO_RANGE);
      if (!target) return;
      const skillId = args[0] ?? '';
      const coef = num(args[1]);
      env.schedule(num(args[2]), () => host.echo(self, skillId, coef, target));
      return;
    }
    case 'purge': {
      purge(self, Math.max(0, Math.floor(num(args[0]))));
      return;
    }
    case 'spawn': {
      warnOnce('spawn', 'spawn() is reserved and no v1 data uses it; ignored');
      return;
    }
    default: {
      warnOnce(`action:${name}`, `unknown proc action "${name}" ignored`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Production host
// ---------------------------------------------------------------------------------------------------------------

/** Optional APIs that other owners add later. Read through these views so this file compiles before they exist. */
interface DynamicStatusApi { applyDynamic?: (actor: Actor, def: DynamicBuff) => void }
interface PipApi { addPip?: (actor: Actor, id: string, n: number) => void }
interface EchoApi { castEcho?: (actor: Actor, skillId: string, coef: number, target: Actor) => void }

const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }): number => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/** One player hit on an enemy (proc-tagged, no combo credit). Other targets are ignored. */
function hitEnemy(self: Player, target: Actor, coef: number, type: DamageType): void {
  if (target.kind !== 'enemy' || target.isDead || target.removed) return;
  const spec: HitSpec = {
    coef,
    type,
    tags: ['proc'],
    canCrit: true,
    noCombo: true,
    pos: [target.position.x, target.position.y + target.height * 0.5, target.position.z],
  };
  G.combat.playerHitEnemy(self, target as unknown as Enemy, spec);
}

/** The production host: every call goes to the live services through G. */
export const liveProcHost: ProcHost = {
  localPlayer: () => G.player ?? null,

  party(self, radius) {
    const w = G.world;
    const pool: Player[] = !w ? [] : radius === Infinity ? w.players.slice() : w.playersInRadius(self.position, radius);
    const out = pool.filter((p) => !p.isDead);
    if (!out.includes(self)) out.unshift(self);
    return out;
  },

  nearestEnemy(self, radius) {
    const list = G.world?.enemiesInRadius(self.position, radius) ?? [];
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of list) {
      if (e.isDead || e.removed) continue;
      const d = dist2(e.position, self.position);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  },

  skillInfo(skillId) {
    const d = SKILLS[skillId] as SkillDef | undefined;
    if (!d) return undefined;
    return {
      tags: d.tags ?? [],
      proc: d.params?.proc ?? 1,
      cooldown: d.cooldown,
      damage: d.damage ? { coef: d.damage.coef, type: d.damage.type } : undefined,
    };
  },

  skillsWithTag(tag) {
    return Object.values(SKILLS).filter((s) => s.tags?.includes(tag)).map((s) => s.id);
  },

  pipCount(self, id) {
    return (self as unknown as { pips?: Partial<Record<string, number>> }).pips?.[id] ?? 0;
  },

  addPip(self, id, n) {
    const api = G.skills as unknown as PipApi;
    if (api.addPip) api.addPip(self, id, n);
    else warnOnce('pip', 'SkillSystem.addPip is not wired yet; pip() ignored');
  },

  reduceCooldown(self, skillId, sec) {
    G.skills.reduceCooldown(self, skillId, sec);
  },

  resetCooldown(self, skillId) {
    G.skills.resetCooldown(self, skillId);
  },

  heal(source, target, amount) {
    G.combat.healPlayer(source, target, amount);
  },

  buff(self, def) {
    const api = (G as unknown as { status?: DynamicStatusApi }).status;
    if (api?.applyDynamic) {
      api.applyDynamic(self, def);
      return true;
    }
    warnOnce('buff', 'dynamic buffs (tb:<key>) need the StatusEffects dynamic API (T7); buff() ignored');
    return false;
  },

  hit(self, target, coef, type) {
    hitEnemy(self, target, coef, type);
  },

  explode(self, target, coef, radius, type) {
    const hits = new Set<Actor>([target, ...(G.world?.enemiesInRadius(target.position, radius) ?? [])]);
    for (const e of hits) hitEnemy(self, e, coef, type);
  },

  echo(self, skillId, coef, target) {
    const api = G.skills as unknown as EchoApi;
    if (api.castEcho) {
      api.castEcho(self, skillId, coef, target);
      return;
    }
    warnOnce('echo', 'SkillSystem.castEcho is not wired yet; echo() falls back to a plain hit');
    const d = SKILLS[skillId] as SkillDef | undefined;
    hitEnemy(self, target, coef * (d?.damage?.coef ?? 1), d?.damage?.type ?? 'physical');
  },
};
