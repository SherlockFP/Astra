#!/usr/bin/env node
/**
 * Action bar drag & drop (pure model, src/ui/hud/barModel.ts): place, swap, remove, the Barları Kilitle pickup rule, item
 * count and shared cooldown resolution, and the save roundtrip. No browser, no dev server.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/actionbar_dnd.mjs
 *
 * Exit 0 = all PASS, 1 = a failed assertion.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports to .ts like the bundler does (same hook as wow_core.mjs)
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const imp = (p) => import(pathToFileURL(`${ROOT}${p}`).href);

const M = await imp('src/ui/hud/barModel.ts');
const { emptyState, moveCell, removeCell, canPickUp, itemCount, sharedCooldown, serializeBarLayout, parseBarLayout, buildMainRow, sanitizeRow, sameCell, MAIN_KEYS, BAR_CELLS } = M;

let failures = 0;
function check(name, ok, msg = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${msg ? ' · ' + msg : ''}`);
}
const skill = (id) => ({ k: 'skill', id });
const mat = (id) => ({ k: 'mat', id });
const ids = (row) => row.map((c) => (c ? `${c.k}:${c.id}` : '-')).join(' ');

// ---- place: a skill book drag copies onto an empty cell and leaves the source alone
{
  const s0 = emptyState();
  const s1 = moveCell(s0, null, { bar: 'bar2', idx: 0 }, skill('m_slash'));
  check('place copy on empty extra cell', sameCell(s1.bar2[0], skill('m_slash')));
  check('place keeps the rest empty', s1.bar2.slice(1).every((c) => c === null) && s1.main.every((c) => c === null));
  check('place does not mutate the input state', s0.bar2[0] === null);
}

// ---- swap: a dragged cell trades places with the target (target empty -> source empties)
{
  let s = emptyState();
  s = moveCell(s, null, { bar: 'bar3', idx: 2 }, mat('pot_hp_1'));
  s = moveCell(s, null, { bar: 'bar3', idx: 5 }, mat('pot_res_1'));
  const sw = moveCell(s, { bar: 'bar3', idx: 2 }, { bar: 'bar3', idx: 5 }, mat('pot_hp_1'));
  check('swap exchanges two filled cells', sameCell(sw.bar3[2], mat('pot_res_1')) && sameCell(sw.bar3[5], mat('pot_hp_1')), ids(sw.bar3));
  const mv = moveCell(s, { bar: 'bar3', idx: 2 }, { bar: 'bar3', idx: 9 }, mat('pot_hp_1'));
  check('move to an empty cell empties the source', mv.bar3[2] === null && sameCell(mv.bar3[9], mat('pot_hp_1')), ids(mv.bar3));
  const cross = moveCell(s, { bar: 'bar3', idx: 5 }, { bar: 'bar2', idx: 0 }, mat('pot_res_1'));
  check('swap across bars', sameCell(cross.bar2[0], mat('pot_res_1')) && sameCell(cross.bar3[5], null));
  const same = moveCell(s, { bar: 'bar3', idx: 2 }, { bar: 'bar3', idx: 2 }, mat('pot_hp_1'));
  check('drop on the source cell is a no-op', same === s);
}

// ---- main skills: a skill lives in one main slot only (the setSkillSlot rule)
{
  let s = emptyState();
  s = moveCell(s, null, { bar: 'main', idx: 1 }, skill('m_bash'));
  s = moveCell(s, null, { bar: 'main', idx: 3 }, skill('m_bash'));
  check('same skill on the main bar moves to the new slot', s.main[1] === null && sameCell(s.main[3], skill('m_bash')), ids(s.main));
  s = moveCell(s, null, { bar: 'bar2', idx: 0 }, skill('m_bash'));
  check('extra bars may hold a skill that is also on the main bar', sameCell(s.bar2[0], skill('m_bash')) && sameCell(s.main[3], skill('m_bash')));
}

// ---- remove: a dragged cell released outside every zone empties its cell
{
  let s = moveCell(emptyState(), null, { bar: 'bar2', idx: 4 }, skill('m_fire'));
  s = removeCell(s, { bar: 'bar2', idx: 4 });
  check('drag off the bar removes the cell', s.bar2[4] === null);
}

// ---- lock: Barları Kilitle needs Shift to pick up; off = always
{
  check('lock on, no shift: no pickup', canPickUp(true, false) === false);
  check('lock on, shift: pickup', canPickUp(true, true) === true);
  check('lock off: pickup without shift', canPickUp(false, false) === true);
}

// ---- item count: total in the bags, never negative, missing = 0
{
  const bags = { pot_hp_1: 5, pot_res_1: 0 };
  check('item count is the stack total', itemCount(bags, 'pot_hp_1') === 5);
  check('item count 0 stays on the bar (greyed)', itemCount(bags, 'pot_res_1') === 0);
  check('item count missing id is 0', itemCount(bags, 'flask_x') === 0);
  check('item count never negative', itemCount({ x: -3 }, 'x') === 0);
}

// ---- shared cooldown: the potion_cd status drives every bar item
{
  const cd = sharedCooldown({ remaining: 7.5, duration: 15 });
  check('shared cooldown reads remaining / total', cd.remaining === 7.5 && cd.total === 15);
  check('no status = no cooldown', sharedCooldown(undefined).remaining === 0 && sharedCooldown(null).total === 0);
  check('negative remaining clamps to 0', sharedCooldown({ remaining: -1, duration: 10 }).remaining === 0);
}

// ---- save roundtrip: extra bars and main consumables survive JSON; main skills come from skillBar
{
  let s = emptyState();
  s = moveCell(s, null, { bar: 'bar2', idx: 0 }, skill('m_slash'));
  s = moveCell(s, null, { bar: 'bar2', idx: 11 }, mat('pot_hp_2'));
  s = moveCell(s, null, { bar: 'bar3', idx: 7 }, mat('pot_res_3'));
  s = moveCell(s, null, { bar: 'main', idx: 0 }, mat('scroll_town'));
  s = moveCell(s, null, { bar: 'main', idx: 2 }, skill('m_whirl')); // a main skill: stored in skillBar, not in the layout
  const saved = JSON.parse(JSON.stringify(serializeBarLayout(s)));
  const back = parseBarLayout(saved);
  check('roundtrip bar2', ids(back.bar2) === ids(s.bar2), ids(back.bar2));
  check('roundtrip bar3', ids(back.bar3) === ids(s.bar3), ids(back.bar3));
  check('roundtrip main consumable', sameCell(back.main[0], mat('scroll_town')));
  check('main skill not written to the layout', saved.main && !('2' in saved.main) && Object.values(saved.main).every((c) => c.k === 'mat'));
  const skillBar = { lmb: 'm_slash', q: 'm_whirl' };
  const row = buildMainRow(skillBar, back.main);
  check('main row = saved consumable + skillBar skills', sameCell(row[0], mat('scroll_town')) && sameCell(row[2], skill('m_whirl')) && row[1] === null, ids(row));
  check('a consumable hides the skill in that slot', sameCell(buildMainRow({ lmb: 'm_slash' }, back.main)[0], mat('scroll_town')));
  check('row lengths are fixed', row.length === MAIN_KEYS.length && back.bar2.length === BAR_CELLS);
}

// ---- legacy / corrupt input: malformed cells become empty, the row keeps its length
{
  const row = sanitizeRow([{ k: 'skill', id: 'a' }, { k: 'bogus', id: 'b' }, null, 7, { k: 'mat' }, { k: 'mat', id: 'pot_hp_1' }]);
  check('sanitize keeps valid cells', sameCell(row[0], skill('a')) && sameCell(row[5], mat('pot_hp_1')));
  check('sanitize drops malformed cells', row[1] === null && row[3] === null && row[4] === null);
  check('sanitize pads to the cell count', row.length === BAR_CELLS && sanitizeRow(undefined).every((c) => c === null));
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
