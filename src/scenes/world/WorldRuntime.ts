import type * as THREE from 'three';
import { G } from '../../game/G';
import { makeChampion, type ChampionMod } from '../../ai/champion';
import { getDirector } from '../../ai/EnemyDirector';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import type { DungeonDef, WorldExtras } from '../../types/dungeons';
import type { BuiltDungeon } from '../../world/DungeonBuilder';
import type { World } from '../../world/World';
import type { EventScope } from '../../core/EventBus';
import { RNG, hashString } from '../../core/utils';
import { DUNGEON_ENEMY_ID_BASE, MINION_ID_BASE } from '../../types/common';
import type { DungeonParams } from '../scenes';
import { CampDirector } from './CampDirector';
import { CampDanger } from './CampDanger';
import { MetinDirector } from './MetinDirector';
import { RareDirector } from './RareDirector';
import { StoryBeats } from './StoryBeats';
import { MiniBossDirector } from './MiniBossDirector';
import { BossSchedule } from './BossSchedule';
import { SafeZones } from './SafeZones';
import { WaypointNetwork, type FlightDest } from './WaypointNetwork';
import { GraveyardNetwork } from './Graveyards';
import { spawnVillageNpcs } from './VillageSpawner';
import { WorldPois } from './WorldPois';
import { WorldEntrances } from './WorldEntrances';
import { WorldGather } from './WorldGather';
import { WorldQuestProps } from './WorldQuestProps';
import { EventCalendar, buildEventSites } from './EventCalendar';
import { AmbientLife, ambientEnabled } from './AmbientLife';
import { VignetteDirector } from './Vignettes';
import { startSiege, type SiegeRuntime } from '../../systems/Siege';
import { SIEGE_MAP_ID } from '../../data/siege';
import { Discoveries } from './Discoveries';
import { bindQuestMarks } from './QuestMarks';
import { EV, nameOfDef, spawnPayloadOf, tileToWorld, WorldCtx, type Pt } from './util';

/**
 * Open-world runtime for a DungeonDef that has `world` (GDD_OPENWORLD §9.3). OWNER: scenes module (WP6).
 * DungeonScene.enter delegates the population of a world map to this class: camp streaming, metin stones, rares, mini-bosses,
 * world bosses, treasure goblins, village NPCs, waypoint stones, village safe zones, the respawn point and the region banner.
 * Host-authoritative state runs only on the host (`G.net.isAuthority`); every peer runs `handleMessage` for the `ev:*` keys
 * of the 'gate' channel (announcements, champion plates) and its own discoveries.
 */

export interface WorldRuntimeOpts {
  def: DungeonDef;
  world: World;
  built: BuiltDungeon;
  params: DungeonParams;
  scene: THREE.Scene;
  /** Teleports the local player (PlayerController.teleport). Needed by the Işınlayıcı travel. */
  teleport?: (x: number, z: number, yaw: number) => void;
}

/** The open-world runtime of the scene that is running now (null in town / other dungeons). For panels: travel, fares. */
let activeRuntime: WorldRuntime | null = null;
export const activeWorldRuntime = (): WorldRuntime | null => activeRuntime;

/** Host goblin roll: every 5 minutes, 15 % (GDD_CONTENT 1.6, open world). */
const GOBLIN = { every: 300, chance: 0.15 };
/** Boss warnings and spawns are heard / felt within this distance (m). */
const BOSS_NEAR_M = 60;
/** Rare announcements reach players within this distance (m). */
const RARE_NEAR_M = 150;

export class WorldRuntime {
  private readonly o: WorldRuntimeOpts;
  private readonly ctx: WorldCtx;
  private readonly ext: WorldExtras;
  private readonly safe: SafeZones;
  private readonly waypoints: WaypointNetwork;
  private readonly graveyards: GraveyardNetwork;
  private readonly camps: CampDirector;
  private readonly campDanger: CampDanger;
  private readonly metin: MetinDirector;
  private readonly rares: RareDirector;
  private readonly story: StoryBeats;
  private readonly minis: MiniBossDirector;
  private readonly bosses: BossSchedule;
  private readonly pois: WorldPois;
  private readonly entrances: WorldEntrances;
  private readonly gather: WorldGather;
  private readonly questProps: WorldQuestProps;
  private readonly discoveries: Discoveries;
  /** Ambient life (walkers on routines, critters, deer, cues): null when the map has none or `?ambient=0`. */
  private ambient: AmbientLife | null = null;
  /** Travel vignettes (data/world/vignettes.ts): roads and POIs of the rings. */
  private readonly vignettes: VignetteDirector;
  private events: EventScope | null = null;
  private calendar: EventCalendar | null = null;
  /** WP-14 Kale Kuşatması: the fortress runtime (Karakır only). */
  private siege: SiegeRuntime | null = null;
  private started = false;
  private disposed = false;
  private regionTimer = 0;
  private lastRegion: string | null = null;
  private goblinClock = 0;
  private goblinRolls = 0;
  private readonly failed = new Set<string>();

