# WoW Midnight reference: Monk, Hunter, Demon Hunter, Evoker (EFSUN ONLINE re-skin basis)

Research snapshot dated 2026-10-13. Written in my own words from public guides and tooltips. Research only, no code touched.

## Patch context and source quality

- **Season:** Midnight Season 2 started with patch 12.1 "Curse of Ula'tek" (12.1 released about Aug 11-12, 2026; Season 2 began Aug 18-19). Class tuning waves landed Aug 18, Aug 25 and Sep 1.
- **Next patch:** 12.1.5 PTR notes were published Sep 28-29. One source says they go live Oct 13 (NA) / Oct 14 (EU). I could not open Blizzard's final notes, so treat 12.1.5 entries as "announced, verify".
- **12.2 / Season 3:** expected early 2027, not relevant yet.
- **Blocked sources:** Icy Veins guide pages and Wowhead guide bodies returned 403 or no body text. Ability data therefore comes from wow.gg, Method and Maxroll guides, Wowhead spell tooltips (base values, may differ with talents), and third-party tuning write-ups. Several Icy Veins items below are from search snippets only and are marked.
- **Legend:** "n/v" = not verified by any source I could open. Wowhead spell pages sometimes show a tiny internal cooldown (0.5-1.5 s) in the cooldown field; I ignored those and used guide values instead.
- **Visual column:** my description of how the base-game effect usually looks, written from memory. Not sourced. Treat as a starting point for the re-skin.

---

## Monk — Brewmaster [monk_brewmaster]
Patch/season verified: 12.1 Season 2 (guides dated Aug 11-25). Season 2 Aug 25 wave: all damage +3% (Icy Veins snippet only, not opened) | Sources: https://www.method.gg/guides/brewmaster-monk/playstyle-and-rotation , https://wow.gg/guides/monk-brewmaster , https://www.wowhead.com/spell=121253 , https://www.wowhead.com/spell=322507 , https://www.wowhead.com/spell=119582 , https://www.wowhead.com/spell=132578
Resources: Energy (Keg Smash 40, Tiger Palm 50 per shared spell pages; generation n/v). Stagger is a second defensive pool: part of each hit is taken at once and the rest is dealt over 10 s. Bands by share of max HP: light 1-29%, moderate 30-59%, heavy 60%+ (Method). Shuffle makes Stagger stronger.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Keg Smash | Instant | Enemy target + 8 yd AoE | Charges (count n/v) | 40 Energy | Physical hit in an area, 20% slow for 15 s, grants Shuffle | Amber barrel shatter, brown-gold spray |
| Breath of Fire | Instant | Self, 12 yd radius | 15 s | n/v | Fire damage around you | Orange ring bursting outward |
| Blackout Kick | Instant | Enemy target | 3 s | Chi listed on shared page (n/v for Brewmaster) | Kick that grants Blackout Combo and Shuffle | Black-and-gold kick trail |
| Tiger Palm | Instant | Enemy target | None (Energy-gated) | 50 Energy; generates Chi (amount n/v) | Strike that spends Blackout Combo | Quick gold fist, small sparks |
| Spinning Crane Kick | Channel 1.5 s (hits every 0.5 s) | Self, radius | None | 2 Chi / 40 Energy | Repeated AoE hits, grants Shuffle | Circular white-jade arcs around the monk |
| Celestial Brew | Instant | Self | 1 min (Method) | None | Absorb shield (8 s window) scaled by AP, bigger after Purifying Brew | Translucent gold shell |
| Purifying Brew | Instant | Self | 2 charges (Method) | None | Removes 50% of current Stagger, feeds Celestial Brew's absorb | Brown-gold mist sweeping off the monk |
| Invoke Niuzao, the Black Ox | Instant | Summon, 40 yd | 2 min | None | 25 s black ox ally; you get a damage absorb | Large black-gold ox spirit stomping in |
| Fortifying Brew | Instant | Self | 6 min (4 min with Expeditious Fortification) | None | +20% max HP and -20% damage taken (Method; tooltip shows 20 / -20) | Yellow-brown bulk aura |
| Touch of Death | Instant | Enemy target | 3 min (1.5 min with Fatal Touch) | None | Execute-style finisher | Black-violet palm mark |
| Roll | Instant | Self (movement) | Short internal CD; charges n/v | None | Quick roll to reposition | Ground smear trail |
| Spear Hand Strike | Instant | Enemy target, 5 yd | 15 s | None | Interrupt, 5 s lockout | Short jab with pale flash |

### Single-target priority (wow.gg and Method, merged)
1. Touch of Death when available (wow.gg puts it first; Method omits it)
2. Blackout Kick (to generate Blackout Combo)
3. Chi Burst if talented (n/v)
4. Invoke Niuzao if the fight lasts about 25 s or more
5. Tiger Palm (spend Blackout Combo)
6. Keg Smash, then Breath of Fire
7. Exploding Keg (resets a Keg Smash charge)
8. Tiger Palm filler. Celestial Brew when Stagger is near full or two charges are ready (wow.gg).

### AoE priority (Method AoE / M+ list)
1. Blackout Kick (Blackout Combo)
2. Chi Burst
3. Invoke Niuzao
4. Keg Smash, Breath of Fire, Exploding Keg
5. Spinning Crane Kick as filler

### Major cooldowns
- Invoke Niuzao: 2 min CD, 25 s duration (Wowhead tooltip).
- Celestial Brew: 1 min CD (Method), absorb window 8 s.
- Fortifying Brew: 6 min CD (Wowhead, Method). Duration n/v.
- Touch of Death: 3 min CD (1.5 min with Fatal Touch).

### Procs / buff loops / active mitigation
- Shuffle: from Keg Smash, Blackout Kick, Spinning Crane Kick. Raises Stagger effectiveness and should be kept up (Method).
- Blackout Combo: granted by Blackout Kick, spent by Tiger Palm.
- One More Round!: Celestial Brew, Aspect of Harmony and Purifying Brew procs can grant empty kegs (wow.gg).
- Stagger purification: Purifying Brew clears the delayed part. Fortifying Brew's Determination adds +15% Stagger effectiveness (Method).
- Other defensives: Dampen Harm 2 min CD, 10 s, physical and magic absorb (Wowhead tooltip). Spear Hand Strike for interrupts.

### What makes it feel good
- Stagger bands give constant feedback, and Purifying Brew is the satisfying "dump" button.
- Keg Smash, Shuffle and Blackout Combo make a steady kick-and-punch rhythm.
- Niuzao's summon gives a clear big-moment window.

### Season 2 / Midnight changes noted
- 12.1 PTR list (nexttier, PTR build, not final): Staggering Strikes Stagger reduction +25%, Celestial Brew and Celestial Infusion absorb +25%, Vital Flame 40% to 50%. A later Season 2 summary says the absorb is +20%. Conflict, treat as unverified.
- Aug 25 wave: all damage +3% (Icy Veins snippet only).
- Gamer.org lists Brewmaster among specs facing major nerfs; forum PTR list shows buffs. Unresolved.
- 12.1.5 PTR: no Brewmaster changes listed (judgehype, accountshark).

---

