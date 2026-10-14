// PVP GEAR (GDD_PVP_FINDER §3.7, §4, §3.2) headless checks - no browser, no network.
//   cur.*    currencies (onur_puani, fetih_puani, fetih_muhru) and the Onur migration of the world-PvP honour
//   cap.*    Onur daily cap 1500, Fetih weekly cap min(3000, 1000 + 250 x (week_in_season - 1)), week_in_season
//   gear.*   PvP pieces for the 7 playable classes: ilvl track, pvp flag, set id, PvP line, no failure
//   upg.*    pvpUpgrade: 52 -> 58 (2 muhur) -> 62 (4 muhur), hard cap, keeps affixes / gems / +N, refusals
//   buy.*    Savas Ustasi (Onur) and Fetih Muhafizi (Fetih, weekly limits) through Vendor.buy
//   norm.*   StatCalc arena normalisation (PvE items x0.6, PvP items x1.0), pvpPower / pvpResilience context, spec trait, set rules
//   arena.*  arena maps: spawns in bounds, pillars clear of spawns, deterministic pickArenaMap, getDungeon resolves arenas only
//   town.*   the two PvP vendors are placed beside the west gate with their vendor kinds
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/pvpgear.mjs      (V=1 prints every PASS)
import * as H from './harness.mjs';

const { G } = H;
let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

