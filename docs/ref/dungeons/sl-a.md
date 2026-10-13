# WoW Shadowlands dungeons, set A: The Necrotic Wake and Mists of Tirna Scithe

Research snapshot: 2026-10-13. Reference for re-creating these two dungeons in EFSUN ONLINE (hobby project). Not a player guide.

**Legend**
- **[inferred]**: my reading of setting, damage type, or ability name. No source states it.
- **[conflict]**: sources disagree. Both versions are given.
- **[thin]**: no usable source found.
- **[snippet]**: came only from a search-result summary, not a fetched page.

**Patch context.** Both dungeons were added in Patch 9.0.2 (2020-11-17, Shadowlands). Most mechanics come from Shadowlands-era guides, so current retail may differ. Hotfixes are noted per dungeon.

**Source reliability.**
- Warcraft Wiki (warcraft.wiki.gg) dungeon, boss, and zone pages are mostly stubs. Good for ids, levels, boss order, subzone names, and loot. Boss pages have no mechanics.
- skycoach.gg Mists guide: the best route, trash, interrupt, dispel, and maze source found. No date shown.
- Wowhead Season 1 guides (TWW URL): boss ability lists and responsibilities. Route and trash sections were not in the body text I could read.
- method.gg Necrotic Wake tips (dated 2021-02-27): Kyrian Goliaths, dungeon weapons, boss tips. Some values are outdated.
- mein-mmo.de (2020, German): the only source for the Mists maze look and palette.
- Blocked: Icy Veins (403 for both dungeons; search snippets only), Wowpedia (402), TechRaptor (403), Gamestar (403), Method Mists page (404), skycoach Necrotic Wake page (502), Wowhead CN Mists (redirect to a header-only page), Blizzard launch preview (shell only).

---

## The Necrotic Wake → our id necrotic_wake

Id is proposed. No id list was given to me. It is snake_case, matching the `docs/ref/wow` style.

**Sources:** https://warcraft.wiki.gg/wiki/The_Necrotic_Wake · https://warcraft.wiki.gg/wiki/Zolramus · https://warcraft.wiki.gg/wiki/The_Grim_Harvest · https://warcraft.wiki.gg/wiki/The_Final_Toll · https://warcraft.wiki.gg/wiki/Blightbone · https://warcraft.wiki.gg/wiki/Amarth,_the_Harvester · https://warcraft.wiki.gg/wiki/Surgeon_Stitchflesh · https://warcraft.wiki.gg/wiki/Nalthor_the_Rimebinder · https://www.wowhead.com/guide/mythic-plus-dungeons/the-war-within-season-1/the-necrotic-wake · https://www.method.gg/mythic-tips-the-necrotic-wake · https://worldofwarcraft.blizzard.com/en-us/news/23379368/shadowlands-update-bastion-and-the-kyrian-covenant | Shadowlands, patch 9.0.2 (2020-11-17). Hotfixes noted to 2024. Level 50-60 per wiki; Blizzard preview snippet says 51 [conflict]. 5 players, cross-faction, Normal / Heroic / Mythic / M+.

### Art & atmosphere

**Setting.** The Temple of Courage in Bastion (the Kyrian zone), reached from Xandria's Vigil. Maldraxxi forces invade, ransack the Temple, siphon anima, and carry off dead Kyrian to power their necromancy. Their base is Zolramus, a floating Maldraxxi necropolis and flying ziggurat above Bastion. Nalthor commands the assault from its top.

**Contrast.** Blizzard's Bastion article describes the city as immaculate: polished streets, gleaming surfaces, floating bells, sacred pools. The dungeon is that sanctuary being violated. [inferred] The run should start in bright, clean stone and sink into bone, rot, and frost as it climbs.

**Architecture by section.**
- **The Grim Harvest** (ground, Blightbone arena): [thin] no description. NPC Finder Ta'sul.
- **The Final Toll**: [thin] no description. Maldraxxi necromancers and skeletal soldiers.
- **Fall of Courage**: open-air arena. Amarth flies on Bonefang above the battle. Sources say he destroyed the Hand of Courage. NPCs Xandria and the Winged Champion. A 2024 hotfix fixed an animation issue with Xandria's Spear of Courage thrown at Amarth.
- **Zolramus / The Stitchwerks**: a flesh-crafting workshop. Corpses are processed into undead constructs. Stitchflesh works from a worktable on a raised platform.
- **Zolramus top / lower wings**: Nalthor's ziggurat top. Lower wings are described as frozen gauntlets with icy wind and crystal ice (via an Icy Veins summary snippet).

**Colour palette** (all [inferred] from setting and damage types; no visual source confirmed):
1. Bastion gold-cream: sanctuary stone, anima gold.
2. Bone ivory and grey: Maldraxxi architecture and skeletal enemies.
3. Necrotic violet: Shadow damage (Necrotic Bolt, Tortured Echoes, Death-related effects).
4. Plague green: Festering Rot, Embalming Ichor, Fetid Gas, Carrion Eruption.
5. Flesh red-brown: Stitchwerks and Blightbone's rotting mass.
6. Frost blue-white: Comet Storm, Frozen Binds, lower-wing crystal ice.
7. Fog grey-green: Noxious Fog.

