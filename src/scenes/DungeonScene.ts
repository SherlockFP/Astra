import * as THREE from 'three';
import type { GameScene } from '../core/SceneManager';
import { G } from '../game/G';
import { PlayerController } from '../game/PlayerController';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { collectFadeOccluders } from '../camera/OccluderFade';
import { Player } from '../entities/Player';
import { characterAssetUrls } from '../entities/CharacterModel';
import { enemyAssetUrls, spawnEnemy } from '../entities/EnemyFactory';
import type { Enemy } from '../entities/Enemy';
import { getDirector } from '../ai/EnemyDirector';
import { assignChampions } from '../ai/champion';
import { Chest, chestTierForKey, CursedChest, ExitPortal, InteractableProp, PanelProp, Shrine, SHRINES, Waypoint, type ShrineType } from '../entities/interactables';
import { ZoneEvents } from './ZoneEvents';
import { WorldRuntime } from './world/WorldRuntime';
import { initLadder } from './world/Ladder';
import { WORLD_SPAWNS } from '../ai/bosses/world';
import { npcModelUrl, resolvePreset } from '../entities/NPC';
import { DungeonHazards } from './Hazards';
import { PropGameplay } from './PropGameplay';
import { PackWatch } from './PackWatch';
import { StartBarrier } from './StartBarrier';
import { clearSceneAnchors, setSceneAnchors } from './anchors';
import { sceneFlow } from './flow';
import { World } from '../world/World';
import { buildDungeon, dungeonAssetUrls, type BuiltDungeon, type BuiltProp, type DungeonGate } from '../world/DungeonBuilder';
import { getDungeon } from '../data/dungeons';
import { DUNGEON_ENEMY_ID_BASE, PARTY_ID_BASE, type EntityId } from '../types/common';
import { TILE_SIZE, type BossPlacement, type DungeonDef, type PackDef } from '../types/dungeons';
import type { RunState } from '../types/mythic';
import type { EventScope } from '../core/EventBus';
import { RNG, hashString } from '../core/utils';
import { releaseLocalPlayer } from './respawn';
import { propUrl, SkeletonReaper } from './SceneKit';
import type { DungeonParams } from './scenes';

const tileToWorld = (c: number): number => (c + 0.5) * TILE_SIZE;

interface BossRec {
  placement: BossPlacement;
  engaged: boolean; // host: gates are closed for the fight (3 s after the pull)
  defeated: boolean;
  entityId: EntityId;
  closeTimer: number | null;
  openTimer: number | null;
}

type RunCompleted = { state: RunState; record: unknown; rewards: unknown[] };

/** Open-world camp bookkeeping (host): respawns the whole camp `respawnSec` after its last member died. */
interface CampRec {
  pack: PackDef;
  members: { defId: string; x: number; z: number; level: number; patrol?: { x: number; z: number }[] }[];
  enemies: Enemy[];
  deadAt: number | null;
  busy: boolean;
}

/**
 * A dungeon run: loading screen -> buildDungeon -> mplus.prepare -> deterministic enemy/boss spawns (ids per ARCHITECTURE) ->
 * local player + camera + controller -> sceneReady -> (host) party loaded -> mplus.begin(). Owns boss gates (host closes /
 * reopens, broadcast on 'gate', clients mirror and re-emit boss events), release/respawn at Diriliş Taşı checkpoints, shrines
 * and chests from DungeonDef.extras, the end-of-run chest + exit portal and the zone-name banner.
 * OWNER: scenes module.
 */
