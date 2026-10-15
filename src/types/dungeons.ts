import type { MusicId, SfxId } from './audio';
import type { VfxId } from './vfx';
import type { RaidInfo } from './v2';
import type { StatusId } from './skills';
import type { SkyOptions } from '../world/Sky';
import type { AmbientDef, AmbientRoute } from './ambient';

/**
 * Dungeons are authored on a tile grid (1 tile = TILE_SIZE world units, KayKit floor tiles).
 * World position of tile (tx, tz) center = ((tx + 0.5) * TILE_SIZE, 0, (tz + 0.5) * TILE_SIZE).
 * Fractional tile coordinates are allowed for placements.
 */
export const TILE_SIZE = 4;

export interface TileRect { x: number; z: number; w: number; h: number }

// P-11 art kit v2 (append-only): every new id has a row in WALL_STYLES / FLOORS / DECOR of src/world/DungeonBuilder.ts
export type FloorStyle = 'stone' | 'stone_dark' | 'wood' | 'dirt' | 'tiles' | 'lava_rock' | 'ice' | 'temple'
  | 'moss' | 'gorm' | 'marble' | 'earthen' | 'earthen_dark' | 'nerub' | 'web_stone';
export type WallStyle = 'stone' | 'brick' | 'cave' | 'temple' | 'ice' | 'forge'
  | 'grove' | 'arcane' | 'library' | 'earthen' | 'nerub' | 'web_stone' | 'parapet';

export interface PropPlacement {
  model: string;              // GLB/GLTF url
  pos: [number, number];      // tile coords (fractional ok)
  y?: number;                 // world height offset
  rot?: number;               // degrees around Y
  scale?: number;
  collide?: boolean;          // blocks movement (marks nav cells)
  light?: { color: number; intensity: number; distance: number; flicker?: boolean; y?: number };
  vfx?: VfxId;
  // --- content additions (all optional; builders ignore what they do not know) ---
  tint?: number;              // multiply colour over every material (hex, e.g. 0xbfe8ff frost tint)
  emissive?: number;          // emissive colour override (glow)
  emissiveIntensity?: number; // default 1
  opacity?: number;           // 0..1 (ghostly / frozen decor)
  /** For skinned character models used as static decor: clip name to freeze on frame 0 (e.g. 'Blocking', 'Skeletons_Inactive_Floor_Pose'). */
  pose?: string;
  /** For character models: accessory node names to keep visible (everything else toggleable is hidden), e.g. ['2H_Sword']. */
  show?: string[];
  /** Id for tooling / gameplay hooks (shrines, chests, phylactery spots...). */
  id?: string;
  /** Gameplay marker: what this prop is used for (builder may attach interaction / debug draw). */
  tag?: 'shrine' | 'chest' | 'breakable' | 'seal' | 'phylactery' | 'rift' | 'crucible' | 'vent' | 'cage' | 'socket' | 'brazier' | 'waypoint' | 'wake' | 'spawn' | 'pillar' | 'gate'
    | 'device' | 'lightshaft';
  // --- shared primitives (docs/dungeons/_shared_primitives.md, K1; all optional) ---
  /** P-07 shorthand: positional ambience loop anchored on this prop. */
  sfx?: SfxId;
  /** P-14: device id for `tag: 'device'` (resolves in src/data/devices.ts). */
  device?: string;
  /** P-18: set-piece breakable spill zone, applied when the prop breaks (`tag: 'breakable'`). */
  onBreak?: { zone: { radius: number; duration: number; status: StatusId; ignitesOnFire?: boolean } };
  /** P-19: deg/s about Y. */
  spin?: number;
  /** P-19: node name inside the model to spin instead of the root. */
  spinNode?: string;
  /** P-19: vertical bob [amplitude (m), frequency (Hz)]. */
  bob?: [number, number];
}

/** P-07: positional ambience emitter. The builder creates it, the scene ticks it by distance. */
export interface AmbienceEmitterDef {
  id: SfxId;
  pos?: [number, number];     // tile coords; omitted = room centre
  radius: number;             // metres
  volume: number;
  loop?: boolean;
  every?: [number, number];   // random repeat window in seconds (non-loop)
}

/** P-08: sky backdrop (theme-wide via DungeonTheme.sky, per-room via RoomDef.sky). */
export interface DungeonSkyDef {
  image?: string;
  stars?: boolean;
  fallback?: SkyOptions;
}

/**
 * Floor/ground feature drawn by the builder on top of the room floor (lava, pits, rune circles, shadow pools...).
 * Zones of a room apply IN ARRAY ORDER: `blocked` zones close nav cells, and later non-blocked `bridge` / `dais` zones re-open them
 * (e.g. a lava lake followed by a circular basalt platform and the walkways to its doors).
 */
