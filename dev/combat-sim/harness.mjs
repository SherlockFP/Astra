// Headless combat simulation harness (Node + rolldown/oxc TS transform hook + extensionless-import resolver).
// Run from the project root:  node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/<scenario>.mjs [arg]
// scenarios: basic (LMB chains) | skills [class] | specials [id] | shapes (remote casts + hit shapes) | status (CC/DR/dots/potions/net) | flows | effects
// No browser, no server: real Combat/SkillSystem/HitShapes/StatusEffects/World with fake Player/Enemy actors and stub vfx/audio.
const root = new URL('../../src/', import.meta.url).href;
export const imp = (p) => import(root + p);

export const THREE = await import(new URL('../../node_modules/three/build/three.module.js', import.meta.url).href);
const { G } = await imp('game/G.ts');
const { EventBus } = await imp('core/EventBus.ts');
const { World } = await imp('world/World.ts');
const { Actor } = await imp('entities/Actor.ts');
const { Combat } = await imp('combat/Combat.ts');
const { SkillSystem } = await imp('combat/SkillSystem.ts');
const { HitShapes } = await imp('combat/HitShapes.ts');
export const { SKILLS } = await imp('data/skills.ts');
export const { CLASSES, defaultSkillBar } = await imp('data/classes.ts');
// The calibration table (src/data/specTuning.ts, CM1) belongs to the balance pass only. Mechanics sims (kit_*, wow_core, pips, beta, ...)
// check raw coefficients, so they run with the table cleared; balance.mjs and solo_lowlevel.mjs keep it.
if (!/(balance|solo_lowlevel|quest_boss)\.mjs$/.test(process.argv[1] ?? '')) { const { SPEC_TUNING } = await imp('data/specTuning.ts'); for (const k of Object.keys(SPEC_TUNING)) delete SPEC_TUNING[k]; }
export { G };

