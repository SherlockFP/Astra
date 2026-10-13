# Audio assets — EFSUN ONLINE

All audio lives in `public/assets/audio/` and is served at **`/assets/audio/`** (Vite `public/`). 639 files, 42.8 MB total
(music 28.87 MB, sfx 13.92 MB). Every file is CC0 or CC-BY; see [credits-audio.md](credits-audio.md).
Machine-readable event map: **`/assets/audio/audio-events.json`** (same data as the tables below, keyed by `SfxId` / `MusicId` from `src/types/audio.ts`).

## Format and processing notes

- `.ogg` (Vorbis) and `.mp3` files are byte-for-byte copies of the downloads, except four long tracks where OpenGameArt's own full-length 112 kbps Vorbis transcode was used to save ~11 MB (noted in credits).
- `.wav` files were converted from 24-bit stereo WAV/AIFF sources to **16-bit mono at half rate (22.05 or 24 kHz)** with a windowed-sinc low-pass. That suits the PSX look and keeps each file small (most are under 60 KB).
- All 639 files were decoded with `AudioContext.decodeAudioData` in Chromium without errors. Older Safari versions cannot decode `.ogg`, so add mp3 fallbacks later if Safari matters.
- Durations come from the container: the Ogg granule position, a full MP3 frame scan, or the WAV data chunk. Loudness (peak dBFS and active RMS) was measured in the browser; the suggested `volume` values use it to bring sources to roughly -18 dB RMS.
- **Hot files:** `melee/sword_attack_*` and `melee/sword_clash_*` (StarNinjas) decode with peaks of +3 to +6 dBFS, so they clip. Keep their gain at 0.45 or lower, or put a `DynamicsCompressorNode` on the master bus (recommended anyway for horde fights).
- **Quiet files:** `magic/fire_0*`, `magic/arcane_05..07`, `loot/leather_*` and `music/dungeon_ambience_dark.ogg` need a gain above 1. That is fine on a GainNode, but `HTMLAudioElement.volume` stops at 1, so route music through `createMediaElementSource` and then a GainNode.
- **Loops:** mp3 has encoder padding, so mp3 loops (`town_old_tower_inn`, `dungeon_cold_sanctuary`, `dungeon_heated_lands`, `boss_epic_battle`, `combat_battle_theme_b`) can click or gap at the seam. Crossfade the ends or loop an AudioBuffer with trimmed `loopStart`/`loopEnd`. The InspectorJ tracks loop at least once internally.
- **Horde safety (ARPG density):** respect `maxVoices` per id, rate-limit the same id to about 1 per 30 ms, keep a global cap of about 32 voices, never repeat the same variant twice in a row, and use `pitchVar` (0.06 to 0.12) to avoid machine-gunning. Never voice-cap `loot_drop_legendary`, `level_up` or the M+ events.
- **Jingle mood** was estimated by pitch-tracking (start versus end median pitch, in semitones). Rising: `steel_02` +7.4, `pizzi_02` +8.0, `steel_15` +4.9, `pizzi_15` +4.8, `hit_10` +4.7, `hit_08` +4.6, `hit_09` +4.1, `pizzi_10` +3.8, `steel_10` +3.0. Falling: `steel_12` -15.9, `hit_15` -13.7, `hit_11` -13.3, `pizzi_16` -12, `pizzi_05` -9.1, `pizzi_01` -7.9, `steel_01` -7.0. This is a heuristic, so confirm by ear.
- **Gaps** (no free asset in this set): human voice grunts and death cries, a real bow release, skeleton bone rattles (dry wood is used as a proxy) and a crowd murmur for the hub town.

## Folder layout

| folder | files | size | contents |
|---|---|---|---|
| `music/` | 19 | 28.87 MB | menu, town, dungeon, combat, boss music + victory/defeat stingers |
| `sfx/ambience/` | 8 | 2.40 MB | dungeon bed loop, torch loop, wind loop, dark one-shots |
| `sfx/creatures/` | 105 | 2.65 MB | monster vocals by family |
| `sfx/footsteps/` | 35 | 0.26 MB | stone, wood, grass, snow, carpet, dirt |
| `sfx/jingles/` | 51 | 0.70 MB | Kenney Hit / Pizzicato / Steel jingles (00-16 each) |
| `sfx/loot/` | 52 | 1.05 MB | coins, gems, items, equip, potions |
| `sfx/magic/` | 35 | 1.66 MB | elemental attacks, buffs, casts, sparkle |
| `sfx/melee/` | 103 | 1.10 MB | swings, slashes, hits (flesh, metal, plate), blocks |
| `sfx/progression/` | 13 | 1.65 MB | level up / power up / reward |
| `sfx/ui/` | 127 | 1.31 MB | clicks, panels, errors, books, ticks |
| `sfx/world/` | 91 | 1.15 MB | doors, chests, breakables, bells, blacksmith |

## Event mapping (SfxId -> files)

Columns: files are picked at random (no immediate repeat). The layer is a second file played at the same time. vol is a GainNode value. pv is the random +/- playbackRate, with @x as the base rate. voices is the maximum number of concurrent instances. 3D means a PositionalAudio at the event position. Brace notation such as `swish_{01..13}.wav` stands for a numbered run.

### Combat

| id | files | layer | vol | pv | voices | 3D | notes |
|---|---|---|---|---|---|---|---|
| `swing_light` | melee/swish_{01..13}.wav (13) |  | 0.45 | 0.1 | 6 | yes |  |
| `swing_heavy` | melee/swing_{01..03}.wav, melee/blade_{01..03}.ogg (6) |  | 0.65 | 0.08 | 4 | yes |  |
| `hit_flesh` | melee/hit_flesh_medium_{01..05}.ogg, melee/hit_flesh_heavy_{01..05}.ogg (10) |  | 0.55 | 0.1 | 8 | yes | horde density: cap voices, rate-limit ~30 ms per id |
| `hit_metal` | melee/hit_metal_light_{01..05}.ogg, melee/hit_metal_medium_{01..05}.ogg, melee/hit_plate_medium_{01..05}.ogg (15) |  | 0.7 | 0.08 | 6 | yes |  |
| `hit_bone` | world/break_wood_light_{01..05}.ogg, melee/hit_plate_light_{01..05}.ogg (10) |  | 0.75 | 0.1 @1.15 | 6 | yes | no real bone sfx in CC0 set: dry wood knocks pitched up read as bone |
| `hit_crit` | melee/hit_flesh_heavy_{01..05}.ogg (5) | melee/hit_metal_heavy_{01..05}.ogg, melee/slice_{01..02}.ogg | 0.75 | 0.06 | 3 | yes | pair with hit-stop + screen shake |
| `block` | melee/sword_clash_{01..10}.ogg (10) | melee/hit_metal_medium_{01..05}.ogg | 0.35 | 0.06 | 3 | yes |  |
| `dodge` | loot/cloth_{01..04}.ogg (4) | melee/swish_{07..09}.wav | 1 | 0.06 @0.85 | 2 | yes |  |
| `whoosh` | melee/swish_{01..13}.wav (13) |  | 0.4 | 0.12 | 6 | yes |  |
| `bow_shot` | ui/pluck_{01..02}.ogg (2) | melee/swish_{12..13}.wav | 0.6 | 0.06 @0.65 | 4 | yes | proxy: string pluck pitched down + short whoosh (no CC0 bow in set) |
| `crossbow_shot` | world/metal_latch_01.ogg (1) | melee/swish_{11..13}.wav | 0.8 | 0.06 | 3 | yes |  |
| `dagger_throw` | melee/swish_{10..13}.wav (4) |  | 0.45 | 0.1 @1.2 | 4 | yes |  |
| `shield_bash` | melee/hit_plate_heavy_{01..05}.ogg (5) | melee/hit_soft_heavy_{01..05}.ogg | 0.85 | 0.06 | 2 | yes |  |
| `ground_slam` | magic/earth_01.ogg (1) | world/mining_{01..05}.ogg | 1 | 0.06 | 2 | yes |  |
| `war_cry` | magic/buff_attack_01.ogg (1) | creatures/roar_{05,02}.ogg | 1.1 | 0.06 @1.1 | 1 | yes | no human voice in set; roar layer at low volume |
| `spell_cast` | magic/spell_{01..02}.ogg, magic/cast_01.wav (3) |  | 0.7 | 0.06 | 4 | yes |  |
| `fire_cast` | magic/fire_{01..07}.ogg (7) |  | 1.8 | 0.06 | 4 | yes | source files are quiet (-30..-38 dB RMS): GainNode > 1 is fine |
| `fire_impact` | magic/fire_explosion_01.ogg (1) | magic/fire_{03..04}.ogg | 1.5 | 0.06 | 4 | yes |  |
| `frost_cast` | magic/wind_01.ogg (1) |  | 1.1 | 0.06 @1.25 | 3 | yes |  |
| `frost_impact` | magic/ice_explosion_01.ogg (1) | world/break_glass_light_{01..05}.ogg | 1.3 | 0.06 | 4 | yes |  |
| `lightning_cast` | magic/spell_{01..02}.ogg (2) |  | 0.7 | 0.06 @1.3 | 3 | yes |  |
| `lightning_impact` | magic/thunder_01.ogg (1) |  | 1.6 | 0.06 | 3 | yes |  |
| `shadow_cast` | magic/debuff_01.ogg (1) |  | 1.2 | 0.06 | 3 | yes |  |
| `shadow_impact` | ambience/dark_stinger_{02..04}.wav (3) |  | 0.5 | 0.06 | 3 | yes |  |
| `poison_impact` | magic/poison_01.ogg (1) | creatures/spit_{01..03}.ogg | 1.4 | 0.06 | 4 | yes |  |
| `heal` | magic/heal_01.ogg (1) |  | 1 | 0.06 | 2 | yes |  |
| `buff` | magic/buff_attack_01.ogg, magic/buff_defense_01.ogg, magic/speed_up_01.ogg (3) |  | 1.3 | 0.06 | 2 | yes | pick by buff type rather than random |
| `blink` | magic/arcane_{02,06}.ogg (2) | melee/swish_09.wav | 1.4 | 0.06 | 2 | yes |  |
| `explosion` | magic/fire_explosion_01.ogg (1) | world/break_wood_heavy_{01..05}.ogg, melee/hit_soft_heavy_{01..05}.ogg | 1.5 | 0.06 | 4 | yes |  |
| `player_hurt` | melee/hit_soft_medium_{01..05}.ogg (5) |  | 0.6 | 0.06 | 2 | no | no human grunt voices in the set (gap) |
| `player_death` | jingles/hit_15.ogg (1) | melee/hit_soft_heavy_{01..05}.ogg, loot/drop_leather_01.ogg | 0.8 | 0.06 | 1 | no |  |
| `enemy_death` | creatures/die_01.ogg, creatures/hurt_{03..04}.ogg, creatures/scream_{01..02}.ogg, creatures/monster_{08..09}.ogg (7) |  | 0.6 | 0.12 | 5 | yes | hordes: max 5 voices, others skipped |
| `skeleton_death` | world/break_wood_medium_{01..05}.ogg (5) | world/wood_{01..05}.ogg, loot/item_wood_{01..03}.ogg | 0.8 | 0.1 @1.1 | 5 | yes |  |
| `enemy_aggro` | creatures/monster_{01..09}.ogg, creatures/grunt_{01..05}.ogg, creatures/roar_{01..03}.ogg (17) |  | 0.7 | 0.1 | 3 | yes |  |
| `boss_roar` | creatures/roar_{04..06}.ogg, creatures/giant_02.wav, creatures/troll_02.ogg (5) |  | 1 | 0.06 @0.85 | 1 | yes |  |
| `boss_cast` | magic/charge_01.ogg, magic/cast_long_01.wav (2) |  | 0.9 | 0.06 | 1 | yes |  |
| `boss_death` | creatures/roar_06.ogg (1) | ambience/dark_stinger_01.wav, world/bell_heavy_01.ogg | 1 | 0.06 @0.8 | 1 | yes |  |
| `footstep_stone` | footsteps/stone_{01..05}.ogg (5) |  | 0.35 | 0.08 | 4 | yes | local player 0.35, remote players/enemies 0.15-0.2 |
| `footstep_dirt` | footsteps/dirt_{01..10}.ogg (10) |  | 0.4 | 0.08 | 4 | yes |  |
| `jump` | loot/cloth_{01..04}.ogg (4) | melee/swish_{01..02}.wav | 0.9 | 0.06 | 2 | yes |  |
| `land` | footsteps/dirt_{01..10}.ogg (10) | loot/drop_leather_01.ogg | 0.6 | 0.06 @0.8 | 2 | yes |  |

### Loot, items, blacksmith, world

| id | files | layer | vol | pv | voices | 3D | notes |
|---|---|---|---|---|---|---|---|
| `gold_pickup` | loot/coin_{01..03}.wav, loot/coins_{03..05}.ogg (6) |  | 0.8 | 0.06 | 3 | no |  |
| `item_pickup` | loot/item_misc_{01..06}.ogg (6) |  | 0.8 | 0.06 | 2 | no | better: by item class -> armor loot/cloth_*, weapon loot/metal_small_*, jewelry loot/jewelry_01, material loot/item_stone_*, potion loot/potion_bottle_01 |
| `loot_drop` | loot/item_misc_{01..06}.ogg, world/impact_light_{01..05}.ogg (11) |  | 0.6 | 0.06 @0.9 | 4 | yes |  |
| `loot_drop_rare` | loot/gem_{01..04}.ogg (4) | ui/glass_{02..03}.ogg | 1 | 0.06 | 3 | yes |  |
| `loot_drop_epic` | jingles/steel_{15,10}.ogg (2) | magic/shimmer_01.mp3, loot/gem_04.ogg | 0.7 | 0.06 | 2 | yes | non-positional is OK so players always notice |
| `loot_drop_legendary` | jingles/steel_02.ogg (1) | magic/shimmer_01.mp3, world/bell_heavy_03.ogg | 0.8 | 0.06 | 1 | yes | PoE/D2-style big drop: bell + shimmer + rising steel jingle; never voice-capped |
| `potion_drink` | loot/potion_drink_{01..03}.wav (3) |  | 0.6 | 0.06 | 1 | no |  |
| `equip` | loot/equip_armor_light_01.wav, loot/equip_chainmail_{01..02}.wav, loot/equip_cloth_01.wav, loot/equip_cloth_heavy_01.wav (5) |  | 0.7 | 0.06 | 1 | no | weapons: melee/unsheathe_*, jewelry: loot/jewelry_01 |
| `unequip` | loot/cloth_belt_{01..02}.ogg, loot/belt_handle_{01..02}.ogg, loot/leather_{01..02}.ogg (6) |  | 1 | 0.06 | 1 | no |  |
| `upgrade_success` | world/metal_03.ogg (1) | jingles/steel_{10,15}.ogg, loot/metal_ringing_01.wav | 0.9 | 0.06 | 1 | no | play hammer (world/mining_*) 2-3x before the result for suspense |
| `upgrade_fail` | world/mining_{01..05}.ogg (5) | jingles/hit_11.ogg, jingles/pizzi_05.ogg | 0.7 | 0.06 | 1 | no |  |
| `upgrade_destroy` | world/break_glass_heavy_{01..05}.ogg (5) | jingles/steel_12.ogg, world/stones_03.ogg | 0.9 | 0.06 | 1 | no |  |
| `sell` | loot/coins_{01,02,06}.ogg (3) |  | 1 | 0.02 | 2 | no |  |
| `buy` | loot/coins_{04..05}.ogg (2) | ui/confirm_01.ogg | 1 | 0.02 | 2 | no |  |
| `chest_open` | world/lock_{01..03}.ogg (3) | world/creak_{01..03}.ogg | 1 | 0.06 | 2 | yes | lock first, creak ~0.25 s later, then loot burst |
| `door_open` | world/door_open_{01..02}.ogg, world/door_heavy_01.wav (3) |  | 0.8 | 0.06 | 2 | yes | dungeon gates: door_heavy_01 + world/chain_* |
| `portal_enter` | magic/arcane_{03..04}.ogg (2) | magic/absorb_01.ogg | 1.2 | 0.06 | 1 | no |  |

### UI, progression, Mythic+, party

| id | files | layer | vol | pv | voices | 3D | notes |
|---|---|---|---|---|---|---|---|
| `ui_click` | ui/click_01.ogg, ui/click_soft_{01..05}.ogg (6) |  | 0.5 | 0.02 | 2 | no |  |
| `ui_hover` | ui/hover_{02..03}.ogg (2) |  | 0.25 | 0.02 | 2 | no |  |
| `ui_open` | ui/open_{01..04}.ogg (4) |  | 0.5 | 0.02 | 2 | no | inventory: loot/cloth_belt_01, skill tree / passive book: ui/book_open_01 |
| `ui_close` | ui/close_{01..04}.ogg (4) |  | 0.5 | 0.02 | 2 | no | book panels: ui/book_close_01 |
| `ui_error` | ui/error_{04,07,08}.ogg (3) |  | 0.5 | 0.02 | 2 | no |  |
| `ui_tab` | ui/toggle_{01..04}.ogg (4) |  | 0.45 | 0.02 | 2 | no |  |
| `ui_drag` | loot/leather_{01..02}.ogg, ui/select_07.ogg (3) |  | 0.8 | 0.02 | 2 | no |  |
| `ui_drop` | ui/drop_{01..04}.ogg (4) |  | 0.5 | 0.02 | 2 | no |  |
| `level_up` | jingles/steel_02.ogg (1) | magic/revive_01.ogg | 0.8 | 0.02 | 1 | no | steel_02 rises ~+7 semitones (pitch-tracked); revive_01 adds a 6.7 s sparkle tail |
| `quest_complete` | jingles/pizzi_02.ogg (1) |  | 0.8 | 0.02 | 2 | no |  |
| `achievement` | jingles/pizzi_15.ogg (1) | magic/shimmer_01.mp3 | 0.8 | 0.02 | 2 | no |  |
| `keystone_insert` | world/metal_latch_01.ogg (1) | world/bell_heavy_04.ogg, magic/charge_01.ogg | 0.9 | 0.06 | 1 | no |  |
| `keystone_upgrade` | jingles/hit_{09..10}.ogg, jingles/steel_15.ogg (3) | magic/shimmer_01.mp3 | 0.8 | 0.02 | 2 | no | not random: +1 -> hit_09, +2 -> hit_10, +3 -> steel_15 (+ layer bell_heavy_05 on +3) |
| `keystone_deplete` | jingles/steel_12.ogg (1) | world/break_glass_medium_{01..05}.ogg | 0.8 | 0.02 | 2 | no |  |
| `mplus_start` | world/bell_heavy_01.ogg (1) | ambience/dark_stinger_04.wav | 0.9 | 0.02 | 2 | no |  |
| `mplus_complete` | world/bell_heavy_02.ogg (1) | jingles/steel_02.ogg | 0.8 | 0.02 | 2 | no | then music: victory (stinger_victory -> victory_theme) |
| `mplus_fail` | jingles/hit_15.ogg (1) | world/bell_heavy_03.ogg | 0.8 | 0.02 @0.85 | 2 | no | then music: defeat |
| `countdown_tick` | ui/tick_{01..03}.ogg (3) |  | 0.6 | 0.02 | 2 | no | final GO: world/bell_heavy_05 |
| `ready_check` | ui/question_{01..04}.ogg (4) |  | 0.6 | 0.02 | 2 | no |  |
| `party_join` | ui/maximize_{02,09}.ogg (2) |  | 0.5 | 0.02 | 2 | no |  |
| `party_leave` | ui/minimize_{02,09}.ogg (2) |  | 0.5 | 0.02 | 2 | no |  |
| `chat` | ui/pluck_{01..02}.ogg, ui/bong_01.ogg (3) |  | 0.4 | 0.02 | 2 | no |  |

