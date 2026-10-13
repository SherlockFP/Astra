# WoW dungeon reference: The Stonevault (TWW) and Magisters' Terrace (Midnight)

Research date: 2026-10-13. Purpose: reference for the hobby re-creation in the M+ Season 1 pool (ROADMAP Batch 10: Taşkasa and Büyücüler Terası). Everything is written in our own words from the sources listed per dungeon.

## How to read the tags

- **[src]** stated by a source that was read.
- **[img]** read from the loading-screen JPEG (what is visible in the picture).
- **[inf]** my inference. Verify before relying on it.
- **[conf]** sources disagree. Both versions are listed.
- Hex colours are eyeballed from the loading-screen images. They are approximate, not game data.

## Source status

- **Read in full:** warcraft.wiki.gg (dungeon, boss, keystone and file pages), Blizzard news posts 24125258, 24222916, 24307305, Method M+ guides (Stonevault dated 2024-08-20; Magisters' Terrace dated 2026-03-23), Siliconera (2024-08-22), wow.gg Magisters' Terrace (2026-02-16, updated 2026-06-12), AccountShark Magisters' Terrace (2026-04-18), rutab.net Stonevault (2024-11-10, Russian adaptation of a gamerant guide), Wowhead ru Stonevault overview (last updated 2024-09-17), conquestcapped timer list (updated 2026-08-04), gamosaurus TWW Season 3 pool list (2025-06-20), Wccftech launch Q&A (2024-08-22), Blizzard Stonevault forum thread (2024-09-24).
- **Blocked (HTTP 403):** Icy Veins Stonevault guide, Icy Veins Magisters' Terrace guide, Icy Veins comprehensive dungeons guide. Not read.
- **Search snippets only (not read in full):** Icy Veins Week 11 Stonevault success rates, Giant Bomb location text, Engadget 2008 preview, Wowhead TW Season 1 overview (fetch failed on redirects), Hirumaredx and LeystTV interviews.

---

## The Stonevault → our id taskasa

*Id note: `taskasa` is a proposed id from the ROADMAP name Taşkasa. No id for this dungeon exists in `src/data/dungeons/` yet.*

Sources: https://warcraft.wiki.gg/wiki/The_Stonevault · https://warcraft.wiki.gg/images/The_Stonevault_loading_screen.jpg?74fa3f · https://www.method.gg/guides/dungeons/the-stonevault · https://www.siliconera.com/how-to-clear-the-stonevault-dungeon-in-wow-the-war-within/ · https://wowhead.com/ru/guide/the-war-within/dungeons/the-stonevault-overview · https://worldofwarcraft.blizzard.com/news/24125258 · https://rutab.net/b/games/2024/11/10/wow-tww-rukovodstvo-po-stonevault-mythic.html · https://us.forums.blizzard.com/en/wow/t/stonevault-nerfs/1966568 · https://conquestcapped.com/guides/wow/mythic-plus-timer/ · https://www.gamosaurus.com/?p=239403 · https://wccftech.com/world-of-warcraft-the-war-within-launch-qa-on-dungeons-raids-and-art/amp/

**Expansion / patch:** The War Within, Season 1 (wiki infobox: added in patch 11.0.2). Boss and trash data are from the Aug to Nov 2024 guides. Rotation status is checked against the Midnight Season 1 list (Aug 2026) and the TWW Season 3 list (June 2025). Hotfix-level tuning for 2025 to 2026 was not found.

### Art & atmosphere

**Overall [src]:** an Earthen industrial forge-temple run by the Machine Speakers. It grew out of a failed attempt to restore the Awakening Machine. The mood is decay and overwork: the Earthen culture is shrinking and the machines are worn down. It is the hidden last refuge of the deposed High Speaker Eirich.

**Architecture [img]:** cavern-scale stone halls with carved angular knotwork and interlocking geometric panels, the Earthen style. Heavy stone pillars and blocks, rune-marked gates, large machine housings, rail-mounted mining carts, vents, and pipes. Lava is channelled into falls down the walls.

**Materials [img/src]:** carved dark stone (living Earthen stone), molten metal and lava, scrap metal and iron plating, Skardyn crystal (the crystal shards and the crystal-augmented golem), and void-tainted rifts.

**Palette (approx, 8 names) [img]:**
1. Scorched umber, deep wall shadow: approx #3A1F15
2. Rust brown, carved stone faces: approx #6B3A24
3. Molten orange, lava falls: approx #FF8C1A
4. Bright gold-yellow, lava cores and rune inlay: approx #FFD54A
5. Ember red, glyph borders and vent glow: approx #A8301C
6. Ash grey, smoke and floor steam: approx #5B5352
7. Void violet, Void Rifts and Eirich corruption: approx #3C1D5E [inf: from mechanics, not visible in the loading screen]
8. Skardyn crystal teal, crystal shards: [inf: colour not confirmed; I could not see the shards]

**Lighting [img/src]:**
- Lava is the main light source. Four lava streams (two thin ones at the edges, two wider pours at the gate) throw warm orange light. Gold glyphs add a second light.
- Embers drift through the air, and low smoke or steam sits at floor level. This is the only fog described.
- There is no time of day (underground). The surrounding zone uses light shafts from openings in the cavern roof, which suggests the approach areas may get shafts too [inf].

**Signature landmarks, in run order [src; the east/west mapping is inf]:**
1. **Earthguard Approach**, the entry: skardyn, golems and robots.
2. **Central Processing**, the central hub. It is cleared before E.D.N.A. and leads to E.D.N.A.'s room.
3. **E.D.N.A.'s room**, a central boss room.
4. **Two wings** (either order, both must be cleared, then return to the hub by mining cart):
   - **Earthblood Crucible**, east wing: Skarmorak's room (inf).
   - **Singing Forge**, west wing: Master Machinists' room, with a lava-fed forge anvil (inf for the mapping, the forge location is [src]).
5. **Final corridor**: Honor Guards, Rock Smashers, Stoneshapers.
6. **Whispering Hall**, opens after both wings. Eirich's room, reached through **Titan tunnels**.
7. **Two Void Rifts** on the edge of Eirich's room.

**Recurring props [src/inf]:** mining carts (the only way between the hub and the wings), scrap blocks, corner exhaust vents, crystal shards, rune gates, the forge anvil.

**Enemy look per faction [src for factions; looks are not described in any source I read]:**
- **Skardyn and void-bound:** void-formed monsters (Void Bound Despoiler, Void Bound Howler, Cursedheart Invader, Ghastly Voidsoul, Void Touched Elemental).
- **Machine Speakers and forge crew:** Turned Speakers, Aspiring Forgehands, Forgebound Menders, Forge Loaders, Engine Dynamos. Dorlita pilots an Earthen mech [src].
- **Cursedforge:** Eirich's fanatical loyal followers (Honor Guard, Rock Smasher, Stoneshaper) [src].
- **Automata:** E.D.N.A. (Earthen Defense and Neutralization Automaton), Repurposed Loaderbots, Earth-Infused Golems.

**Loading screen [img]:** a lava-lit forge hall. Thin lava streams run down both edges. Two wider pours flank a central rune-marked gate with a tall gold glyph panel, and lava pools at its base. Foreground: a circular stone platform with low pillar blocks carved with glowing rune strips. Smoke and embers fill the air. Credit (wiki file page): ARTVOSTOK STUDIO and Anastasia Polyakova.

**Key art:** five concept images on the wiki. Not described in any source, not read.

**Music:** not found. [inf: a low forge drone with metal percussion would match the look.]

**Design rule to reuse [src, Wccftech 2024, Encounter Lead Michael Nuthals]:** the VFX, dungeon-art and encounter teams set a palette per boss together. Boss effects are chosen so they stand out from the floor texture. Fire and lightning must not blend into similar-coloured floors.

**Zone context [src, Wccftech 2024, Associate Art Director Tina Wang]:** the Ringing Deeps started as a mix of Black Rock Depths and Maraudon. Lava falls and giant buildings give light and atmosphere. Layers of rock let brightness filter down. Cenote-style caves with greenery, mist and moss were added so the zone does not feel oppressive.

### Layout

**Shape [src/inf]:** a central hub with two side wings and a final corridor. The route is mostly linear with small variations. The order of the two wings is free, but both must be cleared before the hub opens onward. Minecarts sit in the east and west wings and return players to the centre. Anyone can use them.

**Sections, in order [src: rutab pull numbers, Method, Siliconera]:**
1. **Entry (Earthguard Approach):** pulls G1–G5 (two pulls, G4 and G5 can be combined). Then E.D.N.A.
2. **E.D.N.A. room:** the first boss.
3. **East wing (Crucible, inf):** G6 + G14 (Abyssal Surge risk), G11 or G13 depending on the patrolling G12. Skarmorak's room. Minecart back to the hub.
4. **West wing (Forge, inf):** avoid pulling two Forge Loaders (G22). G28 holds an anvil pickup, the Iron Ingot buff. Master Machinists' room. Minecart back to the hub.
5. **Hub to final corridor:** cart near G21. An Aspiring Forgehand beside the cart needs hard CC, or take the normal route. Pull 18: G29 and G30 first. Avoid pulling G32, G34 and G35 together.
6. **Eirich.**

**Shortcuts and skips [src, rutab]:** at pull 18 a player can pull G29, then die or vanish to drop aggro. The group then has to pull G70 in the Machinists' area instead. This is hard to do in a pug and closes the dungeon graveyard for the rest of the run.

**Set-piece events [src]:** E.D.N.A.'s spike field, Skarmorak's shard-and-shield room, the Machinists' cube and vents, and Eirich's void rifts. No NPC events or gauntlets were found.

### Trash (notable types)

| Mob | Role | Must do / watch |
|---|---|---|
| Cursedheart Invader | caster, curse | Interrupt Arcing Void. Void Infection needs a Curse dispel, or use defensives and healing cooldowns. |
| Ghastly Voidsoul | caster, fear | Interrupt Howling Fear every time. It fears everyone within 45 yd. |
| Repurposed Loaderbot | melee, pounce | Pulverizing Pounce drops a circle that one-shots anyone inside. Step out. |
| Void Bound Howler | caster, important | Interrupt Piercing Wail, especially when Void Burst is involved. |
| Turned Speaker | caster, silence | Interrupt Censoring Gear. If it targets the healer, use a silence cleanse or CC. Silences for 3 s. |
| Aspiring Forgehand | melee, tank-stack | Fracturing Blows stacks raise tank damage taken by 5% per stack. Kite, or use AoE slow or CC. Hard-CC it when it is beside a cart. |
| Forgebound Mender | healer, interrupt | Interrupt Restoring Metals (heals an ally 40%). Use spare kicks on Alloy Bolt. |
| Forge Loader | frontal, CC-immune | Dodge Lava Cannon. Molten Mortar puts a stacking fire DoT on 2 players. Two together is dangerous. |
| Cursedforge Honor Guard | melee, stun | Stunning charge follows the arrow at its feet. Pull them against walls so Shield Stampede does not run far. |
| Rock Smasher | important, CC-immune | Each Smash Rock adds stacking damage to later Smash Rocks. Granite Eruption is lethal at high keys. |

Also present: Void Bound Despoiler (one per pull; Shadow Claw needs defensives, Void Outburst hits the whole group), Void Touched Elemental (dodge Crystal Salvo), Engine Dynamo (Concussive Smash slows; magic dispel), Earthbreaker Totem (kill at once; explodes after 7 s and kills non-tanks), Cursedforge Stoneshaper (interrupt Stone Bolt).

**Must-interrupt:** Arcing Void, Howling Fear, Piercing Wail, Censoring Gear, Restoring Metals, Stone Bolt, Earth Burst totem.
**Must-dispel:** Void Infection (curse), Concussive Smash (magic), Censoring silence (on the healer), Seismic Reverberation (the boss, DoT).
**Stuns and CC:** Honor Guard charge, golem cone stun in the entry, scrap cube stun in the Machinists' room.
**Frontals:** Earth-Infused Golem seismic wave (point it away), Forge Loader line, Eirich's Unbridled Void cone, Honor Guard shield push.

**Dangerous pulls [src, rutab; Method]:**
- More than one Void Bound Despoiler in a pull.
- More Void Bound Howlers than the group can interrupt.
- G4 + G5 together (the tank has to position against the wall).
- G6 + G14 together (Abyssal Surge comes fast).
- Two Forge Loaders at once.
- More than one Rock Smasher at a time.
- G32 + G34 + G35 together.
- Pull 8 without tracking the patrolling G12 Despoiler.

### Bosses (in order)

#### 1. E.D.N.A.
- **Look:** a defence automaton (Earthen Defense and Neutralization Automaton) [src]. Its look is not described.
- **Arena:** central boss room, with spikes spawning around the floor [src].
- **Phases:** none. Energy fills to 100, then Earth Shatterer.
- **Volatile Spikes:** three spawn under random players [src]. A spike that a player walks near, within about 4 yd, detonates with knockback and a stacking group DoT. Sources say the detonation hits raid-wide [conf].
- **Refracting Beam:** the boss fires beams at marked players, up to three at once. A beam that hits a spike destroys it [src]. The tank may aim the beam at spikes [src, Method].
- **Earth Shatterer (at 100 energy):** nature damage to the whole group. It also destroys every remaining spike, so spend major defensives on it [src]. On Mythic it is a large damage spike [src, Siliconera].
- **Seismic Smash (tank):** heavy physical hit that applies Seismic Reverberation, a 30-second magic DoT [src]. Dispelling the DoT gives the tank 50% damage reduction for 6 s [src, Method]. Wowhead instead says it applies an Earth Shield [conf].
- **Roles:**
  - *Tank:* large defensive on the first Smash, smaller ones after dispels. Immunities on Smash stop the Reverberation from applying [src, rutab].
  - *Healer:* dispel from the second Smash on, or wait until just before the next Smash [src, Method; conf].
  - *DPS:* stack to spawn spikes together, then spread so beams do not cleave several players [src].
- **Intermission or enrage:** none listed.

#### 2. Skarmorak
- **Look:** a golem infused with Skardyn corruption. Crystals alter its elemental build [src]. No other look details.
- **Arena:** the east room, with randomly placed crystal shards. The boss has to be moved around the room [src].
- **Phases:** shard waves before each Fortified Shell. Six shards in total, in two sets of three before each shell [src, Method; rutab].
- **Crystalline Smash (tank):** heavy physical hit. Each cast spawns three shards, which stay put and hurt nearby players when they land [src].
- **Crystalline Eruption:** a shard that dies creates a group-wide Shadow hit and a brief vulnerability (2 to 3 s) [src, conf]. Kill the shards one at a time and wait for the debuff to end [src].
- **Unstable Crash (15 yd Shadow):** an AoE that ejects Unstable Fragments under each player. Orbs despawn after about 15 s. A player who picks up their own orb gets stacks [src, Method]. rutab calls the same event an Unstable Upheaval. Collect one fragment per player to keep stacks even [src, rutab].
- **Energy and Fortified Shell:** energy drains with each cast. At 0 the boss casts Fortified Shell, an absorb shield that grows with every living shard [src]. Breaking the shell stuns Skarmorak for about 4 s [src].
- **Void Discharge (channel during the shell):** raid-wide Shadow every 2 s. Damage rises 10% per tick and stacks. Only breaking the shell stops it [src].
- **Void Empowerment / Unstable Energy (Mythic):** collected fragments grant stacking healing and shell damage (+50% per stack) for 15 s [rutab] or 30 s [wiki] [conf], with a periodic Shadow DoT.
- **Roles:**
  - *Tank:* drag the boss so shards are cleaved. Cooldown on Smash [src].
  - *Healer:* cooldowns for Void Discharge. Heal through the shard waves.
  - *DPS:* kill shards in stages, cleave the boss, collect orbs for stacks.
- **Intermission or enrage:** the shell phase works as an intermission. No enrage timer listed.

#### 3. Master Machinists: Speaker Brokk and Speaker Dorlita
- **Look:** Dorlita pilots an Earthen mech. Brokk is the caster [src]. No other look details.
- **Arena:** a square room with four corner vents and a central cube. Two scrap blocks sit on opposite sides [src].
- **Phases:** two bosses, each with its own health pool. When one dies, the other gains Silenced Speaker: +75% damage and periodic fire pulses [src, Wowhead]. Pulses come every 1.5 s [Wowhead] or every 3 s [rutab] [conf]. Kill both within a few seconds of each other.
- **Brokk, Molten Metal:** fire damage and a 50% slow for 8 s. Interrupt it. It is cast right after each Scrap Song [src].
- **Brokk, Scrap Song:** Brokk jumps behind a scrap block and launches a cube or brick across the centre after a delay. It stuns, damages and knocks back anyone it hits [src].
- **Brokk, Exhaust Vents:** three of the four corner vents ignite. Each leaves a flame pool for about 30 s. Standing on an active vent is lethal. The inactive vent is the safe corner [src].
- **Dorlita, Igneous Hammer:** fire tank buster. Use a defensive on every cast [src].
- **Dorlita, Lava Cannon:** a line on a random player. Move when she turns to charge it [src].
- **Dorlita, Blazing Crescendo:** drags the cube to the centre, then a large group fire hit, a DoT within 20 yd, and lava waves from all four sides [src]. Dorlita can catch the brick and detonate it, so stay away from the centre when Scrap Song starts [src].
- **Mythic brick:** the brick explodes into four magma blobs that move outward [src].
- **Rotation:** Scrap Song, then Blazing Crescendo, with vents before each. The tank moves both bosses to the centre after each [src, rutab].
- **Pre-fight buff [src, Method, rutab]:** the forge anvil in the west wing grants 10% Versatility for 10 minutes. Only a Warrior, a Dwarf, or a player with 25+ Khaz Algar Blacksmithing can use it. One use, lost on death.
- **Roles:**
  - *Tanks:* both bosses are tanked, with a defensive for each Igneous Hammer.
  - *Healers:* manage the DoTs from Crescendo and the vents.
  - *DPS:* kick Molten Metal, dodge the Lava Cannon line, and move to the inactive vent side.

#### 4. High Speaker Eirich (Void Speaker)
- **Look:** living stone corrupted by void energy. Deposed High Speaker [src]. No other look details.
- **Arena:** the Whispering Hall, with two Void Rifts on the room's edge [src].
- **Before the pull:** two Rock Smashers stand close. Pulling both at once ramps damage fast [src, Siliconera].
- **Void Rifts:** anyone within about 3 yd is killed outright [src]. Players 3 to 15 yd from a rift can pull Void Corruption into it, and the corruption moves to another spot [src, Method]. On Mythic the rifts vanish after use and reappear elsewhere [src].
- **Void Corruption:** a stacking DoT on the whole group. It ticks every 3 s and rises 25% per tick until cured [src]. Sort the order before the pull: fragile classes and the healer clear first, the tank last [src].
- **Entropic Reckoning:** every player gets a radius-8 circle that becomes a shrinking pool after a delay (about 1.5 min). Tanks can stack on existing pools. Drop pools near the edge to keep dodge space [src].
- **Unbridled Void (random-target frontal):** a cone covering roughly a quarter of the room while Eirich channels. Run through it or to the side of him [src].
- **Intermission or enrage:** none listed.

### Mythic+ notes

- **Rotation status [src]:** not in the Midnight Season 1 pool (the Aug 2026 list has 8 other dungeons). Not in the TWW Season 3 pool (Blizzard list, June 2025). A third-party blog says the Midnight Season 2 pool also excludes it (not verified).
- **Timer:** not listed on any current source. The number is unknown and should not be used from this doc.
- **Enemy forces totals:** not found.
- **Routes:** Method linked a pug-friendly MDT route but did not print it. The pull order above comes from rutab (Season 1). Decode the MDT string for exact counts.
- **Last known success rate [search snippet, Icy Veins Week 11 data]:** 83.3% timed across 115,051 completed runs. This was during TWW Season 1.
- **Community feedback [src, Sept 2024 forum thread]:** players said the Machinists fight was far harder than the others. They also reported vent and cube timing problems, orbs spawning on the wrong side, and adds not dying. These are player opinions, not patch facts.
- **Affixes:** no affix interactions for this dungeon were found.
- **Hotfixes:** no Stonevault hotfix dates were found.

### Research gaps (Stonevault)

- No concrete palette, lighting or architecture description beyond the loading screen. The zone art notes were the only other source.
- Enemy looks are not described anywhere. Loot and achievements do not matter here.
- Boss room sizes and arena geometry are not given.
- No enrage timers found. The Silenced Speaker pulse rate conflicts between sources.
- The timer, enemy forces totals and affixes are missing.
- The east/west mapping (Crucible = Skarmorak, Forge = Machinists) is inferred.
- Pull data comes from a Russian adaptation of a gamerant guide (rutab). The Icy Veins guide, which covers all four bosses, could not be read (403).

---

## Magisters' Terrace → our id buyucu_terasi

*Id note: `buyucu_terasi` is a proposed id from the ROADMAP name Büyücüler Terası. No id exists in `src/data/dungeons/` yet.*

Sources: https://warcraft.wiki.gg/wiki/Magisters%27_Terrace · https://warcraft.wiki.gg/images/Magisters%27_Terrace_%28Midnight%29_loading_screen.jpg · https://www.method.gg/guides/dungeons/magisters-terrace · https://wow.gg/guides/magistersterrace · https://accountshark.net/blog/wow-midnight-magisters-terrace-mythic-plus-guide · https://worldofwarcraft.blizzard.com/en-us/news/24222916/ · https://worldofwarcraft.blizzard.com/news/24307305 · https://warcraft-secrets.com/?p=25422 · https://conquestcapped.com/guides/wow/mythic-plus-timer/ · https://www.wowhead.com/tw/guide/midnight/mythic-plus-season-1-overview (search snippet only)

**Expansion / patch:** Midnight. Wiki infobox: added in patch 12.0.1 (2026-02-10). Hotfixes through 2026 (March, April, May). Overworld update in 12.0.7 (2026-06-16). The original Burning Crusade dungeon (patch 2.4.0, 2008) is the reimagining's source. This doc uses the Midnight version only.

### Art & atmosphere

**Overall [src]:** a blood elf magister academy and observatory on Quel'Danas, in Eversong, built to watch the Sunwell Plateau. The Cynosure of Twilight is kept here. Its power opens a portal to the Voidstorm. The academy look is being breached by void creatures.

**Architecture [img/src]:**
- Gothic pointed arches with ribbed vaulting in long colonnades.
- Tall library bookcases filling the arch bays.
- A domed observatory with radiating ribs and a starfield ceiling.
- A tower of theory with a central tower, a celestial orrery and an upper tower.
- A new balcony over the Sunwell (Midnight addition) [src, Blizzard].

**Materials [img]:** lilac-grey marble floors with gold inlay trim. Dark wood and gilt, red leather-bound books, red velvet seats, teal diamond-cut crystal finials, candles and glass decanters.

**Palette (approx, 8 names) [img]:**
1. Midnight indigo, sky and deep shadow: approx #1D1A46
2. Deep plum, arch shadows and floor: approx #3A2350
3. Blood-red leather, bookshelves and velvet: approx #6E1B2B
4. Amber lantern gold, lanterns and sconces: approx #F2A14A
5. Arcane cyan, crystal finials and arch tracery glow: approx #5FD3E8
6. Lilac-grey marble, floor tiles: approx #7C7396
7. Starlight silver, dome stars: approx #D6D0F0
8. Void violet-black, Voidstorm corruption: approx #2A0F3A [inf: not seen in the loading screen]

**Lighting [img/src]:**
- Night. The dome opens onto a starfield, so cool blue-violet starlight comes from above.
- Amber lanterns and wall sconces make warm pools.
- Cyan arcane glow comes from the arch tracery and the crystals.
- A cool blue light shaft enters from one side.
- Fog: none visible on the loading screen. A faint purple haze sits deeper in the hall. Void zones are expected to be darker and foggier [inf].

**Mood [img]:** quiet, scholarly, nocturnal and reverent. The Void threat is expected to show as violet-black corruption against this calm [inf].

**Music:** not found.

**Signature landmarks, in run order [src; order partly inf]:**
- **Entrance areas (overworld):** South Antechamber, the Hushed Foyer, the Lycaneum [wiki].
- **Library gauntlet:** librarians send players back to the entrance if they come too close. An Arcane Tome nearby gives 5% haste for 30 min, and it survives death [Method].
- **Arcane Atheneum (library):** killing the Blazing Pyromancer opens the library door [Method].
- **Courtyard:** Energy Crystals can be drained for a temporary damage and healing boost [Method].
- **Constellarium:** Gemellus's room [wiki].
- **Grand Magister Asylum:** listed in Seranel Sunlash's infobox, no link [wiki]. Location of her encounter [conf].
- **Observatory Grounds:** Arcanotron Custos [wiki].
- **Tower of Theory:** central tower, celestial orrery, upper tower. Degentrius's platform sits on top of the terrace and in the orrery [wiki].
- **Sunwell balcony:** a new, previously sealed area [Blizzard].

**Enemy look per faction [src for names; looks are not described]:**
- **Magisters and Sunblades (blood elves):** Magister Apprentices, Sunblade Enforcers. Some blood elf mobs are knocked unconscious rather than killed [wiki].
- **Spellbreakers:** Runed Spellbreakers (CC-immune), Seranel Sunlash (boss), Spellbreaker Terrace-Guard (overworld).
- **Constructs and animated objects:** Arcane Sentries, Animated Codices (animated books), Arcanotron Custos, Crystalcore Mechanoids.
- **Sunwell light-kin and wyrms:** Lightward Healers, Brightscale Wyrms.
- **Void:** Siphoids (Gemellus's kind), Void Wraiths, Voidspawn, Voidlings, Void Infusers, Shadowrift Voidcallers, Dreaded Voidwalkers, Devouring Tyrants.
- **Domanaar:** Degentrius, an aberration.

**Loading screen [img]:** a night library-observatory. A long hall of pointed arches. A starfield dome above with radiating ribs. Bookshelves fill the arch bays with red books. Amber lanterns hang from above. A red velvet throne-like chair with a teal crystal finial sits in the foreground. A desk holds candles and glass decanters.

**Key art (wiki gallery, Blizzard news):** images only, not described in any source, not read.

### Layout

**Shape [inf from sources]:** vertical, with a multi-floor layout (wiki maps floors 1 to 6), a central plaza and a tower ascent. The upper library is pulled before the plaza. Clearing the plaza brings down an elevated pack, so the reverse order doubles the count [AccountShark]. Ethereal Patrols overlap the main hallway and should be pulled late [AccountShark].

**Sections [src/inf; sizes not given]:**
1. Entrance and courtyard packs, with Arcane Magisters and Sunblade Enforcers. Watch for Polymorph.
2. Library: the gauntlet, the Arcane Tome, the Pyromancer and the library door.
3. Plaza and upper library.
4. Boss 1 (Arcanotron, Observatory Grounds).
5. Boss 2 (Seranel, Grand Magister Asylum [conf]).
6. Boss 3 (Gemellus, Constellarium).
7. Trash after boss 3 on the way to the orrery. Devouring Tyrants appear between boss 3 and boss 4 on every route [wow.gg].
8. Boss 4 (Degentrius, Celestial Orrery).

**Shortcuts [search snippet, unverified]:** rogues and druids can shroud past several courtyard packs between bosses 2 and 3. The trash after boss 3 is described as mandatory.

**Set pieces and environmental mechanics:** library gauntlet, Pyromancer library door, courtyard energy crystals, Seranel's suppression dome, Gemellus's clones and link arrows, and Degentrius's void beams.

**Elites:** Devouring Tyrant (falling damage zones, slows, a dispellable fear on 3 players every 15 s) [wow.gg]. Also an "Arcane Sentinel" beam elite [wow.gg], which Method calls Arcane Sentry. Names conflict, so verify in-game.

### Trash (notable types)

| Mob | Role | Must do / watch |
|---|---|---|
| Arcane Magister | caster | Polymorph is the priority interrupt. Dispel if it lands. Arcane Bolt on spare kicks. |
| Blazing Pyromancer | caster, healer, CC-immune | Interrupt every Pyroblast. Defensives during Ignition. Avoid the Flamestrike hit and puddle. Killing it opens the library door. |
| Animated Codex | caster, healer | Constant Arcane Volley pulses. Keep pulls small. Did not count toward forces; hotfixed [wiki]. |
| Runed Spellbreaker | frontal, CC-immune | Runic Glaive hits 2 random players. Point the Shield Slam cone away from the group. |
| Shadowrift Voidcaller | healer, CC-immune | Consuming Shadows hits the whole group hard. Break line of sight. |
| Void Infuser | caster, interrupt | Interrupt every Terror Wave. Consuming Void debuffs a random player; dispel or use cooldowns. |
| Devouring Tyrant | elite tank or healer, CC-immune | Devouring Strike gives the tank a large heal absorb. Void Bomb puts an absorb on a random player. Self-heal to help the healer. |
| Arcane Sentry | tank-type, CC-immune | Ethereal Shackles targets the tank: break the root or magic-dispel. Arcane Beam channels on a random player. Crowd Dispersal AoE and knockback. |
| Sunblade Enforcer | melee | Purge the Arcane Blade buff. Otherwise a defensive for empowered strikes. Charge makes kiting hard. |
| Crystalcore Mechanoid | shielded | Purge the shield before the kill [AccountShark]. |

Also present: Dreaded Voidwalker (interrupt Shadow Bolt), Voidling (melee), Hollowsoul Shredder (cleave), Unstable Voidling (stagger on death), Brightscale Wyrm (stagger on death, Energy Release).

**Must-interrupt:** Polymorph (Magister), Pyroblast (Pyromancer), Arcane Bolt (Magister), Terror Wave (Void Infuser), Shadow Bolt (Voidwalker).
**Must-dispel:** Ethereal Shackles (boss and Sentry), Consuming Void (Void Infuser), Holy Fire (Lightward Healer), Devouring Tyrant fear.
**Frontals:** Shield Slam (Spellbreaker), Shadowrift's Consuming Shadows (break LoS), Arcanotron's Repulsing Slam (knockback).

**Dangerous pulls [src, Method, AccountShark]:**
- The library pull: Animated Codex and Blazing Pyromancer together. Interrupt Pyroblast every time.
- Runed Spellbreaker packs: CC-immune, so do not plan around crowd control.
- The void casters before Seranel: pull them into a line and clear fast with AoE.
- Upper library before the plaza.
- The Ethereal Patrol overlap in the main hallway.

### Bosses (in order)

#### 1. Arcanotron Custos
- **Look:** an arcane construct built to keep magisters within the rules [wiki].
- **Arena:** Observatory Grounds. Walls matter: energy spheres spawn from the walls during recharge. Keep the boss away from the walls during recharge [wow.gg].
- **Energy and Refueling Protocol:** energy drains over time. At 0 the boss recharges: it takes 20% more damage for 20 s, and energy orbs are pulled to it [wiki].
- **Energy Orb:** an orb that reaches the boss causes an arcane explosion that hits everyone and raises boss damage (+10%, +15% or +20% per orb on Normal, Heroic or Mythic) [wiki]. A player who touches an orb destroys it and gains Unstable Energy, a stacking Arcane DoT [wiki]. On Mythic, destroyed orbs leave Arcane Residue [wiki].
- **Arcane Expulsion:** a wide AoE with knockback. It leaves a slowing Arcane Residue pool. It lasts about 2 min [Method] or the rest of the fight [wow.gg] [conf]. Overlap existing pools and keep them on the edge.
- **Ethereal Shackles:** roots several players for 15 s with periodic Arcane damage. Break with a magic dispel or freedom. Healers dispel. Players use defensives if still rooted [Method, wiki].
- **Repulsing Slam (tank):** heavy hit and long knockback. It is uninterruptible (2.5 s cast) [wow.gg]. Use a defensive and terrain to stop the knockback.
- **Intermission or enrage:** no separate phase; the recharge is the window. No enrage listed.

#### 2. Seranel Sunlash
- **Look:** a male blood elf Spellbreaker, the guardian of the Cynosure [wiki].
- **Arena:** a Suppression Zone dome forms under the boss. Inside it, players are silenced and pacified, and magical effects are purged [wiki].
- **Runic Mark:** an arcane glaive hits a target. Players within 4 yd take more Arcane damage each second. It bounces to one nearby player [wiki].
- **Mark count [conf]:** wow.gg says three players are marked. Other sources do not give a number. Verify in-game.
- **Marks can only be cleared inside the dome** [wow.gg]. Clear marks one at a time. Clearing two at once wipes the group [wow.gg].
- **Null Reaction (Mythic):** when a mark is removed, all players take Arcane damage and a stacking 25% slow for 3 s [wiki].
- **Wave of Silence (at 100 energy, called Oath of Silence in one guide):** Arcane damage to everyone, and everyone outside the dome is pacified for 8 s [wiki, wow.gg]. Clear all marks before it lands. Everyone must stand inside the dome [AccountShark].
- **Hastening Ward:** +100% attack speed and Arcane damage on auto-attacks for 15 s. Dispel or purge it. Otherwise the tank uses a cooldown [wiki, AccountShark].
- **Roles:**
  - *Tank:* move the boss out of the dome. Clear your own mark.
  - *Healer:* heal through the mark removals. Clear your own mark first.
  - *DPS:* clear marks promptly. Use defensives during removals. Enter the dome for the Wave.
- **Phases:** none. No enrage listed.

#### 3. Gemellus
- **Look:** a Siphoid, a void-born creature [wiki]. No look details.
- **Arena:** the Constellarium. Clones drift in different directions [wow.gg].
- **Triplicate:** at the pull and again at 50% health, the boss splits into itself and two clones. Each time that makes three bodies [wiki].
- **Synaptic Nexus:** all bodies share one health pool and one shield [wiki, wow.gg, Method]. Cleave all of them.
- **Neural Link:** a random player is linked. An absorb of about 20% of max HP appears on the boss and clones. The linked player takes 20% more damage for 12 s. Touch the linked clone before the timer ends to break the link and remove the absorb [wiki]. The arrow under the linked player's feet points at the clone [Method]. The wiki notes this shield is Mythic-only [conf].
- **Astral Grasp:** pulls a player toward Gemellus for 8 s with Shadow damage each second. Cosmic Radiation hurts them while they are held [wiki]. Move away if targeted [Method].
- **Cosmic Sting:** heavy Shadow hit on a player, plus a Void Secretions pool under them. The pool adds Shadow damage for 6 s [wiki]. Drop the pool out of the way [Method].
- **At 50%:** the second triplication. Method says all players, including the tank, are targeted below 50% [Method, unverified].
- **Roles:**
  - *Tank:* position the boss near the clones for cleave value, away from Sting pools.
  - *Healer:* focus players in Astral Grasp and Cosmic Sting.
  - *DPS:* AoE. The shared pool means cleave hits every body [wow.gg].
- **Hotfixes [wiki, March and May 2026]:** clones surviving the encounter; abilities not resuming after death during Astral Grasp.
- **Intermission or enrage:** only the 50% clone phase. No enrage listed.

#### 4. Degentrius (final boss)
- **Look:** a Domanaar aberration [wiki]. No look details.
- **Arena:** a raised platform on top of the terrace and in the celestial orrery [wiki]. Void Torrent beams split it.
- **Beam count [conf]:** the wiki says a March 2026 hotfix cut Void Torrents from four to two. wow.gg (June 2026) describes four obelisks and four sectors that each need one player. Method says a beam cuts the arena in half. Verify in-game.
- **Void Torrent:** void energy channelled from the orrery lenses. Contact deals Shadow damage and a 3 s stun [wiki].
- **Unstable Void Essence:** an orb that bounces to four spots. Each impact hits the players there with Shadow damage. If no player catches an orb at an impact spot, Void Destruction triggers: Shadow damage to everyone, then every 0.5 s for 40 s, and it stacks [wiki]. Spread into pizza-slice positions so each catch point has a player [AccountShark]. Split the group across both halves for the soaks [Method].
- **Devouring Entropy:** several players each get a Shadow DoT that ticks every second, with different durations. When one expires, Entropy Orbs fly out of that player. An orb hits for Shadow damage and slows 70% for 5 s [wiki].
- **Hulking Fragment (tank):** smashes its target for Shadow damage within 8 yd and knocks back others in that radius. Mythic: it embeds Umbral Splinters, a stacking Shadow DoT for 30 s. Removing the splinter leaves a Stygian Ichor pool for 40 s [wiki]. Tanks back away from their allies. The healer dispels the Magic DoT [Method].
- **Entropy Blast (tank):** physical damage to the tank [wiki].
- **Null Bomb [wow.gg term, not in wiki or Method]:** a bomb that the tank detonates with a 3 m radius. Others stay away [conf].
- **Boss position:** stationary [Method].
- **Intermission or enrage:** none listed. Degentrius is the pacing boss under Tyrannical [AccountShark].

### Mythic+ notes

- **Timer [conf]:** 34:00 on conquestcapped (Midnight Season 1 list, updated 2026-08-04). The Wowhead season overview (updated 2026-02-19) shows 33:00, and beside it 26:24 and 19:48. Those look like 80% and 60% of 33:00, so they are probably the +2 and +3 thresholds [inf]. Blizzard's January beta feedback mentioned 33:00 changing to 33:30 (unconfirmed). Use 34:00 as the latest figure. Verify in-game.
- **Enemy forces totals:** not found.
- **Routes:** Method linked a pug-friendly MDT route but did not print it. AccountShark estimates a clean +12 at 25 to 30 minutes.
- **Forces quirks [wiki, fixed in 2026 hotfixes]:**
  - After Arcanotron dies in Mythic, enemies that should spawn toward Seranel failed to spawn.
  - Animated Codices did not count toward Enemy Forces.
- **Affix notes [AccountShark, opinion]:**
  - Tyrannical: Degentrius sets the pace.
  - Fortified: trash density punishes weak interrupt rotations.
  - Bursting: Energy Orb soaks on Arcanotron stack the debuffs.
  - Sanguine: Hulking Fragment puddles overlap.
  - Volcanic: tighter positioning for the Degentrius pizza-slice phase.
- **Planned Season 3 changes [Blizzard preview, Sept 16; not confirmed live]:** a full review focused on routes and strategies. The library event will get new paths and new books. The Degentrius encounter will be updated (no details given). Non-boss enemies, including the Devouring Tyrant, will be reviewed and some replaced. Blizzard says plans may change. Check whether these are live before relying on this dungeon's tuning.
- **Coaching anchors:** Seranel's mark timing and Wave of Silence; Gemellus's triplication and link arrows; Degentrius's pizza-slice catches.

### Research gaps (Magisters' Terrace)

- No written art direction from Blizzard, the wiki or any guide. The art notes come from the loading screen only.
- Key art and the wiki gallery are not described.
- Arena sizes and room mapping are partly inferred. Seranel's location is unconfirmed.
- Seranel mark count is disputed (three in wow.gg, no number elsewhere).
- Degentrius beam count is disputed (two, four or a split).
- Timer: 33:00 or 34:00 (and possibly 33:30).
- Enemy forces totals are missing.
- Elite names differ between sources (Arcane Sentinel vs Arcane Sentry).
- Enrage timers are not listed anywhere.
- Icy Veins Magisters' Terrace guide could not be read (403).
- Route order is not public beyond Method's MDT import.
