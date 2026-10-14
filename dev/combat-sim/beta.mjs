// BETA TEST character checks (systems/BetaTest.ts, scenes/BetaArea.ts, ui/panels/game/betaGuide.ts, data/betaTest.ts). No browser, no server.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/beta.mjs     (V=1 prints every PASS)
// Stages: create.* (a beta character through CharacterState.create: level cap, gold, gear on every slot, talents spent on the
//         default build, skill bar, pets, waypoints, PvP currencies, keystone, professions, flags) | normal.* (a plain creation is
//         unchanged) | dummy.* (DPS window math, tank dummy hits back, dummy kinds) | data.* (guide targets, fence layout, NPC def)
import * as H from './harness.mjs';

const { G } = H;
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const BT = await H.imp('systems/BetaTest.ts');
const { CLASS_ORDER, specHasTree, specsOfClass } = await H.imp('data/talentTrees/index.ts');
const { classPoints, specPoints } = await H.imp('systems/Talents.ts');
const { EQUIP_SLOTS } = await H.imp('types/items.ts');
const { LEVEL_CAP } = await H.imp('types/character.ts');
const { requiredLevelOf, baseOf } = await H.imp('systems/ItemGen.ts');
const { BETA_GUIDE_NPC, BETA_ZONES, TEST_AREA, TEST_DUMMIES, TANK_DUMMY } = await H.imp('data/betaTest.ts');
const { OPEN_ZONES, getDungeon, DUNGEON_IDS, MPLUS_POOL } = await H.imp('data/dungeons/index.ts');
const { TOWN } = await H.imp('data/town.ts');
const { TrainingDummy, dpsOfHits } = await H.imp('entities/interactables/TrainingDummy.ts');
const { PROF_IDS } = await H.imp('data/professions.ts');
const { PETS } = await H.imp('data/pets.ts');
const { CLASS_OFFHANDS } = await H.imp('data/itemBases.ts');
const { SKILLS, CLASSES } = H;
const { getSpec } = await H.imp('data/specs.ts');
const { grantedSkillsOf } = await H.imp('systems/Talents.ts');
// granted skills of a stored loadout (the same rule the talent system uses)
const grantedFor = (classId, spec, l) => (l ? grantedSkillsOf(classId, spec, l.cls, l.spc) : []);

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

