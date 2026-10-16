import * as THREE from 'three';
import { G } from '../game/G';
import { setSceneBloom } from '../game/graphics';
import { RNG, hashString } from '../core/utils';
import {
  TILE_SIZE,
  type DoorDef,
  type DungeonDef,
  type FloorStyle,
  type PropPlacement,
  type RoomDef,
  type WallStyle,
} from '../types/dungeons';
import type { VfxId } from '../types/vfx';
import type { SfxId } from '../types/audio';
import { Sky, type SkyOptions } from './Sky';
import { NavGrid, type NavHeightSource } from './NavGrid';
import { buildHeightfield, F, VERT, type Heightfield } from './Heightfield';
import { buildRelief, type Relief } from './Relief';
import { cliffGeometry, railGeometry, slopeGeometry, tierGeometry } from './VerticalGeo';
import { InstanceBatcher } from './Instancing';
import { getPiece, loadPieces } from './Pieces';
import { GlowField } from './Glow';
import { LightPool, MAX_REAL_LIGHTS, designToPhysical } from './LightPool';
import {
  GEN_PROPS,
  baseName,
  isAnimatedModel,
  posedFootprint,
  propLightFor,
  spawnAnimatedProp,
  spawnStaticObject,
  worldFocus,
  type AnimatedPropHandle,
} from './Decor';
import { configureShadowBox, followShadowBox } from './ShadowFollow';
import { ZoneField, type BuiltZone } from './Zones';
import { OutdoorScenery, outdoorAssetUrls } from './OutdoorBuilder';
import { buildWorldDecor, worldAssetUrls, type WorldDecorHandle, type WorldDecorHost } from './WorldDecor';
import { paintRoomTiles, computeWalls, fillNavFast, fillNavReference } from './NavBase';
import { streamConfig, type StreamConfig } from './chunks/StreamConfig';
import { buildFloorStains, buildMotes } from './Grime';
import { applyShadowPolicy, markFadeable, shouldCastShadow } from '../render/shadowPolicy';
import { freezeStatic } from '../render/staticTransforms';
import {
  cobwebTexture,
  flameTexture,
  glowTexture,
  mulHex,
  psxMaterial,
  surfaceCanvas,
  surfaceTexture,
  canvasTexture,
  worldUVBox,
} from './ProceduralAssets';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchPSX } from '../render/psx';

/**
 * Indoor fill floor (hemisphere, ambient minimum, cool rim). The 2026-10-16 raise (1.3 / 0.95 / 0.7) made the dungeon interiors
 * flat and glaring; this sits between that and the old near-black floor (1.1 / 0.7 / 0.5). The torches stay the key light.
 */
const INDOOR_HEMI = 1.15;
const INDOOR_AMBIENT_MIN = 0.8;
const INDOOR_FILL = 0.55;

export interface DungeonGate {
  open(): void;
  close(): void;
  object: THREE.Object3D;
  /** Current logical state (true = passable). */
  readonly isOpen: boolean;
  kind: string;
  a: string;
  b: string;
  /** World centre of the opening. */
  center: THREE.Vector3;
}

/** A hand-placed prop that carries a gameplay tag / id (breakables, chests, shrines, seals...). */
export interface BuiltProp {
  id?: string;
  tag?: PropPlacement['tag'];
  model: string;
  room: string;
  x: number;
  z: number;
  y: number;
  /** Radians. */
  rot: number;
  /** The visible object (null until its model has loaded, or when the model is missing). */
  object: THREE.Object3D | null;
  readonly hidden: boolean;
  /** Remove the visual and re-open the nav cells it blocked (breakables that got smashed). */
  hide(): void;
  /** Undo hide(). */
  reveal(): void;
  /** hide() plus a debris burst (dust puff, sparks, a tiny shake): for breakables that were just smashed (optional, additive). */
  smash(): void;
}

/** P-07: a positional ambience emitter. The builder ticks it by distance (update); it plays through G.audio.play. */
export interface BuiltAmbience {
  id: SfxId;
  x: number;
  z: number;
  radius: number;
  volume: number;
  loop: boolean;
  every: [number, number];
  timer: number;
}

export interface BuiltDungeon {
  root: THREE.Group;            // all static geometry (instanced where possible)
  nav: NavGrid;
  /** World positions. */
  start: THREE.Vector3;
  startYaw: number;
  exit: THREE.Vector3;
  /** Door/gate objects that can be closed during boss fights, keyed by "a|b". */
  gates: Map<string, DungeonGate>;
  /** Animated/flickering lights the builder created (updated by update()). */
  update(dt: number): void;
  dispose(): void;
  // ---- additions ----
  /** Room at a world position (null in walls/void). */
  roomAt(x: number, z: number): RoomDef | null;
  /** Tile -> room index (-1 = solid). Row-major, grid.w x grid.h. Useful for the map panel. */
  tiles: Int16Array;
  grid: { w: number; h: number };
  /** World-space bounds of the walkable area. */
  bounds: THREE.Box3;
  /** Real PointLights currently assigned (debug). */
  readonly lights: LightPool;
  /** Scene lights for tweaking/fading (theme hemisphere + ambient + shadow-casting moon). */
  readonly lighting: { hemi: THREE.HemisphereLight; ambient: THREE.AmbientLight; moon: THREE.DirectionalLight };
  // ---- content additions ----
  /** Floor features of every room in world space (lava, pits, runes, bridges...). */
  zones: BuiltZone[];
  /** Top-most zone at a world position (later zones override earlier ones; bridges/daises hide what is below), or null. */
  zoneAt(x: number, z: number): BuiltZone | null;
  /** The damaging zone (ZoneDef.hazard) a world position stands in, or null. Bridges/daises protect what they cover. */
  hazardAt(x: number, z: number): BuiltZone | null;
  /** Props with a `tag` or `id`, in definition order. */
  props: BuiltProp[];
  propById(id: string): BuiltProp | undefined;
  /** Current fog the camera sees (room fog overrides blend in smoothly). */
  readonly fog: THREE.Fog | null;
  /** Open world only (DungeonDef.world): regions, villages, region atmosphere and ambience. Null for dungeons. */
  readonly world: WorldDecorHandle | null;
  // ---- vertical dungeons (docs/ENGINE_VERTICALITY.md §16) ----
  /** Heightfield of a `vertical` dungeon; null for legacy and open-world builds. */
  readonly hf: Heightfield | null;
  /** Rolling terrain of an open-world zone with `world.relief` (docs/ENGINE_BIGMAPS.md section 10); null = flat ground. */
  readonly relief: Relief | null;
  /** Floor height under a world point (0 on legacy builds). */
  groundY(x: number, z: number): number;
  /** Absolute ceiling above a world point (Infinity on legacy builds). */
  ceilingY(x: number, z: number): number;
  /** Absolute ceiling of a room index (Infinity for legacy and openAir rooms). */
  roomTop(roomIdx: number): number;
  // ---- shared primitives (K7: P-07 ambience) ----
  /** Positional ambience emitters (RoomDef.ambience and PropPlacement.sfx); update() ticks them by distance. */
  readonly ambience: BuiltAmbience[];
}

/** Tagged props that gameplay may toggle (smash, open, activate): rendered as their own objects so they can be hidden. */
const INDIVIDUAL_TAGS = new Set<string>(['breakable', 'chest', 'seal', 'phylactery', 'cage', 'socket', 'crucible', 'shrine']);

class PropHandle implements BuiltProp {
  id?: string;
  tag?: PropPlacement['tag'];
  model: string;
  object: THREE.Object3D | null = null;
  hidden = false;
  cells: [number, number][] = [];
  constructor(private nav: NavGrid, p: PropPlacement, readonly room: string, readonly x: number, readonly y: number, readonly z: number, readonly rot: number) {
    this.id = p.id;
    this.tag = p.tag;
    this.model = p.model;
  }
  hide(): void {
    if (this.hidden) return;
    this.hidden = true;
    if (this.object) this.object.visible = false;
    for (const [c, r] of this.cells) this.nav.setCell(c, r, 1);
  }
  smash(): void {
    if (this.hidden) return;
    this.hide();
    try {
      const big = /barrel|crate|trunk|keg|box|cage|urn|coffin|chest/.test(this.model) ? 1 : 0.7;
      const at: [number, number, number] = [this.x, this.y + 0.55, this.z];
      G.vfx?.spawn('death_poof', at, { scale: 0.85 * big });
      G.vfx?.spawn('hit_spark', at, { scale: 0.9 * big });
      G.events?.emit('camera:shake', { intensity: 0.09, duration: 0.14 });
    } catch { /* feedback is optional */ }
  }
  reveal(): void {
    if (!this.hidden) return;
    this.hidden = false;
    if (this.object) this.object.visible = true;
    for (const [c, r] of this.cells) this.nav.setCell(c, r, 0);
  }
}

const T = TILE_SIZE;
/** Contract convention (types/dungeons.ts): a tile coordinate c (props, start, exit, packs, bosses) maps to world (c + 0.5) * TILE_SIZE. */
const tc = (c: number): number => (c + 0.5) * T;
const DUN = '/assets/models/dungeon/';
const HAL = '/assets/models/halloween/';
const FUR = '/assets/models/furniture/';
const GEN = GEN_PROPS;
const PI = Math.PI;
const glb = (dir: string, name: string): string => `${dir}${name}.glb`;
const D = (n: string) => glb(DUN, n);
const H = (n: string) => glb(HAL, n);
const G_ = (n: string) => glb(GEN, n);
const F_ = (n: string) => glb(FUR, n);

// ---------------------------------------------------------------------------
// Style tables
// ---------------------------------------------------------------------------

interface WallStyleDef {
  tint: number;
  variants: [string, number][];
  banners: string[];
  /** Extra clutter along the base of walls (cave rocks etc.). */
  rockBase?: boolean;
}

const WALL_STYLES: Record<WallStyle, WallStyleDef> = {
  stone: {
    tint: 0xffffff,
    variants: [['wall', 66], ['wall_pillar', 6], ['wall_cracked', 5], ['wall_arched', 5], ['wall_window_closed', 4], ['wall_scaffold', 2], ['wall_broken', 2], ['wall_shelves', 3]],
    banners: ['red', 'blue', 'brown'],
  },
  brick: {
    tint: 0xe6c4aa,
    variants: [['wall', 62], ['wall_pillar', 8], ['wall_cracked', 6], ['wall_arched', 8], ['wall_window_open', 4], ['wall_archedwindow_open', 4], ['wall_shelves', 4]],
    banners: ['green', 'brown', 'yellow'],
  },
  cave: {
    tint: 0x9c8a74,
    variants: [['wall', 48], ['wall_cracked', 24], ['wall_broken', 12], ['wall_scaffold', 6], ['wall_pillar', 6]],
    banners: ['brown', 'white'],
    rockBase: true,
  },
  temple: {
    tint: 0xb4a4d6,
    variants: [['wall', 58], ['wall_pillar', 10], ['wall_arched', 12], ['wall_archedwindow_open', 8], ['wall_window_open', 4], ['wall_cracked', 4]],
    banners: ['blue', 'white', 'yellow'],
  },
  ice: {
    tint: 0xa8d6f4,
    variants: [['wall', 62], ['wall_cracked', 10], ['wall_pillar', 6], ['wall_arched', 8], ['wall_window_open', 6], ['wall_broken', 4]],
    banners: ['blue', 'white'],
  },
  forge: {
    tint: 0xdcaa9a,
    variants: [['wall', 60], ['wall_pillar', 10], ['wall_scaffold', 6], ['wall_cracked', 6], ['wall_window_closed', 6], ['wall_arched', 6], ['wall_broken', 2]],
    banners: ['red', 'yellow', 'brown'],
  },
  // ---- P-11 art kit v2 (rows from the Season 1 dungeon docs where they give one; the rest are provisional) ----
  grove: {
    tint: 0x8a9a78,
    variants: [['wall', 60], ['wall_cracked', 20], ['wall_broken', 10], ['wall_pillar', 10]],
    banners: ['green', 'brown'],
    rockBase: true,
  },
  arcane: {
    tint: 0xb4a4d6,
    variants: [['wall', 40], ['wall_arched', 22], ['wall_archedwindow_open', 12], ['wall_pillar', 12], ['wall_shelves', 8], ['wall_window_open', 4], ['wall_cracked', 2]],
    banners: ['red', 'yellow', 'white'],
  },
  library: {
    tint: 0xb8a8d0,
    variants: [['wall_shelves', 46], ['wall_arched', 14], ['wall_pillar', 14], ['wall', 22], ['wall_archedwindow_open', 4]],
    banners: ['red', 'yellow'],
  },
  earthen: {
    tint: 0xc09878,
    variants: [['wall', 56], ['wall_pillar', 12], ['wall_arched', 10], ['wall_cracked', 6], ['wall_window_closed', 6], ['wall_scaffold', 4], ['wall_archedwindow_open', 4], ['wall_broken', 2]],
    banners: ['brown', 'yellow', 'red'],
  },
  // provisional: no table in the docs yet (dark chitin, nerubian halls)
  nerub: {
    tint: 0x5a5468,
    variants: [['wall', 50], ['wall_cracked', 14], ['wall_broken', 10], ['wall_arched', 10], ['wall_pillar', 8], ['wall_window_closed', 8]],
    banners: ['red', 'brown'],
  },
  // provisional: cold webbed masonry
  web_stone: {
    tint: 0xc8c8d8,
    variants: [['wall', 60], ['wall_cracked', 12], ['wall_arched', 10], ['wall_pillar', 8], ['wall_broken', 6], ['wall_window_closed', 4]],
    banners: ['white', 'blue'],
  },
  // provisional: plain grey parapet walls
  parapet: {
    tint: 0xa0a0a8,
    variants: [['wall', 50], ['wall_scaffold', 10], ['wall_broken', 10], ['wall_window_closed', 10], ['wall_pillar', 10], ['wall_arched', 10]],
    banners: ['blue', 'white'],
  },
};

interface FloorStyleDef {
  large: string[];
  small: string[];
  special: string[];
  tint: number;
  checker?: number; // alt brightness multiplier
  variant?: string;
  cracks?: boolean;
}

const FLOORS: Record<FloorStyle, FloorStyleDef> = {
  stone: { large: ['floor_tile_large'], small: ['floor_tile_small'], special: ['floor_tile_small_broken_A', 'floor_tile_small_broken_B', 'floor_tile_small_weeds_A', 'floor_tile_small_weeds_B'], tint: 0xffffff },
  stone_dark: { large: ['floor_tile_large'], small: ['floor_tile_small'], special: ['floor_tile_small_broken_A', 'floor_tile_small_broken_B', 'floor_tile_small_weeds_B'], tint: 0x8c8a98 },
  wood: { large: ['floor_wood_large', 'floor_wood_large_dark'], small: ['floor_wood_small', 'floor_wood_small_dark'], special: [], tint: 0xffffff },
  dirt: { large: ['floor_dirt_large', 'floor_dirt_large', 'floor_dirt_large_rocky'], small: ['floor_dirt_small_A', 'floor_dirt_small_B', 'floor_dirt_small_C', 'floor_dirt_small_D'], special: ['floor_dirt_small_weeds', 'floor_dirt_small_corner'], tint: 0xe8d8c8 },
  tiles: { large: ['floor_tile_large'], small: ['floor_tile_small'], special: ['floor_tile_small_broken_A', 'floor_tile_small_broken_B'], tint: 0xffffff, checker: 0.72 },
  lava_rock: { large: ['floor_tile_large'], small: ['floor_tile_small'], special: ['floor_tile_small_broken_A', 'floor_tile_small_broken_B'], tint: 0x6b4640, cracks: true },
  ice: { large: ['floor_tile_large'], small: ['floor_tile_small'], special: ['floor_tile_small_broken_A', 'floor_tile_small_broken_B'], tint: 0x9ed2f0, variant: 'ice' },
  temple: { large: ['floor_tile_large'], small: ['floor_tile_small'], special: ['floor_tile_small_broken_A'], tint: 0x8c7cb0, checker: 0.8 },
  // ---- P-11 art kit v2 ----
  moss: { large: ['floor_dirt_large', 'floor_dirt_large', 'floor_dirt_large_rocky'], small: ['floor_dirt_small_A', 'floor_dirt_small_B', 'floor_dirt_small_C', 'floor_dirt_small_D'], special: ['floor_dirt_small_weeds'], tint: 0x7a9a68 },
  // acid veins use the lava crack decal for now (green emissive colour is deferred)
  gorm: { large: ['floor_dirt_large'], small: ['floor_dirt_small_A', 'floor_dirt_small_B'], special: ['floor_dirt_small_weeds'], tint: 0x9aa860, cracks: true },
  marble: { large: ['floor_tile_large'], small: ['floor_tile_small'], special: ['floor_tile_small_broken_A'], tint: 0xa8a0c8, checker: 0.86 },
  earthen: { large: ['floor_tile_large'], small: ['floor_tile_small'], special: ['floor_tile_small_broken_A', 'floor_tile_small_broken_B'], tint: 0x7a5a48, checker: 0.82 },
  earthen_dark: { large: ['floor_tile_large'], small: ['floor_tile_small'], special: ['floor_tile_small_broken_A', 'floor_tile_small_broken_B'], tint: 0x5a4034, checker: 0.82 },
  // provisional
  nerub: { large: ['floor_tile_large'], small: ['floor_tile_small'], special: ['floor_tile_small_broken_A', 'floor_tile_small_broken_B'], tint: 0x4a4458, checker: 0.9 },
  web_stone: { large: ['floor_tile_large'], small: ['floor_tile_small'], special: ['floor_tile_small_broken_B'], tint: 0xc8c8d8 },
};

