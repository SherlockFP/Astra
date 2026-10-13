# Environment assets: dungeons + hub town

Reference for level builders. Every number here was measured from the GLB files with
`tools/glb-inspect.mjs` (full machine-readable dump: `docs/assets/environment.json`, generated with
`--json --short`) plus extra probes of vertex data for doors, stairs and openings.
Credits and licences are in `docs/assets/credits-environment.md`. Everything is CC0.

Units are metres, Y is up. "Front" of a piece is its local **+Z**. Rotations below are three.js
`object.rotation.y` values (radians). Rotating by θ sends local +Z to world `(sin θ, 0, cos θ)`, so
**to make a piece face direction (dx, dz), use `rotY = Math.atan2(dx, dz)`**.

## 0. TL;DR

- KayKit hero height is about 2.5 m (Knight bind pose AABB is 2.47 m tall). The KayKit dungeon,
  Halloween and Furniture packs are all at that scale (**scale 1**).
- **Dungeon module = 4 m.** Straight wall = 4 W x 4 H x 1 D. Floor tile = 4 x 4 (large) or 2 x 2 (small).
  Floor top surface is at **y = +0.05** (tiles go from y -0.1 to +0.05). Walls start at y = 0.
- Pivots are at the **bottom centre** unless noted. A wall's centre line runs through its pivot along
  local X, and the wall is ±0.5 m thick on Z.
- Corners, T-junctions and crossings work like **pipe tiles**: each arm runs 2 m from the pivot. Pieces
  connect when their pivots are 4 m apart on the same line.
- The door opening is **2.0 W x 2.75 H**. `wall_doorway.glb` contains a separate door node with a hinge,
  so you can animate it.
- Stairs rise 4 m over 4 m (8 steps of 0.5 m). The **top step is at the pivot edge** and the stairs
  descend toward local +Z.
- All 203 dungeon GLBs use **one material (`texture`) and one 1024² atlas**, a copy of which is embedded in every
  file. You can swap in one shared material (`/assets/models/dungeon/dungeon_texture.png`, NearestFilter)
  and instance or merge freely. The same holds per pack for Halloween (`halloweenbits_texture.png`), Furniture
  (`furniturebits_texture.png`) and Town (`hexagons_medieval.png`). The Kenney kits reference an
  external `Textures/colormap.png` (512²) next to the GLBs. Keep that folder. The Kenney nature kit has no
  textures and uses flat colour materials.
- There are no animations in the KayKit environment files. Doors, chest lids and spike traps are separate child
  **nodes** that you move in code. Kenney files with animations: `graveyard-kit/character-{ghost,keeper,skeleton,vampire,zombie}`
  (full humanoid set: idle, walk, sprint, attack-melee-*, die, ...), `graveyard-kit/crypt-door` and `crypt-large-door`
  (open/close), and `survival-kit/chest` (open/close).

## 1. Folder map

| Public URL root | Source pack | Files | Scale vs KayKit hero | Texture / material |
|---|---|---|---|---|
| `/assets/models/dungeon/` | KayKit Dungeon Remastered 1.0 | 203 glb | 1 | 1 atlas `dungeon_texture.png`, material `texture` |
| `/assets/models/halloween/` | KayKit Halloween Bits 1.0 | 63 glb | 1 | 1 atlas `halloweenbits_texture.png` |
| `/assets/models/furniture/` | KayKit Furniture Bits 1.0 | 53 glb | 1 | 1 atlas `furniturebits_texture.png` |
| `/assets/models/town/` (`buildings/{blue,green,red,yellow,neutral}`, `decoration/{nature,props}`, `tiles/{base,roads}`) | KayKit Medieval Hexagon Pack 1.0 | 181 glb | **x6** (tabletop miniatures) | 1 atlas `hexagons_medieval.png` |
| `/assets/models/kenney/fantasy-town-kit/` | Kenney Fantasy Town Kit 2.0 | 167 glb | **x4** (1 unit = 1 storey = 4 m) | `Textures/colormap.png` |
| `/assets/models/kenney/castle-kit/` | Kenney Castle Kit 2.0 | 76 glb | **x4** (wall 1 x 1.31 units) | `Textures/colormap.png` |
| `/assets/models/kenney/graveyard-kit/` | Kenney Graveyard Kit 5.0 | 91 glb | **x3** for characters/props (characters 0.8 tall) | `Textures/colormap.png` |
| `/assets/models/kenney/survival-kit/` | Kenney Survival Kit 2.0 | 80 glb | **x3** (anvil 0.34 tall becomes 1 m) | `Textures/colormap.png` |
| `/assets/models/kenney/nature-kit/` | Kenney Nature Kit 2.1 | 329 glb | **x4** (1-unit ground tiles; tree_default becomes 6.8 m) | flat colour materials, no textures |

The KayKit Halloween, Furniture and Hexagon packs ship as `.gltf + .bin + .png`. They were packed losslessly into single
`.glb` files with the texture embedded, so every URL above is one self-contained file. The dungeon files were
renamed from `name.gltf.glb` to `name.glb`. Kenney nature-kit GLBs sit about 0.05 below y=0 (that is the ground thickness).

## 2. KayKit dungeon: grid spec (the key info)

### 2.1 Measured facts

| Piece | Size W x H x D | Local bounds | Meaning |
|---|---|---|---|
| `floor_tile_large` | 4 x 0.15 x 4 | x,z ±2, y -0.1..0.05 | 1 cell. Same size: `floor_wood_large*`, `floor_dirt_large*`, `floor_tile_big_grate*`, `floor_tile_big_spikes` |
| `floor_tile_small` | 2 x 0.15 x 2 | x,z ±1 | quarter cell (2 m sub-grid) |
| `floor_tile_extralarge_grates` | 8 x 1.13 x 8 | x,z ±4 | 2x2 cells (pivot on a cell corner) |
| `wall` (and every 4 m variant) | 4 x 4 x 1 | x ±2, z ±0.5, y 0..4 | one wall slot. Both faces identical |
| `wall_corner` | 2.5 x 4 x 2.5 | x -2..0.5, z -0.5..2 | L: arms toward **-X** and **+Z** |
| `wall_corner_small` | 1.5 x 4 x 1.5 | x -1..0.5, z -0.5..1 | L with 1 m arms (2 m sub-grid) |
| `wall_Tsplit` | 4 x 4 x 2.5 | x ±2, z -0.5..2 | straight X wall + arm toward +Z |
| `wall_crossing` | 4 x 4 x 4 | x,z ±2 | + junction |
| `wall_half` | 2 x 4 x 1 | x 0..2 | half slot toward +X |
| `wall_half_endcap` | 2 x 4 x 1 | x -2..0 | half slot toward -X with a finished end at the pivot |
| `wall_endcap` | 1.07 x 4 x 1 | x 0..1.07 | short capped stub |
| `wall_doorway` | 4 x 4 x 1 | x ±2 | opening 2.0 x 2.75 at x=0. Child `wall_doorway_door` |
| `wall_doorway_Tsplit` | 8 x 4 x 2.5 | x ±4, z -0.5..2 | room wall with doorway + corridor arms at x=±2 toward +Z |
| `wall_doorway_sides` | 5 x 4 x 4 | x ±2.5, z ±2 | doorway across a corridor with walls at x=±2 |
| `pillar` | 1.5 x 4 x 1.5 | centred | full height pillar |
| `stairs` | 5 x 5.1 x 4 | x ±2.5, z 0..4 | top y=4 at z=0, bottom at z=4. Walk width 3.5 |

The wall height (4 m) equals one storey: stairs rise 4 m, and `floor_foundation_*` blocks are 2 m (half a storey).

### 2.2 The lattice (how pieces line up)

Use a **4 m cell grid**. Put floor tiles at cell **centres** `(4i, 4j)` and all wall-type pieces
(wall, corner, T, cross, doorway) with their pivot on cell **corners** `(4i±2, 4j±2)`. A straight wall
centred on a cell corner covers half of each adjacent cell edge. A corner piece's two 2 m arms cover the
other halves, so the wall line always runs along cell boundaries with no overlaps or gaps.

```
 z
 ^   C----W----W----C      C = wall_corner     (pivot on a cell corner)
 |   |    .    .    |      W = wall (rotY 0 along X, PI/2 along Z), pivot on a cell corner
     W  F . F  . F  W      F = floor_tile_large at the cell centre
     |    .    .    |      each W/C arm reaches 2 m, so neighbours on a line are 4 m apart
     W  F . F  . F  W
     |    .    .    |
     C----W----W----C  -> x
```

All positions snap to a **2 m sub-grid**: every piece's ends are at multiples of 2 m. Use `wall_half`,
`wall_corner_small` and `floor_tile_small` to make 2 m jogs.

### 2.3 Rotation tables (three.js `rotation.y`)

- **Straight wall:** `0` runs along X, `PI/2` runs along Z. It is symmetric, so ±PI makes no difference.
- **wall_corner and barrier_corner** (default arms -X and +Z):

| Room corner | Arms needed | rotY |
|---|---|---|
| min-x, min-z | +X, +Z | `+PI/2` |
| max-x, min-z | -X, +Z | `0` |
| max-x, max-z | -X, -Z | `-PI/2` |
| min-x, max-z | +X, -Z | `PI` |

