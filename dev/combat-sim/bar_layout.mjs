#!/usr/bin/env node
/**
 * Default action-bar layout (src/data/barLayout.ts, owner rule 2026-10-16) for all 14 playable classes at L1 / L5 / L10 / L20:
 *   - every opening-kit skill is on the bar by L20 and nothing is on two slots;
 *   - rotation (builder, spender, filler) on keys 1-5 (rmb, q, e, r, s1); the first builder on 1, the first spender on 2;
 *   - interrupts, mobility, defensives, stances and cooldowns on Q / E / R (s2, s3, s4); majors on their own slot;
 *   - the bar at a lower level is a prefix of the bar at a higher level (no slot moves when a skill unlocks);
 *   - a new unlock placed by Progression's rule (placeSkill) on a customised bar never moves the player's skills.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/bar_layout.mjs
 *
 * Exit 0 = all PASS, 1 = a failed assertion.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const imp = (p) => import(pathToFileURL(`${ROOT}${p}`).href);

const { SKILLS } = await imp('src/data/skills.ts');
const { PLAYABLE_CLASSES, CLASSES } = await imp('src/data/classes.ts');
const { OPENING_KIT, classGrantOrder } = await imp('src/data/openingKit.ts');
const L = await imp('src/data/barLayout.ts');
const { CharacterState } = await imp('src/systems/CharacterState.ts');

let failures = 0;
function check(name, ok, msg = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${msg ? ' · ' + msg : ''}`);
}

const LEVELS = [1, 5, 10, 20];
const ROT = new Set(L.ROTATION_SLOTS);
const UTIL = new Set(L.UTILITY_SLOTS);
const MAJ = new Set(L.MAJOR_SLOTS);

for (const cls of PLAYABLE_CLASSES) {
  const kit = OPENING_KIT[cls] ?? [];
  check(`${cls}: opening kit has 8 bar rows`, kit.length === 8, `rows=${kit.length}`);
  const bars = Object.fromEntries(LEVELS.map((lv) => [lv, CharacterState.defaultBar(cls, lv)]));
  const bar20 = bars[20];

  // no duplicate ids, every kit row placed by L20
  for (const lv of LEVELS) {
    const ids = Object.entries(bars[lv]).filter(([k]) => k !== 'lmb').map(([, id]) => id);
    check(`${cls} L${lv}: no skill on two slots`, new Set(ids).size === ids.length);
    check(`${cls} L${lv}: lmb is the basic attack`, bars[lv].lmb === CLASSES[cls].basicAttack, `${bars[lv].lmb}`);
  }
  const placed = new Set(Object.values(bar20));
  const missing = kit.map(([id]) => id).filter((id) => !placed.has(id));
  check(`${cls}: every kit skill is on the bar by L20`, missing.length === 0, missing.join(' '));

  // role placement rules at L20 (majors excluded)
  for (const [slot, id] of Object.entries(bar20)) {
    if (slot === 'lmb' || !id) continue;
    const def = SKILLS[id];
    if (!def || MAJ.has(slot)) continue;
    const role = L.barRole(def);
    // a skill may overflow into the other group only when its own group is full (the Q/E/R or the 1-5 keys are all taken)
    const wantRotation = role === 'builder' || role === 'rotational' || role === 'spender';
    const home = wantRotation ? ROT : UTIL;
    const away = wantRotation ? UTIL : ROT;
    const homeFull = [...home].every((k) => bar20[k]);
    check(`${cls}: ${id.replace(cls + '_', '')} (${role}) on ${slot}`, home.has(slot) || (away.has(slot) && homeFull));
  }

  // first builder on 1 and first spender on 2 (when the class has them)
  const firstBuilder = kit.map(([id]) => SKILLS[id]).find((d) => d && L.barRole(d) === 'builder');
  const firstSpender = kit.map(([id]) => SKILLS[id]).find((d) => d && L.barRole(d) === 'spender');
  if (firstBuilder) check(`${cls}: a builder is on 1 (rmb)`, bar20.rmb === firstBuilder.id || (bar20.rmb && L.barRole(SKILLS[bar20.rmb]) === 'builder'), `rmb=${bar20.rmb}`);
  if (firstSpender) check(`${cls}: a spender is on 2 (q)`, bar20.q === firstSpender.id || (bar20.q && L.barRole(SKILLS[bar20.q]) === 'spender'), `q=${bar20.q}`);

  // interrupts and mobility are on Q / E / R
  for (const id of Object.values(bar20)) {
    const def = id ? SKILLS[id] : undefined;
    if (!def || !['interrupt', 'mobility'].includes(L.barRole(def))) continue;
    const slot = Object.keys(bar20).find((k) => bar20[k] === id);
    const homeFull = [...UTIL].every((k) => bar20[k]);
    check(`${cls}: ${id.replace(cls + '_', '')} on Q/E/R (or Q/E/R full)`, !!slot && (UTIL.has(slot) || homeFull), `slot=${slot}`);
  }

  // prefix stability: the bar at a lower level is contained in the bar above it (same slots)
  for (let i = 0; i + 1 < LEVELS.length; i++) {
    const lo = bars[LEVELS[i]], hi = bars[LEVELS[i + 1]];
    const moved = Object.entries(lo).filter(([k, id]) => id && hi[k] !== id).map(([k]) => k);
    check(`${cls}: L${LEVELS[i]} -> L${LEVELS[i + 1]} moves nothing`, moved.length === 0, moved.join(' '));
  }

  // Progression's rule (one placeSkill per unlock, grant order) rebuilds the same bar as the default at L20
  const grown = { lmb: CLASSES[cls].basicAttack };
  const { candidates, majors } = L.barCandidates(kit, classGrantOrder(cls), SKILLS);
  const reserved = L.reservedSlots(candidates);
  for (const c of L.grantSort([...candidates, ...majors]).filter((x) => x.unlock <= 20)) L.placeSkill(grown, c.id, c.def, reserved);
  const same = JSON.stringify(Object.entries(grown).sort()) === JSON.stringify(Object.entries(bar20).filter(([, v]) => v).sort());
  check(`${cls}: unlock-by-unlock placement == default bar at L20`, same);

  // a customised bar keeps the player's slots when a new skill unlocks
  const custom = { lmb: CLASSES[cls].basicAttack };
  const late = L.grantSort([...candidates, ...majors]);
  const before = late.filter((c) => c.unlock <= 5);
  for (const c of before) L.placeSkill(custom, c.id, c.def, reserved);
  // the player swaps two rotation slots, then a level-10 skill arrives
  const keys = ['rmb', 'q', 'e', 'r', 's1'].filter((k) => custom[k]);
  if (keys.length >= 2) {
    const a = keys[0], b = keys[1];
    [custom[a], custom[b]] = [custom[b], custom[a]];
  }
  const snap = { ...custom };
  for (const c of late.filter((x) => x.unlock > 5 && x.unlock <= 10)) if (!Object.values(custom).includes(c.id)) L.placeSkill(custom, c.id, c.def, reserved);
  const kept = Object.entries(snap).filter(([, id]) => id).every(([k, id]) => custom[k] === id);
  check(`${cls}: customised bar keeps its slots on a new unlock`, kept);
}

// migration (Save.ts migrateDefaultBar, bar layout rev 1): an untouched old default moves, a customised bar stays
{
  const { normaliseCharacterSave } = await imp('src/core/Save.ts');
  const { LEGACY_KIT_SLOTS } = L;
  const oldBar = (cls, level) => {
    const bar = { lmb: CLASSES[cls].basicAttack };
    for (const [id, slot, lvl] of OPENING_KIT[cls] ?? []) if (lvl <= level) bar[LEGACY_KIT_SLOTS[id] ?? slot] = id;
    return bar;
  };
  const mk = (cls, level, skillBar) => ({ id: 'mig', name: 'Mig', classId: cls, level, xp: 0, spec: null, flags: {}, skillBar, skillRanks: {}, equipment: {}, bag: [], materials: {}, talents: [], talentRefunds: 0, mythic: { rating: 0 } });
  for (const cls of ['knight', 'mage', 'warlock']) {
    const { candidates, majors } = L.barCandidates(OPENING_KIT[cls], classGrantOrder(cls), SKILLS);
    for (const level of [1, 5]) {
      const s = normaliseCharacterSave(mk(cls, level, oldBar(cls, level)));
      const want = L.layoutDefaultBar(CLASSES[cls].basicAttack, candidates, level, majors);
      const kitOnly = (bar) => Object.entries(bar).filter(([k, id]) => k !== 'lmb' && id && id.startsWith(cls + '_') && !L.MAJOR_SLOTS.includes(k)).sort().map((x) => x.join('=')).join(' ');
      check(`migrate ${cls} L${level}: untouched old default moves to the new layout`, kitOnly(s?.skillBar ?? {}) === kitOnly(want), kitOnly(s?.skillBar ?? {}));
    }
    const player = normaliseCharacterSave(mk(cls, 5, { lmb: CLASSES[cls].basicAttack, rmb: `${cls}_nope` }));
    check(`migrate ${cls}: a customised bar is kept`, player?.skillBar.rmb === `${cls}_nope`);
  }
}

// role table sanity for the rule itself
const probe = (over) => L.barRole({ id: 'x', classId: 'knight', name: 'x', desc: '', icon: '', unlockLevel: 1, cost: 0, cooldown: 0, castTime: 0, anim: '', targeting: 'self_buff', tags: [], ...over });
check('role: interrupt beats cooldown', probe({ behavior: 'interrupt', cooldown: 15 }) === 'interrupt');
check('role: a 30 s cooldown is a cooldown', probe({ cooldown: 30, targeting: 'self_aoe', tags: ['aoe'] }) === 'cooldown');
check('role: negative cost is a builder', probe({ cost: -5, targeting: 'self_aoe', tags: ['aoe'] }) === 'builder');
check('role: dash is mobility', probe({ targeting: 'dash', tags: ['offgcd'] }) === 'mobility');

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
