# EFSUN ONLINE: Kadim Zindanlar. Open world design ("Sisli Vadi", levels 1-30)

This document is the implementation spec for the **open-world levelling game** that sits between character creation and the dungeon ladder. It answers the request: *"before the dungeons (Normal → Kahramanlık → Mitik 0 → key → +2/+3/+4…) there must be an OPEN WORLD where you level up like in the Metin2 villages: levelling zones, creatures, item-farm spots, specific spots."*

* Ids are English `snake_case`. Everything the player sees is Turkish. Prose is English (like `GDD_CONTENT.md`).
* Every number is a starting value (tune by playtest, keep the ratios).
* **The coordinates, camp spacing, level bands, XP pacing and loot references in this document are generated and validated by script** (every camp lies inside its region room, camp centres keep their spacing, metin spots keep clear of camps / villages / arenas, every enemy id exists, every road point lies on a walkable room, village buildings do not overlap and no NPC stands inside a building). The same data is exported as **`docs/GDD_OPENWORLD.layout.json`**: the content module can import that file instead of retyping tables (`packs`, `patrols`, `rares`, `minibosses`, `villages`, `quests`, `newEnemies`, ... use the same field names as the tables here).
* Precedence: `ARCHITECTURE.md` > `src/types/*` > this doc > `GDD_CONTENT.md` / `GDD_SYSTEMS.md`. **This doc supersedes `GDD_CONTENT.md` §2.6 (Sisli Koru)** and **refines §6/§7 of that doc** (difficulty ladder, progression path). Formulas in `GDD_SYSTEMS.md` (XP curve §6.1, monster stats §1.10, drop tables §7.1, unlock schedule §6.3) are used unchanged.

### Coordinate and unit conventions

| Thing | Convention |
|---|---|
| Unit / tile | 1 unit = 1 m, tile = 4 m (`TILE_SIZE`). World position of tile coordinate `c` = `(c + 0.5) * 4` (same as `types/dungeons.ts`). |
| World map points | **continuous tile coordinates** `[x, z]`, origin = north-west corner, +x east, +z south. `n` = -z. (Packs, patrols, bosses, props use this, exactly like dungeons and the old Sisli Koru.) |
| Village-local points | **metres relative to the village centre** (+x east, +z south), like `data/town.ts`. A village is placed on the map by its `center` tile. |
| Rotation | degrees; 0 faces +z (south), 90 faces +x (east), -90 faces -x (west), 180 faces north (`yawFromDir`). |
| Model helpers | `tw()` hex town pack (x6), `ip()` itch packs (x1, already scaled), `gp()` generated props (x1), `kn()` nature kit (x4), `ks()` survival kit (x3), `kg()` graveyard kit (x3), `kf()` fantasy town kit (x4), `kc()` castle kit (x4), `hw()` halloween bits (x1) — see `data/dungeons/kit.ts` and `docs/assets/*.md`. |

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| **The map** | **Sisli Vadi** (`sisli_vadi`), *"Kuzgunkale'nin güneyinde sisle örtülü geniş vadi"*: **160 x 160 tiles = 640 x 640 m**, levels **1-30**, one seamless scene. A walkable **ring** around a big lake (**Sis Gölü**): the player walks clockwise through **6 regions** (§1.2). It replaces the 200 m Sisli Koru; the old camps live on in R1/R2 (§1.7 migration). |
| **Second map** | **Karakır Bozkırı** (`karakir_bozkiri`) for levels 30-45 (§1.8, described briefly). Level 45-60 is dungeon-led (Kahramanlık from 50); a third map is a roadmap item. |
| **Scene architecture** | **No new `SceneId`.** The open world is a `DungeonDef` with `outdoor: true` **plus one new optional field `world?: WorldExtras`** (regions, villages, waypoints, metin, rares, ...). `DungeonScene` hands everything open-world specific to a new `WorldRuntime` (`src/scenes/world/*`). Net, HUD modes, loot, scroll and M+ code keep working unchanged (§9.3). |
| **Villages** | Embedded in the map as `VillageDef` (same `TownProp` / `TownNpc` types as `TownDef`, coordinates relative to the village centre) — **not** separate scenes (§9.2). Two real villages (**Gümüşdere Köyü**, **Kızılkaya Karakolu**), one camp-village (**Son Ocak Kampı**) and three small camp hubs. **Kuzgunkale stays the capital hub** (portals, keystone, vault, efsun/socket, gamble, trainer, Şeref Taşı). |
| **Metin taşları** | 6 tiers (Keder Sv. 5 … Ölüm Sv. 30), 24 spawn spots, 2 active per region, waves at HP thresholds, debuff aura, **Metin Kalıntısı** currency + skill books (§4). |
| **World bosses** | **Çürükkök** (Sv. 10, Çürük Höyük) and new **Alevkanat, Kızıl Ejder** (Sv. 27, Ejder Yuvası) (§3.8). |
| **Population** | 70 camps (473 mobs), 11 patrols, 16 named rares, 6 mini-bosses, 16 item-farm spots, 24 metin spots, 2 world bosses (§3). |
| **Dungeon ladder** | Normal → **Kahramanlık** (Heroic) → **Mitik 0** → first clear grants **Kadim Anahtar Taşı +2** → Mitik+ (+2 → +3 → +4 …, upgraded by the timer) (§7). |
| **Pacing** | Level 1 → 30 in **≈ 4.5 h of pure open-world play** (≈ 3.8 h when the Kemik Mahzeni / Kızıl Dökümhane Normal runs are mixed in) (§6.6). |
| **Engine budget** | build once behind the loading screen; chunked instancing (40 m), camp **activation 70 m / deactivation 110 m beyond the camp radius**, **AI sleep beyond 45 m**, ≤ 240 live enemies on the host, fog far 55-100 m per region (§1.5). |

---

## 1. World structure

### 1.1 Maps

| Map | id | size | levels | scene | status |
|---|---|---|---|---|---|
| **Sisli Vadi** | `sisli_vadi` | 160 x 160 tiles (640 m) | 1-30 | `dungeon` scene, `outdoor` + `world` | this document, full detail |
| Karakır Bozkırı | `karakir_bozkiri` | 180 x 140 tiles (720 x 560 m) | 30-45 | same | §1.8, brief |
| (roadmap) Kadim Diyar | `kadim_diyar` | - | 45-60 | same | not designed; dungeons + Kahramanlık carry 45-60 |
| Kuzgunkale | `town_kuzgunkale` | 120 m | hub | `town` scene | unchanged (`data/town.ts`), two exits: South Gate → Sisli Vadi, **new East Gate → Karakır Bozkırı** |

### 1.2 Sisli Vadi: geography

