#!/usr/bin/env node
/**
 * Headless vertical-dungeon check (ENGINE_VERTICALITY §18 assertions + §17 validator). No browser, no dev server.
 *
 *   node tools/height-check.mjs            dev_height (default)
 *   node tools/height-check.mjs <id>       validator only for any other dungeon id
 *   node tools/height-check.mjs --v        also print info lines
 *
 * Exit codes: 0 all PASS, 1 a validator error or a failed assertion, 2 pending (src/world/Heightfield.ts not written yet,
 * so the groundY / ceilingY assertions cannot run; the validator still runs).
 * Needs Node >= 22.18 (native TypeScript type stripping), like tools/content-check.mjs.
 */
import fs from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./kit") to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const rootPath = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const ROOT = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);

const verbose = process.argv.includes('--v');
const id = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'dev_height';

const { DEV_HEIGHT } = await imp('src/dev/heightDemo.ts');
const cc = await imp('src/dev/contentCheck.ts');
let def = DEV_HEIGHT;
if (id !== 'dev_height') {
  const data = await imp('src/data/dungeons/index.ts');
  def = data.DUNGEONS[id] ?? data.OPEN_ZONES[id];
  if (!def) { console.error(`unknown dungeon id: ${id}`); process.exit(1); }
}

// ---- validator (§17) ----
const issues = cc.checkVerticalDungeon(def);
let failures = 0;
for (const i of issues) {
  if (i.level === 'error') failures++;
  if (i.level !== 'info' || verbose) console.log(`${i.level.toUpperCase().padEnd(5)} ${i.where}: ${i.msg}`);
}
console.log(`validator ${def.id}: ${failures} error(s), ${issues.filter((i) => i.level === 'warn').length} warning(s)`);

if (id !== 'dev_height') process.exit(failures ? 1 : 0);

// ---- headless assertions (§18 table; world metres) ----
const HF = `${ROOT}/src/world/Heightfield.ts`;
if (!fs.existsSync(HF)) {
  console.log(`PENDING assertions: src/world/Heightfield.ts does not exist yet (V1). Validator result above.`);
  process.exit(failures ? 1 : 2);
}
const hfMod = await imp('src/world/Heightfield.ts');
const tileRoom = (i, j) => def.rooms.findIndex((r) => i >= r.rect.x && i < r.rect.x + r.rect.w && j >= r.rect.z && j < r.rect.z + r.rect.h);
const hf = hfMod.buildHeightfield(def, tileRoom);
if (!hf) { console.log('FAIL buildHeightfield returned null for a vertical dungeon'); process.exit(1); }
const { F } = hfMod;
const TOL = 0.01;
let pass = 0;
const check = (name, got, want) => {
  const ok = typeof want === 'boolean' ? got === want : Math.abs(got - want) <= TOL;
  if (ok) pass++; else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${typeof got === 'number' ? got.toFixed(3) : got}${typeof want === 'boolean' ? '' : `, expected ${want.toFixed(3)}`}`);
};
const flagged = (x, z, bit) => (hf.flagsAt(x, z) & bit) !== 0;

// groundY table (§18). Tread points use the §4 index rule floor(u * n); the doc's sample x=65 falls in tread 1, so the
// tread-0 assertion samples x = 64.3 (u = 0.04 -> tread 0) and the last tread x = 71.9.
const n = hfMod.treadCount ? hfMod.treadCount(0, 3.2) : 12;
check('h_entry floor (24,116)', hf.groundY(24, 116), 0);
check('stair tread 0 (64.3,116)', hf.groundY(64.3, 116), hfMod.treadTop(0, 3.2, 0, n));
check('stair tread 0 is SLOPE', flagged(64.3, 116, F.SLOPE), true);
check('last tread (71.9,116)', hf.groundY(71.9, 116), 3.2);
check('plateau (84,116)', hf.groundY(84, 116), 3.2);
check('bridge centre (128,118)', hf.groundY(128, 118), 3.2);
check('bridge is not VOID (128,118)', flagged(128, 118, F.VOID), false);
check('chasm (128,106) floor', hf.groundY(128, 106), 3.2 - 9);
check('chasm (128,106) is VOID', flagged(128, 106, F.VOID), true);
check('hall floor (168,116)', hf.groundY(168, 116), 3.2);
check('dais ramp midpoint (174,116)', hf.groundY(174, 116), 3.8);
check('dais top (188,116)', hf.groundY(188, 116), 4.4);
check('balcony (188,38)', hf.groundY(188, 38), 9.2);
check('lift pad at stop 0 (186,46)', hf.groundY(186, 46), 3.2);
check('h_low corridor (188,160)', hf.groundY(188, 160), 3.2);
// §18 prose samples z = 183.9 and expects -2.4; the linear ramp there is 3.2 + (-5.6) * 0.9875 = -2.33 (-2.4 only at z = 184)
check('ramp near end (188,183.9)', hf.groundY(188, 183.9), 3.2 + (-5.6) * ((183.9 - 176) / 8));
check('ramp end (188,184)', hf.groundY(188, 184), -2.4);
check('h_sunken (196,196)', hf.groundY(196, 196), -2.4);

// ceilingY (§4 rule: max room floor incl. slope ends and lift stops + ceiling). NOTE: §18 prose says hall = 25.2 (3.2 + 22),
// which ignores the 4.4 dais; the §4 rule gives 4.4 + 22 = 26.4. Asserted with the §4 rule; see the report.
check('ceilingY hall (168,116)', hf.ceilingY(168, 116), 4.4 + 22);
check('ceilingY stairs room (84,116)', hf.ceilingY(84, 116), 3.2 + 8);
check('ceilingY h_low (188,160)', hf.ceilingY(188, 160), 3.2 + 3);
check('ceilingY bridge (128,118)', hf.ceilingY(128, 118), 3.2 + 14);

console.log(`headless: ${pass} PASS, ${failures} FAIL (including validator errors)`);
process.exit(failures ? 1 : 0);
