#!/usr/bin/env node
/**
 * Headless talent-system validator (OWNER: items, GDD_TALENTS T18, §6.6). Runs the design data checks without a browser,
 * a dev server or Vite (about one second), the same way tools/content-check.mjs does.
 *
 *   node tools/talents-check.mjs                    all stages: trees skillspecs web strings bench crossrefs migrate
 *   node tools/talents-check.mjs trees web          selected stages only (several allowed)
 *   node tools/talents-check.mjs --bench            also print the §3.9 / §6.2 bench tables
 *   node tools/talents-check.mjs --v                also print info lines
 *
 * Exit code 1 on any error. Warnings never fail the run. Needs Node >= 22.18 (native TypeScript type stripping).
 */
import fs from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./layout") to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const rootPath = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const ROOT = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);

const argv = process.argv.slice(2);
const verbose = argv.includes('--v');
const showBench = argv.includes('--bench');
const ALL_STAGES = ['trees', 'skillspecs', 'web', 'strings', 'bench', 'crossrefs', 'migrate'];
const wanted = argv.filter((a) => !a.startsWith('--'));
for (const w of wanted) if (!ALL_STAGES.includes(w)) throw new Error(`unknown stage "${w}" (stages: ${ALL_STAGES.join(' ')})`);
const runStage = (name) => wanted.length === 0 || wanted.includes(name);

// ============================================================================ modules under test

const TREE = await imp('src/data/talentTrees/index.ts');
const LAYOUT = await imp('src/data/talentTrees/layout.ts');
const FX = await imp('src/data/talentTrees/fx.ts');
const PALETTE = await imp('src/data/talentTrees/palette.ts');
const STATS = await imp('src/types/stats.ts');
const SKILLS_MOD = await imp('src/data/skills.ts');
const SPECS_MOD = await imp('src/data/specs.ts');
const SKILL_SPECS = await imp('src/data/skillSpecs.ts');
const TALENTS = await imp('src/data/talents.ts');
const PASSIVE_WEB = await imp('src/data/passiveWeb.ts');
const STRINGS = await imp('src/systems/talentStrings.ts');
const TALENT_SYS = await imp('src/systems/Talents.ts');
const MIGRATE = await imp('src/dev/migrate.ts');

const { SKILLS } = SKILLS_MOD;
const { getSpec } = SPECS_MOD;
const { STAT_IDS } = STATS;
const { PALETTE_VALUE } = PALETTE;
const { SLOT_ORDER } = LAYOUT;
const { CLASS_ORDER, SPEC_ORDER, classOfSpec, getTree } = TREE;
const { parseFx, fxContext } = FX;
const { TALENT_LIST, TALENT_NODES, CLASS_START_NODE } = TALENTS;
const TALENT_NODES_BY_ID = TALENT_NODES;
const { validateWeb } = PASSIVE_WEB;
const { encodeBuild, decodeBuild, encodeWeb, decodeWeb } = STRINGS;
const { autoBuildTree } = TALENT_SYS;

/** Status ids of the `StatusId` union (types/skills.ts). Types are erased at runtime, so the union is read from the source. */
function statusIdsFromSource() {
  const src = fs.readFileSync(`${ROOT}/src/types/skills.ts`, 'utf8');
  // `//` comments inside the union contain ';' and quoted words: strip them before cutting at the closing ';'
  const m = /export type StatusId\s*=([\s\S]*?);/.exec(src.replace(/\/\/.*$/gm, ''));
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]);
}
const STATUS_IDS = statusIdsFromSource();
const FX_CTX = fxContext(Object.keys(SKILLS), STATUS_IDS);

/**
 * Ids the design docs define (GDD_V2, GDD_CLASSES_V2, this document). A skill or status that is only in the docs
 * (its SkillDef / StatusId is still being written by another package) is a warning; any other unknown id is an error.
 */
const DOC_IDS = new Set();
for (const f of ['GDD_V2.md', 'GDD_CLASSES_V2.md', 'GDD_TALENTS.md']) {
  const txt = fs.readFileSync(`${ROOT}/docs/${f}`, 'utf8');
  for (const m of txt.matchAll(/\b[a-z][a-z0-9_]{2,}\b/g)) DOC_IDS.add(m[0]);
}

/** Reports a parser / registry message: a missing id the docs define is a warning, anything else an error. */
function refIssue(st, where, msg) {
  const m = /^(?:unknown (?:skill|status)|bad filter) (\S+)$/.exec(msg);
  if (m && DOC_IDS.has(m[1])) st.pending.add(m[1]);
  else st.err(where, msg);
}

// ============================================================================ reporting

let totalErr = 0;
function makeStage(name) {
  const issues = [];
  return {
    name,
    issues,
    /** Ids the docs define but the registry lacks yet (one summary line per stage). */
    pending: new Set(),
    err: (where, msg) => issues.push({ level: 'error', where, msg }),
    warn: (where, msg) => issues.push({ level: 'warn', where, msg }),
    info: (where, msg) => issues.push({ level: 'info', where, msg }),
  };
}
function endStage(st, summary = '') {
  if (st.pending.size) {
    const all = [...st.pending];
    const shown = verbose ? all : all.slice(0, 12);
    st.issues.push({
      level: 'warn',
      where: st.name,
      msg: `${all.length} unique ids are in the design docs but not registered yet (fine until their package lands): ${shown.join(', ')}${all.length > shown.length ? ' …' : ''}`,
    });
  }
  const e = st.issues.filter((i) => i.level === 'error');
  const w = st.issues.filter((i) => i.level === 'warn');
  totalErr += e.length;
  console.log(`\n== ${st.name}: ${e.length} errors, ${w.length} warns${summary ? ` | ${summary}` : ''}`);
  for (const i of st.issues) {
    if (i.level === 'info' && !verbose) continue;
    const tag = i.level === 'error' ? 'ERR ' : i.level === 'warn' ? 'warn' : 'info';
    console.log(`  ${tag} ${i.where} - ${i.msg}`);
  }
}

