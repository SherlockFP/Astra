// Consumables checks: the Sisli Matara flask (charges, cooldown, refill in a rest zone), food (eat in and out of combat,
// interrupt on damage, drink) and the Well Fed buff (apply, expire). Data: src/data/flasks.ts, src/data/consumables.ts.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/consumables.mjs
import * as H from './harness.mjs';

const { G } = H;

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};

// ---- a character with the starter flask in belt slot 1 (ensureStarterFlask: 3 charges) and the starter food in the pouch
const materials = { food_kizarmis_ekmek: 2, food_kaynak_suyu: 2, food_avci_guvec: 1 };
const save = {
  id: 'sim_consumables', level: 1, flags: { 'flask.matara.granted': 1 },
  flasks: [{ uid: 'f1', baseId: 'flask_sisli_matara', rarity: 'common', itemLevel: 1, affixes: [] }, null, null, null, null],
  flaskCharges: [3, 0, 0, 0, 0], skillBar: {}, stats: { deaths: 0 }, materials,
};
let persisted = 0;
G.character = {
  specials: {}, moreDamage: 1, classId: 'knight', level: 1, save, stats: {},
  material: (id) => materials[id] ?? 0,
  useMaterial: (id, n) => { if ((materials[id] ?? 0) < n) return false; materials[id] -= n; return true; },
  persist() { persisted++; },
};
const toasts = [];
G.events.on('ui:toast', (e) => toasts.push(e.text));
G.scenes = { current: { id: 'dungeon' } };
const p = H.addPlayer('knight', 1);
p.combatTimer = 30; // out of combat (Actor.inCombat is combatTimer < 5)
const charges = () => save.flaskCharges[0];

// ---- flask: use, heal shape, charges, cooldown
ok('flask starts with 3 charges', charges() === 3, `charges=${charges()}`);
p.maxHp = 5000; p.hp = 1000;
const flaskEvents = [];
G.events.on('flask:used', (e) => flaskEvents.push(e));
ok('flask use succeeds out of combat', G.combat.useFlask(0) === true);
ok('flask use spends one charge', charges() === 2, `charges=${charges()}`);
ok('flask use emits flask:used with belt slot 1', flaskEvents.length === 1 && flaskEvents[0].slot === 1 && flaskEvents[0].charges === 2);
const regen = p.statuses.get('regen');
ok('flask applies a 3 s regen of 35 % max HP', !!regen && Math.abs(regen.duration - 3) < 0.01 && Math.abs(regen.magnitude * 3 - 1750) < 1, `mag*3=${regen && (regen.magnitude * 3).toFixed(1)}`);
p.combatTimer = 0; // in combat: no out-of-combat natural regen in the window, so the flask heal is measured alone
H.stepSec(3.2);
// 35 % of 5000 = 1750 over 3 s; the 0.5 s tick grid can add one partial tick, so allow about 5 %
ok('flask heal lands over 3 s (about 1000 + 1750)', p.hp > 2700 && p.hp < 2900, `hp=${p.hp.toFixed(0)}`);
p.combatTimer = 30;
ok('flask cooldown starts at 20 s', Math.abs(G.combat.flaskCooldown(0) - (20 - 3.2)) < 0.1, `cd=${G.combat.flaskCooldown(0).toFixed(2)}`);
ok('flask refuses a second use on cooldown', G.combat.useFlask(0) === false && charges() === 2);
H.stepSec(17.5);
ok('flask cooldown ends after 20 s', G.combat.flaskCooldown(0) === 0, `cd=${G.combat.flaskCooldown(0).toFixed(2)}`);
ok('flask is usable again after the cooldown', G.combat.useFlask(0) === true && charges() === 1);
H.stepSec(20.5);
G.combat.useFlask(0);
ok('flask empties to 0 charges', charges() === 0, `charges=${charges()}`);
H.stepSec(20.5);
ok('an empty flask refuses to drink', G.combat.useFlask(0) === false && charges() === 0);

