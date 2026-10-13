# EFSUN ONLINE: World map, minimap, dungeon gates and content density

Status: design + implementation plan, 2026-10-13. Docs only: no code was changed for this document.
Owner of this doc: game systems design (research pass). Implementation by Haiku coders, one package per owning module.

Legend used below: **[code]** = verified by reading the repo today. **[web]** = a WoW fact from a short web search (summaries, not opened pages). **[plan]** = proposal.

---

## 0. Baseline (what exists today)

| Area | Where | State today [code] |
|---|---|---|
| Map key | `src/core/Input.ts` | `map: ['KeyM']` already bound. Inventory is `['KeyI', 'KeyB']`. No group-finder action yet. |
| World map panel | `src/ui/panels/game/map.ts` (893 lines) | Panel id `map`. Draws the NAV GRID (walls and floor, grey/brown), not a painted map. Has fog of war, but `explored` is a `WeakMap` in memory only, so it is lost on reload. Has 11 legend filters (`MAP_FILTERS`, session-only `hiddenFilters`), wheel zoom 1.2-22, drag pan, follow mode, hover name, quest target rings (`questTargetMarks`), party dots. Region fills are drawn with `fogColor` at 14% alpha. |
| Minimap | `src/ui/hud/Minimap.ts` (SIZE 192) | Built from the nav grid. `buildMap(nav)` is rebuilt every 2.5 s while the player walks (`now - mapBuiltAt > 2500`). Already rotates with the camera (camera-relative, `G.camera.yaw`). Fog only in dungeon mode (`ctx.mode === 'dungeon'`). |
| Quest markers | `src/ui/hud/questMarks.ts`, `src/scenes/world/QuestMarks.ts` | `questGiverMarks()` (offer / turn-in per village NPC) and `questTargetMarks()` exist and are already used by the map. NPC labels use `NPC.setQuestMark`. |
| Discoveries | `src/scenes/world/Discoveries.ts` | Hidden areas, vistas and landmarks write `world.found.<id>` once, with XP. Checked every ~0.4 s. |
| Waypoints | `src/scenes/world/WaypointNetwork.ts` | Stones write `world.wp.<id>` (+2% XP) and `world.respawn`. Travel only through a Işınlayıcı NPC. Fare = `round(10 + 1.5 * level) * hops`, hops = `min(4, 1 + floor(tiles / 60))`. 30 s cooldown, 5 s post-combat lock. |
| Dungeon entrances | `src/data/world/pois.ts`, `src/data/world/sisli_vadi.layout.json` | 2 entrances in Sisli Vadi: `ent_kemik_mahzeni` (R2, tile 151,6, min 8) and `ent_kizil_dokumhane` (R5, tile 52,148, min 18). `EntranceDef.look` already allows `'ice'` and `'temple'`, but only `crypt` and `forge` are mapped (`ENTRANCE_LOOK`). `WorldDecor` keeps props 4 m away from entrances (`world/WorldDecor.ts` ~line 466). |
| Town portals | `src/data/town.ts` (`PORTALS`), `src/entities/interactables/Portal.ts`, `src/scenes/TownScene.ts` | 4 portals in the Kadim Kapılar Salonu: Kemik Mahzeni 8, Kızıl Dökümhane 18, Buzul Tahtı 30, Gölge Tapınağı 42. `Portal.ts` documents that a level below the recommended one only changes the label colour, so today the portals behave as always open. Verify `unlockLevel` handling in `TownScene` before changing it. |
| Lobby | `src/net/messages.ts` (`RoomAnnouncement`, lines ~120-150), `src/net/NetSession.ts` | Announcement already carries `activity`, `dungeon`, `keyLevel`, `minIlvl`, `mode`. `NetSession.sendRequest` and `onRequest` exist (lines ~500 and ~512). |
| Bindings persistence | `src/core/Settings.ts` | `bindings: Partial<Record<InputAction, string[]>>`. A saved `inventory: ['KeyI','KeyB']` survives a default change, so a migration is needed (see package P00). |
| Karakır Bozkırı | `src/data/world/karakir.ts` | Skeleton only: constants, halves, entrance ids. No layout, no `DungeonDef`. The town exit `dogu_kapisi` leads to an unregistered map. |
| Content check | `node tools/content-check.mjs` | Baseline run today: 0 errors. Warnings: 15 quest warnings (`npc_c_riza`, `npc_c_deniz` not authored in a village), 1 town warning (Karakır exit not registered). |
| Layout facts | `sisli_vadi.layout.json` | 160 x 160 tiles, 4 m per tile. 70 camps, 11 patrols, 24 metin spots (4 per region), 16 rares, 6 mini-bosses, 12 shrines (2 per region), 18 chests (3 per region), 12 gather fields, 6 hidden areas, 8 vistas, 16 farm spots, 11 waypoint stones, 2 world bosses. |

Density facts computed from the layout (camps per 1000 room-rect tiles):

| Region | Name | Levels | Room area (tiles) | Camps | Camps / 1000 tiles |
|---|---|---|---|---|---|
| r1 | Sisli Koru | 1-5 | 3010 | 10 | 3.3 |
| r2 | Altın Tarlalar | 5-10 | 2904 | 12 | 4.1 |
| r3 | Haydut Tepeleri | 10-15 | 2668 | 11 | 4.1 |
| r4 | Ağıt Bataklığı | 15-20 | 4300 | 13 | 3.0 |
| r5 | Ork Kanyonu | 20-25 | 3190 | 12 | 3.8 |
| r6 | Lanetli Harabeler | 25-30 | 2585 | 12 | 4.6 |

