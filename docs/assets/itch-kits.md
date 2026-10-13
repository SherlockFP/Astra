# itch.io PSX town / dungeon kits (converted)

Four itch.io packs converted to self-contained, PSX-ready GLBs for EFSUN ONLINE. **322 GLBs, 14.0 MB** in total, plus
31 loose textures. All models are static (no armatures, no animation clips). Credits and licences:
`docs/assets/credits-itch.md` (the goblinatron dungeon is **CC BY 4.0, attribution required**; everything else is CC0).
Preview contact sheet with true-scale line-ups: `docs/assets/previews/itch-kits.png`.

| Pack | Public folder | Files | Scale applied | Licence |
|---|---|---:|---|---|
| goblinatron **PSX Dungeon** | `/assets/models/itch/psx-dungeon/` | 43 | ×0.2 (20-unit module → 4 m tile) | CC BY 4.0 |
| valsekamerplant **PSX Style: Going Medieval** | `/assets/models/itch/psx-medieval/{building,decoration,market,roofs}/` | 193 | ×1.25 (4 m → 5 m module) | CC0 |
| toboas **PSX Fantasy Pack: Nocturnal Watch** | `/assets/models/itch/nocturnal-watch/` | 55 | ×4/3 base, props sized individually | CC0 |
| Kay Lousberg **KayKit Fantasy Weapons Bits 1.0** | `/assets/models/itch/fantasy-weapons-bits/` | 31 | ×1 (already KayKit scale) | CC0 |

## 0. Conventions (read first)

* **Scale contract** (ARCHITECTURE rule 7): KayKit hero ≈ 2.4 tall, dungeon tile 4 × 4, +Y up, models face **+Z**. Every
  size in this file is in game units after conversion. The line-ups in the preview put each pack next to the KayKit Knight.
* **Front = +Z.** Doors, windows, wall decor, torches and NPCs face +Z (`rotation.y = Math.atan2(dx, dz)` aims them).
* **PSX materials:** every texture was reduced to a 256-colour palette PNG (≤256 px; 352 px for the medieval building atlas,
  512 px for the Nocturnal buildings and the witch), samplers are NEAREST, `metallic 0 / roughness 1`, no extensions.
  Alpha is **MASK** (cutoff 0.5) where the texture has holes (flowers, vines, grates, pine needles), never BLEND.
  `Assets.onModelLoaded` still applies the usual PSX patch on load.
* **One mesh per file** (joined per material), except buildings with an openable door (`church`, `tower`: the door is a
  second node whose origin sits on the hinge, so `door.rotation.y = ±1.5` opens it).
* **Draw calls / instancing:** files of one pack share the same texture image, so you can swap in one shared material
  (textures in `/assets/textures/itch/<pack>/`, see section 5) and use `InstancedMesh` / merge static geometry.
* Pivot column below: `centre, base` = bottom centre (default); `0→+X, −Z←0` = pivot on the module corner, piece extends to +X and −Z;
  `top (hangs)` = pivot at the top attachment point; `back` pieces have z from 0 (wall surface) to +Z.

## 1. PSX Dungeon (goblinatron, CC BY 4.0) — `/assets/models/itch/psx-dungeon/`

The source is a 20-unit modular kit; ×0.2 makes it **exactly the KayKit dungeon grid**: a wall is 4 W × 4 H × 1 D with the
pivot at the bottom centre and the centre line on local X (±0.5 on Z), so these pieces can replace or mix with
`/assets/models/dungeon/` walls on the same `TILE_SIZE` grid. Doorways are 2 × 3 m, door panels fit them.
Three atlases (`dungeon_map` 256², `crates_and_barrels_map` 128², `doors_map` 128²), 2–368 tris per piece; very PSX.
Arch, arch_fence and arch_roof keep their height so they land on top of `pillar` (6.04 m) when given the same origin
as the pillar pair midpoint / tile centre.

| URL | KB | tris | W × H × D (m) | pivot | intended use |
|---|---:|---:|---|---|---|
| `/assets/models/itch/psx-dungeon/arch.glb` | 41 | 84 | 4.00 × 2.40 × 0.80 | centre, y 5.76..8.16 | arch span between two pillars 4 m apart; keeps its height (y 5.76..8.16), place at the same origin as the pillar pair midpoint |
| `/assets/models/itch/psx-dungeon/arch_fence.glb` | 47 | 156 | 3.20 × 2.14 × 0.19 | centre, y 5.77..7.91 | iron fence spanning between pillars (y 5.77..7.91, decorative upper grille) |
| `/assets/models/itch/psx-dungeon/arch_roof.glb` | 46 | 176 | 4.00 × 2.10 × 4.00 | centre, y 5.90..8.00 | cross-vault ceiling piece over a 4 × 4 tile, sits on the pillars (y 5.90..8.00) |
| `/assets/models/itch/psx-dungeon/barrel.glb` | 19 | 56 | 1.52 × 1.60 × 1.76 | centre, base | barrel prop (breakable) |
| `/assets/models/itch/psx-dungeon/block.glb` | 38 | 48 | 4.00 × 4.00 × 4.00 | centre, base | solid 4 m cube (fill, pillars of rock, raised floor) |
| `/assets/models/itch/psx-dungeon/block_arch.glb` | 39 | 60 | 4.00 × 4.00 × 4.00 | centre, base | 4 m cube with a passage arch through it |
| `/assets/models/itch/psx-dungeon/block_half.glb` | 37 | 32 | 4.00 × 2.00 × 4.00 | centre, base | 4 × 2 × 4 half block (steps, raised dais, ledges) |
| `/assets/models/itch/psx-dungeon/box.glb` | 16 | 12 | 1.60 × 1.60 × 1.60 | centre, base | wooden crate 1.6 m (breakable) |
| `/assets/models/itch/psx-dungeon/candle_01.glb` | 37 | 32 | 0.38 × 0.61 × 0.44 | centre, base | single candle |
| `/assets/models/itch/psx-dungeon/candle_02.glb` | 41 | 96 | 0.66 × 0.74 × 0.54 | centre, base | candle cluster |
| `/assets/models/itch/psx-dungeon/candle_03.glb` | 37 | 32 | 0.38 × 0.43 × 0.44 | centre, base | short candle |
| `/assets/models/itch/psx-dungeon/chain.glb` | 37 | 20 | 0.20 × 2.00 × 0.20 | centre, top (hangs) | hanging chain 2 m, pivot at the top (attach to ceiling) |
| `/assets/models/itch/psx-dungeon/chandelier.glb` | 60 | 368 | 3.47 × 2.90 × 4.00 | centre, top (hangs) | iron chandelier with candles, hangs 2.9 m from its top pivot (add point light + emissive) |
| `/assets/models/itch/psx-dungeon/chest.glb` | 19 | 76 | 2.00 × 1.61 × 1.70 | centre, base | treasure chest (loot) |
| `/assets/models/itch/psx-dungeon/debris.glb` | 46 | 148 | 2.28 × 0.40 × 2.28 | centre, base | rubble pile |
| `/assets/models/itch/psx-dungeon/door_01.glb` | 17 | 12 | 2.00 × 3.00 × 0.40 | centre, base | iron-studded door panel 2 × 3 (animate: pivot is bottom centre, offset ±1 m on X for a hinge) |
| `/assets/models/itch/psx-dungeon/door_02.glb` | 17 | 12 | 2.00 × 3.00 × 0.40 | centre, base | wooden door panel 2 × 3 |
| `/assets/models/itch/psx-dungeon/door_03.glb` | 44 | 124 | 2.00 × 3.00 × 0.25 | centre, base | portcullis / barred gate 2 × 3 (raise along +Y to open) |
| `/assets/models/itch/psx-dungeon/door_frame_01.glb` | 39 | 68 | 4.00 × 4.00 × 1.00 | centre, base | wall with 2 × 3 m doorway (fits door_01/02/03) |
| `/assets/models/itch/psx-dungeon/door_frame_02.glb` | 51 | 236 | 4.00 × 4.00 × 1.48 | centre, base | wall with arched, trimmed 2 × 3 m doorway |
| `/assets/models/itch/psx-dungeon/floor_tiles.glb` | 35 | 2 | 4.00 × 0.00 × 4.00 | centre, base | 4 × 4 floor quad at y = 0 (KayKit floor top is y = 0.05) |
| `/assets/models/itch/psx-dungeon/hexagon.glb` | 37 | 32 | 6.93 × 1.60 × 8.00 | centre, base | hexagonal dais / platform 1.6 high (altar base, boss pedestal) |
| `/assets/models/itch/psx-dungeon/pillar.glb` | 46 | 204 | 1.13 × 6.04 × 1.13 | centre, base | 6.04 m fluted pillar with capital (arches sit on top) |
| `/assets/models/itch/psx-dungeon/pillar_collapsed_01.glb` | 43 | 130 | 1.13 × 1.94 × 1.13 | centre, base | broken pillar stump |
| `/assets/models/itch/psx-dungeon/pillar_collapsed_02.glb` | 37 | 36 | 2.84 × 0.69 × 0.80 | centre, base | fallen pillar segment lying on the floor |
| `/assets/models/itch/psx-dungeon/skull_wall.glb` | 38 | 56 | 4.00 × 4.00 × 1.00 | centre, base | catacomb wall of skulls (crypt / necromancer floors) |
| `/assets/models/itch/psx-dungeon/skull_wall_half.glb` | 37 | 36 | 2.00 × 4.00 × 1.00 | centre, base | half-width skull wall |
| `/assets/models/itch/psx-dungeon/spikes.glb` | 42 | 78 | 2.80 × 1.60 × 3.60 | centre, base | floor spike trap (animate +Y) |
| `/assets/models/itch/psx-dungeon/stairs.glb` | 36 | 8 | 4.00 × 2.00 × 4.00 | centre, base | ramp-style stairs, rises 2 m toward local +X over 4 m (rotation.y = −π/2 to climb toward +Z) |
| `/assets/models/itch/psx-dungeon/stairs_ultrawide.glb` | 37 | 20 | 4.00 × 2.00 × 12.00 | centre, base | same stairs, 12 m wide (3 tiles) |
| `/assets/models/itch/psx-dungeon/stairs_wide.glb` | 36 | 8 | 4.00 × 2.00 × 8.00 | centre, base | same stairs, 8 m wide (2 tiles) |
| `/assets/models/itch/psx-dungeon/wall_01.glb` | 37 | 32 | 4.00 × 4.00 × 1.00 | centre, base | plain stone wall, the default dungeon wall (same 4×4×1 footprint as KayKit `wall.glb`) |
| `/assets/models/itch/psx-dungeon/wall_02.glb` | 40 | 68 | 4.00 × 4.00 × 1.80 | centre, base | wall with buttress pilasters (1.8 deep), breaks long corridors |
| `/assets/models/itch/psx-dungeon/wall_border_01.glb` | 39 | 56 | 4.00 × 2.00 × 1.00 | centre, base | low 2 m wall / parapet with carved trim (balconies, pits, altars) |
| `/assets/models/itch/psx-dungeon/wall_border_02.glb` | 39 | 56 | 4.00 × 2.00 × 1.00 | centre, base | low 2 m wall, second trim pattern |
| `/assets/models/itch/psx-dungeon/wall_decor_01.glb` | 41 | 88 | 0.87 × 1.13 × 0.32 | cx, 0→+Z, y 1.12..2.25 | iron ring for a wall face; pivot on the wall surface (back), keeps its 1.1–2.25 m height, sticks out toward +Z |
| `/assets/models/itch/psx-dungeon/wall_expanding.glb` | 37 | 32 | 4.00 × 4.00 × 2.00 | centre, base | tapering wall 1→2 m thick (transition to thick walls) |
| `/assets/models/itch/psx-dungeon/wall_half.glb` | 37 | 20 | 2.00 × 4.00 × 1.00 | centre, base | half-width wall (2 m) for odd gaps / corners |
| `/assets/models/itch/psx-dungeon/wall_narrowing.glb` | 37 | 32 | 4.00 × 4.00 × 2.00 | centre, base | tapering wall 2→1 m thick (mirror of expanding) |
| `/assets/models/itch/psx-dungeon/wall_ruin.glb` | 37 | 32 | 3.80 × 4.00 × 1.00 | centre, base | broken wall with slanted top (ruined rooms, boss arena edges) |
| `/assets/models/itch/psx-dungeon/wall_table.glb` | 54 | 60 | 4.00 × 1.78 × 2.18 | cx, 0→+Z, y 1.00..2.78 | shelf/table hung on chains from a wall; back pivot, 1.0 m above the floor, sticks out toward +Z |
| `/assets/models/itch/psx-dungeon/windowed_wall_01.glb` | 42 | 104 | 4.00 × 4.00 × 1.12 | centre, base | wall with small barred window |
| `/assets/models/itch/psx-dungeon/windowed_wall_02.glb` | 54 | 280 | 4.00 × 4.00 × 1.48 | centre, base | wall with arched barred window and trim |