  constructor(o: WorldRuntimeOpts) {
    this.o = o;
    if (!o.def.world) throw new Error(`WorldRuntime: ${o.def.id} is not an open-world map`);
    this.ext = o.def.world;
    this.ctx = new WorldCtx(o.world, o.built, o.def, this.ext, o.params);
    this.ctx.ev = (key: string) => this.announce(key);
    this.safe = new SafeZones(this.ctx);
    this.waypoints = new WaypointNetwork(this.ctx, (x, z, yaw) => o.teleport?.(x, z, yaw));
    this.graveyards = new GraveyardNetwork(this.ctx);
    this.camps = new CampDirector(this.ctx, this.ext.perf);
    this.campDanger = new CampDanger(o.def.packs);
    this.metin = new MetinDirector(this.ctx);
    this.rares = new RareDirector(this.ctx);
    this.minis = new MiniBossDirector(this.ctx);
    this.story = new StoryBeats(this.ctx, (enemyId) => this.minis.summon(enemyId));
    this.bosses = new BossSchedule(this.ctx);
    this.pois = new WorldPois(this.ctx);
    this.entrances = new WorldEntrances(this.ctx);
    this.gather = new WorldGather(this.ctx);
    this.questProps = new WorldQuestProps(this.ctx);
    this.discoveries = new Discoveries(this.ctx);
    this.vignettes = new VignetteDirector(this.ctx, (key) => this.announce(key));
  }

  /** Spawn the local scenery entities (village NPCs, waypoint stones, shrines, chests) and arm the host's directors. Never throws. */
  async start(): Promise<void> {
    await Promise.all([
      this.guard('npcs', () => spawnVillageNpcs(this.ctx)),
      this.guard('waypoints', () => this.waypoints.place()),
      this.guard('graveyards', () => this.graveyards.place()),
      this.guard('shrines and chests', () => this.pois.place()),
      this.guard('dungeon gates', () => this.entrances.place()),
      this.guard('gathering nodes', () => this.gather.place()),
      this.guard('quest props', () => this.questProps.place()),
      this.guard('ambient life', () => this.startAmbient()),
    ]);
    if (G.net.isAuthority) {
      try {
        getDirector(this.o.world).setSafeQuery((x, z) => this.safe.isSafe(x, z));
      } catch (e) {
        console.warn('[world] safe zones not registered', e);
      }
    }
    this.events = G.events.scope();
    this.events.on('net:peerJoined', ({ peerId }) => {
      if (G.net.isAuthority && !this.disposed) this.resendTo(peerId);
    });
    // quest markers over the village quest givers (after the NPCs are spawned)
    bindQuestMarks(this.events, this.o.world);
    this.calendar = new EventCalendar(this.ctx, { metin: this.metin, bosses: this.bosses }, buildEventSites(this.ctx));
    this.vignettes.attach();
    if (this.o.def.id === SIEGE_MAP_ID) this.siege = startSiege({ world: this.o.world, scene: this.o.scene });
    this.started = true;
    activeRuntime = this;
    this.trackRegion(true);
  }

  /** Işınlayıcı panel: the fare and name of a discovered stone from the local player's position (null when unknown). */
  quoteTravel(toId: string): { id: string; name: string; cost: number } | null {
    const p = this.o.world.localPlayer;
    if (!p) return null;
    return this.waypoints.quote(toId, { x: p.position.x, z: p.position.z });
  }

  /** The stones this character has discovered (for the travel panel), in data order. */
  discoveredStones(): { id: string; name: string }[] {
    return this.ext.waypoints.filter((w) => this.waypoints.known(w.id)).map((w) => ({ id: w.id, name: w.name }));
  }