// ------------------------------------------------------------------------------------------------ create.* (beta character, every class)
const report = [];
for (const classId of CLASS_ORDER) {
  const ch = CharacterState.create(`Beta${classId}`, classId, 0, undefined, { beta: true });
  const s = ch.save;
  const tag = `create.${classId}`;
  ok(`${tag} level is the cap (${LEVEL_CAP})`, s.level === LEVEL_CAP && ch.level === LEVEL_CAP);
  ok(`${tag} save is marked beta`, s.beta === true);
  ok(`${tag} gold is 100k`, s.gold === BT.BETA_GOLD && s.gold === 100000);

  // gear: every equipment slot, top-track epic items; an offhand may stay empty only behind a two-handed weapon
  const filled = EQUIP_SLOTS.filter((sl) => !!s.equipment[sl]);
  const missing = EQUIP_SLOTS.filter((sl) => !s.equipment[sl]);
  const wpn = s.equipment.weapon ? baseOf(s.equipment.weapon) : null;
  const noOffhand = CLASS_OFFHANDS[classId]?.length === 0;
  const okMissing = missing.every((sl) => sl === 'offhand' && (wpn?.twoHanded || noOffhand)) || missing.length === 0;
  ok(`${tag} gear fills every slot (offhand only when the class has none or the weapon is two-handed)`, okMissing, `missing=${missing.join(',') || '-'}`);
  ok(`${tag} gear is epic at the beta item level`, filled.every((sl) => s.equipment[sl].rarity === 'epic' && s.equipment[sl].itemLevel === BT.BETA_ILVL));
  ok(`${tag} gear is equippable at the cap`, filled.every((sl) => requiredLevelOf(s.equipment[sl]) <= LEVEL_CAP));
  ok(`${tag} gear slots have a base the class can use`, filled.every((sl) => !baseOf(s.equipment[sl]).classes || baseOf(s.equipment[sl]).classes.includes(classId)));

  // talents: class tree and spec tree spent with the default build; legacy passive web grown from the class start
  // a loadout is stored per spec (tb.active[spec]): a class without a spec tree has no spec and no loadout (the game cannot pick one either)
  const spec = s.spec;
  const hasSpec = specsOfClass(classId).some((x) => specHasTree(x));
  const loadout = spec ? s.tb?.active?.[spec] : undefined;
  const cls = loadout?.cls ?? [];
  const spc = loadout?.spc ?? [];
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  if (hasSpec) {
    ok(`${tag} spec chosen (level cap)`, !!spec && specHasTree(spec), `spec=${spec}`);
    ok(`${tag} class tree spends every class point`, sum(cls) === classPoints(LEVEL_CAP), `${sum(cls)}/${classPoints(LEVEL_CAP)}`);
    ok(`${tag} spec tree spends every spec point`, sum(spc) === specPoints(LEVEL_CAP), `${sum(spc)}/${specPoints(LEVEL_CAP)}`);
  } else {
    ok(`${tag} class without a spec tree has no spec and no loadout`, !spec && !loadout);
  }
  // classes whose passive-web start sector is not designed yet (druid, priest, shaman, demonhunter, evoker) keep only the start node
  const NO_WEB_START = ['druid', 'priest', 'shaman', 'demonhunter', 'evoker'];
  if (!NO_WEB_START.includes(classId)) ok(`${tag} passive web grew past the class start`, s.talents.length > 1, `passive=${s.talents.length}`);
  ok(`${tag} passive web is within the cap`, s.talents.length <= BT.BETA_PASSIVE_POINTS + 1);

  // skill bar: the game's own default bar at the cap (8 slots: the bar cannot hold a whole skill list), every class skill unlocked by the cap
  const barCount = Object.values(s.skillBar).filter(Boolean).length;
  const skillIds = CLASSES[classId]?.skills ?? [];
  const wantBar = CharacterState.defaultBar(classId, LEVEL_CAP);
  ok(`${tag} skill bar holds the default bar at the cap`, Object.entries(wantBar).every(([k, v]) => s.skillBar[k] === v), `bar=${barCount}`);
  const granted = spec ? grantedFor(classId, spec, loadout) : [];
  // every skill is unlocked by level, granted by the build, or a skill of a spec this character did not pick (unlock 99: not level-gated)
  ok(`${tag} every class skill is unlocked or belongs to another spec`, skillIds.every((id) => (SKILLS[id]?.unlockLevel ?? 1) <= LEVEL_CAP || granted.includes(id) || SKILLS[id]?.unlockLevel === 99), `skills=${skillIds.length} granted=${granted.length}`);
  // a granted skill goes to its spec default slot when that slot is free (TalentSystem.syncGrantedBar); a taken slot keeps the level skill
  const specBar = spec ? getSpec(spec)?.defaultBar ?? {} : {};
  const placeable = granted.filter((id) => Object.keys(specBar).some((k) => specBar[k] === id));
  ok(`${tag} granted skills sit on the bar or their slot is taken`, placeable.every((id) => Object.values(s.skillBar).includes(id) || Object.keys(specBar).some((k) => specBar[k] === id && s.skillBar[k])), `${placeable.length} with a slot`);

  // pets, waypoints, PvP currencies, keystone, professions, flags
  ok(`${tag} pets: known and an active one`, s.pets?.known?.length === BT.BETA_PETS.length && !!s.pets.active && s.pets.known.includes(s.pets.active));
  ok(`${tag} pets are real pet ids`, s.pets.known.every((id) => PETS.some((p) => p.id === id)));
  const wp = BT.betaWaypointIds();
  ok(`${tag} every waypoint is discovered`, wp.length > 0 && wp.every((id) => s.flags[`world.wp.${id}`] === true), `${wp.length} stones`);
  ok(`${tag} PvP currencies in stock`, Object.entries(BT.BETA_PVP_CURRENCY).every(([id, n]) => (s.materials[id] ?? 0) >= n));
  ok(`${tag} an M+ keystone is held`, s.mythic.keystone?.level === BT.BETA_KEYSTONE.level && !!getDungeon(s.mythic.keystone.dungeonId));
  ok(`${tag} professions at max skill`, PROF_IDS.every((id) => s.professions?.[id]?.skill === 300 && s.professions[id].tier === 6));
  report.push(`${classId}: gear ${filled.length}/${EQUIP_SLOTS.length}, class ${sum(cls)}, spec ${spec ? sum(spc) : '-'}, passive ${s.talents.length}, bar ${barCount}`);
}

// ------------------------------------------------------------------------------------------------ normal.* (a plain creation is unchanged)
{
  const ch = CharacterState.create('Normal', 'knight');
  const s = ch.save;
  ok('normal.level 1 and gold 50', s.level === 1 && s.gold === 50);
  ok('normal.not beta', !s.beta);
  ok('normal.no talent points spent', !s.spec && (!s.tb || Object.keys(s.tb.active).length === 0));
  ok('normal.no waypoint flags', !Object.keys(s.flags).some((k) => k.startsWith('world.wp.')));
  ok('normal.starting gear kept', EQUIP_SLOTS.some((sl) => !!s.equipment[sl]));
  ok('normal.no keystone, no professions', !s.mythic.keystone && !s.professions);
}

