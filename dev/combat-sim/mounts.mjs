// Binek koleksiyonu (sprint2) headless check. No browser, no server, no network: the real data/mounts.ts, systems/Mounts.ts,
// CharacterState (useConsumable), the achievement hook, the loot tables, the vendor entries, game/Mount.ts (MountRider summon /
// dismount rules on a fake player, every model shape, remote swap) and the save roundtrip.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/mounts.mjs
// Stages: cat.* (catalogue, sources) | learn.* (learn once, starter, persistence) | choose.* / fav.* / rand.* (summon choice)
//         item.* (teaching items, bar cell) | src.* (vendor, drop tables, achievements) | model.* (shapes, remote swap)
//         rider.* (F9 / bar summon, casting, dismount) | save.* (JSON roundtrip) | PASS/FAIL per check.
import * as H from './harness.mjs';

const { G } = H;
const toasts = [];
G.events.on('ui:toast', (t) => toasts.push(t.text));

const { CharacterState } = await H.imp('systems/CharacterState.ts');
const M = await H.imp('data/mounts.ts');
const S = await H.imp('systems/Mounts.ts');
const P = await H.imp('systems/Pets.ts');
const ACH = await H.imp('data/achievements.ts');
const A = await H.imp('systems/Achievements.ts');
const { MATERIALS } = await H.imp('data/materials.ts');
const LOOT = await H.imp('data/loot.ts');
const MountMod = await H.imp('game/Mount.ts');
const { getEnemyDef } = await H.imp('data/enemies.ts');
const THREE = H.THREE;

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

// ------------------------------------------------------------------------------------------------ cat.*
const SHAPES = ['horse', 'wolf', 'ram', 'boar', 'stag', 'drake'];
{
  const ids = M.MOUNTS.map((m) => m.id);
  ok('cat.count', M.MOUNTS.length === 6, `${M.MOUNTS.length} mounts`);
  ok('cat.unique-ids', new Set(ids).size === ids.length);
  ok('cat.ids-snake', ids.every((id) => /^[a-z0-9_]+$/.test(id)));
  ok('cat.shapes-distinct', new Set(M.MOUNTS.map((m) => m.shape)).size === 6 && M.MOUNTS.every((m) => SHAPES.includes(m.shape)));
  ok('cat.names-tr', M.MOUNTS.every((m) => m.name && m.desc && m.source.text), 'name, desc and source line');
  ok('cat.palette-ints', M.MOUNTS.every((m) => Number.isInteger(m.color) && Number.isInteger(m.accent) && Number.isInteger(m.glow)));
  ok('cat.bob', M.MOUNTS.every((m) => m.bob.amp > 0 && m.bob.amp < 0.15 && m.bob.hz > 0));
  ok('cat.bobs-differ', new Set(M.MOUNTS.map((m) => `${m.bob.amp}/${m.bob.hz}`)).size === 6);
  ok('cat.starter', M.STARTER_MOUNT_ID === 'kir_at' && M.MOUNT_BY_ID.kir_at.shape === 'horse');
  ok('cat.by-id', M.MOUNT_BY_ID.kristal_geyik?.shape === 'stag' && M.MOUNT_BY_ID.gumus_ejder?.shape === 'drake');
  const kinds = (k) => M.MOUNTS.filter((m) => m.source.kind === k).length;
  ok('cat.sources', kinds('vendor') === 2 && kinds('drop') === 2 && kinds('ach') === 2, `vendor ${kinds('vendor')} drop ${kinds('drop')} ach ${kinds('ach')}`);
  ok('cat.wolf-rare', M.MOUNT_BY_ID.sisli_kurt.source.chance === 0.05 && M.MOUNT_BY_ID.gumus_ejder.source.chance === 0.1);
  ok('cat.ascii-item-ids', M.MOUNTS.every((m) => /^mount_[a-z0-9_]+$/.test(M.mountItemId(m.id))));
}

// ------------------------------------------------------------------------------------------------ learn.*
G.character = CharacterState.create('Binek', 'knight');
G.player = { id: 77, level: 10 };
const save = G.character.save;

