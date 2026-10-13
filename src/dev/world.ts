import * as THREE from 'three';
import { bootWorldDev } from './worldBoot';
import { G } from '../game/G';
import { buildDungeon, type BuiltDungeon } from '../world/DungeonBuilder';
import { buildTown, type BuiltTown } from '../world/TownBuilder';
import { TOWN } from '../data/town';
import { DUNGEONS, OPEN_ZONES } from '../data/dungeons';
import type { DungeonDef } from '../types/dungeons';
import type { NavGrid } from '../world/NavGrid';

/**
 * Dev page for the world module: a rich test dungeon (all zone kinds, tagged/posed props, fog override), an outdoor test zone,
 * the real content dungeons and the hub town.
 * Keys: T town <-> last dungeon, 1..9 / [ ] pick a dungeon, N nav overlay, G gates, F orbit on/off, WASD walk (Shift = fast).
 * URL: ?mode=town | ?dungeon=<id|dev_test|dev_outdoor|kemik_mahzeni...> &cam=x,z,dist,height,yaw &nav=1 &gates=close &light=hemi,ambient,moon
 */

const GEN = '/assets/models/gen/props/';
const DUN = '/assets/models/dungeon/';
const CHR = '/assets/models/characters/';

// Positions of props / start / exit / bosses / camps follow the contract (world = (tile + 0.5) * TILE_SIZE).
function testDungeon(): DungeonDef {
  const rooms: DungeonDef['rooms'] = [
    {
      id: 'entry', name: 'Giriş Salonu', rect: { x: 5, z: 33, w: 8, h: 5 }, floor: 'stone_dark', wall: 'stone', autoDecor: 0.45,
      props: [
        { model: GEN + 'crate_a.glb', pos: [5.9, 35.5], collide: true, tag: 'breakable', id: 'dev_crate' },
        { model: DUN + 'barrel_large.glb', pos: [11.1, 35.7], collide: true, tint: 0xbfe8ff, emissive: 0x204060, emissiveIntensity: 0.6 },
        { model: CHR + 'Knight.glb', pos: [7.7, 33.9], rot: 180, pose: 'Blocking', tint: 0xcfe8ff, show: ['1H_Sword', 'Rectangle_Shield', 'Knight_Helmet', 'Knight_Cape'], collide: true, id: 'dev_knight' },
      ],
    },
    { id: 'c1', name: 'Geçit', rect: { x: 8, z: 29, w: 2, h: 4 }, floor: 'stone_dark', wall: 'stone', autoDecor: 0.4 },
    {
      id: 'hall', name: 'Kemik Salonu', rect: { x: 3, z: 16, w: 12, h: 13 }, floor: 'stone', wall: 'stone', autoDecor: 0.75, ambientVfx: 'ambient_dust',
      zones: [
        { kind: 'pit', shape: 'circle', rect: { x: 6.5, z: 21.2, w: 2, h: 2 }, blocked: true, color: 0x050806, glow: 0x60ff90, glowIntensity: 1.4, vfx: 'ambient_shadow_wisps' },
        { kind: 'rune', shape: 'circle', rect: { x: 9.2, z: 20.6, w: 3, h: 3 }, color: 0x14221c, glow: 0x60ff90, glowIntensity: 1 },
      ],
      props: [
        { model: GEN + 'altar.glb', pos: [8, 18.1], rot: 0, collide: true },
        { model: GEN + 'sarcophagus.glb', pos: [4.5, 25], rot: 90, collide: true },
        { model: GEN + 'sarcophagus.glb', pos: [11.5, 25], rot: -90, collide: true },
        { model: GEN + 'chest_gold.glb', pos: [12.7, 16.7], rot: -30, collide: true, tag: 'chest', id: 'dev_chest' },
        { model: DUN + 'table_long_decorated_A.glb', pos: [8, 26.7], rot: 0, collide: true },
      ],
    },
    { id: 'c2', name: 'Doğu Dehlizi', rect: { x: 15, z: 21, w: 4, h: 2 }, floor: 'dirt', wall: 'brick', autoDecor: 0.4 },
    {
      id: 'armory', name: 'Silah Odası', rect: { x: 19, z: 15, w: 9, h: 12 }, floor: 'wood', wall: 'brick', autoDecor: 0.65, explicitDecor: true,
      zones: [{ kind: 'vent', shape: 'circle', rect: { x: 23.4, z: 23.4, w: 2.2, h: 2.2 }, glow: 0xff6a20, glowIntensity: 1.2, vfx: 'volcanic_plume' }],
      props: [
        { model: DUN + 'table_long_tablecloth_decorated_A.glb', pos: [23, 18.9], rot: 90, collide: true },
        { model: DUN + 'chair.glb', pos: [21.7, 17.7], rot: 30 },
        { model: GEN + 'cauldron.glb', pos: [25.5, 16.5], collide: true },
        { model: DUN + 'candle_lit.glb', pos: [23, 18.8], y: 1.0 },
        { model: DUN + 'pillar_decorated.glb', pos: [20, 16], collide: true, tag: 'pillar' },
        { model: DUN + 'pillar_decorated.glb', pos: [26.1, 16], collide: true, tag: 'pillar' },
      ],
    },
    { id: 'c3', name: 'Mühürlü Geçit', rect: { x: 22, z: 11, w: 2, h: 4 }, floor: 'stone_dark', wall: 'stone', autoDecor: 0.3 },
    {
      id: 'boss', name: 'Kül Salonu', rect: { x: 17, z: 1, w: 12, h: 10 }, floor: 'lava_rock', wall: 'forge', autoDecor: 0.3, lightColor: 0xff6a30, ambientVfx: 'ambient_embers',
      zones: [
        { kind: 'lava', rect: { x: 18, z: 2, w: 10, h: 7 }, blocked: true, color: 0x7a1a05, glow: 0xff6a20, glowIntensity: 1.5, light: { color: 0xff6a20, intensity: 1.5, distance: 22, flicker: true, y: 1 } },
        { kind: 'dais', shape: 'circle', rect: { x: 21, z: 3.3, w: 4, h: 4 }, color: 0x1e1612 },
        { kind: 'bridge', rect: { x: 22, z: 7, w: 2, h: 4 }, color: 0x3a2a1a },
      ],
      props: [
        { model: GEN + 'brazier.glb', pos: [18.3, 8.9], collide: true },
        { model: GEN + 'brazier.glb', pos: [26.7, 8.9], collide: true },
        { model: GEN + 'crystal_purple.glb', pos: [26.3, 9.5], collide: true, light: { color: 0xb060ff, intensity: 1.5, distance: 9, flicker: true } },
      ],
    },
    { id: 'c4', name: 'Çıkış Yolu', rect: { x: 29, z: 5, w: 4, h: 2 }, floor: 'stone_dark', wall: 'ice', autoDecor: 0.3 },
    {
      id: 'frost', name: 'Buz Mahzeni', rect: { x: 33, z: 2, w: 6, h: 8 }, floor: 'ice', wall: 'ice', autoDecor: 0.5, lightColor: 0x80c8ff, ambientVfx: 'ambient_snow',
      fog: { color: 0xc8e0f0, near: 14, far: 60 },
      zones: [{ kind: 'ice', rect: { x: 34, z: 4, w: 3, h: 3 }, color: 0xbfe8ff, glow: 0x9ad8ff, glowIntensity: 1 }],
    },
    { id: 'c6', name: 'Güney Merdiveni', rect: { x: 22, z: 27, w: 2, h: 3 }, floor: 'stone_dark', wall: 'temple', autoDecor: 0.3 },
    { id: 'temple', name: 'Gölge Tapınağı', rect: { x: 18, z: 30, w: 10, h: 8 }, floor: 'temple', wall: 'temple', autoDecor: 0.55, lightColor: 0xb070ff },
    { id: 'cave', name: 'Mağara', rect: { x: 0, z: 18, w: 3, h: 6 }, floor: 'dirt', wall: 'cave', autoDecor: 0.6 },
  ];
  const doors: DungeonDef['doors'] = [
    { a: 'entry', b: 'c1', tile: [8, 33], side: 'n', width: 2, gate: 'none' },
    { a: 'c1', b: 'hall', tile: [8, 29], side: 'n', width: 2, gate: 'none' },
    { a: 'hall', b: 'c2', tile: [14, 21], side: 'e', width: 2, gate: 'none' },
    { a: 'c2', b: 'armory', tile: [18, 21], side: 'e', width: 2, gate: 'none' },
    { a: 'armory', b: 'c3', tile: [22, 15], side: 'n', width: 2, gate: 'none' },
    { a: 'c3', b: 'boss', tile: [22, 11], side: 'n', width: 2, gate: 'boss_lock' },
    { a: 'boss', b: 'c4', tile: [28, 5], side: 'e', width: 2, gate: 'boss_exit' },
    { a: 'c4', b: 'frost', tile: [32, 5], side: 'e', width: 2, gate: 'none' },
    { a: 'armory', b: 'c6', tile: [22, 26], side: 's', width: 2, gate: 'none' },
    { a: 'c6', b: 'temple', tile: [22, 29], side: 's', width: 2, gate: 'forces_lock' },
    { a: 'hall', b: 'cave', tile: [3, 19], side: 'w', width: 1, gate: 'none' },
  ];
  return {
    id: 'dev_test',
    name: 'Test Zindanı',
    shortName: 'Test',
    lore: 'dev',
    levelRange: [1, 10],
    timerSec: 600,
    forcesRequired: 100,
    theme: { fogColor: 0x141a18, fogNear: 8, fogFar: 40, ambient: 0x3c4a48, ambientIntensity: 0.35, hemiSky: 0x6a7a90, hemiGround: 0x201810, torchColor: 0xffa050, music: 'dungeon_crypt', tint: 0xc8d0c8 },
    grid: { w: 40, h: 40 },
    rooms,
    doors,
    packs: [],
    bosses: [{ bossId: 'test_boss', roomId: 'boss', pos: [22.5, 5.5], order: 1 }],
    start: { pos: [8.5, 35.5], facing: 180 },
    exit: { pos: [35.5, 5.5] },
  };
}