export interface ZoneDef {
  kind: 'lava' | 'pit' | 'void' | 'rune' | 'pool' | 'ice' | 'vent' | 'bridge' | 'dais';
  shape?: 'rect' | 'circle';  // default 'rect'; for 'circle' the rect is the bounding box (w = h = diameter in tiles)
  rect: TileRect;             // tile coords (fractional ok)
  blocked?: boolean;          // unwalkable for nav (lava, pits); visual only otherwise
  color?: number;             // base colour
  glow?: number;              // emissive colour (bloom)
  glowIntensity?: number;
  y?: number;                 // height offset (default 0; dais/platform uses 2)
  vfx?: VfxId;
  /** Damage-over-time zone: coef x base damage every `interval` seconds while standing inside (or when knocked in). */
  hazard?: { coef: number; interval: number };
  light?: { color: number; intensity: number; distance: number; flicker?: boolean; y?: number };
  /** P-17 zone look (append-only). */
  look?: 'cloud' | 'abyss';
  // ---- ENGINE_VERTICALITY §3 (V1; optional, read only when DungeonDef.vertical) ----
  /** void/pit/lava only. Absent = legacy solid hole. 'open' = walkable-for-physics VOID (fall possible), 'kill' = fall kills (scripted pit). */
  fall?: 'open' | 'kill';
  /** Void depth below the rim (m), default 9. Shaft visual bottom and VOID groundY. */
  depth?: number;
}

/** Periodic room hazard (GDD_CONTENT §4): random tile telegraph then burst. */
export interface HazardDef {
  kind: 'lava_burst' | 'icicle_drop' | 'debris_fall' | 'plague_vent' | 'lightning_strike';
  interval: number;           // seconds between events
  warn: number;               // telegraph seconds
  radius: number;             // metres
  coef: number;               // damage coefficient
  stun?: number;              // seconds
  vfx?: VfxId;
  /** P-17: a strike within `radius` of one of these rods is cancelled; players near a rod gain `status`. */
  groundedBy?: { pos: [number, number][]; radius: number; status?: StatusId };
}

export interface RoomDef {
  id: string;
  name?: string;              // Turkish area name shown when entering
  rect: TileRect;
  floor?: FloorStyle;
  wall?: WallStyle;
  ceilingDark?: boolean;
  props?: PropPlacement[];
  autoDecor?: number;         // 0..1 density of random seeded decor (torches, barrels, bones...)
  ambientVfx?: VfxId;
  lightColor?: number;
  // --- content additions (optional) ---
  boss?: number;              // boss arena: order of the boss that fights here
  optional?: boolean;         // dead-end room that is not on the standard route
  skip?: boolean;             // shortcut room (skip route)
  /**
   * The room's pillars / braziers / big clutter are hand-placed in `props`: the builder should skip its AUTO pillars,
   * corner clutter and auto braziers here (auto torches, banners, cobwebs and floor scatter are still welcome).
   */
  explicitDecor?: boolean;
  zones?: ZoneDef[];
  hazards?: HazardDef[];
  /** Per-room fog override (e.g. brighter open courtyard). */
  fog?: { color?: number; near?: number; far?: number };
  // --- shared primitives (K1; all optional, verticality fields live in ENGINE_VERTICALITY.md) ---
  /** P-07: positional ambience emitters. */
  ambience?: AmbienceEmitterDef[];
  /** P-08: per-room sky, blends like fog. */
  sky?: DungeonSkyDef;
  /** P-11: tints applied on top of the floor / wall style. */
  style?: { floorTint?: number; wallTint?: number };
  /** P-11: key into DungeonDef.atmospheres (fog blend between rooms). */
  atmosphere?: string;
  /** P-17: lightning rhythm and flash for storm rooms. */
  storm?: { every: [number, number]; color: number; strength: number };
  // ---- ENGINE_VERTICALITY §3 (V1; all optional, read only when DungeonDef.vertical) ----
  /** Base floor height of the whole room, absolute metres (default 0). */
  floorY?: number;
  /** Clear height above the room's HIGHEST floor (m). Absent = legacy 4 m geometry. Halls 12-30. */
  ceiling?: number;
  /** Per-area floor overrides, applied in array order AFTER floorY (later wins). */
  heightAreas?: HeightArea[];
  /** Stair / ramp strips, applied after heightAreas (later wins). */
  slopes?: SlopeDef[];
  /** Decorative, non-walkable upper structure (galleries, balconies, windows...). */
  tiers?: DecorTier[];
  /** Open-air room: no ceiling cap, camera uncapped, sky backdrop. */
  openAir?: boolean;
}

/** Per-area floor override (ENGINE_VERTICALITY §3). */
export interface HeightArea {
  rect: TileRect;                       // tile coords, multiples of 0.5
  y: number;                            // ABSOLUTE floor height of the area
  rim?: 'rail' | 'ledge' | 'none';      // drop > STEP_UP to a lower neighbour; default 'rail'
  floor?: FloorStyle;
  id?: string;
}