Every region gets the same POI counts (2 shrines, 3 chests, 4 metin spots, 1 mini-boss, 2 gather fields, 1 hidden area), regardless of area. R4 is the largest region and therefore the thinnest per tile. Section 4 uses this.

---

## 1. World map (key M)

### 1.1 What the reference shows (WoW, [web] + reference shots)
- Explored areas are revealed and undiscovered areas stay blank (fog of war). Quest points of interest are drawn as areas and numbered markers. Flight points and dungeon entrances have their own icons. Arrows change zone. A tracking filter controls which kinds of point are visible.
- The user's shots (`docs/ref/ui/README.md` #7): a painted parchment zone map, faded neighbour labels, many yellow `!` and `?`, speech-bubble NPCs, purple portal icons, green boot icons for travel, a zone switch frame at bottom-left, a tracking button at top-right.

### 1.2 Decision: upgrade the existing `MapPanel`, do not add a second map
Keep panel id `map` and key `M`. Replace the nav-grid terrain with a baked parchment atlas, keep the current fog, zoom, pan and filters, and add the icon layer, zone arrows and a tracking menu. `Input.map` stays `KeyM`.

### 1.3 Panel layout
```
+--------------------------------------------------------------------------+
| [<]  Sisli Vadi  · Seviye 1-30            [Takip v] [Ben] [x]          |
| +--------------------------------------------------------+ +----------+ |
| |                                                        | | Lejand   | |
| |  parchment atlas (canvas), fog, icons, region names    | | ! ? * o  | |
| |                                                        | | Filtreler| |
| |                                        compass (CSS)   | | Keşif %  | |
| +--------------------------------------------------------+ +----------+ |
| hover line: name · kind · state                       wheel: zoom     |
+--------------------------------------------------------------------------+
```
- Header: left/right arrows switch maps (see 1.7). Center: map name plus level band.
- Right column (collapsible on phone width): legend, filter toggles (the existing `MAP_FILTERS`), and an exploration percentage (`explored cells / land cells`).
- `[Takip v]` tracking dropdown: `Hepsi` (all), `Görevler` (quests only), `Zindan ve Boss`, `Toplama`, `Hiçbiri`. The choice is per viewer, so `localStorage` key `efsun.map.track` is allowed (a per-viewer convenience). Filter toggles keep their session state, and their defaults become the saved ones.

### 1.4 Baked parchment atlas (new `bakeAtlas`)
Built once per map from data (`DungeonDef.world` + `rooms` + a style object, see P11), cached per map id, never stored in a save. Target: under 150 ms on a mid PC, run in idle time after the loading screen, or on the first `M` press at the latest.

Constants: 8 px per tile. Sisli Vadi 1280 x 1280 px (about 6.25 MiB RGBA). Karakır 1440 x 1120 px. 1 m = 2 px on the atlas (1 tile = 4 m = 8 px).

Pipeline (deterministic from a seed = hash of the map id, mulberry32):
1. **Paper**: fill `#d8c49b`. Grain = value noise, cell 24 px, 3 octaves, luminance ±7. Six large blotches (radial, alpha 0.05-0.10, colour `#9c7a46`).
2. **Land mask**: 1 where any room rect covers the tile (`ROOMS` includes bridge, approach and island rects such as `r1x_tas_kopru` and `r7_mabed_adasi`).
3. **Region ownership**: per 2x2 px sample, warp the point by `amp = 1.5 tiles` of two-octave value noise (wavelength 6 tiles), then take the region whose rect contains the warped point. Bridges and islands inherit the nearest region. One 3x3 majority filter removes speckle. This gives painted borders instead of rectangles.
4. **Region colour** (multiply on paper, plus ±4% noise): palette in `mapStyle.ts`. Starting values: R1 olive `#6f7d4a`, R2 wheat `#c9a650`, R3 umber `#8a6e4b`, R4 marsh grey-green `#5d7163`, R5 ochre-red `#b5653e`, R6 violet-grey `#6f5a72`.
5. **Water**: rasterise the `WATER` rects at 1/2 resolution through the same warp (amplitude 1.2 tiles), blur 1.5 tiles, threshold 0.5. Fill `#7fa7ab` with a darker shore `#5d8790`, shore line `#3e5f66` at 1.5 px. The lake gets its name label in italic (`style.lakeLabel`).
6. **Roads**: `ROADS` polylines, stroke width = `width_m * 2` px (dirt `#9c7a4c`, cobble `#8c8478`, boardwalk `#6b4a2e`, bridge `#4a3524`), round caps, skipped under water.
7. **Forest and scenery** (ink glyphs of 2-3 overlapping circles, `#3d4a2c`, lighter top highlight), trees per 1000 land tiles: R1 60 (koru), R2 25, R3 14, R4 16 (bare), R5 6, R6 12 (dead). Rejection: within 2 tiles of roads, water, a village bounds box, or a landmark. Draw sorted by y.
8. **Mountains and edge**: void outside the land gets a dark wash (`#6e5d45` alpha 0.35 near the edge). Hachure ticks every 5 px along the land boundary (6 px long, pointing outward, `#4b3d2b` alpha 0.55). Interior ridges come from `style.ridges` (tile polylines), e.g. the Haydut Tepeleri hills.
9. **Static icons baked**: villages (house glyph), camps (tent), landmarks (sign glyph). Waypoints, entrances and boss arenas are NOT baked, because they depend on discovery and go to the icon layer.
10. **Vignette**: corner darkening alpha 0.25. The ornate frame and compass rose stay in CSS.

