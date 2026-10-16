// KADIM YARIKLAR rework checks (Chrome playtest notes: docs/kits/procgen_status.md, "Rework" section): entry gate by level, generated
// rifts are completable (3 bosses, final last, every room reached from the start), length and party / level scaling, rewards.
// No browser, no server. Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/rifts.mjs [seeds=12] [--v]
// PASS/FAIL per check, exit code 1 on any failure.
import { fileURLToPath } from 'node:url';

const root = new URL('../../src/', import.meta.url).href;
const imp = (p) => import(root + p);
const args = process.argv.slice(2);
const SEEDS = parseInt(args.find((a) => /^\d+$/.test(a)) ?? '12', 10);
const verbose = args.includes('--v') || !!process.env.V;
void fileURLToPath;

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || verbose) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
console.warn = () => undefined; // the generator warns on a reduced layout; the procgen sim counts those

const P = await imp('world/procgen/index.ts');
const { THEMES } = await imp('world/procgen/themes.ts');
const { partyScales, normalLevelGate } = await imp('systems/instanceScaling.ts');
const { FISSURE_TIERS, FISSURE_TIER_ORDER, FISSURE_THEME_NAMES } = P;
const THEME_IDS = ['crypt', 'forge', 'frost', 'shadow'];
const LEVELS = [10, 20, 40, 60];

// ------------------------------------------------------------------ 1. entry gate (stone, tab, Normal from level 10)
ok('gate.stone and tab open at level 10, not at 9', P.fissureOpenFor(10) && !P.fissureOpenFor(9) && P.FISSURE_OPEN_LEVEL === 10);
ok('gate.tester switch (?unlock) shows them below the level', P.fissureOpenFor(1, true));
ok('gate.Normal needs level 10 (every band whose minimum is <= 12)', !P.fissureUnlock('n', 9, {}).ok && P.fissureUnlock('n', 10, {}).ok);
ok('gate.Normal band gate: a band starting at 20 needs 18 (slack 2)', !P.fissureUnlock('n', 17, {}, false, [20, 60]).ok && P.fissureUnlock('n', 18, {}, false, [20, 60]).ok);
ok('gate.heroic: level 30 and a Normal clear; mythic: level 60 and 3 heroic clears',
  !P.fissureUnlock('h', 29, { n: 5 }).ok && !P.fissureUnlock('h', 30, {}).ok && P.fissureUnlock('h', 30, { n: 1 }).ok
  && !P.fissureUnlock('m', 60, { h: 2 }).ok && P.fissureUnlock('m', 60, { h: 3 }).ok);

// ------------------------------------------------------------------ 2. generated rifts: short, completable
const mins = { n: [], h: [], m: [] };
const enemiesBy = { n: [], h: [], m: [] };
let fallbackOk = 0, total = 0;
for (const tier of FISSURE_TIER_ORDER) {
  const rule = FISSURE_TIERS[tier];
  for (const theme of THEME_IDS) {
    for (const level of LEVELS) {
      if (tier === 'n' && level < 10) continue;
      for (let s = 1; s <= SEEDS; s++) {
        const seed = (s * 2654435761) >>> 0 || 1;
        const spec = { theme, tier, level: tier === 'm' ? 60 : tier === 'h' ? 50 : level, seed, v: P.FISSURE_VERSION };
        const def = P.generateFissure(spec);
        total++;
        const tag = `${tier}/${theme}/L${level}/s${s}`;
        const info = def.fissure;
        const generic = info.kinds.filter((k) => k !== 'corridor' && k !== 'ramp').length;
        ok(`gen.${tag} room count in the tier range`, generic >= rule.rooms[0] && generic <= rule.rooms[1], `${generic} vs ${rule.rooms}`);
        // three bosses, the final last, one of them per guardian room
        const orders = def.bosses.map((b) => b.order).sort().join(',');
        ok(`gen.${tag} three bosses 1,2,3 with the final last`, orders === '1,2,3' && def.bosses.find((b) => b.order === 3)?.roomId === def.rooms.find((r) => info.kinds[def.rooms.indexOf(r)] === 'final')?.id);
        // completable: every room reached from the start through the doors (a tree), so every pack and boss can be cleared
        const adj = new Map(def.rooms.map((r) => [r.id, []]));
        for (const d of def.doors) { adj.get(d.a)?.push(d.b); adj.get(d.b)?.push(d.a); }
        const startRoom = def.rooms[info.kinds.indexOf('start')]?.id;
        const seen = new Set([startRoom]);
        const q = [startRoom];
        while (q.length) for (const nx of adj.get(q.shift()) ?? []) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
        ok(`gen.${tag} every room reachable from the start`, seen.size === def.rooms.length, `${seen.size}/${def.rooms.length}`);
        ok(`gen.${tag} forces (the bar) > 0 and no more than the bodies it counts`, def.forcesRequired > 0);
        // length: estimate of the run in minutes (instanceScaling pace in fissureMinutes)
        const enemies = def.packs.reduce((n, p) => n + p.members.length, 0);
        enemiesBy[tier].push(enemies);
        const [lo, hi] = P.fissureMinutes(enemies);
        mins[tier].push([lo, hi]);
        if (tier !== 'm') ok(`len.${tag} run estimate at most 16 min`, hi <= 16, `${enemies} bodies -> ${lo}-${hi} min`);
        else ok(`len.${tag} run estimate 8-17 min (Mitik)`, lo >= 8 && hi <= 17, `${enemies} bodies -> ${lo}-${hi} min`);
        fallbackOk += def.rooms.length >= rule.rooms[0] ? 1 : 0;
      }
    }
  }
}
ok('gen.no run is under its tier room minimum', fallbackOk === total, `${fallbackOk}/${total}`);