/** Stairs or ramp strip (ENGINE_VERTICALITY §3). yFrom/yTo are absolute, same convention as TownDef.stairs. */
export interface SlopeDef {
  id?: string;
  kind: 'stairs' | 'ramp';
  rect: TileRect;                       // tile coords, multiples of 0.5
  axis: 'x' | 'z';
  yFrom: number;                        // absolute height at the MIN edge on `axis`
  yTo: number;                          // absolute height at the MAX edge
  style?: 'stone' | 'wood' | 'carpet';
  color?: number;
}

/** Decorative non-walkable upper structure (ENGINE_VERTICALITY §3, drawn by §7.6). */
export interface DecorTier {
  kind: 'gallery' | 'balcony' | 'colonnade' | 'windows' | 'beams' | 'ring';
  y: number;                            // ABSOLUTE height of the walking surface / sill
  rect: TileRect;
  depth?: number;                       // metres, default 3
  count?: number; spacing?: number;
  wall?: boolean;
}

/** Vertical transport platform spanning rooms (ENGINE_VERTICALITY §3, dungeon-level). */
export interface LiftDef {
  id: string;
  roomId: string;
  rect: TileRect;                       // platform footprint >= 2x2 m, multiples of 0.5 tile
  stops: number[];                      // absolute heights, >= 2, ascending
  speed?: number;                       // m/s, default VERT.LIFT_SPEED
  dwell?: number;                       // s, default VERT.LIFT_DWELL
  mode?: 'call' | 'auto' | 'script';    // default 'call'
  start?: number;                       // initial stop index, default 0
}

/** Opening between two rooms/corridors. Builder carves the wall and may place a door model. */
export interface DoorDef {
  a: string; b: string;       // room ids
  tile: [number, number];     // tile on the shared boundary (in room a)
  side: 'n' | 's' | 'e' | 'w';
  width?: number;             // tiles (default 1)
  /**
   * boss_lock: leads INTO a boss room; open before the fight, closes 3 s after engage, reopens on kill/wipe, stays closed
   * while a boss with lower `order` lives. boss_exit: leads OUT of a boss room toward progress; closed until that boss
   * (the boss whose arena is room `a`) is dead (GDD_CONTENT section 0.7).
   */
  gate?: 'none' | 'open' | 'boss_lock' | 'boss_exit' | 'forces_lock' | 'event_lock' | 'kill_lock' | 'device_lock';
  // --- shared primitives (P-12 / P-13, K1; all optional) ---
  /** `event_lock`: name of the DungeonDef.events flag that opens the door. */
  event?: string;
  /** `kill_lock`: opens when the named pack / enemy / boss dies. */
  opensOn?: { pack?: string; enemyId?: string; boss?: string };
  /** `device_lock`: device id (src/data/devices.ts) that must be solved. */
  device?: string;
  /** Open when every listed pack is dead (any gate kind). */
  requires?: string[];
  /** P-13 gate look; default 'portcullis'. */
  gateStyle?: 'portcullis' | 'arcane' | 'fel' | 'wood' | 'thorn' | 'bone' | 'web' | 'stone';
}

export interface PackMember { enemyId: string; offset: [number, number] } // offset in tiles from pack center

export interface PackDef {
  id: string;
  roomId: string;
  center: [number, number];   // tile coords
  members: PackMember[];
  patrol?: [number, number][]; // tile coords waypoint loop
  linkedTo?: string[];        // pulling one pulls these packs too
  optional?: boolean;
  // --- content additions (optional) ---
  forces?: number;            // M+ forces of the whole pack (sum of its members' EnemyDef.forces; for route planning / minimap)
  /** Dormant spawn: members start as bone piles / inside coffins and burst out when a player is within `wakeRadius` m. */
  dormant?: { kind: 'bones' | 'coffin' | 'egg' | 'ceiling' | 'statue'; wakeRadius: number };
  /** P-16: scripted wake; the pack wakes once every listed pack is cleared (plus optional delay, s). */
  wakeWhen?: { cleared: string[]; delay?: number };
  stealth?: boolean;          // members start stealthed (alpha 0.15) until they attack / are revealed by AoE
  big?: boolean;              // part of a designed "big pull" (Katliam spot)
  note?: string;              // design note (tooling only)
  /** Open world: camp respawn timer (s), mob level range, camp radius (m). */
  respawnSec?: number;
  levelRange?: [number, number];
  radius?: number;
  // --- open world additions (GDD_OPENWORLD §9.1, all optional) ---
  /** Loot table id applied to every member (farm spots §3.7). */
  lootTable?: string;
  /** Open world: chance that the camp rolls a champion when it activates (default 0.12, 0 disables). */
  championChance?: number;
  /** Tooling / minimap hint. */
  kind?: 'camp' | 'patrol' | 'elite' | 'farm';
}

export interface BossPlacement {
  bossId: string;
  roomId: string;
  pos: [number, number];
  facing?: number;            // degrees
  order: number;              // 1,2,3 — must be killed in order? (only for gates)
}