### Suggested additional ids (not yet in `SFX_IDS`; the audio owner may add them)

| id | files | layer | vol | pv | voices | 3D | notes |
|---|---|---|---|---|---|---|---|
| `enemy_hurt` | creatures/hurt_{01..07}.ogg (7) |  | 0.6 | 0.12 | 4 | yes |  |
| `enemy_aggro_beast` | creatures/beast_{01..08}.wav, creatures/bark_{01..02}.ogg, creatures/howl_01.ogg, creatures/wolfman_01.wav (12) |  | 0.7 | 0.06 | 3 | yes |  |
| `enemy_aggro_ghost` | creatures/ghost_{01..08}.wav (8) |  | 0.7 | 0.06 | 3 | yes |  |
| `enemy_aggro_slime` | creatures/slime_{01..04}.ogg, creatures/slime_{05..08}.wav, creatures/burble_{01..02}.ogg (10) |  | 0.8 | 0.06 | 3 | yes |  |
| `enemy_aggro_spider` | creatures/bug_{01..04}.ogg, creatures/bite_{01..03}.wav (7) |  | 0.8 | 0.06 | 3 | yes |  |
| `enemy_aggro_brute` | creatures/ogre_{01..05}.wav, creatures/troll_{01..03}.ogg, creatures/giant_{01..05}.wav (13) |  | 0.8 | 0.06 | 2 | yes |  |
| `enemy_aggro_demon` | creatures/alien_{01..06}.ogg, creatures/weird_{01..05}.ogg (11) |  | 0.8 | 0.06 | 3 | yes |  |
| `enemy_idle` | creatures/chatter_{01..08}.ogg, creatures/breath_01.ogg (9) |  | 0.4 | 0.06 | 2 | yes |  |
| `enemy_spit` | creatures/spit_{01..03}.ogg (3) |  | 0.8 | 0.06 | 3 | yes |  |
| `hit_armor_plate` | melee/hit_plate_heavy_{01..05}.ogg, melee/hit_plate_light_{01..05}.ogg, melee/hit_plate_medium_{01..05}.ogg (15) |  | 0.85 | 0.06 | 6 | yes |  |
| `hit_blunt` | melee/hit_soft_heavy_{01..05}.ogg, melee/hit_blunt_01.wav (6) |  | 0.7 | 0.06 | 6 | yes |  |
| `weapon_draw` | melee/unsheathe_{01..05}.wav (5) |  | 0.6 | 0.06 | 1 | no |  |
| `footstep_wood` | footsteps/wood_{01..05}.ogg (5) |  | 0.35 | 0.06 | 4 | yes |  |
| `footstep_grass` | footsteps/grass_{01..05}.ogg (5) |  | 0.35 | 0.06 | 4 | yes |  |
| `footstep_snow` | footsteps/snow_{01..05}.ogg (5) |  | 0.35 | 0.06 | 4 | yes |  |
| `footstep_carpet` | footsteps/carpet_{01..05}.ogg (5) |  | 0.35 | 0.06 | 4 | yes |  |
| `door_close` | world/door_close_{01..04}.ogg (4) |  | 0.8 | 0.06 | 2 | yes |  |
| `gate_heavy` | world/door_heavy_01.wav (1) | world/chain_{01..03}.ogg | 0.9 | 0.06 | 1 | yes |  |
| `chest_locked` | world/metal_click_01.ogg (1) | ui/error_04.ogg | 1 | 0.06 | 1 | yes |  |
| `barrel_break` | world/break_wood_medium_{01..05}.ogg, world/break_wood_heavy_{01..05}.ogg, world/plank_{01..05}.ogg (15) |  | 0.8 | 0.06 | 4 | yes |  |
| `pot_break` | world/break_glass_medium_{01..05}.ogg, world/break_glass_heavy_{01..05}.ogg (10) |  | 0.8 | 0.06 | 4 | yes |  |
| `rubble` | world/stones_{01..04}.ogg (4) |  | 0.9 | 0.06 | 3 | yes |  |
| `lever` | world/metal_latch_01.ogg, world/metal_click_01.ogg (2) |  | 0.9 | 0.06 | 1 | yes |  |
| `trap_trigger` | world/chain_{01..03}.ogg, world/metal_02.ogg (4) |  | 0.9 | 0.06 | 2 | yes |  |
| `blacksmith_hammer` | world/mining_{01..05}.ogg, world/metal_{01..03}.ogg (8) |  | 0.8 | 0.06 | 2 | no |  |
| `efsun_reroll` | magic/arcane_03.ogg (1) | ui/glass_04.ogg | 1 | 0.06 | 1 | no |  |
| `efsun_reveal` | magic/shimmer_01.mp3 (1) | loot/item_stone_01.ogg | 0.8 | 0.06 | 1 | no |  |
| `passive_allocate` | ui/glass_{02,03,05}.ogg (3) |  | 0.6 | 0.02 | 2 | no |  |
| `passive_refund` | ui/back_{01..04}.ogg (4) |  | 0.5 | 0.02 | 2 | no |  |
| `skill_unlock` | progression/upper_01.wav (1) |  | 1.1 | 0.02 | 2 | no |  |
| `vault_open` | world/lock_02.ogg (1) | world/creak_01.ogg, loot/coins_06.ogg, jingles/steel_02.ogg | 1 | 0.02 | 2 | no |  |
| `reward_coin` | progression/coin_get_01.wav (1) |  | 1.2 | 0.02 | 2 | no |  |
| `enemy_forces_complete` | jingles/steel_10.ogg (1) |  | 0.8 | 0.02 | 2 | no |  |
| `timer_warning` | world/bell_heavy_03.ogg (1) | ui/tick_03.ogg | 0.7 | 0.02 | 2 | no | last 60 s of the M+ timer; progression/alarm_01 is a harsher option |
| `affix_proc` | ambience/dark_stinger_{02..04}.wav (3) |  | 0.6 | 0.06 | 2 | yes |  |
| `boss_phase` | ambience/dark_stinger_{01,05}.wav (2) |  | 0.7 | 0.06 | 1 | no |  |
| `boss_pull` | creatures/roar_06.ogg (1) | world/bell_heavy_02.ogg | 1 | 0.06 | 1 | no | and music stinger_boss_intro -> boss |
| `player_revive` | magic/revive_01.ogg (1) |  | 1.4 | 0.06 | 1 | no |  |
| `life_leech` | magic/absorb_01.ogg (1) |  | 1.3 | 0.06 | 2 | yes |  |
| `stun` | magic/sleep_01.ogg (1) |  | 1.4 | 0.06 | 3 | yes |  |
| `ui_confirm` | ui/confirm_{01..04}.ogg (4) |  | 0.45 | 0.02 | 2 | no |  |
| `ui_back` | ui/back_{01..04}.ogg (4) |  | 0.5 | 0.02 | 2 | no |  |
| `ui_page_flip` | ui/page_flip_{01..03}.ogg, ui/book_{01..04}.ogg (7) |  | 0.9 | 0.02 | 2 | no |  |
| `ui_menu_button` | ui/menu_{01..06}.wav (6) |  | 0.45 | 0.02 | 2 | no |  |
| `ui_notify` | ui/bong_01.ogg, ui/question_02.ogg (2) |  | 0.5 | 0.02 | 2 | no |  |
| `room_join` | jingles/hit_14.ogg (1) |  | 0.7 | 0.02 | 2 | no |  |

### Ambience

| id | files | vol | loop | 3D | notes |
|---|---|---|---|---|---|
| `amb_dungeon_bed` | ambience/dungeon_loop_01.ogg | 0.6 | true | no |  |
| `amb_torch` | ambience/fire_loop_01.ogg | 0.35 | true | yes | PositionalAudio on braziers, refDistance ~2, maxDistance ~12; randomise start offset |
| `amb_wind` | ambience/wind_loop_01.ogg | 0.8 | true | no |  |
| `amb_dread_oneshot` | ambience/dark_stinger_{01..05}.wav | 0.4 | false | no | random every 45-90 s while exploring |

## Music mapping (MusicId -> tracks)

| MusicId | track(s) | alt / intro / then | gain | loop | notes |
|---|---|---|---|---|---|
| `menu` | menu_the_fall_of_arcana.ogg | alt: menu_rise_of_spirit.ogg | 1 | true |  |
| `town` | town_old_tower_inn.mp3, town_market_day_loop.ogg, town_theme_rpg.mp3 |  | 1 | true | playlist; per-track gain: old_tower 1.2, market_day 0.6, town_theme 1.0 |
| `dungeon_crypt` | dungeon_ambience_dark.ogg | alt: dungeon_cave_theme.ogg | 4 | true | dungeon_ambience_dark is very quiet (-40 dB RMS, peak -20 dBFS): needs GainNode ~4; cave_theme at 1.0 |
| `dungeon_fire` | dungeon_heated_lands.mp3 |  | 1 | true |  |
| `dungeon_frost` | dungeon_cold_sanctuary.mp3 |  | 1 | true |  |
| `dungeon_shadow` | dungeon_dark_shrine_loop.ogg | alt: dungeon_cave_theme.ogg | 2 | true |  |
| `boss` | boss_colossus.ogg, boss_epic_battle.mp3, boss_great_boss.ogg | intro: stinger_dark_boss_intro.ogg | 0.8 | true | per-track gain: colossus 0.9, epic_battle 0.55, great_boss 0.6; colossus for final bosses / high keys |
| `victory` | stinger_victory.mp3 | then: victory_theme.mp3 | 0.9 | false |  |
| `defeat` | defeat_theme.mp3 |  | 0.9 | false |  |
| `combat` | combat_battle_theme_a.ogg, combat_battle_theme_b.mp3 |  | 0.85 | true | SUGGESTED new MusicId: optional layer for big pulls; battle_theme_b gain 1.0, a 0.85 |

Suggested flow:
1. Menu and login use `menu`.
2. The hub plays the `town` playlist with `amb_wind`.
3. Entering a dungeon plays that dungeon's `dungeon_*` music plus `amb_dungeon_bed` and `amb_torch` on braziers.
4. Optionally duck to `combat` on big pulls.
5. A boss pull plays the `stinger_dark_boss_intro` stinger plus the `boss_pull` sfx, then crossfades (1.5 s) into `boss`.
6. A timed key completion plays `victory` (fanfare, then results loop). A depleted key or wipe plays `defeat`.

## File inventory (every file)

Public URL = `/assets/audio/<path>`. "src" is the source id from credits-audio.md, followed by the original file name.

### music/ (19 files, 28.87 MB)

| path | dur | format | size | intended use | src (original name) |
|---|---|---|---|---|---|
| `music/boss_colossus.ogg` | 125.9 s | ogg 44.1k st | 1.64 MB | final boss / high key boss (choir, drums) | m-colossus (Blackmoor Colossus.mp3.ogg, OGA transcode) |
| `music/boss_epic_battle.mp3` | 123.5 s | mp3 44.1k st | 2.36 MB | boss fight (God of War style, intense) | m-epic-boss (Juhani Junkala - Epic Boss Battle Preview.mp3) |
| `music/boss_great_boss.ogg` | 111.0 s | ogg 44.1k st | 2.57 MB | boss fight alt | m-great-boss (Great Boss.ogg) |
| `music/combat_battle_theme_a.ogg` | 95.9 s | ogg 44.1k st | 1.30 MB | big pull / trash combat (epic strings+horns) | m-battle-a (battleThemeA_0.mp3.ogg, OGA transcode) |
| `music/combat_battle_theme_b.mp3` | 66.0 s | mp3 44.1k st | 1.51 MB | trash combat alt (harpsichord bridge) | m-battle-b (battleThemeB.mp3) |
| `music/defeat_theme.mp3` | 45.2 s | mp3 44.1k st | 710 KB | party wipe / key depleted results (45 s) | m-defeat (defeat.mp3) |
| `music/dungeon_ambience_dark.ogg` | 206.0 s | ogg 44.1k st | 1.15 MB | crypt dungeon exploration (very quiet dark ambient, gain ~4) | m-dungeon-ambience (dungeon002.ogg) |
| `music/dungeon_cave_theme.ogg` | 280.0 s | ogg 44.1k st | 3.06 MB | cave/shadow dungeon exploration (mysterious) | m-cave-theme (cave themeb4.ogg) |
| `music/dungeon_cold_sanctuary.mp3` | 123.5 s | mp3 44.1k st | 1.65 MB | frost dungeon exploration (orchestral) | m-cold-sanctuary (Cold Sanctuary MP3.mp3) |
| `music/dungeon_dark_shrine_loop.ogg` | 56.6 s | ogg 44.1k st | 663 KB | shadow dungeon / shrine loop (short dark) | m-dark-shrine (qubodup-yd-DarkShrineLoop-OpenGameArt.ogg) |
| `music/dungeon_heated_lands.mp3` | 188.4 s | mp3 44.1k st | 2.52 MB | fire/desert dungeon exploration (orchestral) | m-heated-lands (Heated Lands - MP3.mp3) |
| `music/menu_rise_of_spirit.ogg` | 82.3 s | ogg 44.1k st | 1.48 MB | character select / login (epic, short) | m-rise-of-spirit (Rise of spirit.ogg) |
| `music/menu_the_fall_of_arcana.ogg` | 152.0 s | ogg 44.1k st | 1.99 MB | main menu (epic orchestral) | m-fall-of-arcana (The Fall of Arcana.mp3.ogg, OGA transcode) |
| `music/stinger_dark_boss_intro.ogg` | 20.6 s | ogg 96k st | 206 KB | boss intro / boss pull stinger (20 s, fades) | m-dark-stinger (dark_stinger_0.ogg) |
| `music/stinger_victory.mp3` | 11.9 s | mp3 44.1k st | 186 KB | victory stinger (dungeon cleared in time) | m-victory-fanfare (Heavy_ConceptB.mp3) |
| `music/town_market_day_loop.ogg` | 64.9 s | ogg 44.1k st | 968 KB | hub town market (lively loop) | m-market-day (Loop_Market_Day.mp3.ogg, OGA transcode) |
| `music/town_old_tower_inn.mp3` | 105.5 s | mp3 44.1k st | 2.42 MB | hub town (calm medieval tavern) | m-old-tower-inn (The_Old_Tower_Inn.mp3) |
| `music/town_theme_rpg.mp3` | 97.5 s | mp3 44.1k st | 1.26 MB | hub town alt (harp & recorder) | m-town-theme (TownTheme.mp3) |
| `music/victory_theme.mp3` | 56.7 s | mp3 44.1k st | 1.30 MB | results screen after success | m-victory-theme (Victory1.mp3) |

### sfx/ambience/ (8 files, 2.40 MB)

| path | dur | format | size | intended use | src (original name) |
|---|---|---|---|---|---|
| `sfx/ambience/dark_stinger_01.wav` | 4.62 s | wav16 22.05k mono | 199 KB | dark one-shot (affix proc, phase change, random dungeon dread) | oga-ogrebane-dark (ambience-1.wav) |
| `sfx/ambience/dark_stinger_02.wav` | 1.81 s | wav16 22.05k mono | 78 KB | dark one-shot (affix proc, phase change, random dungeon dread) | oga-ogrebane-dark (ambience-2.wav) |
| `sfx/ambience/dark_stinger_03.wav` | 1.69 s | wav16 22.05k mono | 73 KB | dark one-shot (affix proc, phase change, random dungeon dread) | oga-ogrebane-dark (ambience-3.wav) |
| `sfx/ambience/dark_stinger_04.wav` | 1.40 s | wav16 22.05k mono | 60 KB | dark one-shot (affix proc, phase change, random dungeon dread) | oga-ogrebane-dark (ambience-4.wav) |
| `sfx/ambience/dark_stinger_05.wav` | 3.44 s | wav16 22.05k mono | 148 KB | dark one-shot (affix proc, phase change, random dungeon dread) | oga-ogrebane-dark (ambience-5.wav) |
| `sfx/ambience/dungeon_loop_01.ogg` | 94.3 s | ogg 48k st | 1.55 MB | dungeon bed loop: low wind + water drips (94 s) | oga-jaggedstone-dungeon (dungeon_ambient_1.ogg) |
| `sfx/ambience/fire_loop_01.ogg` | 5.02 s | ogg 44.1k st | 66 KB | torch/brazier crackle loop (positional) | oga-qubodup-fire (qubodupFireLoop.ogg) |
| `sfx/ambience/wind_loop_01.ogg` | 5.96 s | ogg 48k st | 246 KB | outdoor wind loop (hub, towers) | oga-sketchman3-wind (wind woosh loop.ogg) |

