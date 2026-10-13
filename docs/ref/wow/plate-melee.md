# Plate melee reference: WoW Midnight Season 2 (Patch 12.1)

Research for EFSUN ONLINE class rebuilds. Prepared 2026-10-13. Research only; no game or code changes.

## Patch and source status
- Season 2 = Patch 12.1 "Curse of Ula'tek". 12.1.0 went live 11 Aug 2026; Season 2 opened about a week later (around 18 Aug). Hotfixes run into late September 2026.
- Method pages used here are dated 11 Aug to 6 Oct 2026. Patch 12.1.5 was on the autumn roadmap; I could not confirm whether it has released, so all numbers assume 12.1 plus hotfixes through 22 Sep 2026.
- Icy Veins returned HTTP 403 to WebFetch on every guide page I tried, and Wowhead guide pages returned only metadata. Where a value came only from a search snippet, the line says "(search summary)" and is unverified.
- Stale wiki data: Ironfur (11.1.0), Vampiric Blood (10.0.0), Holy Shock tip text (9 s CD; infobox says 6 s). Infobox values were used where a page had both.
- Legend: n/v = not verified in any source I could reach. "wiki" = warcraft.wiki.gg infobox or patch entry. "Method" = method.gg playstyle/rotation page. Hero-tree names come from Method rotation headings.
- The Visual column is a suggested VFX for EFSUN, not sourced WoW visuals.
- Resources: Rage (Warrior, Guardian); Holy Power (Paladins); Runes + Runic Power + Bone Shield (Blood); Runes + Runic Power + Lesser Ghoul stacks (Unholy).

---

## Warrior — Arms [knight_blademaster]
Patch/season verified: 12.1 (Method page updated 25 Sep 2026); Colossus Smash from wiki 12.0.0 data; Mortal Strike from wiki (Midnight data, hotfix 24 Mar 2026) | Sources: https://method.gg/guides/arms-warrior/playstyle-and-rotation ; https://warcraft.wiki.gg/wiki/Colossus_Smash ; https://warcraft.wiki.gg/wiki/Mortal_Strike ; https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/
Resources: Rage. Procs: Sudden Death (Execute), free Overpower, Executioner's Precision stacks (Mortal Strike), Apex proc (Heroic Strike), Battlelord (effect n/v). Anger Management cuts cooldowns as Rage is spent.

### Core kit (8–12 abilities, incl. 1 mobility + 1-2 defensives + interrupt if the spec has them)
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect (1 line) | Visual (1 line, proposal) |
|---|---|---|---|---|---|---|
| Mortal Strike | Instant (wiki) | Enemy, melee | 6 s (wiki) | Costs 30 Rage (wiki) | Heavy hit; target takes 50% less healing for 10 s (wiki) | Dark red slash arc with a red ring on the target |
| Colossus Smash | Instant (wiki) | Cleave around you, 10 yd | 45 s (wiki) | None listed (wiki) | Hits nearby enemies; +30% damage you deal to them for 10 s; reduced past 8 targets (wiki) | Ground shockwave ring, cracked-ground decal, gold flare on hit |
| Execute | n/v | Enemy under threshold, melee | n/v | Spends Rage; Sudden Death procs (Method) | Finisher; Method casts at 2 or 1 Sudden Death stacks | Hard downward chop with ember burst |
| Overpower | n/v | Enemy, melee | n/v | Free proc, no Rage (Method) | Free strike that fills the Rage-starved gaps (Method) | Quick white flash strike |
| Rend | n/v | Enemy | n/v | None listed | Bleed; first step of the rotation (Method) | Trailing red streaks on the target |
| Avatar | Instant (wiki) | Self | 1.5 min, lower with Anger Management (Method) | n/v | +20% damage for 20 s; removes roots and snares (wiki) | Gold-red aura with afterimages |
| Charge | n/v (movement) | Enemy, range | n/v | Charge weaving gives 20 Rage per weave (Method) | Gap closer; opener step 1 (Method) | Dust trail, speed lines |
| Spell Reflection | n/v | Self | 25 s (Method) | n/v | 20% damage reduction for 5 s; reflects some spells (Method) | Blue-white shield arc |
| Die by the Sword | n/v | Self | n/v | n/v | Defensive for heavy incoming damage (Method) | Silver blade halo |
| Impending Victory | n/v | Enemy | 25 s (Method) | Costs 10 Rage (Method) | Heals 30% of max HP (Method) | Green-gold pulse |
| Bladestorm | n/v | Self, AoE | n/v | n/v | Slayer talent; final step of the Slayer opener (Method) | Spinning blade ring |

Interrupt: Pummel is not named in any source (n/v).

