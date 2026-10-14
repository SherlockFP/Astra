# Audio mix: calmer MMO sound (before / after)

Owner feedback: "ses efektleri çok kötü, rahatsız edici, MMORPG'ye uygun değil" (effects too harsh and fatiguing, not suited to an MMORPG).
Goal: a WoW-like mix where combat sounds sit under the player's ear, repeated hits do not pile up, and UI clicks stay quiet.

## What changed

| Area | Before | After |
|---|---|---|
| Effects bus (`sfxVolume`) | 0.8 | **0.5** |
| Music bus (`musicVolume`) | 0.5 (x0.7 trim) | **0.35** (x0.7 trim) |
| Interface bus (`uiVolume`) | 0.7 | **0.35** |
| Ambience bed | on the effects bus, x0.45 | own bus, `ambienceVolume` **0.4**, x0.45 (new slider "Ortam") |
| Button hover blip (`ui_hover`) | always on | **off** by default (Settings > Ses > "Düğme üstü sesi") |
| Hit gap (`hit_*`, block, shield bash) | 35 ms | **70 ms** |
| Swing / whoosh / dodge gap | 70 ms | **120 ms** |
| Impact gap (`*_impact`, explosion) | 60 ms | 70 ms |
| Footstep gap | 90 ms | 100 ms |
| Voices per id (hits, swings, impacts) | manifest `mv` (1 to 8) | `min(mv, 3)`; `min(mv, 2)` with Savaş Az |
| Stacked hits | every hit plays (up to 3 per 100 ms) | a hit that stacks on another within 250 ms plays half the time |
| Repeat variation | pitch +/-3 to 10 % (per id), volume none | pitch at least +/-5 %, volume +/-5 % on every play |
| Distance falloff (positional sounds) | gain `ref / (ref + (d - ref) x 1.15)`, cut at 55 m (or 9 x ref) | factor 1.6 instead of 1.15; cut at 45 m (or 8 x ref) |
| Crit (`hit_crit`) | full sample, trim 1 | trim 0.75, cut at 0.35 s with a 40 ms fade |
| Level up (`level_up`) | full jingle, trim 1 | trim 0.7, cut at 1.6 s |
| Crit finisher | trim 1 | trim 0.85, cut at 0.6 s |
| Swings (`swing_light` / `swing_heavy`) | trim 1 | trim 0.6 / 0.7, cut at 0.4 / 0.6 s |
| Savaş sesleri "Az" (new) | n/a | combat sounds x0.6, max 2 voices per id, gaps x1.5 |

Settings: `audioRev` 1 runs once on load and sets the new level defaults (sfx 0.5, music 0.35, ui 0.35, ambience 0.4, hover off). A player who had moved a slider before this change loses that value once; later changes are kept. `SETTINGS_VERSION` is 6.

## Level table (effective output, master 0.8)

Output = manifest gain `v` x per-id trim x bus x master. Values from `tools/audio-audit.mjs` (`v`, `trim`) and the bus settings above.

| id | v | trim before / after | output before | output after | change |
|---|---|---|---|---|---|
| hit_flesh | 0.55 | 1 / 0.8 | 0.352 | 0.176 | -6.0 dB |
| hit_metal | 0.70 | 1 / 0.8 | 0.448 | 0.224 | -6.0 dB |
| hit_bone | 0.75 | 1 / 0.8 | 0.480 | 0.240 | -6.0 dB |
| hit_crit | 0.75 | 1 / 0.75 | 0.480 | 0.225 | -6.6 dB, cut 0.35 s |
| swing_light | 0.45 | 1 / 0.6 | 0.288 | 0.108 | -8.5 dB, cut 0.4 s |
| swing_heavy | 0.65 | 1 / 0.7 | 0.416 | 0.182 | -7.2 dB, cut 0.6 s |
| crit_finisher | 1.00 | 1 / 0.85 | 0.640 | 0.340 | -5.5 dB, cut 0.6 s |
| level_up | 0.80 | 1 / 0.7 | 0.512 | 0.224 | -7.2 dB, cut 1.6 s |
| footstep_stone | 0.35 | 1 / 0.8 | 0.224 | 0.112 | -6.0 dB |
| voice_warrior_attack | 0.80 | 1 / 0.85 | 0.512 | 0.272 | -5.5 dB |
| ui_click | 0.50 | 1 / 1 | 0.280 | 0.140 | -6.0 dB |
| ui_hover | 0.25 | 1 / 0.6 | 0.140 | 0.042 | -10.5 dB, off by default |

Ambience: bus 0.8 becomes 0.4 (-6 dB) and stays adjustable.

## Trigger estimate (`tools/audio-audit.mjs`)

Estimates come from source references per id under `src/` times a per-category rate. They are a guide to which ids fire most, not a measurement.

| id | refs | est/min before | est/min after |
|---|---|---|---|
| swing_light | 58 | 2610 | 2610 (fewer actual plays: 120 ms gap, 3 voices) |
| hit_flesh | 33 | 1485 | 1485 (fewer actual plays: 70 ms gap, stacked hits thinned) |
| block | 44 | 1980 | 1980 (70 ms gap, trim 1; the count includes non-sound uses of the word, so this is an upper bound) |
| footstep_stone | 6 | 660 | 660 |
| ui_hover | 8 | 240 | 0 unless the setting is on |

The audit keeps the reference counts and the category rates unchanged, so the "after" column is the same static count. Real play counts drop because of the gaps, the voice cap and the thinning.

## Reproduce

```
node tools/audio-audit.mjs          # table per sfx id (in-process, reads WAV / OGG headers only)
node tools/audio-audit.mjs --json
```

The audit never opens or plays media files. WAV peak and RMS come from the bytes. OGG has duration only, and MP3 is skipped. Loudness of OGG and MP3 is "n/a".

## Not done

- No new files or samples. The cut and fade are done in Web Audio, so a sample is shortened without re-encoding.
- Auto-attack swings and skill swings share the `swing_*` ids, so both get the same trim.
- The est/min column is static. A play-count log from a live session would be the real measure.
