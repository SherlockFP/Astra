# Legion dungeons: Court of Stars and Halls of Valor

Research for the EFSUN dungeon set (WoW-inspired re-creations). Prepared 2026-10-13. Research only; no game or code changes.

Proposed ids (not in the GDD yet): `yildiz_mahkemesi` = Court of Stars, `cesaret_salonlari` = Halls of Valor. They follow the existing snake_case Turkish convention (`kemik_mahzeni`, `kizil_dokumhane`, `buzul_tahti`, `golge_tapinagi`).

## Source status and confidence

- Icy Veins: HTTP 403 on every attempt (both dungeon guides). Not used.
- Wowhead Mythic+ route guides (Legion 7.3.5, user-submitted, last updated April 2018): only metadata came through (timer, average pack size, benchmark keys). Route bodies did not load.
- warcraft.wiki.gg "(tactics)" pages: the three Court of Stars boss tactics pages returned 404. Base boss pages were used. Hyrja tactics returned 404; base Hyrja page used. Hymdall, Skovald and Odyn tactics pages loaded.
- Art sources are thin. Blizzard's Stormheim zone preview gave real Halls palette and lighting. Blizzard's Court of Stars preview gave mood only. Mein-MMO's Court of Stars article gave mechanics and tone. No official Court of Stars palette or lighting source was reached. Colours marked "derived" are my reading of described features, not official art.
- Versions are mixed. Court of Stars also returned in Dragonflight Season 1; Icy Veins and Raider.io pages describe that version and were not used for layout. Some Halls of Valor boss pages may include Trial of Valor raid mechanics. Those items are tagged [VERIFY].
- Level data conflicts across pages. See the Thin spots section.

---

## Court of Stars → our id `yildiz_mahkemesi` (proposed)

Sources: https://worldofwarcraft.blizzard.com/en-us/news/20242975 (Legion dungeon preview), https://warcraft.wiki.gg/wiki/Court_of_Stars, https://warcraft.wiki.gg/wiki/The_Jeweled_Estate, https://warcraft.wiki.gg/wiki/Patrol_Captain_Gerdo, https://warcraft.wiki.gg/wiki/Talixae_Flamewreath, https://warcraft.wiki.gg/wiki/Advisor_Melandrus, https://warcraft.wiki.gg/wiki/Duskwatch_Arcanist, https://warcraft.wiki.gg/wiki/Felbound_Enforcer, https://warcraft.wiki.gg/wiki/Shadow_Mistress, https://mein-mmo.de/en/wow-legion-court-of-stars-instanz,76624, https://www.wowhead.com/classic/cn/court-of-stars-mythic-keystone-guide (Legion 7.3.5 route metadata) | Expansion / patch: Legion. Added in 7.0.3 (July 2016) as Mythic-only; Heroic added in 7.2 (March 2017). Dragonflight Season 1 brought it back in a different form.

**Setting:** One night gala at the largest mansion in Suramar's Noble District, held while Legion forces patrol the city outside. The dungeon is an instanced copy of the north-eastern half of the inner city. Entry is an elevator in the Aetherium, straight ahead from the main gate. The party infiltrates the gala. Grand Magistrix Elisande may attend, and a spy hides among the guests. Blizzard says the dungeon rewards non-combat solutions and that the Dire Maul tribute run inspired its structure.

### Art & atmosphere

- **Architecture:** Nightborne high-elf style. The Jeweled Estate is an ornate, furnished mansion built for banquets, balls and private meetings. It has many balconies over Suramar Bay and is a visible skyline landmark next to the Nighthold.
- **Materials (derived):** polished stone or marble, gilded trim, crystal or glass (implied by "Jeweled"), overgrown vines at the building entrances (alpha screenshots, Blizzard's Suramar preview).
- **Colour palette (derived; not official):**
  1. Night indigo: base sky and shadow. Source: "chilly night" (wiki).
  2. Arcane cyan-blue: the blue shimmer of arcane energy, found everywhere in alpha shots (Mein-MMO). Use for the Nightwell and arcane FX.
  3. Warm candle gold: warm tones similar to Quel'Thalas forest, plus gala interiors (Mein-MMO; interior lighting inferred).
  4. Overgrown green: the land decayed and overgrew during the Nightborne's long seclusion (Blizzard's Suramar preview). Use on entrances and vines.
  5. Violet: purple is described as dominant across the zone (forum comment, weak source).
  6. Silver-white: marble highlights and the "silver and blue" west-city tone (forum comment; inferred).
  7. Fel green and infernal orange: the Legion side. Talixae's fire and demon enemies (inferred from mechanics).
