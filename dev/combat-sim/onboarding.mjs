// FIRST-10-MINUTES GUIDE checks (systems/onboarding.ts state machine, data/skillNamesEn.ts, ui/hud/ControlsOverlay.ts wiring is
// covered by tools/controls-check.mjs). No browser, no server. Stages: steps.* (order, anchors, gated finder) | events.* (each step
// completes on its own event, wrong events do nothing) | skills.* (4 distinct bar keys) | flags.* (append-only save, round trip)
// | gate.* (beta never, skipped / finished never, legacy high-level characters) | names.* (tooltip English names)
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/onboarding.mjs     (V=1 prints every PASS)
import * as H from './harness.mjs';

const OB = await H.imp('systems/onboarding.ts');
const { SKILL_NAMES_EN, skillDisplayName } = await H.imp('data/skillNamesEn.ts');
const { SKILLS } = H;

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

const { GUIDE_STEPS, applyEvent, activeStep, allDone, flagsToWrite, guideWanted, progressOf, stateFromFlags } = OB;
const IDS = GUIDE_STEPS.map((s) => s.id);
const EMPTY = { done: [], slots: [], skipped: false };
const LVL = 10;

// Drives the state machine with a sequence of events and returns the final state.
function run(events, level = LVL, state = EMPTY) {
  return events.reduce((st, ev) => applyEvent(st, ev, level), state);
}
// The events that complete each step, in order.
const EV = {
  move: { k: 'move' },
  talk: { k: 'talk' },
  accept: { k: 'accept' },
  attack: { k: 'hit' },
  loot: { k: 'loot' },
  bag: { k: 'panel', panel: 'inventory', open: true },
  equip: { k: 'equip' },
  sp: { k: 'sp' },
  turnin: { k: 'turnin' },
  map: { k: 'panel', panel: 'map', open: true },
  finder: { k: 'panel', panel: 'finder', open: true },
};
const SKILL_SEQ = ['rmb', 'q', 'e', 'r'].map((slot) => ({ k: 'cast', slot }));
const FULL = [EV.move, EV.talk, EV.accept, EV.attack, ...SKILL_SEQ, EV.loot, EV.bag, EV.equip, EV.sp, EV.turnin, EV.map, EV.finder];

// ------------------------------------------------------------------------------------------------ steps
{
  ok('steps.count 12', GUIDE_STEPS.length === 12, `got ${GUIDE_STEPS.length}`);
  ok('steps.order spec', JSON.stringify(IDS) === JSON.stringify(['move', 'talk', 'accept', 'attack', 'skills', 'loot', 'bag', 'equip', 'sp', 'turnin', 'map', 'finder']), IDS.join(','));
  ok('steps.ids unique', new Set(IDS).size === IDS.length);
  ok('steps.texts non-empty turkish', GUIDE_STEPS.every((s) => s.title.length > 0 && s.text.length > 0));
  ok('steps.finder gated at 8', GUIDE_STEPS.find((s) => s.id === 'finder').minLevel === 8);
  const first = activeStep(EMPTY, 1);
  ok('steps.first is move', first?.id === 'move');
  ok('steps.progress empty 0/11 at level 1', (() => { const p = progressOf(EMPTY, 1); return p.done === 0 && p.total === 11; })());
  ok('steps.progress full 12 at level 8', progressOf(EMPTY, 8).total === 12);
}

// ------------------------------------------------------------------------------------------------ events: each step on its own event
for (const id of IDS) {
  if (id === 'skills') continue;
  const ev = EV[id];
  // complete the steps before it, then the target step on its own event
  const before = IDS.slice(0, IDS.indexOf(id));
  let st = EMPTY;
  for (const b of before) {
    if (b === 'skills') st = run(SKILL_SEQ, LVL, st);
    else st = run([EV[b]], LVL, st);
  }
  ok(`events.${id} is the active step`, activeStep(st, LVL)?.id === id, `active=${activeStep(st, LVL)?.id}`);
  const after = applyEvent(st, ev, LVL);
  ok(`events.${id} completes on its event`, after.done.includes(id));
  // a wrong event never completes it
  const wrong = applyEvent(st, { k: 'panel', panel: 'questlog', open: true }, LVL);
  ok(`events.${id} ignores unrelated events`, !wrong.done.includes(id));
}

// the steps only advance in order: an event for a later step does nothing now
{
  const st = applyEvent(EMPTY, EV.loot, LVL);
  ok('events.out-of-order loot ignored at move', st === EMPTY || !st.done.includes('loot'));
  const st2 = applyEvent(EMPTY, EV.move, LVL);
  ok('events.move completes first step', st2.done.join() === 'move');
}

// a full run completes every step and the guide reports allDone
{
  const st = run(FULL, 8);
  ok('events.full run allDone', allDone(st), `done=${st.done.length}`);
  ok('events.full run has no active step', activeStep(st, 8) === null);
}

// finder is gated: below level 8 the run stops before it and the guide waits (not done)
{
  const st = run(FULL.slice(0, -1), 5);
  ok('events.gated finder waits below level 8', activeStep(st, 5) === null && !allDone(st));
  ok('events.gated finder counts at level 8', (() => {
    const after = run(FULL.slice(0, -1), 8);
    return activeStep(after, 8)?.id === 'finder' && applyEvent(after, EV.finder, 8).done.includes('finder');
  })());
}

