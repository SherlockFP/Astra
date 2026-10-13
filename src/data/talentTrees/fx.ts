/**
 * GDD_TALENTS §2.5 / Appendix D — the effect DSL parser. A port of the Appendix G reference implementation (tested on
 * all 972 fx strings of the design) with typed output (`FxItem` / `Cond` of types/talents.ts, the T0 contract).
 * Pure functions, no `G`. Behaviour is the reference's; do not redesign it here.
 *
 *   fx    := item ( " ;; " item )*
 *   item  := "S " key=val …  | "M " target op=val …  | "T " trigger[:filter] [if=conds] [ch=p] [icd=s] " => " action ( " ; " action )*
 *          | "G " skillId    | "X " specialId{key=val,…}
 *
 * Note: for `T` items the first `:` argument is stored in `filter` for every trigger (skill / @tag / * for hit-crit-kill-cast,
 * the interval for `tick` and `still`, the status id for `status`, the pip id for `pip` and `spend`).
 */
import type { Cond, FxItem } from '../../types/talents';
import { STAT_IDS } from '../../types/stats';
import type { StatBlock, StatId } from '../../types/stats';

export type { Cond, FxItem } from '../../types/talents';

type ModItem = Extract<FxItem, { k: 'M' }>;
type TrigItem = Extract<FxItem, { k: 'T' }>;
type ModOp = ModItem['ops'][number];
type ActionItem = TrigItem['actions'][number];

/** Triggers (Appendix D, 16). */
export const TRIGGERS: ReadonlySet<string> = new Set([
  'hit', 'crit', 'kill', 'cast', 'dodge', 'block', 'parry', 'hurt', 'lethal', 'heal', 'pip', 'spend', 'status', 'major', 'still', 'tick',
]);
/** Actions (Appendix D, 15). */
export const ACTIONS: ReadonlySet<string> = new Set([
  'st', 'buff', 'cdr', 'rst', 'res', 'resp', 'pip', 'exp', 'dmg', 'heal', 'healally', 'abs', 'echo', 'spawn', 'purge',
]);
/** Mod ops (Appendix D, 26; `p.<key>` is handled separately). */
export const MOD_OPS: ReadonlySet<string> = new Set([
  'dmgx', 'cd', 'cdx', 'cost', 'costx', 'dur', 'rad', 'radx', 'rng', 'cast', 'castx', 'chg', 'cnt', 'prc', 'stgx', 'kbx',
  'st', 'sdur', 'cv', 'pip', 'pipc', 'crit', 'dotx', 'healx', 'absx', 'shape',
]);
/** Damage types accepted by `cv`. */
export const FX_CONVERT_TYPES: readonly string[] = ['physical', 'fire', 'frost', 'lightning', 'shadow', 'poison', 'holy', 'arcane'];
/** Pip ids accepted by `pip` / `pipc` / `pips>=`. */
export const FX_PIPS: readonly string[] = ['combo', 'adalet', 'karisim', 'chi', 'holypower', 'shard', 'arcane'];
/** Tag list (Appendix D), used for `@tag` targets and filters. */
export const FX_TAGS: readonly string[] = [
  'basic', 'melee', 'spell', 'projectile', 'aoe', 'dot', 'kick', 'finisher', 'ultimate', 'movement', 'major', 'buff', 'defensive',
  'fire', 'frost', 'arcane', 'holy', 'shadow', 'physical', 'poison', 'heal', 'trap', 'curse', 'builder', 'spender', 'minion', 'pet',
  'unarmed', 'bone', 'cc', 'zone', 'aura', 'shout', 'summon', 'bleed', 'channel', 'combo', 'shield', 'taunt', 'teleport', 'stealth',
  'utility', 'ranged',
];

/** Existence sets used by `parseFx` / `validateFx`. */
export interface FxContext {
  skills: ReadonlySet<string>;
  stats: ReadonlySet<string>;
  statuses: ReadonlySet<string>;
  tags: ReadonlySet<string>;
}

/**
 * Builds the context from the skill ids and status ids of the game. Stats come from `STAT_IDS` and tags from
 * `FX_TAGS`, the way the design doc asks for.
 */
export function fxContext(skills: Iterable<string>, statuses: Iterable<string>): FxContext {
  return {
    skills: new Set(skills),
    stats: new Set<string>(STAT_IDS),
    statuses: new Set(statuses),
    tags: new Set(FX_TAGS),
  };
}

export interface FxParseResult {
  items: FxItem[];
  errors: string[];
}

const num = (s: string): number => Number(String(s).replace(/^\+/, ''));

/**
 * Parses an fx string. When `ctx` is given, unknown skills / stats / statuses / tags are reported as errors;
 * with `ctx = null` only the syntax is checked. Never throws; invalid items are skipped and reported.
 */