**Lighting.** [thin] No source gives time of day or light sources. [inferred] Daylight in Bastion, dim necropolis light inside Zolramus lit by plague-green glow, cold blue light from the lower-wing ice.

**Landmarks and set pieces, in run order.**
1. Xandria's Vigil entrance into Bastion's sacred zone.
2. Blightbone arena (The Grim Harvest).
3. The Final Toll trash.
4. Fall of Courage: Amarth's arena above the battle, Hand of Courage wreck, Xandria and Winged Champion NPCs.
5. The Stitchwerks: Stitchflesh's worktable and platform, the hook-pull arena.
6. Zolramus top: Nalthor's platform, with the lower wings reached through Dark Exile.

**Recurring props.**
- Three deactivated Kyrian Goliaths in fixed spots. Repairable (see Layout).
- Dungeon weapons on the ground: Bloody Javelin (spear), Forgotten Forgehammer (hammer), Discharged Anima (orb), Discarded Shield.
- Stitchwerks constructs: Rotspew, Goregrind, Stitching and Separation Assistants.
- Blight bags (bloated corpses that burst on death).
- Ice crystals in the lower wings.

**Enemy look per faction.**
- **Maldraxxi (attackers):** undead and bone-built [inferred from names]. Reanimated Warrior, Mage, and Crossbowman (Fall of Courage). Brittlebone Warrior and Mage. Skeletal Marauder and Skeletal Monstrosity. Robed necromancers at Zolramus: Gatekeeper, Sorcerer, Bonecarver, Bonemender, Necromancer. Named servants Nar'zudah and Opeth. Stitched Vanguard and Patchwerk Soldier (stitched-together bodies). Corpse Harvester / Corpse Collector (the Stitchwerks mad-scientist type).
- **Kyrian (defenders):** Malfunctioning Goliath (mechanical). Kyrian Stitchwerk [thin]. Bound Kyrian in the lower wings, freed by killing the Siphoner. Gilded Champion, the freed ally.
- **Stitchflesh creations:** Loyal Creation, Spare Parts, Goregrind, Rotspew. Look is [thin].

**Loading screen.** Credited to artist Lianna Tai on the wiki. No written description. [thin] I could not view the image.

**Music.** [thin] No source. Suggestion only: martial and dirge-like Maldraxxi theme, with cold strings for the lower wings.

### Layout

**Shape.** Linear, with a vertical climb. The first half is ground-level, then the run goes up the flying fortress. Boss order: Blightbone, Amarth, Stitchflesh, Nalthor.

**Sections in order.**
1. **The Grim Harvest.** Ground level. Blightbone arena. Size [thin].
2. **The Final Toll.** Trash leading to Fall of Courage. Size [thin].
3. **Fall of Courage.** Amarth's arena above the battle. Bonefang flies over it.
4. **Zolramus, including The Stitchwerks.** Stitchflesh's workshop inside the fortress. Encounter flow (from the wiki boss intro and trash dialogue, [inferred], not labelled phases):
   - Clear the trash.
   - Two assistants spawn (Separation Assistant and Stitching Assistant).
   - After they die, Goregrind becomes attackable.
   - After Goregrind dies, Rotspew becomes attackable.
   - After Rotspew dies, the first Stitchflesh creation becomes attackable.
   - Stitchflesh is last.
5. **Zolramus top.** Nalthor's platform. Lower wings reached through Dark Exile.

**Shortcuts and skips.** None found [thin].

**Set-piece events.**
- **Kyrian Goliath repair** (method.gg, 2021): three deactivated Goliaths at fixed spots. Any Kyrian uses Summon Steward, then interacts with the Steward while standing by a Goliath to repair it. Each repair drops one orb per player. The orb gives a 1-minute Anima Exhaust buff with pulsing AoE damage and healing that scales with key level. Optional speed bonus only.
- **Malfunctioning Goliath** is disabled in Mythic and M+ per a season-one preview snippet [snippet, conflict with the 2021 Goliath note].
- **Dungeon weapons** (method.gg 2021, plus a 2024-07-26 hotfix snippet):
  - Bloody Javelin: spear, marks targets to take more damage, passes through mobs.
  - Forgotten Forgehammer: heavy hit and stun, including Prideful mobs.
  - Discharged Anima: orb. Heavy Arcane AoE. Interrupts on every tick.
  - Discarded Shield: channel for -50% damage taken for you and nearby allies. You cannot act while channeling. Described as mostly useless.
  - Hotfix (snippet): javelin, hammer, and orb got +50% damage but no longer scale with damage modifiers and can no longer crit. The 2021 scaling advice is outdated.
  - A search snippet says sources suggest saving the javelin for boss fights.