// ============================================================================ tree helpers

/**
 * KIT PK-0: specs registered in SPEC_TABLE whose raw tree arrives with the T-step (tools/gen-talent-data.mjs). They are
 * allow-listed: the tree-based stages run on SPEC_TREE_ORDER and the crossrefs stage reports each one as a warning.
 */
const TREE_PENDING_SPECS = new Set(['rogue_subtlety']);
const SPEC_TREE_ORDER = SPEC_ORDER.filter((s) => !TREE_PENDING_SPECS.has(s));

const TREE_LIST = [
  ...CLASS_ORDER.map((c) => ({ kind: 'class', id: c, classId: c, where: `class:${c}` })),
  ...SPEC_TREE_ORDER.map((s) => ({ kind: 'spec', id: s, classId: classOfSpec(s), where: `spec:${s}` })),
];

/** Builds one tree; a build error (missing row, bad palette, unknown slot) comes back as `error` instead of throwing. */
function loadTree(entry) {
  try {
    const tree = getTree(entry.kind, entry.id);
    return tree ? { tree } : { error: 'no tree registered' };
  } catch (e) {
    return { error: String(e?.message ?? e) };
  }
}

const TREE_RESULTS = TREE_LIST.map((entry) => ({ entry, ...loadTree(entry) }));

const EXPECTED_TYPES = {
  class: { P: 12, C: 5, M: 9, A: 1, K: 3 },
  spec: { P: 12, C: 5, M: 7, A: 3, K: 3 },
};

function optionsOf(node) {
  return node.options.length;
}

/** Granted-skill items of an fx string (`G <skill>`). */
function grantsIn(items) {
  return items.flatMap((it) => (it.k === 'G' ? [it.skill] : []));
}

// ============================================================================ design caps (§6.1)

/**
 * The 100-BP reference of a stat (the `REF` column): GDD_LIFE §6.5 (T1 roll midpoints; a percent stat is its own
 * reference, e.g. maxHpPct 0.115), and the GDD_TALENTS §6.1 design references for the V2 stats.
 */
const REF = {
  str: 36.5, dex: 36.5, int: 36.5, vit: 36.5, allAttr: 36.5,
  maxHp: 187.5, maxHpPct: 0.115, armor: 162.5, armorPct: 0.85,
  resFire: 0.305, resFrost: 0.305, resLightning: 0.305, resShadow: 0.305, resPoison: 0.305, resArcane: 0.305, resAll: 0.12,
  blockChance: 0.075, critChance: 0.0355, critDamage: 0.345, attackSpeed: 0.115, castSpeed: 0.115,
  damagePct: 0.14,
  physicalDamagePct: 0.305, fireDamagePct: 0.305, frostDamagePct: 0.305, lightningDamagePct: 0.305, shadowDamagePct: 0.305,
  poisonDamagePct: 0.305, holyDamagePct: 0.305, arcaneDamagePct: 0.305, meleeDamagePct: 0.305, projectileDamagePct: 0.305,
  cdr: 0.085, resourceRegenPct: 0.255, hpRegen: 23.5, lifeSteal: 0.018, moveSpeedPct: 0.115, dodgeChance: 0.0345,
  staggerPct: 0.255,
  // §6.1 design references (new V2 stats)
  guardGauge: 30, parryWindow: 0.1, poiseDamagePct: 0.255, finisherPct: 0.305, flaskGainPct: 0.5, flaskEffectPct: 0.3,
  weakDamagePct: 0.3, runeEffectPct: 0.3, majorCdrPct: 0.09, minionDamagePct: 0.305, minionHpPct: 0.305, trapDamagePct: 0.305,
  healingPct: 0.14,
};

/**
 * Stats with no reference above are priced by their palette rank (about 20 BP per rank, §2.6). Such prices are
 * estimates: a cap they break is a warning, not an error.
 */
const estimatedStats = new Set();
function priceOf(stat, value) {
  if (REF[stat] !== undefined) return { bp: (value / REF[stat]) * 100, est: false };
  if (PALETTE_VALUE[stat] !== undefined) {
    estimatedStats.add(stat);
    return { bp: (value / (PALETTE_VALUE[stat] * 5)) * 100, est: true };
  }
  return { bp: 0, est: true, unknown: stat };
}
/** Sum of the BP value of a stat block; `est` is true when any stat of it is an estimate. */
function priceOfBlock(stats) {
  let bp = 0;
  let est = false;
  for (const [k, v] of Object.entries(stats)) {
    const p = priceOf(k, v);
    bp += p.bp;
    est = est || p.est;
  }
  return { bp, est };
}
const priceBP = (stats) => priceOfBlock(stats).bp;

/** Cap group of a non-palette option (§6.1): C option, M mod, K capstone (s28/s29 or s30), or none (plain skill unlock). */
function capGroup(node, items) {
  if (node.type === 'C') return 'C';
  if (node.type === 'K') return node.slot === 's30' ? 'K30' : 'K28';
  if (node.type === 'M') return 'M';
  return items.some((it) => it.k === 'M') ? 'M' : null;
}
const CAPS = {
  C: { s: 80, dmgx: 1.2, cdx: 0.75 },
  M: { s: 70, dmgx: 1.25, cdx: 0.7 },
  K28: { s: 130, dmgx: 1.3, cdx: 0.65 },
  K30: { s: 150, dmgx: 1.35, cdx: 0.6 },
};

