import * as THREE from 'three';
import type { GameScene } from '../core/SceneManager';
import { G } from '../game/G';
import { PlayerController } from '../game/PlayerController';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { Player } from '../entities/Player';
import { characterAssetUrls } from '../entities/CharacterModel';
import { NPC, npcModelUrl, resolvePreset } from '../entities/NPC';
import {
  BountyBoard, DungeonPortal, FontOfPower, LobbyObelisk, PanelProp, TrainingDummy, type DummyKind, type PanelPropOpts,
} from '../entities/interactables';
import { World } from '../world/World';
import { buildTown, townAssetUrls } from '../world/TownBuilder';
import type { SceneTown } from './SceneTown';
import { TOWN } from '../data/town';
import { PARTY_ID_BASE } from '../types/common';
import type { TownDef } from '../types/dungeons';
import type { EventScope } from '../core/EventBus';
import type { Entity } from '../entities/Entity';
import { DEFAULT_PORTAL_ARRIVAL, DEFAULT_TOWN_NPCS, DEFAULT_TOWN_SPAWN } from './townDefaults';
import { buildFallbackTown, FALLBACK_TOWN_PROPS } from './FallbackTown';
import { releaseLocalPlayer } from './respawn';
import { getDungeon } from '../data/dungeons';
import { propUrl, SkeletonReaper } from './SceneKit';
import { isOpenWorld, sceneFlow } from './flow';
import type { DungeonParams, TownParams } from './scenes';
import { openWorldParams } from './world/params';
import { bindQuestMarks } from './world/QuestMarks';
import { mountMarket, unmountMarket } from '../world/MarketStalls';
import { PAZAR_MEYDANI, PAZAR_USTASI_AT } from '../data/market';
import { PVP_MIN_LEVEL, PVP_ZONE_ID } from '../data/pvpZone';

type NpcDef = TownDef['npcs'][number];

/** Exit id of the South Gate in TOWN.exits (leads to the open world). */
const SOUTH_GATE_ID = 'guney_kapisi';

/** Named zones of Kuzgunkale (GDD_CONTENT 2.2) for the zone banner (fallback when data/town.ts has no `zones`). */
const FALLBACK_ZONES: { name: string; test: (x: number, z: number) => boolean }[] = [
  { name: 'Kadim Kapılar Salonu', test: (x, z) => x > -26 && x < 26 && z < -27 },
  { name: 'Güney Kapısı', test: (x, z) => Math.abs(x) < 8 && z > 50 },
  { name: 'Eğitim Alanı', test: (x, z) => x < -18 && z > 22 },
  { name: 'Han Bahçesi', test: (x, z) => x > 18 && z > 22 },
  { name: 'Çarşı', test: (x, z) => x < -14 && z > -22 && z < 20 },
  { name: 'Zanaat Sokağı', test: (x, z) => x > 14 && z > -22 && z < 20 },
  { name: 'Meydan', test: (x, z) => Math.hypot(x, z - 8) < 15 },
];

/** Content zones first (first match wins, so the broad road zone is last in the data), else the built-in list. */
const ZONES: { name: string; test: (x: number, z: number) => boolean }[] = TOWN.zones?.length
  ? TOWN.zones.map((zz) => ({ name: zz.name, test: (x: number, z: number) => x >= zz.box[0] && x <= zz.box[2] && z >= zz.box[1] && z <= zz.box[3] }))
  : FALLBACK_ZONES;

/**
 * Solid town meshes the camera is kept in front of (ThirdPersonCamera.occluders): visible, shadow- or receive-flagged meshes with
 * a small geometry. Grass, flowers and the far forest are cast/receive-off decor the camera may look through; the terrain, sky and
 * horizon mountains have geometry hundreds of metres across, so they are skipped (testing them every frame would be far too slow).
 */
function townOccluders(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (!m.castShadow && !m.receiveShadow) || !m.geometry) return;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    if (m.geometry.boundingSphere && m.geometry.boundingSphere.radius <= 100) out.push(m);
  });
  return out;
}

/**
 * The hub: Kuzgunkale. Builds the town through the world module (buildTown) — with a built-in fallback when that is
 * unavailable —, spawns the local player + camera + controller, NPCs (blacksmith, merchants, stash, keystone master, trainer,
 * bounty...), the Mythic+ portal hall (dungeon portals, Font of Power, Şeref Taşı), the lobby obelisk, bounty board and
 * training dummies. Handles 'player:releaseRequested', the zone banner and arrival after a dungeon run.
 * OWNER: scenes module.
 */
