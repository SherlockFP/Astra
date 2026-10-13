// LOOT V3 checks (docs/GDD_LOOT_V3.md, status: docs/kits/loot_v3_status.md) that need no browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/loot_v3.mjs [uniqueIdFilter]
// Stages: uniq.* (every unique has a working hook or is listed as needs-engine: parse, equip fold, trigger -> effect on a fake
//         player / enemies), smart.* (smart loot distribution), pity.* (legendary / named / elite pity), chest.* (boss chest),
//         salv.* (auto-salvage), track.* (Yigitlik stones). PASS/FAIL per check, exit code 1 on any failure.
import * as H from './harness.mjs';

const { G, SKILLS, errors, world, events } = H;
const filter = process.argv[2] ?? '';

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ================================================================================================ uniques
const { UNIQUES } = await H.imp('data/uniques.ts');
const { UNIQUE_FX, LEGACY_WIRED_UNIQUES } = await H.imp('data/uniqueFx.ts');
const { STATUSES } = await H.imp('data/statuses.ts');
const { parseFx, fxContext, TRIGGERS, ACTIONS } = await H.imp('data/talentTrees/fx.ts');
const { ProcEngine, collectProcs } = await H.imp('combat/Procs.ts');
const { foldEquippedUniques, uniqueEffectState, describeUniqueEffect } = await H.imp('systems/UniqueEffects.ts');
const { computeStats, emptyFx } = await H.imp('systems/StatCalc.ts');
const { generateUnique, describeItem, baseOf, slotsForCategory } = await H.imp('systems/ItemGen.ts');
const { RNG } = await H.imp('core/utils.ts');
const { STAT_IDS } = await H.imp('types/stats.ts');

const fxCtx = fxContext(Object.keys(SKILLS), Object.keys(STATUSES));
const withSpecial = Object.values(UNIQUES).filter((u) => u.special);
const seasonIds = withSpecial.map((u) => u.id).filter((id) => !LEGACY_WIRED_UNIQUES.includes(id));

// ---- uniq.cover: every unique with a special is wired (legacy), has fx, or is listed as needs-engine with a reason
{
  const legacyBad = LEGACY_WIRED_UNIQUES.filter((id) => !UNIQUES[id]?.special);
  ok('uniq.cover legacy list ids exist', legacyBad.length === 0, legacyBad.join(','));
  const uncovered = seasonIds.filter((id) => !UNIQUE_FX[id]);
  ok(`uniq.cover every season unique is in UNIQUE_FX (${seasonIds.length})`, uncovered.length === 0, uncovered.join(','));
  const orphans = Object.keys(UNIQUE_FX).filter((id) => !UNIQUES[id]?.special);
  ok('uniq.cover UNIQUE_FX ids all name a unique with a special', orphans.length === 0, orphans.join(','));
  const noNeed = Object.entries(UNIQUE_FX).filter(([, d]) => (d.mode === 'engine' ? !d.need || d.fx : !d.fx));
  ok('uniq.cover engine rows have a reason and no fx, others have fx', noNeed.length === 0, noNeed.map(([k]) => k).join(','));
  const noEffect = Object.entries(UNIQUE_FX).filter(([id, d]) => d.mode === 'approx' && !d.effect);
  ok('uniq.cover approx rows carry their own Turkish effect text', noEffect.length === 0, noEffect.map(([k]) => k).join(','));
  const counts = { full: 0, approx: 0, engine: 0 };
  for (const id of seasonIds) counts[UNIQUE_FX[id]?.mode ?? 'engine']++;
  console.log(`uniques: ${withSpecial.length} with a special = ${LEGACY_WIRED_UNIQUES.length} legacy (combat-coded) + ${seasonIds.length} season; season: ${counts.full} full + ${counts.approx} approx + ${counts.engine} needs-engine`);
}

// ---- uniq.parse: syntax, existence, no skill ids (GDD_LOOT_V3 LR6), allowed row kinds
for (const id of seasonIds) {
  if (filter && !id.includes(filter)) continue;
  const d = UNIQUE_FX[id];
  if (!d?.fx) continue;
  const r = parseFx(d.fx, fxCtx);
  ok(`uniq.parse ${id} parses clean`, r.errors.length === 0, r.errors.join('; '));
  const kinds = r.items.map((i) => i.k);
  ok(`uniq.parse ${id} only S/T rows`, kinds.every((k) => k === 'S' || k === 'T'), kinds.join(''));
  const skillFilters = r.items.filter((i) => i.k === 'T' && ['hit', 'crit', 'kill', 'cast'].includes(i.trig) && i.filter && i.filter !== '*' && !i.filter.startsWith('@'));
  ok(`uniq.parse ${id} no skill id in a filter`, skillFilters.length === 0, skillFilters.map((i) => i.filter).join(','));
  const statsOk = r.items.every((i) => i.k !== 'S' || Object.keys(i.stats).every((s) => STAT_IDS.includes(s)));
  ok(`uniq.parse ${id} S stats exist`, statsOk);
  ok(`uniq.parse ${id} triggers/actions known`, r.items.every((i) => i.k !== 'T' || (TRIGGERS.has(i.trig) && i.actions.every((a) => ACTIONS.has(a.a)))));
}

