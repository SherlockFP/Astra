# Büyücüler Terası (`buyucu_terasi`): Mythic+ Season 1 dungeon design

Status: design **rev 2**, 2026-10-13: the critic's 11 issues fixed (section 9 lists what was rejected or modified) plus the binding user requirements (vertical like WoW, 4 bosses with an Elden-Ring move layer, 13 trash types, per-room set dressing, personal loot with named items). Docs only, no code was changed. Implementation is done by Haiku coders from section 8.
Model: **Magisters' Terrace, Midnight version** (patch 12.0.1). The original TBC dungeon (Selin Fireheart, Vexallus, Priestess Delrissa, Kael'thas) is used only for homage props, see the homage note in section 1.
Research: `docs/ref/dungeons/tww-midnight.md` (Magisters' Terrace half), plus the engine files listed in Appendix D.
Non-commercial hobby project: staying very close to WoW's design is explicitly wanted (user: "o designlara baya benzesin").

Tags used below: **[exists]** = already in the repo (checked by reading code today). **[NEW]** = needs new code or art; each NEW item has a stable id `NP-xx` that is specified once in section 8.2 and shared by the 8 dungeons of the season pool. **`NP-xx` ids are local labels:** 8.2 maps each one to its canonical id in the shared primitive registry (canonical ids are the `SPX-nn` of `docs/dungeons/_shared_primitives.md`, the season registry).

Coordinate rules (same as `docs/GDD_CONTENT.md` 0.1 and `src/data/dungeons/kit.ts`): 1 tile = 4 m; a continuous point `c` maps to world `(c + 0.5) * 4`; a room with `x = 20, w = 20` spans continuous x 19.5 .. 39.5. `n` = -Z (up on the map), `s` = +Z, `e` = +X, `w` = -X. Facing 0 = +Z (south), 90 = +X, 180 = -Z, -90 = -X.

---

## 1. Identity

| field | value |
|---|---|
| id | `buyucu_terasi` |
| Turkish name / short name | **Büyücüler Terası** / "Teras" |
| WoW model | Magisters' Terrace (Midnight): Quel'Danas blood elf academy and observatory, library, plaza, observatory grounds, Constellarium, Tower of Theory, Celestial Orrery |
| Level | 60 only (`levelRange: [60, 60]`). Offered on Kahramanlık, Mitik 0 and Mitik+. No Normal / Heroic (it is a Season 1 endgame dungeon; the 4 levelling dungeons keep Normal / Heroic). |
| Bosses | 4 (the WoW original has 4): Bekçi Arkanotron, Seranel Güneşkamçı, Gemellus, Degentrius, each with a posture bar and an Elden-Ring move layer |
| Rooms | 18 (14 on the critical path, 2 optional, the grand stair and the service corridor) |
| Trash | 12 combat defs + 1 variant, 2 to 4 telegraphed attacks each (4.1) |
| Grid | 64 x 70 tiles (256 x 280 m), **vertical**: floors at 0 / 2.7 / 5.4 / 13.5 m, halls 12 to 30 m, a 20-tread grand stair, 2 lifts, a void chasm with bridges (3.2b) |
| **M+ timer** | **32:00 (1920 s)**. +2 at 25:36, +3 at 19:12. WoW's own timer is 34:00 (33:00 on some lists); 32:00 is the top of our season range (22 to 32 min) because this is the longest dungeon of the pool: 4 bosses, vertical route, 29 packs. |
| **Enemy forces** | **400 required**, **493 available** (123.3 %): 29 packs, 125 enemies. Route A (no optional rooms) 463 = 115.8 %. Route B (fast) 412 = 103.0 %. Optional rooms carry 30. |
| Start / Kehanet Taşı | start (13.5, 63.5) facing 180; Font of Power at (13.5, 61) in the Sessiz Fuaye |
| Exit portal | (34.5, 67.0) on the Orrery dais, end-of-run chest beside it (`chest_epic` in M+) |
| Entrance | Kadim Diyar, Yıldızburnu Falezleri (sea cliff headland), see section 7 |
| Season role | Pool slot 8 of 8 in ROADMAP Batch 10. The 4 levelling dungeons stay as they are. |

**Fantasy (Turkish lore for `DungeonDef.lore`):**

> Yıldızburnu'nun en ucunda, Güneş Kuyusu'nun parıltısını gözetlemek için kurulan Büyücüler Terası, yüzyıllardır Yıldız Büyücüleri'nin akademisi ve gözlemevi. Terasın kalbinde Alacakaranlık Feneri saklı: Efsun Kaynağı'nın en eski yankısı, gerektiğinde Boşluk Fırtınası'na açılan bir kapı. Kadim Zindanların mühürleri çatlayınca Boşluk raflardan, mercek yuvalarından, kürelerin çatlaklarından sızmaya başladı. Büyücülerin yarısı kaçtı, yarısı Boşluk'a teslim oldu; nöbetçi otomatlar hâlâ kurallara uyuyor ve herkesi içeriye kapatıyor. Fener sönmeden Teras'a çık.

English gloss: the Star Magisters built this academy-observatory on a cape above the Well of Sun (our Sunwell stand-in, **Güneş Kuyusu**) to watch its light. The **Alacakaranlık Feneri** (our Cynosure of Twilight) is a relic that opens a door to the **Boşluk Fırtınası** (Voidstorm). When the Kadim Zindanlar seals cracked, the Void started leaking through bookshelves and observatory lenses. Construct guardians keep enforcing the academy rules, the Spellbreakers guard the Beacon, and the aberration Degentrius is turning the orrery into a void engine.

**Recommended route (summary, details in 6.3):** Foyer, South Antechamber, Lycaneum gauntlet (grab the Arcane Tome), Arcane Atheneum (kill the Pyromancer, the library door opens), stair up to the Upper Library, stair up to the Plaza (the elevated pack on the ledge leaps down when the plaza is cleared), **Boss 1** Arkanotron, Energy Courtyard (crystals), stair down into the sunken asylum for **Boss 2** Seranel, Terrace Walk (stealth lane for rogues), **Boss 3** Gemellus, Tower of Theory (two Devouring Tyrant pulls, never together), the tower lift up to **Boss 4** Degentrius. Optional: Yasak Raflar (stacks) and the Sunwell Balcony. Death runs: the Büyük Merdiven opens at boss 1, the service lift corridor at boss 3.

**Homage to the TBC original (cheap, no mechanics):** the Energy Courtyard crystals are Selin Fireheart's mana crystals; the Pyromancer pack is Priestess Delrissa's fire mage; phoenix statues stand on the Sunwell Balcony (Kael'thas' phoenix); one Sessiz Fuaye banner uses the "sun with a falling star" crest of the Sunstriders. Use them in decoration only.

### 1.1 What changed in rev 2

| Area | Change |
|---|---|
| Heights (new) | `vertical: true`, 4 levels, ceilings 7 to 40 m, 4 stair strips, 4 plateaus, 2 lifts, a real void fall with 2 bridges, decorative gallery rings and window rows; height column in the room table and a side elevation (3.2, 3.2b) |
| Rooms and doors | +1 room (`hizmet_koridoru`, the service lift corridor), +2 doors (19 total); `mt_p16` on a real ledge; packs moved off stairs and pads |
| Trash | 13 types with 2 to 4 attacks each on the windup rule, strings, delayed swings, rush, leap, marks, posture bars on 5 elites; **no purge** (poise break replaces it) (4) |
| Bosses | all four rewritten with an Elden-Ring layer (strings, hold, grab, leap, rush, posture, enrage below 30 %); Arkanotron's orb timing, the Degentrius torrent geometry and the dome host logic fixed (5) |
| Loot | 12 named items with build-defining effects, personal loot tables (5.6) |
| Set dressing | per-room lists of props with counts, lights, VFX, sounds, tiers (3.7) |
| Primitives | every `NP-xx` mapped to the season registry `SPX-nn` (8.2), NP-19 to NP-23 added, open conflicts with the registry listed |

---

## 2. Art direction

Goal: the loading screen of the Midnight dungeon, walked through. Quiet, scholarly, nocturnal, reverent. Warm amber lantern pools against a cold starlit indigo, arcane cyan tracery, red velvet and gilt, then violet-black Void corruption that grows as you climb.

### 2.1 Palette (hex)

Eight base colours are eyeballed from the Midnight loading screen (research doc, not game data). Three accents are ours.

| # | Name | Hex | Where |
|---|---|---|---|
| 1 | Midnight indigo | `0x1d1a46` | sky, deep shadow, fog far colour |
| 2 | Deep plum | `0x3a2350` | arch shadows, library fog, floor shadow |
| 3 | Blood-red leather | `0x6e1b2b` | bookshelves, velvet, banners, Magister robes |
| 4 | Amber lantern gold | `0xf2a14a` | lanterns, sconces, braziers, torch colour |
| 5 | Arcane cyan | `0x5fd3e8` | crystal finials, arch tracery, arcane VFX, energy crystals |
| 6 | Lilac-grey marble | `0x7c7396` | floor tiles, walls (via KayKit texture tint) |
| 7 | Starlight silver | `0xd6d0f0` | stars, dome ribs, silver trim |
| 8 | Void violet-black | `0x2a0f3a` | Void corruption bodies, cracks, void ring |
| a | Sunwell gold | `0xffd77a` | Güneş Kuyusu light shaft, balcony, holy VFX, phoenix |
| b | Void bright violet | `0x8a3cff` | void glow accents (emissive only) |
| c | Crimson-gold trim | `0x9c7a2a` | gold inlay lines in the marble floor (rune zones) |

Rule (from the Blizzard art quote in the research doc): boss effects must stand out from the floor. Floors are lilac-grey and dark; therefore **arcane cyan**, **void violet** and **amber** are the only telegraph-adjacent glow colours, never a lilac or grey glow.

### 2.2 Materials and textures

- **Walls:** KayKit dungeon wall pieces with `DungeonTheme.tint 0xb8aed8` (lilac marble). Wall style `temple` already tints `0xb4a4d6` and has arches and open arched windows [exists]. We add two styles [NEW NP-14]: `arcane` (arches and night windows) and `library` (bookshelf bays), see table below.
- **Floors:** KayKit `floor_tile_large` / `small` with a lilac tint. New floor style `marble` [NEW NP-14]: tint `0xa8a0c8`, checker 0.86 (a quiet large checker, softer than `tiles` at 0.72). Gold inlay lines and the star-map circles are **rune zones** [exists]: `rectZone('rune', ..., { color: 0x4a3a1a, glow: 0xf2a14a, glowIntensity: 0.25 })`.
- **Wood and cloth:** `fu(...)` furniture pieces tinted blood red `0x8a1c30` (velvet) or dark wood. `banner_pattern*_red` and `banner_shield_yellow` for crimson-gold banners.
- **Crystal:** `gp('crystal_blue')` (cyan finials, energy pylons) and `gp('crystal_purple')` (Void shards), emissive on, bloom picks them up.
- **Void zones:** black `void` zone [exists] with `portal_swirl` and violet glow; cracks are `rune` zones tinted `0x8a3cff`.

New style entries (one table row each in `WALL_STYLES` / `FLOORS` / `DECOR` of `src/world/DungeonBuilder.ts`, plus the union types in `types/dungeons.ts`):

| style | tint | variants (weights) | banners | decor set |
|---|---|---|---|---|
| WallStyle `arcane` | `0xb4a4d6` | wall 40, wall_arched 22, wall_archedwindow_open 12, wall_pillar 12, wall_shelves 8, wall_window_open 4, wall_cracked 2 | red, yellow, white | big: `gp('statue_hooded')`, `gp('crystal_blue')`, `D('barrel_large')`; small: `D('candle_triple')`, `D('box_small')`, `D('candle_thin')`; floor: `D('candle_thin')`, `D('candle_melted')`, `D('plate_small')`; hung: `D('sword_shield_gold')`, `D('shelf_small_candles')` |
| WallStyle `library` | `0xb8a8d0` | wall_shelves 46, wall_arched 14, wall_pillar 14, wall 22, wall_archedwindow_open 4 | red, yellow | big: `fu('shelf_B_large_decorated')`, `fu('cabinet_medium_decorated')`, `fu('table_medium_long')`; small: `fu('book_set')`, `fu('book_single')`, `D('candle_triple')`; floor: `D('candle_melted')`, `fu('book_single')`; hung: `D('shelf_small_candles')` |
| FloorStyle `marble` | `0xa8a0c8`, checker 0.86 | large `floor_tile_large`, small `floor_tile_small`, special `floor_tile_small_broken_A` (rare) | n/a | n/a |

### 2.3 Lighting rig

Indoor builder facts [exists]: one hemisphere light, one ambient light, one moon-style shadow caster derived from `hemiSky`, a rim light, then point lights from props and zones through `LightPool` (budget: about 10 lights in view, ROADMAP perf budget). Fog colour is also the scene background.

| Item | Value |
|---|---|
| fogColor | `0x14123a` (night indigo) |
| fogNear / fogFar | 12 / 56 default (see per-room overrides below) |
| ambient | `0x4a4478` x 0.42 |
| hemiSky / hemiGround | `0x6a74c8` (starlight blue) / `0x2a1a38` |
| moon key (auto) | `hemiSky` lerped 35 % to white = cool blue-white, intensity 0.55 |
| torchColor | `0xf2a14a` (amber) |
| bloomStrength | 0.55 (crystals and runes carry the look) |
| palette (theme) | `[0x1d1a46, 0x3a2350, 0x6e1b2b, 0xf2a14a, 0x5fd3e8, 0x7c7396, 0xd6d0f0, 0x2a0f3a]` |
| tint | `0xb8aed8` |
| music | `dungeon_arcane` [NEW NP-14] (fallback: `dungeon_shadow`); bosses use `boss` |

Coloured point lights (one real light per cluster, the rest is emissive):
- Amber lanterns / sconces `0xf2a14a`, intensity 1.6 to 2.0, distance 9 to 11, flicker on. Libraries and antechamber.
- Cyan crystal finials `0x5fd3e8`, intensity 1.1 to 1.4, distance 7 to 8, flicker off. Plaza, courtyard, tower, boss 1 and 3 arenas.
- Void rooms `0x8a3cff`, intensity 1.0 to 1.6, distance 6 to 9, flicker on (tower upper rooms, orrery, Gemellus pools).
- Sunwell gold `0xffd77a`, intensity 1.8, distance 14, from the balcony 'pool' zone (the Well far below).

**Tall halls** (ceiling 12 m or more) use the kit `tall()` helper of ENGINE_VERTICALITY: fog far x1.4 and hemisphere intensity -10 % so the volume reads. **Per-room fog overrides** (`RoomDef.fog`) [exists]: libraries are warm plum and cosy (`0x2a1a38`, near 8, far 40); courtyard and terrace are cooler and wider (`0x1a2250`, near 18, far 80); Observatory Grounds `0x14183c` near 16 far 74; Orrery `0x0a0820` near 20 far 90 so the starry void reads as distance.

**Sky / backdrop [NEW NP-14 = SPX-05: `DungeonTheme.sky?: { image?, stars?, fallback? }` plus the per-room `RoomDef.sky`]:** a night dome with stars (reuse `world/Sky.ts` with `stars: true`, no sun): zenith `0x080620`, mid `0x1d1a46`, horizon `0x5a3a78`, moon direction (-0.3, 0.5, -0.8), cloudCover 0.15. Open-air rooms (`openAir: true`: plaza, observatory, courtyard, balcony, terrace, the constellarium dome and the orrery) have no lid, so the dome shows above their tall walls and over the void ring; indoor halls have lids at 12 to 26 m: that is the "starfield ceiling" and the "dome opens onto the stars" of the loading screen. A faint vertical **Güneş Kuyusu light shaft** (additive billboard, `0xffd77a`, 40 m tall, far SE on the horizon) is visible from the courtyard, terrace and balcony as a landmark [NEW NP-14, `sunwell_glow`].

### 2.4 Landmark set pieces in run order

1. **Sessiz Fuaye** (Hushed Foyer): gold-inlaid lilac marble, crimson carpet runner to the north door, the Font of Power with cyan runes, two tall arched windows onto the night, sun-crest banners.
2. **Güney Antre Salonu** (South Antechamber): a long colonnade of `column-large`, amber chandeliers, suits of crimson-gold banners, two stone sentry statues, rows of lanterns.
3. **Lycaneum geçidi:** serpentine lane between three rows of arched bookcases, hooded librarian statues with cyan eyes whose gaze sweeps the lane, a reading ladder, the Arcane Tome on a lectern at the far end.
4. **Gizem Arşivi** (Arcane Atheneum): the loading-screen hall. Tall bookcase bays with red books, chandeliers, long reading tables, red velvet chairs with teal crystal finials, a velvet "throne" chair in the foreground at the south end, floating tomes.
5. **Üst Kütüphane** (Upper Library): mezzanine galleries (low stairs and balustrades), a brass orrery model on a table, a spiral bookcase ladder, more void leaks (violet cracks in the shelves).
6. **Yıldız Meydanı** (Plaza): a round plaza with a star-map floor (concentric cyan rune rings), a round arcane fountain with a cyan glowing pool, the **armillary sphere** statue in the centre, arched balcony on the north wall (the elevated pack's perch).
7. **Gözlemevi Bahçeleri** (Observatory Grounds, boss 1): a terraced observatory garden: four brass telescopes, a sundial dais, low hedges (Kenney hedges tinted dark), eight lens-ports in the walls glowing cyan.
8. **Enerji Avlusu** (Energy Courtyard): open courtyard, four **energy pylons** (cyan crystals, the Selin Fireheart homage) in the corners, central dais, balustrade, the gold Sunwell light shaft on the horizon.
9. **Başbüyücü Sığınağı** (Grand Magister Asylum, boss 2): a round chamber, the **Alacakaranlık Feneri** (a tall cyan-violet crystal beacon) behind the boss, a circular suppression-dome rune on the floor, runic glaive racks.
10. **Teras Yolu** (Terrace Walk): an open promenade with balustrade over the sea and sky, marble arches, wind chimes, a long run of lamp posts, the Sunwell shaft to the east.
11. **Takımyıldız Odası** (Constellarium, boss 3): a domed star chamber; the floor is a constellation map made of rune lines; twelve zodiac-style pillars in a ring; stars overhead.
12. **Teori Kulesi** (Tower of Theory): a tower base with a central gear shaft (brass gears, orrery mechanism) and spiral stairs; the higher you go the more cyan turns to violet; void cracks widen in the walls.
13. **Göksel Yörünge** (Celestial Orrery, boss 4): a round platform in the void: a black ring, starfield under and around, four lens obelisks at the diagonals, three huge golden rings (the orrery) slowly turning overhead.
14. **Güneş Kuyusu Balkonu** (optional): a marble balcony over a glowing golden pool far below (the Sunwell), phoenix statues, a chest.

### 2.5 Props mapped to existing assets

All paths are under `/assets/models/`. Helper names are from `src/data/dungeons/kit.ts`: `dg` = dungeon, `hw` = halloween, `fu` = furniture, `gp` = gen/props, `kg` = kenney graveyard-kit, `kc` = castle-kit, `kf` = fantasy-town-kit, `ip(pack, path)` = itch PSX packs.

| Use | Asset (helper) | Scale / tint / notes |
|---|---|---|
| Colonnade, plaza columns | `kg('column-large')`, `dg('column')` | scale 3 / 2.4, tint `0xb4a4d6`, `collide` |
| Gothic arches, gates | `ip('psx-dungeon','arch')`, `ip('psx-dungeon','block_arch')`, `hw('arch_gate')` | tint lilac, scale 2 to 3 |
| Wall sconces | `dg('torch_mounted')` | `light: lt(0xf2a14a, 2.0, 11, true, 0.9)`, `Props.torches(r, side, pos, 0xf2a14a)` |
| Chandeliers | `ip('psx-dungeon','chandelier')` | y 3.4, amber light 1.8 / 11 |
| Hanging lanterns | `hw('lantern_hanging')` | y 3.95, amber |
| Candles | `dg('candle_triple')`, `dg('candle_thin_lit')`, `dg('candle_melted')` | one light per cluster |
| Bookcases (floor) | `fu('shelf_A_big')`, `fu('shelf_B_large_decorated')`, `fu('cabinet_medium_decorated')` | tint `0x6a3a3a` (dark wood) |
| Books | `fu('book_set')`, `fu('book_single')` | on tables and shelves |
| Reading tables, chairs | `fu('table_medium_long')`, `fu('chair_A')`, `fu('chair_B_wood')`, `fu('armchair')` | armchair tint `0x8a1c30` (velvet) |
| Rugs | `fu('rug_rectangle_stripes_A')`, `fu('rug_oval_B')` | tint `0x8a1c30` / `0x6e1b2b` |
| Lamps | `fu('lamp_standing')` | amber light 1.3 / 8 |
| Paintings | `fu('pictureframe_large_A')`, `fu('pictureframe_medium')` | on walls |
| Librarian statues | `gp('statue_hooded')` | tint `0x6a6a90`, `emissive 0x5fd3e8` x 0.4 (eyes read cyan) |
| Crystals (finials, pylons) | `gp('crystal_blue')`, `gp('crystal_purple')` | emissive 0.8 to 1.1 |
| Braziers | `gp('brazier')` | tint `0xf2a14a` |
| Altars / dais pieces | `kg('altar-stone')`, `dg('floor_foundation_allsides')` | tint lilac |
| Fountain | `kf('fountain-round-detail')` + `pool` zone | tint `0x9aa8d8`, pool glow cyan |
| Stairs | `dg('stairs_walled')`, `kc('stairs-stone')`, `ip('psx-dungeon','stairs_wide')` | decor beside the real stair strips (the treads themselves are procedural, ENGINE_VERTICALITY 7.4) |
| Chains | `ip('psx-dungeon','chain')` | hanging chandeliers, lift pads, the chained book (**not** `dg('chains_hanging')`, which does not exist) |
| Balustrades | `kc('wall-half')`, `kf('wall-block-half')`, `ip('psx-walls-fences','drystone-wall/drystone_wall_half_capped')` | terrace edge, gallery edge |
| Hedges | `kf('hedge-large')` | tint `0x2a3a40` (night garden) |
| Lamp posts | `gp('lamp_post')` | amber, terrace and gate |
| Banners | `dg('banner_patternB_red')`, `dg('banner_patternC_red')`, `dg('banner_shield_yellow')`, `dg('banner_thin_red')` | `Props.wall(...)` |
| Font of Power | `gp('font_of_power')` | at (13.5, 61), `id: 'font_of_power'`, `tag: 'socket'` |
| Chests | `gp('chest_gold')`, `gp('chest_epic')` | balcony / stacks; exit chest |
| Bones, rubble (void damage) | `hw('bone_B')`, `dg('rubble_half')`, `dg('floor_tile_small_broken_A')` | sparse; this is a clean academy |

### 2.6 NEW props to build in Blender

Pipeline: `tools/blender/props/` (`props_special.py`, `build_props.py`, `manifest.json`), conventions in `docs/assets/generated-props.md`: 1 unit = 1 m, +Z forward, origin at base centre, 16 to 64 px nearest textures with a limited palette and vertex AO, emissive for runes and crystals, separate named nodes for parts the game rotates. Output `public/assets/models/gen/props/<id>.glb`, rebuild the contact sheet with `render_preview.py`.

| id (TR name) | Size W x H x D (m) | Look in one line | Named parts |
|---|---|---|---|
| `orrery_rings` (Yörünge Halkaları) | 14 x 6 x 14 | three concentric gilded rings (r 7 gold, r 5 cyan-engraved, r 3 violet), small planet spheres on them, thin brass spokes | `ring_outer`, `ring_mid`, `ring_inner` (game rotates at 4, -6, 9 deg/s) |
| `lens_obelisk` (Mercek Dikilitaşı) | 1.6 x 7 x 1.6 | slender violet-black obelisk with gold collars; a floating cyan lens ring at the top | `lens` (spins, beam origin), `light_0` |
| `armillary_sphere` (Armilla Küresi) | 3.2 x 4.2 x 3.2 | marble pedestal, gold gimbal rings around a glowing cyan core | `ring_a`, `ring_b`, `core`, `light_0` |
| `energy_pylon` (Enerji Sütunu) | 1.6 x 3.4 x 1.6 | marble pedestal with gold collars and a large floating cyan crystal | `crystal` (spins, bobs), `light_0` |
| `telescope_brass` (Pirinç Teleskop) | 2.2 x 3.0 x 2.2 | brass tube on a tripod, cyan lens glow, red leather grip | `tube` (rotates), `light_0` |
| `bookcase_arched` (Kemerli Kitaplık) | 4 x 4 x 0.9 | gothic arched bookcase bay with red books, gilt trim, wall ladder; instancing-friendly, one material | none |
| `velvet_throne` (Kadife Sandalye) | 1.4 x 2.2 x 1.3 | red velvet high-back chair, dark wood, teal crystal finial (the loading-screen foreground) | `finial` (emissive) |
| `cynosure_crystal` (Alacakaranlık Feneri) | 3 x 7 x 3 | tall cyan-violet beacon crystal on a marble base, orbiting shards | `shards` (orbit), `light_0` |
| `phoenix_statue` (Anka Heykeli) | 3.4 x 3.6 x 2.6 | gilded phoenix with spread wings on a marble plinth, cyan eyes | none |
| `sunwell_gate_arch` (Güneş Kapısı) | 14 x 12 x 3 | twin lancet arch of lilac marble, gold sun-sigil crest, two spires topped with cyan finials | `crest` (emissive), `light_0` |
| `sunwell_glow` (Güneş Kuyusu Işığı) | 6 x 40 x 6 | additive vertical light shaft sprite pair, gold, fades at both ends | one alpha-blend material |
| `arcane_lift_pad` (Arkan Asansör Platformu) | 12 x 0.6 x 4 (variant 8 x 0.6 x 8) | thick lilac marble slab with a gold edge, a cyan rune circle and four chain posts reaching the ceiling | `pad` (moves with the lift), `runes` (emissive), `light_0` |
| `star_chandelier` (Yıldız Avizesi) | 3 x 2.2 x 3 | brass ring with 12 candles and cyan crystal drops, hung on a long chain; instancing-friendly | `crystals` (emissive) |
| `magister_statue` (Büyücü Heykeli) | 1.2 x 3 x 1.2 | robed magister on a plinth, hood and staff, cyan eyes; 3 tint variants | `eyes` (emissive) |
| `banner_sun_tall` (Güneş Sancağı) | 2 x 8 x 0.2 | long crimson banner with the sun crest and gold fringe, vertex sway | none |

Boss and enemy models (Blender, rigged, `tools/blender/bosses/boss_<id>.py` + `bosslib.py` conventions: clips `Idle, Walk, Run, Attack, Attack2, Cast, Enrage, Hit, Death`, faces +Z, 600 to 1300 tris, 128 x 128 atlas, `KHR_materials_emissive_strength` 1.4 to 2.2):

| id | Height | Look | Fallback until it exists |
|---|---|---|---|
| `arkanotron` | 5.4 m | hovering brass-and-crystal sentinel: a ring-gimbal torso with a single cyan eye, three orbiting rune rings, two floating gauntlet fists | `gen/bosses/lav_golemi.glb`, scale 0.85, tint `0x6a7ad0`, emissive `0x40d0ff` |
| `gemellus` | 4.2 m | a floating void organism, three translucent violet lobes with a starfield skin and trailing tendrils (Siphoid) | `gen/creatures/wraith.glb` scale 1.9, tint `0x2a0f3a`, emissive `0x7a30ff`, opacity 0.9 |
| `degentrius` | 6.0 m | hunched robed Domanaar aberration, floating rune ring behind its head, one oversized fragment-arm of black crystal | `monsters/Demon_Lord.glb` scale 1.45, tint `0x2a0f3a`, emissive `0x7a30ff` x 0.5 |

The live model of each boss in the data file is its fallback (Appendix C); MT-F's GLB later replaces one path.

Procedural bodies (no Blender; `src/ai/procModels.ts` `PROC:` pattern, like `phylactery` and `soul_orb`) [NEW NP-07]: `PROC:codex` (flapping book: two cover boxes and a page quad, red leather, gold trim, cyan page glow) and `PROC:energy_orb` (cyan sphere with a bright core and a short trail).

### 2.7 Enemy models (KayKit rig + tint + accessories, or existing creature)

Full stat table in section 4. Model summary so art can be reviewed first:

| Enemy | Model | Tint / emissive | Accessories (`visual.hide` uses `mageHide(...keep)` / `KNIGHT_HIDE` / `ROGUE_HIDE` helpers of `data/enemies.ts`) |
|---|---|---|---|
| Arkan Büyücü | `characters/Mage` | tint `0x8a1c30` (crimson robe) | keep `1H_Wand`, `Mage_Hat` |
| Güneşkılıç Muhafızı | `characters/Knight` | tint `0xd8a040` (gold) | keep `1H_Sword`, `Badge_Shield`, `Knight_Helmet` |
| Işık Şifacısı | `characters/Mage` | tint `0xf2e6b0` (ivory-gold) | keep `2H_Staff` |
| Alevli Piromant | `characters/Mage` x 1.15 | tint `0xff6a20`, emissive `0xff6a20` x 0.3 | keep `1H_Wand`, `Spellbook_open` |
| Canlı Kodeks | `PROC:codex` | tint `0xa0283a` | none (flying, hover 1.4) |
| Rünlü Büyükıran | `characters/Knight` x 1.1 | tint `0x5a7aa8` (steel-teal) | keep `Rectangle_Shield`, `Knight_Helmet`; attach `gen/weapons/axe_1h_crescent.glb` to `handslot.r` (the "glaive") |
| Kristalçekirdek Mekanoidi | `gen/creatures/golem_stone` x 0.75 | tint `0x5fd3e8`, emissive `0x2090b0` | none |
| Gizem Nöbetçisi | `gen/creatures/golem_stone` x 1.05 | tint `0x8a80ff`, emissive `0x4a40c0` | none |
| Boşluk Yarığı Çağırıcısı | `gen/creatures/wraith` | tint `0x3a1060`, emissive `0x7a30ff` | floating |
| Boşluk Aşılayıcı | `characters/Mage` | tint `0x4a2a7a` | keep `2H_Staff` |
| Yutucu Tiran | `monsters/Demon` x 1.55 | tint `0x1a0a30`, emissive `0x7a30ff` x 0.4 | none |
| Boşluk Yavrusu | `monsters/Imp` x 0.55 | tint `0x3a1060`, emissive `0x6020ff` | flying |

### 2.8 VFX palette, music and ambience

VFX (existing ids [exists], colour passed with `bossFx(..., { color })` where the preset allows it):
- Arcane cyan `0x5fd3e8`: `arcane_projectile`, `arcane_burst`, `aegis_dome` (Seranel's dome), `chain_lightning` recoloured for tethers.
- Amber fire `0xf2a14a`: `fire_burst`, `fire_ground` (Pyromancer), `brazier_fire`, `torch_fire`.
- Void violet `0x8a3cff`: `shadow_burst`, `shadow_ground`, `portal_swirl`, `curse_loop`, `shadow_projectile`.
- Sunwell gold `0xffd77a`: `holy_burst`, `heal_burst`, `gold_sparkle`.
- Telegraph colours stay the engine's (red danger, yellow soak, green safe).
- Ambient: `ambient_dust` tinted starlight in libraries; `ambient_shadow_wisps` in the tower and orrery; NEW ids `ambient_stardust`, `arcane_orb`, `void_torrent`, `dome_suppress` [NEW NP-15] (append-only in `types/vfx.ts`; `vfx/aliases.ts` maps them to `ambient_dust`, `arcane_projectile`, `lightning_strike`, `aegis_dome` until real presets exist).

Music and ambience mood (new `MusicId` `dungeon_arcane`): a slow nocturnal theme: harp arpeggios, soft strings, a celesta on top, distant sea wind and wind chimes; libraries add page rustle, creaking wood and slow clock ticks; as you climb, a low dissonant choir drone creeps in under the melody; the Orrery fight drops the melody and leaves the drone plus a heartbeat. Boss fights use the existing `boss` track.

### 2.9 Loading screen

One line: *"A night library-observatory seen down a long hall of pointed arches: a starfield dome with radiating ribs overhead, amber lanterns hanging over bookcases of red books, a red velvet throne chair with a teal crystal finial in the foreground, a desk with candles and decanters, violet Void cracks creeping through the far shelves."* File: `public/assets/loading/buyucu_terasi.jpg` (1280 x 720, a headless Blender render of the Atheneum with the PSX post look, **owned by MT-F**; the directory does not exist yet), `DungeonDef.loadingImage`. Icon: `/assets/icons/dungeon-buyucu-terasi.svg` (an arcane eye over a crescent terrace, **owned by MT-I**). Both fields are **optional**: no existing dungeon sets either, and the data file omits them until the assets exist.

---

## 3. Layout on our tile grid

Grid 64 x 70 tiles. This revision is a **vertical** dungeon (`DungeonDef.vertical: true`, `docs/ENGINE_VERTICALITY.md`, CORE_MECHANICS section 13): every room has a `floorY`, a `ceiling`, stair strips (`slopes`), a few plateaus (`heightAreas`), two lifts and decorative upper tiers. There are **four walkable levels (0 / 2.7 / 5.4 / 13.5 m)**; halls are 12 to 30 m tall. The route still snakes: south foyer, west library wing (south to north, climbing), centre plaza, north observatory, north-east courtyard, a descent into the sunken asylum, east wing (north to south), a long tower run back west and south, a lift up to the orrery, which sits directly above the start area on the map (separated by walls, like Court of Stars looping back) and is joined to it by a **sealed service lift corridor** that opens after boss 3.

Machine-checked (scratch validator run for this revision, not the repo's `content-check`): rooms do not overlap; every door tile sits on the shared edge of both rooms; at all 19 doors the two floor heights differ by at most 0.45 m; every stair strip lies inside its room with grade at most 0.8 and tread depth at least 0.45 m; 29 packs, 125 enemies, 493 forces; no pack member stands on a stair strip or a lift pad (`mt_p16` stands on its ledge by design); every collidable column has at least 2 m of nav gap to walls and neighbours.

### 3.1 Map

Legend: `A` giris, `B` guney_antre, `L` lycaneum, `C` gizem_arsivi, `y` yasak_raflar (optional), `U` ust_kutuphane, `P` meydan, `g` buyuk_merdiven, `1` gozlemevi (boss 1), `E` enerji_avlusu, `b` balkon (optional), `2` siginak (boss 2), `T` teras_yolu, `3` takimyildiz (boss 3), `K` kule_tabani, `k` kule_merdiveni, `4` goksel_yorunge (boss 4), `h` hizmet_koridoru (sealed service lift corridor). Doors: `+` open, `x` kill_lock, `#` boss_lock, `%` boss_exit. `/` stair strip, `=` lift pad. `.` pack centre, `~` patrol waypoint, `S` start, `F` Font of Power.

```
    0         1         2         3         4         5         6   
    0123456789012345678901234567890123456789012345678901234567890123
  0                                                 bbbbbbbbbbbb
  1                                                 bbbbbbbbbbbb
  2                     11111111111111111111        bbbbbb.bbbbb
  3                     11111111111111111111        bbbbbbbbbbbb
  4                     11111111111111111111        bbbbbbbbbbbb
  5                     11111111111111111111        bbbbbbbbbbbb
  6                     11111111111111111111EEEEEEEEEEEEE++EEEEEEE
  7                     11111111111111111111EEEEEEEEEEEEEEEEEEEEEE
  8                     11111111111111111111EEEEEEEEEEEEEEEEEEEEEE
  9                     11111111111111111111EEEEEEEEEEEE.EEEEEEEEE
 10                     1111111111111111111%EEEEEEEEEEEEEEEEEEEEEE
 11                     1111111111111111111%EEEEEEEEEEEEEEEEEEEEEE
 12     UUUUUUUUUUUUUUUU11111111111111111111EEEEEEEEEEEEEEEEEEEEEE
 13     UUUUUUUUUUUUUUUU11111111111111111111EEEEE.EEEEEEEEEEEE.EEE
 14     UUUUUUUUUUUUUUUU11111111111111111111EEEEEEEEE//EEEEEEEEEEE
 15     UUUUU.UUUUUUUUUU11111111111111111111EEEEEEEEE//EEEEEEEEEEE
 16     UUUUUUUUUUUUUUUU11111111111111111111EEEEEEEEE//EEEE.EEEEEE
 17     UUUUUUUUUUUUUUUU11111111111111111111EEEEEEEEE//EEEEEEEEEEE
 18     UUUUUUUUUUUUUUUUPPPPPPPP##PPPPPPPPPP  222222222222222222
 19     UUUUUUUUUUUUUUUUPPPPPPPPPPPPPPP.PPPP  222222222222222222
 20     UUUUUUUUUUUUUUU+//PPPPPPPPPPPPPPPPPP  222222222222222222
 21     UUUU.UUUUUUUUUU+//PPPPPPPPPPPPPPPPPP  222222222222222222
 22     UUUUUUUUUU.UUUUUPPPPPPPPPPPPPPPPPPPP  222222222222222222
 23     UUUUUUUUUUUUUUUUPPPPPPPPPPPPPPPPPPPP  222222222222222222
 24     UUUUUUU//UUUUUUUPPPPPPPPPPPPPPPPPPPP  222222222222222222
 25     UUUUUUU//UUUUUUUPPPPPPPPPPPPPPPPPPPP  222222222222222222
 26     CCCCCCCxxCCCCCCCPPPPPPPPPPPPPPPPPPPP  222222222222222222
 27     CCCCCCCCCCCCCCCCPPPPPP.PPPPPP.PPPPPP  222222222222222222
 28 yyyyCCCCCCCCCCCCCCCCPPPPPPPPPPPPPPPPPPPP  222222222222222222
 29 yyyyCC.CCCCCCCC.CCCCPPPPPPPPPPPPPPPPPPPP  222222222222222222
 30 yyyyCCCCCCCCCCCCCCCCPPPPPPPPPPPPPPPPPPPP  222222222222222222
 31 yy.yCCCCCC.CCCCCCCCCPPPPPPPPPPPPPPPPPPPP  2222222%%222222222
 32 yyyy+CCCCCCCCCCCCCCCPPPPPPPPPPPPPPPPPPPP  TTTTTTTTTTTTTTTTTT
 33 yyyy+CCCCCCCCCCCCCCCPPPPPPPPPPPPPPPPPPPP  TTTTT.TTTTT.TTTT.T
 34 yyyyCCCCCCCCCCCCCCCC  ggxxgggg            TTTTTTTTTTTTTTTTTT
 35 yyyyCCCCCCCCCCCCCCCC  gggggggg            TT~TTTTT.TTTTTTT~T
 36 yyyyCCCCCCCCCCCC.CCC  ////////            TTTTTTTTTTTTTTTTTT
 37 yyyyCCCCCCCCCCCCCCCC  ////////            TTTTTTT##TTTTTTTTT
 38     CCCCCCCCCCCCCCCC  ////////            333333333333333333
 39     CCCCCCCCCCCCCCCC  ////////            333333333333333333
 40         LLL++LLLLL    ////////KKKKKKKKKKKK333333333333333333
 41         LLLLLLLLLL    ////////KKKKKKKKKKKK333333333333333333
 42         LLLLLL.LLL    ////////KKKKKKKKKKKK333333333333333333
 43         LLLLLLLLLL    ggggggggKKKK.KKKKKKK333333333333333333
 44         LLLLLLLLLL    ggggggggKKKKKKKKKKKK%33333333333333333
 45         LLLLLLLLLL    ggggggggKKKKKKKKKKKK%33333333333333333
 46       BBBBB++BBBBBBBBxggggggggKKKKKKKKKKKK333333333333333333
 47       BBBBBBBBBBBBBBBxggggggggKKKKKKKKK.KK333333333333333333
 48       BBB~BBBBBBBBB~BB        KKKKKKKKKKKK333333333333333333
 49       BBBBBB.BBBBBBBBB        KKKKK++KKKKK333333333333333333
 50       BBBBBBBBBBBBBBBB        kkkkkkkkkkkk333333333333333333
 51       BBBBBBBBBBB.BBBB        kkk.kkkk.kkk333333333333333333
 52       BBBBBBB.BBBBBBBB        kkkkkkkkkkkk
 53       BBBBB.BBBBBBBBBB        kkkk===kkkkk
 54       BBBBBBBBBBBBBBBB        kkkkkkkkkkkk
 55       BBB~BBBBBBBBB~BB        kkkkk##kkkkk
 56       BBBBBBBBBBBBBBBB    444444444444444444
 57       BBBBBBBBBBBBBBBB    444444444444444444
 58         AAAAA++AAAAA      444444444444444444
 59         AAAAAAAAAAAA      444444444444444444
 60         AAAAAAAAAAAxhh==h#444444444444444444
 61         AAAAAFAAAAAxhh==h#444444444444444444
 62         AAAAAAAAAAAA      444444444444444444
 63         AAAAASAAAAAA      444444444444444444
 64         AAAAAAAAAAAA      444444444444444444
 65         AAAAAAAAAAAA      444444444444444444
 66                           444444444444444444
 67                           444444444444444444
 68                           444444444444444444
 69                           444444444444444444
```

### 3.2 Rooms

`floor / wall` use existing styles plus the NEW `marble`, `arcane`, `library` (NP-14). `autoDecor` is the builder's seeded clutter density; rooms marked **explicit** set `explicitDecor: true`. `floorY` and `ceiling` are the ENGINE_VERTICALITY fields (absolute metres; `ceiling` is the clear height above the room's highest floor; `open` = `openAir: true`, no lid, sky backdrop). `H` column = what the room does vertically.

| id | Ad (TR) | rect x,z,w,h | size (m) | floorY | ceiling | floor / wall | autoDecor | forces | purpose / vertical role |
|---|---|---|---|---|---|---|---|---|---|
| `giris` | Sessiz Fuaye | 8, 58, 12, 8 | 48 x 32 | 0 | 14 | marble / arcane | 0.3, explicit | - | start, Kehanet Taşı, countdown barrier; east door to the service corridor |
| `guney_antre` | Güney Antre Salonu | 6, 46, 16, 12 | 64 x 48 | 0 | 18 | marble / arcane | 0.4 | 60 | first trash room; colonnade, decorative arcade galleries at 6.5 m |
| `lycaneum` | Lycaneum Geçidi | 8, 40, 10, 6 | 40 x 24 | 0 | 12 | marble / library | 0.1, explicit | 10 | library gauntlet, Arcane Tome; low and tight on purpose |
| `gizem_arsivi` | Gizem Arşivi | 4, 26, 16, 14 | 64 x 56 | 0 | 26 | marble / library | 0.3, explicit | 65 | the loading-screen hall: two decorative gallery rings (7.5 and 14 m), chandeliers, kill-locked north door |
| `yasak_raflar` | Yasak Raflar | 0, 28, 4, 10 | 16 x 40 | 0 | 20 | stone_dark / library | 0.3 | 15 (optional) | dead-end stacks, tall narrow shelves, chest |
| `ust_kutuphane` | Üst Kütüphane | 4, 12, 16, 14 | 64 x 56 | **2.7** | 20 | wood / library | 0.3, explicit | 50 | level 1: reached by a grand library stair (`st_arsiv_ust`); balconies flank the stairwell |
| `meydan` | Yıldız Meydanı | 20, 18, 20, 16 | 80 x 64 | **5.4** | 10 (open) | marble / arcane | 0.15, explicit | 52 | level 2 hub: reached by `st_ust_meydan`; **ledge** (8.4 m) for the elevated pack; sealed grand stair gate below |
| `buyuk_merdiven` | Büyük Merdiven | 22, 34, 8, 14 | 32 x 56 | 0 (+5.4 landing) | 24 | marble / arcane | 0.05 | - | the 20-tread grand staircase `grand_stair` (5.4 m rise) between the antechamber and the plaza; death-run shortcut |
| `gozlemevi` | Gözlemevi Bahçeleri | 20, 2, 20, 16 | 80 x 64 | 5.4 | 10 (open) | marble / arcane | 0.1, explicit | - | **Boss 1** arena (Arkanotron); decorative balconies at 11 m |
| `enerji_avlusu` | Enerji Avlusu | 40, 6, 22, 12 | 88 x 48 | 5.4 | 10 (open) | marble / arcane | 0.2, explicit | 71 | courtyard, 4 energy pylons; a descent stair (`st_avlu_sig`) in its south edge leads down to boss 2 |
| `balkon` | Güneş Kuyusu Balkonu | 48, 0, 12, 6 | 48 x 24 | 5.4 | 8 (open) | marble / arcane | 0.1, explicit | 15 (optional) | optional vista over the Sunwell well, phoenix statues, chest |
| `siginak` | Başbüyücü Sığınağı | 42, 18, 18, 14 | 72 x 56 | **2.7** | 18 | stone_dark / temple | 0.1, explicit | - | **Boss 2** arena (Seranel), sunken round chamber, suppression dome |
| `teras_yolu` | Teras Yolu | 42, 32, 18, 6 | 72 x 24 | 2.7 | 8 (open) | marble / arcane | 0.2 | 66 | open terrace promenade, patrol, stealth lane, 3 cover columns |
| `takimyildiz` | Takımyıldız Odası | 42, 38, 18, 14 | 72 x 56 | 2.7 | 30 (open dome) | marble / arcane | 0.1, explicit | - | **Boss 3** arena (Gemellus); the tallest hall, 12 columns |
| `kule_tabani` | Teori Kulesi Tabanı | 30, 40, 12, 10 | 48 x 40 | 2.7 | 28 | stone_dark / arcane | 0.3 | 47 | tower base, two Devouring Tyrant pulls, central gear shaft (decor pit), 2 decorative gallery rings |
| `kule_merdiveni` | Teori Kulesi Merdiveni | 30, 50, 12, 6 | 48 x 24 | 2.7 (+13.5 landing) | 28 | stone_dark / temple | 0.2 | 42 | last pulls, 6 cover columns, **tower lift** `lift_kule` (2.7 to 13.5 m) |
| `hizmet_koridoru` | Hizmet Koridoru | 20, 60, 6, 2 | 24 x 8 | 0 (+13.5 east end) | 7 | stone_dark / arcane | 0 | - | sealed corridor with **service lift** `lift_hizmet` (0 to 13.5 m); opens at boss 3's death |
| `goksel_yorunge` | Göksel Yörünge | 26, 56, 18, 14 | 72 x 56 | **13.5** | 40 (open void) | stone_dark / temple | 0.05, explicit | - | **Boss 4** arena (Degentrius), void ring with a real fall, dais, two bridges |

Room `boss` fields: `gozlemevi` 1, `siginak` 2, `takimyildiz` 3, `goksel_yorunge` 4. `optional: true`: `yasak_raflar`, `balkon`. There is no `skip` room: the WoW shroud skip is a lane inside `teras_yolu` (3.5). `hizmet_koridoru` is not optional and not on the critical path: it is the death-run shortcut (3.5 SP11).

### 3.2b Vertical design (ENGINE_VERTICALITY data)

**Levels.** L0 = 0 m (foyer, antechamber, lycaneum, atheneum, stacks). L1 = 2.7 m (upper library; sunken asylum, terrace, constellarium, tower base and stair). L2 = 5.4 m (plaza, observatory, courtyard, balcony). L3 = 13.5 m (landing and orrery). Total relief 13.5 m, tallest hall 30 m (constellarium, absolute lid at 32.7 m).

**Side elevation of the critical path** (not to scale horizontally; 1 row = 0.9 m; `/` and `\` = stair strips, `#` = lift shaft):

```
 13.5 |                                                                                                 #_________
      |                                                                                                 #
      |                                                                                                 #
      |                                                                                                 #
      |                                                                                                 #
      |                                                                                                 #
      |                                                                                                 #
      |                                                                                                 #
      |                                                                                                 #
  5.4 |                                       /______________________                                   #
      |                                      /                       \                                  #
      |                                     /                         \\                                #
  2.7 |                            /________                            \_______________________________#
      |                           /
      |                          /
  0.0 |__________________________
      +-----------------------------------------------------------------------------------------------------------
       Fuaye Antre   Lyc Arsiv      UstKut     Meydan  [B1]  Avlu        [B2]  Teras   [B3]  Kule  Merd  [B4]
```

Other routes: **Büyük Merdiven** (after boss 1): antechamber `B` straight up the 20-tread stair to the plaza. **Service corridor** (after boss 3): foyer `A` east through `h`, lift `#` from 0 to 13.5 m, straight into the orrery `4`.

**Stair strips (`RoomDef.slopes`, absolute metres, `SlopeDef` of ENGINE_VERTICALITY; every one checked: grade at most 0.8, tread depth at least 0.45 m, door height match at most 0.45 m).**

| id | room | rect x,z,w,h | axis | yFrom to yTo | rise / run / grade | treads x depth | style |
|---|---|---|---|---|---|---|---|
| `st_arsiv_ust` | ust_kutuphane | 11, 24, 2, 2 | z | 2.7 to 0.0 (min edge north = high) | 2.7 / 8 m / 0.34 | 10 x 0.80 m | stone, wood rails |
| `st_ust_meydan` | meydan | 20, 20, 2, 2 | x | 2.7 to 5.4 | 2.7 / 8 m / 0.34 | 10 x 0.80 m | stone |
| `grand_stair` | buyuk_merdiven | 22, 36, 8, 7 | z | 5.4 to 0.0 | 5.4 / 28 m / 0.19 | 20 x 1.40 m | **carpet** (red runner, gold trim) |
| `st_avlu_sig` | enerji_avlusu | 49, 14, 2, 4 | z | 5.4 to 2.7 | 2.7 / 16 m / 0.17 | 10 x 1.60 m | stone |

**Plateaus (`RoomDef.heightAreas`):** `meydan` ledge `{ rect 31,18,8,2, y 8.4, rim 'rail' }` (3 m above the plaza: out of melee reach by the 2.5 m height gate, ranged and caster hits too, until the pack drops); `buyuk_merdiven` top landing `{ rect 22,34,8,2, y 5.4 }` (the bottom landing is the room's `floorY 0`); `kule_merdiveni` upper landing `{ rect 30,54,12,2, y 13.5, rim 'rail' }`; `hizmet_koridoru` east end `{ rect 24,60,2,2, y 13.5 }`.

**Lifts (`DungeonDef.lifts`, `mode: 'call'`: the host sends the pad when a player stands on it for 0.6 s; players only, enemies never ride lifts and never path through pads):**

| id | room | pad rect | stops | speed | trip | adjoining floors (E6, within 0.15 m) |
|---|---|---|---|---|---|---|
| `lift_kule` (Teori Asansörü) | kule_merdiveni | 34, 53, 3, 1 | [2.7, 13.5] | 4.0 m/s | 2.7 s plus ease 0.7 s | stop 0: lower floor row 52 (2.7); stop 1: landing row 54 (13.5), which holds the boss 4 door |
| `lift_hizmet` (Hizmet Asansörü) | hizmet_koridoru | 22, 60, 2, 2 | [0, 13.5] | 4.5 m/s | 3.0 s plus ease 0.7 s | stop 0: west end x 21 (0); stop 1: east end x 24 (13.5) |

The pads' two non-active sides must be railed (side blockers: 3.7). Lifts are never inside a boss arena and no pack stands on a pad.

**Decorative upper tiers (`RoomDef.tiers`, non-walkable, `fadeable`):** listed per room in 3.7 (gallery rings at 6.5 / 7.5 / 9 / 10 / 14 / 18 m, colonnades, window rows, ceiling beams). Chandeliers, banners and statues use `PropPlacement.hang` and `absY`.

**Chasm and bridges (WoW model: the orrery platform floats in the void).** `goksel_yorunge` has `ZoneDef.fall: 'open'` on the black void ring (r 6.8 tiles, depth 30 m): falling costs 25 % max HP (`VERT.VOID_DMG_FRAC`) and respawns the player on the last safe sample (the bridge head or the dais edge). Two real **bridges** (decks at 13.5 m, 8 m wide, rails) lead from the doors to the dais: north (from the lift landing door) and west (from the service corridor). The kit `bridge` zones keep open edges next to the void, that is how you fall. Boss 4's mechanics never knock a player toward the rim (Hulking Fragment knockback is 9 m from the hub; the dais edge is 20.8 m out), so a fall is player error (a roll off the rim), see 5.4.

**Combat on height:** melee and shapes ignore differences of 2.5 m or less (`VERT.TOL_MELEE`). Consequences used by the design: packs on the stairwell balconies of `ust_kutuphane` (2.7 m) cannot hit players on the lowest stair treads (0 m, 2.7 m below) and the other way round; the plaza ledge pack is untouchable (3 m); everything else is within the gate.

### 3.3 Doors

All doors are 2 tiles wide (8 m). `tile` is a tile inside room `a` on the shared edge; width extends +X for `n`/`s` doors and +Z for `e`/`w` doors. **19 doors.**

| a | b | tile (in a) | side | gate | note |
|---|---|---|---|---|---|
| giris | guney_antre | 13, 58 | n | none | countdown barrier during the 10 s start |
| guney_antre | lycaneum | 11, 46 | n | none | |
| lycaneum | gizem_arsivi | 11, 40 | n | none | |
| gizem_arsivi | yasak_raflar | 4, 32 | w | none | optional |
| gizem_arsivi | ust_kutuphane | 11, 26 | n | **`kill_lock`** (NEW NP-01) | opens when the Pyromancer of `mt_p06` dies (`opensOn: { pack: 'mt_p06', enemyId: 'mt_pyromancer' }`); stair `st_arsiv_ust` begins right behind it |
| ust_kutuphane | meydan | 19, 20 | e | none | stair `st_ust_meydan` begins right behind it |
| guney_antre | buyuk_merdiven | 21, 46 | e | **`kill_lock`** | opens when boss 1 dies (`opensOn: { boss: 1 }`) |
| buyuk_merdiven | meydan | 24, 34 | n | **`kill_lock`** | same |
| meydan | gozlemevi | 28, 18 | n | boss_lock | boss order 1 |
| gozlemevi | enerji_avlusu | 39, 10 | e | boss_exit | |
| enerji_avlusu | balkon | 53, 6 | n | none | optional |
| enerji_avlusu | siginak | 49, 17 | s | boss_lock | boss order 2; bottom of `st_avlu_sig` |
| siginak | teras_yolu | 49, 31 | s | boss_exit | |
| teras_yolu | takimyildiz | 49, 37 | s | boss_lock | boss order 3 |
| takimyildiz | kule_tabani | 42, 44 | w | boss_exit | |
| kule_tabani | kule_merdiveni | 35, 49 | s | none | |
| kule_merdiveni | goksel_yorunge | 35, 55 | s | boss_lock | boss order 4; the door sits on the lift landing (13.5 m) |
| giris | hizmet_koridoru | 19, 60 | e | **`kill_lock`** | `opensOn: { boss: 3 }`: the service corridor is sealed until Gemellus is dead |
| hizmet_koridoru | goksel_yorunge | 25, 60 | e | **`boss_lock`** | order 4. Used instead of a second `kill_lock` so the door also closes 3 s after Degentrius engages (a released player cannot walk into a running fight) and stays closed while any lower boss lives; the result before the fight is identical to `opensOn: { boss: 3 }` |

`kill_lock` is a new `DoorDef.gate` value, see NP-01. **Data-only fallback (MT-A can ship before NP-01):** `gate: 'none'` only on the library door (`gizem_arsivi` to `ust_kutuphane`: the dungeon still works, the Pyromancer just does not gate the library). **Omit `buyuk_merdiven`, `hizmet_koridoru` and all four doors that touch them** (both Büyük Merdiven doors and both service-corridor doors), because with open gates they would be minute-0 shortcuts (start to plaza in about 25 s, start to orrery in about 12 s) and would break the timing of 6.2. Without the shortcuts the death runs are the long ones of 6.7 (accepted until NP-01 lands). `lift_hizmet` is also omitted in the fallback; `lift_kule` stays.

### 3.4 Critical path, optional areas, skips

Critical path (14 rooms, 4 boss locks): `giris` > `guney_antre` > `lycaneum` > `gizem_arsivi` > (kill_lock, stair up) `ust_kutuphane` > (stair up) `meydan` > (boss_lock) **`gozlemevi`** > (boss_exit) `enerji_avlusu` > (stair down, boss_lock) **`siginak`** > (boss_exit) `teras_yolu` > (boss_lock) **`takimyildiz`** > (boss_exit) `kule_tabani` > `kule_merdiveni` > (lift up, boss_lock) **`goksel_yorunge`**.

| Branch / skip | What | Forces | Time cost |
|---|---|---|---|
| `yasak_raflar` (optional room) | Pyromancer + 4 Codices, `chest_iron` (gold + globe in M+) | 15 | about 0:50 |
| `balkon` (optional room) | Sentry + Mechanoid, Sunwell vista, `chest_gold` | 15 | about 0:55 |
| Skippable packs in the route | `mt_p04` antechamber patrol 10, `mt_p09` library Codex swarm 16, `mt_p20` courtyard Pyromancer 15, `mt_p25` terrace patrol 10 | 51 | see 6.3 |
| Stealth lane (rogues, shroud effects) | walk the south edge of `teras_yolu` past `mt_p22`..`mt_p24` | up to 56 | about 1:30 saved, forces must then come from elsewhere |
| Death-run shortcut A | `buyuk_merdiven` opens at boss 1 death: a dead player released at the start (M+ rule) reaches the plaza in about 25 s instead of about 60 s | - | quality of life |
| Death-run shortcut B | `hizmet_koridoru` opens at boss 3 death: start to the orrery in about 12 s instead of about 75 s | - | keeps boss 4 deaths cheap (6.7) |
| Forced pulls | Devouring Tyrants between boss 3 and boss 4 are on every route (WoW: "Devouring Tyrants appear between boss 3 and boss 4 on every route") | 89 | none |

### 3.5 Set-piece mechanics and how to build them

Each entry: WoW source, what the player does, the build. NP = new shared primitive, specified once in 8.2. **Headline trash set pieces (user rule: 1 to 2 per dungeon): SP1 Lycaneum Gaze Gauntlet and SP4 Plaza Elevated Pack.** The others are supporting.

**SP1. Lycaneum library gauntlet (Kitaplık Geçidi).** WoW: librarians send you back to the entrance if you come too close; an Arcane Tome near the path gives 5 % haste for 30 min (survives death).
- Layout: the hall is 40 x 24 m. Three rows of collidable bookcases (`bookcase_arched`, fallback `fu('shelf_A_big')` scale 2.2) make a serpentine lane about 8 m wide: row 1 along z 44.0 from x 7.5 to 14.5, row 2 along z 42.0 from x 10.5 to 17.5, row 3 along z 40.6 from x 12.5 to 17.5. The lane runs: enter (11.5, 45.2), east to the gap at x 15 to 17.5, north, west along z 43 to the gap at x 8 to 10.5, north to z 41, east to the door at x 11.5. The Arcane Tome lectern stands in the west alcove at (8.2, 40.8).
- Watchers (**NP-03 GazePatrol**): `mt_librarian` x 3 (hooded statue bodies, `ai.stationary`, invulnerable, not in any pack). A: (17.2, 44.5) faces -90, sweep +-45 deg, period 5 s. B: (7.8, 42.5) faces 90, sweep +-45 deg, period 6 s, offset 2 s. C: (13.5, 39.9) faces 0, sweep +-60 deg, period 7 s. Cone radius 10 m, angle 55 deg, line of sight required, grace 0.45 s. Seen: toast "Sessiz olun!", white flash, the player is teleported to the start room (13.5, 63.5) and gets `slow` 3 s. Stealthed players (`stealth`, `veil`, `ambush`, `dancer` statuses) are not seen.
- Pack `mt_p05` (5 dormant Codices in the shelves of the north end, `dormant: { kind: 'ceiling', wakeRadius: 8 }`) punishes fighting in view of a librarian (the pull itself is fine, being seen is not).
- Arcane Tome (**NP-04 Boon**): `boon_tome`, 30 min `haste` 5 %, persists through death, once per player per run, F to read.

**SP2. Pyromancer library door.** WoW: killing the Blazing Pyromancer opens the library door. Build: `kill_lock` door (NP-01) on `gizem_arsivi` north edge. The door model is `wall_gated` with an amber barrier VFX (`aegis_ring`); on open the builder lifts the gate and a toast "Kütüphane kapısı açıldı!" plays. The Pyromancer is CC-immune and has a posture bar (100): kill order is Pyromancer first (his Pyroblast is the must-kick, his Ignition is answered by a poise break). Behind the door the 8 m stair `st_arsiv_ust` climbs 2.7 m into the upper library: the party sees the balconies and their packs from the stair head.

**SP3. Büyük Merdiven (grand stair) shortcut.** Not in WoW's text; our M+ rule is that deaths release at the start (`GDD_CONTENT` 0.7). A sealed grand stair joins the antechamber to the plaza and opens at boss 1's death (`opensOn: { boss: 1 }`). It is the biggest set piece of the dungeon: a 32 m wide, 24 m tall hall, a 28 m long, 20-tread carpeted stair rising 5.4 m between braziers, tall banners and colonnade arcades; you see it sealed behind the gate from both ends before you can use it (from the plaza the gate is at the foot of a stair you cannot yet climb down).

**SP4. Plaza elevated pack (reverse order doubles the count).** WoW: clearing the plaza brings down an elevated pack; pulling in the wrong order doubles the count. Build: `mt_p16` (Sentry + 2 Infusers, centre (34.5, 18.5)) stands on the **ledge** (`heightAreas` y 8.4, 3 m above the plaza, a parapet row of `kc('wall-half')` plus hooded statues): real height, own nav region, unreachable and untargetable by melee, and `dormant: { kind: 'ceiling', wakeRadius: 0 }`. **NP-02 `wakeWhen`**: it wakes when `mt_p14` and `mt_p15` are both cleared, **leaps down** (scripted `forcedMove` with `vy`, `leap_land` VFX, short camera shake) to (31.0, 24.5) and joins the plaza region from there, and it has `linkedTo: ['mt_p13']` so that if the sentry pack of the upper library is still alive it joins (the "doubling"). The normal route clears the upper library first, so the trap only bites players who skip packs. Because the ledge is out of the 2.5 m height gate, ranged DPS cannot cheese it with spells before the drop either.

**SP5. Energy Courtyard crystals (Selin Fireheart homage; WoW: "Energy Crystals can be drained for a temporary damage and healing boost").** Four `energy_pylon` props at (42, 8), (58, 7.5), (42, 16), (59, 16), `tag: 'boon'` (**NP-04**). Interact (F): the user gets `crystal_power` (+12 % damage and healing, 30 s, a normal buff), the crystal dims for that player and recharges after 90 s. Place them so the party can use them before the big pulls `mt_p17` + `mt_p18`. The crystals are the visual landmark of the courtyard (cyan light, 7 m).

**SP6. Terrace stealth lane.** WoW: rogues and druids can shroud past several packs between boss 2 and 3. Build with no new code: the three promenade packs (`mt_p22`..`mt_p24`) are centred on z 33 with `aggro` 9 m; a narrow lane of floor along z 36.5 to 37.3 (outlined on its north side by the 3 cover columns of SP12 and, for the east half only, balustrade props) is 14 m or more from them. A stealthed player (statuses above) passes; the patrol `mt_p25` runs on z 34.5 and its timing is the skill check. Skipping the three packs removes 56 forces, so the party must find them elsewhere (6.3 Route B).

**SP7. Güneş Kuyusu Balkonu (new Midnight area).** Optional room, no boss. A round light-well in the floor: `circleZone('pool', 53.5, 1.0, 2.2, { blocked: true, color: 0xffd77a, glow: 0xffd77a, glowIntensity: 1.4, light: lt(0xffd77a, 1.8, 14, false, 0.8) })` ringed by balustrade props. It reads as looking down at the Sunwell (the pool is a solid hole, no fall). Two `phoenix_statue` flank the door; `chest_gold` at (56, 2.5); the `sunwell_glow` shaft stands up behind the cliff edge. Pack `mt_p21`.

**SP8. Tower of Theory ascent (heights and the lift).** `kule_tabani` (2.7 m, ceiling 28 m) is a tall tower base: a central brass gear shaft (`orrery_rings` x 0.4 spinning around gold columns, a `void` pit zone in the floor without `fall`, ringed by a balustrade), two decorative gallery rings at 10 and 18 m, brass pipes, per-room fog moving from plum to violet (tabani `0x1a1240`, merdiveni `0x180e3a`), `ambient_shadow_wisps`, void cracks widening room by room. `kule_merdiveni` is the last fighting room: p28 and p29 fight on the lower floor (rows 50 to 53, 2.7 m); the south two rows are a **13.5 m landing** behind a railed cliff; the only way up is the **Teori Asansörü** (`lift_kule`), a chained arcane platform that rises 10.8 m in 3.4 s with the party on it (a scripted moment: the camera pulls out, the orrery rings come into view). Decor spiral stairs wind up the walls to the landing (non-walkable) so the tower reads as climbed. Tyrants spawn visibly (not dormant).

**SP9. Göksel Yörünge platform.** Existing zones plus the fall, applied in this order inside `goksel_yorunge` (floorY 13.5): `circleZone('void', 34.5, 62.5, 6.8, { blocked: true, fall: 'open', depth: 30, color: 0x05031a, glow: 0x8a3cff, glowIntensity: 0.9, vfx: 'ambient_stardust' })`, then `circleZone('dais', 34.5, 62.5, 5.2, { color: 0x2a2340 })`, then two bridges: `rectZone('bridge', 35, 56, 2, 2, ...)` from the north door (tiles x 35 to 36, z 56 to 57) and `rectZone('bridge', 26, 60, 4, 2, ...)` from the west door (tiles x 26 to 29, z 60 to 61), both 8 m wide with rails. The `orrery_rings` prop floats at y 6.5 above the floor (absolute 20 m) centred on the dais; four `lens_obelisk` at the diagonals (3.6 anchors below); the **hub** (r 5 m around the dais centre) is where the boss and the tank stand and is beam-free (5.4).

**SP10. Seranel's Suppression Dome.** See boss 2. Floor ring `circleZone('rune', 50.5, 24.5, 2.0, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.9 })` plus the live `aegis_dome` VFX.

**SP11. Service corridor and lift (death-run shortcut B).** `hizmet_koridoru` is a 24 x 8 m sealed stone gallery east of the foyer with a chain-hung lift pad and two gates. Before boss 3 dies both gates show amber barriers (`aegis_ring`) and a plaque ("Hizmet geçidi: Başbüyücü Meclisi mührü"); when Gemellus dies the west gate lifts (kill_lock) and the east gate is released (boss_lock, order 4). From then on a released player runs foyer, corridor, lift, bridge in about 12 s to the orrery; during the Degentrius fight the east door is shut, so nobody walks into a running fight. NP-01 covers the west gate; the east gate is an ordinary `boss_lock`.

**SP12. Cover for Consuming Shadows (break line of sight).** The voidcaller's Consuming Shadows (coef 2.4, 38 m, not stoppable) needs real cover in every room that has a voidcaller pack (`mt_p11` upper library, `mt_p22` terrace, `mt_p28` tower stair). Upper library: 4 freestanding collidable bookcases (3.7). Terrace: **3 collidable columns** (`kg('column-large')` scale 3, collide) at (44.5, 36.2), (47.5, 36.2), (51.5, 36.2) beside the stealth lane. Tower stair: **6 collidable columns** at (30.8, 50.6), (30.8, 52.6), (40.6, 50.6), (40.6, 52.6), (32.2, 52.8), (37.8, 52.8) on the lower floor (the two on the south row flank the lift pad). Every column keeps a nav gap of at least 2 m to walls, neighbours and the cliff edge (validated). Listed again in Appendix A (`COLS`).

### 3.6 Boss arena anchors (GDD coordinates; world = (c + 0.5) * 4, y from the heightfield)

Keep these lists identical in the data file and in the boss script (same rule as `golge_tapinagi.ts`). Boss arenas are single nav regions (ENGINE_VERTICALITY E6): `goksel_yorunge` is one region (dais plus both bridges plus the landing it connects to).

| Boss room | centre | bounds (continuous) | `BossDef.arena` {cx, cz, w, h, homeX, homeZ} (metres) | boss spawn | `arenaRadius` | anchors |
|---|---|---|---|---|---|---|
| `gozlemevi` | (29.5, 9.5) | x 19.5..39.5, z 1.5..17.5 | {120, 40, 80, 64, 120, 26} | (29.5, 6.0) facing 0 | 30 | 8 orb ports `ORB_PORTS` below |
| `siginak` | (50.5, 24.5) | x 41.5..59.5, z 17.5..31.5 | {204, 100, 72, 56, 204, 112} | **(50.5, 27.5)** facing 180 | 26 | dome centre (50.5, 24.5) r 8 m (2 tiles); the stair `st_avlu_sig` lands at the north door, so the boss waits south of the dome, with the Cynosure crystal behind it at (50.5, 30.2) |
| `takimyildiz` | (50.5, 44.5) | x 41.5..59.5, z 37.5..51.5 | {204, 180, 72, 56, 204, 168} | (50.5, 41.5) facing 0 | 26 | clone drift bounds = room minus 3 tiles; 12 columns on r 6 tiles |
| `goksel_yorunge` | (34.5, 62.5) | x 25.5..43.5, z 55.5..69.5 | {140, 252, 72, 56, 140, 252} | (34.5, 62.5) facing 0 | 21 | lens obelisks, soak slots, hub r 5 m below |

`ORB_PORTS` (Arkanotron wall ports, GDD coordinates, skip the door gaps): north wall z 2.0: (24, 2), (29.5, 2), (35, 2); west wall x 20.0: (20, 6), (20, 13); east wall x 39.0: (39, 5.5), (39, 14); south wall z 17.0: (23, 17), (36, 17). Distances from the boss at the arena centre: 30 to 41 m.

`LENS_OBELISKS` (Degentrius, diagonals at r 4.4 tiles): NE (37.6, 59.4), SE (37.6, 65.6), SW (31.4, 65.6), NW (31.4, 59.4). **Beam geometry (revised):** a beam is not a diameter through the boss. Every torrent beam is a line segment that starts at the **hub edge (5 m from the dais centre)** and runs outward to 22 m, so the stationary boss and the melee stack in the hub never take a beam. Two segments on opposite sides of the centre are **one line** ("a pair"); phase 1 therefore has **one rotating line** (two beams, obelisks NE and SW), phase 2 alternates the two lines (NE-SW then NW-SE, every 7 s), phase 3 has **two crossing lines** (four beams). The obelisk lens nodes rotate to face along their beam (visual only).

`SOAK_SLOTS` (Unstable Void Essence, cardinals at r 3.2 tiles): N (34.5, 59.3), E (37.7, 62.5), S (34.5, 65.7), W (31.3, 62.5), radius 3 m each.

### 3.7 Per-room set dressing (the detail brief for the theme / props package)

This is one of the 8 maps Mythic+ rotates on, so every room gets a full list: **props with counts, real lights, VFX, sound**, plus its vertical dressing (`tiers`, tall banners, hung chandeliers). Use the helpers of `kit.ts` (`Props.at`, `wall`, `torches`, `ring`, `row`, `grid`, `scatter`), the `D.room(id, (p, r) => ...)` pattern of `golge_tapinagi.ts`, and keep **one real light per cluster** (the rest is emissive or `halo`): budget about 10 real lights in view (ROADMAP perf budget), instanced props through `InstanceBatcher`. Heights: wall mounts at `MOUNT_Y` 2.5, high mounts at 6 to 12 m via `absY`, hung pieces via `hang: true` (chains to the lid). Coordinates are GDD tile coordinates (x, z); tier heights written as numbers here are metres above the room's own `floorY` (Appendix A stores them as absolute `y`). `(fb: ...)` = fallback asset until the Blender prop exists.

New decor props used below (MT-F builds them, see 2.6): `star_chandelier` (fb: `ip('psx-dungeon','chandelier')` x 1.6), `magister_statue` (fb: `gp('statue_hooded')` tinted lilac), `banner_sun_tall` (fb: `dg('banner_patternB_red')` scaled [1.2, 3, 1]), `arcane_lift_pad` (fb: `dg('floor_foundation_allsides')` scaled [3, 0.4, 1] plus `ip('psx-dungeon','chain')` x 4), `bookcase_arched` (fb: `fu('shelf_A_big')` x 2.2). Ambience ids marked NEW are appended to `AMBIENCE_MANIFEST` (MT-I) and alias to existing beds until real loops exist: `amb_library` (= `amb_dungeon_bed` at 0.35 plus page rustle), `amb_sea` (= `amb_wind` plus surf), `amb_gears`, `amb_beacon`, `amb_orrery`, `amb_sunwell`, `amb_whispers`. SFX families named below exist today under `public/assets/audio/sfx/` (`world/`, `magic/`, `creatures/`, `ambience/`).

**1. `giris` Sessiz Fuaye** (0 m, ceiling 14, 48 x 32 m)
- Vertical: `windows` tier y 6 (3 tall arched windows, west wall, moonlight shafts), banner row hung 6 to 12 m.
- Props: Font of Power x 1 at (13.5, 61) (`gp('font_of_power')`, id `font_of_power`, `tag: 'socket'`); `gp('brazier')` x 2 at (11.5, 61), (15.5, 61); crimson runner = `fu('rug_rectangle_stripes_A')` x 3 tinted `0x8a1c30` end to end from (13.5, 63.2) to the north door; `banner_sun_tall` x 4 (2 flanking the north door, 2 on the west wall; one uses the Sunstrider "sun with a falling star" crest); `magister_statue` x 2 at (10, 63), (17, 63); `star_chandelier` x 2 at (11, 61), (16, 61) hung from 14 m; `dg('candle_triple')` x 8 ring r 2 around the Font; `fu('table_medium')` x 1 with `fu('book_set')` x 2 at (17.5, 60) (the "key notice" desk); `gp('lamp_post')` x 2 at the east door; `Props.torches` x 6; east door gate prop (kill_lock to the service corridor) with amber `aegis_ring`.
- Lights (real: 4): Font cyan `0x5fd3e8` 2.2 / 12; 2 braziers amber 1.8 / 10; 1 chandelier amber 1.8 / 11 (the second is `halo`).
- VFX: `brazier_fire` x 2, `candle_flame` x 8, `ambient_dust` starlight tint, Font cyan rune ring r 1.7 (zone), `keystone_insert` at the Font on use.
- Sound: bed `amb_dungeon_bed` 0.35, `amb_torch` positional x 2, Font hum (`magic/shimmer_01` filtered loop, radius 8), a distant `world/bell_heavy` pitched 1.4 every 45 to 80 s.

**2. `guney_antre` Güney Antre Salonu** (0 m, ceiling 18, 64 x 48 m)
- Vertical: decorative arcade `gallery` tier y 6.5 depth 3 along both long walls with `colonnade` y 6.5 count 8; `windows` y 11 x 4 per long wall; banners hung 7 to 15 m.
- Props: `kg('column-large')` x 8 (collide) in two rows at x 9.5 and 17.5, z 48.0 / 50.6 / 53.2 / 55.8; `star_chandelier` x 3 at (13.5, 48.5), (13.5, 51.5), (13.5, 54.5) hung from 18 m; `banner_sun_tall` x 6 on the long walls (x 5.6 and 21.4, z 49 / 52 / 55); `magister_statue` x 2 flanking the lycaneum door (9.7, 46.7), (13.3, 46.7); `gp('lamp_post')` x 4 along the central aisle (x 13.5, z 48 / 50.5 / 53 / 55.5); sealed east gate (`buyuk_merdiven` kill_lock) with `hw('arch_gate')` x 2.8 and a brazier on each side (`gp('brazier')` x 2); `dg('candle_thin')` floor scatter (autoDecor 0.4); gold inlay `rectZone('rune', ...)` x 2 along the long axis.
- Lights (real: 5): 3 chandeliers amber 1.8 / 11, 2 lamp posts amber 1.4 / 8; the gate braziers are `halo`.
- VFX: `ambient_dust`, `brazier_fire` x 2, `aegis_ring` barrier on the sealed east gate (becomes `gold_sparkle` burst when it opens), `candle_flame`.
- Sound: bed 0.4, marble footsteps, a faint `world/break_glass_light` crystal tinkle every 30 to 60 s from the chandeliers (vol 0.12), `world/creak` from the galleries, gate: `world/door_heavy` on open.

**3. `lycaneum` Lycaneum Geçidi** (0 m, ceiling 12, 40 x 24 m)
- Vertical: low and tight on purpose; `gallery` tier y 5 depth 2 along the north wall (decor), shelves reach 10 m.
- Props: `bookcase_arched` x 19 (3 rows of 7 / 7 / 5 bays, collidable, see SP1); `magister_statue` hooded librarians x 3 at the watcher spots (tint `0x6a6a90`, `emissive 0x5fd3e8` x 0.4: the eyes); lectern (`fu('table_small')` x 1 with `fu('book_set')`) at (8.2, 40.8); rolling ladders x 2 (prop on the shelves); `fu('rug_oval_B')` x 2 on the lane; `fu('lamp_standing')` x 2; `dg('candle_triple')` x 6; `fu('book_single')` floor scatter x 10; `ip('psx-dungeon','chain')` x 3 hanging from the gallery.
- Lights (real: 3): 2 lamps amber 1.3 / 8, tome cyan 1.0 / 5.
- VFX: dense `ambient_dust`, `gold_sparkle` loop above the tome, librarian cone telegraph (NP-03, thin `telegraph_flash` cone), eyes flare when you are seen.
- Sound: `amb_library` (page rustle, slow clock tick), a low hum from each watcher when its cone sweeps near, "seen" sting (`magic/debuff` plus `world/lock`), tome read: `magic/shimmer_01`.

**4. `gizem_arsivi` Gizem Arşivi** (0 m, ceiling 26, 64 x 56 m; the loading screen)
- Vertical: two decorative gallery rings (`gallery` y 7.5 depth 3, `gallery` y 14 depth 2) on the west, east and north walls with a `colonnade` y 7.5 count 8; `windows` y 19 x 4 (north) and x 3 each (west, east); `beams` y 24; 8 hanging lanterns at 11 m; banners hung 8 to 20 m.
- Props: `bookcase_arched` x 10 (6 along west and east walls, 4 flanking the north door); reading tables `fu('table_medium_long')` x 6 at x 6 and 17.5, z 31.5 / 34.5 / 37.5 (centre left open for packs); chairs `fu('chair_A')` x 6 and `fu('chair_B_wood')` x 6; velvet armchairs `fu('armchair')` x 4 (tint `0x8a1c30`); **`velvet_throne` x 1 at (10, 38.2) facing north** (loading-screen shot); `star_chandelier` x 3 at (8, 31), (12, 33), (16, 31) hung from 26 m; floating tomes `fu('book_single')` x 8 at y 1.8 (spin, bob); `fu('rug_rectangle_stripes_A')` x 3; `fu('lamp_standing')` x 4; `dg('candle_triple')` x 6; `fu('pictureframe_large_A')` x 4 and `fu('pictureframe_medium')` x 4 on the gallery walls; `banner_sun_tall` x 6; `hw('lantern_hanging')` x 8; kill_lock north door with `wall_gated` model; 2 small violet crack zones in the NW corner (the first Void leaks).
- Lights (real: 6): 3 chandeliers amber 1.8 / 11, 2 of the 4 lamps amber 1.3 / 8, north gate amber 1.0 / 6.
- VFX: `gold_sparkle` page flutter x 2, `ambient_dust`, `aegis_ring` on the locked door, `shadow_ground` cracks (violet `0x8a3cff`, 2 small), `candle_flame`.
- Sound: `amb_library` 0.4, page rustle one-shots every 8 to 15 s, `world/creak` from the galleries, a slow clock (loop), door opening: `world/door_open` plus `world/bell_heavy`.

**5. `yasak_raflar` Yasak Raflar** (optional, 0 m, ceiling 20, 16 x 40 m)
- Vertical: tall narrow shelves reaching 18 m, `gallery` tier y 8 depth 1.5 (decor catwalk), `windows` none.
- Props: `bookcase_arched` x 8 (collidable, 4 per side with a 2 m aisle); the chained book on a lectern (`fu('table_small')`, `ip('psx-dungeon','chain')` x 4 hanging around it, `fu('book_set')`); `gp('chest_iron')` at (1, 34.5); `hw('lantern_hanging')` x 2; `dg('candle_triple')` x 4; 3 violet crack `rune` zones; a "forbidden section" plaque (`fu('pictureframe_medium')`).
- Lights (real: 2): 1 amber 1.4 / 8, 1 violet 1.2 / 7.
- VFX: `curse_loop` on the chained book, `shadow_ground` cracks, `ambient_shadow_wisps` faint.
- Sound: `amb_whispers` (NEW; `creatures/ghost` very quiet loop), `world/chain` rattle every 20 to 40 s.

**6. `ust_kutuphane` Üst Kütüphane** (2.7 m, ceiling 20, 64 x 56 m, wood floor)
- Vertical: the stair `st_arsiv_ust` (tiles 11..12, rows 24..25) enters between two balconies; `gallery` ring y 9.5 depth 3 (decor), spiral ladder decor (`dg('stairs_walled')` x 2), `windows` y 14 x 6, `beams` y 18; `kc('wall-half')` balustrades (collide) along both stair edges (x 10.6 and 13.4, z 23.5 to 25.5).
- Props: `bookcase_arched` x 12 (6 west wall, 6 north wall); **4 freestanding collidable bookcases (the cover for Consuming Shadows)** at (6.5, 17.5), (11.5, 18.5), (16.5, 17.0), (13.0, 14.0); `fu('table_medium_long')` x 3 with `fu('chair_A')` x 6; the brass orrery model: `orrery_rings` x 0.25 on `fu('table_medium')` at (16.5, 14.5); `fu('rug_oval_B')` x 2; `star_chandelier` x 3 hung from 20 m (2 real); `dg('candle_triple')` x 6; violet cracks on 3 bookcases (emissive crack `rune` zones); `banner_sun_tall` x 4; `fu('lamp_standing')` x 4.
- Lights (real: 5): 2 chandeliers amber 1.8 / 11, 2 lamps amber 1.3 / 8, 1 violet 1.4 / 8 at the cracks.
- VFX: violet `shadow_ground` cracks x 3, `ambient_dust`, `ambient_shadow_wisps` near the cracks, `candle_flame`.
- Sound: `amb_library` 0.4, page rustle, crack hiss (NEW `sfx_void_crack`, alias `magic/arcane` low), `world/creak` from the gallery.

**7. `meydan` Yıldız Meydanı** (5.4 m, open, wall height 10, 80 x 64 m)
- Vertical: `st_ust_meydan` (tiles 20..21, rows 20..21) climbs into the plaza from the west; the **ledge** (rect 31,18,8,2, y 8.4) with a parapet (`kc('wall-half')` x 8) and `magister_statue` x 5 for the elevated pack; decorative `balcony` tier y 9 over x 20..27, z 18..19 (statue crowd); sealed grand-stair gate at the south (24, 34) seen over the south balustrade; `windows` none (open).
- Props: `armillary_sphere` x 1 at (29.5, 26) inside a `pool` zone r 3 (cyan glow) with `kf('fountain-round-detail')` ring; star-map `rune` rings r 6 / 4 / 2 centred (29.5, 26); `kg('column-large')` x 6 (collide) at (22.5, 24), (22.5, 30), (36.5, 24), (36.5, 30), (29.5, 20.8), (29.5, 32); `gp('lamp_post')` x 4 at the plaza corners; `kc('wall-half')` marble benches x 6 around the fountain; `kf('hedge-large')` x 6 (tint `0x2a3a40`) along the west edge; the `shrine_haste` shrine at (21, 29) (`extras.shrines`, engine-built prop); gate: `hw('arch_gate')` x 2.8 plus `gp('brazier')` x 2 at (24, 34); `banner_sun_tall` x 6 on the columns.
- Lights (real: 5): armillary cyan 1.8 / 12, shrine 1.0 / 6, 2 lamp posts amber 1.4 / 9, sealed gate amber 1.0 / 7.
- VFX: cyan rune rings, `ambient_stardust` (NEW NP-15, fb `ambient_dust`), `leap_land` and a short shake when `mt_p16` drops, `aegis_ring` on the gate, shrine `buff_aura`.
- Sound: `amb_wind` 0.3, fountain water (NEW `amb_fountain`, `magic/water` loop), armillary chimes (`world/bell_heavy` pitched 1.6 every 60 s), stone footsteps.

**8. `buyuk_merdiven` Büyük Merdiven** (0 to 5.4 m, ceiling 24, 32 x 56 m)
- Vertical: `grand_stair` (28 m, 20 treads, carpet) between a 5.4 m top landing (rows 34..35) and the 0 m bottom landing (rows 43..47); `colonnade` tier y 8 count 8 on both sides, `gallery` y 8 depth 2, `windows` y 14 x 6.
- Props: 6 `gp('brazier')` on side plinths (z 38, 41, 44 per side); `banner_sun_tall` x 6; `magister_statue` x 4 at the landings; `star_chandelier` x 3 hung from 24 m; red carpet along the stair (SlopeDef style `carpet`) plus a gold trim `rune` zone; two gates (`hw('arch_gate')` x 2.8) at the top and bottom, `ip('psx-dungeon','stairs_wide')` x 2 as decor under the landings.
- Lights (real: 5): 3 braziers amber 1.6 / 9, 2 chandeliers amber 1.8 / 11.
- VFX: `brazier_fire` x 6, `aegis_ring` on both gates (until boss 1 dies), `gold_sparkle` burst when they open.
- Sound: echoing bed 0.4, brazier crackle x 3, gate rumble (`world/door_heavy` plus `world/chain`) on open.

**9. `gozlemevi` Gözlemevi Bahçeleri** (5.4 m, open, wall 10, 80 x 64 m, boss 1)
- Vertical: decorative `balcony` tier y 11 depth 3 on the north and south walls with a statue crowd, `windows` y 13 x 5 (north), terrace look through hedges. The arena floor is flat (boss rule: fight areas are flat).
- Props: `telescope_brass` x 4 at the arena corners (22, 4), (37, 4), (22, 15), (37, 15) (collide r 0.8); sundial dais `circleZone('dais', 29.5, 9.5, 1.6)` plus `kg('altar-stone')` (decor, no collision); 8 orb ports (`tag: 'port'`, ids `orb_port_1..8`, `lens_obelisk` x 0.5 or `gp('crystal_blue')` in wall niches at `ORB_PORTS`); hedges `kf('hedge-large')` x 10 along the north wall; `magister_statue` x 4; `gp('lamp_post')` x 4; `armillary_sphere` x 0.6 at (37.5, 3.5); `kc('wall-half')` balustrade x 8 along the east edge.
- Lights (real: 6): 4 ports cyan 1.2 / 8 (the other 4 `halo`), 2 lamp posts amber 1.4 / 9.
- VFX: `arcane_orb` idle crackle at each port (NEW NP-15), `ambient_stardust`, lens glow on telescopes, port rune pulse 1.0 s before every volley.
- Sound: `amb_wind` 0.5, port hum rising before a volley (`magic/charge`), clockwork under the boss (`world/metal` clicks, NEW `amb_gears`), distant sea.

**10. `enerji_avlusu` Enerji Avlusu** (5.4 m, open, wall 10, 88 x 48 m)
- Vertical: `st_avlu_sig` (tiles 49..50, rows 14..17) is a stairwell cut into the south edge with balustrades on both sides (`kc('wall-half')` x 4 per side), leading down to boss 2; `balcony` tier y 9 over the east side (decor), `colonnade` tier y 9 count 6; the Sunwell shaft on the horizon.
- Props: `energy_pylon` x 4 at (42, 8), (58, 7.5), (42, 16), (59, 16) (`tag: 'boon'`); central dais `circleZone('dais', 51, 11.5, 2.0)`; balustrade along the north edge `kc('wall-half')` x 16 (gap at the balkon door x 53..54); `kg('column-large')` x 6 (collide) at (42.5, 6.5), (60.5, 6.5), (45.5, 11), (56.5, 11), (60.5, 12), (42.5, 12); `gp('lamp_post')` x 6; `banner_sun_tall` x 6 on the columns; `kf('hedge-large')` x 4; `sunwell_glow` on the horizon.
- Lights (real: 6): 4 pylons cyan 1.3 / 7, 2 lamp posts amber 1.4 / 9.
- VFX: pylon `arcane_orb`, `ambient_stardust`, `sunwell_glow` shaft, pylon use: `buff_aura` cyan.
- Sound: `amb_sea` (wind plus surf), pylon hum x 4 (positional, low), chimes, stair echo.

**11. `balkon` Güneş Kuyusu Balkonu** (optional, 5.4 m, open, wall 8, 48 x 24 m)
- Vertical: the pool is the "well far below" (`pool` zone, solid, no fall); `windows` none; the shaft rises beyond the cliff.
- Props: `circleZone('pool', 53.5, 1.0, 2.2, ...)` (SP7); ring of `kc('wall-half')` x 12 around the pool; `phoenix_statue` x 2 at (51.8, 4.4), (55.8, 4.4) (fb `gp('statue_hooded')` tint `0xffd77a`); `gp('chest_gold')` at (56, 2.5); `gp('lamp_post')` x 2; `gp('crystal_blue')` x 4 small; `sunwell_glow` behind the cliff.
- Lights (real: 2): pool gold `0xffd77a` 1.8 / 14, 1 lamp amber 1.4 / 9.
- VFX: rising `gold_sparkle` motes from the pool, slow `holy_burst` pulse, `ambient_stardust`.
- Sound: `amb_sunwell` (NEW, soft choir pad), `amb_wind` 0.3.

**12. `siginak` Başbüyücü Sığınağı** (2.7 m, ceiling 18, 72 x 56 m, boss 2)
- Vertical: sunken round chamber under the courtyard; the stair arrives at the north door; `gallery` ring y 9 depth 3 with 8 spectral Spellbreaker statues watching, `windows` y 12 x 6 (moonbeams), `beams` y 16, 2 dark iron chandeliers hung from 18 m.
- Props: `cynosure_crystal` x 1 at (50.5, 30.2) in a south wall alcove (behind the boss); dome rune ring `circleZone('rune', 50.5, 24.5, 2.0, ...)`; 2 glaive racks (`gp('altar')` plus `public/assets/models/gen/weapons/*` props) at (44, 27), (57, 27); `magister_statue` x 6 (tint steel `0x5a7aa8`) around the wall base; `banner_sun_tall` x 4; `D('sword_shield_gold')` x 6 on walls; `kg('column-large')` x 8 (collide) along the walls at x 43.5 / 57.5, z 20 / 23 / 26 / 29; 4 wall braziers (`dg('torch_mounted')`).
- Lights (real: 3): beacon cyan-violet 2.0 / 12, 2 braziers amber 1.4 / 8.
- VFX: live `aegis_dome` loop, beacon shards orbit, `dome_suppress` pulse on every host-ordered mark clear (NP-15), `ambient_stardust`, floor rune glow.
- Sound: `amb_beacon` (NEW; `amb_dungeon_bed` pitched down, a low drone), dome crackle when a player is silenced (`magic/debuff`), boss music.

**13. `teras_yolu` Teras Yolu** (2.7 m, open, wall 8, 72 x 24 m)
- Vertical: `windows` tier y 6 x 6 and an arcade `gallery` y 6 depth 2 on the north wall (decor); the east end looks over the sea; arches span the promenade.
- Props: `ip('psx-dungeon','arch')` x 3 (decor lintels, tint lilac, scale 2.5) at x 46, 51, 56; **3 cover columns** at (44.5, 36.2), (47.5, 36.2), (51.5, 36.2) (SP12); balustrade `kc('wall-half')` x 14 along the lane's north side for x 53..59; `gp('lamp_post')` x 6 at z 32.3; wind chimes `hw('lantern_hanging')` x 6 hung from the arches; `kf('hedge-large')` x 4; marble benches x 2; the patrol's `mt_p25` path stays on z 34.5.
- Lights (real: 3): 3 lamp posts amber 1.4 / 9 (the other 3 `halo`).
- VFX: `ambient_stardust`, wind streaks (`ambient_dust` fast), chime sparkles.
- Sound: strong `amb_sea` (wind plus surf), chimes (`world/bell_heavy` pitched 2.0 every 6 to 15 s).

**14. `takimyildiz` Takımyıldız Odası** (2.7 m, open dome, ceiling 30, 72 x 56 m, boss 3)
- Vertical: the tallest hall (lid at 32.7 m): `gallery` ring y 9 depth 3 (decor), `colonnade` y 9 count 12 echoing the floor ring, `beams` y 28 radiating like dome ribs; stars visible through the open dome.
- Props: 12 `kg('column-large')` (collide, scale 3.5) on a ring r 6 tiles around (50.5, 44.5) at 30 degree steps; star-map `rune` lines (12 radial rect zones, ring r 5, ring r 3, cyan); `armillary_sphere` x 1 at the centre (hidden at the pull; the boss draws the clones from it); `magister_statue` x 12 zodiac figures on the column bases; `banner_sun_tall` x 4.
- Lights (real: 5): 4 columns cyan 1.1 / 8 (the other 8 `halo`), the armillary cyan 1.6 / 12.
- VFX: pulsing constellation runes, `ambient_stardust`, `blink` flicker on clone spawn, `shadow_ground` pools (live).
- Sound: ethereal choir pad (`amb_orrery` low, shared), star chimes (`magic/shimmer_01` pitched up, 10 to 25 s), boss music.

**15. `kule_tabani` Teori Kulesi Tabanı** (2.7 m, ceiling 28, 48 x 40 m)
- Vertical: central gear shaft rising through the full 28 m (3 `orrery_rings` x 0.4 stacked at y 2 / 9 / 16, spinning, plus 4 gold `dg('column')` around a `void` pit zone r 1.6 at (35.5, 44.5), solid, balustrade ring `kc('wall-half')` x 12); `gallery` rings y 10 and 18 (decor, spiral landings), `windows` y 20 x 4, stair props `dg('stairs_walled')` x 2 at the doors.
- Props: brass pipes `dg('column')` tinted gold x 10 along the walls; wall gears `orrery_rings` x 0.4 x 3 on the walls (slow); the `shrine_ward` shrine at (31, 47.5) (`extras.shrines`, engine-built prop); `ip('psx-dungeon','chain')` x 4 hanging into the shaft; violet crack `rune` zones x 6 (widening toward the south door); `gp('crystal_purple')` x 4 in the walls; 2 dark chandeliers hung from 28 m.
- Lights (real: 4): 2 violet 1.4 / 8, 1 cyan (shaft) 1.0 / 8, shrine 1.0 / 6.
- VFX: `ambient_shadow_wisps`, crack glow, gear sparks (`hit_spark` small loop), shrine `buff_aura`.
- Sound: clockwork `amb_gears` (NEW; `world/metal_click` loop), low drone, a rising whisper layer toward the south door.

**16. `kule_merdiveni` Teori Kulesi Merdiveni** (2.7 m, ceiling 28, 48 x 24 m; 13.5 m landing)
- Vertical: lower floor rows 50..53 (2.7 m), railed 10.8 m cliff, landing rows 54..55 (13.5 m, holds the boss 4 door), the lift pad at tiles 34..36, row 53; decor spiral stairs up the walls; `gallery` y 8 depth 1.5 (decor), `beams` y 26; `ip('psx-dungeon','chain')` x 6 from the lid to the pad.
- Props: **6 cover columns** (SP12) at (30.8, 50.6), (30.8, 52.6), (40.6, 50.6), (40.6, 52.6), (32.2, 52.8), (37.8, 52.8); `arcane_lift_pad` x 1 at (35, 53) (`tag: 'lift'`); lift guards `kc('wall-half')` x 2 (collide, 1 tile long) at (33.25, 53.0) and (36.75, 53.0); landing balustrade `kc('wall-half')` x 12 on the cliff edge; `gp('crystal_purple')` x 8 in the walls; torn banners x 4.
- Lights (real: 4): 3 violet 1.4 / 8, lift glow cyan 1.0 / 6.
- VFX: wider cracks, `ambient_shadow_wisps`, lift runes, `charge_trail` while the lift moves, cyan beam up the shaft.
- Sound: lift hum plus chain (`world/chain` loop, NEW `sfx_lift_move`), arrival bell (`world/bell_heavy`), tower drone.

**17. `hizmet_koridoru` Hizmet Koridoru** (0 m / 13.5 m, ceiling 7, 24 x 8 m)
- Vertical: low stone gallery; the west half at 0, the lift pad in the middle, the east half at 13.5; chains from the lid.
- Props: `arcane_lift_pad` x 1 at (22.5, 60.5) (2 x 2 tiles); 2 gate props (west kill_lock, east boss_lock) with amber `aegis_ring`; sconces `dg('torch_mounted')` x 4; `hw('lantern_hanging')` x 4; plaque `fu('pictureframe_medium')` "Hizmet geçidi" x 1; floor arrow `rune` zones x 2.
- Lights (real: 3): 2 sconces amber 1.8 / 9, pad cyan 1.0 / 6.
- VFX: barrier shimmer on both gates until boss 3 dies, lift trail.
- Sound: lift hum, gate `world/lock` plus `world/door_heavy` on open.

**18. `goksel_yorunge` Göksel Yörünge** (13.5 m, open void, ceiling 40, 72 x 56 m, boss 4)
- Vertical: a floating platform at 13.5 m: black void ring (fall), two 8 m bridges, the orrery rings at 20 m absolute, 10 drifting rock chunks (`dg('rubble_half')` tinted violet, y offsets -8 to +6, slow bob, no collision), stars below and around.
- Props: `orrery_rings` x 1 floating over the dais (`ring_outer` 4, `ring_mid` -6, `ring_inner` 9 deg/s); 4 `lens_obelisk` at the diagonals (NE (37.6, 59.4), SE (37.6, 65.6), SW (31.4, 65.6), NW (31.4, 59.4)); void-rim `gp('crystal_purple')` x 10 on the dais rim (not on the soak slots); dais `rune` lines x 6 radiating from the hub (cyan inside, violet outside); bridge rails `kc('wall-half')` x 8 per bridge; exit portal and `chest_epic` at (34.5, 67.0) (appear after the kill).
- Lights (real: 5): 4 obelisks cyan 1.4 / 9, ring violet 1.2 / 14 (halo for the rim crystals).
- VFX: `void_torrent` (NEW NP-15) for the beams, `ambient_stardust`, `ambient_shadow_wisps`, soak telegraphs (engine), `portal_swirl` at the exit.
- Sound: heartbeat plus dissonant choir drone (`amb_orrery`, NEW), slow gear grind from the rings, void wind, beam sizzle (`magic/thunder` filtered), boss music.

**Set-dressing totals (budget check).** Real lights per room never exceed 6 (target at most 10 in view); about 150 hand-placed props, 40 chandeliers / banners / statues hung at height, about 13 decorative gallery, balcony and colonnade tiers and about 12 window rows via `tiers` (instanced, no extra draw calls per piece); about 30 unique GLBs (instancing keeps it within the 500-draw-call dungeon budget). The two heaviest rooms are `gizem_arsivi` and `buyuk_merdiven` (hung chandeliers plus tiers): if the frame budget bites, drop the second gallery ring and halve the floating tomes first.

---

## 4. Trash

**12 combat enemy defs + 1 derived variant (13 trash types) + 1 non-combat statue**, in `src/data/enemies.ts` style (builders `cone`, `proj`, `aoe`, `line`, `heal`, `buff`, `charge`, `passive`, `onDeath`, `derive`, plus the `move` interpreter of `docs/GDD_CREATURES.md` section 3: `string`, `hold`, `leap`, `rush`, `grab`, `marks`). Every type has **2 to 4 telegraphed attacks**. Ids use the prefix `mt_`. Numbers are multipliers on the level-60 baseline (`monsterHP(60) = 2246`, `monsterDmg(60) = 284`, `GDD_CONTENT` 0.3). Mythic+ then multiplies by the key curve (x2.36 HP and x2.00 damage at +10), Tahkimli (+20 % HP, +30 % damage) and the party factor (`1 + 0.7 (n - 1)` HP).

**Windup rule (GDD_CREATURES 1.2, normative here).** First telegraph of any melee-like move: `windup = clamp(0.45 + 0.25 x coef, 0.45, 1.2) s` (coef 1.0 = 0.70 s, 1.6 = 0.85 s, 2.0 = 0.95 s, 2.6 = 1.10 s, 3.0 and above = 1.20 s). A second or third strike of a string: `followWindup = clamp(0.30 + 0.12 x coef, 0.30, 0.55) s`, re-aimed, with its own shape. A **delayed swing** adds a hold of `[min, max]` seconds on top (never perilous, hard cap 0.60 s). Non-melee floors: projectile 0.60, ground circle 0.90, cast at least 1.00 (interruptible casts never shorter), perilous at least 1.00; swarm may use 0.45 flat. The tables below show the resulting windup in seconds. Every windup flashes the source in its type colour (`tell`), once at the start and once at 70 %.

Legend of flags: **K2** = high-priority kick (`EnemyAbility.kick: 2`), **K1** = medium kick (`kick: 1`), **D** = the status is dispellable (`StatusDef.dispellable`; `dispelUpTo` exists today as Panzehir and the rogue majors, a healer-class dispel arrives with the class packages: **every D row names a no-dispel answer**), **BRK** = the answer is a **poise break** (`EnemyDef.poise`, `onBreak`: a break cancels the move in progress, strips the flagged self-buff, drops a front block), **F** = frontal (telegraphed cone, point away from the group), **LoS** = break line of sight (NP-05), **CCi** = `ccImmune`, **int** = `interruptible: true` (cast bar, stoppable by stagger or hard CC per `GDD_CONTENT` 0.6), **str** = a string of 2 to 3 chained strikes, **hold** = delayed swing, **rush / leap / marks** = GDD_CREATURES moves. **There is no purge in this dungeon**: the engine has no player skill that removes an enemy buff (4.4, rejected-critique section).

### 4.1 Roster

Poise values follow GDD_CREATURES 5.1 (trash 24, swarm 6, elite 100; `def.poise` overrides). `P` = poise, `role2` = AI role (GDD_CREATURES 4.1).

| id | Ad (TR) | role2 / rank | model, scale | hp x | dmg x | speed | radius | aggro | forces | P | resist |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `mt_magister` | Arkan Büyücü | caster (kick) | Mage 1.0 | 1.0 | 1.0 | 5.0 | 0.55 | 12 | 4 | 24 | arcane 0.25, holy 0.1 |
| `mt_sunblade` | Güneşkılıç Muhafızı | skirmisher | Knight 1.0 | 1.4 | 1.2 | 6.2 | 0.6 | 10 | 4 | 24 | arcane 0.25, physical 0.05 |
| `mt_sifaci` | Işık Şifacısı | healer | Mage 1.0 | 1.1 | 0.8 | 4.9 | 0.55 | 12 | 4 | 24 | holy 0.5, shadow -0.25 |
| `mt_pyromancer` | Alevli Piromant | **elite** caster, CCi | Mage 1.15 | 3.2 | 1.3 | 4.6 | 0.65 | 12 | 7 | **100** | fire 0.75, frost -0.25 |
| `mt_codex` | Canlı Kodeks | swarm caster, flying | PROC:codex | 0.5 | 0.6 | 3.4 | 0.4 | 10 | 2 | 6 | arcane 0.5, fire -0.25 |
| `mt_spellbreaker` | Rünlü Büyükıran | **elite** brute + shielder, CCi | Knight 1.1 | 3.4 | 1.5 | 5.4 | 0.8 | 10 | 8 | **140** | arcane 0.5, physical 0.15 |
| `mt_mechanoid` | Kristalçekirdek Mekanoidi | brute, shielded | golem_stone 0.75 | 2.2 | 1.2 | 4.4 | 0.7 | 10 | 5 | 40 | physical 0.3, arcane 0.5, lightning -0.25 |
| `mt_sentry` | Gizem Nöbetçisi | **elite** brute, CCi | golem_stone 1.05 | 4.4 | 1.5 | 4.2 | 1.1 | 11 | 10 | **180** | physical 0.3, arcane 0.5, lightning -0.25 |
| `mt_voidcaller` | Boşluk Yarığı Çağırıcısı | **elite** healer + summoner, CCi | wraith 1.0 | 2.8 | 1.2 | 4.6 | 0.6 | 12 | 6 | **100** | shadow 0.5, arcane -0.15, holy -0.25 |
| `mt_infuser` | Boşluk Aşılayıcı | caster (kick) | Mage 1.0 | 1.2 | 1.0 | 4.9 | 0.55 | 12 | 5 | 24 | shadow 0.5, arcane -0.15, holy -0.25 |
| `mt_tyrant` | Yutucu Tiran | **elite** brute, CCi | Demon 1.55 | 5.2 | 1.8 | 5.0 | 0.95 | 10 | 12 | **240** | shadow 0.5, physical 0.1, holy -0.25 |
| `mt_voidling` | Boşluk Yavrusu | swarm, flying | Imp 0.55 | 0.35 | 0.5 | 7.2 | 0.35 | 9 | 1 | 6 | shadow 0.25 |
| `mt_voidling_unstable` (derive) | Kararsız Boşluk Yavrusu | swarm | Imp 0.63 | 0.35 | 0.5 | 7.2 | 0.35 | 9 | 1 | 6 | as above |

**Role mix:** kick-casters (magister, infuser, pyromancer), healers (sifaci, voidcaller), brutes (sunblade, mechanoid, sentry, tyrant), shielder (spellbreaker), swarm (codex, voidling), **elites with a posture bar** (pyromancer 100, voidcaller 100, spellbreaker 140, sentry 180, tyrant 240). `aggro` values are the per-monster overrides of `GDD_CONTENT` 0.5. Casters and healers use `ai.kite` bands [9, 15] (magister, infuser) and [10, 16] (sifaci, pyromancer, voidcaller). Anims: KayKit characters `A_KAYKIT`, Demon `A_ENEMY`, Imp `A_FLY`, golems and wraith `A_GEN`; Codex uses the PROC model's `Idle`.

### 4.2 Abilities

Damage `coef` multiplies the enemy's base damage. "Wind" = windup in seconds (derived by the rule above); casts show the cast time. "Target" means `params.target`: 0 threat, 1 random, 2 farthest, 3 random non-tank.

| Enemy | Ability (id) | TR name | Kind / timing | cd (first) | Effect | Flags and counterplay |
|---|---|---|---|---|---|---|
| Arkan Büyücü | `mt_magister_bolt` (basic) | Arkan Okçuk | projectile, cast 1.0 | 3.0 | coef 1.0 arcane | int, K1 (spare kick) |
| | `mt_magister_poly` | Koyun Büyüsü | projectile, cast 1.8 | 16 (4) | target 3, applies **`polymorph` 6 s** (NEW NP-13: cannot act, breaks on 10 % max HP damage) | int, **K2**, **D**; no dispel: the party damages the sheep (10 % max HP) |
| | `mt_magister_ring` | Arkan Halka | ground circle r 3 on the target's feet, marker 0.9 | 11 (6) | coef 1.4 arcane | step out (anti stand-still) |
| Güneşkılıç Muhafızı | `mt_sunblade_slash` (basic, **str 2**) | Güneş Kılıcı | strike 1 wind 0.65 (coef 0.8), strike 2 follow 0.42 (coef 1.0), cone 100 deg, 2.2 m | 2.0 | coef 1.8 total | parry strike 1 ends the string; dodge the rhythm |
| | `mt_sunblade_blade` | Arkan Bıçak | buff self, cast 1.0 | 14 (2) | `empower` +40 % damage 8 s | **BRK** (a poise break of 24 strips it), else defensives |
| | `mt_sunblade_charge` | Atılış | **rush** 10 m, width 2.0, speed 16, wind 0.78 (coef 1.3), tracks 0.6 | 11 | coef 1.3, `slow` 2 s; **wall hit = 1.6 s poise break** | dodge sideways; kite it into a bookcase |
| Işık Şifacısı | `mt_sifaci_bolt` (basic) | Kutsal Ok | projectile, wind 0.60 | 2.6 | coef 0.9 holy | |
| | `mt_sifaci_fire` | Kutsal Ateş | projectile, cast 1.6 | 9 (3) | coef 1.2 holy + `burn` 8 s | int, K1, **D**; no dispel: heal through |
| | `mt_sifaci_heal` | Işıkla Şifa | heal ally 40 %, cast 1.8 | 12 | heals the most hurt ally | int, K1; **kill the healer first** (it flees when alone) |
| | `mt_sifaci_ward` | Işık Perdesi | absorb 15 % max HP on an ally 10 s, cast 1.4 | 15 (6) | `shield` on the lowest ally | int, K1; burn through |
| Alevli Piromant | `mt_pyro_bolt` (basic) | Ateş Oku | projectile, wind 0.60 | 2.4 | coef 1.0 fire | |
| | `mt_pyro_pyroblast` | Piroblast | projectile, cast 3.0 | 9 (4) | coef 3.2 fire, threat target | int, **K2** (must-kick every time), BRK also cancels it |
| | `mt_pyro_flamestrike` | Alev Sütunu | ground circle r 4, cast 1.0 then marker 1.2 | 14 (8) | target 1, coef 2.2 fire, puddle 6 s (tick 1.0, coef 0.4) | leave the marker and the puddle |
| | `mt_pyro_ignition` | Tutuşma | buff self, cast 1.0 | 20 (6) | 6 s: +35 % damage, bolts apply `burn` | **BRK** (poise 100 breaks, `onBreak.strip ['ignition']`), else defensives |
| Canlı Kodeks | `mt_codex_volley` (basic) | Arkan Yağmuru | projectile fan x3 (30 deg), wind 0.60 | 2.6 | coef 0.5 arcane each | constant pulses, not stoppable |
| | `mt_codex_dive` | Sayfa Çırpışı | **rush** 7 m, speed 14, wind 0.45 (swarm), counts 0.5 swing token | 9 (4) | coef 0.7, one dive per Codex | dodge; cleave |
| | `mt_codex_resonance` (passive) | Yankılanma | passive, radius 8 | - | +8 % damage per other living Codex in range, max +40 % (pattern of `cult_acolyte_fanatic`) | keep pulls small |
| Rünlü Büyükıran | `mt_spl_slash` (basic, **str 2**) | Rün Kılıcı | strike 1 wind 0.70 (coef 1.0), strike 2 follow 0.44 (coef 1.2, knockback 2), cone 120 deg, 3.0 m | 2.2 | coef 2.2 total | parry strike 1 (poise 60 of 140) |
| | `mt_spl_slam` | Kalkan Vuruşu | **hold** cone 70 deg, 5.5 m, wind 1.10 plus hold [0.20, 0.50] | 11 (5) | coef 2.6 physical, knockback 4 | **F**, CCi; roll the delayed swing; BRK cancels it |
| | `mt_spl_glaive` | Rünlü Mızrak | 2 projectiles, cast 1.6 | 13 (7) | 2 glaives at random players, coef 1.8 arcane each | not stoppable; BRK cancels |
| | `mt_spl_wall` (role passive) | Rün Duvarı | `frontBlock` arc 110 deg, damage x0.3, refreshed every 5 s | - | the shield is up while not attacking | attack from the flanks or behind; **BRK drops it** |
| Kristalçekirdek Mekanoidi | `mt_mec_punch` (basic, **str 2**) | Kristal Yumruk | strike 1 wind 0.68 (coef 0.9), strike 2 follow 0.43 (coef 1.1, knockback 2), cone 90 deg, 2.4 m | 2.2 | coef 2.0 total | |
| | `mt_mec_shield` | Kristal Kalkanı | buff self, cast 1.0 | 22 (0) | `shield` absorb 30 % max HP, 12 s; it opens combat with it | burn through it; **BRK cracks it** (`onBreak.strip ['crystal_shield']`) |
| | `mt_mec_slam` | Yer Darbesi | self circle r 3, marker 0.90 (coef 1.6) | 12 (5) | coef 1.6 physical | leave the circle |
| | `mt_mec_burst` (onDeath) | Kristal Patlaması | self circle r 4, fuse 0.9 | - | coef 1.2 arcane, +0.8 if the shield is still up | walk out of the glow |
| Gizem Nöbetçisi | `mt_sen_punch` (basic, **str 3**) | Taş Yumruk | strike 1 wind 0.68 (coef 0.9), strike 2 follow 0.41, strike 3 follow 0.47 (coef 1.4, knockback 3) plus **hold** [0.15, 0.40], cone 100 deg, 3.2 m | 2.8 | coef 3.2 total | the last hit is delayed: do not roll early; parry strike 1 |
| | `mt_sen_shackles` | Eterik Prangalar | projectile, cast 1.6 | 16 (6) | threat target gets `root` 6 s + arcane tick coef 0.3 / s | **D**; no dispel: break by roll if a root-breaker exists, else healer; CCi, BRK cancels the cast |
| | `mt_sen_beam` | Arkan Işın | cast 1.0 then **marks `sweep`**: 3 line markers 14 m x 1.6 m stepping +-35 deg every 0.35 s | 15 (8) | coef 0.9 per line, random player | move perpendicular; no custom handler needed |
| | `mt_sen_disperse` | Kalabalık Dağıtma | self circle r 6, wind 1.20 | 20 (10) | coef 2.0, knockback 8 | leave the circle, never stand with a wall behind you |
| Boşluk Yarığı Çağırıcısı | `mt_voc_bolt` (basic) | Boşluk Oku | projectile, wind 0.60 | 2.6 | coef 0.9 shadow | |
| | `mt_voc_shadows` | Tüketen Gölgeler | self aoe r 38, cast 2.6 | 14 (7) | coef 2.4 shadow to every player **with line of sight** (`requireLoS`, NP-05) | **LoS** (cover columns and bookcases, SP12), BRK cancels the cast |
| | `mt_voc_mend` | Boşluk Şifası | heal ally 30 %, cast 1.8 | 11 | heals allies | int, K1 |
| | `mt_voc_rift` | Yarık Çağrısı | summon 2 `mt_voidling` (0 forces), cast 2.0 | 22 (12) | only while no add is alive within 12 m | int, K1; AoE the adds |
| Boşluk Aşılayıcı | `mt_inf_bolt` (basic) | Boşluk Oku | projectile, wind 0.60 | 2.4 | coef 1.0 shadow | |
| | `mt_inf_terror` | Dehşet Dalgası | self circle r 9, cast 2.0 | 15 (6) | coef 0.8 shadow + `fear` 3 s | int, **K2** (interrupt every cast), **D**; no dispel: run it out |
| | `mt_inf_consume` | Tüketen Boşluk | projectile, cast 1.4 | 12 (3) | target 1, **`consuming_void`** 10 s (NEW: shadow DoT coef 0.25 / s, +15 % shadow damage taken) | int, K1, **D**; no dispel: heal and cooldown |
| Yutucu Tiran | `mt_tyr_claw` (basic, **str 2**) | Yutucu Pençe | strike 1 wind 0.70 (coef 1.0), strike 2 follow 0.44 (coef 1.2, knockback 2), cone 100 deg, 3.6 m | 2.8 | coef 2.2 total | parry strike 1 (poise 60 of 240) |
| | `mt_tyr_strike` | Yutucu Darbe | **hold** cone 70 deg, 4.4 m, wind 1.20 plus hold [0.20, 0.50], telegraph | 12 (5) | coef 3.0 + `heal_absorb` (NEW) worth 80 % of the hit on the tank | **F**, `tankBuster`, CCi; defensive; BRK cancels |
| | `mt_tyr_rubble` | Düşen Enkaz | **marks `rain`**: 3 circles r 3.2 on random players, first marker 1.0 s, +0.3 s spacing | 13 (7) | coef 1.8, slow pool 8 s (tick 1.0, coef 0.2, `slow` 40 %) | keep moving; falling-damage zones |
| | `mt_tyr_dread` | Dehşet Çağrısı | cast 1.8 | 15 (11) | 3 random players `fear` 4 s | **D**; no dispel: run it out; BRK cancels the cast; not interruptible by kick |
| Boşluk Yavrusu | `mt_vlg_bite` (basic) | Isırık | cone 100 deg, 1.4 m, wind 0.45 (swarm) | 1.3 | coef 0.5 | |
| | `mt_vlg_leap` | Atlayış | **leap** min 3 / max 8 m, airtime 0.45, radius 1.2, wind 0.60, tracks 0.6 | 8 (3) | coef 0.6 | step off the marker |
| Kararsız Boşluk Yavrusu | `mt_vlg_bite`, `mt_vlg_leap` + `mt_vlg_burst` (onDeath) | Kararsız Patlama | self circle r 3, fuse 0.6 | - | coef 1.0 shadow, `slow` 2 s 40 % | do not kill on top of the group |

`mt_librarian` (not a combat enemy): MECH-style def (`role: 'support'`, `ai: { stationary: true, summoned: true }`, `forces: 0`, invulnerable), `characters/Mage` hooded, tint `0x6a6a90`, glow `0x5fd3e8`. Spawned by the GazePatrol system (NP-03), never part of a pack.

**Posture and break rules used above** (engine: `poise.ts` and GDD_CREATURES 5.2): player poise damage per hit: LMB 3 to 12, heavy 25 to 30, ultimate 100, parry 60 / 90 / 120 by rank; trash (24) and swarm (6) break instantly; a break stuns, applies `marked_crit`, takes x1.25 damage for 2.0 s (bosses 4 s, `GDD_CONTENT`) and cancels the move in progress. This dungeon adds one small field to `BreakSpec`: **`strip?: string[]`** (NP-21), the list of enemy self-buff status ids removed at the start of the break (`ignition`, `crystal_shield`, `empower`, `hastening_ward`). It is script-owned, needs no player purge skill and no replication beyond the normal `estatus` removal.

### 4.3 Pack list

Positions are continuous tile coordinates, all inside their room (validated). Member offsets: use the same sunflower spiral as the existing generated layouts, `r = 0.3 * sqrt(1 + 2 i)` tiles at angle `i * 137.508 deg` (x = r cos, z = r sin); casters and healers take the highest `i`, so they end up on the outer edge of the cluster. `forces` is the pack sum of the member defs above. `big` = marked big pull (Katliam spot), `skip` = route-skippable. y always comes from the heightfield. **Changes in this revision:** `mt_p16` stands on the plaza ledge, `mt_p20`, `mt_p28`, `mt_p29` moved off the new stair strip and lift pad.

| pack | room | centre | members | forces | flags / notes |
|---|---|---|---|---|---|
| `mt_p01` | guney_antre | 11, 53 | 2 sunblade, 2 magister | 16 | big (with p02, p03: 50 forces, 12 enemies) |
| `mt_p02` | guney_antre | 17, 51 | 3 magister, 1 sifaci | 16 | big. 3 Polymorph casts: kick plan |
| `mt_p03` | guney_antre | 12, 49 | 2 mechanoid, 2 sunblade | 18 | big. Crack or burn through the shields |
| `mt_p04` | guney_antre | 13, 52 | 1 sentry | 10 | patrol, skip. Waypoints (8.5, 55), (19, 55), (19, 47.5), (8.5, 47.5). The "Ethereal Patrol of the main hallway": pull it late |
| `mt_p05` | lycaneum | 14, 41.5 | 5 codex | 10 | dormant ceiling, wake 8 m. In sight of librarian C |
| `mt_p06` | gizem_arsivi | 10, 31 | 1 pyromancer, 4 codex | 15 | the library pull; the Pyromancer opens the north door (`kill_lock`) |
| `mt_p07` | gizem_arsivi | 15.5, 35.5 | 2 infuser, 6 voidling, 2 voidling_unstable | 18 | big (with p09). Terror Wave kicks |
| `mt_p08` | gizem_arsivi | 6, 28.5 | 1 spellbreaker, 2 magister | 16 | frontal plus Polymorph |
| `mt_p09` | gizem_arsivi | 15, 29 | 6 codex, 1 sifaci | 16 | skip, big (with p07) |
| `mt_p10` | yasak_raflar | 1.5, 31 | 1 pyromancer, 4 codex | 15 | optional room |
| `mt_p11` | ust_kutuphane | 8, 21 | 2 infuser, 1 voidcaller, 3 voidling, 1 voidling_unstable | 20 | on the west stairwell balcony (2.7 m): break LoS behind the 4 freestanding bookcases |
| `mt_p12` | ust_kutuphane | 14, 22 | 2 sunblade, 2 sifaci | 16 | on the east stairwell balcony. Holy Fire: heal through, no purge |
| `mt_p13` | ust_kutuphane | 9, 15 | 1 sentry, 1 magister | 14 | `mt_p16` links to it (SP4) |
| `mt_p14` | meydan | 26, 27 | 1 spellbreaker, 2 sunblade | 16 | big (with p15) |
| `mt_p15` | meydan | 33, 27 | 1 spellbreaker, 2 magister | 16 | big. Two CC-immune frontals in one pull |
| `mt_p16` | meydan | **34.5, 18.5** | 1 sentry, 2 infuser | 20 | **on the ledge (8.4 m)**, dormant ceiling, `wakeWhen: { cleared: ['mt_p14', 'mt_p15'] }`, leaps down to (31.0, 24.5), `linkedTo: ['mt_p13']` |
| `mt_p17` | enerji_avlusu | 45, 13 | 3 sunblade, 1 sifaci, 1 magister | 20 | big (with p18: 40 forces) |
| `mt_p18` | enerji_avlusu | 52, 9 | 2 mechanoid, 2 infuser | 20 | big |
| `mt_p19` | enerji_avlusu | 58, 13 | 1 spellbreaker, 2 sifaci | 16 | |
| `mt_p20` | enerji_avlusu | **54.5, 15.5** | 1 pyromancer, 1 magister, 1 sunblade | 15 | skip (moved off the stair strip) |
| `mt_p21` | balkon | 53.5, 2 | 1 sentry, 1 mechanoid | 15 | optional room |
| `mt_p22` | teras_yolu | 47, 33 | 2 sunblade, 1 voidcaller, 1 magister | 18 | stealth-lane pack, `aggro` 9; the 3 cover columns are 3 tiles south |
| `mt_p23` | teras_yolu | 53, 33 | 3 magister, 2 sifaci | 20 | stealth-lane pack. Three Polymorph casters |
| `mt_p24` | teras_yolu | 58, 33 | 1 spellbreaker, 2 infuser | 18 | stealth-lane pack |
| `mt_p25` | teras_yolu | 50, 34.5 | 1 sentry | 10 | patrol, skip. Waypoints (44, 34.5), (57.5, 34.5). The second "Ethereal Patrol" |
| `mt_p26` | kule_tabani | 33.5, 43 | 1 tyrant, 2 infuser, 4 voidling, 1 voidling_unstable | 27 | never pull with p27 |
| `mt_p27` | kule_tabani | 38.5, 46.5 | 1 tyrant, 2 magister | 20 | never pull with p26 |
| `mt_p28` | kule_merdiveni | **33.4, 51.0** | 1 tyrant, 1 voidcaller, 1 infuser, 2 voidling, 1 voidling_unstable | 26 | lower floor; LoS plus tyrant: use the 6 columns |
| `mt_p29` | kule_merdiveni | **38.0, 51.0** | 2 infuser, 4 voidling, 2 voidling_unstable | 16 | last pack before the lift and the orrery |

Totals (machine-checked): 29 packs, 125 enemies, **493 forces**. By section (route A): S1 antechamber 60, S2 lycaneum + atheneum 75, S3 upper library + plaza 102, S4 courtyard 71, S5 terrace 66, S6 tower 89 = 463; optional rooms 30.

Pack flags to set in the data file (the `PACK_EXTRA` map of the existing dungeon files): `big: true` on p01, p02, p03, p07, p09, p14, p15, p17, p18; `dormant` on p05 and p16; `patrol` on p04 and p25; `stealth` is not used (no stealth enemies here); `note` strings are tooling only.

### 4.4 Interrupt, dispel, poise-break, line-of-sight budget (the "must-answer" checklist)

| Check | Abilities | Notes |
|---|---|---|
| **Must kick (K2)** | Polymorph (magister), Pyroblast (pyromancer), Terror Wave (infuser) | a party needs 3 to 4 reliable kicks; the antechamber and the terrace are the kick tests |
| Spare kicks (K1) | Arcane Bolt, Holy Fire, Işık Perdesi, the three heal casts, Void mend, Yarık Çağrısı, Consuming Void | heals matter most on the library and courtyard packs |
| Dispel (D) where a dispel exists | Polymorph, Holy Fire burn, Consuming Void, Ethereal Shackles root, Terror fear, Dread fear | **always with a no-dispel answer**: damage the sheep, heal through, run the fear out, roll or root-break |
| **Poise break (BRK)** | Arcane Blade (sunblade), Ignition (pyromancer), Crystal Shield (mechanoid), Rün Duvarı (spellbreaker), delayed slams (spellbreaker, tyrant), Consuming Shadows and Dread Call casts (voidcaller, tyrant), Seranel's Hastening Ward (boss, 5.2) | replaces the old "purge" duties; the break strips the flagged buff, drops the front block or cancels the move |
| Line of sight | Consuming Shadows (voidcaller) | bookcases (upper library), 3 columns (terrace), 6 columns (tower stair): SP12 |
| Frontals (F) | Shield Slam (spellbreaker), Devouring Strike (tyrant) | CC-immune carriers with delayed swings, never plan CC around them |
| Falling zones / puddles | Flamestrike, Tyrant Rubble, Arkan Halka | positioning, not interrupts |

### 4.5 Trash set pieces (user rule: 1 to 2 per dungeon)

1. **Lycaneum Gaze Gauntlet (SP1):** three librarian statues sweep cones across a serpentine lane; being seen sends you back to the foyer with a short slow. The Arcane Tome (30 min haste) is the reward; the dormant Codices (`mt_p05`) punish fighting in view.
2. **Plaza Elevated Pack (SP4):** a Sentry and two Infusers wait on a 3 m ledge, out of reach and out of the height gate, and leap down when the two plaza packs are cleared; with the upper-library sentry alive they join as a doubling trap.

Supporting height mechanics (no extra code): the stairwell balconies of the upper library (`mt_p11`, `mt_p12`) put two packs 2.7 m above the stair head, where they cannot hit the party on the lowest treads and vice versa (pull, back down, fight at the foot); a Sunblade rush down the stair lane that ends in a bookcase or wall is a free poise break (GDD_CREATURES 3.5 wall punish).

---

## 5. Bosses

Four bosses in WoW order (the Midnight original has four, so the dungeon has four). Each fight keeps the Midnight mechanics (research doc) reimagined for our engine and adds an **Elden-Ring-flavoured move layer** on top (user rule): readable windups, **delayed swings** (`hold`), **2 to 3 hit strings** with re-aim, a jump attack, a rush or a grab, a posture bar with a stagger window, and an enrage below 30 %. Action combat, one tank, one healer, three DPS, dodge roll (6 m, i-frames 0.04 to 0.34 s), stagger bar rules for bosses (`GDD_CONTENT` section 4 shared rules: hard-CC immune, slows x0.5).

**Boss move layer, shared rules** (vocabulary of `docs/GDD_CREATURES.md` section 3; bosses are scripted in `src/ai/bosses/*.ts`, so NP-22 adds thin kit helpers `strikeString`, `grabCatch`, `leapSlam` that spawn the same shapes with the same timing rules):
- **String:** strike 0 windup `clamp(0.45 + 0.25 coef, 0.45, 1.2)`; strikes 1 and 2 start 0.15 to 0.35 s after the previous resolves, windup `clamp(0.30 + 0.12 coef, 0.30, 0.55)`, re-aimed at the live target, own shape. The last strike is the finisher (35 to 45 % of the string's damage, knockback 3 to 6 m). A parry of strike 0 ends a trash string; **against bosses the parry deals poise damage (60 of the bar) and the string continues** unless the bar breaks.
- **Delayed swing (`hold`):** reaches the raised pose on time, then holds `[min, max]` s (cap 0.60 s, drawn on the host, baked into `shape.delay`, never re-rolled by a dodge), shimmer instead of a final cue. Never perilous.
- **Grab (`grabCatch`):** perilous (red) catch cone, dodge only, `root` for the hold, then a gated slam that only hurts the grabbed player; a poise break, stun or kill of the grabber releases (0.4 s i-frames).
- **Leap (`leapSlam`):** landing circle locked at 60 % of the windup, never moved afterwards, at least 0.5 s of visible final marker; a second read (`cross`) may follow.
- **Posture bar:** boss `poise` 500 to 700 (player poise damage: LMB 3 to 12, heavy 25 to 30, ultimate 100, parry 60 / 90 / 120): a break is earned in 20 to 40 s of good play, never spammed. **Break window 4 s (boss rule), boss takes x1.25 damage and a guaranteed-crit riposte (Kritik Vuruş) per player; poise regen 6 % per second after 4 s without damage.** A break cancels the move in progress, stops casts marked interruptible, and applies the boss's `onBreak` (below, with the new `strip` field of NP-21).
- **Enrage below 30 %:** `roar` 0.9 s non-interruptible free damage window, `atkSpeed +25 %`, `speed +15 %`, `cdMult 0.85`, poise regen delay x1.5 but break window +0.5 s.
- **Host status ledger (NP-20, replaces polling of remote statuses):** the host script never reads `PlayerSyncState.statuses` (a string list with a 0.7 s TTL and no stack counts). Every status a script applies is written to `c.state.ledger[playerId][status] = { stacks, until }` by the script itself; endings come from (a) the script's own timers, (b) **owner-reported `pstatus_end` events** for statuses flagged `reportEnd` (dispels, deaths), (c) removals the script itself orders through `removeStatusPlayer` (NP-19).

**Boss kit inventory.** Existing in `src/ai/bosses/kit.ts` and `BossController` [exists]: `circle`, `ring`, `beam` (line), `band` (centred rect), `wedge` (cone), `zone` (lingering ground effect), `dashLine`, `ringPoints`, `statusPlayer` (also to remote peers), `pickPlayers` (non-tank first), `playersIn`, `farthestPlayer`, `every`, `floatOver`, `spawnMech` / `makeInvulnerable` (mechanic entities such as `proc_soul_orb`), `trapPlayer` (prisons), `partyHp`; `c.shape` with `persist`, `follow`, `soak`, `kind: 'soak' | 'safe' | 'danger'`, `knockback`, `statuses`; `c.spawnAdds`, `c.schedule`, `c.cancelTimers`, `c.teleport`, `c.setImmune`, `c.freeze`, `c.endMechanicPhase`, `c.vulnerable`, `c.frontalBlock`, `c.stagger`, `c.slide`, `c.dash`, `c.castNow`, `c.forceAbility`, `c.cdOverride`, `c.dmg(coef)`, `c.dmgMul`, `c.state`, `c.adds(tag)`; `bossMsg` kinds `boss_push`, `boss_pull`, `boss_fx`, `boss_text`, `boss_toast`, `boss_alpha`, `boss_dmgwin`, `boss_shake`; script hooks `init`, `update`, `onEngage`, `onPhase`, `onDeath`, `onReset`, per-ability `usable/start/resolve/tick/end/abort`.

**NEW primitives these fights need** (specified once in 8.2 with the canonical `SPX-nn` of the season registry): NP-06 = SPX-19 `BossDef.energy` (with drain and `onEmpty`), NP-07 = SPX-17 seeker orbs (invulnerable, wall ports), NP-08 = SPX-16 `soak`, NP-09 = SPX-15 `rotatingBeams` on `HitShapeSpec.spin` (with a hub start offset, a pivot and a per-target ICD), NP-10 and NP-11 = SPX-20 `linkHealth` and `tether`, NP-13 = SPX-24 status batch (`arcane_unstable`, `runic_mark`, `neural_link`, `devouring_entropy`, `umbral_splinter`, `heal_absorb`), NP-19 = SPX-16 `removeStatusPlayer`, NP-20 = an extension of SPX-24 (`pstatus_end` reports), NP-21 and NP-22 = extensions of SPX-22 (posture-break buff strip, boss strike / grab / leap helpers). **Field names:** this doc uses the engine and `GDD_CREATURES` names `poise` / `onBreak` / `move`; SPX-22 calls the same thing `posture`: if the registry's names win it is a mechanical rename, the semantics are identical.

| Mechanic | Boss | Built from |
|---|---|---|
| Tank buster with knockback (delayed swing) | all | exists (`tankBuster`, `knockback`) + `hold` (NP-22) |
| Lingering pools (residue, ichor, secretions) | 1, 3, 4 | exists (`zone`) |
| Root / dispel check | 1 | exists (`statusPlayer 'root'`); dispel or any root-breaker; no purge |
| Energy bar that triggers a phase | 1, 2 | NEW NP-06 = SPX-19 (`BossDef.energy`) |
| Orbs from walls, intercept or leak | 1 | NEW NP-07 (invulnerable orbs) |
| Suppression dome, host-managed mark clearing | 2 | exists `zone` with `silence` + host ledger and `removeStatusPlayer` (NP-19) |
| Per-player marks, spread aura | 2, 4 | exists (`circle` with `follow`, `sourceId`) |
| Clones with shared health | 3 | NEW NP-10 |
| Link, touch to break | 3 | NEW NP-11 |
| Pull and hold | 3 | exists (`boss_pull`, follow circle) |
| Rotating beams, hub safe | 4 | NEW NP-09 (spinning line shape, hub start offset) |
| Soak slots with raid-wide fail | 4 | NEW NP-08 |
| DoT whose expiry fires lines | 4 | exists (`c.schedule`, `beam`) + status NP-13 (non dispellable) |
| Stacking tank debuff, ichor on removal or expiry | 4 | exists + status flag `reportEnd` (NP-20) + host ledger |
| Big-mechanic lock (no overlap) | 4 | exists (`usable()` reading `c.state.bigUntil`) |
| Strings, delayed swings, grabs, leaps, posture | all | NEW NP-22 helpers + existing poise engine (`poise.ts`) |

Statuses are applied with `statusPlayer`; DoT `dps` values below are `c.dmg(coef)` per second.

### 5.1 Boss 1: Bekçi Arkanotron, "Kuralların Muhafız Otomatı" (`boss_arkanotron`)

WoW model: Arcanotron Custos, "an arcane construct built to keep magisters within the rules". Arena `gozlemevi`.

| field | value |
|---|---|
| model | **live: `gen/bosses/lav_golemi.glb`, scale 0.85, tint `0x6a7ad0`, emissive `0x40d0ff`** (Appendix C); follow-up MT-F: `arkanotron.glb` (`tools/blender/bosses/boss_arkanotron.py`) replaces it by changing one path |
| role / hp x / dmg x | melee / 65 / 2.4 |
| speed / radius | 4.5 / 1.6 |
| posture (`poise`) | 600 (hidden and frozen during the refuel phase) |
| enrage | 240 s hard (+300 % damage and a raid pulse, `GDD_CONTENT` section 4 rule); below 30 % a roar enrage (shared rules) |
| arena | `gozlemevi`, `arenaR` 30, `arena {120, 40, 80, 64, 120, 26}`, flat floor at 5.4 m |
| clips | `Idle`, `Walk`, `Attack` (fist string, slam), `Attack2` (spin string), `Cast`, `Jump` (lunge), `Enrage`, `Death` |
| yells | pull "KURALLAR BELİRLİ. İHLAL EDEN İMHA EDİLİR." / phase 2 "AŞIRI YÜK PROTOKOLÜ." / death "Kural... ihlal... edildi..." |
| loot | `loot_mt_b1` (5.6) |

**WoW mechanics (kept)**

| Ability (id) | TR | Type | Timing | Shape / effect | Built from |
|---|---|---|---|---|---|
| `arkanotron_expulsion` | Arkan Püskürtme | avoidable + pools | first 14 s, cd 26 s, ground circle marker 2.0 s | circle r 12 m on the boss, coef 2.2, knockback 9. Leaves **Arkan Kalıntı** at the boss: r 4.5 m, 90 s, tick 1.0 s, coef 0.12, `slow` 35 % | exists (`circle` + `zone` with `persist` 90) |
| `arkanotron_shackles` | Eterik Prangalar | root, dispel check | first 10 s, cd 30 s, cast 1.5 s | 3 players (2 if 3 or fewer are alive; non-tanks first): `root` 15 s plus arcane DoT coef 0.35 per 2 s (follow circle). A magic dispel (where available) or any root-breaker frees them; otherwise the party carries the root, the DoT is healed | exists (`pickPlayers`, `statusPlayer`, follow `circle`) |
| `arkanotron_refuel` | Yenileme Protokolü | **energy phase** | `BossDef.energy` 100 drains at 2.7 / s (about 37 s), `onEmpty` starts the phase; it lasts **20 s**, then energy resets to 100 | the boss freezes where it stands; **takes +20 % damage for the 20 s** (`c.vulnerable(1.2, 20)`); **three orb volleys at 0, 4 and 8 s** | NEW NP-06 + NP-07; exists `freeze`, `vulnerable`, `castNow` |
| Enerji Küresi (`proc_energy_orb`) | Enerji Küresi | seeker orb | volley size = alive players + 1 | spawns at random `ORB_PORTS` (30 to 41 m from the boss) and flies to the boss at **4.5 m/s (5.0 in phase 2)**, so every orb lands **6.7 to 9.1 s after its volley (6.0 to 8.2 s in phase 2)**: the last orb of the 8 s volley resolves by 17.1 s, **inside the 20 s window** (the first 6.7 s of the window are free DPS, the intercepts happen at 6.7 to 17.1 s, the rest is burst). **The orb is invulnerable (`makeInvulnerable` on spawn, hp irrelevant) and is resolved only by touch**: a player touching it (r 1.3 m) removes it and gains `arcane_unstable` (stacking arcane DoT, 20 s, max 8 stacks, dps `c.dmg(0.075)` per stack); on +10 and above it leaves Arkan Kalıntı r 2.5 m for 25 s where it died. **An orb that reaches the boss** explodes: raid coef 2.2 arcane and the boss gets `dmgMul x 1.2` for 40 s (each leak its own 40 s timer, same `c.schedule` pattern as `yeti_chest`). Cleave, AoE and projectiles pass through orbs (they never die silently); a safety net explodes any orb still alive at 20 s with no leak buff. Orbs have 0 forces, so Bolstering, Bursting and Sanguine never see them. | NEW NP-07 |

**Elden Ring layer**

| Move (id) | TR | Origin | Timing | Shape / hit string | Counterplay |
|---|---|---|---|---|---|
| `arkanotron_fist` (basic, **str 2**) | Kural Dizisi | ER string | every 2.4 s | strike 1 cone 100 deg, 4.5 m, coef 1.0, wind 0.70; strike 2 follow wind 0.42, coef 1.3, knockback 3 | roll through strike 1 or parry it (poise 60 of 600); the finisher knocks back |
| `arkanotron_slam` | İtici Darbe | WoW tank buster, now a **delayed swing** | first 7 s, cd 18 s | cone 70 deg, 8 m, coef 4.5 arcane, **knockback 14 m**, `sunder` 8 s, `tankBuster`; wind 1.20 plus **hold [0.30, 0.60]** (the fist stays raised) | defensive on the hit, do not roll early; stand with a pillar or the wall behind (nav stops the push) |
| `arkanotron_spin` | Dönen Çevirim | ER 3-hit string with a delayed finisher | first 16 s, cd 26 s | strike 1 cone 180 deg, 5 m, coef 1.2, wind 0.95; strike 2 reverse cone 180 deg, follow 0.45, coef 1.2; strike 3 ring r 6.5, coef 2.0, follow 0.54 plus **hold [0.30, 0.60]**, knockback 6 | roll strikes 1 and 2, then wait: the ring is late; run outward or roll through it |
| `arkanotron_judgment` | Hüküm Yakalaması | ER **grab** | first 21 s, cd 34 s | perilous red catch cone 70 deg, range 3.5 m, wind 1.20, on the nearest non-tank within 8 m (tank if none); `root` 1.1 s hold, then slam r 2.2, coef 2.4, knockback 5 | dodge roll the catch; a poise break or stun on the boss releases the caught player |
| `arkanotron_lunge` (**phase 2**) | Sıçrayıp Ez | ER **leap** | first 8 s after the phase, cd 24 s | lands on a random player's position locked at 60 % of the windup (wind 1.05), airtime 0.55, radius 3.4, coef 2.4; then `cross` marks: 4 lines 10 m x 1.6 m, coef 1.0, 0.9 s | step off the circle, then stand on a diagonal |

**Posture and enrage.** `poise` 600. `onBreak: { windowSec: 4, disable: ['arkanotron_expulsion', 'arkanotron_lunge'], disableSec: 6 }`: a well-timed break during the 18 s slam / spin / judgment rotation is worth about +25 % damage for 4 s. During the refuel phase the bar is hidden and frozen (that phase is already a damage window). Below 30 %: roar 0.9 s, `Kural Dizisi` gets a third strike (coef 1.6, follow 0.50, hold [0.20, 0.40]), energy drain x1.15, slam cd -3 s.

Phases (`BossDef.phases`): `p1` (1.01): fist string, slam, spin, expulsion, shackles, judgment. `p2` (0.5, yell): + lunge, `onPhase`: energy drain 3.6 / s, orb speed 5.0 m/s, expulsion cd 20 s.

Boss movement: normal tank chase. The refuel phase never moves the boss, so the tank must pull it to the middle of the arena **before** energy hits 0: orbs spawn at the walls, and a boss standing close to a port gets hit by an orb almost instantly (that is the punishment, no special rule).

Duties:
- **Tank:** keep the boss in the centre, face it away from the group; defensive on every Itici Darbe (do not roll the hold), stand with the knockback toward a pillar or the wall behind; roll the Hüküm catch; drag Arkan Kalıntı pools to the edge and overlap them.
- **Healer:** free or heal the roots (Eterik Prangalar), heal `arcane_unstable` stacks, cooldown for the three-orb phase.
- **DPS:** burst during the +20 % window and the 4 s posture break; share the orbs (about 3 to 4 stacks each, never more than 6 on one player); step out of expulsion pools; do not stand on Kalıntı when orbs die; roll the spin ring.
- **Enrage:** 240 s. Typical kill at +10 with Zorba: about 2:30 to 3:00 (the window is still 20 s; every orb now resolves inside it, so no damage is lost to late intercepts).

Loot `loot_mt_b1` (5.6): **Kuralsız Eldivenler**, **Eterik Pranga Kemeri**, **Enerji Küresi Mührü**.

### 5.2 Boss 2: Seranel Güneşkamçı, "Alacakaranlık Feneri'nin Bekçisi" (`boss_seranel`)

WoW model: Seranel Sunlash, a blood elf Spellbreaker, guardian of the Cynosure of Twilight. Arena `siginak` (our Grand Magister Asylum, sunken at 2.7 m). The mark count is disputed in the sources (three in one guide, no number elsewhere); we use 2 marks, 3 below 50 %.

| field | value |
|---|---|
| model | `characters/Knight` scale 1.85, tint `0x5a7aa8`, `visual.hide` = `KNIGHT_HIDE` minus `Knight_Helmet` and `Rectangle_Shield`, attach `gen/weapons/axe_1h_crescent.glb` on `handslot.r` (the glaive), `eyeEmissive 0x5fd3e8` (existing assets, no fallback needed) |
| role / hp x / dmg x | melee / 70 / 2.4 |
| speed / radius | 6.0 / 1.0 |
| posture (`poise`) | 500 |
| enrage | 270 s; below 30 % a roar enrage |
| arena | `siginak`, `arenaR` 26, `arena {204, 100, 72, 56, 204, 112}`, boss spawns at (50.5, 27.5) facing 180 (south of the dome, the Cynosure crystal behind it) |
| clips | KayKit set: `Idle`, `Running_A`, `1H_Melee_Attack_Slice_Horizontal` (0.3), `1H_Melee_Attack_Chop`, `Jump_Full_Long`, `Throw` (glaive), `Spellcast_Raise` (buff, wave), `Block_Attack`, `Death_B` |
| yells | pull "Fener'e yaklaşan her büyü susar." / 50 % "Büyülerin burada işe yaramaz!" / death "Fener... sönmesin..." |
| loot | `loot_mt_b2` (5.6) |

**WoW mechanics (kept; the dome is now host-managed)**

| Ability (id) | TR | Type | Timing | Shape / effect | Built from |
|---|---|---|---|---|---|
| **Suppression dome** (state, started in `init`) | Bastırma Kubbesi | zone | from the pull, permanent, r 8 m at (50.5, 24.5) | players inside get `silence` (refreshed every 0.5 s: skills are locked while you stand in it; the LMB weapon chain keeps working, confirm in `SkillSystem`). **Mark clearing is done by the host script, not by detecting a purge:** every 0.25 s the script checks the players in its ledger that carry a `runic_mark`; one inside the dome is cleared by `removeStatusPlayer(p, 'runic_mark')` (NP-19), its aura ends, and Null Reaction fires. Visual: `aegis_dome` loop plus the floor rune (SP10) | exists (`zone` with `statuses`, `persist` 9999) + host ledger |
| `seranel_glaive` | Rünlü Mızrak | marks | first 8 s, cd 24 s (20 s in phase 2), cast 1.4 s | throws a glaive at a random player; it bounces to the nearest other player within 12 m: **2 players get `runic_mark`** (3 in phase 2, a second bounce). Each marked player carries a follow aura r 4 m, tick 1.0 s, coef 0.5 arcane to everyone inside (marked or not). The mark is tracked in the host ledger (`until = now + 25`); it ends only by walking into the dome (host-cleared) or by detonating after 25 s: r 4 m, 3 s telegraph, coef 4.0 | NEW status `runic_mark` (NP-13); exists `pickPlayers`, `statusPlayer`, follow `circle`; host ledger NP-20 |
| **Null Reaction** (on every host-ordered clear) | Boş Tepki | punish | when the script clears a mark | raid coef 1.3 arcane + `slow` 25 % for 3 s, stacking. Two clears within 1 s = coef 2.6 and a 50 % slow: a wipe at high keys ("clear marks one at a time") | exists (`circle` big radius, `statuses`) |
| `seranel_wave` | Sessizlik Dalgası | **energy, raid** | `BossDef.energy` fills +2.6 / s, so about every 38 s (3.0 / s in phase 2); `onFull` casts it, 3.0 s ("KUBBEYE GİR!"), not interruptible | raid coef 3.0 arcane; at resolution the script applies an 8 s `silence` lockout to everybody **outside** the dome (nothing to purge: players inside simply never receive it); any player still marked in the ledger takes coef 6.0 extra. Clear every mark before it lands, everyone must stand in the dome | NEW NP-06 (energy), exists `circle` + `statuses` |
| `seranel_hastening` | Hızlandıran Koruma | boss buff | first 16 s, cd 32 s, cast 1.0 s | `haste` plus +100 % damage on the boss for 15 s, flagged `strip` | **BRK**: a posture break strips it (`onBreak.strip ['hastening_ward']`); otherwise the tank uses a cooldown. No dispel or purge exists for enemy buffs |

**Elden Ring layer**

| Move (id) | TR | Origin | Timing | Shape / hit string | Counterplay |
|---|---|---|---|---|---|
| `seranel_slash` (basic, **str 2**) | Rün Dizisi | ER string | every 2.2 s | strike 1 cone 110 deg, 3.8 m, coef 1.0, wind 0.70; strike 2 follow 0.44, coef 1.2 | parry strike 1 (poise 60 of 500), roll the rhythm |
| `seranel_flurry` | Rün Fırtınası | ER 3-hit string, delayed finisher | first 9 s, cd 16 s | strike 1 coef 1.0 wind 0.70, strike 2 coef 1.0 follow 0.42, strike 3 coef 2.2 follow 0.55 plus **hold [0.20, 0.50]**, lunge 3 m, knockback 4 | roll strikes 1 and 2 and wait for the finisher |
| `seranel_dash` | Atılış | ER **rush** | first 13 s, cd 22 s | rush 12 m, width 2.2, speed 18, tracks 60 % of the 0.90 s windup, coef 1.8 plus knockdown 0.7 s; **wall hit = 1.6 s poise break** | roll sideways; stand with a pillar or the wall behind you to have it crash |
| `seranel_leap` (**phase 2**) | Sıçrayan Mızrak | ER **leap** | first 6 s after the phase, cd 24 s | landing circle r 3.0 on a random player, locked at 60 % of the 1.10 s windup, airtime 0.55, coef 2.6 | step off the marker |
| **Rün Kalkanı** (**phase 2**, role `shielder`) | Rün Kalkanı | ER guard | refreshed every 5.5 s | `frontBlock` arc 110 deg, damage x0.3; drops during slash / flurry recovery and on a break | hit it from behind; the tank turns it away from the group |

**Posture and enrage.** `poise` 500. `onBreak: { windowSec: 4, strip: ['hastening_ward'], dropFrontBlock: true, disable: ['seranel_flurry'], disableSec: 5 }`. Below 30 %: roar 0.9 s, the flurry gets a fourth strike (spin, coef 1.4, follow 0.45), glaive cd -4 s, speed +20 %.

Phases: `p1` (1.01): slash, flurry, dash, glaive, hastening, wave. `p2` (0.5, yell): 3 marks, glaive cd 20 s, wave energy 3.0 / s, + leap, + Rün Kalkanı.

Duties:
- **Tank:** keep Seranel **outside** the dome (the tank would be silenced and cannot use defensives from inside); clear your own mark first when marked; roll the flurry finisher, parry the string openers; break posture for Hastening Ward, else a defensive.
- **Healer:** clear your own mark first; heal through Null Reactions; keep everyone alive for the Wave (the dome is the only place to stand).
- **DPS:** when marked, walk into the dome **one at a time** (call it out in chat or take turns by class slot); defensives during the removals; be inside the dome when the Wave lands.
- **Enrage:** 270 s. Typical kill at +10: about 2:30 to 3:00.

Loot `loot_mt_b2` (5.6): **Alacakaranlık Feneri Kolyesi**, **Kubbe Kırıcı Kalkan**, **Güneşkamçı'nın Rünlü Kılıcı**.

### 5.3 Boss 3: Gemellus, "Boşluğun Üçüzü" (`boss_gemellus`)

WoW model: Gemellus, a Siphoid that splits into itself and two clones that share one health pool and one shield. Arena `takimyildiz` (Constellarium, 2.7 m, open dome).

| field | value |
|---|---|
| model | **live: `gen/creatures/wraith.glb` scale 1.9, tint `0x2a0f3a`, emissive `0x7a30ff`, opacity 0.9, `flying`, hover 1.2** (Appendix C); follow-up MT-F: `gemellus.glb` replaces it by changing one path |
| role / hp x / dmg x | melee / 80 (this is the **shared pool**, not x3) / 2.5 |
| speed / radius | 5.2 / 1.4 |
| posture (`poise`) | 600 on the main body only (clones `stanceBreakable: false`) |
| enrage | 300 s; below 30 % a roar enrage |
| arena | `takimyildiz`, `arenaR` 26, `arena {204, 180, 72, 56, 204, 168}` |
| clones | `gemellus_clone` (Gemellus Yankısı): same model lighter tint `0x4a2a7a`, opacity 0.75, `dmgMult` 0.6, speed 1.8 (a slow drift), `ccImmune`, abilities `gemellus_clone_sting` and the **echo** of the main body's lash; `ai.summoned`, tag `clone` |
| yells | pull "Biz çoğuz. Siz azsınız." / 50 % "Daha çok... daha çok biz!" / death "Bir... olduk..." |
| loot | `loot_mt_b3` (5.6) |

**WoW mechanics (kept)**

| Ability (id) | TR | Type | Timing | Shape / effect | Built from |
|---|---|---|---|---|---|
| `gemellus_triplicate` | Üçleme | **phase** | at the pull (after a 2.5 s intro, immune) and at 50 % | the boss spawns 2 clones at the room edges; **all three bodies share one health pool and one absorb** (Synaptic Nexus). Clones drift at 1.8 m/s on random headings, bounce off the arena bounds (room minus 3 tiles) and the 12 columns, and despawn when any body dies. **Cleaving all three bodies triples throughput by design; the clones are targets, the energy orbs of boss 1 are not** | NEW NP-10 HealthLink; exists `spawnAdds`, `setImmune` |
| `gemellus_link` | Sinirsel Bağ | link | first 9 s, cd 28 s | a random player gets `neural_link` (+20 % damage taken, 12 s) and the group absorb jumps to **20 % of boss max HP**; a tether (`chain_lightning`, cyan) joins the player to **one clone**. Touching that clone (r 1.4 m, distance checked on the host from known positions) breaks the link and removes the absorb. A **posture break also drops the absorb** (the alternative answer). If the 12 s run out: the player takes coef 3.5 shadow and the absorb stays | NEW NP-11 TetherLink + NP-10 absorb; status NP-13 |
| `gemellus_grasp` | Astral Kavrama | pull and hold | first 15 s, cd 34 s, cast 1.5 s | target pulled toward Gemellus (`boss_pull`, speed 5, 8 s), plus **Kozmik Radyasyon**: follow circle r 3 m, coef 0.5 shadow per second for 8 s. You can run out (7 m/s beats the 5 m/s pull) | exists |
| `gemellus_sting` | Kozmik Iğne | pool | first 6 s, cd 16 s, cast 1.4 s | a random non-tank (phase 2: 2 players, tank included): follow circle r 1.2, coef 3.2 shadow; where it lands, **Boşluk Salgısı** r 3 m for 6 s, tick 1.0, coef 0.5. Drop the pool away from the group | exists (`circle` follow + `zone`) |
| `gemellus_clone_sting` | (clones) | pool | cd 20 s each, staggered | same as Sting, coef 2.2, aimed at a random player | exists |

HealthLink rules (NP-10): one shared `hp` and one `absorb` number held by the script. Every frame: `shared = prev - sum over bodies (prev - body.hp)` (damage dealt to **each** body counts), then every body's `hp` is set to `shared`; the absorb is consumed before `shared`. Death of any body ends the fight (`c.e` is the main body; clones call `escape()`). Hotfix lesson from the wiki: clones must never survive the encounter, so `onDeath` and `onReset` escape every clone.

**Elden Ring layer**

| Move (id) | TR | Origin | Timing | Shape / hit string | Counterplay |
|---|---|---|---|---|---|
| `gemellus_touch` (basic, **str 2**) | Çifte Dokunuş | ER string | every 2.2 s | strike 1 cone 100 deg, 4 m, coef 1.0 shadow, wind 0.70; strike 2 follow 0.42, coef 1.1 | roll through, parry strike 1 |
| `gemellus_lash` | Üçlü Kamçı | ER 3-hit string + **echo** | first 8 s, cd 20 s | strike 1 cone 90 deg, 6 m, coef 1.0, wind 0.70; strike 2 coef 1.0 follow 0.42; strike 3 line 10 m x 2 m, coef 1.8, follow 0.52 plus **hold [0.20, 0.50]**. **Each clone repeats the whole lash 1.2 s later from its own position** (coef x0.6, ghost windup glow, 0.8 s later in enrage) | read the boss first, then the ghosts; stay out of the clones' lines |
| `gemellus_dive` | Boşluğa Dalış | ER **leap** | first 12 s, cd 26 s | lands on a random player, locked at 60 % of the 1.15 s windup, airtime 0.60, radius 3.2, coef 2.8; in phase 2 the clones echo the dive 1.2 s later | step off the marker; do not stack |

**Posture and enrage.** `poise` 600 (main body). `onBreak: { windowSec: 4, strip: ['group_absorb'], disable: ['gemellus_lash', 'gemellus_dive'], disableSec: 6 }` and the clones freeze for the window. Below 30 %: roar 0.9 s, clone speed x1.6, echo delay 0.8 s, cooldowns x0.85.

Phases: `p1` (1.01): all abilities. `p2` (0.5, yell): `gemellus_triplicate` again (the two clones are replaced at new positions, still 3 bodies), Sting hits 2 players, all cooldowns x 0.85, clones echo the dive.

Duties:
- **Tank:** keep the boss next to the clones for cleave value, face the boss away from Sting pools; kite clones if they drift too far; read the echo.
- **Healer:** focus Astral Grasp and Kozmik Iğne targets; the linked player takes +20 % damage.
- **DPS:** AoE and cleave all bodies; whoever has the arrow under their feet runs **to the clone** (not away), or the party breaks posture; do not drop Sting pools in the cleave position.
- **Enrage:** 300 s. Typical kill at +10: about 2:50 to 3:20.

Loot `loot_mt_b3` (5.6): **Üçlü Boşluk Başlığı**, **Sinirsel Bağ Pantolonu**, **Gemellus'un Yankı Asası**.

### 5.4 Boss 4 (showpiece): Degentrius, "Göksel Yörüngenin Efendisi" (`boss_degentrius`)

WoW model: Degentrius, a Domanaar aberration on a raised platform in the Celestial Orrery; Void Torrent beams, Unstable Void Essence soaks, Devouring Entropy, Hulking Fragment. The sources conflict on the beam count (two after a March 2026 hotfix, four obelisks in one guide); we use one rotating line (2 beams) in phase 1 and two lines (4 beams) in phase 3, which covers both.

| field | value |
|---|---|
| model | **live: `monsters/Demon_Lord.glb` scale 1.45, tint `0x2a0f3a`, emissive `0x7a30ff` x 0.5** (Appendix C); follow-up MT-F: `degentrius.glb` replaces it by changing one path |
| role / hp x / dmg x | melee, **stationary** (speed 0, tank stands next to it) / 105 / 2.7 |
| radius | 1.8 |
| posture (`poise`) | 700 |
| enrage | 420 s hard; **soft enrage at 300 s**: every cooldown x 0.7; below 30 % (phase 3) a roar enrage |
| arena | `goksel_yorunge`, `arenaR` 21, `arena {140, 252, 72, 56, 140, 252}`, boss at the dais centre (34.5, 62.5), floor 13.5 m |
| yells | pull "Yörünge tamamlanıyor. Siz eksik parçasınız." / 60 % "Mercekler hizalanıyor!" / 30 % "Gökler yırtılsın!" / death "Yörünge... kırıldı..." |
| loot | `loot_mt_b4` (5.6) |

Rotation controller: the three big mechanics (Void Torrent, Unstable Void Essence, Devouring Entropy start) never overlap: each big ability's `usable()` returns false while `c.world.time < c.state.bigUntil`, and each sets `bigUntil = now + its length + 4 s`. Hulking Fragment, Entropy Blast, Null Bomb, Boşluk Eli and Üç Dalga are small (Boşluk Eli and Üç Dalga also respect `bigUntil` because they demand movement).

**WoW mechanics (kept; the torrent geometry is revised)**

| Ability (id) | TR | Type | Timing | Shape / effect | Built from |
|---|---|---|---|---|---|
| `degentrius_fragment` | Dev Parça (Hulking Fragment) | **tank buster, swap-free, delayed swing** | first 6 s, cd 26 s | circle r 8 m centred on the tank, marker at the start of a 1.20 s windup plus **hold [0.25, 0.60]**: tank coef 4.2 shadow, everyone else inside coef 1.0 and **knockback 9 m** (tanks back away from allies); the tank gets one `umbral_splinter` stack (30 s, stacking shadow DoT, dps `c.dmg(0.09)` per stack, dispellable, **`reportEnd`**). When a stack ends before the boss dies (expiry by the host timer, or a dispel reported through `pstatus_end`), it leaves **Stygian Ichor** at the player: r 2.5 m, 40 s, tick 1.0, coef 0.3 (each stack in the host ledger ends once, whichever report comes first) | exists + status NP-13 + NP-20 |
| `degentrius_entropy` | Yutan Entropi | DoT, delayed orbs | first 12 s, cd 42 s, cast 1.6 s | 3 players (2 if 3 or fewer alive, +1 per phase after 1, max 4) get `devouring_entropy` (shadow DoT, dps `c.dmg(0.07)`, **not dispellable**, so the host timers are authoritative) with different lengths 6 / 9 / 12 / 15 s. **When one expires** (host timer), 4 Entropy Orbs leave that player's position in 4 lines (90 deg apart, 24 m long, 1.6 m wide, 0.8 s telegraph), each coef 1.4 shadow and `slow` 70 % for 5 s. The carrier runs to a clear edge before the expiry | exists (`c.schedule`, `beam`, `statuses`) + status NP-13 |
| `degentrius_torrent` | Boşluk Seli (Void Torrent) | **rotating beams** | first 22 s, cd 46 s; telegraph 2.5 s, beams last 14 s | one **spinning line shape** per beam (NP-09 = SPX-15 `rotatingBeams` on `HitShapeSpec.spin`, with a start offset `from: 5` m, a pivot at the dais centre and a per-target ICD of 3 s). **Each beam is a segment from 5 m to 22 m from the dais centre: the hub (r 5 m) is beam-free, so the boss and the melee stack never take a beam.** A pair is **one line** (two opposite beams, e.g. obelisks NE and SW), width 3.2 m, sweeping at **14 deg/s (our value, not in the research: Appendix D)**, so a full 14 s sweep is 196 deg. Contact coef 2.0 shadow + `stun` 3 s (3 s immunity after a hit). **Phase 1: one line (2 beams).** Phase 2: the two lines alternate (NE-SW then NW-SE, every 7 s). **Phase 3: two crossing lines (4 beams)**, one turning clockwise and one counter-clockwise | NEW NP-09 |
| `degentrius_essence` | Kararsız Boşluk Özü | **soak slots** | first 36 s, cd 52 s | an orb visits the 4 cardinal `SOAK_SLOTS` (3 m radius) at +3.5, +5.5, +7.5, +9.5 s; each slot shows a yellow soak telegraph 1.2 s before the impact. Impact: coef 1.8 shadow split between the players inside. **A slot with nobody in it** triggers **Boşluk Yıkımı**: raid coef 2.5 shadow plus a stacking raid DoT zone (40 s, tick 0.5 s, coef 0.10; each failure adds another zone). Slot count = min(4, alive players), so a small party can still run between slots with rolls | NEW NP-08 SoakSlots |
| `degentrius_nullbomb` | Boşluk Bombası | spread | first 30 s, cd 48 s | on the tank: follow `circle` r 3 m, 5 s fuse, coef 3.5 shadow. Everyone else stays 3 m away | exists |

**Elden Ring layer**

| Move (id) | TR | Origin | Timing | Shape / hit string | Counterplay |
|---|---|---|---|---|---|
| `degentrius_blast` (basic, **str 2**) | Parça Süpürmesi | ER string | every 3.2 s | strike 1 cone 100 deg, 5 m, coef 1.6 physical, wind 0.85; strike 2 follow 0.50, coef 1.8, knockback 3 | tank cooldown rhythm; parry strike 1 (poise 60 of 700) |
| `degentrius_reach` | Boşluk Eli | ER **grab** (ranged) | first 18 s, cd 38 s | perilous red catch cone 40 deg, **range 12 m**, wind 1.20, on the farthest non-tank in range; pulls 6 m, `root` 1.5 s, then slam r 2.4 at the boss, coef 2.6, knockback 4 | dodge roll the catch; a poise break releases; it never starts during Torrent or Essence |
| `degentrius_waves` | Üç Dalga | ER shockwave you **roll through** | first 14 s, cd 30 s | three bands from the hub, `ring` r 5 to 8, 11 to 14 and 17 to 20 at +0.9, +1.4, +1.9 s, each coef 1.6; 3 m gaps | stand in a gap or roll through the band on its edge |

**Posture and enrage.** `poise` 700. `onBreak: { windowSec: 4, disable: ['degentrius_reach', 'degentrius_waves'], disableSec: 6 }`. **Timing reward:** a posture break during a Void Torrent telegraph (not while the beams are live) cancels that torrent and sets its cooldown to 15 s; the break window x1.25 is also the party's best burst moment. Phase 3 is the enrage ("Gökler yırtılsın!"): roar 0.9 s, the blast string gets a third strike (coef 2.0, hold [0.20, 0.45]), Üç Dalga cd -6 s.

Phases: `p1` (1.01): fragment, entropy, torrent (one line), essence, nullbomb, blast, reach, waves. `p2` (0.60, yell, 120 ms hit-stop): torrent alternates both lines, Entropy +1 target. `p3` (0.30, yell, heavy shake): two crossing lines, Entropy +1 target (max 4), essence cd 44 s, enrage.

**Falling.** The void ring is a real fall (`fall: 'open'`): 25 % max HP and a respawn on the last safe sample. Fragment knockback is 9 m from the hub (dais edge is 20.8 m out) and no other mechanic pushes outward, so falls come from player error only (a roll off the rim, a stun on the edge). The two bridges are 8 m wide with rails.

Duties:
- **Tank:** stand on the boss (it never moves), back away from allies before every Dev Parça (knockback 9 m) and do not roll the hold; dispel or cooldown the splinter stacks; roll the Boşluk Eli if you are the farthest; walk away from the group for the Null Bomb.
- **Healer:** dispel Umbral Splinters (or cooldown through them); cooldown for Boşluk Yıkımı and the raid DoT; heal through the slows.
- **DPS:** take a "pizza slice" slot (N / E / S / W) at the start of Essence and stay there until it fires; carriers of Entropy run to the nearest clear edge; **stack on the boss side of the hub when the beam turns toward you, step through the gaps otherwise** (stun is 3 s: a beam in the back is a death at high keys); roll the Üç Dalga bands and the Boşluk Eli catch; break posture on the torrent telegraph.
- **Enrage:** 420 s hard, soft pressure at 300 s. Degentrius is the pacing boss under Tyrannical. Typical kill at +10: about 3:20 to 3:45 (4:30 under Zorba).

Loot `loot_mt_b4` (5.6): **Yörünge Asası**, **Entropi Zırhı**, **Gölge Kıymığı Yüzüğü**.

### 5.5 End-of-run

After Degentrius dies: exit portal at (34.5, 67.0), `chest_epic` beside it (M+: item level from the key via `chestItemLevel`), boss kill slow-motion and loot burst per `GDD_CONTENT` 1.1. Efsunlu Yarık guardians never spawn inside any boss arena.

### 5.6 Loot (CORE_MECHANICS section 15: personal loot, 2 to 3 named items per boss, build-defining effects)

Every boss drops **one guaranteed personal item per player** plus a chance of a second, from its own table; **70 % smart loot** (main stat and armour type of the spec). Each boss also has **2 to 3 named items** with a unique effect (rolled with `uniqueChance` per player per kill, equal weight among the boss's pool; bad-luck protection +10 % per kill without a unique, reset on drop). In Mythic+ the item level follows the key (`chestItemLevel`, source tag "(Mitik+)"). Effects are written for our action combat (dodge roll, strings, posture, procs) and each hooks one of the dungeon's mechanics without depending on it. `special.params` are the numbers for `src/data/uniques.ts` (NP-23).

| Boss | Item (id) | Slot / who | Effect (Turkish player text) | `special.params` |
|---|---|---|---|---|
| 1 Arkanotron | **Kuralsız Eldivenler** (`mt_gloves_kural`) | gloves, melee and dodge builds | *"Kıl payı kaçış (dodge roll i-frame'i içinde bir saldırıdan kurtulmak) 'İhlal' yığını verir (8 sn, en fazla 5). 5 yığında bir sonraki hasar veren yeteneğin %150 hasar verir ve yığınlar sıfırlanır."* | `{ stackSec: 8, maxStacks: 5, bonus: 1.5 }` |
| | **Eterik Pranga Kemeri** (`mt_belt_shackle`) | belt, tank and melee | *"Kök ve Yavaşlatma etkileri %50 kısalır. Bir kök etkisi bittiğinde (süre veya kırılma) çevrene 4 m'de silah hasarının %80'i kadar Arkan patlaması yapar (10 sn bekleme)."* | `{ rootReduce: 0.5, burstCoef: 0.8, radius: 4, icd: 10 }` |
| | **Enerji Küresi Mührü** (`mt_ring_orb`) | ring, casters and healers | *"Kritik vuruşların %20 şansla seni izleyen bir Enerji Küresi doğurur (en fazla 3, 8 sn). Küre 2 sn'de bir en yakın düşmana %60 büyü hasarı verir."* | `{ chance: 0.2, orbSec: 8, tick: 2, coef: 0.6, maxOrbs: 3, icd: 3 }` |
| 2 Seranel | **Alacakaranlık Feneri Kolyesi** (`leg_cynosure_pendant`) | amulet, any (ilvl as the key) | *"Susturma ve Korku etkilerine karşı 6 sn bağışıklık kazanırsın (45 sn bekleme); bağışıklık sürerken hareket hızın %15 artar."* | `{ immuneSec: 6, icd: 45, moveSpeed: 0.15 }` |
| | **Kubbe Kırıcı Kalkan** (`mt_shield_dome`) | shield, tanks and guard builds | *"Başarılı bir blok veya savuşturma 6 m çevredeki düşmanların büyülerini 2 sn susturur (12 sn bekleme) ve onlara 25 sersemletme hasarı verir."* | `{ silenceSec: 2, radius: 6, icd: 12, poiseDmg: 25 }` |
| | **Güneşkamçı'nın Rünlü Kılıcı** (`mt_sword_glaive`) | sword 1h, melee | *"Her 3. hafif saldırı bir Rünlü Mızrak fırlatır: mızrak 2 kez sekip %70 silah hasarı verir; vurduğu düşman büyü yapıyorsa büyüsü kesilir (8 sn'de bir)."* | `{ everyNth: 3, bounces: 2, coef: 0.7, interruptIcd: 8 }` |
| 3 Gemellus | **Üçlü Boşluk Başlığı** (`mt_helm_triplicate`) | helm, AoE builds | *"En az 3 farklı düşmana vuran her saldırı 'Çoğalma' yığını verir (6 sn, en fazla 5, yığın başına +%6 hasar). Tek hedefe vurmak yığınları söndürür."* | `{ minTargets: 3, stackSec: 6, maxStacks: 5, perStack: 0.06 }` |
| | **Sinirsel Bağ Pantolonu** (`mt_legs_neural`) | legs, single-target builds | *"Tek hedefe verdiğin hasarın %25'i hedefe en yakın 2 düşmana (6 m) yayılır."* | `{ share: 0.25, targets: 2, radius: 6 }` |
| | **Gemellus'un Yankı Asası** (`mt_staff_echo`) | staff, mage / warlock / evoker | *"Her 4. büyü 1.2 sn sonra %50 hasarla yankılanır (aynı hedef); yankı sürerken büyü hızın %15 artar."* | `{ everyNth: 4, delay: 1.2, coef: 0.5, haste: 0.15 }` |
| 4 Degentrius | **Yörünge Asası** (`leg_orrery_staff`) | staff (`baseId 'staff_t4'`), mage / warlock / evoker | *"Arkan veya Gölge hasarı veren büyülerin her 3 sn'de bir hedefin çevresinde Mercek Küresi başlatır: küre 6 sn döner, 1.5 sn'de bir %60 hasar verir (en fazla 3 küre)."* | `{ icd: 3, orbSec: 6, tick: 1.5, coef: 0.6, maxOrbs: 3 }` |
| | **Entropi Zırhı** (`mt_chest_entropy`) | chest, tanks and melee | *"Aldığın hasarın %25'i 8 sn'ye yayılır. Ertelenmiş hasar sürerken hasar azaltman +%10 olur (20 sn bekleme)."* | `{ deferPct: 0.25, spreadSec: 8, drBonus: 0.10, icd: 20 }` |
| | **Gölge Kıymığı Yüzüğü** (`mt_ring_splinter`) | ring, crit builds | *"Kritik vuruşlar hedefe 'Kıymık' yığını bırakır (en fazla 5, 10 sn). 5. yığında kıymıklar patlar: 2.5 m çevreye %150 silah hasarı ve yığınlar sıfırlanır."* | `{ maxStacks: 5, stackSec: 10, burstCoef: 1.5, radius: 2.5 }` |

The items module has no trinket slot, so signature items are an amulet (boss 2) and a staff (boss 4); if a trinket category is added later, convert the amulet into the on-use trinket **Alacakaranlık Feneri**. Optional dungeon set **Güneşgezer** (`set_sunstrider`: helm from boss 3, shoulders boss 2, gloves boss 1, chest boss 4; 2-piece +8 % arcane damage, 4-piece Piroblast-style proc), only if the items module wants dungeon sets. Loot tables in Appendix C.

---

## 6. Mythic+ tuning

Rules used: `docs/CORE_MECHANICS.md` section 6 (scaling `1.10^(L-1)` HP, `1.08^(L-1)` damage, party HP `1 + 0.7 (n-1)`, +15 s per death, +3 / +2 / +1 at 60 / 80 / 100 % of the timer), `src/data/mythicAffixes.ts`, and `docs/GDD_CONTENT.md` section 5. The numbers below are targets for the SimBench-era balance, to be re-checked by QA with a timed run.

### 6.1 Timer and thresholds

| key result | time | note |
|---|---|---|
| +3 | 19:12 or faster (60 %) | realistic only well below +10 (about +5 and under with good gear) |
| +2 | 25:36 or faster (80 %) | needs route B plus a few big pulls at +10 |
| +1 | 32:00 or faster (100 %) | par route at +10 |
| untimed | over 32:00 | key drops one level |
| per death | +15 s | a 2-death run at +10 loses 0:30 |

### 6.2 Expected time per section at +10 (competent party, Route A, no deaths)

Assumptions: about 31 forces per minute of pulling including walking (big ARPG pulls), boss kills with the HP numbers below and an honest 25 to 30 % mechanics downtime, 15 to 25 s of door and walking between boss and next section. Forces % uses 400 as 100 %. Heights are inside these figures: a stair strip costs 1 to 2 s, the tower lift 3.4 s plus 0.6 s of boarding (S6); the posture-break windows of the Elden Ring layer (x1.25 damage for 4 s, about one per 40 to 60 s) roughly pay for the extra movement of the new move sets. QA re-checks both with a timed run.

| # | Section | Rooms | Forces (cum) | Cum % | Section time | Run clock |
|---|---|---|---|---|---|---|
| S1 | Antechamber | guney_antre | 60 (60) | 15.0 | 2:00 | 2:00 |
| S2 | Lycaneum + Atheneum | lycaneum, gizem_arsivi | 75 (135) | 33.8 | 3:00 | 5:00 |
| S3 | Upper library + plaza | ust_kutuphane, meydan | 102 (237) | 59.3 | 3:15 | 8:15 |
| B1 | Arkanotron | gozlemevi | - | - | 2:45 | 11:00 |
| S4 | Courtyard | enerji_avlusu | 71 (308) | 77.0 | 2:15 | 13:15 |
| B2 | Seranel | siginak | - | - | 2:50 | 16:05 |
| S5 | Terrace | teras_yolu | 66 (374) | 93.5 | 2:10 | 18:15 |
| B3 | Gemellus | takimyildiz | - | - | 3:10 | 21:25 |
| S6 | Tower | kule_tabani, kule_merdiveni | 89 (463) | 115.8 | 3:15 | 24:40 |
| B4 | Degentrius | goksel_yorunge | - | - | 3:35 | **28:15** |

Forces reach 100 % about 0:55 into S6 (22:20), so Degentrius is always the last event: pace is decided by the final boss, as in WoW ("Degentrius sets the pace under Tyrannical"). Route A finishes at **88 % of the timer**: +1 with about 3:45 spare, which is the "par +10" design (WoW's clean +12 is 25 to 30 min of 34). The spare time is not eaten by long death runs at the last fight: with the service corridor (6.7) a death at Degentrius costs about 27 s instead of about 90 s, so three deaths at the hardest fight use about 1:21 of the 3:45.

**Route B (fast, 412 forces = 103.0 %)** skips the four skippable packs `mt_p04` (10), `mt_p09` (16), `mt_p20` (15), `mt_p25` (10) = 51 forces and about 1:40: **26:35 (83 %)**. Section forces become S1 50, S2 59, S3 102, S4 56, S5 56, S6 89 (cum 50, 109, 211, 267, 323, 412). With two merged mega pulls (p01+p02+p03, p14+p15+p16) and a strong party: **about 24:30 (77 %, +2)**. The stealth lane (SP6) saves about 1:30 more but removes up to 56 forces, so it only works together with the optional rooms (+30) or with Route A's other packs.

Optional rooms add `yasak_raflar` 15 (about 0:50) and `balkon` 15 (about 0:55): a party that wants a Route B with the lane takes both.

Boss HP at +10, 5 players (`monsterHP(60) = 2246`, x2.358 key curve, x3.8 party), without / with Zorba (+30 %): Arkanotron 1.31M / 1.70M, Seranel 1.41M / 1.83M, Gemellus 1.61M / 2.09M (shared pool), Degentrius 2.11M / 2.75M. Trash HP at +10 with Tahkimli (x1.2): Magister 24k, Sunblade 34k, Infuser 29k, Mechanoid 53k, Pyromancer 77k, Spellbreaker 82k, Sentry 106k, Tyrant 126k, Codex 12k, Voidling 8.5k.

### 6.3 Recommended route and pull order

| Section | Order |
|---|---|
| S1 | `mt_p01`, then `mt_p02` (kick Polymorphs), then `mt_p03` (break or burn the shields). Merge all three (50 forces) only if you have 3 kicks. `mt_p04` patrol last or skip (pull it late: it overlaps the whole room). |
| S2 | Gauntlet: go when librarian C looks away, read the Tome, kill `mt_p05` only out of sight. `mt_p06` first (Pyromancer dies first, door opens), then `mt_p08`, then `mt_p07` + `mt_p09` together (voidlings and Codices die to AoE). Then the library door and the stair up. |
| S3 | from the stair head pull `mt_p11` (the 4 freestanding bookcases are the Consuming Shadows cover; its balcony cannot hit the foot of the stair), then `mt_p12`, `mt_p13`; then `mt_p14` + `mt_p15` together (the plaza pull), then `mt_p16` leaps down from the ledge on its own: be ready. Shrine haste at (21, 29). |
| B1 | Arkanotron. |
| S4 | Use crystals before the pull. `mt_p17` + `mt_p18` as one 40-force pull (Katliam spot), `mt_p19`, `mt_p20` skippable. Balcony if you need 15 forces. |
| B2 | Seranel. |
| S5 | `mt_p22`, `mt_p23`, `mt_p24` in order, kick plan for the 3 Polymorph casters of `mt_p23`; patrol `mt_p25` last or skip. Rogues: stealth lane. |
| B3 | Gemellus. |
| S6 | Shrine ward at (31, 47.5), then `mt_p26` **alone**, `mt_p27` **alone** (never together), `mt_p28` with the 6 columns as cover, `mt_p29`, then board the tower lift to Degentrius. |

### 6.4 Dangerous pulls

| Pull | Why | Rule |
|---|---|---|
| `mt_p01` + `mt_p02` together | five Polymorph casters in one cast window | needs 3 kicks and dispels; otherwise split |
| `mt_p06` + `mt_p07` together | Pyroblast plus Terror Wave plus 10 swarm bodies | `mt_p06` first, alone |
| `mt_p08` | frontal plus Polymorph | tank aims the slam away from the group |
| `mt_p11` | voidcaller LoS + 2 infusers (Terror Wave) | break LoS, kick Terror first |
| `mt_p14` + `mt_p15` (+ `mt_p16` if rushed) | two CC-immune frontals, then a Sentry that drops in | clear the upper library first (the normal order), then pull p14 + p15; keep a defensive for the drop |
| `mt_p17` + `mt_p18` | 9 enemies, 40 forces, Sunblade charges and Infuser terror | the Katliam spot: use a crystal and a shrine |
| `mt_p23` | 3 Magisters: 3 Polymorph casts at once | kick rotation |
| `mt_p25` overlapping `mt_p24` | patrol body-pulls (within 4 m) | pull the patrol after p24 |
| `mt_p26` + `mt_p27` | two Devouring Tyrants: two heal absorbs, two fears | the deadliest pull of the dungeon; below +12 it is a wipe |
| `mt_p28` | Tyrant + voidcaller LoS | stand behind the 6 columns of the tower stair (SP12) |
| `mt_p11` + `mt_p12` together | two stairwell balconies at once: Consuming Shadows, Holy Fire and the Infusers' Terror Wave | pull one balcony at a time from the stair head and back down to the foot (the balconies cannot hit the lowest treads) |

### 6.5 Affix interactions (all of `data/mythicAffixes.ts`, plus the seasonal)

| Affix | Effect in this dungeon | Advice |
|---|---|---|
| Tahkimli (`fortified`) | Codex swarms (resonance) and Tyrants hurt most; trash HP table in 6.2 | at +12 split p01+p02+p03 into two pulls |
| Zorba (`tyrannical`) | Degentrius 2.75M HP, about 4:30; Arkanotron's +20 % window is relatively smaller | plan cooldowns for the soft enrage (300 s) |
| Güçlenen (`bolstering`) | swarms and Codex stack Bolstered fast | kill swarms together; never leave one Codex or Voidling alone; kill the Spellbreaker last in p08; Arkanotron's energy orbs have 0 forces and are invulnerable, so they never bolster or burst |
| Öfkeli (`raging`, Zorba weeks) | CC-immune elites enrage at 30 % (the same trigger as the elites' own generic enrage, never doubled) | burst the Spellbreakers and Sentries down together; a poise break during the roar window still lands |
| Kan Dökücü (`sanguine`) | pools heal enemies; Flamestrike puddles and Tyrant rubble overlap them; Degentrius' Ichor also overlaps | pull out of pools; the terrace is narrow (24 m), so move packs east-west |
| Patlayan (`bursting`) | horde rule counts every 3rd swarm death: p05, p06, p07, p09, p26, p28, p29 give many stacks | AoE in waves, healer cooldown on p07 + p09 |
| İlham Veren (`inspiring`) | the Inspiring unit makes casters immune to interrupts: Polymorph, Pyroblast and Terror Wave become uninterruptible | the most dangerous week: kill the Inspiring unit first (highest-HP non-swarm member of every 4th pack), damage plan for Polymorph (the sheep breaks at 10 % max HP), a poise break still cancels the Pyromancer's Pyroblast |
| Volkanik (`volcanic`) | plumes under players 6 m or more from every enemy: Essence catchers at 13.6 m from Degentrius, ranged DPS at Arkanotron | catchers keep moving between plume and slot; ranged stack on the boss side |
| Sarsıntılı (`quaking`) | interrupts player casts and hurts clusters | do not stack in the dome; spread at Seranel |
| Patlayıcı Küre (`explosive`) | orbs near enemies in combat; Arkanotron's cyan `proc_energy_orb` must not be confused with the orange `explosive_orb` | the energy orb is cyan, bigger, **invulnerable** and flies to the boss (only touching removes it); kill orange orbs with any hit |
| Nekrotik (`necrotic`) | Spellbreakers and Tyrants stack it; Tyrant Strike + heal absorb is lethal | defensives on every Devouring Strike, kite where you can |
| Kin Dolu (`spiteful`) | shades fixate players; swarm kills are limited by the horde rule | do not kill the last swarm bodies on top of ranged players |
| Fırtınalı (`storming`) | tornadoes in the 24 m terrace and on the 41 m dais | step around them; they never block a soak slot (they are 12 s) |
| Ağır Yara (`grievous`) | Seranel marks, Boşluk Yıkımı raid DoT | healer cooldown plan |
| Efsunlu Yarık (`seasonal_efsun`, +10) | thresholds at 80 / 160 / 240 / 320 forces: 80 in S2 (the atheneum), 160 in S3 (upper library), 240 on the first courtyard pull right after boss 1, 320 at the start of the terrace. Rifts never open inside boss arenas (6 `riftSpots`, 15 m or more from the party) | kill the guardian within 45 s for the blessing; an unkilled guardian possesses the next uncleared pack (p-ids above) |
| Kibirli (planned seasonal, `CORE_MECHANICS` section 6) | "every 20 % forces spawns Kibir Tecessümü (elite, 4x trash HP)": same thresholds, spawn at the same `riftSpots` | kill it for +10 % damage and +10 % move speed for 60 s; the best moment is before the courtyard big pull |

### 6.6 Font of Power, shrines, chests, rift spots

| Item | Where | Notes |
|---|---|---|
| Kehanet Taşı (`extras.fontOfPower`) | (13.5, 61) in `giris` | key owner inserts, 10 s countdown, barrier at the foyer door |
| Shrine 1: `shrine_haste` (Rüzgar Sunağı) | (21, 29) plaza west | +25 % move and attack speed 30 s: for the plaza pull and the boss 1 run-in |
| Shrine 2: `shrine_ward` (Koruma Sunağı) | (31, 47.5) tower base SW | -25 % damage taken 30 s: for the two Tyrant pulls |
| Chests (gold and a globe in M+) | `chest_gold` (56, 2.5) balkon; `chest_iron` (1, 34.5) yasak_raflar | optional rooms |
| `extras.riftSpots` (6) | (16, 52.5), (11, 34), (30, 29), (50, 12), (53, 35), (36, 45) | antechamber, atheneum, plaza, courtyard, terrace, tower base |
| Boons (NP-04) | Arcane Tome (8.2, 40.8); 4 energy pylons (42, 8), (58, 7.5), (42, 16), (59, 16) | see SP1 and SP5 |
| Lifts (`DungeonDef.lifts`) | `lift_kule` pad tiles 34..36, row 53; `lift_hizmet` pad tiles 22..23, rows 60..61 | players only; call by standing on the pad for 0.6 s; never inside a boss arena |

### 6.7 Death runs

M+ rule: released players respawn at the start (13.5, 63.5). Run times at 7 m/s, including stairs:

| Run | When it applies | Time |
|---|---|---|
| start to the plaza through the Büyük Merdiven | after boss 1 (the grand stair is open) | about 25 s |
| start to the plaza through the library | before boss 1 | about 60 s |
| start to boss 2's door | after boss 1 | about 50 s |
| start to boss 3's door | during or after boss 2 | about 65 s |
| start to the orrery through the tower and `lift_kule` | boss 3 still alive (so the corridor is shut) | about 80 s |
| **start to the orrery through `hizmet_koridoru` and `lift_hizmet`** | **after boss 3 died** | **about 12 s** (8 s walking, about 4 s boarding and ride) |

The service corridor (SP11) fixes the old contradiction of this section: the orrery sits above the start on the map, but a player released at the foyer used to walk the whole dungeon again (about 117 tiles, 70 to 75 s) because the orrery room is walled off from the start. Now a death at Degentrius costs +15 s plus about 12 s = **about 27 s** (it was about 90 s), so three deaths at the hardest fight cost about 1:21 of the 3:45 spare, not the whole margin. The corridor's east door is a `boss_lock`, so nobody can run into a fight in progress. Deaths at boss 3 remain the expensive ones (about 80 s), accepted because Gemellus is the gentlest fight (pools, clones, one soft link).

---

## 7. Entrance

The gate stands in **Kadim Diyar** (map 3, levels 45 to 60, roadmap, `docs/GDD_OPENWORLD.md` section 1.1 and `docs/MAP_UI.md` 3.2), in a coastal sub-region **Yıldızburnu Falezleri** (region id `kd_yildizburnu`, levels 56 to 60). Reason: this dungeon is level 60 and Karakır Bozkırı (30 to 45) already holds the Buzul Tahtı and Gölge Tapınağı gates; the pool's 8 gates are spread over Karakır and Kadim Diyar, one per sub-region, never in a hub. The season pool's other docs choose their own sub-regions; this one claims the west sea coast.

**Terrain type:** sea cliff headland. Ground: pale lilac marble paving over short wind-bent grass (cobble-light and grass textures, tint `0xb8aed8`), rock cliffs and a dusk sea below (`water` rect, `BorderSeg` style `cliff` on the west edge). Landmarks: broken marble colonnades, an old crystal lighthouse spire ("Eski Fener", landmark id `kd_fener`), sea mist, and the gold **Güneş Kuyusu light shaft** (`sunwell_glow`) rising from behind the cliff edge, visible from 150 m. Enemy camps in the region reuse this dungeon's families at levels 56 to 60: Magister refugees and Sunblade stragglers (`mt_magister`, `mt_sunblade`), void leaks (`mt_voidling`), wandering sentries.

**Region theme draft (`RegionTheme`):** fogColor `0x2a2850`, near 26, far 120; hemiSky `0x6a70c0`, hemiGround `0x2a2038`, hemiIntensity 1.1; sunColor `0xffb0a0`, sunIntensity 0.6 (low dusk sun); skyZenith `0x1d1a46`, skyHorizon `0xc86a8a`; music `world_ruins` (until a cape theme exists); ambience "sea wind and chimes"; `ambientVfx: 'ambient_dust'`, `ambientColor: 0xd6d0f0`.

**Placement rule:** at the end of a 40 m causeway ("Yıldız Yolu") that leaves the region's main cobble road and runs out onto the headland, 6 tiles or more inside the region, at least 25 tiles from any other gate; a pass the player walks, never a dead end (`MAP_UI` 3.2). Exact tile comes with the Kadim Diyar layout. Data:

```ts
{ id: 'ent_buyucu_terasi', name: 'Büyücüler Terası', dungeonId: 'buyucu_terasi',
  pos: [/* tile from the Kadim Diyar layout */], facing: 90 /* the approach comes from the east */,
  minLevel: 60, regionId: 'kd_yildizburnu', look: 'arcane' /* NEW NP-17 */ }
```

**Grand gate "Güneş Kapısı"** (recipe format of `MAP_UI` 3.3: local frame, door at the origin, +z toward the approach, footprint 14 m wide x 12 m deep, take real scales from `tools/glb-inspect.mjs`):

| Part | Model | Local position (m) | Scale / tint | Notes |
|---|---|---|---|---|
| Gate arch | NEW `sunwell_gate_arch.glb` (fallback `hw('arch_gate')`) | (0, 0, 0) | fallback x 2.8, tint `0xb8aed8` | twin lancet arch, gold sun-sigil crest (emissive) |
| Spires x 2 | NEW parts of the arch GLB (fallback `kc('tower-hexagon-roof')` on `hw('pillar')`) | (-4.6, 0, -0.6), (4.6, 0, -0.6) | 2.6 tall, tint `0xb8aed8` | each topped with `gp('crystal_blue')` x 0.9 at y 7.2, emissive cyan (teal finials) |
| Portal door | `DungeonPortal` (`gp('mplus_portal')`) | (0, 2.0, 0.3) | x 1.6, tint `PORTAL_TINTS['buyucu_terasi'] = 0x5fd3e8` | existing interactable, opens the keystone panel |
| Stairs | `kc('stairs-stone')` x 5 | z +5.5 (y 0) to z +1.5 (y 2.0) | 6 m wide (two columns), tint `0xb8aed8` | |
| Phoenix statues x 2 | NEW `phoenix_statue` (fallback `gp('statue_hooded')`, tint `0xffd77a`) | (-3.6, 0, 3.4), (3.6, 0, 3.4) | | flank the stairs (Kael'thas homage) |
| Braziers x 2 | `gp('brazier')` | (-4.6, 0, 5.2), (4.6, 0, 5.2) | tint `0xf2a14a` | `vfx 'brazier_fire'`, no extra light |
| Banners x 2 | `gp('banner_red')` | (-6.2, 0, -0.8), (6.2, 0, -0.8) | x 1.2 | crimson and gold |
| Causeway | `ip('psx-medieval','building/stone_floor_4x4')` x 10 along +z, `kc('wall-half')` parapets, `kf('lantern')` lamp posts | z +8 .. +40, lamps every 6 m at x +-3.2 | tint `0xb8aed8`, lamps amber | the "Yıldız Yolu" approach |
| Rally board | `gp('notice_board')` | (-5.0, 0, 8.0) | | prop + nameplate only |
| Light | `LightPool.add([0, 3.2, 0.5], ...)` | one per gate | cyan `0x5fd3e8`, distance 9, priority 2 | |
| Nameplate | label | above the arch | "Büyücüler Terası · Sv. 60" | grey and "Sv. N gerekli" when locked |
| Landmark | `sunwell_glow` | 120 m behind the gate, on the cliff edge | | |
| Keep-clear | `WorldDecor` avoid radius 7 m around the door | | | trees and rocks must not block the stairs |

Also: the Kuzgunkale Kadim Kapılar Salonu gets its portal for this dungeon (`PORTALS`, tint `0x5fd3e8`, `unlockLevel` 60). Until the Kadim Diyar map exists, the dungeon is reachable from that hall and from the dev scene picker only; the world gate is a dependency of the Kadim Diyar layout, not of this dungeon.

---

## 8. Implementation packages for Haiku

Process rules from the project memory: Opus plans, Sonnet reviews, Haiku codes; at most 5 agents at once; no per-agent browser tests, one Haiku QA pass at the end; after each Haiku block a Sonnet review of the diff. Verification tools: `npx tsc --noEmit`, `node tools/content-check.mjs` (baseline 0 errors), `node tools/height-check.mjs` (ENGINE_VERTICALITY, once V3 lands), `node tools/glb-inspect.mjs <dir> --short` for models.

### 8.1 Dungeon packages (this dungeon only)

| # | Package | Owner module | Files | Needs | Acceptance |
|---|---|---|---|---|---|
| MT-A | Dungeon data file | content | `src/data/dungeons/buyucu_terasi.ts` (Appendix A), register in `src/data/dungeons/index.ts` (`DUNGEONS` and `MPLUS_POOL`, NP-18) | types of NP-01, NP-02, NP-03, NP-04 (optional fields), NP-14 styles (fallback below), ENGINE_VERTICALITY V1 types | `tsc` clean; `content-check` 0 errors; **18 rooms, 19 doors, 29 packs, 4 bosses**; forces sum 493, required 400; the dungeon loads in the dev scene picker |
| MT-V | Vertical content | content + world | the `VERT_EXTRA` block of the data file (floorY, ceiling, openAir, heightAreas, slopes, tiers), `DungeonDef.lifts`, void `fall`, the `arcane_lift_pad` prop wiring | ENGINE_VERTICALITY V1 to V6 (heightfield, nav, lifts), V3 validator | `node tools/height-check.mjs buyucu_terasi` and the validator E1 to E10 pass: all 19 doors within 0.45 m, grades at most 0.8, lifts match adjoining floors within 0.15 m, every boss arena a single region, no pack on a pad or stair; `buyuk_merdiven` and `hizmet_koridoru` are omitted when NP-01 is missing |
| MT-B | Enemy defs | enemies | `src/data/enemies/buyucu_terasi.ts` on the shared builders `src/data/enemies/builders.ts` (SPX-01): 12 defs, `mt_voidling_unstable` (`derive`), `mt_librarian`, MECH `proc_energy_orb`, passive `mt_codex_resonance`, the role passives, procedural models `codex` and `energy_orb` in `src/ai/procModels.ts` | NP-05 (LoS flag), NP-13 (statuses), GDD_CREATURES moves (`string`, `hold`, `rush`, `leap`, `marks`) and `role2`, NP-21 | every def in 4.1 / 4.2 present with 2 to 4 attacks and the windups of the rule; ids resolve in all pack members; `kick` flags set; `poise` values set; **no custom handler is needed (`mt_sen_beam` is a `marks sweep`)**; spawn test of each def |
| MT-C | Bosses | enemies | `BOSSES` entries (Appendix C) + `gemellus_clone` in `src/data/enemies/buyucu_terasi.ts`; `src/ai/bosses/buyucu.ts`; register in `src/ai/bosses/index.ts` (`BUYUCU_SCRIPTS`, `BUYUCU_SPAWNS`: arkanotron `['proc_energy_orb']`, gemellus `['gemellus_clone']`) | NP-06, NP-07, NP-08, NP-09, NP-10, NP-11, NP-13, NP-19, NP-20, NP-21, NP-22; **the live model paths are the existing fallbacks** (`lav_golemi`, `wraith`, `Demon_Lord`), so MT-C does not wait for MT-F | each boss reaches its kill with a scripted test party in the dev scene; every ability of 5.x fires; posture break works; resets clean everything (clones, orbs, zones, ledger) |
| MT-D | Season primitives consumed (`SPX-WAVE-1` to `SPX-WAVE-5`) plus the four local ones (NP-03 gaze, NP-20, NP-21, NP-22) | world, scenes, enemies, combat, hud, vfx-audio | `docs/dungeons/_shared_primitives.md` section 3 and 8.2 below | built **once for the whole season** by the wave packages of the registry; this dungeon only consumes them (the local ones ship with MT-D after their waves) | each primitive's acceptance in the registry; MT-A to MT-C can start in parallel using the listed fallbacks |
| MT-E | Theme, props, decoration | world + content | `DungeonBuilder.ts` style tables (NP-14); the `D.room(...)` blocks of the data file per 3.7 (props, lights, VFX, sounds, tiers); zones per Appendix A | NP-14, new Blender props (MT-F) or the listed fallbacks | every room has its set pieces; lights per view 10 or fewer; draw calls within the dungeon budget (about 500, ROADMAP); fallbacks (`fu('shelf_A_big')`, `hw('arch_gate')`...) work if props are late |
| MT-F | Blender assets and loading render | assets | `tools/blender/props/props_special.py` + `manifest.json` (**15 props**, 2.6); `tools/blender/bosses/boss_arkanotron.py`, `boss_gemellus.py`, `boss_degentrius.py` (**follow-up that only changes one model path each**); **the loading render `public/assets/loading/buyucu_terasi.jpg`** (headless Blender, the Atheneum with the PSX post look; the directory `public/assets/loading/` does not exist yet and is created here) | none | GLBs in `public/assets/models/gen/props` and `gen/bosses`; `glb-inspect` budgets (props 300 to 900 tris, bosses 600 to 1300); contact sheet re-rendered; the jpg is 1280 x 720 |
| MT-G | Entrance | content (world data) + scenes | `EntranceDef`, gate recipe (7), `PORTAL_TINTS['buyucu_terasi']`, `PORTALS` entry in `data/town.ts` | NP-17, Kadim Diyar layout (roadmap) | portal in the hall works now; world gate when Kadim Diyar exists |
| MT-H | Loot and items | items | `src/data/loot.ts` (`loot_mt_b1..b4`, Appendix C), `src/data/uniques.ts` (the 12 named items of 5.6, NP-23), optional set | NP-23 | tables resolve, uniques roll, each effect has a unit test of its proc |
| MT-I | Audio, VFX ids and icon | vfx-audio | `MUSIC_IDS` `dungeon_arcane`, `AMBIENCE_MANIFEST` ids (`amb_library`, `amb_sea`, `amb_gears`, `amb_beacon`, `amb_orrery`, `amb_sunwell`, `amb_whispers`, `amb_fountain`), `sfx_void_crack`, `sfx_lift_move`; `VFX_IDS` additions (NP-14, NP-15), aliases; **the icon `public/assets/icons/dungeon-buyucu-terasi.svg`** (an arcane eye over a crescent terrace, in the style of the existing dungeon icons) | none | unknown ids stay silent, aliases play; the svg renders in the keystone panel |
| MT-J | QA (one Haiku pass, last) | qa | none (report only) | all above | checklist: `tsc`; `content-check`; `height-check`; walk every room (doors, props not blocking doors or lift pads, nav, stairs, ledge pack); trigger each gate (`kill_lock` x 3, `boss_lock` east of the corridor); both lifts with 1 and 5 players; gaze patrol send-back; boons; run each boss with the dev tools (strings, hold, grab, leap, posture break); forces readout in a +10 run; minimap/map; FPS and light count |

**Fallbacks so MT-A can ship before art and primitives:** use `floor: 'temple'` and `wall: 'temple'` (existing, lilac) instead of `marble` / `arcane` / `library`; leave `gate: 'none'` **only on the library door**; **omit `buyuk_merdiven`, `hizmet_koridoru` and the four doors that touch them** (and `lift_hizmet`): with open gates they would be minute-0 shortcuts of 25 s and 12 s and would break 6.2; omit `extras.gaze` and `extras.boons` (the library is then a plain pull room); `wakeWhen` omitted makes `mt_p16` a normal dormant pack; omit `loadingImage` and `icon` until MT-F / MT-I deliver; if the vertical engine is late set `vertical: false` and every `floorY` is ignored (the dungeon plays flat, all doors still match). Models: the live boss paths are already the fallbacks of 2.6.

### 8.2 Shared primitives: mapping to the season registry

**The registry exists:** `docs/dungeons/_shared_primitives.md` (canonical ids `SPX-nn`, one owner and one API each, built once in `SPX-WAVE-1` to `SPX-WAVE-5` before any dungeon data package). This doc's `NP-xx` numbers survive only as local labels (they appear throughout this text); **implementation packages depend on the SPX id.** A dungeon package never re-implements a primitive: where this dungeon needs more than the canonical API it adds an optional field to it (last column). The registry resolved the collisions the critic listed: `MPLUS_POOL` (not `SEASON_POOL`), `src/data/enemies/builders.ts` for the enemy kit, one beam helper, one soak helper.

| local id | Name | Canonical | What this dungeon needs (spec, and the extension asked of the canonical primitive) | Used here |
|---|---|---|---|---|
| **NP-01** | `kill_lock` door gate | **SPX-08** | `DoorDef.gate: 'kill_lock'`, `DoorDef.opensOn?: { pack?; enemyId?; boss? }`, one gate resolver (`DungeonScene.gateShouldBeOpen`) reading a host-replicated set of dead enemy ids; drawn like `boss_lock`. No extension. | library door, grand-stair shortcut x 2, service corridor west door |
| **NP-02** | Pack wake trigger | **SPX-12** | `PackDef.wakeWhen?: { cleared: string[]; delay? }` and `dormant.kind 'ceiling'`. **Extension:** a pack standing on a ledge leaps down with a scripted `forcedMove` (`leap_land`, 0.2 shake) and joins the plaza region from its landing point. | plaza elevated pack |
| **NP-03** | Gaze patrol | **SPX-34** (owned by this dungeon) | `extras.gaze?: GazeDef[]` with `GazeDef { id; pos; facing; sweep?: { arc; period; offset? }; cone: { radius; angle }; returnTo: [number, number]; grace: number }`. Spawns a stationary invulnerable `mt_librarian` watcher (host rotates its yaw, replicated by the normal snapshot). **Each peer checks its own local player** against the cone (line of sight required, stealth statuses ignored); seen for `grace` s: flash, toast "Sessiz olun!", teleport to `returnTo`, `slow` 3 s. | Lycaneum |
| **NP-04** | Boon pickups | **SPX-10** (`extras.boons`) | `BoonDef { id; pos; status; duration; magnitude?; persistOnDeath?; oncePerPlayer?; cooldownSec? }`; prop `tag: 'boon'`; F to use, applied locally, the prop dims for that player only; status `crystal_power` (SPX-24 batch). No extension (the registry form already has these fields; `cooldownSec` is the one to confirm). | Tome (30 min haste 5 %), 4 pylons |
| **NP-05** | Line-of-sight hit | **SPX-23** (`params.los`) | `HitShapeSpec.requireLoS`, each peer checks `nav.lineOfSight` for its own player. **Extension:** when `vertical`, use `raycastY` (low rails do not block); thin line VFX from caster to each hit target. | Consuming Shadows |
| **NP-06** | Boss energy bar | **SPX-19** | `BossDef.energy { max; start?; regen; onFull?; costs? }` and `bossEnergy(c)` helper (`set/add/pause`), `boss_energy` message. **Extensions:** `regen` may be **negative** (drain) and `onEmpty?: string` (ability id) fires at 0. | Arkanotron (drain 2.7 / s, refuel), Seranel (fill 2.6 / s, wave) |
| **NP-07** | Seeker orbs | **SPX-17** (+ **SPX-26** for the PROC bodies) | `spawnOrb(c, from, { to: 'boss' \| Pt \| playerId, speed, tag })`, `updateOrbs(c, dt, { touchR, onTouch, onArrive })`, `clearOrbs`; MECH `proc_energy_orb` and PROC models `energy_orb`, `codex`. **Extension:** the orb is **invulnerable** (`makeInvulnerable` on spawn), resolved only by touch or arrival, 0 forces. | Arkanotron orbs |
| **NP-08** | Soak slots | **SPX-16** (`soak`) | `soak(c, { slots: [{ x, z, r, at }], need, coef, onFail, onPass })`, yellow display-only telegraph cancelled before landing. No extension. | Unstable Void Essence |
| **NP-09** | Spinning beams | **SPX-15** (`rotatingBeams` on `HitShapeSpec.spin`) | one persistent spinning shape per beam, replicated once and rotated locally on every peer (**no 0.1 s respawning**). **Extensions:** `from?: number` (start offset in metres from the pivot: the torrent segments start 5 m out), `pivot?: Pt` (default the shape origin) and `persist.targetIcd?: number` (per-target immunity after a hit, 3 s). A pair is two beams 180 deg apart. | Void Torrent |
| **NP-10**, **NP-11** | Health link, tether | **SPX-20** | `linkHealth(c, bodies, { absorb? })` (shared HP, any death kills the group), `tether(c, player, entity, { dur, onBreak, onExpire, touchR })` (touch distance checked on the host). No extension. | Gemellus |
| **NP-13** | Statuses | **SPX-24** (one append-only batch) | `polymorph` Koyuna Çevrildi (cc, cannot act, breaks on 10 % max HP damage, dispellable); `consuming_void` Tüketen Boşluk (shadow DoT, +15 % shadow damage taken, dispellable); `arcane_unstable` Kararsız Enerji (arcane DoT, stacks 8); `runic_mark` Rün İşareti (host-cleared); `neural_link` Sinirsel Bağ (+20 % damage taken); `devouring_entropy` Yutan Entropi (shadow DoT, **not dispellable**); `umbral_splinter` Gölge Kıymığı (shadow DoT, stacks, dispellable, **`reportEnd`**); `heal_absorb` Şifa Emilimi (absorbs incoming healing, dispellable); `crystal_power` Kristal Gücü (+12 % damage and healing). Icons reuse `debuff-*` / `buff-*` svgs. | all |
| **NP-14** | Theme additions | **SPX-05** (sky, open air), **SPX-06** (styles), **SPX-04** (music) | `FloorStyle 'marble'`, `WallStyle 'arcane' \| 'library'` (rows in `FLOORS`, `WALL_STYLES`, `DECOR`, see 2.2); `DungeonTheme.sky?: { image?; stars?; fallback? }` and `RoomDef.sky`; `MusicId 'dungeon_arcane'` (alias to `dungeon_shadow`); prop tags `'boon' \| 'port' \| 'lens' \| 'lift'`; `sunwell_glow` additive shaft as scenery. Open-air rooms use ENGINE_VERTICALITY's `RoomDef.openAir` (see the conflicts below). | all rooms |
| **NP-15** | VFX ids | **SPX-04** | `ambient_stardust`, `arcane_orb`, `void_torrent`, `dome_suppress` appended to `VFX_IDS` with aliases (`ambient_dust`, `arcane_projectile`, `lightning_strike`, `aegis_dome`); the registry already lists these four. | bosses |
| **NP-16** | Enemy kit export | **SPX-01** | `src/data/enemies/builders.ts` (the registry's path; the critic's `kit.ts` suggestion is superseded); this dungeon's file `src/data/enemies/buyucu_terasi.ts`. | MT-B, MT-C |
| **NP-17** | Entrance look | **SPX-33** | `EntranceDef.look` gains `'arcane'`; `ENTRANCE_RECIPES['arcane']` builds the gate of section 7; `PORTAL_TINTS`; map icon colour. | entrance |
| **NP-18** | Season pool | **SPX-03** | `MPLUS_POOL` (8 ids) and `LEVELLING_DUNGEON_IDS` exported from `src/data/dungeons/index.ts`; `DungeonDef.season?` and `endgame?` derive from the pool. No extension. | key rolls |
| **NP-19** | `removeStatusPlayer` | **SPX-16** (`cleanseSpot` + `removeStatusPlayer`) | `removeStatusPlayer(p, status)` delivers the removal to the owning peer (`pstatus` gains `removed: true`). No extension. | Seranel dome (mark clearing) |
| **NP-20** | Status end report | extension of **SPX-24** | `StatusDef.reportEnd`: the owning peer sends `pstatus_end { targetId, status, stacksLeft, reason: 'expire' \| 'dispel' \| 'remove' \| 'death' }` to the authority (validated in `net/messages.ts` `sanitize*`); the host script gets `onStatusEnd(c, p, status, reason, stacksLeft)` and keeps a host ledger. SPX-24's "verified remote reads of `Player.statuses`" must not be relied upon for stack counts: **scripts never read `PlayerSyncState.statuses`**. | Umbral Splinter ichor |
| **NP-21** | Posture-break buff strip | extension of **SPX-22** | `BreakSpec.strip?: string[]`: enemy self-buff status ids removed at the start of a break (`ignition`, `crystal_shield`, `empower`, `hastening_ward`, `group_absorb`). Script-owned, no purge skill. | trash buffs, Hastening Ward |
| **NP-22** | Boss strike kit | extension of **SPX-22** (boss side) | `src/ai/bosses/kit.ts`: `strikeString(c, strikes[], { hold? })`, `grabCatch(c, spec)`, `leapSlam(c, spec)`: the same shapes and timing rules as GDD_CREATURES 3.2 to 3.6 for scripted bosses. | all four bosses |
| **NP-23** | Unique effects and loot fields | **SPX-32** | `LootTable.uniques?: string[]`, `uniqueChance?: number`, bad-luck protection; `special` ids for the 12 named items of 5.6, each a small proc with its `params`. | loot |

**Consumed, not new:** ENGINE_VERTICALITY V1 to V13 (`DungeonDef.vertical`, `RoomDef.floorY / ceiling / heightAreas / slopes / tiers / openAir`, `DungeonDef.lifts`, `ZoneDef.fall`, `PropPlacement.hang / absY`), the GDD_CREATURES move interpreter and `role2`, the poise engine (`poise.ts`). NP-12 is intentionally unused (the registry maps it to SPX-14 `intermission`, which covers Gemellus' intro).

**Where this doc differs from the registry (for a human or the registry owner to settle; this doc follows the first-named source):**
1. **Verticality:** the registry's SPX-07 (`rampZone`, `extras.lifts`) predates `docs/ENGINE_VERTICALITY.md`, which has precedence and is the more complete spec (`slopes`, `heightAreas`, `tiers`, `DungeonDef.lifts`, validator). This doc uses ENGINE_VERTICALITY; SPX-07 should become "implement ENGINE_VERTICALITY V1 to V13".
2. **Open air:** SPX-05 says `RoomDef.open`, ENGINE_VERTICALITY says `RoomDef.openAir`. This doc uses `openAir`.
3. **Wall height:** SPX-06 lists `RoomDef.wallScale`; ENGINE_VERTICALITY 17.4 replaces it with `ceiling`. This doc uses `ceiling`.
4. **Posture:** SPX-22 defines `posture` and `params.string / gap / hold / recovery` as new; `docs/GDD_CREATURES.md` (which exists, the registry says it does not) already specifies the same ideas on the existing poise engine (`poise`, `onBreak`, `move.string / hold / leap / rush / grab`). This doc follows GDD_CREATURES; a rename would be mechanical.
5. **Checkpoints:** SPX-29 (release at the latest checkpoint) would make the death-run shortcuts of 6.7 moot; the service corridor would then remain as a showpiece but no longer be needed for fairness.
6. **Remote status reads:** see NP-20.

**Waves this dungeon consumes (registry section 3):** `SPX-WAVE-1` (SPX-01, 03, 04, 12, 26), `SPX-WAVE-2` (SPX-05, 06, 07 as ENGINE_VERTICALITY, 08, 10), `SPX-WAVE-3` (SPX-22, 23, 24), `SPX-WAVE-4` (SPX-15, 16, 17, 19, 20), `SPX-WAVE-5` (SPX-30, 32, 33). The local primitives (NP-03 gaze, NP-20, NP-21, NP-22) ship with MT-D right after the wave they extend. Dungeon packages: MT-B, MT-C, MT-A, MT-V (parallel, 4 agents, the bosses already use the fallback models, so MT-F can run in the same wave) after WAVE-4; MT-E, MT-G, MT-H, MT-I next; MT-J last. Each wave ends with a Sonnet diff review and an Opus spot check. ENGINE_VERTICALITY V1 to V6 must land before MT-V.

---

## 9. Rejected and modified critique

Critic issues (high, then medium) and what was done. Everything not listed here was accepted as written.

| Issue | Decision |
|---|---|
| High 1 (purge and status removal have no engine support) | **Accepted, with option 3 for enemy buffs.** There is no enemy-buff purge or steal mechanic: every "purge" duty was rewritten as a **poise break** (a break strips the flagged buff, drops the front block or cancels the move; NP-21) or a defensive. Status removal got NP-19 (`removeStatusPlayer`, part of SPX-16 together with Taşkasa's cleanse spots) and NP-20 (owner-reported `pstatus_end`), and scripts keep a **host ledger** instead of reading `PlayerSyncState.statuses`. Seranel's dome is host-managed (the script clears the mark itself), so no purge detection exists. I did not add an enemy-buff purge skill: it would be a class-design change outside a dungeon doc. |
| High 2 (torrent beams through the boss) | **Accepted.** Beams start 5 m from the hub, a pair is one line, phase 3 is two crossing lines, the 14 deg/s sweep is marked ours (Appendix D). The alternative (pivot around the obelisk) was not taken because the obelisks sit 17.6 m out and a beam pivoting there would not cross the dais the way the WoW fight reads. |
| High 3 (colliding NP numbering) | **Accepted.** The registry `docs/dungeons/_shared_primitives.md` now exists; 8.2 maps every NP to its `SPX-nn`: NP-06 = SPX-19, NP-09 = SPX-15 (one persistent spinning shape, not a shape every 0.1 s), NP-14 sky = SPX-05, NP-16 = SPX-01 (the registry chose `enemies/builders.ts`, so the critic's `kit.ts` form is superseded), NP-18 = SPX-03 (`MPLUS_POOL`). Six remaining differences between this doc and the registry are listed at the end of 8.2. |
| High 4 (third orb volley after the window) | **Accepted by the first fix, not the second.** Volleys at 0, 4, 8 s and orbs at 4.5 m/s (5.0 in phase 2) resolve by 17.1 s, inside the 20 s window. I did not extend the window to "the last orb": it would make the leak punishment depend on the window length. |
| High 5 (death-run section) | **Accepted, one change.** New `hizmet_koridoru` with `lift_hizmet`, run about 12 s after boss 3, 6.7 and the run-clock note rewritten. **The east door is a `boss_lock` (order 4), not a second `kill_lock`:** same result before the fight, but it also closes 3 s after Degentrius engages and stays closed while a lower boss lives, so a released player cannot walk into a running fight. The west door is the `kill_lock` with `opensOn: { boss: 3 }`. |
| Medium 6 (fallback opens shortcut) | **Accepted.** The fallback omits `buyuk_merdiven`, `hizmet_koridoru` and all four doors; `none` only on the library door. |
| Medium 7 (no cover for Consuming Shadows) | **Accepted.** 3 columns on the terrace, 6 on the tower stair, 4 freestanding bookcases in the upper library, all with at least 2 m of nav gap (checked), SP12 and Appendix A. |
| Medium 8 (energy orb dies to AoE) | **Accepted.** `makeInvulnerable` on spawn, resolved only by touch; the doc states that Gemellus' clones take cleave damage by design and orbs do not. |
| Medium 9 (boss models do not exist) | **Accepted.** The live paths are `lav_golemi.glb`, `wraith.glb`, `Demon_Lord.glb` with tint and scale; MT-F switches each boss to its Blender GLB by changing one path. |
| Medium 10 (wrong chain path) | **Accepted.** `ip('psx-dungeon','chain')` is used everywhere (`gp('chains_hanging')` also exists under `gen/props` and is an acceptable alternative). |
| Medium 11 (loading jpg and icon unowned) | **Accepted, both fixes.** The render is in MT-F, the svg in MT-I, and both fields are omitted from the data file until the assets exist. |

---

## Appendix A. Data file skeleton (`src/data/dungeons/buyucu_terasi.ts`)

Spec skeleton, same style as `golge_tapinagi.ts`. Decoration blocks (`D.room(...)`) come from 3.7. Fields marked NEW exist only after NP-01..NP-04 / NP-14 or the ENGINE_VERTICALITY types (V1). All heights are absolute metres; `tiers` heights are written as `floor + offset` (the offsets are the numbers of 3.7).

```ts
import type { DoorDef, DungeonDef, DungeonTheme, PackDef, RoomDef, ZoneDef, LiftDef, DecorTier } from '../../types/dungeons';
import { Props, bossAt, circleZone, decorator, door, dg, fu, gp, hw, kc, kf, kg, ip, lt, makeCtx, pack, pt, rectZone, rectsOf, room, shPt, withProps, type MemberTuple } from './kit';

/** Floor heights (m). L0 0, L1 2.7, L2 5.4, L3 13.5. */
const F = { l0: 0, l1: 2.7, l2: 5.4, l3: 13.5 } as const;
const T = (x: number, z: number, w: number, h: number) => ({ x, z, w, h });

const ROOMS: RoomDef[] = [
  room('giris', 'Sessiz Fuaye', 8, 58, 12, 8, 'marble', 'arcane', 0.3),
  room('guney_antre', 'Güney Antre Salonu', 6, 46, 16, 12, 'marble', 'arcane', 0.4),
  room('lycaneum', 'Lycaneum Geçidi', 8, 40, 10, 6, 'marble', 'library', 0.1),
  room('gizem_arsivi', 'Gizem Arşivi', 4, 26, 16, 14, 'marble', 'library', 0.3),
  room('yasak_raflar', 'Yasak Raflar', 0, 28, 4, 10, 'stone_dark', 'library', 0.3, { optional: true }),
  room('ust_kutuphane', 'Üst Kütüphane', 4, 12, 16, 14, 'wood', 'library', 0.3),
  room('meydan', 'Yıldız Meydanı', 20, 18, 20, 16, 'marble', 'arcane', 0.15),
  room('buyuk_merdiven', 'Büyük Merdiven', 22, 34, 8, 14, 'marble', 'arcane', 0.05),
  room('gozlemevi', 'Gözlemevi Bahçeleri', 20, 2, 20, 16, 'marble', 'arcane', 0.1, { boss: 1 }),
  room('enerji_avlusu', 'Enerji Avlusu', 40, 6, 22, 12, 'marble', 'arcane', 0.2),
  room('balkon', 'Güneş Kuyusu Balkonu', 48, 0, 12, 6, 'marble', 'arcane', 0.1, { optional: true }),
  room('siginak', 'Başbüyücü Sığınağı', 42, 18, 18, 14, 'stone_dark', 'temple', 0.1, { boss: 2 }),
  room('teras_yolu', 'Teras Yolu', 42, 32, 18, 6, 'marble', 'arcane', 0.2),
  room('takimyildiz', 'Takımyıldız Odası', 42, 38, 18, 14, 'marble', 'arcane', 0.1, { boss: 3 }),
  room('kule_tabani', 'Teori Kulesi Tabanı', 30, 40, 12, 10, 'stone_dark', 'arcane', 0.3),
  room('kule_merdiveni', 'Teori Kulesi Merdiveni', 30, 50, 12, 6, 'stone_dark', 'temple', 0.2),
  room('hizmet_koridoru', 'Hizmet Koridoru', 20, 60, 6, 2, 'stone_dark', 'arcane', 0),               // NEW room (service lift corridor)
  room('goksel_yorunge', 'Göksel Yörünge', 26, 56, 18, 14, 'stone_dark', 'temple', 0.05, { boss: 4 }),
];

/** ENGINE_VERTICALITY fields per room (floorY, ceiling, openAir, heightAreas, slopes, tiers). Checked by the scratch validator and by `tools/height-check.mjs`. */
const VERT_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: { floorY: F.l0, ceiling: 14, tiers: [{ kind: 'windows', y: F.l0 + 6, rect: T(8, 59, 1, 6), count: 3, spacing: 3 }] },
  guney_antre: {
    floorY: F.l0, ceiling: 18,
    tiers: [
      { kind: 'gallery', y: F.l0 + 6.5, rect: T(6, 46, 16, 12), depth: 3 }, { kind: 'colonnade', y: F.l0 + 6.5, rect: T(7, 47, 14, 10), count: 8 },
      { kind: 'windows', y: F.l0 + 11, rect: T(6, 47, 1, 10), count: 4, spacing: 2.5 }, { kind: 'windows', y: F.l0 + 11, rect: T(21, 47, 1, 10), count: 4, spacing: 2.5 },
    ],
  },
  lycaneum: { floorY: F.l0, ceiling: 12, tiers: [{ kind: 'gallery', y: F.l0 + 5, rect: T(8, 40, 10, 1), depth: 2 }] },
  gizem_arsivi: {
    floorY: F.l0, ceiling: 26,
    tiers: [
      { kind: 'gallery', y: F.l0 + 7.5, rect: T(4, 26, 16, 14), depth: 3 }, { kind: 'gallery', y: F.l0 + 14, rect: T(4, 26, 16, 14), depth: 2 },
      { kind: 'colonnade', y: F.l0 + 7.5, rect: T(5, 27, 14, 12), count: 8 }, { kind: 'windows', y: F.l0 + 19, rect: T(4, 26, 16, 1), count: 4, spacing: 3.5 },
      { kind: 'beams', y: F.l0 + 24, rect: T(4, 26, 16, 14) },
    ],
  },
  yasak_raflar: { floorY: F.l0, ceiling: 20, tiers: [{ kind: 'gallery', y: F.l0 + 8, rect: T(0, 28, 4, 10), depth: 1.5 }] },
  ust_kutuphane: {
    floorY: F.l1, ceiling: 20,
    slopes: [{ id: 'st_arsiv_ust', kind: 'stairs', rect: T(11, 24, 2, 2), axis: 'z', yFrom: F.l1, yTo: F.l0, style: 'stone' }],
    tiers: [
      { kind: 'gallery', y: F.l1 + 9.5, rect: T(4, 12, 16, 14), depth: 3 }, { kind: 'windows', y: F.l1 + 14, rect: T(4, 12, 16, 1), count: 6, spacing: 2.5 },
      { kind: 'beams', y: F.l1 + 18, rect: T(4, 12, 16, 14) },
    ],
  },
  meydan: {
    floorY: F.l2, ceiling: 10, openAir: true,
    heightAreas: [{ id: 'ledge', rect: T(31, 18, 8, 2), y: F.l2 + 3, rim: 'rail' }],       // elevated pack mt_p16 (8.4 m)
    slopes: [{ id: 'st_ust_meydan', kind: 'stairs', rect: T(20, 20, 2, 2), axis: 'x', yFrom: F.l1, yTo: F.l2, style: 'stone' }],
    tiers: [{ kind: 'balcony', y: F.l2 + 3.6, rect: T(20, 18, 7, 2), depth: 3 }],
  },
  buyuk_merdiven: {
    floorY: F.l0, ceiling: 24,
    heightAreas: [{ id: 'top_landing', rect: T(22, 34, 8, 2), y: F.l2, rim: 'rail' }],
    slopes: [{ id: 'grand_stair', kind: 'stairs', rect: T(22, 36, 8, 7), axis: 'z', yFrom: F.l2, yTo: F.l0, style: 'carpet', color: 0x8a1c30 }],
    tiers: [
      { kind: 'colonnade', y: F.l0 + 8, rect: T(22, 34, 8, 14), count: 8 }, { kind: 'gallery', y: F.l0 + 8, rect: T(22, 34, 8, 14), depth: 2 },
      { kind: 'windows', y: F.l0 + 14, rect: T(22, 34, 8, 1), count: 6, spacing: 1.2 },
    ],
  },
  gozlemevi: {
    floorY: F.l2, ceiling: 10, openAir: true,
    tiers: [
      { kind: 'balcony', y: F.l2 + 11, rect: T(20, 2, 20, 1), depth: 3 }, { kind: 'balcony', y: F.l2 + 11, rect: T(20, 17, 20, 1), depth: 3 },
      { kind: 'windows', y: F.l2 + 13, rect: T(20, 2, 20, 1), count: 5, spacing: 3 },
    ],
  },
  enerji_avlusu: {
    floorY: F.l2, ceiling: 10, openAir: true,
    slopes: [{ id: 'st_avlu_sig', kind: 'stairs', rect: T(49, 14, 2, 4), axis: 'z', yFrom: F.l2, yTo: F.l1, style: 'stone' }],
    tiers: [{ kind: 'balcony', y: F.l2 + 9, rect: T(59, 6, 2, 12), depth: 3 }, { kind: 'colonnade', y: F.l2 + 9, rect: T(41, 7, 20, 9), count: 6 }],
  },
  balkon: { floorY: F.l2, ceiling: 8, openAir: true },
  siginak: {
    floorY: F.l1, ceiling: 18,
    tiers: [
      { kind: 'gallery', y: F.l1 + 9, rect: T(42, 18, 18, 14), depth: 3 }, { kind: 'windows', y: F.l1 + 12, rect: T(42, 18, 18, 1), count: 6, spacing: 2.5 },
      { kind: 'beams', y: F.l1 + 16, rect: T(42, 18, 18, 14) },
    ],
  },
  teras_yolu: {
    floorY: F.l1, ceiling: 8, openAir: true,
    tiers: [{ kind: 'windows', y: F.l1 + 6, rect: T(42, 32, 18, 1), count: 6, spacing: 3 }, { kind: 'gallery', y: F.l1 + 6, rect: T(42, 32, 18, 1), depth: 2 }],
  },
  takimyildiz: {
    floorY: F.l1, ceiling: 30, openAir: true,
    tiers: [
      { kind: 'gallery', y: F.l1 + 9, rect: T(42, 38, 18, 14), depth: 3 }, { kind: 'colonnade', y: F.l1 + 9, rect: T(44, 40, 14, 10), count: 12 },
      { kind: 'beams', y: F.l1 + 28, rect: T(42, 38, 18, 14) },
    ],
  },
  kule_tabani: {
    floorY: F.l1, ceiling: 28,
    tiers: [
      { kind: 'gallery', y: F.l1 + 10, rect: T(30, 40, 12, 10), depth: 2 }, { kind: 'gallery', y: F.l1 + 18, rect: T(30, 40, 12, 10), depth: 2 },
      { kind: 'windows', y: F.l1 + 20, rect: T(30, 40, 12, 1), count: 4, spacing: 2.5 },
    ],
  },
  kule_merdiveni: {
    floorY: F.l1, ceiling: 28,
    heightAreas: [{ id: 'landing', rect: T(30, 54, 12, 2), y: F.l3, rim: 'rail' }],           // holds the boss 4 door (35, 55)
    tiers: [{ kind: 'gallery', y: F.l1 + 8, rect: T(30, 50, 12, 6), depth: 1.5 }, { kind: 'beams', y: F.l1 + 26, rect: T(30, 50, 12, 6) }],
  },
  hizmet_koridoru: { floorY: F.l0, ceiling: 7, heightAreas: [{ id: 'east_end', rect: T(24, 60, 2, 2), y: F.l3 }] },
  goksel_yorunge: { floorY: F.l3, ceiling: 40, openAir: true },
};

/** Lifts are dungeon-level (they span two floors of a room). mode 'call': a player standing on the pad for 0.6 s sends it. */
const LIFTS: LiftDef[] = [
  { id: 'lift_kule', roomId: 'kule_merdiveni', rect: T(34, 53, 3, 1), stops: [F.l1, F.l3], speed: 4.0, mode: 'call', start: 0 },
  { id: 'lift_hizmet', roomId: 'hizmet_koridoru', rect: T(22, 60, 2, 2), stops: [F.l0, F.l3], speed: 4.5, mode: 'call', start: 0 },   // omit with the corridor in the fallback
];

/** Collidable cover columns for Consuming Shadows (SP12). Each keeps at least 2 m of nav gap to walls, neighbours and cliffs (validated). */
const COLS = {
  terrace: [[44.5, 36.2], [47.5, 36.2], [51.5, 36.2]] as [number, number][],
  tower: [[30.8, 50.6], [30.8, 52.6], [40.6, 50.6], [40.6, 52.6], [32.2, 52.8], [37.8, 52.8]] as [number, number][],
  library: [[6.5, 17.5], [11.5, 18.5], [16.5, 17.0], [13.0, 14.0]] as [number, number][],   // freestanding bookcases
};

const DOORS: DoorDef[] = [
  door('giris', 'guney_antre', 13, 58, 'n', 2, 'none'),
  door('guney_antre', 'lycaneum', 11, 46, 'n', 2, 'none'),
  door('lycaneum', 'gizem_arsivi', 11, 40, 'n', 2, 'none'),
  door('gizem_arsivi', 'yasak_raflar', 4, 32, 'w', 2, 'none'),
  { ...door('gizem_arsivi', 'ust_kutuphane', 11, 26, 'n', 2, 'kill_lock'), opensOn: { pack: 'mt_p06', enemyId: 'mt_pyromancer' } }, // NEW NP-01
  door('ust_kutuphane', 'meydan', 19, 20, 'e', 2, 'none'),
  { ...door('guney_antre', 'buyuk_merdiven', 21, 46, 'e', 2, 'kill_lock'), opensOn: { boss: 1 } },                // NEW NP-01
  { ...door('buyuk_merdiven', 'meydan', 24, 34, 'n', 2, 'kill_lock'), opensOn: { boss: 1 } },                     // NEW NP-01
  door('meydan', 'gozlemevi', 28, 18, 'n', 2, 'boss_lock'),
  door('gozlemevi', 'enerji_avlusu', 39, 10, 'e', 2, 'boss_exit'),
  door('enerji_avlusu', 'balkon', 53, 6, 'n', 2, 'none'),
  door('enerji_avlusu', 'siginak', 49, 17, 's', 2, 'boss_lock'),
  door('siginak', 'teras_yolu', 49, 31, 's', 2, 'boss_exit'),
  door('teras_yolu', 'takimyildiz', 49, 37, 's', 2, 'boss_lock'),
  door('takimyildiz', 'kule_tabani', 42, 44, 'w', 2, 'boss_exit'),
  door('kule_tabani', 'kule_merdiveni', 35, 49, 's', 2, 'none'),
  door('kule_merdiveni', 'goksel_yorunge', 35, 55, 's', 2, 'boss_lock'),
  { ...door('giris', 'hizmet_koridoru', 19, 60, 'e', 2, 'kill_lock'), opensOn: { boss: 3 } },                    // NEW NP-01 (death-run shortcut B)
  door('hizmet_koridoru', 'goksel_yorunge', 25, 60, 'e', 2, 'boss_lock'),                                          // closes in the Degentrius fight
];

/** Sunflower-spiral member offsets (tiles), the same pattern as the generated layouts: r = 0.3 sqrt(1 + 2 i), angle i * 137.508 deg. List melee / swarm first, casters and healers last (they end up on the outer edge of the cluster). */
const GA = (137.508 * Math.PI) / 180;
const fm = (list: [string, number][]): MemberTuple[] => {
  const out: MemberTuple[] = [];
  let i = 0;
  for (const [id, n] of list) {
    for (let k = 0; k < n; k++, i++) {
      const r = 0.3 * Math.sqrt(1 + 2 * i);
      out.push([id, +(r * Math.cos(i * GA)).toFixed(2), +(r * Math.sin(i * GA)).toFixed(2)]);
    }
  }
  return out;
};

const PACKS: PackDef[] = [
  pack('mt_p01', 'guney_antre', 11, 53, 16, fm([['mt_sunblade', 2], ['mt_magister', 2]])),
  pack('mt_p02', 'guney_antre', 17, 51, 16, fm([['mt_magister', 3], ['mt_sifaci', 1]])),
  pack('mt_p03', 'guney_antre', 12, 49, 18, fm([['mt_mechanoid', 2], ['mt_sunblade', 2]])),
  pack('mt_p04', 'guney_antre', 13, 52, 10, fm([['mt_sentry', 1]]), { patrol: [[8.5, 55], [19, 55], [19, 47.5], [8.5, 47.5]] }),
  pack('mt_p05', 'lycaneum', 14, 41.5, 10, fm([['mt_codex', 5]]), { dormant: { kind: 'ceiling', wakeRadius: 8 } }),
  pack('mt_p06', 'gizem_arsivi', 10, 31, 15, fm([['mt_codex', 4], ['mt_pyromancer', 1]])),
  pack('mt_p07', 'gizem_arsivi', 15.5, 35.5, 18, fm([['mt_voidling', 6], ['mt_voidling_unstable', 2], ['mt_infuser', 2]])),
  pack('mt_p08', 'gizem_arsivi', 6, 28.5, 16, fm([['mt_spellbreaker', 1], ['mt_magister', 2]])),
  pack('mt_p09', 'gizem_arsivi', 15, 29, 16, fm([['mt_codex', 6], ['mt_sifaci', 1]])),
  pack('mt_p10', 'yasak_raflar', 1.5, 31, 15, fm([['mt_codex', 4], ['mt_pyromancer', 1]]), { optional: true }),
  pack('mt_p11', 'ust_kutuphane', 8, 21, 20, fm([['mt_voidling', 3], ['mt_voidling_unstable', 1], ['mt_voidcaller', 1], ['mt_infuser', 2]])),
  pack('mt_p12', 'ust_kutuphane', 14, 22, 16, fm([['mt_sunblade', 2], ['mt_sifaci', 2]])),
  pack('mt_p13', 'ust_kutuphane', 9, 15, 14, fm([['mt_sentry', 1], ['mt_magister', 1]])),
  pack('mt_p14', 'meydan', 26, 27, 16, fm([['mt_spellbreaker', 1], ['mt_sunblade', 2]])),
  pack('mt_p15', 'meydan', 33, 27, 16, fm([['mt_spellbreaker', 1], ['mt_magister', 2]])),
  pack('mt_p16', 'meydan', 34.5, 18.5, 20, fm([['mt_sentry', 1], ['mt_infuser', 2]]),                                  // on the ledge (8.4 m)
    { dormant: { kind: 'ceiling', wakeRadius: 0 }, linkedTo: ['mt_p13'], wakeWhen: { cleared: ['mt_p14', 'mt_p15'] } }), // wakeWhen NEW NP-02
  pack('mt_p17', 'enerji_avlusu', 45, 13, 20, fm([['mt_sunblade', 3], ['mt_sifaci', 1], ['mt_magister', 1]])),
  pack('mt_p18', 'enerji_avlusu', 52, 9, 20, fm([['mt_mechanoid', 2], ['mt_infuser', 2]])),
  pack('mt_p19', 'enerji_avlusu', 58, 13, 16, fm([['mt_spellbreaker', 1], ['mt_sifaci', 2]])),
  pack('mt_p20', 'enerji_avlusu', 54.5, 15.5, 15, fm([['mt_sunblade', 1], ['mt_magister', 1], ['mt_pyromancer', 1]])),
  pack('mt_p21', 'balkon', 53.5, 2, 15, fm([['mt_sentry', 1], ['mt_mechanoid', 1]]), { optional: true }),
  pack('mt_p22', 'teras_yolu', 47, 33, 18, fm([['mt_sunblade', 2], ['mt_voidcaller', 1], ['mt_magister', 1]])),
  pack('mt_p23', 'teras_yolu', 53, 33, 20, fm([['mt_magister', 3], ['mt_sifaci', 2]])),
  pack('mt_p24', 'teras_yolu', 58, 33, 18, fm([['mt_spellbreaker', 1], ['mt_infuser', 2]])),
  pack('mt_p25', 'teras_yolu', 50, 34.5, 10, fm([['mt_sentry', 1]]), { patrol: [[44, 34.5], [57.5, 34.5]] }),
  pack('mt_p26', 'kule_tabani', 33.5, 43, 27, fm([['mt_tyrant', 1], ['mt_voidling', 4], ['mt_voidling_unstable', 1], ['mt_infuser', 2]])),
  pack('mt_p27', 'kule_tabani', 38.5, 46.5, 20, fm([['mt_tyrant', 1], ['mt_magister', 2]])),
  pack('mt_p28', 'kule_merdiveni', 33.4, 51.0, 26, fm([['mt_tyrant', 1], ['mt_voidling', 2], ['mt_voidling_unstable', 1], ['mt_voidcaller', 1], ['mt_infuser', 1]])),
  pack('mt_p29', 'kule_merdiveni', 38.0, 51.0, 16, fm([['mt_voidling', 4], ['mt_voidling_unstable', 2], ['mt_infuser', 2]])),
];

/** Design flags: big pulls (Katliam spots). */
const BIG = new Set(['mt_p01', 'mt_p02', 'mt_p03', 'mt_p07', 'mt_p09', 'mt_p14', 'mt_p15', 'mt_p17', 'mt_p18']);

const BOSSES = [
  bossAt('boss_arkanotron', 'gozlemevi', 29.5, 6.0, 0, 1),
  bossAt('boss_seranel', 'siginak', 50.5, 27.5, 180, 2),
  bossAt('boss_gemellus', 'takimyildiz', 50.5, 41.5, 0, 3),
  bossAt('boss_degentrius', 'goksel_yorunge', 34.5, 62.5, 0, 4),
];

const THEME: DungeonTheme = {
  fogColor: 0x14123a, fogNear: 12, fogFar: 56, ambient: 0x4a4478, ambientIntensity: 0.42, hemiSky: 0x6a74c8, hemiGround: 0x2a1a38,
  torchColor: 0xf2a14a, bloomStrength: 0.55, music: 'dungeon_arcane' /* NEW NP-14 */, tint: 0xb8aed8,
  palette: [0x1d1a46, 0x3a2350, 0x6e1b2b, 0xf2a14a, 0x5fd3e8, 0x7c7396, 0xd6d0f0, 0x2a0f3a],
  // sky: { stars: true, fallback: { zenith: 0x080620, mid: 0x1d1a46, horizon: 0x5a3a78, ... } }   NEW NP-14 = SPX-05
};

const START: [number, number] = [13.5, 63.5];
const FONT: [number, number] = [13.5, 61];
const EXIT: [number, number] = [34.5, 67.0];

const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: { explicitDecor: true, lightColor: 0xf2a14a, zones: [circleZone('rune', FONT[0], FONT[1], 1.7, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.9 })] },
  lycaneum: { explicitDecor: true, lightColor: 0xf2a14a, fog: { color: 0x2a1a38, near: 8, far: 40 } },
  gizem_arsivi: { explicitDecor: true, lightColor: 0xf2a14a, fog: { color: 0x2a1a38, near: 8, far: 56 } },     // far x1.4 for the 26 m hall (kit tall())
  ust_kutuphane: { explicitDecor: true, lightColor: 0xf2a14a, fog: { color: 0x2a1a38, near: 8, far: 50 } },
  meydan: {
    explicitDecor: true, lightColor: 0x5fd3e8,
    zones: [
      circleZone('rune', 29.5, 26, 6, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.45 }),
      circleZone('rune', 29.5, 26, 4, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.6 }),
      circleZone('rune', 29.5, 26, 2, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.8 }),
    ],
  },
  gozlemevi: { explicitDecor: true, fog: { color: 0x14183c, near: 16, far: 74 }, zones: [circleZone('dais', 29.5, 9.5, 1.6, { color: 0x3a3050 })] },
  enerji_avlusu: { explicitDecor: true, ambientVfx: 'ambient_dust', fog: { color: 0x1a2250, near: 18, far: 80 } },
  balkon: { explicitDecor: true, lightColor: 0xffd77a, zones: [circleZone('pool', 53.5, 1.0, 2.2, { blocked: true, color: 0xffd77a, glow: 0xffd77a, glowIntensity: 1.4, light: lt(0xffd77a, 1.8, 14, false, 0.8) })] },
  siginak: { explicitDecor: true, lightColor: 0x5fd3e8, zones: [circleZone('rune', 50.5, 24.5, 2.0, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.9 })] },
  teras_yolu: { fog: { color: 0x1a2250, near: 18, far: 80 } },
  takimyildiz: { explicitDecor: true, lightColor: 0x5fd3e8 /* + 12 radial rune lines, rings r 5 and r 3 around (50.5, 44.5), 12 columns on r 6 */ },
  kule_tabani: {
    ambientVfx: 'ambient_shadow_wisps', lightColor: 0x8a3cff, fog: { color: 0x1a1240, near: 10, far: 56 },
    zones: [circleZone('void', 35.5, 44.5, 1.6, { blocked: true, color: 0x05031a, glow: 0x8a3cff, glowIntensity: 0.7 })],   // gear shaft pit, solid, no fall
  },
  kule_merdiveni: { ambientVfx: 'ambient_shadow_wisps', lightColor: 0x8a3cff, fog: { color: 0x180e3a, near: 10, far: 52 } },
  goksel_yorunge: {
    explicitDecor: true, ambientVfx: 'ambient_shadow_wisps', lightColor: 0x8a3cff, fog: { color: 0x0a0820, near: 20, far: 90 },
    zones: [
      circleZone('void', 34.5, 62.5, 6.8, { blocked: true, fall: 'open', depth: 30, color: 0x05031a, glow: 0x8a3cff, glowIntensity: 0.9, vfx: 'ambient_stardust' }),   // real fall (ENGINE_VERTICALITY ZoneDef.fall)
      circleZone('dais', 34.5, 62.5, 5.2, { color: 0x2a2340 }),
      rectZone('bridge', 35, 56, 2, 2, { color: 0x3a3050 }),         // north bridge from the lift-landing door (8 m wide)
      rectZone('bridge', 26, 60, 4, 2, { color: 0x3a3050 }),         // west bridge from the service corridor (8 m wide)
    ],
  },
  hizmet_koridoru: { lightColor: 0xf2a14a },
};

const EXTRAS: NonNullable<DungeonDef['extras']> & { boons?: unknown[]; gaze?: unknown[] } = {
  fontOfPower: pt(FONT[0], FONT[1]),
  shrines: [{ type: 'shrine_haste', pos: pt(21, 29) }, { type: 'shrine_ward', pos: pt(31, 47.5) }],
  riftSpots: ([[16, 52.5], [11, 34], [30, 29], [50, 12], [53, 35], [36, 45]] as [number, number][]).map(([x, z]) => pt(x, z)),
  chests: [{ pos: pt(56, 2.5), kind: 'chest_gold' }, { pos: pt(1, 34.5), kind: 'chest_iron' }],
  // NEW NP-04 / NP-03:
  boons: [
    { id: 'boon_tome', pos: pt(8.2, 40.8), status: 'haste', duration: 1800, magnitude: 0.05, persistOnDeath: true, oncePerPlayer: true },
    ...([[42, 8], [58, 7.5], [42, 16], [59, 16]] as [number, number][]).map(([x, z], i) => ({ id: `boon_crystal_${i + 1}`, pos: pt(x, z), status: 'crystal_power', duration: 30, cooldownSec: 90 })),
  ],
  gaze: [
    { id: 'gaze_a', pos: pt(17.2, 44.5), facing: -90, sweep: { arc: 90, period: 5 }, cone: { radius: 10, angle: 55 }, returnTo: pt(13.5, 63.5), grace: 0.45 },
    { id: 'gaze_b', pos: pt(7.8, 42.5), facing: 90, sweep: { arc: 90, period: 6, offset: 2 }, cone: { radius: 10, angle: 55 }, returnTo: pt(13.5, 63.5), grace: 0.45 },
    { id: 'gaze_c', pos: pt(13.5, 39.9), facing: 0, sweep: { arc: 120, period: 7 }, cone: { radius: 10, angle: 55 }, returnTo: pt(13.5, 63.5), grace: 0.45 },
  ],
};

export const BUYUCU_TERASI: DungeonDef = {
  id: 'buyucu_terasi', name: 'Büyücüler Terası', shortName: 'Teras',
  lore: '...see section 1...', levelRange: [60, 60], timerSec: 1920, forcesRequired: 400, theme: THEME,
  vertical: true,                                                      // NEW (ENGINE_VERTICALITY): switches the heightfield on
  grid: { w: 64, h: 70 }, rooms: [] /* withProps(ROOMS.map(r => ({ ...r, ...VERT_EXTRA[r.id], ...ROOM_EXTRA[r.id] })), D.out) */, doors: DOORS, lifts: LIFTS,
  packs: PACKS.map((p) => (BIG.has(p.id) ? { ...p, big: true } : p)), bosses: BOSSES,
  start: { pos: shPt(START[0], START[1]), facing: 180 }, exit: { pos: shPt(EXIT[0], EXIT[1]) },
  // icon: '/assets/icons/dungeon-buyucu-terasi.svg',        optional: set by MT-I when the svg exists
  // loadingImage: '/assets/loading/buyucu_terasi.jpg',      optional: set by MT-F when the render exists
  extras: EXTRAS,
};
```

Registration: add `[BUYUCU_TERASI.id]: BUYUCU_TERASI` to `DUNGEONS` and `BUYUCU_TERASI.id` to `MPLUS_POOL` (NP-18 = SPX-03) in `src/data/dungeons/index.ts`; keep `DUNGEON_IDS` as the 4 levelling dungeons plus this id only if NP-18 is not built yet (then the dungeon becomes a key dungeon through the old list). The enemy ids used by packs are the 12 of 4.1 plus `mt_voidling_unstable`. Fallback of 8.1: delete `buyuk_merdiven`, `hizmet_koridoru`, `LIFTS[1]` and the four doors that touch the two rooms; set the library door to `'none'`.

## Appendix B. Type additions (append-only)

ENGINE_VERTICALITY owns `DungeonDef.vertical / lifts`, `RoomDef.floorY / ceiling / heightAreas / slopes / tiers / openAir`, `ZoneDef.fall / depth` and `PropPlacement.hang / absY`: not repeated here. This dungeon adds:

```ts
// src/types/dungeons.ts
export type FloorStyle = /* existing */ | 'marble';
export type WallStyle = /* existing */ | 'arcane' | 'library';
// DoorDef
gate?: 'none' | 'open' | 'boss_lock' | 'boss_exit' | 'forces_lock' | 'kill_lock';
opensOn?: { pack?: string; enemyId?: string; boss?: number };           // NP-01
// PackDef
wakeWhen?: { cleared: string[]; delay?: number };                        // NP-02
// PropPlacement.tag
tag?: /* existing */ | 'boon' | 'port' | 'lens' | 'lift';
// DungeonDef.extras
gaze?: { id: string; pos: [number, number]; facing: number; sweep?: { arc: number; period: number; offset?: number };
         cone: { radius: number; angle: number }; returnTo: [number, number]; grace: number }[];   // NP-03
boons?: { id: string; pos: [number, number]; status: StatusId; duration: number; magnitude?: number;
          persistOnDeath?: boolean; oncePerPlayer?: boolean; cooldownSec?: number }[];            // NP-04
// DungeonTheme and RoomDef (SPX-05, shared)
sky?: { image?: string; stars?: boolean; fallback?: SkyOptions };                                  // NP-14 = SPX-05
// types/enemies.ts, types/statuses
BreakSpec.strip?: string[];                                                                        // NP-21
StatusDef.reportEnd?: boolean;                                                                     // NP-20
// BossDef
energy?: { max: number; start?: number; regen: number /* may be negative */; onFull?: string; onEmpty?: string; costs?: Record<string, number> };  // NP-06 = SPX-19 + extensions
poise?: number; onBreak?: BreakSpec; enrage?: EnrageSpec;                                          // GDD_CREATURES 3.8, 5.2
// HitShapeSpec (combat/HitShapes.ts)
requireLoS?: boolean;                                                                              // NP-05
spin?: { degPerSec: number; pivot?: [number, number]; from?: number };                                            // NP-09 = SPX-15 + from / pivot
persist?: { /* existing */ targetIcd?: number };                                                   // NP-09
// net/messages.ts
// 'pstatus' payload += removed?: boolean (NP-19); new message 'pstatus_end' { targetId, status, stacksLeft, reason } (NP-20)
```

## Appendix C. Boss and clone definitions (spec skeleton for `src/data/enemies/buyucu_terasi.ts`)

Builders as in `data/enemies.ts` (`boss`, `cone`, `aoe`, `custom`, `bp`, `A_GEN`, `A_KAYKIT`, `A_CHAR`, `KNIGHT_HIDE`; model helpers `GENB`, `GEN`, `MON`, `CHAR`). `custom` abilities are scripted in `src/ai/bosses/buyucu.ts` with the NP-22 helpers. **The live model paths are the existing assets** (`lav_golemi`, `wraith`, `Demon_Lord`); MT-F's follow-up replaces them by changing one path each (`GENB('arkanotron')`, `GENB('gemellus')`, `GENB('degentrius')`).

```ts
// ---- Büyücüler Terası -------------------------------------------------------------------------------
boss({
  id: 'boss_arkanotron', name: 'Bekçi Arkanotron', title: 'Kuralların Muhafız Otomatı',
  model: GENB('lav_golemi') /* MT-F follow-up: GENB('arkanotron') */, scale: 0.85, tint: 0x6a7ad0, emissive: 0x40d0ff,
  role: 'melee', hp: 65, dmg: 2.4, speed: 4.5, radius: 1.6, enrage: 240, arenaR: 30, loot: 'loot_mt_b1', poise: 600,
  anims: A_GEN, resist: { physical: 0.3, arcane: 0.5, lightning: -0.25 }, visual: { emissiveIntensity: 0.4, eyeEmissive: 0x80e8ff },
  energy: { max: 100, start: 100, regen: -2.7, onEmpty: 'arkanotron_refuel' },          // drain; p2 -3.6 via onPhase; NP-06
  onBreak: { windowSec: 4, disable: ['arkanotron_expulsion', 'arkanotron_lunge'], disableSec: 6 },
  enrage2: { at: 0.3, atkSpeed: 0.25, speed: 0.15, roar: 0.9, cdMult: 0.85, anim: 'Enrage' },
  basic: custom('arkanotron_fist', 'Kural Dizisi', 2.4, 0, 0.7, 'Attack', { params: { string: 2, coef0: 1.0, coef1: 1.3, knockback1: 3 } }),   // 2-hit string (3rd hit below 30 %)
  abilities: [
    custom('arkanotron_slam', 'İtici Darbe', 18, 7, 1.2, 'Attack', { sfx: 'boss_cast', params: { hold: [0.3, 0.6], coef: 4.5, knockback: 14, tankBuster: 1 } }),
    custom('arkanotron_spin', 'Dönen Çevirim', 26, 16, 0.95, 'Attack2', { params: { string: 3, hold2: [0.3, 0.6] } }),
    custom('arkanotron_judgment', 'Hüküm Yakalaması', 34, 21, 1.2, 'Attack', { params: { grab: 1, range: 3.5, hold: 1.1 } }),
    custom('arkanotron_lunge', 'Sıçrayıp Ez', 24, 8, 1.05, 'Jump', { params: { leap: 1, radius: 3.4, airtime: 0.55, phase: 2 } }),
    custom('arkanotron_expulsion', 'Arkan Püskürtme', 26, 14, 2.0, 'Attack2', { sfx: 'boss_cast', params: { impact: 0.5 } }),
    custom('arkanotron_shackles', 'Eterik Prangalar', 30, 10, 1.5, 'Cast', { sfx: 'boss_cast', params: { impact: 0.6 } }),
    custom('arkanotron_refuel', 'Yenileme Protokolü', 999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),   // castNow() from BossDef.energy.onEmpty
  ],
  phases: [
    bp('p1', 1.01, ['arkanotron_slam', 'arkanotron_spin', 'arkanotron_judgment', 'arkanotron_expulsion', 'arkanotron_shackles']),
    bp('p2', 0.5, ['arkanotron_slam', 'arkanotron_spin', 'arkanotron_judgment', 'arkanotron_lunge', 'arkanotron_expulsion', 'arkanotron_shackles'], { yell: 'AŞIRI YÜK PROTOKOLÜ.' }),
  ],
  intro: 'KURALLAR BELİRLİ. İHLAL EDEN İMHA EDİLİR.', death: 'Kural... ihlal... edildi...',
  arena: { cx: 120, cz: 40, w: 80, h: 64, homeX: 120, homeZ: 26 },
});

boss({
  id: 'boss_seranel', name: 'Seranel Güneşkamçı', title: "Alacakaranlık Feneri'nin Bekçisi", model: CHAR('Knight'), scale: 1.85, tint: 0x5a7aa8, role: 'melee',
  hp: 70, dmg: 2.4, speed: 6.0, radius: 1.0, enrage: 270, arenaR: 26, loot: 'loot_mt_b2', poise: 500, anims: { ...A_KAYKIT, death: 'Death_B' }, resist: { arcane: 0.5, physical: 0.15 },
  visual: { hide: KNIGHT_HIDE.filter((n) => n !== 'Knight_Helmet' && n !== 'Rectangle_Shield'), attach: [{ url: `${MODELS}gen/weapons/axe_1h_crescent.glb`, bone: 'handslot.r', scale: 1.6 }], eyeEmissive: 0x5fd3e8, runRef: 7 },
  energy: { max: 100, start: 0, regen: 2.6, onFull: 'seranel_wave' },                    // p2 regen 3.0; NP-06
  onBreak: { windowSec: 4, strip: ['hastening_ward'], dropFrontBlock: true, disable: ['seranel_flurry'], disableSec: 5 },
  enrage2: { at: 0.3, atkSpeed: 0.25, speed: 0.2, roar: 0.9, cdMult: 0.85, anim: 'Spellcast_Raise' },
  basic: custom('seranel_slash', 'Rün Dizisi', 2.2, 0, 0.7, '1H_Melee_Attack_Slice_Horizontal', { params: { string: 2, coef0: 1.0, coef1: 1.2 } }),
  abilities: [
    custom('seranel_flurry', 'Rün Fırtınası', 16, 9, 0.7, '1H_Melee_Attack_Slice_Horizontal', { params: { string: 3, hold2: [0.2, 0.5], lunge2: 3, knockback2: 4 } }),
    custom('seranel_dash', 'Atılış', 22, 13, 0.9, 'Running_A', { params: { rush: 1, length: 12, speed: 18, wallPunish: 1.6 } }),
    custom('seranel_leap', 'Sıçrayan Mızrak', 24, 6, 1.1, 'Jump_Full_Long', { params: { leap: 1, radius: 3.0, airtime: 0.55, phase: 2 } }),
    custom('seranel_glaive', 'Rünlü Mızrak', 24, 8, 1.4, 'Throw', { sfx: 'boss_cast', params: { impact: 0.6 } }),
    custom('seranel_wave', 'Sessizlik Dalgası', 999, 9999, 3.0, 'Spellcast_Raise', { sfx: 'boss_roar', castTime: 3.0 }),   // castNow() from BossDef.energy.onFull
    custom('seranel_hastening', 'Hızlandıran Koruma', 32, 16, 1.0, 'Spellcast_Raise', { sfx: 'boss_cast' }),
  ],
  phases: [
    bp('p1', 1.01, ['seranel_flurry', 'seranel_dash', 'seranel_glaive', 'seranel_hastening']),
    bp('p2', 0.5, ['seranel_flurry', 'seranel_dash', 'seranel_leap', 'seranel_glaive', 'seranel_hastening'], { yell: 'Büyülerin burada işe yaramaz!' }),
  ],
  intro: "Fener'e yaklaşan her büyü susar.", death: 'Fener... sönmesin...',
  arena: { cx: 204, cz: 100, w: 72, h: 56, homeX: 204, homeZ: 112 },
});

boss({
  id: 'boss_gemellus', name: 'Gemellus', title: 'Boşluğun Üçüzü',
  model: GEN('wraith') /* MT-F follow-up: GENB('gemellus') */, scale: 1.9, tint: 0x2a0f3a, emissive: 0x7a30ff, role: 'melee',
  hp: 80, dmg: 2.5, speed: 5.2, radius: 1.4, enrage: 300, arenaR: 26, loot: 'loot_mt_b3', poise: 600, anims: A_GEN, resist: { shadow: 0.5, arcane: -0.15, holy: -0.25 }, flying: true, hover: 1.2,
  visual: { opacity: 0.9, eyeEmissive: 0xc080ff, hoverBob: 0.2 },
  onBreak: { windowSec: 4, strip: ['group_absorb'], disable: ['gemellus_lash', 'gemellus_dive'], disableSec: 6 },
  enrage2: { at: 0.3, atkSpeed: 0.25, speed: 0.15, roar: 0.9, cdMult: 0.85, anim: 'Cast' },
  basic: custom('gemellus_touch', 'Çifte Dokunuş', 2.2, 0, 0.7, 'Attack', { params: { string: 2, coef0: 1.0, coef1: 1.1, type: 'shadow' } }),
  abilities: [
    custom('gemellus_triplicate', 'Üçleme', 999, 9999, 1.2, 'Cast', { sfx: 'boss_roar' }),
    custom('gemellus_lash', 'Üçlü Kamçı', 20, 8, 0.7, 'Attack', { params: { string: 3, hold2: [0.2, 0.5], echo: 1.2 } }),
    custom('gemellus_dive', 'Boşluğa Dalış', 26, 12, 1.15, 'Attack2', { params: { leap: 1, radius: 3.2, airtime: 0.6 } }),
    custom('gemellus_link', 'Sinirsel Bağ', 28, 9, 1.2, 'Cast', { sfx: 'boss_cast' }),
    custom('gemellus_grasp', 'Astral Kavrama', 34, 15, 1.5, 'Cast', { castTime: 1.5, sfx: 'boss_cast' }),
    custom('gemellus_sting', 'Kozmik Iğne', 16, 6, 1.4, 'Attack2', { castTime: 1.4, sfx: 'boss_cast' }),
  ],
  phases: [
    bp('p1', 1.01, ['gemellus_lash', 'gemellus_dive', 'gemellus_link', 'gemellus_grasp', 'gemellus_sting'], { ability: 'gemellus_triplicate' }),
    bp('p2', 0.5, ['gemellus_lash', 'gemellus_dive', 'gemellus_link', 'gemellus_grasp', 'gemellus_sting'], { yell: 'Daha çok... daha çok biz!', ability: 'gemellus_triplicate' }),
  ],
  intro: 'Biz çoğuz. Siz azsınız.', death: 'Bir... olduk...',
  arena: { cx: 204, cz: 180, w: 72, h: 56, homeX: 204, homeZ: 168 },
});
// clone: ENEMIES.gemellus_clone = def({ id: 'gemellus_clone', name: 'Gemellus Yankısı', ..., hp: 80 /* mirrored by HealthLink */, dmg: 0.6, speed: 1.8, ccImmune: true, stanceBreakable: false, ai: { summoned: true }, abilities: [custom 'gemellus_clone_sting', custom 'gemellus_clone_echo'] })

boss({
  id: 'boss_degentrius', name: 'Degentrius', title: 'Göksel Yörüngenin Efendisi',
  model: MON('Demon_Lord') /* MT-F follow-up: GENB('degentrius') */, scale: 1.45, tint: 0x2a0f3a, emissive: 0x7a30ff, role: 'melee',
  hp: 105, dmg: 2.7, speed: 0, radius: 1.8, enrage: 420, arenaR: 21, loot: 'loot_mt_b4', poise: 700, anims: A_CHAR, resist: { shadow: 0.5, physical: 0.1, holy: -0.25 }, visual: { emissiveIntensity: 0.5, eyeEmissive: 0xc080ff },
  onBreak: { windowSec: 4, disable: ['degentrius_reach', 'degentrius_waves'], disableSec: 6 },
  enrage2: { at: 0.3, atkSpeed: 0.25, speed: 0, roar: 0.9, cdMult: 0.85, anim: 'Punch' },
  basic: custom('degentrius_blast', 'Parça Süpürmesi', 3.2, 0, 0.85, 'Punch', { params: { string: 2, coef0: 1.6, coef1: 1.8, knockback1: 3 } }),
  abilities: [
    custom('degentrius_fragment', 'Dev Parça', 26, 6, 1.2, 'Weapon', { sfx: 'boss_cast', params: { hold: [0.25, 0.6], impact: 0.5 } }),
    custom('degentrius_reach', 'Boşluk Eli', 38, 18, 1.2, 'Wave', { params: { grab: 1, range: 12, pull: 6, hold: 1.5 } }),
    custom('degentrius_waves', 'Üç Dalga', 30, 14, 0.9, 'Wave', { params: { bands: 3 } }),
    custom('degentrius_entropy', 'Yutan Entropi', 42, 12, 1.6, 'Wave', { castTime: 1.6, sfx: 'boss_cast' }),
    custom('degentrius_torrent', 'Boşluk Seli', 46, 22, 2.5, 'Wave', { sfx: 'boss_roar' }),
    custom('degentrius_essence', 'Kararsız Boşluk Özü', 52, 36, 2.0, 'Wave', { sfx: 'boss_cast' }),
    custom('degentrius_nullbomb', 'Boşluk Bombası', 48, 30, 1.2, 'Wave', { sfx: 'boss_cast' }),
  ],
  phases: [
    bp('p1', 1.01, ['degentrius_fragment', 'degentrius_reach', 'degentrius_waves', 'degentrius_entropy', 'degentrius_torrent', 'degentrius_essence', 'degentrius_nullbomb']),
    bp('p2', 0.6, ['degentrius_fragment', 'degentrius_reach', 'degentrius_waves', 'degentrius_entropy', 'degentrius_torrent', 'degentrius_essence', 'degentrius_nullbomb'], { yell: 'Mercekler hizalanıyor!' }),
    bp('p3', 0.3, ['degentrius_fragment', 'degentrius_reach', 'degentrius_waves', 'degentrius_entropy', 'degentrius_torrent', 'degentrius_essence', 'degentrius_nullbomb'], { yell: 'Gökler yırtılsın!' }),
  ],
  intro: 'Yörünge tamamlanıyor. Siz eksik parçasınız.', death: 'Yörünge... kırıldı...',
  arena: { cx: 140, cz: 252, w: 72, h: 56, homeX: 140, homeZ: 252 },
});
```

Loot tables (`src/data/loot.ts`, NP-23): one guaranteed item per player, personal; `uniques` are the named items of 5.6; `uniqueChance` per player per kill with bad-luck protection.

```ts
loot_mt_b1: { focus: ['gloves', 'belt', 'wand', 'tome', 'ring'], setChance: 0.15, extraChance: 0.30, uniques: ['mt_gloves_kural', 'mt_belt_shackle', 'mt_ring_orb'], uniqueChance: 0.30, badLuck: 0.10 },
loot_mt_b2: { focus: ['amulet', 'shield', 'sword1h', 'dagger', 'shoulders'], setChance: 0.15, extraChance: 0.30, uniques: ['leg_cynosure_pendant', 'mt_shield_dome', 'mt_sword_glaive'], uniqueChance: 0.30, badLuck: 0.10 },
loot_mt_b3: { focus: ['staff', 'wand', 'tome', 'helm', 'legs'], setChance: 0.2, extraChance: 0.35, uniques: ['mt_helm_triplicate', 'mt_legs_neural', 'mt_staff_echo'], uniqueChance: 0.33, badLuck: 0.10 },
loot_mt_b4: { focus: ['chest', 'helm', 'staff', 'sword1h', 'ring', 'amulet'], setChance: 0.25, extraItems: 1, extraChance: 0.45, uniques: ['leg_orrery_staff', 'mt_chest_entropy', 'mt_ring_splinter'], uniqueChance: 0.40, badLuck: 0.10 },
```

---

## Appendix D. Source and coverage notes

- WoW facts (bosses, trash, layout, timer 34:00 / 33:00, forces quirks, affix opinions) come from `docs/ref/dungeons/tww-midnight.md`, which lists its sources and marks conflicts. Where the sources conflict (Seranel's mark count, Degentrius' beam count, timer), this doc picks one value and says so in 5.2, 5.4 and section 1.
- Not in the sources and therefore ours: the 64 x 70 layout and all heights, all pack compositions and forces, enemy numbers, the death-run shortcuts (both), the courtyard energy pylons' numbers, the Sunwell balcony as a dead-end vista, loot slots and all named loot items, **the Elden Ring move layer of every boss and trash type**, **the 5 m beam-free hub and the 14 deg/s torrent sweep rate (the sources only say a beam splits the arena in half and that there are four soak sectors)**, the orb speeds and volley times (4.5 / 5.0 m/s, 0, 4 and 8 s), posture values.
- Engine facts were read from `src/types/dungeons.ts`, `src/data/dungeons/kit.ts`, `golge_tapinagi.ts`, `src/ai/bosses/kit.ts`, `golge.ts`, `kemik.ts`, `src/data/enemies.ts`, `src/types/enemies.ts`, `src/data/mythicAffixes.ts`, `src/systems/MythicPlus.ts`, `src/world/DungeonBuilder.ts` (style tables), `src/world/Zones.ts`, `src/combat/healing.ts` (`dispelUpTo`: dispels allies only), `src/net/messages.ts` (`pstatus`), `docs/CORE_MECHANICS.md` (6, 13, 15, 16), `docs/ENGINE_VERTICALITY.md`, `docs/GDD_CREATURES.md`, `docs/GDD_CONTENT.md`, `docs/MAP_UI.md`, and the primitive tables of the sibling dungeon docs.
