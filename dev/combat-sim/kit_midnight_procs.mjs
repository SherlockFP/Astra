// KIT procs and resources (WoW Midnight direction): one runtime check per generic mechanic, through the real SkillSystem.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_midnight_procs.mjs
// Implemented: kit.midnight.stormkeeper (2 instant Lightning Bolts), kit.midnight.windfury (next Stormstrike +20 %, consumed),
// kit.midnight.lava_surge (instant Lava Burst, consumed), kit.midnight.rime (free Howling Blast), kit.midnight.killing_machine
// (free forced-crit Obliterate), kit.midnight.apocalypse (spends Festering Wounds, one ghoul each), kit.midnight.havoc (spell copies
// to the Havoc mark), kit.midnight.hog (shards spent = imps), kit.midnight.tyrant (demons empowered), kit.midnight.frenzy (Barbed
// Shot stacks), kit.midnight.sheilun (stacks spent on the injured party), kit.midnight.time_skip (cooldowns reset),
// kit.midnight.bar2 (second-bar defaults are real skills of their spec).
import * as H from './harness.mjs';

const { G, SKILLS, errors } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { Minions } = await H.imp('combat/Minions.ts');
const { resolveProcMods } = await H.imp('combat/procMods.ts');
const { DEFAULT_BAR2_BY_SPEC } = await H.imp('data/defaultExtraBar.ts');
const { ProcEngine, collectProcs } = await H.imp('combat/Procs.ts');
const { parseFx, fxContext } = await H.imp('data/talentTrees/fx.ts');
const { STATUSES } = await H.imp('data/statuses.ts');
const FX_CTX = fxContext(Object.keys(SKILLS), Object.keys(STATUSES));
G.minions = new Minions();

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};

/** A player of a class and spec on a fresh world, full resource, a dummy 2.2 m ahead unless `ahead` is given. */
function setup(classId, specId, level = 30) {
  const p = H.addPlayer(classId, level);
  const spec = SPECS[specId];
  p.spec = specId;
  p.yaw = 0;
  p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  G.character.save.skillBar = { ...spec.defaultBar };
  G.character.save.majorCd = { m45: 0, m90: 0, m180: 0 };
  G.character.save.spec = specId;
  G.talents = { grantedSkills: () => Object.keys(spec.treeSkills ?? {}), skillPick: () => 0 };
  G.minions.clearAll('scene');
  // the spec fx (T rows: proc triggers) become the proc entries, as CharacterState.recomputeStats does in the game
  G.procs = new ProcEngine();
  G.procs.setEntries(collectProcs(parseFx(spec.fx ?? '', FX_CTX).items, specId));
  H.step(2);
  p.resource = 100;
  return p;
}
const foeAt = (z, hp = 1e9) => {
  const e = H.addEnemy(0, z, { hp });
  e.maxHp = hp;
  e.hp = hp;
  return e;
};
const cast = (p, id, e = null) => { p.resource = 100; return G.skills.tryCast(p, id, H.aimFor(p, e)); };
const runes = (p) => G.skills.pipCount(p, 'rune');
const cdOf = (p, id) => G.skills.states.get(p.id)?.cds.get(id);

// ---- kit.midnight.stormkeeper: the next two Lightning Bolts are instant, the third is a normal cast
{
  const p = setup('shaman', 'shaman_elemental');
  const foe = foeAt(12);
  H.setAimTarget(foe);
  p.statuses.apply('stormkeeper', 20, { stacks: 2 });
  const r1 = cast(p, 'shaman_lightning_bolt', foe); const i1 = !p.cast; H.stepSec(1.6);
  const r2 = cast(p, 'shaman_lightning_bolt', foe); const i2 = !p.cast; H.stepSec(1.6);
  ok('kit.midnight.stormkeeper the first two Lightning Bolts are instant', r1 && r2 && i1 && i2, `r=${r1},${r2} instant=${i1},${i2}`);
  ok('kit.midnight.stormkeeper the two stacks are spent and the status ends', !p.statuses.has('stormkeeper'));
  const r3 = cast(p, 'shaman_lightning_bolt', foe);
  ok('kit.midnight.stormkeeper a third Lightning Bolt is a normal (cast-time) cast', r3 && !!p.cast);
  H.stepSec(2);
}

// ---- kit.midnight.windfury: a melee proc that empowers the next Stormstrike once
{
  const p = setup('shaman', 'shaman_enhancement');
  const foe = foeAt(2.2);
  H.setAimTarget(foe);
  p.statuses.apply('windfury', 6, {});
  const mod = resolveProcMods(p.statuses, 'shaman_stormstrike');
  ok('kit.midnight.windfury the proc mod empowers Stormstrike (+20 %)', !!mod && Math.abs(mod.more - 1.2) < 1e-9, `more=${mod?.more}`);
  cast(p, 'shaman_stormstrike', foe);
  H.stepSec(1.2);
  ok('kit.midnight.windfury the next Stormstrike spends the proc', !p.statuses.has('windfury'));
  H.stepSec(8);
}