/** Action caps that apply to every fx item: dmg/exp coefficient ≤ 2.0, echo coefficient ≤ 0.7, buff max stacks ≤ 5. */
function actionCapErrors(items) {
  const out = [];
  for (const it of items) {
    if (it.k !== 'T') continue;
    for (const a of it.actions) {
      if (a.a === 'dmg' || a.a === 'exp') {
        const c = Number(a.args[0]);
        if (c > 2.0) out.push(`${a.a}() coefficient ${c} > 2.0`);
      } else if (a.a === 'echo') {
        const c = Number(a.args[1]);
        if (c > 0.7) out.push(`echo() coefficient ${c} > 0.7`);
      } else if (a.a === 'buff') {
        const m = a.args.find((s) => /^max=/.test(s));
        if (m && Number(m.slice(4)) > 5) out.push(`buff max ${m.slice(4)} > 5`);
      }
    }
  }
  return out;
}

// ============================================================================ param contract (PM-TAL)

/** Statuses a SkillDef applies itself (statuses / selfStatuses / allyStatuses rows); `sdur=<status>` only means something for these. */
function statusesOfSkill(def) {
  const out = new Set();
  for (const key of ['statuses', 'selfStatuses', 'allyStatuses', 'groundStatuses']) {
    for (const s of def[key] ?? []) if (s && s.status) out.add(s.status);
  }
  return out;
}

/** Param keys a SpecDef.mods row adds to a skill (`mods: [{ skill, params }]`), per skill id. */
const SPEC_MOD_KEYS = new Map();
for (const spec of SPEC_ORDER) {
  for (const m of getSpec(spec)?.mods ?? []) {
    if (!m.params) continue;
    const set = SPEC_MOD_KEYS.get(m.skill) ?? new Set();
    for (const k of Object.keys(m.params)) set.add(k);
    SPEC_MOD_KEYS.set(m.skill, set);
  }
}

/**
 * Param contract of docs/kits/plate-melee.md §f2: every `p.<key>` op of an `M` item must exist in the target skill's `params`,
 * and every `sdur=<status>:+n` op must name a status the target applies (`statuses` / `selfStatuses` / `allyStatuses`).
 * A key that only a SpecDef.mods row adds counts as present; a missing key under `+=` or `=` is a warning (it starts from 0), a missing key
 * under `*=` is an error (0 x n is a dead row). Returns `{ errors, warns }`; an unknown skill id is reported by the parser, not here.
 */
function paramContractIssues(items) {
  const errors = [];
  const warns = [];
  for (const it of items) {
    if (it.k !== 'M') continue;
    for (const target of it.target.split('+')) {
      const def = SKILLS[target];
      if (!def) continue;
      for (const op of it.ops) {
        if (op.op.startsWith('p.')) {
          const k = op.op.slice(2);
          const have = (def.params && k in def.params) || SPEC_MOD_KEYS.get(target)?.has(k);
          if (!have) (op.mode === '*=' ? errors : warns).push(`${op.op}${op.mode ?? '='} is not a param of ${target}${op.mode === '*=' ? '' : ' (starts from 0)'}`);
        } else if (op.op === 'sdur') {
          const own = statusesOfSkill(def);
          for (const e of String(op.v).split(',')) {
            const sid = e.split(':')[0];
            if (!own.has(sid)) warns.push(`sdur=${sid} on ${target}: the skill row applies ${[...own].join('/') || 'no status'}`);
          }
        }
      }
    }
  }
  return { errors, warns };
}

// ============================================================================ stage: trees