  /** Per-frame update (called by DungeonScene.update). Host-only simulation inside each director. */
  update(dt: number): void {
    if (!this.started || this.disposed) return;
    this.run('bosses', () => this.bosses.update(dt));
    this.run('camps', () => this.camps.update(dt));
    this.run('camp danger', () => {
      const lp = this.o.world.localPlayer;
      if (lp) this.campDanger.update(dt, lp);
    });
    this.run('metin', () => this.metin.update(dt));
    this.run('rares', () => this.rares.update(dt));
    this.run('story', () => this.story.update(dt));
    this.run('minis', () => this.minis.update(dt));
    this.run('chests', () => this.pois.update(dt));
    this.run('dungeon gates', () => this.entrances.update(dt));
    this.run('quest props', () => this.questProps.update(dt));
    this.run('events', () => this.calendar?.update(dt));
    this.run('vignettes', () => this.vignettes.update(dt));
    this.run('siege', () => this.siege?.update(dt));
    this.run('ambient', () => this.ambient?.update(dt));
    this.run('flight', () => this.waypoints.tick(dt));
    if (G.net.isAuthority) this.run('goblins', () => this.goblinTick(dt));
    this.regionTimer -= dt;
    if (this.regionTimer <= 0) {
      this.regionTimer = 0.4;
      this.run('regions', () => this.trackRegion(false));
      this.run('discoveries', () => this.discoveries.check());
    }
  }

  /** True inside a village safe box: enemies never aggro a player there (GDD_OPENWORLD §2.2). */
  isSafe(x: number, z: number): boolean {
    return this.safe.isSafe(x, z);
  }

  /**
   * Where a dead player is released (WoW spirit healer): the graveyard nearest the body `from` that no living camp stands within 35 m
   * of. A map without graveyards falls back to the last waypoint stone this character activated, else the map start.
   */
  respawnPoint(from: Pt): { x: number; z: number; yaw: number } {
    const pt: Pt = this.graveyards.release(from, this.camps.livingCenters()) ?? this.waypoints.respawnPoint() ?? { x: this.o.built.start.x, z: this.o.built.start.z };
    const fix = this.o.built.nav.nearestWalkable(pt.x, pt.z, 6) ?? pt;
    return { x: fix.x, z: fix.z, yaw: this.o.built.startYaw };
  }

  /** Işınlayıcı NPC: travel to a discovered stone from the local player's position. Returns '' when the trip started. */
  travel(toId: string): string {
    const p = this.o.world.localPlayer;
    if (!p) return 'Karakter yok.';
    return this.waypoints.travel(toId, { x: p.position.x, z: p.position.z }, this.o.world.time);
  }

  /** Işınlayıcı panel: the flight destinations from this zone (Kuzgunkale and the stones of the other flight zones). */
  flightDests(): FlightDest[] {
    return this.waypoints.flightDests(this.ctx.def.id, G.character?.level ?? 1);
  }

  /** Işınlayıcı panel: starts a flight to `dest` (a short cast). Returns '' when it started, else the Turkish message. */
  startFlight(dest: FlightDest): string {
    const p = this.o.world.localPlayer;
    if (!p) return 'Karakter yok.';
    return this.waypoints.startFlight(dest, { x: p.position.x, z: p.position.z }, this.o.world.time);
  }

  /** A flight cast is running (the panel and the stones read it). */
  get flying(): boolean {
    return this.waypoints.flying;
  }