- **Amarth's skeleton army:** the summon point moves closer to the boss after a recent change [snippet].
- **Nalthor's Dark Exile:** one player is sent to the lower wings. Kill the Zolramus Siphoner to free the bound Kyrian. The freed Gilded Champion gives the rescuer Champion's Boon (+100% crit chance for 40 s).

### Trash

Pack-level data (counts, pack order, enemy-forces %) was not found for this dungeon. Roles below come from ability names and the notes that were found [inferred where marked].

**Notable enemy types, with role and must-handle abilities.**
1. **Stitched Vanguard**: melee, stitched undead. Gains Seething Rage (faster attacks). Remove the enrage effect [snippet, Icy Veins summary].
2. **Corpse Harvester / Corpse Collector**: caster. Drain Fluids is a must-interrupt cast. Throw Flesh lands on random party members. Give each harvester an assigned kick [snippet].
3. **Flesh Crafter**: support caster. Throw Cleaver hits nearby mobs and speeds pulls. Repair Flesh is a channel; spare kicks go here [snippet].
4. **Zolramus Gatekeeper**: caster. Necrotic Bolt must be interrupted. Use defensives during Wrath of Zolramus [snippet].
5. **Zolramus Sorcerer**: caster. Interrupt Necrotic Bolt and sidestep Shadow Well (ground projectile) [snippet].
6. **Blight Bag / blight behemoth**: bloated. Patrols randomly and can accidentally pull. Bursts with Disgusting Guts on death, so use a defensive [snippet].
7. **Reanimated Crossbowman**: ranged. Appears in Mythic and M+ in Amarth's fight.
8. **Brittlebone Warrior, Brittlebone Mage, Skeletal Marauder**: melee and caster skeletons in The Final Toll and Fall of Courage. Abilities [thin].
9. **Patchwerk Soldier**: stitched melee. Grim Harvest and Stitchwerks. Abilities [thin].
10. **Malfunctioning Goliath**: mechanical. Trash in Grim Harvest and Final Toll. Disabled in Mythic and M+ per a season-one snippet.

**Carrion Worms** are not trash. Blightbone spawns them (see Bosses).

**Must-interrupt:** Drain Fluids (Corpse Harvester), Necrotic Bolt (Gatekeeper and Sorcerer), Repair Flesh (Flesh Crafter, spare kicks).

**Must-dispel:** Blightbone's Heaving Retch damage-over-time, with a disease dispel [snippet, Icy Veins]. Full dispel list [thin].

**Frontals and stuns:** Heaving Retch (Blightbone frontal cone). Stuns come from the Forgehammer, not from enemies.

**Dangerous pulls:** [thin] pack sizes not found. One snippet calls the second trash pull (multiple Stitched Vanguards and Corpse Harvesters) the main trash challenge [snippet]. Watch for Blight Bags pulling on patrol.

### Bosses (in order)

**1. Blightbone (The Grim Harvest).** Corpulent, rotting, stitched-together mass built by Stitchflesh. Elite Undead. Outdoor arena [thin]. Blightbone leads the assault on the Temple.
- **Heaving Retch**: frontal cone. Spawns up to 3 Carrion Worms. Applies a 12 s damage-over-time. [conflict] One older description says the cone is aimed at a random player and puts acid on that player's position, so the target steps away from the group.
- **Carrion Worms**: seek random players. Each Blood Gorge cast stacks (+30% physical damage per stack). At 5 stacks they explode in Carrion Eruption, a Nature damage-over-time on all players for 30 s. [conflict] One snippet says a maggot spawns for each player hit instead. Likely older tuning.
- **Fetid Gas** (Mythic): dying worms leave a gas pool. Lasts up to 2 min. Standing in it deals Nature damage and stops all actions and casting. Tanks are most at risk [inferred].
- **Crunch**: heavy physical hit on the tank.
- **Tank**: keep the boss out of gas pools. Absorb Crunch. Avoid Heaving Retch by positioning.
- **DPS**: kill worms before 5 stacks. Do not hit others with Retch.
- **Healer**: manage worm damage and Carrion Eruption. Dispel the Retch damage-over-time if you have disease dispel.
- Enrage and intermission: [thin].