### sfx/creatures/ (105 files, 2.65 MB)

| path | dur | format | size | intended use | src (original name) |
|---|---|---|---|---|---|
| `sfx/creatures/alien_01.ogg` | 0.70 s | ogg 48k st | 43 KB | void/eldritch creature vocal | oga-rubberduck-creature (alien_01.ogg) |
| `sfx/creatures/alien_02.ogg` | 0.78 s | ogg 48k st | 38 KB | void/eldritch creature vocal | oga-rubberduck-creature (alien_02.ogg) |
| `sfx/creatures/alien_03.ogg` | 0.83 s | ogg 48k st | 52 KB | void/eldritch creature vocal | oga-rubberduck-creature (alien_03.ogg) |
| `sfx/creatures/alien_04.ogg` | 0.72 s | ogg 48k st | 34 KB | void/eldritch creature vocal | oga-rubberduck-creature (alien_04.ogg) |
| `sfx/creatures/alien_05.ogg` | 0.45 s | ogg 48k st | 24 KB | void/eldritch creature vocal | oga-rubberduck-creature (alien_05.ogg) |
| `sfx/creatures/alien_06.ogg` | 0.42 s | ogg 48k st | 25 KB | void/eldritch creature vocal | oga-rubberduck-creature (alien_06.ogg) |
| `sfx/creatures/bark_01.ogg` | 0.40 s | ogg 48k st | 17 KB | wolf/hound bark | oga-rubberduck-creature (barking_01.ogg) |
| `sfx/creatures/bark_02.ogg` | 0.46 s | ogg 48k st | 16 KB | wolf/hound bark | oga-rubberduck-creature (barking_02.ogg) |
| `sfx/creatures/beast_01.wav` | 0.44 s | wav16 24k mono | 21 KB | guttural beast vocal | oga-rpgpack (mnstr1.wav) |
| `sfx/creatures/beast_02.wav` | 0.50 s | wav16 24k mono | 23 KB | guttural beast vocal | oga-rpgpack (mnstr2.wav) |
| `sfx/creatures/beast_03.wav` | 0.54 s | wav16 24k mono | 25 KB | guttural beast vocal | oga-rpgpack (mnstr3.wav) |
| `sfx/creatures/beast_04.wav` | 0.70 s | wav16 24k mono | 33 KB | guttural beast vocal | oga-rpgpack (mnstr4.wav) |
| `sfx/creatures/beast_05.wav` | 0.92 s | wav16 24k mono | 43 KB | guttural beast vocal | oga-rpgpack (mnstr5.wav) |
| `sfx/creatures/beast_06.wav` | 0.71 s | wav16 24k mono | 33 KB | guttural beast vocal | oga-rpgpack (mnstr6.wav) |
| `sfx/creatures/beast_07.wav` | 0.65 s | wav16 24k mono | 30 KB | guttural beast vocal | oga-rpgpack (mnstr7.wav) |
| `sfx/creatures/beast_08.wav` | 0.58 s | wav16 24k mono | 27 KB | guttural beast vocal | oga-rpgpack (mnstr8.wav) |
| `sfx/creatures/bite_01.wav` | 0.38 s | wav16 24k mono | 18 KB | small bite (spiders, rats) | oga-rpgpack (bite-small.wav) |
| `sfx/creatures/bite_02.wav` | 0.35 s | wav16 24k mono | 16 KB | small bite (spiders, rats) | oga-rpgpack (bite-small2.wav) |
| `sfx/creatures/bite_03.wav` | 0.52 s | wav16 24k mono | 24 KB | small bite (spiders, rats) | oga-rpgpack (bite-small3.wav) |
| `sfx/creatures/breath_01.ogg` | 0.67 s | ogg 48k st | 28 KB | heavy breath (boss idle) | oga-rubberduck-creature (breath.ogg) |
| `sfx/creatures/bug_01.ogg` | 0.58 s | ogg 48k st | 26 KB | insect/spider vocal | oga-rubberduck-creature (bug_01.ogg) |
| `sfx/creatures/bug_02.ogg` | 0.57 s | ogg 48k st | 29 KB | insect/spider vocal | oga-rubberduck-creature (bug_02.ogg) |
| `sfx/creatures/bug_03.ogg` | 0.35 s | ogg 48k st | 22 KB | insect/spider vocal | oga-rubberduck-creature (bug_03.ogg) |
| `sfx/creatures/bug_04.ogg` | 0.45 s | ogg 48k st | 20 KB | insect/spider vocal | oga-rubberduck-creature (bug_04.ogg) |
| `sfx/creatures/burble_01.ogg` | 0.99 s | ogg 48k st | 48 KB | slime / bog creature | oga-rubberduck-creature (burble_01.ogg) |
| `sfx/creatures/burble_02.ogg` | 0.93 s | ogg 48k st | 42 KB | slime / bog creature | oga-rubberduck-creature (burble_02.ogg) |
| `sfx/creatures/chatter_01.ogg` | 0.26 s | ogg 48k st | 16 KB | small creature idle chatter (keep quiet) | oga-rubberduck-rpg (creature_misc_01.ogg) |
| `sfx/creatures/chatter_02.ogg` | 0.19 s | ogg 48k st | 8 KB | small creature idle chatter (keep quiet) | oga-rubberduck-rpg (creature_misc_02.ogg) |
| `sfx/creatures/chatter_03.ogg` | 0.64 s | ogg 48k st | 29 KB | small creature idle chatter (keep quiet) | oga-rubberduck-rpg (creature_misc_03.ogg) |
| `sfx/creatures/chatter_04.ogg` | 0.55 s | ogg 48k st | 24 KB | small creature idle chatter (keep quiet) | oga-rubberduck-rpg (creature_misc_04.ogg) |
| `sfx/creatures/chatter_05.ogg` | 0.60 s | ogg 48k st | 15 KB | small creature idle chatter (keep quiet) | oga-rubberduck-rpg (creature_misc_05.ogg) |
| `sfx/creatures/chatter_06.ogg` | 0.42 s | ogg 48k st | 22 KB | small creature idle chatter (keep quiet) | oga-rubberduck-rpg (creature_misc_06.ogg) |
| `sfx/creatures/chatter_07.ogg` | 0.35 s | ogg 48k st | 15 KB | small creature idle chatter (keep quiet) | oga-rubberduck-rpg (creature_misc_07.ogg) |
| `sfx/creatures/chatter_08.ogg` | 0.46 s | ogg 48k st | 16 KB | small creature idle chatter (keep quiet) | oga-rubberduck-rpg (creature_misc_08.ogg) |
| `sfx/creatures/die_01.ogg` | 1.06 s | ogg 48k st | 16 KB | monster death | oga-rubberduck-rpg (creature_die_01.ogg) |
| `sfx/creatures/ghost_01.wav` | 0.53 s | wav16 24k mono | 25 KB | ghost/wraith/shade vocal | oga-rpgpack (shade1.wav) |
| `sfx/creatures/ghost_02.wav` | 0.55 s | wav16 24k mono | 26 KB | ghost/wraith/shade vocal | oga-rpgpack (shade2.wav) |
| `sfx/creatures/ghost_03.wav` | 0.59 s | wav16 24k mono | 28 KB | ghost/wraith/shade vocal | oga-rpgpack (shade3.wav) |
| `sfx/creatures/ghost_04.wav` | 0.67 s | wav16 24k mono | 31 KB | ghost/wraith/shade vocal | oga-rpgpack (shade4.wav) |
| `sfx/creatures/ghost_05.wav` | 0.67 s | wav16 24k mono | 31 KB | ghost/wraith/shade vocal | oga-rpgpack (shade5.wav) |
| `sfx/creatures/ghost_06.wav` | 1.10 s | wav16 24k mono | 51 KB | ghost/wraith/shade vocal | oga-rpgpack (shade6.wav) |
| `sfx/creatures/ghost_07.wav` | 1.24 s | wav16 24k mono | 58 KB | ghost/wraith/shade vocal | oga-rpgpack (shade7.wav) |
| `sfx/creatures/ghost_08.wav` | 1.64 s | wav16 24k mono | 77 KB | ghost/wraith/shade vocal | oga-rpgpack (shade8.wav) |
| `sfx/creatures/giant_01.wav` | 0.65 s | wav16 24k mono | 30 KB | giant/boss vocal | oga-rpgpack (giant1.wav) |
| `sfx/creatures/giant_02.wav` | 0.93 s | wav16 24k mono | 43 KB | giant/boss vocal | oga-rpgpack (giant2.wav) |
| `sfx/creatures/giant_03.wav` | 0.63 s | wav16 24k mono | 29 KB | giant/boss vocal | oga-rpgpack (giant3.wav) |
| `sfx/creatures/giant_04.wav` | 0.54 s | wav16 24k mono | 25 KB | giant/boss vocal | oga-rpgpack (giant4.wav) |
| `sfx/creatures/giant_05.wav` | 0.71 s | wav16 24k mono | 33 KB | giant/boss vocal | oga-rpgpack (giant5.wav) |
| `sfx/creatures/grunt_01.ogg` | 0.93 s | ogg 48k st | 24 KB | monster grunt (attack) | oga-rubberduck-creature (grunt_01.ogg) |
| `sfx/creatures/grunt_02.ogg` | 0.53 s | ogg 48k st | 23 KB | monster grunt (attack) | oga-rubberduck-creature (grunt_02.ogg) |
| `sfx/creatures/grunt_03.ogg` | 0.67 s | ogg 48k st | 25 KB | monster grunt (attack) | oga-rubberduck-creature (grunt_03.ogg) |
| `sfx/creatures/grunt_04.ogg` | 0.61 s | ogg 48k st | 25 KB | monster grunt (attack) | oga-rubberduck-creature (grunt_04.ogg) |
| `sfx/creatures/grunt_05.ogg` | 0.65 s | ogg 48k st | 24 KB | monster grunt (attack) | oga-rubberduck-creature (grunt_05.ogg) |
| `sfx/creatures/howl_01.ogg` | 0.72 s | ogg 48k st | 25 KB | wolf howl (pack aggro) | oga-rubberduck-creature (howl.ogg) |
| `sfx/creatures/hurt_01.ogg` | 0.50 s | ogg 48k st | 24 KB | monster hurt | oga-rubberduck-creature (hurt_01.ogg) |
| `sfx/creatures/hurt_02.ogg` | 0.48 s | ogg 48k st | 21 KB | monster hurt | oga-rubberduck-creature (hurt_02.ogg) |
| `sfx/creatures/hurt_03.ogg` | 0.46 s | ogg 48k st | 24 KB | monster hurt | oga-rubberduck-creature (hurt_03.ogg) |
| `sfx/creatures/hurt_04.ogg` | 0.35 s | ogg 48k st | 14 KB | monster hurt | oga-rubberduck-creature (hurt_04.ogg) |
| `sfx/creatures/hurt_05.ogg` | 0.45 s | ogg 48k st | 19 KB | monster hurt | oga-rubberduck-creature (hurt_05.ogg) |
| `sfx/creatures/hurt_06.ogg` | 0.62 s | ogg 48k st | 17 KB | monster hurt | oga-rubberduck-rpg (creature_hurt_01.ogg) |
| `sfx/creatures/hurt_07.ogg` | 0.68 s | ogg 48k st | 20 KB | monster hurt | oga-rubberduck-rpg (creature_hurt_02.ogg) |
| `sfx/creatures/monster_01.ogg` | 1.00 s | ogg 48k st | 49 KB | monster aggro / attack vocal | oga-rubberduck-creature (monster_01.ogg) |
| `sfx/creatures/monster_02.ogg` | 0.58 s | ogg 48k st | 29 KB | monster aggro / attack vocal | oga-rubberduck-creature (monster_02.ogg) |
| `sfx/creatures/monster_03.ogg` | 0.78 s | ogg 48k st | 17 KB | monster aggro / attack vocal | oga-rubberduck-creature (monster_03.ogg) |
| `sfx/creatures/monster_04.ogg` | 1.28 s | ogg 48k st | 24 KB | monster aggro / attack vocal | oga-rubberduck-creature (monster_04.ogg) |
| `sfx/creatures/monster_05.ogg` | 0.43 s | ogg 48k st | 24 KB | monster aggro / attack vocal | oga-rubberduck-creature (monster_05.ogg) |
| `sfx/creatures/monster_06.ogg` | 0.83 s | ogg 48k st | 31 KB | monster aggro / attack vocal | oga-rubberduck-creature (monster_06.ogg) |
| `sfx/creatures/monster_07.ogg` | 1.13 s | ogg 48k st | 21 KB | monster aggro / attack vocal | oga-rubberduck-creature (monster_07.ogg) |
| `sfx/creatures/monster_08.ogg` | 0.26 s | ogg 48k st | 12 KB | monster aggro / attack vocal | oga-rubberduck-rpg (creature_monster_01.ogg) |
| `sfx/creatures/monster_09.ogg` | 0.24 s | ogg 48k st | 17 KB | monster aggro / attack vocal | oga-rubberduck-rpg (creature_monster_02.ogg) |
| `sfx/creatures/monster_10.ogg` | 0.99 s | ogg 48k st | 21 KB | monster aggro / attack vocal | oga-rubberduck-rpg (creature_monster_03.ogg) |
| `sfx/creatures/monster_11.ogg` | 0.72 s | ogg 48k st | 19 KB | monster aggro / attack vocal | oga-rubberduck-rpg (creature_monster_04.ogg) |
| `sfx/creatures/ogre_01.wav` | 0.40 s | wav16 24k mono | 19 KB | ogre/brute vocal | oga-rpgpack (ogre1.wav) |
| `sfx/creatures/ogre_02.wav` | 0.59 s | wav16 24k mono | 28 KB | ogre/brute vocal | oga-rpgpack (ogre2.wav) |
| `sfx/creatures/ogre_03.wav` | 0.58 s | wav16 24k mono | 27 KB | ogre/brute vocal | oga-rpgpack (ogre3.wav) |
| `sfx/creatures/ogre_04.wav` | 0.58 s | wav16 24k mono | 27 KB | ogre/brute vocal | oga-rpgpack (ogre4.wav) |
| `sfx/creatures/ogre_05.wav` | 0.34 s | wav16 24k mono | 16 KB | ogre/brute vocal | oga-rpgpack (ogre5.wav) |
| `sfx/creatures/roar_01.ogg` | 0.37 s | ogg 48k st | 15 KB | roar (elite/boss aggro) | oga-rubberduck-creature (roar_01.ogg) |
| `sfx/creatures/roar_02.ogg` | 0.90 s | ogg 48k st | 28 KB | roar (elite/boss aggro) | oga-rubberduck-creature (roar_02.ogg) |
| `sfx/creatures/roar_03.ogg` | 0.46 s | ogg 48k st | 24 KB | roar (elite/boss aggro) | oga-rubberduck-creature (roar_03.ogg) |
| `sfx/creatures/roar_04.ogg` | 0.64 s | ogg 48k st | 15 KB | roar (elite/boss aggro) | oga-rubberduck-rpg (creature_roar_01.ogg) |
| `sfx/creatures/roar_05.ogg` | 1.04 s | ogg 48k st | 22 KB | roar (elite/boss aggro) | oga-rubberduck-rpg (creature_roar_02.ogg) |
| `sfx/creatures/roar_06.ogg` | 1.16 s | ogg 48k st | 23 KB | roar (elite/boss aggro) | oga-rubberduck-rpg (creature_roar_03.ogg) |
| `sfx/creatures/scream_01.ogg` | 0.96 s | ogg 48k st | 38 KB | monster death scream | oga-rubberduck-creature (scream_01.ogg) |
| `sfx/creatures/scream_02.ogg` | 0.96 s | ogg 48k st | 36 KB | monster death scream | oga-rubberduck-creature (scream_02.ogg) |
| `sfx/creatures/slime_01.ogg` | 0.67 s | ogg 48k st | 35 KB | slime move/hit/death | oga-rubberduck-rpg (creature_slime_01.ogg) |
| `sfx/creatures/slime_02.ogg` | 0.74 s | ogg 48k st | 34 KB | slime move/hit/death | oga-rubberduck-rpg (creature_slime_02.ogg) |
| `sfx/creatures/slime_03.ogg` | 0.48 s | ogg 48k st | 27 KB | slime move/hit/death | oga-rubberduck-rpg (creature_slime_03.ogg) |
| `sfx/creatures/slime_04.ogg` | 0.62 s | ogg 48k st | 35 KB | slime move/hit/death | oga-rubberduck-rpg (creature_slime_04.ogg) |
| `sfx/creatures/slime_05.wav` | 0.28 s | wav16 22.05k mono | 12 KB | slime move/hit/death | oga-rpgpack (slime1.wav) |
| `sfx/creatures/slime_06.wav` | 0.32 s | wav16 22.05k mono | 14 KB | slime move/hit/death | oga-rpgpack (slime2.wav) |
| `sfx/creatures/slime_07.wav` | 0.25 s | wav16 22.05k mono | 11 KB | slime move/hit/death | oga-rpgpack (slime3.wav) |
| `sfx/creatures/slime_08.wav` | 0.28 s | wav16 22.05k mono | 12 KB | slime move/hit/death | oga-rpgpack (slime4.wav) |
| `sfx/creatures/spit_01.ogg` | 0.49 s | ogg 48k st | 28 KB | spit / acid projectile | oga-rubberduck-creature (spit_01.ogg) |
| `sfx/creatures/spit_02.ogg` | 0.69 s | ogg 48k st | 35 KB | spit / acid projectile | oga-rubberduck-creature (spit_02.ogg) |
| `sfx/creatures/spit_03.ogg` | 0.36 s | ogg 48k st | 18 KB | spit / acid projectile | oga-rubberduck-creature (spit_03.ogg) |
| `sfx/creatures/troll_01.ogg` | 0.57 s | ogg 48k st | 25 KB | troll/ogre vocal | oga-rubberduck-creature (troll_01.ogg) |
| `sfx/creatures/troll_02.ogg` | 0.79 s | ogg 48k st | 33 KB | troll/ogre vocal | oga-rubberduck-creature (troll_02.ogg) |
| `sfx/creatures/troll_03.ogg` | 0.42 s | ogg 48k st | 20 KB | troll/ogre vocal | oga-rubberduck-creature (troll_03.ogg) |
| `sfx/creatures/weird_01.ogg` | 0.60 s | ogg 48k st | 20 KB | demon/void creature vocal | oga-rubberduck-creature (weird_01.ogg) |
| `sfx/creatures/weird_02.ogg` | 0.46 s | ogg 48k st | 16 KB | demon/void creature vocal | oga-rubberduck-creature (weird_02.ogg) |
| `sfx/creatures/weird_03.ogg` | 0.39 s | ogg 48k st | 15 KB | demon/void creature vocal | oga-rubberduck-creature (weird_03.ogg) |
| `sfx/creatures/weird_04.ogg` | 0.30 s | ogg 48k st | 11 KB | demon/void creature vocal | oga-rubberduck-creature (weird_04.ogg) |
| `sfx/creatures/weird_05.ogg` | 0.67 s | ogg 48k st | 19 KB | demon/void creature vocal | oga-rubberduck-creature (weird_05.ogg) |
| `sfx/creatures/wolfman_01.wav` | 0.41 s | wav16 24k mono | 19 KB | werewolf vocal | oga-rpgpack (wolfman.wav) |