ok('learn.none-at-start', S.knownMounts(save).length === 0 && S.chosenMountId(save) === null && save.mounts === undefined);
ok('learn.first', S.learnMount(save, 'kir_at') === true && S.hasMount(save, 'kir_at'));
ok('learn.once', S.learnMount(save, 'kir_at') === false && S.knownMounts(save).length === 1);
ok('learn.unknown-id', S.learnMount(save, 'yok_boyle_bir_binek') === false && !save.mounts.known.includes('yok_boyle_bir_binek'));
S.learnMount(save, 'sisli_kurt');
S.learnMount(save, 'kristal_geyik');
ok('learn.catalogue-order', S.knownMounts(save).map((m) => m.id).join() === 'kir_at,sisli_kurt,kristal_geyik', S.knownMounts(save).map((m) => m.id).join());
ok('learn.chosen-defaults-first', S.chosenMountId(save) === 'kir_at');
ok('learn.chooses', S.chooseMount(save, 'kristal_geyik') === true && S.chosenMountId(save) === 'kristal_geyik');
ok('learn.choose-unknown-refused', S.chooseMount(save, 'dag_kecisi') === false && S.chosenMountId(save) === 'kristal_geyik');
save.mounts.chosen = 'dag_kecisi';
ok('learn.stale-chosen-is-first', S.chosenMountId(save) === 'kir_at', 'unknown chosen reads as the first learned');
S.chooseMount(save, 'kristal_geyik');

// ------------------------------------------------------------------------------------------------ fav.* / rand.*
ok('fav.add', S.toggleFavourite(save, 'sisli_kurt') === true && S.isFavourite(save, 'sisli_kurt'));
ok('fav.remove', S.toggleFavourite(save, 'sisli_kurt') === false && !S.isFavourite(save, 'sisli_kurt'));
ok('fav.unknown-refused', S.toggleFavourite(save, 'gumus_ejder') === false && !S.isFavourite(save, 'gumus_ejder'));
S.toggleFavourite(save, 'kir_at');
ok('rand.favs-pool', [0, 0.3, 0.99].every((r) => S.randomMount(save, r) === 'kir_at'), 'only favourites are picked');
ok('rand.pick-deterministic-edge', S.randomMount(save, 0.999999) === 'kir_at' && S.randomMount(save, 0) === 'kir_at');
S.toggleFavourite(save, 'kir_at');
const seen = new Set();
for (let i = 0; i < 60; i++) seen.add(S.randomMount(save, i / 60));
ok('rand.all-learned-when-no-favs', seen.size === 3 && [...seen].every((id) => S.hasMount(save, id)), [...seen].join());
ok('rand.none-when-nothing-learned', S.randomMount(CharacterState.create('Bos', 'knight').save) === null);

// ------------------------------------------------------------------------------------------------ item.*
// the teaching item of a mount that is not learned yet (the wolf and the stag were learned above)
const tasma = M.mountItemId('dag_kecisi');
ok('item.material', !!MATERIALS[tasma] && MATERIALS[tasma].teachesMount === 'dag_kecisi' && MATERIALS[tasma].kind === 'consumable');
ok('item.vendor-price', MATERIALS[tasma].buyPrice === 400 && MATERIALS[tasma].requiredLevel === 20);
ok('item.no-price-for-drops', MATERIALS[M.mountItemId('gumus_ejder')].buyPrice === undefined);
G.character.addMaterial(tasma, 1);
let r = G.character.useConsumable(tasma);
ok('item.teaches-once', r.ok === true && S.hasMount(save, 'dag_kecisi') === true && G.character.material(tasma) === 0, JSON.stringify(r));
G.character.addMaterial(tasma, 1);
r = G.character.useConsumable(tasma);
ok('item.known-keeps-item', r.ok === false && /zaten sende/.test(r.reason ?? '') && G.character.material(tasma) === 1, r.reason);
G.character.useMaterial(tasma, 1);
ok('item.pure-refuses-unknown', S.teachFromMountItem(save, 'pet_kurt_yavrusu').ok === false && S.teachFromMountItem(save, 'mount_yok').ok === false);
// a fresh learner with nothing chosen gets the taught mount as the summon
const fresh = CharacterState.create('Taze', 'knight').save;
ok('item.first-becomes-chosen', S.teachFromMountItem(fresh, M.mountItemId('altin_domuz')).ok && S.chosenMountId(fresh) === 'altin_domuz');
// bar cell: a mount cell summons (no pouch stock needed) and is never consumed
toasts.length = 0;
ok('item.not-learned-stays-out', S.hasMount(save, 'altin_domuz') === false && G.character.material(M.mountItemId('altin_domuz')) === 0);

