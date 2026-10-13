// GDD_LIFE §1 MVP gathering check (Madencilik, Bitki Toplama) headless. No browser, no server: the real data, the real
// systems/Professions.ts (pure helpers and the Professions service) and a fake character with a bag.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/gather.mjs
// Stages: cat.* (data consistency) | plan.* (deterministic node placement and tiers) | skill.* (gate, colours, skill-up curve)
//         harvest.* (gating, yields, rares, cooldowns, respawn, cap) | craft.* (starter recipes) | svc.* (service events, toasts)
// PASS/FAIL per check, exit code 1 on any failure.
import * as H from './harness.mjs';

const { G } = H;
const toasts = [];
const gatherDone = [];
const skillUps = [];
G.events.on('ui:toast', (t) => toasts.push(t));
G.events.on('gather:done', (e) => gatherDone.push(e));
G.events.on('profession:skillUp', (e) => skillUps.push(e));

const D = await H.imp('data/professions.ts');
const M = await H.imp('data/materials.ts');
const P = await H.imp('systems/Professions.ts');
const { RNG } = await H.imp('core/utils.ts');
const pois = await H.imp('data/world/pois.ts');
const { LAYOUT } = await H.imp('data/world/layout.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

// fake character with a bag (the real CharacterState needs the DOM)
const bag = new Map();
let persists = 0;
function freshCharacter() {
  bag.clear();
  const save = { flags: {}, professions: {} };
  G.character = {
    save, level: 30,
    material: (id) => bag.get(id) ?? 0,
    addMaterial: (id, n) => bag.set(id, (bag.get(id) ?? 0) + n),
    useMaterial: (id, n) => {
      if ((bag.get(id) ?? 0) < n) return false;
      bag.set(id, bag.get(id) - n);
      return true;
    },
    persist() { persists++; },
  };
  return save;
}
const HOUR = 3600e3;

// ------------------------------------------------------------------------------------------------ cat.*
{
  const nodeIds = D.NODE_TYPES.map((n) => n.id);
  ok('cat.node-ids-unique', new Set(nodeIds).size === nodeIds.length);
  ok('cat.node-yields-exist', D.NODE_TYPES.every((n) => n.yields.every((y) => M.MATERIALS[y.id])), 'every yield is a material');
  ok('cat.node-rares-exist', D.NODE_TYPES.every((n) => (n.rare ?? []).every((r) => M.MATERIALS[r.id])), 'every rare is a material');
  ok('cat.node-tiers-6', [1, 2, 3, 4, 5, 6].every((t) => D.NODE_TYPES.some((n) => n.prof === 'mine' && n.tier === t)));
  ok('cat.recipes-exist', D.RECIPES.every((r) => r.inputs.every((i) => M.MATERIALS[i.id]) && (('id' in r.output) && M.MATERIALS[r.output.id])), 'inputs and outputs');
  ok('cat.recipe-count', D.RECIPES.length === 6, `${D.RECIPES.length} recipes`);
  ok('cat.recipe-profs', D.RECIPES.every((r) => r.prof === 'mine' || r.prof === 'herb'));
  ok('cat.material-names', ['ore_copper', 'ingot_iron', 'bileme_tasi_2', 'herb_lotus', 'pollen'].every((id) => M.MATERIALS[id]?.name));
  ok('cat.skill-max', D.SKILL_MAX === 300);
  ok('cat.gather-fields-map', LAYOUT.gatherFields.every((f) => LAYOUT.regions[f.region]), 'every field has a region');
  ok('cat.gather-fields-kinds', pois.GATHER.every((f) => f.kind === 'ore' || f.kind === 'herb'));
  ok('cat.profession-defs', ['mine', 'herb'].every((p) => D.PROFESSIONS[p]?.name), 'Madencilik and Bitki Toplama');
  ok('cat.names', D.PROFESSIONS.mine.name === 'Madencilik' && D.PROFESSIONS.herb.name === 'Bitki Toplama');
}

// ------------------------------------------------------------------------------------------------ plan.*
{
  const tiers = pois.GATHER.map((f) => ({ f, t: D.tierOfLevels(LAYOUT.regions[f.regionId].levels) }));
  const byRegion = Object.fromEntries(tiers.map((x) => [x.f.regionId, x.t]));
  ok('plan.tier-sisli', byRegion.r1 === 1 && byRegion.r2 === 1 && byRegion.r3 === 2 && byRegion.r4 === 2 && byRegion.r5 === 3 && byRegion.r6 === 3,
    JSON.stringify(byRegion));
  ok('plan.tier-levels', D.tierOfLevels([1, 5]) === 1 && D.tierOfLevels([10, 15]) === 2 && D.tierOfLevels([44, 50]) === 5 && D.tierOfLevels([55, 60]) === 6);

  const seed = 0x5eed;
  let total = 0;
  let sameAcrossCalls = true;
  let sameAcrossSeeds = true;
  let inRadius = true;
  let typesOk = true;
  let profOk = true;
  let rich = 0;
  for (const { f, t } of tiers) {
    const a = P.planField(f, t, seed);
    const b = P.planField(f, t, seed);
    if (JSON.stringify(a) !== JSON.stringify(b)) sameAcrossCalls = false;
    const c = P.planField(f, t, seed + 1);
    if (JSON.stringify(a.map((n) => [n.x, n.z])) === JSON.stringify(c.map((n) => [n.x, n.z]))) sameAcrossSeeds = false;
    total += a.length;
    for (const n of a) {
      if (Math.hypot(n.x - f.center[0], n.z - f.center[1]) > f.radius + 1e-9) inRadius = false;
      if (n.type.tier !== t) typesOk = false;
      if (n.type.prof !== (f.kind === 'ore' ? 'mine' : 'herb')) profOk = false;
      if (n.rich) rich++;
    }
  }
  ok('plan.count', total === pois.GATHER.reduce((s, f) => s + f.count, 0), `${total} nodes`);
  ok('plan.deterministic', sameAcrossCalls, 'same field, seed and tier -> same nodes');
  ok('plan.seed-changes-layout', sameAcrossSeeds, 'another seed moves the nodes');
  ok('plan.in-radius', inRadius);
  ok('plan.type-tier', typesOk, 'node types follow the field tier');
  ok('plan.type-kind', profOk, 'ore fields give mine nodes, herb fields herb nodes');
  // rich-vein rate over a big sample
  let sample = 0;
  let richN = 0;
  for (let s = 1; s <= 40; s++) for (const { f, t } of tiers) for (const n of P.planField({ ...f, count: 50 }, t, s)) { sample++; if (n.rich) richN++; }
  const rate = richN / sample;
  ok('plan.rich-rate', rate > 0.03 && rate < 0.1, `rich ${(rate * 100).toFixed(1)} % of ${sample}`);
  const allKeys = tiers.flatMap(({ f, t }) => P.planField(f, t, seed).map((n) => n.key));
  ok('plan.keys-unique', new Set(allKeys).size === allKeys.length && allKeys.length === total, 'node keys are unique across the map');
}

// ------------------------------------------------------------------------------------------------ skill.*
{
  const save = freshCharacter();
  ok('skill.default-1', P.skillOf(save, 'mine') === 1 && P.skillOf(save, 'herb') === 1, 'learned for free at 1');
  P.setSkillOf(save, 'mine', 500);
  ok('skill.cap-300', P.skillOf(save, 'mine') === 300 && save.professions.mine.tier === 6);
  P.setSkillOf(save, 'mine', 0);
  ok('skill.floor-1', P.skillOf(save, 'mine') === 1);
  const tierOk = [[1, 1], [50, 1], [51, 2], [100, 2], [101, 3], [300, 6]].every(([s, t]) => D.tierOfSkill(s) === t);
  ok('skill.tiers', tierOk);

  P.setSkillOf(save, 'mine', 1);
  const locked = P.gateOf(save, 'mine', 75);
  ok('skill.gate-locked', !locked.ok && locked.color === 'locked' && locked.reason === 'Madencilik 75 gerekli', locked.reason);
  P.setSkillOf(save, 'mine', 75);
  const at = P.gateOf(save, 'mine', 75);
  ok('skill.gate-equal-orange', at.ok && at.color === 'orange' && at.diff === 0);
  const colourAt = (d) => D.skillDiffColor(d);
  ok('skill.colour-bands', colourAt(-1) === 'locked' && colourAt(0) === 'orange' && colourAt(14) === 'orange' && colourAt(15) === 'yellow'
    && colourAt(29) === 'yellow' && colourAt(30) === 'green' && colourAt(49) === 'green' && colourAt(50) === 'grey');
  ok('skill.chance-curve', D.skillUpChance(0) === 1 && Math.abs(D.skillUpChance(15) - 0.75) < 1e-9 && Math.abs(D.skillUpChance(30) - 0.5) < 1e-9
    && D.skillUpChance(50) === 0 && D.skillUpChance(-1) === 0 && Math.abs(D.skillUpChance(49) - (1 - 49 / 60)) < 1e-9);
  ok('skill.colour-hex', D.SKILL_COLOR_HEX.orange === '#ff8000' && D.SKILL_COLOR_HEX.yellow === '#ffd100' && D.SKILL_COLOR_HEX.green === '#1eff00' && D.SKILL_COLOR_HEX.grey === '#9d9d9d');
}

// ------------------------------------------------------------------------------------------------ harvest.*
const copper = D.NODE_TYPE_BY_ID.ore_copper_node;
const iron = D.NODE_TYPE_BY_ID.ore_iron_node;
const daisy = D.NODE_TYPE_BY_ID.herb_daisy_node;
{
  // gating: a locked node changes nothing
  const save = freshCharacter();
  const rng = new RNG(11);
  const r = P.applyHarvest(save, iron, 'gf_r2_ore#0', rng, false, 1e12, 270);
  ok('harvest.locked-refused', !r.ok && r.reason === 'Madencilik 41 gerekli' && r.gained.length === 0, r.reason);
  ok('harvest.locked-no-cooldown', Object.keys(P.readCooldowns(save)).length === 0);
  ok('harvest.locked-no-skill', P.skillOf(save, 'mine') === 1);

  // harvest on a free node: cooldown written, respawn window
  const now = 1e12;
  const rr = P.applyHarvest(save, copper, 'gf_r1_ore#0', rng, false, now, 300);
  ok('harvest.ok', rr.ok && rr.respawnAt > now);
  const span = (rr.respawnAt - now) / 1000;
  ok('harvest.respawn-window', span >= 270 && span <= 330, `${span.toFixed(1)} s for base 300`);
  const again = P.applyHarvest(save, copper, 'gf_r1_ore#0', rng, false, now + 1000, 300);
  ok('harvest.cooldown-blocks', !again.ok && again.reason === 'Bu damar henüz yenilenmedi.');
  const later = P.applyHarvest(save, copper, 'gf_r1_ore#0', rng, false, rr.respawnAt + 1, 300);
  ok('harvest.respawns', later.ok === true);

  // rich veins take x1.5 respawn
  const rs = P.respawnAtMs(300, 'k#rich', now, true) - now;
  ok('harvest.rich-respawn', rs >= 405e3 && rs <= 495e3, `${rs / 1000} s`);
  ok('harvest.respawn-deterministic', P.respawnAtMs(300, 'k#1', now, false) === P.respawnAtMs(300, 'k#1', now, false));

  // cooldown table survives a save roundtrip and prunes expired entries
  const json = JSON.parse(JSON.stringify(save));
  ok('harvest.save-roundtrip', P.cooldownUntil(json, 'gf_r1_ore#0') === P.cooldownUntil(save, 'gf_r1_ore#0') && P.cooldownUntil(json, 'gf_r1_ore#0') > 0);
  const big = freshCharacter();
  for (let i = 0; i < 450; i++) P.setCooldown(big, `t#${i}`, now + HOUR + i, now);
  ok('harvest.cap-400', Object.keys(P.readCooldowns(big)).length === 400, `${Object.keys(P.readCooldowns(big)).length} entries`);
  P.setCooldown(big, 'fresh', now + 2 * HOUR, now + 2 * HOUR); // everything else has expired by then
  ok('harvest.prune-expired', Object.keys(P.readCooldowns(big)).length === 1 && P.cooldownUntil(big, 'fresh') > 0);
  big.flags[P.CD_FLAG] = '{not json';
  ok('harvest.bad-json-safe', Object.keys(P.readCooldowns(big)).length === 0);

  // yields and rares within their bounds
  const rng2 = new RNG(99);
  let minOk = true;
  let maxOk = true;
  let idOk = true;
  for (let i = 0; i < 2000; i++) {
    for (const d of P.rollYields(copper, 1, rng2, false)) {
      if (d.id !== 'ore_copper') idOk = false;
      if (d.count < 1) minOk = false;
      if (d.count > (3 + 1) * 2) maxOk = false;
    }
  }
  ok('harvest.yield-min', minOk);
  ok('harvest.yield-max', maxOk, 'max 3 + bonus, x2 for Bol Hasat');
  ok('harvest.yield-ids', idOk);
  const rareRng = new RNG(5);
  let procs = 0;
  for (let i = 0; i < 20000; i++) procs += P.rollRares(copper, 1, rareRng).length;
  const procRate = procs / 20000;
  ok('harvest.rare-rate', procRate > 0.008 && procRate < 0.025, `${(procRate * 100).toFixed(2)} % (expected about 1.5 %)`);
  const richRng = new RNG(6);
  const richTotal = P.rollYields(copper, 1, richRng, true).reduce((s, d) => s + d.count, 0);
  ok('harvest.rich-doubles', richTotal >= 2, `rich total ${richTotal}`);
}

// skill-up curve: copper (req 1) from skill 1 to 51, then grey gives no more skill-ups
{
  const save = freshCharacter();
  const rng = new RNG(7);
  let now = 1e12;
  let gathers = 0;
  let reached = 0;
  while (P.skillOf(save, 'mine') < 51 && gathers < 2000) {
    const r = P.applyHarvest(save, copper, `c#${gathers}`, rng, false, now, 300);
    gathers++;
    now += 3600e3;
    if (!r.ok) throw new Error('unexpected refusal: ' + r.reason);
    if (P.skillOf(save, 'mine') >= 51 && !reached) reached = gathers;
  }
  ok('curve.to-51', P.skillOf(save, 'mine') === 51, `${gathers} gathers`);
  ok('curve.cost-band', reached > 50 && reached < 150, `${reached} gathers from 1 to 51 (about 100 expected)`);
  let greySkill = 0;
  for (let i = 0; i < 300; i++) {
    const r = P.applyHarvest(save, copper, `g#${i}`, rng, false, now, 300);
    now += 3600e3;
    if (r.skillUp) greySkill++;
  }
  ok('curve.grey-no-skillup', greySkill === 0 && P.skillOf(save, 'mine') === 51, `skill ${P.skillOf(save, 'mine')}`);
  // cap: at 300 nothing moves
  P.setSkillOf(save, 'mine', 300);
  const capRoll = P.rollSkillUp(save, 'mine', 0, new RNG(3));
  ok('curve.cap-no-skillup', capRoll === false);
  // orange work with a fresh save: most rolls go up
  const s2 = freshCharacter();
  P.setSkillOf(s2, 'herb', 40);
  let up = 0;
  for (let i = 0; i < 1000; i++) if (P.rollSkillUp(s2, 'herb', 0, new RNG(i + 1))) up++;
  ok('curve.orange-always', up === 1000, `${up}/1000`);
  let yellow = 0;
  for (let i = 0; i < 2000; i++) if (P.rollSkillUp(s2, 'herb', 20, new RNG(i + 1))) yellow++;
  ok('curve.yellow-rate', Math.abs(yellow / 2000 - (1 - 20 / 60)) < 0.04, `${(yellow / 20).toFixed(1)} %`);
}

// ------------------------------------------------------------------------------------------------ craft.*
{
  const save = freshCharacter();
  const none = P.craftCheck(save, D.RECIPE_BY_ID.rc_ingot_copper, (m) => bag.get(m) ?? 0);
  ok('craft.missing-input', !none.ok && none.reason === 'Bakır Cevheri ×2 gerekli', none.reason);
  const locked = P.craftCheck(save, D.RECIPE_BY_ID.rc_ingot_iron, () => 99);
  ok('craft.locked', !locked.ok && locked.reason === 'Madencilik 41 gerekli', locked.reason);
  G.professions = new P.Professions();
  bag.set('ore_copper', 2);
  const c1 = G.professions.craft('rc_ingot_copper');
  ok('craft.ok', c1.ok && bag.get('ore_copper') === 0 && bag.get('ingot_copper') === 1);
  bag.set('herb_daisy', 2); bag.set('shroom_tan', 1);
  const c2 = G.professions.craft('rc_pot_hp_1');
  ok('craft.potion', c2.ok && bag.get('pot_hp_1') === 1 && bag.get('herb_daisy') === 0 && bag.get('shroom_tan') === 0);
  bag.set('ore_iron', 2); bag.set('coal', 1);
  const c3 = G.professions.craft('rc_ingot_iron');
  ok('craft.locked-consumes-nothing', !c3.ok && bag.get('ore_iron') === 2 && bag.get('coal') === 1, c3.reason);
  ok('craft.unknown-recipe', !G.professions.craft('rc_nope').ok);
  ok('craft.toast', toasts.some((t) => t.text.startsWith('Üretildi:')));
}

// ------------------------------------------------------------------------------------------------ svc.*
{
  freshCharacter();
  G.professions = new P.Professions();
  gatherDone.length = 0; skillUps.length = 0; toasts.length = 0;
  persists = 0;
  const h1 = G.professions.harvest(copper, 'svc_ore#1', false, 42, 300);
  ok('svc.harvest-ok', h1.ok && (bag.get('ore_copper') ?? 0) >= 1, `bag ${bag.get('ore_copper') ?? 0}`);
  ok('svc.gather-done-event', gatherDone.some((e) => e.id === 42 && e.ok === true));
  ok('svc.persisted', persists >= 1);
  ok('svc.loot-toast', toasts.some((t) => t.kind === 'loot' && t.text.includes('Bakır Cevheri')));
  const h2 = G.professions.harvest(copper, 'svc_ore#1', false, 42, 300);
  ok('svc.cooldown-refused', !h2.ok && h2.reason === 'Bu damar henüz yenilenmedi.');
  ok('svc.locked-refused', !G.professions.harvest(iron, 'svc_iron#0', false, 43, 270).ok);
  // enough gathers to see at least one skill-up event
  for (let i = 0; i < 60; i++) G.professions.harvest(copper, `svc_many#${i}`, false, 100 + i, 0.001);
  ok('svc.skillup-event', skillUps.length >= 1 && skillUps[0].prof === 'mine' && skillUps[0].skill === 2, `${skillUps.length} skill-ups`);
  ok('svc.skill-toast', toasts.some((t) => t.text.includes('Madencilik becerin')));
  ok('svc.gate-api', G.professions.gate('mine', 75).reason === 'Madencilik 75 gerekli');
  ok('svc.skill-api', G.professions.skill('mine') === P.skillOf(G.character.save, 'mine'));
  ok('svc.herb-node-yields', (() => {
    const hn = G.professions.harvest(daisy, 'svc_herb#0', false, 77, 240);
    return hn.ok && (bag.get('herb_daisy') ?? 0) >= 1;
  })());
}

// ------------------------------------------------------------------------------------------------ report
const errs = H.errors.filter((e) => /gather|Professions|profession/i.test(e));
ok('svc.no-console-errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`gather: ${passes} passed, ${fails} failed`);
console.log(fails ? 'FAIL' : 'PASS');
process.exitCode = fails ? 1 : 0;
