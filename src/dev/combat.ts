import * as THREE from 'three';
import { bootHarness } from './harness';
import { G } from '../game/G';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { PlayerController } from '../game/PlayerController';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { CharacterState } from '../systems/CharacterState';
import { CLASSES, CLASS_IDS } from '../data/classes';
import { getSpec } from '../data/specs';
import { resetMajorCooldowns } from '../combat/majors';
import type { SpecId } from '../types/v2';
import { SKILLS } from '../data/skills';
import { UNIQUES, SETS } from '../data/uniques';
import { TALENT_NODES } from '../data/talents';
import { HitShapes, type HitShapeSpec } from '../combat/HitShapes';
import { FEEL, getFeelVersion, setFeelVersion, type HitWeight } from '../combat/feel';
import type { ClassId } from '../types/common';
import type { EnemyDef } from '../types/enemies';
import type { SkillSlotKey, StatusId } from '../types/skills';
import { VFX_IDS } from '../types/vfx';
import { SFX_IDS } from '../types/audio';
import { vfxResolves } from '../vfx/VFX';
import { sfxResolves } from '../audio/aliases';

// ---------------------------------------------------------------------------------------------------------------------
// Dev page for the combat module: real Player + PlayerController + camera + HUD, training dummies, chasing skeleton packs,
// an elite and a CC-immune boss with simple page-local AI, HitShape testers, class / level switching.
//   WASD move | Shift dodge | LMB combo (hold) | RMB, Q, E, 1-3, R skills | 4/5 potions | mouse orbit (click to lock)
//   F1-F4 (or 7 8 9 0) = class | , . = level -/+ | P pack | U elite | Y boss | X clear | V dummies | H heal/refill | K die/revive | G aggro on/off
//   panel: status testers (freeze/stun/slow...) on the nearest enemy, HitShape testers, and a menu to toggle legendary / set / passive specials
// ---------------------------------------------------------------------------------------------------------------------

const q = new URLSearchParams(location.search);
const h = await bootHarness({ orbit: false, floorSize: 160 });
const { scene, world } = h;
G.ui.setMode('town');
scene.fog = new THREE.Fog(0x14121a, 45, 150);
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
if (q.get('fakelock') === '1') G.input.isLocked = () => true;

// ---- arena ----
const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a554c, roughness: 1 });
function addBox(x0: number, z0: number, x1: number, z1: number, height = 4, color?: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), height, Math.abs(z1 - z0)), color ? new THREE.MeshStandardMaterial({ color, roughness: 1 }) : wallMat);
  m.position.set((x0 + x1) / 2, height / 2, (z0 + z1) / 2);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  world.nav.setRect(x0, z0, x1, z1, false);
}
addBox(-50, -51, 50, -50);
addBox(-50, 50, 50, 51);
addBox(-51, -50, -50, 50);
addBox(50, -50, 51, 50);
for (const [x, z] of [[14, -8], [-14, -10], [20, 12], [-20, 14], [0, -24]] as [number, number][]) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 5, 10), new THREE.MeshStandardMaterial({ color: 0x70685a, roughness: 1 }));
  m.position.set(x, 2.5, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  world.nav.setCircle(x, z, 1.1, false);
}

