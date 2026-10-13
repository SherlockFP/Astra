import * as THREE from 'three';
import { G } from '../game/G';
import { RNG, hashString } from '../core/utils';
import type { TownDef, TownProp } from '../types/dungeons';
import { NavGrid } from './NavGrid';
import { ChunkCuller, InstanceBatcher, type CullLayer } from './Instancing';
import { getPiece, loadPieces } from './Pieces';
import { GlowField } from './Glow';
import { ParticleField } from './Particles';
import { LightPool, MAX_REAL_LIGHTS, designToPhysical } from './LightPool';
import { Sky, GOLDEN_HOUR_SKY, makeMountainRing } from './Sky';
import { createTerrain, type SplatOp, type Terrain } from './Terrain';
import { glowTexture, flameTexture, canvasTexture, makeCanvas, sharedTexture } from './ProceduralAssets';
import { baseName, isAnimatedModel, propLightFor, spawnAnimatedProp, spawnStaticObject, worldFocus, type PropLightSpec } from './Decor';
import { configureShadowBox, followShadowBox } from './ShadowFollow';
import { Assets } from '../core/Assets';
import { isPSXPatched, patchPSX } from '../render/psx';
import { applyShadowPolicy, shouldCastShadow } from '../render/shadowPolicy';
import { freezeStatic } from '../render/staticTransforms';
import { psxMaterial, surfaceTexture, mulHex, worldUVBox } from './ProceduralAssets';
import type { VfxId } from '../types/vfx';

/** Points of interest of the default hub layout (world coordinates, y = 0). Scenes/NPCs may use them. */
export const TOWN_POIS = {
  /** First-login spawn on the plaza (facing the fountain / north). */
  spawn: { x: 0, z: 26, yaw: Math.PI },
  /** Arrival from a dungeon: in front of the portal hall. */
  arrival: { x: 0, z: -38, yaw: 0 },
  plaza: { x: 0, z: 8, r: 14 },
  fountain: { x: 0, z: 8, r: 4.4 },
  fontOfPower: { x: 0, z: -41.5 },
  mplusPortal: { x: 0, z: -57.5 },
  portalHall: { x: 0, z: -44, hw: 24, hd: 15 },
  lobbyObelisk: { x: -8, z: 18 },
  noticeBoard: { x: 8, z: 18 },
  waypointStone: { x: 12, z: 46 },
  blacksmith: { x: 24, z: -6 },
  enchanter: { x: 24, z: 8 },
  market: { x: -24, z: -8 },
  alchemist: { x: -24, z: 4 },
  stash: { x: -24, z: 14 },
  trainingGround: { x: -38, z: 40 },
  tavern: { x: 40, z: 42 },
  southGate: { x: 0, z: 58 },
} as const;

export interface BuiltTown {
  root: THREE.Group;
  nav: NavGrid;
  spawn: THREE.Vector3;
  spawnYaw: number;
  update(dt: number): void;
  dispose(): void;
  // ---- additions ----
  /** Real PointLights currently assigned (debug). */
  lightsActive: number;
  /** Where players appear when returning from a dungeon. */
  arrival: THREE.Vector3;
  arrivalYaw: number;
  /** POI table (same as TOWN_POIS, kept here so scenes needn't import the constant). */
  pois: typeof TOWN_POIS;
  /** Animated gen-prop roots by id ('font_of_power', 'mplus_portal', 'lobby_obelisk', 'waypoint_stone'...). */
  anchors: Map<string, THREE.Object3D>;
  /** Town half extent (world units). */
  half: number;
  groundY(x: number, z: number): number;
  /** Optional: the scene may tell the builder where the sun/shadow box should follow (defaults to the local player). */
  sunFollow(p: THREE.Vector3): void;
  /** Scene lights for tweaking (sun, hemisphere). */
  lighting: { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight };
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

const M = '/assets/models/';
const HEX = (n: string, c: string) => `${M}town/buildings/${c}/building_${n}_${c}.glb`;
const NEUT = (n: string) => `${M}town/buildings/neutral/${n}.glb`;
const HEXP = (n: string) => `${M}town/decoration/props/${n}.glb`;
const KFT = (n: string) => `${M}kenney/fantasy-town-kit/${n}.glb`;
const KGY = (n: string) => `${M}kenney/graveyard-kit/${n}.glb`;
const KSV = (n: string) => `${M}kenney/survival-kit/${n}.glb`;
const GP = (n: string) => `${M}gen/props/${n}.glb`;
const DUN = (n: string) => `${M}dungeon/${n}.glb`;
const FUR = (n: string) => `${M}furniture/${n}.glb`;
const PI = Math.PI;
const rad = (deg: number) => (deg * PI) / 180;
const PM = (cat: string, n: string) => `${M}itch/psx-medieval/${cat}/${n}.glb`;

interface Item {
  m: string;
  x: number;
  z: number;
  y?: number;
  /** degrees */
  rot?: number;
  s?: number;
  tag?: string;
  /** false = no collision; number = fixed radius; [w, d] = box footprint (metres, before rotation) */
  collide?: boolean | number | [number, number];
  color?: number;
  cast?: boolean;
  // ---- TownProp extras ----
  emissive?: number;
  emissiveIntensity?: number;
  light?: { color: number; intensity: number; distance: number; flicker?: boolean; y?: number };
  vfx?: VfxId;
  vfxScale?: number;
  vfxColor?: number;
  /** Skip the default if a prop with the same tag regex exists nearby in the TownDef. */
}

const TAG_RE: Record<string, RegExp> = {
  building: /building_/,
  wall: /wall_|fence_stone/,
  tower: /tower/,
  fountain: /fountain/,
  stall: /stall/,
  lamp: /lantern|lamp|lightpost/,
  brazier: /brazier|fire-basket/,
  portal: /portal|arch/,
  tree: /tree/,
  anvil: /anvil|forge|workbench/,
  tent: /tent/,
  bench: /bench/,
  obelisk: /obelisk/,
  pillar: /pillar/,
  banner: /banner/,
  board: /notice|signpost/,
  chest: /chest/,
};

/** Town instancing chunk (metres); the same size drives the distance culler below. */
const TOWN_CHUNK = 40;

/**
 * Distance limits (metres from the player) for the tiny town scatter. Anything beyond is hidden by the ChunkCuller, so the
 * ~8,000 grass tufts, flowers, bushes and rocks cost nothing outside the player's neighbourhood. Trees, walls and buildings are
 * never culled (the outer forest is the horizon).
 */
const TOWN_CULL: Partial<Record<CullLayer, number>> = { tuft: 60, flower: 60, bush: 80, rock: 100 };

/**
 * Town tuning of the shared prop light presets (Decor.PROP_LIGHTS also feeds the dungeons): plaza lamps and braziers
 * light the ground gently instead of washing out the road.
 */
const TOWN_LIGHT: Record<string, Partial<PropLightSpec>> = {
  // Two things made the five plaza lamps read as white-yellow orbs: the halo (Decor: 3.2, now 1.8 = a 0.9 m glow at the lantern head,
  // 2.8 m up), and the point light. Its 22 cd preset lit the floor under each post to ~3x the golden-hour sun, a blown-out pool.
  // At this height an intensity of ~0.35 keeps a warm pool about sun-bright and the lantern itself still reads as lit.
  lamp_post: { intensity: 0.35, distance: 6, halo: 1.8 },
  brazier: { intensity: 0.45, distance: 6 },
  'fire-basket': { intensity: 0.45, distance: 6 },
  // the alchemist cauldron's light sits only 1.6 m up: the Decor preset (28 cd) made a green floor pool that blew out its corner
  cauldron: { intensity: 0.12, distance: 4, halo: 2 },
  // the lobby obelisk (Buluşma Taşı): a cool glow, not a beacon
  lobby_obelisk: { intensity: 1.1, distance: 8, halo: 2.4 },
};

function townPreset(url: string): PropLightSpec | null {
  const p = propLightFor(url);
  return p ? { ...p, ...TOWN_LIGHT[baseName(url)] } : null;
}

/** Tamed lamp materials: one copy per source material, shared by every town lamp (the tame is identical for each lamp). */
const tamedLampMaterials = new WeakMap<THREE.Material, THREE.Material>();

/**
 * The gen lamp ships its glass with KHR_materials_emissive_strength 2.5: a white HDR blob that bloom spreads over the plaza.
 * Town lamps get a warm, dim copy of the glass, warm and dim enough to stay under the bloom threshold. The copy is made once per
 * source material and shared by all lamps: no lamp material is changed per instance, so the lamps stop adding a material each.
 */
function tameLampGlass(obj: THREE.Object3D): void {
  const tamed = (src: THREE.Material): THREE.Material => {
    let c = tamedLampMaterials.get(src);
    if (!c) {
      c = src.clone();
      if (isPSXPatched(src)) patchPSX(c); // Material.clone() drops onBeforeCompile
      const sm = c as THREE.MeshStandardMaterial;
      if (sm.name === 'glass' && sm.emissive) {
        sm.emissive.set(0xffc070);
        sm.emissiveIntensity = 0.6;
        sm.needsUpdate = true;
      }
      tamedLampMaterials.set(src, c);
    }
    return c;
  };
  obj.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map(tamed) : tamed(m.material);
  });
}

/**
 * The lobby obelisk's rune columns and crystal ship with emissive strengths 2.2 / 2.6, which bloom turns into a tall teal
 * light column above the Buluşma Taşı. Keep them a subtle glow; the slot stones (party state) are driven by the entity.
 */
function tameObelisk(obj: THREE.Object3D): void {
  Assets.cloneMaterials(obj);
  obj.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const sm = mat as THREE.MeshStandardMaterial;
      if (!sm.emissive) continue;
      if (sm.name === 'runes') sm.emissiveIntensity = 0.5;
      else if (sm.name === 'crystal') sm.emissiveIntensity = 0.9;
      else continue;
      sm.needsUpdate = true;
    }
  });
}

/**
 * The alchemist cauldron's liquid is emissive green (KHR emissive strength 1.8): the bright green blob by the campfire stand. Kept
 * a faint glow; the embers under it keep their own strength.
 */