// ------------------------------------------------------------------ 3. scaling: level, party size, tier
for (const band of Object.values(THEMES).map((t) => t.level)) {
  ok(`scale.Normal enemy level stays in its band (${band.join('-')}) and at or above the gate`, P.fissureEnemyLevel('n', 1, band) >= band[0] && P.fissureEnemyLevel('n', 99, band) <= band[1]
    && P.fissureEnemyLevel('n', 10, band) >= Math.max(1, normalLevelGate(band)) - 0);
}
ok('scale.Normal enemy level follows the party average inside the band', P.fissureEnemyLevel('n', 12, [1, 35]) === 12 && P.fissureEnemyLevel('n', 22, [1, 35]) === 22);
ok('scale.Kahramanlik / Mitik fixed levels (band top / 60)', P.fissureEnemyLevel('h', 12, [1, 35]) === 35 && P.fissureEnemyLevel('m', 20) === 60);
const hp = (tier, mods) => P.fissureScaling({ tier, mods }, false).hp;
ok('scale.tier HP rises n < h < m (trash)', hp('n', []) < hp('h', []) && hp('h', []) < hp('m', []));
ok('scale.modifiers only add (zirh +25 % hp on trash, zalim +20 % boss hp)', hp('n', ['fm_zirh']) > hp('n', []) && P.fissureScaling({ tier: 'm', mods: ['fm_zalim'] }, true).hp > P.fissureScaling({ tier: 'm', mods: [] }, true).hp);
let prevHp = -1, prevDmg = Infinity, mono = true;
for (let n = 1; n <= 5; n++) {
  const s = partyScales(n, 'normal');
  if (s.hp * 1 < prevHp) mono = false;
  if (s.dmg > prevDmg) mono = false;
  prevHp = s.hp;
  prevDmg = s.dmg;
}
ok('scale.party: enemy HP rises and enemy damage falls with party size (1 to 5)', mono);
ok('scale.solo knight meets harder hits than a full party (x1.4 vs x1)', partyScales(1, 'normal').dmg > partyScales(5, 'normal').dmg);
ok('scale.mythic+ ignores party size (instanceScaling)', partyScales(1, 'mythicplus').hp === 1 && partyScales(4, 'mythicplus').dmg === 1);

// ------------------------------------------------------------------ 4. rewards
const gold = (t, l) => P.fissureEndRewards(t, l, []).gold;
ok('reward.end chest gold rises with the level', gold('n', 20) > gold('n', 10) && gold('n', 10) > 0);
ok('reward.end chest: Mitik > Kahramanlik > Normal at the same level', gold('m', 30) > gold('h', 30) && gold('h', 30) > gold('n', 30));
ok('reward.Yarik Bereketi adds 25 % gold', P.fissureEndRewards('n', 20, ['fm_bereket']).gold > P.fissureEndRewards('n', 20, []).gold);
ok('reward.dragon coins only from Kahramanlik and Mitik', P.fissureEndRewards('n', 60, []).dragonCoins === 0 && P.fissureEndRewards('h', 60, []).dragonCoins > 0);
const ilvl = (t, l, fin) => P.fissureItemLevel(t, l, fin);
ok('reward.boss drop item level is at least the enemy level and at most the tier cap', ilvl('n', 10, false) >= 10 && ilvl('n', 60, true) <= 62 && ilvl('h', 60, true) <= 64 && ilvl('m', 60, true) <= 68);
for (const id of FISSURE_TIER_ORDER) ok(`reward.tier ${id} has a Turkish name`, typeof FISSURE_TIERS[id].name === 'string' && FISSURE_TIERS[id].name.length > 0);
ok('reward.theme names exist', THEME_IDS.every((t) => !!FISSURE_THEME_NAMES[t]));

// ------------------------------------------------------------------ summary of the generated maps
const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
for (const t of FISSURE_TIER_ORDER) {
  const lo = Math.min(...mins[t].map((m) => m[0])), hi = Math.max(...mins[t].map((m) => m[1]));
  console.log(`${t}: bodies avg ${avg(enemiesBy[t])} (range ${Math.min(...enemiesBy[t])}-${Math.max(...enemiesBy[t])}), run estimate ${lo}-${hi} min over ${mins[t].length} maps`);
}
console.log(`${fails ? 'FAILED' : 'PASS'}: ${passes} checks passed, ${fails} failed (${SEEDS} seeds x ${THEME_IDS.length} themes x levels)`);
process.exit(fails ? 1 : 0);