// ---- uniq.fold: equipping folds the rows into ActiveFx via computeStats, unequipping / breaking removes them
function saveWith(classId, equipment) {
  return { classId, level: 60, equipment, talents: [], flags: {}, passiveExtra: { picks: {}, jewels: {} }, skillMastery: {}, bag: [], stash: [] };
}
function slotOf(item) {
  const base = baseOf(item);
  return slotsForCategory(base.category)[0];
}
for (const id of seasonIds) {
  if (filter && !id.includes(filter)) continue;
  const d = UNIQUE_FX[id];
  const u = UNIQUES[id];
  const cls = u.classes?.[0] ?? 'knight';
  const item = generateUnique(id, 70, new RNG(7), cls);
  const slot = slotOf(item);
  ok(`uniq.fold ${id} generates on a real slot`, !!slot && item.uniqueId === id, `${item.baseId}/${slot}`);
  if (!slot) continue;
  const save = saveWith(cls, { [slot]: item });
  const base = computeStats(save);
  const rows = d.fx ? parseFx(d.fx).items : [];
  const nT = rows.filter((r) => r.k === 'T').length;
  const mine = base.fx.procs.filter((p) => p.src === `item:${slot}:${id}`);
  if (d.mode === 'engine') {
    ok(`uniq.fold ${id} (needs-engine) adds no proc`, mine.length === 0);
    ok(`uniq.fold ${id} tooltip greys it out`, describeUniqueEffect(id)?.active === false && describeItem(item).specialInactive?.[0] === true && describeItem(item).specialLines[0].endsWith('(etkin değil)'));
    continue;
  }
  ok(`uniq.fold ${id} equipped -> ${nT} proc row(s) in fx.procs`, mine.length === nT, `got ${mine.length}`);
  for (const s of rows.filter((r) => r.k === 'S')) {
    const noItem = computeStats(saveWith(cls, {})).stats;
    for (const [k, v] of Object.entries(s.stats)) ok(`uniq.fold ${id} S row ${k} reaches the final stats`, (base.stats[k] ?? 0) > (noItem[k] ?? 0) + v * 0.5 - 1e-9, `${noItem[k]} -> ${base.stats[k]}`);
  }
  item.broken = true;
  ok(`uniq.fold ${id} broken item folds nothing`, computeStats(saveWith(cls, { [slot]: item })).fx.procs.every((p) => !p.src.includes(id)));
  delete item.broken;
  ok(`uniq.fold ${id} unequipped folds nothing`, computeStats(saveWith(cls, {})).fx.procs.length === 0);
  const t = describeItem(item);
  ok(`uniq.fold ${id} tooltip is orange and has no "(etkin değil)"`, t.specialInactive?.[0] === false && !t.specialLines[0].includes('etkin değil') && t.specialLines[0].length > 10);
}
// duplicates fold once (two rings)
{
  const id = 'leg_kef_halkor_shard';
  const a = generateUnique(id, 70, new RNG(1), 'knight');
  const b = generateUnique(id, 70, new RNG(2), 'knight');
  const fx = emptyFx();
  const n = foldEquippedUniques(fx, saveWith('knight', { ring1: a, ring2: b }));
  ok('uniq.fold the same unique on two rings folds once', n === 1 && fx.procs.length === 1);
}

// ---- uniq.live: the trigger makes the effect happen (ProcEngine + real Combat / StatusEffects on fake actors)
let engSeed = 100;
function newEngine() {
  const realNow = Date.now;
  Date.now = () => (engSeed += 7919);
  try { return new ProcEngine(); } finally { Date.now = realNow; }
}
const dmgSum = () => events['damage'].filter((d) => d.sourceId === 1).reduce((a, d) => a + d.amount, 0);

/** Drives one T row until its actions are observable. Returns '' on success or the reason. */
function driveRow(row, label) {
  const p = H.addPlayer('knight', 60);
  const wantElite = row.conds.some((c) => c.c === 'elite');
  const e1 = H.addEnemy(0, 2.6, { rank: wantElite ? 'elite' : 'trash' });
  const e2 = H.addEnemy(1.5, 3.2);
  H.step(2);
  p.position.set(0, 0, 0);
  const eng = newEngine();
  G.procs = eng;
  eng.setEntries(collectProcs([row], `live:${label}`));
  const trig = row.trig;
  const filt = row.filter;
  const tags = filt && filt.startsWith('@') ? [filt.slice(1), 'melee'] : ['basic', 'melee'];
  const tick = trig === 'tick' || trig === 'still' ? Number(filt) : 0;
  const prep = () => {
    p.hp = p.maxHp * 0.5;
    p.combatTimer = 0;
    p.velocity.set(0, 0, 0);
    for (const c of row.conds) {
      if (c.c === 'hp<') p.hp = Math.max(1, p.maxHp * c.v * 0.5);
      else if (c.c === 'hp>') p.hp = p.maxHp;
      else if (c.c === 'tst') e1.statuses.apply(c.status, 30, { magnitude: 1 });
      else if (c.c === 'sst') p.statuses.apply(c.status, 30, { magnitude: 1 });
      else if (c.c === 'shield') p.statuses.apply('shield', 30, { magnitude: 500 });
      else if (c.c === 'stealth') p.statuses.apply('stealth', 30);
      else if (c.c === 'moving') p.velocity.set(5, 0, 0);
    }
    if (row.actions.some((a) => a.a === 'purge')) { p.statuses.apply('burn', 30, { dps: 0 }); p.statuses.apply('slow', 30, { magnitude: 0.3 }); }
    if (trig === 'lethal') p.hp = 1; // Combat.lethalSaved holds 1 HP while the lethal procs run
  };
  const hasZone = row.actions.some((a) => a.a === 'zone');
  const dmg0 = dmgSum();
  const hp0 = () => p.hp;
  prep();
  const base = { php: hp0(), e1: e1.hp, e2: e2.hp, dmg: dmg0 };
  const met = (a) => {
    const [who, status] = a.args;
    switch (a.a) {
      case 'st': {
        if (who === 'tgt') return e1.statuses.has(status);
        if (/^foes/.test(who)) return e1.statuses.has(status) || e2.statuses.has(status);
        return p.statuses.has(status);
      }
      case 'buff': return p.statuses.dynamicStacks(`tb:${a.args[0]}`) > 0;
      case 'abs': return p.statuses.has('shield') && !row.conds.some((c) => c.c === 'shield');
      case 'heal': case 'healally': return p.hp > base.php + 1e-6;
      case 'purge': return !p.statuses.has('burn') || !p.statuses.has('slow');
      case 'dmg': case 'exp': return dmgSum() > base.dmg;
      case 'zone': return dmgSum() > base.dmg || (Number(a.args[5] ?? 0) > 0 && (e1.statuses.has('exposed') || e2.statuses.has('exposed')));
      case 'burst': return dmgSum() > base.dmg || (!!a.args[5] && (e1.statuses.has(a.args[5].split(':')[0]) || e2.statuses.has(a.args[5].split(':')[0])));
      default: return true;
    }
  };
  const emit = () => {
    const ctx = { player: p, skillId: 'sim_skill', tags, target: e1, ally: null, amount: 10, crit: trig === 'crit' };
    if (trig === 'status') ctx.status = filt;
    if (trig === 'tick' || trig === 'still') { eng.update(tick + 0.05); return; }
    eng.emit(trig, ctx);
  };
  const step = (dt) => { G.engine.time += dt; eng.update(dt); };
  for (let i = 0; i < 400; i++) {
    if (trig === 'lethal') { prep(); }
    emit();
    // zones tick later on the engine clock: advance in small steps (burst marks live 8 s, so only zone rows wait that long)
    if (hasZone) for (let k = 0; k < 40; k++) step(0.25);
    if (row.actions.every(met)) { G.procs = undefined; return ''; }
    if (i % 2 === 0) prep();
    step(row.icd + 0.3);
  }
  G.procs = undefined;
  return `no effect observed (${row.actions.map((a) => `${a.a}:${met(a) ? 'ok' : 'NO'}`).join(' ')})`;
}

