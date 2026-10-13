# Yankı Ağı (`yanki_agi`): Season 1 Mythic+ dungeon design

Model: **Ara-Kara, City of Echoes** (The War Within). Non-commercial hobby project: staying very close to the WoW dungeon's look, layout, trash and boss kits is explicitly wanted. Turkish names are the in-game names; prose is English. This is a design document only: no code was changed. Every number below is meant to be transcribed into data files by the Haiku coders (section 8), and every coordinate follows the GDD convention (`docs/GDD_CONTENT.md` section 0.1: a continuous tile coordinate `c` is world `(c + 0.5) * 4` m; `n` = -Z).

Sources used: `docs/ref/dungeons/sl-tww.md` (Ara-Kara part, confidence tags `[src]` / `[inf]` / `[thin]` carry over), the engine files named in section 8, and the author's own knowledge of the live dungeon's look. Where this doc departs from the research file it says so (the research palette is explicitly "proposed, not sourced"; section 2.1 explains the change).

**Revision 2 (this pass).** Applies the six critic fixes (caster volleys that never fired in big packs, the Alarm Çığlığı snowball, the unskippable p15 and the route recount, the timer table, the honest fidelity table, the Karakır entrance dependency) and the five binding requirements: real verticality (sections 3.2 and 3.6), three bosses with an Elden Ring layer (section 5), 13 trash types with 2-4 telegraphed attacks each (section 4), a per-room dressing sheet (section 3.6) and three named loot items per boss (section 5.4). The rejected critique, if any, is in the last section.

Contents: 1 Identity · 2 Art direction · 3 Layout and height · 4 Trash · 5 Bosses · 6 Mythic+ tuning · 7 Entrance · 8 Implementation packages · 9 Rejected critique.

---

## 1. Identity

| Field | Value |
|---|---|
| id / names | `yanki_agi` · **Yankı Ağı** · shortName `Yankı` · full title "Dokucuların Yankı Şehri" |
| WoW model | Ara-Kara, City of Echoes: three boss encounters in a linear run, three Discordant-Attendant minibosses that gate boss 1, a Stagshell/Bloodguard sentry hall, a Bloodworker Black Blood harvest line, Eye of the Swarm, Cosmic Singularity |
| Pool | Season 1 Mythic+ pool, dungeon 1 of 8. Endgame only: `levelRange [60, 60]`, difficulties **Mitik 0 and Mitik+** (no Normal, no Kahramanlık: needs the shared `DungeonDef.endgame` flag, YSP-02) |
| Enemy level | 60 (Mitik 0 = x1.0 baseline of `GDD_CONTENT` 0.3; Mitik+ L: HP and damage x1.08^(L-1) up to +10, x1.10 per level above, `CORE_MECHANICS` section 6; the older 1.10^(L-1) HP curve still in `mythicAffixes.ts` is discussed in 6.2) |
| M+ timer | **28:00 (1680 s)** for 5 players. +2 chest at 22:24, +3 chest at 16:48 |
| Enemy forces | **405 required**, **502 available** (123.9%); 29 packs, 149 enemies (13 trash types, 3 minibosses), 3 bosses, 3 minibosses |
| Grid | 64 x 56 tiles (256 x 224 m), 18 rooms |
| Height | 4 height bands from +2 m (Avanoksa) to +11 m (Seyir Terası), ceilings 7 to 30 m (the terrace is open), 11 stair and ramp strips, a chasm bridge (section 3.2) |
| Recommended route | Route A-100 (section 6.1): 14 pulls, **421 forces (104.0%)**, skips five small packs (p01, p04, p11, p21, p28). Elite route B skips the Nöbetçi Holü through the Ağ Geçidi (418 forces, 103.2%) |
| Entrance | "Ağ Kapısı" in a sinkhole of **Karakır Bozkırı** (dry steppe half), section 7 |
| Music / ambience | `dungeon_web` (new id mapped to `dungeon_cave_theme.ogg`) + `amb_dungeon_bed`, boss fights `boss` |
| Loading screen | "A teal-lit chasm city seen from a silk bridge: giant ribbed archways fall away into the dark, thousands of silver threads catch glowing echo-crystals, and a party of lantern-bearers crosses toward a web platform crowded with pale green eggs; the title is spun in silver thread across the bottom." (`DungeonDef.loadingImage` = `/assets/ui/loading/yanki_agi.webp`, to be painted from this line) |

**Fantasy (TR, `DungeonDef.lore`):**

> Karakır Bozkırı'nın altında, Kadim Zindanlar'dan bile eski bir şehir uyanıyor: Dokucuların Yankı Şehri. Dokucu Soyu, efsun damarlarından sızan Kara Kan'ı hasat ederek soylarını bir üst katmana yükseltmeye çalışıyor. Şehrin duvarları sesi hiç unutmaz: aşağıdaki her adım, her çığlık ağın teline binip kovana ulaşır. Kuzgunkale'nin kadim mühürleri Yankı Ağı'nı bin yıl susturdu; şimdi Kadim Anahtar Taşları o mühürlerin diyapazonu gibi titreşiyor ve şehir cevap veriyor.

**Lore hook into our world (EN):** The four existing dungeons are the old seals under Kuzgunkale. Yankı Ağı is the layer *below* all of them, sealed by the same ancient hands, and it is the reason the Kadim Anahtar Taşı (keystone) exists: the keystone is a tuning fork cut to the city's echo lattice. When the owner sets it into the Kehanet Taşı, the web "hears" it and answers, which is how the weekly affixes manifest in this dungeon (Tahkimli/Zorba = the hive reinforcing itself, Kibirli = the Dokucu elite rising from the echo). Efsun veins run through the walls; the Dokucular milk them as **Kara Kan** (Black Blood), which is why the dungeon is lit by teal echo-crystals and violet vats. Echo is the dungeon's motif: gongs, resonance runes, a floor sigil under boss 2, and sparse echoing pings in the music.

**Boss names (invented, same pattern as Kaldur / Morkan / Nefris):** Doyumsuz **Avanoksa** (Avanoxx), Gözetmen **Anubzek** (Anub'zekt), Hasatçı **Kikatal** (Ki'katal). Minibosses: Çınlatıcı **Iksin** (Ixin), Yuva Çağıran **Nakat** (Nakt), Zehir Dökücü **Atik** (Atik).

**Fidelity map (WoW element to Yankı Ağı, with every departure):**

| WoW (Ara-Kara) | Yankı Ağı | Departure (every one listed, nothing hidden) |
|---|---|---|
| Shredded Strands, Echoing Overlook, The Undercache | Parçalanmış Teller, Yankı Seyir Terası, Alt Depo (boss rooms) | none |
| Three attendant minibosses must die to summon Avanoxx | Iksin, Nakat, Atik gate the Avanoksa door (`DoorDef.requires`) | none |
| Ravenous Crawler (Ambush at 8+ yd), Engorged Crawler (Venomous Spit, Toxic Rupture) | Aç Sürünen (Pusu), Şişkin Sürünen | crawlers are `swarm` role so the horde rule of the affixes applies; the engorged crawler gains a delayed leap slam and a posture bar (Elden Ring layer, section 4) |
| Jabbing Flyer, Winged Carrier (puddle on first hit, Dashing Strike) | Sokucu Arı, Kanatlı Taşıyıcı | the wasp gains a dive (2 attacks) |
| Trilling Attendant (Resonant Barrage, Web Bolt) | Çınlayan Görevli | the barrage is a cast-then-burst, not a channel; it carries `ranged: 1` so big packs still cast it (YSP-08); a short knockback melee-guard is added |
| Bloodworker, Bloodstained Assistant (Extraction Strike heals), Webmage (Revolting Volley) | Kan İşçisi, Kana Bulanmış Yardımcı, Ağ Büyücüsü | each gets a 2-hit string or a sweep so every trash type has 2-4 attacks |
| (no WoW counterpart) | **Kan Bakıcısı** (`yk_bloodtender`, healer) | **NEW unit**: the Black Blood theme needed a real heal target; it replaces one 4-force member in seven packs, so forces and mob counts do not change |
| Hulking Bloodguard (Bulwark of the Weak, Impale, Locust Swarm), Sentry Stagshell (Alarm Shrill) | İri Kan Muhafızı, Nöbetçi Boynuzkabuk | (d) Locust Swarm is an avoidable r 11 m cloud instead of an unavoidable channel; the bloodguard basic becomes a 3-hit string with a delayed heavy; Alarm Çığlığı is once per Stagshell (as in WoW) and its call radius is limited to the same room and 25 m (engine departure, YSP-07) |
| Blood Overseer (Venom Volley, Erupting Webs), Reinforced Drone (puddle, Tainted Blood) | Kan Gözcüsü, Zırhlı Dron | Tainted Blood becomes the `kara_kan` status; the drone gains a shield bash |
| Avanoxx: Voracious Bite, Alerting Shrill, Gossamer Onslaught, Infestation, Insatiable | Avanoksa: Oburca Isırık, Uyarı Çığlığı, Ağ Yağmuru, Sürü Hastalığı, Doyumsuz (30% per crawler, Season 3) | (b) the 40% phase is now **cooldown tweaks only** (no gear change, no damage buff); **NEW Elden Ring layer**: Üçlü Pençe Zinciri (3-hit string, delayed lunge) and Sıçrayan Ezme (leap crush, then a 1.5 s winded window) |
| Anub'zekt: Impale, Burrow Charge, Infestation, Webmages, Eye of the Swarm at full energy | Anubzek: Mızraklama, Yer Altı Hücumu, Sürü Hastalığı, Ağ Büyücüleri, Sürü Gözü | (a) Burrow Charge is r **11 m** (13 yd, as in WoW) with the 2-strike pattern; energy is a cooldown (first at 38 s, then every 80 s); the 30% phase is cooldown-only; **NEW Elden Ring layer**: Mızrak Zinciri (3-hit string) and Yankı Basışı (two expanding rings) |
| Ki'katal: Bloodworkers, Grasping Blood, Cosmic Singularity, Cultivated Poisons, Erupting Webs, web add | Kikatal: Kan İşçileri, Kavrayan Kan, Kozmik Teklik, İşlenmiş Zehirler, Patlayan Ağlar, Ağ Örücü | (c) **Kan Kancası** tank buster is invented (WoW has no tank hit besides the melee); (e) poisons always erupt at 8 s, Erupting Webs stun 2 s instead of 3 s (ARPG softening), the 40% phase is cooldown-only; Singularity is stopped by a poise break (the WoW "interrupt"); **NEW Elden Ring layer**: Hasat Zinciri (3-hit scythe string) and Kan Gelgiti (roll-through wave) |
| Tailors cut the Discordant Attendant tether for a 12 s stun | Yankı Çanı echo gongs (any class, one use) | there is no tailoring in this game |
| Real chasm city, bridge, tiered halls | `heightfield` with 4 height bands, 11 stair and ramp strips, a chasm with a bridge (`kopru`), grand staircases | verticality follows `CORE_MECHANICS` section 13 (section 3.2) |

---

## 2. Art direction

Goal: the closest possible read of Ara-Kara at PSX fidelity: a vast, cold, dark nerubian ruin lit by cyan-teal echo glow and warm amber, with silver webbing everywhere, pale green egg clusters, and violet-black Black Blood in the deepest third. The player should feel "I am descending into the city under the city".

### 2.1 Palette

| # | Name | Hex | Use |
|---|---|---|---|
| 1 | Void Slate | `#0d1620` | fog colour, cavern darkness, void edges |
| 2 | Chitin Slate | `#2a3a52` | nerubian stone and carapace walls, pillars |
| 3 | Echo Teal | `#39d0c4` | resonance runes, echo crystals, Font of Power, echo pulses (the key accent) |
| 4 | Echo Teal Deep | `#1a7f85` | secondary glow, teal shadows, rune bases |
| 5 | Web Silver | `#b9c6d8` | web strands, silk drapes, cocoons, highlights |
| 6 | Egg Pale | `#d6dfae` | egg sacs, crawlers, fungus |
| 7 | Venom Green | `#86c93a` | poison, spit, Cultivated Poison, lab liquids |
| 8 | Black Blood | base `#3a1245`, sheen `#8a3bb0` | vats, pools, Bloodworker cargo, Undercache lights |
| 9 | Hive Amber | `#d09a3c` | torches, lanterns, swarm haze, gate lanterns |
| 10 | Dirt Bronze | `#6b4b2e` | undercrawler bodies, floor dirt, rust |

Departure from the research file: it proposed an oxblood Black Blood (`#1B0C10`/`#5A1733`) and no teal. In game Black Blood reads violet-black and the instance reads cold blue-teal, so the palette above keeps the research's web silver, egg pale, venom green and amber, and replaces oxblood with violet-black plus a teal "echo" accent. `[inf, art-director interpretation; the Art of The War Within chapter 5 is still the best source to check against]`.

Telegraph colours stay the engine's (danger red `0xff3030`, soak yellow `0xffd040`, safe green `0x40ff80`). Teal is an ambience colour only: never let a teal glow be the only sign of something that hurts. Every damaging ground effect keeps the engine's red telegraph or a red outline decal (Black Blood puddles are violet with a red outline, web puddles silver with a red outline, poison clouds venom green).

### 2.2 Materials and textures

* Floors: `FloorStyle` `stone_dark` (KayKit `floor_tile_large`, tint `0x8c8a98`) in halls and bosses, `dirt` (`floor_dirt_large`, `floor_dirt_large_rocky`) in the natural caverns (Teller, Kuluçka, Koğuş, Ağ Geçidi), `temple` (checker 0.8) on the Seyir Terası. Cool the whole KayKit dungeon atlas with `theme.tint = 0x7f93b0`.
* Walls: `cave` (rockBase, rock clutter along the base) for the natural caverns, `temple` (arched, window-open variants read as nerubian vaults) for halls and the terrace, `brick` for the laboratory, `forge` (scaffold + metal windows read as harvest machinery) for the Kara Kan tunnel, line and Alt Depo. Optional upgrade: a new `nerub` wall style (YSP-13) using `chitin_rib_wall` pieces.
* Web: `/assets/textures/itch/creatures/fx/spider_web.png` as the alpha source of every web card (`web_curtain`, `web_sheet_floor`, hanging strands). Silver tint `0xb9c6d8`, additive-ish soft edge, ordered-dither alpha so the PSX look holds.
* Eggs and fungus: `/assets/textures/itch/creatures/spider_pale.png` and `ooze_green.png` palettes; egg shells use a 256-colour pale-green ramp with a darker vein overlay.
* Black Blood: `/assets/textures/itch/creatures/fx/ooze_splat.png` and `ooze_flat.png` recoloured to the violet-black ramp for decals, `ooze_black.png` for jelly parts.
* Stone detail: `tt2-brick-*` / `psx-dungeon/wall-03.png` from the existing packs are enough for the KayKit atlas; new props bake their own 128 px atlas via `psx_lib` like the generated props.
* Emissive rule: only runes, crystals, eggs (weak), vat liquid and eyes are emissive (bloom picks them up). Everything else is lit by the pool, so the dungeon stays dark between lights.

### 2.3 Lighting rig and fog

Engine facts that shape the rig (`DungeonBuilder.setupTheme`, `LightPool`): ambient is floored at 0.95 and hemisphere fixed at 1.3 indoors, so **darkness comes from `theme.tint` and fog distance, not from ambient**. There is one shadow-casting "moon" directional light coloured from `hemiSky` lerped 35% to white (here a cool teal-white), one shadowless rim directional (`0xb8d0ff`), and **at most 8 real point lights** pooled over torches/lamps; everything else is a halo sprite. Plan the lights as "a few strong coloured pools, many halos".

| Item | Value |
|---|---|
| `theme.fogColor / near / far` | `0x0d1620` / 8 / 46 (cavern feeling, big rooms see far) |
| `theme.ambient` | `0x2c4256`, intensity 0.3 (engine floors it) |
| `theme.hemiSky / hemiGround` | `0x5aa8c0` / `0x0c1218` (moon becomes a cool teal-white shaft) |
| `theme.torchColor` | `0xd09a3c` (amber) |
| `theme.bloomStrength` | 0.55 (echo crystals and vats glow; Golge is 0.4) |
| `theme.tint` | `0x7f93b0` |
| Per-room fog overrides (`RoomDef.fog`) | `teller` colour `0x101c28` near 10 far 60 · `avanoksa_yuvasi` `0x12202a` 12 / 64 · `anubzek_terasi` `0x0e1a26` 12 / 70 · `tunel` 6 / 30 · `kan_hatti` colour `0x180f24` 8 / 40 · `kikatal_deposu` colour `0x1a1028` 10 / 52 · `yumurta_odasi` colour `0x16241a` 8 / 38 · `dron_kogusu` colour `0x141c22` 8 / 36 |
| Real-light recipes (`lt(color, intensity, distance, flicker, y)`) | echo crystal `lt(0x39d0c4, 1.6, 9, false)` · amber torch `lt(0xd09a3c, 1.8, 10, true)` · Black Blood vat `lt(0x8a3bb0, 1.4, 8, true)` · egg/poison glow `lt(0x86c93a, 1.0, 6, true)` · Font `lt(0x39d0c4, 2.2, 12, false, 2.0)` |
| Light priority | Font, shrines, gongs and boss-arena crystals are priority lights (win the 8 slots); torches are plain |
| Shaft of daylight | `giris` and `teller` have a `light_shaft` prop (additive cone, `0xcfe8ff`, 4 x 12 m) under the sinkhole opening; the only warm-white light in the dungeon. Outside those two rooms the cave is lit only by teal, amber and violet |

Mood per section: Strands = cold teal and pale green, big and airy; Overlook = teal stone halls with amber lanterns, then a wide moonlit terrace; Undercache = violet-black and amber, tighter, wetter, industrial.

### 2.4 Sky and backdrop

Indoors, `scene.background` is the fog colour, so the "sky" is a dark cavern ceiling. Height now comes from the heightfield of `CORE_MECHANICS` section 13 (section 3.2): each room has a `floorY` and a `ceiling` (7 to 30 m, the Seyir Terası is open to the void), so the Teller are a 30 m cathedral cavern, the Nöbetçi Holü a 24 m vault and the tunnels 7 to 9 m. There is still no stalactite mesh, so the roof is sold with void rock mass at every unroofed edge (`buildRockMass`), **hanging web strands and cocoons** (props with `y`, up to y 12 in the 24-30 m halls), `light_shaft` cones, echo chandeliers at y 14-24 and fog far = 46-70 so the far walls and ceilings dissolve. The Seyir Terası is deliberately open: a disc of floor ringed by corner pits (blocked `pit` zones, fall rule of section 13) with the fog far pushed to 70 so the pit reads as a drop into a lit city below (4 teal `echo_crystal_spire`s and amber `lt` halos placed beyond the pit edge at y -8 as the "lights of the lower city"). The Yarık Köprüsü crosses a real chasm 10 m above the Teller floor; the player sees the Teller's glowing basin through the gap.

Upper galleries, balconies, banners, chandeliers and statues at height are **non-walkable decoration** (no collision, enemies never stand on them, melee and hit shapes ignore them): they exist only to make each hall read tall, see the dressing sheet in 3.6.

### 2.5 Landmark set pieces in run order

1. **Ağ Kapısı Girişi** (`giris`): the sinkhole's landing. A shaft of daylight lands on a ruined ribbed archway wrapped in silver webs; Kehanet Taşı glows teal at its foot; two amber lanterns; the way back up is a collapsed ramp (`stairs_walled`, decorative). Silence, then distant clicking.
2. **Yarık Köprüsü** (`kopru`): a silk-and-bone bridge across a bottomless chasm (`pit` zone with a `bridge` zone through it); teal crystals glow far below; cocoons hang from above; web railings.
3. **Parçalanmış Teller** (`teller`): the Shredded Strands, cathedral-sized: shredded giant web curtains from the ceiling, a cracked web dome in the middle, three throne-alcoves (the Görevli rooms) cut into the north and east walls with cocoon-lined floors, egg clusters along the north wall (dormant crawlers), a fallen caravan wagon wrapped in silk (story prop).
4. **Avanoksa'nın Yuvası** (`avanoksa_yuvasi`): a round web platform (dais) crowded with six pale egg clusters, walls of dense silk, a torn web canopy above, white-green glow; bones and cocoons everywhere. Avanoksa hangs in the canopy until the curtain lifts.
5. **Nöbetçi Holü** (`nobet_holu`): a long nerubian vault: tall ribbed pillars, tiles with a hex motif, sentry statues, Stagshell horn totems, amber lanterns, echo gong.
6. **Hasat Laboratuvarı** (`laboratuvar`): the harvest lab: glass vats of venom-green liquid, dissection tables, jars, dripping tubes, spear racks; the first violet hints.
7. **Yankı Seyir Terası** (`anubzek_terasi`): the Echoing Overlook: a great circular terrace with a glowing floor sigil (the Eye), four echo-crystal spires at the compass points, corner pits dropping into the lit lower city, resonance rings in the floor.
8. **Kara Kan Tüneli / Kara Kan Hattı** (`tunel`, `kan_hatti`): industrial harvest halls: pipes and hoses, carts of Black Blood bladders, violet vats, rail lanes for Bloodworkers, amber hazard lamps, wet floor decals.
9. **Dron Koğuşu** (`dron_kogusu`): barracks of hanging drone cocoons in rows, pale chitin husks.
10. **Alt Depo** (`kikatal_deposu`): the Undercache: a sunken chamber with a colossal central Black Blood cauldron ringed by a walkway, four corner vats, converging pipes, a harvest lift shaft overhead (backdrop prop).
11. **Yumurta Kuluçkası** (`yumurta_odasi`, optional): dense nursery, pale green glow, hundreds of eggs.

**Height read of the run** (section 3.2): the sinkhole ledge and the bridge sit 10 m above the Strands, the grand staircase `Büyük İniş Merdiveni` brings the party down into the Teller basin (4 m), the Görevli thrones sit on raised alcoves (7 m), Avanoksa's nest is the lowest point of the first half (2 m), `Yukarı Yol` is a long climb to the 24 m Nöbetçi Holü (8 m), the `Yankı Merdiveni` is a 14-step grand staircase from the lab up to the open terrace (11 m, the highest point), and the Undercache line then drops through a ramp tunnel and a pit stair to the boss pit (3 m).

### 2.6 Props mapped to existing assets

Helper prefixes follow `src/data/dungeons/kit.ts`: `dg` KayKit dungeon, `hw` halloween, `fu` furniture, `gp` generated props, `kg` Kenney graveyard, `kn` Kenney nature, `ip` itch packs.

| Purpose | Existing asset (path) | Notes |
|---|---|---|
| Cavern rock masses, stalagmites | `kn('rock_tallA'..'rock_tallJ')`, `kn('stone_tallA'..'J')`, `gp('rock_large')`, `gp('rock_cliff')`, `kn('cliff_blockCave_rock')` | tint `0x3a4a62`, scale 2.5-3.5 |
| Hanging silk strands | `kn('hanging_moss')`, `ip('psx-medieval','decoration/vine_hanging')`, `gp('chains_hanging')` | tint `0xb9c6d8`, `y` 3.4-4.0 |
| Cocoons (placeholder until `cocoon_hanging`) | `kg('coffin-old')` hung with `gp('chains_hanging')` | tint `0xb9c6d8`, `y` 1.0-1.6 |
| Eggs (placeholder until `egg_cluster`) | `hw('pumpkin_yellow_small')` x3-5 cluster, or `kn('mushroom_tanGroup')` | tint `0xd6dfae`, emissive `0x86c93a` x0.3 |
| Echo crystals | `gp('crystal_blue')` | tint `0x39d0c4`, emissive `0x39d0c4`, light |
| Nerubian pillars / arches (placeholder) | `dg('pillar_decorated')`, `dg('wall_arched')`, `ip('psx-dungeon','arch')`, `ip('psx-dungeon','pillar')`, `ip('psx-dungeon','hexagon')` (hex floor panels), `ip('psx-dungeon','skull_wall')` (carapace wall) | tint `0x2a3a52` |
| Sentry statues | `gp('statue_hooded')` | tint `0x2a3a52`, teal eyes via emissive |
| Vats, cauldrons | `gp('cauldron')` scale 2.2 | tint `0x3a1245`, liquid emissive violet; `dg('barrel_large')` tinted violet as cargo |
| Pipes and hoses | `ip('psx-dungeon','chain')`, `gp('chains_hanging')` | tint dark metal |
| Cargo carts | `gp('wagon')`, `ks('barrel')` | tint `0x2a2030` |
| Lab | `gp('alchemy_table')`, `dg('table_long')`, `dg('bottle_A_green')`, `dg('bottle_B_green')`, `dg('shelf_small')`, `gp('cauldron')` | green liquid |
| Torches / lanterns | `dg('torch_mounted')` (amber), `hw('lantern_hanging')`, `kg('lantern-candle')` | amber lights |
| Font of Power | `gp('font_of_power')` | tint `0x39d0c4` |
| Shrines | the dungeon-local `shrine()` helper copied from `golge_tapinagi.ts` (`kg('altar-stone')` + `gp('crystal_purple')` or `gp('crystal_blue')` + `lt`) | power purple, haste blue |
| Gong (placeholder) | `kg('lantern-glass')` scale 2 tinted amber | until `echo_gong` |
| Exit portal, chest | `gp('mplus_portal')` (scale 0.6, teal tint), `gp('chest_epic')` | M+ end chest |
| Skip barricade | `kg('coffin')` / `dg('wall_broken')` as `tag: 'breakable'` blockers | see section 3.5 |
| Gallery balconies, rails (placeholder) | `dg('barrier')`, `dg('wall_arched')`, `ip('psx-dungeon','arch')` | tint `0x2a3a52`, placed at y 9-18, no collision |
| Chandeliers (placeholder) | `ip('psx-dungeon','chandelier')` tinted teal, or a ring of 6 `gp('crystal_blue')` on `gp('chains_hanging')` | halo light only, y 10-24 |
| Banners (placeholder) | `dg('banner_blue')`, `dg('banner_patternA_blue')` tinted silver `0xb9c6d8` | hung at y 4-10 |
| Statues (placeholder) | `gp('statue_hooded')` tinted slate, teal eyes | until `nerub_statue` |

### 2.7 NEW props to build in Blender

All 24 via `tools/blender/props/props_yanki.py` using `psx_lib` (low-poly, one 128 px atlas each, emissive tiles, exported to `public/assets/models/gen/props/`, doc regenerated by `make_doc.mjs`). Sizes W x H x D in metres.