interface DecorSet {
  big: string[];
  small: string[];
  floor: string[];
  hung: string[];
}

const DECOR: Record<WallStyle, DecorSet> = {
  stone: {
    big: [D('barrel_large'), D('crates_stacked'), D('barrel_small_stack'), D('keg'), D('box_large'), D('trunk_large_A'), D('trunk_large_B'), G_('crate_b')],
    small: [D('barrel_small'), D('box_small'), D('trunk_medium_A'), D('trunk_small_B'), D('bottle_C_green'), D('candle_triple'), G_('crate_a')],
    floor: [H('bone_A'), H('bone_B'), H('bone_C'), H('skull'), H('ribcage'), G_('bone_pile'), D('candle_melted'), D('plate_small')],
    hung: [D('sword_shield'), D('sword_shield_broken'), D('shelf_small_candles')],
  },
  brick: {
    big: [D('barrel_large'), D('crates_stacked'), D('keg'), D('box_large'), D('trunk_large_C'), G_('crate_b'), G_('sacks')],
    small: [D('barrel_small'), D('box_small'), D('trunk_medium_B'), D('bottle_A_brown'), D('candle_triple'), G_('crate_a')],
    floor: [H('bone_A'), H('bone_C'), H('skull'), D('candle_melted'), D('plate_small'), D('coin_stack_small')],
    hung: [D('sword_shield'), D('sword_shield_gold'), D('shelf_small_candles')],
  },
  cave: {
    big: [G_('rock_medium'), G_('rock_small'), G_('rock_medium'), D('barrel_large'), G_('bone_pile')],
    small: [G_('rock_small'), D('barrel_small'), D('box_small'), H('skull')],
    floor: [H('bone_A'), H('bone_B'), H('bone_C'), H('skull'), G_('rock_small'), G_('bone_pile'), H('ribcage')],
    hung: [D('shelf_small_candles')],
  },
  temple: {
    big: [G_('crystal_purple'), G_('statue_hooded'), G_('pillar_broken'), D('barrel_large')],
    small: [D('candle_triple'), D('box_small'), G_('crystal_purple'), D('candle_thin')],
    floor: [D('candle_thin'), D('candle_melted'), H('bone_B'), H('skull'), D('plate_small'), D('candle')],
    hung: [D('sword_shield_gold'), D('shelf_small_candles')],
  },
  ice: {
    big: [G_('crystal_blue'), G_('rock_medium'), D('barrel_large'), D('crates_stacked'), G_('crystal_blue')],
    small: [G_('rock_small'), G_('crystal_blue'), D('barrel_small'), D('box_small')],
    floor: [H('bone_A'), H('bone_C'), H('skull'), G_('rock_small'), H('ribcage'), G_('bone_pile')],
    hung: [D('sword_shield'), D('shelf_small_candles')],
  },
  forge: {
    big: [G_('anvil'), D('barrel_large'), D('crates_stacked'), D('keg'), G_('crate_b'), G_('cauldron'), D('box_large')],
    small: [D('barrel_small'), D('box_small'), D('trunk_medium_A'), G_('crate_a'), D('coin_stack_medium')],
    floor: [H('bone_A'), D('coin_stack_small'), D('coin'), G_('bone_pile'), D('plate_small'), D('candle_melted')],
    hung: [D('sword_shield'), D('sword_shield_broken'), D('shelf_small_candles')],
  },
  // ---- P-11 art kit v2 (decor sets; provisional where the docs give none) ----
  grove: {
    big: [G_('rock_medium'), G_('rock_small'), D('barrel_large'), G_('bone_pile')],
    small: [G_('rock_small'), D('box_small'), D('barrel_small')],
    floor: [G_('rock_small'), G_('bone_pile'), H('skull')],
    hung: [D('shelf_small_candles')],
  },
  arcane: {
    big: [G_('statue_hooded'), G_('crystal_blue'), D('barrel_large')],
    small: [D('candle_triple'), D('box_small'), D('candle_thin')],
    floor: [D('candle_thin'), D('candle_melted'), D('plate_small')],
    hung: [D('sword_shield_gold'), D('shelf_small_candles')],
  },
  library: {
    big: [F_('shelf_B_large_decorated'), F_('cabinet_medium_decorated'), F_('table_medium_long')],
    small: [F_('book_set'), F_('book_single'), D('candle_triple')],
    floor: [D('candle_melted'), F_('book_single')],
    hung: [D('shelf_small_candles')],
  },
  earthen: {
    big: [G_('anvil'), D('barrel_large'), D('keg'), G_('rock_medium')],
    small: [D('barrel_small'), G_('rock_small'), D('box_small')],
    floor: [H('bone_A'), G_('rock_small'), D('plate_small')],
    hung: [D('sword_shield'), D('sword_shield_broken')],
  },
  nerub: {
    big: [G_('bone_pile'), D('barrel_large'), G_('rock_medium')],
    small: [G_('bone_pile'), H('skull')],
    floor: [H('bone_A'), H('bone_B'), H('ribcage'), G_('bone_pile')],
    hung: [D('sword_shield_broken')],
  },
  web_stone: {
    big: [G_('crate_b'), D('crates_stacked')],
    small: [G_('crate_a'), D('box_small')],
    floor: [H('skull'), H('bone_C')],
    hung: [D('shelf_small_candles')],
  },
  parapet: {
    big: [D('barrel_large'), G_('crate_b')],
    small: [D('candle_triple')],
    floor: [D('plate_small')],
    hung: [D('sword_shield_gold')],
  },
};

const TORCH = D('torch_mounted');
const PLAIN_VARIANTS = new Set(['wall', 'wall_arched', 'wall_scaffold', 'wall_window_closed', 'wall_window_open', 'wall_archedwindow_open', 'wall_pillar', 'wall_broken']);

/** Assets every dungeon uses regardless of style. */
const BASE_URLS = [
  D('wall'), D('wall_corner'), D('wall_Tsplit'), D('wall_crossing'), D('wall_half_endcap'), D('pillar'), D('pillar_decorated'), TORCH,
  D('floor_tile_large'), D('floor_tile_small'),
];

// ---------------------------------------------------------------------------
// Public: asset url list
// ---------------------------------------------------------------------------

