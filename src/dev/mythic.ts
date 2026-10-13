import * as THREE from 'three';
import { G } from '../game/G';
import { bootHarness } from './harness';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { spawnEnemy } from '../entities/EnemyFactory';
import { CharacterState } from '../systems/CharacterState';
import { MythicPlus, type RunParams } from '../systems/MythicPlus';
import { DUNGEONS, DUNGEON_IDS, getDungeon } from '../data/dungeons';
import { ENEMIES, BOSSES, getEnemyDef } from '../data/enemies';
import {
  AFFIX_IDS, DIFFICULTY_MULT, MYTHIC_AFFIXES, ROT4, ROT7, affixesForWeek, computeRunScore, currentWeek, dungeonScore, mmss, monsterDmg, monsterHP,
  rotationOfWeek, scoreBase,
} from '../data/mythicAffixes';
import { NavGrid } from '../world/NavGrid';
import { DUNGEON_ENEMY_ID_BASE } from '../types/common';
import { TILE_SIZE, type DungeonDef } from '../types/dungeons';
import type { AffixId, RunState } from '../types/mythic';
import type { BossDef, EnemyDef } from '../types/enemies';

/**
 * DEV PAGE for the mythic+ module (dev/mythic.html).
 * Simulates a dungeon run on a flat arena: real DungeonDef packs/bosses become fake enemies (capsules or real models) with the
 * deterministic ids of the scene, kills go through the REAL Combat.killEnemy -> G.mplus hooks, deaths through Combat.killLocalPlayer.
 * Everything here is scaffolding: real services win whenever they exist (enemy factory, hit shapes, loot...).
 */

// ?stay=1: ignore Vite full reloads triggered by other modules' edits (long automated checks)
if (import.meta.hot && new URLSearchParams(location.search).has('stay')) {
  import.meta.hot.on('vite:beforeFullReload', () => { throw new Error('mythic dev: full reload suppressed (?stay)'); });
}

const tw = (t: number): number => (t + 0.5) * TILE_SIZE;
const S = {
  dungeon: 'kemik_mahzeni', difficulty: 'mythicplus' as RunState['difficulty'], level: 7, weekOffset: 0, party: 1, seed: 12345,
  affixes: new Set<AffixId>(), chase: false, models: false, view: 'run' as 'run' | 'rotation' | 'score' | 'meta',
};
const logEl = document.getElementById('mp-log') as HTMLElement;
const overEl = document.getElementById('mp-over') as HTMLElement;
const panel = document.getElementById('mp-panel') as HTMLElement;

function log(msg: string, err = false): void {
  const d = document.createElement('div');
  if (err) d.className = 'err';
  d.textContent = `[${new Date().toLocaleTimeString('tr-TR')}] ${msg}`;
  logEl.appendChild(d);
  while (logEl.children.length > 60) logEl.firstChild?.remove();
  logEl.scrollTop = logEl.scrollHeight;
  (err ? console.warn : console.log)('[mythic-dev]', msg);
}
window.addEventListener('error', (e) => log('JS hatası: ' + e.message, true));
window.addEventListener('unhandledrejection', (e) => log('Promise hatası: ' + String((e.reason as Error)?.message ?? e.reason), true));

/* ------------------------------------------------------------------ fake content (only when the real thing is missing) */

function ensureDevContent(): void {
  const fakeDungeons: [string, string, [number, number], number, number][] = [
    ['kizil_dokumhane', 'Kızıl Dökümhane', [18, 29], 810, 260],
    ['buzul_tahti', 'Buzul Tahtı', [30, 41], 840, 270],
    ['golge_tapinagi', 'Gölge Tapınağı', [42, 60], 900, 280],
  ];
  for (const [id, name, levelRange, timerSec, forcesRequired] of fakeDungeons) {
    if (DUNGEONS[id]) continue;
    DUNGEONS[id] = {
      id, name, shortName: name, lore: 'Dev yer tutucu.', levelRange, timerSec, forcesRequired,
      theme: { fogColor: 0x101018, fogNear: 10, fogFar: 40, ambient: 0x404050, ambientIntensity: 1, hemiSky: 0x8899aa, hemiGround: 0x222222, torchColor: 0xff9944, music: 'dungeon_crypt' },
      grid: { w: 40, h: 40 }, rooms: [], doors: [], packs: [],
      bosses: [1, 2, 3].map((i) => ({ bossId: `dev_boss_${i}`, roomId: 'none', pos: [10 * i, 30] as [number, number], order: i })),
      start: { pos: [4, 4], facing: 0 }, exit: { pos: [36, 36] },
    } as DungeonDef;
    if (!DUNGEON_IDS.includes(id)) DUNGEON_IDS.push(id);
  }
  const base = { scale: 1, speed: 3, radius: 0.5, aggroRange: 12, attackRange: 2, attackCooldown: 2, abilities: [], xp: 1, anims: { idle: 'Idle', walk: 'Walk', run: 'Run', death: 'Death' } };
  const atk = { id: 'dev_hit', name: 'Vuruş', kind: 'melee' as const, range: 2, cooldown: 2, windup: 0.5, anim: 'Attack' };
  const add = (d: Partial<EnemyDef> & Pick<EnemyDef, 'id' | 'name' | 'rank' | 'role' | 'hpMult' | 'dmgMult' | 'forces'>) => {
    if (!ENEMIES[d.id]) ENEMIES[d.id] = { ...base, model: 'PROC:dev', basicAttack: atk, ...d } as EnemyDef;
  };
  add({ id: 'dev_swarm', name: 'Dev Sürü', rank: 'trash', role: 'swarm', hpMult: 0.35, dmgMult: 0.6, forces: 1, scale: 0.8 });
  add({ id: 'dev_trash', name: 'Dev Sıradan', rank: 'trash', role: 'melee', hpMult: 1, dmgMult: 1, forces: 4 });
  add({ id: 'dev_elite', name: 'Dev Seçkin', rank: 'elite', role: 'tank', hpMult: 4, dmgMult: 1.5, forces: 8, scale: 1.25, radius: 0.8 });
  for (let i = 1; i <= 3; i++) {
    if (BOSSES[`dev_boss_${i}`]) continue;
    BOSSES[`dev_boss_${i}`] = {
      ...base, id: `dev_boss_${i}`, name: `Dev Patron ${i}`, model: 'PROC:dev', rank: 'boss', role: 'tank', hpMult: 60 + i * 15, dmgMult: 2.5, forces: 0, scale: 2, radius: 1.4,
      basicAttack: atk, title: 'Dev', phases: [], enrageTimer: 600, arenaRadius: 12,
    } as BossDef;
  }
}