## 2. PSX Style: Going Medieval (valsekamerplant, CC0) — `/assets/models/itch/psx-medieval/`

A modular Fachwerk town kit plus a big market set. Real-world source (4 m module, 3 m storey, 2.17 m door) scaled ×1.25:
**module 5 m, storey 3.75 m, door 2.72 m** (the KayKit dungeon door is 2.75 m, so the 2.4 m hero fits the same way).
**The author's pivots are kept** so every piece snaps to every other piece as designed:

* building blocks, floors, beams, roofs, overhangs and stairs pivot on the **module corner** and extend toward **+X and −Z**
  (a full block covers x 0..5, z −5..0; a half block x 0..2.5, z −2.5..0). Place them at multiples of 5 m (2.5 m for halves),
  stack storeys every 3.75 m, put a roof on top of the last storey at the same x/z. Rotating about Y turns a piece around its
  corner, so add the cell offset when you rotate (or wrap it in a Group offset by (−2.5, 0, 2.5)).
* `plaster_wall*` / `stone_square*` are whole room blocks (four walls of one cell, no floor/ceiling); `_cornered` has one cut corner,
  `_alt` uses diagonal bracing.
* doors and windows are **overlays** (centred pivot, about half their depth sinks into the wall): place them on a block face.
* roofs overhang 0.48 m on each slope side; `roof_*_corner` occupies the neighbour cell toward +Z.
* the three barrel fillers keep their height (they sit inside `barrel_open`); hanging meat/sausages keep a centre pivot;
  `table`, `table_prebuild` and `pumpkin` were moved onto the ground (source pivot was the table top).
* Renamed from the source: `strairs_*` → `stairs_*`, `market_stall_yelow` → `market_stall_yellow`, `backet` → `basket`,
  `bread_smol` → `bread_small`, `*_windowsil` → `*_windowsill`, `*_barrel_fillter` → `barrel_filler_*`.
* Textures: one 352² building atlas (`bauerhaus`), `market` 200², `market_misc` 256², plus small tiling textures
  (hay, jute, terracotta, wood). Colour variants: roofs come in blue / red / straw, stalls in blue / red / yellow.

### 2.1 building blocks (`/assets/models/itch/psx-medieval/building/`, 34 files)

| URL | KB | tris | W × H × D (m) | pivot | intended use |
|---|---:|---:|---|---|---|
| `/assets/models/itch/psx-medieval/building/plaster_wall.glb` | 32 | 96 | 5.00 × 3.75 × 5.00 | 0→+X, −Z←0, base | timber-frame (Fachwerk) storey block, 4 walls of a 5 × 5 room; stack 3.75 m per storey |
| `/assets/models/itch/psx-medieval/building/plaster_wall_alt.glb` | 33 | 96 | 5.00 × 3.75 × 5.00 | 0→+X, −Z←0, base | timber-frame (Fachwerk) storey block, 4 walls of a 5 × 5 room; stack 3.75 m per storey |
| `/assets/models/itch/psx-medieval/building/plaster_wall_cornered.glb` | 32 | 84 | 5.00 × 3.75 × 5.00 | 0→+X, −Z←0, base | timber-frame (Fachwerk) storey block, 4 walls of a 5 × 5 room; stack 3.75 m per storey |
| `/assets/models/itch/psx-medieval/building/plaster_wall_cornered_alt.glb` | 33 | 84 | 5.00 × 3.75 × 5.00 | 0→+X, −Z←0, base | timber-frame (Fachwerk) storey block, 4 walls of a 5 × 5 room; stack 3.75 m per storey |
| `/assets/models/itch/psx-medieval/building/plaster_wall_half.glb` | 31 | 48 | 2.50 × 3.75 × 2.50 | 0→+X, −Z←0, base | timber-frame (Fachwerk) storey block, 4 walls of a 5 × 5 room; stack 3.75 m per storey |
| `/assets/models/itch/psx-medieval/building/plaster_wall_half_alt.glb` | 31 | 48 | 2.50 × 3.75 × 2.50 | 0→+X, −Z←0, base | timber-frame (Fachwerk) storey block, 4 walls of a 5 × 5 room; stack 3.75 m per storey |
| `/assets/models/itch/psx-medieval/building/plaster_wall_stone_base.glb` | 33 | 96 | 5.00 × 3.75 × 5.00 | 0→+X, −Z←0, base | timber-frame storey on a stone plinth; one 5 × 3.75 × 5 room block (4 walls) |
| `/assets/models/itch/psx-medieval/building/plaster_wall_stone_base_alt.glb` | 33 | 96 | 5.00 × 3.75 × 5.00 | 0→+X, −Z←0, base | timber-frame storey on a stone plinth; one 5 × 3.75 × 5 room block (4 walls) |
| `/assets/models/itch/psx-medieval/building/plaster_wall_stone_base_cornered.glb` | 33 | 84 | 5.00 × 3.75 × 5.00 | 0→+X, −Z←0, base | timber-frame storey on a stone plinth; one 5 × 3.75 × 5 room block (4 walls) |
| `/assets/models/itch/psx-medieval/building/plaster_wall_stone_base_cornered_alt.glb` | 33 | 84 | 5.00 × 3.75 × 5.00 | 0→+X, −Z←0, base | timber-frame storey on a stone plinth; one 5 × 3.75 × 5 room block (4 walls) |
| `/assets/models/itch/psx-medieval/building/plaster_wall_stone_base_half.glb` | 31 | 48 | 2.50 × 3.75 × 2.50 | 0→+X, −Z←0, base | timber-frame storey on a stone plinth; one 5 × 3.75 × 5 room block (4 walls) |
| `/assets/models/itch/psx-medieval/building/plaster_wall_stone_base_half_alt.glb` | 31 | 48 | 2.50 × 3.75 × 2.50 | 0→+X, −Z←0, base | timber-frame storey on a stone plinth; one 5 × 3.75 × 5 room block (4 walls) |
| `/assets/models/itch/psx-medieval/building/stone_archway.glb` | 39 | 208 | 5.00 × 3.75 × 5.00 | 0→+X, −Z←0, base | stone gateway / passage arch, 5 m module |
| `/assets/models/itch/psx-medieval/building/stone_archway_top.glb` | 33 | 96 | 5.00 × 1.25 × 5.00 | 0→+X, −Z←0, y 2.50..3.75 | top part of the archway (y 2.5..3.75), lintel over a gap |
| `/assets/models/itch/psx-medieval/building/stone_floor_1x1.glb` | 29 | 2 | 1.25 × 0.00 × 1.25 | 0→+X, −Z←0, base | stone floor plate |
| `/assets/models/itch/psx-medieval/building/stone_floor_2x2.glb` | 29 | 8 | 2.50 × 0.00 × 2.50 | 0→+X, −Z←0, base | stone floor plate |
| `/assets/models/itch/psx-medieval/building/stone_floor_4x4.glb` | 31 | 32 | 5.00 × 0.00 × 5.00 | 0→+X, −Z←0, base | stone floor plate |
| `/assets/models/itch/psx-medieval/building/stone_square.glb` | 33 | 96 | 5.00 × 3.75 × 5.00 | 0→+X, −Z←0, base | stone storey / foundation block (5 m module) |
| `/assets/models/itch/psx-medieval/building/stone_square_1m.glb` | 30 | 32 | 5.00 × 1.25 × 5.00 | 0→+X, −Z←0, base | stone storey / foundation block (5 m module) |
| `/assets/models/itch/psx-medieval/building/stone_square_2m.glb` | 32 | 64 | 5.00 × 2.50 × 5.00 | 0→+X, −Z←0, base | stone storey / foundation block (5 m module) |
| `/assets/models/itch/psx-medieval/building/stone_square_cornered.glb` | 32 | 84 | 5.00 × 3.75 × 5.00 | 0→+X, −Z←0, base | stone storey / foundation block (5 m module) |
| `/assets/models/itch/psx-medieval/building/stone_square_half.glb` | 32 | 48 | 2.50 × 3.75 × 2.50 | 0→+X, −Z←0, base | stone room block, 2.5 m module |
| `/assets/models/itch/psx-medieval/building/stone_square_half_1m.glb` | 30 | 16 | 2.50 × 1.25 × 2.50 | 0→+X, −Z←0, base | stone room block, 2.5 m module |
| `/assets/models/itch/psx-medieval/building/stone_square_half_2m.glb` | 31 | 32 | 2.50 × 2.50 × 2.50 | 0→+X, −Z←0, base | stone room block, 2.5 m module |
| `/assets/models/itch/psx-medieval/building/wood_support_beam.glb` | 30 | 20 | 2.50 × 0.28 × 0.25 | 0→+X, cz, y -0.16..0.12 | timber beam / post (frame details, scaffolds, market frames) |
| `/assets/models/itch/psx-medieval/building/wood_support_beam_half.glb` | 30 | 20 | 1.25 × 0.26 × 0.25 | 0→+X, cz, y -0.12..0.14 | timber beam / post (frame details, scaffolds, market frames) |
| `/assets/models/itch/psx-medieval/building/wood_support_beam_metal.glb` | 35 | 100 | 0.29 × 3.87 × 0.28 | centre, base | timber beam / post (frame details, scaffolds, market frames) |
| `/assets/models/itch/psx-medieval/building/wood_support_corner.glb` | 36 | 116 | 1.38 × 3.87 × 1.39 | -0.13..1.25, -1.25..0.14, base | timber beam / post (frame details, scaffolds, market frames) |
| `/assets/models/itch/psx-medieval/building/wood_support_half.glb` | 49 | 294 | 5.27 × 3.89 × 2.14 | -0.13..5.14, -2.00..0.14, y -0.11..3.78 | timber beam / post (frame details, scaffolds, market frames) |
| `/assets/models/itch/psx-medieval/building/wood_support_metal_ring.glb` | 31 | 32 | 0.28 × 0.19 × 0.28 | centre, y -0.10..0.10 | timber beam / post (frame details, scaffolds, market frames) |
| `/assets/models/itch/psx-medieval/building/wood_support_square.glb` | 69 | 580 | 5.28 × 3.89 × 5.28 | -0.14..5.14, -5.14..0.14, y -0.11..3.78 | timber beam / post (frame details, scaffolds, market frames) |
| `/assets/models/itch/psx-medieval/building/wooden_floor_1x1.glb` | 29 | 2 | 1.25 × 0.00 × 1.25 | 0→+X, −Z←0, base | wooden floor plate (upper storeys) |
| `/assets/models/itch/psx-medieval/building/wooden_floor_2x2.glb` | 29 | 8 | 2.50 × 0.00 × 2.50 | 0→+X, −Z←0, base | wooden floor plate (upper storeys) |
| `/assets/models/itch/psx-medieval/building/wooden_floor_4x4.glb` | 31 | 32 | 5.00 × 0.00 × 5.00 | 0→+X, −Z←0, base | wooden floor plate (upper storeys) |