export class DungeonScene implements GameScene {
  readonly id = 'dungeon' as const;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);

  private def!: DungeonDef;
  private params!: DungeonParams;
  private built: BuiltDungeon | null = null;
  private world: World | null = null;
  private player: Player | null = null;
  private cam: ThirdPersonCamera | null = null;
  private controller: PlayerController | null = null;
  private events: EventScope | null = null;
  private netOff: (() => void)[] = [];
  private ready = false;
  private disposed = false;
  /** Frees the GPU bone textures of enemies / NPCs that leave the run (see SkeletonReaper). */
  private reaper = new SkeletonReaper();

  private checkpoint = { x: 0, z: 0, yaw: 0 };
  private bosses = new Map<string, BossRec>();
  private forcesDone = false;
  private shrines = new Map<string, Shrine>();
  private completed: RunCompleted | null = null;
  private rewardSpawned = false;
  private roomName = '';
  private zoneTimer = 0;
  private outdoor = false;
  private camps: CampRec[] = [];
  private campTimer = 2;
  private exitPortalReady = false;
  private zoneEvents: ZoneEvents | null = null;
  private hazards: DungeonHazards | null = null;
  private propGame: PropGameplay | null = null;
  private packWatch: PackWatch | null = null;
  private barrier: StartBarrier | null = null;
  /** Open-world map (DungeonDef.world): camps, metin, rares, bosses, villages... run in WorldRuntime (GDD_OPENWORLD §9.3). */
  private worldRt: WorldRuntime | null = null;
  private isWorld = false;
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  /** Host: has G.mplus.begin() been requested (or is the run already counting)? */
  private beginTried = false;
  private beginClock = 0;

  // ================================================================================================
  async enter(p?: unknown): Promise<void> {
    const params = p as DungeonParams | undefined;
    G.vfx.attach(this.scene, this.camera);
    G.ui.setMode('dungeon');
    const ch = G.character;
    if (!ch) throw new Error('dungeon: no character selected');
    const def = params ? getDungeon(params.dungeonId) : undefined;
    if (!params || !def) {
      G.ui.toast('Bilinmeyen zindan. Şehre dönülüyor...', 'error');
      throw new Error(`dungeon: unknown dungeon ${params?.dungeonId}`);
    }
    this.def = def;
    this.params = params;
    this.outdoor = !!def.outdoor;
    this.isWorld = !!def.world;
    initLadder();
    this.camera.fov = G.settings.data.fov || 60;
    this.camera.updateProjectionMatrix();
    G.ui.showLoading(0.01, def.name, def.loadingImage);
    try {
      ch.recomputeStats();
    } catch (e) {
      console.warn('[dungeon] recomputeStats failed', e);
    }

    const t0 = performance.now();
    const dbg = (m: string) => console.info(`[dungeon] ${m} +${Math.round(performance.now() - t0)}ms`);
    dbg('enter');
    // ---- preload ----
    const defIds = new Set<string>();
    for (const pk of def.packs) for (const m of pk.members) defIds.add(m.enemyId);
    for (const b of def.bosses) defIds.add(b.bossId);
    const npcUrls: string[] = [];
    if (def.world) {
      // open world: every population the runtime can spawn (metin waves, rares, mini-bosses, world bosses, goblins, village NPCs)
      for (const t of def.world.metin.tiers) defIds.add(t.enemyId);
      for (const r of def.world.rares) defIds.add(r.enemyId);
      for (const m of def.world.minibosses) defIds.add(m.enemyId);
      for (const b of def.world.bosses) defIds.add(b.bossId);
      for (const ids of Object.values(WORLD_SPAWNS)) for (const id of ids) defIds.add(id);
      defIds.add('treasure_goblin');
      for (const v of def.world.villages) for (const n of v.npcs) if (!n.decor && !n.object) npcUrls.push(npcModelUrl(resolvePreset(n).base));
    }
    const urls = new Set<string>([...dungeonAssetUrls(def), ...enemyAssetUrls([...defIds]), ...characterAssetUrls(ch.classId), ...npcUrls]);
    for (const n of ['waypoint_stone', 'mplus_portal', 'chest_wood', 'chest_iron', 'chest_gold', 'chest_epic', 'crystal_blue', 'crystal_purple', 'font_of_power']) urls.add(propUrl(n));
    urls.add('/assets/models/kenney/graveyard-kit/altar-stone.glb');
    await G.assets.loadMany([...urls], (l, t) => G.ui.showLoading(0.02 + 0.28 * (l / t), def.name, def.loadingImage));

    dbg('assets loaded');
    // ---- build ----
    G.ui.showLoading(0.32, def.name, def.loadingImage);
    const built = await buildDungeon(def, this.scene);
    this.built = built;
    dbg('built');
    this.disposeCheck();
    G.ui.showLoading(0.5, def.name, def.loadingImage);
    const world = new World(this.scene, built.nav);
    this.world = world;

    // run state must exist on EVERY peer before enemies spawn (scaling, affixes)
    G.mplus.prepare(params);

    // ---- player ----
    // open world: a run that came back from a world entrance appears in front of that entrance (GDD_OPENWORLD §9.3)
    const arrival = this.isWorld ? this.arrivalOf(def, built, params) : null;
    const startYaw = arrival?.yaw ?? built.startYaw;
    const slot = G.net.localSlot;
    const right = new THREE.Vector3(Math.cos(startYaw), 0, -Math.sin(startYaw));
    const off = ((slot % 5) - 2) * 1.6;
    const origin = arrival ?? { x: built.start.x, z: built.start.z };
    let sx = origin.x + right.x * off, sz = origin.z + right.z * off;
    const fix = built.nav.nearestWalkable(sx, sz);
    if (fix) {
      sx = fix.x;
      sz = fix.z;
    }
    this.checkpoint = { x: built.start.x, z: built.start.z, yaw: startYaw };
    const player = new Player({
      id: PARTY_ID_BASE + slot, slot, classId: ch.classId, name: ch.save.name, level: ch.level, isLocal: true, peerId: G.net.selfId, character: ch,
    });
    player.position.set(sx, world.groundY(sx, sz), sz);
    player.yaw = startYaw;
    await player.loadModel();
    try {
      player.refreshStats();
      player.hp = player.maxHp;
    } catch (e) {
      console.warn('[dungeon] player stats failed', e);
    }
    world.add(player);
    world.localPlayer = player;
    this.player = player;
    this.disposeCheck();

    // ---- start checkpoint stone (always active) ----
    if (!this.outdoor) await this.spawnWaypoint(built.start.x - Math.sin(startYaw) * 3.2, built.start.z - Math.cos(startYaw) * 3.2, startYaw, true);

    dbg('player ready');
    // ---- enemies & bosses: deterministic ids on every peer ----
    const watch = new PackWatch(world);
    this.packWatch = watch;
    world.addSystem(watch);
    // open world: nothing is spawned up front, WorldRuntime streams camps and the other populations from the host
    if (!this.isWorld) await this.spawnEnemies(world, built, params);
    watch.arm();
    this.disposeCheck();
    // seeded champion packs: Normal / Heroic / Mythic 0 only (never Mythic+, never the open world), identical on every peer
    if (!this.outdoor && params.difficulty !== 'mythicplus') {
      try {
        assignChampions(world, params.seed);
      } catch (e) {
        console.warn('[dungeon] champions failed', e);
      }
    }
    // the open world has its return gate from the very first second
    if (this.outdoor) await this.spawnExitPortal();

    dbg('enemies spawned');
    // ---- props: shrines, chests, ambience ----
    await this.spawnExtras(world, built, params);
    await this.spawnZoneExtras(world, built, params);
    this.spawnAmbient(def, built);
    this.spawnPropSystems(world, built, params);
    this.initGates();
    if (this.isWorld) {
      this.spawnWorldEntrances(world, built, def);
      // the local player exists by now (world.localPlayer), the camera does not yet: travel reads it at call time
      this.worldRt = new WorldRuntime({ def, world, built, params, scene: this.scene, teleport: (x, z, yaw) => this.controller?.teleport(x, z, yaw) });
      try {
        await this.worldRt.start();
      } catch (e) {
        console.warn('[dungeon] world runtime failed to start', e);
      }
      this.disposeCheck();
    }

    dbg('extras ready');
    // ---- camera + controller ----
    const cam = new ThirdPersonCamera(this.camera);
    cam.setTarget(player.object3d);
    cam.yaw = startYaw + Math.PI;
    // solid scenery (walls, pillars, trees, rocks, cliffs, buildings) between the lens and the player fades out instead of
    // filling the screen; floors and grass never do (camera/OccluderFade.ts)
    cam.occluders = collectFadeOccluders(built.root);
    cam.occluderMode = 'fade';
    this.cam = cam;
    this.controller = new PlayerController(player, cam);
    cam.snap();

    // ---- events + net ----
    this.hookEvents();

    // ---- go live ----
    G.world = world;
    G.player = player;
    G.camera = cam;
    G.ui.hideLoading();
    G.audio.music(def.theme.music, 2);
    this.ready = true;
    // open world: WorldRuntime announces the region the player stands in (started before this point)
    if (!this.isWorld) G.events.emit('ui:zoneName', { title: def.name, subtitle: def.lore ? def.lore.split('.')[0] : undefined });
    this.zoneTimer = 4;
    G.net.sceneReady('dungeon');
    if (G.net.isAuthority) {
      // NOTE: SceneManager.current is still null while enter() runs (and offline this promise resolves in the very same tick), so
      // the guard is the scene's own `ready` flag, never `G.scenes.current === this` (that made offline runs never start).
      void G.net.waitForPartyLoaded('dungeon').then(() => this.tryBegin());
    }
  }

  /** Host / offline: start the run clock (idempotent: MythicPlus.begin ignores a second call). */
  private tryBegin(): void {
    if (this.disposed || !this.ready || !G.net.isAuthority) return;
    const st = G.mplus.state;
    if (!st) return;
    if (st.started || st.countdown > 0 || st.completed || st.failed) {
      this.beginTried = true;
      return;
    }
    try {
      G.mplus.begin();
    } catch (e) {
      console.warn('[dungeon] mplus.begin failed', e);
    }
    this.beginTried = true;
  }

  private disposeCheck(): void {
    if (this.disposed) throw new Error('dungeon: scene left during loading');
  }

  // ================================================================================================
  // Spawning
  // ================================================================================================

  private async spawnEnemies(world: World, built: BuiltDungeon, params: DungeonParams): Promise<void> {
    interface Job {
      id: number; defId: string; x: number; z: number; packId: string | null; facing?: number; level: number;
      patrol?: { x: number; z: number }[]; dormant?: boolean; stealth?: boolean; camp?: CampRec;
    }
    const jobs: Job[] = [];
    let index = 0;
    const snap = (tx: number, tz: number): { x: number; z: number } => {
      const x = tileToWorld(tx), z = tileToWorld(tz);
      return built.nav.nearestWalkable(x, z, 16) ?? { x, z };
    };
    const authority = G.net.isAuthority;
    let director: ReturnType<typeof getDirector> | null = null;
    if (authority) {
      try {
        director = getDirector(world);
      } catch {
        director = null;
      }
    }
    for (const pk of this.def.packs) {
      // PackDef extras: patrol loop (tile -> world), dormant start, linked pulls, open-world level ranges + respawn camps
      const patrol = pk.patrol?.length ? pk.patrol.map(([tx, tz]) => snap(tx, tz)) : undefined;
      if (director) for (const l of pk.linkedTo ?? []) director.linkPacks(pk.id, l);
      // dormant packs wake as a whole when a player is within `wakeRadius` of the pack centre (PackWatch, host)
      if (pk.dormant) this.packWatch?.addDormant(pk, tileToWorld(pk.center[0]), tileToWorld(pk.center[1]));
      let camp: CampRec | undefined;
      if (this.outdoor && authority && pk.respawnSec) {
        camp = { pack: pk, members: [], enemies: [], deadAt: null, busy: false };
        this.camps.push(camp);
      }
      let k = 0;
      for (const m of pk.members) {
        const sp = snap(pk.center[0] + m.offset[0], pk.center[1] + m.offset[1]);
        const level = pk.levelRange ? new RNG(hashString(`${params.seed}:${pk.id}:${k}`)).int(pk.levelRange[0], pk.levelRange[1]) : params.enemyLevel;
        k++;
        jobs.push({ id: DUNGEON_ENEMY_ID_BASE + index++, defId: m.enemyId, x: sp.x, z: sp.z, packId: pk.id, level, patrol, dormant: pk.dormant ? true : undefined, stealth: pk.stealth, camp });
        camp?.members.push({ defId: m.enemyId, x: sp.x, z: sp.z, level, patrol });
      }
    }
    for (const b of this.def.bosses) {
      const sp = snap(b.pos[0], b.pos[1]);
      const id = DUNGEON_ENEMY_ID_BASE + index++;
      jobs.push({ id, defId: b.bossId, x: sp.x, z: sp.z, packId: null, facing: ((b.facing ?? 0) * Math.PI) / 180, level: params.enemyLevel });
      this.bosses.set(b.bossId, { placement: b, engaged: false, defeated: false, entityId: id, closeTimer: null, openTimer: null });
    }
    let done = 0;
    const CHUNK = 14;
    for (let i = 0; i < jobs.length; i += CHUNK) {
      await Promise.all(
        jobs.slice(i, i + CHUNK).map(async (j) => {
          try {
            const e = await spawnEnemy(world, j.defId, { x: j.x, z: j.z }, {
              id: j.id, level: j.level, packId: j.packId, facing: j.facing, patrol: j.patrol, dormant: j.dormant,
            });
            if (e && j.camp) j.camp.enemies.push(e);
            if (e && j.stealth) this.packWatch?.stealthify(e);
          } catch (e) {
            console.warn(`[dungeon] enemy ${j.defId} failed to spawn`, e);
          }
          done++;
        }),
      );
      G.ui.showLoading(0.55 + 0.4 * (done / Math.max(1, jobs.length)), this.def.name, this.def.loadingImage);
      this.disposeCheck();
    }
  }

  /** Host: camps of the open world come back after their respawn timer (dynamic host ids are replicated by spawnEnemy). */
  private updateCamps(dt: number): void {
    if (!this.camps.length || !this.world || !G.net.isAuthority) return;
    this.campTimer -= dt;
    if (this.campTimer > 0) return;
    this.campTimer = 1;
    const world = this.world;
    const now = world.time;
    for (const c of this.camps) {
      if (c.busy || !c.enemies.length) continue; // (a camp whose defs failed to spawn never retries)
      if (c.enemies.some((e) => !e.isDead && !e.removed)) {
        c.deadAt = null;
        continue;
      }
      if (c.deadAt === null) {
        c.deadAt = now;
        continue;
      }
      if (now - c.deadAt < (c.pack.respawnSec ?? 60)) continue;
      const m0 = c.members[0];
      if (!m0) continue;
      // never pop a camp into the players' faces (the camp's own radius counts: a wide camp is visible from further away)
      const safe = Math.max(30, (c.pack.radius ?? 0) + 24);
      if (world.players.some((pl) => !pl.isDead && Math.hypot(pl.position.x - m0.x, pl.position.z - m0.z) < safe)) continue;
      c.busy = true;
      void (async () => {
        const out: Enemy[] = [];
        for (const m of c.members) {
          try {
            const e = await spawnEnemy(world, m.defId, { x: m.x, z: m.z }, { level: m.level, packId: c.pack.id, patrol: m.patrol });
            if (e) out.push(e);
          } catch (err) {
            console.warn('[dungeon] camp respawn failed', err);
          }
        }
        c.enemies = out;
        c.deadAt = null;
        c.busy = false;
      })();
    }
  }

  private async spawnExtras(world: World, built: BuiltDungeon, params: DungeonParams): Promise<void> {
    const ex = this.def.extras;
    const jobs: Promise<void>[] = [];
    /**
     * Place an interactable. When the content module already drew a prop at the spot (`at`: the builder's altar / chest), the
     * interactable takes that prop's exact position + yaw and the builder prop is hidden (it would be a second, z-fighting copy;
     * hide() also re-opens the nav cells the prop blocked — the interactable blocks its own footprint again).
     */
    const place = <T extends InteractableProp>(e: T, tx: number, tz: number, yaw = 0, at?: BuiltProp | null): T => {
      const s = at ? { x: at.x, z: at.z } : built.nav.nearestWalkable(tileToWorld(tx), tileToWorld(tz), 6) ?? { x: tileToWorld(tx), z: tileToWorld(tz) };
      e.position.set(s.x, world.groundY(s.x, s.z), s.z);
      e.object3d.rotation.y = at ? at.rot : yaw;
      at?.hide();
      jobs.push(
        (e as unknown as { load(): Promise<void> }).load().then(
          () => void world.add(e),
          (err) => console.warn('[dungeon] extra failed to load', err),
        ),
      );
      return e;
    };
    /** Nearest visible built prop within `maxD` metres of a tile position that satisfies `pred`. */
    const propNear = (tx: number, tz: number, maxD: number, pred: (p: BuiltProp) => boolean): BuiltProp | null => {
      const x = tileToWorld(tx), z = tileToWorld(tz);
      let best: BuiltProp | null = null, bd = maxD;
      for (const p of built.props) {
        if (p.hidden || !pred(p)) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d <= bd) {
          bd = d;
          best = p;
        }
      }
      return best;
    };
    // shrines: M+ fixed types per dungeon, otherwise seeded per run (greed: Normal/Heroic only, wisdom: Normal only)
    const diff = params.difficulty;
    const pool: ShrineType[] = ['shrine_power', 'shrine_haste', 'shrine_ward'];
    if (diff === 'normal' || diff === 'heroic') pool.push('shrine_greed');
    if (diff === 'normal') pool.push('shrine_wisdom');
    (ex?.shrines ?? []).forEach((s, i) => {
      let type: ShrineType = s.type;
      if (diff !== 'mythicplus') type = new RNG(hashString(`${params.seed}:shrine:${i}`)).pick(pool);
      else if (type === 'shrine_greed' || type === 'shrine_wisdom') type = 'shrine_power';
      const key = `s${i}`;
      // the builder draws altar + floating crystal (+ candle ring, which stays) for this spot: our Shrine replaces the first two
      const altar = propNear(s.pos[0], s.pos[1], 3.2, (p) => p.tag === 'shrine');
      if (altar?.id) built.propById(`${altar.id}_crystal`)?.hide();
      const sh = place(new Shrine(world.allocLocalId(), { key, type }), s.pos[0], s.pos[1], new RNG(i + 7).next() * 6.28, altar);
      this.shrines.set(key, sh);
    });
    // fixed treasure chests: personal loot, each peer opens its own copy
    (ex?.chests ?? []).forEach((c, i) => {
      const tier = c.kind === 'chest_gold' ? 'gold' : c.kind === 'chest_iron' ? 'iron' : 'wood';
      const chest: Chest = new Chest(world.allocLocalId(), { tier, onOpen: (ch, first) => first && this.rollTreasure(ch, params) });
      const model = propNear(c.pos[0], c.pos[1], 2.4, (p) => p.tag === 'chest' || (p.tag === 'breakable' && /chest/.test(p.id ?? '')));
      place(chest, c.pos[0], c.pos[1], new RNG(i + 31).next() * 6.28, model);
    });
    // any other chest the content module placed as a plain tagged prop (e.g. the open world's cave chest) becomes a real chest too;
    // the Lanetli Sandık spots are handled by spawnZoneExtras
    for (const bp of built.props) {
      if (bp.tag !== 'chest' || bp.hidden || (bp.id ?? '').startsWith('cursed_chest_')) continue;
      const m = bp.model.toLowerCase();
      const tier = m.includes('chest_gold') ? 'gold' : m.includes('chest_iron') ? 'iron' : 'wood';
      const chest: Chest = new Chest(world.allocLocalId(), { tier, onOpen: (ch, first) => first && this.rollTreasure(ch, params) });
      place(chest, 0, 0, 0, bp);
    }
    // Kehanet Taşı: decorative pedestal that opens the M+ info board
    if (ex?.fontOfPower) {
      place(
        new PanelProp(world.allocLocalId(), {
          parts: [{ url: propUrl('font_of_power'), scale: 0.9 }], name: 'Kehanet Taşı', sub: 'Mitik+ bilgisi', prompt: 'Kehanet Taşı: Mitik+ Bilgisi', panel: 'mplusInfo', color: '#d9a8ff', light: 20, block: 1.2, labelY: 3.0,
        }),
        ex.fontOfPower[0], ex.fontOfPower[1],
      );
    }
    await Promise.all(jobs);
  }

  /** Treasure chest contents (GDD_CONTENT 1.3): one elite drop + gold; in M+ gold and a health globe only. */
  private rollTreasure(chest: Chest, params: DungeonParams): void {
    const lvl = G.character?.level ?? params.enemyLevel;
    const pos = chest.position;
    const gold = Math.round((6 + lvl * 3.2) * 6 * 2);
    G.loot.dropGold(gold, pos);
    if (params.difficulty === 'mythicplus') {
      G.loot.dropGlobe(pos);
      return;
    }
    try {
      G.loot.dropItem(G.loot.rollItem({ itemLevel: params.enemyLevel, classId: G.character?.classId, minRarity: 'uncommon' }), pos, { delay: 0.2 });
    } catch (e) {
      console.warn('[dungeon] chest item roll failed', e);
    }
  }

  private async spawnWaypoint(x: number, z: number, yaw: number, active: boolean): Promise<Waypoint | null> {
    const world = this.world;
    if (!world || !this.built) return null;
    const s = this.built.nav.nearestWalkable(x, z, 6) ?? { x, z };
    const wp = new Waypoint(world.allocLocalId(), {
      active,
      onActivate: (w) => {
        this.checkpoint = { x: w.position.x + Math.sin(w.yaw) * 2.6, z: w.position.z + Math.cos(w.yaw) * 2.6, yaw: w.yaw };
        const fix = this.built?.nav.nearestWalkable(this.checkpoint.x, this.checkpoint.z, 4);
        if (fix) this.checkpoint = { ...this.checkpoint, x: fix.x, z: fix.z };
      },
    });
    wp.position.set(s.x, world.groundY(s.x, s.z), s.z);
    wp.object3d.rotation.y = yaw;
    try {
      await wp.load();
      world.add(wp);
      if (active) wp.activate(true);
    } catch (e) {
      console.warn('[dungeon] waypoint failed', e);
      return null;
    }
    return wp;
  }

  /** Goblin / curse / world-boss set pieces (host-driven) and the open world's static extras. */
  private async spawnZoneExtras(world: World, built: BuiltDungeon, params: DungeonParams): Promise<void> {
    const ev = new ZoneEvents({ world, def: this.def, params, built, outdoor: this.outdoor });
    this.zoneEvents = ev;
    world.addSystem(ev);
    if (!this.outdoor) return;
    const jobs: Promise<void>[] = [];
    const add = (e: InteractableProp & { load(): Promise<void> }, x: number, z: number, yaw: number): void => {
      e.position.set(x, world.groundY(x, z), z);
      e.object3d.rotation.y = yaw;
      jobs.push(
        e.load().then(
          () => void world.add(e),
          (err) => console.warn('[dungeon] zone extra failed', err),
        ),
      );
    };
    // open world: one Lanetli Sandık per region (GDD_OPENWORLD §5.4), the builder's placeholders are not used
    if (this.def.world) {
      this.def.world.cursed.forEach((c, i) => {
        const s = built.nav.nearestWalkable(tileToWorld(c.pos[0]), tileToWorld(c.pos[1]), 6) ?? { x: tileToWorld(c.pos[0]), z: tileToWorld(c.pos[1]) };
        const chest = new CursedChest(world.allocLocalId(), { index: i, onOpen: (cc) => ev.openChest(cc) });
        ev.registerChest(chest);
        add(chest, s.x, s.z, 0.35);
      });
      await Promise.all(jobs);
      return;
    }
    // Lanetli Sandık (GDD 1.8): replaces the builder's placeholder chest at each spot
    [[32, 20], [12, 32]].forEach(([tx, tz], i) => {
      const bp = built.propById(`cursed_chest_${i + 1}`);
      const x = bp ? bp.x : tileToWorld(tx), z = bp ? bp.z : tileToWorld(tz);
      bp?.hide();
      const chest = new CursedChest(world.allocLocalId(), { index: i, onOpen: (c) => ev.openChest(c) });
      ev.registerChest(chest);
      add(chest, x, z, bp?.rot ?? 0.35);
    });
    // sealed crypt door: hint toast (GDD 2.6 "Kemik Mahzeni hint")
    const hint = built.propById('crypt_hint');
    if (hint) {
      const door = new PanelProp(world.allocLocalId(), {
        parts: [], name: 'Mühürlü Kapı', sub: 'Eski mezar', prompt: 'Kapıyı İncele', panel: '', message: 'Kapı mühürlü. Kuzgunkale\'deki Kadim Kapılar Salonu\'ndan girilebilir.',
        color: '#9fffd0', block: 0, range: 3.6, labelY: 3.2,
      });
      add(door, hint.x, hint.z - 6, 0);
    }
    await Promise.all(jobs);
  }

  /**
   * Open world: where the party appears when it came back from a world entrance: a step in front of that door (the door faces
   * `facing`, degrees). Null for every other spawn (the map start). Yaw looks back at the door.
   */
  private arrivalOf(def: DungeonDef, built: BuiltDungeon, params: DungeonParams): { x: number; z: number; yaw: number } | null {
    const sp = params.spawn;
    if (!sp || sp.type !== 'entrance') return null;
    const en = def.world?.entrances.find((e) => e.id === sp.id);
    if (!en) return null;
    const s = built.nav.nearestWalkable(tileToWorld(en.pos[0]), tileToWorld(en.pos[1]), 6);
    if (!s) return null;
    const a = (en.facing * Math.PI) / 180;
    return { x: s.x + Math.sin(a) * 3, z: s.z + Math.cos(a) * 3, yaw: a + Math.PI };
  }

  /**
   * Open world: the dungeon entrances of the map (GDD_OPENWORLD §5.2, §7.7). Each one opens the keystone panel of its dungeon
   * with `returnTo` set, so the run's exit portal brings the party back to this entrance.
   */
  private spawnWorldEntrances(world: World, built: BuiltDungeon, def: DungeonDef): void {
    for (const e of def.world?.entrances ?? []) {
      const tx = tileToWorld(e.pos[0]), tz = tileToWorld(e.pos[1]);
      const s = built.nav.nearestWalkable(tx, tz, 6) ?? { x: tx, z: tz };
      const door = new PanelProp(world.allocLocalId(), {
        parts: [{ url: propUrl('mplus_portal'), scale: 0.5 }],
        name: e.name,
        sub: `Önerilen seviye ${e.minLevel}+`,
        prompt: `${e.name}: Zindana Gir`,
        panel: 'keystone',
        data: { dungeonId: e.dungeonId, returnTo: { dungeonId: def.id, spawn: { type: 'entrance', id: e.id } } },
        color: '#c9a0ff',
        light: 18,
        block: 1.2,
        labelY: 3.4,
      });
      door.position.set(s.x, world.groundY(s.x, s.z), s.z);
      door.object3d.rotation.y = (e.facing * Math.PI) / 180;
      void door.load().then(
        () => void world.add(door),
        (err) => console.warn('[dungeon] world entrance failed', err),
      );
    }
  }

  private spawnAmbient(def: DungeonDef, built: BuiltDungeon): void {
    for (const r of def.rooms) {
      if (!r.ambientVfx) continue;
      const cx = tileToWorld(r.rect.x + r.rect.w / 2 - 0.5), cz = tileToWorld(r.rect.z + r.rect.h / 2 - 0.5);
      try {
        G.vfx.spawn(r.ambientVfx, [cx, 1.4, cz], { scale: Math.max(1, Math.min(4, Math.max(r.rect.w, r.rect.h) / 4)) });
      } catch {
        /* optional */
      }
    }
    void built;
  }

  /**
   * Environment gameplay on top of the built level: named anchors for boss scripts, zone / periodic hazards and breakable props
   * (all World systems that die with the world).
   */
  private spawnPropSystems(world: World, built: BuiltDungeon, params: DungeonParams): void {
    try {
      setSceneAnchors(built.props);
    } catch (e) {
      console.warn('[dungeon] anchors failed', e);
    }
    try {
      const hz = new DungeonHazards({ world, scene: this.scene, def: this.def, built, level: params.enemyLevel });
      this.hazards = hz;
      world.addSystem(hz);
    } catch (e) {
      console.warn('[dungeon] hazards failed', e);
    }
    // Mythic+: the start room is sealed by a shimmering barrier until the 10 s countdown ends (GDD_CONTENT 5.3)
    if (params.difficulty === 'mythicplus' && !this.outdoor) {
      try {
        const sb = new StartBarrier({ world, scene: this.scene, def: this.def, built });
        if (sb.count > 0) {
          this.barrier = sb;
          world.addSystem(sb);
        } else sb.dispose();
      } catch (e) {
        console.warn('[dungeon] start barrier failed', e);
      }
    }
    try {
      const pg = new PropGameplay({ world, scene: this.scene, built, params });
      if (pg.count > 0) {
        this.propGame = pg;
        world.addSystem(pg);
      } else pg.dispose();
    } catch (e) {
      console.warn('[dungeon] prop gameplay failed', e);
    }
  }

  /** Floors of dirt / wood sound like dirt underfoot; stone, tiles, lava rock, ice and temple floors like stone. */
  private footstepFor(): 'footstep_dirt' | 'footstep_stone' {
    if (this.outdoor) return 'footstep_dirt';
    let soft = 0, hard = 0;
    for (const r of this.def.rooms) {
      const area = r.rect.w * r.rect.h;
      if (r.floor === 'dirt' || r.floor === 'wood') soft += area;
      else hard += area;
    }
    return soft > hard ? 'footstep_dirt' : 'footstep_stone';
  }

  // ================================================================================================
  // Boss gates
  // ================================================================================================

  private bossOfGate(g: DungeonGate): BossRec | null {
    for (const b of this.bosses.values()) if (b.placement.roomId === g.a || b.placement.roomId === g.b) return b;
    return null;
  }

  /** null = leave as is. */
  private gateShouldBeOpen(g: DungeonGate): boolean | null {
    if (g.kind === 'forces_lock') return this.forcesDone || !!this.completed;
    const boss = this.bossOfGate(g);
    if (!boss) return null;
    if (g.kind === 'boss_exit') return boss.defeated;
    if (g.kind === 'boss_lock') {
      if (boss.engaged && !boss.defeated) return false;
      for (const o of this.bosses.values()) if (o !== boss && o.placement.order < boss.placement.order && !o.defeated) return false;
      return true;
    }
    return null;
  }

  /** Same deterministic starting state on every peer (no network traffic needed). */
  private initGates(): void {
    const gates = this.built?.gates;
    if (!gates) return;
    for (const g of gates.values()) {
      const want = this.gateShouldBeOpen(g);
      if (want === false) g.close();
    }
  }

  /** Host: reconcile all gates with the boss state, broadcast the changes. */
  private syncGates(): void {
    const gates = this.built?.gates;
    if (!gates) return;
    for (const [key, g] of gates) {
      const want = this.gateShouldBeOpen(g);
      if (want === null || want === g.isOpen) continue;
      if (want) g.open();
      else g.close();
      G.net.broadcast('gate', { key, open: want });
    }
  }

  private bossEvent(type: 'engaged' | 'phase' | 'yell' | 'defeated' | 'wipe', bossId: string, extra: { entityId?: EntityId; text?: string; phase?: string } = {}): void {
    if (!G.net.isAuthority) return; // clients re-emit from the network, never from their own listeners
    G.net.broadcast('gate', { key: '', open: true, bossEvent: { type, bossId, entityId: extra.entityId ?? 0, text: extra.text, phase: extra.phase } });
  }

  private hookEvents(): void {
    const ev = G.events.scope();
    this.events = ev;

    // ---- host: boss lifecycle -> gates + broadcast ----
    ev.on('boss:engaged', (e) => {
      if (!G.net.isAuthority) return;
      this.bossEvent('engaged', e.bossId, { entityId: e.entityId });
      const b = this.bosses.get(e.bossId);
      if (!b || b.defeated) return;
      if (b.openTimer) clearTimeout(b.openTimer);
      b.openTimer = null;
      if (b.closeTimer) clearTimeout(b.closeTimer);
      b.closeTimer = setTimeout(() => {
        b.closeTimer = null;
        if (this.disposed || b.defeated) return;
        b.engaged = true;
        this.syncGates();
      }, 3000);
      this.timeouts.push(b.closeTimer);
    });
    ev.on('boss:phase', (e) => G.net.isAuthority && this.bossEvent('phase', e.bossId, { entityId: e.entityId, phase: e.phase }));
    ev.on('boss:yell', (e) => G.net.isAuthority && this.bossEvent('yell', e.bossId, { text: e.text }));
    ev.on('boss:defeated', (e) => {
      this.onBossDefeated(e.bossId, e.entityId);
      if (G.net.isAuthority) {
        this.bossEvent('defeated', e.bossId, { entityId: e.entityId });
        this.zoneEvents?.onBossDefeated(e.bossId);
      }
    });
    ev.on('boss:wipe', (e) => {
      if (!G.net.isAuthority) return;
      this.bossEvent('wipe', e.bossId);
      const b = this.bosses.get(e.bossId);
      if (!b) return;
      if (b.closeTimer) clearTimeout(b.closeTimer);
      b.closeTimer = null;
      // the doors open 5 s after a wipe (GDD 0.7)
      b.openTimer = setTimeout(() => {
        b.openTimer = null;
        if (this.disposed) return;
        b.engaged = false;
        this.syncGates();
      }, 5000);
      this.timeouts.push(b.openTimer);
    });
    ev.on('run:forces', (e) => {
      if (!G.net.isAuthority) return;
      if (e.forces >= e.required && !this.forcesDone) {
        this.forcesDone = true;
        this.syncGates();
      }
    });

    // ---- run completion: chest + exit portal on every peer ----
    ev.on('run:completed', (e) => {
      this.completed = e as RunCompleted;
      this.forcesDone = true;
      if (G.net.isAuthority) this.syncGates();
      void this.spawnReward(e as RunCompleted);
    });

    // ---- footsteps: PlayerController resets footstepSfx on 'scene:changed' (stone for every non-town scene), so the theme
    // override must come AFTER it: this listener registered later runs later ----
    const steps = this.footstepFor();
    ev.on('scene:changed', (e) => {
      if (e.to === 'dungeon' && this.player) this.player.footstepSfx = steps;
    });

    // ---- death -> release ----
    ev.on('player:releaseRequested', () => {
      const p = this.player;
      if (!p?.isDead) return;
      const st = G.mplus.state;
      // Mythic+ always respawns at the dungeon start (GDD_CONTENT 0.7); other modes at the latest checkpoint
      // open world: the last waypoint stone / village this character activated (WorldRuntime.respawnPoint)
      const cp = this.worldRt
        ? this.worldRt.respawnPoint()
        : st && st.difficulty === 'mythicplus' && this.built ? { x: this.built.start.x, z: this.built.start.z, yaw: this.built.startYaw } : this.checkpoint;
      const fix = this.built?.nav.nearestWalkable(cp.x, cp.z, 6);
      releaseLocalPlayer(this.controller, p, fix?.x ?? cp.x, fix?.z ?? cp.z, cp.yaw);
    });

    // ---- clients mirror the host's gates / boss events / shrine use ----
    this.netOff.push(
      G.net.on('gate', (m) => {
        if (m.bossEvent) {
          const b = m.bossEvent;
          switch (b.type) {
            case 'engaged': G.events.emit('boss:engaged', { bossId: b.bossId, entityId: b.entityId }); break;
            case 'phase': G.events.emit('boss:phase', { bossId: b.bossId, entityId: b.entityId, phase: b.phase ?? '' }); break;
            case 'yell': G.events.emit('boss:yell', { bossId: b.bossId, text: b.text ?? '' }); break;
            case 'defeated': G.events.emit('boss:defeated', { bossId: b.bossId, entityId: b.entityId }); break;
            case 'wipe': G.events.emit('boss:wipe', { bossId: b.bossId }); break;
          }
        }
        if (!m.key) return;
        if (m.key.startsWith('ev:')) {
          // open world: announcements belong to WorldRuntime; the Lanetli Sandık waves stay with ZoneEvents
          if (this.worldRt && !m.key.startsWith('ev:curse')) this.worldRt.handleMessage(m.key);
          else this.zoneEvents?.handleMessage(m.key);
          return;
        }
        if (m.key.startsWith('hz:')) {
          this.hazards?.handleMessage(m.key);
          return;
        }
        if (m.key.startsWith('shrine:')) {
          this.shrines.get(m.key.slice(7))?.activate(false);
          return;
        }
        const g = this.built?.gates.get(m.key);
        if (g && g.isOpen !== m.open) {
          if (m.open) g.open();
          else g.close();
        }
      }),
    );
  }

  /** Every peer: mark the boss, drop a Diriliş Taşı behind its exit door (except the last boss) and reopen gates on the host. */
  private onBossDefeated(bossId: string, entityId: EntityId): void {
    const b = this.bosses.get(bossId);
    if (!b || b.defeated) return;
    b.defeated = true;
    b.engaged = false;
    if (b.closeTimer) clearTimeout(b.closeTimer);
    if (b.openTimer) clearTimeout(b.openTimer);
    b.closeTimer = b.openTimer = null;
    if (G.net.isAuthority) this.syncGates();
    const last = [...this.bosses.values()].every((o) => o.defeated);
    if (last || this.outdoor) return;
    // checkpoint stone just past the boss_exit door, else beside the boss's death spot
    let x = 0, z = 0, yaw = 0;
    const gate = [...(this.built?.gates.values() ?? [])].find((g) => g.kind === 'boss_exit' && this.bossOfGate(g) === b);
    const boss = this.world?.get(entityId) ?? this.world?.get(b.entityId);
    if (gate && boss) {
      const dx = gate.center.x - boss.position.x, dz = gate.center.z - boss.position.z;
      const len = Math.hypot(dx, dz) || 1;
      x = gate.center.x + (dx / len) * 3.4;
      z = gate.center.z + (dz / len) * 3.4;
      yaw = Math.atan2(-dx, -dz);
    } else if (boss) {
      x = boss.position.x + 4;
      z = boss.position.z;
    } else return;
    void this.spawnWaypoint(x, z, yaw, false);
  }

  // ================================================================================================
  // End of run
  // ================================================================================================

  /** The way home: always there in the open world, appears with the end chest in dungeons. */
  private async spawnExitPortal(): Promise<{ x: number; z: number; yaw: number } | null> {
    const world = this.world, built = this.built;
    if (!world || !built) return null;
    const ex = built.exit;
    const toStart = Math.atan2(built.start.x - ex.x, built.start.z - ex.z);
    const px = built.nav.nearestWalkable(ex.x, ex.z, 6) ?? { x: ex.x, z: ex.z };
    if (this.exitPortalReady) return { x: px.x, z: px.z, yaw: toStart };
    this.exitPortalReady = true;
    const portal = new ExitPortal(world.allocLocalId(), { spawnAt: this.outdoor ? 'south' : 'portal', returnTo: this.params.returnTo });
    portal.position.set(px.x, world.groundY(px.x, px.z), px.z);
    portal.object3d.rotation.y = toStart;
    try {
      await portal.load();
      if (this.disposed) return null;
      world.add(portal);
    } catch (e) {
      console.warn('[dungeon] exit portal failed', e);
    }
    return { x: px.x, z: px.z, yaw: toStart };
  }

  private async spawnReward(payload: RunCompleted): Promise<void> {
    const world = this.world, built = this.built;
    if (!world || !built || this.rewardSpawned) return;
    this.rewardSpawned = true;
    const pp = await this.spawnExitPortal();
    if (!pp || this.disposed) return;
    const toStart = pp.yaw;
    const tier = chestTierForKey(this.params.keyLevel, this.params.difficulty);
    const chest = new Chest(world.allocLocalId(), {
      tier,
      onOpen: (_c, _first) => {
        if (this.completed) G.ui.openPanel('runSummary', this.completed);
      },
    });
    const cx = pp.x + Math.cos(toStart) * 3.6 + Math.sin(toStart) * 1.6, cz = pp.z - Math.sin(toStart) * 3.6 + Math.cos(toStart) * 1.6;
    const cf = built.nav.nearestWalkable(cx, cz, 5) ?? { x: cx, z: cz };
    chest.position.set(cf.x, world.groundY(cf.x, cf.z), cf.z);
    chest.object3d.rotation.y = Math.atan2(pp.x - cf.x, pp.z - cf.z);
    try {
      await chest.load();
      if (this.disposed) return;
      world.add(chest);
      try {
        G.vfx.spawn('boss_spawn', chest.position, { scale: 1.3 });
      } catch {
        /* optional */
      }
      G.ui.toast(this.outdoor ? 'Çürükkök yenildi! Ödül sandığını aç.' : 'Zindan tamamlandı! Ödül sandığını aç ve portala adım at.', 'success');
    } catch (e) {
      console.warn('[dungeon] reward spawn failed', e);
    }
    void payload;
  }

  // ================================================================================================

  update(dt: number): void {
    if (!this.ready) return;
    this.controller?.update(dt);
    this.world?.update(dt);
    this.built?.update(dt);
    this.cam?.update(dt);
    this.updateCamps(dt);
    this.worldRt?.update(dt);
    this.reaper.update(this.scene, dt);
    // offline safety net: the run clock must start even if the party-loaded promise was swallowed (host runs wait for it instead)
    if (!this.beginTried && !G.net.isOnline) {
      this.beginClock += dt;
      if (this.beginClock > 1.5) this.tryBegin();
    }
    this.zoneTimer -= dt;
    const p = this.player;
    // open world: the region banner comes from WorldRuntime (region names, first-entry discovery)
    if (p && this.built && this.zoneTimer <= 0 && !this.worldRt) {
      this.zoneTimer = 0.4;
      const name = this.built.roomAt(p.position.x, p.position.z)?.name;
      if (name && name !== this.roomName) {
        this.roomName = name;
        G.events.emit('ui:zoneName', { title: name, subtitle: this.def.name });
      }
    }
  }

  exit(): void {
    this.disposed = true;
    this.ready = false;
    this.reaper.flush(this.scene);
    sceneFlow.leftOpenWorld = this.outdoor;
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
    for (const b of this.bosses.values()) {
      if (b.closeTimer) clearTimeout(b.closeTimer);
      if (b.openTimer) clearTimeout(b.openTimer);
    }
    this.events?.dispose();
    this.events = null;
    for (const off of this.netOff) off();
    this.netOff = [];
    this.worldRt?.dispose();
    this.worldRt = null;
    this.controller?.dispose();
    this.controller = null;
    this.cam?.dispose();
    this.cam = null;
    G.world = null;
    G.player = null;
    G.camera = null;
    G.ui.hideLoading();
    this.hazards?.dispose();
    this.hazards = null;
    this.propGame?.dispose();
    this.propGame = null;
    this.packWatch?.dispose();
    this.packWatch = null;
    this.barrier?.dispose();
    this.barrier = null;
    clearSceneAnchors();
    this.world?.dispose();
    this.world = null;
    this.built?.dispose();
    this.built = null;
    this.player = null;
    this.zoneEvents?.dispose();
    this.zoneEvents = null;
    this.camps = [];
    this.scene.clear();
    void SHRINES;
  }
}
