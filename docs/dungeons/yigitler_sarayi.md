# Yiğitler Sarayı (`yigitler_sarayi`): Mythic+ dungeon design, modelled on Halls of Valor

Season 1 Mythic+ pool, dungeon 1 of 8. Level 60 endgame. The four levelling dungeons (Kemik Mahzeni, Kızıl Dökümhane, Buzul Tahtı, Gölge Tapınağı) stay as they are.
Author: dungeon designer / art director pass (docs only, no code edited). Non-commercial hobby project: staying very close to the WoW original is wanted.

**Sources used.** `docs/ref/dungeons/legion.md` (Halls of Valor section: sections, bosses, trash, M+ notes, thin spots), my own knowledge of the dungeon's look and fights, and the engine files (`src/types/dungeons.ts`, `src/world/DungeonBuilder.ts`, `src/data/dungeons/kit.ts`, `golge_tapinagi.ts`, `src/ai/bosses/*`, `src/data/enemies.ts`, `src/data/mythicAffixes.ts`, `docs/CORE_MECHANICS.md` §6, `docs/GDD_CONTENT.md` §0 and §5).

**Conventions used in this file**

* Ids are English/ASCII `snake_case`. Everything a player sees is Turkish. Prose here is English.
* Tile coordinates follow `GDD_CONTENT` §0.1: a continuous coordinate `c` maps to world `(c + 0.5) * 4` m, an integer is a tile centre, a room `rect x,z,w,h` spans `c = x - 0.5 .. x + w - 0.5`. `n` = -Z (up on the map), `s` = +Z. Facing 0 = looking south (+Z), 180 = north, -90 = west.
* "EXISTS" = already in the repo (file named). "NEW" = must be built; shared ones carry an `SP-x` id (section 8) so the other seven dungeons build them once.
* Two conflicts in the repo were resolved like this:
  1. M+ scaling. `docs/CORE_MECHANICS.md` §6 (normative) says HP and damage x1.08^(L-1) up to +10 (x2.0 at +10), x1.10 per level above. `src/data/mythicAffixes.ts` still holds the older GDD curve (HP x1.1^(L-1), x2.36 at +10). All timer math below uses the normative curve; if the code curve stays, add about 10% to boss and trash kill times at +10.
  2. Seasonal affix. `CORE_MECHANICS` §6 wants "Kibirli" (Prideful, a Kibir Tecessümü every 20% forces). The code still has `seasonal_efsun` (Efsunlu Yarık, needs `extras.riftSpots`). This file provides 6 rift spots so both work, and lists the Kibirli spawn thresholds in §6.