| Name | Size | One-line look |
|---|---|---|
| `web_gate_arch` | 14 x 10 x 3 | entrance gate: two huge curved chitin fangs forming a pointed arch, ribbed lintel, hanging cocoons, a web wall in the opening with a teal eye-sigil (section 7) |
| `nerub_arch` | 8 x 6 x 1.4 | door frame for room openings: two fang-pillars and a ribbed lintel, silver web scraps |
| `nerub_pillar` | 1.6 x 6 x 1.6 | ribbed chitin column with teal rune bands, claw-split capital |
| `chitin_rib_wall` | 4 x 4 x 1 | wall segment with rib pattern for the `nerub` wall style |
| `web_curtain` | 4 x 4 x 0.1 | alpha-masked radial web sheet; the pack-lock gate curtain (teal glow when about to open) |
| `web_sheet_floor` | 4 x 0.02 x 4 | floor web decal (alpha) |
| `egg_cluster` | 1.4 x 1.1 x 1.4 | pale green translucent eggs with veins, weak emissive; variants A (3 eggs), B (7 eggs, 2 m), C (broken shells, swapped in on wake) |
| `cocoon_hanging` | 0.9 x 2.4 x 0.9 | silk-wrapped body hung from the ceiling (origin at top, like `chains_hanging`) |
| `black_blood_vat` | 3.2 x 3.0 x 3.2 | riveted nerubian vat, violet-black liquid with emissive sheen, two spigot hoses |
| `black_blood_pipe` | 4 x 0.8 x 0.8 | straight pipe segment; plus a junction variant |
| `cargo_cart` | 2.4 x 1.4 x 3.6 | cart loaded with violet Black Blood bladders |
| `echo_crystal_spire` | 1.4 x 5 x 1.4 | tall teal spire, pulsing emissive |
| `echo_gong` | 2.2 x 3 x 0.8 | bronze-and-chitin gong on a frame, teal runes; `Strike` clip 0.6 s (SFX `gong` exists) |
| `light_shaft` | 4 x 12 x 4 | additive cone for the sinkhole shaft |
| `nerub_stair_rail` | 4 x 1.2 x 0.3 | balustrade segment of fang spurs for the stair strips and pit edges (collides) |
| `gallery_balcony` | 8 x 1.5 x 3 | decorative upper balcony segment (corbel, rail, hanging silk), non-walkable, placed at y 9-18, dressed with cocoons, banners or statues |
| `echo_chandelier` | 3 x 3 x 3 | chain-hung ring of 6 teal crystals with silver web festoons, halo only, hung at y 10-24 |
| `web_banner` | 1.2 x 4.5 x 0.1 | long tattered silk banner with a teal eye sigil, hung at height |
| `nerub_statue` | 1.8 x 4 x 1.8 | rearing nerubian sentry statue with a raised spear and teal eyes |
| `sentry_horn_totem` | 1 x 3.2 x 1 | Stagshell horn totem, the visual hint for Alarm Çığlığı |
| `dissection_table` | 2.4 x 1 x 1.2 | chitin table with straps and green stains |
| `specimen_cage` | 1.4 x 2 x 1.4 | hanging cage with a silk-wrapped specimen (lab catwalk) |
| `harvest_lift_frame` | 6 x 14 x 6 | open iron lift shaft with cables and a stopped platform at y 14 (Alt Depo backdrop) |
| `silk_bridge_rope` | 5 x 1.6 x 0.3 | silk rope railing for the bridge deck |

### 2.8 Enemy models

Primary models are existing assets; the three NEW nerubian creature bases and two NEW boss models are the upgrade that makes the dungeon read as nerubian instead of recoloured skeletons. Ship with fallbacks first.

| Role | Primary | Fallback until the NEW model exists |
|---|---|---|
| Crawlers (Aç Sürünen, Şişkin Sürünen, Starved) | `itch/creatures/spider.glb` with `visual.texture` = `spider_pale.png`, tints below | same |
| Wasps (Sokucu Arı, Kanatlı Taşıyıcı) | `itch/creatures/wasp.glb` | same |
| `nerub_soldier` (Yardımcı, Dron, İri Kan Muhafızı): 2.6 m four-limbed chitin warrior with mandibles | NEW (`tools/blender/creatures/c_nerub.py`, about 1100 tris) | `enemies/Skeleton_Warrior.glb` / `Skeleton_Rogue.glb`, tint `0x4a5a78`, teal `eyeEmissive` |
| `nerub_weaver` (Görevli, Ağ Büyücüsü, Kan Bakıcısı, Boynuzkabuk, Gözcü, Ağ Örücü): 2.4 m draped caster with long arms and silk trails | NEW | `enemies/Skeleton_Mage.glb`, tint `0x607090` |
| `nerub_worker` (Kan İşçisi, runner): 1.8 m hunched hauler with a bladder on its back | NEW | `enemies/Skeleton_Minion.glb`, tint `0x6a5a78` + attached `gp('sacks')` on `chest` |
| Avanoksa | `itch/creatures/spider.glb` x2.6, `spider_pale.png` | same (this is already a very good match) |
| Anubzek | NEW `nerub_overseer` (bosslib, about 4 m, mandibles, spiked carapace back, teal runes) | `enemies/Skeleton_Warrior.glb` x2.1, tint `0x4a5a78` |
| Kikatal | NEW `nerub_harvester` (bosslib, about 5 m, crowned carapace, silk cape, violet vial on the back) | `gen/bosses/golge_rahibesi.glb` x1.15, tint `0x6a3a8a`, emissive `0x8a40c0` |

Clip contract for the NEW creatures (same as the other generated creatures): `Idle`, `Walk`, `Run`, `Attack` (impact 0.45), `Attack2` (0.5), `Cast` (0.6), `Hit`, `Death`, `Spawn`; bosses add `Enrage`.

### 2.9 VFX palette

Hits and spit use `poison_burst` / `poison_projectile` (venom green). Echo effects (gong, resonance, interrupts) use `arcane_burst` with colour override `0x39d0c4`. Black Blood uses `shadow_ground` with colour `0x8a3bb0` and `sanguine_pool` recoloured violet (keep Sanguine-affix pools red so they read differently). Swarm uses `poison_cloud` with colour `0xd09a3c` plus `ambient_dust` specks. Webs use `smoke_zone` silver `0xb9c6d8`. New ids (YSP-11): `web_burst`, `egg_burst`, `swarm_cloud`, `black_blood`; until presets exist they alias to `smoke_zone`, `add_spawn`, `poison_cloud`, `shadow_ground`.

### 2.10 Music and ambience mood

Slow hollow resonant drones, clicking chitin in the high end, sparse bell-like pings that echo with a long delay (use `gong`/`ice_chime` pitched down 0.6 on a 25-40 s random timer, panned), dripping water (`amb_dungeon_bed`). The Strands are airy and eerie, the Overlook adds a tremolo-string pulse, the Undercache adds a low heartbeat (`heartbeat_loop` SFX at low volume) and wet industrial thuds. Boss fights use the `boss` track; Kikatal's phase 2 raises the heartbeat. Exploration track: `dungeon_web` = `music/dungeon_cave_theme.ogg` (gain 1.0), fallback `dungeon_crypt`.

---

## 3. Layout

### 3.1 Grid and map

Grid 64 x 56 tiles. Legend: `A` giris, `a` kopru, `B` teller, `i` ixin_oyugu, `n` nakt_oyugu, `k` atik_oyugu, `E` yumurta_odasi (optional), `r` rampa_bir, `V` avanoksa_yuvasi (boss 1), `s` rampa_iki, `H` nobet_holu, `g` ag_gecidi (skip), `L` laboratuvar, `Y` anubzek_terasi (boss 2), `t` tunel, `M` kan_hatti, `D` dron_kogusu, `Q` kikatal_deposu (boss 3). Marks: `+` open door, `#` boss_lock, `%` boss_exit, `.` pack centre, `e` dormant pack, `p` patrol pack, `S` start, `F` Kehanet Taşı, `1 2 3` boss spawns, `X` exit portal and chest, `P` Kudret Sunağı, `W` Rüzgâr Sunağı, `*` rift / Kibirli spots, `&` Yankı Çanı gongs. Generated and validated by script (no overlaps, every door lies on a shared edge).

```
    0         1         2         3         4         5         6   
    0123456789012345678901234567890123456789012345678901234567890123
 4                      YYYYYYYYYYYYY      MMMMMMMMMMMM
 5                      YYYYYYYYYYYYY      MMMMMMMMMMMM
 6                      YYYYYYYYYYYYY      MMMMMMpMMMMM
 7                      YYYYYYYYYYYYY      MMMMMMMMMMMM
 8                      YYYYYY2YYYYYYttttttMMMMMM*MM.MM
 9                      YYYYYYYYYYYYY%ttptt+MMMMMM&MMMM
10                      YYYYYYYYYYYYY%ttttt+MMMMMMMMMMM
11                      YYYYYYYYYYYYY      MMM.MMMMMMMM
12                      YYYYYYYYYYYYY      MMMMMMpMMMMM
13                      YYYYYYYYYYYYY      MMMMMMMMMMMM
14                      YYYYYYYYYYYYY              D++DDDDD
15                      YYYYYYYYYYYYY              DDDDD.DD
16                      YYYYY##YYYYYY              DDDDDDDD
17                      LLLLLLLLLLLLLHHHHHHHHHHHHHHDDDeDDDD
18                      LLLLLLLLLLLLLHHHHHHHHHHHHHHDDDD*DDD
19                      LLLLLLLLLLLLLHHHHHHHHHHHHHHDDDDDDDD
20                      LLL.LLLLLLLLLHHHHHHH.HHHHHHDDDD.DDD
21                      LLLLLLLLLLLL+HHHHHHHHHHHHHHDDDDDDDD
22                      LLLLLL*LL.LL+HHHH&HH*HH.HHHQQQ##QQQQQQQQQQ
23                      LLLLLLLLLLLLLHHHHHHHHHHHHHHQQQQQQQQQQQQQQQ
24                      LLLL.LLLLLLLLHHHH.HHHHHHHHHQQQQQQQQQQQQQQQ
25                      LLLLLLLLLLLLLHHHHHHHHHHHHHHQQQQQQQQQQQQQQQ
26                      LWLLLLLL.LLLLHHHHHHHpHHHHHHQQQQQQQQQQQQQQQ
27                      LLLLLLLLLL++LHHHHHH++HHHHHHQQQQQQQQQQQQQQQ
28                               ggggggggggsss     QQQQQQQQQQQQQQQ
29                               ggggg.ggg+sss     QQQQQQQQQQQQQQQ
30                               ggggggggg+s.s     QQQQQQQ3QQQQQQQ
31                                         sss     QQQQQQQQQQQQQQQ
32                                         %%s     QQQQQQQQQQQQQQQ
33                                   VVVVVVVVVVVVV QQQQQQQQQQQQQQQ
34                 iiiiii  nnnnnn    VVVVVVVVVVVVV QQQQQQQXQQQQQQQ
35                 iiiiii  nnnnnn    VVVVVVVVVVVVV QQQQQQQQQQQQQQQ
36                 iiiiii  nnnnnn    VVVVVVVVVVVVV
37                 iii.ii  nnn.nn    VVVVVV1VVVVVV
38                 iiiiii  nnnnnn    VVVVVVVVVVVVV
39                 ii++ii  nn++nn    VVVVVVVVVVVVV
40                 BBBBBBBBBBBBBBrrrrVVVVVVVVVVVVV
41                 BBBBBBBBBBBBBB+r.r#VVVVVVVVVVVV
42                 BBBBBBBeBBBBBB+rrr#VVVVVVVVVVVV
43                 BBBBBBBBBBBBBB    VVVVVVVVVVVVV
44                 BBBBBBBBBBBBBB      EEEEEEEEEE
45   AAAAAAAAA     BBBBBBBBp&BBBBkkkkkkEEEEEEEEEE
46   AAAAAAAAA     BBBBBBBBBB*BBBkkkkkkEEEEEEEEEE
47   AAAFAAAAAaaaaaBBB.BBBBBBBBBB+kkkkk+EEEEEEEEE
48   AAAAAAAAA+aaaa+BBBBBBBBBBBBB+kk.kk+EEEEeEEEE
49   AASAAAAAA+apaa+BBBBBBBBBB.BBkkkkkkEEEEEEEEEE
50   AAAAAAAAAaaaaaBBBB*BBBBBBBBBkkkkkkEEEEEEEEEE
51   AAAAAAAAA     BBBBBB.BBBBBBB      EEEEEEEEEE
52   AAAAAAAAA     BBBBBBBBBBBBPB      EEEEEEEEEE
53                 BBBBBBBBBBBBBB
```

### 3.2 Rooms and height