function stageTrees() {
  const st = makeStage('trees');
  let rows = 0;
  let options = 0;
  const xIds = new Set();
  const nameSeen = new Map();

  for (const r of TREE_RESULTS) {
    const { entry } = r;
    if (r.error) {
      st.err(entry.where, `build failed: ${r.error}`);
      continue;
    }
    const tree = r.tree;
    if (tree.nodes.length !== 30) st.err(entry.where, `${tree.nodes.length} nodes, expected 30`);
    tree.nodes.forEach((n, i) => {
      if (n.slot !== SLOT_ORDER[i]) st.err(entry.where, `node ${i} is ${n.slot}, expected ${SLOT_ORDER[i]}`);
      rows += n.type === 'P' ? 0 : optionsOf(n);
    });

    const counts = { P: 0, C: 0, M: 0, A: 0, K: 0 };
    for (const n of tree.nodes) counts[n.type] += 1;
    for (const [type, want] of Object.entries(EXPECTED_TYPES[entry.kind])) {
      if (counts[type] !== want) st.err(entry.where, `${counts[type]} ${type} nodes, expected ${want}`);
    }

    // palette: 12 stats, each a StatId with a palette value
    const palette = tree.nodes.filter((n) => n.type === 'P');
    for (const n of palette) {
      if (!n.stat || !STAT_IDS.includes(n.stat)) st.err(`${entry.where}/${n.slot}`, `palette stat ${n.stat} is not a StatId`);
    }

    // option shape: two options for C, K s30 and the class s05 choice; one otherwise
    for (const n of tree.nodes) {
      if (n.type === 'P') continue;
      const twoOpt = n.type === 'C' || (n.type === 'K' && n.slot === 's30') || (n.type === 'A' && entry.kind === 'class');
      const want = twoOpt ? 2 : 1;
      if (n.options.length !== want) st.err(`${entry.where}/${n.slot}`, `${n.options.length} options, expected ${want}`);
    }

    for (const n of tree.nodes) {
      const isP = n.type === 'P';
      n.options.forEach((opt, oi) => {
        const where = `${entry.where}/${n.slot}${isP ? '' : n.options.length === 2 ? 'AB'[oi] : ''}`;
        options += 1;
        const parsed = parseFx(opt.fx, FX_CTX);
        for (const e of parsed.errors) refIssue(st, where, e);
        const contract = paramContractIssues(parsed.items);
        for (const e of contract.errors) st.err(where, e);
        for (const w of contract.warns) st.warn(where, w);
        const grants = grantsIn(parsed.items);
        const isGrantOnly = grants.length > 0 && !isP;

        // names and descriptions (granted-skill rows take them from the skill itself)
        if (!(isGrantOnly && !opt.name && !opt.desc)) {
          if (!opt.name) st.err(where, 'empty name');
          if (opt.name.length > 30) st.err(where, `name ${opt.name.length} chars > 30`);
          if (opt.desc.length < 8 || opt.desc.length > 170) st.err(where, `description ${opt.desc.length} chars, expected 8..170`);
          if (opt.name) {
            const key = `${entry.kind}:${entry.id}|${opt.name}`;
            if (nameSeen.has(key) && nameSeen.get(key) !== where) st.warn(where, `duplicate name "${opt.name}"`);
            nameSeen.set(key, where);
          }
        }

        // design caps (§6.1)
        if (!isP) {
          const group = capGroup(n, parsed.items);
          if (group) {
            const cap = CAPS[group];
            let sPart = 0;
            let est = false;
            const detail = [];
            for (const it of parsed.items) {
              if (it.k !== 'S') continue;
              const p = priceOfBlock(it.stats);
              sPart += p.bp;
              est = est || p.est;
              for (const [k, v] of Object.entries(it.stats)) detail.push(`${k}=${v}`);
            }
            if (sPart > cap.s) {
              const msg = `S part ${sPart.toFixed(1)} BP > ${cap.s} (${group}: ${detail.join(' ')})`;
              if (est) st.warn(where, `${msg}, estimated price`);
              else st.err(where, msg);
            }
            for (const it of parsed.items) {
              if (it.k !== 'M') continue;
              for (const op of it.ops) {
                if (op.op === 'dmgx' && Number(op.v) > cap.dmgx) st.err(where, `dmgx ${op.v} > ${cap.dmgx} (${group})`);
                if (op.op === 'cdx' && Number(op.v) < cap.cdx) st.err(where, `cdx ${op.v} < ${cap.cdx} (${group})`);
              }
            }
          }
          for (const msg of actionCapErrors(parsed.items)) st.err(where, msg);
          for (const it of parsed.items) {
            if (it.k === 'T' && it.trig === 'lethal' && n.slot !== 's28') st.err(where, 'lethal entry outside s28');
            if (it.k === 'X') xIds.add(it.id);
          }
        }
      });
    }

    // class s05 offers two skills; the spec tree grants one skill at s05
    const s05 = tree.nodes.find((n) => n.slot === 's05');
    if (entry.kind === 'class') {
      for (const opt of s05.options) {
        if (!grantsIn(parseFx(opt.fx).items).length) st.err(`${entry.where}/s05`, 'class s05 option grants no skill');
      }
    } else if (!grantsIn(parseFx(s05.options[0].fx).items).length) {
      st.err(`${entry.where}/s05`, 'spec s05 grants no skill');
    }
  }

  if (xIds.size > 5) st.err('trees', `${xIds.size} bespoke X specials > 5`);
  for (const s of estimatedStats) st.info('pricing', `stat ${s} priced by its palette rank (no GDD reference)`);
  endStage(st, `trees ${TREE_RESULTS.length} rows ${rows} options ${options} X ${xIds.size} estimated ${estimatedStats.size}`);
  return { rows, trees: TREE_RESULTS.length };
}

// ============================================================================ stage: skillspecs

const BANNED_MOD_OPS = new Set([
  'dmgx', 'cd', 'cost', 'costx', 'rad', 'radx', 'rng', 'cast', 'castx', 'cnt', 'prc', 'kbx', 'stgx', 'crit', 'dotx', 'healx', 'absx', 'dur',
]);