Output: `AtlasBake { canvas, tilePx: 8, cols, rows, regionAt(c, r): string | null, regionEdge: Uint8Array, labels: { text, x, z, kind: 'region' | 'lake' | 'neighbour', regionId }[] }`. Region names are drawn per frame (not baked), so they can be hidden until `regionKnown(id)`.

Karakır: the same code path; its style (`KARAKIR_STYLE`) takes the palette from the two halves (steppe `#c8b070`, snow foothills `#c9d3da`, based on `karakir.ts` fog colours) once the layout exists.

### 1.5 Fog of war (persisted, replaces the WeakMap)
- One bit per tile: Sisli Vadi 160 x 160 = 25,600 bits = 3,200 bytes (about 4.3 KB base64). Karakır 180 x 140 = 3,150 bytes.
- Storage: `ch.save.flags['map.fog.<mapId>'] = <base64 string>`. `flags` already accepts strings (`types/character.ts` line 39). Not `localStorage`: exploration is per character and must survive a reload and other devices. Writes are debounced (at most one `persist()` every 10 s and on scene leave), because `persist()` is already called from several places.
- Reveal: tiles within 3 tiles (12 m) of the local player, checked every 0.25 s. The current code uses 11 m on a 1 m grid. Tile resolution is enough for a 640 m map.
- Rendering: a fog canvas at 8 px per tile, blurred 6 px at the edge. Undiscovered land = paper multiplied by 0.35, plus an overlay `#2a2219` alpha 0.78.
- **Decision [plan]**: the region OUTLINE stays visible through the fog (1.5 px ink from `regionEdge`), so the valley shape and the ring route are known from the start. Only the interior is hidden. Quest and village markers outside the fog are not drawn (see 1.6).
- Migration: none needed (the old fog was not saved). Mark existing characters that already reached an entrance with the flags in 3.5.

### 1.6 Icon layer
Drawn each frame on top of the atlas and fog. Icon size 14 px at zoom 1, scaling with zoom to a max of 22 px. Declutter: when two icons overlap within 10 px, the higher priority wins (quest > dungeon > boss > waypoint > village > the rest).

| Icon | Kind | Shown when | Source | Asset |
|---|---|---|---|---|
| gold `!` | quest offer | NPC has an offer and the area is explored | `questGiverMarks()` kind `offer` | `map-quest.svg` (exists) |
| gold `?` | quest turn-in | ready quest | `questGiverMarks()` kind `turnin` | `map-quest-ready.svg` (exists) |
| blue ring + label | quest objective | active quest target | `questTargetMarks()` | drawn, no asset |
| house | village | village explored | `worldExtras().villages` | `map-village.svg` (exists) |
| tent | camp hub | camp explored | `settlements` | `map-camp.svg` (exists) |
| boot | travel NPC (Işınlayıcı) | at village/camp with a teleporter | village NPC `role: teleporter` | **new** `map-flight.svg` |
| diamond, hollow | waypoint stone seen | explored, not yet activated | `WAYPOINTS` | `map-waypoint.svg` (exists) |
| diamond, filled | waypoint stone known | `world.wp.<id>` true | flag | `map-waypoint.svg` |
| purple swirl | dungeon gate, discovered | `world.entrance.<dungeonId>` | `ENTRANCES` | **new** `map-dungeon-swirl.svg` (replaces the door for world gates; the Kuzgunkale hall keeps the door) |
| grey swirl + "Sv. N" | dungeon gate, locked | discovered but level below `minLevel` | same | same, desaturated |
| purple diamond + tier | metin stone | `metinOn` and the spot explored | `world:metinChanged` | `map-metin.svg` (exists) |
| red skull | world boss arena | arena explored; pulses while alive | `WORLD_BOSSES` + new `world:bossState` | `map-boss.svg` (exists) |
| orange skull | mini-boss lair | lair explored | `MINIBOSSES` | `map-miniboss.svg` (exists) |
| silver star | rare | live rare within 120 m (GDD_OPENWORLD 5.9) | enemies with `rare_*` ids | `map-rare.svg` (exists) |
| chest / cursed chest | chest | explored; greyed while on cooldown (30 min) | `CHESTS`, `CURSED`, flag `world.chest.<id>` (new, timestamp) | `map-chest.svg` (exists) |
| coloured dot | shrine | explored; colour by type (existing `SHRINE_COLOR`) | `SHRINES` | `map-shrine.svg` (exists) |
| eye | vista | `world.found.<id>` | `VISTAS` | `map-vista.svg` (exists) |
| "?" | hidden area | `world.found.<id>` only (not shown before) | `HIDDEN` | drawn text, no asset |
| ore / herb | gather field | explored | `GATHER` | `map-ore.svg`, `map-herb.svg` (exist) |
| sign | landmark | `world.found.<id>` | `LANDMARKS` (baked sign + name once found) | baked |
| class dots | party | always, when peers are in the same map | pstate positions (existing) | drawn |
| arrow | player | always | local player | drawn (existing) |
| gold dashed ring | recommended zone | from "Ne yapmalıyım?" (ROADMAP batch 6), the region matching the player's level | recommender | drawn, no asset |