// ------------------------------------------------------------------------------------------------ src.*
const VENDOR = M.MOUNTS.filter((m) => m.source.kind === 'vendor');
ok('src.vendor-two', VENDOR.map((m) => m.id).join() === 'kir_at,dag_kecisi');
ok('src.vendor-levels', MATERIALS[M.mountItemId('kir_at')].requiredLevel === 10 && VENDOR.every((m) => m.source.level >= 10));
for (const m of M.MOUNTS.filter((x) => x.source.kind === 'drop')) {
  const table = LOOT.LOOT_TABLES[m.source.table] ?? LOOT.RARE_TABLES[m.source.table];
  const bonus = (table?.bonus ?? []).find((b) => b.id === M.mountItemId(m.id));
  ok(`src.drop.${m.id}`, !!table && !!bonus && bonus.chance === m.source.chance, m.source.table);
}
for (const m of M.MOUNTS.filter((x) => x.source.kind === 'ach')) {
  const a = ACH.ACHIEVEMENTS.find((d) => d.id === m.source.achId);
  ok(`src.ach.${m.id}`, !!a && a.mount === m.id, a ? a.name : `missing ${m.source.achId}`);
}
{
  const vadi = ACH.ACHIEVEMENTS.find((d) => d.id === 'sav_vadi100');
  ok('src.vadi-metric', vadi?.metric === 'vadiKills' && vadi.target === 100 && ACH.METRIC_KIND.vadiKills === 'add');
  // the achievement unlock teaches the mount (pure path, no event wiring)
  const acc = CharacterState.create('Vadi', 'knight').save;
  A.bump(acc, 'vadiKills', 100);
  const got = A.checkUnlocks(acc, 1);
  ok('src.ach-teaches', got.some((d) => d.id === 'sav_vadi100') && S.hasMount(acc, 'altin_domuz'));
  const acc2 = CharacterState.create('Sis', 'knight').save;
  A.bump(acc2, 'dungeonClears', 3);
  A.checkUnlocks(acc2, 1);
  ok('src.ach-stag', S.hasMount(acc2, 'kristal_geyik') && !S.hasMount(acc2, 'altin_domuz'));
}
ok('src.wolf-boss-table', getEnemyDef('boss_mag_bekci')?.lootTable === 'loot_mag_bekci', 'Kadim Bekçi drops the wolf table');

// ------------------------------------------------------------------------------------------------ model.*
// every shape builds into a scene; remote swap by id; unknown id = starter horse; unmount removes it
const rp = { id: 88, object3d: new THREE.Group(), modelLift: 0 };
const modelCount = () => rp.object3d.children.length;
for (const m of M.MOUNTS) {
  MountMod.setRemoteMounted(rp, true, m.id);
  const root = rp.object3d.children.find((c) => c.name === 'mount_' + m.id);
  ok(`model.${m.shape}`, !!root && root.children.length >= 8 && rp.modelLift === MountMod.MOUNT_LIFT, `${root?.children.length ?? 0} parts`);
  MountMod.setRemoteMounted(rp, false);
}
ok('model.off-clears', modelCount() === 0 && rp.modelLift === 0);
MountMod.setRemoteMounted(rp, true, 'yok_boyle');
ok('model.unknown-is-starter', !!rp.object3d.children.find((c) => c.name === 'mount_kir_at'));
MountMod.setRemoteMounted(rp, true, 'gumus_ejder');
ok('model.swap-by-id', modelCount() === 1 && !!rp.object3d.children.find((c) => c.name === 'mount_gumus_ejder'));
MountMod.setRemoteMounted(rp, true, 'gumus_ejder');
ok('model.idempotent', modelCount() === 1);
MountMod.setRemoteMounted(rp, false);