### sfx/footsteps/ (35 files, 0.26 MB)

| path | dur | format | size | intended use | src (original name) |
|---|---|---|---|---|---|
| `sfx/footsteps/carpet_01.ogg` | 0.14 s | ogg 44.1k st | 6 KB | footstep, carpet/rug (interiors) | kenney-impact (footstep_carpet_000.ogg) |
| `sfx/footsteps/carpet_02.ogg` | 0.14 s | ogg 44.1k st | 6 KB | footstep, carpet/rug (interiors) | kenney-impact (footstep_carpet_001.ogg) |
| `sfx/footsteps/carpet_03.ogg` | 0.14 s | ogg 44.1k st | 6 KB | footstep, carpet/rug (interiors) | kenney-impact (footstep_carpet_002.ogg) |
| `sfx/footsteps/carpet_04.ogg` | 0.14 s | ogg 44.1k st | 6 KB | footstep, carpet/rug (interiors) | kenney-impact (footstep_carpet_003.ogg) |
| `sfx/footsteps/carpet_05.ogg` | 0.14 s | ogg 44.1k st | 6 KB | footstep, carpet/rug (interiors) | kenney-impact (footstep_carpet_004.ogg) |
| `sfx/footsteps/dirt_01.ogg` | 0.25 s | ogg 48k st | 9 KB | footstep, dirt/gravel road (hub), also land | kenney-rpg (footstep00.ogg) |
| `sfx/footsteps/dirt_02.ogg` | 0.28 s | ogg 48k st | 10 KB | footstep, dirt/gravel road (hub), also land | kenney-rpg (footstep01.ogg) |
| `sfx/footsteps/dirt_03.ogg` | 0.24 s | ogg 48k st | 9 KB | footstep, dirt/gravel road (hub), also land | kenney-rpg (footstep02.ogg) |
| `sfx/footsteps/dirt_04.ogg` | 0.27 s | ogg 48k st | 10 KB | footstep, dirt/gravel road (hub), also land | kenney-rpg (footstep03.ogg) |
| `sfx/footsteps/dirt_05.ogg` | 0.32 s | ogg 48k st | 11 KB | footstep, dirt/gravel road (hub), also land | kenney-rpg (footstep04.ogg) |
| `sfx/footsteps/dirt_06.ogg` | 0.28 s | ogg 48k st | 10 KB | footstep, dirt/gravel road (hub), also land | kenney-rpg (footstep05.ogg) |
| `sfx/footsteps/dirt_07.ogg` | 0.24 s | ogg 48k st | 10 KB | footstep, dirt/gravel road (hub), also land | kenney-rpg (footstep06.ogg) |
| `sfx/footsteps/dirt_08.ogg` | 0.26 s | ogg 48k st | 10 KB | footstep, dirt/gravel road (hub), also land | kenney-rpg (footstep07.ogg) |
| `sfx/footsteps/dirt_09.ogg` | 0.26 s | ogg 48k st | 9 KB | footstep, dirt/gravel road (hub), also land | kenney-rpg (footstep08.ogg) |
| `sfx/footsteps/dirt_10.ogg` | 0.22 s | ogg 48k st | 9 KB | footstep, dirt/gravel road (hub), also land | kenney-rpg (footstep09.ogg) |
| `sfx/footsteps/grass_01.ogg` | 0.78 s | ogg 44.1k st | 8 KB | footstep, grass (hub outskirts) | kenney-impact (footstep_grass_000.ogg) |
| `sfx/footsteps/grass_02.ogg` | 0.67 s | ogg 44.1k st | 8 KB | footstep, grass (hub outskirts) | kenney-impact (footstep_grass_001.ogg) |
| `sfx/footsteps/grass_03.ogg` | 0.69 s | ogg 44.1k st | 8 KB | footstep, grass (hub outskirts) | kenney-impact (footstep_grass_002.ogg) |
| `sfx/footsteps/grass_04.ogg` | 0.67 s | ogg 44.1k st | 8 KB | footstep, grass (hub outskirts) | kenney-impact (footstep_grass_003.ogg) |
| `sfx/footsteps/grass_05.ogg` | 0.59 s | ogg 44.1k st | 8 KB | footstep, grass (hub outskirts) | kenney-impact (footstep_grass_004.ogg) |
| `sfx/footsteps/snow_01.ogg` | 0.37 s | ogg 44.1k st | 8 KB | footstep, snow (frost dungeon) | kenney-impact (footstep_snow_000.ogg) |
| `sfx/footsteps/snow_02.ogg` | 0.37 s | ogg 44.1k st | 8 KB | footstep, snow (frost dungeon) | kenney-impact (footstep_snow_001.ogg) |
| `sfx/footsteps/snow_03.ogg` | 0.37 s | ogg 44.1k st | 8 KB | footstep, snow (frost dungeon) | kenney-impact (footstep_snow_002.ogg) |
| `sfx/footsteps/snow_04.ogg` | 0.37 s | ogg 44.1k st | 8 KB | footstep, snow (frost dungeon) | kenney-impact (footstep_snow_003.ogg) |
| `sfx/footsteps/snow_05.ogg` | 0.37 s | ogg 44.1k st | 7 KB | footstep, snow (frost dungeon) | kenney-impact (footstep_snow_004.ogg) |
| `sfx/footsteps/stone_01.ogg` | 0.11 s | ogg 44.1k st | 6 KB | footstep, stone/dungeon floor | kenney-impact (footstep_concrete_000.ogg) |
| `sfx/footsteps/stone_02.ogg` | 0.11 s | ogg 44.1k st | 6 KB | footstep, stone/dungeon floor | kenney-impact (footstep_concrete_001.ogg) |
| `sfx/footsteps/stone_03.ogg` | 0.11 s | ogg 44.1k st | 6 KB | footstep, stone/dungeon floor | kenney-impact (footstep_concrete_002.ogg) |
| `sfx/footsteps/stone_04.ogg` | 0.11 s | ogg 44.1k st | 6 KB | footstep, stone/dungeon floor | kenney-impact (footstep_concrete_003.ogg) |
| `sfx/footsteps/stone_05.ogg` | 0.11 s | ogg 44.1k st | 6 KB | footstep, stone/dungeon floor | kenney-impact (footstep_concrete_004.ogg) |
| `sfx/footsteps/wood_01.ogg` | 0.25 s | ogg 44.1k st | 6 KB | footstep, wooden floor/bridge (inn, docks) | kenney-impact (footstep_wood_000.ogg) |
| `sfx/footsteps/wood_02.ogg` | 0.25 s | ogg 44.1k st | 6 KB | footstep, wooden floor/bridge (inn, docks) | kenney-impact (footstep_wood_001.ogg) |
| `sfx/footsteps/wood_03.ogg` | 0.25 s | ogg 44.1k st | 6 KB | footstep, wooden floor/bridge (inn, docks) | kenney-impact (footstep_wood_002.ogg) |
| `sfx/footsteps/wood_04.ogg` | 0.25 s | ogg 44.1k st | 6 KB | footstep, wooden floor/bridge (inn, docks) | kenney-impact (footstep_wood_003.ogg) |
| `sfx/footsteps/wood_05.ogg` | 0.25 s | ogg 44.1k st | 6 KB | footstep, wooden floor/bridge (inn, docks) | kenney-impact (footstep_wood_004.ogg) |

### sfx/jingles/ (51 files, 0.70 MB)

| path | dur | format | size | intended use | src (original name) |
|---|---|---|---|---|---|
| `sfx/jingles/hit_00.ogg` | 0.28 s | ogg 44.1k st | 8 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT00.ogg) |
| `sfx/jingles/hit_01.ogg` | 0.51 s | ogg 44.1k st | 11 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT01.ogg) |
| `sfx/jingles/hit_02.ogg` | 0.52 s | ogg 44.1k st | 11 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT02.ogg) |
| `sfx/jingles/hit_03.ogg` | 0.75 s | ogg 44.1k st | 14 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT03.ogg) |
| `sfx/jingles/hit_04.ogg` | 0.64 s | ogg 44.1k st | 11 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT04.ogg) |
| `sfx/jingles/hit_05.ogg` | 0.61 s | ogg 44.1k st | 14 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT05.ogg) |
| `sfx/jingles/hit_06.ogg` | 0.51 s | ogg 44.1k st | 12 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT06.ogg) |
| `sfx/jingles/hit_07.ogg` | 0.28 s | ogg 44.1k st | 9 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT07.ogg) |
| `sfx/jingles/hit_08.ogg` | 0.28 s | ogg 44.1k st | 8 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT08.ogg) |
| `sfx/jingles/hit_09.ogg` | 0.75 s | ogg 44.1k st | 15 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT09.ogg) |
| `sfx/jingles/hit_10.ogg` | 0.75 s | ogg 44.1k st | 15 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT10.ogg) |
| `sfx/jingles/hit_11.ogg` | 0.96 s | ogg 44.1k st | 18 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT11.ogg) |
| `sfx/jingles/hit_12.ogg` | 0.28 s | ogg 44.1k st | 8 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT12.ogg) |
| `sfx/jingles/hit_13.ogg` | 0.29 s | ogg 44.1k st | 8 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT13.ogg) |
| `sfx/jingles/hit_14.ogg` | 0.42 s | ogg 44.1k st | 10 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT14.ogg) |
| `sfx/jingles/hit_15.ogg` | 1.16 s | ogg 44.1k st | 19 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT15.ogg) |
| `sfx/jingles/hit_16.ogg` | 0.29 s | ogg 44.1k st | 8 KB | short jingle (Hit set) | kenney-jingles (jingles_HIT16.ogg) |
| `sfx/jingles/pizzi_00.ogg` | 0.49 s | ogg 44.1k st | 10 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI00.ogg) |
| `sfx/jingles/pizzi_01.ogg` | 1.00 s | ogg 44.1k st | 16 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI01.ogg) |
| `sfx/jingles/pizzi_02.ogg` | 0.96 s | ogg 44.1k st | 16 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI02.ogg) |
| `sfx/jingles/pizzi_03.ogg` | 1.15 s | ogg 44.1k st | 17 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI03.ogg) |
| `sfx/jingles/pizzi_04.ogg` | 0.56 s | ogg 44.1k st | 11 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI04.ogg) |
| `sfx/jingles/pizzi_05.ogg` | 0.54 s | ogg 44.1k st | 10 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI05.ogg) |
| `sfx/jingles/pizzi_06.ogg` | 0.69 s | ogg 44.1k st | 12 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI06.ogg) |
| `sfx/jingles/pizzi_07.ogg` | 1.32 s | ogg 44.1k st | 19 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI07.ogg) |
| `sfx/jingles/pizzi_08.ogg` | 0.57 s | ogg 44.1k st | 11 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI08.ogg) |
| `sfx/jingles/pizzi_09.ogg` | 0.57 s | ogg 44.1k st | 11 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI09.ogg) |
| `sfx/jingles/pizzi_10.ogg` | 0.80 s | ogg 44.1k st | 14 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI10.ogg) |
| `sfx/jingles/pizzi_11.ogg` | 0.79 s | ogg 44.1k st | 14 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI11.ogg) |
| `sfx/jingles/pizzi_12.ogg` | 0.99 s | ogg 44.1k st | 16 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI12.ogg) |
| `sfx/jingles/pizzi_13.ogg` | 0.88 s | ogg 44.1k st | 14 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI13.ogg) |
| `sfx/jingles/pizzi_14.ogg` | 0.92 s | ogg 44.1k st | 15 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI14.ogg) |
| `sfx/jingles/pizzi_15.ogg` | 0.81 s | ogg 44.1k st | 14 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI15.ogg) |
| `sfx/jingles/pizzi_16.ogg` | 0.46 s | ogg 44.1k st | 10 KB | short jingle (Pizzicato set) | kenney-jingles (jingles_PIZZI16.ogg) |
| `sfx/jingles/steel_00.ogg` | 0.93 s | ogg 44.1k st | 15 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL00.ogg) |
| `sfx/jingles/steel_01.ogg` | 1.38 s | ogg 44.1k st | 21 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL01.ogg) |
| `sfx/jingles/steel_02.ogg` | 1.39 s | ogg 44.1k st | 21 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL02.ogg) |
| `sfx/jingles/steel_03.ogg` | 1.39 s | ogg 44.1k st | 19 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL03.ogg) |
| `sfx/jingles/steel_04.ogg` | 0.91 s | ogg 44.1k st | 15 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL04.ogg) |
| `sfx/jingles/steel_05.ogg` | 0.94 s | ogg 44.1k st | 15 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL05.ogg) |
| `sfx/jingles/steel_06.ogg` | 1.38 s | ogg 44.1k st | 18 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL06.ogg) |
| `sfx/jingles/steel_07.ogg` | 1.55 s | ogg 44.1k st | 22 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL07.ogg) |
| `sfx/jingles/steel_08.ogg` | 0.80 s | ogg 44.1k st | 14 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL08.ogg) |
| `sfx/jingles/steel_09.ogg` | 0.59 s | ogg 44.1k st | 11 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL09.ogg) |
| `sfx/jingles/steel_10.ogg` | 0.91 s | ogg 44.1k st | 16 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL10.ogg) |
| `sfx/jingles/steel_11.ogg` | 0.83 s | ogg 44.1k st | 14 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL11.ogg) |
| `sfx/jingles/steel_12.ogg` | 1.26 s | ogg 44.1k st | 19 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL12.ogg) |
| `sfx/jingles/steel_13.ogg` | 1.05 s | ogg 44.1k st | 17 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL13.ogg) |
| `sfx/jingles/steel_14.ogg` | 1.38 s | ogg 44.1k st | 20 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL14.ogg) |
| `sfx/jingles/steel_15.ogg` | 0.94 s | ogg 44.1k st | 16 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL15.ogg) |
| `sfx/jingles/steel_16.ogg` | 0.91 s | ogg 44.1k st | 15 KB | short jingle (Steel drum/metal set) | kenney-jingles (jingles_STEEL16.ogg) |

### sfx/loot/ (52 files, 1.05 MB)