export function parseFx(fx: string, ctx: FxContext | null = null): FxParseResult {
  const errors: string[] = [];
  const items: FxItem[] = [];
  const has = (set: 'skills' | 'stats' | 'statuses', v: string, what: string): void => {
    if (ctx && !ctx[set].has(v)) errors.push(`unknown ${what} ${v}`);
  };
  const filterOk = (t: string | undefined): boolean =>
    !t || t === '*' || (t.startsWith('@') ? !ctx || ctx.tags.has(t.slice(1)) : !ctx || ctx.skills.has(t));

  for (const raw of fx.split(' ;; ')) {
    const it = raw.trim();
    const kind = it[0];
    const rest = it.slice(2).trim();
    if (it.length > 1 && it[1] !== ' ') { errors.push(`bad item start "${it.slice(0, 12)}"`); continue; }

    if (kind === 'S') {
      const stats: StatBlock = {};
      for (const kv of rest.split(/\s+/)) {
        const m = kv.match(/^([A-Za-z]+)=(-?[0-9.]+)$/);
        if (!m) { errors.push(`bad S pair "${kv}"`); continue; }
        has('stats', m[1], 'stat');
        stats[m[1] as StatId] = num(m[2]);
      }
      items.push({ k: 'S', stats });
    } else if (kind === 'M') {
      const parts = rest.split(/\s+/);
      const target = parts.shift() as string;
      const ops: ModOp[] = [];
      for (const t of target.split('+')) {
        if (t === '*') continue;
        if (t.startsWith('@')) { if (ctx && !ctx.tags.has(t.slice(1))) errors.push(`unknown tag ${t}`); } else has('skills', t, 'skill');
      }
      for (const kv of parts) {
        const m = kv.match(/^([A-Za-z.]+)(\*=|\+=|=)(.+)$/);
        if (!m) { errors.push(`bad op "${kv}"`); continue; }
        const [, op, mode, v] = m;
        if (op.startsWith('p.')) {
          if (!Number.isFinite(num(v))) errors.push(`bad value ${kv}`);
          ops.push({ op, mode: mode as '=' | '+=' | '*=', v: num(v) });
          continue;
        }
        if (!MOD_OPS.has(op)) { errors.push(`unknown mod op ${op}`); continue; }
        if (op === 'st' || op === 'sdur') {
          for (const e of v.split(',')) {
            const [sid, a] = e.split(':');
            has('statuses', sid, 'status');
            if (op === 'st' && !Number.isFinite(num(a))) errors.push(`st needs a duration: ${e}`);
          }
        } else if (op === 'cv') {
          const [ty, f] = v.split(':');
          if (!FX_CONVERT_TYPES.includes(ty) || !(num(f) > 0 && num(f) <= 1)) errors.push(`bad cv ${v}`);
        } else if (op === 'shape') {
          if (!['split', 'return', 'echo', 'orbit', 'pull'].includes(v.split(':')[0])) errors.push(`unknown shape ${v}`);
        } else if (op === 'pip' || op === 'pipc') {
          const [pid, n] = v.split(':');
          if (!FX_PIPS.includes(pid) || !Number.isFinite(num(n))) errors.push(`bad ${op} ${v}`);
        } else if (!Number.isFinite(num(v))) {
          errors.push(`bad number ${kv}`);
        }
        ops.push({ op, v });
      }
      items.push({ k: 'M', target, ops });
    } else if (kind === 'T') {
      const mm = rest.match(/^(\S+)((?:\s+(?:if|ch|icd)=\S+)*)\s*=>\s*(.+)$/);
      if (!mm) { errors.push(`bad T "${rest.slice(0, 30)}"`); continue; }
      const [trig, ...targ] = mm[1].split(':');
      if (!TRIGGERS.has(trig)) errors.push(`unknown trigger ${trig}`);
      if (['hit', 'crit', 'kill', 'cast'].includes(trig) && !filterOk(targ[0])) errors.push(`bad filter ${targ[0]}`);
      if (trig === 'cast' && !targ[0]) errors.push('cast needs a target');
      if (trig === 'status') has('statuses', targ[0], 'status');

      let ch = 1;
      let icd = 0;
      const conds: Cond[] = [];
      for (const kv of mm[2].trim().split(/\s+/).filter(Boolean)) {
        const k = kv.slice(0, kv.indexOf('='));
        const v = kv.slice(kv.indexOf('=') + 1);
        if (k === 'ch') { ch = num(v); } else if (k === 'icd') { icd = num(v); } else {
          for (const c of v.split('&')) {
            const a = c.match(/^(hp<|hp>|res<|res>|thp<|thp>)([0-9.]+)$/);
            const b = c.match(/^pips>=([0-9.]+):([a-z]+)$/);
            const d = c.match(/^(tst|sst):([a-z_0-9]+)$/);
            const e = c.match(/^(still|moving|stealth|elite|boss|shield|inCombat|solo)$/);
            if (a) {
              conds.push({ c: a[1] as 'hp<' | 'hp>' | 'res<' | 'res>' | 'thp<' | 'thp>', v: num(a[2]) });
            } else if (b) {
              conds.push({ c: 'pips>=', v: num(b[1]), id: b[2] as Extract<Cond, { c: 'pips>=' }>['id'] });
            } else if (d) {
              has('statuses', d[2], 'status');
              conds.push({ c: d[1] as 'tst' | 'sst', status: d[2] });
            } else if (e) {
              conds.push({ c: e[1] as 'still' | 'moving' | 'stealth' | 'elite' | 'boss' | 'shield' | 'inCombat' | 'solo' });
            } else {
              errors.push(`bad condition ${c}`);
            }
          }
        }
      }

      const actions: ActionItem[] = [];
      for (const a of mm[3].split(' ; ')) {
        const am = a.trim().match(/^([a-z]+)\((.*)\)$/);
        if (!am || !ACTIONS.has(am[1])) { errors.push(`bad action "${a}"`); continue; }
        // commas inside {…} belong to the buff block: protect them while splitting the arguments
        const args = am[2].replace(/\{[^}]*\}/, (s) => s.replace(/,/g, '\u0001')).split(',').map((s) => s.replace(/\u0001/g, ','));
        if (am[1] === 'st') {
          if (!['self', 'tgt', 'ally', 'party'].includes(args[0]) && !/^near\(\d+\)$/.test(args[0])) errors.push(`bad who ${args[0]}`);
          has('statuses', args[1], 'status');
        }
        if (am[1] === 'buff') {
          const b = am[2].match(/\{([^}]*)\}/);
          if (!b) errors.push('buff needs {stats}');
          else for (const kv of b[1].split(',')) has('stats', kv.split('=')[0].trim(), 'stat');
        }
        actions.push({ a: am[1], args });
      }
      items.push({ k: 'T', trig, filter: targ[0], conds, ch, icd, actions });
    } else if (kind === 'G') {
      has('skills', rest, 'skill');
      items.push({ k: 'G', skill: rest });
    } else if (kind === 'X') {
      const m = rest.match(/^([a-z_0-9]+)\{(.*)\}$/);
      if (!m) {
        errors.push(`bad X "${rest}"`);
      } else {
        const params: Record<string, number> = {};
        for (const kv of m[2].split(',')) {
          const [k, v] = kv.split('=');
          params[k] = num(v);
        }
        items.push({ k: 'X', id: m[1], params });
      }
    } else {
      errors.push(`bad item kind "${it.slice(0, 12)}"`);
    }
  }
  return { items, errors };
}

