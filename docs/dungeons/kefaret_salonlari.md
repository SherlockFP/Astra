# Kefaret Salonları (`kefaret_salonlari`): Season 1 Mythic+ dungeon design

WoW model: **Halls of Atonement** (Shadowlands, Revendreth). Research: `docs/ref/dungeons/sl-tww.md`. Engine contracts: `src/types/dungeons.ts`, `src/world/DungeonBuilder.ts`, `src/data/dungeons/kit.ts`, `src/ai/bosses/kit.ts`, `src/combat/poise.ts`, `docs/GDD_CONTENT.md` (§0 conventions, §5 M+), `docs/CORE_MECHANICS.md` §6 (pool rule), §13 (verticality), §15 (loot), §16 (creatures).

**Status:** design, implementation-ready. Docs only; no code was touched. Author role: Sonnet (art + design), to be implemented by Haiku coders after the shared primitives of section 8 exist. **Revision 2** (this file replaces revision 1 in place): (a) the eight critic issues are fixed (see "Rejected critique" in section 9 for the ones that were not taken as written), (b) the five binding user requirements are in: seven height levels with stair strips, a chasm bridge and an elevation drawing (section 3), four bosses with Elden-Ring-style move sets on top of the WoW mechanics and a posture window each (section 5), 13 trash definitions with 2 to 4 telegraphed attacks each (section 4), a per-room set-dressing sheet for all 18 rooms (section 3.8) and three named personal-loot items per boss (section 5.5). The room, door, stair, pack and boss-placement data in sections 3 and 4 was produced by a validation script (no room overlaps, every door tile on a real shared edge, every door joins two floors of equal height through a stair strip, every stair rises at most 1.2 m per tile, every pack member stands inside its room and, on the bridge, on walkable tiles, every room reachable from the start, forces sums 493 / 393 / 76 / 24). Paste it as is.

**How to read the tags.** `EXISTS` = built from systems that are in the repo today. `NEW` = needs a new primitive, listed in section 8 (P1 to P21). Coordinates are GDD continuous tile coordinates (`world = (c + 0.5) * 4 m`, `n = -Z`, facing 0 = +Z / south). Integer `rect` values are tile-corner based. Heights are metres above the dungeon datum (the start courtyard is 0.0).

**Scale rules to remember.** KayKit dungeon pieces are 4 m tiles and 4 m walls (scale 1). Kenney kits (`kg`, `kc`, `kn`, `ks`) are tiny (a gravestone is about 1 m), so use scale 3 to 4 like `kg('altar-stone')` at scale 3 in `kemik_mahzeni.ts`. `itch/psx-dungeon` pieces are 4 m native (scale 1). `itch/nocturnal-watch` church and tower are building-sized (church 12 x 13.6 x 19 m, tower 12 x 30 m). KayKit characters are native 2.4 m, Quaternius monsters use the x 4/3 scale of GDD_CONTENT §3.

---

## 1. Identity

| field | value |
|---|---|
| id | `kefaret_salonlari` |
| Ad (TR) / short | Kefaret Salonları / Kefaret |
| WoW model | Halls of Atonement: gothic cathedral-court of the Venthyr, sinstones, gargoyles, Stoneborn soldiers, four-boss linear climb ending with the Lord Chamberlain and his four statues |
| Level / modes | level 60. **Season 1 Mythic+ pool**: offered on **Mitik 0** and **Mitik+** only (the four levelling dungeons keep Normal / Kahramanlık). `levelRange: [60, 60]` |
| Bosses | 4: Halkor, Ekelon, Alyez, Velkaan (order 1 to 4, strictly linear). Every boss has a WoW kit plus 3 Elden-Ring-style moves, a posture bar and a punish window (section 5) |
| Trash | 13 definitions: 12 attacking types (2 to 4 telegraphed attacks each) + 1 neutral set-piece entity; roles: 2 kick-casters, 1 healer, 3 brutes, 1 swarm, 1 beast, 1 flanker, 1 buffer-shooter, 2 elites with a posture bar |
| Verticality | **7 height levels** (0.0, 0.6, 2.4, 3.6, 4.2, 8.4, 14.4 m), 9 stair strips, 1 chasm bridge, hall ceilings 12 to 30 m, total climb 14.4 m (section 3.2, elevation in 3.2c). Lifts are not used (the WoW dungeon has none) |
| M+ timer | **29:00 (1740 s)** for 5 players (was 28:00; the stair climbs add about 40 s of walking, section 6.1). +2 at <= 23:12 (1392 s), +3 at <= 17:24 (1044 s) |
| enemy forces for 100% | **380** |
| forces available | **493** (129.7%): mandatory 393 (103.4%) + route-B passage 24 + optional rooms 76. Slightly above the 122-126% guideline on purpose: route choice is part of the design |
| grid | **64 x 64 tiles** (256 x 256 m), 18 rooms, 18 doors, 9 stair strips, 34 packs, 4 bosses |
| enemy level | 60 (Mitik 0 and M+) |
| entrance | Kadim Diyar, Kefaret Tepesi (section 7) |
| music | `dungeon_shadow` (stand-in track) + boss tracks, mood in section 2.12 |

**Fantasy (one paragraph).** A cathedral that was built to save the proud. Souls that carried too much Kibir (pride) in life were brought here to be judged, their sins carved into black sinstones, and their anima poured into golden Kefaret Kapları until they were light enough to rise. Under Baş Kamarar Velkaan the ritual was inverted: nothing is absolved any more, the sins are only harvested. The sinstones grew into a golem, the Stoneborn guards turned to stone around their posts, the dredgers of the garden rot in their own muck, and every night the bell tolls for souls that will never be forgiven. You climb stair after stair, from the forecourt, through the gallery, down into the sunken sinstone pit, up the colonnade to the gargoyle terraces, over a bridge above the quarry and up the grand staircase to end the harvest in the Chamberlain's hall, under four weeping statues and a red window.

**Lore hook into Kadim Zindanlar.** Kadim Diyar (the 45 to 60 zone, GDD_OPENWORLD §1) holds the Kadim Kale citadel in its north-centre; Kefaret Tepesi is the hill east of it. The Kadim Anahtar Taşı keystones are shards of the same judgement stone: the Salonlar are where the old Kadim Meclis weighed souls, so the keystone that opens this dungeon is literally a sinstone. This season's seasonal affix **Kibirli** (Kibir Tecessümü spawns at 20 / 40 / 60 / 80% forces, CORE_MECHANICS §6) is the same story told live: the Kibir Tecessümü is a prideful soul escaping a cracked sinstone, and in this dungeon it rises out of one of four dedicated sinstone cracks (section 6.5).

**Loading screen text (TR, `DungeonDef.lore`).**
> Kadim Diyar'ın kızıl tepelerinde, Kefaret Salonları yüzyıllarca kibirli ruhları arındırmak için kullanıldı: yargılanan ruhlar Günah Taşları'na mühürlenir, tövbe edenler Kefaret Kapları'ndan yeniden doğardı. Ta ki Baş Kamarar Velkaan salonları ele geçirip ruhları arındırmak yerine kibirlerini hasat edene kadar. Şimdi taşlar canlanıyor, bekçiler taşlaşıyor ve Kadim Anahtar Taşı bu karanlık katedralin kapısını açıyor.

**Loading screen image (one line).** A black-violet cathedral on a blood-red overcast hill at dusk, a vast pointed gate glowing crimson at the top of a curved stair, two gargoyles on plinths in the foreground, golden candle points below and a single bell tower against a bruise-purple sky.

**Recommended route (full table in section 6.1).**

* **Route A (standard, 393 forces = 103.4%):** Narthex, Sinstone Gallery, the three shard chambers, Halkor (sunken pit), west colonnade, Gargoyle Courtyard, Ekelon (terrace, click door), Lament bridge, Alyez, Grand Staircase (two Sigar packs), Velkaan. Skips both optional rooms.
* **Route B (394 forces = 103.7%):** same, but takes the **Archive** after the east shard chamber (+40), the **Hizmetkâr Geçidi** instead of the courtyard (-99 +24), and the **Pişmanlık Mahzeni** crypts after Ekelon (+36). Less fighting in the dense courtyard, more walking.

---

## 2. Art direction (as close to Halls of Atonement as the engine allows)

### 2.1 What to copy from the WoW dungeon

* **Gothic ecclesiastical stone**, dark, bone-carved, with **crimson accents** (banners, carpets, glowing sinstone) and **gold** candle pools. The mood is perverted ritual and decay, not open horror (reference file: "decay and perverted ritual").
* **Verticality** (real, CORE_MECHANICS §13): the whole dungeon is a 14.4 m climb over seven height levels (forecourt, steps, a sunken rotunda, colonnade, terraces, the terrace over the quarry drop, a bridge, the grand staircase), built with `RoomDef.floorY`, stair strips and ceilings of 12 to 30 m in the halls (P17, P11). On top of the real heights the halls read taller still with non-walkable upper galleries (balconies at 8 to 17 m), hanging chandeliers on 10 to 14 m chains, tall banners, light shafts, stained glass and distant tower silhouettes (P19).
* **Sinstones** everywhere: tombstone-like black-violet slabs carved with names and sins, glowing red along cracks. They are the visual language of the dungeon (shards, statues, Halkor himself, the gallery rows).
* **Gargoyles** on plinths in the courtyard and over the gate. **Stoneborn** soldiers look chiselled and grey. **Gargons** are chiselled night-hounds. **Dredgers** are crude muck figures. Spirits are translucent. Inquisitors wear red.
* **Checkerboard marble** nave and halls (our `tiles` floor with `checker 0.72`) under high arched windows (our `temple` wall style has `wall_archedwindow_open`).

### 2.2 Palette

| # | name | hex | use |
|---|---|---|---|
| 1 | Venthyr crimson | `#8E1B24` | banners, carpets, wall accent bands, Inquisitor robes |
| 2 | Sinlight red | `#C8382F` | all glows: shard cracks, rune rings, braziers, Velkaan magic, boss telegraph accents |
| 3 | Cold cathedral stone | `#4E4B55` | base of walls and floors (reached through the theme tint) |
| 4 | Sinstone black-violet | `#1D1826` | sinstones, shards, golem body, deep shadow, fog base |
| 5 | Bone ivory | `#D7CDBA` | light marble squares, candles, bone carving, Reaver trim |
| 6 | Dredger muck | `#3E3A22` | Groundskeeper pools, courtyard beds |
| 7 | Anima gold | `#C9A24A` | candle pools, trim, Kefaret Kapları, Alyez emissive |
| 8 | Window moon-blue | `#6E7FA8` | high-window light shafts, outdoor hemisphere sky |
| 9 | Ember orange | `#E0742A` | stained-glass amber, torch warmth (rare accent, 1 in 8 lights) |
| 10 | Plum haze | `#2A2038` | outdoor fog and background (courtyard, terrace) |

Colour discipline: at any point the screen should read "grey-violet stone, one red, one gold". Blue only from windows.

### 2.3 Theme (`DungeonTheme`)

```ts
const THEME: DungeonTheme = {
  fogColor: 0x1d1626, fogNear: 10, fogFar: 46,           // fog colour = background; dark plum, readable at the start room
  ambient: 0x4a3f58, ambientIntensity: 0.42,
  hemiSky: 0x6e7fa8, hemiGround: 0x2a1418,                // cold window light above, dried blood below
  torchColor: 0xffa86a, bloomStrength: 0.45,
  music: 'dungeon_shadow',
  palette: [0x1d1826, 0x4e4b55, 0x8e1b24, 0xc8382f, 0xc9a24a, 0xd7cdba],
  tint: 0xcdbfd0,                                         // multiplies the KayKit textures: mauve-grey stone
};
```

Room overrides (`RoomDef.fog`, `RoomDef.lightColor`, section 2.5) make the courtyard and the terrace feel outdoors.

### 2.4 Materials and textures

| surface | choice | reason |
|---|---|---|
| walls (cathedral rooms) | `wall: 'temple'` (tint 0xb4a4d6 x theme tint = mauve-grey, variants wall / pillar / arched / archedwindow_open) | gives gothic arched windows for free |
| walls (courtyard, terrace, chambers) | `wall: 'stone'` | plainer, outdoors |
| walls (archive) | `wall: 'brick'` (warm tint 0xe6c4aa) | the one warm room, parchment feel |
| walls (servants) | `wall: 'brick'` | humble masonry |
| floors | `tiles` (checker 0.72) in narthex, colonnade, nave, stairs, Kamarar hall = black and bone marble; `stone_dark` in gallery, chambers, crypt, arena; `stone` in courtyard, terrace; `dirt` in the servants' passage | cathedral checker vs rough courtyard |
| red carpets | `ZoneDef` kind `bridge` colour `0x5a1220` (strips, section 3.7) | carpet runner along the nave and stairs |
| muck | `ZoneDef` kind `pool` colour `0x3e3a22` | Groundskeeper beds in the courtyard |
| PSX textures to reuse | `/assets/textures/itch/psx-dungeon/` (`wall-03`, `pillar-01`, `skull-wall`, `door-01/02`, `stair-02`, `ground-04`), `psx-walls-fences` plackard and drystone for garden walls | consistent PSX grain |
| NEW props | 64 x 64 or 128 x 128 palette-dither atlases generated by the existing Blender pipeline (`tools/blender/props/psx_lib.py`, `ptex.py` ramps) | same look as `gen/props` |

### 2.5 Lighting rig

**Global.** Hemisphere `0x6e7fa8` over `0x2a1418`, ambient `0x4a3f58` at 0.42, bloom 0.45. The shadow-casting "moon" directional light (`BuiltDungeon.lighting.moon`) should be cold `0x7f8cc8` at 0.5 from the north-west, high angle (needs optional `DungeonTheme.moon`, P12; until then leave the builder default). Real point lights come from props (`PropPlacement.light`, pooled by `LightPool`): keep at most 14 per room; coloured light lives on props, not on rooms.

| room | `lightColor` | `fog` override (colour, near, far) | key lights (prop lights) | notes |
|---|---|---|---|---|
| giris | `0x8a90c8` | `0x2a2038`, 14, 62 | 4 lamp posts gold `0xffb070` 1.2 / 9 m; Font of Power `0xb070ff` (keystone purple) 1.4 / 8 m | outdoor dusk, two crimson braziers by the north door |
| narteks | `0xffb070` | default | bell chandelier 6 candles gold; 2 wall braziers | warm, first shelter |
| tas_galerisi | `0xd08a70` | default | 4 chandeliers (psx-dungeon) gold 1.0 / 8 m; crimson floor glow at the three side doors `0xc8382f` 1.0 / 6 m | window light shafts moon-blue over the tomb rows |
| kiymik_* | `0xc8382f` | default | shard crimson `0xc8382f` 1.8 / 9 m, flicker off; 4 gold candles | glass-red room, darkest of the first section |
| halkor_cemberi | `0xc8382f` | default | ring runes crimson; 2 chandeliers; sinstone ring glow (zone light) | no dark corners: arena readability |
| arsiv | `0xffc080` | default | shelf candles gold, lots of small lights (cap 8) | warm brick, lore room |
| k_bati | `0xffb070` | default | torches every 3 tiles, light shafts | long colonnade, columns cast shadow |
| gargoyle_avlusu | `0x9a9ac8` | `0x30242e`, 14, 64 | 3 double lampposts gold; moon-blue hemisphere; occasional crimson from gargoyle eyes | outdoor, mist near the ground (`ambient_dust`) |
| servis_gecidi | `0xe0a060` | default | oil lanterns (hw lantern_hanging) | dim, narrow, brick |
| k_ekelon | `0xffb070` | default | 6 braziers up the stairs (crimson flame) | ascent mood |
| ekelon_terasi | `0x8890b8` | `0x3a1c2c`, 16, 70 | hanging braziers crimson, quarry glow `0xc8382f` from the pit edge (zone light), moon-blue key | open air over a drop, haze red-plum, no ceiling feel |
| k_kuzey | `0x8890c0` | default | 4 hanging lanterns gold, crimson glow from the void (zone light), moon-blue key | open-air bridge over the drop, cold, embers rising |
| pismanlik_mahzeni | `0xb8b0e0` | default | pale violet soul lights (`ambient_shadow_wisps`), few gold candles | cold crypt |
| cemaat_nefi | `0xffd090` | default | stained-glass shafts (amber / red / blue) x4, 4 vessels gold `0xc9a24a` 1.4 / 7 m, altar crimson | the most beautiful room; warm gold with blue shafts |
| kefaret_merdiveni | `0xffb070` | default | 2 chandeliers, wall torches, red banners | ascent, brightening toward the top |
| kamarar_salonu | `0xc8382f` | default | red rose window shaft, 4 statue eyes crimson, ritual ring crimson, 6 gold candelabra | crimson dominant, gold secondary |

**Vertical lighting rules.** Chandeliers hang at 55 to 65% of the room's ceiling on chains that reach the ceiling; wall braziers burn at 2.5 to 3.5 m; the first shaft of every hall is moon-blue and falls on the red carpet; rooms get brighter and redder the higher they sit (forecourt plum, gallery warm, nave gold, grand stair and hall crimson); the pit (Halkor) is the only room darker at the bottom than at the top (a single oculus shaft). At most 14 prop lights per room (the sheets of section 3.8 stay under it by sharing lights between props).

### 2.6 Sky and backdrop

Dungeons draw the fog colour as background (no skybox). Two cheap tricks give the "cathedral on a hill" read:

1. **Outdoor rooms** (giris, gargoyle_avlusu, ekelon_terasi, k_kuzey) use the room `fog` overrides above (plum / crimson haze, brighter than interior fog) so they read as open air.
2. **Skyline silhouettes** just outside the wall lines, visible over the 4 m walls: `ip('nocturnal-watch','tower')` (12 x 30 m) x 3 and `ip('nocturnal-watch','church')` scaled 2.2 behind the courtyard and the terrace, tinted `0x2a2038` so they are dark spires in the haze (placed as props at positions outside the room rect; props may sit anywhere). No new engine code.

### 2.7 Landmark set pieces in run order

| # | landmark | room | what the player sees | assets |
|---|---|---|---|---|
| 1 | **Kefaret Kapısı** (outer gate, "the way back up") | giris south wall | a pointed archway with a portcullis and two gargoyles on top, the arrival point | NEW `kefaret_gate_frame`, 2 x NEW `gargoyle_statue`, `ip('nocturnal-watch','crow')` x3 |
| 2 | **Gargoyle forecourt** | giris | cobbled court, lamp posts, dead trees, fenced tomb beds, 4 gargoyles on plinths, the Font of Power (Kehanet Taşı) with a crimson rune ring | `gp('font_of_power')`, `gp('lamp_post')`, `hw('tree_dead_medium')`, `kg('iron-fence')`, NEW gargoyles |
| 3 | **Çan Kemeri** (Bell of Rebuke arch) | narteks | a giant bronze bell hanging in a pointed arch above the door to the gallery; it tolls (ambient SFX) every pull of the first pack | NEW `bell_of_rebuke`, `gp('chains_hanging')`, `ip('psx-dungeon','arch')` |
| 4 | **Günah Taşı Galerisi** (Sinstone gallery) | tas_galerisi | two long rows of black tomb-slabs carved with sins, moon-blue light shafts, chandeliers; the three side doors glow crimson | NEW `sinstone_tomb` x 12, `ip('psx-dungeon','chandelier')`, `gp('statue_hooded')` mourners |
| 5 | **Mühür odaları** (shard chambers) | kiymik_* | a small chamber with one huge glowing shard on a dais, runes on the floor | NEW `sinstone_shard`, `gp('crystal_purple')` tinted, runes |
| 6 | **Halkor Çemberi** | halkor_cemberi | a circular glass-and-sinstone floor with a glowing red ring and twelve shards around, a mound of black stone in the middle that stirs when the third shard dies | zones (rune + dais), NEW `sinstone_shard` ring, `gp('rock_large')` tinted |
| 7 | **Batı Kolonadı** | k_bati | an 80 m colonnade of checker marble under a row of arched windows, red banners | `dg('pillar_decorated')`, `dg('banner_patternC_red')` |
| 8 | **Gargoyle Avlusu** | gargoyle_avlusu | a walled courtyard of fenced tomb beds, mist, muck pools, eight gargoyles, an old well and two bell towers on the skyline | NEW gargoyles, `kg('iron-fence')` x3 scale, `ip('nocturnal-watch','well')`, `ip('nocturnal-watch','tower')` backdrop |
| 9 | **Gözcü Merdivenleri** | k_ekelon | a broad stair hall with crimson-flame braziers rising to the terrace door ("click door") | the S7 flight built by the builder (P17), `gp('brazier')`, NEW `gothic_door` |
| 10 | **Gözcü Terası** | ekelon_terasi | an open-air terrace over the glowing sinstone quarry, kneeling Stoneborn statues, hanging braziers, a pit edge along the north side | pit zone, `ip('psx-dungeon','chain')`, frozen Knight/Barbarian statues (`PropPlacement.pose`) |
| 11 | **Cemaat Nefi** | cemaat_nefi | a long nave of pews, a red carpet to the altar, stained-glass shafts, four golden Kefaret Kapları in alcoves | `ip('nocturnal-watch','church_bench')` x14, `ip('nocturnal-watch','church_altar')`, NEW `atonement_vessel` x4, NEW `stained_glass_window` |
| 12 | **Kefaret Merdiveni** | kefaret_merdiveni | a grand stair with red runner, chandeliers, banners; the sense of finally reaching the top | `dg('stairs_wide')`, `ip('psx-dungeon','stairs_ultrawide')`, red carpet zones, `dg('banner_patternC_red')` |
| 13 | **Kamarar Salonu** | kamarar_salonu | a round-feeling hall: rose window glowing red, a ritual ring and dais in the centre, four giant weeping statues, gold candelabra | NEW `sinstone_statue` x4, NEW `rose_window`, `gp('altar')`, `dg('candle_triple')` ring |
| 14 | **Çukura İniş** (descent into the pit) | halkor_cemberi | a 32 m wide ceremonial stair (S4) goes down 1.8 m into a domed rotunda: the glowing ring, twelve shards, the black mound under one moon-blue oculus shaft, gargoyles on a ring gallery above | S4 strip, NEW `sinstone_shard` x12, `balcony(14)`, P9 shaft |
| 15 | **Ağıt Köprüsü** (Lament bridge) | k_kuzey | a stone bridge over a void that glows red from far below, gargoyle plinths at the corners, hanging chains and lanterns, gothic ribs over the span | `void` zones, NEW `stone_bridge_span`, `gothic_balustrade`, `ip('psx-dungeon','arch')` |
| 16 | **Koro Balkonları** (choir balconies) | cemaat_nefi, tas_galerisi, kamarar_salonu | non-walkable stone balconies at 8 to 11 m with hooded statues and long red banners that make the 20 to 30 m halls read tall | `balcony(n)` (P19), NEW `choir_balcony`, `gp('statue_hooded')` |

### 2.8 Prop list mapped to existing assets

Helper prefixes follow `src/data/dungeons/kit.ts`: `dg` dungeon (KayKit), `hw` halloween, `gp` gen/props, `kg` Kenney graveyard (x3 to x4), `kc` Kenney castle (x3 to x4), `fu` furniture, `ip(pack, path)` itch.

| role | asset (path under `public/assets/models/`) | scale / tint / notes |
|---|---|---|
| pillars | `dungeon/pillar_decorated.glb` (4 m), `itch/psx-dungeon/pillar.glb` (6 m tall, use for gallery and nave), `dungeon/column.glb` | psx pillar scale 1.2 for 7 m nave pillars |
| arches | `itch/psx-dungeon/arch.glb`, `block_arch.glb`, `halloween/arch.glb`, `arch_gate.glb` | doorways, Bell arch |
| doors / frames | `itch/psx-dungeon/door_frame_01.glb`, `door_01/02/03.glb`, `itch/psx-medieval/decoration/door_stone_double.glb` | Ekelon door, vessel alcoves |
| windows | `itch/psx-dungeon/windowed_wall_01/02.glb`, wall variant `wall_archedwindow_open` (automatic in `temple` walls), `itch/psx-medieval/decoration/window_rounded.glb` | plus NEW stained glass overlay |
| stairs | `itch/psx-dungeon/stairs_ultrawide.glb` (4 x 2 x 12), `stairs_wide.glb`, `dungeon/stairs_wide.glb`, `kenney/castle-kit/stairs-stone-square.glb` (x3) | entrance, grand stair |
| chandeliers | `itch/psx-dungeon/chandelier.glb` (3.5 x 2.9 m, hangs down from y), `itch/nocturnal-watch/tavern_chandelier.glb` | hang at `y: 4.2`, gold candle light |
| chains | `gen/props/chains_hanging.glb`, `itch/psx-dungeon/chain.glb`, `itch/nocturnal-watch/tavern_chain.glb` | `y: 4` |
| braziers | `gen/props/brazier.glb` (crimson light override `lt(0xc8382f, 2.0, 10)`), `kenney/graveyard-kit/fire-basket.glb` x3 | |
| lamp posts | `gen/props/lamp_post.glb`, `kenney/graveyard-kit/lightpost-double.glb` x3 | courtyard |
| altar | `gen/props/altar.glb` (red cloth and candles already), `itch/nocturnal-watch/church_altar.glb`, `kenney/graveyard-kit/altar-stone.glb` x3 | nave altar, hall dais |
| pews | `itch/nocturnal-watch/church_bench.glb` (3 x 1.3 m), `halloween/bench_decorated.glb` | nave |
| statues | `gen/props/statue_hooded.glb` (1.7 x 3.4 m): mourners, scale 1.2 tint 0x6a6878 | plus NEW giant statues |
| tombs / graves | `kenney/graveyard-kit/gravestone-*`, `cross-column`, `pillar-obelisk`, `crypt-large*` (x3), `halloween/crypt.glb`, `grave_A/B`, `gravemarker_A/B`, `gen/props/gravestone_a/b/c`, `sarcophagus.glb` | gallery filler and courtyard beds |
| fences | `kenney/graveyard-kit/iron-fence*` (x3), `itch/nocturnal-watch/church_fence.glb`, `halloween/fence_gate.glb` | courtyard garden beds |
| trees | `halloween/tree_dead_large/medium/small.glb`, `gen/props/tree_dead.glb` | |
| banners | `dungeon/banner_patternC_red.glb`, `banner_triple_red`, `banner_thin_red`, `banner_shield_red`, `banner_red` | crimson, never other colours |
| carpets | `furniture/rug_rectangle_A.glb` (tinted `0x8e1b24`, scale 3 to 4) or the `bridge` zone strips | |
| candles | `dungeon/candle_triple.glb`, `candle_lit.glb`, `halloween/skull_candle.glb`, `shrine_candles.glb`, `plaque_candles.glb` | |
| vessels (stand-in) | `kenney/graveyard-kit/urn-round.glb` (x4, tint gold) until NEW `atonement_vessel` exists | |
| sinstone (stand-in) | `gen/props/crystal_purple.glb` tint `0x1d1826` + emissive `0xc8382f`, `gen/props/lobby_obelisk.glb` tint dark | until NEW `sinstone_*` exist |
| Font of Power | `gen/props/font_of_power.glb` | |
| ornament | `gen/props/keystone.glb` (dark orb with glow) as a small sinstone relic on altars | |
| skyline | `itch/nocturnal-watch/tower.glb`, `church.glb` | outside the walls, tinted `0x2a2038` |
| birds | `itch/nocturnal-watch/crow.glb` (static) | on gargoyles and the gate |
| quarry / rubble | `dungeon/rubble_large.glb`, `rubble_half.glb`, `gen/props/rock_cliff.glb`, `pillar_broken.glb` | terrace and Halkor mound |
| chests | `gen/props/chest_gold.glb` (archive), `chest_wood.glb` | |

### 2.9 NEW props to build in Blender (existing pipeline: `tools/blender/props/`, `psx_lib.py`, `props_dungeon.py` / `props_special.py`, output `public/assets/models/gen/props/`)

| name | size (m, W x H x D) | look (one line) | notes |
|---|---|---|---|
| `sinstone_shard` | 2.4 x 4.2 x 2.0 (variants S 1.0 high, M 2.2, L 4.2) | jagged black-violet tomb-slab shard cracked with glowing red seams and carved name-lines | emissive map for the cracks, `light_0` node crimson; used as decor and as the visual of `kef_shard` PROC |
| `sinstone_tomb` | 1.6 x 2.2 x 0.5 | upright tombstone slab, arched top, rows of carved sins, faint red glow in the carving | gallery rows; 2 variants (intact, cracked) |
| `sinstone_statue` | 2.6 x 6.0 x 2.2 | a weeping robed giant in black sinstone, hands over its face, red glow behind the fingers | Velkaan's four statues; node `fx_eyes` and `fx_beam` (beam origin) |
| `gargoyle_statue` | 1.8 x 2.6 x 1.8 on a 0.8 m plinth | a crouching horned stone beast with folded wings, eyes glow red | also the visual of dormant Stoneborn hounds if wanted; 2 poses |
| `bell_of_rebuke` | 3.0 x 4.2 x 3.0 | bronze bell with a rope and chain, hung in an iron frame, cracked crown | node `bell` swings on a tween, sfx hook |
| `atonement_vessel` (Kefaret Kabı) | 1.6 x 2.4 x 1.6 | tall ornate golden urn with a lid and a crown of flame, gold mist inside | nodes `lid_open`, `lid_closed`, `glow`; the boss script toggles by prop id |
| `stained_glass_window` | 3.6 x 6.0 x 0.3 | pointed-arch window, amber / crimson / blue panes in lead lines | emissive panes; wall-mount; plus additive `lightshaft` child |
| `rose_window` | 7.0 x 7.0 x 0.4 | circular red rose window, gold tracery, a crown-and-thorn emblem | Kamarar hall back wall |
| `kefaret_gate_frame` | 14 x 12 x 4 | a pointed gothic archway, flanking pillars with gold trim and crimson lanterns, a red crystal on top, portcullis recess | entrance set piece and giris south wall; holds an `mplus_portal` as the door |
| `gothic_door` | 8 x 6 x 0.8 | double iron-bound door (two 4 m leaves) with a crown-and-thorn emblem, glowing seam | Ekelon's door **and** the door of the 8 m opening: `collide: true`, nodes `leaf_l` / `leaf_r` for the `open` / `close` animation, `id: 'ekelon_door'`, tag `gate` (section 3.5 M4) |
| `sinstone_ring_floor` (decal mesh) | 44 x 0.02 x 44 | thin ring of red glyphs for Halkor's boundary | can be done with a `ZoneDef` rune ring instead; optional |
| `choir_balcony` | 8 x 3.2 x 2.4 | stone balcony module with a carved front, tracery and a corbel row; the next module continues the balustrade | upper galleries (decor, `collide: false`, P19) at y 6 to 17; variants plain and with a statue plinth |
| `gothic_balustrade` | 4 x 1.1 x 0.4 | pierced stone parapet with posts and quatrefoil panels | bridge and terrace parapets, balcony fronts; 2 variants (intact, cracked) |
| `stone_bridge_span` | 24 x 1 x 12 | the visual skin of the Lament bridge: arched underside, worn paving, a red glow under the arches | floor skin of `k_kuzey` (the walkable tiles stay in the data) |
| `lightshaft` (shared mesh, P9) | 3 x 8 x 3 cone | additive translucent cone, tinted per use | not a Blender asset; a runtime mesh |

All of these follow `tools/blender/props/` conventions: 1 unit = 1 m, +Y up, origin on the ground, palette atlas with ordered dither, `COLOR_0` baked AO, glow nodes named `glow`, `flame`, `light_0` (Decor.ts reads those names).

### 2.10 Enemy models (existing rigs, tint and accessories)

| enemy | rig | tint / emissive | accessories shown | note |
|---|---|---|---|---|
| Yozlaşmış Karabıçak | `characters/Rogue.glb` | `0x5a1822` | `Knife` + `Knife_Offhand` | vampiric servant in crimson-black leather |
| Yozlaşmış Tazıcı | `characters/Rogue_Hooded.glb` | `0x6a2430` | `2H_Crossbow` | hood, crossbow |
| Vahşi Gargon | `gen/creatures/wolf_dire.glb` | `0x6f6c80`, eyes `0xc8382f` | none | chiselled night hound (stone tint, glowing eyes) |
| Yozlaşmış Yok Edici | `characters/Mage.glb` | `0x7a1c2a` | `2H_Staff`, no hat | red-robed caster |
| Yozlaşmış Toplayıcı | `characters/Mage.glb` | `0x3a1a3c` | `2H_Staff` + `Mage_Hat` | dark plum, hat distinguishes it from the Obliterator |
| Anima Rahibi | `characters/Mage.glb` | `0xd8c8a0`, glow `0xc9a24a` | `2H_Staff` + `Mage_Hat` | ivory-gold robe, a golden halo glow: the healer, readable at a glance as "the bright one" |
| Taş Kıyıcı | `characters/Barbarian.glb` | `0x8a8898` | `2H_Axe` | Stoneborn Slasher, stone grey |
| Taşkıran Yağmacı | `characters/Knight.glb` | `0x6a6878` | `1H_Sword` + `Round_Shield` + `Knight_Helmet` | Stoneborn Reaver, heavy |
| Taş Parçalayıcı | `monsters/Orc.glb` | `0x7a788c` | `Orc_Weapon` | Stoneborn Eviscerator, glaive thrower |
| Taş Kemirgen | `gen/creatures/golem_stone.glb` scale 0.4 | `0x5c5a6c`, glow `0xc8382f` | none | Stonefiend Anklebiter, small stone beast |
| Bataklık Bahçıvanı | `monsters/Zombie.glb` | `0x5a5230` | none | muck gardener |
| Engizisyoncu Sigar | `characters/Mage.glb` scale 1.25 | `0x8a1a2a` | `2H_Staff` + `Mage_Hat` | red inquisitor |
| Işkence Gören Ruh | `monsters/Ghost.glb` scale 0.6 | `0xc8c0e0`, opacity 0.5 | none | neutral, pale |
| Halkor | `gen/creatures/golem_stone.glb` scale 1.65 (stand-in) / NEW `gen/bosses/halkor.glb` | `0x3a3048`, emissive `0xc8382f` x0.7 | none | golem of tomb-slabs |
| Ekelon | `characters/Knight.glb` scale 2.0 | `0x7c7a90` | `2H_Sword`, `Knight_Helmet`, `Knight_Cape` | Stoneborn commander |
| Alyez | `gen/bosses/golge_rahibesi.glb` scale 1.25 | `0xb0384a`, emissive `0xc9a24a` x0.6 | built in | hooded judge with tentacle robe |
| Velkaan | NEW `gen/bosses/velkaan.glb` (stand-in: `gen/bosses/kemik_lordu.glb` scale 1.1, tint `0x9a2a3a`, emissive `0xc8382f`) | | | tall noble in a black-red coat and high collar, scepter |

### 2.11 VFX palette

Use the existing ids with colour overrides (`SpawnVfxOpts.color`): sinlight and Velkaan magic `shadow_burst` / `curse_loop` tinted `0xc8382f`; glass shards `frost_burst` tinted `0xe8a0a8`; blood puddles `shadow_ground` tinted `0x8e1b24`; anima gold `holy_burst` / `heal_burst` tinted `0xc9a24a`; souls `ambient_shadow_wisps`, `soul_wisp`; braziers `brazier_fire` crimson; candles `candle_flame`; stone wake-up `death_bones` tinted `0x8a8898` as the crack burst; petrify `stun_stars` tinted `0xaaaabb`; seal `holy_burst` gold plus `shield_bubble`. Floating motes: `ambient_dust` in every shaft. No green, no ice-blue.

### 2.12 Music and ambience

* Dungeon bed: `dungeon_shadow` (`dungeon_dark_shrine_loop.ogg`) layered with `dungeon_ambience_dark.ogg` at low volume. Target mood: slow gothic pipe organ drone, a distant choir, a bell toll every 40 to 60 s (positional SFX at the Bell of Rebuke), whispers of souls in the gallery and crypts.
* Bosses: Halkor `boss_colossus.ogg` (heavy and slow), Ekelon `boss_epic_battle.mp3`, Alyez `boss_great_boss.ogg`, Velkaan `boss_epic_battle.mp3` with `stinger_dark_boss_intro.ogg` on pull. A dedicated gothic-organ track per boss is a later audio job (not blocking).
* Footsteps: `footstep_stone` everywhere, `footstep_dirt` in the servants' passage.

### 2.13 PSX look

Keep the project look: vertex snap and low-res on every NEW asset, nearest-filtered 64 to 128 px atlases, flat-shaded lambert for PROC bodies, no real-time shadows from NEW props (blob shadows), torches flicker 8 to 12 Hz, bloom picks up the emissive crack and window textures only.

---

## 3. Layout (tile grid)

### 3.1 Grid and map

Grid **64 x 64 tiles**. The dungeon spirals counter-clockwise around the Halkor circle: the party enters at the south, climbs north through the first section, turns west for the courtyard and Ekelon (north-west), crosses the north to the nave (Alyez) and ends in the north-east (Velkaan). `z` grows to the south, so the map below is drawn the way the game is: the entrance at the bottom, the finale at the top right.