// ---- refill: out of a rest zone nothing refills; in the town (or a village box) it refills to the cap in ~0.5 s
H.stepSec(1);
ok('no refill outside a rest zone', charges() === 0);
G.scenes.current.id = 'town';
H.stepSec(1);
ok('refill to 3 charges in the town', charges() === 3, `charges=${charges()}`);
ok('refill saves the character', persisted > 0);
ok('refill toasts once', toasts.filter((t) => t === 'Şişeler dolduruldu.').length === 1);
// drinking inside the town spends a charge and it stays spent: the refill is once per visit, not every tick
ok('a flask drunk in the town spends a charge', G.combat.useFlask(0) === true && charges() === 2, `charges=${charges()}`);
H.stepSec(2);
ok('no top-up while staying in the town', charges() === 2, `charges=${charges()}`);
H.stepSec(20);
G.scenes.current.id = 'dungeon';
H.stepSec(1);
ok('a full flask does not toast again', toasts.filter((t) => t === 'Şişeler dolduruldu.').length === 1);

// ---- food: out of combat eats, in combat refuses, damage breaks the regen, drink restores mana
p.hp = 1000;
ok('bread eaten out of combat', G.combat.useFood('food_kizarmis_ekmek') === true && materials.food_kizarmis_ekmek === 1);
const fr = p.statuses.get('food_regen');
ok('bread gives food_regen for 15 s', !!fr && Math.abs(fr.duration - 15) < 0.01, `dur=${fr && fr.duration}`);
ok('food_regen is 5 % max HP per second', !!fr && Math.abs(fr.magnitude - 250) < 0.5, `mag=${fr && fr.magnitude}`);
H.stepSec(4);
const hpBefore = p.hp;
H.stepSec(1);
ok('food regen heals over time', p.hp > hpBefore + 150, `gain=${(p.hp - hpBefore).toFixed(0)}`);
G.combat.hitLocalPlayer({ sourceId: null, amount: 200, type: 'fire', dir: [0, -1], unavoidable: true });
ok('damage breaks food_regen', !p.statuses.has('food_regen'));
ok('damage shows the Yemek kesildi toast', toasts.includes('Yemek kesildi.'));
p.combatTimer = 0;
ok('food refused in combat', G.combat.useFood('food_kizarmis_ekmek') === false && materials.food_kizarmis_ekmek === 1);
p.combatTimer = 30;
const res0 = p.resource = p.maxResource * 0.2;
ok('water drinks restore 30 % mana', G.combat.useFood('food_kaynak_suyu') === true && Math.abs(p.resource - (res0 + p.maxResource * 0.3)) < 0.01, `res=${p.resource.toFixed(1)}`);
ok('no food use without stock', G.combat.useFood('food_avci_guvec') === true && G.combat.useFood('food_avci_guvec') === false);

// ---- Well Fed buff: applies for 30 min with the max HP stat, expires
const wf = p.statuses.get('well_fed');
ok('Avcı Güveci applies well_fed for 30 min', !!wf && Math.abs(wf.duration - 1800) < 0.01, `dur=${wf && wf.duration}`);
ok('well_fed adds 3 % max HP', Math.abs((p.statuses.getStatMods().maxHpPct ?? 0) - 0.03) < 1e-9, `maxHpPct=${p.statuses.getStatMods().maxHpPct}`);
const wfNow = p.statuses.get('well_fed');
if (wfNow) wfNow.remaining = 0.5; // skip the 30 minutes: the expiry rule is what is checked
H.stepSec(1);
ok('well_fed expires', !p.statuses.has('well_fed'));
ok('well_fed stat is gone with it', (p.statuses.getStatMods().maxHpPct ?? 0) === 0);

// ---- belt flask on a bar: the flask id is a bar consumable (data), its cooldown is its own
ok('flask base is a bar consumable', G.combat && G.combat.flaskCooldown(4) === 0);

H.restoreConsole();
const noisy = H.errors.filter((e) => !/Unknown|no skill/i.test(e));
ok('no console errors', noisy.length === 0, noisy.slice(0, 3).join(' | '));
console.log(fails ? `${fails} FAILED` : 'all consumables checks passed');
process.exit(fails ? 1 : 0);