Not shown: farm spots (16, too noisy; they stay in the tooltip of their camp), undiscovered POIs, and anything outside the fog.

Per-viewer filters use the existing `MAP_FILTERS` ids (`village, waypoint, metin, boss, rare, dungeon, chest, shrine, vista, gather, quest`). Add `flight` (boot) and `recommend`.

### 1.7 Zoom, pan, zone switch
- Keep: wheel zoom, drag pan, follow mode, `clampN(scale, 1.2, 22)`. Add `+`, `−` and `Ben` (recentre on the player) buttons.
- Zone arrows `< >` in the header switch between maps in the order `MAP_ORDER = ['sisli_vadi', 'karakir_bozkiri']` (later `kadim_diyar`), only for maps that have a `world` extra and a bake. Maps that are not running render from data plus their saved fog. Live icons (quest targets, metin, rares, party) only for the running map.
- Keyboard: `M` closes; `←/→` change zone; `+/−` zoom.

### 1.8 Tooltip (hover line)
`Name · kind · state`. Examples:
- `Kemik Mahzeni Girişi · Zindan · Sv. 8-18 · Açık` (or `Sv. 8 gerekli`)
- `Gümüşdere Taşı · Işınlanma Taşı · Keşfedildi`
- `Çürük Höyük · Dünya Patronu · Yaklaşıyor (1:20)` or `Canlı` or `Ölü, 14 dk sonra`
- `Altın Tarlalar · Seviye 5-10` (region, shown when `regionKnown`)

Click: a quest icon pins the quest (`setPinnedQuest`, already exists). A gate or a waypoint centres the map on it.

### 1.9 Turkish strings (player-facing)
`Harita`, `Takip`, `Hepsi`, `Görevler`, `Zindan ve Boss`, `Toplama`, `Hiçbiri`, `Ben`, `Keşif`, `Keşfedilmedi`, `Kilitli`, `Seviye N gerekli`, `Zindan girişi bulundu: {ad}`, `Işınlanma Taşı keşfedildi: {ad}`, `Yaklaşıyor`, `Canlı`, `Ölü`, `Kuzey yukarı`, `Kameraya göre`.

---

## 2. Minimap upgrades (hud module)

Goal: the same style as the world map, with pins, and no per-frame rebuild.

1. **Atlas crop, not the nav grid**: in the open world, draw the minimap from the same `AtlasBake` (crop around the player). The atlas is 2 px per metre, the minimap is 3 px per metre at zoom 1 today (`scale = 3.0`), so the crop is drawn with a 1.5x `drawImage` scale. Remove the 2.5 s `buildMap` path for the open world. Dungeon mode keeps the nav-grid code unchanged.
2. **Fog**: the minimap reads the same bitmap (`map.fog.<mapId>`) and the same reveal. Undiscovered land is dark parchment, as on the map.
3. **Pins within the minimap radius** (`worldPoints.ts`, shared with the map):
   - gold `!` and `?` for quest givers, blue ring for quest targets (both existing functions);
   - purple swirl for discovered gates (grey when locked);
   - boss arena and mini-boss only within 120 m (the existing rule for rares);
   - metin stones that are active and within 120 m;
   - party dots (existing), player arrow (existing).
4. **Rotation option**: today the minimap is camera-relative (`a = -PI/2 - atan2(fz, fx)`). Add `minimap.rotate`: `'camera'` (default, current behaviour) or `'north'` (fixed north up, the arrow rotates; the `K` marker stays north). Stored in Settings (`core`), shown in the settings panel (`panels-game`).
5. **Zone ribbon**: the region name and level band from `world:regionEntered` stay. Add a second line with the next waypoint or gate in the region when one is known.
6. **Cost**: keep the minimap canvas at 192 px. Draw only the crop (at most 2 `drawImage` calls per frame), the fog crop, and at most 40 pins.

---

## 3. Dungeon placement, gates and the town portal hall

### 3.1 Current placement [code]

| Dungeon | id | Dungeon levels | Entry level | Where it stands now | Status |
|---|---|---|---|---|---|
| Kemik Mahzeni | `kemik_mahzeni` | 8-18 | 8 | Sisli Vadi R2 Altın Tarlalar, tile (151, 6), next to the Mezarlık stone (150, 9), in the graveyard | placed |
| Kızıl Dökümhane | `kizil_dokumhane` | 18-28 | 18 | Sisli Vadi R5 Ork Kanyonu, tile (52, 148), 6 tiles inside R5 from the R4 border, next to the Kor Ocağı stone (49, 150) and camp `r5_c04` (21-23) | placed |
| Buzul Tahtı | `buzul_tahti` | 30-40 | 30 | Karakır, "ice cave mouth at the foothills" (GDD_OPENWORLD 1.8) | no tile yet |
| Gölge Tapınağı | `golge_tapinagi` | 42-52 | 42 | Karakır, "far east, ruined temple stairs" | no tile yet |
| Kadim Kale raid | (none) | roadmap, 5 bosses | 55 (proposed) | no map yet | roadmap |

Note: `GDD_OPENWORLD` section 1.8 says "the three dungeon portals in Kuzgunkale remain", but `town.ts` `PORTALS` has four. This document follows the code (four).