* **Height (revision).** `ARCHITECTURE.md` rule 7 (flat world) is superseded for the season dungeons by `CORE_MECHANICS` §13 (heightfield, stair strips, 0.45 m max step, hall ceilings 12 to 30 m): this dungeon has eleven floor heights between 0.0 and 9.8 m (§3.2, §3.6, shared primitive SP-10). There are still no lethal drops: parapets are solid, "cliffs" and "sky" are visual (SP-1).
* **Revision note.** This file was revised in place after a critic pass (pack spacing, interrupt counts, Heymdal's strips, music ids, Route B slack) and against the binding user requirements (verticality, at least 3 bosses with an Elden layer, 10 to 14 trash types, a room-by-room dressing sheet, named loot). The changes are listed at the end under "Rejected critique" (declined or modified suggestions) and in the final hand-over message.

---

## 1. Identity

| field | value |
|---|---|
| id | `yigitler_sarayi` |
| Turkish name / short | **Yiğitler Sarayı** / "Yiğitler" |
| WoW model | **Halls of Valor** (Legion, Stormheim: High Gate, Hearth of Revelry, Seat of Ascension, Fields of the Eternal Hunt, Hall of Glory, Ephemeral Way) |
| level / modes | level 60. Mitik 0 (first key source) and Mitik+ only. Kahramanlık may be enabled later as practice. |
| bosses | 4: Heymdal, Hirya, Fenrür (either order with Hirya), Skovald and Odyn (one two-stage finale) |
| M+ timer | **32:00 (1920 s)**. +3 at <= 19:12, +2 at <= 25:36, +1 at <= 32:00. A par 5-man group at +10 finishes in about **25:13** (78.8%). |
| enemy forces | **325 required**, 430 available (132%): 343 on the full main route, 31 in the skip corridor, 56 in optional rooms. Route A needs no optional pack (343, 105.5%, 18 of slack). Route B needs the Mead Cellar (337, 103.7%, 12 of slack). |
| grid | 64 x 60 tiles (256 x 240 m), 16 rooms, 11 floor heights (0.0 to 9.8 m, §3.6) |
| enemies | 31 packs, 123 mobs, **13 trash defs**, 4 bosses (each with a posture bar and an Elden-style string) plus encounter adds |
| shrines / font | Kehanet Taşı (Font of Power) in the start room. 3 shrines (haste, ward, power), 3 chests, 6 rift spots (§6). |
| entrance | Gök Merdiveni Kapısı, Kadim Diyar, Fırtına Zirveleri highlands (§7) |
| music | existing id `dungeon_frost` (file `dungeon_cold_sanctuary.mp3`), every boss on the existing id `boss`; per-boss tracks and a `dungeon_valor` id are optional SP-9 polish (§2.9) |

**Lore (Turkish, goes into `DungeonDef.lore`):**
> Kadimler, ölen yiğitlerin ruhlarını sınamak için fırtınanın üstüne bir saray kaldırdı: Yiğitler Sarayı. Titan kemerleri bulutların üzerinde yüzüyor, Odyn'in ebedi şölenine açılıyor. Yüksek Kapı'da Heymdal'ın borusu çalıyor; Eyra'nın Seçilmişi Hirya yükseliş koltuğunu bekliyor; Fenrür Sonsuz Av'da kan kokusu alıyor. Ama Gelgitkıran Kralı Skovald, Kadim Zindanlar'ın gölgesinden gelen bir fısıltıya kulak verdi ve kutsal Aegis'i çalmak için Şan Salonu'na daldı. Sınav başladı. Layık olan, Odyn'in sofrasına oturur.

**Fantasy in one paragraph.** A Titan-built ring of gold-trimmed stone hangs above a sea of storm clouds. Norse-flavoured vrykul champions, the *Yiğitler* (WoW: Valarjar), have made it their hall: iron gatekeepers and horn-blowers on the High Gate, a roaring mead hall full of revellers, valkyr statues and a chamber with two crackling mystic pillars, a golden autumn meadow where bears and worgs hunt for ever, a causeway of floating rune slabs, and at the end a colossal round hall where the titan-keeper Odyn judges every visitor. You fight your way up through lightning, mead smoke and gold light. Nothing is underground: the sky is always above you.

**Lore hook into Kadim Zindanlar.** The Kadim Zindanlar are the sealed trial-chambers the Kadimler (the Ancients) built across the world. Yiğitler Sarayı is the "sky floor" of that network. The storm above it is the *Efsun Fırtınası* that feeds the Kadim Anahtar Taşı: every keystone is a splinter of this storm, which is why the Kehanet Taşı (Font of Power) in the entrance chamber answers to Odyn's lightning and why the affix weather of a key (Fırtınalı, Efsunlu Yarık, Kibirli) is literally Odyn raising the stakes of the trial. Finishing the finale makes Odyn declare the party *layık* (worthy), the same word the key tooltip uses for a timed run.

**Recommended route (summary, details in §6).** Courtyard (3 chained pulls) -> Heymdal -> Hearth of Revelry (4 pulls, table funnel) -> gallery -> **Hirya** -> walk back with Odyn's Favor -> Fields (4 pulls) -> **Fenrür** -> Ephemeral Way (4 single pulls) -> Şan Eşiği (1 pull) -> **Skovald and Odyn**. Route B (Fenrür first, take the Mead Cellar, finish Hirya second and use the Rüzgâr Köprüsü skip) is within 10 s of A in time and trades the four-pull Ephemeral Way (with the three-kick pack p26) for a two-pull bridge, a cellar swarm and a walk back (§3.4, §6.2).

---

## 2. ART DIRECTION (closest possible to Halls of Valor)

### 2.1 Visual pillars and loading screen

1. **Titan gold on basalt.** Dark charcoal stone with gold-trimmed Titan architecture (round columns with gold bands, cyan rune strips) fused with vrykul timber and iron.
2. **The storm is always overhead.** Every outdoor room shows a sky (panorama) and periodic lightning flashes. Interiors (Hearth, Seat, dens, vaults) are the warm or cool counterpoint.
3. **Warm inside, cold outside.** Mead-hall amber (0xffa850) against storm slate (0x56626e).
4. **Floating.** Everything stands on slabs above a cloud sea: parapets, no rock mass, no cave ceiling. The only underground-feeling rooms are the Mead Cellar, the Rune Vault and Fenrür's den.
5. **Colour discipline.** Gold/white = Valarjar, holy, Odyn. Blue-violet = storm and lightning. Fel green = Skovald and the Tideskorn only (the Legion taint). Never mix fel green into the rest.

**Loading screen (one line).** A colossal gold-and-white Titan keeper made of lightning stands in a vortex of storm cloud over a floating round rune hall, a winged-helm horn-bearer on a long ramp in the foreground, and the Turkish title "YİĞİTLER SARAYI" in gold Cinzel across the bottom.

### 2.2 Palette

| name | hex | where |
|---|---|---|
| Basalt charcoal | 0x2b2f38 | stone_dark floors, rock backdrop, vrykul walls |
| Storm slate | 0x56626e | fog colour, sky mid, courtyard shadows |
| Mist grey | 0x9aa8bc | horizon haze, parapet stone |
| Slate green | 0x4a5a52 | Fields cliffs, larch shadow |
| Titan gold | 0xd9b45a | rune trim, Aegis, Odyn, banner trim |
| Forge bronze | 0xb87a3a | Valarjar armour, braziers, hearth ironwork |
| Iron steel | 0x8a96a8 | Sentinels, gate hardware |
| Lightning white | 0xeaf2ff | strikes, Odyn's eyes, flashes |
| Lightning violet | 0x7a5cff | storm accents, Solsten, chain lightning |
| Titan cyan | 0x60d8ff | Titan rune strips, Solsten pillar, drake breath core |
| Holy white-gold | 0xfff0b0 | Olmyr, Hirya, spears of light, rune pads |
| Autumn amber | 0xe0904a | Fields foliage and sunset |
| Mead amber | 0xffa850 | Hearth fires, torches, lanterns |
| Fel green | 0x60ff80 | Skovald, Tideskorn, Felblaze fire (nothing else) |
| Den blood-brown | 0x6a2c28 | Fenrür's den, pelts, bones |
| Banner blue / white / gold | 0x2a4a9a / 0xe8eef8 / 0xd9b45a | Valarjar banners (`banner_*_blue`, tinted) |

### 2.3 Materials and textures

* `DungeonTheme.tint = 0xb4bccc` (cool grey multiply over the KayKit `dungeon_texture`).
* Titan areas (giris, heymdal_zirvesi, Seat, Ephemeral Way, Şan Eşiği, Hall): `floor 'stone'`, `wall 'stone'`. Gold comes from props, rune zones (`rectZone('rune', ...)` with gold glow) and emissive trim, not from the floor texture.
* Vrykul areas (courtyard, Hearth, cellar): `floor 'stone_dark'` / `'wood'`, `wall 'brick'` in the Hearth (warm 0xe6c4aa tint) and `'stone'` in the courtyard.
* Fields and Fenrür's den: `floor 'dirt'`, `wall 'cave'` (rock cliffs). `autoDecor` high for grass, stumps and rocks.
* Do NOT use `'temple'` floors or walls: they carry a purple tint (0x8c7cb0 / 0xb4a4d6) that fights the palette. The temple rune decals are replaced by explicit gold rune zones.
* PSX textures to reuse in NEW props: `textures/itch/psx-walls-fences/wf-stone-wall.png`, `wf-brick-wall.png`, `wf-roof-tiles.png` (timber/roof), `textures/itch/retro-psx-nature-pack/rnp-bush*-fall.png` (autumn foliage).

### 2.4 Lighting rig, fog, sky, storm

The builder owns the rig: one hemisphere (min 1.3), one ambient (min 0.95), ONE shadow-casting "moon" directional (tinted from `hemiSky`), one cool rim fill (0xb8d0ff, 0.7), plus a pooled set of point lights near the player (budget: <= 10 lights, <= 500 draw calls, <= 350k tris). Our knobs:

```ts
const THEME: DungeonTheme = {
  fogColor: 0x56626e, fogNear: 16, fogFar: 70,           // open air: longer sight than the crypts
  ambient: 0x7c88a0, ambientIntensity: 0.5,
  hemiSky: 0xa4b4d0, hemiGround: 0x2c2a30,
  torchColor: 0xffb060, bloomStrength: 0.5,
  music: 'dungeon_frost',                                 // EXISTING MusicId (file dungeon_cold_sanctuary.mp3); bosses use the existing 'boss'
  palette: [0x2b2f38, 0x56626e, 0x9aa8bc, 0xd9b45a, 0xb87a3a, 0xeaf2ff, 0x7a5cff, 0xffa850],
  tint: 0xb4bccc,
  // NEW (SP-1): sky: { image: '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-24.jpg', fallback: SKY_STORM }, cloudSea: { y: -6, color: 0x6a7686, speed: 0.04 }
};
```

**Per-room atmosphere** (`RoomDef.fog` EXISTS and blends at 1.6/s; `RoomDef.sky` is NEW SP-1 and blends the same way):

| room | fog colour / near / far | sky (panorama in `public/assets/sky/itch/cloudy-skyboxes-panorama/`) | `lightColor` | ambientVfx |
|---|---|---|---|---|
| giris, yuksek_kapi, k_heymdal | 0x56626e / 16 / 70 (theme) | `cloudy-sky-09.jpg` (dark storm, golden horizon band) | 0xaec4ff | `ambient_dust` |
| heymdal_zirvesi | 0x48566e / 18 / 80 | `cloudy-sky-24.jpg` (violet-grey overcast) | 0xaec4ff | `ambient_dust` |
| solen_ocagi | 0x2e2218 / 10 / 44 (interior, warm) | none (roofed) | 0xffa850 | `ambient_embers` |
| bal_mahzeni | 0x2a2016 / 8 / 36 | none | 0xffa050 | `ambient_embers` |
| k_yukselis | 0x4a4a58 / 10 / 44 | none | 0xe8e0c0 | `ambient_dust` |
| yukselis_koltugu | 0x6a7288 / 14 / 62 | none (round Titan chamber with a skylight, light shafts) | 0xcfe0ff | `ambient_dust` |
| k_av_yolu | 0xb89868 / 18 / 80 | `cloudy-sky-21.jpg` | 0xffc080 | `ambient_embers` (fallback for leaves) |
| av_meydani | 0xd8b080 / 22 / 100 (sunset haze) | `cloudy-sky-21.jpg` (amber sunset, red horizon) | 0xffc080 | `ambient_leaves` (NEW id, alias `ambient_embers`) |
| fenrur_ini | 0x2a1a1a / 10 / 46 | none (cave) | 0xff6040 | `ambient_embers` |
| k_hyrja_dogu, efemer_yol | 0x5a6a7a / 14 / 72 | `cloudy-sky-24.jpg` | 0xaec4ff | `ambient_dust` |
| rune_mahzeni | 0x24303a / 8 / 38 | none | 0x70c0ff | `ambient_dust` |
| salon_esigi | 0x6a6458 / 16 / 72 | `cloudy-sky-02.jpg` | 0xffe0a0 | `ambient_dust` |
| salon_arena | 0xcfc8b0 / 24 / 110 (gold haze) | `cloudy-sky-02.jpg` (sun breaking through the storm above a cloud sea); `cloudy-sky-23.jpg` during Odyn's last phase | 0xffe8b0 | `ambient_dust` |

**Storm flashes (NEW SP-2).** `RoomDef.storm = { every: [7, 16], color: 0xeaf2ff, strength: 0.9 }` on every open room: a 0.12 s hemisphere and background flash, `lightning_impact` SFX delayed by 0.4 to 1.2 s. Never inside the Hearth.

**Coloured point lights.** Per prop `light`, same format as `golge_tapinagi.ts` (`lt(color, intensity, distance, flicker, y)`): amber 0xffa850 for fires and lanterns, cyan 0x60d8ff for Titan rune strips, holy 0xfff0b0 around Olmyr and the Hall, violet 0x7a5cff around Solsten, fel 0x60ff80 only around Tideskorn braziers. Keep <= 4 lit props per 12 m of wall.

### 2.5 Landmark set pieces, in run order

1. **Gök Kapısı Eşiği (start).** A round bronze-and-gold Titan platform with the Kehanet Taşı in front and, behind the player, the arch they came through (`valor_gate_arch`). Parapet walls, cloud sea below, two blue-white braziers.
2. **Yüksek Kapı Avlusu (High Gate courtyard).** A wide basalt courtyard with eight tall gold-banded Titan columns, four carved storm totems with blue lanterns, two bronze valkyr statues flanking the north stairs, a siege ballista on a rampart, a training dummy yard. Storm drakes perch on the corner columns and swoop when you approach.
3. **Heymdal Zirvesi.** A round dais (r about 24 m) with a ring of twelve standing stones, four lightning rods (the drake-breath cover), and the giant **Gjallar horn** on a stone cradle at the north rim. Sky and storm directly overhead.
4. **Şölen Ocağı (Hearth of Revelry).** The only fully roofed hall: wood floor, brick walls, timber rafters with dragon-head beam ends, two rows of long feast tables with tankards, two great fire pits, bear-skin rugs, shield walls, hanging lanterns, kegs. Warm amber, heavy shadows.
5. **Bal Mahzeni (optional).** Low brick cellar stacked with kegs, a gold chest and the haste shrine ("Hidromel Fıçısı").
6. **Valkyr Galerisi + Yükseliş Koltuğu.** A narrow gallery of winged valkyr statues leads to a round Titan chamber: gold floor ring, skylight shafts, **Solsten** (cyan-violet lightning pillar, west) and **Olmyr** (white-gold holy pillar, east), twelve banners.
7. **Av Patikası + Ebedi Av Meydanları (Fields of the Eternal Hunt).** You step out of the hall into an open autumn meadow under an amber sunset: larches and oaks in fall colours, hunting totems with skulls, tents and bonfires of the Valarjar hunters, bear dens in the rocks, a cliff wall of slate green.
8. **Fenrür İni.** A rock den: torn tents, bone piles, pelts, a cave mouth in the north-east corner where he retreats.
9. **Rüzgâr Köprüsü (skip) and Geçici Yol (Ephemeral Way).** A wide rope-and-plank bridge (16 m, over the cloud sea) from the Seat, and a straight causeway of floating runic slabs that climbs 6 m over the cloud sea, parapets on both sides, fel-green braziers where the Tideskorn have camped.
10. **Şan Eşiği.** A gatehouse with a giant door (4 tiles wide) and a colossal statue of Odyn's face; the Tideskorn war camp and the power shrine.
11. **Şan Salonu (Hall of Glory).** A huge round Titan floor (64 x 64 m) with an eight-rune ring, the **Aegis of Aggramar** on a central pedestal, the colossal Odyn effigy at the north rim, eight lightning pillars around the edge, open sky with the sun breaking through the storm.

### 2.6 Props mapped to assets

All existing paths are under `public/assets/models/` (helpers in `src/data/dungeons/kit.ts`: `dg`, `hw`, `fu`, `gp`, `kg`, `kc`, `kn`, `ip`, `chr`, `mon`). All were checked to exist.

**Existing assets by room (recipe, use the kit helpers `p.row`, `p.ring`, `p.wall`, `p.torches`, `p.scatter`):**

| room | props |
|---|---|
| giris | `gen/props/font_of_power` (Font), 2 x `gen/props/brazier` (tint 0x80b0ff, light 0x80b0ff), `itch/psx-dungeon/arch` x1 scale 3 at the south edge, `dungeon/banner_patternC_blue` x4, `gen/props/waypoint_stone` (decor) |
| yuksek_kapi | 8 x `dungeon/pillar_decorated` scale 2.2 tint 0xd9b45a on the rim (collide), 4 x NEW `valor_totem_storm`, 2 x NEW `valor_valkyr_statue` at the north stairs, `kenney/castle-kit/siege-ballista` x1, `gen/props/training_dummy` x3, `kenney/castle-kit/flag-banner-long` x6 on poles, `itch/psx-dungeon/stairs_ultrawide` at the north exit, `dungeon/sword_shield_gold` x4 on walls, `gen/props/rock_large` clutter at the rim, 4 x NEW `valor_lightning_rod` (SET-15) at the lower-yard corners (4.5, 47.5), (16.5, 47.5), (4.5, 52.5), (16.5, 52.5), 6 x NEW `valor_retaining_wall` for the terrace and the stair flanks |
| k_heymdal | `kenney/castle-kit/stairs-stone`, 2 x `halloween/lantern_standing`, `dungeon/banner_thin_blue` x2 |
| heymdal_zirvesi | NEW `valor_horn_giant` (north rim), 4 x NEW `valor_lightning_rod` (the cover pillars, collide, positions = script constants), 12 x `kenney/nature-kit/stone_tallA` ring (decor), `zones`: gold `dais` circle r 6 tiles y 0.4 + gold rune ring, 6 x `dungeon/banner_blue` on poles |
| solen_ocagi | 6 x `dungeon/table_long_tablecloth_decorated_A` (2 rows, collide), 24 x `furniture/chair_stool_wood`, 12 x `itch/nocturnal-watch/tavern_beer_mug` on tables, `dungeon/plate_food_A/B`, 2 x `gen/props/campfire` (great fires, west and east of the aisle), 8 x `dungeon/keg_decorated`, 6 x `dungeon/barrel_large_decorated` (breakable), `furniture/rug_rectangle_stripes_A` x4, 5 x NEW `valor_shield_wall_panel`, 4 x NEW `valor_longhall_beam` hung at y 4, `itch/nocturnal-watch/tavern_chandelier` x3, `halloween/lantern_hanging` x6, `dungeon/banner_patternA_blue` x6, `dungeon/sword_shield_gold` x6, 10 x NEW `valor_balcony_span` (two upper galleries at y 9.2, §3.6, decor), kegs and barrels are `tag 'breakable'` with `onBreak` mead puddles (SET-16) |
| bal_mahzeni | 14 x `dungeon/keg` / `keg_decorated` stacks, `gen/props/chest_gold` (id `chest_cellar`), `kenney/graveyard-kit/altar-stone` + floating `gen/props/crystal_blue` (haste shrine, the `shrine()` helper pattern of `golge_tapinagi.ts`), `dungeon/candle_triple` x4 |
| k_yukselis | 6 x NEW `valor_valkyr_statue` (3 per side), `dungeon/banner_triple_blue` x4, `halloween/lantern_standing` x4 |
| yukselis_koltugu | NEW `valor_mystic_pillar_thunder` at (23.5, 14.5), NEW `valor_mystic_pillar_holy` at (31.5, 14.5), 12 x `dungeon/banner_shield_blue` ring on the wall, `kenney/graveyard-kit/column-large` x8 on the rim (collide), `zones`: gold ring r 5.5 tiles + two cyan/white circle runes under the pillars, 4 x skylight cones (VFX only), NEW `valor_titan_chandelier` x1 at y 20 |
| k_av_yolu | `kenney/nature-kit/tree_oak_fall` x4, `kenney/nature-kit/rock_tallA` x2, `halloween/post_lantern` x2 |
| av_meydani | `halloween/tree_pine_orange_large` x14, `kenney/nature-kit/tree_oak_fall` x10, `gen/props/tree_autumn` x8, `kenney/nature-kit/cliff_stone` / `cliff_block_stone` along the north and south rim, `gen/props/rock_large/medium/small` clutter, NEW `valor_hunt_skull_pole` x8, `gen/props/tent` x3 (hunter camps, collide), `gen/props/campfire` x3, `kenney/nature-kit/log_stack` x4, `gen/props/wagon` x1, `kenney/nature-kit/grass_large` + `gen/props/grass_tuft` scatter, `itch/nocturnal-watch/crow` x3 on stumps, `gen/props/chest_wood` x1 |
| fenrur_ini | `gen/props/bone_pile` x8, `halloween/ribcage` x4, `halloween/skull` x6, `gen/props/rock_cliff` cave walls, `gen/props/tent` x2 (torn, tint 0x6a4a3a, collide), `kenney/nature-kit/stump_oldTall` x5 (the kiting obstacles), NEW `valor_den_mouth` in the NE corner, `halloween/shrine_candles` x2 (red) |
| k_hyrja_dogu | NEW `valor_rope_bridge` (visual plank lane over the middle two tile rows of the 4-row room), stone parapets, `kenney/castle-kit/flag-pennant` x6, `halloween/lantern_standing` x6 (blue), NEW `valor_pillar_titan` x4 at the two ends |
| efemer_yol | NEW `valor_floating_slab` x14 scattered outside the parapet (decor), `dungeon/wall_half` parapet (built by SP-1), 4 x `gen/props/brazier` (tint 0x60ff80, fel, collide) near Tideskorn packs, `gen/props/iron_cage` x2, `halloween/lantern_standing` x6 (blue light), `itch/psx-dungeon/spikes` x4, 3 x NEW `valor_lightning_rod` (SET-15) at (50.2, 37), (52.8, 31), (50.2, 26) |
| rune_mahzeni | `kenney/graveyard-kit/pillar-obelisk` x6 (tint 0x60d8ff, emissive), `gen/props/chest_iron`, `dungeon/shelf_large` x4, `gen/props/chains_hanging` x4 |
| salon_esigi | NEW `valor_gate_arch` (the 4-tile door frame at (51.5, 16)), NEW `valor_odyn_effigy` scale 0.5 (face statue, east wall), `kenney/graveyard-kit/altar-stone` + holy crystal (power shrine at (51.5, 18.8), between p30 and p31), 2 x NEW `valor_lightning_rod` (SET-15) at (46.5, 21), (56.5, 21), 4 x `gen/props/brazier` (fel tint, collide), `dungeon/banner_patternC_blue` x6, `kenney/castle-kit/metal-gate` as the gate leaves (open state) |
| salon_arena | NEW `valor_odyn_effigy` (north rim, full scale), 8 x NEW `valor_rune_pad` ring (r 5 tiles, positions in §5.4), `gen/weapons/shield_kite_crest` scale 3 emissive 0xd9b45a on the central pedestal (the Aegis, id `aegis`), 8 x NEW `valor_pillar_titan` on the rim, `kenney/nature-kit/statue_ring` x1 (floor ornament), 12 x `dungeon/banner_blue`, NEW `valor_stair_titan` x2 (south entry), `gen/props/chest_epic` (end chest) next to the exit portal |

**NEW props to build in Blender** (`tools/blender/props/props_valor.py`, new category `valor`, same PSX rules as `docs/assets/generated-props.md`: 1 unit = 1 m, +Z forward, origin at the base centre, 16-64 px NEAREST textures, 8-20 colour palette, vertex-colour AO, emissive strips with `KHR_materials_emissive_strength` 1.5-3, named child nodes for animation, <= 600 tris each except the effigy):

| id | size W x H x D (m) | look |
|---|---|---|
| `valor_gate_arch` | 12 x 10 x 3 | titan-bronze gate arch with gold rune trim, cyan rune strips, a keystone gem; used at the start platform, the entrance and the Hall gate |
| `valor_horn_giant` | 5 x 4 x 2 | Gjallar horn: huge curved horn with three gold bands on a carved stone cradle; node `horn_glow` (emissive white-blue) |
| `valor_pillar_titan` | 2 x 8 x 2 | round titan column, gold bands, cyan rune strips, emissive node `runes` |
| `valor_mystic_pillar_thunder` | 2.6 x 7 x 2.6 | Solsten: stone base, crackling blue-violet crystal shaft, nodes `crystal`, `rune_ring` (rotates), `light_0` |
| `valor_mystic_pillar_holy` | 2.6 x 7 x 2.6 | Olmyr: stone base, white-gold crystal shaft with a halo ring, nodes `crystal`, `halo`, `light_0` |
| `valor_lightning_rod` | 1.4 x 6 x 1.4 | iron-and-bronze lightning rod pillar with a blue arc ball on top (drake-breath cover), node `arc` |
| `valor_totem_storm` | 1.4 x 4 x 1.4 | carved wooden storm totem with a blue lantern and a wing carving, node `light_0` |
| `valor_valkyr_statue` | 2.4 x 5.5 x 2.4 | gold-bronze winged-helm valkyr with spread wings and a spear, plinth base (two pose variants through scale -1 on X) |
| `valor_odyn_effigy` | 6 x 14 x 5 | colossal gold-white titan-keeper statue: bearded face, winged lightning crown, spear, a glowing eye socket (node `eye`); the face-only variant is reused by scaling and cutting at the neck in Blender (`valor_odyn_face`, 4 x 5 x 2) |
| `valor_rune_pad` | 5 x 0.25 x 5 | low round stone disc with a gold rim and an emissive glyph (one glyph texture; the 8 colours come from `rune` zones laid over it) |
| `valor_hearth_pit` | 6 x 1 x 2 | (optional upgrade of `campfire`) long stone fire pit with iron grate and flame cards, node `flame` |
| `valor_longhall_beam` | 4 x 1 x 1 | carved timber roof beam with dragon-head ends (hang at y 4) |
| `valor_shield_wall_panel` | 4 x 1.2 x 0.3 | wall mount of five round shields (blue, gold, red, white, iron), embossed |
| `valor_hunt_skull_pole` | 1 x 4 x 1 | pole with bear and wolf skulls and feathers |
| `valor_rope_bridge` | 44 x 0.6 x 8 | rope-and-plank bridge deck with rope rails (the plank lane in the middle of the 11 x 4 tile skip corridor; stone parapets and the cloud sea fill the rest) |
| `valor_floating_slab` | 4 x 0.6 x 4 | floating runic stone slab, glowing underside (decor beyond the parapet) |
| `valor_stair_titan` | 8 x 3 x 6 | wide titan-stone stairs with gold edge strips (entrance and Hall) |
| `valor_den_mouth` | 8 x 5 x 4 | cave mouth in cliff rock with hanging pelts and bones (Fenrür retreat) |
| `valor_helm_winged` | 0.9 x 0.7 x 0.9 | winged horned Valarjar helm, **attach to bone `head`** of KayKit characters |
| `valor_wings` | 3.4 x 2.4 x 0.7 | gold-white feathered wing pair, **attach to bone `chest`** (Hirya, valkyr statues' pose reference) |
| `valor_steel_jaw` | 0.6 x 0.4 x 0.5 | steel jaw plate, optional: only if the bear rig exposes a `head` bone (the attach list only supports KayKit rigs), otherwise skip |
| `valor_balcony_span` | 8 x 1.4 x 2.4 | timber upper gallery span with a railing, posts and a banner hook (Hearth balconies at y 9.2; non-walkable decor) |
| `valor_titan_chandelier` | 4 x 3 x 4 | gold ring chandelier with cyan crystals and eight emissive flames, hangs from the Seat's skylight (node `flames`) |
| `valor_retaining_wall` | 8 x 2.4 x 1.2 | basalt retaining wall block with a gold cap and banner slots (courtyard terrace and stair flanks, `collide`) |

Plus **one NEW boss model:** `gen/bosses/odyn_titan.glb` (same pipeline and clip vocabulary as the six existing gen bosses: Idle, Walk, Run, Attack, Attack2, Cast, Enrage, Hit, Death; nodes `fx_spear`, `fx_eye`): a 6.5 m gold-white plate-armoured titan keeper, white beard, winged lightning crown, cyan rune strips, huge spear, floats 0.3 m. **Fallback until it exists:** `monsters/Demon_Lord.glb` scale 2.1, tint 0xe8d890, emissive 0xffe080 x0.45, Trident visible (it already reads as a golden horned giant with a spear).

### 2.7 Enemy models

| enemy | model | scale | tint / emissive | accessories |
|---|---|---|---|---|
| Yiğit Kalkan Kızı (shieldmaiden) | `characters/Knight.glb` | 1.1 | 0xe8d9a8 | `1H_Sword`, `Round_Shield`; `Knight_Helmet` hidden and replaced by NEW `valor_helm_winged` (bone `head`) |
| Yiğit Gök Çağıran (thundercaller) | `monsters/Giant.glb` | 0.85 | 0xb8c8e8, emissive 0x4060ff x0.3 | none (a giant) |
| Fırtına Dövümlü Nöbetçi (sentinel) | `characters/Knight.glb` | 1.3 | 0x8aa0b8, emissive 0x60a0ff x0.35 | `1H_Sword`, `Rectangle_Shield`, winged helm (replaces `Knight_Helmet`) |
| Fırtına Ejderi (storm drake) | `monsters/Dragon_Evolved.glb` | 0.6 | 0x88b0ff, emissive 0x3050ff | flying, hover 3.2 |
| Karapençe Kurt (worg) | `itch/creatures/warg.glb` | 0.8 | 0x3a3038 | red eyes (`eyeEmissive 0xff4040`) |
| Çeliçene Ayı (grizzly) | `itch/creatures/bear.glb` | 1.15 | 0x4a4a52 | optional NEW `valor_steel_jaw` |
| Yiğit Mistik | `characters/Mage.glb` | 1.05 | 0xf0e0a0 | `1H_Wand`, `Spellbook_open`, winged helm instead of the hat |
| Yiğit Tuzakçı | `characters/Rogue_Hooded.glb` | 1.0 | 0x7a5a38 | `2H_Crossbow` |
| Rün Oymacısı | `characters/Mage.glb` | 1.0 | 0x6aa8ff, glow 0x60d8ff | `2H_Staff`, no hat |
| Gelgitkıran Akıncı (Tideskorn) | `monsters/Orc.glb` | 1.0 | 0x8a4a38, emissive 0x40ff60 x0.25 | `Orc_Weapon`, fel-green eyes |
| Ziyafet Delisi (revel swarm) | `characters/Barbarian.glb` | 0.9 | 0xa88a60 | `Mug` or `1H_Axe` (mixed), no hat |
| Altın Tüylü Geyik (stag) | `itch/creatures/deer.glb` | 1.3 | 0xd8b060 (gold fur), antlers tinted 0xfff0b0 | none |
| Yiğit Arındırıcı (purifier) | `characters/Rogue.glb` | 1.0 | 0xf0e8c8, glow 0xfff0b0 | `Spellbook_open`, winged helm, no hood |
| Skovald | `monsters/Orc.glb` | 1.55 | 0x7a3a28, emissive 0x40ff60 x0.25 | `Orc_Weapon`, fel-green eyes |
| Heymdal | `characters/Knight.glb` | 2.05 | 0xd8c890 | `2H_Sword`, `Knight_Cape`, winged helm (replaces `Knight_Helmet`) |
| Hirya | `characters/Mage.glb` | 1.75 | 0xf4e8b8, glow 0xfff0b0 | `1H_Wand`, no hat, NEW `valor_wings` on `chest` |
| Fenrür | `gen/creatures/wolf_dire.glb` | 2.3 | 0x5a2e2e, `eyeEmissive 0xff3030` | none |
| Odyn | `gen/bosses/odyn_titan.glb` (fallback `Demon_Lord`) | see §2.6 | gold-white | spear baked in |

### 2.8 VFX palette

Lightning white 0xeaf2ff and violet 0x7a5cff (`lightning_strike`, `chain_lightning`, `lightning_projectile`, `storm_tornado`); Titan cyan 0x60d8ff (`arcane_burst` recoloured, Solsten); holy gold 0xfff0b0 (`holy_burst`, `holy_beam`, `judgement_pillar`, `holy_projectile`); fire orange 0xff8a30 (`fire_burst`, `meteor_fall`); fel green 0x60ff80 (`fire_ground` recoloured through the `color` option, Skovald and Tideskorn only); mead amber 0xffa850 (`brazier_fire`, `torch_fire`, `ambient_embers`). NEW ids with alias fallbacks (VFX owner implements, unknown ids stay silent): `static_field` (alias `lightning_strike` ground), `storm_flash` (full-screen flash), `ambient_leaves` (alias `ambient_embers`), `rune_pad_glow` (alias `waypoint_glow`). Telegraph colours follow `GDD_CONTENT` §0.6.

### 2.9 Music and ambience

The dungeon uses the existing id `dungeon_frost` (file `dungeon_cold_sanctuary.mp3`); the mood to aim for (and to ask the music owner for if a dedicated track is ever made) is slow Nordic brass and low war drums over wind, a distant choir held under the storm; the Hearth adds a tavern fiddle loop and crackling fire; the Fields drop the brass for strings, crows and wind through leaves; the Hall brings the choir forward. Boss music: every boss plays the existing id `boss` (the three boss mp3 files `boss_great_boss`, `boss_colossus` and `boss_epic_battle` are file names behind that one id, not ids). Dedicated per-boss tracks would need new `MusicId` values and `manifest.ts` entries (optional SP-9 polish); the Odyn stage swap to the choir layer is then an `AudioSystem` layer toggle on `choir_swell`. Ambience loops: wind (all open rooms), thunder (storm flashes), fire crackle (Hearth, cellar), cave drip (den, vault). SFX that already exist and should be used: `hero_horn` (Heymdal's horn), `wolf_howl` (Fenrür), `lightning_cast`, `lightning_impact`, `gate_heavy`, `choir_sting`, `choir_swell`, `boss_roar`.

### 2.10 Room-by-room set-dressing sheet (this is one of the 8 maps Mythic+ rotates on, so every room is dressed to the same bar)

Format per room: **props** (counts), **upper level** (non-walkable, `y` set, no nav cells), **lights** (point lights, pooled: the builder lights the 10 nearest; the numbers are the authored sources), **VFX**, **sounds**. All asset paths are in §2.6 (EXISTS) or the NEW table there; helper names are the `kit.ts` ones. Budgets per room: <= 10 lit props within view, <= 80 decor draw calls (`explicitDecor: true` everywhere, so the builder's auto pillars and braziers are off).

1. **giris, Gök Kapısı Eşiği (32 x 20 m, start platform).** Props: `font_of_power` x1 (Kehanet Taşı, centre), `brazier` x2 (tint 0x80b0ff), `valor_gate_arch` x1 behind the player (the arch they came through), `itch/psx-dungeon/arch` x1, banners `banner_patternC_blue` x4 on poles, `waypoint_stone` x1, parapet blocks x14 around the platform (`wall_half`), `valor_floating_slab` x6 beyond the parapet. Upper: two gate pillars with hanging banners at y 6 to 10. Lights: blue braziers x2 (0x80b0ff, intensity 1.4, 12 m), Font glow (0xffd860, 10 m). VFX: `ambient_dust`, Font pulse, cloud sea below (SP-1). Sounds: wind loop, distant thunder, a soft `gate_heavy` when the countdown barrier lifts.
2. **yuksek_kapi, Yüksek Kapı Avlusu (64 x 56 m, 0.0 yard + 2.0 terrace).** Props: `pillar_decorated` x8 (scale 2.2, gold tint, collide, rim), `valor_totem_storm` x4, `valor_valkyr_statue` x2 (top of the Büyük Merdiven) plus x2 (gate corners), `valor_retaining_wall` x6 (the stair flanks), `valor_lightning_rod` x4 (SET-15, collide), `siege-ballista` x1 on the terrace, `training_dummy` x3, `flag-banner-long` x6 on poles, `sword_shield_gold` x4, `rock_large` clutter x10, `valor_floating_slab` x8 outside the parapet. Upper: drake perches on the 2 highest columns (y 9), banners hanging from the gate arch. Lights: blue lanterns on the totems x4 (0x80b0ff), amber braziers on the retaining walls x4 (0xffa850), rods' arc balls x4 (0x7a5cff, flicker). VFX: `lightning_strike` hazard, `storm_flash`, `ambient_dust`, arc crackle on the rods. Sounds: wind, thunder 0.4 to 1.2 s after each flash, `lightning_impact` per strike, a muffled `hero_horn` echo every 60 s from Heymdal's peak.
3. **k_heymdal, Boru Merdiveni (16 x 16 m, 2.0 to 4.0).** Props: `stairs-stone` x2 (visual treads on the strip), `lantern_standing` x6 (lining the steps), `banner_thin_blue` x4, `valor_gate_arch` x1 (scale 0.7, the top), `valor_pillar_titan` x2 flanking, dormant drake perches x2 (p06). Upper: the arch's hanging banners (y 7 to 9). Lights: lanterns x6 (0xaec4ff, 8 m). VFX: lightning flickers on the stairs, drake eyes glow when `dormant` wakes. Sounds: drake rattle when you come within 15 m, then a screech and wing beats.
4. **heymdal_zirvesi, Heymdal Zirvesi (64 x 56 m, 4.0).** Props: `valor_horn_giant` x1 (north rim), `valor_lightning_rod` x4 (the cover, script constants), `stone_tallA` x12 (the standing-stone ring), `banner_blue` x6 on poles, gold `dais` zone r 6 tiles plus the gold rune ring, parapet x30, `valor_floating_slab` x10. Upper: a ring of 6 tall prayer flags (y 6 to 12) that flutter. Lights: rod arc balls x4 (0x7a5cff), `horn_glow` (0xeaf2ff, 14 m, pulses when he blows), rune ring glow (0xd9b45a). VFX: `storm_flash`, `lightning_strike` visuals, drake breath (`lightning_strike` recoloured), `static_field` strips, orbs. Sounds: `hero_horn` (the horn), `boss_roar` at each phase, `lightning_cast` per blade, wind loop louder than elsewhere.
5. **solen_ocagi, Şölen Ocağı (88 x 36 m, 3.2, roofed 14 m).** Props: `table_long_tablecloth_decorated_A` x6 (2 rows of 3, collide), `chair_stool_wood` x24, `tavern_beer_mug` x12, `plate_food_A/B` x14, `campfire` x2 (the great fire pits), `keg_decorated` x8 and `barrel_large_decorated` x6 (breakable, SET-16), `rug_rectangle_stripes_A` x4, `valor_shield_wall_panel` x5, `valor_longhall_beam` x4 at y 11, `tavern_chandelier` x3 at y 12, `lantern_hanging` x6, `banner_patternA_blue` x6, `sword_shield_gold` x6, a keg pyramid and the throne bench on the High Table dais. Upper: **two timber balconies** (`valor_balcony_span` x5 per side) at y 9.2 with 6 posed revel statues leaning over the rails, banners down the walls, rafters and dragon-head beam ends. Lights: great fires x2 (0xffa850, intensity 2, 16 m, flicker), chandeliers x3 (0xffc070, 12 m), hanging lanterns x6 (0xffa850, 8 m), High Table fire (0xff9040). VFX: `ambient_embers`, `brazier_fire` flames, mead splash on keg break, smoke wisps under the rafters. Sounds: fire crackle loop, tavern fiddle loop (low), muffled laughter and tankard clinks (revel swarm idle barks), keg `barrel_break` SFX.
6. **bal_mahzeni, Bal Mahzeni (24 x 20 m, stair then 1.9, 5.5 m).** Props: `keg` / `keg_decorated` stacks x14 (up to 3 high), `chest_gold` x1 (`chest_cellar`), `altar-stone` x1 with floating `crystal_blue` (the haste shrine "Hidromel Fıçısı"), `candle_triple` x4, `barrel_large` x6 along the stair, `wall torches` x6 in niches, cobweb decals x3. Upper: a timber ceiling grid with hanging garlic and sausage props. Lights: torches x6 (0xffa050, 9 m), shrine crystal (0x80c0ff, 6 m). VFX: `ambient_embers`, shrine glow, honey-gold motes. Sounds: cave drip, fire crackle, low brass hum on the shrine.
7. **k_yukselis, Valkyr Galerisi (24 x 16 m, 3.2 to 6.2, 12 m).** Props: `valor_valkyr_statue` x6 on rising plinths (3 per side), `banner_triple_blue` x4, `lantern_standing` x6, two weapon racks (`gen/weapons/sword_2h_claymore` x2, `axe_2h_battle` x2), `column-large` x6 forming the upper arcade, rune strips along the walls (`rune` zones x2, gold glow). Upper: an arcade of 8 arches at y 9 to 12 with shields and spears hung between them. Lights: lanterns x6 (0xe8e0c0, 8 m), rune strips (0xd9b45a, 6 m). VFX: `ambient_dust`, light shafts from clerestory windows (VFX cone x3). Sounds: soft `choir_sting` swell when you enter, footsteps echo on the stair, wind through slits.
8. **yukselis_koltugu, Yükseliş Koltuğu (56 x 56 m, 6.2, 26 m).** Props: `valor_mystic_pillar_thunder` x1 (23.5, 14.5), `valor_mystic_pillar_holy` x1 (31.5, 14.5), `banner_shield_blue` x12 (wall ring), `column-large` x8 on the rim (collide), gold ring and two circle runes (cyan, white) on the floor, `valor_titan_chandelier` x1 at y 20, skylight cones x4 (VFX only), `valor_valkyr_statue` x4 at the ring's cardinal points. Upper: a ring balcony of 12 arches at y 13 to 16, wing-shaped relief panels on the dome. Lights: Solsten (0x7a5cff, 14 m, crackle flicker), Olmyr (0xfff0b0, 14 m, steady), chandelier (0xfff0b0, 16 m), skylight (0xcfe0ff, 20 m, cone). VFX: cyan arcs between Solsten and the floor, white motes around Olmyr, `ambient_dust` in the shafts, valkyr feathers drifting. Sounds: a held choir pad (`choir_swell` at low volume), thunder hum near Solsten, bell tone near Olmyr.
9. **k_av_yolu, Av Patikası (16 x 12 m, 3.2 to 0.0).** Props: `tree_oak_fall` x4, `rock_tallA` x2, `post_lantern` x2, hunting totem x1 at the top, log steps x6 (visual), grass tufts x20. Upper: none (the trail is a descent: you see the Fields spread below). Lights: post lanterns x2 (0xffc080, 9 m). VFX: `ambient_leaves` (alias embers), falling leaves, dust on the steps. Sounds: crows, wind in leaves, the first wolf howl from far away.
10. **av_meydani, Ebedi Av Meydanları (96 x 72 m, 0.0 with a 1.4 m lookout).** Props: `tree_pine_orange_large` x14, `tree_oak_fall` x10, `tree_autumn` x8, `cliff_stone` / `cliff_block_stone` x24 along the north and south rim, rocks x20, `valor_hunt_skull_pole` x8, `tent` x3 (hunter camps, collide), `campfire` x3, `log_stack` x4, `wagon` x1, `grass_large` + `grass_tuft` scatter x80, `crow` x3 on stumps, `chest_wood` x1, the lookout hill with a watch post (tent + bonfire + skull pole), 3 grizzly dens (rock arches, `bone_pile` x3 each). Upper: cliff walls 12 m high all round, a far ridge of larches (decor trees at y 10 on cliff tops). Lights: campfires x3 (0xffa850, 14 m), bonfire on the hill (0xff9040, 12 m), sunset directional tint. VFX: `ambient_leaves`, smoke from the camps, a god-ray cone over the meadow (VFX). Sounds: wind in leaves, crow caws, fire crackle at camps, `wolf_howl` every 40 s, a bear growl near each den.
11. **fenrur_ini, Fenrür İni (56 x 48 m, 0.0 with a 1.2 m ledge, 14 m dome).** Props: `bone_pile` x8, `ribcage` x4, `skull` x6, `rock_cliff` cave walls, `tent` x2 (torn), `stump_oldTall` x5 (kiting obstacles), `valor_den_mouth` x1 (north-east, the ledge), `shrine_candles` x2 (red), hanging pelts x6 on the ledge, a bone throne of ribcages at the west wall (decor). Upper: stalactites at y 10 to 14, pelts hanging from cave beams. Lights: candles x2 (0xff4020, 8 m), embers in the den mouth (0xff6040, 10 m), a cold shaft from a hole in the dome (0xb0c8ff). VFX: `ambient_embers`, red eye-glints in the dark corners, breath mist. Sounds: cave drip, a slow heartbeat under the music, `wolf_howl` at each retreat, `boss_roar` on stagger.
12. **k_hyrja_dogu, Rüzgâr Köprüsü (44 x 16 m, 6.2, over the cloud sea).** Props: `valor_rope_bridge` x1 (the plank lane, middle 2 tiles), stone parapets both sides, `flag-pennant` x6, `lantern_standing` x6 (blue), `valor_pillar_titan` x2 at each end, 6 `valor_floating_slab` drifting beyond the parapet, an anchor chain prop x4. Upper: a second, higher span of the Titan arch above the deck at the far end (y 12 to 16). Lights: lanterns x6 (0xaec4ff, 9 m). VFX: cloud sea below (SP-1), wind streaks, `storm_flash`, lightning in the far clouds. Sounds: strong wind, rope creak, thunder.
13. **efemer_yol, Geçici Yol (16 x 80 m, ramp 0.0 to 6.2).** Props: `valor_floating_slab` x14 (some under the deck, some drifting beyond), parapet x40, `brazier` x4 (fel green, collide) at the Tideskorn camps, `iron_cage` x2, `lantern_standing` x6 (blue), `spikes` x4, `valor_lightning_rod` x3 (SET-15), Tideskorn banners x4 (torn, green-dark). Upper: gold-white light on the slabs far above as you climb, banners hung between 4 tall columns at the top (y 8 to 14). Lights: fel braziers x4 (0x60ff80, 10 m), lanterns x6 (0xaec4ff), rods x3. VFX: `lightning_strike` hazard (interval 7), `storm_flash`, fel `fire_ground` embers around braziers, slab glow underside. Sounds: wind, thunder, fel crackle at the braziers, distant `choir_sting` as the sky turns gold.
14. **rune_mahzeni, Rün Mahzeni (24 x 20 m, 5.6, 7 m).** Props: `pillar-obelisk` x6 (cyan tint, emissive), `chest_iron` x1, `shelf_large` x4 with scrolls, `chains_hanging` x4, rune floor circle (cyan), 2 braziers (blue). Upper: runic ceiling panels (emissive strips at y 7). Lights: obelisks x6 (0x60d8ff, 8 m, pulse), braziers x2 (0x80b0ff). VFX: `ambient_dust`, arcane motes rising from the obelisks. Sounds: a low hum, cave drip, chain clinks.
15. **salon_esigi, Şan Eşiği (48 x 24 m, 6.2 + the Zafer Merdiveni to 8.6).** Props: `valor_gate_arch` x1 (the 4-tile door frame at (51.5, 16)), `valor_odyn_effigy` scale 0.5 (face, east wall), `altar-stone` + holy crystal x1 (power shrine at (51.5, 18.8)), `brazier` x4 (fel tint, collide) at the Tideskorn camp, `banner_patternC_blue` x6, `metal-gate` x2 (open leaves), `valor_pillar_titan` x2 (the stair columns), `valor_lightning_rod` x2 (SET-15), `valor_stair_titan` visual x1 on the strip, torn Tideskorn tents x2. Upper: the gate arch rises 16 m with hanging banners; Odyn's face carved 12 m up; drake perches on the highest column. Lights: fel braziers x4 (0x60ff80), shrine crystal (0xfff0b0, 8 m), arch rune strip (0xd9b45a, 14 m), the Hall's gold light spilling down the stair (0xffe8b0). VFX: `lightning_strike` hazard (interval 10), `storm_flash`, holy motes at the shrine. Sounds: `gate_heavy` when the finale door opens, wind, a low choir swell that grows with each step up the stair.
16. **salon_arena, Şan Salonu (64 x 64 m, 8.6).** Props: `valor_odyn_effigy` x1 (north rim, full scale 14 m), `valor_rune_pad` x8 (the ring), `shield_kite_crest` x1 (the Aegis on its pedestal), `valor_pillar_titan` x8 (rim, collide), `statue_ring` x1 (floor ornament), `banner_blue` x12, `valor_stair_titan` x2 (south entry), `chest_epic` x1 and the exit portal (after the kill), `valor_floating_slab` x10 beyond the rim, gold rings floating at y 12 around the pillars (decor). Upper: an upper ring of 8 floating gold rings, 10 m banners, Odyn's effigy towering over the dais. Lights: 8 rune pads (their glow colours, 8 m each), Aegis (0xffd860, 12 m), pillar rune strips (0xd9b45a), the sun breaking through the storm (directional 0xffe8b0). VFX: `ambient_dust` in god-rays, `storm_flash`, `judgement_pillar` / `holy_burst` per mechanic, `lightning_strike` for the rain, `rune_pad_glow` on the pads. Sounds: `choir_swell` as the finale opens, `boss_roar`, `lightning_impact` per strike, the choir layer swaps in at stage 2 (§2.9).


---

## 3. LAYOUT (tile grid)

### 3.1 Grid and map

Grid **64 x 60** tiles. The route runs from the south-west start platform north through the High Gate, east into the Hearth, forks north (Seat of Ascension) and south (Fields), and re-joins in the east for the Ephemeral Way and the Hall of Glory in the north-east. The map was generated and checked by script (no overlapping rooms, every door tile inside room `a` with its neighbour tile inside room `b`, all 16 rooms reachable, every pack and patrol waypoint inside its room, pack and patrol spacing at least 4 tiles except the two deliberately linked Hearth swarms, see §4.3).

Plan view (heights are in §3.2 and §3.6: the dungeon climbs from 0.0 m at the start to 8.6 m in the Hall of Glory, with the Fields and the Mead Cellar as the low points):

```
    0         1         2         3         4         5         6
    0123456789012345678901234567890123456789012345678901234567890123
  0                                             4444444444444444
  1                                             4444444444444444
  2                                             4444444444444444
  3                                             44444444@4444444
  4                                             4444444444444444
  5                                             4444444444444444
  6                                             4444444444444444
  7                                             4444444444444444
  8                      22222222222222         4444444444444444
  9                      22222222222222         4444444444444444
 10                      22222222222222         4444444444444444
 11                      22222222222222         4444444X44444444
 12                      22222222222222         4444444444444444
 13                      2222222@222222         4444444444444444
 14                      22222222222222         4444444444444444
 15                      22222222222222         4444444444444444
 16                      22222222222222           FFFF####FFFF
 17                      2222222222222%fffffffffffFFFFFFFFFFFF
 18                      2222222222222%fffffffffffFFFFFFFFFFFF
 19                      22222222222222fffsffffsf+FFFFFFFFFFFF
 20                      22222222222222ffffffffff+FFFF.FFFF.FF
 21                      22222222222222           FFFFFFFFFFFF
 22   1111111111111111       dd##dd             ggggggE++E
 23   1111111111111111       dddddd             ggggggEEEE
 24   1111111111111111       ddd.dd             gggogg+E.E
 25   1111111111111111       dddddd             gggggg+EEE
 26   11111111@1111111CCCCCCCCC++CCCCCCCCCCC    ggggggEEEE
 27   1111111111111111CCCCCCCCCCCCC.CCCCCCCC          EEEE
 28   1111111111111111CCCCCCCCCCCCCCCCC.CCCCcccccc    EEEE
 29   111111111111111%CCCCC.CCCCCCCCCCCCCCC+cccccc    EEEE
 30   111111111111111%CCCCCCCCCCCCCCCCCCCCC+ccccoc    EE.E
 31   1111111111111111CCCCCCCCCCCCCCCCCCCCCCcccccc    EEEE
 32   1111111111111111CCCCC.CCCCCC.CCCCCCCCCcccccc    EEEE
 33   1111111111111111CCCCCCCCCCCCCCCCCC.CCC          EEEE
 34   1111111111111111CCCCCCCCCCCCC++CCCCCCC          EEEE
 35   1111111111111111            eeee                EE.E
 36          b##b                 ee.e                EEEE
 37          bbbb                 e++e                EEEE
 38          bb.b       DDDDDDDDDDDDDDDDDDDDDDDD      EEEE
 39          bbbb       DDDDDDDDDDDDDDDDDDDDDDDD      EEEE
 40    BBBBBBB++BBBBBBB DDDDDDDDDDDDDDDDDDDDDDDD      EE.E
 41    BBBBBBBBBBBBBBBB DDDDDDDDDDDDoDDDDDDD.DDD      EEEE
 42    BBBBBBBBBBBBBBBB DDDDD.DDDDDDDDDDDDDDDDDD3333333%%33333
 43    BBB.BBBBBBBBB.BB DDDDDDDDDDDDDDDDDDDDDDDD33333333333333
 44    BBBBBBBBBBBBBBBB DDDDDDDDDDDDDDDDDDDDDDDD33333333333333
 45    BBBBBBBBBBBBBBBB DDDDDDDDDDDDDDDDDDDDDDDD33333333333333
 46    BBBBBBBBBBBBBBBB DDDDDDDDDDDDDDDDDDDDDDDD33333333333333
 47    BBBBBBBB.BBBBBBB DDDDDDDDDDDD.DDDDDDDDDD#3333333@333333
 48    BBBBBBBBBBBBBBBB DDDDDDDDDDDDDDDDDDDDDDD#33333333333333
 49    BBBBBBBBBBBBBBBB DDDDDDDDDDDDDDDDDDDDDDDD33333333333333
 50    BBBBBBBBBBBBBBBB DDDDDDDDDDDDDDDDDDDDDDDD33333333333333
 51    BBBB.BBBBBBB.BBB DDDDD.DDDDDDDDDDDDDDDDDD33333333333333
 52    BBBBBBBBBBBBBBBB DDDDDDDDDDoDDDDDDoDDDDDD33333333333333
 53    BBBBBBBBBBBBBBBB DDDDDDDDDDDDDDDDDDDDDDDD33333333333333
 54        AAA++AAA     DDDDDDDDDDDDDDDDDDDDDDDD
 55        AAAAKAAA     DDDDDDDDDDDDDDDDDDDDDDDD
 56        AAAAAAAA
 57        AAASAAAA
 58        AAAAAAAA
 59 
```

Legend: `A` giris, `B` yuksek_kapi, `b` k_heymdal, `1` heymdal_zirvesi (boss 1), `C` solen_ocagi, `c` bal_mahzeni (optional), `d` k_yukselis, `2` yukselis_koltugu (boss 2a), `e` k_av_yolu, `D` av_meydani, `3` fenrur_ini (boss 2b), `f` k_hyrja_dogu (skip), `E` efemer_yol, `g` rune_mahzeni (optional), `F` salon_esigi, `4` salon_arena (boss 3, finale). `+` open door, `#` boss_lock, `%` boss_exit, `.` pack centre, `o` optional pack, `s` skip-corridor pack, `@` boss spawn, `S` start, `K` Kehanet Taşı, `X` exit portal. (Pack dots are rounded to the nearest tile; the data file has the exact centres. The Rüzgâr Köprüsü is now 4 tiles (16 m) wide, rows z 17..20.)

### 3.2 Rooms (with the new height columns)

`open` = open-air room (SP-1: parapet walls, no rock cap, sky panorama). Sizes in metres. `floorY` = `RoomDef.floorY` in metres above the start platform (**NEW, SP-10**); "strip" = a stair or ramp strip of tiles that interpolates between two heights (`RoomDef.stairs`, NEW SP-10; the 0.45 m max step rule of `CORE_MECHANICS` §13 applies everywhere else). `ceiling` = `RoomDef.ceiling` in metres (NEW SP-10; drives wall height, pillar and arch scale and the camera zoom limit; open-air rooms use 30 as a pure camera value and show the sky).

| id | Turkish name | rect x,z,w,h | size m | floorY (m) | ceiling | floor / wall | open | purpose | forces |
|---|---|---|---|---|---|---|---|---|---|
| `giris` | Gök Kapısı Eşiği | 7, 54, 8, 5 | 32 x 20 | 0.0 | open (30) | stone_dark / stone | yes | start, Kehanet Taşı | - |
| `yuksek_kapi` | Yüksek Kapı Avlusu | 3, 40, 16, 14 | 64 x 56 | **0.0 lower yard** (z 46..53), **2.0 terrace** (z 40..42), grand stair strip x 7..12, z 43..45 (0.0 to 2.0) | open (30) | stone_dark / stone | yes | first courtyard, 5 packs, lightning strikes | 71 |
| `k_heymdal` | Boru Merdiveni | 9, 36, 4, 4 | 16 x 16 | 2.0 rising to 4.0 (whole room is one stair strip, north) | open (30) | stone_dark / stone | yes | stairs to the High Gate, 2 dormant drakes | 8 |
| `heymdal_zirvesi` | Heymdal Zirvesi | 2, 22, 16, 14 | 64 x 56 | 4.0 (dais 4.4, outer lip 3.6: three 0.4 m steps) | open (30) | stone / stone | yes | **boss 1** arena | - |
| `solen_ocagi` | Şölen Ocağı | 18, 26, 22, 9 | 88 x 36 | **3.2**; door ramp strip x 18..19 (4.0 to 3.2); **High Table dais** x 38..39, z 27..32 at 4.1 via stair strip x 37 | 14 (roofed, rafters at 11 to 14) | wood / brick | no | Hearth of Revelry, 6 packs, table funnel, the fork | 83 |
| `bal_mahzeni` | Bal Mahzeni | 40, 28, 6, 5 | 24 x 20 | stair strip x 40..42 (4.1 down to 1.9), floor **1.9** x 43..45 | 5.5 | dirt / brick | no | **optional** mead cellar, haste shrine, chest | 20 |
| `k_yukselis` | Valkyr Galerisi | 25, 22, 6, 4 | 24 x 16 | 3.2 rising to **6.2** (whole room is one stair strip, north) | 12 | stone / stone | no | gallery to the Seat, 1 pack on the stairs | 13 |
| `yukselis_koltugu` | Yükseliş Koltuğu | 21, 8, 14, 14 | 56 x 56 | **6.2** (gold ring dais 6.6) | 26 (skylight) | stone / stone | no (skylight) | **boss 2a** arena (Hirya) | - |
| `k_av_yolu` | Av Patikası | 30, 35, 4, 3 | 16 x 12 | 3.2 falling to 0.0 (whole room is one ramp strip, south) | open (30) | dirt / cave | yes | trail from the Hearth down to the Fields | 15 |
| `av_meydani` | Ebedi Av Meydanları | 20, 38, 24, 18 | 96 x 72 | **0.0**; **Av Gözetleme Tepesi** (hunters' lookout hill) x 38..42, z 39..42 at 1.4 via ramp strip x 36..37, z 40..41 | open (30) | dirt / cave | yes | Fields of the Eternal Hunt, kite zone | 84 (60 + 24 optional) |
| `fenrur_ini` | Fenrür İni | 44, 42, 14, 12 | 56 x 48 | 0.0; **cave ledge** x 54..57, z 43..45 at 1.2 via ramp strip x 52..53 | 14 (cave dome) | dirt / cave | no (cave) | **boss 2b** arena (Fenrür) | - |
| `k_hyrja_dogu` | Rüzgâr Köprüsü | 35, 17, 11, **4** | 44 x **16** | 6.2 (bridge deck, flat) | open (30) | stone / stone | yes | **skip** corridor Seat -> Şan Eşiği, 2 packs, cloud sea below | 31 |
| `efemer_yol` | Geçici Yol | 50, 22, 4, 20 | 16 x 80 | one **ramp strip**, 0.0 at z 41 rising to 6.2 at z 22 (0.33 m per tile) | open (30) | stone / stone | yes | Ephemeral Way causeway, 4 packs spaced 5 tiles apart | 57 |
| `rune_mahzeni` | Rün Mahzeni | 44, 22, 6, 5 | 24 x 20 | 5.6 (level with the ramp at the door) | 7 | stone_dark / stone | no | **optional** rune vault, chest | 12 |
| `salon_esigi` | Şan Eşiği | 46, 16, 12, 6 | 48 x 24 | 6.2 flat (z 19..21), **grand stair strip** z 16..18 rising to 8.6 | open (gate arch 16 m high) | stone / stone | yes (gate court) | threshold before the finale, 2 packs, power shrine, lightning strikes | 36 |
| `salon_arena` | Şan Salonu | 44, 0, 16, 16 | 64 x 64 | **8.6**; Odyn's dais z 1..3, x 49..54 in three 0.4 m tiers (to 9.8); pedestal 9.0 | open (colossal pillars 14 m) | stone / stone | yes | **boss 3** arena (Skovald and Odyn) | - |

Three height tiers as `CORE_MECHANICS` §13 asks: the **court** (0.0 / 2.0 / 4.0), the **hall and seat** (3.2 / 4.1 / 6.2 plus the 1.9 cellar) and the **climb to glory** (0.0 Fields, ramp to 6.2, stair to 8.6): eleven distinct floor heights, 8.6 m of total relief and no overlapping floors (nothing walks under a bridge). Totals: 430 forces available (343 main route, 31 skip corridor, 56 optional).

The Rüzgâr Köprüsü was 2 tiles (8 m) wide in the first draft. It is now 4 tiles (16 m, rows z 17..20) so its two packs can sit 5 tiles apart and Route B no longer trades one narrow corridor for another (§3.4, §6.3). Rows 17..20 (not 16..19) keep its east door on the flat part of Şan Eşiği (rows 19 and 20), clear of the grand stair strip.

### 3.3 Doors (all `DoorDef`, tile in room `a`)

| a | b | tile | side | width | gate |
|---|---|---|---|---|---|
| giris | yuksek_kapi | 10, 54 | n | 2 | none |
| yuksek_kapi | k_heymdal | 10, 40 | n | 2 | none |
| k_heymdal | heymdal_zirvesi | 10, 36 | n | 2 | boss_lock |
| heymdal_zirvesi | solen_ocagi | 17, 29 | e | 2 | boss_exit |
| solen_ocagi | bal_mahzeni | 39, 29 | e | 2 | none |
| solen_ocagi | k_yukselis | 27, 26 | n | 2 | none |
| k_yukselis | yukselis_koltugu | 27, 22 | n | 2 | boss_lock |
| solen_ocagi | k_av_yolu | 31, 34 | s | 2 | none |
| k_av_yolu | av_meydani | 31, 37 | s | 2 | none |
| av_meydani | fenrur_ini | 43, 47 | e | 2 | boss_lock |
| yukselis_koltugu | k_hyrja_dogu | 34, 17 | e | 2 | boss_exit |
| k_hyrja_dogu | salon_esigi | 45, **19** | e | 2 | none |
| fenrur_ini | efemer_yol | 51, 42 | n | 2 | boss_exit |
| efemer_yol | salon_esigi | 51, 22 | n | 2 | none |
| efemer_yol | rune_mahzeni | 50, 24 | w | 2 | none |
| salon_esigi | salon_arena | 50, 16 | n | **4** | boss_lock |

Boss `order`: Heymdal 1, Hirya 2, Fenrür 2, finale 3. The existing gate rules give exactly the intended flow: the two fork rooms stay locked while Heymdal lives, either fork order works (both order 2), and the finale door stays closed until both order-2 bosses are dead (same pattern as Gölge Tapınağı).

### 3.4 Critical path, forks, skips, optional areas

* **Critical path:** giris -> yuksek_kapi -> k_heymdal -> **Heymdal** -> solen_ocagi -> (**Hirya** via k_yukselis, **Fenrür** via k_av_yolu + av_meydani, either order) -> salon_esigi -> **finale**.
* **Re-join.** Fenrür's exit leads to the Ephemeral Way (south end, you must walk all of it). Hirya's exit leads to the Rüzgâr Köprüsü corridor, which enters Şan Eşiği directly and skips the whole Ephemeral Way (57 forces, about 2:25 of trash and walking). The boss killed second decides which exit you use; the one killed first means a walk back through the Hearth.
* **Skip (Route B):** kill Fenrür first, take the optional Mead Cellar, kill Hirya second, leave through the Rüzgâr Köprüsü. Forces: 317 on the way plus the cellar's 20 = **337 of 325 (103.7%, 12 forces of slack)**; without the cellar Route B is 97.5% and cannot finish, so the cellar swarm is mandatory on B. Route A has 343 of 325 (105.5%, 18 of slack, no optional pack needed). Time is about equal (§6.2). Honest rationale of B: it trades the causeway (four single-pack pulls on a 16 m ramp, one of them the three-kick pack p26) for the bridge (two pulls on a deck that is also 16 m wide, two HIGH kicks in total, one Tideskorn) plus a cellar swarm and a walk back with Odyn's Favor. The first draft claimed B "avoids the narrow corridor": both are 16 m wide now, so that sentence is gone.
* **Optional areas:** Bal Mahzeni (swarm-dense, 20 forces, haste shrine, gold chest), Rün Mahzeni (12 forces, iron chest, off the Ephemeral Way, only reachable on Route A), the three Steeljaw grizzly dens in the Fields (8 forces each, pull only with Odyn's Favor or Blessing running, see SET-8).
* **Chasms and falls.** The Rüzgâr Köprüsü and the Ephemeral Way hang over the cloud sea. Both have solid parapets: a `void` zone (blocked, visual) lies under and beside them and never opens a fall path in v1 (the §13 fall rule, 25% max HP and respawn at the last safe tile, exists but is not used here: the original has no lethal pit either). No lift is used (Halls of Valor has none), so the SP-10 lift primitive is not needed by this dungeon.

### 3.5 Set pieces and how to build each

| id | where | what the player sees | build |
|---|---|---|---|
| SET-1 | yuksek_kapi, efemer_yol, salon_esigi | lightning striking the floor at random tiles under a flickering sky | **NEW (SP-2)** `HazardDef.kind 'lightning_strike'` (same path as `lava_burst`): `{ kind:'lightning_strike', interval:9, warn:1.4, radius:2.2, coef:0.35, stun:1.0, vfx:'lightning_strike' }` in the courtyard, `interval:7, radius:2.0` on the causeway, `interval:10` in Şan Eşiği. Plus `RoomDef.storm` flashes. SET-15 makes the rods part of it. |
| SET-2 | p04, p06 | storm drakes perched on the corner columns that swoop in when you come near | **EXISTS** `PackDef.dormant = { kind:'ceiling', wakeRadius:15 }` (imps already drop this way). |
| SET-3 | heymdal_zirvesi | Heymdal's horn, drakes strafing, lightning rods as cover | boss (§5.1). Pattern **EXISTS** in `ai/bosses/buzul.ts` (Kırağı orbit and breath band with pillar shadows); generalised as **NEW SP-3a `breathBand`**. |
| SET-4 | solen_ocagi | two rows of tables funnel the revel swarm into three lanes; the east pair of packs can be pulled together at the tables | props with `collide:true` on the tables (kit `p.at`/`p.row`), `PackDef.linkedTo` on p10 and p11 (and on p07 and p08, the west pair), `big:true` on p07, p08, p10. **EXISTS.** |
| SET-5 | bal_mahzeni | a keg-stacked cellar with a golden chest and a glowing mead barrel | optional room, door gate `none`; `extras.shrines` `shrine_haste`, `extras.chests` `chest_gold`; **EXISTS** (Rüzgar Sunağı pattern of `golge_tapinagi.ts`). |
| SET-6 | k_yukselis | a gallery of winged valkyr statues up a long stair | decor only (NEW `valor_valkyr_statue` x6) plus one pack, fought on the stairs. **EXISTS** + SP-10 stair strip. |
| SET-7 | yukselis_koltugu | Solsten and Olmyr: the boss grows stronger near either pillar | boss script constants + static pillar props (§5.2). **EXISTS** (positions as script constants, like `golge.ts` SOCKETS). |
| SET-8 | av_meydani | open autumn meadow, hunters' camps, worgs that leap at ranged players, a lookout hill with an archer pack, three grizzlies you only pull while running with a speed buff | normal packs + 3 `optional:true` packs; **NEW status ids** `odyn_favor` (+40% move speed, 75 s, granted to the party when the FIRST fork boss dies) and `odyn_blessing` (+70% move speed, 60 s, granted when the SECOND dies, replaces the Favor). Granted from each fork boss's `onDeath` with `statusPlayer(p, 'odyn_favor', 75)` (EXISTS in `kit.ts`; fallback if the status defs are not ready: existing `'haste'` with magnitude 0.4 / 0.7). |
| SET-9 | fenrur_ini | a den with a cave mouth where Fenrür retreats and howls up worgs | boss (§5.3). Mechanic-phase pattern **EXISTS** (`zakhar_ritual`: `setImmune`, `freeze`, `teleport`, `endMechanicPhase`). |
| SET-10 | k_hyrja_dogu | a rope bridge 16 m wide over the cloud sea, two packs | `skip:true` room, `boss_exit` gate from the Seat. **EXISTS.** |
| SET-11 | efemer_yol | a 16 m wide causeway of floating slabs that climbs 6.2 m, fel braziers, lightning | SP-1 parapets + cloud sea, SET-1 hazards, SP-10 ramp strip. |
| SET-12 | salon_esigi | giant gate, Odyn's stone face, Tideskorn camp, power shrine, the grand stair to the Hall | normal room, `shrine_power`. **EXISTS** + SP-10 stair strip. |
| SET-13 | salon_arena | eight rune pads, the Aegis pedestal, Odyn dais, lightning pillars | boss (§5.4); props and `rune` zones. **EXISTS** + NEW SP-3 helpers. |
| SET-14 | whole dungeon | the Kehanet Taşı in the start room and the Great-Vault-style chest at the exit | `extras.fontOfPower`, `exit` + `gen/props/chest_epic`. **EXISTS.** |
| **SET-15** | yuksek_kapi (4 rods), efemer_yol (3), salon_esigi (2) | **Topraklama Direkleri** (grounding rods): the iron-and-bronze `valor_lightning_rod` pillars. A lightning strike whose random tile lands within 6 m of a rod is cancelled (the rod flashes and arcs harmlessly), and every player within 3 m of a rod at that moment gains **Yüklü** (+8% damage, 6 s, stacks to 3). Fight beside a rod and the storm helps you; pull away from one and it hits. This is the trash set piece tied to the weather. | **NEW (SP-2)**: `HazardDef.groundedBy?: { pos: [number, number][]; radius: number; status?: StatusId }`; status `rod_charged` (NEW, YS-2). Rod positions are written next to the strike hazard and the rod props (same constants). |
| **SET-16** | solen_ocagi | **Bal Fıçıları** (mead kegs): 8 `keg_decorated` and 6 `barrel_large_decorated` in the Hearth are breakable. Breaking one spills a hidromel puddle (r 2.5 m, 10 s): enemies standing in it are slowed 35% and take +10% damage, the revel swarm is immune (they are drunk). A fire-school hit ignites the puddle (0.5 coef DoT for 5 s). The tank breaks kegs under a pack with a swing or dash. | **NEW (SP-13)**: `PropPlacement.onBreak?: { zone: { radius, duration, status, ignitesOnFire? } }` on the existing `tag 'breakable'` path; status `mead_sticky` (NEW, YS-2). |

### 3.6 Verticality: how the dungeon climbs (user rule, `CORE_MECHANICS` §13)

**Side elevation of the critical path** (1 row = 1 m, `=` flat, `/` rising, `\` falling, `.` solid; numbers below are the rooms). Two spines: north (start, High Gate, Hearth, Seat, bridge, Hall) and south (Hearth, Fields, den, Ephemeral Way, Hall).

```
A) NORTH SPINE (m above the start platform)
10 |
 9 |                                                                      /=======
 8 |                                                                     /........
 7 |                                                                    /.........
 6 |                                             /======================..........
 5 |                                           /=.................................
 4 |                     /=======             /...................................
 3 |                   /=........\============....................................
 2 |             /=====...........................................................
 1 |             .................................................................
 0 |=============.................................................................
   ++----+------+-+---+---+-----+-+----------+----+------+--------+----+---+------
    1    2      3 4   5   6     7 8          9    10     11       12   13  14
   1 giris | 2 yard | 3 grand stair | 4 terrace | 5 Boru stairs | 6 HEYMDAL 4.0 | 7 door ramp | 8 HEARTH 3.2 | 9 gallery stairs | 10 SEAT 6.2 (Hirya) | 11 Rüzgâr bridge 6.2 | 12 Şan Eşiği 6.2 | 13 hall stair | 14 HALL 8.6 (Odyn)

B) SOUTH SPINE
10 |
 9 |                                                                  /=======
 8 |                                                                 /........
 7 |                                                                /.........
 6 |                                                       /========..........
 5 |                                                     /=...................
 4 |                                                  /==.....................
 3 |========                                       /==........................
 2 |........\                                   /==...........................
 1 |.........\                               /==..............................
 0 |..........\==============================.................................
   ++------+---+--------------------+------+------------------+----+---+------
    1      2   3                    4      5                  6    7   8
   1 HEARTH 3.2 | 2 trail | 3 FIELDS 0.0 | 4 FENRÜR DEN 0.0 | 5 EPHEMERAL WAY ramp 0.33 m/tile | 6 Şan Eşiği 6.2 | 7 hall stair | 8 HALL 8.6
```

**Stair, ramp and platform inventory** (all `RoomDef.stairs` strips, NEW SP-10; `from`/`to` in metres, strip rect in tiles; the strip interpolates linearly from its entry edge to its far edge; all other tiles stay at the room `floorY` or its `dais` zone height; no step above 0.45 m outside a strip):

| room | strip / platform | tiles | from -> to | length | slope | set-dressing on it |
|---|---|---|---|---|---|---|
| yuksek_kapi | **Büyük Merdiven** (grand stair) | x 7..12, z 43..45 (6 wide, 3 deep) | 0.0 -> 2.0 | 12 m | 9.5 deg | 2 valkyr statues on plinths at the top corners, 6 banner poles, 4 braziers on the flanking retaining walls (x 3..6 and x 13..18, z 43..45 are blocked `valor_retaining_wall` blocks 2.0 m high) |
| yuksek_kapi | terrace | x 3..18, z 40..42 | 2.0 flat | - | - | rampart parapet, ballista, 2 corner columns with dormant drakes (p04, p05 stand here) |
| k_heymdal | **Boru Merdiveni** | whole room x 9..12, z 36..39 | 2.0 -> 4.0 | 16 m | 7 deg | steps lined with blue lanterns, banners hanging from a gold arch at the top |
| heymdal_zirvesi | dais, lip | circle r 6 tiles / r 8 tiles | 4.4 / 3.6 / 4.0 | 0.4 m steps | - | gold rune ring, 12 standing stones, Gjallar horn on a stone cradle at the north rim (cradle is a 0.4 m step up) |
| solen_ocagi | door ramp | x 18..19, z 29..30 | 4.0 -> 3.2 | 8 m | 5.7 deg | threshold of timber planks, two shield walls |
| solen_ocagi | **High Table dais** | x 38..39, z 27..32 on stair strip x 37 (z 27..32) | 3.2 -> 4.1 | 4 m | 12.7 deg | the head table with the biggest fire, a throne-like bench, Odyn's face painted on the east wall, keg pyramid |
| bal_mahzeni | cellar stair | x 40..42, z 28..32 | 4.1 -> 1.9 | 12 m | 10 deg | steep timber steps, torches in wall niches, mead barrels stacked on each side |
| k_yukselis | **Valkyr Merdiveni** (gallery stairs) | whole room x 25..30, z 22..25 | 3.2 -> 6.2 | 16 m | 10.6 deg | 6 valkyr statues on plinths that rise with the stairs, 4 blue-white lanterns, a long banner on each wall |
| yukselis_koltugu | ring dais | circle r 5.5 tiles | 6.2 -> 6.6 | 0.4 m | - | gold floor ring, Solsten and Olmyr stand on it |
| k_av_yolu | **Av Patikası** trail | whole room x 30..33, z 35..37 | 3.2 -> 0.0 | 12 m | 15 deg | switchback of packed dirt with log steps, hunting totem at the top |
| av_meydani | lookout hill ramp / hill | strip x 36..37, z 40..41; hill x 38..42, z 39..42 | 0.0 -> 1.4 | 8 m | 10 deg | a hunters' watch post with a tent, a bonfire and a skull pole; p19 stands here |
| fenrur_ini | cave ledge ramp / ledge | strip x 52..53, z 43..44; ledge x 54..57, z 43..45 | 0.0 -> 1.2 | 8 m | 8.5 deg | the cave mouth, bone shelf, hanging pelts; Fenrür retreats here |
| k_hyrja_dogu | bridge deck | x 35..45, z 17..20 | 6.2 flat | 44 m | - | plank lane with rope rails in the middle two tiles, stone parapets, cloud sea below (void zone), 6 pennants, 4 lanterns |
| efemer_yol | **Geçici Yol** ramp | whole room x 50..53, z 22..41 | 0.0 -> 6.2 (south to north) | 80 m | 4.4 deg | floating slabs beyond the parapet drift up and down, braziers every 20 m, the sky turns from storm slate to gold as you climb |
| salon_esigi | **Zafer Merdiveni** (hall stair) | x 46..57, z 16..18 (12 wide, 3 deep) | 6.2 -> 8.6 | 12 m | 11.3 deg | two giant gold-banded columns, 6 braziers, Odyn's colossal face carved into the wall above the gate |
| salon_arena | Odyn dais, pedestal | x 49..54, z 1..3 / (51.5, 8.5) | 8.6 -> 9.0 -> 9.4 -> 9.8 / 9.0 | 0.4 m tiers | - | the dais is three broad steps, the pedestal is one |

**Decorative upper levels (non-walkable, `y` set on props, no nav cells).** These sell the height the player cannot reach, and every one is a prop recipe with counts in §2.10:

* **Hearth balconies:** two timber galleries (`valor_balcony_span` x 5 per side) at y 9.2 along the north and south walls, with a rail, banners hanging down, lanterns, and 6 static revel statues (`Barbarian` posed, `pose`) leaning over the rail so the room reads as a crowded hall from below. Rafters (4 `valor_longhall_beam`) and 3 tavern chandeliers hang at y 11 to 13.
* **Valkyr gallery:** a second tier of arches (`kenney/graveyard-kit/column-large` on 2-block plinths) above each wall, with shields and spear racks, at y 9 to 12.
* **Seat of Ascension:** a ring balcony of 12 gold arches at y 13 to 16 around the round chamber, and a **Titan chandelier** (`valor_titan_chandelier`) hanging from the skylight at y 20.
* **Courtyard and Şan Eşiği:** banners hanging from the gate arch, drake perches on the highest columns (y 8 to 10), a ballista rampart one level up.
* **Hall of Glory:** an upper ring of 8 colossal Titan pillars (14 m) with floating gold rings, banners 10 m long, and Odyn's effigy 14 m tall at the north rim.
* **Mead Cellar and Rune Vault:** low ceilings (5.5 m, 7 m) on purpose: the contrast is the point.

**Engine contract (SP-10, details in §8.1).** `RoomDef.floorY`, `RoomDef.ceiling`, `RoomDef.stairs: { rect, from, to, dir }[]`, `ZoneDef.y` (already exists; `dais` zones use it for the ring, dais, ledge and lookout), `World.groundY` samples the heightfield, enemies path through stair strips only, melee ignores height differences up to 2.5 m (the biggest difference between two fighting groups here is the lookout hill, 1.4 m, and the terrace, 2.0 m). Boss arenas keep every attack on the arena plane: none of the four boss arenas has a strip inside its fight area: Heymdal's 0.4 m steps, Fenrür's cave ledge (1.2 m) and Odyn's tiered dais are stages at the edge, never fight areas.

---

## 4. TRASH

13 defs (2 added in this revision: the Gildedfur Stag and the Valarjar Purifier), 31 packs, 123 mobs. Everything is a multiplier on the level-60 baseline (`GDD_CONTENT` §0.3: `monsterHP(60) = 2246`, `monsterDmg(60) = 284`). The M+ curve, Fortified (+20% HP, +30% damage) and party scaling are applied on top by the engine. `forces` follow the existing roster (swarm 1, trash 3-5, elite 6-8).

**Creature rules applied to every def** (`CORE_MECHANICS` §16, ROADMAP F10): 2 to 4 telegraphed attacks per type (the basic counts); every non-cast attack has `windup = clamp(0.45 + 0.25 x coef, 0.45, 1.2)` seconds (cast-time spells use their cast time instead); several attacks are 2-hit strings with a delayed second swing (`followUps`, NEW SP-12); elites carry a **posture bar** (NEW SP-11): light hits add 3 posture, heavy attacks 10, parries and perfect blocks 25, shield bashes 25; it regenerates 4 per second after 4 s without damage; at the maximum the enemy is **staggered** for 3 s (current windup or cast cancelled, +30% damage taken, riposte crits), then immune to posture for 8 s. Role mix per pack: a kick-caster, a healer, a brute, a swarm or an elite. Dungeon-specific trash set pieces: **SET-15 Topraklama Direkleri** (grounded lightning) and **SET-16 Bal Fıçıları** (mead keg puddles), §3.5.

### 4.1 Enemy definitions

`R_VALARJAR = { physical: 0.1, lightning: 0.25, holy: 0.25, shadow: -0.15 }`, `R_STORM = { lightning: 0.75, frost: -0.15 }` are NEW resist constants; `R_BEAST` and `R_DEMON` exist.

| id | Turkish name | WoW | rank | role | model | HP x | dmg x | speed | radius | aggro | forces | posture | resist |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `yg_shieldmaiden` | Yiğit Kalkan Kızı | Valarjar Shieldmaiden | trash | melee brute (frontal) | Knight 1.1 | 1.6 | 1.3 | 5.8 | 0.6 | 11 | 4 | - | R_VALARJAR |
| `yg_thundercaller` | Yiğit Gök Çağıran | Valarjar Thundercaller | elite | kick-caster | Giant 0.85 | 2.6 | 1.5 | 4.2 | 1.0 | 14 | 6 | 40 | R_VALARJAR |
| `yg_sentinel` | Fırtına Dövümlü Nöbetçi | Stormforged Sentinel | elite | tank, aura | Knight 1.3 | 3.6 | 1.6 | 5.2 | 0.8 | 12 | 8 | 60 | R_VALARJAR |
| `yg_storm_drake` | Fırtına Ejderi | Storm Drake | trash | ranged | Dragon_Evolved 0.6 (flying, hover 3.2) | 1.6 | 1.2 | 6.5 | 0.9 | 14 | 4 | - | R_STORM |
| `yg_worg` | Karapençe Kurt | Ebonclaw Worg | trash | melee swarm-lite | warg 0.8 | 1.0 | 1.2 | 8.2 | 0.6 | 12 | 3 | - | R_BEAST |
| `yg_grizzly` | Çeliçene Ayı | Steeljaw Grizzly | elite | brute, kite | bear 1.15 | 4.2 | 1.8 | 5.6 | 1.1 | 12 | 8 | 50 | R_BEAST |
| `yg_mystic` | Yiğit Mistik | Valarjar Mystic | trash | healer | Mage 1.05 | 1.3 | 0.9 | 5.0 | 0.55 | 13 | 4 | - | R_VALARJAR |
| `yg_trapper` | Yiğit Tuzakçı | Valarjar Trapper | trash | ranged | Rogue_Hooded 1.0 | 1.0 | 1.2 | 5.8 | 0.5 | 14 | 3 | - | R_BEAST |
| `yg_runecarver` | Rün Oymacısı | Valarjar Runecarver | trash | kick-caster | Mage 1.0 | 1.2 | 1.0 | 4.9 | 0.55 | 12 | 5 | - | R_VALARJAR |
| `yg_tideskorn` | Gelgitkıran Akıncı | Tideskorn Raider | elite | brute | Orc 1.0 | 3.2 | 1.7 | 5.8 | 0.8 | 12 | 7 | 45 | R_DEMON |
| `yg_revel` | Ziyafet Delisi | (Hearth of Revelry vrykul) | trash (swarm) | swarm | Barbarian 0.9 | 0.5 | 0.7 | 6.2 | 0.5 | 9 | 1 | - | R_BEAST |
| **`yg_stag`** (new) | Altın Tüylü Geyik | Gildedfur Stag | trash | charger brute | itch `deer` 1.3 | 2.0 | 1.4 | 8.0 | 0.9 | 12 | 3 | - | R_BEAST |
| **`yg_purifier`** (new) | Yiğit Arındırıcı | Valarjar Purifier | trash | support caster | Rogue 1.0 (tint 0xf0e8c8, `Spellbook_open`) | 1.3 | 0.9 | 5.0 | 0.55 | 13 | 4 | - | R_VALARJAR |

Encounter-only defs (forces 0, `ai.summoned`): `yg_hym_drake`, `yg_valkyr_acolyte`, `yg_worg_summoned` (copy of `yg_worg`), `yg_skovald`, `yg_tideskorn_add` (copy of `yg_tideskorn`), `yg_obliterator`. Specs in §5.

Role mix check: kick-casters (Thundercaller, Runecarver), healers (Mystic, Purifier), brutes (Shieldmaiden, Grizzly, Tideskorn, Stag), swarm (Revel, Worg), elites with a posture bar (Thundercaller, Sentinel, Grizzly, Tideskorn), ranged (Drake, Trapper). The Stag and the Purifier replace members of equal forces inside existing packs, so forces and mob counts did not change (430 / 123).

### 4.2 Abilities (written with the builders of `src/data/enemies.ts`)

Builder signatures: `cone(id,name,range,arcDeg,cd,coef,anim,impact,o)`, `proj(id,name,speed,range,cd,windup,coef,type,vfx,anim,impact,o)`, `aoe(id,name,'ground_aoe'|'self_aoe',radius,range,cd,windup,coef,type,anim,impact,o)`, `line(id,name,length,width,cd,windup,coef,type,anim,impact,o)`, `charge(id,name,length,cd,windup,coef,anim,impact,o)`, `heal(id,name,castTime,cd,pct,anim,impact,o)`, `buff(id,name,castTime,cd,statuses,anim,impact,o)`, `passive(id,name,params)`. `kick: 2` = HIGH interrupt priority, `1` = MED. Cast time > 0 plus `interruptible: true` shows the purple cast bar; "frontal" means a telegraphed cone/line. `followUps: [{ delay, coef, windup, arcDeg? }]` (NEW SP-12) chains extra swings after the first impact; each follow-up shows its own short telegraph. Windup values below were computed from the formula, not tuned by feel.

```ts
// yg_shieldmaiden: frontal + stacking armour break (melee DPS avoid on Fortified)
basic:  cone('yg_sm_bash', 'Kalkan Darbesi', 2.2, 100, 1.8, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.3,
             { windup: 0.70, statuses: [{ status: 'sunder', duration: 8, stacks: 1 }] })              // Zırh Delme: stacks per hit
ability: cone('yg_sm_hew', 'Ölümcül Biçme', 5, 180, 11, 2.2, '1H_Melee_Attack_Chop', 0.4,
             { initialCooldown: 4, windup: 1.00, telegraph: true, parryable: false, sfx: 'swing_heavy',
               statuses: [{ status: 'necrotic', duration: 8, stacks: 4 }] })                          // FRONTAL 180 deg, -12% healing 8 s
ability: charge('yg_sm_rush', 'Kalkan Atılışı', 8, 16, 0.75, 1.2, 'Lunge', 0.55,
             { initialCooldown: 7, statuses: [{ status: 'slow', duration: 3, magnitude: 0.3 }], params: { target: 3, dash: 0.4, minRange: 4 } })   // shield rush at a random player

// yg_thundercaller: the dungeon's must-kick caster, never pull two
basic:  proj('yg_tc_bolt', 'Şimşek Okuyu', 16, 18, 2.6, 0.70, 1.0, 'lightning', 'lightning_projectile', 'Attack', 0.47)
ability: proj('yg_tc_thunderbolt', 'Gök Gürültüsü Okuyu', 18, 20, 9, 2.2, 3.2, 'lightning', 'lightning_projectile', 'Attack', 0.47,
             { initialCooldown: 3, castTime: 2.2, interruptible: true, kick: 2, sfx: 'lightning_cast' })   // INTERRUPT (HIGH), on the tank
ability: aoe('yg_tc_strike', 'Yıldırım Darbesi', 'ground_aoe', 4, 18, 16, 0.83, 1.5, 'lightning', 'Jump', 0.25,
             { initialCooldown: 8, statuses: [{ status: 'stun', duration: 2.0 }], vfx: 'lightning_strike',
               params: { target: 3 } })                                                          // random non-tank, dodge-roll it; a stun chains into the next hit

// yg_sentinel: kill first or pull the others away (its aura gives CC and interrupt immunity); posture 60
basic:  cone('yg_sn_slash', 'Çelik Kılıç', 3.0, 100, 2.2, 1.0, '1H_Melee_Attack_Slice_Diagonal', 0.38,
             { windup: 0.70, followUps: [{ delay: 0.5, coef: 0.8, windup: 0.65, arcDeg: 100 }] })     // 2-hit string, delayed second swing
ability: aoe('yg_sn_pulse', 'Yüklü Nabız', 'self_aoe', 8, 8, 14, 0.90, 1.8, 'lightning', 'Block_Attack', 0.35,
             { initialCooldown: 6, knockback: 6, vfx: 'shockwave', sfx: 'lightning_impact' })
ability: line('yg_sn_crackle', 'Çıtırtı', 14, 2, 9, 0.80, 1.4, 'lightning', '1H_Melee_Attack_Stab', 0.55,
             { initialCooldown: 3, params: { target: 1 } })                                      // lightning line on a random player
ability: buff('yg_sn_light', 'Koruyucu Işık', 1.0, 99, [{ status: 'shield', duration: 8 }], 'Spellcast_Raise', 1.0,
             { interruptible: true, kick: 2, vfx: 'shield_bubble',
               params: { hpBelow: 0.3, once: 1, self: 1, single: 1, shieldPct: 0.25, radius: 1, needAlly: 0 } })   // at 30% HP, INTERRUPT (HIGH)
passive: passive('yg_sentinel_watch', 'Nöbetçinin Bakışı', { radius: 10, interval: 2 })          // NEW handler (SP-6): allies within 10 m get 'inspiring' (3 s) every 2 s; off while staggered

// yg_storm_drake: face it away from the group, defensive per breath
basic:  proj('yg_dr_spit', 'Şimşek Tükürüğü', 18, 18, 2.4, 0.70, 1.0, 'lightning', 'lightning_projectile', 'Punch', 0.33)
ability: line('yg_dr_breath', 'Şimşek Nefesi', 18, 4, 12, 1.05, 2.4, 'lightning', 'Punch', 0.37,
             { initialCooldown: 5, telegraph: true, vfx: 'lightning_strike',
               params: { persist: 8, persistCoef: 0.4, tick: 2 } })                              // leaves a Statik Alan strip for 8 s
ability: aoe('yg_dr_buffet', 'Kanat Savrulması', 'self_aoe', 4, 4, 10, 0.75, 1.2, 'physical', 'Spin', 0.5,
             { initialCooldown: 6, knockback: 4, params: { minTargets: 1 } })                    // only when someone stands within 4 m

// yg_worg: leaps at ranged players
basic:  cone('yg_wg_bite', 'Isırık', 2.0, 90, 1.5, 0.8, 'Bite', 0.47, { windup: 0.65 })
ability: charge('yg_wg_leap', 'Atılış', 12, 9, 0.85, 1.6, 'Lunge', 0.87,
             { initialCooldown: 3, statuses: [bleed(1, 0.2, 6)], params: { target: 3, dash: 0.5, minRange: 5 } })   // keep moving: it lands behind you
passive: passive('yg_wg_pack', 'Sürü Avı', { radius: 10, perStack: 0.05, maxStacks: 5 })     // NEW handler = alias of cult_acolyte_fanatic: +5% damage per worg alive within 10 m

// yg_grizzly: kite only, never tank in melee range of the group; posture 50
basic:  cone('yg_bz_swipe', 'Pençe', 3.2, 110, 2.2, 1.0, 'Swipe', 0.42,
             { windup: 0.70, followUps: [{ delay: 0.45, coef: 0.9, windup: 0.65, arcDeg: 110 }] })   // left, then right
ability: aoe('yg_bz_slam', 'Yer Darbesi', 'self_aoe', 5, 5, 10, 1.00, 2.2, 'physical', 'Slam', 0.77, { initialCooldown: 5, vfx: 'ground_slam' })
ability: charge('yg_bz_maul', 'Ayı Hamlesi', 10, 14, 0.90, 1.8, 'Lunge', 0.7,
             { initialCooldown: 8, statuses: [{ status: 'stun', duration: 1.0 }], params: { target: 3, dash: 0.6, minRange: 4 } })   // maul charge, 1 s knockdown
passive: passive('yg_bz_rage', 'Öfkeli Gümbürtü', { hpBelow: 0.3, atkSpeed: 0.4 })                // NEW handler = alias of forge_demon_rage

// yg_mystic: healer, must be kicked or CC'd; the scorch needs a dispel
basic:  proj('yg_my_bolt', 'Kutsal Ok', 16, 18, 2.4, 0.70, 1.0, 'holy', 'holy_projectile', 'Spellcast_Shoot', 0.3)
ability: heal('yg_my_heal', 'Kutsal Şifa', 2.2, 9, 0.35, 'Spellcast_Raise', 1.0, { kick: 2 })     // INTERRUPT (HIGH)
ability: proj('yg_my_scorch', 'Kutsal Yanık', 18, 20, 14, 0.55, 0.4, 'holy', 'holy_projectile', 'Spellcast_Shoot', 0.3,
             { initialCooldown: 5, statuses: [{ status: 'holy_scorch', duration: 8, stacks: 1 }], params: { target: 1 } })   // DISPEL (NEW status, dispellable, 1.2%/s per stack)
ability: buff('yg_my_ward', 'Kutsal Mühür', 1.5, 15, [{ status: 'shield', duration: 8 }], 'Spellcast_Raise', 1.0,
             { vfx: 'shield_bubble', kick: 1, params: { shieldPct: 0.15, single: 1, radius: 14 } })

// yg_trapper
basic:  proj('yg_tp_bolt', 'Arbalet Oku', 22, 20, 2.4, 0.70, 1.0, 'physical', 'arrow_projectile', '2H_Ranged_Shoot', 0.15, { sfx: 'crossbow_shot' })
ability: aoe('yg_tp_trap', 'Ayı Tuzağı', 'ground_aoe', 1.8, 18, 14, 0.60, 0.6, 'physical', 'Throw', 0.6,
             { initialCooldown: 4, statuses: [{ status: 'bear_snare', duration: 3 }], vfx: 'trap_snap', params: { target: 1 } })   // dispellable root (NEW status); roll out or dispel it
ability: line('yg_tp_pierce', 'Delici Ok', 22, 1.2, 12, 0.85, 1.6, 'physical', '2H_Ranged_Shoot', 0.15,
             { initialCooldown: 6, telegraph: true, sfx: 'crossbow_shot', params: { target: 1, pierce: 1 } })   // aimed line through everything

// yg_runecarver
basic:  proj('yg_rc_bolt', 'Rün Oku', 16, 18, 2.4, 0.70, 1.0, 'lightning', 'lightning_projectile', 'Spellcast_Shoot', 0.3)
ability: proj('yg_rc_chain', 'Zincir Şimşek', 18, 20, 12, 2.0, 1.6, 'lightning', 'chain_lightning', 'Spellcast_Long', 1.55,
             { initialCooldown: 4, castTime: 2.0, interruptible: true, kick: 2,
               projectile: { speed: 18, radius: 0.5, vfx: 'chain_lightning', count: 3, spread: 18 } })   // INTERRUPT (HIGH), spread out
ability: buff('yg_rc_rune', 'Rün Kalkanı', 1.2, 18, [{ status: 'shield', duration: 6 }], 'Spellcast_Raise', 1.0, { params: { shieldPct: 0.12, radius: 12 } })
ability: aoe('yg_rc_mine', 'Rün Mayını', 'ground_aoe', 2.2, 16, 15, 0.75, 1.2, 'lightning', 'Throw', 0.5,
             { initialCooldown: 7, vfx: 'rune_pad_glow', params: { target: 1, fuse: 1.5 } })          // rune lands, detonates 1.5 s later (delayed hit): leave the circle

// yg_tideskorn: fel-touched raiders (Skovald's war party); posture 45
basic:  cone('yg_ts_axe', 'Gelgit Baltası', 3.0, 100, 2.2, 1.0, 'Weapon', 0.45,
             { windup: 0.70, followUps: [{ delay: 0.6, coef: 1.2, windup: 0.75, arcDeg: 100 }] })     // 2-hit string, heavier delayed second swing
ability: charge('yg_ts_rush', 'Alev Hamlesi', 14, 14, 1.05, 2.4, 'Weapon', 0.45,
             { initialCooldown: 5, damage: { coef: 2.4, type: 'fire' }, statuses: [burn(0.3, 4)], vfx: 'fire_burst',
               params: { target: 3, dash: 0.7, minRange: 5 } })                                   // sidestep or hard-CC the windup
ability: cone('yg_ts_scream', 'Yakıcı Çığlık', 8, 90, 12, 2.0, 'Punch', 0.5,
             { initialCooldown: 8, windup: 0.95, telegraph: true, parryable: false, damage: { coef: 2.0, type: 'fire' }, statuses: [burn(0.3, 4)] })   // FRONTAL

// yg_revel: swarm (every 3rd swarm death triggers death affixes, GDD_CONTENT 1.2)
basic:  cone('yg_rv_axe', 'Kupa Darbesi', 1.6, 100, 1.5, 0.6, '1H_Melee_Attack_Chop', 0.4, { windup: 0.60 })
ability: proj('yg_rv_mug', 'Kadeh Fırlatma', 12, 12, 8, 0.58, 0.5, 'physical', 'arrow_projectile', 'Throw', 0.4, { initialCooldown: 3, params: { target: 3 } })
ability: charge('yg_rv_stagger', 'Sarhoş Atılış', 6, 10, 0.65, 0.8, 'Lunge', 0.5, { initialCooldown: 4, params: { target: 3, dash: 0.4, minRange: 2 } })
passive: passive('yg_revel_frenzy', 'Sarhoş Coşku', { radius: 8, perStack: 0.08, maxStacks: 5, duration: 8 })   // NEW handler = alias of cult_acolyte_fanatic

// yg_stag (NEW): the Fields' charger, kite it into the trees
basic:  cone('yg_st_horn', 'Boynuz Darbesi', 2.8, 90, 2.0, 1.0, 'Attack', 0.45, { windup: 0.70 })
ability: charge('yg_st_charge', 'Altın Hücum', 16, 13, 0.95, 2.0, 'Run', 0.9,
             { initialCooldown: 5, knockback: 5, params: { target: 3, dash: 0.8, minRange: 6, stunOnBlock: 1.5 } })   // if it hits a `collide` prop it is stunned 1.5 s: run past a tree
ability: aoe('yg_st_stomp', 'Toynak Darbesi', 'self_aoe', 4, 4, 9, 0.78, 1.3, 'physical', 'Slam', 0.6, { initialCooldown: 4 })

// yg_purifier (NEW): support caster, the fire bowl is the soft kick
basic:  proj('yg_pu_bolt', 'Arınma Oku', 16, 18, 2.4, 0.70, 1.0, 'holy', 'holy_projectile', 'Spellcast_Shoot', 0.3)
ability: aoe('yg_pu_circle', 'Kutsal Çember', 'ground_aoe', 3.2, 18, 14, 0.75, 1.2, 'holy', 'Spellcast_Raise', 0.5,
             { initialCooldown: 5, vfx: 'holy_burst', params: { target: 0, persist: 8, persistCoef: 0.4, tick: 2 } })   // at the TANK's feet, 8 s ground zone: drag the pack out of it
ability: heal('yg_pu_fire', 'Arınma Ateşi', 2.0, 12, 0.18, 'Spellcast_Raise', 1.0, { kick: 1, params: { cleanse: 1 } })   // MED kick, heals 18% and cleanses one debuff
```

NEW enemy-side code (small, all in `src/ai/abilities.ts`): handler `yg_sentinel_watch` (every `interval` s apply `inspiring` for 3 s, replicated, to allied enemies within `radius`, same shape as `frost_knight_aura` but on allies), and alias handlers (`yg_bz_rage` -> `forge_demon_rage` body, `yg_revel_frenzy` and `yg_wg_pack` -> `cult_acolyte_fanatic` body). NEW statuses (StatusDef in `data/statuses.ts`, ids appended to `StatusId`): `holy_scorch` (debuff, dispellable, holy DoT **1.2%** max HP/s per stack, 8 s, max 3 stacks: a full stack costs a quarter of a bar over its duration, enough to need the dispel), `bear_snare` (dispellable root, 3 s: a dispel frees the player at once), `rod_charged` (+8% damage, 6 s, stacks to 3), `mead_sticky` (enemy: -35% move speed, +10% damage taken), `odyn_favor`, `odyn_blessing`, `rune_blessed`, `aegis_ward` (§5). Engine additions by SP: `followUps` (SP-12), `posture` (SP-11), `fuse`, `stunOnBlock` and `minTargets` ability params (all tiny, SP-12).

### 4.3 Packs (31)

Formation: use the spiral offsets of `GDD_CONTENT.layout.json` (first N of `[0.3,0] [-0.38,0.35] [0.06,-0.66] [0.48,0.62] [-0.88,-0.16] [0.83,-0.53] [-0.28,1.03] [-0.53,-1.02] [1.15,0.42] [-1.2,0.49] [0.9,-1.15] [-0.95,-1.0] [0.35,1.6] [-0.4,-1.7]`), melee first, casters and healers last. `PackDef.id` = `yg_pNN`. **Spacing rule (re-run by script for this revision): every pack centre and every patrol segment stays at least 4 tiles (16 m) from every other pack centre and patrol segment, which is more than the longest aggro radius (14 m = 3.5 tiles).** The only exceptions are the west Hearth swarm pair p07/p08 (3.5 tiles, intentionally `linkedTo` each other) and p10/p11 (5 tiles, `linkedTo`). Packs 5 tiles apart or more on the Ephemeral Way and the bridge, so each is a separate pull.

| pack | room | centre (tiles) | members | forces | flags |
|---|---|---|---|---|---|
| `yg_p01` | yuksek_kapi | 6.5, 50.5 | shieldmaiden x2, mystic x1 | 12 | lower yard, first pull |
| `yg_p02` | yuksek_kapi | 14.5, 50.5 | shieldmaiden x2, thundercaller x1 | 14 | kill the Thundercaller first |
| `yg_p03` | yuksek_kapi | 10.5, 46.5 | sentinel x1, trapper x2, mystic x1 | 18 | **patrol** (8.5,46.5) <-> (12.5,46.5): 4 tiles from p01, p02, p04, p05 |
| `yg_p04` | yuksek_kapi | 5.5, 42.5 | storm_drake x2, runecarver x1 | 13 | terrace, `dormant ceiling 15 m` |
| `yg_p05` | yuksek_kapi | 15.5, 42.5 | thundercaller x1, purifier x1, shieldmaiden x1 | 14 | terrace |
| `yg_p06` | k_heymdal | 10.5, 37.5 | storm_drake x2 | 8 | on the Boru Merdiveni, `dormant ceiling 15 m` |
| `yg_p07` | solen_ocagi | 23, 28.5 | revel x8, mystic x1 | 12 | `big`, `linkedTo yg_p08` |
| `yg_p08` | solen_ocagi | 23, 32 | revel x8, shieldmaiden x1 | 12 | `big`, `linkedTo yg_p07` |
| `yg_p09` | solen_ocagi | 30.5, 27.2 | shieldmaiden x2, thundercaller x1, mystic x1 | 18 | 4 tiles from the patrol and from p14 |
| `yg_p10` | solen_ocagi | 35, 28 | revel x6, runecarver x1 | 11 | `big`, `linkedTo yg_p11` |
| `yg_p11` | solen_ocagi | 35.5, 33 | sentinel x1, shieldmaiden x1, purifier x1 | 16 | `linkedTo yg_p10` |
| `yg_p12` | solen_ocagi | 29.5, 31.5 | thundercaller x1, shieldmaiden x2 | 14 | **patrol** (27.5,31.5) <-> (31.5,31.5): 4.3 from p09, 4.5 from p08, 4.9 from p11, 5.3 from p10 |
| `yg_p13` | bal_mahzeni | 43.5, 30 | revel x12, sentinel x1 | 20 | **optional**, swarm-dense, on the flat cellar floor |
| `yg_p14` | k_yukselis | 27.5, 23.5 | shieldmaiden x2, runecarver x1 | 13 | fought on the gallery stairs: Mortal Hew cleaves |
| `yg_p15` | k_av_yolu | 31.5, 36 | worg x4, trapper x1 | 15 | on the trail ramp |
| `yg_p16` | av_meydani | 25, 42 | worg x4, stag x1, trapper x1 | 18 | |
| `yg_p17` | av_meydani | 25, 51 | trapper x3, worg x2 | 15 | |
| `yg_p18` | av_meydani | 31.5, 41 | grizzly x1 | 8 | **optional**, kite |
| `yg_p19` | av_meydani | 40, 40.5 | thundercaller x1, stag x1, worg x2 | 15 | on the lookout hill (1.4 m), archers' post |
| `yg_p20` | av_meydani | 30, 51.5 | grizzly x1 | 8 | **optional**, kite |
| `yg_p21` | av_meydani | 37, 52 | grizzly x1 | 8 | **optional**, kite |
| `yg_p22` | av_meydani | 32, 46.5 | trapper x2, worg x2 | 12 | **patrol** (26,46.5) <-> (38,46.5) |
| `yg_p23` | k_hyrja_dogu | 37.5, 18.5 | shieldmaiden x2, thundercaller x1, mystic x1 | 18 | skip bridge, 2 HIGH kicks |
| `yg_p24` | k_hyrja_dogu | 42.5, 18.5 | tideskorn x1, trapper x2 | 13 | skip bridge, 5 tiles from p23 |
| `yg_p25` | efemer_yol | 51.5, 39.5 | tideskorn x1, shieldmaiden x1 | 11 | warm-up pack |
| `yg_p26` | efemer_yol | 51.5, 34.5 | thundercaller x1, runecarver x2 | 16 | **the kick check: three HIGH casts** (5 tiles from p25 and p27) |
| `yg_p27` | efemer_yol | 51.5, 29.5 | tideskorn x2 | 14 | two Felblaze rushes, two posture bars |
| `yg_p28` | efemer_yol | 51.5, 24.2 | sentinel x1, shieldmaiden x1, purifier x1 | 16 | **patrol** (51.5,23.0) <-> (51.5,25.4), 4.1 tiles from p27 |
| `yg_p29` | rune_mahzeni | 46.5, 24 | runecarver x2, revel x2 | 12 | **optional** |
| `yg_p30` | salon_esigi | 47.5, 19.8 | tideskorn x2, mystic x1 | 18 | Tideskorn camp, west of the stair foot (flat part), 4.3 tiles from the entry |
| `yg_p31` | salon_esigi | 55.5, 19.8 | sentinel x1, thundercaller x1, purifier x1 | 18 | east of the stair foot, last pull before the finale; the power shrine stands between p30 and p31 |

### 4.4 Must-answer checks (the kick/dispel/CC map)

| check | who | counter | priority |
|---|---|---|---|
| Gök Gürültüsü Okuyu (2.2 s) | Thundercaller | interrupt, otherwise the tank loses a third of a bar | HIGH |
| Zincir Şimşek (2.0 s) | Runecarver | interrupt (hits several players) | HIGH |
| Kutsal Şifa (2.2 s) | Mystic | interrupt or stun, otherwise the pack heals 35% | HIGH |
| Koruyucu Işık (1.0 s at 30% HP) | Sentinel | interrupt, otherwise an 8 s absorb shield | HIGH |
| Arınma Ateşi (2.0 s) | Purifier | interrupt (soft: heals 18% and cleanses) | MED |
| Kutsal Mühür (1.5 s) | Mystic | interrupt (soft) | MED |
| Kutsal Yanık (1.2% per stack per second) | Mystic | **dispel** (3 stacks = about 29% of a bar over 8 s) | dispel |
| Ayı Tuzağı (dispellable root 3 s) | Trapper | roll out of the circle or **dispel** the root: a root during a leap or breath is lethal | dodge or dispel |
| Ölümcül Biçme (180 deg frontal, -12% healing) | Shieldmaiden | tank faces them away from the group, melee stay out of the cone | positioning |
| Yıldırım Darbesi (stun) | Thundercaller | roll out of the circle; a stun chained into a breath or leap kills | dodge |
| Rün Mayını (1.5 s fuse) | Runecarver | step out of the circle before it detonates | dodge |
| Alev Hamlesi / Atılış / Ayı Hamlesi / Altın Hücum | Tideskorn / worg / grizzly / stag | sidestep the telegraph; worg leap: ranged keep moving; the stag stuns itself on a tree | dodge |
| Şimşek Nefesi (line + strip) | Storm drake | tank defensive, drake faced away from the group, step off the strip | positioning |
| Nöbetçinin Bakışı (CC and interrupt immunity aura) | Sentinel | kill it first, pull the others out of 10 m, or **break its posture** (the aura is off for 3 s) | priority |
| Öfkeli Gümbürtü (+40% attack speed below 30%) | Grizzly | burst it down from range or keep kiting | tempo |
| Posture break | Sentinel, Grizzly, Tideskorn, Thundercaller | heavy attacks, parries and shield bashes build it: a stagger cancels a cast (a free kick) | stagger |

**Kick plan (HIGH casts per pull).** This replaces the first draft's wording ("two kicks" for p26, "two kicks plus a stun" in §6.4), which disagreed with the pack lists: p26 is a Thundercaller plus two Runecarvers, so it is **three** HIGH casts, the dungeon's kick check on purpose.

| pack | HIGH casts | MED casts | plan |
|---|---|---|---|
| p02, p05, p09, p12, p19 | 1 (Thundercaller) to 2 (with a Mystic) | 0 to 1 | standard 2-kick pulls |
| p23 (bridge) | 2 (Thundercaller, Mystic) | 1 | cut from 3 to 2 by trading one Mystic for a Shieldmaiden in this revision |
| **p26 (causeway)** | **3 (Thundercaller, 2 Runecarvers)** | 0 | three kicks, or two kicks plus a stun or a posture break on the Thundercaller (40 posture, four heavy attacks); the casts are staggered by `initialCooldown` 3 s / 4 s / 4 s |
| p31 (before the finale) | 2 (Thundercaller, Sentinel at 30%) | 1 (Purifier) | save a stun for the Sentinel shield |
| p11, p28 | 1 (Sentinel at 30%) | 1 (Purifier) | light |

The first draft's p11 and p28 carried a Mystic (HIGH heal); swapping them (and p05, p31) for Purifiers keeps the heal pressure without a fifth HIGH cast per pull.
---

## 5. BOSSES (4, the last one a two-stage showpiece)

The original Halls of Valor has five encounters (Hymdall, Hyrja, Fenryr, God-King Skovald, Odyn); this dungeon keeps all five fights but runs Skovald and Odyn as one two-stage finale, which gives **4 bosses** (the user's rule: at least 3, four when the original has four or more). Every boss now has two layers on top of the WoW mechanics: the **WoW layer** (the mechanics players know from the original) and an **Elden layer** (readable windups, delayed swings, 2 to 3 hit strings, a recovery window after the finisher, and a posture bar whose break opens a stagger window; spec in "Posture" below).

| # | id | Turkish name and title | WoW | order | arena (tiles) | hpMult | dmgMult | speed | enrage | posture |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `boss_heymdal` | Heymdal, Gök Kapısı'nın Bekçisi | Hymdall | 1 | heymdal_zirvesi 16 x 14 | 52 | 2.3 | 5.2 | 210 s | 320 |
| 2a | `boss_hirya` | Hirya, Eyra'nın Seçilmişi | Hyrja | 2 | yukselis_koltugu 14 x 14 | 66 | 2.3 | 5.4 | 240 s | 300 |
| 2b | `boss_fenrur` | Fenrür, Sonsuz Av'ın Efendisi | Fenryr | 2 | fenrur_ini 14 x 12 | 62 | 2.5 | 6.2 | 210 s | 280 |
| 3 | `boss_odyn` | Odyn, Yiğitlerin Koruyucusu (stage 1: Tanrı-Kral Skovald) | Skovald + Odyn | 3 | salon_arena 16 x 16 | 82 (+ Skovald 48 as an encounter add) | 2.7 (Skovald 2.6) | 5.4 | 540 s | Skovald 300, Odyn 500 |

`hpMult` follows the rule of thumb of `GDD_CONTENT` §0.3 (about the solo time-to-kill in seconds at par). They are lower than the levelling dungeons' 60/75/120 because every fight here is mechanics-heavy and the dungeon has four of them. All bosses are hard-CC immune with the standard stagger rules (`GDD_CONTENT` §4 intro). Wipe, gate and checkpoint rules are the standard ones (§0.7); the arena rects below are baked in world metres (`cx = (x + w/2) * 4`, `homeX/homeZ` = boss tile centre * 4). Arena floors are flat for every fight (heights in §3.6 are stages at the edge, never fight areas).

### 5.0 Boss kit: what exists and what is new

**EXISTS** (all in `src/ai/bosses/kit.ts` and `BossController`, host only): shapes `circle`, `ring`, `beam`, `band`, `wedge`, `zone` (lingering), `dashLine`; `ringPoints`, `statusPlayer`, `pickPlayers(c, n, avoidTank)`, `playersIn(c, x, z, r)`, `farthestPlayer`, `every`, `floatOver`, `spawnMech`, `makeInvulnerable`, `partyHp`, `trapPlayer`; `ShapeOpts` (`follow`, `sourceId`, `knockback`, `statuses`, `persist {duration, tick}`, `kind 'soak'|'safe'`, `perilous`, `vfxOnLand`); controller methods `c.shape`, `c.schedule(t, fn, tag)`, `c.cancelTimers(tag)`, `c.spawnAdds`, `c.adds(tag)`, `c.setImmune`, `c.freeze`, `c.teleport`, `c.dash`, `c.moveOverride`, `c.goTo`, `c.endMechanicPhase`, `c.cdOverride`, `c.dmgMul`, `c.atkMul`, `c.gdd(x, z)`, `c.randomPoint`, `c.forceAbility`, `c.arena`, `c.state`, `c.track`; phase pattern with immune mechanic phases (`zakhar_ritual`); soak circle resolved by the host (`zakhar_seals`, `ignaroth_meteor`); follow marks (`tugrul_frost_mark`); fixation (`akpence_charge`); breath band with pillar shadows (`buzul.ts startBreath`); rotating lines (`ignaroth_flame_walls`); random-circle rain (`zakhar_hellrain`); leap (`curukkok_jump`).

**NEW primitives needed (shared across the 8 dungeons, specs in §8.1):**

| id | what | used here by |
|---|---|---|
| SP-3a `breathBand` | `breathBand(c, from, dir, len, width, delay, coef, { cover: Pt[], coverRadius, type, statuses, persist, name, cap?: { tag, max } })`: the buzul breath band moved into `kit.ts`; splits the band around cover points into exposed damage rects and green `safe` display rects (cancelled just before landing). `cap` limits the number of live persistent strips for a tag: the oldest expires first. | Heymdal (drake breath) |
| SP-3b `roamingOrb` | `roamingOrb(c, { x, z, dir: radians \| 'seek', speed, life, r, coef, type, statuses?, once?, fx?, name })` plus `updateOrbs(c, dt)` and `clearOrbs(c)`: a moving hazard that stamps a 0.4 s non-telegraphed circle at its position every 0.4 s, optional 'seek' steering toward the nearest player (turn rate 90 deg/s), `once` = one hit per player per orb. | Heymdal (Yıldırım Küresi), Hirya (Kutsal Küreler), Odyn (Parlayan Parçalar) |
| SP-3c `markPlayers` | `markPlayers(c, players, { delay, r, coef, type, name, toast, beamTo?: (p) => Pt \| null, onExpire? })`: `follow` ring/circle marks, a toast to the marked player, optional `bossFx` beam from the player to a point. Generalises `tugrul_frost_mark` and Nefris's circle. | Hirya (Ark Şimşeği, Arınma Patlaması), Odyn (Rünik Damga beams) |
| SP-3d `soakPad` | `soakPad(c, pos, r, delay, { need, name, onResolve(inside), display })`: yellow `soak` telegraph (display only, cancelled just before landing) plus a host `playersIn` check at expiry. Generalises `zakhar_seals` and `ignaroth_meteor`. | Odyn (rune pads), Aegis pedestal |
| SP-3e `fixate` | `fixate(c, target, { seconds, speed, catchR, onCatch })`: a `moveOverride` chase that ends on catch or timeout, with `curse_loop` and toast. | Fenrür (Kan Kokusu) |
| SP-4 `lockLimit`, `encounterAdd` | `BossScript.lockLimit?: number` (the `phaseLocked` safety net in `BossController.fightFrame` waits `lockLimit ?? 150` s; Odyn stage 1 needs 420). `encounterAdd(c, defId, pos, { hpMult, tag })`: `spawnAdds` wrapper that multiplies `hpMult` by `partyHp(c)` and, for boss-class encounter adds, by the Tyrannical factor (see SP-5), plus `addDash(add, dx, dz, dist, dur)` which sets `add.forcedMove` exactly like `BossController.dash`. | Odyn stage 1 (Skovald) |
| SP-5 `miniboss` rule | In `MythicPlus`/`Affixes`: `rank 'miniboss'` and adds spawned through `encounterAdd` with `tag 'encounter_boss'` take Tyrannical (+30% HP, +15% damage) and NOT Fortified. | Skovald |
| **SP-11 `posture`** | `EnemyDef.posture?: { max, regen, regenDelay, breakSec, immuneSec, dmgTaken }` and `BossScript.posture` (same shape) plus `BossScript.onStagger?(c)`. Player damage events carry a `postureDmg` (light 3, heavy 10, parry or perfect block 25, shield bash 25, riposte 0). Break: current windup or cast cancelled (`c.cancelTimers('ability')`, scripted mechanic phases and immune states cannot be staggered), `dmgTaken` 1.3 for `breakSec`, a cooldown push of +2.5 s on every ability, a posture bar over the nameplate (white, fills, flashes on break). | all four bosses, four elite trash types |
| **SP-12 `comboString`** | `comboString(c, steps)` in `kit.ts`: `steps = [{ at, shape, windup, coef, hold?, lunge? }]` scheduled with `c.schedule`; each step draws its own telegraph (cone, line or circle), an optional `lunge` is a `c.dash`, an optional `hold` is the delayed-swing pause (blade glints, the telegraph is not drawn until the hold ends); a final `recover` window flags the boss as `vulnerable` (+15% damage taken, posture damage x1.5). Also `AbilityDef.followUps` for trash (§4.2). | Heymdal, Hirya, Fenrür, Skovald, Odyn |

**Posture (boss version).** Defaults: `regen 6/s`, `regenDelay 4 s`, `breakSec 4` (Fenrür 5, Odyn 5), `immuneSec 20`, `dmgTaken 1.3`. A par 5-man group deals about 30 posture per second, so a bar of 300 breaks in about 12 s, then 4 s of stagger and 20 s of immunity: 2 to 4 breaks per 100 s fight. Stagger never works during mechanic phases (Fenrür's retreats, Odyn's stage 1 hold). Each boss has a **signature break reward** (below) that rewards a planned break over a random one. The extra damage during a break shortens fights by about 6 to 10 s at par; this is left as buffer in §6.2, not subtracted.

**Odyn's Favor and Blessing hook (shared by Hirya and Fenrür).** `grantOdynBuff(c)` in `valor_a.ts` (exported, imported by `valor_b.ts`), called from both scripts' `onDeath`: it counts the fork bosses already in `G.mplus.state.bossesKilled` (EXISTS; outside M+ use the same list kept by the dungeon scene). None yet = the first fork boss: `statusPlayer(p, 'odyn_favor', 75)` to every player in the dungeon; one already dead = the second: `statusPlayer(p, 'odyn_blessing', 60)`.

**Statuses (NEW, `data/statuses.ts` + append to `StatusId`):** `odyn_favor` (+40% move speed), `odyn_blessing` (+70% move speed), `rune_blessed` (+30% damage, +25% move speed, 20 s), `aegis_ward` (-75% damage taken, 0.8 s, refreshed by the script), `holy_scorch`, `bear_snare`, `rod_charged`, `mead_sticky` (§4). Fallback while the defs do not exist: `'haste'`, `'empower'`, `'shield'`, `'fortify'`.

### 5.1 Boss 1: Heymdal, Gök Kapısı'nın Bekçisi (`boss_heymdal`)

**Look.** An iron-and-gold vrykul gatekeeper: `Knight` at scale 2.05, tint 0xd8c890, `2H_Sword`, winged helm, cape, eyes glowing 0x80c0ff. Arena: a round dais with the Gjallar horn on the north rim and four lightning rods (cover) at tile (4.5, 27), (14.5, 27), (4.5, 32.5), (14.5, 32.5) (`HEY_PILLARS`, same list in the room props and in the script). The arena is open to the storm: ceiling-less, sky overhead, three 0.4 m steps from lip to dais that never matter in the fight.

```ts
boss({
  id: 'boss_heymdal', name: 'Heymdal', title: "Gök Kapısı'nın Bekçisi", model: CHAR('Knight'), scale: 2.05, tint: 0xd8c890, role: 'melee',
  hp: 52, dmg: 2.3, speed: 5.2, radius: 1.3, enrage: 210, arenaR: 30, loot: 'loot_yg_b1',
  anims: { ...A_KAYKIT, idle: '2H_Melee_Idle', death: 'Death_B' }, resist: { lightning: 0.75, physical: 0.1, shadow: -0.1 },
  visual: { hide: KNIGHT_HIDE.filter((n) => !['2H_Sword', 'Knight_Cape'].includes(n)), attach: [HELM_WINGS],   // Knight_Helmet stays hidden: the winged helm replaces it
            runRef: 7, eyeEmissive: 0x80c0ff, glow: 0x80b0ff },
  posture: { max: 320, regen: 6, regenDelay: 4, breakSec: 4, immuneSec: 20, dmgTaken: 1.3 },          // NEW SP-11
  basic: cone('hym_slash', 'Yiğit Kılıcı', 4.5, 100, 2.4, 1.0, '2H_Melee_Attack_Slice', 0.4, { windup: 0.7, telegraph: true }),
  abilities: [
    cone('hym_sweep', 'Kanlı Süpürme', 8, 110, 12, 3.6, '2H_Melee_Attack_Chop', 0.72,
         { initialCooldown: 7, windup: 1.2, telegraph: true, tankBuster: true, parryable: false, sfx: 'boss_cast',
           statuses: [bleed(1, 0.3, 4), { status: 'necrotic', duration: 8, stacks: 8 }] }),
    custom('hym_combo', 'Gök Kapısı Üçlemesi', 7, 16, 0.75, '2H_Melee_Attack_Slice', { initialCooldown: 4, sfx: 'swing_heavy', params: { impact: 0.5 } }),   // Elden layer: 3-hit string
    custom('hym_leap', 'Kapı Çarpması', 16, 24, 0.9, 'Jump', { initialCooldown: 18, sfx: 'boss_cast', params: { impact: 0.6 } }),                      // Elden layer: leap + delayed quake, P2 on
    custom('hym_blade', 'Dans Eden Bıçak', 14, 5, 1.0, 'Throw', { sfx: 'dagger_throw', params: { impact: 0.5 } }),
    custom('hym_horn', 'Gökgürültüsü Borusu', 34, 12, 2.5, 'Cheer', { sfx: 'hero_horn', params: { impact: 1.0 } }),
    custom('hym_orbs', 'Yıldırım Küresi', 99, 9999, 1.0, 'Taunt', { sfx: 'lightning_cast' }),     // fired by update() after a breath, phase 3 only
    custom('hym_storm_call', 'Fırtına Çağrısı', 999, 9999, 1.0, 'Taunt', { sfx: 'boss_roar' }),   // phase 2 onEnter
    custom('hym_wrath', 'Fırtına Gazabı', 999, 9999, 1.0, 'Taunt', { sfx: 'boss_roar' }),         // phase 3 onEnter
  ],
  phases: [
    bp('p1', 1.01, ['hym_sweep', 'hym_combo', 'hym_blade', 'hym_horn']),
    bp('p2', 0.7, ['hym_sweep', 'hym_combo', 'hym_leap', 'hym_blade', 'hym_horn'], { yell: 'Gökler öfkelensin!', ability: 'hym_storm_call' }),
    bp('p3', 0.4, ['hym_sweep', 'hym_combo', 'hym_leap', 'hym_blade', 'hym_horn'], { yell: 'Fırtına sizi parçalasın!', ability: 'hym_wrath' }),
  ],
  intro: 'Bu kapıdan yalnızca layık olanlar geçer!', death: 'Kapı... sizin için açıldı...',
  arena: { cx: 40, cz: 116, w: 64, h: 56, homeX: 40, homeZ: 106 },
});
// BossPlacement: bossAt('boss_heymdal', 'heymdal_zirvesi', 9.5, 26, 0, 1)
```

**WoW layer: timeline (`BossScript` entries).** Times from the pull at +10 par, all damage coefs before the M+ curve.

| t (s) | ability | cast / windup | shape and damage | kit |
|---|---|---|---|---|
| basic every 2.4 | Yiğit Kılıcı | 0.7 | cone 4.5 m, coef 1.0 | EXISTS (generic) |
| 5, then 14 | Dans Eden Bıçak (`hym_blade`) | 1.0 | a blade at a random non-tank: telegraph circle r 3 for 1.2 s (coef 0.8), then a persistent spinning zone r 3 for 12 s, tick 2 s, coef 0.7. Phase 3: two blades per cast. The zones pile up, so the group must keep moving. | EXISTS: `circle` + `zone` + `bossFx('dagger_projectile')` |
| 7, then 12 | Kanlı Süpürme (`hym_sweep`) | 1.2 | tank buster cone 8 m / 110 deg, coef 3.6, bleed 4 s, 8 stacks of `necrotic` (-24% healing, 8 s). Frontal. | EXISTS (generic cone) |
| 12, then 34 (28 in P2, 24 in P3) | Gökgürültüsü Borusu (`hym_horn`) | 2.5 (not interruptible, but a **posture break cancels it** and its wave; it returns 6 s later) | room-wide pulse coef 1.2 (unavoidable raid damage) and a wave of drakes: `n = min(1 + hornCount, 4)` `yg_hym_drake` (2 on the first horn). | EXISTS (`circle` r = arena + 8, `spawnAdds`) |
| every 10-12 per drake (staggered by drake index) | Şimşek Nefesi (drake) | 1.8 telegraph | each drake picks a random player and breathes a band 40 x 5 m (coef 2.2 lightning). Pillars cast safe shadows. The exposed band then stays as a **Statik Alan** strip for **8 s** (tick 2 s, coef 0.5); **at most 4 strips exist at once, the oldest expires first**. | **NEW SP-3a** (pattern EXISTS: `buzul.ts`) |
| after each breath, P3 only | Yıldırım Küresi (`hym_orbs`) | n/a | 2 orbs spawn at the strip's far end and seek the nearest player: speed 3.2 m/s, life 10 s, r 1.3, coef 1.6, one hit per player per orb | **NEW SP-3b** |
| 70% | Fırtına Çağrısı | n/a | phase 2: horn cd 28 s, drake count +1 | EXISTS (`onEnter.ability`) |
| 40% | Fırtına Gazabı | n/a | phase 3: horn cd 24 s, blades x2, orbs on, `dmgMul x1.15`, 120 ms hit-stop and shake | EXISTS (`c.dmgMul`) |

**Strip and drake budget (re-checked for this revision).** A band is 40 x 5 m = 200 m2. The first draft let every drake breathe every 7 to 9 s and kept each strip 15 s: with 3 to 4 drakes that is 5 to 9 live strips (30 to 50% of the 3584 m2 floor) on top of blades, orbs and the pulse. Now each drake breathes every 10 to 12 s, a strip lasts 8 s and four strips is the cap: at most 800 m2 (22% of the floor), about 2.9 live on average with 4 drakes, and the dead drake's strip still stays only for its 8 s. Drakes are `hpMult 1.2 * partyHp(c)` (was 3): 1.2 x 1.52 = 1.8 s of full party DPS each, 13 drakes over the fight (waves of 2, 3, 4, 4 at the horns of 12, 46, 74 and 98 s) = about 24 s, which is exactly the 79 s to 103 s gap of the §6.2 "1.3 x downtime" factor, so the **1:43 kill time stands with kill-the-drakes-first**.

**Drake behaviour (script `update`).** `c.adds('drake')` are killable flying adds (EnemyDef `yg_hym_drake`: `Dragon_Evolved` 0.75, tint 0x88b0ff, emissive 0x3050ff, `flying`, hover 4.5, `ai.summoned`, no basic attack, `hpMult 1.2 * partyHp(c)`, 0 forces). The script circles them at radius 24 m around the arena centre at 8 m/s, copying the `updateDragon` position/yaw code of `buzul.ts`. Each drake keeps its own breath timer (staggered by index); it holds its position for the 1.8 s telegraph. Cap 5 alive. Killing a drake does not remove the strip it left.

**Arena props = script constants.** `HEY_PILLARS` (4 lightning rods) are `collide` props and also the cover list for `breathBand` (`coverRadius 1.0`). Do not move one without the other.

**Elden layer.** Heymdal fights like a gatekeeper duelist: slow, readable, and punishing for greed.

| ability | when | string | windups and delays | recovery / punish window | counterplay |
|---|---|---|---|---|---|
| **Gök Kapısı Üçlemesi** (`hym_combo`) | 4 s, then every 16 s, at the tank | 3 hits | hit 1 **Yiğit Kesiği**: cone 5 m / 100 deg, windup 0.75 s, coef 1.2. Hit 2 **Çapraz Kesik**: 0.55 s after hit 1, cone 5 m / 110 deg, windup 0.6 s, coef 1.4, parryable. Hit 3 **Kapı Düşüşü**: after a **1.0 s hold** (sword raised, white-gold glint, no telegraph), overhead slam circle r 5 centred 3.5 m in front, windup 0.5 s, coef 2.6, knockback 5, not parryable | after hit 3 he is stuck 1.4 s (`vulnerable`: +15% damage taken, posture damage x1.5) | parry hit 2 (+25 posture), roll through hit 3 on the late beat, then punish the 1.4 s window; the tank defensive goes on hit 3, not hit 1 |
| **Kapı Çarpması** (`hym_leap`) | phase 2 on: 18 s, then every 24 s, at a random non-tank | leap + quake | windup 0.9 s, shadow circle r 4.5 at the target, coef 3.0; **1.5 s later** a shockwave ring r 8 (inner safe r 3), coef 1.2 | lands and kneels 1.0 s | step out of the circle, then step INTO the ring's safe middle or roll the ring |

**Posture 320, break 4 s.** Signature reward: a break during the horn cast cancels the horn and its drake wave (the horn returns 6 s later). Breaking during Kapı Düşüşü's hold ends the string. During the break Heymdal kneels and drops his guard (`dmgTaken` 1.3); his drakes keep breathing, so the right moment is the moment after a wave is dead.

**Duties.** Tank: face the sweep away from the group, use a defensive on every second sweep and on every Kapı Düşüşü (the necrotic stacks cut healing), parry the combo's second swing, hold the boss near the centre so the blade zones stay at the edge. Healers: the horn pulse every 24-34 s plus static strips plus bleed; pressure is steady chip damage, not a single big hit. DPS: kill the drakes first (they are the breath source), stand behind a lightning rod when a band is telegraphed, leave blade zones before they pile up, never stand in a strip, stack posture before a horn. No interrupts.

**Enrage 210 s.** The standard `BossController` enrage (damage x1.5, then +12% every 8 s); `GDD_CONTENT` §4 words it as a wipe, the code is softer, both are fine here.

### 5.2 Boss 2a: Hirya, Eyra'nın Seçilmişi (`boss_hirya`)

**Look.** A winged valkyr: `Mage` scale 1.75, tint 0xf4e8b8, wand, wings (`valor_wings` on `chest`), glow 0xfff0b0. Arena: round Titan chamber (ceiling 26 m, skylight) with **Solsten** (thunder, west) at tile (23.5, 14.5) and **Olmyr** (holy, east) at (31.5, 14.5), 32 m apart; she spawns between them at (27.5, 13), at neutral distance. The floor is flat at 6.2 m with a 0.4 m gold ring dais.

```ts
boss({
  id: 'boss_hirya', name: 'Hirya', title: "Eyra'nın Seçilmişi", model: CHAR('Mage'), scale: 1.75, tint: 0xf4e8b8, role: 'caster',
  hp: 66, dmg: 2.3, speed: 5.4, radius: 1.1, enrage: 240, arenaR: 28, loot: 'loot_yg_b2',
  anims: { ...A_KAYKIT, death: 'Death_B' }, resist: { lightning: 0.9, holy: 0.9, physical: 0.05 },
  visual: { hide: mageHide('1H_Wand'), attach: [WINGS], runRef: 7, eyeEmissive: 0xfff0b0, glow: 0xfff0b0 },
  posture: { max: 300, regen: 6, regenDelay: 4, breakSec: 4, immuneSec: 20, dmgTaken: 1.3 },          // NEW SP-11
  basic: proj('hir_bolt', 'Kutsal Mızrak', 22, 24, 2.2, 0.8, 1.0, 'holy', 'holy_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    line('hir_shield', 'Işık Kalkanı', 16, 3, 14, 1.3, 3.4, 'holy', 'Spellcast_Long', 1.0,
         { initialCooldown: 8, telegraph: true, tankBuster: true, parryable: false, knockback: 8, sfx: 'boss_cast' }),
    custom('hir_spear', 'Çifte Mızrak', 14, 10, 0.7, 'Spellcast_Shoot', { initialCooldown: 5, sfx: 'spell_cast', params: { impact: 0.5 } }),     // Elden layer: 3-hit spear string
    custom('hir_dive', 'Valkyr Dalışı', 24, 22, 1.0, 'Spellcast_Summon', { initialCooldown: 16, sfx: 'choir_sting', params: { impact: 0.8 } }),  // Elden layer: aerial dive
    custom('hir_arcing', 'Ark Şimşeği', 20, 12, 1.0, 'Spellcast_Raise', { sfx: 'lightning_cast', params: { impact: 0.6 } }),
    custom('hir_eye', 'Fırtına Gözü', 32, 18, 3.0, 'Spellcast_Long', { castTime: 3.0, interruptible: false, sfx: 'boss_cast', params: { impact: 1.0 } }),
    custom('hir_sanctify', 'Kutsal Küreler', 24, 14, 1.2, 'Spellcast_Raise', { sfx: 'spell_cast', params: { impact: 0.7 } }),
    custom('hir_expel', 'Arınma Patlaması', 18, 10, 1.0, 'Spellcast_Raise', { sfx: 'spell_cast', params: { impact: 0.6 } }),
    custom('hir_call', 'Valkyr Çağrısı', 30, 9999, 1.2, 'Spellcast_Summon', { sfx: 'choir_sting' }),    // phase 2 onEnter, then repeated by the script
  ],
  phases: [
    bp('p1', 1.01, ['hir_shield', 'hir_spear', 'hir_dive', 'hir_arcing', 'hir_eye', 'hir_sanctify', 'hir_expel']),
    bp('p2', 0.5, ['hir_shield', 'hir_spear', 'hir_dive', 'hir_arcing', 'hir_eye', 'hir_sanctify', 'hir_expel'], { yell: 'Eyra, bana güç ver!', ability: 'hir_call' }),
  ],
  intro: 'Yükseliş koltuğuna layık mısınız?', death: 'Eyra... beni... çağırıyor...',
  arena: { cx: 112, cz: 60, w: 56, h: 56, homeX: 112, homeZ: 54 },
});
// BossPlacement: bossAt('boss_hirya', 'yukselis_koltugu', 27.5, 13, 0, 2)
```

**The pillar mechanic (WoW layer, script `update`, host).** `c.state.T` and `c.state.H` are Thunder and Holy stacks (0 to 6). Every 0.25 s the script measures the distance from Hirya to each pillar (`c.gdd(23.5, 14.5)` and `c.gdd(31.5, 14.5)`). Within 8 m of Solsten she gains a Thunder stack every 4 s, within 8 m of Olmyr a Holy stack every 4 s. Away from both she loses one stack of each type every 4 s. `c.dmgMul = 1 + 0.1 * (T + H)`; a `floatOver(e, 'GÖK x3')` or `'IŞIK x2'` shows the count. **Gating (`usable`)**: `hir_arcing` and `hir_eye` need `T >= 1`; `hir_sanctify` and `hir_expel` need `H >= 1`; the Light Shield, the spear string, the dive, the basic and the Valkyr call are always usable. Consequence: the tank chooses the fight. At the centre she has no stacks and uses only her base kit (low damage, low DPS pressure but the group cannot burn her any faster either); near a pillar she is stronger and unlocks that school; swapping between pillars flips the school while the old stacks decay. Well-geared groups can burn her on one pillar without swapping.

| t (s) | ability | cast / windup | mechanic | kit |
|---|---|---|---|---|
| basic every 2.2 | Kutsal Mızrak | 0.8 | projectile at the tank, coef 1.0 | EXISTS |
| 8, then 14 | Işık Kalkanı | 1.3 | tank buster line 16 x 3 m, coef 3.4 holy, knockback 8 m; nobody else stands in front of her | EXISTS (generic line) |
| 12, then 20 (needs T) | Ark Şimşeği | 1.0 + 2.4 mark | marks up to 4 non-tanks (all non-tanks if fewer): `follow` circle r 4 on each, coef 2.0 lightning, toast "Ark Şimşeği! Dağılın!". Players standing within 4 m of each other take both circles: that is the spread check. | EXISTS (`circle follow`, `pickPlayers`); NEW SP-3c to share |
| 18, then 32 (needs T) | Fırtına Gözü | 3.0 (not interruptible, but a **posture break cancels the channel**) | she stops (`freeze`), 9 s storm: ring inner r 4.5 / outer 70 m, coef 0.65 lightning every 1.5 s, plus a weak inner circle r 4.5 with coef `0.10 + 0.012 * max(0, keyLevel - 2)`. Hug her. The bubble weakens with the key level (WoW hotfix behaviour). | EXISTS (`ring` + `circle` with `persist`, like `kevvas_roar` plus persistence) |
| 14, then 24 (needs H) | Kutsal Küreler | 1.2 | 6 orbs leave Olmyr in six directions (8 in phase 2): speed 4.5 m/s, life 9 s, r 1.4, coef 1.8 holy, one hit per player per orb | **NEW SP-3b** |
| 10, then 18 (needs H) | Arınma Patlaması | 1.0 + 4.0 mark | marks one non-tank: `follow` circle r 8, coef 3.0 holy to everyone inside after 4 s. Run away from the group. | EXISTS (`circle follow`) |
| 50% | Valkyr Çağrısı | 1.2 | 2 `yg_valkyr_acolyte` adds appear at the pillars, repeated every 30 s while fewer than 4 live. Each casts `yg_val_mend` (2.0 s, interruptible, kick HIGH) healing Hirya 6% of her max HP. | EXISTS (`spawnAdds`, `heal` builder) |

`yg_valkyr_acolyte`: `Mage` tint 0xf8f0c8, role caster, `hpMult 2.5 * partyHp(c)`, `ai.summoned`, basic holy bolt, `heal('yg_val_mend', 'Kutsal Onarım', 2.0, 9, 0.06, 'Spellcast_Raise', 1.0, { range: 30, kick: 2 })`.

**Elden layer.** Hirya is the fast, aerial fighter: she wounds with a spear string and then drops out of the sky.

| ability | when | string | windups and delays | recovery / punish window | counterplay |
|---|---|---|---|---|---|
| **Çifte Mızrak** (`hir_spear`) | 5 s, then every 10 s, at the tank | 3 hits | hit 1: line 12 x 2.2 m, windup 0.7 s, coef 1.1. Hit 2: **0.45 s** later, line 12 x 2.2 m, windup 0.6 s, coef 1.1 (parryable). Hit 3 **Işık Rıhtımı**: after a **0.9 s hold** (the spear glows white-gold), line 14 x 3 m, windup 0.5 s, coef 2.6, knockback 6 | 1.2 s `vulnerable` after hit 3 | parry hit 2, roll the third line sideways, punish the 1.2 s window; other players are never in the line because it follows the tank |
| **Valkyr Dalışı** (`hir_dive`) | 16 s, then every 22 s, at a random non-tank | aerial dive | she lifts off (untargetable 1.0 s at 5 m), telegraph line 24 x 3 m for **1.4 s**, then dives along it: coef 1.4 on the line, landing circle r 4.5 coef 2.0 | she is grounded 2.5 s (`vulnerable`, posture damage x1.5) | roll out of the line and the circle; the marked player runs AWAY from the pillars so the landing spot is neutral |

**Posture 300, break 4 s.** Signature reward ("Kanatlar Kırıldı"): a break strips Hirya of all Thunder and Holy stacks at once (back to the plain kit) and cancels a Fırtına Gözü channel in progress, so the group can burn a stack-heavy Hirya down on purpose. The break also ends a dive early (she crashes from the air).

**Duties.** Tank: drag her between pillars on purpose, face the Light Shield and the spear's third line away from the group, parry the second thrust. Healers: Eye of the Storm raid damage and Expel. DPS: spread for Arcing Bolt (non-melee mark), dodge the orbs and the dive line, build posture for the break, kill or kick the acolytes. Interrupts: only the acolytes' heals. **On death:** `grantOdynBuff(c)` (above). **Enrage 240 s.**

### 5.3 Boss 2b: Fenrür, Sonsuz Av'ın Efendisi (`boss_fenrur`)

**Look.** The apex worg: `gen/creatures/wolf_dire` scale 2.3, tint 0x5a2e2e, red eyes. Arena: the den, 56 x 48 m (cave dome 14 m) with five stumps (kiting obstacles) and a cave-ledge pocket in the north-east at tile (55.2, 44.2), 1.2 m above the floor, where he retreats.

```ts
boss({
  id: 'boss_fenrur', name: 'Fenrür', title: "Sonsuz Av'ın Efendisi", model: GEN('wolf_dire'), scale: 2.3, tint: 0x5a2e2e, role: 'melee',
  hp: 62, dmg: 2.5, speed: 6.2, radius: 1.5, enrage: 210, arenaR: 26, loot: 'loot_yg_b3',
  anims: A_GEN, resist: { physical: 0.05, frost: 0.1 }, visual: { eyeEmissive: 0xff3030, emissiveIntensity: 0.3, runRef: 6.2 },
  posture: { max: 280, regen: 6, regenDelay: 4, breakSec: 5, immuneSec: 20, dmgTaken: 1.3 },          // NEW SP-11
  basic: cone('fen_bite', 'Parçalayan Isırık', 4.5, 110, 2.2, 1.0, 'Attack', 0.45, { windup: 0.7, telegraph: true, statuses: [bleed(1, 0.2, 6)] }),
  abilities: [
    custom('fen_string', 'Av Üçlüsü', 14, 11, 0.6, 'Attack', { initialCooldown: 5, sfx: 'boss_cast', params: { impact: 0.45 } }),         // Elden layer: 3-hit string
    custom('fen_frenzy', 'Pençe Çılgınlığı', 16, 9, 1.2, 'Attack', { sfx: 'boss_cast', params: { impact: 0.45 } }),
    custom('fen_howl', 'Sessiz Uluma', 24, 14, 1.4, 'Attack', { sfx: 'wolf_howl', params: { impact: 0.5 } }),
    custom('fen_leap', 'Çifte Atılış', 14, 6, 1.2, 'Attack', { sfx: 'boss_cast', params: { impact: 0.4 } }),                            // two leaps: a random non-tank, then the tank
    custom('fen_scent', 'Kan Kokusu', 28, 20, 1.0, 'Attack', { sfx: 'boss_roar' }),
    custom('fen_retreat', 'İne Çekilme', 999, 9999, 1.0, 'Attack', { sfx: 'wolf_howl' }),            // mechanic phase, onEnter only
  ],
  phases: [
    bp('p1', 1.01, ['fen_string', 'fen_frenzy', 'fen_howl', 'fen_leap']),
    bp('p2', 0.6, [], { yell: 'Av başlıyor!', ability: 'fen_retreat' }),                            // mechanic phase 1
    bp('p3', 0.599, ['fen_string', 'fen_frenzy', 'fen_howl', 'fen_leap', 'fen_scent']),
    bp('p4', 0.3, [], { yell: 'SÜRÜ! BANA GELİN!', ability: 'fen_retreat' }),                       // mechanic phase 2
    bp('p5', 0.299, ['fen_string', 'fen_frenzy', 'fen_howl', 'fen_leap', 'fen_scent']),
  ],
  intro: 'Kokunuzu aldım... yiğitler!', death: 'Av... bitti...',
  arena: { cx: 204, cz: 192, w: 56, h: 48, homeX: 204, homeZ: 190 },
});
// BossPlacement: bossAt('boss_fenrur', 'fenrur_ini', 50.5, 47, -90, 2)
```

**WoW layer.**

| t (s) | ability | cast / windup | mechanic | kit |
|---|---|---|---|---|
| basic every 2.2 | Parçalayan Isırık | 0.7 | cone 4.5 m, coef 1.0 + bleed 6 s | EXISTS |
| 9, then 16 | Pençe Çılgınlığı | 1.2 telegraph, then 3 s | he stops (`freeze`); circle r 9 around him, 4 ticks every 0.75 s, coef 0.75 each, damage type `'true'` (ignores armour). Melee share it, ranged stay out. A **posture break cancels it**. | EXISTS (`circle follow` + `c.schedule` ticks) |
| 14, then 24 | Sessiz Uluma | 1.4 | silences every player in the arena for 3 s (`statusPlayer(p, 'silence', 3)`); `wolf_howl` SFX | EXISTS |
| 6, then 14 | Çifte Atılış (`fen_leap`) | 1.2 | **leap 1** at a random non-tank: circle r 5 at the target, coef 3.0 + bleed 8 s; do not stand next to the target. **1.0 s after landing**, **leap 2** onto the tank: frontal cone 6 m / 120 deg, windup 0.7 s, coef 2.2 (the delayed follow-up) | EXISTS (`curukkok_jump` pattern: telegraph, `c.dash`, `leap_land`) + SP-12 for the chained second leap |
| 60% | İne Çekilme (mechanic phase 1) | 18 s | he runs to the cave ledge, is immune and held; 4 `yg_worg_summoned` arrive one every 1.5 s. When the phase ends (18 s, or all pups dead after 8 s) each worg still alive within 10 m of him gives him `+15%` damage (max 3, `c.dmgMul *= 1.15^n`) and he leaps back at the tank. Kill or kite the pups far from him. | EXISTS (`setImmune`, `freeze`, `teleport`, `endMechanicPhase`; model: `zakhar_ritual`) |
| 20, then 28 (after 60%) | Kan Kokusu | 1.0 | fixates a random non-tank for 6 s; he chases at 6.6 m/s (the player runs 7); if he catches them: circle r 3, coef 4.5, knockdown 1.5 s, bleed 2 stacks 8 s. Everyone else keeps their distance. A **posture break ends the fixation** (he trips, 2 s of the 5 s break is a free tumble). | **NEW SP-3e** (pattern EXISTS: `akpence_charge` fixation + `c.moveOverride`) |
| 30% | İne Çekilme (mechanic phase 2) | 18 s | same as phase 1 with 5 pups | EXISTS |
| below 15% | soft enrage | n/a | `dmgMul x1.05` every 5 s | EXISTS (`every`) |

`yg_worg_summoned` = copy of `yg_worg` with `forces 0`, `ai.summoned`.

**Elden layer.** Fenrür is the fastest enemy in the game: his string is short, brutal and ends in a lunge that you must read from his crouch.

| ability | when | string | windups and delays | recovery / punish window | counterplay |
|---|---|---|---|---|---|
| **Av Üçlüsü** (`fen_string`) | 5 s, then every 11 s, at the tank | 3 hits | hit 1 bite: cone 4.5 m / 110 deg, windup 0.6 s, coef 1.1, bleed. Hit 2 claw: **0.4 s** later, cone 5 m / 120 deg, windup 0.5 s, coef 1.2. Hit 3 **Kuyruk Atılışı**: after a **0.9 s crouch** (the ground telegraph appears only at the end of it), a lunge `dashLine` 14 x 4 m through the tank, windup 0.5 s, coef 2.8, knockdown 1.0 s | 1.3 s `vulnerable` after the lunge | stay inside the first hit's range for the first two, roll sideways out of the line on the third; ranged and healers are never in the lunge line because it follows the tank |
| **Çifte Atılış** second leap | inside `fen_leap` | delayed follow-up | see the timeline row | lands, 0.8 s recovery | after dodging leap 1, the tank defensive covers leap 2 |

**Posture 280, break 5 s (a beast tumbles longest).** Signature reward: a break cancels Pençe Çılgınlığı (the frenzy) and ends a Kan Kokusu fixation; during the break he rolls onto his side and takes `dmgTaken` 1.3. Mechanic phases cannot be staggered (he is immune on the ledge).

**Duties.** Tank: stand at the arena centre, keep him facing away from the ranged group, use cooldowns on Claw Frenzy and the lunge, hold the string's last lunge on the line away from the stumps. Healers: the 3 s silence window (pre-heal, do not start long casts under the howl). DPS: melee stand in the frenzy circle and heal through it, ranged outside r 9; kill pups quickly; stack posture before a Kan Kokusu. No interrupts (the howl interrupts the players). **On death:** `grantOdynBuff(c)`. **Enrage 210 s.**

### 5.4 Boss 3 (finale): Skovald and Odyn, "Yiğitlerin Sınavı" (`boss_odyn`)

One boss entity (`boss_odyn`, order 3, the only boss of `salon_arena`), two stages on one health bar, the showpiece of the dungeon.

* **Stage 1, Tanrı-Kral Skovald (about 1:35 at par).** Odyn waits on his dais, immune and held (a scripted mechanic phase, the `zakhar_ritual` pattern). Skovald, the Tideskorn king, bursts in through the south gate with the Legion's fel fire to steal the **Aegis of Aggramar**. He is an encounter-owned add (`yg_skovald`, `rank 'miniboss'`) whose mechanics are timeline entries of Odyn's script, so the finale stays ONE boss for gates, forces and completion. The stage ends when Skovald dies.
* **Stage 2, Odyn's judgment (about 2:40 at par).** Odyn descends to the arena, becomes vulnerable and judges the party: Runic Brands, Spears of Light, Radiant Tempest, an Obliterator add, a storm phase at 35%. At 0% he declares the party worthy (and grants nothing further: the run ends).

**Arena (`salon_arena`, tiles x44..59, z0..15, floor 8.6 m, open sky):** centre of the rune ring and the Aegis pedestal at tile (51.5, 8.5); Odyn's dais at (51.5, 2.0) on the north rim (three 0.4 m tiers); Skovald's gate at (51.5, 14.2); eight rune pads on a ring of radius 5 tiles (20 m) around the centre:

| pad | tile (x, z) | rune colour (zone glow) |
|---|---|---|
| 0 (south) | 51.5, 13.5 | gold 0xffd860 |
| 1 | 55.04, 12.04 | blue 0x6aa0ff |
| 2 (east) | 56.5, 8.5 | green 0x60e080 |
| 3 | 55.04, 4.96 | red 0xff6050 |
| 4 (north) | 51.5, 3.5 | white 0xf4f8ff |
| 5 | 47.96, 4.96 | violet 0xa080ff |
| 6 (west) | 46.5, 8.5 | cyan 0x60d8ff |
| 7 | 47.96, 12.04 | orange 0xff9a40 |

Pads are `valor_rune_pad` props (decor) with a circle `rune` zone (r 0.6 tile, glow colour above) each; the script constants `PADS` repeat the coordinates.

```ts
boss({
  id: 'boss_odyn', name: 'Odyn', title: 'Yiğitlerin Koruyucusu', model: GENB('odyn_titan') /* fallback MON('Demon_Lord') scale 2.1 */, scale: 1.7, role: 'melee',
  hp: 82, dmg: 2.7, speed: 5.4, radius: 1.8, enrage: 540, arenaR: 34, loot: 'loot_yg_b4',
  anims: A_GEN /* fallback A_CHAR */, resist: { lightning: 0.9, holy: 0.9, physical: 0.1, shadow: -0.25 },
  visual: { eyeEmissive: 0xffe090, glow: 0xffe090, emissiveIntensity: 0.4 },
  posture: { max: 500, regen: 6, regenDelay: 4, breakSec: 5, immuneSec: 20, dmgTaken: 1.3 },          // NEW SP-11 (stage 2 only; Skovald has his own, below)
  basic: line('odn_thrust', 'Titan Mızrağı', 9, 2.4, 2.6, 0.8, 1.0, 'physical', 'Attack', 0.5, { telegraph: true, parryable: true }),
  abilities: [
    custom('odn_trinity', 'Üçlü Hüküm', 10, 7, 0.8, 'Attack', { initialCooldown: 4, sfx: 'swing_heavy', params: { impact: 0.5 } }),   // Elden layer: 3-hit spear string
    custom('odn_trial', 'Gelgitkıran Sınavı', 999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),             // stage 1 controller, onEnter of p1
    custom('odn_brand', 'Rünik Damga', 46, 9, 1.5, 'Cast', { sfx: 'choir_sting', params: { impact: 0.8 } }),
    custom('odn_spears', 'Işık Mızrakları', 30, 22, 1.5, 'Cast', { sfx: 'spell_cast', params: { impact: 0.8 } }),
    custom('odn_tempest', 'Parlak Fırtına', 58, 40, 4.0, 'Enrage', { castTime: 4.0, interruptible: false, sfx: 'choir_swell', params: { impact: 3.0 } }),
    custom('odn_obliterator', 'Yok Edici Çağrısı', 70, 35, 1.2, 'Wave', { sfx: 'boss_roar' }),
    custom('odn_plunge', 'Yargı Düşüşü', 40, 30, 1.0, 'Jump', { initialCooldown: 28, sfx: 'boss_cast', params: { impact: 0.8 } }),  // Elden layer: aerial plunge
    custom('odn_rain', 'Yıldırım Yağmuru', 12, 6, 1.5, 'Cast', { sfx: 'lightning_cast', params: { impact: 0.8 } }),
    custom('odn_judgment', 'Hüküm', 999, 9999, 1.0, 'Enrage', { sfx: 'boss_roar' }),                       // phase 3 onEnter
  ],
  phases: [
    bp('p1', 1.01, [], { ability: 'odn_trial' }),                                                          // stage 1 (locked mechanic phase, Odyn immune)
    bp('p2', 0.999, ['odn_trinity', 'odn_brand', 'odn_spears', 'odn_tempest', 'odn_obliterator', 'odn_plunge']),          // stage 2
    bp('p3', 0.35, ['odn_trinity', 'odn_brand', 'odn_spears', 'odn_tempest', 'odn_obliterator', 'odn_plunge', 'odn_rain'], { yell: 'Fırtınam sizi sınasın!', ability: 'odn_judgment' }),
  ],
  intro: 'Yiğitler! Sınavınız başlıyor!', death: 'Layıksınız... yiğitler... Sofram sizindir.',
  arena: { cx: 208, cz: 32, w: 64, h: 64, homeX: 208, homeZ: 10 },
});
// BossPlacement: bossAt('boss_odyn', 'salon_arena', 51.5, 2.5, 0, 3)
// script: lockLimit: 420 (SP-4)
```

**Stage 1 timeline (script `update` while `c.state.stage === 1`, all from Skovald's entity, `c.adds('skovald')[0]`).**

| t (s) | entry | mechanic | kit |
|---|---|---|---|
| 0 | `odn_trial` | `setImmune(true)`, `freeze(true)`, `suppressBasic`; Skovald appears at (51.5, 14.2) with a fel-green `add_spawn`, `encounterAdd('yg_skovald', ..., { hpMult: 48, tag: 'skovald' })`; toast "Skovald, Aegis'i almak için Şan Salonu'na dalıyor!" | EXISTS + NEW SP-4 |
| basic 2.2 | Gelgit Baltası | cone 4.5 m, coef 1.0, windup 0.7 | EXISTS (generic, EnemyDef) |
| 5, then 9 | **Vahşi Kılıç** (Savage Blade) | a **2-hit string**: hit 1 cone 5.5 m / 80 deg, windup 1.1, tank buster coef 3.4 + `bleed` 20 s that stacks per hit ("Yırtık Kesik"); hit 2 **0.7 s later**, back-swing cone 5.5 m / 100 deg, windup 0.5, coef 1.6. **Tank swap at 3 stacks** (taunt). | EXISTS (generic cone on `yg_skovald`) + SP-12 `followUps` |
| 10, then 24 | **Alev Hamlesi** (Felblaze Rush) | he charges a random non-tank: `dashLine` 24 x 4 m, coef 3.2 fire, then a fel-green fire trail 8 s (tick 0.5, coef 0.6). Sidestep the line. | EXISTS (`dashLine`, `c.shape` persist, model: `ignaroth_charge`) + NEW `addDash` |
| 14, then 20 | **Gelgit Yıkımı** (Tide Crush) | he leaps (windup 1.2 s) onto a random non-tank: circle r 6, coef 3.6; **0.9 s later** a fel shockwave band (inner r 4, outer r 12, coef 1.8): stand in the middle or roll the band. | EXISTS (`curukkok_jump` pattern, `ring` shape) + SP-12 delayed ring |
| 16, then 38 | **Ragnarok** | announced with a toast ("Ragnarok! Aegis'i al!") 1.5 s before; 9 s of raid-wide fire: 6 ticks every 1.5 s with coefs 1.0, 1.25, 1.5, 1.75, 2.0, 2.25 (9.75 total, lethal without cover). Inside the **Aegis ward** (below) damage is cut by 75%. **A posture break of Skovald during it cancels the remaining ticks after the current one** (the Aegis is the safe answer, the break is the skilful one). | EXISTS (`circle` of arena radius, ticks via `c.schedule`) |
| during Ragnarok, every 3 s x3 | **Yas Alevi** (Flame of Woe) | 3 random players get a fel flame circle r 3 (2.0 s telegraph, coef 1.5), leaving a fire zone 8 s (coef 0.5 / 0.5 s) | EXISTS (`circle` + `zone`) |
| 25 and 60 | Tideskorn reinforcements | 2 `yg_tideskorn_add` (forces 0, summoned) through the south gate | EXISTS (`spawnAdds`) |
| on Skovald's death | transition | yell "Kral düştü... şimdi sizi sınayacağım.", `setImmune(false)`, `freeze(false)`, `teleport` Odyn to (51.5, 6.5), 120 ms hit-stop, shake, `endMechanicPhase()` | EXISTS |

`yg_skovald`: `Orc` scale 1.55, tint 0x7a3a28, emissive 0x40ff60 x0.25, fel-green eyes, `rank 'miniboss'`, `ccImmune`, `hp 48` (overridden by the spawn `hpMult`), `dmg 2.6`, `speed 5.6`, `radius 1.4`, `ai.summoned`, resist `R_DEMON`, **`posture { max: 300, regen: 6, regenDelay: 4, breakSec: 4, immuneSec: 20, dmgTaken: 1.3 }`**. Basic `cone('yg_skv_slash', 'Gelgit Baltası', 4.5, 100, 2.2, 1.0, 'Weapon', 0.45, { windup: 0.7 })`; ability `cone('yg_skv_savage', 'Vahşi Kılıç', 5.5, 80, 9, 3.4, 'Weapon', 0.45, { initialCooldown: 5, windup: 1.1, telegraph: true, tankBuster: true, parryable: false, statuses: [bleed(1, 0.3, 20)], followUps: [{ delay: 0.7, coef: 1.6, windup: 0.5, arcDeg: 100 }] })`. Skovald's signature posture reward: a break makes him kneel for 4 s, cancels Felblaze and Tide Crush, and trims Ragnarok as described.

**The Aegis of Aggramar (both stages).** The pedestal at (51.5, 8.5) holds the Aegis (`gen/weapons/shield_kite_crest`, scale 3, emissive gold, id `aegis`). It only opens (glows, `c.state.aegisOpen = true`) from 1.5 s before a Ragnarok or a Radiant Tempest until 3 s after it. The first player who stands within 1.5 m of the pedestal while it is open (`playersIn`) becomes the holder for 12 s: slowed 25% (`slow`), a shield bubble fx follows them, and every 0.5 s the script applies `aegis_ward` (0.8 s, -75% damage taken) to every living player within 5 m of the holder. It re-arms 6 s after the holder expires or dies. Group play: the holder runs to the middle of the group and the party stacks on them.

**Stage 2 timeline (Odyn active, t from the start of stage 2; `p3` below 35%).**

| t (s) | ability | cast / windup | mechanic | kit |
|---|---|---|---|---|
| basic every 2.6 | Titan Mızrağı | 0.8 | line 9 x 2.4 m, coef 1.0 (tank), parryable | EXISTS |
| 4, then 7 | Üçlü Hüküm (`odn_trinity`) | see the Elden table | 3-hit spear string at the tank | SP-12 `comboString` |
| 9, then 46 (38 in P3) | **Rünik Damga** | 1.5 | every player is branded for 12 s and linked by a gold `holy_beam` fx to one of 8 rune pads (a random distinct pad each, shown with a yellow soak circle). The brand burns for coef 0.35 holy every 2 s. Standing in your own pad (within 2.4 m + radius) cleanses it and grants **Rünle Kutsanmış** (+30% damage, +25% move speed, 20 s) and a 20% absorb shield. Failing at 12 s: circle r 1.6, coef 3.2 holy and `sunder` 15 s. Players must run across the ring while other mechanics fire. | **NEW SP-3c, SP-3d** (pattern: `zakhar_seals`, `tugrul_frost_mark`) |
| 22, then 30 (24 in P3) | **Işık Mızrakları** | 1.5 | 3 spears (2 with <= 3 players, 4 in P3) fall on random non-tank players: telegraph circle r 4 for 2.2 s, coef 3.2 holy, then a spear zone r 3 for 14 s (tick 2 s, coef 0.6). At 14 s each spear shatters into 3 **Parlayan Parça** that drift outward 8 s: r 1.2, coef 2.2, stun 2 s. | EXISTS (`circle`, `zone`) + **NEW SP-3b** |
| 28, then 30 (24 in P3) | **Yargı Düşüşü** (`odn_plunge`) | 1.0 | see the Elden table | SP-12 |
| 35, then 70 | **Yok Edici Çağrısı** | 1.2 | one `yg_obliterator` (elite add, 0 forces) at a rim pillar (tile (45.5, 8.5) or (57.5, 8.5)); its **Dalgalanma** (3.0 s cast, interruptible, kick HIGH) hits the whole party for coef 1.4 lightning and every successful cast shortens its next cooldown by 30% (min 1.8 s). Kill it, or stun and kick it. | EXISTS (`spawnAdds`) + enemy handler `yg_surge` (small, `ai.cdOverride`) |
| 40, then 58 (46 in P3) | **Parlak Fırtına** | 4.0 (not interruptible, but a **posture break cancels the cast**) | raid-wide holy circle covering the arena, coef 4.0, knockback 14 m from Odyn. The Aegis opens 1.5 s before: the holder's ward cuts it by 75% for everyone near them. | EXISTS (`circle` + `knockback`) |
| 35% (phase 3) | **Hüküm** then **Yıldırım Yağmuru** | n/a, then every 12 s | yell, shake, `dmgMul x1.1`, brand/spears/tempest cooldowns -20% (`cdOverride`); every 12 s 8 lightning circles r 3 (2 on players), telegraph 1.5 s, coef 2.5 | EXISTS (`zakhar_hellrain`) |
| below 15% | soft enrage | n/a | `dmgMul x1.05` every 5 s | EXISTS (`every`) |

`yg_obliterator`: `gen/creatures/golem_stone` scale 1.0, tint 0x8aa8ff, emissive 0x4080ff, `rank 'elite'`, role caster, `hp 7` (spawn `hpMult 7 * partyHp(c)`), `speed 3.4`, `ai.summoned`, basic `cone('yg_ob_smash', 'Yıldırım Yumruğu', 3.6, 110, 2.4, 1.0, 'Attack2', 0.57, { windup: 0.7 })`, ability `{ id: 'yg_surge', name: 'Dalgalanma', kind: 'custom', range: 60, cooldown: 6, windup: 3.0, castTime: 3.0, interruptible: true, kick: 2, anim: 'Attack2', params: { impact: 0.9 } }` with handler `resolve`: circle shape (arena size) coef 1.4 lightning, then `ai.cdOverride.set('yg_surge', max(1.8, cur * 0.7))`.

**Elden layer (stage 2 and the Skovald additions above).** Odyn judges like the final boss of a souls game: a patient string, a dive, and a long kneel when his posture goes.

| ability | when | string | windups and delays | recovery / punish window | counterplay |
|---|---|---|---|---|---|
| **Üçlü Hüküm** (`odn_trinity`) | stage 2, every 7 s, at the tank | 3 hits | hit 1: line 9 x 2.4 m, windup 0.8 s, coef 1.0. Hit 2: **0.5 s** later, line 9 x 2.4 m, windup 0.6 s, coef 1.0 (parryable). Hit 3 **Layık Süpürme**: after a **1.0 s hold** (the spear flares gold), a 200 deg arc, radius 9 m, windup 0.5 s, coef 2.4, knockback 6 | 1.2 s `vulnerable` | parry hit 2, step OUT of the arc (it is a wide sweep: the safe move is back, not sideways), punish the window |
| **Yargı Düşüşü** (`odn_plunge`) | 28 s, then every 30 s (24 in P3), at a random player | aerial plunge | Odyn rises (0.8 s), telegraph circle r 7 for **1.4 s**, plunges: coef 4.0, leaves a holy zone r 7 for 6 s (coef 0.6) | the spear is stuck in the floor for 2.0 s (`vulnerable`, posture damage x1.5, a free burst window) | roll out of the circle; the marked player runs toward an open lane, not into the pads |
| **Gelgit Yıkımı** (Skovald) and **Vahşi Kılıç** string | stage 1 | see the stage 1 table | | Skovald's break is the stage's skill check | |

**Odyn's posture 500, break 5 s ("Hüküm Aralığı").** The bar only fills in stage 2 and in phase 3. Signature reward: a break during **Parlak Fırtına** cancels the cast (the group has about 12 s of posture work between the Tempest's start and its landing, so it is a real choice against the Aegis), and while Odyn kneels all brands pause (timers freeze, no burn ticks) and `dmgTaken` is 1.3. After the break the bar is immune for 20 s.

**Duties.** Tank: Savage Blade swap (stage 1), Odyn's three-hit string (parry the second swing), picking up the Tideskorn adds. Healers: Ragnarok and Tempest ward timing (Aegis), brand burns, Spear zones. DPS: run the brands to the right pads (the beams show where), dodge fragments, Felblaze lines, Tide Crush rings and flame circles, kill the Obliterator or kick its Surge, stack posture before a Ragnarok or a Tempest, burn Skovald in stage 1 and Odyn in stage 2. Interrupts: Obliterator only. **Enrage 540 s** from the pull.

### 5.5 Loot (personal loot, 2 to 3 named build-defining items per boss, `CORE_MECHANICS` §15)

Personal loot: every player rolls their own chest at each boss, 1 guaranteed item (plus a 15% second item), 70% smart loot (main stat and armour type of the spec). Item level, rarity and drop counts come from the systems docs; ilvl ladder `CORE_MECHANICS` §4.4 (Mitik+ chest `68 + 2 * min(L, 12)`, vault `+3`). Each boss biases slot picks (x2 weight) and its **named items each hold 22% of the boss's table weight** (3 named = 66% of rolls, so a named item drops from almost every chest; duplicates re-roll once). Effects are written in the game's combat vocabulary (light chain and its finisher, heavy attack, dodge roll, guard and perfect block, posture, interrupt) so they define builds rather than add flat numbers. The set `set_valarjar` *Yiğit Muhafız Seti* (helm, shoulders, chest, legs) is a proposal for the items module; its pieces drop from Odyn (helm), Heymdal (shoulders), Hirya (chest) and Fenrür (legs).

**Heymdal, table `loot_yg_b1`** (bias: shoulders, helm, trinket, 2H swords)

| item | slot | build-defining effect | build |
|---|---|---|---|
| **Yiğitlik Borusu** | trinket (use, 90 s cd) | plays `hero_horn`: you gain +8% main stat for 30 s and allies within 20 m gain +4% | party burst, lines up with Heymdal-style cooldown windows |
| **Kapı Bekçisinin Kılıcı** | 2H sword | every 3rd chain **finisher** releases a **Kanlı Süpürme** (cone 8 m / 110 deg, 150% weapon damage, bleed 4 s); your finishers also deal +25% posture damage | finisher-chain melee, stagger builds |
| **Statik Kuşak** | belt | standing still 1 s builds **Statik Yük** (max 5, +4% damage each); a **dodge roll discharges all stacks** as chain lightning (60% weapon damage per stack, 3 nearest enemies within 12 m) | roll-caster: stand, roll, stand |
| set piece | shoulders | `set_valarjar` | |

**Hirya, table `loot_yg_b2`** (bias: chest, legs, cloak, staves)

| item | slot | build-defining effect | build |
|---|---|---|---|
| **Valkyr Kanat Pelerini** | cloak | on hit 6% to chain a holy bolt to 3 enemies; below 35% health the wings open once per 90 s: 4% max health healed per second for 4 s and +30% move speed | proc and survival |
| **Eyra'nın Işık Asası** | staff | every ability cast inside a 6 s window stacks **Işık Bilgisi** (max 4); at 4 stacks the next ability releases a **Işık Mızrağı** (line 20 m, 300% damage, pierces, heals allies it passes through for 40% of the damage) | ability weaving, support caster |
| **İkiz Mühür** | ring | alternates every 12 s between **Gök** (+20% lightning and physical damage) and **Işık** (+20% healing and absorbs, damage dealt heals the lowest ally for 8%) | swap timing: line majors up with Gök or Işık |
| set piece | chest | `set_valarjar` | |

**Fenrür, table `loot_yg_b3`** (bias: rings, necks, legs, daggers and fists)

| item | slot | build-defining effect | build |
|---|---|---|---|
| **Kanlı Av Pençeleri** | dual daggers | +10% damage against bleeding targets; every 3rd light hit applies a 4 s bleed; a dodge roll through a bleeding enemy refunds 15% of the dodge cooldown | bleed melee, roll-attack loop |
| **Av Yüzüğü** | ring | each kill gives **Av Heyecanı**: +8% move speed and +4% crit for 8 s, stacks to 5 (elite kills count x3); taking a hit of more than 15% max health drops all stacks | M+ pull-chaining speed run |
| **Sürü Başı Kürkü** | shoulders | a dodge roll leaves a howl: enemies within 6 m are slowed 30% for 3 s (12 s cooldown); you deal +25% posture damage | stagger builds, crowd control |
| set piece | legs | `set_valarjar` | |

**Odyn, table `loot_yg_b4`** (bias: any slot, weapons x2)

| item | slot | build-defining effect | build |
|---|---|---|---|
| **Odyn'in Sınav Mızrağı** | polearm | a perfect block or parry marks the target **Sınanmış** (8 s): +20% damage against it; after 5 hits on a marked target the spear returns as a lightning throw (500% weapon damage, 12 m line) | parry-offence, melee and tank |
| **Odyn'in Yargı Mührü** | trinket (use, 120 s cd) | **Rünle Kutsanmış** for 15 s (+30% damage, +25% move speed); every interrupt or posture break you cause extends it by 1 s (max +8 s) | interrupt and stagger specialists |
| **Aegis'in Gölgesi** | tank shield | each perfect block grants `aegis_ward` (-75% damage taken, 0.8 s) to the 3 nearest allies (8 s cooldown) and adds 25 posture damage to the attacker | group-defence tank |
| set piece | helm | `set_valarjar` | |

**Set `set_valarjar` (proposal).** 2 pieces, *Fırtınanın Çocukları*: lightning and holy critical hits shorten the dodge-roll cooldown by 0.5 s (1 s internal cooldown). 4 pieces, *Odyn'in Gözü*: every 25 s the next rotational ability is repeated by a Gjallar echo at 60% power on the same target, and the echo builds posture like a heavy attack.

---


## 6. MYTHIC+ TUNING

### 6.1 Scaling reference (normative curve, `CORE_MECHANICS` §6)

HP and damage x1.08^(L-1) up to +10, x1.10 per level above. Fortified: trash +20% HP, +30% damage. Tyrannical: bosses (and Skovald, SP-5) +30% HP, +15% damage. Both apply from +12.

| key | enemy HP and damage x | Fortified trash HP / dmg | Tyrannical boss HP / dmg |
|---|---|---|---|
| +2 | 1.08 | 1.30 / 1.40 | 1.40 / 1.24 |
| +5 | 1.36 | 1.63 / 1.77 | 1.77 / 1.56 |
| +7 | 1.59 | 1.90 / 2.06 | 2.06 / 1.82 |
| +10 | 2.00 | 2.40 / 2.60 | 2.60 / 2.30 |
| +12 | 2.42 | 2.90 / 3.15 | 3.15 / 2.78 |
| +15 | 3.22 | 3.86 / 4.19 | 4.19 / 3.70 |

From +12 both affixes are active every week; the columns show what each one adds on top of the base curve.

### 6.2 Timer math (+10, par group, no deaths)

Assumptions: 5-man party (`partyHp` 3.8), effective party DPS 6.5 "par solos" (3 DPS + tank 0.7 + healer 0.35, times 1.6 for ilvl 80 gear), Tyrannical week. Boss time-to-kill `= hpMult x 3.8 x 2.0 x 1.3 / 6.5 = hpMult x 1.52` s, times 1.3 for downtime (phases, adds, positioning, and for Heymdal the 13 drakes, see §5.1). Trash: about 1.5 s per 10 forces plus mechanics, 25 to 62 s per pull including approach. Travel 7 m/s. Fortified weeks swap the boss and trash multipliers and land within a few seconds of the same total. Posture stagger windows (§5.0) are about 6 to 10 s of saved time per boss at par and are left as buffer.

**Pull spacing changed the pull plan, not the forces.** With every pack at least 4 tiles from every other (§4.3), the "pull two packs at once" pairs of the first draft that depended on overlapping aggro are gone. Two kinds of pair remain: the two deliberately `linkedTo` Hearth pairs (p07+p08, p10+p11) and **chained pulls**, where the tank pulls the second pack while the first is at about half health (courtyard, Fields, Şan Eşiği: the packs are 8 to 10 tiles apart, so this is a few seconds of positioning, already inside the segment times). The Ephemeral Way is four single pulls.

**Route A (Hirya first, Fenrür second, full Ephemeral Way):**

| segment | content | time | cum |
|---|---|---|---|
| Courtyard P1-P3 | 79 forces, 3 chained pulls | 2:21 | 2:21 |
| Heymdal | walk-in 0:15, fight 1:43, loot 0:15 | 2:13 | 4:34 |
| Hearth P4-P7 | 83 forces, table funnel, walk | 3:00 | 7:34 |
| Gallery P8 | 13 forces, on the stairs | 0:30 | 8:04 |
| Hirya | fight 2:10 | 2:40 | 10:44 |
| Walk back (Odyn's Favor) | gallery -> Hearth -> trail | 0:25 | 11:09 |
| Fields P9-P12 | 75 forces, kiting | 2:53 | 14:02 |
| Fenrür | fight 2:02 | 2:32 | 16:34 |
| Ephemeral Way P13-P16 | 57 forces, four single pulls (11 / 16 / 14 / 16) up the ramp | 2:25 | 18:59 |
| Şan Eşiği P17 | 36 forces, two chained packs, power shrine | 1:12 | 20:11 |
| Skovald and Odyn | stage 1 1:35, stage 2 2:42, intro and loot 0:45 | 5:02 | **25:13** |

Par **25:13** is 78.8% of 32:00: +2 (<= 25:36) with 23 s to spare (one death costs 15 s), +1 with 6:47 to spare. +3 (<= 19:12) needs a lower key: a +5 to +6 group with the skip route lands there. At +15 the same route costs about 31 to 33 minutes with ilvl 90 gear: the timer is the wall there, so skips and zero-death boss kills decide. (The first draft's 24:58 gained the 15 s back by lumping two Ephemeral Way packs into one pull that the geometry never allowed.)

**Route B (Fenrür first, Mead Cellar, Hirya second, Rüzgâr Köprüsü):** courtyard 2:21, Heymdal 2:13, Hearth 3:00, cellar 1:05, Fields 2:53, Fenrür 2:32, walk back with Odyn's Favor 0:30, gallery 0:30, Hirya 2:40, bridge (2 packs, 5 tiles apart) 1:05, Şan Eşiği 1:12, finale 5:02 = **25:03**. Within 10 s of Route A by design. Route B swaps the four-pull, three-kick causeway for a two-pull bridge and spends the saved time on the cellar swarm and the walk back. Pushing groups add the three optional grizzlies (+24 forces, +1:05) to B for extra buffer.

### 6.3 Forces and the pull plan

**`forcesRequired` is now 325 of 430 available (75.6%)**, down from 335. At 335 Route B had 2 forces of slack (337, 100.6%) and only worked if the 20-force Mead Cellar swarm was mandatory; at 325 Route A has **18 forces of slack (343, 105.5%)** and Route B **12 (337, 103.7%)**. The cellar is still mandatory on Route B (317 without it is 97.5%), which is stated here and in §1 instead of being hidden. Kibirli thresholds (20 / 40 / 60 / 80%): **65 / 130 / 195 / 260** forces.

| pull | packs | forces | cum | % of 325 | note |
|---|---|---|---|---|---|
| P1 | p01 -> p02 (chained) | 26 | 26 | 8.0 | kill the Thundercaller first, tank cooldown |
| P2 | p03 -> p04 (chained) | 31 | 57 | 17.5 | pull the Sentinel patrol alone at the stair foot, then the terrace drakes |
| P3 | p05 -> p06 (chained) | 22 | 79 | 24.3 | **Kibirli 20% (65)** appears here, at the boss stairs |
| Heymdal | - | - | 79 | 24.3 | |
| P4 | p07 + p08 (`linkedTo`) | 24 | 103 | 31.7 | west Hearth swarm (Katliam x40+), Bursting-friendly with the horde rule; break kegs under it |
| P5 | p09 | 18 | 121 | 37.2 | alone: the patrol is 4.3 tiles away |
| P6 | p12 | 14 | 135 | 41.5 | **Kibirli 40% (130)**: smallest pull of the Hearth, alone (patrol turns 4+ tiles from p09, p10, p11) |
| P7 | p10 + p11 (`linkedTo`) | 27 | 162 | 49.8 | table funnel multi-pull |
| P8 | p14 | 13 | 175 | 53.8 | on the gallery stairs |
| Hirya | - | - | 175 | 53.8 | Odyn's Favor |
| P9 | p15 | 15 | 190 | 58.5 | on the trail ramp |
| P10 | p16 | 18 | 208 | 64.0 | **Kibirli 60% (195)** |
| P11 | p17 | 15 | 223 | 68.6 | |
| P12 | p19 -> p22 (chained) | 27 | 250 | 76.9 | lookout hill, then the patrol |
| Fenrür | - | - | 250 | 76.9 | Odyn's Blessing |
| P13 | p25 | 11 | 261 | 80.3 | **Kibirli 80% (260)**; warm-up on the ramp |
| P14 | p26 | 16 | 277 | 85.2 | **three kicks** (or two kicks plus a stun or posture break) |
| P15 | p27 | 14 | 291 | 89.5 | two Felblaze rushes; pull when the p28 patrol is at its north end |
| P16 | p28 | 16 | 307 | 94.5 | Sentinel patrol with a Purifier |
| P17 | p30 -> p31 (chained) | 36 | 343 | **105.5** | forces done before the finale; power shrine between the packs |

Route B: same until P12 (250), plus the cellar (20) after P8 = 270, bridge 31 (p23 18 + p24 13) = 301, Şan Eşiği 36 = **337 (103.7%)**; the grizzlies are optional (+24 = 361, 111.1%).

### 6.4 Dangerous pulls and the fix

1. **p02 and p05 (two Thundercallers, courtyard).** 8 tiles (32 m) apart: never drag one into the other. Kick order: the Thundercaller bolt first, then the Purifier fire or the Mystic heal.
2. **p03 Sentinel patrol.** Its aura gives CC and interrupt immunity to anything it touches. It now walks only x 8.5..12.5 at z 46.5, at least 4 tiles from p01, p02, p04 and p05, so it can be pulled alone at the foot of the Büyük Merdiven; kill it first or break its posture (the aura is off for 3 s). On Inspiring weeks treat it as an Inspiring pack.
3. **p09 and p12 in the Hearth.** The first draft's patrol passed 2.7 to 3.0 tiles from p08, p09, p10 and p11, which made the "pull p09 alone" and "pull p12 alone" plan impossible (every member's aggro pulls its pack). The patrol now covers x 27.5..31.5 at z 31.5 and p09 moved to (30.5, 27.2): 4.3 tiles between the patrol and p09, 4.5 to p08, 4.9 to p11, 5.3 to p10. Each is a separate pull; the old timing trick is no longer required. Two Thundercallers together still delete the tank on Fortified.
4. **p10 + p11 (linked).** 6 revel plus Runecarver, Sentinel, Shieldmaiden, Purifier at the table funnel: the best AoE pull and the most dangerous Bolstering pull. Kill the Runecarver and Purifier first, and break kegs under the pack.
5. **Fields on Volcanic and Bolstering weeks.** Worg packs of 4 to 5 stack Bolstering fast, and Volcanic punishes kiting. Pull toward the cliff rim so plumes do not land on the walking line, and kill the trapper last of each pack so the root does not meet a leap. The Stags charge from 16 m: keep a tree between you and them.
6. **p26 (Thundercaller and two Runecarvers on the causeway).** Three HIGH casts: three kicks, or two kicks plus a stun or a Thundercaller posture break. p25 and p27 are 5 tiles away, so it is a single pull, not the "two kicks plus a stun" of the first draft. Or skip the room (Route B).
7. **p27 (two Tideskorn).** Two Felblaze rushes can overlap; pull when the p28 patrol is at its north end; Sanguine pools block the ramp (16 m wide).
8. **p30 and p31 (Şan Eşiği).** Last big pulls before the finale: use the power shrine between them. p31 has the Sentinel shield (HIGH kick) and a Thundercaller.
9. **p14 (gallery).** Mortal Hew on a stair strip 6 tiles wide: the tank must pull to the Hearth side (the bottom of the stairs).
10. **p23 (bridge).** Two HIGH casts (Thundercaller, Mystic) with two Shieldmaidens on a 16 m deck over the cloud sea; p24 (a Tideskorn and two Trappers) is 5 tiles east, so they do not chain-pull. The first draft's 8 m deck with two Mystics and a Thundercaller (three HIGH casts) is gone.

### 6.5 Affix interactions

| affix | effect in this dungeon |
|---|---|
| Tahkimli (Fortified) | +30% damage makes the 180 deg Mortal Hew, Felblaze rush and Thundercaller pairs lethal; pull smaller, kick and avoid. Route B swaps the four-pull causeway (three-kick p26, two Tideskorn) for the two-pull bridge. Posture breaks on Tideskorn and Sentinels (45 and 60) cancel a Felblaze or Mortal Hew windup. |
| Zorba (Tyrannical) | Skovald counts as a boss (SP-5): his Savage Blade bleed stacks faster, Ragnarok must be Aegis-warded every time. Heymdal's drakes are not boss-class (killable quickly). |
| Kibirli / Efsunlu Yarık | thresholds in §6.3; the manifestation spawns at the walkable point nearest the party, never inside a boss arena. Rift spots (6) in §6.6. |
| Güçlenen (Bolstering) | worg packs and the revel swarm; kill the Mystics last so the heal does not outscale. |
| Öfkeli (Raging) | revel swarm below 30%; burst them down or CC. |
| Kan Dökücü (Sanguine) | the gallery stair (6 tiles wide) and the 16 m causeway and bridge can be blocked by pools: pull to the wide end. Fields are fine. |
| Patlayan (Bursting) | the swarm packs trigger it only every 3rd death (horde rule); Hearth is the risky room. |
| İlham Veren (Inspiring) | Sentinel aura stacks with it; kill the Sentinel first. |
| Volkanik (Volcanic) | punishes kiting in the Fields and ranged positioning behind pillars at Heymdal. |
| Sarsıntılı (Quaking) | stops casts: dangerous when a kick or heal is due; avoid quaking next to a Thundercaller. |
| Patlayıcı Küre (Explosive) | orbs spawn near casters: kill them before the Runecarver chain. |
| Nekrotik (Necrotic) | melee swings stack it on top of Mortal Hew and Kanlı Süpürme: tank rotation matters. |
| Kin Dolu (Spiteful) | shades chase through the open Fields: fine; on the causeway there is nowhere to run. |
| Fırtınalı (Storming) | Heymdal's arena with static strips and blades: plan the tornado path early. Lightning strikes in open rooms add to it. |
| Ağır Yara (Grievous) | Hirya's Eye of the Storm and Odyn's brand burns: heal above 90% between casts. |

### 6.6 Extras: Kehanet Taşı, shrines, chests, rift spots

```ts
const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(10.5, 55.2),                                   // giris, in front of the start (10.5, 57.2)
  shrines: [
    { type: 'shrine_haste', pos: pt(44.5, 31) },                  // Hidromel Fıçısı, Bal Mahzeni (optional detour)
    { type: 'shrine_ward',  pos: pt(19.5, 33.5) },                // Koruma Sunağı, Hearth SW, before the fork bosses
    { type: 'shrine_power', pos: pt(51.5, 18.8) },                // Kudret Sunağı, Şan Eşiği, between p30 and p31, before the finale
  ],
  riftSpots: [pt(10.5, 52), pt(24.5, 30.5), pt(36.5, 30.5), pt(30, 45), pt(36.5, 49), pt(51.5, 33.5)],   // all outside boss arenas, >= 15 m apart
  chests: [{ pos: pt(44.8, 28.3), kind: 'chest_gold' }, { pos: pt(48.6, 22.4), kind: 'chest_iron' }, { pos: pt(17.8, 46.2), kind: 'chest_wood' }],
};
```

The wooden chest moved from (21.5, 54.5), which lay outside every room in the first draft, to the east edge of the courtyard's lower yard. Three shrines (one more than the levelling dungeons) because there are four bosses and two optional rooms; the `shrine_*` type union already allows it. In M+ chests give gold and a health globe only. Start barrier: during the 10 s countdown the door `giris -> yuksek_kapi` is closed by the standard shimmering barrier. After the finale the exit portal spawns at (51.5, 10.5) with the `chest_epic` next to it. M+ release respawn is the dungeon start (systems rule): the walk to the finale is long (about 70 s), so battle resurrection and the Odyn buffs matter.

---

## 7. ENTRANCE

**Zone and terrain.** **Kadim Diyar** (levels 45 to 60, the roadmap third map): the **Fırtına Zirveleri** highlands in the north-west, a basalt crag plateau with thin slate-green grass, autumn larches and a perpetual storm. Entrances are spread across zones: Kemik Mahzeni and Kızıl Dökümhane in Sisli Vadi, Buzul Tahtı and Gölge Tapınağı in Karakır Bozkırı, and this one in Kadim Diyar, at least 40 tiles from the Kadim Kale raid gate and from every other dungeon entrance. Region atmosphere (`RegionTheme`): fog 0x8090a0 near 24 far 100, sky `cloudy-sky-09.jpg`, `ambient_leaves`, music `world_hills`.

**Fallback.** Kadim Diyar does not exist yet (`MAP_UI.md`). Until it does the dungeon is reachable through its Kadim Kapılar Salonu portal in Kuzgunkale (the `mplus_portal` prop tinted gold, standard M+ flow, `GDD_CONTENT` §5.3). If a world entrance is needed earlier, place it on the north rim of Karakır's Ayaz Eteği (snow foothills, fog 0xb8c8d8) with the same recipe.

**The gate: Gök Merdiveni Kapısı (Sky Stair Gate).** A grand WoW-style entrance: a switchback basalt staircase climbs a cliff into a gold-trimmed Titan arch with a blue-white swirling portal door, valkyr statues at the base, blue-white braziers on the steps, a meeting stone in front. Recipe (metres relative to the door centre, +Z toward the player, one-time `EntranceDef.look = 'valor'` recipe in `WorldDecor`):

| piece | asset | placement |
|---|---|---|
| stairs | NEW `valor_stair_titan` x3 stacked up the slope, plus `itch/psx-dungeon/stairs_ultrawide` flanking | from z = +6 up to z = -18, 8 m wide per run |
| gate | NEW `valor_gate_arch` scale 1.5 (18 m wide, 15 m tall) | z = -22 |
| pillars | NEW `valor_pillar_titan` scale 1.6 x2 with blue lanterns (light 0x80b0ff) | x = +-11, z = -22 |
| portal | `gen/props/mplus_portal` scale 1.1, tint 0xffe090 (the `Portal` interactable, `dungeonId`) | inside the arch |
| statues | NEW `valor_valkyr_statue` x2 | z = +4, x = +-7 |
| braziers | `kenney/graveyard-kit/fire-basket` scale 3, emissive 0x80b0ff, blue light | beside the lowest steps |
| banners | `dungeon/banner_patternC_blue` x4 on the arch, `kenney/castle-kit/flag-banner-long` x6 on poles | along the stairs |
| lightning rods | NEW `valor_lightning_rod` x2 with periodic `lightning_strike` VFX on top | beside the arch |
| meeting stone | `gen/props/lobby_obelisk` tinted gold | z = +10 (LFG meeting point) |
| waypoint | `gen/props/waypoint_stone`, id `wp_firtina` | 12 m east of the stairs |
| dressing | `kenney/nature-kit/cliff_block_stone` / `cliff_stone`, `halloween/tree_pine_orange_large` x10, `gen/props/tree_autumn` x6, `kenney/nature-kit/statue_obelisk` | around the plateau |

```ts
// data/world/pois.ts (Kadim Diyar layout, tile TBD by that layout)
{ id: 'ent_yigitler_sarayi', name: 'Yiğitler Sarayı Girişi', dungeonId: 'yigitler_sarayi', pos: [/* tile */], facing: 180, minLevel: 60, regionId: 'kd_firtina_zirveleri', look: 'valor' }
```

`EntranceDef.look` gains `'valor'` (SP-8). The entrance panel is the standard difficulty panel (Mitik 0, Mitik+ when a key exists). After a run the party returns to the entrance and spawns 6 m in front of the gate (`DungeonParams.returnTo`).

---

## 8. IMPLEMENTATION PACKAGES (Haiku)

Process rules (project memory): Opus plans, Sonnet designs/documents, **Haiku codes and QAs**; at most 5 agents at a time; no per-agent browser tests (checks are `npx tsc --noEmit` and `node tools/content-check.mjs`); after each Haiku block a Sonnet review of the diff, an Opus spot-check, then Haiku fixes; one Haiku QA pass at the very end.

### 8.1 Shared NEW primitives (build ONCE for all 8 dungeons, then every dungeon depends on them)

The `SP-n` ids are local to this document: the other seven dungeon docs number their own primitives independently. The orchestrator merges them by name. Known overlaps with sibling docs: fixate (SP-3e here), boss-kit helpers (SP-3), dungeon sky backdrop (SP-1), entrance look (SP-8), music and VFX ids (SP-9), statuses and enemy builders (YS-2 here), and the height primitive (SP-10 here is the same thing as Les Uyanisi's SP-09 `floorY`, now made mandatory by `CORE_MECHANICS` §13).

| id | package | owner module | spec | needed by YS |
|---|---|---|---|---|
| **SP-1** | Open-air dungeon mode | world | `types/dungeons.ts` (append-only): `DungeonTheme.sky?: { image?: string; fallback?: SkyOptions }`, `DungeonTheme.cloudSea?: { y: number; color: number; speed: number }`, `RoomDef.open?: boolean`, `RoomDef.sky?: { image?: string; fallback?: SkyOptions }`, `WallStyle += 'parapet'`. `DungeonBuilder`: for `open` rooms skip the solid rock cap of `buildRockMass` around them and draw a cloud-sea plane instead; walls between an open room and void (or another open room) use the existing `dungeon/wall_half` and `wall_half_endcap` (add them to `dungeonAssetUrls`); add a sky dome with the existing `Sky` class (image panorama preferred, procedural fallback) that follows the camera and blends per room like `updateFog`. | YS-1 |
| **SP-2** | Storm ambience, lightning strike hazard and grounding rods | world + scenes | `RoomDef.storm?: { every: [number, number]; color: number; strength: number }` (flash of hemisphere and background for 0.12 s, delayed `lightning_impact` SFX); `HazardDef.kind += 'lightning_strike'` on the code path of `lava_burst` (telegraph circle, burst with lightning damage and optional stun); **`HazardDef.groundedBy?: { pos: [number, number][]; radius: number; status?: StatusId }`**: a rolled strike tile within `radius` m of a rod is cancelled and players within 3 m of that rod gain `status` (SET-15). | YS-1 |
| **SP-3** | Boss kit helpers | enemies | `ai/bosses/kit.ts`: `breathBand` (with the `cap` strip limit), `roamingOrb` + `updateOrbs` + `clearOrbs`, `markPlayers`, `soakPad`, `fixate` (signatures in §5.0). Refactor `buzul.ts startBreath` onto `breathBand` and `golge.ts zakhar_seals` onto `soakPad` without behaviour change. | YS-3, YS-4 |
| **SP-4** | Encounter adds and lock limit | enemies | `BossScript.lockLimit?: number` used by `BossController.fightFrame` (default 150); `encounterAdd`, `addDash` (§5.0). | YS-4 |
| **SP-5** | Miniboss and Tyrannical | mythic | `rank 'miniboss'` and `tag 'encounter_boss'` adds take Tyrannical, not Fortified; document in `Affixes.ts`. | YS-4 |
| **SP-6** | Ally aura passive | enemies | `ai/abilities.ts`: a passive factory `allyAura({ radius, interval, status, seconds })` that applies a status to allied enemies in range (replicated). Used for Sentinel's Watch with `inspiring`; it is switched off while the Sentinel is staggered (SP-11). | YS-2 |
| **SP-7** | Season pool registry | content + mythic | `data/dungeons/index.ts`: `MPLUS_POOL: string[]` (the 8 season ids; keystone generation draws uniformly from it; the keystone UI and `getDungeon` read it). `DUNGEON_IDS` stays the levelling list. | YS-1 |
| **SP-8** | Entrance looks | world + content | `EntranceDef.look` union gains one value per dungeon (`'valor'` here); recipe table `ENTRANCE_RECIPES[look]` in `WorldDecor` (a prop list builder like the existing `crypt`/`forge` ones). | YS-6 |
| **SP-9** | Audio and VFX ids with aliases | vfx-audio | **Music is optional polish, not a blocker.** `MusicId` today is `menu, town, dungeon_crypt, dungeon_fire, dungeon_frost, dungeon_shadow, boss, victory, defeat, combat, world_*`; `dungeon_cold_sanctuary`, `boss_great_boss`, `boss_colossus`, `boss_epic_battle` are **file names behind existing ids** (`dungeon_frost` and `boss`), not ids. This dungeon uses `dungeon_frost` (file `dungeon_cold_sanctuary.mp3`) for the dungeon and `boss` for every boss. If per-boss tracks are wanted later: `MusicId` gains `dungeon_valor`, `boss_valor_a`, `boss_valor_b` and `boss_valor_finale` with matching `manifest.ts` entries pointing at the three boss mp3 files and the same cold-sanctuary file. VFX: `VFX_IDS += 'static_field', 'storm_flash', 'ambient_leaves', 'rune_pad_glow'` with entries in `vfx/aliases.ts` (§2.8); unknown ids stay silent. | YS-1, YS-3, YS-4 |
| **SP-10** | **Verticality (heightfield)** | world | `types/dungeons.ts` (append-only): `RoomDef.floorY?: number` (m, default 0), `RoomDef.ceiling?: number` (m; wall height, pillar and arch scale, camera zoom limit), `RoomDef.stairs?: { rect: TileRect; from: number; to: number; dir: 'n' \| 's' \| 'e' \| 'w' }[]` (stair or ramp strips interpolating height along `dir`); `ZoneDef.y` and the `dais` zone already exist and give the plateaus. `NavGrid` stores a height per tile and refuses steps above 0.45 m except along `stairs`; `World.groundY` samples the heightfield (players, enemies, loot, projectiles); `DungeonBuilder` raises floor tiles, builds stair treads (instanced boxes) and adds the stair tread collision. Combat rule (`CORE_MECHANICS` §13): melee and hit shapes ignore height differences up to 2.5 m. No lift needed here. Dressing is `PropPlacement.y`. | YS-1 |
| **SP-11** | **Posture and stagger** | enemies + combat | `EnemyDef.posture` and `BossScript.posture` (shape in §5.0), `postureDmg` on player damage events (light 3, heavy 10, parry or perfect block 25, shield bash 25), `BossScript.onStagger?(c)`, nameplate bar, break handling (cancel windups and casts, `vulnerable` flag, +30% damage taken). Scripted mechanic phases and immune states cannot be staggered. | YS-2, YS-3, YS-4 |
| **SP-12** | **Combo strings and tiny ability params** | enemies | `comboString(c, steps)` in `kit.ts` (§5.0), `AbilityDef.followUps?: { delay; coef; windup; arcDeg? }[]` (trash 2-hit strings), and the ability params `fuse` (delayed ground detonation), `stunOnBlock` (charger self-stun on a collide prop) and `minTargets` (only cast when N targets are in range). | YS-2, YS-3, YS-4 |
| **SP-13** | **Set-piece hooks** | world | `PropPlacement.onBreak?: { zone: { radius: number; duration: number; status: StatusId; ignitesOnFire?: boolean } }` on the existing `tag 'breakable'` path (SET-16 mead puddles); statuses `mead_sticky` and `rod_charged`. | YS-1, YS-2 |

### 8.2 Yiğitler Sarayı packages

| id | package | files | needs | acceptance |
|---|---|---|---|---|
| **YS-5** | Art assets (Blender) | `tools/blender/props/props_valor.py` (new category `valor`, registered in `build_props.py`), `tools/blender/bosses/boss_odyn_titan.py`, outputs `public/assets/models/gen/props/valor_*.glb` (the §2.6 list plus the three added in this revision: `valor_balcony_span`, `valor_titan_chandelier`, `valor_retaining_wall`), `gen/bosses/odyn_titan.glb`, update `docs/assets/generated-props.md` and `generated-bosses.md` | none (start first) | every id of §2.6 builds headless, sizes within 10% of the table, nodes named as listed, triangle budgets met |
| **YS-2** | Enemy and boss data | `src/data/enemies.ts` (13 trash defs, `yg_hym_drake`, `yg_valkyr_acolyte`, `yg_worg_summoned`, `yg_skovald`, `yg_tideskorn_add`, `yg_obliterator`, 4 `boss()` blocks of §5, `R_VALARJAR`, `R_STORM`), `src/ai/abilities.ts` (`yg_sentinel_watch`, `yg_bz_rage`, `yg_revel_frenzy`, `yg_wg_pack`, `yg_surge`), `src/data/statuses.ts` + `types/skills.ts` (`holy_scorch`, `bear_snare`, `rod_charged`, `mead_sticky`, `odyn_favor`, `odyn_blessing`, `rune_blessed`, `aegis_ward`) | SP-6, SP-11, SP-12 | `tsc` clean; every ability id referenced by a phase exists; every trash attack windup equals `clamp(0.45 + 0.25 x coef, 0.45, 1.2)` (a script checks it); `content-check` finds every enemy id used by packs |
| **YS-1** | Dungeon data file | `src/data/dungeons/yigitler_sarayi.ts` (Appendix A), registered in `data/dungeons/index.ts` and `MPLUS_POOL` | SP-1, SP-2, SP-7, SP-9, SP-10, SP-13 types; YS-5 assets optional (builder degrades gracefully on missing models) | `content-check` 0 errors; forces: 325 required, 430 available, per-room sums of §3.2; all doors valid; no overlap; pack and patrol spacing >= 4 tiles (script) except p07/p08 |
| **YS-3** | Boss scripts A | `src/ai/bosses/valor_a.ts` (Heymdal, Hirya), registered in `ai/bosses/index.ts` (`VALOR_A_SCRIPTS`, `VALOR_A_SPAWNS`) | SP-3, SP-11, SP-12, YS-2 | `tsc` clean; every handler id matches an ability id of §5.1 and §5.2; `onReset` clears state; strips capped at 4; posture break rewards implemented |
| **YS-4** | Boss scripts B | `src/ai/bosses/valor_b.ts` (Fenrür, Odyn and Skovald), same registration (`VALOR_B_*`) | SP-3, SP-4, SP-5, SP-11, SP-12, YS-2 | as above; stage 1 -> stage 2 hand-over, Aegis, brand pads, posture breaks (Ragnarok trim, Tempest cancel) and wipe/reset covered by code reading and a unit-style check of the pure helpers |
| **YS-6** | Theme, entrance, loot data, music | `THEME` and room atmosphere already in YS-1; entrance recipe `valor` in `WorldDecor` and the `EntranceDef` row (tile TBD); loot table ids `loot_yg_b1..b4`, the 12 named items of §5.5 and the proposed `set_valarjar` as a request to the items module | SP-8, SP-9 | entrance builds without error in the dev data; loot ids resolve (or are flagged as todo for the items owner) |
| **YS-7** | Review | Sonnet reviews each Haiku diff (YS-1..YS-6) against this file | after each block | findings list, then Haiku fixes |
| **YS-8** | QA (once, at the end) | Haiku: `npx tsc --noEmit`, `node tools/content-check.mjs`, a forces/doors/overlap/spacing script like the one used for this doc, read-through of boss scripts for `Math.random` in deterministic paths and for `onReset` leaks | everything | no errors; the numbers in §1 and §3.2 reproduce |

Order: wave 1 (at most 5 at once): SP-1, SP-2, SP-3, YS-5, YS-2 (SP-6 first inside it); wave 2: SP-10, SP-11/SP-12, SP-4/SP-5, SP-7/SP-8/SP-9/SP-13, YS-1, YS-3, YS-4 (as the shared pieces land); wave 3: YS-6, reviews, YS-8. SP-1 and SP-10 are the largest engine tasks and the only ones that can change how a room looks or walks in all dungeons, so each gets a Sonnet review before anything depends on it.

### 8.3 Open risks

1. SP-1 (open-air builder) touches `buildRockMass`, walls and the sky: the most likely source of regressions in the four existing dungeons. Keep every new field optional and the old path byte-identical when no room is `open`.
2. SP-10 (heightfield) touches `NavGrid`, `World.groundY`, projectiles and enemy pathing for every dungeon. All new fields are optional and default to 0, so the four levelling dungeons stay flat; the stair-strip pathing rule ("enemies path only through strips above 0.45 m") needs its own unit test.
3. The Odyn titan model is a new boss mesh: until it exists the finale uses the `Demon_Lord` fallback of §2.6.
4. `rank 'miniboss'` and Tyrannical (SP-5) must not change Fortified behaviour of existing dungeons: they have no minibosses.
5. The code's HP curve (x2.36 at +10) differs from `CORE_MECHANICS` (x2.0): all timings here use the latter.
6. If Kadim Diyar slips, the entrance falls back to the town portal (§7).
7. Posture (SP-11) is new combat feel: the numbers in §4 and §5 are a first pass (par group about 30 posture per second). Tune after the first playtest; stagger must never be reachable inside a scripted mechanic phase.

---

## Appendix A. `src/data/dungeons/yigitler_sarayi.ts` skeleton (paste-ready, compiles against today's types)

Uses `kit.ts` (`room`, `door`, `pack`, `bossAt`, `pt`, `shPt`, `withProps`, `decorator`, `Props`, `lt`, `dg`, `gp`, `kg`, ...). Props per room follow §2.6 and §2.10 and are written in the same style as `golge_tapinagi.ts` (not repeated here). **Everything marked NEW exists only after SP-1, SP-2, SP-10 or SP-13; it is carried in cast-through constants (`NEW_ROOM`, `STRIKE`) so the file type-checks today and the fields simply have no effect until those types and the builder land.** The music id is the existing `dungeon_frost` (file `dungeon_cold_sanctuary.mp3`); `dungeon_valor` and per-boss tracks are optional SP-9 polish.

```ts
import type { DoorDef, DungeonDef, DungeonTheme, HazardDef, PackDef, RoomDef } from '../../types/dungeons';
import { bossAt, door, pack, pt, room, shPt, type MemberTuple } from './kit';

const SKY_STORM = { image: '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-24.jpg' };
const SKY_DUSK  = { image: '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-09.jpg' };
const SKY_FIELD = { image: '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-21.jpg' };
const SKY_GLORY = { image: '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-02.jpg' };
const STORM = { every: [7, 16] as [number, number], color: 0xeaf2ff, strength: 0.9 };

// NEW (SP-2): 'lightning_strike' and 'groundedBy' are not in HazardDef yet. The cast makes today's tsc pass; the builder ignores the unknown kind until SP-2 lands.
const STRIKE = (interval: number, radius: number, rods: [number, number][]): HazardDef =>
  ({ kind: 'lightning_strike', interval, warn: 1.4, radius, coef: 0.35, stun: 1.0, vfx: 'lightning_strike',
     groundedBy: { pos: rods, radius: 6, status: 'rod_charged' } }) as unknown as HazardDef;
// NEW (SP-1, SP-10, SP-13): open-air, sky, storm, floorY, ceiling, stairs. Cast-through so the data file compiles before the types exist.
const NEW_ROOM = (o: Record<string, unknown>): Partial<RoomDef> => o as unknown as Partial<RoomDef>;

const ROOMS: RoomDef[] = [
  room('giris', 'Gök Kapısı Eşiği', 7, 54, 8, 5, 'stone_dark', 'stone', 0.3),
  room('yuksek_kapi', 'Yüksek Kapı Avlusu', 3, 40, 16, 14, 'stone_dark', 'stone', 0.5),
  room('k_heymdal', 'Boru Merdiveni', 9, 36, 4, 4, 'stone_dark', 'stone', 0.3),
  room('heymdal_zirvesi', 'Heymdal Zirvesi', 2, 22, 16, 14, 'stone', 'stone', 0.15, { boss: 1 }),
  room('solen_ocagi', 'Şölen Ocağı', 18, 26, 22, 9, 'wood', 'brick', 0.45),
  room('bal_mahzeni', 'Bal Mahzeni', 40, 28, 6, 5, 'dirt', 'brick', 0.35, { optional: true }),
  room('k_yukselis', 'Valkyr Galerisi', 25, 22, 6, 4, 'stone', 'stone', 0.2),
  room('yukselis_koltugu', 'Yükseliş Koltuğu', 21, 8, 14, 14, 'stone', 'stone', 0.1, { boss: 2 }),
  room('k_av_yolu', 'Av Patikası', 30, 35, 4, 3, 'dirt', 'cave', 0.3),
  room('av_meydani', 'Ebedi Av Meydanları', 20, 38, 24, 18, 'dirt', 'cave', 0.5),
  room('fenrur_ini', 'Fenrür İni', 44, 42, 14, 12, 'dirt', 'cave', 0.15, { boss: 2 }),
  room('k_hyrja_dogu', 'Rüzgâr Köprüsü', 35, 17, 11, 4, 'stone', 'stone', 0.2, { skip: true }),   // 4 tiles high (16 m), rows z 17..20
  room('efemer_yol', 'Geçici Yol', 50, 22, 4, 20, 'stone', 'stone', 0.15),
  room('rune_mahzeni', 'Rün Mahzeni', 44, 22, 6, 5, 'stone_dark', 'stone', 0.3, { optional: true }),
  room('salon_esigi', 'Şan Eşiği', 46, 16, 12, 6, 'stone', 'stone', 0.2),
  room('salon_arena', 'Şan Salonu', 44, 0, 16, 16, 'stone', 'stone', 0.05, { boss: 3 }),
];

const DOORS: DoorDef[] = [
  door('giris', 'yuksek_kapi', 10, 54, 'n', 2, 'none'),
  door('yuksek_kapi', 'k_heymdal', 10, 40, 'n', 2, 'none'),
  door('k_heymdal', 'heymdal_zirvesi', 10, 36, 'n', 2, 'boss_lock'),
  door('heymdal_zirvesi', 'solen_ocagi', 17, 29, 'e', 2, 'boss_exit'),
  door('solen_ocagi', 'bal_mahzeni', 39, 29, 'e', 2, 'none'),
  door('solen_ocagi', 'k_yukselis', 27, 26, 'n', 2, 'none'),
  door('k_yukselis', 'yukselis_koltugu', 27, 22, 'n', 2, 'boss_lock'),
  door('solen_ocagi', 'k_av_yolu', 31, 34, 's', 2, 'none'),
  door('k_av_yolu', 'av_meydani', 31, 37, 's', 2, 'none'),
  door('av_meydani', 'fenrur_ini', 43, 47, 'e', 2, 'boss_lock'),
  door('yukselis_koltugu', 'k_hyrja_dogu', 34, 17, 'e', 2, 'boss_exit'),
  door('k_hyrja_dogu', 'salon_esigi', 45, 19, 'e', 2, 'none'),               // tile moved from (45, 17): the bridge now spans rows 17..20, the stair strip is rows 16..18
  door('fenrur_ini', 'efemer_yol', 51, 42, 'n', 2, 'boss_exit'),
  door('efemer_yol', 'salon_esigi', 51, 22, 'n', 2, 'none'),
  door('efemer_yol', 'rune_mahzeni', 50, 24, 'w', 2, 'none'),
  door('salon_esigi', 'salon_arena', 50, 16, 'n', 4, 'boss_lock'),
];

const SP: [number, number][] = [[0.3, 0], [-0.38, 0.35], [0.06, -0.66], [0.48, 0.62], [-0.88, -0.16], [0.83, -0.53], [-0.28, 1.03], [-0.53, -1.02], [1.15, 0.42], [-1.2, 0.49], [0.9, -1.15], [-0.95, -1.0], [0.35, 1.6], [-0.4, -1.7]];
const rep = (n: number, id: string): string[] => Array.from({ length: n }, () => id);
const mem = (...ids: string[]): MemberTuple[] => ids.map((id, i) => [id, SP[i][0], SP[i][1]]);

// 31 packs. Spacing script (re-run for this revision): every pack centre and patrol segment is >= 4 tiles from every other, except p07/p08 (3.5, linkedTo).
const PACKS: PackDef[] = [
  pack('yg_p01', 'yuksek_kapi', 6.5, 50.5, 12, mem(...rep(2, 'yg_shieldmaiden'), 'yg_mystic')),
  pack('yg_p02', 'yuksek_kapi', 14.5, 50.5, 14, mem(...rep(2, 'yg_shieldmaiden'), 'yg_thundercaller')),
  pack('yg_p03', 'yuksek_kapi', 10.5, 46.5, 18, mem('yg_sentinel', ...rep(2, 'yg_trapper'), 'yg_mystic'), { patrol: [[8.5, 46.5], [12.5, 46.5]] }),
  pack('yg_p04', 'yuksek_kapi', 5.5, 42.5, 13, mem(...rep(2, 'yg_storm_drake'), 'yg_runecarver'), { dormant: { kind: 'ceiling', wakeRadius: 15 } }),
  pack('yg_p05', 'yuksek_kapi', 15.5, 42.5, 14, mem('yg_shieldmaiden', 'yg_thundercaller', 'yg_purifier')),
  pack('yg_p06', 'k_heymdal', 10.5, 37.5, 8, mem(...rep(2, 'yg_storm_drake')), { dormant: { kind: 'ceiling', wakeRadius: 15 } }),
  pack('yg_p07', 'solen_ocagi', 23, 28.5, 12, mem(...rep(8, 'yg_revel'), 'yg_mystic'), { big: true, linkedTo: ['yg_p08'] }),
  pack('yg_p08', 'solen_ocagi', 23, 32, 12, mem(...rep(8, 'yg_revel'), 'yg_shieldmaiden'), { big: true, linkedTo: ['yg_p07'] }),
  pack('yg_p09', 'solen_ocagi', 30.5, 27.2, 18, mem(...rep(2, 'yg_shieldmaiden'), 'yg_thundercaller', 'yg_mystic')),
  pack('yg_p10', 'solen_ocagi', 35, 28, 11, mem(...rep(6, 'yg_revel'), 'yg_runecarver'), { big: true, linkedTo: ['yg_p11'] }),
  pack('yg_p11', 'solen_ocagi', 35.5, 33, 16, mem('yg_sentinel', 'yg_shieldmaiden', 'yg_purifier'), { linkedTo: ['yg_p10'] }),
  pack('yg_p12', 'solen_ocagi', 29.5, 31.5, 14, mem('yg_thundercaller', ...rep(2, 'yg_shieldmaiden')), { patrol: [[27.5, 31.5], [31.5, 31.5]] }),
  pack('yg_p13', 'bal_mahzeni', 43.5, 30, 20, mem(...rep(12, 'yg_revel'), 'yg_sentinel'), { optional: true }),
  pack('yg_p14', 'k_yukselis', 27.5, 23.5, 13, mem(...rep(2, 'yg_shieldmaiden'), 'yg_runecarver')),
  pack('yg_p15', 'k_av_yolu', 31.5, 36, 15, mem(...rep(4, 'yg_worg'), 'yg_trapper')),
  pack('yg_p16', 'av_meydani', 25, 42, 18, mem(...rep(4, 'yg_worg'), 'yg_stag', 'yg_trapper')),
  pack('yg_p17', 'av_meydani', 25, 51, 15, mem(...rep(2, 'yg_worg'), ...rep(3, 'yg_trapper'))),
  pack('yg_p18', 'av_meydani', 31.5, 41, 8, mem('yg_grizzly'), { optional: true }),
  pack('yg_p19', 'av_meydani', 40, 40.5, 15, mem('yg_thundercaller', 'yg_stag', ...rep(2, 'yg_worg'))),
  pack('yg_p20', 'av_meydani', 30, 51.5, 8, mem('yg_grizzly'), { optional: true }),
  pack('yg_p21', 'av_meydani', 37, 52, 8, mem('yg_grizzly'), { optional: true }),
  pack('yg_p22', 'av_meydani', 32, 46.5, 12, mem(...rep(2, 'yg_worg'), ...rep(2, 'yg_trapper')), { patrol: [[26, 46.5], [38, 46.5]] }),
  pack('yg_p23', 'k_hyrja_dogu', 37.5, 18.5, 18, mem(...rep(2, 'yg_shieldmaiden'), 'yg_thundercaller', 'yg_mystic')),
  pack('yg_p24', 'k_hyrja_dogu', 42.5, 18.5, 13, mem('yg_tideskorn', ...rep(2, 'yg_trapper'))),
  pack('yg_p25', 'efemer_yol', 51.5, 39.5, 11, mem('yg_tideskorn', 'yg_shieldmaiden')),
  pack('yg_p26', 'efemer_yol', 51.5, 34.5, 16, mem('yg_thundercaller', ...rep(2, 'yg_runecarver'))),
  pack('yg_p27', 'efemer_yol', 51.5, 29.5, 14, mem(...rep(2, 'yg_tideskorn'))),
  pack('yg_p28', 'efemer_yol', 51.5, 24.2, 16, mem('yg_sentinel', 'yg_shieldmaiden', 'yg_purifier'), { patrol: [[51.5, 23.0], [51.5, 25.4]] }),
  pack('yg_p29', 'rune_mahzeni', 46.5, 24, 12, mem(...rep(2, 'yg_runecarver'), ...rep(2, 'yg_revel')), { optional: true }),
  pack('yg_p30', 'salon_esigi', 47.5, 19.8, 18, mem(...rep(2, 'yg_tideskorn'), 'yg_mystic')),
  pack('yg_p31', 'salon_esigi', 55.5, 19.8, 18, mem('yg_sentinel', 'yg_thundercaller', 'yg_purifier')),
];

const BOSSES = [
  bossAt('boss_heymdal', 'heymdal_zirvesi', 9.5, 26, 0, 1),
  bossAt('boss_hirya', 'yukselis_koltugu', 27.5, 13, 0, 2),
  bossAt('boss_fenrur', 'fenrur_ini', 50.5, 47, -90, 2),
  bossAt('boss_odyn', 'salon_arena', 51.5, 2.5, 0, 3),
];

const THEME: DungeonTheme = {
  fogColor: 0x56626e, fogNear: 16, fogFar: 70, ambient: 0x7c88a0, ambientIntensity: 0.5, hemiSky: 0xa4b4d0, hemiGround: 0x2c2a30,
  torchColor: 0xffb060, bloomStrength: 0.5, music: 'dungeon_frost',     // EXISTING MusicId (file dungeon_cold_sanctuary.mp3); bosses use the existing 'boss'
  palette: [0x2b2f38, 0x56626e, 0x9aa8bc, 0xd9b45a, 0xb87a3a, 0xeaf2ff, 0x7a5cff, 0xffa850], tint: 0xb4bccc,
  // NEW SP-1 (add inside the same object once the field exists): sky: SKY_DUSK, cloudSea: { y: -6, color: 0x6a7686, speed: 0.04 },
};

// Lightning rod positions (SET-15), the same numbers go into the rod props.
const RODS_COURT: [number, number][] = [[4.5, 47.5], [16.5, 47.5], [4.5, 52.5], [16.5, 52.5]];   // lower yard corners (the stair flanks are blocked)
const RODS_WAY: [number, number][] = [[50.2, 37], [52.8, 31], [50.2, 26]];
const RODS_GATE: [number, number][] = [[46.5, 21.0], [56.5, 21.0]];   // flat part of Şan Eşiği, clear of the stair strip

/** Per-room atmosphere (hand-placed props per room are added with withProps(), see golge_tapinagi.ts). */
const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: { explicitDecor: true, lightColor: 0xaec4ff, ambientVfx: 'ambient_dust', ...NEW_ROOM({ open: true, sky: SKY_DUSK, storm: STORM, floorY: 0, ceiling: 30 }) },
  yuksek_kapi: { explicitDecor: true, lightColor: 0xaec4ff, ambientVfx: 'ambient_dust', hazards: [STRIKE(9, 2.2, RODS_COURT)],
    ...NEW_ROOM({ open: true, sky: SKY_DUSK, storm: STORM, floorY: 0, ceiling: 30,
      stairs: [{ rect: { x: 7, z: 43, w: 6, h: 3 }, from: 0, to: 2.0, dir: 'n' }] /* terrace z 40..42 at 2.0 via a dais zone */ }) },
  k_heymdal: { lightColor: 0xaec4ff, ambientVfx: 'ambient_dust',
    ...NEW_ROOM({ open: true, sky: SKY_DUSK, storm: STORM, floorY: 2.0, ceiling: 30, stairs: [{ rect: { x: 9, z: 36, w: 4, h: 4 }, from: 2.0, to: 4.0, dir: 'n' }] }) },
  heymdal_zirvesi: { explicitDecor: true, lightColor: 0xaec4ff, ambientVfx: 'ambient_dust', fog: { color: 0x48566e, near: 18, far: 80 },
    ...NEW_ROOM({ open: true, sky: SKY_STORM, storm: STORM, floorY: 4.0, ceiling: 30 }) },
  solen_ocagi: { explicitDecor: true, lightColor: 0xffa850, ambientVfx: 'ambient_embers', fog: { color: 0x2e2218, near: 10, far: 44 },
    ...NEW_ROOM({ floorY: 3.2, ceiling: 14, stairs: [{ rect: { x: 18, z: 29, w: 2, h: 2 }, from: 4.0, to: 3.2, dir: 'e' }, { rect: { x: 37, z: 27, w: 1, h: 6 }, from: 3.2, to: 4.1, dir: 'e' }] }) },
  bal_mahzeni: { lightColor: 0xffa050, ambientVfx: 'ambient_embers', fog: { color: 0x2a2016, near: 8, far: 36 },
    ...NEW_ROOM({ floorY: 1.9, ceiling: 5.5, stairs: [{ rect: { x: 40, z: 28, w: 3, h: 5 }, from: 4.1, to: 1.9, dir: 'e' }] }) },
  k_yukselis: { explicitDecor: true, lightColor: 0xe8e0c0, ambientVfx: 'ambient_dust', fog: { color: 0x4a4a58, near: 10, far: 44 },
    ...NEW_ROOM({ floorY: 3.2, ceiling: 12, stairs: [{ rect: { x: 25, z: 22, w: 6, h: 4 }, from: 3.2, to: 6.2, dir: 'n' }] }) },
  yukselis_koltugu: { explicitDecor: true, lightColor: 0xcfe0ff, ambientVfx: 'ambient_dust', fog: { color: 0x6a7288, near: 14, far: 62 },
    ...NEW_ROOM({ floorY: 6.2, ceiling: 26 }) },
  k_av_yolu: { lightColor: 0xffc080, ambientVfx: 'ambient_embers', fog: { color: 0xb89868, near: 18, far: 80 },
    ...NEW_ROOM({ open: true, sky: SKY_FIELD, floorY: 3.2, ceiling: 30, stairs: [{ rect: { x: 30, z: 35, w: 4, h: 3 }, from: 3.2, to: 0.0, dir: 's' }] }) },
  av_meydani: { explicitDecor: true, lightColor: 0xffc080, ambientVfx: 'ambient_embers', fog: { color: 0xd8b080, near: 22, far: 100 },
    ...NEW_ROOM({ open: true, sky: SKY_FIELD, floorY: 0, ceiling: 30, stairs: [{ rect: { x: 36, z: 40, w: 2, h: 2 }, from: 0, to: 1.4, dir: 'e' }] /* hill x 38..42, z 39..42 at 1.4 via a dais zone */ }) },
  fenrur_ini: { explicitDecor: true, lightColor: 0xff6040, ambientVfx: 'ambient_embers', fog: { color: 0x2a1a1a, near: 10, far: 46 },
    ...NEW_ROOM({ floorY: 0, ceiling: 14, stairs: [{ rect: { x: 52, z: 43, w: 2, h: 2 }, from: 0, to: 1.2, dir: 'e' }] /* ledge x 54..57, z 43..45 at 1.2 via a dais zone */ }) },
  k_hyrja_dogu: { lightColor: 0xaec4ff, ambientVfx: 'ambient_dust', fog: { color: 0x5a6a7a, near: 14, far: 72 },
    ...NEW_ROOM({ open: true, sky: SKY_STORM, storm: STORM, floorY: 6.2, ceiling: 30 }) },
  efemer_yol: { lightColor: 0xaec4ff, ambientVfx: 'ambient_dust', fog: { color: 0x5a6a7a, near: 14, far: 72 }, hazards: [STRIKE(7, 2.0, RODS_WAY)],
    ...NEW_ROOM({ open: true, sky: SKY_STORM, storm: STORM, floorY: 0, ceiling: 30, stairs: [{ rect: { x: 50, z: 22, w: 4, h: 20 }, from: 6.2, to: 0.0, dir: 's' }] }) },
  rune_mahzeni: { lightColor: 0x70c0ff, ambientVfx: 'ambient_dust', fog: { color: 0x24303a, near: 8, far: 38 },
    ...NEW_ROOM({ floorY: 5.6, ceiling: 7 }) },
  salon_esigi: { lightColor: 0xffe0a0, ambientVfx: 'ambient_dust', fog: { color: 0x6a6458, near: 16, far: 72 }, hazards: [STRIKE(10, 2.2, RODS_GATE)],
    ...NEW_ROOM({ open: true, sky: SKY_GLORY, storm: STORM, floorY: 6.2, ceiling: 30, stairs: [{ rect: { x: 46, z: 16, w: 12, h: 3 }, from: 8.6, to: 6.2, dir: 's' }] }) },
  salon_arena: { explicitDecor: true, lightColor: 0xffe8b0, ambientVfx: 'ambient_dust', fog: { color: 0xcfc8b0, near: 24, far: 110 },
    ...NEW_ROOM({ open: true, sky: SKY_GLORY, storm: STORM, floorY: 8.6, ceiling: 30 }) },
};

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(10.5, 55.2),                                   // giris, in front of the start (10.5, 57.2)
  shrines: [
    { type: 'shrine_haste', pos: pt(44.5, 31) },                  // Hidromel Fıçısı, Bal Mahzeni (optional detour), flat cellar floor
    { type: 'shrine_ward',  pos: pt(19.5, 33.5) },                // Koruma Sunağı, Hearth SW, before the fork bosses
    { type: 'shrine_power', pos: pt(51.5, 18.8) },                // Kudret Sunağı, Şan Eşiği, between p30 and p31, before the finale
  ],
  riftSpots: [pt(10.5, 52), pt(24.5, 30.5), pt(36.5, 30.5), pt(30, 45), pt(36.5, 49), pt(51.5, 33.5)],   // all outside boss arenas, >= 15 m apart
  chests: [{ pos: pt(44.8, 28.3), kind: 'chest_gold' }, { pos: pt(48.6, 22.4), kind: 'chest_iron' }, { pos: pt(17.8, 46.2), kind: 'chest_wood' }],
};

export const YIGITLER_SARAYI: DungeonDef = {
  id: 'yigitler_sarayi',
  name: 'Yiğitler Sarayı',
  shortName: 'Yiğitler',
  lore: "Kadimler, ölen yiğitlerin ruhlarını sınamak için fırtınanın üstüne bir saray kaldırdı: Yiğitler Sarayı. Titan kemerleri bulutların üzerinde yüzüyor, Odyn'in ebedi şölenine açılıyor. Yüksek Kapı'da Heymdal'ın borusu çalıyor; Eyra'nın Seçilmişi Hirya yükseliş koltuğunu bekliyor; Fenrür Sonsuz Av'da kan kokusu alıyor. Ama Gelgitkıran Kralı Skovald, Kadim Zindanlar'ın gölgesinden gelen bir fısıltıya kulak verdi ve kutsal Aegis'i çalmak için Şan Salonu'na daldı. Sınav başladı. Layık olan, Odyn'in sofrasına oturur.",
  levelRange: [60, 60],
  timerSec: 1920,
  forcesRequired: 325,
  theme: THEME,
  grid: { w: 64, h: 60 },
  rooms: ROOMS.map((r) => ({ ...r, ...ROOM_EXTRA[r.id] })),        // + withProps(..., D.out) once the per-room props exist
  doors: DOORS,
  packs: PACKS,
  bosses: BOSSES,
  start: { pos: shPt(10.5, 57.2), facing: 180 },
  exit: { pos: shPt(51.5, 10.5) },
  extras: EXTRAS,
};
```

**Invariants the QA pass checks (all reproduced by script for this revision):** 16 rooms, no two overlapping; every door tile inside room `a` with its neighbour tile inside room `b`; every room reachable from `giris`; every pack centre and patrol waypoint inside its room; every pack and patrol segment at least 4 tiles from every other pack centre and patrol segment (except p07/p08, 3.5 tiles, `linkedTo`); forces: yuksek_kapi 71, k_heymdal 8, solen_ocagi 83, bal_mahzeni 20, k_yukselis 13, k_av_yolu 15, av_meydani 84, k_hyrja_dogu 31, efemer_yol 57, rune_mahzeni 12, salon_esigi 36 = **430**; main route (no optional, no skip corridor) 343, Route B base 317; `forcesRequired` 325; 31 packs, 123 mobs; every stair strip joins two heights that differ by no more than the strip's slope allows and every other tile pair differs by at most 0.45 m.

---

## Rejected critique

Everything in the six review points was valid and fixed. Where the fix differs from the suggested fix or where one suggestion was declined, here is why:

* **Issue 3, "make k_hyrja_dogu 3 or 4 tiles high (z 16..19)".** Taken (4 tiles), but at rows **z 17..20** instead of 16..19: the east door then lands on the flat part of Şan Eşiği (rows 19 and 20) and the new grand stair strip (rows 16..18) stays clear of it. The doors table and the Appendix carry the moved tile (45, 19).
* **Issue 3, "p28 patrol z 23..26 and p27 at 29.5".** Taken with a shorter patrol (z 23.0 to 25.4) so the spacing script's >= 4 tile rule holds against p27 (a 26.0 end was 3.5 tiles from it).
* **Issue 2, "move p09 to about (29, 26.8) or accept p09+p12".** Declined as written: (29, 26.8) is 3.8 tiles from p14 through the gallery door. p09 went to (30.5, 27.2) and the p12 patrol to x 27.5..31.5 at z 31.5 so every Hearth pack is 4 tiles or more from every other.
* **Issue 4, "add one 8-force non-optional pack to the corridor".** Declined in favour of lowering `forcesRequired` to 325 (the doc's other suggested route): an extra pack would lengthen Route B by a pull and break the A/B time parity. Slack is now stated in §3.4 and §6.3 (A 18, B 12).
* **Issue 5, "cut one Runecarver and one Mystic".** Taken for p23 (Mystic traded for a Shieldmaiden, forces unchanged at 18) and declined for p26: p26 stays at three HIGH casts on purpose as the dungeon's kick check, with the text now agreeing (§4.4 kick plan, §6.4) and a stun or posture-break alternative. Extra dispel pressure: `holy_scorch` raised to 1.2% per stack and the Trapper's root became a dispellable `bear_snare`.
* **Issue 1, `dungeon_valor` as a new id.** Not an id, so every reference now uses the existing `dungeon_frost` / `boss`; per-boss tracks stay as optional SP-9 polish.
* **Issue 6.** All three of its fixes were applied together (strip 8 s, breath every 10 to 12 s per drake, cap of 4 strips) rather than one of them, and the drake hit points were cut from `hpMult 3` to 1.2 so the 1:43 kill time still holds.