// ---- kit.midnight.lava_surge: the next Lava Burst is instant and resets its own cooldown
{
  const p = setup('shaman', 'shaman_elemental');
  const foe = foeAt(12);
  H.setAimTarget(foe);
  p.statuses.apply('lava_surge', 8, {});
  const r = cast(p, 'shaman_lava_burst', foe); const instant = !p.cast;
  H.stepSec(1.2);
  ok('kit.midnight.lava_surge the Lava Burst is instant and the proc is spent', r && instant && !p.statuses.has('lava_surge'), `instant=${instant}`);
  H.stepSec(2);
}

// ---- kit.midnight.rime / killing_machine: free Howling Blast and free forced-crit Obliterate (no runes spent)
{
  const p = setup('necromancer', 'necromancer_frost');
  const foe = foeAt(2.2);
  H.setAimTarget(foe);
  G.skills.consumePips(p, 'rune');
  ok('kit.midnight.rime without Rime Howling Blast needs a rune', cast(p, 'necro_howling_blast', foe) === false);
  p.statuses.apply('rime', 15, {});
  const r = cast(p, 'necro_howling_blast', foe);
  H.stepSec(1.2);
  ok('kit.midnight.rime the next Howling Blast costs no rune and the proc is spent', r === true && runes(p) === 0 && !p.statuses.has('rime'), `r=${r} runes=${runes(p)}`);
  H.stepSec(2);
  p.statuses.apply('killing_machine', 8, {});
  const m = resolveProcMods(p.statuses, 'necro_obliterate');
  const r2 = cast(p, 'necro_obliterate', foe);
  H.stepSec(1.2);
  ok('kit.midnight.killing_machine the next Obliterate is free and forced to crit', r2 === true && !!m?.forceCrit && m?.pipFree === true && !p.statuses.has('killing_machine'), `r=${r2}`);
  H.stepSec(2);
}

// ---- kit.midnight.apocalypse: spends every Festering Wounds stack on the target and summons one ghoul per stack
{
  const p = setup('necromancer', 'necromancer_summoner');
  const foe = foeAt(2.2);
  H.setAimTarget(foe);
  foe.statuses.apply('vile_contagion', 20, { stacks: 3 });
  G.skills.addPip(p, 'rune', 2);
  const r = cast(p, 'necro_apocalypse', foe);
  H.stepSec(1.2);
  const ghouls = G.minions.ownedBy(p.id, (m) => m.def.id === 'necro_lesser_ghoul').length;
  ok('kit.midnight.apocalypse spends the three Festering Wounds and summons three ghouls', r === true && !foe.statuses.has('vile_contagion') && ghouls === 3, `r=${r} ghouls=${ghouls}`);
  H.stepSec(2);
}

// ---- kit.midnight.havoc: a single-target spell on another enemy also strikes the Havoc mark
{
  const p = setup('warlock', 'warlock_destruction');
  const mark = foeAt(8);
  const other = foeAt(11);
  H.setAimTarget(mark);
  cast(p, 'warlock_havoc', mark);
  H.stepSec(1.2);
  const spell = Object.values(SKILLS).find((s) => s.classId === 'warlock' && s.behavior === 'kit_target_spell' && s.id !== 'warlock_havoc');
  const before = mark.hp;
  H.setAimTarget(other);
  const r = spell ? cast(p, spell.id, other) : false;
  H.stepSec(0.5);
  ok('kit.midnight.havoc a single-target spell on another enemy also hits the Havoc mark', r === true && mark.hp < before, `spell=${spell?.id} r=${r} dmg=${(before - mark.hp).toFixed(1)}`);
  H.stepSec(2);
}

// ---- kit.midnight.hog: Hand of Gul'dan summons one imp per shard spent (1-3 shards, 10 fragments each)
{
  const p = setup('warlock', 'warlock_demonology');
  G.skills.addPip(p, 'shard', 30);
  const r1 = cast(p, 'warlock_hand_of_guldan');
  H.stepSec(1.6);
  const imps1 = G.minions.ownedBy(p.id, (m) => m.def.id === 'warlock_wild_imp').length;
  ok('kit.midnight.hog three shards summon three imps and spend all of them', r1 === true && imps1 === 3 && G.skills.pipCount(p, 'shard') === 0, `r=${r1} imps=${imps1}`);
  H.stepSec(2);
  G.skills.addPip(p, 'shard', 10);
  const r2 = cast(p, 'warlock_hand_of_guldan');
  H.stepSec(1.6);
  const imps2 = G.minions.ownedBy(p.id, (m) => m.def.id === 'warlock_wild_imp').length;
  ok('kit.midnight.hog one shard summons one more imp', r2 === true && imps2 === imps1 + 1 && G.skills.pipCount(p, 'shard') === 0, `imps=${imps2}`);
  H.stepSec(2);
}