/* ------------------------------------------------------------------ world / player */

let world: ReturnType<typeof getWorld>;
let player: Player;
const getWorld = () => G.world!;
const capsules = new Map<number, THREE.Mesh>();
let factoryReal = false;

/** Ids in the dungeon range (< 50000) behave like regular pack enemies: they give forces and trigger death affixes. */
let devSeq = 40000;
const devId = (): number => devSeq++;

const RANK_COLOR: Record<string, number> = { trash: 0x9a8a70, elite: 0xd08040, miniboss: 0xb050c0, boss: 0xb03030 };

/** Spawn one enemy: the real factory when it exists, else a fake Enemy with a capsule body. */
async function spawnDev(defId: string, x: number, z: number, o: { id?: number; packId?: string | null } = {}): Promise<Enemy | null> {
  if (factoryReal) {
    try { return await spawnEnemy(world, defId, { x, z }, { id: o.id, level: 60, packId: o.packId ?? null, scaled: true }); } catch (e) { log('factory hata: ' + String(e), true); }
  }
  const def = getEnemyDef(defId) ?? ENEMIES.dev_trash;
  const e = new Enemy(o.id ?? world.allocHostId(), def);
  e.level = 60;
  e.packId = o.packId ?? null;
  e.dynamic = (o.id ?? 0) === 0 || e.id >= 50_000;
  const sc = G.mplus.enemyScaling(e.isBoss);
  e.maxHp = Math.max(1, Math.round(monsterHP(60) * def.hpMult * sc.hp * G.mplus.partyHpMult()));
  e.hp = e.maxHp;
  e.baseDamage = monsterDmg(60) * def.dmgMult * sc.dmg;
  e.position.set(x, 0, z);
  e.height = 2 * def.scale;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4 * def.scale, 1.1 * def.scale, 4, 8),
    new THREE.MeshStandardMaterial({ color: RANK_COLOR[def.rank] ?? 0x888888, roughness: 0.9, emissive: 0x000000 }),
  );
  body.position.y = 0.95 * def.scale;
  body.castShadow = true;
  e.object3d.add(body);
  capsules.set(e.id, body);
  world.add(e);
  e.homeX = x; e.homeZ = z;
  if (S.models && def.model && !def.model.startsWith('PROC:')) {
    void e.loadModel().then(() => { if (e.model) { body.visible = false; } }).catch(() => { /* capsule stays */ });
  }
  G.mplus.onEnemySpawned(e);
  return e;
}

function clearAll(): void {
  for (const e of [...world.enemies]) world.remove(e);
  capsules.clear();
  try { G.loot.clear(); G.hitShapes.clear(); G.vfx.clear(); } catch { /* ignore */ }
  G.ui.closeAll?.();
}

/* ------------------------------------------------------------------ run control */

function runParams(): RunParams {
  const mp = S.difficulty === 'mythicplus';
  return { dungeonId: S.dungeon, difficulty: S.difficulty, keyLevel: mp ? S.level : 0, affixes: mp ? [...S.affixes] : [], seed: S.seed, enemyLevel: 60, partySize: S.party, keyOwner: G.net.selfId };
}

function weekNow(): number {
  return currentWeek() + S.weekOffset;
}

function defaultAffixes(): void {
  S.affixes = new Set(affixesForWeek(S.level, weekNow()));
  syncAffixBoxes();
}