export const errors = [];
const origErr = console.error;
const origWarn = console.warn;
console.error = (...a) => { errors.push('ERR ' + a.map(String).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
export function restoreConsole() { console.error = origErr; console.warn = origWarn; }

export const log = [];
export const held = new Set();
export const pressedNow = new Set();

const noopHandle = { alive: false, stop() {}, setPosition() {} };
G.vfx = {
  hitBudget: 10,
  spawn: () => noopHandle,
  telegraph: () => ({ setProgress() {}, setTransform() {}, cancel() {} }),
  flash() {}, trail: () => noopHandle, damageNumber() {}, screenFlash() {}, lightFlash() {},
  createProjectileVisual: () => ({ object: new THREE.Object3D(), update() {}, dispose() {} }),
};
G.audio = { play() {} };
G.engine = { timeScale: 1, time: 0, fps: 60, hitStop() {} };
G.camera = { shake() {}, punch() {}, kickFov() {}, getBasis: () => ({ forward: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0) }) };
G.input = {
  pressed: (a) => pressedNow.has(a),
  down: (a) => held.has(a),
  keyPressed: () => false,
  keyDown: () => false,
  moveAxis: () => ({ x: 0, y: 0 }),
};
G.mplus = { onEnemyKilled() {}, onBossKilled() {}, onPlayerDeath() {} };
G.loot = { onEnemyKilled() {} };
G.events = new EventBus();
G.net = undefined;

G.character = {
  specials: {}, moreDamage: 1, save: { skillBar: {}, stats: { deaths: 0 } }, stats: {},
  material: () => 0, useMaterial: () => false, persist() {},
};

export const events = {};
for (const name of ['damage', 'heal', 'death', 'player:died', 'skill:cast', 'skill:fail', 'status:applied', 'status:removed', 'combo:changed', 'combopoints:changed', 'camera:shake', 'hitstop', 'skill:castInterrupted', 'enemy:castEnd']) {
  events[name] = [];
  G.events.on(name, (e) => { events[name].push({ t: G.engine.time, ...e }); });
}
export const clearEvents = () => { for (const k of Object.keys(events)) events[k].length = 0; };

G.combat = new Combat();
G.skills = new SkillSystem();
G.hitShapes = new HitShapes();

export const scene = new THREE.Scene();
export const world = new World(scene);
G.world = world;

export class FakePlayer extends Actor {
  /** Player.currentGear(): no gear in the sims (weapon art falls back to the class art). */
  currentGear() { return {}; }
  constructor(classId, level = 30) {
    super(1, 'player', 'player');
    this.classId = classId;
    this.isLocal = true;
    this.level = level;
    this.dodging = false;
    this.dodgeStartedAt = -99;
    this.dodgeCharges = 2; this.dodgeMaxCharges = 2; this.dodgeRecharge = 1.4;
    this.actionMul = 1; this.actionUntil = 0;
    this.radius = 0.5; this.height = 2.4;
    const cls = CLASSES[classId];
    this.resourceType = cls.resource;
    this.maxHp = 5000; this.hp = 5000; this.maxResource = 100;
    this.resource = cls.startResource * 100;
    this.stats = { weaponMin: 90, weaponMax: 110, str: 100, dex: 100, int: 100, vit: 100, critChance: 0.05, critDamage: 0, armor: 300, weaponAps: 1 };
    this.authority = true;
  }
  setActionMove(mul, dur) { this.actionMul = mul; this.actionUntil = G.engine.time + dur; }
  getActionMoveMul() { return G.engine.time < this.actionUntil ? this.actionMul : 1; }
  clearActionMove() { this.actionUntil = 0; }
  setToolNodes() {}
  getWeaponTip() { return this.object3d; }
  playHitReaction() {}
  refreshStats() {}
  onStatusesChanged() {}
  update(dt) { super.update(dt); }
}

export class FakeEnemy extends Actor {
  constructor(id, x, z, opts = {}) {
    super(id, 'enemy', 'enemy');
    this.def = { id: 'dummy', rank: opts.rank ?? 'trash', role: 'melee', resist: opts.resist ?? {}, ccImmune: !!opts.ccImmune, anims: { hit: 'Hit_A', death: 'Death_A' } };
    this.isBoss = this.def.rank === 'boss';
    this.radius = opts.radius ?? 0.6; this.height = 2.2;
    this.maxHp = this.hp = opts.hp ?? 100000;
    this.level = 30;
    this.stats = { armor: 0 };
    this.position.set(x, 0, z);
    this.ai = null;
    this.authority = true;
  }
  update(dt) { super.update(dt); }
}

export function addPlayer(classId, level = 30, specials = {}) {
  // reset world
  for (const e of [...world.entities.values()]) world.remove(e);
  world.update(0);
  G.skills.clearAll?.();
  const p = new FakePlayer(classId, level);
  world.add(p);
  world.localPlayer = G.player = p;
  G.character.specials = specials;
  G.character.save.skillBar = defaultSkillBar(classId, level);
  G.character.classId = classId;
  clearEvents();
  return p;
}

let eid = 100;
export function addEnemy(x, z, opts) {
  const e = new FakeEnemy(eid++, x, z, opts);
  world.add(e);
  return e;
}

export const DT = 1 / 60;
// mimic PlayerController's held-key repeat logic for one frame
const repeat = {};
const SLOT_ACTION = { lmb: 'skill_lmb', rmb: 'skill_rmb', q: 'skill_q', e: 'skill_e', r: 'skill_r', s1: 'skill_s1', s2: 'skill_s2', s3: 'skill_s3' };
export function aimFor(p, e) {
  let tx = p.position.x + Math.sin(p.yaw) * 6, tz = p.position.z + Math.cos(p.yaw) * 6;
  if (e) { tx = e.position.x; tz = e.position.z; }
  const dx = tx - p.position.x, dz = tz - p.position.z;
  const l = Math.hypot(dx, dz) || 1;
  return { point: [tx, 0, tz], dir: [dx / l, 0, dz / l], targetId: e ? e.id : null };
}
let aimTarget = null;
export function setAimTarget(e) { aimTarget = e; }
G.skills.aimProvider = () => aimFor(world.localPlayer, aimTarget && !aimTarget.isDead ? aimTarget : null);
let firstFrame = new Set();
export function press(slot) { held.add(SLOT_ACTION[slot]); firstFrame.add(slot); }
export function release(slot) { held.delete(SLOT_ACTION[slot]); firstFrame.delete(slot); }
export function tap(slot) { press(slot); step(1); release(slot); }

export function step(n = 1) {
  const p = world.localPlayer;
  for (let i = 0; i < n; i++) {
    pressedNow.clear();
    for (const s of firstFrame) pressedNow.add(SLOT_ACTION[s]);
    // controller
    for (const slot of Object.keys(SLOT_ACTION)) {
      const act = SLOT_ACTION[slot];
      const pressed = pressedNow.has(act);
      const down = held.has(act);
      if (repeat[slot] > 0) repeat[slot] -= DT;
      if (!pressed && !down) continue;
      if (!pressed && (!p.canAct() || repeat[slot] > 0)) continue;
      const ok = G.skills.tryCastSlot(p, slot, aimFor(p, aimTarget && !aimTarget.isDead ? aimTarget : null));
      if (ok) repeat[slot] = slot === 'lmb' ? 0 : 0.1;
      else if (!pressed) repeat[slot] = slot === 'lmb' ? 0.03 : 0.12;
    }
    firstFrame.clear();
    G.engine.time += DT;
    world.update(DT);
    G.skills.update(DT);
    G.combat.update(DT);
    G.hitShapes.update(DT);
  }
}
export const sec = (s) => Math.round(s / DT);
export function stepSec(s) { step(sec(s)); }
