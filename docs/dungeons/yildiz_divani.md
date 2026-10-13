# Yıldız Divanı (`yildiz_divani`) — Mythic+ Season 1 dungeon design (model: Court of Stars)

Status: design v2, 2026-10-13 (v1 critic round applied, user requirements B1-B5 applied). Author: dungeon designer / art director pass (docs only, no code touched).
Scope: one of the 8 Season 1 Mythic+ dungeons (level-60 endgame pool). The four levelling dungeons (Kemik Mahzeni, Kızıl Dökümhane, Buzul Tahtı, Gölge Tapınağı) are unchanged.
Sources used: `docs/ref/dungeons/legion.md` (Court of Stars section), the engine code named in the brief, `docs/GDD_CONTENT.md` §0/§4/§5, `docs/CORE_MECHANICS.md` §6 (pool rule), §13 (verticality), §15 (loot), §16 (creatures), `docs/COMBAT_WOW.md` §2.6, `docs/ROADMAP.md` F10 (windup rule), `docs/assets/*`.
Shared engine work is NOT specified here any more: every "NEW primitive" in this document carries a canonical `SPX-nn` id defined once in **`docs/dungeons/_shared_primitives.md`** (API, owner, mapping from each dungeon doc's local numbers).
Non-commercial hobby project: staying very close to WoW's Court of Stars is the explicit goal. Court of Stars has exactly **3 bosses** (Patrol Captain Gerdo, Talixae Flamewreath, Advisor Melandrus), so the 3-boss minimum of the user's rule is the faithful count; Rezil Gerenth stays an event mini-boss. Where the research file is thin (no layout, sizes, palette or music source), the numbers below are our own.

**What changed in v2 (summary).**
1. Forces normalised: `forcesRequired` 420 -> **450**, available 609 (145%) -> **580 (128.9%)**; default route A' has **slack 7 without the spy event and 17 with it** (§1.5, §6.1, §6.2). The spy hunt can no longer block completion (§3.6 fallback).
2. **Verticality** (CORE_MECHANICS §13): 8 height levels from -1.5 m to +16.8 m, grand staircases, an arcane lift, a sunken court, a foyer mezzanine, a 24 m ballroom with upper galleries (§3.0, §3.1, §3.4, ASCII side elevation).
3. **12 trash unit types + the Gerenth event unit** (was 11) with 2-4 telegraphed attacks each on the `clamp(0.45 + 0.25 x coef, 0.45, 1.2)` windup rule, a healer, a duelist elite and posture bars on 4 elites (§4).
4. **Boss move sets** gained Elden-Ring-flavoured strings, delayed swings, leaps and a posture / stagger window on top of every WoW mechanic (§5).
5. **Set-dressing list per room** (props with counts, lights, VFX, sounds) for all 21 rooms (§2.6).
6. **Loot**: 3 named build-defining items per boss (§5.4).
7. Shared primitive ids are canonical (`SPX-nn`), see `_shared_primitives.md`; §8 has a real build-once package row (YD-S).

**How to read coordinates (important).** Everything uses the project convention of `src/data/dungeons/kit.ts`:
* Room rects, door tiles and zone rects are integer tile indices `(x, z, w, h)`; north = -Z (up), the run goes from the south (start) to the north (final boss).
* Packs, props, bosses, start, exit, extras use continuous tile coordinates; world metres = `(c + 0.5) * 4`. A room `x=14, w=24` spans continuous 13.5 .. 37.5. **Heights are metres of floor Y** (`RoomDef.floorY`, ramp strips of §3.0), independent of the plan coordinates.
* A global `z` shift of +2 is already applied to every number in this document so that no wall sits on the grid line `z = 0` (Kemik Mahzeni does the same). Grid: `{ w: 62, h: 77 }`.
* The room, door and pack tables (§3.1, §3.2, §4.3), the NPC / shrine / boss / beacon positions, the forces and timing figures were produced and checked by script: no room overlaps, every door tile sits in room `a` with the opposite tile in room `b`, every pack, patrol point and manual point inside its room, route sums and the section clocks recomputed (the v2 pack table has 44 packs, 142 mobs, 570 forces).

---

## 1. Identity

### 1.1 Fact sheet

| Field | Value |
|---|---|
| `id` / names | `yildiz_divani` · **Yıldız Divanı** · shortName `Divan` |
| WoW model | **Court of Stars** (Legion 7.0, Suramar; Dragonflight Season 1 re-run). Gala in a Nightborne mansion, Fel Legion infiltrators, spy hunt, wind-blade final boss |
| Level / difficulties | `levelRange [55, 60]`. Offered on Kahramanlık (enemy level clamp 50..60), Mitik 0 (60) and Mitik+ (60). **No Normal** (endgame dungeon). Entrance min level 55 |
| M+ timer | **30:00 (1800 s)**. +2 at <= 24:00, +3 at <= 18:00 (standard 80% / 60% rule). Raised from 28:00 because the v2 dungeon has a lift ride, more elites and longer boss fights (§6.1) |
| Enemy forces | **450 required** (100%). Every pack summed = **570**, plus 10 from the spy event = **580 available (128.9%)**. The 5 routes of §1.5 reach 451-503 |
| Bosses | **3 formal** (`order` 1, 2, 3; same count as Court of Stars) + 1 event mini-boss (Rezil Gerenth, 10 forces, not in "Boss k/3"). Each boss carries a posture bar (§5.0) |
| Height | 8 floor levels, -1.5 m (canals) to +16.8 m (balcony), net climb 16.8 m along the critical path (18 m of ascent, one 1.2 m descent into the Court); hall ceilings 12-24 m (§3.0) |
| Grid / footprint | 62 x 77 tiles (248 x 308 m), 21 rooms, 2,434 floor tiles (about 3 Kemik Mahzenis) |
| Trash | **12 pack unit types + the Rezil Gerenth event unit** (every pack unit with 2-4 telegraphed attacks) + 4 summoned / mechanic units, 44 packs, 142 mobs |
| Expected clear (+10, 5 players) | tuned group 24:36, average group 27:33 (§6.1) |
| Where | Entrance "Yıldız Kapısı" in **Kadim Diyar** (level 45-60 map, not designed yet; fallback Karakır Bozkırı), see §7 |
| Music | `dungeon_court` (NEW id, SPX-04, §2.10); boss fights `boss` |

### 1.2 Fantasy and lore hook

A moonlit palace gala that never ended. Centuries ago the **Gecedoğan** (our Nightborne: arcane aristocrats who feed on a spring of raw efsun called the **Gece Pınarı**) froze their last night with a ritual and have been dancing in it ever since. The party fills the Cevher Konağı (Jeweled Estate) to the brim: nobles, servants, a band, canals full of lanterns, a garden at midnight. Now the **Zümrüt Alev Ordusu** (our fel-green demonic host) has slipped into the grounds disguised among the guests, and the Müneccim's own first blade, **Danışman Melandros**, has sold them the way to the Pınar. The party must climb from the quay to the roof terraces, break the Legion's grip on the Midnight Court, expose the spy at the ball, and stop the traitor on the balconies before he drinks the well dry.

Tie to our world (Kadim Zindanlar): the **Kadim Anahtar Taşları** (keystones) are splinters of the Müneccim's *Yıldız Haritası* (star chart), the huge gold astrolabe set into the ballroom floor. That is why the Divan's gate only opens to a key, and why the Kehanet Taşı (Font of Power) in the quay room hums when a key is near.

In-game `lore` string (TR, goes into `DungeonDef.lore`):
> Kadim Diyar'ın en yüksek terasında Gecedoğan soyluları, Gece Pınarı'nın gücüyle zamanı durdurdu ve o gece bir daha bitmeyen bir balo başladı. Şimdi Zümrüt Alev Ordusu davetsiz bir konuk olarak konağın kapılarında. Devriye Kaptanı Gerdan kapıları tutuyor, Taliksa Alevçelenk Gece Mahkemesi'ni ele geçirdi, Danışman Melandros ise Müneccim'in sırrını düşmana satmaya hazırlanıyor. Maskeni tak, casusu bul ve Pınar'ı kurtar.

### 1.3 Name map (WoW to Turkish, used everywhere in this doc)

| WoW | In-game (TR) | WoW | In-game (TR) |
|---|---|---|---|
| Court of Stars | Yıldız Divanı | Nightborne | Gecedoğan |
| Jeweled Estate | Cevher Konağı | Nightwell | Gece Pınarı |
| Patrol Captain Gerdo | Devriye Kaptanı **Gerdan** | Duskwatch | Nöbet (Nöbet Muhafızı / Büyücüsü) |
| Talixae Flamewreath | **Taliksa** Alevçelenk | Fel Covenant | Zümrüt Alev Üçlüsü: **Cazşar**, Gözcü **Baalgar**, **İmakutya** |
| Advisor Melandrus | Danışman **Melandros** | Gerenth the Vile | **Rezil Gerenth** |
| Ly'leth Lunastre | **Layleth** Ayyıldız | Chatty Rumormonger / Suspicious Noble | Geveze Dedikoducu / Şüpheli Soylu |
| Burning Legion (fel) | Zümrüt Alev Ordusu | Grand Magistrix Elisande | Büyük Müneccim (unnamed, off-stage) |

### 1.4 Run structure in one picture

Plan view (heights in §3.0 and the side elevation there). Numbers in brackets are floor Y in metres.

```
 N                                                          (continuous tile coordinates, z shifted +2)
 ┌────────────── BALKONLAR (B3 Melandros) [16.8] ───────┐   z  2..13
 │ Gece Pınarı (NW)            boss (30,8)   exit (36.5,5.5)│
 └───────────────────────┬(29,14) boss_lock ───────────────┘
                 KULE ASANSÖRÜ [7.2 -> 16.8]  (spy_solved event_lock at its south door)
 ┌ Batı Salonu(opt)[7.2]┐ ┌──── ZİYAFET SALONU (ballroom, 24 m hall) [7.2] ─────┐ ┌ RASATHANE(opt)[9.6]┐
 │ chest, rumor6        ├─┤ nobles, rumormongers, 4-pack southern line, patrol  │ │ (up the foyer stairs)│
 └─────────────────────┘ └───────┬────────────────────────────┬──servis_lock──┘ └────────┬────────┘
                                 │ (44,24)                    │(38,32) event_lock        │
                   CEVHER KONAĞI GİRİŞİ (foyer, mezzanine 9.6) [7.2] ◄─ kuzey_kemeri ramp ◄─ boss_exit
                                                              ▲   GECE MAHKEMESİ [3.6] (B2 Taliksa + Zümrüt Alev Üçlüsü)
   skip: Court ► Hizmet Koridoru ► Hizmet Merdiveni ──────────┘             ▲ boss_lock (43,42)
                  YALDIZLI ÇARŞI [4.8] (B1 Gerdan) ──boss_exit──► ZÜMRÜT GEÇİT (ramp 4.8 -> 3.6)
     ▲ boss_lock (13,46)                ▲ boss_lock (25,52)   (two grand stairs up to the plateau)
 KEMER AVLUSU [2.4] ◄ SU KEMERİ ◄ KANALLAR [-1.5] ─ Mana Yuvası(opt)   AY BAHÇESİ [2.4] ── Hizmetçi Avlusu(opt)
                    ▲ (canal route, climbs 3.9 m)                              ▲ SARMAŞIK KEMERİ (ramp 0 -> 2.4)
                    └──────────── AY IŞIĞI İSKELESİ [0] (start, Kehanet Taşı) ──┘
 S
```

### 1.5 Recommended routes (all five reach the 450 requirement)

Forces per area (from the pack table in §4.3, script-checked): iskele 17 · Sarmaşık Kemeri 8 · Bahçe 43 · Hizmetçi Avlusu 24 (optional pocket) · Kanal branch 31 (Kanal Kemeri 4, Kanallar 13, Su Kemeri 4, Kemer Avlusu 10) · Mana Yuvası 8 (optional) · Çarşı 86 · Zümrüt Geçit 29 · Mahkeme 38 · Kuzey Kemeri 12 · Foyer 58 · Rasathane 10 (optional) · Ballroom 118 · Batı Salonu 36 (optional) · Servis 28 (skip route only) · Kule 24 · Spy event +10.

Mandatory spine (every route) S = iskele + Çarşı + Geçit + Mahkeme + Kuzey + foyer + ballroom + Kule = **382**.

| Route | Path | Forces without spy / with spy | Notes |
|---|---|---|---|
| **A' "Bahçe + Avlu" (default)** | iskele, Bahçe, Hizmetçi Avlusu, Çarşı, Geçit, Mahkeme, foyer, ballroom, spy, Kule | **457 / 467** (slack **7 / 17**) | Slack is enough to skip the garden patrol (6) or the quay wyrms (4) plus one more small pack. 113 m start to market (plus 2.4 m climb) |
| **A+ "Rasathane"** | A' + Rasathane (up the foyer twin stairs) | 467 / 477 | +10 forces for a 31 s detour, the best view in the dungeon and a lore nook |
| **A++ "Batı Salonu"** | A' + Batı Salonu | 493 / 503 | Slack for deaths; the salon rumormonger gives a bonus clue (§3.6) |
| **B "Kanal"** | iskele, Kanal branch, Mana Yuvası, Çarşı, ... foyer, ballroom, **Batı Salonu**, spy, Kule | **457 / 467** | +111 m of walking (+3.9 m climb up the Su Kemeri stair), about 20 small swarm mobs, fewer elites than the garden and yard. Needs the salon so the sum equals A' |
| **C "Hizmet yolu" (skip)** | A' with the servants' passage instead of kuzey_kemeri + foyer (skips 70 forces and the foyer patrol), plus Batı Salonu | **451 / 461** (slack 1 / 11) | Needs a Rogue-class or Kuyumculuk member to open `servis_kilidi`; lands you next to the Construct pack in the ballroom. Slack 1 without the hunt: every pack must die |

The surplus (28.9%) is meaningful because it sits outside any single route: the other branch, the salon, the observatory and the servants' stair hold 113 forces that a given run does not need. The spy event is never required for 100%: A' reaches 457 without it (§6.2).

---

## 2. Art direction (as close as possible to Court of Stars)

Court of Stars in one sentence: **a rich Nightborne mansion at night, cold arcane-blue moonlight outside, warm candle-gold gala light inside, overgrown vines at the entrances, with green fel fire where the Legion has taken over.** The art is a three-colour argument: indigo/cyan (the city), gold (the party), green (the invaders).

### 2.1 Palette (hex)

| Role | Hex | Used for |
|---|---|---|
| Gece laciverti (night indigo) | `0x0c1230` (fog / background), `0x141a3a` (deep shadow) | sky, fog, shadow side of every wall |
| Arcane cyan | `0x4aa8ff` (main), `0x9fe0ff` (highlight), `0x6ac8ff` (lantern light) | Gece Pınarı, canals, lanterns, arcane FX, Seal Magic |
| Gümüş mermer (silver marble) | `0xd8dcf0` (raw), builder result about `0x9e93d6` on walls / `0xe0e4ff` on floors | stone, statues, balustrades |
| Mum altını (candle gold) | `0xffc860` (light), `0xc89030` (trim) | chandeliers, gilded trim, torches, astrolabe |
| Menekşe (violet) | `0x7a4ad0`, accent `0xb050d0` | Shadow Mistress, nobles' robes, spell glows, entrance portal swirl |
| Sarmaşık yeşili (overgrown) | `0x3a6a48`, moss `0x58825a` | vines on entrances, garden, canal banks |
| Zümrüt Alev (fel) | glow `0x58ff70`, dark `0x1a5a30`, infernal accent `0xff7a20` | Legion units, Court of Talixae, Fel Detonation |
| Soylu kızılı (noble crimson) | `0xb03040` | one robe colour, banners behind Gerdan, entrance emblem gem |

Rule of thumb for any new asset: indigo base, silver-white stone, gold only on edges and light sources, cyan only on things that are magic, green only on things that are invaders.

### 2.2 Materials and textures

* Stone: KayKit dungeon floor/wall atlas, tinted. Theme tint `0xe0e4ff` (near-white blue) times `temple` wall tint `0xb4a4d6` gives lavender-silver walls `~0x9e93d6`; `brick` walls (`0xe6c4aa`) give a warm interior tone (ballroom, foyer, salons, service area), which is the cold-outside / warm-inside contrast.
* Floors: `tiles` (chequerboard, alternate squares 72% brightness) is **the** marble look: quay, market, court, ballroom, foyer, balcony. `stone` + weeds for garden and arches, `stone_dark` for canals and the fel corridor, `wood` for service rooms and the West Salon, `dirt` for the yard and the nest.
* Overgrown entrances: `ip('psx-medieval','decoration/vine_hanging' | 'vine_hanging_alt' | 'vine_corner' | 'vine_single')` on every arch and doorway (the research file names overgrown vines at the building entrances as a signature).
* Water: `ZoneDef kind 'pool'` (blocked) with `color 0x0a3a6a, glow 0x4ac0ff, glowIntensity 0.5`, plus `bridge` zones. Glass/crystal: `gp('crystal_blue')` and `gp('crystal_purple')` with emissive.
* Gold: only via emissive trim on NEW props and vertex-colour highlights; no gold base materials.

### 2.3 Lighting rig

`DungeonTheme` literal (feeds `setupTheme`: one shadow-casting cool "moon" directional light derived from `hemiSky`, one rim fill, hemisphere + ambient, max 8 real PointLights from `LightPool`, everything else fake glow):

```ts
const THEME: DungeonTheme = {
  fogColor: 0x0c1230, fogNear: 14, fogFar: 64,           // wider than the crypts (6-8 / 34-38): these rooms are 100 m halls
  ambient: 0x3a4aa0, ambientIntensity: 0.42,
  hemiSky: 0x8a9cff, hemiGround: 0x1a1030,                // moon colour comes from hemiSky lerp(white, .35)
  torchColor: 0xffc860, bloomStrength: 0.6,               // arcane glow needs more bloom than crypt 0.3
  music: 'dungeon_court',                                 // NEW MusicId, aliased to 'dungeon_shadow' until composed
  palette: [0x0c1230, 0x4aa8ff, 0xd8dcf0, 0xffc860, 0x58ff70],
  tint: 0xe0e4ff,
  // NEW (SPX-05): sky: { image: '/assets/sky/itch/psx-skyboxes-free/night-moon.png', stars: true }
};
```

Per-room overrides (`RoomDef.fog`, `lightColor`, `ambientVfx`):

| Room(s) | fog `{color, near, far}` | lightColor | ambientVfx / note |
|---|---|---|---|
| `iskele` | `0x101c44, 16, 70` | `0x7fd0ff` | `ambient_dust`; elevator ring glows cyan |
| `kanal_kemeri`, `kanallar`, `su_kemeri`, `mana_yuvasi` | `0x0a2a48, 10, 50` | `0x4ac0ff` | `ambient_dust`; water decals pulse |
| `kemer_avlusu`, `bahce_yolu`, `bahce` | `0x101c44, 18, 80` | `0xa8b8ff` | `ambient_embers` recoloured `0xc8ff80` = fireflies |
| `hizmetci_avlusu` | `0x161c40, 14, 60` | `0xffd890` | lantern-lit yard |
| `yaldizli_carsi` | `0x14204e, 18, 80` | `0xffd890` | plaza lit by lantern posts, cyan beacons |
| `fel_gecidi`, `gece_mahkemesi` | `0x082414, 10, 46` | `0x58ff70` | `ambient_embers` green; greener and tighter than everything else |
| `kuzey_kemeri`, `servis_a/b`, `kule_merdiveni` | default | `0xffd890` | corridors |
| `ev_girisi`, `ziyafet_salonu`, `bati_salonu` | `0x1a1430, 20, 90` | `0xffd890` | warm gold gala interior, `ambient_dust` as candle haze |
| `rasathane` | `0x10183c, 20, 80` | `0xb8c0ff` | open observatory |
| `balkon` | `0x0e1a48, 24, 110` | `0x9fe0ff` | open-air; sky backdrop; wind banners |

Real-light budget (8 real PointLights at a time; the rest are halo sprites): ballroom = 3 warm chandelier lights (`0xffc860`, intensity 2.2, distance 14) + 2 fake; market = 4 cyan beacon lights (`0x6ac8ff`, 1.6, 12); court = 3 green braziers (`0x58ff70`, 2.0, 12) at the covenant spots; balcony = Nightwell (`0x9fe0ff`, 2.6, 16) + 2 lamp posts; garden = fountain crystal + 2 lightposts. Torches default `0xffc860`.

Height and fog: the tall halls (foyer 16 m, ballroom 24 m) use the wide fog values above; the market and the court are open to the sky, so their fog is the same as the garden. Rooms at different heights see each other (the court from the market deck, the ballroom from the galleries), so the fog `far` of every open room is never below 60 m.

### 2.4 Sky and backdrop

Court of Stars is a night city, so the sky matters (it is visible over every wall and around the balcony). `DungeonBuilder.setupTheme` currently sets `scene.background` to a flat `fogColor`; **SPX-05 (NEW)** adds `DungeonTheme.sky`:
* `/assets/sky/itch/psx-skyboxes-free/night-moon.png` (CC BY 4.0, dithered full moon, horizon fog `#212c46`, light `#5a83ff` x0.22) as the default backdrop for the whole dungeon; `NearestFilter` equirect as in `docs/assets/itch-psx-env.md` §0.
* Balcony only: a second panorama `/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-11.jpg` (violet twilight, fog `#604ca0`) behind the far wall, so the final room has the sunset-bay colours of the real balconies. Stars via the existing `Sky.ts` `stars: true` option as a fallback when the image is missing.
* Skyline silhouettes (props outside the walls): `ip('nocturnal-watch','tower')` x3 and `kc('tower-square-roof')` x5 scaled 2-3 at z <= 1 behind the balcony, plus two tall `ys_arch_gate_nightborne`-style pylons as the "Nighthold" landmark.

### 2.5 Landmark set pieces in run order (with height)

1. **Ay Işığı İskelesi (Moonlit Landing) [y 0]** — arrival by the **Yıldız Asansörü**, a round glowing elevator platform (NEW prop) at the south edge; a marble quay with lantern posts, banners of the Divan (indigo, gold crescent and star), black water 1.2 m below the quay edge, and a vine-wrapped arch gate to the north. The Kehanet Taşı sits two tiles north of the start. First frame: dark water and cyan lanterns to the west, gold-lit mansion windows far to the north and above (the whole dungeon is visibly stacked up the hill).
2. **Mana Kanalları [y -1.5]** — moonlit canals in a sunken basin: the banks are 4 m of retaining wall under the Kemer Avlusu terrace, arched bridges, floating cyan lanterns, shoals of glowing mana-feeders in the water, a hidden nest chamber behind a crystal-choked archway (the "Hivemind" corner of the original). Climbing out of it by the Su Kemeri stair (3.9 m) is the first big "going up" moment.
3. **Kemer Avlusu / Sarmaşık Kemeri [y 2.4]** — stone archways swallowed by vines; a small court with a dry fountain; the Sarmaşık Kemeri is a 5-tile ramp of broad steps from the quay.
4. **Ay Bahçesi [y 2.4]** — midnight garden on the first terrace: topiary star/moon/spire hedges, a round moon fountain with a crystal on top at the centre, a white-iron gazebo (Çardak) with wisteria on the east side, benches, fireflies, hedge borders making loose lanes. At its north end a **grand stair (4 wide, 2.4 m rise)** climbs to the market plateau between two plinth statues.
5. **Yaldızlı Çarşı (Gilded Market) [y 4.8]** — a plaza on the plateau: silk-canopied stalls, a raised colonnade ring with banners hanging to 9 m, statues of Müneccims, a central rune sigil; **four Sinyal Fenerleri** (gold-caged crystal pylons) at the corners that Gerdan uses to call the watch. The garden stair enters from the south, the west court stair from the west; the terrace wall drops 2.4 m below the plateau on both sides.
6. **Zümrüt Geçit [y 4.8 -> 3.6]** — the same colonnade after the Legion arrived, descending a gentle ramp into the fel: chains, cages of captured guests, fel obelisks, green braziers, cracks in the floor.
7. **Gece Mahkemesi (Midnight Court) [y 3.6, sunken]** — a courtyard one level below the market: a ring of three broad decorative tiers climbs the walls behind a ring of fel obelisks, a corrupted moon-fountain in the centre, cracks that glow, three braziers at the covenant spots, Taliksa's fel altar on the east side. Looking up from the pit you see the market banners 8 m above.
8. **Kuzey Kemeri + Cevher Konağı Girişi (foyer) [y 3.6 -> 7.2, mezzanine 9.6]** — the corridor ramps up 3.6 m into the grand entrance hall (16 m ceiling): **twin curved grand staircases** (walkable) rise on both flanks to a gold-balustraded **galeri sahanlığı** (mezzanine) over the north wall, two crystal chandeliers, statues, mirrors, rugs; the point where the colour palette flips from cold to warm. The observatory door is on the mezzanine.
9. **Ziyafet Salonu (ballroom) [y 7.2; stage 8.1; dance floor 6.75; 24 m ceiling]** — the gala: chessboard marble, a huge gold **Yıldız Haritası** (astrolabe) inlaid in a sunken dance circle, five crystal chandeliers on 5 m chains, **a ring gallery at 14 m** full of leaning guests, long banquet tables, a raised stage with a band, dancing couples, eight arched windows to the night with moon shafts. Warm, loud, beautiful: the set piece the whole dungeon is remembered for.
10. **Kule Asansörü [y 7.2 -> 16.8]** — a short marble hall with an arcane **lift cage** (a 2 x 2 tile platform in a gold-ringed shaft, 9.6 m rise, 6 s ride); blocked by a violet curtain until the spy is caught. The shaft walls are glass: you watch the ballroom chandeliers sink away below you.
11. **Balkonlar (Balconies) [y 16.8]** — an open terrace above the bay, the highest point of the run: balustrade, tall banners in the wind, the **Gece Pınarı** (a cyan-white column of light in a stepped basin) in the north-west corner, the whole dungeon visible as a lit staircase of roofs far below, the sky wide open.

### 2.6 Set dressing per room (props with counts, lights, VFX, sounds)

This is the build list for `decorator()` calls (YD-4). Helpers and the real paths they resolve to (all under `public/assets/models/`, every existing name below was checked against the folders):

| Helper | Path | Helper | Path |
|---|---|---|---|
| `dg('x')` | `dungeon/x.glb` (KayKit Dungeon, scale 1) | `kf('x')` | `kenney/fantasy-town-kit/x.glb` (scale x4) |
| `hw('x')` | `halloween/x.glb` (scale 1) | `kc('x')` | `kenney/castle-kit/x.glb` (scale x4) |
| `fu('x')` | `furniture/x.glb` (scale 1) | `kg('x')` | `kenney/graveyard-kit/x.glb` (scale x3) |
| `gp('x')` | `gen/props/x.glb` (generated, scale 1; creatures `gen/creatures/x.glb`) | `ks('x')` | `kenney/survival-kit/x.glb` (scale x3) |
| `ip('pack', 'x')` | `itch/<pack>/x.glb` (`psx-medieval`, `psx-dungeon`, `nocturnal-watch`) | characters / monsters | `characters/<Class>.glb`, `monsters/<Name>.glb`, `itch/creatures/<name>.glb` |

Rules for every room: counts are targets, positions are the coder's choice with `p.at / p.row / p.ring / p.wall / p.torches`; `Lights` lists **real** PointLights (max 8 live at once, budget in §2.3) first, fake halos second; `ambientVfx` is the per-room ambient from §2.3; sound ids are existing audio ids unless marked **(NEW)** (SPX-04 registers them with aliases to existing files). Every wall that borders a height change gets a balustrade or retaining wall so the drop reads. Heights in brackets are floor Y.

**`iskele` Ay Işığı İskelesi [0.0, open sky]**
* Props: `dg('pillar_decorated')` x6 (tint `0xd8d8f0`, quay edge), `gp('lamp_post')` x4 (cyan), `ys_banner_divan` x4 on the pillars, `hw('arch_gate')` x1 at the north door, `kg('urn-round')` x4 (gold tint), `gp('crystal_blue')` x3, `ip('psx-medieval','decoration/vine_hanging')` x6 on the arch, `dg('barrel_small_stack')` x3 and `dg('crates_stacked')` x2 (quay clutter), `kg('iron-fence')` x14 along the water edge, `gp('font_of_power')` x1, `ys_elevator` x1 at the start.
* Height: quay edge 1.2 m above a decor water plane outside the walls (railed); the Sarmaşık Kemeri ramp starts at the north door; the Kanal Kemeri ramp starts at the west door.
* Lights: 2 real cyan (`0x7fd0ff`, 1.6, 12) at the lamp posts nearest the start, elevator ring light (fake); 2 fake lamp halos. VFX: `ambient_dust` cyan, `portal_swirl` (cyan) on the elevator ring, `candle_flame` on lantern tops, `gp('font_of_power')` pulse when a key is near. Sounds: `water_lap` (NEW) bed, `amb_wind` very low, `lift_hum` (NEW) once on arrival.

**`kanal_kemeri` Kanal Kemeri [0.0 -> -1.5, ceiling 6]**
* Props: `hw('lantern_hanging')` x6 (cyan, y 3.9), vines x4, `dg('stairs_wide')` x3 (the ramp steps, visual), `hw('post_lantern')` x2 at the ramp foot, `dg('wall_arched')` auto. Lights: 2 fake cyan. VFX: `ambient_dust`. Sounds: `water_lap` rising, `amb_dungeon_bed` (echo).

**`kanallar` Mana Kanalları [-1.5, open]**
* Props: `kc('bridge-straight-pillar')` x4 (visual bridges; decks are `bridge` zones), `hw('post_lantern')` x8 (cyan), `gp('crystal_blue')` x8 in the water, `gp('rock_medium')` x6 on the banks, `kg('iron-fence')` x10 railings, `dg('candle_lit')` x12 on the water edge, `kc('wall')` runs x10 as the 4 m retaining wall (tint `0xd8dcf0`) with 3 arched drains (`dg('wall_arched')` x3) and `ip('psx-medieval','decoration/vine_hanging')` x8, optional `ys_gondola` x2.
* Height: banks 4 m below the Kemer Avlusu terrace; bridge decks y -1.2 (0.3 m arch over the channels).
* Lights: 2 real cyan (`0x4ac0ff`, 1.4, 10) at the middle bridge, 8 fake post halos. VFX: `ambient_dust`, water decals pulse, 6 `waypoint_glow` (cyan) hovering over the channels as mana shoals, `arcane_burst` ripple on every feeder pop. Sounds: `water_lap` (NEW), `wind_loop_01` low-passed, feeder squelch = `enemy_idle` pitched down.

**`su_kemeri` Su Kemeri [-1.5 -> 2.4, ceiling 8]**
* Props: `dg('stairs_wide')` x3 flights (visual steps on the strip), `hw('lantern_hanging')` x6 (cyan), vines x6, torches x2. Lights: 2 fake cyan. VFX: `ambient_dust`. Sounds: `amb_dungeon_bed`, `water_lap` fading behind you.

**`kemer_avlusu` Kemer Avlusu [2.4, open]**
* Props: `kf('wall-arch')` x4, `kf('fountain-square-detail')` x1 (dry, rubble), `hw('fence_pillar')` x6, `dg('pillar_decorated')` x4, `kf('hedge-large')` x4, `kg('lightpost-double')` x2, east grand stair `kf('stairs-wide-stone-handrail')` x1 (scaled to 3 tiles) with `kf('balcony-wall-fence')` x6 on both sides, vines x6, `gp('crystal_blue')` x2 in the fountain.
* Height: the east stair rises 2.4 m into the market; the west and south sides are 4 m tall retaining walls over the canals.
* Lights: 1 real cool (`0xa8b8ff`, 1.4, 10) at the fountain, 2 fake. VFX: fireflies (`ambient_embers` `0xc8ff80`). Sounds: `amb_wind` low, `water_lap` far.

**`mana_yuvasi` Mana Yuvası [-1.5, cave, ceiling 10]**
* Props: `gp('crystal_blue')` x6 clusters (emissive), `gp('rock_large')` x2, `gp('bone_pile')` x3, `gp('chest_iron')` x1, 4 egg props (`tag: 'wake'`, as in `kemik_mahzeni.ts`), `ip('psx-dungeon','skull_wall')` x2. Lights: 3 fake cyan from crystals. VFX: `ambient_dust`, `arcane_burst` pulse on a crystal every 6 s. Sounds: `amb_dungeon_bed`, `whisper` at 20%.

**`bahce_yolu` Sarmaşık Kemeri [0.0 -> 2.4, ceiling 6 (arch)]**
* Props: `hw('arch')` x2, vines (`vine_corner`, `vine_single` x8), `hw('post_lantern')` x2, `dg('stairs_wide')` x5 steps (visual), `kg('urn-round')` x2. Lights: 2 fake cyan. VFX: fireflies. Sounds: `amb_wind` low.

**`bahce` Ay Bahçesi [2.4, open]**
* Props: `kf('fountain-round-detail')` (x4, tint `0xd8e0ff`) at (28.5, 56.5) with a `gp('crystal_blue')` on top, `kf('hedge-large' / 'hedge-large-curved' / 'hedge-large-gate')` x14 borders, `hw('bench_decorated')` x4, `hw('path_A..D')` x10, `gp('flowers')` x12 / `gp('bush_a')`, `gp('bush_b')` (tint `0x58825a`) x10 / `gp('grass_tuft')` x20 scatter, `gp('tree_oak_a')` x2, `kg('lightpost-single')` x6 (cyan), `kg('altar-stone')` x1 (shrine), `ys_topiary_star/moon/spire` x6, `ys_gazebo` at (37, 57); north grand stair: `kf('stairs-wide-stone-handrail')` x1, `kc('wall-narrow')` x6 balustrade, `gp('statue_hooded')` x2 on plinths at the stair head, `ys_banner_divan` x2.
* Height: the stair (24..27, 52..54) rises 2.4 m to the market; the stair sides are blocked (balustrade); the terrace wall behind it is 2.4 m of `kc('wall')`.
* Lights: 3 real (fountain crystal cyan `0x6ac8ff` 1.6/12, 2 lightposts); the other 4 lightposts fake. VFX: fireflies, `holy_burst` (cyan) pulse on the fountain crystal every 10 s, `candle_flame` in the gazebo. Sounds: `water_lap` at the fountain, `amb_wind` very low, silence in the hedges.

**`hizmetci_avlusu` Hizmetçi Avlusu [2.4, open]**
* Props: `ip('psx-medieval','market/crate*','barrel*')` x10, `dg('crates_stacked')` x3, `gp('wagon')` x1, `gp('well')` x1, `hw('fence_gate')` x1, `fu('cabinet_medium_decorated')` x1, `ip('nocturnal-watch','npc_maid')` x2 (static staff), `gp('chest_gold')` x1, `kg('altar-stone')` x1 (shrine), a timber side gallery at 5 m (non-walkable) from `ip('psx-medieval','building/*')` wall pieces, `hw('lantern_hanging')` x6 along it, laundry lines (`kc('flag-pennant')` x6).
* Lights: 1 real warm (`0xffd890`, 1.6, 12) at the well, 4 fake. VFX: `ambient_dust` as cooking haze, `candle_flame`. Sounds: `crowd_murmur` (NEW) at 15% from the main house, `amb_wind` low.

**`yaldizli_carsi` Yaldızlı Çarşı [4.8, open, colonnade ring 10 m] (explicitDecor)**
* Props: `ip('psx-medieval','market/market_stall_blue' / 'red' / 'yellow' / 'round_*')` x10 (indigo/gold tint), `market/table` x6, baskets x8, crates x6, `dg('pillar_decorated')` x10 colonnade (scaled to 10 m), `kf('lantern')` x6 (cyan), `kc('flag-pennant')` x8, `ys_banner_divan` x8 hanging at 9 m, `gp('statue_hooded')` x2 (tint `0xc8d0f0`, scaled 2.2), `ys_signal_beacon` x4 at the corners, rune sigil zone (r 6), `kc('wall')` plateau edge x14 with `kf('balcony-wall-fence')` x10 balustrade, an upper colonnade deck at 8 m (non-walkable) with 6 leaning guests (static).
* Height: plateau 2.4 m above garden and west court (both stairs 4 / 3 tiles wide); the east exit ramps down 1.2 m into the fel corridor.
* Lights: 4 real cyan beacons (`0x6ac8ff`, 1.6, 12); lantern halos fake x6. VFX: beacon pulse (red when armed by Gerdan), `ambient_dust`, `arcane_burst` on the sigil when the fight starts. Sounds: `amb_wind` very low, `ice_chime` on each beacon activation, `boss_great_boss` music on pull.

**`fel_gecidi` Zümrüt Geçit [4.8 -> 3.6, ceiling 8]**
* Props: `gp('brazier')` x3 (green), `ip('psx-dungeon','skull_wall' / 'chain')` x6, `gp('chains_hanging')` x4, `gp('iron_cage')` x2 with static captive nobles (Mage, green-tinted fear idle), `dg('rubble_large')` x3, `hw('bone_*')` x4, `ys_fel_obelisk` x2, `ys_fel_rift` x3 (floor cracks along the ramp). Lights: 3 real green (`0x58ff70`, 2.0, 12). VFX: `brazier_fire` green, `ambient_embers` green, `fire_ground` in the cracks. Sounds: `fire_loop_01` x3 positional, `whisper`.

**`gece_mahkemesi` Gece Mahkemesi [3.6, sunken, ring tiers to 5.0 (decor)] (explicitDecor)**
* Props: `kf('fountain-round-detail')` x5 (cracked, the central one corrupted), `gp('pillar_broken')` x6, `gp('statue_hooded')` x2 (toppled), `gp('altar')` x1 (Taliksa dais, 0.45 m), `gp('brazier')` x3 (covenant spots), `dg('banner_patternC_green')` x4 (torn), `ys_fel_obelisk` x6 ring, `ys_fel_rift` x4, a ring of 3 decorative tiers (`kc('wall')` stepped, x24) with `kc('flag-banner-long')` x8 (crimson, torn) at the top, hanging `gp('chains_hanging')` x6 from the market side above.
* Height: the pit is 1.2 m below the market and has 3 tiers of non-walkable ring seating; the doors (west, north) are on the pit floor.
* Lights: 3 real green (covenant braziers), 6 fake obelisk halos. VFX: `ambient_embers` green, `fire_ground` cracks pulsing, `fire_burst` at every Cehennem Patlaması. Sounds: `fire_loop_01` x3, `whisper`, `boss_epic_battle` music.

**`kuzey_kemeri` Kuzey Kemeri [3.6 -> 7.2, ceiling 8]**
* Props: `dg('wall_arched')`, torches x4, `fu('cabinet_medium')` x1 (the tailor's wardrobe) + `fu('rug_rectangle_A')` at the north end, `dg('stairs_wide')` x4 flights (visual), `ys_banner_divan` x2 (crimson variant). Lights: 2 fake gold. VFX: `ambient_dust`. Sounds: `crowd_murmur` (NEW) fading in toward the north, `waltz_loop` (NEW) very faint.

**`ev_girisi` Cevher Konağı Girişi [7.2, ceiling 16, mezzanine 9.6]**
* Props: `dg('stairs_wide')` x2 mirrored (walkable: ramp zones `foyer_w` / `foyer_e`, curved look by `ys_curved_stair` NEW x2 decor skins), `ys_crystal_chandelier` x2 at 13 m (`ip('psx-dungeon','chandelier')` fallback), `gp('statue_hooded')` x2 (gold tint, on 1 m plinths), `fu('rug_rectangle_stripes_A')` x1, `fu('pictureframe_large_A')` x3, `fu('couch')` x1, `fu('armchair')` x2, `fu('lamp_standing')` x4, `dg('pillar_decorated')` x6 (scaled 16 m), `kg('altar-stone')` x1 (shrine), mezzanine gold balustrade `ys_balustrade_gold` x10 + 4 hanging banners at 6 m, an upper gallery ring at 12 m (non-walkable, `kf('balcony-wall-fence')` x16) with 6 static guests.
* Height: twin stairs rise 2.4 m to the mezzanine (49..52, 21..22), which holds the observatory door and a lore table; the ballroom door is at the same level as the floor.
* Lights: 2 real gold chandeliers (`0xffc860`, 2.2, 14); 4 fake lamp halos. VFX: `ambient_dust` as candle haze, `gold_sparkle` on the shrine. Sounds: `waltz_loop` (NEW, `town_theme_rpg` layer at -12 dB), `crowd_murmur` (NEW), `chandelier_creak` (NEW) every 20-40 s.

**`ziyafet_salonu` Ziyafet Salonu [7.2; stage 8.1; dance floor 6.75; ceiling 24] (explicitDecor)**
* Props: `dg('table_long_tablecloth_decorated_A')` x4 + `plate_food_A/B` x16, `bottle_*` x12, `chair` x16, `ys_crystal_chandelier` x5 at 19 m (3 with `ys_chandelier_rope` winches, §3.5 S11), `ip('nocturnal-watch','tavern_wine_bottle' / 'tavern_bread' / 'tavern_cheese')` x12, stage = `dg('floor_foundation_front_and_sides')` x6 (collide, now a real 0.9 m dais) + `fu('chair_stool')` x5 (band) + 5 static band members (Mage tints, loop `Use_Item`), 8 dancing couples (static loops `Cheer`), `dg('pillar_decorated')` x12 colonnade (scaled 24 m), ring gallery at 14 m (non-walkable): `ys_balustrade_gold` x24 and 18 leaning guests (static), `ys_banner_divan` x10 (12 m tall) on the pillars, `fu('rug_oval_A/B')` x3, `fu('pictureframe_large_B')` x4, `hw('candle_triple')` x6, `gp('statue_hooded')` x2, `ys_astrolabe_floor` at the sunken dance circle, 8 arched windows (auto `wall_archedwindow_open`) with `lightshaft` moon beams x6 (cyan, 3 x 14 x 3 m).
* Height: dance circle (r 5.5 around (28.5, 24.5)) is 0.45 m below the hall floor (a ring step), stage dais 0.9 m above it at the west end (15..22, 19..21, two 0.45 steps), gallery and chandeliers above.
* Lights: 3 real chandeliers (`0xffc860`, 2.2, 14) over the south line, 2 fake; window shafts additive. VFX: `ambient_dust` as candle haze, `gold_sparkle` on the astrolabe, `upgrade_success` flare when the spy is caught, `blink` puff when Gerenth reveals. Sounds: `waltz_loop` (NEW) at full, `crowd_murmur` (NEW), `chandelier_creak` (NEW), `ice_chime` for glass clinks (random 12 s), `choir_swell` on the reveal.

**`bati_salonu` Batı Salonu [7.2, ceiling 12, book gallery decor at 11]**
* Props: `fu('shelf_B_large_decorated')` x4, `fu('book_set')` x6, `fu('armchair_pillows')` x2, `fu('table_medium')` x1, `fu('lamp_table')` x2, `fu('rug_rectangle_B')` x1, `dg('chest')` x1, a non-walkable upper book gallery (`ys_balustrade_gold` x10 + `dg('stairs_wood')` x1 spiral decor), `hw('candle_triple')` x4. Lights: 2 fake amber. VFX: `ambient_dust` motes. Sounds: `amb_dungeon_bed` low-passed, `crowd_murmur` (NEW) at 15% through the wall.

**`rasathane` Rasathane [9.6, open dome 18]**
* Props: `gp('crystal_purple')` x2, `fu('pictureframe_standing_A/B')` x4 (star charts), `kg('pillar-obelisk')` x4, `dg('table_long')` x1, `dg('wall_window_open')` x4, small `ys_astrolabe_floor`, `ys_telescope` NEW x1. Lights: 1 real violet (`0xb8c0ff`, 1.4, 10), the dome is open (stars via SPX-05). VFX: slow orbiting `ambient_dust` stars, `arcane_burst` shimmer. Sounds: `amb_wind` soft, `ice_chime` every 20 s.

**`servis_a` Hizmet Koridoru [3.6, ceiling 6]**
* Props: `dg('barrel_*')` x6, `dg('crates_stacked')` x3, `dg('shelf_small')` x2, `ks('workbench')` x1, `dg('keyring_hanging')` x1, `fu('chair_stool_wood')` x2. Lights: 2 fake amber. VFX: `ambient_dust`. Sounds: `amb_dungeon_bed`.

**`servis_b` Hizmet Merdiveni [3.6 -> 7.2, ceiling 10]**
* Props: `dg('stairs_wood')` x3 flights (strip, visual), `dg('barrel_*')` x4, `hw('lantern_hanging')` x4, the lock panel (`ReqInteract`, §3.7), `dg('torch_mounted')` x2. Lights: 2 real amber (`0xffd890`, 1.2, 8). VFX: `ambient_dust`. Sounds: `crowd_murmur` (NEW) growing as you climb.

**`kule_merdiveni` Kule Asansörü [7.2 / lift / 16.8, ceiling 14]**
* Props: `ys_lift_cage` NEW x1 (2 x 2 tile platform), glass shaft walls, `dg('stairs_walled')` x1 (visual, blocked: the old stair, now sealed), `dg('torch_mounted')` x4, `kg('lightpost-all')` x2, `gp('waypoint_stone')` x1 (call crystal at the lower landing), `ys_banner_divan` x4, `ys_crystal_chandelier` x1 hanging in the shaft, the violet event curtain (`gateStyle 'arcane'`, SPX-09). Lights: 2 real cyan (`0x6ac8ff`, 1.4, 10), violet curtain glow. VFX: `portal_swirl` violet on the curtain, lift ring glow, `ambient_dust` rising in the shaft. Sounds: `lift_hum` (NEW) while moving, `choir_swell` when the spy is solved.

**`balkon` Balkonlar [16.8, open; Nightwell dais 17.25] (explicitDecor)**
* Props: `kf('balcony-wall-fence')` / `kg('iron-fence-border')` balustrade x14 along the north and sides, `ys_banner_divan` x6 (tall, wind-animated), `kf('lantern')` x6, `kg('lightpost-double')` x4, `dg('pillar_decorated')` x8, `gp('statue_hooded')` x4 (gold tint), `ys_nightwell` x1, skyline outside the wall: `ip('nocturnal-watch','tower')` x3 and `kc('tower-square-roof')` x5, a lit rooftop ring far below (`kc('tower-square-roof')` x12 at y -20, fake light dots).
* Height: the whole terrace is 9.6 m above the ballroom; the dais is 0.45 m; the lift landing is the only way in.
* Lights: Nightwell real cyan-white (`0x9fe0ff`, 2.6, 16), 2 real lamp posts; the rest fake. VFX: Nightwell column, `holy_burst` recoloured cyan on poison/drink, wind-blown `ambient_leaves` (optional SPX-04), `ambient_dust`. Sounds: `amb_wind` loud, `wind_loop_01`, `boss_colossus` (choir, drums) on pull.

### 2.7 NEW props to build in Blender (`tools/blender/props/props_ys.py`, `@asset` pattern of `psx_lib.py`, output `public/assets/models/gen/props/`)

Conventions as in `docs/assets/generated-props.md`: 1 unit = 1 m, +Z front, origin bottom centre (except hanging), 16-64 px NEAREST textures with Bayer dither, `COLOR_0` vertex AO, `KHR_materials_emissive_strength` 1.5-3 on glow parts, empty nodes `light_0` / `fire_fx` for lights.

| id | Size W x H x D (m) | Tris | Look (one line) | Nodes / animation |
|---|---|---|---|---|
| `ys_arch_gate_nightborne` | 12 x 11 x 4 | 900 | Entrance gate: two fluted pale-lavender pillars with gold trim and hanging cyan lanterns, a crown with a crescent-and-star emblem around a crimson-violet gem, an arched double door filled with a swirling violet-white portal | `portal_surface` (spin UV), `enter_trigger`, `light_0` x3 |
| `ys_nightwell` | 3.4 x 3.0 x 3.4 | 420 | Stepped marble basin with a column of cyan-white light and rune ring | `column_light` (scroll), `rune_ring` (spin), `motes`, `light_0` |
| `ys_signal_beacon` | 1.4 x 5.0 x 1.4 | 300 | Gold-caged crystal pylon, crystal glows cyan, pulses red when armed | `crystal` (emissive swap), `light_0` |
| `ys_crystal_chandelier` | 3.0 dia x 2.4 | 380 | Gold ring with 12 candle flames and hanging crystal drops (origin at the top like `chains_hanging`) | `flame` cards, `light_0` |
| `ys_astrolabe_floor` | 11 x 0.1 x 11 (small variant 5 x 5) | 40 | Inlaid disc: gold concentric rings and star glyphs, emissive thin lines | `ring_outer` / `ring_inner` (slow counter-spin) |
| `ys_fel_obelisk` | 1.6 x 5.5 x 1.6 | 260 | Jagged emerald-black spire, fel runes glowing, flame cards at the tip | `flame`, `light_0` |
| `ys_fel_rift` | 3.4 x 0.5 x 3.4 | 150 | Floor crack with green fire; also the Infernal Eruption mark | `flame`, `light_0` |
| `ys_topiary_star` / `_moon` / `_spire` | 2.6 x 3.4 x 2.6 | 140 each | Sculpted hedges (leaf cards on a dense core) | - |
| `ys_gazebo` | 6 x 4.5 x 6 | 500 | White iron gazebo hung with wisteria cards and lanterns | `light_0` x2 |
| `ys_elevator` | 7 x 0.5 x 7 | 220 | Round platform with rune ring and four small pylons | `rune_ring` (spin), `light_0` |
| `ys_banner_divan` | 1.74 x 4.75 x 0.7 | 138 | `banner_blue` mesh with a new texture: indigo field, gold crescent and star | `cloth` |
| PROC `eye_orb` (`src/ai/procModels.ts`) | 1.1 dia | - | Dehşet Gözü body: sphere with veined sclera and a glowing iris that tracks the target | spin / hover bob |
| PROC `beacon` (mech entity) | as `ys_signal_beacon` | - | Spawned by Gerdan's script as a breakable `proc_beacon` | - |
| `ys_lift_cage` | 8 x 11 x 8 (platform 7.5 x 0.4 x 7.5, shaft frame 10 m) | 380 | Round-cornered square platform with a gold ring, four gold posts, an arcane crystal at each corner, glass-panel rails; origin at the lower position | `platform` (moved by the lift system, SPX-07), `ring` (spin), `light_0` x2 |
| `ys_chandelier_rope` | 1 x 6 x 1 | 160 | Winch with a coiled chain and a glowing handle, fixed to the wall or a pillar; the interact point for dropping a chandelier | `handle` (interactable), `chain` (hide on drop) |
| `ys_curved_stair` | 8 x 2.6 x 6 | 420 | Curved grand-stair skin (marble treads, gold handrail with scroll ends) laid over a walkable ramp zone; foyer twin stairs | - |
| `ys_balustrade_gold` | 4 x 1.1 x 0.4 (modular) | 120 | Marble balustrade with gold cap and baluster rhythm; used on mezzanine, galleries and the ballroom ring | - |
| `ys_telescope` | 1.4 x 2.2 x 2.6 | 180 | Brass-and-silver refractor on a tripod aimed at the sky | `lens` (emissive) |
| `ys_gondola` (optional) | 5 x 1.2 x 1.4 | 150 | Slim black canal boat with a cyan lantern on the prow | `lantern` light |

### 2.8 Enemy models (existing rigs, recoloured; all are PSX-style friendly)

| Unit | Rig and accessories | Tint / emissive | Scale |
|---|---|---|---|
| Nöbet Muhafızı | `characters/Knight`: show `1H_Sword`, `Round_Shield`, `Knight_Helmet`, `Knight_Cape` | tint `0x5a64c8` | 1.0 |
| Nöbet Büyücüsü | `characters/Mage`: show `Mage_Hat`, hide staff, wand and book (hands empty, spell glow) | tint `0x4650d8`, emissive `0x2040a0` x0.3 | 1.0 |
| Gece Rahibi (healer) | `characters/Mage`: show `Spellbook_open`, hide hat, staff and wand; white-gold hood via tint | tint `0xd8d0a0`, emissive `0x90ffd0` x0.35 (heal glow) | 1.0 |
| Koruyucu Yapı | `gen/creatures/golem_stone` | tint `0x8aa4ff` | 1.0 |
| Fel Bağlı Cellat | `monsters/Demon` | tint `0x58d060`, emissive `0x20a030`, eyes `0xb0ff40` | 1.15 |
| Gölge Hanım | `characters/Rogue`, show both knives (whips) | tint `0xc040a0`, emissive `0x601050` x0.25 | 1.0 |
| Gece Düellocusu | `characters/Knight`: show `1H_Sword` (rapier read), `Knight_Cape`, hide `Round_Shield` and `Knight_Helmet` | tint `0xc8d0f0` (silver), emissive `0x4aa8ff` x0.2 | 1.05 |
| Dehşet Gözü | PROC `eye_orb` (fallback `monsters/Ghost`, tint `0xb040ff`, eyes `0xff3070`) | glow `0xff3070` | 0.6 fallback |
| Mana Ejderi | `monsters/Dragon_Evolved` (flying clips) | tint `0x58c8ff`, emissive `0x2080ff` | 0.42 |
| Mana Yutan | `gen/creatures/slime_frost` | tint `0x40c0ff`, opacity 0.85 | 0.8 |
| Mana Kılıcı | `itch/creatures/wolf` | tint `0x70a8ff`, emissive `0x3070ff` x0.5 | 0.85 |
| Zümrüt Köpek | `gen/creatures/wolf_dire` | tint `0x40ff60`, emissive `0x20c040` | 0.9 |
| Rezil Gerenth | `characters/Rogue_Hooded` | tint `0x9a3ad0` | 1.25 |
| Gerdan | `characters/Knight`: show `2H_Sword`, `Knight_Helmet`, `Knight_Cape` | tint `0x5d68d8` | 1.75 |
| Taliksa | `characters/Mage`: show `1H_Wand`, `Spellbook_open` | tint `0x7a3ad0`, emissive `0x30ff50` x0.25 | 1.8 |
| Cazşar / Baalgar / İmakutya | `monsters/Orc` (`Orc_Weapon` visible) / `characters/Mage` (staff) / `characters/Rogue` (both knives) | fel greens `0x58d060` / `0x2aa070` / `0x70e060` | 1.5 / 1.5 / 1.5 |
| Melandros | `characters/Rogue`, show `Knife` + `Knife_Offhand`, cape | tint `0x3a4ac8`, eyes `0x9fe0ff`, glow `0x4aa8ff` | 1.8 |
| Guests (decor + spy hunt) | `characters/Mage` (nobles), `kenney/graveyard-kit/character-vampire` (stately guests), `ip('nocturnal-watch','npc_maid' / 'npc_bartender')` (staff) | robe tints (§3.6) | 1.0 |

Posture elites get a thin second bar under the health bar in the enemy nameplate (`SPX-22`), tinted gold; a broken posture flashes the model white and plays `stun_stars`.

### 2.9 VFX palette

All from the existing `VFX_IDS` with `SpawnVfxOpts.color` overrides: arcane = `arcane_burst`, `arcane_projectile`, `blink`, `portal_swirl` in cyan `0x4aa8ff`; Seal Magic = `curse_ring` + `arcane_burst`; lanterns/beacons = `candle_flame` / `waypoint_glow` cyan; **fel fire = the fire presets recoloured `0x58ff70`** (`fire_burst`, `fire_ground`, `brazier_fire`, `burn_loop`, `meteor_fall` for Taliksa's eruption); Melandros winds = `slash_arc_big`, `shockwave`, `storm_tornado` in `0x9fe0ff`; Nightwell = `holy_burst` recoloured cyan + `ambient_dust`; spy reveal = `shadow_burst` + `stealth_smoke`; gold = `gold_sparkle`, `upgrade_success` for the astrolabe flare when the spy is caught.

### 2.10 Music and ambience

Mood: **an elegant waltz-like string theme over low arcane drones**, harpsichord and harp, a distant ballroom murmur; menacing and green under the Legion rooms; wide and windy on the balcony. Mapping to files that exist in `public/assets/audio` (`docs/assets/audio.md`):

| Part | Mapping |
|---|---|
| `dungeon_court` (explore) | `music/dungeon_cold_sanctuary.mp3` (orchestral) as the base, alt `dungeon_cave_theme.ogg`; request a dedicated composition later (**SPX-04**) |
| Ballroom layer | `music/town_theme_rpg.mp3` (harp and recorder) as a low room layer (-12 dB) in `ev_girisi`, `ziyafet_salonu`; crowd murmur proxy: `enemy_idle` chatter at 15% volume (the audio doc lists "crowd murmur" as a gap) |
| Big pulls | `combat_battle_theme_b.mp3` (harpsichord bridge) |
| Bosses | Gerdan `boss_great_boss.ogg`, Taliksa `boss_epic_battle.mp3`, Melandros `boss_colossus.ogg` (choir, drums) |
| Ambience beds | canals: `amb_dungeon_bed` + water proxy (`wind_loop_01` low-passed); garden/market: `amb_wind` very low + fireflies silence; court: `fire_loop_01` x3 positional, `whisper`; balcony: `amb_wind` loud. Stingers: `choir_swell` on the spy reveal, `ice_chime` for beacon activation |

**NEW sound ids (SPX-04) and the files they alias** (all existing assets, `docs/assets/audio.md`): `water_lap` = `sfx/ambience/dungeon_loop_01.ogg` low-passed plus `sfx/magic/water_01.ogg` at -18 dB; `chandelier_creak` = `sfx/world/creak_01..03.ogg` followed by `sfx/world/chain_01..03.ogg`; `lift_hum` = `gate_heavy` start then `dungeon_loop_01.ogg` pitched +3 st while moving; `crowd_murmur` = `enemy_idle` chatter at 15% (the audio doc lists a crowd murmur as a gap, a real recording can replace it later); `waltz_loop` = `music/town_theme_rpg.mp3` as a room layer at -12 dB.

### 2.11 Loading screen (one line)

A silver-white Gecedoğan palace of lantern-lit balconies rising over black canal water under a huge full moon, cyan lanterns reflected below, a tiny party of heroes on the gondola quay in the foreground and one green fel flame burning in a far window. (`loadingImage: '/assets/loading/yildiz_divani.png'`, `icon: '/assets/icons/dungeon-yildiz_divani.svg'`, both NEW art.)

---

## 3. Layout as our tile grid

### 3.0 Height model (CORE_MECHANICS §13)

Engine rules this dungeon relies on (all of them are the `SPX-07` verticality package, specified once in `_shared_primitives.md`): every tile has a floor height; `RoomDef.floorY` sets the room's base height, **ramp strips** (`ZoneDef kind 'ramp'`) interpolate between two heights across a tile strip; a `dais` zone `y` is an offset from the room's `floorY`; `RoomDef.ceiling` (m) sets wall height and camera zoom limit; no two floors overlap; the NavGrid refuses a step above **0.45 m** between neighbouring tiles except inside a ramp strip; melee and hit shapes ignore height differences up to 2.5 m and miss beyond (so nobody hits a balcony from the floor below, and the decorative galleries are not targets at all); ranged needs line of sight; enemies path over the ramps.

**Strip rule (tile-centre sampling).** A strip of `n` tiles rising `H` m gives its tile centres the heights `(i + 0.5) / n x H`, so the step at each end of the strip is `H / (2n)`. The doc requires `H / (2n) <= 0.45` for every strip; slope inside a strip stays below 1.2 m per tile (about 17 degrees), which keeps stairs walkable at run speed. `tools/content-check.mjs` verifies every door tile pair (§3.2) and every strip end.

**Eight floor levels** (the season rule asks for 3 or more):

| Level | Floor Y (m) | Rooms |
|---|---|---|
| L-1 | -1.5 | Mana Kanalları (basin), Mana Yuvası, foot of the Kanal Kemeri |
| L0 | 0.0 | Ay Işığı İskelesi (quay, start) |
| L1 | 2.4 | Sarmaşık Kemeri top, Ay Bahçesi, Hizmetçi Avlusu, Kemer Avlusu, top of the Su Kemeri |
| L2 | 3.6 | Gece Mahkemesi (sunken court), Hizmet Koridoru, foot of the Kuzey Kemeri and the servants' stair |
| L3 | 4.8 | Yaldızlı Çarşı (market plateau), head of the Zümrüt Geçit |
| L4 | 7.2 | Cevher Konağı Girişi, Ziyafet Salonu, Batı Salonu, Kule lower landing, tops of the Kuzey Kemeri and servants' stair |
| L5 | 9.6 | Foyer mezzanine, Rasathane |
| L6 | 16.8 | Kule upper landing, Balkonlar |

Net climb on the default route: 0 -> 2.4 (Sarmaşık ramp) -> 4.8 (garden grand stair) -> 3.6 (down into the court) -> 7.2 (Kuzey ramp) -> 16.8 (lift): 18 m of ascent, one 1.2 m descent. The canal route starts 1.5 m below the quay and climbs 6.3 m into the market (Kanal ramp, Su Kemeri stair, Avlu grand stair).

**Ramp and stair strips** (all inside the named room; `dir` is the direction of rise):

| id | Room | rect (x, z, w, h) | dir | y from -> to | n tiles | end step H/2n | Look |
|---|---|---|---|---|---|---|---|
| `r_sarmasik` | bahce_yolu | 26, 61, 2, 5 | n | 0.0 -> 2.4 | 5 | 0.24 | broad steps under the vine arch |
| `r_kanal` | kanal_kemeri | 14, 69, 6, 2 | w (down) | 0.0 -> -1.5 | 6 | 0.125 | stone steps into the canal tunnel |
| `r_su` | su_kemeri | 7, 54, 2, 6 | n | -1.5 -> 2.4 | 6 | 0.325 | three stair flights |
| `r_avlu_e` | kemer_avlusu | 10, 46, 4, 3 | e | 2.4 -> 4.8 | 4 | 0.30 | grand stair to the market, 3 wide, balustraded |
| `r_bahce_n` | bahce | 24, 52, 4, 3 | n | 2.4 -> 4.8 | 3 | 0.40 | **grand stair**, 4 wide, flanked by two plinth statues |
| `r_fel` | fel_gecidi | 38, 42, 6, 2 | w | 3.6 -> 4.8 | 6 | 0.10 | fel corridor ramp (down toward the court) |
| `r_kuzey` | kuzey_kemeri | 50, 31, 2, 5 | n | 3.6 -> 7.2 | 5 | 0.36 | long stair corridor |
| `r_servis_b` | servis_b | 38, 32, 2, 5 | n | 3.6 -> 7.2 | 5 | 0.36 | servants' wooden stair flights |
| `r_foyer_w` | ev_girisi | 46, 21, 3, 2 | e | 7.2 -> 9.6 | 3 | 0.40 | west half of the twin grand stairs |
| `r_foyer_e` | ev_girisi | 53, 21, 3, 2 | w | 7.2 -> 9.6 | 3 | 0.40 | east half (mirror) |

Flat raised or sunken areas (`dais`, `y` = offset from the room floor): foyer mezzanine (49, 21, 4, 2) `+2.4`; ballroom stage steps (15, 19, 8, 3) `+0.45` and (16, 19, 6, 2) `+0.9`; ballroom dance circle r 5.5 at (28.5, 24.5) `-0.45`; Taliksa's altar dais r 2.0 at (53, 40) `+0.45`; Gece Pınarı dais r 2.2 at (22, 4.8) `+0.45`. Everywhere two neighbouring tiles differ by more than 0.45 (stair sides, terrace edges, mezzanine front) the builder places a balustrade or retaining wall and the NavGrid blocks the edge.

**Kule Asansörü (lift, SPX-07).** `extras.lifts: [{ id: 'kule_lift', rect: [29, 16, 2, 2], from: 7.2, to: 16.8, speed: 1.6, idleReturn: 10, call: [[29.5, 18]] }]`. Rows z 16-17 of the lift columns are the cage; rows z 16-17 of columns 28 and 31 are shaft wall; row 18 is the lower landing (7.2), rows 14-15 the upper landing (16.8), so the room is 5 tiles deep with the cage between its two floors (no overlapping floors: the cage tiles belong to the lift system, not to either floor). Host-authoritative, replicated as a `lift` state (position, direction); riders inside the rect take the cage's y and are carried; stepping on the cage (or `waypoint_stone` use) starts it after 2 s, the ride is 6 s, the cage returns 10 s after the last rider leaves. The lift is the **only** way to the balcony (the old stair is sealed), so a wipe at B3 always restarts at the lower landing, which is 9 m from the ballroom door. The 6 s ride is a mandatory regroup and buff moment, and a free spot for a pre-pull toast. Enemies of `ys_p44` stand on the upper landing and are aggroed when the cage arrives within 12 m.

**Side elevation of the critical path** (vertical: one row = 1.2 m; horizontal: one character is about 2 tiles on the main line, corridors compressed; the heights in the labels are floor Y in metres). The galleries drawn dotted are decorative and not walkable.

```
 16.8 |                                                                                                 ║    ║─────────────
      |                                                                                                 ║    ║
      |                                                                                                 ║    ║
      |                                                                                                 ║    ║
      |                                                                                                 ║    ║
      |                                                                                                 ║    ║
  9.6 |                                                                                                 ║    ║
      |                                                                                                 ║ ▲  ║
  7.2 |                                                                     /───────────────────────────║▲   ║
      |                                                                   //
  4.8 |                                /────────────\\\\                //
  3.6 |                              //                 \\\────────────/
  2.4 |                //───────────/
      |             ///
  0.0 |───────────//
      +--------------------------------------------------------------------------------------------------------------------
       iskele 0.0        Bahçe 2.4      ÇARŞI 4.8          MAHKEME 3.6       foyer 7.2                        BALKON 16.8
                  Sarmaşık          grand           geçit              Kuzey            BALLROOM 7.2
```

Dotted decorative layers over that profile (not walkable): market colonnade deck 8 m, foyer ring gallery 12 m, ballroom ring gallery 14 m and chandeliers 19 m, Batı Salonu book gallery 11 m, balcony skyline towers 20-30 m and the lit rooftop ring 20 m below.

Canal alternative: quay 0.0 -> Kanal ramp -> basin -1.5 (canals, Mana Yuvası) -> Su Kemeri stair -> 2.4 (Kemer Avlusu) -> Avlu grand stair -> 4.8 (market): a 1.5 m dip, then a 6.3 m climb, so the alternative route has the more dramatic "climb out of the water" and the garden route the more dramatic "sweeping stair".

### 3.1 Rooms (21)

`rect` is `(x, z, w, h)` in tiles (integer corners), size in metres, forces = sum of the packs placed there (§4.3). **y** is the room's `floorY` (ramp rooms give the range of their strip, §3.0); **ceil** is `RoomDef.ceiling` in metres (`open` = open-air room, sky backdrop, camera cap 30). Flags: **B1-B3** boss arena, **opt** optional dead end, **skip** shortcut room. `explicitDecor: true` on all boss rooms, the market, the ballroom and the balcony (their pillars and braziers are hand placed).

| id | Ad (TR) | rect | size (m) | y | ceil | floor / wall | forces | Purpose |
|---|---|---|---|---|---|---|---|---|
| `iskele` | Ay Işığı İskelesi | 20, 66, 14, 9 | 56 x 36 | 0.0 | open | tiles / temple | 17 | Start. Yıldız Asansörü, Kehanet Taşı, 2 packs (wyrms, patrolling sentries). Start barrier covers both doors during the countdown |
| `kanal_kemeri` | Kanal Kemeri | 14, 69, 6, 2 | 24 x 8 | 0.0 -> -1.5 | 6 | stone_dark / brick | 4 | West tunnel ramp to the canals, a swarm pack |
| `kanallar` | Mana Kanalları | 2, 60, 12, 15 | 48 x 60 | -1.5 | open | stone_dark / brick | 13 | **Canal route**: two water channels, four bridges, swarm egg packs, door to the optional nest |
| `su_kemeri` | Su Kemeri | 7, 54, 2, 6 | 8 x 24 | -1.5 -> 2.4 | 8 | stone_dark / brick | 4 | Stair corridor north out of the canals (+3.9 m) |
| `kemer_avlusu` | Kemer Avlusu | 2, 43, 12, 11 | 48 x 44 | 2.4 | open | stone / temple | 10 | West court; its east grand stair (`boss_lock` door at the top) enters the market |
| `mana_yuvasi` | Mana Yuvası | 14, 61, 6, 6 | 24 x 24 | -1.5 | 10 | dirt / cave | 8 | **opt**. Nest chamber: dormant egg pack, hidden iron chest, crystals |
| `bahce_yolu` | Sarmaşık Kemeri | 26, 61, 2, 5 | 8 x 20 | 0.0 -> 2.4 | 6 | stone / temple | 8 | Vine arch ramp north of the quay: the two gate sentries |
| `bahce` | Ay Bahçesi | 16, 52, 24, 9 | 96 x 36 | 2.4 | open | stone / temple | 43 | **Garden route**: 4 packs + patrol, Kudret Sunağı, jeweler's orb, Ay Çeşmesi, rift spot, grand stair north to the market, door east to the yard |
| `hizmetci_avlusu` | Hizmetçi Avlusu | 40, 52, 14, 9 | 56 x 36 | 2.4 | open | dirt / brick | 24 | **opt**. Service yard: 3 packs (an Enforcer pair), Rüzgar Sunağı, gold chest |
| `yaldizli_carsi` | Yaldızlı Çarşı | 14, 38, 24, 14 | 96 x 56 | 4.8 | open | tiles / temple | 86 | **B1 Gerdan**. 5 packs on the flanks (one patrols), 4 beacon posts. Two `boss_lock` entrances (garden stair, west stair), one `boss_exit` east |
| `fel_gecidi` | Zümrüt Geçit | 38, 42, 6, 2 | 24 x 8 | 4.8 -> 3.6 | 8 | stone_dark / cave | 29 | Fel corridor ramp down into the court: two linked packs (hound ambush), exit of B1 |
| `gece_mahkemesi` | Gece Mahkemesi | 44, 36, 14, 14 | 56 x 56 | 3.6 | open | tiles / temple | 38 | **B2 Taliksa** + Zümrüt Alev Üçlüsü. Two outer packs. Entrance `boss_lock` west; exits `boss_exit` north (foyer) and west (servants) |
| `servis_a` | Hizmet Koridoru | 38, 37, 6, 2 | 24 x 8 | 3.6 | 6 | wood / brick | 14 | **skip**. Servants' corridor, 1 pack |
| `servis_b` | Hizmet Merdiveni | 38, 32, 2, 5 | 8 x 20 | 3.6 -> 7.2 | 10 | wood / brick | 14 | **skip**. Stairwell with the Hizmetçi Kilidi, caster pack, `event_lock` door into the ballroom |
| `kuzey_kemeri` | Kuzey Kemeri | 50, 31, 2, 5 | 8 x 20 | 3.6 -> 7.2 | 8 | stone / temple | 12 | Stair corridor to the foyer, the tailor's wardrobe at its north end |
| `ev_girisi` | Cevher Konağı Girişi | 44, 21, 16, 10 | 64 x 40 | 7.2 (+2.4 mezzanine) | 16 | tiles / brick | 58 | Foyer: 4 packs (one patrol), Koruma Sunağı, Ay Çeşmesi, 2 nobles + 1 rumormonger, twin grand stairs to the mezzanine and the observatory door |
| `rasathane` | Rasathane | 46, 12, 12, 9 | 48 x 36 | 9.6 | open (dome 18) | tiles / temple | 10 | **opt**. Observatory: 1 caster pack, lore, star charts |
| `ziyafet_salonu` | Ziyafet Salonu | 14, 19, 30, 13 | 120 x 52 | 7.2 (stage +0.9, dance -0.45) | 24 | tiles / brick | 118 | **Spy hunt hall**: 6 nobles + 4 rumormongers + Layleth, 7 packs (a 4-pack southern line + patrol + 2 northern pairs), astrolabe, 4 chandelier winches. North door is the `spy_solved` event gate |
| `bati_salonu` | Batı Salonu | 4, 21, 10, 9 | 40 x 36 | 7.2 | 12 | wood / brick | 36 | **opt**. Library salon: 2 packs, wood chest, bonus rumormonger (best clue) |
| `kule_merdiveni` | Kule Asansörü | 28, 14, 4, 5 | 16 x 20 | 7.2 / lift / 16.8 | 14 | tiles / temple | 24 | Arcane lift to the balcony: guard pack at the bottom, ambush pack at the top, `boss_lock` door north |
| `balkon` | Balkonlar | 20, 2, 20, 12 | 80 x 48 | 16.8 (+0.45 dais) | open | tiles / temple | 0 | **B3 Melandros**. Nightwell NW, exit portal and end chest. Open sky |

Per-room `RoomDef` extras: boss rooms `{ boss: n, explicitDecor: true }`; `optional: true` on `mana_yuvasi`, `hizmetci_avlusu`, `rasathane`, `bati_salonu`; `skip: true` on `servis_a`, `servis_b`; `floorY` and `ceiling` from the table above (SPX-07).
### 3.2 Doors (22)

`tile` is in room `a`; `side` points towards room `b`; width in tiles. `gateStyle` is the NEW SPX-09 visual. **y a / y b** is the floor height of the two tiles on either side of the door as the strips of §3.0 leave them; every row has `|dy| <= 0.45` (content-check rule).

| a | b | tile | side | w | gate | gateStyle / note | y a / y b |
|---|---|---|---|---|---|---|---|
| iskele | bahce_yolu | 26, 66 | n | 2 | none | start barrier only | 0.00 / 0.24 |
| bahce_yolu | bahce | 26, 61 | n | 2 | none | | 2.16 / 2.40 |
| bahce | yaldizli_carsi | 25, 52 | n | 4 | `boss_lock` | `arcane` (cyan curtain) at the head of the grand stair | 4.40 / 4.80 |
| iskele | kanal_kemeri | 20, 69 | w | 2 | none | start barrier only | 0.00 / -0.13 |
| kanal_kemeri | kanallar | 14, 69 | w | 2 | none | | -1.38 / -1.50 |
| kanallar | su_kemeri | 7, 60 | n | 2 | none | | -1.50 / -1.18 |
| su_kemeri | kemer_avlusu | 7, 54 | n | 2 | none | | 2.08 / 2.40 |
| kemer_avlusu | yaldizli_carsi | 13, 46 | e | 3 | `boss_lock` | `arcane` at the head of the west grand stair | 4.50 / 4.80 |
| kanallar | mana_yuvasi | 13, 65 | e | 2 | none | crystal-choked arch | -1.50 / -1.50 |
| bahce | hizmetci_avlusu | 39, 55 | e | 2 | none | | 2.40 / 2.40 |
| yaldizli_carsi | fel_gecidi | 37, 42 | e | 2 | `boss_exit` | `arcane` | 4.80 / 4.70 |
| fel_gecidi | gece_mahkemesi | 43, 42 | e | 2 | `boss_lock` | `fel` (green flame curtain) | 3.70 / 3.60 |
| gece_mahkemesi | kuzey_kemeri | 50, 36 | n | 2 | `boss_exit` | `fel` | 3.60 / 3.96 |
| kuzey_kemeri | ev_girisi | 50, 31 | n | 2 | none | | 6.84 / 7.20 |
| ev_girisi | ziyafet_salonu | 44, 24 | w | 3 | none | grand double door | 7.20 / 7.20 |
| bati_salonu | ziyafet_salonu | 13, 24 | e | 2 | none | | 7.20 / 7.20 |
| ev_girisi | rasathane | 50, 21 | n | 2 | none | on the mezzanine | 9.60 / 9.60 |
| ziyafet_salonu | kule_merdiveni | 29, 19 | n | 2 | **`event_lock`** `spy_solved` | `arcane` (violet) NEW SPX-08 | 7.20 / 7.20 |
| kule_merdiveni | balkon | 29, 14 | n | 2 | `boss_lock` | `arcane` | 16.80 / 16.80 |
| servis_a | gece_mahkemesi | 43, 37 | e | 2 | `boss_exit` | `wood` (a servants' door that opens once Taliksa is dead) | 3.60 / 3.60 |
| servis_a | servis_b | 38, 37 | n | 2 | none | | 3.60 / 3.96 |
| servis_b | ziyafet_salonu | 38, 32 | n | 2 | **`event_lock`** `servis_kilidi` | `wood` + lock panel, NEW SPX-08 | 6.84 / 7.20 |

`boss_lock` / `boss_exit` follow `DungeonScene.gateShouldBeOpen`: a `boss_lock` door closes 3 s after engagement, reopens on kill or wipe and stays closed while a boss with lower `order` lives (so B2's door cannot be used before Gerdan is dead even though two paths lead there).

### 3.3 Critical path, optional areas and skips

* **Critical path (garden route):** iskele, bahce_yolu (ramp), bahce, grand stair, **yaldizli_carsi (B1)**, fel_gecidi, **gece_mahkemesi (B2)**, kuzey_kemeri (stair), ev_girisi, ziyafet_salonu (spy hunt), kule_merdiveni (lift), **balkon (B3)**. 426 m of walking including a few corners (about 61 s at 7 m/s) plus the 6 s lift ride.
* **Canal route (alternative):** iskele, kanal_kemeri, kanallar, su_kemeri, kemer_avlusu, then the market through the west grand stair. 224 m start to market versus 113 m by the garden. Both routes end in the same market, so it is a real loop and the party chooses which side's packs to fight. It must be paired with the Batı Salonu to reach 450 (§1.5).
* **Optional dead ends:** Hizmetçi Avlusu (off the garden), Mana Yuvası (off the canals), Rasathane (up the foyer mezzanine), Batı Salonu (off the ballroom).
* **Skip (profession/class gated):** after Taliksa dies, `servis_a` opens. `servis_b` leads to a locked door (`servis_kilidi`) into the ballroom: unlocked by a **Rogue** (Kilit Açma) or a party member with **Kuyumculuk** (`jewel` >= 1). Route length Court to ballroom drops from 147 m to 120 m, but the real gain is skipping `kuzey_kemeri` + `ev_girisi` (70 forces, the foyer patrol and the worst caster pack). The price: `servis_a` + `servis_b` hold 28 forces of their own (a caster stairwell), you arrive beside the Construct pack in the ballroom, and the foyer shrine, Ay Çeşmesi and chandelier winch are lost. Route C in §1.5 is the only route that uses it.
* **No boss skips:** every path to B2 and B3 passes a `boss_lock`; bosses cannot be bypassed.

### 3.4 Zones (floor features) with kit calls

Zone arrays apply in order: blocked pools first, bridges after (they re-open the cells), ramps and daises last. `rectZone(kind, x, z, w, h, extra)` takes integer tile corners; `circleZone(kind, cx, cz, rTiles, extra)` takes continuous coordinates; `rampZone(x, z, w, h, dir, y0, y1, extra)` is NEW (SPX-07), `y0` is the height at the low edge and `y1` at the high edge, `dir` the direction of rise; a `dais` `y` is an offset from the room floor.

```ts
// kanallar (x 2..13, z 60..74): north bank 60-62, canal A 63-64, middle bank 65-66, canal B 67-68, south bank 69-74; room floorY -1.5
rectZone('pool', 2, 63, 12, 2, { blocked: true, color: 0x0a3a6a, glow: 0x4ac0ff, glowIntensity: 0.5 }),   // canal A
rectZone('pool', 2, 67, 12, 2, { blocked: true, color: 0x0a3a6a, glow: 0x4ac0ff, glowIntensity: 0.5 }),   // canal B
rectZone('bridge', 7, 67, 2, 2), rectZone('bridge', 3, 63, 2, 2), rectZone('bridge', 11, 63, 2, 2),      // central + two staggered
// bahce
circleZone('pool', 28.5, 56.5, 1.8, { blocked: true, color: 0x0a3a6a, glow: 0x6ac8ff, glowIntensity: 0.5 }),   // moon fountain basin
// iskele, yaldizli_carsi, gece_mahkemesi, ziyafet_salonu, balkon: sigils (decals, walkable)
circleZone('rune', 26.5, 72.5, 2.4, { color: 0x141a3a, glow: 0x7fd0ff, glowIntensity: 0.5 }),               // elevator ring
circleZone('rune', 25.5, 43.5, 6.0, { color: 0x141a3a, glow: 0x7fb0ff, glowIntensity: 0.5 }),               // Gerdan's sigil
circleZone('rune', 50.5, 42.5, 7.5, { color: 0x0a2a14, glow: 0x58ff70, glowIntensity: 0.6 }),               // fel circle (plus r 1.1 at the 3 covenant spots)
circleZone('rune', 28.5, 24.5, 5.5, { color: 0x2a2040, glow: 0xffc860, glowIntensity: 0.7 }),               // astrolabe
circleZone('rune', 30, 8, 8, { color: 0x141a3a, glow: 0x9fe0ff, glowIntensity: 0.5 }),                      // balcony arena sigil
// ramps and stairs (§3.0 table)
rampZone(26, 61, 2, 5, 'n', 0.0, 2.4), rampZone(14, 69, 6, 2, 'w', 0.0, -1.5), rampZone(7, 54, 2, 6, 'n', -1.5, 2.4),
rampZone(10, 46, 4, 3, 'e', 2.4, 4.8), rampZone(24, 52, 4, 3, 'n', 2.4, 4.8), rampZone(38, 42, 6, 2, 'w', 3.6, 4.8),
rampZone(50, 31, 2, 5, 'n', 3.6, 7.2), rampZone(38, 32, 2, 5, 'n', 3.6, 7.2),
rampZone(46, 21, 3, 2, 'e', 7.2, 9.6), rampZone(53, 21, 3, 2, 'w', 7.2, 9.6),
// daises (offset from room floor)
rectZone('dais', 49, 21, 4, 2, { y: 2.4, color: 0x2a2040 }),                                                 // foyer mezzanine
rectZone('dais', 15, 19, 8, 3, { y: 0.45, color: 0x2a2040 }), rectZone('dais', 16, 19, 6, 2, { y: 0.9, color: 0x2a2040 }), // ballroom stage
circleZone('dais', 28.5, 24.5, 5.5, { y: -0.45, color: 0x2a2040 }),                                          // ballroom dance circle (sunken)
circleZone('dais', 53, 40, 2.0, { y: 0.45, color: 0x0a2a14 }),                                                // Taliksa altar
circleZone('dais', 22, 4.8, 2.2, { blocked: false, y: 0.45, color: 0x1a2450 }),                              // Gece Pınarı dais
// fel_gecidi: three fel runes r 1.2 at (39.5,42.5) (41.5,43) (42.5,42.5), glow 0x58ff70
```

The black water beside the quay is a decor plane outside the room walls (no zone needed); the quay edge is closed by `kg('iron-fence')` railings.

### 3.5 Set pieces and how to build each

(Set pieces are numbered S1-S13 here; the shared engine primitives are the canonical `SPX-nn` ids of `_shared_primitives.md`.)

| # | Set piece | Where | Player-facing rule | Engine build |
|---|---|---|---|---|
| S1 | **Sinyal Fenerleri** (Signal Beacon) | Market, 4 posts | From 65% Gerdan calls the watch from a beacon; any beacon can be broken, a broken one stops spawning there | Boss script + `proc_beacon` mech entities (existing pattern: Kevvas rifts). §5.1 |
| S2 | **Mana Kanalları** | canals | Two channels, four bridges, swarms surfacing out of the water; Mana Yuvası behind a crystal arch | Existing: `pool` + `bridge` zones, `PackDef.dormant {kind:'egg'}` |
| S3 | **Casusu Bul** (spy hunt) | ballroom + foyer | Mask on (Layleth), 5 rumormongers give clues, 8 nobles, accuse one; right = Rezil Gerenth fight and the tower opens, wrong = that noble fights you; **can never block the run** (give-up and timeout, §3.6) | SPX-10 `DungeonNpc`, SPX-08 `DungeonEvents`, SPX-11 `grantForces`. Full spec §3.6 |
| S4 | **Gece Pınarı zehirleme** | balcony NW | A Rogue or an alchemist can poison the well before the fight: Melandros' drink at 25% backfires | `ReqInteract` (SPX-10) sets flag `nightwell_poisoned`, read by the boss script. §5.3 |
| S5 | **Hizmetçi Kilidi** | `servis_b` | Rogue or Kuyumcu opens the skip door | `ReqInteract` + `event_lock servis_kilidi` |
| S6 | **Terzi Dolabı** (disguise) — trash set piece 2 | `kuzey_kemeri` north end | A Terzi (`tailor` >= 1) gives the party "Soylu Kılığı" for 120 s: Nöbet guards and sentries ignore them unless attacked (the whole foyer and ballroom guard population is pulled on your terms) | `ReqInteract`, NEW status `disguise` + `EnemyDef.ai.disguiseBlind` (SPX-24) |
| S7 | **Mücevher Küresi** | garden gazebo | A Kuyumcu (`jewel` >= 1) activates the orb: party +8% damage for 300 s (30 m radius), once per run | `ReqInteract` + existing status `empower` (magnitude 0.08, duration 300) |
| S8 | **Gerçek Görüş** | any noble | Paladin (and future İblis Avcısı) see "Casus" / "Masum" on the noble's interact prompt | `ReqInteract` class variant inside the spy hunt |
| S9 | **Zümrüt Alev Üçlüsü** | Midnight Court | Kill the three emissaries or separate them: each living emissary strengthens the others | Boss script. §5.2 |
| S10 | **Rüzgâr zonları** | balcony | Sweeping wind bands stun; blade images copy lines | Boss script. §5.3 |
| S11 | **Kristal Kandiller** (chandelier drop) — trash set piece 1 | ballroom (3 winches on the south pillars at (24, 31), (30, 31), (37.5, 31) for the chandeliers above p34, p32 and p33) and foyer (1 winch at (45, 27) for the chandelier above p27) | Hold F 1.0 s at a winch within 3 m: the chandelier above a pack shakes (`chandelier_creak`), a red ring r 4.5 marks the floor under it for 2.0 s, then it falls. Everything in the ring takes the crush: non-boss enemies lose 25% max HP (elites 15%) and are stunned 3 s; **players in the ring take coef 3.5 physical** (avoidable, so the party has to leave the ring first, or the tank pulls the pack under it). One use per chandelier. Pull the 4-pack ballroom line under the three winches to save about 12 s of killing | NEW `extras.dropProps?: { id, pos, ring: 4.5, dmgPctMax: 0.25, eliteCap: 0.15, stun: 3, playerCoef: 3.5, winch: Pt }[]` + the `ys_chandelier_rope` interactable (`SPX-10` hold interact). Host rolls the damage on `EnemyDirector.damageInCircle` and replicates a `drop` event; a `HitShapeSpec` circle for the players |
| S12 | **Kule Asansörü** | tower | The only way to the balcony: a 6 s lift ride, the top pack is aggroed on arrival | `extras.lifts` (§3.0, SPX-07) |
| S13 | **Ay Çeşmeleri** (moon fountains) | Bahçe (31, 56.5), Çarşı (16, 49.5), foyer (45, 29.5), ballroom (42, 30.5) | F: "Çeşmeden iç" gives `haste +10%` and `speed +10%` for 60 s to the drinker, once per player per fountain; planned for the pull that follows | `extras.boons` (`SPX-10`, status `empower`-like `ay_cesmesi`, `persistOnDeath: false`) |
### 3.6 Casusu Bul — full specification

**Cast** (all in `extras.npcs`, NEW data, spawned by the spy-hunt system, interactable via NEW `DungeonNpc`; positions continuous tile coordinates, z shifted):

| Role | Count | Positions |
|---|---|---|
| Layleth Ayyıldız (friendly guide, `Mage` model, silver tint `0xd8dcf0`) | 1 | ballroom (41.5, 25.5), beside the foyer door |
| **Geveze Dedikoducu** (rumormonger, staff `npc_maid` / `npc_bartender`, gold tint) | 5 (R1-R5) | R1 (29.5, 22.5), R2 (19.5, 23.5), R3 (39.5, 23), R4 foyer (51.5, 27.5), R5 ballroom west door (15.5, 25.5) |
| Bonus rumormonger R6 | 1 | `bati_salonu` (12, 28) |
| **Şüpheli Soylu** (noble, `Mage` model, robe tints) | 8 (N1-N8) | N1 (17.5, 20), N2 (21.5, 19.8), N3 (25.5, 20.2), N4 (33.5, 20), N5 (37.5, 19.8), N6 (41, 21.5), N7 foyer (48.5, 27), N8 foyer (58, 22.5) |
| Dancers, band, servants | decor only | centre dance floor, stage, tables (static or looping clips `Cheer`, `Interact`, `Use_Item`, `Sit_Chair_Idle`) |

**Noble attributes** (all three are visible on the model, no UI guessing): robe colour `{Beyaz 0xe8e8f4, Kızıl 0xb03040, Mavi 0x3a64d0, Mor 0x7a46c0}` (tint), hat `{Şapkalı: Mage_Hat shown, Şapkasız}`, held item `{Asa: 2H_Staff, Değnek: 1H_Wand, Kitap: Spellbook_open}`. 24 combinations; the 8 nobles use 8 distinct ones in which no single value is unique to the spy.

**Generation (host, once, seeded with `hashString(RunState.seed + ':spy')`):**
1. Draw 8 distinct combinations, pick the spy index.
2. Build clues greedily: candidate set = all 8. While more than 1 candidate remains pick an attribute and a **true** statement about the spy (positive "Casus X giyiyordu" or negative "Casus X giymez") that removes at least one candidate, preferring the largest cut; at most 4 clues are ever required. Pad to 5 with a redundant true clue.
3. Hand clue i to rumormonger Ri (R6 receives a *combined* clue: robe + hat, which on its own leaves two candidates).
4. Broadcast the seed-derived table to peers (`dungeon_event`), clients never recompute.

**Clue texts (TR):** robe +/-: "Casus {renk} bir cüppe giyiyordu." / "Casus {renk} giymez." · hat +/-: "Başında bir şapka vardı." / "Casus şapka takmaz." · held +/-: "Elinde {uzun bir asa | ince bir değnek | bir büyü kitabı} vardı." / "Elinde {...} yoktu."

**State machine** (`DungeonEvents` flags, host authoritative, replicated):

| State | Trigger | Effect |
|---|---|---|
| `idle` | start | NPCs stand as decor; Layleth says "Önce Taliksa'yı durdurun" |
| `armed` | `boss:defeated` for `boss_taliksa` | Layleth glows, interact prompt "Layleth ile konuş" |
| `hunting` | Layleth dialogue accepted | Party gets "Maske" (cosmetic status, 10 min); rumormongers become interactable (hold F 1.5 s "Dinle"); HUD list "Casus İpuçları (n/5)" |
| accuse | interact a noble, confirm dialog | **Wrong:** the noble despawns, `ys_supheli_asil` (elite, 0 forces) + 2 summoned `ys_nobet_muhafizi` (0 forces) spawn there; toast "Yanlış kişi!". **Right:** the noble transforms (`shadow_burst`, `stealth_smoke`), `ys_gerenth` spawns and aggroes the party |
| `solved` | `ys_gerenth` dies | `spy_solved = true` (opens the tower door), `MythicPlus.grantForces(10)`, `choir_swell` + gold astrolabe flare, toast "Casus yakalandı!" |

**Rules (v2: the hunt can never block completion or cost the key its 100%).**
* Unlimited accusations (each wrong one costs about 25 s and some HP, **capped at 3**: after the third wrong accusation Gerenth reveals himself on his own).
* **Give-up button:** Layleth's dialogue always offers "Pes et, casusu çağır" (any party member, confirm dialog); Gerenth reveals himself from a random noble after 3 s. The hunt then costs about 40 s instead of 165 s. No penalty other than losing the time savings of a clean hunt.
* **Timeout:** 150 s after `hunting` starts without a verdict, the host reveals Gerenth (toast "Casus kendini ele verdi!"), same flow.
* **Forces:** `grantForces(10)` runs when `ys_gerenth` dies, however he was revealed, and **route A' reaches 457 / 450 on packs alone (§6.2)**, so the +10 is slack, never a requirement.
* Time budget 90-120 s of clean hunting plus about 50 s for Gerenth (165 s on the timeline of §6.1); 70 s with the give-up button. Interactions are requested from the host with the existing `sendRequest` pattern (like `CursedChest`), the result is broadcast.

### 3.7 Other interaction specs

| Interaction | Position (tile coords) | Prompt (TR) | Requirement | Hold | Effect (host, then broadcast) |
|---|---|---|---|---|---|
| Gece Pınarı zehirle | `ys_nightwell` (22, 4.8) | "Gece Pınarı'nı zehirle" | `classId === 'rogue'` or `professions.alch.skill >= 1` | 3 s | `nightwell_poisoned = true`, well turns green-tinted |
| Hizmetçi Kilidi | panels at (38.5, 32.3) in `servis_b` and (39.8, 31) in the ballroom | "Kilidi aç" | `rogue` or `professions.jewel.skill >= 1` | 3 s | flag `servis_kilidi`, door opens for everyone |
| Terzi Dolabı | (49.9, 31.4) in `kuzey_kemeri` | "Soylu Kılığı giy" | `professions.tailor.skill >= 1` | 2 s | status `disguise` on players within 20 m, 120 s, once per run |
| Mücevher Küresi | `ys_gazebo` (37, 57) | "Küreyi uyandır" | `professions.jewel.skill >= 1` | 2 s | `empower` 0.08 for 300 s on players within 30 m, once per run |
| Gerçek Görüş | each noble | prompt suffix "Casus!" / "Masum" | `classId in ['paladin', 'demonhunter']` | - | shows the verdict on that noble before accusing |

Prompts for non-qualifying players show greyed "Gereken: Haydut / Kuyumculuk" (explains the gate, same style as locked panels).

---

## 4. Trash

### 4.0 Design rules for every trash attack (user rule B3, CORE_MECHANICS §16, ROADMAP F10)

* **2-4 telegraphed attacks per unit** (basic included), every melee or ground attack has a visible windup of `windup = clamp(0.45 + 0.25 x coef, 0.45, 1.2)` seconds (a colour pulse plus a wind-up sound per ROADMAP F10). Table of the values used below: coef 0.5 -> 0.58 · 0.7 -> 0.63 · 0.8 -> 0.65 · 0.9 -> 0.68 · 1.0 -> 0.70 · 1.1 -> 0.73 · 1.2 -> 0.75 · 1.3 -> 0.78 · 1.4 -> 0.80 · 1.5 -> 0.83 · 1.6 -> 0.85 · 1.8 -> 0.90 · 1.9 -> 0.93 · 2.0 -> 0.95 · 2.2 -> 1.00 · 2.4 -> 1.05 · 2.6 -> 1.10 · 2.8 -> 1.15 · 3.0 or more -> 1.20. Casts (`castTime`) are separate bars and are used only for interruptible spells and large ground circles.
* **Strings (Elden-Ring style):** a `string` is 2-3 hits; hit 1 uses the windup above, later hits follow after a `gap` (0.35-0.5 s, the blade glint is the tell). A **delayed swing** adds a `hold` (0.4-0.8 s) between the visible windup and the impact; rolling too early wastes the i-frames. At most 3 simultaneous melee swings may hit one player (F10).
* **Posture (SPX-22):** four elites carry `posture: { max, regenDelay 4, regen 6 /s, stagger 2.5, lockout 12 }` (Construct 100, Enforcer 80, Duelist 60, Mistress 50). Every player hit adds `postureDmg` (basic 2, heavy skills 4-6, crits x1.5, a successful interrupt +25, a stun +15). The `recovery` window after a big swing (Şarjlı Ezme, Fel Hücumu, Hamle) doubles posture damage for 1.2 s, so punishing a whiffed swing is the fast way to break it. Breaking posture cancels the current attack, staggers 2.5 s and the target takes +25% damage; the bar is locked for 12 s afterwards. Typical: 6-8 s of focused melee, or a kick plus a stun.
* **Roles in the roster:** kick-casters (Büyücü, Hanım, Göz), a **healer** (Rahip: kill first or kick), brutes to kite (Cellat, Yapı), swarms (Ejder, Yutan, Kılıç, Köpek), **elites with a posture bar** (Yapı, Cellat, Düellocu, Hanım). Every pack of 3 or more mixes at least two roles.
* **Set-piece mechanics that act on trash** (listed in §3.5): **S11 Kristal Kandiller** (drop a chandelier on a pack) and **S6 Terzi Dolabı** (disguise: guards ignore you); S13 Ay Çeşmeleri are boons.

### 4.1 Roster (12 pack units + Rezil Gerenth + 4 summoned / mechanic units)

Baselines: `monsterHP(60) = 2246`, `monsterDmg(60) = 284` (GDD_CONTENT §0.3). `HP x` / `DMG x` are multipliers on those, before Mitik+ (`1.08^(L-1)` HP/damage up to +10, `1.10` above), Tahkimli (+20% HP, +30% damage), party scaling and affixes. Roles: trash = `rank 'trash'`, elite = `rank 'elite'`. Flags used below: **K2** interrupt priority HIGH (`kick: 2`), **K1** MED, **D** dispellable status, **F** frontal / cone (tank turns it away), **S** spread or avoid (ground telegraph), **TB** tank buster, **P** perilous (dodge only), **PB** posture bar.

| id | Ad (TR) | WoW source | rank / role | HP x | DMG x | speed | forces | attacks |
|---|---|---|---|---|---|---|---|---|
| `ys_nobet_muhafizi` | Nöbet Muhafızı | Duskwatch Guard / Sentry | trash / melee | 1.3 | 1.1 | 5.6 | 4 | 3 |
| `ys_nobet_buyucusu` | Nöbet Büyücüsü | Duskwatch Arcanist | trash / kick-caster | 0.9 | 1.1 | 4.9 | 5 | 3 |
| `ys_gece_rahibi` | Gece Rahibi | (our addition: Nightborne cleric, the healer role) | trash / healer | 1.0 | 0.9 | 4.8 | 5 | 4 |
| `ys_koruyucu_yapi` | Koruyucu Yapı | Guardian Construct | elite / tank, **PB 100** | 3.4 | 1.5 | 4.4 | 8 | 4 |
| `ys_fel_cellat` | Fel Bağlı Cellat | Felbound Enforcer | elite / brute, **PB 80** | 3.2 | 1.6 | 5.4 | 8 | 4 |
| `ys_golge_hanim` | Gölge Hanım | Shadow Mistress | elite / melee-caster, **PB 50** | 2.0 | 1.3 | 6.4 | 6 | 4 |
| `ys_duellocu` | Gece Düellocusu | (our addition: Nightborne blade duelist, the Elden-Ring elite) | elite / duelist, **PB 60** | 2.4 | 1.4 | 6.2 | 6 | 3 |
| `ys_dehset_gozu` | Dehşet Gözü | Watchful Inquisitor / Oculus | trash / ranged kick-caster | 1.1 | 1.2 | 4.0 (hover 2.0) | 5 | 2 |
| `ys_mana_ejderi` | Mana Ejderi | Mana Wyrm | trash / swarm (flying) | 0.5 | 0.9 | 6.5 | 2 | 2 + death |
| `ys_mana_yutan` | Mana Yutan | Engorged Manafeeder | trash / swarm | 0.35 | 0.5 | 4.5 | 1 | 2 + death |
| `ys_mana_kilici` | Mana Kılıcı | Mana Saber | trash / melee runner | 0.8 | 1.1 | 8.0 | 3 | 3 |
| `ys_zumrut_kopek` | Zümrüt Köpek | Legion Hound | trash / melee beast | 0.9 | 1.1 | 8.4 | 3 | 3 + passive |
| `ys_gerenth` | Rezil Gerenth | Gerenth the Vile | miniboss / rogue-caster | 16 | 1.9 | 6.4 | 0 (event grants 10) | 5 |
| `ys_uyanik_nobetci` | Uyanık Nöbetçi (Gerdan's adds) | Vigilant Duskwatch | trash / melee | 0.8 | 0.9 | 6.0 | 0 (summoned) | 2 |
| `ys_yanan_iblis` | Yanan İblis (Taliksa's cracks) | Infernal Imp | trash / ranged | 0.5 | 0.9 | 6.5 | 0 (summoned) | 2 |
| `ys_supheli_asil` | Öfkeli Asil (wrong accusation) | Suspicious Noble | elite / caster | 2.5 | 1.3 | 5.0 | 0 (summoned) | 3 |
| `proc_beacon` (MECH) | Sinyal Feneri | Signal Beacon | mech / stationary | 3.0 | 0 | 0 | 0 | 0 |

Totals over the 44 packs (script-checked): **142 mobs, 570 forces**; by unit: G 28 x 4 = 112, A 16 x 5 = 80, R 6 x 5 = 30, C 5 x 8 = 40, F 6 x 8 = 48, M 8 x 6 = 48, D 7 x 6 = 42, E 12 x 5 = 60, W 16 x 2 = 32, P 18 x 1 = 18, S 7 x 3 = 21, H 13 x 3 = 39. New resist profile: `R_GECE = { physical: 0.05, arcane: 0.3, shadow: 0.1 }` for Gecedoğan units (golem: existing `R_GOLEM`, Legion units: existing `R_DEMON`, beasts `R_BEAST`).

### 4.2 Ability specs (use the `cone / proj / aoe / line / charge / passive / onDeath` builders of `src/data/enemies.ts`)

Columns: **kind / timing** gives the windup (formula) or castTime; **string** hits are listed in order with their own coef; `cd (first)` in seconds.

**Nöbet Muhafızı** (`CHAR('Knight')`, tint `0x5a64c8`, show `1H_Sword`, `Round_Shield`, `Knight_Helmet`, `Knight_Cape`, `ai: { disguiseBlind: true }`)

| Ability | Kind / timing | cd (first) | Shape | Damage | Status / flags |
|---|---|---|---|---|---|
| Kılıç Darbesi (basic) | melee, windup 0.70 | 1.8 | cone 2.4 m 90° | 1.0 physical | parryable |
| **Çifte Vuruş** `ys_guard_double` | string of 2: hit 1 windup 0.65, gap 0.45, hit 2 | 7 (3) | cone 2.6 m 100° each | 0.8 then 1.2 physical | hit 2 knocks back 2 m |
| **Rezonans Darbesi** `ys_guard_resonant` | melee, windup 0.93 telegraph | 12 (5) | cone 4.2 m 110° | 1.9 arcane | stun 1.2 s, **F** |

**Nöbet Büyücüsü** (`CHAR('Mage')`, tint `0x4650d8`, `ai.kite [9, 15]`, hands empty)

| Ability | Kind / timing | cd (first) | Shape | Damage | Status / flags |
|---|---|---|---|---|---|
| Gece Oku (basic) | projectile 16 m/s, windup 0.70 | 2.4 | - | 1.0 arcane | - |
| **Gece Küresi** `ys_arcanist_orb` | projectile 14 m/s, windup 0.88 | 9 (3) | single target | 1.7 arcane | NEW `params.chain: 3` (jumps to up to 3 more players within 8 m at x0.7 each) |
| **Mühür Büyüsü** `ys_arcanist_seal` | self_aoe, **castTime 2.5**, interruptible | 22 (6) | circle r 10 centred on the caster | 1.2 arcane | **silence 4 s on everyone hit (D)**, **K2**, `params.interruptsCast: 1`. The must-kick of the dungeon |

**Gece Rahibi** (`CHAR('Mage')`, tint `0xd8d0a0`, `Spellbook_open`, `ai.kite [8, 14]`, `ai.healPriority: true`)

| Ability | Kind / timing | cd (first) | Shape | Damage / effect | Status / flags |
|---|---|---|---|---|---|
| Yıldız Oku (basic) | projectile 16 m/s, windup 0.68 | 2.4 | - | 0.9 arcane | - |
| **Ay Şifası** `ys_cleric_heal` | heal, **castTime 2.0**, interruptible, green beam to the target | 10 (4) | lowest-HP ally within 20 m | heals 35% of the target's max HP | **K2**; the "kill it first or kick it" cast |
| **Koruyucu Mühür** `ys_cleric_ward` | buff, castTime 1.2, interruptible | 16 (6) | one ally within 15 m (never herself) | absorb shield 15% of the target's max HP for 8 s | **K1**, dispellable by a stealing dispel |
| **Cezalandırma** `ys_cleric_smite` | ground_aoe, windup 0.80 telegraph | 14 (8) | circle r 3 under a random player | 1.4 arcane | **S** |

**Koruyucu Yapı** (`GEN('golem_stone')`, tint `0x8aa4ff`, `hyperArmor 0.4`, `R_GOLEM`, **posture 100**)

| Ability | Kind / timing | cd (first) | Shape | Damage | Status / flags |
|---|---|---|---|---|---|
| Taş Yumruk (basic) | melee, windup 0.70 | 2.4 | cone 3.4 m 100° | 1.0 physical | parryable |
| **Taş Süpürme** `ys_construct_sweep` | string of 2: left sweep windup 0.78, gap 0.5, right sweep | 11 (4) | cone 5 m 120° each | 1.3 + 1.3 physical | **F**; the second sweep covers the side the tank rolled to |
| **Şarjlı Ezme** `ys_construct_smash` | melee, windup 1.20 telegraph, then **recovery 1.5 s** (posture x2) | 14 (7) | cone 6.0 m 80° | 3.2 physical | knockback 3, **TB**, **F**, not parryable |
| **Rün Nabzı** `ys_construct_pulse` | self_aoe, windup 0.80 telegraph | 18 (11) | circle r 7 | 1.4 arcane | knockback 4, **S** |

**Fel Bağlı Cellat** (`MON('Demon')`, scale 1.15, tint `0x58d060`, `R_DEMON`, **posture 80**)

| Ability | Kind / timing | cd (first) | Shape | Damage | Status / flags |
|---|---|---|---|---|---|
| Fel Pençesi (basic) | melee, windup 0.70 | 2.2 | cone 3.0 m 100° | 1.0 physical | burn 4 s (0.2) |
| **Fel Patlaması** `ys_enf_detonation` | ground_aoe, **castTime 2.5**, telegraph | 20 (8) | circle r 4.5 on **2 random players** (NEW `params.targets: 2`) | 2.4 fire | burn 8 s (0.3), **S** (spread 9 m apart), not interruptible |
| Fel Hücumu `ys_enf_rush` | charge 9 m, windup 0.90 telegraph, **recovery 1.2 s** (posture x2) | 12 | line 9 x 1.6 | 1.8 physical | knockdown 0.6 s |
| **İnfaz Kombosu** `ys_enf_execute` | string of 3: hit 1 windup 0.68, gap 0.4, hit 2, **hold 0.8 s**, delayed overhead slam | 15 (6) | cones 3.2 m 100°, slam circle r 3 in front | 0.9, 1.1, then 2.2 physical | the slam knocks down 0.8 s; **F** |

**Gölge Hanım** (`CHAR('Rogue')`, tint `0xc040a0`, knives visible, `R_DEMON`, **posture 50**)

| Ability | Kind / timing | cd (first) | Shape | Damage | Status / flags |
|---|---|---|---|---|---|
| Kırbaç (basic) | melee, windup 0.70 | 1.8 | cone 3.2 m 80° | 1.0 shadow | - |
| **Büyüleme** `ys_mist_bewitch` | projectile 16 m/s, **castTime 1.8**, interruptible | 14 (4) | random non-tank player | 0.6 shadow | NEW status `bewitch` 8 s (move -75%, attack speed -50%), **D**, **K1** |
| **Gölge Kesiği** `ys_mist_slash` | melee, windup 0.90 telegraph | 9 (3) | cone 4.0 m 90° | 1.8 shadow | NEW status `deep_wound` 6 s (healing received -25%), **F** |
| **Gölge Atılışı** `ys_mist_leap` | jump to a random player, windup 0.80 telegraph (circle on the floor) | 13 (7) | circle r 2.5 at the landing | 1.4 shadow | knockdown 0.5 s; lands her behind the group |

**Gece Düellocusu** (`CHAR('Knight')`, silver tint, `1H_Sword`, `R_GECE`, **posture 60**, `ai.duel: true` = prefers the target with the lowest threat in melee range)

| Ability | Kind / timing | cd (first) | Shape | Damage | Status / flags |
|---|---|---|---|---|---|
| Raper Atışı (basic) | melee thrust, windup 0.70 | 1.8 | line 3.4 x 1.0 | 1.0 physical | parryable |
| **Üçlü Hamle** `ys_duel_triple` | string of 3: thrust windup 0.65, gap 0.4, slash, **hold 0.5 s**, delayed lunge (dash 3 m) | 10 (4) | line 3.4 x 1.0, cone 3.0 m 100°, line 6 x 1.2 | 0.8, 0.8 then 1.8 physical | the lunge is the delayed hit; bleed 4 s on the last hit |
| **Karşı Duruş** `ys_duel_parry` | stance: telegraph ring 0.6 s, then a 1.6 s window; a **melee** hit during it triggers a counter after 0.95 s telegraph | 16 (8) | cone 3.5 m 100° | 2.0 physical | ranged and spell damage ignore the stance; hitting the stance adds no posture, the counter whiffs into a 1.2 s recovery (posture x2) |

**Dehşet Gözü** (PROC `eye_orb`, flying hover 2.0, `ai.kite [10, 16]`, `R_GECE`)

| Ability | Kind / timing | cd (first) | Shape | Damage | Status / flags |
|---|---|---|---|---|---|
| Işık Iğnesi (basic) | projectile 18 m/s, windup 0.70 | 2.4 | - | 1.0 arcane | - |
| **Kavurucu Bakış** `ys_eye_glare` | line, **castTime 2.2**, interruptible, telegraph | 15 (6) | line 18 x 3 m at a random player | 2.4 fire | **K2**, **F** (line) |

**Mana Ejderi** (`MON('Dragon_Evolved')`, scale 0.42, flying, `ai.kite [7, 13]`, swarm): basic Mana Mermisi (projectile 16 m/s, windup 0.65, cd 1.8, coef 0.8 arcane); **Dalış Atışı** `ys_wyrm_dive` (charge 6 m, windup 0.68, cd 8 (3), coef 0.9, line 6 x 1.2); `onDeath` **Mana Patlaması** `ys_wyrm_pop` (self_aoe r 3, coef 0.8 arcane, no telegraph: back off when one pops).
**Mana Yutan** (`GEN('slime_frost')`, swarm): basic Emme (cone 1.4 m 100°, windup 0.70, cd 1.6, coef 1.0); **Zıplama Kapışı** `ys_feeder_hop` (charge 4 m, windup 0.58, cd 9 (4), coef 0.5); `onDeath` **Mana Sızıntısı** `ys_feeder_burst` (self_aoe r 2.5, coef 0.3 arcane, `params.persist 4, tick 0.5`: a puddle).
**Mana Kılıcı** (`ITCH('wolf')`): basic Isırık (cone 2.0 m 90°, windup 0.70, cd 1.4, coef 1.0); **Çifte Pençe** `ys_saber_claws` (string of 2: windup 0.63, gap 0.35, cone 2.2 m 100°, coef 0.7 + 0.7, cd 6 (3)); **Atılma** `ys_saber_leap` (charge 9 m, windup 0.80, cd 8, coef 1.4, `params.target: 2` = farthest player, `minRange 4`).
**Zümrüt Köpek** (`GEN('wolf_dire')`): basic Fel Isırığı (cone 2.2 m 90°, windup 0.70, cd 1.4, coef 1.0 fire, burn 4 s 0.15); **Kovalayış** `ys_hound_lunge` (charge 5 m, windup 0.73, cd 9 (3), coef 1.1 fire); **Fel Soluğu** `ys_hound_breath` (cone 6 m 60°, windup 0.78 telegraph, cd 10 (5), coef 1.3 fire, **F**); passive **Sürü Gücü** `passive('ys_hound_pack', ..., { radius: 10, perStack: 0.1, maxStacks: 5, duration: 8 })`.

**Rezil Gerenth** (`CHAR('Rogue_Hooded')`, scale 1.25, tint `0x9a3ad0`, `rank 'miniboss'`; CUSTOM handlers in `src/ai/abilities.ts`)

| Ability | Kind / timing | cd (first) | Shape | Damage | Status / flags |
|---|---|---|---|---|---|
| Zehirli Hançer (basic) | melee, windup 0.70 | 1.5 | cone 2.2 m 90° | 1.0 physical | poison 1 stack |
| Fel Kırbacı `gerenth_lash` | line, windup 0.95 telegraph | 8 (4) | line 14 x 1.6 | 2.0 fire | **F** |
| Casus Adımı `gerenth_shadowstep` | custom (reuse `nefris_shadowstep`), vanishes, 1.0 s later appears behind a random player; purple circle r 2, **hold 0.5 s** | 16 (9) | circle r 2 | 3.0 physical | roll out of the circle |
| Zehirli İksir `gerenth_vial` | ground_aoe, windup 0.85 | 12 (6) | circle r 3.5 on a random player, puddle 8 s | 1.6 poison | poison 3 stacks, **S**, **D** |
| Köpek Çağrısı `gerenth_hounds` | summon, once at 50% | - | 2 `ys_zumrut_kopek` | - | 0 forces |

**Summoned / mechanic units:** Uyanık Nöbetçi (Gerdan's reinforcements): melee cone 2.2 m (windup 0.63, coef 0.7), plus **Engel** `ys_guard_hinder` (melee hit coef 0.9, windup 0.68, status `curse` 12 s = -20% damage, **D**, cd 14, first 3, only half of each wave). Yanan İblis: projectile Ateş Oku 16 m/s coef 0.9 (windup 0.68), **Sürüklenen Közler** (ground_aoe r 2, windup 0.68, cd 9, hit coef 0.9 then persist 6 s tick 0.5 at coef 0.3 fire). Öfkeli Asil: Mage with the accused noble's robe tint, Mana Oku (windup 0.70) + Alev Halkası (self_aoe r 5, windup 0.90 at coef 1.8, cd 10, coef 1.8 arcane) + Asil Küresi (a Gece Küresi copy, chain 2, cd 12). `proc_beacon`: `MECH('proc_beacon', 'Sinyal Feneri', 'beacon', 3)` with `visual.blocker 0.7`.

**Interrupt and dispel map (what the party must answer):**

| Kind | Ability | Priority |
|---|---|---|
| Kick | Mühür Büyüsü (silence 4 s r 10) | **HIGH** |
| Kick | Kavurucu Bakış (line 2.4) | **HIGH** |
| Kick | Ay Şifası (heal 35%) | **HIGH** on elite packs, otherwise kill the Rahip |
| Kick | Büyüleme (slow 75%), Koruyucu Mühür (absorb) | MED |
| Kick (boss) | Gerdan's Sinyal and Şişe, Taliksa's Solan Ruh, Baalgar's Ray | see §5 |
| Dispel | Bewitch, Silence, Engel (curse), Zehirli İksir poison, Arcane Kilitlenme, Yakıcı Şiddet stacks, Solan Ruh stacks | healer / party |
| Posture break | Construct, Enforcer, Duelist, Mistress | stun + melee focus; saves a kick |

Route A' meets 11 Seal Magic casters, 7 Glare eyes, 7 Bewitch casters and 5 Rahip heals (each casts once or twice per pull): enough that a party with 2 interrupts is constantly busy, never so many that one miss is a wipe (a missed Seal Magic is 1.2 coef plus a 4 s silence, survivable once; two missed on a double-caster pack are not). 7 Duelists and 4 Constructs on the route make the posture bar a real tool: a broken Duelist in a 3-pack is a free 2.5 s of focus fire.

### 4.3 Pack list (44 packs)

Unit codes: **G** Nöbet Muhafızı · **A** Nöbet Büyücüsü · **R** Gece Rahibi · **C** Koruyucu Yapı · **F** Fel Cellat · **M** Gölge Hanım · **D** Gece Düellocusu · **E** Dehşet Gözü · **W** Mana Ejderi · **P** Mana Yutan · **S** Mana Kılıcı · **H** Zümrüt Köpek. Centre in continuous tile coordinates (z shifted). Members use the standard spiral formation of the existing dungeon files (offsets in tiles from the centre, in member order, elites and tanks first: (0.3, 0), (-0.38, 0.35), (0.06, -0.66), (0.48, 0.62), (-0.88, -0.16), (0.83, -0.53), (-0.28, 1.03), (-0.53, -1.02), (1.15, 0.42), (-1.2, 0.49)). `opt` = optional room, `skip` = servants' route. Packs in rooms with a ramp keep their y from the room's `floorY` / strip at their centre.

| pack | room | centre | members | forces | notes |
|---|---|---|---|---|---|
| `ys_p01` | iskele | 22.5, 71.5 | W2 | 4 | quay wyrms over the lanterns (bolster fodder), optional pull |
| `ys_p02` | iskele | 26.5, 67.5 | G2 A1 | 13 | **patrol** (21.5, 67.5) to (31.5, 67.5); first Seal Magic of the run, kick it |
| `ys_p03` | bahce_yolu | 26.5, 63 | G2 | 8 | gate sentries on the vine-arch ramp |
| `ys_p04` | bahce | 24, 55.5 | C1 S2 | 14 | Construct at the fountain: first tank buster and first posture bar |
| `ys_p05` | bahce | 20, 55 | A1 R1 G1 | 14 | first healer: kick the Rahip, then Seal Magic; **big** |
| `ys_p06` | bahce | 34, 55 | E1 G1 | 9 | Glare eye with a guard: **big** |
| `ys_p07` | bahce | 27, 59.5 | S2 | 6 | **patrol** (18, 59.5) to (37, 59.5) along the south hedge, one tile from the entrance |
| `ys_p08` | hizmetci_avlusu | 47, 56 | F1 H1 | 11 | opt. Enforcer and hound: İnfaz Kombosu |
| `ys_p09` | hizmetci_avlusu | 43, 54 | M1 W2 | 10 | opt. Mistress and two wyrms |
| `ys_p10` | hizmetci_avlusu | 51, 59 | H1 | 3 | opt. a lone hound (fodder) |
| `ys_p11` | kanal_kemeri | 16.5, 69.5 | P4 | 4 | swarm in the tunnel |
| `ys_p12` | kanallar | 6, 71 | P6 | 6 | **dormant egg** (wake 6 m), south bank |
| `ys_p13` | kanallar | 8, 66 | E1 W1 | 7 | middle bank: Glare over water |
| `ys_p14` | su_kemeri | 7.5, 56.5 | G1 | 4 | stair corridor sentry |
| `ys_p15` | kemer_avlusu | 5, 48 | A1 E1 | 10 | caster pair: Seal Magic and Glare |
| `ys_p16` | mana_yuvasi | 17, 64 | P8 | 8 | opt. **dormant egg** nest, wake 6 m |
| `ys_p17` | yaldizli_carsi | 19, 46 | G2 A2 E1 | 23 | **big**, west stalls, 2 Seal Magics + a Glare |
| `ys_p18` | yaldizli_carsi | 33, 46 | F1 H2 | 14 | east stalls, Fel Patlaması |
| `ys_p19` | yaldizli_carsi | 22, 41 | W4 E1 S1 | 16 | **big**, north-west wyrms, eye and saber |
| `ys_p20` | yaldizli_carsi | 30, 45 | G3 M1 | 18 | **big, patrol** (30, 49.5) to (30, 40.5) through the plaza |
| `ys_p21` | yaldizli_carsi | 33, 41 | D1 R1 G1 | 15 | Duelist + healer + guard at the north-east stalls: the posture lesson |
| `ys_p22` | fel_gecidi | 39.5, 42.5 | H4 | 12 | linked to p23 (hound ambush), on the ramp |
| `ys_p23` | fel_gecidi | 42, 42.5 | F1 H3 | 17 | linked to p22 |
| `ys_p24` | gece_mahkemesi | 46, 48 | M2 H2 | 18 | outer ring, south-west (18 m from İmakutya, outside the covenant's 12 m aggro) |
| `ys_p25` | gece_mahkemesi | 55, 48 | F2 G1 | 20 | outer ring, south-east, two Fel Patlaması (18 m from Baalgar) |
| `ys_p26` | kuzey_kemeri | 50.5, 33 | E1 A1 W1 | 12 | corridor casters on the stair |
| `ys_p27` | ev_girisi | 46.5, 25.5 | C2 | 16 | twin Constructs, two tank busters; chandelier winch (S11) |
| `ys_p28` | ev_girisi | 56, 25 | A2 G2 E1 | 23 | the worst caster pack on the line: 2 Seal + Glare |
| `ys_p29` | ev_girisi | 51.5, 23.5 | G2 | 8 | **patrol** (46, 23.5) to (57, 23.5) |
| `ys_p30` | ev_girisi | 56, 28.5 | D1 R1 | 11 | Duelist and Rahip in the east nook: a healer behind an elite |
| `ys_p31` | ziyafet_salonu | 18, 29 | M2 A1 | 17 | **big**, southern line west; linked to p34 |
| `ys_p32` | ziyafet_salonu | 30, 29 | G2 A2 R1 | 23 | **big**, 2 Seal + the Rahip; chandelier winch (S11) |
| `ys_p33` | ziyafet_salonu | 37.5, 29 | C1 W3 | 14 | **big**, by the servants' door; chandelier winch (S11) |
| `ys_p34` | ziyafet_salonu | 24, 29.5 | F1 M1 | 14 | **big**; linked to p31; chandelier winch (S11) |
| `ys_p35` | ziyafet_salonu | 29, 24.5 | G3 D1 | 18 | **big, patrol** (17, 24.5) to (41, 24.5) across the dance floor |
| `ys_p36` | ziyafet_salonu | 20, 22 | D1 R1 G1 | 15 | north-west pair by the stage: Duelist, healer, guard |
| `ys_p37` | ziyafet_salonu | 38, 23 | D2 E1 | 17 | north-east: two Duelists + an eye (posture twins) |
| `ys_p38` | bati_salonu | 8, 25 | A2 R1 E1 | 20 | opt. library: caster triple with a healer |
| `ys_p39` | bati_salonu | 6, 23 | C1 S2 W1 | 16 | opt. Construct and sabers |
| `ys_p40` | servis_a | 40.5, 37.5 | G2 M1 | 14 | skip; linked to p41 |
| `ys_p41` | servis_b | 38.5, 35 | E1 A1 W2 | 14 | skip; three casters in a stairwell, linked to p40 |
| `ys_p42` | rasathane | 51, 16 | A1 E1 | 10 | opt. observatory casters |
| `ys_p43` | kule_merdiveni | 29.5, 18 | G2 | 8 | lift guards at the lower landing |
| `ys_p44` | kule_merdiveni | 29.5, 15 | D1 A1 E1 | 16 | top-landing ambush: aggroed by the lift arrival (12 m) |

```ts
const PACK_EXTRA: Record<string, Partial<PackDef>> = {
  ys_p02: { patrol: [[21.5, 67.5], [31.5, 67.5]] },   ys_p07: { patrol: [[18, 59.5], [37, 59.5]] },
  ys_p20: { patrol: [[30, 49.5], [30, 40.5]], big: true },
  ys_p29: { patrol: [[46, 23.5], [57, 23.5]] },        ys_p35: { patrol: [[17, 24.5], [41, 24.5]], big: true },
  ys_p12: { dormant: { kind: 'egg', wakeRadius: 6 } }, ys_p16: { dormant: { kind: 'egg', wakeRadius: 6 }, optional: true },
  ys_p08: { optional: true }, ys_p09: { optional: true }, ys_p10: { optional: true },
  ys_p38: { optional: true }, ys_p39: { optional: true }, ys_p42: { optional: true },
  ys_p22: { linkedTo: ['ys_p23'] }, ys_p23: { linkedTo: ['ys_p22'] },
  ys_p31: { linkedTo: ['ys_p34'], big: true }, ys_p34: { linkedTo: ['ys_p31'], big: true },
  ys_p40: { linkedTo: ['ys_p41'], note: 'skip route' }, ys_p41: { linkedTo: ['ys_p40'], note: 'skip route' },
  ys_p05: { big: true }, ys_p06: { big: true }, ys_p17: { big: true }, ys_p19: { big: true },
  ys_p32: { big: true }, ys_p33: { big: true },
};
```

Katliam designs (GDD_CONTENT §1.7, at least 3 big pulls): the garden triple (p05 + p06 + patrol p07, 29 forces), the market (p17 + p19 + patrol p20, 57 forces, with p21 the 72-force megapull), and the ballroom southern line (p31 + p34 + p32 + p33 + patrol p35 = 86 forces, the x50 chain, three chandelier winches above it, S11).

---

## 5. Bosses

Three formal bosses (`order` 1, 2, 3; Court of Stars has exactly three) with scripts in a new `src/ai/bosses/yildiz.ts` (one file per dungeon, registered in `ai/bosses/index.ts`, exports `YILDIZ_SCRIPTS` / `YILDIZ_SPAWNS`), plus the Gerenth mini-boss in §4.2. World coordinates in `BossArena` are `(tile + 0.5) * 4` of the continuous tile centre; scripts address tiles with `c.gdd(x, z)`. All three arenas are flat (no height change inside the arena) so every melee, leap and charge hits as designed.

Legend for the timelines: **EXISTS** = already in `src/ai/bosses/kit.ts` / `BossController`; **NEW** = a shared primitive with its canonical `SPX-nn` id. `first` / `cd` in seconds of fight time. Windups of melee and leap attacks follow `clamp(0.45 + 0.25 x coef, 0.45, 1.2)`; casts, beam telegraphs and raid circles keep their own timers.

### 5.0 The Elden-Ring layer (applies to all three bosses)

Every boss keeps **all** of its WoW mechanics (the tables below marked "WoW") and adds a layer of readable melee on top ("ER" rows):

* **Strings:** 2-3 hit combos; the last hit of a string is usually a **delayed swing** (`hold` 0.5-0.7 s after the windup glint) so an early roll is punished and a late one is not.
* **Leaps and charges:** a marker on the floor shows the landing (leap) or the lane (charge) for the whole windup; both end in a **recovery** (1.2-1.5 s) in which the boss stands exposed.
* **Posture bar and stagger window (SPX-22):** `BossDef.posture: { max, regenDelay 5, regen 5 /s, stagger 4, lockout 25 }`. Player hits add posture damage (basic 2, heavy 4-6, crit x1.5; a successful **kick +25**, a stun +15 because bosses cannot be stunned; hits during a **recovery** window count x2). Breaking it **cancels the current cast or channel**, staggers the boss for 4 s with +25% damage taken, and locks the bar for 25 s. The stagger is how an interrupt-less comp still answers the one cast that matters (Gerdan's flask, Taliksa's Yakıcı Şiddet channel, Melandros' Kasırga).
* Posture maxima: Gerdan 100, Taliksa 80 (emissaries 40 each), Melandros 120. Bars show as a thin gold line under the boss health bar.

### 5.1 Boss 1: Devriye Kaptanı Gerdan, "Şehir Nöbetinin Kaptanı" (`boss_gerdan`)

Arena: **Yaldızlı Çarşı** (flat at y 4.8), `BossArena { cx: 104, cz: 180, w: 64, h: 48, homeX: 104, homeZ: 176 }` (the central 16 x 12 tiles; the five trash packs stand outside his 12 m aggro, so they are cleared first and a leftover pack would join the fight). Boss placement `bossAt('boss_gerdan', 'yaldizli_carsi', 25.5, 43.5, 0, 1)`. Four beacon posts at (18.5, 39.5), (32.5, 39.5), (18.5, 49.5), (32.5, 49.5). The market is the 8-9 m colonnade stage: the banners and the upper deck above him are decor only.

```ts
boss({
  id: 'boss_gerdan', name: 'Devriye Kaptanı Gerdan', title: 'Şehir Nöbetinin Kaptanı', model: CHAR('Knight'), scale: 1.75, tint: 0x5d68d8, role: 'melee',
  hp: 62, dmg: 2.4, speed: 6.0, radius: 1.2, enrage: 240, arenaR: 26, loot: 'loot_ys_b1', anims: A_KAYKIT, resist: R_GECE,
  posture: { max: 100, regenDelay: 5, regen: 5, stagger: 4, lockout: 25 },                       // SPX-22
  visual: { hide: KNIGHT_HIDE.filter((n) => !['2H_Sword', 'Knight_Helmet', 'Knight_Cape'].includes(n)), glow: 0x7fb0ff, eyeEmissive: 0x9fe0ff, runRef: 7 },
  basic: cone('gerdan_cleave', 'Kılıç Savuruşu', 4.0, 100, 2.1, 1.0, '2H_Melee_Attack_Slice', 0.55, { windup: 0.70, telegraph: true }),
  abilities: [
    custom('gerdan_resonant', 'Rezonans Darbesi', 14, 6, 1.1, '2H_Melee_Attack_Chop', { perilous: true, params: { impact: 0.5 } }),
    custom('gerdan_sweeper', 'Caddeyi Süpürme', 20, 12, 3.0, 'Spellcast_Shoot', { params: { impact: 0.5 } }),
    custom('gerdan_lockdown', 'Arcane Kilitlenme', 30, 20, 2.0, 'Spellcast_Raise'),
    custom('gerdan_signal', 'Sinyal Fenerini Yak', 28, 4, 2.2, 'Spellcast_Long', { castTime: 2.2, interruptible: true, kick: 1 }),
    custom('gerdan_flask', 'Solemn Gecesi Şişesi', 999, 9999, 2.5, 'Use_Item', { castTime: 2.5, interruptible: true, kick: 2 }),
    // ER layer
    custom('gerdan_string', 'Nöbet Üçlemesi', 9, 3, 0.70, '2H_Melee_Attack_Slice', { params: { string: 3, gap: 0.4, hold: 0.6 } }),
    custom('gerdan_gate', 'Şehir Kapısı Atılışı', 22, 14, 1.05, '2H_Melee_Attack_Stab', { params: { recovery: 1.5, impact: 0.8 } }),
    custom('gerdan_leap', 'Nöbet Atlayışı', 24, 10, 1.0, 'Jump_Full_Short', { params: { recovery: 1.2, impact: 1.0 } }),
  ],
  phases: [
    bp('p1', 1.01, ['gerdan_resonant', 'gerdan_sweeper', 'gerdan_lockdown', 'gerdan_string', 'gerdan_gate']),
    bp('p2', 0.65, ['gerdan_resonant', 'gerdan_sweeper', 'gerdan_lockdown', 'gerdan_string', 'gerdan_gate', 'gerdan_signal', 'gerdan_leap'], { yell: 'Nöbet! Fenerleri yakın!' }),
    bp('p3', 0.30, ['gerdan_resonant', 'gerdan_sweeper', 'gerdan_lockdown', 'gerdan_string', 'gerdan_gate', 'gerdan_signal', 'gerdan_leap'], { yell: 'Son şişemi içiyorum!', ability: 'gerdan_flask' }),
  ],
  intro: 'Davetsiz misafire yer yok! Divan bu gece kapalı!', death: 'Nöbet... bozuldu... Ay ışığı... sönüyor...',
  arena: { cx: 104, cz: 180, w: 64, h: 48, homeX: 104, homeZ: 176 },
});
```

| Time / trigger | Ability (id) | What happens | Kit | Counter |
|---|---|---|---|---|
| every 2.1 s | Kılıç Savuruşu (basic, windup 0.70) | cone 100° 4 m, coef 1.0 | EXISTS (`cone`) | tank |
| first 6, cd 14 | **Rezonans Darbesi** `gerdan_resonant` (WoW: Resonant Slash) | windup 1.1: a front cone and a **rear** cone (r 7, 100°), each coef 2.6 arcane + stun 2 s, perilous (dodge only) | EXISTS (`wedge` x2 at `ang` and `ang + PI`, `statuses: stun`) | boss faces away from the group; ranged and melee stand at the flanks (90°), tank rolls or takes it with a defensive |
| first 12, cd 20 | **Caddeyi Süpürme** `gerdan_sweeper` (WoW: Streetsweeper) | beam telegraph 3.0: a line 46 x 3 m from the boss through each of `clamp(floor(n / 2), 1, 3)` non-tank players (aimed at their position at cast start), coef 2.8 arcane. **Not used while any player carries Lockdown stacks** (`usable()` check) | EXISTS (`beam`, `pickPlayers(c, n, true)`, `BossHandler.usable`) | step out of the lane before the 3.0 s ends |
| first 20, cd 30 | **Arcane Kilitlenme** `gerdan_lockdown` (WoW: Arcane Lockdown) | windup 2.0 raid circle, then every player gets **3 stacks of `arcane_lockdown`** for 20 s: -30% move speed per stack and 1.2% max HP per second per stack; **each dodge roll removes one stack**, a magic dispel removes one | EXISTS (`circle` telegraph, `statusAll` / `statusPlayer`) + NEW status (SPX-24) | roll 3 times (2 charges: roll, wait, roll), healer dispels; do not stand in a lane |
| from 65%, first +4, cd 28 | **Sinyal Fenerini Yak** `gerdan_signal` (WoW: Signal Beacon) | castTime 2.2 **interruptible (K1)**: the nearest intact beacon spawns **2 Uyanık Nöbetçi** (0 forces), one of them casts Engel (curse, dispellable). If interrupted: nothing spawns. Beacons (`proc_beacon`, hp 3 x TRASH_HP x partyHp, `spawnMech` at the four posts at fight start) can be broken; a broken beacon cannot be used | EXISTS (`spawnMech`, `c.adds(tag)`, `spawnAdds`; the Kevvas rift update loop is the template); `kick` flag is NEW trash/boss data (SPX-23) | kick it; or kill the adds fast; or break the beacons nearest to the tank |
| at 30% (`p3` onEnter) | **Solemn Gecesi Şişesi** `gerdan_flask` (WoW: Flask of the Solemn Night) | castTime 2.5 **interruptible (K2)**: if it lands Gerdan gets +30% damage and +30% attack speed for the rest of the fight (`c.dmgMul *= 1.3; c.atkMul *= 1.3`, `floatOver '+%30'`); if interrupted **or his posture is broken during the cast** he is staggered 4 s and takes +30% damage for 6 s | EXISTS (`c.stagger`, `dmgMul`, `atkMul`) + SPX-22 | the one boss kick that matters; save an interrupt (or the posture) for it |
| first 3, cd 9 | **ER: Nöbet Üçlemesi** `gerdan_string` | 3-hit string on the tank: hit 1 cone 4.0 m 100° coef 1.0 (windup 0.70), hit 2 cone 4.6 m 120° coef 1.2 (0.4 s later, windup 0.75), then a **delayed overhead** after a 0.6 s hold: circle r 3.5, 3 m in front, coef 2.0 + knockdown 0.8 s (windup 0.95) | NEW `params.string/hold` (SPX-22 string runner) over `cone` + `circle` | tank blocks 1-2 and **rolls late** for the 3rd; DPS keep out of the front arc |
| first 14, cd 22 | **ER: Şehir Kapısı Atılışı** `gerdan_gate` | windup 1.05 (lane marker 14 x 3 m on a random non-tank player), coef 2.4 physical + knockdown, then **recovery 1.5 s** (posture damage x2). **If the lane crosses an intact beacon or a colonnade pillar he rams it: beacon breaks / pillar cracks and he is stunned 2 s plus 40 posture** | EXISTS (`dashLine` / `c.dash`, `beam`) + SPX-22 | lure the lane through a beacon (it removes the beacon and gives a free stagger window); never stand behind a pillar |
| from 65%, first 10, cd 24 | **ER: Nöbet Atlayışı** `gerdan_leap` | he leaps onto a random non-tank player: a shadow circle r 4.5 tracks the target for 0.6 s and locks for 0.4 s (windup 1.0), coef 2.2 physical, knock-up 1 s, then **recovery 1.2 s** | EXISTS (`circle follow`, `c.dash`) | move out after the lock; punish the recovery |
| 240 s | Enrage | standard (+300% damage and room pulses) | EXISTS | |

Posture notes: the cleanest break is during the `gate` and `leap` recoveries (x2); a kick on `signal` adds 25; a break under 30% before the flask lands counts as the kick.

Duties: **Tank**: hold Gerdan in the middle, turn the boss so the rear cone covers a wall or nobody, defensive for Rezonans (it stuns), roll the late third hit of the string. **Healer**: dispel Engel and Lockdown stacks, pre-heal the DoT during Lockdown, raid cooldown after Flask lands. **DPS**: leave Sweeper lanes, roll off Lockdown, interrupt Signal and above all the Flask, kill beacon adds or beacons, hit him in the recoveries. Loot `loot_ys_b1` (§5.4).

### 5.2 Boss 2: Taliksa Alevçelenk, "Gece Mahkemesi'nin İstilacısı" (`boss_taliksa`) and the Zümrüt Alev Üçlüsü

Arena: **Gece Mahkemesi** (the sunken court, flat at y 3.6), `BossArena { cx: 204, cz: 172, w: 56, h: 56, homeX: 214, homeZ: 162 }`. Taliksa at (53, 40) facing -90 (west, toward the door) on her 0.45 m altar dais; covenant spots Cazşar (50.5, 38.5), Baalgar (55.5, 43.5), İmakutya (50, 46), each beside a green brazier. The three emissaries are `EnemyDef`s (`rank: 'miniboss'`, `ai.summoned`, spawned by the script in `init`, standing idle until the pull, `aggro: false` then linked on `onEngage`).

```ts
boss({
  id: 'boss_taliksa', name: 'Taliksa Alevçelenk', title: "Gece Mahkemesi'nin İstilacısı", model: CHAR('Mage'), scale: 1.8, tint: 0x7a3ad0, emissive: 0x30ff50, role: 'caster',
  hp: 70, dmg: 2.2, speed: 5.0, radius: 1.0, enrage: 270, arenaR: 28, loot: 'loot_ys_b2', anims: A_KAYKIT, resist: R_DEMON,
  posture: { max: 80, regenDelay: 5, regen: 4, stagger: 4, lockout: 25 },                        // SPX-22
  visual: { hide: mageHide('1H_Wand', 'Spellbook_open'), glow: 0x58ff70, eyeEmissive: 0x80ff60, runRef: 7 },
  basic: proj('taliksa_firebolt', 'Alev Oku', 16, 40, 2.2, 0.8, 1.0, 'fire', 'fire_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'fire_cast', windup: 0.70 }),
  abilities: [
    custom('taliksa_eruption', 'Cehennem Patlaması', 26, 12, 2.2, 'Spellcast_Long', { sfx: 'boss_cast', params: { impact: 1.5 } }),
    custom('taliksa_intensity', 'Yakıcı Şiddet', 34, 20, 1.0, 'Spellcasting', { castTime: 1.0, params: { channel: 8, loop: 1 } }),
    custom('taliksa_withering', 'Solan Ruh', 15, 8, 2.0, 'Spellcast_Raise', { castTime: 2.0, interruptible: true, kick: 2 }),
    // ER layer
    custom('taliksa_whip', 'Alev Kırbacı', 10, 5, 0.75, '1H_Melee_Attack_Slice', { params: { string: 2, gap: 0.5, hold: 0.4 } }),
    custom('taliksa_orbs', 'Gecikmiş Alev Küreleri', 17, 9, 0.90, 'Spellcast_Shoot', { params: { orbs: 3, step: 0.45, fuse: 1.2 } }),
    custom('taliksa_leap', 'Cehennem Sıçrayışı', 28, 18, 0.95, 'Jump_Full_Short', { params: { recovery: 1.2, impact: 1.0 } }),
  ],
  phases: [
    bp('p1', 1.01, ['taliksa_eruption', 'taliksa_intensity', 'taliksa_withering', 'taliksa_whip', 'taliksa_orbs']),
    bp('p2', 0.5, ['taliksa_eruption', 'taliksa_intensity', 'taliksa_withering', 'taliksa_whip', 'taliksa_orbs', 'taliksa_leap'], { yell: 'Alev beni çevreliyor!' }),
  ],
  intro: 'Bu gece Divan Zümrüt Alev için dans edecek!', death: 'Alev... beni... bırakma...',
  arena: { cx: 204, cz: 172, w: 56, h: 56, homeX: 214, homeZ: 162 },
});
```

| Time / trigger | Ability (id) | What happens | Kit | Counter |
|---|---|---|---|---|
| every 2.2 s | Alev Oku (basic, windup 0.70) | projectile coef 1.0 at the tank (BossScript `kite [9, 14]`) | EXISTS | |
| first 12, cd 26 (20 in P2) | **Cehennem Patlaması** `taliksa_eruption` (WoW: Infernal Eruption) | windup 2.2: a circle r 3 under **every** player (snapshot at cast start), coef 2.4 fire + knock-up 1 s (`knockdown`), then a burning ground r 3 for 12 s (coef 0.5 per second) and **1 Yanan İblis per two players hit** from the cracks (0 forces) | EXISTS (`circle` per player, `zone`, `spawnAdds`) | everyone moves off their own mark, away from old flames; kill the imps |
| first 20, cd 34 | **Yakıcı Şiddet** `taliksa_intensity` (WoW: Burning Intensity) | 8 s channel (`channel: 8`): a raid pulse every 2.0 s (4 pulses; 1.5 s / 5 pulses in P2) of coef 0.7 fire; every pulse adds a stack of `ys_intensity` (+15% fire damage taken, 12 s, max 6, **dispellable**). **A posture break cancels the channel** | EXISTS (`raidPulse` pattern, `statusAll`) + NEW status (SPX-24) + SPX-22 | healer cooldown + dispels, or break her posture (kicks on Solan Ruh and focused hits fill it); do not stack Eruption on top of high stacks |
| first 8, cd 15 | **Solan Ruh** `taliksa_withering` (WoW: Withering Soul) | castTime 2.0 **interruptible (K2)** at a random player: status `withering_soul` (-8% max HP and -8% move speed per stack, 20 s, max 5, **dispellable** one stack per dispel). A kick adds 30 posture | EXISTS (`pickPlayers`) + NEW status (SPX-24), `kick` flag (SPX-23) | kick it, otherwise dispel |
| continuous | **Kızıl Sözleşme** (covenant rule, WoW: Fel Covenant) | each living emissary gives Taliksa +20% damage; and **every living member takes -15% damage per other living member** (so killing an emissary makes the others softer). Recomputed once per second with a 1.1 s window | EXISTS (`bossMsg('boss_dmgwin', { dur: 1.1, mult }, { targetId })` on each member, `c.dmgMul`) | kill order matters |
| first 5, cd 10, only when a player is within 6 m | **ER: Alev Kırbacı** `taliksa_whip` | 2-hit fire whip at the nearest player: cone 6 m 70° coef 1.2 (windup 0.75), then after a 0.5 s gap and a 0.4 s hold a **sweeping ring r 6** around her, coef 1.6 (windup 0.85) | `usable()` on `playersNear(6)`; `cone` + `circle`; string runner SPX-22 | she punishes melee that hug her: hit and step out between the two halves |
| first 9, cd 17 | **ER: Gecikmiş Alev Küreleri** `taliksa_orbs` | windup 0.90, then 3 fire orbs leave her hand 0.45 s apart, one per random player; **each orb detonates 1.2 s later at the point where its player stood when it launched** (r 3, coef 1.3 fire) | EXISTS (`circle` at a snapshot position) | keep moving: the blast lands where you were |
| P2, first 18, cd 28 | **ER: Cehennem Sıçrayışı** `taliksa_leap` | she leaps to the **farthest** player: a circle r 4 marks the landing for 1.3 s (windup 0.95), coef 2.0 fire + 2 Yanan İblis from the crack, a 6 s fel crack r 4 stays; then **recovery 1.2 s** | EXISTS (`circle`, `c.dash`, `spawnAdds`, `zone`) | ranged players stay spread and have nobody stand at the far wall |
| 50% | `p2` | cooldown shifts above (Eruption 20 s, extra Intensity pulse), toast + yell, hit-stop; adds the leap | EXISTS (`cdOverride`, `onPhase`) | |
| 270 s | Enrage | standard | EXISTS | |

Emissaries (all with `ccImmune: true`, linked, they share the arena; each has **posture 40**, a break staggers it 3 s and bypasses the covenant's -15% for that window):

| Unit | HP x | Role and kit |
|---|---|---|
| `ys_cazsar` **Cazşar** (Orc, `0x58d060`) | 18 | brute: basic Fel Pençesi cone 4.5 m 110° (coef 1.0, windup 0.70); **Dehşet Darbesi** cone 7 m 120°, coef 3.0 (windup 1.20) + stun 2 s, perilous, **F**, cd 13 (first 6): face him away from the group; **ER Zincirli Pençe** `cazsar_chain` string of 3 (cone 4.5 m, coef 1.0, 1.0, then after a **0.7 s hold** an overhead circle r 3.5 coef 2.4, windup 1.05), cd 15 (first 9) |
| `ys_baalgar` **Gözcü Baalgar** (Mage, `0x2aa070`, `kite [10, 16]`) | 14 | caster: basic Gölge Oku (windup 0.70); **Parçalayıcı Işın** `baalgar_beam`: castTime 3.2 **interruptible (K2)**, channel of a follow circle r 1.3 on a random player every 0.8 s (coef 0.7 shadow each) that also stacks `curse` (-20% damage, dispellable). **Must-kick** |
| `ys_imakutya` **İmakutya** (Rogue, `0x70e060`) | 16 | blade dancer: basic cone 3 m (windup 0.70); **Dönen Bıçaklar** `imakutya_blades`: self_aoe r 5.5, windup 0.80, `channel 3` (ticks of 0.9 coef every 0.5 s + bleed), cd 11 (first 5): she drifts slowly toward the farthest player while spinning: kite her away from the group; **ER Üçlü Süzülme** `imakutya_dash`: 3 dashes in 0.5 s steps through the 3 farthest players (line 8 x 1.5, coef 1.0 + bleed, windup 0.70 for the first, 0.4 s markers for the next two), cd 18 (first 12) |

Duties: **Tank(s)**: keep Taliksa and Cazşar apart from the casters; İmakutya wanders, so the party peels. **Healer**: dispels for Withering Soul, Intensity and Baalgar's curse; cooldown for Intensity; knock-up plus fire needs top-up. **DPS**: kick Baalgar's beam and Solan Ruh (two interrupters needed) or break Taliksa's posture on Intensity, kill order Baalgar, İmakutya, Cazşar, then Taliksa (-45% damage taken while all three live), spread for Eruption and the delayed orbs. Loot `loot_ys_b2` (§5.4).

### 5.3 Boss 3 (final, showpiece): Danışman Melandros, "Müneccim'in İlk Kılıcı" (`boss_melandros`)

Arena: **Balkonlar** (flat at y 16.8; the Nightwell dais is +0.45), `BossArena { cx: 120, cz: 32, w: 76, h: 44, homeX: 122, homeZ: 34 }`. Melandros at (30, 8) facing 0 (toward the lift), Gece Pınarı at (22, 4.8) on its dais (35 m from the boss: the party can reach it without pulling). The party arrives by the lift (§3.0), so every wipe restarts with the 6 s ride and a walk of about 30 m to the arena.

```ts
boss({
  id: 'boss_melandros', name: 'Danışman Melandros', title: "Müneccim'in İlk Kılıcı", model: CHAR('Rogue'), scale: 1.8, tint: 0x3a4ac8, role: 'melee',
  hp: 120, dmg: 2.5, speed: 8.0, radius: 1.0, enrage: 300, arenaR: 30, loot: 'loot_ys_b3', anims: A_KAYKIT, resist: R_GECE,
  posture: { max: 120, regenDelay: 5, regen: 6, stagger: 4, lockout: 25 },                       // SPX-22
  visual: { hide: ROGUE_HIDE.filter((n) => !['Knife', 'Knife_Offhand'].includes(n)), eyeEmissive: 0x9fe0ff, glow: 0x4aa8ff, runRef: 8 },
  basic: cone('melandros_slash', 'Çifte Kesik', 3.2, 100, 1.6, 1.0, 'Dualwield_Melee_Attack_Slice', 0.5, { windup: 0.70 }),
  abilities: [
    custom('melandros_surge', 'Bıçak Dalgası', 16, 7, 1.6, 'Dodge_Forward'),
    custom('melandros_gale', 'Delici Rüzgar', 18, 12, 1.8, 'Spellcast_Shoot'),
    custom('melandros_maelstrom', 'Dilimleyen Kasırga', 34, 22, 0.8, '2H_Melee_Attack_Spinning', { castTime: 0.8, params: { channel: 6, loop: 1 } }),
    custom('melandros_winds', 'Kuşatan Rüzgârlar', 30, 10, 1.5, 'Spellcast_Long'),
    custom('melandros_echo', 'Yankılanan Bıçaklar', 999, 9999, 1.0, 'Jump_Full_Short'),
    custom('melandros_nightwell', "Gece Pınarı'ndan İç", 999, 9999, 1.0, 'Use_Item', { castTime: 1.0, params: { channel: 5, loop: 1 } }),
    custom('melandros_overflow', 'Pınar Taşması', 12, 6, 1.5, 'Spellcast_Long'),
    // ER layer
    custom('melandros_dance', 'Rüzgâr Dansı', 11, 4, 0.68, 'Dualwield_Melee_Attack_Slice', { params: { string: 3, gap: 0.4, hold: 0.5 } }),
    custom('melandros_feint', 'Sahte Hamle', 20, 15, 1.05, 'Dodge_Forward', { params: { feintAt: 0.6, hold: 0.5, recovery: 1.2 } }),
  ],
  phases: [
    bp('p1', 1.01, ['melandros_surge', 'melandros_gale', 'melandros_maelstrom', 'melandros_dance', 'melandros_feint']),
    bp('p2', 0.70, [], { yell: 'Yankılar... bana!', ability: 'melandros_echo' }),
    bp('p3', 0.699, ['melandros_surge', 'melandros_gale', 'melandros_maelstrom', 'melandros_winds', 'melandros_dance', 'melandros_feint']),
    bp('p4', 0.25, ['melandros_surge', 'melandros_gale', 'melandros_maelstrom', 'melandros_winds', 'melandros_overflow', 'melandros_dance', 'melandros_feint'], { yell: 'Pınar benim!', ability: 'melandros_nightwell' }),
  ],
  intro: "Müneccim'in sırrı artık benim. Yıldızlar bana yeter!", death: 'Kılıcım... ışığını... yitirdi...',
  arena: { cx: 120, cz: 32, w: 76, h: 44, homeX: 122, homeZ: 34 },
});
```

| Time / trigger | Ability (id) | What happens | Kit | Counter |
|---|---|---|---|---|
| every 1.6 s | Çifte Kesik (basic, windup 0.70) | two-hit cone 100° 3.2 m, coef 1.0 | EXISTS | tank |
| first 7, cd 16 | **Bıçak Dalgası** `melandros_surge` (WoW: Blade Surge) | windup 1.6: a circle r 3.5 follows one random non-tank for 1.0 s then locks; he **dashes** to it (`c.dash`, 0.35 s) and hits coef 2.2 physical + bleed (6 s, 0.25). He **leaves a blade image** (`ys_melandros_imaj`) where he stood; cap 5 (8 with 4+ players on Mitik+, the oldest is replaced) | EXISTS (`circle follow`, `c.dash`, `statusPlayer`) + NEW `imageSpawn` (SPX-18) | move out of the lock circle; kill images near the tank |
| first 12, cd 18 | **Delici Rüzgar** `melandros_gale` (WoW: Piercing Gale) | beam telegraph 1.8: a line 44 x 2.5 m from the boss through a random non-tank, coef 2.6 physical; **every living image fires the same line from its own position at the same player**, so lines cross | EXISTS (`beam`) + `imageEach` | read the images' facing; spread so one player is not in two lines |
| first 22, cd 34 | **Dilimleyen Kasırga** `melandros_maelstrom` (WoW: Slicing Maelstrom) | castTime 0.8 then a 6 s channel (boss stationary): a raid-wide pulse every 1.0 s (coef 0.9 physical, unavoidable) and **each image pulses a circle r 6 at its position** (coef 1.2, avoidable, 0.5 s telegraph). **Posture damage is x2 during the channel and a break cancels it** (ends the pulses, staggers him 4 s) | EXISTS (`raidPulse`, `circle`, `freeze`) + `imageEach` + SPX-22 | healer cooldowns; melee leave image circles; dps burst the boss while he stands still, and a perfect group breaks the posture to end it early |
| 70% (`melandros_echo`) | **Yankılanan Bıçaklar** (intermission, 14 s; WoW: Echo of Melandrus) | He jumps to the arena centre, immune and frozen; all old images vanish; **8 images ring the centre at r 13**, each channelling a **rotating wind beam** (28 x 2.4 m, 24 deg/s, adjacent images rotate in opposite directions, coef 1.1 + bleed). At t = 5 s and 10 s a ring pulse (inner 7 m, outer 40 m, windup 2.0, coef 2.4) forces everyone to step into the middle between the beams. At t = 14 s the images detonate (r 5, coef 1.8) and he reappears at a random wall, vulnerable | NEW `intermission`, `spinBeams`, `imageSpawn` (SPX-14, SPX-15, SPX-18); EXISTS `ring`, `circle`, `ringPoints`, `makeInvulnerable`, `endMechanicPhase` | read the wheel, live in the gaps, run in on each ring pulse; the tank repicks him at the end |
| from 69.9%, first 10, cd 30 | **Kuşatan Rüzgârlar** `melandros_winds` (WoW: Enveloping Winds) | windup 1.5, then **three wind bands** 7 m wide sweep across the balcony west to east (36 m path, 8 m/s, 12 m apart), coef 1.6 + stun 1.5 s | NEW `movingBand` (SPX-15, built from existing `band` segments, the `dashLine` / Magma Dalgası pattern) | roll through (i-frames) or stand in the gaps |
| 25% (`melandros_nightwell`) | **Gece Pınarı'ndan İç** | he runs to the well and channels 5 s (immune while channelling). **Unpoisoned (default):** +30% damage, +30% attack speed, heals 5%, permanent; **poisoned (flag `nightwell_poisoned`):** the poison backfires: he loses 12% max HP and is staggered 6 s taking +80% damage for 8 s (`c.stagger(6, 1.8, 8, 'ZEHİRLENDİ!')`), no buff. A Rogue (or an alchemist) pre-poisons the well with the interaction in §3.7 | EXISTS (`teleport`, `setImmune`, `stagger`, `dmgMul`, `atkMul`) + NEW flag read from `DungeonEvents` (SPX-08) | the trick is optional, comp-gated and safe to do before the pull |
| 25%+, cd 12 (first 6) | **Pınar Taşması** `melandros_overflow` | unpoisoned only (not used when poisoned): a ring 2 m thick expanding from the well at 6 m/s to 40 m, coef 2.0 | EXISTS (the `atesyurek_magma_wave` ring pattern) | roll through |
| first 4, cd 11 | **ER: Rüzgâr Dansı** `melandros_dance` | 3-hit string on the tank: thrust line 3.2 x 1.0 coef 0.9 (windup 0.68), slash cone 3.2 m 100° coef 0.9 (0.4 s later), then after a **0.5 s hold** a **delayed lunge** (dash 6 m, line 6 x 1.2) coef 1.8 (windup 0.90) | `cone` / `line` + `c.dash` + string runner SPX-22 | tank holds the first two, rolls the lunge; images copy none of it |
| first 15, cd 20 | **ER: Sahte Hamle** `melandros_feint` | windup 1.05 with a lane marker toward a random non-tank (14 x 2.5 m); at 60% of the dash he **stops (the feint)**, holds 0.5 s while the lane re-aims at the player's **new** position (0.45 s flash), then dashes for real: coef 2.4 physical + bleed; **recovery 1.2 s** (posture x2) | EXISTS (`beam`, `c.dash`) + SPX-22 | do not run early: wait for the second marker, then roll through |
| 300 s | Enrage | standard | EXISTS | |

Image rules (`ys_melandros_imaj`, `Rogue` model, translucent, `ccImmune`, no attacks of their own, `hpMult 1.2 x partyHp`): killable, count towards nothing, vanish at the intermission and on wipe; the script iterates `c.adds('image')` for Gale and Maelstrom.

Duties: **Tank**: stay on the boss between surges (he returns to the highest threat), keep him away from the well, defensive for the Bıçak Dalgası bleed when the circle lands on the tank (party of 2 or less), read the string; no tank swap exists in this dungeon (one tank in M+). **Healer**: Maelstrom raid damage is the cooldown check; the echo ring pulses and the P4 overflow rings need top-ups. **DPS**: kill images adjacent to the boss, learn to read the echo wheel, damage window during Maelstrom (or break the posture), optional poison trick, hit him in the Feint recovery. Loot `loot_ys_b3` (§5.4).

### 5.4 Loot tables and signature items (CORE_MECHANICS §15)

New entries in `src/data/loot.ts` (`LOOT_TABLES`) and `src/data/uniques.ts` (`u({...})`, `rarity: 'legendary'`). Each boss drops one personal chest per player (1 guaranteed item, +chance of a second), 70% smart loot, and **3 named signature items per boss** whose effects define a build. There is **no trinket slot** in `EquipSlot` yet (`helm ... amulet, ring1, ring2, weapon, offhand`); the signature items are weapons, shields, belts, rings and amulets, and SPX-32 (optional) can promote some to trinkets later. `baseId` values name the tier base to be matched by the items module.

| Boss | `lootTable` | focus slots | extras |
|---|---|---|---|
| Gerdan | `loot_ys_b1: { focus: ['sword2h', 'shield', 'chest', 'gloves', 'helm'], setChance: 0.2 }` | plate side | - |
| Taliksa | `loot_ys_b2: { focus: ['staff', 'wand', 'tome', 'ring', 'amulet'], setChance: 0.2 }` | caster side | - |
| Melandros | `loot_ys_b3: { focus: ['dagger', 'sword1h', 'amulet', 'ring', 'belt'], setChance: 0.25, extraItems: 1 }` | blade and neck | +1 extra item |

| Boss | Item (id, base, class, min ilvl) | Stats and build-defining effect |
|---|---|---|
| Gerdan | **Nöbet Çanı** (`leg_ys_nobet_cani`, `shield_t3`, `classes: ['knight']`, 56) | armor +60-80%, block +5%, max HP +150-220. Every blocked hit rings the bell once per 4 s: stuns enemies within 8 m for 1.5 s and grants nearby allies -8% damage taken for 4 s (`params: { radius: 8, stun: 1.5, dr: 0.08, icd: 4 }`). **Build: block-tank group anchor** |
| Gerdan | **Kilitlenme Zinciri** (`leg_ys_kilitlenme_zinciri`, `belt_t3`, any, 56) | armor +30-40%, max HP +120-180. Every dodge roll cleanses all slows and roots and grants -15% damage taken for 3 s (icd 12 s); while rolling through a ground telegraph the chain adds a 1-hit i-frame extension of 0.1 s (`params: { cleanse: 'slow,root', dr: 0.15, dur: 3, icd: 12, iframe: 0.1 }`). **Build: dodge-roll kiter, answers Lockdown and wind bands** |
| Gerdan | **Fener Yüzüğü** (`leg_ys_fener_yuzugu`, `ring_gold`, any, 56) | crit +3-4%, haste +3-4%. A successful interrupt marks the enemy for 8 s: every ally deals +12% damage to it, and the interrupt's cooldown is reduced by 2 s (`params: { mark: 8, amp: 0.12, cdr: 2 }`). **Build: interrupt / control group buffer** |
| Taliksa | **Alevçelenk Yüzüğü** (`leg_ys_alevcelenk`, `ring_gold`, any, 56) | burn damage +20%; a burning enemy that dies sets 2 enemies within 6 m on fire for 80% damage (`params: { burnPct: 0.2, spread: 2, radius: 6, coef: 0.8 }`). **Build: fire / DoT cleave** |
| Taliksa | **Zümrüt Sözleşme Asası** (`leg_ys_zumrut_sozlesme`, `staff_t4`, caster specs via smart loot, 58) | spell power +80-100, int +20-30. Damage-over-time effects tick 25% faster; every DoT you have on the target adds one stack of "Sözleşme" (+3% damage from you to it, max 5); your next direct spell consumes all stacks for +4% per stack as a fire burst (`params: { tick: 0.25, perStack: 0.03, max: 5, burst: 0.04 }`). **Build: DoT spreader / burst caster** |
| Taliksa | **Yakıcı Şiddet Kolyesi** (`leg_ys_yakici_siddet`, `amulet_ancient`, any, 58) | crit +4-5%, spell power +40-60. Your fire damage stacks "Şiddet" (+2% damage each, 12 s, max 10); every 5 stacks cost you 1% max HP per second until it expires (`params: { perStack: 0.02, max: 10, hpPer5: 0.01, dur: 12 }`). **Build: risk-reward fire glass cannon (needs a healer who dispels / a self-heal spec)** |
| Melandros | **Pınar Kesen** (`leg_ys_pinar_keser`, `dagger_t4`, `classes: ['rogue']`, 58) | weapon damage +80-100%, crit +3-4%, dex +20-30. Crits deal an extra 12% as arcane and grant 1 stack of "Pınar" (+2% movement speed, 8 stacks, 6 s). **Build: crit-rhythm rogue** |
| Melandros | **Yıldız Haritası Kolyesi** (`leg_ys_yildiz_haritasi`, `amulet_ancient`, any, 58) | crit +3%, haste +3%. In Mitik+ every 45 s (starting at the first hit on a boss or elite) a "Yıldız Hizalanması" gives +12% crit chance and +10% movement speed for 8 s (`params: { every: 45, dur: 8, crit: 0.12, ms: 0.10 }`). **Build: burst-window timing (pairs with the Kibir Tecessümü buff)** |
| Melandros | **Yankı Kuşağı** (`leg_ys_yanki_kusagi`, `belt_t4`, any, 58) | armor +30-40%, versatility +3-4%. Each dodge roll or dash leaves a blade image for 4 s (max 3); your next melee hit makes every image repeat it 0.6 s later at 50% damage (`params: { dur: 4, max: 3, echoCoef: 0.5, delay: 0.6 }`). **Build: roll-and-strike melee, rewards the boss' recovery windows** |

Optional season set `set_gece_divani` (helm, shoulders, gloves, legs; 2-piece +5% damage in Mitik+, 4-piece: Kibir Tecessümü buff lasts +20 s) belongs to the items module, a hook only.

---

## 6. Mythic+ tuning

### 6.1 Timer math

Model (script-checked): pull time = `(5 + k * forces) * 0.88` s with `k = 0.95 + 0.55 * (share of casters / elites in the pack)` (the 0.88 is the multi-pull saving; casters / elites are A, R, E, M, D, C, F), running 7 m/s with the walking constants of the v1 model per section, boss times 130 / 170 / 165 (hunt + Gerenth) / 200 s plus 25 s per boss for death, loot and the door (the v2 bosses are longer than v1 because of the string / leap / posture layer), plus 12 s for the lift (2 s call, 6 s ride, 4 s regroup). Party of 5 at +10 (Tahkimli or Zorba week), item level of a normal +8-10 group. The timer is **30:00** (v1 was 28:00 with 420 forces).

**Default route A' (Bahçe + Avlu), cumulative clock:**

| Section | Δ time | Forces | Cumulative forces | % of 450 | Clock |
|---|---|---|---|---|---|
| Quay (p01, p02) | 0:25 | 17 | 17 | 3.8% | 0:25 |
| Sarmaşık Kemeri + Bahçe (p03-p07) | 1:26 | 51 | 68 | 15.1% | 1:51 |
| Hizmetçi Avlusu (p08-p10) | 0:51 | 24 | 92 | 20.4% | 2:42 |
| Çarşı trash (p17-p21) | 2:03 | 86 | 178 | 39.6% | 4:45 |
| **Boss 1 Gerdan** | 2:35 | - | 178 | 39.6% | 7:20 |
| Zümrüt Geçit (p22, p23) | 0:41 | 29 | 207 | 46.0% | 8:01 |
| Mahkeme trash (p24, p25) | 0:56 | 38 | 245 | 54.4% | 8:57 |
| **Boss 2 Taliksa** | 3:15 | - | 245 | 54.4% | 12:12 |
| Kuzey Kemeri + foyer (p26-p30) | 2:02 | 70 | 315 | 70.0% | 14:14 |
| Ballroom packs (p31-p37) | 2:57 | 118 | 433 | 96.2% | 17:11 |
| Spy hunt + Gerenth | 2:45 | +10 | 443 | 98.4% | 19:56 |
| Kule + lift (p43, p44) | 0:56 | 24 | 467 | **103.8%** | 20:51 |
| **Boss 3 Melandros** | 3:45 | - | 467 | | **24:36** |

100% (450) is reached inside the tower pack, so the last pull is the one that closes the bar; with 7 spare forces (17 with the spy) a party may leave out the garden patrol or the quay wyrms.

| Route | Forces (no spy / spy) | Tuned group | Tuned + 2 deaths (+30 s) | Average group (x1.12) |
|---|---|---|---|---|
| A' Bahçe + Avlu | 457 / 467 | 24:36 | 25:06 | 27:33 |
| A+ A' + Rasathane | 467 / 477 | 25:08 | 25:38 | 28:09 |
| A++ A' + Batı Salonu | 493 / 503 | 25:49 | 26:19 | 28:55 |
| B Kanal + Mana Yuvası + Batı | 457 / 467 | 25:37 | 26:07 | 28:42 |
| C Hizmet yolu + Avlu + Salon | 451 / 461 | 24:39 | 25:09 | 27:36 |

Reading: **+10 timed = +1 for an average group (2:27 spare), +2 needs about 36 s of savings** (multi-pull the ballroom line under the three chandelier winches, skip the garden patrol, no deaths). +3 (<= 18:00) is a +2 to +5 key goal. The 10 s countdown is not part of the timer; each death is +15 s. The timer (1800 s) leaves roughly 5:24 over a tuned +10 and 2:27 over an average group, which is the Court of Stars feel (a 30 min dungeon that most groups finish in 25-28). The spy hunt budget is 165 s on the default timeline, 70 s when the party uses the give-up button (§3.6).

### 6.2 Forces and routing facts

* `forcesRequired: 450`; every pack's `forces` is the sum of its members' `EnemyDef.forces` (§4.3, total 570); spy event +10 via `grantForces` (SPX-11); summoned units (Uyanık Nöbetçi, imps, hounds, images, wrong-accusation guards) give 0 (host dynamic ids).
* **The spy event is never required for 100%.** Route A' reaches 457 on packs alone (101.6%). Gerenth always appears (accusation, third wrong accusation, give-up button or the 150 s timeout, §3.6) and always grants +10 when he dies, so the event can only add slack, never remove it; a failed hunt costs time, not completion.
* Slack: A' 7 / 17, B 7 / 17, C 1 / 11. C is the tight route (every pack must die, a Rogue or jeweller must be in the party).
* Available forces are 580 (128.9% of 450). The unused part of any single route is the other branch, the salon, the observatory and the servants' stair: 113 forces. This is the same band as the sibling docs (122-131%) so the season tuning stays consistent.
* The market is the junction: both approaches lock behind the same boss door pair, so the party can finish one side and walk the other later only by re-entering after Gerdan dies (the doors reopen).
* The 4-boss-gate rule: B2's `boss_lock` is closed until B1 is dead even though the servants' door and the fel corridor both lead there.

### 6.3 Dangerous pulls and counters

| Pull | Why | Counter |
|---|---|---|
| `p28` foyer east (A2 G2 E1, 23 forces) | two Seal Magics plus a Glare inside 6 s | two kickers on the arcanists, third on the Eye; pull to the doorway, stun an arcanist |
| `p17` + `p19` + patrol `p20` (market, 57; with `p21` 72) | the Katliam pull: 4 casters + healer + patrol; Bolstering / Bursting nightmare | skip `p19` on those weeks; never pull `p20` mid-fight; `p21` (Duelist + Rahip + guard) is the safe fourth pull after posture-break |
| `p22` + `p23` (Zümrüt Geçit, 29) | 2 tiles wide, 7 mobs: Enforcer detonation plus Sürü Gücü hounds | pull back out up the ramp into the plaza through the open exit door (it is open after Gerdan), fight in the room not the corridor; **do not fight there on Storming / Sanguine** |
| `p25` (court SE, F2 G1) | two Fel Patlaması and two execute strings: up to 4 marked circles | spread 9 m; ranged stand at the edges; Tahkimli weeks: tank holds both; break one Enforcer's posture first |
| `p27` (foyer, C2) | two Şarjlı Ezme tank busters 3 s apart | one defensive each, pull away from `p28`; drop the winch chandelier (S11) on them |
| `p31` + `p34` linked (ballroom west, 31) | 3 Mistresses + Enforcer: `deep_wound` and Bewitch stacking | kick Bewitch, dispel slow, Necrotic week: kill Mistresses first, break a Mistress' posture (50) before it leaps |
| `p32` (ballroom centre, G2 A2 R1) | two Seal Magics and a healer shielding the others | kick Seal first, then the Rahip's Ay Şifası; the chandelier above them hangs at (30, 29) |
| `p37` + `p36` (ballroom north pairs, D2 E1 and D1 R1 G1) | posture duelists with a healer behind | stun or break one Duelist, kill the Rahip, avoid hitting the stance (Karşı Duruş) |
| `p40` + `p41` (servants' corridor and stairwell, 28) | 3 casters in an 8 x 20 m stairwell, no space | only for parties with 3 interrupts and a dispeller; the skip's price |
| `p35` patrol across the dance floor | body-pulls the southern line | time it, or pull it first with a Guard-only plan |
| `p05` + `p06` (garden, 23; with patrol `p07` 29) | three casters (Seal + Rahip + Glare) | pull one by one unless 3 interrupts are up |
| `p44` (tower top) | the lift arrival aggroes it within 12 m: Duelist, Arcanist, Eye land on the cage | ride with defensive cooldowns up, kill the Arcanist while the Duelist is staggered |
| Hunt time | wrong accusations cost ~25 s each | use the bonus clue from the salon, a Paladin, or the give-up button after the second wrong guess |

### 6.4 Affix interactions (ids from `data/mythicAffixes.ts`)

| Affix | Effect on this dungeon |
|---|---|
| **Tahkimli** (`fortified`) | Şarjlı Ezme and Rezonans become one-shots for anyone but the tank at +10; Seal Magic hits harder; the swarm packs (W, P, S) matter less, the elites more; the posture bar becomes the cheap answer to elites |
| **Zorba** (`tyrannical`) | Maelstrom raid pulses, Intensity stacks and the Lockdown DoT become the healer check; Taliksa's emissaries (bosses, +30% HP) take longer, so the -15% rule favours killing them first; Melandros phase 3 is long; the boss posture bar (120 / 100 / 80) is the way to shorten it |
| Güçlenen (`bolstering`) | wyrm / feeder packs bolster the pack they stand beside: kill the swarm last or pull it alone (`p01` and `p07` are meant as fodder) |
| Öfkeli (`raging`, Zorba weeks) | Guards and Mistresses below 30% are unstoppable; interrupts still work on casters; posture breaks interrupt the rage swing |
| Kan Dökücü (`sanguine`) | canal water and the corridors hold pools; fight in plazas (Çarşı, ballroom) |
| Patlayan (`bursting`) | swarm-heavy canals are the worst room; the horde rule (every 3rd swarm death) softens it |
| İlham Veren (`inspiring`) | the highest-HP non-swarm member of a 3+ pack is protected: Constructs, Enforcers, Mistresses, Duelists carry it, which makes **Seal Magic uninterruptible in their packs**: kill the inspiring unit first (`p04`, `p27`, `p34`) |
| Volkanik (`volcanic`) | needs 6 m of distance: harmless in corridors, deadly for ranged in the 120 m ballroom and the balcony |
| Sarsıntılı (`quaking`) | interrupts player casts within 5 m: spread healers and casters, especially during Taliksa's Intensity channel, Gerdan's Lockdown and Seal Magic silences (a quake plus a silence on the healer is the nightmare) |
| Patlayıcı Küre (`explosive`) | orbs in the open ballroom and market; wyrm packs hide them; the chandelier drop (S11) kills orbs under it |
| Nekrotik (`necrotic`) | Guards hit often: the foyer and ballroom patrols are the stack source; Mistress `deep_wound` stacks on top, so Mistresses die first |
| Kin Dolu (`spiteful`) | swarm deaths (canals) create shades; Zümrüt Köpek packs too |
| Fırtınalı (`storming`) | tornadoes are lethal in the 2-tile corridors (Zümrüt Geçit, Kuzey Kemeri) and on the lift: fight rooms, do not ride the cage with a tornado near it |
| Ağır Yara (`grievous`) | Intensity, Lockdown and image bleeds keep players below 90%: heavy for the healer on B2 and B3 |
| Efsunlu Yarık / Kibirli (`seasonal_efsun`, +10) | thresholds below; reuse the six `riftSpots` for the guardian or the Kibir Tecessümü anchor |

Scaling reference (GDD_CONTENT §5.4): at +10 trash x2.83 HP / x2.60 damage with Tahkimli, bosses x3.07 / x2.30 with Zorba; at +15 x4.56 / x3.82 and x4.94 / x3.38.

### 6.5 Efsunlu Yarık / Kibirli thresholds on route A'

`riftSpots` (6, outside boss arenas, >= 15 m apart): bahce (31, 53), kemer_avlusu (8, 46.5), kanallar (9, 71), hizmetci_avlusu (47, 58.5), ev_girisi (51.5, 27.5), ziyafet_salonu (21, 26.5).

| Threshold | Forces (of 450) | Where the party is (A') | Expected spot |
|---|---|---|---|
| 20% | 90 | yard (the 92nd force is the last yard pack) | yard (47, 58.5) or garden (31, 53) |
| 40% | 180 | market trash, just before Gerdan | garden (31, 53) or kemer_avlusu (8, 46.5), whichever is >= 15 m away and outside the arena |
| 60% | 270 | foyer (first foyer pack) | foyer (51.5, 27.5) |
| 80% | 360 | mid-ballroom | ballroom (21, 26.5), or the foyer spot if the party stands west |

### 6.6 Shrines, Font of Power, chests, lifts and boons

```ts
const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(26.5, 70.3),                                           // iskele, 2.5 tiles north of the start (26.5, 72.8)
  shrines: [
    { type: 'shrine_power', pos: pt(17.5, 53.5) },                       // bahce NW corner: use before the garden big pull or save for Gerdan
    { type: 'shrine_haste', pos: pt(52.5, 53.5) },                       // hizmetci_avlusu (optional room: the reward for the detour)
    { type: 'shrine_ward', pos: pt(58, 29) },                            // ev_girisi east nook: the ballroom pull / spy hunt
  ],
  riftSpots: ([[31, 53], [8, 46.5], [9, 71], [51.5, 27.5], [21, 26.5], [47, 58.5]] as [number, number][]).map(([x, z]) => pt(x, z)),
  chests: [{ pos: pt(6.5, 28.5), kind: 'chest_wood' }, { pos: pt(52.8, 56.5), kind: 'chest_gold' }, { pos: pt(18.5, 62.5), kind: 'chest_iron' }],
  lifts: [{ id: 'kule_lift', rect: [29, 16, 2, 2], from: 7.2, to: 16.8, speed: 1.6, idleReturn: 10, call: [[29.5, 18]] }],     // SPX-07, §3.0
  dropProps: [                                                            // S11, SPX-10
    { id: 'kandil_1', pos: pt(24, 29.5), winch: pt(24, 31) }, { id: 'kandil_2', pos: pt(30, 29), winch: pt(30, 31) },
    { id: 'kandil_3', pos: pt(37.5, 29), winch: pt(37.5, 31) }, { id: 'kandil_4', pos: pt(46.5, 25.5), winch: pt(45, 27) },
  ],
  boons: [                                                                // S13 Ay Çeşmeleri, SPX-10
    { id: 'cesme_bahce', pos: pt(31, 56.5) }, { id: 'cesme_carsi', pos: pt(16, 49.5) },
    { id: 'cesme_foyer', pos: pt(45, 29.5) }, { id: 'cesme_salon', pos: pt(42, 30.5) },
  ],
  // NEW (SPX-10): npcs: [...] spy hunt cast + ReqInteract panels (§3.6, §3.7)
};
```

Start `{ pos: shPt(26.5, 72.8), facing: 180 }`, exit `{ pos: shPt(36.5, 5.5) }` with the `chest_epic` beside it (engine). The shrine types are fixed per dungeon in Mitik+ (route planning); shrines are used only once. The three ballroom winches sit on the south pillars, the chandeliers hang directly above the pack centres they threaten (`kandil_*` `pos` is where the red ring is drawn: a 4.5 m ring covers the core of one pack).

---

## 7. Entrance: Yıldız Kapısı

**Where.** The level 45-60 map **Kadim Diyar** (GDD_OPENWORLD §0 lists it as a roadmap map, not designed yet), in a sub-region "Ay Terasları" (`regionId: 'kd_r3'`). Terrain type: **a pale limestone plateau of moonlit terraces over a still lake**: short silver grass, light cobble paths, night-bloom flower beds, cypress rows, one reflecting pool in front of the gate. It is the dry, noble, high-up counterpart of the other entrances (crypt door, forge mouth, ice cave, temple stairs). **Fallback if Kadim Diyar is late:** Karakır Bozkırı, a walled terrace at the north rim above the Kervansaray (same recipe, the region theme below is applied as a small "night enclave" local override).

**Look (matches the user's reference `docs/ref/ui/wow-dungeon-entrance.webp`):** a grand ornate gate set into a terrace wall: tall pale-lavender pillars with gold trim and **cyan glowing lanterns**, a **crimson-violet crystal emblem** with a crescent and star on top, a **swirling violet-white portal** in an arched double door, **wide curved stone stairs** climbing to it, **two cyan-fire braziers** at the base, and a meeting spot at the foot where players gather.

```
 N  ┌──────── terrace wall (limestone, vine hung) 36 m ───────────────────────────────┐
    │  [banner]   ys_arch_gate_nightborne 12 x 11 x 4 m   [banner]                    │
    │  pillar ║  crown: crescent + star + crimson gem  ║ pillar                       │
    │         ║           portal door (swirl)          ║                              │
    │  (cyan lantern)       top landing 12 x 4 m        (cyan lantern)                │
    │  brazier ◄──── curved stairs, 5 tiers, 12 m wide at the top, 20 m at the foot ──► brazier │
    │  meeting stone (lobby_obelisk)   landing 20 x 6 m   waypoint stone               │
    │              reflecting pool 16 x 6 m, cyan lanterns on posts                    │
    │  cypress row ║                                        ║ cypress row             │
 S  └─────────────── approach road (pale cobble, 6 m wide) ───────────────────────────┘
```

| Part | Assets |
|---|---|
| Gate | NEW `gp('ys_arch_gate_nightborne')` (until it exists: `kc('gate')` + two `kg('pillar-obelisk')` scaled 1.6, `kf('lantern')` x4 scaled as hanging lamps, `gp('crystal_purple')` on top, tint `0xd8d0f0`) |
| Stairs | `kf('stairs-stone-round')` and `kf('stairs-wide-stone-handrail')` x3 (x4 scale), tint `0xe0e4ff` |
| Braziers | `gp('brazier')` x2 with the flame recoloured cyan (`brazier_fire`, colour `0x6ac8ff`) and a PointLight `0x6ac8ff` intensity 2, distance 12 |
| Meeting spot | `gp('lobby_obelisk')` (Buluşma Taşı), `gp('waypoint_stone')`, `hw('bench_decorated')` x2, `gp('notice_board')` |
| Terrace wall and cliff | `gp('rock_cliff')` x4, `kc('wall')` / `kc('wall-narrow')` runs for the terrace wall (x4 scale, tint `0xd8dcf0`), `ip('psx-medieval','decoration/vine_hanging')` on the wall face |
| Garden | `gp('flowers')`, `gp('bush_a' / 'bush_b')` (tint indigo `0x2a3a78`), `gp('grass_tuft')` (tint `0xaab8d8`), cypress = `gp('tree_pine_b')` tinted `0x203a3a` scale 1.3, `gp('lamp_post')` cyan x6 |
| Water | `WorldExtras.water` rect 16 x 6 m in front of the stairs, fireflies `ambient_embers` colour `0xc8ff80` |

World data (`src/data/world/…`, Kadim Diyar file when it exists):

```ts
// EntranceDef (types/dungeons.ts): look needs the NEW 'palace' value (SPX-33)
{ id: 'ent_yildiz_divani', name: 'Yıldız Kapısı', dungeonId: 'yildiz_divani', pos: [148, 34], facing: 180, minLevel: 55, regionId: 'kd_r3', look: 'palace' }
// pos is a placeholder for a 200 x 160 map: the NE terrace; the gate faces south so the stairs descend toward the zone

// Sub-region atmosphere: "eternal night enclave" (the lore: time stopped on the Divan's last night)
const KD_AY_TERASLARI: RegionTheme = {
  fogColor: 0x141a3a, fogNear: 24, fogFar: 100, hemiSky: 0x8a9cff, hemiGround: 0x1a1030, hemiIntensity: 1.1,
  sunColor: 0x7a90ff, sunIntensity: 0.35, skyZenith: 0x0c1230, skyHorizon: 0x2a3a78,
  skyImage: '/assets/sky/itch/psx-skyboxes-free/night-moon.png',
  groundTex: { /* itch tiny-texture-pack: short grass, light cobble, pale dirt, dark stone; groundTint 0xb8c0e8 for the silver cast */ },
  groundTint: 0xb8c0e8, music: 'world_ruins', musicVolume: 0.8, ambientVfx: 'ambient_embers', ambientColor: 0xc8ff80,
};
```

Behaviour: the gate is the same `Portal` interactable as every other world entrance (difficulty panel, keystone panel for Mitik+, per-member gating from GDD_OPENWORLD §7), `minLevel 55`, `dungeonId: 'yildiz_divani'`; after a run the party returns **in front of the gate**, 6 m south (`returnTo`); the Dungeon Finder queues it once the entrance has been discovered. The Kadim Kapılar Salonu in Kuzgunkale keeps its own portal for keys.

---

## 8. Implementation packages for Haiku and the shared primitives

Process (project rules): Haiku codes, Sonnet reviews each diff, no per-agent browser tests, one Haiku QA pass at the end of all 8 dungeons, at most 5 concurrent agents. **All shared engine work is built once through the `SPX-WAVE-n` packages of `docs/dungeons/_shared_primitives.md` §3** (row `YD-S` below); the per-dungeon packages only consume it.

### 8.1 Shared primitives this dungeon consumes (canonical ids; specs and APIs live in `_shared_primitives.md`)

| Canonical id | Primitive | Used here for | Local v1 id |
|---|---|---|---|
| **SPX-01** | Enemy kit export | all enemy defs and boss defs (`add`, `boss`, `cone`, ...) | - |
| **SPX-02** | Pack helper and flags | the 44 packs, `PACK_EXTRA` | `pack()` |
| **SPX-03** | Season pool registry | register `yildiz_divani` in `MPLUS_POOL`, difficulties | SP-13 |
| **SPX-04** | Audio, music, VFX ids | `dungeon_court`, `water_lap`, `crowd_murmur`, `chandelier_creak`, `lift_hum`, `waltz_loop`, `ambient_leaves` | SP-10 |
| **SPX-05** | Sky, moon, open air | night-moon backdrop, balcony twilight, open rooms | SP-05 |
| **SPX-07** | **Verticality** | `floorY`, `ceiling`, 10 ramp strips, 5 daises, the Kule lift | new in v2 |
| **SPX-08** | Events and conditional doors | `spy_solved`, `servis_kilidi`, `nightwell_poisoned` flags and doors | SP-02 |
| **SPX-09** | Gate styles | `arcane`, `fel`, `wood` | SP-06 |
| **SPX-10** | Interactables | spy hunt NPCs, 4 `ReqInteract` panels, chandelier winches (S11), Ay Çeşmeleri boons (S13) | SP-03 |
| **SPX-11** | `grantForces` | the +10 spy event | SP-04 |
| **SPX-12** | Dormant `egg` kind | p12, p16 | - |
| **SPX-14** | Intermission | Melandros' echo | SP-01 (part) |
| **SPX-15** | Beams, bands | Melandros' wind wheel and wind bands | SP-01 (part) |
| **SPX-16** | Soak, mark, spread | Gerdan / Taliksa marks (optional) | SP-01 (part) |
| **SPX-18** | Images, `statusAll`, `raidPulse` | Melandros' blade images, Lockdown, Intensity | SP-01 (part) |
| **SPX-22** | **Posture, strings, recovery** | 4 elite types, all 3 bosses, the 3-hit strings and delayed swings | new in v2 |
| **SPX-23** | Ability params and must-answer UI | Fel Patlaması (`targets`), Gece Küresi (`chain`), Mühür Büyüsü (`interruptsCast`), the kick icons | SP-07 |
| **SPX-24** | Statuses and AI hooks | `arcane_lockdown`, `withering_soul`, `deep_wound`, `bewitch`, `ys_intensity`, `disguise`, `ay_cesmesi`; `disguiseBlind` | SP-08 |
| **SPX-26** | PROC bodies | `eye_orb`, `proc_beacon` | SP-12 |
| **SPX-27** | Light shafts | ballroom moon beams | - |
| **SPX-28** | Trash script registry | per-dungeon custom handlers (`ai/trash/yildiz.ts`) | - |
| **SPX-30** | Content check and pace tool | package YD-10 | YD-10 |
| **SPX-31** | Kibirli | thresholds of §6.5 | CM7 |
| **SPX-32** | Loot, uniques, trinket slots | 9 signature items | SP-11 |
| **SPX-33** | Entrance looks | `'palace'` look and recipe | SP-09 |

### 8.2 Per-dungeon packages (Yıldız Divanı)

| # | Package (Haiku) | Deliverable | Files | Depends on |
|---|---|---|---|---|
| **YD-S** | **Build-once shared package** (not owned by this dungeon) | the `SPX-WAVE-1 ... SPX-WAVE-5` packages of `_shared_primitives.md` §3 that the table in §8.1 lists; this dungeon's data package must not start before WAVE-1 and WAVE-2 and its boss scripts before WAVE-3 and WAVE-4 | see `_shared_primitives.md` | - |
| YD-1 | Data file | `YILDIZ_DIVANI: DungeonDef` with the rooms (§3.1, `floorY` and `ceiling` included), ramp strips and daises (§3.4), doors (§3.2), packs (§4.3, `packN` + `PACK_EXTRA`), bosses (`bossAt` x3), theme (§2.3), `EXTRAS` (§6.6, lifts, dropProps, boons), start/exit, `lore`, `grid { w: 62, h: 77 }`, `timerSec 1800`, `forcesRequired 450`, `levelRange [55, 60]`; register in `data/dungeons/index.ts` and `MPLUS_POOL` | `src/data/dungeons/yildiz_divani.ts` | YD-S (WAVE-1, WAVE-2) |
| YD-2 | Enemy defs | the 12 pack unit defs + Gerenth + 4 summoned / mech units of §4 (`add({...})`, posture blocks, string params) and the BossDefs (§5) with `R_GECE`; `loot_ys_b1..b3` ids | `src/data/enemies/yildiz.ts` (imported by `data/enemies.ts`), `src/data/loot.ts` | YD-S (WAVE-1, WAVE-3) |
| YD-3 | Boss scripts | `gerdan`, `taliksa` (+ emissary handlers), `melandros` as `BossScript`s with the ER layer of §5, `YILDIZ_SCRIPTS` / `YILDIZ_SPAWNS` registered in `ai/bosses/index.ts`; Gerenth CUSTOM handlers in `ai/trash/yildiz.ts` | `src/ai/bosses/yildiz.ts` | YD-S (WAVE-3, WAVE-4), YD-2 |
| YD-4 | Theme and props | the room decorators (`decorator()` + `p.at / ring / row / wall / torches`) from the §2.6 set-dressing list (props, lights, VFX, sounds per room); zones (§3.4); lights per §2.3; `ambientVfx`; `ROOM_EXTRA` | inside `yildiz_divani.ts` (kit helpers) | YD-1, YD-6 |
| YD-5 | Set pieces | spy-hunt system (generator, state machine, give-up button and timeout, NPC spawns, HUD list), Pınar poison, Hizmetçi Kilidi, Terzi Dolabı, Mücevher Küresi, class reveal, chandelier winches (S11), Ay Çeşmeleri (S13), the Kule lift calls | `src/scenes/SpyHunt.ts`, `src/data/dungeons/yildiz_divani.events.ts` | YD-S (WAVE-2) |
| YD-6 | Assets | the NEW props of §2.7 (19 props: Blender headless, `props_ys.py`, preview sheet, `docs/assets/generated-props.md` regenerated), loading art and icon | `tools/blender/props/props_ys.py`, `public/assets/models/gen/props/ys_*.glb`, `public/assets/loading/yildiz_divani.png` | - |
| YD-7 | Loot | the 9 signature items of §5.4 (`leg_ys_nobet_cani`, `leg_ys_kilitlenme_zinciri`, `leg_ys_fener_yuzugu`, `leg_ys_alevcelenk`, `leg_ys_zumrut_sozlesme`, `leg_ys_yakici_siddet`, `leg_ys_pinar_keser`, `leg_ys_yildiz_haritasi`, `leg_ys_yanki_kusagi`) via `u({...})` with their `special` handlers in the combat module | `src/data/uniques.ts`, combat specials | YD-S (WAVE-5, SPX-32) |
| YD-8 | Entrance | `EntranceDef`, `palace_gate` recipe, Kadim Diyar region theme, meeting spot, return spawn | `src/data/world/…`, world recipe | YD-S (SPX-33), the Kadim Diyar map doc |
| YD-9 | Audio | `dungeon_court` mapping (§2.10), boss track assignments, ambience beds, the five NEW sfx ids | `audio/manifest`, aliases | YD-S (SPX-04) |
| YD-10 | QA (one pass at the end) | `tools/content-check.mjs` (rooms/doors/packs/forces, reachability, **door height pairs and strip ends**, **trash windup rule**), forces per route (expect 457 / 467 / 493 / 457 / 451 without the spy), every boss ability id has a handler, every spawned id is preloaded, a headless boss smoke per script, M+ timer and forces HUD check, lift cycle test | - | all |

### 8.3 Acceptance checklist

* 21 rooms, 22 doors, 44 packs (142 mobs, 570 forces), 3 bosses, 10 forces from the event; `forcesRequired` 450 and the five route sums in §1.5 / §6.1 match (A' 457/467, A+ 467/477, A++ 493/503, B 457/467, C 451/461).
* **Heights:** 8 floor levels, every door pair `|dy| <= 0.45`, every ramp strip end `H / (2n) <= 0.45`, the lift reaches 16.8 and returns, boss arenas flat, the balcony is reachable only by the lift.
* Every `boss_lock` / `boss_exit` / `event_lock` door opens and closes per §3.2; B2 and B3 cannot be reached before their predecessors die.
* The spy hunt is solvable with the first 4 clues for any seed, never ambiguous, deterministic across peers, and **cannot block completion** (give-up, third wrong accusation and 150 s timeout all reveal Gerenth; `grantForces(10)` on his death).
* **Trash:** 12 pack unit types with 2-4 telegraphed attacks each, every windup within 0.01 s of `clamp(0.45 + 0.25 x coef, 0.45, 1.2)`, posture on Yapı, Cellat, Düellocu, Hanım; role mix present (kick-caster, healer, brute, swarm, posture elite); S11 and S6 set pieces work on trash.
* **Bosses:** each boss has its WoW mechanics intact plus the ER layer (strings with delayed hit, a leap or charge with recovery, a posture bar whose break cancels the named cast), and 3 named signature items.
* No ability appears in a boss script without a `custom()` / builder entry, and every status id exists in `data/statuses.ts`.
* Performance budget (ROADMAP): dungeon <= 500 draw calls / 350k tris / <= 8 real lights: the 120 x 52 m ballroom and 96 x 56 m market are built from instanced props, with 3-4 real lights each; the ring galleries, guests and chandeliers are instanced.

---

## 9. Critic round and rejected critique

| # | Critic issue (v1) | Resolution in v2 |
|---|---|---|
| 1 | Spy hunt mandatory on the default route; A' had 421 / 420 required and only 411 without Gerenth | **Accepted.** A' now has 457 forces without the spy and 467 with it against **450** (slack 7 / 17, §1.5, §6.1, §6.2); the hunt has a give-up button, a 150 s timeout and a third-wrong-accusation reveal, and `grantForces(10)` runs when Gerenth dies however he was revealed (§3.6); the hunt can only add slack, never remove it |
| 2 | Available forces 609 (145%) against 420; routes differed by 0-45 and optional wings were free | **Accepted.** Re-balanced to 570 + 10 = 580 forces (**128.9%**) against `forcesRequired` 450 (§1.1, §1.5, §8.3); the optional wings, the unused branch and the skip hold 113 forces, and the five route sums are 451-503 |
| 3 | Shared primitive numbering conflicts across the 8 docs; `YD-S` had no package row | **Accepted.** New `docs/dungeons/_shared_primitives.md` (canonical `SPX-nn` ids, one API per primitive, mapping table for every doc, build waves); §8.1 now lists canonical ids only; `YD-S` is a real package row in §8.2 |

**Rejected critique (sub-points only):**
* *"In WoW the hunt is optional and the dungeon is skippable."* Not supported by `docs/ref/dungeons/legion.md`, which says the hunt starts when Talixae dies and gates the way to the Balconies; we keep the hunt as the door to B3 (faithful) and make it **unfailable** instead of optional.
* *"Make p01 count 4 -> 6 or raise the Ballroom packs so A' lands near 430."* Not applied literally: the slack came from re-balancing the whole pack table against a higher requirement (450), which fixes the cause (a 145% surplus) rather than the symptom; p01 stays at 4 forces and the ballroom grew to 118 because the user's trash-variety rule added packs there anyway.
* *"Drop or merge optional-wing packs (salon, observatory, mana den)."* Not applied: those wings are the dungeon's rich optional content (the best clue, the observatory view, the nest) and the user wants every map as detailed as possible; the surplus was trimmed by moving forces into the mandatory spine and thinning the alternative canal branch instead.