async function fill(): Promise<void> {
  const def = getDungeon(S.dungeon);
  if (!def) return log('dungeon yok', true);
  let idx = 0;
  const t0 = performance.now();
  if (def.packs.length) {
    for (const pk of def.packs) {
      for (const m of pk.members) {
        const x = tw(pk.center[0] + m.offset[0]), z = tw(pk.center[1] + m.offset[1]);
        await spawnDev(ENEMIES[m.enemyId] ? m.enemyId : 'dev_trash', x, z, { id: DUNGEON_ENEMY_ID_BASE + idx++, packId: pk.id });
      }
    }
  } else {
    // generic dungeon: 18 packs of 1 elite + 3 trash + 4 swarm on a grid
    for (let p = 0; p < 18; p++) {
      const cx = ((p % 6) - 2.5) * 22 + 60, cz = (Math.floor(p / 6) + 1) * 20 + 10;
      const members = ['dev_elite', 'dev_trash', 'dev_trash', 'dev_trash', 'dev_swarm', 'dev_swarm', 'dev_swarm', 'dev_swarm'];
      for (let i = 0; i < members.length; i++) {
        await spawnDev(members[i], cx + (i % 4) * 1.6 - 2.4, cz + Math.floor(i / 4) * 1.8, { id: DUNGEON_ENEMY_ID_BASE + idx++, packId: `dev_p${p}` });
      }
    }
  }
  for (const b of def.bosses) {
    const x = tw(b.pos[0]), z = tw(b.pos[1]);
    await spawnDev(getEnemyDef(b.bossId) ? b.bossId : 'dev_boss_1', x, z, { id: DUNGEON_ENEMY_ID_BASE + idx++ });
  }
  log(`${idx} düşman dolduruldu (${(performance.now() - t0).toFixed(0)} ms)`);
}

function teleportToStart(): void {
  const def = getDungeon(S.dungeon);
  const sp = def ? { x: tw(def.start.pos[0]), z: tw(def.start.pos[1]) } : { x: 0, z: 0 };
  player.position.set(sp.x, 0, sp.z);
  cameraSnap();
}

async function startRun(withFill: boolean, begin: boolean): Promise<void> {
  clearAll();
  G.mplus.prepare(runParams());
  const s = G.mplus.state!;
  log(`prepare: ${s.dungeonId} ${s.difficulty} +${s.keyLevel} [${s.affixes.join(', ')}] timer ${s.timerSec}s forces ${s.forcesRequired} boss ${s.bossesTotal}`);
  if (withFill) await fill();
  teleportToStart();
  if (begin) {
    G.mplus.begin();
    log('begin() çağrıldı');
  }
}

function aliveEnemies(): Enemy[] {
  return world.enemies.filter((e) => !e.isDead);
}
function regulars(): Enemy[] {
  return aliveEnemies().filter((e) => !e.isBoss && !e.def.id.startsWith('affix_') && !e.def.id.startsWith('efsun_'));
}
function bosses(): Enemy[] {
  return aliveEnemies().filter((e) => e.isBoss);
}
function kill(e: Enemy): void {
  G.combat.killEnemy(e, player.id);
}
function killN(n: number): void {
  const list = regulars().sort(() => Math.random() - 0.5).slice(0, n);
  for (const e of list) kill(e);
  log(`${list.length} düşman öldürüldü`);
}
function killNearest(n: number): void {
  const list = regulars().sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position)).slice(0, n);
  for (const e of list) kill(e);
  log(`yakındaki ${list.length} düşman öldürüldü`);
}
async function killAllTrash(): Promise<void> {
  const list = regulars();
  for (let i = 0; i < list.length; i++) {
    kill(list[i]);
    if (i % 12 === 0) await new Promise((r) => setTimeout(r, 16));
  }
  log(`${list.length} düşman öldürüldü`);
}
async function finishRun(): Promise<void> {
  await killAllTrash();
  for (const b of bosses()) {
    kill(b);
    await new Promise((r) => setTimeout(r, 120));
  }
  log('hepsi öldürüldü');
}
function addForces(pct: number): void {
  const s = G.mplus.state;
  if (!s) return log('önce hazırla', true);
  const need = Math.round((s.forcesRequired * pct) / 100);
  void spawnDev('dev_trash', player.position.x + 3, player.position.z + 3, { id: devId() }).then((e) => {
    if (!e) return;
    (e.def as { forces: number }).forces = need;
    e.forcesCounted = false;
    kill(e);
    log(`+${need} kuvvet (${pct}%)`);
  });
}
function pull(radius: number): void {
  let n = 0;
  for (const e of aliveEnemies()) {
    if (e.position.distanceTo(player.position) <= radius) { e.aggroed = true; n++; }
  }
  log(`${n} düşman çekildi`);
}
function unpull(): void {
  for (const e of world.enemies) e.aggroed = false;
  log('çekme bırakıldı');
}

/* ------------------------------------------------------------------ camera / movement */

let orbit: { target: THREE.Vector3; update(): void; enabled: boolean };
let cam: THREE.PerspectiveCamera;
function cameraSnap(): void {
  const off = cam.position.clone().sub(orbit.target);
  orbit.target.set(player.position.x, 1, player.position.z);
  cam.position.copy(orbit.target).add(off);
}

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

function movePlayer(dt: number): void {
  if (!player || player.isDead) return;
  let mx = 0, mz = 0;
  if (keys.has('KeyW')) mz -= 1;
  if (keys.has('KeyS')) mz += 1;
  if (keys.has('KeyA')) mx -= 1;
  if (keys.has('KeyD')) mx += 1;
  if (!mx && !mz) { player.velocity.set(0, 0, 0); return; }
  const fwd = new THREE.Vector3().subVectors(orbit.target, cam.position).setY(0).normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const dir = fwd.multiplyScalar(-mz).addScaledVector(right, mx).normalize();
  const sp = player.moveSpeed() * (keys.has('ShiftLeft') ? 1.8 : 1);
  player.position.addScaledVector(dir, sp * dt);
  world.nav.resolveCircle(player.position, player.radius);
  player.yaw = Math.atan2(dir.x, dir.z);
  player.velocity.copy(dir).multiplyScalar(sp);
  const off = cam.position.clone().sub(orbit.target);
  orbit.target.set(player.position.x, 1, player.position.z);
  cam.position.copy(orbit.target).add(off);
  try { player.anim?.setBase('Running_A', { fade: 0.15 }); } catch { /* ignore */ }
}

