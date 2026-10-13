# WoW Midnight (Patch 12.1, Season 2): caster and rogue class reference

Research snapshot: 2026-10-13. Written for EFSUN ONLINE class design (hit feel, combos, one-button play). Not a player guide.

**Legend and source rules**
- Rotation logic and priorities: Method's 12.1 guides (dated Aug to Sep 2026). Method's pages are the best-dated source found.
- Cast time, cooldown, cost, and hotfix history: Warcraft Wiki spell pages (edits up to 12 Oct 2026). Some Wiki text is pre-12.1; where so, I say so.
- Season 2 tuning numbers: PCGamesN (16 Aug 2026 article) and Skill-Capped (12.1 notes).
- Icy Veins, Maxroll, and the Wowhead guide bodies were blocked (403, 404, or nav-only), so no numbers come from them.
- **Visual column is my own description** of each spell's long-standing in-game look. None of the sources describe visuals. Treat as a starting point. `(?)` marks Midnight-new spells, conflicts, or spells I am least sure of.

## Midnight: general combat changes relevant to class design

- **Current season:** Patch 12.1 "Curse of Ula'tek" (12.1.0 on 11 Aug 2026) is Midnight Season 2, which started about 18 to 19 Aug 2026 (sources differ by a day). Hotfixes run into late Sep 2026. 12.1.5 is on PTR only (Wiki, Shadow Blades page). One secondary source says patch 12.2 / Season 3 arrives early 2027. Sources: https://www.playnews.gg/en/guides/wow-midnight-patch-12-1-season-2-class-changes-25-hp-and-trimmed-burst , https://www.pcgamesn.com/world-of-warcraft/midnight-season-2-class-tuning-patch-notes , https://warcraft.wiki.gg/wiki/Shadow_Blades
- **Baseline HP and damage:** Max-level health and creature damage both rose 25% in 12.1. This is a flat scalar, not a class change. Source: https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/
- **Season 2 tuning wave (live 18 Aug 2026):** Blizzard cut one set bonus or one spell and added a flat % to all of that class's abilities as compensation (e.g. Arcane +3% after cutting its 2-piece). Scope (PvE vs PvP) is unstated for most. Discipline PvE output -30%, Atonement transfer 32% to 46%. Assassination +4%, Subtlety +6% with its 4-piece cut to 60%. A second batch was announced for 25 Aug (headline only). Source: https://www.pcgamesn.com/world-of-warcraft/midnight-season-2-class-tuning-patch-notes
- **Secret values (Patch 12.0.0, 20 Jan 2026):** Combat data reaches addons as opaque "secret" values. Addons can store, pass, concatenate, and display them, but cannot do arithmetic, comparisons, or table keys on them. Restrictions depend on game state: combat, encounters, M+ challenge mode, PvP, and some instances. Open-world scope is unclear. Source: https://warcraft.wiki.gg/wiki/Secret_Values
- **Blizzard's stated goal** (pre-launch interview, quoted via a news article): everyone enters combat with the same tools, and complicated addon setups were a barrier to entry. Source: https://www.invenglobal.com/articles/20392/world-of-warcraft-midnight-addon-restrictions-fail-as-top-rwf-guilds-keep-using-raid-addons
- **Alpha walk-back (Oct 2025):** Combat-chat and log limits were too broad (they broke loot council, timers, and note-sharing). Blizzard narrowed them to active raid encounters and M+ runs only. Source: https://www.warcrafttavern.com/wow/news/blizzard-walks-back-some-api-changes-for-addons-in-midnight/
- **Effect on addons:** WeakAuras shipped no Midnight version. Top raid guilds wrote their own assignment addons and used them on broadcast; the same article reports no Blizzard action. Source: the InvenGlobal link above.
- **Native tools instead:** The in-game Cooldown Manager tracks cooldowns and buffs (Wiki notes 12.1 items being added as tracked buffs). The Single-Button Assistant / One-Button Rotation (added 11.1.7, June 2025) auto-casts the next rotation spell; its GCD is 25% longer, and an "Assisted Highlight" option only suggests. A 4 Mar 2026 hotfix fixed Arcane Surge being used in the assisted rotation, so the assist covers Midnight specs. Sources: https://warcraft.wiki.gg/wiki/One-Button_Rotation , https://warcraft.wiki.gg/wiki/Arcane_Surge
- **Ability pruning:** Symbols of Death removed (12.0.0, Subtlety). Phoenix Flames removed (Fire). Malefic Rapture not in the 12.1 Affliction rotation. Touch of the Archmage removed (Arcane). Blink replaced by Shimmer (30 s, no charges). Several "slot replacement" moves: Fireball, Glacial Spike, and Arcane Blast each replace Frostbolt in their spec; Ice Lance and Arcane Barrage replace Fire Blast. Sources: https://www.method.gg/guides/fire-mage/playstyle-and-rotation , https://www.method.gg/guides/affliction-warlock/playstyle-and-rotation , https://warcraft.wiki.gg/wiki/Symbols_of_Death , https://warcraft.wiki.gg/wiki/Shimmer
- **Hero talents** (change the core rotation): Arcane = Sunfury / Spellslinger. Fire = Sunfury (recommended) / Frostfire. Frost = Frostfire / Spellslinger. Assassination = Deathstalker (recommended) / Fatebound. Subtlety = Deathstalker (recommended) / Trickster. Affliction = Hellcaller / Soul Harvester. Destruction = Hellcaller / Diabolist. Discipline = Oracle / Voidweaver. Sources: the Method talents and playstyle pages below.

---

## Mage — Arcane [mage_arcane]
Patch/season verified: 12.1 Season 2. Method guide updated 13 Sep 2026; Wiki spell pages to 12 Oct 2026 | Sources: https://www.method.gg/guides/arcane-mage/playstyle-and-rotation , https://www.method.gg/guides/arcane-mage/talents , https://www.pcgamesn.com/world-of-warcraft/midnight-season-2-class-tuning-patch-notes , https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/ , https://warcraft.wiki.gg/wiki/Arcane_Missiles , https://warcraft.wiki.gg/wiki/Arcane_Barrage , https://warcraft.wiki.gg/wiki/Arcane_Orb , https://warcraft.wiki.gg/wiki/Arcane_Surge , https://warcraft.wiki.gg/wiki/Touch_of_the_Magi , https://warcraft.wiki.gg/wiki/Prismatic_Bolt , https://warcraft.wiki.gg/wiki/Shimmer , https://warcraft.wiki.gg/wiki/Counterspell , https://warcraft.wiki.gg/wiki/Prismatic_Barrier