function stageSkillSpecs() {
  const st = makeStage('skillspecs');
  const rows = SKILL_SPECS.SKILL_SPEC_ROWS;
  const signature = Object.values(SKILL_SPECS.SIGNATURE_SKILLS).flat();
  if (rows.length !== 162) st.err('skillspecs', `${rows.length} rows, expected 162`);
  if (signature.length !== 27) st.err('skillspecs', `${signature.length} signature skills, expected 27`);

  const perSkill = new Map();
  const seen = new Set();
  for (const row of rows) {
    const where = `${row.skill} T${row.tier}${row.opt}`;
    perSkill.set(row.skill, (perSkill.get(row.skill) ?? 0) + 1);
    const key = `${row.skill}|${row.tier}|${row.opt}`;
    if (seen.has(key)) st.err(where, 'duplicate row');
    seen.add(key);
    if (!SKILLS[row.skill]) refIssue(st, where, `unknown skill ${row.skill}`);
    if (!signature.includes(row.skill)) st.err(where, 'skill is not one of the 27 signature skills');
    if (!row.name || row.name.length > 30) st.err(where, `name "${row.name}" must be 1..30 chars`);
    if (row.desc.length < 8 || row.desc.length > 170) st.err(where, `description ${row.desc.length} chars, expected 8..170`);

    const parsed = parseFx(row.fx, FX_CTX);
    for (const e of parsed.errors) refIssue(st, where, e);
    const contract = paramContractIssues(parsed.items);
    for (const e of contract.errors) st.err(where, e);
    for (const w of contract.warns) st.warn(where, w);
    let formVerbs = 0;
    for (const it of parsed.items) {
      if (it.k === 'S') st.err(where, 'S (stat) item is banned in a specialisation');
      else if (it.k === 'G' || it.k === 'X') st.err(where, `${it.k} item is banned in a specialisation`);
      else if (it.k === 'M') {
        if (it.target !== row.skill) st.err(where, `M target ${it.target} must be the skill itself`);
        const hasChg = it.ops.find((o) => o.op === 'chg');
        const cdx = it.ops.find((o) => o.op === 'cdx');
        for (const op of it.ops) {
          if (op.op.startsWith('p.')) {
            formVerbs += 1;
            continue;
          }
          if (op.op === 'cdx') {
            // cdx is banned except as the price of a charge (chg=+1 with cdx >= 1.4)
            if (!(hasChg && Number(op.v) >= 1.4)) st.err(where, 'cdx is banned unless it prices chg=+1');
            continue;
          }
          if (op.op === 'chg') {
            if (Number(op.v) !== 1 || !(cdx && Number(cdx.v) >= 1.4)) st.err(where, 'chg needs chg=+1 with cdx >= 1.4');
            formVerbs += 1;
            continue;
          }
          if (op.op === 'cv') {
            const frac = Number(String(op.v).split(':')[1]);
            if (frac !== 1) st.err(where, `cv must be a full conversion (frac 1), got ${op.v}`);
            formVerbs += 1;
            continue;
          }
          if (op.op === 'shape') {
            formVerbs += 1;
            continue;
          }
          if (op.op === 'st') {
            formVerbs += 1;
            continue;
          }
          if (BANNED_MOD_OPS.has(op.op)) st.err(where, `banned verb ${op.op}`);
          else st.err(where, `verb ${op.op} is not allowed in a specialisation`);
        }
      } else if (it.k === 'T') {
        // skill-local procs only: the trigger is a hit / cast / kill / crit of the option's own skill (§4.3)
        if (!['hit', 'cast', 'kill', 'crit'].includes(it.trig)) st.err(where, `trigger ${it.trig} is not a skill-local proc`);
        if (it.filter !== row.skill) st.err(where, `T filter ${it.filter} must be the skill itself`);
        formVerbs += 1;
        for (const msg of actionCapErrors([it])) st.err(where, msg);
      }
    }
    if (formVerbs === 0) st.err(where, 'no form verb (shape, cv:1, st, chg, p.* or own-skill T)');
  }

  for (const skill of signature) {
    const n = perSkill.get(skill) ?? 0;
    if (n !== 6) st.err(skill, `${n} options, expected 6 (3 tiers x A|B)`);
  }
  endStage(st, `skillspecs ${rows.length} rows (${perSkill.size} skills x 6)`);
  return rows.length;
}

// ============================================================================ stage: web

const WEB_GOLDEN = JSON.parse(fs.readFileSync(`${ROOT}/docs/GDD_TALENTS.web.json`, 'utf8'));
const WEB_KIND_COUNTS = { start: 9, small: 178, notable: 80, keystone: 16, mastery: 14, socket: 9 };

function stageWeb() {
  const st = makeStage('web');
  for (const e of validateWeb(TALENT_LIST)) st.err('web', e);

  const kinds = {};
  for (const n of TALENT_LIST) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
  for (const [k, want] of Object.entries(WEB_KIND_COUNTS)) {
    if (kinds[k] !== want) st.err('web', `${kinds[k] ?? 0} ${k} nodes, expected ${want}`);
  }
  if (TALENT_LIST.length !== 306) st.err('web', `${TALENT_LIST.length} nodes, expected 306`);

  // golden file: same ids, kinds, positions and link sets (Δ = 0)
  if (WEB_GOLDEN.length !== TALENT_LIST.length) st.err('web', `golden has ${WEB_GOLDEN.length} nodes`);
  let delta = 0;
  for (const g of WEB_GOLDEN) {
    const n = TALENT_NODES[g.id];
    if (!n) {
      delta += 1;
      st.err('web', `golden node ${g.id} is missing`);
      continue;
    }
    const sameLinks = [...n.links].sort().join(',') === [...g.links].sort().join(',');
    if (n.kind !== g.kind || n.x !== g.x || n.y !== g.y || !sameLinks) {
      delta += 1;
      st.err(g.id, `differs from golden (kind ${n.kind}/${g.kind}, x ${n.x}/${g.x}, y ${n.y}/${g.y}, links ${sameLinks ? 'ok' : 'differ'})`);
    }
  }
  endStage(st, `web ${TALENT_LIST.length} golden Δ${delta}`);
  return TALENT_LIST.length;
}

// ============================================================================ stage: strings

const SKILL_PICKS = [1, 2, 0, 1, 2, 0, 1, 2, 0];
const MAGE_FIRE_EXAMPLE = 'EFT1-04-Vqq9VuhEgFdVeq3QiQA-VAAA-47';

/** Parent rule and gate rule for a stored allocation (§2.2): every taken node has a taken parent (row 0 is free). */
function allocationErrors(tree, arr) {
  const out = [];
  let spent = 0;
  tree.nodes.forEach((n, i) => {
    spent += n.type === 'P' ? arr[i] ?? 0 : (arr[i] ?? 0) > 0 ? 1 : 0;
  });
  tree.nodes.forEach((n, i) => {
    if (!(arr[i] > 0)) return;
    if (n.parents.length && !n.parents.some((p) => (arr[SLOT_ORDER.indexOf(p)] ?? 0) > 0)) out.push(`${n.slot} has no taken parent`);
  });
  return { spent, errors: out };
}

