// ECONOMY headless check: gold flow per hour at levels 10 / 20 / 30 (docs/MMO_PILLARS.md WP-13). Faucets come from the real reward
// tables (loot DROP_TABLES, quest goldPerLevel, bounty gold, vendor sell values); sinks from the real fee code (waypointFare, repairCost,
// upgradeGold, MARKET fees). Activity rates (kills, trips, attempts, bound share, Pazar share) are ASSUMPTIONS written below: change
// them here, not in the game. Target: sinks >= 60 % of faucets at level 30 (sinks = fees + repairs + upgrade gold).
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/economy.mjs     (V=1 prints every PASS, and the table)
// Stages: flow.* (gold-flow target) | repair.* (Kırık break / repair / equip rules) | links.* (chat item links, validated on receipt)
import * as H from './harness.mjs';

const { G } = H;
const { CharacterState, makeTestItem } = await H.imp('systems/CharacterState.ts');
const { ITEM_BASES } = await H.imp('data/itemBases.ts');
const { DROP_TABLES } = await H.imp('data/loot.ts');
const { upgradeGold, stepOf } = await H.imp('data/upgrades.ts');
const { MARKET } = await H.imp('data/market.ts');
const Upg = await H.imp('systems/Upgrade.ts');
const { waypointFare } = await H.imp('scenes/world/WaypointNetwork.ts');
const { sellValue } = await H.imp('systems/ItemGen.ts');
const Links = await H.imp('systems/ChatLinks.ts');
const { cleanSnapshot } = await H.imp('systems/MarketWire.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

// ------------------------------------------------------------------------------------------------ assumptions (per hour of play)
/** Kills per hour by rank: an open-world + dungeon mix. Same counts at every level (the level sets the gold, not the pace). */
const KILLS_PER_H = { swarm: 60, trash: 220, elite: 16, miniboss: 3, boss: 1 };
/** Open-world trash and swarm gold chance (LootSystem.openWorldTable raises it to at least 0.55). */
const OPEN_WORLD_GOLD_CHANCE = 0.55;
/** Quests per hour (about 19 main quests plus side quests over ~4.5 h) and gold per level of a quest (karakir_quests: 6..12). */
const QUESTS_PER_H = 4;
const QUEST_GOLD_PER_LEVEL = 8;
/** Daily bounties: 100 x level gold each, about 1.5 of them paid per hour of play (3 a day over 2 active hours). */
const BOUNTY_GOLD_PER_H = 1.5;
/** Share of the dropped items the player sells to a vendor (the rest is kept, equipped or salvaged). */
const VENDOR_SELL_SHARE = 0.5;
/** Waypoint trips per hour, and the distance of a typical trip in tiles (hops = 1 + floor(tiles / 60)). */
const TRIPS_PER_H = 3;
const TRIP_TILES = 120;
/** Share of the faucet gold that moves through player stalls (Pazar), and the fees charged there (MARKET.SALE_TAX + LISTING_FEE). */
const PAZAR_SHARE = 0.25;
/** Upgrade attempts per hour and the target range each one tries (uniform). Item level = level + 5. */
const UPGRADE_PLAN = {
  10: { attempts: 1, lo: 2, hi: 5 },
  20: { attempts: 1, lo: 4, hi: 8 },
  30: { attempts: 1, lo: 6, hi: 9 },
};
/** Share of upgraded items that are bound (Efsanevi / Set / Tier / unique): only those break and need repair. */
const BOUND_SHARE = 0.3;
/** Drop rarity mix used to price the loot that goes to the vendor. */
const RARITY_MIX = { common: 0.5, uncommon: 0.25, rare: 0.15, epic: 0.08, legendary: 0.02 };
/** Items per kill (itemChance x itemRolls + extra rolls), open-world trash/swarm boosted as in LootSystem.openWorldTable. */
function itemsPerKill(rank) {
  const t = DROP_TABLES[rank];
  if (rank === 'trash' || rank === 'swarm') return Math.min(1, t.itemChance * 1.5) * t.itemRolls;
  return t.itemChance * (t.itemRolls + (t.extraRolls ?? []).reduce((a, b) => a + b, 0));
}

// ------------------------------------------------------------------------------------------------ faucets
/** Expected gold of one kill of a rank at a level: goldChance x avg x goldMult (LootSystem: avg = 2 + 0.5 x level, mult x 1). */
function goldPerKill(rank, lvl) {
  const t = DROP_TABLES[rank];
  const chance = rank === 'trash' || rank === 'swarm' ? Math.max(t.goldChance, OPEN_WORLD_GOLD_CHANCE) : t.goldChance;
  return chance * (2 + 0.5 * lvl) * t.goldMult;
}

/** Average vendor price of a dropped item at a level (real sellValue of sample items, rarity-weighted). */
function avgSellValue(lvl) {
  const bases = Object.keys(ITEM_BASES).filter((id) => !ITEM_BASES[id].stackable).slice(0, 40);
  let sum = 0;
  let w = 0;
  for (const [rarity, p] of Object.entries(RARITY_MIX)) {
    let s = 0;
    let n = 0;
    for (const id of bases) {
      const it = makeTestItem(id, lvl + 2, rarity, 'knight');
      if (!it) continue;
      s += sellValue(it);
      n++;
    }
    if (n) {
      sum += p * (s / n);
      w += p;
    }
  }
  return w ? sum / w : 0;
}

// ------------------------------------------------------------------------------------------------ one hour at a level
function hourAt(lvl) {
  const f = {};
  f.monsters = Object.entries(KILLS_PER_H).reduce((a, [rank, n]) => a + n * goldPerKill(rank, lvl), 0);
  f.quests = QUESTS_PER_H * QUEST_GOLD_PER_LEVEL * lvl;
  f.bounties = BOUNTY_GOLD_PER_H * 100 * lvl;
  const items = Object.entries(KILLS_PER_H).reduce((a, [rank, n]) => a + n * itemsPerKill(rank), 0);
  f.vendor = items * VENDOR_SELL_SHARE * avgSellValue(lvl);
  const faucets = f.monsters + f.quests + f.bounties + f.vendor;

  const s = {};
  s.waypoints = TRIPS_PER_H * waypointFare(lvl, TRIP_TILES);
  const plan = UPGRADE_PLAN[lvl];
  const ilvl = lvl + 5;
  let upg = 0;
  let rep = 0;
  let n = 0;
  for (let t = plan.lo; t <= plan.hi; t++) {
    n++;
    upg += upgradeGold(ilvl, t);
    const pFail = 1 - Math.min(1, stepOf(t).chance);
    const breaks = stepOf(t).fail === 'destroy' ? pFail * BOUND_SHARE : 0;
    const bill = Upg.repairCost({ broken: true, itemLevel: ilvl, upgradeBroken: t, upgrade: Math.max(0, t - 3), uid: 'x', baseId: 'x', rarity: 'legendary', affixes: [] });
    rep += breaks * (bill?.gold ?? 0);
  }
  s.upgrades = (plan.attempts * upg) / n;
  s.repairs = (plan.attempts * rep) / n;
  s.pazar = PAZAR_SHARE * (f.monsters + f.quests + f.bounties) * (MARKET.SALE_TAX + MARKET.LISTING_FEE);
  const sinks = Object.values(s).reduce((a, b) => a + b, 0);
  return { f, s, faucets, sinks, ratio: sinks / faucets };
}

const rows = [10, 20, 30].map((L) => ({ L, ...hourAt(L) }));
const r30 = rows[2];
if (process.env.V || true) {
  console.log('gold per hour      faucets        sinks   ratio   (monsters, quests, bounties, vendor | waypoints, upgrades, repairs, pazar)');
  for (const r of rows) {
    const fmt = (x) => Math.round(x).toLocaleString('en-US').padStart(9);
    console.log(
      `level ${String(r.L).padStart(2)}  ${fmt(r.faucets)}  ${fmt(r.sinks)}  ${(r.ratio * 100).toFixed(0).padStart(4)}%   ` +
        `(${Object.values(r.f).map(fmt).join(',')} | ${Object.values(r.s).map(fmt).join(',')})  fees only ${(((r.s.waypoints + r.s.repairs + r.s.pazar) / r.faucets) * 100).toFixed(0)}%`,
    );
  }
}
ok('flow.level 30 sinks >= 60 % of faucets', r30.ratio >= 0.6, `${(r30.ratio * 100).toFixed(1)} %`);
ok('flow.level 10 faucets positive', rows[0].faucets > 0);
ok('flow.gold per hour grows with level', rows[0].faucets < rows[1].faucets && rows[1].faucets < rows[2].faucets);

// ------------------------------------------------------------------------------------------------ repair (Kırık)
function fixture(classId = 'knight') {
  const ch = CharacterState.create('Tamirci', classId);
  ch.save.gold = 10_000_000;
  ch.addMaterial('ruh_tasi', 50);
  ch.addMaterial('buyulu_toz', 50);
  G.character = ch;
  return ch;
}
const ch = fixture();
const base = Object.keys(ITEM_BASES).find((id) => ITEM_BASES[id].category === 'sword1h' && !ITEM_BASES[id].stackable) ?? Object.keys(ITEM_BASES)[0];
const bound = makeTestItem(base, 40, 'legendary', 'knight');
bound.bound = true;
bound.upgrade = 12;
bound.itemLevel = 40;
ch.addItem(bound);

ok('repair.bound item detected', Upg.isBoundItem(bound) && !Upg.isBoundItem({ ...bound, rarity: 'rare', bound: false, uniqueId: undefined }));
ok('repair.intact item has no repair bill', Upg.repairCost(bound) === null);

// break as upgradeItem does it (destroy outcome on a bound item): level 12 -> 9, Kırık, bill keeps the old level
bound.broken = true;
bound.upgradeBroken = 12;
bound.upgrade = 9;
const bill = Upg.repairCost(bound);
ok('repair.gold = round(300 x ilvl x (1 + 0.15 x 12))', bill.gold === Math.round(300 * 40 * (1 + 0.15 * 12)), `${bill.gold}`);
ok('repair.ruh tasi = 2 + floor(12 / 4) = 5', bill.materials.find((m) => m.id === 'ruh_tasi')?.count === 5);
ok('repair.buyulu toz x5 (no Kadim Toz material in the game)', bill.materials.find((m) => m.id === 'buyulu_toz')?.count === 5);
ok('repair.broken item cannot be equipped', ch.canEquip(bound).ok === false);

const goldBefore = ch.save.gold;
const r1 = Upg.repairItem(bound.uid);
ok('repair.pays gold and materials, clears Kırık, keeps the level', r1.ok && bound.broken === false && bound.upgrade === 9 && bound.upgradeBroken === undefined && ch.save.gold === goldBefore - bill.gold, r1.reason ?? '');
ok('repair.repaired item passes the Kırık check', !/Kırık/.test(ch.canEquip(bound).reason ?? ''));
ok('repair.repairing an intact item is refused', Upg.repairItem(bound.uid).ok === false);

const poor = fixture();
const brk = makeTestItem(base, 40, 'legendary', 'knight');
brk.bound = true;
brk.broken = true;
brk.upgradeBroken = 12;
brk.upgrade = 9;
poor.addItem(brk);
poor.save.gold = 1;
ok('repair.not enough gold refuses and keeps Kırık', Upg.repairItem(brk.uid).ok === false && brk.broken === true);

// a Kırık item in equipment contributes 0 stats (StatCalc skips it)
{
  const e = fixture();
  const worn = makeTestItem(base, 40, 'legendary', 'knight');
  worn.bound = true;
  e.save.equipment.weapon = worn;
  e.recomputeStats();
  const withItem = JSON.stringify(e.stats);
  worn.broken = true;
  e.recomputeStats();
  ok('repair.Kırık equipped item adds no stats', JSON.stringify(e.stats) !== withItem);
}

// ------------------------------------------------------------------------------------------------ chat item links
const made = makeTestItem(base, 30, 'rare', 'knight');
const linked = Links.itemLink(made);
ok('links.tag is [name] from the validated snapshot', !!linked && linked.tag.startsWith('[') && linked.tag.endsWith(']'));
const rx = Links.sanitizeLinks([linked.link, { k: 'item', item: { baseId: 'no_such_base', rarity: 'rare', itemLevel: 1, affixes: [] } }, { k: 'loc', zone: 'x', x: 0, z: 0, label: 'y' }]);
ok('links.unknown bases and other kinds are dropped', rx.length === 1 && rx[0].k === 'item');
ok('links.at most LINK_MAX (2) links per message', Links.sanitizeLinks([linked.link, linked.link, linked.link]).length === Links.LINK_MAX);
ok('links.receiver tag equals the sender tag', Links.linkTag(Links.snapshotName(rx[0].item)) === linked.tag);
const hostile = cleanSnapshot({ baseId: base, rarity: 'rare', itemLevel: 1e9, affixes: [{ affixId: '__proto__', value: 1e12, tier: 99 }], name: 'x'.repeat(500) });
// the display copy drops affix ids that are not known (fromSnapshot -> rolled), numbers are clamped at the wire
const shown = Links.linkedDisplayItem(hostile);
ok('links.hostile numbers clamped, unknown affix dropped on display', !!hostile && hostile.itemLevel <= 999 && hostile.affixes.every((a) => Math.abs(a.value) <= 1e6) && (hostile.name ?? '').length <= 64 && shown.affixes.every((a) => a.affixId !== '__proto__'));
const before = ch.save.bag.filter(Boolean).length;
Links.linkedDisplayItem(rx[0].item);
ok('links.a received link is display only (never stored)', ch.save.bag.filter(Boolean).length === before);

console.log(`economy: ${passes} passed, ${fails} failed`);
H.restoreConsole();
console.log(fails === 0 ? 'PASS' : 'FAIL');
process.exit(fails === 0 ? 0 : 1);