### Single-target priority (ordered, 5–8 lines)
General (Method): 1. Apply/maintain Rend. 2. Avatar. 3. Colossus Smash. 4. Execute at 2 Sudden Death stacks. 5. Heroic Strike on Apex proc. 6. Mortal Strike. 7. Execute at 1 Sudden Death proc. 8. Overpower. 9. Slam (last).
Execute variant (Executioner's Precision talented, Method): Heroic Strike (Apex) -> Colossus Smash -> Execute (2 Sudden Death or 4 Executioner stacks in Slayer) -> Mortal Strike at 2 Executioner stacks -> Execute (1 Sudden Death or above 40 Rage) -> Overpower (below 40 Rage).

### AoE priority (3–6 lines)
- Method gives no AoE list for Arms (n/v).
- Colossus Smash is the built-in cleave (10 yd, reduced past 8 targets).
- Sweeping Strikes and Whirlwind are not in any source I could reach (n/v).
- Suggested only: keep the single-target order and let Colossus Smash cleave; verify in play.

### Major cooldowns (name, CD, duration, effect)
- Colossus Smash: 45 s, 10 s window, +30% damage to affected enemies (wiki).
- Avatar: 1.5 min, 20 s, +20% damage, removes roots (wiki / Method).
- Bladestorm: CD n/v; Slayer burst, final step of the Slayer opener (Method).
- Spell Reflection: 25 s, 5 s, 20% reduction (Method). Die by the Sword: CD n/v.

### Active mitigation / procs / buff loops
- Arms has little built-in mitigation. Die by the Sword and Intervene are the tank tools; Icy Veins (search summary) credits Arms with limited physical immunity.
- Rage loop: Charge weaves for early Rage, then Colossus Smash and Avatar burn cooldowns, and Execute and Overpower use procs.
- Method warns that Rage starvation hits when Battlelord and Sudden Death procs dry up.

### What makes it feel good (2–4 bullets)
- Colossus Smash is the window everything lines up behind, with Avatar as the second beat.
- The rotation is proc-driven and GCD-locked while Rage or free procs last (Method).
- Method calls Arms slower-paced than Fury, so it should feel deliberate rather than frantic.
- Cooldowns are cheap to use because Anger Management refunds time for Rage spent.

### Season 2 / Midnight changes noted
- Warbreaker's effects were merged into Colossus Smash (wiki 12.0.0 note). Method's Arms page does not list Warbreaker, which fits.
- Mortal Strike damage +12% (hotfix 24 Mar 2026, wiki).
- Rend conflicts: Skill Capped says Rend is now exclusive to Arms, while Method's Protection Warrior page says Rend moved under Blood and Thunder. Check in game.
- Hero trees named by Method: Slayer and Colossus.
- Icy Veins (search summary) rates Arms strong entering Season 2, especially in Mythic+. Icy Veins pages were not readable.

---

## Warrior — Protection [knight_protector]
Patch/season verified: 12.1 (Method page updated 11 Aug 2026); Shield Slam from wiki (12.0.1 damage cut, current data) | Sources: https://www.method.gg/guides/protection-warrior/playstyle-and-rotation ; https://warcraft.wiki.gg/wiki/Shield_Slam ; https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/ ; Icy Veins 12.1 tank summary (search summary only): https://www.icy-veins.com/wow/class-guides
Resources: Rage. Violent Outburst procs add Rage to Shield Slam (Method). Demoralizing Shout generates Rage (Method). Ignore Pain spends Rage.

### Core kit (8–12 abilities, incl. 1 mobility + 1-2 defensives + interrupt if the spec has them)
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect (1 line) | Visual (1 line, proposal) |
|---|---|---|---|---|---|---|
| Shield Slam | Instant (wiki) | Enemy, melee; needs a shield | 9 s, no charges (wiki) | Generates 15 Rage (wiki) | Shield hit, about 231% AP; +30% with Shield Block (Method) | Round shield slam with a gold crack flash |
| Shield Block | Instant (wiki) | Self | Charges; CD n/v | n/v | Blocks melee; +30% Shield Slam damage (Method) | Blue-steel shield ring |
| Ignore Pain | n/v | Self | n/v | Spends Rage (amount n/v) | Passive damage reduction; dump Rage before it caps (Method) | Pale-gold ward glyph |
| Shield Charge | n/v (short charge) | Enemies in path | 45 s (Method) | n/v | Stuns and damages several targets; Champion's Bulwark gives a free Revenge and Shield Block (Method) | Lunge with dust cone and stun stars |
| Shield Wall | n/v | Self | 3.5 min, Anger Management cuts 1 s per 10 Rage (Method) | n/v | 40% damage reduction for 8 s (Method) | Silver wall dome outline |
| Spell Reflection | Instant | Self | n/v | n/v | 20% magic damage reduction for 5 s (Method) | Bright reflective shield |
| Demoralizing Shout | n/v | Enemies in range | n/v | Generates Rage (amount n/v) | Enemies deal 20% less damage for 8 s; Booming Voice adds 20% to affected enemies (Method) | Red shout waves |
| Thunder Clap | n/v | Area around you | n/v | n/v | Refreshes Rend (Colossus) or feeds Thunder Blast (Mountain Thane) (Method) | Blue ground ring |
| Revenge | n/v | Enemy | n/v | Free after Shield Charge (Champion's Bulwark) | Colossus main filler (Method) | Red arc |
| Avatar | Instant | Self | 1.5 min, lower with Anger Management (Method) | n/v | +20% damage for 20 s; removes roots and snares (Method) | Gold aura |
| Demolish | n/v | Enemy | n/v | n/v | Colossus opener step; effect not described (Method) | Heavy overhead smash |

Interrupt: Pummel not named in any source (n/v). Mobility: Shield Charge (45 s).

### Single-target priority (ordered, 5–8 lines)
Colossus (Method): 1. Shield Block when down or near its charge cap. 2. Ignore Pain when Rage is near the cap. 3. Demoralizing Shout. 4. Demolish. 5. Shield Charge. 6. Shield Slam the moment it is off cooldown. 7. Revenge. 8. Thunder Clap, only to refresh Rend or as filler. 9. Execute when valid.
Mountain Thane (Method): Shield Block -> Ignore Pain -> Demoralizing Shout -> Shield Charge -> Thunder Blast at 2 stacks -> Shield Slam -> Thunder Blast -> Thunder Clap -> Execute -> Revenge.

### AoE priority (3–6 lines)
- Method has no separate AoE list (n/v).
- Shield Charge hits multiple targets (Method).
- Thunder Clap and Thunder Blast are the AoE generators in both trees (Method).
- Shield Block stays up during multi-target tanking, same as single target.

### Major cooldowns (name, CD, duration, effect)
- Avatar: 1.5 min, 20 s, +20% damage (Method).
- Shield Wall: 3.5 min, 8 s, 40% damage reduction (Method).
- Shield Charge: 45 s, stun and damage (Method).
- Demoralizing Shout: CD n/v, 8 s, enemies deal 20% less damage (Method).
- Spell Reflection: 5 s, 20% magic reduction; CD n/v (Method gives 25 s for Arms only).

### Active mitigation / procs / buff loops
- Shield Block -> Shield Slam: keep Shield Block up while tanking (Method).
- Ignore Pain is the Rage dump that keeps the bar from capping (Method). A search summary of the 12.0.x Method guide says No Stranger to Pain raised Ignore Pain to 30%; unverified.
- Devastate can reset Shield Slam via Devastator (Method names it; details n/v).
- Anger Management: 1 s off Shield Wall per 10 Rage spent (Method).
- Champion's Bulwark (Shield Charge) gives a free Revenge, Shield Block, and Rage (Method).

### What makes it feel good (2–4 bullets)
- Shield Slam on cooldown with Shield Block up is the heartbeat; Method calls the spec "fairly straightforward".
- The Rage-to-mitigation loop: Demoralizing Shout and Ignore Pain dumps keep you from capping, and you feel it when you do not.
- Shield Charge as the opening stun and gap closer.
- Method says use cooldowns on cooldown because cooldown reduction is high.

### Season 2 / Midnight changes noted
- 12.1 hero trees: Mountain Thane and Colossus (Method).
- Shield Slam current damage: about 231% AP after the 12.0.1 cut (wiki).
- Icy Veins 12.1 class set (search summary, unverified): 2-piece makes free Revenges hit 15% harder and empowers the next Shield Slam by 20%. 4-piece makes Ravager and free Revenges cause bleeds on all targets and cuts Ravager cooldown by 30 s.
- Thunder Clap: Practiced Strikes +15% (search summary, 12.0.5).
- Rend conflict: see Arms.

---

## Warrior — Fury [barbarian_butcher]
Patch/season verified: 12.1 (Method page updated 11 Aug 2026); Bloodthirst from wiki (12.0.1 data); Rampage and Recklessness from wiki (12.0.0 data) | Sources: https://method.gg/guides/fury-warrior/playstyle-and-rotation ; https://warcraft.wiki.gg/wiki/Bloodthirst ; https://warcraft.wiki.gg/wiki/Rampage ; https://warcraft.wiki.gg/wiki/Recklessness ; tuning and tier notes (search summary): https://www.pcgamesn.com/world-of-warcraft/midnight-season-2-class-tuning-patch-notes
Resources: Rage (main), Enrage state (from Rampage and a 30% chance on Bloodthirst), Apex buff (Rampage keeps it up, Method), Sudden Death procs (Execute), Thunder Blast charges (Mountain Thane).

### Core kit (8–12 abilities, incl. 1 mobility + 1-2 defensives + interrupt if the spec has them)
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect (1 line) | Visual (1 line, proposal) |
|---|---|---|---|---|---|---|
| Bloodthirst | Instant (wiki) | Enemy, melee | 4.5 s (wiki) | Generates 8 Rage (wiki) | Physical hit, heals 3% of max HP, 30% chance to Enrage (wiki) | Red crimson splash with a green heal pulse |
| Raging Blow | n/v | Enemy, melee | n/v | n/v | Filler; 2-piece raises its damage 15% (search summary) | Double red strike |
| Rampage | Instant (wiki) | Enemy, melee | 1.5 s (wiki) | Costs 80 Rage (wiki) | Four strikes, about 827% AP; triggers Enrage; keeps Apex up (Method, wiki) | Four fast red slashes with a rage aura |
| Recklessness | Instant (wiki) | Self | 90 s (wiki) | n/v | 12 s: +50% Rage generation, +20% crit chance on abilities (wiki) | Red aura with flame spikes |
| Avatar | Instant (wiki) | Self | 1.5 min (wiki) | n/v | +20% damage for 20 s; removes roots and snares (wiki) | Gold aura with afterimages |
| Bladestorm | n/v | Self, AoE | n/v | n/v | Talent burst; can line up with Recklessness (Method) | Spinning blade ring |
| Thunder Clap | n/v | Area around you | n/v | n/v | Feeds Thunder Blast in Mountain Thane (Method) | Blue ground ring |
| Thunder Blast | n/v | Area | 2 charges (Method) | n/v | Main AoE in Mountain Thane; boosted with Avatar (Method) | Blue lightning ring |
| Whirlwind | n/v | Area around you | n/v | n/v | Last filler in Slayer (Method) | Spin arc |
| Enraged Regeneration | n/v | Self | n/v | n/v | 30% damage reduction plus extra Bloodthirst healing (Method) | Red glow with a heal pulse |
| Charge | n/v (movement) | Enemy | n/v | 20 Rage per weave (Method, Arms page) | Opener step 1 into Bloodthirst (Method) | Dust trail, speed lines |

Interrupt: not named in any source (n/v).

### Single-target priority (ordered, 5–8 lines)
Slayer (Method): 1. Recklessness (+ Avatar if talented). 2. Rampage if not Enraged or at 100+ Rage. 3. Bladestorm if talented. 4. Execute at 2 Sudden Death stacks. 5. Rampage. 6. Execute. 7. Crushing Blow. 8. Bloodbath. 9. Raging Blow. 10. Bloodthirst. 11. Wrecking Throw. 12. Whirlwind (last).
Mountain Thane (Method): Recklessness + Avatar -> Rampage (if not Enraged or 100+ Rage) -> Execute (2 Sudden Death) -> Thunder Blast at 2 charges -> Bloodbath -> Thunder Blast with Avatar up -> Execute -> Rampage -> Thunder Blast -> Crushing Blow -> Bloodthirst -> Raging Blow -> Thunder Clap -> Wrecking Throw.
Opener (Method): Charge -> Bloodthirst -> Recklessness (+ Avatar) -> Rampage -> Bladestorm.

### AoE priority (3–6 lines)
- Method gives no separate AoE list (n/v); it says multi-target adds more priorities.
- Thunder Clap and Thunder Blast drive AoE in Mountain Thane.
- Whirlwind is the Slayer filler; Bladestorm is the burst AoE.
- Odyn's Fury placement is unclear: absent from Method, low in an Icy Veins summary (search summary, unverified).

### Major cooldowns (name, CD, duration, effect)
- Recklessness: 90 s, 12 s, +50% Rage generation, +20% crit (wiki).
- Avatar: 1.5 min, 20 s, +20% damage (wiki).
- Bladestorm: CD n/v; burst, lined up with Recklessness (Method).
- Enraged Regeneration: CD n/v; 30% damage reduction (Method).
- Method: cooldowns come up roughly every 45 s with Anger Management.

### Active mitigation / procs / buff loops
- Enrage: Rampage and a 30% chance on Bloodthirst trigger it; Enraged Regeneration is the defensive that also boosts Bloodthirst healing (Method).
- Rage: Rampage costs 80, so hold it for Enrage or 100+ Rage. Recklessness' +50% Rage generation makes that easier.
- Sudden Death: Execute at 2 stacks.
- Bloodthirst on cooldown is the main filler and the self-heal (Method, wiki).
- Tier set (search summary, verify): 4-piece adds 10% to Bloodthirst; crit bonus during Recklessness is 3–6%.

### What makes it feel good (2–4 bullets)
- The Recklessness window with Avatar and Rampage is the big burst beat.
- Bloodthirst's heal pulse gives a steady self-sustain rhythm.
- Method calls it one of the most durable specs and high-APM; practice is the skill.
- Flat, high-uptime damage means every missed filler is felt.

### Season 2 / Midnight changes noted
- Rampage now replaces Slam, with +10% damage (wiki 12.0.0).
- Recklessness' Rage generation bonus cut from 100% to 50% (wiki 12.0.0).
- Bloodthirst +10% damage (wiki 12.0.1).
- Baseline Fury damage +6% from moving 4-piece value (search summary of PCGamesN, unverified).
- Rend: Skill Capped says exclusive to Arms now, so older Fury rotations may be out of date (PvP-focused source, unverified for PvE).
- Hero trees named by Method: Slayer and Mountain Thane.

---

## Druid — Guardian [barbarian_warlord]
Patch/season verified: 12.1 (Method page updated 3 Sep 2026); 12.1.0 Guardian changes from wiki patch notes; Mangle and Thrash from wiki (12.0.1 data); Frenzied Regeneration from wiki (12.0.1); Ironfur from wiki 11.1.0 (stale) | Sources: https://method.gg/guides/guardian-druid/playstyle-and-rotation ; https://warcraft.wiki.gg/wiki/12.1.0 ; https://warcraft.wiki.gg/wiki/Mangle ; https://warcraft.wiki.gg/wiki/Thrash ; https://warcraft.wiki.gg/wiki/Frenzied_Regeneration ; https://warcraft.wiki.gg/wiki/Ironfur (stale)
Resources: Rage (generators Mangle and Thrash; spenders Ironfur, Maul, Raze, Ravage, Frenzied Regeneration). Entering Bear Form from Cat sets Rage to 25 (Method). Avoid capping Rage. Gore procs reset Mangle (Method).

### Core kit (8–12 abilities, incl. 1 mobility + 1-2 defensives + interrupt if the spec has them)
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect (1 line) | Visual (1 line, proposal) |
|---|---|---|---|---|---|---|
| Bear Form | Shapeshift (Method) | Self | n/v | Sets Rage to 25 from Cat (Method) | Tank stance; required for Mangle, Thrash, Frenzied Regeneration | Brown-green fur swell, claw glow |
| Mangle | Instant (wiki) | Enemy, melee | 6 s (wiki) | Generates 12 Rage (wiki) | About 200% AP; Gore procs reset it; extends Thrash under Red Moon (wiki, Method) | Three-claw slash, orange-gold trails |
| Thrash | Instant (wiki) | All enemies within 8 yd | 6 s (wiki) | Generates 5 Rage (wiki) | Bleed to all nearby; up to 3 stacks from Bear Form, 15 s debuff (wiki) | Circular claw ring with red bleed motes |
| Ironfur | Off the GCD (Method); cast n/v | Self | CD n/v (wiki 11.1.0 says 0.5 s, stale) | Costs 40 Rage (wiki 11.1.0, stale) | Armor per stack equal to 112% Agility for 7 s; stacks overlap (wiki 11.1.0, Method) | Metallic gold fur overlay with shimmer |
| Frenzied Regeneration | Instant (wiki) | Self | 26 s (wiki) | Costs 10 Rage (wiki) | Heals 32% of max HP over 3 s for Guardian (wiki) | Green-gold regeneration aura |
| Maul | n/v | Enemy, melee | n/v | Rage spender; cost n/v | Spender; Ursoc's Fury absorbs 35% of Thrash and Maul damage (12.1.0) | Heavy overhead swipe |
| Raze | n/v | Area | n/v | Rage spender; cost n/v | AoE spender; same role as Maul (Method) | Wide cleave arc |
| Ravage | n/v | Enemy | n/v | Spend above 60 Rage (Method) | Rage spender (Method) | Sweeping claw arc |
| Moonfire | n/v | Enemy DoT | n/v | Galactic Guardian proc (Method) | Maintained DoT; no longer grants Lunar Beam cooldown reduction in 12.1 (Method) | Silver-blue flame DoT |
| Lunar Beam | n/v | Beam | Major CD; Lunation cuts 20 s (12.1.0) | n/v | Damage and defense; healing +25% (12.1.0) | Vertical moonbeam shaft |
| Incarnation (Method's name) | n/v | Self | Major CD, n/v | n/v | Big damage and defense window; maximize uptime (Method) | Bear silhouette aura |
| Barkskin / Survival Instincts | n/v | Self | Major CDs, n/v | n/v | Defensives; do not overlap (Method) | Bark texture, red pulse |

Interrupt: Skull Bash named in sources, but no data (n/v). Mobility: none listed (n/v).

### Single-target priority (ordered, 5–8 lines)
Druid of the Claw (Method): 1. Maintain Moonfire. 2. Maintain 3 Thrash stacks (more with Flashing Claws). 3. Ravage if Rage is above 60. 4. Thrash. 5. Mangle. 6. Moonfire on a Galactic Guardian proc. 7. Maul, Raze, or Ravage if Rage is below 60 and Ironfur is not needed. 8. Swipe as filler.
Elune's Chosen (Method): Moonfire -> 3 Thrash -> Lunar Beam -> Thrash -> Mangle -> Maul or Raze if Rage is below 60 and Ironfur is not needed -> Moonfire filler.
Catweaving is optional; Method recommends skipping it.

### AoE priority (3–6 lines)
- Method gives no AoE list for Guardian (n/v).
- Thrash hits everything within 8 yd (wiki).
- Swipe is filler; Moonkin Heart of the Wild is strong in AoE (Method).
- Older Icy Veins 12.0 summary (unverified for 12.1): Raze is top priority on 2+ targets; keep about 1–3 Ironfur stacks based on damage taken.

### Major cooldowns (name, CD, duration, effect)
- Incarnation: CD n/v; big damage and defense window (Method).
- Lunar Beam: CD n/v; Lunation cuts 20 s in 12.1.0; defensive and damage value (wiki, Method).
- Barkskin and Survival Instincts: CDs n/v; do not overlap (Method).
- Frenzied Regeneration: 26 s, 3 s heal of 32% max HP (wiki).

### Active mitigation / procs / buff loops
- Ironfur: keep at least 1 stack during physical damage; recasting adds a new full-length stack (Method).
- Gory Fur (12.1 redesign, wiki 12.1.0): Ironfur gives a chance to make the next Maul, Raze, or Ravage free, and those spenders give a chance to make the next Ironfur free. Method's page does not mention Gory Fur.
- Gore: above 80 Rage, offensive spenders raise Gore proc chance; Gore resets Mangle (Method).
- Ursoc's Fury absorbs 35% of Thrash and Maul damage (12.1.0).
- After the Wildfire: Rage spending fuels healing and Ursoc's Guidance cooldown reduction (Method).
- Thorns of Iron was removed (search summary of Icy Veins 12.0, older).

### What makes it feel good (2–4 bullets)
- Rage economy: generate with Mangle and Thrash, spend on Ironfur or Maul, never cap (Method).
- Gory Fur turns Ironfur timing into free spenders.
- Frenzied Regeneration competes with Ironfur for Rage, so each pull includes a real choice.
- Method says rotation execution matters more than stats for durability.

### Season 2 / Midnight changes noted
- 12.1.0 (wiki): Gory Fur redesign; Wild Guardian redesign across three ranks; Lunation cuts Lunar Beam cooldown by 20 s; Ursoc's Fury 35% (was 30%); Elune's Favored heals 18% of Arcane damage (was 15%); Brambles absorb +25%; After the Wildfire healing +25%; Lunar Beam healing +25%; all damage +8%; Boundless Moonlight leech 12% (was 10%).
- Method (3 Sep 2026): Moonfire no longer grants Lunar Beam cooldown reduction.
- Wild Guardian (search summary of Icy Veins 12.1, unverified): 10% chance on Thrash or Mangle to summon a spirit for 8 s, which resets Thrash and Mangle cooldowns while active.
- Hero trees named by Method: Druid of the Claw and Elune's Chosen. Archon search summary puts Elune's Chosen at high usage in Season 2 Mythic+.
- Ironfur numbers come from 11.1.0 wiki data; verify in game.

---

## Paladin — Protection [paladin_protection]
Patch/season verified: 12.1 (Method page updated 3 Sep 2026); Shield of the Righteous, Avenger's Shield, and Avenging Wrath from wiki 12.1.0 data | Sources: https://method.gg/guides/protection-paladin/playstyle-and-rotation ; https://warcraft.wiki.gg/wiki/Shield_of_the_Righteous ; https://warcraft.wiki.gg/wiki/Avenger%27s_Shield ; https://warcraft.wiki.gg/wiki/Avenging_Wrath ; https://warcraft.wiki.gg/wiki/Hammer_of_Light ; Icy Veins 12.1 (search summary only): https://www.icy-veins.com/wow/class-guides
Resources: Holy Power (spenders cost 3). Divine Guidance stacks (Consecration), Blessed Assurance (Hammer of the Righteous), Glory of the Vanguard proc (Avenger's Shield), Shake the Heavens, Shining Light (free Word of Glory), Holy Armaments charges (2 for Holy Bulwark).

### Core kit (8–12 abilities, incl. 1 mobility + 1-2 defensives + interrupt if the spec has them)
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect (1 line) | Visual (1 line, proposal) |
|---|---|---|---|---|---|---|
| Shield of the Righteous | Instant; GCD only (wiki); Method says off the GCD (conflict) | Front cone, melee; needs shield | None (wiki) | Spends 3 HP (wiki) | Main HP spender; active mitigation; armor boost in 12.1 (Method, wiki) | Shield light arc with gold-white embers |
| Judgment | n/v | Enemy | n/v | Generates HP (amount n/v) | Generator; Adjudication adds a debuff (Method) | Golden sigil dropped on the target |
| Avenger's Shield | Instant (wiki) | Enemy, 30 yd; bounces to 2 more (wiki) | 15 s (wiki) | None generated in current kit (wiki) | About 200% AP; interrupts and silences non-player casts for 3 s; +30% in 12.1.0 (wiki) | Thrown shield with white spiral and bounce |
| Hammer of the Righteous | n/v | Enemy or cone | n/v | n/v | Lightsmith hammer, empowered by Blessed Assurance (Method) | Hammer cone sweep |
| Consecration | n/v | Ground around you | n/v | Builds Divine Guidance (Method) | Ground damage; Sanctuary adds a small reduction (Method) | Gold ring on the ground, pulsing |
| Word of Glory | n/v | Self or ally | n/v | Spends 3 HP; free with Shining Light (Method) | Heal scaled by missing HP; refunds Mana on self (Method) | Gold-white light pillar |
| Avenging Wrath | Instant (wiki) | Self | 2 min; 1 min with Righteous Protector (Method) | n/v | +10% damage and healing, +10% crit (wiki, 12.1.0) | Large radiant wings, gold |
| Guardian of Ancient Kings | n/v | Self | n/v; second charge with Empyrean Authority (Method) | n/v | Large defensive; Gift of the Golden Val'kyr can proc it (Method) | Guardian spirit silhouette |
| Ardent Defender | n/v | Self | Shortest defensive CD (n/v) | n/v | Prevents one deadly hit while active (Method) | Gold shield glow |
| Divine Shield | n/v | Self | Long (n/v) | n/v | Immunity; aggro loss unless paired with Hand of Reckoning (Method) | White bubble |
| Blessing of Spellwarding | n/v | Self or ally | Long (n/v) | n/v | Magic immunity with no aggro side effect (Method) | Blue rune bubble |

Interrupt: Avenger's Shield (silence on non-player targets); Rebuke n/v. Mobility: none listed (n/v).

### Single-target priority (ordered, 5–8 lines)
Lightsmith (Method): 1. Consecration at 5 Divine Guidance stacks. 2. Shield of the Righteous, avoid capping HP. 3. Hammer of Wrath (2 charges). 4. Avenger's Shield (2+ targets or Glory of the Vanguard). 5. Hammer of Wrath. 6. Sacred Weapon when under 20 s. 7. Hammer of the Righteous (Blessed Assurance). 8. Judgment. 9. Holy Bulwark outside Avenging Wrath with 2 Holy Armaments charges. 10. Avenger's Shield. 11. Hammer of the Righteous or Blessed Hammers. 12. Consecration.
Templar (Method): Hammer of Light -> Shield of the Righteous (avoid capping) -> Hammer of Wrath (2 charges) -> Avenger's Shield (Punishment interrupt or Glory proc) -> Judgment or Hammer of Wrath -> Blessed Hammer with Shake the Heavens -> Avenger's Shield -> Word of Glory (free with Shining Light and Shake the Heavens) -> Blessed Hammers -> Consecration.
Opener (Method): Consecration and Blessed Hammers pre-pull -> Potion of Recklessness -> Avenging Wrath -> Avenger's Shield -> Hammer of Wrath -> Shield of the Righteous -> Divine Toll -> Hammer of Light (Templar) or Shield of the Righteous (Lightsmith) -> Hammer of Wrath.

### AoE priority (3–6 lines)
- Method gives no separate AoE list (n/v).
- Consecration is the ground base; Avenger's Shield bounces to 3 targets (wiki).
- Hammer of Light (Templar) is the burst AoE talent; Icy Veins summary says it was scaled back in Season 2 (search summary, unverified).
- Shield of the Righteous hits enemies in a front cone (wiki).

### Major cooldowns (name, CD, duration, effect)
- Avenging Wrath: 2 min (1 min with Righteous Protector), 20 s, +10% damage and healing, +10% crit (wiki, Method).
- Guardian of Ancient Kings: CD n/v; large defensive (Method).
- Ardent Defender: CD n/v; prevents one deadly hit (Method).
- Divine Shield: CD n/v; immunity (Method). Divine Toll: CD n/v; opener step (Method).
- Sacred Weapon: granted by Blessing of the Forge on Avenging Wrath (Method).

### Active mitigation / procs / buff loops
- Shield of the Righteous is the active-mitigation loop: keep it near 100% uptime for normal damage (Method).
- Holy Power loop: Judgment and Blessed Hammers generate; Shield of the Righteous and Word of Glory spend; Word of Glory is free with Shining Light.
- Glory of the Vanguard proc gives Avenger's Shield.
- Avenging Wrath: press as close to cooldown as possible, unless waiting for a burst window or the target dies first (Method).
- Sanctuary: small damage reduction from Consecration (Method).

### What makes it feel good (2–4 bullets)
- Holy Power is the visible bar that builds to Shield of the Righteous; not capping it is the core skill.
- Avenger's Shield bounce and silence are the interrupt rhythm.
- The opener (Avenging Wrath, Divine Toll, Hammer of Light on Templar) is a big statement.
- Method calls it a fast-paced tank spec centered on Holy Power.

### Season 2 / Midnight changes noted
- 12.1.0 (wiki): Avenging Wrath no longer a choice node with Sentinel for Protection; Avenger's Shield +30% damage.
- Icy Veins 12.1 (search summary, unverified): Protection talent tree reworked so Blessing of Spellwarding, Sentinel, and Sanctuary fit without giving up damage; Season 2 buffs to Shield of the Righteous, Judgment, Avenger's Shield, Consecration, and Hammer of the Righteous; Hammer of Light, Empyrean Hammer, Hammer and Anvil, and Divine Exaction toned down.
- Shield of the Righteous and Aegis of Light grant more armor, and Mastery works at all times (Method launch guide, search summary, unverified).
- Hammer of Light Holy Power cost cut from 5 to 3 in 12.1.0 (wiki, shown for Retribution; Protection cost n/v).
- Quickened Invocation no longer cuts Holy Armaments cooldown for Protection (12.1.0 bug fix, wiki).

---

## Paladin — Holy [paladin_holy]
Patch/season verified: 12.1 (Method page updated 27 Aug 2026); Holy Shock and Avenging Wrath from wiki 12.1.0 data; Season 2 tier set conflicts between sources | Sources: https://method.gg/guides/holy-paladin/playstyle-and-rotation ; https://warcraft.wiki.gg/wiki/Holy_Shock ; https://warcraft.wiki.gg/wiki/Avenging_Wrath ; https://www.skill-capped.com/wowarticles/guides/holy-paladin-pvp-guide/midnight-changes/ (PvP, search summary) ; https://boostmatch.gg/blog/wow/articles/holy-paladin-guide-midnight-season-2-patch-12-1 (search summary)
Resources: Mana (Holy Shock costs 2.24% of base mana). Holy Power (generators Holy Shock, Judgment, Flash of Light; spenders Word of Glory, Light of Dawn, Shield of the Righteous at 3 HP). Infusion of Light procs.

### Core kit (8–12 abilities, incl. 1 mobility + 1-2 defensives + interrupt if the spec has them)
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect (1 line) | Visual (1 line, proposal) |
|---|---|---|---|---|---|---|
| Holy Shock | Instant (wiki) | Ally heal or enemy damage, 40 yd | 6 s, no charges (wiki) | 2.24% base mana; generates 1 HP (wiki) | Heals about 1117% SP to allies or hits enemies for about 216% SP (wiki) | Gold-white bolt; green heal pulse on ally |
| Flash of Light | n/v | Ally | n/v | Generates HP; consumes Infusion procs (Method) | Preferred Infusion-proc heal (Method) | Quick light flash |
| Holy Light | Cast (pre-cast implied; time n/v) | Ally | n/v | Very high mana; generates no HP (Method) | Big single heal; used sparingly with Beacon of Virtue (Method) | Large golden light column |
| Word of Glory | n/v | Ally | n/v | Spends HP; Eternal Flame version preferred (Method) | Main HP spender for single-target healing (Method) | Golden hand light |
| Light of Dawn | n/v | Group around you (12.1 rework, search summary) | n/v | Spends HP | Used when Eternal Flame would overheal (Method) | Radiant dome around you |
| Judgment | n/v | Enemy | n/v | Generates HP | Procs Consecration in M+ (Method) | Golden sigil |
| Divine Toll | n/v | Group burst | Short CD (n/v) | Fills HP bar (Method) | Burst heal on many targets; use on cooldown (Method) | Radiant ring pulse |
| Beacon of Virtue / Beacon of Faith | n/v | Ally | n/v | Mana drain (Virtue drains faster, Method) | Virtue for heavy damage; Faith is the lower-mana baseline (Method) | Beacon light on the target |
| Avenging Wrath (Holy) | Instant (wiki) | Self | 2 min, 20 s (wiki) | n/v | +15% damage, healing, and crit (wiki) | Gold wing aura |
| Shield of the Righteous | Instant (wiki) | Front cone, melee | None (wiki) | Spends 3 HP; restores 1.5% mana on damage (Method) | Used when no healing is needed (Method) | Shield arc |
| Blessing of Sacrifice | n/v | Ally | n/v | n/v | Redirects 30% of an ally's damage to you; falls off at 20% (Method) | Link between paladin and ally |
| Divine Shield | n/v | Self | n/v | n/v | 8 s immunity (Method) | White bubble |

Interrupt: Rebuke n/v. Mobility: none listed; all healing is ranged in Midnight (Method).

### Single-target priority (ordered, 5–8 lines)
Method gives one list, not separate single-target and raid lists:
1. Spend HP at 5.
2. Divine Toll.
3. Flash of Light on Infusion of Light procs.
4. Holy Shock.
5. Spend HP: Word of Glory (Eternal Flame), Light of Dawn if Eternal Flame would overheal, Shield of the Righteous if no healing is needed.
6. Judgment.
Holy Light only when you have no HP and no Infusion, and sparingly with Beacon of Virtue (Method).

### AoE priority (3–6 lines)
- Method gives no separate AoE list (n/v).
- Light of Dawn centers on you in 12.1 (search summary).
- Beacon of Virtue on heavy group damage; Divine Toll on cooldown.
- Holy Light plus Beacon of Virtue is the mana-heavy combo (Method).

### Major cooldowns (name, CD, duration, effect)
- Avenging Wrath (Holy): 2 min, 20 s, +15% damage, healing, and crit (wiki).
- Divine Toll: short CD (n/v); burst heal (Method).
- Aura Mastery: CD n/v; raid-wide, usually assigned by the raid leader (Method).
- Divine Shield: CD n/v; 8 s immunity (Method).
- Blessing of Sacrifice: CD n/v; redirects 30% of ally damage (Method).

### Active mitigation / procs / buff loops
- Infusion of Light: a free Flash of Light proc. Holy Light (4-piece) and Divine Toll can trigger it (Method).
- Season 2 tier set (conflict): Skill Capped (PvP) says the 4-piece gives Infusion from Judgment 20% of the time and from Holy Light 50% of the time, with Holy Light costing 60% more mana; Boostmatch says Holy Light is guaranteed. Check the tooltip.
- HP economy: generators Holy Shock and Judgment, spend at 3–5 HP (Method).
- Mana: Holy Shock 2.24% per cast; Shield of the Righteous returns 1.5% when used for damage (Method, wiki).

### What makes it feel good (2–4 bullets)
- Holy Shock on a 6 s clock keeps the rhythm; the HP economy makes you spend as you gain.
- Infusion procs are the "free cast" beat.
- Method calls Holy reactive: you respond to damage as it lands rather than following a fixed ramp.
- Ranged healing (Method) means the skill is target choice and timing, not positioning.

### Season 2 / Midnight changes noted
- Holy Shock healing +10% (wiki 12.1.0).
- Icy Veins summary (search): Holy climbed back into the upper healing tier in 12.1. Crusader Strike is no longer in the kit.
- Light of Dawn targeting reworked to center on you in 12.1 (search summary). The wiki Light of Dawn page still describes an older frontal cone; trust the newer note.
- Light of Dawn healing +20% in 12.0.5 (search summary, older).
- Beacon 12.1 upgrades (Pillars of Light, Saved by the Light, Glistening Radiance) mesh better with Beacon of Virtue (Icy Veins summary).
- Holy Shock cooldown: the tip text says 9 s, but the infobox says 6 s; use the infobox.

---

## Paladin — Retribution [paladin_retribution]
Patch/season verified: 12.1 (Method page updated 6 Oct 2026, the latest source for this spec); ability numbers from wiki 12.1.0 patch notes with hotfixes to 22 Sep 2026 | Sources: https://method.gg/guides/retribution-paladin/playstyle-and-rotation ; https://warcraft.wiki.gg/wiki/Blade_of_Justice ; https://warcraft.wiki.gg/wiki/Final_Verdict ; https://warcraft.wiki.gg/wiki/Wake_of_Ashes ; https://warcraft.wiki.gg/wiki/Execution_Sentence ; https://warcraft.wiki.gg/wiki/Hammer_of_Light ; https://warcraft.wiki.gg/wiki/Avenging_Wrath
Resources: Holy Power. Divine Arbiter procs (tier). Art of War procs (free Blade of Justice). Crusading Strikes (auto attacks generate 1 HP). Judgment and Expurgation debuffs. Crusade stacks (haste per HP spent during Avenging Wrath, capped at 20%).

### Core kit (8–12 abilities, incl. 1 mobility + 1-2 defensives + interrupt if the spec has them)
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect (1 line) | Visual (1 line, proposal) |
|---|---|---|---|---|---|---|
| Blade of Justice | Instant (wiki) | Enemy, 12 yd, melee weapon | 12 s (wiki) | Generates 1 HP (wiki) | Holy blade, about 193% AP; cast on Art of War procs (Method) | Pale-gold blade streak |
| Judgment | n/v | Enemy | n/v | Generates HP (amount n/v) | Keep up with Expurgation for large damage gain (Method) | Golden sigil |
| Final Verdict | Instant (wiki) | Enemy, 12 yd | GCD only (wiki) | Spends 3 HP (wiki) | Holy hit, about 465% AP; 15% chance to reset Judgment; replaces Templar's Verdict (wiki) | Downward blade strike with gold flash |
| Divine Storm | n/v | Area around you | n/v | Spends 3–5 HP (Method) | AoE spender; Divine Arbiter procs (Method) | Spinning white-gold tornado |
| Hammer of Light | Instant (wiki) | Primary plus up to 7 nearby; 3 nearby hit by Empyrean Hammers (wiki) | GCD only (wiki) | Spends 3 HP; cut from 5 in 12.1.0 (wiki) | Big spender used after Avenging Wrath or Execution Sentence (Method) | Giant falling hammer, gold-white |
| Wake of Ashes | Instant (wiki) | Cone about 14 yd | 30 s (wiki) | Generates 3 HP (wiki) | Radiant cone, burn over 9 s, stuns Demon and Undead for 5 s (wiki) | Radiant shockwave cone with glowing burn |
| Execution Sentence | Instant (wiki) | Enemy, 30 yd; blast radius 10 yd | 1 min (wiki) | n/v | Holy blast on the group, then the target takes 20% of that damage over 10 s (wiki) | Hammer falling from the sky onto the target |
| Avenging Wrath | Instant (wiki) | Self | 2 min, 20 s (wiki) | n/v | Ret: +15% damage and crit, down from 20% in 12.1.0 (wiki) | Gold wing aura |
| Divine Toll | n/v | Ground / group | n/v | n/v | Used after Wake of Ashes in the priority lists (Method) | Radiant ring |
| Word of Glory | n/v | Self or ally | n/v | Spends 3 HP | Defensive; grants armor through Faith's Armor (Method) | Gold light |
| Blessing of Freedom | n/v | Ally | n/v | n/v | Pre-cast before slows; full immunity with Unbound Freedom (Method) | Blue-white bolt |

Interrupt: Rebuke n/v. Mobility: none listed (n/v). Wake of Ashes doubles as a defensive with Sacrosanct Crusade (Templar, Method).

### Single-target priority (ordered, 5–8 lines)
Templar (Method): 1. Avenging Wrath (skip with Radiant Glory). 2. Execution Sentence. 3. Hammer of Light. 4. Divine Storm with Divine Arbiter at 5 HP. 5. Final Verdict at 5 HP (4 HP before a Crusading Strikes auto). 6. Wake of Ashes. 7. Divine Toll. 8. Blade of Justice with Art of War. 9. Divine Storm with Divine Arbiter. 10. Final Verdict at 4 HP. 11. Blade of Justice. 12. Judgment or Hammer of Wrath. 13. Final Verdict at 3 HP. 14. Templar Strike and Templar Slash.
Herald of the Sun (Method): Avenging Wrath -> Execution Sentence -> Divine Storm with Divine Arbiter at 5 HP -> Final Verdict at 5 HP (4 HP before Crusading Strikes) -> Wake of Ashes -> Divine Toll -> Blade of Justice with Art of War while Avenging Wrath is inactive -> Hammer of Wrath (2 charges) -> Divine Storm with Divine Arbiter -> Final Verdict at 4 HP -> Hammer of Wrath -> Blade of Justice -> Judgment -> Final Verdict at 3 HP -> Templar Strike and Slash.
Do not spend Divine Arbiter in single target with Seal of the Templar (Method).

### AoE priority (3–6 lines)
Templar (Method): Avenging Wrath -> Execution Sentence -> Hammer of Light -> Final Verdict with Divine Arbiter at 5 HP -> Divine Storm at 5 HP (4 before Crusading Strikes) -> Wake of Ashes -> Divine Toll -> Blade of Justice with Art of War -> Final Verdict with Divine Arbiter -> Divine Storm at 4 HP -> Blade of Justice -> Judgment or Hammer of Wrath -> Divine Storm at 3 HP.
Herald of the Sun (Method): Same as Herald single target, but Final Verdict with Divine Arbiter and Divine Storm are the spenders. Opener for AoE: Blade of Justice -> Avenging Wrath -> trinkets and combat potion -> Execution Sentence -> Wake of Ashes -> Divine Storm -> Divine Storm -> Divine Toll.

### Major cooldowns (name, CD, duration, effect)
- Avenging Wrath: 2 min, 20 s, +15% damage and crit (wiki).
- Execution Sentence: 1 min, 10 s debuff, delayed damage on the target (wiki).
- Wake of Ashes: 30 s; generates 3 HP; stun and burn (wiki).
- Crusade (talent): haste per HP spent during Avenging Wrath, capped at 20% (Method).
- Divine Toll: CD n/v (Method).

### Active mitigation / procs / buff loops
- Divine Arbiter (tier procs): spend on Divine Storm or Final Verdict; hold in single target with Seal of the Templar (Method).
- Crusading Strikes: auto attacks generate 1 HP; cast Final Verdict at 4 HP before the auto (Method).
- Art of War: free Blade of Justice (Method).
- Final Verdict: 15% chance to reset Judgment (wiki). Keep Judgment and Expurgation up (Method).
- Spend HP during Avenging Wrath and Execution Sentence to build Crusade (Method).

### What makes it feel good (2–4 bullets)
- Method calls it "rather simple and straightforward": a priority list in your head, not a fixed rotation.
- Avenging Wrath with Execution Sentence: the final tick is stronger when HP is spent during the sentence (Method).
- Wake of Ashes stun and burn is a clear, readable cooldown beat.
- Divine Arbiter procs give free spender moments.

### Season 2 / Midnight changes noted
- 12.1.0 (wiki): Hammer of Light Ret cost cut from 5 to 3; Avenging Wrath Ret reduced from 20% to 15%; Truth's Wake PvP slow 30% (was 50%).
- Execution Sentence blast radius raised to 10 yd in 12.1.0 (wiki).
- Hotfix 22 Sep 2026: Hammer of Light damage +50%; Empyrean Hammer +12% (wiki).
- Final Verdict hotfix 18 Aug 2026: PvP damage +15% (wiki).
- Icy Veins summary (search, unverified): Retribution lost some burst after the Avenging Wrath and Light Within nerfs; Art of War bonus to Blade of Justice cut from 150% to 80%.
- Hero trees named by Method: Templar and Herald of the Sun.

---

## Death Knight — Blood [necromancer_bone]
Patch/season verified: 12.1 (Method updated 4 Sep 2026; wow.gg updated 7 Oct 2026); Blood numbers from wiki 12.1.0 patch notes and spell pages | Sources: https://method.gg/guides/blood-death-knight/playstyle-and-rotation ; https://wow.gg/guides/death-knight-blood ; https://warcraft.wiki.gg/wiki/12.1.0 ; https://warcraft.wiki.gg/wiki/Death_Strike ; https://warcraft.wiki.gg/wiki/Marrowrend ; https://warcraft.wiki.gg/wiki/Heart_Strike ; https://warcraft.wiki.gg/wiki/Blood_Boil ; https://warcraft.wiki.gg/wiki/Bone_Shield ; Season 2 tier and tuning (search summaries): https://www.archon.gg/wow/builds/blood/death-knight/mythic-plus/gear-and-tier-set/10/murder-row/this-week ; https://www.pcgamesn.com/world-of-warcraft/midnight-season-2-class-tuning-patch-notes
Resources: Runes (Marrowrend 2, Heart Strike 1). Runic Power (Death Strike spends 45; Heart Strike gives 5). Bone Shield charges. Blood Boil charges (2). Blood Debt (Death Strike and Exterminate, Season 2 tier). Boiling Point and Crimson Scourge procs. Coagulopathy buff (wow.gg).

### Core kit (8–12 abilities, incl. 1 mobility + 1-2 defensives + interrupt if the spec has them)
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect (1 line) | Visual (1 line, proposal) |
|---|---|---|---|---|---|---|
| Death Strike | Instant (wiki) | Enemy, melee | GCD only (wiki) | Spends 45 Runic Power (wiki) | Heals 20% of damage taken in the last 5 s, minimum 7% max HP (wiki) | Red strike with green heal motes drawn in |
| Marrowrend | Instant (wiki) | Enemy, melee | GCD only (wiki) | Costs 2 runes (wiki) | Adds 3 Bone Shield charges; 12.1.0 damage +50% (wiki) | Bone-white spike burst with shards |
| Heart Strike | Instant (wiki) | Target plus 1 nearby (wiki) | GCD only (wiki) | Costs 1 rune; gives 5 Runic Power (wiki) | Two hits at about 197% AP, slows both 20% for 8 s (wiki) | Twin red arcs with a slow ring |
| Blood Boil | Instant (wiki) | Area, 10 yd around target | 2 charges, 7.5 s recharge (wiki) | n/v | Shadow damage to nearby enemies; applies Blood Plague (wiki) | Dark red ground burst |
| Bone Shield | Buff | Self | 30 s or until charges are used (wiki) | From Marrowrend (wiki) | Each melee hit consumes a charge; armor 180% Strength (wiki, April hotfix) | Bone plates orbiting the death knight |
| Vampiric Blood | Instant | Self | 1.5 min; 30–45 s with Runic Power spent (wow.gg) | n/v | Preferred defensive; wiki page is stale (10.0.0) | Red mist |
| Dancing Rune Weapon | n/v | Self (clone) | n/v (on cooldown) | n/v | Damage cooldown; parry raised to 30% from 25% (wiki 12.1.0); frontal cone only (wow.gg) | Spectral twin blade |
| Icebound Fortitude | n/v | Self | n/v | n/v | Defensive; stun immunity; avoid overlapping with DRW (wow.gg) | Ice-blue armor shell |
| Anti-Magic Shell | n/v | Self | Short (n/v) | Grants Runic Power when it absorbs (wow.gg) | Absorbs magic and blocks harmful magic effects (wow.gg) | Violet dome |
| Death and Decay | n/v | Ground | n/v | n/v | Ground puddle that slows 90% (wow.gg); Crimson Scourge proc | Dark ground circle |
| Death's Advance | n/v | Self | n/v | n/v | Knockback immunity; the only movement tool named (wow.gg) | Dark dash ribbon |
| Mind Freeze | n/v | Enemy | n/v | n/v | Interrupt; focus-interrupt macro in wow.gg | Cold burst on the caster |

Death Grip (pull and taunt, wow.gg) is not in the table. Lichborne (charm, fear, sleep immunity; high-damage throughput cooldown, wow.gg) also omitted.

### Single-target priority (ordered, 5–8 lines)
San'layn (wow.gg, recommended by Method for all content): 1. Death Strike when low or above 75 Runic Power. 2. Keep at least 5 Bone Shield charges via Marrowrend. 3. Empower Consumption to Rank I if talented. 4. Death and Decay as a maintenance buff. 5. Marrowrend to consume Blood Debt. 6. Blood Boil on a Boiling Point proc. 7. Vampiric Strike. 8. Blood Boil to avoid overcapping charges; Heart Strike as filler.
Inside Dancing Rune Weapon (San'layn): Death Strike if low -> Bone Shield to 5 charges -> one Blood Boil -> Death and Decay on Crimson Scourge -> Vampiric Strike -> Blood Boil filler; empower Consumption to Rank III after DRW ends.
Deathbringer (wow.gg): Death Strike -> Bone Shield to 5 charges via Exterminate or Marrowrend -> Death and Decay -> Reaper's Mark on cooldown -> DRW on cooldown -> Exterminate to consume Blood Debt -> Blood Boil on overcap or Boiling Point -> Consumption Rank I -> Blood Boil filler -> Heart Strike filler.

### AoE priority (3–6 lines)
- Method and wow.gg give no separate AoE list.
- Death and Decay on 4+ targets, or on a Crimson Scourge proc (wow.gg, San'layn).
- Blood Boil is the AoE filler; avoid capping its two charges.
- Consumption empowered for AoE healing or damage reduction (wow.gg).

### Major cooldowns (name, CD, duration, effect)
- Vampiric Blood: 1.5 min, lower with Runic Power spent (wow.gg). Wiki page stale; check tooltip.
- Dancing Rune Weapon: CD n/v; sent on cooldown for damage, doubles as M+ defensive (wow.gg).
- Icebound Fortitude: CD n/v; stun immunity (wow.gg).
- Reaper's Mark: Deathbringer, on cooldown (wow.gg). Raise Dead: used in openers (wow.gg).

### Active mitigation / procs / buff loops
- Bone Shield: armor scales with Strength; each melee hit uses a charge; keep at least 5 charges (wiki, wow.gg).
- Death Strike heal scales with recent damage taken, so back-to-back casts heal little (wow.gg).
- Runic Power cap: Death Strike above 75 (wow.gg). Blood Boil charges: do not overcap (wow.gg).
- Coagulopathy: cast Death Strike before it expires (wow.gg).
- Blood Debt (Season 2 tier): each Death Strike adds a stack; at 10 stacks, the next Marrowrend grants 10% Strength for 10 s (Archon search summary, unverified).

### What makes it feel good (2–4 bullets)
- Bone Shield charges are tangible: Marrowrend or Exterminate refills them, and each hit spends one.
- Death Strike pays you back for damage taken, so taking hits feels like it gives something back.
- wow.gg: the spec is "heavily dependent on resource and buff management", with a Runic Power and Blood Boil juggling loop.
- wow.gg says a death knight is the only class that can pull mobs (via Death Grip), and that Blood takes the most incoming damage of any tank spec.

### Season 2 / Midnight changes noted
- 12.1.0 Blood (wiki): Heart Strike +25%; Marrowrend +50%; Dancing Rune Weapon parry 30% (was 25%); Permafrost shield 50% (was 40%); Voracious leech 15% (was 12%); Rapid Decomposition 85% (was 50%); Sanguinary Burst 18% (was 15%); Perseverance of the Ebon Blade 4% damage reduction for 10 s (was 6 s).
- Death Strike hotfix 22 Sep 2026: damage +15% (wiki). Heal cut to 20% of damage in 12.0.0 (was 25%) (wiki).
- Class tuning (search summary of PCGamesN, unverified): Visceral Strength cut from 10% to 6%; Transfusion's bonus to Dancing Rune Weapon halved to 5%.
- Season 2 tier (Archon search summary, unverified): Baleful Grave-Knight's Crucible; 4-piece adds 3 Bone Shield charges when Blood Debt is spent on Marrowrend.
- Stat priority conflicts: Archon raid says Strength, Crit, Haste, Mastery, Versatility; wow.gg PvE says Strength, then Crit, Mastery, Versatility roughly equal, Haste last; wow.gg 7 Oct says Strength, Haste, Crit, Mastery, Versatility.
- Hero trees: San'layn (Method's recommendation for all content) and Deathbringer.

---

## Death Knight — Unholy [necromancer_summoner]
Patch/season verified: 12.1 (Method patch-change page updated 24 Sep 2026; wow.gg rotation page updated 16 Aug 2026); Army of the Dead, Festering Strike, Scourge Strike from wiki; 19 Aug hotfix noted | Sources: https://method.gg/guides/unholy-death-knight ; https://wow.gg/guides/death-knight-unholy ; https://warcraft.wiki.gg/wiki/Army_of_the_Dead ; https://warcraft.wiki.gg/wiki/Festering_Strike ; https://warcraft.wiki.gg/wiki/Scourge_Strike ; https://warcraft.wiki.gg/wiki/12.1.0 ; https://www.skill-capped.com/wowarticles/general/patch-12-1-notes/ ; Sept tuning (search summary, live status unclear): https://wow.gg/guides/class-tuning-22-09-26
Resources: Runes, Runic Power, Lesser Ghoul stacks (Soul Reaper consumes up to 3), Vile Contagion stacks from Festering Strike (wow.gg) or blight (wiki; wording differs), Sudden Doom procs, Forbidden Knowledge, Magus of the Dead (3 needed for Lord of the Dead).

### Core kit (8–12 abilities, incl. 1 mobility + 1-2 defensives + interrupt if the spec has them)
| Ability | Cast type | Targeting | CD / charges | Cost or generation | Effect (1 line) | Visual (1 line, proposal) |
|---|---|---|---|---|---|---|
| Army of the Dead | Cast type not confirmed (wiki lists it as channeled) | Self; summons ghouls | 1.5 min (wiki) | 1 rune (wiki) | Eight Lesser Ghouls for 30 s; Scourge Strike becomes an Order command (wiki, Method) | Dark gold-green swarm of ghouls rising |
| Festering Strike | Instant (wiki) | Enemy, melee | GCD only (wiki) | Costs 2 runes (wiki) | Coats the weapon with blight; the next 2–3 Scourge Strikes summon a Lesser Ghoul (wiki) | Green blight drip along the blade |
| Scourge Strike | Instant (wiki) | Enemy, 30 yd (wiki) | GCD only (wiki) | Costs 1 rune (wiki) | About 135% AP Shadow; erupts plagues for +35% (wiki); spends Vile Contagion (wow.gg) | Purple-black scythe arc with plague burst |
| Outbreak | n/v | Enemy | n/v | n/v | Keeps diseases on the target (wow.gg) | Green disease spread |
| Death Coil | n/v | Enemy | n/v | Runic Power (n/v) | Used on Sudden Doom procs and in Forbidden Knowledge; single-target filler (wow.gg) | Purple bolt |
| Epidemic | n/v | Area | n/v | Runic Power (n/v) | Replaces Death Coil for AoE; +54% damage in 12.1.0 (wiki) | Purple wave pulse |
| Dark Transformation | n/v | Ghoul | CD n/v | n/v | Opens the Reaper's Mark and Festering Scythe window; Commander of the Dead summons 10%/20% (12.1.0) | Dark bolt, glowing eyes |
| Reaper's Mark | n/v | Enemy under 35% | n/v | n/v | Used during Dark Transformation below 35%; triggers Festering Scythe (wow.gg) | Red mark glyph |
| Soul Reaper | n/v | Enemy | n/v | Consumes up to 3 Lesser Ghoul stacks (Method) | Execute-phase tool; no longer spends Putrefy charges in 12.1 (Method) | Blue-black sickle |
| Lord of the Dead (formerly Reanimation) | n/v | Self | n/v | Sacrifices 3 Magus of the Dead (Method) | Summons a 15 s Lord of the Dead (Method, wiki) | Large dark lich silhouette |
| Mind Freeze | n/v | Enemy | n/v | n/v | Interrupt (named as the interrupt in wow.gg tips) | Cold burst on the caster |
| Death Charge (Rider of the Apocalypse) | n/v | n/v | n/v | n/v | Mobility from the Rider hero tree (Icy Veins 12.0.5 summary, search, unverified) | Dark chain dash |

Death's Advance (knockback immunity) is named for Blood only; no Unholy source covers it. Asphyxiate (5 s stun, talent) and Death Grip (pull, interrupt) are named by wow.gg but have no cast or cooldown data.

### Single-target priority (ordered, 5–8 lines)
Both hero trees (wow.gg): 1. Outbreak to keep diseases up. 2. Festering Scythe if its buff has fallen off. 3. Reaper's Mark if the target is under 35% and Dark Transformation is active, or after Reaping procs. 4. Death Coil on Sudden Doom or during Forbidden Knowledge. 5. Festering Scythe if the target is above 35% and Dark Transformation is active; under 35%, use Reaper's Mark. 6. Festering Strike while under 3 Vile Contagion stacks. 7. Scourge Strike with at least 1 Vile Contagion stack. 8. Death Coil filler.

### AoE priority (3–6 lines)
- Epidemic replaces Death Coil on Sudden Doom and Forbidden Knowledge (wow.gg).
- Festering Scythe needs all targets above 35%; if any target is below 35%, use Reaper's Mark (wow.gg).
- Epidemic is the filler; Death Coil only against fewer than 3 targets (6 in Forbidden Knowledge) (wow.gg).
- During Army of the Dead, Scourge Strike becomes Death Order (single) or Epidemic Order (AoE) by enemy count (wiki, Method).

### Major cooldowns (name, CD, duration, effect)
- Army of the Dead: 1.5 min, 30 s, eight Lesser Ghouls; Lesser Ghoul damage -25% in 12.1.0 (wiki).
- Dark Transformation: CD n/v; opens Reaper's Mark and Festering Scythe window (wow.gg).
- Lord of the Dead: triggered by 3 Magus of the Dead; 15 s (Method, wiki).
- Apocalypse, Unholy Assault, Summon Gargoyle, Raise Dead: not in any source I reached (n/v). Verify they exist in the Midnight kit before designing around them.

### Active mitigation / procs / buff loops
- Vile Contagion or blight stacks: Festering Strike builds them, Scourge Strike spends them. The two sources describe the mechanic differently; check the tooltip (wow.gg vs wiki).
- Sudden Doom: free Death Coil proc (wow.gg).
- Forbidden Knowledge: Putrefy effectiveness 100% (was 60%) in 12.1.0; loses its Necrotic Coil and Graveyard damage boost (Method, wiki).
- Lesser Ghoul stacks: Soul Reaper spends them. A forum post says this forces more Festering Strikes (player report, unverified).
- Epidemic Orders cast from the death knight, not the ghoul (19 Aug hotfix, wiki).

### What makes it feel good (2–4 bullets)
- Army of the Dead turns Scourge Strike into a command button that reads like conducting the army.
- Dark Transformation is the burst window: Reaper's Mark and Festering Scythe spike together.
- wow.gg calls the rotation simple with few abilities, so army micro and minion timing are where variety has to come from.
- Good personal and group defensives (wow.gg).

### Season 2 / Midnight changes noted
- 12.1 (Method): Army of the Dead lasts 30 s and no longer summons extra ghouls while active; Soul Reaper spends up to 3 ghoul stacks; Reanimation renamed Lord of the Dead; Commander of the Dead no longer extends ghoul duration with mastery.
- 12.1.0 (wiki, skill-capped): Epidemic +54%; Putrefy -15% single, +35% AoE; Pestilence -25%; Infected Claw -25%; Magus of the Dead -15%; Army Lesser Ghoul -25%; auto attacks +100%; all damage -3%; Virulent Plague +2%; Commander of the Dead 10%/20% (was 15%/30%).
- Blizzard (search summary): the summons from the base kit plus Rider of the Apocalypse summons went past their comfort level, so Rider was cut back.
- Sept 22 tuning (search summary, live status unclear): Blightfall disease scaling 100% -> 200%; Infliction of Sorrow +75% on Vampiric Strike bursts (was 30%); Blightfall returns to the raid rotation.
- Hero trees: Rider of the Apocalypse and San'layn. Boostmatch (10 Aug, search summary) says Rider for nearly everything; that predates the September push.
- Icy Veins rotation pages cover 12.0.x and were not readable.