function chaseTick(dt: number): void {
  if (!S.chase) return;
  for (const e of world.enemies) {
    if (e.isDead || !e.aggroed || e.def.id.startsWith('affix_') || e.def.id.startsWith('efsun_') || e.removed) continue;
    const dx = player.position.x - e.position.x, dz = player.position.z - e.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.4) {
      e.position.x += (dx / d) * 3.2 * dt;
      e.position.z += (dz / d) * 3.2 * dt;
      e.yaw = Math.atan2(dx, dz);
    }
  }
}

function capsuleTick(): void {
  for (const [id, m] of capsules) {
    const e = world.get<Enemy>(id);
    if (!e || e.removed) { capsules.delete(id); continue; }
    const s = e.visualScale;
    m.scale.setScalar(s);
    const mat = m.material as THREE.MeshStandardMaterial;
    if (e.isDead) mat.color.setHex(0x333333);
    else if (e.statuses.has('raging')) mat.color.setHex(0xff3030);
    else if (e.statuses.has('efsunlu')) mat.color.setHex(0xb060ff);
    else if (e.statuses.has('inspiring')) mat.color.setHex(0xffe28a);
    if (e.def.id === 'affix_spiteful_shade') { mat.color.setHex(0x8070c0); mat.transparent = true; mat.opacity = 0.6; }
    if (e.def.id === 'affix_explosive_orb') m.visible = false;
    if (e.def.id.startsWith('kibir_tecessumu')) { mat.color.setHex(e.def.tint ?? 0xffffff); mat.emissive.setHex(0x331100); }
  }
}

/* ------------------------------------------------------------------ overlay */

const fmt = (n: number, d = 1): string => (Number.isFinite(n) ? n.toFixed(d) : '-');

function overlayRun(): string {
  const mp = G.mplus;
  const s = mp.state;
  const ch = G.character!;
  const m = ch.save.mythic;
  const out: string[] = [];
  if (!s) out.push('<b>Koşu yok</b> (prepare çağrılmadı)');
  else {
    const T = s.timerSec;
    out.push(`<b>${s.dungeonId}</b> ${s.difficulty}${s.keyLevel ? ' +' + s.keyLevel : ''}  seed ${s.seed}`);
    out.push(`affix: ${s.affixes.join(', ') || '-'}`);
    out.push(`started ${s.started}  countdown ${fmt(s.countdown)}  completed ${s.completed}  failed ${s.failed}`);
    out.push(`süre ${mmss(s.elapsed)}${T ? ' / ' + mmss(T) + `  (+3 ${mmss(T * 0.6)}  +2 ${mmss(T * 0.8)})` : ''}`);
    out.push(`inTime ${s.inTime}  upgrade ${s.upgradeLevels}`);
    out.push(`kuvvet ${s.forces} / ${s.forcesRequired}  (${fmt((s.forces / Math.max(1, s.forcesRequired)) * 100, 2)}%)`);
    out.push(`boss ${s.bossesKilled.length}/${s.bossesTotal} [${s.bossesKilled.join(', ')}]`);
    out.push(`ölüm ${s.deaths}  ceza ${s.deathPenaltySec}s`);
    const sc = mp.enemyScaling(false), sb = mp.enemyScaling(true);
    out.push(`ölçek trash HP×${fmt(sc.hp, 2)} DMG×${fmt(sc.dmg, 2)} | boss HP×${fmt(sb.hp, 2)} DMG×${fmt(sb.dmg, 2)} | parti HP×${fmt(mp.partyHpMult(), 2)}`);
  }
  const alive = aliveEnemies();
  out.push(`düşman ${alive.length} (çekili ${alive.filter((e) => e.aggroed).length}, boss ${alive.filter((e) => e.isBoss).length})`);
  out.push('');
  out.push('<b>fx</b> ' + JSON.stringify(mp.fx.debugInfo()));
  out.push(`oyuncu HP ${Math.round(player.hp)}/${player.maxHp}  durum: ${player.statuses.list().map((x) => `${x.id}×${x.stacks}`).join(' ') || '-'}`);
  out.push('');
  out.push(`<b>anahtar</b> ${m.keystone ? `${m.keystone.dungeonId} +${m.keystone.level}${m.keystone.depleted ? ' (tükenmiş)' : ''}` : '-'}`);
  out.push(`<b>puan</b> ${fmt(m.rating)}  (son +${fmt(mp.lastRatingDelta)})  hafta ${m.weekly.week}: ${m.weekly.runs.length} koşu`);
  const v = mp.vaultOptions();
  out.push(`kasa: ${v.unlocked} slot [${v.itemLevels.join(', ')}] alındı=${m.vaultClaimedWeek === currentWeek()}`);
  if (mp.lastRecord) out.push(`son kayıt: ${mp.lastRecord.dungeonId} +${mp.lastRecord.keyLevel} ${mp.lastRecord.timeSec}s up${mp.lastRecord.upgrade} skor ${mp.lastRecord.score}`);
  if (mp.lastRewards.length) out.push(`ödül: ${mp.lastRewards.map((i) => `${i.baseId}(${i.rarity} il${i.itemLevel})`).join(', ')}`);
  return out.join('\n');
}

