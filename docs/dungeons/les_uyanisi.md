# Leş Uyanışı (`les_uyanisi`): Season 1 Mythic+ dungeon design

WoW model: **The Necrotic Wake** (Shadowlands 9.0, Bastion / Maldraxxus). Research: `docs/ref/dungeons/sl-a.md`. Non-commercial hobby project: staying very close to the WoW layout, bosses and look is intended.
Engine facts this doc was written against: `src/types/dungeons.ts`, `src/data/dungeons/kit.ts`, `kemik_mahzeni.ts`, `src/ai/bosses/kit.ts` and `kemik.ts`, `src/data/enemies.ts`, `src/types/enemies.ts` (poise fields, `perilous`, `kick`), `docs/CORE_MECHANICS.md` §6 (M+ scaling overrides GDD_CONTENT §5.4), §13 (verticality), §15 (loot), §16 (creatures), `docs/GDD_V2.md` §3 (poise / Duruş, parry, riposte), `docs/GDD_CONTENT.md` §0 and §5.
All in-game text is Turkish. Ids, code and prose are English. Every number is a tuning target for SimBench (CORE_MECHANICS §5), not a promise.

Legend used below: **EXISTS** = already in the repo and used as written. **NEW** = needs code or an asset; NEW items shared with the other 7 dungeons are collected in section 8.2 as `SP-xx` (shared primitives, `SP-Vx` verticality, `SP-Px` poise and attack strings, `SP-Lx` loot, `SP-Fx` model fallbacks) so they are built once.

**Revision 2 (critic pass plus the binding user requirements B1 to B5).** What changed, in one place:

| Area | Change |
|---|---|
| Patrols | p05, p16, p22 rerouted into empty lanes (every patrol segment at least 12 m from any other pack centre); p11 and p12 separated (p12 now 22 m from p11); new content-check rule (SP-13) |
| Models | every NEW model has a table row with a working fallback (model, scale, tint) and an anim map that only uses clips that exist; the final model is a one-line swap (`MODEL` in §2.8); content check fails on a missing clip |
| Boss 1 | the corpse-well pit moved east of the boss, to (45.5, 52.5); content check rejects any boss, pack or pickup inside a blocked zone |
| Boss 3 | island geometry restated in metres, island moved to (36.5, 5.5) so the pit stays inside the room, hook pad is explicitly the 8 m platform radius, fog radius 18 m |
| Dungeon weapons | damage is now a percentage of max HP (spear 30% trash / 12% elite / 1.5% boss / 60% Amarth minions), `weapon_mark` +25% for 10 s; hammer, orb retuned |
| Dark Exile | never picks the tank or the healer (DPS only, needs 2 other DPS alive), interval 60 s (50 s in phase 3), Nalthor kill time re-derived |
| HP curve | new package LES-00 changes `mplusHp` to the CORE_MECHANICS §6 curve before anything else |
| Forces and routes | `forcesRequired` stays 430, mandatory is now 451 (slack 21), optional 112 (+12 in the Çan Kulesi), route B re-timed honestly: it is the SAFE route, not the fast one |
| B1 verticality | 15 flat floor levels from -5.2 m (pit) to +36.4 m (summit), 17 stair strips, grand staircases, two chasm-and-bridge scenes, side-elevation diagram (§3.6), height and ceiling columns in the room table |
| B2 bosses | four bosses (the WoW original has four), each with a 3-hit string, a delayed swing, a leap or dive or blink, perilous slams, and a poise (Duruş) break that changes the fight (§5) |
| B3 trash | 13 trash types, 2 to 4 telegraphed attacks each, windups by the F10 formula, 3 elites with poise, 1 swarm, 2 set pieces (Son Çan toll, Gökbekçi Devi plus dungeon weapons) (§4) |
| B4 detail | per-room set-dressing sheets for all 27 rooms: props with counts and heights, lights, VFX, sounds (§3.7) |
| B5 loot | 3 named build-defining items per boss (12 items) plus the mount (§5.6) |

---

## 0. At a glance

| Field | Value |
|---|---|
| id / Turkish name / short name | `les_uyanisi` / Leş Uyanışı / Leş Uyanışı |
| WoW model | The Necrotic Wake (Grim Harvest, Final Toll, Fall of Courage, Stitchwerks, Zolramus top, lower wings) |
| Level range | `[50, 60]` (Kahramanlık, Mitik 0, Mitik+; no Normal mode, it is a level-60 season dungeon) |
| M+ timer | **27:00 = 1620 s** for 5 players. +2 at 21:36, +3 at 16:12 |
| Forces | `forcesRequired` **430**. Mandatory packs 451 (104.9%), optional packs 112, available 563 (130.9%) |
| Grid | 80 x 64 tiles (320 x 256 m), 27 rooms, 37 packs (31 mandatory, 6 optional), 4 bosses |
| Height | 15 flat floor levels, -5.2 m (Hasat Çukuru) to +36.4 m (Buzlu Tepe), a 41.6 m climb; hall ceilings 12 to 28 m (§3.6) |
| Bosses | 1 Çürükkemik, 2 Hasatçı Amarth, 3 Cerrah Dikişet, 4 Ayazbağlayan Nalthor (showpiece) |
| Trash | 13 types (3 elites with poise, 1 swarm), plus boss adds |
| Median +10 clear | about 22:15 (just misses +2). Strong +10 party: 19:45. See §6.1 |
| Entrance | Kadim Diyar, Gökkubbe Yaylası (marble sky plateau). See §7 |
| Font of Power (Kehanet Taşı) | `giris` at tile (8, 56) |
| Music | `world_ruins` (forecourt), `dungeon_crypt` (plague and Stitchwerks), `dungeon_shadow` (Zolramus), `dungeon_frost` (top), `boss` on engage |

---

## 1. Identity

**Fantasy.** A sanctuary being violated. The run starts in the brightest place in the whole game: a white-and-gold marble temple precinct in full daylight, with bronze bells hanging in the air. It sinks into a plague pit, climbs back through a broken bell courtyard to the open-air court where Courage fell, crosses a bridge of ribs into a flying bone ziggurat, and then climbs and climbs: stitched flesh, violet bone halls, and finally an ice-crowned platform above the clouds. The player should feel the colour drain and the air thin as the run goes up, and should look back down at where the run began.

**Lore hook into Kadim Zindanlar.** In the Kadim Diyar highlands, above the roots of the sealed ancient dungeons that Kuzgunkale sits on, stands the white **Cesaret Tapınağı**. It is the oldest "kapı" (seal gate): the fallen **Gökbekçileri** (sky wardens) sleep there in gilded marble and keep the Kadim Seal shut with their courage. The **Leş Tarikatı**, the last council of Kemik Lordu Azrakel's necromancers (they survived by hiding shards of his phylacteries, see Kemik Mahzeni), has raised **Zolramus**, a floating ziggurat of bone, over the temple. Their plan: harvest the wardens' souls (**Hasatçı Amarth**), stitch the dead into an army (**Cerrah Dikişet** and his vat-grown **Çürükkemik**), and let the frost lich **Ayazbağlayan Nalthor** break the seal's lock with ice-bound necromancy. Season keys (Kadim Anahtar Taşı) are shards of that very seal.

**Run summary (critical path, see §3.4 and the elevation in §3.6):** Cesaret Kapısı (y 0), Nöbetçi Yolu, Cesaret Meydanı (plaza with a sleeping Gökbekçi Devi golem), **Hasat Çukuru (boss 1, a pit 5.2 m below the plateau, entered by a 24 m ramp)**, Çürük Merdiven up to the Çan Kapısı and Son Çan Avlusu (the Final Toll bell courtyard, +2.4 m), Yıkık Geçit rising to **Cesaret'in Düşüşü (boss 2, open-air court at +6 m with the broken Hand of Courage and a grand staircase)**, Kemik Köprü rising 5.2 m into the sky, Dikişhane (Stitchwerks, +14.8 m), **Dikiş Atölyesi (boss 3)**, Yukarı Merdiven, Zolramus Kapısı (24 m hall), Kemik Basamaklar, Kemik Nef (28 m cathedral nave), Heykeltıraş Galerisi, Buzlu Merdiven, **Buzlu Tepe (boss 4, +36 m)**.