function tameCauldron(obj: THREE.Object3D): void {
  Assets.cloneMaterials(obj);
  obj.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const sm = mat as THREE.MeshStandardMaterial;
      if (sm.name !== 'liquid' || !sm.emissive) continue;
      sm.emissiveIntensity = 0.6;
      sm.needsUpdate = true;
    }
  });
}

/** Treads of a staircase: at most ~0.28 m of rise each. */
function treadCount(yFrom: number, yTo: number): number {
  return Math.max(2, Math.ceil(Math.abs(yTo - yFrom) / 0.28));
}

/**
 * Top of tread i (0 = first tread from the lo end). The tread on the higher level is flush with that level, so a staircase that
 * leaves a terrace starts at the deck height instead of 0.25 m below its lip. groundY walks these same tops.
 */
function treadTop(yFrom: number, yTo: number, i: number, n: number): number {
  const dy = yTo - yFrom;
  const k = dy < 0 ? i / n : (i + 1) / n;
  return Math.max(0.06, yFrom + dy * k);
}

function layout(half: number): Item[] {
  const L: Item[] = [];
  const b = (n: string, c: string, x: number, z: number, rot: number, s = 6) => L.push({ m: HEX(n, c), x, z, rot, s, tag: 'building' });
  b('blacksmith', 'red', 36, -6, -90);
  b('market', 'blue', -36, -8, 90);
  b('home_A', 'green', -36, 6, 90);
  b('home_B', 'blue', -36, 18, 90);
  b('tavern', 'yellow', 40, 42, -90);
  b('church', 'blue', -44, -44, 45);
  b('windmill', 'yellow', 44, -44, 0);
  b('home_A', 'red', 46, -24, -90);
  b('home_B', 'red', 46, 26, -90);
  b('home_A', 'blue', 52, -12, -90);
  b('home_B', 'green', 52, 6, -90);
  b('home_B', 'yellow', -52, -22, 90);
  b('home_A', 'red', -52, -6, 90);
  b('home_B', 'green', -52, 12, 90);
  b('well', 'blue', -12, 30, 0);
  const c = half - 6.5;
  b('tower_B', 'blue', -c, -c, 45);
  b('tower_B', 'red', c, -c, -45);
  b('tower_B', 'green', -c, c, 135);
  b('tower_B', 'yellow', c, c, -135);
  for (const it of L.slice(-4)) it.tag = 'tower';
  L.push({ m: HEX('castle', 'blue'), x: 0, z: -(half + 16), rot: 0, s: 8, tag: 'building', collide: false });

  // portal hall
  L.push({ m: GP('font_of_power'), x: 0, z: -41.5, tag: 'portal', collide: 1.9 });
  L.push({ m: GP('mplus_portal'), x: 0, z: -57.2, rot: 0, tag: 'portal', collide: false });
  for (const [x, z] of [[17, -30], [-17, -30], [22, -40], [-22, -40], [22, -50], [-22, -50], [15, -55], [-15, -55]]) {
    L.push({ m: DUN('pillar_decorated'), x, z, rot: (Math.atan2(-x, -44 - z) * 180) / PI, s: 1.7, tag: 'pillar', collide: 1.2 });
  }
  for (const [x, z, col] of [[-7.5, -54.5, 'green'], [7.5, -54.5, 'red'], [-12, -50, 'blue'], [12, -50, 'blue']] as [number, number, string][])
    L.push({ m: GP(`banner_${col}`), x, z, rot: (Math.atan2(-x, -44 - z) * 180) / PI, collide: false, tag: 'banner' });
  // braziers (portal hall + road)
  for (const [x, z] of [[14, -30], [-14, -30], [6, -20], [-6, -20], [6, 38], [-6, 38], [6, 50], [-6, 50]]) L.push({ m: GP('brazier'), x, z, tag: 'brazier', collide: 0.8 });
  // plaza
  L.push({ m: KFT('fountain-round-detail'), x: 0, z: 8, s: 4, tag: 'fountain', collide: 4.4 });
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + (k * PI) / 2;
    const x = Math.sin(a) * 8.6, z = 8 + Math.cos(a) * 8.6;
    L.push({ m: KGY('bench'), x, z, rot: (Math.atan2(-x, 8 - z) * 180) / PI + 90 + 90, s: 3, tag: 'bench', collide: 1.0 });
  }
  // lamp posts: plaza ring + road
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + (k * PI) / 2 + PI / 4;
    const x = Math.sin(a) * 15.6, z = 8 + Math.cos(a) * 15.6;
    L.push({ m: GP('lamp_post'), x, z, rot: (Math.atan2(-x, 8 - z) * 180) / PI, tag: 'lamp', collide: 0.4 });
  }
  for (const z of [50, 38, 28, -12, -22]) for (const sx of [-1, 1]) L.push({ m: GP('lamp_post'), x: sx * 6.2, z, rot: sx > 0 ? -90 : 90, tag: 'lamp', collide: 0.4 });
  // market
  L.push({ m: GP('market_stall'), x: -21, z: -14, rot: 90, tag: 'stall' });
  L.push({ m: GP('market_stall'), x: -21, z: -2, rot: 90, tag: 'stall' });
  L.push({ m: GP('crate_b'), x: -18.4, z: -18.4, rot: 20 }, { m: GP('crate_a'), x: -19.8, z: -18.9 }, { m: GP('crate_a'), x: -19.8, z: -18.9, y: 1.0, rot: 35 });
  L.push({ m: GP('sacks'), x: -18.5, z: 7, rot: 70 }, { m: GP('barrel'), x: -17.5, z: -8, rot: 0 }, { m: GP('barrel'), x: -16.8, z: -7, rot: 0 });
  L.push({ m: GP('wagon'), x: -29, z: -21, rot: 20, tag: 'wagon' });
  L.push({ m: GP('cauldron'), x: -21.5, z: 4, rot: 90 }, { m: GP('alchemy_table'), x: -21.5, z: 9.5, rot: 90 });
  for (const z of [12, 14.2, 16.4]) L.push({ m: GP('chest_iron'), x: -27.5, z, rot: 90, tag: 'chest' });
  // craft street
  L.push({ m: GP('anvil'), x: 22.5, z: -6, rot: -90, tag: 'anvil' });
  L.push({ m: KSV('workbench-grind'), x: 26, z: -11, s: 3, rot: 0, tag: 'anvil' });
  L.push({ m: GP('forge'), x: 30, z: -2.5, rot: -90, tag: 'anvil', collide: 1.6 });
  L.push({ m: GP('barrel'), x: 21, z: -10.5 }, { m: GP('barrel'), x: 27.5, z: 1 });
  L.push({ m: GP('tent'), x: 35, z: 9, rot: 90, tag: 'tent' });
  L.push({ m: KGY('altar-stone'), x: 22.5, z: 8, s: 3, rot: 90, tag: 'altar' });
  L.push({ m: GP('crystal_purple'), x: 22.5, z: 8, y: 1.45, s: 0.8, tag: 'altar', collide: false });
  // POIs
  L.push({ m: GP('notice_board'), x: 8, z: 18, rot: 0, tag: 'board', collide: 1.3 });
  L.push({ m: GP('lobby_obelisk'), x: -8, z: 18, rot: 0, tag: 'obelisk', collide: 1.6 });
  L.push({ m: GP('waypoint_stone'), x: 12, z: 46, rot: 0, tag: 'obelisk', collide: 1.4 });
  L.push({ m: GP('signpost'), x: 5.5, z: 44, rot: 20, tag: 'board', collide: 0.6 });
  // south gate caravan
  L.push({ m: GP('wagon'), x: -14, z: 51, rot: 25, tag: 'wagon' }, { m: GP('crate_b'), x: -16.5, z: 49, rot: 10 }, { m: GP('barrel'), x: -11.5, z: 48.5 });
  // training ground
  for (const z of [30, 34.5, 39]) L.push({ m: HEXP('weaponrack'), x: -54.5, z, rot: 90, s: 6, collide: 0.8 });
  for (const [x, z] of [[-52, 48], [-49.6, 50.2], [-53, 51.8]]) L.push({ m: KGY('hay-bale'), x, z, s: 3, rot: x * 13 });
  for (let x = -54; x < -19; x += 4.1) if (x < -38 || x > -29) L.push({ m: GP('fence_wood'), x, z: 22.5, rot: 0, collide: 0.4 });
  // tavern yard
  for (const [x, z] of [[28, 34], [30, 44], [26, 52]]) {
    L.push({ m: FUR('table_medium'), x, z, s: 1.3, collide: 1.3 });
    for (let k = 0; k < 4; k++) {
      const a = (k * PI) / 2 + PI / 4;
      L.push({ m: FUR('chair_stool_wood'), x: x + Math.sin(a) * 1.9, z: z + Math.cos(a) * 1.9, rot: (a * 180) / PI + 180, s: 1.2, collide: false });
    }
  }
  L.push({ m: GP('barrel'), x: 35.5, z: 37 }, { m: GP('barrel'), x: 35.8, z: 38.1 }, { m: GP('barrel'), x: 35.4, z: 48 });
  L.push({ m: GP('lamp_post'), x: 28, z: 27, rot: 90, tag: 'lamp', collide: 0.4 }, { m: GP('lamp_post'), x: 50, z: 30, rot: -90, tag: 'lamp', collide: 0.4 });
  void half;
  return L;
}

// ---------------------------------------------------------------------------
// PSX timber-frame cottages (itch psx-medieval kit): one 5 m cell, 1-2 storeys, hip roof, door + windows
// ---------------------------------------------------------------------------

type RoofColour = 'red' | 'blue' | 'straw';

/**
 * Pieces of a cottage centred at (cx, cz); its door faces (sin rot, cos rot). Blocks/roofs pivot on the module corner and extend
 * +X / -Z (itch-kits.md 2), so the pivot sits at house-local (-2.5, +2.5). Overlays (door/windows) are centred on a wall face.
 */