// ------------------------------------------------------------------------------------------------ dummy.* (DPS and the tank dummy)
{
  const hits = [{ t: 2, amount: 999 }, { t: 10, amount: 500 }, { t: 12, amount: 1500 }];
  ok('dummy.dps window counts the last 5 s only', dpsOfHits(hits, 12, 5) === 400, `${dpsOfHits(hits, 12, 5)}`);
  ok('dummy.dps empty is zero', dpsOfHits([], 12) === 0);
  ok('dummy.dps window edge is inclusive', dpsOfHits([{ t: 7, amount: 50 }], 12, 5) === 10);

  const single = new TrainingDummy(9001, TEST_DUMMIES.single.kind);
  const pack = [0, 1, 2, 3, 4].map((k) => new TrainingDummy(9010 + k, 'small'));
  const tank = new TrainingDummy(9100, 'tank');
  ok('dummy.kinds: single normal, pack small, tank', single.dummyKind === 'normal' && pack.every((d) => d.dummyKind === 'small') && tank.dummyKind === 'tank');
  ok('dummy.dummies never die', single.hp > 1e8 && tank.hp > 1e8);

  // the tank dummy hits the local player every TANK_DUMMY.strikeEvery seconds while in range
  const p = H.addPlayer('knight', 60);
  const hitsSeen = [];
  const realHit = G.combat.hitLocalPlayer.bind(G.combat);
  G.combat.hitLocalPlayer = (hit) => { hitsSeen.push(hit); return null; };
  tank.position.set(0, 0, 0);
  p.position.set(1, 0, 0);
  tank.tankStrike(TANK_DUMMY.strikeEvery + 0.01);
  ok('dummy.tank hits back in range', hitsSeen.length === 1 && hitsSeen[0].type === 'physical' && hitsSeen[0].sourceId === tank.id);
  ok('dummy.tank blow is a fraction of max HP', hitsSeen[0]?.amount === Math.round(p.maxHp * TANK_DUMMY.hpFrac), `${hitsSeen[0]?.amount}`);
  p.position.set(TANK_DUMMY.range + 2, 0, 0);
  tank.tankStrike(TANK_DUMMY.strikeEvery + 0.01);
  ok('dummy.tank stays quiet out of range', hitsSeen.length === 1);
  p.position.set(1, 0, 0);
  tank.tankStrike(0.1);
  ok('dummy.tank waits for its timer', hitsSeen.length === 1);
  G.combat.hitLocalPlayer = realHit;
}

// ------------------------------------------------------------------------------------------------ data.* (guide targets, fence, NPC)
{
  ok('data.every zone of the guide is an open-world zone', BETA_ZONES.every((z) => !!OPEN_ZONES[z.id]), BETA_ZONES.map((z) => z.id).join(','));
  ok('data.the four open zones are listed', ['sisli_vadi', 'karakir_bozkiri', 'ayaz_daglari', 'kizil_sinir'].every((id) => BETA_ZONES.some((z) => z.id === id)));
  ok('data.every dungeon of the guide resolves', [...new Set([...DUNGEON_IDS, ...MPLUS_POOL])].every((id) => !!getDungeon(id)));
  ok('data.guide NPC opens the betaGuide panel', BETA_GUIDE_NPC.ui?.panel === 'betaGuide' && BETA_GUIDE_NPC.role === 'citizen');
  ok('data.guide NPC id is unique in the town', !TOWN.npcs.some((n) => n.id === BETA_GUIDE_NPC.id));
  const half = Math.max(TEST_AREA.halfW, TEST_AREA.halfD);
  ok('data.test corner lies inside the town', Math.abs(TEST_AREA.cx) + half < TOWN.size[0] / 2 && Math.abs(TEST_AREA.cz) + half < TOWN.size[1] / 2);
  const inside = (x, z) => Math.abs(x - TEST_AREA.cx) < TEST_AREA.halfW && Math.abs(z - TEST_AREA.cz) < TEST_AREA.halfD;
  ok('data.dummies and guide stand inside the fence', inside(TEST_DUMMIES.single.x, TEST_DUMMIES.single.z) && inside(TEST_DUMMIES.pack.x, TEST_DUMMIES.pack.z) && inside(TEST_DUMMIES.tank.x, TEST_DUMMIES.tank.z) && inside(BETA_GUIDE_NPC.pos[0], BETA_GUIDE_NPC.pos[2]));
  ok('data.town NPC ids do not collide with dummies', !TOWN.npcs.some((n) => n.id.startsWith('beta_')));
}

for (const r of report) if (process.env.V) console.log('  ' + r);
console.log(`beta: ${passes} passed, ${fails} failed`);
H.restoreConsole();
console.log(fails === 0 ? 'PASS' : 'FAIL');
process.exit(fails === 0 ? 0 : 1);