| path | dur | format | size | intended use | src (original name) |
|---|---|---|---|---|---|
| `sfx/loot/belt_handle_01.ogg` | 0.28 s | ogg 48k st | 11 KB | belt handle (unequip) | kenney-rpg (beltHandle1.ogg) |
| `sfx/loot/belt_handle_02.ogg` | 0.48 s | ogg 48k st | 15 KB | belt handle (unequip) | kenney-rpg (beltHandle2.ogg) |
| `sfx/loot/cloth_01.ogg` | 0.66 s | ogg 48k st | 16 KB | cloth armor pickup / jump rustle | kenney-rpg (cloth1.ogg) |
| `sfx/loot/cloth_02.ogg` | 0.42 s | ogg 48k st | 12 KB | cloth armor pickup / jump rustle | kenney-rpg (cloth2.ogg) |
| `sfx/loot/cloth_03.ogg` | 0.48 s | ogg 48k st | 12 KB | cloth armor pickup / jump rustle | kenney-rpg (cloth3.ogg) |
| `sfx/loot/cloth_04.ogg` | 0.38 s | ogg 48k st | 11 KB | cloth armor pickup / jump rustle | kenney-rpg (cloth4.ogg) |
| `sfx/loot/cloth_belt_01.ogg` | 0.72 s | ogg 48k st | 21 KB | belt / bag open | kenney-rpg (clothBelt.ogg) |
| `sfx/loot/cloth_belt_02.ogg` | 0.75 s | ogg 48k st | 20 KB | belt / bag open | kenney-rpg (clothBelt2.ogg) |
| `sfx/loot/coin_01.wav` | 0.60 s | wav16 24k mono | 28 KB | gold drop / pickup / vendor | oga-rpgpack (coin.wav) |
| `sfx/loot/coin_02.wav` | 1.00 s | wav16 24k mono | 47 KB | gold drop / pickup / vendor | oga-rpgpack (coin2.wav) |
| `sfx/loot/coin_03.wav` | 0.31 s | wav16 24k mono | 15 KB | gold drop / pickup / vendor | oga-rpgpack (coin3.wav) |
| `sfx/loot/coins_01.ogg` | 0.85 s | ogg 48k st | 25 KB | gold drop / pickup / vendor | kenney-rpg (handleCoins.ogg) |
| `sfx/loot/coins_02.ogg` | 0.34 s | ogg 48k st | 13 KB | gold drop / pickup / vendor | kenney-rpg (handleCoins2.ogg) |
| `sfx/loot/coins_03.ogg` | 0.41 s | ogg 48k st | 19 KB | gold drop / pickup / vendor | oga-rubberduck-rpg (item_coins_01.ogg) |
| `sfx/loot/coins_04.ogg` | 0.62 s | ogg 48k st | 31 KB | gold drop / pickup / vendor | oga-rubberduck-rpg (item_coins_02.ogg) |
| `sfx/loot/coins_05.ogg` | 0.48 s | ogg 48k st | 24 KB | gold drop / pickup / vendor | oga-rubberduck-rpg (item_coins_03.ogg) |
| `sfx/loot/coins_06.ogg` | 1.61 s | ogg 48k st | 69 KB | gold drop / pickup / vendor | oga-rubberduck-rpg (item_coins_04.ogg) |
| `sfx/loot/drop_leather_01.ogg` | 0.42 s | ogg 48k st | 11 KB | item hits ground / body fall | kenney-rpg (dropLeather.ogg) |
| `sfx/loot/equip_armor_light_01.wav` | 0.50 s | wav16 22.05k mono | 22 KB | equip armor | oga-rpgpack (armor-light.wav) |
| `sfx/loot/equip_chainmail_01.wav` | 0.58 s | wav16 22.05k mono | 25 KB | equip armor | oga-rpgpack (chainmail1.wav) |
| `sfx/loot/equip_chainmail_02.wav` | 0.75 s | wav16 22.05k mono | 32 KB | equip armor | oga-rpgpack (chainmail2.wav) |
| `sfx/loot/equip_cloth_01.wav` | 0.46 s | wav16 24k mono | 22 KB | equip armor | oga-rpgpack (cloth.wav) |
| `sfx/loot/equip_cloth_heavy_01.wav` | 0.41 s | wav16 22.05k mono | 18 KB | equip armor | oga-rpgpack (cloth-heavy.wav) |
| `sfx/loot/gem_01.ogg` | 0.25 s | ogg 48k st | 14 KB | gem / rare drop | oga-rubberduck-rpg (item_gem_01.ogg) |
| `sfx/loot/gem_02.ogg` | 0.20 s | ogg 48k st | 9 KB | gem / rare drop | oga-rubberduck-rpg (item_gem_02.ogg) |
| `sfx/loot/gem_03.ogg` | 0.29 s | ogg 48k st | 12 KB | gem / rare drop | oga-rubberduck-rpg (item_gem_03.ogg) |
| `sfx/loot/gem_04.ogg` | 0.59 s | ogg 48k st | 28 KB | gem / rare drop | oga-rubberduck-rpg (item_gem_04.ogg) |
| `sfx/loot/item_misc_01.ogg` | 0.41 s | ogg 48k st | 22 KB | generic item drop/pickup | oga-rubberduck-rpg (item_misc_01.ogg) |
| `sfx/loot/item_misc_02.ogg` | 0.44 s | ogg 48k st | 22 KB | generic item drop/pickup | oga-rubberduck-rpg (item_misc_02.ogg) |
| `sfx/loot/item_misc_03.ogg` | 0.34 s | ogg 48k st | 19 KB | generic item drop/pickup | oga-rubberduck-rpg (item_misc_03.ogg) |
| `sfx/loot/item_misc_04.ogg` | 0.38 s | ogg 48k st | 13 KB | generic item drop/pickup | oga-rubberduck-rpg (item_misc_04.ogg) |
| `sfx/loot/item_misc_05.ogg` | 0.39 s | ogg 48k st | 15 KB | generic item drop/pickup | oga-rubberduck-rpg (item_misc_05.ogg) |
| `sfx/loot/item_misc_06.ogg` | 0.72 s | ogg 48k st | 29 KB | generic item drop/pickup | oga-rubberduck-rpg (item_misc_06.ogg) |
| `sfx/loot/item_stone_01.ogg` | 0.73 s | ogg 48k st | 33 KB | stone/rune/efsun material | oga-rubberduck-rpg (item_stone_01.ogg) |
| `sfx/loot/item_stone_02.ogg` | 0.30 s | ogg 48k st | 15 KB | stone/rune/efsun material | oga-rubberduck-rpg (item_stone_02.ogg) |
| `sfx/loot/item_stone_03.ogg` | 0.39 s | ogg 48k st | 24 KB | stone/rune/efsun material | oga-rubberduck-rpg (item_stone_03.ogg) |
| `sfx/loot/item_stone_04.ogg` | 0.30 s | ogg 48k st | 17 KB | stone/rune/efsun material | oga-rubberduck-rpg (item_stone_04.ogg) |
| `sfx/loot/item_wood_01.ogg` | 0.54 s | ogg 48k st | 22 KB | wooden item / bone clatter proxy | oga-rubberduck-rpg (item_wood_01.ogg) |
| `sfx/loot/item_wood_02.ogg` | 0.26 s | ogg 48k st | 14 KB | wooden item / bone clatter proxy | oga-rubberduck-rpg (item_wood_02.ogg) |
| `sfx/loot/item_wood_03.ogg` | 0.33 s | ogg 48k st | 18 KB | wooden item / bone clatter proxy | oga-rubberduck-rpg (item_wood_03.ogg) |
| `sfx/loot/jewelry_01.wav` | 0.50 s | wav16 22.05k mono | 22 KB | ring/amulet pickup or equip | oga-rpgpack (beads.wav) |
| `sfx/loot/leather_01.ogg` | 0.34 s | ogg 48k st | 10 KB | leather handle (drag item) | kenney-rpg (handleSmallLeather.ogg) |
| `sfx/loot/leather_02.ogg` | 0.31 s | ogg 48k st | 10 KB | leather handle (drag item) | kenney-rpg (handleSmallLeather2.ogg) |
| `sfx/loot/metal_ringing_01.wav` | 0.52 s | wav16 24k mono | 24 KB | metal ring (upgrade success layer) | oga-rpgpack (metal-ringing.wav) |
| `sfx/loot/metal_small_01.wav` | 0.53 s | wav16 22.05k mono | 23 KB | weapon/metal item pickup | oga-rpgpack (metal-small1.wav) |
| `sfx/loot/metal_small_02.wav` | 0.33 s | wav16 24k mono | 16 KB | weapon/metal item pickup | oga-rpgpack (metal-small2.wav) |
| `sfx/loot/metal_small_03.wav` | 0.46 s | wav16 24k mono | 22 KB | weapon/metal item pickup | oga-rpgpack (metal-small3.wav) |
| `sfx/loot/potion_bottle_01.wav` | 0.48 s | wav16 22.05k mono | 21 KB | potion pickup / uncork | oga-rpgpack (bottle.wav) |
| `sfx/loot/potion_drink_01.wav` | 0.46 s | wav16 22.05k mono | 20 KB | potion drink | oga-rpgpack (bubble.wav) |
| `sfx/loot/potion_drink_02.wav` | 0.44 s | wav16 22.05k mono | 19 KB | potion drink | oga-rpgpack (bubble2.wav) |
| `sfx/loot/potion_drink_03.wav` | 0.73 s | wav16 22.05k mono | 31 KB | potion drink | oga-rpgpack (bubble3.wav) |
| `sfx/loot/wood_small_01.wav` | 0.31 s | wav16 22.05k mono | 14 KB | wooden item pickup | oga-rpgpack (wood-small.wav) |

### sfx/magic/ (35 files, 1.66 MB)

| path | dur | format | size | intended use | src (original name) |
|---|---|---|---|---|---|
| `sfx/magic/absorb_01.ogg` | 4.00 s | ogg 44.1k st | 69 KB | life leech / absorb / portal swirl | oga-leohpaz-buffs (39_absorb_04.ogg) |
| `sfx/magic/arcane_01.ogg` | 1.61 s | ogg 44.1k st | 58 KB | generic arcane cast / blink / efsun reroll (levels vary a lot) | oga-jaggedstone-magic (magical_1.ogg) |
| `sfx/magic/arcane_02.ogg` | 1.38 s | ogg 44.1k st | 39 KB | generic arcane cast / blink / efsun reroll (levels vary a lot) | oga-jaggedstone-magic (magical_2.ogg) |
| `sfx/magic/arcane_03.ogg` | 1.82 s | ogg 44.1k st | 37 KB | generic arcane cast / blink / efsun reroll (levels vary a lot) | oga-jaggedstone-magic (magical_3.ogg) |
| `sfx/magic/arcane_04.ogg` | 2.41 s | ogg 44.1k st | 77 KB | generic arcane cast / blink / efsun reroll (levels vary a lot) | oga-jaggedstone-magic (magical_4.ogg) |
| `sfx/magic/arcane_05.ogg` | 1.44 s | ogg 44.1k st | 37 KB | generic arcane cast / blink / efsun reroll (levels vary a lot) | oga-jaggedstone-magic (magical_5.ogg) |
| `sfx/magic/arcane_06.ogg` | 1.11 s | ogg 44.1k st | 37 KB | generic arcane cast / blink / efsun reroll (levels vary a lot) | oga-jaggedstone-magic (magical_6.ogg) |
| `sfx/magic/arcane_07.ogg` | 1.54 s | ogg 44.1k st | 75 KB | generic arcane cast / blink / efsun reroll (levels vary a lot) | oga-jaggedstone-magic (magical_7.ogg) |
| `sfx/magic/buff_attack_01.ogg` | 3.33 s | ogg 44.1k st | 44 KB | attack buff / war cry | oga-leohpaz-buffs (16_atk_buff_04.ogg) |
| `sfx/magic/buff_defense_01.ogg` | 4.00 s | ogg 44.1k st | 59 KB | defense buff / shield | oga-leohpaz-buffs (17_def_buff_01.ogg) |
| `sfx/magic/cast_01.wav` | 0.88 s | wav16 22.05k mono | 38 KB | spell cast | oga-rpgpack (magic1.wav) |
| `sfx/magic/cast_long_01.wav` | 3.25 s | wav16 22.05k mono | 140 KB | long spell cast (3.3 s) | oga-rpgpack (spell.wav) |
| `sfx/magic/charge_01.ogg` | 5.33 s | ogg 44.1k st | 74 KB | channel / wind-up / boss cast (5.3 s) | oga-leohpaz-magic (45_charge_05.ogg) |
| `sfx/magic/debuff_01.ogg` | 3.33 s | ogg 44.1k st | 28 KB | debuff / curse / shadow cast | oga-leohpaz-buffs (21_debuff_01.ogg) |
| `sfx/magic/earth_01.ogg` | 2.67 s | ogg 44.1k st | 32 KB | earth slam / ground slam | oga-leohpaz-magic (30_earth_02.ogg) |
| `sfx/magic/fire_01.ogg` | 1.06 s | ogg 48k st | 39 KB | fire cast whoosh (quiet, gain ~1.8) | oga-rubberduck-rpg (spell_fire_01.ogg) |
| `sfx/magic/fire_02.ogg` | 1.07 s | ogg 48k st | 32 KB | fire cast whoosh (quiet, gain ~1.8) | oga-rubberduck-rpg (spell_fire_02.ogg) |
| `sfx/magic/fire_03.ogg` | 1.93 s | ogg 48k st | 70 KB | fire cast whoosh (quiet, gain ~1.8) | oga-rubberduck-rpg (spell_fire_03.ogg) |
| `sfx/magic/fire_04.ogg` | 1.59 s | ogg 48k st | 58 KB | fire cast whoosh (quiet, gain ~1.8) | oga-rubberduck-rpg (spell_fire_04.ogg) |
| `sfx/magic/fire_05.ogg` | 1.24 s | ogg 48k st | 53 KB | fire cast whoosh (quiet, gain ~1.8) | oga-rubberduck-rpg (spell_fire_05.ogg) |
| `sfx/magic/fire_06.ogg` | 1.00 s | ogg 48k st | 52 KB | fire cast whoosh (quiet, gain ~1.8) | oga-rubberduck-rpg (spell_fire_06.ogg) |
| `sfx/magic/fire_07.ogg` | 0.65 s | ogg 48k st | 24 KB | fire cast whoosh (quiet, gain ~1.8) | oga-rubberduck-rpg (spell_fire_07.ogg) |
| `sfx/magic/fire_explosion_01.ogg` | 2.00 s | ogg 44.1k st | 22 KB | fire impact / explosion | oga-leohpaz-magic (04_fire_explosion_04_medium.ogg) |
| `sfx/magic/heal_01.ogg` | 2.00 s | ogg 44.1k st | 38 KB | heal | oga-leohpaz-buffs (02_heal_02.ogg) |
| `sfx/magic/ice_explosion_01.ogg` | 2.67 s | ogg 44.1k st | 41 KB | frost impact / frost nova | oga-leohpaz-magic (13_ice_explosion_01.ogg) |
| `sfx/magic/poison_01.ogg` | 2.00 s | ogg 44.1k st | 12 KB | poison impact | oga-leohpaz-magic (46_poison_01.ogg) |
| `sfx/magic/revive_01.ogg` | 6.67 s | ogg 44.1k st | 133 KB | revive / level-up sparkle tail (6.7 s) | oga-leohpaz-buffs (30_revive_03.ogg) |
| `sfx/magic/shimmer_01.mp3` | 0.71 s | mp3 44.1k mono | 6 KB | sparkle layer (epic/legendary drop, efsun reveal) | oga-qubodup-shimmer (shimmer_1.flac_.mp3) |
| `sfx/magic/sleep_01.ogg` | 3.33 s | ogg 44.1k st | 34 KB | stun / sleep / slow | oga-leohpaz-buffs (44_sleep_01.ogg) |
| `sfx/magic/speed_up_01.ogg` | 4.00 s | ogg 44.1k st | 74 KB | haste / speed buff | oga-leohpaz-buffs (48_speed_up_02.ogg) |
| `sfx/magic/spell_01.ogg` | 0.63 s | ogg 48k st | 28 KB | generic spell cast (short) | oga-rubberduck-rpg (spell_01.ogg) |
| `sfx/magic/spell_02.ogg` | 0.55 s | ogg 48k st | 25 KB | generic spell cast (short) | oga-rubberduck-rpg (spell_02.ogg) |
| `sfx/magic/thunder_01.ogg` | 2.67 s | ogg 44.1k st | 58 KB | lightning impact | oga-leohpaz-magic (18_thunder_02.ogg) |
| `sfx/magic/water_01.ogg` | 2.67 s | ogg 44.1k st | 39 KB | water / frost wave spell | oga-leohpaz-magic (22_water_02.ogg) |
| `sfx/magic/wind_01.ogg` | 2.00 s | ogg 44.1k st | 16 KB | wind / whirlwind / frost cast | oga-leohpaz-magic (25_wind_01.ogg) |

### sfx/melee/ (103 files, 1.10 MB)

