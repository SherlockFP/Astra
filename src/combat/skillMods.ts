/**
 * GDD_TALENTS §2.5 / Appendix D: skill modifiers (`M` items) applied to a DERIVED copy of a SkillDef.
 * OWNER: combat (T3). Pure: no `G`, no DOM. Never mutates `SKILLS` or the source def.
 *
 * Flow: parseFx (T1) -> collectMods (one ModEntry per op) -> modsFor (target match) -> applySkillMods.
 * Inside applySkillMods the `p.<key>` writes run first (list order); every other op is folded into a channel total
 * and the total is clamped once, at the Appendix D limit, then written to the clone.
 * `cv` and `shape` are replace-style (last one wins); `st` appends (at most 2 per skill).
 *
 * Data that has no SkillDef field travels in `SkillDef.params` (numbers only):
 *   params.shape 1 split | 2 return | 3 orbit | 4 echo | 5 pull; params.shapeN, shapeCoef, shapeDelay, shapeStrength
 *   params.element 1 fire | 2 frost | 3 arcane | 0 other (set by a full conversion, frac = 1)
 *   params.convFrac + params.convType: a partial conversion (frac < 1). damage.type keeps the original type and the
 *     converted share (convFrac of the coefficient) is of type CONVERT_TYPES[convType]. SkillSystem splits it.
 */
import type { FxItem, ModEntry } from '../types/talents';
import type { DamageType, PipId } from '../types/common';
import type { SkillDef, StatusApply, StatusId } from '../types/skills';
import type { VfxId } from '../types/vfx';
import { STATUSES, STATUS_RULES } from '../data/statuses';
import { parseFx } from '../data/talentTrees/fx';

export type { ModEntry } from '../types/talents';

// ---------------------------------------------------------------------------------------------------------------
// Public types and tables
// ---------------------------------------------------------------------------------------------------------------

export type ShapeKind = 'split' | 'return' | 'orbit' | 'echo' | 'pull';

/** A `shape` op decoded for the behaviours (T7 `withShape`). */
export interface ShapeSpec {
  kind: ShapeKind;
  n?: number;
  coef?: number;
  delay?: number;
  strength?: number;
}

/** Damage types a `cv` op can convert to. The index is the `params.convType` code. */
export const CONVERT_TYPES: readonly DamageType[] = ['physical', 'fire', 'frost', 'arcane', 'lightning', 'shadow', 'poison', 'holy'];
export const convTypeCode = (t: DamageType): number => Math.max(0, CONVERT_TYPES.indexOf(t));
export const convTypeFromCode = (c: number): DamageType | undefined => CONVERT_TYPES[c];

/** Shape kinds in `params.shape` code order (code = index + 1). */
const SHAPE_KINDS: readonly ShapeKind[] = ['split', 'return', 'orbit', 'echo', 'pull'];
const shapeCode = (k: ShapeKind): number => SHAPE_KINDS.indexOf(k) + 1;

/** GDD_TALENTS §4 / T7 shape defaults: the returning projectile and the orbiters use these coefficients. */
export const RETURN_COEF = 0.7;
export const ORBIT_COEF = 0.35;

// Appendix D limits (applied to the accumulated channel).
const CD_FLOOR = 0.5;      // cooldown >= 0.5 x base; cdx product >= 0.5
const COSTX_FLOOR = 0.4;   // costx product >= 0.4
const DUR_FLOOR = 0.5;     // dur result >= 0.5 s
const RAD_ADD_CAP = 4;     // rad total <= +4 m
const RADX_CAP = 1.6;      // radx product <= 1.6
const RNG_ADD_CAP = 10;    // rng total <= +10 m
const CASTX_FLOOR = 0.5;   // castx product >= 0.5
const CHG_CAP = 2;         // chg total <= +2
const CNT_CAP = 4;         // cnt total <= +4
const PRC_CAP = 4;         // prc total <= +4
const STGX_CAP = 2;        // stgx product <= 2.0
const KBX_CAP = 2;         // kbx product <= 2.0
const ST_CAP = 2;          // st entries appended per skill <= 2
const SDUR_CAP = 10;       // sdur total per status <= +10 s
const PIP_GAIN_CAP = 2;    // pip total <= +2
const CRIT_CAP = 0.25;     // crit total <= +0.25
const DOTX_CAP = 1.6;      // dotx product <= 1.6
const HEALX_CAP = 1.6;     // healx product <= 1.6
const ABSX_CAP = 1.6;      // absx product <= 1.6
/** Combat reads a missing DoT magnitude as 0.5 (Combat.ts); dotx scales that same default. */
const DOT_DEFAULT_MAG = 0.5;