**2. Amarth, the Harvester (Fall of Courage).** Maldraxxi necromancer and leader of the Zolramus necromancers. Elite. Flies on Bonefang, an undead monstrosity. Beta title was "The Reanimator" (trivia). Arena: open air above the battle [inferred].
- **Land of the Dead**: skeletal minions summoned over 4 s at a point. Players within about 3.5 yd of the summon take small Shadow damage [snippet]. Minions: Reanimated Warrior, Reanimated Mage, and Reanimated Crossbowman (Mythic and M+).
- **Final Harvest**: after a short cast, destroys all minions. Living minions explode for 40 damage to all players. Corpses explode for 40 damage to players within 8 yd. The 40 figure is old tuning per a snippet [conflict].
- **Frostbolt**: Frost damage and Chilled (movement -10%, stacks).
- **Frostbolt Volley** (M+ and Mythic): ice shards hit nearby enemies. Must interrupt.
- **Unholy Frenzy**: Bonefang gains +40% attack speed for 16 s. Heavy tank damage. Healers prepare for the spike.
- **Necrotic Breath**: Bonefang breathes Shadow damage every 0.5 s and cuts healing received by 50%. Avoid it. Mythic: Necrotic Ichor (Shadow damage every 1 s, -30% healing for 10 s).
- **Necrotic Bolt**: Shadow hit on one target, who then absorbs the next heal received.
- **Tortured Echoes** (M+ and Mythic): gains stacks for each skeleton or player killed. Stacking Shadow pulse to all enemies every 3 s.
- **Tank**: kill minions before Final Harvest. Interrupt Frostbolt Volley. Use defensives in Unholy Frenzy.
- **DPS**: kill minions first. CC one or both summoned Mages, then kill the rest quickly. Avoid Necrotic Breath. Interrupt Volley.
- **Healer**: heavy tank damage in Frenzy. Reduced-healing debuffs from Breath and Ichor.
- **Warning**: a minion left alive when Final Harvest lands explodes even if stunned. Stun is not safe [snippet, method.gg].
- Enrage and intermission: [thin].

**3. Surgeon Stitchflesh (The Stitchwerks, inside Zolramus).** Maldraxxi scientist, male undead, Elite. Creates constructs from corpses. Arena: worktable and platform [thin geometry].
- **Stage 1 (worktable).** Noxious Fog surrounds the worktable, protects Stitchflesh, and deals plague damage each second to nearby enemies. He is out of reach while it is up.
  - **Awaken Creation**: makes a construct that applies Festering Rot (stacking plague to all enemies every 3 s).
  - **Meat Hook** (from constructs): pulls the first hit player to the construct's position. Small physical damage.
  - **Mutilate**: heavy physical hit on one enemy.
  - **Embalming Ichor**: thrown jar. Plague in 4.5 yd and a puddle that deals plague each second.
  - **Stitchneedle**: physical hit with a 10 s bleed.
- **Stage 2 (after the pull into the arena).**
  - **Sever Flesh**: heavy physical hit on the current target.
  - **Morbid Fixation**: fixates a nearby player for 8 s. Doubles that player's damage output and cuts their movement by 60% (per Wowhead summary). The second hook should land on him to interrupt this [snippet].
  - **Escape**: after a short time he returns to the worktable.
- **Hook timing (method.gg, icy-veins snippet).** The third hook lines up with his jump back to the immune platform. The tank moves before the cast and aims the hook at the platform centre to pull him straight back down. Kill the first construct quickly after the third hook, because tank damage ramps up when a second one is active. Aim to kill him before more than two constructs are alive.
- **Tank**: aim Meat Hook. Engage new constructs fast. Defend against Mutilate.
- **DPS**: kill constructs. Prioritise Stitchflesh before he escapes.
- **Healer**: tank damage spikes during Mutilate. Plague on the group.
- **Patch note**: wiki says a 2024-10-15 hotfix cut his health by 20%.
- Enrage and intermission: the escape window is the intermission [inferred].

**4. Nalthor the Rimebinder (top of Zolramus; lower wings).** Lich, undead, Elite. Commands the assault from the flying ziggurat. Arena: top platform, with the lower wings via Dark Exile.
- **Comet Storm**: icy comets hit each player's position every 0.5 s for 4 s (small frost radius). Hit players take +25% more Comet Storm damage for 5 s.
- **Icebound Aegis**: Nalthor shields himself. While up, frost waves hit all players every 3 s. M+ version: shield stacks damage taken by 10% [conflict on wording].
- **Frozen Binds**: immobilises a random player with Frost damage every 2 s for up to 12 s. On expiry it spreads to all players within 16 yd. Healers dispel it. Sources say removal can also spread it, so keep the bound player away from the group [inferred].
- **Icy Shard**: physical hit on the current target.
- **Dark Exile**: at 100 Energy, banishes one player to the lower wings. They must escape within 50 s or die. Frigid Cold slows them. On expiry it leaves Razorshard Ice (Frost damage and -25% speed for 2.5 min).
- **Lower wings**: Blizzard ice shards deal Frost every 1.5 s and chill by 70% for 5 s. Zolramus Siphoner: Enfeeble deals Shadow every second and cuts haste and movement by 50%. Kill it to free the bound Kyrian. The Gilded Champion then gives Champion's Boon.
- **Dark Exile counters** (method.gg): Paladin Blessing of Protection on the target before the cast completes is safest. Charge, Priest Leap of Faith, and Warlock Demonic Gateway work but need precise timing. Without a counter you keep the debuff and die when it ends. Keep a combat res ready.
- **Tank**: avoid Comet Storm. Watch Frozen Binds spread.
- **DPS**: handle the Binds spread. During Dark Exile, kill the Siphoner to free the Kyrian and return.
- **Healer**: dispel Frozen Binds. Manage Comet Storm damage.
- **Loot**: Marrowfang's Reins drops from Nalthor on Mythic [Wowhead loot list].
- **Patch note**: 2024-09-24 hotfix on players hit by affixes while returning to the top platform (wiki).
- Enrage and intermission: [thin].