### 3.2 Placement rule [plan]
- One gate per level band, at a **pass** the player walks on the normal route: the border between two regions, or the crossing of a road. Gates are never placed in a dead end.
- Each map has at most two world gates. Every gate has a grand look (3.3) and a minimum level equal to its dungeon's entry level.
- Map 1 (Sisli Vadi, 1-30): the two gates stay. Option: move Kızıl from tile (52, 148) to the R4/R5 border around (58-60, 146-150). This puts a level 18 character on level 15-20 ground instead of 20-25 ground. Decide before the gate art is built (open question 5).
- Map 2 (Karakır Bozkırı, 30-45): **Buzul Tahtı at the Ayaz Geçidi**, the pass where Karakır Bozkırı (30-37) meets Ayaz Eteği (38-45), so the band change is a visible gate. **Gölge Tapınağı at the eastern rim of Ayaz Eteği** (42+), at the end of the route, as a reward for walking the map. Exact tiles come with the Karakır layout (P31).
- Map 3 (Kadim Diyar, 45-60, roadmap): the **Kadim Kale** raid gate in the north-centre citadel, min 55, requires the Kahramanlık clear of Gölge Tapınağı. Five bosses; raid difficulty modes go to a later design doc.

### 3.3 Grand gate recipe (reference #3) [plan]
Local frame: the door sits at the origin on the ground; +z points out to the approach; `facing` (from the layout, degrees) rotates the whole group. Scales below are targets; take the real scale from each GLB's bounds (`tools/glb-inspect.mjs`). Footprint: 12 m wide x 10 m deep.

| Part | Model (exists unless noted) | Local position (m) | Scale / tint | Notes |
|---|---|---|---|---|
| Gate arch | `hw('arch_gate')` | (0, 0, 0) | ~2.4 | Frame of the door. |
| Pillars x2 | `hw('pillar')` | (-2.9, 0, -0.4), (2.9, 0, -0.4) | ~2.2 tall | Gold trim by tint if the material supports it, otherwise leave it. |
| Lanterns x2 | `gp('lamp_post')` | on top of the pillars | ~0.8 | Blue glow `0x6ac8ff` by emissive, not a light. |
| Crest | `gp('crystal_purple')` tinted `0xd02a2a` | (0, 4.6, -0.2) | ~0.9 | Red crystal emblem. There is no red crystal model; tint or make one in Blender (`tools/blender`). |
| Portal door | `DungeonPortal` (`gp('mplus_portal')`) | (0, 2.0, 0.3) | ~1.6 | Tint from `PORTAL_TINTS[dungeonId]`. Interact opens the existing keystone panel. This is the existing interactable, no new class. |
| Stairs | `kc('stairs-stone')` x5 | from z +5.5 (y 0) to z +1.5 (y 2.0), 0.4 m per step, 3.5 m wide | by bounds | Leads up to the door platform. |
| Braziers x2 | `gp('brazier')` | (-3.8, 0, 2.6), (3.8, 0, 2.6) | ~1.0 | Flame by `vfx 'brazier_fire'` (exists). No extra light. |
| Banners x2 | `gp('banner_red')` or the dungeon colour | (-5.4, 0, -1.2), (5.4, 0, -1.2) | ~1.0 | Height about 3.5 m. |
| Rally board | `notice_board` (exists, used by the town) | (-4.8, 0, 7.5) | ~1.0 | "Toplanma Panosu". Prop plus nameplate only, NOT a `Waypoint` (it must not set respawn). Interact is a later feature (LFG list, see P30). |
| Light | `LightPool.add([0, 3.2, 0.5], ...)` | one per gate | colour = portal tint, distance 9, priority 2 | Budget: the roadmap already flags light count. Max one light per gate. |
| Nameplate | label | above the arch | "Kemik Mahzeni · Sv. 8-18" | Grey and "Sv. N gerekli" when locked. |
| Keep-clear | `WorldDecor` avoid | radius 7 m around the door | | Was 4 m (`WorldDecor.ts` ~466). Trees and rocks must not block the stairs. |

Entrance states (visual): locked = desaturated portal and grey label; open = full tint; cleared on Normal = a small `dg('banner_yellow')` added at the pillars.

### 3.4 Town portal hall (Kadim Kapılar Salonu): options

| Option | How | Pro | Con |
|---|---|---|---|
| A. Keep as is | All 4 always open | Simple, no regressions, keys and M+ work | No reason to walk to the world gates |
| B. Discovered only | Show only dungeons whose world gate was seen | Strong progression | Frustrating for a player who has not reached R2 yet |
| C. WoW-like unlock (recommended) | All 4 portals always visible. Each opens for the character after it has seen its world gate OR cleared it on Normal | Same idea as WoW Dragonflight, where per-dungeon teleports were earned (see section 8). Keeps the hall readable | Needs the migration in 3.5 |
| D. Summoning stone | Party leader summons members to the leader's current gate or village | Good for groups | Needs a P2P accept handshake; later (P40) |