/** Params that count as a radius (rad / radx also move `radius`). */
const RADIUS_PARAMS: readonly string[] = ['explode', 'impactRadius', 'pulseRadius', 'strikeRadius', 'novaRadius', 'ringRadius'];
/** Params that count as a projectile / target count (cnt). */
const COUNT_PARAMS: readonly string[] = ['maxTargets', 'balls', 'hammers'];
const STAGGER_PARAMS: readonly string[] = ['stagger', 'staggerPerCp'];
const HEAL_PARAMS: readonly string[] = ['heal', 'healPct'];
const ABSORB_PARAMS: readonly string[] = ['absorbPct', 'hpPct'];
/** Statuses whose `magnitude` is an absorb amount (absx). */
const ABSORB_STATUSES: readonly string[] = ['shield', 'blood_shield'];

/** Element tags of the tag list (Appendix D). Removed and replaced by `cv`. */
const ELEMENT_TAGS: readonly string[] = ['physical', 'fire', 'frost', 'arcane', 'holy', 'shadow', 'poison', 'lightning'];

/** `cv` vfx swap table (projectile / impact). Physical keeps its vfx. */
const CONVERT_VFX: Partial<Record<DamageType, { projectile: VfxId; impact: VfxId }>> = {
  fire: { projectile: 'fire_projectile', impact: 'fire_burst' },
  frost: { projectile: 'frost_projectile', impact: 'frost_burst' },
  arcane: { projectile: 'arcane_projectile', impact: 'arcane_burst' },
  shadow: { projectile: 'shadow_projectile', impact: 'shadow_burst' },
  poison: { projectile: 'poison_projectile', impact: 'poison_burst' },
  holy: { projectile: 'holy_projectile', impact: 'holy_burst' },
  lightning: { projectile: 'bolt_projectile', impact: 'hit_spark' },
};

const NUMERIC_OPS: ReadonlySet<string> = new Set([
  'dmgx', 'cd', 'cdx', 'cost', 'costx', 'dur', 'rad', 'radx', 'rng', 'cast', 'castx', 'chg', 'cnt', 'prc',
  'stgx', 'kbx', 'crit', 'dotx', 'healx', 'absx',
]);

const elementCode = (t: DamageType): number => (t === 'fire' ? 1 : t === 'frost' ? 2 : t === 'arcane' ? 3 : 0);
/** Tag of a damage type; lightning and true damage have no tag in the tag list. */
const typeTag = (t: DamageType): string | null => (t === 'lightning' || t === 'true' ? null : t);

const warned = new Set<string>();
function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[skillMods] ${msg}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Targets and collection
// ---------------------------------------------------------------------------------------------------------------

/** Target match of an `M` item: skill id, `a+b`, `@tag`, `*` (Appendix D). */
function targetHits(target: string, skillId: string, tags: readonly string[]): boolean {
  for (const part of target.split('+')) {
    if (part === '*') return true;
    if (part.startsWith('@')) {
      if (tags.includes(part.slice(1))) return true;
    } else if (part === skillId) {
      return true;
    }
  }
  return false;
}

/** The mods of `all` whose target matches the skill (its id and its tags). */
export function modsFor(skillId: string, tags: string[], all: ModEntry[]): ModEntry[] {
  return all.filter((m) => targetHits(m.target, skillId, tags));
}