### Mythic+ notes

- **Timer**: [thin] not found in any source.
- **Route**: the run order is the boss order above. Pull counts, enemy-forces %, and a typical route were not found. Use MDT or keystone.guru for current counts.
- **Enemy forces**: [thin].
- **M+-only mechanics**: Tortured Echoes, Frostbolt Volley interrupt, Reanimated Crossbowman, and Icebound Aegis stacking damage taken (see Bosses). Malfunctioning Goliath disabled in Mythic and M+ [snippet].
- **Affix interactions**: [thin]. Necrotic and Grievous healing reduction would hit Amarth's Breath, Ichor, and Blightbone's worms hardest [inferred].
- **Route tip**: Blightbone's worms must die before 5 stacks. Amarth's minion CC: CC the summoned Mages, then kill the rest.
- **Rotation status**: one search summary says the dungeon is absent from current Midnight Season 2 and 3 M+ pools. Not verified.

---

## Mists of Tirna Scithe → our id mists_tirna_scithe

Id is proposed. Snake_case, matching the `docs/ref/wow` style.

**Sources:** https://warcraft.wiki.gg/wiki/Mists_of_Tirna_Scithe · https://warcraft.wiki.gg/wiki/Ingra_Maloch · https://warcraft.wiki.gg/wiki/Mistcaller · https://warcraft.wiki.gg/wiki/Tred%27ova · https://warcraft.wiki.gg/wiki/Ardenweald · https://www.wowhead.com/guide/mythic-plus-dungeons/the-war-within-season-1/mists-of-tirna-scithe · https://skycoach.gg/blog/wow/articles/mists-of-tirna-scithe-guide · https://mein-mmo.de/wow-shadowlands-mists-of-tirna-hassen/ | Shadowlands, patch 9.0.2 (2020-11-17). Hotfixes 2024-09-18 (Tred'ova selection circle), 2024-09-23 (M+ shortcut herbalism fix), 2024-09 (Dodgeball targeting, Vulpin visibility, Patty Cake range), 2024-11-08 (Acid Expulsion pools visible). Level 50-60 per wiki; Blizzard preview snippet says 55 [conflict]. 5 players, cross-faction. Associated race: Drust.

### Art & atmosphere

**Setting.** Tirna Scithe is a lush grove in western Ardenweald, protected for ages by the fae folk. Entrance is at the Oaken Assembly. Subzones: Oaken Assembly (entrance), Mistveil Tangle (mist maze), Tirna Scithe (grove, waterfall, gorm nest). Story: Ingra Maloch and his Drust followers use dark magic to subjugate the grove. The drought is spreading into Ardenweald. Tred'ova has eaten the wildseed of Lakali, a loa of knowledge. Blizzard's preview tone: quiet, eerie, and in danger.

**Zone-level light.** The Ardenweald wiki describes "perpetual twilight" and a "moonless night", yet also moonlit [snippet].

**Architecture and materials.** No built architecture is described. The space is organic: overgrown roots, bark, mushrooms, a waterfall, narrow walkways, a mist-shrouded maze with symbols hidden in it, and a large open room for Tred'ova. Materials: bark, roots, moss, mist, anima globs and puddles, cocoons, eggs, pollen clouds.

