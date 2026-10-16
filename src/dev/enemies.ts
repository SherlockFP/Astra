import * as THREE from 'three';
import { bootHarness } from './harness';
import { G } from '../game/G';
import { Actor } from '../entities/Actor';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { PlayerController } from '../game/PlayerController';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { CharacterState } from '../systems/CharacterState';
import { CLASS_IDS } from '../data/classes';
import { BOSSES, ENEMIES } from '../data/enemies';
import { spawnEnemy } from '../entities/EnemyFactory';
import { BossController } from '../ai/BossController';
import { peekDirector } from '../ai/EnemyDirector';
import { CHAMPION_MODS, makeChampion } from '../ai/champion';
import type { ClassId } from '../types/common';

// ---------------------------------------------------------------------------------------------------------------------
// Dev page for the enemies module (NOT run by the author; the QA agent drives it):
//  - a labelled grid with EVERY enemy def (trash, elites, affix units, mechanic bodies), idle until a player comes near
//  - the real Player (WASD / Shift / LMB combo / skills) with the normal camera; falls back to a circling capsule actor
//  - G aggro everything | P mixed pack | H 40-rattler horde (separation) | U elite | X clear | K kill nearest | L hit nearest (hit reaction)
//  - I invulnerable | T teleport to the grid | B / panel: boss fights (arena shifts to wherever the boss is spawned)
//  - ?level=30 ?class=knight ?grid=0 (no grid) ?boss=boss_azrakel (start a boss fight at once)
// ---------------------------------------------------------------------------------------------------------------------

const q = new URLSearchParams(location.search);
const h = await bootHarness({ orbit: false, floorSize: 200 });
const { scene, world } = h;
try {
  G.ui.setMode('town');
} catch { /* optional */ }
scene.fog = new THREE.Fog(0x14121a, 50, 170);
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
let level = Number(q.get('level') ?? 30);

// ---- player (real Player when it works, else a capsule that walks in circles) -------------------------------------------
let player: Player | null = null;
let capsule: Actor | null = null;
let controller: PlayerController | null = null;
let cam: ThirdPersonCamera | null = null;

class Capsule extends Actor {
  private t = 0;
  constructor() {
    super(1, 'player', 'player');
    this.name = 'Hedef';
    this.radius = 0.5;
    this.height = 1.8;
    this.maxHp = this.hp = 999999;
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), new THREE.MeshStandardMaterial({ color: 0x40a0ff, emissive: 0x103060 }));
    m.position.y = 0.9;
    this.object3d.add(m);
  }
  update(dt: number): void {
    this.t += dt;
    const r = 12;
    this.position.x = Math.sin(this.t * 0.35) * r;
    this.position.z = 10 + Math.cos(this.t * 0.35) * r;
    this.yaw = this.t * 0.35 + Math.PI / 2;
    super.update(dt);
  }
}

async function makePlayer(classId: ClassId): Promise<boolean> {
  try {
    controller?.dispose();
    if (player) {
      G.skills.reset(player);
      world.remove(player);
    }
    const character = CharacterState.create('Test', classId, 0);
    character.save.level = level;
    character.save.skillBar = CharacterState.defaultBar(classId, level);
    character.save.materials = { pot_hp_3: 30, pot_res_3: 30 };
    character.recomputeStats(false);
    G.character = character;
    const p = new Player({ id: 1, slot: 0, classId, name: 'Test', level, isLocal: true, peerId: 'self', character });
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
    return true;
  } catch (err) {
    console.warn('[dev/enemies] real Player failed, using a capsule target', err);
    return false;
  }
}

const startClass = (q.get('class') as ClassId) ?? 'knight';
if (!(await makePlayer(CLASS_IDS.includes(startClass) ? startClass : 'knight'))) {
  capsule = new Capsule();
  world.add(capsule);
}
G.engine.onUpdate((dt) => controller?.update(dt), -1);
h.onFrame((dt) => cam?.update(dt));
if (!player) {
  h.camera.position.set(0, 26, -22);
  h.camera.lookAt(0, 0, 14);
}

/** The actor the enemies hunt. */
const target = (): Actor | null => player ?? capsule;
const tpos = (): THREE.Vector3 => target()?.position ?? new THREE.Vector3();

