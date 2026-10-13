# ENGINE_VERTICALITY — implementation spec for CORE_MECHANICS §13 (dungeon heightfield)

Status: normative for the packages in §19 (precedence: ARCHITECTURE > CORE_MECHANICS > this file > other GDDs). Author: Sonnet (design),
reviewed by Opus. Implementation: Haiku packages V1–V13 in file-disjoint waves of ≤3 (§19). Docs only: nothing in `src/` was edited
while writing this. All numbers are tuning targets; every constant lives in ONE exported table `VERT` (§2).

User brief (CORE_MECHANICS §13): "mahzenler yüksek olsun, WoW'dakiler gibi" — tall halls, stairs, balconies, chasms, bridges, lifts,
≥3 height levels in every season dungeon, without turning the engine into a multi-storey one.

## 0. Hard invariants (read first)

1. **Heightfield, single surface.** Exactly one walkable floor height per (x,z). No walking under bridges/galleries. Everything "above"
   a walkable cell is decoration (non-walkable, non-colliding, fadeable).
2. **Opt-in per dungeon, zero change otherwise.** A new optional flag `DungeonDef.vertical?: true` switches the whole feature on.
   `vertical` unset/false ⇒ the build, nav, camera and combat paths are byte-for-byte the legacy ones (`NavGrid.floor === null`,
   `World.vertical === false`, every new branch is `if (!world.vertical) return legacy`). Legacy dungeons (kemik_mahzeni, golge_tapinagi,
   buzul_tahti, kizil_dokumhane, sisli_koru open world, town, homes) MUST pass `node tools/content-check.mjs` unchanged and render identically.
3. **Deterministic, derived, never replicated.** Heights, flags, regions and ceilings are pure functions of the `DungeonDef` (same on every
   peer, no RNG). Only dynamic things (lifts, airborne actors) cross the wire (§15).
4. **Existing public signatures stay.** `NavGrid.cell/isWalkable/resolveCircle/raycast/lineOfSight/nearestWalkable/randomNear/findPath`,
   `World.groundY/actorsInRadius/...`, `Actor.forcedMove`, `Player.jumpY` keep their meaning; new behaviour is added through new
   methods/optional params (golden rule 1/2 of ARCHITECTURE.md). `Player.jumpY` stays a derived field (= max(0, y − groundY)).
5. Units: metres, Y up, `TILE_SIZE` 4. Nav cell 1 m, lattice centres at integer world coords (`originX = −0.5`, see DungeonBuilder.ts:473).
   The zone/height grid is the **2 m cell** of `ZoneField` (`CELL = 2`, Zones.ts:21): one zone cell (zi,zj) covers world
   [2zi, 2zi+2) × [2zj, 2zj+2) and contains the four 1 m nav cells with centres 2zi+{0,1}, 2zj+{0,1}.
6. Turkish UI strings, English ids/comments. Never throw from a frame loop (warn once, degrade to flat).
7. CORE_MECHANICS §13 says "default ceiling 6". This spec: absent `ceiling` ⇒ **legacy 4 m geometry** (so nothing moves);
   the content kit's new `tall()` helper defaults to 6. See Open Question Q1.

## 1. Audit — what exists today (facts the design builds on)

| Area | File | Fact |
|---|---|---|
| ground | `world/World.ts:160` | `groundY()` returns 0. `rayToGround` intersects plane y=0 (:164). TownScene overrides it per instance (`TownScene.ts:138`); DungeonScene does NOT, though it already calls `world.groundY` for spawns (`DungeonScene.ts:191,426,524,545,621,909,937`). |
| town | `TownBuilder.ts:242-262,615-670` | Precedent: `treadCount/treadTop` (stepped stairs, 0.28 m rise), `raised[]` terraces, 1 m sealed band (`sealRaised`), `groundY` = max terrace then stair tread. Reusable. |
| nav | `NavGrid.ts` | 1 m cells, `cells: Uint8Array` 0/1, 8-dir A* (no heights), DDA `raycast` XZ only, `resolveCircle` pushes out of blocked cells, `isWalkable = cell>0`. |
| dungeon geometry | `DungeonBuilder.ts` | Wall pieces KayKit 4 m placed at y=0 on tile vertices (`placeWalls` :815); floors 4 m/2 m tiles at y=0 (`placeFloors` :702); solid "rock mass" cap at y=3.86 over every non-walkable tile (`buildRockMass` :872) — this is the de-facto ceiling; pillars `placeBigRoomPillars` :1067 (`pillar`/`pillar_decorated`, scale 1, radius 0.85); `batcher.add(url,x,y,z,rot,scale: number|[sx,sy,sz],…)` already accepts non-uniform scale (`Instancing.ts:116`). |
| zones | `Zones.ts` | 2 m `state` grid: 0 floor / 1 hole (nav blocked) / 2 deck (bridge/dais re-open, order of `RoomDef.zones`). `pit/void` surface at −7 (`SURFACE_Y`). Holes are SOLID for nav (no falling today). `ZoneDef.y` is a visual-only offset. |
| player | `PlayerController.ts:600-620` | Jump = `p.jumpY` relative to ground, `GRAVITY 28.5`, `JUMP_V 9.3` (1.5 m apex), `p.position.y = groundY + jumpY`; landing `land()`; `resolveCircle` after XZ integration; forced moves with `vy` (leaps) edit `jumpY`. |
| actors | `Actor.ts:115-130` | `forcedMove{vx,vz,until,vy?}` integrated in XZ + `resolveCircle`; no y. |
| enemies | `Enemy.ts:770-774` | each frame `position.y = hover + bob` for holder models, i.e. **forces y to 0 for ground enemies**; remote interp pushes `y: 0` (`Enemy.ts:592`). `EnemySyncState` has no y. |
| AI | `EnemyAI.ts:1030-1135` | `steerTo`: LOS ⇒ straight line else `nav.findPath`; `applyMove` → `resolveCircle`. No height awareness. |
| hit shapes | `HitShapes.ts` | `contains()` pure XZ; `resolve()` tests only the local player XZ; projectile hostile shapes launch at `y = oy>0.2 ? oy : 1.2`. |
| projectile | `entities/Projectile.ts:178-240` | `advance()` uses `nav.raycast` XZ; hits by XZ distance only; y constant (lob arcs aside). |
| world queries | `World.ts:92-139` | `actorsInRadius/Cone/Line` XZ only (16 external call sites: Combat, procActions, skills/behaviors, skills/utilities, SkillSystem, specials, systems/Affixes). |
| camera | `ThirdPersonCamera.ts:274,711,727-745,781` | floor clamp + `minPitch` use `groundAt(pivot)`, nav raycast wall pull-in with `collideMaxRayHeight`, `MIN_DIST 3 / MAX_DIST 18 / MAX_PITCH 1.38`, `OccluderFader` fades tall scenery. No ceiling. |
| net | `PlayerSyncState.y` exists (`Player.ts:14`, clamped −100..300 in `Replication.ts:596`); `EnemySyncState` has no y; codec positional (`net/codec.ts:35-54`, `flags` bitfield, 12 elements). 'gate' channel carries free-form `key` strings (`hz:` precedent, `Hazards.ts:209`). |
| content docs | `docs/dungeons/kefaret_salonlari.md:51` | already asks for "optional `RoomDef.wallScale` (P11)" — superseded by `ceiling` here. |

## 2. Constants — `export const VERT` in `src/world/Heightfield.ts`

