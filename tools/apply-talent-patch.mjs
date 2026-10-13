#!/usr/bin/env node
/**
 * Applies class-package talent patches (`docs/kits/talents_<class>.json`) to `docs/GDD_TALENTS.trees.json`.
 * Owner: items (PM-TAL). Reusable by every class package that re-points talent nodes.
 *
 *   node tools/apply-talent-patch.mjs                      apply every docs/kits/talents_*.json
 *   node tools/apply-talent-patch.mjs knight paladin       only those classes (file name suffix) or explicit file paths
 *   node tools/apply-talent-patch.mjs --check [...]        write nothing; exit 1 when a patch is not fully applied or does not match
 *   node tools/apply-talent-patch.mjs --dry [...]          print what would change, write nothing
 *
 * Patch file format (see docs/kits/talents_paladin.json):
 *   nodes[]:       { tree, node, oldFx, newFx, newName|null, newDesc? }      node = slot + option ("s05A", "s11")
 *   skillSpecs[]:  { classId, oldSkill, newSkill, tier: "1A", oldFx, newFx, newName?, newDesc? }
 *
 * A row is matched by (tree, slot, opt) / (classId, skill, tier, opt). It must carry `oldFx` (patch not applied yet) or
 * `newFx` (already applied, no-op), otherwise the run fails: a stale patch never overwrites a hand edit silently.
 * `newName` / `newDesc` null or absent keep the old text. The trees file is rewritten with `JSON.stringify` only when
 * something changed, in the file's own format (single line, no trailing newline, LF), so unrelated rows keep their bytes.
 * After applying run `node tools/gen-talent-data.mjs` (it regenerates the raw trees + skillSpecs.ts).
 * Node >= 18, no dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TREES_FILE = path.join(ROOT, 'docs', 'GDD_TALENTS.trees.json');
const KITS_DIR = path.join(ROOT, 'docs', 'kits');

const args = process.argv.slice(2);
const check = args.includes('--check');
const dry = args.includes('--dry');
const wanted = args.filter((a) => !a.startsWith('--'));

function patchFiles() {
  const all = fs.readdirSync(KITS_DIR).filter((f) => /^talents_.+\.json$/.test(f));
  if (!wanted.length) return all.map((f) => path.join(KITS_DIR, f));
  return wanted.map((w) => {
    if (fs.existsSync(w)) return path.resolve(w);
    const f = path.join(KITS_DIR, `talents_${w}.json`);
    if (!fs.existsSync(f)) throw new Error(`no patch file for "${w}" (${f})`);
    return f;
  });
}

const rawTrees = fs.readFileSync(TREES_FILE, 'utf8');
const data = JSON.parse(rawTrees);
const problems = [];
const log = [];
let changed = 0;
let pending = 0;

function textOf(v) {
  return typeof v === 'string' && v.length ? v : null;
}

function apply(row, patch, where) {
  if (row.fx === patch.newFx) {
    // already applied; still fill in a name / desc that is missing
  } else if (row.fx === patch.oldFx) {
    pending++;
    row.fx = patch.newFx;
    changed++;
    log.push(`${where}: fx ${patch.oldFx}  ->  ${patch.newFx}`);
  } else {
    problems.push(`${where}: row fx is "${row.fx}", patch expects old "${patch.oldFx}" or new "${patch.newFx}"`);
    return;
  }
  const name = textOf(patch.newName);
  if (name && row.name !== name) {
    pending++;
    log.push(`${where}: name ${row.name} -> ${name}`);
    row.name = name;
    changed++;
  }
  const desc = textOf(patch.newDesc);
  if (desc && row.desc !== desc) {
    pending++;
    row.desc = desc;
    changed++;
  }
}

for (const file of patchFiles()) {
  const label = path.basename(file);
  const patch = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const p of patch.nodes ?? []) {
    const m = /^(s\d\d)([AB]?)$/.exec(p.node);
    const tree = data.trees[p.tree];
    const where = `${label} ${p.tree} / ${p.node}`;
    if (!m || !tree) {
      problems.push(`${where}: unknown tree or bad node id`);
      continue;
    }
    const rows = tree.rows.filter((r) => r.slot === m[1] && r.opt === m[2]);
    if (rows.length !== 1) {
      problems.push(`${where}: ${rows.length} matching rows`);
      continue;
    }
    apply(rows[0], p, where);
    n++;
  }
  for (const p of patch.skillSpecs ?? []) {
    const m = /^([1-9])([AB])$/.exec(p.tier);
    const where = `${label} skillSpec ${p.classId}/${p.oldSkill}->${p.newSkill} ${p.tier}`;
    if (!m) {
      problems.push(`${where}: bad tier`);
      continue;
    }
    const tier = Number(m[1]);
    const match = (skill) => data.skillSpecs.filter((r) => r.classId === p.classId && r.skill === skill && r.tier === tier && r.opt === m[2]);
    let rows = match(p.oldSkill);
    if (rows.length === 0) rows = match(p.newSkill);
    if (rows.length !== 1) {
      problems.push(`${where}: ${rows.length} matching rows`);
      continue;
    }
    if (rows[0].skill !== p.newSkill) {
      pending++;
      rows[0].skill = p.newSkill;
      changed++;
    }
    apply(rows[0], p, where);
    n++;
  }
  log.push(`${label}: ${n} rows matched`);
}

for (const l of log) console.log(l);
if (problems.length) {
  console.error('\napply-talent-patch: PROBLEMS');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
if (check) {
  if (pending) {
    console.error(`apply-talent-patch --check: ${pending} change(s) not applied yet`);
    process.exit(1);
  }
  console.log('apply-talent-patch --check: every patch is applied');
  process.exit(0);
}
if (dry) {
  console.log(`apply-talent-patch --dry: ${changed} change(s), nothing written`);
  process.exit(0);
}
if (changed) {
  const out = JSON.stringify(data);
  fs.writeFileSync(TREES_FILE, out);
  console.log(`apply-talent-patch: ${changed} change(s) written to docs/GDD_TALENTS.trees.json (${rawTrees.length} -> ${out.length} chars)`);
} else {
  console.log('apply-talent-patch: nothing to do');
}