### 2.2 decorations (`/assets/models/itch/psx-medieval/decoration/`, 43 files)

| URL | KB | tris | W × H × D (m) | pivot | intended use |
|---|---:|---:|---|---|---|
| `/assets/models/itch/psx-medieval/decoration/chimney.glb` | 34 | 92 | 1.44 × 6.25 × 2.17 | cx, -1.60..0.57, base | brick chimney stack |
| `/assets/models/itch/psx-medieval/decoration/chimney_end.glb` | 33 | 66 | 1.46 × 3.75 × 1.28 | centre, base | brick chimney stack |
| `/assets/models/itch/psx-medieval/decoration/chimney_large.glb` | 35 | 116 | 1.46 × 10.00 × 2.18 | cx, -1.60..0.57, base | brick chimney stack |
| `/assets/models/itch/psx-medieval/decoration/door_stone.glb` | 31 | 28 | 1.63 × 2.88 × 0.46 | cx, -0.19..0.26, y -0.08..2.80 | door overlay for a wall face (centred, half sunk into the wall) |
| `/assets/models/itch/psx-medieval/decoration/door_stone_double.glb` | 37 | 142 | 2.98 × 3.04 × 0.46 | cx, -0.19..0.26, y -0.08..2.96 | double door overlay for a wall face (centred) |
| `/assets/models/itch/psx-medieval/decoration/door_stone_metal_grate.glb` | 31 | 30 | 1.53 × 2.72 × 0.36 | centre, base | door overlay for a wall face (centred, half sunk into the wall) |
| `/assets/models/itch/psx-medieval/decoration/door_stone_rounded.glb` | 33 | 76 | 1.63 × 2.88 × 0.46 | cx, -0.19..0.26, y -0.08..2.80 | door overlay for a wall face (centred, half sunk into the wall) |
| `/assets/models/itch/psx-medieval/decoration/door_wood.glb` | 31 | 28 | 1.53 × 2.72 × 0.36 | centre, base | door overlay for a wall face (centred, half sunk into the wall) |
| `/assets/models/itch/psx-medieval/decoration/door_wood_double.glb` | 37 | 142 | 2.81 × 2.87 × 0.36 | centre, base | double door overlay for a wall face (centred) |
| `/assets/models/itch/psx-medieval/decoration/door_wood_metal_grate.glb` | 31 | 30 | 1.53 × 2.72 × 0.36 | centre, base | door overlay for a wall face (centred, half sunk into the wall) |
| `/assets/models/itch/psx-medieval/decoration/door_wood_rounded.glb` | 33 | 76 | 1.53 × 2.72 × 0.36 | centre, base | door overlay for a wall face (centred, half sunk into the wall) |
| `/assets/models/itch/psx-medieval/decoration/flower_box.glb` | 35 | 126 | 1.39 × 1.12 × 0.89 | -0.73..0.66, -0.41..0.48, base | window flower box (alpha-cut flowers) |
| `/assets/models/itch/psx-medieval/decoration/flower_box_alt.glb` | 35 | 126 | 1.39 × 1.12 × 0.89 | -0.73..0.66, -0.41..0.48, base | window flower box (alpha-cut flowers) |
| `/assets/models/itch/psx-medieval/decoration/flower_box_alt2.glb` | 35 | 126 | 1.39 × 1.11 × 0.89 | -0.73..0.66, -0.41..0.48, base | window flower box (alpha-cut flowers) |
| `/assets/models/itch/psx-medieval/decoration/flower_mixed.glb` | 31 | 48 | 0.89 × 0.77 × 0.89 | 0→+X, -0.48..0.41, y -0.04..0.73 | flower clump (alpha-cut) |
| `/assets/models/itch/psx-medieval/decoration/flower_purple.glb` | 31 | 48 | 0.89 × 0.77 × 0.89 | 0→+X, -0.48..0.41, y -0.04..0.73 | flower clump (alpha-cut) |
| `/assets/models/itch/psx-medieval/decoration/flower_red.glb` | 31 | 48 | 0.89 × 0.77 × 0.89 | 0→+X, -0.48..0.41, y -0.04..0.73 | flower clump (alpha-cut) |
| `/assets/models/itch/psx-medieval/decoration/flower_yellow.glb` | 31 | 48 | 0.89 × 0.77 × 0.89 | 0→+X, -0.48..0.41, y -0.04..0.73 | flower clump (alpha-cut) |
| `/assets/models/itch/psx-medieval/decoration/overhang.glb` | 32 | 40 | 2.50 × 0.26 × 1.68 | 0→+X, -1.25..0.43, y -0.12..0.14 | roof overhang / porch canopy strip |
| `/assets/models/itch/psx-medieval/decoration/overhang_end.glb` | 33 | 60 | 2.62 × 0.26 × 1.68 | 0→+X, -1.25..0.43, y -0.12..0.14 | roof overhang / porch canopy strip |
| `/assets/models/itch/psx-medieval/decoration/overhang_large.glb` | 35 | 96 | 5.00 × 0.26 × 1.68 | 0→+X, -1.25..0.43, y -0.12..0.14 | roof overhang / porch canopy strip |
| `/assets/models/itch/psx-medieval/decoration/overhang_large_end.glb` | 36 | 116 | 5.12 × 0.26 × 1.68 | 0→+X, -1.25..0.43, y -0.12..0.14 | roof overhang / porch canopy strip |
| `/assets/models/itch/psx-medieval/decoration/overhang_wood.glb` | 30 | 20 | 0.25 × 0.26 × 1.68 | cx, 0→+Z, y -0.12..0.14 | roof overhang / porch canopy strip |
| `/assets/models/itch/psx-medieval/decoration/stairs_stone_stone.glb` | 43 | 248 | 2.55 × 1.88 × 3.14 | -0.05..2.50, -2.81..0.33, y -0.38..1.50 | stairs, climb toward −Z (top edge at the back) |
| `/assets/models/itch/psx-medieval/decoration/stairs_stone_stone_corner.glb` | 42 | 271 | 3.92 × 3.25 × 3.83 | -0.08..3.83, -0.06..3.77, y -0.12..3.12 | stairs, climb toward −Z (top edge at the back) |
| `/assets/models/itch/psx-medieval/decoration/stairs_wood.glb` | 38 | 128 | 2.53 × 1.27 × 2.73 | 0→+X, -2.62..0.11, base | stairs, climb toward −Z (top edge at the back) |
| `/assets/models/itch/psx-medieval/decoration/stairs_wood_stone.glb` | 42 | 248 | 2.55 × 1.75 × 3.13 | -0.05..2.50, -2.80..0.33, y -0.25..1.50 | stairs, climb toward −Z (top edge at the back) |
| `/assets/models/itch/psx-medieval/decoration/stairs_wood_stone_corner.glb` | 40 | 228 | 3.92 × 3.25 × 3.83 | -0.08..3.83, -0.06..3.77, y -0.12..3.12 | stairs, climb toward −Z (top edge at the back) |
| `/assets/models/itch/psx-medieval/decoration/stairs_wood_wood_large.glb` | 99 | 1172 | 2.69 × 4.06 × 6.01 | -0.09..2.60, -5.08..0.93, y -0.37..3.69 | stairs, climb toward −Z (top edge at the back) |
| `/assets/models/itch/psx-medieval/decoration/stone_windowsill.glb` | 30 | 16 | 1.50 × 0.26 × 0.53 | cx, 0→+Z, y -0.13..0.13 | window sill |
| `/assets/models/itch/psx-medieval/decoration/stairs_stone.glb` | 38 | 128 | 2.53 × 1.27 × 2.73 | 0→+X, -2.62..0.11, base | stairs, climb toward −Z (top edge at the back) |
| `/assets/models/itch/psx-medieval/decoration/stairs_wood_wood.glb` | 56 | 452 | 2.60 × 2.62 × 3.45 | 0→+X, -2.59..0.85, y -0.37..2.26 | stairs, climb toward −Z (top edge at the back) |
| `/assets/models/itch/psx-medieval/decoration/vine_corner.glb` | 34 | 128 | 1.56 × 1.90 × 1.11 | -0.72..0.84, -0.67..0.44, base | ivy / vine decal (alpha-cut, double sided) |
| `/assets/models/itch/psx-medieval/decoration/vine_corner_alt.glb` | 35 | 136 | 1.58 × 1.91 × 1.11 | -0.72..0.86, -0.67..0.44, base | ivy / vine decal (alpha-cut, double sided) |
| `/assets/models/itch/psx-medieval/decoration/vine_hanging.glb` | 33 | 96 | 1.32 × 2.94 × 0.39 | -0.83..0.50, cz, y -2.90..0.03 | ivy / vine decal (alpha-cut, double sided) |
| `/assets/models/itch/psx-medieval/decoration/vine_hanging_alt.glb` | 33 | 96 | 1.24 × 2.71 × 0.37 | centre, top (hangs) | ivy / vine decal (alpha-cut, double sided) |
| `/assets/models/itch/psx-medieval/decoration/vine_single.glb` | 29 | 8 | 0.63 × 0.65 × 0.10 | 0→+X, cz, base | ivy / vine decal (alpha-cut, double sided) |
| `/assets/models/itch/psx-medieval/decoration/vine_single_alt.glb` | 29 | 8 | 0.63 × 0.65 × 0.10 | 0→+X, cz, base | ivy / vine decal (alpha-cut, double sided) |
| `/assets/models/itch/psx-medieval/decoration/window_rectangle.glb` | 31 | 28 | 1.19 × 2.11 × 0.28 | centre, base | window overlay for a wall face |
| `/assets/models/itch/psx-medieval/decoration/window_round.glb` | 34 | 76 | 1.46 × 1.46 × 0.38 | centre, base | window overlay for a wall face |
| `/assets/models/itch/psx-medieval/decoration/window_rounded.glb` | 33 | 76 | 1.19 × 2.11 × 0.28 | centre, base | window overlay for a wall face |
| `/assets/models/itch/psx-medieval/decoration/window_square.glb` | 31 | 28 | 1.19 × 1.14 × 0.31 | centre, base | window overlay for a wall face |
| `/assets/models/itch/psx-medieval/decoration/wood_windowsill.glb` | 30 | 16 | 1.50 × 0.26 × 0.53 | cx, 0→+Z, y -0.13..0.13 | window sill |