function stageStrings() {
  const st = makeStage('strings');
  let ok = 0;
  for (const spec of SPEC_TREE_ORDER) {
    const cls = classOfSpec(spec);
    const classTree = getTree('class', cls);
    const specTree = getTree('spec', spec);
    const clsArr = autoBuildTree('class', 25);
    const spcArr = autoBuildTree('spec', 25);
    for (const [kind, tree, arr] of [['class', classTree, clsArr], ['spec', specTree, spcArr]]) {
      const a = allocationErrors(tree, arr);
      if (a.spent !== 25) st.err(`${spec}/${kind}`, `autoBuild spent ${a.spent}, expected 25`);
      for (const e of a.errors) st.err(`${spec}/${kind}`, `autoBuild: ${e}`);
    }
    const s = encodeBuild(spec, clsArr, spcArr, SKILL_PICKS);
    const d = decodeBuild(s, cls);
    const same = d.ok && d.specId === spec
      && d.cls.join() === clsArr.join() && d.spc.join() === spcArr.join() && d.skl.join() === SKILL_PICKS.join();
    if (!same) {
      st.err(spec, `round trip failed (${s}) ${d.ok ? '' : d.error}`);
      continue;
    }
    // CRC rejection: flip the checksum; a payload byte change must fail too
    const crc = parseInt(s.slice(-2), 16);
    const badCrc = s.slice(0, -2) + (crc ^ 1).toString(16).padStart(2, '0').toUpperCase();
    const badCrcDecode = decodeBuild(badCrc, cls);
    if (badCrcDecode.ok || badCrcDecode.error !== 'crc') st.err(spec, `bad CRC accepted (${badCrc})`);
    const other = CLASS_ORDER.find((c) => c !== cls);
    const wrongClass = decodeBuild(s, other);
    if (wrongClass.ok || wrongClass.error !== 'class') st.err(spec, 'string of another class accepted');
    ok += 1;
  }

  // the Appendix H example (mage_fire, both trees autoBuilt, first signature skill T1-T3 = A)
  const exampleSkills = [1, 1, 1, 0, 0, 0, 0, 0, 0];
  const example = encodeBuild('mage_fire', autoBuildTree('class', 25), autoBuildTree('spec', 25), exampleSkills);
  if (example !== MAGE_FIRE_EXAMPLE) st.warn('mage_fire', `example string ${example}, Appendix H has ${MAGE_FIRE_EXAMPLE}`);

  // web plan string (EFP1): round trip of the first 70 nodes of a start, and CRC rejection
  for (const cls of CLASS_ORDER) {
    const start = CLASS_START_NODE[cls];
    // CLASS SCAFFOLD (KIT Druid): a class whose passive-web sector is not authored yet has a start id with no node; nothing to round-trip
    if (!TALENT_NODES_BY_ID[start]) { st.warn(`web:${cls}`, `no web sector yet (${start} is not a node)`); continue; }
    const ids = TALENT_LIST.slice(0, 70).map((n) => n.id);
    if (!ids.includes(start)) ids.push(start);
    const web = encodeWeb(cls, ids, { [TALENT_LIST.find((n) => n.kind === 'mastery').id]: 2 });
    const d = decodeWeb(web);
    if (!d.ok || d.classId !== cls || d.allocated.length !== ids.length) st.err(`web:${cls}`, `round trip failed (${web})`);
    const bad = web.slice(0, -2) + (parseInt(web.slice(-2), 16) ^ 1).toString(16).padStart(2, '0').toUpperCase();
    if (decodeWeb(bad).ok) st.err(`web:${cls}`, 'bad CRC accepted');
  }
  endStage(st, `strings ${ok}/${SPEC_TREE_ORDER.length} specs round trip, web ${CLASS_ORDER.length} starts`);
  return ok;
}

// ============================================================================ stage: bench (§3.9, §6.2)

/** §6.2 class and spec tree values of the design pass (BP). */
const DOC_TREE_BP = {
  class: { knight: 1252, barbarian: 1404, mage: 1231, rogue: 1283, monk: 1422, archer: 1186, paladin: 1343, necromancer: 1309, warlock: 1372 },
  spec: {
    knight_protector: 1391, knight_blademaster: 1088, barbarian_warlord: 1208, barbarian_butcher: 1361, mage_fire: 1302,
    mage_frost: 1189, mage_arcane: 1239, rogue_assassin: 1359, rogue_alchemist: 1173, monk_brewmaster: 1156, monk_windwalker: 1348,
    monk_mistweaver: 1244, archer_marksman: 1163, archer_beastmaster: 1141, paladin_protection: 1199, paladin_holy: 1243,
    paladin_retribution: 1264, necromancer_summoner: 1223, necromancer_bone: 1292, warlock_affliction: 1151, warlock_destruction: 1216,
  },
};
/** §3.9 web values at 89 points (N = 89) per class start, and the range at N = 70. */
const DOC_WEB_89 = { knight: 7406, rogue: 7446, barbarian: 7485, mage: 7486, necromancer: 7559, monk: 7770, warlock: 7801, archer: 7806, paladin: 7885 };
const DOC_WEB_70 = { min: 5968, max: 6507 };

/** Tree node value of one option (§6.2): priced stats + 45 per M + 50 per T + 60 per grant + 40 per X. */
function optionValue(opt) {
  let v = 0;
  for (const it of parseFx(opt.fx).items) {
    if (it.k === 'S') v += priceBP(it.stats);
    else if (it.k === 'M') v += 45;
    else if (it.k === 'T') v += 50;
    else if (it.k === 'G') v += 60;
    else if (it.k === 'X') v += 40;
  }
  return v;
}