function overlayRotation(): string {
  const w0 = currentWeek();
  const out = [`<b>12 haftalık rotasyon</b> (şu an hafta ${w0}, rot ${rotationOfWeek(w0)})`, ''];
  for (let i = 0; i < 12; i++) {
    const w = w0 + i;
    const r = rotationOfWeek(w);
    const date = new Date(Date.UTC(2024, 0, 1) + w * 7 * 86400e3).toISOString().slice(0, 10);
    out.push(`${i === 0 ? '►' : ' '}${String(i).padStart(2)} rot${String(r).padStart(2)} ${date}  ${affixesForWeek(12, w).join(' ')}`);
  }
  out.push('', `ROT4 ${ROT4.join(',')}`, `ROT7 ${ROT7.join(',')}`);
  return out.join('\n');
}

function overlayScore(): string {
  const out = [`<b>Skor tablosu</b> (timer 780s)`, 'L   base   %50   %70   %90  %100  %120  %140'];
  for (let L = 2; L <= 20; L++) {
    const T = 780;
    const row = [0.5, 0.7, 0.9, 1, 1.2, 1.4].map((f) => computeRunScore(L, T * f, T).toFixed(1).padStart(5));
    out.push(`${String(L).padStart(2)} ${scoreBase(L).toFixed(1).padStart(6)} ${row.join(' ')}`);
  }
  const ref = (L: number, bonus: number) => 4 * dungeonScore(scoreBase(L) + bonus, scoreBase(L) + bonus);
  out.push('', `referans (GDD): tümü +2 ort.bonus ≈ ${ref(2, 3.75).toFixed(0)} (310) | +10 ≈ ${ref(10, 3.75).toFixed(0)} (1030)`, `+15 hızlı ≈ ${ref(15, 7.5).toFixed(0)} (1440) | +20 hızlı ≈ ${ref(20, 7.5).toFixed(0)} (1740)`);
  const sc = (L: number, hb: boolean) => G.mplus.scalingFor(L, G.mplus.affixesFor(L), hb);
  out.push('', 'ölçek (L: trash HP/DMG | boss HP/DMG)');
  for (const L of [2, 5, 10, 12, 15, 20]) {
    const a = sc(L, false), b = sc(L, true);
    out.push(`+${L}: ×${a.hp.toFixed(2)}/×${a.dmg.toFixed(2)} | ×${b.hp.toFixed(2)}/×${b.dmg.toFixed(2)}`);
  }
  void DIFFICULTY_MULT;
  return out.join('\n');
}

function overlayMeta(): string {
  const ch = G.character!;
  const m = ch.save.mythic;
  const out = [`<b>Meta</b>`, JSON.stringify({ keystone: m.keystone, rating: m.rating, vaultClaimedWeek: m.vaultClaimedWeek, weekly: { week: m.weekly.week, runs: m.weekly.runs.length }, flags: ch.save.flags, stats: ch.save.stats }, null, 1)];
  out.push('', '<b>best</b>');
  for (const [id, b] of Object.entries(m.best)) out.push(`${id}: F ${b.fortified ? `+${b.fortified.keyLevel} ${b.fortified.score}` : '-'} | T ${b.tyrannical ? `+${b.tyrannical.keyLevel} ${b.tyrannical.score}` : '-'}`);
  out.push('', '<b>haftalık tablo</b>');
  for (const w of G.mplus.weeklyAffixTable(2)) {
    out.push(`hafta ${w.week} (${new Date(w.startsAt).toISOString().slice(0, 10)})`);
    for (const r of w.rows) out.push(`  +${r.level}: ${r.affixes.join(' ')}`);
  }
  return out.join('\n');
}

function refreshOverlay(): void {
  try {
    const html = S.view === 'rotation' ? overlayRotation() : S.view === 'score' ? overlayScore() : S.view === 'meta' ? overlayMeta() : overlayRun();
    overEl.innerHTML = html.replace(/&(?!lt;|gt;|amp;)/g, '&amp;').replace(/<(?!\/?b>)/g, '&lt;');
  } catch (e) {
    overEl.textContent = 'overlay hata: ' + String(e);
  }
}

/* ------------------------------------------------------------------ control panel */

let affixBoxes: Record<string, HTMLInputElement> = {};
function syncAffixBoxes(): void {
  for (const id of AFFIX_IDS) if (affixBoxes[id]) affixBoxes[id].checked = S.affixes.has(id);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}
const section = (title: string): HTMLElement => {
  el('h4', panel, title);
  return el('div', panel);
};
const row = (p: HTMLElement): HTMLElement => {
  const r = el('div', p);
  r.className = 'row';
  return r;
};
function btn(p: HTMLElement, label: string, fn: () => void | Promise<void>, title = ''): HTMLButtonElement {
  const b = el('button', p, label);
  if (title) b.title = title;
  b.addEventListener('click', () => {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((e) => log(`${label}: ${String((e as Error)?.stack ?? e)}`, true));
    } catch (e) {
      log(`${label}: ${String((e as Error)?.stack ?? e)}`, true);
    }
  });
  return b;
}
function select(p: HTMLElement, label: string, opts: [string, string][], value: string, on: (v: string) => void): HTMLSelectElement {
  const l = el('label', p, label + ' ');
  const s = el('select', l);
  for (const [v, t] of opts) {
    const o = el('option', s, t);
    o.value = v;
  }
  s.value = value;
  s.addEventListener('change', () => on(s.value));
  return s;
}
function number(p: HTMLElement, label: string, value: number, min: number, max: number, on: (v: number) => void): HTMLInputElement {
  const l = el('label', p, label + ' ');
  const i = el('input', l);
  i.type = 'number'; i.min = String(min); i.max = String(max); i.value = String(value);
  i.addEventListener('change', () => on(Math.max(min, Math.min(max, Number(i.value) || min))));
  return i;
}