function cottageItems(cx: number, cz: number, rotDeg: number, storeys: 1 | 2, roof: RoofColour, stone: boolean, alt: boolean): Item[] {
  const r = rad(rotDeg), c = Math.cos(r), sn = Math.sin(r);
  const at = (lx: number, lz: number): { x: number; z: number } => ({ x: cx + lx * c + lz * sn, z: cz - lx * sn + lz * c });
  const out: Item[] = [];
  const pivot = at(-2.5, 2.5);
  out.push({ m: PM('building', (stone ? 'plaster_wall_stone_base' : 'plaster_wall') + (alt ? '_alt' : '')), ...pivot, rot: rotDeg, collide: true, tag: 'cottage' });
  if (storeys > 1) out.push({ m: PM('building', alt ? 'plaster_wall' : 'plaster_wall_alt'), ...pivot, y: 3.75, rot: rotDeg, collide: false, tag: 'cottage' });
  out.push({ m: PM('roofs', `roof_${roof}_square`), ...pivot, y: 3.75 * storeys, rot: rotDeg, collide: false, tag: 'cottage' });
  const overlay = (name: string, lx: number, lz: number, y: number, faceRot: number): void => {
    out.push({ m: PM('decoration', name), ...at(lx, lz), y, rot: rotDeg + faceRot, collide: false, tag: 'cottage' });
  };
  overlay('door_wood', 0, 2.5, 0, 0);
  overlay('window_square', 1.65, 2.5, 1.25, 0);
  overlay('flower_box', 1.65, 2.5 + 0.4, 0.45, 0);
  overlay('window_square', 2.5, 0.2, 1.25, 90);
  overlay('window_square', -2.5, 0.2, 1.25, -90);
  overlay('window_square', 0, -2.5, 1.25, 180);
  if (storeys > 1) {
    overlay('window_square', -1.3, 2.5, 3.75 + 1.25, 0);
    overlay('window_square', 1.3, 2.5, 3.75 + 1.25, 0);
    overlay('window_square', 2.5, 0, 3.75 + 1.25, 90);
    overlay('window_square', -2.5, 0, 3.75 + 1.25, -90);
    overlay('window_square', 0, -2.5, 3.75 + 1.25, 180);
  }
  return out;
}

/** x, z, door facing (deg), storeys, roof, stone plinth, alternate walls. Placed only where the default layout has room. */
const COTTAGE_SITES: [number, number, number, 1 | 2, RoofColour, boolean, boolean][] = [
  [-15, -14, 90, 2, 'red', true, false],
  [15, -14, -90, 1, 'straw', false, true],
  [-16, 39, 90, 1, 'blue', true, true],
  [16, 36, -90, 2, 'straw', true, false],
  [17, 54, -90, 1, 'red', false, false],
];