The valley is a **ring** around the lake. The player enters at the north edge (from Kuzgunkale's south gate), is cradled in the starting region R1 (rivers on two sides, mountains on the others), crosses **one** stone bridge into R2 and then keeps walking clockwise: R2 → R3 → **Kızılkaya** → R4 → R5 → R6. Higher regions are visible across the river/lake from lower ones (vistas, §5.8), but cannot be reached without passing the lower ones (low-level players cannot wander into R6).

```text
        R1 Sisli Koru (1-5) ─── Taş Köprü ──► R2 Altın Tarlalar (5-10)
        (Gümüşdere Köyü)                       (Çiftlik, Mezarlık, Çürük Höyük)
              │  Gümüş Çay (nehir) + mountains          │
              │                                         ▼
   R6 Lanetli Harabeler (25-30)   [ SIS GÖLÜ ]    R3 Haydut Tepeleri (10-15)
   (Son Ocak Kampı, Kara Anıt)    (lake, island)   (Kızılkaya Karakolu at its south end)
              ▲                                         │
              │                                         ▼
   R5 Ork Kanyonu (20-25)  ◄──────────────────  R4 Ağıt Bataklığı (15-20)
   (Kızıl Kale, Ejder Yuvası)                    (boardwalks, fog, witch hut)
```

Overview map (generated). One character = 2 tiles wide, 4 tiles tall. Digits = regions, `~` water, `.` roads, `o` island/bridge room, `^` entry corridor, `V` village, `K` camp hub, `W` waypoint stone, `D` dungeon entrance, `B` world boss arena, `b` mini-boss lair, `m` metin spot:

```text
    0         20        40        60        80        100       120       140       
  0                                       ^^.^
  4                    111111111111111111111.1111111111111~~~222222222222222222D222
  8                    111111111111111111111.1111111111111~~~222222222222222b.2W222
 12                    111111111111111111111V1111..111b111~~~2222222222222...222222
 16                    111111111111111111111.W1111...11111~~~22222222222...22222222
 20                    111111111111111111111..111111m11111~~~2222KW222..2m222222222
 24                    1111111111111111111111........11111===2222.2....222222222222
 28                    1111m111111m111111111111111111...............222222222222222
 32                    11111111111111111111111111111111111~~~22222...22222222222222
 36                    11111111111111111111111111111111111~~~2222222..2222222222222
 40                    111111111111111111m1111111111111111~~~222222222.2222222222m2
 44                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~2m2222222..22222222222
 48                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~22222222m2..2222222222
 52  6666666666666666666666666666~~~~~~~~~~~~~~~~~~~~~       22222222222.2222222222
 56  666666666666.666666666b66666~~~~~~~~~~~~~~~~~~~~~       22222222222.2222222222
 60  666m66666666.6666m6666666666~~~~~~~~~~~~~~~~~~~~~       222222B2222.2222222222
 64  6666666666W6.666666666666666~~~~~~~~~~~~~~~~~~~~~       22W2222222..2222222222
 68  6666666666666.66666666666666~~~~~~~~~~~~~~~~~~~~~3333333333333333..33333333333
 72  6666666666666.66666666666666~~~~~~~~~~~~~~~~~~~~~333333333333333..3W3333333333
 76  6666666666666.66666666666666~~~~~~~~oooo~~~~~~~~~333333333333333.3333333333333
 80  6666666666666.66666666666666~~~~~~~~oooo~~~~~~~~~33333333333333..333333m333333
 84  6666666666666.6666666666m666~~~~~~~~~~~~~~~~~~~~~333333m333333.333333b33333333
 88  6666666666666.66666666666666~~~~~~~~~~~~~~~~~~~~~333333333333.3333333333333333
 92  66666m6666666.K6666666666666~~~~~~~~~~~~~~~~~~~~~3333333333...3333333333333333
 96  66666666666666W6666666666666~~~~~~~~~~~~~~~~~~~~~33333333..333333m333333333333
100  55555555555555.5555555555555~~~~~~~~~~~~~~~~~~~~~33333....33333333333333333m33
104  55555555555555.555555m555555~~~~~~~~~~~~~~~~~~~~~33333V33333333333333333333333
108  55555555555555..555555555555~~~~~~~~~~~~~~~~~~~~~33333W33333333333333333333333
112  555555555555555..55555555555~~~~~~~~~~~~~~~~~~~~~33333.33333333333333333333333
116  5555555555555555..55555555554444444444444444444444444...4444444444444444444444
120  55555555555555555.555555555544444444444444444444444..4444444444444444444444444
124  5555555555m5555555...55555554444444444444444444.....44444444444444444444444444
128  55555555555555555555.....55544444444444444..m...444444444444444444444444444444
132  5555555555555555555m5555.K....4444.........44444444444444444444m44444444m44444
136  55555555555b555555555555.W5544.....444444W444444444444444m44444444444444444444
140  555555555555555555555555..5544444444444444444444444444444444444444444444444444
144  5555555555555555m55555555.5544444444444444444444444444444444444444444444444444
148  55555B55555555555555555W5D554444444444444b444444444444444444444444444444444444
152  555555555555555555555555555544444444444444444444444444444444444444444444444444
156 
```

**Rooms** (the `RoomDef` rects of the one `DungeonDef`; non-listed tiles are void: water, mountains, forest wall). Rooms touch edge to edge, so region borders are seamless (the outdoor builder only builds walls/tree walls where walkable meets void):

| room id | Ad (TR) | rect x, z, w, h | metre | karo aralığı x / z | not |
|---|---|---|---|---|---|
| `r0_kuzgun_yolu` | Kuzgunkale Yolu | 76, 0, 9, 3 | 36 x 12 | 76..84 / 0..2 | Kuzgunkale Güney Kapısı'ndan gelen yol; harita girişi (80, 1) |
| `r1_sisli_koru` | Sisli Koru | 38, 3, 70, 43 | 280 x 172 | 38..107 / 3..45 | Gümüşdere Köyü burada; nehirle çevrili "beşik" bölge |
| `r1x_tas_kopru` | Taş Köprü | 108, 25, 6, 6 | 24 x 24 | 108..113 / 25..30 | Gümüş Çay üzerinde DÜZ taş köprü (24 m, §8.4): R1 ve R2 arasındaki TEK kara geçidi |
| `r2_altin_tarlalar` | Altın Tarlalar | 114, 3, 44, 66 | 176 x 264 | 114..157 / 3..68 | Altın Ambar Çiftliği, Kayıp Mezarlık, Çürük Höyük |
| `r3_haydut_tepeleri` | Haydut Tepeleri | 100, 69, 58, 46 | 232 x 184 | 100..157 / 69..114 | Kızılkaya Karakolu güney ucunda |
| `r4_agit_batakligi` | Ağıt Bataklığı | 58, 115, 100, 43 | 400 x 172 | 58..157 / 115..157 | tahta yol (boardwalk) + sis |
| `r5_ork_kanyonu` | Ork Kanyonu | 3, 99, 55, 58 | 220 x 232 | 3..57 / 99..156 | kızıl kaya duvarlı koridorlar, Kızıl Kale, Ejder Yuvası |
| `r6_lanetli_harabeler` | Lanetli Harabeler | 3, 52, 55, 47 | 220 x 188 | 3..57 / 52..98 | Son Ocak Kampı güney girişinde |
| `r7_mabed_adasi` | Mabed Adası | 75, 78, 8, 8 | 32 x 32 | 75..82 / 78..85 | gizli ada: yalnız Hayalet Kayık ile ışınlanılır |

**Regions** (what each region is, how big its population is):

| # | room | Bölge | Seviye | merkez (karo) | kamp | kamp mob sayısı | Metin | Ufuk işareti |
|---|---|---|---|---|---|---|---|---|
| R1 | `r1_sisli_koru` | Sisli Koru | 1-5 | 73, 24 | 10 | 63 | Keder Metini (Sv. 5) | Gümüşdere Değirmeni |
| R2 | `r2_altin_tarlalar` | Altın Tarlalar | 5-10 | 136, 36 | 12 | 83 | Hırs Metini (Sv. 10) | Çürük Höyük |
| R3 | `r3_haydut_tepeleri` | Haydut Tepeleri | 10-15 | 129, 92 | 11 | 77 | Nefret Metini (Sv. 15) | Yıkık Gözcü Kulesi |
| R4 | `r4_agit_batakligi` | Ağıt Bataklığı | 15-20 | 108, 136 | 13 | 90 | Acı Metini (Sv. 20) | Ağıt Ağacı |
| R5 | `r5_ork_kanyonu` | Ork Kanyonu | 20-25 | 30, 128 | 12 | 74 | Öfke Metini (Sv. 25) | Kızıl Kale |
| R6 | `r6_lanetli_harabeler` | Lanetli Harabeler | 25-30 | 30, 75 | 12 | 86 | Ölüm Metini (Sv. 30) | Kara Anıt |

**Water and cliffs.** The world is flat (y = 0, engine rule 7). Water is a flat translucent plane drawn over *void* rectangles (the terrain below stays flat; the water quads sit at y = 0.03 with `surfaceTexture('water')` UV scroll and a dark shore ring in the splat map). Void tiles are not walkable, so the nav grid blocks them for free:

| water id | karo x | karo z | metre |
|---|---|---|---|
| `sis_golu` | 58..99 | 52..114 | 168 x 252 |
| `gumus_cay_ns` | 108..113 | 3..45 | 24 x 172 |
| `gumus_cay_ew` | 38..113 | 46..51 | 304 x 24 |

Border dressing (`WorldExtras.borders`, default `trees` = the existing tree wall): the lake shore and rivers use `water` (reeds `tw(decoration/nature/waterplant_*)`, `kn(lily_*)`, stones), mountains and cliffs use `cliff` (`kn(cliff_block_rock)` / `cliff_half_rock` x4 scale rows, `tw(decoration/nature/mountain_A/B/C)` x6 clusters behind them), the R4 edges use `marsh` (dead trees + hanging moss), the R5 walls use `canyon` (red `cliff_*_rock` stacks, 8-12 m high), the R6 edges use `ruin` (broken `kc(wall-*)` runs + dead trees). The far horizon is the existing `makeMountainRing` + sky dome (§8).

**Roads** (splat `dirt` / `cobble` strips, `kn(path_wood*)` boards for boardwalks, one bridge). The **main road** from the Kuzgunkale gate to the Kara Anıt is **≈ 1,279 m long** (183 s of straight running at 7 m/s); branches lead to the cemetery and the farm hub:

| road id | tür | genişlik (karo) | uzunluk (m) | noktalar (karo) |
|---|---|---|---|---|
| `yol_ana` | cobble | 4.0 | 24 | (80,1) → (80,7) |
| `yol_koy_icinde` | cobble | 3.0 | 56 | (80,7) → (80,21) |
| `yol_r1` | dirt | 3.4 | 122 | (80,21) → (86,27) → (98,28) → (108,28) |
| `yol_kopru` | bridge | 4.0 | 20 | (108,28) → (113,28) |
| `yol_r2` | dirt | 3.4 | 212 | (114,28) → (124,31) → (131,38) → (136,49) → (137,62) → (134,69) |
| `yol_r3` | dirt | 3.4 | 171 | (134,69) → (130,80) → (124,92) → (116,100) → (110,102) |
| `yol_r3_r4` | cobble | 3.4 | 58 | (110,102) → (110,112) → (112,116) |
| `yol_r4` | boardwalk | 3.0 | 240 | (112,116) → (104,124) → (94,130) → (80,134) → (66,137) → (58,135) |
| `yol_r5` | dirt | 3.6 | 198 | (58,135) → (48,131) → (38,124) → (33,113) → (30,104) → (30,99) |
| `yol_r6` | cobble | 3.4 | 173 | (30,99) → (30,94) → (29,82) → (28,68) → (26,56) |
| `yol_mezarlik` | dirt | 3.0 | 119 | (124,31) → (132,24) → (140,16) → (146,11) |
| `yol_ciftlik` | dirt | 3.0 | 37 | (124,31) → (122,22) |
| `yol_koy_dogu` | dirt | 3.0 | 68 | (90,14) → (96,19) → (98,28) |
| `yol_kor_ocagi` | dirt | 3.0 | 57 | (50,133) → (52,142) → (52,147) |

**Entry and exits.** Entry `start` = tile (80, 1) facing **0** (south, away from the town gate; `DungeonDef.start`). The return portal **Kuzgunkale Kapısı** (`portal_swirl`, golden, tile (80, 2)) stays as in the old zone; the village north gate is 5 tiles south of it. Leaving through the town portal (or reading `scroll_town`) returns to `TownParams.spawnAt: 'south'`.

### 1.3 Region identities

| Region | Identity | Teaches | Danger shape |
|---|---|---|---|
| **R1 Sisli Koru** (1-5) | misty pine forest around the village; rats, slimes, wolves, goblins, mushrooms; deer meadows | basic attack, AoE, dodge, **interrupt** (goblin shaman), first Metin | pulls of 4-8 weak mobs; one mini-boss (Gırtlak) |
| **R2 Altın Tarlalar** (5-10) | golden farmland: wheat, scarecrows, boars, an abandoned farm, the cemetery with the Kemik Mahzeni door, the mushroom mound | dormant ambushes (scarecrows, bone piles), first Seçkin leader (bear), first **dungeon**, first **world boss** | dormant packs, ranged bandits, poison clouds |
| **R3 Haydut Tepeleri** (10-15) | dry hills, bandit fortress, wolf/warg packs, rhino pastures, ruined watchtower; Kızılkaya outpost on its south end | pack tactics, charges (line telegraphs), archers, stealth ambush | elite-led camps, roaming warg patrols |
| **R4 Ağıt Bataklığı** (15-20) | dense fog marsh on boardwalks; ghouls, wraiths, ooze, giant spiders, burrowing centipedes, a witch | poison / fear / root, burst adds (will-o-wisps), splitting oozes | low visibility (fog far 55 m), dormant burrowers |
| **R5 Ork Kanyonu** (20-25) | red canyon corridors, orc fortress Kızıl Kale, golem quarry, fire vents, the dragon's roost | elite frontal (Yarma), war-cry buffs, fire AoE, **Kızıl Dökümhane** entrance | narrow corridors, heavy elites, buff stacking |
| **R6 Lanetli Harabeler** (25-30) | violet-dark ruins; skeleton armies, cultists, shades, grave knights, vampires, the Kara Anıt obelisk | stealth assassins, summoners, silence, lifesteal | stealth packs, mixed caster/melee camps |

### 1.4 Mob levels, party scaling, champions, treasure goblin

* **Camp mob level** is rolled uniformly in `PackDef.levelRange` per member at spawn (existing rule). Within a region the ranges climb **along the main road** (first camp = region minimum, last camp = region maximum), so the road itself is the levelling guide. Rares and mini-bosses sit at the **top of their region band** (GDD_SYSTEMS §1.10's +1/+2/+3 for elites/mini/boss applies to the *item level* of their drops, not to the mob level), world bosses are fixed.
* **XP**: GDD_SYSTEMS §6.1/6.2 unchanged (same-level Sıradan `xpMonster(L)`; ≥ 4 levels under = 80%/60%/40%/20%/5%, up to +25% for higher mobs; party full XP x(1 + 0.05(n-1))). Metin, quests, rares and exploration add on top (§6).
* **Party HP scaling** (players within 50 m): x(1 + 0.6(n-1)) as in open world today.
* **Champion camps (Şampiyon)**: GDD_CONTENT §1.5 is dungeon-only; the open world adds a *light* version. When a camp with ≥ 4 members and mob level ≥ 8 **activates**, it rolls `championChance = 0.12` (host RNG, seeded by `seed + packIndex + respawnCount`): its member with the highest `hpMult` becomes a Şampiyon via the existing `makeChampion(enemy, mod)` (blue plate, x3 HP, x1.4 dmg, one modifier of the 7 in `ai/champion.ts`). Reward: **+1 guaranteed Büyülü+ item (25% Nadir)** and +`Metin Kalıntısı` x1 (no guaranteed Nadir as in dungeons).
* **Hazine Goblini**: GDD_CONTENT §1.6, but rolled **per active region** every 5 min (12% each, at most 1 alive per region; spawns in a random *active* camp; despawns after 90 s outdoors as before). The first visit to `r2_c03` (Terk Edilmiş Çiftlik) spawns one for sure (GDD_CONTENT §7 scripted goblin).
* **Death** (GDD_SYSTEMS §6.6): from level 10 lose 5% of `xpToNext` (never de-level), respawn at the **last activated waypoint stone or village** with 50% HP; "Burada Diril" after 5 s for 50 x level gold. Below level 10 no penalty. Dungeon entrances in the world are *not* respawn points.
* **Region warning**: entering a region whose band starts ≥ 5 levels above the player shows the toast "Bu bölge sana göre tehlikeli ({lo}-{hi}. seviye)." (soft gate, never a wall).

| Bölge | kamp | devriye | toplam mob | toplam XP eşdeğeri* | kamp başı ort. | Seçkin liderli kamp |
|---|---|---|---|---|---|---|
| R1 Sisli Koru | 10 | 1 | 67 | 49 | 4.9 | 1 |
| R2 Altın Tarlalar | 12 | 2 | 91 | 72 | 6.0 | 2 |
| R3 Haydut Tepeleri | 11 | 2 | 87 | 132 | 12.0 | 7 |
| R4 Ağıt Bataklığı | 13 | 2 | 101 | 93 | 7.1 | 3 |
| R5 Ork Kanyonu | 12 | 2 | 83 | 150 | 12.5 | 10 |
| R6 Lanetli Harabeler | 12 | 2 | 97 | 102 | 8.5 | 5 |

\* *XP equivalent* = Σ members x multiplier (Sürü 0.35, Sıradan 1, Seçkin 5). The patrols are counted in "toplam mob" but not in the XP column.

### 1.5 Seamless loading and performance strategy

The world is **one scene** (no loading between regions or into villages); the loading screen appears when entering the map and when entering a dungeon / other map. The strategy below is what the implementers must hit; every number is a budget, not a measurement.

| Budget | Value | How |
|---|---|---|
| Map build (behind the loading screen) | ≤ 12 s on a mid PC | terrain splat 2048² (§1.5.1) ≈ 1.5 s, scenery batching ≈ 3 s, model preload ≈ 5 s, nav fill 0.3 s |
| Unique GLBs preloaded | ≤ 70 files, ≤ 28 MB | only models of the 34 new + existing enemy defs actually used, region scenery sets (6-10 tree/rock models each), villages |
| Static scenery instances | ≤ 26,000 | trees ≈ 3,500-4,300 (≈ 650 non-water border tiles x 3.6 + ≈ 760 backdrop forest + ≈ 580 interior), bushes ≈ 450-700, rocks ≈ 450, tufts ≈ 14,000, flowers ≈ 2,500, props ≈ 1,500 — all `InstanceBatcher` |
| `InstancedMesh` objects | ≤ 2,500 | one per (chunk, model, part) over ≈ 190 walkable chunks; **chunk = 40 m** (`new InstanceBatcher(root, 40)`, already used by outdoor) |
| Visible per frame | ≤ 220 scenery meshes, ≤ 400 draw calls total, ≤ 400k triangles | frustum + chunk-distance culling below (a 90 m draw distance touches ≈ 25 chunks) |
| Draw distance | `fogFar + 20 m` (55-100 m per region, §8) | fog hides the pop-in; per-layer limits: tufts/flowers 55 m, bushes 80 m, rocks/props 100 m, trees `fogFar + 20` |
| Live enemies (host) | ≤ **240** simulated, ≤ 70 rendered per peer | camp streaming + AI sleep below |
| Dynamic lights | `LightPool` 8 (nearest first) | campfires, torches, shrines, village lamps; shadows: the existing single directional light following the player |
| NavGrid | 640 x 640 cells (1 m) = 400 KB `Uint8Array` | built once; A* limited to a 96 x 96 window around the mob (leash 40 m) |
| Particles | existing mist (150) + fireflies (110) fields + ≤ 200 region VFX | `ParticleField` wraps around the camera |
| Snapshots | `snap` 15 Hz, **interest-managed**: each peer only receives enemies within 120 m of its player, ≤ 60 per packet | net module (`Replication`), §9.4 |
| Memory | JS + GPU ≤ 600 MB | |

**1.5.1 Terrain at 640 m.** One ground mesh (`half = 480`, cell 10 m → 96 x 96 segments, ~18k tris) keeps the single-draw-call terrain. Two changes to `Terrain.ts` (world module): (a) `splatRes` up to **2048** and the splat store becomes a `Uint8ClampedArray` (12 MB instead of 50 MB of `Float32`) — 0.31 m/px; (b) a **region tint map** (`tintMap`: 160 x 160 RGB, one texel per tile, 77 KB, bilinear) multiplies the ground colour so each region has its own grass/dirt hue without extra textures, and `TerrainOptions.textures` lets each region pick its own grass/dirt/cobble/dark textures from the tiny texture packs (§8): the shader samples a per-region texture *atlas row* chosen from the tint map's alpha channel. (If that is too much for the first pass, ship one texture set + the tint map; the splat channels `dirt` (roads/camps), `cobble` (villages, boardwalks, ruins) and `dark` (moss/marsh/scorch) already give every region a different feel.)

**1.5.2 Camp streaming (host).** The old `DungeonScene` spawns every camp at load. With ~70 camps that is ≈ 473 models at once, so the open world **streams camps**:

1. Every camp has a deterministic id range: `enemyId = DUNGEON_ENEMY_ID_BASE + packIndex * 24 + memberIndex` (a camp has at most 24 members; 2,079 camps fit in the 100..49,999 range). Stable ids mean respawns reuse the same ids and clients never invent ids (ARCHITECTURE contract).
2. `CampDirector.update()` runs on the host every **0.5 s** over a spatial hash (cell 40 m): a camp is **activated** when any player is within `radius + 70 m` of its centre (spawns the members that are alive per its state, sends `spawn` messages with the explicit ids) and **deactivated** when every player is farther than `radius + 110 m` and no member is aggroed (alive members are removed with `spawn { remove: true }`, dead members stay dead until the camp timer).
3. **Camp state** (host memory, `Map<packId, { aliveMask, lastKillAt, champion?, respawnCount }>`): members killed stay dead; the **whole camp refreshes `respawnSec` after its LAST kill** and only when no player is within `radius + 30 m` (the "never pop a camp into the players' faces" rule of the current code, now with the larger margin). A camp that was deactivated at full health simply resets.
4. **Cap**: if more than 240 enemies are alive, the farthest camps deactivate first. Rares, mini-bosses, metin waves and boss adds are never counted against the camp cap but count against the 240.
5. **AI sleep**: an enemy that is not aggroed and is farther than **45 m** from every player skips `EnemyAI.update` and animation mixer updates (idle clip frozen) and, if farther than `fogFar + 15 m`, is hidden; patrols advance analytically at 2 Hz (position along the loop) and are re-snapped to the nav grid when they wake.
6. Joining late: a client that joins a running world receives the current camp states of camps near its position through the normal `spawn` stream (activation is per player distance, so nothing special is needed).

**1.5.2b Level of detail.** Enemies beyond 25 m cast no shadow, beyond 35 m their animation mixer ticks every 3rd frame, beyond `fogFar + 15 m` they are hidden (§1.5.2 item 5). Scenery needs no LOD meshes (PSX trees are 52-360 triangles, rocks/bushes ≤ 300): fog + the per-layer draw limits are the LOD (tufts 55 m, bushes 80 m, rocks/props 100 m, trees `fogFar + 20 m`); villages are static merged batches. Particle fields shrink their wrap box in R4 (fog) so the particle count stays constant. Shadow map: the single directional light follows the player, 38 m box, 2048 map (existing outdoor setting); shadows of instanced scenery are cast only inside that box.

**1.5.3 Chunk culling (every peer).** `ChunkCuller.update(camera)` every 0.25 s toggles `InstancedMesh.visible` by chunk-centre distance against the per-layer limits above (a 640 m map has 256 chunks; plain frustum culling per `InstancedMesh` works but keeps ~3,000 meshes in the render list). Terrain, sky dome and mountain rings are exempt and follow the camera.

**1.5.4 Region atmosphere blend.** Fog colour/near/far, hemisphere/sun colours and the sky tint are **per-region themes** (§8) blended by the player's position: `RegionAtmosphere.update()` lerps toward the theme of the room under the player with a 30 m smoothstep window at region borders (`WorldRegion.blendM`), so crossing from R1 into R2 slowly warms the fog instead of popping. Music crossfades on the `world:regionEntered` event.

### 1.6 Seamless-ness rules

* Villages are walkable parts of the same terrain (walls with gates, no loading). Their safe zone is a box (§2.2).
* Crossing region borders never loads anything; the banner (`ui:zoneName`) shows region name + "Seviye a-b", and the first entry grants **keşif XP = 10% of `xpToNext`** (flag `world.region.<id>`).
* The only loading screens: Kuzgunkale ↔ map (south/east gate, return portal, `scroll_town`), map ↔ dungeon (world entrances), map ↔ map (Karakır gate).

### 1.7 Migration from the old Sisli Koru (50 x 50 tiles)

| Old id | Old camp | New home |
|---|---|---|
| `ow_c01` | Fare Yuvası (rats) | `r1_c01` (same name; L1-2) |
| `ow_c02` | Balçık Gölü | `r1_c02` |
| `ow_c03` | Yağmacı Kampı (goblins) | `r1_c04` (+ Puglin Reisi leader, mini-boss Gırtlak) |
| `ow_c04` | Mantar Halkası | `r1_c05` |
| `ow_c05` | Örümcek Korusu | `r1_c06` |
| `ow_c06` | Terk Edilmiş Köy | `r2_c03` Terk Edilmiş Çiftlik (zombies + bats; the abandoned-village props move with it) |
| `ow_c07` | Yarasa Mağarası | `r2_c07` Yarasa Kayalığı |
| `ow_c08` | Ork Karakolu | `r5_c02` Ork Karakolu (moved to the canyon; the elite `ow_orc_chief` leads it) |
| `ow_c09` | Kayıp Mezarlık | `r2_c08` Kayıp Mezarlık (+ crypt door = `ent_kemik_mahzeni`) |
| `wb_curukkok` | Çürük Höyük (25, 44) | Çürük Höyük **(126, 60)** in R2 |
| cursed chests (32,20) (12,32) | Lanetli Sandık | `cc_r1`, `cc_r2` (+ 4 more regions, §5.4) |

`data/dungeons/sisli_koru.ts` stays in the repo for its prop recipes (mushroom ring, farm village, crypt entrance, cursed chest props) but is **removed from `OPEN_ZONES`**; `getDungeon('sisli_koru')` returns `SISLI_VADI` for old save/route compatibility (§9.3). The town exit `guney_kapisi` changes `to: 'sisli_koru'` → `'sisli_vadi'`.

### 1.8 Map 2: Karakır Bozkırı (levels 30-45), brief

*"Doğu Kapısı'ndan çıkan yol, rüzgârın hiç dinmediği kurak bir bozkıra ve karlı eteklere açılır."* 180 x 140 tiles. Same systems (camps, metin, rares, villages), same budgets. Two halves: **Karakır Bozkırı** (30-37, dry steppe, tall grass `grass_patch_fall`, fog 0xcfc2a0 near 30 far 110) and **Ayaz Eteği** (38-45, snow foothills, fog 0xb8c8d8 near 20 far 90, `ambient_snow`).

| Item | Content |
|---|---|
| Villages | **Kervansaray** (caravan stop, centre, Sv. 31: hub services) and **Karlıbel Kalesi** (north-east fort, Sv. 40) — same `VillageDef` layout rules as §2 |
| Dungeon entrances | **Buzul Tahtı** (`ent_buzul_tahti`, ice cave mouth at the foothills, min Sv. 30) and **Gölge Tapınağı** (`ent_golge_tapinagi`, ruined temple stairs at the far east, min Sv. 42) |
| Creature families | wolves/wargs (white/black texture variants), rhinos, mammoths (elite, `Stomp`/`Charge`), centipedes, wasps, hill giants (`MON(Giant)`), yetis (`yeti_brute`), ice elementals, frost wraiths, bandit riders; orcs return as `ow_orc_brute` elites |
| Metin tiers | tiers 7-9 of the same system: Sv. 35 `metin_cinnet` ("Cinnet Metini"), Sv. 40 `metin_zulum` ("Zulüm Metini"), Sv. 45 `metin_yikim` ("Yıkım Metini") |
| World boss | **Kadim Mamut Ulu-Boz** (`wb_ulu_boz`, `mammoth.glb` x1.5, Sv. 38): `Stomp` rings, `Charge` lines, `Trumpet` adds |
| Quests | continuation `mq_20`..`mq_30` (Buzul Tahtı Sv. 30 Normal, Gölge Tapınağı Sv. 42 Normal), 14 side quests |
| Pacing | Sv. 30 → 45 in ≈ 3.5 h (same model as §6.6; xpToNext sum 1,688,670) with the two Normal dungeons mixed in |

The three dungeon portals in Kuzgunkale remain; the world entrances here are the same `Portal` interactable with the same difficulty panel.


---

## 2. Villages (Metin2 köy style)

Metin2's villages are walled safe havens with every service one step away and monsters waiting right outside the gate. Sisli Vadi copies that rhythm: **Gümüşdere Köyü** is the starting base (levels 1-10), **Kızılkaya Karakolu** the mid-map outpost (levels 10-20), **Son Ocak Kampı** the late camp (levels 25-30), and three tiny camp hubs (Altın Ambar Çiftliği, Bataklık İskelesi, Kanyon Girişi Kampı) give a waypoint, a quest giver and a fire in the middle of each long stretch.

### 2.1 Settlement tiers and services

| Service | Kuzgunkale (capital) | Gümüşdere Köyü | Kızılkaya Karakolu | Son Ocak Kampı | Camp hubs (çiftlik / iskele / kanyon) |
|---|---|---|---|---|---|
| Respawn point (yeniden doğuş) | town spawn | yes (waypoint stone) | yes | yes | yes (their stone) |
| Işınlanma Taşı (waypoint) | - | `wp_gumusdere` | `wp_kizilkaya` | `wp_son_ocak` | `wp_ciftlik` / `wp_iskele` / `wp_kanyon` |
| Işınlayıcı NPC (`waypoints` panel) | - | yes | yes | yes | kanyon only |
| General store (`merchant`) | Tüccar Selim | Bakkal Süleyman | Bakkal Hatice | Gezgin Tüccar | kanyon only |
| Weapon smith (`weaponsmith`) | - | Silahçı Rüstem | Silahçı Orhan | - | - |
| Armour smith (`armorsmith`) | - | Zırhçı Gülsüm | Zırhçı Melek | - | - |
| Alchemist (`alchemist`) | Simyacı Lale | Eczacı Nermin (tier 1-2) | Eczacı Selvi (tier 2-3) | Gezgin Eczacı (tier 3) | iskele only |
| Blacksmith (upgrades) | Demirci Haldun (+0..+15, efsun, socket) | Demirci Taner (**+0..+9**, Parçalama) | Demirci Bilal (**+0..+9**, Parçalama) | - | - |
| Efsun / Oyma | Efsuncu Nergis | - | - | - | - |
| Stash (`stash`, same shared stash) | Depocu Bekir | Depocu Hızır | Depocu Nuri | - | - |
| **Metin Kalıntısı Tüccarı** (§4.6) | - | Zeynel | Sabri | Mahir (merged with the traveller) | - |
| Quest NPCs | Muhtar Cemal | Muhtar Ferhat, Avcı Yıldız, Çiftçi Hatice, Rahibe Meryem | Komutan Aslan, Avcı Karaca | Nöbetçi Başı Talha | Rıza, Gülizar / Ömer / Deniz |
| Daily bounty board (Görev Panosu) | yes | yes (`gp(notice_board)`) | yes | - | - |
| Seal vendor (Mühürdar), keystone, vault, portals, trainer, gamble, Şeref Taşı | **only here** | - | - | - | - |
| Stable (`stable`, mount placeholder) | - | Seyis Kerem | Seyis Ceyhun | - | - |
| Training targets | dummies | - | archery range | - | - |

Why split like this: the villages are for **levelling comfort** (heal potions, white gear, +0..+9 upgrades, stash, teleport), Kuzgunkale stays the place for **power progression** (efsun, sockets, +10..+15, gamble, M+ economy). A level 30 player still has a reason to go home.

### 2.2 Safe zone rules

* Every village has a **safe box** (`VillageDef.safe`, default = `bounds`, metres relative to the centre). Rules, all enforced by `WorldRuntime` through one query `world.isSafe(x, z)`:
  1. Enemies **never aggro** a player inside the box (`EnemyAI` target acquisition ignores players for which `isSafe` is true) and an enemy that chases a player through a gate loses its target at the border and leashes back (home position).
  2. Enemy hit shapes / projectiles do **not** damage a player standing in the box (`Combat.hitLocalPlayer` early-out) — a player can still use skills on the training dummies, potions are free of the shared cooldown inside the box.
  3. Resting: out of combat inside the box HP/resource regenerate x4.
  4. No loot drops from enemies killed outside onto the inside (drops spawn at the corpse).
  5. Guards (`role: 'guard'`) never leave their post (leash 24 m) and **assist**: any non-elite enemy within 20 m of a gate guard takes a lethal hit every 2 s (its max HP), elites 15% of max HP per second (P2, nice-to-have).
* Villages sit on cobble/dirt splat discs (§8) with a palisade (Gümüşdere) or stone wall (Kızılkaya) and 2-3 gates; **the camps are placed outside the safe box with a gap of at least `radius/4 + 2` tiles** (validated), so a pull never starts inside a village.
* Interior props use `TownProp` colliders (`box`/`radius`), NPCs use the existing `NPC` entity (interact range 3.0 m).

### 2.3 Gümüşdere Köyü (`koy_gumusdere`), levels 1-10

*"Gümüş Çay'ın kıyısındaki palisadlı köy: kuzey kapısı Kuzgunkale yoluna, güney kapısı Sisli Koru'ya, doğu kapısı Taş Köprü yoluna açılır."*

* Centre tile **(80, 14)** (world ≈ (322, 58) m), safe box / wall **±40 x ±28 m** (80 x 56 m). Gates (width 8 m): north `(0, -28)` (Kuzgunkale road, the map entry is 5 tiles north), south `(0, 28)` (to Sisli Koru), east `(40, 0)` (to the bridge road).
* **Respawn** `(10, 17)` facing 0, next to the waypoint stone. Zone banners (local boxes): *Meydan* (±12 x ±10), *Han Sokağı* (x 14..38, z -22..-2), *Demirci Sokağı* (x -38..-14, z -22..-2), *Çarşı* (x -38..-14, z 0..14), *Ahır* (x 16..38, z 18..28).
* Look: timber houses (hex pack x6, `tw`), a palisade of 4 m `plackard_closed_full` modules, `hw(arch)` gates with lanterns, haystacks and flower beds; warm dusk light is the region light (`R1`), the village adds only LightPool lamps.

Layout (generated; `#` palisade, gaps = gates, letters as in the model tables below, `n` = service NPC):

```text
####################   ####################
#     GGGGGG   MMM       SSSS             #
#     GGGGGG   MMM       SSSS             #
#     GGGGGG   MMM       SSSS             #
#     DDDD      n               HHHHH     #
#     DDDD n            kk      HHHHH     #
# eee            !!     kk   ff           #
# eee               OO       ff
#    BBBBB          OO
#    BBBBBn                 wwn    eee
#    BBBBB                 n       eeeee  #
#    BBBBB                IIzzn     eeee  #
# PPPPP  n     EE                   eeee  #
# PPPPP        EE            n         n  #
# PPPPP                                   #
#                                         #
####################   ####################
```

Letters: `H` han · `D` demirci · `B` bakkal · `M` muhtar evi · `S` şapel · `G` muhafız karakolu · `P` depocu evi · `e` evler · `w` silah tezgâhı · `z` zırh tezgâhı · `k` Metin tezgâhı · `E` eczane · `O` kuyu · `I` ışınlanma taşı · `!` görev panosu · `f` kamp ateşi.

**Buildings and props** (local metres; all `collide: true` with box colliders from the model size unless noted):

| Yapı / dekor | model | konum (x, z) m | rot° | ölçek | not |
|---|---|---|---|---|---|
| Gümüş Çay Hanı (han) | `tw('buildings/yellow/building_tavern_yellow')` | (26, -12) | -90 | 6 | kapı batıya (meydana) bakar; hancı önünde |
| Demirci Dükkânı | `tw('buildings/red/building_blacksmith_red')` | (-26, -12) | 90 | 6 | + `ks(workbench-anvil)` x3 (-20,-10), `ks(workbench-grind)` x3 (-20,-14), `gp(forge)` (-29.5,-8) arka duvar |
| Bakkal (Genel Dükkân) | `tw('buildings/blue/building_market_blue')` | (-27, 7) | 90 | 6 | önünde `ip(psx-medieval,market/crate_apples)` x3, `basket_potatoes` x2 |
| Muhtar Evi | `tw('buildings/green/building_home_B_green')` | (-9, -21) | 0 | 6 | meydana bakar; Muhtar Ferhat kapıda |
| Küçük Şapel | `tw('buildings/blue/building_church_blue')` | (12, -22) | 0 | 6 | Rahibe Meryem; çan sesi (`gate_heavy` sfx 90 sn döngü) |
| Muhafız Karakolu | `tw('buildings/green/building_barracks_green')` | (-24, -22) | 0 | 6 | kuzey kapı muhafızlarının kışlası; kapı önünde `tw(decoration/props/weaponrack)` x2 |
| Depocu Evi | `tw('buildings/blue/building_home_B_blue')` | (-33, 22) | 90 | 6 | + `gp(chest_iron)` x3 (-26,19) (-24.2,19.5) (-22.4,20) |
| Çiftçi Evi 1 | `tw('buildings/red/building_home_A_red')` | (31, 8) | -90 | 6 | bacadan duman (`ambient_dust` 0xd0d0d0) |
| Çiftçi Evi 2 | `tw('buildings/yellow/building_home_B_yellow')` | (34, 14) | -90 | 6 | önünde `kn(crops_wheatStageB)` x4 bahçe |
| Köylü Evi 3 | `tw('buildings/green/building_home_A_green')` | (-35, -4) | 90 | 6 | - |
| Silah Tezgahı | `gp('market_stall')` | (16, 6) | -90 | 1 | Silahçı Rüstem tezgâhın arkasında (`vendor_spot`); `tw(decoration/props/weaponrack)` x2 yanında |
| Zırh Tezgahı | `gp('market_stall')` | (16, 14) | -90 | 1 | Zırhçı Gülsüm; `ip(psx-medieval,market/jutesack_closed)` x2 |
| Metin Tüccarı Tezgahı | `gp('market_stall')` | (8, -8) | 0 | 1 | Kalıntı Tüccarı Zeynel; üstünde mor `gp(crystal_purple)` (0.5 ölçek) + ışık 0xb060ff r 6 |
| Eczane Çadırı | `gp('tent')` | (-10, 20) | 0 | 1 | + `gp(alchemy_table)` (-6,16), `gp(cauldron)` (-4,19) yeşil kabarcık VFX (`poison_cloud` 0x40ff80 x0.5) |
| Meydan Kuyusu | `gp('well')` | (0, 0) | 0 | 1 | meydanın merkezi; çevresinde 4 `hw(bench)` (0,-5) (0,5) (5,0) (-5,0) |
| Işınlanma Taşı | `gp('waypoint_stone')` | (12, 14) | 0 | 1 | Işınlayıcı Aylin yanında; yeniden doğuş noktası |
| Görev Panosu | `gp('notice_board')` | (-6, -7) | 0 | 1 | günlük görevler + köy ilanları |
| Kamp Ateşi | `gp('campfire')` | (18, -4) | 0 | 1 | ışık 0xff7a2a r 11 (LightPool), `ambient_embers` |

**Repeated structure** (builder rows, no per-item coordinates needed):

| Satır / yineleme kuralı | model | yerleşim | adet / not |
|---|---|---|---|
| Palisade (kuzey/güney) | `ip('psx-walls-fences','plackard-wall/plackard_closed_full')` | x -40..40, z=-28 ve z=+28; kapı boşluğu x -4..4 | 4 m modül, 18 parça/kenar |
| Palisade (batı) | `ip('psx-walls-fences','plackard-wall/plackard_closed_full')` | x=-40, z -28..28 | 14 parça |
| Palisade (doğu) | `ip('psx-walls-fences','plackard-wall/plackard_closed_full')` | x=+40, z -28..28; kapı boşluğu z -4..4 | 12 parça |
| Palisade köşe direkleri | `ip('psx-walls-fences','plackard-wall/plackard_corner_closed')` | (±40,±28) + her kapı yanı | 10 adet |
| Kapı kemerleri | `hw('arch')` | (0,-28) (0,28) rot 0, (40,0) rot 90; scale 1.9 | 3 adet; yanlarında `hw(post_lantern)` |
| Köşe gözcü kuleleri | `tw('buildings/red/building_tower_A_red')` | (±37,±25) | 4 adet; üstlerinde dekor okçu NPC (`TownNpc.decor: true`) |
| Sokak fenerleri | `gp('lamp_post')` | x=±5, z=-20,-8,8,20 | 8 adet; ışık yalnız en yakın 6 (LightPool) |
| Ağıl çiti | `ip('psx-walls-fences','low-wooden-fence/wooden_fence_closed')` | dikdörtgen x 18..34, z 20..27 | 4 kenar, 2.8 m modül; kapı boşluğu (18,23) |
| Ağıl samanları | `ip('psx-medieval','market/haybale')` | (22,24) (26,25) (30,22) | 3 adet |
| Ağıl hayvanları | `ip('creatures','deer')` | (24,22) (29,24) | 2 adet çevre canlısı (`Graze` döngüsü; "Binek Geyikleri — yakında") |
| Köy ağaçları | `ip('retro-psx-tree-pack','trees/tree13')` | (-38,-24) (38,-24) (-37,26) (37,26) (-38,12) | 5 adet |
| Çiçek tarhları | `ip('psx-medieval','decoration/flower_mixed')` | kuyu çevresi r 6 m, 8 adet; han önü 4 adet | 12 adet |
| Meydan zemini | splat disc (cobble) r 10 m + yol şeritleri | kapılar arası N-S şerit w 6 m, E-W şerit w 5 m (merkez (0,0)) | OutdoorBuilder splat op |

**NPCs** (`TownNpc`, `pos` is `[x, 0, z]` relative to the centre; the roles `quest`, `teleporter`, `stable` and the vendor `kind`s are the §9.1 additions):

| id | Ad (TR) | rol | model / yükleme | konum (x, z) m | rot° | arayüz · not |
|---|---|---|---|---|---|---|
| `npc_g_muhtar` | Muhtar Ferhat | quest | Barbarian (silahsız, pelerinsiz) tint 0x705030 | (-9, -15) | 0 | Ana görev zinciri + köy görevleri (`mq_02`..`mq_07`) |
| `npc_g_demirci` | Demirci Taner | blacksmith | Barbarian + `1H_Axe` | (-19, -10) | 90 | panel `blacksmith` (köyde yalnız +0..+9 ve Parçalama; Efsun/Oyma Kuzgunkale'de) |
| `npc_g_bakkal` | Bakkal Süleyman | merchant | Rogue_Hooded tint 0x406080 | (-21, 7) | 90 | panel `vendor` kind `merchant` (iksirler, parşömenler, Kırık taşlar) |
| `npc_g_silahci` | Silahçı Rüstem | merchant | Barbarian (aksesuarsız) tint 0x806040 | (18.5, 6) | -90 | panel `vendor` kind `weaponsmith` (sınıfına uygun beyaz silahlar ≤ seviye+3) |
| `npc_g_zirhci` | Zırhçı Gülsüm | merchant | Knight (miğfersiz) tint 0x8090b0 | (18.5, 14) | -90 | panel `vendor` kind `armorsmith` (beyaz zırhlar) |
| `npc_g_eczaci` | Eczacı Nermin | alchemist | Mage + `1H_Wand` tint 0x40a060 | (-9, 16.5) | 0 | panel `vendor` kind `alchemist` (Can/Ruh iksirleri 1-2. kademe) |
| `npc_g_depocu` | Depocu Hızır | stash | Barbarian + `Mug` tint 0x806040 | (-24, 17) | 0 | panel `stash` (Kuzgunkale ile aynı depo) |
| `npc_g_isinlayici` | Işınlayıcı Aylin | teleporter | Mage + `Spellbook_open` tint 0x60a0ff | (12, 10.5) | 0 | panel `waypoints` (§5.1): keşfedilmiş taşlara ve Kuzgunkale'ye ışınlar |
| `npc_g_kalinti` | Kalıntı Tüccarı Zeynel | merchant | Rogue_Hooded tint 0x30203a | (8, -10.8) | 0 | panel `vendor` kind `metin` (Metin Kalıntısı takası, §4.6) |
| `npc_g_seyis` | Seyis Kerem | stable | Rogue (silahsız) tint 0x806040 | (17, 22) | 90 | ileride binek sistemi; şimdilik konuşma: "Yakında ata biner, rüzgâr gibi geçersin." |
| `npc_g_avci` | Avcı Yıldız | quest | Rogue + `1H_Crossbow` tint 0x6a8040 | (-31, 0) | 90 | Av Defteri (biyolog tarzı koleksiyon) + av görevleri |
| `npc_g_ciftci` | Çiftçi Hatice | quest | npcs/Worker.glb x1.25 | (36, 20.5) | -90 | çiftlik/domuz görevleri (`sq_g_*`) |
| `npc_g_hanci` | Hancı Dursun | citizen | Barbarian + `Mug` tint 0x9a6a40 | (19, -12) | -90 | `Use_Item` her 8 sn; dinlenme dedikoduları |
| `npc_g_rahibe` | Rahibe Meryem | quest | Mage (silahsız) tint 0xe0e0f0 | (12, -17.5) | 0 | Şapel görevleri; "Köy Kutsaması": seviye ≤ 15 oyunculara saatte bir 15 dk +%10 XP |
| `npc_g_muhafiz_1` | Köy Muhafızı | guard | Knight + `1H_Sword` + `Rectangle_Shield` tint 0x8090b0 | (-5, -26) | 0 | kuzey kapı |
| `npc_g_muhafiz_2` | Köy Muhafızı | guard | aynı | (5, -26) | 0 | kuzey kapı |
| `npc_g_muhafiz_3` | Köy Muhafızı | guard | aynı | (-5, 26) | 180 | güney kapı (dışarı bakar) |
| `npc_g_muhafiz_4` | Köy Muhafızı | guard | aynı | (5, 26) | 180 | güney kapı |
| `npc_g_muhafiz_5` | Köy Muhafızı | guard | aynı | (38, -5) | 90 | doğu kapı |
| `npc_g_muhafiz_6` | Köy Muhafızı | guard | aynı | (38, 5) | 90 | doğu kapı |
| `npc_g_devriye_1` | Köy Devriyesi | guard | aynı | (-34, -22) | 0 | patrol loop (-34,-22) -> (34,-22) -> (34,22) -> (-34,22), tur 120 sn |
| `npc_g_devriye_2` | Köy Devriyesi | guard | aynı | (34, 22) | 0 | aynı döngü, yarım tur arayla |
| `npc_g_koylu_1` | Köylü | citizen | Worker x1.25 | (-4, 8) | 0 | kuyu başında `Interact`; bark: "Kurtlar yine tarlalara yaklaşmış." |
| `npc_g_koylu_2` | Köylü | citizen | Rogue (silahsız) rastgele tint | (4, -6) | 90 | `Sit_Floor_Idle` bank önünde |
| `npc_g_koylu_3` | Köylü Çocuk | citizen | Worker x0.8 | (2, 14) | 0 | meydanda koşar; bark: "Metin taşı görürsen yaklaşma, kaç!" |

### 2.4 Kızılkaya Karakolu (`koy_kizilkaya`), levels 10-20

*"Haydut Tepeleri'nin güney ucundaki garnizon: taş sur, Komutanlık Kalesi, okçuluk alanı. Bataklığa inmeden önce son güvenli yer."*

* Centre tile **(110, 106)** (world ≈ (442, 426) m), wall / safe box **±30 x ±24 m** (60 x 48 m), hex stone wall in 12 m modules, gates north `(0, -24)` (to R3) and south `(0, 24)` (to R4), 4 gate towers.
* **Respawn** `(4, 12)` facing 0. Zones: *Meydan* (±12), *Komutanlık* (x -10..10, z -24..-8), *Garnizon* (x 12..30, z 4..20), *Okçuluk Alanı* (x -14..6, z 8..24).
* Teaches the player the "outpost loop": buy better iksirler, upgrade to +9, stash the bag, teleport back to Gümüşdere or forward to Son Ocak.

```text
###############   ###############
#            CCCCCC             #
# eeee    EE CCCCCC       eeee  #
# eeee    EE CCCCCC       eeee  #
#      n  EE CCCCCC             #
#   DDDD       !!  www  HHHHH   #
#   DDDDn      OO  www  HHHHH   #
#         kkk  OO  zzz          #
#   BBBB  kkk     nzzz  GGGGG   #
#   BBBB n AAAAAAII     GGGGG   #
#   BBBB   AAAAAA       GGGGG   #
#   BBBB n AAAAAA        n  n   #
#                               #
#                               #
###############   ###############
```

Letters: `C` komutanlık · `H` han · `D` demirci · `B` pazar · `G` garnizon · `A` okçuluk alanı · `e` evler · `E` eczane · `k` Metin tezgâhı · `O` kuyu · `I` taş · `!` pano · `w`/`z` tezgâhlar.

| Yapı / dekor | model | konum (x, z) m | rot° | ölçek | not |
|---|---|---|---|---|---|
| Komutanlık Kalesi | `tw('buildings/red/building_castle_red')` | (0, -15) | 0 | 5 | ufuk işareti 20 m; sancak `gp(banner_red)` x2 |
| Kızılkaya Hanı | `tw('buildings/red/building_tavern_red')` | (20, -4) | -90 | 6 | - |
| Demirci Dükkânı | `tw('buildings/red/building_blacksmith_red')` | (-20, -4) | 90 | 6 | + anvil/grind seti (-14,-3) |
| Karakol Pazarı | `tw('buildings/blue/building_market_blue')` | (-20, 11) | 90 | 6 | - |
| Garnizon Kışlası | `tw('buildings/red/building_barracks_red')` | (21, 11) | -90 | 6 | devriye muhafızlarının çıkışı |
| Okçuluk Alanı | `tw('buildings/blue/building_archeryrange_blue')` | (-4, 14) | 0 | 6 | + `tw(decoration/props/target)` x4 (z 21) |
| Karakol Evi 1 | `tw('buildings/red/building_home_A_red')` | (-24, -15) | 90 | 6 | - |
| Karakol Evi 2 | `tw('buildings/red/building_home_B_red')` | (24, -15) | -90 | 6 | - |
| Zırh Tezgahı | `gp('market_stall')` | (9, 4) | -90 | 1 | Zırhçı |
| Silah Tezgahı | `gp('market_stall')` | (9, -4) | -90 | 1 | Silahçı (meydan tarafında) |
| Metin Tüccarı Tezgahı | `gp('market_stall')` | (-9, 4) | 90 | 1 | Kalıntı Tüccarı |
| Eczane Çadırı | `gp('tent')` | (-10, -14) | 0 | 1 | + `gp(alchemy_table)` (-10,-9) |
| Kuyu | `ip('nocturnal-watch','well')` | (0, 0) | 0 | 1 | meydan merkezi (3 m) |
| Işınlanma Taşı | `gp('waypoint_stone')` | (4, 10) | 0 | 1 | yeniden doğuş |
| Görev Panosu | `gp('notice_board')` | (0, -5) | 0 | 1 | - |

| Satır / yineleme kuralı | model | yerleşim | adet / not |
|---|---|---|---|
| Sur (kuzey/güney) | `tw('buildings/neutral/wall_straight')` | z=-24 ve z=+24, x -30..30 | 12 m modül: 2 + (kapı) + 2; ortada `wall_straight_gate` (x -6..6) |
| Sur (doğu/batı) | `tw('buildings/neutral/wall_straight')` | x=±30, z -24..24 | 4 modül/kenar |
| Sur köşeleri | `tw('buildings/neutral/wall_corner_A_outside')` | (±30,±24) | 4 adet |
| Kapı kuleleri | `tw('buildings/red/building_tower_B_red')` | (-12,-24) (12,-24) (-12,24) (12,24) | 4 adet, 15 m; üstlerinde `ip(nocturnal-watch,torch)` + ışık |
| Kuşatma kalıntıları (dışarı) | `kc('siege-catapult-demolished')` | (0,34) (-14,38) (16,36) | dekor, çarpışmalı |
| Atlı kervan arabaları | `gp('wagon')` | (24,18) (-26,22) | 2 adet |
| Meydan zemini | splat disc (cobble) r 12 m + kapı şeritleri | merkez (0,0) | OutdoorBuilder splat op |

| id | Ad (TR) | rol | model / yükleme | konum (x, z) m | rot° | arayüz · not |
|---|---|---|---|---|---|---|
| `npc_k_komutan` | Komutan Aslan | quest | Knight + `2H_Sword` tint 0xc0a060 | (0, -7.5) | 0 | Ana görev zinciri (`mq_13`..`mq_15`) |
| `npc_k_demirci` | Demirci Bilal | blacksmith | Barbarian + `1H_Axe` | (-14.5, -4) | 90 | panel `blacksmith` (+0..+9, Parçalama) |
| `npc_k_bakkal` | Bakkal Hatice | merchant | Rogue_Hooded tint 0x406080 | (-14, 11) | 90 | panel `vendor` kind `merchant` |
| `npc_k_silahci` | Silahçı Orhan | merchant | Barbarian tint 0x806040 | (11.5, -4) | -90 | kind `weaponsmith` |
| `npc_k_zirhci` | Zırhçı Melek | merchant | Knight (miğfersiz) | (11.5, 4) | -90 | kind `armorsmith` |
| `npc_k_eczaci` | Eczacı Selvi | alchemist | Mage + `1H_Wand` tint 0x40a060 | (-10, -9) | 0 | kind `alchemist` (kademe 2-3 iksirler) |
| `npc_k_depocu` | Depocu Nuri | stash | Barbarian + `Mug` | (-17, -12) | 90 | panel `stash` |
| `npc_k_isinlayici` | Işınlayıcı Efe | teleporter | Mage + `Spellbook_open` | (4, 6.5) | 0 | panel `waypoints` |
| `npc_k_kalinti` | Kalıntı Tüccarı Sabri | merchant | Rogue_Hooded tint 0x30203a | (-11.5, 4) | 90 | kind `metin` |
| `npc_k_avci` | Avcı Karaca | quest | Rogue + `1H_Crossbow` | (-14, 19) | 0 | Haydut Tepeleri / bataklık av görevleri |
| `npc_k_kervanci` | Kervancı Mahir | merchant | Rogue_Hooded | (24.5, 19.5) | 180 | kind `merchant` (nadir, günlük rotasyonlu 3 eşya: Büyülü + 1 Nadir) |
| `npc_k_seyis` | Seyis Ceyhun | stable | Rogue (silahsız) | (18, 18) | 0 | binek yer tutucu |
| `npc_k_muhafiz_1` | Karakol Muhafızı | guard | Knight + kılıç/kalkan tint 0xa04040 | (-6, -22) | 0 | kuzey kapı |
| `npc_k_muhafiz_2` | Karakol Muhafızı | guard | aynı | (6, -22) | 0 | kuzey kapı (Haydut Tepeleri yönü) |
| `npc_k_muhafiz_3` | Karakol Muhafızı | guard | aynı | (-6, 22) | 180 | güney kapı (bataklık yönü) |
| `npc_k_muhafiz_4` | Karakol Muhafızı | guard | aynı | (6, 22) | 180 | güney kapı |
| `npc_k_devriye_1` | Surlu Devriye | guard | aynı | (-26, -20) | 0 | patrol (-26,-20) -> (26,-20) -> (26,20) -> (-26,20), 100 sn |
| `npc_k_devriye_2` | Surlu Devriye | guard | aynı | (26, 20) | 0 | yarım tur arayla |
| `npc_k_okcu_hedef` | Okçu Eğitmeni | trainer | Rogue + `1H_Crossbow` | (-4, 20) | 0 | hedef tahtaları: DPS ölçer (5 sn pencere) |
| `npc_k_askerler` | Dinlenen Asker | citizen | Knight (silahsız) x2 | (14, 8) | 0 | `Sit_Floor_Idle` |

### 2.5 Son Ocak Kampı (`kamp_son_ocak`) and the camp hubs

**Son Ocak Kampı**: centre tile **(30, 94)**, no wall (a half palisade on three sides), safe box **±14 x ±12 m**, respawn `(0, 4)` facing 0. Services: teleporter, traveller (merchant + Metin shop in two tabs), alchemist (tier-3 potions), quest giver, waypoint. It is the base for the Lanetli Harabeler and stands at the R5/R6 border.

| Yapı / dekor | model | konum (x, z) m | rot° | ölçek | not |
|---|---|---|---|---|---|
| Komuta Çadırı | `ks('tent')` | (0, -6) | 0 | 3 | + `gp(banner_red)` x2 |
| Revir Çadırı | `gp('tent')` | (-8, -4) | 90 | 1 | Gezgin Eczacı |
| Erzak Çadırı | `ks('tent')` | (8, -4) | -90 | 3 | + `gp(crate_a)` x4, `gp(barrel)` x3, `gp(sacks)` |
| Kamp Ateşi | `gp('campfire')` | (0, 2) | 0 | 1 | ışık + `ambient_embers`; 4 `hw(bench)` çevrede |
| Işınlanma Taşı | `gp('waypoint_stone')` | (0, 9) | 0 | 1 | yeniden doğuş |

| Satır / yineleme kuralı | model | yerleşim | adet / not |
|---|---|---|---|
| Yarım palisade | `ip('psx-walls-fences','plackard-wall/plackard_broken')` | kuzey/doğu/batı kenar (x ±14, z -12) | 8 parça; güney açık (kamp harabelere kuzeyden bakar, geri çekilme yolu güneyde) |

| id | Ad (TR) | rol | model / yükleme | konum (x, z) m | rot° | arayüz · not |
|---|---|---|---|---|---|---|
| `npc_s_nobetci` | Nöbetçi Başı Talha | quest | Knight + kılıç/kalkan tint 0x6a7a90 | (0, -9) | 0 | Lanetli Harabeler görevleri (`mq_17`, `mq_18`) |
| `npc_s_eczaci` | Gezgin Eczacı Hülya | alchemist | Mage + `1H_Wand` | (-8, -1) | 90 | kind `alchemist` (kademe 3 iksirler) |
| `npc_s_tuccar` | Gezgin Tüccar Mahir | merchant | Rogue_Hooded | (8, -1) | -90 | kind `merchant` + `metin` (tek NPC iki sekme) |
| `npc_s_isinlayici` | Işınlayıcı Duru | teleporter | Mage + `Spellbook_open` | (3, 7) | 0 | panel `waypoints` |
| `npc_s_muhafiz_1` | Nöbetçi | guard | Knight | (-6, 10) | 180 | güney yaklaşım yolu |
| `npc_s_muhafiz_2` | Nöbetçi | guard | Knight | (6, 10) | 180 | güney yaklaşım yolu |

**Camp hubs** (tiny, safe radius 10-12 m, one waypoint stone, one fire, 2-4 NPCs; they exist so that every 40-50 tiles of road has a fire and a respawn point):

| id | Ad | Bölge | merkez (karo) | waypoint | NPC'ler | yerleşim / dekor |
|---|---|---|---|---|---|---|
| `kamp_ciftlik` | Altın Ambar Çiftliği | R2 | (122, 20) (≈ 490, 82 m) | `wp_ciftlik` | Çiftlik Sahibi Rıza (quest, `Worker`), Avcı Gülizar (quest, Rogue), Çiftçi Anne Zeliha (citizen), 2 Çiftlik Muhafızı (guard) | çiftlik evi `kf(...)` x2 + ambar `ip(psx-medieval,market/hay_covered)`, tarla `kn(crops_*)` x20, çit `kn(fence_planks)`, kuyu `gp(well)`, çan direği, waypoint taşı, kamp ateşi; güvenli bölge r 12 m |
| `kamp_iskele` | Bataklık İskelesi | R4 | (84, 138) (≈ 338, 554 m) | `wp_iskele` | İskele Bekçisi Ömer (quest), Gezgin Eczacı Fadime (alchemist) | tahta iskele `kn(path_wood*)` + `kn(bridge_wood*)` x6, fenerler `hw(lantern_standing)` x6 (cyan ışık), kayık `kn(canoe)` x2, bekçi kulübesi `ip(nocturnal-watch,tavern_*)` 3x3 m, waypoint; güvenli bölge r 10 m |
| `kamp_kanyon` | Kanyon Girişi Kampı | R5 | (52, 134) (≈ 210, 538 m) | `wp_kanyon` | Teğmen Deniz (quest, Knight), Gezgin Tüccar Oğuz (merchant), Işınlayıcı Nil (teleporter) | palisade yarım `plackard_open`, 3 `ks(tent)` x3, kuşatma kalıntısı `kc(siege-ballista-demolished)`, kırmızı bayraklar, waypoint; güvenli bölge r 10 m |

### 2.6 Teleporter network, vendor stock rules

* **Waypoints** are discovered by walking within 6 m of the stone (or interacting). The Işınlayıcı NPC opens the `waypoints` panel (§9.1): list of discovered stones + **Kuzgunkale**.
* **Fare**: `gold = round(10 + 1.5 * level) * hops`, `hops = min(4, 1 + floor(distanceTiles / 60))`. Examples at level 10: Gümüşdere → Kızılkaya (≈ 100 tiles → 2 hops) = 50 gold; Kızılkaya → Son Ocak (≈ 110 tiles) = 50 gold. **Kuzgunkale ↔ Gümüşdere is free**; Kuzgunkale ← other villages cost 3 x the normal fare (the `scroll_town` alternative costs 25 gold). Cooldown 30 s, impossible in combat (5 s after the last hit), impossible in dungeons. Discovering a stone for the first time is free of charge to travel *from* that stone's village.
* **Vendor `kind`s** (items module, `Vendor.ts`): `weaponsmith` stocks 6 white weapons of the character's class, ilvl = player level + 1, price = `sell x 4` (GDD_SYSTEMS §6.4); `armorsmith` stocks 8 white armour pieces (helm, shoulders, chest, gloves, legs, boots, shield/tome as the class allows); `merchant` stocks `pot_hp_t` / `pot_res_t` of the tiers unlocked at the player's level (GDD_SYSTEMS §6.4 buy list), `scroll_town`, Kırık taşlar; **Kervancı Mahir** (Kızılkaya) sells a daily rotating set of 3 items (2 Büyülü + 1 Nadir at ilvl = player level); `alchemist` follows the settlement tier shown in §2.1.


---

## 3. Creatures, camps and farm spots

### 3.1 The roster: reuse first, 34 new defs

The open world reuses **every existing `ow_*` def** (`ow_rat`, `ow_slime`, `ow_goblin`, `ow_goblin_shaman`, `ow_mushnub`, `ow_spider`, `ow_zombie`, `ow_bat`, `ow_orc_chief`, `treasure_goblin`, `wb_curukkok`) and borrows crypt/temple defs where they fit (`skel_*`, `crypt_ghoul`, `crypt_wraith`, `bone_golem`, `cult_*`, `shade`, `shadow_priest`) — their `forces` values are irrelevant outside M+. **34 new defs** (`ow_` prefix, appended to `src/data/enemies.ts` by the enemies module) fill the gaps with models that already exist in `public/assets/models` but were never used by any enemy: the 11 itch **Fantasy Creatures** (wolf, warg, bear, rhino, deer, ooze, spider, centipede, wasp, + mammoth/rat for map 2), the Bestiary **Puglin**, the generated creatures (`wolf_dire`, `mushroom_brute`, `wraith`, `golem_stone`, `elemental_fire`), KayKit adventurers as bandits, orc shamans and grave knights, and two animated Kenney graveyard characters.

How to read the tables (same conventions as `GDD_CONTENT.md` §3): `HP x` / `DMG x` multiply `monsterHP(L)` / `monsterDmg(L)` (GDD_SYSTEMS §1.10: `14 + 0.62 L²` / `14 + 4.5 L`) and replace the rank default; `scale` is for the native-KayKit world (hero 2.4 m); `speed` in m/s against the 7 m/s player; ability strings map 1:1 onto `EnemyAbility` (`cone`, `proj`, `aoe`, `line`, `heal`, `buff` builders in `data/enemies.ts`; "charge" = `kind: 'charge'` with `params.dash`). Clip names in backticks are the real clip names of each GLB (the itch creatures use clean names `Idle Walk Run Bite Lunge Howl Hit Death`; the animation sets to add next to `A_KAYKIT` etc.: `A_WOLF = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death' }`, `A_WASP = { idle: 'Fly', walk: 'Fly', run: 'Fly', death: 'Death' }`, `A_PUGLIN = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit_Front', death: 'Death_A' }`, `A_KENNEY = { idle: 'idle', walk: 'walk', run: 'sprint', death: 'die' }`; verify with `node tools/glb-inspect.mjs`). Resist profiles are the existing `R_BEAST` (none), `R_SPIDER`, `R_GHOST`, `R_CULT`, `R_GOLEM`, `R_DEMON`, `R_SKELETON`.

| id | Ad (TR) | model | ölçek / ton | rol / rütbe | HP x | DMG x | hız m/s | aggro m | yarıçap | direnç | Sv. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ow_wolf` | Orman Kurdu | `itch/creatures/wolf.glb` | x0.8 | melee / trash | 0.8 | 0.9 | 7.4 | 10 | 0.55 | R_BEAST | 2-12 |
| `ow_wolf_dire` | Dehşet Kurdu | `gen/creatures/wolf_dire.glb` | x1.0 | melee / elite | 3.5 | 1.4 | 7.8 | 12 | 0.7 | R_BEAST | 10-15 |
| `ow_warg` | Savaş Kurdu | `itch/creatures/warg.glb` | x0.95 | melee / elite | 4.2 | 1.5 | 8.0 | 12 | 0.8 | R_BEAST | 11-25 |
| `ow_boar` | Yaban Domuzu | `itch/creatures/rhino.glb` | x0.42 · tint 0x7a5a40 | melee / trash | 1.1 | 1.0 | 6.4 | 9 | 0.6 | R_BEAST | 3-15 |
| `ow_bear` | Boz Ayı | `itch/creatures/bear.glb` | x0.9 | melee / elite | 3.6 | 1.5 | 5.6 | 11 | 0.95 | R_BEAST | 7-25 |
| `ow_rhino` | Dağ Gergedanı | `itch/creatures/rhino.glb` | x0.95 | melee / elite | 4.0 | 1.7 | 5.0 | 11 | 1.1 | R_BEAST | 12-25 |
| `ow_wasp` | Orman Arısı | `itch/creatures/wasp.glb` | x0.55 | swarm / trash | 0.3 | 0.5 | 6.0 | 10 | 0.4 | R_BEAST | 3-15 |
| `ow_deer` | Geyik | `itch/creatures/deer.glb` | x0.8 | support / trash | 0.5 | 0.6 | 9.5 | 14 | 0.7 | R_BEAST | 1-8 |
| `ow_bandit` | Haydut | `characters/Rogue.glb` | x1.0 · tint 0x8a6a48 | melee / trash | 1.0 | 1.0 | 6.0 | 10 | 0.5 | R_BEAST | 7-16 |
| `ow_bandit_archer` | Haydut Okçusu | `characters/Rogue.glb` | x1.0 · tint 0x6a5a40 | ranged / trash | 0.8 | 1.0 | 5.6 | 14 | 0.5 | R_BEAST | 8-16 |
| `ow_bandit_brute` | Haydut Pehlivanı | `characters/Barbarian.glb` | x1.12 · tint 0x6a4a38 | melee / elite | 4.0 | 1.5 | 5.2 | 11 | 0.8 | R_BEAST | 10-16 |
| `ow_bandit_chief` | Haydut Başı | `characters/Knight.glb` | x1.25 · tint 0x5a3a30 | melee / elite | 6.0 | 1.6 | 5.4 | 12 | 0.7 | R_BEAST | 12-16 |
| `ow_puglin` | Puglin Yağmacı | `itch/bestiary/puglin.glb` | x0.9 | melee / trash | 0.9 | 0.9 | 5.6 | 10 | 0.55 | R_BEAST | 7-15 |
| `ow_puglin_chief` | Puglin Reisi | `itch/bestiary/puglin.glb` | x1.4 | melee / elite | 4.0 | 1.5 | 5.2 | 12 | 0.9 | R_BEAST | 5-15 |
| `ow_scarecrow` | Korkuluk | `characters/Barbarian.glb` | x1.05 · tint 0xc8a860 | melee / trash | 1.2 | 1.0 | 3.8 | 8 | 0.55 | R_BEAST | 5-9 |
| `ow_mushroom_brute` | Mantar Zorbası | `gen/creatures/mushroom_brute.glb` | x1.0 | tank / trash | 1.8 | 1.0 | 3.8 | 9 | 0.9 | R_BEAST | 7-10 |
| `ow_ghoul` | Bataklık Gulyabanisi | `monsters/Zombie.glb` | x0.95 · tint 0x7a9a6a | melee / trash | 1.4 | 1.2 | 4.2 | 9 | 0.55 | R_BEAST | 15-20 |
| `ow_wraith` | Ağıt Hortlağı | `gen/creatures/wraith.glb` | x1.0 | caster / trash | 1.0 | 1.2 | 4.8 | 12 | 0.6 | R_GHOST | 16-30 |
| `ow_ooze` | Bataklık Çamuru | `itch/creatures/ooze.glb` | x0.55 · tint 0xcaa040 | melee / trash | 1.5 | 1.0 | 2.8 | 8 | 0.9 | R_BEAST | 15-19 |
| `ow_ooze_half` | Çamur Parçası | `itch/creatures/ooze.glb` | x0.34 · tint 0xcaa040 | swarm / trash | 0.25 | 0.5 | 3.6 | 10 | 0.5 | R_BEAST | 15-19 |
| `ow_spider_giant` | Dev Örümcek | `itch/creatures/spider.glb` | x0.8 | melee / elite | 3.5 | 1.4 | 6.4 | 12 | 1.2 | R_SPIDER | 16-25 |
| `ow_centipede` | Çürük Çıyanı | `itch/creatures/centipede.glb` | x1.0 | melee / trash | 1.2 | 1.1 | 6.0 | 7 | 0.7 | R_BEAST | 16-25 |
| `ow_will` | Bataklık Işığı | `monsters/Ghost.glb` | x0.5 · tint 0x60ffd0 | swarm / trash | 0.3 | 1.5 | 6.5 | 10 | 0.4 | R_GHOST | 15-22 |
| `ow_witch` | Bataklık Cadısı | `characters/Mage.glb` | x1.1 · tint 0x3a8a58 | caster / elite | 3.2 | 1.2 | 5.0 | 14 | 0.5 | R_CULT | 17-20 |
| `ow_orc` | Ork Savaşçısı | `monsters/Orc.glb` | x0.95 | melee / trash | 1.3 | 1.2 | 5.2 | 11 | 0.75 | R_BEAST | 20-25 |
| `ow_orc_archer` | Ork Fırlatıcısı | `monsters/Orc.glb` | x0.9 · tint 0x9a8a40 | ranged / trash | 1.0 | 1.2 | 5.0 | 14 | 0.7 | R_BEAST | 20-25 |
| `ow_orc_shaman` | Ork Şamanı | `characters/Mage.glb` | x1.1 · tint 0x6a9a30 | support / trash | 1.0 | 1.0 | 5.0 | 14 | 0.5 | R_CULT | 21-25 |
| `ow_orc_brute` | Ork Cellatı | `monsters/Orc.glb` | x1.3 · tint 0xb8a090 | melee / elite | 4.8 | 1.7 | 4.8 | 12 | 1.0 | R_BEAST | 22-25 |
| `ow_imp` | Kanyon İblisçiği | `monsters/Imp.glb` | x0.7 · tint 0xff8040 | ranged / trash | 0.8 | 1.1 | 6.5 | 14 | 0.5 | R_DEMON | 20-25 |
| `ow_golem` | Kanyon Golemi | `gen/creatures/golem_stone.glb` | x1.0 | tank / elite | 5.0 | 1.6 | 3.2 | 11 | 1.5 | R_GOLEM | 22-25 |
| `ow_ember` | Kor Elementali | `gen/creatures/elemental_fire.glb` | x1.0 | caster / elite | 3.5 | 1.5 | 4.5 | 13 | 1.1 | R_DEMON | 21-25 |
| `ow_grave_knight` | Mezar Şövalyesi | `characters/Knight.glb` | x1.1 · tint 0x4a4a68 | tank / elite | 4.5 | 1.5 | 5.0 | 11 | 0.7 | R_SKELETON | 26-30 |
| `ow_vampire` | Kan Lordu | `kenney/graveyard-kit/character-vampire.glb` | x3.0 | melee / elite | 4.2 | 1.5 | 6.0 | 13 | 0.7 | R_GHOST | 27-30 |
| `ow_keeper` | Mezarlık Bekçisi | `kenney/graveyard-kit/character-keeper.glb` | x3.0 | melee / elite | 6.0 | 1.4 | 5.0 | 11 | 0.7 | R_BEAST | 9-10 |

| id | temel saldırı (basicAttack) | yetenekler (abilities) | not (visual / ai) |
|---|---|---|---|
| `ow_wolf` | Isırık: cone 2.0 m 90°, cd 1.4, coef 1.0 (`Bite`, impact 0.47) | Atılma: charge 7 m, cd 7, windup 0.6, coef 1.2 (`Lunge`, impact 0.87) · Uluma: yarı canda bir kez +1 `ow_wolf` çağırır (summoned, xp 0; `Howl` 0.8) | Karanlık sürü varyantı: tint 0x6a6a72 |
| `ow_wolf_dire` | Isırık: cone 2.4 m 90°, cd 1.8, coef 1.0 (`Attack`, impact 0.5) | Kemik Kıran: charge 8 m, windup 0.8, cd 9, coef 1.8 + knockdown 1 sn · Sürü Emri: 12 m içindeki müttefikler +%25 saldırı hızı 8 sn (cd 20) | Kurt sürülerinin lideri |
| `ow_warg` | Isırık: cone 2.6 m 100°, cd 1.9, coef 1.0 (`Bite`, impact 0.5) | Atılma: charge 9 m, windup 0.8, cd 9, coef 1.9 (`Lunge` 0.93) · Savaş Uluması: bir kez, 14 m içinde +%25 hasar 8 sn ve 2 `ow_wolf` çağırır (`Howl` 0.8) | Maske + eyer düğümleri (`WargMask`, `WargTack`) görünür |
| `ow_boar` | Boynuz: cone 1.8 m 100°, cd 1.6, coef 1.0 (`Gore`, impact 0.45) | Hücum: line 8 x 1.6 m, windup 0.8, cd 8, coef 1.6, dash 0.6 sn (`Charge`) | `Spear` düğümü gizlenir (visual.hide) |
| `ow_bear` | Pençe: cone 2.8 m 110°, cd 2.0, coef 1.0 (`Swipe`, impact 0.42) | Yer Darbesi: self_aoe r 4 m, windup 1.0, cd 11, coef 2.0 (`Slam` 0.77) · Kükreme: kendine +%20 hasar 8 sn, cd 20 (`Roar` 0.3) | Dokunulmadıkça uyur (`Sleep`→`Wake`, ai.dormant) |
| `ow_rhino` | Boynuz: cone 3.0 m 100°, cd 2.2, coef 1.0 (`Gore`, impact 0.45) | Hücum: line 12 x 2.2 m, windup 1.1, cd 10, coef 2.4 + knockdown 0.8 sn (`Charge`) · Tepinme: self_aoe r 4.2, windup 1.0, cd 12, coef 1.8 (`Stamp` 1.0) | Kızıl Boynuz varyantı: tint 0xb05040 |
| `ow_wasp` | İğne: cone 1.6 m, cd 1.3, coef 1.0, zehir 1 yük %25 (`Sting`, impact 0.6) | Dalış: charge 6 m, windup 0.5, cd 6, coef 1.2 (`Dive` 0.9) | flying:true (hover modelde pişmiş); `ow_wasp_swamp`: tint 0x88a838, zehir 2 yük, L15-20 |
| `ow_deer` | Boynuz Vuruşu: yalnızca köşeye sıkışınca, cone 2.0 m, coef 0.6 (`Attack`, 0.5) | - (ai.flee + ai.neutral: saldırmaz, oyuncudan kaçar) | Çevre canlısı + av görevi; `Geyik Derisi` düşürür |
| `ow_bandit` | Hançer: cone 2.2 m 100°, cd 1.5, coef 1.0 (`Dualwield_Melee_Attack_Slice`, impact 0.55) | Bıçak Fırlat: projectile 15 m/s, range 14, windup 0.6, cd 6, coef 1.1 (`Throw` 0.75) | ROGUE_HIDE eksi Knife / Knife_Offhand |
| `ow_bandit_archer` | Ok: projectile 22 m/s, range 18, cd 2.4, coef 1.0 (`2H_Ranged_Shoot`, impact 0.15) · ai.kite [9,15] | Çoklu Ok: 3 ok, yelpaze 15°, windup 1.0, cd 10, coef 0.9 (hitscan) | `2H_Crossbow` görünür, kalan ROGUE_HIDE gizli |
| `ow_bandit_brute` | Balta: cone 3.0 m 110°, cd 2.2, coef 1.0 (`2H_Melee_Attack_Slice`, impact 0.5) | Yer Sarsıntısı: self_aoe r 4.2, windup 1.0, cd 11, coef 2.0 (`2H_Melee_Attack_Chop` 0.6) · Savaş Narası: r 12 +%25 hasar 8 sn, cd 20 (`war_cry`) | `2H_Axe` görünür, kalan aksesuarlar gizli |
| `ow_bandit_chief` | Kılıç: cone 2.8 m 100°, cd 2.0, coef 1.0 (`1H_Melee_Attack_Slice_Horizontal`, impact 0.3) | Kalkan Darbesi: cone 3 m, stun 1.5 sn, windup 0.8, cd 12, coef 0.8 · Yardım Çağır: %60 canda bir kez 3 `ow_bandit` çağırır | `1H_Sword` + `Round_Shield` görünür |
| `ow_puglin` | Sopa: cone 2.0 m 100°, cd 1.6, coef 1.0 (`Attack_1H_1`, impact 0.25) | Mızrak Fırlat: projectile 14 m/s, range 14, windup 0.7, cd 6, coef 1.2 (`Throw`, impact 0.6) | Bestiary 7.5k tri: kamp başına ≤ 7 örnek |
| `ow_puglin_chief` | Sopa Fırtınası: cone 3.2 m 110°, cd 2.4, coef 1.2 (`Attack_1H_2`, impact 0.35) | Savaş Narası: r 12 +%25 hasar 8 sn, cd 20 (`Taunt`) · Yere Vur: self_aoe r 3.5, windup 0.9, cd 10, coef 1.8 (`Attack_2H` 0.8) | Puglin texture varyantları: `puglin_2` kırmızı, `puglin_3` mavi (tint yerine texture swap) |
| `ow_scarecrow` | Çatal: cone 2.6 m 90°, cd 2.0, coef 1.0 (`Unarmed_Melee_Attack_Punch_A`, impact 0.45) | Saman Bulutu (ölünce): self_aoe r 3, kör 2 sn (`blind`), hasarsız | ai.dormant (tarlada gerçek korkuluk gibi durur, wakeRange 7); tüm aksesuarlar gizli |
| `ow_mushroom_brute` | Kafa Darbesi: cone 2.4 m 100°, cd 2.0, coef 1.0 (`Attack`, impact 0.5) | Spor Patlaması: self_aoe r 3, windup 0.9, cd 12, coef 0.4 zehir, persist 4 sn tick 0.5 (`Cast` 0.6) · Ölünce 2 `ow_mushnub` | Çürük Höyük çevresi |
| `ow_ghoul` | Pençe: cone 2.2 m 100°, cd 2.0, coef 1.0 (`Attack`, impact 0.37) | Çürük Nefes: cone 60° 4 m, windup 0.8, cd 10, coef 0.4 zehir 3 yük · Leş Çağrısı: %50 canda bir kez 2 `ow_zombie` | ow_zombie kardeşi |
| `ow_wraith` | Gölge Oku: projectile 15 m/s, range 16, cd 2.6, windup 0.6, coef 1.2 gölge (`Attack`) · ai.kite [8,14] | Korku Çığlığı: cast 1.6 sn (kesilebilir), cone 70° 8 m, korku 1.5 sn, cd 14 (`Cast` 0.9) | flying:true; saydamlık 0.8 |
| `ow_ooze` | Kırbaç: cone 3.0 m 110°, cd 2.2, coef 1.0 (`Lash`, impact 0.67) | Asit Tükürüğü: projectile 12 m/s, range 12, windup 0.7, cd 7, coef 0.9 zehir 1 yük (`Spit` 0.7) · Bölünme (ölünce): 2 `ow_ooze_half` | Alfa-blend jöle; kamp başına ≤ 5 örnek |
| `ow_ooze_half` | Kırbaç: cone 1.8 m, cd 1.6, coef 1.0 (`Lash`) | — | ai.summoned, xp 0 |
| `ow_spider_giant` | Isırık: cone 2.8 m 100°, cd 1.8, coef 1.0 zehir 2 yük (`Bite`, impact 0.5) | Atılma: charge 8 m, windup 0.7, cd 9, coef 1.8 (`Strike` 0.73) · Ağ Atışı: projectile 16 m/s, kök 2 sn, cd 12 (`WebSpit` 0.67) | Zehirli Mağara + Çürük Ana Yuvası |
| `ow_centipede` | Zehirli Isırık: cone 2.6 m 90°, cd 1.8, coef 1.0 zehir 2 yük (`Bite`, impact 0.55) | — | ai.dormant + spawn klibi `Emerge` (yerden fırlar); wakeRange 7 |
| `ow_will` | Patlama: self_aoe r 2.5, windup 0.8, coef 2.0, suicide (bone_skull gibi) | — | flying:true; emissive 0x60ffd0 |
| `ow_witch` | Zehir Topu: projectile 16 m/s, range 16, cd 2.2, coef 1.3 zehir 2 yük (`Spellcast_Shoot`, impact 0.3) · ai.kite [8,14] | Kurbağa Laneti: cast 1.5 sn (kesilebilir), kök 2 sn + `curse` 6 sn · Şifa Duası: cast 2.0 sn (kesilebilir), %25 can, cd 10 | `Mage_Hat` + `1H_Wand` görünür |
| `ow_orc` | Balta: cone 3.0 m 110°, cd 2.2, coef 1.0 (`Weapon`, impact 0.45, windup 0.55) | Dönen Balta: self_aoe r 3.5, windup 0.9, cd 9, coef 1.4 | ow_orc_chief ile aynı model |
| `ow_orc_archer` | Zıpkın: projectile 20 m/s, range 18, cd 2.8, coef 1.3 (`Weapon`, impact 0.45) · ai.kite [9,14] | Zincirli Zıpkın: hedefi 6 m kendine çeker, windup 1.0, cd 14 | - |
| `ow_orc_shaman` | Ateş Oku: projectile 16 m/s, cd 2.4, coef 1.2 ateş (`Spellcast_Shoot`) · ai.kite [8,14] | Kan Kızgınlığı: 14 m içinde +%25 hasar 8 sn, cast 1.2 sn, cd 16 · Şifa Duası: %20 can, cast 2.0 sn (kesilebilir), cd 10 | `1H_Wand` görünür |
| `ow_orc_brute` | Pala: cone 3.4 m 110°, cd 2.4, coef 1.3 (`Weapon`, impact 0.45) | Yarma: line 8 x 2.2 m, windup 1.1, cd 9, coef 2.4 · Savaş Narası: r 12 +%25 hasar 8 sn, cd 20 | - |
| `ow_imp` | Ateş Topu: projectile 16 m/s, range 16, cd 2.4, coef 1.2 ateş · ai.kite [8,14] | Kıvılcım Yağmuru: ground_aoe r 3, windup 1.0, cd 8, coef 1.0 | forge_imp kopyası; flying:true |
| `ow_golem` | Taş Yumruk: cone 3.6 m 110°, cd 2.4, coef 1.2 (`Attack2`, impact 0.57) | Yer Darbesi: self_aoe r 4.5, windup 1.1, cd 11, coef 2.2 (`Attack` 0.67) | Taş Ocağı çevresi |
| `ow_ember` | Alev Topu: projectile 15 m/s, range 16, cd 2.6, coef 1.4 ateş (`Cast`, impact 0.9) · ai.kite [6,12] | Ateş Halkası: self_aoe r 6, windup 1.3, cd 12, coef 1.8 | flying:true (hover 0.1) |
| `ow_grave_knight` | Kılıç: cone 2.8 m 100°, cd 2.2, coef 1.0 (`1H_Melee_Attack_Slice_Horizontal`, impact 0.3) | Kalkan Duvarı: kendine kalkan %25 maks. can, 8 sn, cd 18 · Mezar Darbesi: cone 3.2 m, stun 1.2 sn, windup 1.0, cd 12, coef 1.6 | `1H_Sword` + `Rectangle_Shield`; göz emissive 0x80a0ff |
| `ow_vampire` | Pençe: cone 2.4 m 100°, cd 1.8, coef 1.0, hasarın %30'u kadar can çalar (`attack-melee-right`) | Yarasa Sürüsü: 4 `ow_bat` çağırır, cd 25 · Kan Hasadı: self_aoe r 5, windup 1.1, cd 12, coef 1.8 (can çalar) | Kenney animasyonlu karakter (x3 = 2.4 m); klip adları: idle/walk/sprint/attack-melee-right/die |
| `ow_keeper` | Kürek: cone 2.6 m 110°, cd 2.2, coef 1.0 (`attack-melee-left`) | Toprak Fırlat: projectile 14 m/s, kör 2 sn, cd 8 · Mezar Aç: 3 `skel_rattler` çağırır (%50 canda bir kez) | Hovardan mini-boss modeli |

**Notes for the enemies module**

* `ow_boar` is the rhino model at x0.42 with `visual.hide: ['Spear']` (a boar-sized charger; there is no boar model). The Kızıl Boynuz / Demir Boynuz rares reuse `ow_rhino` with a tint.
* Puglin colour variants are *texture swaps* (`/assets/textures/itch/bestiary/puglin_2.png`, `puglin_3.png`), not tints; use them to tell goblin camps from puglin camps (green = default, red = chiefs, blue = shamans/rares).
* `ow_vampire` and `ow_keeper` use Kenney clips (`idle`, `walk`, `sprint`, `attack-melee-right` / `-left`, `die`); there is no hit clip, so hit feedback is the white flash only (`Enemy` already degrades gracefully when `anims.hit` is missing).
* New `EnemyAiHints` (append-only, §9.1): `stationary` (never moves; metin stones, `blocker`-style), `neutral` (deer: only fights when hit or cornered), `sleepRange` (default 45), `homeRadius` (camp leash).
* `ow_will` (suicide blast), `ow_centipede` (dormant + `Emerge` spawn clip), `ow_scarecrow` (dormant until `wakeRange` 7), `ow_bear` (dormant `Sleep`→`Wake`) reuse the existing `ai.dormant` pipeline (`PackWatch` / `EnemyDirector.pullPack`).

### 3.2 Camps per region

Camp table columns: `id` (also the `PackDef.id`), `Ad`, `merkez` (continuous tile coords, `PackDef.center`), `yarıçap` (`PackDef.radius`, metres), `mob Sv.` (`levelRange`), `yeniden doğuş` (`respawnSec`, whole camp, §1.5.2), members (formation: the existing golden-angle spiral inside `min(2.6, radius/4 * 0.55)` tiles, leader at the centre), XP equivalent (Σ count x multiplier), flags (`dormant` → `PackDef.dormant { kind: 'bones'|'egg'|'ceiling', wakeRadius 7 }`, `stealth` → `PackDef.stealth`, `Seçkin lider` = contains an elite that leads the camp; `farm:fsNN` = §3.7 item-farm spot). **Each camp also gets scenery** from its note (props, fire, tents, ...) built by the content module like the old `sisli_koru.ts` decorator.

#### R1 Sisli Koru (levels 1-5)

| id | Ad | merkez (karo) | yarıçap m | mob Sv. | yeniden doğuş sn | üyeler | XP eşdeğeri* | bayraklar | tasarım notu |
|---|---|---|---|---|---|---|---|---|---|
| `r1_c01` | Fare Yuvası | (72, 30) | 12 | 1-2 | 40 | Orman Sıçanı (`ow_rat`) x7 | 2.4 | farm:fs01 | Çürük kütükler, kırık fıçı; ilk kamp |
| `r1_c02` | Balçık Gölü | (58, 22) | 14 | 1-3 | 45 | Yeşil Balçık (`ow_slime`) x5 | 5.0 | - | Yeşil gölcük, kristal ışığı |
| `r1_c03` | Kurt Açıklığı | (95, 31) | 14 | 2-4 | 50 | Orman Kurdu (`ow_wolf`) x4, Orman Sıçanı (`ow_rat`) x3 | 5.0 | - | Geyik çayırına komşu |
| `r1_c04` | Yağmacı Kampı | (101, 14) | 16 | 3-5 | 70 | Goblin Yağmacı (`ow_goblin`) x5, Goblin Şamanı (`ow_goblin_shaman`) x1, Puglin Reisi (`ow_puglin_chief`) x1 | 11.0 | Seçkin lider, farm:fs02 | Çadırlar, ateş, sandık; lider Puglin Reisi; Gırtlak mini-boss alanı |
| `r1_c05` | Mantar Halkası | (52, 36) | 14 | 3-5 | 50 | Mantarcık (`ow_mushnub`) x8 | 2.8 | - | Dev mantar halkası |
| `r1_c06` | Örümcek Korusu | (86, 39) | 14 | 4-5 | 60 | Orman Örümceği (`ow_spider`) x4, Orman Sıçanı (`ow_rat`) x4 | 5.4 | - | Ölü ağaçlar, ağ perdeleri |
| `r1_c07` | Arı Yuvası | (103, 38) | 12 | 4-5 | 50 | Orman Arısı (`ow_wasp`) x6 | 2.1 | - | Nehir kıyısı sazlığı |
| `r1_c08` | Yaban Domuzu Çalılığı | (64, 42) | 12 | 4-5 | 55 | Yaban Domuzu (`ow_boar`) x4 | 4.0 | - | Sık çalılık |
| `r1_c09` | Kesik Kütükler | (46, 20) | 12 | 3-5 | 55 | Goblin Yağmacı (`ow_goblin`) x4, Yeşil Balçık (`ow_slime`) x2 | 6.0 | - | Odunculuk kampı kalıntısı |
| `r1_c10` | Eski Değirmen | (52, 10) | 12 | 3-5 | 55 | Orman Kurdu (`ow_wolf`) x3, Yaban Domuzu (`ow_boar`) x2 | 5.0 | - | Yıkık değirmen, kurt ini |

#### R2 Altın Tarlalar (levels 5-10)

| id | Ad | merkez (karo) | yarıçap m | mob Sv. | yeniden doğuş sn | üyeler | XP eşdeğeri* | bayraklar | tasarım notu |
|---|---|---|---|---|---|---|---|---|---|
| `r2_c01` | Buğday Tarlası | (130, 12) | 14 | 5-7 | 55 | Yaban Domuzu (`ow_boar`) x5 | 5.0 | - | Olgun buğday, domuz izleri |
| `r2_c02` | Korkuluk Tarlası | (142, 28) | 14 | 5-7 | 55 | Korkuluk (`ow_scarecrow`) x6 | 6.0 | dormant | Gerçek korkuluk gibi duran uyuyanlar |
| `r2_c03` | Terk Edilmiş Çiftlik | (126, 42) | 16 | 6-8 | 70 | Çürümüş Köylü (`ow_zombie`) x5, Mağara Yarasası (`ow_bat`) x4 | 6.4 | - | Boş çiftlik evleri, kuyu, araba |
| `r2_c04` | Kurt Ormanı | (152, 22) | 14 | 6-8 | 65 | Orman Kurdu (`ow_wolf`) x5, Boz Ayı (`ow_bear`) x1 | 10.0 | Seçkin lider | Tarla kenarı koru; lider Boz Ayı |
| `r2_c05` | Mantar Tarlası | (118, 52) | 14 | 7-9 | 60 | Mantarcık (`ow_mushnub`) x6, Mantar Zorbası (`ow_mushroom_brute`) x2 | 4.1 | farm:fs04 | Dev mantarlar |
| `r2_c06` | Haydut Karakolu | (146, 44) | 16 | 7-9 | 75 | Haydut (`ow_bandit`) x4, Haydut Okçusu (`ow_bandit_archer`) x2, Haydut Pehlivanı (`ow_bandit_brute`) x1 | 11.0 | Seçkin lider, farm:fs05 | İlk haydutlar: çadır + sandık |
| `r2_c07` | Yarasa Kayalığı | (152, 58) | 12 | 8-10 | 50 | Mağara Yarasası (`ow_bat`) x8 | 2.8 | - | Doğu kayalıkları, mağara ağzı |
| `r2_c08` | Kayıp Mezarlık | (144, 14) | 16 | 8-10 | 90 | Takırdayan İskelet (`skel_rattler`) x6, Çürümüş Köylü (`ow_zombie`) x3 | 5.1 | dormant | Mezar taşları, kemik yığınları (dormant); Hovardan alanı |
| `r2_c09` | Mezarlık Bekçileri | (136, 6) | 12 | 8-10 | 90 | İskelet Er (`skel_minion`) x4, İskelet Okçu (`skel_archer`) x2 | 6.0 | - | Mezarlık girişi, yıkık duvar |
| `r2_c10` | Çiftçi Hırsızları | (140, 54) | 14 | 8-10 | 70 | Puglin Yağmacı (`ow_puglin`) x5, Goblin Şamanı (`ow_goblin_shaman`) x1 | 6.0 | - | Çalıntı erzak yığınları |
| `r2_c11` | Kırık Değirmen | (118, 36) | 12 | 6-8 | 55 | Orman Arısı (`ow_wasp`) x5, Orman Kurdu (`ow_wolf`) x2 | 3.8 | - | Köprü başı yıkık değirmen |
| `r2_c12` | Domuz Ağılı | (150, 34) | 12 | 6-8 | 55 | Yaban Domuzu (`ow_boar`) x4, Korkuluk (`ow_scarecrow`) x2 | 6.0 | - | Kırık ağıl çitleri |

#### R3 Haydut Tepeleri (levels 10-15)

| id | Ad | merkez (karo) | yarıçap m | mob Sv. | yeniden doğuş sn | üyeler | XP eşdeğeri* | bayraklar | tasarım notu |
|---|---|---|---|---|---|---|---|---|---|
| `r3_c01` | Haydut Barınağı | (116, 76) | 14 | 10-12 | 70 | Haydut (`ow_bandit`) x5, Haydut Okçusu (`ow_bandit_archer`) x2 | 7.0 | - | Kaya sığınağı, kamp ateşi |
| `r3_c02` | Kurt İni | (128, 74) | 14 | 10-12 | 60 | Orman Kurdu (`ow_wolf`) x5, Dehşet Kurdu (`ow_wolf_dire`) x1 | 10.0 | Seçkin lider | Kemik yığınlı in; lider Dehşet Kurdu |
| `r3_c03` | Puglin Obası | (150, 74) | 12 | 11-13 | 75 | Puglin Yağmacı (`ow_puglin`) x6, Puglin Reisi (`ow_puglin_chief`) x1 | 11.0 | Seçkin lider | Tüylü çadırlar |
| `r3_c04` | Haydut Kalesi | (140, 86) | 18 | 12-14 | 120 | Haydut (`ow_bandit`) x5, Haydut Okçusu (`ow_bandit_archer`) x3, Haydut Pehlivanı (`ow_bandit_brute`) x2, Haydut Başı (`ow_bandit_chief`) x1 | 23.0 | Seçkin lider, farm:fs06 | Çit surlu kale; Karabıyık mini-boss alanı |
| `r3_c05` | Gergedan Otlağı | (122, 90) | 16 | 12-14 | 90 | Dağ Gergedanı (`ow_rhino`) x2, Yaban Domuzu (`ow_boar`) x4 | 14.0 | Seçkin lider, farm:fs07 | Açık otlak, kırık çitler |
| `r3_c06` | Arı Kovanları | (152, 92) | 12 | 11-13 | 55 | Orman Arısı (`ow_wasp`) x8 | 2.8 | - | Dev kovanlar |
| `r3_c07` | Boz Ayı Mağarası | (104, 80) | 12 | 11-13 | 80 | Boz Ayı (`ow_bear`) x2, Orman Kurdu (`ow_wolf`) x3 | 13.0 | Seçkin lider | Göl kıyısı mağara |
| `r3_c08` | Warg Sürüsü | (140, 102) | 16 | 13-15 | 90 | Savaş Kurdu (`ow_warg`) x2, Orman Kurdu (`ow_wolf`) x4, Puglin Yağmacı (`ow_puglin`) x3 | 17.0 | Seçkin lider | Kemik totemler |
| `r3_c09` | Yıkık Gözcü Kulesi | (128, 106) | 14 | 13-15 | 85 | Haydut Okçusu (`ow_bandit_archer`) x4, Haydut (`ow_bandit`) x3, Haydut Pehlivanı (`ow_bandit_brute`) x1 | 12.0 | Seçkin lider | Yıkık kule (ufuk işareti) |
| `r3_c10` | Tepe Pusu | (152, 108) | 12 | 13-15 | 80 | Haydut (`ow_bandit`) x4 | 4.0 | stealth | Yol kenarı pusu: görünmez başlar |
| `r3_c11` | Gölge Vadisi | (108, 92) | 12 | 12-14 | 70 | Dehşet Kurdu (`ow_wolf_dire`) x3, Orman Kurdu (`ow_wolf`) x3 | 18.0 | - | Gölgeli kaya vadisi |

#### R4 Ağıt Bataklığı (levels 15-20)

| id | Ad | merkez (karo) | yarıçap m | mob Sv. | yeniden doğuş sn | üyeler | XP eşdeğeri* | bayraklar | tasarım notu |
|---|---|---|---|---|---|---|---|---|---|
| `r4_c01` | Bataklık Girişi | (120, 124) | 14 | 15-17 | 70 | Bataklık Gulyabanisi (`ow_ghoul`) x5, Bataklık Işığı (`ow_will`) x3 | 6.0 | - | Sazlık, ilk tahta yol |
| `r4_c02` | Çamur Havuzu | (138, 126) | 14 | 15-17 | 65 | Bataklık Çamuru (`ow_ooze`) x4 | 4.0 | - | Kahverengi çamur gölleri |
| `r4_c03` | Arı Sazlığı | (152, 124) | 12 | 16-18 | 55 | Bataklık Arısı (`ow_wasp_swamp`) x7 | 2.4 | - | Sazlık, yosunlu kovanlar |
| `r4_c04` | Çıyan Çukuru | (104, 132) | 14 | 16-18 | 70 | Çürük Çıyanı (`ow_centipede`) x5 | 5.0 | dormant, farm:fs09 | Toprak çukurları (yerden fırlarlar) |
| `r4_c05` | Ağıt Ağacı | (110, 146) | 16 | 17-19 | 85 | Ağıt Hortlağı (`ow_wraith`) x4, Bataklık Gulyabanisi (`ow_ghoul`) x3 | 7.0 | - | Dev ölü ağaç, asılı fenerler |
| `r4_c06` | Zehirli Mağara | (140, 142) | 14 | 17-19 | 90 | Dev Örümcek (`ow_spider_giant`) x2, Orman Örümceği (`ow_spider`) x5 | 15.0 | Seçkin lider, farm:fs08 | Ağ dolu mağara ağzı |
| `r4_c07` | Batık Mezarlık | (128, 152) | 14 | 17-19 | 85 | Bataklık Gulyabanisi (`ow_ghoul`) x4, Takırdayan İskelet (`skel_rattler`) x4 | 5.4 | dormant, farm:fs10 | Suya gömülü mezar taşları |
| `r4_c08` | Cadı Kulübesi | (84, 148) | 16 | 18-20 | 100 | Bataklık Cadısı (`ow_witch`) x1, Bataklık Gulyabanisi (`ow_ghoul`) x4, Bataklık Işığı (`ow_will`) x4 | 10.4 | Seçkin lider | Kazan, kafatası totemler; Zehra mini-boss alanı |
| `r4_c09` | Kurbağa Gölü | (92, 122) | 14 | 16-18 | 65 | Bataklık Çamuru (`ow_ooze`) x3, Bataklık Arısı (`ow_wasp_swamp`) x4 | 4.4 | - | Göl kıyısı nilüferler |
| `r4_c10` | Kara Sazlık | (72, 130) | 14 | 18-20 | 80 | Ağıt Hortlağı (`ow_wraith`) x3, Bataklık Işığı (`ow_will`) x5 | 4.8 | - | Sis perdeleri |
| `r4_c11` | Çürük Ana Yuvası | (68, 146) | 14 | 19-20 | 95 | Dev Örümcek (`ow_spider_giant`) x3, Çürük Çıyanı (`ow_centipede`) x3 | 18.0 | Seçkin lider | Yumurta kozaları |
| `r4_c12` | Yosunlu Taşlar | (152, 146) | 12 | 17-19 | 70 | Bataklık Çamuru (`ow_ooze`) x3, Bataklık Gulyabanisi (`ow_ghoul`) x3 | 6.0 | - | Eski taş çember |
| `r4_c13` | Sis Perdesi | (96, 140) | 12 | 17-19 | 70 | Bataklık Işığı (`ow_will`) x6, Ağıt Hortlağı (`ow_wraith`) x2 | 4.1 | - | Yoğun sis, ışıklar |

#### R5 Ork Kanyonu (levels 20-25)

| id | Ad | merkez (karo) | yarıçap m | mob Sv. | yeniden doğuş sn | üyeler | XP eşdeğeri* | bayraklar | tasarım notu |
|---|---|---|---|---|---|---|---|---|---|
| `r5_c01` | Kanyon Ağzı | (50, 122) | 14 | 20-21 | 75 | Ork Savaşçısı (`ow_orc`) x4, Ork Fırlatıcısı (`ow_orc_archer`) x2 | 6.0 | - | Kırmızı kaya kapısı |
| `r5_c02` | Ork Karakolu | (42, 114) | 16 | 21-22 | 90 | Ork Savaşçısı (`ow_orc`) x5, Ork Şamanı (`ow_orc_shaman`) x1, Ork Reisi (`ow_orc_chief`) x1 | 11.0 | Seçkin lider, farm:fs11 | Çit, çadır, bayraklar |
| `r5_c03` | Gergedan Vadisi | (52, 106) | 14 | 20-22 | 80 | Dağ Gergedanı (`ow_rhino`) x2, Yaban Domuzu (`ow_boar`) x3 | 13.0 | Seçkin lider | Geniş vadi tabanı |
| `r5_c04` | Kor Ocağı Girişi | (44, 144) | 14 | 21-23 | 80 | Kanyon İblisçiği (`ow_imp`) x5, Kor Elementali (`ow_ember`) x1 | 10.0 | Seçkin lider, farm:fs12 | Lav çatlakları, Kızıl Dökümhane kapısı yakını |
| `r5_c05` | Taş Ocağı | (30, 110) | 14 | 22-24 | 95 | Kanyon Golemi (`ow_golem`) x2, Ork Savaşçısı (`ow_orc`) x3 | 13.0 | Seçkin lider, farm:fs13 | Kırık kaya blokları, vagon |
| `r5_c06` | Kızıl Kale Dış Surları | (20, 118) | 16 | 23-25 | 100 | Ork Savaşçısı (`ow_orc`) x6, Ork Fırlatıcısı (`ow_orc_archer`) x3, Ork Cellatı (`ow_orc_brute`) x1 | 14.0 | Seçkin lider | Sur önü, kuşatma kalıntıları |
| `r5_c07` | Savaş Kurdu Kampı | (12, 106) | 14 | 23-25 | 90 | Savaş Kurdu (`ow_warg`) x3, Ork Savaşçısı (`ow_orc`) x3 | 18.0 | Seçkin lider | Kemik ve post yığınları |
| `r5_c08` | Ayı Mağarası | (10, 128) | 12 | 22-24 | 80 | Boz Ayı (`ow_bear`) x3 | 15.0 | dormant, Seçkin lider | Batı kaya mağarası |
| `r5_c09` | Kızıl Kale İç Avlu | (24, 136) | 16 | 24-25 | 120 | Ork Cellatı (`ow_orc_brute`) x2, Ork Şamanı (`ow_orc_shaman`) x2, Ork Savaşçısı (`ow_orc`) x4 | 16.0 | Seçkin lider | Kale avlusu; Gorak mini-boss alanı |
| `r5_c10` | Ejder Yuvası Yolu | (26, 146) | 14 | 24-25 | 100 | Kanyon İblisçiği (`ow_imp`) x4, Kor Elementali (`ow_ember`) x2 | 14.0 | Seçkin lider | Yanık kayalar, kemikler |
| `r5_c11` | Ork Ocağı | (36, 150) | 14 | 22-24 | 85 | Ork Savaşçısı (`ow_orc`) x5, Ork Şamanı (`ow_orc_shaman`) x2 | 7.0 | - | Pişirme ateşleri |
| `r5_c12` | Kor Çatlağı | (34, 128) | 12 | 23-24 | 85 | Kor Elementali (`ow_ember`) x2, Kanyon İblisçiği (`ow_imp`) x3 | 13.0 | Seçkin lider | Parlayan çatlak |

#### R6 Lanetli Harabeler (levels 25-30)

| id | Ad | merkez (karo) | yarıçap m | mob Sv. | yeniden doğuş sn | üyeler | XP eşdeğeri* | bayraklar | tasarım notu |
|---|---|---|---|---|---|---|---|---|---|
| `r6_c01` | Son Ocak Nöbeti | (42, 86) | 14 | 25-26 | 80 | İskelet Er (`skel_minion`) x5, İskelet Okçu (`skel_archer`) x2 | 7.0 | - | Kamp çevresi gözcüleri |
| `r6_c02` | Kırık Köprü | (18, 90) | 14 | 25-27 | 85 | Gulyabani (`crypt_ghoul`) x4, Takırdayan İskelet (`skel_rattler`) x5 | 5.8 | dormant | Çökmüş taş köprü |
| `r6_c03` | Lanetli Avlu | (46, 78) | 14 | 26-28 | 90 | Tarikat Müridi (`cult_acolyte`) x6, Tarikat Çağırıcısı (`cult_summoner`) x1 | 3.1 | farm:fs14 | Rün çemberi, mor mumlar |
| `r6_c04` | Gölge Kemeri | (20, 80) | 14 | 26-28 | 85 | Gölge (`shade`) x4, Mahzen Hortlağı (`crypt_wraith`) x3 | 7.0 | - | Yıkık taş kemer |
| `r6_c05` | Eski Kütüphane | (40, 68) | 14 | 27-29 | 95 | Kemik Büyücüsü (`skel_mage`) x3, İskelet Muhafız (`skel_warrior`) x1, İskelet Er (`skel_minion`) x3 | 11.0 | Seçkin lider, farm:fs15 | Yıkık raflar, kitap yığınları |
| `r6_c06` | Mezar Çukuru | (12, 70) | 14 | 27-29 | 100 | Takırdayan İskelet (`skel_rattler`) x8, Kemik Golemi (`bone_golem`) x1 | 7.8 | dormant, Seçkin lider | Açık toplu mezar |
| `r6_c07` | Kara Rahipler | (30, 58) | 14 | 28-30 | 95 | Gölge Suikastçısı (`cult_assassin`) x4, Gölge Rahibi (`shadow_priest`) x2 | 6.0 | stealth | Karartılmış sunak |
| `r6_c08` | Kan Lordu Salonu | (46, 58) | 14 | 28-30 | 120 | Kan Lordu (`ow_vampire`) x1, Mağara Yarasası (`ow_bat`) x6 | 7.1 | Seçkin lider, farm:fs16 | Tahta, sütunlar; Valdemar mini-boss alanı |
| `r6_c09` | Ölüm Çukuru | (14, 58) | 12 | 28-30 | 100 | Mezar Şövalyesi (`ow_grave_knight`) x2, İskelet Er (`skel_minion`) x4 | 14.0 | Seçkin lider | Kara taş çukur |
| `r6_c10` | Yıkık Surlar | (52, 92) | 12 | 25-27 | 85 | İskelet Muhafız (`skel_warrior`) x2, Gölge Suikastçısı (`cult_assassin`) x3 | 13.0 | stealth | Kırık sur parçaları |
| `r6_c11` | Gölge Mezarlığı | (6, 84) | 12 | 26-28 | 85 | Takırdayan İskelet (`skel_rattler`) x6, Gölge (`shade`) x3 | 5.1 | dormant | Batı kenarı mezar taşları |
| `r6_c12` | Kara Anıt Nöbetçileri | (30, 74) | 16 | 28-30 | 110 | Mezar Şövalyesi (`ow_grave_knight`) x2, Gölge (`shade`) x3, Kemik Büyücüsü (`skel_mage`) x2 | 15.0 | Seçkin lider | Anıt meydanı; Ölüm Metini çevresi |

### 3.3 Roaming patrols

Patrols are normal packs with `PackDef.patrol` (tile-coordinate loop, walk speed `patrolMul` 0.45, existing behaviour). They cross roads and camp outskirts so that "safe" stretches are not entirely safe; they respawn like camps and are active only while a player is in activation range of their loop centre.

| id | Ad | Bölge | üyeler | Sv. | yeniden doğuş sn | devriye döngüsü (karo, `PackDef.patrol`) |
|---|---|---|---|---|---|---|
| `r1_p01` | Goblin Gözcüleri | R1 | Goblin Yağmacı (`ow_goblin`) x3, Goblin Şamanı (`ow_goblin_shaman`) x1 | 3-5 | 90 | (90,26) → (98,22) → (100,30) → (92,34) → başa |
| `r2_p01` | Haydut Devriyesi | R2 | Haydut (`ow_bandit`) x3, Haydut Okçusu (`ow_bandit_archer`) x1 | 7-9 | 90 | (124,30) → (132,38) → (136,48) → (130,44) → başa |
| `r2_p02` | Hortlayan Çiftçiler | R2 | Çürümüş Köylü (`ow_zombie`) x4 | 6-8 | 80 | (122,40) → (130,46) → (124,50) → (118,44) → başa |
| `r3_p01` | Warg Devriyesi | R3 | Savaş Kurdu (`ow_warg`) x1, Orman Kurdu (`ow_wolf`) x3 | 12-14 | 100 | (132,78) → (142,92) → (136,98) → (126,86) → başa |
| `r3_p02` | Haydut Kervan Koruması | R3 | Haydut Pehlivanı (`ow_bandit_brute`) x1, Haydut (`ow_bandit`) x3, Haydut Okçusu (`ow_bandit_archer`) x2 | 12-14 | 110 | (120,96) → (126,104) → (136,108) → (124,100) → başa |
| `r4_p01` | Hortlak Alayı | R4 | Ağıt Hortlağı (`ow_wraith`) x3, Bataklık Işığı (`ow_will`) x3 | 17-19 | 100 | (100,126) → (90,134) → (80,138) → (92,128) → başa |
| `r4_p02` | Gulyabani Sürüsü | R4 | Bataklık Gulyabanisi (`ow_ghoul`) x5 | 16-18 | 90 | (128,130) → (134,138) → (126,144) → (120,136) → başa |
| `r5_p01` | Ork Devriyesi | R5 | Ork Savaşçısı (`ow_orc`) x3, Ork Fırlatıcısı (`ow_orc_archer`) x1, Ork Şamanı (`ow_orc_shaman`) x1 | 21-23 | 100 | (46,126) → (40,132) → (34,124) → (42,120) → başa |
| `r5_p02` | Kor Avcıları | R5 | Savaş Kurdu (`ow_warg`) x2, Ork Savaşçısı (`ow_orc`) x2 | 23-25 | 110 | (16,112) → (22,124) → (14,130) → (10,118) → başa |
| `r6_p01` | Kemik Alayı | R6 | İskelet Er (`skel_minion`) x4, İskelet Okçu (`skel_archer`) x2, İskelet Muhafız (`skel_warrior`) x1 | 26-28 | 100 | (30,90) → (28,82) → (32,76) → (36,84) → başa |
| `r6_p02` | Kara Nöbetçiler | R6 | Mezar Şövalyesi (`ow_grave_knight`) x1, Gölge (`shade`) x3 | 28-30 | 110 | (20,64) → (30,62) → (38,66) → (28,70) → başa |

### 3.4 Elite spots and champions

* **Seçkin (elite) leaders**: camps flagged `Seçkin lider` contain a rank-`elite` def (Puglin Reisi, Boz Ayı, Dehşet Kurdu, Haydut Pehlivanı/Başı, Dev Örümcek, Ork Reisi, Ork Cellatı, Kor Elementali, Kan Lordu, ...). Elites drop per GDD_SYSTEMS §7.1 (100% item, min Büyülü, +40% second, gold x6) and give 5x XP; their camps are the open-world equivalent of "elite packs" (about one elite pack per ~45 s of clearing).
* **Champions** (random, §1.4): a 12% roll per activation on camps with ≥ 4 members and level ≥ 8.
* **Big pulls (Katliam spots)** for the massacre chain (GDD_SYSTEMS §6.2: ×10/25/50/100): `r3_c04` Haydut Kalesi + `r3_c05` (they touch: 18 + 16 m radii), `r4_c01`+`r4_c09`+`r4_c13`, `r5_c06`+`r5_c09`, `r6_c03`+`r6_c12`; the camp radius overlaps are intentional.

### 3.5 Named rares (nadir yaratıklar)

Rares are `rank: 'elite'` copies of a base def with a new name, scale, tint, `hpMult` 8-10, one special ability, `xp` x10, a **silver-gold name plate** and a **minimap star within 120 m**. Spawn mechanism (host, `RareDirector`): every rare has 2-3 candidate spots and a respawn window in minutes; when its timer is up, a region is active (a player is in the region) and no player stands within 40 m of the chosen spot, it spawns at a random candidate (`announce: true` → toast "{Ad} yakınlarda dolaşıyor!" to players within 150 m) and stays until killed or until 20 min without a player within 150 m. Killing a rare announces "{Ad} yenildi! — {oyuncu}" to the region (`world:announce`).

Rare loot (personal, `lootTable: loot_rare_<id>`): `Nadir x1-2` (guaranteed, ilvl = level + 1), `Metin Kalıntısı` x2-12, one themed bonus (gems of the matching grade, `Büyülü Toz`, `Ejderha Pulu`, `Kara Demir`) and for four of them a **Vadi Efsanevisi** (stat-only legendary, §4.7). First kill of each rare: achievement `ach_rare_<id>` (collection "Vadinin Nadirleri", 16 entries → title "Nadir Avcısı").

| id | Ad | taban def · ölçek | ton | Sv. | HP x | doğuş noktaları (karo) | yeniden doğuş | özel yetenek | ganimet |
|---|---|---|---|---|---|---|---|---|---|
| `rare_gumus_yele` | Gümüş Yele | `ow_wolf` x1.35 | tint 0xe8e8f0 | 4 | 9 | (66,26) · (92,40) · (48,30) | 8-12 dk | Uluma: %70 canda 3 kurt çağırır | Büyülü+ x2 · Kalıntı x3 · `leg_vadi_gumus_pence` %15 |
| `rare_kizil_kuyruk` | Kızıl Kuyruk | `ow_rat` x2.2 | tint 0xa04030 | 3 | 10 | (56,14) · (44,38) · (66,12) | 8-12 dk | Veba Sürüsü: her 10 sn 3 `ow_rat` çağırır | Büyülü+ x2 · Kara Demir x8 · Kalıntı x2 |
| `rare_korkuluk_kral` | Korkuluk Kral | `ow_scarecrow` x1.5 | tint 0xe0c060 | 8 | 9 | (140,30) · (122,46) · (148,38) | 10-14 dk | Karga Sürüsü: 4 `ow_bat` çağırır (cd 20) · Saman Fırtınası: r 6 kör | Nadir x1 · Kalıntı x4 · Büyülü Toz x3 |
| `rare_buyuk_boz` | Büyük Boz | `ow_bear` x1.15 | tint 0xb8a898 | 9 | 9 | (152,22) · (148,48) · (154,12) | 10-14 dk | Yaralı Öfke: %40 canın altında +%40 hasar, CC bağışık | Nadir x1 · Kalıntı x4 · `leg_vadi_boz_postu` %15 |
| `rare_mantar_ana` | Mantar Ana | `ow_mushroom_brute` x1.6 | tint 0xe090b0 | 9 | 9 | (118,56) · (132,62) · (116,48) | 10-14 dk | Spor Fırtınası: 3 bulut r 4; ölünce 4 `ow_mushnub` | Nadir x1 · Kalıntı x4 · Zümrüt (Kırık) %30 |
| `rare_golge_alfa` | Gölge Alfa | `ow_warg` x1.3 | tint 0x404050 | 14 | 8 | (108,84) · (146,108) · (152,76) | 10-15 dk | Karanlık Uluma: 4 `ow_wolf_dire` çağırır; saldırılar kanama | Nadir x2 · Kalıntı x6 · `leg_vadi_gece_tuyu` %15 |
| `rare_demir_boynuz` | Demir Boynuz | `ow_rhino` x1.3 | tint 0x808890 | 14 | 8 | (124,96) · (150,98) · (118,84) | 10-15 dk | Demir Deri: %50 fiziksel DR, Hücum 2 kez üst üste | Nadir x2 · Kalıntı x6 · Büyülü Toz x6 |
| `rare_agit_kralicesi` | Ağıt Kraliçesi | `ow_wraith` x1.5 | tint 0x80ffe0 | 19 | 8 | (96,142) · (132,136) · (70,126) | 12-18 dk | Ağıt: 8 sn kanal, r 10 içinde korku + gölge hasarı | Nadir x2 · Kalıntı x8 · Ametist (Kusurlu) %30 |
| `rare_zehir_ana` | Zehir Ana | `ow_spider_giant` x1.6 | tint 0x50a040 | 19 | 8 | (148,142) · (118,150) · (60,150) | 12-18 dk | Yavru Yumurtaları: 6 `ow_spider` (swarm) çağırır; ağ + zehir | Nadir x2 · Kalıntı x8 · Zümrüt (Kusurlu) %35 |
| `rare_camur_baba` | Çamur Baba | `ow_ooze` x0.9 | tint 0x806030 | 17 | 10 | (100,128) · (146,132) · (74,140) | 12-18 dk | Dev Bölünme: ölünce 4 `ow_ooze` (yarı HP) | Nadir x2 · Kalıntı x7 · Topaz (Kusurlu) %30 |
| `rare_kor_efendisi` | Kor Efendisi | `ow_ember` x1.4 | tint 0xff6020 | 24 | 8 | (14,134) · (38,132) · (24,106) | 14-20 dk | Kor Yağmuru: 6 ateş çemberi r 3, 4 sn boyunca | Nadir x2 · Kalıntı x10 · Yakut (Kusurlu) %35 |
| `rare_tas_yurek` | Taş Yürek | `ow_golem` x1.4 | tint 0xa0a0b8 | 24 | 8 | (28,112) · (10,118) · (44,108) | 14-20 dk | Taş Kalkan: her 20 sn 5 sn %60 DR; Yer Darbesi iki katı | Nadir x2 · Kalıntı x10 · Ejderha Pulu x1 |
| `rare_kizil_boynuz` | Kızıl Boynuz | `ow_rhino` x1.3 | tint 0xb05040 | 23 | 8 | (50,116) · (8,140) · (30,126) | 14-20 dk | Öfke Hücumu: 3 hücum zinciri, her biri +%20 hasar | Nadir x2 · Kalıntı x9 · Büyülü Toz x8 |
| `rare_gece_gezgini` | Gece Gezgini | `ow_vampire` x1.2 | tint 0x6a5090 | 29 | 8 | (50,70) · (10,62) · (36,76) | 15-22 dk | Gece Perdesi: 6 sn kaybolur, arkadan vurur (ilk vuruş x2) | Nadir x2 · Kalıntı x12 · Ametist (Kusursuz) %20 |
| `rare_kemik_kral` | Kemik Kral Hargar | `skel_warrior` x1.5 | tint 0xd8d0c0 | 28 | 8 | (16,96) · (50,96) · (8,76) | 15-22 dk | Kemik Ordusu: 6 `skel_minion` yükseltir (cd 25) | Nadir x2 · Kalıntı x12 · `leg_vadi_kemik_tac` %15 |
| `rare_sessiz_rahip` | Sessiz Rahip | `cult_summoner` x1.4 | tint 0x302040 | 28 | 8 | (26,54) · (44,54) · (18,62) | 15-22 dk | Sessizlik: 12 m içinde silence 3 sn; 2 `shade` çağırır | Nadir x2 · Kalıntı x12 · Elmas (Kusurlu) %20 |

### 3.6 Mini-bosses

Fixed-lair `rank: 'miniboss'` fights (Ara Patron: HP x per table, drops GDD_SYSTEMS §7.1 Ara Patron row: 2 items with 1 Nadir+, +50% third, gold x25, 2 Can Küresi, gem 20%, Ejderha Pulu 15%, **+ `Metin Kalıntısı` x(4 + level/3)** and `loot_mb_rN` focus). They are the story targets of the main quests (§6) and **respawn 20 min after death** if a player is in the region (host timer). Each has 3 abilities built from the existing ability builders (one summon, one telegraphed AoE/line, one signature), `ai.leash` = camp radius + 10 m, `ai.homeRadius`. They use the camp arena of the host camp (no gates, no wipes: they leash and reset).

| id | Ad | taban def | Sv. | HP x | ini (karo) | Bölge | yetenekler | yeniden doğuş | ganimet tablosu |
|---|---|---|---|---|---|---|---|---|---|
| `mb_girtlak` | Yağmacı Başı Gırtlak | `ow_puglin_chief` x1.25 | 5 | 14 | (100,14) | R1 | Taş Yağmuru: ground_aoe r 4 x3, windup 1.2, coef 1.2 · Gırtlak Çağrısı: 4 `ow_goblin` (cd 25) · Sopa Fırtınası combo (3 vuruş, coef 1.0/1.0/1.8) | 20 dk | `loot_mb_r1` |
| `mb_hovardan` | Mezarlık Bekçisi Hovardan | `ow_keeper` x1.2 tint 0x80a090 | 10 | 18 | (144,10) | R2 | Toprak Fırlat · Mezar Aç: 3 `skel_rattler` (cd 20) · Kürek Savurma: self_aoe r 4.5, windup 1.1, coef 2.0 | 20 dk | `loot_mb_r2` |
| `mb_karabiyik` | Haydut Kralı Karabıyık | `ow_bandit_chief` x1.45 tint 0x402020 | 14 | 20 | (140,84) | R3 | Yardım Çağır: 4 `ow_bandit` + 2 `ow_bandit_archer` (cd 30) · Kalkan Darbesi stun · Kanlı Fiyat: hedefe 3 sn işaret, bitince çember r 3 coef 2.4 | 20 dk | `loot_mb_r3` |
| `mb_zehra` | Cadı Zehra | `ow_witch` x1.4 tint 0x206840 | 19 | 20 | (84,148) | R4 | Zehir Yağmuru: 5 ground_aoe r 3.5 (zehir persist) · Kurbağa Laneti (2 hedef) · Kazan Çağrısı: 3 `ow_ooze` (cd 25) | 20 dk | `loot_mb_r4` |
| `mb_gorak` | Ork Reisi Gorak | `ow_orc_brute` x1.5 tint 0x806040 | 24 | 22 | (24,136) | R5 | Savaş Narası (r 14) · Yarma: line 10 x 2.6, coef 2.8 · Zincir Hücumu: charge 14 m + knockdown, cd 14 · 4 `ow_orc` (cd 30) | 20 dk | `loot_mb_r5` |
| `mb_valdemar` | Kan Lordu Valdemar | `ow_vampire` x1.3 tint 0x802030 | 29 | 24 | (46,58) | R6 | Kan Hasadı r 6 · Yarasa Bulutu: 8 `ow_bat` (cd 25) · Kan Bağı: 2 oyuncu arasında 6 sn zincir (ayrı durmazsan hasar) | 20 dk | `loot_mb_r6` |

### 3.7 Item-farm spots (belirli düşme noktaları)

A farm spot is a **camp with a named loot table** that biases what drops. Every drop is still personal loot (GDD_SYSTEMS §7.5). The bias never replaces the base rank table, it adds to it: a farm spot is *the best place to look for one thing*, not the only one. Items module additions to `LootTableDef` (append-only, `data/loot.ts`): `matMult?: Record<string, number>` (multiplies a material's base chance in the rank table), `bonus?: { id: string; chance: number; count?: [number, number]; rank?: 'trash' | 'elite' }[]` (extra independent rolls per killed member; `rank` restricts the roll to that member rank), `itemChanceMult?: number`, `legendaryMult?: number` (multiplies the legendary weight of this table's equipment rolls). The table id goes on `PackDef.lootTable` (§9.1) and applies to every member of the camp.

| id | Nokta | kamp | Bölge | loot tablosu | odak (focus) | bonus düşmeler | neden burada? |
|---|---|---|---|---|---|---|---|
| `fs01` | Fare Yuvası | `r1_c01` | R1 | `farm_rat_nest` | - | Kara Demir x5 şans (%0.5 → %2.5) · altın x2 | +1..+3 yükseltme malzemesi: ilk yarım saatin Kara Demir kaynağı |
| `fs02` | Yağmacı Kampı | `r1_c04` | R1 | `farm_goblin_camp` | ring, amulet, belt | altın x3 · lider Puglin Reisi: Büyülü+ %100, Metin Kalıntısı x2 | ilk yüzük/kolye ve altın (Bakkal/Demirci için) |
| `fs03` | Örümcek Korusu | `r1_c06` | R1 | `farm_spider_grove` | - | Zümrüt (Kırık) %2 · Küçük Can İksiri %8 | ilk taş (gem) yuvası için |
| `fs04` | Mantar Tarlası | `r2_c05` | R2 | `farm_mushroom_field` | - | Zümrüt (Kırık) %3 · Küçük Ruh İksiri %6 · Mantar Zorbası: Büyülü Toz %4 | çok kolay hedefler, güvenli ısınma |
| `fs05` | Haydut Karakolu | `r2_c06` | R2 | `farm_bandit_post` | dagger, sword1h, gloves | altın x3 · Efsun Nesnesi %0.8 (Pehlivan %6) | ilk Efsun Nesnesi ve silah/eldiven |
| `fs06` | Haydut Kalesi | `r3_c04` | R3 | `farm_bandit_fort` | sword1h, dagger, chest, legs | altın x4 · Efsun Nesnesi %1.5 (Haydut Başı %10) · Takviye Nesnesi %2 | "altın + Efsun" kampı: kale temizliği 2-3 dk, grup önerilir |
| `fs07` | Gergedan Otlağı | `r3_c05` | R3 | `farm_rhino_pasture` | - | Büyülü Toz %4 (Gergedan %25, x2-4) · Kara Demir %5 | Demirci +4..+6 malzemesi |
| `fs08` | Zehirli Mağara | `r4_c06` | R4 | `farm_poison_cave` | - | Zümrüt (Kusurlu) %5 (Dev Örümcek %30) · Zümrüt (Kırık) %8 · Bataklık Özü (Av Defteri) %20 | ZEHİR TAŞLARI: Zümrüt = kritik hasarı / zehir direnci (taş yuvaları) |
| `fs09` | Çıyan Çukuru | `r4_c04` | R4 | `farm_centipede_pit` | - | Topaz (Kusurlu) %4 · Büyülü Toz %3 | saldırı hızı taşları (Topaz); yerden fırlayan dormant sürü |
| `fs10` | Batık Mezarlık | `r4_c07` | R4 | `farm_sunken_graves` | - | Ametist (Kusurlu) %4 · Orta Can İksiri %6 | can çalma taşları (Ametist); dormant iskelet + gulyabani |
| `fs11` | Ork Karakolu | `r5_c02` | R5 | `farm_orc_outpost` | axe2h, helm, shoulders, chest, boots | lider Ork Reisi: +1 eşya, Ejderha Pulu %3 · Büyülü Toz %3 | ağır zırh/baltalar; ejderha pulu başlangıcı |
| `fs12` | Kor Ocağı Girişi | `r5_c04` | R5 | `farm_ember_vent` | - | Yakut (Kusurlu) %5 (Kor Elementali %30) · Ejderha Pulu %2 | ateş taşları (Yakut); Kızıl Dökümhane kapısına yakın |
| `fs13` | Taş Ocağı | `r5_c05` | R5 | `farm_stone_quarry` | - | Kara Demir x12 şans (%1.5 → %18) · Büyülü Toz %6 (Golem %35, x2-5) · Ejderha Pulu %6 (Golem) | YÜKSELTME MALZEMESİ KAMPI: +4..+9 için Büyülü Toz + Ejderha Pulu |
| `fs14` | Lanetli Avlu | `r6_c03` | R6 | `farm_cursed_court` | - | Takviye Nesnesi %4 · Efsun Nesnesi %1.2 · Kutsama Kağıdı %0.3 | efsun/takviye (item crafting) kampı |
| `fs15` | Eski Kütüphane | `r6_c05` | R6 | `farm_old_library` | staff, wand, tome, amulet | Oyma Kalemi %1.5 · Beceri Kitabı II %3 | büyücü ekipmanı + soket açma + beceri kitabı |
| `fs16` | Kan Lordu Salonu | `r6_c08` | R6 | `farm_blood_hall` | - | Ametist (Kusursuz) %6 · Elmas (Kusurlu) %4 · Efsanevi ağırlığı x2 (Kan Lordu) | dünya sonu: efsanevi şansı ve üst kademe taşlar; zor kamp |

Reading guide for players (also the Turkish tooltip on the map when the spot is discovered): *Fare Yuvası → Kara Demir · Yağmacı Kampı → altın · Haydut Kalesi → altın + Efsun Nesnesi · Zehirli Mağara → Zümrüt (zehir taşları) · Taş Ocağı → yükseltme malzemesi · Kan Lordu Salonu → efsanevi şansı.*

### 3.8 World bosses

**Çürükkök, Mantar Kral** (`wb_curukkok`, unchanged def, GDD_CONTENT §2.6). New placement and schedule:

| Field | Value |
|---|---|
| Arena | **Çürük Höyük**, tile (126, 60) (≈ (506, 242) m), radius 6 tiles (24 m), leash 30 m, mushroom ring + purple spore VFX (recipe of the old `sisli_koru.ts`) |
| Level | 10 (region band 5-10); drops at ilvl 13 |
| First spawn | alive when the world starts (after 60 s of load grace) |
| Respawn | **15 min** after death (host clock); 30 s before: `world:announce` "Çürükkök topraktan yükseliyor!" + the mound shakes (`camera:shake` 0.05 within 60 m) |
| Group tip | `wp_hoyuk` stone 8 tiles west is the meeting point; quest `mq_11_curukkok` suggests a party (HP scales x(1 + 0.6(n-1))) |
| Loot / first kill | systems Patron row, personal; achievement `ach_curukkok`, title "Mantar Avcısı", **+ Metin Kalıntısı x20** |

**Alevkanat, Kızıl Ejder** (`wb_alevkanat`, **new**, the generated dragon `gen/bosses/kizil_ejder.glb` which no enemy used yet): the canyon's old tyrant, roosting on the red rock above the orc fortress.

| Field | Value |
|---|---|
| Model | `/assets/models/gen/bosses/kizil_ejder.glb`, scale **1.0** (9.2 m wingspan spread, ~5 m folded), clips `Idle Walk Run Fly Attack Attack2 Cast Enrage Hit Death`, `fx_mouth` = breath origin |
| Level / HP / DMG | **27** (band 20-25 boss, a party of 3-5 at 24-27); `hpMult` **140** (≈ 140 s solo at par) with party scaling x(1 + 0.6(n-1)); `dmgMult` 2.6; `armorMult` 1.5; resist fire 0.5, frost -0.25 |
| Arena | **Ejder Yuvası**, tile (12, 148) (≈ (50, 594) m), radius 7 tiles (28 m), leash 34 m |
| First spawn | 10 min after the world starts if a player of level ≥ 22 has entered R5 |
| Respawn | **40 min** after death; `world:announce` 2 min before: "Ejder Yuvası'ndan alevler yükseliyor! Alevkanat uyanıyor." and again 20 s before (`camera:shake` 0.08 in R5) |
| Enrage | none (`enrageTimer: 36000`), but phase 4 forces movement |

| Ability | id | timing | shape / effect |
|---|---|---|---|
| Pençe Darbesi | `alevkanat_claw` | basic, every 2.8 s (`Attack`, impact 0.6, windup 0.7) | cone 100°, 7 m, coef 1.0 |
| Kuyruk Savurma | `alevkanat_tail` | first 10 s, cd 12 s (`Attack2`, impact 0.65, windup 1.0) | self circle r 8 m, coef 1.8 + knockback 4 m |
| Alev Soluğu | `alevkanat_breath` | first 14 s, cd 16 s (`Cast`, windup 1.6, telegraph) | cone 70°, 18 m, coef 2.4 + burn (0.3, 4 s); leaves a 6 s `fire_ground` strip (coef 0.5 per 0.5 s) |
| Kanat Çırpma | `alevkanat_gust` | first 20 s, cd 22 s (windup 1.2) | expanding ring 0 → 12 m (6 m/s), knockback 8 m, coef 1.0 — chained after a breath it shoves players out of cover |
| Yavru Çağrısı | `alevkanat_brood` | from 70% HP, cd 30 s | 4 `ow_imp` + 2 `ow_ember` jump in (summoned, they do give XP; ≤ 12 alive) |
| Meteor Yağmuru | `alevkanat_meteors` | from 50% HP, cd 20 s (`Cast`, windup 2.0) | 8 ground circles r 3.5 over 5 s on random players (1.5 s telegraph each), coef 2.2 |
| Ejder Dalışı | `alevkanat_dive` | from 25% HP, cd 18 s (`Fly` → dive) | targets the farthest player: line 30 x 4 m, windup 1.5, coef 3.0 + knockdown 1 s; the boss hovers (`Fly`) between dives |

Phases: `p1` (1.01) claw/tail/breath/gust · `p2` (0.70, yell "Yavrularım, yakın onları!") + brood · `p3` (0.50, yell "Kül olun!") + meteors · `p4` (0.25, yell "Gökyüzü benimdir!") + dive. Intro: "Kül olun, ey küçük kemikler!" Death: "Alevler... sönüyor..." Loot: Patron row at monster level 30 (ilvl 30), **1 guaranteed Destansı+**, `ejderha_pulu` x3 (100%), `beceri_kitabi_3` 40%, any eligible legendary 6% (pity applies), `Metin Kalıntısı` x40; first kill: achievement `ach_alevkanat`, title "Ejder Avcısı". The script goes in `ai/bosses/world.ts` (`WORLD_SCRIPTS`), the arena is the baked `BossArena` like Çürükkök's.

| boss | arena | Bölge | merkez | yarıçap |
|---|---|---|---|---|
| `wb_curukkok` | Çürük Höyük | R2 | (126, 60) ≈ (506, 242) m | 6 karo (24 m) |
| `wb_alevkanat` | Ejder Yuvası | R5 | (12, 148) ≈ (50, 594) m | 7 karo (28 m) |

### 3.9 Ambient life

Neutral wildlife (`ow_deer`, `ai.neutral` + `flee`, never aggro): **R1** herds at (62, 34), (90, 24), (48, 16); **R2** herds at (152, 50), (124, 26), 2-3 deer each, wander radius 12 m, flee from players inside 14 m; they drop `Geyik Derisi` (quest item for `sq_g_02`) and no XP. Decor: perched `ip(nocturnal-watch,crow)` x0.6 on fence posts and haystacks (R2), fireflies/mist (all regions), the 2 pen deer in Gümüşdere, hanging lanterns on the boardwalks (R4), kneeling statues and wisps (R6).


---

## 4. Metin taşları (Metin stones)

*"Vadinin yüreğine saplanmış kara taşlar: dokunana canavar yağdırırlar."* In Metin2 a Metin stone is a stationary, very tanky monolith; hitting it makes monsters pour out, and destroying it pays in upgrade materials, skill books and equipment. Sisli Vadi has **six tiers, one per region** (Keder Sv. 5 … Ölüm Sv. 30), spawned and re-spawned on a rotating set of fixed spots. They are the open world's *active* XP/loot event and the reason to fight in a party.

### 4.1 Stone stats

A metin stone is a **stationary enemy** (`ai.stationary: true`, `speed: 0`, `ccImmune: true`, `rank: 'miniboss'` for the loot/XP plumbing, `role: 'support'`), model `PROC('metin_stone')` (procedural: a 3.4 m cracked basalt monolith with a floating rune ring and an emissive core, tinted per tier, like the `MECH` mechanic entities; `ai/procModels.ts`, tint colours Keder 0x60a0ff, Hırs 0xffc040, Nefret 0xff6040, Acı 0x40ffa0, Öfke 0xff3020, Ölüm 0xb040ff). `HP = monsterHP(level) x hpMult x partyHp(n)`; damage taken is reduced by `armorMult` (as the `armorMult` of an `EnemyDef`); XP multiplier 15 (≈ 15 same-level Sıradan kills).

| id | Ad | Sv. | Bölge | HP x (monsterHP x) | armorMult | XP x | taş XP (tek kişi) | Bozulma Aurası (r 10 m) |
|---|---|---|---|---|---|---|---|---|
| `metin_keder` | Keder Metini (Metin of Sorrow) | 5 | R1 | 28 (= 840 HP) | 1.5 | 15 | ≈ 270 | Yavaşlatma %15 |
| `metin_hirs` | Hırs Metini (Metin of Greed) | 10 | R2 | 34 (= 2,584 HP) | 1.7 | 15 | ≈ 645 | Yavaşlatma %15 |
| `metin_nefret` | Nefret Metini (Metin of Hatred) | 15 | R3 | 40 (= 6,160 HP) | 1.9 | 15 | ≈ 1125 | Yavaşlatma %15 + Zayıflama (`curse`, -%20 hasar) |
| `metin_aci` | Acı Metini (Metin of Pain) | 20 | R4 | 46 (= 12,052 HP) | 2.1 | 15 | ≈ 1680 | Yavaşlatma %15 + Zayıflama |
| `metin_ofke` | Öfke Metini (Metin of Wrath) | 25 | R5 | 52 (= 20,904 HP) | 2.3 | 15 | ≈ 2325 | Yavaşlatma %15 + Zayıflama + Kirlenme (%1 maks. can/sn) |
| `metin_olum` | Ölüm Metini (Metin of Death) | 30 | R6 | 58 (= 33,176 HP) | 2.5 | 15 | ≈ 3030 | Yavaşlatma %15 + Zayıflama + Kirlenme (%1 maks. can/sn) |

Metin2 flavour: the stone is attackable from any range, **never fights back directly**, and its only defences are the waves, the aura and (tier ≥ 3) the pulse below. Wave and add mobs use the enemy level of the tier.

### 4.2 Mechanics

1. **Pull**: the stone is "asleep" (grey core) until it takes damage; the first hit lights it and starts the encounter for everybody within 40 m (`gate` event `ev:metin:<id>:on`).
2. **Waves at HP thresholds** (§4.3): at **85 / 65 / 45 / 25 / 10 %** HP the stone spawns the next wave in a 8-12 m ring around itself (`add_spawn` VFX + 0.3 s shake 0.06), aggroed on the player with the most damage. Waves are **sized for the tier, not for the party** (so a party takes them down faster, a solo player has to kite).
3. **Periodic adds** while engaged: every **20 s** 2 swarm mobs (the tier's `add` mob), cap 12 alive from the stone.
4. **Bozulma Aurası** (debuff aura): radius **10 m** around the stone. Tiers 1-2: `slow` 15%. Tiers 3-4: + `curse` (Zayıflama, -20% damage, refreshed every 2 s while inside). Tiers 5-6: + **Kirlenme** (1% max HP per second, ticks every 1 s, not lethal: it stops at 25% HP). The aura is visible (a ground ring in the tier colour) so ranged classes can choose to stand outside it.
5. **Metin Nabzı** (tier ≥ 3, every 12 s while engaged): expanding ring 4 → 12 m (5 m/s), coef 1.0, 1.0 s telegraph at the first use; dodge-roll through it.
6. **Death**: the stone cracks (`ground_slam` + `loot_beam` burst); remaining wave mobs despawn 8 s later (they give XP/loot while alive, so finishing them is optional). A destroyed stone announces itself to the region and starts the respawn timer.
7. **Rewards go to contributors** (damage dealt to the stone or to its wave mobs within the last 60 s) **within 60 m of the stone** (existing anti-leech distance); each gets personal loot (§4.5) and the full XP of the stone.
8. The stone cannot be abandoned by leaving: it heals 1% max HP/s when no player is within 40 m for 10 s and the waves despawn.

### 4.3 Waves

| Metin | Dalga 1 (%85) | Dalga 2 (%65) | Dalga 3 (%45, sürü) | Dalga 4 (%25, Seçkin) | Dalga 5 (%10, son direniş) | periyodik ek (2 / 20 sn) |
|---|---|---|---|---|---|---|
| `metin_keder` | 6x `ow_wolf` | 4x `ow_goblin` + 1x `ow_goblin_shaman` | 8x `ow_rat` | 4x `ow_boar` + 1x `ow_puglin_chief` | 10x `ow_mushnub` | `ow_rat` |
| `metin_hirs` | 6x `ow_bandit` | 4x `ow_scarecrow` + 2x `ow_bandit_archer` | 8x `ow_bat` | 1x `ow_bear` + 4x `ow_boar` | 10x `ow_wasp` | `ow_bat` |
| `metin_nefret` | 6x `ow_bandit` | 4x `ow_puglin` + 2x `ow_bandit_archer` | 8x `ow_wasp` | 1x `ow_warg` + 4x `ow_wolf` | 1x `ow_bandit_brute` + 6x `ow_bandit` | `ow_wasp` |
| `metin_aci` | 6x `ow_ghoul` | 4x `ow_wraith` + 2x `ow_ooze` | 8x `ow_will` | 1x `ow_spider_giant` + 4x `ow_centipede` | 10x `ow_wasp_swamp` | `ow_will` |
| `metin_ofke` | 6x `ow_orc` | 4x `ow_orc_archer` + 2x `ow_orc_shaman` | 8x `ow_imp` | 1x `ow_orc_brute` + 4x `ow_orc` | 2x `ow_ember` + 6x `ow_imp` | `ow_imp` |
| `metin_olum` | 6x `skel_minion` | 4x `cult_acolyte` + 2x `skel_archer` | 8x `shade` | 1x `ow_grave_knight` + 4x `skel_minion` | 1x `ow_vampire` + 8x `ow_bat` | `shade` |

### 4.4 Spawn and respawn rules

* **Four spots per region** (24 spots in total), **two stones active at a time per region**. A spot is chosen at random among the free spots (never one within 12 tiles of an active stone, never one with a player within 25 m).
* A destroyed stone is replaced after `respawn = 6-10 min` (host RNG; tier 1-2: 6 min, tier 3-4: 8 min, tier 5-6: 10 min) at a **different** free spot (so farming moves around).
* An **untouched** stone despawns after 25 min and is re-rolled (so the active set rotates even in an empty region); a stone with damage taken never despawns while someone fights it.
* On world start each region spawns its two stones after 30 s (staggered 15 s).
* Active stones show the **minimap icon** `map-metin` (purple diamond with the tier numeral) to everybody in the region within 120 m, and on the world map once discovered. Spawn/destroy toasts (`world:announce`, kind `metin`): "{Ad} ({Bölge}) belirdi!" and "{Ad} yıkıldı! — {oyuncu}".
* Quest `mq_06_ilk_metin` makes the player destroy the first Keder Metini; **bounties** `bounty_metin` ("Metin Avı": destroy 2 Metin of your level band ±5) enter the daily pool (§6.5).

| Bölge | Metin | doğuş noktaları (karo; aynı anda 2 aktif) |
|---|---|---|
| R1 Sisli Koru | Keder Metini (Sv. 5) | `ms_r1_a` (60,30) · `ms_r1_b` (96,22) · `ms_r1_c` (74,42) · `ms_r1_d` (46,30) |
| R2 Altın Tarlalar | Hırs Metini (Sv. 10) | `ms_r2_a` (138,20) · `ms_r2_b` (130,50) · `ms_r2_c` (154,42) · `ms_r2_d` (117,44) |
| R3 Haydut Tepeleri | Nefret Metini (Sv. 15) | `ms_r3_a` (144,80) · `ms_r3_b` (112,86) · `ms_r3_c` (132,96) · `ms_r3_d` (152,100) |
| R4 Ağıt Bataklığı | Acı Metini (Sv. 20) | `ms_r4_a` (128,134) · `ms_r4_b` (116,138) · `ms_r4_c` (90,130) · `ms_r4_d` (146,134) |
| R5 Ork Kanyonu | Öfke Metini (Sv. 25) | `ms_r5_a` (40,132) · `ms_r5_b` (22,126) · `ms_r5_c` (44,106) · `ms_r5_d` (34,144) |
| R6 Lanetli Harabeler | Ölüm Metini (Sv. 30) | `ms_r6_a` (36,62) · `ms_r6_b` (8,60) · `ms_r6_c` (50,84) · `ms_r6_d` (12,92) |

### 4.5 Loot

Personal loot on destruction (the tables go in `data/loot.ts` as `LootTableDef`s; item level = tier level + 2; equipment follows the smart-loot rules 75% class-fit):

| tablo | Metin | eşya sayısı | min nadirlik | altın | Metin Kalıntısı | beceri kitabı | taş (gem) | ekstra |
|---|---|---|---|---|---|---|---|---|
| `loot_metin_t1` | Keder | 2-3 | Büyülü+ | x12 goldAvg | 5 | Beceri Kitabı I %25 | Kırık taş %30 | Kara Demir x5 |
| `loot_metin_t2` | Hırs | 2-3 | Büyülü+, 1 Nadir %30 | x14 goldAvg | 8 | Beceri Kitabı I %30 · II %10 | Kırık taş %35 | Büyülü Toz x2 |
| `loot_metin_t3` | Nefret | 3-4 | 1 Nadir+ garantili | x16 goldAvg | 12 | Kitap I %35 · II %8 | Kusurlu taş %35 | Efsun Nesnesi %3 |
| `loot_metin_t4` | Acı | 3-4 | 1 Nadir+ garantili | x18 goldAvg | 16 | Kitap II %20 | Kusurlu taş %40 | Efsun Nesnesi %5 · Takviye %8 |
| `loot_metin_t5` | Öfke | 3-5 | 2 Nadir+ garantili | x20 goldAvg | 22 | Kitap II %28 · III %5 | Normal taş %35 | Efsun Nesnesi %7 · Kutsama %3 |
| `loot_metin_t6` | Ölüm | 4-5 | 2 Nadir+, Destansı %20 | x24 goldAvg | 30 | Kitap III %15 | Normal taş %40 · Kusursuz %5 | Efsun Nesnesi %10 · Kutsama %6 · Oyma Kalemi %5 |

Common to all tiers: `Can Küresi` x2 (heal 15%), potion 30%, **Metin Kalıntısı** (new currency, below) per the table. Gem grade follows the character level (GDD_SYSTEMS §5.5: Kırık Sv.1+, Kusurlu 15+, normal 30+, Kusursuz 45+); the gem type is random among the six (so *every* gem type drops from Metin; the farm spots in §3.7 are for *choosing* a type).

### 4.6 Metin Kalıntısı, the Kalıntı Tüccarı and skill books

* **Metin Kalıntısı** (`metin_kalintisi`, material kind `currency`, stack 9,999, rarity `epic` colour, icon `item-crystal-shard` tinted purple): the open-world currency (Metin2's "ejderha taşı/madeni" role). Drops from metin stones, rares, mini-bosses, champions, world bosses; it does not drop from trash.
* **Kalıntı Tüccarı** (`merchant` with `kind: 'metin'`, one per village): trades Kalıntı for upgrade, crafting and convenience items; daily caps keep it a *supplement* to farm spots, not a replacement:

| Ürün | Fiyat | gerekli Sv. | günlük sınır |
|---|---|---|---|
| Beceri Kitabı I (Çırak) | 15 Kalıntı | 5 | 5/gün |
| Beceri Kitabı II (Usta) | 40 Kalıntı | 15 | 3/gün |
| Beceri Kitabı III (Üstat) | 100 Kalıntı | 25 | 1/gün |
| Kara Demir x10 | 8 Kalıntı | 5 | - |
| Büyülü Toz x5 | 14 Kalıntı | 10 | - |
| Taş (rastgele, seviyene uygun kademe) | 12 Kalıntı | 5 | 10/gün |
| Efsun Nesnesi | 30 Kalıntı | 15 | 3/gün |
| Takviye Nesnesi | 20 Kalıntı | 15 | 3/gün |
| Kutsama Kağıdı | 120 Kalıntı | 20 | 1/gün |
| Dönüş Parşömeni x5 | 4 Kalıntı | 1 | - |
| Bilgelik İksiri (60 dk) | 25 Kalıntı | 5 | 2/gün |
| Talih İksiri (30 dk) | 40 Kalıntı | 20 | 2/gün |
| Unvan: "Metin Avcısı" | 300 Kalıntı | 1 | tek |
| Unvan: "Vadinin Hâkimi" (6 çeşit Metin yık) | — | 1 | başarım ödülü |

* **Beceri Kitabı** (skill books; new materials `beceri_kitabi_1` *Çırak*, `_2` *Usta*, `_3` *Üstat*; the roadmap's "M1 → G → P" ranks): each book read in the Skills panel raises the **rank** of one unlocked skill by 1 (`CharacterSave.skillRanks[skillId]`, rank 1 = default, rank 6 = max). Book I may raise a skill up to rank 3, II up to rank 5, III up to rank 6, and the rank may never exceed `ceil(characterLevel / 6) + 1`. **Effect per rank above 1**: +5% skill damage/healing and -2% cooldown (rank 6 = +25% / -10%), implemented by `combat` through `skillRanks` (GDD_SYSTEMS §2.0 already reserves optional ranks). If the combat owner has not wired ranks yet, books are simply stored and show their rank pips — nothing else breaks.

### 4.7 Vadi Efsanevileri (open-world legendaries, stat-only)

Four **stat-only** legendaries (`UniqueDef` without `special`, so combat has nothing to implement) drop from specific rares at 15% (§3.5). `minItemLevel` is below the usual legendary floor of 20 on purpose; the source is fixed (`LootTableDef.uniqueIds` + `uniqueChance`, §9.1):

| id | Ad | slot | min ilvl | kaynak | sabit efsunlar (`fixedAffixes`) | flavor |
|---|---|---|---|---|---|---|
| `leg_vadi_gumus_pence` | Gümüş Pençe | dagger | 3 | Gümüş Yele (r1 nadir) | weaponMax (yerel wpnDamagePct) %40-55 · critChance %2-3 · dex 6-9 | Bir kurdun son pençesi hâlâ keskin. |
| `leg_vadi_boz_postu` | Boz Postu | chest | 8 | Büyük Boz (r2 nadir) | armorPct %25-35 · maxHp 60-90 · vit 8-12 | Tarlaların sahibi artık yok. |
| `leg_vadi_gece_tuyu` | Gece Tüyü Kolyesi | amulet | 13 | Gölge Alfa (r3 nadir) | moveSpeedPct %4-6 · dodgeChance %2-3 · critDamage %10-15 | Sessiz adımlar, sessiz ölümler. |
| `leg_vadi_kemik_tac` | Kemik Tacı | helm | 26 | Kemik Kral Hargar (r6 nadir) | maxHpPct %6-8 · resShadow %15-20 · allAttr 10-14 | Taç ağır, hükümdarlık daha ağır. |


---

## 5. Points of interest

All coordinates are continuous tile coordinates (`[x, z]`) unless a column says metres.

### 5.1 Waypoints (Işınlanma Taşları) and fast travel

The existing `Waypoint` (Diriliş Taşı, `gp(waypoint_stone)`) already wakes when the player walks close and becomes the respawn point. In the open world it additionally becomes a **fast-travel node**: first activation → `flags['world.wp.<id>'] = true`, toast "Işınlanma Taşı keşfedildi: {Ad}", `waypoint:discovered` event, XP "keşif" +2% of `xpToNext`. Travel happens only through a village/camp **Işınlayıcı NPC** (§2.6), never from a bare stone (the stone only sets the respawn point). 11 stones:

| id | Ad | Bölge | karo | dünya m | not |
|---|---|---|---|---|---|
| `wp_gumusdere` | Gümüşdere Taşı | R1 | (83, 17.5) | (334, 72) | köy içi · yeniden doğuş · Kuzgunkale yolu |
| `wp_ciftlik` | Çiftlik Taşı | R2 | (124, 22) | (498, 90) | Altın Ambar Çiftliği |
| `wp_mezarlik` | Mezarlık Taşı | R2 | (150, 9) | (602, 38) | Kemik Mahzeni girişine 15 m |
| `wp_hoyuk` | Höyük Taşı | R2 | (118, 64) | (474, 258) | Çürükkök grup buluşma noktası |
| `wp_tepeler` | Tepeler Taşı | R3 | (136, 72) | (546, 290) | Haydut Tepeleri girişi |
| `wp_kizilkaya` | Kızılkaya Taşı | R3 | (111, 108.5) | (446, 436) | köy içi · yeniden doğuş |
| `wp_iskele` | İskele Taşı | R4 | (84, 136) | (338, 546) | Bataklık İskelesi |
| `wp_kanyon` | Kanyon Taşı | R5 | (52, 136) | (210, 546) | Kanyon Girişi Kampı |
| `wp_kor_ocagi` | Kor Ocağı Taşı | R5 | (49, 150) | (198, 602) | Kızıl Dökümhane girişine 12 m |
| `wp_son_ocak` | Son Ocak Taşı | R6 | (30, 96) | (122, 386) | Son Ocak Kampı · yeniden doğuş |
| `wp_anit` | Anıt Taşı | R6 | (22, 66) | (90, 266) | Kara Anıt, Ölüm Metini bölgesi |

### 5.2 Dungeon entrances in the world

The cave mouth / crypt door is the same `Portal` interactable the town uses (`dungeonId`, difficulty panel `keystone`, same unlock rules §7); only the dressing and the *return* differ. After a run (exit portal / `scroll_town` / wipe release) the party comes back to the **world entrance** (`DungeonParams.returnTo`, §9.1) — not to Kuzgunkale — and spawns 6 m in front of the door. The Kadim Kapılar Salonu portals in Kuzgunkale remain for Mitik+ keys and for players who are in town. The two other entrances live on the second map (§1.8).

| id | Ad | dungeonId | Bölge | karo | yön° | min Sv. | görsel |
|---|---|---|---|---|---|---|---|
| `ent_kemik_mahzeni` | Kemik Mahzeni Girişi | `kemik_mahzeni` | R2 | (151, 6) | 0 | 8 | Mezarlık kriptası (`kg(crypt-large)` x3 + `crypt-large-door` animasyonlu) |
| `ent_kizil_dokumhane` | Kızıl Dökümhane Girişi | `kizil_dokumhane` | R5 | (52, 148) | -90 | 18 | Kanyon doğu duvarında lav ağzı (`gp(rock_cliff)` x4 çerçeve + `mplus_portal` küçük ölçek, turuncu) |

Before the quest `mq_09_mezarligin_sirri` is done, the Kemik Mahzeni door shows the hint "Kapı mühürlü. Mezarlıktaki iskeletleri temizle." and opens the panel only after the quest flag (`q.mq_09_mezarligin_sirri` = done) **or** level ≥ 10 (so a player who skipped the quest is not locked out).

### 5.3 Shrines (Sunak)

The five existing `Shrine` types (GDD_CONTENT §1.4), placed two per region. Open-world rule: usable once per player and **reusable after 20 min** (per player flag with timestamp, because shrines are client-side props that go dark locally), buff radius 20 m; `shrine_wisdom` +50% XP for 120 s (the same 120 s on every use; cap one active), `shrine_greed` = gold burst (30 x `goldAvg(L)`) + 1 item at the region level.

| id | tür | Ad | Bölge | karo |
|---|---|---|---|---|
| `sh_r1_a` | `shrine_wisdom` | Bilgelik Sunağı | R1 | (66, 16) |
| `sh_r1_b` | `shrine_haste` | Rüzgar Sunağı | R1 | (90, 34) |
| `sh_r2_a` | `shrine_power` | Kudret Sunağı | R2 | (132, 30) |
| `sh_r2_b` | `shrine_ward` | Koruma Sunağı | R2 | (146, 54) |
| `sh_r3_a` | `shrine_haste` | Rüzgar Sunağı | R3 | (120, 82) |
| `sh_r3_b` | `shrine_greed` | Açgözlülük Sunağı | R3 | (146, 96) |
| `sh_r4_a` | `shrine_ward` | Koruma Sunağı | R4 | (100, 138) |
| `sh_r4_b` | `shrine_power` | Kudret Sunağı | R4 | (136, 150) |
| `sh_r5_a` | `shrine_greed` | Açgözlülük Sunağı | R5 | (30, 120) |
| `sh_r5_b` | `shrine_ward` | Koruma Sunağı | R5 | (8, 118) |
| `sh_r6_a` | `shrine_wisdom` | Bilgelik Sunağı | R6 | (24, 88) |
| `sh_r6_b` | `shrine_power` | Kudret Sunağı | R6 | (44, 72) |

### 5.4 Treasure chests and cursed chests (Lanetli Sandık)

* **Treasure chests** (`Chest` interactable, `chest_wood` / `chest_iron` / `chest_gold`): 18 fixed chests, **respawn 30 min** after opening (per player), loot = one drop rolled as Seçkin (wood: min Büyülü; iron: min Büyülü + 25% Nadir; gold: min Nadir) at region level + 2 coins ×6 `goldAvg`.

| id | tür | Bölge | karo |
|---|---|---|---|
| `ch_r1_a` | `chest_wood` | R1 | (44, 12) |
| `ch_r1_b` | `chest_wood` | R1 | (104, 24) |
| `ch_r1_c` | `chest_wood` | R1 | (58, 40) |
| `ch_r2_a` | `chest_wood` | R2 | (136, 40) |
| `ch_r2_b` | `chest_iron` | R2 | (154, 62) |
| `ch_r2_c` | `chest_wood` | R2 | (126, 8) |
| `ch_r3_a` | `chest_iron` | R3 | (104, 72) |
| `ch_r3_b` | `chest_iron` | R3 | (148, 82) |
| `ch_r3_c` | `chest_iron` | R3 | (124, 110) |
| `ch_r4_a` | `chest_iron` | R4 | (108, 126) |
| `ch_r4_b` | `chest_iron` | R4 | (146, 152) |
| `ch_r4_c` | `chest_gold` | R4 | (62, 142) |
| `ch_r5_a` | `chest_gold` | R5 | (14, 112) |
| `ch_r5_b` | `chest_gold` | R5 | (54, 112) |
| `ch_r5_c` | `chest_gold` | R5 | (30, 150) |
| `ch_r6_a` | `chest_gold` | R6 | (50, 64) |
| `ch_r6_b` | `chest_gold` | R6 | (6, 66) |
| `ch_r6_c` | `chest_gold` | R6 | (36, 94) |

* **Lanetli Sandık** (GDD_CONTENT §1.8, `CursedChest`): one per region (6; the old two spots became `cc_r1`, `cc_r2`). Rules as written there (7 waves of 6 every 5 s in a 10 m ring, 40 kills in 36 s for an **Ara Patron drop**, else one Seçkin drop, 10 min cooldown per spot) with the wave mobs taken from the **nearest camp's member list** at the camp's level range. Host-started (`CursedChest.onOpen` → `ZoneEvents`), guests ask via `sendRequest` as today.

| id | Bölge | karo | dalga mob seviyesi |
|---|---|---|---|
| `cc_r1` | R1 | (82, 32) | 1-5 |
| `cc_r2` | R2 | (126, 20) | 5-10 |
| `cc_r3` | R3 | (118, 100) | 10-15 |
| `cc_r4` | R4 | (118, 132) | 15-20 |
| `cc_r5` | R5 | (40, 122) | 20-25 |
| `cc_r6` | R6 | (30, 82) | 25-30 |

### 5.5 Gathering nodes (simple, optional)

Two node kinds, no profession system, only a click and a short channel (1.2 s `Interact` clip): **Demir Damarı** (ore: `kn(rock_tallA..F)` with a gold-glint VFX, drops `kara_demir` / `buyulu_toz` / `ejderha_pulu`) and **Şifalı Ot** (herb: `kn(plant_bushDetailed)` + `flower_*` with a green glow, drops a potion of the region tier). Nodes are **scattered at load** by a seeded RNG on free nav cells inside each field (`count` nodes within `radius` tiles of `center`) and respawn after `respawnSec` (per player, client-side). They are a 30-second detour, not a grind.

| id | tür | Bölge | merkez (karo) | yarıçap (karo) | adet | yeniden doğuş sn | verim |
|---|---|---|---|---|---|---|---|
| `gf_r1_ore` | Demir Damarı | R1 | (44, 40) | 4 | 4 | 300 | Kara Demir x2-4 |
| `gf_r1_herb` | Şifalı Ot | R1 | (94, 8) | 5 | 6 | 240 | Küçük Can İksiri x1 |
| `gf_r2_ore` | Demir Damarı | R2 | (154, 28) | 4 | 4 | 300 | Kara Demir x3-5 |
| `gf_r2_herb` | Şifalı Ot | R2 | (120, 14) | 5 | 6 | 240 | Küçük Can İksiri x1-2 |
| `gf_r3_ore` | Demir Damarı | R3 | (150, 112) | 4 | 5 | 300 | Kara Demir x3-6 · Büyülü Toz %20 |
| `gf_r3_herb` | Şifalı Ot | R3 | (110, 74) | 4 | 5 | 240 | Orta Can İksiri x1 |
| `gf_r4_herb` | Şifalı Ot | R4 | (72, 124) | 5 | 6 | 240 | Orta Can/Ruh İksiri x1-2 |
| `gf_r4_ore` | Demir Damarı | R4 | (152, 134) | 4 | 4 | 300 | Büyülü Toz x1-3 |
| `gf_r5_ore` | Demir Damarı | R5 | (14, 100) | 4 | 6 | 300 | Büyülü Toz x2-4 · Ejderha Pulu %5 |
| `gf_r5_herb` | Şifalı Ot | R5 | (48, 140) | 4 | 4 | 240 | Büyük Can İksiri x1 |
| `gf_r6_ore` | Demir Damarı | R6 | (54, 70) | 4 | 5 | 300 | Büyülü Toz x2-4 · Ejderha Pulu %8 |
| `gf_r6_herb` | Şifalı Ot | R6 | (10, 76) | 4 | 4 | 240 | Büyük Can/Ruh İksiri x1 |

### 5.6 Hidden areas

Discovered by walking into the small trigger radius; first discovery grants **keşif XP 8-10% of `xpToNext`**, the toast "Gizli bölge keşfedildi: {Ad}!" and the achievement `ach_hidden_<id>` (6 entries → title "Kaşif"). Rewards in the table; the lake island is reached by the **Hayalet Kayık**: a ghost boat (`kn(canoe)` with blue ghost tint and `waypoint_glow`) at tile **(101, 86)** on the lake's east shore; interact → 4 s fade, the party member who clicked (and members within 6 m) is teleported to the island room `r7_mabed_adasi` at (79, 82), where a stone `Dönüş Taşı` returns them (round trip allowed once per 20 min per player).

| id | Ad | Bölge | karo | yarıçap | keşif ipucu | ödül |
|---|---|---|---|---|---|---|
| `hd_r1` | Kurtların Gizli Çayırı | R1 | (42, 6) | 3 | Ağaç perdesinin arkasında saklı çayır | chest_wood + keşif XP %8 + Gümüş Yele %50 şansla orada |
| `hd_r2` | Gizli Ambar | R2 | (155, 66) | 3 | Saman yığınının altındaki kapak | chest_iron + keşif XP %8 + 2 Küçük Can İksiri |
| `hd_r3` | Haydut Hazinesi | R3 | (156, 112) | 3 | Kayalıkların arkasında çalıntı mal | chest_iron x2 + keşif XP %8 + Efsun Nesnesi %25 |
| `hd_r4` | Cadının Bahçesi | R4 | (62, 154) | 3 | Sazlıkların arasında parlayan şifalı otlar | herb alanı (6) + chest_gold + keşif XP %8 |
| `hd_r5` | Ejder Yumurtası Mağarası | R5 | (6, 140) | 3 | Kaya yarığının ardında kızıl parıltı | chest_gold + Ejderha Pulu x2 + keşif XP %8 |
| `hd_r6` | Gölün Adası Mabedi | Sis Gölü (ada) | (79, 82) | 3 | Hayalet Kayık ile ulaşılır (ada: `r7_mabed_adasi`) | shrine_greed + chest_gold x2 + keşif XP %10 |

### 5.7 Landmarks (ufuk işaretleri)

One signature silhouette per region, visible from the previous region's far edge through the fog (their size is chosen so they poke through `fogFar`):

| id | Ad | Bölge | konum | kurulum |
|---|---|---|---|---|
| `lm_degirmen` | Gümüşdere Değirmeni | R1 | (60, 12) ≈ (242, 50) m | `kf(windmill)` x4 (12 m) + `gp(sacks)` x3 + `ip(psx-medieval,market/haybale)` x4 |
| `lm_hoyuk` | Çürük Höyük | R2 | (126, 60) ≈ (506, 242) m | mantar halkası: `kn(mushroom_redGroup)` x14 r 5.2 tile + `kn(mushroom_redTall)` x22 x3 + mor kristaller (var olan Sisli Koru reçetesi) |
| `lm_kule` | Yıkık Gözcü Kulesi | R3 | (128, 106) ≈ (514, 426) m | `ip(nocturnal-watch,tower)` (30 m) tint 0x8a8070 + `gp(rock_large)` enkaz halkası + 6 `hw(bone_A)` |
| `lm_agit_agaci` | Ağıt Ağacı | R4 | (110, 146) ≈ (442, 586) m | `hw(tree_dead_large_decorated)` x4 (20 m) + `hw(lantern_hanging)` x8 + `kn(hanging_moss)` |
| `lm_kizil_kale` | Kızıl Kale | R5 | (24, 128) ≈ (98, 514) m | `tw(buildings/red/building_castle_red)` x8 + `tw(buildings/red/building_tower_B_red)` x4 + `ip(psx-walls-fences,plackard-wall/*)` sur + kırmızı sancaklar `gp(banner_red)` |
| `lm_kara_anit` | Kara Anıt | R6 | (30, 66) ≈ (122, 266) m | `kg(pillar-obelisk)` x9 (9 m) tint 0x302848 + `gp(lobby_obelisk)` mor tint + 8 `gp(statue_hooded)` halka r 8 m |

### 5.8 Vistas and exploration XP

Eight **Manzara Noktaları**: a bench `hw(bench)`, a signpost `gp(signpost)` and a flat rock with a `waypoint_glow` spark. Stepping on one the first time grants keşif XP 6% of `xpToNext`, an optional 2 s camera pan toward the nearest landmark (skippable) and `ach_vista_<id>`. Exploration XP summary: new region 10%, waypoint 2%, hidden area 8-10%, vista 6% — together about **1.2 levels of XP across 1-30** (a nudge to explore, not a path).

| id | Ad | Bölge | karo |
|---|---|---|---|
| `vs_r1` | Değirmen Tepesi | R1 | (50, 6) |
| `vs_r1b` | Köprü Manzarası | R1 | (106, 30) |
| `vs_r2` | Altın Ufuk | R2 | (156, 8) |
| `vs_r3` | Kartal Kayası | R3 | (156, 72) |
| `vs_r3b` | Göl Seyir Noktası | R3 | (102, 98) |
| `vs_r4` | Ağıt Ağacı Dibi | R4 | (112, 154) |
| `vs_r5` | Kızıl Uçurum | R5 | (4, 100) |
| `vs_r6` | Kara Anıt Zirvesi | R6 | (30, 54) |

### 5.9 Map and minimap representation

* **Region banner** (`ui:zoneName`): title = region name, subtitle = "Seviye a-b" (e.g. "Altın Tarlalar — Seviye 5-10"), 3 s, plus `world:regionEntered` for music/atmosphere/discovery XP. Villages announce their own name ("Gümüşdere Köyü — Güvenli Bölge") on crossing the gate box; leaving shows "Güvenli bölgeden çıkıyorsun".
* **World map** (`map` panel, `G.scenes.current` is the world map when the nav matches `grid * 4`, as `currentDungeon()` already does): the explored fog layer exists today; add (a) region fills in a faint tint of the region fog colour with the region name and level band at the region centre, (b) **icons** (new SVGs, hud module): `map-village` (house, gold), `map-camp` (tent), `map-waypoint` (blue diamond, filled when discovered), `map-metin` (purple diamond + tier numeral, only active stones within the player's known area), `map-boss` (red skull), `map-miniboss` (orange skull), `map-rare` (silver star, only live rares within 120 m of the player), `map-dungeon` (door), `map-chest`, `map-shrine` (coloured by type), `map-vista` (eye), `map-ore` / `map-herb`, `map-quest` (gold `!` available, gold `?` ready), `map-party` (class-coloured dots, existing), (c) the player's quest targets as blue rings, (d) legend + filter toggles. Undiscovered POIs are not shown (waypoints, entrances and villages reveal on first sight within 30 m).
* **Minimap**: title shows the region name (`world:regionEntered`), icons for villages/waypoints/metin/boss/rare within the minimap radius, quest rings, no fog-of-war changes.


---

## 6. Quests and levelling flow

### 6.1 Quest system overview

There is **no quest system in the code today** (only the daily bounties of `systems/Bounties.ts`). This section defines the minimum a Metin2/WoW-style levelling game needs; the data model is in §9.1 (`types/quests.ts`), the runtime is the items module's `systems/Quests.ts` (`G.quests`), the UI is panels-game (`questlog`, `dialog`) + a HUD tracker.

* **Quest givers** are `TownNpc`s with role `quest` (`TownNpc.quests: string[]` = quest ids they offer/turn in). Marker above the head: gold `!` (available, level met), gold `?` (ready to turn in), grey `?` (in progress). Interact → `dialog` panel (offer / progress / done text, Turkish) → accept/turn in.
* **Objective kinds**: `talk`, `kill` (enemy id or family), `collect` (a drop that only exists while the quest is active), `skill` (e.g. interrupt a cast: listens to `enemy:castEnd { interrupted: true }`), `boss` (kill a named mini-boss/boss), `metin` (destroy a tier), `dungeon` (complete a dungeon on a difficulty), `explore`. Kill/boss/metin progress is counted **per peer for its own player** from the same `death` hook the loot system uses (`G.loot.onEnemyKilled`), so every party member progresses without extra net traffic.
* **Rewards**: `xpPct` = % of `xpToNext(level of the quest)` (so a quest stays worth the same fraction of a level), gold (the tables show the final amount, about 4-30 x quest level), items (generic "Büyülü silah" = a Büyülü item of a slot the class can use, via smart loot, ilvl = quest level), materials. **Quest XP is scaled down per band** so that quests give about **45% of a level at 1-10, 32% at 10-20 and 22% at 20-30** (the rest is grind, Metin, rares, exploration, dungeon first clears): the tables below already contain the scaled values.
* Quests are **one-time** (`flags['q.<id>'] = 'done'`), repeatable content is the daily bounties and Metin/rares.
* The tracker (top right, 3 lines) shows the pinned quest; map rings mark targets; the `questlog` panel (key `L`) lists active/ready/done per region.

### 6.2 Main quest chain: "Kadim Mühür"

Story (the Turkish `text.offer` lines are the content module's job, ≤ 3 sentences each): *Kuzgunkale'nin altındaki Kadim Mühür çatlıyor. Mühür dört parçadan oluşur; parçalar Vadi'ye dağılmış. Muhtar Cemal seni Gümüşdere'ye gönderir; Vadi'yi baştan sona geçer, dört Mühür Parçası'nı toplar, onları Kuzgunkale'ye getirirsin.* The chain walks the player through **all six regions, both villages, Metin, the world boss, and the first two dungeons** and ends at level 30 with the unlock of the next map and the Buzul Tahtı portal.

| id | Görev | veren | Sv. | hedef | XP (xpToNext %) | altın | ödül | sonraki / açılan |
|---|---|---|---|---|---|---|---|---|
| `mq_01_kuzgunun_cagrisi` | Kuzgun'un Çağrısı | Muhtar Cemal (Kuzgunkale) | 1 | Güney Kapısı'ndan çık, Gümüşdere Köyü'nde Muhtar Ferhat ile konuş | %10 | 4 | Dönüş Parşömeni x2 · Küçük Can İksiri x3 | mq_02 |
| `mq_02_fare_yuvasi` | Fare Yuvası | Muhtar Ferhat | 1 | 10 Orman Sıçanı öldür (temel saldırı + alan hasarı) | %20 | 4 | - | mq_03 |
| `mq_03_balcik_temizligi` | Balçık Temizliği | Muhtar Ferhat | 2 | 8 Yeşil Balçık öldür (bölünen düşmanlar) | %20 | 8 | Küçük Can İksiri x3 | mq_04 |
| `mq_04_samani_sustur` | Şamanı Sustur | Muhtar Ferhat | 3 | Goblin Şamanı'nın Şifa Duası'nı 3 kez kes (kesme: sersemletme/vuruş sendeletmesi) | %25 | 15 | Büyülü silah | mq_05 |
| `mq_05_yagmaci_kampi` | Yağmacı Başı | Muhtar Ferhat | 4 | Yağmacı Başı Gırtlak'ı öldür (mini-boss: telegraph + çağrılan yardımcılar) | %30 | 24 | Büyülü zırh | mq_06 |
| `mq_06_ilk_metin` | İlk Metin | Muhtar Ferhat | 5 | 1 Keder Metini yık (Metin mekaniği: dalgalar, aura) | %25 | 30 | Metin Kalıntısı x5 · Beceri Kitabı I x1 | mq_07; Kalıntı Tüccarı açılır |
| `mq_07_kopruyu_gec` | Taş Köprü'nün Ötesi | Muhtar Ferhat | 5 | Taş Köprü'yü geç, Altın Ambar Çiftliği'nde Çiftlik Sahibi Rıza ile konuş | %15 | 20 | Işınlanma Taşı keşfi | mq_08 |
| `mq_08_ciftlik_isgali` | Çiftlik İşgali | Çiftlik Sahibi Rıza | 6 | 12 Yaban Domuzu + 8 Korkuluk öldür | %20 | 36 | Büyülü zırh | mq_09 |
| `mq_09_mezarligin_sirri` | Mezarlığın Sırrı | Çiftlik Sahibi Rıza | 8 | Kayıp Mezarlık'ta 10 iskelet öldür; Kemik Mahzeni kapısını bul | %25 | 64 | Kemik Mahzeni ipucu: giriş kapısı etkinleşir | mq_10 |
| `mq_10_kemik_mahzeni` | Kemik Mahzeni | Çiftlik Sahibi Rıza | 8 | Kemik Mahzeni'ni Normal zorlukta bitir (ilk temizleme bonusu %50 ayrıca) | %45 | 80 | Nadir eşya · Mühür Parçası I | mq_11 |
| `mq_11_curukkok` | Çürükkök | Çiftlik Sahibi Rıza | 10 | Çürükkök'ü yen (grup önerilir) — alternatif: 15 Mantar Zorbası | %45 | 100 | Nadir eşya | mq_12 |
| `mq_12_haydut_kalesi` | Haydut Kalesi | Çiftlik Sahibi Rıza | 12 | Haydut Kralı Karabıyık'ı öldür + 15 haydut | %30 | 144 | Mühür Parçası II · Nadir eşya | mq_13 |
| `mq_13_kizilkaya_haberi` | Kızılkaya'dan Haber | Komutan Aslan | 13 | Kızılkaya Karakolu'na ulaş, Komutan Aslan ile konuş; 10 Savaş Kurdu / Kurt öldür | %25 | 104 | Büyülü silah | mq_14 |
| `mq_14_bataklik_cadisi` | Bataklık Cadısı | Komutan Aslan | 17 | Cadı Zehra'yı öldür + 6 Cadı Otu topla | %45 | 238 | Mühür Parçası III · Nadir eşya | mq_15 |
| `mq_15_kor_ocagi` | Kor Ocağı | Komutan Aslan | 18 | Kızıl Dökümhane'yi Normal zorlukta bitir | %50 | 252 | Nadir eşya · Kor Ocağı Taşı | mq_16 |
| `mq_16_ork_istilasi` | Ork İstilası | Kanyon Girişi Kampı (Teğmen Deniz) | 22 | 3 Ork Savaş Sancağı yık + Ork Reisi Gorak'ı öldür | %50 | 352 | Nadir eşya x2 | mq_17 |
| `mq_17_lanetli_yol` | Lanetli Yol | Nöbetçi Başı Talha | 26 | 12 iskelet + 6 Kara Tarikat müridi öldür | %30 | 468 | Büyülü Toz x10 | mq_18 |
| `mq_18_kara_anit` | Kara Anıt | Nöbetçi Başı Talha | 29 | Ölüm Metini'ni yık + Kan Lordu Valdemar'ı öldür | %40 | 580 | Mühür Parçası IV · Destansı eşya | mq_19 |
| `mq_19_kuzgunkaleye_donus` | Kuzgunkale'ye Dönüş | Muhtar Cemal (Kuzgunkale) | 30 | Dört Mühür Parçası'nı Muhtar Cemal'e teslim et | %55 | 900 | Destansı eşya · Buzul Tahtı kapısı + Doğu Kapısı (Karakır Bozkırı) açılır | Karakır Bozkırı zinciri |

Player-facing quest names are the Turkish `Görev` column; "Mühür Parçası I-IV" are story items (`quest` category, no stack).

### 6.3 Side quests (kill/collect, per settlement)

Side quests are short (3-6 min), teach one mechanic each and pay mostly useful materials. Gümüşdere/Çiftlik quests are available from level 2; Kızılkaya ones from 12; Son Ocak ones from 26. `place` is a camp id (§3.2) or a landmark.

| id | Görev | veren | yer | Sv. | hedef | XP (xpToNext %) | ödül |
|---|---|---|---|---|---|---|---|
| `sq_g_01_kurt_tehlikesi` | Kurt Tehlikesi | Avcı Yıldız | `r1_c03` | 2 | 8 Orman Kurdu öldür | %15 | Küçük Can İksiri x2 |
| `sq_g_02_geyik_derisi` | Geyik Derisi | Avcı Yıldız | r1 ambient | 2 | 5 Geyik Derisi topla (geyik kaçar: kovala) | %15 | Gümüş Yüzük |
| `sq_g_03_orumcek_aglari` | Ağ Ustaları | Çiftçi Hatice | `r1_c06` | 4 | 8 Orman Örümceği öldür (ağ atışlarından yuvarlan) | %15 | - |
| `sq_g_04_ari_yuvasi` | Arı Yuvası | Çiftçi Hatice | `r1_c07` | 4 | 10 Orman Arısı öldür | %15 | Büyülü Toz x2 |
| `sq_g_05_mantar_halkasi` | Mantar Halkası | Rahibe Meryem | `r1_c05` | 4 | 12 Mantarcık öldür; ölünce zehir bulutundan kaç | %15 | Küçük Ruh İksiri x3 |
| `sq_g_06_degirmen` | Eski Değirmen | Muhtar Ferhat | `r1_c10` | 5 | Değirmendeki kurt ini'ni temizle (3 kurt + 2 domuz) ve Gümüş Yele'yi bul | %15 | Nadir yüzük |
| `sq_c_01_bugday_hirsizlari` | Buğday Hırsızları | Çiftlik Sahibi Rıza | `r2_c10` | 8 | 10 Puglin Yağmacı öldür | %15 | - |
| `sq_c_02_korkuluk_sirri` | Korkuluk Sırrı | Çiftlik Sahibi Rıza | `r2_c02` | 7 | 8 Korkuluk öldür, Korkuluk Kral'ı (nadir) bul | %15 | Büyülü zırh |
| `sq_c_03_terk_edilmis_ciftlik` | Terk Edilmiş Çiftlik | Çiftlik Sahibi Rıza | `r2_c03` | 7 | Çiftlik kampını temizle (5 köylü + 4 yarasa) + devriye | %15 | Nadir eldiven |
| `sq_c_04_mantar_kokusu` | Mantar Kokusu | Rahibe Meryem | `r2_c05` | 8 | 6 Mantar Zorbası öldür | %15 | Zümrüt (Kırık) x1 |
| `sq_c_05_haydut_devriyesi` | Haydut Devriyesi | Çiftlik Sahibi Rıza | `r2_c06` | 9 | Haydut Karakolu'nu temizle (haydut + okçu + pehlivan) | %15 | Efsun Nesnesi x1 |
| `sq_k_01_gol_kiyisi` | Göl Kıyısı | Avcı Karaca | `r3_c07` | 12 | 2 Boz Ayı + 6 Kurt öldür | %15 | Büyülü Toz x5 |
| `sq_k_02_warg_sürüsü` | Warg Sürüsü | Komutan Aslan | `r3_c08` | 14 | 2 Savaş Kurdu + 6 Puglin öldür | %15 | Nadir eşya |
| `sq_k_03_gozcu_kulesi` | Yıkık Gözcü Kulesi | Komutan Aslan | `r3_c09` | 14 | Gözcü kulesini temizle (haydut okçuları: menzile sızarak) | %15 | Nadir eşya |
| `sq_k_04_gergedan` | Gergedan Otlağı | Avcı Karaca | `r3_c05` | 13 | 2 Dağ Gergedanı öldür (hücumdan kaç) | %15 | Büyülü Toz x6 |
| `sq_k_05_agit_isigi` | Ağıt Işıkları | Avcı Karaca | `r4_c01` | 16 | 10 Bataklık Işığı öldür; patlamadan uzak dur | %20 | Orta Can İksiri x4 |
| `sq_k_06_zehirli_magara` | Zehirli Mağara | Avcı Karaca | `r4_c06` | 18 | 2 Dev Örümcek + 6 Örümcek öldür | %25 | Zümrüt (Kusurlu) x1 |
| `sq_k_07_ciyan_cukuru` | Çıyan Çukuru | Avcı Karaca | `r4_c04` | 17 | 8 Çürük Çıyanı öldür | %20 | Topaz (Kusurlu) x1 |
| `sq_s_01_kanyon_gecidi` | Kanyon Geçidi | Teğmen Deniz | `r5_c01` | 21 | 6 Ork Savaşçısı + 3 Fırlatıcı öldür | %20 | Büyülü Toz x6 |
| `sq_s_02_tas_ocagi` | Taş Ocağı | Teğmen Deniz | `r5_c05` | 23 | 2 Kanyon Golemi öldür | %20 | Ejderha Pulu x1 |
| `sq_s_03_kor_ocagi_ates` | Kor Çatlağı | Teğmen Deniz | `r5_c04` | 22 | 5 Kanyon İblisçiği + Kor Elementali öldür | %20 | Yakut (Kusurlu) x1 |
| `sq_s_04_kemik_nobeti` | Kemik Nöbeti | Nöbetçi Başı Talha | `r6_c01` | 26 | Son Ocak Nöbeti kampını temizle | %15 | Büyülü Toz x8 |
| `sq_s_05_kutuphane` | Eski Kütüphane | Nöbetçi Başı Talha | `r6_c05` | 28 | Kütüphane kampını temizle; 3 Kemik Büyücüsü | %15 | Oyma Kalemi x1 |
| `sq_s_06_vampir_izi` | Vampir İzi | Nöbetçi Başı Talha | `r6_c08` | 29 | Kan Lordu Salonu'ndaki Kan Lordu'nu öldür | %15 | Ametist (Kusursuz) x1 |

### 6.4 Av Defteri (biyolog-style collection quest, optional)

Metin2's biologist asks for a monster part every ~30 minutes in exchange for permanent stat bonuses. **Avcı Yıldız** (Gümüşdere; Avcı Karaca in Kızılkaya) runs the **Av Defteri**: 6 steps, each needing N *trophies* that drop from the listed monsters at **15%** (swarm 6%) **only while the step is active**; delivering a step has a **20-minute cooldown** before the next delivery (flag `world.bio.cd`), the reward is a **permanent character bonus** added to `StatCalc` as a flag-driven block (`flags['world.bio'] >= step`). It is a long-tail goal that sends players to every region.

| adım | min Sv. | koleksiyon eşyası | adet | kaynak | kalıcı ödül |
|---|---|---|---|---|---|
| 1 | 5 | Kurt Dişi | 15 | Kurtlar (ow_wolf) | maxHpPct +%1 |
| 2 | 10 | Domuz Dişi | 20 | Yaban Domuzu / Gergedan | damagePct +%1 |
| 3 | 15 | Haydut Mührü | 25 | Haydutlar | armorPct +%2 |
| 4 | 20 | Bataklık Özü | 30 | Gulyabani / Çamur / Hortlak | resPoison +%3 |
| 5 | 25 | Ork Dişi Kolye | 35 | Orklar | critChance +%1 |
| 6 | 30 | Lanetli Kemik | 40 | İskelet / Tarikat / Gölge | moveSpeedPct +%2 |

### 6.5 Daily bounties integration

Daily bounties (GDD_SYSTEMS §6.8) are unchanged: 3 per day from the template pool, 15% of `xpToNext`, `100 x L` gold, `Av Mührü` x5, Günlük Sandık for all 3. **Add these templates** (items module, `Bounties.ts`) so the open world feeds them (all use the player's level band ±5):

| Template id | TR title | Requirement | Counts |
|---|---|---|---|
| `bounty_metin` | Metin Avı | destroy 2 Metin of the player's level band | contributor credit (§4.2) |
| `bounty_rare` | Nadir Avcısı | kill 1 named rare of the band | any rare (§3.5) |
| `bounty_farm` | Kamp Temizliği | clear 3 Seçkin-lider camps or `farm` camps of the band | camp fully cleared by the player's party |
| `bounty_kill_boss` (existing, "Patron Avı") | Patron Avı | kill 2 Patrons | **mini-bosses and world bosses count** (levels < 60) |
| `bounty_kill_family` (existing) | {Aile} Avı | 60 monsters of one family | families map from the new defs (`beast`, `spider`, `ghost`, `skeleton`, `cultist`, `golem`, `demon`, plus new `bandit`, `orc` families: add to the family table) |

The bounty board is available in Gümüşdere and Kızılkaya as well as Kuzgunkale (same daily state, same claim logic).

### 6.6 XP pacing

All formulas are GDD_SYSTEMS §6.1 (`xpMonster(L) = round(5 + 1.2 L^1.5)`, `killsToLevel = 30 + 10 L`, `xpToNext = round10(killsToLevel x xpMonster)`) and the §6.2 modifiers; nothing in the curve changes.

| Sv. | xpToNext | xpMonster (Sıradan) | hedef kill/sv. | monsterHP | monsterDmg |
|---|---|---|---|---|---|
| 1 | 240 | 6 | 40 | 15 | 18 |
| 2 | 400 | 8 | 50 | 16 | 23 |
| 3 | 660 | 11 | 60 | 20 | 28 |
| 4 | 1050 | 15 | 70 | 24 | 32 |
| 5 | 1440 | 18 | 80 | 30 | 36 |
| 8 | 3520 | 32 | 110 | 54 | 50 |
| 10 | 5590 | 43 | 130 | 76 | 59 |
| 12 | 8250 | 55 | 150 | 103 | 68 |
| 15 | 13500 | 75 | 180 | 154 | 82 |
| 18 | 20370 | 97 | 210 | 215 | 95 |
| 20 | 25760 | 112 | 230 | 262 | 104 |
| 22 | 32250 | 129 | 250 | 314 | 113 |
| 25 | 43400 | 155 | 280 | 402 | 126 |
| 28 | 56730 | 183 | 310 | 500 | 140 |
| 29 | 61440 | 192 | 320 | 535 | 144 |
| 30 | 66660 | 202 | 330 | 572 | 149 |

**Model used for the pacing table** (all assumptions in one place so the numbers can be re-derived): a player sustains `10.2 + 0.24 x L` *Sıradan-equivalent kills per minute* **including** walking, looting, potions and dying (swarm = 0.35, Seçkin = 5; AoE and swarm density let that rate grow with level), spends 1.6 min of extra walking/turn-in per quest, and the XP of a level comes from: quests (45% / 32% / 22%, §6.1), Metin (10% from level 5: a Metin stone is ≈ 15 kills of stone XP plus ≈ 25-35 wave kills in ≈ 2.5 min), exploration/shrines/rares/chests (5%), and the rest grind.

| Seviye | Bölge | bandın toplam XP'si | görev payı (XP) | seviye başı grind (Sıradan eş.) | seviye başı kamp temizliği (≈) | grind dk / seviye | görev sayısı | bant toplamı dk (grind + görev yürüyüşü) | kümülatif |
|---|---|---|---|---|---|---|---|---|---|
| 1-5 | Sisli Koru | 2,350 | %45 | 28 | 5.6 | 2.5 | 10 | 26 | 26 (0.4 sa) |
| 5-10 | Altın Tarlalar | 14,170 | %44 | 41 | 6.8 | 3.4 | 11 | 35 | 61 (1.0 sa) |
| 10-15 | Haydut Tepeleri | 42,020 | %32 | 80 | 6.6 | 6.1 | 7 | 42 | 102 (1.7 sa) |
| 15-20 | Ağıt Bataklığı | 90,130 | %32 | 106 | 14.9 | 7.4 | 5 | 45 | 148 (2.5 sa) |
| 20-25 | Ork Kanyonu | 161,850 | %22 | 158 | 12.6 | 10.2 | 4 | 57 | 205 (3.4 sa) |
| 25-30 | Lanetli Harabeler | 261,030 | %23 | 186 | 21.9 | 11.1 | 5 | 64 | 269 (4.5 sa) |
| **1-30** |  | 571,550 |  |  |  |  |  | **269** | **4.5 sa** |

Reading the table: **levels 1-10 take about an hour**, 1-20 about 2.5 h, 1-30 about **4.5 h** if the player never runs a dungeon. The two dungeon runs on the way (Kemik Mahzeni Normal at 8, Kızıl Dökümhane Normal at 18; GDD_CONTENT §7 gives 18 min first clear, 12 min repeats, with the 50% first-clear XP bonus) cut that to about **3.8 h**. The old GDD_CONTENT §7 timeline (30 at ≈ 4:00 h) therefore still holds.

**Recommended levelling route** (the camp ids are §3.2; mob level ≈ player level ±2 keeps XP at 100%):

| Seviye | Nerede | Yap |
|---|---|---|
| 1-2 | Gümüşdere → R1 güney/batı: `r1_c01` Fare Yuvası, `r1_c02` Balçık Gölü | `mq_01`-`mq_03`; Av Defteri adım 1 |
| 3-4 | R1: `r1_c03`, `r1_c09`, `r1_c10`, `r1_c04` Yağmacı Kampı | `mq_04` (kes), `mq_05` Gırtlak, `sq_g_*` |
| 5 | R1 güney: `r1_c05`-`r1_c08` + **ilk Keder Metini** | `mq_06`; Kalıntı Tüccarı açılır; Taş Köprü |
| 5-7 | R2 kuzey: `r2_c01`, `r2_c02`, `r2_c11`, `r2_c12`, Çiftlik hub | `mq_07`, `mq_08`, `sq_c_01`-`02` |
| 7-8 | R2 orta: `r2_c03`, `r2_c05`, `r2_c06`, Lanetli Sandık `cc_r2` | `sq_c_03`-`05`; ilk Hazine Goblini |
| 8-10 | Mezarlık `r2_c08`, `r2_c09` → **Kemik Mahzeni (Normal)** | `mq_09`, `mq_10` (Normal ilk temizleme +%50) |
| 10 | **Çürükkök** (grup) + **Hırs Metini** | `mq_11` |
| 10-13 | R3 kuzey/orta: `r3_c01`, `r3_c02`, `r3_c07`, `r3_c11`, `r3_c03` | `sq_k_01`; Metin Nefret hazırlığı |
| 12-14 | Haydut Kalesi `r3_c04` (fs06), Gergedan Otlağı `r3_c05` (fs07) | `mq_12`; Efsun Nesnesi kampı |
| 13-15 | Kızılkaya, `r3_c08`, `r3_c09`, **Nefret Metini** | `mq_13`, `sq_k_02`-`04` |
| 15-17 | R4 kuzey: `r4_c01`, `r4_c02`, `r4_c09`, `r4_c04` | `sq_k_05`, `sq_k_07` |
| 17-19 | R4 güney: `r4_c05`-`r4_c08`, Zehirli Mağara (fs08), Cadı Zehra | `mq_14`, `sq_k_06` |
| 18-20 | **Kızıl Dökümhane (Normal)** x1-3 | `mq_15`, **Acı Metini** |
| 20-22 | R5 doğu: `r5_c01`, `r5_c02`, `r5_c03`, `r5_c12` | `sq_s_01`, `sq_s_03` |
| 22-25 | Taş Ocağı (fs13: +7..+9 malzemesi), Kızıl Kale, Gorak | `mq_16`, `sq_s_02`, **Öfke Metini**; Alevkanat grubu (24+) |
| 25-27 | Son Ocak → R6 güney: `r6_c01`, `r6_c02`, `r6_c10`, `r6_c11` | `mq_17`, `sq_s_04` |
| 27-30 | R6 kuzey: `r6_c05`, `r6_c07`, `r6_c08`, `r6_c12` + **Ölüm Metini** | `mq_18`, `sq_s_05`-`06`, `mq_19` |
| 30 | Kuzgunkale → Buzul Tahtı (Normal) / Karakır Bozkırı | Av Defteri tamam; Kadim dönem başlar |

### 6.7 Save flags (`CharacterSave.flags`, no type change)

| Key | Value | Meaning |
|---|---|---|
| `q.<questId>` | `'active'` \| `'done'` | quest state |
| `q.<questId>.n<k>` | number | progress of objective k |
| `world.region.<rid>` | `true` | region discovered (keşif XP given) |
| `world.wp.<id>` | `true` | waypoint discovered |
| `world.hidden.<id>`, `world.vista.<id>` | `true` | hidden area / vista found |
| `world.metin.<tierId>` | number | stones destroyed (title/achievement/bounty) |
| `world.rare.<id>`, `world.boss.<id>` | number | kills |
| `world.shrine.<id>`, `world.chest.<id>`, `world.boat` | epoch ms | last use (cooldowns) |
| `world.bio` | number | completed Av Defteri steps; `world.bio.<step>.n` progress; `world.bio.cd` next delivery epoch ms |
| `world.shop.<itemKey>.<dayKey>` | number | daily purchases at the Kalıntı Tüccarı |
| `world.respawn` | string | last respawn point id (`wp_*` / village id) |


---

## 7. Dungeon difficulty ladder (exact rules)

The dungeons are the *second act*: the open world takes a character to level 30 and into Normal runs; the ladder takes it from there to the key chase. The ladder **keeps the rules that already exist in code** (`keystone.ts` difficulty cards, `Bounties.clearFlag/hasCleared/recordClear`, `MythicPlus.grantKeystone`, GDD_CONTENT §5-§6) and pins down the pieces the open world adds (world entrances, per-member gating, UI states, messages).

### 7.1 The ladder

```text
  Zindan açılır: Kemik Mahzeni Sv. 8 · Kızıl Dökümhane Sv. 18 · Buzul Tahtı Sv. 30 · Gölge Tapınağı Sv. 42
        │
        ▼
   NORMAL ───(bu zindanda ilk Normal temizleme)───► KAHRAMANLIK (Sv. ≥ 50)
                                                          │
                          (bu zindanda ilk Kahramanlık temizleme)
                                                          ▼
                                                    MİTİK 0 (Sv. 60, süresiz)
                                                          │
                          ilk Mitik 0 temizleme, anahtarın yoksa  ──► KADİM ANAHTAR TAŞI +2 (rastgele zindan)
                                                          │
                                                          ▼
   MİTİK+ :   +2 ──► +3 ──► +4 ──► +5 ... (her koşu: süre ≤ %100 → +1 · ≤ %80 → +2 · ≤ %60 → +3 · süre aşımı → −1, en az +2)
              affix ekleri +4 / +7 / +10 / +12 · ödül ilvl 60 + 2 x anahtar (tavan +15) · haftalık Kadim Kasa · Mitik+ Puanı
```

A character walks the ladder **per dungeon** (`Normal` of Kemik Mahzeni unlocks only Kahramanlık of Kemik Mahzeni) — four parallel ladders that converge at **Mitik 0** (60), where *any* first clear hands out the key.

### 7.2 Rules per difficulty

| | **Normal** | **Kahramanlık** (Heroic) | **Mitik 0** | **Mitik+ L** |
|---|---|---|---|---|
| `Difficulty` id | `normal` | `heroic` | `mythic` | `mythicplus` |
| Unlock: level | ≥ dungeon min (8 / 18 / 30 / 42) | **≥ 50** | **≥ 60** | key level ≥ 2 held (any level 60 character) |
| Unlock: quest (Normal only) | the dungeon's **unlock quest** `q.<id>` = done (table below); soft fallback: level ≥ min + 2, so skipping a quest never locks content | - | - | - |
| Unlock: clear flag | - | `clear.<id>.normal` | `clear.<id>.heroic` | a **keystone** for that dungeon (own, or a party member's chosen by the leader) |
| Enemy level | `clamp(party avg, min, min + 10)` | `clamp(party avg, 50, 60)` | 60 | 60 (+ key multipliers, armour formula uses 60 + key) |
| HP x / DMG x on `monsterHP/Dmg(L)` | 1.00 / 1.00 | **0.85 / 0.85** | 1.00 / 1.00 | 1.10^(L-1) / 1.08^(L-1) (+ affixes) |
| Party HP scaling | x(1 + 0.6 (n-1)) | x(1 + 0.6 (n-1)) | x(1 + 0.6 (n-1)) | x(1 + 0.7 (n-1)) |
| Timer / boss enrage | none / enrage x1.5 | none / normal | none (clear time shown) / normal | dungeon timer 780 / 810 / 840 / 900 s, +15 s per death |
| Champion packs / shrines / goblin | 3, random shrines (Bilgelik allowed), goblin 8% | 4, random shrines, goblin 8% | 3, fixed shrines, goblin 8% | none (affixes), fixed shrines, goblin 3% |
| Item level: trash / elite / boss | = enemy level (+1 elite, +2 mini, +3 boss), cap 60 | same rule at level 50-60, cap 60 | **61 / 61 / 63** (as key 1) | `60 + L` (cap 75) / `60 + L` / `60 + L + 2` (cap 77) |
| End chest (*) | `chest_iron`: 2 items, min Büyülü, ilvl = enemy level + 2 | `chest_gold`: 2 items, min Nadir (Destansı 25%), set pieces from bosses (ilvl ≥ 40) | `chest_gold`: 2 items, min Nadir, **ilvl 62** | `chest_epic`: 2 items per player, ilvl `60 + 2 min(L, 15)` (depleted: 1 item, ilvl -4) |
| Vault (Kadim Kasa) credit | no | no | no | yes (1 / 4 / 8 runs, ilvl `63 + 2 min(L, 15)`) |
| First-clear bonus | 50% of `xpToNext` (first Normal clear of each dungeon) | - | - | - |
| Recommended ilvl (portal text) | ≈ min level - 2 (6 / 16 / 28 / 40) | 50 | 60 | 62 (+2..4), 66 (+5..7), 72 (+8..10), 78 (+11..13), 84 (+14..15), 90 (+16..20) |
| Extras | tutorial dungeon of the open world | the 50 → 60 levelling content, set drops | **first keystone (+2)**, best clear time stored (`flags['m0.best.<id>']`) | score, rating, rotating affixes, seasonal Efsunlu Yarık from +10 |

(*) The end-chest item counts for Normal / Kahramanlık / Mitik 0 are new in this document (GDD_CONTENT §5.10 only names the chest models); every other cell is GDD_CONTENT §6 / GDD_SYSTEMS §4.3 and §7.4.

**Normal unlock quests** (the quest *shows the door*, the level + quest pair opens it):

| Dungeon | min level | unlock quest (`flags['q.<id>'] === 'done'`) | fallback |
|---|---|---|---|
| `kemik_mahzeni` | 8 | `mq_09_mezarligin_sirri` (open-world cemetery) | level ≥ 10 |
| `kizil_dokumhane` | 18 | `mq_14_bataklik_cadisi` (Komutan Aslan then offers `mq_15`) | level ≥ 20 |
| `buzul_tahti` | 30 | `mq_19_kuzgunkaleye_donus` | level ≥ 32 |
| `golge_tapinagi` | 42 | the last quest of the Karakır chain (`mq_30_golge_muhru`, §1.8) | level ≥ 44 |

Numbers for a **Sıradan** (`hp x1, dmg x1`) at each step, to sanity-check the ladder (5-party = x3.4 for Normal/Kahramanlık/Mitik 0, x3.8 for Mitik+, matching GDD_SYSTEMS §1.10):

| Sıradan (hp x1, dmg x1) - zorluk | düşman Sv. | HP çarpanı | DMG çarpanı | HP (solo) | vuruş hasarı | HP (5 kişi) |
|---|---|---|---|---|---|---|
| Normal · Kemik Mahzeni (min Sv.) | 8 | 1.00 | 1.00 | 54 | 50 | 184 |
| Normal · Kızıl Dökümhane | 18 | 1.00 | 1.00 | 215 | 95 | 731 |
| Normal · Buzul Tahtı | 30 | 1.00 | 1.00 | 572 | 149 | 1945 |
| Normal · Gölge Tapınağı | 42 | 1.00 | 1.00 | 1108 | 203 | 3767 |
| Normal · Gölge Tapınağı (tavan, Sv. 52) | 52 | 1.00 | 1.00 | 1690 | 248 | 5746 |
| Kahramanlık (Sv. 50) | 50 | 0.85 | 0.85 | 1329 | 203 | 4520 |
| Kahramanlık (Sv. 60) | 60 | 0.85 | 0.85 | 1909 | 241 | 6491 |
| Mitik 0 | 60 | 1.00 | 1.00 | 2246 | 284 | 7636 |
| Mitik+ +2 | 60 | 1.10 | 1.08 | 2471 | 307 | 9388 |
| Mitik+ +3 | 60 | 1.21 | 1.17 | 2718 | 331 | 10327 |
| Mitik+ +4 | 60 | 1.33 | 1.26 | 2989 | 358 | 11360 |
| Mitik+ +5 | 60 | 1.46 | 1.36 | 3288 | 386 | 12496 |
| Mitik+ +7 | 60 | 1.77 | 1.59 | 3979 | 451 | 15120 |
| Mitik+ +10 | 60 | 2.36 | 2.00 | 5296 | 568 | 20125 |

### 7.3 Unlock logic (per character, `CharacterSave.flags`)

Flags keys (all exist today except where marked **new**):

| Key | Written when | Read by |
|---|---|---|
| `clear.<dungeonId>.normal` / `.heroic` / `.mythic` / `.mythicplus` | `recordClear(dungeonId, difficulty)` on every completed run, **for every party member present at the final boss kill** | `hasCleared`, the difficulty cards, bounties |
| `clear.<dungeonId>` (legacy, no difficulty) | first-clear bonus (Normal only) | counts as `normal` for old saves |
| `m0.best.<dungeonId>` (**new**) | Mitik 0 clear: best time in seconds | Mitik 0 card ("En iyi süre 12:41") |
| `ladder.keygrant` (**new**) | the first Mitik 0 clear that grants a key (when `mythic.keystone === null`) | prevents double grants after a key is later lost; analytics |
| `world.entrance.<dungeonId>` (**new**) | first time the world entrance panel is opened | quest hints |
| `q.mq_09_mezarligin_sirri`, `q.mq_14_bataklik_cadisi`, `q.mq_19_kuzgunkaleye_donus` | quests (§6.2) | the Normal unlock quests (table above) |

```ts
// panels-game/keystone.ts (pure function, unit-testable)
type DiffState = { kind: 'open' | 'locked_level' | 'locked_quest' | 'locked_clear' | 'locked_key' | 'key_other' | 'depleted' | 'cleared'; need?: number | string };
function difficultyState(def: DungeonDef, d: Difficulty, ch: CharacterState): DiffState {
  const lvl = ch.level;
  switch (d) {
    case 'normal':     { if (lvl < def.levelRange[0]) return { kind: 'locked_level', need: def.levelRange[0] };
                       const q = UNLOCK_QUEST[def.id];                                   // table above
                       if (q && ch.save.flags['q.' + q] !== 'done' && lvl < def.levelRange[0] + 2) return { kind: 'locked_quest', need: q };
                       return done(def, 'normal'); }
    case 'heroic':     if (lvl < 50) return { kind: 'locked_level', need: 50 };
                       if (!hasCleared(def.id, 'normal')) return { kind: 'locked_clear', need: 'normal' };
                       return done(def, 'heroic');
    case 'mythic':     if (lvl < 60) return { kind: 'locked_level', need: 60 };
                       if (!hasCleared(def.id, 'heroic')) return { kind: 'locked_clear', need: 'heroic' };
                       return done(def, 'mythic');
    case 'mythicplus': { const k = ch.save.mythic.keystone;
                       if (!k) return { kind: 'locked_key' };
                       if (k.dungeonId !== def.id) return { kind: 'key_other', need: k.dungeonId };   // leader may still pick another member's key
                       return k.depleted ? { kind: 'depleted', need: k.level } : { kind: 'open', need: k.level }; }
  }
}
const done = (def: DungeonDef, d: Difficulty): DiffState => ({ kind: hasCleared(def.id, d) ? 'cleared' : 'open' });
```

**Party rules** (host evaluates with each peer's `PeerInfo.level` / flags announced at join; the leader presses the button):

* **Level gate: every member** must meet it. If not: the start button is disabled, text "{Oyuncu} için seviye yetersiz ({n} gerekli)".
* **Clear gate: the leader / key owner is a hard gate; other members are a soft gate**: a member who has not cleared the prerequisite gets the yellow line "{Oyuncu} bu zorluğu henüz açmadı; birlikte girebilirsin." and may enter; on completion every present member receives the clear flag (so one friend can be carried through the ladder once, never past Mitik 0's level-60 requirement).
* **Mitik+**: only the key owner can start from his own key; the leader can pick any member's key ("Bu anahtarla git", GDD_CONTENT §5.13). Everybody must be level 60.

### 7.4 The key chase (+2 → +3 → +4 …)

Rules are GDD_CONTENT §5 and are **not changed**; they are repeated here because they are the spine of the endgame and the open world has to point at them:

1. **First key**: the first completed Mitik 0 run by a character that holds **no keystone** grants **Kadim Anahtar Taşı +2** for a **random** dungeon (uniform over the four; toast "Kadim Anahtar Taşı kazandın: {Zindan} +2!", SFX `keystone_upgrade`). Safety net: Anahtar Ustası Yaşar gives a free +2 once per week to a level-60 character who ever cleared an M0 and holds no key. One key per character, bound, not stashable.
2. **What happens to the key** (GDD_CONTENT §5.8): *timed* ≤ 100% of the dungeon timer → **+1**, ≤ 80% → **+2**, ≤ 60% → **+3** levels (max +30) and a **new random dungeon** (different from the one just run when possible); *untimed* → the run still completes, the key drops **-1** (min +2) and also moves to a new random dungeon; *abandoned* → -1, **same** dungeon, `depleted = true`; the weekly reset (Monday 04:00 TR) sets the level to `max(2, L - 1)`, re-rolls the dungeon and clears `depleted`.
3. **Party keys**: a member holding a **lower** key than the run's level gets +1 on his own key (once per run); a member with no key gets a key of `max(2, L - 2)` for a random dungeon.
4. **Example chain** (the 13:00 Kemik Mahzeni timer is shown for every step for brevity; in reality the key moves to a new random dungeon after every run, so the timer changes): **M0 clear → +2** key · +2 timed at 10:24 (≤ 80%) → **+4** · +4 timed at 12:10 (≤ 100%) → **+5** · +5 timed at 7:40 (≤ 60%) → **+8** · +8 untimed → **+7** … The "+2, +3, +4" the player asked for is exactly the first rung of this ladder: **+2 → +3** when the run is merely timed (+1), **+2 → +4** when it is timed at 80%.

### 7.5 UI states (portal / keystone panel and world entrance)

The difficulty row of the `keystone` panel (and of the new world-entrance variant, same component) shows four cards; each card is in one state. The card text is the Turkish string (the existing `need` strings are kept):

| State | Card look | Text (TR) |
|---|---|---|
| `open` (never cleared) | normal border, difficulty colour | description line of the difficulty |
| `cleared` | green check badge + "Temizlendi" | description + (Mitik 0: "En iyi süre 12:41") |
| `locked_level` | grey + lock icon, click toasts a warning | "Gereken seviye: {n}" |
| `locked_quest` (Normal) | grey + lock icon | "Kapı mühürlü: '{Görev}' görevini bitir ({n}. seviyede kapı kendiliğinden açılır)." |
| `locked_clear` | grey + lock icon | Kahramanlık: "Önce bu zindanı Normal zorlukta bitir." · Mitik 0: "Önce bu zindanı Kahramanlık zorluğunda bitir." |
| `locked_key` (Mitik+) | card hidden if no key, otherwise grey | "Mitik+ için Kadim Anahtar Taşı gerekir. Önce Mitik 0'ı bitir." |
| `key_other` (Mitik+) | gold border, small badge "Başka zindan" | "Anahtarın {Başka Zindan} için; grup lideri başka bir üyenin anahtarını seçebilir." |
| `depleted` (Mitik+) | red-grey key icon | "Tükenmiş anahtar: son koşu zamanında bitmedi." |
| **recommended** overlay (any open card) | gold dot | "Önerilen" on the card whose enemy level is closest to the player's level |

Below the cards the panel prints "Düşman seviyesi: {n}" (existing) and **"Önerilen eşya seviyesi: {n}"**, red text + the extra line "Eşyaların zayıf: riskli!" when the character's item level is more than 6 below it (never a hard gate, GDD_CONTENT §6).

### 7.6 Messages (Turkish strings to add)

| Key | Text |
|---|---|
| `ladder.heroic_unlocked` | "Kahramanlık açıldı: {Zindan}." (toast after the first Normal clear, SFX `quest_complete`) |
| `ladder.mythic_unlocked` | "Mitik 0 açıldı: {Zindan}." (after the first Kahramanlık clear, level ≥ 60 only; below 60: "Mitik 0, 60. seviyede açılır.") |
| `ladder.need_level` | "{Zindan} için {n}. seviye gerekir." |
| `ladder.need_quest` | "{Zindan} kapısı mühürlü: '{Görev}' görevini bitir ({n}. seviyede kapı kendiliğinden açılır)." |
| `ladder.need_clear_normal` | "Kahramanlık, {Zindan} Normal'de bir kez bitirildikten sonra açılır." |
| `ladder.need_clear_heroic` | "Mitik 0, {Zindan} Kahramanlık'ta bitirildikten sonra açılır." |
| `ladder.member_level` | "{Oyuncu} için seviye yetersiz ({n} gerekli)." |
| `ladder.member_clear` | "{Oyuncu} bu zorluğu henüz açmadı; birlikte girebilirsin." |
| `ladder.need_key` | "Mitik+ için Kadim Anahtar Taşı gerekir. Önce Mitik 0'ı bitir." |
| `ladder.first_key` | "Kadim Anahtar Taşı kazandın: {Zindan} +2!" (existing) |
| `ladder.rec_ilvl` | "Önerilen eşya seviyesi: {n}" / red: "Önerilen eşya seviyesi: {n} — eşyaların zayıf, riskli!" |
| `ladder.entrance_sealed` | "Kapı mühürlü. Mezarlıktaki iskeletleri temizle." (Kemik Mahzeni before `mq_09`) |

### 7.7 Where the ladder is entered

* **World entrances** (§5.2) — Kemik Mahzeni and Kızıl Dökümhane in Sisli Vadi, Buzul Tahtı and Gölge Tapınağı in Karakır Bozkırı: same panel, **all four difficulties**; Mitik+ shows only when a key exists. The run returns to the entrance.
* **Kuzgunkale portals** (Kadim Kapılar Salonu) — unchanged, return to town.
* The world and the ladder meet in the quests: `mq_09` / `mq_14` / `mq_19` unlock the Normal doors, `mq_10` (Kemik Mahzeni Normal) and `mq_15` (Kızıl Dökümhane Normal) are the first two runs; Heroic/Mythic have **no** open-world gating beyond level and clear flags.


---

## 8. Visual design direction (PSX MMO)

The look target is a **PSX-era MMO overworld** (Metin2 / Knight Online / early WoW): chunky vertex-snapped low-poly trees, hard dithered fog, big readable landmarks, flat-shaded roofs, a banded sky. Every region has **one dominant colour and one signature silhouette** so a screenshot identifies where you are. All of it builds on what the `OutdoorScenery` already does (splat terrain, tree walls, scatter, `Sky` dome, mountain rings, mist + fireflies); the new work is *per-region parameters* and a few new dressing kinds.

### 8.1 Region themes (fog, light, sky, ground, music, VFX)

`fogNear/fogFar` define the draw distance (§1.5): marsh 55 m, ruins 60 m, forest 70 m, canyon 85 m, farmland 95 m, hills 100 m. Colours are `0xRRGGBB`. Theme values are applied by `RegionAtmosphere` (§1.5.4) and written once in `WorldRegion.theme` (§9.1). New `MusicId`s (`world_vale`, `world_hills`, `world_marsh`, `world_canyon`, `world_ruins`) are *aliases* the audio module maps onto the existing 19 tracks (vale → `town` playlist at 0.6-0.7, hills → `combat` 0.5, marsh → `dungeon_crypt` with gain 4, canyon → `dungeon_fire` 0.6, ruins → `dungeon_shadow` 0.6), always layered over `amb_wind` (`ambience(...)` crossfade 2.5 s on `world:regionEntered`).

| Bölge | sis renk · near/far | hemi gök/zemin · şiddet | güneş renk · şiddet | gökyüzü | zemin dokuları (grass · dirt · cobble · dark) | müzik | atmosfer VFX |
|---|---|---|---|---|---|---|---|
| R1 Sisli Koru | 0x9aa890 · 15/70 | 0xc0d0b0/0x303820 · 1.25 | 0xdce8b8 · 1.05 | procedural (zenith 0x8fa090 / ufuk 0x9aa890) · alt: `cloudy-sky-10.jpg` | `tt1-grass-04` · `tt2-dirt-03` · `tt2-tile-11` · `tt1-grass-19` | world_vale (town listesi 0.6) + `amb_wind` | yer sisi + ateş böcekleri (mevcut OutdoorBuilder) + `ambient_dust` 0xc8d8b0 |
| R2 Altın Tarlalar | 0xd8c890 · 25/95 | 0xf0e0b0/0x504828 · 1.3 | 0xffe0a0 · 1.25 | `cloudy-sky-02.jpg` (puslu altın güneş) · alt `cloudy-sky-21` | `tt1-grass-11` · `tt2-dirt-18` · `tt1-tile-05` · `tt1-grass-13` | world_vale (town 0.7) + `amb_wind` | `ambient_dust` tint 0xd0a050 (saman tozu) + az sis |
| R3 Haydut Tepeleri | 0xc8b090 · 25/100 | 0xe0d0b0/0x483c28 · 1.2 | 0xffd8a0 · 1.15 | `cloudy-sky-03.jpg` (tozlu turuncu güneş) | `tt1-grass-22` · `tt2-dirt-17` · `tt3-stone-23` · `tt2-dirt-09` | world_hills (`combat` parçası 0.5) | `ambient_dust` tint 0xc8a878 (rüzgârlı toz) |
| R4 Ağıt Bataklığı | 0x5c7060 · 10/55 | 0x90b0a0/0x1a2820 · 1.0 | 0xa0c0b0 · 0.7 | `cloudy-sky-10.jpg` (gri-yeşil kasvet) · alt `cloudy-sky-14` (yeşil aurora) | `tt1-grass-12` · `tt2-dirt-09` · `tt1-wood-22` · `tt3-terrain-13` | world_marsh (`dungeon_crypt` gain 4 · ağır sis) | `ambient_shadow_wisps` + cyan ateş böcekleri (0x60ffd0) + yoğun yer sisi |
| R5 Ork Kanyonu | 0xb88a60 · 20/85 | 0xe8b890/0x482818 · 1.2 | 0xffb070 · 1.2 | `cloudy-sky-21.jpg` (altın turuncu) · alt `cloudy-sky-19` (kan kırmızısı) | `tt2-dirt-01` · `tt3-stone-03` · `tt2-dirt-19` · `tt2-stone-01` | world_canyon (`dungeon_fire` 0.6) | `ambient_embers` + kızıl toz |
| R6 Lanetli Harabeler | 0x3a3050 · 8/60 | 0x7060a0/0x181028 · 0.9 | 0x8070c0 · 0.6 | `cloudy-sky-12.jpg` (koyu mor alacakaranlık) · alt `psx-skyboxes-free/night-moon.png` | `tt1-grass-12` · `tt2-dirt-07` · `tt2-stone-14` · `tt2-tile-05` | world_ruins (`dungeon_shadow` 0.6) | `ambient_shadow_wisps` + mor kıvılcımlar |

Sky: the procedural `Sky` dome (zenith / mid / horizon / sun / cloud colours) is driven from the theme (zenith = fog lerped 0.7 to the hemisphere sky, horizon = fog) and **blends with the region atmosphere**; the PSX panoramas in `/assets/sky/itch/` are the *reference look* (and an optional `skyImage` override: `tex.mapping = EquirectangularReflectionMapping`, `NearestFilter`, hide the mirrored lower half under fog) — the procedural dome is the default because it blends smoothly between regions.

### 8.2 Scenery sets and landmarks per region

Each region uses 6-10 tree/rock models so the preload stays ≤ 70 files. Density is the existing outdoor rule (`trees ≈ area/520`, `bushes area/700`, `rocks area/1400`, `flowers area/160`) times a per-region multiplier; **tufts change to `area/21`** (≈ 14,000 over the 300,000 m² of walkable ground; the old `area/5` would be 60,000 instances at this size) and are only shown within 55 m:

| Region | trees | bushes | rocks | tufts | flowers | specials |
|---|---|---|---|---|---|---|
| R1 Sisli Koru | x1.0 | x1.0 | x0.8 | x1.0 | x1.0 | mushroom groups x1.5, fallen logs `kn(log_*)` |
| R2 Altın Tarlalar | x0.35 | x0.8 | x0.5 | x1.2 | x1.5 | wheat/corn fields (crop patches 8 x 12 m), haystacks, fences, farm houses |
| R3 Haydut Tepeleri | x0.5 | x0.6 | x2.0 | x0.8 | x0.3 | blocking hill massifs (corridors), bandit tents/fences, ruined tower |
| R4 Ağıt Bataklığı | x1.1 (bare/dead) | x0.4 | x0.5 | x0.5 | x0 | water-plants + lilies, hanging moss, mushrooms x2, fog banks, boardwalks, bones |
| R5 Ork Kanyonu | x0.08 | x0.1 | x3.0 | x0.2 | x0 | cliff stacks along every border, cacti, orc palisades/banners, scorch decals |
| R6 Lanetli Harabeler | x0.25 (dead) | x0.2 | x1.0 | x0.3 | x0 | broken walls, gravestones, pillars, statues, arches, purple candles |

**Signature landmarks** (one per region, §5.7) are placed first and their footprint is added to `host.avoid` so scatter keeps clear; they are built from existing models:

| Bölge | sahne malzemesi (model paletleri) | ufuk işareti |
|---|---|---|
| R1 Sisli Koru | retro-psx-tree-pack `tree01 tree03 tree05 tree12` (koyu ladin) + `gp(tree_oak_a/b)` · çalı `bush02 bush04` · mantar `kn(mushroom_*)` | Gümüşdere Değirmeni (`kf(windmill)` x4) |
| R2 Altın Tarlalar | `tree13 tree15 tree18 tree20 tree35` (yeşil-sarı yaprak, huş) · tarla `kn(crops_wheatStageB)`, `crops_cornStageC`, `crop_pumpkin`, `crops_dirtDoubleRow` · saman `ip(psx-medieval,market/haybale)` | Çürük Höyük (mantar halkası) + Kayıp Mezarlık kriptası |
| R3 Haydut Tepeleri | retro-psx-nature-pack `tree01_fall tree04_fall tree05_fall` (sonbahar) · `tree29 tree33` (kuru yaprak) · kayalar `tw(decoration/nature/rock_single_A..E)` x6 · kaya kütleleri `tw(decoration/nature/hills_A_trees)` (engelleyici tepe) | Yıkık Gözcü Kulesi (`ip(nocturnal-watch,tower)` 30 m) |
| R4 Ağıt Bataklığı | çıplak dallı `tree01_winter tree03_winter` (110 tri) · `gp(tree_dead)` · `hw(tree_dead_large)` · `kn(lily_*)`, `tw(decoration/nature/waterplant_A..C)`, `kn(hanging_moss)`, `kn(mushroom_tan*)` · tahta yol `kn(path_wood*)` | Ağıt Ağacı + Cadı Kulübesi (`gp(cauldron)`, kafatası totemleri) |
| R5 Ork Kanyonu | kanyon duvarları `kn(cliff_block_rock)`, `cliff_half_rock`, `cliff_steps_rock` x4 · `kn(rock_tallA..F)` x4 · `kn(cactus_tall)` · seyrek `gp(tree_dead)` · ork sancakları `gp(banner_red)` | Kızıl Kale (`tw(building_castle_red)` x8) + Ejder Yuvası kayalığı |
| R6 Lanetli Harabeler | `hw(tree_dead_large)`, `hw(tree_dead_medium)` · yıkık surlar `kc(wall-broken)`, `kc(wall-half)`, `kc(wall-corner)` · `kg(gravestone-*)`, `kg(pillar-*)`, `hw(shrine)`, `hw(arch)`, `gp(statue_hooded)`, `kn(statue_*)` | Kara Anıt (`kg(pillar-obelisk)` x9) |

### 8.3 Ground: tiny texture packs and splat rules

* **Textures**: the terrain shader's four layers (grass base, `dirt`, `cobble`, `dark/moss`) are fed per region from the **Tiny Texture Packs** (`/assets/textures/itch/tiny-texture-pack-1/2/3/`, 128 px tileable palette PNGs, `RepeatWrapping`, `NearestFilter`) listed in the table above (columns are *grass · dirt · cobble · dark*). Picks are by colour tag from `index.json` (`green/dark`, `yellow`, `black`, `beige`, `orange`, `grey`) — treat them as a starting palette and swap after one look.
* **Splat ops per feature** (`createTerrain` `SplatOp`s, authored by the world module from the data): roads = `line` dirt (w from `RoadDef.width`) or `cobble` for cobble/bridge approaches; camp discs = `disc` dirt `amount 0.85`, r = `min(9, max(3.2, radius x 0.42))`; world-boss arenas = `disc` dark r 15 + dirt r 3.2; villages = `rect` cobble over the whole bounds + `line` cobble for the plaza strips (width 6 m / 5 m); metin spots = `disc` dark r 5 (scorch); lake/river shores = `ring` dark r +2 m; R4 = ~40% `dark` noise patches (marsh), R5 = `dirt` with red tint, R6 = `cobble` slabs around the Kara Anıt (r 14 m) and `dark` elsewhere.
* **Region tint map** (§1.5.1): a 160 x 160 RGB texture multiplied into the ground colour (R1 0xdde4d0, R2 0xfff0c0, R3 0xe8d8b8, R4 0xa8c0b0, R5 0xf0c8a0, R6 0xb8a8d0) so the same texture reads differently per region and blends smoothly at borders.

### 8.4 Roads, bridges, cliffs, water

* **Roads** follow §1.2: cobble where they enter villages, dirt elsewhere, `boardwalk` in R4 (`kn(path_wood)` / `path_woodCorner` pieces at 1 m, 1.5 m wide, with `hw(post_lantern)` lanterns every 12 m casting cyan light r 6 and a **fog-lantern** glow sprite). Road shoulders get **signposts** at every junction (`gp(signpost)`: "Kızılkaya → 40 karo" style Turkish text on a billboard) and milestone stones every 25 tiles.
* **Bridges**: the world is flat, so the **Taş Köprü** is a *flat* stone deck, not an arch: 5 x `ip('psx-medieval','building/stone_floor_4x4')` plates (5 m each = 25 m, deck at y 0) across the 24 m river at tile (108..113, 28), `ip('psx-walls-fences','drystone-wall/drystone_wall_capped')` parapets (10 per side, 2.5 m modules, collision cells), `brick_wall_pole` end posts and two half-sunk `gp(rock_large)` piers per side. The `nocturnal-watch/bridge.glb` arch has a 7 m hump that nothing can climb, so it is *not* used. R4 boardwalk crossings are flat `kn(path_wood)` boards on posts. The bridge is a walkable room (`r1x_tas_kopru`); parapets block nav cells.
* **Cliffs as boundaries**: `kn(cliff_block_rock)` / `cliff_half_rock` / `cliff_steps_rock` rows (x4 scale, 4 m modules) along `BorderSeg`s with `style: 'cliff'`, two courses high where the border faces a *higher* region (R5 walls: three courses, 12 m) and `tw(decoration/nature/mountain_A..C)` (x6) clusters behind them to build the skyline. Cliff pieces are decor only; the void tiles behind them already block the nav.
* **Water**: `WaterBody` planes (§1.2) with the `water` surface texture, 0.12 alpha edge, UV drift 0.04 m/s, `tt2-elements-13` (R4, green) / `tt2-elements-15` (lake, cyan) tints, shore ring of reeds. No swimming, no depth.
* **Hills**: the world is flat; "hills" in R3 are **blocking massifs** (`tw(decoration/nature/hills_A_trees)`, `hills_B_trees` x6, nav-blocked circles r 10-14 m) that form switchback corridors on the road, not walkable slopes.

### 8.5 Lighting and time

Each region is a **fixed time of day** (no day/night cycle in v1): R1 overcast morning mist, R2 golden afternoon, R3 late afternoon dust, R4 foggy dusk, R5 hot low sun, R6 violet moonlight. The single shadow-casting directional light follows the player (existing, 2048 map, 38 m box) with colour/intensity from the theme; the hemisphere uses the theme sky/ground colours. Village lamps and fires use `LightPool` (nearest 8). Bloom: strength 0.5 in R1-R3, 0.7 in R4-R6 so the cyan/purple emissives glow.


---

## 9. Data format, scene architecture, net

### 9.1 Type additions (all append-only, orchestrator-owned, **go first**)

Everything the existing `DungeonDef` (outdoor) + `PackDef` fields already express stays as is: the map is **one `DungeonDef`** (`id: 'sisli_vadi'`, `outdoor: true`, `grid: { w: 160, h: 160 }`), its **rooms are the region/bridge/island rects** (§1.2 `RoomDef { id, name, rect }`, `wall: 'cave'` = tree wall as today; the zone-name banner keeps working per room), the **camps and patrols are `PackDef`s** with `respawnSec` / `levelRange` / `radius` / `patrol` / `dormant` / `stealth`, bosses are `BossPlacement`s (`wb_curukkok`, `wb_alevkanat`), `start` / `exit` are the entry point and the Kuzgunkale portal. Everything else is **one new optional field `DungeonDef.world`** plus a handful of small unions. Exact additions:

```ts
// ============================== src/types/common.ts (no change: SceneId stays; see 9.3) ==============================

// ============================== src/types/dungeons.ts ==============================
/** Deterministic enemy ids of open-world camps: DUNGEON_ENEMY_ID_BASE + packIndex * WORLD_PACK_STRIDE + memberIndex. */
export const WORLD_PACK_STRIDE = 24;

export type BorderStyle = 'trees' | 'cliff' | 'water' | 'marsh' | 'canyon' | 'ruin' | 'palisade';
/** Polyline segment (tile coords) of the map border/shore; unlisted void edges default to 'trees'. */
export interface BorderSeg { a: [number, number]; b: [number, number]; style: BorderStyle }

export interface RegionTheme {
  fogColor: number; fogNear: number; fogFar: number;
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  sunColor: number; sunIntensity: number;
  skyZenith: number; skyHorizon: number; skyImage?: string;            // optional PSX panorama url
  groundTex: { grass: string; dirt: string; cobble: string; dark: string };   // /assets/textures/itch/... urls
  groundTint?: number;                                                  // value written into the region tint map
  music: MusicId | 'world_vale' | 'world_hills' | 'world_marsh' | 'world_canyon' | 'world_ruins';   // see audio addition
  musicVolume?: number; ambience?: string;
  ambientVfx?: VfxId; ambientColor?: number;
}
export interface WorldRegion {
  id: string;                    // 'r1' .. 'r6'
  roomId: string;                // RoomDef.id this region covers
  name: string; subtitle?: string;
  levels: [number, number];
  theme: RegionTheme;
  blendM?: number;               // atmosphere blend window at borders (default 30)
  discoveryXpPct?: number;       // % of xpToNext on first entry (default 10)
  landmarkId?: string;
}
export interface VillageDef {
  id: string; name: string;
  center: [number, number];      // tile coords on the parent map
  bounds: [number, number];      // half extents (m) of the walled area
  safe?: { halfX: number; halfZ: number };   // default = bounds
  spawn: { pos: [number, number]; facing: number };   // metres relative to center = respawn point
  props: TownProp[];             // metres relative to center, TownProp unchanged
  npcs: TownNpc[];               // metres relative to center, TownNpc + the additions below
  gates: { id: string; pos: [number, number]; rot: number; width: number }[];
  zones?: { id: string; name: string; box: [number, number, number, number] }[];   // local metres (banner)
  waypointId?: string;
}
export interface WaypointDef { id: string; name: string; pos: [number, number]; regionId: string; villageId?: string }
export interface EntranceDef {
  id: string; name: string; dungeonId: string; pos: [number, number]; facing: number; minLevel: number; regionId: string;
  look: 'crypt' | 'forge' | 'cave' | 'ice' | 'temple';
}
export interface RoadDef { id: string; kind: 'dirt' | 'cobble' | 'boardwalk' | 'bridge'; width: number; pts: [number, number][] }
export interface LandmarkDef { id: string; name: string; regionId: string; pos: [number, number]; recipe: string }
export interface MetinTierDef {
  id: string;                    // 'metin_keder'
  enemyId: string;               // EnemyDef id of the stone
  level: number; regionId: string;
  maxActive: number;             // 2
  respawnMin: [number, number];  // minutes, e.g. [6, 6] .. [10, 10]
  idleDespawnMin: number;        // 25
  waves: { hpBelow: number; members: { enemyId: string; count: number }[] }[];
  add: { enemyId: string; count: number; everySec: number; cap: number };
  aura: { radius: number; slowPct: number; curse?: boolean; dotPctPerSec?: number };
  pulse?: { everySec: number; coef: number; rMax: number };
  lootTable: string;
}
export interface MetinSpotDef { id: string; regionId: string; pos: [number, number] }
export interface RareSpawnDef {
  id: string; enemyId: string; level: number; spots: [number, number][];
  respawnMin: [number, number]; announce: boolean; lootTable: string;
}
export interface MiniBossDef { id: string; enemyId: string; level: number; lair: [number, number]; regionId: string; respawnMin: number; lootTable: string }
export interface WorldBossSched { bossId: string; firstSec: number; respawnSec: number; announceSec: number[]; announceText: string; minLevelToStart?: number }
export interface GatherFieldDef { id: string; kind: 'ore' | 'herb'; regionId: string; center: [number, number]; radius: number; count: number; respawnSec: number; lootTable: string }
export interface ChestSpotDef { id: string; kind: 'chest_wood' | 'chest_iron' | 'chest_gold'; regionId: string; pos: [number, number]; respawnSec: number }
export interface ShrineSpotDef { id: string; type: 'shrine_power' | 'shrine_haste' | 'shrine_ward' | 'shrine_greed' | 'shrine_wisdom'; regionId: string; pos: [number, number] }
export interface HiddenAreaDef { id: string; name: string; regionId: string; pos: [number, number]; radius: number; xpPct: number; rewards: string[] }
export interface VistaDef { id: string; name: string; regionId: string; pos: [number, number]; xpPct: number }
export interface WorldPerf { activateM: number; deactivateM: number; aiSleepM: number; maxActiveEnemies: number; chunkM: number }   // 70, 110, 45, 240, 40

export interface WorldExtras {
  regions: WorldRegion[];
  villages: VillageDef[];
  waypoints: WaypointDef[];
  entrances: EntranceDef[];
  roads: RoadDef[];
  water: { id: string; rect: TileRect }[];
  borders: BorderSeg[];
  landmarks: LandmarkDef[];
  metin: { tiers: MetinTierDef[]; spots: MetinSpotDef[] };
  rares: RareSpawnDef[];
  minibosses: MiniBossDef[];
  bosses: WorldBossSched[];
  gather: GatherFieldDef[];
  chests: ChestSpotDef[];
  cursed: { id: string; regionId: string; pos: [number, number] }[];
  shrines: ShrineSpotDef[];
  hidden: HiddenAreaDef[];
  vistas: VistaDef[];
  ghostBoat?: { id: string; pos: [number, number]; island: [number, number] };
  perf: WorldPerf;
}

// DungeonDef: ADD   world?: WorldExtras;
// PackDef:    ADD   lootTable?: string;                 // §3.7 farm tables, applies to every member
//                   championChance?: number;            // open world; default 0.12, 0 disables
//                   kind?: 'camp' | 'patrol' | 'elite' | 'farm';   // tooling / minimap hints
// TownNpcRole: ADD  | 'quest' | 'teleporter' | 'stable'
// TownNpc:    ADD   quests?: string[];                  // quest ids this NPC offers / turns in
//   (vendor kinds need no field: `ui: { panel: 'vendor', kind: 'weaponsmith' | 'armorsmith' | 'metin' | 'merchant' | 'alchemist' }`)

// ============================== src/types/enemies.ts (EnemyAiHints, all optional) ==============================
//   stationary?: boolean;   // never moves, never leashes (metin stones)
//   neutral?: boolean;      // fights only when hit or cornered (deer)
//   sleepRange?: number;    // metres from every player beyond which an unaggroed enemy skips AI/anim (default 45)
//   homeRadius?: number;    // leash radius around its camp (default 40)

// ============================== src/types/audio.ts: MusicId ADD 'world_vale' | 'world_hills' | 'world_marsh' | 'world_canyon' | 'world_ruins' ==============================
// (audio module maps them onto existing tracks, unknown ids fail silently)

// ============================== src/types/quests.ts  (NEW FILE) ==============================
export type QuestKind = 'talk' | 'kill' | 'collect' | 'skill' | 'boss' | 'metin' | 'dungeon' | 'explore';
export interface QuestObjective { kind: QuestKind; target?: string; count: number; text: string }   // target: enemyId | family | itemId | npcId | placeId | dungeonId[:difficulty]
export interface QuestReward { xpPct: number; goldPerLevel?: number; items?: { id: string; count: number }[]; generic?: { rarity: 'uncommon' | 'rare' | 'epic'; slot?: 'weapon' | 'armor' | 'jewelry' }[] }
export interface QuestDef {
  id: string; name: string; main?: boolean; level: number; region?: string;
  giver: string; turnIn?: string;            // TownNpc ids
  prereq?: string[];                          // quest ids
  objectives: QuestObjective[];
  reward: QuestReward;
  text: { offer: string; progress: string; done: string };
  unlocks?: string[];                         // quest ids / flags
}

// ============================== src/core/events.ts (GameEvents, append) ==============================
//   'world:regionEntered': { regionId: string; name: string; first: boolean };
//   'world:announce': { text: string; kind: 'metin' | 'boss' | 'rare' | 'info' };
//   'world:metinChanged': { id: string; tierId: string; pos: [number, number]; active: boolean };
//   'waypoint:discovered': { id: string };
//   'quest:updated': { questId: string; state: 'available' | 'active' | 'ready' | 'done'; progress?: number };

// ============================== src/scenes/scenes.ts ==============================
export type WorldSpawn = { type: 'gate' | 'village' | 'waypoint' | 'entrance'; id: string };
// DungeonParams: ADD   spawn?: WorldSpawn;                                   // where to appear when the dungeon def is an open-world map
//                      returnTo?: { dungeonId: string; spawn: WorldSpawn };  // set by a world entrance; DungeonScene's exit portal sends the party back there
// TownParams: unchanged. scenes/flow.ts: sceneFlow ADD returnTo?: DungeonParams['returnTo'].

// ============================== data (items module) ==============================
// LootTableDef ADD (data/loot.ts): matMult?: Record<string, number>; bonus?: { id: string; chance: number; count?: [number, number]; rank?: 'trash' | 'elite' }[];
//                                  itemChanceMult?: number; legendaryMult?: number; uniqueIds?: string[] (exists) + uniqueChance?: number;
// MaterialDef.kind ADD 'quest'.   New materials: metin_kalintisi, beceri_kitabi_1..3, trophy_* (6) + trophy_zehir_ozu, item_geyik_derisi, item_cadi_otu, item_muhur_parcasi_1..4.
// Vendor panel kinds ADD: 'weaponsmith' | 'armorsmith' | 'metin'.   UniqueDef: 4 new stat-only entries (§4.7).
// EnemyDef: no change (rares/minibosses/metin are ordinary EnemyDefs with new ids).
```

**Authoring formats.** The content module writes `src/data/world/sisli_vadi.ts` as a normal TypeScript file (helpers from `kit.ts`), *or* generates it from `docs/GDD_OPENWORLD.layout.json` (the JSON has the same field names as the tables here: `rooms`, `packs`, `patrols`, `villages[].buildings/rows/npcs`, `waypoints`, `metinSpots`, `rares`, `minibosses`, `quests`, `newEnemies`). Prop recipes (the tree/rock/mushroom/crypt/camp scenery of §3.2 and §8) come from the old `sisli_koru.ts` decorator. Suggested files:

| File | Content |
|---|---|
| `src/data/world/sisli_vadi.ts` | the `DungeonDef` assembly (rooms, packs from `camps.ts`, bosses, `world` extras) |
| `src/data/world/regions.ts` | `WorldRegion[]` themes (§8.1) |
| `src/data/world/camps.ts` | camps, patrols, farm `lootTable` ids (§3) |
| `src/data/world/villages.ts` | `VillageDef` x3 (+ 3 camp hubs as small `VillageDef`s with `bounds ≤ 12`) |
| `src/data/world/pois.ts` | waypoints, entrances, shrines, chests, gather, hidden, vistas, landmarks, roads, water, borders |
| `src/data/world/metin.ts` | tiers, spots, waves, rares, minibosses, bosses schedule |
| `src/data/world/quests.ts` | `QuestDef[]` (main chain, side quests, Av Defteri steps) |
| `src/data/world/karakir.ts` | map 2 skeleton (§1.8) |

### 9.2 Village: embedded `VillageDef` or separate scene? **Embedded.**

| | **Embedded `VillageDef` in the world (recommended)** | Separate `TownDef` scene per village |
|---|---|---|
| Seamless / Metin2 feel | **yes**: walk out of the gate into the camps; no loading | no: a loading screen at every gate |
| Safe zone | one box test (`world.isSafe`) | trivial (own scene) |
| Party | stays in one scene, no `requestScene` round-trip | party must be moved (host-only) |
| Code reuse | `TownProp`, `TownNpc`, `NPC`, interactables, `TownBuilder` prop placement (needs the small refactor `placeTownProps(props, origin)`) | `TownScene` is hard-wired to the single `TOWN` constant (it would need parametrising) |
| Cost | `WorldRuntime` spawns NPCs/props with an origin offset; builder merges village props into the chunked batcher (cheap) | 3 more scenes, 3 more builders, state hand-off |
| Fit for Kuzgunkale | stays a **separate `TownScene`** (the capital hub: keystone, vault, portals, lobby, trainer, gamble, stash) | - |

Decision: **embed** the three villages and the camp hubs; keep **Kuzgunkale** as the capital. The village interior uses the same NPC/interactable classes as the town; the world module's `WorldDecor` places village props through the extracted `placeTownProps()` helper (a shared function in `world/TownBuilder.ts`, owned by the world module), the scenes module spawns the NPCs (`spawnTownNpcs(world, npcs, origin)` extracted from `TownScene`).

### 9.3 Scene architecture: `DungeonScene` + `WorldRuntime`, no new `SceneId`

Why not a new `'world'` scene id: `grep` shows ~25 places that compare the scene id with `'dungeon'` (`NetSession` ×10, `UI` modes, `Banners`, `Crosshair`, `Minimap`, `MythicTracker`, `LootSystem` scroll, `MythicPlus.end`, `Audio` ambience, panels `keystone/talents/bounty/gameMenu`). The open world already works through the `dungeon` id today (Sisli Koru). A new id would touch all of them for no gameplay gain. So:

1. `TownScene.takeExit('sisli_vadi')` (south gate) and the new **east gate** (`takeExit('karakir_bozkiri')`, flag `q.mq_19_kuzgunkaleye_donus` = done or level ≥ 30) call `G.net.requestScene('dungeon', params)` with `dungeonId: 'sisli_vadi'`, `difficulty: 'normal'`, `enemyLevel: clamp(level, 1, 30)`, `spawn: { type: 'gate', id: 'north' }`.
2. `DungeonScene.enter` sees `def.world` and delegates: it still builds (`buildDungeon(def, scene)` → outdoor mode, plus `buildWorldDecor`), makes the player, camera and controller, and instead of its own deterministic pack spawning creates `new WorldRuntime({ def, world, built, params, scene })` which owns camps, patrols, villages, metin, rares, mini-bosses, world bosses, gather nodes, waypoints, hidden areas, quest markers, safe zones. The camp bookkeeping already in `DungeonScene` (`CampRec`, `updateCamps`) is superseded by `CampDirector` for `def.world` maps and left alone for non-world outdoor defs.
3. `isOpenWorld()` helper in `scenes/flow.ts` (`getDungeon(id)?.world != null`) replaces the ad-hoc `getDungeon(id)?.outdoor` checks in `LootSystem` (town scroll), `panels-game/base.ts` (`inOpenWorld`), `map.ts` (`currentDungeon` by grid size already matches 640 m) and `gameMenu`.
4. `getDungeon()` / `OPEN_ZONES` (`data/dungeons/index.ts`): `sisli_vadi` (and later `karakir_bozkiri`) registered; `getDungeon('sisli_koru')` returns `SISLI_VADI` (legacy alias). They remain **out of `DUNGEONS` / `DUNGEON_IDS`** (those drive the keystone UI and M+).
5. Dungeon ↔ world: `ent_*` entrances open the `keystone` panel with `dungeonId`; starting a run sets `DungeonParams.returnTo = { dungeonId: 'sisli_vadi', spawn: { type: 'entrance', id } }`; `ExitPortal` / `scroll_town` / release honour `returnTo` before the town fallback. (`sceneFlow.leftOpenWorld` is superseded by `returnTo`.)
6. Join-in-progress: `NetSession` currently rejects joins when `currentScene.scene === 'dungeon'`; allow it when the current dungeon is an open-world map (a friend can join the party while it levels), with the joiner spawning at `world.respawn` or the gate.

If a later feature needs seamless map-to-map travel without a loading screen, `WorldRuntime` is already isolated enough to be promoted to its own scene id.

### 9.4 Net, ids and authority

* **No new channels.** Camps/patrols/rares/mini-bosses/world bosses are spawned by the host through the existing `spawn` channel with explicit ids (`remove: true` to despawn); camp members use the deterministic range (§1.5.2), everything dynamic (metin waves, rares, adds, champion summons) uses `HOST_DYNAMIC_ID_BASE` ids. A metin stone is a **dynamic** id too (its spot rotates).
* **Announcements and event state** ride the existing `gate` channel with `ev:*` keys handled by `WorldRuntime.handleMessage` on every peer: `ev:metin:<id>:on|off|dead`, `ev:rare:<id>:up|dead`, `ev:boss:<id>:warn|up|dead`, `ev:shrine:<id>` (existing `shrine:<key>`), `ev:camp:<packId>:champion:<mod>` (champion flag so every peer shows the plate).
* **Guest → host requests** use the existing `req` channel (`G.net.sendRequest(kind, data)`): `ow.chest` (open cursed chest, existing `ZoneEvents` path), `ow.boat`, nothing else — damage, deaths and loot already work through `hit` / `dmg` / `death`.
* **Interest management** (net module): `snap` carries only enemies within 120 m of the receiving peer's player (≤ 60 per packet), nearest first; sleeping enemies are not in the stream; spawn/remove messages for a camp go to everybody (they are rare).
* **Authority** is unchanged (ARCHITECTURE "Damage authority"): host runs AI, camp/rare/metin/boss state; every peer rolls its own personal loot/XP on `death`; quest progress is local per peer.
* **Quests** are purely local (per peer, from the same `death` hook); the party shares nothing but the world.

### 9.5 Persistence and migration

Only `CharacterSave.flags` (keys in §6.7 and §7.3) — **no save version bump**. Old characters keep `clear.*` flags; the first time a character that was in Sisli Koru loads into Sisli Vadi it spawns at the gate. `world.respawn` stores the last waypoint/village id. Character level cap, bag, stash, mythic profile are untouched.


---

## 10. Implementation plan

Eight work packages, each sized for **one Sonnet agent** (read this doc + `ARCHITECTURE.md` + the files listed; end with `npx tsc --noEmit` = 0 errors in the files you own; follow the golden rules: own your files, append-only shared types, never throw from the frame loop, Turkish player text). **Waves of at most 3 agents, no file appears in two packages of the same wave** (and, to keep merges trivial, no file appears in two packages at all, except the type files that WP1 finishes first).

| WP | Wave | Owning module(s) | Depends on | Size |
|---|---|---|---|---|
| **WP1 Types and contract stubs** | 0 | core (orchestrator) | - | S |
| **WP2 Open-world content data** | 1 | content | WP1 | L |
| **WP3 Enemies, metin stones, bosses, AI** | 1 | enemies | WP1 | L |
| **WP4 Items, loot, quests runtime, bounties** | 1 | items | WP1 | L |
| **WP5 World builder (map, decor, terrain, atmosphere)** | 2 | world | WP1 (+ WP2 data for real content, the layout JSON for a head start) | L |
| **WP6 WorldRuntime and scene wiring** | 2 | scenes | WP1, WP3 defs, WP2 data | L |
| **WP7 Net: interest management and open-world joins** | 2 | net | WP1 | S |
| **WP8 UI: quests, waypoints, ladder states, map** | 3 | panels-game + hud (+ one panels-items file) | WP1, WP4, WP6 | L |

### WP1: Types and contract stubs (core / orchestrator, wave 0)

Everything in §9.1 plus the stubs that let waves 1-3 run in parallel.

* **Files**: `src/types/dungeons.ts` (WorldExtras and all small interfaces, `WORLD_PACK_STRIDE`, `PackDef` / `TownNpcRole` / `TownNpc` / `DungeonDef` additions), `src/types/enemies.ts` (`EnemyAiHints`), `src/types/audio.ts` (5 `MusicId`s), `src/types/quests.ts` (**new**), `src/core/events.ts` (5 events), `src/scenes/scenes.ts` (`WorldSpawn`, `DungeonParams.spawn/returnTo`), `src/scenes/flow.ts` (`sceneFlow.returnTo`, **`isOpenWorld(id)` helper**), `src/game/G.ts` (`G.quests`), `src/data/dungeons/index.ts` (register `SISLI_VADI`, legacy alias for `sisli_koru`, `OPEN_ZONE_IDS`).
* **Stubs (compile, do nothing)**: `src/scenes/world/WorldRuntime.ts` (`class WorldRuntime { constructor(o: WorldRuntimeOpts); start(): Promise<void>; update(dt): void; isSafe(x, z): boolean; respawnPoint(): {x,z,yaw}; handleMessage(key, data): void; dispose(): void }`), `src/world/WorldDecor.ts` (`buildWorldDecor(def, host): Promise<WorldDecorHandle>` with `update/setPlayerPos/dispose`), `src/systems/Quests.ts` (`class QuestSystem` with the public API of WP4: `offered(npcId)`, `accept(id)`, `turnIn(id)`, `state(id)`, `active()`, `onKill(...)`, `onEvent(...)`), `src/data/world/sisli_vadi.ts` (an empty-but-valid `DungeonDef`).
* **Docs**: note in `docs/GDD_CONTENT.md` §2.6 "superseded by GDD_OPENWORLD", point `docs/ROADMAP.md` P2 "Open world Sisli Koru polish" at this doc.
* **Done when**: `tsc` clean, the game still boots and plays exactly as before.

### WP2: Open-world content data (content, wave 1)

* **Files** (new unless noted): `src/data/world/sisli_vadi.ts`, `regions.ts`, `camps.ts`, `villages.ts`, `pois.ts`, `metin.ts`, `quests.ts`, `karakir.ts` (skeleton), `src/data/town.ts` (exit `guney_kapisi` → `sisli_vadi`, new `dogu_kapisi` exit + gate dressing, Muhtar Cemal `quests: ['mq_01_kuzgunun_cagrisi', 'mq_19_kuzgunkaleye_donus']`, east-gate check on flag `q.mq_19_kuzgunkaleye_donus` or level ≥ 30), `src/data/dungeons/sisli_koru.ts` (kept for recipes, marked deprecated), `src/dev/contentCheck.ts` + `tools/content-check.mjs` (extend the validator: world maps, villages, camp spacing, ids, NPC-in-building).
* **Work**: transcribe/import §1-§6 (the layout JSON is the source of truth): rooms, roads, water, borders, 70 camps + 11 patrols with their scenery recipes (from the old `sisli_koru.ts` decorator style), 6 `WorldRegion` themes, 3 villages + 3 hubs, 11 waypoints, 2 entrances, metin tiers/spots/waves, 16 rares, 6 mini-bosses, boss schedules, shrines/chests/gather/hidden/vistas/landmarks, 19 + 24 quests, Av Defteri.
* **Done when**: `node tools/content-check.mjs sisli_vadi` is green (every enemy id exists in `ENEMIES`/`BOSSES` once WP3 lands, every model url exists under `public/`), and `getDungeon('sisli_vadi')` returns the full def.

### WP3: Enemies, metin stones, bosses, AI (enemies, wave 1)

* **Files**: `src/data/enemies.ts` (34 new `ow_*` defs §3.1, 16 rares, 6 mini-bosses, 6 `metin_*` stones, `wb_alevkanat`, new `A_*` animation sets), `src/ai/procModels.ts` (`metin_stone` builder, tier tint), `src/ai/bosses/world.ts` (+`WORLD_SCRIPTS.wb_alevkanat`, metin script: waves / adds / aura / pulse / heal-on-idle, rare specials), `src/ai/EnemyAI.ts` (`stationary`, `neutral`, sleep tick, safe-zone target filter via `EnemyDirector.setSafeQuery(fn)`), `src/ai/EnemyDirector.ts`, `src/ai/champion.ts` (`rollOpenWorldChampion(enemies, rng)`), `src/ai/abilities.ts` (howl-summon, spore, scarecrow/centipede dormant reuse), `src/entities/Enemy.ts` + `EnemyFactory.ts` (sleep/hide hooks, `visual.hide` for `Spear`).
* **Done when**: `dev/enemies.html` spawns every new def and plays its attack/hit/death clips, the metin stone runs a full 5-wave fight on the dev page, `wb_alevkanat` goes through all four phases.

### WP4: Items, loot, quests runtime, bounties (items, wave 1)

* **Files**: `src/data/materials.ts` (`metin_kalintisi`, `beceri_kitabi_1..3`, trophies, quest items, `kind: 'quest'`), `src/data/loot.ts` (`LootTableDef` additions, 16 farm tables, 6 `loot_metin_*`, 6 `loot_mb_*`, 16 `loot_rare_*`, `wb_alevkanat`, gather tables), `src/data/uniques.ts` (4 Vadi legendaries), `src/systems/LootSystem.ts` (`matMult`/`bonus`/`itemChanceMult`/`legendaryMult`/`uniqueChance`, contributor-based metin loot hook, champion drop rule), `src/systems/Quests.ts` (**full** `QuestSystem`: states, objectives, rewards, markers events, `flags`), `src/systems/Bounties.ts` (`bounty_metin`, `bounty_rare`, `bounty_farm`, mini-boss counts for `bounty_kill_boss`), `src/systems/Vendor.ts` (`weaponsmith`/`armorsmith`/`metin` kinds, Kalıntı daily caps, Kervancı rotation), `src/systems/Progression.ts` (`addExplorationXp(pct)`), `src/systems/CharacterState.ts` + `StatCalc.ts` (Av Defteri permanent bonuses from `flags['world.bio']`).
* **Done when**: `dev/items.html` shows the new tables and vendors; a scripted kill/collect quest completes and pays XP/gold/items; `tsc` clean.
* *Optional follow-up (combat module, 10 lines in `SkillSystem`)*: apply `skillRanks` (+5% damage, -2% cooldown per rank above 1). Until then the books store ranks only.

### WP5: World builder (world, wave 2)

* **Files**: `src/world/WorldDecor.ts` (**full**: roads, water planes, borders/cliffs/mountains, bridge, villages via `placeTownProps`, landmarks, `RegionAtmosphere` blend, region VFX), `src/world/OutdoorBuilder.ts` (per-region scatter palettes and density multipliers §8.2, border styles, tuft/flower layers with distance limits, `avoid` for landmarks/villages/arenas), `src/world/Terrain.ts` (2048 `Uint8` splat, tint map, per-region textures, shore rings), `src/world/Instancing.ts` (`ChunkCuller`), `src/world/DungeonBuilder.ts` (world hook: 640 x 640 `NavGrid`, void tiles blocked, asset url list per region, call `buildWorldDecor`), `src/world/TownBuilder.ts` (extract `placeTownProps(props, origin, host)`), `src/world/Sky.ts` / `LightPool.ts` (theme blending, priority lights), `dev/world.html` / `src/dev/world.ts` (fly-through page for the 640 m map with fps/draw-call readout).
* **Done when**: the dev page flies the whole map at ≥ 60 fps on a mid PC with the §1.5 budgets (≤ 400 draw calls, ≤ 26k instances, build ≤ 12 s) and each region reads as its theme.

### WP6: WorldRuntime and scene wiring (scenes, wave 2)

* **Files**: `src/scenes/DungeonScene.ts` (`def.world` branch → `WorldRuntime`, spawn point from `params.spawn`, `returnTo` on exit/release/scroll), `src/scenes/world/` (**new**: `WorldRuntime.ts`, `CampDirector.ts` (§1.5.2), `MetinDirector.ts`, `RareDirector.ts`, `MiniBossDirector.ts`, `BossSchedule.ts`, `SafeZones.ts`, `WaypointNetwork.ts`, `VillageSpawner.ts` (`spawnTownNpcs`, props handled by WP5), `GatherNodes.ts`, `HiddenAreas.ts`, `QuestMarkers.ts`, `WorldAnnounce.ts`), `src/scenes/TownScene.ts` (south gate `sisli_vadi`, east gate with the flag/level check), `src/scenes/ZoneEvents.ts` (per-region cursed chests, Hazine Goblini per region, boss respawn via `BossSchedule`), `src/scenes/PackWatch.ts`, `src/scenes/respawn.ts` (respawn at last waypoint/village, `world.respawn`), `src/entities/NPC.ts` (quest `!`/`?` markers, `quest`/`teleporter`/`stable` roles), `src/entities/interactables/` (`WaypointStone` teleport mode, `GatherNode`, `GhostBoat`, quest board reuse of `BountyBoard`).
* **Done when**: on the dev scene page a player can walk from the Kuzgunkale gate through R1 → R2, camps stream in/out, a Metin fight runs, a rare spawns, the world boss respawns, the safe zone protects the village, waypoints teleport, and a world entrance round-trips into Kemik Mahzeni and back.

### WP7: Net (net, wave 2)

* **Files**: `src/net/Replication.ts` (interest-managed `snap`: radius 120 m per peer, ≤ 60 enemies, sleeping enemies skipped; late-join camp state), `src/net/NetSession.ts` (allow join-in-progress into an open-world map, pass `spawn`/`returnTo` untouched, room activity `'dungeon'` for open maps = new `'world'` display only), `src/net/messages.ts` (activity value), `docs/NETCODE.md` (append "open world" notes: ids, `ev:*` keys, interest radius).
* **Done when**: `dev/net.html` with two tabs shows one party walking through the world with consistent camps, a joiner appears at the gate and sees the same stones/rares.

### WP8: UI: quests, waypoints, ladder states, map (panels-game + hud, wave 3)

* **Files**: `src/ui/panels/game/quests.ts` (**new**: `questlog`, `dialog`), `src/ui/panels/game/waypoints.ts` (**new**), `src/ui/panels/game/keystone.ts` (§7.3-7.6 states, per-member gating, world-entrance variant, recommended ilvl red text), `src/ui/panels/game/map.ts` (region fills, icons, legend, quest rings), `src/ui/panels/game/bounty.ts` (new templates), `src/ui/panels/game/index.ts`, `src/ui/panels/items/SkillsPanel.ts` (book rank pips and "read book" action; the single panels-items file in this package), `src/ui/hud/QuestTracker.ts` (**new**), `src/ui/hud/Minimap.ts` (region title, icons), `src/ui/hud/Banners.ts` (region and world announcements, metin/rare/boss toasts), `src/ui/hud/index.ts`, `src/ui/styles/panels-game.css`, `public/assets/icons/` (the `map-*` SVGs of §5.9).
* **Done when**: `dev/panels-game.html` and `dev/hud.html` show every new panel/state; the keystone panel matches the §7.5 table for a character at each step of the ladder.

### Waves and conflict check

| Wave | Packages (parallel) | Why they do not collide |
|---|---|---|
| 0 | WP1 | only agent touching `types/*`, `core/events.ts`, `scenes/scenes.ts`, `scenes/flow.ts`, `G.ts`, `data/dungeons/index.ts` |
| 1 | WP2, WP3, WP4 | `data/world/*` + `data/town.ts` + `tools/` (content) · `data/enemies.ts` + `ai/*` + `entities/Enemy*` (enemies) · `data/{materials,loot,uniques}.ts` + `systems/*` (items) |
| 2 | WP5, WP6, WP7 | `world/*` (world) · `scenes/*` + `entities/{NPC,interactables}` (scenes) · `net/*` (net) |
| 3 | WP8 | `ui/*` (panels-game, hud, one items panel) |

After wave 3: one **Haiku QA pass** (game + dev pages, console errors, 60 fps check, camp streaming sanity), then a tuning wave driven by the metrics (pacing table §6.6, density, camp respawns, Metin XP) and by the open questions below.

### Open questions / known gaps (tune or decide in playtest)

* Rare spawn feel (16 rares, 8-22 min) and Metin respawn (6-10 min) may flood or starve small groups: both timers are data.
* Region tint map vs. per-region ground textures (§1.5.1): ship the tint map first, textures second.
* Skill ranks (`skillRanks`) need the combat hook; until then Beceri Kitapları are collectibles.
* Guard assist (§2.2) and the boat cinematic are nice-to-haves.
* Karakır Bozkırı (§1.8) is a skeleton; its full layout is a follow-up doc using the same generator.


---

## Appendix A. Validation report (generated)

The generator that produced every table in this document ran these checks and **all passed**:

| Check | Result |
|---|---|
| Room rects inside the 160 x 160 grid, pairwise non-overlapping | 9 rooms, 18,784 walkable tiles (73% of the map) |
| Every road point lies on a walkable room | 14 roads, main road 1,279 m |
| Every camp is in its region's room (≥ 3 tiles from the border), inside the region's level band, members exist as enemy ids, ≤ 24 members | 70 camps / 473 mobs |
| Camp centres keep `radius_a/4 + radius_b/4 + 1.5` tiles of spacing; no camp within `radius/4 + 2` tiles of a village / hub footprint; no camp inside a boss arena | pass |
| Patrol loops stay in their region; members exist | 11 patrols / 53 mobs |
| Metin spots: 4 per region, ≥ 12 tiles apart, ≥ `camp radius + 2` tiles from every camp, outside arenas and ≥ 5 tiles from settlements | 24 spots |
| Waypoints, entrances, shrines, chests, cursed chests, gather fields, hidden areas, vistas, landmarks, rare spots inside rooms; rare levels within region band ±1; mini-boss lairs in their region | pass |
| Village buildings do not overlap (0.6 m pad), stay inside the bounds; no NPC stands inside a building | 3 settlements, 51 NPCs |
| Quest XP share per band | L1-5: 0.45, L5-10: 0.44, L10-15: 0.32, L15-20: 0.32, L20-25: 0.22, L25-30: 0.23 bars per level |

Totals: **81 packs** (526 mobs), 16 rares, 6 mini-bosses, 2 world bosses, 6 metin tiers / 24 spots, 16 farm spots, 11 waypoints, 12 shrines, 18 chests, 6 cursed chests, 12 gather fields, 6 hidden areas, 8 vistas, 19 main + 24 side quests, 34 new enemy defs. Pack indices 0..80 x stride 24 use enemy ids up to 2044 (range 100..49,999).

## Appendix B. Source documents and assets referenced

`ARCHITECTURE.md` (ownership, contracts) · `docs/GDD_CONTENT.md` §1 (ARPG layer), §2 (town, Sisli Koru), §5-§7 (M+, difficulty, progression) · `docs/GDD_SYSTEMS.md` §1.10 (enemy scaling), §6 (XP, unlocks, economy, bounties), §7 (loot) · `src/types/dungeons.ts`, `src/data/dungeons/sisli_koru.ts`, `src/world/OutdoorBuilder.ts`, `src/world/Terrain.ts`, `src/world/Instancing.ts`, `src/scenes/DungeonScene.ts`, `src/scenes/ZoneEvents.ts`, `src/scenes/PackWatch.ts`, `src/data/enemies.ts`, `src/data/loot.ts`, `src/data/materials.ts`, `src/systems/Bounties.ts`, `src/systems/MythicPlus.ts` · assets: `docs/assets/itch-monsters.md` (creatures, Bestiary), `generated-creatures.md`, `generated-bosses.md`, `generated-props.md`, `itch-kits.md` (PSX medieval, Nocturnal Watch), `itch-psx-env.md` (trees, nature, fences, tiny textures, skies), `environment.md` (hex town pack, Kenney kits), `audio.md`.