export interface DungeonTheme {
  fogColor: number;
  fogNear: number;
  fogFar: number;
  ambient: number;
  ambientIntensity: number;
  hemiSky: number;
  hemiGround: number;
  torchColor: number;
  bloomStrength?: number;
  music: MusicId;
  palette?: number[];
  tint?: number;              // multiply tint for KayKit dungeon textures
  /** Open world: snow cover (0..1) of the rooms that belong to no region (passes, bridges); region rooms use RegionTheme.snowCover. */
  snowCover?: number;
  // --- shared primitives (K1; all optional) ---
  /** P-08: sky backdrop for the whole dungeon (RoomDef.sky overrides per room). */
  sky?: DungeonSkyDef;
  /** P-08: moon light. */
  moon?: { color: number; intensity: number; dir?: [number, number, number] };
  /** P-08: cloud sea below open-air rooms. */
  cloudSea?: { y: number; color: number; speed: number };
}

/** P-14: dungeon NPC (src/entities/interactables/DungeonNpc.ts). */
export interface DungeonNpcDef {
  id: string;
  name: string;               // Turkish
  model: string;              // GLB url
  pos: [number, number];      // tile coords
  lines?: string[];
  /** Any-of gate: a player must match one listed class or profession; otherwise the prompt reads "Gereken: ...". */
  requires?: { classes?: string[]; professions?: string[] };
  holdSeconds?: number;
  /** Runs on the interacting client; ctx type is defined with the interactable framework (K9). */
  onInteract?: (ctx: unknown) => void;
}

/** P-15: boon pad. Applies `status` to the interacting player locally. */
export interface DungeonBoonDef {
  id: string;
  pos: [number, number];
  status: StatusId;
  duration: number;           // seconds
  magnitude?: number;
  oncePerPlayer?: boolean;
  persistOnDeath?: boolean;
  cooldownSec?: number;
}

/** P-15: buff station (one use per run per player). */
export interface DungeonStationDef {
  id: string;
  pos: [number, number];
  status: StatusId;
  duration: number;
  magnitude?: number;
}

/** P-15: transit cart. Rides between two stops on the host. */
export interface DungeonTransitDef {
  id: string;
  stops: [[number, number], [number, number]];   // tile coords
  speed?: number;             // m/s
}

/** P-15: winch drop prop. Hold-interact at `winch` drops the prop: damage and stun inside `ring`. */
export interface DungeonDropPropDef {
  id: string;
  pos: [number, number];
  ring: number;               // metres
  dmgPctMax: number;          // max HP % dealt at the centre
  eliteCap: number;           // max HP % dealt to elites
  stun: number;               // seconds
  playerCoef: number;
  winch: [number, number];    // tile coords
}

/** GDD_LIFE §1.5 (L-00): one gather node placed on a map. `type` = NodeTypeDef id. `rich` = rich vein (yield x2). */
export interface NodeSpawnDef { type: string; pos: [number, number]; rich?: boolean }