const { MATERIALS } = await H.imp('data/materials.ts');
const G2 = await H.imp('systems/PvpGear.ts');
const costs = await H.imp('data/pvp/costs.ts');
const setsMod = await H.imp('data/pvp/sets.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { computeStats, setStatContext, pvpStatCtx, ARENA_PVE_ITEM_MULT } = await H.imp('systems/StatCalc.ts');
const { itemStats, generateItem } = await H.imp('systems/ItemGen.ts');
const { RNG } = await H.imp('core/utils.ts');
const { STAT_INFO } = await H.imp('types/stats.ts');
const Vendor = await H.imp('systems/Vendor.ts');
const { ARENAS, ARENA_IDS, arenaToDungeonDef, pickArenaMap } = await H.imp('data/arenas/index.ts');
const { getDungeon, DUNGEON_IDS } = await H.imp('data/dungeons/index.ts');
const { TOWN } = await H.imp('data/town.ts');
const { currentWeek } = await H.imp('data/mythicAffixes.ts');

const PLAYABLE = ['knight', 'barbarian', 'mage', 'rogue', 'paladin', 'warlock', 'necromancer'];
const SLOTS = ['helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots'];

// ---- a real character (CharacterState) as G.character
function freshChar(cls = 'knight') {
  const ch = CharacterState.create('Sim', cls);
  G.character = ch;
  return ch;
}
const flagsReset = (ch) => { for (const k of Object.keys(ch.save.flags)) if (k.startsWith('pvp.')) delete ch.save.flags[k]; };

// ================================================================================================ cur
{
  ok('cur.onur defined as currency', MATERIALS.onur_puani?.kind === 'currency' && MATERIALS.onur_puani.sellPrice === 0);
  ok('cur.fetih defined as currency', MATERIALS.fetih_puani?.kind === 'currency');
  ok('cur.muhur defined as upgrade material', MATERIALS.fetih_muhru?.kind === 'upgrade');
  const ch = freshChar('knight');
  ch.save.pvp = { kills: 2, deaths: 1, honour: 300, honourTotal: 300, bestStreak: 0, captures: 0 };
  flagsReset(ch);
  ok('cur.migrate: nothing moved before the first Onur change', ch.material('onur_puani') === 0);
  const g1 = G2.grantOnur(10, 'kill');
  ok('cur.migrate: honour 300 moved once, plus the grant', ch.material('onur_puani') === 310 && g1 === 10, `onur=${ch.material('onur_puani')}`);
  G2.grantOnur(5, 'kill');
  ok('cur.migrate: not moved twice', ch.material('onur_puani') === 315, `onur=${ch.material('onur_puani')}`);
  ok('cur.scoreboard honour kept', ch.save.pvp.honour === 300);
}

// ================================================================================================ cap
{
  const ch = freshChar('knight');
  flagsReset(ch);
  const first = G2.grantOnur(2000, 'kill');
  ok('cap.onur daily cap 1500 on earning', first === 1500, `granted ${first}`);
  ok('cap.onur second grant same day is 0', G2.grantOnur(50, 'flip') === 0);
  ok('cap.onur today reports cap', G2.onurToday().left === 0 && G2.onurToday().cap === 1500);
  const f = G2.grantFetih(5000);
  const w = G2.fetihThisWeek();
  ok('cap.fetih grant equals this week cap', f === w.cap && w.left === 0, `granted ${f} cap ${w.cap}`);
  ok('cap.fetih second grant is 0', G2.grantFetih(10) === 0);
  ok('cap.fetih currency balance equals grant', ch.material('fetih_puani') === f);
  ok('cap.weekInSeason 0..7 -> 1..8', [0, 1, 7, 8, 15].map((x) => G2.weekInSeason(x)).join(',') === '1,2,8,1,8');
  const caps = [1, 2, 3, 8].map((k) => costs.fetihWeeklyCap(k));
  ok('cap.formula 1000,1250,1500,2750', caps.join(',') === '1000,1250,1500,2750', caps.join(','));
  ok('cap.formula clamps at 3000', costs.fetihWeeklyCap(99) === 2750 && costs.FETIH_WEEK_MAX === 3000);
  ok('cap.onur daily constant 1500', costs.ONUR_DAILY_CAP === 1500);
}

// ================================================================================================ gear
{
  let nulls = 0;
  let bad = 0;
  for (const cls of PLAYABLE) {
    for (const slot of [...SLOTS, 'weapon']) {
      const it = G2.createPvpItem(slot, 'er', cls, new RNG(7 + nulls + bad));
      if (!it) { nulls++; continue; }
      const okShape = it.pvp === true && it.itemLevel === 52 && it.bound === true
        && (slot === 'weapon' ? !it.setId : it.setId === `pvp_${cls}`)
        && it.affixes.some((a) => a.stat === (slot === 'weapon' ? 'pvpPower' : 'pvpResilience') && a.locked);
      if (!okShape) bad++;
    }
  }
  ok('gear.create every class x slot builds an Er piece', nulls === 0 && bad === 0, `nulls=${nulls} bad=${bad}`);
  const sampiyon = G2.createPvpItem('chest', 'sampiyon', 'knight', new RNG(3));
  ok('gear.tier Şampiyon is ilvl 58', sampiyon?.itemLevel === 58);
  ok('gear.tier Şampiyon+ is ilvl 62', G2.createPvpItem('boots', 'sampiyon_plus', 'mage', new RNG(4))?.itemLevel === 62);
  // PvE lines are 80 % of a PvE item of the same ilvl: compare the first flat line's stat sum against a PvE roll with the same seed family
  const pve = generateItem({ itemLevel: 52, rarity: 'epic', category: 'chest', classId: 'knight', smart: true }, new RNG(9));
  const pvp = G2.createPvpItem('chest', 'er', 'knight', new RNG(9));
  const pveSum = pve.affixes.reduce((s, a) => s + Math.abs(a.value), 0);
  const pvpSum = pvp.affixes.filter((a) => !a.affixId.startsWith('fx:')).reduce((s, a) => s + Math.abs(a.value), 0);
  ok('gear.pve share: PvP lines at most PvE value', pvpSum <= pveSum + 1e-6, `pve=${pveSum.toFixed(3)} pvp=${pvpSum.toFixed(3)}`);
}

// ================================================================================================ upg
{
  const ch = freshChar('knight');
  flagsReset(ch);
  const it = G2.createPvpItem('chest', 'er', 'knight', new RNG(11));
  ch.addItem(it);   // the real placement path
  const before = JSON.parse(JSON.stringify(it));
  const r0 = G2.pvpUpgrade(it);
  ok('upg.refuse without muhur', !r0.ok && /mühür/i.test(r0.reason ?? ''), r0.reason);
  ch.addMaterial('fetih_muhru', 1);
  ok('upg.refuse with one muhur (needs 2)', !G2.pvpUpgrade(it).ok);
  ch.addMaterial('fetih_muhru', 1);
  const r1 = G2.pvpUpgrade(it);
  ok('upg.52 -> 58 for 2 muhur', r1.ok && it.itemLevel === 58 && r1.to === 58 && r1.cost === 2 && ch.material('fetih_muhru') === 0, JSON.stringify(r1));
  ok('upg.keeps affix count, ids, sockets, +N, pvp, bound', it.affixes.length === before.affixes.length
    && it.affixes.every((a, i) => a.affixId === before.affixes[i].affixId) && (it.sockets?.length ?? 0) === (before.sockets?.length ?? 0)
    && (it.upgrade ?? 0) === 0 && it.pvp === true && it.bound === true);
  const flatBefore = before.affixes.find((a) => !String(a.affixId).startsWith('fx:') && !STAT_INFO[a.stat]?.pct);
  if (flatBefore) {
    const after = it.affixes.find((a) => a.affixId === flatBefore.affixId);
    ok('upg.flat lines grow with the ilvl', after.value >= flatBefore.value, `${flatBefore.value} -> ${after.value}`);
  }
  ok('upg.pvp line grows slightly (pct rescale)', (it.affixes.find((a) => a.stat === 'pvpResilience')?.value ?? 0) >= (before.affixes.find((a) => a.stat === 'pvpResilience')?.value ?? 0));
  ch.addMaterial('fetih_muhru', 3);
  ok('upg.58 -> 62 refused with 3 muhur (needs 4)', !G2.pvpUpgrade(it).ok && it.itemLevel === 58);
  ch.addMaterial('fetih_muhru', 1);
  const r2 = G2.pvpUpgrade(it);
  ok('upg.58 -> 62 for 4 muhur', r2.ok && it.itemLevel === 62 && r2.cost === 4 && ch.material('fetih_muhru') === 0);
  ch.addMaterial('fetih_muhru', 99);
  const r3 = G2.pvpUpgrade(it);
  ok('upg.hard cap at 62', !r3.ok && it.itemLevel === 62 && /en yüksek/i.test(r3.reason ?? ''), r3.reason);
  const pveItem = generateItem({ itemLevel: 52, rarity: 'rare', category: 'helm', classId: 'knight' }, new RNG(2));
  ch.addItem(pveItem);
  ok('upg.refuse a non-PvP item', !G2.pvpUpgrade(pveItem).ok);
  ok('upg.step table', G2.pvpNextStep(it) === null && G2.pvpNextStep(G2.createPvpItem('helm', 'er', 'knight', new RNG(1))).cost === 2);
}

// ================================================================================================ buy
{
  const ch = freshChar('knight');
  flagsReset(ch);
  ch.save.gold = 10000000;
  const honor = Vendor.vendorEntries('pvp_honor');
  ok('buy.honor stock has 7 Er rows', honor.length === 7 && honor.every((e) => e.currency === 'onur_puani' && e.item?.itemLevel === 52), `n=${honor.length}`);
  const helm = honor.find((e) => e.item && /Kaskı/.test(e.item.name ?? ''));
  const gold0 = ch.save.gold;
  const r0 = Vendor.buy(helm, 1);
  ok('buy.onur refused with no Onur', !r0.ok && /Onur/.test(r0.reason ?? ''), r0.reason);
  ch.addMaterial('onur_puani', 800);
  const r1 = Vendor.buy(helm, 1);
  ok('buy.onur 800 Onur buys a helm, no gold spent', r1.ok && ch.material('onur_puani') === 0 && ch.save.gold === gold0 && !!ch.findItem(helm.item.uid));
  const fetih = Vendor.vendorEntries('pvp_conquest');
  ok('buy.fetih stock has 8 rows (7 pieces + mühür pack)', fetih.length === 8, `n=${fetih.length}`);
  const pack = fetih.find((e) => e.materialId === 'fetih_muhru');
  ok('buy.fetih mühür pack pays 5 per purchase, weekly 4', pack && pack.perUnit === 5 && pack.weeklyLimit === 4);
  ch.addMaterial('fetih_puani', 10000);
  let bought = 0;
  for (let i = 0; i < 4; i++) if (Vendor.buy(pack, 1).ok) bought++;
  ok('buy.weekly 4 packs bought', bought === 4 && ch.material('fetih_muhru') === 20, `bought=${bought} muhur=${ch.material('fetih_muhru')}`);
  const r5 = Vendor.buy(pack, 1);
  ok('buy.weekly fifth pack refused', !r5.ok && /Haftalık sınır/.test(r5.reason ?? ''), r5.reason);
  ok('buy.weekly fetih spent 4 x 60', ch.material('fetih_puani') === 10000 - 240);
  // the Şampiyon weapon / armour rows carry the weekly limit key and show stock
  const weapon = fetih.find((e) => e.weeklyKey === 'pvp_conquest.weapon');
  ok('buy.weekly item row has limit 1', weapon?.weeklyLimit === 1 && weapon.item?.itemLevel === 58);
  ok('buy.fetih refuses without Fetih', (() => { const c2 = freshChar('knight'); c2.save.gold = 1e7; const e = Vendor.vendorEntries('pvp_conquest').find((x) => x.item); return !Vendor.buy(e, 1).ok; })());
}

// ================================================================================================ norm
{
  const ch = freshChar('knight');
  flagsReset(ch);
  const base = computeStats(ch.save, 1, { arena: false, pvp: false }).stats;
  // a PvE chest at ilvl 60, rolled with the item module
  const pveChest = generateItem({ itemLevel: 60, rarity: 'epic', category: 'chest', classId: 'knight', smart: true }, new RNG(21));
  ch.save.equipment.chest = pveChest;
  const pve = computeStats(ch.save, 1, { arena: false, pvp: false }).stats;
  const arena = computeStats(ch.save, 1, { arena: true, pvp: true }).stats;
  const expect = itemStats(pveChest, 'chest');
  const skip = new Set(['str', 'dex', 'int', 'vit', 'maxHp', 'maxHpPct', 'hpRegen', 'pvpPower', 'pvpResilience', 'allAttr']);
  // only raw lines are checked: StatCalc copies them unchanged, derived stats (armour %, resources) are not linear in the item
  let checked = 0;
  let worst = 0;
  for (const k of Object.keys(expect)) {
    if (skip.has(k) || !expect[k]) continue;
    if (Math.abs((pve[k] ?? 0) - (base[k] ?? 0) - expect[k]) > 1e-6) continue;
    checked++;
    // whole-number stats are rounded by StatCalc (half a point of slack)
    const err = Math.abs((arena[k] ?? 0) - (base[k] ?? 0) - ARENA_PVE_ITEM_MULT * expect[k]);
    worst = Math.max(worst, Number.isInteger(expect[k]) ? Math.max(0, err - 0.5) : err);
  }
  ok(`norm.pve item lines x0.6 in arena (${checked} raw stats)`, checked > 0 && worst < 1e-6, `worst=${worst}`);
  // PvP piece: 100 % in arena
  const pvpChest = G2.createPvpItem('chest', 'er', 'knight', new RNG(33));
  ch.save.equipment.chest = pvpChest;
  const pvpE = computeStats(ch.save, 1, { arena: false, pvp: false }).stats;
  const pvpA = computeStats(ch.save, 1, { arena: true, pvp: true }).stats;
  const pvpItemStats = itemStats(pvpChest, 'chest');
  const pvpBase = computeStats(freshCharNoGear().save, 1, { arena: false, pvp: false }).stats;
  let pvpWorst = 0;
  let pvpChecked = 0;
  for (const k of Object.keys(pvpItemStats)) {
    if (skip.has(k) || !pvpItemStats[k]) continue;
    if (Math.abs((pvpE[k] ?? 0) - (pvpBase[k] ?? 0) - pvpItemStats[k]) > 1e-6) continue;
    pvpChecked++;
    pvpWorst = Math.max(pvpWorst, Math.abs((pvpA[k] ?? 0) - (pvpBase[k] ?? 0) - pvpItemStats[k]));
  }
  ok(`norm.PvP piece counts 100 % in arena (${pvpChecked} raw stats)`, pvpChecked > 0 && pvpWorst < 1e-6, `worst=${pvpWorst}`);
  ok('norm.pvpResilience off in PvE', (pvpE.pvpResilience ?? 0) === 0);
  ok('norm.pvpResilience on in arena', (pvpA.pvpResilience ?? 0) > 0, `${pvpA.pvpResilience}`);
  // spec trait: arena only
  ch.save.equipment.chest = undefined;
  ch.save.spec = 'knight_protector';
  const tE = computeStats(ch.save, 1, { arena: false, pvp: false }).stats.damageReductionPct ?? 0;
  const tA = computeStats(ch.save, 1, { arena: true, pvp: true }).stats.damageReductionPct ?? 0;
  ok('norm.spec trait arena only (+3 %)', Math.abs((tA - tE) - 0.03) < 1e-9, `E=${tE} A=${tA}`);
  delete ch.save.spec;
  // set: 6 pieces of one class count, a mismatched class does not
  const set = Object.fromEntries(setsMod.PVP_ARMOUR_SLOTS.map((s) => [s, G2.createPvpItem(s, 'er', 'knight', new RNG(40))]));
  const knight = freshCharNoGear();
  for (const s of setsMod.PVP_ARMOUR_SLOTS) knight.save.equipment[s] = set[s];
  const kSpec = computeStats(knight.save, 1, { arena: true, pvp: true });
  ok('norm.set six pieces trigger the Savaş Ruhu bonus', !!kSpec.specials?.pvp_savas_ruhu, Object.keys(kSpec.specials ?? {}).join(','));
  const mage = freshCharNoGear('mage');
  for (const s of setsMod.PVP_ARMOUR_SLOTS) mage.save.equipment[s] = set[s];
  const mSpec = computeStats(mage.save, 1, { arena: true, pvp: true });
  ok('norm.set of another class is not counted', !mSpec.specials?.pvp_savas_ruhu);
  // PvP stat context default is PvE
  ok('norm.default context is PvE', pvpStatCtx.arena === false && pvpStatCtx.pvp === false);
  setStatContext({ arena: true });
  ok('norm.setStatContext(arena) implies pvp', pvpStatCtx.arena === true && pvpStatCtx.pvp === true);
  setStatContext({});
}
function freshCharNoGear(cls = 'knight') {
  return freshChar(cls);
}

// ================================================================================================ arena
{
  ok('arena.three maps', ARENA_IDS.length === 3, ARENA_IDS.join(','));
  for (const id of ARENA_IDS) {
    const a = ARENAS[id];
    const inb = (p) => p[0] >= 0 && p[1] >= 0 && p[0] <= a.grid.w && p[1] <= a.grid.h;
    const spawnsOk = [...a.spawns.A, ...a.spawns.B].every(inb);
    ok(`arena.${id} spawns in bounds`, spawnsOk);
    ok(`arena.${id} three spawns per team`, a.spawns.A.length === 3 && a.spawns.B.length === 3);
    const clear = a.pillars.every((p) => [...a.spawns.A, ...a.spawns.B].every((s) => Math.hypot(s[0] - p.pos[0], s[1] - p.pos[1]) > p.r + 0.5));
    ok(`arena.${id} pillars clear of spawns`, clear);
    const gatesOk = a.gates.every((g) => (g.team === 'A' ? g.rect.x === 0 : g.rect.x + g.rect.w === a.grid.w) && g.rect.z >= 0 && g.rect.z + g.rect.h <= a.grid.h);
    ok(`arena.${id} gates touch the outer wall`, gatesOk);
    const def = arenaToDungeonDef(a);
    ok(`arena.${id} adapter: one room, no packs, timer 300`, def.rooms.length === 1 && def.packs.length === 0 && def.timerSec === 300 && def.rooms[0].rect.w === a.grid.w);
    ok(`arena.${id} adapter: props = pillars + wall cells`, (def.rooms[0].props?.length ?? 0) === a.pillars.length + a.walls.reduce((s, w) => s + w.w * w.h, 0));
  }
  const m1 = pickArenaMap('abcd1234', '1v1');
  ok('arena.1v1 maps only kirik_kemer', ['abcd1234', 'zz', 'qq9'].every((mid) => pickArenaMap(mid, '1v1')?.id === 'kirik_kemer'));
  ok('arena.3v3 maps are kizil_halka or buz_havuzu', ['a1', 'b2', 'c3', 'd4'].every((mid) => ['kizil_halka', 'buz_havuzu'].includes(pickArenaMap(mid, '3v3')?.id)));
  ok('arena.pick deterministic', pickArenaMap('mid-x', '2v2')?.id === pickArenaMap('mid-x', '2v2')?.id && !!m1);
  ok('arena.getDungeon resolves arena ids', !!getDungeon('kizil_halka') && getDungeon('kizil_halka').id === 'kizil_halka');
  ok('arena.DUNGEON_IDS stays free of arenas', !DUNGEON_IDS.some((id) => ARENA_IDS.includes(id)));
}

// ================================================================================================ town
{
  const npc = (id) => TOWN.npcs.find((n) => n.id === id);
  const sav = npc('npc_savas_ustasi');
  const fet = npc('npc_fetih_muhafizi');
  ok('town.savas ustasi at the west gate with pvp_honor', sav?.role === 'pvp' && sav.ui?.kind === 'pvp_honor' && sav.pos[0] < -120);
  ok('town.fetih muhafizi at the west gate with pvp_conquest', fet?.role === 'pvp' && fet.ui?.kind === 'pvp_conquest' && fet.pos[0] < -120);
  ok('town.week helper live', Number.isFinite(currentWeek()));
}

console.log(`\nPVPGEAR sim: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