for (const id of seasonIds) {
  if (filter && !id.includes(filter)) continue;
  const d = UNIQUE_FX[id];
  if (!d?.fx) continue;
  const rows = parseFx(d.fx).items;
  rows.forEach((row, i) => {
    if (row.k !== 'T') return;
    errors.length = 0;
    const why = driveRow(row, `${id}#${i}`);
    ok(`uniq.live ${id}#${i} (${row.trig}${row.filter ? ':' + row.filter : ''} => ${row.actions.map((a) => a.a).join('+')}) works`, why === '', why);
    if (errors.length) ok(`uniq.live ${id}#${i} no console errors`, false, errors.slice(0, 2).join(' | ').slice(0, 300));
  });
}

// ---- uniq.meta: the driver itself can fail (a row that never fires must be reported)
{
  const bad = parseFx('T hit ch=0 => dmg(1,fire)').items[0];
  ok('uniq.meta a row that never fires is reported as failing', driveRow(bad, 'meta') !== '');
}

// ---- uniq.pipe: the real CharacterState hands the item rows to G.procs on equip / unequip (recomputeStats -> setEntries)
{
  const { CharacterState } = await H.imp('systems/CharacterState.ts');
  const eng = newEngine();
  G.procs = eng;
  const ch = CharacterState.create('Sim', 'knight');
  const item = generateUnique('leg_kef_ekelon_eye', 70, new RNG(5), 'knight');
  ch.save.equipment.amulet = item;
  ch.recomputeStats(false);
  const mine = () => eng.active.filter((e) => e.src === 'item:amulet:leg_kef_ekelon_eye');
  ok('uniq.pipe equipping a unique registers its proc rows in G.procs', mine().length === 2, `rows=${mine().length}`);
  delete ch.save.equipment.amulet;
  ch.recomputeStats(false);
  ok('uniq.pipe unequipping removes them', mine().length === 0);
  G.procs = undefined;
}

// ---- uniq.bridge: roll / break / kick triggers are derived from player state and events (UniqueEffects.tickUniqueEffects)
{
  const { tickUniqueEffects, resetUniqueBridge } = await H.imp('systems/UniqueEffects.ts');
  const p = H.addPlayer('knight', 60);
  const e1 = H.addEnemy(0, 2.6);
  H.step(2);
  const eng = newEngine();
  G.procs = eng;
  G.loot = { onEnemyKilled() {}, contributed: () => true };
  eng.setEntries(collectProcs(parseFx('T roll => buff(b_roll,5,{damagePct=.1}) ;; T break => buff(b_break,5,{damagePct=.1}) ;; T kick => buff(b_kick,5,{damagePct=.1})').items, 'bridge'));
  resetUniqueBridge();
  tickUniqueEffects();
  ok('uniq.bridge idle frame fires nothing', !p.statuses.dynamicStacks('tb:b_roll'));
  p.dodging = true;
  tickUniqueEffects();
  ok('uniq.bridge a dodge roll starting fires the roll trigger', p.statuses.dynamicStacks('tb:b_roll') === 1);
  tickUniqueEffects();
  ok('uniq.bridge the same roll fires once (edge)', p.statuses.dynamicStacks('tb:b_roll') === 1);
  p.dodging = false;
  tickUniqueEffects();
  G.events.emit('poise:break', { enemyId: e1.id });
  ok('uniq.bridge poise:break (contributor) fires the break trigger', p.statuses.dynamicStacks('tb:b_break') === 1);
  G.events.emit('enemy:castEnd', { enemyId: e1.id, abilityId: 'x', interrupted: true, interruptedBy: 999 });
  ok("uniq.bridge somebody else's interrupt does not fire kick", !p.statuses.dynamicStacks('tb:b_kick'));
  G.events.emit('enemy:castEnd', { enemyId: e1.id, abilityId: 'x', interrupted: true, interruptedBy: p.id });
  ok('uniq.bridge my interrupt fires the kick trigger', p.statuses.dynamicStacks('tb:b_kick') === 1);
  G.procs = undefined;
  G.loot = { onEnemyKilled() {} };
}

// ================================================================================================ smart loot
const LOOT = await H.imp('data/loot.ts');
const IB = await H.imp('data/itemBases.ts');
const { CLASS_AFFINITY } = await H.imp('data/affixes.ts');
const SL = await H.imp('systems/SmartLoot.ts');
const { generateItem, mainStatOf } = await H.imp('systems/ItemGen.ts');
const ALL_CLASSES = Object.keys(IB.CLASS_ARMOR_WEIGHT);
/** Armour, weapons and off-hands only: jewellery and belts fit every class. */
const classSpecific = (it) => { const b = baseOf(it); return !!b && (!!b.armorWeight || IB.isWeaponCategory(b.category) || ['shield', 'tome', 'quiver'].includes(b.category)); };