Resources: Mana (Arcane Surge spends all of it). Arcane Salvo stacks (from Missiles and Splinters; cap 20 Spellslinger, 25 Sunfury). Arcane Charges (from Orb, Pulse, Touch, Prismatic Bolt; each one raises Blast damage). Clearcasting (free Missiles and Barrage). Cumulative Power (Prismatic Bolt; threshold 6 or 8).

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Arcane Missiles | channel 2.5s, 5 waves | enemy | none; needs Clearcasting | +1 Arcane Salvo per wave | ~392% SP total; main Salvo generator | Violet missiles spiral out of both hands and home in on the target in five bursts. |
| Arcane Barrage | instant | enemy | none | consumes Arcane Salvo (Method 12.1). Wiki text still says Arcane Charges (?) | Main spender; takes Blast's slot in the main rotation | Blue-violet burst with a shockwave off the target. |
| Arcane Orb | instant | rolling projectile | 20s | +1 Arcane Charge on cast and per damage tick; Spellslinger fires 3 | Orb rolls forward and hits everything in its path | Floating violet orb that rolls forward and pulses as it hits. |
| Arcane Blast | cast 2.25s, -8% per Charge | enemy | none | +1 Arcane Charge; mana cost doubles per Charge | Low-priority filler; Clearcasting fishing | Purple-white charge glow at the hands, then one bolt. |
| Arcane Pulse | cast 2s (12.1 rework) | AoE around caster (8 yd radius) (?) | 15s | +1 Arcane Charge per enemy struck | AoE charge generator; cast time scales with charges (Method) | Violet ring that expands outward from the caster. (?) |
| Touch of the Magi | instant | enemy (debuff) | 45s | 5% mana; +4 Arcane Charges; guaranteed Clearcasting | Stores 20% of your damage for 12s, then explodes | Purple marker on the target; when it pops, a stored-damage arcane blast. |
| Arcane Surge | cast 2.5s | enemy + nearby (damage falls off past 8) | 1.5 min | spends all mana; +425% mana regen and +35% spell damage for 15s; guaranteed Clearcasting | Burst window; precast in openers | Mana drains into a violet-white burst; caster glows for the 15s buff. |
| Prismatic Bolt (apex, new 12.1) | cast not stated (?) | enemy | proc per Salvo stack consumed | +1 Cumulative Power per cast; Clearcasting chance is talent-dependent (?) | Replaces next Blast; highest single hit per Method | Prismatic multi-colour bolt (visual not in sources). (?) |
| Shimmer | instant | self, teleport 20 yd forward | 30s, no charges | none | Movement; does not clear roots or stuns | Short forward blink with an arcane flash at start and end. |
| Prismatic Barrier | instant | self | 30s (25s with Barrier Diffusion) | none | Absorb (25% max HP); -15% magic damage taken (10% in PvP) | Rainbow-tinted prism shield around the caster. (?) |
| Counterspell | instant | enemy, 40 yd | 25s | none | Interrupt + 7s school lock | Blue-white burst that cracks the enemy's cast bar. |

### Single-target priority (Sunfury; Method)
1. Opener: potion, precast Arcane Surge, trinket, Missiles, Barrage, Touch of the Magi.
2. Arcane Missiles while Salvo is under 12.
3. Arcane Barrage while Arcane Soul is up.
4. Prismatic Bolt at 8 Cumulative Power (if Arcane Soul is down).
5. Arcane Barrage at 25 Salvo, or with Clearcasting at 12+ Salvo.
6. Prismatic Bolt, then Arcane Orb.
7. Arcane Blast as filler.
- Spellslinger swap: Prismatic Bolt (no Clearcasting, or 6 CP), Barrage at 20 Salvo or right after Surge, Missiles under 15, Prismatic Bolt, Orb if overcapping, Blast.

### AoE priority
- Spellslinger: Prismatic Bolt (same gate), Arcane Orb on cooldown, Barrage at 20 Salvo or after Surge, Missiles under 15 Salvo or at 3 stacks, Pulse or Orb for charges, Blast.
- Sunfury: Missiles under 12 Salvo, Barrage in Arcane Soul, Prismatic Bolt at 8 CP, Barrage at 25 Salvo, Prismatic Bolt, Orb, Blast.

### Major cooldowns
- **Arcane Surge:** 1.5 min CD, 15s buff. +35% spell damage, +425% mana regen, guaranteed Clearcasting. Surge and Touch are used together ("big burn").
- **Touch of the Magi:** 45s CD, 12s stored-damage debuff. Used alone between Surges ("miniburn"), never delayed.
- **Arcane Soul (Sunfury):** Barrage-spam window; duration not stated in sources.
- **Prismatic Barrier:** 30s CD, defensive.

### Procs and buff loops
- Missiles, plus a Salvo stack, then Barrage at threshold.
- Spellslinger Splinters: each has a 25% chance to add a Salvo stack.
- Arcane spell, random Clearcasting, then Missiles (Sunfury) or Blast fishing (Spellslinger).
- Barrage and Missiles generate Arcane Charges via High Voltage.
- Prismatic Bolt builds Cumulative Power; bolt again at 6 or 8 stacks.

### What makes it feel good
- A visible Salvo counter with firm "fire at 20 or 25" thresholds gives rhythm without a fixed loop.
- Surge and Touch stack into one clear burst the rest of the rotation dances around.
- Clearcasting procs reward you with a free, instant-feeling Missiles.
- Shimmer and Prismatic Barrier let you keep casting while moving.

### Season 2 / Midnight changes noted
- Primal Leywarden 2-piece: Missiles bonus 20% to 5%. 4-piece: Cumulative Power 5% to 3% per stack. Compensated with +3% ability damage (PCGamesN, 18 Aug). Blizzard said a deeper cut would hit Arcane too hard. Scope unclear.
- Arcane Blast +20% (Skill-Capped 12.1). Arcane Pulse reworked: cast 2.25s to 2s, radius 2 to 8 yd, 15s CD, one charge per enemy struck (Skill-Capped). Touch of the Archmage removed. Prismatic Bolt apex and Refractive Images added.
- The Wiki Arcane Pulse page is older (3-minute CD). Trust Skill-Capped's 12.1 notes.

---

## Mage — Fire [mage_fire]
Patch/season verified: 12.1 Season 2. Method guide updated 17 Aug 2026; Wiki spell pages to 12 Oct 2026 | Sources: https://www.method.gg/guides/fire-mage/playstyle-and-rotation , https://www.method.gg/guides/fire-mage/talents , https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/ , https://warcraft.wiki.gg/wiki/Fireball , https://warcraft.wiki.gg/wiki/Pyroblast , https://warcraft.wiki.gg/wiki/Fire_Blast , https://warcraft.wiki.gg/wiki/Combustion , https://warcraft.wiki.gg/wiki/Flamestrike , https://warcraft.wiki.gg/wiki/Meteor , https://warcraft.wiki.gg/wiki/Scorch , https://warcraft.wiki.gg/wiki/Blazing_Barrier

Resources: Mana. Heating Up (Fireball crit; Fire Blast converts it). Hot Streak (makes the next Pyroblast instant). Fire Blast charges (Method: multiple; bank 2 to 3 before Combustion). Ignite (DoT, spread by Fire Blast). Fired Up (Apex stacks on targets at 90 to 91% HP). Pyroclasm (proc, 2 charges). Spellfire spheres and Meteorites (Sunfury; not quantified in sources).

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Fireball | cast 1.75s | enemy | none | crits build Heating Up | Main filler and generator; replaces Frostbolt | Orange-red fireball with a trailing ember tail. |
| Pyroblast | cast 4s; instant on Hot Streak | enemy | none | consumes Hot Streak; 1.5% mana | Big spender | Huge yellow-orange sphere with a long fiery trail. |
| Fire Blast | instant | enemy | multiple charges (Method); recharge not stated. Old Wiki says 14s (?) | converts Heating Up to Hot Streak; spreads Ignite | Hot Streak enabler; bank charges before Combustion | Short hot orange flare at the caster's hand. |
| Scorch | cast 1.5s | enemy | none | generation not stated | Filler when Fire Blast is empty | Narrow fire jet from the hands. (?) |
| Flamestrike | cast 3.5s | ground, 40 yd | none | 1.5% mana | 4-5+ target AoE; replaces Pyroblast in Combustion at 4+ targets | Ground circle of fire that erupts from the impact point. |
| Combustion | instant | self | 2 min base; static 1 min with Kindling (Method) | none | Crit +100% for 10s (Wiki); ~12s damage window (Method) (?) | Caster wrapped in flame during the window. (?) |
| Meteor (talent, row 4) | instant cast, lands after 3s | ground | 45s | none | 900% SP impact, then 416% SP burning ground for 4s | Large meteor falls and leaves a fire patch. |
| Shimmer | instant | self, 20 yd forward | 30s, no charges | none | Movement | Short forward blink with an arcane flash. |
| Blazing Barrier | instant | self | 30s CD, 1 min duration | none | Absorb (25% max HP); melee attackers take fire damage; extra charge in 12.1 (Method) | Flame shield around the caster; melee hitters catch fire. |
| Counterspell | instant | enemy, 40 yd | 25s | none | Interrupt + 7s school lock | Blue-white burst that cracks the enemy's cast bar. |