function buildPanel(): void {
  const a = section('Kurulum');
  const r1 = row(a);
  select(r1, 'Zindan', DUNGEON_IDS.map((id) => [id, DUNGEONS[id]?.name ?? id]), S.dungeon, (v) => (S.dungeon = v));
  select(r1, 'Mod', [['mythicplus', 'Mitik+'], ['mythic', 'Mitik 0'], ['heroic', 'Kahramanlık'], ['normal', 'Normal']], S.difficulty, (v) => (S.difficulty = v as RunState['difficulty']));
  const r2 = row(a);
  number(r2, 'Seviye', S.level, 2, 30, (v) => { S.level = v; defaultAffixes(); });
  number(r2, 'Hafta±', S.weekOffset, -12, 12, (v) => { S.weekOffset = v; defaultAffixes(); });
  select(r2, 'Parti', [1, 2, 3, 4, 5].map((n) => [String(n), String(n)] as [string, string]), String(S.party), (v) => (S.party = Number(v)));
  number(r2, 'Seed', S.seed, 1, 99999, (v) => (S.seed = v));
  const r3 = row(a);
  const aff = el('div', r3);
  aff.className = 'aff';
  affixBoxes = {};
  for (const id of AFFIX_IDS) {
    const l = el('label', aff);
    const cb = el('input', l);
    cb.type = 'checkbox';
    cb.addEventListener('change', () => (cb.checked ? S.affixes.add(id) : S.affixes.delete(id)));
    l.appendChild(document.createTextNode(MYTHIC_AFFIXES[id]?.name ?? id));
    affixBoxes[id] = cb;
  }
  const r4 = row(a);
  btn(r4, 'Hafta affixleri', () => defaultAffixes());
  btn(r4, 'Hazırla+Doldur+Başlat', () => startRun(true, true));
  btn(r4, 'Sadece hazırla', () => startRun(false, false));
  btn(r4, 'begin()', () => G.mplus.begin());
  btn(r4, 'Geri sayımı atla', () => G.mplus.debugSkipCountdown());
  btn(r4, 'end()', () => { G.mplus.end(); log('end()'); });
  btn(r4, 'Terk et', () => G.mplus.abandon());
  const r5 = row(a);
  const chase = btn(r5, 'Kovalama: kapalı', () => { S.chase = !S.chase; chase.textContent = 'Kovalama: ' + (S.chase ? 'açık' : 'kapalı'); chase.classList.toggle('on', S.chase); });
  const models = btn(r5, 'Gerçek modeller: kapalı', () => { S.models = !S.models; models.textContent = 'Gerçek modeller: ' + (S.models ? 'açık' : 'kapalı'); models.classList.toggle('on', S.models); });
  btn(r5, 'Temizle', () => { clearAll(); log('temizlendi'); });

  const b = section('Düşmanlar');
  const e1 = row(b);
  btn(e1, 'Yakın paketi çek', () => pull(16));
  btn(e1, 'Hepsini çek', () => pull(9999));
  btn(e1, 'Bırak', () => unpull());
  const e2 = row(b);
  const around = (n: number, id: string) => { for (let i = 0; i < n; i++) { const an = (i / n) * Math.PI * 2; void spawnDev(id, player.position.x + Math.cos(an) * 8, player.position.z + Math.sin(an) * 8, { id: devId(), packId: 'dev_around' }); } };
  btn(e2, 'Sürü×8', () => around(8, 'dev_swarm'));
  btn(e2, 'Sıradan×4', () => around(4, 'dev_trash'));
  btn(e2, 'Seçkin', () => around(1, 'dev_elite'));
  btn(e2, 'Patron', () => around(1, 'dev_boss_1'));
  const e3 = row(b);
  btn(e3, 'Rastgele öldür', () => killN(1));
  btn(e3, '5 öldür', () => killN(5));
  btn(e3, 'Yakın 8 öldür', () => killNearest(8));
  btn(e3, 'Tümünü öldür', () => killAllTrash());
  btn(e3, 'Patron öldür', () => { const bs = bosses(); if (bs[0]) kill(bs[0]); else log('patron yok'); });
  const e4 = row(b);
  btn(e4, 'Kuvvet +10%', () => addForces(10));
  btn(e4, 'Kuvvet +25%', () => addForces(25));
  btn(e4, 'Kuvvet %100\'e tamamla', () => { const s = G.mplus.state; if (s) addForces(Math.max(0, ((s.forcesRequired - s.forces) / s.forcesRequired) * 100)); });
  btn(e4, 'HEPSİNİ ÖLDÜR → BİTİR', () => finishRun());

  const c = section('Oyuncu / süre');
  const p1 = row(c);
  btn(p1, 'Öl (gerçek)', () => { G.combat.killLocalPlayer(null); });
  btn(p1, 'Ölüm cezası (sim)', () => G.mplus.onPlayerDeath(player));
  btn(p1, 'Yenile', () => { G.combat.reviveLocalPlayer(1); player.hp = player.maxHp; });
  btn(p1, '%50 can', () => { player.hp = player.maxHp * 0.5; });
  const p2 = row(c);
  btn(p2, '+60 sn', () => G.mplus.debugAdvance(60));
  btn(p2, '+5 dk', () => G.mplus.debugAdvance(300));
  const setFrac = (f: number) => { const s = G.mplus.state; if (!s || !s.timerSec) return; G.mplus.debugAdvance(s.timerSec * f - s.elapsed); log(`süre %${f * 100}`); };
  btn(p2, '%55', () => setFrac(0.55));
  btn(p2, '%75', () => setFrac(0.75));
  btn(p2, '%95', () => setFrac(0.95));
  btn(p2, '%130', () => setFrac(1.3));

  const d = section('Affix görselleri (önizleme)');
  const d1 = row(d);
  const ensure = (): boolean => {
    if (!G.mplus.state) { G.mplus.prepare(runParams()); }
    return true;
  };
  const ahead = (): [number, number] => [player.position.x + Math.sin(player.yaw) * 6, player.position.z + Math.cos(player.yaw) * 6];
  for (const id of AFFIX_IDS) {
    btn(d1, MYTHIC_AFFIXES[id]?.name ?? id, () => { ensure(); const [x, z] = ahead(); G.mplus.fx.preview(id, x, z); });
  }
  btn(d1, 'Küre', () => { ensure(); const [x, z] = ahead(); G.mplus.fx.preview('orb', x, z); });
  btn(d1, 'Küre patlaması', () => { ensure(); const [x, z] = ahead(); G.mplus.fx.preview('orb_boom', x, z); });

  const f = section('Affix mekanikleri (gerçek, host)');
  const f1 = row(f);
  const trig = (k: Parameters<MythicPlus['fx']['debugTrigger']>[0], needEnemy = false) => () => {
    const t = needEnemy ? regulars().sort((x, y) => x.position.distanceTo(player.position) - y.position.distanceTo(player.position))[0] : undefined;
    if (needEnemy && !t) return log('düşman yok', true);
    log(`${k}: ${G.mplus.fx.debugTrigger(k, t) ? 'tetiklendi' : 'çalışmadı (koşu aktif mi?)'}`);
  };
  btn(f1, 'Volkanik', trig('volcanic'));
  btn(f1, 'Sarsıntı', trig('quaking'));
  btn(f1, 'Patlayıcı küre', trig('orb'));
  btn(f1, 'Hortum', trig('tornado'));
  btn(f1, 'Patlayan', trig('burst'));
  btn(f1, 'Kan gölü', trig('sanguine'));
  const f2 = row(f);
  btn(f2, 'Güçlendir (yakın)', trig('bolster', true));
  btn(f2, 'Öfkelendir (yakın)', trig('rage', true));
  btn(f2, 'Kin ruhu (yakın)', trig('shade', true));
  btn(f2, 'Yarık aç', trig('rift'));
  btn(f2, 'Yakın düşman HP %25', () => { const t = regulars().sort((x, y) => x.position.distanceTo(player.position) - y.position.distanceTo(player.position))[0]; if (t) { t.hp = t.maxHp * 0.25; log('HP %25'); } });
  const f3 = row(f);
  // Efsun blessings (Kor: +15% dmg & burn on hit, Ayaz: -15% taken & chill attackers, Gölge: speed/crit/cdr); needs a prepared run with the seasonal affix
  (['Kor', 'Ayaz', 'Gölge'] as const).forEach((n, i) => btn(f3, `${n} Efsunu`, () => {
    if (!G.mplus.state) { G.mplus.prepare(runParams()); }
    if (!G.mplus.fx.has('seasonal_efsun')) log('uyarı: Efsunlu Yarık affixi seçili değil (hasar kancası pasif)', true);
    G.mplus.fx.handle({ kind: 'blessing', data: { type: i, dur: 60 } });
    log(`${n} Efsunu verildi (60 sn)`);
  }));

  const g = section('Anahtar / puan / kasa');
  const g1 = row(g);
  btn(g1, 'Anahtar +2', () => G.mplus.grantKeystone(undefined, 2));
  btn(g1, 'Anahtar seçili', () => G.mplus.grantKeystone(S.dungeon, S.level));
  btn(g1, 'Anahtar sil', () => { G.character!.save.mythic.keystone = null; G.events.emit('keystone:changed', {}); });
  btn(g1, 'Puan sıfırla', () => { const m = G.character!.save.mythic; m.best = {}; m.rating = 0; m.weekly.runs = []; m.vaultClaimedWeek = -1; log('sıfırlandı'); });
  const g2 = row(g);
  for (let i = 0; i < 3; i++) btn(g2, `Kasa ${i + 1}`, () => log(`kasa ${i + 1}: ${G.mplus.claimVault(i)}`));
  btn(g2, 'Dungeon değiştir', () => log('değiştir: ' + G.mplus.changeKeystoneDungeon()));
  btn(g2, 'Seviye düşür', () => log('düşür: ' + G.mplus.lowerKeystone()));
  btn(g2, 'Haftalık anahtar', () => log('haftalık: ' + G.mplus.claimWeeklyKey()));
  const g3 = row(g);
  btn(g3, 'Çökme kurtarma (sim)', () => log('çökme kurtarma: ' + G.mplus.debugSimulateCrashRecovery() + ' (anahtar -1, tükenmiş)'), 'Oyun koşu ortasında kapanmış gibi: anahtar -1 ve tükenmiş');
  btn(g3, 'İstemci aynası testi', () => void mirrorTest());
  btn(g3, 'Çalışma özeti paneli', () => G.events.emit('ui:openPanel', { panel: 'mplusInfo' }));
  btn(g3, 'Anahtar paneli', () => G.events.emit('ui:openPanel', { panel: 'keystone' }));

  const h = section('Görünüm');
  const h1 = row(h);
  for (const [k, t] of [['run', 'Koşu'], ['rotation', 'Rotasyon'], ['score', 'Skor'], ['meta', 'Meta']] as const) btn(h1, t, () => { S.view = k; refreshOverlay(); });
  el('div', panel, 'WASD yürü · Shift koş · sürükle: kamera').style.cssText = 'margin-top:8px;color:#8a7a5a';
}