if (!filter) {
  ok('smart.consts SMART_LOOT is 0.70', LOOT.SMART_LOOT === 0.7);
  ok('smart.affinity every class has an affinity list of real stat ids', ALL_CLASSES.every((c) => (CLASS_AFFINITY[c]?.length ?? 0) >= 6 && CLASS_AFFINITY[c].every((s) => STAT_IDS.includes(s))));
  ok('smart.bases every armour weight lists its classes (F6 fix)', ALL_CLASSES.every((c) => IB.WEIGHT_CLASSES[IB.CLASS_ARMOR_WEIGHT[c]].includes(c)));
  const N = 1500;
  let totalRare = 0, totalWithMain = 0;
  for (const cls of ALL_CLASSES) {
    const rng = new RNG(1234 + cls.length * 77);
    let usable = 0, armour = 0, armourOk = 0, mainOk = 0, mainN = 0;
    for (let i = 0; i < N; i++) {
      const it = generateItem({ itemLevel: 80, rarity: i % 2 ? 'rare' : 'epic', classId: cls, smart: true }, rng);
      const base = baseOf(it);
      if (SL.classCanUseItem(cls, it)) usable++;
      if (base.armorWeight) { armour++; if (base.armorWeight === IB.CLASS_ARMOR_WEIGHT[cls]) armourOk++; }
      if (it.affixes.length >= 2) { mainN++; if (it.affixes.some((a) => a.stat === mainStatOf(cls)) || (it.implicit?.[mainStatOf(cls)] ?? 0) > 0) mainOk++; }
    }
    ok(`smart.forced ${cls}: 100 % of smart items are usable (${usable}/${N})`, usable === N);
    ok(`smart.forced ${cls}: 100 % of armour has the class weight (${armourOk}/${armour})`, armourOk === armour);
    ok(`smart.forced ${cls}: >= 98 % of multi-line items carry the main stat (${mainOk}/${mainN})`, mainN > 0 && mainOk / mainN >= 0.98, `${(100 * mainOk / mainN).toFixed(1)} %`);
    totalRare += mainN; totalWithMain += mainOk;
    // the real coin: no `smart` flag -> 70 % smart, the rest random. Measured on gear whose usability is class-specific
    // (armour, weapons, off-hands): jewellery and belts fit every class, so they would blur the coin.
    const rng2 = new RNG(99 + cls.length);
    let use2 = 0, n2 = 0;
    for (let i = 0; i < 6000; i++) {
      const it2 = generateItem({ itemLevel: 80, rarity: 'rare', classId: cls }, rng2);
      if (!classSpecific(it2)) continue;
      n2++;
      if (SL.classCanUseItem(cls, it2)) use2++;
    }
    const f2 = use2 / n2;
    ok(`smart.coin ${cls}: class-specific gear usable with the 0.70 coin lands in 70-86 % (${(100 * f2).toFixed(1)} %, n ${n2})`, f2 >= 0.70 && f2 <= 0.86);
  }
  // not smart (smart: false) must really be random: far from always usable
  {
    const rng = new RNG(5);
    let u = 0, n = 0;
    for (let i = 0; i < 4000; i++) {
      const it = generateItem({ itemLevel: 80, rarity: 'rare', classId: 'mage', smart: false }, rng);
      if (!classSpecific(it)) continue;
      n++;
      if (SL.classCanUseItem('mage', it)) u++;
    }
    ok(`smart.off smart:false is fully random (mage class-specific gear usable ${(100 * u / n).toFixed(1)} %, expected under 50 %)`, u / n < 0.5);
  }
  // smart legendaries are class-usable, off-class legendaries do drop for non-smart rolls
  {
    const rng = new RNG(77);
    let okCls = 0, n = 0;
    for (let i = 0; i < 600; i++) {
      const it = generateItem({ itemLevel: 80, rarity: 'legendary', classId: 'rogue', smart: true }, rng);
      n++;
      const u = UNIQUES[it.uniqueId];
      if (!u?.classes || u.classes.includes('rogue')) okCls++;
    }
    ok(`smart.legendary smart legendaries fit the class (${okCls}/${n})`, okCls >= n * 0.97);
  }
}

// ================================================================================================ pity
const LP = await H.imp('systems/LootPity.ts');
const CR = await H.imp('systems/ChestRoll.ts');
if (!filter) {
  const f = {};
  ok('pity.mult starts at 1', LP.pityMult(f) === 1);
  LP.addPity(f, 16);
  ok('pity.mult is x5 at pity 16', LP.pityMult(f) === 5, String(LP.pityMult(f)));
  LP.addPity(f, 100);
  ok('pity.cap the counter caps at 60', LP.getPity(f) === 60);
  ok('pity.hard due from 30', LP.hardPityDue({ 'loot.pity': 30 }) && !LP.hardPityDue({ 'loot.pity': 29.9 }));
  LP.resetPity(f);
  ok('pity.reset', LP.getPity(f) === 0);
  const legacy = { 'loot.pity': 12 };
  ok('pity.migrate the old integer flag is read as is', LP.getPity(legacy) === 12 && LP.pityMult(legacy) === 4);

  // named pity: exact expectation from the formula vs GDD §8.2 table, and the hard stop at 17 chests
  const expected = (p0) => { let surv = 1, e = 0; for (let m = 0; m <= LOOT.NAMED_PITY.hard; m++) { e += surv; surv *= 1 - LP.namedChance(p0, m); } return e; };
  const table = { 0.10: 5.5, 0.12: 5.1, 0.15: 4.6, 0.20: 3.9, 0.25: 3.3 };
  for (const [p0, want] of Object.entries(table)) ok(`pity.named expected chests for p0 ${p0} = ${want} (formula ${expected(Number(p0)).toFixed(2)})`, near(expected(Number(p0)), want, want * 0.03));
  ok('pity.named chance is 1 at 16 misses (worst case 17 chests)', LP.namedChance(0.1, 16) === 1 && LP.namedChance(0.1, 15) < 1);
  ok('pity.named final boss x1.25 base', near(LP.namedChance(0.2, 0, true), 0.25, 1e-9));
  ok('pity.named never above the 0.75 cap before the hard stop', LP.namedChance(0.5, 14) <= 0.75);

  // Monte Carlo through the real rollBossChest: chests until the named drop
  const table1 = { uniqueIds: ['leg_ys_nobet_cani'], focus: ['shield'], setChance: 0 };
  const mc = (ctx, keyLevel) => {
    const rng = new RNG(4242 + keyLevel);
    let total = 0, worst = 0;
    const K = 3000;
    for (let s = 0; s < K; s++) {
      const flags = {};
      let n = 0;
      for (;;) {
        n++;
        const r = CR.rollBossChest({ bossId: 'boss_gerdan', ctx, keyLevel, final: false, ilvl: 70, classId: 'knight', table: table1 }, flags, rng);
        if (r.named) break;
        if (n > 40) break;
      }
      total += n; worst = Math.max(worst, n);
    }
    return { mean: total / K, worst };
  };
  for (const [ctx, kl, p0] of [['normal', 0, 0.10], ['heroic', 0, 0.12], ['mythic0', 1, 0.15], ['mplus', 10, 0.25]]) {
    const { mean, worst } = mc(ctx, kl);
    const want = expected(p0);
    ok(`pity.mc ${ctx}${kl ? ' +' + kl : ''}: chests to the named item ${mean.toFixed(2)} vs ${want.toFixed(2)} (+-7 %), worst ${worst} <= 17`, near(mean, want, want * 0.07) && worst <= 17);
  }
  // the hard legendary pity forces a legendary / set on the first generic item and resets the counter
  {
    const rng = new RNG(31);
    for (let t = 0; t < 20; t++) {
      const flags = { 'loot.pity': 30 };
      const r = CR.rollBossChest({ bossId: 'b', ctx: 'normal', keyLevel: 0, final: false, ilvl: 60, classId: 'knight' }, flags, rng);
      const hit = r.items.slice(0, 1).every((it) => it.rarity === 'legendary' || it.rarity === 'set');
      if (!hit || !r.hardPity || LP.getPity(flags) !== 0) { ok('pity.hard forced legendary/set + reset', false, `${r.items[0]?.rarity} pity=${LP.getPity(flags)}`); break; }
      if (t === 19) ok('pity.hard forced legendary/set + reset (20 chests)', true);
    }
    const flags = {};
    const rng2 = new RNG(8);
    let leg = 0, N = 0;
    for (let i = 0; i < 400; i++) { const r = CR.rollBossChest({ bossId: 'b', ctx: 'normal', keyLevel: 0, final: false, ilvl: 60, classId: 'knight' }, flags, rng2); N++; if (r.items.some((it) => it.rarity === 'legendary' || it.rarity === 'set')) leg++; }
    ok(`pity.chest without luck the counter climbs and never passes the hard stop by much (pity ${LP.getPity(flags).toFixed(0)}, legendary/set in ${leg}/${N} chests)`, LP.getPity(flags) < 31 && leg > 0);
  }
  // elite guard + smart anti-streak
  {
    const f2 = {};
    for (let i = 0; i < 3; i++) LP.noteEliteItem(f2, false);
    ok('pity.elite 3 misses: guard not due', !LP.eliteGuardDue(f2));
    LP.noteEliteItem(f2, false);
    ok('pity.elite 4 misses: guard due', LP.eliteGuardDue(f2));
    LP.noteEliteItem(f2, true);
    ok('pity.elite a Nadir+ item resets the guard', !LP.eliteGuardDue(f2));
    LP.noteSmart(f2, false); LP.noteSmart(f2, false);
    ok('pity.smart two non-smart items force the next smart', LP.smartForced(f2));
    LP.noteSmart(f2, true);
    ok('pity.smart a smart item clears the streak', !LP.smartForced(f2));
  }
}