```
     0         1         2         3         4         5         6   
     0123456789012345678901234567890123456789012345678901234567890123
  0  222222222222222222222222      33333333333333333333
  1  222222222222222222222222      33333333333333333333
  2  222222222222222222222222uuuuuu33333333333333333333
  3  222222222222222222222222uuuuuu33333333333333333333
  4  222222222222B2222222222%%uu.u##3333333333333333333
  5  22222222222222222222222%%uuuu##3333333333333333333
  6  222222222222222222222222uuu.uu33333333333333333333
  7  222222222222222222222222uu++uu333333333333B3333333
  8  222222222222222222222222PP++PP33333333333333333333
  9  222222222222222222222222PPPPPP33333333333333333333
 10  222222222222222222222222PPPPPP33333333333333333333
 11  2222222##222222222222222PPoPPP33333333333333333333
 12  kkkkkkk##kkkkkkk        PPPPPP33333333333333333333
 13  kkkkkkkkkkkkkkkk        PPPPPP333333333333333333%%
 14  kkkk.kkkkkkk.kkk        PPPPPP                  %%mmmmmmmmmmmmmm
 15  k++kkkkkk++kkkkk        PPPoPP                  mmmmmmmm.mmmmmmm
 16  s++sCCCCC++CCCCCCCCCCCCCPPPPPP                  mmmmmmmmmmmmmmmm
 17  ssssCCCCCCCCCCCCCCCCCCCCPPPPPP                  mmmm.mmmmm.mmmmm
 18  ssssCCCCCCCCCCCCC.CCCCCC                        mmmmmmmmmmmmmmmm
 19  ssssCC.CCCCCCCCCCCCCCCCC                        mmmmmmmmmmmmmmmm
 20  ssssCCCCCCCCCCCCCCCCCCCC                        mmmmm.mmmmmm.mmm
 21  ss.sCCCCCCC.CCCCCCCC.CCC                        mmmm##mmmmmmmmmm
 22  ssssCCCCCCCCCCCCCCCCCCCC                        4444##4444444444
 23  ssssCCCCCCCCCCCCCCCCCCCC                        4444444444444444
 24  ssssCCCC.CCCCCCCCCCCCCCC                        4444444444444444
 25  ssssCCCCCCCCCCC.CCCCCCCC                        4444444444444444
 26  ssssCCCCCCCCCCCCCCCCCCCC1111111111111111        4444444444444444
 27  ssssCCCCCCCCCCCCC++CCCCC1111111111111111        4444444444444444
 28  ssssbbbbbbbbbbbbb++bbbbb1111111111111111        4444444444444444
 29  ss.sbbbbbbbbbbbbbbbbbbbb1111111111111111        4444444444444444
 30  sss++bbbbbbbbbbbbbbbbbb%%111111111111111nnnnnnnn44444444B4444444
 31  sss++bbbbbbb.bbbbbb.bbb%%111111111111111nnnnnnnn4444444444444444
 32  ssssbbbbbbbbbbbbbbbbbbbb1111111111111111nnnnnnnn4444444444444444
 33  ssssbbbbbbbbbbbbbbbbbbbb11111111B1111111nnnn.nnn4444444444444444
 34                          1111111111111111nnnnnnnn4444444444444444
 35                          1111111111111111nnnnnnnn4444444444444444
 36                          1111111111111111nnnnnnnn4444444444444444
 37                          1111111111111111nnnn.nnn4444444444444444
 38         wwwwwwwww        1111111111111111nnnnnnnneeeeeeeee
 39         wwwwwwwww        1111111##1111111nn++nnnneeeeeeeee
 40         wwwwwwwwwGGGGGGGGGGGGGGG##GGGGGGGGG++GGGGeeeeeeeee
 41         wwwwwwwwwGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGeeeeeeeee
 42         wwww.wwwwGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGeeee.eeee
 43         wwwwwwww++GGGGGGGGGGGGGGGGGGGGGGGGGGGGGG++eeeeeeee
 44         wwwwwwww++GGGG.GGGGGGG.GGGGGGG.GGGGGGGGG++eeeeeeee
 45         wwwwwwwwwGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGeeeeeeeee
 46         www.wwwwwGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGeeee.eeee
 47         wwwwwwwwwGGGGGGGGGGGGGGG++GGGGGGGGGGGGGGGee++eeeee
 48                              aaa++aaa            RR++RRRRR
 49                              aaaaaa.a            RRRRRRRRR
 50                              aaaaaaaa            RRRoRRRRR
 51                              aaaaaaaa            RRRRRRoRR
 52                              aaa.aaaa            RRRRRRRRR
 53                              aaa++aaa            RRRRRRRRR
 54                          AAAAAAA++AAAAAAA
 55                          AAAAAAAAAAAAAAAA
 56                          AAAAAAAKAAAAAAAA
 57                          AAAAAAAAAAAAAAAA
 58                          AAAAAAAAAAAAAAAA
 59                          AAAAAAASAAAAAAAA
 60                          AAAAAAAAAAAAAAAA
 61                          AAAAAAAAAAAAAAAA
```

Legend: `A` giris, `a` narteks, `G` tas_galerisi, `w` kiymik_bati, `e` kiymik_dogu, `n` kiymik_kuzey, `1` halkor_cemberi, `R` arsiv, `b` k_bati, `C` gargoyle_avlusu, `s` servis_gecidi, `k` k_ekelon, `2` ekelon_terasi, `u` k_kuzey, `P` pismanlik_mahzeni, `3` cemaat_nefi, `m` kefaret_merdiveni, `4` kamarar_salonu. `++` open door, `##` boss_lock door, `%%` boss_exit door, `.` pack centre, `o` optional pack centre, `B` boss spawn, `S` start, `K` Kehanet Taşı (Font of Power).

The plan above does not show heights; the height map and the side elevation are in sections 3.2 and 3.2c.



### 3.2 Rooms and heights

Forces column = sum of the packs placed in the room (section 4.3). **floorY** is the base floor height of the room in metres; where a stair strip is listed the strip interpolates between its two heights and the rest of the room is flat at `floorY`. **Ceiling** is `RoomDef.ceiling` (CORE_MECHANICS §13; `0` = open air, sky backdrop). Rule check: every height step between neighbouring rooms is carried by a stair strip, no step is larger than the 0.45 m walkable step and no stair rises more than 1.2 m per tile.

| id | Ad (TR) | rect x,z,w,h | size (m) | floorY | ceiling | stairs | floor / wall | forces | notes |
|---|---|---|---|---|---|---|---|---|---|
| `giris` | Kefaret Avlusu | 24, 54, 16, 8 | 64 x 32 | **0.0** | open | S1 | stone / stone | - | START, the lowest point. Kehanet Taşı (Font of Power) at (31.5, 56.4). Open-air gargoyle forecourt, brighter fog override. S1 climbs to the narthex door. |
| `narteks` | Günah Nefi | 28, 48, 8, 6 | 32 x 24 | **2.4** | 14 | - | tiles / temple | 27 | Narthex of Sins: Bell of Rebuke arch, first two packs, door into the gallery. |
| `tas_galerisi` | Günah Taşı Galerisi | 16, 40, 32, 8 | 128 x 32 | **2.4** | 20 | - | stone_dark / temple | 40 | Sinstone gallery: two rows of tomb-slabs, an upper balcony (decor, y 8.0) on both long walls, 3 side doors + the boss door. |
| `kiymik_bati` | Batı Mühür Odası | 7, 38, 9, 10 | 36 x 40 | **0.0** | 10 | S2 | stone_dark / stone | 20 | Shard chamber 1, a crypt 2.4 m below the gallery (descend through S2). |
| `kiymik_dogu` | Doğu Mühür Odası | 48, 38, 9, 10 | 36 x 40 | **2.4** | 10 | - | stone_dark / stone | 20 | Shard chamber 2, flush with the gallery. Door south to the optional Archive. |
| `kiymik_kuzey` | Kuzey Mühür Odası | 40, 30, 8, 10 | 32 x 40 | **4.2** | 10 | S3 | stone_dark / stone | 20 | Shard chamber 3 on a raised dais (S3 climbs 1.8 m), next to the arena. |
| `halkor_cemberi` | Halkor Çemberi | 24, 26, 16, 14 | 64 x 56 | **0.6** | 24 | S4 | stone_dark / temple | - | **Boss 1 arena**. A sunken rotunda: the party descends 1.8 m on a wide stair (S4) into the circle. Circular sinstone ring r 22 m, glass floor, dome 24 m. |
| `arsiv` | Günah Taşı Arşivi | 48, 48, 9, 6 | 36 x 24 | **0.0** | 8 | S5 | stone_dark / brick | 40 | optional. Sinstone Archive cellar (S5 descends 2.4 m): dead end, extra forces, chest, lore. |
| `k_bati` | Batı Kolonadı | 4, 28, 20, 6 | 80 x 24 | **3.6** | 12 | S6 | tiles / temple | 27 | West colonnade after Halkor: S6 climbs out of the pit (3.0 m), route fork (courtyard door at x 17, Hizmetkâr door at x 4). |
| `gargoyle_avlusu` | Gargoyle Avlusu | 4, 16, 20, 12 | 80 x 48 | **3.6** | open | - | stone / stone | 99 | Dense gargoyle terrace before Ekelon: the biggest forces block. Rüzgar Sunağı. Terraced garden beds (steps under 0.45 m, decor). |
| `servis_gecidi` | Hizmetkâr Geçidi | 0, 16, 4, 18 | 16 x 72 | **3.6** | 8 | - | dirt / brick | 24 | skip (route B). Servants' passage around the courtyard, flat. |
| `k_ekelon` | Gözcü Merdivenleri | 0, 12, 16, 4 | 64 x 16 | **3.6** to 8.4 | 16 | S7 | stone / temple | 24 | A 4.8 m stair hall under the terrace (the whole room is the stair); both routes meet here; Ekelon's door at its top (8.0, 11.9). |
| `ekelon_terasi` | Gözcü Terası | 0, 0, 24, 12 | 96 x 48 | **8.4** | open | - | stone / stone | - | **Boss 2 arena**. Open-air terrace over the quarry chasm (north rim drop), 96 x 48 m. |
| `k_kuzey` | Ağıt Köprüsü | 24, 2, 6, 6 | 24 x 24 | **8.4** | open | - | stone_dark / temple | 28 | The Lament **bridge**: a T-shaped stone bridge over a void (fall plane). Caster pack on the span, door to the nave, branch to the optional crypt. |
| `pismanlik_mahzeni` | Pişmanlık Mahzeni | 24, 8, 6, 10 | 24 x 40 | **3.6** | 8 | S8 | stone_dark / stone | 36 | optional. Atonement crypts below the bridge (S8 descends 4.8 m): dead end, souls. |
| `cemaat_nefi` | Cemaat Nefi | 30, 0, 20, 14 | 80 x 56 | **8.4** | 30 | - | tiles / temple | - | **Boss 3 arena**. The great nave, 30 m high, a choir balcony (decor, y 11.0) over the pews, four Kefaret Kapları. |
| `kefaret_merdiveni` | Kefaret Merdiveni | 48, 14, 16, 8 | 64 x 32 | **8.4** to 14.4 | 22 | S9 | tiles / temple | 88 | The **grand staircase**: a 6.0 m climb over 7 tiles (S9), two Sigar packs, Reaver + Slasher, patrol. Kudret Sunağı. |
| `kamarar_salonu` | Kamarar Salonu | 48, 22, 16, 16 | 64 x 64 | **14.4** | 30 | - | tiles / temple | - | **Boss 4 arena**. Chamberlain's hall, the highest floor, four statues, rose window, exit portal. |