export function dungeonAssetUrls(def: DungeonDef): string[] {
  const out = new Set<string>(BASE_URLS);
  const walls = new Set<WallStyle>();
  const floors = new Set<FloorStyle>();
  for (const r of def.rooms) {
    walls.add(r.wall ?? 'stone');
    floors.add(r.floor ?? 'stone');
    for (const p of r.props ?? []) out.add(p.model);
  }
  for (const w of walls) {
    const s = WALL_STYLES[w] ?? WALL_STYLES.stone;
    for (const [v] of s.variants) out.add(D(v));
    for (const b of s.banners) {
      out.add(D(`banner_${b}`));
      out.add(D(`banner_patternA_${b}`));
      out.add(D(`banner_thin_${b}`));
    }
    const dc = DECOR[w] ?? DECOR.stone;
    for (const u of [...dc.big, ...dc.small, ...dc.floor, ...dc.hung]) out.add(u);
  }
  for (const f of floors) {
    const s = FLOORS[f] ?? FLOORS.stone;
    for (const n of [...s.large, ...s.small, ...s.special]) out.add(D(n));
  }
  out.add(G_('brazier'));
  out.add(G_('chains_hanging'));
  out.add(D('candle_lit'));
  // open world: its own scenery list (WorldDecor); the old outdoor list is not needed there
  if (def.outdoor && !def.world) for (const u of outdoorAssetUrls()) out.add(u);
  if (def.world) for (const u of worldAssetUrls(def)) out.add(u);
  return [...out];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

interface WallSlot {
  kind: 'h' | 'v';
  i: number;
  j: number;
  x: number;
  z: number;
  nx: number;
  nz: number;
  room: number;
}

interface Opening {
  def: DoorDef;
  /** Opening line endpoints in world coords (vertex to vertex) */
  ax: number; az: number; bx: number; bz: number;
  /** Unit along the opening and unit normal (pointing from room a towards room b). */
  ux: number; uz: number; nx: number; nz: number;
  tiles: number;
  gate: string;
}

interface Emitter {
  id: VfxId;
  pos: [number, number, number];
  scale: number;
  handle: { stop(): void; alive: boolean } | null;
}

const dirOf = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;

type GateStyle = NonNullable<DoorDef['gateStyle']>;

/** Merges primitive parts into one geometry (indexed parts are made non-indexed first) and disposes the parts. */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

function weighted(rng: RNG, items: [string, number][]): string {
  let total = 0;
  for (const it of items) total += it[1];
  let r = rng.next() * total;
  for (const it of items) {
    r -= it[1];
    if (r <= 0) return it[0];
  }
  return items[items.length - 1][0];
}

class DungeonBuild {
  readonly W: number;
  readonly H: number;
  readonly root = new THREE.Group();
  readonly batcher: InstanceBatcher;
  readonly lights: LightPool;
  readonly halo: GlowField;
  readonly flames: GlowField;
  readonly nav: NavGrid;
  readonly roomIdx: Int16Array;
  readonly hWall: Uint8Array; // W x (H+1)
  readonly vWall: Uint8Array; // (W+1) x H
  readonly openings: Opening[] = [];
  readonly rng: RNG;
  readonly tint: number;
  readonly gates = new Map<string, DungeonGate>();
  readonly gateAnims: { obj: THREE.Object3D; from: number; to: number; t: number; dur: number; done: boolean }[] = [];
  readonly propUpdaters: ((dt: number, t: number) => void)[] = [];
  readonly emitters: Emitter[] = [];
  readonly disposables: { dispose(): void }[] = [];
  readonly avoid: { x: number; z: number; r: number }[] = [];
  readonly torchPts: { x: number; z: number }[] = [];
  readonly variantAt = new Map<number, string>();
  moon: THREE.DirectionalLight | null = null;
  /** Cool shadowless rim/fill from the far side of the camera: enemy silhouettes separate from the dark room. */
  fill: THREE.DirectionalLight | null = null;
  /** Direction the rim fill comes FROM (world space, unit length). */
  readonly rimDir = new THREE.Vector3(0.55, 0.7, 0.45).normalize();
  hemi: THREE.HemisphereLight | null = null;
  ambient: THREE.AmbientLight | null = null;
  prevFog: THREE.Fog | THREE.FogExp2 | null = null;
  prevBg: THREE.Scene['background'] = null;
  time = 0;
  emitterTimer = 0;
  focus = new THREE.Vector3();
  walkMin = new THREE.Vector2(1e9, 1e9);
  walkMax = new THREE.Vector2(-1e9, -1e9);
  startPos = new THREE.Vector3();
  exitPos = new THREE.Vector3();
  startYaw = 0;
  moonDir = new THREE.Vector3(-0.45, 1, -0.32).normalize();
  bossRingMats: THREE.MeshBasicMaterial[] = [];
  /** Floor features (lava, pits...). Created right after the grid so floors/nav see the holes. */
  zf!: ZoneField;
  /** Heightfield of a `vertical` dungeon (null otherwise: every height-aware branch below is skipped). */
  hf: Heightfield | null = null;
  /** Rolling terrain of an open-world zone with `world.relief` (null = flat ground, y = 0). Baked in build() before anything is placed. */
  relief: Relief | null = null;
  /** Open-world mode (DungeonDef.outdoor): terrain + tree walls instead of tiles + stone walls. */
  readonly outdoor: boolean;
  /** Chunk streaming of a big open-world zone (docs/ENGINE_BIGMAPS.md); `stream.on` false = the classic build-everything path. */
  readonly stream: StreamConfig;
  os: OutdoorScenery | null = null;
  /** Open world (DungeonDef.world): decor, region atmosphere and culling. Built in build(), driven by update(). */
  worldDecor: WorldDecorHandle | null = null;
  readonly propHandles: BuiltProp[] = [];
  // ---- K7 shared primitives ----
  readonly ambience: BuiltAmbience[] = [];
  readonly ambRng: RNG;
  /** P-08 sky dome (theme sky, or a room with a sky / open air); null when the dungeon has none. */
  skyDome: Sky | null = null;
  /** Base sky options (theme) and the per-room targets (index = room index, -1 = outside every room). */
  skyBase: SkyOptions | null = null;
  skyByRoom: SkyOptions[] = [];
  skyRoom = -2;
  /** P-08 cloud sea below the open-air rooms (texture scrolls in update). */
  cloudTex: THREE.Texture | null = null;
  cloudSpeed = 0;
  fog: THREE.Fog | null = null;
  readonly fogTarget = { color: new THREE.Color(), near: 10, far: 40 };
  readonly themeFogColor = new THREE.Color();
  private lastHaloFog = { near: -1, far: -1 };

  addUpdater(fn: (dt: number, t: number) => void): void {
    this.propUpdaters.push(fn);
  }

  constructor(readonly def: DungeonDef, readonly scene: THREE.Scene) {
    this.W = def.grid.w;
    this.H = def.grid.h;
    this.rng = new RNG(hashString(def.id));
    this.ambRng = new RNG(hashString(def.id + ':ambience'));
    this.tint = def.theme.tint ?? 0xffffff;
    this.outdoor = !!def.outdoor;
    this.root.name = `dungeon:${def.id}`;
    this.stream = streamConfig(def);
    this.batcher = new InstanceBatcher(this.root, this.stream.on ? this.stream.chunkM : def.outdoor ? 40 : 24);
    this.batcher.deferred = this.stream.on;
    this.lights = new LightPool(this.root, MAX_REAL_LIGHTS);
    // shared, process-lifetime glow textures (not owned by this build)
    const gt = glowTexture(32, 6, 1.7);
    const ft = flameTexture(32);
    this.halo = new GlowField(gt, 1.0);
    // dungeon halos are written with real per-call intensities (0.3-0.6): honour them, otherwise every torch washes the room
    this.halo.scaleByIntensity = true;
    this.flames = new GlowField(ft, 2.2);
    this.halo.mesh.name = 'torch_halos';
    this.flames.mesh.name = 'torch_flames';
    this.root.add(this.halo.mesh, this.flames.mesh);
    this.roomIdx = new Int16Array(this.W * this.H).fill(-1);
    this.hWall = new Uint8Array(this.W * (this.H + 1));
    this.vWall = new Uint8Array((this.W + 1) * this.H);
    this.nav = new NavGrid({ originX: -0.5, originZ: -0.5, width: this.W * T + 1, depth: this.H * T + 1, cellSize: 1, walkable: false });
    this.registerVariants();
  }

  // ---- tile helpers ----
  tileRoom(i: number, j: number): number {
    return i < 0 || j < 0 || i >= this.W || j >= this.H ? -1 : this.roomIdx[j * this.W + i];
  }
  hasH(i: number, j: number): boolean {
    return i >= 0 && i < this.W && j >= 0 && j <= this.H && this.hWall[j * this.W + i] === 1;
  }
  hasV(i: number, j: number): boolean {
    return j >= 0 && j < this.H && i >= 0 && i <= this.W && this.vWall[j * (this.W + 1) + i] === 1;
  }
  room(idx: number): RoomDef | undefined {
    return idx >= 0 ? this.def.rooms[idx] : undefined;
  }
  wallStyleOfRoom(idx: number): WallStyleDef {
    const r = this.room(idx);
    const base = WALL_STYLES[r?.wall ?? 'stone'] ?? WALL_STYLES.stone;
    // P-11: RoomDef.style.wallTint multiplies the style tint
    const wt = r?.style?.wallTint;
    return wt === undefined ? base : { ...base, tint: mulHex(base.tint, wt) };
  }
  /** P-11: the floor style of a room with RoomDef.style.floorTint multiplied into its tint. */
  floorDefOf(r: RoomDef): FloorStyleDef {
    const base = FLOORS[r.floor ?? 'stone'] ?? FLOORS.stone;
    const ft = r.style?.floorTint;
    return ft === undefined ? base : { ...base, tint: mulHex(base.tint, ft) };
  }
  wallStyleIdOfRoom(idx: number): WallStyle {
    return this.room(idx)?.wall ?? 'stone';
  }

  // ---- vertical helpers (every one returns the legacy value when hf is null) ----
  /** Floor height under a world point: the heightfield when vertical, 0 otherwise. */
  floorAt(x: number, z: number): number {
    return this.hf ? this.hf.groundY(x, z) : this.relief ? this.relief.groundY(x, z) : 0;
  }

  /** Attaches the heightfield to the nav grid (floors, flags, rim pass, regions) and sets the start / exit heights. */
  attachVerticalNav(hf: Heightfield): void {
    this.startPos.y = hf.groundY(this.startPos.x, this.startPos.z);
    this.exitPos.y = hf.groundY(this.exitPos.x, this.exitPos.z);
    const src: NavHeightSource = {
      groundY: (x, z) => hf.groundY(x, z),
      flagsAt: (x, z) => hf.flagsAt(x, z),
      rimAt: (x, z) => this.rimAt(x, z),
    };
    this.nav.attachHeights(src);
  }

  /**
   * Open-world rolling terrain (docs/ENGINE_BIGMAPS.md section 10): bakes the relief, gives the nav grid its floor, and makes every
   * batched instance and light use its y as an offset above the ground. A zone without `world.relief` returns at once (flat world).
   * A failing bake falls back to the flat ground with a warning, never a broken map.
   */
  private setupRelief(): void {
    if (!this.def.world?.relief) return;
    try {
      const relief = buildRelief(this.def);
      if (!relief) return;
      this.relief = relief;
      this.nav.attachTerrain({ groundY: (x, z) => relief.groundY(x, z), flagsAt: () => 0 });
      this.batcher.groundY = (x, z) => relief.groundY(x, z);
      this.lights.groundY = (x, z) => relief.groundY(x, z);
      this.startPos.y = relief.groundY(this.startPos.x, this.startPos.z);
      this.exitPos.y = relief.groundY(this.exitPos.x, this.exitPos.z);
    } catch (e) {
      console.warn('[world] relief failed, the zone stays flat', e);
      this.relief = null;
      this.batcher.groundY = null;
      this.lights.groundY = null;
    }
  }

  /** HeightArea.rim of the area owning a world point (last area wins, like the floor); 'rail' when no area covers it. */
  rimAt(x: number, z: number): 'rail' | 'ledge' | 'none' {
    const tx = x / T, tz = z / T;
    let rim: 'rail' | 'ledge' | 'none' = 'rail';
    for (const room of this.def.rooms)
      for (const a of room.heightAreas ?? []) {
        if (tx >= a.rect.x && tx < a.rect.x + a.rect.w && tz >= a.rect.z && tz < a.rect.z + a.rect.h) rim = a.rim ?? 'rail';
      }
    return rim;
  }

  /**
   * Wall base and top at lattice vertex (vi, vj): base = lowest non-void floor of the four tiles around it, top = highest room
   * top among those rooms (legacy rooms: their floor + 4 m). Legacy builds: { base: 0, top: 4 }.
   */
  wallBaseTop(vi: number, vj: number): { base: number; top: number } {
    const hf = this.hf;
    if (!hf) return { base: 0, top: VERT.CEIL_LEGACY };
    let base = Infinity, top = -Infinity;
    for (const [ti, tj] of [[vi - 1, vj - 1], [vi, vj - 1], [vi - 1, vj], [vi, vj]]) {
      const ri = this.tileRoom(ti, tj);
      if (ri < 0) continue;
      let tileMin = Infinity, tileMax = -Infinity;
      for (const [zi, zj] of [[2 * ti, 2 * tj], [2 * ti + 1, 2 * tj], [2 * ti, 2 * tj + 1], [2 * ti + 1, 2 * tj + 1]]) {
        const c = zj * hf.zw + zi;
        if (hf.flags2[c]! & F.VOID) continue;
        tileMin = Math.min(tileMin, hf.floor2[c]!);
        tileMax = Math.max(tileMax, hf.floor2[c]!);
      }
      if (!Number.isFinite(tileMin)) continue;
      base = Math.min(base, tileMin);
      const rt = hf.roomTop[ri]!;
      top = Math.max(top, Number.isFinite(rt) ? rt : tileMax + VERT.CEIL_LEGACY);
    }
    if (!Number.isFinite(base) || !Number.isFinite(top)) return { base: 0, top: VERT.CEIL_LEGACY };
    return { base, top: Math.max(top, base + 1) };
  }

  /** Floor height of the door opening's two sides (the higher one): lintels, gates and the posts sit on it. */
  doorFloor(o: Opening, midx: number, midz: number): number {
    if (!this.hf) return 0;
    return Math.max(this.hf.groundY(midx + o.nx, midz + o.nz), this.hf.groundY(midx - o.nx, midz - o.nz));
  }

  /**
   * Wall piece at lattice vertex (vi, vj). Vertical dungeons: N pieces stacked from the wall base to the top, each stretched
   * by at most 25 % (N = round(H / 4)). Legacy: one piece at y = 0, scale 1 (the old call).
   */
  addWallPiece(url: string, vi: number, vj: number, rot: number, color: THREE.Color, opts: { cast: boolean; receive: boolean }): void {
    if (!this.hf) {
      this.batcher.add(url, vi * T, 0, vj * T, rot, 1, color, opts);
      return;
    }
    const { base, top } = this.wallBaseTop(vi, vj);
    const H = top - base;
    const n = Math.max(1, Math.round(H / VERT.CEIL_LEGACY));
    for (let k = 0; k < n; k++) {
      this.batcher.add(url, vi * T, base + (k * H) / n, vj * T, rot, [1, H / (VERT.CEIL_LEGACY * n), 1], color, opts);
    }
  }

  /** Per-instance tint = theme tint * style tint * seeded jitter. */
  col(style: number, jitter = 0.1, extra = 1): THREE.Color {
    const c = new THREE.Color(mulHex(this.tint, style));
    const k = (1 - jitter * 0.5 + this.rng.next() * jitter) * extra;
    return c.multiplyScalar(k);
  }

  registerVariants(): void {
    this.batcher.registerVariant('ice', (base) => {
      const m = base.clone() as THREE.MeshStandardMaterial;
      m.roughness = 0.18;
      m.emissive = new THREE.Color(0x10202c);
      m.emissiveIntensity = 1;
      patchPSX(m, { affine: false });
      return m;
    });
  }

  // ---------------------------------------------------------------------
  async build(): Promise<void> {
    this.buildGrid();
    // vertical dungeons only (buildHeightfield returns null otherwise); outdoor builds ignore the vertical fields in v1
    this.hf = this.outdoor ? null : buildHeightfield(this.def, (i, j) => this.tileRoom(i, j));
    if (this.outdoor) this.setupRelief();
    this.zf = new ZoneField(this);
    if (this.hf) this.attachVerticalNav(this.hf);
    this.setupTheme();
    if (!this.outdoor) this.buildSkyAndClouds();
    this.placeAmbience();
    if (this.outdoor) {
      this.os = new OutdoorScenery(this);
      // open world: sky, ground and scatter are owned by WorldDecor (region palettes, tint map, sky blend)
      if (!this.def.world) {
        this.os.buildSky();
        this.os.buildGround();
        this.os.buildTreeWall();
      }
    } else {
      this.placeFloors();
      this.placeWalls();
      this.placeOpenings();
      if (this.hf) this.buildVerticalGeometry();
    }
    // hand-placed props first: they register their footprints so the seeded auto-decor keeps clear of them
    this.placeProps();
    if (this.outdoor) {
      if (!this.def.world) this.os!.scatter();
      this.os!.buildAtmosphere();
    } else {
      this.placeBigRoomPillars();
      this.placeTorchesAndWallDecor();
      this.placeClutter();
      buildFloorStains(this);
      buildMotes(this);
    }
    if (this.def.world) this.worldDecor = await buildWorldDecor(this.def, this.worldHost());
    await this.finalize();
  }

  /** What the open-world decor needs from this build (grid queries, batches, lights, nav, avoid list, lighting). */
  worldHost(): WorldDecorHost {
    return {
      scene: this.scene,
      root: this.root,
      nav: this.nav,
      avoid: this.avoid,
      isAvoided: (x, z, pad) => this.isAvoided(x, z, pad),
      disposables: this.disposables,
      batcher: this.batcher,
      lights: this.lights,
      W: this.W,
      H: this.H,
      tileRoom: (i, j) => this.tileRoom(i, j),
      hasH: (i, j) => this.hasH(i, j),
      hasV: (i, j) => this.hasV(i, j),
      fog: this.fog,
      hemi: this.hemi,
      sun: this.moon,
      stream: this.stream,
      relief: this.relief,
      onFog: (near, far) => {
        this.halo.setFog(near * 0.9, far * 1.1);
        this.flames.setFog(near * 0.9, far * 1.1);
      },
    };
  }

  // ---- 1. grid ----
  buildGrid(): void {
    const { def, W, H } = this;
    paintRoomTiles(def, this.roomIdx);
    // walls on every edge where the two sides belong to different rooms
    // open-world zones are one connected field: only the border towards solid ground is a wall
    computeWalls(W, H, this.roomIdx, this.outdoor, this.hWall, this.vWall);

    // door openings carve walls
    for (const d of this.outdoor ? [] : def.doors) {
      const [dx, dz] = dirOf[d.side];
      const width = Math.max(1, d.width ?? 1);
      const tx = d.tile[0], tz = d.tile[1];
      let ok = true;
      const carve: (() => void)[] = [];
      let ax: number, az: number, bx: number, bz: number;
      if (d.side === 'n' || d.side === 's') {
        const j = d.side === 'n' ? tz : tz + 1;
        for (let k = 0; k < width; k++) {
          const i = tx + k;
          if (this.tileRoom(i, j - 1) < 0 || this.tileRoom(i, j) < 0) ok = false;
          carve.push(() => { if (i >= 0 && i < W) this.hWall[j * W + i] = 0; });
        }
        ax = tx * T; bx = (tx + width) * T; az = bz = j * T;
      } else {
        const i = d.side === 'w' ? tx : tx + 1;
        for (let k = 0; k < width; k++) {
          const j = tz + k;
          if (this.tileRoom(i - 1, j) < 0 || this.tileRoom(i, j) < 0) ok = false;
          carve.push(() => { if (j >= 0 && j < H) this.vWall[j * (W + 1) + i] = 0; });
        }
        az = tz * T; bz = (tz + width) * T; ax = bx = i * T;
      }
      if (!ok) console.warn(`[world] door ${d.a}|${d.b} at ${tx},${tz}/${d.side} does not join two walkable tiles`);
      for (const c of carve) c();
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      // normal from a to b: 'n' door means room b lies to the north
      this.openings.push({ def: d, ax, az, bx, bz, ux, uz, nx: dx, nz: dz, tiles: width, gate: d.gate ?? 'none' });
    }

    // nav classification on the half-metre-offset lattice (cell centre = integer world coords)
    // (NavBase.ts: the original per-cell rule; streamed zones use the row-wise fill that gives the same grid in O(tiles))
    const tiles = { W, H, roomIdx: this.roomIdx, hWall: this.hWall, vWall: this.vWall };
    const wb = this.stream.on ? fillNavFast(tiles, this.nav) : fillNavReference(tiles, this.nav);
    if (Number.isFinite(wb.minX)) {
      this.walkMin.set(wb.minX, wb.minZ);
      this.walkMax.set(wb.maxX, wb.maxZ);
    }

    this.startPos.set(tc(def.start.pos[0]), 0, tc(def.start.pos[1]));
    this.startYaw = (def.start.facing * PI) / 180;
    this.exitPos.set(tc(def.exit.pos[0]), 0, tc(def.exit.pos[1]));
    this.avoid.push({ x: this.startPos.x, z: this.startPos.z, r: 3.2 }, { x: this.exitPos.x, z: this.exitPos.z, r: 3.2 });
    for (const b of def.bosses) this.avoid.push({ x: tc(b.pos[0]), z: tc(b.pos[1]), r: 7 });
    for (const p of def.packs) {
      this.avoid.push({ x: tc(p.center[0]), z: tc(p.center[1]), r: 2.2 });
    }
    for (const o of this.openings) {
      this.avoid.push({ x: (o.ax + o.bx) / 2, z: (o.az + o.bz) / 2, r: 3.5 + o.tiles * 2.2 });
    }
  }

  // ---- 2. theme / lights ----
  setupTheme(): void {
    const th = this.def.theme;
    this.prevFog = this.scene.fog;
    this.prevBg = this.scene.background;
    this.fog = new THREE.Fog(th.fogColor, th.fogNear, th.fogFar);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(th.fogColor);
    this.themeFogColor.set(th.fogColor);
    this.fogTarget.color.set(th.fogColor);
    this.fogTarget.near = th.fogNear;
    this.fogTarget.far = th.fogFar;
    // minimum fill so enemies keep their colours in the darkest themes (the orange / green ambients alone wash them out)
    this.hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, this.outdoor ? 1.25 : INDOOR_HEMI);
    this.ambient = new THREE.AmbientLight(th.ambient, this.outdoor ? th.ambientIntensity * 1.4 : Math.max(INDOOR_AMBIENT_MIN, th.ambientIntensity * 2.0));
    this.root.add(this.hemi, this.ambient);
    // ONE shadow caster: a cool "moonlight" (outdoors: the dimmed, green-grey sun) that follows the player/camera
    // indoor moon: theme moon if authored, else the hemisphere sky lightened (the pre-theme look); outdoor keeps the sun tint
    const indoorMoonColor = th.moon?.color ?? new THREE.Color(th.hemiSky).lerp(new THREE.Color(0xffffff), 0.35).getHex();
    const moon = new THREE.DirectionalLight(this.outdoor ? 0xdfe8c8 : indoorMoonColor, this.outdoor ? 1.05 : (th.moon?.intensity ?? 0.55));
    if (this.outdoor) this.moonDir.set(-0.45, 0.8, -0.4).normalize();
    // 40 m box that follows the focus (ShadowFollow), 1024 texels: the same caster budget indoors and outdoors
    configureShadowBox(moon, { near: 1, far: this.outdoor ? 160 : 130 });
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.06;
    this.root.add(moon, moon.target);
    this.moon = moon;
    // ONE extra light, no shadows: a cool rim from the far side (see rimDir), placed with the focus in update()
    const rim = new THREE.DirectionalLight(th.rim?.color ?? 0xb8d0ff, this.outdoor ? 0.2 : (th.rim?.intensity ?? INDOOR_FILL));
    rim.castShadow = false;
    this.root.add(rim, rim.target);
    this.fill = rim;
    this.halo.setFog(th.fogNear * 0.9, th.fogFar * 1.1);
    this.flames.setFog(th.fogNear * 0.9, th.fogFar * 1.1);
    // per-theme dungeon bloom (dimmer than the town): the player's bloom setting still scales it
    try { setSceneBloom(th.bloomStrength ?? 0.35); } catch { /* harness without engine */ }
    try { G.engine.renderer.localClippingEnabled = true; } catch { /* harness without engine */ }
  }

  // ---- 2b. P-08 sky, moon, cloud sea (indoor and open-air builds) ----
  buildSkyAndClouds(): void {
    const th = this.def.theme;
    const rooms = this.def.rooms;
    if (th.moon) {
      if (this.moon) {
        this.moon.color.setHex(th.moon.color);
        this.moon.intensity = th.moon.intensity;
      }
      if (th.moon.dir) this.moonDir.set(th.moon.dir[0], th.moon.dir[1], th.moon.dir[2]).normalize();
    }
    const wanted = !!th.sky || rooms.some((r) => !!r.sky || !!r.openAir);
    if (wanted) {
      // no sky authored: the dome is the fog colour family (the same recipe as the open-world sky)
      const fog = new THREE.Color(th.fogColor);
      const mid = fog.clone().lerp(new THREE.Color(th.hemiSky), 0.35);
      const zenith = fog.clone().lerp(new THREE.Color(th.hemiSky), 0.7).multiplyScalar(0.85);
      const auto: SkyOptions = {
        zenith: zenith.getHex(), mid: mid.getHex(), horizon: fog.getHex(),
        sunColor: th.moon?.color ?? 0xdce8b8,
        sunDir: [this.moonDir.x, this.moonDir.y, this.moonDir.z],
        cloudLight: fog.clone().lerp(new THREE.Color(0xffffff), 0.45).getHex(),
        cloudShade: fog.clone().multiplyScalar(0.55).getHex(),
        cloudCover: 0.6,
        stars: false,
      };
      const base: SkyOptions = { ...auto, ...(th.sky?.fallback ?? {}), stars: th.sky?.stars ?? th.sky?.fallback?.stars ?? false };
      this.skyBase = base;
      this.skyByRoom = rooms.map((r) => {
        if (!r.sky) return base;
        return { ...base, ...(r.sky.fallback ?? {}), stars: r.sky.stars ?? r.sky.fallback?.stars ?? base.stars ?? false };
      });
      const dome = new Sky(base);
      dome.setTarget(base);
      this.root.add(dome.dome);
      this.skyDome = dome;
      this.skyRoom = -2;
    }
    const cs = th.cloudSea;
    if (cs && rooms.some((r) => !!r.openAir)) {
      // the same noise tile as the rock, cloned so its wrap / repeat stay private to the sea
      const tex = surfaceTexture('rock', this.def.id + ':clouds', 64).clone();
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(6, 6);
      tex.needsUpdate = true;
      const size = Math.max(this.W, this.H) * T * 2.5;
      const geo = new THREE.PlaneGeometry(size, size).rotateX(-PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: cs.color, transparent: true, opacity: 0.92, depthWrite: false, fog: false, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'cloud_sea';
      mesh.position.set((this.W * T) / 2, cs.y, (this.H * T) / 2);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      this.root.add(mesh);
      this.disposables.push(geo, mat, tex);
      this.cloudTex = tex;
      this.cloudSpeed = cs.speed;
    }
  }

  /** P-08: the dome follows the focus; its colours blend towards the room the focus stands in (like fog). */
  tickSky(dt: number): void {
    const dome = this.skyDome;
    if (!dome || !this.skyBase) return;
    dome.follow(this.focus, this.time);
    const ri = this.tileRoom(Math.floor(this.focus.x / T), Math.floor(this.focus.z / T));
    if (ri !== this.skyRoom) {
      this.skyRoom = ri;
      dome.setTarget(ri >= 0 && this.skyByRoom[ri] ? this.skyByRoom[ri]! : this.skyBase);
    }
    dome.step(1 - Math.exp(-dt * 1.6));
    if (this.cloudTex && this.cloudSpeed) this.cloudTex.offset.x += this.cloudSpeed * dt * 0.02;
  }

  // ---- 2c. P-07 positional ambience ----
  addAmbience(id: SfxId, x: number, z: number, radius: number, volume: number, loop: boolean, every?: [number, number]): void {
    this.ambience.push({ id, x, z, radius, volume, loop, every: every ?? (loop ? [3, 5] : [8, 16]), timer: this.ambRng.range(0, 2) });
  }

  /** RoomDef.ambience: `pos` in tile coords (omitted = room centre). */
  placeAmbience(): void {
    this.def.rooms.forEach((r) => {
      for (const a of r.ambience ?? []) {
        const x = a.pos ? tc(a.pos[0]) : tc(r.rect.x + r.rect.w / 2 - 0.5);
        const z = a.pos ? tc(a.pos[1]) : tc(r.rect.z + r.rect.h / 2 - 0.5);
        this.addAmbience(a.id, x, z, a.radius, a.volume, !!a.loop, a.every);
      }
    });
  }

  /** Plays each emitter the focus is inside of, on its own random timer (positional one-shots through G.audio). */
  tickAmbience(dt: number): void {
    for (const a of this.ambience) {
      if (Math.hypot(a.x - this.focus.x, a.z - this.focus.z) > a.radius) continue;
      a.timer -= dt;
      if (a.timer > 0) continue;
      a.timer = this.ambRng.range(a.every[0], a.every[1]);
      G.audio?.play(a.id, { pos: [a.x, 1.5, a.z], volume: a.volume });
    }
  }

  // ---- 3. floors ----
  placeFloors(): void {
    const { W, H, rng } = this;
    const lavaGlow: { x: number; z: number; flip: number }[] = [];
    const runes: { x: number; z: number; rot: number }[] = [];
    for (let tz = 0; tz < H; tz++)
      for (let tx = 0; tx < W; tx++) {
        const ri = this.tileRoom(tx, tz);
        if (ri < 0) continue;
        const r = this.def.rooms[ri];
        const fs = this.floorDefOf(r);
        const cx = (tx + 0.5) * T, cz = (tz + 0.5) * T;
        const dark = r.ceilingDark ? 0.82 : 1;
        const checker = fs.checker && (tx + tz) % 2 === 0 ? fs.checker : 1;
        const opts = { cast: false, receive: true, variant: fs.variant };
        const holeMask = this.zf.tileMask(tx, tz);
        if (holeMask === 15) continue; // lava / pit / deck slab all over the tile
        if (this.hf) {
          this.placeTileFloorsVertical(tx, tz, fs, dark * checker, holeMask, r.floor ?? 'stone', lavaGlow, runes);
          continue;
        }
        if (holeMask !== 0) {
          // part of the tile is a hole: lay 2 m tiles around it
          for (let q = 0; q < 4; q++) {
            if (holeMask & (1 << q)) continue;
            const sx = cx + (q & 1 ? 1 : -1), sz = cz + (q < 2 ? -1 : 1);
            const name = fs.special.length && rng.chance(0.3) ? rng.pick(fs.special) : rng.pick(fs.small);
            this.batcher.add(D(name), sx, 0, sz, rng.int(0, 3) * (PI / 2), 1, this.col(fs.tint, 0.14, dark * checker), opts);
          }
          continue;
        }
        if (fs.special.length && rng.chance(0.11)) {
          // four small tiles with broken / weedy variants
          for (let q = 0; q < 4; q++) {
            const sx = cx + (q % 2 ? 1 : -1), sz = cz + (q < 2 ? -1 : 1);
            const name = rng.chance(0.55) ? rng.pick(fs.special) : rng.pick(fs.small);
            this.batcher.add(D(name), sx, 0, sz, rng.int(0, 3) * (PI / 2), 1, this.col(fs.tint, 0.14, dark * checker), opts);
          }
        } else {
          const name = rng.pick(fs.large);
          this.batcher.add(D(name), cx, 0, cz, rng.int(0, 3) * (PI / 2), 1, this.col(fs.tint, 0.14, dark * checker), opts);
        }
        if (fs.cracks && rng.chance(0.5)) lavaGlow.push({ x: cx, z: cz, flip: rng.int(0, 3) });
        if (r.floor === 'temple' && rng.chance(0.09)) runes.push({ x: cx, z: cz, rot: rng.range(0, PI * 2) });
        // room bounds feed the shadow/walk box
      }
    if (lavaGlow.length) this.buildLavaCracks(lavaGlow);
    if (runes.length) this.buildFloorRunes(runes);
  }

  /**
   * Floor of one 4 m tile in a vertical dungeon (§7.1). A flat, hole-free tile gets the legacy large tile at its height; otherwise
   * each 2 m quadrant is laid at its own cell height, skipping holes, slopes (the stairs/ramp mesh covers them) and lift pads.
   */
  placeTileFloorsVertical(
    tx: number, tz: number, fs: FloorStyleDef, extra: number, holeMask: number, roomFloor: FloorStyle,
    lavaGlow: { x: number; z: number; flip: number }[], runes: { x: number; z: number; rot: number }[],
  ): void {
    const hf = this.hf!, rng = this.rng;
    const cellOfQ = (q: number): number => (2 * tz + (q < 2 ? 0 : 1)) * hf.zw + 2 * tx + (q & 1);
    const cells = [0, 1, 2, 3].map(cellOfQ);
    const SKIP = F.VOID | F.SLOPE | F.LIFT;
    const flat = cells.every((c) => hf.floor2[c] === hf.floor2[cells[0]!] && !(hf.flags2[c]! & SKIP));
    const cx = (tx + 0.5) * T, cz = (tz + 0.5) * T;
    const opts = { cast: false, receive: true, variant: fs.variant };
    if (holeMask === 0 && flat) {
      const y = hf.floor2[cells[0]!]!;
      if (fs.special.length && rng.chance(0.11)) {
        for (let q = 0; q < 4; q++) {
          const sx = cx + (q % 2 ? 1 : -1), sz = cz + (q < 2 ? -1 : 1);
          const name = rng.chance(0.55) ? rng.pick(fs.special) : rng.pick(fs.small);
          this.batcher.add(D(name), sx, y, sz, rng.int(0, 3) * (PI / 2), 1, this.col(fs.tint, 0.14, extra), opts);
        }
      } else {
        const name = rng.pick(fs.large);
        this.batcher.add(D(name), cx, y, cz, rng.int(0, 3) * (PI / 2), 1, this.col(fs.tint, 0.14, extra), opts);
      }
      if (fs.cracks && rng.chance(0.5)) lavaGlow.push({ x: cx, z: cz, flip: rng.int(0, 3) });
      if (roomFloor === 'temple' && rng.chance(0.09)) runes.push({ x: cx, z: cz, rot: rng.range(0, PI * 2) });
      return;
    }
    for (let q = 0; q < 4; q++) {
      if (holeMask & (1 << q)) continue;
      const c = cells[q]!;
      if (hf.flags2[c]! & SKIP) continue;
      const sx = cx + (q & 1 ? 1 : -1), sz = cz + (q < 2 ? -1 : 1);
      const name = fs.special.length && rng.chance(0.3) ? rng.pick(fs.special) : rng.pick(fs.small);
      this.batcher.add(D(name), sx, hf.floor2[c]!, sz, rng.int(0, 3) * (PI / 2), 1, this.col(fs.tint, 0.14, extra), opts);
    }
  }

  buildLavaCracks(list: { x: number; z: number; flip: number }[]): void {
    // dark basalt cracks lit from below: an unlit orange cutout decal + soft floor halos
    const cv = surfaceCanvas('lava', this.def.id, 64);
    const ctx = cv.getContext('2d')!;
    const img = ctx.getImageData(0, 0, 64, 64);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const k = (y * 64 + x) * 4;
        const glow = img.data[k] > 200 && img.data[k + 1] > 90 && img.data[k + 2] < 80;
        // keep each tile's network away from the borders so tiles never show hard seams
        const edge = Math.min(x, y, 63 - x, 63 - y) < 5;
        img.data[k + 3] = glow && !edge ? 255 : 0;
      }
    ctx.putImageData(img, 0, 0);
    const tex = canvasTexture(cv, { repeat: false, mipmaps: false });
    this.disposables.push(tex);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false, alphaTest: 0.5, color: new THREE.Color(1.9, 1.0, 0.45), side: THREE.DoubleSide, toneMapped: false });
    patchPSX(mat, { affine: false });
    const geo = new THREE.PlaneGeometry(3.7, 3.7).rotateX(-PI / 2);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    list.forEach((it, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.flip * (PI / 2));
      const fy = this.floorAt(it.x, it.z);
      p.set(it.x, fy + 0.075, it.z);
      m.compose(p, q, s);
      im.setMatrixAt(k, m);
      if (k % 3 === 0) this.halo.add([it.x, fy + 0.35, it.z], 0xff6a20, { size: 3.8, flicker: 0.25, intensity: 0.5 });
    });
    im.frustumCulled = false;
    this.root.add(im);
    this.disposables.push(geo, mat, im);
  }

  buildFloorRunes(list: { x: number; z: number; rot: number }[]): void {
    const cv = surfaceCanvas('rock', 'rune', 64);
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = '#d8b8ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(32, 32, 26, 0, PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(32, 32, 19, 0, PI * 2); ctx.stroke();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * PI * 2 - PI / 2;
      const b = ((k + 2) / 5) * PI * 2 - PI / 2;
      ctx.beginPath(); ctx.moveTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26); ctx.lineTo(32 + Math.cos(b) * 26, 32 + Math.sin(b) * 26); ctx.stroke();
    }
    const img = ctx.getImageData(0, 0, 64, 64);
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = img.data[i + 3] > 90 ? 255 : 0;
    ctx.putImageData(img, 0, 0);
    const tex = canvasTexture(cv, { repeat: false, mipmaps: false });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false, alphaTest: 0.5, color: new THREE.Color(0.9, 0.5, 1.6), side: THREE.DoubleSide, toneMapped: false });
    patchPSX(mat, { affine: false });
    const geo = new THREE.PlaneGeometry(3.4, 3.4).rotateX(-PI / 2);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    list.forEach((it, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
      const fy = this.floorAt(it.x, it.z);
      p.set(it.x, fy + 0.08, it.z);
      m.compose(p, q, s);
      im.setMatrixAt(k, m);
      this.halo.add([it.x, fy + 0.4, it.z], 0xb070ff, { size: 4, flicker: 0.12, intensity: 0.5 });
    });
    im.frustumCulled = false;
    this.root.add(im);
    this.disposables.push(tex, geo, mat, im);
  }

  /**
   * Stairs, ramps, rails, cliff faces and upper tiers of a vertical dungeon (§7.2, §7.4, §7.6). Each kind is one merged mesh,
   * flagged fadeable (the occluder fade handles them); the geometry comes from the heightfield, so it matches groundY.
   */
  buildVerticalGeometry(): void {
    const hf = this.hf;
    if (!hf) return;
    const id = this.def.id;
    const stone = psxMaterial(surfaceTexture('cobble', id, 64), { color: new THREE.Color(mulHex(this.tint, 0xc0bcc4)), affine: false, roughness: 1, side: THREE.DoubleSide });
    const rock = psxMaterial(surfaceTexture('rock', id, 64), { color: new THREE.Color(mulHex(this.tint, 0xb0aab4)), affine: false, roughness: 1, side: THREE.DoubleSide });
    const planks = psxMaterial(surfaceTexture('planks', id, 64), { color: new THREE.Color(mulHex(this.tint, 0xd0b8a0)), affine: false, roughness: 1, side: THREE.DoubleSide });
    const carpet = psxMaterial(null, { color: 0x7a1c22, affine: false, roughness: 1 });
    const rail = psxMaterial(surfaceTexture('rock', id + ':rail', 64), { color: new THREE.Color(mulHex(this.tint, 0x8c8a98)), affine: false, roughness: 1 });
    const glass = psxMaterial(null, { color: 0xffc070, emissive: 0xffa040, emissiveIntensity: 1.2, affine: false });
    this.disposables.push(stone, rock, planks, carpet, rail, glass);
    const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, fade = true): void => {
      if (!geo) return;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.castShadow = shouldCastShadow(mesh);
      mesh.receiveShadow = true;
      this.root.add(mesh);
      if (fade) markFadeable(mesh);
      this.disposables.push(geo);
    };
    // stairs / ramps: room order then slope order, the same order buildHeightfield used for hf.slopes
    let k = 0;
    for (const room of this.def.rooms)
      for (const s of room.slopes ?? []) {
        const bs = hf.slopes[k++];
        if (!bs) continue;
        add(slopeGeometry(bs, 'body'), s.style === 'wood' ? planks : stone, `slope:${id}:${k}`);
        if (s.style === 'carpet') add(slopeGeometry(bs, 'carpet'), carpet, `carpet:${id}:${k}`);
      }
    add(railGeometry(this.nav), rail, `rails:${id}`);
    add(cliffGeometry(hf), rock, `cliffs:${id}`);
    this.def.rooms.forEach((room, ri) => {
      for (const t of room.tiers ?? []) {
        const g = tierGeometry(t, room, hf, hf.roomTop[ri]!);
        add(g.stone, stone, `tier:${id}:${t.kind}`);
        add(g.glass, glass, `tier_glass:${id}:${t.kind}`, false);
      }
    });
  }

  // ---- 4. walls ----
  placeWalls(): void {
    const { W, H, rng } = this;
    for (let j = 0; j <= H; j++)
      for (let i = 0; i <= W; i++) {
        const e = this.hasH(i, j), w = this.hasH(i - 1, j), s = this.hasV(i, j), n = this.hasV(i, j - 1);
        const count = (e ? 1 : 0) + (w ? 1 : 0) + (s ? 1 : 0) + (n ? 1 : 0);
        if (!count) continue;
        const x = i * T, z = j * T;
        // style room: the lowest-index walkable room among the 4 surrounding tiles
        let styleRoom = -1;
        for (const [ti, tj] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
          const rr = this.tileRoom(ti, tj);
          if (rr >= 0 && (styleRoom < 0 || rr < styleRoom)) styleRoom = rr;
        }
        const ws = this.wallStyleOfRoom(styleRoom);
        const dark = this.room(styleRoom)?.ceilingDark ? 0.85 : 1;
        const color = this.col(ws.tint, 0.12, dark);
        const cast = { cast: true, receive: true };
        const key = j * (W + 1) + i;
        if (count === 4) this.addWallPiece(D('wall_crossing'), i, j, 0, color, cast);
        else if (count === 3) {
          // stub = arm opposite of the missing one
          const rot = !n ? 0 : !s ? PI : !e ? -PI / 2 : PI / 2;
          this.addWallPiece(D('wall_Tsplit'), i, j, rot, color, cast);
        } else if (count === 2) {
          if (e && w) this.straight(i, j, x, z, 0, ws, color, key);
          else if (n && s) this.straight(i, j, x, z, PI / 2, ws, color, key);
          else {
            const rot = e && s ? PI / 2 : w && s ? 0 : w && n ? -PI / 2 : PI;
            this.addWallPiece(D('wall_corner'), i, j, rot, color, cast);
          }
        } else {
          const dx = e ? 1 : w ? -1 : 0, dz = s ? 1 : n ? -1 : 0;
          this.addWallPiece(D('wall_half_endcap'), i, j, Math.atan2(dz, -dx), color, cast);
        }
      }
    // dead-simple "solid rock" top so a down-looking camera never sees the void
    this.buildRockMass();
  }

  straight(i: number, j: number, x: number, z: number, rot: number, ws: WallStyleDef, color: THREE.Color, key: number): void {
    // which side is the walkable one? (for shelf pieces that only have a +Z face)
    let variant = weighted(this.rng, ws.variants);
    // keep first/last pieces of a run plain-ish and avoid stacking two weird pieces
    const prevKey = rot === 0 ? key - 1 : key - (this.W + 1);
    if (variant !== 'wall' && this.variantAt.get(prevKey) && this.variantAt.get(prevKey) !== 'wall') variant = 'wall';
    this.variantAt.set(key, variant);
    let r = rot;
    if (variant === 'wall_shelves' || variant === 'wall_window_closed') {
      // face +Z of the piece towards the walkable side
      const walkSide = rot === 0 ? (this.tileRoom(i, j) >= 0 ? 1 : -1) : this.tileRoom(i, j) >= 0 ? 1 : -1; // tile (i,j) is south/east of the vertex
      r = rot === 0 ? (walkSide > 0 ? 0 : PI) : walkSide > 0 ? PI / 2 : -PI / 2;
    }
    this.addWallPiece(D(variant), i, j, r, color, { cast: true, receive: true });
  }

  /** Dark stone slab over every non-walkable tile (and a big outer plane) so the camera sees solid rock, not void. */
  buildRockMass(): void {
    const { W, H } = this;
    const M = 8;
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const rr = new RNG(hashString(this.def.id + ':rock'));
    let v = 0;
    let maxCap = 3.86;
    const quad = (x0: number, z0: number, x1: number, z1: number, shade: number, y: number) => {
      pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      const u = 0.25;
      uv.push(x0 * u, z0 * u, x1 * u, z0 * u, x1 * u, z1 * u, x0 * u, z1 * u);
      for (let k = 0; k < 4; k++) col.push(shade, shade, shade);
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    };
    for (let tz = -M; tz < H + M; tz++)
      for (let tx = -M; tx < W + M; tx++) {
        if (this.tileRoom(tx, tz) >= 0) continue;
        const near = this.nearWalkable(tx, tz, 2);
        const shade = near ? 0.55 + rr.next() * 0.25 : 0.3 + rr.next() * 0.12;
        const cap = this.rockCapY(tx, tz);
        maxCap = Math.max(maxCap, cap);
        quad(tx * T, tz * T, (tx + 1) * T, (tz + 1) * T, shade, cap);
      }
    // far plane ring
    const far = 400;
    const ring: [number, number, number, number][] = [
      [-far, -far, W * T + far, -M * T],
      [-far, (H + M) * T, W * T + far, H * T + far],
      [-far, -M * T, -M * T, (H + M) * T],
      [(W + M) * T, -M * T, W * T + far, (H + M) * T],
    ];
    for (const r of ring) quad(r[0], r[1], r[2], r[3], 0.3, maxCap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // the winding gives -Y normals for some quads; force up
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let k = 0; k < nrm.count; k++) nrm.setXYZ(k, 0, 1, 0);
    const tex = surfaceTexture('rock', this.def.id, 64);
    const tint = new THREE.Color(mulHex(this.tint, 0xc8c8d0));
    const mat = psxMaterial(tex, { color: tint, vertexColors: true, affine: false, roughness: 1 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = 'rock_mass';
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.disposables.push(g, mat);
  }

  /** Top of the rock cap over a solid tile: the ceiling of the rooms around it (§7.3), never below the legacy 3.86. */
  rockCapY(tx: number, tz: number): number {
    if (!this.hf) return 3.86;
    const c = this.hf.ceilingY(tx * T + T / 2, tz * T + T / 2);
    return Number.isFinite(c) ? Math.max(3.86, c - 0.14) : 3.86;
  }

  nearWalkable(tx: number, tz: number, r: number): boolean {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (this.tileRoom(tx + dx, tz + dz) >= 0) return true;
    return false;
  }

  // ---- 5. openings (doors / gates) ----
  placeOpenings(): void {
    const th = this.def.theme;
    for (const o of this.openings) {
      const d = o.def;
      const midx = (o.ax + o.bx) / 2, midz = (o.az + o.bz) / 2;
      // door posts at both vertices
      const post = (px: number, pz: number, k: number) => {
        const name = k % 2 === 0 ? 'pillar_decorated' : 'pillar';
        // decorated pillar has its banner on +Z: turn it toward the room side
        const rotz = Math.atan2(o.nx, o.nz); // face along the door normal
        const pb = this.wallBaseTop(Math.round(px / T), Math.round(pz / T)).base;
        this.batcher.add(D(name), px, pb, pz, name === 'pillar_decorated' ? rotz : 0, 1, this.col(0xffffff, 0.08), { cast: true, receive: true });
        this.blockCircle(px, pz, 0.85);
      };
      post(o.ax, o.az, 0);
      post(o.bx, o.bz, 1);
      // torches on the inner faces of the posts
      for (const [px, pz, dirSign] of [[o.ax, o.az, 1], [o.bx, o.bz, -1]] as [number, number, number][]) {
        const tx = px + o.ux * dirSign * 0.78, tz = pz + o.uz * dirSign * 0.78;
        const pb = this.wallBaseTop(Math.round(px / T), Math.round(pz / T)).base;
        this.addTorch(tx, pb + 2.5, tz, Math.atan2(o.ux * dirSign, o.uz * dirSign), th.torchColor, true);
      }
      // gates
      const kind = o.gate;
      // P-12 lock kinds get a physical gate too (DungeonScene's resolver opens and closes it); `requires` alone is a lock as well
      const locked = kind === 'boss_lock' || kind === 'boss_exit' || kind === 'forces_lock' || kind === 'event_lock' || kind === 'kill_lock' || kind === 'device_lock';
      if (locked || (d.requires?.length ?? 0) > 0) {
        const g = this.makeGate(o, midx, midz);
        let key = `${d.a}|${d.b}`;
        let n = 2;
        while (this.gates.has(key)) key = `${d.a}|${d.b}#${n++}`;
        this.gates.set(key, g);
      }
      // a stone lintel above every opening of width >= 1 makes the hall read as a real doorway
      this.makeLintel(o, midx, midz);
    }
  }

  makeLintel(o: Opening, midx: number, midz: number): void {
    const len = Math.hypot(o.bx - o.ax, o.bz - o.az) - 1.2;
    if (len <= 0.5) return;
    const along = Math.abs(o.ux) > 0.5;
    const geo = worldUVBox(along ? len : 1.0, 1.05, along ? 1.0 : len, 0.25);
    const mat = psxMaterial(surfaceTexture('brick', 'lintel', 64), { color: new THREE.Color(mulHex(this.tint, 0xb8b0a8)), affine: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(midx, this.doorFloor(o, midx, midz) + 3.45, midz);
    mesh.castShadow = shouldCastShadow(mesh);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    markFadeable(mesh);
    this.disposables.push(geo, mat);
  }

  private gateGlowTex: THREE.Texture | null = null;

  /** Vertical gradient curtain for the arcane / fel gates (the StartBarrier look). */
  gateGlowTexture(): THREE.Texture {
    if (!this.gateGlowTex) {
      const cv = document.createElement('canvas');
      cv.width = 16;
      cv.height = 64;
      const g = cv.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, 'rgba(255,255,255,0.05)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0.05)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 16, 64);
      this.gateGlowTex = canvasTexture(cv, { repeat: false, mipmaps: false });
      this.disposables.push(this.gateGlowTex);
    }
    return this.gateGlowTex;
  }

  /**
   * P-13: mesh and material of a gate by DoorDef.gateStyle (portcullis is the default). Local frame: the opening runs along +X,
   * the base sits at y 0; `glow` (arcane, fel) is the halo colour. Every style is clipped at the same 3 m lintel height.
   */
  gateVisual(style: GateStyle, len: number, base: number): { geo: THREE.BufferGeometry; mat: THREE.Material; glow?: number } {
    const H = 3.0;
    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.92 + base);
    const finish = (geo: THREE.BufferGeometry, mat: THREE.Material, glow?: number) => {
      mat.clippingPlanes = [clip];
      return { geo, mat, glow };
    };
    if (style === 'arcane' || style === 'fel') {
      const color = style === 'arcane' ? 0x60d0ff : 0x9cff40;
      const geo = new THREE.PlaneGeometry(Math.max(0.5, len - 0.2), H - 0.05).translate(0, 0.05 + (H - 0.05) / 2, 0);
      const mat = new THREE.MeshBasicMaterial({
        color, map: this.gateGlowTexture(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false,
      });
      return finish(geo, mat, color);
    }
    if (style === 'stone') {
      const geo = worldUVBox(len, H, 0.5).translate(0, H / 2 + 0.05, 0);
      const mat = psxMaterial(surfaceTexture('brick', this.def.id + ':gate', 64), { color: new THREE.Color(mulHex(this.tint, 0xb0a8a8)), affine: false });
      return finish(geo, mat);
    }
    if (style === 'web') {
      const geo = new THREE.PlaneGeometry(len, H).translate(0, H / 2 + 0.05, 0);
      const mat = psxMaterial(cobwebTexture(64), { color: 0xdedede, alphaTest: 0.5, side: THREE.DoubleSide, affine: false, roughness: 1 });
      mat.emissive = new THREE.Color(0x303038);
      return finish(geo, mat);
    }
    const parts: THREE.BufferGeometry[] = [];
    if (style === 'bone') {
      const n = Math.max(2, Math.floor(len / 0.45));
      for (let k = 0; k <= n; k++) parts.push(new THREE.CylinderGeometry(0.07, 0.09, H, 6).translate(-len / 2 + (k * len) / n, H / 2 + 0.05, 0));
      for (const yy of [0.6, 1.6, 2.7]) parts.push(new THREE.CylinderGeometry(0.06, 0.06, len + 0.1, 6).rotateZ(PI / 2).translate(0, yy, 0));
      const mat = psxMaterial(null, { color: 0xd8d0b8, affine: false, roughness: 0.9 });
      return finish(mergeParts(parts), mat);
    }
    if (style === 'wood') {
      const posts = Math.max(1, Math.round(len / 1.6));
      for (let k = 0; k <= posts; k++) parts.push(new THREE.BoxGeometry(0.32, H, 0.32).translate(-len / 2 + (k * len) / posts, H / 2 + 0.05, 0));
      for (const yy of [0.5, 1.6, 2.7]) parts.push(new THREE.BoxGeometry(len + 0.2, 0.22, 0.26).translate(0, yy, 0));
      const mat = psxMaterial(surfaceTexture('planks', this.def.id + ':gate', 64), { color: 0xffffff, affine: false, roughness: 1 });
      return finish(mergeParts(parts), mat);
    }
    // portcullis (default) and thorn: the bar grid; thorn adds a spike on every bar
    const barW = 0.16, gap = 0.55;
    const n = Math.max(2, Math.floor(len / gap));
    const step = len / n;
    for (let k = 0; k <= n; k++) {
      const p = -len / 2 + k * step;
      parts.push(new THREE.BoxGeometry(barW, H, barW).translate(p, H / 2 + 0.05, 0));
      // spiked tips
      const tip = new THREE.ConeGeometry(barW * 0.9, 0.35, 4);
      tip.rotateX(PI);
      tip.translate(p, 0.05 - 0.14, 0);
      parts.push(tip);
      if (style === 'thorn') parts.push(new THREE.ConeGeometry(barW * 0.8, 0.45, 4).rotateX(PI / 2).translate(p, 1.9, 0.3));
    }
    for (const yy of [0.6, 1.5, 2.45]) parts.push(new THREE.BoxGeometry(len + 0.1, 0.16, 0.2).translate(0, yy, 0));
    const geo = mergeParts(parts);
    // world-space UV for the iron texture
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.7, uv.getY(k) * 0.7);
    const mat = psxMaterial(surfaceTexture('iron', 'gate', 32), { color: style === 'thorn' ? 0x9ab070 : 0xb8bcc8, roughness: 0.6, affine: false });
    return finish(geo, mat);
  }

  makeGate(o: Opening, midx: number, midz: number): DungeonGate {
    const len = Math.hypot(o.bx - o.ax, o.bz - o.az) - 1.4;
    const along = Math.abs(o.ux) > 0.5;
    const style: GateStyle = o.def.gateStyle ?? 'portcullis';
    const base = this.doorFloor(o, midx, midz);
    const { geo, mat, glow } = this.gateVisual(style, len, base);
    if (glow !== undefined) this.halo.add([midx, base + 1.6, midz], glow, { size: 3.2, flicker: 0.2, intensity: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = shouldCastShadow(mesh);
    mesh.receiveShadow = true;
    const grp = new THREE.Group();
    grp.name = `gate:${o.def.a}|${o.def.b}`;
    grp.add(mesh);
    grp.position.set(midx, base, midz);
    grp.rotation.y = along ? 0 : PI / 2;
    this.root.add(grp);
    markFadeable(grp);
    this.disposables.push(geo, mat);

    // nav cells along the opening line
    const cells: [number, number][] = [];
    const ca = along ? Math.round(Math.min(o.ax, o.bx)) : Math.round(Math.min(o.az, o.bz));
    const cb = along ? Math.round(Math.max(o.ax, o.bx)) : Math.round(Math.max(o.az, o.bz));
    for (let c = ca + 1; c < cb; c++) cells.push(along ? [c, Math.round(o.az)] : [Math.round(o.ax), c]);
    const nav = this.nav;
    const anims = this.gateAnims;
    const center = new THREE.Vector3(midx, base, midz);
    const state = { open: true };
    const anim = { obj: grp, from: 0, to: 0, t: 1, dur: 0.9, done: true };
    anims.push(anim);
    const setNav = (walk: boolean) => { for (const [cx, cz] of cells) nav.setCell(cx, cz, walk ? 1 : 0); };
    const play = (open: boolean) => {
      if (state.open === open) return;
      state.open = open;
      anim.from = grp.position.y;
      anim.to = open ? base + 2.95 : base;
      anim.t = 0;
      anim.done = false;
      anim.dur = open ? 1.1 : 0.55;
      if (!open) setNav(false); // closes immediately for collision; the visual drops over 0.55 s
      else setNav(true);
      try {
        G.audio?.play('door_open', { pos: [midx, 1.5, midz], pitch: open ? 0.65 : 0.55, volume: 0.9 });
        if (!open) G.events?.emit('camera:shake', { intensity: 0.12, duration: 0.25 });
      } catch { /* optional */ }
    };
    // boss/forces gates start open (scenes close them); the visual starts raised
    grp.position.y = base + 2.95;
    const gate: DungeonGate = {
      open: () => play(true),
      close: () => play(false),
      object: grp,
      get isOpen() { return state.open; },
      kind: o.gate,
      a: o.def.a,
      b: o.def.b,
      center,
    };
    return gate;
  }

  // ---- 6. pillars in big rooms ----
  placeBigRoomPillars(): void {
    const rng = new RNG(hashString(this.def.id + ':pillars'));
    this.def.rooms.forEach((r, idx) => {
      const { x, z, w, h } = r.rect;
      if (w < 7 || h < 7 || r.explicitDecor) return;
      const bossRoom = this.def.bosses.some((b) => b.roomId === r.id);
      const ring = 2; // tiles inset
      const spots: [number, number][] = [];
      const step = bossRoom ? 5 : 3;
      for (let tx = x + ring; tx <= x + w - ring; tx += step) { spots.push([tx, z + ring]); spots.push([tx, z + h - ring]); }
      for (let tz = z + ring + step; tz < z + h - ring; tz += step) { spots.push([x + ring, tz]); spots.push([x + w - ring, tz]); }
      const ws = this.wallStyleOfRoom(idx);
      for (const [vx, vz] of spots) {
        const wx = vx * T, wz = vz * T;
        // vertex must be interior to this room
        if (this.tileRoom(vx - 1, vz - 1) !== idx || this.tileRoom(vx, vz - 1) !== idx || this.tileRoom(vx - 1, vz) !== idx || this.tileRoom(vx, vz) !== idx) continue;
        if (this.isAvoided(wx, wz, 1.5)) continue;
        if (rng.chance(0.12)) continue;
        const decorated = rng.chance(0.35);
        // decorated pillars face the room centre
        const cx = (x + w / 2) * T, cz = (z + h / 2) * T;
        const face = Math.atan2(cx - wx, cz - wz);
        // vertical rooms with a ceiling: the pillar stands on the floor and is stretched to the ceiling (§7.5), k = height / 4 m
        let wy = 0, sxz = 1, scale: number | [number, number, number] = 1;
        if (this.hf) {
          wy = this.hf.groundY(wx, wz);
          const top = this.hf.roomTop[idx]!;
          if (Number.isFinite(top)) {
            const k = THREE.MathUtils.clamp((top - wy) / VERT.CEIL_LEGACY, 0.75, 6);
            sxz = THREE.MathUtils.clamp(0.9 + 0.12 * (k - 1), 1, 1.8);
            scale = [sxz, k, sxz];
          }
        }
        this.batcher.add(D(decorated ? 'pillar_decorated' : 'pillar'), wx, wy, wz, decorated ? Math.round(face / (PI / 2)) * (PI / 2) : 0, scale, this.col(ws.tint, 0.08), { cast: true, receive: true });
        this.blockCircle(wx, wz, 0.85 * sxz);
        this.avoid.push({ x: wx, z: wz, r: 1.4 * sxz });
      }
    });
  }

  // ---- 7. torches / wall decor ----
  wallSlots(): WallSlot[] {
    const out: WallSlot[] = [];
    const { W, H } = this;
    for (let j = 0; j <= H; j++)
      for (let i = 0; i < W; i++) {
        if (!this.hasH(i, j)) continue;
        const north = this.tileRoom(i, j - 1), south = this.tileRoom(i, j);
        if (north >= 0) out.push({ kind: 'h', i, j, x: i * T + T / 2, z: j * T, nx: 0, nz: -1, room: north });
        if (south >= 0) out.push({ kind: 'h', i, j, x: i * T + T / 2, z: j * T, nx: 0, nz: 1, room: south });
      }
    for (let j = 0; j < H; j++)
      for (let i = 0; i <= W; i++) {
        if (!this.hasV(i, j)) continue;
        const west = this.tileRoom(i - 1, j), east = this.tileRoom(i, j);
        if (west >= 0) out.push({ kind: 'v', i, j, x: i * T, z: j * T + T / 2, nx: -1, nz: 0, room: west });
        if (east >= 0) out.push({ kind: 'v', i, j, x: i * T, z: j * T + T / 2, nx: 1, nz: 0, room: east });
      }
    return out;
  }

  slotPlain(s: WallSlot): boolean {
    const a = s.kind === 'h' ? s.j * (this.W + 1) + s.i : s.j * (this.W + 1) + s.i;
    const b = s.kind === 'h' ? s.j * (this.W + 1) + s.i + 1 : (s.j + 1) * (this.W + 1) + s.i;
    for (const k of [a, b]) {
      const v = this.variantAt.get(k);
      if (v === 'wall_cracked' || v === 'wall_shelves' || v === 'wall_broken') return false;
    }
    return true;
  }

  addTorch(x: number, y: number, z: number, rotY: number, color: number, model = true): void {
    if (model) this.batcher.add(TORCH, x, y, z, rotY, 1, null, { cast: false, receive: false });
    const fx = Math.sin(rotY), fz = Math.cos(rotY);
    // flame sits ~0.3 m off the wall at local (0, 0.7, 0.3)
    const px = x + fx * 0.3, py = y + 0.72, pz = z + fz * 0.3;
    this.flames.add([px, py - 0.12, pz], 0xffb040, { size: 0.55, flicker: 0.45, anchor: 1 });
    this.halo.add([px, py + 0.1, pz], color, { size: 2.9, flicker: 0.3, intensity: 0.4 });
    this.lights.add([px + fx * 0.35, py + 0.45, pz + fz * 0.35], { color, intensity: designToPhysical(2.0), distance: 11, flicker: 0.32 });
    this.torchPts.push({ x, z });
  }

  placeTorchesAndWallDecor(): void {
    const slots = this.wallSlots();
    const th = this.def.theme;
    const rng = new RNG(hashString(this.def.id + ':torches'));
    // per room: collect slots, space torches
    const byRoom = new Map<number, WallSlot[]>();
    for (const s of slots) {
      if (!byRoom.has(s.room)) byRoom.set(s.room, []);
      byRoom.get(s.room)!.push(s);
    }
    const nearTorch = (x: number, z: number, d: number) => this.torchPts.some((t) => Math.hypot(t.x - x, t.z - z) < d);
    for (const [ri, list] of [...byRoom.entries()].sort((a, b) => a[0] - b[0])) {
      const room = this.def.rooms[ri];
      const density = room.autoDecor ?? 0.3;
      const spacing = THREE.MathUtils.clamp(14.5 - density * 9, 8, 14);
      const tcol = room.lightColor ?? th.torchColor;
      const minDim = Math.min(room.rect.w, room.rect.h);
      const shuffled = rng.shuffle([...list]);
      let placed = 0;
      for (const s of shuffled) {
        if (nearTorch(s.x + s.nx * 0.5, s.z + s.nz * 0.5, spacing)) continue;
        if (!this.slotPlain(s)) continue;
        if (this.isAvoidedDoor(s.x, s.z, 3.2)) continue;
        if (minDim <= 2 && rng.chance(0.45)) continue; // corridors: fewer
        const wb = this.wallBaseTop(s.i, s.j);
        this.addTorch(s.x + s.nx * 0.5, wb.base + 2.5, s.z + s.nz * 0.5, Math.atan2(s.nx, s.nz), tcol, true);
        placed++;
        // tall vertical walls (H >= 10 m) get a second, higher torch every third slot (§7.3)
        if (this.hf && wb.top - wb.base >= 10 && placed % 3 === 0) {
          this.addTorch(s.x + s.nx * 0.5, wb.base + 0.6 * (wb.top - wb.base), s.z + s.nz * 0.5, Math.atan2(s.nx, s.nz), tcol, true);
        }
      }
      if (placed === 0 && list.length) {
        const s = list.find((q) => this.slotPlain(q)) ?? list[0];
        this.addTorch(s.x + s.nx * 0.5, this.wallBaseTop(s.i, s.j).base + 2.5, s.z + s.nz * 0.5, Math.atan2(s.nx, s.nz), tcol, true);
      }
    }
    // banners & hung trophies on plain straight walls
    const brng = new RNG(hashString(this.def.id + ':banners'));
    for (const s of slots) {
      const room = this.def.rooms[s.room];
      const density = room.autoDecor ?? 0.3;
      if (!this.slotPlain(s)) continue;
      if (this.isAvoidedDoor(s.x, s.z, 3)) continue;
      // banners hang at the VERTEX centred piece: pick vertices of straight 'wall' variants
      if (s.kind !== 'h' && s.kind !== 'v') continue;
      if (!brng.chance(0.05 + density * 0.14)) continue;
      const ws = this.wallStyleOfRoom(s.room);
      // use the slot's first vertex as banner centre when its piece is a plain 'wall'
      const vi = s.kind === 'h' ? s.i : s.i;
      const vj = s.kind === 'h' ? s.j : s.j;
      const key = vj * (this.W + 1) + vi;
      if (this.variantAt.get(key) !== 'wall') continue;
      const bx = s.kind === 'h' ? vi * T : s.x, bz = s.kind === 'h' ? s.z : vj * T;
      if (this.nearBanner(bx, bz)) continue;
      const colour = brng.pick(ws.banners);
      const kind = brng.pick(['banner_', 'banner_patternA_', 'banner_patternB_', 'banner_patternC_', 'banner_thin_', 'banner_shield_']);
      this.batcher.add(D(`${kind}${colour}`), bx, this.wallBaseTop(vi, vj).base, bz, Math.atan2(s.nx, s.nz), 1, this.col(0xffffff, 0.06), { cast: false, receive: true });
      this.bannerPts.push({ x: bx, z: bz });
    }
    // wall trophies / shelves / chains
    const hrng = new RNG(hashString(this.def.id + ':hung'));
    for (const s of slots) {
      const room = this.def.rooms[s.room];
      const density = room.autoDecor ?? 0.3;
      if (!this.slotPlain(s) || this.isAvoidedDoor(s.x, s.z, 3)) continue;
      if (this.nearTorch2(s.x, s.z, 3.2)) continue;
      const r = hrng.next();
      const set = DECOR[this.wallStyleIdOfRoom(s.room)] ?? DECOR.stone;
      const ox = s.x + s.nx * 0.5, oz = s.z + s.nz * 0.5;
      if (r < density * 0.07) {
        const url = hrng.pick(set.hung);
        const isShelf = url.includes('shelf_small_candles');
        const y = (isShelf ? 1.7 : 2.3) + this.wallBaseTop(s.i, s.j).base;
        this.batcher.add(url, ox, y, oz, Math.atan2(s.nx, s.nz), 1, this.col(0xffffff, 0.05), { cast: false, receive: false });
        if (isShelf) {
          this.halo.add([ox + s.nx * 0.3, y + 0.8, oz + s.nz * 0.3], 0xffb060, { size: 1.6, flicker: 0.4, intensity: 0.5 });
          this.flames.add([ox + s.nx * 0.28, y + 0.55, oz + s.nz * 0.28], 0xffc060, { size: 0.28, flicker: 0.5, anchor: 1 });
        }
        this.hungPts.push({ x: s.x, z: s.z });
      } else if (r < density * 0.07 + density * 0.05) {
        this.batcher.add(G_('chains_hanging'), ox + s.nx * 0.12, 4.0 + this.wallBaseTop(s.i, s.j).base, oz + s.nz * 0.12, Math.atan2(s.nx, s.nz), 1, this.col(0xffffff, 0.1), { cast: false, receive: false });
        this.hungPts.push({ x: s.x, z: s.z });
      }
    }
    // cobwebs in room corners
    this.placeCobwebs();
  }

  bannerPts: { x: number; z: number }[] = [];
  hungPts: { x: number; z: number }[] = [];
  nearBanner(x: number, z: number): boolean {
    return this.bannerPts.some((b) => Math.hypot(b.x - x, b.z - z) < 5);
  }
  nearTorch2(x: number, z: number, d: number): boolean {
    return this.torchPts.some((t) => Math.hypot(t.x - x, t.z - z) < d) || this.hungPts.some((t) => Math.hypot(t.x - x, t.z - z) < d) || this.bannerPts.some((t) => Math.hypot(t.x - x, t.z - z) < d);
  }

  placeCobwebs(): void {
    const rng = new RNG(hashString(this.def.id + ':webs'));
    const items: { x: number; y: number; z: number; rot: number; mirror: boolean }[] = [];
    const { W, H } = this;
    for (let j = 0; j <= H; j++)
      for (let i = 0; i <= W; i++) {
        const tiles = [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]] as const;
        const rooms = tiles.map(([a, b]) => this.tileRoom(a, b));
        const walkable = rooms.filter((r) => r >= 0).length;
        if (walkable !== 1) continue;
        if (!rng.chance(0.55)) continue;
        const q = rooms.findIndex((r) => r >= 0);
        const sx = q % 2 === 0 ? -1 : 1, sz = q < 2 ? -1 : 1; // quadrant direction from the vertex
        const room = this.def.rooms[rooms[q]];
        if (Math.min(room.rect.w, room.rect.h) <= 2 && rng.chance(0.5)) continue;
        const x = i * T + sx * 0.52, z = j * T + sz * 0.52;
        // one web per wall that meets in the corner
        // wall A runs along X (face normal along sz), wall B runs along Z (face normal along sx)
        const cy = this.wallBaseTop(i, j).base + 3.9;
        items.push({ x, y: cy, z: j * T + sz * 0.52, rot: sz > 0 ? 0 : PI, mirror: sx < 0 });
        items.push({ x: i * T + sx * 0.52, y: cy, z, rot: sx > 0 ? PI / 2 : -PI / 2, mirror: sz > 0 });
      }
    if (!items.length) return;
    const tex = cobwebTexture(64);
    const geo = new THREE.PlaneGeometry(1.7, 1.7);
    geo.translate(0.85, -0.85, 0);
    const mat = psxMaterial(tex, { color: 0xdedede, alphaTest: 0.5, side: THREE.DoubleSide, affine: false, roughness: 1 });
    mat.emissive = new THREE.Color(0x303038);
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    items.forEach((it, k) => {
      q.setFromAxisAngle(Y, it.rot);
      p.set(it.x, it.y, it.z);
      s.set(it.mirror ? -1 : 1, 1, 1);
      m.compose(p, q, s);
      im.setMatrixAt(k, m);
    });
    this.root.add(im);
    this.disposables.push(tex, geo, mat, im);
  }

  // ---- 8. clutter ----
  placeClutter(): void {
    this.def.rooms.forEach((room, idx) => {
      const density = room.autoDecor ?? 0.3;
      if (density <= 0) return;
      const rng = new RNG(hashString(this.def.id + ':clutter:' + room.id));
      const set = DECOR[this.wallStyleIdOfRoom(idx)] ?? DECOR.stone;
      const ws = this.wallStyleOfRoom(idx);
      const { x, z, w, h } = room.rect;
      const minDim = Math.min(w, h);
      const color = () => this.col(ws.tint, 0.15);
      // corner clutter: convex room corners (tile with two perpendicular walls)
      if (minDim >= 3 && !room.explicitDecor) {
        const corners: [number, number, number, number][] = [
          [x, z, 1, 1], [x + w - 1, z, -1, 1], [x, z + h - 1, 1, -1], [x + w - 1, z + h - 1, -1, -1],
        ];
        for (const [tx, tz, sx, sz] of corners) {
          if (this.tileRoom(tx, tz) !== idx) continue;
          // both outer edges must be walls
          const wallA = sz > 0 ? this.hasH(tx, tz) : this.hasH(tx, tz + 1);
          const wallB = sx > 0 ? this.hasV(tx, tz) : this.hasV(tx + 1, tz);
          if (!wallA || !wallB) continue;
          if (!rng.chance(0.3 + density * 0.65)) continue;
          const cx = tx * T + (sx > 0 ? 1.7 : T - 1.7), cz = tz * T + (sz > 0 ? 1.7 : T - 1.7);
          if (this.isAvoided(cx, cz, 1.6)) continue;
          const url = rng.chance(0.45) ? rng.pick(set.big) : rng.pick(set.small);
          this.placeDecor(url, cx, cz, rng.range(0, PI * 2), rng, color(), true);
          // a second small piece next to it
          if (rng.chance(0.5)) {
            const ox = cx + sx * 1.6 * (rng.chance(0.5) ? 1 : 0.1), oz = cz + sz * 1.6 * (rng.chance(0.5) ? 0.1 : 1);
            if (!this.isAvoided(ox, oz, 1.2)) this.placeDecor(rng.pick(set.small), ox, oz, rng.range(0, PI * 2), rng, color(), true);
          }
        }
      }
      // along-wall small clutter
      const slotsHere = this.wallSlots().filter((s) => s.room === idx);
      for (const s of slotsHere) {
        if (room.explicitDecor || !rng.chance(density * 0.06)) continue;
        const px = s.x + s.nx * 1.1, pz = s.z + s.nz * 1.1;
        if (this.isAvoided(px, pz, 1.4) || (minDim <= 2 && rng.chance(0.7))) continue;
        this.placeDecor(rng.pick(set.small), px, pz, Math.atan2(s.nx, s.nz) + rng.range(-0.4, 0.4), rng, color(), true);
        this.avoid.push({ x: px, z: pz, r: 1.1 });
      }
      // floor scatter: bones, candles, rubble (non-blocking)
      const area = w * h;
      const n = Math.round(area * (0.1 + density * 0.55) * (minDim <= 2 ? 0.4 : 1));
      for (let k = 0; k < n; k++) {
        const tx = x + rng.int(0, w - 1), tz = z + rng.int(0, h - 1);
        if (this.tileRoom(tx, tz) !== idx) continue;
        const px = tx * T + rng.range(0.9, T - 0.9), pz = tz * T + rng.range(0.9, T - 0.9);
        if (this.isAvoided(px, pz, 0.4)) continue;
        const url = rng.pick(set.floor);
        this.placeDecor(url, px, pz, rng.range(0, PI * 2), rng, color(), false);
      }
      // braziers in big rooms
      if (w >= 8 && h >= 8 && density >= 0.3 && !room.explicitDecor) {
        const bossRoom = this.def.bosses.some((b) => b.roomId === room.id);
        const spots: [number, number][] = [[x + 1.3, z + 1.3], [x + w - 1.3, z + 1.3], [x + 1.3, z + h - 1.3], [x + w - 1.3, z + h - 1.3]];
        for (const [bx, bz] of spots) {
          if (!bossRoom && rng.chance(0.4)) continue;
          const wx = bx * T, wz = bz * T;
          if (this.tileRoom(Math.floor(bx), Math.floor(bz)) !== idx || this.isAvoided(wx, wz, 1.5)) continue;
          this.pendingBraziers.push({ x: wx, z: wz, color: room.lightColor ?? this.def.theme.torchColor });
          this.avoid.push({ x: wx, z: wz, r: 1.5 });
        }
      }
    });
  }

  pendingBraziers: { x: number; z: number; color: number }[] = [];
  animProps: Promise<void>[] = [];

  placeDecor(url: string, x: number, z: number, rot: number, rng: RNG, color: THREE.Color, collide: boolean): void {
    const scale = 0.92 + rng.next() * 0.2;
    const fy = this.floorAt(x, z);
    this.batcher.add(url, x, fy + 0.02, z, rot, scale, color, { cast: true, receive: true });
    this.decorMeta.push({ url, x, z, rot, scale, collide });
    // glowing decor
    const base = baseName(url);
    if (base === 'candle_lit' || base === 'candle_thin_lit') this.halo.add([x, fy + 1.1, z], 0xffb070, { size: 1.4, flicker: 0.4, intensity: 0.5 });
    if (base === 'crystal_blue' || base === 'crystal_purple') {
      const l = propLightFor(url)!;
      this.halo.add([x, fy + 1.1, z], l.color, { size: l.halo ?? 3, flicker: 0.1, intensity: 0.6 });
    }
  }
  decorMeta: { url: string; x: number; z: number; rot: number; scale: number; collide: boolean }[] = [];

  // ---- 9. content props ----
  placeProps(): void {
    for (const room of this.def.rooms) {
      for (const p of room.props ?? []) this.addProp(p, room);
    }
  }

  addProp(p: PropPlacement, room: RoomDef): void {
    const x = tc(p.pos[0]), z = tc(p.pos[1]);
    const rot = ((p.rot ?? 0) * PI) / 180;
    const scale = p.scale ?? 1;
    // vertical dungeons: props stand on the floor under them (§7.6); legacy: the offset alone
    const y = this.hf ? this.hf.groundY(x, z) + (p.y ?? 0) : p.y ?? 0;
    const piece = getPiece(p.model); // preloaded by buildDungeon (dungeonAssetUrls lists every prop model)
    const sz = piece?.size ?? new THREE.Vector3(1, 1, 1);
    const topY = (piece?.box.max.y ?? 1) * scale;
    const animated = isAnimatedModel(p.model);
    const posed = !!p.pose;
    // P-19: spin / bob need their own object (batched instances cannot move)
    const motion = p.spin !== undefined || p.bob !== undefined;
    const individual = !animated && (motion || p.emissive !== undefined || p.opacity !== undefined || posed || !!p.show || p.id !== undefined || (p.tag !== undefined && INDIVIDUAL_TAGS.has(p.tag)));
    const preset = propLightFor(p.model);
    const lspec = p.light
      ? { color: p.light.color, intensity: designToPhysical(p.light.intensity), distance: p.light.distance, flicker: p.light.flicker ? 0.3 : 0.05, y: p.light.y ?? topY * 0.85 }
      : null;
    const handle = p.tag !== undefined || p.id !== undefined ? new PropHandle(this.nav, p, room.id, x, y, z, rot) : null;
    if (handle) this.propHandles.push(handle);

    // footprint: keeps the seeded auto-decor off the prop, and marks nav when `collide`
    this.avoid.push({ x, z, r: posed ? 0.8 * scale + 0.5 : Math.max(sz.x, sz.z) * scale * 0.5 + 0.6 });
    if (/^torch/.test(baseName(p.model))) this.torchPts.push({ x, z });
    // P-07 shorthand: a looping ambience anchored on this prop (radius 14 m, volume 0.6)
    if (p.sfx) this.addAmbience(p.sfx, x, z, 14, 0.6, true);
    // P-19 light shaft: an additive cone with drifting motes, no real light and no model
    if (p.tag === 'lightshaft') {
      this.addLightShaft(p, x, y, z, scale, handle);
      return;
    }
    // posed character statues measure their collider from the SKINNED bounds once the instance exists (see below); the fixed
    // square is only the fallback for a missing model.
    if (p.collide && !posed) {
      let cells: [number, number][];
      if (!piece) cells = this.blockRect(x, z, 0.55 * scale, 0.55 * scale, 0);
      else {
        const hx = (sz.x * scale) / 2, hz = (sz.z * scale) / 2;
        const c = piece.box.getCenter(new THREE.Vector3());
        const cxw = x + (c.x * Math.cos(rot) + c.z * Math.sin(rot)) * scale;
        const czw = z + (-c.x * Math.sin(rot) + c.z * Math.cos(rot)) * scale;
        cells = this.blockRect(cxw, czw, hx * 0.92, hz * 0.92, rot);
      }
      if (handle) handle.cells = cells;
    }

    // lights / glow / emitters that do not depend on the instantiated object
    if (!animated) {
      if (!lspec && preset) {
        const lp = new THREE.Vector3(x, y + preset.y * scale, z);
        this.lights.add(lp, { color: preset.color, intensity: designToPhysical(preset.intensity), distance: preset.distance, flicker: preset.flicker });
        if (preset.halo) this.halo.add(lp, preset.color, { size: preset.halo, flicker: preset.flicker, intensity: 0.5 });
        if (preset.flame) this.flames.add([lp.x, lp.y - 0.25, lp.z], 0xffb040, { size: preset.flame * scale, flicker: 0.45, anchor: 1 });
      }
      if (p.vfx) this.spawnEmitter(p.vfx, [x, y + topY * 0.6, z], 1);
    }
    if (lspec) {
      const lp = new THREE.Vector3(x, y + lspec.y, z);
      this.lights.add(lp, lspec);
      this.halo.add(lp, lspec.color, { size: Math.min(7, lspec.distance * 0.45), flicker: lspec.flicker, intensity: 0.5 });
    }

    // visuals
    if (animated) {
      this.animProps.push((async () => {
        const h: AnimatedPropHandle = await spawnAnimatedProp(p.model);
        h.object.position.set(x, y, z);
        h.object.rotation.y = rot;
        h.object.scale.setScalar(scale);
        this.root.add(h.object);
        h.refreshAnchors();
        this.propUpdaters.push(h.update);
        if (handle) handle.object = h.object;
        const lp = h.lightPos ?? new THREE.Vector3(x, y + (preset?.y ?? 1.2) * scale, z);
        if (!lspec && preset) {
          this.lights.add(lp, { color: preset.color, intensity: designToPhysical(preset.intensity), distance: preset.distance, flicker: preset.flicker });
          if (preset.halo) this.halo.add(lp, preset.color, { size: preset.halo, flicker: preset.flicker, intensity: 0.5 });
        }
        for (const fp of h.flamePos) this.halo.add(fp, preset?.color ?? 0xffa040, { size: 1.2 * scale, flicker: 0.4, intensity: 0.6 });
        for (const f of h.fxPos) if (p.vfx) this.spawnEmitter(p.vfx, [f.x, f.y, f.z], 1);
        if (p.vfx && !h.fxPos.length) this.spawnEmitter(p.vfx, [x, y + topY * 0.6, z], 1);
        if (handle?.hidden) h.object.visible = false;
      })());
    } else if (individual) {
      this.animProps.push((async () => {
        const obj = await spawnStaticObject(p.model, { tint: p.tint, emissive: p.emissive, emissiveIntensity: p.emissiveIntensity, opacity: p.opacity, pose: p.pose, show: p.show, ownMaterials: handle !== null });
        if (!obj) {
          if (p.collide && posed) { const cells = this.blockRect(x, z, 0.55 * scale, 0.55 * scale, 0); if (handle) handle.cells = cells; }
          return;
        }
        obj.position.set(x, y, z);
        obj.rotation.y = rot;
        obj.scale.setScalar(scale);
        if (motion) this.attachMotion(p, obj, y);
        if (p.collide && posed) {
          // collider from the posed (frozen first frame) body: the lower 60 % of the skinned vertices, not the T-pose bind box
          const fp = posedFootprint(obj);
          const cells = fp
            ? this.blockRect((fp.x0 + fp.x1) / 2, (fp.z0 + fp.z1) / 2, Math.max(0.35, ((fp.x1 - fp.x0) / 2) * 0.92), Math.max(0.35, ((fp.z1 - fp.z0) / 2) * 0.92), 0)
            : this.blockRect(x, z, 0.55 * scale, 0.55 * scale, 0);
          if (handle) handle.cells = cells;
        }
        this.root.add(obj);
        applyShadowPolicy(obj, p.opacity === undefined);
        obj.traverse((n) => {
          const m = n as THREE.Mesh;
          if (m.isMesh) m.receiveShadow = true;
        });
        // a handled prop is moved, hidden or swapped by its entity: only untouched decor is frozen
        if (handle) {
          handle.object = obj;
          if (handle.hidden) obj.visible = false;
        } else if (!motion) {
          freezeStatic(obj);
        }
      })());
    } else {
      this.batcher.add(p.model, x, y, z, rot, scale, this.col(p.tint ?? 0xffffff, 0.04), { cast: true, receive: true });
    }
    void room;
  }

  /** P-19: spin (deg/s about Y, of the `spinNode` child when named) and bob [amp, hz], ticked with the builder clock. */
  attachMotion(p: PropPlacement, obj: THREE.Object3D, y: number): void {
    const spinObj = (p.spinNode ? obj.getObjectByName(p.spinNode) : undefined) ?? obj;
    const spinRate = ((p.spin ?? 0) * PI) / 180;
    const [amp, hz] = p.bob ?? [0, 0];
    this.addUpdater((dt, t) => {
      if (spinRate) spinObj.rotation.y += spinRate * dt;
      if (amp) obj.position.y = y + amp * Math.sin(2 * PI * hz * t);
    });
  }

  /** P-19 `tag: 'lightshaft'`: an additive cone (3 x 8 m at scale 1, `tint`, `opacity` default 0.18) with drifting motes. No light. */
  addLightShaft(p: PropPlacement, x: number, y: number, z: number, scale: number, handle: PropHandle | null): void {
    const w = 3 * scale, h = 8 * scale;
    const color = p.tint ?? 0xfff0c0;
    const grp = new THREE.Group();
    grp.name = `lightshaft:${this.def.id}`;
    grp.position.set(x, y, z);
    const geo = new THREE.CylinderGeometry(w * 0.18, w * 0.5, h, 16, 1, true).translate(0, h / 2, 0);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: p.opacity ?? 0.18, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.renderOrder = 4;
    grp.add(cone);
    // drifting motes inside the shaft (their own rng, so the layout rng stays the same)
    const rng = new RNG(hashString(`${this.def.id}:motes:${x}:${z}`));
    const N = 16;
    const pos = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) {
      const a = rng.range(0, PI * 2), rr = rng.range(0, w * 0.45);
      pos[k * 3] = Math.cos(a) * rr;
      pos[k * 3 + 1] = rng.range(0, h);
      pos[k * 3 + 2] = Math.sin(a) * rr;
    }
    const mgeo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(pos, 3);
    mgeo.setAttribute('position', attr);
    const mmat = new THREE.PointsMaterial({
      color, size: 0.09, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, toneMapped: false,
    });
    grp.add(new THREE.Points(mgeo, mmat));
    this.root.add(grp);
    if (handle) handle.object = grp;
    this.disposables.push(geo, mat, mgeo, mmat);
    this.addUpdater((dt) => {
      for (let k = 0; k < N; k++) {
        const v = pos[k * 3 + 1]! + dt * 0.25;
        pos[k * 3 + 1] = v > h ? v - h : v;
      }
      attr.needsUpdate = true;
    });
  }

  // ---- shared helpers ----
  isAvoided(x: number, z: number, pad: number): boolean {
    for (const a of this.avoid) if (Math.hypot(a.x - x, a.z - z) < a.r + pad) return true;
    const zf = this.zf;
    if (zf && zf.any) {
      const p = Math.min(pad, 1.6);
      if (zf.blockedAt(x, z) || zf.blockedAt(x + p, z) || zf.blockedAt(x - p, z) || zf.blockedAt(x, z + p) || zf.blockedAt(x, z - p)) return true;
    }
    return false;
  }
  isAvoidedDoor(x: number, z: number, pad: number): boolean {
    for (const o of this.openings) {
      // distance to the opening segment
      const px = x - o.ax, pz = z - o.az;
      const len = Math.hypot(o.bx - o.ax, o.bz - o.az);
      const t = Math.max(0, Math.min(len, px * o.ux + pz * o.uz));
      if (Math.hypot(px - o.ux * t, pz - o.uz * t) < pad) return true;
    }
    return false;
  }

  blockCircle(x: number, z: number, r: number): void {
    this.nav.setCircle(x, z, r - 0.2, false);
  }
  /** Blocks the cells under a rotated box. Returns the cells that were walkable before (so a prop can give them back). */
  blockRect(cx: number, cz: number, hx: number, hz: number, rot: number): [number, number][] {
    const nav = this.nav;
    const m = 0.28;
    const rad = Math.hypot(hx, hz) + 1;
    const c0 = nav.cx(cx - rad), c1 = nav.cx(cx + rad), r0 = nav.cz(cz - rad), r1 = nav.cz(cz + rad);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const changed: [number, number][] = [];
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const dx = nav.centerX(c) - cx, dz = nav.centerZ(r) - cz;
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        if (Math.abs(lx) <= hx + m && Math.abs(lz) <= hz + m) {
          if (nav.cell(c, r) > 0) changed.push([c, r]);
          nav.setCell(c, r, 0);
        }
      }
    return changed;
  }

  spawnEmitter(id: VfxId, pos: [number, number, number], scale: number): void {
    this.emitters.push({ id, pos, scale, handle: null });
  }

  // ---- finalize ----
  async finalize(): Promise<void> {
    // braziers (animated gen prop) need loading; decor collisions
    for (const b of this.pendingBraziers) {
      this.animProps.push((async () => {
        const h = await spawnAnimatedProp(G_('brazier'));
        const bf = this.floorAt(b.x, b.z);
        h.object.position.set(b.x, bf, b.z);
        this.root.add(h.object);
        h.refreshAnchors();
        this.propUpdaters.push(h.update);
        const lp = h.lightPos ?? new THREE.Vector3(b.x, bf + 1.45, b.z);
        this.lights.add(lp, { color: b.color, intensity: designToPhysical(2.4), distance: 12, flicker: 0.3 });
        this.halo.add(lp, b.color, { size: 5, flicker: 0.3, intensity: 0.55 });
        for (const fp of h.flamePos) this.flames.add([fp.x, fp.y - 0.4, fp.z], 0xffb040, { size: 1.3, flicker: 0.45, anchor: 1 });
        this.blockCircle(b.x, b.z, 0.9);
      })());
    }
    // ambient vfx per room
    for (const room of this.def.rooms) {
      if (!room.ambientVfx) continue;
      const rng = new RNG(hashString(this.def.id + ':amb:' + room.id));
      const count = THREE.MathUtils.clamp(Math.round((room.rect.w * room.rect.h) / 24), 1, 6);
      for (let k = 0; k < count; k++) {
        const px = (room.rect.x + rng.range(0.15, 0.85) * room.rect.w) * T, pz = (room.rect.z + rng.range(0.15, 0.85) * room.rect.h) * T;
        this.spawnEmitter(room.ambientVfx, [px, 1.8, pz], 1);
      }
    }
    // boss arena rings
    this.buildBossRings();
    // collisions for batched decor with `collide`
    for (const d of this.decorMeta) {
      if (!d.collide) continue;
      const pc = getPiece(d.url);
      if (!pc) continue;
      const hx = (pc.size.x * d.scale) / 2, hz = (pc.size.z * d.scale) / 2;
      if (Math.max(hx, hz) < 0.25) continue;
      const cc = pc.box.getCenter(new THREE.Vector3());
      const cxw = d.x + (cc.x * Math.cos(d.rot) + cc.z * Math.sin(d.rot)) * d.scale;
      const czw = d.z + (-cc.x * Math.sin(d.rot) + cc.z * Math.cos(d.rot)) * d.scale;
      this.blockRect(cxw, czw, hx * 0.85, hz * 0.85, d.rot);
    }
    if (!this.outdoor) this.zf.build();
    // one broken prop must never take the whole dungeon down
    await Promise.all(this.animProps.map((p) => p.catch((e) => console.warn('[world] prop failed', e))));
    this.halo.build();
    this.flames.build();
    const missing = await this.batcher.build();
    // streamed zone: the ring around the entry point is built behind the loading screen (needs the staged hand-placed groups)
    try {
      this.worldDecor?.primeStream(this.startPos.x, this.startPos.z);
    } catch (e) {
      console.warn('[world] streamed ring failed to build at load, streaming continues in the first frames', e);
    }
    if (missing.length) console.warn(`[world] ${missing.length} dungeon pieces missing`, missing.slice(0, 8));
    // decor collisions must be computed after pieces are loaded -> run again for the ones the first pass skipped
    for (const d of this.decorMeta) {
      if (!d.collide) continue;
      const pc = getPiece(d.url);
      if (!pc) continue;
      const hx = (pc.size.x * d.scale) / 2, hz = (pc.size.z * d.scale) / 2;
      if (Math.max(hx, hz) < 0.25) continue;
      const cc = pc.box.getCenter(new THREE.Vector3());
      const cxw = d.x + (cc.x * Math.cos(d.rot) + cc.z * Math.sin(d.rot)) * d.scale;
      const czw = d.z + (-cc.x * Math.sin(d.rot) + cc.z * Math.cos(d.rot)) * d.scale;
      this.blockRect(cxw, czw, hx * 0.85, hz * 0.85, d.rot);
    }
    // keep spawn / door areas clear even if decor landed near them
    this.clearSpawnAreas();
    this.scene.add(this.root);
  }

  clearSpawnAreas(): void {
    const nav = this.nav;
    const clear = (x: number, z: number, r: number) => {
      for (let cz = Math.floor(z - r); cz <= Math.ceil(z + r); cz++)
        for (let cx = Math.floor(x - r); cx <= Math.ceil(x + r); cx++) {
          if (Math.hypot(cx - x, cz - z) > r) continue;
          const i = Math.floor(cx / T), j = Math.floor(cz / T);
          // only restore cells that were walkable by layout (inside a tile, not on wall lines)
          if (cx % T !== 0 && cz % T !== 0 && this.tileRoom(i, j) >= 0) nav.setCell(cx, cz, 1);
        }
    };
    clear(this.startPos.x, this.startPos.z, 2.2);
    clear(this.exitPos.x, this.exitPos.z, 2.2);
  }

  buildBossRings(): void {
    if (!this.def.bosses.length) return;
    const tex = G.assets.texture('/assets/textures/vfx/magic-circle-01.png', { repeat: false });
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2);
    this.disposables.push(geo);
    for (const b of this.def.bosses) {
      const room = this.def.rooms.find((r) => r.id === b.roomId);
      const color = new THREE.Color(room?.lightColor ?? this.def.theme.torchColor);
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: color.multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(12);
      m.position.set(tc(b.pos[0]), 0.09, tc(b.pos[1]));
      m.renderOrder = 2;
      m.name = `boss_ring:${b.bossId}`;
      this.root.add(m);
      this.bossRingMats.push(mat);
      this.disposables.push(mat);
      this.propUpdaters.push((dt) => { m.rotation.y += dt * 0.12; });
    }
  }

  // ---- runtime ----
  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    worldFocus(this.focus);
    this.lights.update(dt, this.focus);
    this.halo.update(this.time);
    this.flames.update(this.time);
    for (const u of this.propUpdaters) u(dt, this.time);
    this.updateFog(dt);
    this.tickSky(dt);
    this.tickAmbience(dt);
    this.os?.update(dt, this.time);
    if (this.worldDecor) {
      this.worldDecor.setPlayerPos(this.focus.x, this.focus.z);
      this.worldDecor.update(dt);
    }
    const gy = this.relief ? this.relief.groundY(this.focus.x, this.focus.z) : 0;
    if (this.moon) followShadowBox(this.moon, this.focus, this.moonDir, 50, gy);
    if (this.fill) {
      this.fill.target.position.set(this.focus.x, gy, this.focus.z);
      this.fill.position.set(this.focus.x + this.rimDir.x * 50, gy + this.rimDir.y * 50, this.focus.z + this.rimDir.z * 50);
      this.fill.target.updateMatrixWorld();
    }
    for (const a of this.gateAnims) {
      if (a.done) continue;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = a.to > a.from ? 1 - Math.pow(1 - a.t, 2) : a.t * a.t * a.t; // raise eases out, drop accelerates
      a.obj.position.y = a.from + (a.to - a.from) * e;
      if (a.t >= 1) a.done = true;
    }
    this.emitterTimer -= dt;
    if (this.emitterTimer <= 0) {
      this.emitterTimer = 0.5;
      this.updateEmitters();
    }
  }

  /** Rooms may override the fog (open courtyards...): blend towards the room the focus point stands in. */
  updateFog(dt: number): void {
    // the open world blends its own region atmosphere (WorldDecor), room fog overrides do not apply there
    if (this.worldDecor) return;
    const fog = this.fog;
    if (!fog) return;
    const th = this.def.theme;
    const ri = this.tileRoom(Math.floor(this.focus.x / T), Math.floor(this.focus.z / T));
    const room = ri >= 0 ? this.def.rooms[ri] : undefined;
    // P-11: a room's own fog wins, else its named atmosphere (DungeonDef.atmospheres); both blend in like fog
    const o = room?.fog ?? (room?.atmosphere ? this.def.atmospheres?.[room.atmosphere] : undefined);
    const tg = this.fogTarget;
    if (o) {
      tg.color.set(o.color ?? th.fogColor);
      tg.near = o.near ?? th.fogNear;
      tg.far = o.far ?? th.fogFar;
    } else {
      tg.color.copy(this.themeFogColor);
      tg.near = th.fogNear;
      tg.far = th.fogFar;
    }
    const k = 1 - Math.exp(-dt * 1.6);
    fog.color.lerp(tg.color, k);
    fog.near += (tg.near - fog.near) * k;
    fog.far += (tg.far - fog.far) * k;
    const bg = this.scene.background;
    if (bg && (bg as THREE.Color).isColor) (bg as THREE.Color).copy(fog.color);
    if (Math.abs(fog.near - this.lastHaloFog.near) > 0.4 || Math.abs(fog.far - this.lastHaloFog.far) > 0.4) {
      this.lastHaloFog.near = fog.near;
      this.lastHaloFog.far = fog.far;
      this.halo.setFog(fog.near * 0.9, fog.far * 1.1);
      this.flames.setFog(fog.near * 0.9, fog.far * 1.1);
    }
  }

  updateEmitters(): void {
    for (const e of this.emitters) {
      const d = Math.hypot(e.pos[0] - this.focus.x, e.pos[2] - this.focus.z);
      const want = d < 42;
      if (want && (!e.handle || !e.handle.alive)) {
        try { e.handle = G.vfx.spawn(e.id, e.pos, { scale: e.scale }); } catch { e.handle = null; }
      } else if (!want && e.handle) {
        try { e.handle.stop(); } catch { /* ignore */ }
        e.handle = null;
      }
    }
  }

  dispose(): void {
    for (const e of this.emitters) { try { e.handle?.stop(); } catch { /* ignore */ } e.handle = null; }
    this.emitters.length = 0;
    this.lights.dispose();
    this.batcher.dispose();
    this.halo.dispose();
    this.flames.dispose();
    this.worldDecor?.dispose();
    this.worldDecor = null;
    this.skyDome?.dispose();
    this.skyDome = null;
    this.os?.dispose();
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (o.userData.ownGeometry || o.parent?.name.startsWith('gate:'))) m.geometry?.dispose();
    });
    for (const d of this.disposables) { try { d.dispose(); } catch { /* ignore */ } }
    this.disposables.length = 0;
    this.moon?.dispose();
    this.fill?.dispose();
    this.fill = null;
    // back to the player's own bloom settings (the town and menus never set a scene override)
    try { setSceneBloom(null); } catch { /* harness without engine */ }
    if (this.scene.fog !== null && this.prevFog !== undefined) this.scene.fog = this.prevFog;
    if (this.prevBg !== undefined) this.scene.background = this.prevBg;
  }
}