### 2.3 market (`/assets/models/itch/psx-medieval/market/`, 83 files)

| URL | KB | tris | W × H × D (m) | pivot | intended use |
|---|---:|---:|---|---|---|
| `/assets/models/itch/psx-medieval/market/barrel_filler_apples.glb` | 39 | 98 | 1.00 × 0.33 × 1.00 | centre, y 1.20..1.52 | produce filling that sits inside an open barrel (keeps its height) |
| `/assets/models/itch/psx-medieval/market/basket.glb` | 40 | 146 | 0.98 × 0.92 × 1.13 | centre, base | woven basket |
| `/assets/models/itch/psx-medieval/market/baguette.glb` | 18 | 104 | 0.18 × 0.11 × 1.19 | centre, base | bread (food / consumable pickup) |
| `/assets/models/itch/psx-medieval/market/barrel.glb` | 58 | 252 | 1.23 × 1.43 × 1.23 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_apples.glb` | 99 | 392 | 1.22 × 1.53 × 1.22 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_apples_small.glb` | 99 | 392 | 0.89 × 1.11 × 0.89 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_beans.glb` | 93 | 332 | 1.23 × 1.49 × 1.23 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_beans_small.glb` | 93 | 332 | 0.89 × 1.07 × 0.89 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_eggplant.glb` | 105 | 508 | 1.23 × 1.52 × 1.23 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_eggplant_small.glb` | 105 | 508 | 0.89 × 1.10 × 0.89 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_lid.glb` | 15 | 44 | 0.96 × 0.07 × 0.96 | centre, base | barrel lid (stack on barrels) |
| `/assets/models/itch/psx-medieval/market/barrel_lid_alt.glb` | 50 | 120 | 0.96 × 0.20 × 0.96 | centre, base | barrel lid (stack on barrels) |
| `/assets/models/itch/psx-medieval/market/barrel_lid_alt2.glb` | 48 | 82 | 0.96 × 0.22 × 0.96 | centre, base | barrel lid (stack on barrels) |
| `/assets/models/itch/psx-medieval/market/barrel_lid_small.glb` | 15 | 44 | 0.72 × 0.07 × 0.72 | centre, base | barrel lid (stack on barrels) |
| `/assets/models/itch/psx-medieval/market/barrel_lid_small_alt.glb` | 50 | 120 | 0.72 × 0.18 × 0.72 | centre, base | barrel lid (stack on barrels) |
| `/assets/models/itch/psx-medieval/market/barrel_lid_small_alt2.glb` | 48 | 82 | 0.72 × 0.22 × 0.72 | centre, base | barrel lid (stack on barrels) |
| `/assets/models/itch/psx-medieval/market/barrel_onion.glb` | 99 | 392 | 1.23 × 1.52 × 1.23 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_onion_small.glb` | 99 | 392 | 0.89 × 1.12 × 0.89 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_open.glb` | 61 | 294 | 1.23 × 1.43 × 1.23 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_open_small.glb` | 61 | 294 | 0.89 × 1.04 × 0.89 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_potatoes.glb` | 101 | 464 | 1.23 × 1.50 × 1.23 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_potatoes_small.glb` | 101 | 464 | 0.90 × 1.11 × 0.90 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/barrel_small.glb` | 58 | 252 | 0.91 × 1.06 × 0.91 | centre, base | market barrel (breakable) |
| `/assets/models/itch/psx-medieval/market/basket_apples.glb` | 42 | 176 | 0.98 × 0.92 × 1.13 | centre, base | woven basket |
| `/assets/models/itch/psx-medieval/market/basket_beans.glb` | 42 | 176 | 0.98 × 0.92 × 1.13 | centre, base | woven basket |
| `/assets/models/itch/psx-medieval/market/basket_eggplants.glb` | 42 | 176 | 0.98 × 0.92 × 1.13 | centre, base | woven basket |
| `/assets/models/itch/psx-medieval/market/basket_onions.glb` | 42 | 176 | 0.98 × 0.92 × 1.13 | centre, base | woven basket |
| `/assets/models/itch/psx-medieval/market/basket_potatoes.glb` | 42 | 176 | 0.98 × 0.92 × 1.13 | centre, base | woven basket |
| `/assets/models/itch/psx-medieval/market/basket_tomatoes.glb` | 42 | 176 | 0.98 × 0.92 × 1.13 | centre, base | woven basket |
| `/assets/models/itch/psx-medieval/market/barrel_filler_beans.glb` | 33 | 38 | 0.98 × 0.16 × 0.98 | centre, y 1.09..1.25 | produce filling that sits inside an open barrel (keeps its height) |
| `/assets/models/itch/psx-medieval/market/bread.glb` | 16 | 84 | 0.31 × 0.18 × 0.45 | cx, -0.06..0.39, base | bread (food / consumable pickup) |
| `/assets/models/itch/psx-medieval/market/bread_small.glb` | 15 | 84 | 0.18 × 0.11 × 0.56 | centre, base | bread (food / consumable pickup) |
| `/assets/models/itch/psx-medieval/market/crate.glb` | 33 | 28 | 0.58 × 0.30 × 0.92 | centre, base | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_angled.glb` | 33 | 28 | 0.58 × 0.72 × 0.95 | cx, -0.40..0.55, y -0.23..0.49 | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_apples.glb` | 34 | 60 | 0.58 × 0.30 × 0.92 | centre, base | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_apples_angled.glb` | 34 | 60 | 0.58 × 0.72 × 0.95 | cx, -0.40..0.55, y -0.23..0.49 | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_beans.glb` | 34 | 60 | 0.58 × 0.30 × 0.92 | centre, base | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_beans_angled.glb` | 34 | 60 | 0.58 × 0.72 × 0.95 | cx, -0.40..0.55, y -0.23..0.49 | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_eggplants.glb` | 34 | 60 | 0.58 × 0.31 × 0.92 | centre, base | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_eggplants_angled.glb` | 34 | 60 | 0.58 × 0.72 × 0.95 | cx, -0.40..0.55, y -0.23..0.49 | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_onions.glb` | 34 | 60 | 0.58 × 0.30 × 0.92 | centre, base | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_onions_angled.glb` | 34 | 60 | 0.58 × 0.72 × 0.95 | cx, -0.40..0.55, y -0.23..0.49 | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_potatoes.glb` | 34 | 60 | 0.58 × 0.30 × 0.92 | centre, base | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_potatoes_angled.glb` | 34 | 60 | 0.58 × 0.72 × 0.95 | cx, -0.40..0.55, y -0.23..0.49 | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_tomatoes.glb` | 34 | 60 | 0.58 × 0.32 × 0.92 | centre, base | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/crate_tomatoes_angled.glb` | 34 | 60 | 0.58 × 0.72 × 0.95 | cx, -0.40..0.55, y -0.23..0.49 | market crate / produce crate |
| `/assets/models/itch/psx-medieval/market/barrel_filler_eggplant.glb` | 47 | 214 | 0.98 × 0.27 × 0.98 | centre, y 1.01..1.28 | produce filling that sits inside an open barrel (keeps its height) |
| `/assets/models/itch/psx-medieval/market/hay.glb` | 24 | 92 | 5.00 × 2.86 × 5.00 | centre, base | hay pile / bale (farms, stables) |
| `/assets/models/itch/psx-medieval/market/hay_covered.glb` | 125 | 1140 | 6.81 × 2.90 × 6.81 | centre, base | hay pile / bale (farms, stables) |
| `/assets/models/itch/psx-medieval/market/hay_covered_dry.glb` | 125 | 1140 | 6.81 × 2.90 × 6.81 | centre, base | hay pile / bale (farms, stables) |
| `/assets/models/itch/psx-medieval/market/hay_dry.glb` | 24 | 92 | 5.00 × 2.86 × 5.00 | centre, base | hay pile / bale (farms, stables) |
| `/assets/models/itch/psx-medieval/market/haybale.glb` | 21 | 44 | 2.25 × 0.99 × 1.69 | centre, base | hay pile / bale (farms, stables) |
| `/assets/models/itch/psx-medieval/market/haybale_dry.glb` | 21 | 44 | 2.25 × 0.99 × 1.69 | centre, base | hay pile / bale (farms, stables) |
| `/assets/models/itch/psx-medieval/market/haybale_wrapped.glb` | 57 | 124 | 2.25 × 1.00 × 1.69 | centre, base | hay pile / bale (farms, stables) |
| `/assets/models/itch/psx-medieval/market/haybale_wrapped_alt.glb` | 64 | 224 | 2.25 × 1.03 × 1.69 | centre, base | hay pile / bale (farms, stables) |
| `/assets/models/itch/psx-medieval/market/haybale_wrapped_alt_dry.glb` | 63 | 224 | 2.25 × 1.03 × 1.69 | centre, base | hay pile / bale (farms, stables) |
| `/assets/models/itch/psx-medieval/market/haybale_wrapped_dry.glb` | 57 | 124 | 2.25 × 1.00 × 1.69 | centre, base | hay pile / bale (farms, stables) |
| `/assets/models/itch/psx-medieval/market/jutesack_closed.glb` | 11 | 120 | 0.94 × 1.04 × 0.57 | centre, base | jute sack |
| `/assets/models/itch/psx-medieval/market/jutesack_closed_alt.glb` | 11 | 120 | 0.82 × 1.09 × 0.89 | centre, base | jute sack |
| `/assets/models/itch/psx-medieval/market/jutesack_open.glb` | 15 | 144 | 0.91 × 0.97 × 0.68 | centre, base | jute sack |
| `/assets/models/itch/psx-medieval/market/jutesack_open_alt.glb` | 12 | 144 | 0.86 × 0.85 × 0.95 | centre, base | jute sack |
| `/assets/models/itch/psx-medieval/market/market_stall_blue.glb` | 114 | 974 | 5.53 × 3.51 × 4.33 | -0.26..5.27, -4.19..0.14, y -0.12..3.39 | market stall with striped awning (vendor NPC) |
| `/assets/models/itch/psx-medieval/market/market_stall_red.glb` | 114 | 974 | 5.53 × 3.51 × 4.33 | -0.26..5.27, -4.19..0.14, y -0.12..3.39 | market stall with striped awning (vendor NPC) |
| `/assets/models/itch/psx-medieval/market/market_stall_round_blue.glb` | 100 | 760 | 4.67 × 6.17 × 5.21 | cx, -2.46..2.75, y -0.14..6.03 | round market tent (merchant / vendor NPC) |
| `/assets/models/itch/psx-medieval/market/market_stall_round_red.glb` | 100 | 760 | 4.67 × 6.17 × 5.21 | cx, -2.46..2.75, y -0.14..6.03 | round market tent (merchant / vendor NPC) |
| `/assets/models/itch/psx-medieval/market/market_stall_round_yellow.glb` | 100 | 760 | 4.67 × 6.17 × 5.21 | cx, -2.46..2.75, y -0.14..6.03 | round market tent (merchant / vendor NPC) |
| `/assets/models/itch/psx-medieval/market/market_stall_yellow.glb` | 114 | 974 | 5.53 × 3.51 × 4.33 | -0.26..5.27, -4.19..0.14, y -0.12..3.39 | market stall with striped awning (vendor NPC) |
| `/assets/models/itch/psx-medieval/market/meat_slab.glb` | 13 | 48 | 0.44 × 0.62 × 0.26 | centre, y -0.31..0.31 | butcher goods (hang from stalls; centre pivot) |
| `/assets/models/itch/psx-medieval/market/meat_slab_alt.glb` | 13 | 48 | 0.44 × 0.62 × 0.37 | centre, y -0.31..0.31 | butcher goods (hang from stalls; centre pivot) |
| `/assets/models/itch/psx-medieval/market/meatcube.glb` | 53 | 176 | 0.42 × 0.48 × 0.42 | centre, y -0.25..0.23 | butcher goods (hang from stalls; centre pivot) |
| `/assets/models/itch/psx-medieval/market/pork_leg.glb` | 17 | 92 | 0.62 × 1.18 × 0.52 | cx, -0.20..0.33, y -0.27..0.90 | butcher goods (hang from stalls; centre pivot) |
| `/assets/models/itch/psx-medieval/market/barrel_filler_potatoes.glb` | 43 | 170 | 0.98 × 0.21 × 0.98 | centre, y 1.05..1.26 | produce filling that sits inside an open barrel (keeps its height) |
| `/assets/models/itch/psx-medieval/market/pumpkin.glb` | 17 | 88 | 0.53 × 0.45 × 0.61 | centre, base | pumpkin |
| `/assets/models/itch/psx-medieval/market/sausage.glb` | 15 | 40 | 0.16 × 0.46 × 0.16 | centre, y -0.32..0.14 | butcher goods (hang from stalls; centre pivot) |
| `/assets/models/itch/psx-medieval/market/sausage_link.glb` | 38 | 336 | 0.41 × 1.08 × 0.12 | -0.05..0.37, cz, y -0.20..0.88 | butcher goods (hang from stalls; centre pivot) |
| `/assets/models/itch/psx-medieval/market/table.glb` | 26 | 168 | 3.92 × 1.10 × 1.73 | centre, base | long market table (top at 1.10 m) |
| `/assets/models/itch/psx-medieval/market/table_prebuild.glb` | 78 | 584 | 3.98 × 1.73 × 1.78 | centre, base | market table already dressed with goods |
| `/assets/models/itch/psx-medieval/market/terracotta_vase.glb` | 48 | 280 | 1.05 × 1.30 × 1.05 | centre, base | terracotta jar / lid |
| `/assets/models/itch/psx-medieval/market/terracotta_vase_open.glb` | 33 | 236 | 1.05 × 1.24 × 1.05 | centre, base | terracotta jar / lid |
| `/assets/models/itch/psx-medieval/market/terracotta_vase_open_small.glb` | 33 | 236 | 0.82 × 0.98 × 0.82 | centre, base | terracotta jar / lid |
| `/assets/models/itch/psx-medieval/market/terracotta_vase_small.glb` | 47 | 280 | 0.82 × 1.01 × 0.82 | centre, base | terracotta jar / lid |
| `/assets/models/itch/psx-medieval/market/vase_lid.glb` | 15 | 44 | 0.73 × 0.11 × 0.73 | centre, base | terracotta jar / lid |
| `/assets/models/itch/psx-medieval/market/vase_lid_small.glb` | 15 | 44 | 0.58 × 0.09 × 0.58 | centre, base | terracotta jar / lid |


