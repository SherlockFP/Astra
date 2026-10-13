# WoW dungeon reference: Shadowlands + The War Within

Research snapshot: 2026-10-13. Target dungeons: Halls of Atonement (Shadowlands) and Ara-Kara, City of Echoes (The War Within).
Our ids were not given in the request; the slugs `halls-of-atonement` and `ara-kara` are used below.

Confidence tags used in this file:
- [src] taken from a source page or a source summary.
- [inf] inference or designer proposal, not stated in any source.
- [thin] no usable source found; needs in-game screenshots or the official art book.

Source access: Icy Veins returned HTTP 403 on every fetch. Its content is only known from search snippets, and it is marked where used. The Method guides are by Tactyks (Season 3, last updated 2025-08-08), so their numbers may be out of date.

---

## Halls of Atonement → our id halls-of-atonement

Sources:
- https://warcraft.wiki.gg/wiki/Halls_of_Atonement_(instance)
- https://warcraft.wiki.gg/wiki/Halls_of_Atonement
- https://warcraft.wiki.gg/wiki/Ceremony_Ward
- https://warcraft.wiki.gg/wiki/Halkias
- https://warcraft.wiki.gg/wiki/Lord_Chamberlain
- https://warcraft.wiki.gg/wiki/Lord_Chamberlain_(tactics)
- https://www.method.gg/guides/dungeons/halls-of-atonement
- https://news.blizzard.com/en-us/article/23391567/shadowlands-preview-revendreth-and-the-venthyr-covenant
- Blizzard Shadowlands content notes, https://news.blizzard.com/en-us/article/23529209/shadowlands-content-update-notes (read via search snippet)

Expansion / patch: Shadowlands, patch 9.0.2 (2020-11-17). Revised in The War Within: Sept 2025 hotfixes (Halkias shards, courtyard density, enemy forces, Echelon door), Aug 2025 Lord Chamberlain changes, and Patch 12.0.0 (2026-01-20). Dungeon is level 57-60 in its original form, 5 players, cross-faction, Venthyr and Stoneborn races. Development name was "Revendreth Cathedral" [src].

### Art & atmosphere

Setting [src]: A cathedral and judgement complex on a mountain in the north-east of Revendreth's Ceremony Ward. The halls fill the whole ward. During development the ward was called the "Cathedral Ward". The halls were built to redeem proud souls and keep them out of the Maw. Under the Lord Chamberlain they have become an anima harvest, and many souls are left beyond redemption. The mood is decay and perverted ritual, not open horror.

Architecture [src + inf]: Gothic ecclesiastical stone. Blizzard's preview describes a courtyard with gargoyles in front of a church that is unlike anything on Azeroth. Venthyr rituals take place here: absolution, judgement, and sealing souls in Atonement Crypts. The Bell of Rebuke and the reliquaries are lore props. The Sinstone Archive stores sinstones, which are tombstone-like records of each soul's sins and true name.

Zone-level direction [src]: Revendreth is a gothic castle realm with graves, mausoleums and tombstone motifs. The Village Ward looks like it is rotting. Verticality was a major design goal. Secondary source: a zone artist's portfolio describes the halls as a wing of the Cathedral Ward, set outdoors in the zone, and a throwback to Scarlet Monastery. That portfolio was not reachable (HTTP 403), so this comes from a search summary only.

Materials [src + inf]: Dark carved stone, bone-like carved elements, sinstone, iron or gold trim, and tombstone shapes. The Nathrian Ferula transmog guide describes the staff's look as drawing on the dungeon's gothic style: a dark shaft with carved bone and a crimson glow at the head.

Colour palette (PROPOSED, not sourced, derived from the described materials and the Venthyr mood):
1. Venthyr crimson, approx #8E1B24, the main accent
2. Ferula glow red, approx #C8382F, for sinstone and boss glows
3. Cold cathedral stone grey, approx #4E4B55, for the base walls
4. Sinstone black-violet, approx #1D1826, for shards and archives
5. Bone ivory, approx #D7CDBA, for carvings and altars
6. Dredge muck olive-brown, approx #3E3A22, for dredger and groundskeeper areas
7. Anima and candle gold, approx #C9A24A, for warm light pools