/* ------------------------------------------------------------------ client mirror test */

async function mirrorTest(): Promise<void> {
  const host = G.mplus;
  if (!host.state) return log('önce koşu hazırla', true);
  const mirror = new MythicPlus();
  mirror.debugRole = 'client';
  mirror.debugMuted = true;
  mirror.prepare({ ...runParams() });
  mirror.fx.stop();
  const orig = G.net.broadcast.bind(G.net);
  let got = 0;
  (G.net as unknown as { broadcast: unknown }).broadcast = (ch: string, payload: unknown, o?: unknown) => {
    if (ch === 'run') { got++; mirror.applyRemoteState(JSON.parse(JSON.stringify(payload))); }
    (orig as (c: string, p: unknown, o?: unknown) => void)(ch, payload, o);
  };
  await new Promise((r) => setTimeout(r, 2300));
  (G.net as unknown as { broadcast: unknown }).broadcast = orig;
  const a = host.state!, b = mirror.state!;
  const same = a.started === b.started && a.forces === b.forces && a.deaths === b.deaths && a.bossesKilled.length === b.bossesKilled.length && a.completed === b.completed;
  log(`ayna: ${got} 'run' mesajı, durum ${same ? 'EŞİT' : 'FARKLI'} (host forces ${a.forces} / ayna ${b.forces}, elapsed ${fmt(a.elapsed)} / ${fmt(b.elapsed)})`, !same);
}