### 2.4 roofs (`/assets/models/itch/psx-medieval/roofs/`, 33 files)

| URL | KB | tris | W × H × D (m) | pivot | intended use |
|---|---:|---:|---|---|---|
| `/assets/models/itch/psx-medieval/roofs/roof_blue.glb` | 40 | 184 | 5.00 × 3.20 × 5.96 | 0→+X, -5.48..0.48, y -0.46..2.74 | straight gable roof section over one 5 m block |
| `/assets/models/itch/psx-medieval/roofs/roof_blue_T.glb` | 40 | 174 | 5.49 × 3.20 × 5.03 | -0.48..5.01, −Z←0, y -0.46..2.74 | T-junction roof |
| `/assets/models/itch/psx-medieval/roofs/roof_blue_corner.glb` | 42 | 189 | 5.50 × 3.20 × 5.49 | 0→+X, -0.48..5.01, y -0.46..2.74 | roof corner piece (occupies the +Z neighbour cell) |
| `/assets/models/itch/psx-medieval/roofs/roof_blue_dormer_window.glb` | 36 | 106 | 2.31 × 2.42 × 3.21 | -0.24..2.07, -2.75..0.46, base | dormer window for a roof slope |
| `/assets/models/itch/psx-medieval/roofs/roof_blue_end.glb` | 32 | 44 | 5.96 × 3.20 × 0.62 | -0.48..5.48, 0→+Z, y -0.46..2.74 | gable end cap of a roof row |
| `/assets/models/itch/psx-medieval/roofs/roof_blue_half.glb` | 36 | 112 | 2.50 × 3.20 × 5.96 | 0→+X, -5.48..0.48, y -0.46..2.74 | half-width roof (2.5 m) |
| `/assets/models/itch/psx-medieval/roofs/roof_blue_square.glb` | 43 | 202 | 5.96 × 3.17 × 5.96 | -0.48..5.48, -5.48..0.48, y -0.46..2.71 | pyramid / hip roof over one block |
| `/assets/models/itch/psx-medieval/roofs/roof_blue_square_fancy.glb` | 45 | 234 | 5.96 × 3.47 × 5.96 | -0.48..5.48, -5.48..0.48, y -0.46..3.01 | pyramid roof with lantern top (towers) |
| `/assets/models/itch/psx-medieval/roofs/roof_blue_stickout.glb` | 40 | 174 | 5.25 × 3.38 × 1.88 | -0.12..5.12, -1.25..0.62, y -0.12..3.25 | projecting bay window with roof |
| `/assets/models/itch/psx-medieval/roofs/roof_blue_stickout_large.glb` | 42 | 212 | 5.25 × 5.25 × 3.12 | -0.12..5.12, -2.50..0.62, y -0.12..5.12 | large projecting upper storey bay with roof |
| `/assets/models/itch/psx-medieval/roofs/roof_blue_stickout_triangle_roof.glb` | 39 | 160 | 5.25 × 5.12 × 2.94 | -0.12..5.12, -2.50..0.44, y -0.12..5.00 | gabled bay that sticks out of a facade |
| `/assets/models/itch/psx-medieval/roofs/roof_red.glb` | 40 | 184 | 5.00 × 3.20 × 5.96 | 0→+X, -5.48..0.48, y -0.46..2.74 | straight gable roof section over one 5 m block |
| `/assets/models/itch/psx-medieval/roofs/roof_red_T.glb` | 40 | 174 | 5.49 × 3.20 × 5.03 | -0.48..5.01, −Z←0, y -0.46..2.74 | T-junction roof |
| `/assets/models/itch/psx-medieval/roofs/roof_red_corner.glb` | 42 | 189 | 5.50 × 3.20 × 5.49 | 0→+X, -0.48..5.01, y -0.46..2.74 | roof corner piece (occupies the +Z neighbour cell) |
| `/assets/models/itch/psx-medieval/roofs/roof_red_dormer_window.glb` | 36 | 106 | 2.31 × 2.42 × 3.21 | -0.24..2.07, -2.75..0.46, base | dormer window for a roof slope |
| `/assets/models/itch/psx-medieval/roofs/roof_red_end.glb` | 32 | 44 | 5.96 × 3.20 × 0.62 | -0.48..5.48, 0→+Z, y -0.46..2.74 | gable end cap of a roof row |
| `/assets/models/itch/psx-medieval/roofs/roof_red_half.glb` | 36 | 112 | 2.50 × 3.20 × 5.96 | 0→+X, -5.48..0.48, y -0.46..2.74 | half-width roof (2.5 m) |
| `/assets/models/itch/psx-medieval/roofs/roof_red_square.glb` | 43 | 202 | 5.96 × 3.17 × 5.96 | -0.48..5.48, -5.48..0.48, y -0.46..2.71 | pyramid / hip roof over one block |
| `/assets/models/itch/psx-medieval/roofs/roof_red_square_fancy.glb` | 45 | 234 | 5.96 × 3.47 × 5.96 | -0.48..5.48, -5.48..0.48, y -0.46..3.01 | pyramid roof with lantern top (towers) |
| `/assets/models/itch/psx-medieval/roofs/roof_red_stickout.glb` | 40 | 174 | 5.25 × 3.38 × 1.88 | -0.12..5.12, -1.25..0.62, y -0.12..3.25 | projecting bay window with roof |
| `/assets/models/itch/psx-medieval/roofs/roof_red_stickout_large.glb` | 42 | 212 | 5.25 × 5.25 × 3.12 | -0.12..5.12, -2.50..0.62, y -0.12..5.12 | large projecting upper storey bay with roof |
| `/assets/models/itch/psx-medieval/roofs/roof_red_stickout_triangle_roof.glb` | 39 | 160 | 5.25 × 5.12 × 2.94 | -0.12..5.12, -2.50..0.44, y -0.12..5.00 | gabled bay that sticks out of a facade |
| `/assets/models/itch/psx-medieval/roofs/roof_straw.glb` | 40 | 184 | 5.00 × 3.20 × 5.96 | 0→+X, -5.48..0.48, y -0.46..2.74 | straight gable roof section over one 5 m block |
| `/assets/models/itch/psx-medieval/roofs/roof_straw_T.glb` | 40 | 174 | 5.49 × 3.20 × 5.03 | -0.48..5.01, −Z←0, y -0.46..2.74 | T-junction roof |
| `/assets/models/itch/psx-medieval/roofs/roof_straw_corner.glb` | 42 | 189 | 5.50 × 3.20 × 5.49 | 0→+X, -0.48..5.01, y -0.46..2.74 | roof corner piece (occupies the +Z neighbour cell) |
| `/assets/models/itch/psx-medieval/roofs/roof_straw_dormer_window.glb` | 36 | 106 | 2.31 × 2.42 × 3.21 | -0.24..2.07, -2.75..0.46, base | dormer window for a roof slope |
| `/assets/models/itch/psx-medieval/roofs/roof_straw_end.glb` | 32 | 44 | 5.96 × 3.20 × 0.62 | -0.48..5.48, 0→+Z, y -0.46..2.74 | gable end cap of a roof row |
| `/assets/models/itch/psx-medieval/roofs/roof_straw_half.glb` | 36 | 112 | 2.50 × 3.20 × 5.96 | 0→+X, -5.48..0.48, y -0.46..2.74 | half-width roof (2.5 m) |
| `/assets/models/itch/psx-medieval/roofs/roof_straw_square.glb` | 43 | 202 | 5.96 × 3.17 × 5.96 | -0.48..5.48, -5.48..0.48, y -0.46..2.71 | pyramid / hip roof over one block |
| `/assets/models/itch/psx-medieval/roofs/roof_straw_square_fancy.glb` | 45 | 234 | 5.96 × 3.47 × 5.96 | -0.48..5.48, -5.48..0.48, y -0.46..3.01 | pyramid roof with lantern top (towers) |
| `/assets/models/itch/psx-medieval/roofs/roof_straw_stickout.glb` | 40 | 174 | 5.25 × 3.38 × 1.88 | -0.12..5.12, -1.25..0.62, y -0.12..3.25 | projecting bay window with roof |
| `/assets/models/itch/psx-medieval/roofs/roof_straw_stickout_large.glb` | 42 | 212 | 5.25 × 5.25 × 3.12 | -0.12..5.12, -2.50..0.62, y -0.12..5.12 | large projecting upper storey bay with roof |
| `/assets/models/itch/psx-medieval/roofs/roof_straw_stickout_triangle_roof.glb` | 39 | 160 | 5.25 × 5.12 × 2.94 | -0.12..5.12, -2.50..0.44, y -0.12..5.00 | gabled bay that sticks out of a facade |


