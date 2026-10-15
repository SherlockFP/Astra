#!/usr/bin/env node
/**
 * Opening-kit icon check: every skill in src/data/openingKit.ts (OPENING_KIT rows) must have a `icon` on its SKILLS row that names an
 * existing file under public/ (the action bar paints it as a CSS mask; a missing file leaves an empty cell with only the cooldown text).
 * Also checks that the bar-facing skill def exists and that the row's icon is an absolute /assets/... path.
 *
 *   node tools/icon-check.mjs
 *
 * Needs Node >= 22.18 (native TypeScript type stripping). Exit code 1 when any icon is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./kit") to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { OPENING_KIT } = await imp('src/data/openingKit.ts');
const { SKILLS } = await imp('src/data/skills.ts');

let rows = 0;
const problems = [];
for (const [classId, kit] of Object.entries(OPENING_KIT)) {
  for (const [skillId] of kit ?? []) {
    rows++;
    const def = SKILLS[skillId];
    if (!def) {
      problems.push(`[${classId}] ${skillId}: no SKILLS row`);
      continue;
    }
    const icon = def.icon ?? '';
    if (!icon) {
      problems.push(`[${classId}] ${skillId}: no icon on the skill row`);
      continue;
    }
    if (!icon.startsWith('/assets/icons/') || !icon.endsWith('.svg')) {
      problems.push(`[${classId}] ${skillId}: icon "${icon}" is not /assets/icons/<name>.svg`);
      continue;
    }
    const file = path.join(ROOT, 'public', icon.slice(1));
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) problems.push(`[${classId}] ${skillId}: icon file missing or empty: public${icon}`);
  }
}

if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log(`icon-check: ${problems.length} problem(s) in ${rows} opening-kit rows`);
  process.exit(1);
}
console.log(`icon-check: ${rows} opening-kit skills, every icon file exists`);
