// SKILL POINTS checks (Yetenek Puanı: systems/SkillPoints.ts, CharacterState.spendSkillPoint / resetSkillPoints / grantSkillPoints,
// Progression.onLevelUp grant, skillRanks damage/cooldown effect, Beceri Kitabı cap). No browser, no server.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/skillpoints.mjs     (V=1 prints every PASS)
import * as H from './harness.mjs';

const { G, CLASSES, SKILLS } = H;
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { Progression } = await H.imp('systems/Progression.ts');
const SP = await H.imp('systems/SkillPoints.ts');
const SR = await H.imp('combat/skillRanks.ts');
const { LEVEL_CAP } = await H.imp('types/character.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

const KNIGHT_SKILLS = CLASSES.knight.skills;
const first = KNIGHT_SKILLS[0];
const lateSkill = KNIGHT_SKILLS.find((id) => (SKILLS[id]?.unlockLevel ?? 99) > 6);
G.progression = new Progression();
G.input.bindingLabel = () => 'K'; // the harness input stub has no key labels (the real Input does)

// ------------------------------------------------------------------------------------------------ cap / pure helpers
const capRows = [[0, 1], [1, 1], [5, 1], [6, 2], [11, 2], [12, 3], [54, 10], [60, 10]];
for (const [lvl, want] of capRows) ok(`cap.level-${lvl}`, SP.skillRankCapAt(lvl) === want, `got ${SP.skillRankCapAt(lvl)}`);
ok('cap.never-above-10', SP.skillRankCapAt(999) === 10);
ok('earn.level-1-is-0', SP.skillPointsForLevel(1) === 0 && SP.skillPointsForLevel(60) === LEVEL_CAP - 1);
ok('effect.damage-rank-3', near(SR.skillRankDamageMultOf(3), 1.1), `${SR.skillRankDamageMultOf(3)}`);
ok('effect.damage-rank-10', near(SR.skillRankDamageMultOf(10), 1.45));
ok('effect.cooldown-rank-3', near(SR.skillRankCooldownMultOf(3), 0.96));
ok('effect.cooldown-rank-10', near(SR.skillRankCooldownMultOf(10), 0.82));
ok('effect.rank-1-neutral', SR.skillRankDamageMultOf(1) === 1 && SR.skillRankCooldownMultOf(1) === 1);
ok('effect.rank-clamped', SR.skillRankDamageMultOf(99) === SR.skillRankDamageMultOf(10) && SR.skillRankCooldownMultOf(0) === 1);

// ------------------------------------------------------------------------------------------------ create / beta
{
  const ch = CharacterState.create('SpNew', 'knight');
  ok('create.new-starts-empty', ch.save.skillPts?.earned === 0 && ch.save.skillPts?.spent === 0 && ch.save.flags[SP.SKILL_POINTS_FLAG] === 1);
  const beta = CharacterState.create('SpBeta', 'knight', 0, undefined, { beta: true });
  ok('create.beta-starts-with-all-points', beta.save.skillPts.earned === LEVEL_CAP - 1 && SP.skillPointsFree(beta.save) === LEVEL_CAP - 1, `earned=${beta.save.skillPts.earned}`);
}

// ------------------------------------------------------------------------------------------------ migration (old saves)
{
  const old = { version: 2, id: 'old1', name: 'Old', classId: 'knight', level: 10, xp: 0, gold: 0, skillRanks: { [first]: 3, q: 2 }, flags: {}, materials: {}, equipment: {}, bag: [], stash: [], talents: [], skillBar: {} };
  const n = CharacterState.normalize(old);
  ok('migrate.old-save-earned', n.skillPts.earned === 9 - (2 + 1), `earned=${n.skillPts.earned}`);
  ok('migrate.old-save-flag', n.flags[SP.SKILL_POINTS_FLAG] === 1);
  n.skillPts.earned = 42;
  CharacterState.normalize(n);
  ok('migrate.runs-once', n.skillPts.earned === 42);
  const lvl1 = CharacterState.normalize({ version: 2, id: 'old2', name: 'L1', classId: 'knight', level: 1, xp: 0, gold: 0, skillRanks: {}, flags: {}, materials: {}, equipment: {}, bag: [], stash: [], talents: [], skillBar: {} });
  ok('migrate.level-1-no-points', lvl1.skillPts.earned === 0 && lvl1.skillPts.spent === 0);
}

// ------------------------------------------------------------------------------------------------ level-up grant (Progression.addXp)
{
  const ch = CharacterState.create('SpLvl', 'knight');
  G.character = ch;
  const pr = G.progression;
  pr.addXp(pr.xpToNext(1));
  ok('levelup.one-level-one-point', ch.level === 2 && ch.save.skillPts.earned === 1, `level=${ch.level} earned=${ch.save.skillPts.earned}`);
  pr.addXp(pr.xpToNext(2) + pr.xpToNext(3));
  ok('levelup.multi-level-points', ch.level === 4 && ch.save.skillPts.earned === 3, `level=${ch.level} earned=${ch.save.skillPts.earned}`);
  ok('levelup.grant-event-toast-safe', SP.skillPointsFree(ch.save) === 3);
}

// ------------------------------------------------------------------------------------------------ spend / cap / unlock / no points
{
  const ch = CharacterState.create('SpSpend', 'knight');
  G.character = ch;
  ch.save.level = 6;
  ch.save.skillPts.earned = 5;
  const r1 = ch.spendSkillPoint(first);
  ok('spend.first-rank', r1.ok && r1.rank === 2 && ch.save.skillRanks[first] === 2, JSON.stringify(r1));
  const r2 = ch.spendSkillPoint(first);
  ok('spend.capped-at-level-6', !r2.ok && ch.save.skillRanks[first] === 2, r2.reason);
  ch.save.level = 12;
  const r3 = ch.spendSkillPoint(first);
  ok('spend.cap-rises-with-level', r3.ok && r3.rank === 3, JSON.stringify(r3));
  ok('spend.counts-spent', ch.save.skillPts.spent === 2 && ch.save.skillPts.by[first] === 2 && SP.skillPointsFree(ch.save) === 3);
  if (lateSkill) {
    const rl = ch.spendSkillPoint(lateSkill);
    ok('spend.locked-skill-refused', !rl.ok, rl.reason);
  }
  ok('spend.unknown-skill-refused', !ch.spendSkillPoint('no_such_skill').ok);
  ch.save.skillPts.spent = ch.save.skillPts.earned;
  const rn = ch.spendSkillPoint(first);
  ok('spend.no-points-refused', !rn.ok && SP.skillPointsFree(ch.save) === 0, rn.reason);
}

// ------------------------------------------------------------------------------------------------ Beceri Kitabı shares the cap
{
  const ch = CharacterState.create('SpBook', 'knight');
  G.character = ch;
  ch.save.level = 6;
  ch.save.materials['beceri_kitabi_3'] = 2;
  ch.save.skillRanks[first] = 2;
  const rb = ch.readSkillBook('beceri_kitabi_3', first);
  ok('book.cap-still-applies', !rb.ok && ch.save.skillRanks[first] === 2, rb.reason);
  ch.save.level = 12;
  const rb2 = ch.readSkillBook('beceri_kitabi_3', first);
  ok('book.raises-under-cap', rb2.ok && rb2.rank === 3, JSON.stringify(rb2));
}

// ------------------------------------------------------------------------------------------------ Sıfırla (refund)
{
  const ch = CharacterState.create('SpReset', 'knight');
  G.character = ch;
  ch.save.level = 12;
  ch.save.skillPts.earned = 10;
  ch.save.gold = 1000;
  const q = KNIGHT_SKILLS.find((id) => id !== first && (SKILLS[id]?.unlockLevel ?? 99) <= 12);
  ch.spendSkillPoint(first);
  ch.spendSkillPoint(first);
  ch.save.skillRanks[q] = 2; // from a Beceri Kitabı, not from points
  ch.save.materials['beceri_kitabi_1'] = 1;
  const rq = ch.readSkillBook('beceri_kitabi_1', q);
  ok('reset.setup-book-read', rq.ok, `${rq.reason} (${q})`);
  const cost = SP.skillResetCost(12);
  const rr = ch.resetSkillPoints();
  ok('reset.refunds-points', rr.ok && rr.refunded === 2 && rr.cost === cost, JSON.stringify(rr));
  ok('reset.gold-paid', ch.save.gold === 1000 - cost, `gold=${ch.save.gold}`);
  ok('reset.point-ranks-back-to-1', ch.save.skillRanks[first] === undefined);
  ok('reset.book-rank-kept', ch.save.skillRanks[q] === 3, `rank=${ch.save.skillRanks[q]}`);
  ok('reset.counters-cleared', ch.save.skillPts.spent === 0 && Object.keys(ch.save.skillPts.by).length === 0 && SP.skillPointsFree(ch.save) === 10);
  const again = ch.resetSkillPoints();
  ok('reset.nothing-to-refund', !again.ok && ch.save.gold === 1000 - cost);
  ch.spendSkillPoint(first);
  ch.save.gold = 1;
  const broke = ch.resetSkillPoints();
  ok('reset.needs-gold', !broke.ok && ch.save.skillRanks[first] === 2 && ch.save.gold === 1, broke.reason);
}

// ------------------------------------------------------------------------------------------------ effect on the local combat numbers
{
  const ch = CharacterState.create('SpFx', 'knight');
  G.character = ch;
  ch.save.level = 12;
  ch.save.skillPts.earned = 2;
  ch.spendSkillPoint(first);
  ch.spendSkillPoint(first);
  ok('fx.local-damage-rank-3', near(SR.skillRankDamageMult(first), 1.1), `${SR.skillRankDamageMult(first)}`);
  ok('fx.local-cooldown-rank-3', near(SR.skillRankCooldownMult(first), 0.96), `${SR.skillRankCooldownMult(first)}`);
}

console.log(`skillpoints: ${passes} passed, ${fails} failed`);
H.restoreConsole();
console.log(fails === 0 ? 'PASS' : 'FAIL');
process.exit(fails === 0 ? 0 : 1);