| path | dur | format | size | intended use | src (original name) |
|---|---|---|---|---|---|
| `sfx/melee/blade_01.ogg` | 0.29 s | ogg 48k st | 15 KB | blade swipe (heavy swing) | oga-rubberduck-rpg (blade_01.ogg) |
| `sfx/melee/blade_02.ogg` | 0.31 s | ogg 48k st | 17 KB | blade swipe (heavy swing) | oga-rubberduck-rpg (blade_02.ogg) |
| `sfx/melee/blade_03.ogg` | 0.40 s | ogg 48k st | 15 KB | blade swipe (heavy swing) | oga-rubberduck-rpg (blade_03.ogg) |
| `sfx/melee/chop_01.ogg` | 0.24 s | ogg 48k st | 9 KB | axe chop hit | kenney-rpg (chop.ogg) |
| `sfx/melee/draw_knife_01.ogg` | 0.40 s | ogg 48k st | 11 KB | dagger draw (very quiet) | kenney-rpg (drawKnife1.ogg) |
| `sfx/melee/draw_knife_02.ogg` | 0.45 s | ogg 48k st | 12 KB | dagger draw (very quiet) | kenney-rpg (drawKnife2.ogg) |
| `sfx/melee/draw_knife_03.ogg` | 0.48 s | ogg 48k st | 12 KB | dagger draw (very quiet) | kenney-rpg (drawKnife3.ogg) |
| `sfx/melee/hit_blunt_01.wav` | 0.61 s | wav16 22.05k mono | 26 KB | generic blunt melee hit | oga-remaxim (melee sound.wav) |
| `sfx/melee/hit_claw_01.wav` | 0.63 s | wav16 22.05k mono | 27 KB | animal claw/bite hit on player | oga-remaxim (animal melee sound.wav) |
| `sfx/melee/hit_flesh_heavy_01.ogg` | 0.65 s | ogg 44.1k st | 11 KB | melee hit on flesh (punchy) | kenney-impact (impactPunch_heavy_000.ogg) |
| `sfx/melee/hit_flesh_heavy_02.ogg` | 0.54 s | ogg 44.1k st | 11 KB | melee hit on flesh (punchy) | kenney-impact (impactPunch_heavy_001.ogg) |
| `sfx/melee/hit_flesh_heavy_03.ogg` | 0.46 s | ogg 44.1k st | 9 KB | melee hit on flesh (punchy) | kenney-impact (impactPunch_heavy_002.ogg) |
| `sfx/melee/hit_flesh_heavy_04.ogg` | 0.47 s | ogg 44.1k st | 10 KB | melee hit on flesh (punchy) | kenney-impact (impactPunch_heavy_003.ogg) |
| `sfx/melee/hit_flesh_heavy_05.ogg` | 0.54 s | ogg 44.1k st | 10 KB | melee hit on flesh (punchy) | kenney-impact (impactPunch_heavy_004.ogg) |
| `sfx/melee/hit_flesh_medium_01.ogg` | 0.43 s | ogg 44.1k st | 9 KB | melee hit on flesh (punchy) | kenney-impact (impactPunch_medium_000.ogg) |
| `sfx/melee/hit_flesh_medium_02.ogg` | 0.40 s | ogg 44.1k st | 8 KB | melee hit on flesh (punchy) | kenney-impact (impactPunch_medium_001.ogg) |
| `sfx/melee/hit_flesh_medium_03.ogg` | 0.54 s | ogg 44.1k st | 10 KB | melee hit on flesh (punchy) | kenney-impact (impactPunch_medium_002.ogg) |
| `sfx/melee/hit_flesh_medium_04.ogg` | 0.46 s | ogg 44.1k st | 9 KB | melee hit on flesh (punchy) | kenney-impact (impactPunch_medium_003.ogg) |
| `sfx/melee/hit_flesh_medium_05.ogg` | 0.54 s | ogg 44.1k st | 10 KB | melee hit on flesh (punchy) | kenney-impact (impactPunch_medium_004.ogg) |
| `sfx/melee/hit_metal_heavy_01.ogg` | 0.17 s | ogg 44.1k st | 6 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_heavy_000.ogg) |
| `sfx/melee/hit_metal_heavy_02.ogg` | 0.36 s | ogg 44.1k st | 7 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_heavy_001.ogg) |
| `sfx/melee/hit_metal_heavy_03.ogg` | 0.12 s | ogg 44.1k st | 6 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_heavy_002.ogg) |
| `sfx/melee/hit_metal_heavy_04.ogg` | 0.21 s | ogg 44.1k st | 6 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_heavy_003.ogg) |
| `sfx/melee/hit_metal_heavy_05.ogg` | 0.13 s | ogg 44.1k st | 6 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_heavy_004.ogg) |
| `sfx/melee/hit_metal_light_01.ogg` | 0.35 s | ogg 44.1k st | 7 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_light_000.ogg) |
| `sfx/melee/hit_metal_light_02.ogg` | 0.25 s | ogg 44.1k st | 7 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_light_001.ogg) |
| `sfx/melee/hit_metal_light_03.ogg` | 0.24 s | ogg 44.1k st | 7 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_light_002.ogg) |
| `sfx/melee/hit_metal_light_04.ogg` | 0.48 s | ogg 44.1k st | 9 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_light_003.ogg) |
| `sfx/melee/hit_metal_light_05.ogg` | 0.21 s | ogg 44.1k st | 7 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_light_004.ogg) |
| `sfx/melee/hit_metal_medium_01.ogg` | 0.27 s | ogg 44.1k st | 7 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_medium_000.ogg) |
| `sfx/melee/hit_metal_medium_02.ogg` | 0.14 s | ogg 44.1k st | 6 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_medium_001.ogg) |
| `sfx/melee/hit_metal_medium_03.ogg` | 0.12 s | ogg 44.1k st | 6 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_medium_002.ogg) |
| `sfx/melee/hit_metal_medium_04.ogg` | 0.25 s | ogg 44.1k st | 7 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_medium_003.ogg) |
| `sfx/melee/hit_metal_medium_05.ogg` | 0.11 s | ogg 44.1k st | 6 KB | metal impact (armored target, crit layer, block) | kenney-impact (impactMetal_medium_004.ogg) |
| `sfx/melee/hit_plate_heavy_01.ogg` | 0.49 s | ogg 44.1k st | 10 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_heavy_000.ogg) |
| `sfx/melee/hit_plate_heavy_02.ogg` | 0.35 s | ogg 44.1k st | 9 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_heavy_001.ogg) |
| `sfx/melee/hit_plate_heavy_03.ogg` | 0.49 s | ogg 44.1k st | 10 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_heavy_002.ogg) |
| `sfx/melee/hit_plate_heavy_04.ogg` | 0.35 s | ogg 44.1k st | 8 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_heavy_003.ogg) |
| `sfx/melee/hit_plate_heavy_05.ogg` | 0.56 s | ogg 44.1k st | 11 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_heavy_004.ogg) |
| `sfx/melee/hit_plate_light_01.ogg` | 0.54 s | ogg 44.1k st | 10 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_light_000.ogg) |
| `sfx/melee/hit_plate_light_02.ogg` | 0.65 s | ogg 44.1k st | 11 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_light_001.ogg) |
| `sfx/melee/hit_plate_light_03.ogg` | 0.49 s | ogg 44.1k st | 10 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_light_002.ogg) |
| `sfx/melee/hit_plate_light_04.ogg` | 0.53 s | ogg 44.1k st | 10 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_light_003.ogg) |
| `sfx/melee/hit_plate_light_05.ogg` | 0.66 s | ogg 44.1k st | 12 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_light_004.ogg) |
| `sfx/melee/hit_plate_medium_01.ogg` | 0.61 s | ogg 44.1k st | 11 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_medium_000.ogg) |
| `sfx/melee/hit_plate_medium_02.ogg` | 0.62 s | ogg 44.1k st | 11 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_medium_001.ogg) |
| `sfx/melee/hit_plate_medium_03.ogg` | 0.52 s | ogg 44.1k st | 10 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_medium_002.ogg) |
| `sfx/melee/hit_plate_medium_04.ogg` | 0.65 s | ogg 44.1k st | 11 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_medium_003.ogg) |
| `sfx/melee/hit_plate_medium_05.ogg` | 0.53 s | ogg 44.1k st | 11 KB | plate armor hit (skeleton knights, golems) | kenney-impact (impactPlate_medium_004.ogg) |
| `sfx/melee/hit_soft_heavy_01.ogg` | 0.51 s | ogg 44.1k st | 6 KB | heavy blunt hit / player hurt | kenney-impact (impactSoft_heavy_000.ogg) |
| `sfx/melee/hit_soft_heavy_02.ogg` | 0.57 s | ogg 44.1k st | 7 KB | heavy blunt hit / player hurt | kenney-impact (impactSoft_heavy_001.ogg) |
| `sfx/melee/hit_soft_heavy_03.ogg` | 0.57 s | ogg 44.1k st | 7 KB | heavy blunt hit / player hurt | kenney-impact (impactSoft_heavy_002.ogg) |
| `sfx/melee/hit_soft_heavy_04.ogg` | 0.54 s | ogg 44.1k st | 7 KB | heavy blunt hit / player hurt | kenney-impact (impactSoft_heavy_003.ogg) |
| `sfx/melee/hit_soft_heavy_05.ogg` | 0.50 s | ogg 44.1k st | 6 KB | heavy blunt hit / player hurt | kenney-impact (impactSoft_heavy_004.ogg) |
| `sfx/melee/hit_soft_medium_01.ogg` | 0.12 s | ogg 44.1k st | 5 KB | short soft hit / player hurt | kenney-impact (impactSoft_medium_000.ogg) |
| `sfx/melee/hit_soft_medium_02.ogg` | 0.18 s | ogg 44.1k st | 5 KB | short soft hit / player hurt | kenney-impact (impactSoft_medium_001.ogg) |
| `sfx/melee/hit_soft_medium_03.ogg` | 0.14 s | ogg 44.1k st | 5 KB | short soft hit / player hurt | kenney-impact (impactSoft_medium_002.ogg) |
| `sfx/melee/hit_soft_medium_04.ogg` | 0.14 s | ogg 44.1k st | 5 KB | short soft hit / player hurt | kenney-impact (impactSoft_medium_003.ogg) |
| `sfx/melee/hit_soft_medium_05.ogg` | 0.15 s | ogg 44.1k st | 5 KB | short soft hit / player hurt | kenney-impact (impactSoft_medium_004.ogg) |
| `sfx/melee/hit_sword_01.wav` | 0.54 s | wav16 22.05k mono | 23 KB | generic sword hit | oga-remaxim (sword sound.wav) |
| `sfx/melee/slice_01.ogg` | 0.60 s | ogg 48k st | 15 KB | slice layer for crits / bleed | kenney-rpg (knifeSlice.ogg) |
| `sfx/melee/slice_02.ogg` | 0.57 s | ogg 48k st | 15 KB | slice layer for crits / bleed | kenney-rpg (knifeSlice2.ogg) |
| `sfx/melee/swing_01.wav` | 0.23 s | wav16 22.05k mono | 10 KB | weapon swing (medium) | oga-rpgpack (swing.wav) |
| `sfx/melee/swing_02.wav` | 0.15 s | wav16 22.05k mono | 6 KB | weapon swing (medium) | oga-rpgpack (swing2.wav) |
| `sfx/melee/swing_03.wav` | 0.14 s | wav16 22.05k mono | 6 KB | weapon swing (medium) | oga-rpgpack (swing3.wav) |
| `sfx/melee/swish_01.wav` | 0.13 s | wav16 22.05k mono | 5 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-1.wav) |
| `sfx/melee/swish_02.wav` | 0.10 s | wav16 22.05k mono | 4 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-2.wav) |
| `sfx/melee/swish_03.wav` | 0.15 s | wav16 22.05k mono | 6 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-3.wav) |
| `sfx/melee/swish_04.wav` | 0.15 s | wav16 22.05k mono | 6 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-4.wav) |
| `sfx/melee/swish_05.wav` | 0.13 s | wav16 22.05k mono | 6 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-5.wav) |
| `sfx/melee/swish_06.wav` | 0.14 s | wav16 22.05k mono | 6 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-6.wav) |
| `sfx/melee/swish_07.wav` | 0.19 s | wav16 22.05k mono | 8 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-7.wav) |
| `sfx/melee/swish_08.wav` | 0.15 s | wav16 22.05k mono | 7 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-8.wav) |
| `sfx/melee/swish_09.wav` | 0.20 s | wav16 22.05k mono | 9 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-9.wav) |
| `sfx/melee/swish_10.wav` | 0.12 s | wav16 22.05k mono | 5 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-10.wav) |
| `sfx/melee/swish_11.wav` | 0.10 s | wav16 22.05k mono | 5 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-11.wav) |
| `sfx/melee/swish_12.wav` | 0.08 s | wav16 22.05k mono | 3 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-12.wav) |
| `sfx/melee/swish_13.wav` | 0.07 s | wav16 22.05k mono | 3 KB | fast light swing whoosh (basic attack, dodge, thrown dagger) | oga-swishes (swish-13.wav) |
| `sfx/melee/sword_attack_01.ogg` | 0.97 s | ogg 44.1k st | 17 KB | sword slash with metallic ring (HOT: peaks > 0 dBFS, keep gain <= 0.45) | oga-starninjas (sword.1.ogg) |
| `sfx/melee/sword_attack_02.ogg` | 1.08 s | ogg 44.1k st | 19 KB | sword slash with metallic ring (HOT: peaks > 0 dBFS, keep gain <= 0.45) | oga-starninjas (sword.2.ogg) |
| `sfx/melee/sword_attack_03.ogg` | 0.62 s | ogg 44.1k st | 13 KB | sword slash with metallic ring (HOT: peaks > 0 dBFS, keep gain <= 0.45) | oga-starninjas (sword.3.ogg) |
| `sfx/melee/sword_attack_04.ogg` | 0.58 s | ogg 44.1k st | 13 KB | sword slash with metallic ring (HOT: peaks > 0 dBFS, keep gain <= 0.45) | oga-starninjas (sword.4.ogg) |
| `sfx/melee/sword_attack_05.ogg` | 1.06 s | ogg 44.1k st | 18 KB | sword slash with metallic ring (HOT: peaks > 0 dBFS, keep gain <= 0.45) | oga-starninjas (sword.5.ogg) |
| `sfx/melee/sword_attack_06.ogg` | 0.54 s | ogg 44.1k st | 11 KB | sword slash with metallic ring (HOT: peaks > 0 dBFS, keep gain <= 0.45) | oga-starninjas (sword.6.ogg) |
| `sfx/melee/sword_attack_07.ogg` | 0.77 s | ogg 44.1k st | 13 KB | sword slash with metallic ring (HOT: peaks > 0 dBFS, keep gain <= 0.45) | oga-starninjas (sword.7.ogg) |
| `sfx/melee/sword_attack_08.ogg` | 0.96 s | ogg 44.1k st | 15 KB | sword slash with metallic ring (HOT: peaks > 0 dBFS, keep gain <= 0.45) | oga-starninjas (sword.8.ogg) |
| `sfx/melee/sword_attack_09.ogg` | 1.38 s | ogg 44.1k st | 23 KB | sword slash with metallic ring (HOT: peaks > 0 dBFS, keep gain <= 0.45) | oga-starninjas (sword.9.ogg) |
| `sfx/melee/sword_attack_10.ogg` | 1.14 s | ogg 44.1k st | 18 KB | sword slash with metallic ring (HOT: peaks > 0 dBFS, keep gain <= 0.45) | oga-starninjas (sword.10.ogg) |
| `sfx/melee/sword_clash_01.ogg` | 1.03 s | ogg 44.1k st | 16 KB | sword clash / shield block / parry (HOT: keep gain <= 0.4) | oga-starninjas (sword_clash.1.ogg) |
| `sfx/melee/sword_clash_02.ogg` | 0.80 s | ogg 44.1k st | 14 KB | sword clash / shield block / parry (HOT: keep gain <= 0.4) | oga-starninjas (sword_clash.2.ogg) |
| `sfx/melee/sword_clash_03.ogg` | 0.93 s | ogg 44.1k st | 15 KB | sword clash / shield block / parry (HOT: keep gain <= 0.4) | oga-starninjas (sword_clash.3.ogg) |
| `sfx/melee/sword_clash_04.ogg` | 0.92 s | ogg 44.1k st | 15 KB | sword clash / shield block / parry (HOT: keep gain <= 0.4) | oga-starninjas (sword_clash.4.ogg) |
| `sfx/melee/sword_clash_05.ogg` | 0.66 s | ogg 44.1k st | 12 KB | sword clash / shield block / parry (HOT: keep gain <= 0.4) | oga-starninjas (sword_clash.5.ogg) |
| `sfx/melee/sword_clash_06.ogg` | 1.32 s | ogg 44.1k st | 20 KB | sword clash / shield block / parry (HOT: keep gain <= 0.4) | oga-starninjas (sword_clash.6.ogg) |
| `sfx/melee/sword_clash_07.ogg` | 1.17 s | ogg 44.1k st | 18 KB | sword clash / shield block / parry (HOT: keep gain <= 0.4) | oga-starninjas (sword_clash.7.ogg) |
| `sfx/melee/sword_clash_08.ogg` | 1.02 s | ogg 44.1k st | 16 KB | sword clash / shield block / parry (HOT: keep gain <= 0.4) | oga-starninjas (sword_clash.8.ogg) |
| `sfx/melee/sword_clash_09.ogg` | 1.09 s | ogg 44.1k st | 17 KB | sword clash / shield block / parry (HOT: keep gain <= 0.4) | oga-starninjas (sword_clash.9.ogg) |
| `sfx/melee/sword_clash_10.ogg` | 0.85 s | ogg 44.1k st | 14 KB | sword clash / shield block / parry (HOT: keep gain <= 0.4) | oga-starninjas (sword_clash.10.ogg) |
| `sfx/melee/unsheathe_01.wav` | 0.54 s | wav16 24k mono | 25 KB | weapon draw / equip weapon / combat enter | oga-rpgpack (sword-unsheathe.wav) |
| `sfx/melee/unsheathe_02.wav` | 0.37 s | wav16 24k mono | 17 KB | weapon draw / equip weapon / combat enter | oga-rpgpack (sword-unsheathe2.wav) |
| `sfx/melee/unsheathe_03.wav` | 0.51 s | wav16 24k mono | 24 KB | weapon draw / equip weapon / combat enter | oga-rpgpack (sword-unsheathe3.wav) |
| `sfx/melee/unsheathe_04.wav` | 0.48 s | wav16 24k mono | 23 KB | weapon draw / equip weapon / combat enter | oga-rpgpack (sword-unsheathe4.wav) |
| `sfx/melee/unsheathe_05.wav` | 0.42 s | wav16 24k mono | 20 KB | weapon draw / equip weapon / combat enter | oga-rpgpack (sword-unsheathe5.wav) |

### sfx/progression/ (13 files, 1.65 MB)

| path | dur | format | size | intended use | src (original name) |
|---|---|---|---|---|---|
| `sfx/progression/alarm_01.wav` | 7.62 s | wav16 22.05k mono | 328 KB | alarm loop (7.6 s; M+ timer critical, optional) | oga-wobbleboxx (Alarm.aif) |
| `sfx/progression/coin_get_01.wav` | 2.55 s | wav16 22.05k mono | 110 KB | reward coin get (vault, quest reward) | oga-wobbleboxx (Coin01.aif) |
| `sfx/progression/downer_01.wav` | 1.67 s | wav16 22.05k mono | 72 KB | power down / upgrade fail alt | oga-wobbleboxx (Downer01.aif) |
| `sfx/progression/fx_01.wav` | 2.38 s | wav16 22.05k mono | 103 KB | misc magical fx | oga-wobbleboxx (FX01.aif) |
| `sfx/progression/fx_02.wav` | 4.68 s | wav16 22.05k mono | 202 KB | misc magical fx | oga-wobbleboxx (FX02.aif) |
| `sfx/progression/rise_01.wav` | 1.76 s | wav16 22.05k mono | 76 KB | rising power-up (level up / skill unlock alt) | oga-wobbleboxx (Rise01.aif) |
| `sfx/progression/rise_02.wav` | 1.60 s | wav16 22.05k mono | 69 KB | rising power-up (level up / skill unlock alt) | oga-wobbleboxx (Rise02.aif) |
| `sfx/progression/rise_03.wav` | 1.56 s | wav16 22.05k mono | 67 KB | rising power-up (level up / skill unlock alt) | oga-wobbleboxx (Rise03.aif) |
| `sfx/progression/rise_04.wav` | 3.40 s | wav16 22.05k mono | 147 KB | rising power-up (level up / skill unlock alt) | oga-wobbleboxx (Rise04.aif) |
| `sfx/progression/rise_05.wav` | 3.53 s | wav16 22.05k mono | 152 KB | rising power-up (level up / skill unlock alt) | oga-wobbleboxx (Rise05.aif) |
| `sfx/progression/rise_06.wav` | 2.58 s | wav16 22.05k mono | 111 KB | rising power-up (level up / skill unlock alt) | oga-wobbleboxx (Rise06.aif) |
| `sfx/progression/rise_07.wav` | 2.50 s | wav16 22.05k mono | 108 KB | rising power-up (level up / skill unlock alt) | oga-wobbleboxx (Rise07.aif) |
| `sfx/progression/upper_01.wav` | 3.44 s | wav16 22.05k mono | 148 KB | power up / skill unlock | oga-wobbleboxx (Upper01.aif) |

### sfx/ui/ (127 files, 1.31 MB)