Height levels in use: **0.0** (forecourt, west crypt chamber, archive), **0.6** (Halkor pit), **2.4** (narthex, gallery, east chamber), **3.6** (colonnade, courtyard, servants, stair-hall foot, crypts), **4.2** (north chamber), **8.4** (terrace, bridge, nave, grand-stair foot), **14.4** (Chamberlain's hall). That is seven levels; the player stands on six of them in route A alone (0.0, 2.4, 0.6, 3.6, 8.4, 14.4).

**Height map** (one character per tile: the digit is the floor level, `0` = 0.0, `1` = 0.6, `2` = 2.4, `3` = 3.6, `4` = 4.2, `8` = 8.4, `F` = 14.4; an arrow is a stair strip and points UP the slope; `:` is void):

```
     0         1         2         3         4         5         6   
     0123456789012345678901234567890123456789012345678901234567890123
  0  888888888888888888888888      88888888888888888888
  1  888888888888888888888888      88888888888888888888
  2  888888888888888888888888::::::88888888888888888888
  3  88888888888888888888888888888888888888888888888888
  4  88888888888888888888888888888888888888888888888888
  5  88888888888888888888888888888888888888888888888888
  6  888888888888888888888888:888::88888888888888888888
  7  888888888888888888888888:888::88888888888888888888
  8  888888888888888888888888^^^^^^88888888888888888888
  9  888888888888888888888888^^^^^^88888888888888888888
 10  888888888888888888888888^^^^^^88888888888888888888
 11  888888888888888888888888^^^^^^88888888888888888888
 12  ^^^^^^^^^^^^^^^^        33333388888888888888888888
 13  ^^^^^^^^^^^^^^^^        33333388888888888888888888
 14  ^^^^^^^^^^^^^^^^        333333                  8888888888888888
 15  ^^^^^^^^^^^^^^^^        333333                  vvvvvvvvvvvvvvvv
 16  333333333333333333333333333333                  vvvvvvvvvvvvvvvv
 17  333333333333333333333333333333                  vvvvvvvvvvvvvvvv
 18  333333333333333333333333                        vvvvvvvvvvvvvvvv
 19  333333333333333333333333                        vvvvvvvvvvvvvvvv
 20  333333333333333333333333                        vvvvvvvvvvvvvvvv
 21  333333333333333333333333                        vvvvvvvvvvvvvvvv
 22  333333333333333333333333                        FFFFFFFFFFFFFFFF
 23  333333333333333333333333                        FFFFFFFFFFFFFFFF
 24  333333333333333333333333                        FFFFFFFFFFFFFFFF
 25  333333333333333333333333                        FFFFFFFFFFFFFFFF
 26  3333333333333333333333331111111111111111        FFFFFFFFFFFFFFFF
 27  3333333333333333333333331111111111111111        FFFFFFFFFFFFFFFF
 28  33333333333333333333<<<<1111111111111111        FFFFFFFFFFFFFFFF
 29  33333333333333333333<<<<1111111111111111        FFFFFFFFFFFFFFFF
 30  33333333333333333333<<<<111111111111111144444444FFFFFFFFFFFFFFFF
 31  33333333333333333333<<<<111111111111111144444444FFFFFFFFFFFFFFFF
 32  33333333333333333333<<<<111111111111111144444444FFFFFFFFFFFFFFFF
 33  33333333333333333333<<<<111111111111111144444444FFFFFFFFFFFFFFFF
 34                          111111111111111144444444FFFFFFFFFFFFFFFF
 35                          111111111111111144444444FFFFFFFFFFFFFFFF
 36                          111111111111111144444444FFFFFFFFFFFFFFFF
 37                          111111111111111144444444FFFFFFFFFFFFFFFF
 38         0000000>>        1111vvvvvvvv1111^^^^^^^^222222222
 39         0000000>>        1111vvvvvvvv1111^^^^^^^^222222222
 40         0000000>>22222222222222222222222222222222222222222
 41         0000000>>22222222222222222222222222222222222222222
 42         0000000>>22222222222222222222222222222222222222222
 43         0000000>>22222222222222222222222222222222222222222
 44         0000000>>22222222222222222222222222222222222222222
 45         0000000>>22222222222222222222222222222222222222222
 46         0000000>>22222222222222222222222222222222222222222
 47         0000000>>22222222222222222222222222222222222222222
 48                              22222222            0^^^^0000
 49                              22222222            0^^^^0000
 50                              22222222            0^^^^0000
 51                              22222222            000000000
 52                              22222222            000000000
 53                              22222222            000000000
 54                          000000^^^^000000
 55                          000000^^^^000000
 56                          0000000000000000
 57                          0000000000000000
 58                          0000000000000000
 59                          0000000000000000
 60                          0000000000000000
 61                          0000000000000000
```

#### 3.2a Stair strips (`RoomDef.stairs`, NEW P17)

A stair strip is a tile rectangle in one room whose height interpolates linearly between `y0` (low end) and `y1` (high end) along `up`; the builder draws a visual flight of steps (0.2 m risers) or a ramp. NavGrid refuses height differences above 0.45 m between neighbouring tiles except inside a strip, so the strips are the only ways between levels. All strips are inside the room that owns the lower floor or the stair feature, and the two ends match the neighbouring floor at the door (validated).

| id | room | rect x,z,w,h | up | y0 (low) | y1 (high) | rise / tile | serves door | look |
|---|---|---|---|---|---|---|---|---|
| S1 | `giris` | 30, 54, 4, 2 | n | 0.0 | 2.4 | 1.20 | giris to narteks | broad cathedral steps, two braziers on the cheeks |
| S2 | `kiymik_bati` | 14, 38, 2, 10 | e | 0.0 | 2.4 | 1.20 | gallery to west chamber | full-height stair down into the crypt |
| S3 | `kiymik_kuzey` | 40, 38, 8, 2 | n | 2.4 | 4.2 | 0.90 | gallery to north chamber | dais steps with a red runner |
| S4 | `halkor_cemberi` | 28, 38, 8, 2 | s | 0.6 | 2.4 | 0.90 | gallery to Halkor | 32 m wide ceremonial stair down into the rotunda (descent set piece) |
| S5 | `arsiv` | 49, 48, 4, 3 | n | 0.0 | 2.4 | 0.80 | east chamber to archive | narrow brick stair into the cellar |
| S6 | `k_bati` | 20, 28, 4, 6 | w | 0.6 | 3.6 | 0.75 | Halkor exit to colonnade | long climb out of the pit, banners on the walls |
| S7 | `k_ekelon` | 0, 12, 16, 4 | n | 3.6 | 8.4 | 1.20 | courtyard / passage to Ekelon door | Gözcü Merdivenleri: 16 m wide, braziers on both sides |
| S8 | `pismanlik_mahzeni` | 24, 8, 6, 4 | n | 3.6 | 8.4 | 1.20 | bridge branch to crypt | steep descent below the bridge |
| S9 | `kefaret_merdiveni` | 48, 15, 16, 7 | s | 8.4 | 14.4 | 0.86 | nave to hall | the grand staircase, 64 m wide, red runner, chandeliers |

Packs may stand on strips (S7 and S9 hold five packs); combat rules of CORE_MECHANICS §13 apply: melee and hit shapes ignore height differences of 2.5 m or less, larger differences miss, ranged needs line of sight. 2.5 m is about 2 tiles (8 m) of the steepest strip, so on a stair fight everyone within 8 m of flight length is hittable; a melee player at the foot of S7 or S9 cannot reach an enemy at the top of the same flight (4.8 m and 6.0 m), which is the intended high-ground rule.

#### 3.2b The Lament bridge (chasm and bridge, `ZoneDef` kind `void`)

`k_kuzey` (tiles x 24 to 30, z 2 to 8, y 8.4) is a bridge over a drop that falls past the terrace level into the red glow of the quarry. Walkable tiles: the main span x 24 to 30, z 3 to 6 (6 x 3 tiles, 24 x 12 m, joins the terrace door at (23, 4) and the nave door at (29, 4)) and the branch x 25 to 28, z 6 to 8 (12 x 8 m, leads to the crypt door at (26, 7) and stair S8). Void zones: `(24, 2, 6, 1)`, `(24, 6, 1, 2)`, `(28, 6, 2, 2)`. Rules: a player who enters a void tile falls (`fall` = 25% max HP, respawn at the last safe tile, CORE_MECHANICS §13); enemies never path into void tiles and are clamped to the walkable nav when knocked back; **no enemy on the bridge has a knockback** (a_p22 and a_p23 hold Darkblade, Obliterator, Collector, Gargons and a Rahip; none of them pushes), and Ekelon's Taş Parçalayan Sıçrayış (knockback 6) never ends within 20 m of the span because the terrace door is behind the boss arena. Visual: stone balustrade, gargoyle plinths at the four corners, chains hanging into the drop, a crimson glow from below (zone light), drifting embers.

#### 3.2c Side elevation of the critical path (route A, one column = one tile of path, one row = 1 m)

```
16 m |
     |
14 m |                                                                                                      /========
     |                                                                                                     /
12 m |                                                                                                    /
     |                                                                                                  //
10 m |                                                                                                 /
     |                                                                                                /
 8 m |                                                       /========================================
     |                                                      /
 6 m |                                                                            ::::::
     |                                                     /
 4 m |                                    ================/                       ::::::
     |                                   /
 2 m |       /==============\          //                                         ::::::
     |      /                \========/
 0 m |======                                                                      ::::::
     +----------------------------------------------------------------------------------------------------------------
      giris   narteks gallery HALKOR [1] colonnade courtyard   TERRACE [2]         bridge NAVE [3]           HALL [4]
            S1              S4        S6                  S7 stairs                                   S9 grand stair
      0.0     2.4             0.6         3.6                  8.4                        8.4                14.4
```

Reading it: you start at the lowest point, climb the cathedral steps (S1) to the 2.4 m level, **sink** into Halkor's rotunda (S4), climb back out through the colonnade (S6) to the 3.6 m terraces, take the Gözcü stair (S7) to the 8.4 m terrace, cross the void on the Lament bridge, fight in the nave and finally climb the 6 m grand staircase (S9) to the 14.4 m hall. Side rooms hang off this line: west chamber 0.0 (S2, below the gallery), north chamber 4.2 (S3, above it), archive 0.0 (S5), crypt 3.6 (S8, below the bridge), servants' passage 3.6 (flat). Ceilings: narthex 14 m, gallery 20 m, rotunda 24 m, colonnade 12 m, stair hall 16 m, nave 30 m, grand stair 22 m, hall 30 m; the courtyard, terrace and bridge are open air.

### 3.3 Doors

All doors are 2 tiles (8 m) wide. A `boss_lock` door leads INTO a boss room (open before the fight, closes 3 s after engage, reopens on kill or wipe, stays closed while a lower-order boss lives). A `boss_exit` door leaves a boss room toward progress (closed until that boss is dead). Both routes meet again in `k_ekelon`, so the terrace has a single boss door and the route fork never breaks boss gating. **The Ekelon `boss_lock` door has no door model of its own: the `gothic_door` prop is its door (section 3.5 M4).**

| a | b | tile (in a) | side | width | gate | height join |
|---|---|---|---|---|---|---|
| giris | narteks | 31, 54 | n | 2 | none | S1 (0.0 to 2.4) |
| narteks | tas_galerisi | 31, 48 | n | 2 | none | flat 2.4 |
| tas_galerisi | kiymik_bati | 16, 43 | w | 2 | none | S2 (2.4 down to 0.0) |
| tas_galerisi | kiymik_dogu | 47, 43 | e | 2 | none | flat 2.4 |
| tas_galerisi | kiymik_kuzey | 42, 40 | n | 2 | none | S3 (2.4 up to 4.2) |
| tas_galerisi | halkor_cemberi | 31, 40 | n | 2 | boss_lock | S4 (2.4 down to 0.6) |
| kiymik_dogu | arsiv | 50, 47 | s | 2 | none | S5 (2.4 down to 0.0) |
| halkor_cemberi | k_bati | 24, 30 | w | 2 | boss_exit | S6 (0.6 up to 3.6) |
| k_bati | gargoyle_avlusu | 17, 28 | n | 2 | none | flat 3.6 |
| k_bati | servis_gecidi | 4, 30 | w | 2 | none | flat 3.6 |
| gargoyle_avlusu | k_ekelon | 9, 16 | n | 2 | none | foot of S7 (3.6) |
| servis_gecidi | k_ekelon | 1, 16 | n | 2 | none | foot of S7 (3.6) |
| k_ekelon | ekelon_terasi | 7, 12 | n | 2 | boss_lock (click door) | top of S7 (8.4) |
| ekelon_terasi | k_kuzey | 23, 4 | e | 2 | boss_exit | flat 8.4, onto the bridge |
| k_kuzey | pismanlik_mahzeni | 26, 7 | s | 2 | none | S8 (8.4 down to 3.6) |
| k_kuzey | cemaat_nefi | 29, 4 | e | 2 | boss_lock | flat 8.4 |
| cemaat_nefi | kefaret_merdiveni | 48, 13 | s | 2 | boss_exit | foot of S9 (8.4) |
| kefaret_merdiveni | kamarar_salonu | 52, 21 | s | 2 | boss_lock | top of S9 (14.4) |

### 3.4 Critical path, optional areas, skips

**Critical path (route A):** `giris` > `narteks` > `tas_galerisi` > (`kiymik_bati`, `kiymik_dogu`, `kiymik_kuzey`: all three shards must die) > `halkor_cemberi` [Boss 1] > `k_bati` > `gargoyle_avlusu` > `k_ekelon` > `ekelon_terasi` [Boss 2] > `k_kuzey` (bridge) > `cemaat_nefi` [Boss 3] > `kefaret_merdiveni` > `kamarar_salonu` [Boss 4] > exit portal.

| area | type | how to reach | what it gives |
|---|---|---|---|
| `arsiv` Günah Taşı Arşivi | optional dead end | door south of `kiymik_dogu` (tile 50, 47), stair S5 down | 40 forces (2 packs), `chest_gold`, lore props, nothing else |
| `pismanlik_mahzeni` Pişmanlık Mahzeni | optional dead end | door south of the bridge (tile 26, 7), stair S8 down | 36 forces (2 packs), soul wisps, lore |
| `servis_gecidi` Hizmetkâr Geçidi | **skip** (route B) | west door of `k_bati` (tile 4, 30) to `k_ekelon` | 24 forces instead of the courtyard's 99 (saves about 75 forces of fighting and roughly 80 m of dense room) |

Route totals are in section 6.1. Both routes land on 103% to 104%, so choosing the skip means committing to both optional rooms.

### 3.5 Set-piece mechanics and how to build them

| # | set piece | what happens | build with |
|---|---|---|---|
| M1 | **Shard awakening (Halkor)** | Three `kef_shard` entities (one per shard chamber) must die. Each death sends a crimson beam from its chamber across the gallery into the rotunda. When the third dies the black mound in the arena rises (3 s, shake, `boss_spawn` VFX) and Halkor engages. | **NEW P3** `BossPlacement.awaken { enemyId: 'kef_shard', count: 3 }`. **Fallback with EXISTS tools only:** in `boss_halkor` `init()` call `c.setImmune(true)` and `c.freeze(true)`, in `update()` count dead `kef_shard` via `c.world.enemies`, on the third call `setImmune(false)`, `freeze(false)`, `bossFx('boss_spawn')`. Hide the mound props by `id: 'halkor_mound'` |
| M2 | **Sin leash (Halkor circle)** | A glowing ring at r 21.2 to 22.4 m marks the boundary. Players outside it (r > 22 m from the arena centre) get `fear` 3 s every 3 s ("Günah Işığı Görüntüleri"); fear is dispellable. The descent stair S4 (z 38 to 40) lies just outside the ring (its south edge is at z 38.1); the leash ignores a player standing on a stair strip (floor height above 1.2 m), so a late arrival is not feared on the steps | EXISTS: `every()` + `statusPlayer(p, 'fear', 3)` in the boss `update()`, visual = `ZoneDef` rune ring + dais (section 3.7). P5 packages it as `arenaLeash(c, r, status, interval)` |
| M3 | **Stone statues wake** (trash set piece 1) | Stoneborn Slashers and Reavers stand as grey statues until a player gets within 7 m, then crack and attack (whole pack). They are CC-immune but have a posture bar (section 4.1): a poise break is the CC of this dungeon | **NEW P2** `PackDef.dormant.kind = 'statue'`; the model is frozen on frame 0 of `Idle` and uses a stone tint, on wake: tint back, `death_bones` burst tinted grey. Stop-gap with EXISTS: `kind: 'bones'` (visual only wrong) |
| M4 | **Ekelon's door (click to start)** | `gothic_door` at the top of the Gözcü stair. **The prop is the door**: `collide: true`, it blocks the 2-tile opening and the two nav cells of the opening, tiles (7, 12) and (8, 12), are marked blocked; the `boss_lock` `DoorDef` at (7, 12) is built with `model: false` (door model suppressed) and its own open / lock logic is replaced by the prop. Interacting with the prop (tag `gate`, id `ekelon_door`) emits `boss:pull`; the host then (1) plays the prop's `open` animation (1.2 s), (2) reopens the two nav cells exactly like a breakable `PropHandle` does, (3) calls `BossController.acquire(nearest player)` and (4) after 3 s the prop plays `close` and blocks the two cells again (the `boss_lock` behaviour, now carried by the prop). **Reset after a wipe:** the boss and adds reset, the prop is closed (`close`, 1.2 s, if it was open) with the two cells blocked, and it is interactable again (`PropHandle.setInteractable(true)`), so the party clicks it again. On the kill the prop opens and stays open with the cells open (this is also the Sept 2025 WoW fix: the door must work after the kill). Because the party cannot enter the terrace without opening the prop, the visible terrace cannot be pulled by accident, and a stray ranged pull from the stair is impossible (line of sight is blocked by the closed door) | **NEW P4** `BossPlacement.pull = 'interact'` + prop `id: 'ekelon_door'`, `tag: 'gate'`, `collide: true` + `DoorDef.model?: false`. Fallback: normal 12 m aggro (the door prop is then decor and the `boss_lock` door model is used) |
| M5 | **Quarry drop** | The north rim of the terrace is an open drop (2 tiles deep as a blocked zone, then dressing only, a red glow far below) with a stone parapet; it is not walkable. It is the only open edge of the terrace; the other three edges are walls and doors | EXISTS: `ZoneDef` kind `pit` with `blocked: true`, `glow`, `light` (section 3.7) |
| M6 | **Undying Stonefiends (regenerating adds)** | Fiends explode at 0 HP, leave rubble and re-form after 30 s with full HP unless crushed by Ekelon's leap | boss script + **NEW P5 `regenAdd`** helper (host tracks `{x, z, t}` of dead fiends, respawns them with `spawnAdds`, leap crush removes entries in radius) |
| M7 | **Kefaret Kapları (vessels)** | Four vessels in the nave alcoves. Open vessels show a green "safe" ring; a Parishioner kited into an open vessel is sealed and that vessel closes for 25 s. **At least two vessels are open at every moment** (section 5.3) | **NEW P5 `fixateAdd` + `safeZone`** (persistent `kind: 'safe'` shape, EXISTS shape kind), **P15** prop control for `vessel_1..4` (lid / glow) |
| M8 | **Sinstone statues (Velkaan)** | Four giant statues act as projectile launchers, beam anchors and damage sources | `kef_heykel` mechanic entities (P8 PROC body `sinstone_statue`), moved with `c.goTo` / `slide`, invulnerable via `makeInvulnerable` |
| M9 | **Bell of Rebuke** | Ambient: tolls every 40 to 60 s and once when the narthex packs are pulled (shake 0.05) | audio event (`world/bell_heavy_01..05`) + prop `id: 'bell'` tween (decor only) |
| M10 | **Tormented souls** (trash set piece 2) | Neutral spirits next to the Inquisitor; Sigar's Dark Communion eats them to heal | `ai.neutral` EXISTS; communion handler in the trash script (P7); forces 0 |
| M11 | **Start barrier** | A shimmering barrier on the narthex door during the 10 s M+ countdown | EXISTS (`scenes/StartBarrier.ts`), door tile (31, 54) |
| M12 | **Kibir Tecessümü (seasonal)** | At 20 / 40 / 60 / 80% forces a prideful soul rises out of a dedicated sinstone crack (`extras.kibirSpots`, section 6.5) | CM7 + P14 |
| M13 | **Descent into the pit** | The party walks down the 32 m wide stair S4 into the rotunda; as the third shard dies the beam strikes the mound under the dome; the doors above (`boss_lock` at (31, 40)) close after engage. Players who leave the pit upward (up S4) during the fight are inside the leash check | S4 strip (P17), M1, M2 |
| M14 | **The Lament bridge** (terrain set piece) | A 24 m span over a void. The two caster / beast packs fight on it, so a stray knockback from a player skill can drop an enemy into the void (the enemy is clamped, the player is safe because only enemies are pushed) and a player who sprints off the edge falls for 25% max HP. Nothing here is lethal | P17 `void` zone, section 3.2b |
| M15 | **Stair fights** | Packs stand on S7 and S9; the high ground is real: ranged players on the upper tiles see further, melee ignores up to 2.5 m height difference (a 2-tile climb) | P17 combat height rule (CORE_MECHANICS §13) |
| M16 | **Upper galleries** | Non-walkable decorative balconies, chandeliers and statues make the halls read 20 to 30 m tall (section 3.8) | P19 decor kit, P11 ceiling |

### 3.6 Data file (generated and validated; paste as is)

`src/data/dungeons/kefaret_salonlari.ts` imports `room, door, pack, stair, bossAt, circleZone, rectZone, decorator, makeCtx, withProps, rectsOf, pt, shPt, lt, dg, hw, gp, kg, kc, fu, ip` from `./kit` (`stair` is NEW, P17) and the types from `types/dungeons`. Pack member offsets use the same phyllotaxis list as the other dungeons (`[0.3,0] [-0.38,0.35] [0.06,-0.66] ...`), caster and ranged members come last in each pack so they stand at the back.

```ts
const ROOMS: RoomDef[] = [
  room('giris', 'Kefaret Avlusu', 24, 54, 16, 8, 'stone', 'stone', 0.3),
  room('narteks', 'Günah Nefi', 28, 48, 8, 6, 'tiles', 'temple', 0.2),
  room('tas_galerisi', 'Günah Taşı Galerisi', 16, 40, 32, 8, 'stone_dark', 'temple', 0.25),
  room('kiymik_bati', 'Batı Mühür Odası', 7, 38, 9, 10, 'stone_dark', 'stone', 0.3),
  room('kiymik_dogu', 'Doğu Mühür Odası', 48, 38, 9, 10, 'stone_dark', 'stone', 0.3),
  room('kiymik_kuzey', 'Kuzey Mühür Odası', 40, 30, 8, 10, 'stone_dark', 'stone', 0.3),
  room('halkor_cemberi', 'Halkor Çemberi', 24, 26, 16, 14, 'stone_dark', 'temple', 0.12, { boss: 1 }),
  room('arsiv', 'Günah Taşı Arşivi', 48, 48, 9, 6, 'stone_dark', 'brick', 0.5, { optional: true }),
  room('k_bati', 'Batı Kolonadı', 4, 28, 20, 6, 'tiles', 'temple', 0.3),
  room('gargoyle_avlusu', 'Gargoyle Avlusu', 4, 16, 20, 12, 'stone', 'stone', 0.4),
  room('servis_gecidi', 'Hizmetkâr Geçidi', 0, 16, 4, 18, 'dirt', 'brick', 0.5, { skip: true }),
  room('k_ekelon', 'Gözcü Merdivenleri', 0, 12, 16, 4, 'stone', 'temple', 0.25),
  room('ekelon_terasi', 'Gözcü Terası', 0, 0, 24, 12, 'stone', 'stone', 0.12, { boss: 2 }),
  room('k_kuzey', 'Ağıt Köprüsü', 24, 2, 6, 6, 'stone_dark', 'temple', 0.3),
  room('pismanlik_mahzeni', 'Pişmanlık Mahzeni', 24, 8, 6, 10, 'stone_dark', 'stone', 0.5, { optional: true }),
  room('cemaat_nefi', 'Cemaat Nefi', 30, 0, 20, 14, 'tiles', 'temple', 0.12, { boss: 3 }),
  room('kefaret_merdiveni', 'Kefaret Merdiveni', 48, 14, 16, 8, 'tiles', 'temple', 0.25),
  room('kamarar_salonu', 'Kamarar Salonu', 48, 22, 16, 16, 'tiles', 'temple', 0.1, { boss: 4 }),
];

const DOORS: DoorDef[] = [
  door('giris', 'narteks', 31, 54, 'n', 2, 'none'),
  door('narteks', 'tas_galerisi', 31, 48, 'n', 2, 'none'),
  door('tas_galerisi', 'kiymik_bati', 16, 43, 'w', 2, 'none'),
  door('tas_galerisi', 'kiymik_dogu', 47, 43, 'e', 2, 'none'),
  door('tas_galerisi', 'kiymik_kuzey', 42, 40, 'n', 2, 'none'),
  door('tas_galerisi', 'halkor_cemberi', 31, 40, 'n', 2, 'boss_lock'),
  door('kiymik_dogu', 'arsiv', 50, 47, 's', 2, 'none'),
  door('halkor_cemberi', 'k_bati', 24, 30, 'w', 2, 'boss_exit'),
  door('k_bati', 'gargoyle_avlusu', 17, 28, 'n', 2, 'none'),
  door('k_bati', 'servis_gecidi', 4, 30, 'w', 2, 'none'),
  door('gargoyle_avlusu', 'k_ekelon', 9, 16, 'n', 2, 'none'),
  door('servis_gecidi', 'k_ekelon', 1, 16, 'n', 2, 'none'),
  { ...door('k_ekelon', 'ekelon_terasi', 7, 12, 'n', 2, 'boss_lock'), model: false },   // NEW P4: the `gothic_door` prop is this door (section 3.5 M4)
  door('ekelon_terasi', 'k_kuzey', 23, 4, 'e', 2, 'boss_exit'),
  door('k_kuzey', 'pismanlik_mahzeni', 26, 7, 's', 2, 'none'),
  door('k_kuzey', 'cemaat_nefi', 29, 4, 'e', 2, 'boss_lock'),
  door('cemaat_nefi', 'kefaret_merdiveni', 48, 13, 's', 2, 'boss_exit'),
  door('kefaret_merdiveni', 'kamarar_salonu', 52, 21, 's', 2, 'boss_lock'),
];

const PACKS: PackDef[] = [
  pack('k_p01', 'narteks', 30.5, 51.5, 13, [['kef_darkblade', 0.3, 0], ['kef_darkblade', -0.38, 0.35], ['kef_tazici', 0.06, -0.66]]),
  pack('k_p02', 'narteks', 33.5, 49.3, 14, [['kef_gargon', 0.3, 0], ['kef_gargon', -0.38, 0.35], ['kef_gargon', 0.06, -0.66], ['kef_tazici', 0.48, 0.62]]),
  pack('k_p03', 'tas_galerisi', 21, 43.5, 12, [['kef_kiyici', 0.3, 0], ['kef_kiyici', -0.38, 0.35]]),
  pack('k_p04', 'tas_galerisi', 37, 43.5, 14, [['kef_darkblade', 0.3, 0], ['kef_obliterator', -0.38, 0.35], ['kef_toplayici', 0.06, -0.66]]),
  pack('k_p05', 'tas_galerisi', 28.5, 44, 14, [['kef_parcalayici', 0.3, 0], ['kef_kemirgen', -0.38, 0.35], ['kef_kemirgen', 0.06, -0.66], ['kef_kemirgen', 0.48, 0.62], ['kef_kemirgen', -0.88, -0.16]], { patrol: [[22,45], [41,45]] }),
  pack('w_p06', 'kiymik_bati', 11, 42, 14, [['kef_shard', 0.3, 0], ['kef_obliterator', -0.38, 0.35], ['kef_toplayici', 0.06, -0.66]]),
  pack('w_p07', 'kiymik_bati', 10, 45.5, 6, [['kef_gargon', 0.3, 0], ['kef_gargon', -0.38, 0.35]]),
  pack('e_p08', 'kiymik_dogu', 52, 42, 14, [['kef_shard', 0.3, 0], ['kef_obliterator', -0.38, 0.35], ['kef_toplayici', 0.06, -0.66]]),
  pack('e_p09', 'kiymik_dogu', 52, 45.5, 6, [['kef_kemirgen', 0.3, 0], ['kef_kemirgen', -0.38, 0.35], ['kef_kemirgen', 0.06, -0.66]]),
  pack('n_p10', 'kiymik_kuzey', 43.5, 33, 14, [['kef_shard', 0.3, 0], ['kef_obliterator', -0.38, 0.35], ['kef_toplayici', 0.06, -0.66]]),
  pack('n_p11', 'kiymik_kuzey', 43.5, 36.5, 6, [['kef_gargon', 0.3, 0], ['kef_gargon', -0.38, 0.35]]),
  pack('b_p12', 'k_bati', 12, 30.5, 13, [['kef_darkblade', 0.3, 0], ['kef_darkblade', -0.38, 0.35], ['kef_rahip', 0.06, -0.66]]),
  pack('b_p13', 'k_bati', 19, 31, 14, [['kef_yagmaci', 0.3, 0], ['kef_kiyici', -0.38, 0.35]]),
  pack('c_p14', 'gargoyle_avlusu', 8, 24, 16, [['kef_bahcivan', 0.3, 0], ['kef_bahcivan', -0.38, 0.35], ['kef_kemirgen', 0.06, -0.66], ['kef_kemirgen', 0.48, 0.62], ['kef_kemirgen', -0.88, -0.16]]),
  pack('c_p15', 'gargoyle_avlusu', 15, 24.5, 19, [['kef_gargon', 0.3, 0], ['kef_gargon', -0.38, 0.35], ['kef_gargon', 0.06, -0.66], ['kef_tazici', 0.48, 0.62], ['kef_rahip', -0.88, -0.16]]),
  pack('c_p16', 'gargoyle_avlusu', 20, 21, 16, [['kef_parcalayici', 0.3, 0], ['kef_parcalayici', -0.38, 0.35], ['kef_kemirgen', 0.06, -0.66], ['kef_kemirgen', 0.48, 0.62]]),
  pack('c_p17', 'gargoyle_avlusu', 11, 20.5, 20, [['kef_yagmaci', 0.3, 0], ['kef_kiyici', -0.38, 0.35], ['kef_kiyici', 0.06, -0.66]]),
  pack('c_p18', 'gargoyle_avlusu', 6, 18.5, 18, [['kef_darkblade', 0.3, 0], ['kef_darkblade', -0.38, 0.35], ['kef_obliterator', 0.06, -0.66], ['kef_toplayici', 0.48, 0.62]]),
  pack('c_p19', 'gargoyle_avlusu', 17, 17.5, 10, [['kef_darkblade', 0.3, 0], ['kef_darkblade', -0.38, 0.35], ['kef_kemirgen', 0.06, -0.66]], { patrol: [[17,17.5], [17,25]] }),
  pack('e_p20', 'k_ekelon', 4, 13.5, 14, [['kef_darkblade', 0.3, 0], ['kef_tazici', -0.38, 0.35], ['kef_rahip', 0.06, -0.66]]),
  pack('e_p21', 'k_ekelon', 12, 13.5, 10, [['kef_parcalayici', 0.3, 0], ['kef_kemirgen', -0.38, 0.35], ['kef_kemirgen', 0.06, -0.66]]),
  pack('a_p22', 'k_kuzey', 27, 4.4, 14, [['kef_darkblade', 0.3, 0], ['kef_obliterator', -0.38, 0.35], ['kef_toplayici', 0.06, -0.66]]),
  pack('a_p23', 'k_kuzey', 26.8, 6.9, 14, [['kef_gargon', 0.3, 0], ['kef_gargon', -0.38, 0.35], ['kef_gargon', 0.06, -0.66], ['kef_rahip', 0.48, 0.62]]),
  pack('m_p24', 'kefaret_merdiveni', 52, 16.5, 17, [['kef_sigar', 0.3, 0], ['kef_tormented', -0.38, 0.35], ['kef_tormented', 0.06, -0.66], ['kef_tormented', 0.48, 0.62], ['kef_obliterator', -0.88, -0.16]]),
  pack('m_p25', 'kefaret_merdiveni', 58, 16.5, 19, [['kef_yagmaci', 0.3, 0], ['kef_kiyici', -0.38, 0.35], ['kef_rahip', 0.06, -0.66]]),
  pack('m_p26', 'kefaret_merdiveni', 53, 19.5, 19, [['kef_gargon', 0.3, 0], ['kef_gargon', -0.38, 0.35], ['kef_gargon', 0.06, -0.66], ['kef_tazici', 0.48, 0.62], ['kef_rahip', -0.88, -0.16]]),
  pack('m_p27', 'kefaret_merdiveni', 60, 19.5, 17, [['kef_sigar', 0.3, 0], ['kef_tormented', -0.38, 0.35], ['kef_tormented', 0.06, -0.66], ['kef_tormented', 0.48, 0.62], ['kef_toplayici', -0.88, -0.16]]),
  pack('m_p28', 'kefaret_merdiveni', 56, 15, 16, [['kef_darkblade', 0.3, 0], ['kef_darkblade', -0.38, 0.35], ['kef_tazici', 0.06, -0.66], ['kef_gargon', 0.48, 0.62]], { patrol: [[50,15], [61,15]] }),
  pack('o_p29', 'arsiv', 50.5, 52.2, 20, [['kef_obliterator', 0.3, 0], ['kef_obliterator', -0.38, 0.35], ['kef_toplayici', 0.06, -0.66], ['kef_toplayici', 0.48, 0.62]], { optional: true }),
  pack('o_p30', 'arsiv', 54.5, 52, 20, [['kef_yagmaci', 0.3, 0], ['kef_kemirgen', -0.38, 0.35], ['kef_kemirgen', 0.06, -0.66], ['kef_kemirgen', 0.48, 0.62], ['kef_kemirgen', -0.88, -0.16], ['kef_kemirgen', 0.83, -0.53], ['kef_kemirgen', -0.28, 1.03]], { optional: true }),
  pack('o_p31', 'pismanlik_mahzeni', 26.5, 14.6, 18, [['kef_bahcivan', 0.3, 0], ['kef_bahcivan', -0.38, 0.35], ['kef_kemirgen', 0.06, -0.66], ['kef_kemirgen', 0.48, 0.62], ['kef_kemirgen', -0.88, -0.16], ['kef_kemirgen', 0.83, -0.53]], { optional: true }),
  pack('o_p32', 'pismanlik_mahzeni', 26.5, 16.9, 18, [['kef_gargon', 0.3, 0], ['kef_gargon', -0.38, 0.35], ['kef_gargon', 0.06, -0.66], ['kef_rahip', 0.48, 0.62], ['kef_darkblade', -0.88, -0.16]], { optional: true }),
  pack('s_p33', 'servis_gecidi', 1.5, 29, 12, [['kef_darkblade', 0.3, 0], ['kef_darkblade', -0.38, 0.35], ['kef_darkblade', 0.06, -0.66]]),
  pack('s_p34', 'servis_gecidi', 1.5, 21, 12, [['kef_tazici', 0.3, 0], ['kef_gargon', -0.38, 0.35], ['kef_kemirgen', 0.06, -0.66], ['kef_kemirgen', 0.48, 0.62]]),
];

/** Dormant statues and big-pull flags on top of the packs (same pattern as kemik_mahzeni.ts PACK_EXTRA). */
const PACK_EXTRA: Record<string, Partial<PackDef>> = {
  k_p03: { dormant: { kind: 'statue', wakeRadius: 7 }, big: true },
  c_p17: { dormant: { kind: 'statue', wakeRadius: 7 }, big: true },
  c_p18: { big: true },
};
```

Positions that moved against revision 1, all because of the new geometry: `a_p22` (27, 4.4) and `a_p23` (26.8, 6.9) stand on the bridge span and branch (every member on a walkable tile); `o_p29` (50.5, 52.2), `o_p30` (54.5, 52) are south of the archive stair S5; `o_p31` (26.5, 14.6), `o_p32` (26.5, 16.9) are south of the crypt stair S8. Seven packs swapped one Tazıcı / Toplayıcı slot for the new healer `kef_rahip` (same 5 forces, the totals did not change): `b_p12`, `c_p15`, `e_p20`, `a_p23`, `m_p25`, `m_p26`, `o_p32`.

Boss placements (`bossAt(bossId, roomId, x, z, facing, order)` and the matching `arena` field of each `BossDef`, world metres computed as `cx = (x + w/2) * 4`):

```ts
const BOSSES = [
  { ...bossAt('boss_halkor', 'halkor_cemberi', 31.5, 32.5, 0, 1), awaken: { enemyId: 'kef_shard', count: 3 } },             // NEW P3
  { ...bossAt('boss_ekelon', 'ekelon_terasi', 11.5, 4, 0, 2), pull: 'interact', pullProp: 'ekelon_door' },                // NEW P4
  bossAt('boss_alyez', 'cemaat_nefi', 42, 6.5, -90, 3),
  bossAt('boss_velkaan', 'kamarar_salonu', 55.5, 29.5, 180, 4),
];

// decorator context: reserved circles keep scatter away from packs, doors, start, exit, bosses, shrines (same call as kemik_mahzeni.ts)
const ctx = makeCtx('kefaret_salonlari', DOORS, PACKS, [
  { x: 31.5, z: 59, r: 2.0 }, { x: 31.5, z: 56.4, r: 1.6 }, { x: 55.5, z: 35.5, r: 2.8 },
  { x: 31.5, z: 32.5, r: 5.0 }, { x: 11.5, z: 4, r: 5.0 }, { x: 42, z: 6.5, r: 5.0 }, { x: 55.5, z: 29.5, r: 5.0 },
  { x: 22, z: 17, r: 1.5 }, { x: 49.5, z: 21.4, r: 1.5 }, { x: 8, z: 11.9, r: 3.0 },           // shrines, Ekelon door
]);
const D = decorator(ctx, rectsOf(ROOMS));
```

| boss | room | placement | `BossDef.arena` (world metres) |
|---|---|---|---|
| `boss_halkor` | halkor_cemberi | `bossAt('boss_halkor', 'halkor_cemberi', 31.5, 32.5, 0, 1)` | `{ cx: 128, cz: 132, w: 64, h: 56, homeX: 128, homeZ: 132 }` |
| `boss_ekelon` | ekelon_terasi | `bossAt('boss_ekelon', 'ekelon_terasi', 11.5, 4, 0, 2)` | `{ cx: 48, cz: 24, w: 96, h: 48, homeX: 48, homeZ: 18 }` |
| `boss_alyez` | cemaat_nefi | `bossAt('boss_alyez', 'cemaat_nefi', 42, 6.5, -90, 3)` | `{ cx: 160, cz: 28, w: 80, h: 56, homeX: 170, homeZ: 28 }` |
| `boss_velkaan` | kamarar_salonu | `bossAt('boss_velkaan', 'kamarar_salonu', 55.5, 29.5, 180, 4)` | `{ cx: 224, cz: 120, w: 64, h: 64, homeX: 224, homeZ: 120 }` |

### 3.7 Zones, per-room extras, extras block and export

```ts
const START: [number, number] = [31.5, 59];
const FONT: [number, number] = [31.5, 56.4];
const EXIT: [number, number] = [55.5, 35.5];
const RED = 0xc8382f, GOLD = 0xc9a24a, MOON = 0x8890c0;
const sinRune = (x: number, z: number, r: number, gi = 0.9): ZoneDef => circleZone('rune', x, z, r, { color: 0x1d1826, glow: RED, glowIntensity: gi });
const runner = (x: number, z: number, w: number, h: number): ZoneDef => rectZone('bridge', x, z, w, h, { color: 0x5a1220 });   // red carpet

/** Height, ceiling and stair strips (NEW P17 / P11). stair(id, x, z, w, h, up, y0, y1): y0 = low end, y1 = high end, `up` = the direction of the high end. */
const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: { floorY: 0.0, ceiling: 0, stairs: [stair('S1', 30, 54, 4, 2, 'n', 0.0, 2.4)], ambientVfx: 'ambient_dust', lightColor: 0x8a90c8, fog: { color: 0x2a2038, near: 14, far: 62 }, zones: [sinRune(FONT[0], FONT[1], 1.0, 0.4)] },
  narteks: { floorY: 2.4, ceiling: 14, ambientVfx: 'ambient_dust', lightColor: 0xffb070 },
  tas_galerisi: { floorY: 2.4, ceiling: 20, ambientVfx: 'ambient_dust', lightColor: 0xd08a70 },
  kiymik_bati: { floorY: 0.0, ceiling: 10, stairs: [stair('S2', 14, 38, 2, 10, 'e', 0.0, 2.4)], lightColor: RED, zones: [sinRune(11, 42, 1.6)] },
  kiymik_dogu: { floorY: 2.4, ceiling: 10, lightColor: RED, zones: [sinRune(52, 42, 1.6)] },
  kiymik_kuzey: { floorY: 4.2, ceiling: 10, stairs: [stair('S3', 40, 38, 8, 2, 'n', 2.4, 4.2)], lightColor: RED, zones: [sinRune(43.5, 33, 1.6)] },
  halkor_cemberi: {
    floorY: 0.6, ceiling: 24, stairs: [stair('S4', 28, 38, 8, 2, 's', 0.6, 2.4)],
    explicitDecor: true, lightColor: RED,
    // glowing ring r 21.2 to 22.4 m: outer rune disc, inner dais disc on top (later zones override earlier ones)
    zones: [circleZone('rune', 31.5, 32.5, 5.6, { color: 0x2a1020, glow: RED, glowIntensity: 0.9 }), circleZone('dais', 31.5, 32.5, 5.3, { color: 0x1d1826 })],
  },
  arsiv: { floorY: 0.0, ceiling: 8, stairs: [stair('S5', 49, 48, 4, 3, 'n', 0.0, 2.4)], lightColor: 0xffc080 },
  k_bati: { floorY: 3.6, ceiling: 12, stairs: [stair('S6', 20, 28, 4, 6, 'w', 0.6, 3.6)], lightColor: 0xffb070, zones: [runner(4, 30, 16, 2)] },
  gargoyle_avlusu: {
    floorY: 3.6, ceiling: 0, ambientVfx: 'ambient_dust', lightColor: 0x9a9ac8, fog: { color: 0x30242e, near: 14, far: 64 },
    zones: [circleZone('pool', 8, 24, 1.5, { color: 0x3e3a22 }), circleZone('pool', 15.5, 25.5, 1.2, { color: 0x3e3a22 })],
  },
  servis_gecidi: { floorY: 3.6, ceiling: 8, lightColor: 0xe0a060 },
  k_ekelon: { floorY: 3.6, ceiling: 16, stairs: [stair('S7', 0, 12, 16, 4, 'n', 3.6, 8.4)], lightColor: 0xffb070, zones: [runner(7, 12, 2, 4)] },
  ekelon_terasi: {
    floorY: 8.4, ceiling: 0,
    explicitDecor: true, lightColor: 0x8890b8, fog: { color: 0x3a1c2c, near: 16, far: 70 },
    zones: [rectZone('pit', 0, 0, 24, 2, { blocked: true, color: 0x120810, glow: RED, glowIntensity: 0.6, light: lt(RED, 1.6, 14, true, 0.5) })],
  },
  k_kuzey: {
    floorY: 8.4, ceiling: 0, lightColor: MOON, ambientVfx: 'ambient_embers',
    // void tiles around the T-shaped bridge: fall = 25% max HP, respawn at the last safe tile (CORE_MECHANICS §13)
    zones: [rectZone('void', 24, 2, 6, 1, { fall: true, glow: RED, glowIntensity: 0.5 }), rectZone('void', 24, 6, 1, 2, { fall: true, glow: RED, glowIntensity: 0.5 }), rectZone('void', 28, 6, 2, 2, { fall: true, glow: RED, glowIntensity: 0.5 })],
  },
  pismanlik_mahzeni: { floorY: 3.6, ceiling: 8, stairs: [stair('S8', 24, 8, 6, 4, 'n', 3.6, 8.4)], lightColor: 0xb8b0e0, ambientVfx: 'ambient_shadow_wisps' },
  cemaat_nefi: { floorY: 8.4, ceiling: 30, explicitDecor: true, lightColor: 0xffd090, ambientVfx: 'ambient_dust', zones: [runner(30, 5, 20, 2)] },
  kefaret_merdiveni: { floorY: 8.4, ceiling: 22, stairs: [stair('S9', 48, 15, 16, 7, 's', 8.4, 14.4)], lightColor: 0xffb070, zones: [runner(52, 15, 2, 7)] },
  kamarar_salonu: {
    floorY: 14.4, ceiling: 30,
    explicitDecor: true, lightColor: RED,
    zones: [
      sinRune(55.5, 29.5, 4.2), circleZone('dais', 55.5, 29.5, 1.6, { color: 0x2a1020, y: 0.4 }),
      sinRune(50.5, 24.5, 1.1), sinRune(60.5, 24.5, 1.1), sinRune(50.5, 34.5, 1.1), sinRune(60.5, 34.5, 1.1),   // statue plinths
    ],
  },
};

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(31.5, 56.4),                                   // Kehanet Taşı, in the forecourt just north of S1, at floor 0.0
  shrines: [{ type: 'shrine_haste', pos: pt(22, 17) }, { type: 'shrine_power', pos: pt(49.5, 21.4) }],
  // Efsunlu Yarık: nearest-spot rule of Affixes.pickRiftSpot (straight line, at least 15 m from the party). Tuned so the four canonical party positions of section 6.1 each pick a sensible, reachable spot (section 6.5).
  riftSpots: ([[18, 44], [44.5, 45.5], [10, 31.5], [6.5, 25.5], [27, 11.2], [56, 21.4]] as [number, number][]).map(([x, z]) => pt(x, z)),
  // Kibirli (NEW P14): spot i is used by mark i + 1 (20 / 40 / 60 / 80%); falls back to the nearest riftSpot when absent
  kibirSpots: ([[18, 44], [10, 31.5], [6.5, 25.5], [27, 11.2]] as [number, number][]).map(([x, z]) => pt(x, z)),
  kibirCanon: ([[11, 42], [19, 31], [6, 18.5], [26.8, 6.9]] as [number, number][]).map(([x, z]) => pt(x, z)),   // contentCheck only (P21 rule 6): canonical party position at each mark, section 6.5
  chests: [{ pos: pt(28.2, 52.8), kind: 'chest_wood' }, { pos: pt(55.6, 49.2), kind: 'chest_gold' }],
};

export const KEFARET_SALONLARI: DungeonDef = {
  id: 'kefaret_salonlari', name: 'Kefaret Salonları', shortName: 'Kefaret', lore: '...(section 1 text)...',
  levelRange: [60, 60], timerSec: 1740, forcesRequired: 380, theme: THEME, grid: { w: 64, h: 64 },
  rooms: withProps(ROOMS.map((r) => ({ ...r, ...ROOM_EXTRA[r.id] })), D.out), doors: DOORS,
  packs: PACKS.map((p) => (PACK_EXTRA[p.id] ? { ...p, ...PACK_EXTRA[p.id] } : p)),
  bosses: BOSSES, start: { pos: shPt(START[0], START[1]), facing: 180 }, exit: { pos: shPt(EXIT[0], EXIT[1]) }, extras: EXTRAS,
  season: 1,                                                     // NEW (P1): Season 1 Mythic+ pool member
};
```

**Hand-placed dressing** is specified room by room in section 3.8 (props with counts and tile coordinates, lights, VFX, sounds, vertical dressing). Everything not listed there comes from `autoDecor` and `bones/scatter` helpers; rooms marked `explicitDecor` must have their pillars and clutter listed by hand (the sheets do this).

### 3.8 Set-dressing sheets (all 18 rooms)

This is one of the eight maps the season rotates on, so every room gets a sheet: props with counts and tile coordinates (GDD convention, prop `y` is relative to the floor of that tile, the builder snaps props to `groundY`, so stair props follow the slope), lights (prop lights from `LightPool`, **at most 14 per room**, colour lives on props), VFX ids (section 2.11), sounds (real files under `public/assets/audio/sfx`, positional unless marked global) and the vertical dressing that makes the room read tall (P19 decor kit and P11 ceiling). Helper names: `dg` `hw` `gp` `kg` `kc` `fu` `ip` as in section 2.8; **NEW** = Blender prop of section 2.9. `balcony(n)` = n modules of NEW `choir_balcony` (8 m each, with `gothic_balustrade` between, non-walkable, `collide: false`). Sound ids below are file families: `bell_heavy` = `world/bell_heavy_01..05.ogg`, `chain` = `world/chain_01..03.ogg`, `creak` = `world/creak_01..03.ogg`, `stones` = `world/stones_*`, `ghost` = `creatures/ghost_*`, `giant` = `creatures/giant_*`, `shimmer` = `magic/shimmer_01.mp3`, `wind` = `ambience/wind_loop_01.ogg`, `fire` = `ambience/fire_loop_01.ogg`, `dungeon` = `ambience/dungeon_loop_01.ogg`, `stinger` = `ambience/dark_stinger_01..05.wav`.

#### 3.8.1 `giris` Kefaret Avlusu (y 0.0, open air, 64 x 32 m, S1 at the north end)

* **Props.** NEW `kefaret_gate_frame` x1 at (31.5, 61.2) facing north (the arrival gate, holds a sealed portal skin); NEW `gargoyle_statue` x4 on plinths at (26.5, 55.5), (36.5, 55.5), (26.5, 59.5), (36.5, 59.5); `gp('font_of_power')` x1 at (31.5, 56.4) `tag: 'socket'`; `gp('lamp_post')` x4 at (25.5, 57.5), (37.5, 57.5), (28, 54.8), (35, 54.8); `kg('iron-fence')` x14 (scale 3) in two rows along x 24.2 and x 38.8, z 54.5 to 61.5; `hw('tree_dead_medium')` x3 at (24.8, 61.2), (38.8, 61.2), (24.8, 55); `hw('tree_dead_large')` x1 at (33.5, 61.5); `gp('brazier')` x2 on the S1 cheeks at (29.4, 55.6) and (34.6, 55.6); `dg('banner_patternC_red')` x2 at (29.2, 54.3) and (34.8, 54.3) (y 3.2); `kg('gravestone-cross')` x3 and `kg('gravestone-round')` x3 (scale 3) scattered along the fences; `dg('barrel_small_stack')` x2 at (26, 61) and (37.5, 61) (breakable); `ip('nocturnal-watch','crow')` x3 on the gargoyles (y 2.8). Skyline (props outside the walls): `ip('nocturnal-watch','tower')` x2 at (20, 65.5) and (44, 65.5), `church` scale 2.2 at (32, 70), all tinted `0x2a2038`.
* **Lights.** 4 lamp posts gold `0xffb070` 1.2 / 9 m; Font of Power `0xb070ff` 1.4 / 8 m; 2 S1 braziers `0xc8382f` 2.0 / 10 m; 2 gate lanterns `0xc8382f` 1.6 / 8 m (9 lights).
* **VFX.** `ambient_dust` drifting at knee height, `brazier_fire` x2 crimson, `ambient_embers` x6 near the gate, plum ground mist (fog override), the rune ring glow under the Font (`sinRune` r 1.0).
* **Sound.** `wind` loop (global in the room, 0.35), a far `bell_heavy` every 40 to 60 s (positional from the narthex), `footstep_stone`, soft crow calls every 20 s.
* **Vertical.** The cathedral facade rises 14 m behind S1 (the narthex front is the north wall of the courtyard: tall pointed windows x4 and two buttress pillars `ip('psx-dungeon','pillar')` scale 2.4 at (28.5, 54.2) and (35.5, 54.2)); the gate frame is 12 m high, the church silhouette 40 m.

#### 3.8.2 `narteks` Günah Nefi (y 2.4, ceiling 14, 32 x 24 m)

* **Props.** NEW `bell_of_rebuke` x1 hung at (32, 50.2) y 9.0 in an iron frame, `gp('chains_hanging')` x4 around it; `ip('psx-dungeon','arch')` x2 over the north door (32, 48.4) and the south door (32, 53.6); `ip('psx-dungeon','pillar')` scale 2.0 x4 at (29, 49.5), (35, 49.5), (29, 52.5), (35, 52.5) `collide`; `ip('nocturnal-watch','church_bench')` x6 against the side walls at x 28.8 and 35.2, z 49.5, 51, 52.5; `dg('banner_patternC_red')` x4 scale 2.5 (y 7) between the pillars; `dg('candle_triple')` x6 on the benches; `ip('nocturnal-watch','tavern_chandelier')` x1 scale 1.4 at (32, 51.5) y 9.5; `ip('psx-medieval','decoration/window_rounded')` x2 on the long walls; `gp('chest_wood')` x1 at (28.2, 52.8) (fixed chest).
* **Lights.** chandelier 1.2 / 9 m gold, bell-frame lanterns x2 gold 0.9 / 6 m, 2 wall braziers crimson 1.6 / 8 m, 6 bench candles gold 0.5 / 4 m (11 lights).
* **VFX.** `ambient_dust`, `candle_flame` x6, 2 moon-blue light shafts (P9) falling from the clerestory windows onto the carpet lane.
* **Sound.** the **bell toll** (`bell_heavy`, positional at the bell, every 40 to 60 s and once on the first pull of `k_p01` / `k_p02`, shake 0.05), `creak` from the bell chains every 20 s, `footstep_stone`.
* **Vertical.** four clerestory windows at y 8 to 12 (2 per long wall, automatic in the `temple` wall), hanging chains to the ceiling, the bell is the 9 m focus; ceiling ribs read at 14 m (P11).

#### 3.8.3 `tas_galerisi` Günah Taşı Galerisi (y 2.4, ceiling 20, 128 x 32 m)

* **Props.** NEW `sinstone_tomb` **x12** along z 40.4 and z 46.8 at x = 19, 23, 27, 35, 39, 45 (skips the Halkor door span x 31 to 33, the kuzey door span x 42 to 43.9 and the narthex door span x 31 to 33; the side doors at x 16 and x 47 are on the short walls); `ip('psx-dungeon','pillar')` scale 1.8 x12 (10.8 m) at z 41.2 and z 46.8, x = 18, 24, 29, 35, 40, 46 `collide`; `ip('psx-dungeon','chandelier')` scale 1.6 x5 at (20, 43.5), (26, 43.5), (32, 43.5), (38, 43.5), (44, 43.5) hung on long chains at y 13.5; `gp('statue_hooded')` mourners x6 scale 1.2 tint `0x6a6878` between the pillars at (21, 41), (33, 41), (44, 41), (21, 47), (33, 47), (44, 47); `dg('banner_patternC_red')` x8 hanging from the balconies (6 m long); `gp('brazier')` x3 near the doors; `dg('rubble_half')` x4 (cracked tiles) on the lane.
* **Upper galleries (decor, y 8.0).** `balcony(16)` along the north wall (z 40.2) and `balcony(16)` along the south wall (z 47.6), 32 modules, every 4th module carries a `gp('statue_hooded')` scale 1.4 (8 statues), every 2nd a hanging red banner (16); the balconies run unbroken over the doors.
* **Lights.** 5 chandeliers gold 1.0 / 8 m, crimson floor glows `0xc8382f` 1.0 / 6 m at the three side-door thresholds (16.6, 44), (47.4, 44), (43, 40.6), 3 braziers crimson 1.6 / 8 m (11 lights).
* **VFX.** `ambient_dust` in 5 moon-blue light shafts (P9) between the pillars, `soul_wisp` x6 above the tombs (glow in the carved sins), 3 red door glows pulsing at 0.4 Hz.
* **Sound.** whispers (`ghost`, positional at 3 tombs, one every 25 s), chain creak, far bell, a reverb-heavy `footstep_stone` (long tail), organ drone from the music bed.
* **Vertical.** the longest hall of the dungeon; at 20 m with balconies at 8 m and chandeliers at 13.5 m it is the first big "cathedral" read; the north and south walls carry 14 tall arched windows each (`temple` variants).

#### 3.8.4 `kiymik_bati` / `kiymik_dogu` / `kiymik_kuzey` Mühür Odaları (y 0.0 / 2.4 / 4.2, ceiling 10, 36 x 40 m each)

Common kit per chamber: NEW `sinstone_shard` L x1 as the decor twin of the `kef_shard` entity at (pack centre x - 1.5, z); `gp('crystal_purple')` tinted `0x1d1826` with a crimson emissive x6 on a ring r 2.5 tiles; `gp('chains_hanging')` x3 from the ceiling to the shard; `dg('candle_triple')` x4; `sinRune` r 1.6 under the shard; shard light crimson `0xc8382f` 1.8 / 9 m (flicker off), 2 braziers 1.6 / 8 m (7 lights); VFX: the shard seams pulse, `shadow_ground` tinted `0x8e1b24` x2, `soul_wisp` x3; sound: `shimmer` loop positional at the shard (quiet hum), `chain`, `stones` crumble every 30 s; when the shard dies: `boss_spawn` ring and a crimson beam VFX (a thin additive cone) travelling to the Halkor rotunda with `giant` rumble.

* **West (y 0.0, crypt).** Descent S2 (x 14 to 16) down into a low crypt: `hw('coffin')` broken x2, `kg('coffin-old')` x4 in wall niches, `dg('pillar_decorated')` x4 at (8, 39.3), (14.6, 39.3), (8, 46.7), (14.6, 46.7), a collapsed `ip('psx-dungeon','arch')` x1 at (11, 38.4); the gallery floor is 2.4 m above, so the room reads "below".
* **East (y 2.4, reliquary).** Flush with the gallery: 6 `hw('shrine_candles')`, `dg('shelves')` x3 (reliquary shelves with glowing bone), `fu('book_set')` x6, a glass-front `ip('psx-medieval','decoration/window_rounded')` x2; the south door to the Archive with a `dg('barrier_half')` hint.
* **North (y 4.2, dais).** S3 dais steps with a red runner (`runner(43, 38, 2, 2)`), the west wall has a barred **pit window** (`ip('psx-dungeon','windowed_wall_01')` scaled 2.4 x1 at (40.3, 34)) from which the rotunda 3.6 m below and the mound under the oculus are visible; 2 hanging `gp('brazier')` crimson; this is where the shard beam leaves the building. Vertical: a 1.5 m high dais rim of `dg('wall_half')`.

#### 3.8.5 `halkor_cemberi` Halkor Çemberi (y 0.6, ceiling 24, 64 x 56 m, S4 on the south side)

* **Props.** NEW `sinstone_shard` size M x12 on a ring r 5.5 tiles around (31.5, 32.5) at 30 degree steps (the ring doubles as the leash ring: the shards stand in the glowing band); `gp('rock_large')` x3 tinted `0x2a2036` with crimson emissive at the centre (id `halkor_mound`, hidden on awakening); `dg('pillar_decorated')` x4 scale 1.6 at the rim corners (24.5, 26.5), (38.5, 26.5), (24.5, 38.5), (38.5, 38.5) `collide`; `ip('psx-dungeon','chandelier')` scale 2.2 x2 at (28, 30) and (35, 35) y 17; `dg('rubble_half')` x6 tinted dark (glass shards) scattered outside the ring; `ip('psx-dungeon','arch')` x2 framing the S4 head and the colonnade door; door frames.
* **Upper gallery (decor, y 9.0).** a ring gallery on the four walls: `balcony(14)`, 8 NEW `gargoyle_statue` looking down from it, 6 hanging red banners; two stone **bridges of statues**: `halloween/arch` x2 spanning at y 12 (non-walkable) to read as a rotunda.
* **Lights.** zone light crimson 1.6 / 20 m on the ring (all 12 shards share it), 2 chandeliers gold 1.2 / 10 m, 4 pillar braziers crimson 1.8 / 9 m, door glows x2 (9 lights).
* **VFX.** ring runes pulse; an **oculus shaft** (P9, moon-blue, 6 m wide, from y 24 straight down onto the mound) with `ambient_dust`; the mound smoulders (`ambient_embers`); `shadow_ground` pools at each shard; at awakening `boss_spawn`, shake 0.4, a ring of crimson sparks.
* **Sound.** a deep drone (`shimmer` pitched down, loop) that rises with each dead shard (0.2, 0.4, 0.7), `stones` grinding when the mound moves, `giant` roar at the rise, `door_heavy_01.wav` as the gallery doors seal.
* **Vertical.** the room is a **pit**: S4 is 8 tiles wide so the descent is a ceremonial stair; the dome ceiling is 24 m, the gallery at 9 m is above the stair head; the north chamber's pit window looks into this room.

#### 3.8.6 `arsiv` Günah Taşı Arşivi (y 0.0, ceiling 8, 36 x 24 m, S5 at the north end)

* **Props.** `dg('shelf_large')` x8 and `dg('shelves')` x2 along the south wall z 53.4 (x 49 to 56), the east wall x 56.4 (z 49 to 53) and the west wall x 48.4 (z 51.5 to 53); `dg('candle_triple')` x10 on shelves and desks; `fu('book_set')` x12 (clutter, scattered); NEW `sinstone_tomb` x6 stacked as records at (48.8, 52.6) to (49.4, 53.3); `dg('table_long_decorated_A')` reading desk at (55, 50.4); `gp('chest_gold')` at (55.6, 49.2) (the Archive chest); `hw('skull_candle')` x2; `dg('barrel_large')` x2.
* **Lights.** 8 candle lights gold `0xffc080` 0.6 / 5 m (cap 8), desk lamp 0.9 / 6 m (9 lights).
* **VFX.** `ambient_dust` thick, drifting paper motes (`ambient_dust` tinted `0xd7cdba`), `candle_flame` x10.
* **Sound.** `creak` of shelves every 25 s, page flutters (`world/plank` soft), the `dungeon` bed ducked, `footstep_stone`.
* **Vertical.** the room is a cellar: S5 leads down 2.4 m through a brick arch; the shelves are 6 m high with a mezzanine rail at y 4.0 (decor, `gothic_balustrade` x6 above the west shelves).

#### 3.8.7 `k_bati` Batı Kolonadı (y 3.6, ceiling 12, 80 x 24 m, S6 at the east end)

* **Props.** `ip('psx-dungeon','pillar')` scale 1.4 x9: north row z 29.2 at x 5.5, 8.5, 11.5, 14.5 (the door to the courtyard at x 17 to 19 stays free), south row z 32.8 at x 5.5, 8.5, 11.5, 14.5, 17.5, all `collide`; `dg('banner_patternC_red')` x6 scale 2 between the pillars (y 6); `hw('lantern_hanging')` x6 (torches every 3 tiles); `runner(4, 30, 16, 2)` red carpet; S6 dressing: `dg('banner_thin_red')` x4 on its walls, `gp('brazier')` x2 at (20.5, 28.8) and (20.5, 33.2); `dg('barrier_half')` x2 near the west door (visual hint toward the servants' passage).
* **Lights.** 6 torches gold 1.0 / 7 m, 2 S6 braziers crimson 1.8 / 9 m, 3 light shafts (no light), (8 lights).
* **VFX.** `ambient_dust` in 3 moon-blue shafts (P9) between columns, torch flames, drifting embers at the S6 head.
* **Sound.** `footstep_stone` with reverb, wind through the arches (`wind`, 0.15), `stinger` every 120 s.
* **Vertical.** an arcade of 7.2 m columns under a 12 m vault with arched windows (`temple`); an upper walkway **decor** at y 8.0 along the north wall (`balcony(10)`, 3 hooded statues); S6 is the 3.0 m climb out of the pit with banners rising up the wall.

#### 3.8.8 `gargoyle_avlusu` Gargoyle Avlusu (y 3.6, open air, 80 x 48 m)

* **Props.** NEW `gargoyle_statue` x8 at (6, 16.4), (12, 16.4), (18, 16.4), (6, 27), (12, 27), (18, 27), (4.5, 21.5), (22.5, 21.5); `kg('iron-fence')` scale 3 x24 around 4 garden tomb beds (centres (7, 22), (13, 23), (19, 22.5), (12, 18)) with `kg('gravestone-*')` x16 and `hw('grave_A')` / `grave_B` x8; `hw('tree_dead_large')` x4 at (4.8, 17.2), (23, 17.2), (4.8, 27), (23, 27); `ip('nocturnal-watch','well')` x1 at (21.5, 26.5); `kg('lightpost-double')` x3 at (10, 22), (16, 20), (19, 25); `hw('fence_gate')` x1; `dg('barrel_large')` x3 + `dg('crates_stacked')` x2 as gardeners' clutter near c_p14; two muck pools (zones) at (8, 24) and (15.5, 25.5) `kg('pine-crooked')` x4 on the terraces; shrine `kg('altar-stone')` x3 + `gp('crystal_blue')` at (22, 17) (Rüzgar Sunağı). Skyline: `ip('nocturnal-watch','tower')` x3 at (19.5, 13.5), (26.5, 22), (30.5, 20) and `church` x2.2 at (38, 19) tinted `0x2a2038`.
* **Terraces.** garden beds raised 0.3 m (`dg('wall_half')` kerbs, below the 0.45 m step limit, decor) in three tiers from south to north; a decorative **arcade bridge** `halloween/arch` x6 at y 9.0 across the north rim (non-walkable) and `balcony(8)` on the east wall at y 6.0.
* **Lights.** 3 lamp posts gold 1.2 / 9 m, gargoyle eyes crimson 0.5 / 4 m x4 (shared), shrine light `0x80b0ff` 1.2 / 6 m (8 lights).
* **VFX.** `ambient_dust` ground mist near the muck pools, dead leaves, `soul_wisp` x4 over the tomb beds, crimson eye glints on the gargoyles (blink every 6 s).
* **Sound.** `wind` (0.4), distant `bell_heavy`, crows, muck squelch (`creatures/burble` positional at the pools), `footstep_stone`.
* **Vertical.** the courtyard is the open "view" room: the church and towers rise 30 to 40 m on the skyline, the terrace of Ekelon (8.4 m) is visible above the north wall, the arcade bridge decor at y 9 links them visually.

#### 3.8.9 `servis_gecidi` Hizmetkâr Geçidi (y 3.6, ceiling 8, 16 x 72 m)

* **Props.** `dg('barrel_large')` x4, `dg('crates_stacked')` x3, `fu('table_long')` broken x2, `hw('lantern_hanging')` x4 (oil lanterns), `dg('barrier_half')` x2 half-blocking the west door of `k_bati`, `kg('coffin-old')` x2 (servants' dead), a **broken service lift** decor: `ip('psx-dungeon','chain')` x3 and a `dg('crates_stacked')` cage at (2, 25) hanging into an empty shaft (hints at a lift that no longer works), laundry lines `dg('banner_thin_red')` tinted grey x4.
* **Lights.** 4 oil lanterns amber `0xe0a060` 0.9 / 6 m, 1 shaft candle (5 lights).
* **VFX.** `ambient_dust` thick, `candle_flame` x2, dripping water splash (`ambient_dust` tinted blue) at (1.5, 24).
* **Sound.** `footstep_dirt`, `creak` of the cage chains every 15 s, `dungeon` bed.
* **Vertical.** low (8 m) and tight on purpose against the cathedral halls; a window slot at y 4 shows the courtyard fog.

#### 3.8.10 `k_ekelon` Gözcü Merdivenleri (y 3.6 to 8.4, ceiling 16, 64 x 16 m)

* **Props.** the S7 flight is built by the builder (0.2 m risers, 16 m wide); `gp('brazier')` x6 crimson up both flanks at (0.8, 15), (0.8, 13.5), (0.8, 12.4), (15.2, 15), (15.2, 13.5), (15.2, 12.4); NEW `gothic_door` (8 x 6 m, id `ekelon_door`, `collide: true`, tag `gate`) at (8, 11.9); NEW `gargoyle_statue` x2 on plinths flanking the door at (4.5, 12.6) and (11.5, 12.6); `dg('banner_patternC_red')` x4 scale 2.4 on the walls; `runner(7, 12, 2, 4)`; `ip('psx-dungeon','arch')` x1 over the door (8, 11.4) scale 1.6.
* **Lights.** 6 braziers crimson 1.8 / 9 m, the door seam glow `0xc8382f` 1.4 / 8 m (7 lights).
* **VFX.** `brazier_fire` x6, 2 moon-blue shafts (P9) from skylights at (4, 13) and (12, 13), embers climbing the stair, the door seam pulses red.
* **Sound.** `fire` loop positional on the braziers (0.3), `footstep_stone` with a rising echo, `door_heavy_01.wav` when the prop opens (1.2 s), `creak` from the door every 20 s.
* **Vertical.** the climb itself: 4.8 m of rise under a 16 m vault; at the top the door (6 m) and the gargoyles frame the gate.

#### 3.8.11 `ekelon_terasi` Gözcü Terası (y 8.4, open air, 96 x 48 m)

* **Props.** 8 kneeling Stoneborn statues (`characters/Knight.glb` x4 and `Barbarian.glb` x4, `pose: 'Idle'`, tint `0x8a8898`, decor, no collision) at x 3, 8, 15, 20 on z 9.5 and z 2.5; 4 `dg('pillar_decorated')` scale 1.4 with `gp('brazier')` on top (y 5.6) at (6, 6), (18, 6), (6, 9), (18, 9); `gothic_balustrade` x24 along the parapet z 2.0, x 0 to 24, with NEW `gargoyle_statue` x6 on it; `dg('rubble_large')` x6 at the rim; `pillar_broken` scale 2.5 x6 rising out of the quarry (non-walkable, z -0.5 to 1.2); `ip('psx-dungeon','chain')` x8 hanging down the drop; skyline: `tower` x2 at (6, -6) and (18, -8), `church` x2.2 at (12, -14) tinted `0x2a2038`; the exit door frame at (23, 4); two `dg('banner_patternC_red')` tattered x2 on the east wall.
* **Lights.** 4 hanging braziers crimson 2.0 / 10 m, the quarry glow (zone light) `0xc8382f` 1.6 / 14 m, moon-blue key 0.5, the door seam (7 lights).
* **VFX.** red heat haze rising from the drop (`ambient_embers` x20), `brazier_fire` x4, drifting ash, `shadow_ground` red mist pooling at the rim.
* **Sound.** `wind` loud (0.5), a deep rock groan from the quarry every 30 s (`giant` low), `chain` creaks, footsteps stone; boss bed `boss_epic_battle.mp3` on the pull.
* **Vertical.** a 96 m terrace at 8.4 m that overlooks the courtyard (3.6) and a 30 m deep quarry; the north rim is a fenced drop with a glowing floor far below; the Lament bridge leaves through the east door.

#### 3.8.12 `k_kuzey` Ağıt Köprüsü (y 8.4, open air, bridge over a void, 24 x 24 m)

* **Props.** `gothic_balustrade` x16 along the span edges (z 3.0 and z 6.0 between x 24 and 30, plus both sides of the branch x 25 and x 28, z 6 to 8); NEW `gargoyle_statue` x4 on corner plinths at (24.3, 3.3), (29.7, 3.3), (24.3, 5.7), (29.7, 5.7); `ip('psx-dungeon','arch')` x3 as gothic ribs over the main span at x 25, 27, 29 (z 4.5, scale 1.6, y 4); `gp('chains_hanging')` x6 hanging into the void; `hw('lantern_hanging')` x4 from the ribs; `dg('banner_thin_red')` x4 hung from the parapet; `hw('skull_candle')` x2 at the nave end; the NEW `stone_bridge_span` mesh is the floor skin under the walkable tiles.
* **Lights.** 4 lanterns gold 1.0 / 7 m, the void glow `0xc8382f` 1.2 / 16 m (zone light), moon-blue key (6 lights).
* **VFX.** `ambient_embers` rising out of the void (x24), mist under the span, sparks where chains touch.
* **Sound.** `wind` (0.45), `chain` swing, a distant `giant` rumble every 40 s, `footstep_stone` hollow (lower pitch: bridge).
* **Vertical.** the room is the "bridge over the chasm" set piece: 8.4 m above the courtyard, about 30 m above the quarry glow; the nave facade towers above the east end (30 m), the crypt stair S8 drops away on the south branch.

#### 3.8.13 `pismanlik_mahzeni` Pişmanlık Mahzeni (y 3.6, ceiling 8, 24 x 40 m, S8 at the north end)

* **Props.** `hw('coffin')` / `kg('coffin-old')` x10 in wall niches (5 per side, z 12.5 to 17), `hw('shrine_candles')` x2 at (24.8, 17.2) and (29.2, 17.2), `gp('sarcophagus')` x2 at (25.5, 13) and (28.5, 16), `kg('crypt-large')` x3 facade pieces on the west wall, `gp('chains_hanging')` x4 on S8, soul-wisp emitters x4, `ip('psx-dungeon','arch')` x2 ossuary arches; `dg('barrier_half')` x1 at the top of S8.
* **Lights.** pale violet `0xb8b0e0` soul lights x4 (0.8 / 6 m), 2 candles gold (6 lights).
* **VFX.** `ambient_shadow_wisps` thick, `soul_wisp` x4, cold breath mist, slow flickers.
* **Sound.** `ghost` whispers positional x4 (every 20 s), `creak` of coffin lids, drips (`world/misc` positional), `footstep_stone`.
* **Vertical.** a steep 4.8 m descent under the bridge; low vault (8 m) in contrast with the open bridge above.

#### 3.8.14 `cemaat_nefi` Cemaat Nefi (y 8.4, ceiling 30, 80 x 56 m)

* **Props.** 14 `ip('nocturnal-watch','church_bench')` in two blocks (x 33 to 38 and 41 to 46, z 3.5 and 9.5) leaving the carpet lane z 5 to 7 free (`runner(30, 5, 20, 2)`); `ip('nocturnal-watch','church_altar')` at (48.6, 6.5) facing west plus `gp('altar')` at (48.2, 6.5); NEW `atonement_vessel` x4 ids `vessel_1..4` at (34, 1.5), (45, 1.5), (34, 11.5), (45, 11.5); NEW `stained_glass_window` x4 on the north and south walls at (35, 0.3), (45, 0.3), (35, 13.7), (45, 13.7) plus 4 more on the east wall flanking the altar; `ip('psx-dungeon','pillar')` scale 2.5 (15 m) x6 at (37.5, 1.4), (41.5, 1.4), (37.5, 12.6), (41.5, 12.6), (32.5, 3), (32.5, 10) `collide`; `ip('psx-dungeon','chandelier')` scale 2.2 x3 at (36, 7), (42, 7), (46, 7) y 22 on 10 m chains; `dg('banner_patternC_red')` x8 scale 3 hung from the balconies; `dg('candle_triple')` x10 on the pews and the altar steps; `gp('keystone')` x1 on the altar.
* **Upper galleries (decor, y 11.0).** `balcony(10)` along the north wall and `balcony(10)` along the south wall (the choir), with 6 hooded statues and 8 hanging banners; 8 clerestory windows at y 16 to 26 (temple variants).
* **Lights.** vessels x4 gold `0xc9a24a` 1.4 / 7 m, altar crimson 1.5 / 8 m, 3 chandeliers gold 1.2 / 10 m, the door seam glow (8 lights).
* **VFX.** 4 stained-glass shafts (P9, amber / crimson / blue, `ambient_dust` motes), gold mist rising from open vessels (`heal_burst` motes tinted gold, continuous), `candle_flame` x10; on a seal: `holy_burst` + `shield_bubble` and the lid slams.
* **Sound.** `shimmer` loop positional on each open vessel (silent when closed), a choir pad in the music bed, `world/metal_click` on lid open and `world/door_close` on seal, `bell_heavy` toll at 30 s intervals during the fight (Alyez's `Güç Yağmuru` telegraph), `footstep_stone` echoing.
* **Vertical.** the tallest room (30 m): the nave pillars, the choir balconies at 11 m, the chandeliers at 22 m and the clerestory windows at 26 m make the pews look tiny; the room is the dungeon's most beautiful.

#### 3.8.15 `kefaret_merdiveni` Kefaret Merdiveni (y 8.4 to 14.4, ceiling 22, 64 x 32 m)

* **Props.** the S9 flight is built by the builder (0.2 m risers, 64 m wide, 7 tiles long) and dressed with `dg('stairs_wide')` x2 as cheek pieces at the foot of the flight (47.8, 15.4) and (64.2, 15.4); `runner(52, 15, 2, 7)` the red runner; `ip('psx-dungeon','chandelier')` scale 2.0 x2 at (52, 18), (60, 18) y 16; `dg('banner_patternC_red')` x8 scale 2.8 (y 8) along the side walls; `gp('statue_hooded')` x6 scale 1.5 on plinths at (48.8, 16), (48.8, 18.5), (48.8, 21), (63.2, 16), (63.2, 18.5), (63.2, 21); `gp('altar')` + `gp('crystal_purple')` shrine base for the Kudret Sunağı at (49.5, 21.4); `dg('pillar_decorated')` x4 scale 1.8 at (49.2, 14.8), (62.8, 14.8), (49.2, 21.4), (62.8, 21.4); `gp('brazier')` x4 at the landings.
* **Upper balcony (decor, y 17.0).** `balcony(8)` across the east wall (x 63.6, z 15 to 21) and the west wall (x 48.4, z 16 to 21); 4 hanging banners; two `gp('statue_hooded')` giants (scale 2.2) at the top of the stair flanking the hall door.
* **Lights.** 2 chandeliers gold 1.2 / 10 m, 4 braziers crimson 1.6 / 8 m, shrine light `0xb070ff` 1.2 / 6 m, 4 wall torches 1.0 / 7 m (11 lights).
* **VFX.** `ambient_dust` in 3 shafts, `brazier_fire` x4, a faint red mist brightening toward the hall door, sparks on the shrine.
* **Sound.** footsteps on the stair (`footsteps/stone`, deeper), `bell_heavy` very distant, rising choir pad, `fire` loop.
* **Vertical.** a 6 m climb over 7 tiles under a 22 m ceiling: the hall door is the focal point, brighter and redder with every step.

#### 3.8.16 `kamarar_salonu` Kamarar Salonu (y 14.4, ceiling 30, 64 x 64 m)

* **Props.** 4 NEW `sinstone_statue` (ids `statue_1..4`) at (50.5, 24.5), (60.5, 24.5), (50.5, 34.5), (60.5, 34.5) (the visuals of the `kef_heykel` entities); NEW `rose_window` on the north wall at (55.5, 21.6) y 14 scale 1.3; `gp('altar')` on the central dais at (55.5, 29.5) `collide: false`; 6 gold candelabra (`dg('candle_triple')` stacks, scale 3) at (49.5, 29.5), (61.5, 29.5), (53, 36.6), (60.8, 36.6), (53, 23.4), (58, 23.4); the exit portal `gp('mplus_portal')` at (55.5, 35.5) and `gp('chest_epic')` at (58, 35.5) after Velkaan's death; 8 `ip('psx-dungeon','pillar')` scale 2.6 (15.6 m) along the walls at (49, 26), (49, 33), (63, 26), (63, 33), (50, 37.2), (62.6, 37.2), (49, 22.8), (63, 22.8); `dg('banner_patternC_red')` x10 scale 3.2 (y 9).
* **Upper gallery ring (decor, y 11.0).** `balcony(14)` on the four walls with 8 hooded statues and 8 banners hanging 8 m; the ceiling is ribbed at 30 m with 4 massive chandeliers (`ip('psx-dungeon','chandelier')` scale 3.0) at (53, 27), (58, 27), (53, 32), (58, 32) y 24 on 14 m chains.
* **Lights.** rose-window shaft (P9, red, no light), 4 statue eyes (one shared crimson light 1.0 / 8 m per statue pair, 2 lights), ritual ring zone light crimson 1.8 / 14 m, 3 shared candelabra lights gold 1.0 / 7 m, 4 chandeliers gold 1.0 / 10 m (10 lights).
* **VFX.** the rose-window shaft drifts across the floor over the fight (slow), the ritual ring pulses, statue eyes and brow cracks glow red, `ambient_embers` falling from the vault, ash, the dais mist.
* **Sound.** a choir + pipe organ bed (music), `giant` low statue groans when they move, `stones` grind on glides, `bell_heavy` on the Chorus beat, `shimmer` hum on the ring.
* **Vertical.** the highest floor of the dungeon at 14.4 m under a 30 m vault: the player is on top of everything seen before (the courtyard, the terrace, the bridge are visible through the south windows), the red window above, the four giants around.

---



## 4. Trash

### 4.0 Design rules for this dungeon's trash (CORE_MECHANICS §16, ROADMAP F10)

* **13 definitions = 12 attacking types + 1 neutral set-piece entity** (`kef_tormented`). Every attacking type has **2 to 4 telegraphed attacks** (basic swing included, passives not counted), each with a distinct, readable windup.
* **Windup rule (R-W).** For melee, charge, projectile and line / area attacks: `windup = clamp(0.45 + 0.25 x coef, 0.45, 1.2)` seconds, where `coef` is the coefficient of the hit the windup belongs to (so coef 1.0 = 0.70 s, 1.6 = 0.85 s, 2.4 = 1.05 s, 3.0 or more = 1.20 s). Ground circles and lines (`g` in the tables) add **+0.4 s** of ground telegraph on top, so the player has time to leave. Casts keep their own `castTime` (they are interrupt checks, not swings).
* **Strings.** A string is 2 or 3 hits in one animation chain (`params.hits`, NEW P18): hit 1 uses R-W for its coef, hits 2 and 3 start 0.1 s after the previous impact and use R-W for their own coef; a **delayed** hit (`D`) holds an extra 0.3 to 0.6 s with the weapon raised before the swing (the tell for the big hit). Tables write a string as `1.1 > 2.8 (D 0.35)`.
* **Posture (Duruş).** `src/combat/poise.ts` already gives every rank a bar (swarm 6, trash 24, elite 100, party-scaled for elites). `EnemyDef.poise` overrides it. In this dungeon the two **elites** (Reaver, Sigar) and the Slasher carry explicit bars (table). A broken bar opens a 2 s window of x1.25 damage and `marked_crit`; for the CC-immune Stoneborn and Sigar hard CC converts to poise damage (Combat.ts), so **posture is their only "CC"**; hyper-armour cuts poise damage by half during heavy windups (elite 0.5), so the intended break moments are the recoveries between strings.
* **Role mix per pack.** Every caster pack holds a kick-caster; every big pack has a brute to kite or a flanker to peel; the healer (`kef_rahip`) is a **kill-first** target that sits at the back; swarms are the cleave and Bursting check; the elites are the posture checks.
* **Dungeon-specific set pieces (2).** (1) **Stone statues wake** (M3, section 3.5): Slashers and the Reaver stand frozen until a player gets within 7 m. (2) **Tormented souls and Dark Communion** (M10): Sigar eats the neutral souls to heal, so the cleave on the souls is the counter. Terrain adds the Lament bridge (M14) and the stair fights (M15).

### 4.1 Roster (13 trash defs, ids `kef_*`)

`HP x` / `DMG x` multiply the level-60 baselines `monsterHP(60) = 2246` and `monsterDmg(60) = 284` (GDD_CONTENT §0.3); Fortified, Tyrannical, key level and party scaling come on top (CORE_MECHANICS §6). Flags: **I** interruptible cast, **D** dispellable effect (status has `dispellable: true`), **F** frontal, **S** stun, **CC-imm** hard-CC immune (CC converts to poise damage), **P** posture bar value (`poise`).

| id | Ad (TR) | WoW source | model | scale | tint | role / rank | P | HP x | DMG x | speed | aggro m | forces | atks | interrupt priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `kef_darkblade` | Yozlaşmış Karabıçak | Depraved Darkblade | `characters/Rogue.glb` | 1.0 | 0x5a1822 | flanker melee / trash | 24 | 1.3 | 1.4 | 7.0 | 10 | 4 | 3 | - |
| `kef_tazici` | Yozlaşmış Tazıcı | Depraved Houndmaster | `characters/Rogue_Hooded.glb` | 1.0 | 0x6a2430 | ranged buffer / trash | 24 | 1.1 | 1.1 | 5.6 | 12 | 5 | 3 | HIGH (Sadık Av) |
| `kef_gargon` | Vahşi Gargon | Vicious Gargon | `gen/creatures/wolf_dire.glb` | 1.0 | 0x6f6c80 | beast melee / trash | 19 | 1.2 | 1.1 | 7.6 | 9 | 3 | 3 | - |
| `kef_obliterator` | Yozlaşmış Yok Edici | Depraved Obliterator | `characters/Mage.glb` | 1.0 | 0x7a1c2a | **kick-caster** / trash | 24 | 1.2 | 1.2 | 4.9 | 12 | 5 | 3 | HIGH (Kötü Ok); Yok Ediş İşareti **D** |
| `kef_toplayici` | Yozlaşmış Toplayıcı | Depraved Collector | `characters/Mage.glb` | 1.0 | 0x3a1a3c | **kick-caster** / trash | 24 | 1.2 | 1.0 | 4.9 | 12 | 5 | 3 | HIGH (Can Emme); Ruh Lekesi **D** |
| `kef_rahip` | Anima Rahibi | (new: Venthyr acolyte, not in WoW, deviation D6) | `characters/Mage.glb` | 1.0 | 0xd8c8a0 | **healer** caster / trash | 24 | 1.0 | 0.9 | 4.8 | 12 | 5 | 3 | HIGH (Anima Şifası), medium (Kalkan); **kill first** |
| `kef_kiyici` | Taş Kıyıcı | Stoneborn Slasher | `characters/Barbarian.glb` | 1.1 | 0x8a8898 | **brute** melee / trash, CC-imm | 60 | 1.9 | 1.5 | 6.0 | 9 | 6 | 3 | HIGH (Taş Çığlığı) |
| `kef_yagmaci` | Taşkıran Yağmacı | Stoneborn Reaver | `characters/Knight.glb` | 1.2 | 0x6a6878 | **elite tank** / elite, CC-imm | **140** | 2.8 | 1.5 | 5.4 | 10 | 8 | 4 | HIGH (Taşa Çevir) |
| `kef_parcalayici` | Taş Parçalayıcı | Stoneborn Eviscerator | `monsters/Orc.glb` | 1.0 | 0x7a788c | **brute** melee / trash | 40 | 1.6 | 1.5 | 5.8 | 10 | 6 | 3 | - |
| `kef_kemirgen` | Taş Kemirgen | Stonefiend Anklebiter | `gen/creatures/golem_stone.glb` | 0.4 | 0x5c5a6c | **swarm** / trash | 6 | 0.6 | 0.9 | 7.6 | 9 | 2 | 2 | - |
| `kef_bahcivan` | Bataklık Bahçıvanı | Toiling Groundskeeper | `monsters/Zombie.glb` | 1.05 | 0x5a5230 | **brute** melee / trash (skittish) | 30 | 1.9 | 1.2 | 5.0 | 9 | 5 | 3 | - |
| `kef_sigar` | Engizisyoncu Sigar | Inquisitor Sigar | `characters/Mage.glb` | 1.25 | 0x8a1a2a | **elite caster** / elite, CC-imm | **120** | 4.4 | 1.6 | 5.0 | 12 | 12 | 4 | HIGH (Komünyon) |
| `kef_tormented` | Işkence Gören Ruh | Tormented Souls | `monsters/Ghost.glb` | 0.6 | 0xc8c0e0 | neutral swarm / set piece | 6 | 0.3 | 0 | 3.0 | 0 | 0 | - | - |

Mechanic and boss-add entities (not counted in the 13; defined in section 4.4 and section 5): `kef_shard` Halkor Kıymığı, `kef_taskoz` Ölümsüz Taş Canavarı, `kef_cemaat` Hayalet Cemaat Üyesi, `kef_heykel` Günah Heykeli.

### 4.2 Abilities

Every ability maps onto the builders in the enemy kit (`cone`, `proj`, `aoe`, `line`, `charge`, `buff`, `heal`, `passive`, `onDeath`; section 4.4). All windups follow R-W (section 4.0); `g` = ground telegraph included (+0.4 s). `target` params: 0 threat, 1 random player, 3 random non-tank. Strings are written `c1 > c2 (D = delayed hold)`.

| enemy | ability (id) | TR name | kind / shape | cast / windup | cd (first) | coef | flags / counter |
|---|---|---|---|---|---|---|---|
| darkblade | `kef_darkblade_slash` (basic) | Kara Kesik | cone 1.9 m 90° | 0.70 | 1.5 | 1.0 + `kefaret_brand` 1 stack (10 s, max 5) | stacking damage-taken debuff on the tank: swap or defensive; **F** |
| darkblade | `kef_darkblade_dash` | Gölge Atılışı | charge 8 m, random non-tank | 0.85 | 14 (5) | 1.6 | dodge the line |
| darkblade | `kef_darkblade_flurry` | Çifte Kesik | **string of 2**, cone 2.2 m 120° | 0.68 then 0.78 | 11 (8) | 0.9 > 1.3 | on the tank; the second hit lands 0.1 s after the first: a defensive on the string, not the hit; **F** |
| tazici | `kef_tazici_shot` (basic) | Zincirli Ok | projectile, random player | 0.70 | 2.4 | 1.0 | unavoidable chip |
| tazici | `kef_tazici_call` | Sadık Av | buff_ally, radius 12, `empower` +50% 10 s | cast 2.0 **I** | 18 (4) | - | **interrupt it** or the Gargons hit 50% harder; killing the Tazıcı first shortens it |
| tazici | `kef_tazici_snare` | Zincirli Kement | ground_aoe r 2.5 on a random player, `slow` 3 s **D** | 1.15 g | 15 (7) | 1.2 | step out; the slow is dispellable |
| gargon | `kef_gargon_bite` (basic) | Taş Isırık | cone 1.9 m 100° | 0.68 | 1.4 | 0.9 + bleed 1 stack (8 s, max 5) | **D** bleed; kite or cleanse stacks |
| gargon | `kef_gargon_pounce` | Atlayış | charge 6 m on a random non-tank, 0.35 s dash | 0.78 | 10 (6) | 1.3 | sidestep; the pack scatters onto the casters |
| gargon | `kef_gargon_howl` | Gece Uluması | buff_ally radius 10, `haste` +20% 6 s on all Gargons | cast 1.2 | 20 (10) | - | burst the pack; a Tazıcı `empower` plus a howl stacks the damage |
| obliterator | `kef_obliterator_bolt` (basic) | Kefaret Oku | projectile shadow | 0.68 | 2.6 | 0.9 | |
| obliterator | `kef_obliterator_wicked` | Kötü Ok | projectile shadow, tank | cast 2.2 **I** | 9 (3) | 2.4 | **interrupt (priority 1)** |
| obliterator | `kef_obliterator_mark` | Yok Ediş İşareti | marks a random non-tank with `sin_mark` (3 s fuse, P6), then a circle r 3 bursts on the holder | 1.5 g (mark), 3.0 s fuse | 16 (6) | 2.6 | **D** `sin_mark` is a dispellable curse: **a dispel removes the mark and cancels the burst** (WoW: Mark of Obliteration is dispelled); otherwise walk out of the group |
| toplayici | `kef_toplayici_bolt` (basic) | Ruh Oku | projectile shadow | 0.68 | 2.6 | 0.9 | |
| toplayici | `kef_toplayici_siphon` | Can Emme | custom channel on a random player (clone of `crypt_wraith_drain`, heals itself 200%) | cast 3.0 **I** | 13 (4) | 0.5 per 0.5 s | **interrupt or CC (priority 2)** |
| toplayici | `kef_toplayici_stain` | Ruh Lekesi | projectile shadow on a random player, `curse` 6 s (-20% damage) **D** | 0.83 | 15 (6) | 1.5 | dispel it; dispels are a real resource in this dungeon |
| rahip | `kef_rahip_spark` (basic) | Hüküm Kıvılcımı | projectile holy | 0.63 | 2.4 | 0.7 | chip |
| rahip | `kef_rahip_heal` | Anima Şifası | heal_ally 25% max HP, the most hurt ally in 18 m | cast 2.5 **I** | 12 (4) | - | **interrupt (priority 1)**; two healers in a pull out-heal the DPS, kill the first |
| rahip | `kef_rahip_ward` | Anima Kalkanı | buff_ally `shield` 10% max HP on one ally, 8 s **D** | cast 1.6 **I** (medium) | 20 (9) | - | dispel or burst through; casts on the elite |
| kiyici | `kef_kiyici_chop` (basic) | Taş Balta | cone 2.6 m 80° | 0.70 | 2.0 | 1.0 | |
| kiyici | `kef_kiyici_cleave` | Kıyma | **string of 2**, cone 2.6 m 80° then cone 5.0 m 70° with telegraph and knockback 4 | 0.73 then 1.15 (D 0.35) | 11 (5) | 1.1 > 2.8 | **F**: the second hit is the delayed tell (raised axe); face it away from the group; its recovery is the posture window |
| kiyici | `kef_kiyici_screech` | Taş Çığlığı | self_aoe r 8, `silence` 3 s | cast 1.5 **I** | 16 (8) | 0.6 | **interrupt (priority 3)**; the silence cancels player casts |
| yagmaci | `kef_yagmaci_slash` (basic) | Taş Pala | cone 2.8 m 90° | 0.70 | 2.2 | 1.0 | |
| yagmaci | `kef_yagmaci_mortal` | Ölümcül Darbe | cone 3.2 m 60°, tank buster, not parryable | 1.20 | 10 (4) | 3.4 + `mortal_wound` 8 s (healing received x0.5) | **F**, big defensive; `perilous` (a poise break cannot stop it) |
| yagmaci | `kef_yagmaci_stone` | Taşa Çevir | self_aoe r 7, `petrify` 5 s | cast 2.2 **I** | 22 (10) | 0.5 | **S**, **D** (petrify is dispellable); **interrupt**, or stay out of 7 m |
| yagmaci | `kef_yagmaci_rush` | Kalkan Hamlesi | charge 6 m with the shield up (shield bash), knockback 3 | 0.83 | 15 (9) | 1.5 | dodge the line or take it on the tank; the shield side is the frontal |
| parcalayici | `kef_parcalayici_cleave` (basic) | Taş Pala | cone 2.8 m 90° | 0.70 | 2.0 | 1.0 | |
| parcalayici | `kef_parcalayici_glaive` | Kılıç Fırlat | line 22 x 2.4 m on a random player | 1.40 g | 11 (5) | 2.2 | cleaves everything in the line: spread |
| parcalayici | `kef_parcalayici_whirl` | Dönen Kılıç | self_aoe r 3.6, 360° | 1.30 g | 17 (9) | 1.8 | melee step out; the tank walks the pack away from the casters |
| kemirgen | `kef_kemirgen_bite` (basic) | Ayak Bileği Isırığı | cone 1.3 m 100° | 0.63 | 1.2 | 0.7 + bleed 1 stack (6 s) | **D**; swarm: AoE it, Bolstering and Bursting count every 3rd death |
| kemirgen | `kef_kemirgen_leap` | Sıçrama | charge 6 m on a random player | 0.68 | 9 (4) | 0.9 | the swarm spreads across the group; cleave from the centre |
| bahcivan | `kef_bahcivan_spade` (basic) | Kürek | cone 2.2 m 100° | 0.70 | 2.0 | 1.0 | |
| bahcivan | `kef_bahcivan_swing` | Kürek Savurma | **string of 2**, cone 2.4 m 110° | 0.70 then 0.85 (D 0.3) | 9 (5) | 1.0 > 1.6 | the second hit is delayed: sidestep |
| bahcivan | `kef_bahcivan_muck` | Bataklık Çamuru | ground_aoe r 3.2 on a random player, then a puddle (8 s, coef 0.4 per 0.5 s), `slow` 3 s | 1.05 g | 13 (4) | 0.8 | step out of puddles |
| bahcivan | `kef_bahcivan_skittish` (passive) | Ürkek | below 30% HP it flees to the nearest idle pack and pulls it | - | once | - | CC or burst it; NEW passive (P7) |
| sigar | `kef_sigar_bolt` (basic) | Hüküm Oku | projectile shadow | 0.73 | 2.4 | 1.1 | |
| sigar | `kef_sigar_communion` | Karanlık Komünyon | custom channel on himself: heals 10% max HP, +6% per neutral soul within 10 m (souls are consumed) | cast 4.0 **I** | 24 (8) | - | **interrupt**, break his posture, or cleave the souls first |
| sigar | `kef_sigar_disperse` | Günah Dağıtımı | 2 ground_aoe r 3.5 on random players, puddle 8 s | 1.25 g | 14 (5) | 1.6 + 0.5 per 0.5 s | step out |
| sigar | `kef_sigar_display` | Güç Gösterisi | **marks 3 players for 6 s with `sin_amplified` (damage and healing taken +30%, P6); at expiry each marked player bursts, circle r 6** | cast 1.2 | 28 (14) | burst 1.6 | WoW core: *Display of Power amplifies all damage and healing, spread before it expires*; the burst is our addition (D2). Spread so the bursts do not overlap amplified players; never pull two Sigars together (the amplification of two stacks to +60%) |
| tormented | (none) | - | neutral, drifts toward the Inquisitor | - | - | - | set piece (M10) |

**Counts.** Attacks per attacking type: Darkblade 3, Tazıcı 3, Gargon 3, Obliterator 3, Collector 3, Rahip 3, Slasher 3, Reaver 4, Eviscerator 3, Anklebiter 2, Groundskeeper 3 (+1 passive), Sigar 4. Interrupt checks per pack are in section 6.3.

### 4.3 Packs (34 packs, validated)

`PackDef` rows exactly as in the data file (section 3.6). Members listed casters last. `big` = designed big pull (Katliam spot). **y** = floor height at the pack centre.

| pack | room | centre (tiles) | y | members | forces | notes |
|---|---|---|---|---|---|---|
| k_p01 | narteks | 30.5, 51.5 | 2.4 | Yozlaşmış Karabıçak (`kef_darkblade`) x2, Yozlaşmış Tazıcı (`kef_tazici`) x1 | **13** | |
| k_p02 | narteks | 33.5, 49.3 | 2.4 | Vahşi Gargon (`kef_gargon`) x3, Yozlaşmış Tazıcı (`kef_tazici`) x1 | **14** | |
| k_p03 | tas_galerisi | 21, 43.5 | 2.4 | Taş Kıyıcı (`kef_kiyici`) x2 | **12** | dormant `statue` r 7 m; big pull |
| k_p04 | tas_galerisi | 37, 43.5 | 2.4 | Yozlaşmış Karabıçak (`kef_darkblade`) x1, Yozlaşmış Yok Edici (`kef_obliterator`) x1, Yozlaşmış Toplayıcı (`kef_toplayici`) x1 | **14** | |
| k_p05 | tas_galerisi | 28.5, 44 | 2.4 | Taş Parçalayıcı (`kef_parcalayici`) x1, Taş Kemirgen (`kef_kemirgen`) x4 | **14** | patrol (22,45) <-> (41,45) |
| w_p06 | kiymik_bati | 11, 42 | 0.0 | Halkor Kıymığı (`kef_shard`) x1, Yozlaşmış Yok Edici (`kef_obliterator`) x1, Yozlaşmış Toplayıcı (`kef_toplayici`) x1 | **14** | |
| w_p07 | kiymik_bati | 10, 45.5 | 0.0 | Vahşi Gargon (`kef_gargon`) x2 | **6** | |
| e_p08 | kiymik_dogu | 52, 42 | 2.4 | Halkor Kıymığı (`kef_shard`) x1, Yozlaşmış Yok Edici (`kef_obliterator`) x1, Yozlaşmış Toplayıcı (`kef_toplayici`) x1 | **14** | |
| e_p09 | kiymik_dogu | 52, 45.5 | 2.4 | Taş Kemirgen (`kef_kemirgen`) x3 | **6** | |
| n_p10 | kiymik_kuzey | 43.5, 33 | 4.2 | Halkor Kıymığı (`kef_shard`) x1, Yozlaşmış Yok Edici (`kef_obliterator`) x1, Yozlaşmış Toplayıcı (`kef_toplayici`) x1 | **14** | |
| n_p11 | kiymik_kuzey | 43.5, 36.5 | 4.2 | Vahşi Gargon (`kef_gargon`) x2 | **6** | |
| b_p12 | k_bati | 12, 30.5 | 3.6 | Yozlaşmış Karabıçak (`kef_darkblade`) x2, Anima Rahibi (`kef_rahip`) x1 | **13** | healer pack: kill the Rahip first |
| b_p13 | k_bati | 19, 31 | 3.6 | Taşkıran Yağmacı (`kef_yagmaci`) x1, Taş Kıyıcı (`kef_kiyici`) x1 | **14** | stands at the foot of S6 |
| c_p14 | gargoyle_avlusu | 8, 24 | 3.6 | Bataklık Bahçıvanı (`kef_bahcivan`) x2, Taş Kemirgen (`kef_kemirgen`) x3 | **16** | |
| c_p15 | gargoyle_avlusu | 15, 24.5 | 3.6 | Vahşi Gargon (`kef_gargon`) x3, Yozlaşmış Tazıcı (`kef_tazici`) x1, Anima Rahibi (`kef_rahip`) x1 | **19** | |
| c_p16 | gargoyle_avlusu | 20, 21 | 3.6 | Taş Parçalayıcı (`kef_parcalayici`) x2, Taş Kemirgen (`kef_kemirgen`) x2 | **16** | |
| c_p17 | gargoyle_avlusu | 11, 20.5 | 3.6 | Taşkıran Yağmacı (`kef_yagmaci`) x1, Taş Kıyıcı (`kef_kiyici`) x2 | **20** | dormant `statue` r 7 m; big pull |
| c_p18 | gargoyle_avlusu | 6, 18.5 | 3.6 | Yozlaşmış Karabıçak (`kef_darkblade`) x2, Yozlaşmış Yok Edici (`kef_obliterator`) x1, Yozlaşmış Toplayıcı (`kef_toplayici`) x1 | **18** | big pull |
| c_p19 | gargoyle_avlusu | 17, 17.5 | 3.6 | Yozlaşmış Karabıçak (`kef_darkblade`) x2, Taş Kemirgen (`kef_kemirgen`) x1 | **10** | patrol (17,17.5) <-> (17,25) |
| e_p20 | k_ekelon | 4, 13.5 | 6.6 | Yozlaşmış Karabıçak (`kef_darkblade`) x1, Yozlaşmış Tazıcı (`kef_tazici`) x1, Anima Rahibi (`kef_rahip`) x1 | **14** | on S7 (stair fight, M15) |
| e_p21 | k_ekelon | 12, 13.5 | 6.6 | Taş Parçalayıcı (`kef_parcalayici`) x1, Taş Kemirgen (`kef_kemirgen`) x2 | **10** | on S7 |
| a_p22 | k_kuzey | 27, 4.4 | 8.4 | Yozlaşmış Karabıçak (`kef_darkblade`) x1, Yozlaşmış Yok Edici (`kef_obliterator`) x1, Yozlaşmış Toplayıcı (`kef_toplayici`) x1 | **14** | on the bridge span |
| a_p23 | k_kuzey | 26.8, 6.9 | 8.4 | Vahşi Gargon (`kef_gargon`) x3, Anima Rahibi (`kef_rahip`) x1 | **14** | on the bridge branch |
| m_p24 | kefaret_merdiveni | 52, 16.5 | 9.7 | Engizisyoncu Sigar (`kef_sigar`) x1, Işkence Gören Ruh (`kef_tormented`) x3, Yozlaşmış Yok Edici (`kef_obliterator`) x1 | **17** | on S9 |
| m_p25 | kefaret_merdiveni | 58, 16.5 | 9.7 | Taşkıran Yağmacı (`kef_yagmaci`) x1, Taş Kıyıcı (`kef_kiyici`) x1, Anima Rahibi (`kef_rahip`) x1 | **19** | on S9; the Reaver is shielded by the Rahip |
| m_p26 | kefaret_merdiveni | 53, 19.5 | 12.3 | Vahşi Gargon (`kef_gargon`) x3, Yozlaşmış Tazıcı (`kef_tazici`) x1, Anima Rahibi (`kef_rahip`) x1 | **19** | on S9 |
| m_p27 | kefaret_merdiveni | 60, 19.5 | 12.3 | Engizisyoncu Sigar (`kef_sigar`) x1, Işkence Gören Ruh (`kef_tormented`) x3, Yozlaşmış Toplayıcı (`kef_toplayici`) x1 | **17** | on S9 |
| m_p28 | kefaret_merdiveni | 56, 15 | 8.4 | Yozlaşmış Karabıçak (`kef_darkblade`) x2, Yozlaşmış Tazıcı (`kef_tazici`) x1, Vahşi Gargon (`kef_gargon`) x1 | **16** | patrol (50,15) <-> (61,15) along the foot of S9 |
| o_p29 | arsiv | 50.5, 52.2 | 0.0 | Yozlaşmış Yok Edici (`kef_obliterator`) x2, Yozlaşmış Toplayıcı (`kef_toplayici`) x2 | **20** | *optional* |
| o_p30 | arsiv | 54.5, 52 | 0.0 | Taşkıran Yağmacı (`kef_yagmaci`) x1, Taş Kemirgen (`kef_kemirgen`) x6 | **20** | *optional* |
| o_p31 | pismanlik_mahzeni | 26.5, 14.6 | 3.6 | Bataklık Bahçıvanı (`kef_bahcivan`) x2, Taş Kemirgen (`kef_kemirgen`) x4 | **18** | *optional* |
| o_p32 | pismanlik_mahzeni | 26.5, 16.9 | 3.6 | Vahşi Gargon (`kef_gargon`) x3, Anima Rahibi (`kef_rahip`) x1, Yozlaşmış Karabıçak (`kef_darkblade`) x1 | **18** | *optional* |
| s_p33 | servis_gecidi | 1.5, 29 | 3.6 | Yozlaşmış Karabıçak (`kef_darkblade`) x3 | **12** | |
| s_p34 | servis_gecidi | 1.5, 21 | 3.6 | Yozlaşmış Tazıcı (`kef_tazici`) x1, Vahşi Gargon (`kef_gargon`) x1, Taş Kemirgen (`kef_kemirgen`) x2 | **12** | |

**Forces summary.** Narthex 27, gallery 40, shard chambers 20 + 20 + 20 (section 1 = **127**); colonnade 27, courtyard 99, Gözcü stairs 24 (section 2 = **150**); lament bridge 28 (section 3 = **28**); grand stair 88 (section 4 = **88**). Mandatory total **393** (103.4% of 380). Optional: Archive 40, crypts 36 (= 76). Route-B passage 24. **All packs: 493.** (Unchanged by the healer swaps: the Rahip is worth 5, like the Tazıcı or Collector it replaced.)

**Pack design notes.**

* **Section 1 shard packs** (`w_p06`, `e_p08`, `n_p10`) each hold the `kef_shard` plus one Obliterator and one Collector ("Obliterators and Collectors spawn near the shards"), the interrupt check of the dungeon opening. Shard chambers are reached one by one so each pull is small; the gallery pulls `k_p03` + `k_p04` + patrol `k_p05` combine into the first 40-force big pull. The west chamber is reached down S2, so its fight is 2.4 m below the gallery and nothing from the gallery sees it.
* **Dormant statues** (`k_p03`, `c_p17`): the Slashers and the Reaver stand as grey statues until a player is within 7 m (P2). They are the "Stoneborn out of combat" fantasy and they punish players who run past for the west chamber. Their posture bars (60 and 140) are the answer: break the Reaver on the first Mortal Strike recovery and it is a free 2 s window.
* **Courtyard** (`c_p14` to `c_p19`, 99 forces) is the densest room: two patrol-adjacent packs, one dormant statue pack (`c_p17`: Reaver + two Slashers, all CC-immune) next to a caster pack (`c_p18`). That pairing is the **dangerous pull** of the dungeon (section 6.3). `c_p15` carries the first healer: the Rahip heals the Gargons and shields the Tazıcı.
* **Patrols** loop slowly (patrol speed 0.45 of def speed): `k_p05` along the gallery z = 44 to 45 (about 60 s per lap), `c_p19` N-S on x = 17 inside the courtyard, `m_p28` E-W across the foot of the grand stair at z = 15. A patrol in combat drags idle packs within 4 m (GDD_CONTENT §0.5).
* **Sigar packs** (`m_p24`, `m_p27`) each include three `kef_tormented` (neutral, 0 forces). They sit 8 tiles apart on the slope: pulling both Sigars together stacks two Güç Gösterisi amplifications (+60%) and overlapping bursts, a wipe risk at +12. Pulling them one at a time is the standard route (6.1).
* **Bridge packs** (`a_p22`, `a_p23`) have no knockbacks and no charges that push players; the caster pack fights on the span and the Gargon pack on the branch (a stray Gargon pounce lands on the span, not into the void).
* **Optional rooms** carry the "reward" density: the Archive holds the second-strongest Obliterator/Collector pair; the crypts the Groundskeepers whose skittish flee drags the second pack (design intent: fight the crypts with CC ready).
* **Servants' passage** (`s_p33`, `s_p34`) is deliberately light: three Darkblades (stacking brand on the tank, no casters) and a Tazıcı/Gargon/Anklebiter mix.

### 4.4 Enemy definitions (ready to paste, new file `src/data/enemies_kefaret.ts`)

**Import structure (fixes the circular-import risk of revision 1).** P7 **moves** the builders (`add`, `cone`, `proj`, `aoe`, `line`, `charge`, `buff`, `heal`, `passive`, `onDeath`, `MECH`, `NOOP`, `bleed`, `custom`, `bp`, `boss`, the `CHAR` / `MON` / `GEN` / `GENB` / `SKEL` model helpers, the `A_*` animation sets, the hide lists `ROGUE_HIDE`, `KNIGHT_HIDE`, `mageHide`, the resist tables, the `Ab` type) **and the `ENEMIES` / `BOSSES` registries** out of `data/enemies.ts` into `src/data/enemyKit.ts`. `data/enemies.ts` then imports them from `./enemyKit` and re-exports `ENEMIES` and `BOSSES` unchanged for the rest of the game. This dungeon's file `src/data/enemies_kefaret.ts` imports **only from `./enemyKit`** (never from `./enemies`), and `data/enemies.ts` (or `data/index`) imports `./enemies_kefaret` for its side effects after the kit is evaluated. No module in the chain imports `enemies.ts` back, so there is no cycle and no uninitialised `const` at load. The file is named `enemies_kefaret.ts` next to `enemies.ts`, not `enemies/kefaret.ts`, to avoid a directory that shadows the existing module. The "paste at the end of `data/enemies.ts`" stop-gap of revision 1 is **removed**.

P7 also extends `Spec` and `def()` so the data below can carry the posture fields that `src/types/enemies.ts` already has (`poise`, `poiseRegen`, `poiseDelay`, `hyperArmor`, `stanceBreakable`, `family`): today `def()` drops them.

Clip names marked `*` are not present on the rig named: `kef_kiyici`, `kef_yagmaci` and `boss_ekelon` use `clipsFrom: SKEL('Skeleton_Warrior')` (that file has `Taunt`, `Spawn_Air`, `Spellcast_Summon`, `1H_Melee_Attack_Jump_Chop`; Knight and Barbarian do not, verified with `node tools/glb-inspect.mjs`; `boss_tugrul` already does this). Run the inspector again on every clip of this section before pasting; fall back to `1H_Melee_Attack_Slice_Horizontal`, `Spellcast_Shoot` or `Cheer`.

```ts
// src/data/enemies_kefaret.ts
import { add, cone, proj, aoe, line, charge, buff, heal, passive, bleed, MECH, NOOP, custom, bp, boss, CHAR, MON, GEN, GENB, SKEL,
  A_KAYKIT, A_GEN, A_CHAR, A_ENEMY, A_FLY, ROGUE_HIDE, KNIGHT_HIDE, mageHide, R_GHOST, R_GOLEM, type Ab, type EnemyDef } from './enemyKit';

const BARB_HIDE = ['1H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Mug', 'Barbarian_Hat'];
const R_STONE: EnemyDef['resist'] = { physical: 0.25, fire: 0.3, frost: 0.3, lightning: -0.2, shadow: 0.15, poison: 0.75, holy: -0.15 };
const R_VENTHYR: EnemyDef['resist'] = { physical: 0.05, fire: 0.1, frost: 0.1, lightning: 0.1, shadow: 0.25, holy: -0.2 };
/** R-W: windup for a hit of coefficient c (section 4.0). */
const W = (c: number, ground = false) => +(Math.min(1.2, Math.max(0.45, 0.45 + 0.25 * c)) + (ground ? 0.4 : 0)).toFixed(2);
/** P18 string: params for hits 2 and 3 (coef, windup by R-W, extra hold). */
const STR = (c2: number, hold2 = 0, c3?: number, hold3 = 0) => ({ hits: c3 ? 3 : 2, c2, w2: W(c2), hold2, ...(c3 ? { c3, w3: W(c3), hold3 } : {}) });

add({ id: 'kef_darkblade', name: 'Yozlaşmış Karabıçak', model: CHAR('Rogue'), scale: 1, tint: 0x5a1822, role: 'melee', rank: 'trash', hp: 1.3, dmg: 1.4, speed: 7.0, radius: 0.5, aggro: 10, forces: 4,
  anims: A_KAYKIT, resist: R_VENTHYR, visual: { hide: ROGUE_HIDE.filter((n) => n !== 'Knife' && n !== 'Knife_Offhand'), runRef: 7 },
  basic: cone('kef_darkblade_slash', 'Kara Kesik', 1.9, 90, 1.5, 1.0, 'Dualwield_Melee_Attack_Slice', 0.5, { windup: W(1.0), statuses: [{ status: 'kefaret_brand', duration: 10, stacks: 1 }] }),
  abilities: [
    charge('kef_darkblade_dash', 'Gölge Atılışı', 8, 14, W(1.6), 1.6, 'Dualwield_Melee_Attack_Stab', 0.75, { initialCooldown: 5, params: { target: 3 } }),
    cone('kef_darkblade_flurry', 'Çifte Kesik', 2.2, 120, 11, 0.9, 'Dualwield_Melee_Attack_Chop', 0.4, { initialCooldown: 8, windup: W(0.9), telegraph: true, params: STR(1.3) }),
  ] });

add({ id: 'kef_tazici', name: 'Yozlaşmış Tazıcı', model: CHAR('Rogue_Hooded'), scale: 1, tint: 0x6a2430, role: 'ranged', rank: 'trash', hp: 1.1, dmg: 1.1, speed: 5.6, radius: 0.5, aggro: 12, forces: 5,
  anims: A_KAYKIT, resist: R_VENTHYR, ai: { kite: [10, 16] }, visual: { hide: ROGUE_HIDE.filter((n) => n !== '2H_Crossbow'), runRef: 7 },
  basic: proj('kef_tazici_shot', 'Zincirli Ok', 28, 22, 2.4, W(1.0), 1.0, 'physical', 'arrow_projectile', '2H_Ranged_Shoot', 0.15, { params: { target: 1 } }),
  abilities: [
    buff('kef_tazici_call', 'Sadık Av', 2.0, 18, [{ status: 'empower', duration: 10, magnitude: 0.5 }], 'Spellcast_Raise', 1.0, { kick: 2, initialCooldown: 4, params: { radius: 12 } }),
    aoe('kef_tazici_snare', 'Zincirli Kement', 'ground_aoe', 2.5, 20, 15, W(1.2, true), 1.2, 'physical', '2H_Ranged_Shoot', 0.2, { initialCooldown: 7, statuses: [{ status: 'slow', duration: 3 }], params: { target: 1 } }),
  ] });

add({ id: 'kef_gargon', name: 'Vahşi Gargon', model: GEN('wolf_dire'), scale: 1, tint: 0x6f6c80, role: 'melee', rank: 'trash', hp: 1.2, dmg: 1.1, speed: 7.6, radius: 0.55, aggro: 9, forces: 3, poise: 19,
  anims: A_GEN, resist: R_STONE, visual: { eyeEmissive: 0xc8382f, runRef: 6 },
  basic: cone('kef_gargon_bite', 'Taş Isırık', 1.9, 100, 1.4, 0.9, 'Attack', 0.4, { windup: W(0.9), statuses: [bleed(1, 0.2, 8)] }),
  abilities: [
    charge('kef_gargon_pounce', 'Atlayış', 6, 10, W(1.3), 1.3, 'Attack', 0.5, { initialCooldown: 6, params: { target: 3, dash: 0.35 } }),
    buff('kef_gargon_howl', 'Gece Uluması', 1.2, 20, [{ status: 'haste', duration: 6, magnitude: 0.2 }], 'Attack', 0.6, { initialCooldown: 10, interruptible: false, params: { radius: 10 } }),
  ] });

add({ id: 'kef_obliterator', name: 'Yozlaşmış Yok Edici', model: CHAR('Mage'), scale: 1, tint: 0x7a1c2a, role: 'caster', rank: 'trash', hp: 1.2, dmg: 1.2, speed: 4.9, radius: 0.55, aggro: 12, forces: 5,
  anims: A_KAYKIT, resist: R_VENTHYR, ai: { kite: [9, 15] }, visual: { hide: mageHide('2H_Staff'), runRef: 7, clipsFrom: SKEL('Skeleton_Mage') },
  basic: proj('kef_obliterator_bolt', 'Kefaret Oku', 16, 20, 2.6, W(0.9), 0.9, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'shadow_cast' }),
  abilities: [
    proj('kef_obliterator_wicked', 'Kötü Ok', 18, 20, 9, 2.2, 2.4, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { castTime: 2.2, interruptible: true, kick: 2, initialCooldown: 3, sfx: 'shadow_cast' }),
    // custom handler (P7): marks a random non-tank with `sin_mark` (P6, 3 s, dispellable); at expiry a circle r 3 bursts on the holder unless the mark was dispelled
    { id: 'kef_obliterator_mark', name: 'Yok Ediş İşareti', kind: 'custom', range: 18, cooldown: 16, initialCooldown: 6, windup: W(2.6, true), anim: 'Spellcast_Summon', vfx: 'shadow_burst',
      damage: { coef: 2.6, type: 'shadow' }, statuses: [{ status: 'sin_mark', duration: 3 }], params: { target: 3, radius: 3, fuse: 3, impact: 1.0 } },
  ] });

add({ id: 'kef_toplayici', name: 'Yozlaşmış Toplayıcı', model: CHAR('Mage'), scale: 1, tint: 0x3a1a3c, role: 'caster', rank: 'trash', hp: 1.2, dmg: 1.0, speed: 4.9, radius: 0.55, aggro: 12, forces: 5,
  anims: A_KAYKIT, resist: R_VENTHYR, ai: { kite: [10, 16] }, visual: { hide: mageHide('2H_Staff', 'Mage_Hat'), runRef: 7, clipsFrom: SKEL('Skeleton_Mage') },
  basic: proj('kef_toplayici_bolt', 'Ruh Oku', 16, 20, 2.6, W(0.9), 0.9, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'shadow_cast' }),
  abilities: [
    { id: 'kef_toplayici_siphon', name: 'Can Emme', kind: 'custom', range: 15, cooldown: 13, initialCooldown: 4, windup: 0.5, castTime: 3.0, interruptible: true, kick: 2,
      damage: { coef: 0.5, type: 'shadow' }, anim: 'Spellcasting', params: { loop: 1, tick: 0.5, healMult: 2.0, target: 1, impact: 0.33 } },   // handler = alias of CUSTOM.crypt_wraith_drain (P7)
    proj('kef_toplayici_stain', 'Ruh Lekesi', 16, 20, 15, W(1.5), 1.5, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { initialCooldown: 6, statuses: [{ status: 'curse', duration: 6 }], params: { target: 1 }, sfx: 'shadow_cast' }),
  ] });

add({ id: 'kef_rahip', name: 'Anima Rahibi', model: CHAR('Mage'), scale: 1, tint: 0xd8c8a0, role: 'healer', rank: 'trash', hp: 1.0, dmg: 0.9, speed: 4.8, radius: 0.55, aggro: 12, forces: 5,
  anims: A_KAYKIT, resist: R_VENTHYR, ai: { kite: [10, 16] }, visual: { hide: mageHide('2H_Staff', 'Mage_Hat'), runRef: 7, clipsFrom: SKEL('Skeleton_Mage'), glow: 0xc9a24a },
  basic: proj('kef_rahip_spark', 'Hüküm Kıvılcımı', 18, 20, 2.4, W(0.7), 0.7, 'holy', 'holy_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    heal('kef_rahip_heal', 'Anima Şifası', 2.5, 12, 0.25, 'Spellcast_Long', 0.9, { kick: 2, initialCooldown: 4 }),
    buff('kef_rahip_ward', 'Anima Kalkanı', 1.6, 20, [{ status: 'shield', duration: 8, magnitude: 0.10 }], 'Spellcast_Raise', 0.9, { kick: 1, interruptible: true, initialCooldown: 9, params: { radius: 14, single: 1 } }),
  ] });

add({ id: 'kef_kiyici', name: 'Taş Kıyıcı', model: CHAR('Barbarian'), scale: 1.1, tint: 0x8a8898, role: 'melee', rank: 'trash', hp: 1.9, dmg: 1.5, speed: 6.0, radius: 0.65, aggro: 9, forces: 6, ccImmune: true, poise: 60, hyperArmor: 0.3,
  anims: A_KAYKIT, resist: R_STONE, visual: { hide: BARB_HIDE, runRef: 7, clipsFrom: SKEL('Skeleton_Warrior') },
  basic: cone('kef_kiyici_chop', 'Taş Balta', 2.6, 80, 2.0, 1.0, '2H_Melee_Attack_Chop', 0.5, { windup: W(1.0) }),
  abilities: [
    cone('kef_kiyici_cleave', 'Kıyma', 2.6, 80, 11, 1.1, '2H_Melee_Attack_Slice', 0.4, { initialCooldown: 5, windup: W(1.1), telegraph: true,
      params: { hits: 2, c2: 2.8, w2: W(2.8), hold2: 0.35, r2: 5.0, arc2: 70, kb2: 4 } }),                      // hit 2: delayed raised axe, cone 5 m 70° with knockback 4 (P18)
    aoe('kef_kiyici_screech', 'Taş Çığlığı', 'self_aoe', 8, 8, 16, 1.5, 0.6, 'physical', 'Taunt', 0.8, { castTime: 1.5, interruptible: true, kick: 2, initialCooldown: 8, statuses: [{ status: 'silence', duration: 3 }], vfx: 'shadow_burst', sfx: 'boss_cast' }),
  ] });

add({ id: 'kef_yagmaci', name: 'Taşkıran Yağmacı', model: CHAR('Knight'), scale: 1.2, tint: 0x6a6878, role: 'tank', rank: 'elite', hp: 2.8, dmg: 1.5, speed: 5.4, radius: 0.7, aggro: 10, forces: 8, ccImmune: true, poise: 140,
  anims: A_KAYKIT, resist: R_STONE, visual: { hide: KNIGHT_HIDE.filter((n) => !['1H_Sword', 'Round_Shield', 'Knight_Helmet'].includes(n)), runRef: 7, clipsFrom: SKEL('Skeleton_Warrior') },
  basic: cone('kef_yagmaci_slash', 'Taş Pala', 2.8, 90, 2.2, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.3, { windup: W(1.0) }),
  abilities: [
    cone('kef_yagmaci_mortal', 'Ölümcül Darbe', 3.2, 60, 10, 3.4, 'Block_Attack', 0.4, { initialCooldown: 4, windup: W(3.4), telegraph: true, tankBuster: true, parryable: false, perilous: true, statuses: [{ status: 'mortal_wound', duration: 8 }] } as Ab),
    aoe('kef_yagmaci_stone', 'Taşa Çevir', 'self_aoe', 7, 7, 22, 2.2, 0.5, 'physical', 'Taunt', 1.0, { castTime: 2.2, interruptible: true, kick: 2, initialCooldown: 10, statuses: [{ status: 'petrify', duration: 5 }], vfx: 'stun_stars' }),
    charge('kef_yagmaci_rush', 'Kalkan Hamlesi', 6, 15, W(1.5), 1.5, 'Block_Attack', 0.5, { initialCooldown: 9, knockback: 3, params: { target: 0, dash: 0.4 } }),
  ] });

add({ id: 'kef_parcalayici', name: 'Taş Parçalayıcı', model: MON('Orc'), scale: 1, tint: 0x7a788c, role: 'melee', rank: 'trash', hp: 1.6, dmg: 1.5, speed: 5.8, radius: 0.6, aggro: 10, forces: 6, poise: 40,
  anims: A_CHAR, resist: R_STONE,
  basic: cone('kef_parcalayici_cleave', 'Taş Pala', 2.8, 90, 2.0, 1.0, 'Weapon', 0.45, { windup: W(1.0) }),
  abilities: [
    line('kef_parcalayici_glaive', 'Kılıç Fırlat', 22, 2.4, 11, W(2.2, true), 2.2, 'physical', 'Weapon', 0.45, { initialCooldown: 5, params: { target: 1 } }),
    aoe('kef_parcalayici_whirl', 'Dönen Kılıç', 'self_aoe', 3.6, 3.6, 17, W(1.8, true), 1.8, 'physical', 'Weapon', 0.6, { initialCooldown: 9 }),
  ] });

add({ id: 'kef_kemirgen', name: 'Taş Kemirgen', model: GEN('golem_stone'), scale: 0.4, tint: 0x5c5a6c, role: 'swarm', rank: 'trash', hp: 0.6, dmg: 0.9, speed: 7.6, radius: 0.4, aggro: 9, forces: 2,
  anims: A_GEN, resist: R_STONE, visual: { eyeEmissive: 0xc8382f, runRef: 5 },
  basic: cone('kef_kemirgen_bite', 'Ayak Bileği Isırığı', 1.3, 100, 1.2, 0.7, 'Attack', 0.4, { windup: W(0.7), statuses: [bleed(1, 0.15, 6)] }),
  abilities: [charge('kef_kemirgen_leap', 'Sıçrama', 6, 9, W(0.9), 0.9, 'Attack2', 0.5, { initialCooldown: 4, params: { target: 1, dash: 0.3 } })] });

add({ id: 'kef_bahcivan', name: 'Bataklık Bahçıvanı', model: MON('Zombie'), scale: 1.05, tint: 0x5a5230, role: 'melee', rank: 'trash', hp: 1.9, dmg: 1.2, speed: 5.0, radius: 0.6, aggro: 9, forces: 5, poise: 30,
  anims: A_ENEMY,
  basic: cone('kef_bahcivan_spade', 'Kürek', 2.2, 100, 2.0, 1.0, 'Attack', 0.37, { windup: W(1.0) }),
  abilities: [
    cone('kef_bahcivan_swing', 'Kürek Savurma', 2.4, 110, 9, 1.0, 'Attack', 0.37, { initialCooldown: 5, windup: W(1.0), telegraph: true, params: STR(1.6, 0.3) }),
    aoe('kef_bahcivan_muck', 'Bataklık Çamuru', 'ground_aoe', 3.2, 16, 13, W(0.8, true), 0.8, 'poison', 'Attack', 0.37, { initialCooldown: 4, statuses: [{ status: 'slow', duration: 3 }], params: { target: 1, persist: 8, persistCoef: 0.4, tick: 0.5 } }),
    passive('kef_bahcivan_skittish', 'Ürkek', { hpBelow: 0.3, once: 1, pull: 1 }),            // handler in the trash script (P7)
  ] });

add({ id: 'kef_sigar', name: 'Engizisyoncu Sigar', model: CHAR('Mage'), scale: 1.25, tint: 0x8a1a2a, role: 'caster', rank: 'elite', hp: 4.4, dmg: 1.6, speed: 5.0, radius: 0.7, aggro: 12, forces: 12, ccImmune: true, poise: 120,
  anims: A_KAYKIT, resist: R_VENTHYR, ai: { kite: [8, 14] }, visual: { hide: mageHide('2H_Staff', 'Mage_Hat'), runRef: 7, clipsFrom: SKEL('Skeleton_Mage'), glow: 0xc8382f },
  basic: proj('kef_sigar_bolt', 'Hüküm Oku', 16, 20, 2.4, W(1.1), 1.1, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'shadow_cast' }),
  abilities: [
    { id: 'kef_sigar_communion', name: 'Karanlık Komünyon', kind: 'custom', range: 10, cooldown: 24, initialCooldown: 8, windup: 4.0, castTime: 4.0, interruptible: true, kick: 2, healPct: 0.10,
      anim: 'Spellcasting', params: { loop: 1, soulHeal: 0.06, soulRange: 10, impact: 3.9 } },
    aoe('kef_sigar_disperse', 'Günah Dağıtımı', 'ground_aoe', 3.5, 18, 14, W(1.6, true), 1.6, 'shadow', 'Spellcast_Summon', 1.0, { initialCooldown: 5, vfx: 'shadow_burst', params: { target: 1, count: 2, persist: 8, persistCoef: 0.5, tick: 0.5 } }),
    // Display of Power (WoW: amplifies all damage and healing, spread before it expires): 3 marks of `sin_amplified` (P6, +30% damage and healing taken, 6 s); our addition: a burst r 6 at expiry (deviation D2)
    { id: 'kef_sigar_display', name: 'Güç Gösterisi', kind: 'custom', range: 20, cooldown: 28, initialCooldown: 14, windup: 1.2, castTime: 1.2, anim: 'Spellcast_Raise', vfx: 'curse_loop',
      statuses: [{ status: 'sin_amplified', duration: 6, magnitude: 0.3 }], params: { marks: 3, fuse: 6, radius: 6, coef: 1.6, impact: 1.0 } },
  ] });

add({ id: 'kef_tormented', name: 'Işkence Gören Ruh', model: MON('Ghost'), scale: 0.6, tint: 0xc8c0e0, role: 'swarm', rank: 'trash', hp: 0.3, dmg: 0, speed: 3.0, radius: 0.4, aggro: 0, forces: 0, flying: true,
  anims: A_FLY, resist: R_GHOST, ai: { neutral: true }, visual: { opacity: 0.5, hoverBob: 0.12 }, basic: NOOP('kef_tormented_none') });

// ---- mechanic entities and boss adds (bodies: P8 PROC builders sinstone_shard, sinstone_statue, parishioner)
// NOTE (critic fix): MECH hard-codes `dmg: 0`; any MECH entity with a damaging ability MUST pass `dmg` in its extras (the extras are spread last, so they win).
// `ai: { stationary: true }` REPLACES MECH's default `ai: { summoned: true }`: the shard never moves and is aggroed through its pack (summoned would also stop pack aggro), which is what we want here.
MECH('kef_shard', 'Halkor Kıymığı', 'sinstone_shard', 4, { radius: 1.2, forces: 4, dmg: 1.2, ai: { stationary: true }, stanceBreakable: false,
  basic: NOOP('kef_shard_none'),
  abilities: [
    { id: 'kef_shard_thrash', name: 'Çırpınma', kind: 'custom', range: 26, cooldown: 18, initialCooldown: 5, windup: 0.5, castTime: 8.0, interruptible: false, damage: { coef: 0.3, type: 'physical' }, anim: '', params: { channel: 8, tick: 0.5, loop: 1 } },
    { id: 'kef_shard_quake', name: 'Günah Depremi', kind: 'custom', range: 26, cooldown: 13, initialCooldown: 9, windup: 2.0, damage: { coef: 1.8, type: 'physical' }, anim: '', params: { target: 4, radius: 2.6, impact: 2.0 } },
  ] });
MECH('kef_heykel', 'Günah Heykeli', 'sinstone_statue', 1, { radius: 1.4, speed: 5 });                  // no damaging ability of its own: the boss script deals the damage
MECH('kef_cemaat', 'Hayalet Cemaat Üyesi', 'parishioner', 1, { radius: 0.7, speed: 5.8 });             // damage dealt by the boss script (circles), no ability on the def
add({ id: 'kef_taskoz', name: 'Ölümsüz Taş Canavarı', model: GEN('golem_stone'), scale: 0.55, tint: 0x6a6878, role: 'melee', rank: 'trash', hp: 1.4, dmg: 1.0, speed: 6.2, radius: 0.6, aggro: 12, forces: 0,
  anims: A_GEN, resist: R_STONE, ai: { summoned: true }, visual: { eyeEmissive: 0xc8382f, runRef: 5 },
  basic: cone('kef_taskoz_claw', 'Taş Pençe', 1.8, 100, 1.6, 1.0, 'Attack', 0.4, { windup: W(1.0) }),
  abilities: [
    proj('kef_taskoz_bolt', 'Kötü Ok', 16, 18, 6, 1.8, 1.3, 'shadow', 'shadow_projectile', 'Attack2', 0.4, { castTime: 1.8, interruptible: true, kick: 1 }),
    passive('kef_taskoz_rubble', 'Uçucu Dönüşüm', { onDeathBurst: 1, radius: 3, coef: 2.0, regen: 30 }),                          // handled by Ekelon's script (P5 regenAdd)
  ] });
```

`kef_taskoz` takes its `kef_taskoz_bolt` kick as a medium-priority interrupt (WoW: Villainous Bolt, "interrupt it to keep them grouped").



---



## 5. Bosses

How the boss tables read: the **Kit** column says whether the mechanic can be written today with `src/ai/bosses/kit.ts` and `BossController` (`EXISTS`: `circle`, `ring`, `beam`, `band`, `wedge`, `zone`, `dashLine`, `ringPoints`, `statusPlayer`, `pickPlayers`, `playersIn`, `every`, `spawnMech`, `makeInvulnerable`, `trapPlayer`, plus controller methods `spawnAdds`, `setImmune`, `freeze`, `teleport`, `dash`, `goTo`, `slide`, `frontalBlock`, `stagger`, `vulnerable`, `cdOverride`, `schedule`, `track`, `endMechanicPhase`) or needs one of the **NEW** primitives of section 8 (P3, P4, P5). "first / cd" are seconds after engage, written so they map onto `custom(id, name, cd, first, windup, anim, o)`; phase rows map onto `bp(id, hpBelow, abilities, onEnter)`.

Fight-length targets are at key +10 for a competent group at ilvl 80 to 88 (ilvl chest at +10 is 80, CORE_MECHANICS §4.4). `hpMult` values are starting points taken from the rule of thumb of the existing final bosses (60 / 75 / 110, GDD_CONTENT §0.3); **SimBench (CORE_MECHANICS §5) must confirm the targets** (Halkor 1:50, Ekelon 2:10, Alyez 2:15, Velkaan 3:10) and `hpMult` is then nudged by up to 15% (the Elden-Ring layer adds punish windows and a few damage events; it does not add HP).

Shared M+ boss rules: bosses are hard-CC immune (converted to poise damage), a poise break stops casts that are not `perilous`, hard enrage after `enrage` seconds, Tyrannical +30% HP / +15% damage. Puddle budget for all bosses: at most 14 live floor puddles, the oldest is cancelled (`G.hitShapes.cancel`) when the 15th lands, so the floor stays readable.

Boss placements and arena rects are in section 3.6. Sinstone, red and gold telegraph accents are from section 2.2; telegraph colours follow GDD_CONTENT §0.6 (red danger, yellow soak, green safe).

### 5.0 The Elden-Ring layer (applies to all four bosses)

Every boss keeps its WoW kit (the "core") and gains **three ER moves**: one **string** of 2 or 3 hits, one **jump / dash / grab** and one **delayed or area swing**. Rules:

* **Readable windups.** A hit with coefficient `c` has a windup of at least `clamp(0.45 + 0.25 x c, 0.45, 1.2)` s (the trash rule R-W, section 4.0), and bosses never go below 0.9 s for a hit above coef 2.0. Every windup has a tell (the clip, a limb glow, an SFX cue); an area is drawn on the floor (`telegraph: true`, red) for its whole windup.
* **Strings and delayed swings.** String hits are scripted with `schedule(...)` and re-aim between hits (hit 1 and 2 follow the target; the last hit locks its direction at the start of its hold). The **delayed** last hit holds 0.5 to 0.6 s with the weapon raised: that is the tell for the big hit and the moment for a defensive. Hits 1 and 2 are breakable by posture; the delayed last hit is `perilous` (cannot be stopped, cannot be parried, red glyph).
* **Posture (Duruş).** Bosses use the existing poise system (`src/combat/poise.ts`): `poise` per boss below, party factor `1 + 0.5 (n - 1)` (x3.0 at 5 players), hyper-armour 1 for bosses (poise damage is halved while a heavy windup is active, so the real chances are the recoveries). A full bar breaks the boss for **2.0 s: x1.25 damage and `marked_crit`**, drops every non-perilous cast, then locks poise for 25 s. Sources are the existing ones (heavy attacks, parries, finishers, `staggerPct`, kicks on the `I` casts).
* **Punish window.** After each ER finisher the boss is in a **recovery** of 1.2 to 1.6 s where it can not turn or start a move: the script calls `punish(c, 1.15, recovery)` (NEW P5, wraps `c.vulnerable`): x1.15 damage taken. Recoveries are the intended places to swing, break posture and use a cooldown.
* **No stacking with the core.** An ER move never starts within 3 s of a core mechanic's cast end, and never during Azap Ayini, the Chorus or a Parishioner kite window; `c.cdOverride` pushes it back (the core always wins).

| boss | poise | broken window | the intended break | ER moves |
|---|---|---|---|---|
| Halkor | 700 (x3.0 = 2100) | 2.0 s kneel, x1.25 | the recovery after Mezar Sıçrayışı | Üçlü Enkaz Yumruk, Mezar Sıçrayışı, Taş Kol Savurma |
| Ekelon | 600 (x3.0 = 1800) | 2.0 s, x1.25; a break during Nöbet Duruşu is a 2.5 s collapse | breaking the guard stance | Taş Kılıç Dansı, Nöbet Duruşu + Gölge Mızrağı, Gökten İniş |
| Alyez | 500 (x3.0 = 1500) | 2.0 s, she drops from the air, x1.25 | the recovery after Hüküm Halkası | Hüküm Kırbacı, Anima Kavrayışı, Hüküm Halkası |
| Velkaan | 750 (x3.0 = 2250) | 2.0 s, x1.25 | the recovery after Kibir Adımı | Asa Üçlemesi, Hasat Pençesi, Kibir Adımı |

### 5.1 Boss 1: Halkor, "Kefaret'in Günah Taşı Devi" (`boss_halkor`)

*Halls of Atonement: Halkias, the Sin-Stained Goliath.* A golem grown from neglected sinstones. Lore: every soul that was never absolved fed it. Visual: black-violet slab golem 5.8 m tall, red seams.

| hpMult | dmgMult | speed | radius | enrage | arenaR | arena | model |
|---|---|---|---|---|---|---|---|
| 60 | 2.4 | 4.4 m/s | 1.6 | 240 s | 26 | Halkor Çemberi 64 x 56 m, glowing boundary ring r 22 m (tile (31.5, 32.5)), floor 0.6 m, entered down S4 | `gen/creatures/golem_stone.glb` x1.65 tinted `0x3a3048`, emissive `0xc8382f` x0.7; replace with NEW `gen/bosses/halkor.glb` (golem of stacked tomb-slabs) |

Clips (A_GEN golem): `Idle`, `Walk`, `Run`, `Attack` (slam, 0.55 s impact), `Attack2` (sweep / roar), `Hit` (kneel for the posture break), `Death`.

**Awakening (before the pull).** The boss is dormant (black mound) until the three `kef_shard` in the side chambers are dead (section 3.5 M1). The first player to enter the circle after the third shard death triggers the rise: 3 s intro, shake 0.4, `boss_spawn` VFX and a roar, then the standard engage.

**Phases.**

| phase | hp | active abilities | on enter |
|---|---|---|---|
| p1 | 100% to 40% | core: `halkor_slam`, `halkor_debris`, `halkor_sinlight`; ER: `halkor_triple`, `halkor_leap`, `halkor_sweep` | intro yell |
| p2 Günah Taşı Öfkesi | below 40% | p1 set + `halkor_shardfall`; attack cd x0.8, `halkor_sinlight` cd 26, `halkor_leap` cd 26 | `halkor_fracture` roar, 120 ms hit-stop, heavy shake |

| Ability (id) | first / cd | cast / windup | Shape | Damage / effect | Counter | Kit |
|---|---|---|---|---|---|---|
| Taş Yumruk (`halkor_fist`, basic) | every 2.4 s | 0.7 | cone 100° 5 m, telegraph | coef 1.0 | tank | EXISTS (data) |
| **Ezici Çöküş** (`halkor_slam`) | 6 / 15 | 1.4 | cone 120° 6 m toward the tank; afterwards two **Cam Kırığı** puddles (r 2.5, 90 s, coef 0.5 per 0.5 s) 3 m and 6 m in front of him | coef 3.6 tank buster, knockback 3 | big defensive; tank moves him so new puddles land on existing ones or on the arena edge | EXISTS: `wedge` + `zone` |
| **Enkaz Fırlat** (`halkor_debris`) | 11 / 12 | 1.8 | circle r 3 under 1 random player (2 with 4+ players), leaves a puddle r 3 for 90 s | coef 2.4 | step out; bait onto old puddles, stay near the edge | EXISTS: `circle` + `zone` |
| **Kırılan Işık** (`halkor_sinlight`) | 22 / 38 | 2.0 "Enerji doluyor!" | 4 beams from the boss (length 44 m, width 2.6 m), 90° apart, rotating 22 deg/s for 9 s, **reversing direction at 4.5 s** | coef 1.8 per 0.5 s contact | before the cast the group clears a lane with no puddles; follow the rotation, the turn-around is the check | **NEW P5 `rotatingBeams`** (extract `ignaroth_flame_walls` from `dokumhane.ts`) |
| Günah Işığı Görüntüleri (leash, passive) | always | - | any player farther than 22 m from the centre (and not on a stair strip) | `fear` 3 s repeated every 3 s while outside | dispel the fear, run back inside | EXISTS: `every` + `statusPlayer`; P5 `arenaLeash` |
| **Kıymık Yağmuru** (`halkor_shardfall`) | p2: every 14 s | 1.5 | 6 circles r 2.5 (2 of them on players) | coef 2.0 | move | EXISTS: `circle` |
| **Taş Çatlağı** (`halkor_fracture`) | at 40% | 1.0 | roar | +25% attack speed, shake, hit-stop | cooldowns | EXISTS: `cdOverride`, `bossFx`, camera events |
| **ER 1: Üçlü Enkaz Yumruk** (`halkor_triple`) | 16 / 20 | 0.75, 0.75, then 1.2 + delayed hold 0.5 | **string of 3** on the tank: cone 100° 5 m (1.2) > backhand cone 100° 5 m (1.2) > overhead slam, circle r 4 centred 3 m in front, leaves one puddle (3.0) | coef 1.2 > 1.2 > 3.0, the last hit **perilous** | the first two hits can be broken by posture (the string is aborted); the third is the delayed one: defensive on the raise, then run out of the circle; recovery 1.4 s = punish window | EXISTS: `wedge` + `circle` + `schedule`; P5 `swingString` |
| **ER 2: Mezar Sıçrayışı** (`halkor_leap`) | 30 / 32 (p2: 26 / 26) | 1.2 (marker), jump 0.6 s | jump slam on a random non-tank: a red marker r 6 follows the target 0.8 s, locks for 0.4 s, he leaps (shadow grows) and lands | coef 3.0, knockback 5, one puddle at the landing | sidestep during the lock; stay out of r 6; **recovery 1.4 s = the intended posture window** | EXISTS: `circle` (follow) + `dash` + `zone` |
| **ER 3: Taş Kol Savurma** (`halkor_sweep`) | 40 / 28 | 1.2 (arms rise) + delayed hold 0.9 | 360° sweep r 7 around himself | coef 2.6, **perilous**, hits everyone inside 7 m including the tank | dodge-roll at the hit frame (i-frames) or be outside 7 m; ranged never notices; recovery 1.2 s | EXISTS: `circle` |

**Opening timeline (key +10, seconds after engage):** 0 pull > 6 Çöküş > 11 Enkaz > 16 Üçlü Enkaz string (16 to 19, recovery to 20.4) > 21 Çöküş > 22 Kırılan Işık cast (beams 24 to 33) > 30 Mezar Sıçrayışı (marker 30, landing 31.8, recovery to 33.2) > 35 Enkaz > 36 Üçlü > 40 Taş Kol Savurma > 51 Çöküş > 60 Kırılan Işık #2. About 9 puddles are on the floor by 60 s, which is why the leash ring is the only sure escape and why puddle placement is the real fight. The boss queue keeps 2.5 s between starts (the table shows the intended order).

**Duties.** *Tank:* keep Halkor facing away from the group, put the Çöküş puddles over each other along one arena edge (the "puddle wall"), use a big defensive on every slam and on the raise of the Üçlü string, never walk outside the ring. *Healer:* dispel the fear immediately, heal the puddle chip, expect Çöküş and Üçlü within 5 s of each other. *DPS:* dodge Enkaz and bait it onto old puddles at the edge, roll the Sweep, break posture in the Leap recovery, never stand where the beams will rotate through puddles. The pre-boss shards teach the same lesson in miniature (Sin Quake circles).

**Script notes (`ai/bosses/kefaret_b12.ts`, `halkor`):** `init`: `state.puddles = []`, `state.awake = false` (fallback awakening), `state.leashT`. `update`: leash `every(st,'leash',dt,3,...)` for players with distance > 22 m from `c.gdd(31.5, 32.5)` and `floorY` below 1.2 m above the arena floor; puddle cap 14. `halkor_slam.start`: `wedge` toward the tank then `zone` x2 with `delay` = windup. `halkor_debris.start`: `pickPlayers(c, n, true)` then `circle` + `zone` per target. `halkor_sinlight`: `c.state.beams = rotatingBeams(...)` ticked in `update`. `halkor_triple.start`: `swingString(c, [{ at: 0.75, wedge }, { at: 1.6, wedge }, { at: 3.35, circle r 4, perilous }])` then `punish(c, 1.15, 1.4)`. `halkor_leap.start`: marker `circle(follow)` then `c.dash` to the lock point and `circle(r 6)` at landing, `punish(c, 1.15, 1.4)`. `halkor_sweep.start`: `circle(c, x, z, 7, delay 2.1, 2.6)` plus `punish(c, 1.15, 1.2)`.

**Yells (TR).** Pull: "Günahlarınız taşa yazıldı." 40%: "Çatlıyorum... ve büyüyorum!" Death: "Taş... toza... dönüyor..."

**Loot `loot_kef_b1`** (section 5.5).

```ts
boss({ id: 'boss_halkor', name: 'Halkor', title: 'Kefaret\'in Günah Taşı Devi', model: GEN('golem_stone'), scale: 1.65, tint: 0x3a3048, emissive: 0xc8382f, role: 'tank',
  hp: 60, dmg: 2.4, speed: 4.4, radius: 1.6, enrage: 240, arenaR: 26, loot: 'loot_kef_b1', anims: A_GEN, resist: R_GOLEM, poise: 700,
  visual: { emissiveIntensity: 0.7, eyeEmissive: 0xff5040, runRef: 4.5 },
  basic: cone('halkor_fist', 'Taş Yumruk', 5, 100, 2.4, 1.0, 'Attack', 0.6, { windup: 0.7, telegraph: true }),
  abilities: [
    custom('halkor_slam', 'Ezici Çöküş', 15, 6, 1.4, 'Attack', { sfx: 'boss_cast', tankBuster: true, perilous: true, params: { impact: 0.55 } }),
    custom('halkor_debris', 'Enkaz Fırlat', 12, 11, 1.8, 'Attack2', { sfx: 'boss_cast', params: { impact: 0.6 } }),
    custom('halkor_sinlight', 'Kırılan Işık', 38, 22, 2.0, 'Attack2', { sfx: 'boss_roar', params: { impact: 0.8 } }),
    custom('halkor_shardfall', 'Kıymık Yağmuru', 14, 9999, 1.5, 'Attack', { sfx: 'boss_cast', params: { impact: 0.6 } }),
    custom('halkor_fracture', 'Taş Çatlağı', 999, 9999, 1.0, 'Attack2', { sfx: 'boss_roar' }),
    // ER layer (section 5.0)
    custom('halkor_triple', 'Üçlü Enkaz Yumruk', 20, 16, 0.75, 'Attack', { sfx: 'boss_cast', tankBuster: true, params: { impact: 0.5, hits: 3 } }),
    custom('halkor_leap', 'Mezar Sıçrayışı', 32, 30, 1.2, 'Attack2', { sfx: 'boss_roar', perilous: true, params: { impact: 0.9 } }),
    custom('halkor_sweep', 'Taş Kol Savurma', 28, 40, 1.2, 'Attack2', { sfx: 'boss_cast', perilous: true, params: { impact: 2.1 } }),
  ],
  phases: [
    bp('p1', 1.01, ['halkor_slam', 'halkor_debris', 'halkor_sinlight', 'halkor_triple', 'halkor_leap', 'halkor_sweep']),
    bp('p2', 0.4, ['halkor_slam', 'halkor_debris', 'halkor_sinlight', 'halkor_shardfall', 'halkor_triple', 'halkor_leap', 'halkor_sweep'], { yell: 'Çatlıyorum... ve büyüyorum!', ability: 'halkor_fracture' }),
  ],
  intro: 'Günahlarınız taşa yazıldı.', death: 'Taş... toza... dönüyor...',
  arena: { cx: 128, cz: 132, w: 64, h: 56, homeX: 128, homeZ: 132 } });
```

### 5.2 Boss 2: Taş Komutan Ekelon, "Kefaret'in Gökyüzü Gözcüsü" (`boss_ekelon`)

*Halls of Atonement: Echelon.* The Stoneborn commander who watches the halls from above and leaps on the unwary. Visual: a stone-skinned knight with a great sword, crimson cape remnants, glowing eyes.

| hpMult | dmgMult | speed | radius | enrage | arenaR | arena | model |
|---|---|---|---|---|---|---|---|
| 70 | 2.5 | 6.0 m/s | 1.3 | 270 s | 30 | Gözcü Terası 96 x 48 m at floor 8.4, open quarry drop along the north edge (tile (11.5, 4)) | `characters/Knight.glb` x2.0 tinted `0x7c7a90`, `2H_Sword`, `Knight_Helmet`, `Knight_Cape`, `clipsFrom: SKEL('Skeleton_Warrior')` |

Clips. The Knight rig has `Idle`, `Walking_A`, `Running_A`, `2H_Melee_Attack_Slice` (0.5), `2H_Melee_Attack_Chop`, `2H_Melee_Attack_Spin`, `Block`, `Block_Attack`, `Spellcast_Raise` (Kan Seli windup), `Spellcast_Shoot` (Flesh mark), `Jump_Full_Long`, `Hit_A`, `Death_A`; **`Taunt` (Taş Çağrısı) and `Spawn_Air` (Gökten İniş) do not exist on the Knight** (revision 1 listed them as if they did): they come from `clipsFrom: SKEL('Skeleton_Warrior')`, which also provides `1H_Melee_Attack_Jump_Chop` for the dive landing.

**Start.** Click the `ekelon_door` (P4, behaviour in section 3.5 M4). Fallback: normal 12 m aggro from the stair hall.

**Phases.** *(Revision 1 had an 11 s immune intermission at 50% with 3 dives and 6 new fiends. The WoW fight has no intermission, so it is cut; its dives live on as a normal, non-immune ability that unlocks at 50%. Deviation D1.)*

| phase | hp | active abilities | on enter |
|---|---|---|---|
| p1 | 100% to 50% | core: `ekelon_torrent`, `ekelon_stone_call`, `ekelon_flesh`; ER: `ekelon_dance`, `ekelon_guard` | intro yell |
| p2 Gökyüzü benim | below 50% | p1 set + `ekelon_sky`; Taş Çağrısı cd 30, Taşa Dönüş cd 38, +15% damage | yell, hit-stop 80 ms, shake 0.3 |

| Ability (id) | first / cd | cast / windup | Shape | Damage / effect | Counter | Kit |
|---|---|---|---|---|---|---|
| Taş Kılıç (`ekelon_slash`, basic) | every 2.2 s | 0.7 | cone 100° 4.5 m, telegraph | coef 1.0 | tank | EXISTS (data) |
| **Kan Seli** (`ekelon_torrent`) | 8 / 16 | 1.8 | circle r 3 under 3 random players (2 with fewer than 4), then a blood puddle r 3 for 24 s (coef 0.5 per 0.5 s) | coef 2.2 | step out; drop puddles on the same pile at the edge | EXISTS: `circle` + `zone` |
| **Taş Çağrısı** (`ekelon_stone_call`) | 14 / 40 (p2 30) | 1.6 | 6 `kef_taskoz` Undying Stonefiends on a ring r 14 m around the arena centre, all aggro the tanks | - | tanks collect them at the centre; **I** their Kötü Ok (a stopped bolt stuns that fiend 3 s so the pack stays grouped) | EXISTS: `spawnAdds` |
| **Ölümsüz regen** (`kef_taskoz_rubble`) | on fiend death | 1.2 | circle r 3 on the death spot (Uçucu Dönüşüm), then the **rubble** re-forms into a full-HP fiend after 30 s | coef 2.0 | do not kill fiends on top of each other; kill them in one burst, then crush the rubble | **NEW P5 `regenAdd`** |
| **Taşa Dönüş** (`ekelon_flesh`) | 24 / 45 (p2 38) | 1.2 | marks one random non-tank (green follow circle r 5): `slow` 2.5 s, then **petrify** 4 s on the marked player and everyone within 5 m | - | spread from the marked player except the intended stack; **D** petrify is dispellable | EXISTS: `circle` follow + `statusPlayer` (statuses `petrify`, P6) |
| **Taş Parçalayan Sıçrayış** (part of `ekelon_flesh`) | 4.0 s after the mark | 0.45 s dash | Ekelon leaps to the marked player (up to 30 m): circle r 8, knockback 6; **every rubble within 8 m is destroyed**, living fiends in the circle take coef 6 | coef 3.4 | the marked player runs next to the rubble pile, the rest leave the circle | EXISTS: `dash` + `circle`; crush = P5 `regenAdd` |
| **ER 1: Taş Kılıç Dansı** (`ekelon_dance`) | 16 / 18 | 0.73, 0.73, then 1.15 + delayed hold 0.6 | **string of 3** on the tank: cone 100° 4.5 m (1.1) > backhand cone 120° 4.5 m (1.1) > raised overhead, cone 70° 6 m plus a shockwave line 12 x 2 m (2.8) | coef 1.1 > 1.1 > 2.8, the last hit **perilous** | posture breaks the string before the third hit; otherwise a defensive on the raise; recovery 1.3 s | EXISTS: `wedge` + `beam` + `schedule`; P5 `swingString` |
| **ER 2: Nöbet Duruşu** (`ekelon_guard`) | 34 / 40 | 0.9 (stance), 3.5 s guard | Ekelon raises his blade and advances at half speed toward the tank; **frontal block x0.15 inside a 120° arc, x1.0 behind** for 3.5 s; he ends the stance with **Gölge Mızrağı**, a thrust line 14 x 2 m (coef 3.0, windup 1.2) | thrust coef 3.0, **perilous** | hit him from behind (the stance makes the tank a bad target: swap), or **break posture**: the stance drops and he collapses for 2.5 s (x1.25); otherwise stop attacking the front and run the diagonal around him; recovery 1.4 s after the thrust | EXISTS: `frontalBlock(3.5, 120, 0.15, 1.0)` + `beam` + `schedule`; the poise-break reaction listens to `poise:break` (P5 `onPoiseBreak`) |
| **ER 3: Gökten İniş** (`ekelon_sky`, p2 only) | 62 / 55 | 0.9 (jump, `Spawn_Air`), marker 1.4 s follow + 0.4 s lock | he leaps out of sight and falls on a random non-tank: circle r 7; **no immunity, no adds** (revision 1's immune intermission is cut); the landing is followed by a **2-hit string on the tank** (cone 4.5 m, 1.4 > 1.4) | landing coef 3.0, string 1.4 > 1.4 | run out of the follow circle at the lock; the tank takes the string; recovery 1.6 s = punish window (the group's cooldown window in p2) | EXISTS: `circle` (follow), `dash`, `wedge`, `schedule`; `setAlphaAll` for the vanish |
| Soft enrage | below 15% | - | +5% damage every 6 s | - | burn | EXISTS: `every` + `c.dmgMul` |

**Opening timeline (+10):** 0 click > 8 Kan Seli > 14 Taş Çağrısı (adds 15.6) > 16 Taş Kılıç Dansı (16 to 19.5, recovery to 21) > 24 Kan Seli + Taşa Dönüş (mark 24, petrify 26.5, leap 28.0) > 34 Nöbet Duruşu (guard 34.9 to 38.4, thrust 39.6, recovery to 41) > 40 Kan Seli > 54 Taş Çağrısı #2 > 69 Taşa Dönüş #2 > 50% HP (about 1:05 to 1:10): Gökyüzü benim (+15% damage) > 62 Gökten İniş (about 1:12) and every 55 s afterwards.

**Duties.** *Tanks:* the Stonefiends are the tank check; a second tank (any of the 6 tank specs: Koruyucu, Savaş Lordu, Demci, Koruma, Kemik Muhafızı, İntikam; this needs the P5 `isTank` fix, today `isTank` only knows `knight`) takes half the fiends; during Nöbet Duruşu the tank steps aside so the group hits his back. *Healer:* dispel Petrify on anyone not at the stack, spot-heal the landings. *DPS:* use one interrupt per Kötü Ok, burst fiends together, run the Flesh target to the rubble, break posture on the guard, dodge the Gökten İniş marker.

**Script notes (`ekelon`):** `state.fiends = []` of `{ x, z, t, id }` filled from `c.adds('fiend')` deaths seen in `update()`; at `t + 30` respawn with `spawnAdds('kef_taskoz', 1, ...)`; the leap deletes entries within 8 m and `bossFx('death_bones')` on each. `state.marked` = pid of the flesh target; `schedule` chain: `0` slow, `2.5` petrify (`playersIn(c, x, z, 5)`), `4.0` leap. `ekelon_guard.start`: `c.frontalBlock(3.5, 120, 0.15, 1.0)`, `c.state.guardUntil = now + 3.5`, `c.slide` toward the tank at `speed x 0.5`; `onPoiseBreak` while `now < guardUntil`: `c.frontalBlock(0, ...)` off, `c.stagger(2.5, 1.25, 2.5)` and cancel the thrust. `ekelon_sky.start`: `setAlphaAll` fade, follow marker `circle`, `c.teleport` to the lock point, landing `circle r 7`, then `schedule` the two wedges on the tank and `punish(c, 1.15, 1.6)`.

**Yells (TR).** Pull: "Aşağıdan bakmak size yetmez mi?" 50%: "Gökyüzü benim!" Death: "Nöbetim... bitti..."

**Loot `loot_kef_b2`** (section 5.5).

```ts
boss({ id: 'boss_ekelon', name: 'Taş Komutan Ekelon', title: 'Kefaret\'in Gökyüzü Gözcüsü', model: CHAR('Knight'), scale: 2.0, tint: 0x7c7a90, role: 'melee',
  hp: 70, dmg: 2.5, speed: 6.0, radius: 1.3, enrage: 270, arenaR: 30, loot: 'loot_kef_b2', poise: 600,
  anims: { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', hit: 'Hit_A', death: 'Death_A' }, resist: R_STONE,
  visual: { hide: KNIGHT_HIDE.filter((n) => !['2H_Sword', 'Knight_Helmet', 'Knight_Cape'].includes(n)), eyeEmissive: 0xff5040, runRef: 7, glow: 0xc8382f, clipsFrom: SKEL('Skeleton_Warrior') },
  basic: cone('ekelon_slash', 'Taş Kılıç', 4.5, 100, 2.2, 1.0, '2H_Melee_Attack_Slice', 0.5, { windup: 0.7, telegraph: true }),
  abilities: [
    custom('ekelon_torrent', 'Kan Seli', 16, 8, 1.8, 'Spellcast_Raise', { sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('ekelon_stone_call', 'Taş Çağrısı', 40, 14, 1.6, 'Taunt', { sfx: 'boss_roar', params: { impact: 0.8 } }),
    custom('ekelon_flesh', 'Taşa Dönüş', 45, 24, 1.2, 'Spellcast_Shoot', { sfx: 'boss_cast', params: { impact: 0.3 } }),
    custom('ekelon_dance', 'Taş Kılıç Dansı', 18, 16, 0.73, '2H_Melee_Attack_Slice', { sfx: 'boss_cast', tankBuster: true, params: { impact: 0.45, hits: 3 } }),
    custom('ekelon_guard', 'Nöbet Duruşu', 40, 34, 0.9, 'Block', { sfx: 'boss_cast', perilous: true, params: { impact: 4.4 } }),
    custom('ekelon_sky', 'Gökten İniş', 55, 62, 0.9, 'Spawn_Air', { sfx: 'boss_roar', perilous: true, params: { impact: 2.3 } }),
  ],
  phases: [
    bp('p1', 1.01, ['ekelon_torrent', 'ekelon_stone_call', 'ekelon_flesh', 'ekelon_dance', 'ekelon_guard']),
    bp('p2', 0.5, ['ekelon_torrent', 'ekelon_stone_call', 'ekelon_flesh', 'ekelon_dance', 'ekelon_guard', 'ekelon_sky'], { yell: 'Gökyüzü benim!' }),
  ],
  intro: 'Aşağıdan bakmak size yetmez mi?', death: 'Nöbetim... bitti...',
  arena: { cx: 48, cz: 24, w: 96, h: 48, homeX: 48, homeZ: 18 } });
```

### 5.3 Boss 3: Yüce Hâkim Alyez, "Ruhların Hâkimi" (`boss_alyez`)

*Halls of Atonement: High Adjudicator Aleez.* A judge who separates sin from form and stores the anima in vessels. Visual: a hooded, floating judge with a tentacle robe, crimson and gold, orbs of gold light orbiting her.

| hpMult | dmgMult | speed | radius | enrage | arenaR | arena | model |
|---|---|---|---|---|---|---|---|
| 75 | 2.3 | 5.2 m/s | 1.2 | 270 s | 28 | Cemaat Nefi 80 x 56 m at floor 8.4, 4 vessels in the alcoves (tile (42, 6.5), faces west) | `gen/bosses/golge_rahibesi.glb` x1.25, tint `0xb0384a`, emissive `0xc9a24a` x0.6 (hover 0.32 is baked into the clips) |

Clips: `Idle`, `Walk`, `Run`, `Attack` (lash), `Attack2` (halo raise), `Cast`, `Enrage`, `Hit`, `Death`.

**Vessels (Kefaret Kapları).** `vessel_1..4` at (34, 1.5), (45, 1.5), (34, 11.5), (45, 11.5). A vessel is **open** (golden glow, `lid_open`, a persistent green `safe` ring of r 2 on the floor) or **closed** (dark, `lid_closed`). All four start open. Sealing a Parishioner closes that vessel for 25 s; it then reopens. Closed vessels are never green: players must read the ring.

**Minimum-open guarantee (critic fix).** The script enforces **at most 2 closed vessels at any moment** (`state.vessels.filter(v => !v.open).length <= 2`, checked before every close): a Parishioner sealed while two vessels are already closed still dies, but its vessel stays open (it closes only after one of the others reopens). The judgement phase never closes all four: it closes **one vessel at a time** (a new one every 12 s for 20 s, so two are closed alternately), starting 4 s after the phase begins. The first p2 Hayalet Geçidi is delayed to **28 s** after the phase starts (not 16.8 s), and a second Parishioner of a pair only spawns when **at least 2 vessels are open** (otherwise its spawn waits 2 s and rechecks). So at least two green rings exist for every fixated player at every second of the fight.

**Phases.**

| phase | hp | changes |
|---|---|---|
| p1 | 100% to 50% | full kit (core + ER) |
| p2 Yargı Saati | below 50% | `alyez_judgement`: 1.5 s immune pulse, then vessels start closing **one at a time** (every 12 s, at most 2 closed); the procession now summons 2 Parishioners (staggered 4 s, first cast 28 s into the phase); fountain cd 16 |
| p3 | below 25% | soft enrage: +5% damage every 8 s |

| Ability (id) | first / cd | cast / windup | Shape | Damage / effect | Counter | Kit |
|---|---|---|---|---|---|---|
| Hüküm Dokunuşu (`alyez_touch`, basic) | every 2.4 s | 0.7 | cone 90° 4 m, telegraph | coef 1.0 shadow | tank | EXISTS (data) |
| **Anima Oku** (`alyez_anima_bolt`) | 6 / 12 | cast 2.0 **I** | projectile at the tank | coef 3.0 shadow, tank buster | **interrupt** (poise / stagger break), else a defensive | EXISTS (data) |
| **Kararsız Anima** (`alyez_unstable`) | 10 / 24 | 1.0 | 2 random players (non-tank first) get `curse` 12 s; each pulses a ring r 5 on itself every 1 s (coef 0.5) so neighbours take the damage | - | spread them apart, **D** dispel one fast, a defensive on the other | EXISTS: `statusPlayer` + `every` + `circle` (follow) |
| **Hayalet Geçidi** (`alyez_procession`) | 16 / 34 (p2 first 28, cd 28) | 1.5 | spawns a `kef_cemaat` (invulnerable) that fixates a random player; speed 5.8 m/s (players run 7); growing contact damage (circle r 2 on itself every 1 s, coef 0.35 x (1 + 0.3 per second alive), capped x4); **Pulse from Beyond**: ring r 7 every 4 s, coef 0.45, until sealed | grows | the fixated player kites it into an **open** vessel, which seals it | **NEW P5 `fixateAdd` + `safeZone`**, **P15** vessel prop control |
| **Güç Yağmuru** (`alyez_volley`) | 20 / 30 | cast 2.8 **I** | party-wide ring (r 0 to 60 m) | coef 2.4 shadow | **interrupt**, else heal through it | EXISTS: `ring` |
| **Anima Çeşmesi** (`alyez_fountain`) | 12 / 20 (p2 16) | 1.2 | 3 circles r 3 at random spots (1 under a random player), persist 10 s, coef 0.6 per 0.5 s holy | - | avoid circles, do not kite parishioners through them | EXISTS: `zone` |
| **Yargı Saati** (`alyez_judgement`) | at 50% | 1.0 | roar, vessels start closing one at a time | - | plan the next kite path | EXISTS: `setImmune`, `bossFx`; vessels P15 |
| **ER 1: Hüküm Kırbacı** (`alyez_lash`) | 8 / 16 | 0.70, 0.70, then 0.95 + delayed hold 0.4 | **string of 3** on the tank: tentacle cone 120° 6 m left (1.0) > cone 120° 6 m right (1.0) > a lunging line 10 x 3 m straight ahead (2.0) | coef 1.0 > 1.0 > 2.0 shadow, the last hit **perilous** | break posture before the lunge, or sidestep the line; recovery 1.2 s | EXISTS: `wedge` + `beam` + `schedule`; P5 `swingString` |
| **ER 2: Anima Kavrayışı** (`alyez_grab`) | 22 / 30 (p2 first 24) | 1.2 | a tentacle line 40 x 1.6 m to the **farthest non-tank player that is not fixated by a Parishioner** (never grabs the kiter); if it connects the player is pulled to her, held 1.0 s (stun-like `grabbed`), then slammed (coef 3.0) | coef 3.0 shadow | sidestep the line, or break line of sight behind one of the 6 nave pillars (the line stops at the first collider) | **NEW P5 `grabSlam`** (line trace with LoS + pull + hold) |
| **ER 3: Hüküm Halkası** (`alyez_halo`) | 26 / 36 | 1.2 (she rises, gold ring forms) + delayed 1.8 | a ring r 10 around her collapses inward after the delay: everything inside 10 m takes the hit | coef 2.6 shadow, **perilous** | step out beyond 10 m during the delay (ranged just stay); the tank walks her away from the vessels; **recovery 1.2 s: she drops to the floor = the intended posture window** | EXISTS: `circle` (delayed) |
| Soft enrage | below 25% | - | +5% damage every 8 s | - | burn | EXISTS |

**Opening timeline (+10):** 6 Anima Oku (cast 2.0) > 8 Hüküm Kırbacı > 10 Kararsız Anima > 12 Anima Çeşmesi > 16 Hayalet Geçidi (Parishioner #1) > 18 Anima Oku > 20 Güç Yağmuru (cast 2.8) > 22 Anima Kavrayışı > 24 Hüküm Kırbacı > 26 Hüküm Halkası > 32 Çeşme > 34 Kararsız > 50 Hayalet Geçidi #2 (Parishioner #1 must be sealed by then or two chase) > 50% Yargı Saati; the first p2 procession fires 28 s after the phase starts.

**Duties.** *Tank:* take Anima Oku with an interrupt or a defensive, take the lash string with a defensive on the lunge, face the boss away. *Healer:* dispel one Kararsız carrier (never both: the second one needs the defensive), heal the Pulse chip, the grab slam is a spike. *DPS:* the fixated player calls it out and runs the long arc along the wall to the nearest open vessel (at least two are always open); everyone else clears the path and stays out of the Halo ring; spare interrupts and stagger breaks on Güç Yağmuru.

**Script notes (`alyez`):** `state.vessels = [{ id, x, z, open: true, reopenAt: 0 }]` with a persistent green safe shape per open vessel (`c.shape({ kind: 'safe', damage: 0, persist: ... })` tracked with `c.track`); `canClose(v)` returns `closedCount() < 2`; parishioners are `spawnMech('kef_cemaat', ...)` with `tag: 'cem'`, `update()` moves each toward its fixate target at 5.8 m/s (`o.position.x += ...` as Morkan's orbs do), seals when a living `cem` is within 1.8 m of an open vessel (`o.escape()`, `bossFx('holy_burst')`, vessel closes if `canClose`), retargets if the player dies. Judgement rotation: `every(st, 'rot', dt, 12, () => closeNext())`. `alyez_grab.start`: pick the farthest player with `!p.fixated`, trace the line against the pillar colliders (`world.raycast`), on hit `c.pull(p, to boss)`, `statusPlayer(p, 'grabbed', 1.0)`, `schedule(1.0, slam)`.

**Yells (TR).** Pull: "Her günahın bir bedeli vardır." 50%: "Yargı saati geldi!" Death: "Ruhlarım... özgür..."

**Loot `loot_kef_b3`** (section 5.5).

```ts
boss({ id: 'boss_alyez', name: 'Yüce Hâkim Alyez', title: 'Ruhların Hâkimi', model: GENB('golge_rahibesi'), scale: 1.25, tint: 0xb0384a, emissive: 0xc9a24a, role: 'caster',
  hp: 75, dmg: 2.3, speed: 5.2, radius: 1.2, enrage: 270, arenaR: 28, loot: 'loot_kef_b3', anims: A_GEN, resist: R_GHOST, poise: 500,
  visual: { emissiveIntensity: 0.6, glow: 0xc9a24a, runRef: 5 },
  basic: cone('alyez_touch', 'Hüküm Dokunuşu', 4, 90, 2.4, 1.0, 'Attack', 0.55, { windup: 0.7, telegraph: true, damage: { coef: 1.0, type: 'shadow' } } as Ab),
  abilities: [
    proj('alyez_anima_bolt', 'Anima Oku', 22, 40, 12, 2.0, 3.0, 'shadow', 'shadow_projectile', 'Cast', 0.6, { initialCooldown: 6, castTime: 2.0, interruptible: true, kick: 2, tankBuster: true, sfx: 'shadow_cast' }),
    custom('alyez_unstable', 'Kararsız Anima', 24, 10, 1.0, 'Cast', { sfx: 'boss_cast', params: { impact: 0.6 } }),
    custom('alyez_procession', 'Hayalet Geçidi', 34, 16, 1.5, 'Cast', { sfx: 'boss_cast', params: { impact: 0.7 } }),
    custom('alyez_volley', 'Güç Yağmuru', 30, 20, 2.8, 'Cast', { castTime: 2.8, interruptible: true, kick: 2, sfx: 'boss_cast', params: { impact: 1.2 } }),
    custom('alyez_fountain', 'Anima Çeşmesi', 20, 12, 1.2, 'Attack2', { sfx: 'boss_cast', params: { impact: 0.6 } }),
    custom('alyez_judgement', 'Yargı Saati', 999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),
    // ER layer (section 5.0)
    custom('alyez_lash', 'Hüküm Kırbacı', 16, 8, 0.7, 'Attack', { sfx: 'boss_cast', tankBuster: true, params: { impact: 0.45, hits: 3 } }),
    custom('alyez_grab', 'Anima Kavrayışı', 30, 22, 1.2, 'Attack2', { sfx: 'boss_cast', perilous: true, params: { impact: 0.9 } }),
    custom('alyez_halo', 'Hüküm Halkası', 36, 26, 1.2, 'Attack2', { sfx: 'boss_roar', perilous: true, params: { impact: 3.0 } }),
  ],
  phases: [
    bp('p1', 1.01, ['alyez_anima_bolt', 'alyez_unstable', 'alyez_procession', 'alyez_volley', 'alyez_fountain', 'alyez_lash', 'alyez_grab', 'alyez_halo']),
    bp('p2', 0.5, ['alyez_anima_bolt', 'alyez_unstable', 'alyez_procession', 'alyez_volley', 'alyez_fountain', 'alyez_lash', 'alyez_grab', 'alyez_halo'], { yell: 'Yargı saati geldi!', ability: 'alyez_judgement' }),
  ],
  intro: 'Her günahın bir bedeli vardır.', death: 'Ruhlarım... özgür...',
  arena: { cx: 160, cz: 28, w: 80, h: 56, homeX: 170, homeZ: 28 } });
```

### 5.4 Boss 4 (final, showpiece): Baş Kamarar Velkaan, "Kefaret Salonlarının Kibirli Efendisi" (`boss_velkaan`)

*Halls of Atonement: Lord Chamberlain.* The servant who took the halls by deceit and now hoards anima. Four sinstone statues obey him: they hurl, beam, erupt and, in the intermissions, fire outward. Visual: a tall noble in a black-red coat with a high collar, a scepter, crimson aura; the statues are weeping giants.

| hpMult | dmgMult | speed | radius | enrage | arenaR | arena | model |
|---|---|---|---|---|---|---|---|
| 115 | 2.6 | 5.4 m/s | 1.2 | 420 s | 34 | Kamarar Salonu 64 x 64 m at floor 14.4, statues at (50.5, 24.5), (60.5, 24.5), (50.5, 34.5), (60.5, 34.5), ritual ring and dais at the centre (tile (55.5, 29.5), faces north) | NEW `gen/bosses/velkaan.glb`; stand-in `gen/bosses/kemik_lordu.glb` x1.1 tinted `0x9a2a3a`, emissive `0xc8382f` (clips `Attack`, `Attack2`, `Cast`, `Enrage`) |

**Statues.** Four `kef_heykel` mechanic entities (PROC `sinstone_statue`, invulnerable, `makeInvulnerable`), each with a beam anchor at its head. They are moved with `c.goTo` (5 m/s) between corner posts and the centre. They are the geometry of the fight; their visual props `statue_1..4` stay as decor under them (hide the decor when the entity spawns, P15).

**Phases.**

| phase | hp | active | on enter |
|---|---|---|---|
| p1 | 100% to 70% | scepter, core: `velkaan_flay`, `velkaan_unleashed`, `velkaan_toss`, `velkaan_erupting`, `velkaan_woe`; ER: `velkaan_triple`, `velkaan_reap`, `velkaan_stomp` | intro yell |
| p2 Kamarar Korosu I (mechanic phase) | at 70% | about 14 s: `velkaan_chorus` | yell, hit-stop 120 ms, heavy shake |
| p3 | after chorus I | p1 set, +10% damage | - |
| p4 Kamarar Korosu II (mechanic phase) | at 40% | `velkaan_chorus` (faster, 3 volleys at 1.8 s) | yell |
| p5 | after chorus II | p1 set, Azap Ayini cd 36, +10% more damage; soft enrage below 15% (+5% per 5 s) | - |

| Ability (id) | first / cd | cast / windup | Shape | Damage / effect | Counter | Kit |
|---|---|---|---|---|---|---|
| Asa Darbesi (`velkaan_scepter`, basic) | every 2.4 s | 0.7 | cone 90° 5 m, telegraph | coef 1.0 | tank | EXISTS (data) |
| **Ruh Yüzme** (`velkaan_flay`) | 6 / 14 | 1.0 | 5 s shadow DoT on the tank: a ring r 1.2 on the target every 1 s | coef 0.55 per second, `curse` -20% damage for 5 s | healer cooldown / tank defensive | EXISTS: `every` + `circle` (follow), `statusPlayer` |
| **Serbest Bırakılan Azap** (`velkaan_unleashed`) | 9 / 18 | 2.0 | wedge 40° 40 m at a random player | coef 3.2, knockback 3 | step out of the line, never pull it through other players | EXISTS: `wedge` |
| **Telekinetik Fırlatma** (`velkaan_toss`) | 13 / 24 | 1.8 | each statue launches along a line (26 x 3 m) at a random player; after the hit the statue glides to the end of its line; **a line that crosses another statue makes it burst** (circle r 6) | line coef 3.0, burst coef 2.6 | spread so no two lines point at the same statue; never aim a statue at a statue | EXISTS: `beam` + geometry (statues are entities) |
| **Çile Patlaması** (`velkaan_erupting`) | 18 / 26 | 2.4 | 5 circles r 8: one on Velkaan, one on each statue | coef 2.4 | leave all five, no overlapping safe spots | EXISTS: `circle` |
| **Azap Ayini** (`velkaan_woe`) | 36 / 44 (p5 36) | 10 s channel | 4 **blockable** beams (width 2.4 m) from Velkaan to the four statues; the first player in a beam blocks it for everyone behind; tick 0.5 s | coef 0.7 per tick on the blocker; each beam that stays unblocked **charges its statue**: at the end it detonates, circle r 12, coef 3.6 | tank blocks two beams, two players with major defensives (or immunities) block the other two; swap the blocker if the defensive ends | **NEW P5 `blockableBeam`** |
| **Kamarar Korosu** (`velkaan_chorus`) | at 70% / 40% | 14 s mechanic phase | Velkaan teleports to the centre and is immune; the four statues glide to the centre (3 s) and then fire **12 beams each volley** (3 per statue, a fan of 20°, length 34 m, width 2.4 m), 3 volleys at 3.0 s, 6.0 s, 9.0 s (second chorus: 3.0 / 4.8 / 6.6 s), each telegraphed 1.6 s | coef 2.6 per beam hit (each impact separate) | read the wedge gaps; use a defensive: most of the damage of the fight is here | **NEW P5 `intermission`**; beams EXISTS |
| **ER 1: Asa Üçlemesi** (`velkaan_triple`) | 12 / 22 | 0.70, 0.70, then 1.2 + delayed hold 0.6 | **string of 3** on the tank: cone 90° 5 m (1.0) > backhand cone 90° 5 m (1.0) > scepter slam, circle r 5 centred 4 m in front with knockback 3 (3.2) | coef 1.0 > 1.0 > 3.2, the last hit **perilous** | posture breaks it before the third hit; a defensive on the raise; recovery 1.4 s | EXISTS: `wedge` + `circle` + `schedule`; P5 `swingString` |
| **ER 2: Hasat Pençesi** (`velkaan_reap`) | 22 / 34 | 0.6 (shadow step), marker 1.0 s ahead | he vanishes and reappears **behind a random non-tank player**: a marker circle r 3 shows the destination 1.0 s before; then a **2-hit cleave** (cone 3 m 120°, 1.4 > 2.2) on that player | coef 1.4 > 2.2 | leave the marker circle (any direction), keep away from the group; the cleave string needs a defensive if caught; recovery 1.2 s | EXISTS: `teleport`, `circle` (marker), `wedge` + `schedule` |
| **ER 3: Kibir Adımı** (`velkaan_stomp`) | 30 / 38 | 1.2 (jump 0.6), then rings every 0.8 s | he jumps to the centre of the room and stomps: **3 expanding rings** (bands 3 m wide at r 6, 14, 22 from the landing) at 0.8 s intervals, the first at landing | coef 2.0 per ring, **perilous** | stand in the gaps between the bands (r 8 to 12 or r 16 to 20, the bands are r 4.5 to 7.5, 12.5 to 15.5 and 20.5 to 23.5) or dodge-roll through each band; **recovery 1.6 s after the last ring = the intended posture window**; never starts during Azap Ayini or a Chorus | EXISTS: `ringPoints` / `ring` + `schedule`; P5 `ringWaves` |
| Hard enrage | 420 s | - | "Kibir Çöküşü": +300% damage and a room pulse | - | - | EXISTS (boss kit enrage) |

**Opening timeline (+10):** 0 pull > 6 Ruh Yüzme > 9 Serbest Azap > 12 Asa Üçlemesi (12 to 15.5, recovery to 17) > 18 Çile Patlaması > 20 Ruh Yüzme > 22 Hasat Pençesi (marker 22, strike 23, recovery to 25) > 27 Serbest Azap > 30 Kibir Adımı (rings 31.2 to 32.8, recovery to 34.4) > 36 Azap Ayini (channel 36 to 46) > 37 Telekinetik > 70% (about 0:55 to 1:00): **Chorus I** (14 s) > 70 to 110 repeat > 40% (about 1:55): **Chorus II** > p5 with Azap Ayini every 36 s. (The queue pushes any ER move that would collide with a core cast; the real order is decided by `cdOverride` at runtime.)

**Duties.** *Tank:* take Ruh Yüzme and the scepter string (defensive on the raise), block two Azap Ayini beams (first defensive), keep Velkaan facing the wall. *Healer:* one major healing cooldown per Chorus and per Azap Ayini, dispel nothing (the fight has no dispel). *DPS:* two players with defensives are the other beam blockers; everyone watches the line angles of Telekinetik so no statue is aimed at another statue; the Kibir Adımı gaps and the Hasat marker are the movement checks; use the Chorus intermission for personal defensives, not burst (Velkaan is immune), and the Stomp recovery for the posture break.

**Script notes (`velkaan`):** `state.statues = ['kef_heykel' x4]`, spawned in `init()` at the corner posts via `spawnMech` and `makeInvulnerable`; `statueAt(i)` helper. `velkaan_toss`: for each statue pick a player (`pickPlayers(c, 4)`), `beam` from the statue toward the player (length 26), then after the delay `c.goTo` the statue to the line end; check `distance(point-to-line)` of every other statue to the line < 2.2 and add `circle(c, sx, sz, 6, 0.4, 2.6)` there. `velkaan_woe`: `blockableBeam(c, from, to, { width: 2.4, duration: 10, tick: 0.5, coef: 0.7, onUnblocked: (i) => circle(c, sx, sz, 12, 1.0, 3.6) })`. `velkaan_chorus`: `intermission(c, { immune: true, teleport: centre, run(c) { statues.goTo(centre); schedule volleys... }, end: endMechanicPhase })`. `velkaan_stomp`: `ringWaves(c, { x, z, radii: [6, 14, 22], width: 3, gap: 0.8, coef: 2.0 })` + `punish`. `velkaan_reap`: `c.teleport` after the 1.0 s marker, then two `wedge` calls at 0.8 s and 1.9 s.

**Yells (TR).** Pull: "Kefaretiniz bu salonda kazılıdır: sizinki hasadım." 70%: "Heykellerim! Beni savunun!" 40%: "Kibriniz... tatlı bir meyve." Death: "Salonlar... bana aitti..."

**Loot `loot_kef_b4`** (section 5.5).

```ts
boss({ id: 'boss_velkaan', name: 'Baş Kamarar Velkaan', title: 'Kefaret Salonlarının Kibirli Efendisi', model: GENB('kemik_lordu'), scale: 1.1, tint: 0x9a2a3a, emissive: 0xc8382f, role: 'caster',
  hp: 115, dmg: 2.6, speed: 5.4, radius: 1.2, enrage: 420, arenaR: 34, loot: 'loot_kef_b4', anims: A_GEN, resist: R_VENTHYR, poise: 750,
  visual: { emissiveIntensity: 0.5, eyeEmissive: 0xff5040, glow: 0xc8382f, runRef: 5 },
  basic: cone('velkaan_scepter', 'Asa Darbesi', 5, 90, 2.4, 1.0, 'Attack', 0.63, { windup: 0.7, telegraph: true }),
  abilities: [
    custom('velkaan_flay', 'Ruh Yüzme', 14, 6, 1.0, 'Cast', { sfx: 'boss_cast', params: { impact: 0.6 } }),
    custom('velkaan_unleashed', 'Serbest Bırakılan Azap', 18, 9, 2.0, 'Attack2', { sfx: 'boss_cast', params: { impact: 0.9 } }),
    custom('velkaan_toss', 'Telekinetik Fırlatma', 24, 13, 1.8, 'Cast', { sfx: 'boss_cast', params: { impact: 0.9 } }),
    custom('velkaan_erupting', 'Çile Patlaması', 26, 18, 2.4, 'Cast', { sfx: 'boss_cast', params: { impact: 1.2 } }),
    custom('velkaan_woe', 'Azap Ayini', 44, 36, 1.5, 'Cast', { sfx: 'boss_roar', perilous: true, params: { impact: 0.8 } }),
    custom('velkaan_chorus', 'Kamarar Korosu', 999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),
    // ER layer (section 5.0)
    custom('velkaan_triple', 'Asa Üçlemesi', 22, 12, 0.7, 'Attack', { sfx: 'boss_cast', tankBuster: true, params: { impact: 0.45, hits: 3 } }),
    custom('velkaan_reap', 'Hasat Pençesi', 34, 22, 0.6, 'Attack2', { sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('velkaan_stomp', 'Kibir Adımı', 38, 30, 1.2, 'Attack2', { sfx: 'boss_roar', perilous: true, params: { impact: 0.9 } }),
  ],
  phases: [
    bp('p1', 1.01, ['velkaan_flay', 'velkaan_unleashed', 'velkaan_toss', 'velkaan_erupting', 'velkaan_woe', 'velkaan_triple', 'velkaan_reap', 'velkaan_stomp']),
    bp('p2', 0.7, [], { yell: 'Heykellerim! Beni savunun!', ability: 'velkaan_chorus' }),
    bp('p3', 0.699, ['velkaan_flay', 'velkaan_unleashed', 'velkaan_toss', 'velkaan_erupting', 'velkaan_woe', 'velkaan_triple', 'velkaan_reap', 'velkaan_stomp']),
    bp('p4', 0.4, [], { yell: 'Kibriniz... tatlı bir meyve.', ability: 'velkaan_chorus' }),
    bp('p5', 0.399, ['velkaan_flay', 'velkaan_unleashed', 'velkaan_toss', 'velkaan_erupting', 'velkaan_woe', 'velkaan_triple', 'velkaan_reap', 'velkaan_stomp']),
  ],
  intro: 'Kefaretiniz bu salonda kazılıdır: sizinki hasadım.', death: 'Salonlar... bana aitti...',
  arena: { cx: 224, cz: 120, w: 64, h: 64, homeX: 224, homeZ: 120 } });
```

### 5.5 Loot: personal-loot tables with named items (CORE_MECHANICS §15)

Every boss drops a **personal chest**: 1 guaranteed item per player (+ a chance of a second, `extraItems` for the final boss), from the boss's own table, 70% smart loot (main stat / armour type of the spec). Each table has **three named items** with build-defining effects; each personal roll has a `namedChance` to be one of them (the rest is smart loot of the `focus` slots), and a named item is picked among those the player's spec can use first (`classes`). M+ item level follows CORE_MECHANICS §4.4: end chest `68 + 2 x min(L, 12)`, Great Vault +3. **There is no trinket slot** (`EQUIP_SLOTS` has helm, shoulders, chest, gloves, legs, boots, belt, amulet, ring1, ring2, weapon, offhand): the "signature trinket" role is filled by the ring, amulet, offhand, boots, helm and shoulder uniques below, each a `UniqueDef` whose `special` proc id is implemented through `G.character.hasSpecial(id)`, in the style of `data/uniques.ts`. Stats are the ones that exist in `types/stats.ts` today (`staggerPct` and `poiseDamagePct` already exist in the poise system).

| boss | table id | focus slots | `namedChance` | named items (slot, who) |
|---|---|---|---|---|
| Halkor | `loot_kef_b1` | axe2h, shield, gloves, boots, belt | 0.25 | **Halkor'un Kıymığı** (ring, any) · **Günah Taşı Siperi** (shield, Şövalye / Paladin tanks and DPS) · **Kırık Hüküm** (2H axe, Barbar / Şövalye) |
| Ekelon | `loot_kef_b2` | dagger, chest, legs, amulet, helm | 0.25 | **Gözcünün Gözü** (amulet, any) · **Gökten İniş Çizmeleri** (boots, any) · **Gözcü Hançeri** (dagger, Haydut) |
| Alyez | `loot_kef_b3` | staff, wand, tome, ring, shoulders | 0.25 | **Kefaret Kabı** (offhand tome, casters and healers) · **Hâkimin Mührü** (helm, any) · **Altın Halka Asası** (wand, Büyücü / Warlock / Ejderhasoy) |
| Velkaan | `loot_kef_b4` | chest, helm, staff, sword1h, axe2h, dagger, wand | 0.35 | **Kızıl Ferula** (staff, Büyücü / Warlock / Nekromant) · **Hasat Pençesi** (1H sword, Şövalye / Paladin / İblis Avcısı) · **Kibirli Efendinin Omuzluğu** (shoulders, any); `extraItems: 1`, `setChance: 0.25`; the M+ end chest is `gp('chest_epic')` at the exit portal |

Build-defining effects in words: **Halkor'un Kıymığı** turns crits into floor control (Cam Kırığı puddles); **Günah Taşı Siperi** makes blocking and posture breaks stack armour and ends in a shield-bash shockwave that fills enemy posture (a tank / posture build); **Kırık Hüküm** makes posture breaks the damage engine of a two-hander. **Gözcünün Gözü** rewards stuns and breaks with damage reduction; **Gökten İniş Çizmeleri** puts a landing shockwave on every dash, leap or blink (a mobility build); **Gözcü Hançeri** makes backstabs and broken targets crit (a rogue burst build). **Kefaret Kabı** shields allies on dispels and overheals (a healer build); **Hâkimin Mührü** turns every kick into a stacking party buff and a cooldown reset (the interrupt build, the best friend of this dungeon's kick checks); **Altın Halka Asası** makes channelled casters build rings for a burst. **Kızıl Ferula** marks the ground for +12% damage taken; **Hasat Pençesi** builds three harvest marks into a 300% detonation; **Kibirli Efendinin Omuzluğu** is the Kibirli / elite hunter's piece (damage and speed after killing an elite or boss).

```ts
// data/loot.ts: LootTableDef gains `named?: string[]` and `namedChance?: number` (P13)
loot_kef_b1: { focus: ['axe2h', 'shield', 'gloves', 'boots', 'belt'], setChance: 0.2, named: ['leg_kef_halkor_shard', 'leg_kef_sinstone_aegis', 'leg_kef_fracture_axe'], namedChance: 0.25 },
loot_kef_b2: { focus: ['dagger', 'chest', 'legs', 'amulet', 'helm'], setChance: 0.2, named: ['leg_kef_ekelon_eye', 'leg_kef_dive_boots', 'leg_kef_commander_dagger'], namedChance: 0.25 },
loot_kef_b3: { focus: ['staff', 'wand', 'tome', 'ring', 'shoulders'], setChance: 0.2, named: ['leg_kef_vessel', 'leg_kef_judge_seal', 'leg_kef_halo_wand'], namedChance: 0.25 },
loot_kef_b4: { focus: ['chest', 'helm', 'staff', 'sword1h', 'axe2h', 'dagger', 'wand'], setChance: 0.25, extraItems: 1, named: ['leg_kef_ferula', 'leg_kef_reaper', 'leg_kef_pride_mantle'], namedChance: 0.35 },
```

```ts
// data/uniques.ts additions (u({...}) helper), values p(x) = x / 100. `tome_t4`, `wand_t4`, `shield_t3`, `boots_{w}_t3`, `helm_{w}_t3`, `shoulders_{w}_t4` follow the existing base-id patterns: the items owner confirms them.

// ---- Halkor (boss 1)
u({ id: 'leg_kef_halkor_shard', baseId: 'ring_gold', name: 'Halkor\'un Kıymığı', minItemLevel: 60, source: 'Halkor (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'critChance', min: p(3), max: p(4) }, { stat: 'maxHpPct', min: p(3), max: p(5) }],
  special: { id: 'leg_kef_halkor_shard', desc: 'Kritik vuruşlarının %12\'si hedefin altında 3 m\'lik bir Cam Kırığı bırakır (4 sn, saniyede %50 hasar, 3 sn bekleme).', params: { chance: 0.12, radius: 3, dur: 4, coefPerSec: 0.5, icd: 3 } },
  flavor: 'Günah taşının bir parçası hâlâ sıcak.' });
u({ id: 'leg_kef_sinstone_aegis', baseId: 'shield_t3', name: 'Günah Taşı Siperi', minItemLevel: 60, classes: ['knight', 'paladin'], source: 'Halkor (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(50), max: p(70) }, { stat: 'blockChance', min: p(4), max: p(6) }, { stat: 'staggerPct', min: p(20), max: p(30) }],
  special: { id: 'leg_kef_sinstone_aegis', desc: 'Bir saldırıyı engellediğinde veya bir düşmanın Duruşunu kırdığında 8 sn boyunca 1 Taş Deri yığını alırsın (en çok 5): yığın başına %3 zırh ve %2 hasar azaltma. 5 yığında Kalkan Darbesi tüm yığınları harcar, 5 m çevreye %250 hasar vurur ve vurduğu düşmanların Duruş çubuğunu %40 doldurur.', params: { maxStacks: 5, dur: 8, armor: 0.03, dr: 0.02, coef: 2.5, radius: 5, poiseFill: 0.4 } },
  flavor: 'Üzerindeki her isim, bir omzun daha yükünü taşıdı.' });
u({ id: 'leg_kef_fracture_axe', baseId: 'axe2h_t4', name: 'Kırık Hüküm', minItemLevel: 60, classes: ['barbarian', 'knight'], source: 'Halkor (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(90), max: p(110) }, { stat: 'staggerPct', min: p(25), max: p(35) }, { stat: 'str', min: 25, max: 35 }],
  special: { id: 'leg_kef_fracture_axe', desc: 'Bir düşmanın Duruşunu kırdığında hedefin altında 4 m\'lik bir Günah Çatlağı açılır (6 sn, saniyede %60 hasar); çatlaktaki düşmanlar %20 daha fazla Duruş hasarı alır. Duruş kırma hasarın +%30.', params: { radius: 4, dur: 6, coefPerSec: 0.6, poiseTaken: 0.2, poiseDamage: 0.3 } },
  flavor: 'Hükmü verilmeden önce kırıldı.' });

// ---- Ekelon (boss 2)
u({ id: 'leg_kef_ekelon_eye', baseId: 'amulet_ancient', name: 'Gözcünün Gözü', minItemLevel: 60, source: 'Taş Komutan Ekelon (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'attackSpeed', min: p(4), max: p(6) }, { stat: 'maxHpPct', min: p(3), max: p(5) }],
  special: { id: 'leg_kef_ekelon_eye', desc: 'Bir düşmanı sersemlettiğinde veya sendelettiğinde 6 sn boyunca %8 hasar azaltma (10 sn bekleme).', params: { dr: 0.08, dur: 6, icd: 10 } },
  flavor: 'Taşın içinden bile görür.' });
u({ id: 'leg_kef_dive_boots', baseId: 'boots_{w}_t3', name: 'Gökten İniş Çizmeleri', minItemLevel: 60, source: 'Taş Komutan Ekelon (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'moveSpeedPct', min: p(8), max: p(10) }, { stat: 'cdr', min: p(4), max: p(6) }, { stat: 'maxHpPct', min: p(2), max: p(4) }],
  special: { id: 'leg_kef_dive_boots', desc: 'Atılma, sıçrama, ışınlanma veya hamle yeteneğinden sonra 5 m çevrede %180 hasarlı bir iniş dalgası bırakır (8 sn bekleme); sendelemiş düşmanlara iki kat vurur ve o yeteneğin bekleme süresini 1 sn azaltır.', params: { coef: 1.8, radius: 5, icd: 8, staggerMult: 2, cdReduce: 1 } },
  flavor: 'Gökyüzünden bakan, yere basmayı da bilir.' });
u({ id: 'leg_kef_commander_dagger', baseId: 'dagger_t4', name: 'Gözcü Hançeri', minItemLevel: 60, classes: ['rogue'], source: 'Taş Komutan Ekelon (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'critChance', min: p(3), max: p(4) }, { stat: 'dex', min: 25, max: 35 }],
  special: { id: 'leg_kef_commander_dagger', desc: 'Arkadan veya sendelemiş bir düşmana vurduğunda 8 sn boyunca hedeften aldığın hasar %10 azalır ve sonraki 3 vuruşun %50 ek kritik şansı olur (12 sn bekleme).', params: { dr: 0.1, dur: 8, critAdd: 0.5, hits: 3, icd: 12 } },
  flavor: 'Nöbetçinin arkasında nöbet tutulmaz.' });

// ---- Alyez (boss 3)
u({ id: 'leg_kef_vessel', baseId: 'tome_t4', name: 'Kefaret Kabı', minItemLevel: 60, source: 'Yüce Hâkim Alyez (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'healingPct', min: p(6), max: p(8) }, { stat: 'maxHpPct', min: p(3), max: p(5) }],
  special: { id: 'leg_kef_vessel', desc: 'Bir müttefikten bir olumsuz etki arındırdığında veya iyileştirme taşırdığında o müttefike %5 canlık bir anima kalkanı verir (6 sn, 8 sn bekleme).', params: { shieldPct: 0.05, dur: 6, icd: 8 } },
  flavor: 'Altın bir buğu, kapağın altında bekliyor.' });
u({ id: 'leg_kef_judge_seal', baseId: 'helm_light_t3', name: 'Hâkimin Mührü', minItemLevel: 60, source: 'Yüce Hâkim Alyez (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'int', min: 20, max: 30 }, { stat: 'cdr', min: p(4), max: p(6) }, { stat: 'maxHpPct', min: p(3), max: p(5) }],
  special: { id: 'leg_kef_judge_seal', desc: 'Başarılı her kesinti, 30 m içindeki tüm müttefiklere 8 sn boyunca %4 hasar ve %6 hız verir (3 yığına kadar). 3 yığında kesinti yeteneğinin bekleme süresi sıfırlanır (30 sn bekleme).', params: { dmg: 0.04, speed: 0.06, dur: 8, maxStacks: 3, radius: 30, resetIcd: 30 } },
  flavor: 'Her sözün ardında bir mühür.' });
u({ id: 'leg_kef_halo_wand', baseId: 'wand_t4', name: 'Altın Halka Asası', minItemLevel: 60, classes: ['mage', 'warlock', 'evoker'], source: 'Yüce Hâkim Alyez (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(70), max: p(90) }, { stat: 'castSpeed', min: p(6), max: p(8) }, { stat: 'int', min: 20, max: 30 }],
  special: { id: 'leg_kef_halo_wand', desc: 'Kanalize ettiğin büyüler her 1 sn\'de 1 Anima Halkası biriktirir (en çok 4). 4 halkada bir sonraki kanalsız büyün tüm halkaları harcar, 6 m çevreye %200 hasarlı bir patlama yapar ve 4 sn boyunca %15 ek hasar verir.', params: { perSec: 1, maxRings: 4, coef: 2.0, radius: 6, bonus: 0.15, bonusDur: 4 } },
  flavor: 'Halka kapandığında, hüküm verilmiş olur.' });

// ---- Velkaan (boss 4)
u({ id: 'leg_kef_ferula', baseId: 'staff_t4', name: 'Kızıl Ferula', minItemLevel: 60, classes: ['mage', 'warlock', 'necromancer'], source: 'Baş Kamarar Velkaan (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(90), max: p(110) }, { stat: 'damagePct', min: p(8), max: p(12) }, { stat: 'int', min: 25, max: 35 }],
  special: { id: 'leg_kef_ferula', desc: 'Hasar veren her büyünün %10 ihtimaliyle hedefin altında 4 m\'lik bir Kefaret Halkası bırakır; içindeki düşmanlar 5 sn boyunca %12 daha fazla hasar alır (6 sn bekleme).', params: { chance: 0.10, radius: 4, dur: 5, taken: 0.12, icd: 6 } },
  flavor: 'Siyah sap, oyma kemik, ucunda kızıl bir parıltı.' });
u({ id: 'leg_kef_reaper', baseId: 'sword1h_t4', name: 'Hasat Pençesi', minItemLevel: 60, classes: ['knight', 'paladin', 'demonhunter'], source: 'Baş Kamarar Velkaan (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(85), max: p(105) }, { stat: 'critDamage', min: p(15), max: p(25) }, { stat: 'str', min: 20, max: 30 }],
  special: { id: 'leg_kef_reaper', desc: 'Vuruşlarının %12\'si hedefe bir Hasat işareti koyar (6 sn, en çok 3). 3. işarette Kibir Hasadı patlar: hedefte %300 hasar, en yakın 2 düşmana 1 işaret yayılır.', params: { chance: 0.12, maxMarks: 3, dur: 6, coef: 3.0, spread: 2 } },
  flavor: 'Kibrin hasadı hiç bitmez.' });
u({ id: 'leg_kef_pride_mantle', baseId: 'shoulders_{w}_t4', name: 'Kibirli Efendinin Omuzluğu', minItemLevel: 60, source: 'Baş Kamarar Velkaan (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(4), max: p(6) }, { stat: 'damagePct', min: p(5), max: p(7) }, { stat: 'resAll', min: p(6), max: p(8) }],
  special: { id: 'leg_kef_pride_mantle', desc: 'Elit düşmanlara ve Kibir Tecessümü\'ne %15 daha fazla hasar verirsin. Bir elit, Kibir Tecessümü veya patron öldüğünde 20 sn boyunca %10 hasar ve %5 hız kazanırsın (Kibirli ödülüyle birleşir).', params: { eliteDamage: 0.15, dur: 20, dmg: 0.10, speed: 0.05 } },
  flavor: 'Kibir, omuzlarda en iyi durur.' });
```

(`tome_t4`, `wand_t4` and the `{w}` armour patterns are base-id placeholders that the items owner confirms. When the WoW rating stats of CORE_MECHANICS §4.2 (CM1: `critRating`, `hasteRating`, `versRating`, `masteryRating`) land, swap `critChance`, `attackSpeed`, `healingPct` and `damagePct` for the matching ratings at the same budget.) Set pieces: one themed set `set_kefaret` (**Kefaret Seti**, 4 pieces: helm, gloves, boots, dagger, crimson-black recolours) is recommended as a follow-up for the items module; `setChance` above already reserves the drop slot.



---



## 6. Mythic+ tuning

Rules this section obeys: CORE_MECHANICS §6 (scaling HP x1.10 per level and damage x1.08 per level from +2, then the table of GDD_CONTENT §5.4; Fortified trash +20% HP / +30% damage; Tyrannical bosses +30% HP / +15% damage; death penalty +15 s; chests at 100 / 80 / 60% of the timer), GDD_CONTENT §0.4 (completion needs every boss dead **and** forces at 100%; summoned and boss-spawned enemies give 0 forces) and `data/mythicAffixes.ts` (affix params, `COUNTDOWN_SEC 10`, `DEATH_PENALTY_SEC 15`). Numbers marked "target" are SimBench / pace-check (`tools/pace-check.mjs`) verification targets, not measured values.

### 6.1 Route, forces and timer math

**Timer 29:00 (1740 s)** (revision 1 had 28:00; the seven stair climbs and the bridge add about 40 s of walking). Thresholds: **+3 <= 17:24 (1044 s), +2 <= 23:12 (1392 s), +1 <= 29:00.** Forces required 380; Kibirli marks at 20 / 40 / 60 / 80% = 76 / 152 / 228 / 304 forces.

**Route A, pull by pull (393 forces, 103.4%).** Pulls merge the packs of one area; `c_p19` and `m_p28` are patrols that join the pull they pass.

| pull | packs | forces | cumulative | % of 380 | notes |
|---|---|---|---|---|---|
| 1 | `k_p01` + `k_p02` | 27 | 27 | 7.1% | narthex, easy |
| 2 | `k_p03` + `k_p04` | 26 | 53 | 13.9% | gallery: statue Slashers wake (M3), pull toward the narthex mouth |
| 3 | `k_p05` (patrol) | 14 | 67 | 17.6% | kill when it walks into the clear lane |
| 4 | `w_p06` + `w_p07` | 20 | 87 | 22.9% | west chamber, shard 1. **20% mark (76): Kibir #1** |
| 5 | `e_p08` + `e_p09` | 20 | 107 | 28.2% | east chamber, shard 2 (route B: Archive detour here) |
| 6 | `n_p10` + `n_p11` | 20 | 127 | 33.4% | north chamber, shard 3: **Halkor awakens** |
| boss 1 | Halkor | - | 127 | 33.4% | |
| 7 | `b_p12` + `b_p13` | 27 | 154 | 40.5% | colonnade; Reaver + Slasher. **40% mark (152): Kibir #2** |
| 8 | `c_p14` + `c_p15` | 35 | 189 | 49.7% | courtyard west |
| 9 | `c_p19` + `c_p16` | 26 | 215 | 56.6% | patrol and the Eviscerators |
| 10a | `c_p18` | 18 | 233 | 61.3% | casters first (crosses **60% mark (228): Kibir #3** in a calm pack) |
| 10b | `c_p17` | 20 | 253 | 66.6% | dormant Reaver + 2 Slashers, with the Kibir Tecessümü if still alive |
| 11 | `e_p20` + `e_p21` | 24 | 277 | 72.9% | stair hall |
| boss 2 | Ekelon | - | 277 | 72.9% | |
| 12 | `a_p22` + `a_p23` | 28 | 305 | 80.3% | lament bridge. **80% mark (304): Kibir #4** |
| boss 3 | Alyez | - | 305 | 80.3% | |
| 13 | `m_p28` + `m_p26` | 35 | 340 | 89.5% | patrol + Gargon pack, west end of the stair |
| 14 | `m_p24` | 17 | 357 | 93.9% | Sigar #1 alone |
| 15 | `m_p25` | 19 | 376 | 98.9% | Reaver + Slasher |
| 16 | `m_p27` | 17 | 393 | **103.4%** | Sigar #2 alone |
| boss 4 | Velkaan | - | 393 | 103.4% | forces must be at 100% when he dies |

**Route B (394 forces, 103.7%).** Pull 5 is followed by the Archive (`o_p29` + `o_p30`, 40), pull 7 by the **Hizmetkâr Geçidi** (`s_p33` + `s_p34`, 24) instead of pulls 8 to 10, then pull 11 (24); after Ekelon the lament bridge (28) then the **crypts** (`o_p31` + `o_p32`, 36); then the same stair. Net: 393 - 99 + 24 + 40 + 36 = 394. Route B saves the dense courtyard and about 120 m of walking inside it but needs the two optional detours (about 150 m of extra walking) and loses the courtyard shrine.

**Timer math (target) for a competent 5-man group at the gear of its key.** Fixed time (walking, door animations, loot, regroup) is about 4:15 in total (1:05 + 1:20 + 0:45 + 1:05; revision 1 had 3:35, the difference is the stairs S1, S4, S6, S7, S9 and the bridge). Variable time (pulls and bosses) at +10 is 22:05. Time per level scales with enemy HP (x1.10 per level) over group damage growth from gear (about +4.5% per key level as chests drop), a net factor of **1.05 per key level**.

| section (route A) | forces | trash pulls | trash time | walking / loot | boss fight | section | cumulative at +10 |
|---|---|---|---|---|---|---|---|
| 1 Narthex to Halkor | 127 (33.4%) | 6 | 3:45 | 1:05 | 2:10 (incl. 0:15 awakening) | 7:00 | 7:00 |
| 2 Colonnade to Ekelon | 150 (72.9% total) | 6 | 4:40 | 1:20 | 2:20 | 8:20 | 15:20 |
| 3 Lament bridge to Alyez | 28 (80.3%) | 1 | 0:45 | 0:45 | 2:25 | 3:55 | 19:15 |
| 4 Stair to Velkaan | 88 (103.4%) | 4 | 2:30 | 1:05 | 3:30 | 7:05 | **26:20** |

Clean +10 run = **26:20 (90.8% of the 29:00 timer): a +1 with 2:40 of slack = 10 deaths**. A +2 at +10 needs 23:12, i.e. route B or merged pulls and about 3:08 saved, a "good group" result.

| key | clear time, average group | clear time, good group (-12% variable, route B) | expected chest |
|---|---|---|---|
| +2 | 19:12 | 17:24 | +2 (good group +3, exactly on the line) |
| +4 | 20:44 | 18:45 | +2 |
| +7 | 23:20 | 21:02 | +1 (8 s over the +2 line; good group +2) |
| +10 | 26:20 | 23:41 | +1 (good group 29 s over the +2 line) |
| +12 | 28:36 | 25:41 | +1 (average group 24 s from depleting) |
| +15 | 32:26 | 29:03 | untimed (needs mega-pulls and perfect Chorus; even the good group is 3 s over) |

Death budget: each death adds 15 s, so at +12 an average group has 24 s of slack (one death), the intended pressure curve. Boss fight lengths (targets at +10): Halkor 1:50, Ekelon 2:10, Alyez 2:15, Velkaan 3:10, plus intermission and approach time as in the table. The Elden-Ring layer adds punish windows (x1.15 damage for 1.2 to 1.6 s) and posture breaks (x1.25 for 2 s), which SimBench counts as part of the DPS profile; they do not change the targets.

### 6.2 Forces per section and the "forces first" rule

A boss kill never completes the run before 100% forces. If Velkaan dies at 98.9% (pull 15 skipped), the last Sigar pack (17) must still be killed after the fight: Kehanet Taşı logic is unchanged. Forces can be taken from the optional rooms to substitute a skipped pack.

### 6.3 Dangerous pulls (design intent and counters)

| where | why it is dangerous | how to pull it |
|---|---|---|
| `k_p03` statue Slashers (gallery) | two CC-immune melee with a 5 m cone, knockback and a silencing screech; they wake as a whole at 7 m and they sit next to the west-chamber door | pull to the gallery centre, tank faces them away from the group, interrupt Taş Çığlığı |
| shard chambers `w_p06`, `e_p08`, `n_p10` | Obliterator + Collector = the Wicked Bolt and Siphon interrupt checks, and the shard channels Çırpınma for 8 s and drops Günah Depremi circles under everybody | kill the casters first, then the shard (HP x4: about 9 s), never bring the second pack into the chamber |
| `b_p13` and `c_p17` and `m_p25`: Reaver + Slasher(s) | all CC-immune, the Reaver's Ölümcül Darbe (heal -50%) and Taşa Çevir (petrify 5 s) are the dungeon's biggest trash threats; they do not stop | one pull at a time, a big defensive on the first Mortal Strike, interrupt Taşa Çevir or stay out of 7 m |
| courtyard mega-pull: `c_p17` + `c_p18` (+ patrol `c_p19`) | 38 to 48 forces: Reaver, 2 Slashers, 2 casters, 2 Darkblades; four high-priority kicks at once (screech, stone, wicked, siphon) | split as pulls 10a/10b above; never together with Sanguine or Quaking weeks |
| `c_p15` (3 Gargons + Houndmaster + Rahip) | Sadık Av empowers the Gargons, Gece Uluması hastes them, the Rahip heals and shields them; the Gargon bleeds stack on the tank (Necrotic weeks) | kill the Rahip first, interrupt Sadık Av and the heal, burst the Gargons before the howl is off cooldown |
| `o_p31` (crypts) | skittish Groundskeepers flee at 30% and pull `o_p32` | CC or burst; pull both packs together deliberately |
| grand stair: `m_p24` and `m_p27` | two Sigars at once stack `sin_amplified` to +60% damage and healing taken and overlap two sets of 3 bursts r 6 (D2); on a slope the ranged group has the high ground only if it stands above the Sigar | keep them eight tiles apart, kill the patrol `m_p28` when it passes the first Sigar, spread on the marks, break the Sigar's posture (bar 120) during Komünyon recovery |
| healer packs: `b_p12`, `c_p15`, `e_p20`, `m_p25`, `m_p26`, `o_p32` and the bridge pack `a_p23` | the Rahip heals 25% per cast and shields the elite; two of them in one pull out-heal a weak group | one kick on the Rahip per cast (priority 1), kill it first (it kites to 10 to 16 m, so use a gap closer), keep the Reaver in `m_p25` off the shield |
| bridge: `a_p22` + `a_p23` | a long pull on a 24 m span: casters in front, Gargons behind; no knockbacks, but running off the edge costs 25% HP | pull the caster pack to the nave end, fight the Gargons on the branch, never kite onto the void side |

### 6.4 Affix interactions (`data/mythicAffixes.ts` ids)

| affix | interaction in this dungeon | what a good group does |
|---|---|---|
| **Tahkimli** (`fortified`) | Stoneborn trash (hp 1.9 to 2.8, CC-immune) takes the longest to burn; +30% damage hits the Reaver and Slasher cones hardest | pull Stoneborn singly, defensives on Ölümcül Darbe |
| **Zorba** (`tyrannical`) | +30% HP / +15% damage: Velkaan's Chorus and Azap Ayini detonations and Halkor's slam scale up; enrage timers (240 / 270 / 270 / 420 s) become real | bring defensives for the Chorus, maximise uptime |
| **Güçlenen** (`bolstering`) | the Anklebiter swarm (role swarm, counts every third death) bolsters the Stoneborn nearby | AoE the swarm last or evenly, kill Stoneborn last |
| **Öfkeli** (`raging`) | below 30% HP the Stoneborn become CC-immune (already) and hit +50%; the Reaver's Mortal Strike at 30% is a killer | burst the Reaver through 30% or defensive early |
| **Kan Dökücü** (`sanguine`) | puddles plus Halkor's and Ekelon's puddles clog the floor; the Gargon packs in a corridor are the worst | fight in the open, never over boss puddles |
| **Patlayan** (`bursting`) | the Anklebiter swarm (every third death) stacks Bursting while the Gargon bleeds already tick | stagger kills, big healer cooldown on the swarm pulls (`k_p05`, `e_p09`, `o_p30`) |
| **İlham Veren** (`inspiring`) | an Inspiring Obliterator or Collector makes the pack interrupt-immune, so Wicked Bolt and Siphon cannot be stopped | kill the Inspiring one first (highest HP non-swarm member) |
| **Volkanik** (`volcanic`) | players who stay far from enemies (the casters in the shard chambers) get plumes | stay in melee range of something, ranged DPS step in |
| **Sarsıntılı** (`quaking`) | quakes interrupt casts (Dark Communion needs a quake to fail, but also the Lord's heal) and ring damage in the Sigar pulls | spread, quake away from Sigar marks |
| **Patlayıcı Küre** (`explosive`) | orbs spawn beside enemies in combat; the long gallery gives them room to spawn out of sight | assign a player to orbs; Halkor's puddles ignore orbs |
| **Nekrotik** (`necrotic`) | every melee hit adds a stack: Gargon bleeds plus the Reaver's Mortal Strike is the worst combination in the dungeon | kite Gargons, kill the Reaver fast, tank swaps |
| **Kin Dolu** (`spiteful`) | shades chase players in the open courtyard and the terrace | kite wide, let the tank pick up when possible |
| **Fırtınalı** (`storming`) | tornadoes in the open courtyard and the terrace add to puddles | keep out of puddles, move the pull |
| **Ağır Yara** (`grievous`) | below 90% HP stacks; Halkor's puddle chip and the Reaver strikes keep players low | heal above 90% between pulls |
| **Efsunlu Yarık** (`seasonal_efsun`, +10) | rift spots (section 3.7) at 20 / 40 / 60 / 80%, guardian kill window 45 s | kill the guardian at a spot that is away from the packs; 6 spots are all outside arenas |
| **Kibirli** (seasonal, CORE_MECHANICS §6; CM7) | **Kibir Tecessümü** (elite, 4x trash HP) appears every 20% forces; the marks fall at pulls 4, 7, 10a and 12 (section 6.1); killing it gives +10% damage and +10% move speed for 60 s | engage it where it spawns when the area is clear; it rises from one of four fixed sinstone cracks (`kibirSpots`, section 6.5) |

### 6.5 Kibirli and rift spots

Two lists exist in `extras` (section 3.7):

* **`riftSpots`** (6 spots, Efsunlu Yarık): the engine rule of `Affixes.pickRiftSpot` is *nearest unused spot at least 15 m from the party centroid, outside boss arenas, in a straight line*, with **no reachability test**. The revision-1 list failed it: from the west chamber the colonnade spot (15.5, 29.5) was nearer than the gallery spots but sits behind Halkor's locked `boss_exit` door; (12, 26) and (8, 13.5) sat 6 to 18 m from sleeping packs; (55.5, 18) sat behind Alyez's door. The new list is **(18, 44) gallery west, (44.5, 45.5) gallery east, (10, 31.5) colonnade west, (6.5, 25.5) courtyard south-west, (27, 11.2) crypt gate (top of S8), (56, 21.4) grand stair head**, tuned so the four canonical marks below each pick the intended spot.
* **`kibirSpots`** (4 spots, Kibirli, NEW P14): spot `i` is used by mark `i + 1`; if the field is missing the handler falls back to the nearest `riftSpots` entry. It is equal to the first four tuned `riftSpots` picks, so both rules agree for the canonical party positions and the explicit list protects the other positions.

**Canonical simulation (the P21 rule 6 check, run by `tools/content-check.mjs` and re-run here with `layout.mjs`):**

| mark | forces | where the party fights (pull, centroid tile) | spot picked (`kibirSpots[i]`) | distance to the party | nearest live non-optional pack | reachable without a locked door |
|---|---|---|---|---|---|---|
| #1 Kibir | 76 | pull 4, west chamber, (11, 42) | **(18, 44)** gallery west | 29.1 m | `w_p07` 32.6 m (same chamber, already pulled with it) | yes: door (16, 43) is open |
| #2 Kibir | 152 | pull 7, colonnade, (19, 31) | **(10, 31.5)** colonnade west | 36.1 m | `c_p14` 31.0 m (behind the courtyard wall, another room) | yes: same room |
| #3 Kibir | 228 | pull 10a, courtyard NW, (6, 18.5) | **(6.5, 25.5)** courtyard south-west | 28.1 m | `c_p17` 26.9 m (the dormant statue pack, wake radius 7 m, safe) | yes: same room |
| #4 Kibir | 304 | pull 12, the bridge branch, (26.8, 6.9) | **(27, 11.2)** crypt gate, top of S8 | 17.2 m | `a_p23` (the pack being fought); the optional `o_p31` at 13.6 m is alive on route A, but the elite aggros the party on spawn and leaves | yes: the crypt branch is open |

Nothing is closer than these four in a straight line for any of the four canonical positions (checked with the nearest rule over the six `riftSpots`, each used spot removed). Presentation: a **sinstone crack** at the spot (the Kibir Tecessümü rises out of a floor ring of red cracks, `death_bones` tinted `0x1d1826` reversed + a crimson `shadow_burst`), banner "Bir Kibir Tecessümü yükseldi!", model `kef_gargon` x2.0 tinted `0xc8382f` as the stand-in. Mark #4 happens on the bridge: kill the elite on the branch or on the span; it has no knockback and no charge that pushes a player (a `Gargon` stand-in pounce moves only itself).

### 6.6 Font of Power and shrines

* **Kehanet Taşı** (`gp('font_of_power')`) at **(31.5, 56.4)**, 2.6 tiles north of the start (31.5, 59), with a faint rune ring (`sinRune` r 1.0). In M+ the key owner interacts, the party is asked (online ready check 15 s), enemies spawn deterministically, the 10 s countdown runs and a barrier sits on the **narthex door (tile 31, 54)** until `mplus_start` (`scenes/StartBarrier.ts`). M0 and Heroic have no pedestal.
* **Rüzgar Sunağı** (`shrine_haste`, +25% move and attack speed, 30 s) at **(22, 17)** in the courtyard's north-east corner: pre-pop for the courtyard mega-pull (pull 10) after pull 9 and run to `c_p18` at (6, 18.5). It is skipped on route B.
* **Kudret Sunağı** (`shrine_power`, +25% damage, 30 s) at **(49.5, 21.4)**, the top-left corner of the grand stair beside the Kamarar door (52, 21), at floor 13.9: click it after pull 16, walk 3 tiles and pull Velkaan with about 25 s left, so the buff covers the first Chorus window.
* Shrines use `kg('altar-stone')` x3 with a floating `gp('crystal_blue')` (haste) or `gp('crystal_purple')` (power), light colour matching the type, distance 6, as in GDD_CONTENT §1.4.

### 6.7 Chest and exit

After Velkaan dies the exit portal (`gp('mplus_portal')`) appears at (55.5, 35.5) with the end-of-run chest `gp('chest_epic')` at (58, 35.5) (M+), `chest_gold` for M0 (GDD_CONTENT §4 shared rules). Fixed chests in the dungeon (`chest_wood` at (28.2, 52.8), `chest_gold` at (55.6, 49.2) in the Archive) give gold and a Can Küresi in M+ and a normal drop on M0.

---



## 7. Entrance

**Zone:** **Kadim Diyar** (`kadim_diyar`, roadmap map 3, levels 45 to 60, GDD_OPENWORLD §1). Entrances are spread across the world, not in one hub: this one belongs to the east third of Kadim Diyar. The Kuzgunkale Kadim Kapılar Salonu portal keeps working for keys (GDD_CONTENT §5.3).

**Region and terrain:** `kd_kefaret_tepesi` **Kefaret Tepesi**, a bare crimson-heather hill about 200 m east of the Kadim Kale citadel (north-centre of the map). Terrain type **graveyard hill moor**: heather and dry grass with dark cobbled terraces, a cobbled switchback road of 5 hairpins climbing 40 m, fenced tomb beds on every terrace, dead trees, ravens, one distant bell tower; the cathedral is visible from the foot of the hill. The map has not been designed yet, so `pos` stays `TBD` until the Kadim Diyar layout doc exists; constraints: east third of the map, on the highest terrace of the hill, 6 m of clear ground in front of the stair, a waypoint stone 12 m south of the stair.

**`EntranceDef` (proposed).**

```ts
const ENT_KEFARET: EntranceDef = { id: 'ent_kefaret_salonlari', name: 'Kefaret Salonları Girişi', dungeonId: 'kefaret_salonlari', pos: [0, 0] /* TBD tile in kd_kefaret_tepesi */, facing: 0,
  minLevel: 60, regionId: 'kd_kefaret_tepesi', look: 'cathedral' /* NEW look, P10 */ };
```

Before level 60 the door shows the hint "Salonların kapısı mühürlü. Seviye 60'a ulaş." and opens the Mitik / Mitik+ panel only afterwards (same Portal interactable and difficulty panel as GDD_OPENWORLD §5.2; this dungeon offers only Mitik 0 and Mitik+).

**Region atmosphere (`RegionTheme`).**

```ts
const KEFARET_TEPESI_THEME: RegionTheme = { fogColor: 0x2a1c2a, fogNear: 40, fogFar: 130, hemiSky: 0x7a6a90, hemiGround: 0x2a1418, hemiIntensity: 0.7,
  sunColor: 0xc08070, sunIntensity: 0.55, skyZenith: 0x1a1226, skyHorizon: 0x6a2a34,
  skyImage: '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-20.jpg',     // overcast, tinted by the crimson horizon
  groundTex: { grass: texUrl('tt1-grass-12'), dirt: texUrl('tt2-dirt-07'), cobble: texUrl('tt2-stone-14'), dark: texUrl('tt2-tile-05') },   // dark purple-red set, same pack as Kara Anıt
  music: 'world_ruins', ambientVfx: 'ambient_embers', ambientColor: 0xc8382f };
```

**The grand gate (WoW-style, matching the cathedral).** Reference: `docs/ref/ui/wow-dungeon-entrance.webp` (tall pillars with gold trim and glowing lanterns, a red crystal emblem on top, a swirling portal door, wide curved stairs, two braziers at the foot, a meeting point). Our version, local metres relative to the door centre, +z toward the player:

| element | asset | placement |
|---|---|---|
| gate frame | NEW `kefaret_gate_frame` (14 x 12 x 4 m: pointed arch, flanking pillars with gold trim and crimson lanterns, red crystal on the apex) | (0, 0, 0) facing the player |
| door (portal) | `gp('mplus_portal')` x1.25 tinted `0xc8382f`, light crimson 3.2 / 15 m | inside the frame (0, 0, 0.3); this is the `Portal` interactable |
| stair | `ip('psx-dungeon','stairs_ultrawide')` x3 side by side (12 m deep, 2 m rise) rotated so the high side meets the door, flanked by `kc('stairs-stone-square')` x3 (scale 3.5) at (+/-8, 0, 4) for the curved fan | x -4, 0, 4 at z 6 |
| braziers | `gp('brazier')` x2 scale 1.4, crimson light `lt(0xc8382f, 2.2, 11)` | (+/-6, 0, 13): the meeting point |
| lamp posts | `gp('lamp_post')` x2 scale 1.6 gold | (+/-8, 0, 5) |
| gargoyles | NEW `gargoyle_statue` x2 on 3 m plinths, x2 on the frame | (+/-9, 0, 2) and (+/-6.5, 11.5, 0) |
| crows | `ip('nocturnal-watch','crow')` x4 | on lamp posts and frame |
| backdrop | `ip('nocturnal-watch','church')` x2.4 tinted `0x3a3040` behind the frame, `tower` x0.9 x2 | church (0, 0, -14), towers (+/-16, 0, -10) |
| garden | `kg('iron-fence')` x8 scale 4 + `halloween/fence_gate`, `kg('gravestone-*')` x10 scale 3 on the flanks, `hw('tree_dead_large')` x4 | the terrace edges |
| waypoint | `gp('waypoint_stone')` | (0, 0, 24), region "Kefaret Tepesi" |

After a run the party returns to the entrance and spawns 6 m in front of the stair (GDD_OPENWORLD §5.2).


---



## 8. Implementation packages (Haiku) and shared NEW primitives

Working rules (memory: review policy, low CPU testing): at most 5 agents at once, no per-agent browser tests, after each Haiku block a Sonnet reviews the diff and the orchestrator spot-checks before a Haiku fixes, and **one** Haiku QA pass at the very end. All packages use the pure-data validators already in the repo (`tools/content-check.mjs`, `src/dev/contentCheck.ts`) instead of the browser.

### 8.1 Shared NEW primitives (build once for all 8 Season 1 dungeons)

Everything below is shared infrastructure: the other seven dungeon docs reference the same ids (P17 to P21 are new in this revision and are required by CORE_MECHANICS §13, §15, §16 for every season dungeon). "Used here" shows how Kefaret Salonları consumes it. If a primitive is late, the fallback in the last column keeps this dungeon buildable (flat, without the feature).

| id | primitive | spec | files | used here | fallback |
|---|---|---|---|---|---|
| **P1** | **Season pool registry** | `DungeonDef.season?: number` (1 = Season 1 pool). `data/dungeons/index.ts` exports `LEVELLING_DUNGEON_IDS` (the existing 4: Kemik, Kızıl, Buzul, Gölge) and `MPLUS_POOL` (8 ids). `MythicPlus.pickKeyDungeon`, `grantKeystone`, `weeklyMaintenance`, the keystone UI list, the Group Finder M+ tab and the leaderboard boards read `MPLUS_POOL`; `DUNGEON_IDS` keeps its meaning for levelling progression. A dungeon with `season` offers only Mitik 0 and Mitik+. | `types/dungeons.ts`, `data/dungeons/index.ts`, `systems/MythicPlus.ts` (`pickKeyDungeon` ~548), `ui/*` key lists | `season: 1`, `levelRange [60, 60]` | register in `DUNGEONS` and temporarily widen `DUNGEON_IDS` |
| **P2** | **Dormant statue** | `PackDef.dormant.kind` gains `'statue'`. A dormant statue enemy is drawn stone-tinted (`0x8a8898`) and frozen on frame 0 of `Idle`, wakes as a whole pack at `wakeRadius` (PackWatch), on wake: the tint blends back over 0.4 s, `death_bones` burst tinted grey, camera shake 0.08, SFX `rubble`. | `types/dungeons.ts`, `scenes/PackWatch.ts`, `entities/Enemy.ts` (dormant pose, ~533), `render` tint | packs `k_p03`, `c_p17` | `kind: 'bones'` (wrong visual) |
| **P3** | **Boss awakening** | `BossPlacement.awaken?: { enemyId: string; count: number }`. The boss spawns dormant: invulnerable, untargetable, no aggro, shows `dormantModel` (a prop id to hide on awake). When `count` enemies of `enemyId` die (host counts), emit `boss:awaken`, run `BossScript.onAwaken?(c)` (rise animation, shake, `boss_spawn`), then normal engage rules. Also usable for "kill the three attendants to summon the boss" in other dungeons. | `types/dungeons.ts`, `scenes/DungeonScene.ts`, `ai/BossController.ts`, `ai/bosses/types.ts` | Halkor (3 `kef_shard`) | script fallback in section 3.5 M1 (`setImmune` + `freeze` + death count in `update`) |
| **P4** | **Interact pull (click door) with a colliding gate prop** | `BossPlacement.pull?: 'aggro' \| 'interact'` and `pullProp?: string`; `DoorDef.model?: false` (the builder skips the door model; the prop is the door); `PropPlacement.collide: true` on the gate prop blocks its nav cells (the two cells of the opening are marked blocked at build time and registered with the prop's `PropHandle`). With `interact`, the boss does not aggro by proximity; interacting with the tagged prop (`tag: 'gate'`, id = `pullProp`) emits `boss:pull`; the host (1) plays the prop's `open` animation, (2) unblocks its nav cells like a breakable `PropHandle`, (3) `BossController.acquire(nearest player)`, (4) after 3 s plays `close` and blocks the cells again (the `boss_lock` behaviour carried by the prop). **Reset:** on a wipe the prop is closed, the cells blocked and `setInteractable(true)`; on the kill it opens and stays open. Behaviour table in section 3.5 M4. | `types/dungeons.ts`, `scenes/PropGameplay.ts`, `scenes/DungeonScene.ts`, `world/DungeonBuilder.ts` (`PropHandle.setOpen / setInteractable`, nav cells) | Ekelon (`ekelon_door`) | normal 12 m aggro, door prop is decor |
| **P5** | **Boss kit v2** (one package, all in `ai/bosses/kit.ts` unless noted) | **Revision-1 functions:** `rotatingBeams(c, { x, z, n, length, width, speed, duration, coef, reverseAt?, type?, tick? })` + `updateRotatingBeams(c, h, dt)` (extract `ignaroth_flame_walls` from `dokumhane.ts`); `blockableBeam(c, from, to, { width, duration, tick, coef, onUnblocked?(i) })`; `soak(c, { x, z, r, need, delay, coef, onFail?, onSuccess? })` (formalises `zakhar_seals`); `markBurst(c, p, { fuse, radius, coef, status? })`; `intermission(c, { immune, teleport?, steps: { t, fn }[], onEnd })`; `fixateAdd(c, { defId, tag, target?, speed, tick, growth })` + `updateFixates(c, dt)`; `safeZone(c, x, z, r, tag)`; `regenAdd(c, tag, { delay, defId })` + `crush(c, x, z, r)`; `arenaLeash(c, centre, r, status, interval)` (ignores players on a stair strip); `dotRing(c, p, { r, coef, interval, duration })`; **`isTank(p)` fix** (`Player.classId === 'knight'` is wrong for the 6 tank specs: `monk_brewmaster`, `paladin_protection`, `necromancer_bone`, `demonhunter_vengeance`, `knight_protector`, `barbarian_warlord`). **New in revision 2 (Elden-Ring layer, section 5.0):** **`swingString(c, hits: { at, shape, coef, perilous? }[], opts)`** schedules a 2 to 3 hit chain with per-hit re-aim and a locked, delayed last hit; **`punish(c, mult, sec, text?)`** wraps `c.vulnerable` with a gold "CEZA!" tick and registers the recovery; **`ringWaves(c, { x, z, radii, width, gap, coef })`** expanding or sequential concentric damage bands; **`grabSlam(c, target, { range, hold, slamCoef })`** line trace with line of sight against colliders, pull, hold and slam; **`onPoiseBreak(c, cb)`** subscribes the script to `poise:break` of its own boss (the event exists in `Combat.ts`). | `ai/bosses/kit.ts`, `ai/bosses/dokumhane.ts` (refactor to use the shared function), `ai/BossController.ts` (small hooks) | all four bosses | write the mechanics inline in `kefaret_b12.ts` / `kefaret_b34.ts` (the existing scripts do this) |
| **P6** | **Statuses** | `petrify` (hard CC, `cc: true`, `dispellable: true`, `vfx: 'stun_stars'`, icon `debuff-stun`), `mortal_wound` (`dispellable: false`, rule `healMult: 0.5`, icon `debuff-bleed`), `kefaret_brand` (stacking damage-taken debuff on tanks: `stack: 'stack'`, `maxStacks: 5`, `takenMore: 0.08` per stack, 10 s, `dispellable: false`; verify in `Combat` that `takenMore` is applied per stack, else use 0.4 flat at 5 stacks), **`sin_mark`** (debuff, `dispellable: true`, `vfx: 'curse_loop'`, 3 s: a dispel cancels the pending burst; icon `debuff-curse`), **`sin_amplified`** (debuff, `dispellable: false`, 6 s, `takenMore` +0.30 and `healReceivedPct` +0.30, stacks `strongest` per source so two Sigars give +0.60; icon `debuff-curse`), **`grabbed`** (hard CC 1.0 s, not dispellable, used by `grabSlam`). `shield`, `haste`, `curse`, `slow`, `silence`, `fear` already exist. Add the ids to the `StatusId` union and `STATUS_RULES`. All reusable by the other dungeons. | `types/skills.ts`, `data/statuses.ts`, `data/statuses_talents.ts` | Reaver, Darkblade, Ekelon, Obliterator, Sigar, Alyez | use `stun` (hard CC, not dispellable) for petrify, `curse` for the others |
| **P7** | **Enemy kit module, trash script registry** (circular-import fix) | **New `src/data/enemyKit.ts` OWNS the builders and the registries**: it contains (moved out of `data/enemies.ts`) `add`, `def`, `cone`, `proj`, `aoe`, `line`, `charge`, `buff`, `heal`, `passive`, `onDeath`, `MECH`, `NOOP`, `bleed`, `custom`, `bp`, `boss`, the `CHAR` / `MON` / `GEN` / `GENB` / `SKEL` helpers, the `A_*` animation sets, the hide lists, the resist tables, the `Ab` type, **and the `ENEMIES` / `BOSSES` registries**. `data/enemies.ts` imports them from `./enemyKit` and re-exports `ENEMIES` and `BOSSES` unchanged. Per-dungeon files (`src/data/enemies_kefaret.ts`, one per dungeon, **a sibling of `enemies.ts`, not a directory of the same name**) import **only from `./enemyKit`, never from `./enemies`**; `data/enemies.ts` (or `data/index.ts`) imports them for their side effects after the kit. No import cycle exists, so every builder is initialised when a dungeon file runs. `Spec` and `def()` gain pass-through for `poise`, `poiseRegen`, `poiseDelay`, `hyperArmor`, `stanceBreakable`, `family`. `src/ai/trash/index.ts` merges per-dungeon tables (`TRASH_CUSTOM`, `TRASH_PASSIVES`) into `CUSTOM` and the passive table of `ai/abilities.ts` so dungeon packages never edit `abilities.ts`. `EnemyAiHints.fleeBelowHp?: number` and `pullOnFlee?: boolean` for skittish enemies. | new `data/enemyKit.ts`, `data/enemies.ts` (becomes a thin importer), `ai/abilities.ts`, new `ai/trash/*`, `types/enemies.ts` | `kef_toplayici_siphon` (alias of `crypt_wraith_drain`), `kef_obliterator_mark`, `kef_sigar_communion`, `kef_sigar_display`, `kef_shard_thrash`, `kef_shard_quake`, `kef_bahcivan_skittish` | do the move in one commit first (pure refactor, no data change), then the dungeon files |
| **P8** | **PROC bodies** | `ai/procModels.ts` builders (flat-shaded lambert, PSX patch, few segments, animated by tweens like `phylactery`): `sinstone_shard` (cluster of 3 black slabs on a base, crimson emissive seams pulsing, height 3.6), `sinstone_statue` (robed 6 m giant, hands over the face, eyes glow `fx`), `parishioner` (translucent robed ghost 2.2 m, gold eyes, additive halo). | `ai/procModels.ts` | `kef_shard`, `kef_heykel`, `kef_cemaat` | `proc_rift` / `proc_phylactery` re-tinted |
| **P9** | **Light shaft prop** | `PropPlacement.tag: 'lightshaft'`: an additive translucent cone/box (3 x 8 x 3 m default, `tint` colour, `opacity` 0.12 to 0.25) that fades with fog and drifts `ambient_dust` motes inside it; no real light. | `world/DungeonBuilder.ts`, `world/Decor.ts`, `world/Glow.ts` | gallery, colonnade, nave, hall, rotunda oculus | omit |
| **P10** | **Entrance recipes** | `EntranceDef.look` widened to `string`; new `src/data/world/entrances.ts` exports `ENTRANCE_RECIPES: Record<string, (e: EntranceDef) => TownProp[]>`; `WorldDecor` instantiates the recipe in local metres around the door and the `Portal` interactable. Each of the 8 dungeons registers its own `look`. | `types/dungeons.ts`, `data/world/*`, `world/WorldDecor.ts` | `look: 'cathedral'` (section 7 table) | reuse `look: 'temple'` and the generic door |
| **P11** | **Ceiling height** (CORE_MECHANICS §13, replaces the revision-1 `wallScale`) | `RoomDef.ceiling?: number` (m; default 6, halls 12 to 30, `0` = open air with the sky backdrop): the builder stacks or scales wall pieces, pillars, arches and banners to reach it (collision unchanged), draws a ribbed ceiling or none, and the camera zoom limit follows it. | `world/DungeonBuilder.ts`, `types/dungeons.ts`, `scenes/CameraRig.ts` | every room (section 3.2) | omit (6 m walls) |
| **P12** | **Theme moon** | `DungeonTheme.moon?: { color: number; intensity: number; dir?: [number, number, number] }` applied to `BuiltDungeon.lighting.moon`. | `types/dungeons.ts`, `scenes/DungeonScene.ts` | `{ color: 0x7f8cc8, intensity: 0.5 }` | builder default |
| **P13** | **Loot and uniques** | `LOOT_TABLES` rows `loot_kef_b1..b4` with the new `named?: string[]` and `namedChance?: number` fields (section 5.5), the **twelve** `UniqueDef` entries, `special` ids `leg_kef_*` implemented through `G.character.hasSpecial` in combat procs (`combat/procActions.ts`: puddle on crit, stone-skin stacks, fracture on poise break, landing shockwave after a dash, backstab guard, dispel shield, interrupt buff, ring charge, ground ring, harvest marks, elite mantle), optional set `set_kefaret`. | `data/loot.ts`, `types/items.ts`, `data/uniques.ts`, `combat/procActions.ts` | all bosses | generic loot only |
| **P14** | **Kibirli seasonal affix** (CM7) | `kibirli` affix def + `Affixes` handler: at forces crossing 20 / 40 / 60 / 80% spawn `kibir_tecessumu` (elite, 4 x trash HP, 0 forces, CC-immune). **Spot choice:** `DungeonDef.extras.kibirSpots?: Vec2[]` (index = mark number - 1) is read first; without it the handler falls back to the nearest `extras.riftSpots` entry at least 15 m away (the Efsun rule, straight line). Kill within 60 s of rising grants +10% damage and +10% move speed for 60 s. | `data/mythicAffixes.ts`, `systems/Affixes.ts`, `types/dungeons.ts` | all pulls | none (affix is off until CM7 lands) |
| **P15** | **Boss-script prop control** | `c.prop(id)`: `{ setOpen(on), setGlow(color \| 0), setVisible(on), swing() }` over `BuiltDungeon.propById` (exists) replicated with `bossMsg('prop', ...)` so every peer shows the vessel lid, statue visibility and the awakening mound. | `ai/BossController.ts`, `ai/bossNet.ts`, `world/DungeonBuilder.ts` (`PropHandle`) | vessels, statues, mound, door | cosmetic only: use VFX rings instead |
| **P16** | **Per-dungeon music and ambience** (optional) | `MUSIC_IDS += 'dungeon_kefaret'` (mapped to `dungeon_dark_shrine_loop.ogg` until a gothic organ track exists) and an `audio-events.json` entry `bell_toll` (the 5 `world/bell_heavy_*.ogg` files). | `types/audio.ts`, `public/assets/audio/audio-events.json` | theme music, Bell of Rebuke | `dungeon_shadow` |
| **P17** | **Heightfield** (CORE_MECHANICS §13; shared by all 8 dungeons) | `RoomDef.floorY?: number` (m, default 0), `RoomDef.stairs?: StairDef[]` with `StairDef { id, rect: TileRect, up: 'n' \| 's' \| 'e' \| 'w', y0, y1 }` (linear interpolation along `up`, `y0` at the low end), kit helper `stair(id, x, z, w, h, up, y0, y1)`. `ZoneDef` kind `void` with `fall: true` (a player entering a void tile takes 25% max HP and respawns at the last safe tile; enemies never path into it and are clamped when knocked back) and the existing `pit` for blocked drops. **NavGrid** stores the height per tile and refuses a step above 0.45 m except inside a strip; **`World.groundY(x, z)`** samples floor and strips so players, enemies, loot, projectiles, props and VFX stand on it (props snap to `groundY`); **combat height rule:** melee and hit shapes ignore height differences up to 2.5 m, larger ones miss, ranged needs line of sight; the builder draws stair strips as flights of steps (0.2 m risers, floor texture) and the camera follows. No overlapping floors. Lifts are a later extension of the same field (not needed here). | `types/dungeons.ts`, `world/DungeonBuilder.ts`, `world/NavGrid.ts`, `world/World.ts` (`groundY`), `combat/Combat.ts` (height check in hit shapes), `entities/*` | all 18 rooms (9 strips, 7 levels, 1 void bridge) | flat dungeon: every `floorY` is read as 0, stairs are ignored, the bridge becomes a pit zone with a floor (all gameplay unchanged) |
| **P18** | **Strike strings** (multi-hit enemy attacks) | `EnemyAbility.params.hits` (2 or 3) with per-hit `c2`, `w2`, `hold2`, `c3`, `w3`, `hold3` (coefficient, R-W windup, extra delayed hold) and optional `r2`, `arc2`, `kb2` (reach, arc and knockback of hit 2): hit 1 resolves as today; each following hit starts 0.1 s after the previous impact, re-aims to the target, draws its own telegraph and resolves its own damage; a poise break during hits 1 or 2 aborts the string (the existing `abortBusy`), a `perilous` last hit cannot be aborted. | `ai/EnemyAI.ts` (ability resolution, around the `impact` scheduling at ~1329), `types/enemies.ts` | Darkblade Çifte Kesik, Slasher Kıyma, Groundskeeper Kürek Savurma | single-hit version with the summed coefficient |
| **P19** | **Decor kit: upper galleries, chandeliers, banners** | `data/dungeons/kit.ts` helpers: `balcony(rectTiles, y, n, opts)` (non-walkable `choir_balcony` + `gothic_balustrade` modules with optional statues and hanging banners), `hangChandelier(x, z, y, scale, light)` (chain + chandelier prop, light merged into one), `bannerRow(...)`, `skylinePack(...)` (tower / church silhouettes outside the grid). All emit `PropPlacement` with `collide: false` and respect the 14-light cap. | `data/dungeons/kit.ts`, `world/Decor.ts` | sheets of section 3.8 | place the props by hand |
| **P20** | **Positional ambience emitters** | `PropPlacement.sfx?: { id: string; loop?: boolean; radius: number; volume: number; every?: [number, number] }` and `RoomDef.ambience?: { id: string; volume: number }`: positional loops and random one-shots (bell toll, chain creak, fire crackle, ghost whispers, wind) using the files listed in section 3.8, pooled and distance-culled. | `types/dungeons.ts`, `world/Decor.ts`, `audio/*` | every sheet of section 3.8 | room-global loops only (`dungeon_ambience_dark.ogg`) |
| **P21** | **contentCheck v2 rules** | Pure-data rules in `tools/content-check.mjs` / `src/dev/contentCheck.ts`: (1) **height continuity**: every door joins two floors of equal height at both ends of its span, via a stair strip; (2) **stair slope** at most 1.2 m per tile and every strip inside its room; (3) no pack member on a `void` tile, none outside its room; (4) **doorSpans**: no colliding prop inside any door span (tile span +/- 0.5) and none on a stair head; (5) no prop on a blocked or void zone; (6) **Kibir / rift simulation**: for the canonical party positions of the doc (the table of section 6.5, stored as `extras.kibirCanon: Vec2[]` for contentCheck only), each mark picks its `kibirSpots[i]`, the nearest-rule result over `riftSpots` is the same spot, the spot is at least 15 m from the party, outside every boss arena, reachable through the door graph without crossing a locked `boss_lock` / `boss_exit` door and at least 24 m from any live non-optional pack at that moment; (7) forces sums; (8) every model url exists; (9) light cap 14 per room. | `tools/content-check.mjs`, `src/dev/contentCheck.ts` | KEF-1, KEF-2, KEF-10 | manual review |

### 8.2 Packages for Haiku

| # | package | files | depends on | acceptance (validators, no browser) |
|---|---|---|---|---|
| KEF-1 | **Data file**: `ROOMS`, `DOORS`, `PACKS`, `PACK_EXTRA`, `BOSSES` (with `awaken` / `pull`), `THEME`, `ROOM_EXTRA` (floorY, ceiling, stairs, void zones), `EXTRAS` (`riftSpots`, `kibirSpots`), `KEFARET_SALONLARI`, register in `data/dungeons/index.ts` and `MPLUS_POOL` (sections 3.6 and 3.7, paste as is) | `src/data/dungeons/kefaret_salonlari.ts`, `src/data/dungeons/index.ts` | P1, P2, P17 (P3, P4 types) | `tools/content-check.mjs` passes: 18 rooms, 18 doors, 9 strips, 34 packs, forces sums **493 / 393 / 76 / 24**, every door tile on a shared edge, **P21 rules 1 to 3 and 6** (height continuity, slope, void, Kibir simulation) |
| KEF-2 | **Decor script**: the `D.room(...)` calls per the sheets of section 3.8 and the shared helpers `candles`, `shrine`, `sinRune`, `runner`, `balcony`, `hangChandelier`; prop ids `ekelon_door`, `vessel_1..4`, `statue_1..4`, `halkor_mound`, `bell`, `bridge` | same file (or `kefaret_decor.ts` imported by it) | KEF-8 (assets), P9, P11, P15, P19, P20 | contentCheck: all model urls exist in `public/assets/models` (or in the NEW list), no prop on a blocked or void zone, **doorSpans check (P21 rule 4: no colliding prop inside a door span: e.g. the gallery tombs stay off x 31 to 33 and x 42 to 44)**, 12 tombs, light cap 14 |
| KEF-3 | **Enemy defs**: 13 trash, `kef_shard`, `kef_heykel`, `kef_cemaat`, `kef_taskoz` (section 4.4) and the 4 `BossDef`s (section 5) | `src/data/enemies_kefaret.ts` (new, **imports only `./enemyKit`**; `data/enemies.ts` imports it after the kit), `data/statuses.ts` | P6, P7, P8, P18 | `tools/verify-monsters.mjs`, `contentCheck` (every pack member id exists, every boss id exists, ability ids unique, every attacking trash def has 2 to 4 telegraphed attacks, every telegraphed windup equals the R-W formula within 0.05 s, every clip name exists on the rig or its `clipsFrom` file via `tools/glb-inspect.mjs`) |
| KEF-4 | **Trash scripts** (P7 tables): siphon alias, mark (`sin_mark` + dispel cancel), communion, display (amplified marks + burst), shard thrash and quake, skittish, string handlers if P18 is late | `src/ai/trash/kefaret.ts` | P7, KEF-3 | unit-style check through the existing dev enemy page data (no browser): handlers registered under every ability id with `kind: 'custom'` |
| KEF-5 | **Boss scripts 1 and 2**: Halkor, Ekelon (`halkor_*`, `ekelon_*`, ER moves) + `KEFARET_SPAWNS` | `src/ai/bosses/kefaret_b12.ts` | P5, P3, P4, KEF-3 | every ability id of the `BossDef` has a handler or is a generic ability; `BOSS_SCRIPTS` and `BOSS_SPAWNS` merged in `ai/bosses/index.ts` |
| KEF-6 | **Boss scripts 3 and 4**: Alyez (vessel minimum-open rule, grab), Velkaan (`velkaan_*`, ER moves) | `src/ai/bosses/kefaret_b34.ts` | P5, P8, P15, KEF-3 | same as KEF-5; Alyez: a unit check that `closedCount()` never exceeds 2 in the vessel state machine |
| KEF-7 | **Loot**: 4 tables with `named`, 12 uniques, optional set (P13) | `data/loot.ts`, `data/uniques.ts`, `combat/procActions.ts` | P13 | `contentCheck` loot ids resolve; unique base ids exist; every named id exists; every unique's `special.id` has a handler |
| KEF-8 | **Assets**: the 13 NEW props of section 2.9 (+ optional ring decal) and 2 NEW bosses (`halkor`, `velkaan`) with `build_props.py --only ...` and `gen_bosses.py`, manifests, previews, `docs/assets/generated-props.md` and `generated-bosses.md` updated | `tools/blender/props/props_dungeon.py` / `props_special.py`, `tools/blender/bosses/boss_halkor.py`, `boss_velkaan.py`, `public/assets/models/gen/...` | none | `node tools/glb-inspect.mjs public/assets/models/gen/props --short`: sizes match the table, tris under budget (props under 1500, bosses under 1300), nodes `glow`, `light_0`, `lid_open`, `fx_beam` present |
| KEF-9 | **Entrance**: `look: 'cathedral'` recipe, `EntranceDef`, region atmosphere, waypoint (needs the Kadim Diyar layout for `pos`) | `src/data/world/entrances.ts` (P10), `src/data/world/kadim_diyar*.ts` | P10, KEF-8 | `contentCheck` entrance in its region, min level 60 |
| KEF-10 | **M+ integration**: pool membership, `forcesRequired`, timer 1740, Kibirli spots (P14), SimBench hpMult check against the targets of section 5, `tools/pace-check.mjs` run for the route | `systems/MythicPlus.ts` hooks, `tools/pace-check.mjs` | P1, P14, KEF-1, KEF-3 | forces and timer sums reproduce section 6.1; SimBench TTK within 15% of the targets; P21 rule 6 |
| KEF-11 | **QA (one Haiku pass at the end, after every package merged)** | none | all | checklist: dungeon loads from the scene picker on Mitik 0 and M+, start barrier on the narthex door, **every stair strip walkable up and down by players and enemies, no one stuck on S2 / S4 / S6 / S7 / S9, bridge edge falls and respawns, enemies never in the void**, shards then Halkor awakens, three bosses gate in order, click door opens, closes after 3 s and re-arms after a wipe, route A reaches 103.4%, route B 103.7%, statues wake at 7 m, vessels seal and never fewer than two open, Chorus beams readable, posture break of each boss opens the punish window, named items drop and proc, exit portal and chest |

Suggested waves: **wave 1** (shared infra, one owner each): P7 (pure refactor first), P17, P5 (+ P18), P6, P1 to P4 and P8 to P16 split over two owners, P19 to P21 (at most 5 at once). **Wave 2:** KEF-3, KEF-4, KEF-7, KEF-8 in parallel. **Wave 3:** KEF-1, KEF-2, KEF-5, KEF-6, KEF-9. **Wave 4:** KEF-10, then KEF-11.

---

## 9. Open points, assumptions, deviations and rejected critique (read before implementing)

### 9.1 Open points and assumptions

* **Enemy numbers are first-pass.** HP / damage multipliers and boss `hpMult` follow the nearest existing enemies (skeleton warrior 2.6 for the Reaver, bone golem 6, final bosses 110 to 120) and the timer table of section 6.1 is built on fight-length targets; SimBench decides the final values. The R-W windups (0.70 s for a coef 1.0 swing instead of 0.45 s) make trash a little easier to dodge and slower to kill-race: SimBench decides whether trash `dmg` needs +5%.
* **Kadim Diyar does not exist yet** (GDD_OPENWORLD marks it "not designed"). The entrance `pos` is `TBD`; everything else about the entrance is specified.
* **`takenMore` per stack** for `kefaret_brand` must be checked in `Combat`; the spec carries a fallback.
* **Season pool wiring (P1)** changes `DUNGEON_IDS` semantics; the existing four dungeons must keep working as levelling dungeons with Normal / Kahramanlık. The M0 first-key rule ("random of the 4") becomes "random of `MPLUS_POOL`" once the pool is live.
* **Forces total is 129.7% available**, above the 122 to 126% guideline, because both optional rooms and the skip passage are included on purpose. If playtests find route A too tight at 103.4%, add 4 forces to `k_p01` (a fourth Darkblade) rather than adding a pack.
* **Heights are a design choice, not a WoW measurement**: the real Halls of Atonement is a climb but its exact elevations are not documented. The seven levels, the sunken Halkor rotunda and the Lament bridge are ours; if the engine's P17 ships with a different stair-slope limit, only the strip lengths in section 3.2a change.
* **Posture numbers** (700 / 600 / 500 / 750) are starting points: SimBench's fight profiles must include a "break the boss once per 25 s lock" line before the punish-window values (x1.15, 1.2 to 1.6 s) are final.
* **Poise on CC-immune trash**: a break gives the x1.25 / `marked_crit` window but no stun (`breakPoise` only stuns non-CC-immune enemies); the doc relies on the window, not on a stun, for the Reaver, Slasher and Sigar.
* **Interrupt on the Rahip** is HIGH: with two healers in a pull, a group without three kicks should split the pull; section 6.3 lists the packs.
* **Everything was authored from the reference file and general knowledge of Halls of Atonement.** Palette, layout and music are design proposals in that spirit (the reference doc marks the real palette and loading screen "thin"); where this doc and a future in-game screenshot disagree, the screenshot wins for palette and props, the doc wins for engine data.

### 9.2 Deliberate deviations from WoW (so reviewers do not read them as errors)

| # | deviation | WoW | ours | why |
|---|---|---|---|---|
| D1 | Ekelon intermission | none documented | **cut**; `ekelon_sky` is a normal, non-immune ER ability from 50% (no add spawn) | revision 1 invented an 11 s immune phase with 6 new fiends |
| D2 | Sigar's Güç Gösterisi | amplifies all damage and healing, spread before it expires | amplification (`sin_amplified`, +30% taken) **plus** a burst r 6 (coef 1.6) at expiry | ER-style spread check; the revision-1 3.2-coef burst and the "wipe at +10" claim are removed |
| D3 | Manifestation / Mark of Envy | part of the Sigar pack | **dropped** | keeps Sigar at 4 attacks and the packs readable; the slow / CC check is covered by Zincirli Kement and Taş Çığlığı |
| D4 | Mark of Obliteration | dispellable | dispellable `sin_mark` curse with a real cancel (P6) | dispel parity; the trash dispel duties are sin_mark, Ruh Lekesi (curse), Zincirli Kement (slow), Taşa Çevir (petrify), bleeds and the fear |
| D5 | Elden-Ring moves on all four bosses and the posture windows | none | 3 ER moves per boss, poise windows | binding user requirement (CORE_MECHANICS §16) |
| D6 | Healer trash (`kef_rahip`) and the extra trash attacks (flurry, snare, pounce, howl, stain, rush, whirl, leap, swing) | HoA trash has 1 to 3 abilities and no healer | 2 to 4 telegraphed attacks per type and one healer | binding user requirement (§16 role mix) |
| D7 | Alyez Yargı Saati and the vessel minimum-open rule | no phase 2 | kept from revision 1, now constrained to at most 2 closed vessels | revision 1 invention, softlock fixed |
| D8 | Heights, sunken rotunda, Lament bridge, timer 29:00 | WoW timer 32:00 in the thin source; elevations undocumented | invented | verticality requirement and the stair walking time |

### 9.3 Rejected critique

Everything in the critic's list was taken; these are the parts that were **not taken as written**:

* **Issue 1 (kef_shard dmg).** The factual claim "the extras do not override `dmg`" is not right: `MECH` spreads `...extra` last, so an explicit `dmg` wins (the revision-1 block simply never passed one). The fix is taken exactly (`dmg: 1.2`, the note about `ai: { stationary: true }` replacing `{ summoned: true }`, the "MECH entities need `dmg`" warning in section 4.4).
* **Issue 3 (rift spots).** The fix is taken in spirit but not with the suggested coordinates: the gallery spot is (18, 44) (not (22, 46.5)), the colonnade spot moved to (10, 31.5), a courtyard spot (6.5, 25.5) replaces the courtyard / stair-hall pair and mark #4 gets a crypt-gate spot (27, 11.2) instead of being "documented as queued behind Alyez"; a spot on the Lament bridge itself is impossible (a 6-tile room has nothing 15 m from the party). Instead of only a contentCheck simulation, **`extras.kibirSpots`** (P14) makes the choice explicit per mark, and the tuned `riftSpots` give the same answer under the nearest rule (verified by the P21 rule 6 simulation and by the layout script).
* **Issue 8 (fidelity).** "Make Ekelon's intermission clearly optional, or cut it": cut (D1), not made optional. "Keep or drop the Envy mechanic": dropped (D3).
* **Issue 7 (Alyez).** Both suggested measures were taken (at least 2 open vessels at every moment and the first p2 procession at 28 s); the "cap the second Parishioner" variant was replaced by "the second spawns only when at least 2 vessels are open" (same effect, no hard cap).
