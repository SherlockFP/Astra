# Taşkasa (`taskasa`): The Stonevault in EFSUN ONLINE

Mythic+ Season 1 pool, dungeon 7 of 8. Level 60 endgame. Design doc for the Haiku coders (implementation-ready), written by the Sonnet dungeon designer on 2026-10-13 and **revised in place the same day** after the critic review (8 issues, §9) and the binding user requirements: verticality (CORE_MECHANICS §13), at least 3 bosses with an Elden Ring layer (§5), 10-14 trash types with telegraphed attacks and posture elites (§4), per-room set dressing (§3.7) and named loot per boss (§5, CORE §15).
Non-commercial hobby project: the design deliberately stays as close to the WoW dungeon as our engine allows.

Sources used: `docs/ref/dungeons/tww-midnight.md` (Stonevault part), our code (`src/types/dungeons.ts`, `src/data/dungeons/kit.ts`, `kemik_mahzeni.ts`, `kizil_dokumhane.ts`, `golge_tapinagi.ts`, `src/ai/bosses/kit.ts`, `kemik.ts`, `golge.ts`, `BossController.ts`, `src/data/enemies.ts`, `src/dev/contentCheck.ts`), `docs/GDD_CONTENT.md` (§0, §4.4, §5), `docs/CORE_MECHANICS.md` §6 (pool rule, scaling), §13 (verticality), §15 (loot), §16 (creatures), `docs/MAP_UI.md` §3 and my own knowledge of the dungeon's look.

## Conventions used in this file

- **Tags.** `EXISTS` = built from systems that are in the repo today. `NEW` = needs code that does not exist; every NEW item points to a shared primitive `SP-xx` (§8.2) or to a Taşkasa-only item.
- **Coordinates** are GDD tile coordinates: continuous tile `c` maps to world `(c + 0.5) * 4` m. A room with `x, w` spans continuous `x - 0.5 .. x + w - 0.5`. World centre of a room = `4 * (x + w/2), 4 * (z + h/2)`. `n` = -Z (up on the map), `s` = +Z, `e` = +X, `w` = -X. Facing 0 = looks to +Z (south), 180 = north.
- **Numbers.** `hpMult` / `dmgMult` / `coef` are multipliers on the level-60 baseline (`monsterHP(60) = 2246`, `monsterDmg(60) = 284`, GDD_CONTENT §0.3). Party scaling `1 + 0.7 (n - 1)` and the **CORE_MECHANICS §6 key curve** (HP and damage x`1.08^(L-1)` up to +10, then x1.10 per level above 10) apply on top; §6 of this file says which source governs and why the boss hpMults changed.
- **Heights.** `floorY` and `ceiling` are metres; `ceiling` is the clearance above the local floor. Slope strips, terraces and galleries are the SP-22 primitives of §8.2; every height number has a **flat fallback** (ignore the keys, build at y 0) so nothing is blocked on the engine work.
- **Windups.** `windup >= clamp(0.45 + 0.25 x coef, 0.45, 1.2)` seconds for every non-cast damaging ability (CORE §16, §4); casts use their cast time.
- **Names.** Turkish in game; English prose in this file. Ids are ASCII (`tk_` for trash, `boss_` for bosses, `loot_tk_` for loot, `tk_` for new props).
- Every layout number in §3 and §4 was checked with a script (no overlaps, every door tile pair inside its two rooms and within 0.45 m in height, every room reachable, every pack inside its room with a 1 tile margin, forces sums, **pack spacing of at least 5 tiles between separate packs, patrol paths at least 4 tiles from every other pack, collide props clear of packs and patrols**). Re-run `node tools/content-check.mjs taskasa` after implementing (see §8).

---

## 1. Identity

| Field | Value |
|---|---|
| id | `taskasa` |
| Name / short name | **Taşkasa** / Kasa |
| WoW model | **The Stonevault** (The War Within, M+ Season 1) |
| Level range / entry | `levelRange: [56, 60]`, world entrance `minLevel: 56`. Modes: Kahramanlık (60), Mitik 0, Mitik+. **Normal and Heroic are not offered for the 8 season dungeons** (shared decision, see SP-18); the four levelling dungeons keep Normal. |
| Grid | **72 x 84 tiles** (288 x 336 m). 17 rooms. Occupied area about 49 % (2960 of 6048 tiles). **Vertical:** 10 flat floor levels from +2.4 m (start terrace, west forge) to -3.6 m (Eirich), 8 slope strips, a 3 m chasm, ceilings 5-30 m, decorative galleries in 9 rooms (§3.2). |
| M+ timer | **30:00 (1800 s)**. +2 at **24:00** (1440 s), +3 at **18:00** (1080 s). 5 players. |
| Enemy forces | **required 400**. Available **498** (124.5 %), non-optional **428** (107 %), optional rooms 70. |
| Content | 4 boss encounters (5 bodies: the Machinists are one paired encounter; the WoW original has 4), 35 packs (31 + 4 optional), 125 enemies (105 non-optional), 12 trash defs + 1 summon + 5 boss defs, 12 named loot items (3 per boss), every elite and boss with a posture bar. |
| Music | `dungeon_fire` for now, request a new track `dungeon_taskasa` (see §2.9). |
| Entrance | Kadim Diyar, region **Kor Yarığı** (§7). |

### 1.0 Design pillars

1. **Kick-check trash.** Six must-kick casters, a curse/silence/fear dispel set and three frontals decide the pulls; elites punish greedy pulls (two Forge Loaders, three Titan packs).
2. **The hub.** One huge 24 m high hall with a 3 m deep lava chasm crossed by a plus-shaped bridge, a rail-ring patrol and two flanks of four packs each, and two wings: the route is a choice (flank order, wing order, Route B).
3. **Tank-swap and dispel bosses.** Seda's echo (dispel reward), Dorlita's Hammer on every defensive, Eirich's mark swap.
4. **Mine carts and the Usta Örsü.** Two set pieces that make the dungeon feel like the Stonevault, not like a reskinned crypt.
5. **A showpiece finale.** Eirich: rifts, cleanse order, shrinking pools, two kick-check intermissions and a rotating void finale, at the bottom of a 32 m descent.
6. **A vault you walk down into.** Six height levels, a grand staircase, galleries and chandeliers in every hall, mine carts as lifts: relief 6.0 m, ceilings up to 30 m.
7. **Elden Ring on top of the WoW kit.** Readable windups, delayed third hits, 2-3 hit strings, jumps and grabs, posture bars on every elite and boss.

### 1.1 Fantasy and lore

The Taşdoğanlar (the "stone-born", our Earthen) carved Taşkasa into the roots of the mountain as the vault of their race. Their dying people pinned their last hope on the **Uyandırma Çarkı** (Awakening Wheel), a machine that would breathe new life into their stone. The **Çark Sözcüleri** (Machine Speakers) kept the wheel running for generations. It never worked. The unfinished rite cracked the stone, a **Çatlak** (rift) opened in the deepest hall, and the Boşluk (the same void that rots Gölge Tapınağı) began to whisper through it. The vault now runs on without its makers: guard automata that cannot stop, forgers who cannot stop working, crystals that grow where the stone broke, and at the bottom the deposed High Speaker, who chose to listen.

Hook into our world: the **Kadim Anahtar Taşları** (keystones) are chiselled out of Taşkasa's walls and the **Kehanet Taşı** (Font of Power) is one of the vault's own gear-wells. Putting a key into the stone "wakes" the vault, which is why the whole dungeon only comes alive when the key is inserted.

**`lore` string (paste into `DungeonDef.lore`):**
> Kadim Zindanların en derin kasası Taşkasa'dır. Taşdoğanlar ölmekte olan soylarını Uyandırma Çarkı ile diriltmek istediler; çark çalışmadı, yarım kalan ayin taşın içinde bir çatlak açtı ve Boşluk oradan fısıldamaya başladı. Otomat Seda hâlâ kapıyı tutuyor, Kristal Golem Skarmorak çatlağın kristalleriyle büyüyor, Usta Makinistler Brokk ve Dorlita örsleri susturmadan çalıştırıyor. En derinde Başsözcü Eirich Boşluğu dinliyor. Kadim Anahtar Taşları bu duvarlardan yontuldu; anahtarı takan kasanın kilidini açar.

**Loading screen image (one line):** a lava-lit Earthen forge hall at night-shift orange, thin lava falls down both edges and two wide pours flanking a colossal rune-marked gate with a tall gold glyph column, a circular stone dais with low rune-carved pillar blocks in front, embers and steam drifting, a tiny KayKit knight silhouette on the dais (`DungeonDef.loadingImage: '/assets/loading/taskasa.png'`, 1280x720, rendered by `tools/blender/loading/render_taskasa.py` from the NEW props, see TK-F).

### 1.2 Recommended route (summary; full pull list in §6.2)

`Kasa Eşiği` (start terrace +2.4 m, Kehanet Taşı) -> Büyük Merdiven -> `Muhafız Yaklaşımı` (5 packs) -> grand gate -> `Merkezi İşleme` hub (9 packs: the patrol, then the west and east flanks) -> `Otomat Geçidi` -> **Boss 1 Otomat Seda** -> **East wing** `Pota` (Skarmorak at -2.4 m, maden arabası climbs back to the hub) -> **West wing** `Dökümhane` (Usta Örsü buff, Makinistler at +2.4 m, cart drops back) -> hub -> through Seda's room (door now open) -> `Titan Tünelleri` (5 packs, the Büyük İniş) -> **Boss 4 Eirich** at -3.6 m.

Do the **west wing last**: the Usta Örsü buff lasts 10 minutes and then covers the Titan corridor and Eirich. Route B (the Madenci Ambarı detour with the Eski Raylar skip) is described in §3.5 and §6.2.

---

## 2. Art direction (as close as possible to the WoW dungeon)

Design rule taken from the WoW team (Nuthals, 2024): boss effects must stand out from the floor texture. Our floor is therefore kept **dark and low-saturation** (value under 35 %) and every telegraph stays bright. Fire and gold effects never sit on a floor that is orange.

### 2.1 Palette (approx. from the loading screen, 10 swatches)

| # | Name (TR) | Hex | Use |
|---|---|---|---|
| 1 | Kavrulmuş Umber | `#3A1F15` | deep wall shadow, fog colour base |
| 2 | Pas Kahvesi | `#6B3A24` | carved stone faces (wall tint source) |
| 3 | Erimiş Turuncu | `#FF8C1A` | lava falls, lava pit, forge glow |
| 4 | Rün Altını | `#FFD54A` | glyph inlay, lava cores, torch colour, main accent |
| 5 | Kor Kırmızısı | `#A8301C` | glyph borders, vent glow, danger accents |
| 6 | Kül Grisi | `#5B5352` | smoke, steam, floor haze |
| 7 | Boşluk Moru | `#3C1D5E` (core glow `#7A3CFF`) | Void rifts, Eirich, void-bound enemies |
| 8 | Skardyn Camgöbeği | `#3FE0C8` (dark `#1F6E64`) | crystal growth (inferred, not visible in the loading screen) |
| 9 | Demir Çeliği | `#7A7F88` (highlight `#A9AEB8`) | scrap plating, anvils, machine housings |
| 10 | Beyaz Sıcak | `#FFF2C8` | white-hot cores of fire / beam effects |

`DungeonTheme.palette: [0x3a1f15, 0x6b3a24, 0xff8c1a, 0xffd54a, 0xa8301c, 0x5b5352, 0x3c1d5e, 0x3fe0c8]`, `tint: 0xd8b49a`.

How this differs from Kızıl Dökümhane (also a forge): Kızıl is red-orange, open lava, goblin slag. Taşkasa is **carved rust-brown stone with gold glyph light**, cavern-scale halls, steam, machines, and teal/violet accents in the late rooms. The gold glyph light and the angular knotwork are the identity.

### 2.2 Materials and textures

- Base: KayKit `dungeon_texture.png` tinted per style (`theme.tint 0xd8b49a`), vertex-snap PSX look unchanged, NEAREST sampling, fog on.
- **Wall style `earthen`** (NEW, SP-12): `wall` 56, `wall_pillar` 12, `wall_arched` 10, `wall_cracked` 6, `wall_window_closed` 6, `wall_scaffold` 4, `wall_archedwindow_open` 4, `wall_broken` 2. Tint `0xc09878`. Banners `brown`, `yellow`, `red`. Decor set: anvils, barrels, `ks('metal-panel*')` plates, `ks('resource-stone')`.
- **Floor style `earthen`** (NEW, SP-12): `floor_tile_large`, tint `0x7a5a48`, checker 0.82, special `floor_tile_small_broken_A/B`. A variant `earthen_dark` (tint `0x5a4034`) for corridors and boss rooms.
- **Fallback until SP-12 exists** (so coding is not blocked): floor `stone_dark`/`tiles`, wall `forge`; boss rooms `tiles` + `temple`; Skarmorak wing `lava_rock` + `cave`.
- **Carved knotwork** is texture, not geometry: a 64x64 atlas for the NEW Blender props (16x16 tiles: knot panel A/B, gold rune strip, gear teeth, riveted iron plate, rust streaks, teal crystal facets, void cracks). Gold rune strips are emissive (emissive texture + strength 2.0) so bloom picks them up.
- Lava = unlit emissive planes, UV scroll 0.15 u/s, no real light; only the hub pit and the two boss-door lava pours carry a pooled light.

### 2.3 Lighting rig

`DungeonTheme` (paste):

```ts
const THEME: DungeonTheme = {
  fogColor: 0x2a150d, fogNear: 12, fogFar: 56,
  ambient: 0x5a3a2c, ambientIntensity: 0.42,
  hemiSky: 0xc88a50, hemiGround: 0x1a0c08,     // warm "light from the lava above"
  torchColor: 0xffa43c, bloomStrength: 0.42, music: 'dungeon_fire',
  palette: [0x3a1f15, 0x6b3a24, 0xff8c1a, 0xffd54a, 0xa8301c, 0x5b5352, 0x3c1d5e, 0x3fe0c8], tint: 0xd8b49a,
};
```

Real lights are pooled (`MAX_REAL_LIGHTS = 8`, nearest torches win, `priority` 1-2 wins). Design intensities below are `PropPlacement.light` values (x22 internally):

| Light | Colour | Intensity / distance | Where | Priority |
|---|---|---|---|---|
| Gold wall torch | `0xffd54a` | 2.2 / 11 | all rooms (`Props.torches(..., 0xffd54a)`) | 0 |
| Lava glow | `0xff8c1a` | 1.8 / 16 | hub pit, two pours at the hub gate, forge hall ladles, vents of the Machinists' room | 1 |
| Ember red | `0xa8301c` | 1.2 / 8 | exhaust vents, crucibles | 0 |
| Crystal teal | `0x3fe0c8` | 1.5 / 9 | east wing, Skarmorak's room | 0 |
| Void violet | `0x7a3cff` | 2.0 / 14 | Eirich's rifts, Titan door leak | 2 |
| Gold glyph columns | `0xffd54a` | emissive only, no light | Titan Tünelleri, E.D.N.A.'s room | - |

Per-room fog overrides (`RoomDef.fog`): hub `0x2e170e` near 16 far 84 (cavern scale); E.D.N.A. and the Machinists `0x2a150d` near 14 far 70; wings with steam `0x3a2a24` near 8 far 44; Skarmorak wing `0x1a2420` near 10 far 50 (teal-dark); Titan Tünelleri `0x1e100a` near 12 far 60; Eirich's hall `0x1c0e2e` near 12 far 64.

### 2.4 Sky and backdrop

Underground, no time of day. With SP-22 every room has a real `ceiling` (5 m service tunnels, 10 m Titan tunnels, 14-20 m halls, 24 m hub, 30 m Fısıltı Salonu): walls rise to it, a dark rock ceiling plane with instanced stalactites closes it (`ceilingDark: true` also darkens the tints) and the camera zoom limit follows it. Without SP-22 (flat mode) there is no ceiling mesh, the scene background is the fog colour so the roof reads as black rock, and props and cards may rise above the 4 m walls.
- **Light shafts** (NEW prop `tk_light_shaft`, additive translucent cone, dusty gold `0xffd54a`, alpha 0.18): in the Muhafız Yaklaşımı (36, 68), two over the hub flanks (22, 52) and (49, 52) and a teal one in the Kristal Kazanı (64.5, 31). They are the "openings in the cavern roof" of the Ringing Deeps.
- **Hub backdrop:** a ring of far cavern-wall silhouettes with lava glow (NEW `tk_cavern_ring`, flat emissive cards, 140 m diameter, y 0..20) so the 144 m hub does not end in black.
- **Eirich's hall:** the 30 m ceiling dissolves into a slowly turning violet void card (emissive plane 120 x 120 m at world y +26.4, `t_swirl` palette `#3C1D5E / #7A3CFF`), plus the broken second Awakening Wheel hanging in it on ten chains (y +14).

### 2.5 Landmark set pieces, in run order