**Recommended route:** Route A (standard, 18 pulls) in §6.3. Route B ("Kısayol", Gökbekçi Devi #2 smashes the Servis Geçidi wall) skips the Son Çan courtyard, the most dangerous pull of section B, but it is **about 1:35 slower** because the skipped forces have to be rebuilt in the optional rooms: it is the safe route for parties that cannot handle the courtyard, not the speed route. Both reach 100%.

---
## 2. ART DIRECTION

Goal: read as the Necrotic Wake at a glance. Two clear worlds that fight each other. **Bastion** (cream marble, gold, sunlight, floating bells, blue anima) against **Maldraxxus** (bone ivory, necrotic violet, plague green, flesh brown, black-purple banners with a skull sigil), with frost blue only at the very top. Everything stays PSX: low-poly, hard dither, vertex snap, fog as the main depth cue.

### 2.1 Palette (hex)

| Role | Name | Hex |
|---|---|---|
| Bastion stone | Mermer krem | `0xe8dcc0` |
| Bastion trim | Bastion altın | `0xe0b048` |
| Bastion anima | Anima mavisi (water, fountain, wisps) | `0x70c8ff` |
| Daylight sky | Gün göğü | `0xbfd8f0` |
| Maldraxxi bone | Kemik fildişi | `0xd8d0b8` |
| Bone shadow | Kemik grisi | `0x8a8678` |
| Necrotic | Nekrotik mor / derin mor | `0x6a3a9a` / `0x2a1840` |
| Plague | Veba yeşili (base / glow) | `0x7acb3a` / `0x9aff50` |
| Flesh | Et kırmızı-kahve / kan | `0x8a4a40` / `0x6a1a1a` |
| Frost | Ayaz mavisi / derin buz | `0x9ad8ff` / `0x2a4a78` |
| Fog | Sis gri-yeşil | `0x7a8a6a` |
| Bronze | Çan bronzu | `0xb08040` |
| Reanimated Gökbekçi dead | Altın kemik (tint over KayKit bones) | `0xe8d8a0` |

`DungeonTheme.palette` = `[0xe8dcc0, 0xe0b048, 0xd8d0b8, 0x6a3a9a, 0x9aff50, 0x8a4a40, 0x9ad8ff]`.

### 2.2 Materials and textures

KayKit dungeon atlas stays the base material; colour comes from per-room tints (NEW `RoomDef.style`, **SP-02**; until it exists the builder only has the one theme `tint`).

| Area | Floor style / tint | Wall style / tint | Read as |
|---|---|---|---|
| Cesaret Kapısı, Nöbetçi Yolu, Cesaret Meydanı | `tiles` (checker 0.72) / `0xf2e8d0` | `stone` / `0xf0e6cc` | cream marble checker floor, gold banners |
| Hasat Ambarı | `wood` / `0xd8c8a8` | `brick` / `0xe0c8a8` | granary turned corpse store |
| Hasat Yolu, Hasat Çukuru | `dirt` / `0xb09a70` | `cave` / `0x9a9070` | trampled bone-yellow earth, gnawed pit walls |
| Çürük Merdiven, Çan Kapısı, Son Çan Avlusu, Çan Kulesi | `stone` / `0xd8d0b8` | `brick` / `0xd8c8a8` | weathered battle-scarred stone, bronze fittings |
| Yıkık Geçit, Servis Geçidi, Cesaret'in Düşüşü | `tiles` / `0xe8dcc0` (blood-stained) | `stone` / `0xe0d4b8` | the ruined temple court under a hazy golden sky |
| Kemik Köprü | `stone_dark` / `0xc8c0d0` | `temple` / `0xb8b0d0` | cloud-white fog, bone rails |
| Dikişhane (lobby, vats, pool, corridor, workshop) | `stone_dark` / `0xa8a890` | `forge` / `0xb08878` | wet flesh-brown walls, green lamp light |
| Zolramus Kapısı, Kemik Basamaklar, Kemik Nef, Heykeltıraş Galerisi | `stone_dark` / `0xb8b098` | `temple` / `0xa090c0` | bone-violet necropolis |
| Buzlu Merdiven, Buzlu Tepe, Alt Kanatlar | `ice` / `0xb8e0ff` (Alt Kanatlar `0x6a98c8`) | `ice` / `0xa8d6f4` | frozen marble, blue crystal |

Optional extra: tileable PSX textures from `/assets/textures/itch/tiny-texture-pack-*` (grey bricks `tt1-bricks-*`) for the open-air boss floors; not required.

### 2.3 Lighting rig (atmosphere presets)

Base `THEME` is the **daylight forecourt** (first impression; the dark rooms override it). Per-room atmosphere is a NEW primitive (**SP-02**: `RoomDef.atmosphere`, blends like the existing `RoomDef.fog` override). Fog colour is also the scene background, so these colours decide the whole mood.

| Preset | Rooms | hemi sky / ground / intensity | ambient / intensity | key light (the builder's directional "moon") | fog colour / near / far | coloured point lights | bloom |
|---|---|---|---|---|---|---|---|
| `forecourt` | giris, k_giris, meydan, ambar | `0xcfe4ff` / `0x9a8a68` / 1.45 | `0xfff4d8` / 0.9 | `0xffe2a0`, 0.9, from NE high | `0xd8e6f2` / 22 / 90 | gold braziers `0xffd070` (1.6, r 9), anima fountain `0x70c8ff` (1.4, r 8) | 0.35 |
| `plague` | k_hasat, hasat_cukuru | `0xb8b070` / `0x3a3020` / 1.1 | `0xa0a070` / 0.7 | `0xd8d890`, 0.55 | `0x8a8a50` / 10 / 46 | plague braziers `0x9aff50` (1.6, r 8), pyre orange `0xff8a40` (1.2, r 7) | 0.4 |
| `toll` | k_toll_a, toll_kapisi, son_can, can_kulesi | `0x9aa090` / `0x40382a` / 1.15 | `0x8a9078` / 0.7 | `0xc8c8a0`, 0.5 | `0x6e7a62` / 12 / 56 | bronze lanterns `0xffb060` (1.4, r 8) | 0.3 |
| `fall` | k_toll_b, kisayol, dus_meydan | `0xd8c8a0` / `0x504838` / 1.3 | `0xc8b898` with violet `0x7a6aa0` rim / 0.8 | `0xffd890`, 0.8, low from W | `0xcbba9e` / 20 / 85 | wreck fires `0xff9040` (1.3, r 8), necro violet `0x9060ff` pulses near Amarth | 0.4 |
| `cloud` | k_kopru | `0xe8e8f0` / `0xa0a0b0` / 1.5 | `0xe0e0f0` / 1.0 | `0xffffff`, 0.6 | `0xdcdce4` / 6 / 34 | bone lanterns `0x80ff60` (1.0, r 6) | 0.3 |
| `stitch` | dikis_kapi, vana_odasi, kan_havuzu, k_atolye, dikis_atolye | `0x6a7a58` / `0x2a1818` / 0.9 | `0x5a6a48` / 0.55 | `0x9aff80`, 0.35 | `0x1c2218` / 8 / 38 | green vat glow `0x9aff50` (1.8, r 9), surgical lamp `0xd8ff80` (2.2, r 12), dim red torches `0xff7040` (1.0, r 7) | 0.4 |
| `zol` | k_yukari, zolramus_kapi, k_nef_a, kemik_nef, heykel_galerisi | `0x6a5a98` / `0x1a1020` / 0.8 | `0x4a3a68` / 0.55 | `0xa080ff`, 0.35 | `0x1a1424` / 8 / 40 | violet braziers `0x9a60ff` (2.0, r 11), soul wisps `0x60ff90` (0.9, r 6) | 0.45 |
| `top` | k_cikis, buz_tepe | `0xcfeaff` / `0x6a88b0` / 1.4 | `0xc0e0ff` / 0.9 | `0xe0f0ff`, 0.9, cold from N | `0xb8d8f0` / 16 / 70 | ice crystals `0x80d0ff` (2.0, r 12) | 0.5 |
| `exile` | alt_kanat | `0x4870a0` / `0x182840` / 1.0 | `0x305078` / 0.6 | `0xa0c8ff`, 0.4 | `0x203858` / 6 / 30 | blue crystal `0x60b0ff` (1.6, r 8) | 0.5 |

Each preset also carries `ambientVfx`, a sky (§2.4) and a music id (§2.9). `THEME`: `{ fogColor: 0xd8e6f2, fogNear: 22, fogFar: 90, ambient: 0xfff4d8, ambientIntensity: 0.9, hemiSky: 0xcfe4ff, hemiGround: 0x9a8a68, torchColor: 0xffd070, bloomStrength: 0.35, music: 'world_ruins', palette, tint: 0xf0e8d8 }`.

### 2.4 Sky and backdrop

The builder has a sky dome (`world/Sky.ts`, used by the open world) and ready PSX panoramas in `/assets/sky/itch/`. Open-air rooms get a sky through `RoomDef.atmosphere.sky` (**SP-02**), blended with the fog like the open-world regions. Panoramas (horizon at the vertical middle; hide the lower half behind walls or fog):

| Rooms | Sky | Note |
|---|---|---|
| giris, k_giris, meydan | `cloudy-skyboxes-panorama/cloudy-sky-04.jpg` (day, clear blue, cumulus, fog `#daf4fe`) | the "Bastion noon" |
| k_hasat, hasat_cukuru | `cloudy-sky-09.jpg` (storm front, yellow horizon band, fog `#b8a754`) | plague-yellow haze |
| toll rooms | `cloudy-sky-10.jpg` (grey-green murk, fog `#6e7571`) | |
| fall rooms | `cloudy-sky-02.jpg` (hazy golden sun behind clouds, fog `#cbba9e`) | a purple shadow from Zolramus is a dark disc overhead (NEW prop `les_zolramus_uzak`, §2.7) |
| k_kopru | `cloudy-sky-20.jpg` (white-grey fog, bright disc) | cloud transit |
| dikis_*, zol rooms | none (flat fog colour, enclosed) | |
| buz_tepe | `cloudy-sky-05.jpg` (clear blue, wispy; fog `#cfeafa`) | above the clouds, thin air |
| alt_kanat | none (blizzard, fog `#203858`) | |

Below open platforms (Kemik Köprü, Buzlu Tepe) the "void" is a cloud sea: `ZoneDef` `void` with a white-grey `color` and `ambient_dust` (NEW tiny option `ZoneDef.look = 'cloud'`, **SP-06**; fallback: dark `pit` with fog colour `0xdcdce4`).

### 2.5 Landmark set pieces in run order

1. **Cesaret Kapısı**: the start room is the temple's outer gate. A 12 m marble arch (NEW `les_cesaret_kemeri`) frames the east exit; two winged Gökbekçi statues (shoulders only, heads knocked off) flank it; bronze bells float at 4 to 7 m (NEW `les_ucan_can`, gentle bob). The Kehanet Taşı glows gold on a rune circle.
2. **Cesaret Meydanı**: a sunlit plaza with an anima fountain in the middle, one dormant **Gökbekçi Devi** (a 4.5 m gold-white golem statue, grey while asleep) by the entrance on its plinth and two more lying collapsed. Overturned market stalls, fallen warriors, purple-black Maldraxxi banners already hung on the north wall, green-flame braziers beside every gold one. Bone-spike fences start here.
3. **Hasat Çukuru** (Grim Harvest): a ringed pit where the Leş Tarikatı drops its harvest. Bone-spike fence ring, corpse heaps, meat hooks on chains, boiling cauldrons, a central corpse well; flies, green gas, the yellow-green sky. Çürükkemik rests on a heap of dead.
4. **Çan Kapısı and Son Çan Avlusu** (Final Toll): a ruined gatehouse, then a courtyard whose centrepiece is the **Son Çan**, a 6 m cracked bronze bell hanging from a collapsing frame. It tolls every 18 s; chunks fall. Wrecked siege machines on both sides, torn gold banners.
5. **Çan Kulesi** (optional): the bell's tower base, shrine and a chest.
6. **Cesaret'in Düşüşü** (Fall of Courage): an open-air court under a golden sky. In the middle the **Cesaret'in Eli**, a colossal broken marble hand (8 m) reaching up from rubble, on a raised gold-rune dais. Kyrian wreck fires, a lone Xandria statue-figure and a Winged Champion stand at the back wall. Amarth circles on Kemikdiş above.
7. **Kemik Köprü**: a bridge of fused ribcages across a cloud sea into the underside of Zolramus; the fog turns white then green; the sky is gone behind a bone ceiling.
8. **Dikişhane** (Stitchwerks): operating tables with straps, rails of meat hooks across the ceiling, glass vats with floating stitched bodies, cages, instrument tables, green lamps, steam. Dormant creations sleep in the vats of Yaratım Odası.
9. **Dikiş Atölyesi**: a long workshop. In the north, the worktable island: a round platform ringed by a pit, a huge surgical table, a lamp, and a green fog. Three creation slabs along the south edge.
10. **Zolramus ascent**: bone-and-violet halls. Pillars of fused ribs and spine, skull walls, braziers of violet fire, unfinished bone statues on bonecarvers' benches, a mausoleum facade at the end of the gallery.
11. **Buzlu Tepe**: the roof of Zolramus. A round ice-sheathed platform in a cloud sea, ten 6 to 10 m crystal spires, frozen Gökbekçi statues kneeling in a ring, Nalthor's frost throne at the north edge. Snow drifts.

### 2.6 Prop list mapped to EXISTING assets

Helpers are the ones in `src/data/dungeons/kit.ts` (`dg` KayKit dungeon, `hw` halloween, `gp` generated props, `kg` Kenney graveyard (scale 3), `kc` Kenney castle (scale 4), `kf` Kenney fantasy town (scale 4), `ks` Kenney survival (scale 3), `ip` itch PSX packs, `chr` KayKit characters). `tint` is the multiply tint of `PropPlacement`. **The per-room placement lists with counts, heights, lights, VFX and sounds are in §3.7 and win over this table where they differ;** this table stays as the prop-family reference and the fallback table for the NEW props.

| Area | Props (counts are targets for the Haiku decor pass) |
|---|---|
| **Cesaret Kapısı / Nöbetçi Yolu** | `gp('font_of_power')` (collide, tag `socket`); `dg('stairs_walled')` decorative way back; `dg('pillar_decorated')` x4, `kg('column-large')` x4 tinted `0xf0e4c8`; `gp('statue_hooded')` x4 tinted `0xf0e0b0` (mourning wardens); `gp('banner_blue')` x4, `dg('banner_triple_yellow')` x4, `dg('banner_patternC_white')` x2, torn `dg('banner_thin_yellow')` x4; `gp('brazier')` x4 gold light; `kg('fire-basket')` x2; `kg('urn-round')` x4; `dg('sword_shield_gold')` wall trophies x4; `dg('rubble_half')` x3 |
| **Cesaret Meydanı** | one working Gökbekçi Devi at (17.5, 55.5) plus two collapsed ones as decor (NEW prop `les_gokbekci_dev`; fallback `gen/creatures/golem_stone` scale 1.3 (it is 3.5 m tall, the target is 4.5 m), tint `0xf0e0b0`, pose Idle frame 0; the collapsed ones rotated 90 degrees, y -0.3); fountain: `kf('fountain-round')` scale 3 plus `gp('crystal_blue')` floating y 2.2 with light `0x70c8ff`; market ruin: `gp('market_stall')` x3 (rot random, tilted), `gp('wagon')` x2 loaded with `gp('bone_pile')`, `dg('crates_stacked')` x4, `dg('barrel_large')` x4, `gp('sacks')` x3; fallen wardens: `hw('bone_A/B/C')` x20, `hw('ribcage')` x6, `hw('skull')` x8, `dg('sword_shield_broken')` x4 and `dg('sword_shield_gold')` x3 lying (y 0.1); pillars: `dg('pillar_decorated')` x6, broken `gp('pillar_broken')` x4, `kg('pillar-obelisk')` x2; Maldraxxi markers: bone-spike fence (NEW `les_kemik_dikeni` x8, fallback `hw('fence_broken')` tinted `0xd8d0b8` + `ip('psx-dungeon','spikes')`), `dg('banner_patternA_white')` x5 tinted `0x4a2870`, `gp('brazier')` x4 with `lt(0x9aff50, 1.6, 8, true)` and emissive |
| **Hasat Ambarı** (optional) | `dg('shelf_large')` x4, `dg('barrel_large')` x6 tinted `0x90b060`, `dg('crates_stacked')` x4, `gp('sacks')` x4, `hw('coffin')` x4 stacked, `dg('chest')` (id `chest_ambar`) |
| **Hasat Çukuru** | bone-spike ring (NEW `les_kemik_dikeni` x16, fallback as above); corpse heaps `gp('bone_pile')` x12 scale 2.0, `hw('ribcage')` x8, `hw('skull')` x20, toppled `hw('coffin')` x6, open `gp('sarcophagus')` x2; `gp('chains_hanging')` x8, `dg('keyring_hanging')` x8 (y 3.4), NEW `les_et_kancasi` x4; `gp('cauldron')` x3 (green, light), `gp('well')` at the pit rim; `hw('tree_dead_large')` x4, `hw('tree_dead_large_decorated')` x2, `hw('tree_dead_medium')` x4; ambient flies = `ambient_shadow_wisps` plus new sfx `flies_loop` |
| **Çürük Merdiven, Çan Kapısı, Son Çan Avlusu, Çan Kulesi** | NEW `les_son_can` (centre of the courtyard, collide; fallback: `gp('cauldron')` scale 3 inverted, tint `0xb08040`); `kc('tower-square-base')`, `kc('tower-square-mid-open')`, `kc('tower-square-roof')` collapsed at Çan Kulesi; `kc('wall-half')`, `kc('wall-corner')`, `kc('wall-doorway')` ruined gatehouse; `kc('flag-banner-long')` x6 tinted gold; wrecks `kc('siege-ballista-demolished')` x2, `kc('siege-catapult-demolished')` x2, `kc('siege-trebuchet-demolished')` x1; `kg('pillar-large')` x6, `kg('column-large')` x4; `dg('rubble_large')` x8; `gp('brazier')` bronze; `gp('chest_gold')` (id `chest_kule`) |
| **Cesaret'in Düşüşü** | NEW `les_cesaret_eli` (collide, centre; fallback `kg('column-large')` x5 fanned + `gp('pillar_broken')` + `gp('statue_hooded')` scale 3 on its side); `kc('stairs-stone')` wide steps at the east entrance; `kc('wall-corner-slant')`, `kc('tower-square-top')` fallen, `kf('wall-broken')` x6 (broken precinct wall with sky gaps); wrecks `kc('siege-*-demolished')` x4; `gp('banner_blue')` x6 torn Kyrian banners; `kg('fire-basket')` x6 burning, `gp('brazier')` x4; Xandria: `chr('Knight')` tint `0xf0d890`, pose `Blocking`, `show: ['1H_Sword','Round_Shield']`, scale 1.2, at (22, 25.5); Winged Champion: same model scale 1.5 at (23, 33.5), tint `0xffe8a0`; 2 spear pickups (§3.5); Gökbekçi Devi #3 at (8, 36) |
| **Kemik Köprü** | NEW `les_kemik_kopru` (bridge of rib arches) or fallback `ip('psx-dungeon','arch')` x4 over `dg('floor_tile_large')`; `hw('lantern_standing')` x4 tinted green, `hw('post_skull')` x4, `ambient_shadow_wisps` |
| **Dikişhane** | NEW `les_ameliyat_masasi` x6, NEW `les_vana` x8, NEW `les_et_kancasi` x10 (hook rows); `gp('iron_cage')` x4 each with `gp('bone_pile')`; `gp('alchemy_table')` x3 as instrument tables; `dg('table_long_broken')` x3, `dg('shelf_small_candles')` x4, `dg('bottle_A_green')` and `dg('bottle_B_green')` x10; `gp('cauldron')` x3; `gp('chains_hanging')` x14; `hw('coffin')` x6; `ip('psx-dungeon','chain')` x6, `ip('psx-dungeon','skull_wall')` x6, `ip('psx-dungeon','chandelier')` x3 tinted `0xd8ff80` (surgical lamps); `dg('barrier_corner')` x4; blood decals via `hw('floor_dirt_grave')` tinted `0x6a1a1a` |
| **Zolramus Kapısı → Heykeltıraş Galerisi** | NEW `les_zolramus_sutunu` x16 (fallback `ip('psx-dungeon','pillar')` tinted `0xb8b098`); `ip('psx-dungeon','arch')` x6, `ip('psx-dungeon','skull_wall')` x10, `ip('psx-dungeon','stairs_wide')` x2; `hw('post_skull')` x8, `hw('skull_candle')` x10; `gp('brazier')` x10 violet; `gp('crystal_purple')` x8; `gp('statue_hooded')` x8 tinted `0x4a3a68` (dark wardens); `gp('sarcophagus')` x6; bonecarver benches `ks('workbench')` x4 and `ks('workbench-anvil')` x2 with `hw('bone_A')` and unfinished statues (`gp('statue_hooded')` tinted bone); mausoleum facade `kg('crypt-large')` scale 2 at the gallery's south wall |
| **Buzlu Tepe / Buzlu Merdiven** | NEW `les_buz_kristali` x10, NEW `les_buz_taht` x1; `gp('crystal_blue')` x12 (light each); frozen wardens `gp('statue_hooded')` tinted `0x9ad8ff`, opacity 0.9, x6 kneeling ring; ice boulders `gp('rock_cliff')` tinted `0xbfe0ff` x6 on the rim; `dg('pillar')` tinted `0xa0d0ff` x8; `ambient_snow` |
| **Alt Kanatlar** | `gp('crystal_blue')` x16 (also path blockers, collide), `gp('rock_large')` tinted ice x6, caged Gilded Champion: `gp('iron_cage')` + `chr('Knight')` tint `0xa8d8ff`, pose `Blocking`; `blizzard`, `ambient_snow` |

### 2.7 NEW props to build in Blender (`tools/blender/props/*.py`, same pipeline as `props_special.py`)

PSX rules as in `docs/assets/generated-props.md` (16 to 64 px dithered textures, NEAREST, vertex colours, origin at the base centre, +Z front, emissive only on glow pixels). All 19 have a fallback in §2.6 (or the §2.8 model table for creatures) so nothing blocks.

| id (`gen/props/<id>.glb`) | Size W x H x D (m) | One-line look |
|---|---|---|
| `les_cesaret_kemeri` | 12 x 9 x 3 | cream marble gate arch with gold trim, two headless winged statue shoulders, cracked keystone, banner hooks |
| `les_cesaret_eli` | 8 x 7 x 4 | colossal broken marble hand reaching out of rubble, gold-leaf fingertips, glowing anima crack in the palm |
| `les_gokbekci_dev` | 2.6 x 4.5 x 2.2 | gold-white armoured golem statue, kneeling-ready stance, anima core in the chest (`core` node emissive; dormant = grey, awake = gold), `arm_l`/`arm_r` nodes for a stomp |
| `les_son_can` | 6 x 10 x 6 | giant cracked bronze-gold bell on a collapsing bone-and-timber frame; `clapper` and `bell` nodes (swing in code) |
| `les_ucan_can` | 1.2 x 1.6 x 1.2 | small floating bronze bell with a gold glow (hover bob in code) |
| `les_kemik_dikeni` | 4 x 3 x 1 | Maldraxxi bone-spike fence segment, lashed ribs, one green skull lamp |
| `les_et_kancasi` | 0.8 x 3 x 0.8 | meat hook on a chain with a sewn bundle; origin at the top (hangs from the ceiling like `chains_hanging`) |
| `les_ameliyat_masasi` | 2.2 x 1 x 1.1 | stone operating slab with leather straps, sewn limbs and a green lantern; `flame` card |
| `les_vana` | 2 x 2.6 x 2 | glass vat (alpha mask) with green liquid and a floating stitched body; `liquid` node UV scroll, emissive green |
| `les_kemik_kopru` | 4 x 2.4 x 8 | bridge segment of rib arches with bone rails; tiles end to end |
| `les_zolramus_sutunu` | 1.8 x 6 x 1.8 | pillar of fused ribs and spine, violet glow in the joints |
| `les_buz_kristali` | 3 x 8 x 3 | tall blue crystal spire, emissive core; 6 m and 10 m variants by scale |
| `les_buz_taht` | 4 x 5 x 3.5 | Nalthor's frost throne: ice-sheathed bone seat, crown of crystals |
| `les_zolramus_uzak` | 60 x 40 x 60 | distant silhouette of the floating ziggurat (400 tris, vertex-colour gradient, green glow on the underside) for the sky and the entrance vista |
| `les_giris_kapisi` | 18 x 12 x 5 | the world-entrance version of the gate (see §7) |
| `les_balkon` | 4 x 1.4 x 3 | balcony or gallery segment with a rail, corbels and a gold or bone trim; tiles end to end; decor at height (`nocollide`), fallback `dg('wall_archedwindow_open')` scaled flat plus `dg('barrier_half')` as the rail |
| `les_kemik_avize` | 3 x 3 x 3 | chandelier made of a rib cage with violet flames in a ring, hangs on a chain from the ceiling; fallback `ip('psx-dungeon','chandelier')` tinted `0x9a60ff` |
| `les_heykel_yarim` | 2 x 4 x 2 | half-carved bone statue on a wooden scaffold with a chisel left in it; fallback `gp('statue_hooded')` tinted bone with `ks('workbench')` beside it |
| `les_ameliyat_lambasi` | 1.6 x 2 x 1.6 | surgical lamp with a glass dome and a green-white glow, hangs from a chain or an arm; fallback `ip('psx-dungeon','chandelier')` tinted `0xd8ff80` |

**Fallback for every NEW prop (complete list; the placements of §3.7 use the `les_*` ids and the builder substitutes the fallback while the GLB does not exist, SP-F1).** Scale is the multiplier on the existing asset, tint is the multiply tint, "emissive" means the material emissive is set to the tint at 0.5.

| NEW prop | Fallback (existing assets) |
|---|---|
| `les_cesaret_kemeri` | `ip('psx-dungeon','arch')` scale 3.0 tint `0xf0e6cc`, flanked by two `gp('statue_hooded')` tint `0xf0e0b0` (shoulders hidden by a `dg('wall_half')`), banner hooks omitted |
| `les_cesaret_eli` | `kg('column-large')` x5 fanned + `gp('pillar_broken')` + `gp('statue_hooded')` scale 3 on its side (as in §2.6) |
| `les_gokbekci_dev` | `gen/creatures/golem_stone` scale 1.3 tint `0xf0e0b0` (dormant: tint `0x888888`), pose Idle frame 0; `arm_l` and `arm_r` animations replaced by the model's `Attack` clip |
| `les_son_can` | `gp('cauldron')` scale 3 inverted, tint `0xb08040`, hung from `dg('pillar')` x2 and `ip('psx-dungeon','chain')` (swing in code as for the final model) |
| `les_ucan_can` | `hw('lantern_hanging')` scale 1.2 tint `0xe0b048`, emissive |
| `les_kemik_dikeni` | `hw('fence_broken')` tint `0xd8d0b8` + `ip('psx-dungeon','spikes')` |
| `les_et_kancasi` | `ip('psx-dungeon','chain')` with `ip('nocturnal-watch','severed_leg')` attached at the lower end, origin at the top |
| `les_ameliyat_masasi` | `dg('table_long')` tint `0xa8a890` with `dg('bottle_A_green')` x2 and `hw('lantern_standing')` (green) |
| `les_vana` | `dg('barrel_large')` scale 1.5 tint `0x9aff50` emissive, `hw('skull')` on the lid |
| `les_kemik_kopru` | `ip('psx-dungeon','arch')` x2 over `dg('floor_tile_large')` (as in §2.6) |
| `les_zolramus_sutunu` | `ip('psx-dungeon','pillar')` tint `0xb8b098` (scale 1.4) |
| `les_buz_kristali` | `gp('crystal_blue')` scale 2.2 (6 m) or 3.3 (10 m) |
| `les_buz_taht` | `kg('altar-stone')` tint `0xa0d0ff` with `gp('crystal_blue')` x3 as the crown |
| `les_zolramus_uzak` | `ip('psx-dungeon','hexagon')` scale 40 tint `0x2a1840` seen from below, a dark disc with a `0x9aff50` point glow on the underside |
| `les_giris_kapisi` | `ip('psx-dungeon','arch')` scale 4.5 tint `0xf0e6cc` + `kc('wall-doorway')` x2 as the pylons + `gp('statue_hooded')` x2 scale 2.5 |
| `les_balkon`, `les_kemik_avize`, `les_heykel_yarim`, `les_ameliyat_lambasi` | as in the four rows above |

### 2.8 Enemy models, fallbacks and the one-line swap

Every NEW model has a working fallback made from assets that exist in `public/assets/models/` (clip lists verified with `tools/glb-inspect.mjs`), and **the defs name the model only through one table**, so the dungeon is playable before any Blender work and the swap is one constant:

```ts
// data/enemies/les_uyanisi.ts: the single place that names the NEW models (SP-F1)
const USE_FINAL_MODELS = false;                       // flip to true when the GLBs land (or per entry via `final`)
type ModelSpec = { model: string; scale: number; tint?: number; anims: Anims };
const A_DRAKE: Anims = { idle: 'Fly', walk: 'Fly', run: 'Fly', hit: 'Hit', death: 'Death' };   // gen/bosses/kizil_ejder has Fly; the final Amarth keeps the clip
const MODEL: Record<string, { fallback: ModelSpec; final: ModelSpec }> = {
  curukkemik:       { fallback: { model: GENB('mantar_kral'),     scale: 0.8,  tint: 0xa8b890, anims: A_GEN },   final: { model: GENB('curukkemik'),      scale: 1.0, anims: A_GEN } },
  hasatci_amarth:   { fallback: { model: GENB('kizil_ejder'),     scale: 0.8,  tint: 0xcfc8b0, anims: A_DRAKE }, final: { model: GENB('hasatci_amarth'),  scale: 1.0, anims: A_DRAKE } },
  ayazbaglayan:     { fallback: { model: GENB('golge_rahibesi'),  scale: 0.8,  tint: 0xa8d8ff, anims: A_GEN },   final: { model: GENB('ayazbaglayan'),    scale: 1.0, anims: A_GEN } },
  veba_torbasi:     { fallback: { model: GEN('slime_green'),      scale: 1.8,  tint: 0xb8a868, anims: A_GEN },   final: { model: GEN('veba_torbasi'),     scale: 1.0, anims: A_GEN } },
  iskelet_canavari: { fallback: { model: GEN('golem_stone'),      scale: 1.2,  tint: 0xe0d8c0, anims: A_GEN },   final: { model: GEN('iskelet_canavari'), scale: 1.0, anims: A_GEN } },
  dikis_yaratigi:   { fallback: { model: MON('Giant'),            scale: 1.2,  tint: 0xb08070, anims: A_ENEMY }, final: { model: GEN('dikis_yaratigi'),   scale: 1.0, anims: A_GEN } },
};
const M = (k: keyof typeof MODEL): ModelSpec => (USE_FINAL_MODELS ? MODEL[k].final : MODEL[k].fallback);
// usage in a def: `model: M('veba_torbasi').model, scale: M('veba_torbasi').scale, tint: M('veba_torbasi').tint, anims: M('veba_torbasi').anims`
```

The **fallback clip contract** (an ability's `anim` string must exist on the fallback AND on the final model, so both of them have to provide it; the content check of §8.2 fails otherwise):

| Model | Clips that exist (verified) | Clips the defs use |
|---|---|---|
| gen bosses (`mantar_kral`, `kizil_ejder`, `golge_rahibesi`; final `curukkemik`, `hasatci_amarth`, `ayazbaglayan`) and gen creatures `golem_stone` | `Idle Walk Run Attack Attack2 Cast Enrage Death Hit` (+ `Fly` on `kizil_ejder`); `slime_green`: no `Attack2`, `Cast`, `Enrage` | bosses: `Attack` (first and third hit of a string, bites, claws), `Attack2` (heavy hit, slam, leap landing), `Cast` (every channel, summon, zone), `Enrage` (roars and forced casts). `slime_green`: `Attack` only |
| `Giant`, `Zombie` (KayKit monsters) | `Idle Walk Run Attack Jump Death HitRecieve` | `Attack` for every hit, `Jump` for leaps; no casts (casting abilities use `Attack` on these models, which is why no def on them has a cast) |
| `Rogue_Hooded` (Dikişet, Toplayıcı) | `Dualwield_Melee_Attack_Slice/Chop/Stab`, `1H_Melee_Attack_*`, `Throw`, `Spellcast_Long/Raise/Shoot`, `Cheer`, `Jump_Full_Long`, `Dodge_*`, `Block_Attack`, `Hit_A`, `Death_A`, no `Taunt`, no `Spawn_Air`, no `Spellcast_Summon` | Dikişet: slices and stabs for strings, `Throw` (needle, jars), `Spellcast_Raise` (Yaratığı Uyandır), `Cheer` (Hastalıklı Takıntı), `Jump_Full_Long` (Kaçış and the leap) |
| `Barbarian` | same KayKit set | `1H_Melee_Attack_Chop`, `Throw`, `Spellcast_Raise` |
| KayKit skeletons (`Skeleton_Minion/Mage/Rogue/Warrior`) | full set incl. `1H_Melee_Attack_Jump_Chop`, `2H_Melee_Attack_Spin`, `Spellcast_Summon`, `Spellcast_Long`, `Taunt`, `Block_Attack`, `Dodge_*` | as written in §4.2 |
| `centipede` (itch) | `Idle Walk Run Threat Bite Burrow Emerge Hit Death` | `Bite`, `Emerge` |
| `Skull` (KayKit monsters) | `Idle Walk Jump Bite_Front Bite_InPlace Death HitRecieve Yes No Dance` | `Bite_Front`, `Jump` |

Look of each faction (tints are multiply tints; the NEW rows use the `M()` table above):

| Faction | Look | Model and tint |
|---|---|---|
| Reanimated Gökbekçi dead (Kırık Kemik Savaşçısı, Arbaletçi, Amarth's skeleton army) | bones with gold tabard scraps and green eyes | `SKEL('Skeleton_Minion' / 'Skeleton_Rogue')`, tint `0xe8d8a0`, `eyeEmissive: 0xa8ff60` |
| Leş Tarikatı casters (Kırık Kemik Büyücüsü) | violet-bone robed mage | `SKEL('Skeleton_Mage')` tint `0xc8b8e0`, eyes `0x9a60ff` |
| Plague (Veba Torbası, Leş Kurdu, Çürükkemik, İskelet Canavarı) | bloated, green, fly-ridden; the Canavar is a 3 m multi-skull bone beast | `M('veba_torbasi')`, worm = `itch/creatures/centipede` x0.7 tint `0xb8c870`, boss `M('curukkemik')`, `M('iskelet_canavari')` |
| Stitchwerks (Dikişli Öncü, Leş Toplayıcı, Et Zanaatkârı, Dikiş Yaratığı, Cerrah Dikişet) | pale stitched flesh, green thread, aprons, bone saws | `MON('Zombie')` tint `0xc8a898`; `CHAR('Rogue_Hooded')` tint `0x7a8a60`; `CHAR('Barbarian')` tint `0xa88070`; construct `M('dikis_yaratigi')`; boss `CHAR('Rogue_Hooded')` tint `0x9aa890` x1.55 with needle and cleaver (`itch/fantasy-weapons-bits` `dagger_b` x2.2, `dagger_a`) |
| Zolramus (Kapı Bekçisi, Büyücü, Heykeltıraş, Şifacı, Kafatası swarm, Nalthor, Amarth) | black-violet armour, bone-white carvers, frost-blue lich | `SKEL('Skeleton_Warrior')` tint `0x8a78b8`; `SKEL('Skeleton_Mage')` tint `0x7a5aa8` / `0x9ad8b0`; carver `SKEL('Skeleton_Warrior')` x1.35 tint `0xe8e0c8` with two `Skeleton_Axe`; swarm `MON('Skull')` x0.8 tint `0xd8d0b8` with green eyes; Nalthor `M('ayazbaglayan')`; Amarth `M('hasatci_amarth')` (flying, hover 1.2) |

NEW creature / boss models (Blender, `tools/blender/creatures` and `bosses`, one `.py` each, clips named as in `A_GEN`: `Idle Walk Run Attack Attack2 Cast Enrage Death Hit`, Amarth also `Fly`): `curukkemik` (bloated stitched mass, 4.2 m, exposed ribs, green thread, rusty hooks), `hasatci_amarth` (bone drake with hooded scythe rider, wingspan 7 m), `ayazbaglayan` (3.6 m frost lich, robe of ice shards, crystal crown, floating shards), `veba_torbasi`, `iskelet_canavari` (3 m multi-skull hunched bone beast), `dikis_yaratigi` (flesh construct 3.4 m with a hook arm). None of them blocks the dungeon (fallbacks above).

### 2.9 VFX palette and ambience

Existing `VfxId`s only (colour overrides by `color`): plague `poison_cloud` (with `duration` for lingering pools), `poison_burst`; necrotic `shadow_burst`, `shadow_ground`, `necrotic_hit`, `curse_loop`, `death_bones`, `grave_rise`, `corpse_explosion`; frost `frost_burst`, `frost_ground`, `frost_nova`, `blizzard`, `meteor_fall` (comets, `color 0x9ad8ff`), `ambient_snow`; gold/anima `heal_burst`, `holy_burst`, `buff_aura` (`0xe0b048`), `waypoint_glow`; fire `brazier_fire`, `torch_fire`, `fire_ground`; spawn `add_spawn`, `portal_swirl`, `blink`. Colour language: **gold and blue = ours (Bastion), green and violet = theirs (Maldraxxus), flesh brown = Stitchwerks, ice blue = Nalthor.** Danger telegraphs keep the global red/yellow rules (GDD_CONTENT §0.6).

Ambience mood (new `SfxId`s mapped by `audio/aliases.ts`; unknown ids stay silent): `bell_toll` (deep bronze, alias to a pitched-down `boss_roar`), `flies_loop`, `saw_loop` (distant surgical saw), `wind_loop`, `ice_creak`. Music: forecourt `world_ruins` (solemn, martial brass over distant bells; suggestion for a future track: processional horns), plague and Stitchwerks `dungeon_crypt` (wet, dirge-like), Zolramus `dungeon_shadow` (low choir, bone rattles), top `dungeon_frost`, all bosses `boss`.

### 2.10 Loading screen

A PSX painting of a white-and-gold temple under a golden sky: in the foreground a cracked giant stone hand rises from a heap of bones, a bone-built ziggurat hangs overhead trailing green smoke with an ice-blue crown on its top, and tiny hero silhouettes climb the marble stairs. `loadingImage: '/assets/loading/les_uyanisi.png'`, `icon: '/assets/icons/dungeon-les_uyanisi.svg'` (a bell over a skull).


---
## 3. LAYOUT (tile grid, 1 tile = 4 m, coordinates in the GDD convention of `kit.ts`)

### 3.1 Grid and map

`grid: { w: 80, h: 64 }`. `n` = -Z (up). The run snakes: start south-west, east along the south, north through the middle, west to the open-air court, north-west into Stitchwerks, then east along the north edge and down the east side to the summit. The layout below is verified by script (§8.4): no overlaps, every door sits on a shared edge, door heights match across every door.

Coarse map (1 character = 2 x 2 tiles; `S` start, `M` plaza, `1` boss 1 pit, `T` gatehouse, `C` bell courtyard, `2` boss 2 court, `D` Stitchwerks lobby, `3` boss 3 workshop, `Z` gate hall, `N` nave, `H` gallery, `4` boss 4 summit, `x` exile wings, `a k v h` optional rooms, `s` skip corridor, `=` bridge, `-` and `|` corridors):

```
 0
 2     hhhhhh    333333333  ZZZZZZZ
 4     hhhhhh    333333333  ZZZZZZZ
 6     hhhhhh    333333333  ZZZZZZZ
 8     hhhhhh    333333333--ZZZZZZZ
10 vvvvDDDDDDDD  333333333  ZZZZZZZ
12 vvvvDDDDDDDD--333333333  ZZZZZZZ
14 vvvvDDDDDDDD  333333333  ZZZZZZZ
16 vvvvDDDDDDDD                |     HHHHHH
18       ===                   |     HHHHHH
20       ===                 NNNNNNNNHHHHHH
22    2222222222             NNNNNNNNHHHHHH
24    2222222222  CCCCCCCCCCCNNNNNNNNHHHHHH
26    2222222222  CCCCCCCCCCCNNNNNNNNHHHHHH
28    2222222222--CCCCCCCCCCCkkkk    HHHHHH
30    2222222222--CCCCCCCCCCCkkkk    HHHHHH
32    2222222222  CCCCCCCCCCCkkkk      |
34    2222222222  CCCCCCCCCCCkkkk      |
36    2222222222sssssTTTTT   kkkk 444444444
38                   TTTTT        444444444
40                   TTTTT        444444444
42           aaaa      |          444444444
44           aaaa      |    xxxxx 444444444
46           aaaa   1111111 xxxxx 444444444
48         MMMMMMM  1111111 xxxxx 444444444
50         MMMMMMM  1111111 xxxxx 444444444
52         MMMMMMM  1111111 xxxxx 444444444
54   SSSS  MMMMMMM--1111111 xxxxx
56   SSSS--MMMMMMM  1111111 xxxxx
58   SSSS--MMMMMMM  1111111
60   SSSS  MMMMMMM
```

Walking distance of the critical path is about 195 tiles (780 m, about 111 s of pure running at 7 m/s). The plan view hides the climb: the vertical profile is in §3.6.

### 3.2 Rooms

Floor type is the KayKit `FloorStyle`. Heights follow CORE_MECHANICS §13 (heightfield): `floorY` is the room's base floor in metres, `ceiling` is the wall height (halls 12 to 28 m; `open` = no roof, the sky backdrop of §2.4 shows), and the stair strips and terraces that change the height inside a room are listed in §3.6 (the "Strips" column only names them). Doors always join at the same height on both sides (|difference| at most 0.45 m, checked in §8.4).

| id | Turkish name | rect (x,z,w,h) | size m | floor / wall | floorY m | ceiling m | Strips and terraces (§3.6) | Purpose |
|---|---|---|---|---|---|---|---|---|
| `giris` | Cesaret Kapısı | 4,54,8,8 | 32x32 | tiles / stone | 0.0 | open (arch 12) | `Kemer Basamakları`, Font terrace +0.4 | start, Kehanet Taşı, safe |
| `k_giris` | Nöbetçi Yolu | 12,57,4,2 | 16x8 | tiles / stone | +1.2 | 8 | none (flat landing) | corridor, pack 1 |
| `meydan` | Cesaret Meydanı | 16,48,14,14 | 56x56 | tiles / stone | 0.0 | open (colonnade 9) | `Meydan Basamakları`, Devi dais +0.4 | plaza, 5 packs + patrol, Gökbekçi Devi #1 |
| `ambar` | Hasat Ambarı | 20,42,8,6 | 32x24 | wood / brick | 0.0 | 7 (loft 3.4) | none | OPTIONAL, 2 packs, chest |
| `k_hasat` | Hasat Yolu | 30,54,4,2 | 16x8 | dirt / cave | 0.0 | 9 | none | corridor, pack 7, boss 1 door |
| `hasat_cukuru` | Hasat Çukuru | 34,46,14,14 | 56x56 | dirt / cave | -5.2 | open (cliff wall 6, rim at +5.2) | `Çukur Rampası`, `Çukur Çıkış Merdiveni` | **BOSS 1** (sunken pit) |
| `k_toll_a` | Çürük Merdiven | 40,42,2,4 | 8x16 | stone / brick | strip | 8 | `Çürük Merdiven` +1.4 to -1.6 | corridor out of boss 1, pack 10 |
| `toll_kapisi` | Çan Kapısı | 36,36,10,6 | 40x24 | stone / brick | +1.4 | 12 | none | gatehouse, 2 packs, Gökbekçi Devi #2 |
| `son_can` | Son Çan Avlusu | 30,24,22,12 | 88x48 | stone / brick | +2.4 | open (frame 16) | `Çan Basamakları`, bell dais +0.8 | courtyard of the bell, 3 packs + patrol, `debris_fall` hazard |
| `can_kulesi` | Çan Kulesi | 52,29,8,8 | 32x32 | stone / brick | +2.4 | 18 | `Kule Merdiveni`, top terrace +5.4 | OPTIONAL, 2 packs, chest |
| `k_toll_b` | Yıkık Geçit | 26,29,4,2 | 16x8 | stone / stone | strip | 8 | `Yıkık Geçit Rampası` +2.4 to +6.0 | corridor to boss 2, pack 18 |
| `kisayol` | Servis Geçidi | 26,36,10,2 | 40x8 | stone_dark / stone | strip | 7 | `Servis Rampası` +1.4 to +6.0 | SKIP corridor (device-locked) |
| `dus_meydan` | Cesaret'in Düşüşü | 6,22,20,16 | 80x64 | tiles / stone | +6.0 | open (broken wall 18) | `Cesaret Merdivenleri`, Hand dais +0.45 | **BOSS 2** (open air), Gökbekçi Devi #3 |
| `k_kopru` | Kemik Köprü | 12,18,6,4 | 24x16 | stone_dark / temple | strip | 10 (bone vault) | `Kemik Köprü Güvertesi` +9.6 to +14.8, void both sides | cloud bridge, pack 19 |
| `dikis_kapi` | Dikişhane Girişi | 8,10,16,8 | 64x32 | stone_dark / forge | +14.8 | 14 | none | lobby: the big pull, patrol, shrine Kudret |
| `vana_odasi` | Yaratım Odası | 0,10,8,8 | 32x32 | stone_dark / forge | +14.8 | 9 | none | OPTIONAL, dormant vat pack |
| `kan_havuzu` | Kan Havuzu | 8,2,12,8 | 48x32 | stone_dark / forge | +14.8 | 12 | none | OPTIONAL, 1 pack |
| `k_atolye` | Ameliyat Koridoru | 24,12,4,2 | 16x8 | stone_dark / forge | strip | 7 | `Ameliyat Rampası` +14.8 to +17.4 | corridor, pack 23, boss 3 door |
| `dikis_atolye` | Dikiş Atölyesi | 28,2,18,14 | 72x56 | stone_dark / forge | +17.4 | 18 | island platform +2.4 (unwalkable) | **BOSS 3** |
| `k_yukari` | Yukarı Merdiven | 46,8,4,2 | 16x8 | stone_dark / temple | strip | 10 | `Yukarı Merdiven` +17.4 to +22.6 | corridor out of boss 3 |
| `zolramus_kapi` | Zolramus Kapısı | 50,2,14,14 | 56x56 | stone_dark / temple | +22.6 | 24 | none | 4 packs (incl. the skull swarm) |
| `k_nef_a` | Kemik Basamaklar | 56,16,2,4 | 8x16 | stone_dark / temple | strip | 14 | `Kemik Basamaklar` +22.6 to +27.8 | stairs, pack 29 |
| `kemik_nef` | Kemik Nef | 52,20,16,8 | 64x32 | stone_dark / temple | +27.8 | 28 | `Heykeltıraş Merdiveni` +27.8 to +30.6 | nave, 2 packs |
| `heykel_galerisi` | Heykeltıraş Galerisi | 68,16,12,16 | 48x64 | stone_dark / temple | +30.6 | 22 | `Galeri Basamakları`, tier +32.4 | gallery, 3 packs, shrine Koruma |
| `k_cikis` | Buzlu Merdiven | 72,32,2,4 | 8x16 | ice / ice | strip | 12 | `Buzlu Merdiven` +32.4 to +36.0 | stairs, pack 35, boss 4 door |
| `buz_tepe` | Buzlu Tepe | 62,36,18,18 | 72x72 | ice / ice | +36.0 | open (no walls) | inner terrace +36.4, ice bridge | **BOSS 4** (round platform, void around) |
| `alt_kanat` | Alt Kanatlar | 50,44,10,14 | 40x56 | ice / ice | +24.0 | 40 | none | Dark Exile room: NO DOORS, entered only by `boss_tp` |

`ROOMS` (paste-ready, `kit.ts` helpers; `floorY`, `ceiling`, `openAir` and `stairs` are the NEW `RoomDef` fields of **SP-V1**, `stairs` are listed in §3.6):

```ts
const ROOMS: RoomDef[] = [
  room('giris', 'Cesaret Kapısı', 4, 54, 8, 8, 'tiles', 'stone', 0.3, { floorY: 0, openAir: true, ceiling: 10 }),
  room('k_giris', 'Nöbetçi Yolu', 12, 57, 4, 2, 'tiles', 'stone', 0.4, { floorY: 1.2, ceiling: 8 }),
  room('meydan', 'Cesaret Meydanı', 16, 48, 14, 14, 'tiles', 'stone', 0.5, { floorY: 0, openAir: true, ceiling: 9 }),
  room('ambar', 'Hasat Ambarı', 20, 42, 8, 6, 'wood', 'brick', 0.6, { optional: true, floorY: 0, ceiling: 7 }),
  room('k_hasat', 'Hasat Yolu', 30, 54, 4, 2, 'dirt', 'cave', 0.4, { floorY: 0, ceiling: 9 }),
  room('hasat_cukuru', 'Hasat Çukuru', 34, 46, 14, 14, 'dirt', 'cave', 0.15, { boss: 1, floorY: -5.2, openAir: true, ceiling: 6 }),
  room('k_toll_a', 'Çürük Merdiven', 40, 42, 2, 4, 'stone', 'brick', 0.3, { ceiling: 8 }),
  room('toll_kapisi', 'Çan Kapısı', 36, 36, 10, 6, 'stone', 'brick', 0.5, { floorY: 1.4, ceiling: 12 }),
  room('son_can', 'Son Çan Avlusu', 30, 24, 22, 12, 'stone', 'brick', 0.5, { floorY: 2.4, openAir: true, ceiling: 16 }),
  room('can_kulesi', 'Çan Kulesi', 52, 29, 8, 8, 'stone', 'brick', 0.5, { optional: true, floorY: 2.4, ceiling: 18 }),
  room('k_toll_b', 'Yıkık Geçit', 26, 29, 4, 2, 'stone', 'stone', 0.3, { ceiling: 8 }),
  room('kisayol', 'Servis Geçidi', 26, 36, 10, 2, 'stone_dark', 'stone', 0.3, { skip: true, ceiling: 7 }),
  room('dus_meydan', 'Cesaret\'in Düşüşü', 6, 22, 20, 16, 'tiles', 'stone', 0.15, { boss: 2, floorY: 6.0, openAir: true, ceiling: 18 }),
  room('k_kopru', 'Kemik Köprü', 12, 18, 6, 4, 'stone_dark', 'temple', 0.1, { ceiling: 10 }),
  room('dikis_kapi', 'Dikişhane Girişi', 8, 10, 16, 8, 'stone_dark', 'forge', 0.5, { floorY: 14.8, ceiling: 14 }),
  room('vana_odasi', 'Yaratım Odası', 0, 10, 8, 8, 'stone_dark', 'forge', 0.5, { optional: true, floorY: 14.8, ceiling: 9 }),
  room('kan_havuzu', 'Kan Havuzu', 8, 2, 12, 8, 'stone_dark', 'forge', 0.5, { optional: true, floorY: 14.8, ceiling: 12 }),
  room('k_atolye', 'Ameliyat Koridoru', 24, 12, 4, 2, 'stone_dark', 'forge', 0.3, { ceiling: 7 }),
  room('dikis_atolye', 'Dikiş Atölyesi', 28, 2, 18, 14, 'stone_dark', 'forge', 0.1, { boss: 3, floorY: 17.4, ceiling: 18 }),
  room('k_yukari', 'Yukarı Merdiven', 46, 8, 4, 2, 'stone_dark', 'temple', 0.3, { ceiling: 10 }),
  room('zolramus_kapi', 'Zolramus Kapısı', 50, 2, 14, 14, 'stone_dark', 'temple', 0.5, { floorY: 22.6, ceiling: 24 }),
  room('k_nef_a', 'Kemik Basamaklar', 56, 16, 2, 4, 'stone_dark', 'temple', 0.3, { ceiling: 14 }),
  room('kemik_nef', 'Kemik Nef', 52, 20, 16, 8, 'stone_dark', 'temple', 0.5, { floorY: 27.8, ceiling: 28 }),
  room('heykel_galerisi', 'Heykeltıraş Galerisi', 68, 16, 12, 16, 'stone_dark', 'temple', 0.5, { floorY: 30.6, ceiling: 22 }),
  room('k_cikis', 'Buzlu Merdiven', 72, 32, 2, 4, 'ice', 'ice', 0.1, { ceiling: 12 }),
  room('buz_tepe', 'Buzlu Tepe', 62, 36, 18, 18, 'ice', 'ice', 0.1, { boss: 4, floorY: 36.0, openAir: true }),
  room('alt_kanat', 'Alt Kanatlar', 50, 44, 10, 14, 'ice', 'ice', 0.2, { exile: true, floorY: 24.0, ceiling: 40 }),
];
```

Strip rooms (`k_toll_a`, `k_toll_b`, `kisayol`, `k_kopru`, `k_atolye`, `k_yukari`, `k_nef_a`, `k_cikis`) have no `floorY`: their whole floor is one stair strip, so the base is irrelevant (the builder takes the strip height). The `stairs` arrays are pasted into each `RoomDef` from §3.6.

`ROOM_EXTRA` (zones, hazards, flags; atmosphere keys are the presets of §2.3, `style` tints are §2.2; `explicitDecor: true` on the four boss rooms). `circleZone(kind, cx, cz, rTiles)` takes GDD coordinates and a radius in tiles; every circle below also gives its metre radius because the doc mixed the two in the first revision (1 tile = 4 m).

| room | extra |
|---|---|
| giris | `atmosphere: 'forecourt'`, `ambientVfx: 'ambient_dust'`, `lightColor: 0xffd070`, `rune` circle (8, 56) r 1.0 tile (4 m), colour `0xe0b048`, glow intensity 0.4 |
| k_giris, ambar | `atmosphere: 'forecourt'` |
| meydan | `atmosphere: 'forecourt'`, `pool` circle (22.5, 54.5) r 2.0 tiles (8 m) blocked (colour `0x3a78c8`, glow `0x70c8ff`, 0.9); `dais` circle (17.5, 55.5) r 1.5 tiles (6 m) under the working Gökbekçi Devi (gold glow, +0.4 m step) |
| k_hasat | `atmosphere: 'plague'` |
| hasat_cukuru | `explicitDecor`, `atmosphere: 'plague'`, `ambientVfx: 'ambient_shadow_wisps'`, `lightColor: 0x9aff50`; central `pit` circle **(45.5, 52.5)** r 1.8 tiles (7.2 m) blocked (glow `0x9aff50`, 0.6), east of the boss (42, 52.5) so the door-to-boss lane and the boss spawn cell are free; three `vent` decals at (37, 49), (44.5, 58), (37, 58) |
| k_toll_a, toll_kapisi, can_kulesi | `atmosphere: 'toll'` |
| son_can | `atmosphere: 'toll'`, `dais` circles under the bell at (41, 29.5): outer r 2.0 tiles (8 m) +0.4 m, inner r 1.0 tile (4 m) +0.8 m (two 0.4 m steps), `hazards: [{ kind: 'debris_fall', interval: 9, warn: 1.4, radius: 2.5, coef: 1.6 }]` (NEW kind, **SP-06**; fallback `icicle_drop`) |
| k_toll_b, kisayol | `atmosphere: 'fall'` |
| dus_meydan | `explicitDecor`, `atmosphere: 'fall'`; `dais` circle (15.5, 29.5) r 3.5 tiles (14 m) with a gold rune glow (under the Hand); four `rune` circles r 1.2 tiles (4.8 m) at the corner brazier spots |
| k_kopru | `atmosphere: 'cloud'`, `ambientVfx: 'ambient_shadow_wisps'`; `void` rects (12, 18, 2, 4) and (16, 18, 2, 4) with `look: 'cloud'` and a fall plane (SP-V3); the 2-tile (8 m) deck x14..16 is the stair strip |
| dikis_kapi | `atmosphere: 'stitch'`, `ambientVfx: 'ambient_shadow_wisps'`, `lightColor: 0x9aff50`; three `vent` decals, optional hazard `plague_vent` (NEW, **SP-06**), `rune` circle at the shrine (8.5, 16) |
| vana_odasi, k_atolye | `atmosphere: 'stitch'` |
| kan_havuzu | `atmosphere: 'stitch'`; `pool` rect (12, 3, 6, 3) blocked (blood, colour `0x6a1a1a`, glow `0xaa2020`, 0.5) |
| dikis_atolye | `explicitDecor`, `atmosphere: 'stitch'`; table island at **(36.5, 5.5)**: `pit` circle r 3.2 tiles = **12.8 m** blocked (spans z 2.3 to 8.7, inside the room rect z 2 to 16), then `dais` circle r 2.0 tiles = **8.0 m** (the platform, raised +2.4 m, unwalkable because the pit ring blocks it; Dikişet stands on it and the hook pad is this 8 m radius); three `rune` circles r 1.1 tiles (4.4 m, green) at the slabs (31, 10), (36.5, 11.5), (42, 10) |
| k_yukari, zolramus_kapi, k_nef_a, kemik_nef, heykel_galerisi | `atmosphere: 'zol'`, `ambientVfx: 'ambient_shadow_wisps'`, `lightColor: 0x9a60ff`; a violet `rune` circle in the middle of each hall (decor) |
| k_cikis | `atmosphere: 'top'`, `ambientVfx: 'ambient_snow'` |
| buz_tepe | `explicitDecor`, `atmosphere: 'top'`, `ambientVfx: 'ambient_snow'`; zones in this order: `pit` rect (62, 36, 18, 18) blocked with `look: 'cloud'` and a fall plane, `bridge` rect (72, 36, 2, 2) from the door onto the platform, `dais` circle (70.5, 44.5) r 7.5 tiles = 30 m (colour `0x9ad8ff`, glow `0x80d0ff`, 0.5), inner terrace circle r 3.0 tiles = 12 m (+0.4 m). Phase 3 turns on `hazards: icicle_drop` by script (interval 11, warn 1.5, radius 2.5, coef 1.4) |
| alt_kanat | `atmosphere: 'exile'`, `ambientVfx: 'ambient_snow'`; `hazards: [{ kind: 'icicle_drop', interval: 1.5, warn: 1.0, radius: 2.2, coef: 0.5 }]`; `ice` decals along the path; crystals as blockers (see §5.4) |

### 3.3 Doors

`door(a, b, tx, tz, side, width, gate)`, all 2 tiles wide. `gate: 'device_lock'` is NEW (**SP-03**): closed until its device (`DoorDef.device`) is used; the builder draws it as a rubble barricade (`dg('rubble_large')` x3 plus `dg('barrier_column')`).

```ts
const DOORS: DoorDef[] = [
  door('giris', 'k_giris', 11, 57, 'e', 2, 'none'),
  door('k_giris', 'meydan', 15, 57, 'e', 2, 'none'),
  door('meydan', 'ambar', 22, 48, 'n', 2, 'none'),
  door('meydan', 'k_hasat', 29, 54, 'e', 2, 'none'),
  door('k_hasat', 'hasat_cukuru', 33, 54, 'e', 2, 'boss_lock'),
  door('hasat_cukuru', 'k_toll_a', 40, 46, 'n', 2, 'boss_exit'),
  door('k_toll_a', 'toll_kapisi', 40, 42, 'n', 2, 'none'),
  door('toll_kapisi', 'son_can', 40, 36, 'n', 2, 'none'),
  door('son_can', 'can_kulesi', 51, 30, 'e', 2, 'none'),
  door('son_can', 'k_toll_b', 30, 29, 'w', 2, 'none'),
  door('k_toll_b', 'dus_meydan', 26, 29, 'w', 2, 'boss_lock'),
  { ...door('toll_kapisi', 'kisayol', 36, 36, 'w', 2, 'device_lock'), device: 'dev_gd2' },
  door('kisayol', 'dus_meydan', 26, 36, 'w', 2, 'boss_lock'),
  door('dus_meydan', 'k_kopru', 14, 22, 'n', 2, 'boss_exit'),
  door('k_kopru', 'dikis_kapi', 14, 18, 'n', 2, 'none'),
  door('dikis_kapi', 'vana_odasi', 8, 13, 'w', 2, 'none'),
  door('dikis_kapi', 'kan_havuzu', 12, 10, 'n', 2, 'none'),
  door('dikis_kapi', 'k_atolye', 23, 12, 'e', 2, 'none'),
  door('k_atolye', 'dikis_atolye', 27, 12, 'e', 2, 'boss_lock'),
  door('dikis_atolye', 'k_yukari', 45, 8, 'e', 2, 'boss_exit'),
  door('k_yukari', 'zolramus_kapi', 49, 8, 'e', 2, 'none'),
  door('zolramus_kapi', 'k_nef_a', 56, 15, 's', 2, 'none'),
  door('k_nef_a', 'kemik_nef', 56, 19, 's', 2, 'none'),
  door('kemik_nef', 'heykel_galerisi', 67, 23, 'e', 2, 'none'),
  door('heykel_galerisi', 'k_cikis', 72, 31, 's', 2, 'none'),
  door('k_cikis', 'buz_tepe', 72, 35, 's', 2, 'boss_lock'),
];
```

`dus_meydan` has two `boss_lock` entrances (`k_toll_b`, `kisayol`): both close on engage and open on kill or wipe. `DoorDef.device?: string` is an optional field added to the type (**SP-03**). Door heights are listed in §3.6 (all 26 doors join within 0.05 m).

### 3.4 Critical path, optional areas, skips

**Critical path (mandatory):** giris, k_giris, meydan, k_hasat, **hasat_cukuru (B1)**, k_toll_a, toll_kapisi, son_can, k_toll_b, **dus_meydan (B2)**, k_kopru, dikis_kapi, k_atolye, **dikis_atolye (B3)**, k_yukari, zolramus_kapi, k_nef_a, kemik_nef, heykel_galerisi, k_cikis, **buz_tepe (B4)**.

**Optional areas (extra forces, never required):** `ambar` (33 forces, chest), `can_kulesi` (22 + 12 = 34, gold chest on the tower top), `vana_odasi` (20, dormant), `kan_havuzu` (25). 112 forces in total.

**Skip: Servis Geçidi.** Using Gökbekçi Devi #2 (device `dev_gd2`, in the gatehouse) smashes the wall: the `toll_kapisi` west door opens into `kisayol`, a 40 m ramp (+1.4 to +6.0 m) that leads straight into the Amarth court (still `boss_lock`ed behind boss 1). It skips `son_can`, `k_toll_b`, `can_kulesi` and the packs p13, p14, p15, p16 and p18: **74 forces (17.2%)**. Pack p12 stays: it now stands in the south-east corner of the gatehouse (45, 39.5), 22 m from p11, so it is a clean pull that route B still takes (it is not skipped, and it is not body-pulled by p11). Nothing on the skip route has forces. Boss 1 stays mandatory, so the skip never bypasses a boss. The skip saves about 1:20 of fighting and walking in section B but costs about 2:55 in the optional rooms, so route B is about 1:35 slower (§6.3): it is a **safety route, not a speed route**.

**Order of bosses:** strictly 1, 2, 3, 4 (door locks by `order`).

### 3.5 Set-piece mechanics and how to build them

Two dungeon-specific set pieces carry the identity (user rule: 1 to 2 per dungeon): the **Son Çan toll** (row 3) and the **Gökbekçi Devi plus Zindan Silahları** (rows 1 and 2). Everything else is a boss mechanic or a prop.

| # | Set piece | Where | Build with | Status |
|---|---|---|---|---|
| 1 | **Gökbekçi Devi** (Kyrian Goliath repair) | meydan (17.5, 55.5) `dev_gd1`, toll_kapisi (36.6, 39.6) `dev_gd2`, dus_meydan (8, 36) `dev_gd3` | `PropPlacement` with `tag: 'device'` and `id`; F within 3 m wakes the golem (core emissive gold, 3 s stomp animation) and every player within 25 m gets `anima_exhaust` for 60 s (below). `dev_gd2` also opens the `device_lock` door (the wall smash is a 2.5 s animation with `gate_heavy` and a rubble burst). One use per run per device. Two more collapsed, inert golems lie in the meydan as decor | **NEW** device system (SP-03), status `anima_exhaust` (SP-05) |
| 2 | **Zindan Silahları** (dungeon weapons, the "spears") | 13 pickups, table below | `PropPlacement` with `tag: 'weapon'` and `id`, planted in the scenery; F picks up; one item at a time; a HUD item button (new `Input` action `dungeonItem`, key chosen from the free ones in `core/Input.ts`) fires it. Damage is a **percentage of the target's max HP** (below), so the weapons matter at every key level | **NEW** dungeon-item system (SP-03) |
| 3 | **Son Çan** tolling | son_can | prop `les_son_can` (bell swing in code every 18 s, camera shake 0.15 for 0.5 s, sfx `bell_toll`, a gold shock ring `holy_burst` at the base); `debris_fall` hazard drops chunks while fighting. The toll is audible in the whole front half of the dungeon at a lower volume (a landmark for the run) | prop NEW, hazard kind NEW (SP-06) |
| 4 | **Cesaret'in Eli** | dus_meydan centre | collidable prop on a `dais`; cover from the Frostbolt Volley line only visually (no rule) | prop NEW |
| 5 | **Xandria's spear** (fight intro) | dus_meydan | on boss engage: `bossFx('holy_projectile')` from the Xandria figure to Amarth, then `floatOver(e, '-%2')` and a toast. Flavour only | EXISTS (kit `bossFx`, `floatOver`) |
| 6 | **Dormant vats** | vana_odasi | pack with `dormant: { kind: 'egg', wakeRadius: 6 }`; one `les_vana` prop (`tag: 'wake'`) under every member; vats crack and glow when a player gets within 6 m | EXISTS (like the Kemik Mahzeni rat coffins) |
| 7 | **Meat hooks** | dikis_atolye | boss 3 mechanic: a line shape with negative knockback pulls the first player hit toward the construct | EXISTS (`knockback < 0`, bossNet `boss_pull`) |
| 8 | **Kemik Köprü** | k_kopru | `void` zones either side (blocked, fall plane), 2-tile deck rising 5.2 m; pack 19 stands on the deck; no knockback mob is placed there | EXISTS (+ fall plane SP-V3) |
| 9 | **Dark Exile** (Karanlık Sürgün) | boss 4, `alt_kanat` | teleport the marked player to the unconnected room, kill the Siphoner to free the champion, a portal returns him (§5.4) | **NEW** `boss_tp` (SP-04), exile room (SP-08) |
| 10 | **Climb dressing** | k_kopru to buz_tepe | `atmosphere` blends: fog `0xd8e6f2` to `0xdcdce4` (cloud) to `0x1c2218` (inside) to `0x1a1424` (necropolis) to `0xb8d8f0` (summit), real stairs, cloud-sea voids, rising wind sfx | **NEW** atmosphere (SP-02), heightfield (SP-V1) |

**Anima Egzozu** (`anima_exhaust`, party buff from a Gökbekçi Devi): 60 s. Every 2 s a pulse of radius 8 m around the holder: `0.6 x monsterDmg(60) x mplusDmg(L)` holy damage to enemies and a 1.5% max HP heal to allies in range. The damage does not scale with player stats. Optional speed bonus only.

**Dungeon weapons** (`DUNGEON_ITEMS`; damage ignores player damage modifiers and crits, like the hotfixed WoW weapons, and **scales with the target's max HP**, so a spear is worth the same share of a pull at +2 and at +15). Percentages are of `maxHp` after M+ scaling; the three target classes are `trash` (rank trash, swarm included), `elite` (rank elite, Kibir Tecessümü counts as elite), `boss` (rank boss, and Amarth's `minion` adds count as `minion`).

| id | Turkish name | Pickups (tile) | Effect |
|---|---|---|---|
| `spear` | Kanlı Mızrak | meydan (19, 48.8), son_can (33, 31), dus_meydan (23, 24) and (23, 35), buz_tepe (68, 38) | 1 throw: line 24 m x 1.6, passes through every enemy. Physical damage, ignores armour: **30% of max HP to trash, 12% to elites, 1.5% to bosses, 60% to Amarth's minions**. Applies `weapon_mark` (**+25% damage taken from players, 10 s**) to everything it hits. Worth about 45% of Nalthor's Icebound Aegis on its own (§5.4) |
| `hammer` | Unutulmuş Çekiç | meydan (27.5, 51.5), son_can (38, 27), heykel_galerisi (70, 24) | 1 strike: cone 3.5 m, 120 degrees. **Stuns any non-boss target for 4 s, including elites and Kibir Tecessümü** (ignores `ccImmune` on trash and elite ranks), and breaks an elite's poise at once. Damage: 15% of max HP to trash, 5% to elites; on a boss: 0.5% of max HP plus 25% of the poise bar (it never stuns a boss) |
| `orb` | Boşalmış Anima | dikis_kapi (8.5, 11.5), zolramus_kapi (52, 11), kemik_nef (52.5, 26) | channel 6 s on a ground circle r 6 at the aim point: every 1 s **4% of max HP to trash, 2% to elites, 0.15% to bosses**, arcane, **and every tick interrupts casts** in the area (24% of a trash pack's HP over the channel). The answer to the Stitchwerks double-harvester pull |
| `shield` | Atılmış Kalkan | son_can (45, 31), heykel_galerisi (75, 19) | channel 6 s, you cannot move or attack, you and allies within 8 m take 50% less damage |

Total 13 pickups (5 + 3 + 3 + 2). They do not respawn. The pull plan for each is in §6.3. What a weapon is worth at +10 (Tahkimli): a spear thrown through a Savaşçı pack removes about 7.4k HP from each of 4 to 5 members (30% of 24.6k), roughly one third of the pull; the hammer on a Canavar removes 5% (5.6k of 112.6k) and a 4 s stun; an orb on the Stitchwerks Toplayıcı drains stops every cast for 6 s and removes 24% of the pack. None of them kills a boss: the boss values (1.5%, 0.5%, 0.15%) are chosen so the weapons help with mechanics (Aegis, Land of the Dead, poise, drains) and never replace the DPS check.

### 3.6 Verticality (CORE_MECHANICS §13, binding user requirement B1)

The first revision sold the climb with dressing only (every room flat). This revision uses the heightfield rule of §13: every room has a `floorY`, strips and terraces interpolate the height, the max step between tiles is 0.45 m, strips are the only place where a larger change happens, and melee ignores height differences up to 2.5 m. The climb is real: **-5.2 m at the plague pit to +36.4 m on the summit, a 41.6 m range with 15 flat floor levels**.

**Floor levels (flat areas):**

| Level | y (m) | Where | Read as |
|---|---|---|---|
| L-1 | -5.2 | `hasat_cukuru` arena floor | a pit sunk 5.2 m below the plateau, 6 m cliff wall (the rim, 5.2 m up, carries spikes and watchers), yellow sky as a lid |
| L0 | 0.0 | `giris`, `meydan`, `ambar`, `k_hasat` | the sunlit plateau, the brightest place in the game |
| L0a | +1.2 | `k_giris` landing | the gate passage sits 1.2 m above the plaza: the first view is down onto the plaza |
| L1 | +1.4 | `toll_kapisi` | gatehouse |
| L2 | +2.4 | `son_can` courtyard, `can_kulesi` ground | the bell courtyard, one flight above the gatehouse |
| L2a | +5.4 | `can_kulesi` top terrace | the bell tower's chest terrace, overlooking the courtyard |
| L3 | +6.0 | `dus_meydan` | the open-air court on a raised terrace above the cloud sea |
| L4 | +14.8 | `dikis_kapi`, `vana_odasi`, `kan_havuzu` | Stitchwerks ground floor, inside Zolramus |
| L5 | +17.4 | `dikis_atolye` | the workshop, one ramp above the lobby; the island platform is a further +2.4 (unwalkable) |
| L6 | +22.6 | `zolramus_kapi` | the 24 m gate hall |
| L7 | +27.8 | `kemik_nef` | the 28 m cathedral nave |
| L8 | +30.6 / +32.4 | `heykel_galerisi` (two tiers) | the sculptors' gallery |
| L9 | +36.0 / +36.4 | `buz_tepe` outer / inner terrace | the summit above the clouds |
| (X) | +24.0 | `alt_kanat` | exile wings hanging under the summit (no doors) |

**Side elevation of the critical path** (plan distance on x, height on y; the real path is 780 m long, the staircases are the diagonal runs):

```
 y (m)   critical path, 1 character = about 10 m walked, 1 row = 3 m of height
 +36 |                                                                         /____
 +33 |                                                                      /__
 +30 |                                                                   /__
 +27 |                                                               /___
 +24 |                                                        /______
 +21 |                                                       /
 +18 |                                              /________
 +15 |                                        /_____
 +12 |                                       /
  +9 |                                      /
  +6 |                              /_______
  +3 |                      /_______
  +0 |____________      /___
  -3 |            \_   /
  -6 |              \__
     +------------------------------------------------------------------------------
      G   M       1       T C        2       K D      3        Z      N    H     4  
      G giris  M meydan  1 BOSS 1 pit  T toll_kapisi  C son_can  2 BOSS 2 court  K kopru  D dikis_kapi
      3 BOSS 3 workshop  Z zolramus_kapi  N kemik_nef  H heykel_galerisi  4 BOSS 4 summit
```

Section through the pit (west to east along the entry lane, B1 fight area at the right; the pit well at x 45.5):

```
  y 0    k_hasat ____________________________
                                              \                          rim at y 0: bone-spike ring, trebuchet,
                                               \  Çukur Rampası           watchers, hooks hang down
  y -2.6                                        \  (24 m, 0.217)
                                                 \
  y -5.2                                          \__________ arena floor ____[B1 x42]______(well x45.5)___|
                                  x 34 ........... 40 ......... 42 ........ 45.5 ........ 48 (cliff wall)
```

**Stair strips.** Strips are `RoomDef.stairs` entries (tile boxes, `axis` x or z, `yFrom` at the box's minimum coordinate, `yTo` at its maximum). The builder draws every strip as steps of 0.25 m rise (a riser prop `dg('stairs_wide')` or `ip('psx-dungeon','stairs_wide')` per 4 m) while the walk height is a smooth interpolation, builds retaining walls and rails where a strip is higher than its neighbouring floor by more than 0.45 m (SP-V1), and keeps its gradient at most 0.35 (stairs) so camera and melee behave. **Packs may stand on strips (stair fights are a Necrotic Wake staple); bosses, devices, pickups, shrines, chests, the Font and the exit never do** (content check, §8.2).

| Strip | Room | box [x0, z0, x1, z1] | axis | yFrom | yTo | run m | gradient | Role |
|---|---|---|---|---|---|---|---|---|
| `Kemer Basamakları` | giris | [9, 57, 12, 59] | x | +0.0 | +1.2 | 12 | 0.100 | steps up to the arch landing under the 12 m gate |
| `Meydan Basamakları` | meydan | [16, 57, 20, 59] | x | +1.2 | +0.0 | 16 | 0.075 | steps down into the sunlit plaza |
| `Çukur Rampası` | hasat_cukuru | [34, 54, 40, 56] | x | +0.0 | -5.2 | 24 | 0.217 | **the descent into the pit**, a long gangway along the cliff with the arena opening below |
| `Çukur Çıkış Merdiveni` | hasat_cukuru | [40, 46, 42, 50] | z | -1.6 | -5.2 | 16 | 0.225 | exit stair out of the pit (door `boss_exit`) |
| `Çürük Merdiven` | k_toll_a | [40, 42, 42, 46] | z | +1.4 | -1.6 | 16 | 0.188 | rotten stairs, pack 10 fights on them |
| `Çan Basamakları` | son_can | [40, 33, 43, 36] | z | +2.4 | +1.4 | 12 | 0.083 | wide entrance steps into the courtyard |
| `Kule Merdiveni` | can_kulesi | [53, 29, 56, 33] | x | +2.4 | +5.4 | 12 | 0.250 | up to the tower terrace (terrace [56, 29, 60, 33] at +5.4) |
| `Yıkık Geçit Rampası` | k_toll_b | [26, 29, 30, 31] | x | +6.0 | +2.4 | 16 | 0.225 | ruined passage climbing west, pack 18 |
| `Servis Rampası` | kisayol | [26, 36, 36, 38] | x | +6.0 | +1.4 | 40 | 0.115 | the skip corridor, a long ramp |
| `Cesaret Merdivenleri` | dus_meydan | [12, 22, 17, 26] | z | +9.6 | +6.0 | 16 | 0.225 | **grand staircase**, 20 m wide, from the court up to the bone bridge |
| `Kemik Köprü Güvertesi` | k_kopru | [14, 18, 16, 22] | z | +14.8 | +9.6 | 16 | 0.325 | the rib bridge rising 5.2 m over the cloud sea |
| `Ameliyat Rampası` | k_atolye | [24, 12, 28, 14] | x | +14.8 | +17.4 | 16 | 0.162 | surgery corridor ramp, pack 23 |
| `Yukarı Merdiven` | k_yukari | [46, 8, 50, 10] | x | +17.4 | +22.6 | 16 | 0.325 | bone stairs into Zolramus |
| `Kemik Basamaklar` | k_nef_a | [56, 16, 58, 20] | z | +22.6 | +27.8 | 16 | 0.325 | rib stairs into the nave, pack 29 stacks casters on them |
| `Heykeltıraş Merdiveni` | kemik_nef | [64, 20, 68, 28] | x | +27.8 | +30.6 | 16 | 0.175 | **grand staircase**, 32 m wide, nave to gallery |
| `Galeri Basamakları` | heykel_galerisi | [68, 26, 80, 29] | z | +30.6 | +32.4 | 12 | 0.150 | gallery tier, 48 m wide (tier [68, 29, 80, 32] at +32.4) |
| `Buzlu Merdiven` | k_cikis | [72, 32, 74, 36] | z | +32.4 | +36.0 | 16 | 0.225 | ice stairs onto the summit bridge |

**Small steps (each at most 0.45 m, no strip needed):** Font terrace [6, 54, 10, 58] +0.4 (giris); Devi dais r 1.5 tiles +0.4 (meydan); bell dais outer r 2.0 tiles +0.4 and inner r 1.0 tile +0.8 (son_can); Hand dais r 3.5 tiles +0.45 (dus_meydan); summit inner terrace r 3.0 tiles +0.4 (buz_tepe, Nalthor stands on it).

**Doors (all 26 join within 0.05 m):** giris to k_giris +1.2; k_giris to meydan +1.2; meydan to ambar 0.0; meydan to k_hasat 0.0; k_hasat to hasat_cukuru 0.0; hasat_cukuru to k_toll_a -1.6; k_toll_a to toll_kapisi +1.4; toll_kapisi to son_can +1.4; son_can to can_kulesi +2.4; son_can to k_toll_b +2.4; k_toll_b to dus_meydan +6.0; toll_kapisi to kisayol +1.4; kisayol to dus_meydan +6.0; dus_meydan to k_kopru +9.6; k_kopru to dikis_kapi +14.8; dikis_kapi to vana_odasi, kan_havuzu, k_atolye +14.8; k_atolye to dikis_atolye +17.4; dikis_atolye to k_yukari +17.4; k_yukari to zolramus_kapi +22.6; zolramus_kapi to k_nef_a +22.6; k_nef_a to kemik_nef +27.8; kemik_nef to heykel_galerisi +30.6; heykel_galerisi to k_cikis +32.4; k_cikis to buz_tepe +36.0.

**Chasms and bridges (WoW has both):** `k_kopru` (the Kemik Köprü: a 2-tile deck, void either side, cloud sea 20 m below) and `buz_tepe` (the round summit platform in a cloud-sea void, one ice bridge from the door). Void tiles carry a fall plane (SP-V3): falling costs 25% max HP and respawns the player at the last safe tile (the deck or platform edge); the scripted pits (boss 3 island moat, boss 1 well) are blocked zones, nobody can fall into them. The Volkanik, Fırtınalı and Kin Dolu knock-ups obey the 3 m safe-cell rule (SP-06) next to every void; the dungeon has no knockback trash near a void. The WoW original has no lifts, so none are built here (the lift primitive stays open for other dungeons).

**Boss rooms and height.** Every boss stands on flat floor (content check). B1: the arena is the pit floor, the party arrives down the 24 m ramp, the whole fight is watched from the rim by the hooded Leş Tarikatı statues. B2: the court is flat at +6.0 with the Hand dais; Amarth hovers at 1.2 m and dives (§5.2), the court's wall is broken so the cloud sea shows; the grand staircase at the north end is the exit. B3: flat floor, the island platform stands 2.4 m above it and the pit moat 12.8 m wide keeps it unreachable. B4: the round summit, 3 terraces (outer ring +36.0, inner +36.4), void all around.

**Combat on height (§13 applied).** Melee and hit shapes ignore height differences up to 2.5 m; the pit rim (5.2 m above the arena) is therefore out of reach for both sides (no rim attackers exist; the watchers are decor). Stair fights stay inside the 2.5 m tolerance: a pack spread over 12 m on a 0.325 strip differs by 1.3 m. Ranged attacks need line of sight only. Enemies path through the strips (they use the same nav steps).

**Ceiling, wall height and camera.** `ceiling` is the wall height in metres; the camera zoom limit indoors is `min(18, 0.9 x ceiling)` m (corridors of 7 to 8 m zoom to 6.3 to 7.2 m, halls of 22 m and more have the full 18 m), open-air rooms use the open-world zoom. Grand halls: `zolramus_kapi` 24 m, `kemik_nef` 28 m (the tallest space in the game), `heykel_galerisi` 22 m, `dikis_atolye` 18 m, `can_kulesi` 18 m.

**Decorative upper layer (non-walkable, `nocollide`, set at height).** Every hall carries a gallery or balcony row (`les_balkon`), hanging banners (y 6 to 18 m), chandeliers (`les_kemik_avize`, `chandelier`, surgical lamps), statues on cornices and arches, so the halls read tall. The per-room lists with counts and heights are in §3.7.

### 3.7 Room set-dressing sheets (binding user requirement B4)

This is the **authoritative placement list**: where it differs from the older area table in §2.6, this section wins (§2.6 stays as the prop-family reference and fallback table). One of the 8 maps M+ rotates on, so every room gets props with counts, a high layer, lights, VFX and sounds. Rules for the Haiku decor pass:

* Helpers as in §2.6 (`dg`, `hw`, `gp`, `kg`, `kc`, `kf`, `ks`, `ip`, `chr`); `lt(color, intensity, radius, flicker?)` is the point-light helper; `y` is metres above the room's floor (the builder adds `floorY`); "high" props are `nocollide` and never block the nav grid. New props are the `les_*` ids of §2.7 (all 19 have a fallback in the §2.7 table; the registry substitutes it, so placements never point at a missing file).
* Light budget (ROADMAP perf rule): at most 10 lights per scene are active; the builder enables the nearest ones, so a room may define up to 8 point lights and the far ones fade. Emissive materials and VFX do most of the colour work. No shadows on point lights.
* Sounds are positional emitters (`SP-11`): `emit(id, [x, z], radius m, volume)`, looped unless marked "event". Existing `SfxId`s are used where they fit; the new ones are `bell_toll`, `flies_loop`, `saw_loop`, `wind_loop`, `ice_creak` (and `bone_rattle`, `chain_rattle`, `drip_loop` aliased to existing files by `audio/aliases.ts`: `skeleton_death` pitched down, `trap_trigger` pitched down, `water_impact`).
* Reserved circles (`makeCtx`) are kept clear of decor (§8.1).

**Cesaret Kapısı (`giris`, y 0, open sky, arch 12 m)**
* Props: `gp('font_of_power')` x1 at (8, 56); `les_cesaret_kemeri` x1 at the east exit (11.5, 58); headless warden statues `gp('statue_hooded')` x4 tinted `0xf0e0b0` (2 flank the arch, 2 beside the Font); `dg('pillar_decorated')` x4 and `kg('column-large')` x4 (`0xf0e4c8`) along the walls; `kg('urn-round')` x4; `gp('brazier')` x4 and `kg('fire-basket')` x2 (gold); banners `gp('banner_blue')` x4, `dg('banner_triple_yellow')` x4, `dg('banner_patternC_white')` x2, torn `dg('banner_thin_yellow')` x4; wall trophies `dg('sword_shield_gold')` x4; `dg('rubble_half')` x3; the `dg('stairs_walled')` way back (decor).
* High layer: floating bronze bells `les_ucan_can` x7 at y 4 to 7 (gentle bob, each its own phase); `les_balkon` x2 on the north wall at y +6.5 with two banners each; the Zolramus silhouette `les_zolramus_uzak` in the north-east sky (distance 200 m, y 90).
* Lights: gold braziers x4 `lt(0xffd070, 1.6, 9, true)`; Font rune glow `lt(0xe0b048, 1.4, 6)`; key light is the forecourt sun (§2.3).
* VFX: `ambient_dust` (gold motes), `waypoint_glow` on the Font, `buff_aura` sparks (`0xe0b048`) around two bells, cloud-sea haze beyond the south wall (fog band).
* Sound: `wind_loop` low (r 40, 0.3), `camp_crackle` at each brazier (r 8), `choir_swell` pad at the Font (r 10, 0.25), `bell_toll` distant (event, every 40 s, 0.2).

**Nöbetçi Yolu (`k_giris`, y +1.2, ceiling 8)**
* Props: `dg('pillar_decorated')` x2 at the entrance; `gp('statue_hooded')` x2 (mourners); `dg('banner_triple_yellow')` x2 and `gp('banner_blue')` x2 (y 4); `hw('lantern_standing')` x2 (gold tint); first dead: `hw('bone_A')` x4, `hw('skull')` x3, `dg('sword_shield_broken')` x2; `dg('stairs_wide')` x1 (decor, matches the steps down to the plaza at x 16..20).
* High layer: arched lintel `dg('wall_arched')` x2 at y 6.5; a bronze bell `les_ucan_can` x1 hanging in the arch (y 5).
* Lights: lanterns x2 `lt(0xffd070, 1.2, 7)`. VFX: `ambient_dust`. Sound: footstep echo, `wind_loop` from the plaza (r 20, 0.2).

**Cesaret Meydanı (`meydan`, y 0, open sky, colonnade 9 m)**
* Props: the working Gökbekçi Devi `les_gokbekci_dev` at (17.5, 55.5) on its dais plus two collapsed ones (rotated 90 degrees, y -0.3) at (28.2, 52.8) and (17.2, 50.2), clear of the patrol lane; fountain `kf('fountain-round')` scale 3 at (22.5, 54.5) with `gp('crystal_blue')` floating y 2.2; market ruin `gp('market_stall')` x3 tilted, `gp('wagon')` x2 loaded with `gp('bone_pile')`, `dg('crates_stacked')` x4, `dg('barrel_large')` x4, `gp('sacks')` x3; fallen wardens `hw('bone_A/B/C')` x20, `hw('ribcage')` x6, `hw('skull')` x8, `dg('sword_shield_broken')` x4 and `dg('sword_shield_gold')` x3 lying (y 0.1); pillars `dg('pillar_decorated')` x6, `gp('pillar_broken')` x4, `kg('pillar-obelisk')` x2; Maldraxxi markers `les_kemik_dikeni` x8, `dg('banner_patternA_white')` x5 tinted `0x4a2870`, `gp('brazier')` x4 with `lt(0x9aff50, 1.6, 8, true)`; corpse heaps in the SE corner `gp('bone_pile')` x4.
* High layer: the north colonnade gallery `les_balkon` x6 at y +5.5 on `dg('pillar')` x8 (non-collide); hanging banners x8 at y 6 to 9 alternating gold and violet; aqueduct arches `ip('psx-dungeon','arch')` x3 on the east skyline (y 7, decor); floating bells `les_ucan_can` x9 at y 4 to 8.
* Lights: fountain `lt(0x70c8ff, 1.4, 8)`; gold braziers x4 and green braziers x4 (8 total, far ones fade); Devi dais `lt(0xe0b048, 0.9, 5)`.
* VFX: `ambient_dust`; anima wisps (`waypoint_glow`, cyan, small) x3 rising from the fountain; `grave_rise` dust puffs on the collapsed golems when a player passes (once); on Devi wake `buff_aura` gold and `ground_slam`.
* Sound: `bubble_loop` fountain (r 15), `flies_loop` SE corpses (r 12, 0.35), `camp_crackle` x8 (r 8), `bell_toll` event every 18 s from the far bell (0.25), `wind_loop` (r 40, 0.3).

**Hasat Ambarı (`ambar`, y 0, ceiling 7, optional)**
* Props: `dg('shelf_large')` x4 along the walls, `dg('barrel_large')` x6 tinted `0x90b060`, `dg('crates_stacked')` x4, `gp('sacks')` x4, `hw('coffin')` x4 stacked 2 x 2 (y 0 and 0.9), `dg('chest')` (id `chest_ambar`) at (23.5, 42.4), `gp('chains_hanging')` x3, `hw('skull_candle')` x4, `hw('bone_B')` x6, cobwebs (auto).
* High layer: the granary loft `les_balkon` x1 along the north wall at y +3.4 with a ladder (`dg('stairs_wood')` decor); `les_et_kancasi` x4 hanging from the rafters (y 6.5); sacks and shelves on the loft.
* Lights: candle clusters x2 `lt(0xffa050, 1.0, 6, true)`, a green cauldron `gp('cauldron')` `lt(0x9aff50, 1.2, 6)`. VFX: `ambient_shadow_wisps` (thin), steam from the cauldron. Sound: `flies_loop` (r 10, 0.3), `footstep_wood`, `chest_locked` on approach, creaking beams (`ui_page_flip` pitched, rare event).

**Hasat Yolu (`k_hasat`, y 0, ceiling 9 cave cut)**
* Props: `hw('tree_dead_medium')` x2, `hw('post_skull')` x4, `les_kemik_dikeni` x4, `hw('bone_A/B')` x8, `gp('chains_hanging')` x4, `dg('keyring_hanging')` x3, `hw('lantern_standing')` x2 (green), `gp('cauldron')` x1 steaming by the boss door, `gp('wagon')` x1 with `gp('bone_pile')`.
* High layer: cave-mouth stalactites `gp('rock_cliff')` x4 inverted at y 8 (decor).
* Lights: green lamps x2 `lt(0x9aff50, 1.0, 6)`, pyre `lt(0xff8a40, 1.2, 7, true)` x1. VFX: low `poison_cloud` ground haze (decor), `ambient_shadow_wisps`. Sound: `flies_loop` growing toward the pit (r 18, 0.5), `wind_loop`.

**Hasat Çukuru (`hasat_cukuru`, BOSS 1, y -5.2, open, cliff wall 6 m)**
* Props (floor): corpse heaps `gp('bone_pile')` x12 scale 2.0, `hw('ribcage')` x8, `hw('skull')` x20, toppled `hw('coffin')` x6, open `gp('sarcophagus')` x2, `gp('cauldron')` x2 (green); the corpse well `gp('well')` scale 2.5 at (45.5, 52.5) with a green glow; vents x3.
* Props (rim, y +5.2 above the floor, ring around the arena): `les_kemik_dikeni` x16; `hw('tree_dead_large')` x4, `hw('tree_dead_large_decorated')` x2, `hw('tree_dead_medium')` x4; hooded Leş Tarikatı watchers `gp('statue_hooded')` x6 tinted `0x4a3a68` standing at the rim; a wrecked crane `kc('siege-trebuchet-demolished')` x1 that "drops the harvest" into the pit; `gp('chains_hanging')` x8 from the rim down to y +2 and `dg('keyring_hanging')` x8 at y 3.4, `les_et_kancasi` x4.
* High layer: the rim itself is the high layer (a ring of spikes and watchers 5.2 m up), a yellow storm sky `cloudy-sky-09` as a lid.
* Lights: green braziers x4 on the rim `lt(0x9aff50, 1.6, 8, true)`, pyres x2 `lt(0xff8a40, 1.2, 7, true)`, well glow `lt(0x9aff50, 1.2, 7)`.
* VFX: `ambient_shadow_wisps`, vent puffs `poison_burst` every 12 s (decor, harmless), a corpse tossed from the crane every 25 s (`death_bones` at the well, decor), flies cloud.
* Sound: `flies_loop` (r 30, 0.6), `bubble_loop` x2 cauldrons, `chain_rattle` at the crane (event, every 25 s), `heartbeat_loop` faint inside the arena, boss music on engage.

**Çürük Merdiven (`k_toll_a`, strip, ceiling 8)**
* Props: stair decor along the strip `dg('stairs_walled')`; rails `kc('wall-narrow-stairs-rail')` x4; torn `kc('flag-banner-long')` x2 (gold); `dg('rubble_half')` x3; `hw('lantern_standing')` x2 (bronze); fallen guards `hw('bone_C')` x4; `dg('torch_mounted')` x4; blood decals `hw('floor_dirt_grave')` x3 tinted `0x6a1a1a`.
* High layer: arched ribs `dg('wall_arched')` x3 over the stairs. Lights: bronze lanterns x2 `lt(0xffb060, 1.4, 8)`. VFX: dust motes. Sound: drips (`drip_loop`, r 10), muffled `bell_toll` from the courtyard (event, 0.2).

**Çan Kapısı (`toll_kapisi`, y +1.4, ceiling 12)**
* Props: ruined gatehouse `kc('wall-half')` x6, `kc('wall-corner')` x2, `kc('wall-doorway')` x1; the inner arch `kc('tower-square-arch')` x1 over the north door; the raised portcullis `kc('metal-gate')` x1 (y +4.5, decor); `kc('flag-banner-long')` x4 (gold); `kc('siege-ballista-demolished')` x1, `kc('siege-ram-demolished')` x1; Gökbekçi Devi #2 `les_gokbekci_dev` at (36.6, 39.6) on a plinth beside two cracked wall panels `dg('wall_cracked')` x2 and rubble (the wall that will break); `dg('barrel_large')` x4, `dg('crates_stacked')` x3, `dg('sword_shield_gold')` x4, `hw('skull')` x6.
* High layer: arrow-slit galleries `les_balkon` x2 (north and south walls, y +5.5) with two dead archers as `gp('bone_pile')`; a broken beam roof with sky gaps; hanging bronze bell fragments x2.
* Lights: bronze lanterns x4 `lt(0xffb060, 1.4, 8)`; Devi core `lt(0xe0b048, 0.9, 5)` (grey while dormant); a pale sunbeam spot `lt(0xffe2a0, 1.2, 10)` from y 11.
* VFX: `ambient_dust` in the sunbeam; Devi wake `buff_aura` and a rubble burst on the wall smash. Sound: `rubble` and `gate_heavy` on the smash, `bell_toll` closer (r 60, 0.4), `footstep_stone`.

**Son Çan Avlusu (`son_can`, y +2.4, open, frame 16 m)**
* Props: `les_son_can` x1 at (41, 29.5) on the double dais (collide, bell hangs at y +4 to +10 in a collapsing bone-and-timber frame); wrecks `kc('siege-ballista-demolished')` x2, `kc('siege-catapult-demolished')` x2, `kc('siege-trebuchet-demolished')` x1 at the west and east ends; tower fragments `kc('tower-square-base')` x1 and `kc('tower-square-mid-open')` x2 in the NE corner; `kc('wall-half')` x10 as the ruined perimeter; `kg('pillar-large')` x6, `kg('column-large')` x4 (some toppled); `dg('rubble_large')` x8; `kc('flag-banner-long')` x6 (gold, torn); `gp('brazier')` x4 (bronze); `dg('barrel_large')` x4; pickups spear (33, 31), hammer (38, 27), shield (45, 31).
* High layer: a ruined rampart walkway `kc('wall-narrow')` x6 along the north edge at y +6.5 (decor); `les_balkon` x3 on the east wall (y +5.5); chain cranes `ip('psx-dungeon','chain')` x6 from the frame; fragments of floating bells `les_ucan_can` x3 cracked on the ground.
* Lights: bronze braziers x4 `lt(0xffb060, 1.4, 8, true)`; the bell flashes `lt(0xffb060, 1.0, 10)` for 0.5 s on each toll.
* VFX: `ambient_dust`, dust puff and `debris_fall` chunks (hazard), a gold shock ring (`holy_burst`, small) at the bell's base each toll, `torch_fire` sparks.
* Sound: `bell_toll` deep, positional at the bell (r 80), every 18 s with camera shake 0.15; `rubble` per chunk; `wind_loop` (r 50, 0.35).

**Çan Kulesi (`can_kulesi`, y +2.4, terrace +5.4, ceiling 18, optional)**
* Props: `kc('tower-square-base')` ring scaled as the interior shell, `kc('tower-square-mid-open')` x1, the collapsed `kc('tower-square-roof')` x1 beside it; a ruined shrine `kg('altar-stone')` x1, `gp('statue_hooded')` x2 (gold), `hw('shrine_candles')` x2; `gp('chest_gold')` (id `chest_kule`) at (59.3, 29.6) on the terrace; broken bell shards `les_ucan_can` x3 on the floor (cracked, tinted dark bronze); `dg('stairs')` decor along `Kule Merdiveni`; banners x3; `dg('barrel_small_stack')` x3.
* High layer: arrow loops and the open top (sky shows through at y 18), a hanging chain with the missing clapper (`ip('psx-dungeon','chain')` x2). Lights: bronze x2, candle gold x3 `lt(0xffd070, 0.8, 5, true)`, chest glow (`waypoint_glow` gold). VFX: dust. Sound: a muted bell hum (`gong` low, r 12), `chest_open`.

**Yıkık Geçit (`k_toll_b`, strip, ceiling 8)**
* Props: `dg('wall_broken')` x3, `kf('wall-broken')` x3 (sky gaps), `dg('rubble_large')` x4, fallen `gp('banner_blue')` x4, `hw('bone_C')` x6, `dg('sword_shield_broken')` x3, `hw('lantern_standing')` x2, violet stain decals x3.
* High layer: the first view of the golden sky through a breach at y 6 to 8. Lights: wreck fire `lt(0xff9040, 1.3, 8, true)` x1. VFX: embers. Sound: `wind_loop` rising toward the court (r 25, 0.35).

**Servis Geçidi (`kisayol`, strip, ceiling 7, skip)**
* Props: the barricade at the toll end (`dg('rubble_large')` x3, `dg('barrier_column')` x1, removed by the smash); servants' hall `dg('table_long_broken')` x2, `dg('chair')` x4, `dg('shelf_small')` x4 with `dg('plate_stack')`, `dg('barrel_small_stack')` x4, `dg('torch_mounted')` x6 every 6 m, `hw('skull_candle')` x4, `dg('stairs_wood')` decor, cobwebs (auto).
* High layer: low vaults `dg('wall_arched')` x4. Lights: torches x6 `lt(0xffa050, 1.0, 6, true)`. VFX: dust. Sound: footstep echo, `drip_loop` (r 8).

**Cesaret'in Düşüşü (`dus_meydan`, BOSS 2, y +6.0, open, broken wall 18 m)**
* Props: `les_cesaret_eli` x1 at (15.5, 29.5) on the gold-rune dais; wide steps `kc('stairs-stone')` at the east entrance; `kc('wall-corner-slant')` x4, fallen `kc('tower-square-top')` x2, broken precinct wall `kf('wall-broken')` x6 with sky gaps; wrecks `kc('siege-*-demolished')` x4; torn Kyrian banners `gp('banner_blue')` x6; `kg('fire-basket')` x6 burning, `gp('brazier')` x4 on the rune corners; Xandria `chr('Knight')` at (22, 25.5) (tint `0xf0d890`, pose `Blocking`, `show: ['1H_Sword','Round_Shield']`, scale 1.2) and the Winged Champion (scale 1.5, tint `0xffe8a0`) at (23, 33.5); Gökbekçi Devi #3 at (8, 36); spears at (23, 24) and (23, 35); fallen Kyrian dead `hw('bone_A/B/C')` x30, `dg('sword_shield_gold')` x8 lying, `dg('sword_shield_broken')` x6; broken `kg('pillar-large')` x4.
* High layer: the grand staircase flanked by `kg('pillar-obelisk')` x4 and `dg('stairs_wide')` x3 at the north end; broken balcony stubs `les_balkon` x4 at y +8 to +12 around the precinct; hanging banners x6 at y 8 to 14; the cloud sea beyond the west wall (void at y -10, `look: 'cloud'`); the huge Zolramus underside `les_zolramus_uzak` overhead (y 120 m); two drake silhouettes circling far away (decor sprites).
* Lights: wreck fires x4 `lt(0xff9040, 1.3, 8, true)`; rune glow `lt(0xe0b048, 0.9, 10)` under the Hand; necro violet pulse `lt(0x9060ff, 1.0, 9)` near Amarth.
* VFX: embers `fire_ground` x6 (decor), `death_bones` on every Land of the Dead, `buff_aura` gold on the dais.
* Sound: `wind_loop` (r 60, 0.4), `camp_crackle` x6, `bell_toll` far (event, 0.15), `choir_sting` on engage.

**Kemik Köprü (`k_kopru`, strip, ceiling 10 bone vault)**
* Props: `les_kemik_kopru` x2 end to end (8 m each, rib deck); `hw('post_skull')` x8 along both rails, `hw('lantern_standing')` x4 (green), `ip('psx-dungeon','arch')` x4 over the deck (ribs, y 0 to 6), `ip('psx-dungeon','chain')` x6 hanging from the vault.
* High layer: the underside of Zolramus as the ceiling (dark bone vault, fog white to green); hanging bone stalactites `les_zolramus_sutunu` x4 inverted at y 8 to 10.
* Lights: bone lanterns x4 `lt(0x80ff60, 1.0, 6)`. VFX: the cloud sea (`look: 'cloud'`), `ambient_shadow_wisps`, white wind streaks (`ambient_dust`). Sound: `wind_loop` loud (r 30, 0.7), bone creak (`bone_rattle`, event), flags.

**Dikişhane Girişi (`dikis_kapi`, y +14.8, ceiling 14)**
* Props: operating tables `les_ameliyat_masasi` x6 in two rows (straps, green lanterns); display vats `les_vana` x4 along the north wall; hook rails `les_et_kancasi` x10 hanging from two ceiling rails; `gp('iron_cage')` x4 each with `gp('bone_pile')`; instrument tables `gp('alchemy_table')` x3 with `ip('nocturnal-watch','ritual_dagger')` x3 and `ip('nocturnal-watch','severed_leg')` x6; `dg('shelf_small_candles')` x4, `dg('bottle_A_green')` x6 and `dg('bottle_B_green')` x6; `gp('cauldron')` x2; `gp('chains_hanging')` x14; `hw('coffin')` x4; `ip('psx-dungeon','skull_wall')` x6; `dg('barrier_corner')` x4; blood decals `hw('floor_dirt_grave')` x6 (`0x6a1a1a`); the Kudret shrine at (8.5, 16): `kg('altar-stone')` x3, `gp('crystal_purple')` x1, candles x6; orb pickup at (8.5, 11.5); three vent decals.
* High layer: the surgeons' observation gallery `les_balkon` x5 on the north and south walls at y +7 with four watching silhouettes `gp('statue_hooded')` (tint `0x7a8a60`); surgical lamps `les_ameliyat_lambasi` x3 at y 8; the hook rails at y 11 to 12.5; a hanging cage on a chain crane.
* Lights: vat glow x4 `lt(0x9aff50, 1.8, 9)`; surgical lamps x3 `lt(0xd8ff80, 2.2, 12)`; red torches x4 `lt(0xff7040, 1.0, 7, true)`.
* VFX: steam (`ambient_shadow_wisps` plus a thin `poison_cloud`), vats bubbling (`les_vana` liquid UV scroll), optional `plague_vent` hazard bursts.
* Sound: `saw_loop` distant (r 25, 0.4), `bubble_loop` x4 (vats), `drain_loop` faint, `chain_rattle` (event), `flies_loop` (r 10).

**Yaratım Odası (`vana_odasi`, y +14.8, ceiling 9, optional)**
* Props: `les_vana` x8 in two rows (4 under the dormant pack, tag `wake`), `ip('psx-dungeon','chain')` x6 (pipes), `les_et_kancasi` x4, `gp('alchemy_table')` x2 with bubbling flasks `dg('bottle_B_green')` x6, `ip('psx-dungeon','skull_wall')` x4, a blueprint wall `dg('wall_shelves')` x1.
* High layer: pipes and a catwalk `les_balkon` x1 at y +4. Lights: green x6 `lt(0x9aff50, 1.4, 7)`. VFX: bubbling, the vats crack and glow within 6 m. Sound: `bubble_loop` x4, `heartbeat_loop` (r 10, grows as the party enters).

**Kan Havuzu (`kan_havuzu`, y +14.8, ceiling 12, optional)**
* Props: the blood pool [12, 3, 18, 6] (blocked); `gp('well')` x1 as the intake; `les_et_kancasi` x6 over the pool (y 8); `gp('chains_hanging')` x6; `gp('sarcophagus')` x3 as slabs; `hw('ribcage')` x4; butcher blocks `dg('table_medium_broken')` x3; `dg('crates_stacked')` x3.
* High layer: a hook crane `ip('psx-dungeon','chain')` x4 at y 10. Lights: pool glow `lt(0xaa2020, 0.5, 8)`, green lamps x2. VFX: blood mist (`shadow_ground`, red, decor), drips. Sound: `drip_loop` (r 12), `flies_loop`.

**Ameliyat Koridoru (`k_atolye`, strip, ceiling 7)**
* Props: `dg('torch_mounted')` x6, two parked gurneys `les_ameliyat_masasi` x2 against the walls, `gp('chains_hanging')` x4, `dg('bottle_B_green')` x6 in crates, blood trail decals x5 leading east, a surgical lamp `les_ameliyat_lambasi` x1 at the end (y 5).
* Lights: torches x6 (warm, dim) plus the lamp `lt(0xd8ff80, 2.0, 10)`. VFX: steam. Sound: `saw_loop` louder toward the boss (r 30, 0.6).

**Dikiş Atölyesi (`dikis_atolye`, BOSS 3, y +17.4, ceiling 18)**
* Props: the island at (36.5, 5.5): the huge table `les_ameliyat_masasi` x1 (scale 2.5) on the platform (y +2.4), pit-lip `dg('barrier_half')` x12 around the moat (r 12.8 m), a big surgical lamp `les_ameliyat_lambasi` x1 (scale 2, y 9) above it; three creation slabs `les_ameliyat_masasi` x3 with green runes at (31, 10), (36.5, 11.5), (42, 10); `les_vana` x6 along the west and east walls; `gp('iron_cage')` x6 with bones; `hw('coffin')` x6 stacked; `ip('psx-dungeon','skull_wall')` x10; `gp('bone_pile')` x8, `ip('nocturnal-watch','severed_leg')` x8; `les_et_kancasi` x12 and radial `gp('chains_hanging')` x12 from the ceiling to the island (y 0 to 16).
* High layer: the surgeons' gallery `les_balkon` x6 around the room at y +8 with dim silhouettes; more surgical lamps x4 (y 8); hook rails `ip('psx-dungeon','chain')` x12 at y 12 to 14.
* Lights: surgical lamps x5 `lt(0xd8ff80, 2.2, 12)`; island fog glow `lt(0x9aff50, 1.8, 10)`; red torches x4; runes x3 `lt(0x9aff50, 1.0, 5)`.
* VFX: `poison_cloud` ring r 18 m (script, §5.3), `ambient_shadow_wisps`, `grave_rise` plus `add_spawn` when a creation wakes, `blink` flash on hook and escape.
* Sound: `saw_loop` (r 40, 0.5), `bubble_loop` x3, `boss_pull` on the hook, `heartbeat_loop` as creations stir.

**Yukarı Merdiven (`k_yukari`, strip, ceiling 10)**
* Props: `ip('psx-dungeon','stairs_wide')` x2 (decor), `hw('post_skull')` x6, `hw('skull_candle')` x6, violet braziers `gp('brazier')` x2, `ip('psx-dungeon','skull_wall')` x4. High layer: rib arches x3 at y 6 to 8. Lights: violet x2 `lt(0x9a60ff, 2.0, 11)`. VFX: bone dust. Sound: `choir_swell` rising as the party climbs (r 25, 0.3).

**Zolramus Kapısı (`zolramus_kapi`, y +22.6, ceiling 24)**
* Props: `les_zolramus_sutunu` x8 in two rows; `ip('psx-dungeon','arch')` x4, `ip('psx-dungeon','skull_wall')` x10, `hw('post_skull')` x4, `hw('skull_candle')` x8; `gp('brazier')` x6 (violet); `gp('crystal_purple')` x6; dark wardens `gp('statue_hooded')` x6 tinted `0x4a3a68`; `gp('sarcophagus')` x4; orb pickup at (52, 11); a violet rune circle in the centre (decor).
* High layer: the gate-hall gallery `les_balkon` x6 at y +10; black-purple banners `dg('banner_patternA_white')` x8 tinted `0x4a2870` at y 9 to 18; giant bone chandeliers `les_kemik_avize` x3 at y 16; vault ribs `ip('psx-dungeon','arch')` x6 at y 18 to 22 (decor).
* Lights: violet braziers x6 `lt(0x9a60ff, 2.0, 11)`; soul wisps x4 `lt(0x60ff90, 0.9, 6)`; chandeliers x3 `lt(0x9a60ff, 1.6, 10)`.
* VFX: `ambient_shadow_wisps`, `curse_loop` on the candles, rune pulse (0.5 Hz). Sound: `choir_swell` (r 40, 0.4), `whisper` x3 (r 14, 0.3), `bone_rattle` (event, rare), `wind_loop` fading.

**Kemik Basamaklar (`k_nef_a`, strip, ceiling 14)**
* Props: `dg('stairs_wide')` x2 (decor), `les_zolramus_sutunu` x4 flanking, skull candles x6, `gp('brazier')` x4 (violet), `ip('psx-dungeon','skull_wall')` x4. High layer: rib arches x3 spaced 5 m at y 8 to 12. Lights: violet x2, soul wisps x2. Sound: `choir_swell`.

**Kemik Nef (`kemik_nef`, y +27.8, ceiling 28)**
* Props: `les_zolramus_sutunu` x12 in two rows (the aisles); side chapels `gp('sarcophagus')` x6 in alcoves; bonecarver benches `ks('workbench')` x2 with unfinished statues `les_heykel_yarim` x4 and `hw('bone_A')` x6; `hw('post_skull')` x6; `gp('brazier')` x8 (violet); `gp('crystal_purple')` x6; dark wardens `gp('statue_hooded')` x6; orb pickup at (52.5, 26); `ip('psx-dungeon','skull_wall')` x6 on the far wall.
* High layer: the nave arcade `ip('psx-dungeon','arch')` x8 at y +12; clerestory windows `ip('psx-dungeon','windowed_wall_01')` x8 at y +16 to +22 with violet light shafts; the choir loft `les_balkon` x6 at y +9; bone chandeliers `les_kemik_avize` x4 at y 20; banners x10 at y 8 to 20.
* Lights: violet braziers x8, chandeliers x4 `lt(0x9a60ff, 1.6, 10)`, wisps x3. VFX: `ambient_shadow_wisps`, light shafts (fog sprites), `curse_loop`. Sound: `choir_swell` with a long reverb tail (r 50, 0.5), `whisper` (r 12), `bone_rattle`.

**Heykeltıraş Galerisi (`heykel_galerisi`, y +30.6 / +32.4, ceiling 22)**
* Props: unfinished statues `les_heykel_yarim` x8 and finished `gp('statue_hooded')` x10 (bone tint); `ks('workbench')` x4 and `ks('workbench-anvil')` x2 with `hw('bone_A')` x12; the mausoleum facade `kg('crypt-large')` scale 2 at the south wall; `gp('sarcophagus')` x6; `dg('stairs_wide')` x3 on the tier; shrine Koruma at (68.5, 17.5) (altar, crystal, candles); pickups hammer (70, 24), shield (75, 19).
* High layer: balconies `les_balkon` x8 along the east and west walls at y +8 to +10 with statue silhouettes; bone chandeliers `les_kemik_avize` x4; hanging half-carved statues `les_heykel_yarim` x3 from chains at y 14.
* Lights: braziers x8, chandeliers x4, shrine `lt(0x9a60ff, 1.4, 6)`. VFX: bone dust off the benches (`ambient_dust`), `ambient_shadow_wisps`. Sound: `blacksmith_hammer` faint taps (r 20, 0.3), `whisper`, `choir_swell`.

**Buzlu Merdiven (`k_cikis`, strip, ceiling 12, ice)**
* Props: `dg('stairs_wide')` x2 tinted ice, `les_buz_kristali` x4 (scale 0.6), `gp('crystal_blue')` x4, frozen wardens `gp('statue_hooded')` x2 (tint `0x9ad8ff`), hanging icicles (`gp('crystal_blue')` x6 inverted at y 8 to 10). Lights: ice crystals x3 `lt(0x80d0ff, 2.0, 12)`. VFX: `ambient_snow`. Sound: `wind_loop` loud (r 30, 0.6), `ice_creak`, `ice_chime` (event).

**Buzlu Tepe (`buz_tepe`, BOSS 4, y +36.0 / +36.4, open, no walls)**
* Props: `les_buz_kristali` x10 (6 to 10 m spires) around the rim at radius 7 tiles; Nalthor's throne `les_buz_taht` at (70.5, 51.5) on a step; `gp('crystal_blue')` x12; frozen wardens `gp('statue_hooded')` x6 kneeling in a ring at radius 5.5 tiles (tint `0x9ad8ff`, opacity 0.9); `gp('rock_cliff')` x6 on the rim (tint `0xbfe0ff`); `dg('pillar')` x8 ice-tinted colonnade stubs on the rim; the ice bridge `dg('floor_tile_large')` x2 tinted ice with `gp('crystal_blue')` x4 as rails; the exit portal at (66.5, 49.5); spear pickup (68, 38).
* High layer: floating islands `gp('rock_large')` x5 at y -10 to +20 far out (decor, slow bob); the cloud sea below (`look: 'cloud'`); an ice halo ring over the platform (decor); `les_zolramus_uzak` far below in the cloud sea (the way we came).
* Lights: ice crystals x8 `lt(0x80d0ff, 2.0, 12)` (LOD'd), throne glow `lt(0x9ad8ff, 1.4, 8)`, the cold key light (§2.3).
* VFX: `ambient_snow`, `frost_ground` ring decal under the platform, `blizzard` far (phase 3), `meteor_fall` comets (Comet Storm), shard floaters.
* Sound: `wind_loop` very loud (r 80, 0.8), `ice_creak`, `ice_chime` random, `choir_swell` under the boss music.

**Alt Kanatlar (`alt_kanat`, y +24.0, ceiling 40, exile room, no doors)**
* Props: `gp('crystal_blue')` x16 (collide; the slalom walls), `gp('rock_large')` x6 tinted ice, caged Gilded Champion `gp('iron_cage')` + `chr('Knight')` (tint `0xa8d8ff`, pose `Blocking`), ice decals along the path.
* Lights: blue crystals x6 `lt(0x60b0ff, 1.6, 8)`. VFX: `blizzard`, `ambient_snow`, `icicle_drop` hazard. Sound: `wind_loop` (r 60, 0.7), `ice_creak`, `heartbeat_loop` that quickens as the exile timer runs down.

---

## 4. TRASH

Thirteen trash types (plus boss adds and mechanic entities in §5), binding user requirement B3: 10 to 14 types, **2 to 4 telegraphed attacks each**, role mix (kick-caster, healer, brute, swarm, elite with poise), two dungeon-specific set pieces (§3.5: the Son Çan toll and the Gökbekçi Devi with the dungeon weapons). CORE_MECHANICS §16 rules apply: distinct readable windups, delayed swings, 2 to 3 hit strings, leaps and grabs, ground-telegraphed slams, enrage under 30% on the brutes, a poise bar on elites.

**Tell rule (ROADMAP F10).** `windup = clamp(0.45 + 0.25 x coef, 0.45, 1.2)` seconds, using the coef of the first hit (a multi-projectile volley uses the summed coef). Casts keep their `castTime` as the windup (the cast bar is the tell and the interrupt window). Delayed final swings of a string hold a visible 0.9 to 1.0 s glow before they land (the "delayed swing" of CORE_MECHANICS §16). Every windup has the colour pulse and wind-up sound of F10; at most 3 melee swings on the same player at once. Windups used below: coef 0.6 gives 0.60, 1.0 gives 0.70, 1.2 gives 0.75, 1.4 gives 0.80, 1.6 gives 0.85, 1.8 gives 0.90, 2.0 gives 0.95, 2.4 gives 1.05, 2.8 gives 1.15, 3.0 and up gives 1.20.

**Two small NEW ability fields (SP-P2, SP-P3, §8.2):** `string?: { hits: number; gap: number | number[]; coefMul?: number[] }` (the ability repeats its hit `hits` times, re-aimed at the target at each hit; `gap` is the pause after each hit, the last gap is the delayed swing) and the `leap(...)` builder (kind `charge` with `params.leap = 1`: a jump arc of `length` m, telegraph line plus a landing ring of radius `params.landR`, landing damage on resolve, `parryable: false`). Elite `poise`, `profile` and `perilous` are existing fields (`types/enemies.ts`, GDD_V2 §3.5 and §1.7): a poise break gives the 2.0 s window with x1.25 damage and the Kritik Vuruş finisher, with a 12 s lock on elites.

Numbers are multipliers on the level-60 baseline of GDD_CONTENT §0.3 (`monsterHP(60)` = 2246, `monsterDmg(60)` = 284); the M+ curve of CORE_MECHANICS §6 (x2.0 HP and damage at +10, after package LES-00 makes the code match it) and party scaling `1 + 0.7 (n - 1)` apply on top. Example at +10, 5 players, Tahkimli week: Kırık Kemik Savaşçısı 24,568 HP, Dikişli Öncü 32,757, Zolramus Kemik Heykeltıraşı 94,177, İskelet Canavarı 112,603.

### 4.1 Roster

| id | Turkish name | WoW model | rank / role | model (tint) | HP x / DMG x | forces | Attacks and telegraph windups (s) |
|---|---|---|---|---|---|---|---|
| `lu_kirik_savasci` | Kırık Kemik Savaşçısı | Brittlebone Warrior | trash / melee (bruiser) | `Skeleton_Minion` (`0xe8d8a0`) | 1.2 / 1.0 | 3 | Kemik Kılıcı 0.70; Parçalayıcı Vuruş 0.85, **2-hit string** with stacking bleed (dispellable); Atılış Kesiği leap 0.80 |
| `lu_kirik_buyucu` | Kırık Kemik Büyücüsü | Brittlebone Mage | trash / caster | `Skeleton_Mage` (`0xc8b8e0`) | 1.0 / 1.2 | 4 | Gölge Kıvılcımı 0.70; **Don Oku 1.8 s cast, interrupt (kick 2)**; Don Halkası nova 0.75 (anti-melee) |
| `lu_arbaletci` | Diriltilmiş Arbaletçi | Reanimated Crossbowman | trash / ranged | `Skeleton_Rogue` (`0xe8d8a0`) | 0.9 / 1.2 | 4 | Kemik Ok 0.70; Çürük Ok 0.85 poison DoT (dispellable); Çoklu Ok volley 1.10 (3 hitscan lines) |
| `lu_veba_torbasi` | Veba Torbası | Blight Bag | trash / brute, **patrols** | `M('veba_torbasi')` | 2.0 / 0.8 | 5 | Şişkin Yumruk 0.70; Kusma Dalgası cone 0.90 (poison); Yuvarlanış roll 0.85 (10 m line); İçini Boşalt on death: poison pool 4 m for 8 s |
| `lu_canavar` | İskelet Canavarı | Skeletal Monstrosity | **elite** / tank, poise 300, buster | `M('iskelet_canavari')` | 5.5 / 1.8 | 12 | Kemik Ezici **2-hit string with a delayed backhand** 0.70; Kemik Sarsıntısı ring 1.00 (knockdown); Parçalayıcı Pençe 1.20 **perilous tank buster**; Kemik Atılışı leap 0.90; enrage below 30% |
| `lu_dikisli_onder` | Dikişli Öncü | Stitched Vanguard | trash / melee | `Zombie` (`0xc8a898`) | 1.6 / 1.2 | 5 | Dikişli Pençe **3-hit string** (claw, claw, delayed lunge) 0.70; **Kaynayan Öfke 1.5 s self-enrage, interrupt (kick 1)**; Dikiş Sıçrayışı leap 0.80 |
| `lu_les_toplayici` | Leş Toplayıcı | Corpse Harvester | trash / caster | `Rogue_Hooded` (`0x7a8a60`) | 1.2 / 1.2 | 5 | Çürük Et 0.70; Et Fırlat ground circle 0.75; **Sıvı Çek 3 s channel, must interrupt (kick 2)**; Tırpan Kancası 0.80 (line, **pulls the target 4 m**) |
| `lu_et_zanaatkari` | Et Zanaatkârı | Flesh Crafter | trash / healer-support | `Barbarian` (`0xa88070`) | 1.3 / 1.0 | 5 | Satır 2-hit 0.70; Satır Fırlat line 0.80; **Et Onarımı heal 2.5 s, must interrupt (kick 2)**; Kemik Testeresi cone 0.90 (bleed) |
| `lu_zol_bekci` | Zolramus Kapı Bekçisi | Zolramus Gatekeeper | **elite** / tank, poise 240 | `Skeleton_Warrior` (`0x8a78b8`) | 2.8 / 1.4 | 7 | Zolramus Kılıcı 2-hit 0.70; **Nekrotik Ok 2 s cast (kick 2)**; Kalkan Vuruşu 0.85 (slow); Zolramus'un Gazabı 2 s self nuke r 6 (defensive or dodge) |
| `lu_zol_buyucu` | Zolramus Büyücüsü | Zolramus Sorcerer | trash / caster | `Skeleton_Mage` (`0x7a5aa8`) | 1.1 / 1.4 | 5 | Gölge Kıvılcımı 0.70; **Nekrotik Ok 2 s (kick 2)**; Gölge Kuyusu ground pool 0.80; Ruh Patlaması nova 0.85 |
| `lu_zol_heykeltiras` | Zolramus Kemik Heykeltıraşı | Zolramus Bonecarver | **elite** / melee, poise 360, buster | `Skeleton_Warrior` x1.35 (`0xe8e0c8`), two axes | 4.6 / 1.7 | 10 | Kemik Satırı **3-hit string, delayed overhead** 0.70; Kemik Mızrağı line 1.05 + bleed; Kemik Oyma 1.20 **perilous tank buster**; Sarmal Kesiş spin r 4.5 0.95; Kemik Kabuğu shield at 50% |
| `lu_zol_sifaci` | Zolramus Kemik Şifacısı | Zolramus Bonemender | trash / healer | `Skeleton_Mage` (`0x9ad8b0`) | 1.3 / 0.9 | 5 | Gölge Kıvılcımı 0.70; **Kemik Şifası heal 2.2 s (kick 2)**; Ruh Kalkanı ally shield 1.6 s (kick 1); Kemik Şarapneli nova 0.75 |
| `lu_kafatasi` | Gezgin Kafatası | (design addition: Stitchwerks "Spare Parts" stand-in) | trash / **swarm** | `Skull` x0.8 (`0xd8d0b8`) | 0.35 / 0.6 | 2 | Isırık 0.60; Kafatası Sıçraması leap 0.70; Patlayan Kafatası on death (r 2 shadow pop) |

Role mix: melee bruisers (Savaşçı, Öncü), kick-casters (Büyücü, Z.Büyücü, Toplayıcı), ranged pressure (Arbaletçi), healers (Zanaatkâr heals, Şifacı heals and shields), brutes (Veba Torbası patrol, three elites), swarm (Kafatası). Resist profiles: skeletons `R_SKELETON`; Stitchwerks flesh `R_FLESH = { poison: 0.75, shadow: 0.25, holy: -0.25 }`; Zolramus `R_NECRO = { shadow: 0.5, poison: 0.5, frost: 0.25, holy: -0.25 }` (both new constants).

### 4.2 Defs (paste into the enemy file; SP-01 in §8.2 exports the builders)

```ts
// Leş Uyanışı roster. Builders (cone, proj, aoe, line, heal, buff, passive, onDeath, charge, summonAb, bleed, poison, chill, add, boss, bp, custom)
// and constants (SKEL, MON, CHAR, GEN, GENB, ITCH, WPN, W_BLADE, A_SKEL, A_KAYKIT, A_ENEMY, A_WOLF, A_GEN, R_SKELETON) come from data/enemyKit.ts.
// NEW builder `leap(id, name, length, cd, windup, coef, anim, impact, o)` = charge(...) with params { leap: 1, landR } (SP-P3);
// NEW ability field `string` (SP-P2). `M(key)` and `MODEL` are the swap table of §2.8. Every anim string below exists on the model it is used with.
const GOLD_BONE = 0xe8d8a0, VIOLET_BONE = 0xc8b8e0;
const R_FLESH = { poison: 0.75, shadow: 0.25, holy: -0.25 };
const R_NECRO = { shadow: 0.5, poison: 0.5, frost: 0.25, holy: -0.25 };
const ROGUE_KEEP_KNIFE = ROGUE_HIDE.filter((n) => n !== 'Knife');
const A_SKULL: Anims = { idle: 'Idle', walk: 'Walk', run: 'Walk', hit: 'HitRecieve', death: 'Death' };
const leap = (id: string, name: string, length: number, cd: number, windup: number, coef: number, anim: string, impact: number, o: Ab = {}) =>
  charge(id, name, length, cd, windup, coef, anim, impact, { parryable: false, ...o, params: { leap: 1, landR: 1.8, ...o.params } });

// ---- reanimated Gökbekçi dead (Bastion and the plaza)
add({
  id: 'lu_kirik_savasci', name: 'Kırık Kemik Savaşçısı', model: SKEL('Skeleton_Minion'), scale: 1.0, tint: GOLD_BONE, role: 'melee', rank: 'trash',
  hp: 1.2, dmg: 1.0, speed: 5.9, radius: 0.55, aggro: 9, forces: 3, anims: A_SKEL, resist: R_SKELETON, ai: { bonePile: 12 }, profile: 'bruiser',
  visual: { attach: W_BLADE, hide: ['Skeleton_Minion_Cloak'], eyeEmissive: 0xa8ff60, runRef: 7 },
  basic: cone('lu_ks_chop', 'Kemik Kılıcı', 2.4, 90, 2.0, 1.0, '1H_Melee_Attack_Chop', 0.58, { windup: 0.7 }),
  abilities: [
    cone('lu_ks_rend', 'Parçalayıcı Vuruş', 2.8, 70, 9, 1.6, '1H_Melee_Attack_Slice_Diagonal', 0.38,
      { initialCooldown: 3, windup: 0.85, telegraph: true, statuses: [bleed(2, 0.25, 8)], string: { hits: 2, gap: 0.5, coefMul: [1, 0.8] } }),
    leap('lu_ks_leap', 'Atılış Kesiği', 7, 14, 0.8, 1.4, '1H_Melee_Attack_Jump_Chop', 0.5, { initialCooldown: 5, params: { landR: 1.8 } }),
  ],
});
add({
  id: 'lu_kirik_buyucu', name: 'Kırık Kemik Büyücüsü', model: SKEL('Skeleton_Mage'), scale: 1.0, tint: VIOLET_BONE, role: 'caster', rank: 'trash',
  hp: 1.0, dmg: 1.2, speed: 4.9, radius: 0.5, aggro: 12, forces: 4, anims: A_SKEL, resist: R_SKELETON, ai: { kite: [9, 16], bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Staff'), bone: 'handslot.r', pos: [0, 0, 0], rotY: Math.PI }], eyeEmissive: 0x9a60ff, runRef: 7 },
  basic: proj('lu_kb_spark', 'Gölge Kıvılcımı', 16, 20, 2.6, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    proj('lu_kb_frostbolt', 'Don Oku', 14, 22, 7, 1.8, 1.8, 'frost', 'frost_projectile', 'Spellcast_Shoot', 0.3,
      { castTime: 1.8, interruptible: true, kick: 2, initialCooldown: 2, statuses: [chill(1, 5)], sfx: 'frost_cast' }),
    aoe('lu_kb_nova', 'Don Halkası', 'self_aoe', 4.5, 0, 12, 0.75, 1.2, 'frost', 'Spellcast_Long', 0.5, { initialCooldown: 6, statuses: [chill(1, 4)], vfx: 'frost_burst' }),
  ],
});
add({
  id: 'lu_arbaletci', name: 'Diriltilmiş Arbaletçi', model: SKEL('Skeleton_Rogue'), scale: 1.0, tint: GOLD_BONE, role: 'ranged', rank: 'trash',
  hp: 0.9, dmg: 1.2, speed: 5.6, radius: 0.5, aggro: 12, forces: 4, anims: A_SKEL, resist: R_SKELETON, ai: { kite: [8, 14], bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Crossbow'), bone: 'handslot.r', pos: [-0.105, -0.01, 0], rotY: Math.PI / 2 }], eyeEmissive: 0xa8ff60, runRef: 7 },
  basic: proj('lu_ar_bolt', 'Kemik Ok', 22, 18, 2.4, 0.7, 1.0, 'physical', 'arrow_projectile', '2H_Ranged_Shoot', 0.15, { sfx: 'crossbow_shot' }),
  abilities: [
    proj('lu_ar_rot', 'Çürük Ok', 20, 18, 8, 0.85, 1.6, 'poison', 'poison_projectile', '2H_Ranged_Shoot', 0.15, { telegraph: true, initialCooldown: 4, statuses: [poison(2, 0.2, 8)] }),
    { id: 'lu_ar_volley', name: 'Çoklu Ok', kind: 'projectile', range: 18, cooldown: 12, windup: 1.1, telegraph: true, damage: { coef: 0.9, type: 'physical' },
      projectile: { speed: 30, radius: 0.6, vfx: 'arrow_projectile', count: 3, spread: 15 }, anim: '2H_Ranged_Shoot', params: { impact: 0.15, hitscan: 1 }, sfx: 'crossbow_shot' },
  ],
});
add({
  id: 'lu_veba_torbasi', name: 'Veba Torbası', model: M('veba_torbasi').model, scale: M('veba_torbasi').scale, tint: M('veba_torbasi').tint, role: 'melee', rank: 'trash',
  hp: 2.0, dmg: 0.8, speed: 3.4, radius: 0.9, aggro: 6, forces: 5, anims: M('veba_torbasi').anims, resist: R_FLESH, emissive: 0x405010, ai: { patrolMul: 0.5 }, visual: { emissiveIntensity: 0.3 },
  basic: cone('lu_vt_slam', 'Şişkin Yumruk', 2.2, 100, 2.4, 1.0, 'Attack', 0.57, { windup: 0.7 }),
  abilities: [
    cone('lu_vt_vomit', 'Kusma Dalgası', 6, 60, 10, 1.8, 'Attack', 0.5, { initialCooldown: 4, windup: 0.9, telegraph: true, parryable: false, statuses: [poison(1, 0.2, 6)] }),
    charge('lu_vt_roll', 'Yuvarlanış', 10, 16, 0.85, 1.6, 'Attack', 0.5, { initialCooldown: 7, params: { dash: 0.9 } }),
    onDeath(aoe('lu_vt_guts', 'İçini Boşalt', 'self_aoe', 4, 0, 0, 0.8, 1.4, 'poison', '', 0,
      { telegraph: true, vfx: 'poison_cloud', params: { persist: 8, tick: 1, persistCoef: 0.4 } })),
  ],
});
add({
  id: 'lu_canavar', name: 'İskelet Canavarı', model: M('iskelet_canavari').model, scale: M('iskelet_canavari').scale, tint: M('iskelet_canavari').tint, role: 'tank', rank: 'elite',
  hp: 5.5, dmg: 1.8, speed: 4.4, radius: 1.15, aggro: 10, forces: 12, anims: M('iskelet_canavari').anims, resist: R_SKELETON, ai: { bonePile: 20 }, profile: 'buster',
  poise: 300, poiseRegen: 0.1, poiseDelay: 3, hyperArmor: 0.3,
  basic: cone('lu_cn_smash', 'Kemik Ezici', 3.6, 120, 3.0, 1.0, 'Attack', 0.47, { windup: 0.7, string: { hits: 2, gap: 0.9, coefMul: [1, 1.2] } }),   // smash, then a delayed backhand
  abilities: [
    aoe('lu_cn_quake', 'Kemik Sarsıntısı', 'self_aoe', 6, 6, 13, 1.0, 2.2, 'physical', 'Attack2', 0.47, { statuses: [{ status: 'knockdown', duration: 0.8 }], vfx: 'ground_slam', sfx: 'ground_slam' }),
    cone('lu_cn_gore', 'Parçalayıcı Pençe', 5, 60, 18, 3.6, 'Attack', 0.47, { initialCooldown: 6, windup: 1.2, telegraph: true, tankBuster: true, perilous: true, parryable: false, statuses: [bleed(3, 0.3, 10)] }),
    leap('lu_cn_leap', 'Kemik Atılışı', 9, 22, 0.9, 1.8, 'Attack2', 0.5, { initialCooldown: 10, params: { landR: 3 } }),
  ],
});

// ---- Stitchwerks (flesh, green thread)
add({
  id: 'lu_dikisli_onder', name: 'Dikişli Öncü', model: MON('Zombie'), scale: 1.05, tint: 0xc8a898, role: 'melee', rank: 'trash',
  hp: 1.6, dmg: 1.2, speed: 5.2, radius: 0.6, aggro: 9, forces: 5, anims: A_ENEMY, resist: R_FLESH, visual: { eyeEmissive: 0x9aff50 }, profile: 'bruiser',
  basic: cone('lu_do_claw', 'Dikişli Pençe', 2.4, 100, 3.0, 1.0, 'Attack', 0.37, { windup: 0.7, string: { hits: 3, gap: [0.4, 0.85], coefMul: [1, 1, 1.4] } }),   // claw, claw, delayed lunge
  abilities: [
    buff('lu_do_rage', 'Kaynayan Öfke', 1.5, 16, [{ status: 'enrage', duration: 10 }], 'Attack', 0.37,
      { interruptible: true, kick: 1, initialCooldown: 4, params: { self: 1, single: 1, needAlly: 0, radius: 0.1 } }),
    leap('lu_do_hop', 'Dikiş Sıçrayışı', 8, 15, 0.8, 1.4, 'Jump', 0.5, { initialCooldown: 6, params: { landR: 2 } }),
  ],
});
add({
  id: 'lu_les_toplayici', name: 'Leş Toplayıcı', model: CHAR('Rogue_Hooded'), scale: 1.0, tint: 0x7a8a60, role: 'caster', rank: 'trash',
  hp: 1.2, dmg: 1.2, speed: 5.0, radius: 0.5, aggro: 11, forces: 5, anims: A_KAYKIT, resist: R_FLESH, ai: { kite: [7, 13] }, visual: { hide: ROGUE_KEEP_KNIFE, runRef: 6 },
  basic: proj('lu_lt_scrap', 'Çürük Et', 14, 16, 2.6, 0.7, 1.0, 'poison', 'poison_projectile', 'Throw', 0.75),
  abilities: [
    aoe('lu_lt_throw', 'Et Fırlat', 'ground_aoe', 2.5, 16, 8, 0.75, 1.2, 'poison', 'Throw', 0.75, { vfx: 'poison_cloud', params: { target: 1, persist: 4, tick: 1, persistCoef: 0.3 } }),
    { id: 'lu_lt_drain', name: 'Sıvı Çek', kind: 'custom', range: 13, cooldown: 14, initialCooldown: 5, windup: 0.5, castTime: 3.0, interruptible: true, kick: 2,
      damage: { coef: 0.55, type: 'poison' }, anim: 'Spellcast_Raise', params: { loop: 1, tick: 0.5, healMult: 2.5, impact: 0.33 } },   // handler: alias of crypt_wraith_drain (§8.3)
    line('lu_lt_hook', 'Tırpan Kancası', 12, 1.4, 20, 0.8, 1.4, 'physical', 'Throw', 0.6, { telegraph: true, initialCooldown: 9, knockback: -4 }),   // pulls the target 4 m toward the harvester
  ],
});
add({
  id: 'lu_et_zanaatkari', name: 'Et Zanaatkârı', model: CHAR('Barbarian'), scale: 1.1, tint: 0xa88070, role: 'support', rank: 'trash',
  hp: 1.3, dmg: 1.0, speed: 4.8, radius: 0.6, aggro: 11, forces: 5, anims: A_KAYKIT, resist: R_FLESH, ai: { kite: [5, 10] }, visual: { runRef: 6 },
  basic: cone('lu_ez_cleaver', 'Satır', 2.4, 90, 2.4, 1.0, '1H_Melee_Attack_Chop', 0.5, { windup: 0.7, string: { hits: 2, gap: 0.5 } }),
  abilities: [
    line('lu_ez_throw', 'Satır Fırlat', 16, 1.6, 10, 0.8, 1.4, 'physical', 'Throw', 0.6, { telegraph: true, initialCooldown: 3 }),
    heal('lu_ez_repair', 'Et Onarımı', 2.5, 12, 0.3, 'Spellcast_Raise', 0.5, { kick: 2, initialCooldown: 5 }),
    cone('lu_ez_saw', 'Kemik Testeresi', 3, 60, 11, 1.8, '1H_Melee_Attack_Slice_Horizontal', 0.4, { windup: 0.9, telegraph: true, statuses: [bleed(1, 0.25, 8)], initialCooldown: 6 }),
  ],
});

// ---- Zolramus (violet bone, the ascent)
add({
  id: 'lu_zol_bekci', name: 'Zolramus Kapı Bekçisi', model: SKEL('Skeleton_Warrior'), scale: 1.2, tint: 0x8a78b8, role: 'tank', rank: 'elite',
  hp: 2.8, dmg: 1.4, speed: 5.0, radius: 0.7, aggro: 10, forces: 7, anims: { ...A_SKEL, idle: 'Idle_Combat', walk: 'Walking_A', run: 'Running_A' }, resist: R_NECRO, ai: { bonePile: 12 }, profile: 'buster',
  poise: 240, poiseRegen: 0.1, poiseDelay: 3, hyperArmor: 0.25,
  visual: { attach: [...W_BLADE, { url: WPN('Skeleton_Shield_Large_A'), bone: 'handslot.l', pos: [0, 0.017, 0.05] }], eyeEmissive: 0xb070ff, runRef: 7 },
  basic: cone('lu_zb_slash', 'Zolramus Kılıcı', 2.8, 100, 2.6, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.3, { windup: 0.7, string: { hits: 2, gap: 0.5 } }),
  abilities: [
    proj('lu_zb_bolt', 'Nekrotik Ok', 16, 20, 8, 2.0, 2.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3,
      { castTime: 2.0, interruptible: true, kick: 2, initialCooldown: 2, statuses: [{ status: 'necrotic', duration: 8, stacks: 4 }], sfx: 'shadow_cast' }),
    cone('lu_zb_bash', 'Kalkan Vuruşu', 2.4, 90, 14, 1.6, 'Block_Attack', 0.4, { initialCooldown: 5, windup: 0.85, telegraph: true, statuses: [{ status: 'slow', duration: 2, magnitude: 0.4 }] }),
    aoe('lu_zb_wrath', 'Zolramus\'un Gazabı', 'self_aoe', 6, 6, 20, 2.0, 2.8, 'shadow', 'Block_Attack', 0.4, { initialCooldown: 8, castTime: 2.0, vfx: 'shadow_burst' }),
  ],
});
add({
  id: 'lu_zol_buyucu', name: 'Zolramus Büyücüsü', model: SKEL('Skeleton_Mage'), scale: 1.1, tint: 0x7a5aa8, role: 'caster', rank: 'trash',
  hp: 1.1, dmg: 1.4, speed: 4.9, radius: 0.5, aggro: 12, forces: 5, anims: A_SKEL, resist: R_NECRO, ai: { kite: [9, 16], bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Staff'), bone: 'handslot.r', pos: [0, 0, 0], rotY: Math.PI }], eyeEmissive: 0xb070ff, runRef: 7 },
  basic: proj('lu_zs_spark', 'Gölge Kıvılcımı', 16, 20, 2.6, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    proj('lu_zs_bolt', 'Nekrotik Ok', 16, 20, 9, 2.0, 2.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3,
      { castTime: 2.0, interruptible: true, kick: 2, initialCooldown: 3, statuses: [{ status: 'necrotic', duration: 8, stacks: 4 }], sfx: 'shadow_cast' }),
    aoe('lu_zs_well', 'Gölge Kuyusu', 'ground_aoe', 3, 18, 12, 0.8, 1.4, 'shadow', 'Spellcast_Long', 0.6, { initialCooldown: 6, vfx: 'shadow_ground', params: { target: 1, persist: 8, tick: 1, persistCoef: 0.5 } }),
    aoe('lu_zs_nova', 'Ruh Patlaması', 'self_aoe', 4.5, 0, 14, 0.85, 1.6, 'shadow', 'Spellcast_Long', 0.6, { initialCooldown: 8, vfx: 'shadow_burst' }),
  ],
});
add({
  id: 'lu_zol_heykeltiras', name: 'Zolramus Kemik Heykeltıraşı', model: SKEL('Skeleton_Warrior'), scale: 1.35, tint: 0xe8e0c8, role: 'melee', rank: 'elite',
  hp: 4.6, dmg: 1.7, speed: 5.4, radius: 0.8, aggro: 10, forces: 10, anims: { ...A_SKEL, idle: 'Idle_Combat', walk: 'Walking_A', run: 'Running_A' }, resist: R_NECRO, ai: { bonePile: 12 }, profile: 'buster',
  poise: 360, poiseRegen: 0.1, poiseDelay: 3, hyperArmor: 0.3,
  visual: { attach: [{ url: WPN('Skeleton_Axe'), bone: 'handslot.r', pos: [0, 0, 0] }, { url: WPN('Skeleton_Axe'), bone: 'handslot.l', pos: [0, 0, 0] }], eyeEmissive: 0xb070ff, runRef: 7 },
  basic: cone('lu_zh_axe', 'Kemik Satırı', 3.0, 100, 4.0, 1.0, 'Dualwield_Melee_Attack_Slice', 0.3, { windup: 0.7, string: { hits: 3, gap: [0.45, 0.95], coefMul: [1, 1, 1.5] } }),   // right, left, delayed overhead
  abilities: [
    line('lu_zh_spear', 'Kemik Mızrağı', 14, 1.6, 11, 1.05, 2.4, 'physical', '1H_Melee_Attack_Stab', 0.4, { initialCooldown: 4, statuses: [bleed(3, 0.3, 10)] }),
    cone('lu_zh_carve', 'Kemik Oyma', 4.5, 80, 16, 3.2, '1H_Melee_Attack_Chop', 0.4, { initialCooldown: 8, windup: 1.2, telegraph: true, tankBuster: true, perilous: true, parryable: false }),
    aoe('lu_zh_spin', 'Sarmal Kesiş', 'self_aoe', 4.5, 0, 16, 0.95, 2.0, 'physical', '2H_Melee_Attack_Spin', 0.4, { initialCooldown: 10 }),
    passive('lu_zh_armor', 'Kemik Kabuğu', { hpBelow: 0.5, shieldPct: 0.15, duration: 10 }),   // handler: alias of bone_golem_armor (§8.3)
  ],
});
add({
  id: 'lu_zol_sifaci', name: 'Zolramus Kemik Şifacısı', model: SKEL('Skeleton_Mage'), scale: 1.05, tint: 0x9ad8b0, role: 'healer', rank: 'trash',
  hp: 1.3, dmg: 0.9, speed: 4.9, radius: 0.5, aggro: 12, forces: 5, anims: A_SKEL, resist: R_NECRO, ai: { kite: [8, 14], bonePile: 12 },
  visual: { attach: [{ url: WPN('Skeleton_Staff'), bone: 'handslot.r', pos: [0, 0, 0], rotY: Math.PI }], eyeEmissive: 0x60ff90, runRef: 7 },
  basic: proj('lu_zsf_spark', 'Gölge Kıvılcımı', 16, 20, 2.8, 0.7, 0.8, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [
    heal('lu_zsf_mend', 'Kemik Şifası', 2.2, 9, 0.25, 'Spellcast_Raise', 0.5, { kick: 2, initialCooldown: 4 }),
    buff('lu_zsf_ward', 'Ruh Kalkanı', 1.6, 16, [{ status: 'shield', duration: 8 }], 'Spellcast_Raise', 0.5, { kick: 1, params: { shieldPct: 0.3, single: 1, radius: 14 } }),
    aoe('lu_zsf_shrap', 'Kemik Şarapneli', 'self_aoe', 4, 0, 12, 0.75, 1.2, 'physical', 'Spellcast_Shoot', 0.4, { initialCooldown: 7 }),
  ],
});
add({
  id: 'lu_kafatasi', name: 'Gezgin Kafatası', model: MON('Skull'), scale: 0.8, tint: 0xd8d0b8, role: 'swarm', rank: 'trash',
  hp: 0.35, dmg: 0.6, speed: 6.2, radius: 0.35, aggro: 10, forces: 2, anims: A_SKULL, resist: R_NECRO, visual: { eyeEmissive: 0x9aff50 },
  basic: cone('lu_kf_bite', 'Isırık', 1.8, 90, 1.6, 0.6, 'Bite_Front', 0.3, { windup: 0.6 }),
  abilities: [
    leap('lu_kf_lunge', 'Kafatası Sıçraması', 5, 9, 0.7, 0.9, 'Jump', 0.4, { initialCooldown: 3, params: { landR: 1.2 } }),
    onDeath(aoe('lu_kf_burst', 'Patlayan Kafatası', 'self_aoe', 2, 0, 0, 0.3, 0.5, 'shadow', '', 0, { telegraph: false, vfx: 'shadow_burst' })),
  ],
});
```

Notes: the `visual.hide` node names and the Barbarian / Rogue accessory names must be checked with `tools/glb-inspect.mjs` (the lists in `enemies.ts` are the source). The Skull model is tiny in the KayKit pack (0.014 m raw bounds): `scale 0.8` here assumes the builder's auto-fit used for the other KayKit monsters (check with `tools/glb-inspect.mjs` and adjust the scale constant, the def does not depend on it). The model path of NEW models is `/assets/models/gen/creatures/` (`GEN`) or `/gen/bosses/` (`GENB`); until the Blender file exists `M(key)` returns the fallback (§2.8).

### 4.3 Pack list

Pack ids `les_pNN`. `F` = front rank (sunflower offsets of `kit.ts` formations), `B` = back rank (1.25 tiles behind, away from the entry door). Forces are the sum of the members. Flags: `O` optional, `big` = designed big pull, `patrol` = loops its waypoints, `dormant` = starts as piles/vats. Pack ids are not in run order after the revision (p36 and p37 were added): the table is sorted by id, the route of §6.3 gives the order.

| pack | room | centre (tile) | composition (F / B) | forces | flags | note |
|---|---|---|---|---|---|---|
| `les_p01` | k_giris | 13.5, 57.5 | 2 Savaşçı / 1 Büyücü | 10 |  | the only pack before the plaza, flat landing above the steps |
| `les_p02` | meydan | 19, 52 | 3 Savaşçı / 1 Büyücü | 13 |  | west plaza pack, two ranged DPS on the Büyücü |
| `les_p03` | meydan | 22.5, 50 | 2 Savaşçı / 2 Arbaletçi | 14 |  | north plaza pack, pulled with p02 |
| `les_p04` | meydan | 26.5, 57 | 2 Savaşçı / 1 Büyücü, 1 Arbaletçi | 14 |  | south-east plaza pack |
| `les_p05` | meydan | 17.5, 60.8 | 1 Veba Torbası | 5 | patrol | patrol along the south wall lane (z 60.8 to 61.6), 13 m from p06 and 15 m from p04: kill it when it reaches the east end |
| `les_p06` | meydan | 23, 57.5 | 1 Canavar, 1 Savaşçı | 15 | big | first frontal check (Canavar string and leap), 14 m from p04 |
| `les_p07` | k_hasat | 31.5, 54.5 | 2 Savaşçı / 1 Arbaletçi | 10 |  | last pack before boss 1, a corridor pull |
| `les_p08` | ambar | 21.5, 44.5 | 3 Savaşçı / 1 Büyücü, 1 Arbaletçi | 17 | O | granary pack |
| `les_p09` | ambar | 25.5, 45 | 1 Canavar / 1 Büyücü | 16 | O | granary elite pack |
| `les_p10` | k_toll_a | 40.5, 43.5 | 1 Savaşçı / 1 Büyücü, 1 Arbaletçi | 11 |  | stair fight on the Çürük Merdiven (0.19 slope) |
| `les_p11` | toll_kapisi | 39.5, 39 | 2 Savaşçı / 2 Arbaletçi | 14 |  | beside Gökbekçi Devi #2, 22 m from p12 and 15 m from the p16 lane |
| `les_p12` | toll_kapisi | 45, 39.5 | 2 Savaşçı / 2 Büyücü | 14 |  | south-east corner of the gatehouse (45, 39.5), 22 m from p11, a clean standalone pull; route B still takes it |
| `les_p13` | son_can | 34, 28 | 3 Savaşçı / 1 Büyücü, 1 Arbaletçi | 17 |  | west courtyard pack |
| `les_p14` | son_can | 40.5, 31 | 1 Canavar / 2 Büyücü | 20 | big | bell centrepiece pull: Canavar and two Büyücü under the toll, the most dangerous pull of section B |
| `les_p15` | son_can | 47, 27 | 2 Savaşçı / 2 Arbaletçi, 1 Büyücü | 18 |  | east courtyard pack |
| `les_p16` | son_can | 33, 34.5 | 1 Veba Torbası | 5 | patrol | patrol along the south lane (z 34.5 to 35.2), 14 m from p14 and 15 m from p11: kill it at the entrance steps before pulling p14 |
| `les_p17` | can_kulesi | 54.5, 35 | 1 Canavar, 2 Savaşçı / 1 Arbaletçi | 22 | O | tower base elite pack, 22 forces |
| `les_p18` | k_toll_b | 27.5, 29.5 | 2 Savaşçı / 1 Büyücü, 1 Arbaletçi | 14 |  | last pack before boss 2, stair fight (0.225 slope) |
| `les_p19` | k_kopru | 15, 19.5 | (all back rank) 1 Büyücü, 2 Arbaletçi | 12 |  | ranged only on the bridge deck (0.325 slope), no knockbacks anywhere near |
| `les_p20` | dikis_kapi | 11, 14 | 3 Öncü / 1 Toplayıcı, 1 Zanaatkâr | 25 | big | with p21 = the Stitchwerks pull |
| `les_p21` | dikis_kapi | 17.5, 12 | 2 Öncü / 2 Toplayıcı, 1 Zanaatkâr | 25 | big |  |
| `les_p22` | dikis_kapi | 21, 14.8 | 2 Veba Torbası | 10 | patrol | patrol in the east lobby lane (x 21 to 23, z 14.8 to 17.4), 13.6 m from p23 and 18 m from p21 |
| `les_p23` | k_atolye | 25.5, 12.5 | 2 Öncü / 1 Toplayıcı, 1 Zanaatkâr | 20 |  | last pack before boss 3 (ramp 0.16) |
| `les_p24` | vana_odasi | 3.5, 12 | 3 Öncü / 1 Zanaatkâr | 20 | O dormant | `dormant: { kind: 'egg', wakeRadius: 6 }`, vats under each |
| `les_p25` | kan_havuzu | 10, 7 | 2 Öncü / 2 Toplayıcı, 1 Zanaatkâr | 25 | O | blood-pool pack, west of the pool |
| `les_p26` | zolramus_kapi | 53, 6 | 1 Bekçi / 2 Z.Büyücü | 17 |  | gate hall west |
| `les_p27` | zolramus_kapi | 60, 6 | 1 Bekçi / 1 Z.Büyücü, 1 Şifacı | 17 |  | gate hall east, with p26 = 5 Nekrotik Ok casters |
| `les_p28` | zolramus_kapi | 56.5, 11.5 | 1 Heykeltıraş / 1 Z.Büyücü | 15 |  | gate hall south |
| `les_p29` | k_nef_a | 56.5, 17.5 | (all back rank) 1 Z.Büyücü, 1 Şifacı | 10 |  | stairs, line-of-sight stack (0.325 slope) |
| `les_p30` | kemik_nef | 55, 23.5 | 1 Bekçi / 1 Z.Büyücü, 1 Şifacı | 17 |  | nave west |
| `les_p31` | kemik_nef | 62, 23.5 | 1 Heykeltıraş, 1 Bekçi | 17 | big | double elite, no casters, at the foot of the grand staircase (pull alone) |
| `les_p32` | heykel_galerisi | 71, 20 | 1 Heykeltıraş / 1 Z.Büyücü, 1 Şifacı | 20 |  | gallery north |
| `les_p33` | heykel_galerisi | 76, 23.5 | 1 Bekçi / 1 Z.Büyücü, 1 Şifacı | 17 |  | gallery middle |
| `les_p34` | heykel_galerisi | 77, 30.5 | 1 Heykeltıraş / 1 Z.Büyücü | 15 |  | gallery tier (+32.4) |
| `les_p35` | k_cikis | 72.5, 33.5 | (all back rank) 2 Z.Büyücü | 10 |  | last pack before boss 4, ice stairs |
| `les_p36` | zolramus_kapi | 62, 12 | 5 Kafatası | 10 |  | skull swarm, east side of the gate hall, 22 m from p28 |
| `les_p37` | can_kulesi | 57.5, 31.5 | (all back rank) 2 Arbaletçi, 1 Büyücü | 12 | O | tower-top guard: three ranged on the terrace with the chest |

Totals: mandatory **451** (31 packs), optional **112** (p08 17, p09 16, p17 22, p24 20, p25 25, p37 12), available **563**. Per section (mandatory): A Cesaret Meydanı, Nöbetçi Yolu and Hasat Yolu 81 (18.8% of 430), B Çan Kapısı to Yıkık Geçit 113 (26.3%), C Kemik Köprü 12 (2.8%), D Dikişhane 80 (18.6%), E Zolramus 165 (38.4%).

**Patrols (rewritten).** Patrol waypoints (tile coordinates, the pack spawns on the first one) run in empty lanes only: `p05` [[17.5, 60.8], [29, 60.8], [29, 61.6], [17.5, 61.6]] (the south wall of the plaza); `p16` [[33, 34.5], [50, 34.5], [50, 35.2], [33, 35.2]] (the south lane of the courtyard, between the entrance steps and the east wall); `p22` [[21, 14.8], [23, 14.8], [23, 17.4], [21, 17.4]] (the east lane of the lobby). Measured distances from each path to the nearest other pack centre: p05 13.2 m (p06) and 15.2 m (p04); p16 14.0 m (p14) and 15.2 m (p11); p22 13.6 m (p23) and 17.9 m (p21). Patrol aggro is 6 m and pack aggro 9 to 12 m, so a patrol is never a body-pull of another pack. **Content-check rule (SP-13):** every segment of a patrol stays at least 12 m from every pack centre that is not in the patrol pack's `linkedTo`, and at least 4 m from any blocked zone. The first revision's lanes ran 0 to 8 m from other packs (p05 through p03, p16 through p13 to p15, p22 through p20 and p21).

`PACKS` (paste-ready; `pk` is the NEW formation helper **SP-07**: `pk(id, roomId, cx, cz, forces, front, back, extra?)`, `front`/`back` are `[enemyId, count][]`, offsets come from the sunflower and back-rank tables in the SP-07 spec, the content check recomputes `forces`):

```ts
const KS = 'lu_kirik_savasci', KB = 'lu_kirik_buyucu', AR = 'lu_arbaletci', VT = 'lu_veba_torbasi', CN = 'lu_canavar', DO = 'lu_dikisli_onder', LT = 'lu_les_toplayici',
  EZ = 'lu_et_zanaatkari', ZB = 'lu_zol_bekci', ZS = 'lu_zol_buyucu', ZH = 'lu_zol_heykeltiras', ZF = 'lu_zol_sifaci', KF = 'lu_kafatasi';
const PACKS: PackDef[] = [
  pk('les_p01', 'k_giris', 13.5, 57.5, 10, [[KS, 2]], [[KB, 1]]),
  pk('les_p02', 'meydan', 19, 52, 13, [[KS, 3]], [[KB, 1]]),
  pk('les_p03', 'meydan', 22.5, 50, 14, [[KS, 2]], [[AR, 2]]),
  pk('les_p04', 'meydan', 26.5, 57, 14, [[KS, 2]], [[KB, 1], [AR, 1]]),
  pk('les_p05', 'meydan', 17.5, 60.8, 5, [[VT, 1]], [], { patrol: [[17.5, 60.8], [29, 60.8], [29, 61.6], [17.5, 61.6]] }),
  pk('les_p06', 'meydan', 23, 57.5, 15, [[CN, 1], [KS, 1]], [], { big: true }),
  pk('les_p07', 'k_hasat', 31.5, 54.5, 10, [[KS, 2]], [[AR, 1]]),
  pk('les_p08', 'ambar', 21.5, 44.5, 17, [[KS, 3]], [[KB, 1], [AR, 1]], { optional: true }),
  pk('les_p09', 'ambar', 25.5, 45, 16, [[CN, 1]], [[KB, 1]], { optional: true }),
  pk('les_p10', 'k_toll_a', 40.5, 43.5, 11, [[KS, 1]], [[KB, 1], [AR, 1]]),
  pk('les_p11', 'toll_kapisi', 39.5, 39, 14, [[KS, 2]], [[AR, 2]]),
  pk('les_p12', 'toll_kapisi', 45, 39.5, 14, [[KS, 2]], [[KB, 2]]),
  pk('les_p13', 'son_can', 34, 28, 17, [[KS, 3]], [[KB, 1], [AR, 1]]),
  pk('les_p14', 'son_can', 40.5, 31, 20, [[CN, 1]], [[KB, 2]], { big: true }),
  pk('les_p15', 'son_can', 47, 27, 18, [[KS, 2]], [[AR, 2], [KB, 1]]),
  pk('les_p16', 'son_can', 33, 34.5, 5, [[VT, 1]], [], { patrol: [[33, 34.5], [50, 34.5], [50, 35.2], [33, 35.2]] }),
  pk('les_p17', 'can_kulesi', 54.5, 35, 22, [[CN, 1], [KS, 2]], [[AR, 1]], { optional: true }),
  pk('les_p18', 'k_toll_b', 27.5, 29.5, 14, [[KS, 2]], [[KB, 1], [AR, 1]]),
  pk('les_p19', 'k_kopru', 15, 19.5, 12, [], [[KB, 1], [AR, 2]]),
  pk('les_p20', 'dikis_kapi', 11, 14, 25, [[DO, 3]], [[LT, 1], [EZ, 1]], { big: true }),
  pk('les_p21', 'dikis_kapi', 17.5, 12, 25, [[DO, 2]], [[LT, 2], [EZ, 1]], { big: true }),
  pk('les_p22', 'dikis_kapi', 21, 14.8, 10, [[VT, 2]], [], { patrol: [[21, 14.8], [23, 14.8], [23, 17.4], [21, 17.4]] }),
  pk('les_p23', 'k_atolye', 25.5, 12.5, 20, [[DO, 2]], [[LT, 1], [EZ, 1]]),
  pk('les_p24', 'vana_odasi', 3.5, 12, 20, [[DO, 3]], [[EZ, 1]], { optional: true, dormant: { kind: 'egg', wakeRadius: 6 } }),
  pk('les_p25', 'kan_havuzu', 10, 7, 25, [[DO, 2]], [[LT, 2], [EZ, 1]], { optional: true }),
  pk('les_p26', 'zolramus_kapi', 53, 6, 17, [[ZB, 1]], [[ZS, 2]]),
  pk('les_p27', 'zolramus_kapi', 60, 6, 17, [[ZB, 1]], [[ZS, 1], [ZF, 1]]),
  pk('les_p28', 'zolramus_kapi', 56.5, 11.5, 15, [[ZH, 1]], [[ZS, 1]]),
  pk('les_p29', 'k_nef_a', 56.5, 17.5, 10, [], [[ZS, 1], [ZF, 1]]),
  pk('les_p30', 'kemik_nef', 55, 23.5, 17, [[ZB, 1]], [[ZS, 1], [ZF, 1]]),
  pk('les_p31', 'kemik_nef', 62, 23.5, 17, [[ZH, 1], [ZB, 1]], [], { big: true }),
  pk('les_p32', 'heykel_galerisi', 71, 20, 20, [[ZH, 1]], [[ZS, 1], [ZF, 1]]),
  pk('les_p33', 'heykel_galerisi', 76, 23.5, 17, [[ZB, 1]], [[ZS, 1], [ZF, 1]]),
  pk('les_p34', 'heykel_galerisi', 77, 30.5, 15, [[ZH, 1]], [[ZS, 1]]),
  pk('les_p35', 'k_cikis', 72.5, 33.5, 10, [], [[ZS, 2]]),
  pk('les_p36', 'zolramus_kapi', 62, 12, 10, [[KF, 5]], []),
  pk('les_p37', 'can_kulesi', 57.5, 31.5, 12, [], [[AR, 2], [KB, 1]], { optional: true }),
];
```

Deterministic enemy ids follow the engine rule (`DUNGEON_ENEMY_ID_BASE + i`, packs in this order, members in order, then bosses): do not reorder the list after release.

### 4.4 Interrupt, dispel and avoid budget

| Mechanic | Where | Class | Answer |
|---|---|---|---|
| **Sıvı Çek** (3 s channel, heals the caster) | Leş Toplayıcı: 1 in p20, 2 in p21, 1 in p23, 2 in p25 | **must interrupt (kick 2)** | kick, stun, or the Boşalmış Anima orb (interrupts every tick) |
| **Et Onarımı** (2.5 s heal) | Et Zanaatkârı (p20, p21, p23, p24, p25) | must interrupt (kick 2) | kick or stun, spare kicks go here |
| **Nekrotik Ok** (2 s, 4 `necrotic` stacks) | Bekçi (p26, p27, p30, p31, p33), Z.Büyücü (every Zolramus pack) | must interrupt (kick 2) | kick each; a missed bolt is healing reduction on the tank |
| **Kemik Şifası** (2.2 s heal) | Şifacı (p27, p29, p30, p32, p33) | must interrupt (kick 2) | kick |
| **Don Oku** (1.8 s, chill) | Kırık Kemik Büyücüsü (A, B) | kick 2 | kick or take chill |
| **Kaynayan Öfke** (1.5 s self-enrage) | Dikişli Öncü | kick 1 | interrupt, otherwise a hard tank spike |
| **Ruh Kalkanı** (1.6 s ally shield) | Şifacı | kick 1 | kick or burst through |
| Bleed stacks (Parçalayıcı Vuruş, Kemik Mızrağı, Parçalayıcı Pençe, Kemik Testeresi) | Savaşçı, Heykeltıraş, Canavar, Zanaatkâr | dispellable (bleed) | dispel or defensive |
| Poison (Çürük Ok, Kusma Dalgası, Boğucu Kusma, Et Fırlat pool) | Arbaletçi, Torba, boss 1, Toplayıcı | dispellable (poison) | dispel, step out of pools |
| **Perilous tank busters** (red glyph, not parryable) | Canavar Parçalayıcı Pençe 1.2 s, Heykeltıraş Kemik Oyma 1.2 s | dodge only | dodge roll through the glyph or a major defensive |
| Frontals, strings and rings | Canavar (string, Sarsıntı r 6), Bekçi (string, Gazap r 6), Heykeltıraş (3-hit string, Mızrak line, Sarmal r 4.5), Zanaatkâr (Satır line, Testere cone) | avoid / parry the first hits | dodge the delayed last hit, parry the lights |
| Leaps | Savaşçı, Öncü, Canavar, Kafatası | avoid | step out of the landing ring (telegraphed from the windup) |
| **Tırpan Kancası** (pull 4 m) | Leş Toplayıcı | avoid | dodge, or accept the pull and step out of the pool it drags you into |
| Poise (Duruş) | Canavar 300, Bekçi 240, Heykeltıraş 360 | break for the 2.0 s window | parry the first two hits of a string (each parry +60 poise at 1 player, up to x3 at 5), heavy attacks, the hammer (instant break) |

Kick budget of the heaviest pulls: the Stitchwerks pull (p20 + p21) has 3 Toplayıcı drains (kick 2), 2 Zanaatkâr repairs (kick 2) and 5 Öncü rages (kick 1): 10 relevant casts in about 10 s, more than any party can kick. The intended answer is an **orb (Boşalmış Anima) at (8.5, 11.5)** right beside it (24% of the pack's HP and every cast interrupted for 6 s), a stun on the first Toplayıcı, and the Kudret Sunağı. The gate hall pull (p26 + p27) has 5 Nekrotik Ok casters: kick order tank-side Bekçi first.

---

## 5. BOSSES

Four bosses, strict order (the WoW original has four, so the rule "at least 3, four if WoW has four" gives four). All are `boss({...})` defs for `data/enemies.ts` (or the dungeon enemy file of SP-01) and one `BossScript` per boss in `src/ai/bosses/les.ts` (registered in `ai/bosses/index.ts`, spawn lists in `LES_SPAWNS`). Generic hits (cones, lines, projectiles, rings, strings, leaps) run through the EnemyAI ability pipeline; scripted mechanics use the `kit.ts` helpers. Arenas are the room rectangles in world metres (`cx = (x + w/2) * 4`, `home = (c + 0.5) * 4`).

**Design layers (binding user requirement B2).** Each boss is the WoW fight (kept mechanic for mechanic) plus an **Elden-Ring layer** on top:
1. a **3-hit string** with a delayed last swing (windup of the first hit by the F10 formula, 0.70 s at coef 1.0; the last hit holds a visible 0.9 to 1.0 s glow), authored with the `string` field (SP-P2);
2. a **jump / dive / blink** attack with a telegraphed landing ring (SP-P3);
3. at least one **perilous** hit (red glyph, not parryable, dodge only; `perilous: true`) besides the tank buster;
4. a **poise (Duruş) bar** with a fight-changing break. The bar uses the existing engine poise (GDD_V2 §3.4 and §3.5): the tank parries the `parryable` hits of a string (each parry on a boss is +120 poise, x(1 + 0.5 per extra party member), so +360 at 5 players), DPS heavy attacks and the dungeon hammer add the rest, a full bar opens a scripted stagger window (`c.stagger(seconds, mult, lockSec)`) with the Kritik Vuruş finisher, and a break also triggers a boss-specific consequence (new `BossScript.onPoiseBreak(c)` hook, **SP-P1**, listed per boss below). After a break the bar is locked for 25 s, so a break comes at most every ~30 s.

HP at +10, 5 players, Tahkimli week (CORE_MECHANICS §6, x2.0 at +10, party `x3.8`, valid once LES-00 has aligned `mplusHp`): Çürükkemik 1,620,805 · Amarth 1,910,844 · Dikişet 1,023,666 · Nalthor 2,815,082. Zorba week multiplies each by 1.3. Target fight lengths for a median +10 party (§6.1): 2:00, 2:20, 2:35, 3:30. Enrage timers are 1.5x to 2.2x of those. Tank busters on bosses use windup 1.2 + 0.2 = 1.4 s (the F10 cap of 1.2 s plus the red-glyph hold); everything else follows the F10 formula.

| # | id | name | arena room | hp x | dmg x | poise | enrage | loot table |
|---|---|---|---|---|---|---|---|---|
| 1 | `boss_curukkemik` | Çürükkemik | hasat_cukuru | 95 | 2.4 | 900 | 300 s | `loot_mp_les_b1` |
| 2 | `boss_hasatci_amarth` | Hasatçı Amarth | dus_meydan | 112 | 2.2 | 1000 | 330 s | `loot_mp_les_b2` |
| 3 | `boss_cerrah_dikisat` | Cerrah Dikişet | dikis_atolye | 60 (see 5.3) | 2.3 | 700 (arena stage only) | 240 s | `loot_mp_les_b3` |
| 4 | `boss_ayazbaglayan_nalthor` | Ayazbağlayan Nalthor | buz_tepe | 165 | 2.5 | 1200 | 360 s | `loot_mp_les_b4` |

### 5.1 Boss 1: Çürükkemik (Blightbone)

**Fight in one line:** a tank-and-spank with a cone that spawns worms: kill each worm before it stacks five times, keep the boss out of the gas the dead worms leave, parry the string and dodge the leap.
**Arena:** Hasat Çukuru `{ cx: 164, cz: 212, w: 56, h: 56, homeX: 170, homeZ: 212 }`, pit floor y -5.2. Boss at tile (42, 52.5) facing -90 (toward the ramp and the entry door); the corpse well (blocked pit) is at **(45.5, 52.5)**, r 1.8 tiles (7.2 m), 3.5 tiles east of the boss, so the boss spawn cell and the door-to-boss lane are free (the first revision put the pit on the boss, 1.5 tiles from its centre). Content-check rule: no boss, pack or pickup position inside a blocked zone.

```ts
boss({
  id: 'boss_curukkemik', name: 'Çürükkemik', title: 'Hasat Çukurunun Dikişli Devi',
  model: M('curukkemik').model, scale: M('curukkemik').scale, tint: M('curukkemik').tint, role: 'melee',   // fallback gen/bosses/mantar_kral, §2.8
  hp: 95, dmg: 2.4, speed: 4.4, radius: 1.7, enrage: 300, arenaR: 28, loot: 'loot_mp_les_b1', anims: M('curukkemik').anims,
  poise: 900, poiseRegen: 0.08, poiseDelay: 5, hyperArmor: 0.2, profile: 'buster',
  resist: { poison: 0.9, physical: 0.1, fire: -0.15, holy: -0.25 }, visual: { eyeEmissive: 0x9aff50, runRef: 4.4, glow: 0x9aff50 },
  basic: cone('cur_swing', 'Üçlü Pençe', 5, 110, 3.2, 1.0, 'Attack', 0.6,
    { windup: 0.7, telegraph: true, string: { hits: 3, gap: [0.45, 1.0], coefMul: [1, 1, 1.6], anims: ['Attack', 'Attack', 'Attack2'] } }),   // claw, claw, delayed overhead
  abilities: [
    cone('cur_crunch', 'Kemik Kırıcı', 7, 70, 18, 4.2, 'Attack2', 0.6, { initialCooldown: 9, windup: 1.4, telegraph: true, tankBuster: true, perilous: true, parryable: false, statuses: [{ status: 'sunder', duration: 10 }], sfx: 'boss_cast' }),
    custom('cur_retch', 'Boğucu Kusma', 20, 5, 1.8, 'Cast', { sfx: 'boss_cast', params: { impact: 1.8, target: 1 } }),
    custom('cur_leap', 'Leş Sıçrayışı', 28, 24, 1.1, 'Attack2', { initialCooldown: 16, sfx: 'boss_roar', params: { impact: 1.1, leap: 1, landR: 5 } }),
    custom('cur_burst', 'Dikişler Patlıyor', 999, 9999, 1.2, 'Enrage', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['cur_crunch', 'cur_retch', 'cur_leap']),
    bp('p2', 0.6, ['cur_crunch', 'cur_retch', 'cur_leap'], { yell: 'Hasat zamanı!' }),
    bp('p3', 0.3, ['cur_crunch', 'cur_retch', 'cur_leap'], { yell: 'Dikişlerim... çözülüyor!', ability: 'cur_burst' }),
  ],
  intro: 'Hasat zamanı geldi. Hepiniz toprağa dönecek!', death: 'Dikişlerim... çözülüyor...',
  arena: { cx: 164, cz: 212, w: 56, h: 56, homeX: 170, homeZ: 212 },
});
```

| Time (+10) | Ability | Mechanic | Kit |
|---|---|---|---|
| continuous (cd 3.2 s) | **Üçlü Pençe** (Triple Claw) | string on the tank: cone 5 m, claw (coef 1.0, windup 0.70), claw (coef 1.0, +0.45 s), **delayed overhead** (coef 1.6, 1.0 s glow, cone 4 m). The first two hits are parryable (+120 poise each x party factor), the overhead is parryable too: a parry on the delayed hit is the clean way to start the stagger | EXISTS (`cone`) + NEW `string` (SP-P2) |
| 0:05, then every 20 s (14 s below 60%, 12 s below 30%) | **Boğucu Kusma** (Heaving Retch) | 1.8 s windup, 60 degree cone 12 m at a **random player**, coef 1.3 poison, applies a 12 s poison DoT (2 stacks, **dispellable**), then spawns 2 Leş Kurdu (3 from phase 2) along the cone at 4, 7, 10 m | EXISTS (`wedge`, `spawnAdds`, `statuses`) |
| 0:09, every 18 s | **Kemik Kırıcı** (Crunch) | 1.4 s windup perilous tank buster cone 7 m, coef 4.2, `sunder` 10 s. Dodge (roll) or defensive | EXISTS (`tankBuster`, `perilous`) |
| 0:16, every 24 s | **Leş Sıçrayışı** (Carrion Leap) | **ER leap.** He crouches 1.1 s (green glow, boss roar), then jumps onto the position of a **random non-tank player**: a landing ring r 5 m (the ring is drawn on the ground from the crouch, it locks 0.5 s before impact), coef 2.2 physical + knockdown 0.8 s. In phase 2 and 3 a worm crawls out of the landing crater. Dodge-roll through the landing; do not stand in a gas pool when it lands | NEW leap handler (SP-P3), `circle` landing in the script |
| worm: every 4 s | **Kan Emme** (Blood Gorge) | each cast gives the worm +30% damage (1 stack). On the **5th stack (about 20 s after spawn)** it explodes: **Leş Patlaması**: every player gets a 30 s poison DoT (3 stacks) and a toast | **NEW** worm handler `lu_cs_gorge` (§8.3) |
| worm death | **Zehirli Gaz** (Fetid Gas) | pool r 3 for **60 s**, 0.35 coef per 0.5 s, **silences 1 s and roots 0.7 s each tick**: the tank must keep the boss off the pools; they accumulate, so kill worms on the arena rim (the pit has a 28 m radius, the well in the east corner is blocked) | EXISTS (`onDeath` aoe with `persist`); statuses on persist ticks need SP-10 |
| below 30% | **Dikişler Patlıyor** | forced cast: ring r 9 around the boss coef 2.2 (telegraphed), 4 worms at random points, `dmgMul x1.15` for the rest of the fight | EXISTS (`forceAbility`, `circle`, `dmgMul`) |
| poise break (900) | **Duruş Kırılması** | `c.stagger(3, 1.25, 25)`: 3 s on his knees, x1.25 damage, Kritik Vuruş prompt. **Consequence (`onPoiseBreak`):** the current string or cast is cancelled; if it was a **Boğucu Kusma**, he retches at his own feet: no cone, **no worms for that cast**, and the poison pool under him is dropped on himself (he takes 2% max HP) | NEW `onPoiseBreak` hook (SP-P1) |
| 5:00 | enrage | `dmgMul x1.5` then +12% / 8 s (global rule) | EXISTS |

Script (`curukkemik`): `onPhase` sets `cdOverride('cur_retch', 14)` at p2 and 12 at p3; `cur_retch.start` picks `pickPlayers(c, 1)[0]`, stores the angle and calls `wedge(c, e.x, e.z, ang, 12, 60, b.delay, 1.3, { type: 'poison', statuses: [{ status: 'poison', duration: 12, stacks: 2, magnitude: 0.3 }], name: 'Boğucu Kusma', vfxOnLand: 'poison_burst' })`; `resolve` spawns the worms with `c.spawnAdds('lu_ceset_kurdu', n, { positions, hpMult: partyHp(c), tag: 'worm' })`. `cur_leap.start` picks a non-tank with `pickPlayers(c, 1, { excludeTank: true })[0]`, draws `circle(c, p.x, p.z, 5, b.delay, 2.2, { type: 'physical', statuses: [{ status: 'knockdown', duration: 0.8 }], name: 'Leş Sıçrayışı' })` from the crouch and moves the boss to that point at resolve (`c.teleportTo` with a 0.3 s arc); in p2 and p3 `resolve` also spawns one worm there. `onPoiseBreak(c)` calls `c.cancelBusy()`, `c.stagger(3, 1.25, 25)` and, when `c.busy?.id === 'cur_retch'`, `c.cancelBusy('no_adds')`.

**Add `lu_ceset_kurdu` (Leş Kurdu):**

```ts
add({
  id: 'lu_ceset_kurdu', name: 'Leş Kurdu', model: ITCH('centipede'), scale: 0.7, tint: 0xb8c870, role: 'swarm', rank: 'trash',
  hp: 1.0, dmg: 0.8, speed: 5.0, radius: 0.5, aggro: 0, forces: 0, anims: { ...A_WOLF, spawn: 'Emerge' }, ai: { summoned: true },
  basic: cone('lu_cs_bite', 'Isırık', 2.0, 90, 1.8, 1.0, 'Bite', 0.55, { windup: 0.7 }),
  abilities: [
    { id: 'lu_cs_gorge', name: 'Kan Emme', kind: 'custom', range: 3, cooldown: 4, windup: 0.8, castTime: 0.8, anim: 'Bite', params: { impact: 0.55 } },
    onDeath(aoe('lu_cs_gas', 'Zehirli Gaz', 'self_aoe', 3, 0, 0, 0.5, 0.3, 'poison', '', 0,
      { telegraph: false, vfx: 'poison_cloud', statuses: [{ status: 'silence', duration: 1 }, { status: 'root', duration: 0.7 }], params: { persist: 60, tick: 0.5, persistCoef: 0.35 } })),
  ],
});
```

**Duties.** Tank: face him away from the group, move him out of gas, parry the first two claws and the delayed overhead when you can (a parried overhead is half the bar), a defensive for every second Kırıcı, never stand in a pool. DPS: cleave worms first (each is about 3.8 trash-HP, a 3 to 5 s kill), spread out on Kusma, dodge the leap landing, never stand in the cone; heavy attacks and the dungeon hammer feed the poise bar and a break during the Kusma windup saves a wave of worms. Healer: dispel the poison DoT, the Leş Patlaması DoT is about 7.5% max HP per second for 30 s at +10, so a missed worm is a heal check. **Interrupts: none.**
**Loot:** `loot_mp_les_b1` (§5.6): belt Dikişli Hasat Kuşağı, gloves Kan Emici Eldivenler, shield Çukur Bekçisinin Kalkanı.

### 5.2 Boss 2: Hasatçı Amarth (Amarth, the Harvester)

**Fight in one line:** a flying necromancer raises a skeleton army every 32 s, then blows it up 20 s later: kill the living minions before the Final Harvest, keep out of the corpses, kick the Volley; his hooded rider adds a scythe string, a dive and a grounded window.
**Arena:** Cesaret'in Düşüşü `{ cx: 64, cz: 120, w: 80, h: 64, homeX: 54, homeZ: 120 }`, court floor y +6.0, boss hovering at tile (13, 29.5) facing 90, hover 1.2 (melee reach), the Hand dais at (15.5, 29.5) r 3.5 tiles (+0.45 m).

```ts
boss({
  id: 'boss_hasatci_amarth', name: 'Hasatçı Amarth', title: 'Cesaret\'in Düşüşünün Hasatçısı',
  model: M('hasatci_amarth').model, scale: M('hasatci_amarth').scale, tint: M('hasatci_amarth').tint, role: 'melee', flying: true, hover: 1.2,   // fallback gen/bosses/kizil_ejder, §2.8
  hp: 112, dmg: 2.2, speed: 5.2, radius: 1.6, enrage: 330, arenaR: 32, loot: 'loot_mp_les_b2', anims: M('hasatci_amarth').anims,
  poise: 1000, poiseRegen: 0.08, poiseDelay: 5, hyperArmor: 0.2,
  resist: { shadow: 0.75, frost: 0.5, holy: -0.25, fire: -0.1 }, visual: { eyeEmissive: 0xa8ff60, glow: 0x9060ff, hoverBob: 0.2 },
  basic: cone('amr_bite', 'Kemikdiş Isırığı', 6, 110, 3.4, 1.0, 'Attack', 0.5,
    { windup: 0.7, telegraph: true, statuses: [{ status: 'tank_stack', duration: 12, stacks: 1 }], string: { hits: 2, gap: 0.8, coefMul: [1, 1.2], anims: ['Attack', 'Attack2'] } }),   // bite, then a delayed tail sweep (no stack on the second hit)
  abilities: [
    proj('amr_frostbolt', 'Don Oku', 18, 40, 7, 1.8, 2.0, 'frost', 'frost_projectile', 'Cast', 0.3, { castTime: 1.8, interruptible: true, kick: 1, initialCooldown: 3, statuses: [chill(1, 6)], sfx: 'frost_cast' }),
    proj('amr_bolt', 'Nekrotik Ok', 18, 40, 9, 1.2, 1.6, 'shadow', 'shadow_projectile', 'Cast', 0.3, { initialCooldown: 4, statuses: [{ status: 'heal_absorb', duration: 10, magnitude: 0.25 }], params: { target: 1 }, sfx: 'shadow_cast' }),
    aoe('amr_volley', 'Don Oku Yağmuru', 'self_aoe', 16, 16, 15, 2.4, 1.7, 'frost', 'Cast', 1.0, { castTime: 2.4, interruptible: true, kick: 2, initialCooldown: 8, statuses: [chill(2, 5)], vfx: 'frost_burst' }),
    custom('amr_land', 'Ölüler Diyarı', 32, 10, 1.2, 'Cast', { sfx: 'boss_cast', params: { impact: 1.2, hyperArmor: 1 } }),
    custom('amr_final_harvest', 'Son Hasat', 999, 9999, 3.0, 'Cast', { castTime: 3.0, interruptible: false, sfx: 'boss_roar', params: { impact: 3.0, hyperArmor: 1 } }),
    custom('amr_frenzy', 'Azgın Öfke', 38, 22, 0.5, 'Enrage', { sfx: 'boss_roar' }),
    custom('amr_breath', 'Nekrotik Nefes', 24, 14, 1.6, 'Cast', { sfx: 'boss_cast', params: { impact: 1.6 } }),
    custom('amr_scythe', 'Tırpan Dizisi', 8, 14, 0.85, 'Attack', { initialCooldown: 11, sfx: 'swing_heavy', params: { impact: 0.85, string: 3 } }),   // scripted 3-hit string, see below
    custom('amr_dive', 'Dalış', 40, 30, 1.6, 'Attack2', { initialCooldown: 25, sfx: 'boss_roar', params: { impact: 1.6, dive: 1, landR: 6 } }),   // phase 2 and 3
  ],
  phases: [
    bp('p1', 1.01, ['amr_frostbolt', 'amr_bolt', 'amr_volley', 'amr_land', 'amr_scythe']),
    bp('p2', 0.65, ['amr_frostbolt', 'amr_bolt', 'amr_volley', 'amr_land', 'amr_scythe', 'amr_frenzy', 'amr_breath', 'amr_dive'], { yell: 'Kemikdiş, kanlarını iç!' }),
    bp('p3', 0.3, ['amr_frostbolt', 'amr_bolt', 'amr_volley', 'amr_land', 'amr_scythe', 'amr_frenzy', 'amr_breath', 'amr_dive'], { yell: 'Hasat bitmedi!' }),
  ],
  intro: 'Cesaret Tapınağı yıkıldı! Ruhlarınızı da hasat edeceğim!', death: 'Hasat... bitmedi...',
  arena: { cx: 64, cz: 120, w: 80, h: 64, homeX: 54, homeZ: 120 },
});
```

Adds (derived from trash defs, 0 forces because boss adds are dynamic ids, corpses last 30 s so the Final Harvest can use them; `ai.summoned` adds are the `minion` target class of the dungeon spear, 60% of max HP per hit):

```ts
for (const [id, base, name] of [['lu_am_savasci', 'lu_kirik_savasci', 'Diriltilmiş Savaşçı'], ['lu_am_buyucu', 'lu_kirik_buyucu', 'Diriltilmiş Büyücü'], ['lu_am_arbaletci', 'lu_arbaletci', 'Diriltilmiş Arbaletçi']] as const)
  ENEMIES[id] = { ...ENEMIES[base], id, name, forces: 0, ai: { ...ENEMIES[base].ai, summoned: true, bonePile: 30 } };
```

| Time (+10) | Ability | Mechanic | Kit |
|---|---|---|---|
| continuous (cd 3.4 s) | **Kemikdiş Isırığı** | string on the tank: bite (coef 1.0, windup 0.70, **+1 stack of `tank_stack`**: +10% damage taken from him per stack, 12 s, max 8) then a **delayed tail sweep** (coef 1.2, 0.8 s later, 180 degrees behind-and-around, no stack). **Tank swap at 5 stacks**. Parry the bite for poise | **NEW** status `tank_stack` (SP-05); string (SP-P2); the swap prompt is the existing taunt flow |
| 0:03, every 7 s | **Don Oku** | 1.8 s cast on the tank, coef 2.0 frost, chill; kick 1 | EXISTS (`proj`, `interruptible`) |
| 0:04, every 9 s | **Nekrotik Ok** | random player, coef 1.6; **`heal_absorb`**: that player's next 25% max HP of healing is absorbed (10 s) | **NEW** status `heal_absorb` (SP-05) |
| 0:08, every 15 s | **Don Oku Yağmuru** (Frostbolt Volley, M+) | 2.4 s cast, raid-wide r 16, coef 1.7 frost, chill 2. **Must interrupt (kick 2)** or the raid takes it | EXISTS (`aoe self_aoe`, `interruptible`) |
| 0:10, every 32 s (24 s below 30%) | **Ölüler Diyarı** (Land of the Dead) | marks a point 10+ m from the boss (red circle r 3.5, small shadow damage), then **7 minions** appear over about 4 s at 0.6 s steps: 3 Savaşçı, 2 Büyücü (CC target), 2 Arbaletçi. Schedules the Harvest 20 s later. Hyper-armour: poise cannot cancel it | EXISTS (`circle`, `spawnAdds`, `schedule`, `castNow`) |
| 0:11, every 14 s | **Tırpan Dizisi** (Scythe String) | **ER string by the rider.** Hit 1: 180 degree sweep, 8 m, coef 1.6, windup 0.85; hit 2: the reverse sweep 0.5 s later, coef 1.6; **hit 3: a delayed overhead cleave** (cone 6 m, 70 degrees, coef 2.8) after a 1.0 s hold with a violet glow, **perilous** (red glyph, dodge only). Aimed at the tank, re-aimed per hit. Hits 1 and 2 are parryable | NEW scripted string (`wedge` per hit) |
| 0:30, 20 s after every Land | **Son Hasat** (Final Harvest) | 3 s cast, not interruptible. Every **corpse** (`c.dir.pilesNear`) shows a r 6 red circle (coef 1.4); on resolve every **living** minion explodes for `0.55 x n` (n up to 8) raid-wide shadow damage and is removed. DPS check: kill them before, step out of corpse circles | EXISTS (Morkan's `pilesNear` / `claimPile`); generalised as `corpseBlast` (SP-04) |
| from 65%, 0:22 then every 38 s | **Azgın Öfke** (Unholy Frenzy) | `atkMul x1.4` for 16 s, tank spike: defensive and healer cooldown | EXISTS (`atkMul`) |
| from 65%, 0:14 then every 24 s | **Nekrotik Nefes** | 1.6 s windup, then a 3 s channel: wedge 16 m 50 degrees every 0.5 s (coef 0.45 shadow) slowly turning; each hit applies **`heal_cut`** (-50% healing received, 8 s). Everyone leaves the cone; the tank turns him away. A poise break cancels the channel | EXISTS (`wedge` ticks); NEW status `heal_cut` (SP-05) |
| from 65%, 0:25 then every 30 s (never within 6 s of a Land) | **Dalış** (Dive) | **ER dive.** He climbs to 7 m for 1.6 s (his shadow circle r 6 follows the **tank** and locks 0.5 s before impact, red glyph, **perilous**), then dives: coef 3.0, ring r 6, shockwave. After landing he is **grounded for 4 s** (no flying, no casts, +25% damage taken, a free melee window). Dodge-roll through the lock, or take it on a defensive | NEW dive handler (`circle` + `setHover`) |
| passive (M+) | **İşkence Yankıları** (Tortured Echoes) | counts every minion and player death (`echo`); every 3 s (2 s below 30%) a raid pulse of `0.1 x (1 + 0.3 x echo)` shadow damage | EXISTS (`update`, `every`, `circle`) |
| poise break (1000) | **Duruş Kırılması** | `c.stagger(5, 1.4, 25)`: he is dragged to the ground for 5 s, x1.4 damage, Kritik Vuruş prompt, cannot fly. **Consequence (`onPoiseBreak`):** the Volley and the Nefes channel are cancelled (the Volley's cooldown is set to 8 s); Land and Harvest are hyper-armoured and not cancelled, so the break never skips the DPS check | NEW `onPoiseBreak` hook (SP-P1) |
| 5:30 | enrage | global | EXISTS |

Intro flavour (`onEngage`): a holy bolt from the Xandria figure hits him for -2% (VFX and floating text only).

Script skeleton:

```ts
const amarth: BossScript = {
  kite: [6, 12],
  init(c) { c.state.echo = 0; c.state.alive = 0; c.state.pDead = 0; },
  onEngage(c) { /* bossFx('holy_projectile') from the statue, floatOver(c.e, '-%2', 1), bossMsg('boss_toast', {}, { text: 'Xandria Cesaret Mızrağı\'nı fırlattı!' }) */ },
  update(c, dt) {
    const st = c.state, minions = c.adds('minion');
    st.echo += Math.max(0, st.alive - minions.length) + Math.max(0, c.playersInArena(false).filter((p) => p.isDead).length - st.pDead);
    st.alive = minions.length; st.pDead = c.playersInArena(false).filter((p) => p.isDead).length;
    every(st, 'echo', dt, c.phaseIdx >= 2 ? 2 : 3, () => { const a = c.arena; circle(c, a.cx, a.cz, a.r + 6, 0.05, 0.1 * (1 + 0.3 * st.echo), { telegraph: false, type: 'shadow', name: 'İşkence Yankıları' }); });
  },
  onPoiseBreak(c) { c.cancelBusy('amr_volley', 'amr_breath'); c.cdOverride('amr_volley', 8); c.stagger(5, 1.4, 25); c.setHover(0); c.schedule(5, () => c.setHover(1.2), 'regrounded'); },
  abilities: {
    amr_land: {
      start(c, b) { const e = c.e, p = c.randomPoint(5, { x: e.position.x, z: e.position.z, d: 10 }); b.data.px = p.x; b.data.pz = p.z; circle(c, p.x, p.z, 3.5, b.delay, 0.2, { type: 'shadow', name: 'Ölüler Diyarı', vfxOnLand: 'shadow_burst' }); },
      resolve(c, b) {
        const x = b.data.px as number, z = b.data.pz as number;
        ['lu_am_savasci', 'lu_am_savasci', 'lu_am_savasci', 'lu_am_buyucu', 'lu_am_buyucu', 'lu_am_arbaletci', 'lu_am_arbaletci'].forEach((id, i) =>
          c.schedule(0.6 * i, () => { c.spawnAdds(id, 1, { x, z, radius: 2.2, tag: 'minion' }); bossFx('death_bones', x, z, { scale: 1 }); }, 'land'));
        c.schedule(20, () => c.castNow('amr_final_harvest'), 'harvest');
      },
    },
    amr_final_harvest: { start(c, b) { /* corpseBlast(c, { r: 6, coef: 1.4, delay: b.delay }); glow living minions */ }, resolve(c) { /* n = min(8, living); raid circle 0.55 x n; remove minions; claim piles */ } },
    amr_frenzy: { resolve(c) { c.atkMul *= 1.4; c.schedule(16, () => (c.atkMul /= 1.4), 'frenzy'); floatOver(c.e, 'AZGIN ÖFKE', 1); } },
    amr_breath: { /* start: wedge telegraph toward the tank; tick(): every 0.5 s wedge(c, e.x, e.z, ang, 16, 50, 0.05, 0.45, { telegraph: false, type: 'shadow', statuses: [{ status: 'heal_cut', duration: 8, magnitude: 0.5 }] }); b.total = b.delay + 3 */ },
    amr_scythe: {   // three wedge hits at b.delay, +0.5, +1.5 (the last one is the delayed, perilous overhead)
      start(c, b) { const t = c.tank(); b.data.ang = c.angleTo(t); wedge(c, c.e.x, c.e.z, b.data.ang, 8, 180, b.delay, 1.6, { type: 'physical', name: 'Tırpan' }); },
      resolve(c, b) { const t = c.tank(); const a2 = c.angleTo(t); wedge(c, c.e.x, c.e.z, a2, 8, 180, 0.5, 1.6, { type: 'physical', name: 'Tırpan' }); c.schedule(0.5, () => wedge(c, c.e.x, c.e.z, c.angleTo(c.tank()), 6, 70, 1.0, 2.8, { type: 'physical', perilous: true, name: 'Hasat Yarması' }), 'scythe3'); },
    },
    amr_dive: {
      start(c, b) { c.setHover(7); b.data.t = c.tank(); /* follow circle r 6 on the tank, locked at delay - 0.5 s, perilous */ },
      resolve(c, b) { const t = b.data.t; circle(c, t.x, t.z, 6, 0.05, 3.0, { type: 'physical', perilous: true, name: 'Dalış' }); c.teleportTo(t.x, t.z); c.setHover(0); c.stagger(4, 1.25, 0); c.schedule(4, () => c.setHover(1.2), 'regrounded'); },
    },
  },
};
```

**Duties.** Tank: pull the Land point toward a wall, swap at 5 `tank_stack`, defensive for Frenzy, parry the bite and the first two scythe sweeps, dodge the perilous overhead and the dive. DPS: **kill the minions in the 20 s window** (casters first, CC both Büyücü), then never be in a corpse circle at the Harvest; interrupt the Volley in rotation; use the grounded windows of the dive and the poise break for burst; the dungeon spears (`dus_meydan` has two, 60% of max HP to every minion in the line) make the window comfortable. Healer: Frenzy and Breath are the two big windows; `heal_absorb` means the marked player gets a pre-heal.
**Loot:** `loot_mp_les_b2` (§5.6): two-hander Hasatçının Tırpanı, ring Ruh Hasadı Mührü, shoulders Cesaret Kanatları Omuzluğu.

### 5.3 Boss 3: Cerrah Dikişet (Surgeon Stitchflesh)

**Fight in one line:** he sits untouchable at his worktable in poison fog and raises creations; the tank aims the creations' Meat Hook across the table so he is yanked into the arena, where the party has about 20 s to burn him before he escapes back; in the arena he strings cleaver cuts, creeps sutures across the floor and leaps on his fixation target.
**Arena:** Dikiş Atölyesi `{ cx: 148, cz: 36, w: 72, h: 56, homeX: 148, homeZ: 24 }`, floor y +17.4. **Geometry in metres (the first revision mixed tiles and metres):** table island centre tile **(36.5, 5.5)** = world (148, 22); the **pit (moat) radius is 3.2 tiles = 12.8 m** (spans z 2.3 to 8.7 tiles, so it stays inside the room, whose north wall is at z 2); the **platform radius is 2.0 tiles = 8.0 m** (raised +2.4 m, unwalkable); he starts on the platform facing 0 (south). Creation slabs at tiles (31, 10), (36.5, 11.5), (42, 10) (28 m, 24 m, 28 m from the island centre). Landing point (arena middle) **(36.5, 10.2)**, just outside the pit edge (8.7).

```ts
boss({
  id: 'boss_cerrah_dikisat', name: 'Cerrah Dikişet', title: 'Dikişhanenin Efendisi',
  model: CHAR('Rogue_Hooded') /* KayKit as written; every clip below exists on it (§2.8) */, scale: 1.55, tint: 0x9aa890, role: 'melee',
  hp: 60, dmg: 2.3, speed: 5.2, radius: 1.0, enrage: 240, arenaR: 28, loot: 'loot_mp_les_b3', anims: A_KAYKIT, resist: R_FLESH,
  poise: 700, poiseRegen: 0.08, poiseDelay: 5, hyperArmor: 0.2,   // active in the arena stage only (immune at the table)
  visual: { hide: ROGUE_HIDE, attach: [{ url: '/assets/models/itch/fantasy-weapons-bits/dagger_b.glb', bone: 'handslot.r', pos: [0, 0, 0], scale: 2.2 }, { url: '/assets/models/itch/fantasy-weapons-bits/dagger_a.glb', bone: 'handslot.l', pos: [0, 0, 0], scale: 1.6 }], eyeEmissive: 0x9aff50, runRef: 7, glow: 0x9aff50 },
  basic: cone('dks_slice', 'Cerrah Dizisi', 4, 100, 3.0, 1.0, 'Dualwield_Melee_Attack_Slice', 0.3,
    { windup: 0.7, telegraph: true, string: { hits: 3, gap: [0.45, 0.95], coefMul: [1, 1, 2.4], anims: ['Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Chop', 'Dualwield_Melee_Attack_Stab'] } }),   // slice, reverse slice, delayed saw plunge (the last hit is a 6 m line, perilous)
  abilities: [
    aoe('dks_ichor', 'Mumyalama Sıvısı', 'ground_aoe', 4.5, 40, 11, 1.4, 1.2, 'poison', 'Throw', 0.6, { initialCooldown: 3, vfx: 'poison_cloud', params: { target: 1, persist: 20, tick: 1, persistCoef: 0.35 } }),
    proj('dks_needle', 'Dikiş İğnesi', 24, 40, 8, 0.6, 1.8, 'physical', 'dagger_projectile', 'Throw', 0.5, { initialCooldown: 5, statuses: [bleed(1, 0.3, 10)] }),
    proj('dks_mutilate', 'Parçalama', 20, 40, 16, 1.3, 4.0, 'physical', 'dagger_projectile', 'Throw', 0.5, { initialCooldown: 9, tankBuster: true, parryable: false, telegraph: true }),
    custom('dks_creation', 'Yaratığı Uyandır', 34, 5, 1.5, 'Spellcast_Raise', { sfx: 'boss_cast', params: { impact: 1.5 } }),
    custom('dks_hook', 'Et Kancası', 18, 11, 2.0, 'Throw', { sfx: 'boss_cast', params: { impact: 2.0 } }),
    custom('dks_sutures', 'Sürünen Dikişler', 30, 22, 1.0, 'Spellcast_Long', { initialCooldown: 14, sfx: 'boss_cast', params: { impact: 1.0 } }),   // table stage only
    cone('dks_sever', 'Etin Ayrılışı', 6, 80, 9, 4.2, 'Dualwield_Melee_Attack_Chop', 0.4, { initialCooldown: 2, windup: 1.4, telegraph: true, tankBuster: true, perilous: true, parryable: false, statuses: [bleed(2, 0.3, 8)] }),
    custom('dks_fixation', 'Hastalıklı Takıntı', 14, 4, 0.8, 'Cheer', { sfx: 'boss_cast', params: { impact: 0.8 } }),
    custom('dks_lunge', 'Cerrahi Sıçrama', 16, 99, 1.0, 'Jump_Full_Short', { sfx: 'boss_roar', params: { impact: 1.0, leap: 1, landR: 3.5 } }),   // forced at the end of a fixation (arena stage)
    custom('dks_escape', 'Kaçış', 999, 9999, 1.5, 'Jump_Full_Long', { castTime: 1.5, interruptible: false, sfx: 'boss_cast' }),
  ],
  phases: [
    bp('p1', 1.01, ['dks_ichor', 'dks_needle', 'dks_mutilate', 'dks_creation', 'dks_hook', 'dks_sutures', 'dks_sever', 'dks_fixation', 'dks_lunge']),
    bp('p2', 0.66, ['dks_ichor', 'dks_needle', 'dks_mutilate', 'dks_creation', 'dks_hook', 'dks_sutures', 'dks_sever', 'dks_fixation', 'dks_lunge'], { yell: 'İkinci yaratığı uyandırın!' }),
    bp('p3', 0.33, ['dks_ichor', 'dks_needle', 'dks_mutilate', 'dks_creation', 'dks_hook', 'dks_sutures', 'dks_sever', 'dks_fixation', 'dks_lunge'], { yell: 'Ameliyat daha bitmedi!' }),
  ],
  intro: 'Yeni bir hasta! Ne güzel... Masaya yatın!', death: 'Dikişlerim... çözülüyor... hayır...',
  arena: { cx: 148, cz: 36, w: 72, h: 56, homeX: 148, homeZ: 24 },
});
```

Construct (boss add, the hook is cast by the boss through it, so it has no ability of its own; it has poise as an elite):

```ts
add({
  id: 'lu_dikis_yaratigi', name: 'Dikiş Yaratığı', model: M('dikis_yaratigi').model, scale: M('dikis_yaratigi').scale, tint: M('dikis_yaratigi').tint, role: 'tank', rank: 'elite',
  hp: 7, dmg: 1.4, speed: 4.2, radius: 1.1, aggro: 0, forces: 0, anims: M('dikis_yaratigi').anims, resist: R_FLESH, ai: { summoned: true }, visual: { eyeEmissive: 0x9aff50 },
  poise: 300, poiseRegen: 0.1, poiseDelay: 3,
  basic: cone('lu_dy_slam', 'Yama Yumruğu', 3.6, 120, 3.0, 1.0, 'Attack', 0.47, { windup: 0.7, string: { hits: 2, gap: 0.8, coefMul: [1, 1.3] } }),   // punch, delayed second punch
  abilities: [],
});   // spawned with hpMult 7 * partyHp(c) and tag 'construct'
```

**State machine** (script `update`, `st.stage` = `'table'` or `'arena'`):

| Stage | Duration | Boss state | Active abilities | Notes |
|---|---|---|---|---|
| `table` (Tezgâh) | up to 20 s, ends early when hooked | `setImmune(true)`, on the island, `hold`, no basic, no poise | Mumyalama Sıvısı, Dikiş İğnesi, Parçalama, Yaratığı Uyandır, Et Kancası, Sürünen Dikişler | **Zehirli Sis**: every 6 s a persistent circle **r 18 m** around the island centre (coef 0.4 per second, poison); the pit is 12.8 m, so the fog covers the moat plus a 5.2 m rim and the slabs (24 to 28 m away) and the landing point (18.8 m) stay clear, so ranged DPS cannot stand on the rim |
| `arena` (Atölye) | 20 s (24 s when hooked) | vulnerable, on the floor, normal AI, poise active | Cerrah Dizisi, Etin Ayrılışı, Hastalıklı Takıntı, Cerrahi Sıçrama | fog stops, `c.stagger(3, 1.25, 12)` when he was hooked |

Transitions: `toArena(c, hookerPos | null)` teleports him to the hooking creation (or the landing point when the 20 s auto-drop fired), `setImmune(false)`, a r 5 landing slam (coef 2.0, 1.2 s telegraph at the target spot) and, if hooked, `stagger` plus `vulnerable`. `toTable` is the `dks_escape` cast (1.5 s windup, visible): after it resolves he teleports back, `setImmune(true)`, fog restarts. HP only drops in the arena stage, so effective uptime is about 55% and the table's `hp 60` already accounts for it.

**Et Kancası (Meat Hook):** `start`: for each living creation (at most 2 per cast) pick the tank (or a random player when the tank is in the line) and cast `beam(c, cx, cz, ang, 34, 3.0, b.delay, 0.7, { type: 'physical', knockback: -16, name: 'Et Kancası' })` (negative knockback = pull toward the creation, the existing HitShape rule). `resolve`: **the hook succeeds when the platform (the 8 m disc at the island centre) overlaps the beam rectangle**: `lineHit(from, ang, 34, 3.0, table, 8.0)` (NEW geometry helper in SP-04; the pad is the **platform radius, 8.0 m**, so the beam rectangle (half-width 1.5 m) widens to a 9.5 m window each side of the line through the table centre; the first revision's pad of 3.2 was neither radius and gave only 4.7 m) and `stage === 'table'` then `toArena(c, creationPos)` with the hook bonus. So the tank steps between the creation and the table, and the window is generous on purpose: the skill is being between them, not pixel aim. Other players hit are pulled to the creation (small damage); nobody can be pulled into the pit (the pull ends at the creation, away from it).

**Hastalıklı Takıntı (Morbid Fixation):** arena stage only. Picks a random non-tank within 25 m, `statusPlayer(p, 'morbid_fixation', 8)` (NEW status in SP-05: -60% move speed, takes +100% damage from the boss), and the boss chases that player (`moveOverride`, threat ignored) for 8 s. A hook that pulls the fixated player, a dungeon-hammer stun on the boss, or a poise break ends it (`clearStatusPlayer`, NEW in SP-04). **ER finish:** if the fixation ran its 8 s, he ends it with **Cerrahi Sıçrama** (leap onto the fixated player, windup 1.0 s with a ground ring r 3.5 m, red glyph, **perilous**, coef 3.0; the player who can dodge-roll through the landing takes nothing, and the fixation +100% damage rule makes a hit lethal).

**Sürünen Dikişler (Creeping Sutures, ER table-stage move):** three green thread lines (beams 3 m wide, 24 m long) are drawn from the island outward at angles spaced 120 degrees (windup 1.0 s), then **rotate 40 degrees over 2.0 s** (a slow sweep, coef 0.9 per 0.5 s touched). Players dodge by walking against the rotation or rolling; it keeps the ranged DPS off the moat's edge in the poison fog and forces the tank to place the hook lane between the lines. Cooldown 22 s, first at 0:14.

| Time (+10) | Event |
|---|---|
| 0:00 | table stage, immune, fog on |
| 0:03 | Mumyalama Sıvısı #1 (jar on a random player, puddle 20 s) |
| 0:05 | **Yaratığı Uyandır #1**: a creation rises on a slab (max alive 1 in p1, 2 in p2, 3 in p3) |
| 0:05 / 0:09 | Dikiş İğnesi (tank bleed) every 8 s / Parçalama (tank buster) every 16 s |
| 0:11 | **Et Kancası** #1 (every 18 s, 14 s in p2, 10 s in p3). Hook success: arena stage 24 s, stun 3 s, vulnerable x1.25 for 12 s |
| 0:14 | **Sürünen Dikişler** (table stage, every 22 s) |
| 0:20 | auto-drop if not hooked: arena stage 20 s, no bonus |
| arena: continuous (cd 3 s) | **Cerrah Dizisi**: slice (coef 1.0, 0.70), reverse slice (coef 1.0, +0.45 s), **delayed saw plunge** (coef 2.4, 0.95 s hold, 6 m line, perilous). The first two hits are parryable |
| arena + 2 s / + 4 s | Etin Ayrılışı (perilous tank buster, 1.4 s, cd 9) / Hastalıklı Takıntı (cd 14), then Cerrahi Sıçrama at the end of the fixation |
| arena end | **Kaçış** cast 1.5 s, back to the table |
| poise break (700, arena stage) | `c.stagger(3, 1.25, 12)`: **Kaçış is postponed by 6 s** (the arena stage lasts 6 s longer, a free extra burn window), the Fixation and any string are cancelled; **Consequence (`onPoiseBreak`)**: also drops a `vulnerable` x1.25 for the extension. Poise is not tracked at the table (immune) |
| passive | **Çürük Çürüme** (Festering Rot): every 3 s each living creation hits the raid with `0.22` poison and a 9 s poison stack; two creations alive is the intended ceiling, three is a heal check |
| 4:00 | enrage |

**Duties.** Tank: step across so the hook crosses the table, kite creations apart, parry the first two cleaver cuts and dodge the plunge, defensive for Parçalama and Sever. DPS: kill each creation fast (they stack Festering Rot), burn him only in the arena stage, cleave creations under him, stay out of the Creeping Sutures, roll through the leap. Healer: Rot ticks raid-wide, Mumyalama puddles, bleeds. **Interrupts:** none on the boss; trash in this wing needs them (§4.4).
**Loot:** `loot_mp_les_b3` (§5.6): amulet Dikişet'in Kalbi, chest Cerrah Önlüğü, tome Mumyalama Tomu.

### 5.4 Boss 4: Ayazbağlayan Nalthor (Nalthor the Rimebinder), showpiece

**Fight in one line:** a frost lich on the roof of the world: Comet Storm punishes clumping, Frozen Binds punishes dispelling next to friends, Icebound Aegis is a burst check, and **Dark Exile throws a DPS into the frozen wings** where a 50 s timer and a Siphoner decide whether they come back; his rime blade adds a 3-hit string, a blink-strike and a thrown lance.
**Arena:** Buzlu Tepe `{ cx: 284, cz: 180, w: 72, h: 72, homeX: 284, homeZ: 186 }`, summit y +36.0 (inner terrace +36.4). Round platform centre tile (70.5, 44.5) radius 7.5 tiles (30 m), void all around, one ice bridge from the north door. Nalthor at tile (70.5, 46) on the inner terrace facing 180 (north, toward the arrivals), throne behind him at (70.5, 51.5), the exit portal at (66.5, 49.5) (moved off the throne's line; the first revision put it 1.5 tiles from the throne).

```ts
boss({
  id: 'boss_ayazbaglayan_nalthor', name: 'Ayazbağlayan Nalthor', title: 'Kadim Mührün Buz Bağlayıcısı',
  model: M('ayazbaglayan').model, scale: M('ayazbaglayan').scale, tint: M('ayazbaglayan').tint, role: 'caster',   // fallback gen/bosses/golge_rahibesi, §2.8
  hp: 165, dmg: 2.5, speed: 5.0, radius: 1.1, enrage: 360, arenaR: 36, loot: 'loot_mp_les_b4', anims: M('ayazbaglayan').anims,
  poise: 1200, poiseRegen: 0.08, poiseDelay: 5, hyperArmor: 0.2,
  resist: { frost: 0.9, shadow: 0.5, fire: -0.25, holy: -0.1 }, visual: { eyeEmissive: 0x80d0ff, glow: 0x80c8ff, hoverBob: 0.1 },
  basic: cone('nal_blade', 'Don Kılıcı Dizisi', 5.5, 100, 3.4, 1.0, 'Attack', 0.5,
    { windup: 0.7, telegraph: true, string: { hits: 3, gap: [0.45, 1.0], coefMul: [1, 1, 2.6], anims: ['Attack', 'Attack', 'Attack2'] } }),   // slash, slash, delayed Rime Burst (cone 8 m, 60 degrees, perilous, then 3 ice spikes along the line)
  abilities: [
    custom('nal_comet', 'Kuyruklu Yıldız Yağmuru', 24, 9, 1.2, 'Cast', { sfx: 'frost_cast', params: { impact: 1.2 } }),
    custom('nal_aegis', 'Buzlu Kalkan', 40, 20, 1.0, 'Cast', { sfx: 'frost_cast', params: { impact: 1.0 } }),
    custom('nal_binds', 'Donmuş Bağlar', 26, 14, 1.0, 'Cast', { sfx: 'frost_cast', params: { impact: 1.0 } }),
    custom('nal_exile', 'Karanlık Sürgün', 46, 28, 2.5, 'Cast', { sfx: 'boss_cast', params: { impact: 2.5, target: 3 } }),
    custom('nal_blink', 'Don Sıçraması', 40, 28, 1.0, 'Attack2', { initialCooldown: 20, sfx: 'blink', params: { impact: 0.9 } }),   // phase 2 and 3
    custom('nal_lance', 'Kırağı Mızrağı', 40, 26, 1.2, 'Attack2', { initialCooldown: 14, sfx: 'frost_cast', params: { impact: 1.2 } }),   // phase 3
    custom('nal_winter', 'Sonsuz Kış', 999, 9999, 1.5, 'Enrage', { sfx: 'boss_roar' }),
  ],
  phases: [
    bp('p1', 1.01, ['nal_comet', 'nal_binds', 'nal_exile']),
    bp('p2', 0.7, ['nal_comet', 'nal_binds', 'nal_exile', 'nal_aegis', 'nal_blink'], { yell: 'Kırağı hepinizi çoktan bağladı.' }),
    bp('p3', 0.4, ['nal_comet', 'nal_binds', 'nal_exile', 'nal_aegis', 'nal_blink', 'nal_lance'], { yell: 'Sonsuz kış başlıyor!', ability: 'nal_winter' }),
  ],
  intro: 'Nöbetçiler donarak öldü. Siz de aynı kaderi paylaşacaksınız.', death: 'Mühür... kırılmadı... daha...',
  arena: { cx: 284, cz: 180, w: 72, h: 72, homeX: 284, homeZ: 186 },
});
```

| Time (+10) | Ability | Mechanic | Kit |
|---|---|---|---|
| continuous (cd 3.4 s) | **Don Kılıcı Dizisi** (Rime Blade String) | string on the tank: slash (coef 1.0, windup 0.70, cone 5.5 m), slash (coef 1.0, +0.45 s), **delayed Rime Burst** (coef 2.6, 1.0 s hold with a blue glow, cone 8 m, 60 degrees, **perilous**) followed by three ice spikes erupting along the line over 1.2 s (decor, telegraphed ground cracks, coef 0.8 each). The first two hits are parryable (+120 poise each, x3 at 5 players) | EXISTS (`cone`) + NEW `string` (SP-P2) |
| 0:09, every 24 s (18 s in p3) | **Kuyruklu Yıldız Yağmuru** (Comet Storm) | 1.2 s windup, 4 s channel: every 0.5 s a r 2 comet lands under **every** player (0.9 s telegraph, coef 0.7 frost, `frost_mark` 5 s: +25% frost damage taken per stack). Spread and keep moving | EXISTS (`circle` per player on a tick); NEW status `frost_mark` (SP-05) |
| 0:14, every 26 s | **Donmuş Bağlar** (Frozen Binds) | random non-tank rooted 12 s (**dispellable root**), frost DoT every 2 s (coef 0.5 on him). At 12 s, **or when it is dispelled**, a r 14 m frost nova (coef 1.6, root 3 s) bursts around him (half coef on dispel); a red follow circle warns during the last 1.5 s. The party must not stack around the bound player | EXISTS (`statusPlayer`, `circle` follow); dispel detection reads the replicated `p.statuses` (SP-10 note) |
| from 70%: first cast 20 s into phase 2, then every 40 s (32 s in p3) | **Buzlu Kalkan** (Icebound Aegis) | boss gains an absorb of 6% max HP (x party scaling, about 169k at +10) for up to 20 s: every 3 s a frost wave on the whole raid (coef 0.55); if it is not broken in 20 s it detonates (coef 3.0, raid-wide). M+: each cast adds +10% damage taken to him until the shield breaks. DPS, the **dungeon spear** (1.5% of max HP = 42k plus `weapon_mark` +25% damage taken for 10 s, about 33k more from a 13.4k DPS group: together about 45% of the absorb) and a poise break (below) end it | EXISTS (`shield` status on the boss, `circle`) |
| 0:28, then every **60 s** (50 s in p3) | **Karanlık Sürgün** (Dark Exile) | 2.5 s windup: a follow circle r 2.2 on a random **DPS** (never the tank, **never the healer**; needs at least 2 other DPS alive, otherwise the cast is skipped and retried 10 s later). A player holding `invulnerable` when it lands is skipped; anyone else is **teleported to Alt Kanatlar** with `exile_cold` for 50 s. Details below | **NEW** `banish` helper and `boss_tp` message (SP-04), status `exile_cold` (SP-05) |
| from 70%, first 0:20 into p2, every 28 s | **Don Sıçraması** (Frost Blink-Strike) | **ER blink.** He vanishes in an ice-fog puff (0.6 s tell, the destination is shown as a frost mist circle) and reappears **behind a random non-tank player**, then 0.9 s later a backhand: cone 6 m, 100 degrees, coef 2.4, red glyph, **perilous** (the target steps out or rolls through; everyone else is safe). The mist circle also gives the tank a free turn-around | NEW blink handler (`teleportTo` + `wedge`) |
| from 40%, first 0:14 into p3, every 26 s | **Kırağı Mızrağı** (Rime Lance) | **ER throw.** He raises an ice lance over his head for 1.2 s (windup glow, the line is drawn on the ground), then throws it: line 40 m x 2.4 m, coef 3.2, **perilous**, it shatters the first ice crystal it meets (decor) | EXISTS (`beam` helper) |
| from 40% | **Sonsuz Kış** (Eternal Winter) | forced cast, then every 15 s a persistent frost ring (inner radius shrinks 3 m per step from 30 m to 14 m, outer past the rim, coef 0.5 per second) closes the platform (a cancel of the previous ring each step); `icicle_drop` hazard on (interval 11) | EXISTS (`ring` with `persist`, `G.hitShapes.cancel`) |
| poise break (1200) | **Duruş Kırılması** | `c.stagger(3, 1.25, 25)`: he kneels for 3 s, x1.25 damage, Kritik Vuruş prompt. **Consequence (`onPoiseBreak`):** the current cast (Comet channel, Binds, or the Exile windup) is cancelled; **an active Icebound Aegis loses 50% of its remaining absorb** (and its next wave is skipped); a cancelled Exile goes on a 10 s cooldown. A tank who parries every string breaks the bar in two strings (2 x 360 of 1200 plus the heavies) and is then locked out for 25 s, so a break comes at most about every 30 s: a real lever that never trivialises a mechanic | NEW `onPoiseBreak` hook (SP-P1) |
| 6:00 | enrage | global | EXISTS |

**Dark Exile in detail (the showpiece mechanic).**
1. Resolve: `banish(c, p, { to: gdd(54.5, 56.5), seconds: 50, tag: 'sip:' + p.id })`: `boss_tp` message to the owning peer moves the player to the exile spawn at the south end of Alt Kanatlar (tile (54.5, 56.5), world (220, 228)); `exile_cold` slows him 25% and shows a 50 s timer toast; a `lu_siphoner` is spawned at tile (54.5, 45.5) (north end) with `hpMult 2.0` (not party-scaled: one player must kill it in 5 to 8 s at +10).
2. The room is a slalom: three crystal walls (rectangles 7 tiles wide with 3-tile gaps, alternating sides) at z 54, 51, 48 (the Siphoner stands free in the open space at z 44 to 47), `icicle_drop` hazards (interval 1.5 s, radius 2.2, coef 0.5, chill) and an `ice` floor. Path length about 70 m, so about 14 s of running.
3. The Siphoner's aura (script `update`, every 1 s while the exile is within 14 m): a r 1.2 circle on the exile, coef 0.2 shadow, `slow` 0.5 for 1.4 s ("Zayıflatma").
4. When the Siphoner dies, the caged **Altın Şampiyon** (decor) is freed: the exile gets `champion_boon` (+100% crit chance, 40 s, SP-05) and a second `boss_tp` returns him to tile (70.5, 40.5) (north edge of the platform, inside the safe zone).
5. At 50 s without a return, `circle(c, p.x, p.z, 1.2, 0.05, 99, { type: 'true', telegraph: false })` kills him (the death penalty applies). The tank, healer or party can brez as usual; a dead exile is revived at the Alt Kanat spawn.
6. Counters: immunity at the moment the circle lands (class immunities, any `invulnerable` status) skips the exile and the party sees a toast. Otherwise the exile is out for about 25 s (14 s run, 8 s Siphoner, 3 s portal): plan the Aegis burst for when he returns with `champion_boon` (+100% crit for 40 s).
7. **Eligibility (fixes the first revision):** the pick excludes the tank and the healer. With fewer than 2 other DPS alive the Exile is skipped, so it can never remove the healer from a fight that needs one and never wipes the party by itself. (The healer-exile variant of the WoW fight is not used: no mechanic here protects an exiled healer.)
8. **Kill-time re-derivation.** Party damage units: 3 DPS at 1.0, tank 0.7, healer 0.35, total 4.05. One Exile removes one DPS for about 25 s, so with the 60 s interval the lost share is 25/60 x 1/4.05 = 10.3% of party damage; the returning DPS has `champion_boon` for the remaining ~35 s of the window (+100% crit chance is worth about +30% damage at a 30% base crit, 1.5 crit multiplier), which gives back 35/60 x 1/4.05 x 0.30 = 4.3%: a **net loss of about 6% at 60 s and 7.5% at 50 s**. The 3:30 target therefore needs about 14.3k group DPS without the Exile (2,815,082 / 197 s), 13.4k with it; the first revision's 3:30 assumed the Exile cost nothing. (The critic's "about 20%" is the DPS-only share at the old 46 s interval, 28/46/3 = 20%; counting tank and healer damage it is 15%, and with the 60 s interval plus the boon the net is 6%, which is why the fix here is the interval plus the eligibility rule rather than a longer kill time.)

Alt Kanat props: crystals `gp('crystal_blue')` (collide), the cage `gp('iron_cage')` with the frozen champion (KayKit Knight tint `0xa8d8ff`, pose `Blocking`, decor only). The Siphoner:

```ts
add({
  id: 'lu_siphoner', name: 'Zolramus Emici', model: SKEL('Skeleton_Mage'), scale: 1.3, tint: 0x7a5aa8, role: 'caster', rank: 'elite',
  hp: 2.0, dmg: 1.0, speed: 0, radius: 0.7, aggro: 0, forces: 0, ccImmune: true, anims: A_SKEL, resist: R_NECRO, ai: { summoned: true, stationary: true },
  visual: { attach: [{ url: WPN('Skeleton_Staff'), bone: 'handslot.r', pos: [0, 0, 0], rotY: Math.PI }], eyeEmissive: 0xb070ff },
  basic: proj('lu_sip_bolt', 'Ruh Emme', 16, 24, 2.4, 0.7, 0.8, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
  abilities: [],
});   // spawned by banish() with hpMult 2.0 (NOT multiplied by partyHp) and tag 'sip:<playerId>'; the Enfeeble aura lives in the boss script
```

**Duties.** Tank: face him away, parry the first two blade hits (a clean parry chain breaks his poise and cancels a Comet, Binds or Exile), dodge the Rime Burst, the blink backhand and the lance, keep the boss on the platform centre so the closing ring hits last. DPS: spread for Comet, stay off the bound player, burn the Aegis with cooldowns and the spear, the exiled DPS kills the Siphoner then returns with a crit buff (use it for the next burst), step out of the blink backhand. Healer: dispel Binds only when the target is isolated, Comet and Aegis waves are the raid damage, the Exile never removes you, the exiled DPS is out of healing range for 25 s.
**Loot:** `loot_mp_les_b4` (§5.6): staff Ayazbağlayan'ın Asası, helm Kırağı Taçı, ring Sürgün Mührü, one extra item, the mount Kemikdiş Dizginleri (chance 5%).

### 5.5 Kit coverage matrix (what exists, what is NEW)

| Mechanic | Exists in `ai/bosses/kit.ts` or the controller | NEW (shared in §8.2) |
|---|---|---|
| telegraph shapes (circle, ring, beam, band, wedge), persistent zones, charge lines | yes (`circle`, `ring`, `beam`, `band`, `wedge`, `zone`, `dashLine`) | none |
| intermission (immune boss, scripted phase) | yes (`setImmune`, `freeze`, `phaseLocked`, `endMechanicPhase`; Azrakel and Ignaroth use it) | an `intermission(c, opts)` wrapper is optional (SP-04) |
| soak | ad hoc in `dokumhane.ts` (`ignaroth_meteor`) | `soakCircle` helper (SP-04); not used by this dungeon |
| spread / marks | ad hoc in `kemik.ts` (`azrakel_soul_reap`) | `markSpread` helper (SP-04); this dungeon uses per-player comets and the Binds nova |
| tank swap stack | only `sunder` (refreshes, no stacks) | **`tank_stack` status** (Amarth) |
| adds waves, tracked adds, corpses | yes (`spawnAdds`, `adds(tag)`, `dir.pilesNear`, `claimPile`) | `corpseBlast` helper (Amarth) |
| pulls (hooks) and knockbacks | yes (negative `knockback`, `boss_pull`) | `lineHit` geometry helper (Dikişet) |
| rotating or closing hazards | yes (`ignaroth_flame_walls` pattern, `ring` with `persist`) | none |
| banish to another room and back | none | **`banish` + `boss_tp`** (Nalthor) |
| heal-reduction and heal-absorb debuffs | `necrotic` (stacks), `grievous` (flat 50%) exist as affix statuses | `heal_cut`, `heal_absorb` (Amarth) |
| prison / breakable mechanic entity | yes (`trapPlayer`, `spawnMech`) | none |
| scripted state machine with stages (table / arena) | pattern exists (Zakhar ritual, Kevvas rifts) | none; `BossHandler.usable` gates abilities per stage |
| poise bar, parry, stagger window | yes (engine poise `Combat.addStagger`, `c.stagger(seconds, mult, lock)`, `poise:break`, Kritik Vuruş, GDD_V2 §3.4 and §3.5) | `BossScript.onPoiseBreak(c)` hook plus `c.cancelBusy(...)` (**SP-P1**) |
| attack strings, delayed swings | profile `bruiser` (3 lights and a heavy) exists in GDD_V2 §1.7 as a data hint | `EnemyAbility.string` (**SP-P2**) |
| leaps, dives, blinks with a landing ring | `charge` kind exists (line dash); boss `teleportTo` is ad hoc in the kit | `leap` builder, `c.teleportTo`, `c.setHover` (**SP-P3**, SP-04) |

### 5.6 Loot tables and named items (CORE_MECHANICS §15, binding user requirement B5)

Personal loot per boss kill: every player gets **1 guaranteed item** from the boss's own table (70% smart loot: main stat and armour type of the player's spec; the slot comes from the table's focus list), a chance for a second item, and a **named item roll**: each boss has three named, build-defining legendaries; the chance per player per kill is `uniqueChance` and the three are weighted equally. The Mythic+ chest ilvl rule (`chestItemLevel`, CORE_MECHANICS §4.4) sets the item level of everything that drops here.

```ts
// data/loot.ts
loot_mp_les_b1: { focus: ['gloves', 'belt', 'boots', 'shield', 'sword1h'], setChance: 0.15, secondChance: 0.2, uniqueIds: ['leg_les_curukkemik', 'leg_les_kanemici', 'leg_les_cukur_kalkan'], uniqueChance: 0.14 },
loot_mp_les_b2: { focus: ['axe2h', 'ring', 'amulet', 'shoulders', 'dagger'], setChance: 0.15, secondChance: 0.2, uniqueIds: ['leg_les_amarth', 'leg_les_ruh_hasadi', 'leg_les_kanat_omuz'], uniqueChance: 0.14 },
loot_mp_les_b3: { focus: ['chest', 'legs', 'tome', 'wand', 'gloves'], setChance: 0.15, secondChance: 0.2, uniqueIds: ['leg_les_dikisat', 'leg_les_onluk', 'leg_les_mumya_tomu'], uniqueChance: 0.14 },
loot_mp_les_b4: { focus: ['helm', 'staff', 'chest', 'ring', 'sword1h', 'axe2h', 'wand'], setChance: 0.25, extraItems: 1, secondChance: 0.3, uniqueIds: ['leg_les_nalthor', 'leg_les_ayaz_tac', 'leg_les_surgun_muhru'], uniqueChance: 0.2 },
```

Expected named drops per full clear (5 players, 4 bosses): 5 x (0.14 x 3 + 0.2) = about 3.1 named items for the whole party, roughly one per player every 1.6 runs: enough to chase a build, not enough to flood. Signature items (`u({...})` in `data/uniques.ts`, `minItemLevel: 63`, `source: 'Leş Uyanışı (Mitik+)'`; numbers are starting points for SimBench; each `special.id` needs a handler in the combat module, the new specials are the shared package **SP-L1**):

| id | Name | Base | Fixed affixes (starting values) | Special (`desc`, `params`) and the build it defines |
|---|---|---|---|---|
| **Boss 1 Çürükkemik** | | | | |
| `leg_les_curukkemik` | Dikişli Hasat Kuşağı | `belt_heavy` | `maxHpPct` 8-10%, `str` 25-35, `resAll` 6-8% | "Öldürdüğün düşman 4 m çevreye Çürük Bulutu bırakır (saniyede %60 zehir hasarı, 6 sn, en fazla 3 bulut)." `{ radius: 4, coef: 0.6, duration: 6, max: 3 }`. **Build:** cleave and kill-chain melee, any class that kills packs fast |
| `leg_les_kanemici` | Kan Emici Eldivenler | `gloves_heavy_t3` | `critChance` 3-4%, `str` 20-30, `vit` 15-20 | "Zehir ve kanama etkilerin, hedefin canı %30'un altındayken %60 daha hızlı tikler ve kritik vurabilir; bir etki düşmanı öldürürse kalan süresi en yakın düşmana geçer." `{ hpBelow: 0.3, tickMul: 1.6, canCrit: 1, transfer: 1 }`. **Build:** DoT spreaders (Azap, Suikastçı, Kasap bleed): the execute phase of every pack becomes a chain reaction |
| `leg_les_cukur_kalkan` | Çukur Bekçisinin Kalkanı | `shield_t3` | `armorPct` 60-80%, `blockChance` 5%, `maxHp` 150-220 | "Zehir ve gölge havuzlarının içindeyken aldığın hasar %30 azalır ve saniyede %1.5 maks can yenilersin; engellenen her vuruş 4 m çevreye Çürük Bulutu bırakır (en fazla 2)." `{ dr: 0.3, regen: 0.015, cloudOnBlock: 1, max: 2 }`. **Build:** block tanks that fight in their own pools (Koruyucu, Demci): turns the dungeon's pool mechanics into sustain |
| **Boss 2 Hasatçı Amarth** | | | | |
| `leg_les_amarth` | Hasatçının Tırpanı | `axe2h_t4` | `weaponMax` (80-100% local), `critDamage` 25-35%, `str` 25-35 | "Kritik vuruşlar hedefe İşkence Yankısı yükü verir; 5. yükte hedefin çevresinde %200 gölge hasarı patlar (3 sn bekleme)." `{ stacks: 5, coef: 2.0, icd: 3 }`. **Build:** crit two-handers |
| `leg_les_ruh_hasadi` | Ruh Hasadı Mührü | `ring_gold` | `damagePct` 8-12%, `critChance` 2-3%, `int` or `str` 15-20 | "Bir düşmanı öldürdüğünde 1 Ruh Hasadı yığını kazanırsın (en fazla 8, 20 sn). 8 yığında bir sonraki yeteneğin %100 daha fazla gölge hasarı verir ve tüm yığınları harcar." `{ max: 8, dur: 20, bonus: 1.0, school: 'shadow' }`. **Build:** pack-clearing casters and minion classes (Azap, Ordu Efendisi, Kemik Muhafızı) that turn every trash pull into a boss-burst on the last target |
| `leg_les_kanat_omuz` | Cesaret Kanatları Omuzluğu | `shoulders_medium_t3` (base created by LES-08 if missing) | `dex` 20-30, `speedRating` (tertiary), `critChance` 2-3% | "Yuvarlanmadan sonra 3 sn %25 hareket hızı kazanırsın ve bir sonraki saldırın arkadan sayılır (+%30 hasar, +%15 kritik); 5 sn bekleme." `{ speed: 0.25, dur: 3, backstab: 1, icd: 5 }`. **Build:** the Elden Ring dodge-roll playstyle (Gölge, Suikastçı, Kılıç Ustası): the roll becomes the damage button |
| **Boss 3 Cerrah Dikişet** | | | | |
| `leg_les_dikisat` | Dikişet'in Kalbi | `amulet_ancient` | `maxHpPct` 8-10%, `vit` 20-30, `critChance` 3-4% | "Canın %40'ın altına düşünce %50 maks can kalkanı ve 6 sn Dikiş Hırsı (+%20 hasar). 90 sn bekleme." `{ hpBelow: 0.4, shieldPct: 0.5, dmg: 0.2, dur: 6, icd: 90 }`. **Build:** any, a panic button that doubles as a burst window |
| `leg_les_onluk` | Cerrah Önlüğü | `chest_heavy_t3` | `maxHpPct` 10-14%, `vit` 25-35, `armorPct` 30-40% | "Aldığın hasarın %30'u hemen yerine 8 sn boyunca yayılarak tikler (Dikiş); bu sırada tüm iyileştirmeler %15 artar. Biriken hasar maks canın %25'ini geçemez." `{ defer: 0.3, over: 8, healMul: 1.15, cap: 0.25 }`. **Build:** stagger tanks (Demci, Savaş Lordu) and self-healers: tank busters become a healing check instead of a death |
| `leg_les_mumya_tomu` | Mumyalama Tomu | `tome_t4` | `damagePct` 12-16%, `int` 20-30, `castSpeed` 8-10% | "Hedefte 3 farklı hasar-zamanla etkisi (zehir, kanama, yanma, gölge) varken o hedefe %20 fazla hasar verirsin; her yeni etki türü DoT'larının süresini %10 uzatır (en fazla 3)." `{ kinds: 3, dmg: 0.2, ext: 0.1 }`. **Build:** multi-DoT casters (Azap, Yıkım, Gölge): rewards a rotation that keeps three different DoTs up |
| **Boss 4 Ayazbağlayan Nalthor** | | | | |
| `leg_les_nalthor` | Ayazbağlayan'ın Asası | `staff_t4` | `weaponMax` (80-100% local), `frostDamagePct` 20-30%, `int` 25-35 | "Buz hasarın Kırağı Damgası uygular (3 yığın); 3 yığındaki düşman 1.5 sn donar (8 sn bekleme)." `{ stacks: 3, freeze: 1.5, icd: 8 }`. **Build:** frost mages |
| `leg_les_ayaz_tac` | Kırağı Taçı | `helm_light_t3` | `int` 20-30, `cdr` 6-8%, `resFrost` 20% | "Donmuş veya Kırağı Damgalı düşmanlara hasarın %30 artar; bir düşman donduğunda 8 m çevresindeki diğer düşmanlar 1 Kırağı Damgası alır (2 sn bekleme)." `{ frozenDmg: 0.3, spreadR: 8, icd: 2 }`. **Build:** AoE freeze (Buz, Ejderhasoy) in M+ pulls: one freeze becomes a pack-wide mark |
| `leg_les_surgun_muhru` | Sürgün Mührü | `ring_iron` | `maxHpPct` 6-8%, `vit` 15-25, `resAll` 5-6% | "Ölümcül hasar aldığında ölmek yerine 2 sn dokunulmaz olur, %30 maks canla kalırsın ve 12 m çevredeki düşmanlar 3 sn yavaşlar; 180 sn bekleme." `{ invuln: 2, healPct: 0.3, slowR: 12, slow: 3, icd: 180 }`. **Build:** push-your-key survivors: a free death-save per key that does not cost the +15 s penalty (the penalty applies to deaths only) |
| mount `mount_kemikdis` | Kemikdiş'in Dizginleri | n/a | n/a | Nalthor, 5%. If the mount system does not exist yet, ship the title "Hasatçı Avcısı" instead |

Rarity beams and sounds follow §15 (legendary: orange pillar, fanfare, toast); the named items show the dungeon name as `source`. Base ids follow the pattern `<slot>_<armor>_t<tier>` seen in `data/uniques.ts`; LES-08 creates a base when one is missing.

---

## 6. MYTHIC+ TUNING

Rules used: CORE_MECHANICS §6 (HP and damage x2.0 at +10, then x1.10 per level, Tahkimli trash +20% HP and +30% damage, Zorba bosses +30% HP and +15% damage, party HP `1 + 0.7 (n - 1)`), GDD_CONTENT §5.7 (+2 at 80% and +3 at 60% of the timer, +15 s per death), §0.4 (forces, summoned adds give 0). **Every HP figure in this document assumes the CORE_MECHANICS curve; the code today (`data/mythicAffixes.ts`: `mplusHp(L) = 1.1^(L-1)`, x2.36 at +10 and x4.18 at +15) does not match it. Package LES-00 (§8.1) fixes the code first**, so the numbers below stay valid (the other option, lowering all four boss `hp` multipliers and the §6.7 tables by about 15%, is not taken: the curve change also keeps the other 7 dungeons consistent).

### 6.1 Timer math (5 players, Tahkimli week, median +10 party, 0 to 1 deaths)

`timerSec = 1620`. +2 at 1296 s (21:36), +3 at 972 s (16:12). Trash time model used for the estimates: 8 s per pull plus 0.95 s per force (it reproduces the first revision's sections within 10 s).

| Section | Content | Trash (forces, pulls) | Trash time | Boss | Run | Section total | Cumulative | % of timer |
|---|---|---|---|---|---|---|---|---|
| A | Cesaret Kapısı to Çürükkemik | 81, 4 pulls | 1:55 | 2:00 | 0:35 | 4:30 | 4:30 | 16.7% |
| B | Çan Kapısı, Son Çan Avlusu, Yıkık Geçit | 113, 5 pulls | 2:20 | none | 0:25 | 2:45 | 7:15 | 26.9% |
| C | Cesaret'in Düşüşü | 0 | none | 2:20 | 0:20 | 2:40 | 9:55 | 36.7% |
| D | Kemik Köprü, Dikişhane | 92, 3 pulls | 2:05 | 2:35 | 0:20 | 5:00 | 14:55 | 55.2% |
| E | Zolramus ascent to Buzlu Tepe | 165, 6 pulls | 2:45 | 3:30 (Exile loss included, §5.4) | 1:05 | 7:20 | 22:15 | 82.4% |

So a median +10 party finishes in about **22:15 and just misses +2**; a strong +10 party (cooldowns on every big pull, route A, no deaths) in about 19:45 (73%). The run times above include the staircases (the 780 m path has about 25 s of slope slow-down over the flat first revision). Boss kill splits (HUD par times): Çürükkemik 4:30, Amarth 9:55, Dikişet 14:55, Nalthor 22:15. Forces at those kills: 18.8%, 45.1%, 66.5%, 100% (mandatory total 451 = 104.9%).

| Key | Expected clear | % of timer | Chest | Basis |
|---|---|---|---|---|
| +5 | 17:40 | 65.4% | +2 | fight time (1170 s at +10) scaled by 1.055 per level from +10 (gear grows about 4.5% per key level vs enemy HP 8% to 10%); running and stairs time constant (2:45) |
| +8 | 20:16 | 75.1% | +2 | |
| +10 | 22:15 | 82.4% | +1 | |
| +12 | 24:27 | 90.6% | +1 | |
| +14 | 26:54 | 99.6% | +1 (one death depletes) | |

All of this is a design estimate; SimBench (CORE_MECHANICS §5) must confirm the 1.055 factor before the numbers go in a tooltip.

Each death adds 15 s: budget at most 2 deaths on a +10 timing. The two big death risks are the Stitchwerks pull and the Final Toll courtyard pull (the Dark Exile no longer costs deaths: it never removes the healer and its timer is 50 s).

### 6.2 Forces

`forcesRequired: 430`. Mandatory **451** (slack 21 forces = 4.9%), optional **112** (p08 17, p09 16, p17 22, p37 12, p24 20, p25 25), available 563 = 130.9%. Per-pack numbers are in §4.3. Summoned and boss-spawned enemies give 0 (all boss adds, worms, constructs, the Siphoner). The patrols give 5 each, so a missed patrol never decides a key. **Content-check rules (SP-13):** mandatory total at least `forcesRequired + 10` and at most 106% of it; route B (the skip) reaches `forcesRequired + 10` with every optional room it can reach (below), so the slack is positive on both routes.

### 6.3 Routes

**Route A (standard, 18 pulls).** "Tools" are devices (D), dungeon weapons (W) and shrines (S).

| Pull | Packs | Forces | Cumulative | Tools | Notes |
|---|---|---|---|---|---|
| 1 | p01 | 10 | 2.3% | | warm-up in the corridor |
| 2 | p02 + p03 | 27 | 8.6% | D `dev_gd1` before the pull (60 s) | west and north plaza packs; two ranged DPS on the Büyücü |
| 3 | p04 + p05 | 19 | 13.0% | | p05 (patrol) is killed on the south lane when it reaches the east end, then p04 |
| 4 | p06 + p07 | 25 | 18.8% | W hammer `meydan (27.5, 51.5)` on the Canavar | Canavar is the first string, perilous-buster and leap check |
| | **Boss 1 Çürükkemik** | | | | |
| 5 | p10 + p11 | 25 | 24.7% | D `dev_gd2` (buff, also unlocks the skip) | p10 is a stair fight |
| 6 | p12 | 14 | 27.9% | | 2 Büyücü: kick Don Oku; the corner pack, pulled alone |
| 7 | p13 + p14 | 37 | 36.5% | W hammer `son_can (38, 27)` on the Canavar | the courtyard pull under debris fall; 3 casters |
| 8 | p15 + p16 | 23 | 41.9% | W shield `son_can (45, 31)` if the healer is short | the patrol is killed at the entrance steps before p14 (it patrols the south lane), then p15 |
| 9 | p18 | 14 | 45.1% | D `dev_gd3` inside the arena before the boss pull | last pack, a stair fight |
| | **Boss 2 Amarth** | | | W 2 spears at (23, 24) and (23, 35) for the Land minions | |
| 10 | p19 | 12 | 47.9% | | ranged only on the bridge deck |
| 11 | p20 + p21 | 50 | 59.5% | **S Kudret Sunağı + W orb `dikis_kapi (8.5, 11.5)`** | the Stitchwerks pull: orb on the Toplayıcı drains |
| 12 | p22 + p23 | 30 | 66.5% | | the patrol dies in the east lobby lane, 13 m from p23; p23 in the corridor |
| | **Boss 3 Dikişet** | | | | |
| 13 | p26 + p27 | 34 | 74.4% | W orb `zolramus_kapi (52, 11)` | 5 Nekrotik Ok casters: kick Bekçi first |
| 14 | p28 + p36 | 25 | 80.2% | | Heykeltıraş plus the skull swarm (cleave the skulls first) |
| 15 | p29 + p30 | 27 | 86.5% | W orb `kemik_nef (52.5, 26)` for p30 | stair casters first, then the nave pack |
| 16 | p31 | 17 | 90.5% | | two elites, no casters: tank defensive on Oyma and Gazap; pulled alone (it stands at the foot of the grand staircase) |
| 17 | p32 + p33 | 37 | 99.1% | **S Koruma Sunağı** + W hammer `heykel_galerisi (70, 24)` | the gallery pull |
| 18 | p34 + p35 | 25 | 104.9% (caps at 100%) | W shield `(75, 19)` | |
| | **Boss 4 Nalthor** | | | W spear at (68, 38) for the Aegis | |

Route A has 21 spare forces (4.9%): a missed patrol plus one 14 to 16 force pack is allowed.

**Route B (Kısayol, the safe route; not the fast one).** Take both ambar packs (33) before boss 1, `dev_gd2` after pull 6 (p12 stays: it is a standalone pull in the corner), walk the Servis Geçidi into the Amarth court (skips p13, p14, p15, p16 and p18: **74 forces**, not 88; p12 is no longer skipped), then take **all three** reachable optional packs (ambar 33, vana odası 20, kan havuzu 25 = 78): the total is `451 - 74 + 78 = 455`, which is **25 above 430**, so the route has real slack (the first revision had 431, one force of slack, and counted 88 skipped forces because p12 would have been body-pulled by p11 at 12.2 m). Çan Kulesi (34) is not reachable from the skip corridor. Honest timing with the model of §6.1: section B shrinks from 2:45 to 1:23 (pulls 5 and 6, the device, a 40 m ramp) = **-1:22**; the three optional rooms cost 1:04 (ambar, 33 forces, one pull plus the detour), 0:57 (vana odası, dormant, wakes at 6 m) and 0:57 (kan havuzu) = **+2:58**; route B is **about 1:36 slower** than route A. It removes the Son Çan courtyard pull (Canavar and three casters under falling debris), the most dangerous pull of section B at +14 and above, and it removes one Canavar leap from the run, so it is the route for a party that fails that pull or has no kicks left, not a time route; the first revision called it "time neutral" and "recommended for +10 and up", which does not hold. Use it only when the courtyard pull is the reason keys are being lost. The dormant vats of Yaratım Odası (`les_p24`) wake at 6 m: pull them last from the door. SimBench decides the real number (open question in §8.6).

### 6.4 Dangerous pulls

| Pull | Why it kills keys | Plan |
|---|---|---|
| 4 (p06 + p07) | Canavar string with a delayed backhand, perilous Pençe, leap; first brute check | hammer or stun the Canavar, dodge Pençe, tank defensive, parry the first hit of the string |
| 7 (p13 + p14) | Canavar and three Büyücü (Don Oku, Don Halkası) under the bell's debris | kick Don Oku, move the pull out of the middle, avoid chunks (they telegraph 1.4 s), kill the patrol first at the steps |
| 11 (p20 + p21) | 5 Öncü rage casts, 3 Toplayıcı drains (and Tırpan Kancası pulls into the pools), 2 Zanaatkâr repairs: 10 relevant casts at once | Kudret Sunağı, **orb**, stun Toplayıcı first, defensives on the tank for the rages, stand out of the hook line |
| 13 (p26 + p27) | 5 Nekrotik Ok casters and 2 Gazap nukes | kick order Bekçi then Büyücü, dodge or defensive Gazap, orb |
| 16 (p31) | two elites (Heykeltıraş and Bekçi), Oyma perilous buster and Gazap nuke, Sarmal spin | stagger the two defensives, parry the strings (the poise bars break in 2 to 3 parries each) |
| 17 (p32 + p33) | two elites, two Büyücü, two Şifacı (heal and shield), Mızrak lines | Koruma Sunağı, kill Şifacı first (kick Şifası), hammer a Heykeltıraş |
| patrols p05, p16, p22 | poison pool on death (r 4, 8 s) | kill them in their own lane, away from every pack (they no longer touch other packs); Sanguine weeks stack pools |

### 6.5 Affix interactions (`data/mythicAffixes.ts` ids)

| Affix | Effect in this dungeon |
|---|---|
| Tahkimli (`fortified`) | trash +20% HP and +30% damage: the Stitchwerks pull hits hardest (Öncü 32,757 HP at +10); kick budget is the limit, not DPS |
| Zorba (`tyrannical`) | bosses +30% HP: Nalthor 3.66M HP, fight 4:33 vs enrage 6:00 (still safe); Amarth's Echoes ramp longer, so burn minions fast; Dikişet's arena uptime matters most; poise values scale with the party, not with the affix |
| Güçlenen (`bolstering`) | every Savaşçı death buffs the others: kill the casters and Arbaletçi first, finish Savaşçı last; do not kill a patrol Veba Torbası next to a pack; skull swarms (Kafatası) count as swarm for Bolstering stacks, kill them in one cleave |
| Öfkeli (`raging`) | Öncü and Bekçi enrage below 30% (CC immune): burst them through, do not leave one at 29%; Canavar already enrages at 30% |
| Kan Dökücü (`sanguine`) | pools on top of boss 1's gas, the lobby and the plague pools: tank pulls out of pools, do not fight a patrol inside a pack's pool |
| Patlayan (`bursting`) | swarm-like Savaşçı packs (3 per pack) and the 5-skull swarm pack cause stacks: stagger kills; boss adds are excluded by the rules |
| İlham Veren (`inspiring`) | the inspirer is picked among the highest-HP non-swarm members (Canavar, Bekçi, Heykeltıraş): it removes kicks from the whole pack, so kill the inspirer first; the gate hall (5 Nekrotik Ok) becomes unkickable otherwise |
| Volkanik (`volcanic`) | plumes under distant players: the plaza and courtyard are open; on the Kemik Köprü and the Buzlu Tepe edge the affix must not drop plumes or knock-ups within 3 m of a void zone (SP-06 safe-cell rule, which also covers the stair strips' open sides) |
| Sarsıntılı (`quaking`) | quakes interrupt casts, including the party's kicks: do not stack kicks on Amarth's Volley right before a quake |
| Patlayıcı Küre (`explosive`) | orbs spawn near the Büyücü and Büyücü-heavy packs: assign one DPS |
| Nekrotik (`necrotic`) | stacks with Nekrotik Ok, `heal_cut` (Amarth Nefes) and `tank_stack`: swap the tank on Amarth by 4 stacks, kick every Nekrotik Ok |
| Kin Dolu (`spiteful`) | shades in tight rooms (lobby, bridge deck): kill pulls on the deck's wide end |
| Fırtınalı (`storming`) | tornado knock-up on the bridge and the platform edge: same safe-cell rule as Volkanik |
| Ağır Yara (`grievous`) | heals halved while below 90%: Amarth's Breath, Nalthor's Comet and Aegis waves, Dikişet's Rot are heal checks |
| Efsunlu Yarık (`seasonal_efsun`, +10) | 6 rift spots (below), forces thresholds 20/40/60/80% open at the spot nearest the party and 15 m away |
| Kibirli (CORE_MECHANICS §6) | every 20% forces a **Kibir Tecessümü** (elite, 4x trash HP) spawns near the party: the hammer stuns it (and breaks its poise), the spear takes 12% of its HP, the shrines (Kudret, Koruma) should be saved for the pulls that contain it |

### 6.6 Font of Power, shrines, rifts, chests

```ts
const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(8, 56),
  shrines: [{ type: 'shrine_power', pos: pt(8.5, 16) }, { type: 'shrine_ward', pos: pt(68.5, 17.5) }],
  riftSpots: ([[28.5, 49.5], [41.5, 40.9], [41, 26], [20.5, 10.8], [58.5, 9], [72, 23]] as [number, number][]).map(([x, z]) => pt(x, z)),
  chests: [{ pos: pt(23.5, 42.4), kind: 'chest_wood' }, { pos: pt(59.3, 29.6), kind: 'chest_gold' }],
};
```

* **Kehanet Taşı** (Font of Power): `giris` (8, 56), 3.5 m from the spawn, golden rune circle on the +0.4 m Font terrace, `font_of_power` prop with `waypoint_glow`. The key owner inserts the key, 10 s countdown, the start barrier is the `giris` east door (the arch landing).
* **Shrines** (fixed types in M+): `shrine_power` Kudret Sunağı (+25% damage, 30 s) at the Stitchwerks lobby entrance, meant for pull 11; `shrine_ward` Koruma Sunağı (-25% damage taken, 30 s) at the gallery entrance, meant for pull 17. Both are on the critical path so skipping route B never loses them. Model and VFX per GDD_CONTENT §1.4.
* **Rift spots** (Efsunlu Yarık, six, 15 m apart, none in a boss arena, all on flat floor): meydan (28.5, 49.5), toll_kapisi (41.5, 40.9), son_can (41, 26), dikis_kapi (20.5, 10.8), zolramus_kapi (58.5, 9), heykel_galerisi (72, 23). Two were moved off the patrol lanes of the first revision (meydan, dikis_kapi).
* **Chests:** chest_wood in the ambar, chest_gold on the bell tower terrace (+5.4 m); in M+ they only give gold and a health globe (GDD_CONTENT §1.3).

### 6.7 Numbers at key levels (5 players)

| Key | Enemy scale (HP and damage) | Kırık Kemik Savaşçısı HP (Tahkimli) | Çürükkemik HP (Zorba) | Canavar hit coef 1.0 (Tahkimli) | Canavar Parçalayıcı Pençe (coef 3.6) |
|---|---|---|---|---|---|
| +2 | x1.08 | 13,273 | 1,138,372 | 718 | 2,585 |
| +5 | x1.36 | 16,721 | 1,434,020 | 904 | 3,254 |
| +10 | x2.00 | 24,568 | 2,107,046 | 1,328 | 4,781 |
| +15 | x3.22 | 39,567 | 3,393,419 | 2,139 | 7,700 |

(These are the CORE_MECHANICS curve values: `1.08^(L-1)` up to +10, then `x1.10` per level. With the old code curve the HP columns would read x2.36 at +10 and x4.18 at +15.)

---

## 7. ENTRANCE

**Zone:** **Kadim Diyar** (`kadim_diyar`, GDD_OPENWORLD roadmap map 3, levels 45 to 60), region **Gökkubbe Yaylası** (`kd_r1`, the north-west plateau). The four levelling dungeons sit in Sisli Vadi and Karakır Bozkırı; the season dungeons are spread over Kadim Diyar's terrain types, and this one takes the **sky plateau**: a pale limestone and marble tableland at cloud height, cliffs dropping into a cloud sea, floating islands in the distance, tall pale grass, constant wind, thin cold light. If Kadim Diyar is not built when this ships, place the entrance on the **north rim of Ayaz Eteği** (Karakır Bozkırı, above Karlıbel Kalesi, snow-dusted variant of the same dressing, `regionId: 'ayaz_etegi'`); the dungeon itself does not depend on the zone.

```ts
{ id: 'ent_les_uyanisi', name: 'Leş Uyanışı Girişi', dungeonId: 'les_uyanisi', pos: [/* tile on the Kadim Diyar layout, on the plateau edge about 40 tiles from the zone waypoint */ 0, 0],
  facing: 0, minLevel: 50, regionId: 'kd_r1', look: 'temple' }
```

**Region atmosphere** (`RegionTheme`): fog `0xdfe8f0` near 40 far 130, hemi sky `0xcfe4ff`, ground `0x9a9070`, intensity 1.3, sun `0xfff0c8` x1.0, `skyZenith: 0x5a8ad0`, `skyHorizon: 0xe8f0f8`, `skyImage: '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-04.jpg'`, ground textures from the `tiny-texture-pack-1` grey brick tiles (road, cobble) and a pale grass, music `world_ruins`, `ambientVfx: 'ambient_dust'`.

**The gate (grand, matches the dungeon):** a monumental **Cesaret Kapısı**, three beats:
1. **Processional road:** 40 m of pale marble road from the waypoint, 8 pairs of mourning Gökbekçi statues (`gp('statue_hooded')` tinted `0xf0e0b0`), a `kg('pillar-obelisk')` every 12 m, gold-and-blue banners (`gp('banner_blue')`, `dg('banner_triple_yellow')`), braziers with gold flame.
2. **Plaza (24 x 24 m):** a dry fountain (`kf('fountain-round')`), wrecked siege (`kc('siege-*-demolished')`), Leş Tarikatı bone-spike fences and green-flame braziers: a world camp of reanimated elites (`lu_kirik_savasci`, `lu_arbaletci` at level 58 to 60, one `lu_canavar` guard) that has to be cleared or sneaked past to use the door.
3. **The gate:** NEW `les_giris_kapisi` (18 m wide, 12 m tall): a cream-and-gold marble arch with two colossal headless winged statues, the gold doors split open, the opening filled with the standard `Portal` interactable (`mplus_portal` x1.2, `portal_surface` recoloured plague-green to gold) and a green drip from the keystone. Overhead, hovering 80 m up and slowly turning, the **Zolramus silhouette** (`les_zolramus_uzak`, 60 m, green-lit underside): the landmark that tells the player where the dungeon is from across the whole plateau. It doubles as a vista point (`VistaDef`).

**Behaviour:** the same `Portal` interactable as the other world entrances (difficulty panel `keystone` with `dungeonId`, all four difficulties from level 50, Mitik+ needs a key). Before level 50 the hint reads "Kapı mühürlü. Gökbekçilerin sesini duymak için Seviye 50 olmalısın." After a run the party returns 6 m in front of the door (`DungeonParams.returnTo`). The Kadim Kapılar Salonu portal in Kuzgunkale still lists the dungeon for key holders.

---

## 8. IMPLEMENTATION PACKAGES (for the Haiku coders)

### 8.1 Packages

| Package | Model | Files | Content | Depends on | Done when |
|---|---|---|---|---|---|
| **LES-00 HP curve (shared)** | Haiku | `src/data/mythicAffixes.ts`, `tools/simbench.mjs` M+ profile if it already reads the curve | change `mplusHp` and `mplusDmg` to the CORE_MECHANICS §6 curve: `1.08 ** (Math.min(L, 10) - 1) * 1.10 ** Math.max(0, L - 10)` (x2.0 at +10, x3.22 at +15; today `mplusHp` is `1.1 ** (L - 1)` = x2.36 and x4.18, `mplusDmg` is `1.08 ** (L - 1)` for every level). Re-check the §6.7 table and the SimBench M+ profile | none (runs first) | `mplusHp(10) = 2.00` and `mplusHp(15) = 3.22` to 2 decimals; the 6.7 table values reproduce; the existing 4 dungeons' M+ numbers re-checked |
| **LES-01 data file** | Haiku | `src/data/dungeons/les_uyanisi.ts`, `src/data/dungeons/index.ts` (register in `DUNGEONS`, not in `DUNGEON_IDS`; add to the season pool of SP-14) | `ROOMS` (with `floorY`, `ceiling`, `openAir`, `stairs`, `terraces` from §3.2 and §3.6), `ROOM_EXTRA`, `DOORS`, `PACKS`, `PACK_EXTRA`, `BOSSES`, `THEME`, `EXTRAS`, atmosphere presets, decor per room (the `D.room(...)` functions following §3.7, with `explicitDecor` boss rooms and hand-placed set pieces), the `DungeonDef` export (below) | SP-V1, SP-V2, SP-V3, SP-02, SP-03 (tags, `device_lock`), SP-06, SP-07, SP-14 | `npx tsc --noEmit` clean, SP-13 content check green, dungeon loads on the dev scene page, a player can walk from `giris` to `buz_tepe` over all 17 strips |
| **LES-02 enemy defs** | Haiku | `src/data/enemies/les_uyanisi.ts` (or appended to `enemies.ts` if SP-01 is rejected), `src/data/enemyModels.ts` (SP-F1) | the 13 trash defs of §4.2, the derived Amarth adds, Leş Kurdu, Dikiş Yaratığı, Zolramus Emici, the 4 `boss({...})` defs of §5 written through the `M()` swap table of §2.8, the `R_FLESH` and `R_NECRO` constants, the `leap` builder, the registration call | LES-00, SP-01, SP-P2, SP-P3, SP-F1 | every id in `PACKS` and `BOSSES` resolves with `getEnemyDef`; content check (clip names, windup formula, 2 to 4 attacks per trash type) green |
| **LES-03 trash handlers** | Haiku | `src/ai/abilities.ts`, `src/ai/EnemyAI.ts` (the SP-P2 and SP-P3 hooks) | `lu_cs_gorge` (worm stacks and Carrion Eruption), aliases `CUSTOM.lu_lt_drain = CUSTOM.crypt_wraith_drain`, passive alias `lu_zh_armor` next to `bone_golem_armor` (spec in §8.3); `string` and `leap` execution | none | worms explode at 5 stacks, drains heal the caster, shield triggers at 50%, a 3-hit string lands 3 hits with the delayed last swing, a leap telegraphs a landing ring |
| **LES-04 boss scripts** | Haiku | `src/ai/bosses/les.ts`, `src/ai/bosses/index.ts` (+ `LES_SCRIPTS`, `LES_SPAWNS`) | the four scripts of §5 (Çürükkemik, Amarth, Dikişet stage machine, Nalthor with exile), each with its `onPoiseBreak` | SP-04, SP-05, SP-10, SP-P1, LES-02 | each boss runs a full fight on the dev boss page; wipe and reset clean (clear zones, adds, exile, immune); a poise break does what §5 says |
| **LES-05 statuses** | Haiku (shared, SP-05) | `src/data/statuses.ts`, `src/types/skills.ts` | the 9 new statuses of SP-05 with Turkish names, icons and `STATUS_RULES` | none | statuses apply, stack and show on the HUD |
| **LES-06 mechanics** | Haiku (shared, SP-02/03/04/06/08/V1/V2/V3) | see §8.2 | devices, dungeon items (percent-HP damage), atmosphere, heightfield, `boss_tp`, hazard kinds, fall plane | none | each primitive has its own dev-page check |
| **LES-07 assets** | Sonnet art spec, Haiku Blender scripts | `tools/blender/props/props_les.py`, `tools/blender/creatures/c_les_*.py`, `tools/blender/bosses/boss_*.py`, `docs/assets/generated-*.md` | the 19 props of §2.7, the 6 creatures and bosses of §2.8, each with its fallback; `GEN_PROPS` and docs entries | none | GLBs open in `tools/glb-inspect.mjs`, sizes match, clips named as in `A_GEN` (Amarth also `Fly`) |
| **LES-08 loot** | Haiku | `src/data/loot.ts`, `src/data/uniques.ts`, `src/data/itemBases.ts` if a base is missing, the combat specials (SP-L1) | the 4 loot tables, the 12 named items, the 12 `special.id` handlers, optional mount of §5.6 | items module, SP-L1 | the four tables drop their focus slots; each named item can drop and its effect fires in the dev combat page |
| **LES-09 world entrance** | Haiku | `src/data/world/pois.ts` (or the Kadim Diyar file), `src/world/WorldDecor.ts` recipe | `ent_les_uyanisi`, gate dressing, camp, vista, fallback at Ayaz Eteği | the Kadim Diyar map (or the fallback), SP-12 | the entrance opens the keystone panel and returns the party in front of it |
| **LES-10 QA** | Haiku (one pass at the end, low CPU) | `tools/content-check.mjs` | SP-13 rules; one browser pass: start, Font, 4 boss fights, one skip, the exile | all | the checklist of §8.5 passes |

Dependency order: **LES-00 first** (the HP curve), SP-05, SP-01 and SP-V1 next (they unblock LES-02, LES-04 and LES-01), SP-02/03/06/07/14/P2/P3 in parallel with LES-02/03, then LES-01 and LES-04, assets in parallel throughout, LES-08 and LES-09 at the end, LES-10 last.

The `DungeonDef` export (LES-01):

```ts
export const LES_UYANISI: DungeonDef = {
  id: 'les_uyanisi', name: 'Leş Uyanışı', shortName: 'Leş Uyanışı',
  lore: 'Kadim Diyar\'ın üstündeki Cesaret Tapınağı yüzyıllardır Kadim Mühür\'ü kapalı tutar. Leş Tarikatı, Azrakel\'in son meclisi, tapınağın üzerine uçan bir kemik zigurat kaldırdı: Gökbekçilerin ruhları hasat ediliyor, ölüler dikişle birbirine bağlanıyor, Ayazbağlayan Nalthor mührü kıran buzu hazırlıyor.',
  levelRange: [50, 60], timerSec: 1620, forcesRequired: 430, theme: THEME, grid: { w: 80, h: 64 },
  rooms: withProps(ROOMS.map((r) => ({ ...r, ...ROOM_EXTRA[r.id] })), D.out), doors: DOORS,
  packs: PACKS.map((p) => (PACK_EXTRA[p.id] ? { ...p, ...PACK_EXTRA[p.id] } : p)), bosses: BOSSES,
  start: { pos: shPt(5.5, 58), facing: 90 }, exit: { pos: shPt(66.5, 49.5) }, extras: EXTRAS,
  icon: '/assets/icons/dungeon-les_uyanisi.svg', loadingImage: '/assets/loading/les_uyanisi.png',
};
const BOSSES = [
  bossAt('boss_curukkemik', 'hasat_cukuru', 42, 52.5, -90, 1),
  bossAt('boss_hasatci_amarth', 'dus_meydan', 13, 29.5, 90, 2),
  bossAt('boss_cerrah_dikisat', 'dikis_atolye', 36.5, 5.5, 0, 3),
  bossAt('boss_ayazbaglayan_nalthor', 'buz_tepe', 70.5, 46, 180, 4),
];
```

`makeCtx` reserved circles (keep decor clear): start (5.5, 58) r 2.0, font (8, 56) r 1.6, exit (66.5, 49.5) r 2.8, each boss pos r 4.5, the three devices r 1.8, the 13 pickups r 1.2, the two shrines r 1.5, the two chests r 1.2.

### 8.2 NEW shared primitives (build once for all 8 dungeons)

The first block is the original set (SP-01 to SP-14, updated where this revision changed them); the second block is new in this revision (verticality, poise and strings, loot, models). Other dungeon docs may already use some SP numbers for different things; the orchestrator must reconcile the numbering when the lists are merged (the ids below are stable inside this document).

| Id | Primitive | Spec |
|---|---|---|
| **SP-01** | `enemyKit` exports | Move the builders and constants of `data/enemies.ts` (`cone proj aoe line heal buff passive onDeath charge summonAb NOOP bleed poison burn chill def add boss bp custom`, anim sets `A_*`, resist sets `R_*`, url helpers `MON CHAR SKEL GEN GENB ITCH WPN`, KayKit hide lists, `W_BLADE`) into `src/data/enemyKit.ts`; `enemies.ts` imports them. Per-dungeon enemy files `src/data/enemies/<dungeon>.ts` export `registerXxx(add, boss)` called at the end of `enemies.ts`, so `ENEMIES`/`BOSSES` stay one registry. `Spec` and `def()` also pass through `poise, poiseRegen, poiseDelay, hyperArmor, stanceBreakable, profile, family` (they exist on `EnemyDef` but the current `Spec` does not list them). No behaviour change |
| **SP-02** | Room style and atmosphere | `RoomDef.style?: { floorTint?: number; wallTint?: number }`; `RoomDef.atmosphere?: string \| RoomAtmosphere` with `DungeonDef.atmospheres?: Record<string, RoomAtmosphere>` where `RoomAtmosphere = { hemiSky, hemiGround, hemiIntensity, ambient, ambientIntensity, key: { color, intensity }, fog: { color, near, far }, sky?: { image?, zenith?, horizon?, cover? }, music?: MusicId, ambientVfx?, wind? }`. The builder blends it like the existing `RoomDef.fog` override (`DungeonBuilder.updateFog`, about line 1658): lerp the hemi, ambient and key light, cross-fade the sky dome (`world/Sky.ts`), switch music on a room change unless a boss is active. Floor and wall tint multiply the instanced colours at build time. Acceptance: 1.5 s blend, no per-frame allocation |
| **SP-03** | Devices, dungeon items, `device_lock` | `PropPlacement.tag += 'device' \| 'weapon'`, `PropPlacement.device?: string`, `PropPlacement.item?: 'spear' \| 'hammer' \| 'orb' \| 'shield'`; `DoorDef.gate += 'device_lock'`, `DoorDef.device?: string`. `DeviceDef { id, prompt, range, once, effect: 'party_buff' \| 'open_gate' \| 'spawn_pack', status?, seconds?, radius?, gateDoor?, vfx? }` in `data/devices.ts`; `DungeonItemDef { id, name, icon, charges, kind: 'throw_line' \| 'melee_cone' \| 'channel_circle' \| 'channel_self', dmgPct: { trash, elite, boss, minion }, range, ... }` in `data/dungeonItems.ts` (**the damage is `dmgPct` of the target's max HP**, the numbers of §3.5; hammer adds `poisePct` and the stun, spear adds `weapon_mark`). Systems: `systems/DungeonDevices.ts` (host authoritative; use broadcasts `{ id, by }` on the `gate` channel family or a new `dev` channel, applies the buff, opens the gate, marks it used) and `systems/DungeonItems.ts` (client picks up with F, holds one item, fires it with a new `Input` action `dungeonItem` on a free key; damage is computed as `maxHp x dmgPct` with `Combat.playerHitEnemy` flagged `ignoreMods`, no crit). HUD: item button with charges. Items do not respawn. The builder draws a `device_lock` door as a rubble barricade |
| **SP-04** | Boss kit helpers (`ai/bosses/kit.ts`) | `corpseBlast(c, { r, coef, delay, name?, type? })` (generalises Morkan's pile loop, claims the piles at resolve); `clearStatusPlayer(p, status)` (`pstatus` with `duration 0, removed: true`); `banish(c, p, { to: Pt, seconds, tag })` plus `bossMsgTo(p.id, 'boss_tp', { x, z })` and a `case 'boss_tp'` receiver in `ai/bossNet.ts` that sets the position, clears interpolation and snaps the camera; `returnBanished(c, p, to)`; `lineHit(from, ang, len, width, point, pad?)` oriented-rectangle test; `c.tank()`, `c.angleTo(target)`, `c.cancelBusy(...ids)`, `c.teleportTo(x, z, arcSeconds?)`, `c.setHover(h)`, `pickPlayers(c, n, { excludeTank?, excludeHealer?, role? })`; optional wrappers `intermission(c, opts)`, `soakCircle(c, opts)`, `markSpread(c, opts)`, `tankStackToast(c, p, status, max)` |
| **SP-05** | Statuses (`data/statuses.ts` + `STATUS_RULES`, append-only `StatusId`) | `heal_cut` Şifa Kesintisi (healing received x`(1 - magnitude)`), `heal_absorb` Şifa Emilimi (absorbs the next `magnitude x maxHp` of healing), `tank_stack` Yığın Yarası (max 8, +10% damage taken from the source per stack, refresh), `frost_mark` Ayaz Damgası (max 3, +25% frost damage taken per stack, 5 s), `morbid_fixation` Hastalıklı Takıntı (move -60%, +100% damage taken from the source, 8 s), `exile_cold` Sürgün Soğuğu (move -25%, 50 s, timer), `champion_boon` Şampiyonun Lütfu (+100% crit chance, 40 s), `weapon_mark` Kan İzi (**+25% damage taken from players, 10 s**), `anima_exhaust` Anima Egzozu (60 s, the pulse is driven by DungeonDevices). Each needs a `StatusDef`, an icon, and a Turkish name |
| **SP-06** | Hazards and zone looks | `HazardDef.kind += 'debris_fall' \| 'plague_vent'` (falling stone chunk with dust; green gas burst with `poison_cloud`, plus `warn`); `ZoneDef.look?: 'cloud' \| 'abyss'` for `void` and `pit` (cloud = flat white-grey shader with `ambient_dust`); a safe-cell rule: affix hooks (Volkanik, Fırtınalı, Kin Dolu knock-ups) must not place plumes or tornadoes within 3 m of a blocked void zone or an open stair-strip side (`NavGrid` test) |
| **SP-07** | Pack formation helper (`data/dungeons/kit.ts`) | `pk(id, roomId, cx, cz, forces, front: [string, number][], back: [string, number][], extra?)`. Front rank uses the sunflower table `[[0.3,0],[-0.38,0.35],[0.06,-0.66],[0.48,0.62],[-0.88,-0.16],[0.83,-0.53],[-0.28,1.03],[-0.53,-1.02],[1.15,0.42],[-1.2,0.49],[0.58,-1.23],[0.43,1.36]]`; back rank uses `[[0,-1.25],[-0.82,-1.04],[0.03,-1.33],[0.89,-1.61],[-1.68,-0.76]]`, mirrored to sit on the side away from the nearest door, snapped to free nav cells. `forces` is checked by SP-13 |
| **SP-08** | Door-less exile rooms | Builder and scene tolerate a room with no doors (no warning, hidden from the map, excluded from the forces route); `RoomDef.exile?: true` flag; the nav grid needs no connectivity to it |
| **SP-10** | Persist statuses and remote status reads | verify or implement that `HitShapeSpec.persist` ticks apply `statuses` (silence, root in the gas), and that the host can read a remote player's statuses (`Player.statuses.has`, mirrored by `PlayerSyncState.statuses`) for the Frozen Binds dispel check; if not, add `statusesOf(playerId)` to Replication |
| **SP-11** | Audio ids and ambient emitters | append `bell_toll`, `flies_loop`, `saw_loop`, `wind_loop`, `ice_creak` to `types/audio.ts` and map them in `audio/aliases.ts` (unknown ids stay silent), plus the aliases `bone_rattle` (`skeleton_death` pitched down), `chain_rattle` (`trap_trigger` pitched down), `drip_loop` (`water_impact`); `RoomDef.emitters?: { id: SfxId; pos: [number, number]; radius: number; volume?: number; loop?: boolean; every?: number }[]` positional ambient emitters (looped, or an event every `every` seconds); no new VFX ids needed |
| **SP-12** | World entrance recipe | `EntranceDef.look: 'temple'` large variant (processional road, plaza, arch, `Portal`), a vista prop, a camp recipe with `lu_*` elites |
| **SP-13** | Content check (`tools/content-check.mjs`) | the original rules: pack `forces` equals the sum of its members; all pack, boss, loot and device ids resolve; every `boss_lock` door leads into a `boss` room; room rectangle overlap and door adjacency (§8.4); boss script registered; every `tag: 'device'` and `tag: 'weapon'` has a def; rift spots 15 m apart and outside boss rooms. **New rules of this revision:** (1) `forcesRequired + 10 <= mandatory <= forcesRequired x 1.06`, and the route-B check (mandatory minus the `device_lock` skip plus the optional forces reachable from the skip corridor is at least `forcesRequired + 10`); (2) **patrol rule:** every segment of a patrol stays at least 12 m from every pack centre that is not in its `linkedTo` and at least 4 m from any blocked zone; (3) **blocked-zone rule:** no boss, pack centre, device, pickup, shrine, chest, Font or exit lies inside a blocked zone (circle radius + 0.3 tile, packs + 0.9 tile); (4) **flat-floor rule:** boss, device, pickup, shrine, chest, Font and exit are not inside a stair strip; (5) **height rules:** every door joins within 0.45 m on both sides, every strip gradient is at most 0.35, every terrace edge is at most 0.45 m high or touches a strip; (6) **model rule:** every enemy `model` file exists and every `anim` (basic, ability, `string.anims`, `anims.*`) exists in the model's clip list, checked for the fallback AND the final model (clip lists from `tools/glb-inspect.mjs --json`); (7) **tell rule:** every non-cast ability has `windup` within 0.05 s of `clamp(0.45 + 0.25 x coef, 0.45, 1.2)` (bosses' perilous tank busters may be up to +0.2), every trash type has 2 to 4 attacks, every elite has `poise`; (8) every named item `special.id` has a handler |
| **SP-14** | Season pool | `MYTHIC_POOL: string[]` (the 8 season dungeon ids) in `data/dungeons/index.ts`; the keystone random draw, the portal list, leaderboards and the score rating (sum over the pool) use it; `DUNGEON_IDS` keeps the 4 levelling dungeons |
| **SP-V1** (new) | Heightfield rooms (CORE_MECHANICS §13) | `RoomDef.floorY?: number`, `ceiling?: number` (wall height m), `openAir?: boolean`, `stairs?: StairDef[]`, `terraces?: { id: string; box: [number, number, number, number]; y: number }[]`, `StairDef = { id: string; box: [x0, z0, x1, z1] /* tiles */; yFrom: number /* at the min coordinate */; yTo: number; axis: 'x' \| 'z' }` (same semantics as `TownDef.stairs`, in tiles). Builder: floors at `floorY`, strips as 0.25 m risers (`stairs_wide` props) with retaining walls and rails where a strip or terrace is more than 0.45 m above its neighbour, wall height = `ceiling`, camera zoom limit `min(18, 0.9 x ceiling)`. NavGrid stores a height per cell, refuses steps above 0.45 m outside strips and strip gradients above 0.35. `World.groundY` samples the field for players, enemies, loot, projectiles, props and hit shapes (melee ignores height differences up to 2.5 m). Door continuity is validated at load. Acceptance: walk, fight on a strip, enemies path over strips, a melee swing at a target 3 m above misses |
| **SP-V2** (new) | Upper layer props | `PropPlacement.y?: number` (height above the floor), `nocollide?: boolean` (never in the nav grid), `hang?: boolean` (origin at the top, hangs from `y`), and light-bearing props at height; used for balconies, chandeliers, banners, hooks, statues on cornices (§3.7). Perf: instanced where the prop id repeats |
| **SP-V3** (new) | Void fall plane and bridges | `ZoneDef kind 'void'` gains `fall?: 'respawn' \| 'kill'`: a player entering a void cell takes 25% max HP and is returned to `G.player.lastSafe` (updated every 0.25 s while grounded away from edges); enemies never path into voids. Bridges and decks are plain walkable strips or terraces over the void |
| **SP-P1** (new) | Poise break hook | `BossScript.onPoiseBreak?(c)` runs on the host when the existing `poise:break` event fires for the boss (after the engine's own stagger); `c.cancelBusy(...ids)` cancels the boss's current windup, cast or string (all, or only the listed ability ids) and clears its scheduled follow-up hits. Data fields `poise`, `poiseRegen`, `poiseDelay`, `hyperArmor` already exist in `types/enemies.ts` |
| **SP-P2** (new) | Attack strings | `EnemyAbility.string?: { hits: number; gap: number \| number[]; coefMul?: number[]; anims?: string[] }`: after the windup the ability repeats its hit `hits` times; hit i lands `sum(gap[0..i-1])` seconds after the first (a single `gap` number repeats); the last gap is the delayed swing and shows the colour glow; each hit re-aims at the current target, re-shows its telegraph, applies `coef x coefMul[i]` and uses `anims[i]` (default the ability anim); parry applies per hit; the F10 limit of 3 simultaneous melee swings still holds. Statuses of the ability apply on hit 1 only unless a hit lists its own |
| **SP-P3** (new) | Leaps, dives, blinks | `leap(...)` builder = `charge` with `params.leap = 1` and `params.landR`: parabolic jump (about 2 m high) over `params.dash` seconds, telegraph line plus a landing ring of radius `landR`, damage on landing, `parryable: false`; boss scripts use `c.teleportTo(x, z, arcSeconds?)` (arc or instant with a puff) and `c.setHover(h)` for dives |
| **SP-L1** (new) | Named loot and specials | `data/loot.ts`: `secondChance` and a named-item pool per table (`uniqueIds` with equal weights, `uniqueChance` per player); 12 new `special.id` handlers for the items of §5.6 (`leg_les_curukkemik`, `leg_les_kanemici`, `leg_les_cukur_kalkan`, `leg_les_amarth`, `leg_les_ruh_hasadi`, `leg_les_kanat_omuz`, `leg_les_dikisat`, `leg_les_onluk`, `leg_les_mumya_tomu`, `leg_les_nalthor`, `leg_les_ayaz_tac`, `leg_les_surgun_muhru`) in the combat module (`G.character.hasSpecial` / `specialParams`); a shoulders base if missing |
| **SP-F1** (new) | Model swap table | `data/enemyModels.ts`: the `MODEL` table pattern of §2.8 (`{ fallback, final }` per NEW model, `USE_FINAL_MODELS` and the `M(key)` accessor) so a def never names a GLB that does not exist; the content check of SP-13 rule 6 reads it. **Props too:** the `gen_props` registry entry of every `les_*` prop carries `{ fallback: { model, scale, tint, emissive? } }` (the table in §2.7), and `PropPlacement` resolution loads the fallback while the final GLB is missing |

**Canonical ids.** `docs/dungeons/_shared_primitives.md` merges the local numbers of all 8 dungeons into `SPX-nn`. Mapping for this document: SP-01 = SPX-01; SP-07 = SPX-02; SP-14 = SPX-03; SP-11 = SPX-04; SP-02 = SPX-06; SP-03 = SPX-08 (device_lock) and SPX-10 (devices); SP-04 = SPX-18 and the boss-kit helpers (`lineHit`, `banish`, `corpseBlast`, `cancelBusy`, `teleportTo`, `setHover` are new members of SPX-13 to SPX-21); SP-05 and SP-10 = SPX-24; SP-06 = SPX-25; SP-08 = SPX-34; SP-12 = SPX-33; SP-13 = SPX-30; **SP-V1 replaces the old optional SP-09 and is the SPX-07 verticality primitive; it adds `RoomDef.stairs` strips and `terraces` (this dungeon needs strips of any length, not only `rampZone`) and does not need lifts**; SP-V2 = new members of SPX-27 (`PropPlacement.y`, `nocollide`, `hang`) plus `RoomDef.emitters`; SP-V3 = SPX-07 (fall plane) with the SPX-25 zone looks; **SP-P1, SP-P2, SP-P3 = SPX-22 (posture, strings, recovery)**, with one difference to settle: this dungeon uses the **existing engine poise** (`EnemyDef.poise`, `poise:break`, GDD_V2 §3.4 and §3.5, already in `Combat.addStagger`) instead of a second posture system, and its string field is `EnemyAbility.string = { hits, gap, coefMul?, anims? }` (a superset of SPX-22's `params.string / gap / hold`); SP-L1 = SPX-32; SP-F1 is new (a model and prop fallback table; it can join SPX-01).

### 8.3 Dungeon-specific handler specs

`lu_cs_gorge` (Leş Kurdu, kind `custom`, in `ai/abilities.ts`):

```ts
lu_cs_gorge: {
  resolve(ai) {
    const n = ((ai as any).gorge ?? 0) + 1;       // keep the count on the AI instance (or a WeakMap)
    (ai as any).gorge = n;
    ai.dmgMul *= 1.3;                              // +30% physical damage per stack
    G.vfx.spawn('necrotic_hit', [ai.e.position.x, 0.6, ai.e.position.z], { scale: 0.7 });
    if (n >= 5) {                                  // Carrion Eruption
      for (const p of ai.world.players) if (!p.isDead) statusPlayer(p, 'poison', 30, { stacks: 3, magnitude: 0.3 });
      bossMsg('boss_toast', {}, { text: 'Leş Patlaması!' });
      ai.e.kill?.();                               // dies, which also drops the gas pool (onDeath)
    }
  },
},
```

Aliases: `CUSTOM.lu_lt_drain = CUSTOM.crypt_wraith_drain;` (check the `d > 17` leash is acceptable for range 13) and the passive `lu_zh_armor` points at the `bone_golem_armor` passive handler with `{ hpBelow: 0.5, shieldPct: 0.15, duration: 10 }`.

### 8.4 Layout verification (done by script, repeated by SP-13)

For this revision a script checked: every room inside the 80 x 64 grid; no two rooms overlap (27 rooms, 0 overlaps); every door tile lies in room `a` on its `side` edge and the tiles across the edge belong to room `b` for the whole door width (26 doors, 0 errors); every pack centre, boss position, device, pickup, shrine, chest, rift spot and exit lies inside its room (0 errors); every pack's `forces` equals the sum of its members (37 packs, 0 mismatches); totals mandatory 451, optional 112; **heights:** all 26 doors join within 0.05 m, the 17 strips have gradients between 0.075 and 0.325, every small step is at most 0.45 m, every boss, device, pickup, shrine, chest, Font and exit stands on a flat tile; **blocked zones:** no boss, pack centre or object inside a blocked circle or rect (with the margins of SP-13 rule 3); **patrols:** the nearest other pack centre is 13.2 m (p05), 14.0 m (p16), 13.6 m (p22) away, all at least 12 m; pickups and devices are at least 2.6 tiles from the nearest pack centre (chests 2.7); rift spots are at least 15 m apart.

### 8.5 Acceptance checklist (the single Haiku QA pass)

1. The dungeon starts at `giris` in daylight, Font of Power works, countdown, barrier opens.
2. The atmosphere changes room by room (bright forecourt, green plague, grey-green toll, golden court, white cloud bridge, dark green Stitchwerks, violet Zolramus, blue summit); boss music on engage.
3. **Height:** the player can walk the whole critical path from y 0 down into the pit (-5.2) and up to the summit (+36), melee works across a stair strip and misses across a 3 m height difference, falling off the Kemik Köprü costs 25% HP and returns the player to the deck, enemies follow over the strips.
4. Doors: boss locks close on engage and open on kill or wipe; `dus_meydan` locks from both sides; the `device_lock` skip opens after `dev_gd2` and not before.
5. Each of the 13 pickups can be taken and used once; the orb interrupts a Toplayıcı drain and takes 4% of a trash pack's HP per tick; the hammer stuns a Canavar and breaks its poise; the spear takes 30% of a Savaşçı's HP and 1.5% of a boss's.
6. Trash: a Savaşçı 2-hit string, an Öncü 3-hit string with the delayed lunge, a leap with a landing ring, a Canavar perilous Pençe with the red glyph, a poise break on each elite type, the skull swarm pops on death.
7. Boss 1: the 3-hit claw string, the leap landing, worms explode at 5 stacks and the gas silences and roots, a poise break during Kusma cancels the worms. Boss 2: seven minions, Final Harvest removes them and corpse circles show, the scythe string with the perilous overhead, the dive and the 4 s grounded window, a poise break cancels the Volley. Boss 3: a hook across the table drops him (the platform disc counts, 8 m pad), the escape returns him, fog hurts within 18 m of the island, the Creeping Sutures sweep, the Fixation ends in the leap, a poise break delays the escape. Boss 4: the 3-hit blade string, Comet, Binds (root, nova on expiry or dispel), Aegis, the blink backhand, Exile (DPS only, never the healer) and return, the lance and the ring in phase 3, a poise break cancels a cast and halves the Aegis.
8. Forces: 451 mandatory reachable, 100% completes the run only after boss 4, route B reaches 100% with all three optional rooms (455), no patrol body-pulls another pack.
9. Wipe on each boss resets cleanly: adds, zones, immune, exiled players, fog, poise.
10. Online smoke test with two clients: the exile teleport, the device use, and the dungeon item hit are replicated; no desync of enemy ids; heights are the same on both peers.
11. Loot: each boss chest gives its guaranteed item; forcing `uniqueChance` to 1 drops each of the three named items; their effects fire.

### 8.6 Assumptions and open questions

* Fight times and the 1.055 per-key factor are estimates; SimBench decides. Boss HP multipliers (95, 112, 60, 165) are set so the +10 targets of §5 hold with the CORE_MECHANICS x2.0 curve; LES-00 makes the code match that curve first (open: which of the two curves the project wants as the final one; if the code curve stays, lower all four multipliers by about 15%).
* Route B timing (1:36 slower) comes from a simple per-pull model; open question: should the route be made time-neutral by moving 15 to 20 optional forces into the Servis Geçidi side rooms, or stay a pure safety route?
* The `string`, `leap` and `onPoiseBreak` primitives are small engine additions; open: whether the existing `bruiser` profile (3 lights and a heavy) should become the generic implementation of `string`.
* The poise numbers (900, 1000, 700, 1200 for bosses, 240 to 360 for elites) assume the GDD_V2 parry values (+120 on a boss, x3 at 5 players); SimBench or a playtest has to confirm that a tank who parries can break a boss about every 30 s, not every 10 s.
* Stair gradients up to 0.325 assume the engine's slope handling works as the town stairs do (`TownDef.stairs`); if the camera or the nav needs gentler slopes the four steepest strips (Kemik Köprü, Yukarı Merdiven, Kemik Basamaklar at 0.325) can be lengthened by moving a wall, no layout change needed elsewhere.
* The research file marks some WoW details as conflicting (Blightbone worm vs maggot, Final Harvest damage numbers, Frozen Binds removal spread, the Goliath being disabled in M+): this design chose the more mechanical reading and a lenient Binds dispel (half coefficient). Goliaths are kept as optional buff devices because they give route choices and do not scale damage.
* Dark Exile avoids immune players (skip) instead of a hard class check, because the game has no Blessing of Protection equivalent on every healer; paladin immunities and any `invulnerable` status work. It now never picks the tank or the healer.
* `tank_stack` is a generic status so other dungeons can reuse it for their own swap bosses.
* New models are all optional: every NEW prop and creature has a fallback in an existing asset (§2.8 table, §2.6 for props), so the dungeon is playable before the Blender work lands.
* The WoW original has no lifts, so none are built; the other 7 dungeons may need one (SP-V4, not specified here).

---

## 9. Rejected critique

Everything in the critic's list was accepted except these parts, with the reason:

1. **Patrol p05 reroute `[[28,60],[18,60],[18,58.5],[28,58.5]]` (issue 1).** Rejected as written: the segment at z 58.5 passes 4 m from p06 (23, 57.5) and 6 m from p04 (26.5, 57), well inside the 9 to 12 m pack aggro, so it only trades one body-pull for another. The accepted idea is the lane along the plaza edge; the measured lane is z 60.8 to 61.6 (13.2 m from p06, 15.2 m from p04). p16 (south half of the courtyard) and p22 (east half of the lobby) follow the critic's suggestion with measured lanes.
2. **"Re-derive the 3:30 kill time with about 20% DPS loss" (issue 6).** Partly rejected: 20% is the DPS-only share at the old 46 s interval; counting tank and healer damage it is 15%, and with the 60 s interval and the `champion_boon` it is a net 6% (§5.4). The eligibility fix (no healer, no tank) and the interval change were both taken; the target kill time stays 3:30 with a stated group DPS of 14.3k without the Exile.
3. **"Set `forcesRequired` to about 420" (issue 7).** Not taken; the alternative offered in the same issue was used: `forcesRequired` stays 430, the Çan Kulesi gets a second pack (+12 optional) and the skip route is recounted (74 skipped forces, p12 moved to a clean position), which gives slack 21 on route A and 25 on route B. The claim that route B is the high-key route was also dropped (it is 1:36 slower, §6.3), which goes further than the critic asked.
4. **"State clearly that the weapons are utility only and remove them from the answer columns" (issue 5, alternative).** Rejected in favour of the first option the critic gave: the weapons deal a percentage of max HP (30% trash, 12% elite, 1.5% boss, 60% Amarth minions, `weapon_mark` +25% for 10 s), so they stay in the answer columns of §5.2 and §6.3 and stay real at every key level.