### Single-target priority (Method rotation, ordered by me)
1. Fireball crits build Heating Up.
2. Fire Blast converts Heating Up to Hot Streak (off GCD; can be cast mid-cast).
3. Pyroblast on Hot Streak, paired with Fireball crits.
4. Keep Fire Blast on recharge with one charge in reserve.
5. Combustion on cooldown; line Meteor up with it.
6. Hold an existing Hot Streak if Combustion is 3 to 4s away.
7. Pyroclasm during Combustion with about 4s left (not during Hyperthermia).
8. Scorch when Fire Blast is empty.

### AoE priority
1. Flamestrike on 4 to 5+ targets (Method's text says 5+, its example says 4+).
2. During Combustion, Flamestrike replaces Pyroblast as spender at 4+ targets.
3. Meteor on grouped targets with Combustion. Burnout (new) explodes Ignites when Combustion ends; Method flags it for AoE.
4. Fire Blast spreads Ignite. Empty the bank before Combustion ends.

### Major cooldowns
- **Combustion:** 1 min static with Kindling; 2 min base (Wiki). Window of about 12s (Method) or 10s (Wiki). Conflict on the window length.
- **Meteor:** 45s CD. 900% SP after a 3s delay, then 416% SP burn over 4s.
- **Sunfury extras:** Spellfire spheres and Pyrocosm (Fireball can summon Meteorites that reduce Fire Blast's CD). Not quantified in sources.

### Procs and buff loops
- Fireball crit, Heating Up, Fire Blast, Hot Streak, Pyroblast.
- Fired Up (Apex): builds on targets at 90 to 91% HP; rank 1 2% for 8s (was 4% for 12s); rank 2 5%/10% (was 3%/6%) (Skill-Capped).
- Pyroclasm: 20s duration (was 15s). Works on hard-cast Pyroblast and Flamestrike with 2 charges (Method). Avoid during Hyperthermia.
- Burnout: when Combustion ends, Ignites explode for 75% of their remaining damage (Method).
- Cinderstorm (returning): 8% on Pyroblast or Flamestrike to send cinders. Method calls it badly undertuned.

### What makes it feel good
- Clear three-step loop: crit, convert, instant Pyroblast.
- Combustion as an all-in window: banked Blast charges, Pyroclasm procs, Flamestrike swap.
- Hot Streak's instant Pyroblast gives strong feedback on proc.
- Flamestrike and Ignite spread make AoE feel distinct from single target.

### Season 2 / Midnight changes noted
- All damage +19%, Pyroblast +15%, Flamestrike +15% (Skill-Capped; Wiki 12.1.0). Scope unclear.
- Phoenix Flames removed; Fire Blast refunds during Combustion are the compensation (Method).
- Kindling gives Combustion a static 1 min CD. Sunfury lost Hyperthermia and Kindling's CDR, causing 40 to 45s Combustion downtime (Method).
- Method: Sunfury is "pulling ahead in most content"; Frostfire is undertuned for Season 2.

---

## Mage — Frost [mage_frost]
Patch/season verified: 12.1 Season 2. Method guide updated 11 Aug 2026; Wiki spell pages to 12 Oct 2026 | Sources: https://www.method.gg/guides/frost-mage/playstyle-and-rotation , https://www.method.gg/guides/frost-mage/talents , https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/ , https://warcraft.wiki.gg/wiki/Frostbolt , https://warcraft.wiki.gg/wiki/Glacial_Spike , https://warcraft.wiki.gg/wiki/Flurry , https://warcraft.wiki.gg/wiki/Ice_Lance , https://warcraft.wiki.gg/wiki/Frozen_Orb , https://warcraft.wiki.gg/wiki/Ray_of_Frost , https://warcraft.wiki.gg/wiki/Comet_Storm , https://warcraft.wiki.gg/wiki/Blizzard , https://warcraft.wiki.gg/wiki/Ice_Block

Resources: Mana. Freezing (enemy debuff; Ice Lance thresholds). Fingers of Frost (Ice Lance proc, no longer granted on cast). Brain Freeze (Flurry proc; Flurry is used when Brain Freeze is up and Thermal Void is down). Icicles (stored; every five grant Glacial Spike, per Method). Frost Splinters (Spellslinger). Thermal Void (buff checked before Flurry and Ice Lance).

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Frostbolt | cast 1.75s | enemy | none | builds Freezing (Method) | Filler and opener precast; Glacial Spike replaces it at 5 Icicles | Pale-blue frost bolt with a white trail. |
| Glacial Spike | cast 1.75s (Wiki) | enemy | triggered by 5 Icicles | +3 Freezing; shatter bonus | Frostfire priority #1; replaces Frostbolt | Large jagged ice spike that slams in. |
| Flurry | instant | enemy | 30s recharge, 2 charges (Haste reduces) | +3 Freezing per cast; consumes Brain Freeze (Method) | Freezing builder | Cyan frost gust that blasts the target. |
| Ice Lance | instant | enemy | none | spends Fingers of Frost; shatters Freezing (Wiki: 4 stacks) | Payoff spender; launches stored Icicles per Wiki (?) | Thin icy spear thrown at the target. |
| Frozen Orb | instant | rolling orb (15s) | 1 min (Haste reduces) | none | Follows its target; slows 50% for 8s (12.0.0) | Big pale-blue frozen sphere that rolls and leaves frost. |
| Ray of Frost | channel 4s | enemy | 1 min (Haste reduces) | 1 Freezing per 0.5s tick (8 total); 450% SP per tick | Major offensive cooldown; used after Flurry and Ice Lance are spent | Continuous blue-white ice beam from the hands. |
| Comet Storm (talent) | instant | enemy area | no CD (Wiki) | 1 Freezing shatter per missile (12.0.1) | 7 comets, up to 602% SP each; triggered after Ray of Frost (Method) | Seven icy comets fall around the target. |
| Blizzard | cast 2s, ground | ground, 12 yd radius | 15s | Freezing Rain enables (Method) | Only AoE option | Snowstorm cloud on the ground. |
| Ice Barrier | instant | self | 30s (1 min duration) | absorb 25% max HP; -10% physical damage with Improved Ice Barrier (Method) | Survival shield | Blue ice shield around the caster. |
| Ice Block | instant | self | 4 min | 10s immunity; cannot cast or move while active | Emergency immunity; then Hypothermia 30s | Ice cube encases the caster. |
| Shimmer | instant | self, 20 yd forward | 30s, no charges | none | Movement | Short forward blink with an arcane flash. |
| Counterspell | instant | enemy, 40 yd | 25s | none | Interrupt + 7s school lock | Blue-white burst that cracks the enemy's cast bar. |

### Single-target priority
**Spellslinger (Method):**
1. Flurry (Brain Freeze up, Thermal Void down).
2. Ice Lance at 2 Fingers of Frost.
3. Frozen Orb.
4. Glacial Spike.
5. Ice Lance at 6+ Freezing or with Fingers up.
6. Flurry.
7. Ray of Frost.
8. Frostbolt.

**Frostfire (Method):** Glacial Spike, Comet Storm right after, Flurry, Ice Lance (2 FoF), Frozen Orb, Ice Lance (FoF and Thermal Void), Ice Lance at 12+ Freezing, Flurry, Frostfire Bolt. The general section says 10+ Freezing; the priority lists say 12+. Conflict in Method.

### AoE priority
**Spellslinger:** Blizzard (Freezing Rain up), Flurry, Ice Lance (2 FoF), Frozen Orb, Glacial Spike, Ice Lance (6+ Freezing or Fingers up), Flurry, Ray of Frost, Frostbolt.

**Frostfire:** Glacial Spike, Comet Storm, Flurry, Ice Lance, Frozen Orb, Ice Lance, Ice Lance at 12+ Freezing, Ray of Frost only if Frostfire Empowerment is down, Flurry, Frostfire Bolt.

### Major cooldowns
- **Ray of Frost:** 1 min, 4s channel. Best with stacks built. Method says lining it up with potion or Bloodlust is less important.
- **Frozen Orb:** 1 min, 15s orb.
- **Blizzard:** 15s, 12 yd radius.
- **Ice Block:** 4 min. **Ice Cold:** 3 min, 70% DR (Method). **Coldest Snap:** 5 min reset (Method).

### Procs and buff loops
- Freezing from Flurry (3), Glacial Spike (3), Ray of Frost ticks (8 over 4s); Ice Lance spends it. Freezing lasts 15s, cap 20 stacks (Wiki).
- Brain Freeze unlocks Flurry; Thermal Void gates Flurry and Ice Lance.
- Two Fingers of Frost trigger Ice Lance priority.
- Icicles grant a Glacial Spike every five (Method).
- Frostfire Empowerment (random) makes the next Frostfire Bolt instant and stronger.

### What makes it feel good
- Freezing stacks are visible on the enemy, so the Ice Lance shatter reads as a payoff.
- Brain Freeze and Fingers procs give a clear "now" signal.
- Ray of Frost and Frozen Orb hit hardest when stacks are already up.
- Ice Barrier, Ice Block, and Shimmer give strong survival tools.

### Season 2 / Midnight changes noted
- 12.0.0: Frozen Orb damage +800%, now follows its target; Glacial Spike damage +100% and now triggered from Icicles. Ray of Frost damage +66%, 0.5s ticks, no inherent Fingers. Flurry gained a second charge and Haste reduction. Comet Storm now triggered after Ray of Frost, with its cooldown removed.
- Frost is not named in the Aug 18 tuning list (PCGamesN). No Frost-specific 12.1 tuning found in sources.
- Method: Ray of Frost is now the major offensive cooldown.

---

## Rogue — Assassination [rogue_assassin]
Patch/season verified: 12.1 Season 2. Method guide updated 12 Aug 2026; Wiki spell pages to 22 Sep 2026 | Sources: https://www.method.gg/guides/assassination-rogue/playstyle-and-rotation , https://www.method.gg/guides/assassination-rogue/talents , https://www.pcgamesn.com/world-of-warcraft/midnight-season-2-class-tuning-patch-notes , https://warcraft.wiki.gg/wiki/Mutilate , https://warcraft.wiki.gg/wiki/Envenom , https://warcraft.wiki.gg/wiki/Garrote , https://warcraft.wiki.gg/wiki/Rupture , https://warcraft.wiki.gg/wiki/Deathmark , https://warcraft.wiki.gg/wiki/Kingsbane , https://warcraft.wiki.gg/wiki/Vanish , https://warcraft.wiki.gg/wiki/Thistle_Tea_(rogue_talent) , https://warcraft.wiki.gg/wiki/Shadowstep , https://warcraft.wiki.gg/wiki/Kick

Resources: Energy (Mutilate 50, Garrote 45, Envenom 35, Rupture 25). Combo Points (5; 7 for Envenom while Darkest Night is up). Poisons (Deathmark doubles lethal application; Kingsbane stacks poison damage). Bleeds (Garrote, Rupture; Crimson Tempest spreads them). Improved Garrote (from Vanish). Hero: Deathstalker stacks or Fatebound coin flip.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Mutilate | instant | enemy, melee, dagger | none | 50 energy; +2 CP | Main single-target builder | Two quick dagger strikes from both hands with red slash trails. |
| Envenom | instant | enemy (finisher) | none | 35 energy; 1 to 5 CP | Poison finisher; +30% poison chance for 1 to 5s; 7 CP with Darkest Night | Green poison glow on the blades. |
| Garrote | instant | enemy | none | 45 energy; +1 CP; 18s bleed (387% AP) | Opener bleed; extends Improved Garrote | Dark red tendrils coil around the target. (?) |
| Rupture | instant | enemy (finisher) | none | 25 energy; bleed 8 to 24s by CP | Bleed maintenance | Red droplets trail from the target. (?) |
| Deathmark | instant | enemy | 2 min | restores 80 energy over 16s | Doubles lethal poison; +75% Garrote, Rupture, and lethal damage (12.1) | Purple-black mark that spreads over the target. (?) |
| Kingsbane | instant | enemy | 1 min | +1 CP; 14s DoT; +20% damage per lethal poison, up to 1000% | Synced to Deathmark | Green-black poison cloud over the target. (?) |
| Vanish | instant | self | 2 min | none | Re-enter stealth in combat; 3s protected; Improved Garrote | Smoke puff; rogue fades into shadow. |
| Thistle Tea | instant | self | 1 min, 3 charges | +100 energy | Choice talent in 12.1: auto at under 30 energy, or manual | No visual described in sources. (?) |
| Shadowstep | instant | enemy, teleport behind target, 25 yd | 30s | none | Gap-close behind the target (verify spec access) | Shadow flicker that lands you behind the target. |
| Feint | instant | self | 15s, 2 charges (talent) | energy | 40% AoE damage reduction (Method) | Brief dark flicker around the rogue. |
| Kick | instant | enemy, melee | 15s | none | Interrupt + 6s lockout | Short kick arc with a dark flash. |

### Single-target priority (Method)
1. Keep Garrote up; refresh it from Vanish before each Deathmark.
2. Keep Rupture up at 5+ CP.
3. Deathmark on cooldown.
4. Kingsbane on cooldown, synced with Deathmark.
5. Envenom at 5+ CP (7 with Darkest Night).
6. Mutilate to build when not at 5 CP.
7. Vanish, then Garrote for Improved Garrote, lined up with Deathmark.
- Opener: Garrote, Mutilate to 5, Rupture, Mutilate to 5, Envenom, trinket and racial and potion, Deathmark, Kingsbane, Garrote, Mutilate, Envenom.

### AoE priority (Method)
1. Crimson Tempest to spread bleeds until 5 CP or all targets are bled.
2. Fan of Knives builds CP once all targets are bled.
3. Envenom to spend.
- AoE opener: Vanish if not stealthed, Garrote, Garrote again, Rupture, trinkets and racial and potion, Deathmark, Kingsbane, Crimson Tempest, Fan of Knives, Envenom.

### Major cooldowns
- **Deathmark:** 2 min, 16s. Restores 80 energy, doubles lethal poison, +75% bleed and poison damage.
- **Kingsbane:** 1 min. 14s DoT, stacks with poison.
- **Vanish:** 2 min. Resets stealth with Improved Garrote.
- **Thistle Tea:** 1 min, 3 charges, +100 energy.

### Procs and buff loops
- Envenom uptime; Rapid Injection lets you clip Envenom early.
- Darkest Night: next Envenom at 7 CP.
- Fatebound (hero): passive coin flip on each 5+ CP finisher.
- Deathstalker (hero): Envenom removes debuff stacks; once cleared, the next Envenom is empowered.
- Improved Garrote from Vanish, extended by Garrote.

### What makes it feel good
- Deathmark, Kingsbane, and Vanish sync into one clear window.
- The builder-to-finisher rhythm (Mutilate to Envenom) is simple and satisfying.
- Poison stacks on Kingsbane grow visibly with each application.
- Vanish-to-Garrote rewards stealth openers.

### Season 2 / Midnight changes noted
- Spec-wide damage +4% (PCGamesN, 18 Aug). No reason given; scope unclear.
- 12.1.0: Kingsbane damage -15%. Deathmark's Garrote, Rupture, and lethal bonus cut from 100% to 75%. Thistle Tea became a choice talent.
- Method (12.1): Deathstalker is recommended, pulling ahead 2 to 5% in all situations; Fatebound is still viable in the hardest content.
- Method's Assassination talents page does not cover Implacable, Deathmark, Vanish, or Shiv in detail. A search snippet claims Implacable (rank 1) was reworked in 12.1 for the energy economy; unverified.

---

## Rogue — Subtlety [rogue_subtlety]
Patch/season verified: 12.1 Season 2. Method playstyle and talents guides updated 19 Aug 2026; Wiki spell pages to 22 Sep 2026 | Sources: https://www.method.gg/guides/subtlety-rogue/playstyle-and-rotation , https://www.method.gg/guides/subtlety-rogue/talents , https://www.pcgamesn.com/world-of-warcraft/midnight-season-2-class-tuning-patch-notes , https://warcraft.wiki.gg/wiki/Backstab , https://warcraft.wiki.gg/wiki/Shadowstrike_(rogue_ability) , https://warcraft.wiki.gg/wiki/Shadow_Dance , https://warcraft.wiki.gg/wiki/Shadowstep , https://warcraft.wiki.gg/wiki/Shuriken_Storm , https://warcraft.wiki.gg/wiki/Secret_Technique , https://warcraft.wiki.gg/wiki/Shadow_Blades , https://warcraft.wiki.gg/wiki/Goremaw%27s_Bite , https://warcraft.wiki.gg/wiki/Vanish , https://warcraft.wiki.gg/wiki/Find_Weakness , https://warcraft.wiki.gg/wiki/Symbols_of_Death

Resources: Energy. Combo Points (finish at 6+ with the Deeper or Secret Stratagem talents, per Method). Shadow Technique stacks (Shadowcraft: 40% more procs during Shadow Dance, 2 stacks each). Find Weakness (buff: attacks ignore 30% armour for 10s after stealth abilities). Shadow Dance charges (1; 2 with Double Dance). Quietus Celeris (proc). Hero: Deathstalker Marks.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Backstab | instant | enemy, dagger | none | 40 energy; +1 CP (+20% damage from behind) | Generator outside Shadow Dance | Quick dagger stab with a dark trailing sweep. |
| Shadowstrike | instant | enemy, teleport behind target up to 25 yd | none | 50 energy (Wiki infobox says 40, history says 50); +2 CP; needs daggers and stealth | Generator inside Shadow Dance; +25% damage while stealthed | Shadow pulls the rogue behind the target into a dark slash. |
| Shadow Dance | instant | self | 20s; 1 charge (2 with Double Dance) | none | 6s stealth-like window; enables Shadowstrike and stealth abilities | Rogue fades into a dark smoky silhouette. |
| Shadowstep | instant | enemy, teleport behind target, 25 yd | 30s | none | 70% movement speed for 2s; avoids knockbacks | Dark flicker that lands behind the target. |
| Shuriken Storm | instant | self AoE, 10 yd | none | 45 energy; +1 CP per target hit | AoE generator (2+ targets) | Spinning shuriken spray around the rogue. |
| Eviscerate | instant | enemy (finisher) | none | cost not verified | Finisher | Quick green-tinted finishing strike. (?) |
| Secret Technique | instant | self (clone strikes around target) | 25s, Haste-reduced | 1 to 5 CP finisher | Three hits from the rogue and clones; finisher in Shadow Dance | Shadow clones strike around the target together. |
| Shadow Blades | instant | self | 1.5 min | none | 16s; CP generators grant full CP (Wiki) / double (Method); +20% shadow damage | Dark spectral glow on the weapons. (?) |
| Goremaw's Bite | instant | enemy and 2 nearby | 45s | 25 energy; 14s bleed | Reworked 12.1.0 (moved to row 7); repeats 20% of finisher damage as shadow | Dark bite arc with a bleed trail. (?) |
| Vanish | instant | self | 2 min (Thief's Bargain -90s) | none | 3s stealth that holds in combat | Smoke puff; rogue fades into shadow. |
| Feint | instant | self | 15s | energy | Defensive; reduces damage taken | Brief dark flicker around the rogue. |
| Kick | instant | enemy, melee | 15s | none | Interrupt + 6s lockout | Short kick arc with a dark flash. |

### Single-target priority (Method)
- Setup: be in stealth if possible.
1. Goremaw's Bite on cooldown.
2. Shadow Dance at 6+ CP when Secret Technique is ready.
3. Shadow Blades during Shadow Dance.
4. Secret Technique during Shadow Dance.
5. Vanish outside Shadow Dance at low CP, then Shadowstrike.
- Generators: Shadowstrike in Shadow Dance; Backstab outside.
- Finishers at 6+ CP: in Shadow Dance, Secret Technique, then Coup de Grace, then Eviscerate; outside, any.
- Stop Shadow Dance when Shadow Blades has 10s or less left (Method rule).

### AoE priority (Method)
1. Goremaw's Bite on cooldown.
2. Shadow Dance at 6+ CP when Secret Technique is ready.
3. Shadow Blades, then Secret Technique during Shadow Dance.
4. Vanish outside Shadow Dance at low CP, then Shuriken Storm.
- Generators in Shadow Dance: Shuriken Storm on 2+ targets; Shadowstrike on 1.
- Finishers in Shadow Dance: Secret Technique, Coup de Grace, Black Powder (2+ targets).

### Major cooldowns
- **Shadow Blades:** 1.5 min, 16s. Boosts CP generation and shadow damage. Use inside Shadow Dance.
- **Shadow Dance:** 20s CD, 6s. Aim for two uses per Shadow Blades window (Method).
- **Secret Technique:** 25s, Haste-reduced. Used in Shadow Dance at 6+ CP.
- **Goremaw's Bite:** 45s.
- **Vanish:** 2 min (Thief's Bargain: -90s).

### Procs and buff loops
- Shadow Dance window: Shadowstrike gains value; Shadow Technique stacks accumulate; Find Weakness (buff) applies to attacks.
- Quietus Celeris (proc): skips the second Eviscerate in the single-target opener if procced. Chance not stated.
- Coup de Grace and Darkest Night: consume when available.
- Supercharger (class talent): empowers your next finisher after Shadow Dance, mainly Secret Technique.
- Deathstalker (hero): Marks applied by Shadowstrike from stealth or Shadow Dance; 5+ CP finishers consume them.

### What makes it feel good
- Shadow Dance and Shadow Blades windows stack clones and CP into a big, legible burst.
- Shadowstep and Shadowstrike positional gap-close feel like a snap behind the target.
- Secret Technique's clone hits are a strong visual payoff.
- Burst-heavy spec: quiet between windows, loud inside them (Icy Veins snippet, unverified).

### Season 2 / Midnight changes noted
- Spec-wide damage +6%; 4-piece set bonus effectiveness cut from 100% to 60% (PCGamesN, 18 Aug). Scope unclear.
- Goremaw's Bite reworked in 12.1.0 (bleed plus repeat of finisher damage; moved to row 7).
- Symbols of Death removed in 12.0.0 with no replacement named. It is not in the kit.
- Shadow Dance cancels when you swap talents (hotfix 18 Aug 2026); its threat reduction was added to the tooltip in 12.1.0.

---

## Rogue — Outlaw [rogue_outlaw] (short; signature abilities only)
Patch/season verified: 12.1 Season 2. Method playstyle guide updated 12 Aug 2026; Wiki spell pages to Oct 2026 | Sources: https://www.method.gg/guides/outlaw-rogue/playstyle-and-rotation , https://warcraft.wiki.gg/wiki/Roll_the_Bones , https://warcraft.wiki.gg/wiki/Adrenaline_Rush , https://warcraft.wiki.gg/wiki/Between_the_Eyes , https://warcraft.wiki.gg/wiki/Killing_Spree , https://warcraft.wiki.gg/wiki/Blade_Flurry

Resources: Energy. Combo Points. Opportunity stacks (Pistol Shot). Roll the Bones buffs. Blade Flurry (cleave).

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Sinister Strike | instant (?) | enemy, melee | none | builder; generation not verified | Main builder at 5 CP or less | Quick single slash. |
| Roll the Bones | instant | self | 45s | buff lasts 30s | Random buff: One of a Kind, Double Trouble, Triple Threat, or Jackpot (Wiki 12.0.0; Method says stages 1 to 4 (conflict)) | Dice icon and rolling reveal. (?) |
| Adrenaline Rush | instant | self | 3 min | 15s; +75% energy regen, +20% attack speed | GCD shortened with Haste (down to 0.8s) | Rush of speed lines around the rogue. (?) |
| Blade Flurry | instant | self (cleave) | 30s | 10s | Hits up to 5 nearby for 153% AP; extra hits on up to 4 more while active | Spinning blades that sweep around the rogue. |
| Between the Eyes | instant | enemy | 45s | 25 energy; finisher at 6+ CP | Blast with pistol; buff 4 to 12s by CP | Pistol shot with a bright muzzle flash. |
| Killing Spree | channel 0.5s per CP | random enemies within 8 yd | 3 min | not stated | 12.1.0: +15% per CP beyond max; +60% damage (not in PvP) | Spinning strikes that jump between enemies. |
| Dispatch | finisher (cast not verified) | enemy | none | finisher at 6+ CP | Finisher | Quick strike with a dark flash. (?) |
| Feint | instant | self | 15s, 2 charges (talent) | energy | 40% AoE damage reduction (Method) | Brief dark flicker. |

### Single-target priority (Method, ordered on page)
Roll the Bones (stage 1 or less), Keep It Rolling (stage 3+), Preparation (when Between the Eyes, Adrenaline Rush, Killing Spree, and Blade Rush are on cooldown), Adrenaline Rush (at 2 CP or less), Killing Spree, Dispatch (4-piece), Blade Rush, Between the Eyes (6+ CP), Dispatch (6+ CP), Pistol Shot (Opportunity conditions), Sinister Strike (5 CP or less).

### AoE priority
Method has no separate list. Blade Flurry at 2+ targets; refresh at 4 CP or less with 4+ targets.

### Major cooldowns
- **Adrenaline Rush:** 3 min, 15s.
- **Killing Spree:** 3 min, channel.
- **Between the Eyes:** 45s.
- **Roll the Bones:** 45s, 30s buff. Keep It Rolling (talent) extends it by 30s.
- **Blade Flurry:** 30s, 10s buff.

### Procs and buff loops
- Roll the Bones bonuses (Wiki 12.0.0: one of four).
- Opportunity stacks feed Pistol Shot.
- Adrenaline Rush's Haste-based GCD cut.

### What makes it feel good
- Roll the Bones reveal creates a per-cast "what did I get" moment.
- Between the Eyes is a satisfying single big hit.
- Killing Spree feels like controlled chaos on multiple targets.

### Season 2 / Midnight changes noted
- 12.1.0: Killing Spree +15% per CP beyond max, +60% damage (not PvP); tracked buff in the Cooldown Manager (Wiki).
- 12.0.0: Adrenaline Rush shortened to 15s with +75% energy regen. Roll the Bones changed to one of four bonuses. Between the Eyes bonus changed from +20% crit to +4% damage, now overlapping (Wiki).
- No Outlaw-specific Season 2 tuning found in PCGamesN's list.

---

## Warlock — Affliction [warlock_affliction]
Patch/season verified: 12.1 Season 2. Method playstyle guide updated 12 Aug 2026; Wiki spell pages to 23 Sep 2026 | Sources: https://www.method.gg/guides/affliction-warlock/playstyle-and-rotation , https://warcraft.wiki.gg/wiki/Agony , https://warcraft.wiki.gg/wiki/Unstable_Affliction , https://warcraft.wiki.gg/wiki/Haunt_(warlock_talent) , https://warcraft.wiki.gg/wiki/Summon_Darkglare , https://warcraft.wiki.gg/wiki/Seed_of_Corruption , https://warcraft.wiki.gg/wiki/Drain_Soul , https://warcraft.wiki.gg/wiki/Malevolence_(warlock_hero_talent) , https://warcraft.wiki.gg/wiki/Spell_Lock

Resources: Soul Shards (Unstable Affliction 1, Seed of Corruption 1 per Wiki). Agony (sometimes generates 1 shard; chance not stated). Wither stacks (Hellcaller; each shard spend adds one). Darkglare DoT count (damage scales). Dark Harvest shards (Soul Harvester: 3 over the channel). Hero: Hellcaller or Soul Harvester.

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Agony | instant (DoT) | enemy | none | 1% mana; sometimes generates 1 shard | Main shard generator; 18s DoT | Long dark-purple curse vines over the target. (?) |
| Corruption (Wither in Hellcaller) | instant (DoT) | enemy | none | Wither gains stacks when shards are spent | Maintained DoT | Green curse runes on the target. (?) |
| Haunt | cast 1.5s | enemy | 15s (reset if target dies) | none | +16% damage to target for 18s (12.1.0); one application at a time (12.0.1) | Dark ghost bolt that drifts to the target. (?) |
| Unstable Affliction | cast 1.5s | enemy | none | 1 shard; 16s DoT | Single-target shard sink; dispel deals damage and silences dispeller 4s | Swirling green-purple energy that explodes on dispel. (?) |
| Seed of Corruption | cast 2s | enemy, 10 yd radius | none | 1 shard | Explodes after 12s; applies Corruption to enemies in radius (Wiki). Method says it applies Unstable Affliction (conflict) | Demon seed sits on the target, then bursts. (?) |
| Summon Darkglare | instant | self (summon) | 2 min | none | 20s; 487% SP blast plus 10% per DoT; DoTs +20% damage | Floating eye rises and fires a shadow blast. |
| Drain Soul | channel 5s | enemy | none | 1 shard if the target dies during the channel | Execute bonus (+100% under 20%) | Dark tendril beam drains into the caster. |
| Dark Harvest | channel | enemy and all targets | not stated | Soul Harvester: 3 shards over the channel | Multi-target DoT siphon | Dark siphoning wave across targets. (?) |
| Malevolence (Hellcaller) | instant | self | 1 min | none | 20s; +8% haste; 6 Wither stacks on enemies with Wither | Dark aura and shadowflame on Wither targets. (?) |
| Unending Resolve | instant | self | 3 min | none | 8s; 25% DR; silence and interrupt immunity | Dark shell around the warlock. (?) |
| Spell Lock | instant | enemy, 40 yd | 24s | none | Felhunter pet (Command Demon); 7s school lock | Pet's green-tinted bolt that silences the cast. |
| Demonic Circle: Teleport | instant | self | not stated | none | Mobility | Dark circle that teleports the warlock. (?) |

### Single-target priority (Method, with 12.1 changes)
1. Precast Haunt before the pull; keep it on the main target.
2. Maintain Agony and Corruption (or Wither), refreshing in the pandemic window.
3. Summon Darkglare on cooldown; refresh short DoTs first (damage scales with DoT count).
4. Malevolence on cooldown (Hellcaller), saving shards for it.
5. Spend shards on Unstable Affliction as they arrive; avoid waste.
6. Dark Harvest when out of shards (Soul Harvester build).
7. Filler: Malefic Grasp during Darkglare; Drain Soul or Shadow Bolt otherwise.
- Malefic Rapture is not in the 12.1 Affliction rotation (Method). Older Maxroll and Accountshark lists still show it; ignore them.

### AoE priority (Method)
1. Agony on as many targets as possible (4 to 6).
2. Haunt on the primary target while mobs stand still.
3. Summon Darkglare.
4. Seed of Corruption; dump shards into Seed.
5. Malevolence (Hellcaller).
6. Dark Harvest when out of shards; keep casting Seed.

### Major cooldowns
- **Summon Darkglare:** 2 min, 20s. Damage scales with DoT count; DoTs +20%.
- **Malevolence (Hellcaller):** 1 min, 20s. +8% haste, +6 Wither stacks.
- **Unending Resolve:** 3 min, 8s, 25% DR.
- **Dark Pact:** 60s (45s with Frequent Donor). Sacrifices 20% HP for an absorb worth 200% of the sacrifice.
- **Mortal Coil:** 45s. Heals 20% max HP.

### Procs and buff loops
- Agony sometimes generates a shard, which feeds Unstable Affliction or Seed.
- Wither stacks rise with each shard spend; at 8 stacks they are consumed over time for bonus damage (Method).
- Malevolence adds stacks on each Wither target.
- Unstable Affliction dispelled: damage to dispeller and 4s silence (Wiki).
- Shard Instability and Cascading Calamity are not described on the Method page.

### What makes it feel good
- Maintaining the DoT set and refreshing in the pandemic window gives steady rhythm.
- Summon Darkglare is a clear big window.
- Shard spending on Unstable Affliction feels like a payoff for patience.
- Spell Lock and Demonic Circle add active tools to the kit.

### Season 2 / Midnight changes noted
- Malefic Rapture not in the 12.1 rotation (Method). Shard sink is Unstable Affliction, Seed for groups.
- 12.0.0: Unstable Affliction 1 shard, 16s DoT, overlapping casts allowed. Agony damage +82%. Summon Darkglare 2 min CD, DoT bonus replaces the old DoT extension.
- 12.1.0: Haunt damage amplification raised from 12% to 16%, lasting 18s (Wiki Haunt page; search snippet of PTR notes agrees).
- Tier-set numbers (2-piece Agony and Wither bonuses, 4-piece per-UA bonus) come from a search snippet only, not a primary source. Treat as unverified.

---

## Warlock — Destruction [warlock_destruction]
Patch/season verified: 12.1 Season 2. Method playstyle guide updated 15 Aug 2026; Wiki spell pages to Oct 2026 | Sources: https://www.method.gg/guides/destruction-warlock/playstyle-and-rotation , https://warcraft.wiki.gg/wiki/Soulfire , https://warcraft.wiki.gg/wiki/Conflagrate , https://warcraft.wiki.gg/wiki/Chaos_Bolt , https://warcraft.wiki.gg/wiki/Shadowburn , https://warcraft.wiki.gg/wiki/Rain_of_Fire , https://warcraft.wiki.gg/wiki/Summon_Infernal , https://warcraft.wiki.gg/wiki/Incinerate , https://warcraft.wiki.gg/wiki/Malevolence_(warlock_hero_talent)

Resources: Soul Shards (Chaos Bolt 2, Rain of Fire 3, Shadowburn 1). Soul Shard Fragments (Conflagrate 5, Incinerate 2 plus 1 on crit, Summon Infernal 1 per second; conversion to shards not stated). Backdraft (empowers Soulfire). Immolate (Diabolist) or Wither (Hellcaller). Demonic Art (Chaos Bolt proc, Diabolist). Diabolic Ritual (restarted by Chaos Bolt). Ruination (Diabolist proc).

### Core kit
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Incinerate | cast 2s | enemy | none | 1.5% mana; 2 fragments (+1 on crit) | Filler at bottom of both rotations | Fire bolt stream from the hands. |
| Soulfire | cast 3s | enemy | 45s (Wiki) vs "as often as possible" (Method) (?) | 1 shard; applies Immolate | Shard generator; prefer with Backdraft; empowered cast | Big fiery orange ball with embers. |
| Conflagrate | instant | enemy | 13s recharge, 2 charges | 5 Soul Shard Fragments (Wiki) | Avoids sitting on 2 charges; saved for movement | Short fire burst on the target. |
| Chaos Bolt | cast 3s | enemy | none | 2 shards; always crits | Main spender; consumes Demonic Art (Diabolist) | Chaotic purple-green bolt with flickering energy. |
| Shadowburn | instant | enemy under 20% HP | none | 1 shard; on kill within 5s, generates 1 shard and refunds a charge (Wiki) | Execute spender; pairs with Fiendish Cruelty proc | Dark-red shadow burst. |
| Rain of Fire | instant (ground) | ground, 40 yd | none | 3 shards; 8s burn | AoE spender; preferred at 8+ targets (Diabolist) | Ground-level hellfire rain. |
| Summon Infernal | instant | self (summon) | 2 min (90s with Inferno) | none | 30s; 2s stun on landing; fragments each second | Large fiery demon crashes down; stun ring. |
| Malevolence (Hellcaller) | instant | self | 1 min | none | 20s; +8% haste; +1 Wither stack per spender cast | Dark aura with flame. (?) |
| Havoc | cleave window | second target | not verified (?) | doubles shard generation (Method) | Cleave when a second target spawns with max resources | Not verified. (?) |
| Demonic Circle: Teleport | instant | self | not stated | none | Mobility | Dark circle that teleports the warlock. (?) |
| Demonic Healthstone | instant | self | 1 min (with Pact of Gluttony) | none | Usable in combat; heals | Glowing healthstone. (?) |
| Spell Lock | instant | enemy, 40 yd | 24s | none | Felhunter pet interrupt; 7s lockout | Pet's green bolt that silences the cast. |

### Single-target priority (Method)
- **Hellcaller:** Wither (refresh in pandemic window), Summon Infernal, Malevolence with as many spenders as possible during it, Shadowburn (for Fiendish Cruelty or overcap), Chaos Bolt (for overcap), Soulfire (preferably with Backdraft), Conflagrate (to avoid 2 charges), Incinerate.
- **Diabolist:** Chaos Bolt (spend Demonic Art, restart Diabolic Ritual), Immolate (refresh in pandemic window), Summon Infernal, Shadowburn, Chaos Bolt for overcap, Soulfire, Conflagrate, Incinerate.
- Opener: Soulfire at the 4s pull timer, Summon Infernal, Conflagrate, Malevolence with trinket, potion, and racial (Hellcaller).

### AoE priority (Method rules; no full ordered list in source)
1. Havoc or Mayhem for two-target cleave as soon as a second target spawns with max resources.
2. Hellcaller: Rain of Fire is the preferred spender when shards would overcap.
3. Diabolist: Rain of Fire only from 8+ targets; Chaos Bolt may still be better for priority damage.
4. Ruination (Diabolist): spend on grouped adds; do not let it expire.

### Major cooldowns
- **Summon Infernal:** 2 min (90s with Inferno), 30s. Stuns on landing.
- **Malevolence (Hellcaller):** 1 min, 20s. Hold it for spenders.
- **Havoc / Mayhem:** CD and duration not verified.
- **Demonic Healthstone:** 1 min, combat-usable.
- **Dark Pact:** 45s with Frequent Donor (Method); base not stated.

### Procs and buff loops
- Soulfire, then empowered Soulfire via Backdraft, then shards (doubled during Havoc or Mayhem), then spenders.
- Malevolence adds a Wither stack per spender cast.
- Chaos Bolt restarts Diabolic Ritual; consumes Demonic Art.
- Ruination: spend on grouped adds.
- Fiendish Cruelty: spend on Shadowburn or hold for movement.

### What makes it feel good
- Big spender bursts (Chaos Bolt, Shadowburn, Rain of Fire) feel heavy against shard buildup.
- Summon Infernal and Malevolence make a clear burst cycle.
- Conflagrate charge banking gives a satisfying "save it for the window" decision.
- Wither stacks rising visibly during Malevolence.

### Season 2 / Midnight changes noted
- Chaos Bolt: row 1, 12.0.0 -18%; 12.0.1 +10%; 12.1.0 +5%; 25 Aug hotfix +15% in PvP.
- Shadowburn redesigned (12.0.0: doubled damage, lost old crit bonus); tracked buff in the Cooldown Manager (12.1.0).
- Soulfire: cast 3s (12.0.0); 12.1.0 +45%; choice node with Dimensional Rift.
- Rain of Fire: 25 Aug hotfix +30% damage.
- Malevolence (Hellcaller): 12.0.1 +230% damage.
- Method's Destruction page does not list Soul Harvester; Hellcaller and Diabolist are the hero options it covers.

---

## Priest — Discipline [priest_discipline] (short; Atonement loop only)
Patch/season verified: 12.1 Season 2. Method playstyle guide updated 17 Sep 2026; Wiki Atonement and spell pages to 23 Sep 2026 | Sources: https://www.method.gg/guides/discipline-priest/playstyle-and-rotation , https://warcraft.wiki.gg/wiki/Atonement , https://warcraft.wiki.gg/wiki/Power_Word:_Shield , https://warcraft.wiki.gg/wiki/Power_Word:_Radiance , https://warcraft.wiki.gg/wiki/Evangelism , https://warcraft.wiki.gg/wiki/Penance , https://warcraft.wiki.gg/wiki/Ultimate_Penitence , https://www.pcgamesn.com/world-of-warcraft/midnight-season-2-class-tuning-patch-notes

Resources: Mana (Penance 2.8%; hotfix -20% on 22 Sep). Atonement: 15s; full value on the first 5 injured allies, with diminishing returns after. Transfer is 46% of your damage done. Void Infusion (Voidweaver; Mind Blast boosts Ultimate Penitence).

### Core kit (Atonement loop and key buttons)
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect | Visual |
|---|---|---|---|---|---|---|
| Power Word: Shield | instant | ally | 7.5s | 15s absorb (463.8% SP) | Applies Atonement; main ramp shield | Gold-white shield bubble around the ally. |
| Flash Heal | cast (not verified) | ally | none | applies Atonement (Method says "to yourself"; unclear) (?) | Fast heal and Atonement starter | Green-gold heal glow. (?) |
| Power Word: Radiance | cast 2s | ally + up to 4 injured allies within 40 yd | 18s | applies Atonement at 60% duration | Group Atonement | Golden light burst that spreads to nearby allies. |
| Evangelism | instant | self | 1.5 min | Radiance at 150%; next 2 Radiance instant and 40% cheaper (Wiki). Method says it applies five Atonements itself (conflict) | Ramp finisher | Halo surge with light tendrils to the group. (?) |
| Penance | channel 2s | enemy (damage) or ally (heal) | 9s (Haste-reduced) | 2.8% mana; heals Atonement holders for 18.72% SP each cast. No longer applies Atonement (12.1.0) | Atonement-heal bolt; can be weaved with a shield (Weal and Woe) | Rapid holy bolts arc from the caster. |
| Void Shield | cast not verified | ally | multiple charges (Method) | none | Main M+ shield; reflects Atonement healing (Method) | Dark-violet shield with a reflective edge. (?) |
| Ultimate Penitence | cast 1.5s then channel 6s | self | 4 min | shield up to 100% HP while ascended; immune to knockback and CC | Offensive or defensive ramp climax; +30% (12.1.0) | Holy halo ascension with a bright shield. (?) |

### Single-target priority (Method; raid and M+ differ)
- **Raid, Voidweaver:** Shadow Word: Pain, Mind Blast, Penance, Void Blast, Shadow Word: Death (execute), Smite.
- **Raid, Oracle:** Shadow Word: Pain, Mind Blast, Penance (offensive or defensive), Shadow Word: Death (execute), Smite.
- **M+, Voidweaver:** Shadow Word: Pain, Shadow Word: Death (execute), Mind Blast, Penance, Void Blast, Shadow Word: Death (outside execute), Smite.
- **M+, Oracle:** Shadow Word: Pain, Mind Blast, defensive Penance, Shadow Word: Death (execute), Smite.
- Healing priority is set by ramps (Evangelism ramp, Ultimate Penitence ramp), not a ranked list.

### AoE priority
Not covered in the source. Radiance (5-target cap) is the group tool.

### Major cooldowns
- **Evangelism:** 1.5 min. Core raid ramp tool.
- **Ultimate Penitence:** 4 min, 6s channel. Shield while ascended; offensive use in raid.
- **Power Word: Barrier:** 20% damage reduction. Use when the reduction is guaranteed to matter.
- **Pain Suppression:** 50% damage reduction for tanks (CD not verified).

### Procs and buff loops
- Every Atonement damage tick heals all Atonement holders. Atonement applies from Power Word: Shield, Flash Heal, Plea, and Radiance (Wiki, 12.1.0).
- Spread Atonement beyond passive sources only during Evangelism or Ultimate Penitence ramps (Method).
- Weal and Woe: a shield after Penance gives a bigger shield (Method).
- Void Infusion (Voidweaver): Mind Blast boosts Ultimate Penitence.
- Greater Smite: standing still and chaining Void Blast.

### What makes it feel good
- Every damage cast also heals your group, which reads as the Atonement "damage is healing" core.
- Shield then Atonement then Radiance builds a visible web across the group.
- Evangelism and Ultimate Penitence give a clear ramp climax.

### Season 2 / Midnight changes noted
- Discipline PvE output -30%; Atonement transfer 32% to 46% (PCGamesN, 18 Aug). Scope unclear.
- 12.1.0: Penance stopped applying Atonement; Ultimate Penitence +30%; Power Word: Shield shadow absorb +25%.
- 12.0.0: Atonement diminishing returns after 5 targets; Radiance healing -15%, then +25% outside PvP in 12.0.5; Evangelism redesigned around Radiance.
- Entropic Rift +20% damage (PCGamesN).

---

## Known gaps and conflicts (read before using numbers)
- **Method vs Wiki conflicts:** Arcane Barrage (Arcane Salvo vs Arcane Charges); Prismatic Bolt Clearcasting; Fire Blast charges (Method says multiple, Wiki old 14s); Soulfire cooldown (Wiki 45s vs Method "as often as possible"); Seed of Corruption (applies Corruption vs Unstable Affliction); Combustion base CD and window; Shadowstrike energy (40 vs 50); Roll the Bones (stages vs one of four); Evangelism Atonement count.
- **Unverified:** Haunt tier-set values, Havoc cooldown and duration, Dark Harvest CD, Demonic Healthstone CD, Dispatch cast, Sinister Strike cost, Eviscerate cost, Feint energy cost, Flash Heal cast time, Void Shield cast and CD, Pain Suppression and Power Word: Barrier CDs, Arcane Soul duration, Mirror Image and Alter Time details.
- **Blocked sources:** Icy Veins (403 on every page tried), Maxroll (404), Wowhead guide bodies (nav only). Wowhead spell pages show effect values only.
- **Thin specs:** Frost, Outlaw, and Destruction rotation numbers are thinner than Arcane, Fire, and Assassination. Discipline is intentionally short. Visuals are my description, not sourced.