/** Open-world test zone (DungeonDef.outdoor): 25 x 25 tiles = 100 m, two camps, a boss mound. */
function testOutdoor(): DungeonDef {
  const member = (enemyId: string, ox: number, oz: number) => ({ enemyId, offset: [ox, oz] as [number, number] });
  return {
    id: 'dev_outdoor',
    name: 'Test Korusu',
    shortName: 'Koru',
    lore: 'dev',
    levelRange: [1, 10],
    timerSec: 0,
    forcesRequired: 0,
    theme: { fogColor: 0x9aa890, fogNear: 15, fogFar: 70, ambient: 0x607060, ambientIntensity: 0.3, hemiSky: 0xc0d0b0, hemiGround: 0x303820, torchColor: 0xffa050, music: 'town', tint: 0xdde4d0 },
    grid: { w: 25, h: 25 },
    rooms: [
      { id: 'koru', name: 'Sisli Koru', rect: { x: 0, z: 0, w: 25, h: 25 }, floor: 'dirt', wall: 'cave', autoDecor: 0, ambientVfx: 'ambient_dust' },
    ],
    doors: [],
    packs: [
      { id: 'c1', roomId: 'koru', center: [12, 7.5], members: [member('rat', 0, 0), member('rat', 1, 0)], radius: 12, respawnSec: 60 },
      { id: 'c2', roomId: 'koru', center: [5.5, 13.5], members: [member('slime', 0, 0)], radius: 14, respawnSec: 60 },
      { id: 'c3', roomId: 'koru', center: [18.5, 14.5], members: [member('goblin', 0, 0)], radius: 14, respawnSec: 75 },
    ],
    bosses: [{ bossId: 'test_world_boss', roomId: 'koru', pos: [12, 19.5], order: 1 }],
    start: { pos: [12, 1], facing: 0 },
    exit: { pos: [12, 1.9] },
    outdoor: true,
  };
}