// ---- spawning ---------------------------------------------------------------------------------------------------------
let seq = 0;
async function spawn(id: string, x: number, z: number, o: { aggro?: boolean; level?: number; dormant?: boolean } = {}): Promise<Enemy | null> {
  try {
    const e = await spawnEnemy(world, id, { x, z }, { level: o.level ?? level, aggro: o.aggro, dormant: o.dormant, facing: Math.PI * Math.random() * 2, id: 5000 + seq++ });
    return e;
  } catch (err) {
    console.error('[dev/enemies] spawn failed', id, err);
    return null;
  }
}

function clearAll(): void {
  for (const e of [...world.enemies]) world.remove(e);
  for (const l of labels) l.el.remove();
  labels.length = 0;
  G.hitShapes.clear();
}

function aggroAll(): void {
  const t = target();
  if (!t) return;
  for (const e of world.enemies) if (!e.isDead && e.ai && e.def.aggroRange >= 0 && !e.def.ai?.summoned) e.ai.acquire(t, false);
}

const around = (n: number, r: number, cx: number, cz: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const rr = r * (0.75 + Math.random() * 0.5);
    return [cx + Math.sin(a) * rr, cz + Math.cos(a) * rr];
  });

function pack(): void {
  const p = tpos();
  const mix = ['skel_minion', 'skel_minion', 'skel_minion', 'skel_rattler', 'skel_rattler', 'skel_archer', 'skel_mage', 'crypt_ghoul', 'skel_warrior', 'crypt_rat', 'crypt_rat', 'bone_skull'];
  const pts = around(mix.length, 12, p.x, p.z);
  mix.forEach((id, i) => void spawn(id, pts[i][0], pts[i][1], { aggro: true }));
}

/** A small pack whose strongest member is a champion with the chosen modifier. */
async function championPack(modIdx: number): Promise<void> {
  const p = tpos();
  const pts = around(5, 11, p.x, p.z);
  const mem: (Enemy | null)[] = [];
  for (let i = 0; i < 5; i++) mem.push(await spawn(i === 0 ? 'skel_warrior' : 'skel_minion', pts[i][0], pts[i][1], { aggro: false }));
  for (const m of mem) if (m) m.packId = 'dev_champ';
  if (mem[0]) makeChampion(mem[0], CHAMPION_MODS[modIdx % CHAMPION_MODS.length].id);
  const t = target();
  if (t) for (const m of mem) m?.ai?.acquire(t, true);
}

function horde(): void {
  const p = tpos();
  const pts = around(40, 16, p.x, p.z);
  pts.forEach(([x, z], i) => void spawn(i % 4 === 0 ? 'crypt_rat' : 'skel_rattler', x, z, { aggro: true }));
}

// ---- grid -----------------------------------------------------------------------------------------------------------
const labels: { el: HTMLElement; e: Enemy }[] = [];
async function buildGrid(): Promise<void> {
  const ids = Object.keys(ENEMIES);
  const cols = 10, gap = 7;
  const x0 = -((cols - 1) * gap) / 2, z0 = 24;
  for (let i = 0; i < ids.length; i++) {
    const x = x0 + (i % cols) * gap, z = z0 + Math.floor(i / cols) * gap;
    const e = await spawn(ids[i], x, z, { aggro: false });
    if (!e) continue;
    const el = document.createElement('div');
    el.className = 'en-label';
    el.textContent = ids[i];
    document.body.appendChild(el);
    labels.push({ el, e });
  }
}
const _v = new THREE.Vector3();
h.onFrame(() => {
  for (const l of labels) {
    if (l.e.removed) {
      l.el.style.display = 'none';
      continue;
    }
    _v.copy(l.e.position);
    _v.y += l.e.height + 0.5;
    _v.project(h.camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    l.el.style.display = vis ? 'block' : 'none';
    if (vis) {
      l.el.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth}px`;
      l.el.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight}px`;
    }
  }
});

// ---- bosses ---------------------------------------------------------------------------------------------------------
const bossIds = Object.keys(BOSSES);
let bossIdx = 0;
async function fightBoss(id: string): Promise<void> {
  clearAll();
  for (const e of [...world.enemies]) world.remove(e);
  const bx = 0, bz = -20;
  const b = await spawn(id, bx, bz, { aggro: false });
  const t = target();
  if (b && t) {
    // stand 12 m from the boss toward the middle of its arena
    const c = b.ai instanceof BossController ? b.ai.arena : { cx: bx, cz: bz + 4 };
    let dx = c.cx - bx, dz = c.cz - bz;
    const l = Math.hypot(dx, dz);
    if (l < 3) { dx = 0; dz = 1; } else { dx /= l; dz /= l; }
    t.position.set(bx + dx * 12, 0, bz + dz * 12);
    t.yaw = Math.atan2(-dx, -dz);
    if (cam) {
      cam.yaw = t.yaw + Math.PI;
      cam.snap();
    }
  }
}

