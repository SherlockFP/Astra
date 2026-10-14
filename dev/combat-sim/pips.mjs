// NC35 checks (GDD_CLASSES_V2 §1.2): the generic pips API of SkillSystem.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/pips.mjs
// Covers: add / spend / consume / cap per PipDef, display scale (shards), decay (Çi), timed regen (rune), the combo wrapper,
// the class / spec pip lists the PipBar shows, and the reset on spec change / scene change. Every change must emit pips:changed.
import * as H from './harness.mjs';

const { G } = H;

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};

const changed = [];
G.events.on('pips:changed', (e) => changed.push({ ...e }));
const last = (id) => [...changed].reverse().find((e) => e.id === id);
const mark = () => changed.length;
const since = (n) => changed.slice(n);

// ---- holypower (paladin): cap 5, spend 3, consume the rest
{
  const p = H.addPlayer('paladin');
  const n0 = mark();
  G.skills.addPip(p, 'holypower', 7);
  ok('pips.holypower add is capped at 5', G.skills.pipCount(p, 'holypower') === 5);
  ok('pips.holypower add emits {points 5, max 5}', last('holypower')?.points === 5 && last('holypower')?.max === 5, JSON.stringify(last('holypower')));
  const n1 = mark();
  G.skills.addPip(p, 'holypower', 1);
  ok('pips.holypower add at the cap emits nothing', mark() === n1);
  ok('pips.holypower spend 3 succeeds', G.skills.spendPip(p, 'holypower', 3) === true && G.skills.pipCount(p, 'holypower') === 2);
  ok('pips.holypower spend emits points 2', last('holypower')?.points === 2);
  const n2 = mark();
  ok('pips.holypower spend 3 of 2 is refused', G.skills.spendPip(p, 'holypower', 3) === false && G.skills.pipCount(p, 'holypower') === 2);
  ok('pips.holypower a refused spend emits nothing', mark() === n2);
  ok('pips.holypower consumePips returns the rest', G.skills.consumePips(p, 'holypower') === 2 && G.skills.pipCount(p, 'holypower') === 0);
  ok('pips.holypower consume emits points 0', last('holypower')?.points === 0);
  ok('pips.holypower events were emitted', since(n0).length === 3, 'add, spend, consume = 3 events');
  ok('pips.holypower PipDef comes from the class row', G.skills.pipDef('holypower')?.color === '#ffe27a' && G.skills.pipMax(p, 'holypower') === 5);
}

// ---- shard (warlock): 50 fragments, 10 per shown pip
{
  const p = H.addPlayer('warlock');
  G.skills.addPip(p, 'shard', 25);
  ok('pips.shard 25 fragments report 2 shown pips of 5', last('shard')?.points === 2 && last('shard')?.max === 5, JSON.stringify(last('shard')));
  G.skills.addPip(p, 'shard', 100);
  ok('pips.shard is capped at 50 fragments', G.skills.pipCount(p, 'shard') === 50 && last('shard')?.points === 5);
}

// ---- chi (monk): decays -1 every 4 s after 8 s out of combat (class row, not TALENT_PIPS)
{
  const p = H.addPlayer('monk');
  G.skills.addPip(p, 'chi', 3);
  p.combatTimer = 30;
  const n0 = mark();
  H.stepSec(4.3);
  ok('pips.chi decays by 1 after 4 s out of combat', G.skills.pipCount(p, 'chi') === 2, `chi=${G.skills.pipCount(p, 'chi')}`);
  ok('pips.chi decay emits points 2', last('chi')?.points === 2 && mark() > n0);
  p.combatTimer = 0;
  H.stepSec(6);
  ok('pips.chi does not decay in combat', G.skills.pipCount(p, 'chi') === 2, `chi=${G.skills.pipCount(p, 'chi')}`);
}

// ---- rune (necromancer): every spent rune is back 10 s after it was spent (parallel timers), max 6
{
  const p = H.addPlayer('necromancer');
  p.pips = { rune: 0 };
  ok('pips.rune max is 6', G.skills.pipMax(p, 'rune') === 6);
  H.stepSec(5);
  const frac = G.skills.pipRegenFrac(p, 'rune');
  ok('pips.rune recharge progress is about half after 5 s', frac > 0.4 && frac < 0.6, `frac=${frac.toFixed(2)}`);
  H.stepSec(5.3);
  ok('pips.rune all 6 recharge in parallel within 10 s', G.skills.pipCount(p, 'rune') === 6, `rune=${G.skills.pipCount(p, 'rune')}`);
  ok('pips.rune regen emits points 6', last('rune')?.points === 6 && last('rune')?.max === 6, JSON.stringify(last('rune')));
  G.skills.addPip(p, 'rune', 10);
  ok('pips.rune cap 6', G.skills.pipCount(p, 'rune') === 6 && G.skills.pipRegenFrac(p, 'rune') === 0);
}