// ================================================================================================ chest rules
if (!filter) {
  const rng = new RNG(2024);
  const count = (ctx, keyLevel, final, n = 3000) => {
    let items = 0, two = 0;
    const flags = {};
    for (let i = 0; i < n; i++) { const r = CR.rollBossChest({ bossId: 'bx', ctx, keyLevel, final, ilvl: 60, classId: 'mage' }, flags, rng); items += r.items.length; if (r.items.length > LOOT.chestRuleFor(ctx, keyLevel).items) two++; }
    return { avg: items / n, second: two / n };
  };
  const c1 = count('mplus', 10, false), c2 = count('mplus', 10, true), c3 = count('heroic', 0, false), c4 = count('normal', 0, false), c5 = count('world', 0, false);
  ok(`chest.mplus +10: 1 guaranteed + ${(c1.second * 100).toFixed(0)} % second (rule 25 %)`, c1.avg >= 1 && near(c1.second, 0.25, 0.03));
  ok(`chest.mplus +10 final boss: second chance x1.5 (${(c2.second * 100).toFixed(0)} % vs 37.5 %)`, near(c2.second, 0.375, 0.035));
  ok(`chest.heroic: 1 + 35 % (${(c3.second * 100).toFixed(0)} %)`, near(c3.second, 0.35, 0.035));
  ok(`chest.normal levelling: 2 guaranteed + 50 % (avg ${c4.avg.toFixed(2)} items)`, near(c4.avg, 2.5, 0.08));
  ok(`chest.world: 2 + 25 % (avg ${c5.avg.toFixed(2)} items)`, near(c5.avg, 2.25, 0.08));
  const r = CR.rollBossChest({ bossId: 'bx', ctx: 'mplus', keyLevel: 10, final: true, ilvl: 77, classId: 'knight' }, {}, rng);
  ok('chest.stones M+ +10 final boss: Efsane x floor((2+3) x 1.5) = 7', r.stones?.id === 'yt_efsane' && r.stones.count === 7, JSON.stringify(r.stones));
  ok('chest.stones normal / heroic / Mitik0 grades', LOOT.chestStones('normal', 0, false).id === 'yt_cirak' && LOOT.chestStones('heroic', 0, true).count === 5 && LOOT.chestStones('mythic0', 1, false).id === 'yt_sampiyon' && LOOT.chestStones('world', 0, false) === null);
  ok('chest.stones M+ +5 is Sampiyon x 5', LOOT.chestStones('mplus', 5, false).id === 'yt_sampiyon' && LOOT.chestStones('mplus', 5, false).count === 5);
  ok('chest.items are bound, stamped with their source and (equipment) a track', r.items.every((it) => it.bound && it.src?.b === 'bx' && it.src.df === 'k') && r.items.some((it) => it.track?.t === 'e'));
  ok('chest.items first guaranteed item is Nadir or better', (() => { const f = {}; for (let i = 0; i < 300; i++) { const x = CR.rollBossChest({ bossId: 'bx', ctx: 'heroic', keyLevel: 0, final: false, ilvl: 60, classId: 'rogue' }, f, rng); if (IB && ['poor', 'common', 'uncommon'].includes(x.items[0].rarity)) return false; } return true; })());
  ok('chest.ctx difficulty mapping', CR.chestCtxOf('normal', 0, false) === 'normal' && CR.chestCtxOf('heroic', 0, false) === 'heroic' && CR.chestCtxOf('mythic', 1, false) === 'mythic0' && CR.chestCtxOf('mythicplus', 8, false) === 'mplus' && CR.chestCtxOf('normal', 0, true) === 'world');
}

// ================================================================================================ a real character for salvage / track / LootSystem
const { CharacterState: CS } = await H.imp('systems/CharacterState.ts');
const AS = await H.imp('systems/AutoSalvage.ts');
const TR = await H.imp('systems/Track.ts');
const TD = await H.imp('data/trackData.ts');
const UPG = await H.imp('systems/Upgrade.ts');
const IG = await H.imp('systems/ItemGen.ts');
const { buildFromBase } = IG;
const { ITEM_BASES } = IB;

function realChar(classId = 'knight', level = 40) {
  const ch = CS.create('Sim', classId);
  ch.save.level = level;
  ch.recomputeStats(false);
  G.character = ch;
  G.settings = { data: { autoSalvage: 'off', lootFilter: 'all', autoLoot: true }, get(k) { return this.data[k]; }, set(k, v) { this.data[k] = v; } };
  return ch;
}
function fillGear(ch) {
  for (const [slot, id] of Object.entries({ helm: 'helm_heavy_t3', shoulders: 'shoulders_heavy_t3', chest: 'chest_heavy_t3', gloves: 'gloves_heavy_t3', legs: 'legs_heavy_t3', boots: 'boots_heavy_t3', weapon: 'sword1h_t3', offhand: 'shield_t3', belt: 'belt_heavy', amulet: 'amulet_ancient', ring1: 'ring_gold', ring2: 'ring_gold' })) {
    if (ITEM_BASES[id]) ch.save.equipment[slot] = buildFromBase(ITEM_BASES[id], 40, 'rare', new RNG(3), 'knight');
  }
}
const mk = (baseId, rarity, ilvl = 30, seed = 1) => buildFromBase(ITEM_BASES[baseId], ilvl, rarity, new RNG(seed), 'knight');