// ---- tests on the nearest enemy -----------------------------------------------------------------------------------------
function nearest(): Enemy | null {
  const t = target();
  return t ? world.nearest(world.enemies, t.position, 80, (e) => !e.isDead) : null;
}
function hitNearest(frac: number): void {
  const e = nearest();
  const t = target();
  if (!e || !t) return;
  const dx = e.position.x - t.position.x, dz = e.position.z - t.position.z;
  const l = Math.hypot(dx, dz) || 1;
  G.combat.applyDamageToEnemy(e, Math.max(1, Math.round(e.maxHp * frac)), false, 'physical', t.id, undefined, 'dev_hit', 0.6, [dx / l, dz / l], { weight: 'light' });
}
function killNearest(): void {
  const e = nearest();
  const t = target();
  if (!e || !t) return;
  const dx = e.position.x - t.position.x, dz = e.position.z - t.position.z;
  const l = Math.hypot(dx, dz) || 1;
  G.combat.applyDamageToEnemy(e, e.hp + 1, false, 'physical', t.id, undefined, 'dev_kill', 2, [dx / l, dz / l], { weight: 'finisher' });
}
let god = false;
function toggleGod(): void {
  god = !god;
  if (!player) return;
  if (god) player.statuses.apply('invulnerable', 99999, { sourceId: player.id });
  else player.statuses.remove('invulnerable');
}

// ---- keys (before the game Input) ------------------------------------------------------------------------------------------
const stopKeys = new Set(['KeyG', 'KeyP', 'KeyH', 'KeyU', 'KeyX', 'KeyK', 'KeyL', 'KeyI', 'KeyT', 'KeyB', 'Digit7', 'Digit8']);
window.addEventListener('keydown', (e) => {
  if (e.repeat || !stopKeys.has(e.code)) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  switch (e.code) {
    case 'KeyG': aggroAll(); break;
    case 'KeyP': pack(); break;
    case 'KeyH': horde(); break;
    case 'KeyU': { const p = tpos(); void spawn('forge_demon', p.x + 8, p.z + 8, { aggro: true }); break; }
    case 'KeyX': clearAll(); break;
    case 'KeyK': killNearest(); break;
    case 'KeyL': hitNearest(0.08); break;
    case 'KeyI': toggleGod(); break;
    case 'KeyT': { const t = target(); if (t && player) t.position.set(0, 0, 14); break; }
    case 'KeyB': void fightBoss(bossIds[bossIdx++ % bossIds.length]); break;
    case 'Digit7': level = Math.max(1, level - 5); break;
    case 'Digit8': level = Math.min(60, level + 5); break;
  }
}, true);

// ---- panel ------------------------------------------------------------------------------------------------------------------
const panel = document.getElementById('en-panel')!;
function section(title: string): HTMLElement {
  const hh = document.createElement('h4');
  hh.textContent = title;
  panel.appendChild(hh);
  const row = document.createElement('div');
  row.className = 'row';
  panel.appendChild(row);
  return row;
}
function btn(row: HTMLElement, label: string, fn: () => void): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('mousedown', (ev) => ev.stopPropagation());
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    fn();
  });
  row.appendChild(b);
}
const main = section('Sahne');
btn(main, 'Hepsine saldır (G)', aggroAll);
btn(main, 'Sürü (P)', pack);
btn(main, 'Kalabalık x40 (H)', horde);
btn(main, 'Seçkin (U)', () => { const p = tpos(); void spawn('forge_demon', p.x + 8, p.z + 8, { aggro: true }); });
btn(main, 'Temizle (X)', clearAll);
btn(main, 'Izgara', () => void buildGrid());
btn(main, 'Kapıya git (T)', () => { const t = target(); if (t && player) t.position.set(0, 0, 14); });
const champs = section('Şampiyon (GDD 1.5)');
CHAMPION_MODS.forEach((m, i) => btn(champs, m.name, () => void championPack(i)));
const tests = section('Test');
btn(tests, 'Vur %8 (L)', () => hitNearest(0.08));
btn(tests, 'Öldür (K)', killNearest);
btn(tests, 'Ölümsüz (I)', toggleGod);
btn(tests, 'Sv -5', () => (level = Math.max(1, level - 5)));
btn(tests, 'Sv +5', () => (level = Math.min(60, level + 5)));
const bosses = section('Boss kapışması (B)');
for (const id of bossIds) btn(bosses, BOSSES[id].name, () => void fightBoss(id));
const cls = section('Sınıf');
for (const c of CLASS_IDS) btn(cls, c, () => void makePlayer(c));
const spawnRow = section('Tek düşman (oyuncunun önüne)');
for (const id of Object.keys(ENEMIES)) {
  if (id.startsWith('affix_') || id.startsWith('efsun_')) continue;
  btn(spawnRow, id, () => { const p = tpos(); void spawn(id, p.x + Math.sin(player?.yaw ?? 0) * 8, p.z + Math.cos(player?.yaw ?? 0) * 8, { aggro: true }); });
}