// ---- combo (rogue): the pip API is a wrapper over the combo points
{
  const p = H.addPlayer('rogue');
  H.step(2); // ActorState (combo points) is created by the first update
  G.skills.addPip(p, 'combo', 3);
  ok('pips.combo addPip feeds the combo points', G.skills.comboPoints(p) === 3 && G.skills.pipCount(p, 'combo') === 3);
  ok('pips.combo emits pips:changed {3, 5}', last('combo')?.points === 3 && last('combo')?.max === 5, JSON.stringify(last('combo')));
  ok('pips.combo spend 2 leaves 1', G.skills.spendPip(p, 'combo', 2) === true && G.skills.comboPoints(p) === 1 && last('combo')?.points === 1);
  G.skills.addCombo(p, 9);
  ok('pips.combo addCombo is capped at 5 and emits', G.skills.pipCount(p, 'combo') === 5 && last('combo')?.points === 5);
  ok('pips.combo consumePips = consumeCombo semantics', G.skills.consumePips(p, 'combo') === 5 && G.skills.comboPoints(p) === 0);
  p.spec = 'rogue_subtlety';
  ok('pips.combo cap is 6 for Gölge', G.skills.pipMax(p, 'combo') === 6);
}

// ---- activePips: what the PipBar shows per class / spec
{
  const names = (p) => G.skills.activePips(p).map((d) => d.id).join(',');
  ok('pips.active paladin = holypower', names(H.addPlayer('paladin')) === 'holypower');
  ok('pips.active monk = chi', names(H.addPlayer('monk')) === 'chi');
  ok('pips.active warlock = shard', names(H.addPlayer('warlock')) === 'shard');
  ok('pips.active necromancer = rune', names(H.addPlayer('necromancer')) === 'rune');
  ok('pips.active rogue = combo', names(H.addPlayer('rogue')) === 'combo');
  ok('pips.active barbarian = none', names(H.addPlayer('barbarian')) === '');
  let p = H.addPlayer('rogue'); p.spec = 'rogue_alchemist';
  ok('pips.active rogue alchemist = combo,karisim', names(p) === 'combo,karisim', names(p));
  p = H.addPlayer('knight'); p.spec = 'knight_blademaster';
  ok('pips.active knight blademaster = adalet', names(p) === 'adalet', names(p));
  p = H.addPlayer('mage'); p.spec = 'mage_arcane';
  ok('pips.active mage arcane = arcane', names(p) === 'arcane', names(p));
}

// ---- reset: spec change and scene change drop every counter and tell the HUD
{
  const p = H.addPlayer('monk');
  G.skills.addPip(p, 'chi', 4);
  const n0 = mark();
  G.events.emit('spec:changed', { entityId: p.id, spec: 'monk_windwalker' });
  ok('pips.reset spec:changed zeroes the counters', G.skills.pipCount(p, 'chi') === 0);
  ok('pips.reset spec:changed emits points 0', since(n0).some((e) => e.id === 'chi' && e.points === 0));

  G.skills.addPip(p, 'chi', 2);
  const q = H.addPlayer('rogue');
  H.step(2);
  G.skills.addCombo(q, 4);
  G.skills.addPip(q, 'karisim', 2);
  const n1 = mark();
  G.events.emit('scene:leaving', {});
  ok('pips.reset scene:leaving zeroes combo and the other pips', G.skills.comboPoints(q) === 0 && G.skills.pipCount(q, 'karisim') === 0);
  ok('pips.reset scene:leaving emits points 0 for both', since(n1).some((e) => e.id === 'combo' && e.points === 0) && since(n1).some((e) => e.id === 'karisim' && e.points === 0));
}

// ---- level 1 (owner rule): every mage spec starts at level 1 with >= 4 usable core skills on its bar (basic / auto attack excluded)
{
  const { SPECS: MAGE_SPECS } = await H.imp('data/specs.ts');
  for (const sid of ['mage_fire', 'mage_frost', 'mage_arcane']) {
    const spec = MAGE_SPECS[sid];
    const l1 = Object.entries(spec.defaultBar).filter(([slot, id]) => slot !== 'lmb' && id !== spec.basic && H.SKILLS[id]?.unlockLevel <= 1 && (spec.unlock?.[id] ?? 1) <= 1);
    ok(`mage.l1 ${sid} level 1 has >= 4 usable skills`, l1.length >= 4, l1.map(([s, id]) => `${s}=${id}`).join(','));
  }
}

console.log(fails === 0 ? '\npips: all checks PASS' : `\npips: ${fails} FAIL`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