// ------------------------------------------------------------------------------------------------ rider.*
// a fake local player for MountRider: level, combat and cast flags, a move check and a three.js anchor
const fp = {
  id: 77, level: 10, inCombat: false, isDead: false, cast: null, dodging: false, object3d: new THREE.Group(), modelLift: 0,
  canMove: () => true,
};
if (!G.input) G.input = { pressed: () => false };
const rider = new MountMod.MountRider(fp);
const frames = (n, moving = false) => { for (let i = 0; i < n; i++) rider.update(1 / 60, true, moving); };
const summon = () => G.events.emit('mount:summon', {});
const mountedEvents = [];
G.events.on('player:mounted', (e) => mountedEvents.push(e));

// no learned mount: the summon is refused with a hint
G.character.save.mounts = { known: [], favs: [] };
summon();
frames(1);
ok('rider.none-learned', rider.mounted === false && toasts.some((t) => /binek öğrenmelisin/.test(t)));

// learn + choose, then summon with a 1.5 s cast
S.learnMount(G.character.save, 'kir_at');
S.learnMount(G.character.save, 'kristal_geyik');
S.chooseMount(G.character.save, 'kristal_geyik');
summon();
frames(sec(0.5));
ok('rider.casting-not-yet', rider.mounted === false);
frames(sec(1.1));
ok('rider.mounted-after-cast', rider.mounted === true && rider.mountId === 'kristal_geyik' && rider.speedMul() === MountMod.MOUNT_SPEED_MUL);
ok('rider.model-is-chosen', !!fp.object3d.children.find((c) => c.name === 'mount_kristal_geyik') && fp.modelLift === MountMod.MOUNT_LIFT);
ok('rider.event-with-id', mountedEvents.at(-1)?.on === true && mountedEvents.at(-1)?.mountId === 'kristal_geyik');
// the bob moves the model up and down while running
const y0 = fp.object3d.children.find((c) => c.name === 'mount_kristal_geyik').position.y;
frames(sec(0.1), true);
const y1 = fp.object3d.children.find((c) => c.name === 'mount_kristal_geyik').position.y;
ok('rider.bob-moves', y0 !== y1 && Math.abs(y1) <= 0.06 + 1e-9, `${y0.toFixed(3)} -> ${y1.toFixed(3)}`);
// a second summon dismounts (the mount key / bar cell toggles)
summon();
frames(1);
ok('rider.dismount-by-summon', rider.mounted === false && fp.modelLift === 0 && mountedEvents.at(-1)?.on === false);
ok('rider.model-removed', !fp.object3d.children.find((c) => c.name?.startsWith('mount_')));
// moving during the cast cancels it
summon();
frames(sec(0.3));
frames(2, true);
ok('rider.move-cancels-cast', rider.mounted === false);
// a change of the chosen mount is used on the next summon
S.chooseMount(G.character.save, 'kir_at');
summon();
frames(sec(1.6));
ok('rider.next-summon-uses-choice', rider.mountId === 'kir_at' && !!fp.object3d.children.find((c) => c.name === 'mount_kir_at'));
summon();
frames(1);
ok('rider.dismount-again', rider.mounted === false);
// the level gate still applies
fp.level = 9;
summon();
frames(1);
ok('rider.level-gate', rider.mounted === false && toasts.some((t) => /Sv 10/.test(t)));
fp.level = 10;
rider.dispose();

// ------------------------------------------------------------------------------------------------ save.*
const saved = JSON.parse(JSON.stringify(G.character.save.mounts));
ok('save.roundtrip', saved.known.join() === G.character.save.mounts.known.join() && saved.chosen === G.character.save.mounts.chosen);
ok('save.pets-untouched', P.knownPets(G.character.save).length === 0);
const restored = { ...CharacterState.create('Kayit', 'knight').save, mounts: saved };
ok('save.restored-chosen', S.chosenMountId(restored) === saved.chosen && S.knownMounts(restored).length === saved.known.length);

// ------------------------------------------------------------------------------------------------ report
function sec(s) {
  return Math.round(s / (1 / 60));
}

console.log(`${fails === 0 ? 'PASS' : 'FAIL'} mounts: ${passes} passed, ${fails} failed`);
if (H.errors?.length) console.log('console errors:', H.errors.slice(0, 5));
process.exit(fails === 0 ? 0 : 1);