// ---- enemy defs (placeholder data: the enemies module owns the real ones) ----
const SK = '/assets/models/enemies/';
const WP = '/assets/models/weapons/skeleton/';
const ab = (anim: string) => ({ id: 'basic', name: 'Saldırı', kind: 'melee', range: 2.2, cooldown: 1.8, windup: 0.5, anim }) as unknown as EnemyDef['basicAttack'];
function def(p: Partial<EnemyDef> & { id: string; name: string; model: string }): EnemyDef {
  return {
    scale: 1, role: 'melee', rank: 'trash', hpMult: 1, dmgMult: 1, speed: 4.2, radius: 0.6, aggroRange: 30, attackRange: 2.2, attackCooldown: 1.8,
    basicAttack: ab('1H_Melee_Attack_Chop'), abilities: [], forces: 1, xp: 1,
    anims: { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', hit: 'Hit_A', death: 'Death_A' }, ...p,
  } as EnemyDef;
}
const DEFS: Record<string, EnemyDef> = {
  minion: def({
    id: 'dev_minion', name: 'İskelet Er', model: SK + 'Skeleton_Minion.glb', resist: { physical: 0.1, poison: 0.5, frost: 0.25, fire: -0.25 },
    visual: { attach: [{ url: WP + 'Skeleton_Blade.gltf', bone: 'handslot.r', rotY: Math.PI }], clipsFrom: SK + 'Skeleton_Warrior.glb' },
    anims: { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', hit: 'Hit_A', death: 'Death_A' },
  }),
  swarm: def({
    id: 'dev_swarm', name: 'Goblin', model: '/assets/models/monsters/Goblin.glb', scale: 0.5, role: 'swarm', radius: 0.4, speed: 5.2, hpMult: 0.35,
    anims: { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'HitRecieve', death: 'Death' }, attackRange: 1.6,
    basicAttack: ab('Attack'),
  }),
  elite: def({
    id: 'dev_elite', name: 'İskelet Savaşçı', model: SK + 'Skeleton_Warrior.glb', rank: 'elite', hpMult: 4, dmgMult: 1.5, scale: 1.2, radius: 0.8, speed: 3.6,
    visual: { attach: [{ url: WP + 'Skeleton_Blade.gltf', bone: 'handslot.r', rotY: Math.PI }, { url: WP + 'Skeleton_Shield_Large_A.gltf', bone: 'handslot.l', pos: [0, 0.017, 0.156] }] },
    anims: { idle: 'Idle_Combat', walk: 'Walking_A', run: 'Running_A', hit: 'Hit_B', death: 'Death_A' }, attackRange: 2.6,
  }),
  boss: def({
    id: 'dev_boss', name: 'Mağara Devi', model: '/assets/models/monsters/Giant.glb', rank: 'boss', hpMult: 80, dmgMult: 2.5, scale: 1.16, radius: 1.3, speed: 3.0, ccImmune: true,
    anims: { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'HitRecieve', death: 'Death' }, attackRange: 3.4, attackCooldown: 2.6,
    basicAttack: ab('Attack'),
  }),
  dummy: def({
    id: 'dev_dummy', name: 'Antrenman Kuklası', model: SK + 'Skeleton_Minion.glb', hpMult: 1, speed: 0,
    anims: { idle: 'Idle', walk: 'Idle', run: 'Idle', hit: 'Hit_A', death: 'Death_A' },
  }),
};

let idSeq = 200;
const levelOf = () => player?.level ?? 30;
const monsterHp = (l: number) => Math.round(14 + 0.62 * l * l);
const monsterDmg = (l: number) => Math.round(14 + 4.5 * l);
let aggressive = true;

class DevAI {
  cd = 1 + Math.random();
  windup = 0;
  constructor(readonly e: Enemy, readonly mode: 'chase' | 'still') {}
  /** Combat reads this off every enemy AI (hyper-armour); dev dummies never have it. */
  armoredNow(): boolean {
    return false;
  }
  update(dt: number): void {
    const e = this.e;
    const p = G.world?.localPlayer;
    if (e.isDead) return;
    this.cd -= dt;
    const anim = e.anim;
    const d = e.def;
    const forced = !!e.forcedMove && world.time < e.forcedMove.until;
    if (!p || p.isDead || this.mode === 'still' || !aggressive || e.statuses.stunned) {
      e.velocity.set(0, 0, 0);
      if (anim && !forced && !anim.isPlayingOneShot) anim.setBase(anim.pick(d.anims.idle) ?? 'Idle', { fade: 0.15 });
      return;
    }
    const dx = p.position.x - e.position.x, dz = p.position.z - e.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > d.aggroRange) { e.velocity.set(0, 0, 0); return; }
    if (this.windup > 0) {
      this.windup -= dt;
      e.velocity.set(0, 0, 0);
      return;
    }
    const want = Math.atan2(dx, dz);
    if (!forced) {
      let diff = want - e.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.yaw += diff * Math.min(1, dt * 9);
    }
    if (dist > d.attackRange * 0.8 && !forced && !e.statuses.rooted) {
      const sp = e.moveSpeed();
      const nx = dx / dist, nz = dz / dist;
      e.position.x += nx * sp * dt;
      e.position.z += nz * sp * dt;
      world.nav.resolveCircle(e.position, e.radius);
      e.velocity.set(nx * sp, 0, nz * sp);
      anim?.setBase(anim.pick(d.anims.run) ?? 'Running_A', { fade: 0.12, speed: sp / (d.speed || 4) });
    } else if (!forced) {
      e.velocity.set(0, 0, 0);
      anim?.setBase(anim.pick(d.anims.idle) ?? 'Idle', { fade: 0.12 });
      if (this.cd <= 0 && dist < d.attackRange + 0.4) this.attack(dx / dist, dz / dist);
    }
  }
  attack(nx: number, nz: number): void {
    const e = this.e;
    const d = e.def;
    this.cd = d.attackCooldown * (0.9 + Math.random() * 0.4);
    this.windup = 0.55;
    const lvl = levelOf();
    const dmg = monsterDmg(lvl) * d.dmgMult;
    e.anim?.playOnce(d.basicAttack.anim, { speed: 1.2, fade: 0.06, restart: true });
    G.vfx.spawn('enemy_cast_glow', e.pointAt(0.7), { duration: 0.5 });
    G.hitShapes.spawn({
      sourceId: e.id, shape: { type: 'cone', radius: d.attackRange + 0.9, angle: 100 }, origin: [e.position.x, 0, e.position.z], dir: [nx, nz],
      delay: 0.5, damage: dmg, type: 'physical', telegraph: true, followSource: true, knockback: e.def.rank === 'boss' ? 4 : 1.2, abilityName: d.name,
    });
  }
  dispose(): void { /* nothing */ }
}

async function spawn(kind: keyof typeof DEFS, x: number, z: number, mode: 'chase' | 'still' = 'chase'): Promise<Enemy> {
  const d = DEFS[kind];
  const e = new Enemy(idSeq++, d);
  e.level = levelOf();
  e.position.set(x, 0, z);
  e.yaw = Math.random() * 6;
  const hpBase = monsterHp(e.level);
  e.maxHp = e.hp = kind === 'dummy' ? 500_000 : Math.round(hpBase * d.hpMult * (d.rank === 'boss' ? 1 : 1));
  e.baseDamage = monsterDmg(e.level) * d.dmgMult;
  e.stats = { armor: 0 };
  e.ai = new DevAI(e, mode) as unknown as Enemy['ai'];
  await e.loadModel();
  world.add(e);
  try { G.ui.addNameplate(e); } catch { /* optional */ }
  return e;
}

function clearEnemies(onlyDummies = false): void {
  for (const e of [...world.enemies]) {
    if (onlyDummies && e.def.id !== 'dev_dummy') continue;
    world.remove(e);
  }
}

function around(count: number, radius: number, cx: number, cz: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const r = radius * (0.7 + Math.random() * 0.5);
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

// ---- player ----
let classIdx = Math.max(0, CLASS_IDS.indexOf((q.get('class') as ClassId) ?? 'knight'));
let level = Number(q.get('level') ?? 30);
/** GDD_V2 WP5: spec picked with the Uzmanlık buttons (read by spawnPlayer; a class button clears it). */
let pendingSpec: SpecId | null = null;
let player: Player | null = null;
let controller: PlayerController | null = null;
let cam: ThirdPersonCamera | null = null;
let character: CharacterState | null = null;

async function spawnPlayer(): Promise<void> {
  const classId = CLASS_IDS[classIdx];
  const prevPos = player ? player.position.clone() : new THREE.Vector3(0, 0, 0);
  const prevYaw = player ? player.yaw : 0;
  controller?.dispose();
  if (player) { G.skills.reset(player); world.remove(player); }
  character = CharacterState.create('Test', classId, 0);
  character.save.level = level;
  character.save.skillBar = CharacterState.defaultBar(classId, level);
  if (pendingSpec && getSpec(pendingSpec)?.classId === classId) {
    character.save.spec = pendingSpec;
    character.save.skillBar = { ...(getSpec(pendingSpec)?.defaultBar ?? {}) };
  }
  character.save.materials = { pot_hp_3: 30, pot_res_3: 30 };
  character.recomputeStats(false);
  G.character = character;
  const p = new Player({ id: 1, slot: 0, classId, name: 'Test', level, isLocal: true, peerId: 'self', character });
  p.position.copy(prevPos);
  p.yaw = prevYaw;
  await p.loadModel();
  world.add(p);
  world.localPlayer = G.player = p;
  player = p;
  if (!cam) {
    cam = new ThirdPersonCamera(h.camera);
    G.camera = cam;
  }
  controller = new PlayerController(p, cam);
  G.skills.aimProvider = () => controller!.getAim();
  cam.snap();
  p.refreshStats();
  p.hp = p.maxHp;
  G.events.emit('skillbar:changed', {});
  G.events.emit('player:stats', {});
  G.events.emit('player:resources', { hp: p.hp, maxHp: p.maxHp, res: p.resource, maxRes: p.maxResource });
}
await spawnPlayer();
G.engine.onUpdate((dt) => controller?.update(dt), -1);
h.onFrame((dt) => cam?.update(dt));

// ---- initial enemies ----
await spawn('dummy', 8, 10, 'still');
await spawn('dummy', -6, 14, 'still');
await spawn('dummy', 16, 18, 'still');
if (q.get('pack') !== '0') for (const [x, z] of around(5, 14, 0, 18)) await spawn('minion', x, z);

// ---- HitShape testers (on the local player) ----
function pdir(): [number, number] { return [Math.sin(player!.yaw), Math.cos(player!.yaw)]; }
function shapeTest(kind: string): void {
  const p = player;
  if (!p) return;
  const [dx, dz] = pdir();
  const base = { sourceId: null, damage: Math.round(monsterDmg(levelOf()) * 1.4), type: 'physical' as const, telegraph: true, abilityName: 'Test Şekli' };
  const ox = p.position.x + dx * 4, oz = p.position.z + dz * 4;
  const spec = (s: Omit<HitShapeSpec, 'id'>) => G.hitShapes.spawn(s);
  switch (kind) {
    case 'cone': spec({ ...base, shape: { type: 'cone', radius: 6, angle: 90 }, origin: [p.position.x - dx * 2, 0, p.position.z - dz * 2], dir: [dx, dz], delay: 1.2, knockback: 3 }); break;
    case 'circle': spec({ ...base, shape: { type: 'circle', radius: 4 }, origin: [p.position.x, 0, p.position.z], dir: [0, 1], delay: 1.4, vfxOnLand: 'fire_burst', type: 'fire', knockback: 2 }); break;
    case 'ring': spec({ ...base, shape: { type: 'ring', inner: 3, outer: 7 }, origin: [p.position.x, 0, p.position.z], dir: [0, 1], delay: 1.6, vfxOnLand: 'shockwave', knockback: 2 }); break;
    case 'line': spec({ ...base, shape: { type: 'line', length: 14, width: 3 }, origin: [p.position.x - dx * 4, 0, p.position.z - dz * 4], dir: [dx, dz], delay: 1.3, type: 'lightning' }); break;
    case 'rect': spec({ ...base, shape: { type: 'rect', width: 4, length: 8 }, origin: [ox, 0, oz], dir: [dx, dz], delay: 1.2 }); break;
    case 'hazard': spec({ ...base, damage: Math.round(base.damage * 0.25), shape: { type: 'circle', radius: 3.5 }, origin: [ox, 0, oz], dir: [0, 1], delay: 1.0, type: 'fire', persist: { duration: 6, tick: 0.5 }, vfxOnLand: 'fire_ground', statuses: [{ status: 'burn', duration: 3, magnitude: 0.5 }] }); break;
    case 'proj': spec({ ...base, shape: { type: 'circle', radius: 0.5 }, origin: [p.position.x - dx * 14, 1.3, p.position.z - dz * 14], dir: [dx, dz], delay: 0.8, type: 'fire', projectile: { speed: 11, radius: 0.5, range: 30, vfx: 'fire_projectile' }, vfxOnLand: 'fire_burst' }); break;
    case 'soak': spec({ ...base, damage: base.damage * 3, shape: { type: 'circle', radius: 3 }, origin: [ox, 0, oz], dir: [0, 1], delay: 2.0, kind: 'soak', soak: true }); break;
    case 'safe': spec({ ...base, damage: base.damage * 2, shape: { type: 'circle', radius: 3.5 }, origin: [ox, 0, oz], dir: [0, 1], delay: 2.5, kind: 'safe' }); break;
  }
}

// ---- keys (captured before the game Input) ----
const stopKeys = new Set(['F1', 'F2', 'F3', 'F4', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Comma', 'Period', 'KeyP', 'KeyU', 'KeyY', 'KeyX', 'KeyV', 'KeyH', 'KeyG', 'KeyL', 'KeyT', 'KeyN', 'KeyB', 'KeyK']);
window.addEventListener('keydown', (e) => {
  if (e.repeat || !stopKeys.has(e.code)) return;
  const stop = () => { e.stopImmediatePropagation(); e.preventDefault(); };
  const p = player;
  switch (e.code) {
    case 'F1': case 'F2': case 'F3': case 'F4': case 'Digit7': case 'Digit8': case 'Digit9': case 'Digit0': {
      classIdx = e.code.startsWith('F') ? Number(e.code.slice(1)) - 1 : e.code === 'Digit0' ? 3 : Number(e.code.slice(5)) - 7;
      void spawnPlayer();
      stop();
      break;
    }
    case 'Comma': level = Math.max(1, level - 5); void spawnPlayer(); stop(); break;
    case 'Period': level = Math.min(60, level + 5); void spawnPlayer(); stop(); break;
    case 'KeyP': if (p) for (const [x, z] of around(8, 14, p.position.x, p.position.z)) void spawn(Math.random() < 0.4 ? 'swarm' : 'minion', x, z); stop(); break;
    case 'KeyU': if (p) void spawn('elite', p.position.x + 10, p.position.z + 10); stop(); break;
    case 'KeyY': if (p) void spawn('boss', p.position.x + 0, p.position.z + 16); stop(); break;
    case 'KeyX': clearEnemies(); stop(); break;
    case 'KeyV': if (p) { void spawn('dummy', p.position.x + 6, p.position.z + 8, 'still'); } stop(); break;
    case 'KeyH': if (p) { p.hp = p.maxHp; p.resource = p.resourceType === 'rage' && p.classId === 'barbarian' ? p.maxResource : p.maxResource; G.skills.reset(p); } stop(); break;
    case 'KeyK': if (p) { if (p.isDead) G.combat.reviveLocalPlayer(0.5); else G.combat.killLocalPlayer(null); } stop(); break;
    case 'KeyG': aggressive = !aggressive; stop(); break;
    case 'KeyL': stop(); break;
  }
}, true);

// ---- on-screen panel (for mouse-less browser testing too) ----
const panel = document.getElementById('dev-panel')!;
function btn(label: string, fn: () => void, sep = false): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
  b.addEventListener('mousedown', (ev) => ev.stopPropagation());
  panel.appendChild(b);
  if (sep) { const s = document.createElement('div'); s.className = 'sep'; panel.appendChild(s); }
}
// GDD_V2 WP5: spec picks (set on the next spawn; a class button clears it). Level 30 unlocks the spec skills and majors.
CLASS_IDS.forEach((c, i) => btn(CLASSES[c].name, () => { classIdx = i; pendingSpec = null; void spawnPlayer(); }, i === 3));
const SPEC_HARNESS: SpecId[] = ['knight_protector', 'knight_blademaster', 'barbarian_warlord', 'barbarian_butcher', 'rogue_assassin', 'rogue_alchemist'];
SPEC_HARNESS.forEach((sid, i) => btn(`Uzmanlık: ${getSpec(sid)?.name ?? sid}`, () => {
  const sp = getSpec(sid);
  if (!sp) return;
  classIdx = CLASS_IDS.indexOf(sp.classId);
  level = Math.max(level, 30);
  pendingSpec = sid;
  void spawnPlayer();
}, i === 5));
btn('Büyük bekleme sıfırla', () => resetMajorCooldowns(), true);
btn('Lv-5', () => { level = Math.max(1, level - 5); void spawnPlayer(); });
btn('Lv+5', () => { level = Math.min(60, level + 5); void spawnPlayer(); }, true);
btn('Sürü (P)', () => { if (player) for (const [x, z] of around(8, 12, player.position.x, player.position.z)) void spawn(Math.random() < 0.4 ? 'swarm' : 'minion', x, z); });
btn('Seçkin (U)', () => { if (player) void spawn('elite', player.position.x + 8, player.position.z + 8); });
btn('Boss (Y)', () => { if (player) void spawn('boss', player.position.x, player.position.z + 14); });
btn('Kukla (V)', () => { if (player) void spawn('dummy', player.position.x + 5, player.position.z + 7, 'still'); });
btn('Temizle (X)', () => clearEnemies(), true);
for (const k of ['cone', 'circle', 'ring', 'line', 'rect', 'hazard', 'proj', 'soak', 'safe']) btn('◇ ' + k, () => shapeTest(k));

// ---- status testers on the nearest enemy (host path: statuses straight through StatusEffects / Combat)
function nearestForTest(): Enemy | null {
  const p = player;
  return p ? world.nearest(world.enemies, p.position, 60, (e) => !e.isDead) : null;
}
function testStatus(id: StatusId, dur: number, mag?: number): void {
  const e = nearestForTest();
  if (!e || !player) return;
  G.combat.applyEnemyStatuses(player, e, [{ status: id, duration: dur, magnitude: mag }]);
}
for (const [id, dur, mag] of [['freeze', 2], ['stun', 1.5], ['slow', 3, 0.4], ['fear', 2], ['burn', 4, 0.5], ['bleed', 4, 0.5], ['poison', 4, 0.3], ['taunt', 4]] as [StatusId, number, number?][]) {
  btn('☣ ' + id, () => testStatus(id, dur, mag), id === 'taunt');
}

// ---- GDD_V2 §3 feel tests: charged heavy, guard / parry, poise break and Kritik Vuruş (hold / press are simulated)
btn('◆ Şarj (LMB 0.9 sn basılı)', () => {
  if (!player) return;
  G.skills.tryCastSlot(player, 'lmb', aimAt(nearestEnemy()));
  heldUntil.set('skill_lmb', G.engine.time + 0.9);
});
btn('◆ Şarj (LMB 1.4 sn: sanat)', () => {
  if (!player) return;
  G.skills.tryCastSlot(player, 'lmb', aimAt(nearestEnemy()));
  heldUntil.set('skill_lmb', G.engine.time + 1.4);
});
btn('◆ Siper (G 1.5 sn basılı)', () => heldUntil.set('guard', G.engine.time + 1.5));
btn('◆ Savuşturma penceresi (G)', () => { if (player) G.combat.guardInput(player, true, true, false); });
btn('◆ Kritik Açık (en yakın, 2 sn)', () => testStatus('marked_crit', 2));
btn('◆ Savuşturma darbesi (en yakın)', () => { const e = nearestForTest(); if (e && player) G.combat.applyParry(e, player.id); }, true);

// ---- GDD_V2 §3.3 running / jump / roll attacks and §3.9 combo routes (trigger conditions skipped; routes fed token by token)
btn('◆ Koşu saldırısı', () => { if (player) G.skills.debugMove(player, 'run'); });
btn('◆ Zıplama saldırısı (havada iner)', () => { if (player) { player.jumping = true; player.jumpY = 1.6; G.skills.debugMove(player, 'jump'); } });
btn('◆ Yuvarlanma saldırısı', () => { if (player) G.skills.debugMove(player, 'roll'); });
btn('◆ Rota: Kalkan Ezme (L L H)', () => { if (player) { G.skills.noteRoute(player, 'L'); G.skills.noteRoute(player, 'L'); G.skills.noteRoute(player, 'H'); } }, true);
G.events.on('combo:route', (e) => G.events.emit('ui:toast', { text: `ROTA: ${e.name} (kademe ${e.tier})`, kind: 'success' }));

// ---- specials (talent notables / keystones, legendaries, set bonuses) toggles: fakes G.character.specials entries
interface SpecialInfo { id: string; name: string; desc: string; params: Record<string, number>; source: 'talent' | 'unique' | 'set' }
const specialInfos: SpecialInfo[] = [];
for (const u of Object.values(UNIQUES)) if (u.special) specialInfos.push({ id: u.special.id, name: u.name, desc: u.special.desc, params: u.special.params ?? {}, source: 'unique' });
for (const set of Object.values(SETS)) for (const b of set.bonuses) if (b.special) specialInfos.push({ id: b.special.id, name: set.name + ' (' + b.count + ')', desc: b.special.desc, params: { count: b.count }, source: 'set' });
for (const n of Object.values(TALENT_NODES)) if (n.special) specialInfos.push({ id: n.special.id, name: n.name, desc: n.special.desc, params: n.special.params ?? {}, source: 'talent' });
const specialsBox = document.getElementById('dev-specials')!;
const specialsList = document.createElement('div');
specialsList.className = 'list';
specialsList.style.display = 'none';
const specialsBtn = document.createElement('button');
specialsBtn.textContent = '✦ Efsaneler / Setler / Pasifler ▾';
specialsBtn.addEventListener('click', (ev) => { ev.stopPropagation(); specialsList.style.display = specialsList.style.display === 'none' ? 'flex' : 'none'; });
specialsBtn.addEventListener('mousedown', (ev) => ev.stopPropagation());
specialsBox.append(specialsBtn, specialsList);
const specialBtns = new Map<string, HTMLButtonElement>();
function refreshSpecialBtns(): void {
  for (const [id, b] of specialBtns) b.classList.toggle('on', !!character?.specials[id]);
}
for (const info of specialInfos) {
  const b = document.createElement('button');
  b.textContent = (info.source === 'unique' ? '★ ' : info.source === 'set' ? '◆ ' : '○ ') + info.name;
  b.title = info.desc;
  b.addEventListener('mousedown', (ev) => ev.stopPropagation());
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (!character) return;
    if (character.specials[info.id]) delete character.specials[info.id];
    else character.specials[info.id] = { id: info.id, desc: info.desc, params: { ...info.params }, source: info.source };
    refreshSpecialBtns();
  });
  specialBtns.set(info.id, b);
  specialsList.appendChild(b);
}
setInterval(refreshSpecialBtns, 500);

const help = document.getElementById('dev-help')!;
help.textContent = [
  'WASD | Shift takla | SolT kombo (basılı) | SağT,Q,E,1,2,3,R yetenek | 4/5 iksir',
  'F1-F4 (veya 7 8 9 0) sınıf | , . seviye | P sürü | U seçkin | Y boss | V kukla | X temizle',
  'H yenile | K öl/dirIl | G düşman saldırısı aç/kapa | Fare: kamera (tıkla=kilitle)',
  'Ground yetenekler: tuşu BASILI TUT = önizleme, bırak = at',
  '☣ düğmeleri en yakın düşmana statü verir | ✦ menüsü: efsane/set/pasif etkilerini aç-kapa',
].join('\n');

const hud = document.getElementById('dev-hud')!;
const dealt: { t: number; a: number }[] = [];
let lastHit = '';
G.events.on('damage', (e) => {
  if (e.sourceId !== 1 || e.kind === 'player_hurt' || e.amount <= 0 || e.targetId === 1) return;
  dealt.push({ t: performance.now(), a: e.amount });
  lastHit = (e.crit ? 'KRİT ' : '') + e.amount + ' ' + e.type + (e.skillId ? ' (' + e.skillId + ')' : '');
});
setInterval(() => {
  const p = player;
  if (!p) return;
  const cls = CLASSES[p.classId];
  const lines: string[] = [];
  lines.push(`${cls.name} Sv${p.level}  HP ${Math.round(p.hp)}/${p.maxHp}  ${cls.resourceName} ${Math.round(p.resource)}/${p.maxResource}  Kombo ${G.combat.combo.count} (t${G.combat.combo.tier}) x${G.combat.combo.bonus.toFixed(2)}${p.classId === 'rogue' ? '  KP ' + G.skills.comboPoints(p) : ''}`);
  const act = G.skills.getAction(p);
  lines.push(`aksiyon: ${act ? `${act.skillId} ${act.elapsed.toFixed(2)}/${act.endAt.toFixed(2)} vur@${act.hitAt.toFixed(2)}${act.channel ? ' [kanal]' : ''}` : '-'}  düşman: ${world.enemies.filter((e) => !e.isDead).length}  fps ${G.engine.fps}`);
  const cds: string[] = [];
  const bar = character?.save.skillBar ?? {};
  for (const slot of ['rmb', 'q', 'e', 's1', 's2', 's3', 'r'] as SkillSlotKey[]) {
    const id = bar[slot];
    if (!id) continue;
    const c = G.skills.getCooldown(p, id);
    const d = SKILLS[id];
    cds.push(`${slot}:${d?.name ?? id}${c.remaining > 0.05 ? ' ' + c.remaining.toFixed(1) : ' ✓'}`);
  }
  lines.push(cds.join('  '));
  lines.push(`statüler: ${p.statuses.list().map((s) => s.id + (s.stacks > 1 ? 'x' + s.stacks : '')).join(', ') || '-'}`);
  const nowMs = performance.now();
  while (dealt.length && nowMs - dealt[0].t > 5000) dealt.shift();
  const dps = dealt.reduce((a, d) => a + d.a, 0) / 5;
  lines.push(`DPS(5sn) ${Math.round(dps)}   son vuruş: ${lastHit || '-'}   sarsma(en yakın): ${nearestForTest() ? Math.round(G.combat.staggerFrac(nearestForTest()!) * 100) + '%' : '-'}`);
  hud.textContent = lines.join('\n');
}, 120);

// ---- automation API (browser tests) ----
const heldUntil = new Map<string, number>();
const origDown = G.input.down.bind(G.input);
G.input.down = (a) => ((heldUntil.get(a) ?? 0) > G.engine.time ? true : origDown(a));
function nearestEnemy(): Enemy | null {
  const p = player;
  if (!p) return null;
  return world.nearest(world.enemies, p.position, 60, (e) => !e.isDead);
}
function aimAt(e: Enemy | null) {
  const p = player!;
  const tx = e ? e.position.x : p.position.x + Math.sin(p.yaw) * 6, tz = e ? e.position.z : p.position.z + Math.cos(p.yaw) * 6;
  const dx = tx - p.position.x, dz = tz - p.position.z;
  const l = Math.hypot(dx, dz) || 1;
  return { point: [tx, 0, tz] as [number, number, number], dir: [dx / l, 0, dz / l] as [number, number, number], targetId: e ? e.id : null };
}
// ---- Vuruş Hissi v2 (GDD_LIFE §5.14): sliders bound to the live FEEL object, A/B toggle, forced weights, telemetry overlay ----
const feelPanel = document.createElement('div');
feelPanel.id = 'feel-panel';
feelPanel.style.cssText = 'position:fixed;right:8px;top:8px;z-index:9999;background:rgba(10,8,4,.85);color:#f1dfae;font:11px monospace;padding:6px 8px;max-width:300px;max-height:92vh;overflow:auto;';
document.body.appendChild(feelPanel);
function fbtn(label: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = 'margin:2px 2px 2px 0;background:rgba(20,14,6,.9);color:#f1dfae;border:1px solid #7a5a2a;font:11px monospace;cursor:pointer;';
  b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
  b.addEventListener('mousedown', (ev) => ev.stopPropagation());
  feelPanel.appendChild(b);
  return b;
}
function fslider(label: string, get: () => number, set: (v: number) => void, min: number, max: number, step: number): void {
  const row = document.createElement('div');
  const span = document.createElement('span');
  span.textContent = `${label} ${get()}`;
  const input = document.createElement('input');
  input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(get());
  input.style.width = '100%';
  input.addEventListener('input', () => { set(Number(input.value)); span.textContent = `${label} ${input.value}`; });
  input.addEventListener('mousedown', (ev) => ev.stopPropagation());
  row.append(span, input);
  feelPanel.appendChild(row);
}
const feelTitle = document.createElement('div');
feelTitle.textContent = 'Vuruş Hissi v2';
feelTitle.style.cssText = 'font-weight:bold;margin-bottom:4px;';
feelPanel.appendChild(feelTitle);
let feelForceCrit = false;
let feelForceKill = false;
/** Hit the nearest dummy / enemy with one weight class (for the forced-weight buttons and automated checks). */
function hitWith(weight: HitWeight, opts: { crit?: boolean; kill?: boolean } = {}): boolean {
  const p = player;
  const e = nearestEnemy();
  if (!p || !e) return false;
  const crit = opts.crit ?? feelForceCrit;
  if (opts.kill ?? feelForceKill) e.hp = 1;
  const r = G.combat.playerHitEnemy(p, e, { coef: 1, type: 'physical', weight, knockback: weight === 'light' ? 0.5 : 1.5, tags: ['melee'], forceCrit: crit });
  return r !== null;
}
const WEIGHT_BTNS: [string, HitWeight][] = [
  ['Hafif', 'light'], ['Orta', 'medium'], ['Bitirici', 'finisher'], ['Ağır', 'heavy'], ['Ultimate', 'ultimate'],
  ['Parry', 'parry'], ['Kritik Vuruş', 'stagger_break'], ['Arkadan', 'backstab'],
];
for (const [label, w] of WEIGHT_BTNS) fbtn(label, () => hitWith(w));
const critBtn = fbtn('Zorla Kritik: kapalı', () => {
  feelForceCrit = !feelForceCrit;
  critBtn.textContent = `Zorla Kritik: ${feelForceCrit ? 'açık' : 'kapalı'}`;
});
const killBtn = fbtn('Zorla Öldürme: kapalı', () => {
  feelForceKill = !feelForceKill;
  killBtn.textContent = `Zorla Öldürme: ${feelForceKill ? 'açık' : 'kapalı'}`;
});
const abBtn = fbtn(`Sürüm: ${getFeelVersion()}`, () => {
  setFeelVersion(getFeelVersion() === 'v2' ? 'v1' : 'v2');
  abBtn.textContent = `Sürüm: ${getFeelVersion()}`;
});
const selBtn = fbtn(`Seçici dondurma: ${FEEL.selectiveFreeze ? 'açık' : 'kapalı'}`, () => {
  FEEL.selectiveFreeze = !FEEL.selectiveFreeze;
  selBtn.textContent = `Seçici dondurma: ${FEEL.selectiveFreeze ? 'açık' : 'kapalı'}`;
});
fslider('Duruş ms: hafif', () => FEEL.hitstop.light, (v) => { FEEL.hitstop.light = v; }, 0, 120, 1);
fslider('Duruş ms: ağır', () => FEEL.hitstop.heavy, (v) => { FEEL.hitstop.heavy = v; }, 0, 200, 1);
fslider('Duruş ms: ultimate', () => FEEL.hitstop.ultimate, (v) => { FEEL.hitstop.ultimate = v; }, 0, 250, 1);
fslider('Duruş ms: kritik ek', () => FEEL.hitstopCrit, (v) => { FEEL.hitstopCrit = v; }, 0, 80, 1);
fslider('Duruş ms: boss tavanı', () => FEEL.hitstopBossCap, (v) => { FEEL.hitstopBossCap = v; }, 0, 150, 1);
fslider('Titreme: hafif', () => FEEL.shake.light, (v) => { FEEL.shake.light = v; }, 0, 1, 0.01);
fslider('Titreme: ağır', () => FEEL.shake.heavy, (v) => { FEEL.shake.heavy = v; }, 0, 1, 0.01);
fslider('Titreme: ultimate', () => FEEL.shake.ultimate, (v) => { FEEL.shake.ultimate = v; }, 0, 1, 0.01);
fslider('Girdi tamponu s', () => FEEL.inputBuffer, (v) => { FEEL.inputBuffer = v; }, 0, 0.6, 0.01);
fslider('Kombo düşüş s', () => FEEL.comboDrain, (v) => { FEEL.comboDrain = v; }, 0.2, 2, 0.05);
const telPre = document.createElement('pre');
telPre.style.cssText = 'margin:6px 0 0;white-space:pre-wrap;color:#c8e8ff;';
feelPanel.appendChild(telPre);
setInterval(() => {
  const ft = G.combat?.feelTel;
  const combo = G.combat?.combo;
  const ds = cam?.debugStats();
  if (!ft || !ds) return;
  telPre.textContent = [
    `vuruş: ${ft.weight}  duruş ${ft.stop}ms  kurban ${ft.victims}  dondurma ${ft.freezes}`,
    `titreme ${ft.trauma.toFixed(2)}  tekme ${ft.kick.toFixed(2)}m  fov ${ft.fov.toFixed(1)}  flaş ${ft.flashMs}ms`,
    `vuruş/s ${ft.hitsPerSec}  kombo ${combo?.count ?? 0} kademe ${combo?.tier ?? 0}`,
    `kamera sarsıntı ${ds.shakeUsed.toFixed(2)}  bütçe ${ds.budgetUsed.toFixed(2)}/2.2  mesafe ${ds.dist.toFixed(1)}  eğim ${ds.pitch.toFixed(2)}`,
    `kilit ${ds.lock}  sinematik ${ds.cine}  çarpışma ${ds.colFrac.toFixed(2)}  engel ${ds.occluders}`,
  ].join('\n');
}, 200);

const api = {
  world, G, h, get player() { return player; }, get cam() { return cam; }, get controller() { return controller; },
  spawn, clearEnemies, shapeTest, spawnPlayer,
  setClass(c: ClassId, lvl = level) { classIdx = CLASS_IDS.indexOf(c); level = lvl; return spawnPlayer(); },
  cast(slot: SkillSlotKey, atNearest = true) {
    const e = atNearest ? nearestEnemy() : null;
    const aim = aimAt(e);
    if (e && player) player.yaw = Math.atan2(aim.dir[0], aim.dir[2]);
    return G.skills.tryCastSlot(player!, slot, aim);
  },
  face(e?: Enemy | null) { const t = e ?? nearestEnemy(); if (t && player) { player.yaw = Math.atan2(t.position.x - player.position.x, t.position.z - player.position.z); cam && (cam.yaw = player.yaw + Math.PI); } },
  nearestEnemy,
  /** Pretend an input action is held for `sec` seconds (channels / aim previews in automated tests). */
  hold(action: string, sec: number) { heldUntil.set(action, G.engine.time + sec); },
  release(action: string) { heldUntil.delete(action); },
  /** Resolves after `sec` seconds of ENGINE time (frames only run while the tab is shown). */
  wait(sec: number) { const t0 = G.engine.time; return new Promise<void>((res) => { const iv = setInterval(() => { if (G.engine.time - t0 >= sec) { clearInterval(iv); res(); } }, 16); }); },
  log: [] as string[],
  setAggressive(v: boolean) { aggressive = v; },
  lookAt(x: number, z: number) { if (player && cam) { cam.yaw = Math.atan2(player.position.x - x, player.position.z - z); } },
};
Object.assign(api, { hitWith });
(window as unknown as { dev: typeof api }).dev = api;
import './combat_wow';
G.events.on('damage', (e) => { if (api.log.length < 400) api.log.push(`${e.kind}${e.crit ? '!' : ''} ${e.amount} ${e.type} -> ${e.targetId} (${e.skillId ?? ''})`); });
G.events.on('hitstop', (e) => { if (api.log.length < 400) api.log.push('hitstop ' + e.ms); });
G.events.on('camera:shake', (e) => { if (api.log.length < 400) api.log.push('shake ' + e.intensity.toFixed(2)); });
// Same effect set as the game: bootHarness boots the game services (G.vfx presets from vfx/VFX.ts, SFX_MANIFEST from
// audio/manifest.ts, G.audio.init, G.vfx.init), so no separate preset loader is needed here. Report the ids that would still be
// silent, so QA sees them at boot instead of at play time.
const silentVfx = VFX_IDS.filter((id) => !vfxResolves(id));
const silentSfx = SFX_IDS.filter((id) => !sfxResolves(id));
console.log(silentVfx.length + silentSfx.length
  ? `[dev/combat] ids with no effect: vfx ${silentVfx.join(', ') || '-'} | sfx ${silentSfx.join(', ') || '-'}`
  : '[dev/combat] every vfx/sfx id resolves');
console.log('[dev/combat] ready');
