# Peri Sisleri (`peri_sisleri`): Mythic+ Season 1 dungeon design

**WoW model: Mists of Tirna Scithe** (Shadowlands 9.0, Ardenweald). Research: `docs/ref/dungeons/sl-a.md` (boss and trash kits, route, maze rules), plus the author's own memory of the dungeon's look (twilight forest, glowing mushrooms, mist maze, gorm nest). This is one of the 8 dungeons of the **Season 1 Mythic+ pool** (ROADMAP batch 10). The four existing dungeons stay as levelling dungeons.

Status: design only, written 2026-10-13, **revision 2 the same day** (nine critic fixes, the binding user requirements of CORE_MECHANICS sections 6, 13, 15 and 16: verticality, Elden Ring boss and trash layers, per-room dressing, named loot; log in section 9, rejected critique in section 10). No code was touched. Precedence when documents disagree: `ARCHITECTURE.md` > `CORE_MECHANICS.md` > this document > `GDD_CONTENT.md`. Player-facing text is Turkish; ids, code and prose are English. Non-commercial hobby project: staying very close to the WoW originals (layout rhythm, set pieces, mechanics) is explicitly wanted. Names of boss NPCs are kept (Ingra Malok, Droman Ulfaran, Tred'ova, Lakali) because the user asked for the WoW designs; the dungeon, the factions and every trash mob get Turkish names.

Legend used below: **EXISTS** = already in the repo, use as is. **NEW** = needs code or an asset (collected in section 8). Coordinates are GDD tile coordinates (`world = (c + 0.5) * 4 m`, see `kit.ts`), rect fields are integer tile indices.

---

## 1. Identity

| field | value |
|---|---|
| id | `peri_sisleri` |
| Name (TR) / short | **Peri Sisleri** / `Sisler` |
| WoW model | Mists of Tirna Scithe (Ardenweald, Shadowlands patch 9.0.2) |
| Where | Kadim Diyar, Gümüş Orman (see section 7). Fallback until Kadim Diyar exists: Kadim Kapılar Salonu portal arc |
| Level / modes | `levelRange [60, 60]`. Endgame only: **Kahramanlık** (enemy lvl 60, loot ilvl 66), **Mitik 0** (ilvl 70) and **Mitik+**. No Normal |
| M+ timer | **28:00 (1680 s)** for 5 players. +2 at 22:24, +3 at 16:48 (GDD 5.7). WoW original: 30:00 |
| Enemy forces | **370** needed, **463** available (125.1 %), 425 on the standard route (114.9 %). Details in section 6 |
| Grid | 76 x 60 tiles (304 x 240 m), 20 rooms, 29 doors, 30 packs (27 required + 3 optional), 118 mobs, 3 bosses, 1 mini-boss pack, 2 shrines, 2 root gates, 1 maze, **`vertical: true`: 7 floor levels from -2.4 m to +7.2 m, 3 stair flights, a bridge over a chasm, halls up to 30 m (3.1b)** |
| Length on foot | about 640 m of corridor (90 s at 7 m/s). A clean +10 takes about 26:40 (6.2) |
| Bosses | 1 **Ingra Malok** (and Droman Ulfaran), 2 **Sis Çağıran** (Mistcaller), 3 **Tred'ova** (final, showpiece); each with an Elden Ring layer (strings, delayed swings, posture break), 3 named loot items each (5.4) |
| Music | new `dungeon_grove` (fallback `world_marsh`), bosses `boss` |

**Recommended route (standard, "A"):** Meşe Kovuğu, camp (4 pulls + patrol), Ingra, Kök Salonu (up the grand staircase), **skip the Mantar Korusu** (or take it for the Kudret mushroom, route B), Sis Kıvrımı glade 1 to 4 (maze, climbing 0.4 m per wall), Sis Çağıran, down the Şelale Merdiveni past the waterfall, Dikenfak Mağarası, Çürük Köprü over the chasm (or the Kök Kestirmesi tunnel), Çukur Merdiveni into the Larva Kuyusu, Tred'ova. Route variants in section 6.

**Fantasy (one paragraph).** Under Kuzgunkale lie the four sealed Kadim Zindanlar, but they are only the *bones* of the World Oak whose roots the old Efsun seals pinned down. Its last living branch stands in the north-west of Kadim Diyar, inside the Gümüş Orman, and inside that tree the Peri folk kept the Peri Sisleri: a moonlit hollow where time does not run and souls rest before returning to the cycle. The Boynuzlu Ahali, an antler-masked tribe cursed to live outside that cycle, followed their sage **Ingra Malok** into the Meşe Meclisi and are chaining the grove with black magic: they drain the Peri's anima (life essence) and a drought of dead mist is creeping out of the hollow. As the Efsunlu Yarıklar leak into the grove, the maze of mist that once protected it turns on intruders. Deep below, the gorm brood-mother **Tred'ova** has swallowed the wildseed of **Lakali**, the loa of knowledge; Lakali's cocoon hangs in her nest, glowing, still alive. Kill Ingra, pass the Sis Çağıran's guessing game, and crack the brood-mother open before the seed is gone.

**Loading screen text (TR, `DungeonDef.lore`):**
> Kadim Diyar'ın Gümüş Ormanı'nda, dünya meşesinin son dalı bir kovuk saklar: Peri Sisleri. Boynuzlu Ahali kovuğa sızdı; Ingra Malok peri ruhlarının animasını kara büyüyle çekiyor, kuraklık sisleri yutuyor. Sisin ortasındaki labirent yanlış adımı affetmez, yuvanın dibinde ise Tred'ova, Lakali'nin tohumunu yuttu. Zaman daralıyor.

**Loading screen image (`DungeonDef.loadingImage`, one line):** a moonlit hollow inside a colossal oak: teal anima motes drift through blue mist between glowing red and teal mushrooms, antler-masked Drust silhouettes with violet braziers on the left, a fae doorway of curved roots with a floating glowing sigil on the right, a huge pale gorm eye watching from the dark below.

---

## 2. ART DIRECTION (closest possible to Mists of Tirna Scithe)

**Mood sentence.** Ardenweald is a *moonless twilight forest*: deep blue-green shadow, drifting mist, floating anima, and everything that glows (mushrooms, wisps, sigils, acid) glows from inside. The dungeon moves in four colour acts: **violet Drust corruption** (camp, Ingra), **bright blue-grey mist** (maze, Mistcaller), **sickly acid green** (gorm nest), then **teal-gold anima** as relief (Lakali). A player must be able to tell the act from a single screenshot.

### 2.1 Palette (hex)

| Name | Hex | Where |
|---|---|---|
| Gece Ormanı (deep forest shadow) | `0x10201f` | fog base, shadow, rock mass |
| Yosun Yeşili (moss) | `0x2f5a3c` | foliage, floors, grove walls |
| Yaşlı Kabuk (old bark) | `0x5a4030` | trunks, roots, wicker, tents |
| Sis Mavisi (mist blue) | `0x7ab0d8` | mist, moonlight, maze fog, waterfall |
| Sis Beyazı (mist white) | `0xdce8f0` | veils, birch bark, Vulpin |
| Anima Altını (anima gold) | `0xffd060` | anima globs, lanterns, Lakali's blessing |
| Peri Camgöbeği (fae teal) | `0x60ffd8` | wisps, sigils, Font of Power, Lakali cocoon |
| Boynuz Moru (Drust cloth) | `0x7a3a8a` | Drust banners, robes, tents |
| Ruh Eflatunu (Drust fire) | `0xb060ff` | Drust braziers, Death Shroud, shadow hits |
| Kemik (bone) | `0xd8d0b8` | masks, antlers, totem skulls |
| Asit Yeşili (acid) | `0x9cff6a` | acid pools, Tred'ova, nest glow |
| Kitin Kahvesi (chitin) | `0x6a5a30` | gorm shell, ribs |
| Mantar Kırmızısı | `0xe04050` | red mushrooms (health/ward) |
| Mantar Yeşili | `0x70e070` | green mushrooms (power) |

`DungeonTheme.palette = [0x10201f, 0x2f5a3c, 0x7ab0d8, 0xffd060, 0x60ffd8, 0xb060ff]`.

### 2.2 Materials and textures

* **Walls:** KayKit dungeon wall pieces (EXISTS) with the new wall style `grove` (NEW style table entry, tint `0x8a9a78`, variants `wall 60 / wall_cracked 20 / wall_broken 10 / wall_pillar 10`, banners `green, brown`), then **dressed** with trees, roots, moss and stones by the NEW `RoomDef.dress` pass so that the stone is almost never seen (the Ardenweald look is organic, not masonry). Gorm rooms use `gorm` (tint `0x9aa860`, `rockBase: true`, variants like `cave`).
* **Floors:** `moss` (NEW floor style: `floor_dirt_large` x2 + `floor_dirt_large_rocky`, small `floor_dirt_small_weeds` special, tint `0x7a9a68`), camp `dirt` (EXISTS, tint `0xa88aa0` from the room `lightColor`), gorm nest `gorm` floor (NEW: `floor_dirt_large` tint `0x9aa860`, `cracks: true` with acid-green emissive veins, same code path as `lava_rock` cracks).
* **Tiny Texture Packs** (EXISTS, `/assets/textures/itch/`): `tt3-terrain-*` (green) for moss ground splats, `tt2-dirt-*` for the camp, `tt3-gem-*` (blue and cyan) for sigil and crystal materials, `tt2-elements-*` (cyan) for waterfall planes, `tt3-weave-*` for wicker and cloth. The Blender props (section 2.7) bake their own 16 to 64 px palette textures with the standard `psx_lib.py` painters.
* **PSX look:** every GLB gets the auto vertex snap and nearest filtering (`Assets.onModelLoaded`). Keep emissive pixels for everything magical so bloom catches it (bloom 0.55 here, higher than the crypt's 0.3, because glow is the point).

### 2.3 Lighting rig

Global theme (`DungeonTheme`): `fogColor 0x1b2a2e, fogNear 7, fogFar 36, ambient 0x4a5c78, ambientIntensity 0.38, hemiSky 0x7a92c8, hemiGround 0x1c2a1c, torchColor 0xb878ff, bloomStrength 0.55, music 'dungeon_grove', tint 0xb8d0b0`. The builder's key light is its single cool "moon" directional (blend of `hemiSky` and white), keep it. Coloured light comes from **few real point lights at landmarks** (the light pool takes the nearest ones; target at most 10 live lights near the player, PERF budget in ROADMAP) and from emissive plus halo sprites everywhere else.

| Area | Room fog override (hex, near / far) | hemi sky / ground | Accent lights (real) |
|---|---|---|---|
| Meşe Kovuğu (start) | theme (`0x1b2a2e`, 7 / 36) | `0x7a92c8` / `0x1c2a1c` | Font of Power teal `0x60ffd8` (8 m, steady), 3 hanging fae lanterns `0x9cffe8` (6 m) |
| Boynuzlu Ahali Kampı | `0x1c1426`, 6 / 32 | `0x6a5a8a` / `0x1a1020` | violet braziers `0xb060ff` (9 m, flicker), warm tent fires `0xff9050` (6 m) |
| Boynuz Çemberi (boss 1) | `0x261830`, 7 / 36 | `0x6a5a8a` / `0x1a1020` | ring of magenta braziers `0xff5090` (8 m), central chain glow `0xb060ff` (10 m) |
| Kök Salonu | `0x15281f`, 6 / 34 | `0x70a090` / `0x182818` | anima gold motes `0xffd060` (5 m) |
| Mantar Korusu | `0x10281e`, 5 / 30 | `0x60c0a0` / `0x143018` | mushrooms teal `0x60ffd8` and red `0xff6070` (5 m each, 5 lights) |
| Sis Kıvrımı (maze) | **`0x7a98b0`, 7 / 30** (bright mist colour: the one bright act; the mist *look* comes from the veil props, `ambient_mist` x3 per glade and the bright fog colour, not from a short far plane) | `0xb0c8e0` / `0x405060` | sigil glow teal only, no fire |
| Sis Çağıran Çayırı (boss 2) | `0x3a5070`, 6 / 34 | `0x90b0ff` / `0x203048` | cool moon key, 4 standing lanterns `0x9cffe8`, sigil stones `0x80ffe0` |
| Şelale Kenarı, Çağlayan Havuzu | `0x2a4858`, 6 / 36 | `0x80b8d8` / `0x203038` | pool glow `0x70e0ff` (8 m) |
| Dikenfak Mağarası, Köprü, Kuyu | `0x142418`, 5 / 30 | `0x60a050` / `0x101a10` | acid pools `0x9cff6a` (6 m), egg clusters `0xd8ff90` (4 m) |
| Dikenfak Yuvası (boss 3) | `0x0f1c14`, 8 / 42 | `0x60a070` / `0x0c1810` | Lakali cocoon `0xb8f0ff` (14 m, intensity 2.2), acid pools, 6 teal crystals |

**Tall rooms and the maze.** Rooms with `ceiling >= 12` (the hollow 14, the grand hall 26, the pool 24, the cave 22, the pit 20, Tred'ova's cavern 30) get the kit's `tall()` treatment (ENGINE_VERTICALITY 7.7): `fog.far x 1.4` and hemisphere intensity -10 %; the fog values in the table above are already the final ones. **The maze fog changed from `near 3 / far 20` to `near 7 / far 30`**: the Harvesters, Shapers and Tenders kite at 10 to 16 m, and at near 3 a 10 m target is already about 35 % fogged and a 16 m target about 80 % fogged, so the must-kick casters were close to invisible and target picking became guesswork. The mist look now rides on the NEW veil props, three `ambient_mist` sheets per glade and the bright fog colour, with the sigil glow as the only coloured light. The boss-2 glade keeps its 6 / 34 fog during the Guessing Game (readability). The seasonal **Kadim Sis** affix (GDD_V2 8.6, fog far plane 14 m) is season 3 and ignored here, see 6.4.

### 2.4 Sky and backdrop

Rooms with `openAir: true` (camp, Ingra's circle, the four glades, the Mistcaller glade, the waterfall ledge, the pool, the fairy ring) have no lid: the sky backdrop shows above the walls and the camera is uncapped; all other rooms are lidded at their `ceiling` (3.1). What sits above the walls of an open room is visible to the high camera. NEW optional `DungeonTheme.skyImage` (same idea as `RegionTheme.skyImage`, the builder already has `OutdoorScenery.buildSky`): `/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-14.jpg` (green aurora, "fantasy", fog `#91d29c`) for the grove acts, `cloudy-sky-12.jpg` (dark purple dusk, small moon) for the Drust acts and the Mistcaller glade, nothing for the gorm nest (rock mass roof). Skies cross-fade with the per-room fog override. The tree line above the walls comes from the dressing (trunks up to 11 m, crowns visible).

### 2.5 Landmark set pieces, in run order

1. **Meşe Kovuğu**: the start hollow inside a colossal oak, ring of bark walls, the Font of Power glowing teal on a root dais, hanging fae lanterns, the glowing gate seen from the inside (the "way back").
2. **Boynuzlu Ahali Kampı**: the Drust camp. Five-metre wicker totems with antlers and violet embers, antler-skull poles, hanging cages with trapped wisps, tents in Drust purple, drums, a central ritual circle on the floor.
3. **Boynuz Çemberi**: ritual clearing with eight standing stones, Droman chained to a post of spectral chains, bone-antler arch behind Ingra, magenta brazier ring.
4. **Kök Salonu**: hall of colossal roots and arches, first anima motes, the first checkpoint seed, the **Kök Kapısı** (thorn-root barrier) in the west wall.
5. **Mantar Korusu** (optional): a glowing mushroom grove, 3 m caps, the two shrine mushrooms, fireflies.
6. **Sis Kıvrımı**: four misty glades, each ending in a wall of four root doorways with a floating glowing sigil above each and a white mist veil in each gap. Ghost fox statues, white flowers.
7. **Sis Çağıran Çayırı**: a perfectly round moonlit glade, birch ring, a lily pond, a big stump platform in the middle, eight sigil stones in a ring.
8. **Şelale Kenarı and Çağlayan Havuzu**: a cliff edge where the grove ends; a waterfall plunges into a glowing pool, below it the green dark of the gorm realm. The tone shifts from blue to sick green here.
9. **Dikenfak Mağarası**: the gorm cave. Chitin ribs, egg clusters that pulse, acid pools, slime strands.
10. **Çürük Köprü**: a root-and-plank bridge over an acid chasm 8 m deep. A Gorger knockback into the chasm is a 25 % fall.
11. **Larva Kuyusu**: a sunken pit ringed by egg walls.
12. **Dikenfak Yuvası**: the vast brood cavern. Lakali's cocoon (7 m, glowing white-blue, hung by roots) on the south wall, a ring of chitin spires, acid pools. On death of Tred'ova the cocoon splits and teal-gold anima rains over the room.

### 2.6 Props mapped to EXISTING assets

Helpers from `src/data/dungeons/kit.ts`: `dg` KayKit dungeon, `hw` halloween, `gp` gen/props, `kn` Kenney nature kit (**scale x4 is already the default per `environment.md`, use the scales below on top of the source size**), `ip(pack, path)` itch packs. The retro tree packs are `ip('retro-psx-tree-pack', 'trees/treeNN')` (NN 01..36, 8 m tall, see `itch-psx-env.md` section 3) and `ip('retro-psx-nature-pack', 'trees/treeNN_summer')`.

| Area | Model (path) | Pattern / count | Scale, tint, light | Purpose |
|---|---|---|---|---|
| All grove rooms (dress) | `tree17`, `tree21`, `tree14` (tree pack), `tree05_summer`, `tree04_summer` (nature pack) | along wall faces, every 2 to 3 tiles, skip door gaps | scale 1.0 to 1.5, tint `0x9ab090` | wall dressing (hides stone) |
| All grove rooms (dress) | `kn('hanging_moss')`, `kn('plant_bushDetailed')`, `kn('log_large')`, `kn('stump_oldTall')`, `ip('retro-psx-tree-pack','bushes/bush08')` | moss at y 3.9 on wall faces, bushes and logs on the floor edge | moss scale 8, bush tint `0x70a090` | undergrowth |
| Start | `gp('font_of_power')` at (6.5, 51.5), `gp('waypoint_stone')` (decor, tint `0x80ffe0`) at (3.5, 56) | one each | font tint `0xb8ffe0`, light teal 8 m | Kehanet Taşı, "way back" marker |
| Start | `hw('lantern_hanging')` x3 | x 4, 7, 9 at z 51 to 56, y 3.95 | light `0x9cffe8` 6 m | fae lanterns |
| Camp | `gp('tent')` x4, `hw('post_skull')` x10, `gp('brazier')` x6, `gp('iron_cage')` x3, `gp('chains_hanging')`, `dg('barrel_large')` x4 (drums), `gp('cauldron')` x1 | tents on the edges, posts ring the ritual circle, braziers at the four corners and two at the north door | tent tint `0x4a3050`, brazier light `lt(0xb060ff,1.6,9,true,1.4)` | Drust camp |
| Camp | `gp('tree_dead')` x6, `tree33` x4, `tree26` x3, `hw('skull')`, `hw('ribcage')`, `gp('bone_pile')` | scatter 14 | tint `0xa89aa8` | corrupted trees, bones |
| Camp, Ingra | **NEW `peri_wicker_totem`** | 5 in the camp, 4 in the arena corners | emissive violet | Drust effigy |
| Boynuz Çemberi | `kn('stone_tallB')` x8 | ring r 4.5 tiles around (21.5, 35) | scale 3.2, tint `0x70607a` | standing stones |
| Boynuz Çemberi | `gp('altar')` tint `0x7a3a8a` at (21.5, 30.5), `gp('chains_hanging')` x4 around the Droman post at (21.5, 38.5), `gp('statue_hooded')` x2 tint `0x4a3a5a`, `gp('brazier')` x8 on the ring | | brazier light `lt(0xff5090,1.5,8,true,1.3)` | ritual set |
| Kök Salonu | **NEW `peri_root_arch`** x3 across the hall at x 19, 22, 25 | 8 m wide each | tint `0x8a7a60` | colossal roots |
| Kök Salonu | `kn('lily_small')`, `kn('flower_purpleA')`, `gp('flowers')`, `gp('crystal_blue')` x2 (anima crystals) | scatter 10 | crystal tint `0xb8ffe0`, light `0xffd060` 5 m | first anima |
| Mantar Korusu | `kn('mushroom_redTall')` x8, `kn('mushroom_tanTall')` x6, `kn('mushroom_redGroup')` x5, `kn('mushroom_tanGroup')` x6 | irregular ring around the shrine at (10.5, 24.5) | scale 10 to 13, red emissive `0xe04050` / tan tint `0x70f0d0` emissive `0x60ffd8`, intensity 0.8 | glow mushrooms. Optional **NEW `peri_glow_shroom`** (3.2 m cap) as hero piece |
| Maze glades | `tree14` x4 (corners), `kn('statue_ring')`, `kn('statue_obelisk')` (scale 3, centre), `kn('flower_purpleB')` x16, `kn('grass_leafsLarge')`, `gp('flowers')`, ghost fox statues = `gp('statue_hooded')` tint `0xdce8f0` opacity 0.7 | 1 statue per glade | white-blue palette | misty glade dressing |
| Maze walls | **NEW `peri_root_arch`** x4 per choice wall (12 total), **NEW `peri_sigil_xxx`** x12 at y 3.0 above each doorway, **NEW `peri_mist_veil`** x12 in the gaps | | veil opacity 0.55 | the choice doorways |
| Boss 2 glade | `ip('retro-psx-tree-pack','trees/tree35')` x10 (slim birch) | ring r 5.8 tiles around (54, 13) | scale 1.3, tint `0xdce8f0` | birch ring |
| Boss 2 glade | `kn('stump_squareDetailedWide')` x6 as a stump platform (centre), `kn('stone_tallE')` x8 (sigil stones, ring r 3.2 tiles), `kn('lily_large')` x12 on the pond, `hw('lantern_standing')` x4 | | stump scale 8, stones scale 3, lantern light `0x9cffe8` | glade set |
| Waterfall | `kn('cliff_waterfall_rock')` x3, `kn('cliff_waterfallTop_rock')`, `kn('rock_largeD')`, `kn('bridge_woodNarrow')` x1, `kn('lily_large')` | waterfall on the ledge's south edge, pool below | cliff scale 4 to 5, plane `tt2-elements` cyan | the drop |
| Nest rooms | `gp('rock_cliff')` x10 (walls), `gp('rock_large')`, `gp('bone_pile')` tint `0x8a8a50`, `kn('hanging_moss')` tint `0x9cff6a` emissive (slime strands), **NEW `peri_gorm_egg`** clusters x14, **NEW `peri_gorm_rib`** x6 | | egg emissive `0xd8ff90` | gorm nest |
| Çürük Köprü | `kn('bridge_woodNarrow')` x3 laid along z (rot 90), pits as zones | | scale 4 | bridge |
| Boss 3 | **NEW `peri_lakali_cocoon`** at (61.5, 57), `peri_gorm_rib` ring x8, `peri_gorm_egg` x10, `gp('crystal_blue')` x6 around the cocoon, `gp('rock_cliff')` perimeter, `gp('chest_epic')` appears at (61.5, 55) on kill | | crystal tint `0x80ffe0`, light `0x80ffe0` 7 m | showpiece |
| Peri Halkası | `kn('mushroom_redGroup')` x12 in a ring r 1.3 tiles around (74, 28), `gp('chest_gold')` at (74.5, 29.5) | | scale 12 | fairy ring, haste shrine |

### 2.7 NEW props to build in Blender (20 prop rows, the boss model is PS-A2) (`tools/blender/props/props_peri.py`, `@asset` per prop, output `public/assets/models/gen/props/peri_*.glb`)

Conventions as in `docs/assets/generated-props.md`: 1 unit = 1 m, +Y up, faces +Z, origin at ground centre, 16 to 64 px palette textures, `COLOR_0` AO, emissive pixels only on glowing parts, light nodes `light_0`.

| id | Size W x H x D (m) | One-line look | Nodes / clips |
|---|---|---|---|
| `peri_kapisi` | 14 x 11 x 6 | the entrance gate: two gnarled living trunks arching into a root vault, teal glyph bands, hanging lanterns, a swirling mist portal inside | `portal_surface`, `enter_trigger`, `light_0` x3 (as `mplus_portal`) |
| `peri_drust_mask` | 0.55 x 0.7 x 0.3 | bone-white antlered mask with violet glowing eye slits, used as a head attach | attach: `head`, `pos [0,0.02,0.05]` |
| `peri_fae_wings` | 0.9 x 0.8 x 0.1 | translucent teal four-wing set, chest attach for Tender, Matriarch, Mistcaller | attach: `chest`, `pos [0,0,-0.12]`, alpha MASK |
| `peri_wicker_totem` | 2.2 x 5.2 x 2.2 | a wicker humanoid with antlers, ember-violet glow inside the ribs | `light_0` |
| `peri_root_arch` | 8 x 6 x 1.6 | two root buttresses forming a pointed arch, moss, a few hanging vines | none |
| `peri_root_gate` | 6 x 4 x 1.2 | a tangled thorn-root wall that blocks a doorway | clip `Open` (roots retract, 1.2 s) |
| `peri_sigil_FDH` ... `peri_sigil_LBN` (8 files) | 1.6 x 1.6 x 0.1 | a flat glowing glyph disc: shape flower (F) or leaf (L), fill solid (D) or hollow (B), with a ring (H) or none (N). Emissive teal `0x60ffd8` | one `light_0` |
| `peri_mist_veil` | 7 x 3.8 x 0.4 | two crossed translucent white cards with scrolling mist UVs | UV scroll in code (alpha MASK + dither) |
| `peri_gorm_egg` | 1.6 x 1.3 x 1.6 | a cluster of pale green translucent eggs with a visible larva shadow inside | emissive `0xd8ff90`, pulse in code |
| `peri_gorm_rib` | 1.4 x 6 x 1.2 | a curved chitin spire / rib, brown with acid veins | emissive veins |
| `peri_lakali_cocoon` | 4 x 7 x 4 | a hanging silk cocoon bound by roots, white-blue glow inside, a faint humanoid silhouette | clip `Open` (splits along the middle, 1.6 s), `light_0` |
| `peri_anima_seed` | 1.4 x 1.8 x 1.4 | a glowing seed in a root cradle: the checkpoint ("Depleted Anima Seed") | `light_0`, emissive dims when used |
| `peri_fae_lantern` | 0.7 x 0.9 x 0.7 | hanging teal lantern with a floating mote | `light_0` |
| `peri_glow_shroom` (optional) | 3 x 3.4 x 3 | one hero mushroom, 3 m red or teal cap with spots | emissive caps |
| `peri_palisade` | 4 x 6 x 0.8 | a wicker-and-bone palisade segment with antler tops and a purple rag, 44 around the camp | none |
| `peri_watchtower` | 4.5 x 9 x 4.5 | a lashed-timber Drust watchtower with a hide roof and a violet brazier on top | `light_0` (halo only) |
| `peri_root_chandelier` | 3 x 4 x 3 | a ring of root and antler hung on chains with 12 teal or violet flame motes, hangs from the ceiling (`PropPlacement.hang`) | `light_0` (halo only) |
| `peri_stag_statue` | 3 x 4.5 x 1.8 | a moss-covered white stag statue with great antlers, a faint teal glow in the eyes | none |
| `peri_antler_arch` | 9 x 12 x 2 | a bone-antler arch, the throne of the Drust sage (behind Ingra) and the camp's north gate | `light_0` (violet, halo only) |
| `peri_fae_banner` | 1.6 x 5 x 0.1 | a long hanging banner (teal or green cloth with a sigil), vertex-sway in code, 8 in the grand hall | none |
| **boss** `tredova` (`tools/blender/bosses/boss_tredova.py`, `public/assets/models/gen/bosses/tredova.glb`) | 3.6 x 3.4 x 7.2 | gorm brood-mother: armoured caterpillar body with 6 legs, huge mandibles, pale glowing acid sacs along the back, amber spines; **faces +Z** | standard boss clips `Idle Walk Run Attack Attack2 Cast Enrage Hit Death`, nodes `fx_mouth`, `fx_sac_L`, `fx_sac_R`, bones `root hips body1 body2 body3 head jaw tail1 tail2 leg_L1..3 leg_R1..3`. Until built, fallback is `itch/creatures/centipede.glb` scale 3.4 tint `0xa8c060` |

### 2.8 Enemy look per faction

* **Boynuzlu Ahali (Drust).** KayKit rigs (Rogue_Hooded, Barbarian, Mage) with a dark plum tint (`0x5a4452` to `0x6a4a5a`), the NEW `peri_drust_mask` head attach, violet eye emissive `0xc060ff`. Silhouette: hunched, antlered, ragged. Bosses of this faction: Ingra (Mage, scale 1.55, staff) and Droman (Barbarian, scale 1.6, wicker shield).
* **Peri halkı (Mistveil and villagers).** Tall, teal and soft green: Knight (spear = the 1H sword shown thin), Mage with `peri_fae_wings`, fox and wasp creatures from `itch/creatures` tinted teal at 85 % opacity (translucent "mist" feel). The Tirnenn Villager is the bark-skinned exception: Barbarian tinted `0x6a8a58` at scale 1.15.
* **Gorm (Dikenfak).** `itch/creatures` insectoids (centipede, wasp, rhino) tinted acid yellow-green and chitin brown, plus the NEW Tred'ova model. Larvae are small pale centipedes.

### 2.9 VFX palette

EXISTS ids to use: `ambient_shadow_wisps` (Drust act), `ambient_embers` (violet-tinted, camp), `ambient_dust` (generic), `poison_cloud` (acid, pollen), `poison_burst`, `poison_projectile` (acid globs), `portal_swirl` (gate, waterfall landing), `heal_loop` / `heal_burst` (Nourish), `shadow_ground` (Death Shroud pool), `curse_loop` (Death Shroud on players), `frost_burst`, `frost_nova` (Freezing Burst), `buff_aura`, `inspiring_aura`, `waypoint_glow` (anima seed), `smoke_zone` (mist), `chain_lightning` (Mind Link tether, tinted `0xb060ff`).
NEW ids (vfx-audio owner; each has a stated fallback so nothing blocks): `ambient_anima_motes` (floating teal and gold motes; fallback `ambient_embers` tinted `0x60ffd8`), `ambient_mist` (slow low fog sheets; fallback `ambient_dust` x3 scale), `pollen_cloud` (fallback `poison_cloud` tinted gold), `anima_glob` (falling glob and puddle; fallback `poison_projectile`), `sigil_pulse` (ring pulse on a sigil; fallback `buff_aura`), `consumption_swirl` (electric blue swirl around the cocoon; fallback `portal_swirl` tinted `0x60c8ff`), `acid_pool` (persistent ground acid; fallback `poison_cloud`).

### 2.10 Music and ambience

NEW `MusicId` `dungeon_grove`: sparse harp and wooden flutes over a low choir pad, moonlit; the Drust camp adds low war drums and a hand drum pulse, the maze drops to a music box and whispered voices, the nest is arrhythmic string scrapes and insect clicks, then Lakali's resolution is a single warm cello line. Boss fights use `boss`. Ambience layers (SFX bed): crickets and a distant owl, water, wind through leaves, mist hiss in the maze, wet chittering in the nest. Unknown ids fail silently, `world_marsh` is the fallback track.

### 2.11 Room-by-room set dressing (the dressing bible: this is one of the 8 maps M+ rotates on)

Every room below lists its **props with counts**, its **height dressing** (decor tiers of 3.1b, chandeliers, banners, statues; nothing at height is walkable), its **lights** (real `PointLight`s come from the shared pool, at most 10 live near the player, the rest are emissive meshes plus halo sprites), its **VFX** (ids from 2.9) and its **sounds** (`SFX_IDS` where one exists, `amb_*` beds are new ambience loops that the audio owner aliases to existing files, see S11). Helpers: `dg` KayKit dungeon, `hw` halloween, `gp` gen props, `kn` Kenney nature (x4 default scale), `ip` itch packs. "dress" = the `RoomDef.dress` wall pass of S2 (trees, roots and moss along the wall faces so stone is almost never seen). Budget for the whole dungeon: about 1,350 placed props (instanced), at most 500 draw calls and 350 k triangles, at most 10 live lights; the tiers and dress items are batched and `fadeable`.

Common to every grove room (not repeated): `dress` trunks every 2 to 3 tiles (`tree17`, `tree21`, `tree14`, `tree05_summer`), `kn('hanging_moss')` along the wall faces, `kn('plant_bushDetailed')` on the floor edge, an `amb_grove_night` bed under the music.

**R01 `giris` Meşe Kovuğu (y 0.0, ceiling 14, 36 x 32 m)**
* Props: `gp('font_of_power')` x1 on the 0.4 m dais, `gp('waypoint_stone')` x1 (tint `0x80ffe0`), the inside of the gate `peri_kapisi` x1 at scale 0.5 on the west wall (the way back), dress trunks x14 (scale 1.3 to 1.6), `kn('hanging_moss')` x16 at y 3.9 and x8 at y 8, `kn('log_large')` x3, `kn('stump_oldTall')` x4, bushes x10, `kn('flower_purpleA')` x12, `gp('flowers')` x8, `kn('mushroom_redGroup')` x5 and `kn('mushroom_tanGroup')` x5 (scale 10, emissive), `gp('crystal_blue')` x4 (tint `0xb8ffe0`).
* Height: root gallery ring at 7.0 m with 6 hanging `peri_fae_lantern`, 4 `peri_fae_banner` on the north wall (y 7 to 12), 2 `peri_stag_statue` on the gallery (absY 7.4), 1 `peri_root_chandelier` at y 11 over the font, 6 moonlight shafts through the window tier (y 9, cool emissive glass and a translucent cone each).
* Lights: Font teal 8 m (steady), 3 lanterns `0x9cffe8` 6 m, 12 halo-only motes.
* VFX: `ambient_anima_motes` (room), `waypoint_glow` on the stone, `ambient_mist` low sheet x1, `portal_swirl` in the back gate.
* Sound: `amb_grove_night` (crickets, an owl every 25 to 40 s), `water_impact` pitched 0.6 every 8 s as a drip at the font, `whisper` every 45 s at the gate, `footstep_grass`.

**R02 `k_patika` Yosunlu Patika (y 0 to 1.2 stairs, ceiling 8, 16 x 8 m)**
* Props: `peri_root_arch` x1 at the stair head (scale 0.9, decor), `peri_fae_lantern` posts x4 (two per side of the treads), `hw('post_skull')` x2 at the camp end (foreshadowing), bushes x6, `kn('log_large')` x1, trunks x4, `kn('flower_purpleA')` x6.
* Height: the 5 treads climb toward a violet glow; 2 hanging root curtains (`peri_mist_veil` x2 at 0.6 opacity) at y 6 to 8 mark the threshold.
* Lights: 2 lanterns 5 m, a violet halo (no real light) at the camp end.
* VFX: `ambient_anima_motes` thin, `ambient_embers` violet from the east end.
* Sound: `footstep_wood` on the treads, drums from the camp rising in volume (positional `amb_drust_drums`), `camp_crackle` far.

**R03 `drust_kampi` Boynuzlu Ahali Kampı (y 1.2, ritual dais 1.6, palisade 7 m, 52 x 52 m, open air)**
* Props: `peri_wicker_totem` x5, `peri_palisade` x44 (the perimeter minus 4 door gaps), `peri_watchtower` x4 (the corners), `gp('tent')` x4 (tint `0x4a3050`), `hw('post_skull')` x10 (ritual ring) and x8 on the palisade, `gp('brazier')` x8 (4 corners, 2 at each of the west and north doors), `gp('iron_cage')` x3 with a trapped `peri_fae_lantern` inside each, `gp('chains_hanging')` x4, `dg('barrel_large')` x4 (drums), `gp('cauldron')` x1, `gp('tree_dead')` x6, `tree33` x4, `tree26` x3, `hw('skull')` x6, `hw('ribcage')` x2, `gp('bone_pile')` x5, `dg('banner_*')` (purple, brown) x8 on the palisade, `peri_antler_arch` x1 at the north door.
* Height: palisade walkway ring at 5.0 m (decor), the 4 watchtowers at 9 m with a Drust sentry statue each, 8 antler poles (colonnade tier), 3 more hanging cages from the walkway at y 4, wicker smoke columns above the braziers.
* Lights: 6 violet braziers `0xb060ff` 9 m (flicker), 4 warm tent fires `0xff9050` 6 m (the pool shows the nearest 10).
* VFX: `ambient_embers` (violet), `ambient_shadow_wisps`, `smoke_zone` columns x4, `curse_loop` on 2 of the totems.
* Sound: `camp_crackle` positional x6, `amb_drust_drums` (low war drum and a hand-drum pulse), `enemy_idle` chant murmurs every 12 to 20 s, `whisper` from the cages.

**R04 `k_ritual` Ritüel Yolu (y 2.4 flat, 2.4 to 1.2 stairs, ceiling 10, 8 x 16 m)**
* Props: `peri_wicker_totem` x2 at the stair head, `hw('post_skull')` x6 on chains, `gp('chains_hanging')` x4 across the corridor, `gp('brazier')` x2 (magenta), `dg('banner_*')` x4, `kn('stone_tallB')` x2, `gp('bone_pile')` x3.
* Height: beams tier at y 9 with 8 antler garlands (`hw('skull')` on chains), the 5 treads lead the eye up to the arena door.
* Lights: 2 magenta braziers `0xff5090` 8 m.
* VFX: `ambient_embers` (magenta), `shadow_ground` pulse under the rune.
* Sound: `heartbeat_loop` low, the drums at full level, rare `rubble`.

**R05 `ingra_arena` Boynuz Çemberi (y 2.4, flat, 56 x 52 m, open air)**
* Props: `kn('stone_tallB')` x8 (ring r 4.5 tiles, scale 3.2), `gp('altar')` x1, the Droman post with `gp('chains_hanging')` x4, `gp('statue_hooded')` x2, `gp('brazier')` x8 (ring), `peri_wicker_totem` x4 (corners), `peri_antler_arch` x1 behind Ingra (12 m), `dg('banner_*')` x6, `gp('bone_pile')` x8, `hw('skull')` x10, `gp('tree_dead')` x6 outside the ring, `gp('cauldron')` x2.
* Height: root balcony ring at 7.0 m (decor) with 6 hanging cages and 4 wicker lanterns, a balcony at 9.0 m behind Ingra with 2 Drust sentry statues, 2 `peri_root_chandelier` (antler rings with violet fire) at y 11.
* Lights: 8 magenta braziers `0xff5090` 8 m (flicker), the chain glow `0xb060ff` 10 m.
* VFX: `ambient_embers`, `ambient_shadow_wisps`, `shadow_ground` under both rune circles, `chain_lightning` (decor, tinted `0xb060ff`) from the post to Droman, `curse_loop` on 2 stones.
* Sound: `amb_chain_loop` (a rattle every 3 s from the post, pitched 0.5), `heartbeat_loop`, the `boss` music, `amb_drust_drums` ducked.

**R06 `kok_salonu` Kök Salonu (y 4.8 upper, 2.4 landing, ceiling 26, 48 x 32 m)**
* Props: `peri_root_arch` x3 across the upper floor (x 19, 22, 25) and x2 flanking the stairs, `peri_stag_statue` x2 on the landing flanks, `peri_fae_banner` x8 hung from the gallery along the stairs, `kn('hanging_moss')` x24 (y 3.9 and y 10), `kn('lily_small')` x4, `kn('flower_purpleA')` x10, `gp('flowers')` x6, `gp('crystal_blue')` x4 (anima crystals), dress trunks x16, `peri_anima_seed` (placed by the checkpoint code on the landing).
* Height: upper gallery ring at 12.0 m, 10 root columns, 8 high windows at 16 m, beams at 25 m, 3 `peri_root_chandelier` (over the stair head, mid hall, north end), the 9-tread grand staircase between two banner rows.
* Lights: 3 gold motes `0xffd060` 5 m, 2 teal 5 m on the landing, chandelier halos (no real lights).
* VFX: `ambient_anima_motes` (gold-tinted), `ambient_mist` x2 at the stair foot, `waypoint_glow` at the seed.
* Sound: `choir_swell` once on the first entry, `amb_hall_wind`, `footstep_wood` on the stairs, `heal` chime near the seed.

**R07 `mantar_korusu` Mantar Korusu (y 4.4, shrine mound 4.8, ceiling 12, 40 x 32 m, optional)**
* Props: `kn('mushroom_redTall')` x8, `kn('mushroom_tanTall')` x6, `kn('mushroom_redGroup')` x5, `kn('mushroom_tanGroup')` x6 (scale 10 to 13, emissive), `peri_glow_shroom` x3 (hero pieces, optional), the shrine pool, `kn('flower_purpleB')` x8, `gp('chest_wood')` at (8, 22.5), trunks x8.
* Height: canopy ring at 8.0 m (giant caps, decor) with 14 hanging spore lamps (`peri_fae_lantern` tinted red and teal).
* Lights: 5 real mushroom lights (teal `0x60ffd8` and red `0xff6070`, 5 m each).
* VFX: `poison_cloud` pollen (gold tint) x3, `ambient_anima_motes` (green), `heal_loop` once on the shrine.
* Sound: `bubble_loop` at the pool, `buff` and `aura_on` when the shrine is used, crickets.

**R08 to R11 `m1`..`m4` Sis Kıvrımı I to IV (y 4.8 / 5.2 / 5.6 / 6.0, ceiling 18, 32 x 44 m each, open air)**
* Props per glade: `tree14` x4 (corners), `kn('statue_ring')` or `kn('statue_obelisk')` x1 (scale 3, centre), ghost fox statues `gp('statue_hooded')` x2 (tint `0xdce8f0`, opacity 0.7), `kn('flower_purpleB')` x16, `kn('grass_leafsLarge')` x10, `gp('flowers')` x6, 6 root pillars (colonnade tier) wrapped in `peri_mist_veil` x6 (0.4 opacity). **Per choice wall** (walls 1, 2, 3): `peri_root_arch` x4, `peri_sigil_xxx` x4 (y 3.0), `peri_mist_veil` x4 in the gaps, i.e. 12 props per wall and 36 for the maze.
* Height: each glade is 0.4 m above the last (a root step in every doorway), hanging root arches at 16 m (beams tier), a rune disc in the middle; mist floor sheets drift at 0.3 to 0.8 m.
* Lights: sigil glow only (`light_0` on each `peri_sigil`, teal 4 m, the pool shows the nearest), a cool moon key; **no fire**.
* VFX: `ambient_mist` x3 per glade, `sigil_pulse` on the 4 sigils of the next wall every 4 s, `smoke_zone` on a trap veil (`maze_trap` burst), `ambient_anima_motes` sparse.
* Sound: `amb_mist_hiss` bed, two `whisper` emitters at the statues (every 20 to 35 s, a different voice per glade), a music-box sting on a correct doorway (`ice_chime` pitched 1.2), `time_warp` on the trap teleport.

**R12 `sis_cagiran_cayiri` Sis Çağıran Çayırı (y 6.4, stump 6.8 and 7.2, ceiling 16, 52 x 60 m, open air)**
* Props: `tree35` birch x10 (ring r 5.8 tiles, scale 1.3, tint `0xdce8f0`), `kn('stump_squareDetailedWide')` x6 (the two-step platform), `kn('stone_tallE')` x8 (sigil stones, ring r 3.2 tiles), `kn('lily_large')` x12 on the pond, `hw('lantern_standing')` x4, `peri_stag_statue` x2 flanking the west door, `kn('flower_purpleA')` x20.
* Height: birch canopy ring at 11.0 m (decor) with 12 hanging `peri_fae_lantern` and 4 `peri_fae_banner`; the moon sits above the east side.
* Lights: 4 standing lanterns `0x9cffe8` 6 m, 8 sigil-stone halos `0x80ffe0` (they brighten during a game), the cool moon key.
* VFX: `ambient_anima_motes`, `ambient_mist` low over the pond, `sigil_pulse` on the stones during a game, `stealth_smoke` for her exits.
* Sound: pond ripples (`water_impact` pitched 0.8, quiet), crickets, a flute and music-box layer on the `boss` music, `whisper` x1.

**R13 `selale_kenari` Şelale Kenarı (y 6.4, ceiling 16, 24 x 24 m, open air)**
* Props: `kn('cliff_waterfall_rock')` x3, `kn('cliff_waterfallTop_rock')` x1, `kn('rock_largeD')` x1, `kn('bridge_woodNarrow')` x1 over the stream, `kn('lily_large')` x4, trunks x6, `peri_anima_seed` (placed by the checkpoint code), a waterfall plane (`tt2-elements` cyan) 5.2 m tall on the south edge.
* Height: the cliff edge (the hop edge at x 64 to 66) with the pool seen 5.2 m below, a mist plume rising over the rim; the grove ends here and the sky shifts green.
* Lights: pool glow `0x70e0ff` 8 m (from below), 2 lanterns 6 m.
* VFX: `portal_swirl` mist at the base (scale 0.8), `smoke_zone` plume, `ambient_anima_motes`.
* Sound: `water_impact` loop (the waterfall bed, loud), wind, a `wolf_howl` far below once.

**R14 `havuz` Çağlayan Havuzu (y 6.4 to 1.2 stairs, pool 1.2, ceiling 24, 24 x 24 m, open air)**
* Props: `kn('lily_large')` x6, `kn('rock_largeD')` x4 and `gp('rock_large')` x4, `peri_gorm_egg` x4 at the stair foot (the first gorm hint), `kn('hanging_moss')` x10 (acid tint, emissive slime strands), a `peri_gorm_rib` x2 arch at the cave door, the 19 cliff treads.
* Height: the waterfall falls 5.2 m beside the stairs; the tone shifts from blue to sick green down the flight (fog blends from `0x2a4858` to `0x142418`).
* Lights: pool glow `0x70e0ff` 8 m, egg halos `0xd8ff90` 4 m x4.
* VFX: `ambient_mist` (blue to green), `poison_cloud` thin at the foot, `frost_burst` (tinted) splash at the plunge.
* Sound: the waterfall continues, `amb_nest_wet` (wet chittering) fades in at the bottom, `footstep_stone`.

**R15 `yuva_magarasi` Dikenfak Mağarası (y 1.2, ceiling 22, 60 x 32 m)**
* Props: `gp('rock_cliff')` x10, `gp('rock_large')` x6, `peri_gorm_rib` x6 (spires and arches), `peri_gorm_egg` x14 clusters plus one under each of the 9 dormant members of p22, `kn('hanging_moss')` x20 (acid tint, emissive), `gp('bone_pile')` x6 (tint `0x8a8a50`), 3 acid pools (zones), cobwebs x8.
* Height: chitin rib gallery ring at 9.0 m with egg shelves, 6 hanging egg sacs (`peri_gorm_egg` with `hang`) from the 22 m roof, beams at 21 m.
* Lights: 3 acid pools `0x9cff6a` 6 m, egg halos 4 m.
* VFX: `poison_cloud` low x3, `acid_pool` x3, `ambient_mist` (green), `ambient_dust`.
* Sound: `amb_nest_wet`, `bubble_loop` at the pools, random insect clicks (`enemy_aggro_spider` pitched 1.4, very quiet), `rubble` drips.

**R16 `yuva_koprusu` Çürük Köprü (y 1.2 deck, chasm floor -6.8, ceiling 20, 12 x 24 m)**
* Props: `kn('bridge_woodNarrow')` x3 along z (rot 90, the visible planks over the zone deck), rope posts x8, hanging roots x6, `peri_gorm_rib` x2 arches overhead at y 12, egg clusters x4 on the chasm walls.
* Height: the deck sits 8 m above the acid surface; the chasm walls show 3 ledges with egg clusters; a beam tier at 19 m.
* Lights: an acid glow from below (green, real 6 m at y -4), egg halos.
* VFX: rising `poison_cloud` bubbles, `acid_pool` plane at -6.8, `smoke_zone` steam x4.
* Sound: `bubble_loop` loud from below, `footstep_wood`, creaks, a wind echo; a fall plays `land` and `water_impact`.

**R17 `yan_tunel` Kök Kestirmesi (y 1.2, ceiling 6, 8 x 24 m, optional)**
* Props: `peri_root_gate` x1 (gate B, at the north mouth), root tangles `kn('plant_bushDetailed')` x6, `peri_gorm_egg` x3, `hw('skull')` x2 (earlier victims), `kn('hanging_moss')` x6.
* Height: a low root vault (6 m), the only room with a short ceiling.
* Lights: 1 dim teal 5 m, egg halos.
* VFX: `ambient_dust`, `ambient_mist` thin.
* Sound: drips (`water_impact` pitched 0.5), `lever` and `rubble` when the gate opens, `enemy_idle` echo.

**R18 `yuva_kuyusu` Larva Kuyusu (y 1.2 landing, pit -2.4, ceiling 20, 36 x 32 m)**
* Props: `peri_gorm_egg` x16 on the egg-wall terraces plus x8 on the flanks of the stairs, `peri_gorm_rib` x6 ring, `gp('rock_cliff')` ring x8, 1 acid pool, `peri_anima_seed` at (63.5, 38.5).
* Height: egg-wall shelf ring at 4.0 m with 10 more clusters, 4 hanging egg sacs from the roots at y 12, the 13-tread Çukur Merdiveni down into the bowl.
* Lights: 6 egg halos 4 m, acid pool 6 m, the seed glows gold.
* VFX: `ambient_mist` (green), `poison_cloud`, `waypoint_glow` at the seed, an egg pulse in code.
* Sound: `heartbeat_loop` (the nest's pulse, slow), `amb_nest_wet`, `enemy_idle` (quiet).

**R19 `tredova_magarasi` Dikenfak Yuvası (y -2.4, cocoon dais -1.2, ceiling 30, 64 x 52 m)**
* Props: `peri_lakali_cocoon` x1 at (61.5, 57) on the dais, 8 `peri_gorm_rib` spires (colliding, the charge walls, ring), `peri_gorm_egg` x10, `gp('crystal_blue')` x6 around the cocoon (tint `0x80ffe0`), `gp('rock_cliff')` perimeter, 2 acid pools, `gp('chest_epic')` on the kill, the exit portal at (64, 48).
* Height: brood gallery ring at 8.0 m with egg clusters, beams at 27 m, 4 hanging egg sacs from the roof, the 5-step dais, a 30 m dome that the intro camera tilts up through.
* Lights: cocoon `0xb8f0ff` 14 m (intensity 2.2), acid pools 6 m, 6 teal crystals 7 m (the pool shows the nearest).
* VFX: `consumption_swirl` around the cocoon during Consumption, `ambient_anima_motes` burst on death, `ambient_mist` (green), `acid_pool` x2, `poison_cloud`.
* Sound: `heartbeat_loop` (louder with each Consumption), `boss` music, `amb_nest_wet`, `choir_sting` on the death and a single cello line (the resolution).

**R20 `peri_halkasi` Peri Halkası (y 1.2 to 2.4 knoll, ceiling 10, 12 x 24 m, optional)**
* Props: `kn('mushroom_redGroup')` x12 (ring r 1.3 tiles, scale 12), `gp('chest_gold')` at (74.5, 29.8), `kn('stone_tallB')` x6 with `peri_sigil` glow, `peri_fae_lantern` x4, birch `tree35` x6, `kn('flower_purpleA')` x20.
* Height: a grassy knoll (ramp 1.2 to 2.4); the ring crowns it.
* Lights: 3 teal and gold lights 5 m, ring halos.
* VFX: `ambient_anima_motes` (dense), `buff_aura` ring when the haste shrine is used.
* Sound: a music-box chime (`ice_chime`), `aura_on` at the shrine, soft wind.

---

## 3. LAYOUT (our tile grid)

Grid **76 x 60** tiles (`grid: { w: 76, h: 60 }`). The route is a "C": start in the south-west, north through the camp and Ingra, **east across the top through the maze and the Sis Çağıran glade**, then **south down the east side** through the gorm nest to Tred'ova. Boss 1 sits at 27 % of the forces, boss 2 at 76 %, boss 3 at the end, like the WoW pacing (A section, maze, nest).

### 3.1 Rooms

`floor` / `wall` use existing ids unless marked NEW (`moss`, `grove`, `gorm`, see section 8, shared primitive S2). Forces are the non-optional sums of the packs of section 4.6. **Heights follow `docs/ENGINE_VERTICALITY.md` (the engine spec of CORE_MECHANICS section 13): the dungeon sets `DungeonDef.vertical: true`.** `floorY` = absolute base floor height of the room in metres (`RoomDef.floorY`), `ceiling` = clear height above the room's highest floor (`RoomDef.ceiling`, halls 12 to 30 m), `open` = `RoomDef.openAir` (no lid, sky backdrop, camera uncapped). Stairs, ramps, height areas and decor tiers are in 3.1b.

| id | Ad (TR) | rect x, z, w, h (tiles) | size (m) | floorY (m) | ceiling (m) | open | floor / wall | forces | notes |
|---|---|---|---|---|---|---|---|---|---|
| `giris` | Meşe Kovuğu | 2, 50, 9, 8 | 36 x 32 | 0.0 (font dais +0.4) | 14 | no | moss NEW / grove NEW | - | start hollow inside the oak, Kehanet Taşı, autoDecor 0.35, ambientVfx `ambient_anima_motes` NEW |
| `k_patika` | Yosunlu Patika | 11, 53, 4, 2 | 16 x 8 | 0.0 to 1.2 (stairs) | 8 | no | moss / grove | - | **Kök Basamakları**, 5 treads, start barrier door on its west end |
| `drust_kampi` | Boynuzlu Ahali Kampı | 15, 46, 13, 13 | 52 x 52 | 1.2 (ritual dais 1.6) | 7 (palisade) | yes | dirt / grove | 90 | pulls 1 to 5, big pull, autoDecor 0.5, `explicitDecor` |
| `k_ritual` | Ritüel Yolu | 21, 42, 2, 4 | 8 x 16 | 2.4 (flat), 2.4 to 1.2 (stairs) | 10 | no | dirt / grove | 10 | one pack on the flat half, stair half leads down to the camp |
| `ingra_arena` | Boynuz Çemberi | 15, 29, 14, 13 | 56 x 52 | 2.4 | 8 (antler arch 12) | yes | dirt / grove | - | **boss 1**, `boss: 1`, `explicitDecor`, flat floor, gallery ring above |
| `kok_salonu` | Kök Salonu | 16, 21, 12, 8 | 48 x 32 | 4.8 (landing 2.4) | **26** | no | moss / grove | 31 | **grand staircase** 4.8 to 2.4, anima seed 1 on the landing, root gate A on the west wall |
| `mantar_korusu` | Mantar Korusu | 6, 21, 10, 8 | 40 x 32 | 4.4 (shrine mound 4.8) | 12 | no | moss / grove | 16 (optional) | `optional: true`, shrine power |
| `m1` | Sis Kıvrımı I | 16, 10, 8, 11 | 32 x 44 | 4.8 | 18 | yes | moss / grove | 32 | maze glade 1, enters from the south |
| `m2` | Sis Kıvrımı II | 24, 10, 8, 11 | 32 x 44 | 5.2 | 18 | yes | moss / grove | 37 | glade 2, mini-boss pack |
| `m3` | Sis Kıvrımı III | 32, 10, 8, 11 | 32 x 44 | 5.6 | 18 | yes | moss / grove | 47 | glade 3, the big maze pull |
| `m4` | Sis Kıvrımı IV | 40, 10, 8, 11 | 32 x 44 | 6.0 | 18 | yes | moss / grove | 36 | glade 4, boss door on its east face |
| `sis_cagiran_cayiri` | Sis Çağıran Çayırı | 48, 6, 13, 15 | 52 x 60 | 6.4 (stump dais 6.8, 7.2) | 16 | yes | moss / grove | - | **boss 2**, `boss: 2`, `explicitDecor` |
| `selale_kenari` | Şelale Kenarı | 61, 12, 6, 6 | 24 x 24 | 6.4 | 16 | yes | moss / grove | - | cliff ledge, anima seed 2, waterfall hop edge |
| `havuz` | Çağlayan Havuzu | 61, 18, 6, 6 | 24 x 24 | 6.4 to 1.2 (stairs), pool 1.2 | 24 | yes | moss / gorm | 10 | **Şelale Merdiveni** (19 treads) beside the plunge pool |
| `yuva_magarasi` | Dikenfak Mağarası | 58, 24, 15, 8 | 60 x 32 | 1.2 | 22 | no | gorm NEW / gorm NEW | 70 | pulls 21 to 24, big pull, dormant eggs |
| `yuva_koprusu` | Çürük Köprü | 60, 32, 3, 6 | 12 x 24 | 1.2 (deck), void columns at -6.8 | 20 | no | gorm / gorm | 16 | a 4 m wide bridge between two **chasm columns** |
| `yan_tunel` | Kök Kestirmesi | 58, 32, 2, 6 | 8 x 24 | 1.2 | 6 | no | dirt / gorm | 8 (optional) | `skip: true`, root gate B at its north mouth |
| `yuva_kuyusu` | Larva Kuyusu | 56, 38, 9, 8 | 36 x 32 | 1.2 (landing) to -2.4 (stairs), pit floor -2.4 | 20 | no | gorm / gorm | 46 | **Çukur Merdiveni** (13 treads), pulls 27 to 29, anima seed 3 |
| `tredova_magarasi` | Dikenfak Yuvası | 54, 46, 16, 13 | 64 x 52 | -2.4 (cocoon dais -1.2) | **30** | no | gorm / gorm | - | **boss 3**, `boss: 3`, `explicitDecor`, exit portal |
| `peri_halkasi` | Peri Halkası | 73, 25, 3, 6 | 12 x 24 | 1.2 to 2.4 (ramp) | 10 | yes | moss / grove | 14 (optional) | `optional: true`, shrine haste, gold chest on the knoll |

All other fields follow `kit.ts room(id, name, x, z, w, h, floor, wall, autoDecor, extra)`. `autoDecor`: start 0.35, camp 0.5, corridors 0.4, hall 0.45, grove 0.5, glades 0.3, nest 0.6, boss arenas 0.15 with `explicitDecor: true`.

### 3.1b Verticality (CORE_MECHANICS section 13, binding)

The dungeon is a **descent into a climb and back down**: the player climbs from the hollow floor (0.0 m) up through the camp, the Boynuz plateau and the grand root staircase to the misty glades (up to 6.4 m, the stump dais at 7.2 m), then drops 5.2 m down the waterfall stairs into the gorm realm and keeps sinking into the larva pit and Tred'ova's cavern at **-2.4 m**. **Seven walkable floor levels (0.0, 1.2, 2.4, 4.8, 6.4, 7.2 and -2.4) across 9.6 m of height**, three real stair flights, one ramp, one chasm with a bridge, no lifts (the WoW original has none, `lifts: []`; the `LiftDef` stays available for a later season).

**Levels**

| level | y (m) | rooms | role |
|---|---|---|---|
| L0 Kovuk | 0.0 | `giris`, bottom of `k_patika` | start, Font of Power |
| L1 Kamp | 1.2 (ritual dais 1.6) | `drust_kampi`, bottom of `k_ritual`; **again** `havuz` pool, `yuva_magarasi`, bridge, tunnel, top of `yuva_kuyusu` | the camp, and the lower cave route |
| L2 Boynuz Platosu | 2.4 | top of `k_ritual`, `ingra_arena`, `kok_salonu` landing, top of `peri_halkasi` knoll | boss 1 plateau |
| L3 Kök Sırtı | 4.4 to 4.8 | `kok_salonu` upper floor, `mantar_korusu`, `m1` | the hall above the grand stair |
| L4 Sis Basamakları | 5.2 to 6.0 | `m2` 5.2, `m3` 5.6, `m4` 6.0 | the maze climbs 0.4 m per choice wall |
| L5 Ay Çayırı | 6.4 to 7.2 | `sis_cagiran_cayiri` 6.4 (stump 6.8 then 7.2), `selale_kenari` 6.4 | boss 2 and the waterfall ledge |
| L-1 Dikenfak Çukuru | -2.4 (cocoon dais -1.2) | `yuva_kuyusu` pit floor, `tredova_magarasi` | the nest bottom, boss 3 |

**Stair flights and the ramp** (`RoomDef.slopes`, tile rects, `yFrom` at the min edge of the axis, `yTo` at the max edge; stairs use `treadCount = ceil(rise / 0.28)`, max grade 0.80, all values script-checked)

| id | room | rect x, z, w, h | axis | yFrom to yTo | run | grade | treads | tread depth | name |
|---|---|---|---|---|---|---|---|---|---|
| `st_patika` | `k_patika` | 11, 53, 4, 2 | x | 0.0 to 1.2 | 16 m | 0.075 | 5 | 3.20 m | Kök Basamakları |
| `st_ritual` | `k_ritual` | 21, 44, 2, 2 | z | 2.4 to 1.2 | 8 m | 0.150 | 5 | 1.60 m | Ritüel Basamakları |
| `st_kok` | `kok_salonu` | 16, 24, 12, 3 | z | 4.8 to 2.4 | 12 m | 0.200 | 9 | 1.33 m | **Büyük Kök Merdiveni** (48 m wide, the grand staircase, flanked by banners and a stag statue pair) |
| `st_selale` | `havuz` | 61, 19, 3, 5 | z | 6.4 to 1.2 | 20 m | 0.260 | 19 | 1.05 m | **Şelale Merdiveni** (carved into the cliff beside the falls) |
| `st_kuyu` | `yuva_kuyusu` | 56, 39, 9, 3 | z | 1.2 to -2.4 | 12 m | 0.300 | 13 | 0.92 m | **Çukur Merdiveni** (egg-wall terraces on both flanks) |
| `st_koza` | `tredova_magarasi` | 59.5, 54, 4, 1 | z | -2.4 to -1.2 | 4 m | 0.300 | 5 | 0.80 m | Koza Basamakları (to the cocoon dais) |
| `rp_halka` | `peri_halkasi` | 73, 25, 3, 6 | x | 1.2 to 2.4 | 12 m | 0.100 | ramp | - | Peri Tepesi (`kind: 'ramp'`, a grassy knoll) |

**Height areas, decor tiers, chasm and bridge** (absolute metres, tile coordinates, `rect` is `{ x, z, w, h }` in code)

```ts
// DungeonDef: vertical: true, lifts: []
// RoomDef additions per room (floorY / ceiling / openAir are the 3.1 table). Only the non-obvious fields are listed.
giris:             heightAreas: [{ id: 'font_dais', rect: [5.5, 50.5, 2, 2], y: 0.4 }]
                   tiers: [{ kind: 'ring', y: 7.0, rect: [2, 50, 9, 8], depth: 3 },            // root gallery, 6 fae lanterns, 4 banners
                           { kind: 'windows', y: 9.0, rect: [2, 50, 9, 8], count: 6, spacing: 5 },   // moonlight shafts
                           { kind: 'beams', y: 13.0, rect: [2, 50, 9, 8] }]
k_patika:          slopes: [st_patika]
drust_kampi:       heightAreas: [{ id: 'ritual_dais', rect: [19.5, 49.5, 4, 5], y: 1.6 }]
                   tiers: [{ kind: 'ring', y: 5.0, rect: [15, 46, 13, 13], depth: 2 },         // palisade walkway (decor), 4 watchtowers
                           { kind: 'colonnade', y: 0, rect: [15, 46, 13, 13], count: 8, spacing: 6 }]   // 8 antler poles
k_ritual:          heightAreas: [{ rect: [21, 42, 2, 2], y: 2.4 }]   slopes: [st_ritual]
ingra_arena:       tiers: [{ kind: 'ring', y: 7.0, rect: [15, 29, 14, 13], depth: 3 },        // root balcony ring, 8 wicker totems, 6 hanging cages
                           { kind: 'balcony', y: 9.0, rect: [18.5, 29, 7, 1.5], wall: true }]    // the antler-arch balcony behind Ingra
kok_salonu:        heightAreas: [{ id: 'landing', rect: [16, 27, 12, 2], y: 2.4 }]   slopes: [st_kok]
                   tiers: [{ kind: 'ring', y: 12.0, rect: [16, 21, 12, 8], depth: 4 },        // upper gallery, 12 m above the upper floor
                           { kind: 'colonnade', y: 0, rect: [16, 21, 12, 8], count: 10, spacing: 4 },
                           { kind: 'windows', y: 16.0, rect: [16, 21, 12, 8], count: 8, spacing: 5 },
                           { kind: 'beams', y: 25.0, rect: [16, 21, 12, 8] }]
mantar_korusu:     heightAreas: [{ id: 'shrine_mound', rect: [9.5, 23.5, 2, 2], y: 4.8 }]
                   tiers: [{ kind: 'ring', y: 8.0, rect: [6, 21, 10, 8], depth: 2 }]            // giant cap canopy (decor), 14 hanging spore lamps
m1..m4:            tiers: [{ kind: 'colonnade', y: 0, rect: <room>, count: 6, spacing: 5 },     // root pillars with mist veils
                           { kind: 'beams', y: 16.0, rect: <room> }]                              // hanging root arches
sis_cagiran_cayiri: heightAreas: [{ id: 'stump_outer', rect: [51, 10, 6, 6], y: 6.8 }, { id: 'stump_inner', rect: [52, 11, 4, 4], y: 7.2 }]   // 2 steps of 0.4 m
                   tiers: [{ kind: 'ring', y: 11.0, rect: [48, 6, 13, 15], depth: 2 }]          // birch canopy ring (decor)
selale_kenari:     heightAreas: [{ id: 'hop_edge', rect: [64, 17, 3, 1], y: 6.4, rim: 'ledge' }]  // the optional waterfall jump (3.7, M5)
havuz:             heightAreas: [{ id: 'top_landing', rect: [61, 18, 3, 1], y: 6.4 }, { id: 'plunge_pool', rect: [64, 18, 3, 6], y: 1.2 }]   slopes: [st_selale]
yuva_magarasi:     tiers: [{ kind: 'ring', y: 9.0, rect: [58, 24, 15, 8], depth: 3 },           // chitin rib gallery, egg shelves
                           { kind: 'beams', y: 21.0, rect: [58, 24, 15, 8] }]
yuva_koprusu:      zones: bridge rect [61, 32, 1, 6] y 1.2, void rects [60, 32, 1, 6] and [62, 32, 1, 6] { fall: 'open', depth: 8 }   // chasm floor at -6.8
                   tiers: [{ kind: 'beams', y: 19.0, rect: [60, 32, 3, 6] }]
yuva_kuyusu:       heightAreas: [{ id: 'top_landing', rect: [56, 38, 9, 1], y: 1.2 }]   slopes: [st_kuyu]
                   tiers: [{ kind: 'ring', y: 4.0, rect: [56, 38, 9, 8], depth: 2.5 }]          // egg-wall shelves ringing the pit
tredova_magarasi:  heightAreas: [{ id: 'cocoon_dais', rect: [59.5, 55, 4, 3], y: -1.2 }]   slopes: [st_koza]
                   tiers: [{ kind: 'ring', y: 8.0, rect: [54, 46, 16, 13], depth: 3 },          // upper brood gallery, egg clusters
                           { kind: 'colonnade', y: 0, rect: [54, 46, 16, 13], count: 8, spacing: 8 },   // the 8 chitin spires (also the rush walls, 5.3)
                           { kind: 'beams', y: 27.0, rect: [54, 46, 16, 13] }]
peri_halkasi:      slopes: [rp_halka]
```

* **Chasm and bridge (the WoW-style set piece).** The two void columns of `yuva_koprusu` use `fall: 'open'`, depth 8 m (acid surface at -6.8 m, `acid_pool` plane). A knockback into them is a **fall: black fade, -25 % max HP, non-lethal, respawn at the safe sample on the bridge mouth, 1 s invulnerability** (`VERT.VOID_DMG_FRAC`, ENGINE_VERTICALITY section 11), instead of the old hazard tick. It costs about 6 s and a quarter of the life bar, so the Gorger knockback is a mistake that hurts, not a wipe. The bridge deck is 4 m wide (the validator wants 2 m with 1 m margins).
* **Waterfall hop (optional, replaces the old M5 polish idea with real height).** `hop_edge` is a `rim: 'ledge'` strip on the ledge's south edge: a player may step off, falls 5.2 m onto the plunge pool, takes `min(0.24, (5.2 - 4) x 0.03) = 3.6 %` max HP (non-lethal) and saves the 20 m of stairs (about 8 s).
* **Gallery tiers are decor only.** Nothing above a floor is walkable, packs and rift spots never sit under a tier, and nobody can be unreachable. Chandeliers, banners and statues are normal props with `y` (offset) or `absY`, listed per room in 2.11.

**Side elevation of the critical path (route A over the bridge; 1 column = 8 m of path, about 545 m in a straight line, 640 m with detours)**

```
 y (m)
 +7.2 |                                        .                           stump dais (boss 2)
 +6.4 |                                       /___________                  ledge, Mistcaller glade
 +5.6 |                               /_______............\                  m3 5.6
 +4.8 |                      /________.....................                   m1 4.8, m2 5.2 (not drawn), m4 6.0
 +4.0 |                      ..............................
 +3.2 |                     /..............................\                 Waterfall stairs: 19 treads, -5.2 m
 +2.4 |            /________................................                     Grand root staircase: 9 treads, +2.4 m
 +1.6 |           /.........................................
 +0.8 |    /______..........................................\_______        camp 1.2, cave 1.2, bridge 1.2
 +0.0 |____.........................................................
 -0.8 |.............................................................\
 -1.6 |..............................................................
 -2.4 |..............................................................\_____    larva pit and Tred'ova, -2.4
 -3.2 |....................................................................
        HOLLOW patika CAMP ritual INGRA   KOK  m1  m2  m3  m4  MISTCALLER ledge  cave bridge pit  TREDOVA
        0 m      44m    75m        111m   (arena 2.4)  167m 193m  245m 277m 309m   354m  395m 444m  484m 516m  544m
```
(`/` = stairs or ramp up, `\` = stairs down, `_` = floor, `.` = rock below. Rows are 0.8 m; the 0.4 m maze steps and the 1.2 m / 1.6 m camp details fall between rows and are not drawn. Generated from the room table by script.)

**Verification (script, `tools/content-check.mjs` repeats it in PS-QA).** All 29 doors: `|dy| <= 0.45` between the two landing cells, or a slope end within one tread (0.28 to 0.30 m). Maze and boss-2 doors step 0.4 m (the root thresholds); door 6 steps 0.4 m (4.8 to 4.4). Stairs: grade 0.075 to 0.30 (limit 0.80), tread depth 0.80 m to 3.20 m (limit 0.45), tread rise 0.28 m (limit 0.30). Packs: 29 of 30 centres lie on flat cells; `ps_p30` stands on the ramp (grade 0.10, optional). Boss arenas are single flat regions (`Ingra` 2.4, `Sis Çağıran` 6.4 with the two-step stump dais, `Tred'ova` -2.4 with the cocoon dais). The route graph has one region (all gates open): no ledge strands anyone.

**Combat on height (ENGINE_VERTICALITY section 12).** Melee and hit shapes ignore differences up to 2.5 m: fighting on the grand stair (2.4 m over 12 m) and on the Waterfall stair is fully legal, but a player standing on the 5.2 m ledge cannot be hit by melee from the pool and vice versa; ranged needs line of sight, so the waterfall lets casters on the ledge fire at the pool pack (p20) with no return fire except the Gorgers' projectiles. The Larva pit is a bowl: p27 to p29 can see the party on the Çukur Merdiveni and cast down it. Enemies path through stairs only, flyers (Sis Sokucu, Dikenfak Yağmacı) ignore height.

### 3.2 Map

Legend: `A` giris, `a` k_patika, `B` drust_kampi, `b` k_ritual, `I` ingra_arena, `C` kok_salonu, `c` mantar_korusu, `p q r s` maze glades 1 to 4, `D` sis_cagiran_cayiri, `L` selale_kenari, `H` havuz, `N` yuva_magarasi, `n` yuva_koprusu, `t` yan_tunel, `U` yuva_kuyusu, `T` tredova_magarasi, `h` peri_halkasi. `+` open door, `#` boss_lock door, `%` boss_exit door, `R` root gate door, `S` start, `K` Kehanet Taşı, `X` exit portal, `*` shrine, `1 2 3` boss spawns. Rows 0 to 5 and 59 are empty and omitted.

```
    0         1         2         3         4         5         6         7     
    0123456789012345678901234567890123456789012345678901234567890123456789012345
  6                                                 DDDDDDDDDDDDD
  7                                                 DDDDDDDDDDDDD
  8                                                 DDDDDDDDDDDDD
  9                                                 DDDDDDDDDDDDD
 10                 ppppppp+qqqqqqq+rrrrrrr+ssssssssDDDDDDDDDDDDD
 11                 ppppppp+qqqqqqq+rrrrrrr+ssssssssDDDDDDDDDDDDD
 12                 ppppppppqqqqqqqqrrrrrrrrssssssssDDDDDDDDDDDDDLLLLLL
 13                 ppppppp+qqqqqqq+rrrrrrr+ssssssssDDDDDDDDD2DD%LLLLLL
 14                 ppppppp+qqqqqqq+rrrrrrr+sssssss#DDDDDDDDDDDD%LLLLLL
 15                 ppppppppqqqqqqqqrrrrrrrrsssssss#DDDDDDDDDDDDDLLLLLL
 16                 ppppppp+qqqqqqq+rrrrrrr+ssssssssDDDDDDDDDDDDDLLLLLL
 17                 ppppppp+qqqqqqq+rrrrrrr+ssssssssDDDDDDDDDDDDDL++LLL
 18                 ppppppppqqqqqqqqrrrrrrrrssssssssDDDDDDDDDDDDDHHHHHH
 19                 ppppppp+qqqqqqq+rrrrrrr+ssssssssDDDDDDDDDDDDDHHHHHH
 20                 ppppppp+qqqqqqq+rrrrrrr+ssssssssDDDDDDDDDDDDDHHHHHH
 21       ccccccccccCCC++CCCCCCC                                 HHHHHH
 22       ccccccccccRCCCCCCCCCCC                                 HHHHHH
 23       ccccccccccRCCCCCCCCCCC                                 H++HHH
 24       ccccccccccCCCCCCCCCCCC                              NNNNNNNNNNNNNNN
 25       ccccc*ccccCCCCCCCCCCCC                              NNNNNNNNNNNNNNNhhh
 26       ccccccccccCCCCCCCCCCCC                              NNNNNNNNNNNNNN+hhh
 27       ccccccccccCCCCCCCCCCCC                              NNNNNNNNNNNNNN+hhh
 28       ccccccccccCCCCCCCCCCCC                              NNNNNNNNNNNNNNNh*h
 29                IIIIII%%IIIIII                             NNNNNNNNNNNNNNNhhh
 30                IIIIIIIIIIIIII                             NNNNNNNNNNNNNNNhhh
 31                IIIIIIIIIIIIII                             RRN+NNNNNNNNNNN
 32                IIIIIIIIIIIIII                             ttnnn
 33                IIIIIII1IIIIII                             ttnnn
 34                IIIIIIIIIIIIII                             ttnnn
 35                IIIIIIIIIIIIII                             ttnnn
 36                IIIIIIIIIIIIII                             ttnnn
 37                IIIIIIIIIIIIII                             ++n+n
 38                IIIIIIIIIIIIII                           UUUUUUUUU
 39                IIIIIIIIIIIIII                           UUUUUUUUU
 40                IIIIIIIIIIIIII                           UUUUUUUUU
 41                IIIIIIIIIIIIII                           UUUUUUUUU
 42                      ##                                 UUUUUUUUU
 43                      bb                                 UUUUUUUUU
 44                      bb                                 UUUUUUUUU
 45                      bb                                 UUU##UUUU
 46                BBBBBB++BBBBB                          TTTTTTTTTTTTTTTT
 47                BBBBBBBBBBBBB                          TTTTTTTTTTTTTTTT
 48                BBBBBBBBBBBBB                          TTTTTTTTTTXTTTTT
 49                BBBBBBBBBBBBB                          TTTTTTTTTTTTTTTT
 50   AAAAAAAAA    BBBBBBBBBBBBB                          TTTTTTTTTTTTTTTT
 51   AAAAAAAAA    BBBBBBBBBBBBB                          TTTTTTTTTTTTTTTT
 52   AAAAAKAAA    BBBBBBBBBBBBB                          TTTTTTTTTTTTTTTT
 53   AAAAAAAA+aaa+BBBBBBBBBBBBB                          TTTTTTTT3TTTTTTT
 54   AASAAAAA+aaa+BBBBBBBBBBBBB                          TTTTTTTTTTTTTTTT
 55   AAAAAAAAA    BBBBBBBBBBBBB                          TTTTTTTTTTTTTTTT
 56   AAAAAAAAA    BBBBBBBBBBBBB                          TTTTTTTTTTTTTTTT
 57   AAAAAAAAA    BBBBBBBBBBBBB                          TTTTTTTTTTTTTTTT
 58                BBBBBBBBBBBBB                          TTTTTTTTTTTTTTTT
```

### 3.3 Doors (`DoorDef`: a, b, tile in a, side, width, gate)

`dy` is the height difference between the two landing cells (ENGINE_VERTICALITY validator E5: at most 0.45 m, or a slope end).

| # | a | b | tile | side | w | gate | dy (m) | note |
|---|---|---|---|---|---|---|---|---|
| 1 | giris | k_patika | 10, 53 | e | 2 | none | 0.24 | first tread of `st_patika`; start barrier until the 10 s countdown ends (`StartBarrier`) |
| 2 | k_patika | drust_kampi | 14, 53 | e | 2 | none | 0.0 | top tread meets the camp floor |
| 3 | drust_kampi | k_ritual | 21, 46 | n | 2 | none | 0.0 | bottom tread of `st_ritual` meets the camp floor |
| 4 | k_ritual | ingra_arena | 21, 42 | n | 2 | boss_lock | 0.0 | the flat half of the corridor, 2.4 on both sides |
| 5 | ingra_arena | kok_salonu | 21, 29 | n | 2 | boss_exit | 0.0 | lands on the 2.4 landing of the grand staircase |
| 6 | kok_salonu | mantar_korusu | 16, 22 | w | 2 | none | 0.4 | **root gate A** prop in the gap (moved one tile north so it opens onto the flat upper floor, not onto the stair) |
| 7 | kok_salonu | m1 | 19, 21 | n | 2 | none | 0.0 | maze entry |
| 8 to 11 | m1 | m2 | (23,10) (23,13) (23,16) (23,19) | e | 2 | none | 0.4 | **choice wall 1** (4 doorways, 1 safe), each on a 0.4 m root step |
| 12 to 15 | m2 | m3 | (31,10) (31,13) (31,16) (31,19) | e | 2 | none | 0.4 | choice wall 2 |
| 16 to 19 | m3 | m4 | (39,10) (39,13) (39,16) (39,19) | e | 2 | none | 0.4 | choice wall 3 |
| 20 | m4 | sis_cagiran_cayiri | 47, 14 | e | 2 | boss_lock | 0.4 | |
| 21 | sis_cagiran_cayiri | selale_kenari | 60, 13 | e | 2 | boss_exit | 0.0 | |
| 22 | selale_kenari | havuz | 62, 17 | s | 2 | none | 0.0 | onto the flat `top_landing` of the waterfall stairs |
| 23 | havuz | yuva_magarasi | 62, 23 | s | 2 | none | 0.0 | bottom tread meets the cave floor |
| 24 | yuva_magarasi | yuva_koprusu | 61, 31 | s | 1 | none | 0.0 | 4 m wide bridge mouth |
| 25 | yuva_magarasi | yan_tunel | 58, 31 | s | 2 | none | 0.0 | **root gate B** prop in the gap |
| 26 | yuva_koprusu | yuva_kuyusu | 61, 37 | s | 1 | none | 0.0 | onto the `top_landing` of `st_kuyu` |
| 27 | yan_tunel | yuva_kuyusu | 58, 37 | s | 2 | none | 0.0 | same landing |
| 28 | yuva_kuyusu | tredova_magarasi | 59, 45 | s | 2 | boss_lock | 0.0 | pit floor to the boss floor, both -2.4 |
| 29 | yuva_magarasi | peri_halkasi | 72, 26 | e | 2 | none | 0.05 | foot of the knoll ramp |

Geometry was checked by script: no room overlaps, every door tile lies on the edge of room `a` facing `side`, every door lands inside room `b`, and **every landing pair passes the height rule above** (a throwaway script during design, repeated by the height validator of `tools/content-check.mjs` in PS-QA).

### 3.4 Critical path, optional areas, skips

* **Critical path:** 1, 2, 3, 4 (boss 1), 5, 7, then the three choice walls (8..19), 20 (boss 2), 21, 22, 23, then **either** 24 and 26 (the bridge) **or** 25 and 27 (the tunnel), then 28 (boss 3).
* **Optional areas:** Mantar Korusu (16 forces, Kudret shrine, root gate A), Peri Halkası (14 forces, Rüzgar shrine, gold chest), Kök Kestirmesi pack (8 forces).
* **Skips:** (1) **Kök Kestirmesi** skips the whole bridge (p25, 16 forces, and the knockback danger) for a root gate channel and a lone Staghorn. (2) **Stealth skips** (Haydut Gölge, Duman Bombası, stealth potions) work on packs because aggro checks stealth: the camp's p01 (8 swarm) and the maze packs can be slipped, which is the intended "WoW skip" feel. (3) Out-of-combat CC (sleep, stun) on single mobs is allowed by the engine. (4) There is **no way** to skip a boss: `boss_lock` stays shut while a lower `order` boss lives.
* **Dead end rule:** the only dead ends are Mantar Korusu and Peri Halkası (both optional).

### 3.5 Floor features (`ZoneDef`, helpers `circleZone` / `rectZone`, GDD coordinates, radius in tiles)

```ts
const rune = (x, z, r, glow = 0x60ffd8, gi = 0.5) => circleZone('rune', x, z, r, { color: 0x10201f, glow, glowIntensity: gi });
const acid = (x, z, r) => circleZone('pool', x, z, r, { color: 0x2a4a10, glow: 0x9cff6a, glowIntensity: 0.8, hazard: { coef: 0.35, interval: 1.0 } });
// chasm column: a real void with a fall plane (ENGINE_VERTICALITY 8 / 11), replaces the old blocked hazard pit
const CHASM = { fall: 'open', depth: 8, color: 0x0a1408, glow: 0x9cff6a, glowIntensity: 0.9 } as const;   // acid surface at 1.2 - 8 = -6.8 m

giris:               [rune(6.5, 51.5, 1.0, 0x60ffd8, 0.4)]
drust_kampi:         [circleZone('rune', 21.5, 52, 3.4, { color: 0x1a1020, glow: 0xb060ff, glowIntensity: 0.5 })]
ingra_arena:         [circleZone('rune', 21.5, 35, 5.6, { color: 0x1c1024, glow: 0xb060ff, glowIntensity: 0.7 }), circleZone('rune', 21.5, 35, 2.4, { color: 0x1c1024, glow: 0xff5090, glowIntensity: 0.6 })]
mantar_korusu:       [circleZone('pool', 10.5, 24.5, 2.0, { color: 0x1a4a40, glow: 0x60ffd8, glowIntensity: 0.5 })]          // shallow, walkable, sits on the shrine mound
m1, m2, m3, m4:      [rune(19.5 | 27.5 | 35.5 | 43.5, 15, 2.0, 0x80c0ff, 0.3)]
sis_cagiran_cayiri:  [circleZone('pool', 54, 13, 4.0, { color: 0x1a3a58, glow: 0x60c8ff, glowIntensity: 0.45 }), circleZone('dais', 54, 13, 1.8)]   // pond around the 2-step stump platform (heights come from heightAreas)
havuz:               [rectZone('pool', 64, 18, 3, 6, { color: 0x1a4a68, glow: 0x70e0ff, glowIntensity: 0.6 })]      // the plunge pool, east of the stairs
yuva_magarasi:       [acid(64, 27.5, 1.5), acid(70, 25.5, 1.4), acid(66.5, 30.5, 1.2)]
yuva_koprusu:        [rectZone('bridge', 61, 32, 1, 6, { y: 1.2 }), rectZone('void', 60, 32, 1, 6, CHASM), rectZone('void', 62, 32, 1, 6, CHASM)]   // x 61 stays the 4 m deck
yuva_kuyusu:         [acid(60, 43.2, 1.6)]
tredova_magarasi:    [rune(61.5, 51, 6.0, 0x9cff6a, 0.4), circleZone('dais', 61.5, 56.5, 2.4), acid(56.5, 49.5, 2.0), acid(66.5, 55, 2.2)]   // the dais height is the heightArea `cocoon_dais`
peri_halkasi:        [rune(74.5, 28, 1.3, 0x60ffd8, 0.6)]
```

The Çürük Köprü is the danger: a Gorger's 6 m knockback (section 4) toward the void columns is **a fall (-25 % max HP, non-lethal, about 6 s lost)**, not a hazard tick. The acid pools of the cave and the pit remain light hazards (`coef 0.35 / 1.0 s`). Boss rooms keep their pools as visual or light hazards only.

### 3.6 Extras and placements

```ts
const START = [4, 54], FONT = [6.5, 51.5], EXIT = [64, 48];          // start facing 90 (east, toward door 1)
vertical: true, lifts: [],                                            // ENGINE_VERTICALITY 0.2: opt-in flag, no lifts here
bosses: bossAt('boss_ingra_malok', 'ingra_arena', 21.5, 33, 0, 1),                 // faces the south door
        bossAt('boss_sis_cagiran', 'sis_cagiran_cayiri', 56.5, 13, -90, 2),       // faces the west door
        bossAt('boss_tredova', 'tredova_magarasi', 61.5, 53, 180, 3),             // faces the north door
extras: {
  fontOfPower: pt(6.5, 51.5),
  shrines: [{ type: 'shrine_power', pos: pt(10.5, 24.5) }, { type: 'shrine_haste', pos: pt(74.5, 28) }],
  // 8 spots (was 6): none in a boss arena, none in a choice lane (x within 2.5 tiles of a choice wall), none on a stair or ramp, every spot
  // at least 12 m from any pack centre or patrol point (the glade-2 spot 22 m, the camp spot 16 m). They double as Kibir Tecessümü spawns (6.5).
  riftSpots: [[26.5, 47.5], [26.5, 27.5], [17, 19], [29.5, 20], [37.5, 12], [64, 14.5], [70.5, 25.5], [59.5, 30.5]],
  chests: [{ pos: pt(8, 22.5), kind: 'chest_wood' }, { pos: pt(74.5, 29.8), kind: 'chest_gold' }],
  // NEW optional fields (section 8, S9 / S6): ONLY the third anima seed. The seeds after boss 1 and boss 2 already exist in the code
  // (DungeonScene places a Diriliş Taşı 3.4 m past each boss_exit door, around line 878): on the Kök landing (about (21.5, 28.2)) and on the ledge.
  checkpoints: [pt(63.5, 38.5)],                                      // Depleted Anima Seed in the nest, on the flat top landing of the Çukur Merdiveni
  maze: { /* see 3.7 M1 */ },
}
```

| rift / Kibir spot | tile | room | level (m) | nearest pack | distance |
|---|---|---|---|---|---|
| S1 | 26.5, 47.5 | `drust_kampi` (east edge) | 1.2 | p03 | 16 m |
| S2 | 26.5, 27.5 | `kok_salonu` landing | 2.4 | p08 | 22 m |
| S3 | 17, 19 | `m1` (south-west corner) | 4.8 | p10 | 13 m |
| S4 | **29.5, 20** | `m2` (south-east corner, **corrected from the old (25.5, 18.5), which was in m2's west lane, 16 m from p12 and p13**) | 5.2 | p12 | **22 m** |
| S5 | 37.5, 12 | `m3` (north, between p16 and the east wall) | 5.6 | p16 | 14 m |
| S6 | 64, 14.5 | `selale_kenari` | 6.4 | p20 | 26 m |
| S7 | 70.5, 25.5 | `yuva_magarasi` (east) | 1.2 | p23 | 18 m |
| S8 | 59.5, 30.5 | `yuva_magarasi` (south-west) | 1.2 | p21 | 13 m |

World arenas for `BossDef.arena` (world metres, `centre = ((x + w/2) * 4, (z + h/2) * 4)`, home = boss spawn `(c + 0.5) * 4`):

| boss | arena `{ cx, cz, w, h, homeX, homeZ }` | arenaR | floor y |
|---|---|---|---|
| Ingra Malok | `{ 88, 142, 56, 52, 88, 134 }` | 22 | 2.4 |
| Sis Çağıran | `{ 218, 54, 52, 60, 228, 54 }` | 24 | 6.4 (stump 6.8 / 7.2) |
| Tred'ova | `{ 248, 210, 64, 52, 248, 214 }` | 28 | -2.4 (cocoon dais -1.2) |

### 3.7 Set-piece mechanics and how to build them

| Set piece | WoW origin | Build with | NEW part |
|---|---|---|---|
| Kehanet Taşı and start barrier | Font of Power | `gp('font_of_power')` at FONT with `tag: 'socket'` (EXISTS) | none |
| Drust patrol and ritual braziers | Drust camp | `PackDef.patrol` and `big: true` (EXISTS) | none |
| Droman chained to a post | Ingra, Soul Shackle | boss script plus a prop `droman_post` (EXISTS: props, chains) | add def `ps_droman` (section 5) |
| **Kök Kapısı** (root gates) | Overgrown Roots | prop `peri_root_gate` hidden by `BuiltProp.hide()` (re-opens nav, EXISTS) | **M2 ChannelGate** interactable |
| Mushroom buff grove | mushroom buffs | `extras.shrines` + `tag: 'shrine'` prop with a giant mushroom model (EXISTS) | none (model swap only) |
| **Mist maze, symbols** | Mistveil Tangle | `DoorDef` x4 per wall (EXISTS) + sigil props + veil props | **M1 Sis Labirenti** |
| Anima Seeds | Depleted Anima Seeds | `peri_anima_seed` prop, `tag: 'waypoint'` (EXISTS tag). The first two seeds are the existing boss-exit stones; only the nest seed is data (`extras.checkpoints`) | the one-line M+ release at `this.checkpoint` (S9) |
| Waterfall jump | jump the waterfall | the `hop_edge` ledge strip of 3.1b plus the Şelale Merdiveni | none (real height now, **M5**: a 5.2 m drop costs 3.6 % HP) |
| Egg packs | gorm eggs | `PackDef.dormant { kind: 'egg', wakeRadius: 6 }`, `peri_gorm_egg` props with `tag: 'wake'` under each member (EXISTS, same as Kemik's bone piles) | none |
| Stealth skip | sneak past packs | `stealth` check in `EnemyAI` (EXISTS) | none |

**M1. Sis Labirenti (choice doorways), the main NEW mechanic.** Three choice walls (m1|m2, m2|m3, m3|m4), each with 4 doorways, all physically open. Each doorway shows a floating **sigil** (`peri_sigil_xxx`) and a mist veil. Exactly one sigil per wall is the **odd one out**: the other three sigils are identical; the odd one differs in one trait. **The odd doorway is safe, the three identical ones are traps.**

* Sigil traits: 3 binary traits, code `[F|L][D|B][H|N]` = shape flower or leaf, fill solid or hollow, ring or no ring. That gives 8 sigils, one GLB each.
* Seeded per run: `rng = RNG(hash(runSeed, 'maze'))` (host). Per wall: base triple `T` (3 random bits), safe doorway `o` in 0..3, flipped bit `k`; sigil[o] = `T xor (1 << k)`, the other three = `T`. **Key level at most +4: the odd sigil differs in all 3 traits** (obvious, tutorial feel, like WoW's always-right first room). Above +4: exactly 1 trait.
* Data (NEW optional type appended to `types/dungeons.ts`):

```ts
interface MazeDef {
  walls: { id: string; doorways: { tile: [number, number]; side: 'n' | 's' | 'e' | 'w'; width: number }[] }[]; // the 3 x 4 DoorDefs
  resetTo: { pos: [number, number]; facing: number };     // m1 south end: pos (19.5, 19.5), facing 180
  cooldownSec: number;                                     // 5
}
// extras.maze = { walls: [ {id:'w1', doorways: 4 x (23, 10|13|16|19, 'e', 2)}, {id:'w2', ... 31}, {id:'w3', ... 39} ], resetTo: ..., cooldownSec: 5 }
```

* Runtime `systems/SigilPuzzle.ts` (NEW, host authority, clients mirror): builds the plan, broadcasts it on the existing `gate` style channel (`maze` message: per wall 4 codes and the safe index, sent once at run start and on late join), **spawns the 12 sigil objects** through `spawnStaticObject` at the doorway anchors (y 3.0, above the doorway centre), and every 0.1 s checks the doorway trigger strips (the 2 x 1 tile footprint centred on each door gap). When an alive player enters a **trap** strip: broadcast `maze_trap` (mist burst VFX `smoke_zone` at the strip), 0.6 s later every alive player within 30 m of the triggerer is teleported to `resetTo` (each peer applies it to its own local player via `controller.teleport`), toast "Sis seni geri çekti! Farklı olan nişanı seç.", then the maze trap is on cooldown for 5 s. Enemies are untouched, killed packs stay dead.
* Boss 2 reuses the same sigil codes for the clones, see section 5.

**M2. Kök Kapısı (`ChannelGate` interactable).** `entities/interactables/ChannelGate.ts` (NEW, general: a barricade that opens after a held channel). Props: `peri_root_gate` with `id: 'root_gate_a' | 'root_gate_b'`, `tag: 'channelgate'` (NEW PropTag member, append-only) and `collide: true` so its nav cells are closed. Placement: gate A at (15.5, 22.5) rot 90 (faces the hall, 4.8 m side), gate B at (58.5, 31.5) rot 180 (faces the cave); scale 1.33 to fill the 8 m gap. Hold **F for 3 s** within 3.5 m; any damage taken cancels it. On completion (host validates distance): play the `Open` clip, `BuiltProp.hide()` re-opens the cells, `portal_swirl` and dust, toast "Kökler geri çekildi." and **make noise**: `EnemyDirector.alertNear(x, z, 16)` (NEW tiny method) aggroes idle packs inside 16 m (this is the risk of the skip). Gate A opens the grove, gate B the tunnel. Permanent for the run.

**M5. Şelale Atlayışı (the optional waterfall hop, now real height).** The ledge's south strip `hop_edge` (3.1b) is a `rim: 'ledge'` area: a player can step off it, fall 5.2 m onto the plunge pool, take `min(0.24, (5.2 - 4) x 0.03) = 3.6 %` max HP (non-lethal) and skip the 20 m of the Şelale Merdiveni (about 8 s). The first player to step onto the strip also triggers a 0.4 s camera dip and a splash (`portal_swirl`, scale 0.8) for everyone. No teleport, no lift.

---

## 4. TRASH

Numbers are multipliers on the level-60 baseline (`monsterHP(60) = 2246`, `monsterDmg(60) = 284`, GDD_CONTENT 0.3), exactly like the existing roster. Final HP in a key is `2246 x hp x mplusHp(L) x Fortified (x1.2) x party scaling`, see section 6. Damage types: `poison` is Nature (the Ardenweald nature damage). `kick` = interrupt priority (2 high, 1 medium), `dispel` = a dispellable debuff the party should answer (hint `params.dispel: 1`, shown on the nameplate once the must-answer flags of the roadmap land, see S4 in section 8). Casts are shown with the cast bar; "frontal" means a telegraphed cone or line the tank turns away from the group.

**Rules this roster obeys (CORE_MECHANICS 16, `docs/GDD_CREATURES.md`).** 14 trash types plus one mini-boss, each with 2 to 4 telegraphed attacks. **Windup rule:** first telegraph of every melee-like move = `W(coef) = clamp(0.45 + 0.25 x coef, 0.45, 1.20)` s (coef 1.0 gives 0.70, 1.4 gives 0.80, 2.0 gives 0.95, 2.4 gives 1.05, 3 and above 1.20); the 2nd and 3rd strike of a string use `FW(coef) = clamp(0.30 + 0.12 x coef, 0.30, 0.55)`; swarm role may use a flat 0.45; non-melee floors are projectile 0.60, ground circle 0.90, cast at least 1.0. A deliberately longer windup is allowed (a dodge tell) and is written in the table. Elites and the mini-boss carry a **posture (poise) bar** (`poise.ts` defaults: swarm 6, trash 24, elite 100, mini-boss 300, times `1 + 0.5 (party - 1)` for elites and up); breaking it opens the 2 s stagger window (x1.25 damage, `marked_crit`, windup cancelled) and each elite's `onBreak` costs it something specific, so a break is a real answer next to the kick.

### 4.0 Role mix and set pieces

| role | types | what the group must do |
|---|---|---|
| **kick caster** | Ruh Biçici (`ps_harvester`), Sis Şekillendirici (`ps_shaper`), Dikenfak Oburu (`ps_gorger`) | kick the heal channel, the absorb-and-root, the knockback glob |
| **healer** | Sis Bakıcısı (`ps_tender`), Dikenfak Geyikboynuz (support, `ps_staghorn`), Sis Ana (mini-boss) | kill or kick first; lock down both Staghorn defensives |
| **brute** | Dal Kıran, Peri Köylüsü, Gece Çiçeği (all elites with a posture bar), Ruh Yarıcı | kite, turn the frontals, break the posture, dispel |
| **shielder** | Sis Muhafızı (`ps_guardian`: round shield, frontal block 100 degrees x0.6 until broken or hit from behind) | flank it or break it |
| **swarm** | Boynuz Pençesi, Sis Sokucu, Dikenfak Larvası | AoE last, dispel the curse, horde rule |
| **skirmisher and ambusher** | Sis Avcısı (blink), Dikenfak Yağmacı (flying dive) | kick or stun the blink, burst the diver |

**Dungeon-specific set-piece mechanics (the two the trash is built around).** (1) **Sis Labirenti** (M1, 3.7): the choice-wall maze; disorient and knockback from trash can push players into trap strips, so the Villager and the Gorger are the maze's real danger. (2) **Kök Kapıları** (M2, 3.7): the root gates that open a skip at the price of noise; plus two smaller set pieces that live in the trash itself: **Dostlaşma** (the befriended Villager, 4.5) and the **egg packs** (dormant larvae that wake at 6 m).

### 4.1 Roster (14 trash types, 1 mini-boss, 6 mechanic adds)

Merge note: the first draft had a Mistveil Defender and no Guardian. The 14-type cap and the critic's request for a circular dodge check were solved by merging them: `ps_guardian` keeps the Defender's spear and grief passive and gains the Guardian's Tepme Çılgınlığı. `ps_shaper` is new. Pack forces are unchanged (a Guardian is 4 forces like the old Defender, a Shaper is 5 like the Tender it replaces in three packs).

| id | Ad (TR) | WoW model | rank / role | model (EXISTS) | hp x | dmg x | forces | poise | on break (`onBreak`) |
|---|---|---|---|---|---|---|---|---|---|
| `ps_spiteclaw` | Boynuz Pençesi | Drust Spiteclaw | trash / swarm | `CHAR('Rogue_Hooded')` scale 0.95 tint `0x6a4a5a` + mask | 0.45 | 0.8 | 2 | 6 | breaks at once |
| `ps_soulcleaver` | Ruh Yarıcı | Drust Soulcleaver | trash / brute | `CHAR('Barbarian')` scale 1.0 tint `0x5a4452` + mask | 1.4 | 1.2 | 5 | 24 | stun 2 s |
| `ps_harvester` | Ruh Biçici | Drust Harvester | trash / kick caster | `CHAR('Mage')` scale 1.0 tint `0x4a3a5a` + mask, kite 10 to 16 | 1.0 | 1.2 | 5 | 24 | cast cancelled |
| `ps_boughbreaker` | Dal Kıran | Drust Boughbreaker | **elite** / brute | `MON('Giant')` scale 1.1 tint `0x6a5a40` | 4.2 | 1.6 | 10 | 130 | Dikenli Patlama locked 6 s |
| `ps_villager` | Peri Köylüsü | Tirnenn Villager | **elite** / brute | `CHAR('Barbarian')` scale 1.15 tint `0x6a8a58` | 5.5 | 1.1 | 8 | 120 | Polen and Dev Çakma locked 5 s |
| `ps_guardian` | Sis Muhafızı | Mistveil Defender + Guardian | trash / shielder | `CHAR('Knight')` scale 1.0 tint `0x6a9a78` (1H sword + round shield only) | 1.3 | 1.1 | 4 | 24 | frontal block dropped for good |
| `ps_tender` | Sis Bakıcısı | Mistveil Tender | trash / healer | `CHAR('Mage')` scale 1.0 tint `0x6ab890` + `peri_fae_wings`, kite 10 to 16 | 1.1 | 0.9 | 5 | 24 | cast cancelled |
| `ps_shaper` | Sis Şekillendirici | Mistveil Shaper | trash / kick caster | `CHAR('Mage')` scale 1.0 tint `0x88c8a0` + `peri_fae_wings`, wand, kite 9 to 14 | 1.0 | 1.0 | 5 | 24 | cast cancelled, absorb removed |
| `ps_stinger` | Sis Sokucu | Mistveil Stinger | trash / swarm (flying) | `itch/creatures/wasp` scale 0.62 tint `0x80e0c8`, hover 1.3 | 0.5 | 0.9 | 3 | 6 | breaks at once |
| `ps_stalker` | Sis Avcısı | Mistveil Stalker | trash / ambusher | `itch/creatures/wolf` scale 0.85 tint `0x80c8d8`, opacity 0.85 | 1.0 | 1.3 | 4 | 24 | blink locked 6 s |
| `ps_nightblossom` | Gece Çiçeği | Mistveil Nightblossom | **elite** / brute (single) | `gen/creatures/mushroom_brute` scale 1.15 tint `0xa070d0` | 5.5 | 1.5 | 9 | 130 | Üçlü Isırık and Kök Kavrama locked 5 s |
| `ps_gorger` | Dikenfak Oburu | Spinemaw Gorger + Acidgullet | trash / kick caster | `itch/creatures/centipede` scale 0.95 tint `0x9ab040`, kite 8 to 14 | 1.1 | 1.3 | 5 | 24 | cast cancelled |
| `ps_staghorn` | Dikenfak Geyikboynuz | Spinemaw Staghorn | **elite** / shielder + support | `itch/creatures/rhino` scale 0.95 tint `0x8a7a50` | 4.4 | 1.5 | 8 | 120 | **both defensives locked 6 s** |
| `ps_reaver` | Dikenfak Yağmacı | Spinemaw Reaver | trash / skirmisher (flying) | `itch/creatures/wasp` scale 0.8 tint `0x70a830`, hover 2.0, aggro 14 | 0.9 | 1.2 | 4 | 24 | dive locked 5 s |
| `ps_matriarch` | Sis Ana | Mistveil Matriarch (mini-boss) | **miniboss** / healer | `CHAR('Mage')` scale 1.55 tint `0x70c8a8` + `peri_fae_wings` | 9.0 | 1.5 | 14 | 300 | Işık Havuzları locked 8 s (and the channel is cancelled), window x1.25 |

Mini-boss pack `ps_p12` (Sis Ana + 2 Sis Muhafızı): the pack is the "kill the healer first" test of the maze.

**Attacks (every row is telegraphed; `W`/`FW` from the windup rule above).**

| enemy | attack (id) | shape | coef | windup / cast | cd (s) | counter |
|---|---|---|---|---|---|---|
| Boynuz Pençesi | **Kanlı Pençe** basic (`ps_spiteclaw_claw`) | cone 1.8 m, bleed stack | 1.0 | 0.45 (swarm flat) | 1.4 | dodge |
| | **Atılış** (`ps_spiteclaw_leap`) | line 8 m | 1.2 | 0.70 | 10 | sidestep |
| | **Kin Laneti** on death (`ps_spiteclaw_curse`) | ring r 5, ground marker 0.6 s, then `kin_laneti` | 0 | 0.6 marker | - | step out, dispel |
| Ruh Yarıcı | **Yarma** basic | cone 2.6 m | 1.0 | 0.70 | 2.0 | parry |
| | **Ruh Yarığı** (`ps_soulcleaver_split`) | frontal cone 3.6 m, `ruh_yarigi` DoT | 1.4 shadow | 0.90 (rule 0.80) | 11 | tank turns it, dispel |
| | **Çifte Biçme** (`ps_soulcleaver_twin`, string of 2) | cone 2.6 m then cone 3.0 m, last hit knockback 3 | 1.0 then 1.4 | 0.70 then 0.47 | 9 | dodge through, parry the first |
| Ruh Biçici | **Ruh Oku** basic | projectile | 1.0 | 0.60 | 2.4 | dodge |
| | **Öz Biçme** (`ps_harvester_harvest`) | channel, heals self and Drust allies 4 % per 0.5 s | - | **3.0 s, kick 2** | 13 | kick, or break posture |
| | **Ruh Dikeni** (`ps_harvester_thorn`) | ground circle r 1.8 on the target | 1.3 shadow | 0.90 | 9 | move |
| Dal Kıran (elite) | **Dal Darbesi** basic | cone 3.4 m | 1.0 | 0.70 | 2.6 | parry |
| | **Dikenli Patlama** (`ps_boughbreaker_burst`) | self burst r 5.5, slow 40 % 4 s | 1.3 poison | 1.2 | 14 | run out, dispel the slow |
| | **Dal Savurma** (`ps_boughbreaker_sweep`, string of 3, **delayed**) | cone 3.6 m, cone 3.6 m, cone 4.2 m finisher knockback 4 | 1.2, 1.2, 2.0 | 0.75 + hold 0.20 to 0.50, then 0.44, then 0.54 | 12 | wait for the swing, dodge the finisher, parry the first |
| | **Çılgın Dövünme** passive | below 50 % HP +40 % attack speed | - | - | - | burst or break |
| Peri Köylüsü (elite) | **Odun Darbesi** basic | cone 2.8 m | 1.0 | 0.70 | 2.4 | parry |
| | **Şaşırtan Polen** (`ps_villager_pollen`) | frontal cone 6 m 60 degrees, `disorient` 4 s | 0.6 poison | 1.2 (a tell, not a floor) | 13 | tank turns him away from the doorways |
| | **Aşırı Büyüme** (`ps_villager_overgrowth`) | ground circle r 2.2 on a random player, stun 2 s | 0.8 poison | 1.5 | 16 | move |
| | **Dev Çakma** (`ps_villager_slam`, **delayed overhead**) | cone 3.4 m 70 degrees, knockback 3 | 2.2 | 1.0 + hold 0.25 to 0.55 | 15 | wait, then roll; parry |
| | **Dostlaşma** passive | at 20 % HP he is befriended and leaves, still counting forces | - | - | - | see 4.5 |
| Sis Muhafızı | **Mızrak** basic | cone 3.0 m | 1.0 | 0.70 | 2.0 | parry |
| | **Mızrak Yağmuru** (`ps_guardian_flurry`) | frontal cone 4.5 m 70 degrees | 1.5 | 1.0 (rule 0.83) | 11 | tank turns it |
| | **Tepme Çılgınlığı** (`ps_guardian_buck`, Bucking Rampage) | self circle r 4, no safe spot inside | 1.6 | **1.4 (dodge check)** | 12 | step out, roll through the edge |
| | **Yas Öfkesi** passive | +12 % damage per ally death within 10 m, 5 stacks, 10 s | - | - | - | kill them together |
| Sis Bakıcısı | **Dikenli Sarmaşık** basic | projectile | 1.0 poison | 0.60 | 2.4 | dodge |
| | **Ormanı Besle** (`ps_tender_nourish`) | heals every Sis ally in 14 m for 28 % | - | **2.2 s, kick 2** | 15 | kick |
| | **Çiçeklenme** (`ps_tender_bloom`) | regen buff on allies 8 s | - | 1.5 | 22 | dispel / kill |
| Sis Şekillendirici | **Dal Oku** basic | projectile | 1.0 poison | 0.60 | 2.4 | dodge |
| | **Çalı Zırhı** (`ps_shaper_coat`, Bramblethorn Coat) | 20 % absorb on self and Sis allies within 6 m **and** a 2 s root on the nearest player | - | **1.6 s, kick 2** | 14 | kick, break the absorb |
| | **Diken Yağmuru** (`ps_shaper_thorns`) | 3 ground circles r 1.6 on random players, 0.3 s apart | 0.9 poison | 1.0 first marker | 10 | keep moving |
| Sis Sokucu | **Sokma** basic | cone 1.8 m | 1.0 | 0.45 (swarm flat) | 1.4 | dodge |
| | **Anima Enjeksiyonu** (`ps_stinger_inject`) | bolt on a random non-tank, `anima_enjeksiyon` 6 s | 0.6 | 0.80 | 10 | dispel, or run from the group (4.7) |
| Sis Avcısı | **Isırık** basic | cone 2.0 m | 1.0 | 0.70 | 1.5 | parry |
| | **Sisten Atılış** (`ps_stalker_pounce`) | blink to a random player, bleed x2 | 2.2 | 1.0 (rule 1.0), **kick 1** | 15 | stun / kick, full cooldown follows |
| | **Çifte Pençe** (`ps_stalker_twin`, string of 2) | cone 2.0 m then cone 2.2 m | 1.0 then 1.2 | 0.70 then 0.44 | 8 | dodge through |
| Gece Çiçeği (elite) | **Çiçek Darbesi** basic | cone 2.8 m | 1.0 | 0.70 | 2.2 | parry |
| | **Üçlü Isırık** (`ps_nightblossom_bite`, string of 3) | cone 3.2 m x3, poison stack each, finisher knockback 3 | 0.9, 1.0, 1.4 | 0.68, 0.42, 0.47 | 9 | dodge, dispel |
| | **Zehirli Polen** (`ps_nightblossom_pollen`) | self burst r 4.5, slow 30 % 3 s | 0.8 poison | 0.90 | 14 | step out |
| | **Kök Kavrama** (`ps_nightblossom_grasp`, grab) | perilous catch cone 3.0 m 70 degrees, root 1.1 s, then slam r 2.2 | 2.2 | **1.0 (perilous)** | 22 | dodge the catch (no parry), burst or break to release |
| Dikenfak Oburu | **Asit Tükürüğü** basic | projectile | 1.0 poison | 0.60 | 2.4 | dodge |
| | **Asit Damlası** (`ps_gorger_globule`) | ground circle r 2.2 on a random player, **knockback 6 m** | 1.6 poison | **1.3 s cast, kick 2** | 12 | kick; do not stand between a Gorger and a void |
| | **Uçucu Asit** (`ps_gorger_volatile`) | ground circle r 1.8, lingers 6 s | 1.1 poison | 1.6 (rule 0.90) | 8 | move |
| Dikenfak Geyikboynuz (elite) | **Boynuz** basic | cone 3.0 m | 1.0 | 0.70 | 2.4 | parry |
| | **Direnç Uyarımı** (`ps_staghorn_resist`) | 25 % absorb on one ally | - | **1.8 s, kick 2** | 16 | kick |
| | **Yenileme Uyarımı** (`ps_staghorn_regen`) | heals allies in 12 m for 20 % | - | **2.0 s, kick 2** | 18 | kick |
| | **Boynuz Hücumu** (`ps_staghorn_rush`) | line 9 m x 2 m charge, wall hit = poise break 1.6 s | 2.0 | 0.95 | 16 | sidestep; lure it into a wall or a rib |
| Dikenfak Yağmacı | **Sokma** basic | cone 1.8 m | 1.0 | 0.70 | 1.4 | parry |
| | **Delici Hücum** (`ps_reaver_assault`) | 9 m dive, stacking poison (5, 10 s) | 1.5 | 0.83 | 9 | sidestep; dispel or defensive |
| Sis Ana (mini-boss) | **Sis Pençesi** basic | cone 3.0 m | 1.0 | 0.70 | 2.2 | parry |
| | **Işık Havuzları** (`ps_matriarch_radiance`) | channel, heals her and Sis allies in 10 m 6 % per 0.5 s | - | **3.0 s, kick 2** | 16 | kick or break posture |
| | **Zırh Parçalama** (`ps_matriarch_shred`) | cone 4 m on a random non-tank, `sunder` 8 s | 1.6 | 0.90 | 9 | dodge |
| | **Üçlü Pençe** (`ps_matriarch_triple`, string of 3, delayed) | cone 3.4 m x3, finisher knockback 4 | 1.2, 1.2, 2.0 | 0.75 + hold 0.20 to 0.45, then 0.44, then 0.54 | 11 | tank cooldown, parry the first |

### 4.2 Mechanic adds and summoned units (0 forces unless said)

| id | Ad (TR) | Used by | Model | hp x | Notes |
|---|---|---|---|---|---|
| `ps_larva` | Dikenfak Larvası | nest egg packs (1 force each), Tred'ova (summoned, 0 forces) | `itch/creatures/centipede` scale 0.32 tint `0xdce890`, `spawn: 'Emerge'` | 0.3 | swarm, basic cone 1.2 m (0.45 flat), **on death Çürüme Birikintisi** (r 2.6, 14 s, coef 0.3 per 1.0 s). Boss version: `ai.fixate` (NEW) |
| `ps_vulpin` | Sis Tilkisi | Sis Çağıran, Freeze Tag | `itch/creatures/wolf` scale 0.55 tint `0xd8f0ff` opacity 0.8 | 6 (x partyHp) | `ai: { summoned: true, fixate: true }`, speed 5.6, basic = **Donduran Patlama**: on contact a r 8 frost burst, coef 1.2 + `freeze` 6 s, then it despawns (`params.suicide`). Killable, slow or root works |
| `ps_droman` | Droman Ulfaran | Ingra Malok | `CHAR('Barbarian')` scale 1.6 tint `0x7a6a4a` + mask + wicker shield | 28 (x partyHp, set by the script) | **guardian-class elite with a posture bar (poise 220)**, kit in section 5.1 |
| `ps_mist_clone_FDH` ... `_LBN` (8 defs from a loop) | Sis İllüzyonu | Sis Çağıran, Guessing Game | same body as the boss (`CHAR('Mage')` scale 1.3 tint `0x80e8d8`), `visual.attach` = the matching `peri_sigil_xxx` above the head (bone `head`, `pos [0, 0.9, 0]`) | 0.05 | killed by one hit, `ccImmune`, `ai.summoned` |
| `ps_parasite_p`, `_i`, `_d` | Asalak (Boyun Eğdiren, Sersemleten, Hükmeden) | Tred'ova (M+, key 7 and up) | `itch/creatures/centipede` scale 0.2, tints `0xffd060` / `0xff7040` / `0xc060ff` | 0.4 | 2.4 s interruptible cast **kick 2** on its host, see section 5 |
| `ps_kibir` (Kibir Tecessümü) | Kibir Tecessümü | Kibirli seasonal affix (CM7), spawned by the affix, not by a pack | the `ps_boughbreaker` body at scale 1.2, tint `0xffd060` | 4 x trash HP | created by the affix code, listed so the content check knows the id |

### 4.3 Reference defs (for `src/data/enemies/peri_sisleri.ts` after S1)

Imports after S1: builders and sets from `src/data/enemyKit.ts` (`add, cone, proj, aoe, charge, heal, buff, passive, onDeath, summonAb, line, custom, poison, bleed, A_KAYKIT, A_ENEMY, A_WOLF, A_WASP, A_GEN, R_CULT, R_BEAST, KNIGHT_HIDE, ROGUE_HIDE, mageHide, CHAR, MON, ITCH, GEN`) and the creature move kit after S15 (`src/data/creatures/moves.ts`: `W, FW, strike, string, delayed, jumpSlam, rush, grab, marks, enrageOf, breakOf`, see `docs/GDD_CREATURES.md` appendix A). `PSP = (n) => '/assets/models/gen/props/peri_' + n + '.glb'`. Ability argument order, as in the existing roster: `cone(id, name, range, arc, cd, coef, anim, impact, opts)`, `aoe(id, name, kind, radius, range, cd, windup, coef, type, anim, impact, opts)`, `charge(id, name, length, cd, windup, coef, anim, impact, opts)`.

```ts
const MASK: EnemyAttach = { url: PSP('drust_mask'), bone: 'head', pos: [0, 0.02, 0.05], scale: 1 };
const WINGS: EnemyAttach = { url: PSP('fae_wings'), bone: 'chest', pos: [0, 0, -0.12], scale: 1 };
const dispelHint = { dispel: 1 };

add({ id: 'ps_spiteclaw', name: 'Boynuz Pençesi', model: CHAR('Rogue_Hooded'), scale: 0.95, tint: 0x6a4a5a, role: 'swarm', rank: 'trash', hp: 0.45, dmg: 0.8, speed: 6.9, radius: 0.45, aggro: 9, forces: 2, poise: 6,
  anims: A_KAYKIT, resist: R_CULT, visual: { hide: ROGUE_HIDE.filter((n) => n !== 'Knife'), attach: [MASK], eyeEmissive: 0xc060ff, runRef: 7 },
  basic: cone('ps_spiteclaw_claw', 'Kanlı Pençe', 1.8, 100, 1.4, 1.0, '1H_Melee_Attack_Slice_Diagonal', 0.38, { windup: 0.45, statuses: [bleed(1, 0.2, 6)] }),
  abilities: [
    charge('ps_spiteclaw_leap', 'Atılış', 8, 10, 0.7, 1.2, '1H_Melee_Attack_Stab', 0.45),
    onDeath(aoe('ps_spiteclaw_curse', 'Kin Laneti', 'self_aoe', 5, 0, 0, 0.6, 0, 'shadow', '', 0, { telegraph: true, vfx: 'curse_loop', statuses: [{ status: 'kin_laneti', duration: 10, stacks: 1 }], params: dispelHint })),   // 0.6 s ground ring, then the curse
  ] });

add({ id: 'ps_soulcleaver', name: 'Ruh Yarıcı', model: CHAR('Barbarian'), scale: 1.0, tint: 0x5a4452, role: 'melee', rank: 'trash', hp: 1.4, dmg: 1.2, speed: 5.8, radius: 0.6, aggro: 10, forces: 5,
  anims: A_KAYKIT, resist: R_CULT, visual: { attach: [MASK], eyeEmissive: 0xc060ff, runRef: 6.5 },
  basic: cone('ps_soulcleaver_cleave', 'Yarma', 2.6, 100, 2.0, 1.0, '2H_Melee_Attack_Slice', 0.5, { windup: 0.7 }),
  abilities: [
    cone('ps_soulcleaver_split', 'Ruh Yarığı', 3.6, 70, 11, 1.4, '2H_Melee_Attack_Chop', 0.55,
      { windup: 0.9, telegraph: true, damage: { coef: 1.4, type: 'shadow' }, statuses: [{ status: 'ruh_yarigi', duration: 6, stacks: 1, magnitude: 0.3 }], params: dispelHint } as Ab),
    string('ps_soulcleaver_twin', 'Çifte Biçme', 9, [
      { coef: 1.0, range: 2.6, arc: 100, anim: '2H_Melee_Attack_Slice', impact: 0.5 },
      { coef: 1.4, range: 3.0, arc: 100, anim: '2H_Melee_Attack_Chop', impact: 0.5, knockback: 3 } ]),
  ] });

add({ id: 'ps_harvester', name: 'Ruh Biçici', model: CHAR('Mage'), scale: 1.0, tint: 0x4a3a5a, role: 'caster', rank: 'trash', hp: 1.0, dmg: 1.2, speed: 4.9, radius: 0.55, aggro: 12, forces: 5,
  anims: A_KAYKIT, resist: R_CULT, ai: { kite: [10, 16] }, visual: { hide: mageHide('2H_Staff'), attach: [MASK], glow: 0xb060ff, runRef: 7 },
  basic: proj('ps_harvester_bolt', 'Ruh Oku', 16, 18, 2.4, 0.6, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'shadow_cast' }),
  abilities: [
    { id: 'ps_harvester_harvest', name: 'Öz Biçme', kind: 'custom', range: 14, cooldown: 13, initialCooldown: 4, windup: 3.0, castTime: 3.0, interruptible: true, kick: 2,
      anim: 'Spellcasting', vfx: 'shadow_burst', sfx: 'shadow_cast', params: { loop: 1, tick: 0.5, healPct: 0.04, radius: 8, impact: 0.3 } },
    aoe('ps_harvester_thorn', 'Ruh Dikeni', 'ground_aoe', 1.8, 16, 9, 0.9, 1.3, 'shadow', 'Spellcast_Shoot', 0.3, { vfx: 'shadow_burst', params: { target: 1, impact: 0.3 } }),
  ] });

add({ id: 'ps_boughbreaker', name: 'Dal Kıran', model: MON('Giant'), scale: 1.1, tint: 0x6a5a40, role: 'tank', rank: 'elite', hp: 4.2, dmg: 1.6, speed: 4.4, radius: 1.1, aggro: 10, forces: 10, poise: 130,
  anims: A_ENEMY, resist: { physical: 0.1, fire: -0.25, poison: 0.25 }, visual: { runRef: 4.4 },
  onBreak: breakOf({ disable: ['ps_boughbreaker_burst'], disableSec: 6 }),
  basic: cone('ps_boughbreaker_smash', 'Dal Darbesi', 3.4, 120, 2.6, 1.0, 'Attack', 0.47, { windup: 0.7 }),
  abilities: [
    aoe('ps_boughbreaker_burst', 'Dikenli Patlama', 'self_aoe', 5.5, 5.5, 14, 1.2, 1.3, 'poison', 'Attack', 0.47, { vfx: 'poison_burst', statuses: [{ status: 'slow', duration: 4, magnitude: 0.4 }], params: dispelHint }),
    delayed(string('ps_boughbreaker_sweep', 'Dal Savurma', 12, [
      { coef: 1.2, range: 3.6, arc: 120, anim: 'Attack', impact: 0.47 },
      { coef: 1.2, range: 3.6, arc: 120, anim: 'Attack', impact: 0.47 },
      { coef: 2.0, range: 4.2, arc: 100, anim: 'Attack', impact: 0.47, knockback: 4 } ]), [0.2, 0.5]),     // hold on strike 0 only
    passive('ps_boughbreaker_thrash', 'Çılgın Dövünme', { hpBelow: 0.5, atkSpeed: 0.4 }),     // alias of forge_demon_rage in ai/abilities.ts PASSIVES
  ] });

add({ id: 'ps_villager', name: 'Peri Köylüsü', model: CHAR('Barbarian'), scale: 1.15, tint: 0x6a8a58, role: 'tank', rank: 'elite', hp: 5.5, dmg: 1.1, speed: 5.0, radius: 0.75, aggro: 9, forces: 8, poise: 120,
  anims: A_KAYKIT, resist: R_BEAST, visual: { runRef: 6 },
  onBreak: breakOf({ disable: ['ps_villager_pollen', 'ps_villager_slam'], disableSec: 5 }),
  basic: cone('ps_villager_club', 'Odun Darbesi', 2.8, 110, 2.4, 1.0, '2H_Melee_Attack_Chop', 0.5, { windup: 0.7 }),
  abilities: [
    cone('ps_villager_pollen', 'Şaşırtan Polen', 6, 60, 13, 0.6, 'Spellcast_Raise', 0.5, { windup: 1.2, telegraph: true, parryable: false, damage: { coef: 0.6, type: 'poison' }, vfx: 'poison_cloud', statuses: [{ status: 'disorient', duration: 4 }] } as Ab),
    aoe('ps_villager_overgrowth', 'Aşırı Büyüme', 'ground_aoe', 2.2, 14, 16, 1.5, 0.8, 'poison', 'Spellcast_Raise', 0.5, { vfx: 'poison_burst', statuses: [{ status: 'stun', duration: 2 }], params: { target: 1, impact: 0.5 } }),
    delayed(strike('ps_villager_slam', 'Dev Çakma', 3.4, 70, 15, 2.2, '2H_Melee_Attack_Chop', 0.5, { knockback: 3 }), [0.25, 0.55]),
    passive('ps_villager_befriend', 'Dostlaşma', { hpBelow: 0.2 }),                          // NEW passive, see 4.5
  ] });

add({ id: 'ps_guardian', name: 'Sis Muhafızı', model: CHAR('Knight'), scale: 1.0, tint: 0x6a9a78, role: 'melee', rank: 'trash', hp: 1.3, dmg: 1.1, speed: 5.8, radius: 0.6, aggro: 10, forces: 4,
  anims: A_KAYKIT, resist: R_BEAST, ai: { role2: 'shielder', frontBlock: { arc: 100, mult: 0.6 } },
  visual: { hide: KNIGHT_HIDE.filter((n) => n !== '1H_Sword' && n !== 'Round_Shield'), eyeEmissive: 0x80ffe0, runRef: 7 },
  onBreak: breakOf({ dropFrontBlock: true }),
  basic: cone('ps_guardian_thrust', 'Mızrak', 3.0, 80, 2.0, 1.0, '1H_Melee_Attack_Stab', 0.4, { windup: 0.7 }),
  abilities: [
    cone('ps_guardian_flurry', 'Mızrak Yağmuru', 4.5, 70, 11, 1.5, '1H_Melee_Attack_Stab', 0.4, { windup: 1.0, telegraph: true }),
    aoe('ps_guardian_buck', 'Tepme Çılgınlığı', 'self_aoe', 4, 4, 12, 1.4, 1.6, 'physical', '2H_Melee_Attack_Spin', 0.6, { vfx: 'ground_slam', telegraph: true }),   // r 4 circle, 1.4 s windup, dodge
    passive('ps_guardian_grief', 'Yas Öfkesi', { radius: 10, perStack: 0.12, maxStacks: 5, duration: 10 }),   // alias of cult_acolyte_fanatic
  ] });

add({ id: 'ps_tender', name: 'Sis Bakıcısı', model: CHAR('Mage'), scale: 1.0, tint: 0x6ab890, role: 'healer', rank: 'trash', hp: 1.1, dmg: 0.9, speed: 4.9, radius: 0.55, aggro: 12, forces: 5,
  anims: A_KAYKIT, resist: R_BEAST, ai: { kite: [10, 16] }, visual: { hide: mageHide('1H_Wand'), attach: [WINGS], glow: 0x80ffe0, runRef: 7 },
  basic: proj('ps_tender_thorn', 'Dikenli Sarmaşık', 16, 18, 2.4, 0.6, 1.0, 'poison', 'poison_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    heal('ps_tender_nourish', 'Ormanı Besle', 2.2, 15, 0.28, 'Spellcast_Raise', 1.0, { kick: 2, initialCooldown: 5, params: { radius: 14, all: 1 } } as Ab),   // `all: 1` = heal every ally (NEW trivial param)
    buff('ps_tender_bloom', 'Çiçeklenme', 1.5, 22, [{ status: 'regen', duration: 8, magnitude: 0.02 }], 'Spellcast_Raise', 1.0, { params: { radius: 12 } }),
  ] });

add({ id: 'ps_shaper', name: 'Sis Şekillendirici', model: CHAR('Mage'), scale: 1.0, tint: 0x88c8a0, role: 'caster', rank: 'trash', hp: 1.0, dmg: 1.0, speed: 4.9, radius: 0.55, aggro: 12, forces: 5,
  anims: A_KAYKIT, resist: R_BEAST, ai: { kite: [9, 14] }, visual: { hide: mageHide('1H_Wand'), attach: [WINGS], glow: 0x80ffc0, runRef: 7 },
  basic: proj('ps_shaper_bolt', 'Dal Oku', 16, 18, 2.4, 0.6, 1.0, 'poison', 'poison_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    { id: 'ps_shaper_coat', name: 'Çalı Zırhı', kind: 'custom', range: 14, cooldown: 14, initialCooldown: 4, windup: 1.6, castTime: 1.6, interruptible: true, kick: 2,
      anim: 'Spellcast_Raise', vfx: 'buff_aura', sfx: 'spell_cast', params: { absorbPct: 0.2, radius: 6, rootNearest: 2, impact: 1.0 } },       // CUSTOM.ps_shaper_coat (S8)
    marks('ps_shaper_thorns', 'Diken Yağmuru', { pattern: 'rain', count: 3, radius: 1.6, spacing: 0.3, first: 1.0, aim: 'around', coef: 0.9, type: 'poison' }, 10, 'Spellcast_Raise', 0.4),
  ] });

add({ id: 'ps_stinger', name: 'Sis Sokucu', model: ITCH('wasp'), scale: 0.62, tint: 0x80e0c8, role: 'swarm', rank: 'trash', hp: 0.5, dmg: 0.9, speed: 6.4, radius: 0.4, aggro: 10, forces: 3, poise: 6, flying: true, hover: 1.3,
  anims: A_WASP, resist: R_BEAST,
  basic: cone('ps_stinger_sting', 'Sokma', 1.8, 100, 1.4, 1.0, 'Sting', 0.6, { windup: 0.45 }),
  abilities: [proj('ps_stinger_inject', 'Anima Enjeksiyonu', 16, 14, 10, 0.8, 0.6, 'poison', 'poison_projectile', 'Sting', 0.6, { statuses: [{ status: 'anima_enjeksiyon', duration: 6, stacks: 1 }], params: { target: 3, impact: 0.6, dispel: 1 } })] });

add({ id: 'ps_stalker', name: 'Sis Avcısı', model: ITCH('wolf'), scale: 0.85, tint: 0x80c8d8, role: 'melee', rank: 'trash', hp: 1.0, dmg: 1.3, speed: 7.4, radius: 0.55, aggro: 10, forces: 4,
  anims: A_WOLF, resist: R_BEAST, ai: { role2: 'ambusher' }, visual: { opacity: 0.85, eyeEmissive: 0x80ffe0 },
  onBreak: breakOf({ disable: ['ps_stalker_pounce'], disableSec: 6 }),
  basic: cone('ps_stalker_bite', 'Isırık', 2.0, 90, 1.5, 1.0, 'Bite', 0.47, { windup: 0.7 }),
  abilities: [
    { id: 'ps_stalker_pounce', name: 'Sisten Atılış', kind: 'custom', range: 16, cooldown: 15, initialCooldown: 5, windup: 1.0, castTime: 1.0, interruptible: true, kick: 1,
      damage: { coef: 2.2, type: 'physical' }, statuses: [bleed(2, 0.25, 8)], anim: 'Lunge', vfx: 'blink', params: { target: 1, impact: 0.87 } },   // CUSTOM handler: blink behind a random player (copy of cult_assassin_smoke end())
    string('ps_stalker_twin', 'Çifte Pençe', 8, [
      { coef: 1.0, range: 2.0, arc: 90, anim: 'Bite', impact: 0.47 },
      { coef: 1.2, range: 2.2, arc: 90, anim: 'Bite', impact: 0.47 } ]),
  ] });

add({ id: 'ps_gorger', name: 'Dikenfak Oburu', model: ITCH('centipede'), scale: 0.95, tint: 0x9ab040, role: 'ranged', rank: 'trash', hp: 1.1, dmg: 1.3, speed: 5.6, radius: 0.7, aggro: 11, forces: 5,
  anims: { ...A_WOLF, spawn: 'Emerge' }, resist: R_BEAST, ai: { kite: [8, 14] },
  basic: proj('ps_gorger_spit', 'Asit Tükürüğü', 14, 16, 2.4, 0.6, 1.0, 'poison', 'poison_projectile', 'Bite', 0.55),
  abilities: [
    aoe('ps_gorger_globule', 'Asit Damlası', 'ground_aoe', 2.2, 16, 12, 1.3, 1.6, 'poison', 'Bite', 0.55, { castTime: 1.3, interruptible: true, kick: 2, knockback: 6, vfx: 'poison_burst', params: { target: 1, impact: 0.55 } }),
    aoe('ps_gorger_volatile', 'Uçucu Asit', 'ground_aoe', 1.8, 16, 8, 1.6, 1.1, 'poison', 'Bite', 0.55, { vfx: 'poison_cloud', params: { target: 1, persist: 6, persistCoef: 0.25, tick: 0.5, impact: 0.55 } }),
  ] });

add({ id: 'ps_staghorn', name: 'Dikenfak Geyikboynuz', model: ITCH('rhino'), scale: 0.95, tint: 0x8a7a50, role: 'tank', rank: 'elite', hp: 4.4, dmg: 1.5, speed: 5.4, radius: 1.0, aggro: 10, forces: 8, poise: 120,
  anims: A_WOLF, resist: R_BEAST, ai: { role2: 'shielder' },
  onBreak: breakOf({ disable: ['ps_staghorn_resist', 'ps_staghorn_regen'], disableSec: 6 }),    // a posture break locks BOTH defensives
  basic: cone('ps_staghorn_gore', 'Boynuz', 3.0, 100, 2.4, 1.0, 'Gore', 0.45, { windup: 0.7 }),
  abilities: [
    buff('ps_staghorn_resist', 'Direnç Uyarımı', 1.8, 16, [{ status: 'shield', duration: 10 }], 'Roar', 0.4, { kick: 2, initialCooldown: 6, vfx: 'shield_bubble', params: { shieldPct: 0.25, single: 1, radius: 14, impact: 0.4 } } as Ab),
    heal('ps_staghorn_regen', 'Yenileme Uyarımı', 2.0, 18, 0.2, 'Roar', 0.4, { kick: 2, initialCooldown: 10, params: { radius: 12, all: 1 } } as Ab),
    rush('ps_staghorn_rush', 'Boynuz Hücumu', { length: 9, width: 2, speed: 14, coef: 2.0, track: 0.6, wallStun: 1.6 }, 16, 'Gore', 0.45, { initialCooldown: 8 }),
  ] });

add({ id: 'ps_reaver', name: 'Dikenfak Yağmacı', model: ITCH('wasp'), scale: 0.8, tint: 0x70a830, role: 'melee', rank: 'trash', hp: 0.9, dmg: 1.2, speed: 6.4, radius: 0.5, aggro: 14, forces: 4, flying: true, hover: 2.0,
  anims: A_WASP, resist: R_BEAST,
  onBreak: breakOf({ disable: ['ps_reaver_assault'], disableSec: 5 }),
  basic: cone('ps_reaver_sting', 'Sokma', 1.8, 100, 1.4, 1.0, 'Sting', 0.6, { windup: 0.7 }),
  abilities: [charge('ps_reaver_assault', 'Delici Hücum', 9, 9, 0.83, 1.5, 'Dive', 0.9, { statuses: [poison(1, 0.25, 10)], params: dispelHint } as Ab)] });

add({ id: 'ps_nightblossom', name: 'Gece Çiçeği', model: GEN('mushroom_brute'), scale: 1.15, tint: 0xa070d0, role: 'melee', rank: 'elite', hp: 5.5, dmg: 1.5, speed: 5.0, radius: 0.9, aggro: 10, forces: 9, poise: 130,
  anims: A_GEN, resist: R_BEAST,
  onBreak: breakOf({ disable: ['ps_nightblossom_bite', 'ps_nightblossom_grasp'], disableSec: 5 }),
  basic: cone('ps_nightblossom_hit', 'Çiçek Darbesi', 2.8, 100, 2.2, 1.0, 'Attack', 0.5, { windup: 0.7 }),
  abilities: [
    string('ps_nightblossom_bite', 'Üçlü Isırık', 9, [
      { coef: 0.9, range: 3.2, arc: 100, anim: 'Attack', impact: 0.5, statuses: [poison(1, 0.2, 8)] },
      { coef: 1.0, range: 3.2, arc: 100, anim: 'Attack', impact: 0.5, statuses: [poison(1, 0.2, 8)] },
      { coef: 1.4, range: 3.4, arc: 100, anim: 'Attack', impact: 0.5, knockback: 3, statuses: [poison(1, 0.2, 8)] } ], { params: dispelHint }),
    aoe('ps_nightblossom_pollen', 'Zehirli Polen', 'self_aoe', 4.5, 4.5, 14, 0.9, 0.8, 'poison', 'Cast', 0.6, { vfx: 'poison_cloud', statuses: [{ status: 'slow', duration: 3, magnitude: 0.3 }] }),
    grab('ps_nightblossom_grasp', 'Kök Kavrama', { range: 3.0, arc: 70, hold: 1.1, slam: { coef: 2.2, radius: 2.2, type: 'poison' }, releaseDamageFrac: 0.12 }, 22, 'Attack', 0.5),
  ] });

add({ id: 'ps_matriarch', name: 'Sis Ana', model: CHAR('Mage'), scale: 1.55, tint: 0x70c8a8, role: 'healer', rank: 'miniboss', hp: 9.0, dmg: 1.5, speed: 4.9, radius: 0.9, aggro: 10, forces: 14, poise: 300,
  anims: A_KAYKIT, resist: R_BEAST, visual: { hide: mageHide('2H_Staff'), attach: [WINGS], glow: 0x80ffe0, runRef: 7 },
  onBreak: breakOf({ windowMult: 1.25, disable: ['ps_matriarch_radiance'], disableSec: 8 }),
  basic: cone('ps_matriarch_claw', 'Sis Pençesi', 3.0, 100, 2.2, 1.0, 'Spellcast_Shoot', 0.3, { windup: 0.7 }),
  abilities: [
    { id: 'ps_matriarch_radiance', name: 'Işık Havuzları', kind: 'custom', range: 12, cooldown: 16, initialCooldown: 6, windup: 3.0, castTime: 3.0, interruptible: true, kick: 2,
      anim: 'Spellcasting', vfx: 'heal_loop', sfx: 'spell_cast', params: { loop: 1, tick: 0.5, healPct: 0.06, radius: 10, impact: 0.3 } },
    cone('ps_matriarch_shred', 'Zırh Parçalama', 4.0, 90, 9, 1.6, 'Spellcast_Shoot', 0.3, { windup: 0.9, telegraph: true, statuses: [{ status: 'sunder', duration: 8 }], params: { target: 3 } } as Ab),
    delayed(string('ps_matriarch_triple', 'Üçlü Pençe', 11, [
      { coef: 1.2, range: 3.4, arc: 100, anim: 'Spellcast_Shoot', impact: 0.3 },
      { coef: 1.2, range: 3.4, arc: 100, anim: 'Spellcast_Shoot', impact: 0.3 },
      { coef: 2.0, range: 3.6, arc: 90, anim: 'Spellcast_Shoot', impact: 0.3, knockback: 4 } ]), [0.2, 0.45]),
  ] });
```

Aliases to add in `ai/abilities.ts` (NEW, one line each): `PASSIVES.ps_boughbreaker_thrash = PASSIVES.forge_demon_rage`, `PASSIVES.ps_guardian_grief = PASSIVES.cult_acolyte_fanatic`. New handlers: `CUSTOM.ps_harvester_harvest` and `CUSTOM.ps_matriarch_radiance` (a self and ally heal channel: same shape as `crypt_wraith_drain` but the tick heals allies in `params.radius` instead of damaging a target), `CUSTOM.ps_shaper_coat` (20 % absorb on self and Sis allies within `radius`, `rootNearest` seconds of `root` on the nearest player), `CUSTOM.ps_stalker_pounce` (blink behind a random player, then the hit), `PASSIVES.ps_villager_befriend` (4.5). Everything marked `string`, `delayed`, `rush`, `grab`, `marks`, `breakOf` and `frontBlock` is the GDD_CREATURES move kit (S15), not new code of this dungeon.

### 4.4 NEW statuses (append to `StatusId` and `data/statuses.ts`, Turkish names, icons reuse the existing `debuff-*` svgs)

**Damage-taken debuffs use the existing per-stack mechanism, not `stats`.** `Combat.ts` clamps `damageReductionPct` to `[0, 0.9]` before applying it to players (line 1510), so a negative `damageReductionPct` would do nothing. `STATUS_RULES[id] = { stack: 'stack', takenMore: v }` makes `StatusEffects.takenMore()` multiply damage by `1 + v x stacks`, and `Combat.ts` line 1513 applies it to players; the stack cap is `StatusDef.maxStacks`.

| id | Ad | kind | effect | dispel | notes |
|---|---|---|---|---|---|
| `kin_laneti` | Kin Laneti | debuff | **+6 % damage taken per stack, max 3 stacks (+18 %), 10 s, refreshed by each stack** | yes | `STATUS_RULES.kin_laneti = { stack: 'stack', takenMore: 0.06 }`, `maxStacks: 3`. The cap and the short duration are the no-dispeller answer (4.7): it decays on its own |
| `ruh_yarigi` | Ruh Yarığı | debuff | shadow DoT (`dotType: 'shadow'`, magnitude 0.3 of the caster's base per second), **6 s** (about 1.8 coef in total, healable) | yes | max 1 stack |
| `anima_enjeksiyon` | Anima Enjeksiyonu | debuff | after 6 s bursts: **circle r 3** around the owner, coef 2.0 poison on the owner and on every player within 3 m | yes (cancels the burst) | needs the NEW status `onExpire` hook (S3). Fallback without the hook: plain DoT. No dispeller: the host walks 4 m away from the group and takes the hit alone |
| `karanlik_ortusu` | Karanlık Örtüsü | debuff | shadow DoT every second (coef 0.35 of the boss base), stacking intensity not needed | **no** (the boss script removes it) | Ingra's Death Shroud |
| `disorient` | Şaşkınlık | debuff cc | movement input is rotated by a random angle every 0.4 s for the duration, attacks still work | no | NEW in `PlayerController` input path. Fallback `fear` |
| `asit_yarasi` | Asit Yarası | debuff | **+10 % damage taken per stack, max 5 stacks (+50 %), 8 s, each new stack refreshes the timer** (a stack arrives about every 9 s from the bite and every 18 s from the maul, so normal play sits at 0 to 2 stacks and peaks at 3) | yes | `STATUS_RULES.asit_yarasi = { stack: 'stack', takenMore: 0.10 }`, `maxStacks: 5`. Tred'ova's tank debuff, a swap is optional (5.3) |
| `zihin_bagi` | Zihin Bağı | debuff | marker for the Mind Link tether, no effect of its own | no | `vfx: 'curse_loop'` |
| `isaretli` | Hedef İşareti | debuff | marker, 20 s, no effect of its own | no | Marked Prey (larvae fixate the owner) |

### 4.5 NEW passive: Dostlaşma (befriend)

`PASSIVES.ps_villager_befriend` (in `ai/abilities.ts`): `onHp` when `hpFrac <= params.hpBelow` and not done: set done, `ai.e.statuses.apply('invulnerable', 5)` (broadcast `estatus`), stop the brain (`ai.suspend()` or `suppress` the busy and clear the target), play clip `Cheer` once, `G.vfx.spawn('heal_burst')`, floating text "DOSTLAŞTI", after 1.2 s `e.escape()`; before escaping **credit the forces and kill** exactly as a death would: call `G.mplus.onEnemyKilled(e)` once (host) and let the XP be 0. Elite HP means the party burns about 80 % of an elite's HP for 8 forces, which is the WoW "high HP, low reward" feel. A poise break before 20 % HP locks Polen and Dev Çakma for 5 s and so makes the last 20 % safe to burn.

### 4.6 Pack list

Positions are tile centres in the room, members use the shared **spiral formation**: `SPIRAL = [[0.3,0],[-0.38,0.35],[0.06,-0.66],[0.48,0.62],[-0.88,-0.16],[0.83,-0.53],[-0.28,1.03],[-0.53,-1.02],[1.15,0.42],[-1.2,0.49],[0.58,-1.23],[0.43,1.36]]` (it is the pattern all Kemik packs already use). NEW authoring helper `spiralPack(id, roomId, cx, cz, enemyIds[], extra)` in `kit.ts` (S2) fills the offsets in order: melee first, casters and healers last (they kite to range anyway). Forces and mobs were summed by script. **Revision 2 moved ten pack centres so that no member stands on a stair, on a void column or against a wall** (p06, p07, p08, p09, p20, p25, p27, p28, p29, p30: the changed numbers are in bold); the 463 / 425 / 38 forces are unchanged, the mob count is **118** (p14 gained a mob).

| pack | room | centre | members | forces | notes |
|---|---|---|---|---|---|
| `ps_p01` | drust_kampi | 18, 56 | Boynuz Pençesi x8 | 16 | first pull, a swarm. Stealth skip candidate |
| `ps_p02` | drust_kampi | 19.5, 50 | Ruh Yarıcı x2, Ruh Biçici x1, Peri Köylüsü x1 | 23 | kick the Harvester, dispel Ruh Yarığı |
| `ps_p03` | drust_kampi | 24.5, 51 | Ruh Yarıcı x2, Ruh Biçici x2 | 20 | **the hardest early pack**: two Harvesters, two kicks |
| `ps_p04` | drust_kampi | 22, 47.5 | Dal Kıran x2 | 20 | by the north exit, two slow bursts, two posture bars (a break locks the burst) |
| `ps_p05` | drust_kampi | 21, 56 | Boynuz Pençesi x3, Ruh Yarıcı x1 | 11 | **patrol** `[[25.5,56],[19,56]]` (about 8 s per leg at the patrol walk speed): its west end is 1 tile from p01 (body pull), it also sees p03 |
| `ps_p06` | k_ritual | **22**, 42.9 | Ruh Biçici x2 | 10 | on the **flat upper half** of the corridor in front of the boss door (was x 21.5, which put a member against the wall) |
| `ps_p07` | kok_salonu | 18.5, **22.5** | Ruh Yarıcı x1, Ruh Biçici x1, Boynuz Pençesi x4 | 18 | post-boss hall, upper floor, north of the grand staircase |
| `ps_p08` | kok_salonu | 24, **22.5** | Peri Köylüsü x1, Ruh Biçici x1 | 13 | upper floor; its casters can see down the staircase |
| `ps_p09` | mantar_korusu | 10.5, **26.8** | Peri Köylüsü x2 | 16 | **optional**, the befriend demo, shrine mound just north |
| `ps_p10` | m1 | 19.5, 17 | Sis Muhafızı x2, **Sis Şekillendirici x1**, Sis Sokucu x1 | 16 | the Shaper replaces the Tender: Çalı Zırhı kick plus the guardians' Tepme |
| `ps_p11` | m1 | 20, 12.5 | Sis Avcısı x2, Peri Köylüsü x1 | 16 | |
| `ps_p12` | m2 | 27.5, 15 | **Sis Ana** x1, Sis Muhafızı x2 | 22 | mini-boss pack, big |
| `ps_p13` | m2 | 27, 11.5 | Sis Bakıcısı x1, Sis Sokucu x2, **Sis Muhafızı x1** | 15 | the Guardian replaces a Stalker: a circular dodge in the corner pack |
| `ps_p14` | m3 | 35.5, 15 | Sis Muhafızı x2, Sis Şekillendirici x1, Sis Bakıcısı x1, Sis Sokucu x2, Sis Avcısı x1 | 28 | **the largest maze pull**: 5 of the 8 maze types (Guardian, Shaper, Tender, Stinger, Stalker; the Villager, Nightblossom and Sis Ana are in p11, p15, p12) |
| `ps_p15` | m3 | 35.5, 19 | Gece Çiçeği x1 | 9 | single elite: string, pollen, **grab** |
| `ps_p16` | m3 | 34, 11.5 | Sis Sokucu x2, **Sis Muhafızı x1** | 10 | the Guardian replaces the Stalker |
| `ps_p17` | m4 | 43.5, 16.5 | **Sis Şekillendirici x1**, Sis Muhafızı x2, Sis Sokucu x1 | 16 | the Shaper replaces the Tender |
| `ps_p18` | m4 | 43.5, 12 | Peri Köylüsü x1, Sis Avcısı x1 | 12 | |
| `ps_p19` | m4 | 43.5, 15 | Sis Muhafızı x2 | 8 | **patrol** `[[41,19],[46,19],[46,11],[41,11]]` around the glade, drags p17 / p18 |
| `ps_p20` | havuz | **65, 21** | Dikenfak Oburu x2 | 10 | first pack of the nest side, in the **plunge-pool alcove** below the stairs (was on the stairs) |
| `ps_p21` | yuva_magarasi | 61, 27.5 | Dikenfak Geyikboynuz x1, Dikenfak Oburu x2 | 18 | "first Staghorn pack", skippable by stealth |
| `ps_p22` | yuva_magarasi | 66, 26 | Dikenfak Larvası x8, Dikenfak Yağmacı x1 | 12 | **dormant** `{ kind: 'egg', wakeRadius: 6 }`, `peri_gorm_egg` under each member (`tag: 'wake'`) |
| `ps_p23` | yuva_magarasi | 68.5, 29.5 | Dikenfak Oburu x2, Dikenfak Yağmacı x1, Dikenfak Geyikboynuz x1 | 22 | |
| `ps_p24` | yuva_magarasi | 63.5, 30 | Dikenfak Yağmacı x2, Dikenfak Oburu x2 | 18 | |
| `ps_p25` | yuva_koprusu | **61.5**, 34.5 | Dikenfak Oburu x2, Dikenfak Larvası x6 | 16 | on the bridge: Gorger knockback into the chasm (a 25 % fall), larva pools block the lane. **Line formation** along the 1 tile lane (offsets `[0, -1.75 + 0.5 i]` from the lane centre x 61.5, `spiralPack` option `formation: 'line'`). Skippable by the tunnel |
| `ps_p26` | yan_tunel | 58.5, 34.5 | Dikenfak Geyikboynuz x1 | 8 | **optional**, guards the tunnel |
| `ps_p27` | yuva_kuyusu | **57.5, 42.8** | Dikenfak Geyikboynuz x1, Dikenfak Oburu x2, Dikenfak Yağmacı x1 | 22 | on the flat pit floor, below the Çukur Merdiveni |
| `ps_p28` | yuva_kuyusu | **63, 43.3** | Dikenfak Larvası x8 | 8 | **dormant egg** pack, 6 m wake |
| `ps_p29` | yuva_kuyusu | **60, 44.6** | Dikenfak Geyikboynuz x2 | 16 | guard before the boss door: double heal and shield, two posture bars |
| `ps_p30` | peri_halkasi | **74.5**, 27.5 | Dikenfak Oburu x2, Dikenfak Larvası x4 | 14 | **optional**, with the haste shrine and the gold chest, on the knoll ramp (the only pack on a slope) |

Totals (script): **463 forces, 118 mobs**. Required packs: 425 forces. Optional: p09 16, p26 8, p30 14.

**Designed big pulls ("Katliam" spots):** BP1 camp **p02 + p03 + p05** (12 mobs, 54 forces, the patrol makes it unavoidable to learn), BP2 glade 3 **p14 + p15 + p16** (11 mobs, 47 forces), BP3 nest **p22 + p23 + p24** (17 mobs, 52 forces, the eggs burst when the party fights nearby).

### 4.7 Must-answer summary (for the "kick and dispel rotation" helpers) and the no-dispeller answers

* **Kick (priority 2):** Ruh Biçici Öz Biçme, Sis Bakıcısı Ormanı Besle, **Sis Şekillendirici Çalı Zırhı**, Sis Ana Işık Havuzları, Dikenfak Geyikboynuz Direnç and Yenileme Uyarımı, Dikenfak Oburu Asit Damlası (medium in practice: its cast has a 12 s cooldown). **Priority 1:** Sis Avcısı Sisten Atılış. **A posture break is a second answer** to every elite and mini-boss cast (it cancels the cast and locks it), see 4.1.
* **Frontals the tank turns:** Ruh Yarığı, Mızrak Yağmuru, Şaşırtan Polen, Üçlü Isırık, Zırh Parçalama (random non-tank, so the whole party watches it). **Dodge checks:** Tepme Çılgınlığı (circle r 4), Dev Çakma (delayed), Dal Savurma (delayed finisher), Kök Kavrama (perilous catch).
* **Danger by position:** Asit Damlası knockback on Çürük Köprü, larva pools on narrow lanes, flying Yağmacı joining a pull, patrols p05 and p19, Villager pollen in the maze lanes.
* **Lockdown rewards:** stunning or interrupting a Gorger or a Stalker puts the ability on its full cooldown ("disrupt prevents recast for 15 s").

**Dispel supply versus demand.** The only player dispels in the code are Panzehir (`skills.ts` 574, one healer spec), the Hayat İksiri major (`cleanse: 1`, `skills.ts` 672) and a major with `cleanseEvery: 2` (679). The dungeon has six must-answer effects, so **each one has a non-dispel answer** and the group never wipes without a dispeller:

| effect | with a dispel | without any dispel |
|---|---|---|
| Kin Laneti (swarm death curse) | dispel between kills | **cap 3 stacks (+18 %), 10 s, decays by itself**; kill the swarm in two phases and the stacks fall off |
| Ruh Yarığı (Soulcleaver DoT) | dispel at once | **6 s, about 1.8 coef in total**: a heal tick, no cooldown needed |
| **Anima Enjeksiyonu** (6 s fuse, coef 2.0) | dispel in 6 s | **burst radius is 3 m**: the host runs 4 m away from the group (a 7 m/s run covers it in 0.6 s) and eats it alone; the Stinger's cast is 0.8 s windup, kick not needed |
| Dikenli Patlama slow | dispel | 4 s slow at 40 %, ignore it or roll out |
| Gece Çiçeği poison x3 and Dikenfak Yağmacı stacks (5, 10 s) | dispel | stacks decay in 8 to 10 s, a defensive covers it, **kill the Reaver first** |
| Asit Yarası (Tred'ova) | dispel resets it | no answer needed, it decays in 6 s (5.3) |

Optional consumable in PS-D6: **Panzehir İksiri** (`potion_panzehir`, vendor at the Meşe Nöbetçileri camp and at the Kehanet Taşı vendor, cleanses 1 debuff, 60 s cooldown shared with potions) so a party with no dispel class still has one answer per minute. **PS-QA must run the whole dungeon at +10 with zero dispels** (no Panzehir spec, no major cleanse, no potion) and report any wipe or any death that needs a dispel.

---

## 5. BOSSES

Three bosses, same count and order as the WoW dungeon (`contentCheck` also demands exactly 3). Format follows `GDD_CONTENT` 4.x.5 and the real scripts (`src/ai/bosses/golge.ts`, `kemik.ts`). All scripts live in `src/ai/bosses/peri.ts` (`PERI_SCRIPTS`, `PERI_SPAWNS`, registered in `bosses/index.ts`) and run on the host (BossController is host only). Kit calls named below exist in `src/ai/bosses/kit.ts` and `BossController` unless marked **NEW** (collected in section 8, S5 and S16). The scaling rule: boss `hp` is "solo time to kill at par in seconds" (GDD 0.3); the **target fight length at +10, Fortified week, 5 players of par DPS is given per boss** so the numbers can be re-tuned with SimBench after CM7 lands.

Interrupt rule for bosses (GDD 0.6): a boss cast marked interruptible stops on a **stagger break** (poise bar, GDD_V2 3.12) or on hard CC of a boss **add**.

**The Elden Ring layer (CORE_MECHANICS 16, user requirement).** Every boss keeps its WoW mechanics unchanged and gets, on top, a melee-and-movement move set that follows the same rules as the trash: first telegraph `W(coef) = clamp(0.45 + 0.25 coef, 0.45, 1.2)`, follow-up strikes `FW(coef) = clamp(0.30 + 0.12 coef, 0.30, 0.55)` that **re-aim at the live target**, **delayed swings** (a visible hold of 0.2 to 0.6 s on top of the windup, never perilous, decided on the host and baked into the shape delay), 2 and 3 hit **strings** with a heavier finisher (knockback 3 to 5 m), at most **one melee-like move of a boss in flight at a time** (a shared melee slot that frees 3.5 s after the last recover), and a **posture bar**: bosses use the `boss` poise default (600, times `1 + 0.5 (party - 1)`, so 1800 at five players), every parry deals 120, every heavy 25 to 30, and a break gives the 2.0 s window (x1.25 damage, `marked_crit`, windup cancelled, boss casts dropped except perilous), which here also doubles as the **second interrupt** of each boss. Each boss also has one signature posture payoff (a wall hit, a broken embrace, a tripped dance). New script helpers: `bossString`, `bossLeap`, `bossRush`, `bossBreak` (S16).

### 5.1 Boss 1: Ingra Malok and Droman Ulfaran (`boss_ingra_malok`)

*"Boynuzlu Ahalinin Ruh Bilgesi".* WoW model: Ingra Maloch and Droman Oulfarran. A caster-sage who keeps a brute, **Droman**, mind-controlled with a spectral chain; the fight is "break the embrace through Droman, then burn the stunned sage". The Elden layer makes **Droman a guardian-class brute** (shield bash into an overhead slam, a jump attack, a posture bar) and gives Ingra a **staff string** and a **soul sweep**, so the room has melee, ground and cast reads at once.

**Arena:** `ingra_arena` (56 x 52 m, floor 2.4 m, flat), `boss_lock` south door, `boss_exit` north door onto the Kök grand staircase landing. Ingra stands at (21.5, 33) facing south, Droman at (21.5, 37.5) chained to a post, eight standing stones on a ring, magenta braziers, a root-balcony ring at 7.0 m with hanging cages and wicker totems (decor, 2.11). Violet ground circles (zone `rune` r 5.6 and r 2.4).

| hpMult | dmgMult | speed | enrage | arenaR | poise | Ingra model | clips |
|---|---|---|---|---|---|---|---|
| 70 | 2.2 | 4.5 m/s | 270 s | 22 | 600 (boss default), **hidden and immune during Karanlığa Sarıl** | `CHAR('Mage')` scale 1.55 tint `0x6a3a6a`, staff, `peri_drust_mask`, kite 8 to 14 | `Idle`, `Spellcast_Shoot`, `Spellcast_Long`, `Spellcast_Raise`, `Taunt`, `Death_B`, `2H_Melee_Attack_Slice`, `2H_Melee_Attack_Chop` |

Droman: `ps_droman`, `CHAR('Barbarian')` scale 1.6 tint `0x7a6a4a`, mask and a wicker shield, role tank, rank elite, `hpMult 28` (set by the script as `28 * partyHp(c)`), dmg 1.6, speed 5.2, radius 0.9, **poise 220** (elite scale, times the party factor). He is a normal enemy for AI and threat, the tank holds him.

```ts
add({ id: 'ps_droman', name: 'Droman Ulfaran', model: CHAR('Barbarian'), scale: 1.6, tint: 0x7a6a4a, role: 'tank', rank: 'elite', hp: 28, dmg: 1.6, speed: 5.2, radius: 0.9, aggro: 40, forces: 0, poise: 220,
  anims: A_KAYKIT, resist: R_CULT, visual: { attach: [MASK], eyeEmissive: 0xc060ff, runRef: 5.2 },
  onBreak: breakOf({ windowMult: 1.5, disable: ['droman_tears', 'droman_pollen'], disableSec: 5 }),     // + the script reads the break as "embrace broken" (below)
  basic: cone('droman_club', 'Hasır Gürz', 3.2, 110, 2.6, 1.0, '2H_Melee_Attack_Chop', 0.5, { windup: 0.7 }),
  abilities: [
    delayed(string('droman_bashslam', 'Kalkan ve Ezme', 11, [                                   // Elden: shield bash into a delayed overhead
      { coef: 1.0, range: 2.8, arc: 100, anim: '1H_Melee_Attack_Stab', impact: 0.4 },
      { coef: 2.6, range: 3.6, arc: 90, anim: '2H_Melee_Attack_Chop', impact: 0.5, knockback: 4 } ]), [0.2, 0.45]),
    jumpSlam('droman_leap', 'Hasır Fırtınası', { min: 4, max: 12, airtime: 0.55, radius: 2.8, coef: 2.4, track: 0.6,
      after: { pattern: 'cross', count: 4, radius: 2.2, spacing: 0, first: 0.7, aim: 'self', coef: 1.0, type: 'poison', origin: 'landing' } }, 18, '2H_Melee_Attack_Chop', 0.5, { initialCooldown: 9 }),
    custom('droman_tears', 'Ormanın Gözyaşları', 40, 20, 1.4, 'Spellcast_Raise', { params: { impact: 1.0 } }),                // CUSTOM.droman_tears (S8)
    cone('droman_pollen', 'Şaşırtan Polen', 6, 60, 14, 0.6, 'Spellcast_Raise', 0.5, { windup: 1.2, telegraph: true, parryable: false, statuses: [{ status: 'disorient', duration: 4 }] } as Ab),
  ] });

boss({ id: 'boss_ingra_malok', name: 'Ingra Malok', title: 'Boynuzlu Ahalinin Ruh Bilgesi', model: CHAR('Mage'), scale: 1.55, tint: 0x6a3a6a, role: 'caster',
  hp: 70, dmg: 2.2, speed: 4.5, radius: 1.0, enrage: 270, arenaR: 22, loot: 'loot_ps_b1', anims: { ...A_KAYKIT, death: 'Death_B' }, resist: R_CULT,
  visual: { hide: mageHide('2H_Staff'), attach: [MASK], eyeEmissive: 0xc060ff, glow: 0xb060ff, runRef: 7 },
  basic: proj('ingra_bolt', 'Karanlık Ok', 16, 40, 2.6, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'shadow_cast' }),
  abilities: [
    proj('ingra_spirit_bolt', 'Ruh Oku', 14, 40, 8, 2.0, 2.4, 'shadow', 'shadow_projectile', 'Spellcast_Long', 1.55, { initialCooldown: 5, castTime: 2.0, interruptible: true, kick: 2, params: { target: 1, impact: 1.55 } } as Ab),
    custom('ingra_staff', 'Boynuz Biçişi', 7, 12, 0.75, '2H_Melee_Attack_Slice', { params: { impact: 0.4 } }),       // 3-hit staff string, script (below)
    custom('ingra_sweep', 'Ruh Süpürmesi', 40, 24, 0.9, 'Spellcast_Long', { initialCooldown: 14, params: { impact: 1.0 } }),   // rotating line sweep
    custom('ingra_embrace', 'Karanlığa Sarıl', 40, 16, 1.2, 'Spellcast_Raise', { sfx: 'shadow_cast', params: { impact: 1.0 } }),
    custom('ingra_visage', 'İtici Görünüm', 50, 30, 2.0, 'Spellcast_Raise', { castTime: 2.0, interruptible: false, sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('ingra_breakfree', 'Zincirler Kırıldı', 999, 9999, 1.5, 'Taunt', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['ingra_spirit_bolt', 'ingra_staff', 'ingra_sweep', 'ingra_embrace', 'ingra_visage']),
    bp('p2', 0.2, ['ingra_spirit_bolt', 'ingra_staff', 'ingra_sweep', 'ingra_visage'], { yell: 'Hayır! Zincirler!', ability: 'ingra_breakfree' }),
  ],
  intro: 'Bu koruluk artık Boynuzlu Ahali\'nin. Anima bize aittir!', death: 'Döngü... beni de... kabul etmedi...',
  arena: { cx: 88, cz: 142, w: 56, h: 52, homeX: 88, homeZ: 134 } });
```

**Timeline.**

| Ability (id) | Type | Timing | Shape / effect | Damage | Counter | Kit |
|---|---|---|---|---|---|---|
| Karanlık Ok (`ingra_bolt`) | basic | every 2.6 s | projectile at the threat target | coef 1.0 shadow | heal through | EXISTS |
| **Ruh Oku** (`ingra_spirit_bolt`) | **interruptible** | first 5 s, cd 8 s, cast 2.0 s | bolt at a random non-tank (any player when solo) | coef 2.4 shadow | **interrupt** or **posture break** (stagger break). An interrupt staggers him for 1.5 s | EXISTS (`proj`, `kick: 2`) |
| **Boynuz Biçişi** (`ingra_staff`, **Elden string**) | melee string | when any player is within 6 m of Ingra, cd 12 s, first strike windup 0.75 + **hold 0.20 to 0.45** | 3 staff strikes, each **re-aimed**: cone 4.0 m 100 degrees (coef 1.2), cone 4.5 m 100 degrees (coef 1.2, follow windup 0.44), finisher cone 5.0 m 90 degrees (coef 2.2, follow windup 0.55, **knockback 5 m**) | 1.2 + 1.2 + 2.2 physical | wait for the swing, roll the finisher, or parry the first (parry poise 120). Stage 2 she walks up and uses it on the tank | NEW `bossString` (S16) |
| **Ruh Süpürmesi** (`ingra_sweep`, **Elden sweep**) | avoidable | first 14 s, cd 24 s, first marker windup 0.9 | **3 rotating line telegraphs** 30 x 3 m from Ingra, 0.35 s apart, each turned 25 degrees from the last (a fan that sweeps across the circle) | coef 1.8 shadow per line | move perpendicular, roll through the gap between two lines | EXISTS (`beam`, `every`) |
| **Ruh Zinciri** (stage 1, passive) | mechanic | whole stage 1 | **Droman** (28 x partyHp) fights the tank. Ingra stays behind at range | | the tank keeps Droman off the group | EXISTS (`spawnAdds`) |
| **Droman: Kalkan ve Ezme** (`droman_bashslam`, Elden string) | melee string | cd 11 s | shield bash (cone 2.8 m, coef 1.0, windup 0.70 + **hold 0.20 to 0.45**) then **overhead slam** (cone 3.6 m 90 degrees, coef 2.6, follow windup 0.61, knockback 4) | 1.0 + 2.6 | tank: parry the bash and the slam dies, or defensive | EXISTS (GDD_CREATURES kit) |
| **Droman: Hasır Fırtınası** (`droman_leap`, jump attack) | avoidable | first 9 s, cd 18 s, windup 1.2 (rule 0.95 at coef 2.4), landing locked 0.5 s before | leaps to a random non-tank within 4 to 12 m, circle r 2.8, then a **4-line poison cross** (+0.7 s) | coef 2.4 + 1.0 | roll the circle, stand on a diagonal | EXISTS (GDD_CREATURES `jumpSlam`) |
| **Ormanın Gözyaşları** (`droman_tears`, **Force Compliance**) | avoidable | Droman, first 6 s, cd 20 s, windup 1.4 s | **5 anima globs** (circle r 2.5, telegraph 1.6 s) on random players. Each leaves an **Anima Birikintisi** (r 2.5, 14 s, coef 0.25 per 0.5 s, poison). **Weakened Resolve (M+ and Mythic):** +1 glob per cast already done, cap 11, until stage 2 | glob coef 1.4 poison | step out, keep puddles off the tank's spot | EXISTS (`ai.shape`) in a `CUSTOM.droman_tears` handler |
| **Şaşırtan Polen** (`droman_pollen`) | frontal | Droman, cd 14 s, windup 1.2 s | cone 6 m, 60 degrees | coef 0.6 + `disorient` 4 s | tank turns him away from the group | EXISTS + status NEW |
| **Karanlığa Sarıl** (`ingra_embrace`) | phase mechanic | first 16 s, cd 40 s (from the cast), windup 1.2 s | Ingra takes **80 % less damage** for up to 25 s (`c.vulnerable(0.2, 25)`) and **every player gets Karanlık Örtüsü** (shadow DoT every second, coef 0.35, not dispellable). **Break it in either of two ways: deal 15 % of Droman's max HP to Droman during the embrace, or break Droman's posture** (the posture bar reads from 220, a party of five breaks it in about 8 s of active play with parries and heavies) | DoT | **burst Droman** (not Ingra). If nobody breaks it in 25 s: **Karanlık Patlaması**, raid coef 3.5, embrace ends | EXISTS (`vulnerable`, `statusPlayer`) + `clearPlayerStatus` NEW |
| **Droman'ın Gazabı** (`droman_wrath`, event) | burst window | when the embrace is broken | Droman roars (circle VFX on Ingra, 1.0 s), **Ingra is stunned 12 s, her posture bar is open and she takes +200 % damage** (x3), Death Shroud is removed from everyone, Droman heals to full and drops back to his fight. **A posture break of Ingra in this window adds the 2 s Kritik Vuruş window on top** | | **burn Ingra** | EXISTS (`c.stagger(12, 3.0, 12, "DROMAN'IN GAZABI!")`) |
| **İtici Görünüm** (`ingra_visage`, M+ and Mythic) | unavoidable | first 30 s, cd 50 s, cast 2.0 s | fear 3 s on every player, the room's `circle` r 70 with status `fear`, coef 0.6 | coef 0.6 shadow | defensive cooldowns, do not stand in puddles when it lands | EXISTS |
| **Zincirler Kırıldı** (`ingra_breakfree`, stage 2 at 20 %) | phase | once, windup 1.5 s | Droman breaks free: he turns **friendly** (invulnerable, stops fighting) and now casts **Droman'ın Gazabı every 20 s** (the first 3 s after the break). Embrace never returns, Weakened Resolve ends | | finish him inside the first stun window | EXISTS |
| **Karanlık Çöküşü** (enrage, 270 s) | soft enrage | at 270 s | +10 % damage every 10 s | | | EXISTS (`c.dmgMul *= 1.1` in `every`) |

**Melee slot and tuning.** Ingra's melee string and sweep share the slot rule, so a sweep never starts inside a string. Poise: Ingra is immune to poise damage during the embrace (the bar is hidden), outside it she breaks like any boss and the break (a) cancels Ruh Oku (`kick`-equivalent), (b) cancels a started string, (c) is a free 2.0 s x1.25 damage window. Droman's own break also locks Gözyaşları and Polen for 5 s.

**Script outline (`peri.ts`, `ingra`):**

```ts
init(c)    { c.state = { stage2: false, embrace: null, tears: 0, droman: 0 }; spawn Droman (spawnAdds('ps_droman', 1, { positions: [c.gdd(21.5, 37.5)], tag: 'droman', hpMult: 28 * partyHp(c) })); }
update(c, dt) {
  // Droman can not die: clamp at 12 %, regen 3 %/s outside the embrace
  // embrace tracking: st.embrace = { t, dmg0 = droman.hp }; if (dmg0 - droman.hp >= 0.15 * droman.maxHp || combat.isStaggerBroken(droman)) wrath(c);
  // 25 s timeout -> circle(raid, coef 3.5), c.vulnerable(1, 0), clearPlayerStatus(p, 'karanlik_ortusu') for all
  // stage 2: every(st, 'wrath', dt, 20, () => wrath(c))
  // Elden string (ability ingra_staff, resolve): bossString(c, [
  //   { coef: 1.2, range: 4.0, arc: 100, windup: 0.75, hold: [0.20, 0.45] },
  //   { coef: 1.2, range: 4.5, arc: 100, windup: 0.44, gap: 0.2 },
  //   { coef: 2.2, range: 5.0, arc: 90,  windup: 0.55, gap: 0.2, knockback: 5 } ], { target: nearestPlayerTo(c.e), cancelOnBreak: true })
  // sweep (ingra_sweep, resolve): for i in 0..2: after(i * 0.35, () => beam(c, e.x, e.z, ang0 + rad(25) * i, 30, 3, 0.9, 1.8))   // ang0 = angle to a random player
}
wrath(c) { clear Death Shroud on all, c.vulnerable(1, 0); c.stagger(12, 3.0, 12, "DROMAN'IN GAZABI!"); droman.hp = droman.maxHp (stage 1 only); st.embrace = null; floatOver(droman, 'GAZAP!', 1); }
```

**Duties.** *Tank:* hold Droman, parry or defensive the slam, turn him from the group (Polen), park the fight on a clean part of the circle (puddles pile up for 14 s). *Healer:* Death Shroud is party-wide damage for up to 8 s each cycle, puddle chip, the fear in M+, the finisher knockback of the staff string. *DPS:* two kicks or a posture break on Ruh Oku, on every Embrace swap to Droman and burst or break him, then swap back to Ingra for the stun, save the big cooldowns for the stun windows. **Fight length at +10: about 2:20** (embrace at 16 s, wrath at about 26 s, second embrace at about 56 s, stage 2 at about 100 s, done at about 140 s; the string and sweep add damage, not time). Tyrannical week about 3:00.

**Yells:** pull "Bu koruluk artık Boynuzlu Ahali'nin. Anima bize aittir!" · Embrace "Karanlık beni sarsın!" · 20 % "Hayır! Zincirler!" · death "Döngü... beni de... kabul etmedi...".

**Loot** `loot_ps_b1`: three named items, see 5.4: **Boynuzlu Bilgenin Tılsımı** (amulet), **Ruh Yarıcı Asa** (staff / wand), **Hasır Totem Omuzluğu** (shoulders).

### 5.2 Boss 2: Sis Çağıran (`boss_sis_cagiran`)

*"Sisin Oyuncu Sahibi".* WoW model: Mistcaller. A playful faerie who plays games with the intruders: the Guessing Game, Freeze Tag, Patty Cake, Dodge Ball. **Her gimmick is reading, not DPS.** The Elden layer turns the games into a *dance*: Patty Cake is a three-clap string, she leaps between players in a mist step, and Dodge Ball has a delayed throw. Her posture break is a "tripped dance".

**Arena:** `sis_cagiran_cayiri` (52 x 60 m, floor 6.4 m, a two-step stump platform at 6.8 and 7.2 m), entry from the west (`boss_lock`), exit east to the waterfall (`boss_exit`). She stands at (56.5, 13) facing west, on the rim of the stump platform. Birch ring, pond, **eight sigil stones on a ring r 3.2 tiles** around (54, 13) (the clone slots). The fog stays at the room value (6 / 34) during the games: the sigils must be readable.

| hpMult | dmgMult | speed | enrage | arenaR | poise | model | clips |
|---|---|---|---|---|---|---|---|
| 85 | 2.0 | 5.0 m/s | 300 s | 24 | 600 (boss default); she is immune to poise while invisible in a game | `CHAR('Mage')` scale 1.3 tint `0x80e8d8`, `peri_fae_wings`, hover bob 0.1, kite 8 to 14 | `Idle`, `Spellcast_Shoot`, `Spellcast_Raise`, `Spellcast_Long`, `Spellcast_Summon`, `Cheer`, `Death_B`, `1H_Melee_Attack_Slice_Diagonal`, `Jump` |

```ts
const P = ['mist_patty', 'mist_burst', 'mist_dodgeball', 'mist_freeze', 'mist_dance'];
boss({ id: 'boss_sis_cagiran', name: 'Sis Çağıran', title: 'Sisin Oyuncu Sahibi', model: CHAR('Mage'), scale: 1.3, tint: 0x80e8d8, role: 'caster',
  hp: 85, dmg: 2.0, speed: 5.0, radius: 0.9, enrage: 300, arenaR: 24, loot: 'loot_ps_b2', anims: { ...A_KAYKIT, death: 'Death_B' }, resist: R_BEAST,
  visual: { hide: mageHide('1H_Wand'), attach: [WINGS], eyeEmissive: 0x80ffe0, glow: 0x80ffe0, hoverBob: 0.1, runRef: 7 },
  basic: proj('mist_touch', 'Sis Dokunuşu', 14, 40, 2.4, 0.6, 1.0, 'poison', 'poison_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    custom('mist_patty', 'Pasta Pasta', 14, 6, 1.5, 'Spellcast_Raise', { castTime: 1.5, interruptible: true, kick: 2, sfx: 'spell_cast', params: { impact: 1.0 } }),   // 1.5 s cast, then a 3-clap string on the tank
    custom('mist_burst', 'Cezalı Patlama', 21, 11, 2.0, 'Spellcast_Long', { sfx: 'boss_cast', params: { impact: 1.55 } }),
    custom('mist_dodgeball', 'Kaçınma Topu', 19, 15, 1.3, 'Spellcast_Shoot', { sfx: 'boss_cast', params: { impact: 0.3, hold: [0.3, 0.6] } }),
    custom('mist_freeze', 'Dondurmaca', 38, 24, 1.0, 'Cheer', { sfx: 'frost_cast', params: { impact: 0.5 } }),
    custom('mist_dance', 'Sis Dansı', 40, 22, 1.1, 'Jump', { initialCooldown: 17, sfx: 'blink', params: { impact: 0.6 } }),
    custom('mist_guess', 'Sis Oyunu', 999, 9999, 1.2, 'Spellcast_Summon', { sfx: 'boss_cast' }),
  ],
  phases: [
    bp('p1', 1.01, P), bp('g1', 0.70, [], { yell: 'Saklambaç oynayalım!', ability: 'mist_guess' }),
    bp('p2', 0.699, P), bp('g2', 0.40, [], { yell: 'Yine! Yine!', ability: 'mist_guess' }),
    bp('p3', 0.399, P), bp('g3', 0.10, [], { yell: 'Son bir oyun!', ability: 'mist_guess' }), bp('p4', 0.099, P),
  ],
  intro: 'Oh, misafirler! Hadi oynayalım, kaybedenler sisin içinde kalır!', death: 'Yakalandım... ne güzel oyundu...',
  arena: { cx: 218, cz: 54, w: 52, h: 60, homeX: 228, homeZ: 54 } });
```

**Timeline.**

| Ability (id) | Type | Timing | Shape / effect | Damage | Counter | Kit |
|---|---|---|---|---|---|---|
| Sis Dokunuşu (`mist_touch`) | basic | every 2.4 s | projectile at the threat target | coef 1.0 poison | heal | EXISTS |
| **Pasta Pasta** (`mist_patty`, Patty Cake, **Elden clap string**) | **interruptible** cast, then a string on the **current tank** | first 6 s, cd 14 s, cast 1.5 s | after the cast: three claps, each **re-aimed**: **Sol Alkış** cone 3.5 m (coef 1.0, windup 0.70), **Sağ Alkış** cone 3.5 m (coef 1.0, follow windup 0.42), **Çifte Alkış** cone 4.0 m (coef 1.6, follow windup 0.49, **knockback 4 m and `disorient` 5 s**). Interrupted during the cast: she is staggered 2 s (`c.stagger(2, 1.3, 4)`) and the whole string is lost | coef 3.6 over the string | **kick it, or break her posture during the cast** (anyone with the stagger break). Otherwise the tank parries the first clap (the string dies) or takes it with a defensive and steps out of the group at the finisher | `bossString` NEW + `statusPlayer(.., 'disorient', 5)` EXISTS |
| **Cezalı Patlama** (`mist_burst`, Penalizing Burst) | unavoidable raid | first 11 s, cd 21 s, windup 2.0 s | raid-wide poison, **+15 % per cast already made** (`st.burst++`) | coef 1.0 x (1 + 0.15 n) | healer cooldowns, it keeps growing, the fight must end | `circle(c, e.x, e.z, 80, 2.0, coef, { telegraph: false })` EXISTS |
| **Kaçınma Topu** (`mist_dodgeball`, Dodge Ball, **delayed throw**) | avoidable | first 15 s, cd 19 s, windup 1.3 s **+ hold 0.30 to 0.60** | an anima ball through a random player: **line 44 x 3.2 m**, hits everyone on the line. The line is drawn at the start of the windup and the ball is held in her hand for the hold before it flies | coef 2.4 poison + knockback 4 m | sidestep late, roll after the hold ends, do not roll on the first read | `beam(c, e.x, e.z, ang, 44, 3.2, 1.3 + hold, 2.4, { knockback: 4 })` EXISTS |
| **Sis Dansı** (`mist_dance`, **Elden jump attack**) | avoidable | first 17 s, cd 22 s, windup 1.1 s, landing circle **locked 0.5 s before landing** | she melts into mist and re-forms on a random non-tank player within 8 to 28 m: circle r 3.2 (coef 2.2), then a **4-line mist cross** (length 9 m, width 2 m, at +0.7 s, coef 1.0). Not used during a game | coef 2.2 + 1.0 | roll the circle, then stand on a diagonal | NEW `bossLeap` (S16) |
| **Dondurmaca** (`mist_freeze`, Freeze Tag) | chase | first 24 s, cd 38 s, windup 1.0 s | spawns a **Sis Tilkisi** (`ps_vulpin`) 20 m from a random non-tank. It **fixates that player for 14 s** (speed 5.6, slower than the 7 m/s run). On contact: **Donduran Patlama** r 8 m, coef 1.2 frost + freeze 6 s for everyone in 8 m. Keep the group more than 8 m from the Vulpin, even if it is not chasing you | coef 1.2 frost + freeze | kite it, **slow / root / stun it**, or kill it (6 x partyHp HP). It expires after 14 s | `spawnAdds` + **fixate NEW** (S5) |
| **Sis Oyunu** (`mist_guess`, Guessing Game) | phase, at 70 / 40 / 10 % | windup 1.2 s, then up to 20 s | see **the Guessing Game** below | Hay Aksi coef 3.0 (key 5 and below) or 3.6 (key 6 and above), **at most 2 per game** | read the sigils | `setImmune`, `freeze`, `setAlphaAll`, `spawnAdds` of `ps_mist_clone_*` (EXISTS) + shared **sigil rolls** (`SigilPuzzle`, NEW) |
| **Kırık Dans** (posture break, outside games) | payoff | when her poise bar breaks | she **trips mid-dance** (`Cheer` clip played as a stumble): `c.stagger(4, 1.25, 4, 'KIRIK DANS!')`, her Pasta Pasta cast is dropped, Cezalı Patlama is delayed 4 s, a free 4 s x1.25 window | | heavies and parries on her during the clap string | EXISTS (`Combat.forcePoiseBreak`, `c.stagger`) |
| Enrage (300 s) | soft enrage | | Cezalı Patlama cd to 10 s, +10 % damage every 10 s | | | `c.cdOverride.set('mist_burst', 10)` EXISTS |

**The Guessing Game (revised).** She vanishes (after a **1.2 s reveal, see below**) and **4 illusions** appear on 4 of the 8 sigil stones, each wearing a sigil above its head: **3 identical, 1 different**. **Kill the odd one.**

* **Reveal (readability).** During the 1.2 s windup she **stands visible with the shared sigil of the three identical clones floating above her head** (the `peri_sigil_xxx` of code `T`, the same `visual.attach` as a clone) and the same glyph is painted in the middle of the glade floor (a `rune` decal) **for the whole game**. The odd clone is therefore "the one that does NOT match the floor", which a caller can say in one sentence ("the one without the ring"). At key 5 and above only one trait differs and the fog is on, so this is the only way to read it quickly. At key 4 and below the odd sigil differs in all three traits (3.7, M1).
* **Right pick:** she reappears stunned 5 s at the centre, **+60 % damage taken for 8 s** ("YAKALANDI!"), her posture bar is open for the whole stun (a break adds the Kritik Vuruş window), phase over.
* **Wrong pick: Hay Aksi!** raid-wide poison coef **3.0 at key 5 and below, 3.6 at key 6 and above** (was 4.5 at every level) plus knockback 6 m; that illusion dies, the game goes on (the remaining ones still hold the odd one). **At most 2 Hay Aksi per game: the third wrong clone ends the game** with the timeout burst (every remaining illusion bursts, r 8, coef 2.0, local, not raid-wide) and **no stun for her**.
* **No kill in 20 s:** every remaining illusion bursts (r 8, coef 2.0), phase over without the reward.
* **Expected raid damage (healer budget check).** Budget used by the season docs: at most about 4 raid-wide coef in any 10 s window outside cooldowns. A clean game costs 0, an average group makes one wrong pick (3.0 to 3.6), the worst allowed game is two wrong picks (6.0 at key 5 and below, 7.2 above) plus one Cezalı Patlama (about 1.6): **7.6 to 8.8 raid coef in a 20 s game, 3.8 to 4.4 per 10 s**, inside the budget at key 5 and below and 10 % above it only for a group that already missed twice. The old rule allowed nine wrong picks (about 40 raid coef across three games, 12 times the budget of the next-biggest raid hit, Zehir Birikimi 3.2).

**Script outline (`mist`):**

```ts
mist_guess: {
  start(c, b) { b.total = b.delay + 0.8; },
  resolve(c) {
    const plan = rollSigils(rngFor(c), keyLevel);              // { codes: string[4], odd: 0..3, common: string }  (SigilPuzzle.ts, same as the maze)
    showSigilAbove(c.e, plan.common, 1.2); paintFloorSigil(centre, plan.common, 20);       // the reveal
    c.after(1.2, () => {
      c.setImmune(true); c.freeze(true); setAlphaAll(c.e.id, 0); bossFx('stealth_smoke', e.x, e.z);
      const slots = pick4of8(ringPoints(centre, 3.2 * 4, 8));    // metres around the glade centre
      plan.codes.forEach((code, i) => c.spawnAdds('ps_mist_clone_' + code, 1, { positions: [slots[i]], aggro: false, tag: 'clone', hpMult: 0.05 }));
      c.state.guess = { t: 0, oddCode: plan.codes[plan.odd], done: false, wrong: 0 };
      bossMsg('boss_toast', {}, { text: 'Zeminle uyuşmayan illüzyonu vur!' });
    });
  },
}
update(c, dt) {
  const g = c.state.guess; if (!g || g.done) return;
  g.t += dt;
  for (const k of killedClonesSince(c)) {                       // clones with isDead that we have not handled yet
    if (k.def.id.endsWith(g.oddCode)) return success(c, g);     // reappear at the centre, stagger(5, 1.6, 8, 'YAKALANDI!'), endMechanicPhase()
    g.wrong++;
    if (g.wrong <= 2) oopsie(c);                                // circle(raid, coef keyLevel <= 5 ? 3.0 : 3.6, knockback 6), text 'HAY AKSİ!'
    else return timeout(c, g, false);                           // third wrong pick: remaining clones burst, no stun
  }
  if (g.t >= 20) timeout(c, g, true);                           // each alive clone: circle(r 8, coef 2.0); cleanup; endMechanicPhase()
}
```

**Duties.** *Tank:* parry the first clap or defensive the string, step out of the group at the finisher (disorient), keep the boss out of the Vulpin's path, during the games the tank has nothing to hold, so it calls the sigils. *Healer:* Penalizing Burst scales for the whole fight (+15 % per cast, about 8 casts), Hay Aksi is the only big raid hit and is now capped, Freeze Tag freezes everyone in 8 m for 6 s. *DPS:* kick or break the clap cast, kill the odd illusion (any damage kills it), kite or CC the Vulpin, roll the dance landing and the delayed ball on the second read. **Fight length at +10: about 2:50** (three games of about 12 s each, the dance and string add a little damage, a posture break pays it back). Tyrannical about 3:30.

**Yells:** pull "Oh, misafirler! Hadi oynayalım, kaybedenler sisin içinde kalır!" · games "Saklambaç oynayalım!" / "Yine! Yine!" / "Son bir oyun!" · wrong pick "Hay aksi, yanlış tilki!" · success "Yakaladın beni!" · death "Yakalandım... ne güzel oyundu...".

**Loot** `loot_ps_b2`: three named items, see 5.4: **Sis Çağıran'ın Ocarinası** (ring), **Sis Tilkisi Adımları** (boots), **Oyuncunun Hançeri** (dagger).

### 5.3 Boss 3: Tred'ova (`boss_tredova`), the showpiece

*"Dikenfak Yuvasının Anası".* WoW model: Tred'ova. The gorm brood-mother who swallowed Lakali's wildseed. **The most mechanics of the dungeon**: Consumption phases with a breakable shield, a tether (Mind Link), a marked player with fixating larvae, predictive acid, a pull-in explosion, and (M+ 7 and up) three parasites that need kicks. The Elden layer gives her a bite string, a delayed maul, a tail sweep for anyone behind her, and, in the later phases, a leap and a long **charge into the chitin spires** that breaks her own posture.

(The `boss()` helper in `data/enemies.ts` does not forward `introCam` to the `BossDef`; the S1 extraction adds `introCam?` to `BossSpec`.)

**Arena:** `tredova_magarasi` (64 x 52 m, floor -2.4 m), entry from the north (`boss_lock`, the Çukur Merdiveni just north of it ends on the same floor). She waits at (61.5, 53) facing north, **Lakali's cocoon hangs at (61.5, 57)** on a dais at the south wall (floor -1.2 m, 5 steps up; she retreats there to Consume), eight chitin spires around the room (colliding props, 6 m, the charge walls), acid pools at (56.5, 49.5) and (66.5, 55), teal crystals around the cocoon, a 30 m ceiling with a brood gallery at 8.0 m (decor).

| hpMult | dmgMult | speed | enrage | arenaR | poise | model | clips |
|---|---|---|---|---|---|---|---|
| 130 | 2.5 | 4.6 m/s | 330 s | 28 | **700** (heavier than the boss default), x party factor | NEW `gen/bosses/tredova.glb` (fallback `itch/creatures/centipede` x3.4 tint `0xa8c060`) | `Idle`, `Walk`, `Run`, `Attack`, `Attack2`, `Cast`, `Enrage`, `Hit`, `Death` |

```ts
const N = ['tred_bite', 'tred_maul', 'tred_tail', 'tred_acid', 'tred_marked', 'tred_mindlink', 'tred_coalesce'];
const N2 = [...N, 'tred_leap'];                       // after the first Consumption
const N3 = [...N2, 'tred_rush'];                      // after the second
boss({ id: 'boss_tredova', name: "Tred'ova", title: 'Dikenfak Yuvasının Anası', model: GENB('tredova'), scale: 1.0, role: 'melee',
  hp: 130, dmg: 2.5, speed: 4.6, radius: 2.2, enrage: 330, arenaR: 28, poise: 700, loot: 'loot_ps_b3', anims: A_GEN, resist: { poison: 0.75, physical: 0.1, fire: -0.25 }, visual: { runRef: 4.6, glow: 0x9cff6a },
  onBreak: breakOf({ windowMult: 1.5, disable: ['tred_acid', 'tred_marked'], disableSec: 6 }),
  introCam: { hold: 2.6, dist: 16, height: 6 },
  basic: proj('tred_spit', 'Asit Tükürüğü', 18, 30, 3.0, 0.6, 0.8, 'poison', 'poison_projectile', 'Cast', 0.4),     // filler at range if nobody is in melee reach (NEW: the string below is the melee basic)
  abilities: [
    string('tred_bite', 'Çift Isırık', 4.5, [                                                                   // string of 2, stack rule below
      { coef: 1.0, range: 6, arc: 100, anim: 'Attack', impact: 0.5, statuses: [] },
      { coef: 1.0, range: 6, arc: 100, anim: 'Attack', impact: 0.5, statuses: [{ status: 'asit_yarasi', duration: 8, stacks: 1 }] } ]),   // the second bite stacks, every other string only (script counter)
    cone('tred_maul', 'Ezici Isırık', 7, 60, 18, 4.5, 'Attack2', 0.6, { initialCooldown: 8, windup: 1.2, telegraph: true, tankBuster: true, parryable: false, damage: { coef: 4.5, type: 'physical' }, statuses: [{ status: 'asit_yarasi', duration: 8, stacks: 1 }], sfx: 'boss_cast', params: { holdMin: 0.3, holdMax: 0.6 } } as Ab),   // delayed maul: windup 1.2 + hold 0.3 to 0.6
    aoe('tred_tail', 'Kuyruk Savurma', 'self_aoe', 7, 7, 13, 1.0, 2.0, 'physical', 'Attack', 0.5, { telegraph: true, params: { behindOnly: 1, rearArc: 120 } }),   // only starts when a player is in the rear 120 degrees within 8 m
    custom('tred_acid', 'Asit Fırlatma', 11, 6, 1.5, 'Cast', { sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('tred_marked', 'Hedef İşareti', 32, 14, 1.0, 'Cast', { sfx: 'boss_roar', params: { impact: 0.8 } }),
    custom('tred_mindlink', 'Zihin Bağı', 38, 22, 1.0, 'Cast', { sfx: 'shadow_cast', params: { impact: 0.8 } }),
    custom('tred_coalesce', 'Zehir Birikimi', 30, 20, 1.5, 'Enrage', { sfx: 'boss_cast', params: { impact: 1.2 } }),
    custom('tred_leap', 'Sıçrayıp Ezme', 28, 26, 1.2, 'Attack2', { sfx: 'ground_slam', params: { impact: 0.6, radius: 4.5, minRange: 8, maxRange: 28, lockLead: 0.5 } }),
    custom('tred_rush', 'Kovuk Hücumu', 30, 38, 1.2, 'Run', { sfx: 'boss_roar', params: { length: 24, width: 4, speed: 18, wallStun: 3.0 } }),
    custom('tred_consume', 'Tüketme', 999, 9999, 1.2, 'Enrage', { sfx: 'boss_roar' }),
    custom('tred_frenzy', 'Açlık Çılgınlığı', 999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, N), bp('c1', 0.70, [], { yell: 'Lakali\'nin tohumu... benim!', ability: 'tred_consume' }),
    bp('p2', 0.699, N2), bp('c2', 0.40, [], { yell: 'Daha... daha çok!', ability: 'tred_consume' }),
    bp('p3', 0.399, N3), bp('p4', 0.15, N3, { yell: 'AÇIM! AÇIM!', ability: 'tred_frenzy' }),
  ],
  intro: 'Tohum benim! Lakali benim! Hepiniz benim olacaksınız!', death: 'Açlık... dinmedi... ama... kozaları... kıracak...',
  arena: { cx: 248, cz: 210, w: 64, h: 52, homeX: 248, homeZ: 214 } });
```

**Timeline.**

| Ability (id) | Type | Timing | Shape / effect | Damage | Counter | Kit |
|---|---|---|---|---|---|---|
| **Çift Isırık** (`tred_bite`, basic string) | basic string, **optional tank swap** | every 4.5 s (the melee slot), strike 0 windup 0.70, strike 1 follow windup 0.42 | two bites, cone 6 m 100 degrees, re-aimed; **the second bite of every other string** adds 1 Asit Yarası stack (script counter) | coef 1.0 + 1.0 physical | parry the first, or just tank it | `bossString` NEW |
| **Ezici Isırık** (`tred_maul`, **delayed maul**) | **tank buster** | first 8 s, cd 18 s, windup 1.2 s **+ hold 0.30 to 0.60** | cone 7 m 60 degrees, **+1 Asit Yarası stack** (was +2). The cone is drawn at the start of the windup; the jaw stays raised for the hold | coef 4.5 | dodge late, block or defensive. The optional second tank takes the next one | EXISTS (`cone` with `tankBuster`) + hold |
| **Kuyruk Savurma** (`tred_tail`, **rear guard**) | avoidable | cd 13 s, windup 1.0 s, only when someone is in her rear 120 degrees within 8 m | ring r 7 telegraph around her, the tail comes through | coef 2.0 physical, knockback 4 m | do not stand behind her; the DPS who ignore it eat it | EXISTS + position check |
| **Asit Fırlatma** (`tred_acid`, Acid Expulsion) | avoidable | first 6 s, cd 11 s, windup 1.5 s | **3 acid globs** (+1 after each Consumption) at random players, circle r 3.5, aimed with a **movement lead**: `target = pos + velocity * lead`, lead 0.35 s at the start, **+0.25 s per Consumption** done. Each leaves an **Asit Birikintisi** (r 3.5, 14 s, coef 0.3 per second). The pools are left in M+ on every key | coef 2.0 poison | change direction at the last moment, drop the puddles on the edge | `circle` with predictive point + `zone()` EXISTS |
| **Hedef İşareti** (`tred_marked`, Marked Prey + Accelerated Incubation) | add wave / fixate | first 14 s, cd 32 s, windup 1.0 s | a random non-tank is marked 20 s (`isaretli`). **4 Dikenfak Larvası** (summoned, 0 forces, 0.3 x TRASH_HP x partyHp) spawn near her and **fixate the marked player**. Each dies into an **Çürüme Birikintisi** (r 2.6, 14 s) | larva bite coef 0.5, pool 0.3 | the marked runs, the tank **taunts** the larvae (a taunt overrides fixate), kill them in a safe spot, do not drop pools in the group | `spawnAdds`, **fixate NEW** |
| **Zihin Bağı** (`tred_mindlink`, Mind Link) | spread | first 22 s, cd 38 s, windup 1.0 s | **3 players** (2 when the party is under 4) are tethered for 10 s. Each tick (1 s) every linked player takes shadow damage of coef **0.3 x (1 + number of other linked players within 14 m)**: standing together multiplies it. A player more than 30 m from the others is released | coef 0.3 to 0.9 per second | **spread out** past 14 m | `linkPlayers` NEW (S5), VFX `chain_lightning` |
| **Zehir Birikimi** (`tred_coalesce`, Coalescing Poison, M+) | pull and explode | first 20 s, cd 30 s, windup 1.5 s | pulls everyone toward her for 2 s (4.5 m/s), a circle r 15 fills for 5 s, then explodes | coef 3.2 poison | run out the moment the pull ends (about 3 s to cover 15 m) | `bossMsg('boss_pull', ...)` + `circle` EXISTS (same as Kevvas) |
| **Sıçrayıp Ezme** (`tred_leap`, **jump attack**, from the first Consumption on) | avoidable | first 18 s of stage 2, cd 26 s, windup 1.2 s, landing **locked 0.5 s before** | she leaps onto a random non-tank 8 to 28 m away: circle r 4.5, then a **4-line acid cross** (length 10 m, width 2 m, +0.7 s) | coef 2.8 + 1.0 poison | roll the circle, stand on a diagonal; **not during the melee slot of the tank** | NEW `bossLeap` (S16) |
| **Kovuk Hücumu** (`tred_rush`, **charge into the spires**, from the second Consumption on) | avoidable / payoff | first 20 s of stage 3, cd 38 s, windup 1.2 s, direction tracks until 0.6 x windup then locks | a 24 x 4 m line at a random non-tank at 18 m/s. **If she hits a chitin spire or the wall she is stunned and her posture breaks for 3 s** (`bossBreak`, a free x1.25 window with Kritik Vuruş), and the spire cracks (the third hit shatters it) | coef 3.0 physical, knockdown | sidestep, and **stand so that the line ends in a spire**: the DPS payoff of the fight | NEW `bossRush` (S16) |
| **Tüketme** (`tred_consume`, Consumption) | **phase, 70 % and 40 %** | 14 s channel | she retreats to the cocoon and eats it: **raid poison every 2 s (coef 0.5)** and an **anima missile every 1.2 s** at random spots (circle r 2.5, coef 1.6, +1 missile per 5 s). She holds a **Gorging Shield** (absorb = 6 % of her max HP, `shield` status). **Break the shield and the channel is interrupted**: she is staggered 3 s (`c.stagger(3, 1.5, 5, 'KALKAN KIRILDI!')`), no feast, no parasites. **Not broken in 14 s:** she heals 8 %, gains a **feast** (+8 % damage, acid lead +0.25 s), then M+ parasites | | **burst the shield** (everyone hits her, she is not immune), defensives for the missiles. Her posture bar is not used here | `teleport`, `freeze`, `statuses.apply('shield')`, `endMechanicPhase` EXISTS + **`bossShield` NEW** |
| **Asalaklar** (M+ key 7 and up, after an unbroken Consumption) | interrupt check | at the end of Consumption | **3 parasites** on 3 random players, each with a **2.4 s interruptible cast, kick 2**: `ps_parasite_p` Boyun Eğdiren (silence 8 s), `ps_parasite_i` Sersemleten (stun 6 s), `ps_parasite_d` Hükmeden (fear 6 s plus a 50 % max HP shield on the victim). Each parasite also dies to any damage | | kick all three or kill them in 2 s | `spawnAdds` + `CUSTOM` casts EXISTS |
| **Açlık Çılgınlığı** (`tred_frenzy`, below 15 %) | soft enrage | once | +25 % damage, acid cd 7 s, marked cd 22 s, `boss_enrage` VFX | | burn her | EXISTS (`dmgMul`, `cdOverride`) |
| **Son Açlık** (enrage 330 s) | hard enrage | at 330 s | +8 % damage every 10 s | | | EXISTS |

**Melee slot.** Çift Isırık, Ezici Isırık, Kuyruk Savurma, Sıçrayıp Ezme and Kovuk Hücumu share one slot that frees 3.5 s after the last recover, so a bite string never overlaps a maul or a leap; the spell family (acid, marked, mind link, coalesce) runs on its own timers as before. Posture: her bar breaks from parries and heavies (700 x 3 at five players) or from the spire hit; a break locks **Asit Fırlatma and Hedef İşareti for 6 s** (a break is "a free half Consumption of safety"), and opens the 1.5 x window (3.0 s) for a Kritik Vuruş.

**Script outline (`tredova`):**

```ts
init(c)  { c.state = { feast: 0, consume: null, biteN: 0 }; }
tred_bite: resolve(c) { const st = c.state; st.biteN++;                         // the stack lands on the second bite of every OTHER string only
  bossString(c, [ { coef: 1.0, range: 6, arc: 100, windup: 0.70 }, { coef: 1.0, range: 6, arc: 100, windup: 0.42, gap: 0.2, onHit: (p) => { if (st.biteN % 2 === 0) statusPlayer(p, 'asit_yarasi', 8) } } ], { target: tankOf(c) }) }
tred_rush: { resolve(c) { bossRush(c, { target: pickPlayers(c, 1, true)[0], length: 24, width: 4, speed: 18, coef: 3.0, track: 0.6, walls: spireColliders(c), wallStun: 3.0 }); } }
tred_consume: {
  start(c, b) { b.total = b.delay + 14.5; },
  resolve(c) {
    const cocoon = c.gdd(61.5, 56);                     // dais at the south wall
    c.teleport(cocoon.x, cocoon.z - 3); c.freeze(true);
    bossShield(c, 0.06);                                 // e.statuses.apply('shield', 16, { magnitude: e.maxHp * 0.06 }) + estatus broadcast
    c.state.consume = { t: 0, tick: 2, missile: 1.2, broken: false };
    bossFx('consumption_swirl', cocoon.x, cocoon.z, { dur: 14 });
  },
}
update(c, dt) {
  const k = c.state.consume; if (!k) return;
  k.t += dt;
  if (!k.broken && !shieldUp(c)) { k.broken = true; return endConsume(c, true); }       // stagger(3, 1.5, 5), no feast, no parasites
  every(k, 'tick', dt, 2, () => circle(c, a.cx, a.cz, 90, 0.05, 0.5, { type: 'poison', telegraph: false, name: 'Tüketme' }));
  every(k, 'missile', dt, 1.2, () => missiles(c, 1 + Math.floor(k.t / 5)));
  if (k.t >= 14) endConsume(c, false);                                                 // heal 8 %, feast++ (dmgMul *= 1.08, lead += 0.25), parasites in M+ key >= 7
}
```

**Asit Yarası and the tank swap (rewritten).** The first design (+25 % per stack, a stack every 2.6 s, swap at 3 stacks) asked for a swap about every 8 s, which a normal party with one tank cannot do, and it was not in the WoW fight. **Now:** `asit_yarasi` is **+10 % damage taken per stack, max 5, 8 s**, `STATUS_RULES.asit_yarasi = { stack: 'stack', takenMore: 0.10 }`, `maxStacks: 5` (4.4). The bite string stacks only on its second bite of every other string (one stack per about 9 s, so stacks fall off before the next one arrives) and the maul adds **one** stack per 18 s. Typical state: **1 to 2 stacks (+10 to +20 %)**, 3 stacks (+30 %) when the maul lands inside the bite window; the cap of 5 is only reachable with an extra source such as the Necrotic affix. **A swap is an optimisation, not a requirement:** a second tank taunts at 3 or more stacks to reset them, a single tank never has to. A paladin, monk, demonhunter or knight uses the normal defensives; the status is dispellable as a bonus, not as the answer.

**Single-tank survival check (budget arithmetic, to be confirmed by SimBench after CM4/CM7).** Tank intake from the melee slot, per second: bite string 2.0 coef per 4.5 s = 0.44, maul 4.5 per 18 s = 0.25, tail 0 (the tank stands in front), so about **0.69 coef/s x 1.2 average takenMore = 0.83 coef/s**, below the 1.3 coef/s guardian budget of GDD_CREATURES 1.3. Worst moment: 3 stacks, a maul landing on the end of a string: (4.5 + 1.0) x 1.3 = 7.2 coef in about 2.5 s, which needs one defensive or the dodge (Tyrannical x1.15 included: about 8.3 coef). Acceptance rule for the QA / SimBench pass: **a single tank of par gear survives a +10 Tyrannical Tred'ova with one major and two minor defensives, no swap**; if SimBench says otherwise lower the stack rate before touching the stack size.

**Duties.** *Tank:* take the string (or parry the first bite), dodge the delayed maul late or defensive it, **taunt the larvae**, turn her so the charge ends in a spire. *Healer:* Consumption (14 s of raid damage), Mind Link pressure when the group stacks, parasites that stun a healer. *DPS:* **burst the Gorging Shield** every Consumption (there are two, the shield is the whole point), stay out of her rear arc, spread for Mind Link, kick the parasites, kill larvae away from the group, **bait the charge into a spire** for the 3 s break. **Fight length at +10: about 3:40** (Consumption at 70 % and 40 % about 20 s each, a posture break per phase pays back about 10 s). Tyrannical about 4:35.

**Showpiece staging.** Intro camera (`introCam`) tilts up from the cocoon to her rising out of the egg field, the room's crystals pulse. At each Consumption the cocoon glows brighter and loses a layer (the `Open` clip scrubbed to 33 % and 66 %). Each spire hit of the charge cracks it with a dust burst. **On death:** 0.3 x slow motion for 0.8 s, the cocoon splits (`Open` plays), teal-gold anima rain (`ambient_anima_motes` burst) falls over the room, a faint Lakali silhouette rises and fades, `chest_epic` appears at (61.5, 55), the exit portal at (64, 48) lights, 0.6 s later the dungeon completion rules run. Lakali's "thank you" line is a toast: "Lakali: Bilgi, yeniden doğacak."

**Yells:** pull "Tohum benim! Lakali benim! Hepiniz benim olacaksınız!" · Consumption 70 % "Lakali'nin tohumu... benim!" · 40 % "Daha... daha çok!" · 15 % "AÇIM! AÇIM!" · death "Açlık... dinmedi... ama... kozaları... kıracak...".

**Loot** `loot_ps_b3` (final, one extra item): three named items, see 5.4: **Tred'ova'nın Asit Dişi** (weapon), **Lakali'nin Gözyaşı** (amulet), **Kuluçka Zırhı** (chest).

### 5.4 Loot tables and named items (CORE_MECHANICS 15: personal loot, 2 to 3 named items per boss, build-defining)

Every boss drops a **personal chest**: **1 guaranteed item per player** (a 12 % chance of a second) rolled from the boss's own table, 70 % smart loot (main stat and armour type of the spec); the **final boss** adds one extra item. On top, each personal roll has a **named-item chance** (`uniqueChance`): when it fires, one of the boss's three named items drops (class-filtered, equal weights, rarer one at weight 0.5 where marked). Equip slots are `helm shoulders chest gloves legs boots belt amulet ring1 ring2 weapon offhand`: **there is no trinket slot**, so the WoW signature trinkets become legendary rings and amulets (if a trinket slot is added later they move there unchanged). All items `minItemLevel` 66 (Kahramanlık), 70 (Mitik 0) and the key-level item levels of CORE section 4.4 in M+.

```ts
// data/loot.ts additions (items module). uniqueIds / uniqueChance / legendaryMult / extraItems are existing LootTableDef fields.
loot_ps_b1: { focus: ['staff', 'wand', 'tome', 'helm', 'shoulders', 'amulet'], setChance: 0.15, uniqueIds: ['leg_ps_antler_charm', 'leg_ps_soul_splitter', 'leg_ps_wicker_mantle'], uniqueChance: 0.22 },
loot_ps_b2: { focus: ['gloves', 'boots', 'ring', 'dagger', 'belt'], setChance: 0.15, uniqueIds: ['leg_ps_mist_ocarina', 'leg_ps_vulpin_treads', 'leg_ps_player_dagger'], uniqueChance: 0.22 },
loot_ps_b3: { focus: ['chest', 'legs', 'sword1h', 'axe2h', 'staff', 'amulet', 'ring'], setChance: 0.25, extraItems: 1, legendaryMult: 1.5, uniqueIds: ['leg_ps_acid_fang', 'leg_ps_lakali_tear', 'leg_ps_brood_carapace'], uniqueChance: 0.28 },
```

| id | Ad | slot | classes | effect (`special.desc`, TR) | build it defines | source |
|---|---|---|---|---|---|---|
| `leg_ps_antler_charm` | Boynuzlu Bilgenin Tılsımı | amulet | all | "Bir düşmanın duruşunu kırdığında veya büyüsünü kestiğinde 8 sn boyunca +%12 hasar ve +%8 hareket hızı kazanırsın. Yığılmaz. Kritik Vuruş yaptığında süre tazelenir." | the **posture / interrupt melee build**: every parry, break and kick is a damage window | Ingra Malok |
| `leg_ps_soul_splitter` | Ruh Yarıcı Asa | weapon (staff, wand) | mage, necromancer, warlock, evoker (caster specs) | "Hasar veren büyülerin %20 şansla hedefin ruhunu yarar: 1.5 sn sonra %60 gölge hasarlı bir Ruh Yankısı vurur. Yankı bir düşmanı öldürürse 4 m çevreye sıçrar." | the **caster cleave build**: stacks with swarm packs (maze, eggs) | Ingra Malok |
| `leg_ps_wicker_mantle` | Hasır Totem Omuzluğu | shoulders (plate, mail) | knight, paladin, barbarian, demonhunter (tank specs first) | "Başarılı bir savuşturma (parry) yaptığında 6 sn boyunca aldığın hasarı %12 azaltırsın ve bir sonraki vuruşun %50 fazla duruş hasarı verir." | the **parry tank build**: defensive uptime from timing | Ingra Malok |
| `leg_ps_mist_ocarina` | Sis Çağıran'ın Ocarinası (the dungeon's "trinket") | ring | all | "Canın %40'ın altına düştüğünde otomatik olarak Sis Perdesi açar: 4 sn boyunca %30 daha az hasar alırsın. 45 sn bekleme süresi." | the **panic-button build**: lets a squishy spec stay aggressive | Sis Çağıran |
| `leg_ps_vulpin_treads` | Sis Tilkisi Adımları | boots | all | "Her kaçınma (dodge) yuvarlanışında arkanda 3 sn süren bir sis izi bırakırsın: izin içindeki müttefikler %20 hareket hızı kazanır. Kaçınma yenilenmesi %20 hızlanır." | the **dodge-roll mobility build** (melee DPS, kiting casters, Elden-style play) | Sis Çağıran |
| `leg_ps_player_dagger` | Oyuncunun Hançeri | weapon (dagger) | rogue, demonhunter | "Arkadan vuruşların %25 şansla hedefi 'Oyun' ile işaretler (6 sn): işaretli hedef senden aldığı hasarın %10'unu ek gölge hasar olarak geri öder, işaret öldürmede bir sonraki hedefe geçer." | the **backstab-chain build** (a boss is a single target, packs chain it) | Sis Çağıran |
| `leg_ps_acid_fang` | Tred'ova'nın Asit Dişi | weapon (dagger, 1H sword) | rogue, demonhunter, knight, paladin | "Vuruşların %15 şansla hedefe Asit Yarası uygular (+%10 alınan hasar, en çok 5 yığın). 5 yığında patlar: 4 m çevrede %150 zehir hasarı." | the **stack-and-burst melee build**: the same status the boss throws at you | Tred'ova |
| `leg_ps_lakali_tear` | Lakali'nin Gözyaşı | amulet | all | "Her 25 sn'de bir, en düşük canlı müttefikin canını %12 iyileştiren ve ona 6 sn %10 hasar azaltma veren bir Anima Küresi bırakırsın." | the **group-support build** (any role, rare, weight 0.5) | Tred'ova (rare) |
| `leg_ps_brood_carapace` | Kuluçka Zırhı | chest (plate, mail) | knight, paladin, barbarian, demonhunter, monk (tank and melee) | "Aldığın zehir hasarı %30 azalır. Bir düşman seni zehirlediğinde 3 yığına kadar Kitin Kabuğu kazanırsın: her yığın bir sonraki vuruşun %50'sini emer, 20 sn sürer." | the **nature-tank build**: the whole dungeon is poison, a key-pool item | Tred'ova |

The sets of the existing dungeons stay level-60-incompatible; a Season 1 tier set is a separate item package. Item numbers are tuning targets for the items module (GDD_ITEMS_V2 budgets), the effects above are the contract.

### 5.5 Boss-kit coverage (what exists, what is NEW)

| mechanic family | used here by | status |
|---|---|---|
| intermission (immune, freeze, teleport, scripted timeline, `endMechanicPhase`) | Sis Oyunu (g1 to g3), Tüketme (c1, c2), Ingra's embrace (a softer version: not immune, damage reduced) | EXISTS (the `zakhar_ritual` and `azrakel_phylactery` pattern). A shared `intermission()` wrapper is proposed by other season docs, use it when it lands |
| stun window / vulnerability | Droman'ın Gazabı, YAKALANDI, KALKAN KIRILDI | EXISTS (`c.stagger`, `c.vulnerable`) |
| **posture bar and break payoffs** | Kırık Dans (Sis Çağıran), the spire hit (Tred'ova), the broken embrace (Droman), the open bar in every stun window | EXISTS engine (`poise.ts`, `Combat.forcePoiseBreak` from GDD_CREATURES 5.2); the boss-side calls are NEW `bossBreak` (S16) |
| **strings, delayed swings, jump and charge** | Boynuz Biçişi, Pasta Pasta, Çift Isırık, Ezici Isırık, Droman's slam, Sis Dansı, Sıçrayıp Ezme, Kovuk Hücumu | **NEW** `bossString` / `bossLeap` / `bossRush` (S16, boss-side copies of the GDD_CREATURES interpreter) |
| soak | none (Ingra's embrace is a damage check on Droman, not a soak) | not used |
| spread | Zihin Bağı (distance-scaled tether damage) | **NEW** `linkPlayers` |
| marks | Hedef İşareti (a status marker, larvae follow it) | EXISTS (`statusPlayer`) + status NEW |
| stack debuff | `asit_yarasi` (optional swap), `kin_laneti` | EXISTS (`STATUS_RULES.takenMore` + `maxStacks`) + status NEW |
| adds wave | Droman, larvae, clones, Vulpin, parasites | EXISTS (`spawnAdds`) + **fixate NEW** |
| beams and lines | Kaçınma Topu (one 44 x 3.2 m line), Ruh Süpürmesi (3 rotating lines) | EXISTS (`beam`) |
| rotating hazards | none (the sweep is three timed beams, not a persistent rotator) | not used (`rotatingBeams` is proposed by other season docs) |
| pull-in | Zehir Birikimi | EXISTS (`boss_pull`, as Kevvas) |
| breakable boss shield | Gorging Shield | **NEW** `bossShield` / `shieldUp` |
| predictive aim | Asit Fırlatma (`pos + velocity x lead`) | local code in `peri.ts`, `p.velocity` is host-known |
| ground pools | Anima, Asit, Çürüme Birikintisi | EXISTS (`zone()` persist). **Puddle budget:** at most 14 live floor puddles per boss, the oldest is cancelled (`G.hitShapes.cancel`) when the 15th lands |
| interrupt checks | Ruh Oku, Pasta Pasta, the three parasites | stagger-break rule (GDD 0.6) plus `kick` flags, and now the posture break as a second answer |
| enrage | all three (270 / 300 / 330 s) | EXISTS (`BossDef.enrageTimer`, soft enrage by `every` + `dmgMul`) |

---

## 6. MYTHIC+ TUNING

Rules used: `CORE_MECHANICS` section 6 (scaling x1.08 per level up to +10, then x1.10; Fortified trash +20 % HP and +30 % damage, Tyrannical bosses +30 % HP and +15 % damage; death +15 s; +1 / +2 / +3 at 100 / 80 / 60 % of the timer) and `GDD_CONTENT` 5.5 for the affixes. Timer **1680 s**, forces **370**.

### 6.1 Forces

Computed from the pack table of section 4.6 (script-verified).

| section | rooms | packs | forces | cumulative on route A | % of 370 |
|---|---|---|---|---|---|
| Camp | `drust_kampi`, `k_ritual` | p01 to p06 | 100 | 100 | 27.0 % |
| **Boss 1** Ingra | | | 0 | 100 | 27.0 % |
| Kök Salonu | `kok_salonu` | p07, p08 | 31 | 131 | 35.4 % |
| Maze | `m1` to `m4` | p10 to p19 | 152 | 283 | 76.5 % |
| **Boss 2** Sis Çağıran | | | 0 | 283 | 76.5 % |
| Nest approach | `havuz`, `yuva_magarasi` | p20 to p24 | 80 | 363 | 98.1 % |
| Bridge or tunnel | `yuva_koprusu` | p25 | 16 | 379 | 102.4 % |
| Larva pit | `yuva_kuyusu` | p27 to p29 | 46 | 425 | 114.9 % |
| **Boss 3** Tred'ova | | | 0 | 425 | 114.9 % |
| Optional | `mantar_korusu` p09 16, `yan_tunel` p26 8, `peri_halkasi` p30 14 | | 38 | | |

Totals: **463 available (125.1 %)**, 425 required-route, 38 optional. The maze alone is 41 % of the forces, boss 2 arrives at 76 %, so **only about 87 forces (24 %) are left for the nest**, the same shape as WoW (maze 45 %, nest about a third).

| route | description | forces | % | time effect |
|---|---|---|---|---|
| **A, standard** | every required pack, the bridge, no grove | 425 | 114.9 % | par (26:40 at +10) |
| **B, grove and tunnel** | adds `p09` (grove) and the Kudret shrine, replaces the bridge `p25` by the tunnel `p26` | 433 | 117.0 % | +30 s for the grove (+25 % damage for 30 s into maze glade 1), then **-25 s** for the tunnel (no bridge) |
| **C, push** | skips `p06`, `p20`, `p22`, `p25` (take the tunnel without its pack) | 377 | 101.9 % | about **-2:00**, needs stealth or clean CC on the skipped spots and a fearless tank |

The allowed slack in a standard run is 55 forces (425 - 370), so the group can drop one big pack per section. Skipping a boss is impossible, skipping the **eggs** is easy (the eggs only wake inside 6 m), and the **bridge** is the natural skip for any group that fears the Gorger knockback.

### 6.2 Timer math (par group at +10, Fortified week, 5 players, route A)

Par = a group whose gear matches the +10 chest item level (88 per CORE section 4.4) and who pulls two packs at a time. Boss fight lengths come from section 5 (revision 2: Ingra 2:20, Sis Çağıran 2:50, Tred'ova 3:40). Death penalty: +15 s each.

| # | segment | forces | time | clock at end | note |
|---|---|---|---|---|---|
| 0 | countdown, walk to the first pack | | 0:20 | 0:20 | 10 s countdown, barrier on door 1, 20 m of walking |
| 1 | camp (BP1 plus the other pulls) | 100 | 3:40 | 4:00 | p01, p02 to p05, p04, p06 |
| 2 | Ingra Malok | | 2:30 | 6:30 | 0:10 walk, **2:20 fight** |
| 3 | Kök Salonu (the grand staircase is climbed once) | 31 | 1:10 | 7:40 | |
| 4 | the maze, glades 1 to 4 | 152 | 6:20 | 14:00 | includes reading three sigil walls (about 8 s each) and on average one wrong pick (30 s) |
| 5 | Sis Çağıran | | 2:55 | 16:55 | 0:05 walk, **2:50 fight** |
| 6 | ledge, waterfall stairs, pool, cave (BP3) | 80 | 3:45 | 20:40 | the 20 m of stairs (8 s, or the hop), the egg pull, three reavers |
| 7 | bridge or tunnel, larva pit | 62 | 2:15 | 22:55 | |
| 8 | Tred'ova | | 3:45 | **26:40** | 0:05 walk, **3:40 fight** |

**26:40 of 28:00 = 95.2 %**: timed, +1 (revision 2 added 40 s of boss and stair time: the margin shrank from 2:00 to 1:20, and the design targets below moved with it). Thresholds: **+2 needs 22:24** (4:16 faster than par, which route C, the tunnel and a clean maze give, or higher gear), **+3 needs 16:48** (boss 2 dead by then, only for keys far below the group's gear, like the WoW +3). Design targets by key level (same par gear rule): +2 about 16:00 (+3), +5 about 20:00 (+2), +7 about 23:00 (+2), +10 about **26:40** (+1), +12 about 29:00 (timed only on route C), +15 about 33:30 (a push key for the best gear). If the SimBench pass shows 26:40 is too tight, lengthen the timer to 29:00 (WoW's own timer is 30:00) before shortening anything in section 5.

**Deaths and the release point (S9, rewritten).** `DungeonScene.ts` (lines 820 to 824) sends Mythic+ players to **the dungeon start** ("Mythic+ always respawns at the dungeon start, GDD_CONTENT 0.7") and, separately, places a Diriliş Taşı **3.4 m past every `boss_exit` door** (around line 878), tracked in `this.checkpoint`. **This document overrides GDD_CONTENT 0.7 for the whole Season 1 pool** (it is listed in the risks of 8.4): in a Mythic+ key the release point is `this.checkpoint` (the latest stone) instead of `built.start`. The code change is one line. The only extra data is the third seed, `extras.checkpoints: [pt(63.5, 38.5)]`, because the nest has no boss behind it. The three stones and what a death costs from each:

| stone | where | covers deaths in | corpse run to the next fight | cost of one death (15 s + run) |
|---|---|---|---|---|
| start (no stone yet) | the hollow, (4, 54) | the camp, Ingra | about 75 m to the camp, 111 m to Ingra: 11 to 16 s | 26 to 31 s |
| after boss 1 | Kök landing, about (21.5, 28.2), y 2.4 | Kök Salonu, the maze, boss 2 | 45 to 190 m: 6 to 27 s | 21 to 42 s |
| after boss 2 | the ledge, about (63.5, 14.5), y 6.4 | the stairs, the pool, the cave | 25 to 150 m, down the Şelale Merdiveni: 4 to 21 s | 19 to 36 s |
| in the nest (third seed) | (63.5, 38.5), y 1.2 | the bridge, the larva pit, Tred'ova | 20 to 55 m: 3 to 8 s | 18 to 23 s |

**If the override is refused** (the rule of 0.7 stays): every death releases at the start. From the maze that is about 310 m (45 s) plus the 15 s penalty, **about 60 s per death**, and from Tred'ova about 545 m (78 s): **about 93 s**. With one maze death the par run moves from 26:40 to 27:40 (still timed, +1) and a second death depletes it; the dungeon is then 1 to 1.5 minutes harsher per death and the +2 and +3 thresholds become unreachable after any death. That is why the override is requested.

### 6.3 Dangerous pulls

| pack | why it kills | answer |
|---|---|---|
| `ps_p03` (camp) | two Harvesters heal the pack (Öz Biçme) and two Soulcleavers stack Ruh Yarığı | assign two kicks before the pull, dispel Ruh Yarığı at once (or heal the 6 s DoT), pull to the west edge so p02 stays asleep |
| BP1 `p02 + p03 + p05` | 12 mobs, the Spiteclaw deaths stack Kin Laneti up to 3 (+18 % damage taken) | dispel the curse between kills or let it decay (10 s), AoE the swarm last |
| `ps_p04` (camp exit) | two Dal Kıran with posture bars: Dikenli Patlama slow, the delayed Dal Savurma finisher knocks players back 4 m | one tank per elite, wait for the delayed swing, a posture break locks the burst for 6 s |
| `ps_p06` (corridor) | two Harvesters in an 8 m wide flat corridor at the boss door, they kite back into the walls | pull from the corridor mouth (the stair end), not from the camp side |
| `ps_p12` (Sis Ana) | an interrupt-or-lose healer: Işık Havuzları outheals the party, Zırh Parçalama punishes a tank who leaves melee, the delayed Üçlü Pençe finisher knocks back 4 m | kick her channel or break her posture (300 x party factor), tank stays in melee |
| `ps_p13`, `ps_p16` (maze corners) | the Sis Muhafızı's Tepme Çılgınlığı is a circle r 4 with no safe spot inside: it pushes players toward the choice-wall strips | fight at least 8 m from a wall, roll the circle edge |
| `ps_p14` (maze, 5 of 8 types) | one Anima Enjeksiyonu per cast (dispel in 6 s, or the host walks 4 m away), Çalı Zırhı roots the nearest player, Guardians block frontally, Diken Yağmuru fills the glade | pull to the middle of the glade, away from every doorway, never fight inside 8 m of a wall, kick the Shaper first |
| `ps_p11`, `ps_p18` (Villager) | Şaşırtan Polen disorients players into the trap strips of the choice wall (teleport back), Dev Çakma is a delayed 2.2 overhead | tank turns him toward the glade middle, break his posture to lock both |
| `ps_p15`, `ps_p19` | a single elite with a 3-hit poison string and a perilous grab (Gece Çiçeği), the patrol enrages as its friends die | dodge the catch (no parry), burst the elite, kill the patrol from the front |
| `ps_p21`, `p23`, `p27`, `p29` (Geyikboynuz) | two heals and a shield on a 25 % buff, double kicks on a double elite, the rush punishes a loose group | lock down both heals (a posture break locks both for 6 s), sidestep the rush into a rib |
| `ps_p25` (bridge) | the Gorger's 6 m knockback into the **chasm (a 25 % fall, about 6 s lost)** plus larva pools in a 4 m lane | take the tunnel when the week is Sanguine or Storming, otherwise interrupt every Asit Damlası; never stand between a Gorger and a void column |
| `ps_p22`, `p28` (eggs) | 8 larvae each, wake at 6 m, 8 pools on death, Bursting stacks | pull from range, fight on open floor, AoE in one go |
| BP3 `p22 + p23 + p24` | 17 mobs, three Reavers dive in mid-pull | pre-pop the **Rüzgar shrine** at Peri Halkası (next to the cave) |

### 6.4 Affix interactions

| affix | this dungeon |
|---|---|
| **Tahkimli** (trash +20 % HP, +30 % damage) | the maze and the nest are trash-heavy: 41 % and 33 % of the forces. The Staghorn pair (`p29`) and the BP packs are the hard checks. Kicks matter most |
| **Zorba** (bosses +30 % HP, +15 % damage) | Ingra's Death Shroud ticks longer (more cycles), Sis Çağıran's Penalizing Burst scales for longer (about 2 extra casts), Tred'ova's 330 s enrage is the real timer. Use `Zorba` weeks to practise the Consumption shield break and the charge into a spire |
| **Güçlenen** (Bolstering) | the Spiteclaw swarm and the larvae are swarm role: the horde rule makes only every 3rd swarm death count. Kill the elites of a pack in one phase |
| **Öfkeli** (Raging) | guardians already enrage on ally deaths, Raging stacks with `Yas Öfkesi`: kill them last and together |
| **Kan Dökücü** (Sanguine) | pools on the 4 m bridge are lethal: use the tunnel. The Sis Ana healing pool and a Sanguine pool in the same spot make her unkillable |
| **Patlayan** (Bursting) | egg and swarm packs are the worst case: 8 larvae die at once. Fight eggs from range, let the horde rule limit the stacks |
| **İlham Veren** (Inspiring) | every 4th pack gets an inspiring unit: if it is a Harvester, Tender, Shaper or Staghorn the **kick is gone**, so that mob dies first. Maze packs have 2 healers or casters, plan the swap |
| **Volkanik** (Volcanic) | punishes ranged players standing back: in the maze glades (32 x 44 m) stay inside 6 m of an enemy. On the bridge the plume plus the chasm is dangerous |
| **Sarsıntılı** (Quaking) | interrupts the players' casts: do not stack it with a kick on the same Harvester |
| **Patlayıcı Küre** (Explosive) | the mist hides orbs in the maze (the maze fog is now 7 to 30 m with the mist carried by the veil props, so an orb is readable at 20 m), call them out. Orbs near eggs are easy to miss |
| **Nekrotik** (Necrotic) | Dal Kıran, Ruh Yarıcı and Gece Çiçeği are melee, the tank stacks it fast; Tred'ova's `asit_yarasi` is now a light stack debuff, so the two together are fine for a single tank, and a second tank is only needed for the 5 stacks of a long Necrotic run |
| **Kin Dolu** (Spiteful) | swarm deaths spawn shades that run at 5.6 m/s: bad on the bridge, ok in the open glades |
| **Fırtınalı** (Storming) | tornadoes on the bridge push players into the chasm; avoid the bridge route |
| **Ağır Yara** (Grievous) | Ingra's Death Shroud keeps everyone under 90 % for a full cycle, the healer needs the break to be fast; Consumption is a 14 s chip window |
| **Efsunlu Yarık** (seasonal, key 10 and up) | the **8** rift spots (3.6) are corners and edges of rooms away from the pull lines, never in a boss arena, on a stair or in a choice lane. Guardian cycle offset by the dungeon index. A guardian that was not killed dives into the nearest pack and **Efsunlu** makes it +30 % HP, so the maze is where it hurts |
| **Kibirli** (seasonal, CORE section 6, not in `AffixId` yet) | see 6.5 |
| **Kadim Sis** (seasonal, GDD_V2 8.6, season 3: a fog far plane of 14 m every 40 s) | **ignore, season 3** (this document is the Season 1 pool). If it is ever pooled with this map: it stacks with the maze's already short sight lines, the Season 3 swap list should skip `peri_sisleri` or the maze fog should lift while Kadim Sis is up. The maze base fog is 7 to 30 m for exactly this reason |

### 6.5 Kibirli, rift spots, Font of Power, shrines

* **Kibirli** (CM7): every 20 % of the forces (74 / 148 / 222 / 296 of 370) a **Kibir Tecessümü** (elite, 4 x trash HP) spawns; killing it gives the party +10 % damage and +10 % movement speed for 60 s. It uses the same spawn rule as the rift guardian (**the nearest unused `riftSpot` that is at least 15 m from the party centroid, outside boss arenas**), so `extras.riftSpots` double as the Kibir spots, same as the other season dungeons. **At key 10 and above both seasonal affixes are on (4 rifts and 4 Kibir spawns), and `Affixes.ts` (line 262 and 1198 to 1235) keeps a single `riftSpotsUsed` set that returns no spot when all are taken, so the last events of the old 6-spot table found nothing and were silently skipped.** Two fixes, both applied: (1) **8 spots** (3.6) instead of 6; (2) CM7 keeps **a separate used-set for Kibirli** and, when no spot is free for either system, **reuses the oldest used spot** instead of skipping. On route A the four Kibirli thresholds land on **p04 (camp, spot S1 (26.5, 47.5))**, **p11 (glade 1, spot S3 (17, 19))**, **p14 (glade 3, spot S5 (37.5, 12))** and **p21 (nest, spot S7 (70.5, 25.5), the nearest spot at least 15 m away)**: all in rooms where there is space to fight it. The glade spots sit in corners, at least 13 m from the pack centres and outside the choice lanes, so the party is never forced into a doorway strip and the Tecessümü never pulls a sleeping pack for free; **the glade-2 spot (S4, 29.5, 20) is 22 m from p12 and p13** (the old (25.5, 18.5) was labelled glade 1, but m1 is x 16 to 23 so it lay in glade 2's west lane, 16 m from the Sis Ana pack).
* **Kehanet Taşı** at **(6.5, 51.5)** in the start hollow, 3 tiles north of the start (4, 54), on the 0.4 m font dais. Flow: key owner interacts, ready check (15 s online), enemies spawn with deterministic ids, `keystone_insert` VFX, the 10 s countdown, the barrier on door 1 (`StartBarrier`) lifts with `mplus_start`.
* **Shrines (2, fixed types, one use per run, 30 s):** **Kudret Sunağı** (`shrine_power`, +25 % damage) as a **red-green mushroom ring in the Mantar Korusu** at (10.5, 24.5) on the 4.8 m mound: optional (route B only), about 7 s of walking from the first maze pulls, so the 30 s cover the first two maze packs. **Rüzgar Sunağı** (`shrine_haste`, +25 % move and attack speed) at **Peri Halkası** (74.5, 28) on the knoll: a short detour at the east end of the cave, it covers BP3.
* **Chests:** wood chest in the grove, gold chest in Peri Halkası (gold and a Can Küresi in M+, an item in M0). End-of-run `chest_epic` at (61.5, 55).
* **M+ only mechanics:** Weakened Resolve and İtici Görünüm (Ingra), Zehir Birikimi (Tred'ova), the **maze difficulty step** (3 differing traits at +4 and below, 1 above), **Asalaklar** (Tred'ova, key 7 and up), Çürük pools left by acid on every key, the Guessing Game wrong-pick cap and Hay Aksi step (key 6), the Panzehir İksiri vendor.

---

## 7. ENTRANCE

**Zone:** **Kadim Diyar** (`kadim_diyar`, roadmap map 3, levels 45 to 60, `GDD_OPENWORLD` section 1; not designed yet, so this section is a proposal for its layout). Entrances are **spread across the world, not in one hub**. This one is in the **north-west of Kadim Diyar**, the "Gümüş Orman" region (`kd_gumus_orman`). Other season dungeons already placed by their own designs: Kefaret Salonları (east third of Kadim Diyar), Leş Uyanışı (Gökkubbe Yaylası, Kadim Diyar), Yankı Ağı (a sinkhole in Karakır Bozkırı), Yıldız Divanı (Kadim Diyar, fallback Karakır). Until Kadim Diyar exists, the key portal in **Kadim Kapılar Salonu** (Kuzgunkale, GDD_CONTENT 5.3) reaches Peri Sisleri like the other dungeons.

**Terrain type: ancient twilight forest.** Rolling hills of old-growth broadleaf trees (tree pack `tree17`, `tree21`, `tree14`, `tree02`, 8 m, scale 1.4 to 2.0, dense), silver-white birches near the gate (`tree35`), pools of ground mist in the valleys, glowing moss, narrow deer paths (`ground_path*` pieces of the Kenney nature kit, x4). Ground splat: `tt3-terrain-*` greens (grass), `tt2-dirt-*` (path), `tt2-stone-*` (cobble near the gate), dark patch `tt1-grass-*` dark, ground tint `0x7aa090`. Region theme: `fogColor 0x8fa8a8, fogNear 14, fogFar 70, hemiSky 0x9ab8c8, hemiGround 0x203028, hemiIntensity 1.1, sunColor 0xc8d8e8, sunIntensity 0.6, skyImage '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-14.jpg' (green aurora), music 'dungeon_grove' (fallback 'world_marsh'), ambientVfx 'ambient_anima_motes', ambientColor 0x60ffd8`.

**The gate: "Meşe Meclisi Kapısı".** The NEW prop **`peri_kapisi`** (14 x 11 x 6 m): two living oak trunks of 8 m girth whose crowns lock overhead into a root vault, carved with glowing teal glyph bands, hanging fae lanterns on chains, a mist portal surface in the opening (the `mplus_portal` recipe, `portal_surface` UV spin, `enter_trigger`). Set dressing around it, the **story in one view: the left half corrupted, the right half pristine** (the same split as the loading screen):

* left (Drust): `gp('tree_dead')` x4, `hw('post_skull')` x6, two `peri_wicker_totem`, `gp('brazier')` with violet light, bone piles, the ground turning purple-brown, two Drust sentries as decor NPC statues (`CHAR('Rogue_Hooded')` tint `0x5a4452`, `pose: 'Blocking'`);
* right (Peri): a **fairy ring** of 12 `kn('mushroom_redGroup')` (scale 12, red emissive) around the approach, 6 standing stones `kn('stone_tallB')` with `peri_sigil_*` glow, two moss-covered `gp('statue_hooded')` guardians (tint `0x8aa090`, opacity 0.9), `peri_fae_lantern` posts every 6 m on the path (4 pairs);
* approach: a 40 m cobbled switchback path from the Gümüş Orman waypoint stone (`gp('waypoint_stone')`, 40 m before the gate), a small watch camp "Meşe Nöbetçileri" with a `campfire`, the **same `Portal` interactable and difficulty panel** as every world entrance (all difficulties, Mitik+ greyed unless someone holds the key), and an ambient owl and cricket bed.

```ts
const ENT_PERI: EntranceDef = {
  id: 'ent_peri_sisleri', name: 'Peri Sisleri Girişi', dungeonId: 'peri_sisleri',
  pos: [34, 30] /* tile on the Kadim Diyar map, NW quadrant, proposal */, facing: 90, minLevel: 60,
  regionId: 'kd_gumus_orman', look: 'grove' /* NEW look, S12 */,
};
```

`EntranceDef.look` gets the new member `'grove'` (S12), the other season dungeons add their own looks (`cathedral`, ...). The gate and the camp are authored once in `data/world/` for Kadim Diyar when the map is built, the dungeon itself does not depend on them.

---

## 8. Implementation packages (Haiku) and shared NEW primitives

Work split follows the project policy: Haiku writes the code from these tables, a Sonnet pass reviews every block's diff, at most 5 agents at once, no per-agent browser tests, one Haiku QA pass at the end. Package ids are `PS-*`, shared primitives `S*`. Conventions for every package (paste into the agent prompt): end with `npx tsc --noEmit` = 0 errors in your files; Turkish UI strings; never throw from a frame loop, degrade with `console.warn` once; touch only the files listed; never change an existing exported signature (add optional fields and new exports); `src/types/*` is append-only; numbers come from this document; **`node tools/content-check.mjs` must end with 0 errors for this dungeon before the QA pass starts**.

### 8.1 Shared NEW primitives (build once, the other season dungeons reuse them)

"Generic" = other season dungeon docs list the same or an overlapping primitive and the build should be one shared package. "Fallback" is what keeps Peri Sisleri buildable if a primitive is late. **S14 and S15 are specified by other documents** (`docs/ENGINE_VERTICALITY.md` packages V1 to V13, `docs/GDD_CREATURES.md` waves 1 to 3); this document is a consumer and lists what it needs from them.

| id | Primitive | Spec (what Haiku builds) | Used here for | Fallback if late |
|---|---|---|---|---|
| **S1** (generic) | Enemy kit extraction | Move the local helpers of `src/data/enemies.ts` (`add`, `boss`, `def`, `derive`, `bp`, `custom`, `cone`, `proj`, `aoe`, `line`, `heal`, `buff`, `passive`, `onDeath`, `charge`, `summonAb`, `poison`, `bleed`, `burn`, `chill`, `A_*` anim sets, `R_*` resists, `KNIGHT_HIDE`, `ROGUE_HIDE`, `mageHide`, model url helpers, `NOOP`, `MECH`) into `src/data/enemyKit.ts` and export them; `enemies.ts` imports them (no behaviour change). Per-dungeon files `src/data/enemies/<id>.ts` register through the same `ENEMIES` / `BOSSES` maps. `BossSpec` gets an optional `introCam` that `boss()` forwards, and forwards `poise` and `onBreak`. | all defs of section 4 and 5 in `enemies/peri_sisleri.ts` | append the defs at the end of `enemies.ts` (a 1500-line file, merge conflicts with the other dungeons) |
| **S2** (generic) | Dungeon art kit v2 | (a) `WallStyle` += `'grove'`, `'gorm'`, `FloorStyle` += `'moss'`, `'gorm'` with entries in `WALL_STYLES`, `FLOORS`, `DECOR` of `DungeonBuilder.ts` (values in 2.2; `gorm` floor uses the `cracks` code of `lava_rock` with a green emissive colour parameter). (b) **`RoomDef.dress`**: `{ models: string[]; every: number; scale: [number, number]; sides?: Side[]; inset?: number; y?: number; tint?: number; collide?: boolean; maxPerRoom?: number; seed?: string }`, a builder pass `placeWallDress()` after `placeProps()` that walks the room's `wallSlots()`, skips door gaps (`isAvoidedDoor`), places instanced props (`batcher.add`) every `every` metres with random scale, at most `maxPerRoom` (default 60). (c) `DungeonTheme.skyImage?` using `OutdoorScenery.buildSky`, cross-faded with the per-room fog override. (d) `kit.ts` `spiralPack(id, roomId, cx, cz, enemyIds[], extra)` (spiral of 4.6, sums `forces` from `ENEMIES`, `extra.formation: 'line'` lays members along z for the bridge pack p25). (e) `EntranceDef.look` and `MusicId` open to new members. | the whole look of the dungeon | no dress pass: author props by hand with `p.wall` / `p.row` (a lot more prop lines); no sky: fog colour only |
| **S3** (generic) | Statuses | Append the 8 ids of 4.4 to `StatusId`, `STATUSES`, `STATUS_RULES`. **`kin_laneti` and `asit_yarasi` use `STATUS_RULES[id] = { stack: 'stack', takenMore: v }` plus `maxStacks` on the `StatusDef` (3 and 5), never `stats.damageReductionPct`** (it is clamped to `[0, 0.9]` for players in `Combat.ts` 1510, so a negative value would do nothing). Add **`STATUS_RULES[id].onExpire?: { shape: 'circle'; radius: number; coef: number; type: DamageType }`**: when the status runs out (not when removed by a dispel) the owner's machine fires a `HitShape` at the owner (coef x the source's base damage); `anima_enjeksiyon` uses radius 3. Add the **`disorient`** hook in `PlayerController` (input vector rotated by a random angle every 0.4 s, attacks unaffected). | `anima_enjeksiyon`, `disorient`, `karanlik_ortusu`, `kin_laneti`, `asit_yarasi`, ... | `anima_enjeksiyon` as a plain DoT, `disorient` as `fear` |
| **S4** (generic) | Must-answer flags | `EnemyAbility.kick` already exists; add the **nameplate and cast-bar icon** for `kick: 2 / 1` and for abilities carrying `params.dispel: 1` (a green dispel mark on the debuff of the target), and the roadmap's kick / dispel rotation helper. Pure UI. | every `kick` and `dispel` in section 4 | none needed, the data alone works |
| **S5** (generic) | Boss kit additions (`ai/bosses/kit.ts`, `BossController`) | **`bossShield(c, pct)`** + **`shieldUp(c)`** (apply the `shield` status on the boss with `magnitude = maxHp * pct`, broadcast `estatus`, `shieldUp` reads `e.statuses.has('shield')`). **`linkPlayers(c, pids, { r, coefBase, tick, dur, release })`** (the tether tick of 5.3, `chain_lightning` between neighbours). **`fixate`**: `spawnAdds(defId, n, { fixate: pid })` sets `Enemy.fixateId`, `EnemyAI` target choice honours it over threat unless the enemy is taunted. **`clearPlayerStatus(p, id)`** (sends `pstatus` with duration 0 to the owning peer). **`isTank(p)` must use the spec role** (`monk_brewmaster`, `paladin_protection`, `necromancer_bone`, `demonhunter_vengeance`, `knight_protector`, `barbarian_warlord`), today it is `classId === 'knight'`, which breaks every "random non-tank" pick of this document. | Tred'ova, Ingra, Sis Çağıran | write the four helpers inline in `peri.ts`; `isTank` is a blocker, fix it first |
| **S6** | Sigil puzzle and choice doorways | `types/dungeons.ts`: `MazeDef` (3.7). `src/systems/SigilPuzzle.ts`: `rollSigils(rng, keyLevel)` returns `{ codes: string[4], odd: 0..3, common: string }`, `MazePuzzle` (host: plan, trap strips every 0.1 s, `maze_trap`, teleport back, 5 s cooldown; clients: spawn the 12 sigil objects with `spawnStaticObject` at `groundY + 3.0`). Scene hook in `DungeonScene` that builds it when `def.extras.maze` exists. | maze and Guessing Game | no maze: remove the traps, keep the four doorways open (the dungeon is still playable, just easier) |
| **S7** (generic) | Channel gate | `entities/interactables/ChannelGate.ts`: hold F for `channelSec` within 3.5 m, damage cancels, on success plays the prop `Open` clip, `BuiltProp.hide()`, toast, and calls the new `EnemyDirector.alertNear(x, z, r)`. `PropPlacement.tag` += `'channelgate'`. | Kök Kapısı A and B | the gates simply do not exist (the grove and the tunnel are open from the start) |
| **S8** | Peri trash handlers | `ai/abilities.ts`: aliases `PASSIVES.ps_boughbreaker_thrash = PASSIVES.forge_demon_rage` and `PASSIVES.ps_guardian_grief = PASSIVES.cult_acolyte_fanatic`; new `CUSTOM.ps_harvester_harvest` and `CUSTOM.ps_matriarch_radiance` (a channel that heals the caster and allies in `params.radius`, `params.tick`, `params.healPct` per tick); **`CUSTOM.ps_shaper_coat`** (20 % absorb on self and Sis allies within 6 m plus a 2 s `root` on the nearest player); `CUSTOM.ps_stalker_pounce` (blink behind a random player then hit, copy of `cult_assassin_smoke`'s `end`); `PASSIVES.ps_villager_befriend` (4.5); `heal_ally` accepts `params.all: 1` (heal every ally in `radius`); `CUSTOM.droman_tears` (5.1); parasite casts `ps_parasite_p / i / d` (5.3) | the trash and the add behaviours | the standard abilities without the special behaviour (heals become single target, befriend becomes a normal death, the Shaper's coat becomes a plain absorb) |
| **S9** (generic) | **M+ release at the latest checkpoint (one line)** | `DungeonScene.ts` lines 820 to 824: in the `player:releaseRequested` handler, the Mythic+ branch returns `{ x: this.built.start.x, ... }`; **change it to `this.checkpoint`** (the stone already tracked at line 85 and updated at 519, and already spawned just past each `boss_exit` door at around line 878). **This overrides GDD_CONTENT 0.7** (see 6.2 and risk 9 of 8.4). The only data left is `DungeonDef.extras.checkpoints?: [number, number][]` for seeds that have no boss behind them (here one, the nest seed at (63.5, 38.5), a `peri_anima_seed` with `tag: 'waypoint'` that sets `this.checkpoint` on first touch). The death penalty (+15 s) stays. | the 10 s corpse run | M+ keeps releasing at the start (6.2 gives the harsher numbers) |
| **S10** (generic) | Season pool registry | `data/dungeons/index.ts`: `MPLUS_POOL: string[]` (the 8 season dungeon ids, empty until they exist, falls back to `DUNGEON_IDS`) and `MythicPlus.dungeonPool()` uses it; the old four are levelling dungeons and Mitik 0 only. `Affixes` guardian-type offset keeps using the pool index. | the keystone can be this dungeon | `DUNGEON_IDS.push` as the dev pages do |
| **S11** | VFX, audio | Append the 7 VFX ids of 2.9 to `VFX_IDS` with the stated aliases in `vfx/aliases.ts`. **`src/types/audio.ts`: `MUSIC_IDS` += `'dungeon_grove'`** (`contentCheck.ts` line 425 raises an **error** for an id that is not in `MUSIC_IDS`; line 427 only warns that it is not one of `dungeon_crypt / fire / frost / shadow`, so add `'dungeon_grove'` to that list too), mapped to an existing track (`world_marsh`) in the audio manifest; the ambience beds `amb_grove_night`, `amb_drust_drums`, `amb_mist_hiss`, `amb_nest_wet`, `amb_hall_wind`, `amb_chain_loop` as aliases of existing loops in `audio/aliases.ts` | art direction, 2.11 | aliases only |
| **S12** (generic) | Entrance look | `EntranceDef.look` += `'grove'`; a recipe `peri_gate` in the world scenery that builds the gate of section 7 from `peri_kapisi`. | entrance | the Kadim Kapılar Salonu portal |
| **S13** (generic) | Dormant `egg` kind | `PackWatch` / builder: when a `dormant.kind: 'egg'` pack wakes, swap the `wake` prop for a broken-shell variant and spawn `add_spawn` with a 0.3 s camera shake. | gorm eggs | the wake prop of the bone-pile behaviour |
| **S14** (generic, **external: ENGINE_VERTICALITY V1 to V13**) | Dungeon heightfield content hooks | Consumed as specified there: `DungeonDef.vertical`, `lifts`; `RoomDef.floorY / ceiling / heightAreas / slopes / tiers / openAir`; `ZoneDef.fall / depth`; `PropPlacement.absY / hang`; the `FallHandler` (-25 % non-lethal fall, `lethal: false`); the validator E1 to E6 in `tools/content-check.mjs`; the kit helpers `tall()`, `plateau()`, `stairs()`, `ramp()`. This dungeon is the first season consumer after the `dev_height` demo room set. | everything in 3.1b | **flat build**: `vertical` unset, the stair strips become flat floors (the rooms keep their rects, nothing else depends on y), the chasm columns go back to the old `blocked` hazard pit (`coef 1.5 / 0.5 s`), tiers are skipped. The dungeon is playable and 3.1b becomes art-only |
| **S15** (generic, **external: GDD_CREATURES waves 1 to 3**) | Creature move kit | `src/data/creatures/moves.ts` (`W`, `FW`, `strike`, `string`, `delayed`, `jumpSlam`, `rush`, `grab`, `marks`, `enrageOf`, `breakOf`), `EnemyAbility.move`, `EnemyDef.onBreak / enrage`, `EnemyAiHints.role2 / frontBlock`, `src/ai/moves.ts` interpreter, poise sync on guests, `Combat.forcePoiseBreak`, the windup floor | all trash strings, delayed swings, the Staghorn rush, the Nightblossom grab, posture `onBreak` costs | each `string` becomes its first strike, `delayed` and `rush` become plain `cone` / `charge`, `breakOf` is dropped (the elites still have poise from the rank defaults) |
| **S16** (generic) | Boss Elden kit (boss-side copies of the S15 interpreter, `ai/bosses/kit.ts`) | `bossString(c, steps, { target, hold?, cancelOnBreak? })` (host timeline: strike 0 with windup and optional hold, each follow-up re-aims at the live target and spawns its own `wedge` shape; a poise break aborts), `bossLeap(c, { target, radius, windup, lockLead, coef, after? })` (landing circle locked 0.5 s before landing, an optional cross of lines at +0.7 s), `bossRush(c, { target, length, width, speed, coef, track, walls, wallStun })` (a `dashLine` that reads wall hits from `nav` and the spire colliders and calls `bossBreak`), `bossBreak(c, seconds)` (`Combat.forcePoiseBreak`), `bossPoise(c)` (fill 0..1 for the script), hold support on `circle/beam/wedge` (`delay + hold`, decided on the host, replicated as is). | Boynuz Biçişi, Kalkan ve Ezme, Pasta Pasta, Sis Dansı, Çift Isırık, Ezici Isırık delay, Sıçrayıp Ezme, Kovuk Hücumu | the string becomes one cone with the summed coefficient, the leap a ground circle at a random player, the rush a `dashLine` with no wall stun |
| **S17** (generic) | Cleanse consumable | item `potion_panzehir` (Panzehir İksiri): cleanses 1 debuff (`cleanse: 1`), cooldown 60 s shared with potions, vendor at the Meşe Nöbetçileri camp and at the Kehanet Taşı vendor; Turkish tooltip. Reused by every season dungeon with a dispel check. | the no-dispeller floor of 4.7 | none needed (the other no-dispel answers of 4.7 stand alone) |

### 8.2 Packages for Haiku

| Package | Files | Work | Depends on | Done when |
|---|---|---|---|---|
| **PS-A1** props | `tools/blender/props/props_peri.py` (+ `manifest.json`, regenerate `docs/assets/generated-props.md`, preview) | **the 20 prop rows of 2.7** (`peri_kapisi` ... `peri_glow_shroom` plus the 6 new: `peri_palisade`, `peri_watchtower`, `peri_root_chandelier`, `peri_stag_statue`, `peri_antler_arch`, `peri_fae_banner`), `psx_lib` style, under 700 tris each (gate under 1500), under 60 KB each, origin at ground, clips `Open` on the gate, root gate and cocoon | none | GLBs in `public/assets/models/gen/props/`; sizes within 5 % of 2.7; emissive tiles only on glowing parts |
| **PS-A2** boss model | `tools/blender/bosses/boss_tredova.py` (+ `gen_bosses.py` list) | the Tred'ova model of 2.7, 9 clips, `fx_mouth`, `fx_sac_L`, `fx_sac_R`, under 1400 tris, under 300 KB | none | `gen/bosses/tredova.glb`; fallback is the centipede |
| **PS-D1** enemy defs | `src/data/enemies/peri_sisleri.ts` | **the 14 trash defs, `ps_matriarch`** (4.3), the adds of 4.2 (`ps_larva`, `ps_vulpin`, `ps_droman`, the 8 clones in a loop, the 3 parasites, `ps_kibir`), the three `boss()` entries of 5.1 to 5.3 with phases and poise | S1, S3, S15 | every id of this doc resolves in `getEnemyDef`; `contentCheck` shows 463 / 425 / 38 forces |
| **PS-D2** dungeon data | `src/data/dungeons/peri_sisleri.ts`, `src/data/dungeons/index.ts`, **`src/dev/contentRoster.ts`** | `ROOMS` (3.1) **with the heights of 3.1b (`vertical`, `floorY`, `ceiling`, `openAir`, `heightAreas`, `slopes`, `tiers`)**, `DOORS` (3.3), `PACKS` with `spiralPack` (4.6), `PACK_EXTRA` (dormant, patrol, optional), `BOSSES` (3.6), `THEME` (2.3), `ROOM_EXTRA` (fog, light colour, zones of 3.5, `dress` per room), `EXTRAS` (3.6), register in `DUNGEONS` and `MPLUS_POOL`. **`contentRoster.ts`: append `boss_ingra_malok`, `boss_sis_cagiran`, `boss_tredova` to `GDD_BOSSES` (without it `contentCheck.ts` line 418 rejects all three bosses), append the summon-only ids (`ps_larva`, `ps_vulpin`, `ps_droman`, `ps_mist_clone_*` x8, `ps_parasite_p / i / d`, `ps_kibir`) to `GDD_SUMMONS`, and add the trash ids with their forces to `GDD_ROSTER` (the fallback that `enemyForces()` uses for unknown ids on the standalone content page)** | S2, S6 (type), S10, S14 | **`node tools/content-check.mjs` passes with 0 errors**: 20 rooms, 29 doors, 30 packs, forces **463 / 425 / 38**, 118 mobs, every door tile on a shared edge, every pack inside its room, 0.6 tile from walls; the heights validator (E1 to E6) is green; the p25 bridge pack uses the line formation |
| **PS-D3** boss scripts | `src/ai/bosses/peri.ts`, `src/ai/bosses/index.ts` | `PERI_SCRIPTS` and `PERI_SPAWNS` (`boss_ingra_malok: ['ps_droman']`, `boss_sis_cagiran: ['ps_vulpin', 'ps_mist_clone_FDH', ... 8]`, `boss_tredova: ['ps_larva', 'ps_parasite_p', 'ps_parasite_i', 'ps_parasite_d']`), the scripts of 5.1 to 5.3 including the Elden strings, leap, rush and posture hooks | S5, S16, S3, S6 (`rollSigils`) | each boss resets cleanly on wipe (adds, shapes, statuses, shield, floor sigil cleared), `tsc` clean |
| **PS-D4** trash handlers | `src/ai/abilities.ts` (or `src/ai/abilities_peri.ts` merged into `CUSTOM` / `PASSIVES`) | S8 | S1 | the four kick abilities cast and are stopped by a stun; befriend credits forces |
| **PS-D5** mechanics | `src/systems/SigilPuzzle.ts`, `src/entities/interactables/ChannelGate.ts`, `scenes/DungeonScene.ts` (**the S9 one-liner at 820 to 824** and the nest seed), `types/dungeons.ts` (`MazeDef`, `checkpoints`, `PropTag`) | S6, S7, S9 | PS-A1 (props) or fallbacks | a headless harness: a wrong doorway teleports the party to `resetTo`, a right one does not; the gate opens after 3 s; a Mythic+ release lands on the latest stone |
| **PS-D6** loot and items | `src/data/uniques.ts`, `src/data/loot.ts`, the consumables table | **the 9 named items of 5.4** (`leg_ps_antler_charm`, `leg_ps_soul_splitter`, `leg_ps_wicker_mantle`, `leg_ps_mist_ocarina`, `leg_ps_vulpin_treads`, `leg_ps_player_dagger`, `leg_ps_acid_fang`, `leg_ps_lakali_tear`, `leg_ps_brood_carapace`), `loot_ps_b1..b3`, **`potion_panzehir`** (S17), Turkish tooltips | none | the items roll at the end of a key and from the personal chests |
| **PS-D7** entrance | `data/world/*` (Kadim Diyar, when the map exists), world scenery | `ent_peri_sisleri`, the `peri_gate` recipe, the camp, a waypoint, the region theme of section 7 | S12, the Kadim Diyar layout doc | the entrance round-trips into the dungeon; until then only the portal arc works |
| **PS-D8** audio, vfx, icon | `src/types/audio.ts` (`MUSIC_IDS`), audio manifest and aliases, `vfx/aliases.ts`, `public/assets/icons/dungeon-peri.svg`, loading image | S11 wiring (the `'dungeon_grove'` id, the six `amb_*` beds), dungeon icon, `loadingImage` (2: one-line description) | S11 | no missing-asset warnings, `contentCheck` music check green |
| **PS-D9** set dressing | `src/data/dungeons/peri_sisleri_decor.ts` | the hand-placed props of 2.6 and 2.11 per room (counts, tiers props, chandeliers, banners, statues, lights, ambient VFX, `amb_*` beds), the `dress` entries | PS-D2, PS-A1 | per-room prop counts within 10 % of 2.11, at most 10 live lights near the player, at most 500 draw calls in the PS-QA load |
| **PS-QA** | one Haiku pass | static checks, one headless load of the dungeon, checklist 8.3 **including a full run with zero dispels and a single-tank Tred'ova run** | all | report only, fixes go back to the owning package |

Suggested waves: **wave 0 (external, other docs):** ENGINE_VERTICALITY V1 to V13 (S14) and GDD_CREATURES waves 1 to 3 (S15). **Wave 1** (shared infra, one owner each): S1, S2 + S10 + S13, S3 + S4, S5 + S16 (with the `isTank` fix first), S6 + S7 + S9, S8, S11 + S12 + S17 (at most 5 at once). **Wave 2:** PS-A1, PS-A2, PS-D1, PS-D6 in parallel. **Wave 3:** PS-D2, PS-D3, PS-D4, PS-D5. **Wave 4:** PS-D9, PS-D7, PS-D8, then PS-QA.

### 8.3 Validation checklist (for the QA pass and `tools/content-check.mjs`)

* `node tools/content-check.mjs` ends with **0 errors** for `peri_sisleri` (the three boss ids are in `GDD_BOSSES`, the music id is in `MUSIC_IDS`) before PS-QA starts.
* 20 rooms, 29 doors (3 `boss_lock`, 2 `boss_exit`, none overlapping), grid 76 x 60, no room overlap, every door tile on the edge of room `a` facing `side` and landing inside room `b`; **every door passes the height rule of 3.3 and every stair, ramp, bridge and chasm passes the validator of ENGINE_VERTICALITY (E1 to E6)**.
* 30 packs: forces total **463**, required route **425**, optional **38** (p09 16, p26 8, p30 14), mob count **118**, every pack centre inside its room, **29 of 30 on flat cells (p30 on the ramp)**.
* 14 trash types plus the mini-boss, each with 2 to 4 attacks, every melee-like windup at least `clamp(0.45 + 0.25 coef, 0.45, 1.2)` (`tools/content-check.mjs --windup`), every elite and the mini-boss with a poise bar and an `onBreak`.
* Boss arenas: Ingra `{ 88, 142, 56, 52, 88, 134 }`, Sis Çağıran `{ 218, 54, 52, 60, 228, 54 }`, Tred'ova `{ 248, 210, 64, 52, 248, 214 }`.
* Every enemy id referenced by a pack or a boss spawn exists; every model URL of 2.6 exists or has its fallback; every `peri_sigil_*` code exists (8 files); the 8 clone defs exist.
* Run through: M+ key 2: the maze is the easy version (3 traits differ), the wrong doorway teleports to (19.5, 19.5); key 10: 1 trait differs; Tred'ova shield breaks end Consumption; Ingra's embrace breaks through Droman (damage or posture); the Gorging Shield, the Death Shroud, the floor sigil and the parasites clear on wipe.
* **Zero-dispel run at +10:** no dispel class, no Panzehir İksiri, no major cleanse: no wipe and no death that only a dispel prevents (Kin Laneti cap 3 and decay, Ruh Yarığı 6 s, Anima Enjeksiyonu walk-away, Reaver stacks decay).
* **Guessing Game:** a third wrong clone ends the game with no stun and no more than two Hay Aksi; the floor sigil matches the three identical clones; Hay Aksi is 3.0 at key 5 and below, 3.6 above.
* **Single tank:** a par-gear single tank beats a +10 Tyrannical Tred'ova with defensives and no swap; `asit_yarasi` never exceeds 5 stacks and decays in 8 s.
* **Falls:** a knockback into a chasm column costs 25 % max HP, is non-lethal, respawns on the bridge mouth; the waterfall hop costs about 3.6 %.
* **S9:** in a Mythic+ key a death releases at the latest stone (the Kök landing after boss 1, the ledge after boss 2, the nest seed).
* Rift and Kibir spots: all 8 are standable and flat, none in a boss arena, none in a choice lane; with 4 rifts and 4 Kibir spawns no event is skipped.

### 8.4 Risks and open questions (for the orchestrator)

1. **Boss interrupts** assume the poise / stagger break of GDD_V2 3.12 on bosses. If bosses are only stunnable through the existing `interrupt` skill tags, Ruh Oku and Pasta Pasta need `kick`-tagged class skills (GDD_CONTENT 0.6 recommendation). The posture break as a second answer is a bonus, not the only one.
2. **Scaling mismatch:** `mythicAffixes.ts` uses `mplusHp = 1.1^(L-1)` and `partyHpFactor = 1 + 0.7 (n-1)`, `CORE_MECHANICS` section 6 says x1.08 per level up to +10 and a party table; this document gives TTK targets instead of absolute HP so both fit. Re-tune after CM7.
3. **Kibirli** is in `CORE_MECHANICS` and the roadmap but not in `AffixId` yet. This design needs `extras.riftSpots` for it and a separate used-set with an oldest-spot reuse rule (6.5).
4. **Kadim Diyar** does not exist yet: section 7 is a proposal for one region of it.
5. **No trinket slot** in `EQUIP_SLOTS`: the signature trinket is a ring.
6. **`isTank`** in `bosses/kit.ts` is `classId === 'knight'`. It silently breaks every "random non-tank" and "swap" pick for the other five tank specs (S5).
7. **`dormant.kind: 'egg'`** exists in the type but has no distinct behaviour yet (S13 is cosmetic, the bone-pile wake logic already works).
8. **Performance:** the dress pass is instanced, but 20 rooms with up to 60 dressing props each, the decor tiers, plus fog 7 to 30 m in the maze keep the budget (dungeon at most 500 draw calls, 350 k triangles, at most 10 lights) only if the lights follow the table of 2.3 and 2.11.
9. **S9 overrides a written rule.** GDD_CONTENT 0.7 and the code at `DungeonScene.ts` 820 to 824 send Mythic+ players to the dungeon start on purpose. The one-line change (release at `this.checkpoint`) is **a decision for the user**; without it the 6.2 fallback applies (about 60 to 93 s per death, +2 and +3 thresholds unreachable after any death).
10. **Verticality is an external dependency** (ENGINE_VERTICALITY V1 to V13). The fallback is a flat build (S14); nothing in the packs, bosses or loot depends on y. If the engine ships `ZoneDef.fall` but not `slopes`, the stairs become 0.4 m terraces only if the flights are split (not done here, so wait for V1 to V4).
11. **The GDD_CREATURES kit is an external dependency** (S15). Without it every string collapses to one strike and the windup floor is not enforced; the roster still works but loses its Elden layer.
12. **Poise numbers are tuning targets** (130 / 120 / 220 / 300 / 600 / 700, times the party factor). Check them with SimBench: a party of five should break an elite in 4 to 6 s of active play, not in 1 s.
13. **Tred'ova's complexity budget.** The leap and the charge arrive only in phases 2 and 3 and share the melee slot; if the QA fight feels overloaded, **cut Sıçrayıp Ezme first, then the tail sweep**, never the shield break or the spires charge (the payoff).
14. **Fall damage in M+.** ENGINE_VERTICALITY Q2 is open: non-lethal falls cost 25 % HP and about 6 s, no death penalty. If the owner decides a fall counts as a death in M+, the bridge pack p25 needs the tunnel advice above in bold.
15. **WoW fidelity trade-offs of the 14-type cap:** the Mistveil Defender and Guardian are one def (`ps_guardian`), the Gorgegullet mini-boss of the original is not in the nest (rejected, section 10). If a 15th type is wanted, split them again and drop nothing else.
16. **Panzehir İksiri** (S17) is a new consumable; if the economy owner refuses it the no-dispel answers of 4.7 still stand.
17. **Single-tank Tred'ova** is checked by arithmetic only (5.3); SimBench must confirm after CM4/CM7.

---

## 9. Revision 2 log (2026-10-13): critic issues and user requirements

| # | critic issue (severity) | fix | where |
|---|---|---|---|
| 1 | high: negative `damageReductionPct` is clamped to 0, the two "takes more damage" statuses did nothing | `STATUS_RULES.kin_laneti = { stack: 'stack', takenMore: 0.06 }` (max 3) and `asit_yarasi` `takenMore: 0.10` (max 5), `stats` dropped | 4.4, S3 |
| 2 | high: Asit Yarası forced a swap every 8 s | +10 % per stack, cap 5, 8 s, bite stacks on every other string, maul +1, swap optional, single-tank arithmetic | 4.4, 5.3 |
| 3 | medium: dispel supply below demand | every must-dispel has a no-dispeller answer, burst radius 3 m, Ruh Yarığı 6 s, Kin Laneti cap 3, `potion_panzehir`, zero-dispel QA run | 4.4, 4.7, S17, 8.3 |
| 4 | medium: content checker would reject the bosses | `src/dev/contentRoster.ts` in PS-D2, `MUSIC_IDS` explicit in S11, "content-check 0 errors before PS-QA" | 8.1 S11, 8.2 PS-D2, 8.3 |
| 5 | medium: S9 contradicted GDD_CONTENT 0.7 and duplicated code | one-line change to `this.checkpoint`, only the third seed in `extras.checkpoints`, override stated, risk 9, fallback recomputed | 3.6, 6.2, S9, 8.4 |
| 6 | medium: rift spot table error and shared-set exhaustion | spot relabelled and moved to (29.5, 20), 22 m from p12, 8 spots, separate Kibirli set with oldest-spot reuse | 3.6, 6.5 |
| 7 | medium: fewer roles and interrupt checks | `ps_shaper` (Çalı Zırhı kick 2) in p10, p14, p17; `ps_guardian` with Tepme Çılgınlığı in p13, p16 and the Defender merge; maze packs restated (5 of 8 types in p14) | 4.1, 4.6 |
| 8 | medium: maze fog 3 / 20 hid the casters | maze fog 7 / 30, mist carried by the veil props and `ambient_mist`; Kadim Sis line | 2.3, 6.4 |
| 9 | medium: Guessing Game had no cap on wrong picks | at most 2 Hay Aksi per game, the third wrong ends it, coef 3.0 / 3.6, floor sigil reveal, expected raid damage checked | 5.2 |

| # | user requirement | where |
|---|---|---|
| B1 | verticality: 3 or more levels, `floorY`, stairs, 12 to 30 m halls, galleries, chandeliers, banners, statues, chasm and bridge, height column and side elevation | 3.1, 3.1b, 3.3, 3.5, 2.11 |
| B2 | 3 bosses with an Elden Ring move set (windups, delayed swings, 2 to 3 hit strings, posture windows) on top of the WoW mechanics | 5 intro, 5.1, 5.2, 5.3, S16 |
| B3 | 10 to 14 trash types with 2 to 4 telegraphed attacks, role mix, 1 to 2 set pieces, windup rule, elite posture bars | 4.0, 4.1, 4.3 |
| B4 | per-room set dressing (props with counts, lights, VFX, sounds) | 2.11, PS-D9 |
| B5 | personal loot: 2 to 3 named build-defining items per boss | 5.4, PS-D6 |

## 10. Rejected critique

* **Issue 7, "Optionally add a Gorgegullet elite to the nest" (rejected).** The roster is at the 14-type cap after the Shaper and the Guardian, the nest already has the Staghorn as its elite in four packs (p21, p23, p27, p29) next to the Gorger casters and the Reavers, and one more would need a new def, a pack rebalance and a new set of attacks for no new check. Revisit only if the nest feels thin after the QA pass.
* **Issue 8, "Keep fog 3 / 20 only as the Sis Çağıran sigil phase mood if tested" (rejected).** The sigils of the Guessing Game have to be readable at 20 m (clones stand on a 52 x 60 m glade), and the new floor-sigil reveal is the answer to the fog; the boss glade keeps its 6 / 34 fog during the games. A mood fog can be tested later without a design change.
* **Deviation, issue 1 ("max-stacks cap of 5"):** kept at 5 for `asit_yarasi` only. `kin_laneti` is capped at **3** because issue 3 asks for a no-dispeller cap of 3 and the two statuses would otherwise contradict each other.
* **Deviation, issue 9 ("Hay Aksi coef 3.0 at key 5 and below"):** above key 5 the coefficient is **3.6**, not the old 4.5, so that two wrong picks plus a Penalizing Burst stay near the healer budget.
* **Deviation, issue 7 ("swap members to keep totals or restate"):** the totals 463 / 425 / 38 are kept; only the mob count changes (117 to 118) and is restated.
* **Deviation, issue 5 ("recompute 6.2 with a 90 s corpse run if the rule stays"):** the main text adopts the first option (release at the latest stone); the recomputation is kept as the fallback paragraph of 6.2.

---

## Appendix A: numbers checked by script

Geometry: 20 rooms, 29 doors, no overlap, grid needs 76 x 59 (use 76 x 60). **Heights: 7 walkable floor levels (-2.4, 0.0, 1.2, 2.4, 4.8, 6.4, 7.2) plus the 0.4 m steps (1.6, 4.4, 5.2, 5.6, 6.0, 6.8, -1.2); 29 of 29 door landings within 0.45 m (largest 0.40 at the maze and boss-2 doors, 0.24 at the first tread); 6 stair flights with grade 0.075 to 0.30 (limit 0.80), tread depth 0.80 to 3.20 m (limit 0.45), tread rise 0.28 m, plus one ramp with grade 0.10.** Packs: 30, total forces 463, required 425, optional 38, **mobs 118**, forces by room: `drust_kampi` 90, `k_ritual` 10, `kok_salonu` 31, `mantar_korusu` 16, `m1` 32, `m2` 37, `m3` 47, `m4` 36, `havuz` 10, `yuva_magarasi` 70, `yuva_koprusu` 16, `yan_tunel` 8, `yuva_kuyusu` 46, `peri_halkasi` 14. 29 of 30 pack centres and all their members (spiral offsets) on flat cells, none within 0.225 tile of a wall (p30 on the ramp). Routes: A 425 (114.9 %), B 433 (117.0 %), C 377 (101.9 %). Kibirli thresholds of 370: 74, 148, 222, 296. **Rift and Kibir spots: 8, the nearest pack centre or patrol point is 13 to 26 m away (16, 22, 13, 22, 14, 26, 18, 13 m for S1 to S8).** Timer: par **26:40** (95.2 % of 28:00), +2 at 22:24, +3 at 16:48. Elden layer windups (first strike): coef 1.0 gives 0.70 s, 1.2 gives 0.75 s, 2.0 gives 0.95 s, 2.2 gives 1.00 s, 2.4 gives 1.05 s; follow strikes `0.30 + 0.12 coef`: coef 1.0 gives 0.42 s, 1.2 gives 0.44 s, 2.0 gives 0.54 s, 2.2 gives 0.56 s (capped 0.55).