```ts
export const VERT = {
  STEP_UP: 0.45,        // max rise between adjacent 1 m cells / per actor step on flat ground (CM §13)
  RAMP_PAIR: 0.85,      // A* allows this rise between two cells when either is a SLOPE cell
  AIR_STEP: 0.25,       // airborne feet may clip this far above a new floor and still land on it
  MAX_GRADE: 0.80,      // ramp slope limit (m rise per m run); validator error above
  TREAD_RISE: 0.28,     // stairs: treads = max(2, ceil(|dy| / TREAD_RISE)) — identical to TownBuilder.treadCount
  TREAD_RISE_MAX: 0.30, // validator
  TREAD_DEPTH_MIN: 0.45,// validator warning (run / treads)
  TOL_MELEE: 2.5,       // combat height gate (CM §13): |feetY − planeY| ≤ this
  LOW_RAIL: 1.2,        // projectiles/camera rays pass over LOW cells above floor + this
  CEIL_LEGACY: 4.0,     // wall piece height / legacy geometry (rock mass sits at 3.86)
  CEIL_NEW_DEFAULT: 6,  // kit tall() helper default
  CEIL_MIN: 3.0,        // validator: ceiling − highest floor in room
  HEAD_H: 2.4,          // jump head clearance uses actor.height
  FALL_FREE: 4.0,       // landing drop that costs nothing (m)
  FALL_DMG_PER_M: 0.03, // of max HP per metre beyond FALL_FREE, cap 0.24
  FALL_RESPAWN_DROP: 12,// drop beyond this = treated as a fall into the void
  VOID_KILL_BELOW: 2.2, // metres under the void rim at which the fall triggers
  VOID_DMG_FRAC: 0.25,  // CM §13: "fall = 25 % max HP"
  SAFE_BACK_SEC: 0.6,   // respawn uses a safe sample at least this old
  SAFE_HIST_SEC: 4,
  SAFE_EDGE_PAD: 1.5,   // a sample is "safe" only if no VOID/LEDGE cell within this radius
  LIFT_SPEED: 2.5, LIFT_DWELL: 4,
  Y_MIN: -60, Y_MAX: 120, // validator range (net clamps −100..300)
  CAM_CEIL_MARGIN: 0.4, CAM_MIN_CEIL_PITCH: 0.10,
} as const;
```

## 3. Data shapes (append-only additions to `src/types/dungeons.ts`; owner V1)