// ---- kit.midnight.tyrant: Demonic Tyrant empowers every active demon of the caster (minionDamagePct +25 % while it lasts)
{
  const p = setup('warlock', 'warlock_demonology');
  G.skills.addPip(p, 'shard', 20);
  cast(p, 'warlock_hand_of_guldan');
  H.stepSec(2);
  const before = p.getStat('minionDamagePct');
  cast(p, 'warlock_summon_demonic_tyrant');
  H.stepSec(0.5);
  const after = p.getStat('minionDamagePct');
  ok('kit.midnight.tyrant the tyrant empowers the active demons (+25 % minion damage)', p.statuses.has('demonic_power') && after - before >= 0.25 - 1e-9, `before=${before} after=${after}`);
  H.stepSec(2);
}

// ---- kit.midnight.frenzy: Barbed Shot stacks Vahşi Öfke on the owner (3 max); pets read it as attack speed
{
  const p = setup('archer', 'archer_beastmaster');
  const foe = foeAt(12, 1e9);
  H.setAimTarget(foe);
  cast(p, 'archer_barbed_shot', foe);
  H.stepSec(1.2);
  const s1 = p.statuses.stacks('frenzy');
  G.skills.resetCooldown(p, 'archer_barbed_shot'); // the 8 s cooldown is not what is under test: the stack is
  cast(p, 'archer_barbed_shot', foe);
  H.stepSec(1.2);
  const s2 = p.statuses.stacks('frenzy');
  ok('kit.midnight.frenzy each Barbed Shot adds a stack (1 then 2)', s1 === 1 && s2 === 2, `s1=${s1} s2=${s2}`);
  H.stepSec(2);
}

// ---- kit.midnight.sheilun: each Vivify / Enveloping Mist adds a stack; Sheilun's Gift spends them on the injured party
{
  const p = setup('monk', 'monk_mistweaver');
  p.hp = p.maxHp * 0.9;
  cast(p, 'monk_mw_vivify');
  H.stepSec(6.5);
  cast(p, 'monk_mw_enveloping_mist');
  H.stepSec(2);
  const stacks = p.statuses.stacks('sheilun_gift');
  p.hp = p.maxHp * 0.5;
  const r = cast(p, 'monk_mw_sheilun_gift');
  H.stepSec(1.2);
  ok('kit.midnight.sheilun Vivify and Enveloping Mist each add a stack', stacks === 2, `stacks=${stacks}`);
  ok('kit.midnight.sheilun the gift spends the stacks and heals the injured caster', r === true && p.statuses.stacks('sheilun_gift') === 0 && p.hp / p.maxHp > 0.5, `r=${r} hp=${(p.hp / p.maxHp).toFixed(3)}`);
  H.stepSec(2);
}

// ---- kit.midnight.time_skip: Zaman Atlatma makes every other cooldown ready again
{
  const p = setup('evoker', 'evoker_preservation');
  const r1 = cast(p, 'evoker_obsidian_scales');
  H.stepSec(2);
  const cdBefore = cdOf(p, 'evoker_obsidian_scales');
  const r2 = cast(p, 'evoker_time_skip');
  H.stepSec(1.2);
  const cdAfter = cdOf(p, 'evoker_obsidian_scales');
  ok('kit.midnight.time_skip the other cooldowns are ready again after Time Skip', r1 === true && r2 === true && !!cdBefore && cdAfter?.charges === cdAfter?.max, `before=${cdBefore?.charges}/${cdBefore?.max} after=${cdAfter?.charges}/${cdAfter?.max}`);
  H.stepSec(2);
}

// ---- kit.midnight.bar2: the second-bar defaults are skills of their spec (Shift+1..8, at most 8 keyed cells)
{
  const bad = [];
  for (const [specId, ids] of Object.entries(DEFAULT_BAR2_BY_SPEC)) {
    const spec = SPECS[specId];
    if (!spec) { bad.push(`${specId}:spec`); continue; }
    if (ids.length > 8) bad.push(`${specId}:>8`);
    for (const id of ids) if (!spec.skills.includes(id) || !SKILLS[id]) bad.push(`${specId}:${id}`);
  }
  ok('kit.midnight.bar2 every second-bar default is a skill of its spec', bad.length === 0, bad.join(',') || `${Object.keys(DEFAULT_BAR2_BY_SPEC).length} specs`);
}

ok('kit.midnight no script errors', errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
console.log(fails === 0 ? '\nkit.midnight: all checks PASS' : `\nkit.midnight: ${fails} FAIL`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