export class TownScene implements GameScene {
  readonly id = 'town' as const;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);

  private world: World | null = null;
  private built: SceneTown | null = null;
  private player: Player | null = null;
  private cam: ThirdPersonCamera | null = null;
  private controller: PlayerController | null = null;
  private events: EventScope | null = null;
  private ready = false;
  private zone = '';
  private zoneTimer = 0;
  private spawnPoint = new THREE.Vector3();
  private spawnYaw = 0;
  private exitCooldown = 3;
  private exiting = false;
  private reaper = new SkeletonReaper();

  async enter(params?: unknown): Promise<void> {
    const p = (params ?? {}) as TownParams;
    G.vfx.attach(this.scene, this.camera);
    G.ui.setMode('town');
    const ch = G.character;
    if (!ch) throw new Error('town: no character selected');
    this.camera.fov = G.settings.data.fov || 60;
    this.camera.updateProjectionMatrix();
    G.ui.showLoading(0.02, 'Kuzgunkale yükleniyor...');

    const defs: NpcDef[] = TOWN.npcs.length ? TOWN.npcs : DEFAULT_TOWN_NPCS;
    const usingDefaults = !TOWN.npcs.length;
    try {
      ch.recomputeStats();
    } catch (e) {
      console.warn('[town] recomputeStats failed', e);
    }

    // ---- assets ----
    const urls = new Set<string>([...characterAssetUrls(ch.classId), ...townAssetUrls(TOWN)]);
    for (const d of defs) {
      if (['portal', 'lobby'].includes(d.role) || d.id.startsWith('obj_')) continue;
      urls.add(npcModelUrl(resolvePreset(d).base));
    }
    for (const n of ['mplus_portal', 'font_of_power', 'keystone', 'notice_board', 'lobby_obelisk', 'training_dummy', 'altar', 'crystal_purple', 'crystal_blue', 'waypoint_stone']) urls.add(propUrl(n));
    await G.assets.loadMany([...urls], (l, t) => G.ui.showLoading(0.05 + 0.45 * (l / t), 'Kuzgunkale yükleniyor...'));

    // ---- the town itself ----
    let built: SceneTown | null = null;
    try {
      built = (await buildTown(TOWN, this.scene)) as SceneTown;
    } catch (e) {
      console.warn('[town] buildTown unavailable, using fallback town:', (e as Error)?.message ?? e);
    }
    if (!built) {
      await G.assets.loadMany(FALLBACK_TOWN_PROPS);
      built = await buildFallbackTown(TOWN, this.scene, usingDefaults && !TOWN.props.length);
    }
    this.built = built;
    G.ui.showLoading(0.6, 'Kuzgunkale yükleniyor...');

    const world = new World(this.scene, built.nav);
    this.world = world;
    // terraces / stairs: the builder owns the height field
    const gy = built.groundY;
    if (typeof gy === 'function') world.groundY = (x: number, z: number) => gy.call(built, x, z);

    // ---- spawn point (the builder knows its geometry: spawn on the plaza, arrival in front of the portal hall) ----
    const portalDefs = defs.filter((d) => d.role === 'portal');
    let sx: number, sz: number, syaw: number;
    // the south gate is found by its exit id (its target is the open world, Sisli Vadi); see data/town.ts
    const gate = TOWN.exits?.find((ex) => ex.id === SOUTH_GATE_ID);
    // leaving the open world through the Esc game menu asks for 'portal': the south gate is where that player really belongs
    const spawnAt = p.spawnAt === 'portal' && sceneFlow.leftOpenWorld && gate ? 'south' : p.spawnAt;
    // back from Karakır Bozkırı: the East Gate is the way home
    const eastGate = sceneFlow.leftWorldId === 'karakir_bozkiri' ? TOWN.exits?.find((ex) => ex.id === 'dogu_kapisi') : undefined;
    // back from Kızıl Sınır (PvP zone): the West Gate
    const westGate = sceneFlow.leftWorldId === PVP_ZONE_ID ? TOWN.exits?.find((ex) => ex.id === 'bati_kapisi') : undefined;
    sceneFlow.leftOpenWorld = false;
    sceneFlow.leftWorldId = undefined;
    if (spawnAt === 'south' && westGate) {
      sx = westGate.box[2] + 5;
      sz = (westGate.box[1] + westGate.box[3]) / 2;
      syaw = Math.PI / 2;
    } else if (spawnAt === 'south' && eastGate) {
      sx = eastGate.box[0] - 5;
      sz = (eastGate.box[1] + eastGate.box[3]) / 2;
      syaw = -Math.PI / 2;
    } else if (spawnAt === 'south' && gate) {
      // back from the open world: just inside the south gate, facing the town
      sx = (gate.box[0] + gate.box[2]) / 2;
      sz = gate.box[1] - 5;
      syaw = Math.PI;
    } else if (spawnAt === 'portal') {
      if (built.arrival) {
        sx = built.arrival.x;
        sz = built.arrival.z;
        syaw = built.arrivalYaw ?? 0;
      } else if (portalDefs.length) {
        sx = portalDefs.reduce((s2, d) => s2 + d.pos[0], 0) / portalDefs.length;
        sz = Math.max(...portalDefs.map((d) => d.pos[2])) + 7;
        syaw = 0;
      } else {
        sx = DEFAULT_PORTAL_ARRIVAL.pos[0];
        sz = DEFAULT_PORTAL_ARRIVAL.pos[2];
        syaw = 0;
      }
    } else if (built.spawn.lengthSq() > 0) {
      sx = built.spawn.x;
      sz = built.spawn.z;
      syaw = built.spawnYaw;
    } else {
      sx = DEFAULT_TOWN_SPAWN.pos[0];
      sz = DEFAULT_TOWN_SPAWN.pos[2];
      syaw = (DEFAULT_TOWN_SPAWN.facing * Math.PI) / 180;
    }
    const fix = world.nav.nearestWalkable(sx, sz);
    if (fix) {
      sx = fix.x;
      sz = fix.z;
    }
    this.spawnPoint.set(sx, world.groundY(sx, sz), sz);
    this.spawnYaw = syaw;

    // ---- local player ----
    const slot = G.net.localSlot;
    const player = new Player({
      id: PARTY_ID_BASE + slot, slot, classId: ch.classId, name: ch.save.name, level: ch.level, isLocal: true, peerId: G.net.selfId, character: ch,
    });
    player.position.copy(this.spawnPoint);
    player.yaw = syaw;
    await player.loadModel();
    try {
      player.refreshStats();
      player.hp = player.maxHp;
    } catch (e) {
      console.warn('[town] player stats failed', e);
    }
    world.add(player);
    world.localPlayer = player;
    this.player = player;
    G.ui.showLoading(0.75, 'Kuzgunkale yükleniyor...');

    // ---- NPCs and interactables ----
    await this.spawnPOIs(world, defs, built, usingDefaults);
    // CM14 Pazar Meydanı: stalls, boards and the Tezgâh Ustası NPC (a failure never blocks entering the town)
    try { mountMarket(this.scene, PAZAR_MEYDANI, { world, npc: PAZAR_USTASI_AT }); } catch (e) { console.warn('[town] market mount failed', e); }
    G.ui.showLoading(0.95, 'Kuzgunkale yükleniyor...');

    // ---- camera + controller ----
    const cam = new ThirdPersonCamera(this.camera);
    cam.setTarget(player.object3d);
    cam.setEnvironment({ outdoor: true });
    cam.yaw = syaw + Math.PI;
    // collected after the POIs are placed (hidden builder arches are no occluders); the camera never sits behind a bush, wall or house
    cam.occluders = townOccluders(built.root);
    this.cam = cam;
    const controller = new PlayerController(player, cam);
    this.controller = controller;
    cam.snap();

    // ---- events ----
    this.events = G.events.scope();
    this.events.on('player:releaseRequested', () => {
      if (this.player?.isDead) releaseLocalPlayer(this.controller, this.player, this.spawnPoint.x, this.spawnPoint.z, this.spawnYaw);
    });
    // quest markers ('!' / '?') over the quest givers of the town
    bindQuestMarks(this.events, world);

    // ---- go live (scene-scoped globals last) ----
    G.world = world;
    G.player = player;
    G.camera = cam;
    G.ui.hideLoading();
    G.audio.music('town', 2);
    this.ready = true;
    G.events.emit('ui:zoneName', { title: 'Kuzgunkale', subtitle: 'Kadim Zindanların Kapısı' });
    this.zoneTimer = 4;
    if (p.runSummary) setTimeout(() => G.ui.openPanel('runSummary', p.runSummary), 900);
    G.net.sceneReady('town');
  }

  // ================================================================================================
  // Points of interest
  // ================================================================================================

  private async spawnPOIs(world: World, defs: NpcDef[], built: SceneTown, usingDefaults: boolean): Promise<void> {
    const jobs: Promise<void>[] = [];
    const anchors = built.anchors;
    const pois = built.pois;
    let fontPos: [number, number] | null = null;

    /** Position (optional), load, add to the world; failures never break the scene. */
    const queue = (e: Entity, load: () => Promise<void>, x?: number, z?: number, rotRad?: number): void => {
      if (x !== undefined && z !== undefined) e.position.set(x, world.groundY(x, z), z);
      if (rotRad !== undefined) e.object3d.rotation.y = rotRad;
      jobs.push(
        load().then(
          () => {
            world.add(e);
          },
          (err) => console.warn('[town] could not load POI', err),
        ),
      );
    };

    // our default portals replace the builder's single central arch
    if (usingDefaults) {
      const arch = anchors?.get('mplus_portal');
      if (arch) arch.visible = false;
    }

    for (const d of defs) {
      const [x, , z] = d.pos;
      const rot = ((d.rot ?? 0) * Math.PI) / 180;
      const id = d.id;
      if (d.role === 'portal') {
        const e = new DungeonPortal(world.allocLocalId(), { dungeonId: d.dungeonId ?? id.replace(/^portal_/, ''), name: d.name, minLevel: d.unlockLevel });
        queue(e, () => e.load(), x, z, rot);
      } else if (d.role === 'lobby') {
        const e = new LobbyObelisk(world.allocLocalId());
        const anchor = anchors?.get('lobby_obelisk');
        const near = anchor && Math.hypot(anchor.position.x - x, anchor.position.z - z) < 12 ? anchor : undefined;
        queue(e, () => e.load(near), near ? undefined : x, near ? undefined : z, near ? undefined : rot);
      } else if (id.startsWith('obj_kukla') || d.model === 'dummy') {
        const kind: DummyKind = /5/.test(id) || /grup/i.test(d.name) ? 'small' : /boss/i.test(d.name) || id.endsWith('_4') ? 'boss' : /elit/i.test(d.name) || id.endsWith('_3') ? 'elite' : 'normal';
        const group = kind === 'small' && /_5$/.test(id) ? 5 : 1; // a single 'obj_kukla_5' entry stands for the whole group of five
        for (let k = 0; k < group; k++) {
          const a = (k / group) * Math.PI * 2 + 0.4;
          const dx = group > 1 ? Math.cos(a) * 2.4 : 0, dz = group > 1 ? Math.sin(a) * 2.4 : 0;
          const dm = new TrainingDummy(world.allocLocalId(), kind);
          queue(dm, () => dm.loadModel(), x + dx, z + dz, rot);
        }
      } else if (id === 'obj_seref_tasi' || (d.model === 'prop' && d.role === 'citizen')) {
        const parts: PanelPropOpts['parts'] = d.object
          ? [
              { url: d.object.model, scale: d.object.scale },
              ...(d.object.extra ?? []).map((x2) => ({ url: x2.model, scale: x2.scale, pos: x2.pos, spin: 0.9, bob: 0.08 })),
            ]
          : [{ url: propUrl('altar'), scale: 0.9 }, { url: propUrl('crystal_purple'), scale: 0.55, pos: [0, 1.7, 0] as [number, number, number], spin: 0.9, bob: 0.08 }];
        const e = new PanelProp(world.allocLocalId(), {
          parts, name: d.name || 'Şeref Taşı', sub: d.title ?? 'Mitik+ puanı ve en iyi koşular',
          prompt: id === 'obj_seref_tasi' ? 'Şeref Taşı: Mitik+ Puanı' : `${d.name}: ${d.title ?? 'Aç'}`, panel: d.ui?.panel ?? 'mplusInfo',
          data: d.ui?.tab ? { tab: d.ui.tab } : undefined, // e.g. the Kadim Yarık Taşı opens the finder on its fissure tab
          color: id === 'obj_yarik_tasi' ? '#c98cff' : '#d9a8ff', light: 20, block: 1.5, labelY: 3.9,
        });
        queue(e, () => e.load(), x, z, rot);
      } else if (id.startsWith('obj_')) {
        continue; // archery targets and other decor are the world module's business
      } else if (d.role === 'bounty') {
        const npc = new NPC(world.allocLocalId(), d);
        queue(npc, () => npc.load(), x, z, rot);
        // the notice board stands next to the bounty keeper (the builder already draws it: we only add interaction)
        const board = new BountyBoard(world.allocLocalId());
        const bp = pois?.noticeBoard ?? { x: x - 2.4 * Math.cos(rot), z: z + 2.4 * Math.sin(rot) };
        queue(board, () => board.load(!!pois), bp.x, bp.z, 0);
      } else {
        if (d.role === 'keystone' && !/tarhan|vault/i.test(id) && !fontPos) fontPos = [x, z - 10];
        const npc = new NPC(world.allocLocalId(), d);
        queue(npc, () => npc.load(), x, z, rot);
      }
    }

    // Font of Power between the keystone master and the portal arc (adopts the builder's model when it has one)
    const font = new FontOfPower(world.allocLocalId());
    const fa = anchors?.get('font_of_power');
    if (fa) queue(font, () => font.load(fa));
    else {
      const fp = pois ? [pois.fontOfPower.x, pois.fontOfPower.z] : (fontPos ?? [0, -44]);
      queue(font, () => font.load(), fp[0], fp[1], 0);
    }
    // invisible interaction stand-ins for chests the content module placed as plain props: the weekly vault chest and the stash chests
    for (const pr of TOWN.props) {
      if (!pr.id) continue;
      if (pr.id === 'vault_chest') {
        const e = new PanelProp(world.allocLocalId(), {
          parts: [], name: 'Kadim Hazine', sub: 'Haftalık ödül kasası', prompt: 'Kadim Hazine: Haftalık Kasa', panel: 'mplusInfo', color: '#ffd24a', block: 0, range: 3.2, labelY: 2.5,
        });
        queue(e, () => e.load(), pr.pos[0], pr.pos[2]);
      } else if (pr.id.startsWith('stash_chest_')) {
        const mid = pr.id.endsWith('_14');
        const e = new PanelProp(world.allocLocalId(), {
          parts: [], name: 'Depo', sub: 'Eşyalarını sakla', prompt: 'Depoyu Aç', panel: 'stash', color: '#c9a878', block: 0, range: 2.6, labelY: 1.7, noLabel: !mid,
        });
        queue(e, () => e.load(), pr.pos[0], pr.pos[2]);
      }
    }
    await Promise.all(jobs);
  }

  // ================================================================================================

  update(dt: number): void {
    if (!this.ready) return;
    this.controller?.update(dt);
    this.world?.update(dt);
    this.built?.update(dt);
    const p = this.player;
    if (p && this.built?.sunFollow) this.built.sunFollow(p.position);
    // Nav-grid wall pull-in (ThirdPersonCamera.collide) treats every blocked nav cell as a wall, including the low market props
    // (barrels, fences, stalls, wagons) the camera sits above: in the open town it would yank the view in for no reason. There the
    // camera is kept in front of the real geometry instead (cam.occluders, set at spawn), which knows the heights. The enclosed
    // Kadim Kapılar Salonu keeps the nav pull-in too; dungeons always keep it on.
    if (this.cam && p) this.cam.collide = p.position.z < -27 && Math.abs(p.position.x) < 26;
    this.cam?.update(dt);
    this.checkExits(dt);
    this.reaper.update(this.scene, dt);
    // zone banner
    this.zoneTimer -= dt;
    if (p && this.zoneTimer <= 0) {
      this.zoneTimer = 0.5;
      const z = ZONES.find((zz) => zz.test(p.position.x, p.position.z))?.name ?? 'Ana Yol';
      if (z !== this.zone) {
        this.zone = z;
        G.events.emit('ui:zoneName', { title: z, subtitle: 'Kuzgunkale' });
      }
    }
  }

  /** Walk-out triggers of TownDef.exits (the south gate leads to the open world, Sisli Koru). */
  private checkExits(dt: number): void {
    const p = this.player;
    const exits = TOWN.exits;
    if (!p || !exits?.length || this.exiting) return;
    this.exitCooldown -= dt;
    if (this.exitCooldown > 0 || p.isDead) return;
    for (const ex of exits) {
      const [x0, z0, x1, z1] = ex.box;
      if (p.position.x < x0 || p.position.x > x1 || p.position.z < z0 || p.position.z > z1) continue;
      this.exitCooldown = 4;
      void this.takeExit(ex.to);
      return;
    }
  }

  /**
   * Why a town exit is closed right now (null = open). Doğu Kapısı (Karakır Bozkırı) opens after the quest `mq_19` or at
   * level 30 (GDD_OPENWORLD §9.3); a zone without a definition is not ready yet.
   */
  private exitLock(to: string): string | null {
    const ch = G.character;
    if (!ch) return 'Karakter yok.';
    if (to === 'karakir_bozkiri') {
      const questDone = ch.save.flags['q.mq_19_kuzgunkaleye_donus'] === 'done';
      if (!questDone && ch.level < 30) return 'Seviye 30 gerekli: Doğu Kapısı mühürlü (Kuzgunkale\'ye dönüş görevini bitirince de açılır).';
    }
    // WP-07: Kızıl Sınır (PvP) needs level 35; the zone runtime sends an under-levelled party member back
    if (to === PVP_ZONE_ID && ch.level < PVP_MIN_LEVEL) return `Seviye ${PVP_MIN_LEVEL} gerekli: Kızıl Sınır'a yalnızca kıdemli savaşçılar girebilir.`;
    if (!getDungeon(to)) return 'Bu kapı henüz açılmadı.';
    return null;
  }

  private async takeExit(to: string): Promise<void> {
    const ch = G.character;
    if (!ch) return;
    const lock = this.exitLock(to);
    if (lock) {
      G.ui.toast(lock, 'info');
      return;
    }
    // only the room host moves a party; guests are asked to stay (the host decides together with everybody)
    if (G.net.isPartyGuest) {
      G.ui.toast('Güney Kapısı\'ndan yalnızca oda sahibi çıkış başlatabilir.', 'info');
      return;
    }
    const def = getDungeon(to);
    if (!def) return;
    const [lo, hi] = def.levelRange;
    const lvl = ch.level;
    if (lvl > hi + 6) G.ui.toast(`${def.name}: buradaki yaratıklar sana göre çok zayıf (Sv. ${lo}-${hi}).`, 'info');
    this.exiting = true;
    G.ui.toast(`${def.name} bölgesine çıkılıyor...`, 'info');
    G.audio.play('portal_enter', { volume: 0.5 });
    // open-world maps: the party appears at the map's entry, the north edge (tile 80,1 of Sisli Vadi), which is the Kuzgunkale side
    // of the valley, i.e. the world spawn of the South Gate; other zones keep the old trip
    const params: DungeonParams = isOpenWorld(to)
      ? openWorldParams(to, { type: 'gate', id: to === 'karakir_bozkiri' ? 'dogu_kapisi' : to === PVP_ZONE_ID ? 'bati_kapisi' : SOUTH_GATE_ID })
      : {
          dungeonId: to, difficulty: 'normal', keyLevel: 0, seed: (Math.random() * 0x7fffffff) >>> 0 || 1, affixes: [],
          enemyLevel: Math.max(lo, Math.min(hi, lvl)), partySize: Math.max(1, G.net.partySize || 1), keyOwner: G.net.selfId,
        };
    try {
      G.net.requestScene('dungeon', params);
    } catch (e) {
      console.warn('[town] exit failed', e);
      this.exiting = false;
    }
  }

  exit(): void {
    this.ready = false;
    this.reaper.flush(this.scene);
    this.events?.dispose();
    this.events = null;
    this.controller?.dispose();
    this.controller = null;
    this.cam?.dispose();
    this.cam = null;
    G.world = null;
    G.player = null;
    G.camera = null;
    unmountMarket();
    this.world?.dispose();
    this.world = null;
    this.built?.dispose();
    this.built = null;
    this.player = null;
    this.scene.clear();
  }
}
