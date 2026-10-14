// KIT PK-ROGUE checks (docs/kits/casters-rogue.md §h PK-ROGUE). Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_rogue.mjs
// Implemented: kit.rogue.ids, kit.rogue.apl, kit.rogue.shadowstep (lands behind a target facing +Z-away from the caster).
// Not implemented here: kit.rogue.budget (needs SimBench), kit.rogue.positional, kit.rogue.replaces, kit.rogue.combo, kit.rogue.link.
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { ROTATIONS_KIT_ROGUE } = await H.imp('data/rotations_kit_rogue.ts');
const { STATUSES } = await H.imp('data/statuses.ts');

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};

// ---- kit.rogue.ids: every id on the three rogue specs resolves to a skill
for (const sid of ['rogue_assassin', 'rogue_outlaw', 'rogue_subtlety']) {
  const s = SPECS[sid];
  ok(`kit.rogue.ids ${sid} spec exists`, !!s);
  if (!s) continue;
  const ids = [...s.skills, ...Object.values(s.defaultBar), ...Object.values(s.majors)];
  const missing = ids.filter((id) => !SKILLS[id]);
  ok(`kit.rogue.ids ${sid} skills resolve`, missing.length === 0, missing.join(','));
  ok(`kit.rogue.ids ${sid} bar has at most 12 slots`, Object.keys(s.defaultBar).length <= 12);
}

// ---- kit.rogue.apl: every skill and status named in the APL rows exists
for (const [sid, apl] of Object.entries(ROTATIONS_KIT_ROGUE)) {
  const lines = [...apl.st, ...(apl.aoe ?? [])];
  const skillIds = new Set();
  const statusIds = new Set();
  for (const l of lines) {
    for (const m of l.matchAll(/\b(rogue_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/status:([a-z_]+)/g)) statusIds.add(m[1]);
  }
  const badSkills = [...skillIds].filter((id) => !SKILLS[id]);
  ok(`kit.rogue.apl ${sid} skill ids resolve`, badSkills.length === 0, badSkills.join(','));
  // statuses that are created at runtime by watchers / procs are allowed by name
  const runtime = new Set(['shadow_veil_cd', 'stealth', 'improved_garrote', 'elixir_ramp', 'garrote', 'rupture', 'deathmark', 'kingsbane']);
  const badStatus = [...statusIds].filter((id) => !STATUSES[id] && !runtime.has(id));
  ok(`kit.rogue.apl ${sid} status ids resolve`, badStatus.length === 0, badStatus.join(','));
}

// ---- kit.rogue.shadowstep: from 6 m in front, the caster lands 1.2 m (or more when bodies overlap) behind a target facing away
{
  const p = H.addPlayer('rogue');
  const e = H.addEnemy(0, 6);
  H.step(2);
  p.position.set(0, 0, 0);
  p.yaw = 0;
  p.resource = 100;
  p.hp = p.maxHp;
  e.yaw = Math.PI; // enemy faces -Z, toward the caster; its back is at +Z
  const bar = G.character.save.skillBar;
  const slot = 's2';
  bar[slot] = 'rogue_shadow_step';
  H.setAimTarget(e);
  H.clearEvents();
  errors.length = 0;
  H.tap(slot);
  H.stepSec(0.6);
  const fails1 = events['skill:fail'].map((f) => f.reason);
  const dz = p.position.z - e.position.z;
  ok('kit.rogue.shadowstep casts without a fail', fails1.length === 0, fails1.join(','));
  ok('kit.rogue.shadowstep lands behind the target (+Z side, >= 1.2 m)', dz >= 1.15 && Math.abs(p.position.x - e.position.x) < 0.5,
    `dz=${dz.toFixed(2)} dx=${(p.position.x - e.position.x).toFixed(2)}`);
  ok('kit.rogue.shadowstep grants shadowstep_haste', p.statuses.has('shadowstep_haste'));
  ok('kit.rogue.shadowstep grants behind_grace', p.statuses.has('behind_grace'));
  if (errors.length) for (const m of errors.slice(0, 4)) console.log('   !!', m.slice(0, 300));
}

console.log(fails === 0 ? '\nkit.rogue: all checks PASS' : `\nkit.rogue: ${fails} FAIL`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