// ------------------------------------------------------------------------------------------------------ skills
{
  let st = run(['move', 'talk', 'accept', 'attack'].map((k) => EV[k]));
  // the same bar key used twice counts once
  st = run([{ k: 'cast', slot: 'q' }, { k: 'cast', slot: 'q' }, { k: 'cast', slot: 'q' }], LVL, st);
  ok('skills.repeat key counts once', !st.done.includes('skills') && st.slots.join() === 'q', `slots=${st.slots}`);
  st = run([{ k: 'cast', slot: 'rmb' }, { k: 'cast', slot: 'e' }], LVL, st);
  ok('skills.three distinct not yet done', !st.done.includes('skills') && st.slots.length === 3);
  st = run([{ k: 'cast', slot: 'r' }], LVL, st);
  ok('skills.four distinct completes', st.done.includes('skills'));
  // a non-bar slot (lmb auto-attack, potions) never counts
  let st2 = run(['move', 'talk', 'accept', 'attack'].map((k) => EV[k]));
  st2 = run([{ k: 'cast', slot: 'lmb' }, { k: 'cast', slot: 'm45' }, { k: 'cast', slot: 'q' }, { k: 'cast', slot: 'e' }, { k: 'cast', slot: 'r' }], LVL, st2);
  ok('skills.lmb and majors do not count', st2.slots.join() === 'q,e,r' && !st2.done.includes('skills'), `slots=${st2.slots}`);
}

// ------------------------------------------------------------------------------------------------------ flags
{
  const st = run(['move', 'talk'].map((k) => EV[k]));
  const w = flagsToWrite({}, st);
  ok('flags.write adds step flags', w.includes('onb.s.move') && w.includes('onb.s.talk') && !w.includes('onb.s.accept'), w.join(','));
  const flags = Object.fromEntries(w.map((k) => [k, 1]));
  const back = stateFromFlags(flags);
  ok('flags.round trip', back.done.join() === 'move,talk' && !back.skipped);
  ok('flags.append-only: set flag is not written again', flagsToWrite(flags, st).length === 0);
  ok('flags.append-only: a state with fewer steps writes nothing new', flagsToWrite(flags, { done: ['move'], slots: [], skipped: false }).length === 0);
  // skipping writes onb.skip and never removes a step flag
  const sk = { ...st, skipped: true };
  const wk = flagsToWrite(flags, sk);
  ok('flags.skip writes onb.skip only', wk.join() === 'onb.skip', wk.join(','));
  ok('flags.skipped state is read back', stateFromFlags({ ...flags, 'onb.skip': 1 }).skipped === true);
  // skills sub-progress flags
  const sk2 = { done: [], slots: ['q', 'e'], skipped: false };
  ok('flags.skill keys appended', flagsToWrite({}, sk2).join() === 'onb.k.q,onb.k.e');
  ok('flags.skill keys read back', stateFromFlags({ 'onb.k.q': 1 }).slots.join() === 'q');
  // finishing writes every step flag once
  const all = run(FULL, 8);
  const wa = flagsToWrite({}, all);
  ok('flags.full run writes 12 step flags + onb.done', wa.filter((f) => f.startsWith('onb.s.')).length === 12 && wa.includes('onb.done'));
  const lastW = flagsToWrite({}, { ...all, skipped: false });
  ok('flags.done flag only when all steps done', !flagsToWrite({}, st).includes('onb.done') && lastW.includes('onb.done'));
  // the flags never contain a key that could clear progress
  ok('flags.no removal keys', wa.every((f) => f.startsWith('onb.')));
}

// ----------------------------------------------------------------------------------------------------- gate
{
  ok('gate.new normal character runs', guideWanted({ level: 1, flags: {} }) === true);
  ok('gate.beta never runs', guideWanted({ beta: true, level: 1, flags: {} }) === false);
  ok('gate.beta at level 60 never runs', guideWanted({ beta: true, level: 60, flags: {} }) === false);
  ok('gate.skipped stays off', guideWanted({ level: 1, flags: { 'onb.skip': 1 } }) === false);
  ok('gate.finished stays off', guideWanted({ level: 9, flags: { 'onb.done': 1 } }) === false);
  ok('gate.a skipped state ignores events', applyEvent({ done: [], slots: [], skipped: true }, EV.move, LVL).done.length === 0);
  ok('gate.a finished run ignores events', applyEvent(run(FULL, 8), EV.move, 8).done.length === 12);
  ok('gate.boolean and string flags count as set', stateFromFlags({ 'onb.s.move': true, 'onb.s.talk': '1' }).done.join() === 'move,talk');
}

// ------------------------------------------------------------------------------------------------------ names
{
  ok('names.table has entries', Object.keys(SKILL_NAMES_EN).length >= 20);
  ok('names.table ids exist as skills', Object.keys(SKILL_NAMES_EN).every((id) => SKILLS[id]), Object.keys(SKILL_NAMES_EN).filter((id) => !SKILLS[id]).join(','));
  ok('names.adds english to a bare turkish name', skillDisplayName('paladin_rebuke', 'Azarlama') === 'Azarlama (Rebuke)');
  ok('names.keeps a name that already has english', skillDisplayName('mage_fireball', 'Ateş Topu (Fireball)') === 'Ateş Topu (Fireball)');
  ok('names.unknown id keeps turkish', skillDisplayName('nope_id', 'Bilinmeyen') === 'Bilinmeyen');
  ok('names.starter bars covered', ['knight_basic', 'mage_basic', 'paladin_basic', 'warlock_basic'].every((id) => SKILLS[id] && /\(.+\)/.test(SKILLS[id].name) || SKILL_NAMES_EN[id]));
}

console.log(`onboarding: ${passes} passed, ${fails} failed`);
H.restoreConsole();
console.log(fails === 0 ? 'PASS' : 'FAIL');
process.exit(fails === 0 ? 0 : 1);