1. **Kasa Eşiği** (start, +2.4 m): the Kehanet Taşı as a gear-well in a rune circle, stairs up behind (the way back), two Taşdoğan sentinel statues, two thin lava falls on the side walls, brazier pair, a stone parapet along the north edge and **two 9 m sentinels at the head of the Büyük Merdiven**.
2. **Muhafız Yaklaşımı** (0 m, ceiling 16): the **Büyük Merdiven** (28 m wide, 20 m long, a carved riser frieze) climbing back to the start terrace, a long colonnade of carved pillars, upper galleries with 8 Titan sentinels, long banners, three hanging chandeliers, scrap heaps, parked loaders, a mine-rail stub with an ore cart, the dusty light shaft, and at the far end the **grand rune gate** (`tk_rune_gate_grand`) flanked by two wide lava pours: the loading-screen view.
3. **Merkezi İşleme** (hub, 0 m, ceiling 24): a round **lava chasm** (3 m deep) with a plus-shaped stone bridge and a stepped central dais, the giant **Uyandırma Çarkı** turning above it on chains, the ring galleries (+7.2 m) with Titan statues and chandeliers, eight machine housings with glowing glyph panels, a rail ring that the patrol walks, ore carts, steam vents, lava falls in the corners, flank halls under the roof openings.
4. **Otomat Geçidi -> Savunma Çekirdeği** (Seda, +1.2 m, ceiling 18): a ramp up to a circular platform with concentric gold rune rings and low rune-block pillars (the foreground of the loading screen), a lens pedestal in the middle with a huge hanging lens chandelier, a ring gallery (+8.4 m) of Titan statues, spike emitters along the walls.
5. **Pota Kanadı** (east wing, -1.2 m, "Toprak Kanı Potası"): giant crucibles of molten earth-blood, teal Skardyn crystals growing thicker toward **Kristal Kazanı** (Skarmorak's room, -2.4 m, the lowest boss basin), the first violet veins appear in the crystals; the wing descends from the hub in two ramps.
6. **Dökümhane Kanadı** (west wing, +1.2 m, "Şarkı Söyleyen Dökümhane"): rows of forges, hanging lava ladles, **Usta Örsü** (the great anvil with a glowing ingot, on a +1.65 m terrace), a gallery of forge-master statues, then up the Örs Geçidi ramp to the **Makinistler Salonu** (+2.4 m, ceiling 20): a square forge floor, four corner exhaust vents, a central scrap-cube pedestal, two scrap-metal blocks, a high gallery (+10.4 m) with chain winches.
7. **Titan Tünelleri** (ceiling 10): the **Büyük İniş**, a dark 32 m descent from +1.2 m to -3.6 m lit only by gold glyph columns, carved Titan reliefs, Honor Guard banners, Titan guardian galleries, the violet leak under the last door.
8. **Fısıltı Salonu** (Eirich, -3.6 m, ceiling 30): a huge circular hall, a cracked floor with violet fracture rings, two glowing void rifts at the edges, a two-step dais with the exit portal, void-corrupted statues on the galleries, the dead second wheel hanging in a violet void.

### 2.6 Prop list: existing assets and NEW Blender props

Helpers from `src/data/dungeons/kit.ts`: `dg()` KayKit dungeon, `gp()` generated props, `kn()/ks()/kc()/kg()` Kenney, `ip()` itch, `hw()` halloween.

| Purpose | Asset (existing) | Tint / scale / note |
|---|---|---|
| Wall torches | `dg('torch_mounted')` | light `0xffd54a` 2.2 / 11 |
| Carved pillars (colonnade) | `dg('pillar_decorated')`, `dg('pillar')` | tint `0xb08868`, scale 1.15 |
| Kehanet Taşı | `gp('font_of_power')` | as in Kemik, light gold |
| Braziers | `gp('brazier')` | scale 1.6, collide |
| Sentinel statues | `gp('statue_hooded')` | tint `0x8a7a68`, scale 1.3 |
| Forges | `gp('forge')` | 2.88 x 4.27 x 1.75 m, along the west hall wall |
| Anvils (decor) | `gp('anvil')`, `ks('workbench-anvil')`, `ks('workbench-grind')` | scale 1.6 / 1.0 |
| Crucibles | `gp('cauldron')` | scale 2.2, emissive `0xff8c1a`, tag `crucible` |
| Crystals | `gp('crystal_blue')`, `gp('crystal_purple')` | tint `0x3fe0c8` / `0x7a3cff`, emissive |
| Cavern rock | `gp('rock_cliff')`, `gp('rock_large')`, `kn('rock_tallA..J')`, `kn('stone_tallA..J')` | stalagmites, tint `0x6b3a24` |
| Titan reliefs / relics | `kn('statue_ring')`, `kn('statue_obelisk')`, `kn('statue_column')`, `kn('statue_head')` | tint `0x9a7a60` |
| Metal plating | `ks('metal-panel*')`, `ks('structure-metal-*')`, `ks('barrel')`, `ks('resource-stone-large')`, `ks('tool-pickaxe')`, `ks('tool-hammer')` | machine housings, stashes |
| Floor vents / grates | `dg('floor_tile_big_grate')`, `dg('floor_tile_big_spikes')` | `y 0.03`, tag `vent`; spikes along E.D.N.A.'s walls |
| Hanging chains | `gp('chains_hanging')` | `y 4` |
| Crates, barrels | `dg('crates_stacked')`, `dg('barrel_large')`, `dg('keg')`, `gp('sacks')` | miner stashes |
| Banners (Earthen standards) | `dg('banner_patternA_brown')`, `banner_triple_brown`, `banner_shield_yellow` | |
| Wall trophies | `dg('sword_shield_gold')` | at `MOUNT_Y` |
| Ruins and debris | `dg('rubble_large')`, `ip('psx-dungeon','pillar_collapsed_01')`, `ip('psx-dungeon','debris')`, `ip('psx-dungeon','block_arch')`, `ip('psx-dungeon','stairs_ultrawide')` | goblinatron pack is **CC BY 4.0, credit it** (`docs/assets/credits-itch.md`) |
| Chests | `gp('chest_wood')`, `gp('chest_gold')`, `gp('chest_epic')` (M+ end chest) | |
| Shrines | `kg('altar-stone')` x3 + `gp('crystal_blue/purple')` + 4 candles | recipe `shrine()` from `kemik_mahzeni.ts` |

**NEW props to build in Blender (30 ids)** (`tools/blender/props/props_taskasa.py`, registered in `build_props.py` and `manifest.json`, output `public/assets/models/gen/props/`, doc regenerated with `make_doc.mjs`). All PSX: 64x64 atlas, NEAREST, vertex AO, emissive strips.

| Name | Size W x H x D (m) | One-line look |
|---|---|---|
| `tk_rune_gate_grand` | 8 x 9 x 1.6 | angular Earthen gate frame, tall gold glyph column in the lintel, two lava channels down the jambs. Door frames for the hub gate, the Seda door and the Eirich door (scales 1.0 / 0.7 / 0.9). |
| `tk_lava_fall` | 4 x 12 x 0.6 | wall-hugging lava cascade ribbon, scrolling emissive bands, glowing pool at the base. Emissive only. |
| `tk_titan_pillar` | 1.6 x 7 x 1.6 | carved pillar with vertical gold glyph strips. 3 variants: intact, cracked, void-corrupted (violet veins). |
| `tk_rune_block` | 1.4 x 1.2 x 1.4 | low pillar block with glowing rune strips (loading-screen foreground). |
| `tk_machine_housing` | 3 x 4.5 x 2.5 | boxy machine cabinet, gear windows, pipes, vents, glyph panel. |
| `tk_awakening_wheel` | 9 x 9 x 1.2 | nested gear rings with gold rune teeth and a crystal core. Nodes `ring_outer`, `ring_inner` (spin opposite ways, SP-16). Variants: intact, broken (violet, for Eirich's hall). |
| `tk_mine_cart` | 1.6 x 1.2 x 1.2 | rusty ore cart with gold ore, four iron wheels. |
| `tk_rail_straight`, `tk_rail_curve` | 4 x 0.25 x 1.2 | mine rail pieces, one tile long. |
| `tk_cart_station` | 3 x 1.6 x 2 | cart dock with a brake lever and a rail loop. Interactable anchor of the transit cart (SP-13). |
| `tk_scrap_pile` | 1.6 x 1.0 x 1.6 | heap of brass scrap with glinting eyes (dormant spot of the Hurda swarm, tag `wake`). |
| `tk_scrap_block` | 3 x 3 x 3 | cube of compressed scrap with rusty plating (Brokk's cover). |
| `tk_scrap_cube` | 2 x 2 x 2 | glowing-edged scrap cube, the projectile of Hurda Şarkısı (also a mech entity, SP-15). |
| `tk_exhaust_vent` | 4 x 3 x 4 | corner vent: floor grate + short chimney. Nodes `flame` (hidden when off). |
| `tk_volatile_spike` | 1.4 x 2 x 1.4 | stone spike cluster with a glowing gold tip (E.D.N.A.). |
| `tk_skardyn_crystal` | 2.4 x 3 x 2.4 (large) / 1.2 x 1.6 x 1.2 (shard) | teal crystal cluster, violet void veins at the core. |
| `tk_void_rift` | 6 x 6 x 1 | vertical violet-black fissure with sparking edge, hum. Frame prop under the `proc_rift`-style entity. |
| `tk_forge_anvil_great` | 2.5 x 1.6 x 1.4 | oversized anvil with a glowing ingot, tag `usta_orsu`. |
| `tk_ladle_hanging` | 1.4 x 3 x 1.4 | lava ladle on a chain, dripping glow. |
| `tk_light_shaft` | 8 x 14 x 8 | translucent additive cone, dusty gold. |
| `tk_titan_relief` | 4 x 5 x 0.5 | wall relief: stern Titan face in knotwork. |
| `tk_edna_lens_pedestal` | 3 x 1.2 x 3 | stepped round pedestal with a gold lens ring. |
| `tk_cavern_ring` | 140 diameter | far cavern silhouettes, emissive lava glow. |
| `tk_chandelier_forge` | 4 x 3 x 4 (scale up to 2.0) | hanging iron ring with six burning bowls and a gold lens ring, emissive flames (no light), hangs from its top pivot. |
| `tk_gallery_rail` | 4 x 1.1 x 0.3 | one tile of stone balustrade with gold rune inlay, instanced by the hundred. |
| `tk_bridge_stone` | 4 x 0.5 x 8 | one tile of a stone bridge deck, gold rune inlay, low parapet stub variant for the ends. |
| `tk_stalactite` | 1.2 x 4 x 1.2 | ceiling stalactite, 3 variants: rust rock, teal crystal, void crystal. Instanced, no light. |
| `tk_stair_grand_face` | 8 x 3 x 0.8 | carved riser frieze of the Büyük Merdiven and the Büyük İniş (Titan procession in knotwork). |
| `tk_titan_statue` | 2.2 x 9 x 2.2 | colossal standing Taşdoğan guardian, 3 variants: intact, crystal-grown (teal), void-corrupted (violet veins). |
| `tk_banner_long` | 1.6 x 7 x 0.1 | long hanging banner with gold glyph stripe, intact and torn variants. |

**Boss models** (NEW, `tools/blender/bosses/boss_*.py` + `gen_bosses.py`, clips `Idle, Walk, Run, Attack, Attack2, Cast, Hit, Death` like the other `gen/bosses`; every boss has a **fallback** from existing assets so coding is not blocked):

| Boss | NEW model | Fallback now |
|---|---|---|
| Otomat Seda | `gen/bosses/otomat_seda.glb`: 5 m squat automaton, four stone-and-iron legs, rotating turret with a gold lens eye, back-mounted spike launchers | `gen/creatures/golem_stone` scale 1.7, tint `0x8a7a68`, emissive `0xffd54a` x0.5 |
| Kristal Golem Skarmorak | `gen/bosses/skarmorak.glb`: stone golem overgrown with teal crystals, violet veins | `gen/creatures/golem_stone` scale 1.8, tint `0x5a9a98`, emissive `0x3fe0c8` x0.6 |
| Sözcü Brokk | none | `characters/Mage` scale 1.1, tint `0xc8a070`, `2H_Staff`, hat hidden, back gear attach optional |
| Sözcü Dorlita | `gen/bosses/dorlita_mech.glb`: Earthen mech suit with a piloted cockpit, hammer arm, lava cannon arm | `monsters/Giant` scale 1.5, tint `0x9a7a60`, emissive `0xff7a10` x0.4 |
| Başsözcü Eirich | `gen/bosses/eirich.glb`: stone-giant torso cracked open by void light, three floating shards, crown of crystal | `monsters/Giant` scale 1.9, tint `0x6a5a7a`, emissive `0x7a3cff` x0.6 |

### 2.7 Enemy models (KayKit rig + tint, details in §4)

Earthen stone-born are stocky: KayKit `Knight` (Honor Guard), `Mage` (Speakers), `Rogue_Hooded` (Menders), Quaternius `Goblin` scaled 0.85 and stone-tinted (Stoneshapers), `Giant` (Rock Smashers). Automata: `gen/creatures/golem_stone` (Loaders, tinted iron, gold eyes). Void-bound: `monsters/Ghost` (Voidsoul), `monsters/Demon` (Despoiler), `itch/creatures/centipede` (Howler), KayKit `Mage` tinted violet (Invader). Swarm: `monsters/Spider` tinted brass (Hurda). All void-bound units glow violet `0x7a3cff`, all Earthen glow gold `0xffd54a` in the eyes.

### 2.8 VFX palette

| Effect | VfxId / colour |
|---|---|
| Earth hits, stomps | `ground_slam`, `hit_spark` with gold sparks `0xffd54a` |
| Fire / lava | `fire_burst`, `fire_ground`, `volcanic_plume`, white-hot core `0xfff2c8` |
| Void | `shadow_burst`, `shadow_ground`, `curse_loop`, `ambient_shadow_wisps` in Eirich's hall |
| Crystals | `arcane_burst` with colour override `0x3fe0c8` |
| Steam, dust | `ambient_dust` colour `0xbfb8b0` over grates |
| Embers | `ambient_embers` in the hub and the forge hall |
| Telegraphs | standard kinds (`danger` red, `soak` yellow, `safe` green); never recolour them |

### 2.9 Music and ambience

- Dungeon music now: `dungeon_fire` (`dungeon_heated_lands.mp3`). **Request track `dungeon_taskasa`** (add to `MUSIC_IDS`): about 70 bpm industrial drone, a low anvil strike on beat 1, slow male choir pad, steam hiss. Bosses use `boss`. Eirich: layer whispering, reversed choir; tempo +15 % in phase 3.
- Ambience loop: distant lava roar, chain clinks, far forge hammering, gear grind in the hub (louder near the pit). SFX map (all existing ids): `forge_strike`, `forge_heartbeat` (Eirich's Void Corruption), `ground_slam`, `boss_cast`, `boss_roar`, `shield_bash` (Honor Guard stampede), `fire_cast`.


---

## 3. Layout (tile grid)

Grid **72 x 84** (`grid: { w: 72, h: 84 }`). Hub-and-spoke like the Stonevault: a south-to-north spine (start -> approach -> hub -> Seda -> Titan tunnels -> Eirich) with the two wings as side branches off the hub. **The dungeon is vertical** (CORE_MECHANICS §13, binding): six walkable height levels from +2.4 m (the start terrace and the west forge) down to -3.6 m (Eirich's hall), real per-room ceilings from 7 m (service tunnels) to 30 m (Fısıltı Salonu), a 3 m deep chasm under the hub bridges, two grand staircases/descents and decorative upper galleries in every hall. All of it needs the new shared primitive **SP-22 Heightfield and ceiling** (§8.2). Until SP-22 lands the dungeon is built flat (every `floorY = 0`, default ceiling, galleries and chandeliers still placed as props at their absolute y): all layout, pack and boss numbers in this file are identical in both modes, only the heights are skipped.

Conventions for heights: `floorY` is the room's base floor in metres (world y); `ceiling` is the **clearance above the local floor** (so a sloped room keeps a constant clearance); a **slope strip** (`SlopeDef`) interpolates linearly between two edges and is the only place where neighbouring tiles may differ by more than 0.45 m; a **terrace** is a flat sub-area one or two 0.45 m steps above or below its room; a **gallery** is a decorative, non-walkable ledge at height with rails, statues and banners.

### 3.1 Map

Generated block map (1 character = 2 tiles wide x 3 tiles tall, x 0..71 left to right, z 0..83 top to bottom). Rooms touch edge to edge, doors are carved in the shared walls. Exact rectangles are in the table in 3.2; heights are in 3.2 and the elevation drawings in 3.2c.

```
            VVVVVVVVVVVV
            VVVVVVVVVVVV
            VVVVVVVVVVVV
            VVVVVVVVVVVV
            VVVVVVVVVVVV
            VVVVVVVVVVVV
            TTTTTTTTTTTT
            TTTTTTTTTTTT
            TTTTTTTTTTTT     SSSSSSS
MMMMMM       EEEEEEEEEE      SSSSSSS
MMMMMM       EEEEEEEEEE      SSSSSSS
MMMMMM       EEEEEEEEEE      SSSSSSS
MMMMMM       EEEEEEEEEE      SSSSSSS
MMMMMM       EEEEEEEEEE      SSSSSSS
wwoow   HHHHHHHHHeeHHHHHHHHH   pccpp
wwwww   HHHHHHHHHHHHHHHHHHHH   ppppp
wwwwwkkkHHHHHHHHHHHHHHHHHHHHqqqppppp
wwwwwkkkHHHHHHHHHHHHHHHHHHHHqqqppppp
wwwww   HHHHHHHHHHHHHHHHHHHH   ppppp
wwwww   HHHHHHHHHHHHHHHHHHHH   ppppp
    rr  HHHHHHHHHHHHHHHHHHHH
    rraaaaayyyyyyyyyyyyyy
     aaaaaayyyyyyyyyyyyyy
     aaaaaayyyyyyyyyyyyyy
           yyyyyyyyyyyyyy
              gggggggg
              gggggggg
              gggggggg
```
(`g` giris, `y` yaklasim, `H` merkez, `a` maden_ambari, `r` ray_gecidi, `k`/`q` west/east road, `w`/`p` wing halls, `o`/`c` corridors to the boss rooms, `M` makinist_odasi, `S` skarmorak_odasi, `e` k_edna, `E` edna_odasi, `T` titan_koridoru, `V` fisilti_salonu.)

### 3.2 Rooms

`floor / wall` is the **final** choice; the fallback in brackets is what to use until SP-12 (`earthen` styles) exists. The **height columns** are new: `floorY` (m) and `ceiling` (clearance, m); sloped rooms show `from -> to`.

| id | Name (TR) | rect `x, z, w, h` | Continuous bounds `x0..x1, z0..z1` | Floor / wall | floorY (m) | Ceiling (m) | Purpose |
|---|---|---|---|---|---|---|---|
| `giris` | Kasa Eşiği | 28, 74, 16, 10 | 27.5..43.5, 73.5..83.5 | earthen_dark / earthen (`stone_dark` / `forge`) | **+2.4** | 14 | start terrace, Kehanet Taşı, no packs; the grand stair starts at its north edge |
| `yaklasim` | Muhafız Yaklaşımı | 22, 62, 28, 12 | 21.5..49.5, 61.5..73.5 | earthen / earthen (`stone_dark` / `forge`) | **0** (strip S1 rises to +2.4) | 16 | entry hall, 5 packs, light shaft, **Büyük Merdiven** (S1), grand hub gate in the north wall |
| `maden_ambari` | Madenci Ambarı | 10, 64, 12, 8 | 9.5..21.5, 63.5..71.5 | dirt / cave | 0 | 8 | **optional**: miners' stash, 3 packs, chest |
| `ray_gecidi` | Eski Raylar | 8, 60, 4, 4 | 7.5..11.5, 59.5..63.5 | dirt / cave | ramp +1.2 (n) -> 0 (s) | 5 | **skip** passage to the west hall (climbs 1.2 m) |
| `merkez` | Merkezi İşleme | 16, 44, 40, 18 | 15.5..55.5, 43.5..61.5 | earthen / earthen (`stone_dark` / `forge`) | **0** rim and bridges, **-3** pit, dais +0.45 / +0.9 | **24** | hub: lava chasm, plus-shaped bridge, wheel, 9 packs (8 on the flanks + the patrol), shrine, four ring galleries |
| `k_bati` | Batı Maden Yolu | 10, 50, 6, 4 | 9.5..15.5, 49.5..53.5 | earthen_dark / earthen | ramp +1.2 (w) -> 0 (e) | 7 | hub -> west hall, 1 pack |
| `dokum_girisi` | Şarkı Söyleyen Dökümhane | 0, 44, 10, 16 | -0.5..9.5, 43.5..59.5 | lava_rock / forge | **+1.2**, Örs terrace +1.65 | 14 | west wing hall: forges, Usta Örsü, 4 packs, lava_burst hazard |
| `k_dokum` | Örs Geçidi | 4, 40, 4, 4 | 3.5..7.5, 39.5..43.5 | earthen_dark / earthen | ramp +2.4 (n) -> +1.2 (s) | 7 | west hall -> boss door, 1 pack |
| `makinist_odasi` | Makinistler Salonu | 0, 28, 12, 12 | -0.5..11.5, 27.5..39.5 | tiles / forge | **+2.4** | 20 | **Boss 3**, 4 corner vents, cube, 2 scrap blocks, cart station |
| `k_dogu` | Doğu Maden Yolu | 56, 50, 6, 4 | 55.5..61.5, 49.5..53.5 | earthen_dark / earthen | ramp 0 (w) -> -1.2 (e) | 7 | hub -> east hall, 1 pack |
| `pota_girisi` | Pota Girişi | 62, 44, 10, 16 | 61.5..71.5, 43.5..59.5 | lava_rock / cave | **-1.2** | 14 | east wing hall: crucibles, crystals, 4 packs (1 patrol) |
| `k_pota` | Kor Geçidi | 64, 40, 4, 4 | 63.5..67.5, 39.5..43.5 | dirt / cave | ramp -2.4 (n) -> -1.2 (s) | 7 | east hall -> boss door, 1 pack |
| `skarmorak_odasi` | Kristal Kazanı | 58, 26, 14, 14 | 57.5..71.5, 25.5..39.5 | lava_rock / cave | **-2.4** | 20 | **Boss 2**, 6 shard sockets, cart station |
| `k_edna` | Otomat Geçidi | 34, 40, 4, 4 | 33.5..37.5, 39.5..43.5 | earthen_dark / earthen | ramp +1.2 (n) -> 0 (s) | 8 | hub -> Seda, 1 pack |
| `edna_odasi` | Savunma Çekirdeği | 27, 26, 18, 14 | 26.5..44.5, 25.5..39.5 | tiles / earthen (`tiles` / `forge`) | **+1.2** | 18 | **Boss 1**, transit room to the Titan tunnels, ring gallery |
| `titan_koridoru` | Titan Tünelleri | 24, 18, 24, 8 | 23.5..47.5, 17.5..25.5 | earthen_dark / earthen (`stone_dark` / `temple`) | whole-room slope +1.2 (s) -> **-3.6** (n) | 10 | the **Büyük İniş** (descent), 5 packs, shrine, side galleries |
| `fisilti_salonu` | Fısıltı Salonu | 24, 0, 24, 18 | 23.5..47.5, -0.5..17.5 | earthen_dark / earthen (`tiles` / `temple`) | **-3.6**, dais -3.15 / -2.7 | **30** | **Boss 4** Eirich, two rifts, exit portal, gallery ring |

Boss-room flags: `edna_odasi boss: 1`, `skarmorak_odasi boss: 2`, `makinist_odasi boss: 2`, `fisilti_salonu boss: 3`.
Boss arenas in world metres (`BossDef.arena`): see §5 (centre = `4 * (x + w/2), 4 * (z + h/2)`). Boss fights are **flat**: no arena has a height difference above 0.45 m inside the fight area (terraces and galleries are decoration), so the 2.5 m melee-height rule of §13 never decides a boss mechanic.

#### 3.2b Height features (exact, tile-corner rects like `ZoneDef`)

| # | Feature | Room | Rect (tile-corner `x, z, w, h`) | Heights | Gradient / step | Look |
|---|---|---|---|---|---|---|
| S1 | **Büyük Merdiven** (grand stair, `kind: 'stairs'`) | `yaklasim` | 32, 69, 7, 5 (tiles x 32..38, z 69..73) | axis z: `from 0` (north edge z 68.5) `to +2.4` (south edge z 73.5, meets `giris`) | 2.4 / 20 m = 0.12 | 7 tiles wide (28 m), carved riser frieze `tk_stair_grand_face`, rails both sides, two giant sentinels at the head (`giris`) |
| S2 | Eski Raylar ramp | `ray_gecidi` | whole room | axis z: `from +1.2 to 0` | 1.2 / 16 m = 0.075 | rail track on the ramp |
| S3 | Batı Maden Yolu ramp | `k_bati` | whole room | axis x: `from +1.2 to 0` | 0.05 | rail track |
| S4 | Örs Geçidi ramp | `k_dokum` | whole room | axis z: `from +2.4 to +1.2` | 0.075 | gold glyph steps |
| S5 | Doğu Maden Yolu ramp | `k_dogu` | whole room | axis x: `from 0 to -1.2` | 0.05 | rail track |
| S6 | Kor Geçidi ramp | `k_pota` | whole room | axis z: `from -2.4 to -1.2` | 0.075 | crystal-edged steps |
| S7 | Otomat Geçidi ramp | `k_edna` | whole room | axis z: `from +1.2 to 0` | 0.075 | |
| S8 | **Büyük İniş** (the Titan descent) | `titan_koridoru` | whole room 24, 18, 24, 8 | axis z: `from -3.6` (north edge z 17.5) `to +1.2` (south edge z 25.5) | 4.8 / 32 m = 0.15 | a hall-wide ramp cut into 0.45 m step lines (texture bands), Titan glyph pillars shrinking in perspective |
| T1 | Hub dais outer | `merkez` | circle centre (35.5, 51.5) r 2.2 tiles | `+0.45` | one step from the bridges | rune ring |
| T2 | Hub dais inner | `merkez` | circle centre (35.5, 51.5) r 1.5 tiles | `+0.9` | one more step | Awakening Wheel base |
| T3 | Örs Sahanlığı | `dokum_girisi` | 6, 57, 4, 3 | `+1.65` | one step above the hall (+1.2) | Usta Örsü |
| T4 | Eirich dais outer | `fisilti_salonu` | 30, 0, 11, 5 | `-3.15` | one step above the floor | |
| T5 | Eirich dais inner | `fisilti_salonu` | 32, 0, 7, 4 | `-2.7` | second step; the exit portal and the dead wheel's pedestal stand here | |
| C1 | **Lav Çukuru** (chasm) | `merkez` | circle centre (35.5, 51.5) r 4.5 tiles | pit floor `-3` (lava plane) | not walkable; a fall = 25 % max HP + burn 6 s + respawn at the last safe tile (CORE §13); the `lava` zone keeps its burn hazard for scripted/boss cases | glowing emissive lava plane 3 m down, steam |
| B1 | N-S bridge | `merkez` | 35, 47, 2, 10 | deck `0` | | 10 `tk_bridge_stone` segments, 8 m wide |
| B2 | E-W bridge | `merkez` | 31, 51, 10, 2 | deck `0` | | 10 `tk_bridge_stone` segments (the 2x2 centre overlaps B1) |

Vertical rules the validator enforces (SP-11): V1 neighbouring walkable tiles differ by at most 0.45 m unless both lie in the same slope strip (checked on tile-centre heights; every strip end joins its neighbour with a step of at most 0.3 m (the Büyük İniş ends: 0.3 m at both doors)); V2 every strip gradient is at most 0.25; V3 both sides of every door differ by at most 0.45 m; V4 at least 3 distinct flat walkable floor heights per dungeon (Taşkasa has 10: +2.4, +1.65, +1.2, +0.9, 0, -1.2, -2.4, -2.7, -3.15, -3.6, plus the 8 slope strips and the 0.45 m terrace steps); V5 halls flagged `hall` (`giris`, `yaklasim`, `merkez`, `dokum_girisi`, `makinist_odasi`, `pota_girisi`, `skarmorak_odasi`, `edna_odasi`, `fisilti_salonu`) have `ceiling >= 12`; V6 every pack stands on a tile whose height step to its neighbours is at most 0.45 (no packs on a strip edge).

#### 3.2c Side elevations

**Critical path along the spine (x = 35.5, south on the left, north on the right).** 1 column = 2 tiles (8 m), 1 row = 0.6 m. `=` floor surface, `:` solid, `~` lava, blank = air/void. The hub row shows the bridge deck at 0 over the 3 m chasm (the chasm is only visible beside the bridge, drawn here under it).

```
 y(m)  [giris ][S1 ][yaklasim][ merkez (hub; pit under the N-S bridge)][k_edna][ edna_odasi ][ Büyük İniş ][ fisilti_salonu ]
 +3.0 |
 +2.4 |=====
 +1.8 |:::::=
 +1.2 |::::::=               =======
 +0.6 |:::::::              =:::::::=
 +0.0 |:::::::=============::::::::::
 -0.6 |::::::::::::::    ::::::::::::=
 -1.2 |::::::::::::::    :::::::::::::
 -1.8 |::::::::::::::    :::::::::::::=
 -2.4 |::::::::::::::    ::::::::::::::
 -3.0 |::::::::::::::~~~~::::::::::::::=       ==
 -3.6 |:::::::::::::::::::::::::::::::::=======::
        start (z 83.5)  ---------------- 84 tiles, 336 m ----------------  (z -0.5) Eirich
```

Reading it: start terrace **+2.4** -> Büyük Merdiven (20 m long) -> approach and hub at **0** (bridges at 0 over a chasm 3 m deep) -> Otomat Geçidi ramps up to **+1.2** (Seda's platform) -> Büyük İniş descends 4.8 m over 32 m to **-3.6** (Eirich's hall) with the two-step dais (-3.15, -2.7) at the far end. Total relief 6.0 m, the player descends from the top of the mountain to the bottom of the vault, exactly the Stonevault's "downward" feeling.

**Section through the hub, west wing to east wing (z = 51.5, west on the left).** The two boss rooms lie off this section (Makinistler at **+2.4** up the Örs Geçidi ramp, Skarmorak at **-2.4** down the Kor Geçidi ramp); the two **Maden Arabası** rides are the dungeon's lifts: the Makinist cart drops 2.4 m to the hub, the Skarmorak cart climbs 2.4 m.

```
 y(m)  [dokum_girisi][k_bati ][ merkez (hub; the pit is crossed by the E-W bridge at 0) ][k_dogu ][ pota_girisi ]
 +2.4 |                 (makinistler: +2.4, z 28..39, north of this cut, up the Örs Geçidi ramp)
 +1.8 |
 +1.2 |======
 +0.6 |::::::=
 +0.0 |:::::::======================
 -0.6 |::::::::::::::::    :::::::::=
 -1.2 |::::::::::::::::    ::::::::::======
 -1.8 |::::::::::::::::    ::::::::::::::::
 -2.4 |                 (skarmorak: -2.4, z 26..39, north of this cut, down the Kor Geçidi ramp)
 -3.0 |::::::::::::::::~~~~::::::::::::::::   (lava plane of the chasm)
 -3.6 |::::::::::::::::::::::::::::::::::::
        x 0 ----- 10 ------ 20 ------ 30 ------ 40 ------ 50 ------ 60 ------ 71
```
(The hall floors are the long flat stretches: west hall +1.2, hub 0, east hall -1.2.)

**Galleries (decorative, non-walkable, for the "tall hall" read).** Absolute y of the ledge, rails at +1.1 m:

| Room | Gallery rects (tile-corner) | y | What stands on them |
|---|---|---|---|
| `giris` | none (the parapet along the north edge replaces it) | | balustrade `tk_gallery_rail` x9 |
| `yaklasim` | W 22, 63, 1, 10 and E 49, 63, 1, 10 | +7.0 | 8 Titan sentinels (`tk_titan_statue` x4 per side), 20 rails |
| `merkez` | N 18, 44, 34, 1; S 18, 61, 34, 1; W 16, 46, 1, 12; E 55, 46, 1, 12 ("Çark Galerisi", a ring around the hall) | +7.2 | 10 Titan statues, 4 `tk_chandelier_forge`, ~96 rails, 8 long banners |
| `dokum_girisi` | E 9, 45, 1, 13 | +7.0 | 3 forge-master statues, 13 rails |
| `makinist_odasi` | N 0, 28, 12, 1 | +10.4 | 3 forge-master statues, 12 rails, chain winches |
| `pota_girisi` | E 71, 45, 1, 13 | +4.3 | 3 crystal-grown statues (teal), 13 rails |
| `skarmorak_odasi` | N 58, 26, 13, 1 | +1.6 | 4 crystal-grown statues, 13 rails |
| `edna_odasi` | ring: N 27, 26, 18, 1; S 27, 39, 18, 1; W 27, 27, 1, 12; E 44, 27, 1, 12 | +8.4 | 8 Titan statues, ~60 rails, the huge lens chandelier over the centre |
| `titan_koridoru` | W 24, 18, 1, 8; E 47, 18, 1, 8 | +4.5 | 4 Titan guardians (2 per side), 16 rails |
| `fisilti_salonu` | W 24, 2, 1, 14; E 47, 2, 1, 14 | +2.4 | 8 void-corrupted statues, 28 rails, hanging chains up to the dead wheel |

### 3.3 Doors, gates and the critical path

All doors 2 tiles wide except the grand hub gate (4). `DoorDef(a, b, tile, side, width, gate)`; `tile` is a tile of room `a` on the shared edge. All 17 doors verified (both tiles inside their rooms, both sides within 0.45 m in height, column `dy`).

| # | a -> b | tile | side | width | gate | dy (m) | Note |
|---|---|---|---|---|---|---|---|
| D1 | giris -> yaklasim | 35, 74 | n | 2 | none | 0.24 | top of the Büyük Merdiven |
| D2 | yaklasim -> merkez | 34, 62 | n | 4 | none | 0 | **grand gate**, `tk_rune_gate_grand` frame, two lava pours |
| D3 | yaklasim -> maden_ambari | 22, 66 | w | 2 | none | 0 | optional detour |
| D4 | maden_ambari -> ray_gecidi | 10, 64 | n | 2 | none | 0.15 | skip |
| D5 | ray_gecidi -> dokum_girisi | 8, 60 | n | 2 | none | 0.15 | skip |
| D6 | merkez -> k_bati | 16, 51 | w | 2 | none | 0.1 | |
| D7 | k_bati -> dokum_girisi | 10, 51 | w | 2 | none | 0.1 | |
| D8 | dokum_girisi -> k_dokum | 5, 44 | n | 2 | none | 0.15 | |
| D9 | k_dokum -> makinist_odasi | 5, 40 | n | 2 | **boss_lock** | 0.15 | stays closed while Seda lives |
| D10 | merkez -> k_dogu | 55, 51 | e | 2 | none | 0.1 | |
| D11 | k_dogu -> pota_girisi | 61, 51 | e | 2 | none | 0.1 | |
| D12 | pota_girisi -> k_pota | 65, 44 | n | 2 | none | 0.15 | |
| D13 | k_pota -> skarmorak_odasi | 65, 40 | n | 2 | **boss_lock** | 0.15 | stays closed while Seda lives |
| D14 | merkez -> k_edna | 35, 44 | n | 2 | none | 0.15 | |
| D15 | k_edna -> edna_odasi | 35, 40 | n | 2 | **boss_lock** | 0.15 | Boss 1 |
| D16 | edna_odasi -> titan_koridoru | 35, 26 | n | 2 | **boss_exit** | 0.3 | opens when Seda is dead |
| D17 | titan_koridoru -> fisilti_salonu | 35, 18 | n | 2 | **boss_lock** | 0.3 | Eirich has order 3: stays closed until Seda, Skarmorak and both Machinists are dead |

**Critical path:** D1 -> D2 -> D14 -> D15 (Seda) -> back to the hub -> D10/D11/D12/D13 (Skarmorak) or D6/D7/D8/D9 (Makinistler), either order, return by maden arabası -> D14 -> D15 -> D16 -> D17 (Eirich).
Boss `order`: Seda 1, Skarmorak 2, Brokk 2, Dorlita 2, Eirich 3 (same trick as Gölge Tapınağı's two wing bosses).

### 3.4 Boss placements

| Boss | Room | Tile (continuous) | Facing | Order | Group |
|---|---|---|---|---|---|
| `boss_seda` | `edna_odasi` | 35.5, 30 | 0 | 1 | - |
| `boss_skarmorak` | `skarmorak_odasi` | 64.5, 30.5 | 0 | 2 | - |
| `boss_dorlita` | `makinist_odasi` | 6, 31.5 | 0 | 2 | `makinistler` (SP-07) |
| `boss_brokk` | `makinist_odasi` | 4, 30 | 0 | 2 | `makinistler` (SP-07) |
| `boss_eirich` | `fisilti_salonu` | 35.5, 6.5 | 0 | 3 | - |

### 3.5 Optional areas and skips

- **Madenci Ambarı** (`maden_ambari`, `optional: true`): three packs `tk_p32..p34` (61 forces, a deliberate "Katliam" cluster: they are `linkedTo` each other, 2.9 to 6.0 tiles apart, with dormant scrap piles, a Forge Loader, a Rock Smasher), a gold chest at (20.5, 64.5), mine carts and stashes. Reward = forces, not loot (the map chests give gold and globes only).
- **Eski Raylar** (`ray_gecidi`, `skip: true`): one stealthed Hurda pack `tk_p35` (9 forces, `stealth: true`, 4 swarmers + a Voidsoul). Connects the Ambar to the west hall and climbs 1.2 m.
- **Route B (Ambar route).** Approach packs p01-p03 -> Ambar (p32-p34) -> Eski Raylar (p35) -> west hall (p17-p19, Usta Örsü) -> p20 in the Örs Geçidi -> p16 in the west road -> enter the hub from its **west door** -> west flank p06 and p12 -> **the p14 patrol is not skipped**: it laps the rail ring (about 70 s) between the west flank and the Seda door, so the tank either ambushes it at the north rim as it passes (pull p14 alone, 12 forces) or times the crossing for the gap after it has passed; -> p15 -> Seda. After Seda the party crosses the hub to the east door and pulls the east-flank packs it passes (p13, p10, p11), then the east wing and Titan. Route B **skips** p04, p05 (gate guards), p07, p08 (south-west flank), p09 (south-east flank) and the Rock Smashers p31: 14 + 13 + 15 + 14 + 16 + 20 = **92 forces** skipped, **70 optional forces** added: 498 - 92 = **406 forces (101.5 %)**, still 100 %. The wing boss rooms still need Seda dead first, so the Makinistler room is entered after the hub.
- The hub patrol, the Titan Rock Smashers (p31 can be left alone once 400 forces are reached) and the east Despoiler are the "skips by skill" of Route A.

### 3.6 Zones, hazards and per-room dressing

Zone rects are **tile-corner** based (integer indices, never shifted); `circleZone(kind, cx, cz, rTiles)` takes the GDD centre. Paste-ready `ROOM_EXTRA` (`ZoneDef`, `HazardDef`, `fog`, `ambientVfx`, `lightColor`, and the SP-22 fields `floorY`, `ceiling`, `slopes`, `terraces`, `galleries`), then the dressing section 3.7.

```ts
const GOLD = 0xffd54a, LAVA = 0xff8c1a, EMBER = 0xa8301c, TEAL = 0x3fe0c8, VOID = 0x7a3cff;
const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: { floorY: 2.4, ceiling: 14, ambientVfx: 'ambient_dust', lightColor: GOLD,
    zones: [circleZone('rune', 35.5, 77.8, 1.2, { color: 0x1a0f08, glow: GOLD, glowIntensity: 0.5 })],
    galleries: [] },
  yaklasim: { floorY: 0, ceiling: 16, ambientVfx: 'ambient_dust', explicitDecor: true, fog: { color: 0x2a150d, near: 12, far: 62 },
    slopes: [{ rect: [32, 69, 7, 5], axis: 'z', from: 0, to: 2.4, kind: 'stairs' }],
    galleries: [{ rect: [22, 63, 1, 10], y: 7.0, rail: true }, { rect: [49, 63, 1, 10], y: 7.0, rail: true }] },
  maden_ambari: { floorY: 0, ceiling: 8, ambientVfx: 'ambient_dust' },
  ray_gecidi: { ceiling: 5, slopes: [{ rect: [8, 60, 4, 4], axis: 'z', from: 1.2, to: 0, kind: 'ramp' }] },
  merkez: {
    floorY: 0, ceiling: 24, explicitDecor: true, lightColor: LAVA, ambientVfx: 'ambient_embers', fog: { color: 0x2e170e, near: 16, far: 84 },
    zones: [
      circleZone('lava', 35.5, 51.5, 4.5, { blocked: true, y: -3, fall: true, color: 0x7a1a05, glow: 0xff6a10, glowIntensity: 1.5, hazard: { coef: 1.2, interval: 0.5 },
        light: { color: LAVA, intensity: 1.8, distance: 20, flicker: true, y: -1.5 } }),   // SP-23 chasm: renders the pit down to y, fall rule
      rectZone('bridge', 35, 47, 2, 10, { y: 0, color: 0x2a1a12 }),   // north-south arm (tile-corner x 35..37, z 47..57)
      rectZone('bridge', 31, 51, 10, 2, { y: 0, color: 0x2a1a12 }),   // east-west arm (x 31..41, z 51..53), lines up with the two side doors
      circleZone('dais', 35.5, 51.5, 2.2, { blocked: false, y: 0.45, color: 0x3a2418, glow: GOLD, glowIntensity: 0.5 }),
      circleZone('dais', 35.5, 51.5, 1.5, { blocked: false, y: 0.9, color: 0x3a2418, glow: GOLD, glowIntensity: 0.7 }),
    ],
    hazards: [{ kind: 'lava_burst', interval: 5, warn: 1.2, radius: 2.0, coef: 1.8, vfx: 'volcanic_plume' }],
    galleries: [{ rect: [18, 44, 34, 1], y: 7.2, rail: true }, { rect: [18, 61, 34, 1], y: 7.2, rail: true },
                { rect: [16, 46, 1, 12], y: 7.2, rail: true }, { rect: [55, 46, 1, 12], y: 7.2, rail: true }],
  },
  k_bati: { ceiling: 7, slopes: [{ rect: [10, 50, 6, 4], axis: 'x', from: 1.2, to: 0, kind: 'ramp' }] },
  k_dogu: { ceiling: 7, slopes: [{ rect: [56, 50, 6, 4], axis: 'x', from: 0, to: -1.2, kind: 'ramp' }] },
  k_dokum: { ceiling: 7, slopes: [{ rect: [4, 40, 4, 4], axis: 'z', from: 2.4, to: 1.2, kind: 'ramp' }] },
  dokum_girisi: { floorY: 1.2, ceiling: 14, lightColor: LAVA, ambientVfx: 'ambient_embers', fog: { color: 0x3a2a24, near: 8, far: 44 },
    terraces: [{ rect: [6, 57, 4, 3], y: 1.65 }],
    hazards: [{ kind: 'lava_burst', interval: 6, warn: 1.2, radius: 2.0, coef: 1.8, vfx: 'volcanic_plume' }],
    galleries: [{ rect: [9, 45, 1, 13], y: 7.0, rail: true }] },
  makinist_odasi: {
    floorY: 2.4, ceiling: 20, explicitDecor: true, lightColor: LAVA, ambientVfx: 'ambient_embers', fog: { color: 0x2a150d, near: 14, far: 70 },
    zones: [  // the four corner vents (visual bases; the flame pools are boss-script shapes)
      rectZone('vent', 0, 29, 3, 3, { blocked: false, color: 0x2a1008, glow: EMBER, glowIntensity: 0.6 }),
      rectZone('vent', 8, 29, 3, 3, { blocked: false, color: 0x2a1008, glow: EMBER, glowIntensity: 0.6 }),
      rectZone('vent', 0, 37, 3, 3, { blocked: false, color: 0x2a1008, glow: EMBER, glowIntensity: 0.6 }),
      rectZone('vent', 8, 37, 3, 3, { blocked: false, color: 0x2a1008, glow: EMBER, glowIntensity: 0.6 }),
      circleZone('rune', 5.5, 33.5, 1.4, { color: 0x1a0f08, glow: GOLD, glowIntensity: 0.6 }),
    ],
    galleries: [{ rect: [0, 28, 12, 1], y: 10.4, rail: true }],
  },
  pota_girisi: { floorY: -1.2, ceiling: 14, lightColor: TEAL, ambientVfx: 'ambient_dust', fog: { color: 0x1a2420, near: 10, far: 50 },
    galleries: [{ rect: [71, 45, 1, 13], y: 4.3, rail: true }] },
  k_pota: { ceiling: 7, lightColor: TEAL, fog: { color: 0x1a2420, near: 8, far: 44 }, slopes: [{ rect: [64, 40, 4, 4], axis: 'z', from: -2.4, to: -1.2, kind: 'ramp' }] },
  skarmorak_odasi: {
    floorY: -2.4, ceiling: 20, explicitDecor: true, lightColor: TEAL, ambientVfx: 'ambient_dust', fog: { color: 0x1a2420, near: 10, far: 50 },
    zones: [circleZone('rune', 64.5, 32.5, 5.5, { color: 0x0e1a18, glow: TEAL, glowIntensity: 0.45 })],
    galleries: [{ rect: [58, 26, 13, 1], y: 1.6, rail: true }],
  },
  k_edna: { ceiling: 8, slopes: [{ rect: [34, 40, 4, 4], axis: 'z', from: 1.2, to: 0, kind: 'ramp' }] },
  edna_odasi: {
    floorY: 1.2, ceiling: 18, explicitDecor: true, lightColor: GOLD, ambientVfx: 'ambient_dust', fog: { color: 0x2a150d, near: 14, far: 70 },
    zones: [circleZone('rune', 35.5, 32.5, 6.5, { color: 0x1a0f08, glow: GOLD, glowIntensity: 0.55 }), circleZone('rune', 35.5, 32.5, 3.5, { color: 0x1a0f08, glow: GOLD, glowIntensity: 0.7 })],
    galleries: [{ rect: [27, 26, 18, 1], y: 8.4, rail: true }, { rect: [27, 39, 18, 1], y: 8.4, rail: true },
                { rect: [27, 27, 1, 12], y: 8.4, rail: true }, { rect: [44, 27, 1, 12], y: 8.4, rail: true }],
  },
  titan_koridoru: { ceiling: 10, ambientVfx: 'ambient_dust', fog: { color: 0x1e100a, near: 12, far: 60 }, lightColor: GOLD,
    slopes: [{ rect: [24, 18, 24, 8], axis: 'z', from: -3.6, to: 1.2, kind: 'ramp' }],
    galleries: [{ rect: [24, 18, 1, 8], y: 4.5, rail: true }, { rect: [47, 18, 1, 8], y: 4.5, rail: true }] },
  fisilti_salonu: {
    floorY: -3.6, ceiling: 30, explicitDecor: true, lightColor: VOID, ambientVfx: 'ambient_shadow_wisps', fog: { color: 0x1c0e2e, near: 12, far: 64 },
    terraces: [{ rect: [30, 0, 11, 5], y: -3.15 }, { rect: [32, 0, 7, 4], y: -2.7 }],
    zones: [circleZone('rune', 35.5, 8.5, 9, { color: 0x14081c, glow: VOID, glowIntensity: 0.55 }), circleZone('rune', 35.5, 8.5, 5, { color: 0x14081c, glow: VOID, glowIntensity: 0.7 })],
    galleries: [{ rect: [24, 2, 1, 14], y: 2.4, rail: true }, { rect: [47, 2, 1, 14], y: 2.4, rail: true }],
  },
};
```

### 3.7 Set dressing, room by room

This is one of the 8 maps Mythic+ rotates on, so every room is dressed in layers: **(1)** hand-placed collide props and set pieces, **(2)** vertical dressing (galleries, banners, chandeliers, stalactites, statues, all non-collide and instanced), **(3)** lights, **(4)** VFX, **(5)** sound. Rules (checked by `content-check`, SP-11): GDD coordinates; every collide prop at least 2.5 tiles from a pack centre and at least 1.2 tiles from a patrol line; no prop in a door gap (door lanes are 2 tiles wide, 4 for D2); at least 4 hand-placed props per room; non-collide dressing may be anywhere above 2.5 m height. "x N" = count; coordinates are given where a prop is a gameplay anchor or collides.

Shared rows used in every room (not repeated below): gold wall torches `Props.torches(room, side, zs, GOLD)` (light 2.2 / 11, `vfx 'torch_fire'`), `autoDecor` floor scatter from the room table (bones are replaced by `ks('resource-stone')` and `dg('rubble_half')` in the style), `tk_stalactite` on the ceiling (counts below, instanced, no light), `ambient_*` VFX from `ROOM_EXTRA`. Light budget: at most 8 real lights near the camera; "pooled" = `PropPlacement.light` entries that the light pool ranks by distance and `priority` (§2.3); anything else is an emissive prop.

**`giris` Kasa Eşiği** (y +2.4, ceiling 14, start terrace)
- Gameplay: `gp('font_of_power')` (35.5, 77.8) id `font_of_power`, collide; `dg('stairs_walled')` (35.5, 82.8) id `stairs_up` (the way back, inert); start (35.5, 80.5).
- Collide props: `gp('statue_hooded')` x2 (30, 81.5) rot 45 and (41, 81.5) rot -45 (tint `0x8a7a68`, scale 1.3); `gp('brazier')` x2 (31, 76.5), (40, 76.5) (scale 1.6); `dg('crates_stacked')` x2 (29, 82.5), (30.5, 83); `dg('barrel_large')` x2 (41.5, 82.8), (42.8, 82.5); stair-head giants `tk_titan_statue` x2 at (31.0, 74.6) and (40.0, 74.6) (scale 1.0 = 9 m; fallback `gp('statue_hooded')` x2.4).
- Parapet: `tk_gallery_rail` x9 along the north edge at z 73.8 (tiles x 28..31 and 39..43, the 7-tile gap x 32..38 is the stair head).
- Vertical dressing: 2 `tk_lava_fall` on the side walls (27.8, 78) rot 90 and (43.2, 78) rot -90; 4 `dg('banner_patternA_brown')` on the side walls at z 75.5 and 80 (hang 3 m to 8 m); 2 `dg('sword_shield_gold')` memorials on the west wall (27.9, 77), (27.9, 82) at `MOUNT_Y`; `tk_stalactite` x6; `tk_banner_long` x2 flanking the stair head on the north wall; scatter `ks('resource-stone')` x6, `dg('rubble_half')` x3.
- Lights: Font gold 1.4 / 9 (priority 1); one pooled lava light 1.8 / 14 between the two falls; braziers ember 1.2 / 8 (emissive, not pooled); 6 gold torches (z 76, 79, 82 on both side walls).
- VFX: `ambient_dust`, `brazier_fire` x2, `torch_fire` x6, rune circle glow (emissive), the Font's own `rune_ring` spin; light shaft none (the roof is dark).
- Sound: ambience bed (§2.9), `forge_strike` distant every 18-35 s at volume 0.2 (positional, from the north), `keystone_insert` + `countdown_tick` at the Font; torch crackle loop (`camp_crackle`) at the braziers.

**`yaklasim` Muhafız Yaklaşımı** (y 0, ceiling 16, the Büyük Merdiven S1 at its south end)
- Colonnade (collide): `tk_titan_pillar` (fallback `dg('pillar_decorated')` tint `0xb08868` scale 1.15 + 1.6 for height) x12: north row z 62.6 at x 24, 28, 31.5, 40, 44, 47.5 (gap x 33-38 at the gate); south row z 72.7 at x 23.5, 27.5, 29.8 and 43.5, 46, 48.4 (gap x 31-39 is the stair).
- Gate: `tk_rune_gate_grand` frame (35.5, 61.7) rot 180 around D2; two `tk_lava_fall` flanking at (29.5, 61.8), (41.5, 61.8) with pooled orange lights 1.8 / 14.
- Stair S1 dressing: `tk_stair_grand_face` x1 (35.5, 73.2), `tk_gallery_rail` x10 (5 per side at x 31.5 and 38.5, z 69..73), two giant sentinels at the head are in `giris`.
- Hand-placed: `tk_light_shaft` (36, 68); `tk_scrap_pile` x9 under every member of p01 (tag `wake`); rail stub `tk_rail_straight` x4 at z 69.5 x 44..48 + `tk_mine_cart` (46.5, 69.5) rot 90 collide; `gp('chest_wood')` (47.5, 71.8); `dg('barrel_large')` x3 at (22.8, 64), (22.8, 65.4), (22.8, 66.8); `gp('sacks')` x3, `dg('crates_stacked')` x2 near them; `dg('rubble_large')` x4 around the north-east pillar; `ks('resource-stone-large')` x2.
- Galleries (non-walkable, y +7.0, W and E): `tk_titan_statue` x4 per side (fallback `gp('statue_hooded')` x2.2), `tk_gallery_rail` x10 per side.
- Vertical dressing: `tk_banner_long` x6 on the north wall at x 24, 28, 31, 40, 44, 48 (z 61.9, hang from y 12 to y 5); `dg('banner_triple_brown')` x4 on pillars; `dg('chandelier')` / `tk_chandelier_forge` x3 hanging at y 11 at (28, 67), (43, 67), (36, 71) (emissive candles, no light); `tk_stalactite` x14.
- Lights: gold torches x10 (both side walls and 4 on pillars), two lava pours (pooled 1.8 / 14), light shaft emissive cone alpha 0.18.
- VFX: `ambient_dust` (thicker under the shaft), `torch_fire`, lava falls (UV scroll 0.15 u/s), chandelier flame flicker (shader, no VFX object).
- Sound: lava pour loop (`fire_whoosh`, volume by distance, from the north), `forge_strike` distant, `rubble` when the swarm piles wake (p01), `footstep_stone`.

**`maden_ambari` Madenci Ambarı** (optional, y 0, ceiling 8)
- Collide: `tk_mine_cart` x2 (11.0, 65.0), (20.3, 66.0); `gp('chest_gold')` (20.5, 64.5) id `chest_ambar` tag `chest`; `dg('crates_stacked')` x3, `gp('sacks')` x3 along the north wall; `ks('resource-stone-large')` x2.
- Hand-placed: `tk_scrap_pile` x6 under the hurda of p32 (tag `wake`); `tk_rail_straight` x8 along z 64.5 from x 11 to 19; `ks('tool-pickaxe')` x4 on racks; `ks('structure-metal')` support beams x6 (scaffold read).
- Vertical dressing: `gp('chains_hanging')` x3, `dg('chandelier')` x1 at y 6, `tk_stalactite` x5.
- Lights: 3 gold torches, 1 ember lantern 1.2 / 8.
- VFX: `ambient_dust`. Sound: `mine_rock` taps every 5-9 s (positional, far), `rubble` when p32 wakes.

**`ray_gecidi` Eski Raylar** (skip, ramp +1.2 -> 0, ceiling 5)
- Collide-free tunnel: `tk_rail_straight` x4 along z, `dg('rubble_large')` x2, `tk_mine_cart` wreck (non-collide, 8.7, 62.4, tilted), `tk_scrap_pile` x4 under p35 (stealth, tag `wake`), one torch (dark tunnel on purpose). Lights: 1 gold torch only. VFX: `ambient_dust`. Sound: distant cart clatter loop, `footstep_dirt`.

**`merkez` Merkezi İşleme** (the hub; y 0, pit -3, ceiling 24; `explicitDecor`)
- The centre: `tk_awakening_wheel` (intact) at (35.5, 51.5) y 11.5, `ring_outer` +12 deg/s, `ring_inner` -18 deg/s (SP-16); eight chains from the wheel to the four gallery corners (`gp('chains_hanging')` x8, y 11..24).
- Bridges: `tk_bridge_stone` x16 (N-S arm tiles z 47..56, E-W arm tiles x 31..40, the 2x2 centre belongs to the dais), deck y 0, gold rune inlay, low parapet stubs on the first 2 m of each arm only (the middle is open, falls are possible).
- Pit: lava plane at y -3 (emissive, UV scroll), `tk_lava_fall` x4 in the corners (15.9, 44.3), (55.1, 44.3), (15.9, 61.2), (55.1, 61.2) and x2 flanking D14 at (31, 43.8), (40, 43.8); steam sprites at the pit rim.
- Machine housings (collide, glyph panels emissive): `tk_machine_housing` x8 at (22.5, 44.3), (30, 44.3), (41, 44.3), (48.5, 44.3) and (21, 61.0), (30, 61.0), (41, 61.0), (50, 61.0).
- Rails: `tk_rail_curve` x8 + `tk_rail_straight` x6 in a rectangular ring around the pit (x 29.5-41.5, z 46-57, about 6 tiles from the pit centre) (no collision; **the patrol p14 walks this loop**, §4.4); `tk_mine_cart` x3 (collide) parked on rail spurs at (27.8, 53.0), (43.6, 53.2), (36.2, 59.6).
- Floor: `dg('floor_tile_big_grate')` x6 y 0.03 tag `vent` vfx `ambient_dust` at (22.5, 56.5), (49, 51.5), (22.5, 48), (49, 56), (28, 60.5), (43, 60.5); rune ring decals around the dais.
- Shrine `shrine_power` (Kudret) at (22.5, 60.3): `kg('altar-stone')` x3 + `gp('crystal_purple')` + 4 candles (`shrine()` helper).
- Cart arrival platforms: `tk_cart_station` (18.5, 59.0) rot 90 (id `cart_arrive_bati`) and (52.5, 59.0) rot -90 (id `cart_arrive_dogu`).
- Sentinels: `gp('statue_hooded')` x2 beside D14 at (32.5, 43.9), (38.5, 43.9), tint `0x8a7a68`, collide.
- Cavern: `tk_cavern_ring` (radius 70 m, y 0..20); `tk_stalactite` x24 at y 18..24; `tk_light_shaft` x2 over the flanks at (22, 52) and (49, 52); `tk_ladle_hanging` x6 at y 14 (non-collide) over the flanks; 6 `tk_scrap_pile` under the hurda of p11 (the swarm at (52.5, 54), tag `wake`).
- Ring galleries ("Çark Galerisi", y +7.2): ~96 `tk_gallery_rail` (instanced), `tk_titan_statue` x10 at the corners and mid-spans (fallback `gp('statue_hooded')` x2.4), `tk_banner_long` x8 hanging from the galleries to y 3 on the north and south walls, `tk_chandelier_forge` x4 at y 16 over (24, 49), (47, 49), (24, 56), (47, 56) (fallback `dg('chandelier')` x2).
- Lights: pit light 1.8 / 20 flicker (priority 1), D14 pours 1.8 / 14 (priority 1), the 4 corner pours emissive only, 8 gold torches on the housings, ember vents 1.2 / 8 x2; the wheel glows gold (emissive 2.0, no light).
- VFX: `ambient_embers` over the whole hall, `volcanic_plume` hazard (§3.6), `ambient_dust` steam over the six vents, `fire_ground` splashes when something falls, bloom on the wheel runes.
- Sound: lava roar loop positional at the pit (fall-off 30 m), gear-grind loop at the wheel (0.5, louder under it), `forge_strike` every 12-25 s from the west, `blacksmith_hammer` distant, `lever` clunk when the cart stations wake, `perilous_warn` for plumes (existing hazard sfx).

**`k_bati` / `k_dogu` mine roads** (ramps, ceiling 7)
- `tk_rail_straight` x3 along the road, `tk_mine_cart` wreck (non-collide), `gp('chains_hanging')` x2, `dg('barrel_small_stack')` x1 (`k_bati` (15.0, 50.0)), `ks('tool-pickaxe')` x1, 2 gold torches, `tk_stalactite` x3. `k_dogu` adds `tk_skardyn_crystal` shard x2 (the first teal). Lights: 2 torches; VFX `ambient_dust`; sound: rail ticks, `footstep_stone`.

**`dokum_girisi` Şarkı Söyleyen Dökümhane** (y +1.2, ceiling 14; Örs terrace +1.65)
- Collide: `gp('forge')` x3 along the west wall at (0.8, 47.5), (0.8, 52.6), (0.8, 55.5) rot 90; `ks('workbench-anvil')` x2 at (1.5, 58.8), (2.5, 44.2); `ks('workbench-grind')` (9.0, 49.5); **Usta Örsü** `tk_forge_anvil_great` at (7.5, 58.2) on terrace T3, id `usta_orsu` (SP-14); `dg('barrel_large')` x4 at (9.0, 48.2), (9.0, 54.0), (9.0, 55.2), (1.0, 44.3).
- Hanging: `tk_ladle_hanging` x4 at y 9 over (3, 48), (3, 54), (7.5, 50.5), (7, 55.5) (non-collide, orange pooled light under one of them); `gp('chains_hanging')` x4; `dg('chandelier')` x2 at y 10 at (3.5, 49) and (3.5, 55).
- Gallery E (y +7.0): `gp('statue_hooded')` x3 (forge-masters, scale 2.0), `tk_gallery_rail` x13. `ks('tool-hammer')`, `ks('tool-pickaxe')`, `tk_stalactite` x8, `dg('banner_patternA_brown')` x3.
- Lights: ladle glow 1.8 / 14 (priority 1), 6 gold torches (east wall z 46, 50, 54, 58; two on the west wall), ember crucible vents 1.2 / 8 x2.
- VFX: `ambient_embers`, `lava_burst` plumes (hazard, 6 s), sparks `hit_spark` gold at the three forges every 3-5 s (scripted idle loop), `fire_burst` on the ladles when drips land.
- Sound: `blacksmith_hammer` loop x3 (positional, offset 4-6 s each), `forge_strike` at the Örsü, `fire_whoosh` low loop, `forge_ding` on use of the Usta Örsü.

**`k_dokum` Örs Geçidi** (ramp, ceiling 7): `dg('sword_shield_gold')` x2, `dg('banner_patternA_brown')` x2, `gp('chains_hanging')` x2, 2 torches, boss-door frame `tk_rune_gate_grand` scale 0.7 at (5.5, 39.7) with a red gate glow while Seda lives. No braziers (the corridor is only 4 tiles wide and p20 stands in it). Sound: `gate_heavy` when the door unlocks.

**`makinist_odasi` Makinistler Salonu** (y +2.4, ceiling 20; `explicitDecor`; boss 3)
- Anchors (exact, used by the boss script): `tk_exhaust_vent` ids `vent_1..4` at (1.5, 29.5), (9.5, 29.5), (1.5, 37.5), (9.5, 37.5); `tk_scrap_block` ids `scrap_block_1` (1.0, 33.5) and `scrap_block_2` (10.0, 33.5), collide; `tk_scrap_cube` id `scrap_cube` (5.5, 33.5) on the central pedestal; `tk_cart_station` id `cart_bati` (5.5, 38.2) (inactive until the pair is dead).
- Cover: 4 `tk_titan_pillar` (cracked) at (3.5, 31.5), (7.5, 31.5), (3.5, 35.5), (7.5, 35.5) (collide).
- Set dressing: `gp('forge')` x3 against the north wall at (2.0, 28.4), (5.5, 28.4), (9.0, 28.4) (cold, boss-room scale 1.4), giant bellows `ks('structure-metal')` x2, `tk_ladle_hanging` x6 at y 14 on winch chains, `gp('chains_hanging')` x8, `dg('rubble_large')` x4, `ks('barrel')` x4 in the corners (non-collide inside the vent bases).
- Gallery N (y +10.4): 3 forge-master statues (`gp('statue_hooded')` x2.4, one raised hammer), 12 rails, 2 chain winches with chains down to the pedestal; `tk_banner_long` x4, `dg('chandelier')` x2 at y 16, `tk_stalactite` x6.
- Lights: 4 vent embers 1.2 / 8 (lit only while a vent burns), scrap cube gold glow 1.5 / 8, two lava ladle lights 1.8 / 14, 6 gold torches.
- VFX: `ambient_embers`, vent flames (`fire_ground` while active), `hit_spark` gold on the cube slide, `volcanic_plume` none (boss shapes only).
- Sound: forge hammering loop (quiet, positional), `fire_whoosh` per active vent, `boss_cast`/`boss_roar` from the scripts, `forge_strike` on every Crescendo wave.

**`pota_girisi` Pota Girişi** (y -1.2, ceiling 14)
- Collide: `gp('cauldron')` x3 crucibles (scale 2.2, tag `crucible`, ids `crucible_1..3`, emissive `0xff8c1a`) at (62.4, 47.0), (62.4, 57.0), (66.5, 59.0); `tk_skardyn_crystal` large x3 at (71.1, 44.0), (71.1, 49.0), (71.1, 54.2); `gp('crystal_blue')` tinted teal x8 scattered along the walls; `ks('metal-panel*')` scrap walls x6 along the west wall.
- Vertical dressing: gallery E (y +4.3) with 3 crystal-grown statues (`gp('statue_hooded')` x2 tinted `0x5a9a98`), 13 rails; `tk_stalactite` x10 (teal crystal variant); `dg('floor_tile_big_grate')` steam vents x3 at (65.5, 49), (65.5, 55), (68, 44.8); `gp('chains_hanging')` x4 with hanging crucibles `tk_ladle_hanging` x2 at y 8.
- Lights: crystal teal 1.5 / 9 x2 (pooled), crucible ember 1.2 / 8 x3, 4 gold torches (dim, the hall is teal-dominated).
- VFX: `ambient_dust` teal-tinted, `arcane_burst` (colour override `0x3fe0c8`) sparkle on the crystals every 8 s, ember drift from the crucibles.
- Sound: crystal chime loop (`ice_chime`, 0.3), crucible bubbling (`bubble_loop`), faint `whisper` under the rear crystals.

**`k_pota` Kor Geçidi** (ramp -2.4 n, ceiling 7): `tk_skardyn_crystal` x4 on both walls (thicker than the hall, violet veins at the base), 2 teal lights, boss-door frame (the Skarmorak door has no frame prop, a cracked crystal arch `tk_skardyn_crystal` x2 instead). Sound: `ice_chime` swell near the door, `gate_heavy` on unlock.

**`skarmorak_odasi` Kristal Kazanı** (y -2.4, ceiling 20; `explicitDecor`; boss 2)
- Anchors: shard sockets `tk_skardyn_crystal` (small) ids `shard_spot_1..6` at (60.5, 29.5), (68.5, 29.5), (64.5, 35.5), (60.5, 36.5), (68.5, 36.5), (64.5, 27.5); `tk_cart_station` id `cart_dogu` (64.5, 38.2).
- Set dressing: `tk_skardyn_crystal` large x6 on the walls with violet veins, `gp('crystal_purple')` tinted violet x3 in the corners (the Void under the crystal), crystal stalactites `tk_stalactite` x14 (teal, emissive), `gp('rock_cliff')` stacks x4 as cavern walls, a teal `tk_light_shaft` (alpha 0.15) at (64.5, 31) (a crack in the ceiling).
- Gallery N (y +1.6): 4 crystal-grown statues, 13 rails.
- Lights: two teal pooled 1.5 / 9, one violet 2.0 / 14 (priority 2, in the north-east corner), rune circle glow 0.45.
- VFX: `ambient_dust` teal, `arcane_burst` shimmer on crystals, violet `ambient_shadow_wisps` in the corners.
- Sound: crystal resonance drone, `ice_chime` on each shard, `whisper` loop in the corners.

**`k_edna` Otomat Geçidi** (ramp, ceiling 8): `tk_rune_gate_grand` scale 0.7 at (35.5, 39.7), 4 wall `dg('torch_mounted')` (no braziers: p15 stands in the 4-tile corridor), `dg('banner_patternA_brown')` x2, `dg('sword_shield')` x2, `gp('chains_hanging')` x2. Sound: low gear hum growing toward the door.

**`edna_odasi` Savunma Çekirdeği** (y +1.2, ceiling 18; `explicitDecor`; boss 1)
- Centre: `tk_edna_lens_pedestal` (35.5, 32.5) (the boss stands at (35.5, 30)); 8 `tk_rune_block` on a ring of radius 5.2 tiles around the centre (collide) at angles 0, 45, ... 315 deg: (40.7, 32.5), (39.2, 36.2), (35.5, 37.7), (31.8, 36.2), (30.3, 32.5), (31.8, 28.8), (35.5, 27.3), (39.2, 28.8).
- Cover (collide): `tk_titan_pillar` x4 at (29, 28), (42, 28), (29, 37), (42, 37).
- Spike emitters (floor decor, y 0.02): `dg('floor_tile_big_spikes')` x8 at (27.2, 29), (27.2, 36), (43.8, 29), (43.8, 36), (30, 26.2), (41, 26.2), (30, 38.8), (41, 38.8).
- Vertical dressing: ring gallery (y +8.4) with 8 Titan statues (`tk_titan_statue`, fallback `gp('statue_hooded')` x2.4), ~60 rails, `tk_banner_long` x8 hanging between the statues, **the lens chandelier** `tk_chandelier_forge` scale 2.0 at (35.5, 32.5) y 14 (non-collide, emissive gold lens ring), 2 `tk_lava_fall` flanking D16 at (31, 25.8), (40, 25.8), 2 gold glyph columns (emissive) behind the pedestal, `tk_stalactite` x10.
- Lights: gold torches x8, lens glow 2.2 / 14 (priority 2, at (35.5, 3.0, 32.5), pulses while she charges), pooled lava lights 1.8 / 14 at the falls.
- VFX: `ambient_dust`, rune circles (zones, glow 0.55 / 0.7), spike tips pulse gold (emissive), `hit_spark` gold on every spike detonation.
- Sound: gear-turning loop (the lens), a charge whine that rises with her energy bar, `ground_slam` for Shatter, `stance_break` for her posture break, `lever` for the door.

**`titan_koridoru` Titan Tünelleri** (slope +1.2 -> -3.6, ceiling 10)
- Pillars: `tk_titan_pillar` (gold glyph, emissive) x8 **engaged** (flush with the wall, collide false, so they never block a pull) at z 18.2 and 24.8, x 26, 30, 38, 44; `tk_titan_relief` x6 on the long walls; `dg('banner_triple_brown')` x4, `tk_banner_long` x4 down the long walls.
- Collide: `gp('brazier')` x2 at (24.6, 25.0), (46.4, 24.5); `gp('statue_hooded')` x2 at (24.4, 19.2), (46.8, 24.6); shrine `shrine_ward` (Koruma) at (31.0, 24.3).
- Eirich door: `tk_rune_gate_grand` at (35.5, 17.7) with a violet leak light (`0x7a3cff`, 1.6 / 10, priority 1) and `tk_void_rift` shards growing out of the door cracks (non-collide, 2 small).
- The descent: step-band texture every 4 m on the floor (the 0.45 m "steps" read, the slope is smooth), `tk_stair_grand_face` x1 at the north end above the door, galleries W and E (y +4.5) with 2 Titan guardians each (`tk_titan_statue`, one with the Eirich door's key-glyph in its hand), 16 rails, `tk_stalactite` x12.
- Lights: **no torches**, the tunnel is lit by the gold glyph columns (emissive only) and two braziers 1.2 / 8, the violet leak at the far end; ceiling dark.
- VFX: `ambient_dust`, `ambient_shadow_wisps` thickening from z 22 northward, violet motes at the door.
- Sound: a deep drone, a faint `heartbeat_loop` that rises with every step toward the door (volume 0.1 -> 0.5), `whisper` loop at the door, `footstep_stone` echo.

**`fisilti_salonu` Fısıltı Salonu** (y -3.6, ceiling 30; `explicitDecor`; boss 4)
- Anchors: `tk_void_rift` ids `rift_spot_1..6` at (26.5, 9), (44.5, 9), (28.5, 3), (42.5, 3), (26.5, 14), (44.5, 14); `rift_spot_1` and `rift_spot_2` are lit (open) at the pull, the others are dark frames.
- Centre dressing: broken `tk_awakening_wheel` (violet variant, 9 m) at (35.5, 1.5) y 14 hanging by 10 chains from the ceiling (slow spin 4 deg/s, `gp('chains_hanging')` x10); dais pedestal for the exit portal at (35.5, 3.5); 6 `tk_titan_pillar` (void-corrupted) at the corners and mid walls (collide); `gp('crystal_purple')` x8 violet emissive; fracture decals (the zones' rune rings, r 9 and r 5).
- Vertical dressing: violet void card ceiling (§2.4) at y +26.4; galleries W and E (y +2.4) with 8 void-corrupted statues (`tk_titan_statue`, violet veins), 28 rails; `tk_stalactite` x16 (void-crystal variant); `tk_banner_long` x6 torn banners (half-length, dark).
- Lights: void violet 2.0 / 14 (priority 2) at each lit rift, rune ring glow 0.55 / 0.7, the wheel's dead crystal pulses violet (emissive).
- VFX: `ambient_shadow_wisps` everywhere, `shadow_ground` under the open rifts, rift sparks (`hit_spark` violet), `curse_loop` on Void Corruption victims.
- Sound: `whisper` bed (the Speaker's voices, panned), `heartbeat_loop` tied to the Corruption stack count, reversed choir layer on `boss` (§2.9), `forge_heartbeat` for the Void Corruption cast.

### 3.8 Set pieces and how to build them

| # | Set piece | What happens | Build with | Status |
|---|---|---|---|---|
| 1 | Kehanet Taşı and start barrier | key insert, 10 s countdown, barrier on the start exit | `extras.fontOfPower`, `gp('font_of_power')` | EXISTS |
| 2 | **Hurda Yığınları** (trash set piece A) | piles within 6-7 m wake, 8-10 swarmers pour out | `PackDef.dormant {kind:'egg', wakeRadius}` + `tk_scrap_pile` props with tag `wake` | EXISTS (+ props) |
| 3 | **Deprem Totemi fitili** (trash set piece B) | a Stoneshaper plants a totem that explodes after 7 s: kill it or the non-tanks die | `summonAb` + `aoe` with `castTime 7`, `suicide`; proc body `earth_totem` | EXISTS (+ SP-15 model) |
| 4 | **Çark Çukuru** (hub chasm and bridges) | cross the bridges over a 3 m deep lava chasm, knockbacks (Omuz Darbesi, Kaya Fırlat splash) can throw a player off, falls cost 25 % HP and a respawn at the last safe tile; periodic lava plumes | `ZoneDef` lava `y -3 fall` + bridge decks + `HazardDef lava_burst` | EXISTS zones, NEW SP-23 (fall rule, deck/pit heights; heights from SP-22); wheel spin SP-16 |
| 5 | Patrolling Despoilers | `p14` laps the rail ring around the pit (about 70 s), `p25` paces the east hall lane; neither passes within 4 tiles of another pack | `PackDef.patrol` | EXISTS |
| 6 | Order-gated doors | wings need Seda, Eirich needs everything | `DoorDef.gate` + `BossPlacement.order` | EXISTS |
| 7 | **Maden Arabası** (mine carts, the dungeon's lifts) | after a wing boss, the cart carries the party to the hub in about 5 s: from Makinistler 2.4 m down, from Skarmorak 2.4 m up | NEW interactable | NEW SP-13 (+ SP-22 for the ride height) |
| 8 | **Usta Örsü** | one-use 10 min buff for Barbarians and blacksmiths before the Machinists | NEW interactable | NEW SP-14 |
| 9 | Eski Raylar skip | stealthed swarm in a service tunnel that climbs 1.2 m | room `skip: true`, `PackDef.stealth` | EXISTS |
| 10 | Boss mechanic entities | spikes, shards, fragments, scrap cube, magma blobs, void rifts | `spawnMech(c, 'proc_*')` + `makeInvulnerable` | EXISTS pattern, new defs (SP-15) |
| 11 | Efsunlu Yarık spots | 6 rift spots outside the boss arenas | `extras.riftSpots` | EXISTS |
| 12 | Shrines, chests | Kudret (hub), Koruma (Titan), 2 chests | `extras.shrines`, `extras.chests` | EXISTS |
| 13 | Void rifts (kill zones) | within 3 m = death, cleanse spots for Void Corruption | persist shapes + `tk_void_rift` + cleanse | EXISTS pattern + SP-06 + SP-08 |
| 14 | **Büyük Merdiven and Büyük İniş** | the grand staircase from the start terrace and the 32 m descent to Eirich | slope strips S1 and S8 (§3.2b) | NEW SP-22 |
| 15 | **Galleries, chandeliers, banners** | non-walkable upper ledges, hanging lens/forge chandeliers, long banners, Titan statues: the "tall hall" read | `RoomDef.galleries` + props at absolute y | NEW SP-22 (flat fallback: props only) |
| 16 | **Posture breaks** (Elden Ring layer) | elites and bosses have a posture bar (poise); a break opens a stagger window (stun, +25 % damage, a Kritik Vuruş riposte) | `EnemyDef.poise`, Combat stagger, `BossController.stagger` | EXISTS (bar, break, riposte); scripted reaction hooks NEW (SP-24) |

**SP-13 spec: `TransitCart`** (new interactable `src/entities/interactables/TransitCart.ts`, exported from `index.ts`, built by `DungeonScene` from `DungeonDef.extras.transits`).
```ts
extras.transits?: { id: string; pos: [number, number]; dest: [number, number]; destFacing?: number;
                    path?: [number, number][]; requiresBossDead: string; label?: string }[];
```
- `requiresBossDead` is a boss id or a group id (`makinistler` = both). Until then the label is grey: "Arabayı bekliyor"; in combat: "Savaşta kullanılamaz".
- Host-validated. `F` within 3.5 m: every living party member within 12 m boards (up to 5). While riding: `invulnerable` + `act_root`, ride time = polyline length / 14 m/s (4-6 s), a `tk_mine_cart` model follows the Catmull-Rom path (visual), **its y follows the heightfield under the path plus 0.4 m (SP-22), so the ride visibly drops or climbs 2.4 m**, camera follows it, rail clatter SFX loop. On arrival the host places players on 5 slots (r 1.5) around `dest` facing `destFacing`, VFX `blink`. Dead players are not carried.
- Net: host broadcasts `transit {id, t0, pids}`, clients play the camera locally, positions are applied as a teleport (`Interpolator.SNAP_DIST`). Fallback: 0.5 s fade + instant teleport.
- Taşkasa data: `cart_bati` pos (5.5, 38.2) -> dest (19.5, 57.8), path `[[5.5,38.2],[5.5,43],[7,49],[11,51.5],[15.5,51.5],[19,55],[19.5,57.8]]`, requires `makinistler`, destFacing 90. `cart_dogu` pos (64.5, 38.2) -> dest (51.5, 57.8), path `[[64.5,38.2],[65.5,42],[65.5,46],[62,50.5],[58.5,51.5],[55.5,51.5],[52,55],[51.5,57.8]]`, requires `boss_skarmorak`, destFacing -90. Both destinations are on the hub flanks, 3.9 tiles (15.6 m) or more from the nearest pack centre (p08 for the west cart, p11 for the east one), outside the 9-12 m aggro even when a skipped pack is still alive (Route B), and every flank pack is cleared by Route A before the wings.

**SP-14 spec: `BuffStation`** (`src/entities/interactables/BuffStation.ts`, from `extras.stations`).
```ts
extras.stations?: { id: string; pos: [number, number]; buff: StatusId; duration: number; once: 'player' | 'run';
                    requires?: { classIds?: ClassId[]; profession?: { id: ProfessionId; skill: number } }; hint: string }[];
```
Taşkasa: `usta_orsu` at (7.5, 58.2), buff `iron_ingot` (+10 % Çok Yönlülük, falls back to +6 % damage dealt and -3 % damage taken until the versatility rating exists), 600 s, lost on death, `once: 'player'`, `requires { classIds: ['barbarian'], profession: { id: 'smith', skill: 25 } }` (either one). Others see the hint "Usta Örsü: yalnızca Barbarlar ve usta Demirciler kullanabilir." Re-usable by other stations in the pool (the Büyücüler Terası arcane tome).

### 3.9 Data skeleton (paste into `src/data/dungeons/taskasa.ts`)

Layout is generated from the verified tables; decoration goes in `taskasa_decor.ts` (§8, TK-D). Use the fallback styles until SP-12 and the flat mode until SP-22 (drop `floorY`, `ceiling`, `slopes`, `terraces`, `galleries` keys, the rest is unchanged).

```ts
const ROOMS: RoomDef[] = [
  room('giris', 'Kasa Eşiği', 28, 74, 16, 10, 'stone_dark', 'forge', 0.3),
  room('yaklasim', 'Muhafız Yaklaşımı', 22, 62, 28, 12, 'stone_dark', 'forge', 0.45),
  room('maden_ambari', 'Madenci Ambarı', 10, 64, 12, 8, 'dirt', 'cave', 0.6, { optional: true }),
  room('ray_gecidi', 'Eski Raylar', 8, 60, 4, 4, 'dirt', 'cave', 0.3, { skip: true }),
  room('merkez', 'Merkezi İşleme', 16, 44, 40, 18, 'stone_dark', 'forge', 0.3),
  room('k_bati', 'Batı Maden Yolu', 10, 50, 6, 4, 'stone_dark', 'forge', 0.4),
  room('dokum_girisi', 'Şarkı Söyleyen Dökümhane', 0, 44, 10, 16, 'lava_rock', 'forge', 0.5),
  room('k_dokum', 'Örs Geçidi', 4, 40, 4, 4, 'stone_dark', 'forge', 0.3),
  room('makinist_odasi', 'Makinistler Salonu', 0, 28, 12, 12, 'tiles', 'forge', 0.15, { boss: 2 }),
  room('k_dogu', 'Doğu Maden Yolu', 56, 50, 6, 4, 'stone_dark', 'forge', 0.4),
  room('pota_girisi', 'Pota Girişi', 62, 44, 10, 16, 'lava_rock', 'cave', 0.5),
  room('k_pota', 'Kor Geçidi', 64, 40, 4, 4, 'dirt', 'cave', 0.3),
  room('skarmorak_odasi', 'Kristal Kazanı', 58, 26, 14, 14, 'lava_rock', 'cave', 0.15, { boss: 2 }),
  room('k_edna', 'Otomat Geçidi', 34, 40, 4, 4, 'stone_dark', 'forge', 0.3),
  room('edna_odasi', 'Savunma Çekirdeği', 27, 26, 18, 14, 'tiles', 'forge', 0.15, { boss: 1 }),
  room('titan_koridoru', 'Titan Tünelleri', 24, 18, 24, 8, 'stone_dark', 'temple', 0.4),
  room('fisilti_salonu', 'Fısıltı Salonu', 24, 0, 24, 18, 'tiles', 'temple', 0.1, { boss: 3 }),
].map((r) => ({ ...r, ...ROOM_EXTRA[r.id] }));   // ROOM_EXTRA of §3.6 carries floorY, ceiling, slopes, terraces, galleries, zones, hazards, fog

const DOORS: DoorDef[] = [
  door('giris', 'yaklasim', 35, 74, 'n', 2, 'none'),
  door('yaklasim', 'merkez', 34, 62, 'n', 4, 'none'),
  door('yaklasim', 'maden_ambari', 22, 66, 'w', 2, 'none'),
  door('maden_ambari', 'ray_gecidi', 10, 64, 'n', 2, 'none'),
  door('ray_gecidi', 'dokum_girisi', 8, 60, 'n', 2, 'none'),
  door('merkez', 'k_bati', 16, 51, 'w', 2, 'none'),
  door('k_bati', 'dokum_girisi', 10, 51, 'w', 2, 'none'),
  door('dokum_girisi', 'k_dokum', 5, 44, 'n', 2, 'none'),
  door('k_dokum', 'makinist_odasi', 5, 40, 'n', 2, 'boss_lock'),
  door('merkez', 'k_dogu', 55, 51, 'e', 2, 'none'),
  door('k_dogu', 'pota_girisi', 61, 51, 'e', 2, 'none'),
  door('pota_girisi', 'k_pota', 65, 44, 'n', 2, 'none'),
  door('k_pota', 'skarmorak_odasi', 65, 40, 'n', 2, 'boss_lock'),
  door('merkez', 'k_edna', 35, 44, 'n', 2, 'none'),
  door('k_edna', 'edna_odasi', 35, 40, 'n', 2, 'boss_lock'),
  door('edna_odasi', 'titan_koridoru', 35, 26, 'n', 2, 'boss_exit'),
  door('titan_koridoru', 'fisilti_salonu', 35, 18, 'n', 2, 'boss_lock'),
];

const BOSSES = [
  bossAt('boss_seda', 'edna_odasi', 35.5, 30, 0, 1),
  bossAt('boss_skarmorak', 'skarmorak_odasi', 64.5, 30.5, 0, 2),
  bossAt('boss_dorlita', 'makinist_odasi', 6, 31.5, 0, 2),   // + group: 'makinistler' (SP-07)
  bossAt('boss_brokk', 'makinist_odasi', 4, 30, 0, 2),       // + group: 'makinistler' (SP-07)
  bossAt('boss_eirich', 'fisilti_salonu', 35.5, 6.5, 0, 3),
];

const START: [number, number] = [35.5, 80.5];   // facing 180
const FONT: [number, number] = [35.5, 77.8];
const EXIT: [number, number] = [35.5, 3.5];

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(35.5, 77.8),
  shrines: [{ type: 'shrine_power', pos: pt(22.5, 60.3) }, { type: 'shrine_ward', pos: pt(31.0, 24.3) }],
  riftSpots: ([[27.5, 67.5], [22.5, 53.5], [48.5, 53.5], [66.8, 49.2], [7.5, 53.2], [35, 22]] as [number, number][]).map(([x, z]) => pt(x, z)),
  chests: [{ pos: pt(47.5, 71.8), kind: 'chest_wood' }, { pos: pt(20.5, 64.5), kind: 'chest_gold' }],
  // NEW (SP-13, SP-14): transits and stations, data in 3.8; NEW (SP-19): affixSafe, (SP-11): bossAnchors
};

export const TASKASA: DungeonDef = {
  id: 'taskasa', name: 'Taşkasa', shortName: 'Kasa', lore: '<§1.1>', levelRange: [56, 60],
  timerSec: 1800, forcesRequired: 400, theme: THEME, grid: { w: 72, h: 84 },
  rooms: ROOMS, doors: DOORS, packs: PACKS, bosses: BOSSES, start: { pos: shPt(START[0], START[1]), facing: 180 }, exit: { pos: shPt(EXIT[0], EXIT[1]) },
  extras: EXTRAS, loadingImage: '/assets/loading/taskasa.png',
};
```

`BOSS_ANCHORS` entry (add to `src/dev/contentCheck.ts`, SP-11), props with these ids must stand exactly at these coordinates:

```ts
taskasa: {
  vent_1: [1.5, 29.5], vent_2: [9.5, 29.5], vent_3: [1.5, 37.5], vent_4: [9.5, 37.5],
  scrap_block_1: [1.0, 33.5], scrap_block_2: [10.0, 33.5], scrap_cube: [5.5, 33.5],
  shard_spot_1: [60.5, 29.5], shard_spot_2: [68.5, 29.5], shard_spot_3: [64.5, 35.5],
  shard_spot_4: [60.5, 36.5], shard_spot_5: [68.5, 36.5], shard_spot_6: [64.5, 27.5],
  rift_spot_1: [26.5, 9], rift_spot_2: [44.5, 9], rift_spot_3: [28.5, 3], rift_spot_4: [42.5, 3], rift_spot_5: [26.5, 14], rift_spot_6: [44.5, 14],
},
```

**Content-check additions for this dungeon (SP-11)**, all enforced by `node tools/content-check.mjs taskasa`:
- **P-spacing (new):** two packs that the pull plan treats as separate stand at least 5 tiles (20 m) apart unless they are listed in each other's `linkedTo` (`PackDef.linkedTo?: string[]`, metadata only). Taşkasa links `tk_p29`+`tk_p30` (4.0 tiles, the Titan Katliam) and `tk_p32`+`tk_p33`+`tk_p34` (the optional Ambar cluster).
- **P-patrol (new):** every segment of a `PackDef.patrol` path stays at least **4 tiles** (hard minimum 3) from the centre of every *other* pack, and no hand-placed collide prop lies within 1.2 tiles of a patrol segment. Measured for Taşkasa: p14 (the hub rail ring, 46 tiles, laps in about 71 s) is 4.5 tiles or more from p05, p07, p09, p12, p13, p15; p25 (the east lane, 11 tiles) is 5.0 tiles or more from p22, p23, p24, p26.
- **V1-V6 (new):** the vertical rules of §3.2b.
- **Margin:** every pack inside its room with a 1 tile margin; **forces:** 498 total, 428 non-optional, per-pack `forces` equals the roster sum.

---

## 4. Trash

12 trash defs + 1 summoned support def (`tk_totem`), 125 enemies in 35 packs. Model and ability design follow the Stonevault roster (Cursedheart Invader, Ghastly Voidsoul, Repurposed Loaderbot, Void Bound Howler, Turned Speaker, Forgebound Mender, Forge Loader, Cursedforge Honor Guard, Rock Smasher, Cursedforge Stoneshaper, Void Bound Despoiler, Earthbreaker Totem) plus one swarm (Hurda) for the ARPG density rule (GDD_CONTENT §1.1). The Aspiring Forgehand's stacking tank debuff lives on the Loaderbot (status `fracture`).

**The "light Elden Ring" layer (CORE_MECHANICS §16, binding).** Every type has **2 to 4 attacks, every one telegraphed**. The windup of every instant (non-cast) damaging attack follows one rule:

> `windup = clamp(0.45 + 0.25 x coef, 0.45, 1.2)` seconds, **as a minimum** (coef 1.0 -> 0.70 s, 2.0 -> 0.95 s, 3.0 and above -> 1.2 s). Cast-time abilities (`castTime`, the interruptible ones) use their cast time, which is always at least this value. A *delayed swing* keeps the telegraph visible and holds the blow 0.4 to 0.6 s longer (`params.delay` = the total time to impact, EXISTS in `EnemyAI`). A *string* chains 2 or 3 hits, each with its own telegraph (`params.chain`, NEW SP-24, fallback in §8.2).

This replaces the older GDD_CONTENT §0.6 table (0.6 s trash, 0.8 s above coef 2, 1.2 s above coef 4), which the formula never undercuts. **Elites have a posture bar** (`EnemyDef.poise`, EXISTS in `src/combat/poise.ts`): damage, heavy hits and parries fill it, a break cancels the current windup, stuns (stagger break, `isStaggerBroken`: +25 % damage taken) and opens the Kritik Vuruş riposte (12 % of an elite's max HP, extra). Trash has 24 poise (swarm 6) and flinches. Elites below 30 % HP **enrage**: +30 % damage, red `enrage_aura`, windups unchanged so the telegraphs stay readable.

Flags in the tables: **K2 / K1** = must-kick / spare-kick (`EnemyAbility.kick`), **D** = the debuff must be dispelled/cleansed, **F** = frontal / line (point away from the group), **P** = perilous (dodge only), **T** = tank buster, **S** = string (multi-hit), **DS** = delayed swing, **J** = jump / leap attack. All numbers are multipliers on the level-60 baseline.

### 4.1 Roster

Resist profiles used below: `R_EARTHEN = { physical 0.15, fire 0.25, frost 0.1, lightning -0.1, shadow 0.1 }`, `R_VOID = { physical 0.05, shadow 0.5, holy -0.25, arcane 0.1 }`, plus the existing `R_GOLEM`, `R_GHOST`, `R_CULT`.

Role mix per pack: kick-casters (sozcu, uluyan, ruh, istilaci, sekillendirici: 5 types, 6 must-kicks), a healer (onarici), brutes (yukleyici, with a stacking tank debuff), a swarm (hurda), and **four elites with a posture bar** (onur, ezici, dokum_yukleyici, yagmaci).

| id | Name (TR) | Rank / role | Model (tint, scale) | HP x / DMG x | Speed | Poise | Forces | Counts |
|---|---|---|---|---|---|---|---|---|
| `tk_hurda` | Hurda Kemiricisi | trash / swarm | `monsters/Spider`, tint `0xb08a50`, emissive `0xffb030` x0.45, scale 0.45 | 0.4 / 0.6 | 7.2 | 6 | 1 | 46 |
| `tk_sozcu` | Dönmüş Sözcü | trash / caster | KayKit `Mage`, tint `0xb89060`, staff only, scale 1.0 | 1.2 / 1.0 | 4.9 | 24 | 4 | 15 |
| `tk_onarici` | Dökümlü Onarıcı | trash / healer | KayKit `Rogue_Hooded`, tint `0xa88050`, weapons hidden, scale 1.0 | 1.3 / 0.9 | 5.2 | 24 | 4 | 8 |
| `tk_yukleyici` | Yeniden Görevlendirilmiş Yükleyici | trash / brute | `gen/creatures/golem_stone`, tint `0x9a8466`, emissive `0xffb030` x0.5, scale 0.55 | 1.5 / 1.1 | 5.2 | 36 (golem family) | 4 | 11 |
| `tk_uluyan` | Boşluğa Bağlı Uluyan | trash / caster | `itch/creatures/centipede`, tint `0x7a50b8`, emissive `0x7a3cff` x0.6, scale 0.9 | 1.1 / 1.1 | 5.4 | 24 | 5 | 5 |
| `tk_ruh` | Korkunç Boşluk Ruhu | trash / caster, flying | `monsters/Ghost`, tint `0x7a3cff`, opacity 0.7, scale 0.8 | 1.1 / 1.0 | 5.0 | 14 (ghost family) | 5 | 7 |
| `tk_istilaci` | Lanetli Yürek İstilacısı | trash / caster | KayKit `Mage`, tint `0x6a4a90`, wand only, scale 1.0 | 1.2 / 1.0 | 4.9 | 24 | 5 | 6 |
| `tk_sekillendirici` | Lanetli Taş Şekillendirici | trash / caster-summoner | `monsters/Goblin`, tint `0x9a8870`, scale 0.85 | 1.2 / 1.0 | 5.0 | 24 | 5 | 5 |
| `tk_onur` | Lanetli Dökümcü Onur Muhafızı | **elite** / shield tank | KayKit `Knight`, tint `0x9a8666`, `1H_Sword` + `Round_Shield`, scale 1.0 | 3.0 / 1.4 | 5.6 | **160** | 8 | 7 |
| `tk_ezici` | Kaya Ezici | **elite** / giant tank, CC-immune | `monsters/Giant`, tint `0x9a7e66`, scale 1.05 | 6.0 / 1.9 | 4.4 | **220** | 10 | 6 |
| `tk_dokum_yukleyici` | Döküm Yükleyici | **elite** / golem tank, CC-immune | `gen/creatures/golem_stone`, tint `0x5a5048`, emissive `0xff7a10` x0.55, scale 0.85 | 4.5 / 1.8 | 4.0 | **150** (golem family) | 10 | 4 |
| `tk_yagmaci` | Boşluğa Bağlı Yağmacı | **elite** / melee leaper | `monsters/Demon`, tint `0x6a4a9a`, emissive `0x7a3cff` x0.5, scale 1.05 | 4.0 / 1.7 | 5.8 | **120** | 9 | 5 |
| `tk_totem` (summoned) | Depremkıran Totemi | support, 0 forces | proc body `earth_totem` (SP-15) | 0.6 / 1.0 | 0 | none | 0 | - |

("Counts" = number of that enemy over all 35 packs, 125 in total, unchanged by the layout revision.) Hurda swarm HP is what makes Bolstering and Bursting readable: the horde rule (GDD_CONTENT §1.2) applies to `role: 'swarm'`.

**Dungeon-specific set pieces in the trash (two):** **(A) Hurda Yığınları**: brass scrap piles on the floor (`tk_scrap_pile`, tag `wake`) hold dormant swarms that pour out when a player comes within 6-7 m, so a pull is also a positional puzzle (p01, p11, p32, p35 stealth); **(B) Depremkıran Totemi fitili**: every Stoneshaper plants an Earthburst totem with a 7 s fuse that kills the non-tanks, a kill-it-in-time check that scales with how many Stoneshapers are alive. The hub adds a third, environmental one (the bridge knockback over the chasm, §3.8 row 4).

### 4.2 Abilities and must-answer sheet

`Windup` is the actual value used (never below the formula); `Impact times` are seconds from the start of the telegraph for strings. Cooldowns are `cd (first)`.

| Enemy | Ability (id, TR) | Windup / cast | Cd (first) | Shape | Damage / effect | Flags |
|---|---|---|---|---|---|---|
| `tk_hurda` | `tk_hurda_gnaw` Kemirme | 0.60 (coef 0.6) | 1.3 | cone 100 deg, 1.3 m | coef 0.6 | |
| `tk_hurda` | `tk_hurda_lunge` **Hurda Atılışı** | 0.65 (coef 0.8) | 7 (3) | leap up to 5 m at the target, landing circle r 1.2 (small ground telegraph) | coef 0.8 physical | **J** |
| `tk_hurda` | `tk_hurda_shrapnel` Hurda Şarapneli | on death, ring appears 0.55 s before it pops (coef 0.35) | - | self ring r 1.6 at the corpse | coef 0.35 physical | delayed ring, step off the corpse |
| `tk_sozcu` | `tk_sozcu_shard` Taş Kıymığı | 0.70 (coef 1.0) | 2.4 | projectile 16 m/s | coef 1.0 physical | |
| `tk_sozcu` | `tk_sozcu_gear` **Susturan Dişli** (Censoring Gear) | 2.0 cast | 14 (6) | projectile 18 m/s at a random non-tank | coef 0.8 + **silence 3 s** | **K2**, **D** (silence), interruptible |
| `tk_sozcu` | `tk_sozcu_staff` Asa Darbesi | 0.65 (coef 0.8) | 6 | cone 90 deg, 2.4 m (the caster punishes melee that ignores it) | coef 0.8 physical | |
| `tk_onarici` | `tk_onarici_bolt` Alaşım Okı | 0.70 (coef 0.9) | 2.6 | projectile | coef 0.9 physical | |
| `tk_onarici` | `tk_onarici_restore` **Metal Onarımı** (Restoring Metals) | 2.0 cast | 12 | heal ally 18 m | heals 40 % max HP | **K2**, interruptible |
| `tk_onarici` | `tk_onarici_alloy` **Alaşım Kıvılcımı** (Alloy Bolt) | 1.5 cast | 7 | projectile 18 m/s | coef 1.4 fire | **K1**, interruptible (spare kick) |
| `tk_yukleyici` | `tk_yukleyici_hit` **Kırıcı Çift** (Smashing Pair) | hit 1 at 0.70 (coef 1.0), hit 2 at 1.45 (coef 1.2) | 2.0 | cone 100 deg, 2.3 m, re-aimed | hit 1 adds a **Kırılma** stack (`fracture`, 10 s, +5 % damage taken per stack, max 10), hit 2 is plain damage | **S**, **T-check** (tank swap or kite) |
| `tk_yukleyici` | `tk_yukleyici_pounce` **Ezici Atılış** (Pulverizing Pounce) | **1.2** (coef 4.5, the 1.2 s rule above coef 4) | 11 (5) | circle r 3 on a random player, range 14, min range 5 | coef 4.5 physical, ground telegraph | **P**, **J**, target random |
| `tk_yukleyici` | `tk_yukleyici_shove` **Omuz Darbesi** | 0.85 (coef 1.6) | 12 (6) | cone 60 deg, 3 m | coef 1.6 + knockback 4 m (**hub: toward the chasm**) | face the shove away from the pit |
| `tk_uluyan` | `tk_uluyan_spit` Boşluk Fışkırması | 0.70 (coef 1.0) | 2.4 | projectile | coef 1.0 shadow | |
| `tk_uluyan` | `tk_uluyan_wail` **Delici Çığlık** (Piercing Wail) | 2.2 cast | 13 | self circle r 12 | coef 1.8 shadow, whole group | **K2**, interruptible |
| `tk_uluyan` | `tk_uluyan_burst` Boşluk Patlaması (Void Burst) | 1.5 cast | 9 (4) | circle r 4 on a random player | coef 1.4 shadow | dodge |
| `tk_ruh` | `tk_ruh_touch` Ruh Dokunuşu | 0.70 (coef 1.0) | 2.2 | projectile | coef 1.0 shadow | |
| `tk_ruh` | `tk_ruh_fear` **Uluyan Korku** (Howling Fear) | 2.0 cast | 16 (6) | self circle r 18 | **fear 3 s**, no damage | **K2**, **D** (fear), interruptible |
| `tk_ruh` | `tk_ruh_dive` Ruh Dalışı | 0.70 (coef 1.0) | 9 (4) | line 8 x 1.6 m through the target (it swoops, then returns to its hover height) | coef 1.0 shadow | dodge sideways |
| `tk_istilaci` | `tk_istilaci_bolt` Boşluk Oku | 0.70 (coef 1.0) | 2.4 | projectile | coef 1.0 shadow | |
| `tk_istilaci` | `tk_istilaci_arc` **Yay Boşluk** (Arcing Void) | 2.0 cast | 12 (5) | projectile 20 m/s at a random player | coef 1.4 shadow + **Boşluk Enfeksiyonu** (`void_infection`: 10 s, shadow DoT 0.5 coef/s) | **K2**, **D** (curse), interruptible |
| `tk_sekillendirici` | `tk_sekil_pebble` Taş Mermisi | 0.70 (coef 1.0) | 2.4 | projectile | coef 1.0 physical | |
| `tk_sekillendirici` | `tk_sekil_bolt` **Taş Oku** (Stone Bolt) | 1.8 cast | 9 (3) | projectile 18 m/s | coef 2.0 physical | **K2**, interruptible |
| `tk_sekillendirici` | `tk_sekil_totem` Depremkıran Totemi | 1.2 cast | 22 (8) | summons `tk_totem` within 5 m | the totem explodes after 7 s | kill the totem |
| `tk_totem` | `tk_totem_burst` Deprem Patlaması (Earthburst) | **7.0 cast** | once | self circle r 12, perilous | coef 7.0 physical, kills non-tanks | kill within 7 s (HP 0.6) |
| `tk_onur` | `tk_onur_slash` **Kılıç Üçlüsü** | hit 1 at 0.70 (coef 1.0), hit 2 at 1.40 (coef 1.0), **hit 3 delayed** at 2.70 (coef 1.6, windup 0.85 + 0.45 hold) | 2.6 | cone 100 deg, 2.6 m (hit 3: 2.8 m), re-aimed each hit | 3 hits, hit 3 is the heavy one | **S**, **DS**: do not roll on the second hit's sound, roll on the *late* third |
| `tk_onur` | `tk_onur_stance` Kalkan Duruşu | passive | - | frontal 120 deg | -50 % damage and -50 % poise damage from the front | attack from behind |
| `tk_onur` | `tk_onur_stampede` **Kalkan Hücumu** (Shield Stampede) | 1.10 (coef 2.4) | 14 (6) | charge line 12 x 2 m (arrow telegraph) | coef 2.4 + **stun 1.5 s** | **F**, pull them against a wall so the run is short |
| `tk_onur` | `tk_onur_bash` **Kalkan Patlatması** (Guard Break) | 0.80 (coef 1.4) | 15 (8) | cone 70 deg, 3 m | coef 1.4 + knockback 3 m + **interrupts the target's cast**, no block | **F**, parry it (parry poise 60) |
| `tk_ezici` | `tk_ezici_smash_basic` **Ezme ve Sırt** | hit 1 at 0.70 (coef 1.0), hit 2 at 1.45 (coef 1.2) | 2.8 | cone 110 deg, 3.4 m (hit 2 is a backhand, same cone mirrored) | 2 hits | **S** |
| `tk_ezici` | `tk_ezici_rock` **Kaya Fırlat** (Smash Rock) | 1.20 (coef 1.8, delayed by design) | 8 (3) | circle r 3.5 on a random player, range 16 | coef 1.8, **+25 % per use** (ramp, max +150 %, resets out of combat) | dodge, kill fast |
| `tk_ezici` | `tk_ezici_eruption` **Granit Patlaması** (Granite Eruption) | 2.5 cast | 24 (12) | self circle r 7 | coef 3.5 physical | **P**, lethal at high keys |
| `tk_ezici` | `tk_ezici_stomp` **Yer Tepmesi** (Stone Leap) | 1.10 (coef 2.6) | 20 (10) | leaps up to 10 m onto the tank (or the target), landing circle r 4.5 | coef 2.6 physical + **stun 1 s** (a poise hit on the Smasher interrupts the leap) | **J**, step out of the circle |
| `tk_dokum_yukleyici` | `tk_dl_scoop` **Kepçe Üçlüsü** | hit 1 at 0.70 (coef 1.0), hit 2 at 1.40 (coef 1.0, opposite sweep), **hit 3 delayed** at 2.90 (coef 2.2 slam, windup 1.0 + 0.5 hold) | 2.8 | cones 100 deg, 3.2 m, then a circle r 3 in front | 3 hits | **S**, **DS** |
| `tk_dokum_yukleyici` | `tk_dl_cannon` **Lav Topu** (Lava Cannon) | 1.60 (coef 2.6) | 10 (5) | line 20 x 2.4 m | coef 2.6 fire | **F** |
| `tk_dokum_yukleyici` | `tk_dl_mortar` **Erimiş Havan** (Molten Mortar) | 1.40 (coef 0.8) | 12 (8) | 2 circles r 2.5 on 2 random players, leave fire 6 s | coef 0.8 + burn stacks, persist 0.6/s | spread; two Loaders together are deadly |
| `tk_yagmaci` | `tk_yag_claw_basic` **Boşluk Pençe Çifti** | hit 1 at 0.75 (coef 1.2), hit 2 at 1.50 (coef 1.2) | 2.4 | cone 100 deg, 2.8 m, re-aimed | 2 hits shadow | **S** |
| `tk_yagmaci` | `tk_yag_shadowclaw` **Gölge Pençesi** (Shadow Claw) | 1.20 (coef 3.4) | 11 (5) | cone 60 deg, 4 m | coef 3.4 shadow + bleed 8 s | **T** (defensive) |
| `tk_yagmaci` | `tk_yag_outburst` **Boşluk Taşkını** (Void Outburst) | 1.60 (coef 1.6) | 15 (8) | self circle r 9 | coef 1.6 shadow, whole group | stay out / defensive; **one per pull** |
| `tk_yagmaci` | `tk_yag_leap` **Boşluk Sıçrayışı** (Void Pounce) | 0.95 (coef 2.0) + 0.40 hold, impact at 1.35 | 16 (7) | leap up to 10 m onto a random player, landing circle r 2.5 (the circle locks 0.4 s before) | coef 2.0 shadow + **grab-stun 1 s** if hit | **J**, **DS** |

**Must-kick list (K2):** Susturan Dişli, Metal Onarımı, Delici Çığlık, Uluyan Korku, Yay Boşluk, Taş Oku. **Spare kick (K1):** Alaşım Kıvılcımı. **Must-dispel (D):** Boşluk Enfeksiyonu (curse), silence of the Dişli, Uluyan Korku's fear. **Frontals / lines:** Kalkan Hücumu, Kalkan Patlatması, Lav Topu, Granit Patlaması (circle), Pulverizing Pounce (circle). **Strings:** Kırıcı Çift, Kılıç Üçlüsü, Ezme ve Sırt, Kepçe Üçlüsü, Boşluk Pençe Çifti (each plays a distinct clip per hit so the rhythm is readable). **Delayed swings:** the third hits of Kılıç Üçlüsü and Kepçe Üçlüsü, Kaya Fırlat, Boşluk Sıçrayışı. **Jumps and leaps:** Hurda Atılışı, Ezici Atılış, Yer Tepmesi, Boşluk Sıçrayışı. **Stuns:** Kalkan Hücumu, Yer Tepmesi, Boşluk Sıçrayışı. **Kill-fast:** Depremkıran Totemi (7 s fuse).

**Posture play on the elites (for the HUD notes and the QA bot):** a Honor Guard breaks in about 10 s of normal melee but its frontal stance halves the poise damage, so the break comes from behind or from a parry of Kalkan Patlatması (60 poise); a Rock Smasher (220) is the hardest to break, a break inside its Granit Patlaması cast cancels the cast; a Forge Loader (150) breaks mid-string and loses the delayed slam; a Despoiler (120) breaks fastest and its break cancels a leap in flight. A broken elite takes +25 % damage for the window and gives the Kritik Vuruş (12 % max HP).

### 4.3 Enemy definitions (sketch for `src/data/enemies/taskasa.ts`, builders from the enemy kit exported by SP-01, `src/data/enemyKit.ts`, §8.2)

String params (SP-24): `params: { chain: n, t2, c2, t3, c3 }` = n follow-up hits, impact times `t2`/`t3` in seconds from the telegraph start, coefficients `c2`/`c3`; each follow-up re-aims the shape at the target 0.3 s before its impact. `delay` = total time to impact (EXISTS).

```ts
const R_EARTHEN: EnemyDef['resist'] = { physical: 0.15, fire: 0.25, frost: 0.1, lightning: -0.1, shadow: 0.1 };
const R_VOID: EnemyDef['resist'] = { physical: 0.05, shadow: 0.5, holy: -0.25, arcane: 0.1 };

add({ id: 'tk_hurda', name: 'Hurda Kemiricisi', model: MON('Spider'), scale: 0.45, tint: 0xb08a50, emissive: 0xffb030, role: 'swarm', rank: 'trash', hp: 0.4, dmg: 0.6, speed: 7.2, radius: 0.35, aggro: 9, forces: 1,
  anims: A_SPIDER, resist: R_EARTHEN, visual: { emissiveIntensity: 0.45, eyeEmissive: 0xffd54a },
  basic: cone('tk_hurda_gnaw', 'Kemirme', 1.3, 100, 1.3, 0.6, 'Spider_Attack', 0.42, { windup: 0.6 }),
  abilities: [
    aoe('tk_hurda_lunge', 'Hurda Atılışı', 'ground_aoe', 1.2, 5, 7, 0.65, 0.8, 'physical', 'Spider_Attack', 0.42, { initialCooldown: 3, telegraph: true, params: { target: 1, leap: 1 } }),
    onDeath(aoe('tk_hurda_shrapnel', 'Hurda Şarapneli', 'self_aoe', 1.6, 0, 0, 0.55, 0.35, 'physical', '', 0, { telegraph: true, vfx: 'hit_spark' })),   // ring shows 0.55 s at the corpse before it pops
  ] });

add({ id: 'tk_sozcu', name: 'Dönmüş Sözcü', model: CHAR('Mage'), scale: 1, tint: 0xb89060, role: 'caster', rank: 'trash', hp: 1.2, dmg: 1.0, speed: 4.9, radius: 0.55, aggro: 12, forces: 4,
  anims: A_KAYKIT, resist: R_EARTHEN, ai: { kite: [9, 15] }, visual: { hide: mageHide('2H_Staff'), eyeEmissive: 0xffd54a, runRef: 7 },
  basic: proj('tk_sozcu_shard', 'Taş Kıymığı', 16, 18, 2.4, 0.7, 1.0, 'physical', 'rock_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    proj('tk_sozcu_gear', 'Susturan Dişli', 18, 18, 14, 2.0, 0.8, 'physical', 'bolt_projectile', 'Spellcast_Raise', 1.0,
      { initialCooldown: 6, castTime: 2.0, interruptible: true, kick: 2, statuses: [{ status: 'silence', duration: 3 }], params: { target: 3 } }),
    cone('tk_sozcu_staff', 'Asa Darbesi', 2.4, 90, 6, 0.8, '2H_Melee_Attack_Slice', 0.3, { windup: 0.65 }),
  ] });

add({ id: 'tk_onarici', name: 'Dökümlü Onarıcı', model: CHAR('Rogue_Hooded'), scale: 1, tint: 0xa88050, role: 'healer', rank: 'trash', hp: 1.3, dmg: 0.9, speed: 5.2, radius: 0.5, aggro: 12, forces: 4,
  anims: A_KAYKIT, resist: R_EARTHEN, ai: { kite: [8, 14] }, visual: { hide: ROGUE_HIDE, eyeEmissive: 0xffd54a, runRef: 7 },
  basic: proj('tk_onarici_bolt', 'Alaşım Okı', 16, 16, 2.6, 0.7, 0.9, 'physical', 'bolt_projectile', 'Throw', 0.4),
  abilities: [
    heal('tk_onarici_restore', 'Metal Onarımı', 2.0, 12, 0.4, 'Throw', 0.8, { kick: 2 }),
    proj('tk_onarici_alloy', 'Alaşım Kıvılcımı', 18, 16, 7, 1.5, 1.4, 'fire', 'fire_projectile', 'Throw', 0.8, { castTime: 1.5, interruptible: true, kick: 1 }),
  ] });

add({ id: 'tk_yukleyici', name: 'Yeniden Görevlendirilmiş Yükleyici', model: GEN('golem_stone'), scale: 0.55, tint: 0x9a8466, emissive: 0xffb030, role: 'melee', rank: 'trash', hp: 1.5, dmg: 1.1, speed: 5.2, radius: 0.7, aggro: 10, forces: 4,
  anims: A_GEN, resist: R_GOLEM, family: 'golem', visual: { emissiveIntensity: 0.5, runRef: 4.5 },
  basic: cone('tk_yukleyici_hit', 'Kırıcı Çift', 2.3, 100, 2.0, 1.0, 'Attack', 0.67, { windup: 0.7, statuses: [{ status: 'fracture', duration: 10, stacks: 1 }], params: { chain: 1, t2: 1.45, c2: 1.2 } }),
  abilities: [
    aoe('tk_yukleyici_pounce', 'Ezici Atılış', 'ground_aoe', 3, 14, 11, 1.2, 4.5, 'physical', 'Attack', 0.67, { initialCooldown: 5, perilous: true, telegraph: true, params: { target: 1, minRange: 5, leap: 1 } }),
    cone('tk_yukleyici_shove', 'Omuz Darbesi', 3, 60, 12, 1.6, 'Attack2', 0.57, { initialCooldown: 6, windup: 0.85, knockback: 4, telegraph: true }),
  ] });

add({ id: 'tk_uluyan', name: 'Boşluğa Bağlı Uluyan', model: ITCH('centipede'), scale: 0.9, tint: 0x7a50b8, emissive: 0x7a3cff, role: 'caster', rank: 'trash', hp: 1.1, dmg: 1.1, speed: 5.4, radius: 0.6, aggro: 12, forces: 5,
  anims: { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death' }, resist: R_VOID, ai: { kite: [8, 14] }, visual: { emissiveIntensity: 0.6, glow: 0x7a3cff },
  basic: proj('tk_uluyan_spit', 'Boşluk Fışkırması', 15, 16, 2.4, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Bite', 0.3),
  abilities: [
    aoe('tk_uluyan_wail', 'Delici Çığlık', 'self_aoe', 12, 12, 13, 2.2, 1.8, 'shadow', 'Threat', 1.0, { castTime: 2.2, interruptible: true, kick: 2, vfx: 'shadow_burst' }),
    aoe('tk_uluyan_burst', 'Boşluk Patlaması', 'ground_aoe', 4, 16, 9, 1.5, 1.4, 'shadow', 'Threat', 0.8, { castTime: 1.5, initialCooldown: 4, params: { target: 1 } }),
  ] });

add({ id: 'tk_ruh', name: 'Korkunç Boşluk Ruhu', model: MON('Ghost'), scale: 0.8, tint: 0x7a3cff, role: 'caster', rank: 'trash', hp: 1.1, dmg: 1.0, speed: 5.0, radius: 0.5, aggro: 11, forces: 5, flying: true,
  anims: A_FLY, resist: R_GHOST, ai: { kite: [8, 14] }, visual: { opacity: 0.7, eyeEmissive: 0xb080ff, hoverBob: 0.1 },
  basic: proj('tk_ruh_touch', 'Ruh Dokunuşu', 14, 18, 2.2, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Punch', 0.33),
  abilities: [
    aoe('tk_ruh_fear', 'Uluyan Korku', 'self_aoe', 18, 18, 16, 2.0, 0, 'shadow', 'No', 0.6,
      { castTime: 2.0, interruptible: true, kick: 2, initialCooldown: 6, statuses: [{ status: 'fear', duration: 3 }], vfx: 'shadow_burst', sfx: 'boss_cast' }),
    line('tk_ruh_dive', 'Ruh Dalışı', 8, 1.6, 9, 0.7, 1.0, 'shadow', 'Punch', 0.33, { initialCooldown: 4, vfx: 'shadow_burst' }),
  ] });

add({ id: 'tk_istilaci', name: 'Lanetli Yürek İstilacısı', model: CHAR('Mage'), scale: 1, tint: 0x6a4a90, role: 'caster', rank: 'trash', hp: 1.2, dmg: 1.0, speed: 4.9, radius: 0.55, aggro: 12, forces: 5,
  anims: A_KAYKIT, resist: R_VOID, ai: { kite: [9, 15] }, visual: { hide: mageHide('1H_Wand'), eyeEmissive: 0x9a5cff, runRef: 7 },
  basic: proj('tk_istilaci_bolt', 'Boşluk Oku', 16, 18, 2.4, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [proj('tk_istilaci_arc', 'Yay Boşluk', 20, 20, 12, 2.0, 1.4, 'shadow', 'shadow_projectile', 'Spellcast_Raise', 1.0,
    { castTime: 2.0, interruptible: true, kick: 2, initialCooldown: 5, statuses: [{ status: 'void_infection', duration: 10 }], params: { target: 1 } })] });

add({ id: 'tk_sekillendirici', name: 'Lanetli Taş Şekillendirici', model: MON('Goblin'), scale: 0.85, tint: 0x9a8870, role: 'caster', rank: 'trash', hp: 1.2, dmg: 1.0, speed: 5.0, radius: 0.5, aggro: 12, forces: 5,
  anims: A_ENEMY, resist: R_EARTHEN, ai: { kite: [9, 15] },
  basic: proj('tk_sekil_pebble', 'Taş Mermisi', 15, 16, 2.4, 0.7, 1.0, 'physical', 'rock_projectile', 'Attack', 0.37),
  abilities: [
    proj('tk_sekil_bolt', 'Taş Oku', 18, 18, 9, 1.8, 2.0, 'physical', 'rock_projectile', 'Attack', 0.37, { castTime: 1.8, interruptible: true, kick: 2, initialCooldown: 3 }),
    summonAb('tk_sekil_totem', 'Depremkıran Totemi', 'tk_totem', 1, 22, 'Attack', 0.37, { initialCooldown: 8, castTime: 1.2, interruptible: false, params: { radius: 5 } }),
  ] });

add({ id: 'tk_totem', name: 'Depremkıran Totemi', model: PROC('earth_totem'), scale: 1, role: 'support', rank: 'trash', hp: 0.6, dmg: 1.0, speed: 0, radius: 0.7, aggro: 0, forces: 0, ccImmune: true, xp: 0,
  anims: { idle: 'Idle', walk: 'Idle', run: 'Idle', death: 'Death' }, ai: { summoned: true, stationary: true }, basic: NOOP('tk_totem_none'),
  abilities: [aoe('tk_totem_burst', 'Deprem Patlaması', 'self_aoe', 12, 12, 99, 7.0, 7.0, 'physical', 'Idle', 0, { initialCooldown: 0, castTime: 7.0, interruptible: false, perilous: true, params: { suicide: 1 } })] });

add({ id: 'tk_onur', name: 'Lanetli Dökümcü Onur Muhafızı', model: CHAR('Knight'), scale: 1.0, tint: 0x9a8666, role: 'tank', rank: 'elite', hp: 3.0, dmg: 1.4, speed: 5.6, radius: 0.7, aggro: 11, forces: 8,
  poise: 160, anims: { ...A_KAYKIT, idle: 'Idle_Combat' }, resist: R_CULT,
  visual: { hide: KNIGHT_HIDE.filter((n) => !['1H_Sword', 'Round_Shield'].includes(n)), eyeEmissive: 0xffa030, runRef: 7 },
  basic: cone('tk_onur_slash', 'Kılıç Üçlüsü', 2.6, 100, 2.6, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.3, { windup: 0.7, params: { chain: 2, t2: 1.4, c2: 1.0, t3: 2.7, c3: 1.6 } }),   // hit 3 delayed: 0.85 windup + 0.45 hold
  abilities: [
    passive('tk_onur_stance', 'Kalkan Duruşu', { arc: 120, reduce: 0.5, poiseReduce: 0.5 }),
    charge('tk_onur_stampede', 'Kalkan Hücumu', 12, 14, 1.1, 2.4, 'Block_Attack', 0.4, { initialCooldown: 6, statuses: [{ status: 'stun', duration: 1.5 }], params: { minRange: 4, dash: 0.7 } }),
    cone('tk_onur_bash', 'Kalkan Patlatması', 3, 70, 15, 1.4, 'Block_Attack', 0.4, { initialCooldown: 8, windup: 0.8, telegraph: true, knockback: 3, params: { interrupt: 1 } }),
  ] });

add({ id: 'tk_ezici', name: 'Kaya Ezici', model: MON('Giant'), scale: 1.05, tint: 0x9a7e66, role: 'tank', rank: 'elite', hp: 6.0, dmg: 1.9, speed: 4.4, radius: 1.1, aggro: 10, forces: 10, ccImmune: true,
  poise: 220, anims: A_ENEMY, resist: R_GOLEM,
  basic: cone('tk_ezici_smash_basic', 'Ezme ve Sırt', 3.4, 110, 2.8, 1.0, 'Attack', 0.47, { windup: 0.7, params: { chain: 1, t2: 1.45, c2: 1.2 } }),
  abilities: [
    aoe('tk_ezici_rock', 'Kaya Fırlat', 'ground_aoe', 3.5, 16, 8, 1.2, 1.8, 'physical', 'Attack', 0.47, { initialCooldown: 3, params: { target: 1, ramp: 0.25, rampMax: 6 } }),
    aoe('tk_ezici_eruption', 'Granit Patlaması', 'self_aoe', 7, 7, 24, 2.5, 3.5, 'physical', 'Attack', 0.47, { initialCooldown: 12, castTime: 2.5, perilous: true, vfx: 'ground_slam' }),
    aoe('tk_ezici_stomp', 'Yer Tepmesi', 'ground_aoe', 4.5, 10, 20, 1.1, 2.6, 'physical', 'Attack', 0.47, { initialCooldown: 10, telegraph: true, statuses: [{ status: 'stun', duration: 1 }], params: { target: 0, leap: 1 } }),   // target 0 = the tank / current target
  ] });

add({ id: 'tk_dokum_yukleyici', name: 'Döküm Yükleyici', model: GEN('golem_stone'), scale: 0.85, tint: 0x5a5048, emissive: 0xff7a10, role: 'tank', rank: 'elite', hp: 4.5, dmg: 1.8, speed: 4.0, radius: 1.2, aggro: 10, forces: 10, ccImmune: true,
  family: 'golem', anims: A_GEN, resist: { ...R_GOLEM, fire: 0.9 }, visual: { emissiveIntensity: 0.55, runRef: 3.4 },
  basic: cone('tk_dl_scoop', 'Kepçe Üçlüsü', 3.2, 100, 2.8, 1.0, 'Attack', 0.67, { windup: 0.7, params: { chain: 2, t2: 1.4, c2: 1.0, t3: 2.9, c3: 2.2 } }),   // hit 3 = delayed slam (circle r 3 in front)
  abilities: [
    line('tk_dl_cannon', 'Lav Topu', 20, 2.4, 10, 1.6, 2.6, 'fire', 'Attack2', 0.57, { initialCooldown: 5, vfx: 'fire_burst' }),
    aoe('tk_dl_mortar', 'Erimiş Havan', 'ground_aoe', 2.5, 18, 12, 1.4, 0.8, 'fire', 'Attack2', 0.57,
      { initialCooldown: 8, statuses: [burn(0.3, 8)], params: { target: 1, count: 2, persist: 6, persistCoef: 0.6, tick: 1 } }),   // params.count = 2 random players (SP-17)
  ] });

add({ id: 'tk_yagmaci', name: 'Boşluğa Bağlı Yağmacı', model: MON('Demon'), scale: 1.05, tint: 0x6a4a9a, emissive: 0x7a3cff, role: 'melee', rank: 'elite', hp: 4.0, dmg: 1.7, speed: 5.8, radius: 0.8, aggro: 11, forces: 9,
  poise: 120, anims: A_ENEMY, resist: R_VOID, visual: { emissiveIntensity: 0.5, eyeEmissive: 0xb080ff },
  basic: cone('tk_yag_claw_basic', 'Boşluk Pençe Çifti', 2.8, 100, 2.4, 1.2, 'Attack', 0.37, { windup: 0.75, damage: { coef: 1.2, type: 'shadow' }, params: { chain: 1, t2: 1.5, c2: 1.2 } } as Ab),
  abilities: [
    cone('tk_yag_shadowclaw', 'Gölge Pençesi', 4, 60, 11, 3.4, 'Attack', 0.37, { initialCooldown: 5, windup: 1.2, telegraph: true, tankBuster: true, parryable: false,
      damage: { coef: 3.4, type: 'shadow' }, statuses: [bleed(1, 0.25, 8)] } as Ab),
    aoe('tk_yag_outburst', 'Boşluk Taşkını', 'self_aoe', 9, 9, 15, 1.6, 1.6, 'shadow', 'Attack', 0.37, { initialCooldown: 8, vfx: 'shadow_burst' }),
    aoe('tk_yag_leap', 'Boşluk Sıçrayışı', 'ground_aoe', 2.5, 10, 16, 0.95, 2.0, 'shadow', 'Attack2', 0.37, { initialCooldown: 7, telegraph: true, statuses: [{ status: 'stun', duration: 1 }], params: { target: 1, leap: 1, delay: 1.35 } }),
  ] });
```

New statuses these defs need (`StatusDef` in `data/statuses.ts` + `STATUS_RULES`, `StatusId` union in `types/skills.ts`, SP-09 / SP-21): `fracture` Kırılma (debuff, `maxStacks 10`, 10 s, **+5 % damage taken per stack**: needs the new rule field `takenMorePerStack`, SP-09), `void_infection` Boşluk Enfeksiyonu (debuff, 10 s, `dotType 'shadow'`, 0.5 coef/s, `dispellable: true`). New ability params (SP-17 and SP-24): `ramp` / `rampMax` (coef grows by `ramp` per use, capped at `rampMax` uses, resets on leave combat), `count` (number of distinct random targets of a ground AoE), `chain` / `t2` / `c2` / `t3` / `c3` (strings), `interrupt` (the hit interrupts the target's cast). `leap`, `delay`, `minRange` already exist in `EnemyAI` (`params.leap`, `params.delay`).

### 4.4 Packs

Standard member offsets from the layout generator are used: front line (elites, melee, swarm) `(0.3,0) (-0.38,0.35) (0.06,-0.66) (0.48,0.62) (-0.88,-0.16) (0.83,-0.53) (-0.28,1.03) (-0.53,-1.02) (1.15,0.42) (-1.2,0.49)`, back line (casters, healers) `(1.1,-0.75) (1.35,0.1) (0.95,0.9)`. Elites stand in front. `forces` of each pack is the roster sum (content-check requires equality). Positions are continuous tile coordinates, all inside their rooms with a 1 tile margin.

**Layout revision rules (from the review).** (1) Packs that the pull plan treats as separate stand **at least 5 tiles (20 m) apart**: aggro is 9 to 12 m and a pack links its members within about 4 m, so 20 m keeps a neighbour out of a pull. Only two groups are deliberately closer and carry `linkedTo` (and `big`): **p29 + p30** (4.0 tiles, the Titan Katliam) and **p32 + p33 + p34** (the optional Ambar cluster). (2) **Patrol paths stay at least 4 tiles (16 m) from every other pack centre** (hard minimum 3), see §3.9 P-patrol. (3) The nine hub packs were rebuilt around that rule: the eight static packs sit on the **west and east flanks** (x 18.5-25 and x 46-52.5, four per side, 7.6 to 8.5 tiles apart), the patrol p14 runs the **rail ring** between them.

| Pack | Room | Centre | Composition | Forces | Notes |
|---|---|---|---|---|---|
| `tk_p01` | yaklasim | 25.5, 70 | 8x hurda + onarici | 12 | dormant `egg` (scrap piles, wake 6 m) |
| `tk_p02` | yaklasim | 30.5, 66 | 2x yukleyici + sozcu | 12 |  |
| `tk_p03` | yaklasim | 40.5, 70.5 | 2x yukleyici + uluyan | 13 |  |
| `tk_p04` | yaklasim | 41.5, 65.5 | 4x hurda + istilaci + ruh | 14 | big (gate pull with p05) |
| `tk_p05` | yaklasim | 35.5, 64.5 | onur + sekillendirici | 13 | gate guards in front of the hub gate |
| `tk_p06` | merkez | 18.5, 45.5 | yukleyici + onarici + 2x sozcu | 16 | hub west flank, north-west corner |
| `tk_p07` | merkez | 25, 58.5 | istilaci + ruh + uluyan | 15 | hub west flank, south-west: three must-kicks |
| `tk_p08` | merkez | 18.5, 54 | dokum_yukleyici + yukleyici | 14 | big, hub west flank (Forge Loader) |
| `tk_p09` | merkez | 46, 58.5 | onur + onarici + sozcu | 16 | hub east flank, south-east |
| `tk_p10` | merkez | 52.5, 45.5 | ezici + sekillendirici | 15 | hub east flank, north-east: rock + totem |
| `tk_p11` | merkez | 52.5, 54 | 10x hurda | 10 | dormant `egg` (east flank, wake 6 m) |
| `tk_p12` | merkez | 25, 49.5 | 2x yukleyici + sozcu | 12 | hub west flank, bridge side |
| `tk_p13` | merkez | 46, 49.5 | yagmaci + ruh | 14 | hub east flank, bridge side |
| `tk_p14` | merkez | 35.5, 46 | yagmaci + 3x hurda | 12 | **patrol** around the pit on the rail ring `(29.5,46) (41.5,46) (41.5,57) (29.5,57)`, 46 tiles, lap about 71 s |
| `tk_p15` | k_edna | 35.5, 41.5 | yukleyici + sozcu | 8 | Otomat Geçidi |
| `tk_p16` | k_bati | 12.5, 51.5 | 4x hurda + sozcu | 8 | west road |
| `tk_p17` | dokum_girisi | 4, 56.5 | dokum_yukleyici + yukleyici + onarici | 18 | Forge Loader #1 (next to the Usta Örsü) |
| `tk_p18` | dokum_girisi | 3.5, 51.5 | 2x sozcu + uluyan | 13 | mid hall |
| `tk_p19` | dokum_girisi | 6.5, 46.5 | dokum_yukleyici + sozcu | 14 | Forge Loader #2 |
| `tk_p20` | k_dokum | 5.5, 41.5 | onur + onarici | 12 | before the boss door |
| `tk_p21` | k_dogu | 58.5, 51.5 | 4x hurda + ruh | 9 | east road |
| `tk_p22` | pota_girisi | 69.5, 51.5 | yagmaci + 3x hurda + uluyan | 17 | big, "Abyssal surge" |
| `tk_p23` | pota_girisi | 69.5, 46.5 | 2x istilaci + ruh | 15 | column north |
| `tk_p24` | pota_girisi | 69.5, 57 | onur + sozcu | 12 | column south |
| `tk_p25` | pota_girisi | 64.5, 52 | yagmaci + yukleyici | 13 | **patrol** lane `(64.5,46.5) (64.5,57.5)`, round trip about 34 s |
| `tk_p26` | k_pota | 65.5, 41.5 | ezici + sozcu | 14 | before the boss door |
| `tk_p27` | titan_koridoru | 26.5, 22.5 | onur + 2x onarici | 16 |  |
| `tk_p28` | titan_koridoru | 31.5, 19.5 | 2x sekillendirici + sozcu | 14 | two totems possible |
| `tk_p29` | titan_koridoru | 43, 23.5 | ezici + onur | 18 | big, linked to p30 |
| `tk_p30` | titan_koridoru | 45, 20 | yagmaci + istilaci + ruh | 19 | linked to p29 |
| `tk_p31` | titan_koridoru | 39, 19.5 | 2x ezici | 20 | big, the Eirich pre-pull (two Rock Smashers near the door) |
| `tk_p32` | maden_ambari | 14, 67.5 | dokum_yukleyici + 6x hurda + onarici | 20 | optional, dormant `egg` (wake 7 m), linked to p33 and p34 |
| `tk_p33` | maden_ambari | 18.5, 69 | ezici + sekillendirici + 2x sozcu | 23 | optional, linked |
| `tk_p34` | maden_ambari | 12.5, 70 | onur + istilaci + uluyan | 18 | optional, linked |
| `tk_p35` | ray_gecidi | 9.5, 61.5 | 4x hurda + ruh | 9 | optional, `stealth: true` |

Totals: 35 packs, **498 forces** (non-optional 428 over 31 packs, optional 70 over 4 packs), 125 enemies (105 non-optional). Per section (non-optional): Muhafız Yaklaşımı 64, hub 124, Otomat Geçidi 8, west wing 65, east wing 80, Titan Tünelleri 87. Script-verified for this revision: every pack inside its room with a 1 tile margin, the minimum distance from p14's path to any other pack is 4.50 tiles, from p25's path 5.00 tiles, the minimum distance between any two non-linked, non-patrol packs is 5.0 tiles.

Paste-ready `PACKS` (uses `pack()` from `kit.ts`; `forces` = sum of the members; `linkedTo` is the new metadata field of SP-11):

```ts
const PACKS: PackDef[] = [
  pack('tk_p01', 'yaklasim', 25.5, 70, 12, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_hurda', -0.88, -0.16], ['tk_hurda', 0.83, -0.53], ['tk_hurda', -0.28, 1.03], ['tk_hurda', -0.53, -1.02], ['tk_onarici', 1.1, -0.75]], { dormant: { kind: 'egg', wakeRadius: 6 } }),
  pack('tk_p02', 'yaklasim', 30.5, 66, 12, [['tk_yukleyici', 0.3, 0], ['tk_yukleyici', -0.38, 0.35], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p03', 'yaklasim', 40.5, 70.5, 13, [['tk_yukleyici', 0.3, 0], ['tk_yukleyici', -0.38, 0.35], ['tk_uluyan', 1.1, -0.75]]),
  pack('tk_p04', 'yaklasim', 41.5, 65.5, 14, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_istilaci', 1.1, -0.75], ['tk_ruh', 1.35, 0.1]], { big: true }),
  pack('tk_p05', 'yaklasim', 35.5, 64.5, 13, [['tk_onur', 0.3, 0], ['tk_sekillendirici', 1.1, -0.75]]),
  pack('tk_p06', 'merkez', 18.5, 45.5, 16, [['tk_yukleyici', 0.3, 0], ['tk_onarici', 1.1, -0.75], ['tk_sozcu', 1.35, 0.1], ['tk_sozcu', 0.95, 0.9]]),
  pack('tk_p07', 'merkez', 25, 58.5, 15, [['tk_istilaci', 1.1, -0.75], ['tk_ruh', 1.35, 0.1], ['tk_uluyan', 0.95, 0.9]]),
  pack('tk_p08', 'merkez', 18.5, 54, 14, [['tk_dokum_yukleyici', 0.3, 0], ['tk_yukleyici', -0.38, 0.35]], { big: true }),
  pack('tk_p09', 'merkez', 46, 58.5, 16, [['tk_onur', 0.3, 0], ['tk_onarici', 1.1, -0.75], ['tk_sozcu', 1.35, 0.1]]),
  pack('tk_p10', 'merkez', 52.5, 45.5, 15, [['tk_ezici', 0.3, 0], ['tk_sekillendirici', 1.1, -0.75]]),
  pack('tk_p11', 'merkez', 52.5, 54, 10, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_hurda', -0.88, -0.16], ['tk_hurda', 0.83, -0.53], ['tk_hurda', -0.28, 1.03], ['tk_hurda', -0.53, -1.02], ['tk_hurda', 1.15, 0.42], ['tk_hurda', -1.2, 0.49]], { dormant: { kind: 'egg', wakeRadius: 6 } }),
  pack('tk_p12', 'merkez', 25, 49.5, 12, [['tk_yukleyici', 0.3, 0], ['tk_yukleyici', -0.38, 0.35], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p13', 'merkez', 46, 49.5, 14, [['tk_yagmaci', 0.3, 0], ['tk_ruh', 1.1, -0.75]]),
  pack('tk_p14', 'merkez', 35.5, 46, 12, [['tk_yagmaci', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62]], { patrol: [[29.5, 46], [41.5, 46], [41.5, 57], [29.5, 57]] }),
  pack('tk_p15', 'k_edna', 35.5, 41.5, 8, [['tk_yukleyici', 0.3, 0], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p16', 'k_bati', 12.5, 51.5, 8, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p17', 'dokum_girisi', 4, 56.5, 18, [['tk_dokum_yukleyici', 0.3, 0], ['tk_yukleyici', -0.38, 0.35], ['tk_onarici', 1.1, -0.75]]),
  pack('tk_p18', 'dokum_girisi', 3.5, 51.5, 13, [['tk_sozcu', 1.1, -0.75], ['tk_sozcu', 1.35, 0.1], ['tk_uluyan', 0.95, 0.9]]),
  pack('tk_p19', 'dokum_girisi', 6.5, 46.5, 14, [['tk_dokum_yukleyici', 0.3, 0], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p20', 'k_dokum', 5.5, 41.5, 12, [['tk_onur', 0.3, 0], ['tk_onarici', 1.1, -0.75]]),
  pack('tk_p21', 'k_dogu', 58.5, 51.5, 9, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_ruh', 1.1, -0.75]]),
  pack('tk_p22', 'pota_girisi', 69.5, 51.5, 17, [['tk_yagmaci', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_uluyan', 1.1, -0.75]], { big: true }),
  pack('tk_p23', 'pota_girisi', 69.5, 46.5, 15, [['tk_istilaci', 1.1, -0.75], ['tk_istilaci', 1.35, 0.1], ['tk_ruh', 0.95, 0.9]]),
  pack('tk_p24', 'pota_girisi', 69.5, 57, 12, [['tk_onur', 0.3, 0], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p25', 'pota_girisi', 64.5, 52, 13, [['tk_yagmaci', 0.3, 0], ['tk_yukleyici', -0.38, 0.35]], { patrol: [[64.5, 46.5], [64.5, 57.5]] }),
  pack('tk_p26', 'k_pota', 65.5, 41.5, 14, [['tk_ezici', 0.3, 0], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p27', 'titan_koridoru', 26.5, 22.5, 16, [['tk_onur', 0.3, 0], ['tk_onarici', 1.1, -0.75], ['tk_onarici', 1.35, 0.1]]),
  pack('tk_p28', 'titan_koridoru', 31.5, 19.5, 14, [['tk_sekillendirici', 1.1, -0.75], ['tk_sekillendirici', 1.35, 0.1], ['tk_sozcu', 0.95, 0.9]]),
  pack('tk_p29', 'titan_koridoru', 43, 23.5, 18, [['tk_ezici', 0.3, 0], ['tk_onur', -0.38, 0.35]], { big: true, linkedTo: ['tk_p30'] }),
  pack('tk_p30', 'titan_koridoru', 45, 20, 19, [['tk_yagmaci', 0.3, 0], ['tk_istilaci', 1.1, -0.75], ['tk_ruh', 1.35, 0.1]], { linkedTo: ['tk_p29'] }),
  pack('tk_p31', 'titan_koridoru', 39, 19.5, 20, [['tk_ezici', 0.3, 0], ['tk_ezici', -0.38, 0.35]], { big: true }),
  pack('tk_p32', 'maden_ambari', 14, 67.5, 20, [['tk_dokum_yukleyici', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_hurda', -0.88, -0.16], ['tk_hurda', 0.83, -0.53], ['tk_hurda', -0.28, 1.03], ['tk_onarici', 1.1, -0.75]], { dormant: { kind: 'egg', wakeRadius: 7 }, linkedTo: ['tk_p33', 'tk_p34'], optional: true }),
  pack('tk_p33', 'maden_ambari', 18.5, 69, 23, [['tk_ezici', 0.3, 0], ['tk_sekillendirici', 1.1, -0.75], ['tk_sozcu', 1.35, 0.1], ['tk_sozcu', 0.95, 0.9]], { linkedTo: ['tk_p32', 'tk_p34'], optional: true }),
  pack('tk_p34', 'maden_ambari', 12.5, 70, 18, [['tk_onur', 0.3, 0], ['tk_istilaci', 1.1, -0.75], ['tk_uluyan', 1.35, 0.1]], { linkedTo: ['tk_p32', 'tk_p33'], optional: true }),
  pack('tk_p35', 'ray_gecidi', 9.5, 61.5, 9, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_ruh', 1.1, -0.75]], { optional: true, stealth: true }),
];
```

Design notes per pack group:
- **Gate pull (p04 + p05):** 27 forces, two kick-casters plus a shield-stance Honor Guard that charges and guard-breaks; the tank pulls it against the north wall so Shield Stampede is short. They are 6.1 tiles apart: pulling both is a choice (the fast route), not an accident.
- **Hub flanks and the rail patrol (p06 to p13, p14):** the patrol Despoiler laps the rail ring in about **71 s** (184 m at `0.45 x 5.8 = 2.6 m/s`). Because it never passes within 16 m of a flank pack, it can only join a fight if the group drifts toward the rim; the clean play is to **ambush it alone on the south rim** (P4, 12 forces) right after the gate. Left alive it arrives at the bridge heads every lap and punishes a group fighting on the rim. West flank: p07 (three must-kicks), p08 (Forge Loader + shove: **the bridge is behind you, keep the pull away from the chasm edge**), p12, p06. East flank: p09, p11 (swarm piles), p13 (Despoiler + Voidsoul), p10 (Rock Smasher + totem).
- **West hall (p17, p18, p19, p20):** p17 and p19 are 10 tiles apart, p18 sits between them (5.0 and 5.8 tiles), p20 guards the door: four separate pulls, one Forge Loader in each of p17 and p19. The Usta Örsü is 3.9 tiles from p17: use the buff before p17 if the group has a Barbarian or a blacksmith.
- **East hall (p22, p23, p24, p25):** a column of three packs at x 69.5 (z 46.5, 51.5, 57), 5.0 to 5.5 tiles apart, and the patrol p25 on the lane x 64.5, 5.0 tiles west of the column. Despoilers in p22 and the patrol plus Invaders in p23: Void Outburst twice is the Abyssal Surge risk; pull p24 + p22 together only with defensives ready (P11).
- **Titan Tünelleri (p27 to p31):** 87 forces on a descending ramp, packs 5.7 to 7.5 tiles apart (except the linked p29 + p30 pair at 4.0); never pull the p29 + p30 Katliam together with p31. p31's two Rock Smashers ramp Smash Rock: pull one pack at a time and use shrine `shrine_ward` (Koruma) on the p29 + p30 pull.
- **Katliam spots (big pulls, GDD_CONTENT §1.7):** gate p04 + p05, hub flank pairs p07 + p08 and p06 + p12 (a deliberate double, 7.6 to 7.9 tiles apart), p22 + p24 in the east hall, Madenci Ambarı p32 + p33 + p34, Titan p29 + p30.

---


## 5. Bosses

Four encounters, five bodies (the WoW model has four, so Taşkasa keeps four; every one is dressed with the Elden Ring layer below): **Otomat Seda** (E.D.N.A.), **Kristal Golem Skarmorak**, **Usta Makinistler Brokk and Dorlita** (one paired encounter), **Başsözcü Eirich** (showpiece). Each boss lists its mechanics as timeline entries against the boss kit (`src/ai/bosses/kit.ts`, `BossController`). **EXISTS** = built from today's kit; **NEW SP-xx** = shared primitive (§8.2). Every NEW item has a **fallback** with today's kit, so the boss scripts can be written before the primitives land.

Common rules: bosses are hard-CC immune (stagger break instead), enrage is `+50 % damage` with `+12 %` stacks every 8 s (engine), party scaling `1 + 0.7 (n - 1)` on HP (mechanic entities carry `partyHp(c)`), marks and soaks use `min(n, base)` players so solo and duo runs stay playable. Boss HP times at +10 are in §6.1 (the **CORE_MECHANICS §6 curve governs**, the hpMults below already carry the +18 % correction). Tyrannical week: +30 % HP, +15 % damage on the bosses and their adds.

**Tank identification (fix, SP-09).** No script tests the class. `tankOf(c)` is the boss's **current target** (`boss.targetId`) while a player stands inside its melee reach, otherwise the top-threat player, otherwise the nearest player within 8 m. `isTank()` in `src/ai/bosses/kit.ts` (`classId === 'knight'`) stays only for the legacy Kemik, Gölge and Kızıl scripts; the Taşkasa scripts call `pickPlayers(c, n, avoid)` with `avoid = tankOf(c)` (SP-09 changes the third parameter from a boolean to the player to spare). Everything in this section that says "the tank" means `tankOf(c)`: Seda's dispel-reward watcher and her beam, spike and dive targeting, Skarmorak's charge line, Dorlita's hammer, Eirich's claw, grasp and the swap toast (`tankSwapHint` counts the stacks on `tankOf(c)` and toasts the highest-threat other player as the second tank). A Barbarian Savaş Lordu, a Brewmaster, a Blood Knight, a Vengeance Demon Hunter or a Protection Paladin main tank therefore gets the Sismik Kalkan reward, the swap toast and the tank-targeted moves exactly like a Protection Knight, and is *not* picked for beams, spikes, dives or marks.

**The Elden Ring layer (CORE_MECHANICS §16, new in this revision).** Every boss keeps its WoW mechanics unchanged and gets on top: (1) a **2 to 3 hit string** as its basic attack, the last hit a *delayed swing* (telegraph visible, blow held 0.4 to 0.5 s); (2) one **jump, charge or grab** attack with a locking ground telegraph; (3) a **posture bar** (`BossDef.poise`, EXISTS in `src/combat/poise.ts`: boss rank default 600, scaled `1 + 0.5 (n - 1)` by party size, break lock 25 s). Bosses have hyper-armour during their big casts (never flinched, the poise still fills). A **break** outside an intermission stuns the boss (`c.stagger(stun, 1.25, window)`; a broken boss takes +25 % damage and the Kritik Vuruş riposte works on it) and **cancels the current windup**; each boss also has one extra reward for a break (below). The scripted reaction (cancel the ability, delay the sequence) needs the `onPoiseBreak` hook of SP-24; without it the break still stuns and gives +25 %, only the extra reward is skipped. All windups obey `clamp(0.45 + 0.25 x coef, 0.45, 1.2)` as a minimum, every string hit re-aims its cone, and strings use `comboString` (SP-24, fallback: three `cone()` calls on `c.schedule`). The posture layer is **not credited** in the §6.1 time model (it only shortens fights).

Arena table (`BossDef.arena`, world metres; centre = `4 * (x + w/2), 4 * (z + h/2)`):

| Boss | Room | `cx, cz, w, h` | Boss home `homeX, homeZ` |
|---|---|---|---|
| Seda | `edna_odasi` | 144, 132, 66, 50 | 144, 122 |
| Skarmorak | `skarmorak_odasi` | 260, 132, 50, 50 | 260, 124 |
| Dorlita / Brokk | `makinist_odasi` | 24, 136, 42, 42 | 26, 128 / 18, 122 |
| Eirich | `fisilti_salonu` | 144, 36, 90, 66 | 144, 28 |

---

### 5.1 Boss 1: Otomat Seda, "Çekirdeğin Nöbetçisi" (`boss_seda`), the E.D.N.A. fight

| hpMult | dmgMult | speed | radius | enrage | Model | Clips |
|---|---|---|---|---|---|---|
| **53** | 2.3 | 3.8 m/s | 1.8 | 240 s | `gen/bosses/otomat_seda` (fallback `golem_stone` x1.7) | `Idle`, `Walk`, `Run`, `Attack` (0.67), `Attack2` (0.57), `Cast`, `Hit`, `Death` |

Arena: Savunma Çekirdeği, 72 x 56 m, circular rune platform with a lens pedestal in the middle, four pillars (beam cover), spike emitters along the walls. A single phase; below 40 % the energy fills 50 % faster and the beam count rises by one.

**Energy:** 0 to 100 at +2.5/s (full every 40 s; +3.75/s below 40 %). At 100 she casts Yer Parçalayıcı and resets to 0. (**NEW SP-02** `bossEnergy` draws the bar on the boss frame. Fallback: `every(state, 'energy', dt, 40, () => c.castNow('seda_shatter'))`, first at 38 s.)

| Ability (id, TR) | First / cd | Windup | Shape | Damage / effect | Counter | Kit |
|---|---|---|---|---|---|---|
| `seda_stomp` **Çift Basış** (basic string, Elden Ring layer) | - / 3.2 | hit 1 at 0.70, hit 2 at 1.45 (phase 2: third hit at 2.80) | cone 100 deg, 5 m, re-aimed | coef 1.0, 1.2 (phase 2: 1.8) physical | tank, see the Elden Ring table below | EXISTS `cone()` + string (SP-24) |
| `seda_smash` **Sismik Ezme** (Seismic Smash) | 7 / 18 | 1.4 | cone 70 deg, 6.5 m, tank buster, not parryable | coef 4.2 physical + **Sismik Yankı** (`seismic_echo`: magic DoT 30 s, 0.35 coef / 2 s, dispellable) | tank defensive on the first one; healer **dispels** it from the second on: a dispelled echo gives the tank **Sismik Kalkan** (`seismic_ward`, -50 % damage taken, 6 s). Immunities on the cast stop the echo | EXISTS (cone + status). Dispel reward = script watcher: the **current boss target** (`tankOf(c)`, never a class test) lost `seismic_echo` before expiry -> `statusPlayer(tankOf(c), 'seismic_ward', 6)`; if the target changed during the 30 s the watcher follows the new target |
| `seda_spikes` **Kararsız Sivri Taşlar** (Volatile Spikes) | 11 / 30 | 1.2 + 1.5 s ground telegraph | up to `min(3, n)` circles r 1.5 under random players (knockback 2 m, coef 0.8), then a spike entity stands there | the spike (`proc_volatile_spike`, invulnerable, armed after 0.8 s) **detonates if a player stays within 3.5 m for 0.35 s**: circle r 8, coef 1.0, knockback 6 m, and a stacking **Yer Çatlağı** (`earth_fracture`: 8 s, 0.18 coef/s per stack, max 8) on everyone hit. Max 6 spikes alive | stack together to place spikes, then **spread and walk away**; beams and the shatter remove spikes harmlessly | EXISTS pattern (golge rifts: `spawnMech` + `makeInvulnerable` + `update()` proximity), NEW entity def (SP-15) + status (SP-21) |
| `seda_beams` **Kırılan Işın** (Refracting Beam) | 6 / 24 | 1.0 + 2.4 s mark | `min(3, n)` marked players (everyone except `tankOf(c)` first; the tank may be the third), gold ring follows each for 2.4 s, then the aim locks and a line telegraph (36 x 2.2 m) fills for 0.9 s | coef 2.4 fire to everyone in the line, **every spike within 1.2 m of the line is destroyed** (no detonation) | aim the line through spikes, do not overlap beams on players, DPS spread; the tank positions the boss so marked players fire along spike rows | EXISTS: `circle(..., follow)` marks + `c.schedule` + `beam()` + `pickPlayers(c, n, tankOf(c))`. Optional shared helper `trackBeam` (SP-04) |
| `seda_shatter` **Yer Parçalayıcı** (Earth Shatterer) | at energy 100 | 3.5 cast, uninterruptible | circle r = arena radius + 8 (nobody escapes) | coef 3.4 physical raid-wide, **destroys every remaining spike** | healer and personal defensives; do not let spikes pile up (they are cleared anyway) | EXISTS `circle()` + energy SP-02 |
| `seda_overclock` Aşırı Yük (40 %) | phase 2 | instant | - | energy gain x1.5, beam count +1 (max 4), yell | | EXISTS (`onPhase`, state flag) |
| `seda_sweep` **Lens Taraması** (Lens Sweep, Elden Ring layer) | 17 / 30 | 1.10 (coef 1.6) | beam 36 x 2.2 m rotating through a 150 deg arc in front of her over 1.6 s | coef 1.6 fire once per player per sweep; **destroys every spike within 1.2 m** | roll through the line or stand behind her; the tank turns her away from the group | EXISTS `beam()` x8 steps of 18 deg; clean = SP-06 `spin` |
| `seda_dive` **Çekirdek Atılışı** (Core Dive, Elden Ring layer) | 22 / 40 | 1.20 (coef 3.0), circle follows a random non-tank 0.8 s then locks 0.4 s before landing | leap up to 20 m, landing circle r 5.5 | coef 3.0 physical + knockback 5 m (phase 2: plants one spike) | leave the circle on the lock; she is in recovery 1.5 s after | EXISTS `circle(follow)` + `schedule` + position move |

Phases: `bp('p1', 1.01, ['seda_smash','seda_spikes','seda_beams','seda_sweep','seda_dive'])`, `bp('p2', 0.4, [same], { yell: 'AŞIRI YÜK UYARISI.' })` (phase 2 also gives the stomp string its third hit). Shatter is energy-driven, not in the phase list.

**Duties.** Tank: major defensive on the first Smash, keep the boss near the centre so spikes and beams stay on the same side, swap beam targets with a DPS to aim at spike rows. Healer: dispel the echo from the second Smash (just before the next Smash is best), cooldown on each Shatter. DPS: stack briefly to drop the three spikes in one place, spread for beams, never run through a spike ring at a high key.
**Party scaling:** spikes and beams `min(3, n)`; solo: 1 spike, 1 beam, Shatter coef x0.7, no Sweep, Dive every 60 s.
**Yells:** pull "SİSTEM UYANDI. İZİNSİZ GİRİŞ TESPİT EDİLDİ." · 40 % "AŞIRI YÜK UYARISI." · death "Çekirdek... durduruluyor..."

**Elden Ring layer: Seda.** Posture `poise: 800`, regen 8 %/s after 4 s, hyper-armour while casting Beams, Sweep and Shatter.

| Move | Windup / impact | Shape | Damage / effect | Counter / opportunity |
|---|---|---|---|---|
| `seda_stomp` string **Çift Basış** (basic) | hit 1 at 0.70 (coef 1.0), hit 2 at 1.45 (coef 1.2); in phase 2 a **delayed third hit** at 2.80 (coef 1.8, windup 0.90 + 0.45 hold) | cone 100 deg, 5 m each, re-aimed, she steps 1.5 m forward on each | 2 (3) hits physical | the tank blocks the first two and **rolls the late third** (the hold is the tell: her turret stops spinning) |
| `seda_sweep` **Lens Taraması** | 1.10 (coef 1.6): the lens charges gold, a ring grows on the floor | beam 36 x 2.2 m rotating through a 150 deg arc in front of her over 1.6 s (94 deg/s) | coef 1.6 fire, **removes spikes** within 1.2 m | roll through the line (i-frames) or stand behind her: a third spike-clearing tool next to the beams and the Shatter |
| `seda_dive` **Çekirdek Atılışı** (jump) | 1.20 (coef 3.0), lock 0.4 s before landing | circle r 5.5 on a random non-tank | coef 3.0 + knockback 5 m | leave the circle; the 1.5 s recovery is a free melee window with poise damage x1.5 |

**Posture break (800):** `c.stagger(4, 1.25, 6)`, **every standing spike goes inert for 8 s** (cannot detonate) and her **energy drops by 30**, so a break is the answer to a messy spike field. The best window is right after a Dive recovery.

**Loot `loot_tk_b1`** (personal: one guaranteed item per player, +25 % chance of a second; table `{ focus: ['axe2h','chest','gloves','boots'], setChance: 0.15, uniqueIds: ['leg_seda_lens','leg_seda_aegis','leg_seda_gauntlets'], uniqueChance: 0.35 }`, `LootTableDef` fields that exist today). 35 % of the time the guaranteed item is one of the three named items, filtered by smart loot to the opener's armour and spec; item level `68 + 2 x min(L, 12)` in a key (CORE §4.4). All are `UniqueDef`s in `src/data/uniques.ts` with a `special.id` implemented by the combat module (`G.character.hasSpecial`):

| Named item | Slot / base | Classes | Effect (build-defining) |
|---|---|---|---|
| **Seda'nın Lens Gözü** (`leg_seda_lens`) | ring | any | crits have a 12 % chance to fire an 8 m line behind the target for 70 % weapon damage; a line that hits 3 or more enemies refunds 1.5 s on your shortest cooldown (icd 6 s). Crit-pierce AoE builds. |
| **Yer Parçalayıcı Kalkan** (`leg_seda_aegis`) | shield | knight, paladin, monk | a **parry** releases a 5 m shockwave for 150 % weapon damage (icd 2 s) and grants **Sismik Kalkan** (-50 % damage taken, 3 s, once per 20 s). The parry-block tank build. |
| **Çekirdek Nöbetçisi Eldivenleri** (`leg_seda_gauntlets`) | gloves | strength / agility melee | +30 % poise damage; a **Kritik Vuruş** (the riposte on a broken elite or boss) explodes in 6 m for 150 % weapon damage and refunds 25 % of the heavy-attack charge. The posture-breaker melee build. |

```ts
boss({
  id: 'boss_seda', name: 'Otomat Seda', title: 'Çekirdeğin Nöbetçisi', model: GENB('otomat_seda') /* fallback GEN('golem_stone') */, scale: 1.0, role: 'melee',
  hp: 53, dmg: 2.3, speed: 3.8, radius: 1.8, enrage: 240, arenaR: 28, poise: 800, loot: 'loot_tk_b1', anims: A_GEN, resist: { ...R_GOLEM, fire: 0.5 }, visual: { runRef: 3.8 },
  basic: cone('seda_stomp', 'Çift Basış', 5, 100, 3.2, 1.0, 'Attack', 0.67, { windup: 0.7, telegraph: true, params: { chain: 1, t2: 1.45, c2: 1.2 } }),   // phase 2: onPhase sets chain 2, t3 2.8, c3 1.8
  abilities: [
    cone('seda_smash', 'Sismik Ezme', 6.5, 70, 18, 4.2, 'Attack2', 0.57, { initialCooldown: 7, windup: 1.4, telegraph: true, tankBuster: true, parryable: false, statuses: [{ status: 'seismic_echo', duration: 30 }] } as Ab),
    custom('seda_spikes', 'Kararsız Sivri Taşlar', 30, 11, 1.2, 'Cast', { sfx: 'boss_cast', params: { impact: 0.8 } }),
    custom('seda_beams', 'Kırılan Işın', 24, 6, 1.0, 'Cast', { sfx: 'boss_cast', params: { impact: 0.6 } }),
    custom('seda_sweep', 'Lens Taraması', 30, 17, 1.1, 'Cast', { sfx: 'boss_cast', params: { impact: 0.8 } }),
    custom('seda_dive', 'Çekirdek Atılışı', 40, 22, 1.2, 'Attack', { sfx: 'boss_cast', params: { impact: 1.0, leap: 1 } }),
    custom('seda_shatter', 'Yer Parçalayıcı', 999, 9999, 3.5, 'Cast', { castTime: 3.5, interruptible: false, sfx: 'boss_roar', params: { impact: 2.0 } }),
  ],
  phases: [bp('p1', 1.01, ['seda_smash', 'seda_spikes', 'seda_beams', 'seda_sweep', 'seda_dive']), bp('p2', 0.4, ['seda_smash', 'seda_spikes', 'seda_beams', 'seda_sweep', 'seda_dive'], { yell: 'AŞIRI YÜK UYARISI.' })],
  intro: 'SİSTEM UYANDI. İZİNSİZ GİRİŞ TESPİT EDİLDİ.', death: 'Çekirdek... durduruluyor...',
  arena: { cx: 144, cz: 132, w: 66, h: 50, homeX: 144, homeZ: 122 },
  // energy: { max: 100, regen: 2.5, onFull: 'seda_shatter' }   // SP-02
});
```

---

### 5.2 Boss 2: Kristal Golem Skarmorak, "Çatlak Kristalinin Kölesi" (`boss_skarmorak`)

| hpMult | dmgMult | speed | radius | enrage | Model | Clips |
|---|---|---|---|---|---|---|
| **70** | 2.4 | 3.6 m/s | 2.0 | 270 s | `gen/bosses/skarmorak` (fallback `golem_stone` x1.8, tint `0x5a9a98`) | `Idle`, `Walk`, `Run`, `Attack`, `Attack2`, `Cast`, `Hit`, `Death` |

Arena: Kristal Kazanı, 56 x 56 m, teal-lit crystal cavern, six shard sockets (`shard_spot_1..6`). The tank has to **move the boss around the room** so shards are cleaved and the room is not choked.

**Cycle (scripted sequence, `c.state.seq`):** `Smash (6 s) -> Crash (+9) -> Smash (+9) -> Crash (+9) -> Smash (+9) -> Fortified Shell`, then energy refills and the cycle repeats. Energy costs: Smash 18, Crash 20 (the last cast drains the rest); at 0 the shell starts. Below 35 % the gaps shrink to 7 s and each Smash spawns 4 shards. (SP-02 shows the energy bar; fallback: the fixed sequence above.)

| Ability (id, TR) | Timing | Shape | Damage / effect | Counter | Kit |
|---|---|---|---|---|---|
| `skar_slam` **Kristal Üçlü** (basic string, Elden Ring layer) | - / 3.4, hit 1 at 0.80, hit 2 at 1.55, hit 3 delayed at 2.95 | cone 100 deg, 5.5 m, hit 3 a circle r 3.5 in front | coef 1.0, 1.0, 1.8 | tank (block, block, roll the late one) | EXISTS + string (SP-24) |
| `skar_smash` **Kristal Ezme** (Crystalline Smash) | sequence, windup 1.4 | cone 80 deg, 7 m, tank buster | coef 4.0 physical, then **3 shards** land at random walkable points 7-18 m from the boss: ground circle r 3, 1.6 s telegraph, coef 1.6; the shard (`proc_crystal_shard`, hpMult 3 x `partyHp`, blocker r 1.0, tag `shard`) stays | tank defensive; move the boss so shards are cleaved | EXISTS (cone + `c.spawnAdds` / `spawnMech`), NEW entity def (SP-15) |
| `skar_eruption` **Kristal Patlaması** (Crystalline Eruption) | when a shard dies | raid circle | coef 1.3 shadow raid-wide + **Kırılgan** (`sunder`, 3 s: everyone takes +15 %) | kill shards **one at a time**, wait for the vulnerability to end, heal through | EXISTS (script watches `c.adds('shard')` deaths, `circle()`, `statusPlayer`) |
| `skar_crash` **Kararsız Çarpma** (Unstable Crash) | sequence, windup 2.2 | self circle r 15 | coef 2.0 shadow, then **one Kararsız Parça** (`proc_unstable_fragment`) drops under each living player (+ 1.5 m scatter), despawns after 15 s; touching one (1.2 m) gives **Kararsız Enerji** (`unstable_energy`, 15 s, max 6): +8 % damage dealt per stack (shell damage included) and a shadow DoT 0.18 coef/s per stack | collect **one fragment per player** (even stacks), do not hoard | EXISTS (`spawnMech` + proximity in `update()`), NEW entity + status (SP-15, SP-21) |
| `skar_shell` **Güçlendirilmiş Kabuk** (Fortified Shell) | sequence end | boss gains an absorb `shield` of `maxHp x (0.03 + 0.012 x living shards)` (3 % with no shards, 10 % with six) | channels **Boşluk Boşalması**: raid hit every 2 s, coef 0.9 x 1.10^ticks shadow (stacking). **Breaking the shell** stuns him 4 s and he takes +30 % for 6 s (`c.stagger(4, 1.3, 6)`). If the shell survives **22 s**: Boşluk Patlaması, coef 8 raid-wide | kill shards **before** the shell, burst the shell, healer cooldowns for the Discharge | EXISTS (`shield` status absorb on enemies, `stagger`, `circle`, `every`); detect the break with `!e.statuses.has('shield')` |
| `skar_charge` **Kristal Boğası** (Crystal Bull, Elden Ring layer) | 20 / 36, windup 1.20 (coef 2.4) | charge line 20 x 3 m at the **farthest** player, locks 0.5 s before the run, 20 m/s | coef 2.4 physical + knockback 6 m. A charge that ends against the arena wall **stuns him 3 s** (`c.stagger(3, 1.25, 5)`); a shard in the line stops the run and shatters (a normal Eruption) | a far player stands so the line ends at the wall; do not line shards up in front of the wall | EXISTS `dashLine()` + `stagger`, wall test by position |

Phases: `bp('p1', 1.01, ['skar_smash','skar_crash','skar_shell','skar_charge'])`, `bp('p2', 0.35, [same], { yell: '*Kristaller çığlık atıyor!*' })` (faster gaps, 4 shards). The charge is a timer ability outside the sequence (it never interrupts a Smash/Crash windup: the script holds it until the current step ends).
**Duties.** Tank: defensive on Smash, drag the boss along the room's long axis so shards line up, never leave the boss inside the shard ring. Healer: cooldowns for the Discharge, top up before each Eruption. DPS: kill shards one by one (never two at once), collect your own fragment, **cleave** the shell with fragment stacks. Interrupts: none.
**Party scaling:** shards `min(3, n + 1)`, fragments per living player, shell 22 s fixed, no Bull charge below 3 players.
**Yells:** pull "*Kristal çatırdıyor ve gürlüyor.*" · 35 % "*Kristaller çığlık atıyor!*" · death "*Çatlak sessizce kapanıyor...*"

**Elden Ring layer: Skarmorak.** Posture `poise: 900`, hyper-armour during Crash and the Shell channel.

| Move | Windup / impact | Shape | Damage / effect | Counter / opportunity |
|---|---|---|---|---|
| `skar_slam` string **Kristal Üçlü** (basic) | hit 1 at 0.80 (coef 1.0), hit 2 at 1.55 (coef 1.0, backhand), **hit 3 delayed** at 2.95 (coef 1.8, windup 0.90 + 0.50 hold) | cone 100 deg, 5.5 m, then a circle r 3.5 in front | 3 hits physical; hit 3 spawns no shards (only Kristal Ezme does) | block the pair, roll the late slam |
| `skar_charge` **Kristal Boğası** (charge) | 1.20 (coef 2.4), arrow locks 0.5 s before the run | line 20 x 3 m at the farthest player | coef 2.4 + knockback 6 m; **wall crash = 3 s stun** | aim the bull: the tank and the target choose where the line ends |

**The Fortified Shell is his posture phase:** while the shell absorb is up all poise damage is doubled, and breaking the shell breaks his posture (the existing 4 s stun and +30 % window). **Outside the shell** a normal break (900) gives `c.stagger(4, 1.25, 6)`, cancels the current step and **delays the next sequence step by 4 s** (the energy bar pauses).

**Loot `loot_tk_b2`** (personal; `{ focus: ['ring','amulet','belt','shoulders','legs'], setChance: 0.15, uniqueIds: ['leg_skarmorak_heart','leg_skar_fragment_belt','leg_skar_pauldrons'], uniqueChance: 0.35 }`):

| Named item | Slot / base | Classes | Effect (build-defining) |
|---|---|---|---|
| **Çatlak Yürek** (`leg_skarmorak_heart`) | amulet (our trinket-like slot) | any | every 12 s a crystal shield worth 6 % max HP; when it breaks you deal +15 % damage for 4 s. The shield-cycle build (any spec that can break its own shield). |
| **Kararsız Parça Kemeri** (`leg_skar_fragment_belt`) | belt | any | every 12th kill and every elite kill drops an **Unstable Fragment** at your feet (pick-up gives Kararsız Enerji: +8 % damage per stack, max 6, 15 s, icd 5 s); at 6 stacks you burst for 200 % weapon damage in 6 m and the stacks reset. The stack-and-burst build. |
| **Skardyn Omuzlukları** (`leg_skar_pauldrons`) | shoulders | any | absorb shields on you are 30 % stronger, 20 % of the damage a shield absorbs is returned as arcane damage to attackers within 5 m, and with a shield up your damage is +8 %. The absorb build (tanks with block, Evoker, Alchemist, Warlock). |

```ts
boss({
  id: 'boss_skarmorak', name: 'Kristal Golem Skarmorak', title: 'Çatlak Kristalinin Kölesi', model: GENB('skarmorak') /* fallback GEN('golem_stone') */, scale: 1.0, tint: 0x5a9a98, emissive: 0x3fe0c8, role: 'melee',
  hp: 70, dmg: 2.4, speed: 3.6, radius: 2.0, enrage: 270, arenaR: 26, poise: 900, loot: 'loot_tk_b2', anims: A_GEN, resist: { ...R_GOLEM, shadow: 0.3 }, visual: { emissiveIntensity: 0.6, runRef: 3.6 },
  basic: cone('skar_slam', 'Kristal Üçlü', 5.5, 100, 3.4, 1.0, 'Attack', 0.67, { windup: 0.8, telegraph: true, params: { chain: 2, t2: 1.55, c2: 1.0, t3: 2.95, c3: 1.8 } }),
  abilities: [
    cone('skar_smash', 'Kristal Ezme', 7, 80, 999, 4.0, 'Attack2', 0.57, { initialCooldown: 9999, windup: 1.4, telegraph: true, tankBuster: true, parryable: false } as Ab),   // cast by the sequence (castNow)
    custom('skar_crash', 'Kararsız Çarpma', 999, 9999, 2.2, 'Cast', { sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('skar_shell', 'Güçlendirilmiş Kabuk', 999, 9999, 1.0, 'Cast', { sfx: 'boss_roar', params: { channel: 22, loop: 1 } }),
    custom('skar_charge', 'Kristal Boğası', 36, 20, 1.2, 'Attack2', { sfx: 'boss_roar', params: { impact: 1.0 } }),
  ],
  phases: [bp('p1', 1.01, ['skar_smash', 'skar_crash', 'skar_shell', 'skar_charge']), bp('p2', 0.35, ['skar_smash', 'skar_crash', 'skar_shell', 'skar_charge'], { yell: '*Kristaller çığlık atıyor!*' })],
  intro: '*Kristal çatırdıyor ve gürlüyor.*', death: '*Çatlak sessizce kapanıyor...*',
  arena: { cx: 260, cz: 132, w: 50, h: 50, homeX: 260, homeZ: 124 },
});
```

---

### 5.3 Boss 3: Usta Makinistler, Sözcü Brokk and Sözcü Dorlita (`boss_brokk`, `boss_dorlita`)

One encounter, two bodies, two HP pools, **both are tanked or kited** (Dorlita tanked, Brokk kited by an off-tank or ranged; each body's tank is `tankOf` of that body, i.e. whoever holds that body's target, not a class). SP-07 `pairedBoss` (`BossPlacement.group: 'makinistler'`): both engage together, both reset together, the run counts it as **one** boss, loot drops once. Fallback without SP-07: each script polls the sibling (`c.world.enemies.find(...)`) and the dungeon counts 5 bosses (the contentCheck 3-boss rule must be relaxed anyway, SP-11).

| | hpMult | dmgMult | speed | radius | enrage | Model |
|---|---|---|---|---|---|---|
| **Dorlita** (tank mech) | **38** | 2.5 | 4.0 | 1.6 | 300 s | `gen/bosses/dorlita_mech` (fallback `Giant` x1.5, tint `0x9a7a60`) |
| **Brokk** (caster) | **38** | 2.0 | 4.6 | 1.0 | 300 s | KayKit `Mage` x1.1, tint `0xc8a070`, `2H_Staff`, kite `[10, 16]` |

Arena: Makinistler Salonu, 48 x 48 m, four corner vents (`vent_1..4`), a central scrap cube on a pedestal (`scrap_cube`), two scrap blocks on opposite sides (`scrap_block_1` west, `scrap_block_2` east), cart station behind. **Pre-fight:** the Usta Örsü in the west hall (10 min buff) for Barbarians and blacksmiths.

**Baseline rotation (about 70 s loop; Furnace Leap at 16 and 50, Anvil Flurry whenever a player is within 4 m of Brokk):** `0 pull · 6 Hammer · 10 Scrap Song · 12.5 Molten Metal · 20 Exhaust Vents · 28 Crescendo · 34 Hammer · 46 Scrap Song · 49 Molten Metal · 58 Vents · 66 Crescendo`. Vents come before each Crescendo, Molten Metal right after each Scrap Song. Both bosses want to be moved to the centre after each Crescendo.

| Boss | Ability (id, TR) | First / cd | Windup | Shape | Damage / effect | Counter | Kit |
|---|---|---|---|---|---|---|---|
| Dorlita | `dorlita_slam` **Mekanik Üçlü** (basic string, Elden Ring layer) | - / 3.6 | hit 1 at 0.80, hit 2 at 1.55, hit 3 delayed at 2.95 | cone 100 deg, 5.5 m, hit 3 a circle r 4 | coef 1.0, 1.0, 1.8 (hit 3 fire) | tank | EXISTS + string (SP-24) |
| Dorlita | `dorlita_leap` **Fırın Atılışı** (Furnace Leap, Elden Ring layer) | 16 / 34 | 1.20 (coef 3.0), locks 0.4 s before landing | leap up to 18 m onto a random non-tank, circle r 5 | coef 3.0 fire + a lava puddle r 4 for 8 s (0.5 coef per 0.5 s) | step out on the lock; drop the puddle away from the cold corner | EXISTS `circle(follow)` + `zone()` |
| Dorlita | `dorlita_hammer` **Eriyik Çekiç** (Igneous Hammer) | 6 / 16 | 1.3 | cone 90 deg, 6 m, tank buster | coef 4.2 fire + burn 6 s | **defensive on every cast** | EXISTS |
| Dorlita | `dorlita_cannon` **Lav Topu** (Lava Cannon) | 12 / 14 | 2.0, aim locks 0.5 s before landing | line 36 x 3 m at a random player | coef 2.4 fire | move when she turns to charge | EXISTS `beam()` + `schedule`; aim-lock helper `trackBeam` (SP-04) |
| Dorlita | `dorlita_crescendo` **Kızgın Kreşendo** (Blazing Crescendo) | 28 / 38 | 3.0 cast | drags the cube to the centre first; raid circle + DoT zone r 20; then **4 lava waves** (rect 48 x 5 m) sweep in from N, E, S, W at 0.6 s spacing, each with a 6 m safe lane | coef 2.6 fire raid-wide, DoT 0.5 coef/s for 6 s, waves coef 1.8 | stay away from the centre when Scrap Song starts; take the safe lane; healer cooldown | EXISTS `circle`, `zone`, `band`, `c.schedule` |
| Brokk | `brokk_bolt` Kor Oku (basic) | - / 2.5 | 0.8 | projectile | coef 0.8 fire | | EXISTS |
| Brokk | `brokk_flurry` **Örs Üçlüsü** (Anvil Flurry, Elden Ring layer) | 5 / 8, only with a player within 4 m | hit 1 at 0.75, hit 2 at 1.45, hit 3 delayed at 2.75 | cone 90 deg, 4 m, hit 3 a circle r 3 | coef 0.9, 0.9, 1.6; afterwards he blinks 12 m away | do not camp his feet: the string is why he is kited | EXISTS + string (SP-24), `blink` |
| Brokk | `brokk_scrap_song` **Hurda Şarkısı** (Scrap Song) | 10 / 36 | 2.5 | Brokk jumps behind a scrap block (random side), then a **44 x 6 m band** across the centre; the cube entity slides along it at 22 m/s | coef 3.0 physical + **stun 1.5 s** + knockback 8 m. If Dorlita is within 7 m of the lane she **catches** the cube and it detonates at her (circle r 7, coef 3.0). **M+:** when it hits the far block it bursts into **4 magma blobs** moving outward at 5 m/s, coef 1.8 each, 8 s | stay out of the lane, away from the centre | EXISTS `band()` + `spawnMech` slide (like the soul orbs); new entities `proc_scrap_cube`, `proc_magma_blob` (SP-15) |
| Brokk | `brokk_molten` **Erimiş Metal** (Molten Metal) | 12.5 / 36, cast right after each Song | 2.2 cast, **interruptible, K2** | projectile at a random player | coef 2.2 fire + slow 50 % 8 s | **interrupt it** | EXISTS (`interruptible`, `kick`) + script `castNow` |
| Brokk | `brokk_vents` **Egzoz Delikleri** (Exhaust Vents) | 20 / 38 | 2.0 telegraph | **3 of the 4** corner vents (random), circle r 5.5 each | flame pools for **30 s**: coef 1.2 per 0.5 s (lethal), the unlit corner is the safe spot | stand on the cold corner | EXISTS `zone()` (persist 30 s) |
| survivor | `Susturulmuş Sözcü` (Silenced Speaker) | when the first dies | - | - | the survivor gets **+75 % damage** and a raid fire pulse every 2 s (coef 0.7) until it dies | **kill both within ~10 s of each other** | NEW SP-07 hook `onSiblingDeath`; fallback script polling |

Phases: none per boss (`bp('p1', 1.01, [...])`); the pair mechanic is the second phase. Dorlita's list is `['dorlita_hammer','dorlita_cannon','dorlita_crescendo','dorlita_leap']`, Brokk's `['brokk_scrap_song','brokk_molten','brokk_vents','brokk_flurry']`.
**Duties.** Tank: Dorlita, defensive on **every** Igneous Hammer; move both bosses to the centre after each Crescendo. Off-tank / ranged on Brokk. Healer: DoTs of the Crescendo and the vent pools. DPS: **interrupt Molten Metal every time**, dodge the Lava Cannon line, stand on the cold corner, leave the centre at Scrap Song, kill Brokk first or burn both evenly (both pools must end within 10 s).
**Party scaling:** vents 3 of 4 (2 of 4 for a party of 2, 1 for solo), Cannon targets 1, waves 2 for parties under 3, no Furnace Leap below 3 players.
**Yells:** pull Brokk "Örsün sesini duyuyor musun? Seni dövmek için çalıyor!" · Dorlita "Brokk, ateşi yak! Tek parça çıkan olmasın!" · Brokk dies "Dorlita... bitir onları..." · Dorlita dies "Brokk... ben... sustum..." · survivor "SESSİZ... KALMAYACAĞIM!"

**Elden Ring layer: the Machinists.** Posture: Dorlita `poise: 700`, Brokk `poise: 350` (caster); both have hyper-armour during Crescendo, Scrap Song and Vents.

| Move | Windup / impact | Shape | Damage / effect | Counter / opportunity |
|---|---|---|---|---|
| Dorlita `dorlita_slam` string **Mekanik Üçlü** (basic) | hit 1 at 0.80, hit 2 at 1.55, **hit 3 delayed** at 2.95 (coef 1.8, 0.90 + 0.50 hold) | cone 100 deg, 5.5 m, hit 3 a circle r 4 in front | 3 hits (hit 3 fire) | block, block, roll the late flare slam |
| Dorlita `dorlita_leap` **Fırın Atılışı** (jump) | 1.20 (coef 3.0), lock 0.4 s before landing | circle r 5 on a random non-tank, up to 18 m | coef 3.0 fire + lava puddle r 4, 8 s | leave on the lock, keep the cold corner clean |
| Brokk `brokk_flurry` string **Örs Üçlüsü** | hit 1 at 0.75, hit 2 at 1.45, **hit 3 delayed** at 2.75 | cone 90 deg, 4 m, then a circle r 3 | 3 hits (0.9, 0.9, 1.6), then he blinks 12 m away | stay out of 4 m unless you mean to burn him |

**Breaks:** Dorlita's break: `c.stagger(5, 1.25, 6)` and it **cancels a Crescendo cast in progress** (the cube returns to its pedestal). Brokk's break: 4 s stun, **Molten Metal cancelled and its cooldown +8 s**. **Çatlak Uyum (Resonance):** if both are posture-broken within 6 s of each other, both take **+30 %** for 8 s and the next Crescendo is delayed by 10 s: the intended pair-break payoff, tracked by the script through `isStaggerBroken` on both bodies (also counts toward the "kill both within 10 s" rule, since both are weakened together).

**Loot `loot_tk_b3`** (personal; the paired encounter drops once per player; `{ focus: ['mace','sword1h','gloves','shoulders','tome'], setChance: 0.15, uniqueIds: ['leg_dorlita_hammer','leg_brokk_anvil_staff','leg_crescendo_plate'], uniqueChance: 0.35 }`):

| Named item | Slot / base | Classes | Effect (build-defining) |
|---|---|---|---|
| **Dorlita'nın Eriyik Çekici** (`leg_dorlita_hammer`) | mace | knight, paladin, barbarian, monk | heavy attacks leave a 5 m magma trail for 3 s (30 % weapon damage per second as fire). The heavy-attack trail build. |
| **Brokk'un Örs Asası** (`leg_brokk_anvil_staff`) | staff | mage, warlock, evoker | fire spells have a 12 % chance to forge an **Örs Kıvılcımı**: your next fire spell is instant, free and deals +40 %; every 5th fire hit also leaves an anvil ring (r 4, 3 s) that makes enemies take +10 % fire damage. The fire spam build. |
| **Kızgın Kreşendo Zırhı** (`leg_crescendo_plate`) | chest (plate) | knight, paladin, barbarian | every hit you take adds a stack of **Isı** (max 8, 6 s); at 8 stacks you release a 10 m **Kızgın Kreşendo** wave for 250 % armour-scaled fire damage and take -20 % damage for 4 s (icd 15 s). The "wants to be hit" active-mitigation tank build. |

```ts
boss({ id: 'boss_dorlita', name: 'Sözcü Dorlita', title: 'Usta Makinist', model: MON('Giant'), scale: 1.5, tint: 0x9a7a60, emissive: 0xff7a10, role: 'tank',
  hp: 38, dmg: 2.5, speed: 4.0, radius: 1.6, enrage: 300, arenaR: 22, poise: 700, loot: 'loot_tk_b3', anims: A_ENEMY, resist: { ...R_GOLEM, fire: 0.9 }, visual: { emissiveIntensity: 0.4, runRef: 4 },
  basic: cone('dorlita_slam', 'Mekanik Üçlü', 5.5, 100, 3.6, 1.0, 'Attack', 0.47, { windup: 0.8, telegraph: true, params: { chain: 2, t2: 1.55, c2: 1.0, t3: 2.95, c3: 1.8 } }),
  abilities: [
    cone('dorlita_hammer', 'Eriyik Çekiç', 6, 90, 16, 4.2, 'Attack', 0.47, { initialCooldown: 6, windup: 1.3, telegraph: true, tankBuster: true, parryable: false, damage: { coef: 4.2, type: 'fire' }, statuses: [burn(0.4, 6)] } as Ab),
    custom('dorlita_cannon', 'Lav Topu', 14, 12, 2.0, 'Attack', { sfx: 'boss_cast', params: { impact: 0.5 } }),
    custom('dorlita_crescendo', 'Kızgın Kreşendo', 38, 28, 3.0, 'Attack', { castTime: 3.0, sfx: 'boss_roar', params: { impact: 2.0 } }),
    custom('dorlita_leap', 'Fırın Atılışı', 34, 16, 1.2, 'Attack', { sfx: 'boss_roar', params: { impact: 1.0, leap: 1 } }),
  ],
  phases: [bp('p1', 1.01, ['dorlita_hammer', 'dorlita_cannon', 'dorlita_crescendo', 'dorlita_leap'])],
  intro: 'Brokk, ateşi yak! Tek parça çıkan olmasın!', death: 'Brokk... ben... sustum...',
  arena: { cx: 24, cz: 136, w: 42, h: 42, homeX: 26, homeZ: 128 } });

boss({ id: 'boss_brokk', name: 'Sözcü Brokk', title: 'Usta Makinist', model: CHAR('Mage'), scale: 1.1, tint: 0xc8a070, role: 'caster',
  hp: 38, dmg: 2.0, speed: 4.6, radius: 1.0, enrage: 300, arenaR: 22, poise: 350, loot: 'loot_tk_b3', anims: A_KAYKIT, resist: R_CULT, visual: { hide: mageHide('2H_Staff'), eyeEmissive: 0xffd54a, runRef: 7 },
  basic: proj('brokk_bolt', 'Kor Oku', 16, 40, 2.5, 0.8, 0.8, 'fire', 'fire_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'fire_cast' }),
  abilities: [
    custom('brokk_scrap_song', 'Hurda Şarkısı', 36, 10, 2.5, 'Spellcast_Raise', { sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('brokk_molten', 'Erimiş Metal', 36, 12.5, 2.2, 'Spellcast_Long', { castTime: 2.2, interruptible: true, kick: 2, sfx: 'fire_cast', params: { impact: 1.5 } }),
    custom('brokk_vents', 'Egzoz Delikleri', 38, 20, 2.0, 'Spellcast_Summon', { sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('brokk_flurry', 'Örs Üçlüsü', 8, 5, 0.75, '2H_Melee_Attack_Slice', { params: { impact: 0.3, chain: 2, t2: 1.45, c2: 0.9, t3: 2.75, c3: 1.6, maxRange: 4 } }),   // usable only with a player within 4 m
  ],
  phases: [bp('p1', 1.01, ['brokk_scrap_song', 'brokk_molten', 'brokk_vents', 'brokk_flurry'])],
  intro: 'Örsün sesini duyuyor musun? Seni dövmek için çalıyor!', death: 'Dorlita... bitir onları...',
  arena: { cx: 24, cz: 136, w: 42, h: 42, homeX: 18, homeZ: 122 } });
```

---

### 5.4 Boss 4 (final, showpiece): Başsözcü Eirich, "Boşluğun Son Sözcüsü" (`boss_eirich`)

| hpMult | dmgMult | speed | radius | enrage | Model | Clips |
|---|---|---|---|---|---|---|
| **100** | 2.5 | 4.6 m/s | 1.6 | 360 s | `gen/bosses/eirich` (fallback `Giant` x1.9, tint `0x6a5a7a`, emissive `0x7a3cff` x0.6) | `Idle`, `Walk`, `Run`, `Attack`, `Attack2`, `Cast`, `Hit`, `Death` |

Arena: Fısıltı Salonu, 96 x 72 m, violet fracture rings on the floor, the dead Awakening Wheel hanging in a violet void above. **Two Void Rifts** sit at the room's edge (`rift_spot_1` west, `rift_spot_2` east); four more sockets (`rift_spot_3..6`) are used when rifts relocate. A rift kills anything within 3 m. **Before the pull** the two Rock Smashers of `tk_p31` stand near the door: pulling both at once ramps their damage fast.

**Structure (our "showpiece" additions are tagged ADD; everything else is the WoW kit):**
- **P1 (100 to 65 %):** Void Rifts, Void Corruption, Entropic Reckoning, Unbridled Void, tank claw.
- **Intermission 1 (at 65 %) ADD: Yarık Dalgası** (`eirich_rift_surge`): Eirich goes to the centre, immune, channelling for up to 24 s; both rifts **widen from 3 m to 7 m** over 8 s; two waves of adds (kick check, uses the trash casters).
- **P2 (65 to 35 %):** P1 kit.
- **Intermission 2 (at 35 %) ADD:** three rifts, wave of two Despoilers and two Voidsouls.
- **P3 (35 to 0 %):** faster cadence, three rifts open.
- **Finale (15 %) ADD: Boşluk Çöküşü** (`eirich_collapse`): two void beams sweep the arena for 14 s, soft enrage.

| Ability (id, TR) | First / cd | Windup | Shape | Damage / effect | Counter | Kit |
|---|---|---|---|---|---|---|
| `eirich_claw` **Boşluk Üçlüsü** (basic string, Elden Ring layer) | - / 3.8 (3.2 in P3) | hit 1 at 0.75, hit 2 at 1.50, hit 3 delayed at 2.85 | cone 100 deg, 5.5 m, hit 3 cone 120 deg 6 m + violet scar r 2.5 for 4 s | coef 1.0, 1.0, 2.0 physical/shadow | tank | EXISTS + string (SP-24) |
| `eirich_leap` **Boşluk Sıçrayışı** (Rift Leap, Elden Ring layer) | 26 (14 from phase 2) / 34 | 1.20 (coef 3.0): he vanishes into a rift 0.6 s, the circle follows a random non-tank 1.0 s, locks, lands 0.4 s later | circle r 5 | coef 3.0 shadow + a void pool r 3 for 15 s (0.4 coef per 0.5 s, M+) | leave on the lock, drop Reckoning pools away from it | EXISTS `circle(follow)` + `zone()` |
| `eirich_grasp` **Boşluk Kavrayışı** (Void Grasp, Elden Ring layer, perilous) | 30 / 42 | 1.20 (coef 4.2): violet glow, red glyph | grab on `tankOf(c)` if within 4.5 m | coef 4.2 shadow + 2 `void_mark` stacks, unblockable and unparryable | **dodge it**; a dodged grasp leaves him in recovery 2.5 s (+25 %, poise damage x2). A tank swap is not the answer | EXISTS (perilous cone + status) |
| `eirich_void_claw` **Boşluk Pençesi** (tank buster) | 8 / 15 (13 in P3) | 1.3 | cone 60 deg, 7.5 m, not parryable | coef 4.0 shadow + **Boşluk İşareti** (`void_mark`: 20 s, max 4, **+25 %** shadow damage taken per stack). Toast at 3 stacks "Tank değiştir!" | **tank swap at 3 stacks** (`tankSwapHint` reads the stacks on `tankOf(c)`) | EXISTS cone + status; tank-swap toast = SP-09 |
| `eirich_corruption` **Boşluk Yozlaşması** (Void Corruption) | 0.5 / 55 (45 in P3) | 2.0 cast | every living player | stacking DoT `void_corruption`: +1 stack every 3 s (script re-applies), each stack **0.35 % max HP per second** (max 12 stacks; uses the **existing** `StatusRule.maxHpPctPerSec` rot of `src/data/statuses.ts` (the Kirlenme status) with `hpFloorPct` left unset so it can kill: no new rule field is needed), **not dispellable** | **walk 3.4 to 15 m from an open rift and hold 1.6 s** to dump it into the rift; one cleanse per rift per 2.5 s: **fragile classes and the healer first, the tank last**. After 2 cleanses a rift **closes and reopens on another socket** (M+) | EXISTS `statuses`; cleanse zone = **NEW SP-08** (fallback: script polls distance to open rifts and removes the status via a new `removeStatusPlayer`) |
| `eirich_reckoning` **Entropik Hesaplaşma** (Entropic Reckoning) | 20 / 45 (34 in P3) | 2.0 cast + 1.5 s marker | every player gets a ring r 8 that follows them for 1.5 s, then **drops** as a pool at that spot | pool r 8 lasts **90 s and shrinks to r 2.5**, coef 0.55 per 0.5 s shadow. Pools stack their damage only on overlap of different owners | drop pools at the **edge**, keep dodge space; the tank may drop onto an existing pool | EXISTS `circle(follow)` + `zone()`; shrink = **NEW SP-06** (fallback: three chained persist zones r 8 / 5.5 / 3 of 30 s each) |
| `eirich_unbridled` **Dizginsiz Boşluk** (Unbridled Void) | 12 / 28 (22 in P3) | 2.4 telegraph then 3.0 s channel | **90 deg cone, 60 m** toward a random player (about a quarter of the hall) | coef 1.8 shadow per 0.5 s while it holds | run through to the side or behind him | EXISTS `wedge()` + `persist {duration 3, tick 0.5}` |
| `eirich_rift_surge` **Yarık Dalgası** (intermission 1 and 2) | at 65 % / 35 % | 1.0 | rifts widen 3 -> 7 m over 8 s (kill zone grows) | wave A at 0 s: **2 `tk_ruh`** (Uluyan Korku, K2 kick check); wave B at 8 s: **2 `tk_uluyan`** (Delici Çığlık, K2) + 6 `tk_hurda` (intermission 2: 2 `tk_yagmaci` + 2 `tk_ruh`). Adds have HP 3 x `partyHp`, 0 forces. Ends when every caster is dead or at **24 s**; **each caster alive at the end gives Eirich +12 % damage permanently** | kill the casters, kick the fears, stay out of the growing rifts | EXISTS pattern (Azrakel phylacteries / Zakhar ritual) = **NEW SP-05** helper `runIntermission`; growth = SP-06 |
| `eirich_collapse` **Boşluk Çöküşü** (15 %) | at 15 % | 1.5 | two void bands (90 x 5 m) from the rifts rotate around the centre at **22 deg/s** for 14 s while two Unbridled Voids are cast | coef 1.5 shadow per 0.4 s + knockback 4 m; soft enrage +5 % damage / 5 s afterwards | run with the rotation, outside the beams | EXISTS `band()` fallback (a new band every 0.5 s, 11 deg step); clean = **NEW SP-06 `spin`** |

Phases (mechanic phases have `abilities: []`, the script ends them):
```ts
const EIRICH_COMBAT = ['eirich_void_claw', 'eirich_leap', 'eirich_grasp', 'eirich_corruption', 'eirich_reckoning', 'eirich_unbridled'];
phases: [
  bp('p1', 1.01, EIRICH_COMBAT),
  bp('p2', 0.65, [], { yell: 'Çatlağı duyuyor musunuz? Her fısıltı bir kapı!', ability: 'eirich_rift_surge' }),
  bp('p3', 0.649, EIRICH_COMBAT),
  bp('p4', 0.35, [], { yell: 'Kasa açılıyor! Sözcüler... bana gelin!', ability: 'eirich_rift_surge' }),
  bp('p5', 0.349, EIRICH_COMBAT),   // faster cd via cdOverride in onPhase
  bp('p6', 0.15, EIRICH_COMBAT, { yell: 'BOŞLUK İSTİYOR... VE ALACAK!', ability: 'eirich_collapse' }),
],
```

**Duties.** Tank: swap at 3 Boşluk İşareti stacks, never cleanse first, drop your Reckoning pool on an existing pool. Healer: cleanse in your turn, cooldowns for Reckoning overlaps, keep the group above the Corruption ramp. DPS: **sort the cleanse order before the pull** (say it in chat: fragile classes first), kick the wave casters, stay out of the cone, pools at the edge. Interrupt targets: only in the intermissions (the casters).
**Party scaling:** rifts open 2 (1 for a party of 2, 1 solo), Reckoning pools one per living player, intermission waves halve below 3 players, no Leap below 3 players, the Grasp stays (it only needs a tank in reach).
**Yells:** pull "Taşın sesi kesildi. Boşluk konuşuyor, ve ben dinliyorum." · 65 % "Çatlağı duyuyor musunuz? Her fısıltı bir kapı!" · 35 % "Kasa açılıyor! Sözcüler... bana gelin!" · 15 % "BOŞLUK İSTİYOR... VE ALACAK!" · death "Ses... yeniden... sessizlik... teşekkürler..."

**Elden Ring layer: Eirich.** Posture `poise: 1000`, hyper-armour during Corruption, Reckoning and Unbridled, **immune (bar frozen) during the intermissions**.

| Move | Windup / impact | Shape | Damage / effect | Counter / opportunity |
|---|---|---|---|---|
| `eirich_claw` string **Boşluk Üçlüsü** (basic) | hit 1 at 0.75 (coef 1.0), hit 2 at 1.50 (coef 1.0), **hit 3 delayed** at 2.85 (coef 2.0, 0.95 + 0.40 hold) | cone 100 deg, 5.5 m; hit 3 cone 120 deg, 6 m, leaves a violet scar r 2.5 for 4 s (0.5 coef per 0.5 s) | 3 hits | block, roll the late one, do not stand in the scar |
| `eirich_leap` **Boşluk Sıçrayışı** (jump) | 1.20 (coef 3.0), lands 0.4 s after the lock | circle r 5 on a random non-tank | coef 3.0 + void pool r 3, 15 s | leave on the lock |
| `eirich_grasp` **Boşluk Kavrayışı** (grab, perilous) | 1.20 (coef 4.2), red glyph | on `tankOf(c)` within 4.5 m | coef 4.2 + 2 `void_mark` stacks | roll at the glow; a dodge gives a 2.5 s recovery window |

**Posture break (combat phases only):** `c.stagger(5, 1.25, 6)`, **cancels the current windup**, **delays the next three casts by 6 s** and **resets every rift's cleanse cooldown** (instant cleanses for 6 s): a break is also the healer's best moment to clear Void Corruption stacks.

**Loot `loot_tk_b4`** (personal; final boss rule: one guaranteed item plus `extraItems: 1`; `{ focus: ['staff','helm','chest','legs','dagger','wand'], setChance: 0.25, extraItems: 1, uniqueIds: ['leg_eirich_staff','leg_eirich_crown','leg_eirich_dagger'], uniqueChance: 0.40 }`):

| Named item | Slot / base | Classes | Effect (build-defining) |
|---|---|---|---|
| **Eirich'in Fısıltı Asası** (`leg_eirich_staff`) | staff | mage, warlock, evoker | Shadow and Arcane spells have a 10 % chance to leave a **Boşluk Yankısı**: the same spell repeats 1.5 s later at 60 % damage. The echo-caster build. |
| **Boşluk Sözcüsü Tacı** (`leg_eirich_crown`) | helm | caster / healer | your Shadow damage-over-time effects tick 25 % faster; every 8th tick echoes as a 6 m nova for 40 % of the tick; targets with 3 or more of your DoTs take +10 % damage from you. The Shadow-DoT build (Azap). |
| **Son Sözcü'nün Hançeri** (`leg_eirich_dagger`) | dagger | rogue, demon hunter | a **backstab** (from behind) or a Kritik Vuruş opens a rift under the target: enemies within 5 m are pulled in and take +15 % damage for 6 s (icd 12 s). The positional burst build (Suikastçı, Gölge). |

End-of-run chest: `gp('chest_epic')` next to the exit portal (M+).

```ts
boss({
  id: 'boss_eirich', name: 'Başsözcü Eirich', title: 'Boşluğun Son Sözcüsü', model: GENB('eirich') /* fallback MON('Giant') */, scale: 1.0, tint: 0x6a5a7a, emissive: 0x7a3cff, role: 'melee',
  hp: 100, dmg: 2.5, speed: 4.6, radius: 1.6, enrage: 360, arenaR: 38, poise: 1000, loot: 'loot_tk_b4', anims: A_GEN, resist: { ...R_VOID, physical: 0.15 }, visual: { emissiveIntensity: 0.6, runRef: 4.6 },
  basic: cone('eirich_claw', 'Boşluk Üçlüsü', 5.5, 100, 3.8, 1.0, 'Attack', 0.5, { windup: 0.75, telegraph: true, params: { chain: 2, t2: 1.5, c2: 1.0, t3: 2.85, c3: 2.0 } }),
  abilities: [
    cone('eirich_void_claw', 'Boşluk Pençesi', 7.5, 60, 15, 4.0, 'Attack2', 0.5, { initialCooldown: 8, windup: 1.3, telegraph: true, tankBuster: true, parryable: false, damage: { coef: 4.0, type: 'shadow' }, statuses: [{ status: 'void_mark', duration: 20, stacks: 1 }] } as Ab),
    custom('eirich_corruption', 'Boşluk Yozlaşması', 55, 0.5, 2.0, 'Cast', { castTime: 2.0, sfx: 'boss_cast', params: { impact: 1.5 } }),
    custom('eirich_reckoning', 'Entropik Hesaplaşma', 45, 20, 2.0, 'Cast', { castTime: 2.0, sfx: 'boss_cast', params: { impact: 1.5 } }),
    custom('eirich_unbridled', 'Dizginsiz Boşluk', 28, 12, 2.4, 'Cast', { sfx: 'boss_roar', params: { impact: 2.4 } }),
    custom('eirich_leap', 'Boşluk Sıçrayışı', 34, 26, 1.2, 'Attack2', { sfx: 'boss_roar', params: { impact: 1.0, leap: 1 } }),
    custom('eirich_grasp', 'Boşluk Kavrayışı', 42, 30, 1.2, 'Attack2', { perilous: true, sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('eirich_rift_surge', 'Yarık Dalgası', 999, 9999, 1.0, 'Cast', { sfx: 'boss_roar' }),
    custom('eirich_collapse', 'Boşluk Çöküşü', 999, 9999, 1.5, 'Cast', { sfx: 'boss_roar' }),
  ],
  phases: [/* the six phases above */],
  intro: 'Taşın sesi kesildi. Boşluk konuşuyor, ve ben dinliyorum.', death: 'Ses... yeniden... sessizlik... teşekkürler...',
  arena: { cx: 144, cz: 36, w: 90, h: 66, homeX: 144, homeZ: 28 },
});
```

Mechanic entities and statuses the bosses need are collected in §8.2 (SP-15, SP-21).


---

## 6. Mythic+ tuning

**Which curve governs.** CORE_MECHANICS §6 (precedence ARCHITECTURE > CORE_MECHANICS > the other GDDs): HP **and damage** scale by `c(L) = 1.08^(L-1)` for L <= 10 (x2.00 at +10) and by x1.10 per level above 10 (`c(15) = 3.22`, `c(12) = 2.42`). Fortified: trash +20 % HP, +30 % damage. Tyrannical: bosses +30 % HP, +15 % damage. Party HP `1 + 0.7 (n - 1)`. Thresholds: +3 at 60 % (18:00), +2 at 80 % (24:00), +1 at 100 % (30:00), death penalty +15 s each, timer 1800 s, required forces 400. **Code note for CM7:** `mplusHp` in `src/data/mythicAffixes.ts` still returns `1.10^(L-1)` (x2.36 at +10) and `mplusDmg` has no step above +10; both must become `L <= 10 ? 1.08^(L-1) : 1.08^9 * 1.10^(L-10)`. The first draft of this file used `1.10^(L-1)`; against CORE the +10 bosses would be 15 to 18 % shorter (Seda 1:25 instead of 1:41, clean +10 about 22:40). The fix applied here: **all boss hpMults were raised by 18 %** (`2.358 / 1.999`): Seda 45 -> 53, Skarmorak 60 -> 70, Machinists 32 + 32 -> 38 + 38, Eirich 85 -> 100, so the designed fight lengths and the "clean +10 sits at the +2 line" target stay. Every table below is computed from `c(L)`.

### 6.1 Boss time model

Time to kill with 5 players at par DPS and 80 % uptime: `T = hpMult x 3.8 / (5 x 0.8) x c(L) = hpMult x 0.95 x c(L)` seconds (x1.3 on a Tyrannical week). Eirich adds 2 x 20 s of immune intermission. The Elden Ring posture windows (§5) are **not credited** (they only shorten fights). Numbers are **targets to verify with SimBench (CM4)**, not measurements.

| Boss (hpMult) | +5 Fort (c 1.36) | +10 Fort (c 2.00) | +10 Tyr | +15 Fort (c 3.22) | +15 Tyr | Enrage |
|---|---|---|---|---|---|---|
| Otomat Seda (53) | 1:09 | **1:41** | 2:11 | 2:42 | 3:31 | 4:00 |
| Skarmorak (70) | 1:30 | **2:13** | 2:53 | 3:34 | **4:38** | 4:30 |
| Makinistler (38 + 38) | 1:38 | **2:24** | 3:08 | 3:52 | 5:02 | 5:00 |
| Eirich (100, incl. 2 x 0:20) | 2:49 | **3:50** | 4:47 | 5:46 | 7:18 | 6:00 |
| **Sum** | 7:06 | **10:08** | 12:58 | 15:54 | 20:29 | |

Reading: with perfect uptime the first enrage to be crossed is **Eirich's 6:00 from about +13 on a Tyrannical week (+12.7) and about +16 Fortified (+15.5)**; Skarmorak's 4:30 follows at +14.7 Tyrannical and the Machinists' 5:00 at +14.9 (both about +15). That is the intended soft ceiling: above roughly +13 the keys become DPS checks (intermission uptime, burst windows), and loot ilvl stops growing at +12 anyway (CORE §4.4: `68 + 2 x min(L, 12)`). If SimBench shows a different DPS par, scale all four hpMults together and keep the ratios.

### 6.2 Route A pull plan and forces

Required 400, route A takes **19 pulls, 408 forces** (p31's two Rock Smashers are left out once 100 % is reached; they stand next to the Eirich door and are a free skip for a careful tank). Cumulative percent is of 400. Computed from the pack data of §4.4 (SP-20 `mplus-pace` reproduces this table).

| Pull | Packs | Forces | Cum | % | Notes |
|---|---|---|---|---|---|
| P1 | p01 + p02 | 24 | 24 | 6.0 | swarm piles wake at 6 m; the Büyük Merdiven is behind you |
| P2 | p03 | 13 | 37 | 9.3 |  |
| P3 | p04 + p05 | 27 | 64 | 16.0 | **gate pull**, tank at the north wall |
| P4 | p14 | 12 | 76 | 19.0 | **ambush the patrol alone** on the south rim as it passes (it never joins a flank pack) |
| P5 | p07 + p08 | 29 | 105 | 26.3 | west flank south: three must-kicks + a Forge Loader; Kudret shrine is 3.1 tiles from p07; pull away from the chasm edge (shove) |
| P6 | p12 + p06 | 28 | 133 | 33.3 | west flank north |
| P7 | p09 + p11 | 26 | 159 | 39.8 | east flank south, swarm piles wake |
| P8 | p13 + p10 | 29 | 188 | 47.0 | east flank north: Despoiler + Rock Smasher with totem |
| P9 | p15 | 8 | 196 | 49.0 | Otomat Geçidi (on the ramp) |
| | **Boss 1 Otomat Seda** | | | | |
| P10 | p21 + p25 | 22 | 218 | 54.5 | east road + the patrol at the hall mouth |
| P11 | p24 + p22 | 29 | 247 | 61.8 | column south and middle (double pull, defensives ready) |
| P12 | p23 + p26 | 29 | 276 | 69.0 | column north + door guards |
| | **Boss 2 Skarmorak**, cart to the hub | | | | |
| P13 | p16 + p17 | 26 | 302 | 75.5 | Forge Loader #1 (use the Usta Örsü first) |
| P14 | p18 | 13 | 315 | 78.8 |  |
| P15 | p19 + p20 | 26 | 341 | 85.3 | Forge Loader #2 + door guards |
| | **Boss 3 Makinistler**, cart to the hub, back through Seda's room | | | | |
| P16 | p27 | 16 | 357 | 89.3 |  |
| P17 | p28 | 14 | 371 | 92.8 | totems: kill them inside 7 s |
| P18 | p29 | 18 | 389 | 97.3 | Smasher + Honor Guard, Koruma shrine (P18 + P19 together is the Katliam) |
| P19 | p30 | 19 | 408 | 102.0 | 100 % reached; p31 optional |
| | **Boss 4 Eirich** | | | | |

**Route B (Ambar route, §3.5):** p01-p03, the optional Ambar cluster p32-p34, Eski Raylar p35, the west hall p17-p20, p16, the hub west door, p06, p12, the **p14 patrol (killed, not skipped)**, p15, Seda; then the east wing with the hub east flank p13, p10, p11 on the way, the Makinistler room, Titan p27-p30. It skips **p04, p05, p07, p08, p09 and p31 (92 forces)** and adds the Ambar and tunnel (70): 498 - 92 = **406 forces (101.5 %)**, still 100 %. It trades the two kick-dense hub-south pulls and the gate pull for one dense optional cluster with a dormant swarm: better for groups with strong AoE and defensives; route A is better for groups with strong interrupts. The patrol is the same risk in both routes (it laps the rail ring about every 71 s) but it cannot chain a pack in either, since it keeps at least 4.5 tiles from every other pack.

### 6.3 Timer math for a +10 Fortified party (route A)

| Section | Pulls | Trash and walking | Boss | Doors, carts, intros | Section | Cumulative |
|---|---|---|---|---|---|---|
| Entry to hub gate | P1-P3 | 1:40 | - | 0:10 | 1:50 | 1:50 |
| Hub | P4-P9 | 2:45 | - | - | 2:45 | 4:35 |
| Seda | - | 0:20 | 1:41 | 0:25 | 2:26 | 7:01 |
| East wing | P10-P12 | 2:00 | 2:13 | 0:25 + cart 0:30 | 5:08 | 12:09 |
| West wing | P13-P15 | 1:40 | 2:24 | 0:25 + cart 0:30 | 4:59 | 17:08 |
| Titan Tünelleri | P16-P19 | 2:30 | - | - | 2:30 | 19:38 |
| Eirich | - | 0:15 | 3:50 | 0:25 | 4:30 | **24:08** |

A clean +10 Fortified run is **24:08 (80.4 %)**, right at the +2 line (24:00); a typical run with one death (+0:15) and some hesitation is about **25:15**, a solid +1. Tyrannical +10: bosses +2:50, trash a little faster (-0:35): clean about **26:23**, typical **27:30** (92 %). A clean +5 Fortified run is about 20:20 (68 %): +3 (18:00) needs skips (route B skips or the p31 skip) and is meant for keys up to about +4. Trash kill time alone is only about 3:10 at +10 because mobs die fast in our ARPG combat; the dungeon is paced by **walking, kicks, the bridges and the two cart rides**, not by HP bags. The vertical layout adds no time on route A: the grand stair, the ramps and the descent are walked while pulling, and the carts take 5 s each. Per-pull budget: 19 pulls x about 25 s (gather, position, react) plus about 190 s of killing.

### 6.4 Dangerous pulls (called out in the HUD notes and the QA bot)

1. **p04 + p05** (gate pull, 27 forces): two kick-casters and a Honor Guard with a stampede and a guard-break. Wall tank mandatory.
2. **P5 p07 + p08 (hub west flank south)**: three must-kicks plus a Forge Loader whose Omuz Darbesi shoves 4 m: pull to the south wall, never with the chasm behind the tank. The patrol is **not** part of this pull any more (it is ambushed in P4 and never comes within 16 m of a flank).
3. **p10**: a Rock Smasher beside a Stoneshaper: kill the totem inside 7 s or the non-tanks die; Yer Tepmesi (leap) lands on the tank.
4. **p17 and p19** (west hall, Forge Loaders 10 tiles apart with p18 between them): pull them separately; a Loader's Kepçe Üçlüsü third hit is a delayed slam, do not roll on the second.
5. **P11 p24 + p22 (east column)**: up to two Void Outbursts, a Sıçrayış grab and a Despoiler string: the "Abyssal Surge" pull, only with defensives; p23 stays behind.
6. **p29 + p30 + p31** (Titan): 57 forces within 8 tiles, two Smashers ramping Smash Rock; the Katliam p29 + p30 is the biggest legal pull, never add p31; Koruma on p29/p30.
7. **p33** (optional Ambar): Rock Smasher + Stoneshaper + two Speakers beside a dormant swarm.
8. **More Howlers/Voidsouls than interrupts** (p04, p07, p23, p30): fewer than three kicks in the group means the pull is split.

### 6.5 Affix interactions

| Affix | Taşkasa effect | Advice |
|---|---|---|
| Tahkimli (Fortified, even weeks) | Elites (Loaders, Smashers, Honor Guards) take 20 % longer and have more poise to chew; casters with `kick` 2 are denser per pull | assign a kick order per class; hub flanks and Titan are the checks; parry the Honor Guard's guard-break to break its posture early |
| Zorba (Tyrannical, odd weeks) | Eirich and the Machinists set the pace; the enrage margin at +10 is 1:13 on Eirich | do not wipe on Eirich; defensive plan for Dorlita's Hammer; use posture breaks to claw time back |
| Güçlenen (Bolstering) | swarm packs p01, p11, p14 stack bolster only on every 3rd swarm death (horde rule) | kill casters first but never leave a lone Rock Smasher alive after its Stoneshaper dies |
| Öfkeli (Raging, Zorba weeks) | Honor Guard and Rock Smasher below 30 %: +50 % damage, CC-immune; Granite Eruption x1.5 (stacks with the elite enrage) | burn elites down in one block or kite them; break the posture before 30 % |
| Kan Dökücü (Sanguine) | Titan corridor is only 8 tiles wide: pools overlap | drag packs into the centre of the hall; hub is fine |
| Patlayan (Bursting) | horde rule keeps the swarms sane; Eirich's intermission waves (6 Hurda) with Void Corruption is the danger spot | stagger the swarm kills |
| İlham Veren (Inspiring) | an Inspiring caster pack (p07: 3 must-kicks) cannot be interrupted or CC'd | kill the Inspiring unit first (highest HP x non-swarm) |
| Volkanik (Volcanic) | plumes under players away from enemies: hub bridges, boss rooms | plumes must not spawn within 6 m of the lava chasm or the rifts (SP-19) |
| Sarsıntılı (Quaking) | interrupts casts, including Eirich's 1.6 s cleanse hold | delay your cleanse by the quake telegraph |
| Patlayıcı Küre (Explosive) | orbs in narrow corridors | keep one ranged for orbs in Titan |
| Nekrotik (Necrotic) | stacks on Dorlita's tank, Seda's echo | the tank needs the dispel reward and kiting breaks |
| Kin Dolu (Spiteful) | shades fixate; near the Eirich rifts they are dangerous | kite shades away from rifts, spikes and the hub chasm; they do not spawn from boss adds |
| Fırtınalı (Storming) | tornadoes in the spike field and near rifts; on the bridges a tornado would throw players into the chasm | affix hazards avoid rift, pit and bridge zones (SP-19 `affixSafe`) |
| Ağır Yara (Grievous) | Void Corruption ramp plus Grievous | top the group above 90 % between ticks |
| Efsunlu Yarık (+10) | 6 spots (§3.9) all on solid flat ground, none in boss arenas, none on a slope or a bridge | guardians on the hub bridges are avoided by the spot choice |
| Kibirli (seasonal, CORE_MECHANICS §6) | a Kibir Tecessümü spawns at 20 / 40 / 60 / 80 / 100 % forces | route A hits the thresholds in: hub west flank (80 forces, P5), hub east flank (160, P8), east hall (240, P11), west hall (320, P15), Titan east end (400, P19: pull p30 into the middle first, the slope is steepest there). A spawn that would happen during a boss fight is deferred until the boss dies |

### 6.6 Shrines, Font of Power, rift spots

- **Kehanet Taşı:** `giris` (35.5, 77.8) on the +2.4 terrace. Start (35.5, 80.5), facing 180. The start barrier blocks door D1 for the 10 s countdown.
- **Kudret Sunağı** (`shrine_power`, +25 % damage 30 s) at (22.5, 60.3), hub south-west rim: use it on the P5 pull (west flank south), 3.1 tiles from p07. **Koruma Sunağı** (`shrine_ward`, -25 % damage taken 30 s) at (31.0, 24.3), start of the Titan descent: use it on P18-P19. Fixed types in M+ (route planning).
- **Chests:** wood (47.5, 71.8), gold (20.5, 64.5, in the optional Ambar). In M+ they give gold and a health globe only; the boss personal chests carry the named items (§5).
- **Efsun rift spots:** (27.5, 67.5), (22.5, 53.5), (48.5, 53.5), (66.8, 49.2), (7.5, 53.2), (35, 22).
- **Usta Örsü:** (7.5, 58.2) in the west hall, on the +1.65 terrace; buff 10 min.

### 6.7 Verification and tuning knobs

- `node tools/content-check.mjs taskasa` must report 0 errors: forces 498 = 124.5 % of 400 (error below 115 %), non-optional 428 >= 400, 35 packs, boss anchors present, shrines exactly 2, plus the new rules of §3.9 (P-spacing, P-patrol, V1-V6).
- Add `tools/mplus-pace.mjs` (SP-20): reads `taskasa` pack/forces data and prints this section's pull table and cumulative percent so the route text cannot drift.
- If Tyrannical +10 clean times exceed 28:30 in SimBench, lower Eirich to hpMult 88 first, then Skarmorak to 65. If Fortified +10 is faster than 22:30, raise the trash HP of the elites (`tk_ezici`, `tk_dokum_yukleyici`) by 10 %.
- If the hub feels empty, add `tk_p36` (6 Hurda) to the bridge ends; do not add more than 15 forces without raising `forcesRequired` (keep available 122-126 %). A new pack must obey P-spacing (5 tiles) and P-patrol (4 tiles) before it is accepted.

---

## 7. Entrance

**Zone: Kadim Diyar** (map 3, levels 45-60, `docs/GDD_OPENWORLD.md` roadmap row; not built yet), region **Kor Yarığı** (Ember Fault), the basalt-and-ash badlands in the **north-east quadrant**. Terrain type: **dark basalt plateau with ash drifts, a rust-red cliff face (`gp('rock_cliff')` stacks tinted `0x7a4a34`), thin lava rivers in the side canyons, black glass shards, steam vents**. The entrances of the 8 season dungeons are spread over the two endgame maps; this one is on Kadim Diyar so the vault sits in the volcanic region of the map.

`EntranceDef` (data/world/pois.ts of Kadim Diyar):
```ts
{ id: 'ent_taskasa', name: 'Taşkasa Kapısı', dungeonId: 'taskasa', pos: [/* Kadim Diyar tile, NE basalt plateau, set by the layout */], facing: 180, minLevel: 56, regionId: 'kd_kor_yarigi', look: 'forge' }
```
`look: 'forge'` already exists; SP-18 adds a `vault` look if the gate recipe needs its own branch.

**Region theme sketch (`RegionTheme`):** fog `0x3a2418` near 28 far 120; hemisphere sky `0xd08a58`, ground `0x2a1810`, intensity 0.9; sun `0xffb070` x0.8; sky zenith `0x2a1a22`, horizon `0xc06a3a`; ground tint dark basalt (`dark` slot), red dust (`dirt`), cracked rock (`cobble`); music `world_canyon` (until a Kadim track exists); ambient `ambient_embers`, colour `0xff8c1a`. A "Taş Yol" (`RoadDef kind 'cobble'`) leads to the gate; a waypoint stone `wp_kor_yarigi` stands 12 m away (`Taşkasa girişine 12 m`).

**Fallback until Kadim Diyar exists:** put the same entrance in **Karakır Bozkırı**, dry-steppe half, at the red-rock outcrop in the south-east near tile (150, 108) of the 180 x 140 grid (`regionId: 'karakir_bozkiri'`, `facing 180`), and move it when Kadim Diyar is built. Nothing in the dungeon depends on the zone.

**Grand gate recipe** (follows `docs/MAP_UI.md` §3.3; local frame: door at the origin, +z toward the approach, footprint 14 m x 11 m; scales are targets, read the real bounds with `tools/glb-inspect.mjs`):

| Part | Model | Local position (m) | Scale / tint | Notes |
|---|---|---|---|---|
| Cliff face | `gp('rock_cliff')` x6 | (-9, 0, -3), (-4.5, 0, -4), (0, 0, -4.5), (4.5, 0, -4), (9, 0, -3), (0, 4, -4) | scale 1.6, tint `0x7a4a34` | the mountain the vault is cut into |
| Gate | **NEW `tk_rune_gate_grand`** | (0, 0, 0) | scale 1.4 (11 x 12.6 m) | frame with the gold glyph column; until it exists use `kc('wall-narrow-gate')` x2 scaled 3 tinted `0x8a6a50` |
| Titan pillars x2 | `tk_titan_pillar` (fallback `dg('pillar_decorated')` x2.4) | (-6.5, 0, 1.5), (6.5, 0, 1.5) | scale 1.2, glyph emissive `0xffd54a` | |
| Lava pours x2 | `tk_lava_fall` | (-4.2, 0, -0.8), (4.2, 0, -0.8) | scale 1.0 | emissive only |
| Portal door | `DungeonPortal` (`gp('mplus_portal')`) | (0, 2.0, 0.3) | scale 1.6, tint from `PORTAL_TINTS['taskasa'] = 0xffa43c` | the existing interactable, opens the keystone panel |
| Stairs | `kc('stairs-stone')` x5 | from z +5.5 (y 0) to z +1.5 (y 2.0), 3.5 m wide | tint `0x8a6a50` | |
| Braziers x2 | `gp('brazier')` | (-3.8, 0, 2.6), (3.8, 0, 2.6) | scale 1.2, `vfx 'brazier_fire'` | no extra light |
| Standards x2 | `dg('banner_patternA_brown')` | (-5.4, 0, -1.2), (5.4, 0, -1.2) | scale 1.6 | height about 3.5 m |
| Sentinels x2 | `gp('statue_hooded')` | (-8, 0, 4), (8, 0, 4) | scale 1.6, tint `0x8a7a68` | Taşdoğan guards |
| Rally board | `gp('notice_board')` | (-4.8, 0, 7.5) | scale 1.0 | "Toplanma Panosu", prop + nameplate only (not a waypoint) |
| Light | `LightPool.add([0, 3.2, 0.5], ...)` | one | colour `0xff8c1a`, distance 9, priority 2 | the single gate light |
| Nameplate | label | above the arch | "Taşkasa · Sv. 56-60" | grey with "Sv. 56 gerekli" when locked |
| Keep-clear | `WorldDecor` avoid | radius 7 m | | trees and rocks must not block the stairs |

Return after a run: the party spawns 6 m in front of the door (`DungeonParams.returnTo`). The **Kadim Kapılar Salonu** in Kuzgunkale gets a portal for `taskasa` (tint `0xffa43c`, unlock rule C of `MAP_UI.md` §3.4: opens after the world gate was seen or after a Normal-equivalent clear; for the season dungeons "seen the gate" is enough). Mitik+ keys work from the hall.


---

## 8. Implementation packages (for Haiku) and shared primitives

Process (from the project memory): Opus plans, Sonnet designs and reviews, Haiku codes. After each Haiku block a Sonnet review of the diff, then a Haiku fix pass; **no per-agent browser tests**, at most 5 concurrent agents, one Haiku QA pass at the end. Packages are **file-disjoint** so Taşkasa can be built in parallel with the other seven dungeons.

### 8.1 Taşkasa packages

| Package | Files (create / touch) | Content | Depends on | Done when |
|---|---|---|---|---|
| **TK-A Layout data** | `src/data/dungeons/taskasa.ts` (new), `src/data/dungeons/index.ts` (register in `DUNGEONS`; `MPLUS_POOL`/`DUNGEON_IDS` per SP-18) | `ROOMS`, `DOORS`, `BOSSES`, `THEME`, `ROOM_EXTRA` (with the SP-22/23 height fields), `EXTRAS`, `PACKS` (+ flags, `linkedTo`) exactly as §3.6, §3.9, §4.4; `lore`, `loadingImage`; `timerSec 1800`, `forcesRequired 400`, `grid 72 x 84`. Import decor from TK-D. | SP-11 (validator rules incl. P-spacing, P-patrol, V1-V6), SP-12 and SP-22/23 optional (fallback styles and flat mode are in the skeleton) | `node tools/content-check.mjs taskasa` has 0 errors; forces 498 / 428 / 400; 17 rooms, 17 doors, 35 packs |
| **TK-B Enemy, loot and status data** | `src/data/enemies/taskasa.ts` (new, `registerTaskasa()`), `src/data/enemyKit.ts` (SP-01, the pool-wide kit path), `src/data/enemies.ts` (re-export + call), `src/data/loot.ts` (+4 tables with `uniqueIds`), `src/data/uniques.ts` (+12 named items, §5), `src/data/statuses.ts` + `src/types/skills.ts` (SP-21 ids), `src/dev/contentRoster.ts` (summons list) | 12 trash defs + `tk_totem` from §4.3 (with poise, strings, leaps), the MECH entities (SP-15), 5 `boss({...})` defs from §5 (with `poise`), loot tables `loot_tk_b1..b4`, 12 named uniques (3 per boss), statuses | SP-01, SP-09, SP-15, SP-17, SP-21, SP-24 (strings); models: fallbacks from §2.6 | defs load; every ability id referenced by a boss phase exists; every string def has `params.chain` or a summed-coef fallback |
| **TK-C Boss scripts** | `src/ai/bosses/taskasa.ts` (new), `src/ai/bosses/index.ts` (register `TASKASA_SCRIPTS` and `TASKASA_SPAWNS` in `BOSS_SCRIPTS` / `BOSS_SPAWNS`) | the 5 `BossScript`s of §5 (abilities, `update()` loops for spikes, shards, fragments, shell, cube, rifts, cleanse, intermissions, sibling hook, `tankOf`, strings, leaps, posture reactions) | TK-B, SP-02..SP-09, SP-24 (each has a fallback, write the fallback first) | scripts compile; spawn lists: Seda `['proc_volatile_spike']`, Skarmorak `['proc_crystal_shard','proc_unstable_fragment']`, Machinists `['proc_scrap_cube','proc_magma_blob']`, Eirich `['proc_void_rift','tk_ruh','tk_uluyan','tk_hurda','tk_yagmaci']` |
| **TK-D Decor** | `src/data/dungeons/taskasa_decor.ts` (new) | `decorator()` per room from the §3.7 dressing lists (anchors exact, `Props.torches/wall/ring/scatter`, galleries and chandeliers at absolute y), helpers `shrine()`, `piles()` from `kemik_mahzeni.ts` (copy, do not import across dungeons) | TK-A, models or the fallback map below | `content-check`: no collide prop near a member or patrol, no prop in a door gap, anchors present, at least 4 props per room |
| **TK-E New mechanics** | `src/entities/interactables/TransitCart.ts`, `BuffStation.ts` (new) + `index.ts`, `src/scenes/DungeonScene.ts` (build from `extras.transits` / `extras.stations`), `src/types/dungeons.ts` (`extras.transits`, `extras.stations`, `PropPlacement.spin`, and the SP-22/23 fields `floorY`, `ceiling`, `slopes`, `terraces`, `galleries`, `ZoneDef.y`, `ZoneDef.fall`, `PackDef.linkedTo`), `src/world/DungeonBuilder.ts`, `src/world/NavGrid.ts`, `src/world/World.ts` (`groundY`) | SP-13, SP-14, SP-16 specs of §3.8 and §8.2; **SP-22 (heightfield and ceiling) and SP-23 (chasm and fall rule) are the engine-risk items of this dungeon and of the whole pool: build them first, in one block, with the flat mode as the escape hatch** | none (data lives in TK-A) | cart rides the party to the hub after the boss (visibly dropping/climbing 2.4 m); the anvil grants the buff once per player; a player on the hub bridge knocked into the pit takes the fall rule and respawns on the rim; NavGrid refuses a 0.6 m step outside a strip |
| **TK-F Assets** | `tools/blender/props/props_taskasa.py` (new, category `taskasa`, registered in `build_props.py` module list and `manifest.json`), `tools/blender/bosses/boss_otomat_seda.py`, `boss_skarmorak.py`, `boss_dorlita_mech.py`, `boss_eirich.py` (new, ids added to `ALL` in `gen_bosses.py`), `src/ai/procModels.ts` (7 proc bodies), `tools/blender/loading/render_taskasa.py`, `docs/assets/generated-props.md` regenerated | the **30 prop ids** of §2.6 (23 original + `tk_chandelier_forge`, `tk_gallery_rail`, `tk_bridge_stone`, `tk_stalactite`, `tk_stair_grand_face`, `tk_titan_statue`, `tk_banner_long`), 4 boss models, the loading screen render | none | `node tools/glb-inspect.mjs public/assets/models/gen/props --short` lists all new props; previews regenerated |
| **TK-G Entrance, portal, audio** | `src/data/world/pois.ts` (entrance, when Kadim Diyar exists; otherwise the Karakır fallback), `src/data/town.ts` (`PORTALS` + `PORTAL_TINTS['taskasa']`), `src/types/audio.ts` (`dungeon_taskasa`), `public/assets/audio/music/` (new track), `docs/assets/credits-itch.md` (CC BY credit for the goblinatron pack) | §7 recipe, portal, music id | SP-18 | the entrance panel opens the keystone panel for `taskasa` |
| **TK-H QA (one Haiku pass at the end)** | none | run `node tools/content-check.mjs`, a headless boss-script smoke (each ability handler runs once on a mock controller, strings fire all their hits, `tankOf` returns the boss target for a Barbarian-class dummy), then one browser pass: enter on Mitik 0, insert a key, walk the route (stair, ramps, bridges, descent: no stuck tiles, camera does not clip the ceiling), kill each boss with the dev kill key, check the cart, the anvil, the Eirich door after both wings, one posture break on an elite and on a boss | all | report only |

**Fallback props until TK-F lands** (so TK-D is never blocked; swap by changing the helper map in `taskasa_decor.ts`):

| NEW prop | Fallback |
|---|---|
| `tk_rune_gate_grand` | `dg('wall_doorway_scaffold')` x2.2 tinted `0x8a6a50` |
| `tk_lava_fall` | `gp('rock_cliff')` tinted `0xff6a10`, emissive 0.8, flattened (scale 0.6, 1, 0.25) |
| `tk_titan_pillar` | `dg('pillar_decorated')` x1.6 tinted `0xb08868` |
| `tk_rune_block` | `kn('statue_block')` tinted `0x9a7a60` |
| `tk_machine_housing` | `ks('structure-metal')` or `dg('box_large')` x2.2 tinted `0x7a7f88` |
| `tk_awakening_wheel` | `kn('statue_ring')` x3 emissive `0xffd54a` |
| `tk_mine_cart`, `tk_rail_*` | `gp('wagon')` x0.6; rails omitted |
| `tk_cart_station` | `gp('signpost')` + `gp('lamp_post')` |
| `tk_scrap_pile` | `gp('bone_pile')` tinted `0xb08a50` |
| `tk_scrap_block` / `tk_scrap_cube` | `dg('crates_stacked')` x2.2 / `dg('box_large')` x1.5, tint `0x7a7f88` |
| `tk_exhaust_vent` | `dg('floor_tile_big_grate')` + `gp('brazier')` |
| `tk_volatile_spike` | `kn('stone_tallA')` x0.7 |
| `tk_skardyn_crystal` | `gp('crystal_blue')` tinted `0x3fe0c8`, emissive |
| `tk_void_rift` | `gp('crystal_purple')` x2.5 emissive `0x7a3cff` |
| `tk_forge_anvil_great` | `gp('anvil')` x2.4 emissive `0xff8c1a` |
| `tk_ladle_hanging` | `gp('cauldron')` x0.8 at y 3 + `gp('chains_hanging')` |
| `tk_titan_relief` | `kn('statue_head')` x2 on the wall |
| `tk_edna_lens_pedestal` | `kg('altar-stone')` x3.5 |
| `tk_light_shaft`, `tk_cavern_ring` | omitted |
| `tk_chandelier_forge` | `ip('psx-dungeon','chandelier')` x1.4 (hangs 2.9 m from its pivot), or `dg('chandelier')` |
| `tk_gallery_rail` | `dg('wall_half')` x0.5 tinted `0x7a7f88` |
| `tk_bridge_stone` | `kc('stairs-stone')` flattened, or `dg('floor_tile_large')` x2 tinted `0x4a3828` (deck only) |
| `tk_stalactite` | `kn('rock_tallA..J')` hung upside down, scale 0.6, tint `0x4a3020` |
| `tk_stair_grand_face` | `ip('psx-dungeon','stairs_ultrawide')` riser strip, or omitted |
| `tk_titan_statue` | `gp('statue_hooded')` x2.4 tinted `0x8a7a68` |
| `tk_banner_long` | `dg('banner_triple_brown')` x2 stacked |

**Blender run** (headless, no window; Blender path as in `docs/assets/generated-props.md`):
```bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" --background --factory-startup --python tools/blender/props/build_props.py -- --out public/assets/models/gen/props --cat taskasa
"$B" --background --factory-startup --python tools/blender/bosses/gen_bosses.py -- public/assets/models/gen/bosses otomat_seda skarmorak dorlita_mech eirich
node tools/glb-inspect.mjs public/assets/models/gen/props --short && node tools/blender/props/make_doc.mjs
```
Budgets: props <= 600 tris each (wheel, gate and the boss models up to 1500), textures 64 x 64, palette of 8-20 colours, ordered dither, `COLOR_0` AO, emissive strips `KHR_materials_emissive_strength` 2.0. Boss models: one skinned mesh, armature `Rig`, clips `Idle, Walk, Run, Attack, Attack2, Cast, Hit, Death`, faces +Z, origin at the ground.

**Perf budget (ROADMAP P0):** dungeon <= 500 draw calls, <= 350k triangles, <= 8 real lights. Taşkasa is about three times the size of Kemik Mahzeni, so keep walls and floors batched (`Instancing.ts`), use `explicitDecor` on every large room, at most 5 animated emissive props in view, lava falls are emissive cards without lights, and check with the F3 overlay at the hub (the heaviest view) and at the gate pull.

### 8.2 Shared NEW primitives (build once for all 8 dungeons)

SP numbers are local to this doc, the orchestrator should merge by **name**. Every primitive says what Taşkasa uses and the **fallback** so the dungeon is never blocked.

| SP | Name | What and where | Interface sketch | Taşkasa use | Fallback today |
|---|---|---|---|---|---|
| SP-01 | **enemy kit export** (**path chosen: `src/data/enemyKit.ts`**) | move the builders (`cone, proj, aoe, line, heal, buff, charge, summonAb, passive, onDeath, NOOP, MECH, add, boss, bp, custom, bleed, burn, poison`), anim sets `A_*`, resists `R_*`, hide lists and model url helpers from `src/data/enemies.ts` into **`src/data/enemyKit.ts`** (exported; `enemies.ts` imports and re-exports it, so existing code keeps working); one file per dungeon **`src/data/enemies/<dungeon>.ts`** (`src/data/enemies/taskasa.ts`) exporting `registerTaskasa(): void`, called from the bottom of `enemies.ts`, registering into the same `ENEMIES` / `BOSSES` maps. See the decision note below the table | `export { cone, proj, ... } from './enemyKit'`; per-dungeon `export function registerXxx(): void` | all 12 + 5 defs | append a section to `enemies.ts` (merge conflicts with the other dungeons) |
| SP-02 | **bossEnergy** | `BossDef.energy?: { max: number; start?: number; regen: number; onFull?: string; costs?: Record<string, number> }`; `BossController.energy`, `addEnergy(n)`, regen in `fightFrame`, reset on wipe; host broadcasts `bossMsg('boss_energy', { v, max })` at 5 Hz; thin gold bar under the boss health bar | see left | Seda (regen 2.5, `onFull: 'seda_shatter'`), Skarmorak (costs 18 / 20, shell at 0) | fixed casts on timers (§5.1, §5.2) |
| SP-04 | **trackBeam** | kit helper: aim follows a player until `lockAt`, then a line telegraph fills and fires; returns the spec for spike-clearing queries | `trackBeam(c, from, target, { lockAt, delay, length, width, coef, type, onFire(seg) })` | Seda beams, Dorlita Lava Cannon | `circle(follow)` mark + `c.schedule` + `beam()` |
| SP-05 | **runIntermission** | kit helper that generalizes `beginPhylactery`, `endPhylactery`, `zakhar_ritual`: teleports the boss, immune + freeze, `maxSeconds`, add waves, survivor penalty, safety net, then `c.endMechanicPhase()` | `runIntermission(c, { at, maxSeconds, waves: [{ t, enemyId, count, hpMult, positions }], onEnd(survivors) })` | Eirich x2 | copy the Azrakel pattern into the script |
| SP-06 | **HitShape shrink/grow and spin** | `HitShapeSpec.persist.scaleTo?: number` (radius factor reached at the end of `duration`, `<1` shrinks, `>1` grows) and `HitShapeSpec.spin?: { degPerSec: number }` (cone/line/rect rotate); `HitShapes.contains` and the `Telegraph` mesh read them; `ShapeOpts` carries both | `zone(c, x, z, r, 90, 0.5, 0.55, 0.1, { persist: { duration: 90, tick: 0.5, scaleTo: 0.31 } })` | Reckoning pools (r 8 -> 2.5), widening rifts (3 -> 7), rotating void beams | three chained zones; a new `band` every 0.5 s |
| SP-07 | **pairedBoss** | `BossPlacement.group?: string`; `DungeonScene` links the controllers: engage together, reset together, one `boss:defeated` when the group is dead, M+ `bossesTotal` counts groups, one loot roll (table of the last body); `BossScript.onSiblingDeath?(c, dead)` | `bossAt('boss_brokk', 'makinist_odasi', 4, 30, 0, 2, 'makinistler')` | Brokk + Dorlita | scripts poll the sibling; counts 5 bosses |
| SP-08 | **cleanseSpot and removeStatusPlayer** | kit helper: players standing between `rMin` and `rMax` of a spot for `hold` s lose a named status (one player per spot per `cooldown`); `removeStatusPlayer(p, status)` delivers the removal to the owning peer (`pstatus` with `removed: true`) | `cleanseSpots(c, spots, { status, hold: 1.6, cooldown: 2.5, rMin: 3.4, rMax: 15, maxUses: 2, onUse(p, spot) })` | Eirich Void Corruption | script polls distances, `pstatus` removal added locally |
| SP-09 | **stack debuffs, tank identification and tank-swap hint** | (a) `StatusRule.takenMorePerStack?: number` (damage taken x(1 + v x stacks); today `takenMore` is per magnitude only); (b) **`tankOf(c)`** in `src/ai/bosses/kit.ts`: the boss's current target (`boss.targetId`) if a player is inside melee reach, else the top-threat player, else the nearest within 8 m; (c) `pickPlayers(c, n, avoid?: Player \| null)` takes the player to spare instead of a boolean (`isTank()` stays class-based only for the legacy scripts); (d) kit helper `tankSwapHint(c, status, stacks, text)` toasts `tankOf(c)` and the highest-threat other player when the stack count on `tankOf(c)` is reached | `tankSwapHint(c, 'void_mark', 3, 'Tank değiştir!')`; `pickPlayers(c, 3, tankOf(c))` | `fracture`, `void_mark`; Seda's dispel-reward watcher and beam/spike/dive targets, Eirich's swap toast and grasp, Dorlita's hammer | magnitude hack for the stacks (`magnitude = stacks x 0.05`); `isTank()` with the knight-only limitation documented |
| SP-10 | **mustAnswer metadata** | `EnemyAbility.dispel?: StatusId` (the debuff that must be cleansed) shown in nameplates / tooltips; `contentCheck` warns when `interruptible` has no `kick` flag and prints the must-kick count per pack | `dispel: 'void_infection'` | trash tables §4.2 | flags documented only |
| SP-11 | **content-check registries and rules** | boss count rule `bosses.length >= 3` (was `!== 3`) and group-aware; `GDD_BOSSES` and `GDD_ROSTER` derived from the `BOSSES` / `ENEMIES` maps; `FLYING` derived from `EnemyDef.flying`; `BOSS_ANCHORS` moved to data `DungeonDef.extras.bossAnchors` so eight dungeons do not edit one table; summons from `ai.summoned`; **new rules (§3.9): P-spacing (separate packs >= 5 tiles unless `PackDef.linkedTo`), P-patrol (patrol segments >= 4 tiles from foreign pack centres, hard minimum 3, no collide prop within 1.2 tiles), V1-V6 vertical rules (§3.2b), windup-formula check (`windup >= clamp(0.45 + 0.25 x coef, 0.45, 1.2)` for every non-cast damaging ability)** | `extras.bossAnchors?: Record<string, [number, number]>`; `PackDef.linkedTo?: string[]` | the 5 bosses, anchors of §3.9, `tk_ruh` flying | edit the four tables by hand, rules by eye |
| SP-12 | **style additions** | `WallStyle` gains `'earthen'`, `FloorStyle` gains `'earthen'` and `'earthen_dark'` in `types/dungeons.ts`; entries in `WALL_STYLES`, `FLOORS`, `DECOR`, `dungeonAssetUrls` in `DungeonBuilder.ts` (values in §2.2). One PR with the styles of all 8 dungeons | see §2.2 | Taşkasa | fallback styles in the skeleton |
| SP-13 | **TransitCart** | interactable + `extras.transits` (spec §3.8) | | the two carts | boss-room door walk-back (long) |
| SP-14 | **BuffStation** | interactable + `extras.stations` (spec §3.8), reused by the Büyücüler Terası tome | | Usta Örsü | none (one-use buff skipped) |
| SP-15 | **mech proc models** | 7 procedural bodies in `src/ai/procModels.ts` and `MECH()` defs: `proc_volatile_spike` (hp 1, r 0.7, blocker 0.7, stone spike + gold tip), `proc_crystal_shard` (hp 3, r 1.0, blocker 1.0, teal crystal), `proc_unstable_fragment` (hp 0.02, r 0.5, floating violet-teal shard, spin), `proc_scrap_cube` (hp 99, r 1.0, speed 22, glowing-edge cube), `proc_magma_blob` (hp 0.3, r 0.6, speed 5, orange blob), `proc_void_rift` (hp 1, r 1.0, tint `0x7a3cff`, invulnerable slit), proc body `earth_totem` for `tk_totem` | `MECH('proc_volatile_spike', 'Sivri Taş', 'volatile_spike', 1, { radius: 0.7, visual: { blocker: 0.7 } })` | bosses and the Stoneshaper | reuse `proc_rift`, `proc_soul_orb`, `proc_phylactery` bodies with tints |
| SP-16 | **animated props** | `PropPlacement.spin?: number` (deg/s about Y), `spinNode?: string`, `bob?: [amp, hz]`; builder registers spinners updated in the scene loop | `{ spin: 12, spinNode: 'ring_outer' }` | the Awakening Wheel (two nodes) | static wheel |
| SP-17 | **ability params `ramp`, `count`, `interrupt`** | `EnemyAbility.params.ramp` (+coef fraction per use), `rampMax` (cap in uses), reset on leaving combat; `count` (number of distinct random targets of a `ground_aoe`); `interrupt` (the hit interrupts the target's cast, Kalkan Patlatması) in `EnemyAI` | `params: { target: 1, count: 2, ramp: 0.25, rampMax: 6 }` | Smash Rock, Molten Mortar, Guard Break | no ramp, one target, no interrupt |
| SP-18 | **season pool registry and gating** | `MPLUS_POOL: string[]` (8 ids) in `data/dungeons/index.ts`, `dungeonDifficulties(id)` (pool dungeons: Kahramanlık, Mitik, Mitik+ only), `PORTALS` / `PORTAL_TINTS`, `EntranceDef.look += 'vault'`, one world-entrance gate builder driven by a per-dungeon recipe | | `taskasa` entry, tint `0xffa43c`, entrance §7 | register in `DUNGEONS` only |
| SP-19 | **affixSafe zones** | `extras.affixSafe?: { x, z, r }[]`; `systems/Affixes.ts` volcanic / storming / explosive / spiteful spawn points skip them | | hub chasm and bridges (35.5, 51.5, r 7), the six Eirich rift sockets (r 5) | none |
| SP-20 | **mplus-pace tool** | `tools/mplus-pace.mjs`: per dungeon prints the pull table, cumulative forces % and the timer estimate from pack data (`node tools/mplus-pace.mjs taskasa`) | | §6.2, §6.3 | by hand |
| SP-21 | **status batch** | `StatusDef` + `STATUS_RULES` + `StatusId` entries (**data plus SP-09's `takenMorePerStack` rule field**; `maxHpPctPerSec` and `hpFloorPct` **already exist** in `StatusRule`, the Kirlenme rot, and are reused as is): `fracture` Kırılma (debuff, max 10 stacks, 10 s, `takenMorePerStack 0.05`), `seismic_echo` Sismik Yankı (debuff, 30 s, physical DoT, dispellable), `seismic_ward` Sismik Kalkan (buff, 6 s, `takenMore -0.5`), `earth_fracture` Yer Çatlağı (debuff, max 8, 8 s, physical DoT per stack), `unstable_energy` Kararsız Enerji (max 6, 15 s, `dealtMore 0.08` per stack + shadow DoT), `void_infection` Boşluk Enfeksiyonu (debuff, 10 s, shadow DoT 0.5 coef/s, dispellable), `void_mark` Boşluk İşareti (debuff, max 4, 20 s, **`takenMorePerStack 0.25`** everywhere in this file), `void_corruption` Boşluk Yozlaşması (debuff, max 12, 12 s, `maxHpPctPerSec 0.0035` per stack, **existing rule**, not dispellable), `silenced_speaker` Susturulmuş Sözcü (boss buff, `dealtMore 0.75`), `iron_ingot` Demir Külçe (buff, 600 s, +10 % versatility, fallback `dealtMore 0.06` and `takenMore -0.03`) | | all | status ids registered at runtime like the Efsun blessings |
| SP-22 | **Heightfield and ceiling** (CORE_MECHANICS §13, binding; **new shared primitive**) | `RoomDef.floorY?: number` (m, default 0), `RoomDef.ceiling?: number` (clearance above the local floor, default 6, halls 12-30; drives wall height, pillar/arch scale, a dark ceiling plane with instanced stalactites and the camera zoom limit), `RoomDef.slopes?: SlopeDef[]` (stairs/ramp strips), `RoomDef.terraces?: TerraceDef[]` (one or two 0.45 m steps), `RoomDef.galleries?: GalleryDef[]` (decorative non-walkable ledges with rails, statues, banners). `NavGrid` stores a height per tile and refuses neighbouring steps above 0.45 m except inside a strip (gradient <= 0.25); `World.groundY(x, z)` samples the heightfield (players, enemies, loot, projectiles, props, cart rides); melee and hit shapes ignore height differences <= 2.5 m, larger ones miss; enemies path through strips; no overlapping floors | `interface SlopeDef { rect: TileRect; axis: 'x' \| 'z'; from: number; to: number; kind: 'stairs' \| 'ramp' }` (`from` = height at the west/north edge, `to` at the east/south edge, rect tile-corner like `ZoneDef`); `interface TerraceDef { rect?: TileRect; circle?: [number, number, number]; y: number }`; `interface GalleryDef { rect: TileRect; y: number; rail?: boolean; props?: PropPlacement[] }`; validator rules V1-V6 (SP-11) | all of §3.2b: the Büyük Merdiven, 7 ramps, the Büyük İniş, 5 terraces, galleries in 9 rooms (18 ledges), ceilings 5-30 m | **flat mode**: ignore the keys, build every room at y 0, keep galleries/chandeliers/banners as props at their absolute y; all layout, pack and boss numbers are identical |
| SP-23 | **Chasm and fall rule** (CORE §13) | `ZoneDef.y?: number` (pit floor, bridge deck or dais top), `ZoneDef.fall?: boolean` (a player or enemy over the zone falls: 25 % max HP, burn 6 s on lava, respawn at the last safe tile, never lethal outside a scripted pit; a knockback that ends over a `fall` tile triggers it); bridge zones are walkable decks at `y`; `affixSafe` (SP-19) keeps affix hazards off them | `circleZone('lava', 35.5, 51.5, 4.5, { blocked: true, y: -3, fall: true, ... })` | the Lav Çukuru and the two bridges | `lava` zone `blocked: true` with the existing burn hazard (coef 1.2 per 0.5 s), no fall rule |
| SP-24 | **Elden Ring layer** (CORE_MECHANICS §16; **new shared primitive**) | (a) `EnemyAbility.params.chain / t2 / c2 / t3 / c3`: multi-hit strings (impact times in s from the telegraph start, coefficients per hit), each hit re-aims its shape 0.3 s before impact; (b) boss kit helper `comboString(c, steps)` with `steps: { t, reach, arc, coef, type, vfx? }[]`; (c) `BossScript.onPoiseBreak?(c, info)` fired when a boss poise break starts (the engine already has `Combat.addStagger`, `isStaggerBroken` and the break lock) so a script can cancel the current windup and delay its sequence; (d) `EnemyDef.enrageBelow?: number` (default 0.3 for elites: +30 % damage, `enrage_aura`) when the creature profiles do not supply it; (e) passive `poiseReduce` (the Honor Guard's frontal stance halves poise damage); (f) `EnemyAbility.params.leap` and `delay` already exist and are used as is | `cone('tk_onur_slash', ..., { params: { chain: 2, t2: 1.4, c2: 1.0, t3: 2.7, c3: 1.6 } })` | every string of §4.2 and §5, the posture rewards | strings: one hit with the summed coef; no `onPoiseBreak`: the engine stun and +25 % stay, the scripted extras (cancel, delays, spike inertia, Resonance) are skipped |

SP-03 is intentionally unused here (the Stonevault has no soak mechanic); other dungeons define the shared soak helper.

**Enemy kit path decision (pool-wide, proposed here, to be confirmed by the orchestrator).** The eight docs disagreed (`src/data/enemies/kit.ts`, `src/data/enemies/builders.ts`, `src/data/enemyKit.ts`, or no kit at all, and a directory `enemies/` beside the existing file `enemies.ts` shares its stem). Proposed single rule for all 8 dungeon docs and packages: the shared builders live in **`src/data/enemyKit.ts`** (a file name that cannot be confused with `enemies.ts`; already used by kefaret_salonlari P7, les_uyanisi SP-01 and peri_sisleri S1), `enemies.ts` re-exports it, and each dungeon's defs live in **`src/data/enemies/<dungeon>.ts`** with a `registerXxx()` function that `enemies.ts` calls (already used by kefaret, les_uyanisi, peri_sisleri and yanki_agi; TypeScript resolves `'./enemies'` to `enemies.ts` and `'./enemies/taskasa'` to the directory, so there is no ambiguity, and if it still reads badly the directory can be renamed `enemy_defs/` everywhere at once). Packages to align: buyucu_terasi NP-16 and yanki_agi YSP-01 (`enemies/builders.ts` -> `enemyKit.ts`), yigitler_sarayi YS-2 and yildiz_divani YD-2 (append to `enemies.ts` -> per-dungeon file), kefaret_salonlari (add the kit file to its package list). SP numbers are local to each doc: merge by **name**.

### 8.3 Build order

1. **Wave 0 (shared, once):** SP-01, SP-11, SP-12, SP-21, SP-18, SP-15, SP-17 (all data-like, low risk) in one block, then **SP-22 + SP-23 (heightfield, ceiling, chasm: the engine-risk block, flat mode first so nothing waits on it)**.
2. **Wave 1 (parallel, file-disjoint):** TK-A + TK-D (layout and decor with fallback props), TK-B (defs), TK-F (assets), TK-E (carts, anvil, SP-13/14/16).
3. **Wave 2:** TK-C boss scripts (needs TK-B); the boss-kit primitives SP-02, SP-04..SP-09 and **SP-24 (strings, posture hook, `tankOf`)** go in as soon as they exist, otherwise the script fallbacks of §5 are used and replaced later.
4. **Wave 3:** TK-G entrance (needs Kadim Diyar or the Karakır fallback), music track, loading image.
5. **Wave 4:** Sonnet reviews each block's diff, Haiku fixes, then the single Haiku QA pass (TK-H).

### 8.4 Acceptance checklist

- `node tools/content-check.mjs taskasa`: 0 errors, forces 498 available (124.5 %), non-optional 428, required 400, 35 packs, 5 bosses, anchors present, exactly 2 shrines, a Font of Power inside a room, **P-spacing, P-patrol and V1-V6 pass**, every non-cast damaging ability obeys the windup formula.
- Every `kick: 2` ability is `interruptible`, every boss ability id in a phase exists in the def, every `spawnAdds` / `spawnMech` id is in `TASKASA_SPAWNS` (asset preload).
- **Verticality:** at least 3 flat height levels (10 present), ceilings 5-30 m, the Büyük Merdiven and the Büyük İniş walkable without a stuck tile, a player knocked off a hub bridge takes the fall rule, the two cart rides change the party's height by 2.4 m, galleries are not walkable and cannot be hit from below.
- **Elden Ring layer:** every elite has a posture bar and the break opens the Kritik Vuruş window; every boss basic is a 2-3 hit string whose last hit is delayed; each boss has a jump/charge/grab; a break on each boss does its extra (Seda spikes inert and energy -30, Skarmorak delay, Dorlita Crescendo cancelled, Brokk Molten Metal cancelled, Resonance pair break, Eirich casts delayed and cleanse reset).
- **Loot:** each boss table lists 3 named items, `uniqueIds` resolve to `UniqueDef`s with a `special.id` the combat module implements (12 total).
- Boss walk-through (QA): Seda spikes detonate only on proximity and die to beams, the sweep and the shatter; the dispel reward goes to the **current boss target even when the main tank is a Barbarian**; the Skarmorak shell breaks into a 4 s stun and the 22 s limit punishes; the Machinists share engage and reset and the survivor gets Susturulmuş Sözcü; Eirich's cleanse removes the DoT only inside 3.4-15 m of an open rift, the swap toast fires for the current target, the intermissions end on dead casters or 24 s.
- The Eirich door stays closed until Seda, Skarmorak and both Machinists are dead; the wing doors stay closed until Seda is dead; both carts work only after their boss.
- Credits: the goblinatron PSX dungeon pack (CC BY 4.0) is credited if any `ip('psx-dungeon', ...)` prop ships.


---

## 9. Revision notes (critic review and binding requirements, 2026-10-13)

### 9.1 Critic issues, accepted

| # | Issue | Fix applied (where) |
|---|---|---|
| 1 | Verticality ignored (flat y 0, no ceiling) | New shared primitives **SP-22 Heightfield and ceiling** and **SP-23 Chasm and fall rule** (§8.2); `floorY`, `ceiling`, `slopes`, `terraces`, `galleries` on every room (§3.2, §3.2b, §3.6), 10 flat levels from +2.4 to -3.6 m, hub ceiling 24 m with the pit sunk 3 m and bridges at 0, Seda +1.2 m, Titan tunnels 10 m, Fısıltı Salonu 30 m, flat mode kept as the fallback. Elevation drawings in §3.2c. |
| 2 | Patrol p14 walked through the hub packs, Route B claimed a false skip | p14 now laps a rail ring `(29.5,46) (41.5,46) (41.5,57) (29.5,57)` (71 s); the eight static hub packs moved to the flanks so the patrol stays **4.5 tiles or more** from every other pack (script-verified, §4.4); new content-check rules **P-patrol** and **P-spacing** (§3.9); Route B rewritten, the patrol is killed or timed, not skipped (§3.5, §6.2): 406 forces. |
| 3 | M+ scaling contradicted CORE §6 | §6 states that CORE governs (1.08^(L-1) to +10, then x1.10), notes the code to fix (`mplusHp`, `mplusDmg`), raises the boss hpMults by 18 % (53 / 70 / 38+38 / 100) and recomputes §6.1 to §6.5 from the formula: clean +10 Fortified 24:08. |
| 4 | Packs in the west and east halls chained | West hall p18 moved to (3.5, 51.5) (5.0 and 5.8 tiles from p17 and p19); east hall rebuilt as a column of three packs 5.0 to 5.5 tiles apart plus the patrol lane 5.0 tiles west; the hub flanks, yaklasim and the Titan hall also obey 5 tiles; deliberate clusters carry `big` and `linkedTo` (p29+p30, p32+p33+p34). |
| 5 (part) | void_mark 0.30 vs 0.25, SP-21 "data only", `takenMore` per stack | one value: **0.25** everywhere; SP-21 relabelled "data plus SP-09's `takenMorePerStack`"; the `maxHpPctPerSec` part is rejected, see 9.2. |
| 6 | Pounce windup 1.0 at coef 4.5 | windup 1.2 in §4.2 and §4.3; additionally **every** non-cast ability now follows the new formula `clamp(0.45 + 0.25 x coef, 0.45, 1.2)` as a minimum (several basics were 0.55-0.6 at coef 1.0). |
| 7 | `isTank()` is `classId === 'knight'` | `tankOf(c)` = the boss's current target (top threat as fallback); `pickPlayers(c, n, avoid)` takes the player to spare; Seda's dispel watcher, beam/spike/dive targets, the Eirich swap toast and grasp, Dorlita's hammer all use it (§5 common rules, SP-09). |
| 8 | Enemy-kit location differs across the 8 docs | Proposed pool-wide path **`src/data/enemyKit.ts`** (kit) and **`src/data/enemies/<dungeon>.ts`** with `registerXxx()` (defs); decision note in §8.2 lists the docs that must align. Pending orchestrator confirmation (open question 1). |

### 9.2 Rejected critique

- **Issue 5, "`maxHpPctPerSec` status rule does not exist in StatusRule".** Rejected: `StatusRule.maxHpPctPerSec` (and `hpFloorPct`) exist today in `src/data/statuses.ts` (the Kirlenme max-HP rot: damage per second = rate x owner max HP x stacks). Void Corruption reuses it unchanged (leave `hpFloorPct` unset so it can kill). Only `takenMorePerStack` is new (SP-09), so SP-21 is "data plus one rule field", not "data only", which the revision accepts.
- **Issue 2, suggested waypoints `(29,47.5) (42,47.5) (45,56) (29,56)`.** Not used as written: against the original pack positions they pass 1.4 tiles from p13 and 2.5 tiles from p08, which breaks the critic's own 3-tile rule. The fix keeps the idea (a ring at about 7 tiles from the pit) but moves the packs instead of only the path.
- **Issue 4, suggested `p24` at (69.5, 47).** Not sufficient alone: it is still 3.8 tiles from p23. The east hall was rebuilt as a spaced column.
- **Issue 3, alternative "accept a clean +10 of about 22:40".** Not taken: the hpMults were raised so the designed +2 target holds under the governing curve.

### 9.3 Remaining open questions

1. **Enemy kit path:** confirm `src/data/enemyKit.ts` + `src/data/enemies/<dungeon>.ts` for all 8 docs (or rename the directory to avoid the file/directory stem), then align buyucu_terasi NP-16, yanki_agi YSP-01, yigitler_sarayi YS-2, yildiz_divani YD-2 and kefaret_salonlari's package list.
2. **`ceiling` semantics:** this doc uses *clearance above the local floor* (so sloped rooms keep a constant clearance). CORE §13 says only "m, drives wall height"; confirm for SP-22.
3. **Code vs CORE scaling:** `mplusHp` / `mplusDmg` in `src/data/mythicAffixes.ts` do not match CORE §6 yet (HP uses 1.10^(L-1), damage has no step above +10); CM7 must change them before any dungeon time table is trusted. SimBench has to confirm the 0.95 s/hpMult DPS par.
4. **Posture tuning:** boss poise values (800 / 900 / 700 / 350 / 1000) and the extra break rewards need SimBench and a feel pass; `onPoiseBreak` (SP-24) assumes the engine can tell a script when a boss break starts.
5. **Named items:** 12 `special.id` effects need combat-module implementations and class filters (smart loot); numbers are design targets, not balanced. Does the personal-loot table use `uniqueChance` per player as written (0.35 / 0.40)?
6. **Windup formula across the pool:** the other seven docs were written against GDD_CONTENT §0.6 and may contain windups below `clamp(0.45 + 0.25 x coef, 0.45, 1.2)`; the new SP-11 check will flag them.
7. **Hub fall rule:** is a fall off a bridge (25 % max HP + respawn, no death) acceptable with Kibirli and Storming, or should the pit be a scripted kill pit for boss-only use? This doc assumes the CORE §13 default.
8. **Flat mode as the shipping default:** if SP-22 slips, Taşkasa ships flat; confirm that is acceptable for Season 1 or that SP-22 is a release blocker.

### 9.4 New shared primitives (this revision)

- **SP-22 Heightfield and ceiling** (`RoomDef.floorY / ceiling / slopes / terraces / galleries`, NavGrid heights, `World.groundY`, ceiling plane, camera zoom limit, validator rules V1-V6). Shared by all 8 dungeons.
- **SP-23 Chasm and fall rule** (`ZoneDef.y`, `ZoneDef.fall`, bridge decks, respawn at the last safe tile).
- **SP-24 Elden Ring layer** (`params.chain / t2 / c2 / t3 / c3` strings, `comboString`, `BossScript.onPoiseBreak`, `params.interrupt`, `enrageBelow`, `poiseReduce`).
- Extended: **SP-01** (kit path `src/data/enemyKit.ts`), **SP-09** (`tankOf`, `pickPlayers(avoid)`, `takenMorePerStack`), **SP-11** (`PackDef.linkedTo`, P-spacing, P-patrol, V1-V6, windup-formula check), **SP-17** (`params.interrupt`), **SP-19** (bridges in `affixSafe`), **SP-21** (corrected status batch).
- New Blender props (7): `tk_chandelier_forge`, `tk_gallery_rail`, `tk_bridge_stone`, `tk_stalactite`, `tk_stair_grand_face`, `tk_titan_statue`, `tk_banner_long`.