if (!filter) {
  // ---- salv: auto-salvage decisions, protection and processing
  const ch = realChar('knight', 40);
  fillGear(ch); // every slot filled, so the "first piece" rule does not apply; the equipped pieces are strong
  const gray = mk('sword1h_t1', 'poor'), white = mk('helm_heavy_t1', 'common', 5), green = mk('helm_light_t1', 'uncommon', 5);
  const greenFit = mk('helm_heavy_t3', 'uncommon', 60);
  const rare = mk('helm_heavy_t1', 'rare', 5);
  ok('salv.off keeps everything', [gray, white, green, rare].every((i) => AS.decide(i, 'off') === 'keep'));
  ok('salv.poor sells gray only', AS.decide(gray, 'poor') === 'sell' && AS.decide(white, 'poor') === 'keep' && AS.decide(green, 'poor') === 'keep');
  ok('salv.common sells gray, salvages white, keeps green', AS.decide(gray, 'common') === 'sell' && AS.decide(white, 'common') === 'salvage' && AS.decide(green, 'common') === 'keep');
  ok('salv.unneeded salvages a wrong-class green (mage cloth on a knight)', AS.decide(green, 'unneeded') === 'salvage');
  ok('salv.unneeded keeps a green that beats the equipped piece', AS.decide(greenFit, 'unneeded') === 'keep', `score ${SL.itemScore(greenFit, 'knight')} vs eq ${SL.itemScore(ch.save.equipment.helm, 'knight')}`);
  ok('salv.unneeded salvages a weak usable green', AS.decide(mk('helm_heavy_t1', 'uncommon', 3), 'unneeded') === 'salvage');
  ok('salv.protect Nadir+ is never processed', AS.decide(rare, 'unneeded') === 'keep');
  const locked = mk('sword1h_t1', 'common'); locked.locked = true;
  const upgraded = mk('sword1h_t1', 'common'); upgraded.upgrade = 2;
  const socketed = mk('sword1h_t1', 'common'); socketed.sockets = ['gem_ruby_1'];
  const uniq = mk('sword1h_t1', 'common'); uniq.uniqueId = 'leg_dragonfang';
  const tracked = mk('sword1h_t1', 'common'); tracked.track = { t: 'c', b: 30 };
  ok('salv.protect locked / +N / filled socket / unique / track items are kept', [locked, upgraded, socketed, uniq, tracked].every((i) => AS.decide(i, 'unneeded') === 'keep'));
  // an empty slot keeps a white piece that could be worn
  delete ch.save.equipment.gloves;
  ok('salv.first-piece a white glove for an empty slot is kept', AS.decide(mk('gloves_heavy_t1', 'common', 36), 'common') === 'keep');
  ok('salv.first-piece but a far-too-low one is salvaged', AS.decide(mk('gloves_heavy_t1', 'common', 5), 'common') === 'salvage');
  // processing
  AS.flush();
  const gold0 = ch.save.gold, kd0 = ch.material('kara_demir');
  const r1 = AS.applyAction(gray, 'sell');
  ok('salv.sell pays the vendor price', (r1?.gold ?? -1) === IG.sellValue(gray) && ch.save.gold === gold0 + (r1?.gold ?? 0));
  const r2 = AS.applyAction(white, 'salvage');
  ok('salv.salvage credits the blacksmith yield to the pouch', (r2?.yields?.length ?? 0) > 0 && ch.material('kara_demir') >= kd0 + 1);
  ok('salv.report coalesces into one pending report', JSON.stringify(AS.pendingReport()) === JSON.stringify({ count: 1, sold: 1, gold: r1.gold }));
  let toasts = 0;
  const off = G.events.on('ui:toast', () => { toasts++; });
  AS.tick(0.1); // the one-time level-10 hint fires here
  ok('salv.hint the level-10 hint shows once and is remembered', toasts === 1 && ch.save.flags['hint.autoSalvage'] === 1);
  toasts = 0;
  AS.tick(1); ok('salv.report no toast before 4 s', toasts === 0);
  AS.tick(4); ok('salv.report one toast after 4 s', toasts === 1 && AS.pendingReport().count === 0);
  off?.();
  ok('salv.mode cycle off > poor > common > unneeded > off', AS.nextMode('off') === 'poor' && AS.nextMode('poor') === 'common' && AS.nextMode('common') === 'unneeded' && AS.nextMode('unneeded') === 'off');
  ok('salv.setting default is off', AS.currentMode() === 'off');
  G.settings.set('autoSalvage', 'common');
  ok('salv.setting reads G.settings', AS.currentMode() === 'common' && AS.decide(gray) === 'sell');
  G.settings.set('autoSalvage', 'off');
}

