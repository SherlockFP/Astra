// WP-12 cosmetic pets headless check (docs/MMO_PILLARS.md). No browser, no server, no network: the real data/pets.ts, systems/Pets.ts,
// CharacterState (useConsumable), systems/Achievements.ts (installAchievements on the real EventBus), the loot tables, the event
// pet roll, the save roundtrip and the follower model (game/Pet.ts) on a fake player in a three.js scene.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/pets.mjs
// Stages: cat.* (catalogue, sources) | learn.* (learn once, summon / dismiss) | item.* (teaching items) | ach.* (achievement hook)
//         event.* (event roll) | loot.* (drop hooks) | save.* (JSON roundtrip) | model.* (follower, all shapes) | PASS/FAIL per check.
import * as H from './harness.mjs';

const { G } = H;
const toasts = [];
G.events.on('ui:toast', (t) => toasts.push(t.text));

const { CharacterState } = await H.imp('systems/CharacterState.ts');
const A = await H.imp('systems/Achievements.ts');
const P = await H.imp('systems/Pets.ts');
const D = await H.imp('data/pets.ts');
const ACH = await H.imp('data/achievements.ts');
const { MATERIALS } = await H.imp('data/materials.ts');
const LOOT = await H.imp('data/loot.ts');
const EC = await H.imp('scenes/world/EventCalendar.ts');
const SaveMod = await H.imp('core/Save.ts').catch(() => null);
const PetMod = await H.imp('game/Pet.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

// ------------------------------------------------------------------------------------------------ cat.*
{
  const ids = D.PETS.map((p) => p.id);
  const SHAPES = ['quad', 'bird', 'orb', 'turtle', 'dragon'];
  ok('cat.count', D.PETS.length === 13, `${D.PETS.length} pets`);
  ok('cat.unique-ids', new Set(ids).size === ids.length);
  ok('cat.ids-snake', ids.every((id) => /^[a-z0-9_]+$/.test(id)));
  ok('cat.names-tr', D.PETS.every((p) => p.name && p.desc && p.source.text), 'name, desc and source line');
  ok('cat.shapes', D.PETS.every((p) => SHAPES.includes(p.shape)));
  ok('cat.model-values', D.PETS.every((p) => p.scale > 0 && p.scale <= 1.2 && Number.isInteger(p.color) && Number.isInteger(p.accent)));
  const kinds = (k) => D.PETS.filter((p) => p.source.kind === k).length;
  ok('cat.sources', kinds('drop') === 5 && kinds('ach') === 4 && kinds('event') === 4, `drop ${kinds('drop')} ach ${kinds('ach')} event ${kinds('event')}`);
  ok('cat.by-id', D.PET_BY_ID.kuzgun?.name === 'Kuzgun' && Object.keys(D.PET_BY_ID).length === 13);
}

// every pet has its teaching item (a consumable that names the pet)
for (const p of D.PETS) {
  const m = MATERIALS[D.petItemId(p.id)];
  ok(`cat.item.${p.id}`, !!m && m.kind === 'consumable' && m.teachesPet === p.id && m.maxStack >= 1, m ? m.name : 'missing');
}
{
  const teaching = Object.values(MATERIALS).filter((m) => m.teachesPet);
  ok('cat.items-only-pets', teaching.length === D.PETS.length, `${teaching.length} teaching items`);
}

// achievement sources: the pet's achievement exists and teaches it
for (const p of D.PETS.filter((x) => x.source.kind === 'ach')) {
  const a = ACH.ACHIEVEMENTS.find((d) => d.id === p.source.achId);
  ok(`cat.ach.${p.id}`, !!a && a.pet === p.id, a ? `${a.name}` : `missing ${p.source.achId}`);
}
// event sources: the event exists and petForEvent finds the pet
for (const ev of EC.EVENT_IDS) {
  const pe = D.petForEvent(ev);
  const want = D.PETS.find((p) => p.source.kind === 'event' && p.source.event === ev);
  ok(`cat.event.${ev}`, !!pe && pe === want && EC.EVENT_DEFS[ev] !== undefined, pe ? pe.name : 'none');
}

// ------------------------------------------------------------------------------------------------ learn.*
G.character = CharacterState.create('Pet', 'knight');
G.player = { id: 42 };
const save = G.character.save;

ok('learn.none-at-start', P.knownPets(save).length === 0 && P.activePetId(save) === null && save.pets === undefined);
ok('learn.first', P.learnPet(save, 'kurt_yavrusu') === true);
ok('learn.once', P.learnPet(save, 'kurt_yavrusu') === false && P.knownPets(save).length === 1, 'second learn is a no-op');
ok('learn.unknown-id', P.learnPet(save, 'yok_boyle_bir_pet') === false && !save.pets.known.includes('yok_boyle_bir_pet'));
P.learnPet(save, 'kizil_tilki');
P.learnPet(save, 'tas_peri');
ok('learn.list-catalogue-order', P.knownPets(save).map((p) => p.id).join() === 'kurt_yavrusu,kizil_tilki,tas_peri', P.knownPets(save).map((p) => p.id).join());
ok('learn.known-never-shrinks', P.summonPet(save, 'kurt_yavrusu').ok && P.dismissPet(save) === undefined && save.pets.known.length === 3);

P.summonPet(save, 'kurt_yavrusu');
ok('learn.summon-unknown-refused', P.summonPet(save, 'ruh_fener').ok === false && P.activePetId(save) === 'kurt_yavrusu', 'stays on the previous pet');
ok('learn.summon-bad-id', P.summonPet(save, 'nope').ok === false);
ok('learn.summon-known', P.summonPet(save, 'tas_peri').ok === true && P.activePetId(save) === 'tas_peri');
ok('learn.summon-replaces', P.summonPet(save, 'kizil_tilki').ok && P.activePetId(save) === 'kizil_tilki' && save.pets.active === 'kizil_tilki');
P.dismissPet(save);
ok('learn.dismiss', P.activePetId(save) === null && save.pets.active === undefined && save.pets.known.length === 3);
P.summonPet(save, 'kizil_tilki');
// a stale active id (pet no longer known, e.g. a hand-edited save) reads as none
save.pets.active = 'ruh_fener';
ok('learn.stale-active-is-none', P.activePetId(save) === null);
save.pets.active = 'kizil_tilki';

// setPet (wiring): saves, emits pet:changed, refuses unknown pets with a toast
const changes = [];
G.events.on('pet:changed', (e) => changes.push(e.id));
ok('learn.setPet-summon', P.setPet('tas_peri') === true && P.activePetId(G.character.save) === 'tas_peri' && changes.at(-1) === 'tas_peri');
toasts.length = 0;
ok('learn.setPet-refused', P.setPet('ruh_fener') === false && toasts.some((t) => /henüz öğrenmedin/.test(t)) && P.activePetId(G.character.save) === 'tas_peri');
ok('learn.setPet-dismiss', P.setPet(null) === true && P.activePetId(G.character.save) === null && changes.at(-1) === null);

// ------------------------------------------------------------------------------------------------ item.*
const egg = D.petItemId('ruh_fener');
G.character.addMaterial(egg, 2);
ok('item.stock', G.character.material(egg) === 2);
let r = G.character.useConsumable(egg);
ok('item.teaches', r.ok === true && P.hasPet(G.character.save, 'ruh_fener') && G.character.material(egg) === 1, JSON.stringify(r));
r = G.character.useConsumable(egg);
ok('item.known-keeps-egg', r.ok === false && /zaten sende/.test(r.reason ?? '') && G.character.material(egg) === 1, r.reason);
G.character.useMaterial(egg, 1);
r = G.character.useConsumable(egg);
ok('item.none-left', r.ok === false && G.character.material(egg) === 0);
ok('item.teach-from-item-pure', P.teachFromItem(G.character.save, 'kurt_yavrusu').ok === false && P.teachFromItem(G.character.save, 'bilinmeyen').ok === false);

// ------------------------------------------------------------------------------------------------ ach.*
// Fresh character, real achievement wiring: the unlock of Altın Kral teaches Altın Sincap, a second unlock does not repeat it
G.character = CharacterState.create('Ach', 'rogue');
G.player = { id: 43 };
G.net = { isOnline: false };
const dispose = A.installAchievements();
const aSave = G.character.save;
ok('ach.not-yet', !P.hasPet(aSave, 'altin_sincap'));
G.events.emit('player:gold', { gold: 999999, delta: 999999 });
ok('ach.gold-not-enough', !P.hasPet(aSave, 'altin_sincap'));
toasts.length = 0;
G.events.emit('player:gold', { gold: 1000000, delta: 1000000 });
ok('ach.teaches-on-unlock', A.isUnlocked(aSave, 'eko_gold1m') && P.hasPet(aSave, 'altin_sincap'));
ok('ach.toast', toasts.some((t) => /Evcil hayvan ödülü: Altın Sincap/.test(t)), toasts.join(' | '));
ok('ach.unlock-with-title', (aSave.titles ?? []).includes('eko_gold1m'));
// the pure path (sim without events): a kill count teaches the cat
const pure = CharacterState.create('Pure', 'knight').save;
A.bump(pure, 'kills', 1000);
const fresh = A.checkUnlocks(pure, 1);
ok('ach.pure-unlock', fresh.some((d) => d.id === 'sav_kill1000') && P.hasPet(pure, 'sisli_kedi'));
ok('ach.pure-no-repeat', A.checkUnlocks(pure, 2).length === 0 && P.knownPets(pure).length === 1);
dispose();
// an achievement that teaches a pet the character already has does not duplicate it
const dupe = CharacterState.create('Dupe', 'mage').save;
P.learnPet(dupe, 'kuzgun');
A.bump(dupe, 'mplusClears', 10);
A.checkUnlocks(dupe, 3);
ok('ach.dupe-safe', dupe.pets.known.filter((x) => x === 'kuzgun').length === 1);

// ------------------------------------------------------------------------------------------------ event.*
ok('event.no-roll', P.eventPetItem('metin_storm', 0.5) === null, 'roll above the chance');
ok('event.roll-hit', P.eventPetItem('metin_storm', 0) === D.petItemId('tas_peri'));
ok('event.chance-edge', P.eventPetItem('metin_storm', D.PET_EVENT_CHANCE) === null && P.eventPetItem('metin_storm', D.PET_EVENT_CHANCE - 1e-9) !== null);
ok('event.unknown-event', P.eventPetItem('bilinmeyen_olay', 0) === null);
{
  let hits = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) if (P.eventPetItem('goblin_caravan', i / n)) hits++;
  const rate = hits / n;
  ok('event.rate', Math.abs(rate - D.PET_EVENT_CHANCE) < 0.005, `rate ${rate.toFixed(4)}`);
}