export interface DungeonDef {
  id: string;
  name: string;               // Turkish
  shortName: string;
  lore: string;
  levelRange: [number, number];
  timerSec: number;           // M+ timer
  forcesRequired: number;     // sum of enemy forces needed for 100%
  theme: DungeonTheme;
  grid: { w: number; h: number }; // tiles
  rooms: RoomDef[];
  doors: DoorDef[];
  packs: PackDef[];
  bosses: BossPlacement[];
  start: { pos: [number, number]; facing: number };
  exit: { pos: [number, number] };  // portal after final boss
  icon?: string;
  loadingImage?: string;
  // --- content additions (optional) ---
  /** Kehanet Tasi (Font of Power) spot, shrines (GDD_CONTENT section 1.4), seasonal rift spots, fixed chests. All tile coords. */
  extras?: {
    fontOfPower: [number, number];
    shrines: { type: 'shrine_power' | 'shrine_haste' | 'shrine_ward' | 'shrine_greed' | 'shrine_wisdom'; pos: [number, number] }[];
    riftSpots: [number, number][];
    chests?: { pos: [number, number]; kind: 'chest_wood' | 'chest_iron' | 'chest_gold' }[];
    // --- shared primitives (K1; all optional, tile coords unless a field says otherwise) ---
    /** P-28: M+ release checkpoints; a death releases at the latest one whose boss is dead. */
    checkpoints?: [number, number][];
    /** P-14: named NPCs (DungeonNpc). `onInteract` receives the interaction context (typed by K9). */
    npcs?: DungeonNpcDef[];
    /** P-15: boon pads, applied locally to the interacting player. */
    boons?: DungeonBoonDef[];
    /** P-15: one-use-per-run-per-player buff stations. */
    stations?: DungeonStationDef[];
    /** P-15: two-stop transit carts that ride on the host. */
    transits?: DungeonTransitDef[];
    /** P-15: hold-interact winch drops that damage and stun inside a ring. */
    dropProps?: DungeonDropPropDef[];
    /** P-26: M+ affix-safe spots (volcanic, storming, explosive, spiteful spawns skip them); radius in tiles. */
    affixSafe?: { x: number; z: number; r: number }[];
  };
  /** Open-world zone (Sisli Koru): one big room, tree walls instead of dungeon walls, camps are packs with respawn. */
  outdoor?: boolean;
  /** Open-world MAP (Sisli Vadi, GDD_OPENWORLD §9.1): regions, villages, POIs, metin, rares... Presence = "this is a world map". */
  world?: WorldExtras;
  /** GDD_V2 §9 (WP1): raid lockout + boss order. Presence = raid dungeon (efsun_kalesi). */
  raid?: RaidInfo;
  // ---- Season 1 shared primitives (docs/dungeons/_shared_primitives.md K1; all optional) ----
  /** P-05: season pool number (1..8) and endgame flag (no Normal difficulty). Pool order is MPLUS_POOL. */
  season?: number;
  endgame?: boolean;
  /** P-12: initial dungeon event flags; read by DoorDef.gate `event_lock`. */
  events?: Record<string, boolean>;
  /** P-08 / P-11: named atmospheres for fog blending between rooms (RoomDef.atmosphere). */
  atmospheres?: Record<string, { color?: number; near?: number; far?: number }>;
  // ---- GDD_ITEMS_V2 / GDD_LIFE (contracts, all optional)
  /** GDD_ITEMS_V2 §5.2.1 (IT-00): player house interior (`home_kulube` / `home_karakol` / `home_konak`). `true` = house scene. */
  home?: boolean;
  /** GDD_LIFE §1.5 (L-00): gather nodes placed on this map (tile coords, same convention as PropPlacement.pos). */
  nodes?: NodeSpawnDef[];
  /** GDD_LIFE §2.1 (L-00): ids of the regions (RegionDef.id, `src/data/regions.ts`) this map contains. */
  regions?: string[];
  // ---- ENGINE_VERTICALITY §3 (V1; optional) ----
  /** Switches the heightfield feature on for this dungeon. Unset/false = legacy build, nav, camera and combat paths. */
  vertical?: boolean;
  /** Dungeon-level lifts (they span rooms). Only read when vertical. */
  lifts?: LiftDef[];
  // ---- Kadim Yarıklar (procedural dungeons, docs/GDD_PROCGEN.md; src/world/procgen) ----
  /** Presence = generated map (id fis.<theme>.<tier>.<level>.<seed8>.<v>). Never set on hand-made dungeons. */
  fissure?: FissureInfo;
}

// ---------------------------------------------------------------------------------------------------------------------
// Kadim Yarıklar (append-only; owner: world module, src/world/procgen)
// ---------------------------------------------------------------------------------------------------------------------
export type FissureThemeId = 'crypt' | 'forge' | 'frost' | 'shadow';
/** n = Normal, h = Kahramanlık, m = Mitik (DungeonParams.difficulty normal / heroic / mythic; never mythicplus). */
export type FissureTier = 'n' | 'h' | 'm';
export type FissureModId = 'fm_surusu' | 'fm_zirh' | 'fm_zalim' | 'fm_bereket';
export type FissureRoomKind = 'start' | 'chamber' | 'hall' | 'treasure' | 'shrine' | 'guardian' | 'final' | 'corridor' | 'ramp';