- **wall_Tsplit** (arm toward local +Z): arm to +Z uses `0`, to +X uses `PI/2`, to -Z uses `PI`, to -X uses `-PI/2`.
- **wall_half / barrier_half** (extends +X from the pivot): toward +X `0`, -Z `PI/2`, -X `PI`, +Z `-PI/2`.
- **Wall-mounted props** (`torch_mounted`, `shelf_*`, the Furniture pack's `pictureframe_*`) start at z=0 and extend +Z. Put the pivot
  on the wall **face** (wall line + 0.5 m along the room normal) with `rotY = atan2(nx, nz)`, where n is the normal pointing into the room.
  **Banners** (`banner_*`) and `pillar_decorated` are authored to sit at the **wall pivot itself** (cloth at z 0.38..0.69).

### 2.4 Doors and openings

- `wall_doorway`: the opening is 2.0 W x 2.75 H (arched top) at the pivot. Child node `wall_doorway_door` is a
  2.0 x 2.75 x 0.77 panel with its hinge at local (-0.82, 0, 0) (the node origin). Open it with
  `door.rotation.y = ±Math.PI/2` and tween over about 0.4 s. Get the node with `gltf.scene.getObjectByName('wall_doorway_door')`.
  `wall_doorway_scaffold` works the same way (door node `wall_doorway_scaffold_door`).
- `wall_open_scaffold`: a wide open arch (~3.5 W x 3 H) with no door. Use it for always-open passages.
- `wall_gated`: portcullis bars that cannot be passed. For a "boss door", swap it for `wall_open_scaffold` or slide it down in code.
- `wall_window_*`, `wall_archedwindow_*` and `wall_broken` have openings that start about 1 m up and cannot be passed.
- **Simplest door:** swap any `wall` for `wall_doorway` at the same pivot and rotation. The opening is then centred on a cell
  corner, which is fine between two rooms that share a wall.
- **Corridor-aligned door (opening centred on a cell):** use `wall_doorway_Tsplit` (8 m) with its pivot on the **cell edge
  midpoint** `(cx, zWall)`. It replaces the two walls at `cx±2` and gives you the first 2 m of corridor walls at `x=cx±2`.
  The corridor is 1 cell wide, with floor tiles at `(cx, zWall + 2 + 4k)` and walls with `rotY=PI/2` at `(cx±2, zWall + 4k)` for k ≥ 1.
  Use `rotY = PI` when the corridor leaves toward -Z. The cell must not be at the very end of the room wall (corner arms would overlap it).
- `wall_doorway_sides`: a door across a 1-cell corridor. Put the pivot on the corridor centre line at a cell boundary.
  It replaces the two corridor wall pieces at `(cx±2, zBoundary)`.

### 2.5 Stairs and levels

- Storey height is 4 m. To link an upper floor at y=0 that ends at edge line `z=e` with a lower floor at y=-4,
  put `stairs` at `(x, -4, e)` with rotY 0. The top is then at z=e, y=0 and the stairs descend into +Z (one cell deep).
- `stairs_walled` (5 wide) has solid side walls at abs(x) 1.4..2.5, exactly on the corridor wall lines at x=±2. Use it for
  1-cell stairwells, where it replaces the corridor walls of that cell. `stairs` (5 wide) has railings that overhang into the wall slots.
  `stairs_narrow` is 4 wide.
- `stairs_wall_left` and `stairs_wall_right`: a 4 m wall on z=0 with steps on its +Z side that climb along the wall (toward -X or +X).
- For collision, use a ramp: a plane from (z=0, y=4) to (z=4, y=0), which is 45°. Clamp the controller to it or treat each 0.5 m step as a step-up.

### 2.6 Raised platforms, pits, traps

- `floor_foundation_*` (2x2, top y=2) are platform blocks with finished stone sides on the named faces (front = +Z).
  Put `floor_tile_small` on top at y=2 for a dais, or line a sunken arena with them.
- Pits: `floor_tile_grate` (4x2), `floor_tile_big_grate` (4x4) and `floor_tile_extralarge_grates` (8x8) have about 1 m of depth below.
  Each `_open` variant has an open hole.
- Spike trap: `floor_tile_big_spikes`, child node `spikes`. Retract with `spikes.position.y = -2` and extend with `0`.

### 2.7 Light sources (place PointLights in code; there is no emissive data)

| Model | Where the flame is (local) | Suggested light |
|---|---|---|
| `dungeon/torch_mounted` | about (0, 0.7, 0.3). Mount at y ≈ 2.5 on a wall face | PointLight 0xff8a3c, distance 10-12, flicker |
| `dungeon/torch_lit` (loose or held) | top at y 0.73 | same |
| `dungeon/candle_lit`, `candle_thin_lit` | top at y 1.05 | 0xffb070, distance 4 |
| `dungeon/candle*` (unlit), `candle_triple`, `shelf_small_candles` | decorative | a fake glow sprite is enough |
| `halloween/lantern_standing`, `lantern_hanging` (hangs from y=0), `post_lantern` (lamp on a +Z arm, 3.3 m) | lantern body | 0xffc070, distance 8 |
| `halloween/candle*`, `skull_candle`, `plaque_candles`, `shrine_candles`, `pumpkin_*_jackolantern` | top of model | 0xff9a40, distance 4-6 |
| `furniture/lamp_standing` (2.5 m), `lamp_table` | shade | 0xffe0b0, distance 6 |
| `kenney/graveyard-kit/fire-basket` (brazier), `lightpost-*`, `lantern-*`, `candle*` | top | ×3 scale first |
| `kenney/fantasy-town-kit/lantern` (street lamp, 1.56 units) | top | ×4 scale first |
| `kenney/survival-kit/campfire-pit`, `kenney/nature-kit/campfire_*` | centre | 0xff7a2a, distance 10 |

There is no brazier in the KayKit dungeon pack. Use `kenney/graveyard-kit/fire-basket` scaled x3 (about 1.3 m wide, 0.5 m tall) on a `dungeon/column`.
For the PSX look, keep about 4-8 real PointLights near the player and fake the rest with additive glow sprites.

### 2.8 Performance and collision

- Each GLB is one mesh, except the door, chest and spikes files. Because the material is shared per pack, a whole dungeon floor plan can be
  built from one `InstancedMesh` per piece type, or merged per room with `BufferGeometryUtils.mergeGeometries`.
- Collision boxes: a wall slot is a 4 x 4 x 1 box centred at (pivot.x, 2, pivot.z). A corner is two boxes, x[-2,0.5] x z[-0.5,0.5] and
  x[-0.5,0.5] x z[-0.5,2], before rotation. A doorway is two side boxes of 1 m each (x ±1..±2) plus a lintel above y=2.75.

## 3. Recipe: build a 3x3-cell room with a corridor door

A room of 3x3 cells has 12 x 12 m between wall centre lines (11 x 11 walkable). Cell centres are x,z ∈ {-4, 0, 4},
the wall lines are x = ±6 and z = ±6, and all files are under `/assets/models/dungeon/`.

1. **Floor:** 9 x `floor_tile_large` at `(x, 0, z)` for x,z ∈ {-4,0,4}. Randomise rotY across 0/90/180/270 degrees for variety, and drop in
   `floor_tile_large_rocks` or `floor_dirt_large` occasionally.
2. **Corners:** `wall_corner` at (-6,0,-6) with rotY +PI/2, (6,0,-6) with 0, (6,0,6) with -PI/2, and (-6,0,6) with PI.
3. **Walls (north, east, west):** `wall` at (-2,0,-6) and (2,0,-6) with rotY 0. Then `wall` at (6,0,-2), (6,0,2), (-6,0,-2) and (-6,0,2) with rotY PI/2.
   Swap one for `wall_shelves`, `wall_pillar`, `wall_cracked` or `wall_window_closed` for variety. Note that wall_shelves are on +Z, so use rotY PI on a south wall.
4. **South wall with corridor door:** `wall_doorway_Tsplit` at (0,0,6) with rotY 0. It covers x -4..4 and has arms at x=±2 down to z=8.
   - Corridor floor: `floor_tile_large` at (0,0,8), (0,0,12), and so on.
   - Corridor walls: `wall` with rotY PI/2 at (-2,0,10), (2,0,10), (-2,0,14), (2,0,14), and so on.
5. **Torches:** `torch_mounted` at (-2, 2.5, -5.5) with rotY 0 (north wall, facing +Z) and at (5.5, 2.5, 2) with rotY -PI/2 (east wall, facing -X).
   Add PointLights at about (-2, 3.2, -5.2) and (5.2, 3.2, 2).
6. **Banner:** `banner_patternA_red` at the north wall pivot (2, 0, -6) with rotY 0. The cloth hangs on the room side.
7. **Pillars:** `pillar` at the interior cell corners (±2, 0, ±2).
8. **Loot and props:** `chest` at (0, 0.05, -4.3) with rotY 0 (it faces +Z toward the room centre). Put `barrel_small` and `crates_stacked` near (±4.8, 0.05, -4.8).
   Swap the floor at (4,0,4) for `floor_tile_big_spikes`.

```ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
type Piece = { file: string; x: number; y?: number; z: number; rotY?: number };
const DUN = '/assets/models/dungeon/';
const PI = Math.PI;
/** Room of w x d cells; cell (i,j) centre = (cx0 + 4i, cz0 + 4j). Returns floors + corners + walls. */
export function roomPieces(cx0: number, cz0: number, w: number, d: number): Piece[] {
  const P: Piece[] = [];
  const x0 = cx0 - 2, x1 = cx0 + 4 * (w - 1) + 2, z0 = cz0 - 2, z1 = cz0 + 4 * (d - 1) + 2;
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) P.push({ file: 'floor_tile_large', x: cx0 + 4 * i, z: cz0 + 4 * j });
  P.push({ file: 'wall_corner', x: x0, z: z0, rotY: PI / 2 }, { file: 'wall_corner', x: x1, z: z0, rotY: 0 },
         { file: 'wall_corner', x: x1, z: z1, rotY: -PI / 2 }, { file: 'wall_corner', x: x0, z: z1, rotY: PI });
  for (let x = x0 + 4; x < x1; x += 4) P.push({ file: 'wall', x, z: z0 }, { file: 'wall', x, z: z1 });
  for (let z = z0 + 4; z < z1; z += 4) P.push({ file: 'wall', x: x0, z, rotY: PI / 2 }, { file: 'wall', x: x1, z, rotY: PI / 2 });
  return P;
}
export async function buildPieces(scene: THREE.Scene, pieces: Piece[]) {
  const loader = new GLTFLoader(); const cache = new Map<string, THREE.Object3D>();
  for (const p of pieces) {
    if (!cache.has(p.file)) cache.set(p.file, (await loader.loadAsync(DUN + p.file + '.glb')).scene);
    const o = cache.get(p.file)!.clone(); // clone() shares geometry + material
    o.position.set(p.x, p.y ?? 0, p.z); o.rotation.y = p.rotY ?? 0; scene.add(o);
  }
}
// roomPieces(-4, -4, 3, 3) reproduces steps 1-3 (then replace the walls at (+-2, 6) by wall_doorway_Tsplit at (0, 6)).
```

A 1x1 room is just the 4 corners. A corridor is a w=1 strip whose end walls are replaced by `wall_doorway_Tsplit`
on the rooms it joins, or by open space.

## 4. Hub town notes

- **Hexagon pack buildings are miniatures.** At x6 a home is about 5.6 m tall, the tavern 8.4 m, the castle 24 m, and a hex tile is 12 m across.
  They are closed meshes with no interiors, so use them as façades with box colliders. Each building exists in 4 faction colours with identical
  geometry: blue, green, red, yellow. Suggested hub picks: `building_tavern` (inn), `building_blacksmith` (the +0..+15 upgrade NPC),
  `building_market` (vendor), `building_church` (respawn/healer), `building_castle` (Mythic+ keystone portal backdrop), `building_well` (plaza centre),
  `building_windmill` and `building_watermill` (outskirts), plus `wall_straight`, `wall_corner_*` and `wall_straight_gate` for the town wall.
  Hex tiles (pointy-top, 2.0 flat-to-flat on X, 2.31 on Z, top y=0) can make a stylised ground, but a flat ground mesh is simpler.
- **Kenney Fantasy Town Kit at x4** gives modular human-scale houses: wall panels sit on the +X edge of a 1x1 cell (x 0.4..0.5),
  1 unit per storey. It includes `wall-door`, `wall-doorway-*`, `wall-window-*`, roof sets, `stairs-*`, `road-*`, `fountain-*`, `stall-*`
  (market stalls), `lantern` and `cart`. Mixing a few Kenney houses with KayKit props works because both are low-poly flat-shaded.
- **Kenney Castle Kit at x4:** towers, walls, gates and a drawbridge for the town's outer wall or a castle dungeon entrance.
- **Kenney Survival Kit at x3:** `workbench-anvil` and `workbench-grind` for the blacksmith, `campfire-pit`, `tent`, `barrel` and `chest` (animated lid).
- **Nature at x4** (Kenney nature-kit): trees, rocks, cliffs, flowers, grass, bushes, mushrooms, statues and paths.
  KayKit Halloween `tree_dead_*` and `tree_pine_*` (scale 1) give spooky outskirts.

## 5. Asset lists (generated from environment.json)

Columns: public URL (load with GLTFLoader), AABB size in metres at native scale, and where the pivot sits relative to the
geometry ("bottom, centre" = pivot at the bottom centre). `{a,b,c}` marks colour variants with identical geometry.

### Dungeon (KayKit Dungeon Remastered) - `/assets/models/dungeon/`


#### Floors (4x4 large, 2x2 small; top surface y=+0.05)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/floor_dirt_large.glb` | 4 x 0.21 x 4 | top surface y=0.11, centre |  |
| `/assets/models/dungeon/floor_dirt_large_rocky.glb` | 4 x 0.39 x 4 | y -0.1..0.29, centre |  |
| `/assets/models/dungeon/floor_dirt_small_A.glb` | 2 x 0.19 x 2 | top surface y=0.09, centre |  |
| `/assets/models/dungeon/floor_dirt_small_B.glb` | 2 x 0.19 x 2 | top surface y=0.09, centre |  |
| `/assets/models/dungeon/floor_dirt_small_C.glb` | 2 x 0.21 x 2 | top surface y=0.11, centre |  |
| `/assets/models/dungeon/floor_dirt_small_corner.glb` | 2 x 0.15 x 2 | top surface y=0.05, centre |  |
| `/assets/models/dungeon/floor_dirt_small_D.glb` | 2 x 0.14 x 2 | top surface y=0.04, centre |  |
| `/assets/models/dungeon/floor_dirt_small_weeds.glb` | 2 x 0.29 x 2 | y -0.1..0.2, centre |  |
| `/assets/models/dungeon/floor_tile_large.glb` | 4 x 0.15 x 4 | top surface y=0.05, centre |  |
| `/assets/models/dungeon/floor_tile_large_rocks.glb` | 4 x 0.64 x 4 | y -0.1..0.54, centre |  |
| `/assets/models/dungeon/floor_tile_small.glb` | 2 x 0.15 x 2 | top surface y=0.05, centre |  |
| `/assets/models/dungeon/floor_tile_small_broken_A.glb` | 2 x 0.15 x 2 | top surface y=0.05, centre |  |
| `/assets/models/dungeon/floor_tile_small_broken_B.glb` | 2 x 0.15 x 2 | top surface y=0.05, centre |  |
| `/assets/models/dungeon/floor_tile_small_corner.glb` | 2 x 0.15 x 2 | top surface y=0.05, centre |  |
| `/assets/models/dungeon/floor_tile_small_decorated.glb` | 2 x 0.77 x 2 | y -0.1..0.67, centre |  |
| `/assets/models/dungeon/floor_tile_small_weeds_A.glb` | 2 x 0.29 x 2 | y -0.1..0.2, centre |  |
| `/assets/models/dungeon/floor_tile_small_weeds_B.glb` | 2 x 0.29 x 2 | y -0.1..0.2, centre |  |
| `/assets/models/dungeon/floor_wood_large.glb` | 4 x 0.15 x 4 | top surface y=0.05, centre |  |
| `/assets/models/dungeon/floor_wood_large_dark.glb` | 4 x 0.15 x 4 | top surface y=0.05, centre |  |
| `/assets/models/dungeon/floor_wood_small.glb` | 2 x 0.15 x 2 | top surface y=0.05, centre |  |
| `/assets/models/dungeon/floor_wood_small_dark.glb` | 2 x 0.15 x 2 | top surface y=0.05, centre |  |

#### Raised floor / platform blocks (2x2x2, top y=2)

Stone blocks with visible stone sides on the named faces ("front" = +Z side). Use for daises, raised platforms, pit edges. Top is solid at y=2.0.

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/floor_foundation_allsides.glb` | 2.2 x 2 x 2.2 | bottom, centre |  |
| `/assets/models/dungeon/floor_foundation_corner.glb` | 2.1 x 2 x 2.1 | bottom, centre |  |
| `/assets/models/dungeon/floor_foundation_diagonal_corner.glb` | 2.1 x 2 x 2.1 | bottom, centre |  |
| `/assets/models/dungeon/floor_foundation_front.glb` | 2 x 2 x 2.1 | bottom, centre |  |
| `/assets/models/dungeon/floor_foundation_front_and_back.glb` | 2 x 2 x 2.2 | bottom, centre |  |
| `/assets/models/dungeon/floor_foundation_front_and_sides.glb` | 2.2 x 2 x 2.1 | bottom, centre |  |

#### Traps / pits

`floor_tile_big_spikes` has child node `spikes` (local origin 0,0,0, spikes extend y 0..2): animate `spikes.position.y` from -2 (hidden) to 0 (out). Grate tiles have a ~1 m deep pit below (y down to -1); `_open` variants have the grate removed (fall/pit).

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/floor_tile_big_grate.glb` | 4 x 1.05 x 4 | top surface y=0.05 (pit/base to y=-1), centre |  |
| `/assets/models/dungeon/floor_tile_big_grate_open.glb` | 4 x 1.05 x 4 | top surface y=0.05 (pit/base to y=-1), centre | open pit |
| `/assets/models/dungeon/floor_tile_big_spikes.glb` | 4 x 2.1 x 4 | y -0.1..2, centre | TRAP: child `spikes` (x/z +-1.1, y 0..2); hide with spikes.position.y=-2 |
| `/assets/models/dungeon/floor_tile_extralarge_grates.glb` | 8 x 1.13 x 8 | top surface y=0.15 (pit/base to y=-0.98), centre | 8x8 = 2x2 cells: pivot on a cell corner |
| `/assets/models/dungeon/floor_tile_extralarge_grates_open.glb` | 8 x 1.13 x 8 | top surface y=0.15 (pit/base to y=-0.98), centre | open pit 8x8 |
| `/assets/models/dungeon/floor_tile_grate.glb` | 4 x 1.03 x 2 | top surface y=0.05 (pit/base to y=-0.98), centre | 4x2 = half a cell |
| `/assets/models/dungeon/floor_tile_grate_open.glb` | 4 x 1.03 x 2 | top surface y=0.05 (pit/base to y=-0.98), centre |  |

#### Walls - straight 4 m (pivot = centre of the wall line, thickness +-0.5 on Z)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/wall.glb` | 4 x 4 x 1 | bottom, centre | plain wall, both faces identical |
| `/assets/models/dungeon/wall_arched.glb` | 4 x 4 x 1 | bottom, centre |  |
| `/assets/models/dungeon/wall_archedwindow_gated.glb` | 4 x 4 x 1 | bottom, centre | barred arched window, sill ~1 m, not passable |
| `/assets/models/dungeon/wall_archedwindow_gated_scaffold.glb` | 4 x 4 x 1 | bottom, centre |  |
| `/assets/models/dungeon/wall_archedwindow_open.glb` | 4 x 4 x 1 | bottom, centre | arched window 2.0 W, y 1.0..2.75, not passable |
| `/assets/models/dungeon/wall_broken.glb` | 4 x 4 x 1 | bottom, centre | hole in wall x -0.6..1.0, y 1.2..2.2 (not passable) |
| `/assets/models/dungeon/wall_cracked.glb` | 4 x 4 x 1.26 | bottom, centre | cracked, bulges to +-0.63 |
| `/assets/models/dungeon/wall_gated.glb` | 4 x 4 x 1 | bottom, centre | portcullis bars x -1.6..1.6, y 0.8..3.0 - NOT passable (swap for wall_open_scaffold/wall_doorway when opened) |
| `/assets/models/dungeon/wall_pillar.glb` | 4 x 4 x 1.5 | bottom, centre | wall with 1.5x1.5 pillar at centre (sticks out 0.25 m each side) |
| `/assets/models/dungeon/wall_scaffold.glb` | 4 x 4 x 1 | bottom, centre |  |
| `/assets/models/dungeon/wall_shelves.glb` | 4 x 4 x 1.37 | bottom, x centred, z -0.5..0.87 | shelves on the +Z face only |
| `/assets/models/dungeon/wall_sloped.glb` | 4 x 4 x 1 | bottom, centre | top slopes from 4.0 m (x=-2) to 0.5 m (x=+2): ruined wall / beside stairs |
| `/assets/models/dungeon/wall_window_closed.glb` | 4 x 4 x 1 | bottom, centre | shuttered window |
| `/assets/models/dungeon/wall_window_closed_scaffold.glb` | 4 x 4 x 1 | bottom, centre |  |
| `/assets/models/dungeon/wall_window_open.glb` | 4 x 4 x 1 | bottom, centre | square window x -0.7..0.7, y 1.2..2.5 |
| `/assets/models/dungeon/wall_window_open_scaffold.glb` | 4 x 4 x 1 | bottom, centre |  |

#### Wall connectors (corners, T, cross, ends, halves)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/wall_corner.glb` | 2.5 x 4 x 2.5 | bottom, x -2..0.5, z -0.5..2 | L-corner: legs go -X (to x=-2) and +Z (to z=2). See rotation table |
| `/assets/models/dungeon/wall_corner_gated.glb` | 2.5 x 4 x 2.5 | bottom, x -2..0.5, z -0.5..2 | L-corner with bars |
| `/assets/models/dungeon/wall_corner_scaffold.glb` | 2.5 x 4 x 2.5 | bottom, x -2..0.5, z -0.5..2 | L-corner with scaffolding |
| `/assets/models/dungeon/wall_corner_small.glb` | 1.5 x 4 x 1.5 | bottom, x -1..0.5, z -0.5..1 | small L: legs -X (to x=-1) and +Z (to z=1) - 2 m sub-grid |
| `/assets/models/dungeon/wall_crossing.glb` | 4 x 4 x 4 | bottom, centre | + junction, arms to +-X and +-Z (2 m each) |
| `/assets/models/dungeon/wall_endcap.glb` | 1.07 x 4 x 1 | bottom, x 0..1.07, z centred | short capped stub 1.07 m from pivot toward +X (finish a wall end at a gap) |
| `/assets/models/dungeon/wall_half.glb` | 2 x 4 x 1 | bottom, x 0..2, z centred | 2 m wall from pivot toward +X (x 0..2): 2 m sub-grid filler |
| `/assets/models/dungeon/wall_half_endcap.glb` | 2 x 4 x 1 | bottom, x -2..0, z centred | 2 m wall from pivot toward -X (x -2..0), finished end at pivot (dead end) |
| `/assets/models/dungeon/wall_half_endcap_sloped.glb` | 2 x 4 x 1 | bottom, x -2..0, z centred | as wall_half_endcap, top slopes 4.0 -> 0.5 m toward the end |
| `/assets/models/dungeon/wall_Tsplit.glb` | 4 x 4 x 2.5 | bottom, x centred, z -0.5..2 | T: straight wall along X (x -2..2) + stub to +Z (z 0..2) |
| `/assets/models/dungeon/wall_Tsplit_sloped.glb` | 4 x 4 x 2.5 | bottom, x centred, z -0.5..2 | T with sloped stub |

#### Doorways

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/wall_doorway.glb` | 4 x 4 x 1 | bottom, centre | opening 2.0 W x 2.75 H centred at x=0 (arched top). Child node `wall_doorway_door` (2.0 x 2.75 x 0.77 panel): hinge = node origin at local (-0.82, 0, 0) -> open with `door.rotation.y = +-PI/2` |
| `/assets/models/dungeon/wall_doorway_scaffold.glb` | 4 x 4 x 1 | bottom, centre | as wall_doorway with scaffolding; door child `wall_doorway_scaffold_door`, hinge local (-0.82,0,0) |
| `/assets/models/dungeon/wall_doorway_sides.glb` | 5 x 4 x 4 | bottom, centre | door wall ACROSS a 1-cell corridor: cross wall on z=0 (x -2.5..2.5, open 2.0x2.75 arch at x=0, no door panel) + side walls along Z at x=+-2 (z -2..2). Pivot on the corridor centre line |
| `/assets/models/dungeon/wall_doorway_Tsplit.glb` | 8 x 4 x 2.5 | bottom, x centred, z -0.5..2 | 8 m room wall (x -4..4) with open 2.0x2.75 doorway (no panel) at x=0 + corridor walls going +Z at x=+-2 (to z=2). Pivot = cell-edge midpoint; corridor leaves toward +Z |
| `/assets/models/dungeon/wall_open_scaffold.glb` | 4 x 4 x 1 | bottom, centre | big open arch ~3.5 W x 3.0 H, no door (passable) |

#### Stairs (rise 4 m = one wall height, 8 steps of 0.5 m)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/stairs.glb` | 5 x 5.1 x 4 | bottom, x centred, z 0..4 | TOP (y=4) at the pivot edge z=0, bottom at z=4 (descends toward +Z). Walkable width x -1.75..1.75, rails/posts at abs(x) 2..2.5 |
| `/assets/models/dungeon/stairs_narrow.glb` | 4 x 5.1 x 4 | bottom, x centred, z 0..4 | same profile, 4 m wide (walk ~3 m) |
| `/assets/models/dungeon/stairs_walled.glb` | 5 x 4 x 4 | bottom, x centred, z 0..4 | same profile with solid side walls to y=4 at abs(x)>=1.4 (walk width ~2.8 m) |
| `/assets/models/dungeon/stairs_wall_left.glb` | 4 x 5.1 x 5 | bottom, x centred, z -0.5..4.5 | stairs ALONG a wall: 4 m wall on z=0 + steps on +Z side (z 0.5..4) climbing toward -X (top y=4 at x=-2) |
| `/assets/models/dungeon/stairs_wall_right.glb` | 4 x 5.1 x 5 | bottom, x centred, z -0.5..4.5 | mirror: steps climb toward +X (top y=4 at x=+2) |
| `/assets/models/dungeon/stairs_wide.glb` | 7 x 5.1 x 4 | bottom, x centred, z 0..4 | same profile, 7 m wide |
| `/assets/models/dungeon/stairs_wood.glb` | 3.3 x 4.05 x 6 | bottom, x centred, z 0..6 | wooden, 6 m run, top (y=4.05) at z=0 |
| `/assets/models/dungeon/stairs_wood_decorated.glb` | 3.3 x 4.05 x 6 | bottom, x centred, z 0..6 | wooden with clutter, top at z=0 |

#### Pillars, columns, low barriers

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/barrier.glb` | 4 x 1.1 x 0.5 | bottom, centre | low wall / railing 1.1 m, centred |
| `/assets/models/dungeon/barrier_column.glb` | 4 x 1.4 x 0.7 | bottom, centre |  |
| `/assets/models/dungeon/barrier_colum_half.glb` | 2.35 x 1.4 x 0.7 | bottom, x -0.35..2, z centred | x -0.35..2 (post at pivot) |
| `/assets/models/dungeon/barrier_corner.glb` | 2.4 x 1.4 x 2.4 | bottom, x -2..0.4, z -0.4..2 | legs -X and +Z |
| `/assets/models/dungeon/barrier_half.glb` | 2 x 1.1 x 0.5 | bottom, x 0..2, z centred | 2 m from pivot to +X |
| `/assets/models/dungeon/column.glb` | 0.7 x 1.4 x 0.7 | bottom, centre | short 1.4 m column (barrier post) |
| `/assets/models/dungeon/pillar.glb` | 1.5 x 4 x 1.5 | bottom, centre | 4 m tall, fills full wall height |
| `/assets/models/dungeon/pillar_decorated.glb` | 2.23 x 4 x 1.71 | bottom, x centred, z -0.75..0.96 | 4 m pillar with banner/shield on +Z face |

#### Light sources (no emissive data - add PointLight in code)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/candle.glb` | 0.33 x 0.87 x 0.33 | bottom, centre |  |
| `/assets/models/dungeon/candle_lit.glb` | 0.33 x 1.05 x 0.33 | bottom, centre | flame top y=1.05 |
| `/assets/models/dungeon/candle_melted.glb` | 0.33 x 0.7 x 0.33 | bottom, centre |  |
| `/assets/models/dungeon/candle_thin.glb` | 0.19 x 0.87 x 0.19 | bottom, centre |  |
| `/assets/models/dungeon/candle_thin_lit.glb` | 0.19 x 1.05 x 0.19 | bottom, centre | flame top y=1.05 |
| `/assets/models/dungeon/candle_triple.glb` | 0.5 x 0.87 x 0.39 | bottom, x -0.17..0.33, z centred | unlit triple candle |
| `/assets/models/dungeon/shelf_small_candles.glb` | 1 x 0.99 x 0.5 | y -0.3..0.69, x centred, z 0..0.5 | wall shelf with candles, pivot at back edge (z 0..0.5) |
| `/assets/models/dungeon/torch.glb` | 0.55 x 1.04 x 0.55 | y -0.4..0.65, centre | unlit loose torch |
| `/assets/models/dungeon/torch_lit.glb` | 0.55 x 1.13 x 0.55 | y -0.4..0.73, centre | loose torch with flame (flame top y 0.73) |
| `/assets/models/dungeon/torch_mounted.glb` | 0.55 x 1.06 x 0.62 | y -0.38..0.68, x centred, z 0..0.62 | wall torch: bracket at z=0 -> put pivot ON the wall face (wall line + 0.5 m along normal), y ~2.5; flame ~local (0, 0.7, 0.3) |

#### Containers / loot

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/barrel_large.glb` | 1.8 x 2 x 1.8 | bottom, centre |  |
| `/assets/models/dungeon/barrel_large_decorated.glb` | 1.94 x 2.56 x 1.85 | bottom, centre |  |
| `/assets/models/dungeon/barrel_small.glb` | 1 x 1.02 x 1 | bottom, centre |  |
| `/assets/models/dungeon/barrel_small_stack.glb` | 1.85 x 1.77 x 1 | bottom, centre |  |
| `/assets/models/dungeon/box_large.glb` | 1.5 x 1.5 x 1.5 | bottom, centre |  |
| `/assets/models/dungeon/box_small.glb` | 1 x 1 x 1 | bottom, centre |  |
| `/assets/models/dungeon/box_small_decorated.glb` | 1.49 x 1.48 x 1.49 | bottom, x -0.61..0.88, z -0.63..0.85 |  |
| `/assets/models/dungeon/box_stacked.glb` | 3.48 x 3.31 x 3.63 | bottom, centre | crate stack 3.5 m |
| `/assets/models/dungeon/chest.glb` | 1.7 x 1.3 x 1.45 | bottom, centre | child `chest_lid`, hinge at local (0, 0.5, -0.565); open: `lid.rotation.x = -1.2` |
| `/assets/models/dungeon/chest_gold.glb` | 1.7 x 1.3 x 1.45 | bottom, centre | gold-filled; child `chest_gold_lid`, hinge (0, 0.5, -0.565) |
| `/assets/models/dungeon/crates_stacked.glb` | 2.09 x 2.14 x 2.25 | bottom, centre |  |
| `/assets/models/dungeon/keg.glb` | 1.8 x 2.05 x 2 | bottom, centre |  |
| `/assets/models/dungeon/keg_decorated.glb` | 3.52 x 2.05 x 2 | bottom, centre |  |
| `/assets/models/dungeon/trunk_large_A.glb` | 1.5 x 1 x 1.3 | bottom, centre |  |
| `/assets/models/dungeon/trunk_large_B.glb` | 1.5 x 1 x 1.3 | bottom, centre |  |
| `/assets/models/dungeon/trunk_large_C.glb` | 1.5 x 1 x 1.3 | bottom, centre |  |
| `/assets/models/dungeon/trunk_medium_A.glb` | 0.95 x 0.73 x 0.88 | bottom, centre |  |
| `/assets/models/dungeon/trunk_medium_B.glb` | 0.95 x 0.73 x 0.88 | bottom, centre |  |
| `/assets/models/dungeon/trunk_medium_C.glb` | 0.95 x 0.73 x 0.88 | bottom, centre |  |
| `/assets/models/dungeon/trunk_small_A.glb` | 0.68 x 0.48 x 0.58 | bottom, centre |  |
| `/assets/models/dungeon/trunk_small_B.glb` | 0.68 x 0.48 x 0.58 | bottom, centre |  |
| `/assets/models/dungeon/trunk_small_C.glb` | 0.68 x 0.48 x 0.58 | bottom, centre |  |

#### Furniture

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/bed_decorated.glb` | 2.61 x 1.7 x 3.06 | bottom, x -0.75..1.86, z centred |  |
| `/assets/models/dungeon/bed_floor.glb` | 1.5 x 0.56 x 3 | bottom, centre |  |
| `/assets/models/dungeon/bed_frame.glb` | 1.5 x 1.06 x 3 | bottom, centre |  |
| `/assets/models/dungeon/chair.glb` | 0.75 x 1.23 x 0.75 | bottom, centre |  |
| `/assets/models/dungeon/shelf_large.glb` | 2 x 0.45 x 0.5 | y -0.35..0.1, x centred, z 0..0.5 | wall shelf, pivot at back edge, extends +Z |
| `/assets/models/dungeon/shelf_small.glb` | 1 x 0.4 x 0.5 | y -0.3..0.1, x centred, z 0..0.5 | wall shelf, pivot at back edge, extends +Z |
| `/assets/models/dungeon/shelves.glb` | 2 x 1.95 x 0.5 | y 0.75..2.7, x centred, z 0.25..0.75 | free-standing shelf unit against wall (y 0.75..2.7, z 0.25..0.75) |
| `/assets/models/dungeon/stool.glb` | 0.75 x 0.5 x 0.75 | bottom, centre |  |
| `/assets/models/dungeon/table_long.glb` | 2 x 1 x 4 | bottom, centre |  |
| `/assets/models/dungeon/table_long_broken.glb` | 2.41 x 1.27 x 4.41 | bottom, x -1.39..1.02, z centred |  |
| `/assets/models/dungeon/table_long_decorated_A.glb` | 2.06 x 1.89 x 4 | bottom, centre |  |
| `/assets/models/dungeon/table_long_decorated_C.glb` | 2 x 2.77 x 4.03 | bottom, centre |  |
| `/assets/models/dungeon/table_long_tablecloth.glb` | 2 x 1 x 4 | bottom, centre |  |
| `/assets/models/dungeon/table_long_tablecloth_decorated_A.glb` | 2.06 x 1.89 x 4 | bottom, centre |  |
| `/assets/models/dungeon/table_medium.glb` | 2 x 1 x 2 | bottom, centre |  |
| `/assets/models/dungeon/table_medium_broken.glb` | 2.28 x 0.97 x 2.43 | bottom, x centred, z -0.96..1.47 |  |
| `/assets/models/dungeon/table_medium_decorated_A.glb` | 2 x 1.89 x 2 | bottom, centre |  |
| `/assets/models/dungeon/table_medium_tablecloth.glb` | 2 x 1 x 2 | bottom, centre |  |
| `/assets/models/dungeon/table_medium_tablecloth_decorated_B.glb` | 2 x 1.89 x 2 | bottom, centre |  |
| `/assets/models/dungeon/table_small.glb` | 1 x 1 x 1 | bottom, centre |  |
| `/assets/models/dungeon/table_small_decorated_A.glb` | 1.04 x 1.62 x 1.21 | bottom, centre |  |
| `/assets/models/dungeon/table_small_decorated_B.glb` | 1.01 x 2.16 x 1 | bottom, centre |  |

#### Banners (hang on a wall: same pivot as the wall, cloth sits on its +Z face)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/banner_{blue,brown,green,red,white,yellow}.glb` | 1.5 x 3.2 x 0.31 | y 0.53..3.73, x centred, z 0.38..0.69 |  |
| `/assets/models/dungeon/banner_patternA_{blue,brown,green,red,white,yellow}.glb` | 1.5 x 3.2 x 0.31 | y 0.53..3.73, x centred, z 0.38..0.69 |  |
| `/assets/models/dungeon/banner_patternB_{blue,brown,green,red,white,yellow}.glb` | 1.5 x 3.2 x 0.31 | y 0.53..3.73, x centred, z 0.38..0.69 |  |
| `/assets/models/dungeon/banner_patternC_{blue,brown,green,red,white,yellow}.glb` | 1.5 x 3.2 x 0.31 | y 0.53..3.73, x centred, z 0.38..0.69 |  |
| `/assets/models/dungeon/banner_shield_{blue,brown,green,red,white,yellow}.glb` | 2.23 x 3.2 x 0.37 | y 0.53..3.73, x centred, z 0.32..0.69 |  |
| `/assets/models/dungeon/banner_thin_{blue,brown,green,red,white,yellow}.glb` | 1.1 x 3.17 x 0.36 | y 0.56..3.73, x centred, z 0.35..0.72 |  |
| `/assets/models/dungeon/banner_triple_{blue,brown,green,red,white,yellow}.glb` | 3.7 x 3.2 x 0.36 | y 0.53..3.73, x centred, z 0.35..0.72 |  |

#### Decor / clutter

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/dungeon/bottle_A_{brown,green}.glb` | 0.37 x 0.89 x 0.37 | bottom, centre |  |
| `/assets/models/dungeon/bottle_A_labeled_{brown,green}.glb` | 0.37 x 0.89 x 0.37 | bottom, centre |  |
| `/assets/models/dungeon/bottle_B_{brown,green}.glb` | 0.55 x 0.89 x 0.55 | bottom, centre |  |
| `/assets/models/dungeon/bottle_C_{brown,green}.glb` | 0.74 x 0.91 x 0.74 | bottom, centre |  |
| `/assets/models/dungeon/coin.glb` | 0.36 x 0.13 x 0.36 | bottom, centre |  |
| `/assets/models/dungeon/coin_stack_large.glb` | 1.44 x 1.16 x 1.66 | bottom, centre |  |
| `/assets/models/dungeon/coin_stack_medium.glb` | 0.99 x 0.64 x 1.03 | bottom, centre |  |
| `/assets/models/dungeon/coin_stack_small.glb` | 0.96 x 0.48 x 0.9 | bottom, centre |  |
| `/assets/models/dungeon/key.glb` | 0.9 x 0.4 x 0.14 | y -0.2..0.2, x -0.2..0.7, z centred |  |
| `/assets/models/dungeon/keyring.glb` | 1.03 x 0.26 x 1.21 | bottom, x -0.45..0.58, z centred |  |
| `/assets/models/dungeon/keyring_hanging.glb` | 0.68 x 1.22 x 0.38 | top (hangs down), centre | hangs from y=0 |
| `/assets/models/dungeon/plate.glb` | 0.97 x 0.13 x 0.97 | bottom, centre |  |
| `/assets/models/dungeon/plate_food_A.glb` | 1.02 x 0.79 x 0.97 | bottom, centre |  |
| `/assets/models/dungeon/plate_food_B.glb` | 0.97 x 0.24 x 0.97 | bottom, centre |  |
| `/assets/models/dungeon/plate_small.glb` | 0.48 x 0.13 x 0.48 | bottom, centre |  |
| `/assets/models/dungeon/plate_stack.glb` | 1 x 0.56 x 1 | bottom, centre |  |
| `/assets/models/dungeon/rubble_half.glb` | 4 x 3.5 x 3 | bottom, x 0..4, z centred | rubble pile x 0..4 from pivot (blocks a corridor half) |
| `/assets/models/dungeon/rubble_large.glb` | 8.13 x 3.5 x 3.18 | bottom, centre | rubble pile 8 m wide (blocks a passage) |
| `/assets/models/dungeon/sword_shield.glb` | 2.23 x 1.67 x 0.34 | y -0.81..0.85, x centred, z -0.09..0.25 | wall trophy: shield centred, put on wall face |
| `/assets/models/dungeon/sword_shield_broken.glb` | 1.43 x 1.96 x 0.34 | y -0.79..1.17, x centred, z -0.09..0.25 |  |
| `/assets/models/dungeon/sword_shield_gold.glb` | 2.23 x 1.67 x 0.34 | y -0.81..0.85, x centred, z -0.09..0.25 |  |

### Graveyard & crypt (KayKit Halloween Bits) - `/assets/models/halloween/`


#### Ground tiles & paths

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/halloween/floor_dirt.glb` | 4 x 0.53 x 4 | top surface y=0.03, centre | 4x4 ground tile |
| `/assets/models/halloween/floor_dirt_grave.glb` | 4 x 1.53 x 4 | top surface y=0.03 (pit/base to y=-1.5), centre | 4x4 with dug grave pit (1.5 m deep) |
| `/assets/models/halloween/floor_dirt_small.glb` | 2 x 0.53 x 2 | top surface y=0.03, centre |  |
| `/assets/models/halloween/path_A.glb` | 1.9 x 0.1 x 1.88 | bottom, centre |  |
| `/assets/models/halloween/path_B.glb` | 1.89 x 0.1 x 1.86 | bottom, centre |  |
| `/assets/models/halloween/path_C.glb` | 1.85 x 0.1 x 1.86 | bottom, centre |  |
| `/assets/models/halloween/path_D.glb` | 1.66 x 0.1 x 1.71 | bottom, centre |  |

#### Buildings / arches / crypt

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/halloween/arch.glb` | 4.22 x 4.41 x 0.77 | bottom, centre | 4.2 m wide graveyard gateway arch (fits 4 m fence line) |
| `/assets/models/halloween/arch_gate.glb` | 4.22 x 4.41 x 0.77 | bottom, centre | arch with closed gate |
| `/assets/models/halloween/crypt.glb` | 6 x 8 x 8 | bottom, centre | mausoleum building 6x8 m footprint, 8 m tall |
| `/assets/models/halloween/pillar.glb` | 1 x 4.4 x 1 | bottom, centre | 4.4 m stone pillar |
| `/assets/models/halloween/shrine.glb` | 1.1 x 2.4 x 1.1 | bottom, centre |  |
| `/assets/models/halloween/shrine_candles.glb` | 1.1 x 1.79 x 1.1 | bottom, centre | candle shrine (light) |

#### Graves & markers

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/halloween/coffin.glb` | 2 x 1.32 x 3 | bottom, centre |  |
| `/assets/models/halloween/coffin_decorated.glb` | 2 x 0.9 x 3 | bottom, centre |  |
| `/assets/models/halloween/gravemarker_A.glb` | 0.81 x 1.2 x 0.28 | bottom, centre |  |
| `/assets/models/halloween/gravemarker_B.glb` | 0.8 x 1.18 x 0.41 | bottom, x centred, z -0.04..0.38 |  |
| `/assets/models/halloween/gravestone.glb` | 1.4 x 1.6 x 0.4 | bottom, centre |  |
| `/assets/models/halloween/grave_A.glb` | 2 x 2.13 x 1 | bottom, centre |  |
| `/assets/models/halloween/grave_A_destroyed.glb` | 2.08 x 2.11 x 1.14 | bottom, x centred, z -0.64..0.5 |  |
| `/assets/models/halloween/grave_B.glb` | 2 x 2.2 x 1 | bottom, centre |  |
| `/assets/models/halloween/plaque.glb` | 2 x 0.4 x 2 | bottom, centre |  |
| `/assets/models/halloween/plaque_candles.glb` | 2 x 1.13 x 2 | bottom, centre |  |

#### Fences & posts

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/halloween/fence.glb` | 4 x 2.2 x 0.5 | bottom, centre | 4 m segment: matches 4 m grid |
| `/assets/models/halloween/fence_broken.glb` | 4 x 2.2 x 0.5 | bottom, centre |  |
| `/assets/models/halloween/fence_gate.glb` | 4 x 3 x 0.5 | bottom, centre | 4 m gate segment |
| `/assets/models/halloween/fence_pillar.glb` | 0.5 x 2.2 x 0.5 | bottom, centre |  |
| `/assets/models/halloween/fence_pillar_broken.glb` | 0.5 x 1.5 x 0.5 | bottom, centre |  |
| `/assets/models/halloween/fence_seperate.glb` | 4 x 2 x 0.17 | bottom, centre |  |
| `/assets/models/halloween/fence_seperate_broken.glb` | 4 x 2 x 0.17 | bottom, centre |  |
| `/assets/models/halloween/post.glb` | 0.42 x 3.3 x 1.57 | bottom, x centred, z -0.22..1.35 |  |
| `/assets/models/halloween/post_lantern.glb` | 0.64 x 3.3 x 1.57 | bottom, x centred, z -0.22..1.35 | lamp post 3.3 m, arm toward +Z with lantern |
| `/assets/models/halloween/post_skull.glb` | 0.81 x 3.3 x 1.57 | bottom, x centred, z -0.22..1.35 | post with hanging skull, arm toward +Z |

#### Light sources

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/halloween/candle.glb` | 0.3 x 0.79 x 0.3 | bottom, centre |  |
| `/assets/models/halloween/candle_melted.glb` | 0.3 x 0.63 x 0.3 | bottom, centre |  |
| `/assets/models/halloween/candle_thin.glb` | 0.17 x 0.79 x 0.17 | bottom, centre |  |
| `/assets/models/halloween/candle_triple.glb` | 0.45 x 0.79 x 0.35 | bottom, x -0.15..0.3, z centred |  |
| `/assets/models/halloween/lantern_hanging.glb` | 0.64 x 1.41 x 0.64 | top (hangs down), centre | hangs from y=0 down to -1.31 |
| `/assets/models/halloween/lantern_standing.glb` | 0.64 x 0.93 x 0.64 | bottom, centre |  |
| `/assets/models/halloween/pumpkin_{orange,yellow}_jackolantern.glb` | 1.5 x 1.3 x 1.4 | bottom, centre |  |
| `/assets/models/halloween/skull_candle.glb` | 0.92 x 1.19 x 0.94 | bottom, centre |  |

#### Trees

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/halloween/tree_dead_large.glb` | 2.3 x 5.07 x 1.38 | y -0.27..4.79, x -1.32..0.98, z centred |  |
| `/assets/models/halloween/tree_dead_large_decorated.glb` | 2.3 x 5.42 x 1.61 | y -0.27..5.14, x -1.32..0.98, z centred |  |
| `/assets/models/halloween/tree_dead_medium.glb` | 1.81 x 4.19 x 0.47 | y -0.3..3.89, x -0.48..1.32, z centred |  |
| `/assets/models/halloween/tree_dead_small.glb` | 1.41 x 2.99 x 1.01 | y -0.3..2.69, x -1.2..0.21, z -0.81..0.21 |  |
| `/assets/models/halloween/tree_pine_{orange,yellow}_large.glb` | 4.76 x 7.47 x 4.16 | y -0.56..6.92, centre |  |
| `/assets/models/halloween/tree_pine_{orange,yellow}_medium.glb` | 3.33 x 5.87 x 3.12 | y -0.48..5.39, x centred, z -1.35..1.77 |  |
| `/assets/models/halloween/tree_pine_{orange,yellow}_small.glb` | 2.4 x 4.04 x 2.2 | y -0.4..3.65, centre |  |

#### Decor (bones, skulls, pumpkins, benches)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/halloween/bench.glb` | 2 x 0.5 x 0.75 | bottom, centre |  |
| `/assets/models/halloween/bench_decorated.glb` | 2 x 1.68 x 1.02 | bottom, centre |  |
| `/assets/models/halloween/bone_A.glb` | 0.71 x 0.28 x 0.2 | y -0.14..0.14, centre |  |
| `/assets/models/halloween/bone_B.glb` | 0.61 x 0.17 x 0.29 | y -0.09..0.09, centre |  |
| `/assets/models/halloween/bone_C.glb` | 1.11 x 0.28 x 0.2 | y -0.14..0.14, centre |  |
| `/assets/models/halloween/pumpkin_{orange,yellow}.glb` | 1 x 0.7 x 1 | bottom, centre |  |
| `/assets/models/halloween/pumpkin_{orange,yellow}_small.glb` | 0.6 x 0.55 x 0.6 | bottom, centre |  |
| `/assets/models/halloween/ribcage.glb` | 0.85 x 0.86 x 0.75 | y -0.39..0.47, centre |  |
| `/assets/models/halloween/skull.glb` | 0.92 x 0.9 x 0.91 | bottom, centre |  |

### Interior furniture (KayKit Furniture Bits) - `/assets/models/furniture/`


#### Beds

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/furniture/bed_double_A.glb` | 3.1 x 1 x 3 | bottom, centre |  |
| `/assets/models/furniture/bed_double_B.glb` | 3.1 x 1 x 3 | bottom, centre |  |
| `/assets/models/furniture/bed_single_A.glb` | 1.6 x 1 x 3 | bottom, centre |  |
| `/assets/models/furniture/bed_single_B.glb` | 1.6 x 1 x 3 | bottom, centre |  |

#### Seating

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/furniture/armchair.glb` | 1.8 x 1.22 x 1.6 | bottom, centre |  |
| `/assets/models/furniture/armchair_pillows.glb` | 1.8 x 1.22 x 1.6 | bottom, centre |  |
| `/assets/models/furniture/chair_A.glb` | 0.75 x 1.26 x 0.84 | bottom, centre |  |
| `/assets/models/furniture/chair_A_wood.glb` | 0.75 x 1.26 x 0.84 | bottom, centre |  |
| `/assets/models/furniture/chair_B.glb` | 0.75 x 1.26 x 0.84 | bottom, centre |  |
| `/assets/models/furniture/chair_B_wood.glb` | 0.75 x 1.26 x 0.84 | bottom, centre |  |
| `/assets/models/furniture/chair_C.glb` | 0.75 x 1.2 x 0.94 | bottom, x centred, z -0.56..0.38 |  |
| `/assets/models/furniture/chair_stool.glb` | 0.75 x 0.5 x 0.75 | bottom, centre |  |
| `/assets/models/furniture/chair_stool_wood.glb` | 0.75 x 0.5 x 0.75 | bottom, centre |  |
| `/assets/models/furniture/couch.glb` | 3 x 1.22 x 1.6 | bottom, centre |  |
| `/assets/models/furniture/couch_pillows.glb` | 3 x 1.22 x 1.6 | bottom, centre |  |

#### Tables

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/furniture/table_low.glb` | 2.4 x 0.5 x 1.5 | bottom, centre |  |
| `/assets/models/furniture/table_medium.glb` | 2 x 1 x 2 | bottom, centre |  |
| `/assets/models/furniture/table_medium_long.glb` | 3 x 1 x 2 | bottom, centre |  |
| `/assets/models/furniture/table_small.glb` | 1 x 1 x 1 | bottom, centre |  |

#### Storage / shelves (wall shelves: pivot at back edge, extend +Z)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/furniture/cabinet_medium.glb` | 2 x 1 x 1 | bottom, centre |  |
| `/assets/models/furniture/cabinet_medium_decorated.glb` | 2.04 x 1.83 x 1 | bottom, centre |  |
| `/assets/models/furniture/cabinet_small.glb` | 1 x 1 x 1 | bottom, centre |  |
| `/assets/models/furniture/cabinet_small_decorated.glb` | 1.05 x 1.62 x 1.1 | bottom, centre |  |
| `/assets/models/furniture/shelf_A_big.glb` | 2 x 0.4 x 0.5 | y -0.3..0.1, x centred, z 0..0.5 |  |
| `/assets/models/furniture/shelf_A_small.glb` | 1 x 0.4 x 0.5 | y -0.3..0.1, x centred, z 0..0.5 |  |
| `/assets/models/furniture/shelf_B_large.glb` | 2 x 0.4 x 0.5 | y -0.1..0.3, x centred, z 0..0.5 |  |
| `/assets/models/furniture/shelf_B_large_decorated.glb` | 2 x 0.82 x 0.5 | y -0.1..0.72, x centred, z 0..0.5 |  |
| `/assets/models/furniture/shelf_B_small.glb` | 1 x 0.4 x 0.5 | y -0.1..0.3, x centred, z 0..0.5 |  |
| `/assets/models/furniture/shelf_B_small_decorated.glb` | 1 x 1.01 x 0.57 | y -0.1..0.91, x centred, z 0..0.57 |  |

#### Lights

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/furniture/lamp_standing.glb` | 1 x 2.52 x 1 | bottom, centre |  |
| `/assets/models/furniture/lamp_table.glb` | 1 x 1.02 x 1 | bottom, centre |  |

#### Rugs

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/furniture/rug_oval_A.glb` | 3 x 0.1 x 2 | bottom, centre |  |
| `/assets/models/furniture/rug_oval_B.glb` | 3 x 0.1 x 2 | bottom, centre |  |
| `/assets/models/furniture/rug_rectangle_A.glb` | 3 x 0.1 x 2 | bottom, centre |  |
| `/assets/models/furniture/rug_rectangle_B.glb` | 3 x 0.1 x 2 | bottom, centre |  |
| `/assets/models/furniture/rug_rectangle_stripes_A.glb` | 3 x 0.1 x 2 | bottom, centre |  |
| `/assets/models/furniture/rug_rectangle_stripes_B.glb` | 3 x 0.1 x 2 | bottom, centre |  |

#### Wall decor (picture frames: pivot at back, extend +Z)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/furniture/pictureframe_large_A.glb` | 1.01 x 1.2 x 0.2 | y -0.6..0.6, x centred, z 0..0.2 |  |
| `/assets/models/furniture/pictureframe_large_B.glb` | 2 x 1.2 x 0.2 | y -0.6..0.6, x centred, z 0..0.2 |  |
| `/assets/models/furniture/pictureframe_medium.glb` | 0.7 x 0.9 x 0.2 | y -0.45..0.45, x centred, z 0..0.2 |  |
| `/assets/models/furniture/pictureframe_small_A.glb` | 0.5 x 0.6 x 0.2 | y -0.3..0.3, x centred, z 0..0.2 |  |
| `/assets/models/furniture/pictureframe_small_B.glb` | 0.7 x 0.44 x 0.2 | y -0.22..0.22, x centred, z 0..0.2 |  |
| `/assets/models/furniture/pictureframe_small_C.glb` | 0.5 x 0.5 x 0.2 | y -0.25..0.25, x centred, z 0..0.2 |  |
| `/assets/models/furniture/pictureframe_standing_A.glb` | 0.5 x 0.62 x 0.38 | bottom, centre |  |
| `/assets/models/furniture/pictureframe_standing_B.glb` | 0.7 x 0.47 x 0.36 | bottom, centre |  |

#### Small decor

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/furniture/book_set.glb` | 0.78 x 0.5 x 0.36 | y -0.25..0.25, centre |  |
| `/assets/models/furniture/book_single.glb` | 0.26 x 0.5 x 0.36 | y -0.25..0.25, centre |  |
| `/assets/models/furniture/cactus_medium_A.glb` | 0.88 x 0.83 x 0.84 | bottom, centre |  |
| `/assets/models/furniture/cactus_medium_B.glb` | 0.88 x 0.83 x 0.84 | bottom, centre |  |
| `/assets/models/furniture/cactus_small_A.glb` | 0.5 x 0.55 x 0.5 | bottom, centre |  |
| `/assets/models/furniture/cactus_small_B.glb` | 0.5 x 0.55 x 0.5 | bottom, centre |  |
| `/assets/models/furniture/pillow_A.glb` | 0.65 x 0.2 x 0.5 | y -0.1..0.1, centre |  |
| `/assets/models/furniture/pillow_B.glb` | 0.65 x 0.2 x 0.5 | y -0.1..0.1, centre |  |

### Hub town (KayKit Medieval Hexagon Pack) - `/assets/models/town/` (tabletop scale, see scale note)


#### Faction buildings (each exists in blue/green/red/yellow: `/assets/models/town/buildings/<colour>/building_<x>_<colour>.glb`, sizes identical)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/town/buildings/blue/building_archeryrange_blue.glb` | 1.67 x 1.79 x 1.55 | bottom, x centred, z -0.87..0.68 |  |
| `/assets/models/town/buildings/blue/building_barracks_blue.glb` | 1.44 x 1.64 x 1.57 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_blacksmith_blue.glb` | 1.29 x 0.98 x 1.25 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_castle_blue.glb` | 1.98 x 3.98 x 2.26 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_church_blue.glb` | 1.03 x 1.65 x 1.16 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_home_A_blue.glb` | 0.79 x 0.93 x 0.85 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_home_B_blue.glb` | 0.88 x 1.28 x 1.1 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_lumbermill_blue.glb` | 1.37 x 1.71 x 1.19 | bottom, x centred, z -0.46..0.73 |  |
| `/assets/models/town/buildings/blue/building_market_blue.glb` | 1.8 x 0.98 x 1.32 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_mine_blue.glb` | 1.61 x 1.14 x 1.92 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_tavern_blue.glb` | 1.17 x 1.4 x 1.33 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_tower_A_blue.glb` | 0.99 x 2.19 x 1.15 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_tower_base_blue.glb` | 0.93 x 1.5 x 1.11 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_tower_B_blue.glb` | 1.2 x 2.48 x 1.38 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_tower_catapult_blue.glb` | 0.93 x 1.96 x 1.3 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_watermill_blue.glb` | 1.05 x 1.57 x 1.24 | y -0.35..1.22, x centred, z -0.37..0.87 |  |
| `/assets/models/town/buildings/blue/building_well_blue.glb` | 0.65 x 0.83 x 0.75 | bottom, centre |  |
| `/assets/models/town/buildings/blue/building_windmill_blue.glb` | 1.13 x 1.46 x 0.82 | bottom, centre |  |

#### Neutral buildings, walls, fences, bridges

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/town/buildings/neutral/building_bridge_A.glb` | 1.33 x 1.25 x 1.92 | y -1..0.25, centre |  |
| `/assets/models/town/buildings/neutral/building_bridge_B.glb` | 1.33 x 1.25 x 1.92 | y -1..0.25, centre |  |
| `/assets/models/town/buildings/neutral/building_destroyed.glb` | 1.54 x 0.99 x 1.31 | bottom, centre |  |
| `/assets/models/town/buildings/neutral/building_dirt.glb` | 1.79 x 0.09 x 2.01 | bottom, centre |  |
| `/assets/models/town/buildings/neutral/building_grain.glb` | 1.87 x 0.39 x 2.09 | bottom, centre |  |
| `/assets/models/town/buildings/neutral/building_scaffolding.glb` | 1.9 x 1.3 x 2.11 | bottom, centre |  |
| `/assets/models/town/buildings/neutral/building_stage_A.glb` | 1.05 x 0.29 x 0.88 | bottom, x centred, z -0.34..0.53 |  |
| `/assets/models/town/buildings/neutral/building_stage_B.glb` | 1.02 x 0.64 x 1.13 | bottom, centre |  |
| `/assets/models/town/buildings/neutral/building_stage_C.glb` | 1.16 x 0.99 x 1.13 | bottom, x -0.5..0.66, z centred |  |
| `/assets/models/town/buildings/neutral/fence_stone_straight.glb` | 0.2 x 0.27 x 1.16 | bottom, x -1.1..-0.9, z centred |  |
| `/assets/models/town/buildings/neutral/fence_stone_straight_gate.glb` | 0.2 x 0.3 x 1.16 | bottom, x -1.1..-0.9, z centred |  |
| `/assets/models/town/buildings/neutral/fence_wood_straight.glb` | 0.1 x 0.55 x 1.16 | bottom, x -1.05..-0.95, z centred |  |
| `/assets/models/town/buildings/neutral/fence_wood_straight_gate.glb` | 0.14 x 0.65 x 1.16 | bottom, x -1.07..-0.93, z centred |  |
| `/assets/models/town/buildings/neutral/projectile_catapult.glb` | 0.24 x 0.28 x 0.25 | y -0.14..0.14, centre |  |
| `/assets/models/town/buildings/neutral/wall_corner_A_gate.glb` | 1.76 x 1.42 x 1.53 | bottom, x -1..0.76, z -1.07..0.47 |  |
| `/assets/models/town/buildings/neutral/wall_corner_A_inside.glb` | 1.85 x 1.1 x 1.42 | bottom, x centred, z -1.02..0.4 |  |
| `/assets/models/town/buildings/neutral/wall_corner_A_outside.glb` | 1.76 x 1.1 x 1.43 | bottom, x -1..0.76, z -1.07..0.37 |  |
| `/assets/models/town/buildings/neutral/wall_corner_B_inside.glb` | 0.96 x 1.1 x 1.47 | bottom, x -1..-0.04, z -1.07..0.4 |  |
| `/assets/models/town/buildings/neutral/wall_corner_B_outside.glb` | 0.96 x 1.1 x 1.35 | bottom, x -1..-0.04, z -1.02..0.33 |  |
| `/assets/models/town/buildings/neutral/wall_straight.glb` | 2 x 1.1 x 0.8 | bottom, centre |  |
| `/assets/models/town/buildings/neutral/wall_straight_gate.glb` | 2 x 1.41 x 0.9 | bottom, centre |  |

#### Nature (trees, rocks, hills, mountains, clouds, water plants)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/town/decoration/nature/cloud_big.glb` | 3.61 x 1.95 x 2.24 | y -0.88..1.06, centre |  |
| `/assets/models/town/decoration/nature/cloud_small.glb` | 2.34 x 1.84 x 1.79 | y -0.91..0.93, centre |  |
| `/assets/models/town/decoration/nature/hills_A.glb` | 1.75 x 0.79 x 1.74 | bottom, centre |  |
| `/assets/models/town/decoration/nature/hills_A_trees.glb` | 1.75 x 1.33 x 1.74 | bottom, centre |  |
| `/assets/models/town/decoration/nature/hills_B.glb` | 1.47 x 0.37 x 1.62 | bottom, centre |  |
| `/assets/models/town/decoration/nature/hills_B_trees.glb` | 1.47 x 1.37 x 1.62 | bottom, centre |  |
| `/assets/models/town/decoration/nature/hills_C.glb` | 1.53 x 0.56 x 1.47 | bottom, x centred, z -0.55..0.92 |  |
| `/assets/models/town/decoration/nature/hills_C_trees.glb` | 1.7 x 1.29 x 1.9 | bottom, centre |  |
| `/assets/models/town/decoration/nature/hill_single_A.glb` | 1.11 x 0.31 x 0.81 | bottom, centre |  |
| `/assets/models/town/decoration/nature/hill_single_B.glb` | 0.99 x 0.42 x 1.36 | bottom, x centred, z -0.77..0.59 |  |
| `/assets/models/town/decoration/nature/hill_single_C.glb` | 1.02 x 0.59 x 1.32 | bottom, centre |  |
| `/assets/models/town/decoration/nature/mountain_A.glb` | 1.8 x 1.43 x 1.88 | bottom, centre |  |
| `/assets/models/town/decoration/nature/mountain_A_grass.glb` | 1.8 x 1.5 x 1.88 | bottom, centre |  |
| `/assets/models/town/decoration/nature/mountain_A_grass_trees.glb` | 1.85 x 2.18 x 1.88 | bottom, centre |  |
| `/assets/models/town/decoration/nature/mountain_B.glb` | 1.8 x 1.77 x 1.88 | bottom, centre |  |
| `/assets/models/town/decoration/nature/mountain_B_grass.glb` | 1.8 x 1.84 x 1.88 | bottom, centre |  |
| `/assets/models/town/decoration/nature/mountain_B_grass_trees.glb` | 1.8 x 2.5 x 1.88 | bottom, centre |  |
| `/assets/models/town/decoration/nature/mountain_C.glb` | 1.76 x 1.51 x 2.02 | bottom, centre |  |
| `/assets/models/town/decoration/nature/mountain_C_grass.glb` | 1.76 x 1.55 x 2.02 | bottom, centre |  |
| `/assets/models/town/decoration/nature/mountain_C_grass_trees.glb` | 1.76 x 2.11 x 2.02 | bottom, centre |  |
| `/assets/models/town/decoration/nature/rock_single_A.glb` | 0.3 x 0.07 x 0.28 | bottom, centre |  |
| `/assets/models/town/decoration/nature/rock_single_B.glb` | 0.29 x 0.14 x 0.25 | bottom, centre |  |
| `/assets/models/town/decoration/nature/rock_single_C.glb` | 0.34 x 0.2 x 0.34 | bottom, centre |  |
| `/assets/models/town/decoration/nature/rock_single_D.glb` | 0.29 x 0.16 x 0.25 | bottom, centre |  |
| `/assets/models/town/decoration/nature/rock_single_E.glb` | 0.49 x 0.2 x 0.35 | bottom, centre |  |
| `/assets/models/town/decoration/nature/trees_A_cut.glb` | 1.66 x 0.21 x 1.69 | bottom, centre |  |
| `/assets/models/town/decoration/nature/trees_A_large.glb` | 1.95 x 0.93 x 1.97 | bottom, centre |  |
| `/assets/models/town/decoration/nature/trees_A_medium.glb` | 1.75 x 1.29 x 1.81 | bottom, centre |  |
| `/assets/models/town/decoration/nature/trees_A_small.glb` | 1.43 x 1.11 x 1.44 | bottom, centre |  |
| `/assets/models/town/decoration/nature/trees_B_cut.glb` | 1.4 x 0.17 x 1.46 | bottom, centre |  |
| `/assets/models/town/decoration/nature/trees_B_large.glb` | 1.85 x 1.18 x 1.93 | bottom, centre |  |
| `/assets/models/town/decoration/nature/trees_B_medium.glb` | 1.86 x 1.17 x 1.83 | bottom, centre |  |
| `/assets/models/town/decoration/nature/trees_B_small.glb` | 1.33 x 0.92 x 1.14 | bottom, x centred, z -0.5..0.64 |  |
| `/assets/models/town/decoration/nature/tree_single_A.glb` | 0.57 x 1.2 x 0.55 | y -0.1..1.09, centre |  |
| `/assets/models/town/decoration/nature/tree_single_A_cut.glb` | 0.17 x 0.33 x 0.16 | y -0.1..0.23, centre |  |
| `/assets/models/town/decoration/nature/tree_single_B.glb` | 0.69 x 1.21 x 0.72 | y -0.1..1.11, centre |  |
| `/assets/models/town/decoration/nature/tree_single_B_cut.glb` | 0.18 x 0.24 x 0.19 | y -0.1..0.14, centre |  |
| `/assets/models/town/decoration/nature/waterlily_A.glb` | 0.14 x 0.02 x 0.14 | bottom, centre |  |
| `/assets/models/town/decoration/nature/waterlily_B.glb` | 0.21 x 0.02 x 0.21 | bottom, centre |  |
| `/assets/models/town/decoration/nature/waterplant_A.glb` | 0.2 x 0.13 x 0.22 | bottom, centre |  |
| `/assets/models/town/decoration/nature/waterplant_B.glb` | 0.16 x 0.25 x 0.1 | bottom, centre |  |
| `/assets/models/town/decoration/nature/waterplant_C.glb` | 0.2 x 0.25 x 0.22 | bottom, centre |  |

#### Props

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/town/decoration/props/barrel.glb` | 0.2 x 0.21 x 0.2 | bottom, centre |  |
| `/assets/models/town/decoration/props/bucket_arrows.glb` | 0.14 x 0.23 x 0.14 | bottom, centre |  |
| `/assets/models/town/decoration/props/bucket_empty.glb` | 0.14 x 0.13 x 0.14 | bottom, centre |  |
| `/assets/models/town/decoration/props/bucket_water.glb` | 0.14 x 0.1 x 0.14 | bottom, centre |  |
| `/assets/models/town/decoration/props/crate_A_big.glb` | 0.21 x 0.21 x 0.21 | bottom, centre |  |
| `/assets/models/town/decoration/props/crate_A_small.glb` | 0.14 x 0.14 x 0.14 | bottom, centre |  |
| `/assets/models/town/decoration/props/crate_B_big.glb` | 0.21 x 0.21 x 0.21 | bottom, centre |  |
| `/assets/models/town/decoration/props/crate_B_small.glb` | 0.14 x 0.14 x 0.14 | bottom, centre |  |
| `/assets/models/town/decoration/props/crate_long_A.glb` | 0.4 x 0.15 x 0.2 | bottom, centre |  |
| `/assets/models/town/decoration/props/crate_long_B.glb` | 0.4 x 0.15 x 0.2 | bottom, centre |  |
| `/assets/models/town/decoration/props/crate_long_C.glb` | 0.4 x 0.2 x 0.2 | bottom, centre |  |
| `/assets/models/town/decoration/props/crate_long_empty.glb` | 0.4 x 0.15 x 0.2 | bottom, centre |  |
| `/assets/models/town/decoration/props/crate_open.glb` | 0.33 x 0.21 x 0.2 | bottom, x -0.1..0.23, z centred |  |
| `/assets/models/town/decoration/props/flag_{blue,green,red,yellow}.glb` | 0.06 x 0.28 x 0.26 | bottom, x centred, z -0.24..0.02 |  |
| `/assets/models/town/decoration/props/ladder.glb` | 0.25 x 0.77 x 0.05 | bottom, centre |  |
| `/assets/models/town/decoration/props/pallet.glb` | 0.3 x 0.08 x 0.3 | bottom, centre |  |
| `/assets/models/town/decoration/props/resource_lumber.glb` | 0.69 x 0.21 x 0.33 | bottom, centre |  |
| `/assets/models/town/decoration/props/resource_stone.glb` | 0.42 x 0.28 x 0.36 | bottom, centre |  |
| `/assets/models/town/decoration/props/sack.glb` | 0.11 x 0.07 x 0.16 | bottom, centre |  |
| `/assets/models/town/decoration/props/target.glb` | 0.24 x 0.3 x 0.14 | bottom, centre |  |
| `/assets/models/town/decoration/props/tent.glb` | 0.52 x 0.52 x 0.52 | bottom, centre |  |
| `/assets/models/town/decoration/props/weaponrack.glb` | 0.2 x 0.24 x 0.13 | bottom, centre |  |
| `/assets/models/town/decoration/props/wheelbarrow.glb` | 0.24 x 0.19 x 0.51 | bottom, centre |  |

#### Hex ground tiles (pointy-top hex, 2.0 flat-to-flat on X, 2.31 on Z; top at y=0)

| URL | W x H x D (m) | pivot / bounds | notes |
|---|---|---|---|
| `/assets/models/town/tiles/base/hex_grass.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/base/hex_grass_bottom.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/base/hex_grass_sloped_high.glb` | 2 x 2 x 2.31 | y -1..1, centre |  |
| `/assets/models/town/tiles/base/hex_grass_sloped_low.glb` | 2 x 1.5 x 2.31 | y -1..0.5, centre |  |
| `/assets/models/town/tiles/base/hex_water.glb` | 2 x 0.8 x 2.31 | top surface y=-0.2 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_A.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_A_sloped_high.glb` | 2 x 2 x 2.31 | y -1..1, centre |  |
| `/assets/models/town/tiles/roads/hex_road_A_sloped_low.glb` | 2 x 1.5 x 2.31 | y -1..0.5, centre |  |
| `/assets/models/town/tiles/roads/hex_road_B.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_C.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_D.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_E.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_F.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_G.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_H.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_I.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_J.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_K.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_L.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |
| `/assets/models/town/tiles/roads/hex_road_M.glb` | 2 x 1 x 2.31 | top surface y=0 (pit/base to y=-1), centre |  |

### Kenney kits (native kit units; multiply by the scale factor from section 1)

All Kenney models: pivot at bottom centre of a 1x1 (fantasy-town/castle/nature) or 0.5x0.5 (survival) cell unless the size shows an edge piece. Full bounds for each file are in environment.json.

### Kenney fantasy-town-kit - `/assets/models/kenney/fantasy-town-kit/<name>.glb` (167 models, sizes in kit units)

- **balcony**: `balcony-wall-fence` 0.1 x 1 x 1; `balcony-wall` 0.1 x 1 x 1
- **banner**: `banner-green` 0.05 x 0.84 x 0.5; `banner-red` 0.05 x 0.84 x 0.5
- **blade**: `blade` 0.11 x 2 x 0.43
- **cart**: `cart-high` 0.89 x 0.86 x 1.39; `cart` 0.89 x 0.54 x 1.34
- **chimney**: `chimney-base` 0.34 x 1 x 0.52; `chimney-top` 0.25 x 0.63 x 0.34; `chimney` 0.21 x 1 x 0.34
- **fence**: `fence-broken` 0.26 x 0.38 x 1; `fence-curved` 1 x 0.38 x 1; `fence-gate` 0.07 x 0.38 x 1; `fence` 0.07 x 0.38 x 1
- **fountain**: `fountain-center` 1 x 0.14 x 1; `fountain-corner-inner-square` 1 x 0.28 x 1; `fountain-corner-inner` 1 x 0.28 x 1; `fountain-corner` 1 x 0.28 x 1; `fountain-curved` 1 x 0.28 x 1; `fountain-edge` 1 x 0.28 x 1; `fountain-round-detail` 2 x 0.48 x 2; `fountain-round` 2 x 0.28 x 2; `fountain-square-detail` 2 x 0.48 x 2; `fountain-square` 2 x 0.46 x 2
- **hedge**: `hedge-curved` 1 x 0.25 x 1; `hedge-gate` 0.25 x 0.25 x 1; `hedge-large-curved` 1 x 0.6 x 1; `hedge-large-gate` 0.4 x 0.6 x 1; `hedge-large` 0.4 x 0.6 x 1; `hedge` 0.25 x 0.25 x 1
- **lantern**: `lantern` 0.22 x 1.56 x 0.22
- **overhang**: `overhang` 0.28 x 0.33 x 1
- **pillar**: `pillar-stone` 0.16 x 1 x 0.16; `pillar-wood` 0.16 x 1 x 0.16
- **planks**: `planks-half` 0.5 x 0.06 x 1; `planks-opening` 1 x 0.06 x 1; `planks` 1 x 0.06 x 1
- **poles**: `poles-horizontal` 0.1 x 1 x 1; `poles` 0.1 x 1 x 1
- **road**: `road-bend` 3 x 0.05 x 3; `road-corner-inner` 1 x 0.05 x 1; `road-corner` 1 x 0.05 x 1; `road-curb-end` 1 x 0.05 x 1; `road-curb` 1 x 0.05 x 1; `road-edge-slope` 1 x 0.25 x 1; `road-edge` 1 x 0.05 x 1; `road-slope` 1 x 0.23 x 1; `road` 1 x 0.03 x 1
- **rock**: `rock-large` 1.67 x 1.16 x 1.55; `rock-small` 1 x 1.02 x 1.33; `rock-wide` 1.09 x 1.02 x 1.57
- **roof**: `roof-corner-inner` 1 x 0.63 x 1; `roof-corner-round` 1.07 x 0.65 x 1.07; `roof-corner` 1.07 x 0.65 x 1.07; `roof-flat` 1 x 0.13 x 1; `roof-gable-detail` 1.1 x 0.68 x 1.21; `roof-gable-end` 1.08 x 0.57 x 1.07; `roof-gable-top` 1 x 0.38 x 1; `roof-gable` 1.1 x 0.57 x 1.07; `roof-high-corner-round` 1.07 x 1.18 x 1.07; `roof-high-corner` 1.07 x 1.18 x 1.07; `roof-high-cornerinner` 1 x 1.14 x 1; `roof-high-flat` 1 x 0.14 x 1; `roof-high-gable-detail` 1.1 x 1.31 x 1.27; `roof-high-gable-end` 1.12 x 1.16 x 1.13; `roof-high-gable-top` 1 x 0.64 x 1; `roof-high-gable` 1.1 x 1.16 x 1.13; `roof-high-left` 1.14 x 1.26 x 1; `roof-high-point` 1.1 x 1 x 1.1; `roof-high-right` 1.14 x 1.26 x 1; `roof-high-window` 1.07 x 1.18 x 1; `roof-high` 1.07 x 1.18 x 1; `roof-left` 1.13 x 0.72 x 1; `roof-point` 1.1 x 0.5 x 1.1; `roof-right` 1.13 x 0.72 x 1; `roof-window` 1.07 x 0.65 x 1; `roof` 1.07 x 0.65 x 1
- **stairs**: `stairs-full-corner-inner` 1 x 0.5 x 1; `stairs-full-corner-outer` 1.02 x 0.5 x 1.02; `stairs-full` 1.02 x 0.5 x 1; `stairs-stone-corner` 1.02 x 1 x 1; `stairs-stone-handrail` 1.02 x 1.45 x 0.5; `stairs-stone-round` 0.86 x 1 x 0.49; `stairs-stone` 1.02 x 1 x 0.5; `stairs-wide-stone-handrail` 1.02 x 1.45 x 1; `stairs-wide-stone` 1.02 x 1 x 1; `stairs-wide-wood-handrail` 1.02 x 1.45 x 1; `stairs-wide-wood` 1.02 x 1 x 1; `stairs-wood-handrail` 1.02 x 1.45 x 0.5; `stairs-wood` 1.02 x 1 x 0.5
- **stall**: `stall-bench` 0.26 x 0.23 x 0.94; `stall-green` 1 x 1.24 x 1; `stall-red` 1 x 1.24 x 1; `stall-stool` 0.26 x 0.23 x 0.26; `stall` 0.65 x 0.37 x 1
- **tree**: `tree-crooked` 1.02 x 2.41 x 1.02; `tree-high-crooked` 1.02 x 2.97 x 1.02; `tree-high-round` 1.02 x 2.75 x 1.02; `tree-high` 1.02 x 2.97 x 1.02; `tree` 1.02 x 2.41 x 1.02
- **wall**: `wall-arch-top-detail` 0.16 x 1 x 1; `wall-arch-top` 0.1 x 1 x 1; `wall-arch` 0.1 x 1 x 0.3; `wall-block-half` 1 x 0.5 x 1; `wall-block` 1 x 1 x 1; `wall-broken` 0.12 x 1 x 1; `wall-corner-detail` 0.16 x 1 x 0.16; `wall-corner-diagonal-half` 0.55 x 1 x 0.97; `wall-corner-diagonal` 1 x 1 x 1; `wall-corner-edge` 1 x 1 x 1; `wall-corner` 1 x 1 x 1; `wall-curved` 1 x 1 x 1; `wall-detail-cross` 0.1 x 1 x 1; `wall-detail-diagonal` 0.1 x 1 x 1; `wall-detail-horizontal` 0.1 x 1 x 1; `wall-diagonal` 1 x 1 x 1; `wall-door` 0.1 x 1 x 1; `wall-doorway-base` 0.1 x 1 x 1; `wall-doorway-round` 0.1 x 1 x 1; `wall-doorway-square-wide-curved` 0.1 x 1 x 1; `wall-doorway-square-wide` 0.1 x 1 x 1; `wall-doorway-square` 0.1 x 1 x 1; `wall-half` 0.1 x 0.5 x 1; `wall-rounded` 1 x 1 x 1; `wall-side` 0.1 x 1 x 0.26; `wall-slope` 0.1 x 1 x 1; `wall-window-glass` 0.1 x 1 x 1; `wall-window-round` 0.1 x 1 x 1; `wall-window-shutters` 0.17 x 1 x 1; `wall-window-small` 0.1 x 1 x 1; `wall-window-stone` 0.15 x 1 x 1; `wall-wood-arch-top-detail` 0.16 x 1 x 1; `wall-wood-arch-top` 0.1 x 1 x 1; `wall-wood-arch` 0.1 x 1 x 0.3; `wall-wood-block-half` 1 x 0.5 x 1; `wall-wood-block` 1 x 1 x 1; `wall-wood-broken` 0.11 x 1 x 1; `wall-wood-corner-diagonal-half` 0.55 x 1 x 0.97; `wall-wood-corner-diagonal` 1 x 1 x 1; `wall-wood-corner-edge` 1 x 1 x 1; `wall-wood-corner` 1 x 1 x 1; `wall-wood-curved` 1 x 1 x 1; `wall-wood-detail-cross` 0.1 x 1 x 1; `wall-wood-detail-diagonal` 0.1 x 1 x 1; `wall-wood-detail-horizontal` 0.1 x 1 x 1; `wall-wood-diagonal` 1 x 1 x 1; `wall-wood-door` 0.1 x 1 x 1; `wall-wood-doorway-base` 0.1 x 1 x 1; `wall-wood-doorway-round` 0.1 x 1 x 1; `wall-wood-doorway-square-wide-curved` 0.1 x 1 x 1; `wall-wood-doorway-square-wide` 0.1 x 1 x 1; `wall-wood-doorway-square` 0.1 x 1 x 1; `wall-wood-half` 0.1 x 0.5 x 1; `wall-wood-rounded` 1 x 1 x 1; `wall-wood-side` 0.1 x 1 x 0.26; `wall-wood-slope` 0.1 x 1 x 1; `wall-wood-window-glass` 0.1 x 1 x 1; `wall-wood-window-round` 0.2 x 1 x 1; `wall-wood-window-shutters` 0.1 x 1 x 1; `wall-wood-window-small` 0.2 x 1 x 1; `wall-wood-window-stone` 0.15 x 1 x 1; `wall-wood` 0.1 x 1 x 1; `wall` 0.1 x 1 x 1
- **watermill**: `watermill-wide` 1.05 x 1.8 x 1.8; `watermill` 0.85 x 1.8 x 1.8
- **wheel**: `wheel` 0.24 x 0.48 x 0.47
- **windmill**: `windmill` 0.47 x 3.11 x 3.11

### Kenney castle-kit - `/assets/models/kenney/castle-kit/<name>.glb` (76 models, sizes in kit units)

- **bridge**: `bridge-draw` 1 x 0.1 x 0.83; `bridge-straight-pillar` 0.93 x 1.18 x 0.93; `bridge-straight` 0.93 x 1.18 x 0.93
- **door**: `door` 0.15 x 0.6 x 0.36
- **flag**: `flag-banner-long` 0.04 x 2.17 x 0.63; `flag-banner-short` 0.04 x 0.78 x 0.63; `flag-pennant` 0.11 x 0.87 x 0.57; `flag-wide` 0.11 x 0.87 x 0.55; `flag` 0.11 x 0.87 x 0.43
- **gate**: `gate` 0.15 x 0.91 x 0.66
- **ground**: `ground-hills` 1 x 0.29 x 1; `ground` 1 x 0 x 1
- **metal**: `metal-gate` 0.07 x 0.73 x 0.69
- **rocks**: `rocks-large` 1.2 x 0.5 x 1.35; `rocks-small` 1.03 x 0.5 x 1.1
- **siege**: `siege-ballista-demolished` 1.75 x 0.51 x 1.55; `siege-ballista` 1.63 x 0.91 x 1.2; `siege-catapult-demolished` 1.68 x 0.32 x 1.67; `siege-catapult` 1.74 x 1.33 x 1.21; `siege-ram-demolished` 2.08 x 0.72 x 1.65; `siege-ram` 2.09 x 1.18 x 1; `siege-tower-demolished` 2.17 x 2.1 x 1.85; `siege-tower` 1.97 x 2.68 x 1.21; `siege-trebuchet-demolished` 1.94 x 0.31 x 2.1; `siege-trebuchet` 1.85 x 1.96 x 1.26
- **stairs**: `stairs-stone-square` 0.23 x 0.68 x 0.82; `stairs-stone` 0.23 x 0.68 x 0.82
- **tower**: `tower-base` 1 x 1.31 x 1; `tower-hexagon-base` 0.9 x 1.31 x 0.78; `tower-hexagon-mid` 0.95 x 0.46 x 0.82; `tower-hexagon-roof-secondary` 0.98 x 0.75 x 0.85; `tower-hexagon-roof` 0.98 x 0.83 x 0.85; `tower-hexagon-top-wood` 0.86 x 0.46 x 0.75; `tower-hexagon-top` 0.86 x 0.13 x 0.75; `tower-slant-roof` 1.17 x 2.14 x 1.14; `tower-square-arch` 0.93 x 1.01 x 0.93; `tower-square-base-border` 1 x 0.45 x 1; `tower-square-base-color` 1 x 1.01 x 1; `tower-square-base` 1 x 1.01 x 1; `tower-square-mid-color` 0.93 x 0.2 x 0.93; `tower-square-mid-door` 0.93 x 1.01 x 0.93; `tower-square-mid-open-simple` 0.93 x 0.88 x 0.93; `tower-square-mid-open` 0.93 x 1.01 x 0.93; `tower-square-mid-windows` 0.93 x 1.01 x 0.93; `tower-square-mid` 0.93 x 1.01 x 0.93; `tower-square-roof` 1 x 2.01 x 1; `tower-square-top-color` 1 x 0.38 x 1; `tower-square-top-roof-high-windows` 1 x 1.08 x 1; `tower-square-top-roof-high` 1 x 1.35 x 1; `tower-square-top-roof-rounded` 1 x 0.95 x 1; `tower-square-top-roof` 1 x 1 x 1; `tower-square-top` 1 x 0.3 x 1; `tower-square` 1 x 1.31 x 1; `tower-top` 1 x 0.13 x 1
- **tree**: `tree-large` 0.89 x 1.85 x 0.89; `tree-log` 0.25 x 0.28 x 1; `tree-small` 0.74 x 1.35 x 0.72; `tree-trunk` 0.4 x 0.38 x 0.34
- **wall**: `wall-corner-half-tower` 1.5 x 1.44 x 1.5; `wall-corner-half` 1 x 1.31 x 1; `wall-corner-slant` 1 x 1.31 x 1; `wall-corner` 1 x 1.31 x 1; `wall-doorway` 0.5 x 1.31 x 1; `wall-half-modular` 0.6 x 1.31 x 1; `wall-half` 1 x 1.31 x 1; `wall-narrow-corner` 0.5 x 1.31 x 0.5; `wall-narrow-gate` 0.63 x 1.31 x 1; `wall-narrow-stairs-rail` 0.99 x 1.45 x 1.03; `wall-narrow-stairs` 0.96 x 1.31 x 1; `wall-narrow-wood-fence` 1.05 x 1.45 x 1; `wall-narrow-wood` 1 x 1.31 x 1; `wall-narrow` 0.5 x 1.31 x 1; `wall-pillar` 1 x 1.31 x 1; `wall-stud` 0.27 x 1.11 x 0.17; `wall-to-narrow` 1 x 1.31 x 1; `wall` 1 x 1.31 x 1

### Kenney graveyard-kit - `/assets/models/kenney/graveyard-kit/<name>.glb` (91 models, sizes in kit units)

- **altar**: `altar-stone` 1.04 x 0.49 x 0.65; `altar-wood` 1.04 x 0.54 x 0.66
- **bench**: `bench-damaged` 0.91 x 0.52 x 0.46; `bench` 0.81 x 0.53 x 0.46
- **border**: `border-pillar` 0.22 x 0.76 x 0.22
- **brick**: `brick-wall-curve-small` 1 x 0.72 x 1; `brick-wall-curve` 1 x 0.72 x 1; `brick-wall-end` 1 x 0.85 x 0.45; `brick-wall` 1 x 0.72 x 0.3
- **candle**: `candle-multiple` 0.26 x 0.2 x 0.27; `candle` 0.14 x 0.2 x 0.14
- **character**: `character-ghost` 0.79 x 0.66 x 0.49 [anims: static, idle, walk, sprint, jump, fall, crouch, sit, ...]; `character-keeper` 0.81 x 0.86 x 0.54 [anims: static, idle, walk, sprint, jump, fall, crouch, sit, ...]; `character-skeleton` 0.76 x 0.7 x 0.32 [anims: static, idle, walk, sprint, jump, fall, crouch, sit, ...]; `character-vampire` 0.81 x 0.78 x 0.46 [anims: static, idle, walk, sprint, jump, fall, crouch, sit, ...]; `character-zombie` 0.81 x 0.82 x 0.34 [anims: static, idle, walk, sprint, jump, fall, crouch, sit, ...]
- **coffin**: `coffin-old` 0.57 x 0.2 x 0.84; `coffin` 0.57 x 0.33 x 0.84
- **column**: `column-large` 0.39 x 1.13 x 0.39
- **cross**: `cross-column` 0.45 x 1.45 x 0.45; `cross-wood` 0.43 x 1.04 x 0.43; `cross` 0.67 x 1.05 x 0.25
- **crypt**: `crypt-a` 0.62 x 0.52 x 1.12; `crypt-b` 0.62 x 0.52 x 1.12; `crypt-door` 0.33 x 0.74 x 0.13 [anims: open, close, open-and-close]; `crypt-large-door` 0.63 x 0.74 x 0.14 [anims: open, close, open-and-close]; `crypt-large-roof` 1.98 x 0.76 x 2.44; `crypt-large` 1.85 x 1 x 2.4; `crypt-small-roof` 1.5 x 0.74 x 1.44; `crypt-small` 1.35 x 1 x 1.4; `crypt` 0.72 x 0.73 x 1.12
- **debris**: `debris-wood` 0.46 x 0.1 x 0.5; `debris` 0.54 x 0.16 x 0.55
- **detail**: `detail-bowl` 0.2 x 0.13 x 0.2; `detail-chalice` 0.16 x 0.25 x 0.16; `detail-plate` 0.27 x 0.05 x 0.27
- **fence**: `fence-damaged` 1 x 0.62 x 0.31; `fence-gate` 1 x 0.62 x 0.2; `fence` 1 x 0.62 x 0.18
- **fire**: `fire-basket` 0.42 x 0.17 x 0.42
- **grave**: `grave-border` 0.76 x 0.11 x 1.39; `grave` 0.72 x 0.11 x 1.24
- **gravestone**: `gravestone-bevel` 0.45 x 0.53 x 0.25; `gravestone-broken` 0.51 x 0.34 x 0.39; `gravestone-cross-large` 0.45 x 0.94 x 0.33; `gravestone-cross` 0.45 x 0.92 x 0.33; `gravestone-debris` 0.49 x 0.27 x 0.64; `gravestone-decorative` 0.51 x 0.59 x 0.25; `gravestone-roof` 0.49 x 0.61 x 0.25; `gravestone-round` 0.45 x 0.57 x 0.25; `gravestone-wide` 0.85 x 0.57 x 0.3
- **hay**: `hay-bale-bundled` 0.61 x 0.38 x 0.43; `hay-bale` 0.61 x 0.35 x 0.4
- **iron**: `iron-fence-bar` 0.12 x 0.67 x 0.1; `iron-fence-border-column` 1 x 0.88 x 0.22; `iron-fence-border-curve` 0.9 x 0.88 x 0.9; `iron-fence-border-gate` 1 x 0.76 x 0.22; `iron-fence-border` 1 x 0.88 x 0.15; `iron-fence-curve` 0.88 x 0.88 x 0.88; `iron-fence-damaged` 1 x 0.88 x 0.33; `iron-fence` 1 x 0.88 x 0.11
- **lantern**: `lantern-candle` 0.24 x 0.39 x 0.24; `lantern-glass` 0.24 x 0.39 x 0.24
- **lightpost**: `lightpost-all` 0.73 x 1.27 x 0.73; `lightpost-double` 0.21 x 1.27 x 0.73; `lightpost-single` 0.21 x 1.27 x 0.47
- **pillar**: `pillar-large` 0.22 x 1.13 x 0.22; `pillar-obelisk` 0.35 x 1.01 x 0.35; `pillar-small` 0.18 x 0.76 x 0.18; `pillar-square` 0.35 x 1.15 x 0.35
- **pine**: `pine-crooked` 1.18 x 2.11 x 1.33; `pine-fall-crooked` 1.18 x 2.11 x 1.33; `pine-fall` 1.18 x 2.3 x 1.33; `pine` 1.18 x 2.3 x 1.33
- **pumpkin**: `pumpkin-carved` 0.38 x 0.32 x 0.38; `pumpkin-tall-carved` 0.33 x 0.36 x 0.33; `pumpkin-tall` 0.33 x 0.36 x 0.33; `pumpkin` 0.38 x 0.32 x 0.38
- **road**: `road` 0.8 x 0.08 x 0.79
- **rocks**: `rocks-tall` 1.03 x 0.59 x 1.02; `rocks` 1.08 x 0.38 x 0.96
- **shovel**: `shovel-dirt` 0.62 x 0.66 x 0.52; `shovel` 0.19 x 0.61 x 0.1
- **stone**: `stone-wall-column` 1 x 0.85 x 0.35; `stone-wall-curve` 1 x 0.72 x 1; `stone-wall-damaged` 1 x 0.72 x 0.2; `stone-wall` 1 x 0.72 x 0.2
- **trunk**: `trunk-long` 0.54 x 1 x 0.54; `trunk` 0.54 x 0.45 x 0.55
- **urn**: `urn-round` 0.26 x 0.38 x 0.26; `urn-square` 0.26 x 0.38 x 0.26

### Kenney survival-kit - `/assets/models/kenney/survival-kit/<name>.glb` (80 models, sizes in kit units)

- **barrel**: `barrel-open` 0.24 x 0.34 x 0.24; `barrel` 0.24 x 0.34 x 0.24
- **bedroll**: `bedroll-frame` 0.27 x 0.15 x 0.61; `bedroll-packed` 0.26 x 0.09 x 0.09; `bedroll` 0.31 x 0.13 x 0.61
- **bottle**: `bottle-large` 0.07 x 0.14 x 0.08; `bottle` 0.05 x 0.15 x 0.06
- **box**: `box-large-open` 0.25 x 0.31 x 0.5; `box-large` 0.25 x 0.25 x 0.5; `box-open` 0.25 x 0.31 x 0.25; `box` 0.25 x 0.25 x 0.25
- **bucket**: `bucket` 0.14 x 0.19 x 0.14
- **campfire**: `campfire-fishing-stand` 0.4 x 0.28 x 0.25; `campfire-pit` 0.28 x 0.11 x 0.27; `campfire-stand` 0.41 x 0.28 x 0.12
- **chest**: `chest` 0.26 x 0.26 x 0.27 [anims: open, close, open-close]
- **fence**: `fence-doorway` 0.5 x 0.52 x 0.05; `fence-fortified` 0.5 x 0.52 x 0.05; `fence` 0.5 x 0.52 x 0.04
- **fish**: `fish-large` 0.31 x 0.16 x 0.1; `fish` 0.2 x 0.11 x 0.07
- **floor**: `floor-hole` 0.5 x 0.07 x 0.5; `floor-old` 0.5 x 0.05 x 0.5; `floor` 0.5 x 0.05 x 0.5
- **grass**: `grass-large` 0.48 x 0.14 x 0.49; `grass` 0.23 x 0.14 x 0.26
- **metal**: `metal-panel-narrow` 0.25 x 0.5 x 0.05; `metal-panel-screws-half` 0.5 x 0.25 x 0.06; `metal-panel-screws-narrow` 0.25 x 0.5 x 0.06; `metal-panel-screws` 0.5 x 0.5 x 0.06; `metal-panel` 0.5 x 0.5 x 0.05
- **patch**: `patch-grass-large` 1.4 x 0 x 1.2; `patch-grass` 1.2 x 0 x 1.2
- **resource**: `resource-planks` 0.37 x 0.09 x 0.63; `resource-stone-large` 0.38 x 0.16 x 0.34; `resource-stone` 0.17 x 0.11 x 0.14; `resource-wood` 0.2 x 0.06 x 0.09
- **rock**: `rock-a` 0.56 x 0.39 x 0.62; `rock-b` 0.83 x 0.42 x 0.72; `rock-c` 0.78 x 0.51 x 0.57; `rock-flat-grass` 1.79 x 0.23 x 1.45; `rock-flat` 1.79 x 0.2 x 1.45; `rock-sand-a` 0.56 x 0.39 x 0.48; `rock-sand-b` 0.8 x 0.45 x 0.79; `rock-sand-c` 0.78 x 0.51 x 0.57
- **signpost**: `signpost-single` 0.21 x 0.46 x 0.04; `signpost` 0.21 x 0.46 x 0.04
- **structure**: `structure-canvas` 0.5 x 0.5 x 0.5; `structure-floor` 0.5 x 0.55 x 0.5; `structure-metal-doorway` 0.54 x 0.52 x 0.09; `structure-metal-floor` 0.5 x 0.51 x 0.5; `structure-metal-roof` 0.54 x 0.5 x 0.55; `structure-metal-wall` 0.54 x 0.5 x 0.09; `structure-metal` 0.54 x 0.5 x 0.54; `structure-roof` 0.54 x 0.66 x 0.55; `structure` 0.5 x 0.5 x 0.5
- **tent**: `tent-canvas-half` 0.56 x 0.49 x 0.56; `tent-canvas` 0.56 x 0.49 x 0.56; `tent` 0.56 x 0.49 x 0.56
- **tool**: `tool-axe-upgraded` 0.15 x 0.26 x 0.04; `tool-axe` 0.11 x 0.26 x 0.03; `tool-hammer-upgraded` 0.12 x 0.18 x 0.05; `tool-hammer` 0.09 x 0.15 x 0.04; `tool-hoe-upgraded` 0.09 x 0.24 x 0.09; `tool-hoe` 0.09 x 0.24 x 0.07; `tool-pickaxe-upgraded` 0.18 x 0.24 x 0.04; `tool-pickaxe` 0.18 x 0.24 x 0.04; `tool-shovel-upgraded` 0.09 x 0.29 x 0.04; `tool-shovel` 0.07 x 0.29 x 0.03
- **tree**: `tree-autumn-tall` 0.55 x 1.71 x 0.53; `tree-autumn-trunk` 0.2 x 0.26 x 0.2; `tree-autumn` 0.55 x 1.41 x 0.53; `tree-log-small` 0.25 x 0.28 x 0.65; `tree-log` 0.25 x 0.28 x 1; `tree-tall` 0.55 x 1.71 x 0.53; `tree-trunk` 0.2 x 0.26 x 0.2; `tree` 0.55 x 1.41 x 0.53
- **workbench**: `workbench-anvil` 0.32 x 0.34 x 0.3; `workbench-grind` 0.26 x 0.28 x 0.33; `workbench` 0.33 x 0.29 x 0.3

### Kenney nature-kit - `/assets/models/kenney/nature-kit/<name>.glb` (329 models, sizes in kit units)

- **bed**: `bed` 0.34 x 0.27 x 0.75; `bed_floor` 0.32 x 0.09 x 0.75
- **bridge**: `bridge_center_stone` 1 x 0.3 x 1; `bridge_center_stoneRound` 1 x 0.2 x 1; `bridge_center_wood` 1 x 0.3 x 1; `bridge_center_woodRound` 1 x 0.2 x 1; `bridge_side_stone` 1.02 x 0.4 x 1.04; `bridge_side_stoneRound` 1.02 x 0.45 x 1.04; `bridge_side_wood` 1.02 x 0.4 x 1.04; `bridge_side_woodRound` 1.02 x 0.45 x 1.04; `bridge_stone` 1.04 x 0.4 x 1.04; `bridge_stoneNarrow` 1.04 x 0.35 x 0.84; `bridge_stoneRound` 1.04 x 0.45 x 1.04; `bridge_stoneRoundNarrow` 1.04 x 0.4 x 0.84; `bridge_wood` 1.04 x 0.4 x 1.04; `bridge_woodNarrow` 1.04 x 0.35 x 0.84; `bridge_woodRound` 1.04 x 0.45 x 1.04; `bridge_woodRoundNarrow` 1.04 x 0.4 x 0.84
- **cactus**: `cactus_short` 0.34 x 0.53 x 0.3; `cactus_tall` 0.4 x 0.75 x 0.34
- **campfire**: `campfire_bricks` 0.47 x 0.07 x 0.47; `campfire_logs` 0.29 x 0.06 x 0.29; `campfire_planks` 0.35 x 0.04 x 0.35; `campfire_stones` 0.54 x 0.08 x 0.52
- **canoe**: `canoe` 0.3 x 0.18 x 1.15; `canoe_paddle` 0.08 x 0.04 x 0.59
- **cliff**: `cliff_blockCave_rock` 1 x 1 x 1; `cliff_blockCave_stone` 1 x 1 x 1; `cliff_blockDiagonal_rock` 1 x 1 x 1; `cliff_blockDiagonal_stone` 1 x 1 x 1; `cliff_blockHalf_rock` 1 x 0.5 x 1; `cliff_blockHalf_stone` 1 x 0.5 x 1; `cliff_blockQuarter_rock` 1 x 0.25 x 1; `cliff_blockQuarter_stone` 1 x 0.25 x 1; `cliff_blockSlopeHalfWalls_rock` 1 x 0.5 x 1; `cliff_blockSlopeHalfWalls_stone` 1 x 0.5 x 1; `cliff_blockSlopeWalls_rock` 1 x 1 x 1; `cliff_blockSlopeWalls_stone` 1 x 1 x 1; `cliff_blockSlope_rock` 1.2 x 1 x 1; `cliff_blockSlope_stone` 1.2 x 1 x 1; `cliff_block_rock` 1 x 1 x 1; `cliff_block_stone` 1 x 1 x 1; `cliff_cave_rock` 1 x 1 x 0.17; `cliff_cave_stone` 1 x 1 x 0.17; `cliff_cornerInnerLarge_rock` 1 x 1 x 1; `cliff_cornerInnerLarge_stone` 1 x 1 x 1; `cliff_cornerInnerTop_rock` 1 x 1 x 1; `cliff_cornerInnerTop_stone` 1 x 1 x 1; `cliff_cornerInner_rock` 1 x 1 x 1; `cliff_cornerInner_stone` 1 x 1 x 1; `cliff_cornerLarge_rock` 0.42 x 1 x 0.42; `cliff_cornerLarge_stone` 0.42 x 1 x 0.42; `cliff_cornerTop_rock` 0.27 x 1 x 0.27; `cliff_cornerTop_stone` 0.27 x 1 x 0.27; `cliff_corner_rock` 0.17 x 1 x 0.17; `cliff_corner_stone` 0.17 x 1 x 0.17; `cliff_diagonal_rock` 1.17 x 1 x 1.17; `cliff_diagonal_stone` 1.17 x 1 x 1.17; `cliff_halfCornerInner_rock` 1 x 0.5 x 1; `cliff_halfCornerInner_stone` 1 x 0.5 x 1; `cliff_halfCorner_rock` 0.42 x 0.5 x 0.42; `cliff_halfCorner_stone` 0.42 x 0.5 x 0.42; `cliff_half_rock` 1 x 0.5 x 0.42; `cliff_half_stone` 1 x 0.5 x 0.42; `cliff_large_rock` 1 x 1 x 0.42; `cliff_large_stone` 1 x 1 x 0.42; `cliff_rock` 1 x 1 x 0.17; `cliff_stepsCornerInner_rock` 1 x 1 x 1; `cliff_stepsCornerInner_stone` 1 x 1 x 1; `cliff_stepsCorner_rock` 1.05 x 1 x 1.05; `cliff_stepsCorner_stone` 1.05 x 1 x 1.05; `cliff_steps_rock` 1 x 1 x 1.05; `cliff_steps_stone` 1 x 1 x 1.05; `cliff_stone` 1 x 1 x 0.17; `cliff_topDiagonal_rock` 1.27 x 1 x 1.27; `cliff_topDiagonal_stone` 1.27 x 1 x 1.27; `cliff_top_rock` 1 x 1 x 0.27; `cliff_top_stone` 1 x 1 x 0.27; `cliff_waterfallTop_rock` 1 x 1 x 0.27; `cliff_waterfallTop_stone` 1 x 1 x 0.27; `cliff_waterfall_rock` 1 x 1 x 0.17; `cliff_waterfall_stone` 1 x 1 x 0.17
- **crops**: `crops_bambooStageA` 0.34 x 0.55 x 0.31; `crops_bambooStageB` 0.34 x 0.89 x 0.31; `crops_cornStageA` 0.3 x 0.5 x 0.3; `crops_cornStageB` 0.3 x 1 x 0.3; `crops_cornStageC` 0.3 x 1.25 x 0.3; `crops_cornStageD` 0.44 x 1.25 x 0.44; `crops_dirtDoubleRow` 1 x 0.05 x 0.94; `crops_dirtDoubleRowCorner` 0.94 x 0.05 x 0.94; `crops_dirtDoubleRowEnd` 0.6 x 0.05 x 0.94; `crops_dirtRow` 1 x 0.05 x 0.62; `crops_dirtRowCorner` 0.78 x 0.05 x 0.78; `crops_dirtRowEnd` 0.6 x 0.05 x 0.62; `crops_dirtSingle` 0.4 x 0.1 x 0.35; `crops_leafsStageA` 0.39 x 0.43 x 0.39; `crops_leafsStageB` 0.39 x 0.68 x 0.39; `crops_wheatStageA` 0.54 x 0.34 x 0.45; `crops_wheatStageB` 0.54 x 0.54 x 0.45
- **crop**: `crop_carrot` 0.34 x 0.62 x 0.34; `crop_melon` 0.42 x 0.35 x 0.36; `crop_pumpkin` 0.44 x 0.33 x 0.45; `crop_turnip` 0.34 x 0.66 x 0.34
- **fence**: `fence_bend` 1 x 0.34 x 1; `fence_bendCenter` 1 x 0.34 x 1; `fence_corner` 1 x 0.34 x 1; `fence_gate` 1 x 0.34 x 0.07; `fence_planks` 1 x 0.34 x 0.1; `fence_planksDouble` 1 x 0.34 x 0.06; `fence_simple` 1 x 0.34 x 0.07; `fence_simpleCenter` 1 x 0.34 x 0.07; `fence_simpleDiagonal` 1 x 0.34 x 1; `fence_simpleDiagonalCenter` 1 x 0.34 x 1; `fence_simpleHigh` 1.04 x 0.34 x 0.11; `fence_simpleLow` 1.04 x 0.2 x 0.11
- **flower**: `flower_purpleA` 0.16 x 0.24 x 0.18; `flower_purpleB` 0.21 x 0.21 x 0.24; `flower_purpleC` 0.18 x 0.18 x 0.18; `flower_redA` 0.16 x 0.29 x 0.18; `flower_redB` 0.21 x 0.26 x 0.24; `flower_redC` 0.18 x 0.23 x 0.18; `flower_yellowA` 0.16 x 0.19 x 0.18; `flower_yellowB` 0.21 x 0.16 x 0.24; `flower_yellowC` 0.18 x 0.13 x 0.18
- **grass**: `grass` 0.38 x 0.25 x 0.39; `grass_large` 0.41 x 0.25 x 0.41; `grass_leafs` 0.23 x 0.14 x 0.26; `grass_leafsLarge` 0.48 x 0.14 x 0.49
- **ground**: `ground_grass` 1 x 0 x 1; `ground_pathBend` 1 x 0.05 x 1; `ground_pathBendBank` 1 x 0.05 x 1; `ground_pathCorner` 1 x 0.05 x 1; `ground_pathCornerSmall` 1 x 0.05 x 1; `ground_pathCross` 1 x 0.05 x 1; `ground_pathEnd` 1 x 0.05 x 1; `ground_pathEndClosed` 1 x 0.05 x 1; `ground_pathOpen` 1 x 0 x 1; `ground_pathRocks` 1 x 0.05 x 1; `ground_pathSide` 1 x 0.05 x 1; `ground_pathSideOpen` 1 x 0.05 x 1; `ground_pathSplit` 1 x 0.05 x 1; `ground_pathStraight` 1 x 0.05 x 1; `ground_pathTile` 1 x 0.05 x 1; `ground_riverBend` 1 x 0.05 x 1; `ground_riverBendBank` 1 x 0.05 x 1; `ground_riverCorner` 1 x 0.05 x 1; `ground_riverCornerSmall` 1 x 0.05 x 1; `ground_riverCross` 1 x 0.05 x 1; `ground_riverEnd` 1 x 0.05 x 1; `ground_riverEndClosed` 1 x 0.05 x 1; `ground_riverOpen` 1 x 0 x 1; `ground_riverRocks` 1 x 0.05 x 1; `ground_riverSide` 1 x 0.05 x 1; `ground_riverSideOpen` 1 x 0.05 x 1; `ground_riverSplit` 1 x 0.05 x 1; `ground_riverStraight` 1 x 0.05 x 1; `ground_riverTile` 1 x 0.05 x 1
- **hanging**: `hanging_moss` 0.16 x 0.48 x 0.04
- **lily**: `lily_large` 0.27 x 0.1 x 0.31; `lily_small` 0.19 x 0.04 x 0.22
- **log**: `log` 0.23 x 0.17 x 0.71; `log_large` 1 x 0.42 x 0.55; `log_stack` 0.42 x 0.35 x 0.71; `log_stackLarge` 0.63 x 0.35 x 0.71
- **mushroom**: `mushroom_red` 0.17 x 0.2 x 0.2; `mushroom_redGroup` 0.27 x 0.25 x 0.25; `mushroom_redTall` 0.12 x 0.25 x 0.14; `mushroom_tan` 0.19 x 0.15 x 0.22; `mushroom_tanGroup` 0.27 x 0.25 x 0.25; `mushroom_tanTall` 0.12 x 0.25 x 0.14
- **path**: `path_stone` 1 x 0.05 x 0.58; `path_stoneCircle` 0.93 x 0.05 x 0.88; `path_stoneCorner` 0.74 x 0.05 x 0.78; `path_stoneEnd` 0.62 x 0.05 x 0.57; `path_wood` 1 x 0.05 x 0.51; `path_woodCorner` 0.75 x 0.05 x 0.75; `path_woodEnd` 0.61 x 0.05 x 0.51
- **plant**: `plant_bush` 0.4 x 0.24 x 0.4; `plant_bushDetailed` 0.6 x 0.36 x 0.6; `plant_bushLarge` 0.37 x 0.24 x 0.34; `plant_bushLargeTriangle` 0.41 x 0.17 x 0.47; `plant_bushSmall` 0.38 x 0.21 x 0.34; `plant_bushTriangle` 0.36 x 0.3 x 0.41; `plant_flatShort` 0.28 x 0.23 x 0.28; `plant_flatTall` 0.27 x 0.28 x 0.27
- **platform**: `platform_beach` 0.89 x 0.08 x 0.72; `platform_grass` 0.89 x 0.08 x 0.72; `platform_stone` 0.89 x 0.08 x 0.72
- **pot**: `pot_large` 0.56 x 0.2 x 0.49; `pot_small` 0.32 x 0.27 x 0.28
- **rock**: `rock_largeA` 0.79 x 0.26 x 1.01; `rock_largeB` 0.77 x 0.43 x 1.01; `rock_largeC` 1.06 x 0.32 x 1.02; `rock_largeD` 1.07 x 0.57 x 1.03; `rock_largeE` 1.09 x 0.29 x 0.92; `rock_largeF` 1.09 x 0.48 x 0.9; `rock_smallA` 0.36 x 0.19 x 0.36; `rock_smallB` 0.36 x 0.18 x 0.36; `rock_smallC` 0.36 x 0.12 x 0.36; `rock_smallD` 0.43 x 0.23 x 0.37; `rock_smallE` 0.36 x 0.26 x 0.31; `rock_smallF` 0.35 x 0.24 x 0.31; `rock_smallFlatA` 0.5 x 0.07 x 0.43; `rock_smallFlatB` 0.43 x 0.07 x 0.4; `rock_smallFlatC` 0.47 x 0.07 x 0.36; `rock_smallG` 0.59 x 0.24 x 0.69; `rock_smallH` 0.46 x 0.41 x 0.46; `rock_smallI` 0.36 x 0.28 x 0.41; `rock_smallTopA` 0.49 x 0.22 x 0.49; `rock_smallTopB` 0.62 x 0.28 x 0.65; `rock_tallA` 0.98 x 1 x 0.68; `rock_tallB` 0.77 x 0.88 x 0.77; `rock_tallC` 0.46 x 0.78 x 0.44; `rock_tallD` 0.44 x 0.77 x 0.46; `rock_tallE` 0.46 x 0.44 x 0.53; `rock_tallF` 0.44 x 0.57 x 0.51; `rock_tallG` 0.42 x 0.78 x 0.49; `rock_tallH` 0.57 x 0.71 x 0.66; `rock_tallI` 0.46 x 0.81 x 0.46; `rock_tallJ` 0.49 x 0.62 x 0.54
- **sign**: `sign` 0.3 x 0.41 x 0.07
- **statue**: `statue_block` 0.4 x 0.4 x 0.4; `statue_column` 0.3 x 1 x 0.3; `statue_columnDamaged` 0.3 x 0.7 x 0.3; `statue_head` 0.73 x 1 x 0.55; `statue_obelisk` 0.31 x 0.88 x 0.31; `statue_ring` 0.6 x 0.8 x 0.4
- **stone**: `stone_largeA` 0.79 x 0.26 x 1.01; `stone_largeB` 0.77 x 0.43 x 1.01; `stone_largeC` 1.06 x 0.32 x 1.02; `stone_largeD` 1.07 x 0.57 x 1.03; `stone_largeE` 1.09 x 0.29 x 0.92; `stone_largeF` 1.09 x 0.48 x 0.9; `stone_smallA` 0.36 x 0.19 x 0.36; `stone_smallB` 0.36 x 0.18 x 0.36; `stone_smallC` 0.36 x 0.12 x 0.36; `stone_smallD` 0.43 x 0.23 x 0.37; `stone_smallE` 0.36 x 0.26 x 0.31; `stone_smallF` 0.35 x 0.24 x 0.31; `stone_smallFlatA` 0.5 x 0.07 x 0.43; `stone_smallFlatB` 0.43 x 0.07 x 0.4; `stone_smallFlatC` 0.47 x 0.07 x 0.36; `stone_smallG` 0.59 x 0.24 x 0.69; `stone_smallH` 0.46 x 0.41 x 0.46; `stone_smallI` 0.36 x 0.28 x 0.41; `stone_smallTopA` 0.49 x 0.22 x 0.49; `stone_smallTopB` 0.62 x 0.28 x 0.65; `stone_tallA` 0.98 x 1 x 0.68; `stone_tallB` 0.77 x 0.88 x 0.77; `stone_tallC` 0.46 x 0.78 x 0.44; `stone_tallD` 0.44 x 0.77 x 0.46; `stone_tallE` 0.46 x 0.44 x 0.53; `stone_tallF` 0.44 x 0.57 x 0.51; `stone_tallG` 0.42 x 0.78 x 0.49; `stone_tallH` 0.57 x 0.71 x 0.66; `stone_tallI` 0.46 x 0.81 x 0.46; `stone_tallJ` 0.49 x 0.62 x 0.54
- **stump**: `stump_old` 0.36 x 0.27 x 0.37; `stump_oldTall` 0.36 x 0.67 x 0.37; `stump_round` 0.32 x 0.21 x 0.37; `stump_roundDetailed` 0.36 x 0.21 x 0.37; `stump_square` 0.36 x 0.3 x 0.3; `stump_squareDetailed` 0.44 x 0.2 x 0.44; `stump_squareDetailedWide` 0.64 x 0.2 x 0.64
- **tent**: `tent_detailedClosed` 0.88 x 0.56 x 0.64; `tent_detailedOpen` 0.88 x 0.56 x 0.67; `tent_smallClosed` 0.55 x 0.56 x 0.64; `tent_smallOpen` 0.55 x 0.56 x 0.67
- **tree**: `tree_blocks` 0.6 x 1.19 x 0.6; `tree_blocks_dark` 0.6 x 1.19 x 0.6; `tree_blocks_fall` 0.6 x 1.19 x 0.6; `tree_cone` 0.53 x 1.43 x 0.53; `tree_cone_dark` 0.53 x 1.43 x 0.53; `tree_cone_fall` 0.53 x 1.43 x 0.53; `tree_default` 0.76 x 1.71 x 0.65; `tree_default_dark` 0.76 x 1.71 x 0.65; `tree_default_fall` 0.76 x 1.71 x 0.65; `tree_detailed` 0.85 x 1.33 x 0.76; `tree_detailed_dark` 0.85 x 1.33 x 0.76; `tree_detailed_fall` 0.85 x 1.33 x 0.76; `tree_fat` 0.76 x 1.15 x 0.65; `tree_fat_darkh` 0.76 x 1.15 x 0.65; `tree_fat_fall` 0.76 x 1.15 x 0.65; `tree_oak` 0.64 x 1.23 x 0.74; `tree_oak_dark` 0.64 x 1.23 x 0.74; `tree_oak_fall` 0.64 x 1.23 x 0.74; `tree_palm` 0.94 x 1.51 x 1.01; `tree_palmBend` 0.94 x 1.38 x 1.01; `tree_palmDetailedShort` 1.46 x 1.12 x 1.46; `tree_palmDetailedTall` 1.46 x 1.42 x 1.46; `tree_palmShort` 1.03 x 1.06 x 1.03; `tree_palmTall` 1.03 x 1.36 x 1.03; `tree_pineDefaultA` 0.53 x 1.55 x 0.53; `tree_pineDefaultB` 0.53 x 1.55 x 0.53; `tree_pineGroundA` 0.48 x 0.91 x 0.56; `tree_pineGroundB` 0.48 x 1.04 x 0.56; `tree_pineRoundA` 0.62 x 1.37 x 0.71; `tree_pineRoundB` 0.53 x 1.2 x 0.61; `tree_pineRoundC` 0.48 x 1.25 x 0.56; `tree_pineRoundD` 0.48 x 1.08 x 0.56; `tree_pineRoundE` 0.53 x 1.25 x 0.53; `tree_pineRoundF` 0.53 x 1.25 x 0.53; `tree_pineSmallA` 0.5 x 0.97 x 0.5; `tree_pineSmallB` 0.39 x 1.01 x 0.39; `tree_pineSmallC` 0.39 x 1.12 x 0.39; `tree_pineSmallD` 0.36 x 0.96 x 0.36; `tree_pineTallA` 0.39 x 1.53 x 0.39; `tree_pineTallA_detailed` 0.39 x 1.53 x 0.39; `tree_pineTallB` 0.39 x 1.94 x 0.39; `tree_pineTallB_detailed` 0.39 x 1.94 x 0.39; `tree_pineTallC` 0.48 x 1.67 x 0.56; `tree_pineTallC_detailed` 0.48 x 1.67 x 0.56; `tree_pineTallD` 0.48 x 2.08 x 0.56; `tree_pineTallD_detailed` 0.48 x 2.08 x 0.56; `tree_plateau` 0.61 x 1.25 x 0.66; `tree_plateau_dark` 0.61 x 1.25 x 0.66; `tree_plateau_fall` 0.61 x 1.25 x 0.66; `tree_simple` 0.35 x 1.52 x 0.41; `tree_simple_dark` 0.35 x 1.52 x 0.41; `tree_simple_fall` 0.35 x 1.52 x 0.41; `tree_small` 0.35 x 1.11 x 0.41; `tree_small_dark` 0.35 x 1.11 x 0.41; `tree_small_fall` 0.35 x 1.11 x 0.41; `tree_tall` 0.4 x 1.69 x 0.46; `tree_tall_dark` 0.4 x 1.69 x 0.46; `tree_tall_fall` 0.4 x 1.69 x 0.46; `tree_thin` 0.68 x 1.49 x 0.62; `tree_thin_dark` 0.68 x 1.49 x 0.62; `tree_thin_fall` 0.68 x 1.49 x 0.62
