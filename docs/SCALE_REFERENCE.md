# Scale reference: character, dungeons, camera, open world

Status: research, 2026-10-14. Docs only. No code was changed.

Owner brief (verbatim): "haritalar, etraf büyüklüğü, dungeonlar Metin2 fotolarına bak öyle olsun; karakter boyutuyla etraf daha büyük olacak; World of Warcraft'ta dungeonlara bak; skiller, karakterler çoğu şey WoW'a benzesin."

## 0. Source status (read first)

* **WoW character height: sourced.** Human male 185 cm, female 174 cm ([warcraft.wiki.gg/wiki/Height](https://warcraft.wiki.gg/wiki/Height)). The wiki says the in-game unit is yards and that tall races (tauren, Zandalari) got exceptions "to avoid getting stuck in doorways not made with tall races in mind".
* **WoW camera: sourced.** `cameraDistanceMaxZoomFactor` default 1.9, range 1 to 2.6, base 15 yd. Default max zoom = 28.5 yd (about 26.1 m). Retail cap = 39 yd (about 35.7 m) ([warcraft.wiki.gg/wiki/CVar_cameraDistanceMaxZoomFactor](https://warcraft.wiki.gg/wiki/CVar_cameraDistanceMaxZoomFactor)). Note: the owner's "default ~15 yd" is the base multiplier, not the default max.
* **WoW dungeon corridor, room, door, ceiling: NOT FOUND.** No source with numbers was located. Those rows are marked "unsourced" and must be measured in-game with a model viewer before they are trusted.
* **Metin2 map and character scale: NOT FOUND.** Searches returned nothing usable. Metin2 rows are marked "unsourced". Owner photos were not available to this research pass.
* **Our numbers: read from code** (file:line cited below).

Reference height **H = 1.85 m** (WoW human male). Our rendered character height is not verified: `GDD_CONTENT.md:758` says the human is authored at 1.8 m, while `Player.ts:135` sets `height = 2.3` (likely a hit/collision value). Check before using ratios for the character.

## 1. Measured facts in our code

| Item | Value | Where |
|---|---|---|
| Tile size | 4 m (all dungeon/world units) | `src/types/dungeons.ts:12` |
| Player collision | radius 0.55 m, height 2.3 m | `src/entities/Player.ts:134-135` |
| Legacy ceiling (no `ceiling` set) | 4.0 m (CEIL_LEGACY) | `src/world/Heightfield.ts:30` |
| Default new ceiling | 6 m (CEIL_NEW_DEFAULT) | `src/world/Heightfield.ts:31` |
| Min room ceiling (validator) | 3.0 m | `src/world/Heightfield.ts:32` |
| Ceilings used in dungeon data | 7, 8, 10, 12, 14, 16, 18, 20, 24, 30 m | grep over `src/data/dungeons/*.ts` |
| Room size, `GDD_CONTENT.layout.json` (65 rooms) | width median 6 tiles (24 m), p25 2, p75 10, max 16. Height median 5 tiles (20 m), p25 3, p75 10, max 14. Min 1 tile (4 m) | layout json, computed |
| Camera zoom, Aksiyon | 3 to 18 m (indoor and outdoor), default 9 m | `ThirdPersonCamera.ts:26-28`, `Settings.ts:200` |
| Camera zoom, WoW | 2 to 30 m outdoor, 2 to min(18, 1.35×ceiling) indoor, default 10 m | `ThirdPersonCamera.ts:29`, `docs/CONTROLS_WOW.md:21` |
| FOV | 60 (setting) | `src/core/Settings.ts:192` |
| Town castle / tower | 14 m | `src/world/WorldDecor.ts:443,467` |
| Town building scale | ×6 and castle ×8 (kit scale, height not measured) | `src/world/TownBuilder.ts:245,267` |
| Open-world map | Sisli Vadi 160×160 tiles = 640 m | `docs/GDD_OPENWORLD.md:26` |

## 2. Ratios to character height (H = 1.85 m)

Columns: meters, then multiple of H. "Ours" = current code. "WoW" = wiki-sourced where marked, otherwise unsourced.

| Element | Ours (m, ×H) | WoW (m, ×H) | Proposed target (×H) |
|---|---|---|---|
| Character height | 1.8 to 2.3 (1.0 to 1.2) | 1.85 human (1.0) | 1.0 (fix Player.height if it is visual) |
| Dungeon tile | 4 (2.2) | unsourced | keep 4 m (grid, do not change) |
| Corridor, min | 4 (2.2) | unsourced | ≥ 3 tiles = 12 m (6.5), i.e. "6×" |
| Corridor, combat | 8 (4.3) on 2-tile corridors | unsourced | ≥ 2 tiles (4.3) as floor |
| Room, median | 24 (13.0) | unsourced | ≥ 9 to 10 tiles per side = 36 to 40 m (20 to 22) |
| Room, boss | up to 64 (36) on max 16 tiles | unsourced | ≥ 20 (boss halls 30 to 60 m) |
| Ceiling, legacy | 4 (2.2) | unsourced | ≥ 4 (7.4 m): default 8 m (4.3) |
| Ceiling, halls | 12 to 30 (6.5 to 16.2) | unsourced | keep 12 to 30 |
| Door, height | 4 (legacy wall) (2.2) | unsourced | ≥ 2 (3.7 m): already passes |
| Door, width | not measured (grep found no `DoorDef.width`) | unsourced | ≥ 1 tile (4 m, 2.2), 2 tiles for boss gates |
| Camera default | 10 m WoW (5.4), 9 m Aksiyon (4.9) | 15 yd base = 13.7 m (7.4); default max 26.1 m (14.1) | 10 m, keep |
| Camera max outdoor | 30 m WoW (16.2) | 35.7 m retail cap (19.3) | 30 to 36 m (16 to 19) |
| Camera max indoor | min(18, 1.35×ceiling) (9.7 max) | unsourced | keep ceiling rule, cap 18 m |
| Tree height | not measured | unsourced | 4 to 8 (7.4 to 14.8 m), owner target, unverified |
| Building height | not measured (castle 14 m = 7.6) | unsourced | 3 to 6 (5.6 to 11.1 m), owner target, unverified |
| Road width, town | not measured | unsourced | ≥ 2 to 3 (3.7 to 5.6 m), owner target, unverified |
| Quest hub spacing | not measured | unsourced | unknown, needs Metin2 or WoW data |

Most important gap: the dungeon grid is 4 m, so the corridor and room numbers snap to 2.2H steps. A "6×" corridor needs 3 tiles. A "20×" room needs about 9 to 10 tiles.

## 3. Proposed targets (design judgement, not sourced)

These follow from the owner's brief plus the WoW camera and character numbers above:

1. **Corridor floor 2 tiles (8 m, 4.3H), combat corridors 3 tiles (12 m, 6.5H).** Today 1-tile corridors (2.2H) make the character look huge.
2. **Rooms ≥ 9 tiles per side (36 m, 20H).** Median today is 6 tiles (13H).
3. **Default ceiling 8 m (4.3H)**, not 6 m (3.2H), and keep halls 12 to 30 m.
4. **Camera: keep 10 m WoW default and 18 m indoor cap.** Consider a 36 m outdoor cap (to match the 39 yd retail cap) only if world streaming can afford it.
5. **Measure trees and buildings first.** The town and open-world rows have no measured numbers. Measure the GLB bounding boxes with a script (the `posedFootprint` pattern in `src/world/Decor.ts:368` shows one) before setting targets.

## 4. Files to change, by effort

**Global constants (small, hours):**
* `src/world/Heightfield.ts:31` CEIL_NEW_DEFAULT: 6 to 8.
* `src/camera/ThirdPersonCamera.ts:28-29` zoomMaxOutdoor (30 to 36) and zoomMaxIndoor (18 keep). `WOW_MIN_ZOOM_STEP` at line 32 is fine.
* `src/core/Settings.ts:192,200` FOV and camera defaults. Keep 60 and 9 unless playtest says otherwise.

**Do NOT change:**
* `src/types/dungeons.ts:12` TILE_SIZE = 4. Every layout, the 1 m nav grid, the heightfield, the net contract and the content checks depend on it. Changing it is a full world rescale, not a tuning change.

**Per-dungeon re-layout (large, days per dungeon):**
* `docs/GDD_CONTENT.layout.json`: the 65 room rects and door tiles. Widen corridors and rooms there, then regenerate the `GENERATED from docs/GDD_CONTENT.layout.json` block in `src/data/dungeons/*.ts` (13 dungeon files; `kit.ts` holds the helpers).
* `src/data/dungeons/kit.ts`: `room()` helper (line 57) and the pack/decor helpers, which place props by absolute tile.
* Validate with `tools/content-check.mjs` (CEIL_MIN, door-tile checks).
* Props placed at fixed tile coordinates (for example `kemik_mahzeni.ts`) must move with the rooms. Expect the largest cost here.

**Open world (medium):**
* `src/world/WorldDecor.ts`, `src/world/TownBuilder.ts` (building kit scale ×6, castle ×8). Scale tree and building kits from measured heights, not by eye.

## 5. Top changes, ranked by impact per effort

1. Raise the default ceiling to 8 m (`Heightfield.ts:31`). One line; fixes the "tight" feel in every new room.
2. Make new combat corridors ≥ 2 tiles, and 3 tiles for named corridors (layout json, per dungeon). This is the core "character looks big" fix.
3. Raise room median to ≥ 9 tiles per side in the top 10 dungeons (layout json, regenerate).
4. Measure trees, buildings and roads in the GLB kits, then set open-world scale (`WorldDecor.ts`, `TownBuilder.ts`).
5. Confirm the character's rendered height (`GDD_CONTENT.md:758` vs `Player.ts:135`). Decide whether the 2.3 m value is visual or hit-only before scaling anything by it.

## 6. Open items

* Metin2 and WoW dungeon dimensions need a human to measure in-game (WoW model viewer, or owner screenshots with a known reference). Rows marked "unsourced" stay unverified until then.
* The owner's "15 yd default" should be read as the base multiplier. The wiki default max is 28.5 yd.