// ---------------------------------------------------------------------------
// Public: build
// ---------------------------------------------------------------------------

/**
 * Turns a DungeonDef (tile rooms + doors + props) into KayKit-dungeon geometry: floors, walls (auto from
 * walkable/non-walkable edges), corners, doorways, pillars, props, torches with flickering lights,
 * seeded auto-decor, theme lighting/fog, and fills the NavGrid (cell size 1).
 * Must be deterministic for the same def (all peers build identical dungeons).
 * OWNER: world module.
 */
export async function buildDungeon(def: DungeonDef, scene: THREE.Scene): Promise<BuiltDungeon> {
  const b = new DungeonBuild(def, scene);
  // preload everything we know we need (also warms the loading screen cache)
  await loadPieces(dungeonAssetUrls(def));
  await b.build();
  const bounds = new THREE.Box3(
    new THREE.Vector3(b.walkMin.x, b.relief ? Math.min(0, b.relief.stats.minY) : 0, b.walkMin.y),
    new THREE.Vector3(b.walkMax.x, b.relief ? b.relief.stats.maxY + 4 : 4, b.walkMax.y),
  );
  const built: BuiltDungeon = {
    root: b.root,
    nav: b.nav,
    start: b.startPos,
    startYaw: b.startYaw,
    exit: b.exitPos,
    gates: b.gates,
    update: (dt) => b.update(dt),
    dispose: () => b.dispose(),
    roomAt: (x, z) => {
      const i = Math.floor(x / T), j = Math.floor(z / T);
      const r = b.tileRoom(i, j);
      return r >= 0 ? def.rooms[r] : null;
    },
    tiles: b.roomIdx,
    grid: { w: b.W, h: b.H },
    bounds,
    lights: b.lights,
    lighting: { hemi: b.hemi!, ambient: b.ambient!, moon: b.moon! },
    zones: b.zf.zones,
    zoneAt: (x, z) => b.zf.zoneAt(x, z),
    hazardAt: (x, z) => b.zf.hazardAt(x, z),
    props: b.propHandles,
    propById: (id) => b.propHandles.find((q) => q.id === id),
    get fog() { return b.fog; },
    world: b.worldDecor,
    hf: b.hf,
    relief: b.relief,
    groundY: (x, z) => b.floorAt(x, z),
    ceilingY: (x, z) => (b.hf ? b.hf.ceilingY(x, z) : Infinity),
    roomTop: (idx) => (b.hf ? (b.hf.roomTop[idx] ?? Infinity) : Infinity),
    ambience: b.ambience,
  };
  return built;
}