function navOverlay(nav: NavGrid): THREE.Mesh {
  const w = nav.cols, h = nav.rows;
  const data = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const i = (r * w + c) * 4;
      const walk = nav.cells[r * w + c] > 0;
      data[i] = walk ? 40 : 255;
      data[i + 1] = walk ? 255 : 30;
      data[i + 2] = 40;
      data[i + 3] = walk ? 50 : 150;
    }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = true;
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(nav.originX + w / 2, 0.25, nav.originZ + h / 2);
  mesh.renderOrder = 20;
  return mesh;
}

(window as unknown as Record<string, unknown>).THREE = THREE;

async function main() {
  const h = await bootWorldDev();
  const hud = document.getElementById('hud')!;
  const scene = h.scene;
  // remove harness lights/grid: the builders bring their own
  for (const c of [...scene.children]) if ((c as THREE.Light).isLight || (c as unknown as { isGridHelper?: boolean }).isGridHelper) scene.remove(c);

  const defs: Record<string, () => DungeonDef> = {
    dev_test: testDungeon,
    dev_outdoor: testOutdoor,
    ...Object.fromEntries(Object.entries(DUNGEONS).map(([id, d]) => [id, () => d])),
    // open-world maps (sisli_vadi = 640 m fly-through, WP5): ?dungeon=sisli_vadi
    ...Object.fromEntries(Object.entries(OPEN_ZONES).map(([id, d]) => [id, () => d])),
  };
  const ids = Object.keys(defs);
  const q = new URLSearchParams(location.search);
  let dungeonId = q.get('dungeon') && defs[q.get('dungeon')!] ? q.get('dungeon')! : 'dev_test';
  let mode: 'dungeon' | 'town' = q.get('mode') === 'town' ? 'town' : 'dungeon';
  let dungeon: BuiltDungeon | null = null;
  let town: BuiltTown | null = null;
  let overlay: THREE.Mesh | null = null;
  let showNav = false;
  let building = false;
  const walker = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0x402800 }));
  body.position.y = 1.1;
  walker.add(body);
  scene.add(walker);
  (h.world as unknown as { localPlayer: unknown }).localPlayer = { position: walker.position };
  let nav: NavGrid | null = null;
  let status = '';

  async function load(m: 'dungeon' | 'town') {
    building = true;
    mode = m;
    dungeon?.dispose(); dungeon = null;
    town?.dispose(); town = null;
    overlay?.removeFromParent(); overlay = null;
    const t0 = performance.now();
    try {
      if (m === 'dungeon') {
        const def = defs[dungeonId]();
        dungeon = await buildDungeon(def, scene);
        nav = dungeon.nav;
        h.world.nav = nav;
        walker.position.copy(dungeon.start);
        h.camera.position.set(dungeon.start.x + 10, 20, dungeon.start.z + 14);
        h.orbit.target.copy(dungeon.start);
      } else {
        town = await buildTown(TOWN, scene);
        nav = town.nav;
        h.world.nav = nav;
        walker.position.copy(town.spawn);
        h.camera.position.set(town.spawn.x + 8, 14, town.spawn.z + 16);
        h.orbit.target.copy(town.spawn);
      }
      status = `${m === 'town' ? 'town' : dungeonId} built in ${(performance.now() - t0).toFixed(0)} ms`;
      console.log(`[dev/world] ${status}`);
    } catch (e) {
      status = 'BUILD FAILED (see console)';
      console.error('[dev/world] build failed', e);
    }
    building = false;
    if (showNav && nav) { overlay = navOverlay(nav); scene.add(overlay); }
    h.camera.far = m === 'town' || (dungeon && dungeon.root.name.endsWith('outdoor')) ? 700 : 300;
    h.camera.updateProjectionMatrix();
  }

  const keys = new Set<string>();
  const pick = (id: string) => { if (!building && defs[id]) { dungeonId = id; load('dungeon'); } };
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyT' && !building) load(mode === 'dungeon' ? 'town' : 'dungeon');
    if (e.code === 'KeyN') {
      showNav = !showNav;
      overlay?.removeFromParent(); overlay = null;
      if (showNav && nav) { overlay = navOverlay(nav); scene.add(overlay); }
    }
    if (e.code === 'KeyG' && dungeon) for (const g of dungeon.gates.values()) (g.isOpen ? g.close() : g.open());
    if (e.code === 'KeyF') h.orbit.enabled = !h.orbit.enabled;
    if (/^Digit[1-9]$/.test(e.code)) pick(ids[Number(e.code.slice(5)) - 1]);
    if (e.code === 'BracketRight') pick(ids[(ids.indexOf(dungeonId) + 1) % ids.length]);
    if (e.code === 'BracketLeft') pick(ids[(ids.indexOf(dungeonId) + ids.length - 1) % ids.length]);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  const goto = (x: number, z: number, dist = 13, height = 14, yaw = 0) => {
    walker.position.set(x, 0, z);
    h.orbit.target.set(x, 0, z);
    h.camera.position.set(x + Math.sin(yaw) * dist, height, z + Math.cos(yaw) * dist);
    h.orbit.update();
  };
  (window as unknown as Record<string, unknown>).devWorld = { goto, walker, load, pick, ids, scene, h, get dungeon() { return dungeon; }, get town() { return town; }, get nav() { return nav; } };

  h.onFrame((dt) => {
    // walker
    const sp = (keys.has('ShiftLeft') ? 16 : 8) * dt;
    const dir = new THREE.Vector3();
    h.camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const mv = new THREE.Vector3();
    if (keys.has('KeyW') || keys.has('ArrowUp')) mv.add(dir);
    if (keys.has('KeyS') || keys.has('ArrowDown')) mv.sub(dir);
    if (keys.has('KeyD') || keys.has('ArrowRight')) mv.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mv.sub(right);
    if (mv.lengthSq() > 0) {
      mv.normalize().multiplyScalar(sp);
      walker.position.add(mv);
      nav?.resolveCircle(walker.position, 0.5);
      // follow with the camera
      h.camera.position.add(mv);
      h.orbit.target.add(mv);
    }
    if (town) walker.position.y = town.groundY(walker.position.x, walker.position.z);
    dungeon?.update(dt);
    town?.update(dt);
    const info = G.engine.renderer.info;
    const room = dungeon?.roomAt(walker.position.x, walker.position.z)?.name ?? '';
    const regionName = dungeon?.world?.region?.name ?? '';
    const zone = dungeon?.zoneAt(walker.position.x, walker.position.z);
    const hz = dungeon?.hazardAt(walker.position.x, walker.position.z);
    hud.textContent =
      `${mode === 'town' ? 'KASABA' : dungeonId}  ${G.engine.fps.toFixed(0)} fps  calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n` +
      `geo ${info.memory.geometries} tex ${info.memory.textures}  lights ${dungeon?.lights.activeCount ?? town?.lightsActive ?? 0}  ${status}\n` +
      `pos ${walker.position.x.toFixed(1)}, ${walker.position.z.toFixed(1)}  ${room}${regionName ? '  bolge:' + regionName : ''}${zone ? '  zone:' + zone.kind : ''}${hz ? '  HAZARD x' + hz.hazard!.coef : ''}\n` +
      `[T] kasaba/zindan  [1-9 / [ ]] zindan: ${ids.join(' ')}\n[N] nav  [G] kapılar  [WASD] yürü  [F] orbit aç/kapa`;
  });

  await load(mode);
  const cam = q.get('cam');
  if (cam) { const [x, z, d, hh, yw] = cam.split(',').map(Number); goto(x, z, d || 13, hh || 14, yw || 0); }
  if (q.get('nav') === '1') { showNav = true; if (nav) { overlay = navOverlay(nav); scene.add(overlay); } }
  const dg = dungeon as BuiltDungeon | null;
  if (q.get('gates') === 'close' && dg) for (const g of dg.gates.values()) g.close();
  const lt = q.get('light');
  if (lt && dg) { const [hm, am, mo] = lt.split(',').map(Number); dg.lighting.hemi.intensity = hm; dg.lighting.ambient.intensity = am; dg.lighting.moon.intensity = mo; }
  document.title = 'Dev: world (hazır)';
}

main();