- **Lighting:** Night, cold outside. Arcane blue is the main coloured light. The gala interior is warm (inferred). The balconies face the bay under moonlight. No fog is described; the canals suggest damp air (inferred).
- **Signature landmarks (run order):**
  1. Canals: waterside area, eels and manafeeders. A hidden area holds the Hivemind mount.
  2. Moonlit Landing: entry area with guards and Legion enemies.
  3. Gilded Market: boss Patrol Captain Gerdo.
  4. Midnight Court: boss Talixae Flamewreath. Demonic and fel-lit.
  5. Jeweled Estate (lower ballroom): nobles, staff and the gala. Spy-hunt area.
  6. Balconies (upper): boss Advisor Melandrus. Nightwell in the room. Gerenth the Vile appears here as a hostile mob. Bay views.
  Order of 1 and 2 is taken from the wiki's list and not confirmed in-game.
- **Recurring props:** Nightwell or mana well (Melandrus draws power from it; Mein-MMO). Suspicious Nobles and Chatty Rumormongers (spy-hunt NPCs). Guests and staff. Balconies and banquet space (inferred).
- **Enemy look per faction:**
  - Nightborne defenders: Duskwatch guards and sentries (Nightborne humanoids), Duskwatch Arcanists (mage-class Nightborne), City Watch captain Gerdo.
  - Legion: eredar sorceress Talixae and her Fel Covenant (Jazshariu, Baalgar the Watchful, Imacu'tya), infernal imps, Felbound Enforcers (demon), Shadow Mistresses (female sayaad demons), Watchful Inquisitors and Oculi.
  - Nightfallen traitor: Advisor Melandrus, cast out after betraying Elisande.
- **Loading screen:** Warcraft Wiki has a Court of Stars loading image. Its contents were not verified; the image could not be viewed. [THIN]
- **Music:** No source found. [THIN]

### Layout

- **Shape:** Branching, not linear. Mein-MMO describes many branches, some dead ends. Wiki lists six subregions in order: Canals, Moonlit Landing, Gilded Market, Midnight Court, Jeweled Estate (lower), Balconies (upper). Shortcuts and skips are not documented.
- **Sizes:** Not found. [THIN]
- **Set pieces:**
  - Spy hunt (Gerenth the Vile mini-game). Starts when Talixae dies. Ly'leth Lunastre provides a disguise to enter the party. Five clues come from Chatty Rumormongers' gossip. The spy is one of the Suspicious Nobles. Gossip examples: the spy avoids light clothing, carries potions. Example clues from Mein-MMO: "not a woman", "white robe". Accusing the wrong noble makes that noble suspicious. Truthguard and Demon Hunter abilities (The Light Reveals, Spectral Sight) expose the spy.
  - Class and profession party buffs (Mein-MMO): an enchanter's magic orb gives group damage up, an inscriptionist's effect gives movement speed.
  - Nightwell poison: a rogue can poison the well beforehand so the boss that drinks at 25% health dies (Mein-MMO). Attributed to Melandrus; the wiki confirms the Nightwell but not the trick. [VERIFY]
  - Fel Covenant split: each living emissary strengthens the others, so separate them (wiki).

### Trash

No Court of Stars trash source named a confirmed must-interrupt cast. The only confirmed silence is listed below.

1. **Duskwatch Arcanist** (elite, mage-class Nightborne caster, mana). Nightfall Orb: arcane bounce, hits up to 3 targets. Seal Magic: arcane burst to all within 10 yd that silences each hit for 4 s. Players cannot cast during the silence, so plan cooldowns and spacing. Interrupt status not documented.
2. **Felbound Enforcer** (elite demon). Fel Detonation: heavy fire to players in a very wide radius, then a 12 s burn. Spread out on pull. Spawns vary across the instance and affect routing.
3. **Shadow Mistress** (elite female sayaad demon, level 45 per wiki). Bewitch: slows the target by 75% and cuts haste by 50% for 8 s. Shadow Slash: shadow damage plus a 25% healing reduction for 6 s. Dispel status not documented.
4. **Vigilant Duskwatch** (reinforcements). Summoned by Gerdo's Signal Beacon. One casts Hinder, which cuts a target's haste and damage by 10% for 12 s. Kill fast.
5. **Watchful Inquisitor and Oculi** (hostile, Midnight Court). A Legion-era tip says to stun the Inquisitor's Eye Storm casts. Weak source. [VERIFY]
6. **Infernal Imp** (from Talixae's Infernal Eruption cracks). Firebolt and Drifting Embers. Heroic-only per the wiki.
7. **Guardian Constructs, Automated Sweepers, Mana Sabers and Wyrms** (Moonlit Landing, Gilded Market). Roles and abilities not documented.
8. **Engorged Manafeeder, Overgrown Eel** (Canals). Low threat; roles not documented.

**Dangerous pulls (M+):** Felbound Enforcer packs near the Midnight Court are the main risk. Route changes with party professions and interactables (Dragonflight-era guides; [VERIFY] for Legion). Trash variance is high, so a fixed trash path is hard to set.

### Bosses

1. **Patrol Captain Gerdo** (Gilded Market). Elite male Nightborne, City Watch captain, level 112 per wiki. Keeps out uninvited guests. Phases: none documented. Arena: not documented.
   - Resonant Slash: two-direction arcane slash, heavy damage and a 4 s stun on each hit.
   - Streetsweeper (Heroic only): arcane line blast after a 3 s delay. Step out of the line.
   - Arcane Lockdown: roots all players with 3 stacks for 20 s. Each stack does arcane damage per second and slows 30%. Jumping removes one stack.
   - Signal Beacon: summons Vigilant Duskwatch reinforcements (see trash).
   - Flask of the Solemn Night: self-buff of +30% haste and damage. Healers should expect the damage spike.
   - Interrupts, dispels, enrage: none listed.

2. **Talixae Flamewreath** (Midnight Court). Female Man'ari eredar sorceress (demon), elite, level 45. Fight involves the Fel Covenant emissaries (below). Phases and arena: not documented. Wiki page is a stub. [THIN]
   - Infernal Eruption: fire under all players, heavy damage and knock-up. Lingering flames burn. Cracks spawn Infernal Imps.
   - Burning Intensity: fire to all players every 3 s. Each stack adds 15% fire damage. Healers and tanks must plan for escalating damage.
   - Withering Soul: stacking debuff cutting max health and move speed. Healers dispel. Damage dealers and tanks interrupt the casting when possible (wiki wording).
   - **Jazshariu:** frontal cone, heavy physical, stun within 10 yd. Face away from the group.
   - **Baalgar the Watchful:** Disintegration Beam, ranged shadow that stacks a damage reduction. Interruptible.
   - **Imacu'tya:** Whirling Blades, area around her, physical plus bleed.
   - Emissary rule: each living emissary doubles the damage and health of the others (wiki wording: each additional member doubles). Kill or separate them early.
   - Enrage: none documented.

3. **Advisor Melandrus** (Balconies). Male Nightborne elite, level 47 per wiki. Elisande's First Blade, turned Nightfallen after betraying her. Gave up magic; uses Nightwell power for speed and reflexes. Arena: the balcony, swept by wind zones.
   - Blade Surge: dashes to a player. Physical damage in a small radius plus bleed. Leaves a stationary image of himself.
   - Enveloping Winds (Heroic): sweeps the balcony and stuns anyone it touches.
   - Piercing Gale: linear wind slash. His images copy it, so watch their facing.
   - Slicing Maelstrom: channelled blade storm that damages all players each second. Images copy it. Healers need cooldowns.
   - Nightwell: reportedly drinks at 25% health to boost himself (Mein-MMO; see the rogue trick above). [VERIFY]
   - Mythic Keystone clones: up to 8 clones spawn through the fight and amplify Slicing Maelstrom. Keep melee away from clones and avoid their Piercing Gale lines.
   - Tank damage is low; M+ notes say tanks can often keep fighting through a near-wipe. Death Knight tanks are recommended on higher Tyrannical keys.

### Mythic+ notes

- **Timer:** 30 minutes, per the Legion 7.3.5 route metadata (2018).
- **Benchmarks (Legion route):** highest timed key listed as 23 on Tyrannical and 24 on Fortified. Average pack size about 3.3 mobs.
- **Route:** variance between runs is high. Opening plan (Legion route): clear only what is needed to reach Gerdo, plus one extra wyrm pack. The rest of the route did not load. [THIN]
- **Affixes:** Tyrannical makes Melandrus's Slicing Maelstrom the big danger, so a DK tank is preferred. Fortified-specific notes not found.
- **Enemy forces quirks:** not documented.
- **Current status:** Court of Stars returned in Dragonflight Season 1. Its current M+ status is unclear. [VERIFY]

---

## Halls of Valor → our id `cesaret_salonlari` (proposed)

Sources: https://warcraft.wiki.gg/wiki/Halls_of_Valor, https://worldofwarcraft.blizzard.com/en-us/news/20243701/legion-zone-preview-stormheim (Stormheim preview), https://warcraft.wiki.gg/wiki/Hymdall, https://warcraft.wiki.gg/wiki/Hymdall_(tactics), https://warcraft.wiki.gg/wiki/Hyrja, https://warcraft.wiki.gg/wiki/Fenryr, https://warcraft.wiki.gg/wiki/God-King_Skovald, https://warcraft.wiki.gg/wiki/God-King_Skovald_(tactics), https://warcraft.wiki.gg/wiki/Odyn_(tactics), https://warcraft.wiki.gg/wiki/Valarjar_Thundercaller, https://warcraft.wiki.gg/wiki/Valarjar_Shieldmaiden, https://warcraft.wiki.gg/wiki/Stormforged_Sentinel, https://www.wowhead.com/classic/cn/halls-of-valor-mythic-keystone-guide (Legion 7.3.5 route metadata) | Expansion / patch: Legion, added in 7.0.3 (July 2016). Shares Stormheim with the Trial of Valor raid, whose Odyn, Hymdall and Hyrja mechanics overlap with the dungeon [VERIFY]. Brewfest decor is a seasonal variant.

**Setting:** The Halls sit high in the clouds above Stormheim. Odyn, keeper of the Valarjar, had Helya lift a section of Ulduar into the sky. The Halls are where the greatest vrykul champions serve as Valarjar. Skovald, a vrykul king working with the Burning Legion, races the player to the Pillar of Creation, which lies here. Helya later cursed Odyn into the Halls.

### Art & atmosphere

- **Architecture:** Norse Valhalla feel. Fortified stone feasting halls and hunting grounds (wiki). Vrykul architecture is stone, fortified and long-established, with high walls and burrowed temples (Stormheim preview).
- **Materials (derived):** dark basalt stone, weathered grey stone, iron and steel (iron vrykul), gold trim on the Valarjar, timber in the feasting hall.
- **Colour palette (derived from the Stormheim preview and described features; not official):**
  1. Basalt charcoal: dark mountain stone (preview).
  2. Mist grey: cloud banks and mist (preview).
  3. Storm slate-green: mid-height green mountains under storm cloud (preview).
  4. Lightning white-violet: the storm over the Halls and lightning mechanics (preview; Static Field).
  5. Autumn gold: the bright, golden, fall-like phase of the zone (preview).
  6. Forge bronze and iron: Stormforged Valarjar and iron vrykul (inferred).
  7. Holy white: Hyrja's Olmyr mystic and Sanctify orbs (mechanics).
  8. Feast amber: the Hearth of Revelry fires and mead (inferred; seasonal tankards).
- **Lighting:** Overcast storm light. The storm over the Halls is visible across the zone (preview). Inside the dungeon, lightning flashes and cold blue-grey storm light (inferred), with warm amber in the feasting hall (inferred) and Holy white at the Seat of Ascension (mechanics). Mist from the zone carries into the halls (inferred).
- **Signature landmarks (run order):**
  1. The High Gate: Hymdall's platform. Drakes strafe it under a storm.
  2. Hearth of Revelry: feasting hall with mead tables and tankards. Not a boss room.
  3. Seat of Ascension: Hyrja's room with two mystic pillars, Solsten (Thunder) and Olmyr (Holy).
  4. Fields of the Eternal Hunt: Fenryr's worg and bear camp. Grizzlies roam here.
  5. Hall of Glory: Skovald and Odyn. Odyn's throne and the Aegis of Aggramar.
  6. Ephemeral Way: connecting passage.
  Skyhold is a separate section, not run in the dungeon.
- **Recurring props:** mead tables and tankards; mystic pillars (Solsten, Olmyr); Hymdall's Horn of Valor; Valarjar Rune-Sigils (drop item only).
- **Enemy look per faction:**
  - Valarjar: iron vrykul Sentinels and Hymdall; male vrykul Thundercaller (giant); female vrykul Shieldmaidens. Armoured, storm-themed.
  - Val'kyr: Hyrja, female, "Chosen of Eyir". Ascendant Valkyr models were shown at BlizzCon 2015.
  - Wild: Ebonclaw worgs and Steeljaw grizzlies (Fields).
  - Storm drakes: Hymdall's adds.
  - Legion-aligned vrykul: Skovald and his Tideskorn, fire-themed.
- **Loading screen:** Warcraft Wiki says the Halls share a loading image with Skyhold. Contents not verified. [THIN]
- **Music:** Stormheim's score is credited to Russell Brower, but its mood is not described. [THIN]

### Layout

- **Shape:** Mostly linear with one fork. Hymdall opens the run. From there the route splits (one side to Hyrja, one side to Fenryr) and rejoins for Skovald and Odyn. Icy Veins excerpt and search summary; unverified. [VERIFY]
- **Sections in order (wiki subzones):**
  1. The High Gate (Hymdall). First boss.
  2. Hearth of Revelry. Feasting area. Not a boss room.
  3. Seat of Ascension (Hyrja) or Fields of the Eternal Hunt (Fenryr). Route fork.
  4. Hall of Glory (Skovald, Odyn). Final section.
  5. Ephemeral Way. Connecting passage.
- **Sizes:** Not found. [THIN]
- **Set pieces:**
  - Hymdall's horn summons drakes. Drake count grows with each horn.
  - Hyrja's mystic stacks: standing near a mystic adds stacks; moving away slowly removes them.
  - Fenryr retreats to a den when wounded. One French strategy guide reports a second location at 60% health. Single source. [VERIFY]
  - Skovald's Aegis of Aggramar can be taken and used as a frontal shield.
  - Odyn's Favor (75% movement speed) is granted after Hyrja or Fenryr. Odyn's Blessing (150% movement speed) after both. Search summary; Raider.io notes agree on the Blessing speed. [VERIFY]
- **Skips and shortcuts:** None documented.

### Trash

1. **Valarjar Thundercaller** (elite, male vrykul giant, mana). Thunderous Bolt: single-target heavy nature. Thunderstrike: area nature within 8 yd with a 3 s stun. Community guides say to kick the Thundercaller; the wiki does not confirm which casts are interruptible. Never pull two (Raider.io).
2. **Valarjar Shieldmaiden** (elite, female vrykul, melee, level 45). Mortal Hew: frontal sweep of about 180 degrees, and hit targets get 10% less healing for 8 s. Breach Armor: stacking armour reduction. Melee should avoid these pulls on Fortified weeks (Raider.io).
3. **Stormforged Sentinel** (elite, male iron vrykul, role not stated). Charged Pulse: nature damage within 15 yd and knockback. Crackle: lightning line. Protective Light: self-shield at 30% health. Sentinel's Watch: nearby Valarjar become immune to stuns and interrupts. Kill the Sentinel first or pull away from it. Thunder Shock (Stormheim): nearby group damage cut 50% for 15 s. Patrols are easy to pull by accident (Raider.io).
4. **Storm Drake** (Hymdall adds). Breathes lightning that leaves a Static Field (nature damage every 2 s). Focus first. The tank needs a defensive for each breath and should face the drake away from the group (Wowhead route summary).
5. **Ebonclaw Worg** (beast, role not stated). Leaps at ranged players. A ranged player who keeps moving makes the worg land behind them (Raider.io).
6. **Steeljaw Grizzly** (kite-only beast). Pull only after Hyrja and Fenryr are dead; Odyn's Blessing speed makes kiting possible (Raider.io).

**Dangerous pulls (M+):** two Thundercallers; Shieldmaiden packs for melee on Fortified; Stormforged Sentinel patrols; Thundercaller and Sentinel packs needing humanoid crowd control (Wowhead route: bring stuns and long CCs for humanoids).

### Bosses

Order: Hymdall, then Hyrja or Fenryr (fork), then Skovald and Odyn. Skovald's exact position relative to Hyrja and Fenryr is not confirmed. [THIN]

1. **Hymdall, the Guardian** (The High Gate). Male iron vrykul Valarjar, gatekeeper of the Halls. Arena: a platform that drakes strafe. Phases: horn casts are the main trigger; no formal phases documented.
   - Horn of Valor: physical blast to all, summons storm drakes. The count rises with each cast.
   - Storm Drakes: strafe the platform and breathe lightning. Lightning leaves a Static Field (nature damage every 2 s in the zone).
   - Ball Lightning (Heroic): the Static Field spawns spreading electrified tornadoes. Touching one is heavy nature damage.
   - Dancing Blade: a blade thrown at a random player. It lands and spins, dealing physical damage every 2 s to everyone in the zone. Move out.
   - Bloodletting Sweep: frontal cone, heavy physical, 25% healing reduction and a 4 s bleed. The tank keeps the frontal away from the group. Healers plan for the healing reduction. DPS stay out of the frontal and the zones.
   - Interrupts, dispels, enrage: none listed.

2. **Hyrja, Chosen of Eyir** (Seat of Ascension). Female val'kyr, elite, mana user, level 10-45 per wiki. [VERIFY: mechanics may include Trial of Valor content]
   - Mystic stacks: near Solsten she gains Thunder stacks; near Olmyr she gains Holy stacks. Each stack adds 10% damage every 4 s. Stacks fade when she is away from a mystic.
   - Shield of Light: knockback beam aimed at the tank. Nobody stands in front of her.
   - Eye of the Storm (Thunder): 9 s room-wide storm. A protective bubble at her feet reduces nature damage.
   - Arcing Bolt: chain lightning, 5 jumps. Spread out (everyone except melee).
   - Sanctify (Holy): light orbs that damage anyone who touches them.
   - Expel Light (Holy): a marked player's burst hits everyone within 8 yd after a short delay. Marked player moves away.
   - Tank: swap Hyrja between Solsten and Olmyr to control stacks. Well-geared groups may burn her without swapping (wiki).
   - Mythic Keystone: the Eye of the Storm damage reduction scales with keystone level (hotfix October 2016). Some other notes are marked as difficulty-specific but the difficulty is not named.

3. **Fenryr** (Fields of the Eternal Hunt). Male worg, Fields' apex predator. Arena: den or bear camp. Often found captured in the vrykul camp or in a cave guarded by bears. Retreats to his den when wounded.
   - Claw Frenzy: physical to all enemies within 12 yd. Always hits and ignores armour. Melee DPS share the hits.
   - Unnerving Howl: interrupts all casting for 3 s. Heroic: after he is wounded, summons three Ebonclaw Worgs (+15% damage per nearby pack member).
   - Ravenous Leap: leaps at random players. Heavy physical within 10 yd of the impact, and the target bleeds. Do not stand next to the targeted player.
   - Scent of Blood (Deadly): fixates a random target for 6 s. The target runs away.
   - Dispels: none listed. Enrage: none documented.

4. **God-King Skovald** (Hall of Glory). Male vrykul, ruler of the Tideskorn and King of Stormheim, rides Vaengir. Joined the Burning Legion; corrupted the trials. Fights for the Aegis of Aggramar. Arena: Hall of Glory.
   - Ragnarok: fire to all enemies every 1.5 s for 9 s. Each cast adds 25% damage. The Aegis is the main defence.
   - Felblaze Rush: charges a random player, heavy fire within 10 yd. Avoid clumping.
   - Savage Blade: heavy physical on the tank. Applies Ragged Slash (physical every 2 s for 20 s) unless the target has active mitigation.
   - Aegis of Aggramar: a holder gets a shield absorbing frontal damage for about 9-12 s.
   - Flame of Woe (Heroic): while Skovald is shielded, a flame fixates a random player every 1.5 s and leaves Infernal Flames that stack and burn every 0.5 s.
   - Interrupts, dispels: none listed.

5. **Odyn, Keeper** (Hall of Glory, final boss). Titan Keeper, ruler of the Valarjar. [VERIFY: the Odyn tactics page lists raid-style mechanics]
   - Dungeon ending: the group cannot kill him at 5-player level. The fight ends at about 80% health and Odyn deems the group worthy (wiki tactics and search summary agree).
   - Unworthy: a player who would die is removed at 1 health and sits out until the fight ends.
   - Runic Brand: each player gets a brand for 12 s that deals holy damage every 2 s. Run to the floor rune matching your brand to cleanse it. The cleanse gives Branded: +50% damage and healing, +25% movement speed and a full heal. [VERIFY dungeon]
   - Spear of Light: a spear appears at a player. Heavy holy damage within 8 yd and lighter to everyone else. The spear keeps dealing holy damage to nearby players while active. Heroic: each spear spawns 3 Glowing Fragments.
   - Glowing Fragment (Heroic): touching one stuns for 3 s and deals heavy holy damage.
   - Shatter Spears: active spears burst into 3 fragments each.
   - Radiant Tempest: a long cast, then heavy holy damage to all players and a knockback within 30 yd. Get clear.
   - Stormforged Obliterator (Heroic add): interruptible Surge (nature to all). Each successful Surge halves the next cast time, stacking. Stun and interrupt while killing it.
   - Rewards: Odyn's Favor and Odyn's Blessing as in the Layout section. [VERIFY]

### Mythic+ notes

- **Timer:** 45 minutes, per the Legion 7.3.5 route metadata (2018).
- **Average pack size:** about 2.5 mobs (2018 route).
- **Route (2018, partial):** pull the first two packs together, using tank cooldowns on their heavy hits. Kill the Thundercaller first. In the bigger pack, the Storm Drake gets priority; the tank uses a defensive per breath and faces the drake away from the group. Bring stuns and long CCs for humanoids.
- **Key rules (Raider.io):** never pull two Thundercallers; kite-heavy dungeon; watch melee for cleaves and frontals; Shieldmaiden packs are dangerous for melee on Fortified; Stormforged Sentinel patrols are easy to pull by accident; pull Steeljaw grizzlies only after Hyrja and Fenryr.
- **Timer save:** the mead tables in the Hearth of Revelry let you multi-pull at the end, saving about 30 s (a 2023 community comment; unverified).
- **Affixes:** Fortified makes Mortal Hew more dangerous for melee (Raider.io). Tyrannical notes not found.
- **Current status:** not in the Midnight Season 2 M+ pool (search summary). Legion-era routes and timers only.

---

## Thin spots and unverified items

- **Court of Stars art:** no official palette, lighting, fog, materials or music source. Loading image exists on the wiki but was not viewed. Palette is derived.
- **Halls of Valor art:** only the Stormheim preview for palette and lighting. No architecture detail for the interior, no music mood, loading image not viewed.
- **Route data:** Icy Veins blocked (403). Wowhead route bodies did not load. No Court of Stars route order, pull count or section sizes. Halls route is 2018 Legion-era notes only.
- **Court of Stars bosses:** arenas, phases, interrupts, dispels and enrage undocumented for Gerdo, Talixae and Melandrus. Tactics pages returned 404. Talixae's wiki page is a stub.
- **Halls bosses:** Hyrja and Odyn mechanics may include Trial of Valor raid content. Skovald and Odyn order vs Hyrja and Fenryr not confirmed. Fenryr's 60% relocation is one French guide. Odyn's Favor and Blessing speeds come from a search summary; Raider.io agrees on the Blessing.
- **Level conflicts:** Court of Stars is "level 45" on the wiki but "level 110" in a search summary. Halls is "10-45" on the wiki but "70" in a search summary. Boss levels range widely (Gerdo 112, Thundercaller 100-110, Melandrus 47, Fenryr 12-47, Hyrja 10-45, Sentinel 11-46, Shieldmaiden 45, Talixae 45). Choose one scaling for our game.
- **Interrupt flags:** the wiki rarely says whether a cast can be interrupted. Confirmed only for Baalgar's Disintegration Beam (wiki), the Obliterator's Surge (tactics page) and Fenryr's Howl (which interrupts you). Thundercaller kicks are community advice.
- **Version mix:** Dragonflight Season 1 Court of Stars sources were not used for layout. Halls sources mix Legion dungeon and Trial of Valor raid mechanics.