**Colour palette** (mostly [inferred]; only the mein-mmo "blue, green, brown" line and skycoach's effect colours are sourced):
1. Deep forest green: foliage and roots.
2. Bark brown: roots, walkways, Tirnenn Villagers.
3. Mist grey-blue: the maze and the Mistcaller's clones. Source: "enchanted forest" blue, green, and brown tones (mein-mmo).
4. Acid green: Acid Expulsion, Decomposition Pools, Gorger acid globules, Tred'ova's Nature damage (skycoach effect colours).
5. Electric blue swirls: Tred'ova's Consumption (skycoach effect colours). Frost on the blue fox adds.
6. Mushroom red and green: buff mushrooms. Green gives a stat buff, red gives HP and stamina (skycoach).
7. Anima gold-yellow: anima globs and puddles from Tears of the Forest.
8. Drust violet-shadow: Death Shroud, Soul Split, Shadow pulses.

**Lighting.** [thin] No source describes light sources. [inferred] Dappled twilight in the grove. Mushrooms as small light sources. Mist as fog. Green and blue glows from acid, Consumption swirls, and anima missiles. Glowing-forest claims found in search summaries came from low-quality reworded pages and are not used here.

**Landmarks and set pieces, in run order.**
1. Overgrown Roots at the entrance (Shadowlands-era; see Layout).
2. Drust camp (pulls 1-4) and Ingra Maloch's arena (pull 5).
3. Second set of Overgrown Roots guarding a mushroom grove. Clearing it gives the group a buff.
4. Mistveil Tangle, the mist maze with symbol rooms. Mistveil Matriarch mini-boss.
5. Mistcaller (pull 12) inside the maze.
6. Waterfall. Jump down to reach the third area.
7. Tirna Scithe / Spinemaw gorm nest: eggs, larvae, Staghorns, Gorgers, Reavers.
8. Tred'ova's large open room with the cocoon of Lakali.

**Recurring props.**
- Overgrown Roots (clickable, opens paths).
- Mushrooms (buff grove).
- Depleted Anima Seeds: checkpoints after each boss, plus one in the third area.
- Pools of Radiance (Matriarch heal pools).
- Cocoons and eggs (Accelerated Incubation larvae).
- Pollen clouds (Bewildering Pollen).

**Enemy look per faction.**
- **Drust** (Ingra's followers): Spiteclaw, Soulceaver, Harvester, Boughbreaker. Lore: cursed to exist outside the cycle of life and death. Look [thin], humanoid per wiki.
- **Night Fae natives:** Mistveil Defender, Tender, Stinger, Stalker, Shaper, Guardian, Nightblossom, Matriarch. Tirnenn Villagers (high-HP, turn friendly at 20%). Mistcaller (faerie humanoid, female, playful, uses mist to confuse). Look [thin].
- **Gorm** (Tred'ova's brood): Spinemaw Acidgullet, Staghorn, Reaver (airborne), Larva, Gorger. Tred'ova is a female gorm beast. Look [thin].

**Loading screen.** Image only. No written description on the wiki [thin].

**Music.** [thin] No source.

### Layout

**Shape.** Linear run with a maze in the middle and a vertical drop by waterfall into the lower gorm area. Boss order: Ingra Maloch, Mistcaller, Tred'ova.

**Sections (skycoach route table; percentages as printed).**
- **A. Drust entry** (pulls 1-4, about 21.9% trash). Pull 1: 5 Spiteclaws. Pull 2: 2 Soulceavers, 1 Harvester, 1 Tirnenn Villager. Pull 3: 2 Soulceavers, 2 Harvesters. Pull 4: 2 Boughbreakers.
- **Boss 1: Ingra Maloch and Droman Oulfarran** (pull 5). Mushroom grove sits behind the second set of roots, before this boss.
- **B. Mistveil Tangle maze** (pulls 6-11, about 44.6% trash).
  - Each room has four symbols with three binary traits (flower or leaf, filled or empty, circled or not). Pick the odd one out.
  - A wrong pick teleports the group to the maze start [conflict: a 2020 German source says the whole route restarts].
  - Mistcaller always goes the right way in the first room.
  - Pull 6 is the largest pack and uses all six maze mob types.
  - Mini-bosses in the maze: Mistveil Matriarch, Gorgegullet, and Mistveil Nightblossom (single mob, pull 10).
- **Boss 2: Mistcaller** (pull 12).
- **C. Tirna Scithe / Spinemaw** (pulls 13-19, about 43.9% trash). Reached by jumping the waterfall. Staghorn packs with Acidgullets, Reavers, Larvae, and Gorgers. Checkpoint seed here.
- **Boss 3: Tred'ova** (pull 20). Large open room.
- Note: the skycoach table's pull totals reach 110.4% against the page's stated 100%. Use as relative size only.

**Shortcuts and skips.**
- Night Fae Overgrown Roots at the start open hidden paths and skip early packs (Shadowlands covenant feature). A search summary says covenants no longer exist in current retail [snippet, unverified].
- Out-of-combat CC (Sap, Imprison) or Priest Mind Soothe can sneak past packs (skycoach).
- Route option: some groups skip the first Spinemaw Staghorn pack after the waterfall and pull more after Tred'ova for +14 and higher [snippet, keystone.guru and raider.io notes].

**Set-piece events.**
- Ingra mind-controls Droman (Stage 1 and Stage 2, see Bosses).
- Mist maze: symbol choice and teleport or restart on error.
- Mistcaller's Guessing Game clones at 70%, 40%, and 10%.
- Tred'ova's Consumption at 70% and 40%.
- Gorm nest: larvae and Staghorn heals.

### Trash

Enemy types with role and abilities (skycoach unless noted):
1. **Drust Spiteclaw**: melee leaper. Physical hits and a stacking bleed. On death applies a curse that stacks damage taken. Dispel curses when possible.
2. **Drust Soulceaver** (also "Dread Soulcleaver" in one section): melee. Soul Split on the tank adds magic damage and increased damage taken. Dispel immediately.
3. **Drust Harvester**: ranged caster. Spirit Bolt (magic). Harvest Essence is a channel that self-heals. Top interrupt priority; it blocks healing.
4. **Tirnenn Villager**: very high HP. Turns friendly at 20%. Bewildering Pollen cone (disorients 4 s). Overgrowth stun and seed.
5. **Drust Boughbreaker**: Bramble Burst slow. Furious Thrashing at 50% HP.
6. **Mistveil Defender**: melee. Spear Flurry cone. Gains Enraged when allies die.
7. **Mistveil Tender**: heals. Nourish the Forest every 15 s. Interrupt it (blocks group heals).
8. **Mistveil Stinger**: applies Anima Injection, which explodes after 6 s. Dispel within 6 s.
9. **Mistveil Stalker**: Bite teleports to a random target, heavy damage and bleed. Locking it down prevents recast for 15 s.
10. **Mistveil Shaper**: Bramblethorn Coat (absorb, root, damage). Interrupt.
11. **Mistveil Guardian**: Bucking Rampage, a circular wind-up. Avoid.
12. **Spinemaw Acidgullet**: Volatile Acid circle on a random player.
13. **Spinemaw Staghorn**: Stimulate Resistance (absorb) and Stimulate Regeneration (group heal). Lock down both defensives.
14. **Spinemaw Larva**: leaves a Decomposition Pool on death. Pools block narrow paths.
15. **Spinemaw Gorger**: acid globule swirlies with large damage and knockback. Knockback can push players off narrow walkways. Disrupting the cast prevents recast for 15 s.
16. **Spinemaw Reaver**: airborne. Stinging Assault charge with stacking disease. Dispel the stacks or use a defensive. Can be pulled by accident because it flies mid-pull.

**Maze mini-bosses.** Mistveil Matriarch: Pools of Radiance heal. If the tank is out of range, Shred Armor hits a random nearby player. Mistveil Nightblossom: Triple Bite poison (dispel guidance [thin]).

**Dangerous pulls.**
- Pulls 2 and 3 (Soulceavers with Harvesters). The source calls the first area the toughest.
- Pull 6, the largest maze pack.
- Gorgers' knockback near narrow walkways.
- Reavers that fly in mid-pull.
- Larva pools on narrow paths.

**Must-interrupt.** Harvest Essence (Harvester), Nourish the Forest (Tender), Bramblethorn Coat (Shaper), Bite (Stalker, lock down), both Staghorn defensives, Gorger cast (disrupt), Spirit Bolt (Ingra), Patty Cake (Mistcaller, see Bosses), Parasites (Tred'ova, Mythic). Do not interrupt Consumption directly; break the Gorging Shield instead (see Bosses).

**Must-dispel.** Soul Split (Soulceaver), Spiteclaw curses, Anima Injection (Stinger, 6 s), Reaver disease stacks. Death Shroud is not dispellable; Droman's Wrath removes it.

**Frontals and cones.** Spear Flurry (Defender), Bewildering Pollen (Villager and Droman), Bramble Burst and Bucking Rampage (avoid).

### Bosses (in order)

**1. Ingra Maloch (and Droman Oulfarran).** Drust, male, Elite. Dark magic over the grove. Droman is an NPC he mind-controls. Arena: Drust camp past the roots and mushroom grove [location thin].
- **Stage 1 (Soul Shackle, above 20%).** Ingra mind-controls Droman, who attacks players.
  - **Force Compliance**: Droman casts Tears of the Forest periodically, raining anima globs that leave Anima Puddles.
  - **Weakened Resolve** (M+ and Mythic): one extra missile per Tears cast until Droman breaks free.
- **Embrace Darkness.** Ingra takes 80% less damage and applies Death Shroud to all players (Shadow damage every second). Droman's Wrath removes it.
- **Repulsive Visage** (Mythic and M+): party-wide fear for 3 s. Unavoidable.
- **Stage 2 (at 20%).** Droman breaks free and assists. Droman's Wrath stuns Ingra and increases his damage taken by 200%, removing Embrace Darkness and Death Shroud. Duration: 15 s in the ability table, 12 s in the tactics text [conflict].
- **Interrupts.** Spirit Bolt.
- **Avoid.** Bewildering Pollen (Droman's frontal, disorients 4 s).
- **Priority.** Icy Veins [snippet] says kill Droman before Ingra until Ingra is very low, so Embrace Darkness is avoided.
- **Tank**: sidestep Pollen. **DPS**: interrupt Spirit Bolt, prioritise Droman. **Healer**: Death Shroud hits all players hard.
- Enrage and intermission: [thin].

**2. Mistcaller (Mistveil Tangle).** Female faerie humanoid. Playful. Uses mist to confuse intruders. Arena: inside the maze.
- **Guessing Game** at 70%, 40%, and 10%. She vanishes and leaves four illusionary clones. Kill the one whose sigil differs from the others.
  - Wrong clone triggers **Oopsie**, a heavy Nature burst to all enemies (Wowhead summary). Other sources say a wrong pick causes a wipe [conflict].
  - On Mythic she stays in the fight and takes reduced damage until the game ends. 99% reduction per skycoach, 100% per Wowhead summary [conflict].
- **Freeze Tag.** An illusionary Vulpin chases an enemy for 14 s. Avoid it even if it is not chasing you. On reaching a target, Freezing Burst deals Frost and stuns enemies within 8 yd for 8 s. Slow or stun the Vulpin from range.
- **Patty Cake.** Targeted Nature hit that confuses the target for 5 s. Interrupt: [conflict] skycoach and Icy Veins say the tank only; Wowhead summary says only the target can interrupt it.
- **Penalizing Burst.** Nature damage to all enemies. +15% per cast.
- **Dodge Ball.** Anima ball that hits all in a line. Dodge it. Targeting changed in a 2024 hotfix.
- **Tank**: interrupt Patty Cake if tank-only applies. **DPS**: kill the correct clone; keep away from Vulpins. **Healer**: scaling Penalizing Burst.
- Enrage and intermission: the clone phases are the intermissions [inferred].

**3. Tred'ova.** Female gorm beast. Final boss. Arena: large open room with the cocoon of Lakali [location thin]. Also spelled "Tred'nova" or "Tredova" in some sources.
- **Consumption** at 70% and 40% (she eats the cocoon). Nature damage every 2 s to all players for 14 s. Anima missiles land at random nearby spots.
  - **Gorging Shield** absorbs damage equal to about 5% of her max HP. Consumption cannot be interrupted while it is up. Shattering the shield interrupts Consumption.
  - Skycoach advises not to interrupt Consumption generally, since she does not use her main abilities while channeling [conflict with the shield rule].
- **Mind Link.** Tethers a target to allies: Shadow damage every 1 s, and damage taken is duplicated to tethered players. Move more than 40 yd from tethered allies to break it. Spread out to reduce party-wide damage.
- **Marked Prey.** A random player is marked for 20 s. Gormling Larvae fixate on them. Tanks pull larvae toward the marked player.
- **Accelerated Incubation.** Summons 4 Gormling Larvae. On death each leaves a Decomposition Pool (Nature damage every 1.5 s).
- **Acid Expulsion.** Acid globs hit players within 4 yd. Tred'ova predicts movement more over the fight (after each feast). Mythic: pools are left on impact. An invisible-pool bug was fixed 2024-11-08.
- **Anima Rejection.** Nature burst to all players.
- **Anima Shedding.** Blast at a random nearby spot. Hits players within 8 yd.
- **Coalescing Poison** (M+ and Mythic). Pulls players in, explodes after 5 s, hits within 15 yd.
- **Mythic parasites** (all interruptible; interrupt each parasite):
  - Parasitic Pacification: pacifies the target until the parasite dies.
  - Parasitic Incapacitation: stuns the target until it dies.
  - Parasitic Domination: mind-controls the target and gives a shield worth 50% of their max HP. Breaking the shield kills the parasite.
- **Starting point** is marked with a verdant swirl [snippet].
- **Tank**: pull larvae toward marked players. **DPS**: interrupt parasites (Mythic). Break the Gorging Shield during Consumption. Save major cooldowns, including Bloodlust, for this fight (skycoach). **Healer**: Mind Link duplicates damage. Spread-out damage.
- Enrage and intermission: Consumption at 70% and 40% [inferred intermissions].

### Mythic+ notes

- **Timer**: [thin] not found in any source.
- **Route**: sections and trash % above (skycoach). Pull totals do not sum cleanly (110.4% vs 100%).
- **Route for lower keys**: keystone.guru and raider.io notes say groups up to +13 follow the route. The maze is random, so pulls after Tred'ova vary.
- **+14 and higher**: skip the first Staghorn pack after the waterfall and pull more after Tred'ova [snippet].
- **M+-only mechanics**: Weakened Resolve (Ingra), Repulsive Visage (Ingra, Mythic and M+), Coalescing Poison (Tred'ova, M+ and Mythic). Mythic-only: parasites and Tred'ova's acid pools.
- **Affixes**: skycoach says affixes apply but names none for this dungeon [thin].
- **Rotation status**: one search summary says this dungeon is absent from current Midnight Season 2 and 3 M+ pools. Not verified.

---

## Known gaps and conflicts (read before using numbers)

- **No palette, lighting, music, or loading-screen descriptions** were found for either dungeon. All colour and light values are my inference from setting and effect colours.
- **Necrotic Wake:** no pack counts, enemy-forces %, pull order, or timer. Trash roles are inferred from ability names when only names were found. Arena geometry for Blightbone, Amarth, Stitchflesh, and Nalthor is thin.
- **Mists of Tirna Scithe:** boss arenas (Ingra's location, the Mistcaller arena, the Tred'ova room) are thin beyond "large open room". Enemy looks are not described.
- **Conflicts:** Mistcaller clone penalty (Oopsie vs wipe); Mistcaller damage reduction (99% vs 100%); Patty Cake interrupt rule; Ingra stun length (12 s vs 15 s); Tred'ova Consumption interrupt rule; maze wrong-pick penalty (teleport vs full restart); Blightbone worm vs maggot; Final Harvest damage numbers (tuning drift); level 50-60 vs 51 (Necrotic Wake) and 55 (Mists).
- **Dates.** Method's Necrotic Wake tips are from 2021-02-27 and predate the July weapon hotfix. The skycoach Mists page is undated. Icy Veins and the Wowhead Mists page were not usable, so their boss data comes from search snippets.
- **Snippet-only claims** (marked [snippet] above): Icy Veins boss tips for both dungeons, the Malfunctioning Goliath Mythic disable, the July weapon hotfix, the Midnight M+ pool claims, the covenant status note, and the Ardenweald moonlight description.