## Monk — Mistweaver [monk_mistweaver]
Patch/season verified: 12.1 Season 2. Aug 18 wave: +8% PvE healing, Venomous Abyss 4-set activates 33% more often. Sep 1 wave: +5% all healing, Guile of the Monkey King 4-set proc 20% to 25% | Sources: https://www.method.gg/guides/mistweaver-monk/playstyle-and-rotation , https://wow.gg/guides/monk-mistweaver , https://www.wowhead.com/spell=116670 , https://www.wowhead.com/spell=116849 , https://www.wowhead.com/spell=116680 , https://www.wowhead.com/spell=325197 , https://www.pcgamesn.com/world-of-warcraft/midnight-patch-notes-september-1-class-tuning
Resources: Mana for healing. Chi and Energy for the melee-style spells (Tiger Palm, Blackout Kick, Rising Sun Kick, Spinning Crane Kick). Renewing Mist is used at 3 stacks and Mana Tea at 20 stacks (wow.gg). Regen values n/v.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Vivify | 1.5 s cast, instant on Vivacious Vivification proc | Ally, 40 yd | None | 3% mana | Main emergency single heal | Pale green light burst on target |
| Enveloping Mist | 2 s cast (faster in Chi-Ji / Yu'lon windows) | Ally, 40 yd | None | 3.6% mana | 6 s HoT, +10% caster healing for listed spells | Jade-green cocoon of mist |
| Renewing Mist | Instant (n/v) | Ally | n/v | n/v | HoT; Thunder Focus Tea adds 10 s | Small orbiting green motes |
| Life Cocoon | Instant | Ally, 40 yd | Short internal CD; charges n/v | 2.4% mana | 12 s absorb; target takes 50% more from periodic heals | Pale green shell around an ally |
| Revival | Instant | Self-centred, 40 yd | CD n/v | 4.4% mana | Raid heal and cleanse of disease and poison | Wide pale-gold ripple |
| Thunder Focus Tea | Instant | Self | CD n/v | None | 30 s buff: extends Renewing Mist, shortens Enveloping Mist | Gold steam swirl |
| Invoke Chi-Ji, the Red Crane | Instant | Summon, 40 yd | 2 min | 5% mana | 25 s; cheaper and faster Enveloping Mist, +5% listed healing | Red crane spirit landing |
| Invoke Yu'lon, the Jade Serpent | Instant | Summon, 40 yd | 2 min | 5% mana | 25 s; boosts listed healing, shortens Enveloping Mist | Long jade serpent coiling |
| Rising Sun Kick | Instant | Enemy target | CD n/v (reset by Blackout Kick, Method) | 2 Chi + 2.5% mana | Damage that transfers part into healing (Jadefire Teachings) | Golden uppercut arc |
| Spinning Crane Kick | Channel 1.5 s (every 0.5 s) | Self, radius | None | 2 Chi / 40 Energy / 1% mana | AoE channel, enabled by Dance of Chi-Ji | Circular jade arcs |
| Roll | Instant | Self | Short internal CD | None | Movement | Ground smear |
| Spear Hand Strike | Instant | Enemy target, 5 yd | 15 s | None | Interrupt, 5 s lockout | Short jab flash |

### Single-target priority (Method, paraphrased, no formal list in source)
1. Vivify anyone at risk of dying (use the Vivacious Vivification proc first)
2. Keep Renewing Mist up at 3 stacks; Rising Sun Kick resets help
3. Thunder Focus Tea whenever available
4. Chi-Ji sequence (M+): Enveloping Mist, Invoke Chi-Ji, Enveloping Mist as needed, Rising Sun Kick, Blackout Kick at 4 stacks, Sheilun's Gift or Enveloping Mist
5. Mana Tea at 20 stacks or when time allows
6. Filler: Blackout Kick, Tiger Palm. Do not cast Revival and a Celestial together purely for healing.

### AoE / raid priority (Method Yu'lon sequence)
1. Thunder Focus Tea with Renewing Mist, then Invoke Yu'lon
2. Enveloping Mist x2, Renewing Mist, Rushing Wind Kick, instant Vivify, repeat
3. Revival for raid-wide cleanse and heal (scaling drops beyond 5 targets, Method)

### Major cooldowns
- Invoke Chi-Ji: 2 min CD, 25 s (Wowhead). Invoke Yu'lon: 2 min, 25 s (Wowhead); Method says 12 or 25 s depending on talent. Conflict.
- Fortifying Brew: 6 min (Wowhead, Brewmaster page). Method's Mistweaver page says 2 min. Conflict, verify.
- Revival and Thunder Focus Tea: CD n/v.

### Procs / buff loops / active mitigation
- Dance of Chi-Ji: enables Spinning Crane Kick.
- Teachings of the Monastery: 4 stacks from Invoke Chi-Ji with Celestial Harmony; spent on Blackout Kick.
- Zen Pulse: from Thunder Focus Tea with Deep Clarity; consumed by Vivify. Duration n/v.
- Spiritfont: proc from Thunder Focus Tea with Enveloping Mist (Method).
- Life Cocoon is a shield, not a damage reduction. Fortifying Brew is the main personal cooldown (conflict above).

### What makes it feel good
- Chi-Ji and Yu'lon windows where you pump Enveloping Mist and watch the cast speed change.
- Keeping Renewing Mist on three stacks, then extending it with Thunder Focus Tea.
- The Vivify proc as a reactive "save" button.

### Season 2 / Midnight changes noted
- Aug 18: +8% PvE healing; Venomous Abyss 4-set activates 33% more often (PCGamesN, Icy Veins). Icy Veins says it is unclear whether this closes the PTR gap.
- Sep 1: +5% all healing; Guile of the Monkey King 4-set proc 20% to 25% (PCGamesN).
- 12.1 PTR build (nexttier, not final): Vital Expenditure talent (Soothing Mist +300% healing for +200% mana), Gust of Mists Mastery +50%, all healing -3%, power moved from Spinning Crane Kick to Ancient Teachings.
- 12.1.5 PTR: only a class-wide Transcendence fix for Monks (judgehype, accountshark).

---

## Monk — Windwalker [monk_windwalker]
Patch/season verified: 12.1 Season 2; Method guide updated Aug 18; Sep 1 wave: +4% ability damage PvE only (PCGamesN) | Sources: https://www.method.gg/guides/windwalker-monk/playstyle-and-rotation , https://www.wowhead.com/spell=113656 , https://www.wowhead.com/spell=322109 , https://www.wowhead.com/spell=123904 , https://www.wowhead.com/spell=152175 , https://www.wowhead.com/spell=100780 , https://www.wowhead.com/spell=443028 , https://seramate.com/news/2026/06/25/windwalker-monk-121-changes-review-1f1709b6 , https://www.pcgamesn.com/world-of-warcraft/midnight-patch-notes-september-1-class-tuning
Resources: Chi and Energy. Tiger Palm costs 50 Energy and generates Chi (amount n/v). Blackout Kick, Rising Sun Kick, Fists of Fury and Spinning Crane Kick spend Chi. Method warns against capping either.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Tiger Palm | Instant | Enemy target | None | 50 Energy; generates Chi | Filler builder, grants Chi | Quick gold fist, sparks |
| Blackout Kick | Instant | Enemy target | 3 s | 3 Chi | Physical kick, Combo Breaker proc | Black-and-gold kick trail |
| Rising Sun Kick | Instant | Enemy target | CD n/v | 2 Chi + 2.5% mana | Main damage kick, reset by Blackout Kick | Golden uppercut arc |
| Fists of Fury | Channel 4 s | Enemy target | 24 s | 3 Chi | Four second flurry of hits | Rapid white-gold streaks around the monk |
| Spinning Crane Kick | Channel 1.5 s (every 0.5 s) | Self, radius | None | 2 Chi / 40 Energy | AoE channel | Circular jade arcs |
| Whirling Dragon Punch | Instant | Self, area | 35 s (Wowhead) | None | Knockback area, grants Heart of the Jade Serpent in Conduit build | Jade rising spiral, leap |
| Touch of Death | Instant | Enemy target, 5 yd | 3 min | None | Execute finisher | Black-violet palm mark |
| Invoke Xuen, the White Tiger | Instant | Summon, 40 yd | 2 min | None | 20 s tiger; +5% damage and healing for listed spells | Large orange-white tiger spirit pounding in |
| Celestial Conduit | Channel 4 s | Self | 1.5 min (Wowhead); 2 min or 1.5 min by talent (Method) | 5% mana | Conduit hero burst: damage reduction, healing, speed, interrupt immunity | Pale blue-white energy column and rings |
| Zenith | Self aura | Self | 2 min or 1.5 min (talent, Method) | n/v | Burst window; changes Spinning Crane Kick and Tiger Palm use | Gold ring stomp and light aura |
| Roll | Instant | Self | Short internal CD | None | Movement | Ground smear |
| Spear Hand Strike | Instant | Enemy target, 5 yd | 15 s | None | Interrupt, 5 s lockout | Short jab flash |

### Single-target priority (Method, Conduit build, condensed)
1. Whirling Dragon Punch if Xuen is more than 10 s away (Shado-Pan starts with it; wow.gg puts Touch of Death first)
2. Celestial Conduit when no Heart of the Jade Serpent is active
3. Zenith Stomp at low Chi or when Zenith is ending
4. Fists of Fury when Heart of the Jade Serpent is under 1 s
5. Tiger Palm if Energy needs protecting or Chi is short for Fists
6. Fists of Fury, Rushing Wind Kick, Rising Sun Kick
7. Blackout Kick on Combo Breaker or during Zenith with Obsidian Spiral
8. Spinning Crane Kick in Dance of Chi-Ji or in Zenith above 4 Chi; Tiger Palm below 2 Chi; Blackout Kick filler

Opener (Method): Tiger Palm, Xuen, Zenith (with potions, racials, trinkets), Strike of the Windlord if talented, Fists of Fury, Rising Sun Kick, then Fists or Whirling Dragon Punch.

### AoE priority (Method multi-target, condensed)
1. Fists of Fury as Heart of the Jade Serpent ends
2. Whirling Dragon Punch or Strike of the Windlord (Xuen over 10 s away)
3. Zenith Stomp, then Tiger Palm
4. Spinning Crane Kick with Unbroken Rhythm; favoured in Zenith at 5+ targets
5. Rising Sun Kick, Rushing Wind Kick, then Blackout Kick and Tiger Palm fillers

### Major cooldowns
- Invoke Xuen: 2 min, 20 s (Wowhead).
- Celestial Conduit: 1.5 min, 4 s channel (Wowhead).
- Zenith: 2 min or 1.5 min (talent). Duration n/v.
- Touch of Death: 3 min (Wowhead).
- Whirling Dragon Punch: 35 s (Wowhead). Method's Conduit list treats it as priority 1 or 2 depending on Xuen timing.

### Procs / buff loops / active mitigation
- Combo Breaker: grants a free Blackout Kick (duration n/v).
- Heart of the Jade Serpent: granted by Whirling Dragon Punch or Strike of the Windlord; governs Fists timing (duration n/v).
- Dance of Chi-Ji and Unbroken Rhythm: both enable Spinning Crane Kick. Unbroken Rhythm also affects Rushing Wind Kick.
- Defensive: Touch of Karma, 1.5 min CD, 10 s absorb (Wowhead). Fortifying Brew (shared).
- Mobility: Roll, Flying Serpent Kick, Lighter Than Air (talent), Slicing Winds (talent).

### What makes it feel good
- Chi-spend rhythm: Tiger Palm into Blackout Kick and Rising Sun Kick, with Fists as the big payoff.
- Xuen, Zenith and Conduit windows that stack on top of each other.
- Heart of the Jade Serpent timing, where Fists lands right as the buff ends.

### Season 2 / Midnight changes noted
- 12.1 PTR build (nexttier): Tiger Palm +200%, Blackout Kick +50%, auto-attacks +30%, Celestial Conduit -25% (June PTR, conflicts with Icy Veins' view that Conduit got stronger). Final values unclear.
- Method (Aug 18): Spinning Crane Kick and Jade Ignition boosted, Conduit now played more widely, small defensive gain (+5% stamina).
- Nexttier says Zenith Stomp was removed on PTR; Method's Aug 18 priority list still uses it. Method is the later source, so treat Zenith Stomp as present.
- Sep 1: +4% ability damage, PvE only (PCGamesN).
- 12.1.5 PTR: class-wide Transcendence fix only (judgehype, accountshark).

---

## Hunter — Marksmanship [archer_marksman]
Patch/season verified: 12.1 Season 2 (skill-capped build table; wow.gg guide Aug 16). 12.1.5 PTR changes (Sep 29) noted | Sources: https://wow.gg/guides/hunter-marksmanship , https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/ , https://www.wowhead.com/spell=19434 , https://www.wowhead.com/spell=212431 , https://www.wowhead.com/spell=260243 , https://www.wowhead.com/spell=53351 , https://www.wowhead.com/spell=288613 , https://www.wowhead.com/spell=257044 , https://accountshark.net/blog/wow-midnight-12-1-5-class-changes-official-patch-notes-devourer-hunter-rogue
Resources: Focus. Spell costs: Aimed Shot 35, Kill Shot 10, Explosive Shot 20. Focus generation values n/v.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Aimed Shot | 2.5 s cast | Enemy target, 40 yd | 2nd charge under Trueshot (wow.gg) | 35 Focus | Heavy single shot, main builder | Long amber aimed arrow, brief charge-up |
| Rapid Fire | Channel 2 s | Enemy target / area, 40 yd | 16 s | None | Channelled barrage, Trick Shots synergy | Rapid bright arrow flurry |
| Trueshot | Instant | Self | 2 min | None | 15 s: crit and damage up; Rapid Fire DoT can crit; faster charge recharge | Gold reticle aura |
| Volley | Instant | Ground, 8 yd radius | 45 s | None | 6 s rain of arrows (ticks every 0.5 s) | Arrow rain over an area |
| Explosive Shot | Instant | Enemy target, 40 yd | 30 s (Unstable Trigger allows a second cast within 3 s) | 20 Focus | 3 s fire DoT, ticks each second; redesigned in 12.1 | Orange burst that ticks |
| Kill Shot | Instant | Enemy target, 40 yd | n/v (execute) | 10 Focus | Execute finisher | Sharp red-flashed arrow |
| Arcane Shot | Instant | Enemy target | n/v | n/v | Precise Shots spender; no longer cleaves in 12.1 | Blue-white arrow trail |
| Steady Shot | Instant | Enemy target | n/v | Generates Focus (n/v) | Filler | Plain white arrow |
| Wailing Arrow / Black Arrow | Instant (n/v) | Enemy target | n/v | n/v | Dark Ranger hero only; burst inside Bleak Powder | Purple-black skull arrow |
| Counter Shot | Instant | Enemy target, 40 yd | 24 s | None | Interrupt, 5 s lockout | Quick arrow flash |
| Exhilaration | Instant | Self (or pet) | 2 min | None | Heals 30% of total health | Green light wash |

Mobility: no confirmed mobility spell in my sources (Disengage n/v).

### Single-target priority (wow.gg, Sentinel)
1. Explosive Shot
2. Volley
3. Trueshot
4. Moonlit Shrike if Trueshot is about to expire
5. Kill Shot (spend Precise Shots)
6. Arcane Shot (spend Precise Shots)
7. Rapid Fire
8. Aimed Shot, Moonlit Shrike, Steady Shot filler

Dark Ranger (wow.gg): Black Arrow on Precise Shots, Explosive Shot, Volley, Aimed Shot, Trueshot, Rapid Fire, Wailing Arrow, Arcane Shot, Aimed Shot, Black Arrow, Steady Shot.

### AoE priority (wow.gg, Sentinel)
1. Explosive Shot, Volley, Trueshot
2. Moonlit Shrike when Trueshot is expiring
3. Rapid Fire to keep Trick Shots up
4. Aimed Shot while Trick Shots is up
5. Moonlit Shrike, Steady Shot

### Major cooldowns
- Trueshot: 2 min CD, 15 s.
- Rapid Fire: 16 s CD, 2 s channel.
- Volley: 45 s CD, 6 s.
- Explosive Shot: 30 s CD, 3 s DoT.
- Raid-wide 30% haste for 30 s (Bloodlust-style, wow.gg). Tempered Potion in the opener.

### Procs / buff loops / active mitigation
- Trick Shots: AoE buff from Volley and Rapid Fire (duration n/v).
- Precise Shots: spent by Kill Shot, Arcane Shot, Black Arrow or Rapid Fire.
- Bullseye: stacks to 30; use the last Trueshot at that point (wow.gg).
- Unstable Firebomb (talent): Explosive Shot twice in a row.
- Lock and Load: not covered by my sources.
- Defensive: Exhilaration (heal), Survival of the Fittest (shared), Feign Death and Camouflage (wow.gg). Misdirection and Intimidation are macro utility.

### What makes it feel good
- The Explosive Shot, Volley and Trueshot opener, now with a faster explosion rhythm after the 12.1 redesign.
- Spending Precise Shots on Kill Shot and Arcane Shot as a proc loop.
- Trueshot windows tracked by Bullseye stacks.

### Season 2 / Midnight changes noted
- 12.1 (skill-capped build table, Aug 6 PTR-stage numbers): Auto Shot +756%, all ability damage +5%, Aimed Shot +20%, Rapid Fire +44%, Arcane Shot +38% (no cleave), Steady Shot +50%, Multi-Shot +73%, Volley +20%, Kill Shot +50%.
- Explosive Shot redesigned: hits each second for 3 s, damage drops past 5 targets. New talent Unstable Trigger. Headshot and Double Tap removed.
- Eagle's Accuracy: Aimed Shot +5% (was 10%), Rapid Fire +10% (was 20%).
- nexttier PTR summary says core abilities +20%; numbers conflict with skill-capped. Treat as unverified.
- 12.1.5 PTR (Sep 29): Unload removed; Blood Fletching added (Aimed Shot crits apply a bleed for 20% of damage, plus 4 s of extra bleed damage); Explosive Shot auto-target bug fixed; Dark Ranger's Umbral Reach generates Trick Shots when Bleak Powder hits exactly 2 targets.

---

## Hunter — Beast Mastery [archer_beastmaster]
Patch/season verified: 12.1 Season 2 (skill-capped build table; wow.gg guide Aug 16). Sep 1 wave: +7% class-wide damage for Hunter and pets (PCGamesN) | Sources: https://wow.gg/guides/hunter-beast-mastery , https://www.method.gg/guides/beast-mastery-hunter/playstyle-and-rotation , https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/ , https://www.wowhead.com/spell=34026 , https://www.wowhead.com/spell=217200 , https://www.wowhead.com/spell=19574 , https://www.wowhead.com/spell=193455 , https://www.pcgamesn.com/world-of-warcraft/midnight-patch-notes-september-1-class-tuning
Resources: Focus. Spell costs: Kill Command 30, Cobra Shot 35. Focus generation n/v. Pets are a second damage source; Beast Cleave is a pet-side AoE buff.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Kill Command | Instant | Enemy target, 50 yd | 2 charges (Method) | 30 Focus | Pet strike; summons next beast on Howl timer; Dark Hound adds Shadow Thrash | Pet lunge with a spectral beast leap |
| Barbed Shot | Instant | Enemy target, 40 yd | 2 charges (Method) | None | Bleed DoT for 12 s; sets up Bestial Wrath | Barbed projectile with bleeding trail |
| Bestial Wrath | Instant | Self and pets | 1.5 min CD, 15 s (Wowhead). Method says 30 s CD. Conflict | None | +20% damage for listed spells during window | Golden-red pet roar aura |
| Cobra Shot | Instant | Enemy target, 40 yd | n/v | 35 Focus | Filler and Focus dump; fires at max Cobra Fang stacks | Snake-like arrow streak |
| Wild Instincts | n/v | n/v | n/v | n/v | Used on cooldown (wow.gg). Skill-capped says removed in 12.1. Conflict | n/v |
| Black Arrow | Instant (n/v) | Enemy target | n/v | n/v | Dark Ranger: about 3x damage in Withering Fire (first 10 s of Bestial Wrath); grants Beast Cleave on 3+ targets | Black arrow with purple trail |
| Wailing Arrow | Instant (n/v) | Enemy target | Once in 15 s after Bestial Wrath | n/v | Dark Ranger: sizeable hit, cleaves, guaranteed Deathblow proc | Pale wail-shaped arrow |
| Counter Shot | Instant | Enemy target | 24 s | None | Interrupt, 5 s lockout | Quick arrow flash |
| Exhilaration | Instant | Self or pet | 2 min | None | Heals 30% of total health | Green light wash |
| Survival of the Fittest | Instant (n/v) | Self or pet | 2 charges (Method) | None | Main damage-reduction defensive | Gold shield |
| Aspect of the Turtle | Instant (n/v) | Self | n/v | None | Immunity, plus damage reduction against non-deflectable damage (Method) | Turtle shell dome |

### Single-target priority (Method, Pack Leader)
1. Barbed Shot when Bestial Wrath is coming up or Barbed is near 2 charges
2. Bestial Wrath when Barbed Shot has under 1 charge
3. Kill Command when Howl of the Pack Leader or Nature's Ally is active
4. Cobra Shot at max Cobra Fang stacks
5. Barbed Shot, then Cobra Shot filler

Dark Ranger (Method): Barbed (if BW near), BW, Black Arrow in Withering Fire, Kill Command (Nature's Ally), Wailing Arrow near end of Withering Fire, Cobra at max stacks, Black Arrow, Barbed, Cobra filler.

### AoE priority (Method, Pack Leader)
1. Wild Thrash after Bestial Wrath, or to apply Beast Cleave when inactive
2. Barbed Shot near 2 charges
3. Bestial Wrath only while Beast Cleave is active
4. Wild Thrash on cooldown
5. Kill Command (Howl or Nature's Ally), Cobra at max stacks, Barbed, Cobra filler

### Major cooldowns
- Bestial Wrath: 1.5 min / 15 s (Wowhead) or 30 s (Method). Unresolved.
- Dark Ranger Withering Fire: first 10 s of Bestial Wrath (wow.gg).
- Tempered Potion in the opener. Raid-wide 30% haste for 30 s (wow.gg).

### Procs / buff loops / active mitigation
- Howl of the Pack Leader: passive timer that summons the next beast; Kill Command uses it.
- Nature's Ally: proc that makes Kill Command ready.
- Friend of the Wild: lets Kill Command be used; hold a charge for Bestial Wrath windows.
- Cobra Fang stacks: Cobra Shot fires at 3 (Pack Leader) or 4 (Dark Ranger).
- Beast Cleave: Wild Thrash applies it; pets must stand near the target cluster (Method).
- Pet types are swappable. Tenacity is the common pick for extra HP and damage reduction (Method).

### What makes it feel good
- Pets cleaving through a pack once Beast Cleave is up.
- Barbed Shot charge management setting up Bestial Wrath.
- The Dark Ranger Bleak Powder window, a clear "burst now" moment.

### Season 2 / Midnight changes noted
- 12.1 (skill-capped, Aug 6): Auto Shot +720%, Barbed Shot +10%, Kill Command +20%, Cobra Shot +25%.
- Beast Cleave now 10 s (was 8 s), pets hit for 55% (was 40%). Cobra Senses +10% (was 35%). Serpentine Strikes crit +20% (was 50%).
- Heart of the Pack renamed Razor Sharp: pet bite, claw and smack damage +100%. Hogstrider next-Cobra bonus 100% (was 200%), lasts 1 min (was 20 s).
- Wild Instincts: skill-capped says removed; wow.gg (Aug 16) still lists it. Conflict.
- Aug 18: slight boost to the 4-set bonus (no figure). Sep 1: +7% class-wide damage (PCGamesN).
- 12.1.5 PTR: no Beast Mastery changes listed (judgehype).

---

## Demon Hunter — Havoc [demonhunter_chaos]
Patch/season verified: 12.1 Season 2 (skill-capped, Aug 6 numbers; Method guide dated Sep 17). Aug 25 wave: +3% all damage (Icy Veins snippet only). Sep 1: +4% damage (PCGamesN) | Sources: https://www.method.gg/guides/havoc-demon-hunter/playstyle-and-rotation , https://wow.gg/guides/demon-hunter-havoc , https://www.wowhead.com/spell=198013 , https://www.wowhead.com/spell=191427 , https://www.wowhead.com/spell=258860 , https://www.wowhead.com/spell=370965 , https://www.wowhead.com/spell=188499 , https://www.wowhead.com/spell=210152 , https://www.wowhead.com/spell=162794 , https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/ , https://www.pcgamesn.com/world-of-warcraft/midnight-patch-notes-september-1-class-tuning
Resources: Fury. Spell costs: Eye Beam 30, Blade Dance 35, Death Sweep 35, Chaos Strike 40. Demon Blades is the main Fury generator (Method). Immolation Aura generates Fury (20 and 8 on tooltip). Soul Fragments feed Demonic Appetite and Soul Rending. Demonsurge (Fel-Scarred) is built by Death Sweep and Annihilation. Fury cap n/v.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Eye Beam | Channel 2 s | Enemy target, 20 yd | 30 s | 30 Fury | Damage beam; Blind Fury gives Fury per second | Violet-green beam from both eyes, pulsing ticks |
| Blade Dance | Instant | Self, 8 yd AoE | 15 s | 35 Fury | Spin attack, becomes Death Sweep in demon form | Blue-violet blade arcs spinning |
| Death Sweep | Instant | Self, 8 yd AoE | 9 s | 35 Fury | Demon-form Blade Dance; builds Demonsurge (Fel-Scarred) | Larger red-violet sweep arc |
| Chaos Strike | Instant | Enemy target, 5 yd | None | 40 Fury | Main single-target spender; becomes Annihilation in demon form | Glaive slash with violet trail |
| Metamorphosis | Instant | Self, 5 yd jump | 2 min | None | Demon form; enables the demon-form spells | Wings unfurl, dark smoke flash |
| Essence Break | Instant | Self, 10 yd AoE | 40 s | None | Burst AoE pulse around you | Dark-blue shockwave ring |
| The Hunt | 1 s cast | Enemy, 50 yd | 1.5 min | None | Dash strike with a 2 s debuff; triggers Exergy (Method) | Dark purple chain trail |
| Vengeful Retreat | Instant | Self | CD n/v | None | Knockback; grants Initiative and Exergy | Quick backstep burst |
| Fel Rush | Instant | Self (movement) | Charges n/v | None | Mobility; grants First In, Last Out absorb | Green-blue dash trail |
| Immolation Aura | Instant | Self | 2 charges (Method); 6 s duration | Generates Fury | Fire aura, Fury generator | Red-orange flames around the DH |
| Blur | Instant | Self | 2 charges (Method) | None | Damage reduction and dodge window (Desperate Instincts) | Blue-violet shimmer |
| Disrupt | Instant | Enemy target, 5 yd | 15 s | None | Interrupt, 5 s lockout | Quick kick with violet flash |

Annihilation (demon-form Chaos Strike) is in the priority lists but its numbers are n/v.

### Single-target priority (Method, Aldrachi Reaver)
1. The Hunt if Reaver's Glaive is not available, otherwise Reaver's Glaive, then Essence Break
2. Vengeful Retreat paired with Eye Beam, then Eye Beam, then Death Sweep
3. Metamorphosis, then Annihilation, Blade Dance, Chaos Strike
4. Immolation Aura, then Felblade

Fel-Scarred (Method): Immolation Aura at 2 charges, Essence Break, Vengeful Retreat with Eye Beam, Eye Beam, Death Sweep, Annihilation (Demonsurge), The Hunt, Metamorphosis, Abyssal Gaze, Consuming Fire, Annihilation, Blade Dance, Chaos Strike, Felblade, Throw Glaive filler. wow.gg's older list differs on Eye Beam ordering.

### AoE priority
Method gives no separate AoE list. Immolation Aura and Death Sweep move earlier, and Metamorphosis waits for Eye Beam, Immolation Aura and Death Sweep to be on cooldown (wow.gg).

### Major cooldowns
- Metamorphosis: 2 min (Wowhead).
- Eye Beam: 30 s, 2 s channel.
- Essence Break: 40 s (Method says pressed on cooldown in 12.1 because of tier bonuses).
- The Hunt: 1.5 min, 2 s debuff.
- Darkness: group defensive, n/v.

### Procs / buff loops / active mitigation
- Initiative: granted by Vengeful Retreat; damage boost to pair with burst windows.
- Exergy: granted by Vengeful Retreat and The Hunt; demon-form damage. Method says it is played instead of Inertia.
- Inertia: alternative to Exergy, tied to Demonsurge. 12.1 changed it to +12% for 6 s (was +18% for 5 s).
- Rending Strike and Glaive Flurry (Aldrachi): change Blade Dance, Chaos Strike and Annihilation choices.
- Art of the Glaive (Aldrachi): Blade Dance +20% during demon form.
- Blur (two charges, 35% damage reduction for 10 s with Desperate Instincts, Method).
- Demon Muzzle: passive magic damage reduction when Disrupt can interrupt.

### What makes it feel good
- Eye Beam and Vengeful Retreat synced, so the Initiative burst lands in the Eye Beam window.
- Death Sweep and Annihilation stacking Demonsurge, then the demon-form payoff.
- Essence Break as a hard, short burst button.

### Season 2 / Midnight changes noted
- 12.1 (skill-capped): daggers now allowed; Blade Dance, Death Sweep, Chaos Strike and Annihilation +6%; The Hunt +12%; Immolation Aura -8%; Essence Break initial damage +49%.
- Burning Hatred: Immolation Aura grants 30 Fury (was 40). Demon Blades 10-16 Fury (was 8-15). Blind Fury 10/20 Fury per second (was 15/30).
- Trail of Ruin hits immediately. Serrated Glaive is a 12 s self buff (was a 15 s enemy debuff). New talent Never Say Die. Dash of Chaos removed.
- Aug 25: +3% all damage (Icy Veins snippet). Sep 1: +4% damage (PCGamesN).
- 12.1.5 PTR: no Havoc changes listed (judgehype, accountshark).

---

## Demon Hunter — Vengeance [demonhunter_vengeance]
Patch/season verified: 12.1 Season 2 (Method guide updated Aug 27; wow.gg Aug 16). Aug 25 wave: Fel Blood effectiveness +24% (Icy Veins snippet). Sep 1: Demonic Wards 12% to 15%, Void Reaver Frailty 5% to 6%, Fel Devastation healing +25% (PCGamesN) | Sources: https://www.method.gg/guides/vengeance-demon-hunter/playstyle-and-rotation , https://wow.gg/guides/demon-hunter-vengeance , https://www.wowhead.com/spell=263642 , https://www.wowhead.com/spell=228477 , https://www.wowhead.com/spell=212084 , https://www.wowhead.com/spell=204021 , https://www.wowhead.com/spell=187827 , https://www.wowhead.com/spell=203720 , https://seramate.com/news/2026/06/28/vengeance-dh-121-ptr-changes-1f17335b , https://www.pcgamesn.com/world-of-warcraft/midnight-patch-notes-september-1-class-tuning
Resources: Fury and Soul Fragments. Fracture generates 25 Fury (tooltip) and Soul Fragments. Immolation Aura generates Fury. Shear generates 10 Fury. Soul Cleave costs 35 Fury (tooltip). **Conflict:** Method (Aug 27) says Spirit Bomb spends at 6 Soul Fragments and Soul Cleave at 3, while the Wowhead tooltip lists Spirit Bomb at 40 Fury. Treat the spender resource as unverified and check in-game.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Fracture | Instant | Enemy target, 5 yd | 2 charges (Method) | Generates 25 Fury and Soul Fragments | Two-hit builder; needs main-hand and off-hand weapons | Twin crossing glaive slashes |
| Shear | Instant | Enemy target, 5 yd | None | Generates 10 Fury | Basic builder | Single fast slash |
| Soul Cleave | Instant | Enemy target | None | 35 Fury (tooltip); 3 souls (Method) | Heal plus damage spender; empowered by Reaver's Glaive | Blue-violet cleave with heal glow |
| Spirit Bomb | Instant | Self, area | 25 s (tooltip) | 40 Fury (tooltip); 6 souls (Method). Conflict | Area spender | Dark soul orb bursting |
| Immolation Aura | Instant | Self | 1.5 s internal; 2 charges (Method) | Generates Fury (20 and 8 on tooltip) | 6 s fire aura | Red-orange flames around the DH |
| Sigil of Flame | Instant | Ground, 30 yd | n/v | None | Placed fire zone, 2 s | Orange glyph on the ground |
| Fel Devastation | Channel 2 s | Self, 20 yd | 40 s | 50 Fury | Channel burst, slows you, immune to interrupts while channelling | Green-violet pulsing burst |
| Soul Carver | Instant | Enemy target, 5 yd | 1 min | None | Fire damage with a 3 s DoT | Dark flame slash |
| Fiery Brand | Instant | Enemy target, 30 yd | 2 charges (Method); CD n/v | None | Debuff that boosts damage taken by the target; defensive value too | Orange-red brand mark |
| Metamorphosis | Instant | Self | CD n/v (tooltip shows 1 s internal) | None | 15 s form: +40% max HP, leech and versatility, +20% damage from Fracture, Soul Cleave, Spirit Bomb | Wings unfurl, purple-red flash |
| Demon Spikes | Instant | Self | 1.5 s internal; charges n/v | None | Physical damage reduction (Method calls it pure defence) | Dark spikes around the DH |
| Infernal Strike | Instant | Ground, 30 yd | 1 s internal; charges n/v | None | Leap to target area | Fiery jump trail |

Disrupt for interrupts (15 s, 5 s lockout).

### Single-target priority (Method, Aldrachi Reaver)
1. Reaver's Glaive when no empowered spells are available
2. Sigil of Spite if talented
3. Fiery Brand when about to reach 2 charges
4. Empowered Fracture (Reaver's Glaive first), then empowered Soul Cleave
5. Soul Carver, Immolation Aura, Fracture near 2 charges
6. Spirit Bomb (6 souls), Soul Cleave (3 souls)
7. Fel Devastation, Sigil of Flame, Fracture, Felblade
8. Soul Cleave at 2 or fewer souls as filler; Throw Glaive last

Annihilator (Method): Fiery Brand (3 Voidfall stacks with Metamorphosis ready), Metamorphosis at 0-1 Voidfall, Spirit Bomb (6 souls), Soul Cleave (3 souls), Fracture, Immolation Aura, Soul Carver, Sigil of Spite, Fel Devastation, Sigil of Flame, Felblade, Throw Glaive.

Timing rules (Method): Fel Devastation when Fiery Brand has more than 2 s left; Soul Carver when it has more than 3 s left.

### AoE priority
Method says the rotation "stays relatively fixed" with target count. Immolation Aura is cast in the opener. Fallout (talent) generates Soul Fragments in AoE (wow.gg).

### Major cooldowns
- Fiery Brand: 2 charges (CD n/v).
- Metamorphosis: 15 s duration (tooltip). CD n/v. Method uses it as a defensive and offensive cooldown.
- Soul Carver: 1 min, 3 s.
- Fel Devastation: 40 s, 2 s channel.

### Procs / buff loops / active mitigation
- Art of the Glaive: Reaver's Glaive and Sigil of Spite empower Fracture and Soul Cleave.
- Demonsurge: stack gating for Metamorphosis, Spirit Bomb and Soul Cleave timing (wow.gg).
- Untethered Rage (talent): consuming souls can trigger a second Metamorphosis charge lasting 10 s (Method).
- Demon Spikes with Feed the Demon: near 100% uptime (Method).
- Active mitigation: Demon Spikes, Fiery Brand, Metamorphosis, Demonic Wards (15% after Sep 1). Soul Barrier, Painbringer, Bulk Extraction not covered.

### What makes it feel good
- Fiery Brand plus Soul Carver plus Fel Devastation stacked in one timed window.
- Hitting exactly 6 souls for Spirit Bomb (if the soul resource holds) as a clear payoff.
- Demon Spikes keeping the DH alive while the rotation runs.

### Season 2 / Midnight changes noted
- 12.1 PTR build (nexttier, not final): Soul Cleave and Fel Devastation +25%; Frailty 8% to 10%; Feast of Souls +25%; Fracture and Soul Cleave require a weapon.
- Aug 25: Fel Blood effectiveness +24% (Icy Veins snippet). Sep 1: Demonic Wards 12% to 15%; Void Reaver Frailty 5% to 6%; Fel Devastation healing +25% (PCGamesN).
- 2-set PTR (Seramate, unverified): Sigil of Flame DoT +50%; Soul Cleave extends Sigil of Flame by 2 s. 4-set: Immolation Aura and Sigil of Spite deal 100% more damage to Sigil targets.
- 12.1.5 PTR: no Vengeance changes listed (judgehype).

---

### Note: Devourer (new Midnight Demon Hunter spec, not in the requested list)
- **Role and range:** Intellect-based caster. wow.gg calls it melee/mid-range with two warglaives. Timesaver and Blizzard's reveal say most abilities are capped at 25 yd. Sources disagree; treat as mid-range.
- **Core loop:** Consume (2 s cast, can move) builds Fury and Soul Fragments. Reap (instant, 25 yd, 8 s CD) pulls souls. Void Ray (3 s channel) costs 100 Fury outside Void Metamorphosis. Void Metamorphosis has no fixed CD or duration; it drains Fury while active. Void Ray is free inside it on a 14 s CD (wow.gg).
- **Collapsing Star:** 2.5 s cast, 25 yd, only inside Void Metamorphosis, costs 30 souls, pauses the Fury drain (Blizzard preview snippet, Method).
- **Entry:** 50 souls, or 35 with Soul Glutton (Icy Veins/Blizzard snippets). Method's page does not state the threshold.
- **Defensives and utility:** Blur (10 s, 1 min CD, wow.gg), Darkness (group defensive, n/v), Disrupt, Void Nova (stun 3 s, 45 s CD), Shift (30 yd reposition, 20 s CD).
- **Season 2:** Aug 18 - 4-set now gives 2 soul fragments (was 8), Reap bonus 10% (was 20%), all ability damage +14% PvE. 12.1 numbers conflict: skill-capped says +32% all ability damage, nexttier says +20%. Monster Within bonus in Void Metamorphosis cut 66%, Void Ray in form +40% (was 67%), Consume +60%.
- **12.1.5 PTR:** Collapsing Star reworked (no 5 s lockout on cancel, extra range once casting, Fury slow limited to about 1.5 casts). Void-Scarred reworked around casting Collapsing Star (accountshark).

---

## Evoker — Devastation [evoker_devastation]
Patch/season verified: 12.1 Season 2 (Method guide Aug 25; wow.gg Aug 16; skill-capped Aug 6 12.1 table). 12.1.5: no Devastation changes listed | Sources: https://www.method.gg/guides/devastation-evoker/playstyle-and-rotation , https://wow.gg/guides/evoker-devastation , https://www.wowhead.com/spell=375087 , https://www.wowhead.com/spell=359073 , https://www.wowhead.com/spell=357208 , https://www.wowhead.com/spell=356995 , https://www.wowhead.com/spell=357211 , https://www.wowhead.com/spell=358267 , https://www.wowhead.com/spell=370553 , https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/
Resources: Essence. Disintegrate and Pyre cost 3 Essence each (tooltip). Essence generation rates n/v. Burnout (from Living Flame) and Leaping Flames (spent by Living Flame) gate Living Flame use in AoE (wow.gg).

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Eternity Surge | Empowered (rank 1 in openers; tooltip shows 2.5 s channel field). Conflict | Ground/enemy point, 25 yd | 30 s | None | Scaling burst; rank matched to target count in AoE | Wide blue-gold dragon breath beam |
| Fire Breath | Empowered (rank 1 used; tooltip shows 2.5 s channel). Conflict | Self cone | 2 charges (Method); Flameshaper adds one | 1.8% mana | Fire DoT breath; generates Essence Burst and Leaping Flames | Orange fire breath cone |
| Dragonrage | Instant | Self | 2 min | None | 18 s buff; enables Unbound Flame after the buff | Large golden dragon aura with wings |
| Deep Breath | Instant | Self, flight | 2 charges (wow.gg); tooltip shows 1 s internal | None | 6 s flight; Stretch Time suspends damage 10 s after landing (Method) | Wings flare, long dive |
| Disintegrate | Channel 3 s | Enemy target, 25 yd | None | 3 Essence | Main Essence spender; Mass Disintegrate in Scalecommander | Blue beam with spiral ticks |
| Pyre | Instant | Enemy target / area, 25 yd | None | 3 Essence | AoE spender at 4+ stacked targets (Method) | Orange fire orb with burst |
| Living Flame | 2 s cast (tooltip) | Enemy or ally, 25 yd | None | 12% mana | Filler; Burnout synergy | Flame ball flying out |
| Azure Strike | Instant | Enemy target | None | None | Filler when Hover is down or while moving | Short blue slash |
| Hover | Instant | Self | 1 s internal; limited charges (n/v) | None | 6 s: +30% run speed, can cast while moving | Blue wing shimmer, hover trail |
| Tip the Scales | Instant | Self | 2 min | None | Makes the next empowered spell instant (Maxroll) | Gold scale glow |
| Obsidian Scales | Instant | Self | 12 s, 2 charges (Preservation page) | None | 30% damage reduction (Method Preservation page) | Black-gold scale shell |
| Quell | Instant | Enemy target | n/v | None | Interrupt (macro in wow.gg) | Quick sweep |

Zephyr (party AoE damage reduction, about 20% per wow.gg, CD n/v) is the group defensive.

### Single-target priority (Method)
1. Deep Breath on cooldown
2. Dragonrage
3. Fire Breath (rank 1) on cooldown
4. Eternity Surge (rank 1) on cooldown
5. Disintegrate, chaining Essence Burst
6. Unbound Flame as filler after Dragonrage if Essence Burst is needed
7. Second Fire Breath charge (Flameshaper), avoiding two charges at once
8. Azure Sweep on proc; otherwise Living Flame, or Azure Strike while moving

Scalecommander (wow.gg): Deep Breath, Fire Breath (rank 1), Eternity Surge, Azure Sweep, Living Flame, Azure Strike when Hover is down.

### AoE priority (Method)
1. Same opening list as single target
2. Disintegrate on up to 3 targets; Pyre at 4+ stacked enemies
3. Living Flame on 1-2 targets, Azure Strike at 3+
4. Scalecommander: Mass Disintegrate (x2 on separate targets) first, Pyre weave for Charged Blast
5. Flameshaper: Living Flame, Deep Breath, Dragonrage, Fire Breath, Tip the Scales, Eternity Surge, Pyre x2, Fire Breath, Pyre

### Major cooldowns
- Dragonrage: 2 min CD, 18 s.
- Eternity Surge: 30 s CD.
- Deep Breath: 2 charges (wow.gg). Stretch Time window 10 s.
- Tip the Scales: 2 min.
- Obsidian Scales: 12 s, 30% reduction.

### Procs / buff loops / active mitigation
- Essence Burst: from Fire Breath and Azure Sweep in the Scalecommander opener (wow.gg). Duration n/v.
- Burnout: from Living Flame; enables Living Flame in AoE.
- Imminent Destruction: two charges gate the second Deep Breath (7-8 s return, wow.gg).
- Mass Disintegrate: triggered by Disintegrate after empowered spells.
- Charged Blast: triggered by weaving Pyre between Mass Disintegrate casts (Method).
- Iridescence: Blue: damage stacks after Eternity Surge. Duration n/v.
- Unbound Flame: 12.1 Apex Rising Fury now lets it be cast up to 4 times after Dragonrage.

### What makes it feel good
- Dragonrage plus Deep Breath stacked into one burst window.
- Chaining Disintegrate on Essence Burst procs.
- Scalecommander's Mass Disintegrate doubling.

### Season 2 / Midnight changes noted
- 12.1 (skill-capped): Deep Breath +30%, Pyre +10%, Disintegrate +40%, Living Flame damage +50% and healing +25%, Verdant Embrace and Emerald Blossom healing +25%.
- Wingleader: Deep Breath cooldown reduction is 1 s per target (was 0.5 s); Command Squadron Pyre +40%; Maneuverability DoT +40%.
- Apex Rising Fury reworked into Unbound Flame (up to 4 casts after Dragonrage). Risen Fury removed.
- Twin Flame damage and healing -20%. Permeating Chill slow 30% (was 50%) in PvP.
- An Icy Veins headline says Devastation was nerfed in a later pass. I could not open it, so the numbers are unverified.
- 12.1.5 PTR: no Devastation changes (judgehype, accountshark).

---

## Evoker — Preservation [evoker_preservation]
Patch/season verified: 12.1 Season 2 (Method guide Aug 20; wow.gg Aug 16; skill-capped Aug 6). 12.1.5 PTR changes (Sep 29) noted | Sources: https://www.method.gg/guides/preservation-evoker/playstyle-and-rotation , https://wow.gg/guides/evoker-preservation , https://www.wowhead.com/spell=355936 , https://www.wowhead.com/spell=366155 , https://www.wowhead.com/spell=373861 , https://www.wowhead.com/spell=370960 , https://www.wowhead.com/spell=363534 , https://accountshark.net/blog/wow-midnight-12-1-5-class-changes-official-patch-notes-devourer-hunter-rogue , https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/
Resources: Essence and Mana. Essence spenders: Echo, Emerald Blossom, Disintegrate. Essence Burst makes the next spender free; sources are Reversion (15% chance) and Living Flame (20% chance). Emerald Blossom costs more mana, so it gets the most value from Essence Burst. Disintegrate restores mana with Energy Loop.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Dream Breath | Channel 2.5 s (tooltip); empower at rank 1 (Method). Conflict | Frontal cone | Tooltip 1 s internal; Spiritual Clarity cuts CD by 6 s (skill-capped) | 4.9% mana | Area heal; 12.1 cut instant healing 50%, raised periodic healing 118% | Green-gold breath cone with drifting motes |
| Reversion | Instant | Ally, 30 yd | None | 2.2% mana | 12 s HoT plus absorb and heal bonus; 15% Essence Burst chance | Golden spiral over the ally |
| Echo | Next-heal buff | Ally | n/v | None | Duplicates the next heal on the target | Faint ghost image |
| Emerald Blossom | Instant (n/v) | Group area | n/v | Mana-heavy | Group heal; activates Twin Echoes | Green flower bloom |
| Verdant Embrace | Instant (n/v) | Ally | n/v | n/v | Direct heal; applies Lifebind (8 s, 60% of your healing to target); moves you to the ally | Green vine dash |
| Living Flame | 2 s cast (tooltip) | Enemy or ally, 25 yd | None | 12% mana | Filler; 20% Essence Burst chance | Orange flame ball |
| Temporal Anomaly | 1.5 s cast (tooltip) | Self area, two triggers | 15 s | 7.5% mana | Weaker Echo (about 50%) on several allies for 4 s | Gold clock ring |
| Rewind | Instant | Self area, 40 yd | CD n/v | 5.5% mana | Heal from the last 5 s of damage; 3x in M+ (Method) | Gold time-reversal swirl |
| Emerald Communion | Channel 5 s | Self | 3 min | None | Mana regen and periodic self heal; applies pacify and silence | Green channel glow |
| Dream Flight | Flight (n/v) | Line | n/v | n/v | Heals allies passed; absorbs damage while flying | Light trail |
| Stasis | Instant | Self | n/v | None | Stores up to 3 spells for release within 30 s; released copies cost no mana | Frozen blue-gold crystal |
| Time Dilation | Instant (n/v) | Ally | n/v; second charge via Just In Time | n/v | Major external on an ally (Method) | Sand glyph around the ally |

Obsidian Scales (12 s, 30% damage reduction, 2 charges, Method Preservation page) is the personal defensive; Zephyr and Time Dilation cover groups.

### Single-target priority (Method)
1. Keep double Reversion up (Echo to Reversion is the default opener)
2. Echo, then Verdant Embrace for direct healing
3. Merithra's Blessing proc, especially after large hits
4. Living Flame as filler
5. Time Dilation on dangerous hits, often the tank

### Raid priority (Method, Flameshaper)
1. Keep Reversion coverage; cast Dream Breath and Temporal Anomaly as often as possible
2. Build Echo ramps before damage; cash out with Merithra's Blessing
3. Fire Breath at max rank on cooldown
4. If no Merithra's proc: Dream Breath, then Reversion, then Verdant Embrace
5. Essence Burst goes to Emerald Blossom, unless two Twin Echo charges are up (then Echo)

### Major cooldowns
- Emerald Communion: 3 min, 5 s channel.
- Stasis: 30 s release window.
- Rewind: 5 s lookback; CD n/v.
- Tip the Scales: 2 min (Wowhead) or 90 s in the Chronowarden build (Method). Conflict.

### Procs / buff loops / active mitigation
- Essence Burst (above).
- Lifebind: 8 s; sends 60% of your personal healing to the Verdant Embrace target.
- Reversion: Grace Period gives +21% healing with two Reversions up; Golden Hour gives reactive healing from recent damage.
- Echo and Twin Echoes: Emerald Blossom activates Twin Echoes; the next Echo applies two (stacks to 2).
- Merithra's Blessing: heals the target, then bounces up to 4 times to the lowest-health allies. Proc from Dream Breath.

### What makes it feel good
- Double Reversion plus Echo ramp, then a Merithra's Blessing bounce that catches the damage spike.
- Stasis storing three spells for a timed release.
- Time Dilation as an emergency save on the tank.

### Season 2 / Midnight changes noted
- 12.1 (skill-capped): Dream Breath instant healing -50%, periodic +118%. Merithra's Blessing reworked; the Dream Breath bonus changed to +60% (was 250%, instant only). Temporal Barrier absorb +30%. Inner Flame periodic +50% (was 60%).
- Flameshaper: Consume Flame heals 240% (was 200%); Expanded Lungs Dream Breath +20% (was 30%); Conduit of Flame crit +10% (was 15%); Fulminous Roar 15% (was 20%).
- Panacea healing +25%. Twin Flame -20%. Permeating Chill slow 30% (was 50%) in PvP.
- 12.1.5 PTR (Sep 29): Merithra's Blessing duration cut from 1 min to 30 s (accountshark). Consume Flame no longer double-dips healing increases. Flameshaper Consume Flame healing +20%.

---

## Evoker — Augmentation [evoker_augmentation]
Patch/season verified: 12.1 Season 2 (Method guide Aug 25; Maxroll Mythic+ guide dated Aug 11; wow.gg Aug 16). 12.1.5 PTR changes noted | Sources: https://www.method.gg/guides/augmentation-evoker/playstyle-and-rotation , https://maxroll.gg/wow/class-guides/augmentation-evoker-mythic-plus-guide , https://wow.gg/guides/evoker-augmentation , https://www.wowhead.com/spell=395152 , https://www.wowhead.com/spell=409311 , https://www.wowhead.com/spell=403631 , https://www.wowhead.com/spell=396286 , https://www.wowhead.com/spell=395160 , https://www.wowhead.com/spell=370553 , https://www.icy-veins.com/wow/augmentation-evoker-buffs (search snippet), https://wowcarry.com/blog/wow/augmentation-evoker-new-buff-spec (Dragonflight-era, used only for attribution background)
Resources: Essence. Eruption costs 3 Essence and is free with Essence Burst (tooltip). Prescience has a chance to grant Essence Burst (Anachronism, Maxroll). Imminent Destruction cuts the next six Eruptions by 1 during Breath of Eons (Maxroll). Maxroll says Energy Cycles was removed in 12.0.5 but still lists it, so treat Essence Burst sources as partly unverified.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Ebon Might | 1.5 s cast (tooltip) | Self-cast; buffs every damage-dealing ally in range | 30 s CD, 10 s duration (tooltip) | 1% mana | +8% primary stat to allies (was 5% in 12.0); recast about 4-5.5 s before it ends; Eruption extends it | Gold-green energy wings spreading over allies |
| Prescience | Instant (tooltip) | Ally, 25 yd | 2 charges (Icy Veins, Maxroll); base CD n/v | None | Damage buff on an ally that you aim by hand; Golden Opportunity +15% duration (Maxroll) | Blue-gold rune ribbon on the ally |
| Breath of Eons | Instant (tooltip) | Enemy or ground point, 15-50 yd; steerable with Maneuverability | 2 min (tooltip) | None | Places a Temporal Wound debuff (about 10 s); banks ally damage and releases it as a burst at the end | Bronze-gold time wave |
| Upheaval | Empowered (wow.gg, Method). Tooltip shows 2.5 s channel. Conflict | Ground/enemy point, 25 yd | 40 s (tooltip); Midnight 2-set -10 s (Maxroll) | None | AoE damage around the point; Duplicate's copy no longer knocks enemies airborne (12.1) | Gold-brown earth shockwave |
| Fire Breath | Empowered (rank 1 usually) | Self cone | n/v | 1.8% mana | Fire breath damage | Orange breath cone |
| Eruption | 2.5 s cast (tooltip) | Enemy target, 25 yd; 8 yd area | None | 3 Essence (free with Essence Burst) | Fire and Nature AoE; extends Ebon Might | Gold-green burst |
| Tip the Scales | Instant | Self | 2 min (tooltip); Chronoboon -30 s (Maxroll) | None | Next empowered spell is instant (Maxroll) | Gold scale glow |
| Time Skip | Channel (Maxroll) | Self or ally | n/v | None | Speeds up cooldown recovery; tank defensive (Maxroll) | Gold hourglass |
| Deep Breath | Instant | Self, flight | 1 s internal (tooltip) | None | Flight; Stretch Time (Scalecommander) | Wings |
| Hover | Instant | Self | 1 s internal; charges n/v | None | +30% run speed; cast while moving | Blue wing shimmer |
| Living Flame | 2 s cast (tooltip) | Enemy or ally, 25 yd | None | 12% mana | Filler; builds Essence (Method) | Orange flame ball |
| Chrono Flame | n/v | Enemy | n/v | None | Chronowarden filler | Gold-blue flame |

### Single-target priority (Maxroll, Chronowarden)
1. Ebon Might, recast at 5.5 s or less remaining
2. Prescience with 2 charges
3. Breath of Eons
4. Fire Breath (rank 1)
5. Eruption with 2 Essence Burst stacks
6. Upheaval (rank 1), using Tip the Scales when available
7. Eruption when Essence is capped
8. Prescience with 1 charge, then Eruption, then Chrono Flame

Scalecommander (Maxroll): identical except the filler is Living Flame. Method's opener is Ebon Might, Breath of Eons, Fire Breath with Tip the Scales, then Upheaval; Method refreshes Ebon Might at about 4 s.

### AoE priority
Maxroll and Method give the same list for AoE. Method's opener "doesn't change" with more targets. Upheaval is ranked up so every enemy is inside its radius.

### Major cooldowns
- Breath of Eons: 2 min.
- Ebon Might: 30 s CD, 10 s duration.
- Tip the Scales: 2 min.
- Upheaval: 40 s.
- Prescience: 2 charges.

### How the buffs work, and how the damage is credited

**Ebon Might (the core buff).** A self-cast that buffs every damage-dealing ally in range. Midnight widened coverage to all DPS within 100 yd (Maxroll's 12.0 notes; the tooltip's radius field reads 500 yd, so the two disagree). Stat bonus is 8% primary stat. Recast it when 4-5.5 s remain (sources differ). Eruption extends it. It cannot be cancelled by aura removal (12.0.1, Maxroll). The bonus value shrinks when Ebon Might covers more than two other allies (Maxroll).

**Prescience.** A targeted buff on one ally, 25 yd, with 2 charges. Each Augmentation can hold one, so the practical cap is two at once (Icy Veins snippet). In raids it is the one buff you still aim by hand, because Ebon Might covers everyone.

**Breath of Eons.** Drops a Temporal Wound debuff on enemies it hits for about 10 s. During that time it banks damage that Ebon Might-buffed allies deal. When the debuff ends, the banked total detonates as burst. Icy Veins says the banked share is 15% of ally damage. Maxroll says 15% of damage taken by the target. Wording conflicts; the 15% figure is consistent. Maneuverability lets you steer and aim it.

**Duplicate (Apex talent).** Breath summons a 20 s copy that casts Eruption, Fire Breath and Upheaval on its own (Overgear snippet). Sources disagree whether the copy's Eruption extends your own Ebon Might (BoostMatch says no; Overgear suggests yes).

**Damage attribution.** Ebon Might's extra damage is recorded as the damage of the ally who dealt it, so default meters (Details, Recount) show it on the warriors, mages and hunters, not on the Evoker. Default meters credit the Evoker only for its own casts (Eruption, Upheaval, Breath detonations). Warcraft Logs has buff-attribution tracking that aims to credit the Evoker. This came from a Dragonflight-era article and I could not confirm it for Midnight. Prescience can be estimated but not measured perfectly (2023 forum post, unofficial).

### Procs / buff loops / active mitigation
- Essence Burst: from Prescience (Anachronism chance) and talents; makes Eruption free.
- Ebon Might refresh and Eruption extension form the main loop.
- Time Skip: tank defensive. Ebon Might group shields are a defensive side effect (Maxroll).
- Interrupt: Quell (macro in wow.gg).

### What makes it feel good
- Breath of Eons timed with allies' burst cooldowns, then the detonation as a clear payoff.
- Ebon Might recast timing and Prescience handoffs as the rhythm.
- Eruption extending Ebon Might when Essence is free.

### Season 2 / Midnight changes noted
- 12.1: all ability and pet damage +3%. Living Flame, Verdant Embrace, Emerald Blossom, Defy Fate and Molten Blood healing +25%; Panacea +25% (skill-capped).
- Duplicate's Upheaval no longer knocks enemies airborne. Season 1 2-set bonus no longer extends Ebon Might via Eruption.
- Wingleader: Breath of Eons cooldown reduction 1.5 s per target (was 1 s). Double-time stat buff lasts 15 s.
- PvP: Perilous Fate slow 50% (was 70%); Dreamwalker's Embrace slow 30% (was 50%).
- 12.1.5 PTR (Sep 29): Chronowarden Temporality and Temporal Burst durations scale with Mastery: Timewalker. Scalecommander Melt Armor damage +100% (judgehype, accountshark).
- Breath of Eons stored damage was 10% at 12.0 and is 15% now (Maxroll).

---

## Source-conflict summary (most important)
- Bestial Wrath CD: 1.5 min (Wowhead) vs 30 s (Method).
- Vengeance Spirit Bomb and Soul Cleave resource: Fury (Wowhead tooltips) vs Soul Fragments (Method, Aug 27).
- Devourer total ability damage bonus: +32% (skill-capped) vs +20% (nexttier) vs +14% (Aug 18 wave, after the earlier bump).
- Fortifying Brew on Mistweaver: 6 min (Wowhead) vs 2 min (Method Mistweaver page).
- Tip the Scales on Preservation: 2 min (Wowhead) vs 90 s (Method Chronowarden).
- Fire Breath, Eternity Surge, Upheaval, Dream Breath cast type: empowered (guides) vs channel field (Wowhead tooltips). Use the in-game tooltip.
- Wild Instincts: removed (skill-capped) vs still listed (wow.gg).
- Zenith Stomp: removed on PTR (nexttier) vs present in Aug 18 priority list (Method). Treat as present.