## 3. PSX Fantasy Pack: Nocturnal Watch (toboas, CC0) — `/assets/models/itch/nocturnal-watch/`

Hand-painted PSX horror-village assets. The FBX files point at texture files that are not in the archive, so every material
was rebuilt from the PNG/JPG next to each model. Characters are 1.8 m in the source → **×4/3 = 2.4 m**, matching the hero.
The environment pieces were not modelled at one consistent scale, so they were sized individually:

* ×4/3: characters, `church`, `bridge`, `pine_tree`, `banner`, `signpost`, `steel_sword`, `church_fence`.
* ×15/11 (= ×1.36): the tavern kit and tavern props — the 2.2-unit wall pieces become **exactly 3.0 m** wide (4.09 m tall),
  so they tile on a 3 m grid. Pieces are split from one FBX into one GLB each; `tavern_wall_half_window` and
  `tavern_top_ridge` keep their height so they stack on the lower pieces.
* ×1.0: `church_altar`, `church_bench` (a ×4/3 pew would be 1.8 m tall).
* explicit sizes (source 2–4× too big): `tower` 30 m (door 3 m), `well` 3 m, `barrel` 1.4, `crate` 1.2, `torch` 1.2,
  hut props (`cauldron` 1.3, `crow` 0.6, `ritual_dagger` 1.2, `fish`/`rat` 0.8–0.9, `severed_leg` 0.6).
* The six NPCs are **unrigged static meshes in T-pose** (no armature in the source). Use them as idle townsfolk / statues
  or rig them later; arms span 2.15 m, so give them a slightly larger interaction radius.
* Textures were cropped to the UV footprint of each split prop before reducing to ≤256 px, so small props keep detail.