/** One ModEntry per op of every `M` item. S, T, G and X items belong to StatCalc, the proc engine and the grants. */
export function collectMods(items: FxItem[], src: string): ModEntry[] {
  const out: ModEntry[] = [];
  for (const it of items) {
    if (it.k !== 'M') continue;
    for (const op of it.ops) out.push({ target: it.target, op: op.op, mode: op.mode, v: op.v, src });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------------------------

/** Parses a `shape` value: `split:n:coef` · `return` · `orbit:n` · `echo:delay:coef` · `pull:strength`. */
export function parseShape(v: string): ShapeSpec | null {
  const [kind, a, b] = v.split(':');
  const x = Number(a);
  const y = Number(b);
  switch (kind) {
    case 'split':
      return Number.isFinite(x) && x >= 1 && Number.isFinite(y) && y > 0 ? { kind: 'split', n: x, coef: y } : null;
    case 'return':
      return { kind: 'return', coef: RETURN_COEF };
    case 'orbit':
      return Number.isFinite(x) && x >= 1 ? { kind: 'orbit', n: x, coef: ORBIT_COEF } : null;
    case 'echo':
      return Number.isFinite(x) && x >= 0 && Number.isFinite(y) && y > 0 ? { kind: 'echo', delay: x, coef: y } : null;
    case 'pull':
      return Number.isFinite(x) && x > 0 ? { kind: 'pull', strength: x } : null;
    default:
      return null;
  }
}

/**
 * The shape of a skill. With `shape` (a `shape` op value such as `'split:3:.4'`) it parses that value; without it, it
 * decodes `def.params` as written by applySkillMods. Returns null when the skill has no shape.
 */
export function withShape(def: SkillDef, shape?: string): ShapeSpec | null {
  if (shape !== undefined) return parseShape(shape);
  const p = def.params;
  const code = p?.shape;
  if (code === undefined) return null;
  const kind = SHAPE_KINDS[code - 1];
  if (kind === undefined) return null;
  const s: ShapeSpec = { kind };
  const n = p?.shapeN;
  const coef = p?.shapeCoef;
  const delay = p?.shapeDelay;
  const strength = p?.shapeStrength;
  if (n !== undefined) s.n = n;
  if (coef !== undefined) s.coef = coef;
  else if (kind === 'return') s.coef = RETURN_COEF;
  else if (kind === 'orbit') s.coef = ORBIT_COEF;
  if (delay !== undefined) s.delay = delay;
  if (strength !== undefined) s.strength = strength;
  return s;
}

function encodeShape(p: Record<string, number>, s: ShapeSpec): void {
  delete p.shape;
  delete p.shapeN;
  delete p.shapeCoef;
  delete p.shapeDelay;
  delete p.shapeStrength;
  p.shape = shapeCode(s.kind);
  if (s.n !== undefined) p.shapeN = s.n;
  if (s.coef !== undefined) p.shapeCoef = s.coef;
  if (s.delay !== undefined) p.shapeDelay = s.delay;
  if (s.strength !== undefined) p.shapeStrength = s.strength;
}

// ---------------------------------------------------------------------------------------------------------------
// Op parsing helpers
// ---------------------------------------------------------------------------------------------------------------

/** `status:dur:mag[:ch]` (one entry of an `st` op). `mag` is the stack count for `stack`-mode statuses. */
function parseStatusEntry(e: string): StatusApply | null {
  const [sid, d, mg, ch] = e.trim().split(':');
  const duration = Number(d);
  if (!sid || !(duration > 0)) return null;
  const app: StatusApply = { status: sid as StatusId, duration };
  if (mg !== undefined && mg !== '') {
    const mag = Number(mg);
    if (!Number.isFinite(mag)) return null;
    if (STATUS_RULES[app.status]?.stack === 'stack') app.stacks = Math.max(1, Math.round(mag));
    else app.magnitude = mag;
  }
  if (ch !== undefined && ch !== '') {
    const c = Number(ch);
    if (!Number.isFinite(c)) return null;
    app.chance = c;
  }
  return app;
}

/** `type:frac` of a `cv` op. frac defaults to 1 and must be in (0, 1]. */
function parseConvert(v: string): { type: DamageType; frac: number } | null {
  const [ty, f] = v.split(':');
  const frac = f === undefined ? 1 : Number(f);
  const type = ty as DamageType;
  if (!CONVERT_TYPES.includes(type) || !(frac > 0 && frac <= 1)) return null;
  return { type, frac };
}

// ---------------------------------------------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------------------------------------------

interface Acc {
  dmgx: number;
  cd: number; cdx: number;
  cost: number; costx: number;
  dur: number;
  rad: number; radx: number;
  rng: number;
  cast: number; castx: number;
  chg: number;
  cnt: number;
  prc: number;
  stgx: number;
  kbx: number;
  crit: number;
  dotx: number;
  healx: number;
  absx: number;
  st: StatusApply[];
  sdur: Record<string, number>;
  cv: { type: DamageType; frac: number } | undefined;
  shape: ShapeSpec | undefined;
  pipId: PipId | undefined;
  pipGain: number;
  pipCost: number;
}

function newAcc(): Acc {
  return {
    dmgx: 1, cd: 0, cdx: 1, cost: 0, costx: 1, dur: 0, rad: 0, radx: 1, rng: 0, cast: 0, castx: 1, chg: 0, cnt: 0, prc: 0,
    stgx: 1, kbx: 1, crit: 0, dotx: 1, healx: 1, absx: 1, st: [], sdur: {}, cv: undefined, shape: undefined,
    pipId: undefined, pipGain: 0, pipCost: 0,
  };
}

/** Folds one (non-`p.`) op into its channel. Invalid values are dropped with a warning. */
function accumulate(acc: Acc, m: ModEntry, skillId: string): void {
  if (m.op.startsWith('p.')) return;
  const x = Number(m.v);
  if (NUMERIC_OPS.has(m.op) && !Number.isFinite(x)) {
    warnOnce(`v:${skillId}:${m.op}`, `${skillId}: bad value ${m.op}=${String(m.v)}`);
    return;
  }
  switch (m.op) {
    case 'dmgx': acc.dmgx *= x; break;
    case 'cd': acc.cd += x; break;
    case 'cdx': acc.cdx *= x; break;
    case 'cost': acc.cost += x; break;
    case 'costx': acc.costx *= x; break;
    case 'dur': acc.dur += x; break;
    case 'rad': acc.rad += x; break;
    case 'radx': acc.radx *= x; break;
    case 'rng': acc.rng += x; break;
    case 'cast': acc.cast += x; break;
    case 'castx': acc.castx *= x; break;
    case 'chg': acc.chg += x; break;
    case 'cnt': acc.cnt += x; break;
    case 'prc': acc.prc += x; break;
    case 'stgx': acc.stgx *= x; break;
    case 'kbx': acc.kbx *= x; break;
    case 'crit': acc.crit += x; break;
    case 'dotx': acc.dotx *= x; break;
    case 'healx': acc.healx *= x; break;
    case 'absx': acc.absx *= x; break;
    case 'st':
      for (const e of String(m.v).split(',')) {
        const app = parseStatusEntry(e);
        if (app) acc.st.push(app);
        else warnOnce(`st:${e}`, `${skillId}: bad st entry "${e}"`);
      }
      break;
    case 'sdur':
      for (const e of String(m.v).split(',')) {
        const [sid, a] = e.split(':');
        const d = Number(a);
        if (sid && Number.isFinite(d)) acc.sdur[sid] = (acc.sdur[sid] ?? 0) + d;
        else warnOnce(`sdur:${e}`, `${skillId}: bad sdur entry "${e}"`);
      }
      break;
    case 'cv': {
      const c = parseConvert(String(m.v));
      if (c) acc.cv = c;
      else warnOnce(`cv:${String(m.v)}`, `${skillId}: bad cv ${String(m.v)}`);
      break;
    }
    case 'shape': {
      const s = parseShape(String(m.v));
      if (s) acc.shape = s;
      else warnOnce(`shape:${String(m.v)}`, `${skillId}: bad shape ${String(m.v)}`);
      break;
    }
    case 'pip':
    case 'pipc': {
      const [id, n] = String(m.v).split(':');
      const d = Number(n);
      if (!id || !Number.isFinite(d)) { warnOnce(`pip:${String(m.v)}`, `${skillId}: bad ${m.op} ${String(m.v)}`); break; }
      if (acc.pipId !== undefined && acc.pipId !== id) { warnOnce(`pipid:${skillId}`, `${skillId}: two pip ids in one skill`); break; }
      acc.pipId = id as PipId;
      if (m.op === 'pip') acc.pipGain += d;
      else acc.pipCost += d;
      break;
    }
    default:
      warnOnce(`op:${m.op}`, `unknown mod op ${m.op}`);
  }
}

/** Pass 1: `p.<key>` writes straight to params, in list order. The key must already exist (validator whitelist). */
function writeParams(out: SkillDef, mine: ModEntry[]): void {
  for (const m of mine) {
    if (!m.op.startsWith('p.')) continue;
    const key = m.op.slice(2);
    const params = out.params;
    if (!params || params[key] === undefined) {
      warnOnce(`p:${out.id}:${key}`, `${out.id}: no param ${key} to modify`);
      continue;
    }
    const v = Number(m.v);
    if (!Number.isFinite(v)) {
      warnOnce(`pv:${out.id}:${key}`, `${out.id}: bad value for p.${key}`);
      continue;
    }
    const mode = m.mode ?? '=';
    const cur = params[key];
    params[key] = mode === '+=' ? cur + v : mode === '*=' ? cur * v : v;
  }
}

function applyConvert(out: SkillDef, cv: { type: DamageType; frac: number }): void {
  const p = (out.params ??= {});
  const { type, frac } = cv;
  if (frac >= 1) {
    if (out.damage) out.damage = { ...out.damage, type };
    p.element = elementCode(type);
    delete p.convFrac;
    delete p.convType;
    const vfx = CONVERT_VFX[type];
    if (vfx) out.vfx = { ...out.vfx, ...vfx };
    out.tags = (out.tags ?? []).filter((t) => !ELEMENT_TAGS.includes(t));
    const tag = typeTag(type);
    if (tag) out.tags.push(tag);
    return;
  }
  // partial conversion: the main instance keeps its type, the converted share is recorded (see module header)
  p.convFrac = frac;
  p.convType = convTypeCode(type);
  const tag = typeTag(type);
  const tags = (out.tags ??= []);
  if (tag && !tags.includes(tag)) tags.push(tag);
}

function applyPip(out: SkillDef, acc: Acc): void {
  const id = acc.pipId;
  if (id === undefined) return;
  if (!out.pip) out.pip = { id };
  if (out.pip.id !== id) {
    warnOnce(`pipmatch:${out.id}`, `${out.id}: pip ${id} does not match its own pip ${out.pip.id}`);
    return;
  }
  if (acc.pipGain !== 0) out.pip.gain = (out.pip.gain ?? 0) + Math.min(acc.pipGain, PIP_GAIN_CAP);
  if (acc.pipCost !== 0) {
    const before = out.pip.cost ?? 0;
    const after = before + acc.pipCost;
    out.pip.cost = before >= 1 ? Math.max(1, after) : after;   // pipc keeps a cost of at least 1 once it has one
  }
}

/** Pass 3: writes each channel total to the clone, clamped to its Appendix D limit. */
function applyChannels(out: SkillDef, acc: Acc): void {
  const params = (): Record<string, number> => (out.params ??= {});

  if (acc.cd !== 0 || acc.cdx !== 1) {
    const base = out.cooldown;
    out.cooldown = Math.max(base * CD_FLOOR, (base + acc.cd) * Math.max(CD_FLOOR, acc.cdx));
  }
  if (acc.cost !== 0 || acc.costx !== 1) {
    const base = out.cost;
    let v = (base + acc.cost) * Math.max(COSTX_FLOOR, acc.costx);
    if (base >= 0) v = Math.max(0, v);
    out.cost = v;
  }
  if (acc.dur !== 0) {
    let hit = false;
    if (out.duration !== undefined) {
      out.duration = Math.max(Math.min(DUR_FLOOR, out.duration), out.duration + acc.dur);
      hit = true;
    }
    if (out.channel !== undefined) {
      out.channel = Math.max(Math.min(DUR_FLOOR, out.channel), out.channel + acc.dur);
      hit = true;
    }
    if (!hit && acc.dur > 0) out.duration = Math.max(DUR_FLOOR, acc.dur);
  }
  if (acc.rad !== 0 || acc.radx !== 1) {
    const add = Math.min(acc.rad, RAD_ADD_CAP);
    const mul = Math.min(acc.radx, RADX_CAP);
    const scale = (v: number): number => Math.max(0, (v + add) * mul);
    let hit = false;
    if (out.radius !== undefined) {
      out.radius = scale(out.radius);
      hit = true;
    }
    for (const k of RADIUS_PARAMS) {
      const v = out.params?.[k];
      if (v !== undefined) {
        params()[k] = scale(v);
        hit = true;
      }
    }
    if (!hit && add > 0) out.radius = add;
  }
  if (acc.rng !== 0) {
    const add = Math.min(acc.rng, RNG_ADD_CAP);
    if (out.range !== undefined) out.range = Math.max(0, out.range + add);
    else if (add > 0) out.range = add;
  }
  if (acc.cast !== 0 || acc.castx !== 1) {
    const mul = Math.max(CASTX_FLOOR, acc.castx);
    out.castTime = Math.max(0, (out.castTime + acc.cast) * mul);
    const cm = out.params?.chargeMax;
    if (mul !== 1 && cm !== undefined) params().chargeMax = cm * mul;
  }
  if (acc.chg !== 0) out.charges = Math.max(1, (out.charges ?? 1) + Math.min(acc.chg, CHG_CAP));
  if (acc.cnt !== 0) {
    const add = Math.min(acc.cnt, CNT_CAP);
    let hit = false;
    if (out.count !== undefined) {
      out.count = Math.max(1, out.count + add);
      hit = true;
    }
    for (const k of COUNT_PARAMS) {
      const v = out.params?.[k];
      if (v !== undefined) {
        params()[k] = Math.max(1, v + add);
        hit = true;
      }
    }
    if (!hit && add > 0) out.count = 1 + add;
  }
  if (acc.prc !== 0) out.pierce = Math.max(0, (out.pierce ?? 0) + Math.min(acc.prc, PRC_CAP));
  if (acc.stgx !== 1) {
    const mul = Math.min(acc.stgx, STGX_CAP);
    for (const k of STAGGER_PARAMS) {
      const v = out.params?.[k];
      if (v !== undefined) params()[k] = v * mul;
    }
  }
  if (acc.kbx !== 1) {
    const mul = Math.min(acc.kbx, KBX_CAP);
    if (out.knockback !== undefined) out.knockback = out.knockback * mul;
    const fk = out.params?.finalKnock;
    if (fk !== undefined) params().finalKnock = fk * mul;
  }
  if (acc.st.length > 0) {
    if (acc.st.length > ST_CAP) warnOnce(`stcap:${out.id}`, `${out.id}: more than ${ST_CAP} st entries, extra dropped`);
    out.statuses = [...(out.statuses ?? []), ...acc.st.slice(0, ST_CAP)];
  }
  for (const sid of Object.keys(acc.sdur)) {
    const add = Math.min(acc.sdur[sid], SDUR_CAP);
    for (const s of [...(out.statuses ?? []), ...(out.selfStatuses ?? [])]) {
      if (s.status === sid) s.duration += add;
    }
  }
  if (acc.dotx !== 1 && out.statuses) {
    const mul = Math.min(acc.dotx, DOTX_CAP);
    for (const s of out.statuses) {
      if (!STATUSES[s.status]?.dotType) continue;
      s.magnitude = (s.magnitude ?? DOT_DEFAULT_MAG) * mul;
      if (s.dps !== undefined) s.dps = s.dps * mul;
    }
  }
  if (acc.healx !== 1) {
    const mul = Math.min(acc.healx, HEALX_CAP);
    if (out.heal) out.heal = { ...out.heal, coef: out.heal.coef * mul };
    for (const k of HEAL_PARAMS) {
      const v = out.params?.[k];
      if (v !== undefined) params()[k] = v * mul;
    }
  }
  if (acc.absx !== 1) {
    const mul = Math.min(acc.absx, ABSX_CAP);
    for (const s of [...(out.statuses ?? []), ...(out.selfStatuses ?? [])]) {
      if (ABSORB_STATUSES.includes(s.status) && s.magnitude !== undefined) s.magnitude = s.magnitude * mul;
    }
    for (const k of ABSORB_PARAMS) {
      const v = out.params?.[k];
      if (v !== undefined) params()[k] = v * mul;
    }
  }
  if (acc.dmgx !== 1 && out.damage) out.damage = { ...out.damage, coef: out.damage.coef * acc.dmgx };
  if (acc.crit !== 0) params().critBonus = (out.params?.critBonus ?? 0) + Math.min(acc.crit, CRIT_CAP);
  if (acc.cv) applyConvert(out, acc.cv);
  if (acc.shape) encodeShape(params(), acc.shape);
  applyPip(out, acc);
}

/**
 * Returns a DERIVED copy of `def` with the mods that target it applied (target match is repeated here, so a list
 * from modsFor or the full list both work). Never mutates `def`. Invalid ops are skipped with a warning.
 */
export function applySkillMods(def: SkillDef, mods: ModEntry[]): SkillDef {
  const out = structuredClone(def);
  const mine = mods.filter((m) => targetHits(m.target, def.id, def.tags ?? []));
  if (mine.length === 0) return out;
  writeParams(out, mine);
  const acc = newAcc();
  for (const m of mine) accumulate(acc, m, def.id);
  applyChannels(out, acc);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Self test (pure; returns the failed checks, empty when all pass)
// ---------------------------------------------------------------------------------------------------------------

/** A copy of mage_fireball's data (data/skills.ts) with cooldown 6 and castTime 0.8, so that cd and castx are visible. */
function fireballFixture(extra: Partial<SkillDef> = {}): SkillDef {
  return {
    id: 'mage_fireball', classId: 'mage', name: 'Ateş Topu', desc: '', icon: '', unlockLevel: 1, defaultSlot: 'rmb',
    cost: 12, cooldown: 6, castTime: 0.8, anim: 'Spellcast_Shoot', animSpeed: 1.15, hitTime: 0.373,
    targeting: 'projectile', range: 30, speed: 24, radius: 0.5, count: 1, pierce: 0, knockback: 2,
    damage: { coef: 2.3, type: 'fire' }, statuses: [{ status: 'burn', duration: 3, magnitude: 0.5 }],
    tags: ['spell', 'fire', 'projectile', 'aoe'],
    vfx: { projectile: 'fire_projectile', impact: 'fire_burst', cast: 'fire_burst' },
    params: { end: 0.7, chain: 0.1, move: 0.2, stagger: 8, proc: 1, explode: 2.5, element: 1 },
    ...extra,
  };
}

/** Runs the Appendix D op examples against the fireball fixture and checks the exact resulting fields. */
export function selfTestSkillMods(): string[] {
  const fails: string[] = [];
  const expect = (label: string, ok: boolean): void => { if (!ok) fails.push(label); };
  const near = (a: number | undefined, b: number): boolean => a !== undefined && Math.abs(a - b) < 1e-6;
  const apply = (fx: string, base: SkillDef = fireballFixture()): SkillDef => {
    const parsed = parseFx(fx);
    if (parsed.errors.length > 0) fails.push(`parse "${fx}": ${parsed.errors.join('; ')}`);
    return applySkillMods(base, collectMods(parsed.items, 'selftest'));
  };

  // cooldown and cost
  expect('cd=-3', near(apply('M mage_fireball cd=-3').cooldown, 3));
  expect('cd=-10 floor', near(apply('M mage_fireball cd=-10').cooldown, 3));
  expect('cdx=1.5', near(apply('M mage_fireball cdx=1.5').cooldown, 9));
  expect('cdx=0.2 floor', near(apply('M mage_fireball cdx=0.2').cooldown, 3));
  expect('cost=-4', near(apply('M mage_fireball cost=-4').cost, 8));
  expect('costx=0.1 floor', near(apply('M mage_fireball costx=0.1').cost, 4.8));
  expect('dur=+1 (no duration yet)', near(apply('M mage_fireball dur=+1').duration, 1));
  // radius, range, cast, charges, count, pierce
  expect('rad=+1 radius', near(apply('M mage_fireball rad=+1').radius, 1.5));
  expect('rad=+1 explode', near(apply('M mage_fireball rad=+1').params?.explode, 3.5));
  expect('rad=+9 clamp +4', near(apply('M mage_fireball rad=+9').radius, 4.5));
  expect('radx=2 clamp 1.6', near(apply('M mage_fireball radx=2').radius, 0.8) && near(apply('M mage_fireball radx=2').params?.explode, 4));
  expect('rad+radx', near(apply('M mage_fireball rad=+1 radx=1.2').radius, 1.8) && near(apply('M mage_fireball rad=+1 radx=1.2').params?.explode, 4.2));
  expect('rng=+5', near(apply('M mage_fireball rng=+5').range, 35));
  expect('rng=+20 clamp', near(apply('M mage_fireball rng=+20').range, 40));
  expect('cast=+0.5', near(apply('M mage_fireball cast=+0.5').castTime, 1.3));
  expect('castx=0.2 floor', near(apply('M mage_fireball castx=0.2').castTime, 0.4));
  expect('chg=+1', apply('M mage_fireball chg=+1').charges === 2);
  expect('chg=+3 clamp +2', apply('M mage_fireball chg=+3').charges === 3);
  expect('cnt=+2', apply('M mage_fireball cnt=+2').count === 3);
  expect('cnt=+9 clamp +4', apply('M mage_fireball cnt=+9').count === 5);
  expect('prc=+1', apply('M mage_fireball prc=+1').pierce === 1);
  expect('prc=+9 clamp +4', apply('M mage_fireball prc=+9').pierce === 4);
  // stagger, knockback, damage, crit
  expect('stgx=1.5', near(apply('M mage_fireball stgx=1.5').params?.stagger, 12));
  expect('stgx=3 clamp 2', near(apply('M mage_fireball stgx=3').params?.stagger, 16));
  expect('kbx=2', near(apply('M mage_fireball kbx=2').knockback, 4));
  expect('kbx=5 clamp 2', near(apply('M mage_fireball kbx=5').knockback, 4));
  expect('dmgx=1.1', near(apply('M mage_fireball dmgx=1.1').damage?.coef, 2.53));
  expect('crit=+0.1', near(apply('M mage_fireball crit=+0.1').params?.critBonus, 0.1));
  expect('crit=+1 clamp', near(apply('M mage_fireball crit=+1').params?.critBonus, 0.25));
  // statuses
  const st1 = apply('M mage_fireball st=slow:2:.4');
  expect('st slow', st1.statuses?.length === 2 && st1.statuses[1].status === 'slow' && near(st1.statuses[1].duration, 2) && near(st1.statuses[1].magnitude, 0.4));
  const st2 = apply('M mage_fireball st=chill:4:2');
  expect('st chill stacks', st2.statuses?.[1].status === 'chill' && st2.statuses[1].stacks === 2 && st2.statuses[1].magnitude === undefined);
  const st3 = apply('M mage_fireball st=root:1:1,stun:1:1,slow:2:.4');
  expect('st cap 2 per skill', st3.statuses?.length === 3);
  expect('sdur=burn:+2', near(apply('M mage_fireball sdur=burn:+2').statuses?.[0].duration, 5));
  expect('sdur=burn:+20 clamp +10', near(apply('M mage_fireball sdur=burn:+20').statuses?.[0].duration, 13));
  expect('dotx=1.5', near(apply('M mage_fireball dotx=1.5').statuses?.[0].magnitude, 0.75));
  expect('dotx=3 clamp 1.6', near(apply('M mage_fireball dotx=3').statuses?.[0].magnitude, 0.8));
  expect('absx on shield', near(apply('M mage_fireball absx=1.5', fireballFixture({ statuses: [{ status: 'shield', duration: 4, magnitude: 20 }] })).statuses?.[0].magnitude, 30));
  expect('healx on heal', near(apply('M mage_fireball healx=1.2', fireballFixture({ heal: { coef: 0.5 } })).heal?.coef, 0.6));
  // conversion
  const cf = apply('M mage_fireball cv=frost:1 st=chill:4:2');
  expect('cv frost type', cf.damage?.type === 'frost' && cf.params?.element === 2);
  expect('cv frost vfx', cf.vfx?.projectile === 'frost_projectile' && cf.vfx?.impact === 'frost_burst');
  expect('cv frost tags', cf.tags.includes('frost') && !cf.tags.includes('fire'));
  const cl = apply('M mage_fireball cv=lightning:1');
  expect('cv lightning', cl.damage?.type === 'lightning' && cl.params?.element === 0 && cl.vfx?.projectile === 'bolt_projectile' && cl.vfx?.impact === 'hit_spark');
  const ch = apply('M mage_fireball cv=holy:.5');
  expect('cv holy half keeps type', ch.damage?.type === 'fire' && near(ch.params?.convFrac, 0.5) && ch.params?.convType === convTypeCode('holy') && ch.tags.includes('holy') && ch.tags.includes('fire'));
  // pip
  expect('pip=arcane:1', apply('M mage_fireball pip=arcane:1').pip?.gain === 1);
  expect('pip=arcane:5 clamp +2', apply('M mage_fireball pip=arcane:5').pip?.gain === 2);
  expect('pipc=arcane:1 creates cost', apply('M mage_fireball pipc=arcane:1').pip?.cost === 1);
  // shapes
  const sp = apply('M mage_fireball shape=split:3:.4');
  expect('split encodes', sp.params?.shape === 1 && sp.params?.shapeN === 3 && near(sp.params?.shapeCoef, 0.4));
  const wsp = withShape(sp);
  expect('split decodes', wsp?.kind === 'split' && wsp.n === 3 && near(wsp.coef, 0.4));
  const wr = withShape(apply('M mage_fireball shape=return'));
  expect('return decodes', wr?.kind === 'return' && near(wr.coef, RETURN_COEF));
  const wo = withShape(apply('M mage_fireball shape=orbit:3'));
  expect('orbit decodes', wo?.kind === 'orbit' && wo.n === 3 && near(wo.coef, ORBIT_COEF));
  const we = withShape(apply('M mage_fireball shape=echo:.3:.7'));
  expect('echo decodes', we?.kind === 'echo' && near(we.delay, 0.3) && near(we.coef, 0.7));
  const wpl = withShape(apply('M mage_fireball shape=pull:2'));
  expect('pull decodes', wpl?.kind === 'pull' && near(wpl.strength, 2));
  expect('withShape of value', withShape(fireballFixture(), 'echo:.3:.7')?.kind === 'echo');
  expect('no shape', withShape(fireballFixture()) === null);
  // p.<key>
  expect('p.explode*=2', near(apply('M mage_fireball p.explode*=2').params?.explode, 5));
  expect('p.explode+=1', near(apply('M mage_fireball p.explode+=1').params?.explode, 3.5));
  expect('p.explode=4', near(apply('M mage_fireball p.explode=4').params?.explode, 4));
  expect('p.unknown ignored', apply('M mage_fireball p.nope=1').params?.nope === undefined);
  // targets
  expect('a+b other skill ignored', near(apply('M barbarian_fissure+barbarian_ancestral_tempest dmgx=1.15 stgx=1.25').damage?.coef, 2.3));
  expect('a+b with own id', near(apply('M barbarian_fissure+mage_fireball dmgx=2').damage?.coef, 4.6));
  const all = collectMods(parseFx('M mage_fireball dmgx=1.1 ;; M @fire cd=-1 ;; M * cost=+1 ;; M mage_frost_nova+mage_fireball chg=+1 ;; M @frost cdx=2').items, 'selftest');
  expect('modsFor matches id, tag, *, a+b', modsFor('mage_fireball', ['spell', 'fire'], all).length === 4);
  expect('collectMods one entry per op', all.length === 5);
  // Appendix D negative example: unknown mod op
  expect('unknown op rejected by parser', parseFx('M knight_charge speedx=2').errors.length > 0);
  // no mutation of the source def
  const base = fireballFixture();
  const snap = JSON.stringify(base);
  applySkillMods(base, collectMods(parseFx('M mage_fireball cd=-3 cv=frost:1 st=slow:2:.4 shape=split:3:.4 p.explode*=2 sdur=burn:+2').items, 'selftest'));
  expect('source def not mutated', JSON.stringify(base) === snap);
  return fails;
}