| path | dur | format | size | intended use | src (original name) |
|---|---|---|---|---|---|
| `sfx/ui/back_01.ogg` | 0.06 s | ogg 44.1k mono | 7 KB | UI back/cancel | kenney-interface (back_001.ogg) |
| `sfx/ui/back_02.ogg` | 0.07 s | ogg 44.1k mono | 7 KB | UI back/cancel | kenney-interface (back_002.ogg) |
| `sfx/ui/back_03.ogg` | 0.09 s | ogg 44.1k mono | 7 KB | UI back/cancel | kenney-interface (back_003.ogg) |
| `sfx/ui/back_04.ogg` | 0.07 s | ogg 44.1k mono | 7 KB | UI back/cancel | kenney-interface (back_004.ogg) |
| `sfx/ui/bong_01.ogg` | 0.12 s | ogg 44.1k mono | 5 KB | notification bong | kenney-interface (bong_001.ogg) |
| `sfx/ui/book_01.ogg` | 0.72 s | ogg 48k st | 33 KB | book/page handling | oga-rubberduck-rpg (book_01.ogg) |
| `sfx/ui/book_02.ogg` | 0.88 s | ogg 48k st | 36 KB | book/page handling | oga-rubberduck-rpg (book_02.ogg) |
| `sfx/ui/book_03.ogg` | 1.22 s | ogg 48k st | 59 KB | book/page handling | oga-rubberduck-rpg (book_03.ogg) |
| `sfx/ui/book_04.ogg` | 1.15 s | ogg 48k st | 43 KB | book/page handling | oga-rubberduck-rpg (book_04.ogg) |
| `sfx/ui/book_close_01.ogg` | 0.23 s | ogg 48k st | 9 KB | book close | kenney-rpg (bookClose.ogg) |
| `sfx/ui/book_open_01.ogg` | 0.15 s | ogg 48k st | 8 KB | book open (skill tree, quest log) | kenney-rpg (bookOpen.ogg) |
| `sfx/ui/book_place_01.ogg` | 0.28 s | ogg 48k st | 10 KB | book placed | kenney-rpg (bookPlace1.ogg) |
| `sfx/ui/book_place_02.ogg` | 0.35 s | ogg 48k st | 11 KB | book placed | kenney-rpg (bookPlace2.ogg) |
| `sfx/ui/book_place_03.ogg` | 0.26 s | ogg 48k st | 9 KB | book placed | kenney-rpg (bookPlace3.ogg) |
| `sfx/ui/click_01.ogg` | 0.10 s | ogg 44.1k mono | 5 KB | UI click | kenney-interface (click_001.ogg) |
| `sfx/ui/click_02.ogg` | 0.01 s | ogg 44.1k mono | 4 KB | micro click (7-9 ms tick) | kenney-interface (click_002.ogg) |
| `sfx/ui/click_03.ogg` | 0.01 s | ogg 44.1k mono | 4 KB | micro click (7-9 ms tick) | kenney-interface (click_003.ogg) |
| `sfx/ui/click_04.ogg` | 0.01 s | ogg 44.1k mono | 4 KB | micro click (7-9 ms tick) | kenney-interface (click_004.ogg) |
| `sfx/ui/click_05.ogg` | 0.01 s | ogg 44.1k mono | 4 KB | micro click (7-9 ms tick) | kenney-interface (click_005.ogg) |
| `sfx/ui/click_soft_01.ogg` | 0.09 s | ogg 44.1k st | 5 KB | soft UI click | kenney-ui (click1.ogg) |
| `sfx/ui/click_soft_02.ogg` | 0.06 s | ogg 44.1k st | 5 KB | soft UI click | kenney-ui (click2.ogg) |
| `sfx/ui/click_soft_03.ogg` | 0.09 s | ogg 44.1k st | 5 KB | soft UI click | kenney-ui (click3.ogg) |
| `sfx/ui/click_soft_04.ogg` | 0.04 s | ogg 44.1k st | 4 KB | soft UI click | kenney-ui (click4.ogg) |
| `sfx/ui/click_soft_05.ogg` | 0.03 s | ogg 44.1k st | 4 KB | soft UI click | kenney-ui (click5.ogg) |
| `sfx/ui/close_01.ogg` | 0.15 s | ogg 44.1k mono | 10 KB | panel close | kenney-interface (close_001.ogg) |
| `sfx/ui/close_02.ogg` | 0.31 s | ogg 44.1k mono | 14 KB | panel close | kenney-interface (close_002.ogg) |
| `sfx/ui/close_03.ogg` | 0.31 s | ogg 44.1k mono | 15 KB | panel close | kenney-interface (close_003.ogg) |
| `sfx/ui/close_04.ogg` | 0.32 s | ogg 44.1k mono | 16 KB | panel close | kenney-interface (close_004.ogg) |
| `sfx/ui/confirm_01.ogg` | 0.29 s | ogg 44.1k mono | 9 KB | UI confirm / accept | kenney-interface (confirmation_001.ogg) |
| `sfx/ui/confirm_02.ogg` | 0.54 s | ogg 44.1k mono | 14 KB | UI confirm / accept | kenney-interface (confirmation_002.ogg) |
| `sfx/ui/confirm_03.ogg` | 0.32 s | ogg 44.1k mono | 9 KB | UI confirm / accept | kenney-interface (confirmation_003.ogg) |
| `sfx/ui/confirm_04.ogg` | 0.49 s | ogg 44.1k mono | 12 KB | UI confirm / accept | kenney-interface (confirmation_004.ogg) |
| `sfx/ui/drop_01.ogg` | 0.11 s | ogg 44.1k st | 6 KB | item drop into slot | kenney-interface (drop_001.ogg) |
| `sfx/ui/drop_02.ogg` | 0.19 s | ogg 44.1k st | 6 KB | item drop into slot | kenney-interface (drop_002.ogg) |
| `sfx/ui/drop_03.ogg` | 0.19 s | ogg 44.1k st | 6 KB | item drop into slot | kenney-interface (drop_003.ogg) |
| `sfx/ui/drop_04.ogg` | 0.29 s | ogg 44.1k st | 7 KB | item drop into slot | kenney-interface (drop_004.ogg) |
| `sfx/ui/error_01.ogg` | 0.16 s | ogg 44.1k st | 7 KB | UI error / not allowed | kenney-interface (error_001.ogg) |
| `sfx/ui/error_02.ogg` | 0.16 s | ogg 44.1k st | 7 KB | UI error / not allowed | kenney-interface (error_002.ogg) |
| `sfx/ui/error_03.ogg` | 0.53 s | ogg 44.1k st | 12 KB | UI error / not allowed | kenney-interface (error_003.ogg) |
| `sfx/ui/error_04.ogg` | 0.10 s | ogg 44.1k st | 6 KB | UI error / not allowed | kenney-interface (error_004.ogg) |
| `sfx/ui/error_05.ogg` | 0.50 s | ogg 44.1k mono | 7 KB | UI error / not allowed | kenney-interface (error_005.ogg) |
| `sfx/ui/error_06.ogg` | 0.50 s | ogg 44.1k mono | 8 KB | UI error / not allowed | kenney-interface (error_006.ogg) |
| `sfx/ui/error_07.ogg` | 0.19 s | ogg 44.1k mono | 10 KB | UI error / not allowed | kenney-interface (error_007.ogg) |
| `sfx/ui/error_08.ogg` | 0.14 s | ogg 44.1k mono | 9 KB | UI error / not allowed | kenney-interface (error_008.ogg) |
| `sfx/ui/glass_01.ogg` | 0.28 s | ogg 44.1k mono | 6 KB | glassy blip (passive node, socket) | kenney-interface (glass_001.ogg) |
| `sfx/ui/glass_02.ogg` | 0.13 s | ogg 44.1k mono | 5 KB | glassy blip (passive node, socket) | kenney-interface (glass_002.ogg) |
| `sfx/ui/glass_03.ogg` | 0.12 s | ogg 44.1k mono | 6 KB | glassy blip (passive node, socket) | kenney-interface (glass_003.ogg) |
| `sfx/ui/glass_04.ogg` | 0.69 s | ogg 44.1k mono | 8 KB | glassy blip (passive node, socket) | kenney-interface (glass_004.ogg) |
| `sfx/ui/glass_05.ogg` | 0.11 s | ogg 44.1k mono | 6 KB | glassy blip (passive node, socket) | kenney-interface (glass_005.ogg) |
| `sfx/ui/glass_06.ogg` | 0.11 s | ogg 44.1k mono | 7 KB | glassy blip (passive node, socket) | kenney-interface (glass_006.ogg) |
| `sfx/ui/hover_01.ogg` | 0.23 s | ogg 44.1k st | 6 KB | hover / rollover | kenney-ui (rollover1.ogg) |
| `sfx/ui/hover_02.ogg` | 0.06 s | ogg 44.1k st | 5 KB | hover / rollover | kenney-ui (rollover2.ogg) |
| `sfx/ui/hover_03.ogg` | 0.07 s | ogg 44.1k st | 5 KB | hover / rollover | kenney-ui (rollover3.ogg) |
| `sfx/ui/hover_04.ogg` | 0.11 s | ogg 44.1k st | 5 KB | hover / rollover | kenney-ui (rollover4.ogg) |
| `sfx/ui/hover_05.ogg` | 0.11 s | ogg 44.1k st | 5 KB | hover / rollover | kenney-ui (rollover5.ogg) |
| `sfx/ui/hover_06.ogg` | 0.17 s | ogg 44.1k st | 5 KB | hover / rollover | kenney-ui (rollover6.ogg) |
| `sfx/ui/maximize_01.ogg` | 0.26 s | ogg 44.1k mono | 12 KB | window open / party join | kenney-interface (maximize_001.ogg) |
| `sfx/ui/maximize_02.ogg` | 0.26 s | ogg 44.1k mono | 10 KB | window open / party join | kenney-interface (maximize_002.ogg) |
| `sfx/ui/maximize_03.ogg` | 0.21 s | ogg 44.1k mono | 11 KB | window open / party join | kenney-interface (maximize_003.ogg) |
| `sfx/ui/maximize_04.ogg` | 0.42 s | ogg 44.1k mono | 17 KB | window open / party join | kenney-interface (maximize_004.ogg) |
| `sfx/ui/maximize_05.ogg` | 0.53 s | ogg 44.1k mono | 20 KB | window open / party join | kenney-interface (maximize_005.ogg) |
| `sfx/ui/maximize_06.ogg` | 0.38 s | ogg 44.1k mono | 11 KB | window open / party join | kenney-interface (maximize_006.ogg) |
| `sfx/ui/maximize_07.ogg` | 0.19 s | ogg 44.1k mono | 8 KB | window open / party join | kenney-interface (maximize_007.ogg) |
| `sfx/ui/maximize_08.ogg` | 0.23 s | ogg 44.1k mono | 9 KB | window open / party join | kenney-interface (maximize_008.ogg) |
| `sfx/ui/maximize_09.ogg` | 0.22 s | ogg 44.1k mono | 7 KB | window open / party join | kenney-interface (maximize_009.ogg) |
| `sfx/ui/menu_01.wav` | 0.19 s | wav16 22.05k mono | 8 KB | main menu button (RPG style) | oga-rpgpack (interface1.wav) |
| `sfx/ui/menu_02.wav` | 0.45 s | wav16 22.05k mono | 19 KB | main menu button (RPG style) | oga-rpgpack (interface2.wav) |
| `sfx/ui/menu_03.wav` | 0.45 s | wav16 22.05k mono | 19 KB | main menu button (RPG style) | oga-rpgpack (interface3.wav) |
| `sfx/ui/menu_04.wav` | 0.41 s | wav16 22.05k mono | 18 KB | main menu button (RPG style) | oga-rpgpack (interface4.wav) |
| `sfx/ui/menu_05.wav` | 0.41 s | wav16 22.05k mono | 18 KB | main menu button (RPG style) | oga-rpgpack (interface5.wav) |
| `sfx/ui/menu_06.wav` | 0.50 s | wav16 22.05k mono | 22 KB | main menu button (RPG style) | oga-rpgpack (interface6.wav) |
| `sfx/ui/minimize_01.ogg` | 0.26 s | ogg 44.1k mono | 12 KB | window close / party leave | kenney-interface (minimize_001.ogg) |
| `sfx/ui/minimize_02.ogg` | 0.26 s | ogg 44.1k mono | 9 KB | window close / party leave | kenney-interface (minimize_002.ogg) |
| `sfx/ui/minimize_03.ogg` | 0.21 s | ogg 44.1k mono | 11 KB | window close / party leave | kenney-interface (minimize_003.ogg) |
| `sfx/ui/minimize_04.ogg` | 0.42 s | ogg 44.1k mono | 17 KB | window close / party leave | kenney-interface (minimize_004.ogg) |
| `sfx/ui/minimize_05.ogg` | 0.53 s | ogg 44.1k mono | 19 KB | window close / party leave | kenney-interface (minimize_005.ogg) |
| `sfx/ui/minimize_06.ogg` | 0.38 s | ogg 44.1k mono | 11 KB | window close / party leave | kenney-interface (minimize_006.ogg) |
| `sfx/ui/minimize_07.ogg` | 0.19 s | ogg 44.1k mono | 7 KB | window close / party leave | kenney-interface (minimize_007.ogg) |
| `sfx/ui/minimize_08.ogg` | 0.23 s | ogg 44.1k mono | 9 KB | window close / party leave | kenney-interface (minimize_008.ogg) |
| `sfx/ui/minimize_09.ogg` | 0.22 s | ogg 44.1k mono | 7 KB | window close / party leave | kenney-interface (minimize_009.ogg) |
| `sfx/ui/mouse_click_01.ogg` | 0.06 s | ogg 44.1k st | 5 KB | mouse click/release | kenney-ui (mouseclick1.ogg) |
| `sfx/ui/mouse_release_01.ogg` | 0.07 s | ogg 44.1k st | 5 KB | mouse click/release | kenney-ui (mouserelease1.ogg) |
| `sfx/ui/open_01.ogg` | 0.15 s | ogg 44.1k mono | 10 KB | panel open | kenney-interface (open_001.ogg) |
| `sfx/ui/open_02.ogg` | 0.31 s | ogg 44.1k mono | 15 KB | panel open | kenney-interface (open_002.ogg) |
| `sfx/ui/open_03.ogg` | 0.31 s | ogg 44.1k mono | 15 KB | panel open | kenney-interface (open_003.ogg) |
| `sfx/ui/open_04.ogg` | 0.32 s | ogg 44.1k mono | 16 KB | panel open | kenney-interface (open_004.ogg) |
| `sfx/ui/page_flip_01.ogg` | 0.77 s | ogg 48k st | 18 KB | page flip (tabs in books) | kenney-rpg (bookFlip1.ogg) |
| `sfx/ui/page_flip_02.ogg` | 0.43 s | ogg 48k st | 12 KB | page flip (tabs in books) | kenney-rpg (bookFlip2.ogg) |
| `sfx/ui/page_flip_03.ogg` | 0.23 s | ogg 48k st | 9 KB | page flip (tabs in books) | kenney-rpg (bookFlip3.ogg) |
| `sfx/ui/pluck_01.ogg` | 0.10 s | ogg 44.1k st | 6 KB | string pluck (chat, tooltip, bow-twang layer) | kenney-interface (pluck_001.ogg) |
| `sfx/ui/pluck_02.ogg` | 0.16 s | ogg 44.1k st | 7 KB | string pluck (chat, tooltip, bow-twang layer) | kenney-interface (pluck_002.ogg) |
| `sfx/ui/question_01.ogg` | 0.49 s | ogg 44.1k mono | 11 KB | ready check / prompt | kenney-interface (question_001.ogg) |
| `sfx/ui/question_02.ogg` | 0.33 s | ogg 44.1k mono | 9 KB | ready check / prompt | kenney-interface (question_002.ogg) |
| `sfx/ui/question_03.ogg` | 0.33 s | ogg 44.1k mono | 8 KB | ready check / prompt | kenney-interface (question_003.ogg) |
| `sfx/ui/question_04.ogg` | 0.33 s | ogg 44.1k mono | 10 KB | ready check / prompt | kenney-interface (question_004.ogg) |
| `sfx/ui/scratch_01.ogg` | 0.14 s | ogg 44.1k mono | 9 KB | scratch (map, quill, quest log write) | kenney-interface (scratch_001.ogg) |
| `sfx/ui/scratch_02.ogg` | 0.14 s | ogg 44.1k mono | 9 KB | scratch (map, quill, quest log write) | kenney-interface (scratch_002.ogg) |
| `sfx/ui/scratch_03.ogg` | 0.12 s | ogg 44.1k mono | 9 KB | scratch (map, quill, quest log write) | kenney-interface (scratch_003.ogg) |
| `sfx/ui/scratch_04.ogg` | 0.33 s | ogg 44.1k mono | 16 KB | scratch (map, quill, quest log write) | kenney-interface (scratch_004.ogg) |
| `sfx/ui/scratch_05.ogg` | 0.33 s | ogg 44.1k mono | 15 KB | scratch (map, quill, quest log write) | kenney-interface (scratch_005.ogg) |
| `sfx/ui/scroll_01.ogg` | 1.00 s | ogg 44.1k mono | 21 KB | scroll (1 s) | kenney-interface (scroll_001.ogg) |
| `sfx/ui/scroll_02.ogg` | 1.00 s | ogg 44.1k mono | 24 KB | scroll (1 s) | kenney-interface (scroll_002.ogg) |
| `sfx/ui/scroll_03.ogg` | 1.00 s | ogg 44.1k mono | 29 KB | scroll (1 s) | kenney-interface (scroll_003.ogg) |
| `sfx/ui/scroll_04.ogg` | 1.00 s | ogg 44.1k mono | 20 KB | scroll (1 s) | kenney-interface (scroll_004.ogg) |
| `sfx/ui/scroll_05.ogg` | 1.00 s | ogg 44.1k mono | 20 KB | scroll (1 s) | kenney-interface (scroll_005.ogg) |
| `sfx/ui/select_01.ogg` | 0.04 s | ogg 44.1k st | 5 KB | select / highlight | kenney-interface (select_001.ogg) |
| `sfx/ui/select_02.ogg` | 0.04 s | ogg 44.1k st | 5 KB | select / highlight | kenney-interface (select_002.ogg) |
| `sfx/ui/select_03.ogg` | 0.38 s | ogg 44.1k mono | 7 KB | select / highlight | kenney-interface (select_003.ogg) |
| `sfx/ui/select_04.ogg` | 0.38 s | ogg 44.1k mono | 7 KB | select / highlight | kenney-interface (select_004.ogg) |
| `sfx/ui/select_05.ogg` | 0.38 s | ogg 44.1k mono | 7 KB | select / highlight | kenney-interface (select_005.ogg) |
| `sfx/ui/select_06.ogg` | 1.94 s | ogg 44.1k mono | 8 KB | select / highlight | kenney-interface (select_006.ogg) |
| `sfx/ui/select_07.ogg` | 0.05 s | ogg 44.1k mono | 6 KB | select / highlight | kenney-interface (select_007.ogg) |
| `sfx/ui/select_08.ogg` | 0.05 s | ogg 44.1k mono | 6 KB | select / highlight | kenney-interface (select_008.ogg) |
| `sfx/ui/switch_01.ogg` | 0.62 s | ogg 44.1k st | 7 KB | switch (settings toggles) | kenney-interface (switch_001.ogg) |
| `sfx/ui/switch_02.ogg` | 0.61 s | ogg 44.1k st | 7 KB | switch (settings toggles) | kenney-interface (switch_002.ogg) |
| `sfx/ui/switch_03.ogg` | 0.50 s | ogg 44.1k st | 9 KB | switch (settings toggles) | kenney-interface (switch_003.ogg) |
| `sfx/ui/switch_04.ogg` | 0.50 s | ogg 44.1k st | 7 KB | switch (settings toggles) | kenney-interface (switch_004.ogg) |
| `sfx/ui/switch_05.ogg` | 0.61 s | ogg 44.1k st | 8 KB | switch (settings toggles) | kenney-interface (switch_005.ogg) |
| `sfx/ui/switch_06.ogg` | 0.61 s | ogg 44.1k st | 8 KB | switch (settings toggles) | kenney-interface (switch_006.ogg) |
| `sfx/ui/switch_07.ogg` | 0.61 s | ogg 44.1k st | 8 KB | switch (settings toggles) | kenney-interface (switch_007.ogg) |
| `sfx/ui/tick_01.ogg` | 0.02 s | ogg 44.1k mono | 4 KB | countdown tick | kenney-interface (tick_001.ogg) |
| `sfx/ui/tick_02.ogg` | 0.02 s | ogg 44.1k mono | 4 KB | countdown tick | kenney-interface (tick_002.ogg) |
| `sfx/ui/tick_03.ogg` | 0.05 s | ogg 44.1k mono | 5 KB | countdown tick | kenney-interface (tick_004.ogg) |
| `sfx/ui/toggle_01.ogg` | 0.14 s | ogg 44.1k mono | 7 KB | tab switch / toggle | kenney-interface (toggle_001.ogg) |
| `sfx/ui/toggle_02.ogg` | 0.14 s | ogg 44.1k mono | 8 KB | tab switch / toggle | kenney-interface (toggle_002.ogg) |
| `sfx/ui/toggle_03.ogg` | 0.14 s | ogg 44.1k mono | 8 KB | tab switch / toggle | kenney-interface (toggle_003.ogg) |
| `sfx/ui/toggle_04.ogg` | 0.07 s | ogg 44.1k mono | 7 KB | tab switch / toggle | kenney-interface (toggle_004.ogg) |