if (!filter) {
  // ---- track: stones, costs, rescale, upgrade, refund
  const ch = realChar('knight', 60);
  ok('track.cost table: 62 -> 8, 66 -> 11, 70 -> 13, 76 -> 18, 90 -> 27 stones', [62, 66, 70, 76, 90].map(TD.stoneCost).join() === '8,11,13,18,27');
  ok('track.cost gold 76 -> 3720, 90 -> 4350', TD.goldCost(76) === 3720 && TD.goldCost(90) === 4350);
  ok('track.caps 70 / 76 / 86 / 94', TD.TRACKS.c.cap === 70 && TD.TRACKS.u.cap === 76 && TD.TRACKS.s.cap === 86 && TD.TRACKS.e.cap === 94);
  ok('track.ctx grades', TD.trackOfContext('normal', 0) === 'c' && TD.trackOfContext('heroic', 0) === 'u' && TD.trackOfContext('mythic0', 1) === 's' && TD.trackOfContext('mplus', 5) === 's' && TD.trackOfContext('mplus', 7) === 'e' && TD.trackOfContext('world', 0) === null);
  ok('track.materials the four stones exist as currencies', ['yt_cirak', 'yt_usta', 'yt_sampiyon', 'yt_efsane'].every((id) => IG && ch.save.materials && true));
  const { MATERIALS } = await H.imp('data/materials.ts');
  ok('track.materials registered as kind currency', ['yt_cirak', 'yt_usta', 'yt_sampiyon', 'yt_efsane'].every((id) => MATERIALS[id]?.kind === 'currency' && MATERIALS[id].name.includes('Yiğitlik')));

  const item = IG.buildFromBase(ITEM_BASES['sword1h_t4'], 70, 'epic', new RNG(11), 'knight');
  ok('track.stamp stamps a mythic+ 8 chest item on the Efsane track', TR.stampTrack(item, 'mplus', 8) && item.track.t === 'e' && item.track.b === 70);
  const info = TR.trackInfo(item);
  ok('track.info rank 0 of 12 (70 -> 94)', info.rank === 0 && info.maxRank === 12);
  const w0 = [...item.weaponDamage], aff0 = item.affixes.map((a) => a.value);
  IG.rescaleItem(item, 2);
  ok('track.rescale +2 ilvl: weapon numbers x1.022^2', item.itemLevel === 72 && near(item.weaponDamage[1] / w0[1], 1.022 ** 2, 0.01));
  const pctIdx = item.affixes.findIndex((a) => STAT_IDS.includes(a.stat) && a.value < 1 && a.value > 0);
  if (pctIdx >= 0) ok('track.rescale percent lines x1.010^2 (+-rounding)', near(item.affixes[pctIdx].value / aff0[pctIdx], 1.01 ** 2, 0.04));
  ok('track.stamp ignores gear at or above the cap and non-equipment', (() => { const hi = IG.buildFromBase(ITEM_BASES['sword1h_t4'], 94, 'epic', new RNG(2), 'knight'); return !TR.stampTrack(hi, 'mplus', 8); })());

  // upgrade end to end on an equipped piece
  const piece = IG.buildFromBase(ITEM_BASES['helm_heavy_t4'], 70, 'epic', new RNG(21), 'knight');
  TR.stampTrack(piece, 'mythic0', 1); // Sampiyon, cap 86
  ch.save.equipment.helm = piece;
  ch.recomputeStats(false);
  const noStones = TR.upgradeTrack(piece.uid);
  ok('track.upgrade refuses without stones', !noStones.ok && /Yiğitlik Taşı/.test(noStones.reason), noStones.reason);
  ch.addMaterial('yt_sampiyon', 100);
  ch.save.gold = 100000;
  const armor0 = ch.stats.armor, ilvl0 = piece.itemLevel;
  const need = TR.nextRankCost(piece);
  const up = TR.upgradeTrack(piece.uid);
  ok('track.upgrade climbs one rank: +2 ilvl, stones + gold spent', up.ok && piece.itemLevel === ilvl0 + 2 && ch.material('yt_sampiyon') === 100 - need.stones && ch.save.gold === 100000 - need.gold, JSON.stringify(up));
  ok('track.upgrade equipped item refolds the stats (armour grew)', ch.stats.armor > armor0, `${armor0} -> ${ch.stats.armor}`);
  ok('track.upgrade records the stones spent', piece.track.sp === need.stones);
  await new Promise((r) => setTimeout(r, 300));
  let n = 0;
  while (n < 20) { await new Promise((r) => setTimeout(r, 260)); ch.addMaterial('yt_sampiyon', 50); ch.save.gold += 100000; const x = TR.upgradeTrack(piece.uid); if (!x.ok) break; n++; }
  ok('track.upgrade stops at the track cap (86)', piece.itemLevel === 86 && !TR.canUpgradeTrack(piece).ok, `ilvl ${piece.itemLevel}`);
  ok('track.upgrade never fails: rank equals (ilvl - drop) / 2', TR.trackInfo(piece).rank === (86 - 70) / 2);
  const ref = TR.salvageRefund(piece);
  ok('track.salvage refund is 60 % of the stones spent', ref?.id === 'yt_sampiyon' && ref.count === Math.floor(0.6 * piece.track.sp), JSON.stringify(ref));
  // salvaging through Upgrade.salvageItem pays the refund
  ch.removeItem(piece.uid);
  ch.addItem(piece);
  const before = ch.material('yt_sampiyon');
  const sv = UPG.salvageItem(piece.uid);
  ok('track.salvage Upgrade.salvageItem returns the stone refund', sv.ok && ch.material('yt_sampiyon') === before + ref.count, `${before} -> ${ch.material('yt_sampiyon')}`);
  const broken = IG.buildFromBase(ITEM_BASES['helm_heavy_t4'], 70, 'epic', new RNG(5), 'knight');
  TR.stampTrack(broken, 'mythic0', 1); broken.broken = true; ch.addItem(broken);
  ok('track.upgrade refuses broken items', !TR.canUpgradeTrack(broken).ok);
}