| URL | KB | tris | W × H × D (m) | pivot | intended use |
|---|---:|---:|---|---|---|
| `/assets/models/itch/nocturnal-watch/bridge.glb` | 233 | 442 | 9.68 × 8.37 × 26.67 | centre, base | stone arch bridge, 26.7 m long, path along Z (river crossings in the hub town) |
| `/assets/models/itch/nocturnal-watch/npc_bartender.glb` | 47 | 488 | 2.15 × 2.41 × 0.40 | centre, base | tavern keeper NPC (static T-pose, unrigged) |
| `/assets/models/itch/nocturnal-watch/npc_inquisitor.glb` | 161 | 1466 | 2.87 × 2.65 × 0.50 | centre, base | armoured inquisitor NPC / quest giver (static T-pose; helmet is part of the mesh) |
| `/assets/models/itch/nocturnal-watch/npc_maid.glb` | 49 | 618 | 2.15 × 2.37 × 0.41 | centre, base | tavern maid NPC (static T-pose) |
| `/assets/models/itch/nocturnal-watch/npc_nun.glb` | 55 | 622 | 2.15 × 2.43 × 0.43 | centre, base | nun / priestess NPC (static T-pose) |
| `/assets/models/itch/nocturnal-watch/npc_peasant.glb` | 50 | 478 | 2.15 × 2.41 × 0.40 | centre, base | villager NPC (static T-pose) |
| `/assets/models/itch/nocturnal-watch/npc_peasant_blonde.glb` | 55 | 478 | 2.15 × 2.41 × 0.40 | centre, base | villager NPC, blonde texture variant (same mesh) |
| `/assets/models/itch/nocturnal-watch/witch.glb` | 179 | 1535 | 2.94 × 4.23 × 0.90 | centre, base | tall witch figure (4.2 m), static: statue, boss spawn decor or future rig |
| `/assets/models/itch/nocturnal-watch/church.glb` | 230 | 980 | 11.98 × 13.60 × 19.11 | centre, base | village church (13.6 m), front door faces +Z; `church_door` node has its origin on the hinge (rotate .rotation.y to open) |
| `/assets/models/itch/nocturnal-watch/church_altar.glb` | 85 | 458 | 2.57 × 3.21 × 1.37 | centre, base | altar with cross (church interior, shrines) |
| `/assets/models/itch/nocturnal-watch/church_bench.glb` | 47 | 124 | 3.05 × 1.33 × 0.86 | centre, base | church pew |
| `/assets/models/itch/nocturnal-watch/church_fence.glb` | 96 | 528 | 1.51 × 1.01 × 0.49 | centre, base | stone balustrade / altar rail segment 1.5 m |
| `/assets/models/itch/nocturnal-watch/ritual_dagger.glb` | 56 | 240 | 0.45 × 1.20 × 0.09 | centre, base | wavy ritual dagger (witch hut decor or loot) |
| `/assets/models/itch/nocturnal-watch/crow.glb` | 70 | 442 | 0.38 × 0.60 × 1.15 | centre, base | crow (decor, perched) |
| `/assets/models/itch/nocturnal-watch/fish.glb` | 39 | 112 | 0.80 × 0.33 × 0.11 | centre, base | fish (market / hut decor) |
| `/assets/models/itch/nocturnal-watch/cauldron.glb` | 59 | 318 | 1.59 × 1.30 × 1.36 | centre, base | witch cauldron (alchemy station) |
| `/assets/models/itch/nocturnal-watch/severed_leg.glb` | 41 | 88 | 0.48 × 0.60 × 0.20 | centre, base | severed leg (horror / witch hut decor) |
| `/assets/models/itch/nocturnal-watch/rat.glb` | 48 | 256 | 0.90 × 0.23 × 0.27 | centre, base | rat (decor) |
| `/assets/models/itch/nocturnal-watch/pine_tree.glb` | 35 | 346 | 10.80 × 15.12 × 10.78 | centre, base | pine tree 15 m (alpha-cut needles) |
| `/assets/models/itch/nocturnal-watch/banner.glb` | 21 | 248 | 1.77 × 3.48 × 0.18 | centre, top (hangs) | hanging red banner 3.5 m, pivot at the rod (top) |
| `/assets/models/itch/nocturnal-watch/barrel.glb` | 69 | 204 | 1.16 × 1.40 × 1.16 | centre, base | barrel (breakable) |
| `/assets/models/itch/nocturnal-watch/crate.glb` | 35 | 156 | 1.20 × 1.20 × 1.20 | centre, base | crate (breakable) |
| `/assets/models/itch/nocturnal-watch/torch.glb` | 20 | 208 | 0.23 × 1.20 × 0.35 | cx, 0→+Z, base | wall torch; pivot at the wall plate (back), flame end up, sticks out toward +Z (add point light) |
| `/assets/models/itch/nocturnal-watch/signpost.glb` | 47 | 96 | 1.82 × 2.77 × 1.10 | centre, base | crossroads signpost |
| `/assets/models/itch/nocturnal-watch/steel_sword.glb` | 42 | 455 | 0.50 × 1.61 × 0.09 | centre, y -0.40..1.22 | steel longsword, grip at origin, blade +Y (same convention as KayKit weapons; 1.62 m) |
| `/assets/models/itch/nocturnal-watch/tavern_wall_base.glb` | 55 | 12 | 3.00 × 4.09 × 0.30 | centre, base | tavern kit: plain wall 3.0 × 4.09 (walls are 2.2 units in the source → exactly 3 m here) |
| `/assets/models/itch/nocturnal-watch/tavern_wall_half.glb` | 32 | 20 | 3.00 × 2.04 × 0.30 | centre, base | tavern kit: lower half wall (timber) |
| `/assets/models/itch/nocturnal-watch/tavern_wall_half_window.glb` | 28 | 178 | 3.00 × 2.04 × 0.43 | centre, y 2.05..4.09 | tavern kit: upper half wall with window, keeps y 2.05..4.09 (stack on wall_half) |
| `/assets/models/itch/nocturnal-watch/tavern_wall_base_door.glb` | 53 | 200 | 3.00 × 4.09 × 0.46 | centre, base | tavern kit: wall with doorway |
| `/assets/models/itch/nocturnal-watch/tavern_wall_base_window.glb` | 50 | 194 | 3.00 × 4.09 × 0.44 | centre, base | tavern kit: wall with window |
| `/assets/models/itch/nocturnal-watch/tavern_wall_pillar.glb` | 19 | 12 | 0.53 × 4.07 × 0.54 | centre, base | tavern kit: corner post between wall segments |
| `/assets/models/itch/nocturnal-watch/tavern_triangular_wall.glb` | 60 | 8 | 3.00 × 2.04 × 0.30 | centre, base | tavern kit: gable triangle |
| `/assets/models/itch/nocturnal-watch/tavern_top_ridge.glb` | 66 | 108 | 3.00 × 0.85 × 0.66 | centre, y 3.23..4.09 | tavern kit: wall plate / eave beam, keeps y 3.23..4.09 |
| `/assets/models/itch/nocturnal-watch/tavern_roof.glb` | 61 | 36 | 3.00 × 0.44 × 2.04 | centre, base | tavern kit: roof slab segment |
| `/assets/models/itch/nocturnal-watch/tavern_foundation.glb` | 20 | 20 | 3.00 × 0.95 × 0.57 | centre, base | tavern kit: stone foundation strip |
| `/assets/models/itch/nocturnal-watch/tavern_door.glb` | 44 | 24 | 2.16 × 3.24 × 0.30 | centre, base | tavern kit: door leaf for the doorway |
| `/assets/models/itch/nocturnal-watch/tavern_chimney.glb` | 59 | 128 | 0.78 × 1.95 × 0.77 | centre, base | tavern kit: chimney top |
| `/assets/models/itch/nocturnal-watch/tavern_bar.glb` | 27 | 36 | 3.73 × 1.68 × 1.67 | centre, base | bar counter |
| `/assets/models/itch/nocturnal-watch/tavern_bar_stool.glb` | 77 | 316 | 0.95 × 1.31 × 1.00 | centre, base | bar stool |
| `/assets/models/itch/nocturnal-watch/tavern_beer_mug.glb` | 57 | 392 | 0.35 × 0.31 × 0.25 | centre, base | beer mug |
| `/assets/models/itch/nocturnal-watch/tavern_bowl.glb` | 48 | 110 | 0.56 × 0.15 × 0.61 | centre, base | bowl |
| `/assets/models/itch/nocturnal-watch/tavern_jug.glb` | 46 | 236 | 0.25 × 0.53 × 0.25 | centre, base | clay jug |
| `/assets/models/itch/nocturnal-watch/tavern_cheese.glb` | 30 | 48 | 0.59 × 0.29 × 0.59 | centre, base | cheese wheel |
| `/assets/models/itch/nocturnal-watch/tavern_bread.glb` | 32 | 80 | 0.50 × 0.18 × 0.29 | centre, base | bread loaf |
| `/assets/models/itch/nocturnal-watch/tavern_wooden_spoon.glb` | 21 | 84 | 0.10 × 0.03 × 0.55 | centre, base | wooden spoon |
| `/assets/models/itch/nocturnal-watch/tavern_shelf.glb` | 59 | 168 | 3.81 × 0.49 × 0.69 | cx, 0→+Z, base | wall shelf, back pivot (y 0 = shelf bottom) |
| `/assets/models/itch/nocturnal-watch/tavern_wine_bottle.glb` | 32 | 188 | 0.20 × 0.62 × 0.20 | centre, base | wine bottle |
| `/assets/models/itch/nocturnal-watch/tavern_wine_bottle_02.glb` | 37 | 212 | 0.33 × 0.46 × 0.33 | centre, base | round wine bottle |
| `/assets/models/itch/nocturnal-watch/tavern_lantern.glb` | 35 | 268 | 0.44 × 0.69 × 0.45 | centre, base | lantern (table / hand) |
| `/assets/models/itch/nocturnal-watch/tavern_wall_lantern.glb` | 53 | 376 | 0.44 × 0.87 × 0.51 | cx, 0→+Z, base | lantern on a wall bracket, back pivot |
| `/assets/models/itch/nocturnal-watch/tavern_chandelier.glb` | 34 | 380 | 2.65 × 0.46 × 2.65 | centre, top (hangs) | wooden ring chandelier, pivot at top |
| `/assets/models/itch/nocturnal-watch/tavern_chain.glb` | 25 | 4 | 0.07 × 2.73 × 0.07 | centre, top (hangs) | hanging chain 2.7 m, pivot at top |
| `/assets/models/itch/nocturnal-watch/tavern_painting.glb` | 17 | 28 | 1.44 × 1.66 × 0.18 | cx, 0→+Z, base | framed painting (texture is mostly dark in the source), back pivot |
| `/assets/models/itch/nocturnal-watch/tower.glb` | 347 | 1818 | 12.34 × 30.00 × 12.91 | centre, base | round watch tower 30 m (landmark); door faces +X, `tower_door` node hinged |
| `/assets/models/itch/nocturnal-watch/well.glb` | 51 | 468 | 1.99 × 3.00 × 1.61 | centre, base | village well 3 m |


## 4. KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg, CC0) — `/assets/models/itch/fantasy-weapons-bits/`

Same scale and convention as the Adventurers weapons in `/assets/models/weapons/` (see `characters.md` 1.1):
**grip at the origin, blade along +Y**, `sword_a` 1.77 long vs. `sword_1handed` 1.78. Attach to `handslot.r` with
position (0, 0.0333, 0) and `rotation.y = π`; shields to `handslot.l` at (0, 0.017, 0.156). Bows lie along X, arrows along Z.
Every file embeds the same 256² gradient palette (`/assets/textures/itch/fantasy-weapons-bits/weapons-bits-texture.png`);
for loot drops / transmog share one material. Good fit for item drops and the +N upgrade glow.