```ts
export interface DungeonDef { /* … */ vertical?: boolean; lifts?: LiftDef[]; }   // lifts are dungeon-level (they span rooms)

export interface RoomDef {
  /** Base floor height of the whole room, absolute metres (default 0). Only read when def.vertical. */
  floorY?: number;
  /** Clear height above the room's HIGHEST floor (metres). Absent ⇒ legacy 4 m geometry (§0.7). Halls 12–30. */
  ceiling?: number;
  /** Per-area floor overrides, applied in array order AFTER floorY (later wins). Rect in TILE coords, edges on 0.5-tile (2 m) multiples. */
  heightAreas?: HeightArea[];
  /** Stair / ramp strips, applied after heightAreas (later wins). */
  slopes?: SlopeDef[];
  /** Decorative, non-walkable upper structure (galleries, balconies, windows, colonnades…) — see §7.6. */
  tiers?: DecorTier[];
  /** Skip the lid? default false; true ⇒ open-air room (no ceiling cap, camera uncapped, sky backdrop). */
  openAir?: boolean;
}

export interface HeightArea {
  rect: TileRect;                       // tile coords, multiples of 0.5
  y: number;                            // ABSOLUTE floor height of the area
  rim?: 'rail' | 'ledge' | 'none';      // how a drop > STEP_UP to a LOWER neighbour is finished. default 'rail'
  floor?: FloorStyle;                   // optional floor style override for the area
  id?: string;
}

export interface SlopeDef {
  id?: string;
  kind: 'stairs' | 'ramp';
  rect: TileRect;                       // tile coords, multiples of 0.5; stairs/ramp run along `axis` across the rect
  axis: 'x' | 'z';
  yFrom: number;                        // absolute height at the MIN edge of the rect on `axis` (same convention as TownDef.stairs)
  yTo: number;                          // absolute height at the MAX edge
  style?: 'stone' | 'wood' | 'carpet';  // visual only
  color?: number;
}

export interface DecorTier {
  kind: 'gallery' | 'balcony' | 'colonnade' | 'windows' | 'beams' | 'ring';
  y: number;                            // ABSOLUTE height of the tier's walking surface / sill
  rect: TileRect;                       // footprint (gallery/balcony = slab; ring = rect border band of `depth` m)
  depth?: number;                       // metres, default 3 (slab depth for ring/balcony)
  count?: number; spacing?: number;     // windows / columns
  wall?: boolean;                       // balcony/gallery hugs a wall (no support columns)
}

export interface LiftDef {
  id: string;
  roomId: string;                       // owner room (for the map + validator)
  rect: TileRect;                       // platform footprint, ≥ 0.5×0.5 tile (2×2 m), multiples of 0.5
  stops: number[];                      // absolute heights, ≥ 2, ascending index = listing order
  speed?: number;                       // m/s, default VERT.LIFT_SPEED
  dwell?: number;                       // s idle at a stop before it may depart again, default VERT.LIFT_DWELL
  mode?: 'call' | 'auto' | 'script';    // call (default): host sends it when a player stands on the pad ≥0.6 s; auto: ping-pong; script: boss/gate hook
  start?: number;                       // initial stop index, default 0
}

export interface ZoneDef {  // additions
  /** void/pit/lava only. Absent ⇒ legacy solid hole. 'open' = walkable-for-physics VOID (players/knockback can fall), 'kill' = fall kills (scripted pit). */
  fall?: 'open' | 'kill';
  /** Void depth below the rim (m), default 9. Shaft visual bottom and VOID `groundY`. */
  depth?: number;
}
```
`ZoneDef.y` for `bridge`/`dais` in a `vertical` dungeon becomes a REAL deck height (absolute; absent ⇒ the room's floor at that cell). In a
non-vertical dungeon it keeps its legacy visual-only meaning (Q3). `PropPlacement.y` (offset) is unchanged in meaning but is now added to
`groundY(x,z)` instead of 0 (identical when flat).

Kit helpers (content owner, V3): `tall(room, ceiling = 6)`, `plateau(rect, y, rim?)`, `stairs(rect, axis, yFrom, yTo)`, `ramp(...)`, `lift(...)`.

## 4. Heightfield build — `src/world/Heightfield.ts` (new, pure TS, NO three.js import so `node tools/*.mjs` can import it; owner V1)

```ts
export interface Heightfield {
  W: number; H: number;                 // tiles
  zw: number; zh: number;               // 2 m cells = W*2, H*2
  floor2: Float32Array;                 // static floor per 2 m cell (void cell = rim − depth; lift cell = lowest stop)
  flags2: Uint8Array;                   // per 2 m cell: F.VOID | F.SLOPE | F.LOW | F.LIFT | F.LEDGE | F.RAIL
  slopes: BuiltSlope[];                 // analytic strips (world metres): {x0,z0,x1,z1,axis,yFrom,yTo,kind,treads}
  lifts: BuiltLift[];                   // {def, x0,z0,x1,z1, y (dynamic), stopIdx, state…}
  ceilTile: Float32Array;               // per TILE: absolute ceiling Y (Infinity for legacy / openAir); solid tiles = max of 8-neighbour rooms
  roomTop: Float32Array;                // per room index: absolute ceilY
  groundY(x: number, z: number): number;
  ceilingY(x: number, z: number): number;
  flagsAt(x: number, z: number): number;
  killY(x: number, z: number): number;  // y below which a falling actor at (x,z) has "fallen" (rim − VOID_KILL_BELOW; global min−12 elsewhere)
}
export const F = { VOID: 1, SLOPE: 2, LOW: 4, LIFT: 8, LEDGE: 16, RAIL: 32 } as const;
export function buildHeightfield(def: DungeonDef, tileRoom: (i: number, j: number) => number): Heightfield | null;  // null when !def.vertical
export function treadCount(yFrom: number, yTo: number): number;            // moved from TownBuilder, same body
export function treadTop(yFrom: number, yTo: number, i: number, n: number): number; // moved from TownBuilder, same body
```
Resolution order for a 2 m cell (all absolute metres), identical in builder, nav, validator and `groundY`:
1. `y = room.floorY ?? 0` of `tileRoom(floor(zi/2), floor(zj/2))` (no room ⇒ solid; skip).
2. each `room.heightAreas[]` in array order whose rect contains the cell (`floor(x0*2) ≤ zi < floor((x0+w)*2)`): `y = area.y`.
3. zones in `RoomDef.zones` order: `bridge`/`dais` with a defined `y` set deck `y` (vertical only); `void/pit/lava` with `fall` set F.VOID and
   `floor2 = rimY − (depth ?? 9)` where `rimY` = max floor of the 4 neighbouring non-void cells (computed after pass 1–2).
4. each `room.slopes[]` in order: cells fully inside the rect get `F.SLOPE` (flag only; the value is analytic, see below).
5. lifts: cells inside the pad get `F.LIFT`, `floor2 = min(stops)`.
6. rims (§5.3) — flags and solidity only, heights untouched.

`groundY(x,z)`:
```
if cell flags has LIFT  → lift.y (dynamic, §9)
else if inside a slope strip (last wins) → ramp: lerp(yFrom,yTo,u) ; stairs: treadTop(yFrom,yTo,i,n) with i = floor(clamp(u)*n), n = treadCount  (u along axis)
else floor2[cell]            // piecewise constant per 2 m cell; discontinuities are sealed by rails or are walkable steps ≤ 0.45
outside any room → 0
```
Stairs are sampled analytically (identical to TownBuilder.groundY) so the feet sit on the drawn treads; `nav` 1 m samples are just `groundY(centre)`.
`ceilingY`: `ceilTile[tile]`; **solid tiles** return the max of rooms within 2 tiles (so a camera backing into a wall is still capped by the room
the player is in). Legacy rooms and `openAir` return `+Infinity`.
Per-room ceilY = `max(floor over the room's cells incl. slopes ends & lift stops) + (room.ceiling ?? CEIL_LEGACY)`; legacy ⇒ `Infinity` for gameplay
(geometry still uses 4).

## 5. NavGrid changes — `src/world/NavGrid.ts` (core owner; V2)

### 5.1 New storage (all `null` for flat grids ⇒ zero cost, legacy paths untouched)
```ts
floor: Float32Array | null;   // 1 m resolution, floor[r*cols+c] = hf.groundY(centre) at build (lifts: min stop)
flags: Uint8Array | null;     // F bits per 1 m cell (copied from hf flags2 + rim pass)
region: Uint16Array | null;   // connected component id per standable cell (0 = none), §5.5
hf: Heightfield | null;       // dynamic lookups (lift y, slopes) — set by DungeonBuilder via nav.attachHeights(hf)
get vertical(): boolean;
attachHeights(hf: Heightfield): void;   // allocates floor/flags, fills them, runs rim pass (§5.3) and region flood (§5.5)
floorAt(x: number, z: number): number;  // = hf.groundY (dynamic lifts) or 0
flagsAt(x: number, z: number): number;
```
`cells` keeps its 0/1 meaning ("blocked/open for collision"). **A VOID cell is `cells=1` + `F.VOID`** — players and knockbacks can enter it
(so they can fall), but nothing that plans a walk may use it.

### 5.2 New / changed behaviour
- `isStandable(x,z)`: `cell>0 && !(flags&(VOID|LEDGE))`. **`isWalkable` is unchanged** (raw, used by cosmetics/spawn-fix) EXCEPT it must return
  false for VOID when `vertical` (so spawn fixes never place things in a pit). `nearestWalkable` and `randomNear` skip VOID/LEDGE cells.
- `raycast/lineOfSight` stay solid-only (VOID does not block sight or shots — chasms are see-through). `raycastY(ax,ay,az,bx,by,bz): number`
  (new): same DDA, but a **solid** cell blocks only if `y(t) ≤ floorAt(cell) + (flags&LOW ? LOW_RAIL : +∞)`; i.e. low rails/parapets are shot
  over, walls and pillars are not. Returns the blocked fraction like `raycast`.
- `walkLine(ax,az,bx,bz): boolean` (new, AI/steering LOS): samples every 0.25 cell; fails on solid, VOID, LEDGE, or a step violation
  between consecutive samples (rise > `STEP_UP`, or > `RAMP_PAIR` when either sample is SLOPE).
- `resolveMove(pos, prevX, prevZ, radius, feetY, airborne=false): boolean` (new): `resolveCircle`, then if `vertical`: sample the floor
  at `pos` and at the leading point `pos + dir·radius`; if `floor > feetY + (airborne ? AIR_STEP : STEP_UP)` revert the offending axis
  (try x-only then z-only = slide along cliffs); LIFT cells use their live y so an unaligned lift is an invisible wall. Flat grid ⇒ plain
  `resolveCircle`. Returns true on any collision.
- `findPath(from, to, maxNodes, opts?)`: neighbour allowed only if `cell>0`, not VOID/LEDGE, and `rise ≤ STEP_UP` (≤ `RAMP_PAIR` if either cell
  SLOPE); cost `+= |Δy|*0.5`; string pulling uses `walkLine`; waypoint `Vector3.y = floorAt` (was 0); the early `lineOfSight` shortcut
  becomes `walkLine`. If `region[start] !== region[goal]` return `null` immediately (cheap reject — avoids 6000-node searches to unreachable
  balconies). Lifts do NOT join regions (enemies never ride lifts).
- `regionAt(x,z)`, `sameRegion(a,b)` (new). `region` is computed once at build assuming all gates open and all doors carved.

### 5.3 Rim pass (the "no cliffs" guarantee) — `attachHeights`
For every open cell A (not VOID, not SLOPE, not LIFT) and each 4-neighbour B that is open, not VOID, not SLOPE, not LIFT, with
`floor[A] − floor[B] > STEP_UP + 1e-3` (A is the higher side):
`rim = area(A).rim ?? 'rail'`: `'rail'` ⇒ `cells[A]=0` and `F.LOW|F.RAIL` (a 1 m parapet band on the HIGH side; the low side stays fully usable);
`'ledge'` ⇒ A stays open with `F.LEDGE` (players may step off ⇒ controlled drop; AI treats it as blocked); `'none'` ⇒ untouched (validator
errors if the pair is on the critical path). A cell adjacent (4-nbr) to a SLOPE cell whose end height is within `STEP_UP` of A is NOT rimmed
(that is where the stair/ramp attaches). Doors: the carved door cells are never rimmed; validator E5 demands |Δ| ≤ STEP_UP or a slope there.
Rail cells draw as a low balustrade (§7.4). Result: the walkable graph never has an up-edge > 0.45 except slopes; `resolveMove` is the second line of defence.

### 5.4 Dynamic cells
Gate close/open (`DungeonGate`) and `PropHandle.hide/reveal` call `setCell` — unchanged; `floor/flags` are not touched by them.

### 5.5 Regions
Flood fill over standable cells with the A* edge rule (4- and 8-neighbour, no corner cutting), ids 1..65535. `region[]` also exported for the
map panel / validator.

## 6. World — `src/world/World.ts` (core; V2)

```ts
vertical = false;                              // set true by DungeonScene when built.hf != null
heights: { groundY(x,z): number; ceilingY(x,z): number; killY(x,z): number } | null = null;
groundY(x,z)    { return this.heights ? this.heights.groundY(x,z) : 0; }   // TownScene's per-instance override keeps working
ceilingY(x,z)   { return this.heights ? this.heights.ceilingY(x,z) : Infinity; }
sameLevel(a: { position: { y: number } }, y: number, tol = VERT.TOL_MELEE): boolean { return !this.vertical || Math.abs(a.position.y - y) <= tol; }
rayToGround(ray, out)                          // vertical: march 0.5 m from the plane-0 estimate, bisect 6×, first y ≤ groundY; flat: legacy plane (callers: ground-target aim)
// query height gate — NEW optional trailing params, ignored when !vertical:
actorsInRadius(pos, radius, filter?, y?: number | null, tol = VERT.TOL_MELEE)
enemiesInRadius(pos, radius, y?, tol?) / playersInRadius(...) / hostilesOf(team,pos,radius,y?,tol?)
actorsInCone(origin, dir, range, arc, filter?, y?, tol?) / actorsInLine(origin, dir, length, width, filter?, y?, tol?)
```
Gate = `Math.abs(a.position.y − y) ≤ tol` on **feet y** (a jumping player inside a 1.5 m apex stays well inside 2.5). When `y` is omitted the legacy XZ-only
behaviour is kept, so a missed call site is "legacy", never a crash. V11 passes `caster.position.y` / shape plane everywhere (§12).
`World.update` untouched. `DungeonScene` (V6) sets `world.heights = built.hf`, `world.vertical = !!built.hf`.

## 7. DungeonBuilder geometry (world owner; V4) — only when `hf != null`

### 7.1 Floors
`placeFloors`: tile y = `hf.floor2` at the tile / 2 m cell (uses the existing 4-tile / 4×2 m-tile layout; if a 4 m tile straddles two 2 m cells of
different height ⇒ lay the four 2 m tiles). Slope cells get no floor tile (replaced by the stair/ramp mesh). VOID cells: no floor (existing hole logic, `holeMask`).
`FloorStyle` per HeightArea overrides the room style for its cells.

### 7.2 Cliff faces and skirts
Where two adjacent 2 m cells differ by > 0.05 and are not separated by a wall edge: draw a vertical face quad (stone, `fadeable`, receives shadow)
from the lower to the higher top, plus on the HIGH side the rail balustrade (§7.4) or nothing for `ledge`. Floor of a room whose floor sits above the
neighbour room's floor: the wall (§7.3) starts at the LOWER floor so no gap shows under it.

### 7.3 Walls, ceilings, rock mass
Per wall segment (vertex arm): `base = min(floor of the walkable tiles around the vertex)` (walls hug the lowest side), `top = max(roomTop of the rooms
on both sides)` where `roomTop = ceilY` (legacy room ⇒ `floor+4`, i.e. unchanged 4 m piece). `H = top − base`; `N = max(1, round(H / 4))`; stack N pieces,
piece k at `y = base + k·H/N` with scale `[1, H/(4N), 1]` (stretch ≤ ±25 %, PSX texture tolerates it; `wall_corner/Tsplit/crossing/endcap` stack the same way).
Door lintels/gates (`makeLintel/makeGate`) sit at `doorFloor = max(floor of the two door tiles)`; gate height scales with the lower room's ceiling (clamp 4..8).
`buildRockMass` cap per solid tile at `y = max(3.86, ceilTile − 0.14)` of that tile (the same neighbour-room max used by `ceilingY`); far-plane ring at the global max cap.
Skylight shaft: `RoomDef.openAir` rooms get no cap over their tiles and use the sky backdrop (existing outdoor `OutdoorScenery.buildSky` is reused for the backdrop only).
Torches/wall decor (`wallSlots`, `placeTorchesAndWallDecor`, cobwebs at y=3.9) use `y = base + local`; add a second torch tier at `base + 0.6·H` for H ≥ 10 (every 3rd slot).

### 7.4 Rails, stairs, ramps
- **Rail balustrade** along RAIL cells: low wall (0.9 m posts + rail), `stone_dark`, one merged mesh per room (like `Zones.Mesher`), `userData.fadeable = true`.
- **Stairs**: `treadCount` treads, each a box (top = `treadTop`), run = rect length along axis, width = rect width; side stringers to the lower floor; reuse
  `psx-dungeon/stairs_*` GLBs ONLY for decor next to the strip, geometry itself is procedural so `groundY` and mesh always agree (same lesson as the town). `style:'carpet'` adds a
  thin coloured strip on the treads (replaces today's `bridge`-zone carpet hack in kefaret_salonlari).
- **Ramp**: one sloped quad strip + stringers; plank texture for `wood`.
- Both are `receiveShadow`, flagged `fadeable`, no collision meshes (collision is nav + analytic height).

### 7.5 Pillars, arches, scale from ceiling
`placeBigRoomPillars`: model height 4 m (verify with `tools/glb-inspect.mjs` — Open Q5). For a room with `ceiling`: `k = (ceilY − floor)/4`, scale `[sxz, k, sxz]`,
`sxz = clamp(0.9 + 0.12·(k−1), 1, 1.8)`, `blockCircle(0.85·sxz)`, `isAvoided` radius `1.4·sxz`. Halls with `ceiling ≥ 12` also get a second pillar ring pair + an arch/lintel
beam row at `top − 2` (instanced `barrier/…` beams, decor only). Pillar `y = groundY(wx,wz)`.

### 7.6 Decor at height (non-walkable, no nav, fadeable)
`RoomDef.tiers[]` build: `gallery`/`balcony` = slab (0.4 m thick, stone) at `y`, depth `depth ?? 3` along the rect border (`ring`) or the rect itself, balustrade on the open side, support
columns every 6 m down to `groundY` unless `wall:true`; `colonnade` = columns only; `windows` = window frame meshes with emissive glass (`count`, `spacing`) in the wall at `y`; `beams` = ceiling cross beams at `top − 1`.
Chandeliers/banners/statues are ordinary `PropPlacement` with `y` (offset from floor) — kit adds `PropPlacement.hang?: true` (chains up to the ceiling) and the placer clamps `y ≤ ceilY − floor − size`.
`PropPlacement.y` for ALL props: `finalY = groundY(x,z) + (p.y ?? 0)` (DungeonBuilder.addProp :1365). Props stand on heights; props on tiers use absolute `y` via `PropPlacement.absY?: number` (new, optional).
Budget: tiers are batched via `InstanceBatcher` (no new draw calls per piece); real PointLights stay in `LightPool` (MAX_REAL_LIGHTS unchanged); upper lights use `halo` only.

### 7.7 Lights/fog for tall rooms
`RoomDef.fog` (exists) is the knob; kit `tall()` sets `fog.far × 1.4` and lowers hemisphere intensity 10 % for H ≥ 12 so the volume reads. Moon (shadow) target follows the player `y` (ShadowFollow.ts owner: world, trivial).

## 8. Zones — `src/world/Zones.ts` (world; V5)

- `ZoneDef.fall` set on a blocked `void/pit/lava`: `ZoneField.state` stays 1 (hole, no floor) but `compute()` no longer calls `nav.setCell(…,0)` for those cells; the `Heightfield` marks them VOID (nav stays `cells=1`, flag VOID). Legacy zones (no `fall`) keep solid behaviour.
- Shaft visual bottom `SURFACE_Y = rimY − depth` (default −7 stays for legacy), side faces down to it; a faint rim glow / vfx as today; `kill` pits get a red rim decal.
- `bridge`/`dais` in vertical dungeons: deck slab top at its real height (`FLOOR_TOP` is added to `y`), re-opens nav cells (state 2) AND clears VOID on those cells; bridges get the existing rails (`addBridgeRails`) — rails are LOW cells? No: bridge rails are visual only; bridge edge cells next to VOID are open (that is how you fall off a bridge).
  A bridge ≥ 2 m wide, ≥ 1 m of deck margin on each side where it meets a bank (validator).
- Zone `hazard` (lava DoT): `Hazards.updateZoneDot` already uses `airborne = y − groundY > 0.8` — works with the heightfield; lava with `fall` unset keeps solid-hole semantics.

## 9. Lifts — new `src/world/Lifts.ts` (world; V5), driven by DungeonScene (V6)

```ts
export class LiftSystem { constructor(hf: Heightfield, host: { isAuthority(): boolean; players(): {x,z,y}[]; broadcast(key: string): void; now(): number });
  update(dt: number): void; handleMessage(key: string): void; yOf(id: string): number; }
```
- `BuiltLift.y(t)`: piecewise linear between `stops[from]` and `stops[to]` at `speed` (ease 0.35 s in/out), `y = stops[stop]` when idle. `hf.groundY` consults `lift.y` for LIFT cells so the local player, nav step rule, camera floor clamp and spawn code all see the moving floor.
- **Host-driven.** `mode:'call'`: host sees any alive player with feet on the pad (|y−lift.y|<0.6, inside rect) ≥ 0.6 s while idle ⇒ departs to the next stop (ping-pong). `auto`: ping-pong with `dwell`. `script`: `handleMessage('lift:id:go:N')` from boss scripts.
- **Wire** (existing `'gate'` channel, key string, `open:true`): `lift:<id>:<from>:<to>:<t>` on departure and every 2 s while moving/idle (`t` = seconds since departure; idle = `from===to`). Receivers (all peers incl. late joiners) reconstruct `t0 = now − t`. ≤150 ms error is acceptable (each peer simulates its own lift; the local player rides the local copy; remote riders are shown from `pstate.y`).
- A stopped lift at stop i must match an adjoining floor within 0.15 m (validator E6) so stepping on/off obeys the normal step rule; while the lift is mid-air the pad is an invisible wall to `resolveMove` for anyone not already on it.
- Enemies never path through LIFT cells; a knocked enemy standing on one just rides it. Lift pad mesh = thick slab with chains to the ceiling (decor), `userData.noFade`.
- Pad edges that are not a stop edge get a rail (LOW cells) so nobody walks off a moving lift; the pad never moves sideways, so a rider is never crushed.

## 10. Movement & physics (player/enemies)

### 10.1 Player — `PlayerController.ts` (player; V7)
Replace the relative jump integrator by an absolute one while keeping `jumpY` derived:
```
state: y (=p.position.y), vy, grounded, fallStartY
step(dt):
  gy = world.groundY(x,z)           // includes lifts
  if grounded:
     d = y - gy                     // >0 ground dropped, <0 ground rose
     if d <= 0:     y = gy                      // rise <= STEP_UP is guaranteed by resolveMove; the model's visual offset eases 30/s so stairs do not judder
     elif d <= 0.3: y = max(gy, y - 12*dt)      // stick to the ground (stairs down, descending lift)
     else:          grounded = false; vy = 0; fallStartY = y   // walked off a ledge / the lift dropped away
  else (airborne): vy -= GRAVITY*dt; y += vy*dt;
       head: if world.vertical && y + p.height > world.ceilingY(x,z) → y = ceil - p.height, vy = min(vy, 0)
       if y <= gy + AIR_STEP·(vy<0) && vy <= 0 → land(drop = fallStartY - gy)
  p.jumpY = max(0, y - gy); p.position.y = y;
```
Forced moves with `vy` (leaps): `y += fm.vy*dt` instead of `jumpY` (same behaviour on flat ground). `land(fallSpeed)` unchanged cosmetics + `FallHandler.onLand(drop)`.
Horizontal: `world.nav.resolveCircle(p.position, p.radius)` → `world.nav.resolveMove(p.position, ox, oz, p.radius, p.position.y, !grounded)` (flat ⇒ identical). `Actor.update` forced moves use the same (V9 owns Actor? No — see §19: Actor.ts belongs to V9). The ground-click target marker uses `rayToGround` (§6).
`tryJump` unchanged (can jump up ≤ ~1.4 m onto unrailed platforms: intended parkour; validator warns on a critical-path boundary with rise in (0.45, 1.4] and `rim:'none'`).
Soft/hard target selection (lines ~948–990): candidates with `|Δy| > 2.5` are skipped for soft targeting unless `nav.raycastY` from eye to chest is clear (hard target allowed if LOS clear).

### 10.2 Enemies — `Enemy.ts`, `EnemyAI.ts`, `Actor.ts` (enemies; V9)
- `Enemy.update`: replace `position.y = hover + bob` by `position.y = groundTarget + hover + bob` where `groundTarget` follows `world.groundY` with `damp(·,·,24,dt)` when rising ≤ STEP_UP, gravity fall (`vy −= 28.5·dt`) when ground drops > 0.4 or the enemy is over VOID (host authoritative). Flat worlds ⇒ `groundY=0` ⇒ unchanged.
- `Actor.update` forced-move: `resolveCircle` → `resolveMove(pos, ox, oz, radius, position.y)`; knockback may carry an actor into a VOID cell (flat worlds never have VOID).
- **Falling enemies** (host): in VOID & `y < killY` ⇒ `G.combat.fallKill(e)` (new, V11): trash/normal ⇒ dies ("Boşluğa düştü" log line, loot/forces as a normal kill, `killerId = lastDamager ?? null`); elite/rare/champion ⇒ takes 25 % max HP and is warped to `e.lastSafe` (AI records a standable position every 0.5 s) with threat kept; bosses/ccImmune cannot be knocked (existing rule) and never fall.
- Enemy `lastSafe` = last position with no VOID/LEDGE cell within `SAFE_EDGE_PAD`.

### 10.3 Remote players — `Player.updateRemote` already uses `o.y` and derives `jumpY` from `groundY`. No change except the extrapolation branch keeps `o.y = last.y` (acceptable). Interpolator `SNAP_DIST` stays XZ-only; a fall→respawn teleport is > 7 m ⇒ snaps. For vertical teleports under 7 m XZ with Δy > 3 add `|c.y − a.y| > 3 ⇒ snap` (Interpolator.ts, net owner, in V12).

## 11. Falls and drops (player) — new `src/game/FallHandler.ts` (player; V7)

Pure class owned by PlayerController, one per local player; ticked after `stepVertical`.
- **Safe history**: every 0.1 s while `grounded && flags(x,z) & (VOID|LEDGE|LIFT)==0` and no VOID/LEDGE within `SAFE_EDGE_PAD` ⇒ push `{x,z,y,t}`; keep `SAFE_HIST_SEC`. Respawn point = newest sample with `age ≥ SAFE_BACK_SEC`, else the dungeon checkpoint (`DungeonScene.checkpoint`).
- **Void fall**: trigger when the actor is over a VOID cell (or `y < world.heights.killY`) and `y < rimY − VOID_KILL_BELOW`. Effects: black fade 0.35 s (`G.events.emit('screen:fade', {to: 1, dur: 0.35})` — new append-only event, hud owner; unknown ⇒ no-op), `G.combat.hitLocalPlayer({ amount: maxHp·VOID_DMG_FRAC, type:'physical', unavoidable:true, blockable:false, abilityName:'Düşüş', lethal:false })`. **Non-lethal**: damage is clamped so HP ≥ 1 (`lethal:false`, new optional field on the hit payload, combat owner). `ZoneDef.fall:'kill'` ⇒ `lethal:true` (counts as a death for M+ like any death). Then `controller.teleport(safe.x, safe.z, yaw)` (sets y from groundY, zeroes vy, clears forced moves), `invulnerable` 1 s, fade back 0.3 s, toast "Düştün! (−%25 CAN)".
- **Ledge/hard landing**: on `land(drop)`: `drop ≤ FALL_FREE` free; `FALL_FREE < drop ≤ FALL_RESPAWN_DROP`: damage `min(0.24, (drop − 4)·0.03)·maxHp`, non-lethal, camera punch + dust scaled; `drop > FALL_RESPAWN_DROP` ⇒ treated like a void fall (respawn). Dodge i-frames do not cancel fall damage; `jump` landing from ≤ 1.5 m never costs.
- Release/respawn (`scenes/respawn.ts`) and `PlayerController.teleport` already set `y = groundY` ✓ (no change).
- Falls are local to the owner peer (HP lives on the owner); other peers see the `pstate.y` plummet then a snap. No new channel.

## 12. Combat height rules (combat; V10 + V11)

Rule table (CORE_MECHANICS §13 made precise). `Δy` = |feet y of target − reference y|.

| Case | Reference y | Rule |
|---|---|---|
| Player melee cones/arcs/lines, auto-attack chain, cleaves, `actorsIn*` from skills | caster `position.y` | `Δy ≤ 2.5` (TOL_MELEE). A target on the balcony above is out of reach; one on the lower floor 2.4 below is hit. |
| Player ground AoE (circle at aim/target point) | `groundY(aim)` plane (not the cursor ray height) | `Δy ≤ 2.5`. Aim point resolves by `rayToGround` (§6). |
| Player projectiles | live projectile y | passes if `|proj.y − (e.y + e.height/2)| ≤ e.height/2 + radius + 1.0`; ends on `nav.raycastY` solid hit or when `proj.y < groundY + 0.2` (new optional `Projectile.dirY` slope toward the target chest, clamp ±0.6, set at spawn from caster→target when `world.vertical`). |
| `target_instant` / `target_projectile` (CM §10.2) | eye → chest | requires `nav.raycastY` clear (LOS) + XZ range; **melee instants (range ≤ 5 m) also require Δy ≤ 2.5**; else cast fails "Menzil dışında". |
| Enemy `HitShapes` (cones, circles, rects, rings, persist ticks) | plane `groundY(ox,oz)` at land/tick time (**ignore `origin[1]`**: most specs pass 0) | local player is hit only if `|lp.position.y − plane| ≤ spec.vert ?? 2.5`. New optional `HitShapeSpec.vert?: number \| 'free'` (`'free'` = room-wide boss mechanics: soak/safe rings/pulses keep legacy XZ-only; used by bosses that must not be dodgeable by standing on a ledge). |
| Enemy hostile projectiles | live y | same cylinder test vs local player; ends on `raycastY`. Flying enemies (`def.flying`) shoot with their real y. |
| Hazard zone DoT (`Hazards`) | — | unchanged (`airborne` > 0.8 over ground skips). |
| Knockback | XZ vector | unchanged; stepping into a ledge/void ⇒ drop (players) / `fallKill` (enemies). `resolveMove` stops knockback at cliffs/rails. |
| Heal/buff/party effects | caster `y` | `Δy` not applied (supports are not height-gated; LOS only for targeted heals as today). |
| `PackWatch`/aggro/leash | — | aggro radius is XZ; a pack **below or above** a different level (`!sameRegion`) with no LOS never aggroes (EnemyDirector/PackWatch use `nav.regionAt` equality OR `raycastY` LOS). |

Implementation notes: `HitShapes.resolve()` gates before `contains`; the pure static `HitShapes.contains` signature is unchanged (AI shares it). `Combat.fallKill(e)` and the `lethal?:boolean` hit option are new, append-only. Call-site audit list for V11: `Combat.ts` (cleave/riposte :430 region), `procActions.ts`, `skills/behaviors.ts`, `skills/utilities.ts`, `SkillSystem.ts`, `specials.ts`; V12 owns `systems/Affixes.ts` (bursting/volcanic use `actorsInRadius` — pass `y`).

## 13. AI pathing (enemies; V9)
- `steerTo`: replace `nav.lineOfSight(...)` (movement LOS) by `nav.walkLine(...)`; `findPath` as §5.2. Waypoints now carry `y`; `applyMove` ignores it (ground-follow does the y).
- **Unreachable target** (`!nav.sameRegion(e, target)` or `findPath` null): melee/charge units hold position at the closest standable cell **in their own region** to the target (`nearestWalkable` filtered by `region===own`), face the target, and after `NOPATH_LEASH = 6 s` without a path or LOS evade (existing evade/reset-to-home flow). Ranged/caster units keep casting if `raycastY` LOS and range hold (they never move to unreachable cells). Bosses never leash by height (they may be on a platform: BossController arenas must be a single region; validator E6).
- Pack patrol waypoints must be in one region (validator).
- Perf: `region` early-out removes the worst-case A* (6000 nodes); `walkLine` samples at 0.25 cell like `raycast`; `losAt` 0.2 s throttle unchanged; `dir.pathBudget` unchanged.
- Avoid spawn in VOID/LEDGE: DungeonScene spawn fix uses `nearestWalkable` (now height-flag aware).

## 14. Camera — `ThirdPersonCamera.ts` (player; V8) + `OccluderFade.ts` (no change needed)

Add inputs: `world.ceilingY` (cap), `world.groundY`, `world.vertical`. All additions are no-ops when `!world.vertical`.
1. **Cap**: `cap = world.ceilingY(pivot.x, pivot.z) − CAM_CEIL_MARGIN` (min with `ceilingY(camXZ)` when the camera tile is walkable; solid tiles use the pivot's cap).
2. **Pitch limit**: `pitchCeil = asin(clamp((cap − pivot.y)/zoomCur, −1, 1))`; `this.pitch = clamp(this.pitch, minPitch, min(MAX_PITCH, max(pitchCeil, CAM_MIN_CEIL_PITCH)))` (replaces the up-limit when below MAX_PITCH).
3. **Zoom limit** (WoW "zoom in under low ceilings"): if even at `CAM_MIN_CEIL_PITCH` the camera is above `cap` ⇒ `dMax = (cap − pivot.y)/sin(CAM_MIN_CEIL_PITCH)`; effective distance `fracCeil = clamp(dMax/zoomCur, MIN_DIST/zoomCur, 1)`, merged: `frac = min(fracNav, fracProp, fracCeil, fracGround)` and run through the existing `colFrac` hold/ease machinery (pull in instantly, ease out 4/s).
4. **Per-room zoom ceiling (§12)**: `zoomMaxRoom = clamp((cap − pivot.y)·2.2 + 2, 5, 18)`; `zoomTarget` is clamped to `zoomMaxRoom` and eased (damp 4/s) so entering a crypt corridor smoothly shortens the allowed zoom and leaving restores the player's zoom (the player's setting `zoomTarget` is not overwritten, only the effective maximum).
5. **Floor/terrain along the ray**: sample 8 points on the pivot→camera segment; first with `ray.y < groundY(sample) + 0.35` ⇒ `fracGround = (k/8) − 0.04` (so the camera never ends inside a plateau/cliff seen from below). Existing floor clamp (`groundAt(_pos)+0.35`) stays as the last resort.
6. **Wall ray vs. low rails**: `collideMaxRayHeight` logic extended: a solid hit with `flags & LOW` never blocks the camera (rails are looked over); tall solid still blocks/fades.
7. Open-air rooms (`openAir`) ⇒ cap = +∞ (legacy). Death cam / boss intro (cinematic) frames ignore the cap but keep floor clamp.
8. Tier meshes (galleries/windows/beams) and rail/face meshes are `fadeable` ⇒ `OccluderFader` handles them (no camera pull for decor). Lift pads/chains: `noFade`.
Telemetry: add `capY`, `fracCeil` to `debugStats()`.

## 15. Net / replication
- **Players**: `PlayerSyncState.y` already replicated and clamped (−100..300) — floors must satisfy `VERT.Y_MIN..Y_MAX` (validator E2). Add `|Δy| > 3 ⇒ snap` to `Interpolator` (V12).
- **Enemies**: clients derive `y = groundY(x,z) + hover` locally (no wire cost). For airborne/falling/leaping enemies the host sets `EnemySyncState.y?: number` (only when `|y − hover − groundY| > 0.3`); `net/codec.ts` encodes it as element 12 with new flag bit 16, decode only if `a.length ≥ 13`; old peers ignore (append-only). `Enemy.applySyncState` pushes `y: s.y ?? NaN` and `updateRemote` uses `y = isNaN ? groundY+hover : o.y` (V9 owns Enemy.ts, V12 owns codec.ts/Interpolator.ts).
- **Hit shapes**: replicated spec unchanged (`origin[1]` ignored, plane re-derived on every peer from the same heightfield); `vert` field optional.
- **Lifts**: `'gate'` channel keys `lift:…` (§9); late joiners get the 2 s repeat. Dungeon seeds/params unchanged ⇒ identical heightfield on every peer by construction.
- **Falls**: local; no message. `pdeath` only for lethal pits.
- `guard.ts` / `messages.ts`: V12 verifies the snap/pstate guards accept `y` ranges and the 13-element enemy tuple.

## 16. Spawns, loot, props, scene wiring
- `DungeonScene` (V6): after `buildDungeon`: `world.heights = built.hf; world.vertical = !!built.hf;` create `LiftSystem` and `world.addSystem(lifts)`; handle `'gate'` keys starting `lift:` next to the existing `hz:` branch (`DungeonScene.ts:831`); spawn code already calls `world.groundY` (player, enemies :426/:545, waypoint :524, doors :621, portal :909, chest :937) ⇒ correct automatically once `groundY` is real; `spawnExtras/ZoneEvents/PropGameplay` already sample `groundY` (PropGameplay :204,:303). Start/respawn use `nearestWalkable` (flag-aware).
- Boss/pack/`extras` tile coords are 2-D; **y always comes from groundY**. Packs whose center is VOID/rail ⇒ validator error.
- `LootSystem.dropAt` (items owner, V12): spot `y = world.groundY(spot)` and scatter spots filtered by `isStandable`; `LootDrop.restY` relative to the origin y. Pickup radius uses 3-D distance when `vertical` (a chest on a balcony 6 m above is not auto-looted from below): `hypot(dx,dz) ≤ r && |dy| ≤ 2.5`.
- `BuiltDungeon` gains: `hf: Heightfield | null; groundY(x,z); ceilingY(x,z); lifts: LiftSystem | null; roomTop(roomIdx)`.
- Nameplates/HUD/map: map panel (panels-game) later may shade by height (out of scope; `nav.floor` is exposed).

## 17. Migration & compatibility
1. Flat dungeons: `vertical` unset ⇒ `buildHeightfield` returns null ⇒ `nav.floor === null`, `world.vertical === false`; every new code path is guarded; golden check: `node tools/content-check.mjs` identical output before/after V1–V13 (diff the report).
2. `ZoneDef.y` on dais/bridge keeps legacy visual meaning until a dungeon opts in (Q3).
3. `TownBuilder`: replace the local `treadCount/treadTop` by imports from `world/Heightfield.ts` (identical bodies) — V1; town groundY/raised logic untouched.
4. Existing dungeon docs that fake height (kefaret_salonlari "wallScale P11", tall pillars, stair props) migrate later by content packages, not here. `RoomDef.wallScale` is NOT added; `ceiling` replaces it.
5. Legacy `PropPlacement.y` still means "height offset"; in vertical dungeons it adds to the floor; `absY` for tiers.
6. `EnemySyncState.y`, `HitShapeSpec.vert`, `Projectile.dirY`, hit payload `lethal`, event `screen:fade`, `nav.*` new methods: all optional/append-only per ARCHITECTURE golden rule 2.
7. Open-world / `outdoor` dungeons and town ignore all vertical fields in v1 (validator warns if set). Terrain heights for the open world are a separate spec.
8. Save compatibility: nothing is persisted.

## 18. Demo room set — `dev_height` (src/dev/heightDemo.ts, V3), loaded by `dev/world.html?dungeon=dev_height&nav=1`

Grid `{ w: 56, h: 52 }`. `vertical: true`. Tile rects `x,z,w,h`. Floors absolute metres. Theme: reuse the dev test dungeon theme from `src/dev/world.ts` (`testDungeon`).

| id | rect | floorY | ceiling | features | what it tests |
|---|---|---|---|---|---|
| `h_entry` | 2,26,8,6 | 0 | 6 | start (tile 5.5, 29), flat | flat parity, spawn |
| `h_stairs` | 10,26,14,6 | 0 | 8 | `heightAreas:[{rect:{x:18,z:26,w:6,h:6}, y:3.2}]`; `slopes:[{kind:'stairs', rect:{x:16,z:27,w:2,h:4}, axis:'x', yFrom:0, yTo:3.2}]` | stairs (12 treads, 8 m run, tread depth 0.67), plateau rim rails on its west edge (x = tile 18) beside the stair strip (z tiles 26..27 and 31..32), AI path via stairs, ceiling 11.2 |
| `h_bridge` | 24,24,16,10 | 3.2 | 14 | `zones:[{kind:'void', blocked:true, fall:'open', depth:9, rect:{x:26,z:25,w:12,h:8}}, {kind:'bridge', rect:{x:26,z:29,w:12,h:1}}]` | chasm, 4 m bridge, open edges ⇒ fall (−25 % HP, respawn on bridge entry), no-rail visuals, camera over a void |
| `h_hall` | 40,20,14,18 | 3.2 | 22 | `heightAreas:[{rect:{x:44,z:26,w:6,h:6}, y:4.4}]`, `slopes:[{kind:'ramp', rect:{x:43,z:27,w:1,h:4}, axis:'x', yFrom:3.2, yTo:4.4}]`, `zones:[{kind:'pit', fall:'kill', depth:9, rect:{x:41,z:35,w:2,h:2}}]`, `tiers:[{kind:'ring', y:12, rect:{x:40,z:20,w:14,h:18}, depth:3}, {kind:'windows', y:15, rect:{x:40,z:20,w:14,h:1}, count:5, spacing:2.5}, {kind:'colonnade', y:12, rect:{x:41,z:21,w:12,h:16}, count:6}]` + 2 chandeliers (`hang`) | tall hall (ceiling top 25.2), pillars scale, galleries as decor (walk under gallery, not onto it), dais ramp 0.3 grade, kill pit |
| `h_lift` | 40,8,14,12 | 3.2 | 16 | `heightAreas:[{rect:{x:40,z:8,w:14,h:3}, y:9.2, rim:'ledge'}]`; `lifts` (dungeon-level): `{id:'h_lift_1', roomId:'h_lift', rect:{x:46,z:11,w:1,h:1}, stops:[3.2, 9.2], mode:'call'}` | lift sync, ledge drop (6 m ⇒ 9 % max HP), balcony archers unreachable by melee, chest on balcony |
| `h_low` | 46,38,2,8 | 3.2 | 3.0 | `slopes:[{kind:'ramp', rect:{x:46,z:44,w:2,h:2}, axis:'z', yFrom:3.2, yTo:-2.4}]` | camera ceiling clamp (3 m room), 0.7 grade ramp, corridor 8 m wide |
| `h_sunken` | 42,46,14,6 | -2.4 | 8 | flat, a `pool` zone decor | below-ground floor, camera floor clamp, region connected via ramp |

Doors (`DoorDef`, tile in room `a`): `h_entry→h_stairs (9,29,'e',w2)`, `h_stairs→h_bridge (23,29,'e',w1)` (both floors 3.2 at x=23: plateau side), `h_bridge→h_hall (39,29,'e',w1)`, `h_hall→h_lift (46,20,'n',w2)`, `h_hall→h_low (46,37,'s',w2)`, `h_low→h_sunken (46,45,'s',w2)`. Exit portal in `h_sunken` (tile 48, 49). Boss: none (a dummy `training_dummy` pack in `h_hall` center).
Packs: `p_stairs` melee ×3 on the plateau (must walk down the stairs to reach the player standing on the lower floor); `p_under` melee ×3 on `h_lift` lower floor (47,15); `p_archers` ranged ×2 on the balcony (44,9.5) (player below: they shoot, melee under them cannot reach; player on the balcony: ranged hit melee on the lower floor only if Δy ≤ 2.5 ⇒ NOT, balcony is 6 m up); `p_edge` melee ×2 next to the void on `h_bridge` bank (knockback skill ⇒ enemies fall); `p_dais` ranged ×2 on the dais (Δy 1.2: hit freely).

**Headless assertions** (`tools/height-check.mjs dev_height`, exit code 1 on fail) — `groundY(world metres)`:

| point (world x,z) | expected |
|---|---|
| (24, 116) `h_entry` | 0 |
| (65, 116) first stair tread (strip x 64..72, 12 treads) | `treadTop(0,3.2,0,12)` = 0.267 |
| (71.9, 116) last tread | 3.2 |
| (84, 116) plateau | 3.2 |
| (128, 118) bridge centre (strip x 104..152, z 116..120) | 3.2 |
| (128, 106) inside the void (void x 104..152, z 100..132) | 3.2 - 9 = -5.8, flag VOID |
| (168, 116) hall floor | 3.2 |
| (174, 116) dais ramp midpoint (ramp x 172..176) | 3.8 |
| (188, 116) dais top | 4.4 |
| (188, 38) balcony (x 160..216, z 32..44) | 9.2 |
| (186, 46) lift pad (x 184..188, z 44..48) at stop 0 | 3.2 (after the call: 9.2 at about 2.4 s plus ease) |
| (188, 160) `h_low` corridor | 3.2 |
| (188, 183.9) end of the ramp (z 176..184) | -2.4 |
| (196, 196) `h_sunken` | -2.4 |

Also: no open 4-neighbour pair with |Δ| > 0.45 outside slopes/ledge/lift (E3); region(start) == region(every pack except `p_archers`/`p_lift`-balcony); `p_archers` balcony is its own region; ceilingY(hall) = 3.2+22 = 25.2; ceilingY(low) = 3.2+3 = 6.2; all rails present around the plateau and the dais; lift stop heights match adjacent floors within 0.15.

Manual playtest script (V13 QA, one pass): see §19 W5.

## 19. Haiku packages — file-disjoint waves of ≤3, with verification

Process (user policy): ≤3 coders per wave, no per-agent browser tests, after each wave a Sonnet review of the diff, orchestrator spot-check, then Haiku fixes; ONE Haiku browser QA at the end. Every package: `npx tsc --noEmit` clean in its files; legacy parity (`node tools/content-check.mjs` same report as before the wave); packages only edit the files they own (new files listed), report public API added.

### Wave 1 — foundations (no cross-dependencies; contracts are the signatures in §3–§5)
| Pkg | Owner files | Work | Verify |
|---|---|---|---|
| **V1** | `src/types/dungeons.ts` (§3 additions), NEW `src/world/Heightfield.ts` (§2 `VERT`, §4 API, `treadCount/treadTop`, ceilings, slopes, lift data), `src/world/TownBuilder.ts` (ONLY swap the two local fns for imports) | types + pure heightfield builder + `tileRoom` callback style (no three import) + `KIT` helpers? (no, V3) | `node --experimental-strip-types -e` import test; `tsc`; town `groundY` outputs unchanged (spot-check 5 stair points before/after); `content-check town` unchanged |
| **V2** | `src/world/NavGrid.ts`, `src/world/World.ts` | §5 (floor/flags/region, `attachHeights`, rim pass, `isStandable`, `raycastY`, `walkLine`, `resolveMove`, `findPath` rules, regions), §6 (`vertical`, `heights`, `groundY`, `ceilingY`, `sameLevel`, `rayToGround`, query y params) | unit script `tools/nav-vert-check.mjs` (new, V2 owns) building a 10×10 grid by hand: stairs path exists, cliff rejected, rail band, VOID not pathable, region split, `raycastY` over LOW; flat grid benchmark identical results to old code on the existing dev test dungeon nav |
| **V3** | `src/dev/heightDemo.ts` (new), `src/data/dungeons/kit.ts` (helpers `tall/plateau/stairs/ramp/lift`), `src/dev/contentCheck.ts` (validator E1–E10 of §17 list; NavMask unchanged for legacy), `tools/height-check.mjs` (new; imports heightDemo + Heightfield, prints the §18 assertions) | demo def per §18; validator rules; headless assertion tool | `node tools/height-check.mjs dev_height` all PASS once V1 lands (V3 may stub Heightfield import behind try/catch until then; final run after wave) ; `node tools/content-check.mjs` legacy unchanged |

### Wave 2 — building the geometry and wiring the scene (needs W1)
| Pkg | Owner files | Work | Verify |
|---|---|---|---|
| **V4** | `src/world/DungeonBuilder.ts` (+ new `src/world/VerticalGeo.ts` for stairs/ramps/rails/cliff faces/tiers meshes) | §7 floors/walls/ceiling/rock mass/pillars/tiers/props y; builds `hf`, `nav.attachHeights(hf)`, `BuiltDungeon.{hf,groundY,ceilingY,roomTop}`; legacy path untouched behind `if (!hf)` | tsc; `dev/world.html?dungeon=dev_height&nav=1` loads (headless QA later), rails/wall counts via `height-check`; legacy dungeons build byte-identical instance counts (log `batcher` totals before/after on kemik_mahzeni) |
| **V5** | `src/world/Zones.ts`, NEW `src/world/Lifts.ts` | §8 zones (`fall`, `depth`, decks at real y, no solid for `fall` holes), §9 `LiftSystem` + pad mesh | tsc; lift unit test inside `tools/height-check.mjs`? (V3 owns) — V5 adds `tools/lift-check.mjs` simulating y(t), message round-trip |
| **V6** | `src/scenes/DungeonScene.ts` | §16 wiring: `world.heights/vertical`, `LiftSystem` add + `gate` handler (`lift:`), spawn parity, checkpoint unaffected | tsc; grep shows no direct `y=0` spawn left; legacy dungeons enter normally (QA later) |

### Wave 3 — actors & camera (needs W2 API)
| Pkg | Owner files | Work | Verify |
|---|---|---|---|
| **V7** | `src/game/PlayerController.ts`, NEW `src/game/FallHandler.ts` | §10.1 absolute y physics + `resolveMove` + head clearance, soft-target height filter; §11 falls/drops/safe history, `screen:fade`, non-lethal hit | tsc; `tools/` pure test of FallHandler safe-history & drop-damage table (V7 adds `tools/fall-check.mjs`); flat parity: jump apex/landing numbers identical in `dev/player.html` telemetry |
| **V8** | `src/camera/ThirdPersonCamera.ts` | §14 | tsc; `debugStats` shows `capY`; `dev/player.html?camdebug=1` on a flat map unchanged |
| **V9** | `src/entities/Enemy.ts`, `src/entities/Actor.ts`, `src/ai/EnemyAI.ts` (+ `src/ai/EnemyDirector.ts` if the region test lives there) | §10.2 ground-follow/gravity/`lastSafe`, `Actor.update` → `resolveMove`, `EnemySyncState.y?` + `applySyncState/updateRemote`, §13 pathing/leash | tsc; enemy y stays 0 on flat dungeons (assert in dev/enemies); `steerTo` uses `walkLine` only when `nav.vertical` |

### Wave 4 — combat, net, tooling wiring (needs W3)
| Pkg | Owner files | Work | Verify |
|---|---|---|---|
| **V10** | `src/combat/HitShapes.ts`, `src/entities/Projectile.ts` | §12 shape plane + `vert`, projectile `raycastY`/cylinder test/`dirY`/ground cull (all `if (world.vertical)`) | tsc; flat parity (shapes still hit at y=0 specs); unit: `HitShapes.contains` unchanged |
| **V11** | `src/combat/Combat.ts` (`fallKill`, `lethal`), `src/combat/SkillSystem.ts`, `src/combat/procActions.ts`, `src/combat/skills/behaviors.ts`, `src/combat/skills/utilities.ts`, `src/combat/specials.ts` | pass `y` to every `actorsIn*` call (16 sites, list in §12), melee instants height gate, LOS via `raycastY`, `Projectile.dirY` at spawn | tsc; `rg "actorsIn(Radius|Cone|Line)|enemiesInRadius|playersInRadius|hostilesOf" src` shows every call passes `y` or a justified `// y-free` comment |
| **V12** | `src/net/codec.ts`, `src/net/guard.ts`, `src/entities/Interpolator.ts`, `src/systems/Affixes.ts`, `src/systems/LootSystem.ts`, `src/entities/LootDrop.ts`, `src/dev/world.ts` (register `dev_height` in the dungeon list + `?dungeon=dev_height`, nav overlay height tint) | §15 codec element 12/flag 16 round-trip (`tools/` test), Δy snap, loot on heights + 3-D pickup, Affixes y, dev page wiring | tsc; encode/decode round-trip test with and without `y`; old 12-element tuples still decode |

(V11 and V12 each touch ≤ 6 files and none overlap with V10; `Affixes.ts` moved to V12 to keep V11 inside combat.)

### Wave 5 — QA (single Haiku, per user policy)
**V13 QA** (browser, `dev/world.html?dungeon=dev_height`, offline): walk the checklist and report PASS/FAIL with console errors:
1. start → walk stairs up/down (no sticking, no sinking, camera calm), run diagonally into the plateau rail (blocked), jump toward the rail (blocked).
2. bridge: cross; step off the open side ⇒ fade, −25 % HP, back on the bridge entry, invulnerable 1 s; HP never < 1.
3. kill pit in the hall ⇒ lethal path (dies); release works at the checkpoint.
4. dais ramp; stand on the dais, hit a dummy on the hall floor (Δy 1.2 hits); stand on the balcony and cast a melee cone at an enemy below 6 m (misses); cast a ranged skill (hits only with LOS).
5. lift: step on, ride up, step off onto the balcony; second player/host-client check optional (offline: one session).
6. ledge: jump off the balcony south edge ⇒ lands on the lower floor with ~9 % damage; jumping 1.2 m onto an unrailed block works.
7. low corridor: camera lowers/zooms in smoothly, never inside the ceiling; ramp to the sunken room.
8. enemies: `p_stairs` come down the stairs; `p_under` cannot hit the balcony; `p_archers` shoot from the balcony; `p_edge` knocked into the void die and drop loot.
9. legacy regression: enter kemik_mahzeni and the town; compare fps and look to before (no console errors).
Then Sonnet diff review; fixes by Haiku if needed.

## 20. Open questions (decisions needed from the owner)
Q1. Default ceiling: §13 says 6 m; this spec keeps legacy 4 m when `ceiling` is absent (nothing moves) and 6 m via `tall()`. OK, or should all `vertical` dungeons default to 6?
Q2. Falls non-lethal by default (HP ≥ 1) and lethal only for `fall:'kill'`. Should a fall inside M+ also cost the usual death penalty (timer −5 s) or only the lethal pits?
Q3. `ZoneDef.y` on dais/bridge: real height only in `vertical` dungeons (opt-in). Fine, or convert all existing dais `y:2` content now?
Q4. Unrailed platforms up to ~1.4 m are jumpable (feet-based step rule). Intentional parkour/skip risk, or force `rail` on every critical-path drop > 0.45?
Q5. Wall/pillar pieces are stretched in Y (≤ ±25 %) and pillars assumed 4 m tall; confirm with `glb-inspect` and the art owner (stack-only alternative if stretch looks bad).
Q6. Lift client latency: each peer simulates the lift from a host message (≤150 ms error). Acceptable, or promote lifts to a replicated state with host time sync?
Q7. Soft-lock safety: a player lured/knocked onto an enemy-unreachable ledge region where the dungeon does not continue — the respawn "safe history" handles falls; should there also be a free "Sıkıştım" teleport to the last checkpoint (cooldown)?
Q8. Camera must not clip gallery/colonnade meshes: they fade (decor). Confirm this is acceptable rather than collision-pulling the camera.
Q9. Open world (`sisli_vadi`, outdoor) keeps flat terrain here; a terrain heightfield (Terrain.ts) is a separate spec — schedule?