function cottageUrls(): string[] {
  const out = new Set<string>();
  for (const [x, z, rot, st, roof, stone, alt] of COTTAGE_SITES) for (const it of cottageItems(x, z, rot, st, roof, stone, alt)) out.add(it.m);
  return [...out];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

class TownBuild {
  readonly root = new THREE.Group();
  readonly half: number;
  readonly batcher: InstanceBatcher;
  readonly culler: ChunkCuller;
  readonly lights: LightPool;
  readonly halo: GlowField;
  readonly flames: GlowField;
  readonly nav: NavGrid;
  readonly rng: RNG;
  readonly updaters: ((dt: number, t: number) => void)[] = [];
  readonly disposables: { dispose(): void }[] = [];
  readonly anchors = new Map<string, THREE.Object3D>();
  readonly occupied: { x: number; z: number; r: number }[] = [];
  readonly fields: ParticleField[] = [];
  readonly focus = new THREE.Vector3();
  terrain!: Terrain;
  sky!: Sky;
  sun!: THREE.DirectionalLight;
  hemi!: THREE.HemisphereLight;
  prevFog: THREE.Fog | THREE.FogExp2 | null = null;
  prevBg: THREE.Scene['background'] = null;
  time = 0;
  motes!: ParticleField;
  ringMeshes: THREE.Mesh[] = [];
  pendingAnim: Promise<void>[] = [];
  items: Item[] = [];
  ravens: { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; a: number; r: number; y: number; sp: number }[] = [];
  castlePos = new THREE.Vector3();
  sunDir = new THREE.Vector3(...GOLDEN_HOUR_SKY.sunDir).normalize();
  smokeSpots: { x: number; y: number; z: number }[] = [];
  emitters: { id: VfxId; pos: [number, number, number]; scale: number; color?: number; handle: { stop(): void; alive: boolean } | null }[] = [];
  emitterTimer = 0;
  raised: { box: [number, number, number, number]; y: number }[] = [];
  sunFocus: THREE.Vector3 | null = null;
  emberSpots: { x: number; y: number; z: number; s: number }[] = [];

  constructor(readonly def: TownDef, readonly scene: THREE.Scene) {
    // the built-in layout is designed for the 120 m town of the GDD; a content-defined town brings its own size
    this.half = def.props.length ? Math.max(def.size[0], def.size[1]) / 2 : 60;
    this.rng = new RNG(hashString('town:' + def.id));
    this.root.name = `town:${def.id}`;
    this.batcher = new InstanceBatcher(this.root, TOWN_CHUNK);
    this.culler = new ChunkCuller(this.batcher, TOWN_CHUNK);
    this.lights = new LightPool(this.root, MAX_REAL_LIGHTS);
    // shared, process-lifetime glow textures (not owned by this build)
    const gt = glowTexture(32, 6, 1.7);
    const ft = flameTexture(32);
    this.halo = new GlowField(gt, 0.7);
    this.flames = new GlowField(ft, 1.3);
    this.root.add(this.halo.mesh, this.flames.mesh);
    const m = 12;
    this.nav = new NavGrid({ originX: -this.half - m, originZ: -this.half - m, width: this.half * 2 + m * 2, depth: this.half * 2 + m * 2, cellSize: 1, walkable: false });
  }

  // ---- lighting / sky ----
  setupLighting(): void {
    this.prevFog = this.scene.fog;
    this.prevBg = this.scene.background;
    // TownDef.lighting (content module) overrides the golden-hour defaults. Its intensities follow the GDD scale (hemi 0.6, sun 1.2),
    // which our ACES + PSX pipeline needs boosted: x2 / x1.6, clamped so a pre-boosted definition does not blow out.
    const lt = this.def.lighting;
    const fogCol = lt?.fogColor ?? 0xd8c0a0;
    this.scene.fog = new THREE.Fog(fogCol, lt?.fogNear ?? 34, lt?.fogFar ?? 150);
    this.scene.background = new THREE.Color(fogCol);
    const hemiK = lt ? THREE.MathUtils.clamp(lt.hemiIntensity * 2, 0.6, 1.6) : 1.2;
    const sunK = lt ? THREE.MathUtils.clamp(lt.sunIntensity * 1.6, 0.8, 2.2) : 1.9;
    this.hemi = new THREE.HemisphereLight(lt?.hemiSky ?? 0xffe4b8, lt?.hemiGround ?? 0x6a5a44, hemiK);
    this.sun = new THREE.DirectionalLight(lt?.sun ?? 0xffd096, sunK);
    if (lt) this.sunDir.set(lt.sunDir[0], lt.sunDir[1], lt.sunDir[2]).normalize();
    // the one shadow caster of the town: a 40 m box that follows the focus (ShadowFollow), 1024 texels
    configureShadowBox(this.sun, { near: 1, far: 220 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.08;
    this.root.add(this.hemi, this.sun, this.sun.target);
    this.sky = new Sky({ ...GOLDEN_HOUR_SKY, sunDir: [this.sunDir.x, this.sunDir.y, this.sunDir.z], horizon: lt ? new THREE.Color(fogCol).lerp(new THREE.Color(GOLDEN_HOUR_SKY.horizon), 0.45).getHex() : GOLDEN_HOUR_SKY.horizon });
    this.root.add(this.sky.dome);
    try { G.engine.renderer.localClippingEnabled = true; } catch { /* no engine */ }
  }

  // ---- terrain ----
  setupTerrain(): void {
    const h = this.half;
    const ops: SplatOp[] = [];
    // main road (cobble) + dirt shoulders
    ops.push({ t: 'rect', ch: 'dirt', x: 0, z: 16, hw: 5.4, hd: 46, soft: 1.4 });
    ops.push({ t: 'rect', ch: 'cobble', x: 0, z: 16, hw: 4.1, hd: 44, soft: 1.0 });
    // plaza
    ops.push({ t: 'disc', ch: 'dirt', x: 0, z: 8, r: 15.8, soft: 1.6 });
    ops.push({ t: 'disc', ch: 'cobble', x: 0, z: 8, r: 14.4, soft: 1.0 });
    // portal hall flagstones
    ops.push({ t: 'rect', ch: 'dirt', x: 0, z: -44, hw: 25.8, hd: 17, soft: 1.5 });
    ops.push({ t: 'rect', ch: 'cobble', x: 0, z: -43, hw: 24.4, hd: 15, soft: 1.0 });
    // craft street + market + yards: worn grass (partial dirt) with cobbled work areas
    ops.push({ t: 'rect', ch: 'dirt', x: 36, z: -2, hw: 19, hd: 15, soft: 3, amount: 0.5 });
    ops.push({ t: 'rect', ch: 'cobble', x: 26, z: -4, hw: 7, hd: 9, soft: 1 });
    ops.push({ t: 'rect', ch: 'dirt', x: -30, z: -2, hw: 17, hd: 16, soft: 3, amount: 0.5 });
    ops.push({ t: 'rect', ch: 'cobble', x: -24, z: -6, hw: 6.5, hd: 11, soft: 1 });
    ops.push({ t: 'rect', ch: 'dirt', x: -38, z: 40, hw: 17, hd: 14, soft: 2.5 });
    ops.push({ t: 'rect', ch: 'dirt', x: 36, z: 40, hw: 15, hd: 12, soft: 3, amount: 0.5 });
    ops.push({ t: 'rect', ch: 'cobble', x: 34, z: 40, hw: 6, hd: 8, soft: 1 });
    // paths
    ops.push({ t: 'line', ch: 'dirt', x0: 5, z0: 8, x1: 32, z1: -6, w: 3.6 });
    ops.push({ t: 'line', ch: 'dirt', x0: -5, z0: 8, x1: -30, z1: 2, w: 3.6 });
    ops.push({ t: 'line', ch: 'dirt', x0: 5, z0: 30, x1: 30, z1: 44, w: 3.2 });
    ops.push({ t: 'line', ch: 'dirt', x0: -5, z0: 34, x1: -34, z1: 38, w: 3.2 });
    ops.push({ t: 'line', ch: 'dirt', x0: 0, z0: -26, x1: -40, z1: -40, w: 3 });
    ops.push({ t: 'line', ch: 'dirt', x0: 0, z0: -26, x1: 40, z1: -40, w: 3 });
    ops.push({ t: 'line', ch: 'dirt', x0: 0, z0: h - 2, x1: 0, z1: h + 40, w: 7 });
    this.terrain = createTerrain({ half: 280, splatHalf: h + 6, splatRes: 512, seed: this.def.id, ops, cell: 10 });
    this.root.add(this.terrain.mesh);
    freezeStatic(this.terrain.mesh); // the ground never moves: skip its per-frame matrix compose
    this.disposables.push(this.terrain);
  }

  // ---- terraces + stairs (TownDef.terraces / stairs): visual platforms, height query for the scene ----
  buildRaised(): void {
    const def = this.def;
    const terr = def.terraces ?? [], stairs = def.stairs ?? [];
    if (!terr.length && !stairs.length) return;
    const tint = 0xd8d0c4;
    const topM = psxMaterial(surfaceTexture('cobble', 'terrace', 64), { color: tint, affine: false });
    const sideM = psxMaterial(surfaceTexture('brick', 'terrace', 64), { color: mulHex(tint, 0xe8e0d8), affine: false });
    // ground course (dark, weathered) and coping (light cut stone) that finish the retaining walls
    const plinthM = psxMaterial(surfaceTexture('brick', 'plinth', 64), { color: 0x8c8176, affine: false });
    const copingM = psxMaterial(surfaceTexture('cobble', 'coping', 64), { color: 0xe4dacb, affine: false });
    this.disposables.push(topM, sideM, plinthM, copingM);
    for (const t of terr) {
      const [x0, z0, x1, z1] = t.box;
      const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0), hgt = Math.max(0.05, t.y);
      const g = worldUVBox(w, hgt, d, 0.25);
      const mesh = new THREE.Mesh(g, [sideM, sideM, topM, sideM, sideM, sideM]);
      mesh.position.set((x0 + x1) / 2, hgt / 2 - 0.02, (z0 + z1) / 2);
      mesh.castShadow = shouldCastShadow(mesh);
      mesh.receiveShadow = true;
      mesh.name = 'terrace:' + t.id;
      this.root.add(mesh);
      freezeStatic(mesh);
      this.disposables.push(g);
      const box: [number, number, number, number] = [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)];
      this.raised.push({ box, y: t.y });
      this.trimTerrace(box, hgt, stairs, plinthM, copingM);
    }
    for (const st of stairs) {
      const [x0, z0, x1, z1] = st.box;
      const lo = [Math.min(x0, x1), Math.min(z0, z1)], hi = [Math.max(x0, x1), Math.max(z0, z1)];
      const len = st.axis === 'z' ? hi[1] - lo[1] : hi[0] - lo[0];
      const wid = st.axis === 'z' ? hi[0] - lo[0] : hi[1] - lo[1];
      const n = treadCount(st.yFrom, st.yTo);
      for (let i = 0; i < n; i++) {
        const yTop = treadTop(st.yFrom, st.yTo, i, n);
        const a = (i / n) * len, b = ((i + 1) / n) * len;
        const g = worldUVBox(st.axis === 'z' ? wid : b - a, yTop, st.axis === 'z' ? b - a : wid, 0.3);
        const mesh = new THREE.Mesh(g, [sideM, sideM, topM, sideM, sideM, sideM]);
        const cx = st.axis === 'z' ? (lo[0] + hi[0]) / 2 : lo[0] + (a + b) / 2;
        const cz = st.axis === 'z' ? lo[1] + (a + b) / 2 : (lo[1] + hi[1]) / 2;
        mesh.position.set(cx, yTop / 2 - 0.02, cz);
        mesh.castShadow = shouldCastShadow(mesh);
        mesh.receiveShadow = true;
        this.root.add(mesh);
        freezeStatic(mesh);
        this.disposables.push(g);
      }
      this.stairs.push({ box: [lo[0], lo[1], hi[0], hi[1]], yFrom: st.yFrom, yTo: st.yTo, axis: st.axis });
    }
  }

  /**
   * Outside finish of a terrace: a plinth at ground level and a coping on the top edge, along all four sides. Where a staircase
   * starts on an edge the trim stops, so the steps stay open.
   */
  trimTerrace(box: [number, number, number, number], top: number, stairs: { box: [number, number, number, number] }[], plinthM: THREE.Material, copingM: THREE.Material): void {
    const [x0, z0, x1, z1] = box;
    const EPS = 0.01, OVERLAP = 0.1;
    const gap = { n: [] as [number, number][], s: [] as [number, number][], w: [] as [number, number][], e: [] as [number, number][] };
    for (const st of stairs) {
      const a0 = Math.min(st.box[0], st.box[2]), a1 = Math.max(st.box[0], st.box[2]);
      const b0 = Math.min(st.box[1], st.box[3]), b1 = Math.max(st.box[1], st.box[3]);
      if (Math.abs(b0 - z1) < EPS) gap.s.push([Math.max(a0, x0), Math.min(a1, x1)]);
      if (Math.abs(b1 - z0) < EPS) gap.n.push([Math.max(a0, x0), Math.min(a1, x1)]);
      if (Math.abs(a0 - x1) < EPS) gap.e.push([Math.max(b0, z0), Math.min(b1, z1)]);
      if (Math.abs(a1 - x0) < EPS) gap.w.push([Math.max(b0, z0), Math.min(b1, z1)]);
    }
    /** [lo, hi] minus the cut intervals. */
    const spans = (lo: number, hi: number, cuts: [number, number][]): [number, number][] => {
      let out: [number, number][] = [[lo, hi]];
      for (const [c0, c1] of cuts) {
        const next: [number, number][] = [];
        for (const [a, b] of out) {
          if (c1 <= a || c0 >= b) { next.push([a, b]); continue; }
          if (c0 - a > 0.05) next.push([a, c0]);
          if (b - c1 > 0.05) next.push([c1, b]);
        }
        out = next;
      }
      return out;
    };
    const slab = (cx: number, cz: number, w: number, d: number, y0: number, y1: number, mat: THREE.Material): void => {
      const g = worldUVBox(w, y1 - y0, d, 0.25);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(cx, (y0 + y1) / 2, cz);
      mesh.castShadow = shouldCastShadow(mesh);
      mesh.receiveShadow = true;
      this.root.add(mesh);
      freezeStatic(mesh);
      this.disposables.push(g);
    };
    /** One closed ring of bands outset by `o`: north and south run over the corners, east and west fill the gap between them. */
    const ring = (o: number, y0: number, y1: number, mat: THREE.Material): void => {
      for (const [a, b] of spans(x0 - o, x1 + o, gap.s)) slab((a + b) / 2, z1 + o / 2 - OVERLAP / 2, b - a, o + OVERLAP, y0, y1, mat);
      for (const [a, b] of spans(x0 - o, x1 + o, gap.n)) slab((a + b) / 2, z0 - o / 2 + OVERLAP / 2, b - a, o + OVERLAP, y0, y1, mat);
      for (const [a, b] of spans(z0, z1, gap.e)) slab(x1 + o / 2 - OVERLAP / 2, (a + b) / 2, o + OVERLAP, b - a, y0, y1, mat);
      for (const [a, b] of spans(z0, z1, gap.w)) slab(x0 - o / 2 + OVERLAP / 2, (a + b) / 2, o + OVERLAP, b - a, y0, y1, mat);
    };
    ring(0.3, -0.02, 0.55, plinthM);          // plinth: 0.3 m proud of the wall, ground to 0.55 m
    ring(0.12, top - 0.1, top + 0.08, copingM); // coping: 0.12 m proud, a 0.18 m band across the deck edge
  }

  stairs: { box: [number, number, number, number]; yFrom: number; yTo: number; axis: 'x' | 'z' }[] = [];

  /**
   * Terraces are only reachable by their stairs: close a 1 m band around the platforms (outside their edges) except where a
   * staircase meets them, so nobody pops up 2 m by walking into the retaining wall.
   */
  sealRaised(): void {
    if (!this.raised.length) return;
    const nav = this.nav, m = 1.0;
    for (let r = 0; r < nav.rows; r++)
      for (let c = 0; c < nav.cols; c++) {
        const x = nav.centerX(c), z = nav.centerZ(r);
        let band = false;
        for (const t of this.raised) {
          const inside = x >= t.box[0] && x <= t.box[2] && z >= t.box[1] && z <= t.box[3];
          if (inside) { band = false; break; }
          if (x >= t.box[0] - m && x <= t.box[2] + m && z >= t.box[1] - m && z <= t.box[3] + m) band = true;
        }
        if (!band) continue;
        let onStairs = false;
        for (const st of this.stairs) if (x >= st.box[0] - m && x <= st.box[2] + m && z >= st.box[1] - m && z <= st.box[3] + m) { onStairs = true; break; }
        if (!onStairs) nav.setCell(c, r, 0);
      }
  }

  /** Walkable height at (x, z): terraces and stairs of the TownDef (0 elsewhere). */
  groundY(x: number, z: number): number {
    let y = 0;
    for (const r of this.raised) if (x >= r.box[0] && x <= r.box[2] && z >= r.box[1] && z <= r.box[3] && r.y > y) y = r.y;
    for (const s of this.stairs) {
      if (x < s.box[0] || x > s.box[2] || z < s.box[1] || z > s.box[3]) continue;
      const u = s.axis === 'z' ? (z - s.box[1]) / Math.max(0.001, s.box[3] - s.box[1]) : (x - s.box[0]) / Math.max(0.001, s.box[2] - s.box[0]);
      // stepped like the treads that are drawn (a ramp through the steps left the feet sunk into them)
      const n = treadCount(s.yFrom, s.yTo);
      const i = Math.min(n - 1, Math.max(0, Math.floor(Math.min(1, Math.max(0, u)) * n)));
      y = treadTop(s.yFrom, s.yTo, i, n);
    }
    return y;
  }

  inRaised(x: number, z: number, pad = 0): boolean {
    for (const r of this.raised) if (x >= r.box[0] - pad && x <= r.box[2] + pad && z >= r.box[1] - pad && z <= r.box[3] + pad) return true;
    for (const s of this.stairs) if (x >= s.box[0] - pad && x <= s.box[2] + pad && z >= s.box[1] - pad && z <= s.box[3] + pad) return true;
    return false;
  }

  // ---- placement ----
  /** Is (x, z) free of occupied footprints? */
  free(x: number, z: number, pad = 0): boolean {
    if (this.raised.length && this.inRaised(x, z, pad)) return false;
    for (const o of this.occupied) if (Math.hypot(o.x - x, o.z - z) < o.r + pad) return false;
    return true;
  }

  blockRect(cx: number, cz: number, hx: number, hz: number, rot: number, margin = 0.25): void {
    const nav = this.nav;
    const r = Math.hypot(hx, hz) + 1;
    const c0 = nav.cx(cx - r), c1 = nav.cx(cx + r), r0 = nav.cz(cz - r), r1 = nav.cz(cz + r);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    for (let rr = r0; rr <= r1; rr++)
      for (let c = c0; c <= c1; c++) {
        const dx = nav.centerX(c) - cx, dz = nav.centerZ(rr) - cz;
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        if (Math.abs(lx) <= hx + margin && Math.abs(lz) <= hz + margin) nav.setCell(c, rr, 0);
      }
  }

  async placeItems(): Promise<void> {
    const def = this.def;
    const defaults = layout(this.half);
    const keep: Item[] = [];
    const nearTag = (it: Item): boolean => {
      const re = it.tag ? TAG_RE[it.tag] : null;
      for (const p of def.props) {
        const dx = p.pos[0] - it.x, dz = p.pos[2] - it.z;
        if (re && re.test(p.model) && Math.hypot(dx, dz) < 12) return true;
        if (baseName(p.model) === baseName(it.m) && Math.hypot(dx, dz) < 6) return true;
      }
      for (const n of def.npcs) {
        // same visual already provided by an NPC entity (portals, obelisks...)
        if (it.tag && (it.tag === 'portal' || it.tag === 'obelisk') && Math.hypot(n.pos[0] - it.x, n.pos[2] - it.z) < 9 && baseName(n.model) === baseName(it.m)) return true;
      }
      return false;
    };
    for (const it of defaults) {
      // the mythic portal arch is replaced by the portal NPCs if the content defines some
      if (it.m === GP('mplus_portal') && def.npcs.some((n) => n.role === 'portal')) continue;
      if (nearTag(it)) continue;
      // The defaults are authored on flat ground (y relative to the floor). One that survives the dedupe but stands on a terrace /
      // stairs of the TownDef is lifted onto its surface instead of being buried in it. Content props below are NOT touched: their
      // y is absolute (the content already adds the terrace height, e.g. HALL_Y), so groundY must never be added to them.
      const gy = this.groundY(it.x, it.z);
      if (gy > 0.01) it.y = (it.y ?? 0) + gy;
      keep.push(it);
    }
    // content props (always placed)
    for (const p of def.props) {
      const collide: Item['collide'] = !p.collide ? false : p.box ? p.box : p.radius ?? true;
      keep.push({ m: p.model, x: p.pos[0], z: p.pos[2], y: p.pos[1], rot: p.rot, s: p.scale, collide, tag: 'def', color: p.tint, emissive: p.emissive, emissiveIntensity: p.emissiveIntensity, light: p.light, vfx: p.vfx, vfxScale: p.vfxScale, vfxColor: p.vfxColor });
    }
    this.items = keep;
    await loadPieces(keep.map((i) => i.m));
    for (const it of keep) {
      try { await this.placeItem(it); } catch (e) { console.warn('[world] town prop failed', it.m, e); }
    }
    // keep NPC spots clear for nature
    for (const n of def.npcs) this.occupied.push({ x: n.pos[0], z: n.pos[2], r: 2.6 });
    // PSX timber-frame cottages in the gaps (never within reach of a content prop or NPC)
    await this.placeCottages();
  }

  async placeCottages(): Promise<void> {
    for (const [x, z, rot, st, roof, stone, alt] of COTTAGE_SITES) {
      if (!this.free(x, z, 4.6)) continue;
      if (this.def.props.some((p) => Math.hypot(p.pos[0] - x, p.pos[2] - z) < 6.4 && !/(grass|flower|tree|bush)/.test(p.model))) continue;
      if (this.def.npcs.some((n) => Math.hypot(n.pos[0] - x, n.pos[2] - z) < 6.4)) continue;
      const parts = cottageItems(x, z, rot, st, roof, stone, alt);
      await loadPieces(parts.map((p) => p.m));
      for (const p of parts) {
        try { await this.placeItem(p); } catch (e) { console.warn('[world] cottage piece failed', p.m, e); }
      }
      this.smokeSpots.push({ x, y: 3.75 * st + 2.4, z });
      this.occupied.push({ x, z, r: 4.2 });
    }
  }

  async placeItem(it: Item): Promise<void> {
    const piece = getPiece(it.m);
    if (!piece) return;
    const s = it.s ?? 1;
    const rot = rad(it.rot ?? 0);
    const y = it.y ?? 0;
    const sz = piece.size;
    const col = new THREE.Color(it.color ?? 0xffffff).multiplyScalar(0.94 + this.rng.next() * 0.12);
    const preset = it.light ? null : townPreset(it.m);
    let lightPos: THREE.Vector3 | null = null;
    if (isAnimatedModel(it.m)) {
      const h = await spawnAnimatedProp(it.m);
      const key = baseName(it.m);
      if (key === 'lamp_post') tameLampGlass(h.object);
      if (key === 'lobby_obelisk') tameObelisk(h.object);
      if (key === 'cauldron') tameCauldron(h.object);
      h.object.position.set(it.x, y, it.z);
      h.object.rotation.y = rot;
      h.object.scale.setScalar(s);
      this.root.add(h.object);
      h.refreshAnchors();
      this.updaters.push(h.update);
      lightPos = h.lightPos;
      if (!this.anchors.has(key)) this.anchors.set(key, h.object);
      if (preset) {
        const lp = lightPos ?? new THREE.Vector3(it.x, y + preset.y * s, it.z);
        this.lights.add(lp, { color: preset.color, intensity: designToPhysical(preset.intensity), distance: preset.distance, flicker: preset.flicker });
        if (preset.halo) this.halo.add(lp, preset.color, { size: preset.halo * 0.5 * Math.max(1, s * 0.8), flicker: preset.flicker, intensity: 0.3 });
      }
      for (const fp of h.flamePos) {
        this.emberSpots.push({ x: fp.x, y: fp.y + 0.3, z: fp.z, s: 1 });
      }
      if (key === 'forge') this.smokeSpots.push({ x: it.x, y: 4.4, z: it.z });
      if (key === 'font_of_power') this.emberSpots.push({ x: it.x, y: 1.6, z: it.z, s: 0.7 });
    } else if (it.emissive !== undefined) {
      // glowing props need their own materials: spawned as individual objects
      const obj = await spawnStaticObject(it.m, { tint: it.color, emissive: it.emissive, emissiveIntensity: it.emissiveIntensity });
      if (obj) {
        obj.position.set(it.x, y, it.z);
        obj.rotation.y = rot;
        obj.scale.setScalar(s);
        this.root.add(obj);
        applyShadowPolicy(obj);
        obj.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) m.receiveShadow = true; });
        freezeStatic(obj);
      }
      if (preset) {
        const lp = new THREE.Vector3(it.x, y + preset.y * s, it.z);
        this.lights.add(lp, { color: preset.color, intensity: designToPhysical(preset.intensity), distance: preset.distance, flicker: preset.flicker });
        if (preset.halo) this.halo.add(lp, preset.color, { size: preset.halo * 0.5, flicker: preset.flicker, intensity: 0.3 });
      }
    } else {
      this.batcher.add(it.m, it.x, y, it.z, rot, s, col, { cast: it.cast ?? sz.y * s > 0.5, receive: true });
      if (preset) {
        const lp = new THREE.Vector3(it.x, y + preset.y * s, it.z);
        this.lights.add(lp, { color: preset.color, intensity: designToPhysical(preset.intensity), distance: preset.distance, flicker: preset.flicker });
        if (preset.halo) this.halo.add(lp, preset.color, { size: preset.halo * 0.5, flicker: preset.flicker, intensity: 0.3 });
        if (preset.flame) this.flames.add([lp.x, lp.y - 0.25, lp.z], 0xffb040, { size: preset.flame * 0.7, flicker: 0.45, anchor: 1 });
      }
    }
    if (it.light) {
      const lp = new THREE.Vector3(it.x, y + (it.light.y ?? sz.y * s * 0.85), it.z);
      this.lights.add(lp, { color: it.light.color, intensity: designToPhysical(it.light.intensity), distance: it.light.distance, flicker: it.light.flicker ? 0.3 : 0.05 });
      // a small halo at flame height (the old 0.4 x distance size made 4-6 m light columns); same size class as the preset halos
      this.halo.add(lp, it.light.color, { size: Math.min(1.8, it.light.distance * 0.25), flicker: it.light.flicker ? 0.3 : 0.05, intensity: 0.4 });
    }
    if (it.vfx) this.emitters.push({ id: it.vfx, pos: [it.x, y + sz.y * s * 0.6, it.z], scale: it.vfxScale ?? 1, color: it.vfxColor, handle: null });
    // chimney smoke on houses/tavern/smithy
    const bn = baseName(it.m);
    if (/building_(home|tavern|blacksmith|church)/.test(bn)) {
      const off = new THREE.Vector3(0.18 * sz.x * s, 0, -0.1 * sz.z * s).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      this.smokeSpots.push({ x: it.x + off.x, y: piece.box.max.y * s * 0.97, z: it.z + off.z });
    }
    // footprint / collision
    const collide = it.collide;
    if (collide === false) return;
    const c = piece.box.getCenter(new THREE.Vector3());
    const cxw = it.x + (c.x * Math.cos(rot) + c.z * Math.sin(rot)) * s;
    const czw = it.z + (-c.x * Math.sin(rot) + c.z * Math.cos(rot)) * s;
    if (Array.isArray(collide)) {
      this.blockRect(it.x, it.z, collide[0] / 2, collide[1] / 2, rot);
      this.occupied.push({ x: it.x, z: it.z, r: Math.hypot(collide[0], collide[1]) * 0.5 + 1 });
      return;
    }
    if (typeof collide === 'number') {
      this.nav.setCircle(it.x, it.z, collide, false);
      this.occupied.push({ x: it.x, z: it.z, r: collide + 0.8 });
      return;
    }
    const foot = Math.max(sz.x, sz.z) * s;
    if (collide === true || foot > 1.4) {
      if (foot < 0.8 && collide !== true) return;
      this.blockRect(cxw, czw, (sz.x * s) / 2 * 0.95, (sz.z * s) / 2 * 0.95, rot);
      this.occupied.push({ x: cxw, z: czw, r: Math.hypot(sz.x, sz.z) * s * 0.5 + 1.0 });
    } else if (foot > 0.6) {
      this.occupied.push({ x: it.x, z: it.z, r: foot * 0.5 + 0.6 });
    }
  }

  // ---- walls ----
  placeWalls(): void {
    const h = this.half;
    const wl = h - 2;
    const straight = NEUT('wall_straight');
    const gate = NEUT('wall_straight_gate');
    const defHasWalls = this.def.props.some((p) => TAG_RE.wall.test(p.model));
    this.fillNav(defHasWalls);
    if (defHasWalls) return;
    const add = (m: string, x: number, z: number, rot: number, sx: number, tag = 'wall') => {
      this.batcher.add(m, x, 0, z, rad(rot), [sx, 6, 6], new THREE.Color(0xffffff).multiplyScalar(0.92 + this.rng.next() * 0.14), { cast: true, receive: true });
      void tag;
    };
    const span = wl - 9; // from the gate/tower edge to the tower edge
    const n = Math.max(1, Math.round(span / 12));
    const seg = span / n;
    const sx = (seg / 12) * 6;
    // south wall with an OPEN gate in the middle: the wall is instanced, the two door leaves are swung open outwards
    this.batcher.add(gate, 0, 0, wl, 0, 6, null, { cast: true, receive: true, skip: /door/ });
    this.placeGateDoors(gate, 0, wl);
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < n; i++) add(straight, sgn * (6 + seg * (i + 0.5)), wl, 0, sx);
    }
    // north wall
    for (let i = -n; i < n; i++) add(straight, (i + 0.5) * seg * 1 + 0, -wl, 0, sx);
    add(straight, 0, -wl, 0, 6);
    // east / west walls (full length between towers)
    const m = Math.max(2, Math.round((2 * wl - 18) / 12));
    const sg = (2 * wl - 18) / m;
    for (let i = 0; i < m; i++) {
      const z = -wl + 9 + sg * (i + 0.5);
      add(straight, wl, z, 90, (sg / 12) * 6);
      add(straight, -wl, z, 90, (sg / 12) * 6);
    }
    // flags along the wall top
    const flagY = 6.6;
    for (let t = -wl + 14; t <= wl - 14; t += 16) {
      const col = Math.abs(t) % 32 < 16 ? 'red' : 'blue';
      this.batcher.add(HEXP(`flag_${col}`), t, flagY, -wl, 0, 6, null, { cast: false });
      this.batcher.add(HEXP(`flag_${col}`), t, flagY, wl, PI, 6, null, { cast: false });
      this.batcher.add(HEXP(`flag_${col}`), wl, flagY, t, -PI / 2, 6, null, { cast: false });
      this.batcher.add(HEXP(`flag_${col}`), -wl, flagY, t, PI / 2, 6, null, { cast: false });
    }
  }

  /** Walkable area: the inside of the walls, the way out of the south gate and the TownDef's exit boxes. */
  fillNav(contentWalls: boolean): void {
    const h = this.half, nav = this.nav, def = this.def;
    const inner = contentWalls ? h - 2.5 : h - 4.5; // wall pieces are 4.8 m thick: their inner face is at h - 4.4 (cell centres sit on .5)
    for (let r = 0; r < nav.rows; r++)
      for (let c = 0; c < nav.cols; c++) {
        const x = nav.centerX(c), z = nav.centerZ(r);
        const inside = Math.abs(x) <= inner && Math.abs(z) <= inner;
        const corridor = Math.abs(x) <= 2.4 && z > 0 && z <= h + 8;
        nav.setCell(c, r, inside || corridor ? 1 : 0);
      }
    for (const e of def.exits ?? []) nav.setRect(Math.min(e.box[0], e.box[2]), Math.min(e.box[1], e.box[3]), Math.max(e.box[0], e.box[2]), Math.max(e.box[1], e.box[3]), true);
  }

  /** Door leaves of the south gate (separate nodes in the GLB): detached and swung open. */
  placeGateDoors(gateUrl: string, x: number, z: number): void {
    if (!getPiece(gateUrl)) return;
    const src = G.assets.instantiate(gateUrl);
    const holder = new THREE.Group();
    holder.position.set(x, 0, z);
    holder.scale.setScalar(6);
    holder.name = 'south_gate_doors';
    let n = 0;
    for (const [name, ang] of [['wall_straight_gate_door_left', 1.5], ['wall_straight_gate_door_right', -1.5]] as [string, number][]) {
      const leaf = src.getObjectByName(name);
      if (!leaf) continue;
      leaf.rotation.y = ang;
      holder.add(leaf);
      // door leaves always cast: they swing open, and the holder's x6 scale is applied after this point (policy would read 1x)
      leaf.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      n++;
    }
    if (n) this.root.add(holder);
  }

  // ---- nature ----
  placeNature(): void {
    const h = this.half;
    const rng = new RNG(hashString('town-nature:' + this.def.id));
    const col = (k = 0.1) => new THREE.Color(0xffffff).multiplyScalar(1 - k * 0.5 + rng.next() * k);
    const trees = [GP('tree_oak_a'), GP('tree_oak_b'), GP('tree_pine_a'), GP('tree_pine_b'), GP('tree_autumn')];
    const bushes = [GP('bush_a'), GP('bush_b')];
    const rocks = [GP('rock_small'), GP('rock_medium'), GP('rock_large')];
    const inner = h - 6;
    const keepClear = [{ x: 0, z: 8, r: 15.5 }, { x: 0, z: -43, r: 19 }, { x: 0, z: 48, r: 8 }];
    // The spawn and the camera's rest spot behind it (orbit camera 9 m south of the player) stay free of nature: a bush there
    // stood between the camera and the player and hid the character. The south gate arrival (z 53) is reserved too.
    const sp = this.def.spawn?.pos ?? [0, 0, 26];
    const reserved = [{ x: sp[0], z: sp[2] + 4, r: 9 }, { x: 0, z: 53, r: 6 }];
    const isReserved = (x: number, z: number, pad = 0): boolean => reserved.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + pad);
    const clear = (x: number, z: number, pad: number) => {
      if (isReserved(x, z, pad)) return false;
      if (!this.free(x, z, pad)) return false;
      const w = this.terrain.weights(x, z);
      if (w.cobble > 0.1 || w.dirt > 0.1) return false;
      return true;
    };
    // trees along the inner wall + scattered in the yards
    const placeTree = (x: number, z: number, big: number): void => {
      const url = rng.weighted(trees, (u) => (u.includes('oak') ? 3 : u.includes('autumn') ? 1.2 : 2));
      const s = (0.85 + rng.next() * 0.45) * big;
      this.batcher.add(url, x, 0, z, rng.range(0, PI * 2), s, col(0.16), { cast: true, receive: true });
      this.nav.setCircle(x, z, 0.85 * s, false);
      this.occupied.push({ x, z, r: 2.3 * s });
    };
    let placed = 0;
    for (let attempt = 0; attempt < 600 && placed < 56; attempt++) {
      const side = rng.int(0, 3);
      const t = rng.range(-inner, inner);
      const d = rng.range(inner - 9, inner - 1.5);
      const x = side === 0 ? t : side === 1 ? t : side === 2 ? d : -d;
      const z = side === 0 ? -d : side === 1 ? d : t;
      if (Math.abs(x) < 8 && z > inner - 14) continue; // keep the gate open
      if (!clear(x, z, 3.2)) continue;
      placeTree(x, z, 1);
      placed++;
    }
    for (let attempt = 0; attempt < 500 && placed < 80; attempt++) {
      const x = rng.range(-inner + 8, inner - 8), z = rng.range(-inner + 8, inner - 8);
      if (keepClear.some((k) => Math.hypot(k.x - x, k.z - z) < k.r)) continue;
      if (!clear(x, z, 4.5)) continue;
      placeTree(x, z, 0.95);
      placed++;
    }
    // bushes
    for (let attempt = 0, n = 0; attempt < 700 && n < 70; attempt++) {
      const x = rng.range(-inner, inner), z = rng.range(-inner, inner);
      if (!clear(x, z, 1.6)) continue;
      if (keepClear.some((k) => Math.hypot(k.x - x, k.z - z) < k.r - 4)) continue;
      const s = 0.8 + rng.next() * 0.7;
      this.batcher.add(rng.pick(bushes), x, 0, z, rng.range(0, PI * 2), s, col(0.2), { cast: false, layer: 'bush' });
      this.nav.setCircle(x, z, 0.6 * s, false);
      this.occupied.push({ x, z, r: 1.1 * s });
      n++;
    }
    // rocks
    for (let attempt = 0, n = 0; attempt < 400 && n < 26; attempt++) {
      const x = rng.range(-inner, inner), z = rng.range(-inner, inner);
      if (!clear(x, z, 2.2)) continue;
      const rk = rng.pick(rocks);
      const s = rk.includes('large') ? 0.6 + rng.next() * 0.4 : 0.9 + rng.next() * 0.8;
      this.batcher.add(rk, x, -0.05, z, rng.range(0, PI * 2), s, col(0.2), { cast: true, layer: 'rock' });
      this.nav.setCircle(x, z, 0.8 * s, false);
      this.occupied.push({ x, z, r: 1.5 * s });
      n++;
    }
    // grass tufts (inside) + flowers
    let tuft = 0;
    for (let attempt = 0; attempt < 20000 && tuft < 6500; attempt++) {
      const x = rng.range(-h + 4, h - 4), z = rng.range(-h + 4, h - 4);
      const w = this.terrain.weights(x, z);
      if (w.cobble > 0.05 || w.dirt > 0.05) continue;
      if (isReserved(x, z, 0.5) || !this.free(x, z, 0.2)) continue;
      this.batcher.add(GP('grass_tuft'), x, 0, z, rng.range(0, PI * 2), 0.8 + rng.next() * 0.7, col(0.25), { cast: false, receive: false, layer: 'tuft' });
      tuft++;
    }
    for (let attempt = 0, n = 0; attempt < 3000 && n < 260; attempt++) {
      // flower beds around the plaza and along the road
      const a = rng.range(0, PI * 2);
      const r = rng.range(16.8, 21.5);
      const x = Math.sin(a) * r, z = 8 + Math.cos(a) * r;
      const w = this.terrain.weights(x, z);
      if (w.cobble > 0.05 || w.dirt > 0.05 || isReserved(x, z, 0.5) || !this.free(x, z, 0.4)) continue;
      this.batcher.add(GP('flowers'), x, 0, z, rng.range(0, PI * 2), 0.9 + rng.next() * 0.5, col(0.2), { cast: false, receive: false, layer: 'flower' });
      n++;
    }
    for (let attempt = 0, n = 0; attempt < 2000 && n < 160; attempt++) {
      const x = rng.range(-h + 6, h - 6), z = rng.range(-h + 6, h - 6);
      const w = this.terrain.weights(x, z);
      if (w.cobble > 0.05 || w.dirt > 0.05 || isReserved(x, z, 0.5) || !this.free(x, z, 0.6)) continue;
      this.batcher.add(GP('flowers'), x, 0, z, rng.range(0, PI * 2), 0.8 + rng.next() * 0.5, col(0.3), { cast: false, receive: false, layer: 'flower' });
      n++;
    }
    // outside the walls: forest + tufts so the horizon is never empty
    for (let attempt = 0, n = 0; attempt < 3500 && n < 420; attempt++) {
      const x = rng.range(-h - 130, h + 130), z = rng.range(-h - 130, h + 130);
      if (Math.abs(x) < h + 3 && Math.abs(z) < h + 3) continue;
      if (Math.abs(x) < 6 && z > 0) continue; // road out of the south gate
      const url = rng.pick([trees[2], trees[3], trees[2], trees[0], trees[1], trees[3]]);
      const s = 1.1 + rng.next() * 1.0;
      this.batcher.add(url, x, 0, z, rng.range(0, PI * 2), s, col(0.3).multiplyScalar(0.85), { cast: false, receive: false });
      n++;
    }
    for (let attempt = 0, n = 0; attempt < 6000 && n < 1800; attempt++) {
      const x = rng.range(-h - 70, h + 70), z = rng.range(-h - 70, h + 70);
      if (Math.abs(x) < h + 2 && Math.abs(z) < h + 2) continue;
      this.batcher.add(GP('grass_tuft'), x, 0, z, rng.range(0, PI * 2), 1 + rng.next(), col(0.3), { cast: false, receive: false, layer: 'tuft' });
      n++;
    }
    for (let attempt = 0, n = 0; attempt < 600 && n < 40; attempt++) {
      const x = rng.range(-h - 80, h + 80), z = rng.range(-h - 80, h + 80);
      if (Math.abs(x) < h + 4 && Math.abs(z) < h + 4) continue;
      const rk = rng.pick(rocks);
      this.batcher.add(rk, x, -0.05, z, rng.range(0, PI * 2), 1.2 + rng.next() * 1.6, col(0.2), { cast: false, layer: 'rock' });
      n++;
    }
  }

  // ---- horizon ----
  placeHorizon(): void {
    const sd: [number, number, number] = GOLDEN_HOUR_SKY.sunDir;
    const far = makeMountainRing({ radius: 330, minH: 38, maxH: 92, segments: 80, seed: this.def.id + ':far', baseColor: 0x56688a, rockColor: 0x8c94ac, snowColor: 0xf6f0ee, snowLine: 0.7, haze: 0xeccfb4, hazeAmount: 0.5, slope: 0.7, sunDir: sd });
    const mid = makeMountainRing({ radius: 255, minH: 12, maxH: 34, segments: 64, seed: this.def.id + ':mid', baseColor: 0x3f5f46, rockColor: 0x6a6e64, haze: 0xe4c8a8, hazeAmount: 0.45, slope: 1.1, sunDir: sd });
    const near = makeMountainRing({ radius: 205, minH: 5, maxH: 15, segments: 56, seed: this.def.id + ':near', baseColor: 0x3d6030, rockColor: 0x58603c, haze: 0xdcc29e, hazeAmount: 0.3, slope: 1.6, sunDir: sd });
    this.root.add(far, mid, near);
    this.ringMeshes.push(far, mid, near);
    for (const m of this.ringMeshes) this.disposables.push({ dispose: () => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  }

  // ---- ambient life ----
  buildParticles(): void {
    const rng = new RNG(hashString('town-fx:' + this.def.id));
    const soft = glowTexture(32, 6, 1.4);
    const puff = glowTexture(32, 5, 1.0);
    // dust motes / pollen drifting around the camera
    this.motes = new ParticleField({ map: soft, blending: 'additive', wrap: [70, 22, 70], alpha: 0.55, intensity: 1.0, fog: [30, 110] });
    for (let i = 0; i < 380; i++)
      this.motes.add({ pos: [rng.range(-35, 35), rng.range(0.4, 20), rng.range(-35, 35)], vel: [rng.range(-0.4, 0.4), rng.range(-0.1, 0.25), rng.range(-0.4, 0.4)], speed: rng.range(0.05, 0.14), size: rng.range(0.06, 0.16), sway: rng.range(0.2, 1.2), color: 0xffe2a8 });
    this.motes.build();
    this.root.add(this.motes.mesh);
    this.fields.push(this.motes);
    // drifting leaves (shared texture)
    const leaf = canvasLeaf();
    const leaves = new ParticleField({ map: leaf, blending: 'normal', wrap: [60, 20, 60], alpha: 1, spin: 1.6, fog: [30, 100] });
    for (let i = 0; i < 90; i++)
      leaves.add({ pos: [rng.range(-30, 30), rng.range(2, 18), rng.range(-30, 30)], vel: [rng.range(0.4, 1.4), rng.range(-1.1, -0.5), rng.range(-0.6, 0.6)], speed: rng.range(0.07, 0.16), size: rng.range(0.12, 0.2), sway: rng.range(0.4, 1.6), color: rng.pick([0xd0a050, 0xb8702c, 0xa8883c, 0x8a9c3c]) });
    leaves.build();
    this.root.add(leaves.mesh);
    this.fields.push(leaves);
    // chimney smoke
    if (this.smokeSpots.length) {
      const smoke = new ParticleField({ map: puff, blending: 'normal', gravity: [0.05, 0.1, 0], sizeEnd: 3.4, alpha: 0.5, fog: [40, 140] });
      for (const s of this.smokeSpots)
        for (let i = 0; i < 14; i++)
          smoke.add({ pos: [s.x, s.y, s.z], vel: [rng.range(0.25, 0.5), rng.range(0.9, 1.3), rng.range(-0.1, 0.1)], speed: 0.16, phase: i / 14, size: 0.9, sway: 0.15, color: 0xd9d2c8 });
      smoke.build();
      this.root.add(smoke.mesh);
      this.fields.push(smoke);
    }
    // embers/sparks from fires
    if (this.emberSpots.length) {
      const em = new ParticleField({ map: soft, blending: 'additive', gravity: [0, 0.2, 0], sizeEnd: 0.3, alpha: 1, intensity: 2.4, fog: [30, 100] });
      for (const s of this.emberSpots)
        for (let i = 0; i < 9; i++)
          em.add({ pos: [s.x, s.y, s.z], vel: [rng.range(-0.3, 0.3) * s.s, rng.range(1.2, 2.6) * s.s, rng.range(-0.3, 0.3) * s.s], speed: rng.range(0.35, 0.7), size: rng.range(0.09, 0.16), sway: 0.25, color: rng.pick([0xff9a30, 0xffc050, 0xff7020]) });
      em.build();
      this.root.add(em.mesh);
      this.fields.push(em);
    }
    // fountain spray
    const fountain = this.items.find((i) => /fountain/.test(i.m));
    const fx = fountain?.x ?? 0, fz = fountain?.z ?? 8;
    const spray = new ParticleField({ map: soft, blending: 'additive', gravity: [0, -9.5, 0], sizeEnd: 0.6, alpha: 0.9, intensity: 1.0, fog: [30, 100] });
    for (let i = 0; i < 70; i++) {
      const a = rng.range(0, PI * 2), v = rng.range(0.4, 1.6);
      spray.add({ pos: [fx, 2.1, fz], vel: [Math.cos(a) * v, rng.range(4.2, 6.2), Math.sin(a) * v], speed: rng.range(0.7, 1.0), size: rng.range(0.16, 0.26), color: 0xcfeaff });
    }
    spray.build();
    this.root.add(spray.mesh);
    this.fields.push(spray);
    for (const f of this.fields) this.disposables.push(f);
  }

  buildRavens(): void {
    const mat = new THREE.MeshLambertMaterial({ color: 0x15131a, side: THREE.DoubleSide, flatShading: true });
    this.disposables.push(mat);
    // a bird-shaped body (the old 5-sided cone read as a grey pyramid when it was left at the plaza centre)
    const bodyGeo = new THREE.SphereGeometry(0.16, 8, 6);
    bodyGeo.scale(1, 0.85, 2.4);
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.25, 1.1, 0, -0.1], 3));
    wingGeo.computeVertexNormals();
    this.disposables.push(bodyGeo, wingGeo);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, mat);
      const wl = new THREE.Object3D(), wr = new THREE.Object3D();
      const wlm = new THREE.Mesh(wingGeo, mat);
      const wrm = new THREE.Mesh(wingGeo, mat);
      wrm.scale.x = -1;
      wl.add(wlm); wr.add(wrm);
      g.add(body, wl, wr);
      g.scale.setScalar(1.8);
      // hidden until updateRavens() places it on its orbit (a group left at the origin sits in the middle of the plaza)
      g.visible = false;
      this.root.add(g);
      this.ravens.push({ g, wl, wr, a: (i / 6) * PI * 2, r: 18 + (i % 3) * 5, y: 26 + (i % 2) * 4 + i, sp: (i % 2 ? 1 : -1) * (0.28 + i * 0.015) });
    }
  }

  // ---- build ----
  async build(): Promise<void> {
    this.setupLighting();
    this.setupTerrain();
    this.buildRaised();
    this.placeWalls();
    this.sealRaised();
    await this.placeItems();
    // castle position for the ravens
    const castle = this.items.find((i) => /building_castle/.test(i.m));
    this.castlePos.set(castle?.x ?? 0, 0, castle?.z ?? -(this.half + 16));
    this.placeNature();
    this.placeHorizon();
    this.buildParticles();
    this.buildRavens();
    this.halo.build();
    this.flames.build();
    const missing = await this.batcher.build();
    if (missing.length) console.warn(`[world] ${missing.length} town pieces missing`, missing.slice(0, 8));
    this.root.updateMatrixWorld(true);
    this.scene.add(this.root);
  }

  /** Ravens circle the castle. First thing in update() so a failure further down never leaves them at the origin. */
  updateRavens(dt: number): void {
    for (const r of this.ravens) {
      r.a += r.sp * dt;
      const x = this.castlePos.x + Math.cos(r.a) * r.r, z = this.castlePos.z + Math.sin(r.a) * r.r;
      r.g.position.set(x, r.y + Math.sin(this.time * 0.8 + r.a * 3) * 0.8, z);
      r.g.rotation.y = -r.a + (r.sp > 0 ? -PI / 2 : PI / 2) + PI;
      const flap = Math.sin(this.time * 9 + r.a * 5) * 0.6;
      r.wl.rotation.z = flap;
      r.wr.rotation.z = -flap;
      r.g.rotation.z = Math.sin(this.time * 0.5 + r.a) * 0.12;
      r.g.visible = true;
    }
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.updateRavens(dt);
    worldFocus(this.focus);
    this.culler.limits = TOWN_CULL;
    this.culler.update(dt, this.focus.x, this.focus.z);
    const cam = G.engine?.activeCamera;
    this.lights.update(dt, this.focus);
    this.halo.update(this.time);
    this.flames.update(this.time);
    const center = cam ? cam.position : this.focus;
    for (const f of this.fields) f.update(this.time, center);
    for (const u of this.updaters) u(dt, this.time);
    if (cam) this.sky.update(cam, this.time);
    followShadowBox(this.sun, this.sunFocus ?? this.focus, this.sunDir, 90);
    this.emitterTimer -= dt;
    if (this.emitterTimer <= 0) {
      this.emitterTimer = 0.5;
      for (const e of this.emitters) {
        const d = Math.hypot(e.pos[0] - this.focus.x, e.pos[2] - this.focus.z);
        if (d < 55 && (!e.handle || !e.handle.alive)) {
          try { e.handle = G.vfx.spawn(e.id, e.pos, { scale: e.scale, color: e.color }); } catch { e.handle = null; }
        } else if (d >= 70 && e.handle) {
          try { e.handle.stop(); } catch { /* ignore */ }
          e.handle = null;
        }
      }
    }
    for (const m of this.ringMeshes) if (cam) m.position.set(cam.position.x, 0, cam.position.z);
  }

  dispose(): void {
    for (const e of this.emitters) { try { e.handle?.stop(); } catch { /* ignore */ } e.handle = null; }
    this.emitters.length = 0;
    this.lights.dispose();
    this.batcher.dispose();
    this.halo.dispose();
    this.flames.dispose();
    this.root.removeFromParent();
    for (const d of this.disposables) { try { d.dispose(); } catch { /* ignore */ } }
    this.disposables.length = 0;
    this.sun.dispose();
    this.sky.dispose();
    this.scene.fog = this.prevFog;
    this.scene.background = this.prevBg;
  }
}