| URL | KB | tris | W × H × D (m) | pivot | intended use |
|---|---:|---:|---|---|---|
| `/assets/models/itch/fantasy-weapons-bits/arrow_a.glb` | 7 | 64 | 0.15 × 0.13 × 1.21 | cx, -0.68..0.54, y -0.09..0.04 | arrow (projectile mesh, shaft along Z, tip toward +Z) |
| `/assets/models/itch/fantasy-weapons-bits/arrow_b.glb` | 26 | 602 | 0.18 × 0.15 × 1.26 | centre, y -0.07..0.07 | arrow (projectile mesh, shaft along Z, tip toward +Z) |
| `/assets/models/itch/fantasy-weapons-bits/axe_a.glb` | 42 | 1206 | 0.86 × 1.16 × 0.25 | centre, y -0.37..0.79 | 1H/2H axe |
| `/assets/models/itch/fantasy-weapons-bits/axe_b.glb` | 44 | 1246 | 1.15 × 1.66 × 0.25 | centre, y -0.41..1.25 | 1H/2H axe |
| `/assets/models/itch/fantasy-weapons-bits/axe_c.glb` | 37 | 890 | 0.76 × 1.35 × 0.20 | -0.61..0.15, cz, y -0.42..0.93 | 1H/2H axe |
| `/assets/models/itch/fantasy-weapons-bits/bow_a.glb` | 32 | 492 | 1.96 × 0.09 × 0.40 | cx, -0.35..0.05, y -0.05..0.05 | bow without string |
| `/assets/models/itch/fantasy-weapons-bits/bow_a_with_string.glb` | 43 | 700 | 1.96 × 0.09 × 0.40 | cx, -0.35..0.05, y -0.05..0.05 | bow with string (shoot pose) |
| `/assets/models/itch/fantasy-weapons-bits/bow_b.glb` | 149 | 2244 | 1.91 × 0.17 × 0.67 | centre, y -0.08..0.08 | bow without string |
| `/assets/models/itch/fantasy-weapons-bits/bow_b_with_string.glb` | 161 | 2368 | 1.91 × 0.17 × 0.67 | centre, y -0.08..0.08 | bow with string (shoot pose) |
| `/assets/models/itch/fantasy-weapons-bits/dagger_a.glb` | 19 | 374 | 0.44 × 1.29 × 0.15 | centre, y -0.26..1.03 | dagger |
| `/assets/models/itch/fantasy-weapons-bits/dagger_b.glb` | 20 | 502 | 0.60 × 1.36 × 0.10 | centre, y -0.23..1.13 | dagger |
| `/assets/models/itch/fantasy-weapons-bits/fistweapon_a.glb` | 13 | 218 | 0.23 × 0.09 × 0.32 | -0.17..0.05, cz, y -0.04..0.04 | claws / knuckles (fist weapon) |
| `/assets/models/itch/fantasy-weapons-bits/fistweapon_a_stacked.glb` | 23 | 436 | 0.43 × 0.16 × 0.35 | centre, base | claws / knuckles, stacked variant |
| `/assets/models/itch/fantasy-weapons-bits/fistweapon_b.glb` | 13 | 220 | 0.52 × 0.18 × 0.35 | -0.48..0.04, cz, y -0.04..0.13 | claws / knuckles (fist weapon) |
| `/assets/models/itch/fantasy-weapons-bits/fistweapon_b_stacked.glb` | 22 | 440 | 0.69 × 0.24 × 0.52 | cx, -0.18..0.33, base | claws / knuckles, stacked variant |
| `/assets/models/itch/fantasy-weapons-bits/halberd.glb` | 62 | 1496 | 1.29 × 2.75 × 0.29 | -0.79..0.50, cz, y -0.93..1.81 | halberd (polearm) |
| `/assets/models/itch/fantasy-weapons-bits/hammer_a.glb` | 25 | 524 | 0.81 × 1.14 × 0.45 | centre, y -0.39..0.74 | war hammer / mace |
| `/assets/models/itch/fantasy-weapons-bits/hammer_b.glb` | 30 | 712 | 0.65 × 1.51 × 0.68 | centre, y -0.47..1.03 | war hammer / mace |
| `/assets/models/itch/fantasy-weapons-bits/hammer_c.glb` | 34 | 840 | 0.46 × 1.39 × 0.46 | centre, y -0.20..1.19 | war hammer / mace |
| `/assets/models/itch/fantasy-weapons-bits/shield_a.glb` | 18 | 354 | 0.77 × 0.98 × 0.23 | cx, -0.15..0.08, y -0.55..0.43 | shield (handslot.l) |
| `/assets/models/itch/fantasy-weapons-bits/shield_b.glb` | 19 | 368 | 1.02 × 1.32 × 0.25 | cx, -0.15..0.09, y -0.78..0.55 | shield (handslot.l) |
| `/assets/models/itch/fantasy-weapons-bits/shield_c.glb` | 31 | 584 | 1.02 × 1.33 × 0.48 | cx, -0.17..0.32, y -0.67..0.67 | shield (handslot.l) |
| `/assets/models/itch/fantasy-weapons-bits/spear_a.glb` | 50 | 1216 | 0.28 × 3.14 × 0.25 | centre, y -1.03..2.11 | spear (polearm) |
| `/assets/models/itch/fantasy-weapons-bits/staff_a.glb` | 24 | 500 | 0.12 × 2.15 × 0.11 | centre, y -1.07..1.07 | staff (mage) |
| `/assets/models/itch/fantasy-weapons-bits/staff_b.glb` | 30 | 664 | 0.62 × 2.32 × 0.27 | centre, y -0.86..1.45 | staff (mage) |
| `/assets/models/itch/fantasy-weapons-bits/sword_a.glb` | 17 | 292 | 0.61 × 1.77 × 0.13 | centre, y -0.36..1.42 | sword |
| `/assets/models/itch/fantasy-weapons-bits/sword_b.glb` | 22 | 460 | 0.61 × 1.79 × 0.12 | centre, y -0.37..1.42 | sword |
| `/assets/models/itch/fantasy-weapons-bits/sword_c.glb` | 18 | 349 | 0.27 × 2.13 × 0.15 | centre, y -0.43..1.70 | sword |
| `/assets/models/itch/fantasy-weapons-bits/sword_d.glb` | 26 | 730 | 0.71 × 2.04 × 0.40 | centre, y -0.32..1.72 | sword |
| `/assets/models/itch/fantasy-weapons-bits/sword_e.glb` | 29 | 616 | 0.88 × 3.25 × 0.24 | centre, y -0.43..2.82 | greatsword (2H) |
| `/assets/models/itch/fantasy-weapons-bits/wand_a.glb` | 22 | 442 | 0.21 × 1.16 × 0.21 | centre, y -0.32..0.83 | wand (mage) |


## 5. Loose textures — `/assets/textures/itch/<pack>/` (indexed in `/assets/textures/itch/index.json`)

Tileable PSX textures for procedural floors/walls/props, and the exact atlases embedded in the GLBs (to build one shared
`MeshLambertMaterial`/PSX material per pack with `NearestFilter`). The dungeon tiles are 64 px (CC BY 4.0, credit goblinatron).

| path | size | category | tags |
|---|---|---|---|
| `/assets/textures/itch/psx-dungeon/crates-and-barrels-map.png` | 128x128 | atlas | psx, atlas, dungeon |
| `/assets/textures/itch/psx-dungeon/doors-map.png` | 128x128 | atlas | psx, atlas, dungeon |
| `/assets/textures/itch/psx-dungeon/dungeon-map.png` | 256x256 | atlas | psx, atlas, dungeon |
| `/assets/textures/itch/psx-dungeon/arch-02.png` | 64x64 | dungeon | psx, tile, stone, arch, wall |
| `/assets/textures/itch/psx-dungeon/barrel-01.png` | 64x64 | dungeon | psx, tile, wood, barrel |
| `/assets/textures/itch/psx-dungeon/candle-01.png` | 64x64 | dungeon | psx, tile, wax, candle |
| `/assets/textures/itch/psx-dungeon/chain-02.png` | 64x64 | dungeon | psx, tile, metal, chain, alpha |
| `/assets/textures/itch/psx-dungeon/crate-01.png` | 64x64 | dungeon | psx, tile, wood, crate |
| `/assets/textures/itch/psx-dungeon/decor-02.png` | 64x64 | dungeon | psx, tile, stone, ornament, floor |
| `/assets/textures/itch/psx-dungeon/door-01.png` | 64x128 | dungeon | psx, tile, door, wood, metal |
| `/assets/textures/itch/psx-dungeon/door-02.png` | 64x128 | dungeon | psx, tile, door, wood, metal |
| `/assets/textures/itch/psx-dungeon/ground-04.png` | 64x64 | dungeon | psx, tile, stone, floor, tiles |
| `/assets/textures/itch/psx-dungeon/lock-01.png` | 64x64 | dungeon | psx, tile, metal, lock, alpha |
| `/assets/textures/itch/psx-dungeon/metal-01.png` | 64x64 | dungeon | psx, tile, metal, plate |
| `/assets/textures/itch/psx-dungeon/pillar-01.png` | 64x64 | dungeon | psx, tile, stone, pillar, fluted |
| `/assets/textures/itch/psx-dungeon/planks-01.png` | 64x64 | dungeon | psx, tile, wood, planks, floor |
| `/assets/textures/itch/psx-dungeon/rusty-metal-01.png` | 64x64 | dungeon | psx, tile, metal, rust |
| `/assets/textures/itch/psx-dungeon/skull-wall.png` | 64x64 | dungeon | psx, tile, bone, skulls, wall, catacomb |
| `/assets/textures/itch/psx-dungeon/stair-02.png` | 64x64 | dungeon | psx, tile, stone, stairs |
| `/assets/textures/itch/psx-dungeon/wall-03.png` | 64x64 | dungeon | psx, tile, stone, bricks, wall |
| `/assets/textures/itch/psx-dungeon/water-01.png` | 64x64 | dungeon | psx, tile, water, liquid, green |
| `/assets/textures/itch/psx-medieval/generic-wood.png` | 128x128 | wood | psx, tile, wood, grain, dark |
| `/assets/textures/itch/psx-medieval/wood-planks.png` | 128x128 | wood | psx, tile, wood, planks, floor |
| `/assets/textures/itch/psx-medieval/hay.png` | 128x128 | nature | psx, tile, hay, straw, ground |
| `/assets/textures/itch/psx-medieval/hay-dried.png` | 128x128 | nature | psx, tile, hay, straw, dry |
| `/assets/textures/itch/psx-medieval/jute.png` | 64x64 | fabric | psx, tile, jute, cloth, sack |
| `/assets/textures/itch/psx-medieval/terracotta.png` | 128x128 | ceramic | psx, tile, terracotta, clay, pottery |
| `/assets/textures/itch/psx-medieval/bauerhaus.png` | 352x352 | atlas | psx, atlas, medieval, timber-frame, plaster, roof, windows, flowers |
| `/assets/textures/itch/psx-medieval/market.png` | 200x200 | atlas | psx, atlas, medieval, market, produce, awning |
| `/assets/textures/itch/psx-medieval/market-misc.png` | 256x256 | atlas | psx, atlas, medieval, food, meat, bread |
| `/assets/textures/itch/fantasy-weapons-bits/weapons-bits-texture.png` | 256x256 | atlas | psx, atlas, palette, kaykit, weapons |

## 6. Not in this group / notes

* No audio, VFX sheets, icons or skyboxes are in these four archives (nothing written to `audio|vfx|icons|sky/itch/`).
  `ffmpeg` is not installed on this machine (relevant for the audio groups).
* No Quaternius Bestiary / UAL files in this group, so no retargeting was done here.
* Rebuild: the scripts are in `tools/blender/itch_kits/` (`convert_psx_dungeon.py`, `convert_medieval.py`,
  `convert_nocturnal.py`, `convert_weapons_bits.py`; shared code in `kitlib.py`, texture reduction in `tex_tool.py`,
  previews `make_previews.py`, this page `make_doc.py`). Each takes `-- <extracted pack dir> <repo root>`; the archives were
  extracted under `.asset-cache/itch/kits/<pack>/x/`.