/**
 * Existence check of already parsed items (skills, stats, statuses, tags, trigger names). Syntax is not re-checked:
 * use `parseFx` for that. Returns the error list (empty when valid).
 */
export function validateFx(items: FxItem[], ctx: FxContext): string[] {
  const errors: string[] = [];
  const skill = (id: string): void => { if (!ctx.skills.has(id)) errors.push(`unknown skill ${id}`); };
  const stat = (id: string): void => { if (!ctx.stats.has(id)) errors.push(`unknown stat ${id}`); };
  const status = (id: string): void => { if (!ctx.statuses.has(id)) errors.push(`unknown status ${id}`); };
  const tagOrSkill = (t: string): void => {
    if (t === '*') return;
    if (t.startsWith('@')) { if (!ctx.tags.has(t.slice(1))) errors.push(`unknown tag ${t}`); } else skill(t);
  };
  const statKeysOf = (block: string): void => {
    for (const kv of block.split(',')) stat(kv.split('=')[0].trim());
  };

  for (const it of items) {
    if (it.k === 'S') {
      for (const key of Object.keys(it.stats)) stat(key);
    } else if (it.k === 'G') {
      skill(it.skill);
    } else if (it.k === 'M') {
      for (const t of it.target.split('+')) tagOrSkill(t);
      for (const op of it.ops) {
        if ((op.op === 'st' || op.op === 'sdur') && typeof op.v === 'string') {
          for (const e of op.v.split(',')) status(e.split(':')[0]);
        }
      }
    } else if (it.k === 'T') {
      if (!TRIGGERS.has(it.trig)) errors.push(`unknown trigger ${it.trig}`);
      if (it.trig === 'status' && it.filter) status(it.filter);
      if (['hit', 'crit', 'kill', 'cast'].includes(it.trig) && it.filter) tagOrSkill(it.filter);
      for (const c of it.conds) {
        if (c.c === 'tst' || c.c === 'sst') status(c.status);
      }
      for (const a of it.actions) {
        if (a.a === 'st') status(a.args[1] ?? '');
        if (a.a === 'buff') {
          const b = a.args.find((s) => s.startsWith('{'));
          if (b) statKeysOf(b.slice(1, -1));
        }
      }
    }
  }
  return errors;
}