  /** Every peer: an `ev:*` key of the 'gate' channel (GDD_OPENWORLD §9.4). Unknown keys are ignored. */
  handleMessage(key: string, _data?: unknown): void {
    if (this.disposed || !key.startsWith('ev:')) return;
    const p = key.split(':');
    try {
      switch (p[1]) {
        case 'metin':
          this.onMetin(p[2] ?? '', p[3] ?? '');
          break;
        case 'rare':
          this.onRare(p[2] ?? '', p[3] ?? '', Number(p[4] ?? 0));
          break;
        case 'boss':
          this.onBoss(p[2] ?? '', p[3] ?? '');
          break;
        case 'vig':
          this.vignettes.onMessage(key);
          break;
        case 'goblin':
          G.audio.play('reward_coin');
          G.ui.toast('Hazine Goblini ortaya çıktı! Kaçmadan yakala!', 'loot');
          break;
        case 'champ':
          this.onChamp(Number(p[2]), p[3] ?? '');
          break;
        default:
          break;
      }
    } catch (e) {
      console.warn('[world] message failed', key, e);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (activeRuntime === this) activeRuntime = null;
    this.ambient?.dispose();
    this.ambient = null;
    this.events?.dispose();
    this.events = null;
    this.waypoints.dispose();
    this.story.dispose();
    this.calendar?.dispose();
    this.calendar = null;
    this.vignettes.dispose();
    this.siege?.dispose();
    this.siege = null;
  }

  // ================================================================================================
  // host side
  // ================================================================================================

  /** Broadcast an `ev:*` key and apply it on this peer (the host never receives its own broadcast). */
  private announce(key: string): void {
    if (G.net.isAuthority) {
      try {
        G.net.broadcast('gate', { key, open: true });
      } catch {
        /* offline */
      }
    }
    this.handleMessage(key);
  }

  /** Host: a new peer joins a running world. Re-sends every live host entity with its explicit id (and champion plates). */
  private resendTo(peerId: string): void {
    // every live host enemy, not only the directors' lists: EventCalendar raids and caravans, summons and anything a future director
    // spawns were missing from them, and a late joiner that never got such an id drops its snapshots for good (snapUnknown)
    const dynamic: Enemy[] = (this.o.world.enemies as Enemy[]).filter(
      (e) => !e.removed && !e.isDead && e.id >= DUNGEON_ENEMY_ID_BASE && e.id < MINION_ID_BASE,
    );
    for (const e of dynamic) {
      try {
        G.net.sendTo(peerId, 'spawn', spawnPayloadOf(e));
        if (e.champion) G.net.sendTo(peerId, 'gate', { key: EV.champ(e.id, e.championMod), open: true });
      } catch {
        /* offline */
      }
    }
  }

  /** Host: treasure goblins appear near a camp of a region that has a player in it. */
  private goblinTick(dt: number): void {
    this.goblinClock += dt;
    if (this.goblinClock < GOBLIN.every) return;
    this.goblinClock = 0;
    const rng = new RNG(hashString(`${this.ctx.seed}:goblin:${this.goblinRolls++}`));
    if (!rng.chance(GOBLIN.chance)) return;
    const live = this.ctx.livePlayers();
    const regions = this.ext.regions.filter((r) => live.some((p) => this.ctx.regionAt(p.position.x, p.position.z) === r));
    if (!regions.length) return;
    const region = rng.pick(regions);
    const camps = this.ctx.def.packs.filter((pk) => pk.kind !== 'patrol' && this.ext.regions.find((r) => r.roomId === pk.roomId) === region);
    if (!camps.length) return;
    const pk = rng.pick(camps);
    const x = tileToWorld(pk.center[0]) + rng.range(-3, 3);
    const z = tileToWorld(pk.center[1]) + rng.range(-3, 3);
    const at = this.ctx.snapWorld(x, z, 8);
    const level = pk.levelRange ? rng.int(pk.levelRange[0], pk.levelRange[1]) : this.ctx.params.enemyLevel;
    void spawnEnemy(this.o.world, 'treasure_goblin', at, { level, tag: 'treasure', aggro: false })
      .then((e) => {
        if (e && !e.removed) this.announce(EV.goblin);
      })
      .catch(() => undefined);
  }

  // ================================================================================================
  // every peer: announcements and feedback
  // ================================================================================================

  private onMetin(spotId: string, what: string): void {
    const spot = this.ext.metin.spots.find((s) => s.id === spotId);
    if (!spot) return;
    const tier = this.ext.metin.tiers.find((t) => t.regionId === spot.regionId);
    if (!tier) return;
    const name = nameOfDef(tier.enemyId);
    const region = this.ctx.regionById(spot.regionId);
    if (what === 'on') {
      G.events.emit('world:metinChanged', { id: spotId, tierId: tier.id, pos: spot.pos, active: true });
      G.events.emit('world:announce', { text: `${name} (${region?.name ?? 'Sisli Vadi'}) belirdi!`, kind: 'metin' });
    } else if (what === 'dead') {
      G.events.emit('world:metinChanged', { id: spotId, tierId: tier.id, pos: spot.pos, active: false });
      G.events.emit('world:announce', { text: `${name} yıkıldı!`, kind: 'metin' });
    } else if (what === 'off') {
      G.events.emit('world:metinChanged', { id: spotId, tierId: tier.id, pos: spot.pos, active: false });
    }
  }

  private onRare(rareId: string, what: string, spotIdx: number): void {
    const def = this.ext.rares.find((r) => r.id === rareId);
    if (!def) return;
    const name = nameOfDef(def.enemyId);
    if (what === 'up') {
      const spot = def.spots[spotIdx] ?? def.spots[0];
      const pp = G.player?.position;
      if (!spot || !pp) return;
      const d = Math.hypot(pp.x - tileToWorld(spot[0]), pp.z - tileToWorld(spot[1]));
      if (d <= RARE_NEAR_M) G.events.emit('world:announce', { text: `${name} yakınlarda dolaşıyor!`, kind: 'rare' });
    } else if (what === 'dead') {
      G.events.emit('world:announce', { text: `${name} yenildi!`, kind: 'rare' });
    }
  }

  private onBoss(bossId: string, what: string): void {
    const name = nameOfDef(bossId);
    const arena = this.bosses.arenaOf(bossId);
    const pp = G.player?.position;
    const near = !!arena && !!pp && Math.hypot(pp.x - arena.x, pp.z - arena.z) <= BOSS_NEAR_M;
    if (what === 'warn') {
      const text = this.bosses.textOf(bossId) || `${name} yaklaşıyor!`;
      G.ui.toast(text, 'boss');
      G.events.emit('world:announce', { text, kind: 'boss' });
      if (near) G.events.emit('camera:shake', { intensity: 0.05, duration: 0.6 });
    } else if (what === 'up') {
      G.events.emit('world:announce', { text: `${name} ortaya çıktı!`, kind: 'boss' });
      if (near) {
        G.audio.play('timer_warning', { volume: 0.7 });
        G.events.emit('camera:shake', { intensity: 0.08, duration: 0.8 });
      }
    } else if (what === 'dead') {
      G.ui.toast(`${name} yenildi!`, 'boss');
      G.events.emit('world:announce', { text: `${name} yenildi!`, kind: 'boss' });
    }
  }

  private onChamp(entityId: number, mod: string): void {
    if (!Number.isFinite(entityId)) return;
    const e = this.o.world.get<Enemy>(entityId);
    if (e && e.kind === 'enemy' && !e.champion) makeChampion(e, mod as ChampionMod);
  }

  /** Local player: the region banner, the first-entry discovery (flag world.region.<id>, XP) and the region event. */
  private trackRegion(force: boolean): void {
    const p = this.o.world.localPlayer;
    if (!p || p.removed) return;
    const region = this.ctx.regionAt(p.position.x, p.position.z);
    if (!region) return;
    if (region.id === this.lastRegion && !force) return;
    this.lastRegion = region.id;
    const ch = G.character;
    const key = `world.region.${region.id}`;
    const first = !!ch && ch.save.flags[key] !== true;
    if (first && ch) {
      ch.save.flags[key] = true;
      ch.persist();
      try {
        G.progression.addExplorationXp(region.discoveryXpPct ?? 10);
      } catch {
        /* progression not ready */
      }
    }
    G.events.emit('ui:zoneName', { title: region.name, subtitle: region.subtitle ?? `Seviye ${region.levels[0]}-${region.levels[1]}` });
    G.events.emit('world:regionEntered', { regionId: region.id, name: region.name, first });
  }

  // ================================================================================================
  // helpers
  // ================================================================================================

  /** Ambient life of the map (WorldExtras.ambient): walkers, critters, deer, cues. Off with `?ambient=0`. */
  private async startAmbient(): Promise<void> {
    if (!this.ext.ambient || !ambientEnabled()) return;
    const life = new AmbientLife({
      world: this.o.world, scene: this.o.scene, decor: this.o.built.world, ext: this.ext, packs: this.o.def.packs, seed: `${this.ctx.seed}`,
    });
    this.ambient = life;
    await life.start();
  }

  private run(name: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      if (!this.failed.has(name)) {
        this.failed.add(name);
        console.warn(`[world] ${name} failed (logged once)`, e);
      }
    }
  }

  private async guard(name: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      console.warn(`[world] ${name} failed`, e);
    }
  }
}