/* ------------------------------------------------------------------ boot */

async function main(): Promise<void> {
  const h = await bootHarness({ floorSize: 320 });
  G.engine.setBackgroundTick(true); // keep simulating when the tab/pane is hidden (automated checks)
  h.scene.fog = new THREE.Fog(0x14121a, 60, 400);
  cam = h.camera;
  orbit = h.orbit as unknown as typeof orbit;
  world = h.world;
  world.nav = new NavGrid({ originX: -60, originZ: -60, width: 320, depth: 320, walkable: true });
  G.ui.setMode('dungeon');
  ensureDevContent();

  const ch = CharacterState.create('Efsuncu', 'knight', 0);
  ch.save.level = 60;
  G.character = ch;
  try { ch.recomputeStats(); } catch { /* ignore */ }
  (ch.stats as Record<string, number>).maxHp = 24000;
  player = new Player({ id: 1, slot: 0, classId: 'knight', name: 'Efsuncu', level: 60, isLocal: true, peerId: G.net.selfId, character: ch });
  world.add(player);
  world.localPlayer = player;
  G.player = player;
  try { await player.loadModel(); } catch (e) { log('oyuncu modeli yüklenemedi: ' + String(e), true); }
  player.refreshStats();
  player.hp = player.maxHp;

  // enemy factory: real when implemented (the stub is a few lines long)
  factoryReal = spawnEnemy.toString().length > 220;
  if (!factoryReal) {
    G.mplus.fx.setSpawner(async (defId, pos, o) => {
      const e = await spawnDev(defId, pos.x, pos.z, {});
      if (e) e.level = o.level;
      return e;
    });
  }
  log(`enemy factory: ${factoryReal ? 'GERÇEK' : 'stub (sahte spawner)'} · HitShapes aktif · dungeon sayısı ${DUNGEON_IDS.length}`);

  G.events.on('player:releaseRequested', () => {
    teleportToStart();
    G.combat.reviveLocalPlayer(0.3);
    player.hp = player.maxHp * 0.3;
    log('serbest bırakıldı');
  });
  for (const ev of ['run:started', 'run:countdown', 'run:forces', 'run:playerDeath', 'run:completed', 'keystone:changed'] as const) {
    G.events.on(ev, (p: unknown) => {
      const brief = ev === 'run:completed' ? (() => { const q = p as { state: RunState; record: { score: number; upgrade: number } | null; rewards: unknown[] }; return `upgrade ${q.state.upgradeLevels} inTime ${q.state.inTime} skor ${q.record?.score ?? '-'} ödül ${q.rewards.length}`; })() : JSON.stringify(p, (k, v) => (k === 'state' ? '…' : v));
      log(`${ev} ${brief}`);
    });
  }

  buildPanel();
  defaultAffixes();
  h.onFrame((dt) => {
    movePlayer(dt);
    chaseTick(dt);
    capsuleTick();
  });
  setInterval(refreshOverlay, 200);
  cameraSnap();

  (window as unknown as { mp: unknown }).mp = {
    S, startRun, fill, kill, killAllTrash, finishRun, addForces, pull, unpull, regulars, bosses, aliveEnemies, spawnDev, clearAll, player: () => player, mirrorTest, teleportToStart, log,
  };
  log('hazır. "Hazırla+Doldur+Başlat" ile bir koşu başlat.');
}

void main().catch((e) => log('boot hatası: ' + String((e as Error)?.stack ?? e), true));