/** Greedy best-N-point benchmark of a tree (§6.2): take the takeable node with the highest value, N times. */
function greedyTree(tree, points = 25) {
  const taken = new Array(30).fill(0);
  const idx = (slot) => SLOT_ORDER.indexOf(slot);
  let spent = 0;
  let total = 0;
  while (spent < points) {
    let best = null;
    tree.nodes.forEach((n, i) => {
      const max = n.type === 'P' ? 2 : 1;
      if (taken[i] >= max || spent < n.gate) return;
      if (n.parents.length && !n.parents.some((p) => taken[idx(p)] > 0)) return;
      let value;
      if (n.type === 'P') value = priceOf(n.stat, PALETTE_VALUE[n.stat]).bp;
      else value = Math.max(...n.options.map(optionValue));
      if (best === null || value > best.value) best = { i, value };
    });
    if (!best) break;
    taken[best.i] += 1;
    spent += 1;
    total += best.value;
  }
  return total;
}

/**
 * Value of one web node (§3.9): priced positive stats (the legacy `stats` block and the S items of `fx`), 55 for an
 * unpriced special (legacy `special` or any non-S item), 90 for a keystone; drawbacks ignored. Starts and sockets 0
 * (a socket holds a jewel, §3.7, which is not priced here).
 */
function webNodeValue(node, fx) {
  if (node.kind === 'start' || node.kind === 'socket') return 0;
  let v = 0;
  for (const [k, x] of Object.entries(node.stats ?? {})) v += Math.max(0, priceOf(k, x).bp);
  if (node.special) v += 55;
  for (const it of parseFx(fx).items) {
    if (it.k === 'S') {
      for (const [k, x] of Object.entries(it.stats)) v += Math.max(0, priceOf(k, x).bp);
    } else {
      v += 55;
    }
  }
  if (node.kind === 'keystone') v += 90;
  return v;
}

/** Greedy web path (§3.9) from a class start: N single-point nodes, always the connected node of highest value. */
function greedyWeb(classId, points) {
  const start = CLASS_START_NODE[classId];
  const byId = TALENT_NODES;
  const order = new Map(TALENT_LIST.map((n, i) => [n.id, i]));
  const taken = new Set([start]);
  let total = 0;
  for (let step = 0; step < points; step++) {
    let best = null;
    for (const id of taken) {
      for (const l of byId[id].links) {
        if (taken.has(l)) continue;
        const n = byId[l];
        if (n.kind === 'start') continue;
        let value;
        if (n.kind === 'mastery') value = Math.max(...(n.choices ?? [{ fx: '' }]).map((c) => webNodeValue(n, c.fx)));
        else value = webNodeValue(n, n.fx ?? '');
        if (best === null || value > best.value || (value === best.value && order.get(l) < order.get(best.id))) {
          best = { id: l, value };
        }
      }
    }
    if (!best) break;
    taken.add(best.id);
    total += best.value;
  }
  return total;
}

/** Shared tolerance check: ±15 % warns, ±25 % errors. */
function inBand(st, where, got, want, label) {
  const dev = (got - want) / want;
  const pct = `${(dev * 100).toFixed(1)}%`;
  if (Math.abs(dev) > 0.25) st.err(where, `${label} ${Math.round(got)} vs doc ${want} (${pct})`);
  else if (Math.abs(dev) > 0.15) st.warn(where, `${label} ${Math.round(got)} vs doc ${want} (${pct})`);
}

function stageBench() {
  const st = makeStage('bench');
  const rows = [];
  for (const entry of TREE_RESULTS) {
    if (entry.error) continue;
    const key = entry.entry.id;
    const want = DOC_TREE_BP[entry.entry.kind][key];
    const got = greedyTree(entry.tree, 25);
    rows.push({ name: `${entry.entry.kind} ${key}`, got, want, where: entry.entry.where });
    if (want !== undefined) inBand(st, entry.entry.where, got, want, 'tree BP');
  }

  const webRows = [];
  // CLASS SCAFFOLD (KIT Druid): classes without a passive-web sector (start id is not a node) have no web benchmark
  for (const cls of CLASS_ORDER.filter((c) => TALENT_NODES[CLASS_START_NODE[c]])) {
    const v89 = greedyWeb(cls, 89);
    const v70 = greedyWeb(cls, 70);
    webRows.push({ cls, v89, v70 });
    inBand(st, `web:${cls}`, v89, DOC_WEB_89[cls], 'web N=89');
  }
  const min70 = Math.min(...webRows.map((r) => r.v70));
  const max70 = Math.max(...webRows.map((r) => r.v70));
  inBand(st, 'web N=70 min', min70, DOC_WEB_70.min, 'web N=70 min');
  inBand(st, 'web N=70 max', max70, DOC_WEB_70.max, 'web N=70 max');
  const ratio = Math.max(...webRows.map((r) => r.v89)) / Math.min(...webRows.map((r) => r.v89));
  if (ratio > 1.1) st.warn('web', `start parity ${ratio.toFixed(3)} > 1.10 (target)`);

  if (showBench) {
    console.log('\n-- §6.2 tree benchmark (greedy best 25 points, BP)');
    for (const r of rows) {
      const d = r.want ? `${(((r.got - r.want) / r.want) * 100).toFixed(1)}%` : '';
      console.log(`   ${r.name.padEnd(30)} ${String(Math.round(r.got)).padStart(6)}  doc ${String(r.want ?? '-').padStart(6)}  ${d}`);
    }
    console.log('\n-- §3.9 passive web benchmark (greedy path, BP)');
    for (const r of webRows) {
      console.log(`   ${r.cls.padEnd(12)} N=89 ${String(Math.round(r.v89)).padStart(6)}  doc ${String(DOC_WEB_89[r.cls]).padStart(6)}   N=70 ${String(Math.round(r.v70)).padStart(6)}`);
    }
    console.log(`   parity N=89 max/min ${ratio.toFixed(3)} (target <= 1.10)   N=70 range ${Math.round(min70)}-${Math.round(max70)} (doc ${DOC_WEB_70.min}-${DOC_WEB_70.max})`);
  }
  endStage(st, `bench ${rows.length} trees, ${webRows.length} web starts`);
  return rows.length;
}