/** Facts of a generated map that the rest of the game reads (scaling, HUD, summary). Pure data, same on every peer. */
export interface FissureInfo {
  v: number;
  theme: FissureThemeId;
  tier: FissureTier;
  /** Enemy level the pack sizes were scaled for (also DungeonParams.enemyLevel). */
  level: number;
  seed: number;
  mods: FissureModId[];
  /** BossDef ids in encounter order 1, 2, 3. */
  guardians: [string, string];
  finalBossId: string;
  /** Rooms without connectors (corridors / stair strips). */
  rooms: number;
  /** Per RoomDef index (same order as DungeonDef.rooms). */
  kinds: FissureRoomKind[];
  tiers: number[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Open world (Sisli Vadi). GDD_OPENWORLD §9.1. Every map point is in TILE coordinates unless a field says metres (m).
// ---------------------------------------------------------------------------------------------------------------------

/** Deterministic enemy ids of open-world camps: DUNGEON_ENEMY_ID_BASE + packIndex * WORLD_PACK_STRIDE + memberIndex. */
export const WORLD_PACK_STRIDE = 24;

export type BorderStyle = 'trees' | 'cliff' | 'water' | 'marsh' | 'canyon' | 'ruin' | 'palisade';
/** Polyline segment (tile coords) of the map border/shore; unlisted void edges default to 'trees'. */
export interface BorderSeg { a: [number, number]; b: [number, number]; style: BorderStyle }

export interface RegionTheme {
  fogColor: number; fogNear: number; fogFar: number;
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  sunColor: number; sunIntensity: number;
  skyZenith: number; skyHorizon: number; skyImage?: string;            // optional PSX panorama url
  groundTex: { grass: string; dirt: string; cobble: string; dark: string };   // /assets/textures/itch/... urls
  groundTint?: number;                                                  // value written into the region tint map
  snowCover?: number;                                                   // 0..1: the grass reads as snow (written to the tint map's alpha; splat paths show through)
  music: MusicId | 'world_vale' | 'world_hills' | 'world_marsh' | 'world_canyon' | 'world_ruins';   // see audio addition
  musicVolume?: number; ambience?: string;
  ambientVfx?: VfxId; ambientColor?: number;
}
export interface WorldRegion {
  id: string;                    // 'r1' .. 'r6'
  roomId: string;                // RoomDef.id this region covers
  name: string; subtitle?: string;
  levels: [number, number];
  theme: RegionTheme;
  blendM?: number;               // atmosphere blend window at borders (default 30)
  discoveryXpPct?: number;       // % of xpToNext on first entry (default 10)
  landmarkId?: string;
}
export interface VillageDef {
  id: string; name: string;
  center: [number, number];      // tile coords on the parent map
  bounds: [number, number];      // half extents (m) of the walled area
  safe?: { halfX: number; halfZ: number };   // default = bounds
  spawn: { pos: [number, number]; facing: number };   // metres relative to center = respawn point
  props: TownProp[];             // metres relative to center, TownProp unchanged
  npcs: TownNpc[];               // metres relative to center, TownNpc + the additions below
  gates: { id: string; pos: [number, number]; rot: number; width: number }[];
  zones?: { id: string; name: string; box: [number, number, number, number] }[];   // local metres (banner)
  waypointId?: string;
}
export interface WaypointDef { id: string; name: string; pos: [number, number]; regionId: string; villageId?: string }
/**
 * Mezarlık (WoW graveyard, spirit healer): where a dead player is released. pos = tile coords. The release goes to the graveyard nearest
 * the body that no living hostile camp stands within 35 m of (src/scenes/world/Graveyards.ts). tools/content-check.mjs holds the map's
 * quest areas to a graveyard within 250 m.
 */
export interface GraveyardDef { id: string; name: string; pos: [number, number]; regionId: string; villageId?: string }
export interface EntranceDef {
  id: string; name: string; dungeonId: string; pos: [number, number]; facing: number; minLevel: number; regionId: string;
  /** P-10: closed union widened append-only; recipes in src/data/world/entrances.ts. `temple_large` = the large temple variant. */
  look: 'crypt' | 'forge' | 'cave' | 'ice' | 'temple' | 'palace' | 'arcane' | 'grove' | 'web' | 'valor' | 'temple_large';
  /** Zone link (a pass, not a dungeon door): the entrance opens a portal into another open-world zone instead of the keystone panel. */
  toZone?: string;
  /** Zone link: the entrance id in `toZone` where the party appears (DungeonScene.arrivalOf). */
  toEntrance?: string;
}
export interface RoadDef { id: string; kind: 'dirt' | 'cobble' | 'boardwalk' | 'bridge'; width: number; pts: [number, number][] }
export interface LandmarkDef { id: string; name: string; regionId: string; pos: [number, number]; recipe: string; rot?: number }
/**
 * Decor of the open world (layout `decor`, written by tools/world-fill.mjs and drawn by world/WorldDecorFill.ts). `kind`: vignette
 * (a small story), field (a farm beside a village), signpost (`lines` = destinations with metres and compass letter), flora / rocks
 * (filler clusters). pos in tiles, rot in degrees.
 */
export interface DecorDef {
  id: string;
  kind: 'vignette' | 'field' | 'signpost' | 'flora' | 'rocks';
  recipe: string;
  regionId: string;
  pos: [number, number];
  rot: number;
  lines?: string[];
}
export interface MetinTierDef {
  id: string;                    // 'metin_keder'
  enemyId: string;               // EnemyDef id of the stone
  level: number; regionId: string;
  maxActive: number;             // 2
  respawnMin: [number, number];  // minutes, e.g. [6, 6] .. [10, 10]
  idleDespawnMin: number;        // 25
  waves: { hpBelow: number; members: { enemyId: string; count: number }[] }[];
  add: { enemyId: string; count: number; everySec: number; cap: number };
  aura: { radius: number; slowPct: number; curse?: boolean; dotPctPerSec?: number };
  pulse?: { everySec: number; coef: number; rMax: number };
  lootTable: string;
}
export interface MetinSpotDef { id: string; regionId: string; pos: [number, number] }
export interface RareSpawnDef {
  id: string; enemyId: string; level: number; spots: [number, number][];
  respawnMin: [number, number]; announce: boolean; lootTable: string;
}
export interface MiniBossDef { id: string; enemyId: string; level: number; lair: [number, number]; regionId: string; respawnMin: number; lootTable: string }
export interface WorldBossSched { bossId: string; firstSec: number; respawnSec: number; announceSec: number[]; announceText: string; minLevelToStart?: number }
export interface GatherFieldDef { id: string; kind: 'ore' | 'herb'; regionId: string; center: [number, number]; radius: number; count: number; respawnSec: number; lootTable: string }
export interface ChestSpotDef { id: string; kind: 'chest_wood' | 'chest_iron' | 'chest_gold'; regionId: string; pos: [number, number]; respawnSec: number }
export interface ShrineSpotDef { id: string; type: 'shrine_power' | 'shrine_haste' | 'shrine_ward' | 'shrine_greed' | 'shrine_wisdom'; regionId: string; pos: [number, number] }
export interface HiddenAreaDef { id: string; name: string; regionId: string; pos: [number, number]; radius: number; xpPct: number; rewards: string[] }
export interface VistaDef { id: string; name: string; regionId: string; pos: [number, number]; xpPct: number }
/**
 * Streaming / AI budgets. Defaults: 70 / 110 / 45 / 240 / 40 (GDD_OPENWORLD §1.5). `chunkM` is the culling chunk of a small zone.
 * The optional fields drive BIG zones (docs/ENGINE_BIGMAPS.md): `stream` 'auto' (default) turns terrain + scenery chunk streaming
 * on above 800 m, 'on' / 'off' force it; `streamChunkM` is the streaming chunk edge (multiple of 16 m, default 64); `viewM` the
 * radius around the player that stays built (default: widest region fogFar + 64 m, clamped 96..320).
 */
export interface WorldPerf {
  activateM: number; deactivateM: number; aiSleepM: number; maxActiveEnemies: number; chunkM: number;
  stream?: 'auto' | 'on' | 'off';
  streamChunkM?: number;
  viewM?: number;
}

/**
 * Terrain profile of a region (docs/ENGINE_BIGMAPS.md section 10): `amp` = height range of the rolling noise (m), `scale` = wavelength of the
 * broadest hills (m), `base` = region-wide raise (m, plateaus / foothills), `ridged` 0..1 = how much the noise turns into sharp crests.
 */
export interface ReliefProfile { amp: number; scale: number; base?: number; ridged?: number }

/**
 * Rolling terrain of an open-world zone (OPTIONAL: a zone without it stays flat, y = 0). A pure, seeded height function of this data
 * (world/Relief.ts): same heights on every peer. Roads, villages, landmarks, bosses, POIs and the start / exit are flattened with a
 * smooth falloff, lakes (`world.water`) sit in basins, the walkable area is bounded by hills (`edge`), the slope never exceeds `maxGrade`.
 */
export interface WorldRelief {
  /** Noise seed (default: the dungeon id). */
  seed?: string;
  /** Height grid and terrain mesh cell (m): 2, 4 or 8. Default 4 (8 for a classic, non-streamed zone). */
  cellM?: number;
  /** Profile of rooms / void without their own entry in `regions`. */
  profile?: ReliefProfile;
  /** Profile per region id (WorldRegion.id); blended across region borders over ~24 m. */
  regions?: Record<string, ReliefProfile>;
  /** Map-edge hills: the void around the walkable area rises by `rise` metres over `width` metres. Default 14 / 80. */
  edge?: { rise: number; width: number };
  /** Steepest allowed grade of the ground (m rise per m run). Default 0.34, hard limit 0.4 (nav STEP_UP is 0.45 per 1 m cell). */
  maxGrade?: number;
  /** Mirror the noise so the terrain is symmetric (fair PvP maps): 'x', 'z' or 'xz' (the mirror axis is the zone centre line). */
  symmetric?: 'x' | 'z' | 'xz';
  /** Raised flat-topped plateaus (absolute height, tile centre): the flat disc is `radius` m, the slope is `falloff` m wide. */
  plateaus?: { pos: [number, number]; radius: number; height: number; falloff?: number }[];
  /** Ridges (smooth crests along a tile-coordinate polyline): `height` metres above the surrounding ground, `width` = half width (m). */
  ridges?: { pts: [number, number][]; height: number; width: number }[];
  /** Extra flat pads (tile centre, radius m) for content the zone data does not list by itself. */
  flat?: { pos: [number, number]; radius: number }[];
}

export interface WorldExtras {
  /** Rolling terrain (see WorldRelief). Absent = flat ground. */
  relief?: WorldRelief;
  regions: WorldRegion[];
  villages: VillageDef[];
  waypoints: WaypointDef[];
  /** Release points of the dead (spirit healers). Absent = the stone / map-start fallback (no graveyard authored yet). */
  graveyards?: GraveyardDef[];
  entrances: EntranceDef[];
  roads: RoadDef[];
  water: { id: string; rect: TileRect }[];
  borders: BorderSeg[];
  landmarks: LandmarkDef[];
  /** Open-world decor (DecorDef); absent = none. */
  decor?: DecorDef[];
  metin: { tiers: MetinTierDef[]; spots: MetinSpotDef[] };
  rares: RareSpawnDef[];
  minibosses: MiniBossDef[];
  bosses: WorldBossSched[];
  gather: GatherFieldDef[];
  chests: ChestSpotDef[];
  cursed: { id: string; regionId: string; pos: [number, number] }[];
  shrines: ShrineSpotDef[];
  hidden: HiddenAreaDef[];
  vistas: VistaDef[];
  ghostBoat?: { id: string; pos: [number, number]; island: [number, number] };
  /** Ambient life: villagers on routines, critters, deer herds, chimney smoke, lit windows (types/ambient.ts). Absent = none. */
  ambient?: AmbientDef;
  perf: WorldPerf;
}

export interface TownProp {
  model: string;
  pos: [number, number, number];
  rot?: number;               // degrees around Y
  scale?: number;
  collide?: boolean;
  radius?: number;            // cylinder collider radius (m) when collide
  // --- content additions (optional) ---
  box?: [number, number];     // box collider footprint (w along local x, d along local z, metres, before rotation) when collide
  tint?: number;
  emissive?: number;
  emissiveIntensity?: number;
  light?: { color: number; intensity: number; distance: number; flicker?: boolean; y?: number };
  vfx?: VfxId;
  vfxScale?: number;
  vfxColor?: number;
  id?: string;
}

export type TownNpcRole = 'blacksmith' | 'merchant' | 'alchemist' | 'stash' | 'keystone' | 'trainer' | 'bounty' | 'lobby' | 'guard' | 'citizen' | 'portal' | 'quest' | 'teleporter' | 'stable' | 'codex' | 'tierset' | 'crafting' | 'home' | 'pvp';

export interface TownNpc {
  id: string;
  name: string;
  role: TownNpcRole;
  model: string;
  pos: [number, number, number];
  rot?: number;
  dungeonId?: string;
  // --- content additions (optional) ---
  title?: string;             // short Turkish job title shown under the name
  scale?: number;
  tint?: number;              // multiply tint over the body materials
  /** KayKit characters: accessory node names that stay visible (all other toggleable accessories are hidden). */
  show?: string[];
  idle?: string;              // idle clip suffix (e.g. 'Idle', '2H_Melee_Idle', 'Sit_Chair_Idle')
  /** Periodic one-shot: clip, repeat period (s) and phase offset (s) (anvil chop, juggling, drinking...). */
  loop?: { clip: string; every: number; offset?: number };
  /** Walking patrol loop (world metres [x,z]) and lap time in seconds; `phase` 0..1 starts the walk part-way round (default 0). */
  patrol?: { path: [number, number][]; lap: number; phase?: number };
  /** Open world ambient life (types/ambient.ts): a walking routine with dwells and clips (scenes/world/AmbientLife.ts). World metres. */
  routine?: AmbientRoute;
  /** Ambient calls (vendors shouting): each line goes into a /say bubble every 60-120 s while the NPC is on screen. */
  shouts?: string[];
  /** Panel to open on interact (G.ui.openPanel id) with an optional tab / data kind. */
  ui?: { panel: string; tab?: string; kind?: string };
  lines?: string[];           // Turkish bark / greeting lines
  interactRange?: number;
  unlockLevel?: number;       // portals / gamble vendor
  /** Open world: quest ids this NPC offers / turns in (role 'quest'). */
  quests?: string[];
  decor?: boolean;            // pure decoration (no interaction)
  /** Non-NPC interactable (Sef Tasi, Bulusma Tasi, Gorev Panosu...): prop model url shown at pos instead of a character. */
  object?: { model: string; scale?: number; extra?: { model: string; pos: [number, number, number]; scale?: number }[] };
  vfx?: VfxId;
  vfxColor?: number;
  light?: { color: number; intensity: number; distance: number; flicker?: boolean; y?: number };
}

export interface TownDef {
  id: string;
  name: string;
  size: [number, number];     // world units
  spawn: { pos: [number, number, number]; facing: number };
  props: TownProp[];
  npcs: TownNpc[];
  // --- content additions (optional) ---
  /** Arrival point from a dungeon (in front of the portal arc). */
  arrival?: { pos: [number, number, number]; facing: number };
  /** Walk-out trigger boxes [x0,z0,x1,z1] -> scene id. */
  exits?: { id: string; box: [number, number, number, number]; to: string }[];
  /** Raised areas [x0,z0,x1,z1] at height y. */
  terraces?: { id: string; box: [number, number, number, number]; y: number }[];
  /** Stairs/ramps: walkable height interpolates from yFrom to yTo across the box along axis. */
  stairs?: { id: string; box: [number, number, number, number]; yFrom: number; yTo: number; axis: 'x' | 'z' }[];
  lighting?: { hemiSky: number; hemiGround: number; hemiIntensity: number; sun: number; sunIntensity: number; sunDir: [number, number, number]; fogColor: number; fogNear: number; fogFar: number };
  /** Named zones (area name banner when entering): id, Turkish name, box [x0,z0,x1,z1]. */
  zones?: { id: string; name: string; box: [number, number, number, number] }[];
}