### sfx/world/ (91 files, 1.15 MB)

| path | dur | format | size | intended use | src (original name) |
|---|---|---|---|---|---|
| `sfx/world/bell_heavy_01.ogg` | 1.48 s | ogg 44.1k st | 14 KB | heavy bell/gong (keystone, M+ start, boss) | kenney-impact (impactBell_heavy_000.ogg) |
| `sfx/world/bell_heavy_02.ogg` | 1.74 s | ogg 44.1k st | 15 KB | heavy bell/gong (keystone, M+ start, boss) | kenney-impact (impactBell_heavy_001.ogg) |
| `sfx/world/bell_heavy_03.ogg` | 0.70 s | ogg 44.1k st | 9 KB | heavy bell/gong (keystone, M+ start, boss) | kenney-impact (impactBell_heavy_002.ogg) |
| `sfx/world/bell_heavy_04.ogg` | 0.65 s | ogg 44.1k st | 9 KB | heavy bell/gong (keystone, M+ start, boss) | kenney-impact (impactBell_heavy_003.ogg) |
| `sfx/world/bell_heavy_05.ogg` | 0.30 s | ogg 44.1k st | 6 KB | heavy bell/gong (keystone, M+ start, boss) | kenney-impact (impactBell_heavy_004.ogg) |
| `sfx/world/break_glass_heavy_01.ogg` | 0.24 s | ogg 44.1k st | 7 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_heavy_000.ogg) |
| `sfx/world/break_glass_heavy_02.ogg` | 0.43 s | ogg 44.1k st | 9 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_heavy_001.ogg) |
| `sfx/world/break_glass_heavy_03.ogg` | 0.25 s | ogg 44.1k st | 7 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_heavy_002.ogg) |
| `sfx/world/break_glass_heavy_04.ogg` | 0.17 s | ogg 44.1k st | 7 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_heavy_003.ogg) |
| `sfx/world/break_glass_heavy_05.ogg` | 0.40 s | ogg 44.1k st | 8 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_heavy_004.ogg) |
| `sfx/world/break_glass_light_01.ogg` | 0.21 s | ogg 44.1k st | 6 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_light_000.ogg) |
| `sfx/world/break_glass_light_02.ogg` | 0.21 s | ogg 44.1k st | 6 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_light_001.ogg) |
| `sfx/world/break_glass_light_03.ogg` | 0.21 s | ogg 44.1k st | 6 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_light_002.ogg) |
| `sfx/world/break_glass_light_04.ogg` | 0.21 s | ogg 44.1k st | 6 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_light_003.ogg) |
| `sfx/world/break_glass_light_05.ogg` | 0.21 s | ogg 44.1k st | 6 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_light_004.ogg) |
| `sfx/world/break_glass_medium_01.ogg` | 0.54 s | ogg 44.1k st | 8 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_medium_000.ogg) |
| `sfx/world/break_glass_medium_02.ogg` | 0.54 s | ogg 44.1k st | 8 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_medium_001.ogg) |
| `sfx/world/break_glass_medium_03.ogg` | 0.54 s | ogg 44.1k st | 8 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_medium_002.ogg) |
| `sfx/world/break_glass_medium_04.ogg` | 0.54 s | ogg 44.1k st | 8 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_medium_003.ogg) |
| `sfx/world/break_glass_medium_05.ogg` | 0.54 s | ogg 44.1k st | 8 KB | pot/urn/vial break; light = frost shatter layer | kenney-impact (impactGlass_medium_004.ogg) |
| `sfx/world/break_wood_heavy_01.ogg` | 0.31 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_heavy_000.ogg) |
| `sfx/world/break_wood_heavy_02.ogg` | 0.31 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_heavy_001.ogg) |
| `sfx/world/break_wood_heavy_03.ogg` | 0.31 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_heavy_002.ogg) |
| `sfx/world/break_wood_heavy_04.ogg` | 0.31 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_heavy_003.ogg) |
| `sfx/world/break_wood_heavy_05.ogg` | 0.31 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_heavy_004.ogg) |
| `sfx/world/break_wood_light_01.ogg` | 0.27 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_light_000.ogg) |
| `sfx/world/break_wood_light_02.ogg` | 0.27 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_light_001.ogg) |
| `sfx/world/break_wood_light_03.ogg` | 0.27 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_light_002.ogg) |
| `sfx/world/break_wood_light_04.ogg` | 0.27 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_light_003.ogg) |
| `sfx/world/break_wood_light_05.ogg` | 0.27 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_light_004.ogg) |
| `sfx/world/break_wood_medium_01.ogg` | 0.33 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_medium_000.ogg) |
| `sfx/world/break_wood_medium_02.ogg` | 0.33 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_medium_001.ogg) |
| `sfx/world/break_wood_medium_03.ogg` | 0.33 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_medium_002.ogg) |
| `sfx/world/break_wood_medium_04.ogg` | 0.33 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_medium_003.ogg) |
| `sfx/world/break_wood_medium_05.ogg` | 0.33 s | ogg 44.1k st | 6 KB | crate/barrel break; light = bone hit proxy | kenney-impact (impactWood_medium_004.ogg) |
| `sfx/world/chain_01.ogg` | 0.51 s | ogg 48k st | 22 KB | chains / portcullis / trap | oga-rubberduck-rpg (chain_01.ogg) |
| `sfx/world/chain_02.ogg` | 0.49 s | ogg 48k st | 18 KB | chains / portcullis / trap | oga-rubberduck-rpg (chain_02.ogg) |
| `sfx/world/chain_03.ogg` | 0.93 s | ogg 48k st | 36 KB | chains / portcullis / trap | oga-rubberduck-rpg (chain_03.ogg) |
| `sfx/world/creak_01.ogg` | 0.66 s | ogg 48k st | 15 KB | creak (chest lid, old door) | kenney-rpg (creak1.ogg) |
| `sfx/world/creak_02.ogg` | 0.83 s | ogg 48k st | 19 KB | creak (chest lid, old door) | kenney-rpg (creak2.ogg) |
| `sfx/world/creak_03.ogg` | 0.34 s | ogg 48k st | 10 KB | creak (chest lid, old door) | kenney-rpg (creak3.ogg) |
| `sfx/world/door_close_01.ogg` | 0.68 s | ogg 48k st | 18 KB | door close | kenney-rpg (doorClose_1.ogg) |
| `sfx/world/door_close_02.ogg` | 0.61 s | ogg 48k st | 17 KB | door close | kenney-rpg (doorClose_2.ogg) |
| `sfx/world/door_close_03.ogg` | 0.71 s | ogg 48k st | 20 KB | door close | kenney-rpg (doorClose_3.ogg) |
| `sfx/world/door_close_04.ogg` | 0.60 s | ogg 48k st | 17 KB | door close | kenney-rpg (doorClose_4.ogg) |
| `sfx/world/door_heavy_01.wav` | 1.00 s | wav16 22.05k mono | 43 KB | heavy dungeon door / gate | oga-rpgpack (door.wav) |
| `sfx/world/door_open_01.ogg` | 0.92 s | ogg 48k st | 22 KB | door open | kenney-rpg (doorOpen_1.ogg) |
| `sfx/world/door_open_02.ogg` | 1.41 s | ogg 48k st | 30 KB | door open | kenney-rpg (doorOpen_2.ogg) |
| `sfx/world/impact_light_01.ogg` | 0.14 s | ogg 44.1k st | 6 KB | light generic impact (item lands) | kenney-impact (impactGeneric_light_000.ogg) |
| `sfx/world/impact_light_02.ogg` | 0.12 s | ogg 44.1k st | 6 KB | light generic impact (item lands) | kenney-impact (impactGeneric_light_001.ogg) |
| `sfx/world/impact_light_03.ogg` | 0.14 s | ogg 44.1k st | 6 KB | light generic impact (item lands) | kenney-impact (impactGeneric_light_002.ogg) |
| `sfx/world/impact_light_04.ogg` | 0.14 s | ogg 44.1k st | 6 KB | light generic impact (item lands) | kenney-impact (impactGeneric_light_003.ogg) |
| `sfx/world/impact_light_05.ogg` | 0.14 s | ogg 44.1k st | 6 KB | light generic impact (item lands) | kenney-impact (impactGeneric_light_004.ogg) |
| `sfx/world/lock_01.ogg` | 0.41 s | ogg 48k st | 17 KB | chest unlock | oga-rubberduck-rpg (lock_01.ogg) |
| `sfx/world/lock_02.ogg` | 0.40 s | ogg 48k st | 15 KB | chest unlock | oga-rubberduck-rpg (lock_02.ogg) |
| `sfx/world/lock_03.ogg` | 0.34 s | ogg 48k st | 18 KB | chest unlock | oga-rubberduck-rpg (lock_03.ogg) |
| `sfx/world/metal_01.ogg` | 0.58 s | ogg 48k st | 25 KB | anvil-ish metal hit (blacksmith upgrade) | oga-rubberduck-rpg (metal_01.ogg) |
| `sfx/world/metal_02.ogg` | 0.56 s | ogg 48k st | 26 KB | anvil-ish metal hit (blacksmith upgrade) | oga-rubberduck-rpg (metal_02.ogg) |
| `sfx/world/metal_03.ogg` | 0.43 s | ogg 48k st | 18 KB | anvil-ish metal hit (blacksmith upgrade) | oga-rubberduck-rpg (metal_03.ogg) |
| `sfx/world/metal_click_01.ogg` | 0.45 s | ogg 48k st | 13 KB | lock click (chest locked) | kenney-rpg (metalClick.ogg) |
| `sfx/world/metal_latch_01.ogg` | 0.26 s | ogg 48k st | 10 KB | latch / lever / keystone slot | kenney-rpg (metalLatch.ogg) |
| `sfx/world/metal_pot_01.ogg` | 1.46 s | ogg 48k st | 31 KB | metal pot (hub props, blacksmith clutter) | kenney-rpg (metalPot1.ogg) |
| `sfx/world/metal_pot_02.ogg` | 0.94 s | ogg 48k st | 22 KB | metal pot (hub props, blacksmith clutter) | kenney-rpg (metalPot2.ogg) |
| `sfx/world/metal_pot_03.ogg` | 0.91 s | ogg 48k st | 23 KB | metal pot (hub props, blacksmith clutter) | kenney-rpg (metalPot3.ogg) |
| `sfx/world/mining_01.ogg` | 0.94 s | ogg 44.1k st | 12 KB | pickaxe/hammer on stone (blacksmith hammer, ground slam layer) | kenney-impact (impactMining_000.ogg) |
| `sfx/world/mining_02.ogg` | 0.87 s | ogg 44.1k st | 11 KB | pickaxe/hammer on stone (blacksmith hammer, ground slam layer) | kenney-impact (impactMining_001.ogg) |
| `sfx/world/mining_03.ogg` | 0.80 s | ogg 44.1k st | 11 KB | pickaxe/hammer on stone (blacksmith hammer, ground slam layer) | kenney-impact (impactMining_002.ogg) |
| `sfx/world/mining_04.ogg` | 0.99 s | ogg 44.1k st | 12 KB | pickaxe/hammer on stone (blacksmith hammer, ground slam layer) | kenney-impact (impactMining_003.ogg) |
| `sfx/world/mining_05.ogg` | 0.83 s | ogg 44.1k st | 11 KB | pickaxe/hammer on stone (blacksmith hammer, ground slam layer) | kenney-impact (impactMining_004.ogg) |
| `sfx/world/misc_01.ogg` | 0.34 s | ogg 48k st | 12 KB | misc prop | oga-rubberduck-rpg (misc_01.ogg) |
| `sfx/world/misc_02.ogg` | 0.54 s | ogg 48k st | 19 KB | misc prop | oga-rubberduck-rpg (misc_02.ogg) |
| `sfx/world/misc_03.ogg` | 0.24 s | ogg 48k st | 13 KB | misc prop | oga-rubberduck-rpg (misc_03.ogg) |
| `sfx/world/plank_01.ogg` | 0.78 s | ogg 44.1k st | 12 KB | plank hit / wooden barricade | kenney-impact (impactPlank_medium_000.ogg) |
| `sfx/world/plank_02.ogg` | 0.78 s | ogg 44.1k st | 12 KB | plank hit / wooden barricade | kenney-impact (impactPlank_medium_001.ogg) |
| `sfx/world/plank_03.ogg` | 0.78 s | ogg 44.1k st | 12 KB | plank hit / wooden barricade | kenney-impact (impactPlank_medium_002.ogg) |
| `sfx/world/plank_04.ogg` | 0.78 s | ogg 44.1k st | 12 KB | plank hit / wooden barricade | kenney-impact (impactPlank_medium_003.ogg) |
| `sfx/world/plank_05.ogg` | 0.78 s | ogg 44.1k st | 12 KB | plank hit / wooden barricade | kenney-impact (impactPlank_medium_004.ogg) |
| `sfx/world/stones_01.ogg` | 0.68 s | ogg 48k st | 26 KB | rubble / destructible rock | oga-rubberduck-rpg (stones_01.ogg) |
| `sfx/world/stones_02.ogg` | 0.78 s | ogg 48k st | 35 KB | rubble / destructible rock | oga-rubberduck-rpg (stones_02.ogg) |
| `sfx/world/stones_03.ogg` | 1.20 s | ogg 48k st | 40 KB | rubble / destructible rock | oga-rubberduck-rpg (stones_03.ogg) |
| `sfx/world/stones_04.ogg` | 0.38 s | ogg 48k st | 20 KB | rubble / destructible rock | oga-rubberduck-rpg (stones_04.ogg) |
| `sfx/world/tin_01.ogg` | 0.16 s | ogg 44.1k st | 6 KB | tin can / small metal prop | kenney-impact (impactTin_medium_000.ogg) |
| `sfx/world/tin_02.ogg` | 0.17 s | ogg 44.1k st | 6 KB | tin can / small metal prop | kenney-impact (impactTin_medium_001.ogg) |
| `sfx/world/tin_03.ogg` | 0.13 s | ogg 44.1k st | 6 KB | tin can / small metal prop | kenney-impact (impactTin_medium_002.ogg) |
| `sfx/world/tin_04.ogg` | 0.21 s | ogg 44.1k st | 6 KB | tin can / small metal prop | kenney-impact (impactTin_medium_003.ogg) |
| `sfx/world/tin_05.ogg` | 0.18 s | ogg 44.1k st | 6 KB | tin can / small metal prop | kenney-impact (impactTin_medium_004.ogg) |
| `sfx/world/wood_01.ogg` | 0.24 s | ogg 48k st | 13 KB | wood knock / bone clatter proxy | oga-rubberduck-rpg (wood_01.ogg) |
| `sfx/world/wood_02.ogg` | 0.19 s | ogg 48k st | 10 KB | wood knock / bone clatter proxy | oga-rubberduck-rpg (wood_02.ogg) |
| `sfx/world/wood_03.ogg` | 0.30 s | ogg 48k st | 14 KB | wood knock / bone clatter proxy | oga-rubberduck-rpg (wood_03.ogg) |
| `sfx/world/wood_04.ogg` | 0.65 s | ogg 48k st | 20 KB | wood knock / bone clatter proxy | oga-rubberduck-rpg (wood_04.ogg) |
| `sfx/world/wood_05.ogg` | 0.39 s | ogg 48k st | 14 KB | wood knock / bone clatter proxy | oga-rubberduck-rpg (wood_05.ogg) |

