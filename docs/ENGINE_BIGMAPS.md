# ENGINE_BIGMAPS: 2-4 km open-world zones

Status: engine work (world module). Goal: zones as big as Metin2 (1-2 km) and Knight Online (about 4 km) maps. Sisli Vadi is 640 m.
Read with `docs/GDD_OPENWORLD.md` §1.5 (the 640 m performance strategy this builds on) and `docs/ENGINE_VERTICALITY.md`.
Numbers marked *sim* come from `dev/combat-sim/bigmap.mjs` (headless, no GL, stub assets): re-run it after changing anything here.

```
node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/bigmap.mjs        # 68 checks, exit 1 on failure
```

## 1. Summary

* A zone larger than 800 m (`WorldPerf.stream` = `'auto'`) now **streams**: ground and scenery are split into 64 m chunks that are built
  when the player gets within `viewM` (widest region fog far + 64 m, 119-164 m with Sisli's region fogs) and freed again beyond `viewM` + 32 m.
  Resident visual chunks are bounded by the ring area (81 at most with the defaults), never by the zone size.
* Sisli Vadi (640 m) keeps the **classic path unchanged** (one terrain mesh, everything built at load). `?stream=1` in the page URL forces
  the streamed path on it for testing, `?stream=0` forces the classic path on a big zone.
* `NavGrid` stays one dense 1 m grid (so `world.nav.raycast`, `nearestWalkable`, `findPath`, the minimap and `world.groundY` are
  untouched). Its base layer is filled by a row-wise routine (`world/NavBase.ts`) and the trunks / rocks of the generated chunks are
  written onto it as chunks come into range.
* Chunk content is a **pure function of the zone data and the chunk coordinates**, so host and clients build the same trees and the
  same colliders in any order and at any time (proved by the sim: opposite orders, two peers on different walks).
* Camps were already streamed (activate 70 m, deactivate 110 m); the camp tick now only visits camps that can act (active, waiting for
  their respawn timer, or near a player), found through a bucket index.
* Content authors set the zone size in the layout JSON (`zone.sizeM`, section 6).

## 2. Audit: hard and soft limits

Zone edge 640 m (Sisli Vadi) / 2,048 m / 4,096 m = 160 / 512 / 1,024 tiles; 1 tile = 4 m; line numbers are in the tree after this change.
"HARD" = breaks or silently loses content. "SOFT" = costs grow, still works.

| # | Limit | Where | 640 m | 2 km | 4 km | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Terrain is one mesh of half-size 480 m** (map + 160 m on each side only for a 640 m map): no ground beyond it | `WorldDecor.ts:525` (`half: 480`), `Terrain.ts:190` | covers | **ground ends 480 m from the centre** | same | HARD (classic path). Streamed path: one quad per chunk, no size limit |
| 2 | Splat map max 2048 px for the whole zone, 1 splat for everything | `Terrain.ts:50`, `WorldDecor.ts:525` (`splatRes: 2048`) | 0.31 m/px | 1.0 m/px | 2.0 m/px (a 3.4 m road is 1.7 px) | SOFT, quality. Streamed: 128 px per 64 m chunk = 0.5 m/px at any size |
| 3 | Splat painting visits every pixel of every op's bounding box (a long diagonal road is a huge box) | `Terrain.ts:63-86` | *sim*: 4.9 M visits, 615 ops | 4.8 M, 6.5k ops | 5.3 M, 26k ops | SOFT: the 2048 px cap keeps the cost flat, the price is #2. Streamed: ops are bucketed per chunk (`chunks/SplatPaint.ts`), a chunk paints only its own |
| 4 | Splat memory | `Terrain.ts:52` (+ canvas + GPU) | 12 + 16 + 16 MB | same (capped, hence the quality loss) | same | fixed; chunks: 49 KB each, about 2.4 MB for a full ring |
| 5 | Region tint map: 1 texel per tile (RGBA), stretched over `[-max(cx,cz), +max]` | `WorldScenery.ts:291`, `WorldDecor.ts:526` | 0.1 MB | 1 MB | 4.2 MB | fine (non-square zones are stretched, existing behaviour) |
| 6 | Tile index `Int16` + wall flags per tile | `DungeonBuilder.ts:622-624` | 0.1 MB | 1.0 MB | 4.2 MB | fine. Room count must stay < 32,768 |
| 7 | **Nav grid: dense `Uint8`, 1 m cells** | `NavGrid.ts:46`, `DungeonBuilder.ts:625` | 0.41 MB | 4.2 MB | **16.8 MB** | SOFT, kept dense on purpose (Minimap / map panel read `nav.cells`). Fill went from 17 ns/cell to a row-wise O(tiles) routine (`NavBase.fillNavFast`): *sim* 117 ms at 4 km including the tile index |
| 8 | A* node budget 6,000 (Map + Set per search) and 0.25 m ray steps | `NavGrid.ts:402`, `:285` | - | - | - | SOFT, independent of zone size: a detour longer than about 80 m around an obstacle returns no path |
| 9 | **Instanced scenery: everything built at load**, one `InstancedMesh` per (40 m chunk x model x flags) | `Instancing.ts:121` (chunk 40), `WorldScenery.ts:562+` densities | about 2,500 meshes, 16k instances | *sim*: **15,393 meshes, 161k instances**, 682 ms for the recipe alone | *sim*: **56,402 meshes, 637k instances**, 2.8 s, ~150 MB of placement records | HARD (draw budget 600, scene-graph traversal of tens of thousands of meshes per frame). Streamed: about 350 meshes per ring |
| 10 | `ChunkCuller` walks every mesh every 0.25 s | `Instancing.ts:353` | 2.5k | 15k | 56k | SOFT; streamed: only resident meshes |
| 11 | `voidForest(900)` / `beyondForest(760)`: fixed totals, density collapses with size | `WorldScenery.ts:370-371` | fine | thin | bare | SOFT. Streamed: per-m2 densities taken from Sisli Vadi |
| 12 | `isAvoided` is a linear scan of the avoid list; scatter calls it hundreds of thousands of times | `DungeonBuilder.ts` `isAvoided` | 200 circles | 3.5k | 14k (*sim*) | SOFT. Streamed: `chunks/AvoidIndex.ts` bucket hash |
| 13 | `ZoneField` allocates 3 arrays of `4 x tiles` cells although the open world has no zones | `Zones.ts:212-214` | 0.4 MB | 4.2 MB | 16.8 MB | SOFT, not changed (unused memory) |
| 14 | Heightfield: **the open world has none**, ground is the plane y = 0 (`hf` is null for outdoor builds) | `DungeonBuilder.ts:760` | - | - | - | NOT SUPPORTED: no hills. A vertical-dungeon style heightfield would cost 44 B/tile (46 MB at 4 km). See section 8 |
| 15 | Shadow box 40 m x 40 m, 1024 map, follows the focus | `ShadowFollow.ts:13-15`, `DungeonBuilder.ts:906`, `:2227` | same | same | same | independent of size |
| 16 | Fog far 55-100 m per region, camera far 600 m, sky dome 380 m, mountain rings 430 / 380 m (they follow the camera) | `DungeonScene.ts:92`, `Sky.ts:119`, `WorldDecor.ts:552` | fine | fine | fine | independent of size. A region `fogFar` above about 250 m would show the ring edge: the streamed path caps the fog at `viewM - 24` as a net, content-check warns above 250 |
| 17 | Float32 precision of world coordinates | all vertex / instance data | 0.06 mm | 0.12 mm | 0.24 mm (0.49 mm at the far edge) | fine up to about 16 km (2 mm). Terrain UVs are chunk-local + origin, texel error 6e-5 |
| 18 | **Enemy ids: `100 + packIndex x 24 + k < 50,000`**: at most **2,079 camps / patrols** per zone, further camps silently do not spawn | `CampDirector.ts:83`, `types/common.ts:13-14` | 81 used | 3,300 at Sisli density do not fit | same | HARD (protocol constant). Keep zones under 2,079 camps (about 0.6 camps per hectare is Sisli density; Metin2-like density is lower) or have netcode raise `HOST_DYNAMIC_ID_BASE` (e.g. 120,000 = 5,000 camps) |
| 19 | Camp tick: every camp x every player, twice a second | `CampDirector.ts:152+` | 81 | 830 | 3,300 | SOFT, measured negligible in the sim (0.16 ms per query); the tick now visits only awake camps (*sim*: 19 of 829 / 59 of 3,318 candidates with two players) |
| 20 | Other director loops: Metin `pickSpot` (a `nearestWalkable` per free spot per tick), Rare / MiniBoss / Boss / Pois / Discoveries are linear in their content | `MetinDirector.ts`, `RareDirector.ts`, `WorldPois.ts`, `Discoveries.ts` | tens | hundreds | hundreds | SOFT, scales with content count, not area |
| 21 | Enemy simulation: 240 live camp enemies (cap), `EnemyAI.canSleep` sleeps idle ones, replication radius 120 m. Rares / mini-bosses / metin stones spawn anywhere in their region and **patrolling enemies never sleep** | `EnemyAI.ts:744`, `Replication.ts:24`, `RareDirector.ts` | fine | fine | rares far from every player still tick if they patrol | SOFT, section 8 |
| 22 | **Minimap and world map build RGBA canvases of `nav.cols x nav.rows`**, three of them, plus `nav.cells.slice()` and a full `sameCells` compare every 2.5 s | `ui/hud/Minimap.ts:160-203`, `ui/panels/game/map.ts:19`, `:486-496` | 1.6 MB each | 16 MB each | **64 MB each x 3 + 64 MB ImageData + a 16.8 M-byte compare per 2.5 s** (Safari caps a canvas at 16.7 M px: 4001 x 4001 = 16.0 M) | HARD for a 4 km zone, SOFT at 2 km. UI-owned, not touched here. Use `nav.downsample(4)` (new, `NavGrid.ts`) for the images |
| 23 | Loading: asset preload list is static (size independent) | `DungeonBuilder.ts` `dungeonAssetUrls` | - | - | - | fine |

The two things that actually stop a big zone today are #1/#9 (the build-everything terrain and scenery) and #18 (camp ids); #22 is the UI team's.

## 3. Design

```
                     player focus (camera pivot)               every player of the world (host)
                              |                                              |
                   WorldStream.update (≤ 2 builds / frame)          colliders ring (same radius)
                              |                                              |
        ChunkStreamer (visual, loadM = viewM)                  ChunkStreamer (colliders)
          |            |             |                                       |
   ChunkedTerrain  InstanceBatcher  scatter.generate(cx,cz)  ---- shared ---- scatter.generate(cx,cz)
   (quad + splat)  .loadChunk       (pure, cached 256)                  nav.setCircle (never undone)
```

* **`chunks/ChunkStreamer.ts`** (pure): the resident set. A chunk is wanted when its square is within `loadM` of any focus, dropped when it is
  farther than `unloadM` (hysteresis 32 m) from all foci. Nearest-first, `maxLoads` per update (2), `prime()` for scene start and teleports.
  `WorldStream.update` primes by itself when the focus jumps more than 60 % of `viewM`.
* **`chunks/ChunkScatter.ts`** (pure data out): the `WorldScatter` recipes (palettes per region, border dressing, void and backdrop forest,
  sprinkles, crop fields, hill massifs, marsh reeds) per chunk. RNG is seeded `defId:chunk:cx,cz`; "free ground" uses the layout-only nav rule
  (`NavBase.baseNavCell`) and the avoid / road / camp lists, never the live nav grid, so the result does not depend on what is already built.
  Spacing (`Occupancy`) is per chunk; big items (massifs, crop fields) keep 16 m off the chunk edge. Sparse specials keep their per-room
  count up to 70,000 m2 and grow with the area beyond that (same density as Sisli Vadi). Rocks also keep out of camps here (camp spawn points
  are snapped before any chunk exists). It `extends WorldScatter` (members made `protected`), the classic path is untouched.
* **`TerrainChunks.ts`**: one flat 8 m-cell quad geometry shared by all chunks, a `MeshStandardMaterial` per chunk (shared GPU program) with the chunk's
  128 px splat (`DataTexture`, painted by `chunks/SplatPaint.ts` in world coordinates: seams agree to the pixel, tested) and the shared region tint map.
  Same shading as `Terrain.ts`. Terrain exists 160 m beyond the zone edge.
* **`Instancing.ts`**: `InstanceBatcher.deferred = true` keeps the hand-placed groups (villages, landmarks, bridges, boardwalks) per chunk;
  `loadChunk(cx, cz, generated)` makes the meshes of one chunk, `unloadChunk` frees them (pieces are shared and stay). `ChunkCuller` unchanged.
* **`WorldStream.ts`**: wires the two rings. Colliders (trunks, rocks, massifs) go onto `built.nav` for chunks near **every** player (the host
  simulates enemies near remote players) and stay there; visual chunks follow the local focus only.
* **`NavBase.ts`**: the room-to-tile / wall step and the nav classification moved out of `DungeonBuild.buildGrid` (pure, importable from node):
  `fillNavReference` is the original per-cell rule verbatim, `fillNavFast` computes the same grid per tile (cell for cell equal on Sisli Vadi,
  12 random maps, and equal to the pre-change loop pasted into the sim).
* **`scenes/world/CampIndex.ts` + `CampDirector.ts`**: see #19. Respawn timers use `world.time` stamps (`lastKillAt`), so sleeping camps come back on
  schedule without being ticked; the decisions and their order are exactly the old loop's.
* **`DungeonScene`** recollects the camera's fade-occluder list when `built.world.streamVersion` changes (it was collected once at scene start).
* `DungeonBuild` builds `stream = streamConfig(def)` (`chunks/StreamConfig.ts`) in its constructor; `worldHost().stream` reaches `WorldDecor`.

Fog and streaming: the ring radius is the widest region `fogFar` + 64 m (clamped 96-320 m), the culler hides trees at `fogFar + 20`, the fog
never reaches farther than `viewM - 24` in a streamed zone: chunks appear 40-70 m inside pure fog colour. Sky dome and mountain rings follow the camera.

Budgets (*sim*, synthetic 2,048 m and 4,096 m layouts, Sisli camp / POI density, all six palettes):

| | 2,048 m | 4,096 m |
|---|---|---|
| tile index + nav fill | 39 ms | 117 ms |
| nav / index / walls memory | 4.2 + 0.5 + 0.5 MB | 16.8 + 2.1 + 2.1 MB |
| chunks in the zone | 1,024 | 4,096 |
| resident visual chunks (peak, 1.2-1.6 km walk) | 39 (bound 81) | 39 (bound 81) |
| instanced meshes in a ring | about 345 (33 chunks, stub 1-part models) | same |
| instances in a ring | about 8,400 | about 8,100 |
| chunk content generation | 0.1 ms avg, 0.2 ms p95 | same |
| worst streaming update while walking (incl. mesh creation) | 4.8 ms (2 chunks) | same |
| priming a full ring | 36-56 ms (stub assets) | same |
| camps visited per tick (two players) | 19 of 829 | 59 of 3,318 |
| classic path for comparison | 15,393 meshes / 161k instances / 682 ms | 56,402 meshes / 637k instances / 2.8 s |

Real models have several parts per piece (merged per material), so expect 1.5-3x the mesh count of the stub; the ring is still about a fifth of
Sisli Vadi's resident mesh count.

## 4. Implemented / deferred

Implemented: chunk streamer, chunked terrain + splat, streamed instancing with disposal, pure per-chunk scatter with colliders, fast nav fill, avoid /
camp bucket indexes, camp tick on awake camps only, occluder refresh, fog cap, layout `zone` block + `gridOf` / `perfOf` helpers, content-check rules,
`NavGrid.downsample`, `bigmap.mjs`.

Deferred (owner in brackets):
* Minimap / world map for large nav grids: use `nav.downsample(4)` (UI team).
* Camp id space (#18): decision for netcode.
* Terrain heights (hills): needs a chunked heightmap, nav floor and a ground-Y that is no longer 0 (section 8).
* Static content in the streamed path that is still unconditionally resident: water planes (one quad per `water` rect), village NPCs, waypoint
  stones, shrines, chests (entities, a few hundred at most). Villages' props and palisades stream with their chunk.
* `ZoneField` allocation (#13) and `Heightfield` for a vertical open world.
* Rares / mini-bosses / metin stones spawn anywhere in a region regardless of distance, and patrolling ones never sleep: add a "spawn only within
  N m of a player, despawn when nobody is near" rule before regions are 1 km wide (director code, scenes module).
* Quest / waypoint travel UI sees a 4 km coordinate range; the Işınlayıcı fares use tile distances (fine).

## 5. Determinism (P2P)

* The streamed world is `f(def, chunk)`: chunk RNG seeds, no dependence on streaming order, build time, frame rate or the live nav grid.
* Colliders on the nav grid differ between peers only in chunks one peer has not built yet. The host builds the collider ring around every player,
  a client around itself, which is exactly the area where that peer's actors can be hit or blocked. The sim compares the nav of a host and a client
  that walked different routes (61k shared cells, 0 differences).
* Hand-placed content (villages, landmarks, POIs) is built once at load on every peer, independent of streaming. Camp members, rares, metin stones
  keep their ids and positions (`snapTile` runs against the layout-only nav at start).
* Not deterministic and never was: cosmetic atmosphere (ambient VFX, particles).

## 6. For content authors

A zone is a normal open-world layout (`docs/GDD_OPENWORLD.layout.json` shape, see `src/data/world/layout.ts`) with these differences:

```jsonc
{
  "id": "karakir_bozkiri",
  "grid": { "w": 512, "h": 512 },          // tiles (4 m). 512 = 2,048 m. Still the source of truth unless "zone.sizeM" is set
  "tileSize": 4,
  "zone": {                                 // OPTIONAL, new
    "sizeM": 2048,                          // number = square, or [x, z] in metres; overrides "grid" through gridOf(layout)
    "stream": "auto",                       // "auto" (default: streams above 800 m) | "on" | "off"
    "chunkM": 64,                           // streaming chunk edge, multiple of 16 (32..256). Default 64
    "viewM": 150                            // built radius around the player, 96..320. Default = widest region fogFar + 64
  }
}
```

Assembly in `data/world/<zone>.ts` (same as `sisli_vadi.ts`, which was not changed):

```ts
import { LAYOUT, gridOf, perfOf } from './layout';
grid: gridOf(LAYOUT),                                         // instead of { w: LAYOUT.grid.w, h: LAYOUT.grid.h }
world: { ..., perf: perfOf(LAYOUT, { activateM: 70, deactivateM: 110, aiSleepM: 45, maxActiveEnemies: 240, chunkM: 40 }) },
```

Without a `zone` block nothing changes: `grid` is the size and zones up to 800 m build everything at load.

Rules and numbers for big zones:
* **Size**: up to 4,400 m per side (`content-check` errors above). Under 800 m the classic path is used. Between 800 m and about 1.2 km both paths work, streaming is cheaper.
* **Camps and patrols**: at most **2,079** per zone (enemy id space, #18), 24 members per camp. Camps stream by themselves (activate 70 m, deactivate 110 m, respawn timers keep running while asleep).
* **Fog**: keep every region's `fogFar` at or below 250 m (draw distance on a 4 km map is the fog, as in Metin2). Default view radius is `fogFar + 64`.
* **Regions** are still room rectangles (`rooms` + `world.regions`), non-overlapping. A region may be 1-2 km wide: its palette densities per m2 are the same as in Sisli Vadi; `sprinkles`, crop fields, hill massifs and marsh reeds
  keep their per-room counts up to 70,000 m2 and grow with the area beyond (a 1 km2 region gets about 14x the gravestones of Sisli's ruins).
* **Roads / water / borders**: polylines and rects may be as long as you like; a long road is painted per chunk, not as one huge box.
* **Villages / landmarks / POIs** are hand-placed, built at load and streamed with the chunk they stand in. Everything that needs ground (NPCs, stones, chests) is placed by tile coordinate as before.
* **Density guide** (resident ring is about 35 chunks of 64 m): trees about 8, bushes 6, rocks 3, tufts about 200, flowers about 25 per chunk at palette 1.0; keep hand-placed props under a few hundred per village.
* **No hills yet**: the ground is flat (#14).
* `node tools/content-check.mjs <zone>` prints `NNNN m zone, chunk streaming on (chunk 64 m, view 164 m, <= 81 chunks resident)` and errors / warns on the rules above.
* Preview in the browser: add `?stream=1` to force streaming on any zone, `?stream=0` to force the classic path.

## 7. Browser checks for the director (not covered by the headless sim)

1. Sisli Vadi unchanged: loads as before, same scenery, camps, minimap. (`streamConfig` returns `on: false`; the code path changed only in `buildGrid` (same grid, proved), `Terrain.ts` helpers (889k sampled splat weights identical to the old file) and `CampDirector` (same decisions).)
2. `?stream=1` on Sisli Vadi: ground and scenery appear around the player, nothing pops inside the fog, walking 300 m across a region border keeps 60 fps, draw calls stay under 600 (perf overlay), trees / rocks block movement the same as before, region tint and roads/camp discs look the same (splat is 0.5 m/px).
3. Teleport (Işınlayıcı) and death respawn to a far waypoint: one short hitch, ground and trees already there.
4. Two-player party: both see the same trees; an enemy chasing a client around a tree behaves.
5. Camera fade: standing behind a tree trunk fades it (occluder list refreshes with the chunks).
6. A synthetic 2 km layout (set `zone.sizeM` on a copy of the layout in a scratch branch) for the real frame time and loading time.

## 8. Notes for later

* **Hills**: add a per-chunk heightmap (65 x 65 samples per 64 m chunk, generated from a seeded noise + authored ops like the splat), `ChunkedTerrain` vertices from it, `World.groundY` / `DungeonBuild.floorAt` sampling it, the nav floor array from the same source (`NavGrid.floor/flags` exist for vertical dungeons), and instance Y from the same function. The streamer, chunk purity and colliders carry over unchanged.
* **Enemy sleeping for patrols**: let `EnemyAI.canSleep` apply to patrolling enemies when no player is within `aiSleepM`; they would resume their loop from where they stopped.
* **Interest management**: `Replication` already limits state to 120 m around each peer; unchanged.

## 9. Triangle budget and voxel LOD

Measured headless by `dev/combat-sim/tribudget.mjs` (real scatter, real batcher / culler / voxel files, three's frustum maths; `--scan` samples every region centre and west-edge forest, `--lod=0` is the old behaviour, `--q=low|mid|high`). The voxel scatter models are 1-2.9k triangles each; a Karakir spawn used to draw 1.78 M triangles (dense map-edge forest, 4,000 grass tufts at 244 triangles, whole 64 m chunk meshes re-drawn by the shadow pass).

* `world/VoxelLod.ts` (pure): rebuilds the voxel grid of a flat-palette mesh, then level 0 = same surface with coplanar same-colour faces merged (lossless, checked face for face by `voxellod.mjs`), level 1 / 2 = occupancy downsampled 2x / 4x with the commonest palette texel per exposed face, greedy-meshed. Models that are not such meshes keep the old path.
* `Instancing.ts` `LodSet`: scatter layers (tree, border, bush, rock, tuft, flower) are drawn in three distance tiers per (chunk, model); the culler re-sorts them (at most every 0.25 s, after the focus moved 1.5 m) and fits each tier mesh's bounding sphere to what it holds, so frustum and shadow culling work per tier. Only tiers 0 and 1 cast shadows (not the border forest's tier 1). Far ground cover is thinned by a fixed per-instance rank. Colliders and chunk content are untouched (visual only, every peer builds the same world).
* `WorldPerf.ts`: the tier distances per layer and "Görüntü Kalitesi" (Düşük / Orta / Yüksek, `graphicsQuality` in Settings, default Orta). Nothing is drawn beyond the fog (`end` = fog far + 4).
* Karakir spawn (Orta): 1.78 M -> 123 k triangles (worst sampled point 205 k, map-edge forest); Yüksek worst 307 k; Düşük worst 118 k.