Rect = `x, z, w, h` in tiles (the `RoomDef.rect`); continuous interior = `x-0.5 .. x+w-0.5` and `z-0.5 .. z+h-0.5`. `kit.ts` `room(id, name, x, z, w, h, floor, wall, autoDecor, extra)`. **Height (`CORE_MECHANICS` section 13):** each room carries `floorY` (m, the floor at the room's doors) and `ceiling` (m, drives wall height, pillar and arch scale and the camera limit). Rooms at a different `floorY` than their neighbour are joined by a **stair or ramp strip** (3.2b), a tile strip that interpolates height, always with a max step of 0.45 m. Every door lies where both rooms have the same height. Four height bands: **+2..+3** (Avanoksa 2, Alt Depo 3), **+4..+5** (Teller 4, Hasat Laboratuvarı 5), **+6..+8** (Görevli alcoves 7, nursery 7, Ağ Geçidi 6, Kara Kan Hattı 7, Dron Koğuşu 7, Nöbetçi Holü 8), **+10..+11** (entrance ledge and bridge 10, Seyir Terası 11). No walkable floors overlap (the bridge is the only walkway over void).

| id | Ad (TR) | rect x,z,w,h | size (m) | floor / wall | floorY | ceiling | purpose |
|---|---|---|---|---|---|---|---|
| `giris` | Ağ Kapısı Girişi | 2, 45, 9, 8 | 36 x 32 | stone_dark / cave | **10** | 30 | start, Kehanet Taşı, daylight shaft, start barrier on the east door until the countdown ends; a rim ledge high above the Strands |
| `kopru` | Yarık Köprüsü | 11, 47, 5, 4 | 20 x 16 | stone_dark / cave | **10** | 26 | chasm bridge (`pit` + `bridge` zones), patrol p01; the Teller basin glows far below |
| `teller` | Parçalanmış Teller | 16, 40, 14, 14 | 56 x 56 | dirt / cave | **4** (entry stair from 10, alcove stairs to 7) | 30 | main cavern basin, 5 packs incl. the dormant egg pull, Kudret Sunağı, gong, hub of the three Görevli rooms |
| `ixin_oyugu` | Iksin Odası | 16, 34, 6, 6 | 24 x 24 | stone_dark / cave | **7** | 10 | miniboss alcove (Iksin), gate pack, raised throne |
| `nakt_oyugu` | Nakat Odası | 24, 34, 6, 6 | 24 x 24 | stone_dark / cave | **7** | 10 | miniboss alcove (Nakat), gate pack |
| `atik_oyugu` | Atik Odası | 30, 45, 6, 6 | 24 x 24 | stone_dark / cave | **7** (stair from 4) | 10 | miniboss alcove (Atik), gate pack, door to the nursery |
| `yumurta_odasi` | Yumurta Kuluçkası | 36, 44, 10, 9 | 40 x 36 | dirt / cave | **7** | 12 | **optional**, dormant egg pack p29, chest |
| `rampa_bir` | Ağ Rampası | 30, 40, 4, 3 | 16 x 12 | stone_dark / cave | **4 to 2** (ramp) | 8 | corridor to the boss 1 curtain, pack p10 |
| `avanoksa_yuvasi` | Avanoksa'nın Yuvası | 34, 33, 13, 11 | 52 x 44 | stone_dark / cave | **2** | 20 | **boss 1 arena**, round web dais, 6 egg spots; egg ledges 4-6 m up on the walls (decor) |
| `rampa_iki` | Yukarı Yol | 40, 28, 3, 5 | 12 x 20 | stone_dark / temple | **2 to 8** (ramp) | 9 | long climb north, pack p11, fork: hall (north) or Ağ Geçidi (west, at y about 6) |
| `nobet_holu` | Nöbetçi Holü | 34, 17, 14, 11 | 56 x 44 | tiles / temple | **8** | 24 | Stagshell and Bloodguard hall, 4 packs, gong; decorative galleries at +12 on both long sides |
| `ag_gecidi` | Ağ Geçidi | 30, 28, 10, 3 | 40 x 12 | dirt / cave | **6 to 5** (ramp) | 7 | **skip** corridor to the lab, pack p16, silk barricade |
| `laboratuvar` | Hasat Laboratuvarı | 21, 17, 13, 11 | 52 x 44 | stone_dark / brick | **5** (east stair from 8, north grand stair to 11) | 14 | harvest lab, 4 packs, Rüzgâr Sunağı, catwalk at +9 (decor) |
| `anubzek_terasi` | Yankı Seyir Terası | 21, 4, 13, 13 | 52 x 52 | temple / temple | **11** | open (void) | **boss 2 arena**, disc with 4 corner pits and an Eye sigil |
| `tunel` | Kara Kan Tüneli | 34, 8, 6, 3 | 24 x 12 | stone_dark / forge | **11 to 7** (ramp) | 8 | corridor east and down, patrol p21 |
| `kan_hatti` | Kara Kan Hattı | 40, 4, 12, 10 | 48 x 40 | stone_dark / forge | **7** | 16 | harvest line, 4 packs (2 patrols), vats, gong; pipe catwalks at +11 (decor) |
| `dron_kogusu` | Dron Koğuşu | 48, 14, 8, 8 | 32 x 32 | dirt / cave | **7** | 12 | drone barracks, 3 packs (one dormant ceiling pack) |
| `kikatal_deposu` | Alt Depo | 48, 22, 15, 14 | 60 x 56 | stone_dark / forge | **3** (north stair from 7) | 22 | **boss 3 arena**, central cauldron ring, 4 vats, Bloodworker lanes; harvest-lift frame above |

**3.2b Stair and ramp strips** (`RoomDef.strips: { rect, dir, y0, y1 }`, tiles inclusive, steps are visual: rise / 0.43 rounded). A strip belongs to the room that contains its tiles and ends exactly at the door edge, where its end height equals the neighbour's `floorY`. The slope stays under 21 degrees everywhere, so melee and shapes never meet a height difference above 2.5 m inside a fight (`CORE_MECHANICS` section 13).

| id | Room | Tiles (x, z) | Direction | Height | Run | Rise | Steps / slope | Role |
|---|---|---|---|---|---|---|---|---|
| H1 | `teller` | 16..19, 46..50 | east, down | 10 to 4 | 16 m | 6 m | 14 steps of 0.43, 20.6 deg | **Büyük İniş Merdiveni** (grand descent set piece) |
| H2 | `teller` | 17..19, 40..41 | north, up | 4 to 7 | 8 m | 3 m | 7 steps, 20.6 deg | Iksin Odası stair |
| H3 | `teller` | 25..27, 40..41 | north, up | 4 to 7 | 8 m | 3 m | 7 steps | Nakat Odası stair |
| H4 | `atik_oyugu` | 30..31, 46..49 | east, up | 4 to 7 | 8 m | 3 m | 7 steps | Atik Odası stair |
| H5 | `rampa_bir` | 30..33, 40..42 | east, down | 4 to 2 | 16 m | 2 m | ramp, 7.1 deg | Ağ Rampası |
| H6 | `rampa_iki` | 40..42, 28..32 | north, up | 2 to 8 | 20 m | 6 m | ramp, 16.7 deg | Yukarı Yol (the long climb out of the nest) |
| H7 | `ag_gecidi` | 30..33, 28..30 | west, down | 6 to 5 | 16 m | 1 m | ramp, 3.6 deg | skip corridor end |
| H8 | `laboratuvar` | 31..33, 20..23 | west, down | 8 to 5 | 12 m | 3 m | 7 steps, 14 deg | hall to lab stair |
| H9 | `laboratuvar` | 24..28, 17..20 | north, up | 5 to 11 | 16 m | 6 m | 14 steps of 0.43, 20.6 deg | **Yankı Merdiveni** (grand stair to the terrace, flanked by balustrades, banners and statues) |
| H10 | `tunel` | 34..39, 8..10 | east, down | 11 to 7 | 24 m | 4 m | ramp, 9.5 deg | the descent into the Undercache line |
| H11 | `kikatal_deposu` | 50..53, 22..24 | south, down | 7 to 3 | 12 m | 4 m | 10 steps of 0.4, 18.4 deg | stair into the boss pit |

Pack and prop placement that avoids the strips (checked by script with the same reserved circles as packs and doors): **p02 moves to (21.5, 47)**, **p09 to (33, 47.5)**, **p16 to (35.5, 29)**, **p18 to (28, 22.5)**, **p19 to (22, 22)**; the NW Alt Depo vat moves to (48.8, 25.8) and the first Bloodworker lane to z = 25.0; the lab rift spot moves to (32.5, 26.5) (section 6.5).

**Side elevation of the critical path** (not to scale horizontally, one row = 1 m; `_` floor, `|` drop or climb between floors):

```
 11                                                                   _________                           
 10 ___________                                                      _         _                          
  9           |                                                     _           _                         
  8            __                              __________          _             _                        
  7             |                             _         |         _               _____________           
  6              __                          _           __      _                             _          
  5               |                         _              ______                               _         
  4                _____________           _                                                     _        
  3                             _         _                                                       ________
  2                              _________                                                                
    1     2   3     4          5  6       7    8        9  10    11   12      13   14     15   16 17      
```

1 Ağ Kapısı Girişi 10 m · 2 Yarık Köprüsü 10 · 3 Büyük İniş Merdiveni (H1) 10 to 4 · 4 Parçalanmış Teller 4 (the alcoves at +7 branch off to the north and east) · 5 Ağ Rampası · 6 **Avanoksa** 2 (lowest point of the first half) · 7 Yukarı Yol, the long climb 2 to 8 · 8 Nöbetçi Holü 8 · 9 hall to lab stair · 10 Hasat Laboratuvarı 5 · 11 **Yankı Merdiveni** 5 to 11 · 12 **Yankı Seyir Terası** 11 (highest point, open void with the lower city below) · 13 Kara Kan Tüneli, down 11 to 7 · 14 Kara Kan Hattı 7 · 15 Dron Koğuşu 7 · 16 pit stair 7 to 3 · 17 **Alt Depo** 3. The skip (`ag_gecidi`) leaves the climb at y about 6 and rejoins the lab at 5, bypassing the 8 m hall. The nursery lies at 7 off the Atik alcove.

**Chasm, bridge and lift:** `kopru` is the chasm set piece (blocked `pit` with a `bridge` deck, fall rule of section 13: 25% max HP and a respawn at the last safe tile). Ara-Kara has no lift, so no walkable lift is added; the harvest lift is a backdrop frame over the Alt Depo, and the exit portal and chest rise out of the cauldron mouth at the end of the fight.

Room extras (`ROOM_EXTRA`): `ambientVfx 'ambient_dust'` in the caverns, `'ambient_shadow_wisps'` (violet) in `tunel`, `kan_hatti`, `kikatal_deposu`; `lightColor` teal `0x39d0c4` in `giris`, `teller`, `avanoksa_yuvasi`, `anubzek_terasi`; amber `0xd09a3c` in `nobet_holu`, `laboratuvar`; violet `0x8a3bb0` in the Undercache; green `0x86c93a` in `yumurta_odasi`, `dron_kogusu`. `explicitDecor: true` on `giris`, the three boss arenas, `kopru`, `kikatal_deposu`.

Zones (`ZoneDef`):

* `kopru`: `rectZone('pit', 11, 47, 5, 4, { blocked: true, color: 0x000000, glow: 0x39d0c4, glowIntensity: 0.6 })` then `rectZone('bridge', 11, 48, 5, 2)` (walkable deck through the chasm, at y 10).
* `avanoksa_yuvasi`: `circleZone('dais', 40, 38, 5.2, { color: 0x1c2630 })` plus a thin `rune` ring in silver.
* `anubzek_terasi`: four corner `rectZone('pit', ..., { blocked: true })` of 2 x 2 tiles at (21,4), (32,4), (21,15), (32,15); `circleZone('dais', 27, 10, 5.8)`; the Eye sigil as `circleZone('rune', 27, 10, 4.6, { color: 0x0e1a26, glow: 0x39d0c4, glowIntensity: 0.9 })` and a second inner ring r 2.0.
* `kikatal_deposu`: `circleZone('pit', 55, 28.5, 1.7, { blocked: true, color: 0x000000, glow: 0x8a3bb0, glowIntensity: 1.2 })` (the cauldron mouth; the walkway around it stays open) and four `circleZone('pool', corner, 1.3, { color: 0x1a0a22, glow: 0x8a3bb0 })` under the vats.
* `giris`: `circleZone('rune', 6.5, 47, 1.7, { glow: 0x39d0c4 })` under the Font.
* `tunel`, `kan_hatti`: wet `rectZone('pool', ..., { color: 0x120a1a, glow: 0x8a3bb0, glowIntensity: 0.3 })` decals (no `hazard`, purely visual).

### 3.3 Doors

`door(a, b, tx, tz, side, width, gate)`; `tile` is a tile of room `a` on the shared edge. All are 2 wide. The three new gate rules are YSP-03 (`requires`) plus the existing `boss_lock` / `boss_exit`.

| a | b | tile (in a) | side | gate | note |
|---|---|---|---|---|---|
| giris | kopru | 10, 48 | e | none | start barrier here until the 10 s countdown ends (`StartBarrier`) |
| kopru | teller | 15, 48 | e | none | |
| teller | ixin_oyugu | 18, 40 | n | none | |
| teller | nakt_oyugu | 26, 40 | n | none | |
| teller | atik_oyugu | 29, 47 | e | none | |
| atik_oyugu | yumurta_odasi | 35, 47 | e | none | optional nursery |
| teller | rampa_bir | 29, 41 | e | none | |
| rampa_bir | avanoksa_yuvasi | 33, 41 | e | **boss_lock** + `requires: ['yk_p07','yk_p08','yk_p09']` | web curtain until all three Görevli packs are dead |
| avanoksa_yuvasi | rampa_iki | 40, 33 | n | **boss_exit** | |
| rampa_iki | nobet_holu | 40, 28 | n | none | |
| nobet_holu | laboratuvar | 34, 21 | w | none | |
| rampa_iki | ag_gecidi | 40, 29 | w | none | skip entrance, blocked by the silk barricade (section 3.5) |
| ag_gecidi | laboratuvar | 31, 28 | n | none | |
| laboratuvar | anubzek_terasi | 26, 17 | n | **boss_lock** | |
| anubzek_terasi | tunel | 33, 9 | e | **boss_exit** | |
| tunel | kan_hatti | 39, 9 | e | none | |
| kan_hatti | dron_kogusu | 49, 13 | s | none | |
| dron_kogusu | kikatal_deposu | 51, 21 | s | **boss_lock** | |

Start `pos (4, 49.5)` facing 90 (east). `exit.pos (55, 34)`. Kehanet Taşı at `(6.5, 47)`.

Heights at the doors: every door lies where both neighbours have the same height (a strip ends at the door edge), so no door needs a step: giris/kopru 10, teller 4 at the entry stair foot and at the rampa door, alcove doors 4 to 7 at the teller strips, rampa_bir to avanoksa 2, avanoksa to rampa_iki 2, rampa_iki to nobet_holu 8, nobet_holu to laboratuvar 8 (stair H8 inside the lab), laboratuvar to anubzek_terasi 11 (stair H9), anubzek_terasi to tunel 11, tunel to kan_hatti 7, kan_hatti to dron_kogusu 7, dron_kogusu to kikatal_deposu 7 (stair H11).

### 3.4 Critical path, optional areas and skips

* **Critical path (about 615 m of walking, 88 s at 7 m/s):** giris → kopru → teller → (Iksin, Nakat, Atik rooms in any order) → rampa_bir → **Avanoksa** → rampa_iki → nobet_holu → laboratuvar → **Anubzek** → tunel → kan_hatti → dron_kogusu → **Kikatal**.
* **Free order:** the three Görevli rooms can be cleared in any order; the gate opens only when all three packs are dead.
* **Optional:** `yumurta_odasi` (28 forces, a chest, a dormant egg pull). Optional on route A, mandatory on route B.
* **Skip:** `ag_gecidi` bypasses the whole `nobet_holu` (84 forces, the most dangerous trash of the dungeon) and drops into the lab. It is sealed by a silk barricade: two `tag: 'breakable'`, `collide: true` props (`kg('coffin')`, `dg('wall_broken')` tinted silver) that any attack smashes, so anyone can open it, but the corridor has its own guard pack (p16).
* **Dead runs:** in M+ a released player respawns at the dungeon start (systems rule, `GDD_CONTENT` 0.7) and runs back; the start is about 600 m from the last boss (about 90 s at 7 m/s). Trash never respawns, so the run-back is safe, and every `boss_exit` door stays open once its boss is dead. No extra shortcut is added on purpose: the +15 s death penalty plus the run-back is the intended cost, and in-combat revives (hold F 4 s) are the first answer.

### 3.5 Set pieces: how to build each with the engine

Existing systems are named; NEW ones are numbered `YSP-xx` and specified in section 8.1.

1. **Görevli gate (Attendant gate).** Three alcove packs (p07 Iksin, p08 Nakat, p09 Atik; each `rank: 'miniboss'` plus escorts, CC immune). The door `rampa_bir → avanoksa_yuvasi` is `boss_lock` with `requires: ['yk_p07','yk_p08','yk_p09']` (**YSP-03**): it shows a `web_curtain` prop in the opening, banner "Ağ titriyor..." when the third pack dies, then 3 s later the curtain rips (`web_burst`) and the door opens. Avanoksa already stands in the arena (nobody can enter while the door is closed, so no deferred spawn is needed); optional polish: she plays `GetUp` when the curtain rips.
2. **Egg platform and crawlers.** Six `egg_cluster` props in the Avanoksa arena with ids `egg_1..6` (anchors listed in 5.1). The boss script spawns `yk_starved_crawler` adds at those anchors (`c.spawnAdds(..., { positions })`), the eggs swap to the broken-shell variant on use. Crawlers fixate players (**YSP-04**).
3. **Chasm bridge.** `pit` (blocked) + `bridge` zones in `kopru` at y 10 (existing `Zones.ts`, fall rule of `CORE_MECHANICS` section 13), `nerub_arch` at both ends, teal crystals set 6 m below the deck (`y -6`) for depth.
4. **Dormant egg and ceiling packs.** p06 and p29 use `dormant: { kind: 'egg', wakeRadius: 6 }`; place an `egg_cluster` with `tag: 'wake'` under each member exactly as `kemik_mahzeni.ts` does with bone piles (`piles()` helper), swapped for the broken-shell variant at wake with VFX `egg_burst`. p26 uses `dormant: { kind: 'ceiling', wakeRadius: 7 }`: drone cocoons hang at `y 3.2`; on wake each member drops from y 6 with `leap_land` dust (**YSP-15**).
5. **Alarm Çığlığı (Sentry Stagshell).** Interruptible 2.6 s cast, `once: 1` (once per Stagshell, as in WoW). On completion every idle pack **in the same room within 25 m** aggroes and one `yk_bloodguard_alarm` is summoned (**YSP-07**, section 4.5); other rooms and farther packs are never pulled.
6. **Yankı Çanı (echo gongs).** Three one-use gongs (`&` on the map) at the three hottest decision points: teller (24.5, 44.5), nobet_holu (37.5, 21.5), kan_hatti (46.5, 9). Interact: a ring of r 14 m interrupts every enemy cast and stuns non-elite enemies 2 s, then the gong goes dark. Our replacement for the research file's tailor-only Discordant Attendant tether (no tailoring in this game) so every class has the same utility (**YSP-09**, `device: 'echo_gong'`).
7. **Eye of the Swarm (Anubzek).** An inverse zone: the whole disc hurts except a safe circle in front of the boss that follows his facing; the tank turns him to move it (**YSP-05** `safeCircle`).
8. **Bloodworker lanes and Black Blood pools (Kikatal).** Worker runners cross the arena on E-W lanes; hitting one drops a pool; stepping into a pool traps the player in a breakable pool entity (existing `trapPlayer` from `bosses/kit.ts`) triggered by **YSP-05** `watchZone`.
9. **Cosmic Singularity pull.** `bossMsg('boss_pull')` already exists (Kevvas uses it); **YSP-10** makes rooted players ignore the pull (the WoW "step in a puddle to anchor yourself" counterplay).
10. **Ceaseless Swarm.** A roaming damaging cloud entity chasing random players for 45 s (**YSP-05** `roamZone`).
11. **Kehanet Taşı** at `(6.5, 47)` in `giris` (`gp('font_of_power')`, existing), start barrier on the `giris → kopru` door (existing `StartBarrier`).
12. **Silk barricade** of the skip: two breakable blockers, see 3.4.
13. **Büyük İniş Merdiveni (H1).** A 14-step, 16 m grand staircase from the bridge ledge down into the Teller basin: two `nerub_stair_rail` runs, `nerub_arch` at the top, six strands and a chandelier overhead, the whole cathedral cavern revealed at the first landing (fog far 60 in the `teller` override). Purely a height strip plus dressing, no scripting.
14. **Yankı Merdiveni (H9).** The signature staircase of the dungeon: 14 steps, 20 m wide, from the lab up to the open terrace; balustrades, two `nerub_statue`s, four `web_banner`s and `nerub_arch` at the top; the first thing seen at the top is the Eye sigil and the lower city beyond the pits. Combat on it is avoided by design (no pack on the strip).
15. **Fall plane.** Stepping off the bridge or into a terrace pit uses the section 13 rule (25% max HP and a respawn at the last safe tile); the Alt Depo cauldron mouth and the Kikatal script pits kill outright only when scripted.

### 3.6 Room dressing sheet (props with counts, lights, VFX, sound)

This is the "most detailed map of the game" list: it is the content that YK-D2 hand-places (`Props.at/row/grid/ring/wall/torches/scatter`) on top of `autoDecor`; hero anchors with coordinates stay in 8.4. Counts are the whole room. "gallery" = non-walkable `gallery_balcony` segment, "chandelier" = `echo_chandelier` (halo only, no real light), "strand" = hanging silver web (`hanging_moss` tinted `0xb9c6d8`), "cocoon" = `cocoon_hanging`, "spire" = `echo_crystal_spire`. Light recipes are those of 2.3 (`lt(...)`: only 8 real point lights are active, the priority ones are the Font, shrines, gongs and boss-arena crystals; everything else is halo sprites). Sound ids are the existing audio families (`public/assets/audio/sfx/*`: `creatures/bug_*`, `creatures/chatter_*`, `creatures/burble_*`, `world/chain_*`, `world/creak_*`, `world/stones_*`, `magic/water_*`, `magic/poison_*`, `ambience/*`) plus the existing ids `gong`, `ice_chime`, `heartbeat_loop`; the music bed `amb_dungeon_bed` runs everywhere.

| Room (floorY / ceiling) | Props (counts) | Lights | VFX | Sound |
|---|---|---|---|---|
| `giris` (10 / 30) | Font of Power x1 with 4 spires; `light_shaft` x1 (12 m cone); collapsed ramp x1; `nerub_arch` x1; `web_banner` x2 (north wall, y 6-10); gallery x2 (west wall y 18, the lost caravan's balcony); strand x8 (y 4-12); cocoon x5; `web_sheet_floor` x4; `rock_tall*` x10; wagon wreck x1 + bone pile x3; amber lamp post x2 | Font `lt(0x39d0c4,2.2,12,false,2.0)` priority; 2 amber torches; 4 spire halos; shaft cone | `ambient_dust` + daylight motes in the shaft; teal rune pulse under the Font; a pebble crumb falls from the ceiling every 6 s | `ambience/dungeon_loop` low, `creatures/bug_02` clicks far away every 8-14 s, `world/stones` crumb, wind from the shaft (`ambience/wind_loop` at 0.2) |
| `kopru` (10 / 26) | `nerub_arch` x2; `silk_bridge_rope` rails x6 along both deck edges; 4 spires set 6 m below the deck (y -6); cocoon x4 (y 8-14); `web_sheet_floor` x2 on the deck; web strands strung across the chasm x6 | 2 teal halos far below, 2 amber torches at the arches | rising teal motes from the chasm (`ambient_dust` teal), mist layer at y -3 | `world/creak` from the ropes (every 5-9 s), wind, a deep distant `gong` every 40 s |
| `teller` (4 / 30) | grand stair H1 with `nerub_stair_rail` x2 runs; web dome: `web_curtain` x6 on a ring r 3.5 at y 3.2; `light_shaft` x1; `nerub_pillar` x6; `egg_cluster` x2 decor + p06 wake eggs; wagon wreck x1 + silk; chandelier x3 (y 22); gallery x6 (north and east upper walls, y 14-18, hung with cocoons); `web_banner` x4; `rock_tall*` x14; cocoon x10; strand x40 (y 4-14); bones x10; shrine x1; gong x1; three alcove arches x3 | Kudret Sunağı `lt(0x39d0c4)` priority, gong priority, 3 chandelier halos, shaft, 2 amber torches at each alcove door | `ambient_dust`, slow falling silk flakes (`smoke_zone` silver, sparse), the egg glow breathes (emissive 0.25 to 0.4 at 0.2 Hz) | `creatures/bug_01..04` clicks from the walls, `creatures/chatter_03` far away, `magic/water` drips every 4-8 s, `ice_chime` pitched 0.6 every 25-40 s, echo reverb on every ability SFX |
| `ixin_oyugu` (7 / 10) | `nerub_arch` x1; throne `kg('altar-stone')` x2.8 (raised 0.5 m inside); 2 spires; cocoon x6; gallery x1 (decor shelf of silk idols); `web_banner` x2 | amber lamp, 2 spire halos | teal pulse from the throne each time Dehşet Çığlığı fires | low drone, `creatures/chatter_01` when Iksin is pulled |
| `nakt_oyugu` (7 / 10) | `nerub_arch`; `egg_cluster` A x4; cocoon x6; strand x6; `web_banner` x2 | green glow `lt(0x86c93a,1.0,6,true)` x2 | egg glow, small green motes | wet clicks, `creatures/burble_01` from the eggs |
| `atik_oyugu` (7 / 10) | `nerub_arch` x2 (both doors); `gp('cauldron')` x2 green; `dg('bottle_*_green')` x6; `dissection_table` x1; cocoon x4; shelf x2 | amber lamp, venom green glow x2 | green steam from the cauldrons (`poison_cloud` low alpha) | `magic/poison` bubbling loop, drips |
| `yumurta_odasi` (7 / 12) | p29 wake eggs x12; `egg_cluster` A/B x20; `chest_wood` x1; `web_sheet_floor` x6; strand x10; cocoon x6; rib wall segments x8 | 3 green lights `lt(0x86c93a,1.0,6)` | `egg_burst` on wake; drifting spores (`ambient_dust` green) | moist `creatures/burble` and `bug` loops; a held breath-silence cue when entering |
| `rampa_bir` (4 to 2 / 8) | `web_curtain` gate x1 (tag `gate`, YSP-03); 2 amber torches; `nerub_stair_rail` x2; silk on walls x8 | 2 amber torches; the curtain glows teal when the third Görevli pack dies | `web_burst` when the curtain rips | `world/creak`, a rising `ice_chime` when it opens |
| `avanoksa_yuvasi` (2 / 20) | egg clusters B x6 (ids `egg_1..6`); round dais; torn canopy: `web_curtain` x8 on a ring r 6 at y 3.2-9; `nerub_pillar` x4; egg ledges: gallery x6 at y 4-6 holding egg clusters x12 (decor, dormant); `web_sheet_floor` x10; cocoon x8; bones x8; strand x24 | 4 teal lamps, egg glow, boss-arena crystals priority | `egg_burst` on spawn; web strands sway; ceiling silk drifts down on Uyarı Çığlığı | heavy skittering `creatures/chatter_05` loop during the fight, `creatures/monster_*` for the shrill, boss track `boss` |
| `rampa_iki` (2 to 8 / 9) | `nerub_stair_rail` x2 runs; 2 amber torches; `gp('signpost')` x1 at the fork; silk x8; carapace wall panels x6 | 2 amber torches, a hall glow at the top | none | echoing footsteps, `world/chain` rattle ahead |
| `nobet_holu` (8 / 24) | `nerub_pillar` x6 (ribbed, 18 m); `nerub_statue` x6 (sentries); `sentry_horn_totem` x4; gong x1; chandelier x4 (y 18-22); gallery x8 (both long walls, y 12, with banners and cocoons); `web_banner` x8; hex floor panels x12; spear racks x4; amber torches x6; silk x12 | 6 amber torches, 4 chandelier halos, gong priority | dust shafts between pillars; a teal pulse along the floor hexes when Alarm Çığlığı completes | `world/metal_click` sentry creaks, `world/bell_heavy` low toll every 30 s, `gong` on use |
| `ag_gecidi` (6 to 5 / 7) | silk barricade: 2 breakable blockers; strand x6; bones x4; carapace panel x4 | 1 dim amber torch | dust when smashed (`break_wood_heavy`) | `world/break_wood` on smash, wind |
| `laboratuvar` (5 / 14) | `dissection_table` x4; `dg('table_long')` x2; `gp('alchemy_table')` x2; `gp('cauldron')` green x2; green urns x6; shelf x4; `specimen_cage` x6 hung from a catwalk gallery at y 9 (decor); Yankı Merdiveni H9 with `nerub_stair_rail` x2, `web_banner` x4, `nerub_statue` x2; chandelier x2 (y 10); shrine x1; glass-jar rows x3; cocoon x4 | amber `laboratuvar` light, green glows x3, shrine priority | green bubbling steam, jar glints, dripping tube drops (`poison_burst` tiny) | `magic/poison` bubble loop, `world/metal`, `creatures/burble_02`, a cage rattle every 12 s |
| `anubzek_terasi` (11 / open) | Eye sigil `circleZone('rune')` + inner ring; spire x4 (compass points); corner pits x4 with a lit lower city (amber halos x12, spire x4 at y -8); hex panels x24 in the floor ring; `nerub_stair_rail` along the pit edges x8; `web_banner` x4 on the spires; silk strands on spires x8 | spires priority `lt(0x39d0c4,1.6,9)`; lower-city halos | resonance rings pulse from the sigil every 4 s (teal `arcane_burst`, harmless, drawn flat), swarm haze at the Eye | tremolo-string pulse (music), `ice_chime`, wind, the boss `boss` track |
| `tunel` (11 to 7 / 8) | `black_blood_pipe` x6 along both walls; `cargo_cart` x1; violet lamps x2; wet decals x3; ramp rails x2 | 2 violet lamps | violet drips | `world/chain`, `creatures/burble_01` through the pipes, low heartbeat bed starts |
| `kan_hatti` (7 / 16) | `black_blood_vat` x4; `cargo_cart` x4 on the lanes z 6.5 and 9.5; pipes crossing overhead x10 (y 11 catwalk gallery x4, decor); gong x1; `harvest_lift_frame` x1 far back wall; violet lamps x6; wet decals x6; hazard lamps (amber) x4 | vats `lt(0x8a3bb0,1.4,8,true)` x2 real, rest halos; gong priority | `ambient_shadow_wisps`, bubbles rising in the vats (`shadow_ground` small) | `creatures/burble_01..02` loop, `world/metal` thuds every 6-10 s, `heartbeat_loop` at 0.2, `gong` on use |
| `dron_kogusu` (7 / 12) | `cocoon_hanging` x18 in three rows (y 3.2, p26 members' cocoons are `wake` props); pale husks x8; web sheet decals x6; strand x10; rib wall segments x8 | green lights x3 | drone cocoons twitch (scale pulse) before p26 wakes; ceiling drop dust (`leap_land`) | `creatures/chatter_06` muffled from the cocoons, `creatures/bug_03` |
| `kikatal_deposu` (3 / 22) | central cauldron (pit ring) with a walkway; `black_blood_vat` x4 (NW at (48.8, 25.8)); `black_blood_pipe` x12 converging on the cauldron; lane decals x4; `harvest_lift_frame` x1 above the cauldron (backdrop, y 14); `nerub_stair_rail` x2 on H11; gallery x4 on the walls (y 12, vat catwalks, decor); `web_banner` x4; exit portal `mplus_portal` + `chest_epic` (hidden until the kill); wet decals x8 | violet lamps x8 halos, cauldron `lt(0x8a3bb0,2.0,12,true)` priority, boss crystals priority | rising violet vapour from the cauldron, `ambient_shadow_wisps`, drain-and-teal turn at the kill (section 5.3) | `heartbeat_loop` (tempo doubles in p2), `creatures/burble` boil, `world/chain` lift cables, boss `boss` track |

---

## 4. Trash

Multipliers are relative to the level-60 baseline of `GDD_CONTENT` 0.3 (`monsterHP(60) = 2246`, `monsterDmg(60) = 284`; "HP x" replaces the rank multiplier). Season 1 pool enemies are tuned about 25% above the leveling dungeons' equivalent archetypes (for example `void_demon` is 3.2 HP x / 1.7 DMG x, `yk_bloodguard` is 6.0 / 1.8 because it also has an aura and a nuke). Real HP in a run is `2246 x HPx x scale(L) x (1 + 0.7 (n-1)) x affix`, with `scale(L) = 1.08^(L-1)` up to +10 and x1.10 per level above (`CORE_MECHANICS` section 6, see the note in 6.2): for five players at Mitik 0 a 1.0 HP x trash enemy has 8,535 HP, at +10 with Tahkimli 20,473 HP per 1.0 HP x (the unit used in section 6).

**Elden Ring layer (`CORE_MECHANICS` section 16).** Every trash type has **2 to 4 telegraphed attacks**. The telegraph windup of every melee, line, ground, charge and projectile attack is `windup = clamp(0.45 + 0.25 x coef, 0.45, 1.2)` s (coef 1.0 gives 0.70 s, coef 1.6 gives 0.85 s, coef 2.4 gives 1.05 s); interruptible casts use their `castTime` (1.5 to 3.2 s) instead, and coef 0 utility moves use the 0.8 s listed. This also satisfies the minimums of `GDD_CONTENT` 0.6 (0.6 s for trash; elite and miniboss hits above coef 2 land at 0.95 s or more). The brutes use **2 to 3 hit strings** (`chain`, YSP-17) whose last hit is a **delayed swing** that holds 0.5 to 0.8 s longer than the first two and stops tracking when it starts; leaps and charges show a ground telegraph at the landing spot; elites and minibosses have a **posture bar** (`def.poise`; a poise break = `stun` 2.0 s, damage taken x1.25 and a gold "KRİTİK!" ring, and it cancels the current non-perilous cast, so it doubles as an interrupt on units that are not CC immune, `GDD_V2` 3.12); `perilous` hits cannot be parried or guarded, `parryable` hits can be parried for a riposte. Under 30% HP nothing enrages by default (the Öfkeli affix does it).

Flags: **I** interruptible, **D** dispellable effect, **F** frontal / line, **S** hard CC (stun, root, fear) or CC immune, **K** interrupt priority (`kick`: 2 HIGH, 1 MED), **P** posture bar, **H** healer (kill first). Casts keep the minimum windups of `GDD_CONTENT` 0.6 (trash 0.6 s, coef above 2 needs 0.8 s, big raid-wide 2.0 s).

### 4.1 Roster (13 trash types, 3 minibosses)

Roles in the pull mix: **kick-caster** (Çınlayan Görevli, Ağ Büyücüsü, Nöbetçi Boynuzkabuk, Kan Gözcüsü), **healer** (Kan Bakıcısı), **brute** (Kan İşçisi, Kana Bulanmış Yardımcı, Zırhlı Dron, İri Kan Muhafızı), **swarm** (Aç Sürünen, Sokucu Arı), **elite with posture bar** (Şişkin Sürünen, İri Kan Muhafızı, Kan Gözcüsü), plus the Kanatlı Taşıyıcı as the flying skirmisher.

| id | Ad (TR) | rank / role | model | HP x | DMG x | speed | aggro | forces | poise | flags |
|---|---|---|---|---|---|---|---|---|---|---|
| `yk_crawler` | Aç Sürünen | trash / swarm | `itch/spider` x0.42, `spider_pale` texture, tint `0xc8d4b0` | 0.55 | 0.8 | 6.8 | 9 | 1 | flinch | F (Pusu line) |
| `yk_wasp` | Sokucu Arı | trash / swarm, flying | `itch/wasp` x0.6, hover 1.3 | 0.45 | 0.7 | 6.2 | 10 | 1 | flinch | D (bleed stacks) |
| `yk_carrier` | Kanatlı Taşıyıcı | trash / melee skirmisher, flying | `itch/wasp` x0.85, tint `0x6a4a8a`, hover 1.4 | 1.3 | 1.1 | 5.8 | 10 | 3 | flinch | F (Atılış) |
| `yk_attendant` | Çınlayan Görevli | trash / kick-caster | `nerub_weaver` x1.0 (fb `Skeleton_Mage`) | 1.5 | 1.1 | 4.8 | 12 | 4 | flinch | I, K2 |
| `yk_worker` | Kan İşçisi | trash / melee brute | `nerub_worker` (fb `Skeleton_Minion`) | 1.2 | 1.0 | 6.0 | 9 | 3 | flinch | F (Hücum), 2-hit string |
| `yk_assistant` | Kana Bulanmış Yardımcı | trash / melee brute | `nerub_soldier` x0.9 (fb `Skeleton_Rogue`) | 1.5 | 1.1 | 5.6 | 9 | 4 | flinch | F, tank buster |
| `yk_webmage` | Ağ Büyücüsü | trash / kick-caster | `nerub_weaver` tint green `0x70a860` (fb `Skeleton_Mage`) | 1.4 | 1.1 | 4.8 | 12 | 4 | flinch | I, D, K2 |
| `yk_bloodtender` | Kan Bakıcısı | trash / **healer** | `nerub_weaver` x0.95 tint `0x7a3a9a` (fb `Skeleton_Mage`) | 1.4 | 0.9 | 4.8 | 12 | 4 | flinch | H, I, K1 |
| `yk_drone` | Zırhlı Dron | trash / melee brute | `nerub_soldier` x0.95 tint `0x4a3a6a` (fb `Skeleton_Warrior`) | 1.5 | 1.2 | 5.4 | 9 | 4 | flinch | D (kara_kan) |
| `yk_stagshell` | Nöbetçi Boynuzkabuk | trash / support kick-caster | `nerub_weaver` x1.15 (fb `Skeleton_Mage`), horned silhouette | 1.6 | 1.0 | 4.6 | 14 | 6 | flinch | I, K2, hard-CC able |
| `yk_engorged` | Şişkin Sürünen | elite / melee | `itch/spider` x0.8, tint `0x9ab060` | 4.0 | 1.4 | 5.4 | 11 | 9 | **140** | P, D, death blast |
| `yk_bloodguard` | İri Kan Muhafızı | elite / tank brute | `nerub_soldier` x1.4 (fb `Skeleton_Warrior` x1.45) | 6.0 | 1.8 | 4.8 | 10 | 11 | **260** | P, S (CC immune), F, 3-hit string, aura |
| `yk_overseer` | Kan Gözcüsü | elite / kick-caster | `nerub_weaver` x1.25 tint `0x5a3a7a` (fb `Skeleton_Mage` x1.25) | 4.0 | 1.5 | 4.6 | 13 | 8 | **180** | P, S (CC immune), I, D, K2 |
| `yk_ixin` | Çınlatıcı Iksin | miniboss / caster | `nerub_weaver` x1.5 (fb `Skeleton_Mage` x1.5) | 9.0 | 1.6 | 5.0 | 12 | 14 | **400** | P, S, I, K2, F |
| `yk_nakt` | Yuva Çağıran Nakat | miniboss / summoner | `nerub_weaver` x1.5 tint `0x6a8a60` | 9.0 | 1.6 | 5.0 | 12 | 14 | **400** | P, S, F |
| `yk_atik` | Zehir Dökücü Atik | miniboss / caster | `nerub_weaver` x1.5 tint `0x88b040` | 9.0 | 1.6 | 5.0 | 12 | 14 | **400** | P, S, I, D, K1 |

Resist profiles: crawlers and engorged use `R_SPIDER` (fire -25%, poison +50%); nerubians use a new `R_NERUB = { physical 0.05, fire -0.1, shadow 0.25, poison 0.5 }`; wasps `R_BEAST`. Posture: `poiseRegen` 0.10 and `poiseDelay` 3 s (defaults), `hyperArmor` 0.5 on the bloodguard, 0.8 on minibosses, the rest default.

### 4.2 Attacks (pseudo-source using the builders of `src/data/enemies.ts`)

Builders: `cone(id, name, range, arc, cd, coef, anim, impact, o)`, `proj(id, name, speed, range, cd, windup, coef, type, vfx, anim, impact, o)`, `aoe(id, name, kind, radius, range, cd, windup, coef, type, anim, impact, o)`, `line(...)`, `heal(id, name, castTime, cd, pct, anim, impact, o)`, `buff(id, name, castTime, cd, statuses, anim, impact, o)`, `charge(id, name, length, cd, windup, coef, anim, impact, o)`, `summonAb(...)`, `onDeath(...)`, `derive(id, name, base, { scale, hp, rank, xp, loot, abilities, ai?, basic?, resist?, ccImmune? })` (a copy of the base def with `forces` forced to 0, the way summoned variants are made), plus the NEW **YSP-17** builders `chain(id, name, range, arc, cd, hits, o)` (hits is `[coef, windup, anim, impact][]`: hit 1 telegraphs for its windup, each next hit follows its own windup after the previous impact, tracking freezes when the LAST hit starts, each hit is its own cone shape with `parryable`; the first hit uses `cd`) and `leap(id, name, radius, range, cd, windup, air, coef, type, anim, impact, o)` (a ground telegraph at a target's feet, the caster is airborne for `air` s and lands on it; `leap_land` dust; recovers 0.6 s). `params.target = 3` is the "random non-tank player" convention of `shade_nightmare` (verify in `EnemyAI` when transcribing); `params.persist` / `tick` / `persistCoef` make a ground or self AoE leave a lingering zone (`EnemyAI.persistShape`); `params.minRange` gates an ability by distance (`EnemyAI.usable`); **`params.ranged: 1`** (YSP-08) makes a `self_aoe` skip the melee-slot gate (see the note below). Itch creature clips: `Bite`, `Strike`, `WebSpit`, `Sting`, `Dive`; nerubian clips: `Attack`, `Attack2`, `Cast`. `NERUB(name)` is the model url helper for the new creatures, `A_NERUB = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death', spawn: 'Spawn' }`.

**Attack sheet** (windup = `clamp(0.45 + 0.25 x coef, 0.45, 1.2)`; "cast" = interruptible `castTime`; every move is telegraphed):

| Type | # | Attack (TR) | Kind and numbers | Windup / cast | Notes |
|---|---|---|---|---|---|
| Aç Sürünen | 2 | Isırık | cone 100 deg, r 1.8, coef 1.0, cd 1.4 | 0.70 | basic |
| | | Pusu | charge 12 m, coef 1.6, cd 11, minRange 8, random target | 0.85 | line telegraph, the 8 m "Ambush" |
| Sokucu Arı | 2 | Kanamalı Dürtme | cone r 2.0, coef 0.8, cd 1.5, bleed 1 stack | 0.65 | basic |
| | | Sokma Dalışı | charge 9 m, coef 1.0, cd 8, minRange 6 | 0.70 | flying dive, lands and flits back |
| Kanatlı Taşıyıcı | 3 | Dürtme | cone r 2.2, coef 1.0, cd 1.8 | 0.70 | basic |
| | | Kara Kan Damlası | ground puddle under a random player, once per fight | 0.80 | "first hit makes a puddle" |
| | | Atılış | charge 10 m, coef 1.5, cd 9, minRange 6 | 0.83 | Dashing Strike |
| Çınlayan Görevli | 3 | Ağ Oku | projectile, coef 1.0, cd 2.4, slow 0.4 for 3 s | 0.70 | basic |
| | | **Rezonans Yağmuru** | `self_aoe` r 24, coef 2.4, cd 16, `ranged: 1`, kick 2 | **cast 3.2** | must-kick |
| | | Çınlama Darbesi | `self_aoe` r 4.5, coef 1.2, cd 10, knockback 5 | 0.75 | anti-melee guard |
| Kan İşçisi | 3 | Pençe | cone r 2.0, coef 1.0, cd 1.6 | 0.70 | basic |
| | | Çifte Pençe | **2-hit string**, cone 100 deg, coef 0.8 + 0.8, cd 8 | 0.65, second hit 0.45 later | `parryable` |
| | | Hücum | charge 14 m, coef 1.5, cd 10, minRange 8 | 0.83 | |
| Kana Bulanmış Yardımcı | 3 | Mızrak | cone 90 deg, r 2.4, coef 1.0, cd 1.8 | 0.70 | basic |
| | | Mızrak Süpürmesi | `self_aoe` r 3.2 (360 deg), coef 1.3, cd 10 | 0.78 | punishes melee stacking |
| | | Özüt Darbesi | cone 70 deg, r 3.0, coef 2.4, cd 12, tank buster, leech 1.0 (cap 8% max HP) | 1.05 | the Extraction Strike |
| Ağ Büyücüsü | 3 | Ağ Oku | projectile, coef 0.9, cd 2.4 | 0.68 | basic |
| | | **Berbat Yaylım** | `self_aoe` r 22, coef 1.2, cd 14, `ranged: 1`, kick 2, poison 2 stacks | **cast 2.4** | must-kick |
| | | Yapışkan Ağ | `ground_aoe` r 2.2 under a random player, coef 0.6, cd 9, slow 0.5 for 4 s, persist 8 | 0.60 | |
| Kan Bakıcısı | 3 | Kan Oku | projectile, coef 0.8, cd 2.6 | 0.65 | basic |
| | | **Kara Kan Şifası** | `heal_ally` 20% max HP, range 14, cd 9 (first 3), kick 1 | **cast 2.0** | kill or kick first |
| | | Pıhtı Kalkanı | `buff_ally` `fortify` 0.2 for 6 s on the most hurt ally, cd 14 | cast 1.0 | |
| Zırhlı Dron | 3 | Kara Kanlı Pençe | cone r 2.2, coef 1.0, cd 1.8, `kara_kan` 1 stack | 0.70 | basic |
| | | Kalkan Çarpması | cone 90 deg, r 2.6, coef 1.4, cd 9, knockback 3 | 0.80 | |
| | | Kara Kan Damlası | ground puddle, once per fight | 0.80 | |
| Nöbetçi Boynuzkabuk | 3 | Boynuz Fırlat | projectile, coef 0.9, cd 2.4 | 0.68 | basic |
| | | Boynuz Darbesi | `self_aoe` r 4, coef 1.2, cd 10, knockback 5 | 0.75 | anti-melee guard |
| | | **Alarm Çığlığı** | `custom` `alarm`, range 30, `once: 1`, cd 99, kick 2 | **cast 2.6** | see 4.5 |
| Şişkin Sürünen (elite, P 140) | 4 | Isırık | cone r 2.6, 90 deg, coef 1.0, cd 2.0, poison | 0.70 | basic |
| | | Zehirli Tükürük | projectile, coef 0.6, cd 9, random target, poison | 0.60 | |
| | | Ezme Atlayışı | `leap` r 4, coef 2.0, cd 14, air 0.6, `parryable: false` | 0.95 | delayed landing, 0.6 s recovery |
| | | Toksik Patlama | death blast, `self_aoe` r 5, coef 1.8, below 15% HP, once, suicide | 0.90 | still counts forces |
| İri Kan Muhafızı (elite, P 260) | 4 | **Tokmak Zinciri** | **3-hit string**, cone r 3.4, 100 deg: coef 1.0 + 1.0 + **2.0** (last is `perilous`), cd 4 | 0.70, 0.45 later, then a **0.95 hold** | parry hits 1-2, dodge hit 3 |
| | | Mızrak Atışı | line 16 m, coef 2.4, cd 11, random target | 1.05 | |
| | | Zayıfın Siperi | `buff_ally` `fortify` 0.35 for 8 s in r 10, cd 18 | cast 0.5 | |
| | | Çekirge Fırtınası | `self_aoe` r 11 cloud, persist 4 s, 0.45 per tick, cd 28 | 1.5 | not interruptible, avoidable cloud |
| Kan Gözcüsü (elite, P 180) | 3 | Kan Oku | projectile, coef 1.1, cd 2.4, `kara_kan` | 0.73 | basic |
| | | **Zehir Yaylımı** | `self_aoe` r 24, coef 1.6, cd 15, `ranged: 1`, kick 2, poison 2 stacks | **cast 2.6** | CC immune: poise break only |
| | | Çıkıntılı Ağlar | `ground_aoe` r 2.6 under a random player, coef 1.2, cd 7 | 0.75 | |

```ts
const R_NERUB = { physical: 0.05, fire: -0.1, shadow: 0.25, poison: 0.5 };
const W = (coef: number) => Math.min(1.2, Math.max(0.45, 0.45 + 0.25 * coef));   // the telegraph rule of this section
const dropPuddle = (id: string, anim: string): EnemyAbility =>      // "its first hit creates a Black Blood puddle" (carrier, drone)
  aoe(id, 'Kara Kan Damlası', 'ground_aoe', 2.2, 8, 99, 0.8, 0, 'shadow', anim, 0.4,
      { initialCooldown: 0, vfx: 'shadow_ground', params: { target: 3, persist: 14, tick: 0.5, persistCoef: 0.35, impact: 0.4 } });

add({ id: 'yk_crawler', name: 'Aç Sürünen', model: ITCH('spider'), scale: 0.42, tint: 0xc8d4b0, role: 'swarm', rank: 'trash', hp: 0.55, dmg: 0.8, speed: 6.8, radius: 0.45, aggro: 9, forces: 1,
  anims: A_WOLF, resist: R_SPIDER, visual: { texture: '/assets/textures/itch/creatures/spider_pale.png', eyeEmissive: 0x86c93a },
  basic: cone('yk_crawler_bite', 'Isırık', 1.8, 100, 1.4, 1.0, 'Bite', 0.5, { windup: W(1.0) }),
  abilities: [charge('yk_crawler_ambush', 'Pusu', 12, 11, W(1.6), 1.6, 'Strike', 0.73, { initialCooldown: 5, params: { dash: 0.55, minRange: 8, target: 3, impact: 0.73 } })] });

add({ id: 'yk_wasp', name: 'Sokucu Arı', model: ITCH('wasp'), scale: 0.6, role: 'swarm', rank: 'trash', hp: 0.45, dmg: 0.7, speed: 6.2, radius: 0.4, aggro: 10, forces: 1, flying: true, hover: 1.3,
  anims: A_WASP, resist: R_BEAST,
  basic: cone('yk_wasp_jab', 'Kanamalı Dürtme', 2.0, 100, 1.5, 0.8, 'Sting', 0.6, { windup: W(0.8), statuses: [bleed(1, 0.2, 8)] }),
  abilities: [charge('yk_wasp_dive', 'Sokma Dalışı', 9, 8, W(1.0), 1.0, 'Dive', 0.7, { initialCooldown: 4, params: { dash: 0.5, minRange: 6, target: 3, impact: 0.7 } })] });

add({ id: 'yk_carrier', name: 'Kanatlı Taşıyıcı', model: ITCH('wasp'), scale: 0.85, tint: 0x6a4a8a, role: 'melee', rank: 'trash', hp: 1.3, dmg: 1.1, speed: 5.8, radius: 0.55, aggro: 10, forces: 3, flying: true, hover: 1.4,
  anims: A_WASP, resist: R_BEAST,
  basic: cone('yk_carrier_jab', 'Dürtme', 2.2, 100, 1.8, 1.0, 'Sting', 0.6, { windup: W(1.0) }),
  abilities: [dropPuddle('yk_carrier_drip', 'Sting'), charge('yk_carrier_dash', 'Atılış', 10, 9, W(1.5), 1.5, 'Dive', 0.9, { initialCooldown: 6, params: { dash: 0.5, minRange: 6, target: 3, impact: 0.9 } })] });

add({ id: 'yk_attendant', name: 'Çınlayan Görevli', model: NERUB('nerub_weaver'), scale: 1.0, role: 'caster', rank: 'trash', hp: 1.5, dmg: 1.1, speed: 4.8, radius: 0.55, aggro: 12, forces: 4,
  anims: A_NERUB, resist: R_NERUB, ai: { kite: [9, 15] },
  basic: proj('yk_attendant_bolt', 'Ağ Oku', 16, 16, 2.4, W(1.0), 1.0, 'poison', 'poison_projectile', 'Cast', 0.6, { statuses: [{ status: 'slow', duration: 3, magnitude: 0.4 }] }),
  abilities: [
    aoe('yk_attendant_barrage', 'Rezonans Yağmuru', 'self_aoe', 24, 24, 16, 3.2, 2.4, 'shadow', 'Cast', 1.0,
      { initialCooldown: 6, castTime: 3.2, interruptible: true, kick: 2, vfx: 'arcane_burst', params: { impact: 1.0, ranged: 1 } }),     // YSP-08 ranged: skip the melee-slot gate
    aoe('yk_attendant_chime', 'Çınlama Darbesi', 'self_aoe', 4.5, 4.5, 10, W(1.2), 1.2, 'shadow', 'Attack', 0.5, { initialCooldown: 3, knockback: 5, vfx: 'arcane_burst', params: { impact: 0.5 } }),
  ] });

add({ id: 'yk_worker', name: 'Kan İşçisi', model: NERUB('nerub_worker'), scale: 1.0, role: 'melee', rank: 'trash', hp: 1.2, dmg: 1.0, speed: 6.0, radius: 0.5, aggro: 9, forces: 3,
  anims: A_NERUB, resist: R_NERUB,
  basic: cone('yk_worker_claw', 'Pençe', 2.0, 100, 1.6, 1.0, 'Attack', 0.45, { windup: W(1.0) }),
  abilities: [
    chain('yk_worker_double', 'Çifte Pençe', 2.0, 100, 8, [[0.8, W(0.8), 'Attack', 0.45], [0.8, 0.45, 'Attack2', 0.5]], { initialCooldown: 3 }),   // YSP-17
    charge('yk_worker_rush', 'Hücum', 14, 10, W(1.5), 1.5, 'Attack2', 0.5, { initialCooldown: 4, params: { dash: 0.6, minRange: 8, target: 3, impact: 0.5 } }),
  ] });

add({ id: 'yk_assistant', name: 'Kana Bulanmış Yardımcı', model: NERUB('nerub_soldier'), scale: 0.9, role: 'melee', rank: 'trash', hp: 1.5, dmg: 1.1, speed: 5.6, radius: 0.55, aggro: 9, forces: 4,
  anims: A_NERUB, resist: R_NERUB,
  basic: cone('yk_assistant_spear', 'Mızrak', 2.4, 90, 1.8, 1.0, 'Attack', 0.45, { windup: W(1.0) }),
  abilities: [
    aoe('yk_assistant_sweep', 'Mızrak Süpürmesi', 'self_aoe', 3.2, 3.2, 10, W(1.3), 1.3, 'physical', 'Attack2', 0.5, { initialCooldown: 4, params: { impact: 0.5 } }),
    { ...cone('yk_assistant_extract', 'Özüt Darbesi', 3.0, 70, 12, 2.4, 'Attack2', 0.5, { windup: W(2.4), telegraph: true, initialCooldown: 5 }),
      tankBuster: true, params: { impact: 0.5, leech: 1.0, leechCapPct: 0.08 } },      // YSP-08: heals the assistant for the damage dealt, up to 8% max HP
  ] });

add({ id: 'yk_webmage', name: 'Ağ Büyücüsü', model: NERUB('nerub_weaver'), scale: 1.0, tint: 0x70a860, role: 'caster', rank: 'trash', hp: 1.4, dmg: 1.1, speed: 4.8, radius: 0.55, aggro: 12, forces: 4,
  anims: A_NERUB, resist: R_NERUB, ai: { kite: [10, 16] },
  basic: proj('yk_webmage_bolt', 'Ağ Oku', 16, 18, 2.4, W(0.9), 0.9, 'poison', 'poison_projectile', 'Cast', 0.6),
  abilities: [
    aoe('yk_webmage_volley', 'Berbat Yaylım', 'self_aoe', 22, 22, 14, 2.4, 1.2, 'poison', 'Cast', 1.0,
      { initialCooldown: 6, castTime: 2.4, interruptible: true, kick: 2, statuses: [poison(2, 0.3, 10)], vfx: 'poison_burst', params: { impact: 1.0, ranged: 1 } }),
    aoe('yk_webmage_net', 'Yapışkan Ağ', 'ground_aoe', 2.2, 16, 9, W(0.6), 0.6, 'poison', 'Cast', 0.6, { initialCooldown: 4, vfx: 'web_burst', statuses: [{ status: 'slow', duration: 4, magnitude: 0.5 }], params: { target: 3, persist: 8, tick: 1.0, persistCoef: 0.3, impact: 0.6 } }),
  ] });

add({ id: 'yk_bloodtender', name: 'Kan Bakıcısı', model: NERUB('nerub_weaver'), scale: 0.95, tint: 0x7a3a9a, role: 'caster', rank: 'trash', hp: 1.4, dmg: 0.9, speed: 4.8, radius: 0.55, aggro: 12, forces: 4,
  anims: A_NERUB, resist: R_NERUB, ai: { kite: [10, 16] },
  basic: proj('yk_bloodtender_bolt', 'Kan Oku', 16, 18, 2.6, W(0.8), 0.8, 'shadow', 'shadow_projectile', 'Cast', 0.6),
  abilities: [
    { ...heal('yk_bloodtender_mend', 'Kara Kan Şifası', 2.0, 9, 0.2, 'Cast', 1.0, { range: 14, initialCooldown: 3 }), kick: 1 },
    buff('yk_bloodtender_clot', 'Pıhtı Kalkanı', 1.0, 14, [{ status: 'fortify', duration: 6, magnitude: 0.2 }], 'Cast', 0.7, { params: { radius: 14, mostHurt: 1 } }),
  ] });

add({ id: 'yk_drone', name: 'Zırhlı Dron', model: NERUB('nerub_soldier'), scale: 0.95, tint: 0x4a3a6a, role: 'melee', rank: 'trash', hp: 1.5, dmg: 1.2, speed: 5.4, radius: 0.6, aggro: 9, forces: 4,
  anims: A_NERUB, resist: R_NERUB,
  basic: cone('yk_drone_claw', 'Kara Kanlı Pençe', 2.2, 100, 1.8, 1.0, 'Attack', 0.45, { windup: W(1.0), statuses: [{ status: 'kara_kan', duration: 8, stacks: 1 }] }),
  abilities: [dropPuddle('yk_drone_drip', 'Attack'), cone('yk_drone_bash', 'Kalkan Çarpması', 2.6, 90, 9, 1.4, 'Attack2', 0.5, { windup: W(1.4), knockback: 3, initialCooldown: 4 })] });

add({ id: 'yk_stagshell', name: 'Nöbetçi Boynuzkabuk', model: NERUB('nerub_weaver'), scale: 1.15, role: 'support', rank: 'trash', hp: 1.6, dmg: 1.0, speed: 4.6, radius: 0.6, aggro: 14, forces: 6,
  anims: A_NERUB, resist: R_NERUB, ai: { kite: [10, 16] },
  basic: proj('yk_stagshell_horn', 'Boynuz Fırlat', 15, 16, 2.4, W(0.9), 0.9, 'physical', 'bolt_projectile', 'Cast', 0.6),
  abilities: [
    aoe('yk_stagshell_pulse', 'Boynuz Darbesi', 'self_aoe', 4, 4, 10, W(1.2), 1.2, 'physical', 'Attack', 0.5, { initialCooldown: 3, knockback: 5, params: { impact: 0.5 } }),
    { id: 'yk_stagshell_alarm', name: 'Alarm Çığlığı', kind: 'custom', range: 30, cooldown: 99, initialCooldown: 3, windup: 2.6, castTime: 2.6, interruptible: true, kick: 2, anim: 'Cast', vfx: 'arcane_burst',
      params: { impact: 1.0, aggroRadius: 25, sameRoom: 1, summon: 1, once: 1 } },        // YSP-07: callForHelp(25, sameRoom) + one yk_bloodguard_alarm, once per Stagshell (EnemyAI.ts:874 `once`)
  ] });

add({ id: 'yk_engorged', name: 'Şişkin Sürünen', model: ITCH('spider'), scale: 0.8, tint: 0x9ab060, role: 'melee', rank: 'elite', hp: 4.0, dmg: 1.4, speed: 5.4, radius: 0.9, aggro: 11, forces: 9, poise: 140,
  anims: A_WOLF, resist: R_SPIDER, visual: { texture: '/assets/textures/itch/creatures/spider_pale.png', eyeEmissive: 0x86c93a },
  basic: cone('yk_engorged_bite', 'Isırık', 2.6, 90, 2.0, 1.0, 'Bite', 0.5, { windup: W(1.0), statuses: [poison(1)] }),
  abilities: [
    proj('yk_engorged_spit', 'Zehirli Tükürük', 14, 16, 9, W(0.6), 0.6, 'poison', 'poison_projectile', 'WebSpit', 0.67, { initialCooldown: 4, statuses: [poison(1, 0.3, 8)], params: { target: 3, impact: 0.67 } }),
    leap('yk_engorged_slam', 'Ezme Atlayışı', 4, 12, 14, W(2.0), 0.6, 2.0, 'physical', 'Strike', 0.9, { initialCooldown: 6, parryable: false }),     // YSP-17
    aoe('yk_engorged_rupture', 'Toksik Patlama', 'self_aoe', 5, 5, 99, W(1.8), 1.8, 'poison', 'Threat', 1.0, { knockback: 7, vfx: 'poison_burst', params: { hpBelow: 0.15, once: 1, suicide: 1, impact: 1.0 } }),
  ] });

add({ id: 'yk_bloodguard', name: 'İri Kan Muhafızı', model: NERUB('nerub_soldier'), scale: 1.4, role: 'tank', rank: 'elite', hp: 6.0, dmg: 1.8, speed: 4.8, radius: 1.0, aggro: 10, forces: 11, ccImmune: true, poise: 260, hyperArmor: 0.5,
  anims: A_NERUB, resist: R_NERUB,
  basic: chain('yk_bloodguard_maul', 'Tokmak Zinciri', 3.4, 100, 4, [[1.0, W(1.0), 'Attack', 0.45], [1.0, 0.45, 'Attack', 0.45], [2.0, W(2.0), 'Attack2', 0.5, { perilous: true }]]),   // YSP-17: 3-hit string, delayed perilous finisher
  abilities: [
    line('yk_bloodguard_impale', 'Mızrak Atışı', 16, 2.4, 11, W(2.4), 2.4, 'physical', 'Attack2', 0.5, { initialCooldown: 5, params: { target: 3, impact: 0.5 } }),
    buff('yk_bloodguard_bulwark', 'Zayıfın Siperi', 0.5, 18, [{ status: 'fortify', duration: 8, magnitude: 0.35 }], 'Attack', 0, { params: { radius: 10 } }),
    aoe('yk_bloodguard_locust', 'Çekirge Fırtınası', 'self_aoe', 11, 11, 28, 1.5, 0, 'poison', 'Cast', 1.0, { initialCooldown: 20, vfx: 'poison_cloud', params: { persist: 4, tick: 0.5, persistCoef: 0.45, impact: 1.0 } }),
  ] });
derive('yk_bloodguard_alarm', 'İri Kan Muhafızı', 'yk_bloodguard',      // Alarm Çığlığı reinforcement (derive() always sets forces 0)
  { scale: 1, hp: 6.0, rank: 'elite', xp: 0, loot: '', abilities: ENEMIES.yk_bloodguard.abilities, ai: { summoned: true } });

add({ id: 'yk_overseer', name: 'Kan Gözcüsü', model: NERUB('nerub_weaver'), scale: 1.25, tint: 0x5a3a7a, role: 'caster', rank: 'elite', hp: 4.0, dmg: 1.5, speed: 4.6, radius: 0.7, aggro: 13, forces: 8, ccImmune: true, poise: 180,
  anims: A_NERUB, resist: R_NERUB, ai: { kite: [10, 16] },
  basic: proj('yk_overseer_bolt', 'Kan Oku', 16, 18, 2.4, W(1.1), 1.1, 'shadow', 'shadow_projectile', 'Cast', 0.6, { statuses: [{ status: 'kara_kan', duration: 8, stacks: 1 }] }),
  abilities: [
    aoe('yk_overseer_volley', 'Zehir Yaylımı', 'self_aoe', 24, 24, 15, 2.6, 1.6, 'poison', 'Cast', 1.0, { initialCooldown: 7, castTime: 2.6, interruptible: true, kick: 2, statuses: [poison(2, 0.3, 10)], vfx: 'poison_burst', params: { impact: 1.0, ranged: 1 } }),
    aoe('yk_overseer_webs', 'Çıkıntılı Ağlar', 'ground_aoe', 2.6, 16, 7, W(1.2), 1.2, 'poison', 'Cast', 0.8, { initialCooldown: 3, vfx: 'web_burst', params: { target: 3, impact: 0.8 } }),
  ] });
```

**Why `ranged: 1` is mandatory.** `EnemyAI.usable` (about line 899) gates every `self_aoe` with `range > 0` on `canAttackMelee()`, i.e. `slotRank < MAX_MELEE_SLOTS (6)`. Casters kite at 9-16 m, so in any pack of 7 or more (p02, p05, p29, and p06 and p26 if casters join) the caster sorts last by distance and would never cast its barrage; the kick check would silently vanish in exactly the big pulls. YSP-08 therefore adds `params.ranged: 1`: `case 'self_aoe': return edge <= Math.max(ab.range, 1.5) && (ab.range > 0 && !p.ranged ? this.canAttackMelee() : true)`. It is set on **every caster volley** (Rezonans Yağmuru, Berbat Yaylım, Zehir Yaylımı and Iksin's Dehşet Çığlığı); the short-range guard pulses (Çınlama, Boynuz Darbesi, Mızrak Süpürmesi) keep the slot gate on purpose, because they are melee behaviour. Notes on the pipeline: "Çekirge Fırtınası" (Locust Swarm) is **not interruptible** (as in WoW); the zone is a persistent r 11 m cloud around the guard so players can leave it (ARPG-style) instead of being un-dodgeable, at the cost of melee uptime. "Rezonans Yağmuru", "Berbat Yaylım" and "Zehir Yaylımı" are the must-kick casts: an interrupt is a poise break or any hard CC on the caster (`GDD_CONTENT` 0.6); the overseers are CC immune, so only a poise break stops them. "Kara Kan Damlası" fires once per fight at pull start under the target (initial cooldown 0, cooldown 99).

**Minibosses** (rank `miniboss`, `ccImmune: true`, HP x 9.0, DMG x 1.6, speed 5.0, aggro 12, forces 14, XP 25, `poise 400`, `hyperArmor 0.8`; same builders; their big moves keep the boss minimum of 1.0 s):

* **Çınlatıcı Iksin** (`yk_ixin`): basic `Ağ Oku` (projectile coef 1.2, cd 2.4, windup 0.75). **Dehşet Çığlığı**: `self_aoe` r 20, `castTime 2.2`, interruptible, `kick 2`, `ranged: 1`, cd 12 (first 4), coef 2.2 shadow plus `slow` 0.3 for 4 s: kick every one. **Ağ Püskürtmesi**: cone 60 degrees, r 14, on a random player (`params.target 3`), windup 1.2, cd 10 (first 6), coef 1.8, leaves a web puddle r 2 for 12 s (`persist 12`, `persistCoef 0.3`, slow) (F). A poise break (400) during Dehşet Çığlığı cancels it. Escort: 2 `yk_attendant`.
* **Yuva Çağıran Nakat** (`yk_nakt`): basic `Ağ Oku`. **Sürü Çağrısı**: summons 3 `yk_crawler_summoned` (0 forces) next to random players, not interruptible (`perilous`), cd 18 (first 5), windup 1.2: stack up so the tank can grab them. **Ağ Püskürtmesi** as Iksin. Escort: 4 `yk_crawler`.
* **Zehir Dökücü Atik** (`yk_atik`): basic `Ağ Oku`. **Zehir Bulutu**: `ground_aoe` r 3.2 under a random player, windup 1.5, cd 10 (first 4), `persist 12`, `persistCoef 0.4`, poison. **Zehir Oku**: projectile at the tank, `castTime 1.5`, interruptible, `kick 1`, cd 6, coef 1.6 plus poison DoT 8 s magnitude 0.4 (D). Escort: 2 `yk_carrier`.
* `derive('yk_crawler_summoned', 'Aç Sürünen', 'yk_crawler', { scale: 1, hp: 0.55, rank: 'trash', xp: 0, loot: '', abilities: ENEMIES.yk_crawler.abilities, ai: { summoned: true } })` (0 forces).

### 4.3 Mechanic and boss-adjacent units (0 forces, summoned)

Units with a `PROC:` body (`yk_ceaseless_swarm`, `yk_blood_pool`) are declared with the `MECH(id, name, proc, hpMult, extra)` helper of `enemies.ts` (invulnerable ones add `makeInvulnerable` in the script); the others are normal `add()` defs with `ai: { summoned: true }`.

| id | Ad (TR) | model | numbers | used by |
|---|---|---|---|---|
| `yk_starved_crawler` | Açlıktan Çılgın Sürünen | `itch/spider` x0.34, tint `0xd6dfae` | HP x 0.6 x partyHp, speed 5.8, `ai.fixate` (YSP-04), bite coef 0.6 (windup 0.60) | Avanoksa |
| `yk_ceaseless_swarm` | Aralıksız Sürü | `PROC:swarm_cloud` (amber translucent cloud, 12 orbiting black specks), invulnerable mech | no HP | Avanoksa, Anubzek (host moves it, `roamZone`) |
| `yk_webmage_add` | Ağ Bağlayıcı | `nerub_weaver`, tint silver | HP x 1.2 x partyHp; `Ağ Bağlama` 1.8 s cast, interruptible, roots a random non-tank 4 s (`root`, D), cd 8; basic `Ağ Oku` | Anubzek |
| `yk_web_spinner` | Ağ Örücü | `nerub_weaver` x0.8, tint silver | HP x 0.9 x partyHp; `Ağ Fırlat` 1.2 s cast, interruptible: root 3 s plus `exposed` 0.15 for 15 s | Kikatal |
| `yk_bloodworker_run` | Kaçak İşçi | `nerub_worker` x0.9 | HP x 0.5 x partyHp, speed 9, never aggro | Kikatal |
| `yk_blood_pool` | Kara Kan Havuzu | `PROC:blood_pool` (flat violet disc with bubbles), breakable | HP x 0.5 x partyHp, no AI | Kikatal via `trapPlayer` |
| `yk_bloodguard_alarm` | İri Kan Muhafızı (takviye) | as `yk_bloodguard` | forces 0 | Alarm Çığlığı |
| `yk_crawler_summoned` | Aç Sürünen | as `yk_crawler` | forces 0 | Nakat |

### 4.4 Pack list (29 packs)

Forces are summed from the roster (`yk_crawler` 1, `yk_wasp` 1, `yk_carrier` 3, `yk_attendant` 4, `yk_worker` 3, `yk_assistant` 4, `yk_webmage` 4, `yk_bloodtender` 4, `yk_drone` 4, `yk_stagshell` 6, `yk_engorged` 9, `yk_bloodguard` 11, `yk_overseer` 8, miniboss 14). Centres are continuous tile coordinates inside the room (margin at least 0.9 tile, checked by script). Members are listed inner to outer (melee and elites first, casters last); the formation is the shared sunflower table (see `packN`, YSP-02).

| pack | room | centre | composition | mobs | forces | flags |
|---|---|---|---|---|---|---|
| yk_p01 | kopru | 13, 48.5 | Sokucu Arı x4, Kanatlı Taşıyıcı x1 | 5 | **7** | patrol (11.5,48.5)-(14.5,48.5) |
| yk_p02 | teller | 21.5, 47 | Aç Sürünen x6, Çınlayan Görevli x1 | 7 | **10** | |
| yk_p03 | teller | 22, 51 | Şişkin Sürünen x1, Kanatlı Taşıyıcı x2 | 3 | **15** | |
| yk_p04 | teller | 23.5, 45 | Sokucu Arı x5, Çınlayan Görevli x1 | 6 | **9** | patrol (21,45)-(26,45) |
| yk_p05 | teller | 27, 49 | Aç Sürünen x4, Kanatlı Taşıyıcı x2, Çınlayan Görevli x1 | 7 | **14** | |
| yk_p06 | teller | 22.5, 41.8 | Aç Sürünen x8 | 8 | **8** | dormant egg (wake 6), big |
| yk_p07 | ixin_oyugu | 18.5, 36.5 | Çınlatıcı Iksin, Çınlayan Görevli x2 | 3 | **22** | gate pack |
| yk_p08 | nakt_oyugu | 26.5, 36.5 | Yuva Çağıran Nakat, Aç Sürünen x4 | 5 | **18** | gate pack |
| yk_p09 | atik_oyugu | 33, 47.5 | Zehir Dökücü Atik, Kanatlı Taşıyıcı x2 | 3 | **20** | gate pack |
| yk_p10 | rampa_bir | 31.5, 41 | Şişkin Sürünen x1, Aç Sürünen x3 | 4 | **12** | |
| yk_p11 | rampa_iki | 41, 30 | Kan İşçisi x2, Sokucu Arı x3 | 5 | **9** | |
| yk_p12 | nobet_holu | 38, 24 | Nöbetçi Boynuzkabuk, İri Kan Muhafızı, Kana Bulanmış Yardımcı x1, Kan Bakıcısı x1 | 4 | **25** | healer |
| yk_p13 | nobet_holu | 44, 22 | Nöbetçi Boynuzkabuk, Kan İşçisi x2, Ağ Büyücüsü x2 | 5 | **20** | |
| yk_p14 | nobet_holu | 41, 19.5 | İri Kan Muhafızı x2, Ağ Büyücüsü x1 | 3 | **26** | dangerous |
| yk_p15 | nobet_holu | 40.5, 25.5 | Kan İşçisi x3, Kana Bulanmış Yardımcı x1 | 4 | **13** | patrol (36,25.5)-(45,25.5) passes 1.5 and 3 tiles from p12 and p13: `linkedTo` p12, cannot be skipped (counted in pull 7) |
| yk_p16 | ag_gecidi | 35.5, 29 | Şişkin Sürünen x1, Sokucu Arı x3 | 4 | **12** | skip route guard |
| yk_p17 | laboratuvar | 25, 24 | Ağ Büyücüsü x2, Kana Bulanmış Yardımcı x1, Kan Bakıcısı x1, Çınlayan Görevli x1 | 5 | **20** | healer |
| yk_p18 | laboratuvar | 28, 22.5 | Kan İşçisi x3, Kana Bulanmış Yardımcı x1, Kan Bakıcısı x1 | 5 | **17** | healer |
| yk_p19 | laboratuvar | 22, 22 | İri Kan Muhafızı, Ağ Büyücüsü x2, Nöbetçi Boynuzkabuk | 4 | **25** | dangerous |
| yk_p20 | laboratuvar | 29, 25.5 | Şişkin Sürünen x1, Aç Sürünen x5 | 6 | **14** | |
| yk_p21 | tunel | 36.5, 9 | Kanatlı Taşıyıcı x2, Sokucu Arı x4 | 6 | **10** | patrol (35,9)-(38,9) |
| yk_p22 | kan_hatti | 43, 10.5 | Kan Gözcüsü, Zırhlı Dron x1, Kan Bakıcısı x1, Kanatlı Taşıyıcı x2 | 5 | **22** | healer |
| yk_p23 | kan_hatti | 49, 8 | Kan Gözcüsü x2, Zırhlı Dron x2, Kan Bakıcısı x1 | 5 | **28** | dangerous (double Volley), healer |
| yk_p24 | kan_hatti | 45.5, 5.5 | Kan İşçisi x3, Zırhlı Dron x2, Kan Bakıcısı x1 | 6 | **21** | patrol (42.5,5.5)-(49,5.5), healer |
| yk_p25 | kan_hatti | 46, 11.5 | Şişkin Sürünen x2, Kanatlı Taşıyıcı x2 | 4 | **24** | patrol (42.5,11.5)-(50,11.5) |
| yk_p26 | dron_kogusu | 51, 16.5 | Zırhlı Dron x5 | 5 | **20** | dormant ceiling (wake 7), big |
| yk_p27 | dron_kogusu | 52, 19.5 | Kan Gözcüsü, İri Kan Muhafızı, Kana Bulanmış Yardımcı x1, Kan Bakıcısı x1 | 4 | **27** | dangerous, links p26, healer |
| yk_p28 | dron_kogusu | 53, 15 | Aç Sürünen x4, Sokucu Arı x2 | 6 | **6** | |
| yk_p29 | yumurta_odasi | 40.5, 48 | Aç Sürünen x10, Şişkin Sürünen x2 | 12 | **28** | optional, dormant egg (wake 6), big |

The seven swaps of one 4-force member for a Kan Bakıcısı (p12, p17, p18, p22, p23, p24, p27) keep every pack's forces and mob count unchanged. Totals: **149 enemies, 502 forces** (section 1 area 163 incl. the 28 optional, section 2 area 181 incl. the 12 skip-corridor, section 3 area 158). Hot spots for the Katliam (x50) bonus: p02 + p05 + p06 (about 22 crawlers), p26 + p27 + p28, p29.

`packN` call form (YSP-02) and the flags in `PACK_EXTRA`:

```ts
const PACKS: PackDef[] = [
  packN('yk_p01', 'kopru', 13, 48.5, [['yk_wasp', 4], ['yk_carrier', 1]], { patrol: [[11.5, 48.5], [14.5, 48.5]] }),
  packN('yk_p02', 'teller', 19, 47, [['yk_crawler', 6], ['yk_attendant', 1]]),
  // ... one line per row of the table above, same order ...
  packN('yk_p29', 'yumurta_odasi', 40.5, 48, [['yk_crawler', 10], ['yk_engorged', 2]], { optional: true }),
];
const PACK_EXTRA: Record<string, Partial<PackDef>> = {
  yk_p06: { dormant: { kind: 'egg', wakeRadius: 6 }, big: true, note: 'Eggs under the north wall burst when a player is within 6 m; pulls with p02/p05.' },
  yk_p07: { note: 'Gate pack 1/3 (Iksin). Kick every Dehşet Çığlığı.' },
  yk_p08: { note: 'Gate pack 2/3 (Nakat). Group up for the Sürü Çağrısı crawlers.' },
  yk_p09: { note: 'Gate pack 3/3 (Atik). Dispel Zehir Oku, step out of Zehir Bulutu.' },
  yk_p14: { note: 'Two bloodguards: Çekirge Fırtınası overlap. Stagger them apart, never with p12/p13.' },
  yk_p15: { linkedTo: ['yk_p12'], note: 'Patrol walks through p12 and p13: it body-pulls p12 and cannot be skipped (pull 7).' },
  yk_p19: { note: 'Bloodguard + Boynuzkabuk: kick Alarm Çığlığı first (it pulls p17 and p18, same room within 25 m).' },
  yk_p23: { note: 'Two overseers: stagger the Zehir Yaylımı kicks.' },
  yk_p26: { dormant: { kind: 'ceiling', wakeRadius: 7 }, big: true, note: 'Drones drop from the ceiling; links p27.' },
  yk_p27: { linkedTo: ['yk_p26'], big: true },
  yk_p29: { dormant: { kind: 'egg', wakeRadius: 6 }, optional: true, big: true, note: 'Nursery: 12 enemies burst at once.' },
};
```

Formation used by `packN` (members ordered inner to outer, the i-th member takes the i-th offset): the sunflower table that every generated pack already uses (`golge_tapinagi.ts`, `kemik_mahzeni.ts`): `SPIRAL = [[0.3,0],[-0.38,0.35],[0.06,-0.66],[0.48,0.62],[-0.88,-0.16],[0.83,-0.53],[-0.28,1.03],[-0.53,-1.02],[1.15,0.42],[-1.2,0.49],[0.58,-1.23],[0.43,1.36]]` (12 entries, enough for the biggest pack here, p29). Flying members (`yk_wasp`, `yk_carrier`) get +0.2 tile radius so they do not stack over melee. The sibling Season 1 docs specify the same table under other names (`pk`, `spiralPack`): build ONE helper and alias the names.

### 4.5 Dungeon-specific trash mechanics (the two set pieces)

1. **Alarm Zinciri (Sentry Stagshell).** `yk_stagshell_alarm` is an interruptible 2.6 s cast, `once: 1` and cooldown 99 (WoW: once per Stagshell), so it cannot snowball every 18 s. On completion `callForHelp` pulls every idle pack **in the same room (`roomId`) within 25 m** onto the target (walls inside a room are ignored, other rooms are never pulled, so the 50 m `aggroRadius` that reached through walls is gone) and one `yk_bloodguard_alarm` (forces 0, 6.0 HP x) spawns beside the caster. Consequences by pull: p12 + p13 + p15 hold **two** Stagshells (at most two reinforcements if both are missed); an unkicked Alarm in the hall also pulls p14 (21 m away); in the lab p19's Alarm pulls p17 and p18 (14 and 24 m) but not p20 (31 m); p16, p11 and every pack in a neighbouring room stay asleep. **Kick it first** (K2): the Stagshell is not CC immune, so a stun, a root or a poise break works, and the gong of the hall (37.5, 21.5) interrupts both at once.
2. **Yankı Çanı (echo gongs).** The three one-use gongs of 3.5 item 6 turn the kick check into a team decision: one pull per gong is allowed to be "free" (every cast in r 14 m interrupted, non-elite enemies stunned 2 s), so the party decides whether to spend it on the big hall pull (p12 + p13 + p15), the p23 double Volley or the 47-force Dron Koğuşu pull. The gong is also a lure: its toll pings (`gong` SFX) are heard in the whole room, which wakes nothing (no mechanic), but the echo reverb tells the group that casts were cancelled.

Other readable trash behaviour that is already in the table above and needs no extra system: the **Black Blood puddle** first-hit rule of the carrier and the drone (drag them out of the lane), the **healer rule** (Kan Bakıcısı dies or is kicked first, 7 packs), the **delayed finisher** of the bloodguard string (dodge, never parry), the **posture break window** on every elite (a poise break is a free interrupt and a x1.25 burst), and the swarm horde rule of the affixes.

**Pack role check (script, YK-QA).** Every pack with 4 or more mobs must contain at least two of the roles {swarm, brute, kick-caster, healer, elite}; the three exceptions are on purpose: p06 (eight dormant crawlers), p26 (five ceiling drones) and p28 (crawlers + wasps, optional).

---

## 5. Bosses

Three bosses (the WoW original has three), the last one a showpiece. All three are `boss()` entries in the enemy data (phases are HP thresholds, `bp()`), with a `BossScript` per boss in `src/ai/bosses/yanki.ts`. Kit names refer to `src/ai/bosses/kit.ts` (`circle`, `ring`, `beam`, `band`, `wedge`, `zone`, `dashLine`, `ringPoints`, `statusPlayer`, `pickPlayers`, `farthestPlayer`, `playersIn`, `every`, `spawnMech`, `makeInvulnerable`, `trapPlayer` / `updatePrisons` / `clearPrisons`, `floatOver`, `bossFx`, `bossMsg`, `bossMsgTo`) and `BossController` (`shape`, `track`, `schedule`, `cancelTimers`, `spawnAdds`, `adds`, `teleport`, `dash`, `freeze`, `stagger`, `vulnerable`, `setImmune`, `forceAbility`, `castNow`, `cdOverride`, `dmgMul`, `atkMul`, `gdd`, `at`, `randomPoint`, `playersInArena`, `moveOverride`). Anything not in those two lists is marked **NEW** with its `YSP-xx` id (section 8.1). Timings are "first at / cooldown" in seconds, damage is `coef x boss base damage`. The minimum windups of `GDD_CONTENT` 0.6 apply (boss ability 1.0 s, tank busters and soaks 1.2 s, raid-wide 2.0 s).

Arena anchors are GDD tile coordinates; world metres are `(c + 0.5) * 4`. Boss HP follows the rule of thumb "hpMult is about the solo time-to-kill in seconds at par" (`GDD_CONTENT` 0.3): 85 / 95 / 120 against 60 / 75 / 110-120 of the leveling dungeons, because a Season 1 party is geared (see 6.2 for the resulting fight lengths).

**Elden Ring layer on top of the WoW kits** (user requirement, `CORE_MECHANICS` section 16). The WoW abilities below are unchanged except for the departures of the section 1 table. On top of them every boss gets: (a) a **3-hit basic string** that replaces its plain cleave: hits 1 and 2 are ordinary telegraphs (`parryable`), the last hit is a **delayed swing** that holds 0.5 to 0.8 s longer than a normal windup and stops tracking when it starts (`perilous`: dodge only, red glyph); (b) **one gap-closer or ground slam** with a readable ground telegraph and a recovery window after it lands; (c) a **posture bar** (`GDD_V2` 3.12: raid poise 900, a break = `stun` 2.0 s, damage taken x1.25 and the gold "KRİTİK!" ring; a break cancels the current non-`perilous` cast, which is the interrupt for Kozmik Teklik and the pull of the Eye); (d) a short list of `perilous` moves, everything else `parryable`. **Phase 2 of every boss is cooldown tweaks only** (no gear change, no new damage multiplier), because in WoW none of the three has a phase; every Elden Ring move is already in the phase 1 kit. String hits count as basic attacks (hit 1 uses `clamp(0.45 + 0.25 x coef, 0.45, 1.2)`), everything else keeps the boss minimum windups. Boss poise numbers are the raid values of `GDD_V2` 3.12 and are tuned in SimBench.


### 5.1 Boss 1: Doyumsuz Avanoksa, "Parçalanmış Tellerin Anası" (`boss_avanoksa`)

Model: `itch/creatures/spider.glb` x2.6 (about 3.2 m tall, 7.8 m leg span), `spider_pale` texture, `visual.glow 0x70e0c8`. Summoned when the three Görevli packs die (door `requires`, YSP-03). Clips used: `Idle`, `Walk`, `Run`, `Hit`, `Death`, `Bite` (hit 0.5), `Strike` (0.73), `WebSpit` (0.67), `Threat` (roar, 2.4 s), `GetUp`.

| hpMult | dmgMult | speed | radius | enrage | arena | home |
|---|---|---|---|---|---|---|
| 85 | 2.4 | 5.6 | 2.1 | 270 s | room `avanoksa_yuvasi` 52 x 44 m, centre tile (40, 38) = world (162, 154) | boss spawn (40.5, 37) = world (164, 150), facing -90 |

Anchors: `EGGS` (props `egg_1..6`, tag `egg`): `[[35.5, 35], [35.8, 40], [45.5, 35], [45.5, 40.5], [37.5, 34], [43.5, 42.4]]` (all at least 1.5 tiles from both doors). Round web dais `circleZone('dais', 40, 38, 5.2)`.

Phases: `bp('p1', 1.01, [string, bite, leap, shrill, onslaught, infest])`, `bp('p2', 0.4, [same], { yell: 'AÇIM! AÇIM!' })` (the real dungeon has no phases; the 40% step is **cooldown tweaks only**, see the last row: no damage buff, no extra crawlers).

| Ability (id) | TR name | first / cd | cast / windup | Effect and numbers | How to build | NEW |
|---|---|---|---|---|---|---|
| `avanoksa_string` (basic) | Üçlü Pençe Zinciri | n/a / 3.2 | 0.7 / 0.45 / 1.3 hold | **3-hit string** on the tank (she tracks the tank until the last hit starts): claw 1 (cone 120 deg, r 5, coef 1.0, windup 0.7), claw 2 (same cone, coef 1.0, 0.45 s after hit 1), both `parryable`; then she rears and **holds 1.3 s** before a lunge-bite (line 7 x 3 m, coef 2.0, `perilous`, locked on where the tank stood). Never within 2 s of Oburca Isırık | three `wedge()` / `line()` calls at `b.delay`, `+0.45`, `+1.3`; `string()` helper freezes the aim before the last one | string helper (YSP-17) |
| `avanoksa_bite` | Oburca Isırık | 5 / 16 | windup 1.0 | **tank buster combo**: 3 cones (100 deg, r 5.5) on the tank 0.9 s apart, coef 1.6 each (physical, the last one `perilous`), then the tank gets `exposed` magnitude 0.5 for 10 s (+50% damage taken). Never within 4 s of Uyarı Çığlığı | `wedge()` x3 at `b.delay`, +0.9, +1.8 aimed at `busyTarget`; `statusPlayer(tank, 'exposed', 10, { magnitude: 0.5 })` | status `exposed` (YSP-06) |
| `avanoksa_leap` | Sıçrayan Ezme | 10 / 24 | 1.4 telegraph | she springs into the canopy (0.6 s hang, `Strike` pose) and crashes down on a random non-tank player's position 1.4 s after the ring appears: circle r 6.0, coef 2.6, knockback 6, leaves a web puddle r 3 (12 s, slow 0.4). Afterwards she is **winded for 1.5 s**: no attacks and +15% damage taken, the free riposte window | `setAlphaAll(e.id, 0)`, `circle(c, t.x, t.z, 6.0, 1.4, 2.6, { knockback: 6 })`, then `c.teleport()`, `c.freeze(1.5)`, `c.vulnerable(1.15, 1.5)` | none |
| `avanoksa_shrill` | Uyarı Çığlığı | 12 / 42 | cast 3.0, not interruptible, `perilous` (a poise break does not cancel it) | group channel: persistent circle r `arena.r + 8` at the arena centre, coef 0.45 per 0.5 s for 3 s. When the cast ends: `max(3, partySize + 1)` `yk_starved_crawler` spawn at random free `EGGS` anchors (eggs swap to broken shells, `egg_burst`), each **fixating a random player** | `c.shape({ shape: circle, persist: { duration: 3, tick: 0.5 }, telegraph: false })`, `c.spawnAdds('yk_starved_crawler', n, { positions, tag: 'crawler', hpMult: 0.6 * partyHp(c) })` | fixate (YSP-04) |
| `avanoksa_onslaught` | Ağ Yağmuru | 24 / 45 | windup 1.0 + 5 s channel | every 1.0 s for 5 s a web puddle (r 2.4, lasts 25 s, tick 1.0, coef 0.55 poison, `slow` 0.4) appears **under each player**. A new puddle is skipped when an older one lies within 1.4 m of the player, so a stacked group makes few puddles (WoW: overlapping puddles do not hurt) | `c.schedule(i, ...)` for i = 0..4; `zone(c, x, z, 2.4, 25, 1.0, 0.55, 0.8, { type: 'poison', name: 'Ağ Birikintisi' })`; keep `state.puddles` for the dedupe | none |
| `avanoksa_infest` | Sürü Hastalığı | 18 / 38 | instant | 2 random non-tank players get `poison` 8 s (magnitude 0.35, dispellable) and floating text "HASTALIK". If it is still on them at 8 s an **Aralıksız Sürü** spawns at their feet and roams 45 s; a dispel prevents the swarm | `pickPlayers(c, 2, true)`, `statusPlayer`, `floatOver`, then `roamZone` at expiry | roamZone (YSP-05) |
| passive Doyumsuz | Doyumsuz | n/a | n/a | any `yk_starved_crawler` within 2.5 m of her is eaten: `c.dmgMul *= 1.3`, undone after 12 s, stacks. Starved crawlers are boss adds, so no death-affix triggers | `script.update()`: loop `c.adds('crawler')`, `ent.escape()`, `c.schedule(12, () => c.dmgMul /= 1.3, 'ins')` | none |
| `avanoksa_frenzy` (phase 2) | Aç Çılgınlığı | 40% | 1.0 | `cdOverride` only: shrill 30 s (from 42), onslaught 38 s (45), leap 18 s (24), string 2.6 s (3.2); `Threat` roar, `boss_shake`. No damage multiplier and no extra crawlers | `onPhase` | none |

Duties. **Tank**: pop a defensive for each Oburca Isırık combo, never tank into puddles, keep Avanoksa still at the dais edge so the group can cleave the crawlers away from her, expect `exposed` (+50% damage for 10 s) after every combo so do not stand in Ağ Yağmuru or Uyarı Çığlığı then. **Healer**: Uyarı Çığlığı (3 s group DoT) and Ağ Yağmuru (5 s) are the heavy beats, cleanse the two Sürü Hastalığı stacks, watch the tank during `exposed`. **DPS**: kill or slow every starved crawler before it reaches her (priority over boss damage), cleave them, dispel Sürü Hastalığı, kite swarms away from the group; a Zorba week makes each eaten crawler matter more. **Enrage** 270 s (`boss_enrage`, +50% damage, then +12% every 8 s).

**Elden Ring layer.** Parry the first two claws of the string for a riposte and dodge-roll the held lunge (never block it); after Sıçrayan Ezme she is winded for 1.5 s, which is the burst window (and a safe moment to cleave crawlers). A poise break (900) stuns her 2.0 s at x1.25 damage but does **not** cancel Uyarı Çığlığı.

Yells: pull "Tssk... tssk... AÇIM!" · phase 2 "AÇIM! AÇIM!" · death "...Ağlarım... boşa...".

### 5.2 Boss 2: Gözetmen Anubzek, "Hasat Başgözetmeni" (`boss_anubzek`)

Model: NEW `nerub_overseer` (about 4 m, mandibles, spiked carapace back, teal runes); fallback `enemies/Skeleton_Warrior` x2.1 tint `0x4a5a78` with `eyeEmissive 0x40ffe0`. Clips (new model): `Idle`, `Walk`, `Run`, `Attack`, `Attack2`, `Cast`, `Enrage`, `Hit`, `Death`; the fallback uses the KayKit skeleton set.

| hpMult | dmgMult | speed | radius | enrage | arena | home |
|---|---|---|---|---|---|---|
| 95 | 2.6 | 6.0 | 1.5 | 300 s | room `anubzek_terasi` 52 x 52 m, centre tile (27, 10) = world (110, 42) | boss spawn (27, 7) = world (110, 30), facing 0 (toward the south door) |

Anchors: `CENTER` (27, 10); `WEBMAGE_SPOTS` `[[23.3, 6.3], [30.7, 6.3], [23.3, 13.7], [30.7, 13.7]]` (the four diagonal niches; keep the corner pits 2 x 2 so these stay walkable); `SAFE_R` 5.0 m; safe circle centre = boss position + 6.5 m along its facing; the Eye sigil `circleZone('rune', 27, 10, 4.6)` is decor and also the visual hint of the safe-circle geometry.

Phases: `bp('p1', 1.01, [string, impale, burrow, echo, infest, webmages, eye])`, `bp('p2', 0.3, [same], { yell: 'Yankı bitmez! Sürü, uyan!' })` (p2 is **cooldown tweaks only**: burrow cd 24, infest cd 32, echo cd 20, string 2.4 s; no damage multiplier).

| Ability (id) | TR name | first / cd | cast / windup | Effect and numbers | How to build | NEW |
|---|---|---|---|---|---|---|
| `anubzek_string` (basic) | Mızrak Zinciri | n/a / 3.0 | 0.7 / 0.5 / 1.4 hold | 3-hit string at the tank: thrust (line 6 x 2 m, coef 1.0, windup 0.7), backhand sweep (cone 150 deg, r 4.5, coef 1.2, 0.5 s after), both `parryable`; then he raises the spear and **holds 1.4 s** before an overhead slam (circle r 4 in front of him, coef 2.4, `perilous`). Face him away from the group | `line()` + `wedge()` + `circle()` at `b.delay`, `+0.5`, `+1.4`, aim frozen for the slam | string helper (YSP-17) |
| `anubzek_impale` | Mızraklama | 7 / 14 | windup 1.2 | **tank buster frontal**: line 14 x 3 m at the tank, coef 4.0 + bleed (3 stacks, 10 s). Face him away from the group | generic `line()` with `tankBuster: true` | none |
| `anubzek_burrow` | Yer Altı Hücumu | 14 / 32 | 1.0 vanish + 2 strikes | picks 2 targets (ranged first: non-tank players farther than 8 m, then any non-tank). He vanishes, then strikes target 1 and 2 in turn, 0.8 s apart: a circle **r 11 m (13 yd, as in WoW)** follows the target for 1.0 s (coef 2.4, knockback 4) and he emerges on top of it; 0.8 s after the second strike a follow-up `Mızraklama` line at the tank. Counterplay is the WoW one: the ranged players spread so that no two share an 11 m ring, a blink or a dodge i-frame ends the strike, melee players are only picked when no ranged player exists | `setAlphaAll(e.id, 0)`, `circle(c, t.x, t.z, 11, 1.0, 2.4, { follow: true, sourceId: t.id, knockback: 4 })`, `c.teleport()`, `beam()`; same pattern as `nefris_shadowstep` | none |
| `anubzek_echo` | Yankı Basışı | 20 / 26 | windup 1.3 | he rears and stomps: two expanding rings from his feet, ring 1 (band r 2 to 8) lands 0.5 s after the stomp, ring 2 (band r 8 to 16) 0.9 s after ring 1, coef 2.0 each, knockback 3; dodge-roll through each band like a jump rope. `perilous`. Not used during the Eye | two `ring()` shapes at `b.delay + 0.5` and `+ 1.4` around the boss | none |
| `anubzek_infest` | Sürü Hastalığı | 20 / 40 | instant | 3 players (2 with fewer than 4 in the party) get `poison` 10 s (dispellable); at expiry a roaming swarm spawns at their feet and moves in straight lines toward random players for 45 s applying a poison stack on contact | `pickPlayers`, `statusPlayer`, `roamZone` mode `lines` | roamZone (YSP-05) |
| `anubzek_webmages` | Ağ Büyücüleri | 10 / 26 | 0.5 | 2 `yk_webmage_add` appear on random free `WEBMAGE_SPOTS` (cap 4 alive); they cast `Ağ Bağlama` (roots a random non-tank 4 s, interruptible). Tanks pull them under the boss so his cleave hits them. Spawning pauses during the Eye | `c.spawnAdds('yk_webmage_add', 2, { positions, tag: 'wm', hpMult: 1.2 * partyHp(c) })` | none |
| `anubzek_eye` | Sürü Gözü | 38 / 80 (25 s long, 55 s calm) | windup 2.0 + 25 s | **energy phase**: he teleports to `CENTER` (`ground_slam`), then for 25 s the whole disc is filled with a Ceaseless Swarm cloud (coef 0.45 per 0.5 s plus one `poison` stack per tick) **except a safe circle r 5 in front of him**. His facing follows the tank at at most 0.9 rad/s, so the tank moves the safe circle. The group stands inside the circle beside the tank (not on top of each other: infest continues). He cleaves the tank every 2.2 s from inside the Eye | `c.teleport(center)`; the ability `tick()` turns `e.yaw` toward the tank (direct write, as `nefris` does) and fires the cleave itself (a busy boss runs no basic attacks); the cloud and safe circle come from `safeCircle` | `safeCircle` (YSP-05) |
| `anubzek_rush` (phase 2) | Sürü Hızı | 30% | 1.0 | `cdOverride` only: burrow 24 s (from 32), infest 32 s (40), echo 20 s (26), string 2.4 s (3.0); yell, `boss_shake`. No damage multiplier | `onPhase` | none |

Duties. **Tank**: turn the boss so the safe circle drifts slowly (never spin him), stand inside the circle in front of him during the Eye, survive Mızraklama with a defensive, pull the webmage adds into the cleave. **Healer**: spot-heal the infested players, the Eye's stacking poison (cleanse early stacks), the Mızraklama bleed. **DPS**: interrupt or CC the webmages, drop infestation swarms at the cloud edge (not so far that boss uptime is lost), spread when marked for Yer Altı Hücumu, move out immediately after the first strike lands. **Enrage** 300 s.

**Elden Ring layer.** Parry the thrust and sweep, dodge the held slam; roll through the two Yankı Basışı rings. A poise break during the Eye of the Swarm stuns him 2.0 s: the safe circle stops turning (the cloud does not), so use the break to reposition the group, not to leave the circle.

Yells: pull "Hasat durmaz. Kovan sizi de dokuyacak." · phase 2 "Yankı bitmez! Sürü, uyan!" · death "Yankı... bende... susmuyor...".

### 5.3 Boss 3 (showpiece): Hasatçı Kikatal, "Kara Kan Hasatçısı" (`boss_kikatal`)

Model: NEW `nerub_harvester` (about 5 m, crowned carapace, silk cape, violet vial on the back, glowing teal runes); fallback `gen/bosses/golge_rahibesi` x1.15 tint `0x6a3a8a`, emissive `0x8a40c0` (clips `Idle`, `Walk`, `Run`, `Attack`, `Attack2`, `Cast`, `Enrage`, `Hit`, `Death`).

| hpMult | dmgMult | speed | radius | enrage | arena | home |
|---|---|---|---|---|---|---|
| 120 | 2.7 | 5.2 | 1.4 | 330 s | room `kikatal_deposu` 60 x 56 m, centre tile (55, 28.5) = world (222, 116) | boss spawn (55, 31.5) = world (222, 128), facing 180 (toward the north door) |

Anchors: central cauldron pit `circleZone('pit', 55, 28.5, 1.7, { blocked: true })` (the walkway around it stays open); four vats at `(48.8, 25.8)`, `(60.5, 24)`, `(49.5, 33.5)`, `(60.5, 33.5)` (`black_blood_vat`; the NW one moved off the stair strip H11); Bloodworker lanes run east-west at `z = 25.0, 26.5, 30.5, 32.5` (the middle lane is the pit), lane start x 48.5 (west) or 61.5 (east); `SPINNER_SPOTS` `[[49, 29], [61, 29], [55, 22.5]]`; exit portal `(55, 34)`, chest beside it.

Phases: `bp('p1', 1.01, [string, hook, tide, haul, webs, poisons, singularity])`, `bp('p2', 0.4, [same], { yell: 'Hasat hızlansın!' })` (p2 is **cooldown tweaks only**: haul cd 15 s, singularity cd 40, tide cd 20, string 3.0 s; heartbeat SFX up; no damage multiplier, no extra workers).

| Ability (id) | TR name | first / cd | cast / windup | Effect and numbers | How to build | NEW |
|---|---|---|---|---|---|---|
| `kikatal_string` (basic) | Hasat Zinciri | n/a / 3.5 | 0.7 / 0.5 / 1.4 hold | 3-hit scythe string at the tank: wide sweep (cone 180 deg, r 6, coef 1.2, windup 0.75), reverse sweep (same cone, 0.5 s after), both `parryable`; then she winds the scythe back and **holds 1.4 s** before a lunging thrust (line 12 x 2.6 m, coef 2.2, `perilous`) | `wedge()` x2 + `line()` at `b.delay`, `+0.5`, `+1.4`, aim frozen for the thrust | string helper (YSP-17) |
| `kikatal_hook` | Kan Kancası | 6 / 18 | windup 1.3 | **tank buster** (our addition so the tank has a role): line 10 x 2.6, coef 3.5, `kara_kan` 2 stacks on the target | generic `line()`, `tankBuster: true` | status `kara_kan` (YSP-06) |
| `kikatal_tide` | Kan Gelgiti | 16 / 26 | windup 1.2 | she drags the scythe through the Black Blood: a wave (line 36 x 3.5 m) races across the arena at 14 m/s toward the farthest player, coef 2.4 shadow plus `kara_kan` 1 stack; a dodge-roll i-frame goes through it (the Elden Ring roll check). `perilous` | `beam()` re-planted along the path every 0.15 s (a moving `band`) | none |
| `kikatal_haul` | Kan İşçileri | 8 / 22 | 0.5 | 3 `yk_bloodworker_run` spawn on 3 of the 4 lanes and run across at 9 m/s (alternating west-east / east-west, `forcedMove`), about 7 s per crossing; they cannot be tanked. **The first time one takes damage it drops a Black Blood pool where it stands and flees (despawns)**. A runner that reaches the far edge leaves quietly | `spawnMech` (aggro false) + `ent.forcedMove = { vx, vz: 0, until }`; `script.update()` watches `ent.hp < ent.maxHp`, then `spawnMech(c, 'yk_blood_pool', pos, { hpMult: 0.5 * partyHp(c), tag: 'bp' })` and `watchZone` on it, `ent.escape()` | watchZone (YSP-05) |
| passive Kavrayan Kan (`kikatal_grasp`) | Kavrayan Kan | n/a | n/a | the first player to touch a pool is **trapped**: `root` until the pool entity (HP 0.5 x TRASH_HP x partyHp, breakable by the party) dies, max 60 s, 1 `kara_kan` stack on entry; in Mythic the pool is absorbed after one player steps in (`once: true`). Alone in the arena the pool breaks itself after 8 s with a small hit | `trapPlayer(c, p, { defId: 'yk_blood_pool', prefix: 'bp', hpMult: 0.5 * partyHp(c), status: 'root', maxAge: 60, soloAge: 8, soloHit: 1.0, toast: 'Kara Kan seni yakaladı! Havuzu kır.' })` + `updatePrisons(c, dt)` in `update()` | watchZone (YSP-05) |
| `kikatal_singularity` | Kozmik Teklik | 20 / 48 | cast 3.0, **interruptible** (poise break) | pulls every player toward her at 6 m/s for 2.8 s, then a circle r 10 detonates (coef 3.0 shadow, knockback 8) and applies `faded` magnitude 0.75 for 20 s (-75% damage dealt, +25% taken). Counterplay: a stagger break on the cast ("KESİLDİ!", then `c.stagger(2.5, 1.25, 4)`), outrun it with dodge rolls (pull 6 m/s vs 7 m/s run), or **stand in a pool: rooted players ignore the pull** | `bossMsg('boss_pull', { x, z, speed: 6, dur: 2.8, stop: 1.4, r: 0 })`, `circle(c, e.x, e.z, 10, b.delay + 2.8, 3.0, { type: 'shadow', knockback: 8, statuses: [{ status: 'faded', duration: 20, magnitude: 0.75 }], name: 'Kozmik Teklik' })`; the `abort()` handler clears the pull on interrupt | status `faded` (YSP-06), pull ignores root (YSP-10) |
| `kikatal_poisons` | İşlenmiş Zehirler | 14 / 30 | instant | 3 random players (non-tanks first) get `poison` 8 s (magnitude 0.3, dispellable) and floating text "ZEHİR". At 8 s each erupts in two pulses 1.1 s apart along a random axis (north-south or east-west): a line 44 x 3 m through the player, coef 2.2 poison + 1 poison stack. Simplification of WoW: the eruption always fires at 8 s (a dispel only removes the DoT) | `pickPlayers`, `statusPlayer`, `c.schedule(8, ...)`, `band(c, p.x, p.z, axisAng, 44, 3, 0.9, 2.2, { type: 'poison', name: 'Zehir Patlaması' })` twice | none |
| `kikatal_webs` | Patlayan Ağlar | 10 / 26 | telegraph 1.8 | 3 circles r 3.2 under random players, coef 1.8, `stun` 2.0 s (WoW 3 s, softened for ARPG), `vfxOnLand: 'web_burst'` | `circle()` x3 under `pickPlayers(c, 3)` | none |
| passive Ağ Örücü | Ağ Örücü | every 15 s, cap 3 | 1.2 | an add `yk_web_spinner` appears at a `SPINNER_SPOTS` edge and casts `Ağ Fırlat` on a random player: root 3 s plus `exposed` 0.15 (+15% damage) for 15 s; interruptible | `every(state, 'sp', dt, 15, ...)`, `c.spawnAdds('yk_web_spinner', 1, { positions: [spot], tag: 'spinner', hpMult: 0.9 * partyHp(c) })` | none |
| `kikatal_harvest` (phase 2) | Hasat Hızlanır | 40% | 1.0 | `cdOverride` only: haul 15 s (from 22), singularity 40 s (48), tide 20 s (26), string 3.0 s (3.5); `boss_shake`, heartbeat tempo x2. No damage multiplier, no extra workers | `onPhase` | none |

Duties. **Tank**: defensive for Kan Kancası, keep her at the walkway edge so the group is not tempted into the cauldron ring, do not cleave Bloodworker runners carelessly. **Healer**: Işlenmiş Zehirler (3 DoTs), the Kozmik Teklik burst, the `faded` windows (the party deals 25% damage, so expect a longer damage race), kara_kan stacks (dispellable). **DPS**: do not AoE the worker lanes (each hit drops a pool), kick or stagger the Singularity cast if you can, **break rooted friends out of pools immediately**, interrupt Ağ Örücü, aim Zehir Patlaması lines away from the group. A deliberate pool step during Kozmik Teklik is the advanced play: the rooted player anchors out of the pull and the pool breaks right after. **Enrage** 330 s.

Showpiece staging (on top of the boss-kill rule of `GDD_CONTENT` 1.1): the death plays `Death`, every pool and vat on screen pulses once and drains to nothing, the Black Blood lights turn teal, 0.3x slow motion for 0.8 s, the camera pulls up to show the whole Undercache, then the exit portal (`gp('mplus_portal')`, teal tint) and the end chest (`gp('chest_epic')`) rise out of the cauldron mouth. Boss music `boss` with the heartbeat layer; phase 2 doubles the heartbeat tempo.

**Elden Ring layer.** Parry the two sweeps for a riposte, dodge the held thrust, roll through Kan Gelgiti. Kozmik Teklik is stopped by a poise break (900), which replaces the WoW interrupt; its cast bar is the posture check of the fight, so melee and ranged both build poise damage before the 20 s mark.

Yells: pull "Kara Kan şehri yükseltecek. Siz yalnızca akacaksınız." · phase 2 "Hasat hızlansın!" · death "Ağ... yırtıldı... yankı... susuyor...".

### 5.4 Loot tables (personal loot, 2-3 named items per boss)

Per `CORE_MECHANICS` section 15 every boss drops a personal chest: 1 guaranteed item per player (plus a chance of a second) from the boss's own table, 70% smart loot (main stat and armour type of the spec). Each table has **three named unique items** (`src/data/uniques.ts`) with a build-defining fixed effect; each named item is about 15% of that boss's personal drop (45% together), the rest is the slot-biased rare/epic pool. Mythic+ drops roll at the key's chest item level (`CORE_MECHANICS` 4.4: `68 + 2 x min(L, 12)`), personal loot per `GDD_SYSTEMS` 7.4; all percentages and damage figures in the effects scale with item level (the numbers below are the item-level-88 reference), and the end chest rolls from the union of the three tables.

| table | boss | slot bias | named items (build it defines) |
|---|---|---|---|
| `loot_yk_b1` | Avanoksa | head, hands, legs | Yumurta Kesesi (summoner / poison) · Doyumsuzun Azısı (cleave bruiser) · Kozalak Ağı Omuzluğu (control / kite) |
| `loot_yk_b2` | Anubzek | shoulders, chest | Gözetmenin Mızrağı (reach / burst) · Yankı Kalkanı (guard and parry) · Kovan Gözü (crit / AoE chain) |
| `loot_yk_b3` | Kikatal | chest, belt, boots, rings | Kara Kan Orağı (shadow burst) · Kozmik Yankı (pull and detonate) · Hasatçının Kaftanı (DoT / sustain) |

| id | Name | Slot | Effect (item-level-88 reference) |
|---|---|---|---|
| `uni_yk_sacbrood` | **Yumurta Kesesi** | trinket | Use (cd 120 s): 3 Yavru Sürünen fight for you 18 s, each bite adds a poison tick of 80% weapon damage. Passive: +8% poison damage. Build: summoner and poison specs |
| `uni_yk_maw` | **Doyumsuzun Azısı** | two-handed axe | Your hits on enemies under 25% HP and every kill add a **Doyum** stack (max 10, 12 s, refreshed): +2% damage each. At 10 stacks the next hit eats them all: a 300% weapon-damage bite in a 5 m cone that heals you for 8% max HP. Build: cleave bruiser that chains small packs (the crawler packs are made for it) |
| `uni_yk_webwrap` | **Kozalak Ağı Omuzluğu** | shoulders | Your slows also **root** for 1.2 s (once per 8 s per target) and enemies that are slowed or rooted take +12% damage from you. Build: control and kiting specs (Yapışkan Ağ, Ağ Oku slows become a real combo) |
| `uni_yk_impaler` | **Gözetmenin Mızrağı** | two-handed polearm | Hits have a 12% chance (6 s internal cooldown) to open a burrowing line 10 m long: 220% weapon damage plus 30% slow for 3 s. Build: reach and burst with a slow rider |
| `uni_yk_echoshield` | **Yankı Kalkanı** | shield | Blocking or parrying stores the prevented damage; 1.5 s later it **echoes** as a shockwave of 70% of the stored damage in 8 m around you (internal cooldown 3 s). A perfect parry echoes at 120%. Build: guard-and-parry tank (Knight) that turns the Elden Ring defence into AoE |
| `uni_yk_hiveeye` | **Kovan Gözü** | ring | Critical hits apply **Kovan İşareti** for 8 s; a marked enemy that dies releases a swarm cloud (r 5 m, 4 s, 120% attack power per second) that re-marks the first enemy it touches. Build: crit AoE chains in dense pulls |
| `uni_yk_sickle` | **Kara Kan Orağı** | curved dagger | Shadow hits build Kara Kan (8 charges); at 8 it bursts: 450% weapon damage shadow in 8 m. Build: shadow burst rotations |
| `uni_yk_echo` | **Kozmik Yankı** | trinket | Use (cd 90 s): pulls enemies within 10 m to you, 1.5 s later they detonate for 600% attack power shadow damage (the Singularity in your hands). Build: pull-and-detonate cooldown play |
| `uni_yk_harvestrobe` | **Hasatçının Kaftanı** | chest | Your damage-over-time ticks heal you for 0.5% max HP (once per 0.5 s) and every different DoT you have on an enemy raises your other DoTs on it by 4% (max 5 stacks). Build: affliction and sustain |

---

## 6. Mythic+ tuning

### 6.1 Forces, routes and pulls

Required 405, available 502 (123.9%), per `GDD_CONTENT` 0.4 the available total should be 122-126% of the requirement. Forces by area (all packs): Strands area 163 (incl. the 28 optional nursery), Overlook area 181 (incl. the 12 of the skip corridor), Undercache area 158. Percentages below use 405 as 100%. **Geometry rule used for every route:** a pack can only be skipped when it lies off the walked line by more than its aggro (9-14 m) plus its patrol; **p15 patrols the hall at 1.5 and 3 tiles from p12 and p13 and cannot be skipped**, so it is counted in the hall pull.

| Route | What it clears | Forces | % of required |
|---|---|---|---|
| **A-100** (recommended) | everything except the nursery (p29), the skip corridor (p16) and five small packs that are avoided by position or patrol timing: p01, p04, p11, p21, p28 (41 forces) | 421 | **104.0%** |
| **A-full** | everything except p29 and p16 | 462 | 114.1% |
| **B** (elite skip) | skips the whole Nöbetçi Holü (84 forces: p12, p13, p14, p15) through the Ağ Geçidi (p16, 12), takes the nursery (p29, 28); everything else | 418 | **103.2%** (13 forces of slack: p01 and p28 are the only free skips) |
| C (greed) | everything except p16 | 490 | 121.0% |

Completion is "every boss dead and forces at 100%" (`GDD_CONTENT` 0.4): if Kikatal dies first, the timer runs until the missing percent is killed. Route A-100 keeps **16 forces of slack** (421 against 405). The five voluntary skips only ever add forces if they pull by accident (p11 and p21 sit in 3-tile corridors, p01 on the bridge), so a pull is never lost; if they do pull, the group is ahead and p20 (14, lab south) is the fallback skip in pull 9. When a pull is missed, p28 (6 forces) in the Dron Koğuşu is the usual fix.

**Route A-100, 14 pulls (6 in the Strands, 4 in the Overlook, 3 in the Kara Kan line, 1 in the Dron Koğuşu).** Kibirli / Efsunlu Yarık thresholds (20 / 40 / 60 / 80% of forces) are marked in the last column; spots are chosen in 6.5.

| # | Packs | Forces | Cumulative | % | Note |
|---|---|---|---|---|---|
| 1 | p02 + p03 | 25 | 25 | 6.2% | teller west; Kudret Sunağı after this pull |
| 2 | p05 + p06 | 22 | 47 | 11.6% | eggs wake as you step in; big crawler pull with the shrine up |
| 3 | p07 (Iksin room) | 22 | 69 | 17.0% | kick every Dehşet Çığlığı |
| 4 | p08 (Nakat room) | 18 | 87 | 21.5% | crosses 20% (Kibir spawns in the teller) |
| 5 | p09 (Atik room) | 20 | 107 | 26.4% | the curtain on `rampa_bir` starts to glow |
| 6 | p10 | 12 | 119 | 29.4% | then Avanoksa |
| 7 | p12 + p13 + p15 | 58 | 177 | 43.7% | hall (the p15 patrol walks through both packs and cannot be skipped), crosses 40%; kick both Alarm Çığlığı; gong 2 is here |
| 8 | p14 | 26 | 203 | 50.1% | two bloodguards alone |
| 9 | p17 + p20 | 34 | 237 | 58.5% | lab; Rüzgâr Sunağı next to it (p20, 14 forces, is the fallback skip) |
| 10 | p18 + p19 | 42 | 279 | 68.9% | crosses 60%; then up the Yankı Merdiveni to Anubzek |
| 11 | p22 | 22 | 301 | 74.3% | |
| 12 | p23 | 28 | 329 | 81.2% | double Zehir Yaylımı; crosses 80% |
| 13 | p24 + p25 | 45 | 374 | 92.3% | both are patrols, pull them together |
| 14 | p26 + p27 | 47 | 421 | 104.0% | ceiling drones plus elites, then Kikatal |

**Route B (elite), 17 pulls:** p01; p02 + p03; p04 + p05 + p06; p07; p08; p09; **p29 (nursery)**; p10 (then Avanoksa); p11; **p16 (Ağ Geçidi, smash the silk barricade)**; p17 + p20; p18 + p19 (Anubzek); p21; p22; p23; p24 + p25; p26 + p27 + p28. Cumulative 418 (103.2%); 20% falls in pull 4, 40% in pull 8, 60% in pull 12, 80% in pull 16. Route B saves about 1:25 net (the hall costs about 2:00, the nursery detour adds about 0:35) and demands zero wasted pulls.

### 6.2 Timer math (+10, five players, one Tahkimli or Zorba week)

Timer **28:00**. Chest thresholds: +3 at 16:48 (60%), +2 at 22:24 (80%), +1 at 28:00. Model: group damage index 4.05 "DPS-equivalents" (1 tank 0.7, 1 healer 0.35, 3 DPS) times a gear index of 2.2 at +10 (ilvl about 88 against the 60 baseline: `1.022^28 = 1.84`, times about 1.2 for talents and rotation), so a boss with HP x `H` takes `H x 3.8 x scale(10) / (4.05 x 2.2)` seconds with perfect uptime (`scale(10) = 1.999`). Real fights add the uptime loss of adds, soaks and movement: 55% for a competent group, 70% good, 85% elite, plus about 8 s of intro. Trash packs die in 4-14 s (`p23` has 12.5 HP x units, about 13 s single target, about 6 s with cleave); the time sink is positioning, kicks, regrouping and the walk, folded into "pulls" below.

| Component | Competent | Good | Elite |
|---|---|---|---|
| Start: Kehanet Taşı, 10 s countdown, buffs | 0:25 | 0:20 | 0:15 |
| S1 travel (giriş, köprü, teller, rampa) | 0:35 | 0:30 | 0:25 |
| S1 trash: 6 pulls on A-100 (3 are the Görevli rooms; route B has 8) | 4:50 | 4:10 | 3:20 |
| S1 boss: Avanoksa (hp 85) | 2:20 | 1:52 | 1:33 |
| S2 rampa and transition | 0:25 | 0:20 | 0:15 |
| S2 trash: 4 pulls on A-100 (hall p12 + p13 + p15, p14, two lab pulls; route B: p11, p16 and two lab pulls) | 4:10 | 3:35 | 2:45 |
| S2 travel | 0:30 | 0:25 | 0:20 |
| S2 boss: Anubzek (hp 95) | 2:35 | 2:04 | 1:43 |
| S3 trash: Kara Kan Hattı, 3 pulls (p22, p23, p24 + p25; route B adds p21) | 2:40 | 2:15 | 2:10 |
| S3 trash: Dron Koğuşu, 1 pull (p26 + p27; route B adds p28) | 1:30 | 1:15 | 1:10 |
| S3 travel (tunnel ramp, Dron Koğuşu, pit stair) | 0:40 | 0:35 | 0:25 |
| S3 boss: Kikatal (hp 120) | 3:15 | 2:34 | 2:08 |
| Deaths (+15 s each): 2 / 1 / 0 | 0:30 | 0:15 | 0:00 |
| **Total** | **24:25** (87.2%, +1 chest) | **20:10** (72.0%, +2 chest) | **16:29** (58.9%, +3 chest, 19 s under the line) |

Section subtotals (start plus Strands / Overlook / Undercache): competent 8:10 / 7:40 / 8:05, good 6:52 / 6:24 / 6:39, elite 5:33 / 5:03 / 5:53. Elite times assume route B (8 + 4 + 4 + 1 trash pulls). Pull counts of the table are the pull counts of 6.1 (6 / 4 / 3 / 1 on A-100); chest classes: +3 needs 16:48 or less, +2 needs 22:24 or less. The 2.0 s poise-break windows of the bosses (about one per 25-35 s of dedicated play, x1.25) are already inside the uptime factors above. A Zorba week adds about +1:45 to the three bosses, a Tahkimli week about +0:50 to the trash: a wash within one minute.

Boss HP at key levels (five players, `scale(L)`, base / with Zorba x1.3):

| Boss (hpMult) | +2 | +7 | +10 | +15 |
|---|---|---|---|---|
| Avanoksa (85) | 783k / 1.02M | 1.15M / 1.50M | 1.45M / 1.89M | 2.34M / 3.04M |
| Anubzek (95) | 876k / 1.14M | 1.29M / 1.67M | 1.62M / 2.11M | 2.61M / 3.39M |
| Kikatal (120) | 1.11M / 1.44M | 1.63M / 2.11M | 2.05M / 2.66M | 3.30M / 4.29M |

Scaling note (resolve before tuning in game): `CORE_MECHANICS` section 6 (normative, "overrides `GDD_CONTENT` 5.4") says HP and damage scale `x1.08^(L-1)` up to +10 (x2.0 at +10) and `x1.10` per level above; `src/data/mythicAffixes.ts` still has the older `mplusHp = 1.1^(L-1)` (x2.36 at +10) until package CM7 lands. This document uses the normative curve. If the old HP curve stays live, bosses are 18% longer (competent run about 26:40, 95% of the timer, still timed) and the three `hpMult` values should be multiplied by 0.85.

### 6.3 Dangerous pulls

| Pack(s) | Forces (% of 405) | Why it is dangerous | Answer |
|---|---|---|---|
| p07 Iksin + 2 attendants | 22 (5.4%) | CC-immune miniboss; Dehşet Çığlığı every 12 s plus two Rezonans Yağmuru casters | kick rotation of three; one poise break per cycle; gong 1 is far, do not rely on it |
| p08 Nakat + crawlers | 18 (4.4%) | Sürü Çağrısı drops 3 crawlers onto random players every 18 s | stack up, tank gathers; Bursting weeks count every third swarm death |
| p09 Atik | 20 (4.9%) | Zehir Bulutu under a random player, Zehir Oku DoT on the tank | step out, dispel, kick 1 in 3 |
| p06 + p02 + p05 | 32 (7.9%) | 22 crawlers waking at once, three Rezonans casters | use Kudret Sunağı, gong 1 interrupts everything |
| **p12 + p13 + p15** | 58 (14.3%) | two Boynuzkabuk (two Alarm Çığlığı, `once` each) plus the p15 patrol that walks through both packs; a missed kick adds a bloodguard and, through the same-room rule, pulls p14 (21 m) | one kick on each Boynuzkabuk first (the hall gong at 37.5, 21.5 does both), never pull p14 with them; the Kan Bakıcısı of p12 dies second |
| **p14** | 26 (6.4%) | two bloodguards: Çekirge Fırtınası overlap, Mızrak Atışı x2, Zayıfın Siperi | pull alone, stagger the clouds, cooldowns on the tank |
| p19 | 25 (6.2%) | Boynuzkabuk plus bloodguard plus two webmages in the lab: an unkicked Alarm pulls p17 and p18 (same room, within 25 m), not p20 | kick the Boynuzkabuk first (or CC it, it is not immune) |
| **p23** | 28 (6.9%) | two Kan Gözcüsü: two overlapping Zehir Yaylımı (CC immune, poise break only) plus two drones and a Kan Bakıcısı (kill the healer between kicks) | stagger the two Volleys, dispel poison stacks, gong 3 |
| p24 + p25 | 45 (11.1%) | two patrols with two elite crawlers (spit, leap slam, death blasts) and a healer | pull into the open, kill the engorged crawlers in melee range of the tank so the knock-backs do not scatter the group |
| **p26 + p27** | 47 (11.6%) | ceiling drop of five drones plus an overseer plus a bloodguard; links | pull only with all cooldowns, tank at the door, kick the overseer's Zehir Yaylımı |
| p29 (nursery) | 28 (6.9%) | 12 enemies burst out of the eggs at once | route B only; fight in the corridor mouth |
| Eye of the Swarm and Singularity | boss | see 5.2 / 5.3 | |

### 6.4 Affix interactions

Rules from `GDD_CONTENT` 5.5: summoned and boss adds never trigger death affixes; during boss encounters death affixes do nothing except for adds the boss summoned; bosses are immune to Raging, Bolstering and Inspiring. Swarm role (`yk_crawler`, `yk_wasp`) triggers Bolstering / Sanguine / Bursting / Spiteful only on every third swarm death (`GDD_CONTENT` 1.2).

| Affix | In Yankı Ağı |
|---|---|
| **Tahkimli** (+20% trash HP, +30% damage) | applies to trash, elites and minibosses; bloodguard packs (p12, p14, p19, p27) and the three Görevli rooms are the pressure points |
| **Zorba** (+30% boss HP, +15% damage) | Avanoksa: each eaten crawler matters more, kill crawlers first; Kikatal: longer `faded` damage race, the Singularity stagger is worth more |
| **Güçlenen** | do not kill the three attendants or the webmages one by one next to a living bloodguard; burst a pack evenly. Crawler packs are safe thanks to the horde rule |
| **Öfkeli** (Zorba weeks) | a Boynuzkabuk below 30% HP cannot be CC'd or kicked by CC: kill it first or never leave it at 30%. Overseers are already CC immune |
| **Kan Dökücü** | Sanguine pools are red; Black Blood puddles are violet: never fight on the vat lanes of `kan_hatti` |
| **Patlayan** | p06, p29 crawlers cause about three stacks each; fight with the shrine up |
| **İlham Veren** | an Inspired Boynuzkabuk or Gözcü is un-kickable: mark and kill it first; Alarm Çığlığı then cannot be stopped |
| **Volkanik** | players further than 6 m from every enemy get plumes: the Eye safe circle sits 6.5 m from the boss, kiters at Avanoksa are by crawlers, so rarely an issue; be careful in the Kikatal pull when the group leaves the cauldron ring |
| **Sarsıntılı** | the Eye's safe circle (r 5) holds the whole group: spread to its diagonal so the quake rings do not stack; quake also interrupts your own casts during Singularity |
| **Patlayıcı Küre** | orbs spawn next to enemies: next to Anubzek's webmages and Avanoksa's crawlers; one-hit kills them, ground AoE (puddles) does not |
| **Nekrotik** | every melee mob stacks it: tanks use defensives early; Oburca Isırık plus `exposed` is the worst moment |
| **Kin Dolu** | spite shades from non-boss deaths: swarm packs are throttled; Avanoksa and Kikatal adds do not trigger it |
| **Fırtınalı** | tornadoes in `kopru`, `rampa_bir`, `rampa_iki` (tight): step out of the corridor, 12 s life |
| **Ağır Yara** | Kikatal's poisons keep people under 90%: healers top up between casts |
| **Kibirli** (seasonal, `CORE_MECHANICS` section 6) / **Efsunlu Yarık** (still in data) | every 20% forces a Kibir Tecessümü (elite, 4.0 HP x, 4x trash HP) spawns at an unused rift spot at least 15 m from the party and outside boss arenas; killing it gives +10% damage and +10% move speed for 60 s. Spots in 6.5 are placed so the 20% spawn is in the Strands and the 80% spawn is ahead of the party in the Dron Koğuşu (route A-100 pull numbers: 4, 7, 10, 12) |

### 6.5 Shrines, Font of Power, rift spots, gongs

* **Kehanet Taşı (Font of Power):** `(6.5, 47)` in `giris`, `gp('font_of_power')` tinted teal `0x39d0c4`, rune circle under it; ready check, `keystone_insert` VFX, barrier on the `giris → kopru` door for the 10 s countdown (`GDD_CONTENT` 5.3). Tag `socket`, id `font_of_power`.
* **Shrines (fixed types in M+, `GDD_CONTENT` 1.4):** `shrine_power` Kudret Sunağı at `(28.3, 52.2)` in `teller` (use on the p05 + p06 chain and the Görevli rooms); `shrine_haste` Rüzgâr Sunağı at `(22.2, 26.2)` in `laboratuvar` (use on p18 + p19 or on the run up the Yankı Merdiveni to the Terası). Both use the dungeon-local `shrine()` helper copied from `golge_tapinagi.ts` (altar plus crystal plus candle ring), ids `shrine_power_1`, `shrine_haste_1`.
* **Rift / Kibirli spots (`extras.riftSpots`, 6):** `(20, 50)` teller west, `(26, 46)` teller centre, `(41, 22)` hall, `(32.5, 26.5)` lab (moved off the pack p18 and the stair strips), `(46, 8)` kan_hatti, `(52, 18)` dron_kogusu. None in boss arenas, none in the optional nursery. On route A-100 the 20% spawn (pull 4) is `(26, 46)` (party is in the Nakat room, 9.5 tiles away), the 40% spawn (pull 7) is `(32.5, 26.5)` in the lab (ahead), the 60% spawn (pull 10, in the lab) is `(41, 22)` in the hall (13 tiles behind, a short walk down the stair H8 and back), the 80% spawn (pull 12, p23 in the Kara Kan Hattı) is `(52, 18)` in the Dron Koğuşu ahead.
* **Echo gongs:** `(24.5, 44.5)` teller, `(37.5, 21.5)` hall, `(46.5, 9)` kan_hatti, one use each.
* **Chest:** `chest_wood` at `(44, 51)` in the nursery (M+ gives gold plus one Can Küresi only, `GDD_CONTENT` 1.3); the end chest `chest_epic` at the exit portal `(55, 34)`.
* **Hazards:** no ambient room hazards; every damaging effect is a telegraphed ability, so M+ is not polluted by random plumes.

---

## 7. Entrance

**Zone: Karakır Bozkırı** (`karakir_bozkiri`, 180 x 140 tiles, `GDD_OPENWORLD` 1.8), the **dry steppe half** (fog `0xcfc2a0` near 30 far 110). The steppe is already the home of centipedes, wasps and burrowing beasts (the same families as the crawlers and wasps inside), so the dungeon reads as "the thing those animals are fleeing from". Entrances are spread across zones, one per dungeon: this one takes the steppe sinkhole; the other seven choose elsewhere. It is a level 60 entrance in a level 30-45 zone on purpose: the Season 1 dungeons are the "go back and look under it" endgame, reached by waypoint.

**Dependency and fallback (read first).** `src/data/world/karakir.ts` is still a skeleton (`getDungeon('karakir_bozkiri')` is undefined, the map is levels 30-45), `GDD_OPENWORLD` 1.8 assigns its two entrances to Buzul Tahtı and Gölge Tapınağı, and `EntranceDef.look` has no `'web'` yet (YSP-14). So **the world entrance is not required for the dungeon to ship**: the dungeon is reached first through the **Kuzgunkale Kadim Kapılar Salonu** portal with a Mitik+ keystone (`GDD_CONTENT` 5.3), exactly like the other Season 1 dungeons today, and Mitik 0 uses the same portal. **YK-D2 (dungeon data) has no entrance dependency**; **YK-D6 is blocked until the Karakır layout exists** and sits outside the YK-QA critical path. To confirm with the other dungeon docs: the sibling Season 1 docs put their entrances in Kadim Diyar (Kefaret, Leş, Peri, Taşkasa, Yiğitler) and refer to this one as "a sinkhole in Karakır Bozkırı", so Karakır needs a **third world entrance** in `GDD_OPENWORLD` 1.8 (a one-line amendment), or, if a dedicated Season 1 map is chosen for all eight, the same sinkhole recipe moves to a cracked-steppe corner of that map (the recipe, props and look do not change).

| Field | Value |
|---|---|
| id / name | `ent_yanki_agi` · "Yankı Ağı Girişi" |
| tile / facing | about `(46, 108)`, facing 0 (the gate sits on the north wall of the sinkhole and faces south). Placeholder until the Karakır layout doc exists and fixes coordinates: keep it in the south-west third of the dry-steppe half, at least 40 tiles from `ent_buzul_tahti` and `ent_golge_tapinagi`, about 20 tiles from a waypoint stone ("Çatlak Kuyu Taşı", add one) |
| min level | 60 (hint below that: "Kapı ağlarla mühürlü. Seviye 60 gerekli.") |
| look | NEW `'web'` (YSP-14) |
| terrain type | **cracked clay steppe collapsing into a sinkhole**: ground texture dirt/dark (`groundTex.dirt` + `dark`, tint `0x8a7a60`), a circular depression r 7 tiles (28 m), 6 m deep, rim of `gp('rock_cliff')` x12 and `kn('rock_tallA..J')`, a 3 m wide dirt switchback ramp down the west wall, dry grass (`grass_patch_fall`) up to the rim, no trees inside |
| return | after a run the party returns to the entrance and spawns 6 m in front of the gate (`DungeonParams.returnTo`, `GDD_OPENWORLD` 5.2); the Kadim Kapılar Salonu portal in Kuzgunkale still accepts Mitik+ keys for players in town |
| local atmosphere | within 30 m of the gate blend to fog `0x1a2630` near 16 far 70, `ambient_dust` specks, teal light (RegionAtmosphere blend window 30 m) |

**The gate ("Ağ Kapısı"), WoW-style grand architecture matching the dungeon:** the NEW prop `web_gate_arch` (14 x 10 x 3 m): two enormous curved chitin fangs form a pointed arch around a 10 m opening, a ribbed lintel spans them with six `cocoon_hanging` dangling from it, and the opening is filled by three `web_curtain` sheets with a teal glowing eye-sigil at the centre (this is the `Portal` interactable surface; `mplus_portal` swirl tinted teal behind it, `lt(0x39d0c4, 2.2, 14, false)`). Around it: two bronze `echo_gong`s (decor here) on iron posts, four `echo_crystal_spire`s beyond the rim, `web_sheet_floor` decals radiating 12 m over the cracked clay, an overturned `gp('wagon')` of a lost caravan wrapped in silk with `gp('bone_pile')`, three `gp('tree_dead')` with silver strands, two amber `gp('lamp_post')`, a `gp('signpost')` reading "Yankı Ağı". At night the teal sigil is the only light on the steppe.

```ts
// data/world/pois.ts (YSP-14): EntranceDef.look gains 'web'
{ id: 'ent_yanki_agi', name: 'Yankı Ağı Girişi', dungeonId: 'yanki_agi', pos: [46, 108], facing: 0, minLevel: 60, regionId: 'karakir_bozkiri', look: 'web' },
// landmark recipe registered in WorldScenery: { id: 'lm_yanki_cukuru', name: 'Yankı Çukuru', regionId: 'karakir_bozkiri', pos: [46, 108], recipe: 'web_gate' }
```

---

## 8. Implementation packages

Work split follows the project policy (Haiku codes from these tables; a Sonnet pass reviews each Haiku block's diff; at most five agents at once; no per-agent browser tests, one Haiku QA pass at the end). Ids prefixed `yk_` / `YK-` so the eight Season 1 dungeons never collide. **Never edit shared files from two packages at once.**

### 8.1 NEW shared primitives (build once for all 8 dungeons)

Every other Season 1 dungeon doc will list its own; these are the ones Yankı Ağı needs. The ones marked **(generic)** are likely to be needed by other dungeons and should be named and built to be reusable.

| id | Primitive | Spec (what Haiku builds) | Used here for |
|---|---|---|---|
| **YSP-01** (generic) | Enemy builders extraction | Move the local helpers of `src/data/enemies.ts` into `src/data/enemies/builders.ts` and export them: `add`, `boss`, `derive`, `MECH`, `def`, `bp`, `custom`, `cone`, `proj`, `aoe`, `line`, `heal`, `buff`, `passive`, `onDeath`, `charge`, `summonAb`, `NOOP`, status helpers (`poison`, `bleed`, `burn`, `chill`), anim sets `A_*`, resist tables `R_*`, url helpers (`ITCH`, `MON`, `CHAR`, `SKEL`, `GEN`, `PROC`, `GRAVE`) plus a new `NERUB(name)`; `enemies.ts` imports them; each dungeon registers its defs from `src/data/enemies/<dungeon>.ts` (imported for side effects at the end of `enemies.ts`). Acceptance: `JSON.stringify(ENEMIES)` and `BOSSES` unchanged before and after the refactor | every enemy and boss def |
| **YSP-02** (generic) | Dungeon kit additions | `kit.packN(id, roomId, cx, cz, members: [enemyId, count][], extra)`: expands counts into the shared sunflower formation (table in 4.4; one helper shared with the sibling docs' `pk` / `spiralPack`), sums `forces` from `ENEMIES[id].forces`, accepts the same `extra` as `pack()`. `DungeonDef.endgame?: true` (hides Normal / Kahramanlık in the portal and entrance panels, enemy level 60, Mitik 0 and Mitik+ only) and `DungeonDef.season?: number`. The sibling docs' season pool registry (`MPLUS_POOL`, `MYTHIC_POOL`, `SEASON_1_POOL`) is the same idea: build one registry and derive `endgame` from pool membership | the pack list, difficulty rules |
| **YSP-03** (generic) | Pack-clear door | `DoorDef.requires?: string[]` (pack ids). The door is closed (builder places a `web_curtain`-style gate prop, theme-selectable) until every listed pack has no living member (host evaluates through `PackWatch`, broadcasts on the existing `gate` channel); on the last death: banner "Ağ titriyor...", 3 s later `web_burst` VFX and the gate opens. Works together with `boss_lock` | Görevli gate |
| **YSP-04** (generic) | Fixate | `EnemyDef.ai.fixate?: boolean` and `BossController.spawnAdds(defId, n, { fixate: 'random' or 'each' })`: the add chases its assigned player and ignores threat and taunts; retargets to a random living player in the arena when it dies; speed is capped at 6.2 m/s (players run 7); host only | Starved crawlers |
| **YSP-05** (generic) | Boss-kit zone helpers (`src/ai/bosses/kit.ts`) | `watchZone(c, { x, z, r, duration, once, tag, onEnter(p) })` + `updateWatchZones(c, dt)` + `clearWatchZones(c)` (host polling with `playersIn`). `roamZone(c, { defId, start, radius, duration, tick, coef, speed, mode: 'chase_random' or 'lines', type, statuses, name })` + `updateRoamZones` + `clearRoamZones`: spawns an invulnerable mech (`PROC` model), moves it on the host, re-plants a 0.6 s circle shape at its position every `tick`. `safeCircle(c, { centre: () => Pt, r, outer, coef, tick, duration, type, statuses, name })` returning `{ stop() }`: every `tick` plants `ring(centre, r, outer)` plus a `kind: 'safe'` green circle telegraph. All three are cancelled by the script's `onReset` / `onDeath` the same way `clearPrisons` is | pools, swarm, Eye |
| **YSP-06** (generic) | Statuses | Add to `StatusId` (`src/types/skills.ts`), `STATUSES` and `STATUS_RULES` (`src/data/statuses.ts`): `exposed` "Açıkta" (`{ stack: 'refresh', perMag: true, takenMore: 1 }`, +50% at magnitude 0.5), `faded` "Soluk" (`{ stack: 'refresh', perMag: true, dealtMore: -1, takenMore: 0.3333 }`: magnitude 0.75 gives x0.25 dealt, x1.25 taken), `kara_kan` "Kara Kan" (shadow DoT, `stack: 'stack'`, `maxStacks: 8`, `maxHpPctPerSec: 0.012`, no HP floor, `dispellable: true`). Icons reuse `debuff-armor-break`, `debuff-curse`, `debuff-poison` | Avanoksa, Kikatal, drones |
| **YSP-07** (generic) | Call for help | `EnemyAI.callForHelp(radius, sameRoom?)`: pulls every idle enemy and pack within `radius` onto the target (reuse `EnemyDirector.pullPack`); with `sameRoom` only those whose `roomId` equals the caster's (no line of sight needed, walls inside a room are ignored). Custom handler `alarm` registered in `CUSTOM` (`src/ai/abilities.ts`): ability `params.aggroRadius` (25 here, was 50), `params.sameRoom: 1`, optional `params.summonId` / `summon` count spawn a reinforcement next to the caster; the existing `params.once: 1` (`EnemyAI.ts:874`) makes it once per Stagshell and cooldown 99 | Alarm Çığlığı |
| **YSP-08** (generic) | Ability params: ranged, suicide, leech | **`params.ranged: 1`**: in `EnemyAI.usable`, `case 'self_aoe'` skips the `canAttackMelee()` slot gate: `edge <= Math.max(ab.range, 1.5) && (ab.range > 0 && !p.ranged ? this.canAttackMelee() : true)` (without it a kiting caster that sorts 6th or later by distance never casts its volley). `params.suicide: 1`: after the ability resolves the caster dies (killer null; Mythic+ forces still count, check `MythicPlus.onEnemyKilled`). `params.leech` / `leechCapPct`: reuse the `vampir()` passive handler of `src/ai/champion.ts` as a generic ability passive (heals the caster for `leech` x damage dealt, capped at `leechCapPct` of max HP per hit) | the four must-kick volleys, Toksik Patlama, Özüt Darbesi |
| **YSP-09** (generic) | Device props | the same device system the Leş Uyanışı doc calls SP-03: `PropPlacement.tag: 'device'`, `PropPlacement.device?: string` (id into `data/devices.ts`), `DeviceDef { id, prompt, range, once, effect, ... }`, host-authoritative `systems/DungeonDevices.ts` (interaction like shrines, broadcast on the `gate` channel family, the prop goes dark when used). Yankı Ağı adds ONE effect to that system: `effect: 'pulse'` with `{ radius, interrupt, stunSec }`: on use every enemy within `radius` has its cast interrupted and non-elite, non-`ccImmune` enemies are stunned `stunSec`; VFX `arcane_burst` teal, SFX `gong`. Data: `echo_gong: { id: 'echo_gong', prompt: 'Çanı çal', range: 3, once: true, effect: 'pulse', radius: 14, interrupt: true, stunSec: 2 }` | Yankı Çanı |
| **YSP-10** | Pull ignores root | `ForceSystem.update` (`src/ai/bossNet.ts`) skips `pull` forces while the local player has the `root` status | Singularity counterplay |
| **YSP-11** | VFX and procedural models | Add `web_burst`, `egg_burst`, `swarm_cloud`, `black_blood` to `VFX_IDS` and map aliases (`smoke_zone`, `add_spawn`, `poison_cloud`, `shadow_ground`) in `vfx/aliases.ts` until real presets exist; add `PROC:swarm_cloud`, `PROC:blood_pool`, `PROC:egg` to `src/ai/procModels.ts` per 3.7 conventions | pools, swarm, eggs |
| **YSP-12** (generic) | Music id | add `dungeon_web` to `MUSIC_IDS` (every Season 1 dungeon adds one id, same pattern), mapped to `music/dungeon_cave_theme.ogg` (loop, gain 1.0) in the audio manifest; generalise "one music id per dungeon, tracks are shared" | theme |
| **YSP-13** (generic, optional) | Style registry | `WallStyle` += `'nerub'`, `FloorStyle` += `'web_stone'` with entries in `WALL_STYLES`, `FLOORS`, `DECOR` of `DungeonBuilder.ts` (nerub: variants `chitin_rib_wall` 60, `wall_pillar` 10, `wall_arched` 12, `wall_cracked` 6; tint `0x7f93b0`; banners none; `rockBase` true) | optional look upgrade |
| **YSP-14** (generic) | Entrance look and landmark recipe | `EntranceDef.look` += `'web'` (every Season 1 dungeon adds its own look value; build the union and the recipe registry once); a recipe registry entry `web_gate` in `WorldScenery` building the gate of section 7 | entrance |
| **YSP-15** (generic) | Dormant kinds | `PackWatch` / builder (the `egg` half is the same as Peri Sisleri's S13): `egg` (swap the `wake` prop for the broken-shell variant and spawn `egg_burst`) and `ceiling` (members appear at y +6 and drop in 0.5 s with `leap_land` dust); fallback keeps the current wake behaviour | p06, p26, p29 |
| **YSP-16** (generic) | Verticality data kit | `RoomDef.floorY`, `RoomDef.ceiling`, `RoomDef.strips?: { rect, dir, y0, y1 }[]` and `room(..., { floorY, ceiling, strips })` / `strip(...)` helpers in `kit.ts`, per `CORE_MECHANICS` section 13 (NavGrid heights, `World.groundY`, the 0.45 m step rule, the 2.5 m hit-shape rule and the fall plane belong to the engine package of section 13, which must land first; until then the same grid works flat with every `floorY` read as 0). Validator in `content-check`: every door joins equal heights, no strip tile hosts a pack, prop or boss spawn, no step above 0.45 m. Decorative height props (`gallery_balcony`, `echo_chandelier`, `web_banner`, statues at y > 2.5) are placed with `collide: false` | all rooms, strips H1-H11 |
| **YSP-17** (generic) | Elden Ring ability builders | `chain(id, name, range, arc, cd, hits, o)` and `leap(id, name, radius, range, cd, windup, air, coef, type, anim, impact, o)` in `enemies/builders.ts`, with `custom` handlers `chain` (hit i is its own cone shape after its own windup, aim freezes when the last hit starts, each hit carries `parryable` / `perilous`) and `leap_slam` (ground telegraph at the target, caster airborne for `air` s, `leap_land` dust, 0.6 s recovery); `EnemyAI.shape()` already forwards `perilous` / `parryable` (`GDD_V2` 3.12); boss side `string(c, hits)` and a `leapTo(c, target, air, r, coef)` helper in `src/ai/bosses/kit.ts` that plant the `wedge()` / `circle()` series and freeze the aim before the final hit | trash strings, Ezme Atlayışı, the three boss strings and Sıçrayan Ezme |

### 8.2 Packages for Haiku

| Package | Files | Work | Depends on | Done when |
|---|---|---|---|---|
| **YK-A1** props | `tools/blender/props/props_yanki.py` (+ `manifest.json`, regenerate `docs/assets/generated-props.md`, preview) | the 24 props of 2.7, `psx_lib` style, one 128 px atlas each, emissive tiles, under 600 tris, under 60 KB each, origin at the base (cocoons at the top) | none | GLBs in `public/assets/models/gen/props/`, `node tools/glb-inspect.mjs` clean |
| **YK-A2** creatures | `tools/blender/creatures/c_nerub.py` (+ `build_creatures.py` registration) | `nerub_soldier`, `nerub_weaver`, `nerub_worker` with the clip set of 2.8, under 1200 tris | none | GLBs in `public/assets/models/gen/creatures/`; fallbacks remain until merged |
| **YK-A3** bosses | `tools/blender/bosses/boss_nerub_overseer.py`, `boss_nerub_harvester.py` (+ `gen_bosses.py` list) | the two boss models of 2.8 with `fx_*` bones (`fx_mouth`, `fx_vial`), under 1300 tris, under 300 KB | none | GLBs in `public/assets/models/gen/bosses/` |
| **YK-D1** enemy defs | `src/data/enemies/yanki_agi.ts` | every def of 4.1-4.3 (13 trash types incl. the healer, minibosses with poise values, mech units), the three `boss()` entries of 5.1-5.3 with phases, plus `R_NERUB`, `A_NERUB`, `NERUB()` | YSP-01, YSP-06, YSP-17 | every id of this doc resolves in `getEnemyDef`; forces match; every trash attack windup equals `W(coef)` |
| **YK-D2** dungeon data | `src/data/dungeons/yanki_agi.ts`, `src/data/dungeons/index.ts` | `ROOMS` (with `floorY`, `ceiling`, `strips`), `DOORS`, `PACKS` (`packN`), `PACK_EXTRA`, `BOSSES`, `THEME`, `EXTRAS`, zones, hand-placed props per 3.6 and 8.4, register in `DUNGEONS` and `DUNGEON_IDS` | YSP-02, YSP-03, YSP-09, YSP-12, YSP-16 (YSP-13, YSP-15 optional), D1 ids | `contentCheck` passes; section 3 validations hold; **no entrance dependency** (the dungeon is reached through the Kuzgunkale portal) |
| **YK-D3** boss scripts | `src/ai/bosses/yanki.ts`, `src/ai/bosses/index.ts` | `YANKI_SCRIPTS` and `YANKI_SPAWNS` (`boss_avanoksa: ['yk_starved_crawler','yk_ceaseless_swarm']`, `boss_anubzek: ['yk_webmage_add','yk_ceaseless_swarm']`, `boss_kikatal: ['yk_bloodworker_run','yk_blood_pool','yk_web_spinner']`) per 5.1-5.3 incl. the Elden Ring layer (strings, leap, echo, tide) | YSP-04, YSP-05, YSP-06, YSP-10, YSP-17, YK-D1 | each ability of the three timeline tables exists; cleanup on wipe and death |
| **YK-D4** trash handlers | `src/ai/abilities.ts` (CUSTOM entries) or `src/ai/abilities_yanki.ts` | `alarm`, `chain` and `leap_slam` handlers; `ranged`, `suicide` and `leech` params wiring for the volleys, `yk_engorged_rupture`, `yk_assistant_extract`; `once` for `yk_stagshell_alarm` | YSP-07, YSP-08, YSP-17 | the abilities behave as 4.2 and 4.5; a 9-caster pack casts every volley |
| **YK-D5** loot | `src/data/uniques.ts`, `src/data/loot.ts` | the nine uniques of 5.4 (`uni_yk_sacbrood`, `uni_yk_maw`, `uni_yk_webwrap`, `uni_yk_impaler`, `uni_yk_echoshield`, `uni_yk_hiveeye`, `uni_yk_sickle`, `uni_yk_echo`, `uni_yk_harvestrobe`), `loot_yk_b1..b3`, Turkish tooltips | none | items roll in the personal boss chest and the end chest |
| **YK-D6** entrance | `src/data/world/pois.ts`, `src/data/world/karakir.ts`, world scenery | `ent_yanki_agi`, the sinkhole terrain stamp, the landmark recipe, a waypoint, the local atmosphere blend | YSP-14, **Karakır layout doc (does not exist yet): BLOCKED**, not on the YK-QA critical path | entrance round-trips into the dungeon and back |
| **YK-D7** audio, vfx, icon | audio manifest, `vfx/aliases.ts`, `public/assets/icons/dungeon-yanki.svg`, loading image | YSP-11/12 wiring, dungeon icon, `loadingImage` | YSP-11, YSP-12 | no missing-asset warnings |
| **YK-QA** | one Haiku pass | static checks, one headless load of the dungeon, checklist 8.3 | all | report only; fixes go back to the owning package |

Dependency order: YSP-01..YSP-17 (shared, once; YSP-16 needs the section 13 engine package) → YK-A1/A2/A3 and YK-D1 in parallel → YK-D2, YK-D3, YK-D4, YK-D5 (at most five agents at once, never two on `enemies.ts` or `kit.ts`) → YK-D7 → YK-QA. YK-D6 (entrance) waits for the Karakır layout and is the only package outside the QA critical path. The dungeon is **shippable before the art lands**: every NEW model has a fallback listed in 2.8, every NEW prop has a placeholder in 2.6.

### 8.3 QA checklist (one pass at the end)

* Static: `tsc`, `node tools/content-check.mjs`, `node tools/verify-monsters.mjs`, `node tools/glb-inspect.mjs public/assets/models/gen --short`.
* Numbers: total forces 502, `forcesRequired` 405, route sums **421** / 462 / 418 / 490 (A-100 / A-full / B / C); 29 packs, 149 enemies, 13 trash types, 3 minibosses, 3 bosses; every pack centre and patrol waypoint inside its room and off every stair strip; every door tile on the shared edge of its two rooms with equal heights; `timerSec` 1680; route A-100 pull counts 6 / 4 / 3 / 1.
* Height and kit: no step above 0.45 m, every strip ends at the door height, galleries and chandeliers have `collide: false`; every trash attack windup equals `clamp(0.45 + 0.25 x coef, 0.45, 1.2)` (casts excepted); every trash type has 2-4 attacks; every caster volley has `ranged: 1`; `yk_stagshell_alarm` has `once: 1`, cooldown 99, `aggroRadius 25`, `sameRoom 1`; pack role check of 4.5; each boss has a poise value and its `perilous` / `parryable` flags; each loot table lists three named items.
* One headless load of `yanki_agi` (Mitik+ +2): no console errors, start barrier holds 10 s, the Görevli curtain stays shut until p07 + p08 + p09 are dead, boss doors lock and unlock, Avanoksa crawlers fixate, Eye of the Swarm safe circle moves with the boss facing, a Bloodworker hit drops a pool and a pool entry roots the player, Kozmik Teklik pull ignores a rooted player and a poise break stops the cast, a gong interrupts casts, an uninterrupted Alarm Çığlığı pulls only the same room, the silk barricade smashes, the two grand staircases walk without snagging, the exit portal returns to the dungeon portal in Kuzgunkale (or to the world entrance once YK-D6 exists).
* Affix sanity: Tahkimli and Zorba multipliers visible on the first pull and on Avanoksa; Kibir Tecessümü spawns at 20 / 40 / 60 / 80% at the listed rift spots.

### 8.4 Per-room decoration recipe (for YK-D2)

Hero anchors and coordinates only (counts, lights, VFX and sound per room are in the dressing sheet 3.6). Heights: the `y` of a prop is relative to its room's `floorY`. Helper names are the hand-placement kit of the existing dungeon files (`Props.at/row/grid/ring/wall/torches/scatter`, `makeCtx` reserved circles for packs, bosses, doors, start, exit). Coordinates are GDD tile coordinates. "NEW" props fall back to the placeholders of 2.6.

| Room | Hero props and anchors | Fill |
|---|---|---|
| `giris` | `gp('font_of_power')` (6.5, 47) tint teal + light; `light_shaft` (6, 49); collapsed ramp `dg('stairs_walled')` (1.8, 49) rot 90; `nerub_arch` at the east door (10.5, 48.5) rot -90; two amber lamps (8, 45.5), (8, 51.5) | 6 `hanging_moss` silver strands along the north wall (y 3.6), 3 `cocoon_hanging`, 3 `web_sheet_floor`, 6 `rock_tall*`, 2 bone piles, wagon fragments |
| `kopru` | `nerub_arch` at both ends; 6 `dg('barrier')` silver along the deck edges; 4 teal crystals at y -6 under the deck | 4 hanging cocoons, `web_sheet_floor` on the deck |
| `teller` | web dome: 6 `web_curtain` hung at y 3.2 (no collision) on a ring r 3.5 around (22, 46); `light_shaft` (23, 47); 4 `nerub_pillar` framing the two alcove stairs at (16.3, 42.4), (19.9, 42.4), (24.3, 42.6), (28.2, 42.6), two more at (16.8, 52.2), (28.2, 52.2); grand descent H1 with `nerub_stair_rail` runs at (15.5-19.5, 45.5) and (15.5-19.5, 50.5); `egg_cluster` with `tag: 'wake'` under every p06 member (22.5, 41.8) plus 2 decorative B at (20.3, 41.2), (28.8, 41.2); `shrine_power_1` (28.3, 52.2); gong (24.5, 44.5); wagon wreck `gp('wagon')` (18.5, 51.5) rot 25 tint silver | about 40 `hanging_moss` strands (y 3.4-4.0), 14 `rock_tall*` along the edges, 10 bones and skulls, 6 cocoons |
| `ixin_oyugu` | `nerub_arch` at the door (18.5, 39.5); throne = `kg('altar-stone')` x2.8 tinted slate at (18.5, 34.6); 2 `echo_crystal_spire` (16.5, 35), (20.5, 35) | 6 cocoons along the walls, amber lamp |
| `nakt_oyugu` | `nerub_arch` (26.5, 39.5); 4 `egg_cluster` A at (24.5, 35), (28.5, 35), (24.5, 38), (28.5, 38) | 6 cocoons, green light |
| `atik_oyugu` | `nerub_arch` at both doors; 2 `gp('cauldron')` green liquid (34.6, 46), (34.6, 49.4) with `dg('bottle_*_green')` | 4 cocoons, amber lamp |
| `yumurta_odasi` | p29 eggs `tag: 'wake'` under all 12 members (40.5, 48); `chest_wood` (44, 51) | 20 decorative `egg_cluster` A/B, 3 green lights `lt(0x86c93a, 1.0, 6)`, `web_sheet_floor` x6 |
| `rampa_bir` | `web_curtain` gate (tag `gate`, YSP-03) in the east opening (33.5, 41.5); 2 amber torches | silk on the walls |
| `avanoksa_yuvasi` | `egg_cluster` B with ids `egg_1..6` at the EGGS anchors of 5.1; round dais; torn web canopy: 8 `web_curtain` at y 3.2 on a ring r 6 around (40, 38); 4 `nerub_pillar` at the corners; 4 teal lamps | 10 `web_sheet_floor` on the dais, 6 cocoons, bones |
| `rampa_iki` | 2 amber torches; `gp('signpost')` at the fork (41, 31) | silk |
| `nobet_holu` | 6 `nerub_pillar` at x 36 / 46 and z 18.5 / 21.5 / 24.5; 4 `gp('statue_hooded')` at (35, 18), (46.5, 18), (35, 26.5), (46.5, 26.5) facing the centre; gong (37.5, 21.5); 6 wall amber torches | 12 `ip('psx-dungeon','hexagon')` floor panels, spear racks `dg('sword_shield')` on the walls, silk |
| `ag_gecidi` | silk barricade: 2 breakable blockers `kg('coffin')` tinted silver at (38.6, 29.5) and (38.6, 30.2) scale 1.2, `collide: true` | strands, bones |
| `laboratuvar` | 2 `dg('table_long')` (30.6, 18.2), (32.6, 18.2); 2 `gp('alchemy_table')` (20.9, 18.2), (20.9, 19.8); 2 `gp('cauldron')` green (31.2, 25.2), (21.2, 24.2); Yankı Merdiveni H9 at x 23.5-28.5, z 16.5-20.5 with `nerub_stair_rail` runs at x 23.5 and 28.5, two `nerub_statue` at (23, 17), (29, 17) and four `web_banner`; `shrine_haste_1` (22.2, 26.2) |
| `anubzek_terasi` | dais disc and corner pits (3.2); Eye sigil `circleZone('rune')`; 4 `echo_crystal_spire` at (27, 4.5), (32.5, 10), (27, 15.5), (21.5, 10); lower-city lights beyond the pits | hex panels in the floor ring, silk strands on the spires |
| `tunel` | 6 `black_blood_pipe` along both walls; 2 violet lamps; 1 `cargo_cart` (36.5, 10.2) | wet decals |
| `kan_hatti` | 4 `black_blood_vat` at (41.2, 4.6), (50.8, 4.6), (41.2, 12.8), (50.8, 12.8); 4 `cargo_cart` on the lanes z 6.5 and 9.5; gong (46.5, 9); violet lamps | pipes crossing overhead (y 3.6), wet decals |
| `dron_kogusu` | 18 `cocoon_hanging` in three rows (z 14.5, 17.5, 20.5; 6 each, y 3.2); p26 cocoons directly above its members as `wake` props | pale husks (`bone_pile` pale tint), green lights |
| `kikatal_deposu` | central cauldron ring (3.2), 4 `black_blood_vat` at the corners ((48.8, 25.8), (60.5, 24), (49.5, 33.5), (60.5, 33.5)), pit stair H11 at x 49.5-53.5, z 21.5-24.5 with `nerub_stair_rail` runs, pipes converging on the cauldron, lanes marked with floor decals, exit portal `gp('mplus_portal')` (55, 34), `chest_epic` beside it | `black_blood_pipe` x12, violet lamps, wet decals, harvest-lift shaft backdrop prop above (55, 28.5) |

### 8.5 Data skeleton (copy-ready)

```ts
const THEME: DungeonTheme = {
  fogColor: 0x0d1620, fogNear: 8, fogFar: 46, ambient: 0x2c4256, ambientIntensity: 0.3, hemiSky: 0x5aa8c0, hemiGround: 0x0c1218,
  torchColor: 0xd09a3c, bloomStrength: 0.55, music: 'dungeon_web',           // YSP-12 (fallback 'dungeon_crypt')
  palette: [0x0d1620, 0x2a3a52, 0x39d0c4, 0xb9c6d8, 0xd6dfae, 0x86c93a, 0x3a1245, 0xd09a3c], tint: 0x7f93b0,
};

const S = (id: string, x0: number, x1: number, z0: number, z1: number, dir: string, y0: number, y1: number) => ({ id, rect: [x0, x1, z0, z1], dir, y0, y1 });   // YSP-16 strip helper

const ROOMS: RoomDef[] = [                                                              // last argument: { floorY, ceiling } (YSP-16)
  room('giris', 'Ağ Kapısı Girişi', 2, 45, 9, 8, 'stone_dark', 'cave', 0.3, { floorY: 10, ceiling: 30 }),
  room('kopru', 'Yarık Köprüsü', 11, 47, 5, 4, 'stone_dark', 'cave', 0.2, { floorY: 10, ceiling: 26 }),
  room('teller', 'Parçalanmış Teller', 16, 40, 14, 14, 'dirt', 'cave', 0.4, { floorY: 4, ceiling: 30, strips: [S('h1', 16, 19, 46, 50, 'e', 10, 4), S('h2', 17, 19, 40, 41, 'n', 4, 7), S('h3', 25, 27, 40, 41, 'n', 4, 7)] }),
  room('ixin_oyugu', 'Iksin Odası', 16, 34, 6, 6, 'stone_dark', 'cave', 0.25, { floorY: 7, ceiling: 10 }),
  room('nakt_oyugu', 'Nakat Odası', 24, 34, 6, 6, 'stone_dark', 'cave', 0.25, { floorY: 7, ceiling: 10 }),
  room('atik_oyugu', 'Atik Odası', 30, 45, 6, 6, 'stone_dark', 'cave', 0.25, { floorY: 7, ceiling: 10, strips: [S('h4', 30, 31, 46, 49, 'e', 4, 7)] }),
  room('yumurta_odasi', 'Yumurta Kuluçkası', 36, 44, 10, 9, 'dirt', 'cave', 0.25, { optional: true, floorY: 7, ceiling: 12 }),
  room('rampa_bir', 'Ağ Rampası', 30, 40, 4, 3, 'stone_dark', 'cave', 0.15, { floorY: 4, ceiling: 8, strips: [S('h5', 30, 33, 40, 42, 'e', 4, 2)] }),
  room('avanoksa_yuvasi', "Avanoksa'nın Yuvası", 34, 33, 13, 11, 'stone_dark', 'cave', 0.1, { boss: 1, floorY: 2, ceiling: 20 }),
  room('rampa_iki', 'Yukarı Yol', 40, 28, 3, 5, 'stone_dark', 'temple', 0.15, { floorY: 2, ceiling: 9, strips: [S('h6', 40, 42, 28, 32, 'n', 2, 8)] }),
  room('nobet_holu', 'Nöbetçi Holü', 34, 17, 14, 11, 'tiles', 'temple', 0.4, { floorY: 8, ceiling: 24 }),
  room('ag_gecidi', 'Ağ Geçidi', 30, 28, 10, 3, 'dirt', 'cave', 0.15, { skip: true, floorY: 6, ceiling: 7, strips: [S('h7', 30, 33, 28, 30, 'w', 6, 5)] }),
  room('laboratuvar', 'Hasat Laboratuvarı', 21, 17, 13, 11, 'stone_dark', 'brick', 0.4, { floorY: 5, ceiling: 14, strips: [S('h8', 31, 33, 20, 23, 'w', 8, 5), S('h9', 24, 28, 17, 20, 'n', 5, 11)] }),
  room('anubzek_terasi', 'Yankı Seyir Terası', 21, 4, 13, 13, 'temple', 'temple', 0.1, { boss: 2, floorY: 11, ceiling: 0 }),   // ceiling 0 = open (void backdrop)
  room('tunel', 'Kara Kan Tüneli', 34, 8, 6, 3, 'stone_dark', 'forge', 0.2, { floorY: 11, ceiling: 8, strips: [S('h10', 34, 39, 8, 10, 'e', 11, 7)] }),
  room('kan_hatti', 'Kara Kan Hattı', 40, 4, 12, 10, 'stone_dark', 'forge', 0.35, { floorY: 7, ceiling: 16 }),
  room('dron_kogusu', 'Dron Koğuşu', 48, 14, 8, 8, 'dirt', 'cave', 0.3, { floorY: 7, ceiling: 12 }),
  room('kikatal_deposu', 'Alt Depo', 48, 22, 15, 14, 'stone_dark', 'forge', 0.1, { boss: 3, floorY: 3, ceiling: 22, strips: [S('h11', 50, 53, 22, 24, 's', 7, 3)] }),
];

const DOORS: DoorDef[] = [
  door('giris', 'kopru', 10, 48, 'e', 2, 'none'),
  door('kopru', 'teller', 15, 48, 'e', 2, 'none'),
  door('teller', 'ixin_oyugu', 18, 40, 'n', 2, 'none'),
  door('teller', 'nakt_oyugu', 26, 40, 'n', 2, 'none'),
  door('teller', 'atik_oyugu', 29, 47, 'e', 2, 'none'),
  door('atik_oyugu', 'yumurta_odasi', 35, 47, 'e', 2, 'none'),
  door('teller', 'rampa_bir', 29, 41, 'e', 2, 'none'),
  { ...door('rampa_bir', 'avanoksa_yuvasi', 33, 41, 'e', 2, 'boss_lock'), requires: ['yk_p07', 'yk_p08', 'yk_p09'] },   // YSP-03
  door('avanoksa_yuvasi', 'rampa_iki', 40, 33, 'n', 2, 'boss_exit'),
  door('rampa_iki', 'nobet_holu', 40, 28, 'n', 2, 'none'),
  door('nobet_holu', 'laboratuvar', 34, 21, 'w', 2, 'none'),
  door('rampa_iki', 'ag_gecidi', 40, 29, 'w', 2, 'none'),
  door('ag_gecidi', 'laboratuvar', 31, 28, 'n', 2, 'none'),
  door('laboratuvar', 'anubzek_terasi', 26, 17, 'n', 2, 'boss_lock'),
  door('anubzek_terasi', 'tunel', 33, 9, 'e', 2, 'boss_exit'),
  door('tunel', 'kan_hatti', 39, 9, 'e', 2, 'none'),
  door('kan_hatti', 'dron_kogusu', 49, 13, 's', 2, 'none'),
  door('dron_kogusu', 'kikatal_deposu', 51, 21, 's', 2, 'boss_lock'),
];

const BOSSES = [
  bossAt('boss_avanoksa', 'avanoksa_yuvasi', 40.5, 37, -90, 1),
  bossAt('boss_anubzek', 'anubzek_terasi', 27, 7, 0, 2),
  bossAt('boss_kikatal', 'kikatal_deposu', 55, 31.5, 180, 3),
];

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(6.5, 47),
  shrines: [{ type: 'shrine_power', pos: pt(28.3, 52.2) }, { type: 'shrine_haste', pos: pt(22.2, 26.2) }],
  riftSpots: ([[20, 50], [26, 46], [41, 22], [32.5, 26.5], [46, 8], [52, 18]] as [number, number][]).map(([x, z]) => pt(x, z)),
  chests: [{ pos: pt(44, 51), kind: 'chest_wood' }],
};

export const YANKI_AGI: DungeonDef = {
  id: 'yanki_agi', name: 'Yankı Ağı', shortName: 'Yankı', lore: LORE_TR,           // text of section 1
  levelRange: [60, 60], timerSec: 1680, forcesRequired: 405, endgame: true,          // YSP-02 (reached through the Kuzgunkale portal until YK-D6)
  theme: THEME, grid: { w: 64, h: 56 },
  rooms: withProps(ROOMS.map((r) => ({ ...r, ...ROOM_EXTRA[r.id] })), D.out), doors: DOORS,
  packs: PACKS.map((p) => (PACK_EXTRA[p.id] ? { ...p, ...PACK_EXTRA[p.id] } : p)), bosses: BOSSES,
  start: { pos: shPt(4, 49.5), facing: 90 }, exit: { pos: shPt(55, 34) }, extras: EXTRAS,
  icon: '/assets/icons/dungeon-yanki.svg', loadingImage: '/assets/ui/loading/yanki_agi.webp',
};
```

### 8.6 Assumptions and open points

* **Karakır dependency (section 7).** The world entrance waits for the Karakır layout; the dungeon itself ships through the Kuzgunkale portal. Open: confirm with the other Season 1 docs whether Karakır gets a third entrance or a Season 1 map holds all eight.
* **Heightfield engine.** Verticality needs the section 13 engine package (NavGrid heights, `World.groundY`, hit-shape rule, fall plane). Until it lands the dungeon can be built flat (`floorY` read as 0, strips ignored) with the same grid; the elevation pass is then data only (YSP-16). The 10-11 m ledge, the 16.7 degree `rampa_iki` and the 20.6 degree grand stairs are the only slopes to check against the nav ramp limit.
* **Route A-100 skips.** p01 (bridge), p11 (rampa_iki) and p21 (tunel) sit in narrow rooms and are skipped by patrol timing, not by distance; they can only pull by accident and then simply add forces (section 6.1). If playtests show them unskippable, route A-100 becomes 440-450 forces (about 109%) and the timer rows grow by about 0:45.
* **Elden Ring layer numbers.** Poise values (140 / 260 / 180 elites, 400 minibosses, 900 raid bosses), the 1.3-1.4 s hold of the last string hit, the 1.5 s winded window and the Doyum / Yankı / Kovan item numbers are first-pass placeholders for SimBench; `chain` and `leap` (YSP-17) are new code.
* `params.target = 3` ("random non-tank") and the `persist` / `minRange` ability params were read from `shade_nightmare`, `EnemyAI.persistShape` and `EnemyAI.usable`; verify while transcribing. `params.once` is supported (`EnemyAI.ts:874`), `params.ranged` is new (YSP-08).
* Kibirli (`CORE_MECHANICS` section 6) is not in `mythicAffixes.ts` yet (CM7); this doc assumes it uses the same six rift spots and spawn rule as Efsunlu Yarık, with the 20 / 40 / 60 / 80% thresholds (pulls 4 / 7 / 10 / 12 on route A-100).
* Deliberate departures from the live dungeon are all in the section 1 table (Locust Swarm cloud, Burrow Charge at 11 m, poisons that always erupt, 2 s Erupting Webs stun, the invented Kan Kancası, the new healer and the Elden Ring layer); everything else in 5.1-5.3 follows the research file's mechanics (Insatiable uses the Season 3 figure of 30%).
* Timer, forces and HP are design targets, to be tuned in the SimBench AoE8 profile and one playtest.

---

## 9. Rejected critique

* **Fix 2, line-of-sight check on Alarm Çığlığı:** rejected. The call is limited to the same room and 25 m, so a line-of-sight test adds cost without changing any pull (inside one room the walls are open pillars and arches); the rest of the fix (`once: 1`, cooldown 99, same-room rule, 6.3 text) is applied.
* **Fix 3, option "move the p15 patrol":** rejected. The hall is 11 tiles deep with Boynuzkabuk aggro 14 m, so no patrol line inside it clears p12 and p13; option one (count p15 in pull 7, route A-100 = 421) is applied.
* **Fix 5(a), exact Burrow Charge damage:** the radius is raised to 11 m (13 yd), but the coefficient drops from 3.0 to 2.4 so a hit that now catches more players stays survivable; the two-strike pattern is kept.
* **Fix 5(d) and 5(e), restore the unavoidable Locust Swarm channel and the 3 s Erupting Webs stun:** rejected as a design choice (an un-dodgeable channel and a 3 s stun are bad ARPG feel); both are kept as listed departures in the section 1 table so reviewers can see them.