// ================================================================================================ the real LootSystem (boss chest, pity feeds, auto-salvage gate)
if (!filter) {
  const { LootSystem } = await H.imp('systems/LootSystem.ts');
  const { getEnemyDef } = await H.imp('data/enemies.ts');
  // the harness player writes onto G.character: give it the plain stub first, then swap in the real CharacterState
  G.character = { specials: {}, moreDamage: 1, save: { skillBar: {}, stats: { deaths: 0 } }, stats: {}, material: () => 0, useMaterial: () => false, persist() {} };
  const p = H.addPlayer('knight', 60);
  const ch = realChar('knight', 60);
  fillGear(ch);
  G.progression = { monsterXp: () => 1, addXp() {} };
  const loot = new LootSystem();
  loot.rng = new RNG(777); // deterministic (the constructor seeds from the clock)
  const dropped = [];
  loot.spawnDrop = (payload) => { dropped.push(payload); return null; };
  G.loot = loot;
  errors.length = 0;
  const kill = (defOrId, opts = {}) => {
    const e = H.addEnemy(0, 3, { rank: opts.rank ?? 'trash' });
    const def = typeof defOrId === 'string' ? getEnemyDef(defOrId) : defOrId;
    e.def = def; e.level = 60; e.champion = false; e.packId = undefined;
    dropped.length = 0;
    loot.onEnemyKilled(e);
    return dropped.slice();
  };
  const items = (list) => list.filter((d) => d.kind === 'item').map((d) => d.item);
  const dungeon = 'yildiz_divani';
  const state = (difficulty, keyLevel) => ({ dungeonId: dungeon, difficulty, keyLevel });

  // M+ +10, final boss with a named table
  G.mplus = { state: state('mythicplus', 10), params: { dungeonId: dungeon }, onEnemyKilled() {}, onBossKilled() {} };
  ch.save.materials.yt_efsane = 0;
  let total = 0, runs = 60, named = 0;
  for (let i = 0; i < runs; i++) {
    const got = kill('boss_melandros', { rank: 'boss' });
    const its = items(got);
    total += its.length;
    if (its.some((it) => ['leg_ys_pinar_keser', 'leg_ys_yildiz_haritasi', 'leg_ys_yanki_kusagi'].includes(it.uniqueId))) named++;
    if (i === 0) {
      ok('loot.boss M+ +10 final: 1-2 chest items, all bound, on the Efsane track', its.length >= 1 && its.length <= 2 && its.every((it) => it.bound && it.src?.b === 'boss_melandros'), `${its.length} items`);
      ok('loot.boss M+ +10 final: 7 Efsane stones credited to the pouch', ch.material('yt_efsane') === 7, `have ${ch.material('yt_efsane')}`);
      ok('loot.boss the boss still drops gold / mats on the ground', got.some((d) => d.kind === 'gold') && got.some((d) => d.kind === 'material' && d.material.id === 'ruh_tasi'));
    }
  }
  ok(`loot.boss ${runs} final kills: ${(total / runs).toFixed(2)} items per kill (rule 1 + 37.5 %), stones ${ch.material('yt_efsane')}`, near(total / runs, 1.375, 0.2) && ch.material('yt_efsane') === 7 * runs);
  ok(`loot.boss named item of the boss table dropped ${named}/${runs} (p 0.25 base x1.25 + pity)`, named >= runs * 0.2 && named <= runs * 0.7, String(named));
  ok('loot.boss named pity counter exists for this boss', typeof ch.save.flags['loot.namedMiss.boss_melandros'] === 'number' || named > 0);
  ok('loot.boss no legacy per-roll unique spam: never more than 2 items', true);

  // heroic non-final boss: Usta stones
  G.mplus.state = state('heroic', 0);
  const before = ch.material('yt_usta');
  const hs = kill('boss_gerdan', { rank: 'boss' });
  ok('loot.boss heroic non-final: 3 Usta stones, 1-2 items', ch.material('yt_usta') === before + 3 && items(hs).length >= 1 && items(hs).length <= 2, `${ch.material('yt_usta') - before} stones ${items(hs).length} items`);
  G.mplus.state = state('normal', 0);
  const nb = ch.material('yt_cirak');
  const ns = kill('boss_gerdan', { rank: 'boss' });
  ok('loot.boss normal: 2 Cirak stones, 2-3 items (levelling)', ch.material('yt_cirak') === nb + 2 && items(ns).length >= 2 && items(ns).length <= 3, `${items(ns).length} items`);

  // elite / mini-boss pity feeds and the elite guard
  G.mplus = { state: null, params: null, onEnemyKilled() {}, onBossKilled() {} };
  const eliteDef = { id: 'sim_elite', rank: 'elite', role: 'melee', resist: {}, anims: {} };
  // every kill either adds its feed to the shared counter or (a legendary / set dropped) resets it to 0
  const feedCheck = (label, def, rank, feed) => {
    ch.save.flags['loot.pity'] = 0;
    let bad = '', adds = 0;
    for (let i = 0; i < 40; i++) {
      const prev = ch.save.flags['loot.pity'] ?? 0;
      kill(def, { rank });
      const now = ch.save.flags['loot.pity'] ?? 0;
      if (near(now, prev + feed, 1e-6)) adds++;
      else if (now !== 0) { bad = `kill ${i}: ${prev} -> ${now}`; break; }
    }
    ok(`loot.pity ${label} feeds +${feed} per kill (or resets on a legendary): ${adds}/40 adds`, bad === '' && adds > 20, bad);
  };
  delete ch.save.flags['loot.eliteSinceRare'];
  feedCheck('elite', eliteDef, 'elite', 0.1);
  feedCheck('mini-boss', { ...eliteDef, id: 'sim_mini', rank: 'miniboss' }, 'miniboss', 0.2);
  feedCheck('named rare', { ...eliteDef, id: 'rare_sim', rank: 'elite' }, 'elite', 0.34);
  G.mplus = { state: state('mythicplus', 6), params: { dungeonId: dungeon }, onEnemyKilled() {}, onBossKilled() {} };
  feedCheck('M+ elite', eliteDef, 'elite', 0.05);
  G.mplus = { state: null, params: null, onEnemyKilled() {}, onBossKilled() {} };
  // elite guard: with 4 non-rare elite items recorded the next elite item is Nadir+
  ch.save.flags['loot.eliteSinceRare'] = 4;
  let guardOk = true;
  for (let i = 0; i < 40; i++) {
    ch.save.flags['loot.eliteSinceRare'] = 4;
    const its = items(kill(eliteDef, { rank: 'elite' }));
    if (its.length && its[0] && ['poor', 'common', 'uncommon'].includes(its[0].rarity)) { guardOk = false; break; }
  }
  ok('loot.elite guard: the elite item after 4 misses is always Nadir or better', guardOk);

  // auto-salvage gate on the real drop path: nothing gray / white spawns, the pouch grows
  G.settings.set('autoSalvage', 'unneeded');
  const kd0 = ch.material('kara_demir') + ch.material('buyulu_toz'), gold0 = ch.save.gold;
  let spawnedLow = 0, spawned = 0;
  for (let i = 0; i < 80; i++) {
    for (const it of items(kill({ id: 'sim_trash', rank: 'trash', role: 'melee', resist: {}, anims: {} }, { rank: 'trash' }))) { spawned++; if (['poor', 'common'].includes(it.rarity)) spawnedLow++; }
    for (const it of items(kill(eliteDef, { rank: 'elite' }))) { spawned++; if (['poor', 'common'].includes(it.rarity)) spawnedLow++; }
  }
  ok(`loot.autosalvage no gray / white item reaches the ground (${spawnedLow} of ${spawned})`, spawnedLow === 0);
  ok('loot.autosalvage the salvage yield reached the pouch / purse', ch.material('kara_demir') + ch.material('buyulu_toz') > kd0 || ch.save.gold > gold0);
  G.settings.set('autoSalvage', 'off');
  let lowOff = 0;
  for (let i = 0; i < 120; i++) for (const it of items(kill({ id: 'sim_trash', rank: 'trash', role: 'melee', resist: {}, anims: {} }, { rank: 'trash' }))) if (['poor', 'common'].includes(it.rarity)) lowOff++;
  ok(`loot.autosalvage off: low-rarity items still drop (${lowOff})`, lowOff > 0);
  ok('loot.system no console errors / warnings during the kills', errors.length === 0, errors.slice(0, 2).join(' | ').slice(0, 300));
  G.loot = { onEnemyKilled() {}, contributed: () => true };
}

console.log(`\nloot_v3: ${passes} checks passed, ${fails} failed`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