function canvasLeaf(): THREE.CanvasTexture {
  return sharedTexture('town-leaf', () => {
    const { canvas, ctx } = makeCanvas(16, 16);
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(1, 8); ctx.lineTo(8, 2); ctx.lineTo(15, 8); ctx.lineTo(8, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(2, 8, 12, 1);
    const img = ctx.getImageData(0, 0, 16, 16);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 100 ? 255 : 0;
    ctx.putImageData(img, 0, 0);
    return canvasTexture(canvas, { repeat: false, mipmaps: false });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All model urls the default layout + the TownDef need (preload). */
export function townAssetUrls(def: TownDef): string[] {
  const out = new Set<string>();
  for (const it of layout(Math.max(def.size[0], def.size[1]) / 2)) out.add(it.m);
  for (const p of def.props) out.add(p.model);
  for (const n of ['tree_oak_a', 'tree_oak_b', 'tree_pine_a', 'tree_pine_b', 'tree_autumn', 'bush_a', 'bush_b', 'rock_small', 'rock_medium', 'rock_large', 'grass_tuft', 'flowers']) out.add(GP(n));
  for (const u of cottageUrls()) out.add(u);
  out.add(NEUT('wall_straight'));
  out.add(NEUT('wall_straight_gate'));
  out.add(HEXP('flag_red'));
  out.add(HEXP('flag_blue'));
  return [...out];
}

/**
 * Builds the hub town "Kadim Liman": PSX splat-mapped ground, KayKit/Kenney/generated buildings and props, walls,
 * nature, sky dome + horizon mountains, golden-hour sun with shadows, fog, lamp lights, ambient particles and ravens.
 * NPC entities are created by TownScene from def.npcs (the builder keeps their spots clear).
 * OWNER: world module.
 */
export async function buildTown(def: TownDef, scene: THREE.Scene): Promise<BuiltTown> {
  const b = new TownBuild(def, scene);
  await loadPieces(townAssetUrls(def));
  await b.build();
  const spawn = new THREE.Vector3(def.spawn.pos[0], def.spawn.pos[1], def.spawn.pos[2]);
  const arrival = def.arrival ? new THREE.Vector3(def.arrival.pos[0], def.arrival.pos[1], def.arrival.pos[2]) : new THREE.Vector3(TOWN_POIS.arrival.x, 0, TOWN_POIS.arrival.z);
  const arrivalYaw = def.arrival ? (def.arrival.facing * PI) / 180 : TOWN_POIS.arrival.yaw;
  // the stub TownDef spawns at the origin: use the plaza spawn instead
  if (def.spawn.pos[0] === 0 && def.spawn.pos[2] === 0) spawn.set(TOWN_POIS.spawn.x, 0, TOWN_POIS.spawn.z);
  const spawnYaw = def.spawn.pos[0] === 0 && def.spawn.pos[2] === 0 && def.spawn.facing === 0 ? TOWN_POIS.spawn.yaw : (def.spawn.facing * PI) / 180;
  return {
    root: b.root,
    nav: b.nav,
    spawn,
    spawnYaw,
    update: (dt) => b.update(dt),
    dispose: () => b.dispose(),
    get lightsActive() { return b.lights.activeCount; },
    arrival,
    arrivalYaw,
    pois: TOWN_POIS,
    anchors: b.anchors,
    half: b.half,
    groundY: (x, z) => b.groundY(x, z),
    sunFollow: (p) => { (b.sunFocus ??= new THREE.Vector3()).copy(p); },
    lighting: { sun: b.sun, hemi: b.hemi },
  };
}

// ---------------------------------------------------------------------------
// Open-world villages (GDD_OPENWORLD §9.2): the same TownProp records, placed into the world's batches.
// ---------------------------------------------------------------------------

/** Where open-world village props go: the world's root, instance batcher, real-light pool and nav grid. */
export interface TownPropHost {
  root: THREE.Object3D;
  batcher: InstanceBatcher;
  lights: LightPool;
  nav: NavGrid;
}

/** Axis-aligned nav block of a rotated box (w along local x, d along local z, metres). */
function blockBox(nav: NavGrid, x: number, z: number, w: number, d: number, rot: number): void {
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  const hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2;
  nav.setRect(x - hx, z - hz, x + hx, z + hz, false);
}

/**
 * Places village props (TownProp, metres relative to `origin`, world y as given) for the open world. Static pieces go to the
 * InstanceBatcher (per-instance tint), emissive / animated ones are spawned as objects, `collide` props block the nav (box or
 * circle), `light` props take a priority slot of the LightPool. A missing piece is skipped with one warning. Never throws.
 */
export async function placeTownProps(props: TownProp[], origin: { x: number; z: number }, host: TownPropHost): Promise<void> {
  if (!props.length) return;
  await loadPieces(props.map((p) => p.model));
  for (const p of props) {
    try {
      const wx = origin.x + p.pos[0], wz = origin.z + p.pos[2], y = p.pos[1];
      const rot = ((p.rot ?? 0) * Math.PI) / 180;
      const s = p.scale ?? 1;
      const sz = getPiece(p.model)?.size ?? new THREE.Vector3(1, 1, 1);
      if (p.emissive !== undefined || isAnimatedModel(p.model)) {
        const obj = await spawnStaticObject(p.model, { tint: p.tint, emissive: p.emissive, emissiveIntensity: p.emissiveIntensity });
        if (obj) {
          obj.position.set(wx, y, wz);
          obj.rotation.y = rot;
          obj.scale.setScalar(s);
          host.root.add(obj);
          applyShadowPolicy(obj);
          obj.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) m.receiveShadow = true; });
          freezeStatic(obj);
        }
      } else {
        host.batcher.add(p.model, wx, y, wz, rot, s, p.tint ?? null, { cast: sz.y * s > 0.5, receive: true, layer: 'prop' });
      }
      if (p.collide) {
        if (p.box) blockBox(host.nav, wx, wz, p.box[0] * s, p.box[1] * s, rot);
        else host.nav.setCircle(wx, wz, p.radius ?? Math.max(sz.x, sz.z) * s * 0.4, false);
      }
      if (p.light) {
        const lp: [number, number, number] = [wx, y + (p.light.y ?? sz.y * s * 0.85), wz];
        host.lights.add(lp, { color: p.light.color, intensity: designToPhysical(p.light.intensity), distance: p.light.distance, flicker: p.light.flicker ? 0.3 : 0.05, priority: 1 });
      }
    } catch (e) {
      console.warn('[world] village prop failed', p.model, e);
    }
  }
}