Lighting [thin]: No source describes it. Proposal: low-key interiors, cold blue-grey light from high windows, warm candle pools near altars, and red accent glows around sinstones and arenas. Revendreth is permanently overcast.

Fog [thin]: No source. Proposal: low mist in the courtyard and cleaner air inside.

Landmarks in run order (section order from Method): the tower entrance on the Edge of Sin, then the Halkias sections with the three sinstone shards, then the courtyard with gargoyles before Echelon, then Echelon's door and arena, then the High Adjudicator's church hall with its vessels, then the Lord Chamberlain's statue hall. The wiki names five subregions in alphabetical order, not play order: The Crimson Apse, The Dais of Pride, The Narthex of Sins, The Nave of Pain and The Sanctuary of Souls. Their mapping to the sections is unknown [thin].

Recurring props [src]: sinstone shards (three), Vessels of Atonement (four, sealing spirits), Sinstone Statues (the Lord Chamberlain's projectiles), gargoyles, Atonement Crypts, reliquaries, and the Bell of Rebuke.

Enemy look per faction:
- Venthyr and depraved servants [inf from Blizzard preview]: vampiric courtly punishers in cloth, leather and plate. Depraved Darkblade, Houndmaster, Obliterator, Collector, and Inquisitor Sigar.
- Stoneborn and Stone Legion [src]: sculpted stone gargoyle-like soldiers. Stoneborn Slasher, Reaver, Eviscerator, Echelon, the Stonefiend Anklebiter, and the Undying Stonefiends.
- Gargons [src]: chiseled quadrupeds that look like night monsters, with Vicious Gargon as the trash variant.
- Dredgers and Toiling Groundskeepers [src]: crude creatures made of primordial muck.
- Spirits [inf]: translucent Ghostly Parishioners.
- Sinstone golems [src]: Halkias and his shards.

Loading screen [thin]: Not found. The wiki gives only the file name.
Music [thin]: Not found.
Key art [thin]: The wiki says the Cathedral of Atonement appears in Hearthstone art. It was not analysed.

### Layout

Shape: linear, four sections, each ending in a boss.

Sections in order (Method):
1. Halkias: trash packs, then three Shards of Halkias that must all die to spawn the boss, then the Halkias boss. Depraved Obliterators and Collectors spawn near the shards, and their number was reduced in the Sept 2025 hotfix.
2. Courtyard and Echelon: a courtyard before Echelon with dense trash (density reduced Sept 2025). Trash is Stoneborn Reaver, Eviscerator and Anklebiter. Echelon's door is clicked to start the fight. A Sept 2025 hotfix fixed the door not opening after Echelon died.
3. High Adjudicator Aleez: boss only, with four vessels around the room.
4. Lord Chamberlain: trash (Inquisitor Sigar and Tormented Souls, Manifestation of Envy), then the final boss room with statues.

Approximate sizes [thin]: not documented.
Shortcuts [src]: none documented. Stoneborn Slashers turn to stone out of combat, so players can run past them.

Set pieces and environmental mechanics:
- Halkias circle: leaving the circle applies a fear (Sinlight Visions) that must be dispelled.
- Refracted Sinlight: four rotating beams from Halkias at full energy.
- Echelon's Flesh to Stone stun followed by Stone Shattering Leap.
- Aleez's Ghostly Parishioner kiting into an open vessel.
- Lord Chamberlain's statues and beam soaks.
- Glass shard puddles from Halkias's slam and debris.

### Trash

Role tags: [melee], [caster], [healer], [elite]. Interrupt (I), dispel (D), frontal (F), stun (S).

1. Depraved Darkblade [melee]: a stacking damage-amplification debuff on the tank. (D)
2. Depraved Houndmaster [ranged]: shoots random players. Interrupt the Loyal Beast casts so nearby Gargons do not enrage. Killing Houndmasters removes the Gargons' buff. (I)
3. Vicious Gargon [melee]: a stacking bleed on the tank. Cleanse, or kite the bleed stacks.
4. Depraved Obliterator [caster]: Wicked Bolt must be interrupted (I). Mark of Obliteration goes to a random player: dispel it or move away (D).
5. Depraved Collector [caster]: Siphon Life is channelled into a random player. Interrupt or CC it (I/CC).
6. Stoneborn Slasher [melee, immune to CC]: a frontal cone (F), a knockback, and an interrupting screech (I). Goes to stone out of combat.
7. Stoneborn Reaver [melee, immune to CC]: Mortal Strike needs a defensive and applies a large healing reduction. Turn to Stone stuns nearby enemies for 8 seconds (S). A magic dispel removes the stun (D).
8. Stoneborn Eviscerator [melee]: Hurl Glaive cleaves, so spread the group (F/cleave).
9. Stonefiend Anklebiter [melee]: Ankle Bite on random players, stacking bleeds. Cleanse or use defensives (D).
10. Toiling Groundskeeper [melee, skittish]: near 30% health it drops packs. Use CC to stop it pulling extra.
11. Inquisitor Sigar [caster, immune to CC]: Dark Communion heals him, so cleave down the neutral Tormented Souls to reduce it. Disperse Sin is a small AoE with a puddle. Display of Power amplifies all damage and healing, so spread before it expires. Manifestation of Envy: if Mark of Envy lands on you, slow or CC it.
12. Shards of Halkias (three) [immune to CC]: Thrash is an 8-second group channel. Sin Quake places circles under all players.

Interrupt priority: Wicked Bolt, Siphon Life (or CC), Loyal Beast casts, the Slasher screech, Villainous Bolt (Echelon's Stonefiend casts), Anima Bolt, and Volley of Power.
Dispel priority: Sinlight Visions, Unstable Anima, Mark of Obliteration, Turn to Stone, and Stonefiend bleeds.
Frontals: Stoneborn Slasher cone, Lord Chamberlain's Unleashed Suffering on a random target.
Stuns: Turn to Stone (Reaver, 8s), Flesh to Stone (Echelon).

Mythic+ dangerous pulls [inf from the sources]:
- Halkias shard pulls with Obliterators and Collectors next to the shards.
- The courtyard before Echelon, which was dense until its Sept 2025 reduction.
- Reaver plus Slasher packs, since both are immune to CC and the Reaver stuns.
- Houndmaster and Gargon packs.
- Sigar packs, where Display of Power can wipe the group if it is not spread.

### Bosses

**1. Halkias, the Sin-Stained Goliath** (elite, Elemental type, level 59-62)
- Look [src]: a massive sinstone golem. Lore: neglected sinstones were fed power until they grew into him.
- Arena: a large circle around the boss. Leaving the circle gives Sinlight Visions, a Magic fear that procs every few seconds. Dispel it to run back in.
- Before the boss: three shards (immune to CC). Thrash and Sin Quake are the dangerous abilities.
- Crumbling Slam: a tank hit that leaves Glass Shard puddles. Place it over existing puddles.
- Heave Debris: targets a random player and leaves a puddle. Bait it near existing puddles to save space.
- Refracted Sinlight: at full energy Halkias casts four rotating beams that switch direction. Move the group before the energy bar fills so there is room to dodge without touching puddles.
- Intermission or enrage: none documented [thin].
- Patch notes: an Oct 2025 hotfix fixed a bug where Crumbling Slam visuals disappeared at high jumps.

**2. Echelon** (Stoneborn soldier, the Lord Chamberlain's right hand)
- Look [src]: a veteran Stoneborn who watches the halls from the sky.
- Start: click the door.
- Blood Torrent: puddles under random players. Bait them into existing puddles.
- Stone Call: summons six Undying Stonefiends. Tanks pick them up. Fight near the middle of the room. Interrupt Villainous Bolt to keep them grouped.
- Undying Stonefiends explode at 0 health (Volatile Transformation), then regenerate fully over 30 seconds. Do not stack that explosion with other damage.
- At full energy: Flesh to Stone on a random non-tank player. It slows, then stuns that player and anyone within 5 yards.
- Stone Shattering Leap from the stunned player destroys the regenerating Stonefiends in the circle and knocks back nearby players. The group should gather near the regenerating Stonefiends. The stunned player positions to hit as many as possible and the others move out.
- Intermission or enrage: none documented [thin].

**3. High Adjudicator Aleez** (presides over congregation spirits)
- Look [src]: a figure who separates sin from form and stores anima in vessels.
- Unstable Anima: two players receive a DoT. Spread them so it does not cleave. Dispel one quickly. The other needs a defensive or extra healing until the next dispel. A Warlock's Imp or the Dwarf racial also works.
- Spectral Procession: spawns an invulnerable Ghostly Parishioner that fixates a random player and deals growing shadow damage every second. The fixated player kites it into an open Vessel of Atonement, which seals it. There are four vessels, and closed vessels are replaced over time, so check before kiting.
- Parishioners emit Pulse from Beyond until sealed.
- Volley of Power: interrupt it to prevent party-wide damage.
- Anima Bolt: interrupt it to reduce tank damage.
- Anima Fountain: avoid the circles.
- Intermission or enrage: none documented [thin].

**4. Lord Chamberlain** (final boss, Venthyr servant of Denathrius, level 59-62 elite)
- Look and lore [src]: he took control of the halls by deceit after deposing the High Accuser, and he is hoarding anima.
- Soul Flay: a 5-second shadow DoT on a target (wiki).
- Telekinetic Toss: throws the four Sinstone Statues in lines. Do not aim statues at other statues, because the bounce deals extra damage.
- Unleashed Suffering: a random-target frontal.
- Erupting Torment: circles around the boss and all four statues. Radius cut from 14 to 10 yards and damage reduced 22% in the Aug 2025 hotfix.
- Telekinetic Collision: damage reduced 30% in the Aug 2025 hotfix.
- Stigma of Pride: removed in the Aug 2025 hotfix. It was a damage debuff that increased the longer it stayed on a player.
- At 70% and 40% health, Chamberlain's Chorus begins: he teleports to the centre, pulls the statues in, and fires them outward. Each statue impact is a separate hit, so several specs need a defensive to survive a one-shot.
- Ritual of Woe: a 10-second channel that beams all four statues. Intercept beams to take the damage yourself. Method's split: the tank intercepts two beams, and another player with a major defensive or immunity intercepts the other two. Alternatively, split the beams across personal cooldowns.
- Ritual of Woe group damage was reduced 38% in the Aug 2025 hotfix. Patch 12.0.0 (Jan 2026) changed the cooldown reset after the ability.
- Most of the damage comes in the intermission [src, Monk guide snippet].

### Mythic+ notes
- Timer [thin]: 32 minutes, after an Aug 2021 hotfix raised it from 31 (Shadowlands era, from a search snippet). The current timer is unknown.
- Enemy forces [src]: the Sept 2025 hotfix reduced the requirement by 10%, and raised the value of Stoneborn Slashers by 50%.
- Route [src]: Method gives a PUG-friendly route only as an MDT import link, so pulls were not accessible [thin].
- Affixes [thin]: the Method page links to an affixes section that did not load. No affix interactions are documented.
- Season status: a Sportskeeda list includes Halls in The War Within Season 3's rotation. One search summary says it is not in the Midnight Season 2 pool. That claim was not verified against Blizzard.
- Difficulty [src]: an Icy Veins headline from Season 3, week 3 says players were still failing Halls (snippet). Halkias's beams drew complaints (snippet).

---

## Ara-Kara, City of Echoes → our id ara-kara

Sources:
- https://warcraft.wiki.gg/wiki/Ara-Kara,_City_of_Echoes
- https://warcraft.wiki.gg/wiki/Azj-Kahet
- https://warcraft.wiki.gg/wiki/Ki%27katal_the_Harvester
- https://warcraft.wiki.gg/wiki/Engorged_Crawler
- https://warcraft.wiki.gg/wiki/The_Art_of_The_War_Within
- https://www.method.gg/guides/dungeons/ara-kara-city-of-echoes
- https://www.wowhead.com/ptr/quest=82502 (the Worldsoul quest, read via fetch)
- Icy Veins Season 3 tuning (https://wp-prod.icy-veins.com/season-3-dungeons-made-easier-last-minute-mythic-tuning-and-fixes/), read via search snippet only
- Wowhead Season 3 PTR report, July 2025 (URL not retrieved), read via search summary only

Expansion / patch: The War Within, patch 11.0.2 (2024-08-13). Pre-release name was "Old City". Level 78-80, 5 players, neutral. Tuning: Sept 2024, Season 3 PTR (July 2025, with art rework), Season 3 pre-launch, Sept 2025, and Patch 12.0.0 (2026-01-20).

### Art & atmosphere

Setting [src]: Azj-Kahet, the deepest part of Khaz Algar. Ara-Kara is the ruined earlier layer of the City of Threads, lying beneath it. Ansurek's faction harvests Black Blood here to push nerubian ascension. Ki'katal supervises the harvest beneath Queen Neferess's citadel. The wiki also describes the City of Threads as built on top of itself over and over as its districts decay, and the vertical social order carries down into the ruin.

Location conflict [thin]: the Azj-Kahet wiki places the dungeon in "The Burrows" inside the City of Threads. Icy Veins places it on the south side of Azj-Kahet (snippet). Unresolved.

Architecture [inf]: a collapsed nerubian city. Stacked and vertical spaces, with silk webbing across openings and undercrawler egg sacs hanging overhead. Gossamer Onslaught drops eggs from above, which implies high ceilings.

Materials [src + inf]: silk webbing (grey-white, sticky), chitin carapace, Black Blood (dark, pooling fluid), venom and poison ooze (green), and ancient nerubian stone.

Colour palette (PROPOSED, not sourced):
1. Black Blood oxblood, approx #1B0C10, for the base of the harvest pools
2. Black Blood sheen, approx #5A1733, for glows and reflections
3. Web silver-grey, approx #A7A9B4, for silk and webs
4. Egg and pale chitin, approx #C9D2B0, for eggs and carapace
5. Venom green, approx #7DB240, for poison and Cultivated Poison
6. Undercrawler bronze-brown, approx #6B4B2E, for beast bodies and dirt
7. Swarm haze amber, approx #9A7A45, for Ceaseless Swarm clouds

Lighting [thin]: no source. Proposal: almost total darkness, lit by Black Blood glows, poison-green pools, and light catching the webs. Swarm clouds diffuse light.

Fog [src + inf]: no ambient fog is documented. Gameplay fog comes from Ceaseless Swarm clouds, including Anub'zekt's 25-second Eye of the Swarm cloud.

Landmarks in run order (boss order from Method; subzone mapping from the wiki): the Shredded Strands, where you kill the attendant minibosses Ixin, Nakt and Atik to summon Avanoxx, with her egg-covered web platform. Then Echoing Overlook, Anub'zekt's arena with the Eye of the Swarm. Then The Undercache, Ki'katal's arena where Black Blood is hauled to her. The subzone order is inferred [thin].

Recurring props [src]: undercrawler eggs, webs, Black Blood puddles, Bloodworkers with their cargo, and bodies of Discordant Attendants. Tailors with at least 25 Khaz Algar skill can break the tether on those bodies to get a 12-second stun, which works on the first-area minibosses.

Enemy look per faction (neutral territory):
- Nerubian harvest staff and attendants [src]: Bloodstained Assistant, Webmage, Bloodguard, Stagshell, Blood Overseer and Reinforced Drone.
- Undercrawler beasts [src]: Ravenous, Engorged and Starved Crawlers. Engorged Crawlers are elite.
- Flyers [src]: Jabbing Flyer and Winged Carrier.
- Ascended bosses [src]: Anub'zekt is an overseer who has not yet earned ascension. Ki'katal is an ascended nerubian.

Loading screen [thin]: an image captioned "Loading screen", with no description.
Music [thin]: not found.
Key art and concept [thin]: "The Art of World of Warcraft: The War Within" is a 208-page Blizzard book from Aug 2024. Chapter 5 is Azj-Kahet. It was not accessed, and it is the best next source for the real palette.
Visual rework [src]: the Season 3 PTR (July 2025) reworked the dungeon's art throughout the instance (Wowhead summary). Details of the new visuals were not found, so use the current live version as the reference.

### Layout

Shape: linear, three boss encounters in order. Trash clears per subzone.

Sections (Method's grouping by boss):
1. The Shredded Strands: Avanoxx trash. Kill the minibosses Ixin, Nakt and Atik (all three must die) to summon Avanoxx.
2. Echoing Overlook: Anub'zekt trash, then Anub'zekt.
3. The Undercache: Ki'katal trash, then Ki'katal.

Approximate sizes [thin]: not documented.
Shortcuts [thin]: none found.
Set pieces and environmental mechanics:
- The attendant gate: three minibosses (immune to CC) must die first.
- Avanoxx's egg platform with Starved Crawlers.
- The Eye of the Swarm arena.
- The Bloodworker cargo haul.
- The Cosmic Singularity pull.
- The Cultivated Poison waves.
- The Discordant Attendant tether stun for tailors.

### Trash

Role tags: [melee], [caster], [healer], [elite]. Interrupt (I), dispel (D), frontal (F), stun (S).

Avanoxx section:
1. Ravenous Crawler [melee]: Ambush hits a random player more than 8 yards away. Stack close to avoid it.
2. Engorged Crawler [melee, elite]: Venomous Spit puts a poison DoT on a random player, dealing nature damage every second for 8 seconds (D). Toxic Rupture: at low health it explodes, dealing nature damage and knocking back players within 8 yards. The Sept 2025 hotfix increased Venomous Spit's cooldown by 40%.
3. Jabbing Flyer [melee]: Bleeding Jab applies a stacking bleed to random players. Use defensives or bleed cleanses as stacks grow.
4. Trilling Attendant [caster]: Resonant Barrage is a heavy group channel (I/CC). Web Bolt goes to a random player and can take spare interrupts. Sept 2025: Resonant Barrage's cooldown increased and its periodic damage reduced 12.5%.
5. Mini-bosses (all three must die):
   - Ixin [caster, immune to CC]: interrupt every Horrifying Shrill (I). Web Spray is a frontal on a random player that leaves puddles (F). Web Bolt takes spare interrupts.
   - Nakt [caster, immune to CC]: Call of the Brood spawns Ravenous Crawlers on random players, so group up for the tanks. Web Spray and Web Bolt as above.
   - Atik [caster, immune to CC]: Poisonous Cloud leaves a puddle under a random player. Poison Bolt hits the tank, so interrupt spare casts and dispel the DoT (I/D).

Anub'zekt section:
6. Bloodworker [melee]: Charge hits a random player more than 8 yards away. Stack close.
7. Bloodstained Assistant [melee]: Extraction Strike hits the tank and heals the enemy. Use tank defensives.
8. Bloodstained Webmage [caster]: interrupt every Revolting Volley (I). If one lands, dispel as many poison debuffs as possible (D). Web Bolt takes spare interrupts.
9. Hulking Bloodguard [melee, immune to CC]: Bulwark of the Weak makes it a priority target. Impale is a line on a random player. At full energy it channels Locust Swarm on the group, so use defensives and healing cooldowns.
10. Sentry Stagshell [caster]: tries to cast Alarm Shrill, which aggroes everything within 50 yards and spawns an extra Hulking Bloodguard. Chain CC and kill it first (I/CC).

Ki'katal section:
11. Blood Overseer [caster, immune to CC]: interrupt every Venom Volley (I). Dispel poisons if one lands (D). Avoid the swirlies from Erupting Webs.
12. Reinforced Drone [melee]: its first hit creates a Black Blood puddle. Avoid it, and use CC or root breaks if caught. Tanks get a stacking magic DoT, Tainted Blood, from Black Blood Drenched Claws. Dispel it or use defensives (D).
13. Winged Carrier [flyer]: same Black Blood puddle on the first hit. Dashing Strike hits a random player, so use defensives as needed.

Mythic+ dangerous pulls [inf from the sources]:
- Attendant minibosses, since all three are immune to CC and must all die.
- Sentry Stagshell's Alarm Shrill, which aggroes the room and adds a Bloodguard.
- Hulking Bloodguard at full energy, which channels Locust Swarm on the group.
- Ravenous Crawler ambushes, which can cut DPS and add pressure.
- Trilling Attendant's Resonant Barrage, which needs an interrupt or CC plus its cooldown in mind.

### Bosses

**1. Avanoxx** (ancient spider, The Shredded Strands)
- Look and lore [src]: she was an ordinary spider who grew large during years of isolation in a territory rich with prey.
- Summoned by killing the three attendant minibosses.
- Voracious Bite: a three-hit tank attack that applies a 10-second damage-taken debuff (+50%). Time tank defensives to cover the hits, and avoid having the debuff active during AoEs.
- Alerting Shrill: a 3-second group DoT. Starved Crawlers spawn right after it. Use defensives and healing cooldowns.
- Starved Crawlers spawn from eggs around the platform and fixate random players. If Avanoxx reaches one, she consumes it and gains a stacking damage buff. Slow, CC and cleave the crawlers away from her.
- Insatiable: the stacking damage buff. Its size and duration disagree across sources. Method (Aug 2025): 50% per spider for 12 seconds. Wiki: a 60-second stacking buff. Judgehype: +12% per add. Icy Veins Season 3 tuning (snippet): cut to 30%, down from 50%. Use the Season 3 figure of 30% [src with conflicts].
- Gossamer Onslaught: a 5-second group channel that drops a web puddle under each player every second. Group up to save space. Overlapping puddles do not hurt.
- Infestation: a DoT on random players. When it expires it creates a roaming Ceaseless Swarm for 45 seconds. Lead the swarm away from the group.
- Vile Webbing: a trap for her prey (wiki).
- Sept 2025: Starved Crawler health reduced 20% (snippet). Season 3 pre-launch: Starved Crawlers can no longer critically hit with melee.

**2. Anub'zekt** (overseer, Echoing Overlook)
- Look and lore [src]: runs the harvest operation. He is tactical and very strong, and he joins the fight himself when his forces struggle.
- Impale: a frontal on the tank. Face it away from the group and step out.
- Burrow Charge: targets a random ranged player with a 13-yard AoE. Twice per phase. The target should move out immediately to avoid the follow-up Impale. Blinks can dodge the second charge. If everyone except one player stacks in melee, all charges go to that player.
- Infestation: random players get a DoT. Use defensives and focused healing. When it expires it creates a Ceaseless Swarm that moves in lines toward random players and applies a stacking DoT. Drop swarms away from the group without moving so far that you lose boss uptime.
- Bloodstained Webmages spawn at the room edges and cast Silken Restraints, which roots players. Tanks should pull the Webmages under the boss to be cleaved. Interrupt and CC their casts.
- Energy phase (at 100 energy): the boss moves to the centre and casts Eye of the Swarm. The room fills with a 25-second Ceaseless Swarm cloud, except for a small safe circle in front of him. Turning the boss moves the circle, so tanks must manage facing. Webmages stop spawning, but Infestation continues. Method's positioning: tank on the right side of the circle facing the boss, group on the left, and new swarms dropped at the right edge. The cloud clears after 25 seconds, and the fight repeats.
- Players who stay in the Eye gain stacks of Ceaseless Swarm.
- Healers must spot-heal players with Infestation.

**3. Ki'katal the Harvester** (ascended nerubian, The Undercache, end boss)
- Look and lore [src]: an ascended overseer of the Black Blood harvest. She wants the old Black Empire restored, which Queen Neferess refused. Level 79-82 elite (wiki).
- Bloodworkers [src]: they run through the arena and cannot be tanked. Striking one makes it drop its Black Blood cargo and flee, and the spilled cargo creates a Black Blood puddle.
- Grasping Blood [src]: stepping into a spilled Black Blood pool roots the player for up to one minute and deals shadow damage every second. Destroying the pool frees them. On Mythic, the pool is absorbed after one player steps in. Made interruptible in Sept 2024.
- Cosmic Singularity: pulls all players inward, then detonates in a 10-yard AoE with shadow damage and knockback. It applies Faded, which cuts damage done by 75% and increases damage taken. Normal and Heroic: 25% for 12 seconds. Mythic: 75% for 20 seconds.
- Breaking free: use a CC, an interrupt, or a freedom effect. Or step into a Black Blood puddle and get rooted until the cast ends. Immunities and leaps also work.
- Method (Aug 2025) says the cast happens at 100 energy. Patch 12.0.0 (2026-01-20) removed the energy cost and increased the cooldown, so treat the energy trigger as outdated.
- Venom Volley: a 30% movement slow, immediate nature damage, then a 10-second tick. On Mythic it is replaced by Cultivated Poisons.
- Cultivated Poisons (Mythic): three random players get a nature DoT over 8 seconds. When it expires or is dispelled, it erupts in two waves, in a north-south or east-west pattern. Position so the waves point away from the group. Players hit by the waves get a DoT and should use defensives.
- Erupting Webs: nature damage and a 3-second stun. Sept 2024 hotfix cut the stun from 6 to 3 seconds and damage by 18%.
- Mythic web add (Method): an add appears every 15 seconds and webs a random player, rooting them and increasing their nature damage taken by 15% for 15 seconds.

### Mythic+ notes
- Timer [thin]: no number found. An Icy Veins Season 3 analysis suggested a longer timer as an option (snippet).
- Route [src]: Method's PUG-friendly route is an MDT import link only. Pulls not accessible [thin].
- Enemy forces [thin]: no figures found.
- Affixes [thin]: no affix interactions documented.
- Tailoring bonus [src]: Khaz Algar 25 skill lets tailors break the Discordant Attendant tether for a 12-second stun.
- Tuning timeline (for reference, since the live numbers have changed):
  - Sept 2024: Erupting Webs stun cut to 3 seconds, Grasping Blood made interruptible.
  - Season 3 PTR (July 2025): art reworked, waystones added, Ki'katal difficulty adjusted.
  - Sept 2025: Resonant Barrage, Venomous Spit and Starved Crawler HP changes.
  - Season 3 pre-launch: Insatiable cut to 30%, no crit on Starved Crawler melee.
  - Patch 12.0.0 (2026-01-20): Ki'katal's energy cost removed, cooldown increased.
- Status: a Sportskeeda list has Ara-Kara in The War Within Season 3's rotation. A search summary says it is not in the Midnight Season 2 pool, which was not verified. An Icy Veins headline says Ara-Kara was "dragging down" Season 3 M+ runs (snippet). A Wowhead headline (URL not retrieved) reports a Season 3 last-boss change that moved the "bubbles" location.

---

## Gaps and confidence summary

Thin, needs in-game screenshots or the official art book:
- Palette, lighting, fog and loading screens for both dungeons. The palettes in this file are proposals, not sourced.
- Music for both dungeons.
- Subzone and section order for Ara-Kara, and the subzone mapping for Halls of Atonement.
- Approximate sizes and shortcuts for both dungeons.
- Enrage and intermission details for Halkias, Echelon and Aleez.
- Current timers and affix interactions for both dungeons.
- Method's MDT routes for both dungeons (import links only).

Conflicting sources:
- Insatiable size and duration (Avanoxx), resolved to the Season 3 figure of 30%.
- Ki'katal's Cosmic Singularity energy trigger, resolved to "removed in Patch 12.0.0".
- Ara-Kara's location inside Azj-Kahet.
- Current Mythic+ pool status for both dungeons.