// ------------------------------------------------------------------------------------------------ loot.*
// the drop pets are rolled in their named table (rare enemy / world boss bonus), with the teaching item id
{
  const tableOf = (name) => LOOT.RARE_TABLES[name] ?? LOOT.WORLD_BOSS_TABLES[name];
  for (const p of D.PETS.filter((x) => x.source.kind === 'drop')) {
    const t = tableOf(p.source.table);
    const hit = (t?.bonus ?? []).find((b) => b.id === D.petItemId(p.id));
    ok(`loot.${p.id}`, !!hit && hit.chance > 0 && hit.chance <= 0.1, `${p.source.table}${hit ? ' chance ' + hit.chance : ' missing'}`);
  }
  // a pet item is only ever a bonus roll of its own pet's table (no stray pet items in the tables)
  const all = [...Object.entries(LOOT.RARE_TABLES), ...Object.entries(LOOT.WORLD_BOSS_TABLES)];
  const petRolls = all.flatMap(([name, t]) => (t.bonus ?? []).filter((b) => String(b.id).startsWith('pet_')).map((b) => [name, b.id]));
  ok('loot.no-stray', petRolls.length === 5 &&petRolls.every(([name, id]) => D.PETS.some((p) => D.petItemId(p.id) === id && p.source.table === name)), petRolls.map((x) => x.join(':')).join(' '));
}