document.getElementById('en-help')!.textContent = [
  'WASD yürü | Shift takla | SolT kombo | SağT,Q,E,1-3,R yetenek | fare: kamera',
  'G herkes saldırsın | P sürü | H x40 kalabalık | U seçkin | X temizle | K en yakını öldür | L en yakına vur',
  'I ölümsüz | T ızgaraya git | B sıradaki boss | 7/8 seviye -/+  (panelde her boss için düğme)',
].join('\n');

// ---- HUD --------------------------------------------------------------------------------------------------------------------
const hud = document.getElementById('en-hud')!;
setInterval(() => {
  const lines: string[] = [];
  const alive = world.enemies.filter((e) => !e.isDead).length;
  const t = target();
  lines.push(`<b>Düşman</b> canlı ${alive} / toplam ${world.enemies.length}   seviye ${level}   fps ${G.engine.fps}   hitShape ${G.hitShapes.activeCount}`);
  if (player) lines.push(`Oyuncu HP ${Math.round(player.hp)}/${player.maxHp}${god ? ' (ölümsüz)' : ''}`);
  const dir = peekDirector(world);
  if (dir) lines.push(`AI ${dir.ais.length} | iskelet kalıntısı ${dir.piles.length}`);
  const boss = world.enemies.find((e) => e.isBoss && !e.isDead);
  if (boss && boss.ai instanceof BossController) {
    const c = boss.ai;
    lines.push('');
    lines.push(`<b>${boss.def.name}</b> HP ${Math.round(boss.hpFrac * 100)}%  evre ${c.phase?.id ?? '-'}${c.phaseLocked ? ' (mekanik)' : ''}  süre ${c.fightT.toFixed(0)}s${c.isEnraged ? '  ÖFKE' : ''}`);
    lines.push(`yetenek: ${c.currentBusy ? c.currentBusy.ab.name : '-'}   hedef: ${c.target?.name ?? '-'}   uşak ${c.adds().length}`);
  }
  const n = nearest();
  if (n && t) {
    const d = Math.hypot(n.position.x - t.position.x, n.position.z - t.position.z);
    lines.push('');
    lines.push(`en yakın: ${n.def.id} (${d.toFixed(1)} m)  mod ${n.ai?.mode ?? '-'}  hp ${Math.round(n.hpFrac * 100)}%  ${n.ai?.busy ? 'yapıyor: ' + n.ai.busy.ab.name : ''}`);
  }
  hud.innerHTML = lines.join('\n');
}, 150);

// ---- automation API for the QA agent -----------------------------------------------------------------------------------------
(window as unknown as { dev: unknown }).dev = {
  G, world, h, spawn, clearAll, aggroAll, pack, horde, buildGrid, fightBoss, hitNearest, killNearest, toggleGod,
  get player() { return player; },
  get capsule() { return capsule; },
  get controller() { return controller; },
  get boss() { return world.enemies.find((e) => e.isBoss) ?? null; },
  bossIds, enemyIds: Object.keys(ENEMIES),
  setLevel(v: number) { level = v; },
};

if (q.get('grid') !== '0' && !q.get('boss')) void buildGrid();
if (q.get('boss')) void fightBoss(q.get('boss')!);
console.log('[dev/enemies] ready');