// ============================================================================ stage: crossrefs

// Classes whose interrupt is not the one-per-class s05 pick. KIT PK-0 adds mage_counterspell, rogue_kick and warlock_spell_lock
// (their kick is a class utility; s05 A still grants it today). PM-TAL: the plate kit makes the kick a baseline s4 button for
// knight (knight_pummel), barbarian (barbarian_pummel) and necromancer (necro_mind_freeze). An exception class may hold only its own kick in s05.
const INTERRUPT_EXCEPTIONS = {
  knight: 'knight_pummel',
  barbarian: 'barbarian_pummel',
  necromancer: 'necro_mind_freeze',
  mage: 'mage_counterspell',
  rogue: 'rogue_kick',
  warlock: 'warlock_spell_lock',
};

function stageCrossrefs() {
  const st = makeStage('crossrefs');
  let grants = 0;
  for (const s of TREE_PENDING_SPECS) st.warn(`spec:${s}`, 'no raw tree yet (KIT PK-0 allow-list; the T-step generates it)');

  // every G skill has a SkillDef row
  for (const r of TREE_RESULTS) {
    if (r.error) continue;
    for (const n of r.tree.nodes) {
      for (const opt of n.options) {
        for (const g of grantsIn(parseFx(opt.fx).items)) {
          grants += 1;
          if (!SKILLS[g]) refIssue(st, `${r.entry.where}/${n.slot}`, `unknown skill ${g}`);
        }
      }
    }
  }

  // every SpecDef.treeSkills slot is a G row of that spec's tree
  for (const spec of SPEC_TREE_ORDER) {
    const def = getSpec(spec);
    const tree = getTree('spec', spec);
    if (!def || !def.treeSkills) continue;
    for (const [skill, slot] of Object.entries(def.treeSkills)) {
      const n = tree.nodes.find((x) => x.slot === slot);
      const granted = n ? n.options.some((o) => grantsIn(parseFx(o.fx).items).includes(skill)) : false;
      if (!granted) st.err(`spec:${spec}`, `treeSkills ${skill} -> ${slot} is not a G row of the tree`);
    }
  }

  // class s05 offers two skills; exactly one of them is an interrupt (Şövalye: knight_shield_bash)
  let withOne = 0;
  for (const cls of CLASS_ORDER) {
    const tree = getTree('class', cls);
    const s05 = tree.nodes.find((n) => n.slot === 's05');
    const skills = s05.options.flatMap((o) => grantsIn(parseFx(o.fx).items));
    if (skills.length !== 2) st.err(`class:${cls}/s05`, `offers ${skills.length} skills, expected 2`);
    const interrupts = skills.filter((s) => SKILLS[s]?.behavior === 'interrupt');
    const exception = INTERRUPT_EXCEPTIONS[cls];
    if (exception) {
      if (SKILLS[exception]?.behavior !== 'interrupt') st.warn(`class:${cls}`, `${exception} has no behavior 'interrupt' yet (combat owner)`);
      const stray = interrupts.filter((s) => s !== exception);
      if (stray.length) st.err(`class:${cls}/s05`, `the exception class has ${stray.join(', ')} in s05 besides its exception skill`);
    } else if (interrupts.length === 1) {
      withOne += 1;
    } else {
      st.err(`class:${cls}/s05`, `${interrupts.length} interrupt skills in s05, expected 1`);
    }
  }
  if (withOne !== CLASS_ORDER.length - Object.keys(INTERRUPT_EXCEPTIONS).length) st.err('crossrefs', 'interrupt rule not met');

  endStage(st, `crossrefs ${grants} grants, ${SPEC_TREE_ORDER.length} specs, ${CLASS_ORDER.length} class s05 pairs`);
  return grants;
}


// ============================================================================ stage: migrate (GDD_TALENTS T20, Appendix C / §1.8)

/** Source files (under src/) that mention a call of `name(`, skipping the fixture module itself. */
function callersOf(name) {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/.ts$/.test(e.name) && !p.endsWith('/src/dev/migrate.ts') && fs.readFileSync(p, 'utf8').includes(`${name}(`)) hits.push(p.slice(ROOT.length + 1));
    }
  };
  walk(`${ROOT}/src`);
  return hits;
}

function stageMigrate() {
  const st = makeStage('migrate');
  const rep = MIGRATE.checkMigrations();
  for (const i of rep.issues) {
    if (i.level === 'error') st.err(i.where, i.msg);
    else st.warn(i.where, i.msg);
  }
  for (const line of rep.info) st.info('migrate', line);
  // the §1.8 toast is only data until a runtime caller shows it
  if (callersOf('migrationToast').length === 0) st.warn('migrate', 'migrationToast has no runtime caller yet: the migration toast is not shown');
  endStage(st, `migrate ${rep.fixtures} fixtures`);
  return rep.fixtures;
}

// ============================================================================ run

const summary = {};
if (runStage('trees')) summary.trees = stageTrees();
if (runStage('skillspecs')) summary.skillspecs = stageSkillSpecs();
if (runStage('web')) summary.web = stageWeb();
if (runStage('strings')) summary.strings = stageStrings();
if (runStage('bench')) summary.bench = stageBench();
if (runStage('crossrefs')) summary.crossrefs = stageCrossrefs();
if (runStage('migrate')) summary.migrate = stageMigrate();

console.log(`\nTOTAL ERRORS ${totalErr}`);
process.exit(totalErr ? 1 : 0);