**Recommendation: C.** States per portal:
- `Kilitli`: level below `minLevel`. Text `Seviye N gerekli` (today's text).
- `Keşfedilmedi`: level is fine, but neither `world.entrance.<dungeonId>` nor a Normal clear is recorded. The Normal clear is read with `hasCleared(dungeonId, 'normal')` from `systems/Bounties.ts`, which also accepts the legacy flag `clear.<dungeonId>`. Dimmed portal, text `Dünyada girişini bul: {gate name}` with the region name.
- `Açık`: opens the keystone panel as today.

Keystone (M+) runs from the hall keep working for every `Açık` portal. Dungeon Finder (the group finder, see P30) lists only `Açık` dungeons, using the same helper.

Helper (new, `scenes/world/DungeonAccess.ts`, P22): `dungeonAccess(dungeonId, level): 'locked' | 'undiscovered' | 'open'`, and `unlockedDungeons(level): string[]`. Reads flags only.

Summoning stone (option D) is parked for P40. When built, use `NetSession.sendRequest('summon', ...)` and `onRequest` for the accept prompt. Each member must accept. No teleport without consent.

### 3.5 Flags and migration [plan]
New flags (all in `ch.save.flags`):
- `world.entrance.<dungeonId>` (boolean): set when the local player comes within 12 m of the gate for the first time (`Discoveries.ts`), or on the first open of the world-entrance panel (GDD_OPENWORLD 7.7).
- `map.fog.<mapId>` (string): the fog bitmap from 1.5.
- `world.chest.<id>` (number, seconds): last opened time, for the chest icon cooldown.
- `map.migrated.v1` (boolean): one-time migration on load. For each entrance, if the character's level is at least the dungeon's `minLevel`, set `world.entrance.<dungeonId>` = true. Otherwise an existing high-level character would be locked out of the hall until they walk to the gate. Normal clears are already recorded by `Bounties.recordClear` and need no migration.

Persistence rule: nothing in this list is stored in `localStorage` except the per-viewer map track preference and the minimap rotation setting.

---

## 4. Content density: "players play in the latest zone"

### 4.1 What the numbers say [code + layout]
- Camp density (table in section 0): R6 4.6, R2 4.1, R3 4.1, R5 3.8, R1 3.3, **R4 3.0**. R4 is the largest room (4300 tiles, about 1.7 times R6) and has the same POI count as the others, so it is the emptiest band. It sits between the 15 and 20 levels, which is the part of the valley players cross fast.
- The highest band (R5 20-25, R6 25-30 with Son Ocak) is where a level 20-30 player spends most time today, and it has the Alevkanat world boss (min level 22) and the Ölüm Metini (Sv. 30).
- Karakır (30-45) is not built yet. Right now, the "latest zone" is the top of Sisli Vadi.

### 4.2 Principle [plan]
1. **Densest events in the newest or highest band that a player can reach.** Now: R5 + R6 + Son Ocak. When Karakır opens, move about 60% of new events there, and keep the Vadi world bosses (Çürükkök, Alevkanat) on their schedule so the old map still has a reason to visit.
2. **No empty bands.** Fill R4 first: +3 camps around the Bataklık İskelesi camp (84, 138) and Ağıt Ağacı (110, 146), and one more metin spot. The mid-band stops then have something to do.
3. **Movement, not standing still**: a rotating "Sıcak Bölge" (hot zone) inside the top band every 2 h, one region at a time (its name shows on the map and in the ribbon). In that region: metin spawn +50%, one extra rare slot, and the region's gate banner lit. The map shows the hot zone with a red dashed outline. This is a scheduled event (P41), not a new map.
4. **Mark the latest zone on the map**: the gold dashed "recommended" ring (section 1.6) follows the level recommender from ROADMAP batch 6, so new players are pulled to the right band.
5. **Migration rule for new maps**: a new map launches with camp density at or above the previous top band (about 4.5 camps per 1000 tiles), two villages, and two metin tiers, so that it is the densest place from day one.

### 4.3 Concrete now (data-only, content module)
- R6: +4 camps near Kara Anıt (30, 66) and Son Ocak (30, 94). The density goes from 4.6 to about 6.2 per 1000 tiles.
- R5: keep Alevkanat as is. Add a second rare slot near the Kızıl Kale (24, 128) so the top band has a second reason to stay.
- R4: +3 camps, as in 4.2.2.
- Check: `node tools/content-check.mjs` stays at 0 errors. Layout warnings should not increase.

Metrics for QA (no telemetry needed): the dev world page (`src/dev/world.ts`) can count live enemies and players per region every 60 s, using `regionKnown`-style room lookups. Use this to confirm the top-band share of players before and after.

---

## 5. Implementation plan (Haiku coders)

Rules: one owner module per package, files listed per package. Waves of at most three packages. Packages in the same wave touch disjoint files. After each wave, a Haiku QA pass runs the checks in section 6 and scores the affected categories (ROADMAP rubric).

### Wave 0 (contracts, one agent, core)
- **P00 core: input, settings, flags.** Owner: core.
  - `src/core/Input.ts`: append `'groupFinder'` to `InputAction`. `DEFAULT_BINDINGS.inventory = ['KeyB']`. `groupFinder = ['KeyI']`. `ACTION_NAMES_TR.groupFinder = 'Grup Bulucu'`.
  - `src/core/Settings.ts`: add `bindingsRev` (number). When loading with `bindingsRev < 1`, if `bindings.inventory` contains `'KeyI'`, replace it with `['KeyB']` and set `bindings.groupFinder = ['KeyI']`. Then set `bindingsRev = 1`. Also add `minimap.rotate` (`'camera' | 'north'`, default `'camera'`).
  - `src/types/character.ts`: comment only, document the new flags of 3.5.
  - `src/core/events.ts`: append `'world:entranceFound': { dungeonId: string; name: string }` and `'world:bossState': { bossId: string; state: 'idle' | 'warning' | 'alive' | 'dead' }` (both used by P12 and P21).
  - Acceptance: `npx tsc --noEmit` = 0 errors. A saved `KeyI` inventory binding is migrated (verified by a unit-style check in a dev page). `B` opens inventory, `M` unchanged.

### Wave 1 (three packages, parallel)
- **P10 hud: atlas and fog.** Owner: hud.
  - New `src/ui/atlas/bakeAtlas.ts`: `bakeAtlas(def: DungeonDef, style: MapStyle): AtlasBake` (pipeline 1.4), cached per id.
  - New `src/ui/atlas/fog.ts`: `encodeFog(bits: Uint8Array): string`, `decodeFog(s: string, n: number): Uint8Array` (base64 of packed bits), `revealAround(bits, cols, rows, tx, tz, radiusTiles = 3): boolean`, `fogOf(mapId: string): Uint8Array` (reads `G.character.save.flags`), `saveFog(mapId, bits)` (debounced 10 s `persist()`).
  - New `src/ui/atlas/worldPoints.ts`: `collectWorldPoints(def, ctx): WorldPoint[]` where `WorldPoint = { kind, x, z, label, state: 'known' | 'seen' | 'locked' | 'active', priority, tier? }`. Reads the sources in section 1.6. Pure, no DOM.
  - Acceptance: bake of Sisli Vadi under 150 ms (`performance.now` in dev), fog round-trips exactly, no DOM use except `document.createElement('canvas')`.
- **P11 content: map style.** Owner: content.
  - New `src/data/world/mapStyle.ts`: `interface MapStyle { paper; ink; palette: Record<regionId, number>; forestPerKTiles: Record<regionId, number>; ridges: [number, number][][]; lakeLabel: { x; z; text }; neighbourDist: number }`. Export `SISLI_VADI_STYLE` (values from 1.4 and 4.3) and `KARAKIR_STYLE` (stub, halves palette).
  - `src/data/world/karakir.ts`: no code change beyond an import of the style stub.
  - Acceptance: `node tools/content-check.mjs` still 0 errors.
- **P12 scenes: gates and discovery.** Owner: scenes.
  - New `src/scenes/world/EntranceGate.ts`: `buildEntranceGate(def: EntranceDef, ctx): Promise<void>`, placing the recipe of 3.3 (uses existing `DungeonPortal` for the door and `LightPool` at priority 2).
  - `src/scenes/world/Discoveries.ts`: for each `ext.entrances`, when the local player is within 12 m for the first time, set `world.entrance.<dungeonId>`, toast `Zindan girişi bulundu: {ad}`, and emit `world:entranceFound` (event added in P00).
  - Acceptance: two gates spawn in Sisli Vadi, the flag is set once, the toast shows once per character.

### Wave 2 (three packages, parallel)
- **P20 panels-game: world map.** Owner: panels-game.
  - `src/ui/panels/game/map.ts`: replace nav-grid terrain with `bakeAtlas` + fog from `fog.ts` + icons from `worldPoints.ts`. Keep wheel, drag, follow, hover, legend. Add header arrows (1.7), tracking dropdown (1.3), `Ben`, exploration percentage, tooltip (1.8). Keep `reveal()` logic moved into `fog.ts` (P10).
  - New `src/ui/panels/game/mapTracking.ts`: track preference (`efsun.map.track`), declutter priority.
  - `src/ui/styles/panels-game.css`: arrows, dropdown, parchment frame.
  - Depends on P10 and P11.
- **P21 hud: minimap.** Owner: hud.
  - `src/ui/hud/Minimap.ts`: open-world path uses the atlas crop and the fog crop, pins from `worldPoints.ts`, `minimap.rotate` option, no 2.5 s rebuild in the open world. Dungeon path unchanged.
  - Depends on P10 and P00 (setting).
  - New icons: `public/assets/icons/map-dungeon-swirl.svg`, `map-flight.svg`.
- **P22 scenes: town hall states.** Owner: scenes.
  - New `src/scenes/world/DungeonAccess.ts`: `dungeonAccess(dungeonId, level)`, `unlockedDungeons(level)` (3.4).
  - `src/entities/interactables/Portal.ts`: `DungeonPortal` takes `access` (`locked | undiscovered | open`) and changes the look and label. Keep the existing constructor options.
  - `src/scenes/TownScene.ts`: pass `access` from `dungeonAccess`. Run the one-time migration `map.migrated.v1` on scene load.
  - `src/scenes/world/Discoveries.ts` is NOT touched here (P12 owns it). `TownScene` gets the portal states from `dungeonAccess()`, which reads the flags from 3.5 and `hasCleared` from `systems/Bounties.ts`.
  - Acceptance: a level 8 character without a visit sees Kemik Mahzeni as `Keşfedilmedi`; after visiting the gate it is `Açık`; a level 20 character who skipped the gate is migrated to `Açık`.

### Wave 3 (three packages, parallel)
- **P30 panels-game: group finder (I).** Owner: panels-game.
  - New `src/ui/panels/game/groupFinder.ts`, panel id `groupFinder`, key `I` (`groupFinder` action from P00). Tabs `Zindanlar ve Baskınlar` / `Oyuncu'a Karşı` / `Mitik+`, role check boxes, `Rastgele Kahramanlık`, `Grup Bul` button.
  - Dungeon list = `unlockedDungeons(level)` (P22). Premade list = lobby announcements (`src/net/LobbyManager.ts`).
  - New `src/ui/styles/panels-groupfinder.css` (separate file, so P20 does not conflict).
  - Acceptance: `I` opens it, `B` still opens inventory, `Esc` closes.
- **P31 content: Karakır layout v0.** Owner: content.
  - New `src/data/world/karakir.layout.json`: rooms, regions (2 halves), roads, water, villages (Kervansaray Sv. 31, Karlıbel Kalesi Sv. 40), waypoints, entrances with tiles for Buzul Tahtı (Ayaz Geçidi) and Gölge Tapınağı (east rim), camps (about 4.5 per 1000 tiles).
  - `src/data/world/karakir.ts`: move the skeleton to a real `DungeonDef` with `world`, register in `OPEN_ZONES`.
  - Acceptance: `node tools/content-check.mjs` 0 errors, the Karakır exit warning disappears.
- **P32 net: LFG fields.** Owner: net.
  - `src/net/messages.ts`: optional `lfg?: { roles: string[]; dungeon: string | null; keyLevel: number; minIlvl: number }` on `RoomAnnouncement`, sanitised in `sanitizeAnnouncement`. Owner of the lobby code: net only.
  - Acceptance: old clients still parse announcements (field optional).

### Later (not scheduled)
- **P40 net + scenes: summon stone** (option D, 3.4): `sendRequest('summon')`, accept prompt, teleport after consent.
- **P41 scenes: hot zone** (4.2.3): rotation in `scenes/world` scheduler, banner, metin rate.
- **P42 panels-game: recommended ring** (1.6): needs the recommender from ROADMAP batch 6 (`Ne yapmalıyım?`).
- **P43 raid gate Kadim Kale** after Kadim Diyar exists.

---

## 6. Test plan

Static (run by the coder, no browser):
- `npx tsc --noEmit` = 0 errors after each wave.
- `node tools/content-check.mjs` = 0 errors. Warnings must not grow (baseline: 15 quest warnings, 1 town warning).
- Unit-style checks for `encodeFog` / `decodeFog` round trip, `dungeonAccess` truth table (level below min, undiscovered, Normal clear, world visit), the migration of `KeyI` bindings.

Haiku QA (browser, after each wave, dev pages, low CPU):
- Map: `M` opens; zoom 1.2 and 22 both render; arrows change zone; the tracking menu filters; no console errors; `Ben` recentres.
- Fog: walk 30 m, reload the page, the explored area is still there (saved flag).
- Gates: approach to R2 and R5 gates; flags set once; toast once; door tint correct; no tree inside the 7 m keep-clear.
- Town hall: four portals show the three states correctly for a level 8 and a level 20 character.
- Minimap: pins present, `minimap.rotate` both values work, no `buildMap` every 2.5 s in the open world (check with a counter in the dev build).
- Performance: bake under 150 ms; map frame time under 4 ms at zoom 1; no new per-frame allocations (Haiku should check with the performance panel).

Score (ROADMAP rubric): map and minimap feed category 6 (UI / HUD); gates feed 7 (World); the hot-zone work feeds 7 and 9.

---

## 7. Open questions for the user

1. Town hall: option C (portals always visible, unlock by visiting the gate or a Normal clear), or option A (keep everything open)?
2. Keys: `I` becomes the Group Finder and `B` stays inventory. Agreed? This follows the ROADMAP batch 7 note. Migration in P00 covers saved settings.
3. Fog: keep the region outline visible through the fog (section 1.5), or hide everything until explored?
4. Kızıl Dökümhane: keep at (52, 148), or move to the R4/R5 border around (58-60, 146-150) so a level 18 player meets level 15-20 mobs first?
5. Raid placement: Kadim Kale on the roadmap map 3 (Kadim Diyar, north-centre citadel), min 55 (proposed)?
6. Density: is it acceptable to move about 60% of new events to Karakır at launch, while Vadi keeps the two world bosses?

---

## 8. Sources (WoW reference, short web search, summaries)

- Dragonflight dungeon teleports were earned per dungeon by a timed Mythic+ run (Keystone Hero feat). Threshold +20 in Seasons 1-3, +10 in Season 4. The Azure Vault feat was later reduced to +10 and made account-wide. Summaries from: https://warcraft.wiki.gg/wiki/Keystone_Hero:_The_Azure_Vault and https://www.icy-veins.com/wow/dragonflight-mythic-season-4-guide
- Valdrakken portal hall offered access to the rotation dungeons, as convenience shortcuts rather than rewards. Summary from https://www.icy-veins.com/wow/dragonflight-mythic-season-3-guide
- Quest points of interest, flight points, dungeon icons, fog of war and zone arrows on the full World Map: general addon and forum summaries (no single official page was found). Treat the exact icon set as a reference, not a spec.
- Summoning stone (party summon) is from general WoW knowledge, not verified in this pass.

Verification done for this document: code paths and numbers above were read from the repo and from `sisli_vadi.layout.json` (node script, read-only). `tools/content-check.mjs` run as a baseline, read-only. No browser, no dev server, no code edits.