// ------------------------------------------------------------------------------------------------ save.*
const sv = CharacterState.create('Save', 'barbarian').save;
P.learnPet(sv, 'gece_baykusu');
P.learnPet(sv, 'koy_kopegi');
P.summonPet(sv, 'koy_kopegi');
const copy = JSON.parse(JSON.stringify(sv));
const back = SaveMod ? SaveMod.normaliseCharacterSave(copy) : copy;
ok('save.normalise-loaded', SaveMod !== null && typeof SaveMod.normaliseCharacterSave === 'function');
ok('save.roundtrip-known', JSON.stringify(back.pets.known) === JSON.stringify(sv.pets.known));
ok('save.roundtrip-active', P.activePetId(back) === 'koy_kopegi');
ok('save.legacy-no-block', P.knownPets(CharacterState.create('Eski', 'knight').save).length === 0);
ok('save.roundtrip-no-relearn', P.learnPet(back, 'gece_baykusu') === false);

// ------------------------------------------------------------------------------------------------ model.*
// The follower on a fake local player in a real three.js scene: every shape builds, one model at a time, a dismiss removes it.
{
  const THREE = H.THREE;
  const scene = new THREE.Scene();
  const player = {
    id: 44, isLocal: true, isDead: false, yaw: 0,
    position: new THREE.Vector3(10, 0, 10),
    object3d: new THREE.Object3D(),
    world: { scene, groundY: () => 0 },
  };
  G.character = CharacterState.create('Model', 'paladin');
  const f = new PetMod.PetFollower(player);
  ok('model.starts-none', f.current === null && scene.children.length === 0);
  let built = 0;
  for (const p of D.PETS) {
    f.setPet(p.id);
    if (f.current === p.id) built++;
  }
  ok('model.all-shapes-build', built === D.PETS.length, `${built} / ${D.PETS.length}`);
  f.setPet('kurt_yavrusu');
  const before = scene.children.length;
  f.setPet('kurt_yavrusu');
  ok('model.same-pet-keeps-model', scene.children.length === before && f.current === 'kurt_yavrusu');
  f.update(0.016);
  ok('model.attaches-to-scene', scene.children.length === 1 && scene.children[0].children.length > 0, `${scene.children.length} roots`);
  const root = scene.children[0];
  player.position.set(30, 0, -5);
  for (let i = 0; i < 120; i++) f.update(1 / 60);
  // anchor = 1.2 m behind and 0.9 m beside the character (yaw 0: behind is -Z, beside is +X)
  const d = Math.hypot(root.position.x - 30.9, root.position.z + 6.2);
  ok('model.follows-player', d < 0.15, `distance ${d.toFixed(2)} m`);
  player.isDead = true;
  f.update(0.016);
  ok('model.hidden-when-dead', root.visible === false);
  player.isDead = false;
  f.update(0.016);
  ok('model.visible-when-alive', root.visible === true);
  f.setPet(null);
  ok('model.dismiss-removes', f.current === null && scene.children.length === 0);
  G.events.emit('pet:changed', { id: 'tas_peri' });
  ok('model.local-follows-event', f.current === 'tas_peri' && scene.children.length === 0, 'attached on next update');
  f.update(0.016);
  ok('model.local-attaches-on-update', scene.children.length === 1);
  f.dispose();
  ok('model.dispose-detaches', scene.children.length === 0 && f.current === null);
  // a remote player's follower ignores the local pet events (the presence sets it)
  const remote = { ...player, isLocal: false, object3d: new THREE.Object3D(), position: new THREE.Vector3(0, 0, 0), world: { scene, groundY: () => 0 } };
  const rf = new PetMod.PetFollower(remote);
  G.events.emit('pet:changed', { id: 'kuzgun' });
  ok('model.remote-ignores-local-events', rf.current === null);
  rf.setPet('kuzgun');
  ok('model.remote-set-by-presence', rf.current === 'kuzgun');
  rf.dispose();
}

// ------------------------------------------------------------------------------------------------ done
console.log(`pets: ${passes} passed, ${fails} failed`);
H.restoreConsole();
const mine = H.errors.filter((e) => /pet/i.test(e));
const other = H.errors.filter((e) => !/pet/i.test(e));
if (other.length) console.log(`(${other.length} harness console messages, not from this system; first: ${other[0].slice(0, 120)})`);
if (mine.length) for (const e of mine.slice(0, 10)) console.log('  ' + e);
console.log(fails === 0 && mine.length === 0 ? 'PASS' : 'FAIL');
process.exit(fails === 0 && mine.length === 0 ? 0 : 1);
