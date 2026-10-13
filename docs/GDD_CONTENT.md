# EFSUN ONLINE: Kadim Zindanlar. Content design (world, dungeons, Mythic+)

This document is the content spec for the hub town, the levelling zone, the four dungeons and the full Mythic+ system. A builder should be able to turn it straight into `data/*.ts`.

* Ids are English `snake_case`. Everything the player sees is Turkish.
* Every number in here is a starting value. Tune by playtest, but keep the ratios.
* The tables, maps and forces sums in sections 2.6 to 5 are **generated and validated by script**: no overlapping rooms, every door sits on a shared edge, every room is reachable, every pack member stands inside its room, and every listed route reaches 100% forces.
* The same data is in **`docs/GDD_CONTENT.layout.json`**: one `DungeonDef`-shaped object per dungeon, including the per-member pack formation offsets. The builder can import that file directly instead of retyping the tables.

Models are the real files listed in `docs/assets/characters.md` and `docs/assets/environment.md`. Where no model fits, a creature is a **recolour / rescale** of an existing model or a **procedural PSX primitive** (spec in §3.7).

**Ownership split with `docs/GDD_SYSTEMS.md`.** The systems doc owns these, and this doc only references them:

* stats, monster base formulas, rank defaults, party scaling and the M+ HP/damage curve (§1.10)
* threat (§1.12), aggro defaults, telegraph timing, flinch and stagger (§1.8, §8.9)
* XP and the Katliam massacre bonus (§6.1-6.2)
* items, item level (§4.3), legendaries (§4.9), sets (§4.10), materials (§5), loot and M+ loot (§7, including the Kadim Kasa vault rewards)
* daily bounties and Av Mührü (§6.8), the death penalty outside the M+ timer (§6.6)

**This doc owns:** the town, the open world, the dungeons, the enemies and bosses, M+ timer / affixes / keystones / rating, and the difficulty modes. Wherever this doc gives a per-monster value (HP x, DMG x, aggro radius, scale, speed), it **overrides** the systems rank default for that monster.

Design pillars covered here:

* WoW-style dungeon craft: route planning, pulls, enemy forces, interrupts, frontal cones, avoidable AoE, tank busters, add phases, enrage timers.
* Hero Siege / Path of Exile / Diablo density and loot ("ARPG zevki", §1).
* Metin2 / Knight Online flavour in the town and the economy.

---

## 0. Global conventions and rules

### 0.1 Units, grid and directions

* 1 world unit = 1 m. Dungeon tile = **4 m** (`TILE_SIZE = 4`, one KayKit `floor_tile_large`).
* A room rectangle `rect x,z,w,h` covers tiles `x..x+w-1` and `z..z+h-1`.
* Positions use **continuous tile coordinates**: position `c` maps to world `(c + 0.5) * 4`. Tile `(5, 24)` is centred at world (22, 98), and a room with x = 2, w = 11 spans continuous x 1.5..12.5 (world 8..52 m).
* **Directions:** `n` = -Z (up on every map), `s` = +Z, `e` = +X, `w` = -X.
* **Doors** (`DoorDef`):
  * `tile` is a tile inside room `a` that touches the shared edge on its `side`.
  * `width` extends along +X for `n`/`s` doors and along +Z for `e`/`w` doors.
  * All doors here are 2 tiles (8 m) wide, so they read as wide ARPG openings. The builder can use 2x `wall_open_scaffold`, or `wall_doorway` + `wall_half` for door frames.
* **Facing** is in degrees: `rotY = facing * PI / 180`. 0 = facing +Z (south), 90 = +X (east), 180 = -Z (north), -90 = -X (west). This matches `rotY = atan2(dx, dz)`.
* Rooms touch edge to edge. The builder places a wall on every edge between two different rooms, or between a room and void, then carves the doors.
* **Scale:** KayKit characters are used at **native scale (≈ 2.4 m)**, per `ARCHITECTURE.md` rule 7 and GDD_SYSTEMS §0. Environment pieces use scale 1. Every `scale` value in this doc is already in that world: KayKit enemies 1.0, and Quaternius monsters = the `characters.md` suggestion x 4/3.
* **Speeds:** the player runs at 7 m/s (GDD_SYSTEMS §1.3). Enemy and mechanic speeds here are set against that.
* **Dodge roll:** 6 m, i-frames 0.04-0.34 s, 2 charges. Every "roll through" mechanic below assumes that roll. Jumping has no combat function in v1, so no mechanic requires jumping.

### 0.2 Where the data goes

| Data | File (suggested) | Type |
|---|---|---|
| Enemy roster §3 | `src/data/enemies.ts` | `EnemyDef` |
| Bosses §4.x.5 | `src/data/bosses.ts` | `BossDef` (phases, enrage) |
| Dungeons §4 | `src/data/dungeons/<id>.ts` or import `docs/GDD_CONTENT.layout.json` | `DungeonDef` |
| Affixes §5.5 | `src/data/affixes.ts` | `MythicAffixDef` (`params` given in the table) |
| Town §2 | `src/data/town.ts` | `TownDef` |
| Open world §2.6 | `src/data/world.ts` | `DungeonDef`-like with `outdoor: true` (see §8) |
| Loot table hints | `src/data/loot.ts` | owned by the items module; this doc gives ids and contents |

### 0.3 Baseline stats, multipliers, party scaling

Every enemy number is a multiplier on the **trash baseline of GDD_SYSTEMS §1.10**:

```ts
monsterHP(L)  = round(14 + 0.62 * L * L)   // trash ("Sıradan") HP. L10 76, L30 572, L60 2246
monsterDmg(L) = round(14 + 4.5 * L)        // per basic attack before coef. L60 284
goldAvg(L)    = 2 + 0.5 * L
```

Below, `TRASH_HP` means `monsterHP(level)`.

| Term | Meaning |
|---|---|
| `hpMult` (HP x) | Enemy HP = monsterHP(L) x hpMult x difficulty (§6) x M+ HP curve x party scaling. **It replaces the systems rank HP multiplier** (swarm 0.35, elite 4, boss 80) for that monster. |
| Boss rule of thumb | At systems pacing a trash mob dies in about 2 hits (≈ 1 s), so a boss's hpMult ≈ **its solo time-to-kill in seconds at par**. B1 60 (≈ 60 s), B2 75, final 110 (Zakhar 120). |
| `dmgMult` (DMG x) | Enemy base damage = monsterDmg(L) x dmgMult x difficulty x M+ damage curve. It replaces the rank damage multiplier (swarm 0.6, elite 1.5, boss 2.5). |
| `coef` | Every ability's damage = coef x that enemy's base damage. As a rough guide, a coef 1.0 trash hit is about 5-8% of a geared non-tank's HP at the same level, so coef 4.5 tank busters are about a third of a health bar on Normal. |
| **Party scaling** | GDD_SYSTEMS §1.10: HP x(1 + 0.6·(n−1)) (open world, Normal, Kahramanlık, Mitik 0) or x(1 + 0.7·(n−1)) (Mitik+). Here it is called `partyHp(n)`, and it also applies to boss shields and breakable adds (cages, phylacteries, tombs). Damage, timers and forces never scale with party size. |
| **Enemy level** | Normal: clamp(party average, `levelRange[0]`, `levelRange[0] + 10`) (systems rule). Kahramanlık: clamp(party average, 50, 60). Mitik 0 / Mitik+: 60. Open world: camp level range. |
| XP / gold | systems rank defaults (§6.2, §6.4): swarm 0.35, trash 1, elite 5, boss 100 (XP). The roster's `XP x` column just shows the rank default. |

### 0.4 Enemy forces (M+ only)

* Every non-summoned trash or elite enemy has a `forces` value (count). The run tracker shows `forces / forcesRequired` as a percentage with 2 decimals, capped at 100%.
* **Summoned, split, revived or boss-spawned enemies give 0 forces** (raised skeletons, slimelets, spiderlings, imps from summoners, boss adds).
* **Completion** = every boss dead **and** forces ≥ 100%. If the final boss dies first, the timer keeps running until 100% is reached; then the run completes instantly at that time.
* Each dungeon's available total is about **122-126%** of the requirement. The two documented routes both reach 100% (§4.x.4), so route planning matters.

### 0.5 Aggro, links, leash, threat

The defaults are in GDD_SYSTEMS:

* aggro radius 12 m trash / 15 m elite with line of sight; any damage aggroes
* pack link 8 m
* threat (§1.12)
* **no leash in dungeons**

This doc adds:

* **Aggro radius override:** the roster's `aggro m` column (8-14 m) is a per-monster override for dungeons. Rooms are tight, and these values keep packs 14-20 m apart pullable one by one. Flying enemies ignore LOS for aggro.
* **Whole-pack link:** every member of a `PackDef` aggroes together, even if more than 8 m apart (patrol formations). Packs with `linkedTo` pull together.
* **Body pulls:** a patrol in combat drags along any idle pack it passes within 4 m of. Fighting next to another pack therefore pulls it. This is intended: the classic WoW "careful pull" skill test.
* **Fixates** (named in the abilities) ignore threat. When a party has no Şövalye, tank busters hit whoever holds aggro. They are always dodgeable (roll i-frames) or blockable.
* **Bosses** never leave their arena (boss rooms lock, §0.7) and reset on a wipe. Trash never resets (systems rule).

### 0.6 Telegraphs, damage categories, interrupts

**Telegraph colours** (`TelegraphKind`):

| Kind | Colour | Meaning |
|---|---|---|
| `danger` | red 0xff3030 | the area fills during the windup; the hit lands when it is full |
| `soak` | yellow 0xffd040 | stand inside |
| `safe` | green 0x40ff80 | the safe spot or shadow |
| `friendly` | blue 0x40a0ff | a player's own ground skill |

**Minimum windups:**

| Situation | Minimum windup |
|---|---|
| Trash ability | 0.6 s |
| Trash ability above coef 2 | 0.8 s |
| Boss ability | 1.0 s |
| Anything above coef 4 (tank busters, soaks) | 1.2 s |
| Big room-wide mechanics | ≥ 2.0 s |

**Damage categories.** Every ability belongs to one:

1. **Avoidable**: circles, cones, lines, waves, puddles. 0 damage if played well. At high keys they become one-shots.
2. **Tank buster**: a big frontal on the current target. Dodge it, block it, or take it with a defensive.
3. **Unavoidable**: basic projectiles, auras, Bursting stacks. Must be healed through or out-leeched.
4. **Interruptible**: shown with a purple cast bar (`enemy_cast_glow`). Gold text **"KESİLDİ!"** with 60 ms hit-stop on success.

**Interrupt rules** (mapped onto the GDD_SYSTEMS mechanics, since the class kits have no dedicated interrupt button):

| Target | What stops an **(interruptible)** cast |
|---|---|
| Swarm / trash | any **flinch** (finishers, heavy skills, crits; §8.9), stun, freeze, knockdown, fear, knockback, or Duman Bombası blind |
| Elites | any hard CC (they take it at 50% duration) or a **stagger break** (Sendeleme, §1.8) |
| Bosses and boss adds marked interruptible | a stagger break, or any hard CC (for boss *adds*) |

* A stopped cast goes on its full cooldown and shows "KESİLDİ!".
* **Recommendation for the combat module:** give each class one cheap interrupt flag on an existing skill (for example Şövalye *Kalkan Darbesi*, a Barbar kick or slam, a Büyücü frost or arcane bolt, Haydut *Duman Bombası*), so that M+ interrupt checks feel deliberate.
* **Interrupt priority** (column in §3): `HIGH` = heals, summons, CC, big nukes. `MED` = buffs.

### 0.7 Boss gates, wipes, checkpoints, deaths

**Gate kinds:**

| Gate | Behaviour |
|---|---|
| `boss_lock` | A door leading **into** a boss room. Open before the fight. Closes 3 s after the boss is engaged (stragglers can still slip in). Opens again when the boss dies or the party wipes. It stays closed while any boss with a lower `order` in the same dungeon is alive. In Gölge Tapınağı the two wing bosses are both `order: 1`, so either order works, and the final (`order: 3`) needs both. |
| `boss_exit` | A door that leads **out** of a boss room toward progress. Closed until that boss is dead. **Not in `src/types/dungeons.ts` yet: add `'boss_exit'` to `DoorDef.gate`.** Until then, treat every door of a boss room that is not on its entry list as `boss_exit`. |

**Wipes:** when every player inside the locked arena is dead or downed, the fight resets:

1. The boss returns to full HP and its spawn point.
2. Adds and ground effects despawn.
3. The doors open after 5 s.
4. The dead respawn at the checkpoint.

**Death and revive** follow GDD_SYSTEMS §6.6:

* An ally holds **F for 3 s** (out of combat), or **F for 4 s in M+ combat**, to revive at 30% HP (`Lie_StandUp` at 2x).
* "Serbest Bırak" (release) respawns the player:
  * Normal / Kahramanlık / Mitik 0: at the latest **Diriliş Taşı** checkpoint, which is the dungeon start and then the exit door of each killed boss
  * Mitik+: at the dungeon start (systems rule)

**Death counter (M+): +15 s per player death.** This doc owns that rule; it supersedes the "+5 s" placeholder in GDD_SYSTEMS §6.6.

---

## 1. ARPG layer ("ARPG zevki"): density, loot and juice on top of WoW structure

The structure is WoW (rooms, packs, bosses, timers). The feel must be Hero Siege / Path of Exile: lots of enemies, lots of explosions, lots of loot.

### 1.1 Density targets

* **Pack size:** trash packs have 3-6 members; swarm packs 6-14 (rats, rattlers, goblins, acolytes, bats).
* **A good M+ pull is 15-35 enemies on screen.** Every dungeon has at least 3 places where two adjacent packs plus a patrol make a natural "big pull".
* **Spawn juice:**
  * Dormant packs (bone piles, coffins, egg sacs) burst out when approached: `Skeletons_Awaken_Floor`, rats out of coffins, imps dropping from the ceiling.
  * Use the `add_spawn` VFX with a 0.3 s camera shake (amplitude 0.08).
* **Kill feedback** (hit-stop, shake, knockback, corpse launch) follows GDD_SYSTEMS §8.3-8.5 and §8.9. Content additions:
  * every boss phase change gets a 120 ms hit-stop and a heavy shake
  * every boss kill gets 0.3x slow-motion for 0.8 s before the systems loot burst (§7.7)

### 1.2 Horde rule for death-triggered affixes

Swarm enemies (`role: 'swarm'`) trigger **Güçlenen, Kan Dökücü, Patlayan and Kin Dolu only on every 3rd swarm death in the run**. Use a deterministic counter on the host. Summoned adds never trigger them. This keeps 30-mob pulls fun on those weeks.

### 1.3 Loot during runs

Monster drops, health globes (Can Küresi), rarity weights, M+ loot and the drop presentation (loot explosion, beams, sounds) are all in **GDD_SYSTEMS §7**. Content-only loot sources:

| Source | Contents | Notes |
|---|---|---|
| breakable (urn, barrel, coffin, crate; the builder's `autoDecor` picks) | 15% gold (goldAvg x 1), 4% potion, 3% item (rolled as a trash drop), 5% Can Küresi | 1 hit; `death_poof` + `hit_bone`/wood SFX. In M+ breakables give gold and globes only. |
| treasure chest (`dungeon/chest_gold`, fixed spots in the §4 decor) | rolled as one Seçkin drop (systems §7.1) + 2 x goldAvg x 6 | Normal / Kahramanlık / Mitik 0 only. In M+ the chest gives gold + 1 Can Küresi. |
| champion (§1.5) | +1 guaranteed Nadir+ item on top of its rank drop | not in M+ |
| Hazine Goblini (§1.6) | 4-8 items (1 Nadir+) + 20 x goldAvg | in M+ it drops only gold, materials and globes, plus 1 item per player (equipment rule of systems §7.4) |

### 1.4 Shrines (Sunak)

Two fixed shrines per dungeon (positions in §4). Click to activate; one use per run. The buff applies to every party member within 20 m. In M+ the shrine types are fixed per dungeon (route planning); in Normal/Heroic each shrine rolls a random type from the seed.

| id | Ad (TR) | Effect | Duration |
|---|---|---|---|
| `shrine_power` | Kudret Sunağı | +25% damage | 30 s |
| `shrine_haste` | Rüzgar Sunağı | +25% move and attack speed | 30 s |
| `shrine_ward` | Koruma Sunağı | -25% damage taken | 30 s |
| `shrine_greed` | Açgözlülük Sunağı (Normal/Heroic only) | gold explosion (30 x goldAvg) + 1 item | instant |
| `shrine_wisdom` | Bilgelik Sunağı (Normal only) | +50% XP | 120 s |

Model: `kenney/graveyard-kit/altar-stone` (x3) with a floating `gen/props/crystal_blue` (purple for power, green for haste, gold for greed), `waypoint_glow` VFX, a PointLight in the shrine colour, distance 6. Used shrines go dark.

### 1.5 Champion packs (Şampiyon, Normal / Heroic / Mythic 0 only)

Per run the host seeds **3 champion packs** among the non-optional trash packs. One member of each, the highest `hpMult`, becomes a **Şampiyon**:

* blue name plate, `buff_aura` VFX in the modifier colour
* x3 HP, x1.4 damage
* 1 random modifier from the table below
* drops 1 guaranteed rare+ item

| Modifier (TR) | Effect |
|---|---|
| Hızlı | +40% move and attack speed |
| Ateşli | on death a circle r 4 m flashes 1.2 s, then coef 2.5 fire |
| Dondurucu | every 8 s fires 3 slow frost orbs that leave chill puddles |
| Kalkanlı | allies within 8 m take -40% damage |
| Vampir | heals 20% of the damage it deals |
| Işınlanan | every 6 s blinks next to a random player |
| Diriltici | revives one dead pack member at 50% once every 15 s |

Mythic+ has no champions (affixes replace them).

### 1.6 Hazine Goblini (treasure goblin)

* Sisli Koru: one roll every 5 min, 15% chance; it spawns at a random camp.
* Dungeons: Normal/Heroic 8% per run, M+ 3% per run. It spawns in a random **already cleared** room after the first boss is killed.
* Spawn cue: a coin-jingle SFX and a gold minimap ping.
* M+ forces: 0, so chasing it costs time. That is the joke and the temptation.
* Behaviour: §3 roster (`treasure_goblin`).

### 1.7 Massacre bonus (Katliam)

The rules and XP are in GDD_SYSTEMS §6.2: a chain with < 1.5 s between kills; bonus at 10/25/50/100 kills; banner "KATLİAM ×N!". Content wants a dense pack layout that lets a good pull reach **Katliam ×50** in each dungeon. The marked big pulls in §4.x.4 are designed for it. Cosmetic extras: `war_cry` VFX on the player at ×25, and the text "KIYAMET!" + achievement `ach_massacre_100` at ×100.

### 1.8 Lanetli Sandık (cursed chest, open world event)

A black chest (`gen/props/chest_epic` tinted 0x302040 with `curse_loop` VFX) at fixed spots (§2.6).

1. Opening it starts **30 s of waves**: every 5 s a wave of 6 camp-level mobs from the zone list spawns in a 10 m ring.
2. Kill **40 enemies in 30 s** for a reward chest, rolled as one Ara Patron drop (GDD_SYSTEMS §7.1) at camp level.
3. Failing gives one Seçkin drop.
4. Cooldown 10 min per spot.

---

## 2. Hub town: **Kuzgunkale** (`town_kuzgunkale`)

"Kuzgunkale, Kadim Zindanların Kapısı" is a walled market town on a hill. It sits above the sealed ancient dungeons; ravens circle its old castle. Eternal golden-hour light, warm and safe: the opposite of the dungeons.

### 2.1 Layout

The town is 120 x 120 m with its origin at the centre. X runs -60..60 (west → east) and Z runs -60..60 (north → south). The north terrace is raised **+2 m**. Music is `town`.

```
 z=-60 +==================== town wall (castle backdrop outside, at z -72) ====================+
       |                     P1 Kemik    P2 Döküm   P3 Buzul    P4 Gölge                       |
       |                        \           \        /           /     (portal arc, r 12 m)    |
 z=-44 |                       KADİM KAPILAR SALONU (terrace y = +2)                            |
       |            Lord Tarhan + Kadim Kasa       Anahtar Ustası      Şeref Taşı              |
 z=-28 |  [church]               guard  ===== stairs =====  guard                [windmill]    |
       |   ÇARŞI (west)               |    ANA YOL     |            ZANAAT SOKAĞI (east)       |
       |   Tüccar Selim + stalls      |                |            Demirci Haldun + anvil     |
       |   Simyacı Lale + cauldron    |    MEYDAN      |            Efsuncu Nergis + altar     |
       |   Depocu Bekir + chests      |  (fountain)    |            Demirci binası             |
 z=+18 |              Buluşma Taşı (-8,18)    Görev Panosu (8,18)                               |
       |   EĞİTİM ALANI (SW)          |                |            HAN BAHÇESİ (SE)           |
       |   Eğitmen Kaya + kuklalar    |                |            Meyhane + Meyhaneci Hasan  |
 z=+58 +=============================== Güney Kapısı (0, 58) ======================================+
                                          -> Sisli Koru (levelling zone)
```

### 2.2 Zones

| Zone | Area (x / z, m) | Contents |
|---|---|---|
| Güney Kapısı (south gate) | x -6..6, z 52..60 | `town/buildings/neutral/wall_straight_gate` x6 scale at (0,0,58). Leaving trigger box x -4..4, z 58..62 → **Sisli Koru** scene. 2 guards. |
| Ana Yol (main road) | x -4..4, z -26..58 | `kenney/fantasy-town-kit/road*` x4 scale (8 m wide), `lantern` x4 every 12 m on both sides. |
| Meydan (plaza) | circle centre (0, 8), r 14 | `kenney/fantasy-town-kit/fountain-round` x4 scale at (0,0,8) (collision r 4.5 m), 4 `bench` around it, flower beds. First-login spawn at (0, 0, 26) facing 180. |
| Zanaat Sokağı (craft street) | x 16..56, z -20..18 | blacksmith and enchanter; forge sparks VFX `ambient_embers`, anvil SFX loop. |
| Çarşı (market) | x -56..-16, z -20..18 | vendor, alchemist, stash; market stalls, crates, sacks. |
| Kadim Kapılar Salonu (portal hall) | x -24..24, z -58..-28, y +2 | Mythic+ hub: 4 dungeon portals, keystone master, vault, leaderboard. Stairs `kenney/fantasy-town-kit/stairs-wide-stone` x4 scale at z -28..-24. |
| Eğitim Alanı (training ground) | x -56..-20, z 24..56 | trainer, dummies, archery targets. |
| Han Bahçesi (tavern yard) | x 20..56, z 24..56 | tavern, idle villagers, music bard (decor). |

### 2.3 NPCs and interactables (`TownDef.npcs`; positions `[x, y, z]` in m; facing in degrees)

| id | Ad (TR) | role | model + loadout / tint | pos | facing | idle / interact clips | UI and line |
|---|---|---|---|---|---|---|---|
| `npc_demirci` | Demirci Haldun Usta | `blacksmith` | Barbarian, only `1H_Axe` visible (stand-in hammer), hide hat and cape, tint 0xb08060 | (24, 0, -6) | -90 | `Idle`; `1H_Melee_Attack_Chop` on the anvil every 3 s; `Cheer` on a +N success, `Hit_B` on a failure | **Güçlendirme** (+0..+15), **Parçalama** (salvage) and **Soket / Oyma** windows (GDD_SYSTEMS §5). "Demir sıcakken dövülür, yiğidim. Ne getirdin?" |
| `npc_cirak` | Çırak Murat | `citizen` | `npcs/Worker.glb` scale 1.25 | (26, 0, -9.5) | -120 | `Interact` loop at the grinding wheel | decor. Bark: "Usta bugün çok sinirli..." |
| `npc_efsuncu` | Efsuncu Nergis | `blacksmith` (UI tab `efsun`; suggest adding role `enchanter`) | Mage, `1H_Wand` + `Spellbook_open` + `Mage_Hat`, tint 0x7040a0 | (24, 0, 8) | -90 | `Spellcasting` loop while rerolling, `Spellcast_Raise` on a legendary efsun | **Efsun** window (bonus reroll). "Efsun, sabır ister. Ve biraz da altın." |
| `npc_tuccar` | Tüccar Selim | `merchant` | Rogue_Hooded, no weapons, tint 0x406080 | (-24, 0, -8) | 90 | `Idle`, `Interact` on open | **Satıcı** (buy/sell/buyback). "Her şeyin bir fiyatı var. Senin de." |
| `npc_simyaci` | Simyacı Lale | `alchemist` | Mage, `1H_Wand`, no hat, tint 0x40a060 | (-24, 0, 4) | 90 | `Spellcasting` over the cauldron every 6 s | **İksirler** (potions, elixirs). "Bu yeşil olanı içme. Henüz." |
| `npc_depocu` | Depocu Bekir | `stash` | Barbarian, `Mug`, no weapons, tint 0x806040 | (-24, 0, 14) | 90 | `Idle`, `Use_Item` | **Depo** (stash). Any chest next to him (`gen/props/chest_iron` x3 at (-27, 0, 12..16)) also opens it. "Eşyaların bende güvende. Çoğu zaman." |
| `npc_anahtar_ustasi` | Anahtar Ustası Yaşar | `keystone` | Knight, no helmet, `Badge_Shield` only, tint 0xc0a060 | (0, 2, -34) | 0 | `Idle`, `Use_Item` when giving or changing a key | **Kadim Anahtar** window: key info, reroll, lower, weekly affixes, key reset. "Anahtar taşı seni seçti. Kehanet Taşı'na götür onu." |
| `npc_lord_tarhan` | Lord Tarhan | `keystone` (UI tab `vault`) | `npcs/King.glb` scale 1.3 | (-8, 2, -34) | 0 | `Idle_Neutral`, `Wave` when the vault is ready | **Kadim Kasa** (weekly vault; rules in GDD_SYSTEMS §7.4). Chest `gen/props/chest_epic` at (-11, 2, -34), glowing when claimable. "Kuzgunkale cesurları ödüllendirir." |
| `obj_seref_tasi` | Şeref Taşı | `citizen` (interactable) | `kenney/graveyard-kit/pillar-obelisk` x3 scale + `gen/props/crystal_purple` x0.5 on top | (8, 2, -34) | 0 | `waypoint_glow` | **Mitik+ Puanı** board: own rating, best runs per dungeon, local and party leaderboards. |
| `portal_kemik_mahzeni` | Kemik Mahzeni | `portal` (`dungeonId`) | `halloween/arch` x2 scale + `portal_swirl` tint 0x7affc0 | (-10.4, 2, -50) | 60 | | **Zindan Seçimi**: difficulty Normal / Kahramanlık / Mitik 0 / Mitik+ (if you hold the key). Locked portals show "Seviye 8 gerekli". |
| `portal_kizil_dokumhane` | Kızıl Dökümhane | `portal` | arch + swirl tint 0xff6a20 | (-4.1, 2, -55.3) | 20 | | same; requires level 18 |
| `portal_buzul_tahti` | Buzul Tahtı | `portal` | arch + swirl tint 0x80c8ff | (4.1, 2, -55.3) | -20 | | same; requires level 30 |
| `portal_golge_tapinagi` | Gölge Tapınağı | `portal` | arch + swirl tint 0xb060ff | (10.4, 2, -50) | -60 | | same; requires level 42 |
| `npc_egitmen` | Eğitmen Kaya | `trainer` | Knight, `2H_Sword`, tint 0x808080 | (-24, 0, 32) | -90 | `2H_Melee_Idle`; `2H_Melee_Attack_Slice` on a dummy every 5 s | **Yetenek Ağacı Sıfırlama** + skill bar help. Costs per GDD_SYSTEMS §3.1: one node 25 x level gold; a full reset uses *Kadim Unutuş Parşömeni* (sold here), 1,000 x level gold, and the first full reset is free. "Ağacın köklerini söküp yeniden dikmek mi? Bedeli var." |
| `obj_kukla_1..5` | Eğitim Kuklası (x2), Elit Kukla, Boss Kuklası, Grup Kuklası | `citizen` (dummy) | procedural straw dummy (§3.7) | (-48, 0, 40), (-43, 0, 40), (-38, 0, 40), (-33, 0, 40); group of 5 small ones around (-40, 0, 48) | 180 | wobble + flash on hit | Never dies (HP resets). DPS meter over the head: 5 s window and total. The Elite dummy counts as elite, the Boss dummy applies `bossDamagePct`, the group tests AoE. |
| `obj_hedef_1..3` | Okçuluk Hedefi | decor | `town/decoration/props/target` x6 scale | (-50..-38, 0, 52) | 180 | | ranged practice, same DPS meter |
| `npc_muhtar` | Muhtar Cemal | `bounty` | Barbarian, unarmed, no cape, tint 0x705030 | (10, 0, 18) | -150 | `Idle`, `Interact` | **Görev Panosu** (daily bounties per GDD_SYSTEMS §6.8; levelling quests §2.5). Board `kenney/survival-kit/signpost` x3 scale at (8, 0, 18). "Zindanlar yine kıpırdıyor. İş var, ödül var." |
| `npc_muhurdar` | Mühürdar Kemal | `merchant` (UI `seal_vendor`) | Knight, no weapons, `Badge_Shield` only, tint 0x506070 | (13, 0, 21) | -150 | `Idle`, `Interact` | **Mühürdar** (Av Mührü vendor, GDD_SYSTEMS §6.8). "Mührünü getir, ödülünü al." |
| `npc_gizemli_tuccar` | Gizemli Tüccar Sabri | `merchant` (UI `gamble`) | Rogue_Hooded, tint 0x30203a, `Throwable` visible | (-21, 0, -18) | 60 | `Idle`; `Throw` (juggling) every 6 s | **Kumar** (gamble vendor, unlocked at level 25, GDD_SYSTEMS §6.3). "Kutunun içinde ne var? Öde ve gör!" |
| `obj_bulusma_tasi` | Buluşma Taşı | `lobby` | `kenney/graveyard-kit/altar-stone` x3 + `gen/props/crystal_blue` x1.2, `waypoint_glow` | (-8, 0, 18) | 0 | | **Online Odalar** (room browser, §5.12). Shows the count of open rooms floating above it. |
| `npc_muhafiz_1..2` | Kale Muhafızı | `guard` | Knight, `1H_Sword` + `Rectangle_Shield`, tint 0x8090b0 | (-5, 0, 55), (5, 0, 55) | 0 | `Blocking` / `Idle` | "Kapıdan çıkarsan kendi başınasın." |
| `npc_muhafiz_3..4` | Kale Muhafızı | `guard` | same | (-7, 0, -24), (7, 0, -24) | 0 | `2H_Melee_Idle` (2H_Sword variant) | "Kadim Kapılar yalnızca cesurlara açılır." |
| `npc_muhafiz_5..6` | Devriye | `guard` | same | loop around the plaza, r 17 m, 30 s per lap, half a lap apart | | `Walking_A` | |
| `npc_meyhaneci` | Meyhaneci Hasan | `citizen` | Barbarian, `Mug`, tint 0x9a6a40 | (34, 0, 34) | -90 | `Use_Item` (drink) every 8 s | "Zindandan sağ döneni bir içki benden!" |
| `npc_koylu_1..6` | Köylü | `citizen` | random KayKit (Knight/Barbarian/Rogue/Mage), unarmed, random tint from [0xa08060, 0x6080a0, 0x80a060, 0xa06060] | benches around the fountain, tavern yard (36..44, 0, 40..48), market | random | `Sit_Chair_Idle`, `Sit_Floor_Idle`, `Cheer` (one near the tavern) | barks only |

Arrival from any dungeon is at (0, 2, -38) facing 0, in front of the portal arc.

### 2.4 Buildings, props and ambient life

* **Walls:** `town/buildings/neutral/wall_straight` x6 scale on the 120 m square (corners `wall_corner_A_outside`). `town/decoration/props/flag_red`/`flag_blue` every 16 m on top.
* **Buildings** (`town/buildings/<colour>/`, x6 scale; façades with box colliders):

| Building | Position | Rotation |
|---|---|---|
| `building_blacksmith_red` | (36, 0, -6) | -90° |
| `building_market_blue` | (-36, 0, -8) | 90° |
| `building_home_A_green` (alchemist) | (-36, 0, 6) | 90° |
| `building_home_B_blue` (Depo) | (-36, 0, 18) | 90° |
| `building_tavern_yellow` | (40, 0, 42) | -90° |
| `building_church_blue` | (-44, 0, -44) | 45° |
| `building_windmill_yellow` | (44, 0, -44) | |
| `building_home_A_red` / `home_B_red` | fill the SE and NE gaps | |
| `building_castle_blue` | (0, 0, -72) | backdrop outside the wall, no collision needed |

* **Forge:** `kenney/survival-kit/workbench-anvil` x3 at (22.5, 0, -6), `workbench-grind` x3 at (26, 0, -11), `barrel` with water, `kenney/survival-kit/campfire-pit` x3 as the forge hearth at (28, 0, -2) with light 0xff7a2a (distance 10, flicker) and `ambient_embers`.
* **Enchanter:** `town/decoration/props/tent` x6 at (32, 0, 8). Efsun altar = `kenney/graveyard-kit/altar-stone` x3 + `gen/props/crystal_purple` x0.8 at (22.5, 0, 8), light 0xb060ff distance 6, slow-rotating crystal.
* **Market:** `kenney/fantasy-town-kit/stall-red`, `stall-green`, `stall` x4 scale at (-21, 0, -14), (-21, 0, -2); crates `town/decoration/props/crate_*`, `sack`, `wheelbarrow`.
* **Alchemist:** cauldron (`kenney/survival-kit/campfire-stand` + `bucket` x3) at (-21.5, 0, 4) with green bubbling VFX (`poison_cloud` tint 0x40ff80, harmless, scale 0.5). Shelves of `dungeon/bottle_*`.
* **Braziers:** `kenney/graveyard-kit/fire-basket` x3 on `dungeon/column` at (±6, 0, 50), (±6, 0, 38), (±6, 0, -20) and on the terrace at (±14, 2, -30), with light 0xff9a40, distance 10.
* **Portal hall:** floor `dungeon/floor_tile_large` (tiles, no walls) on the y = +2 terrace, `banner_triple_*` in each dungeon's colour (green/red/blue/white) behind each portal, `pillar_decorated` x8 framing the arc.
* **Trees:** `town/decoration/nature/trees_A_medium` / `trees_B_large` x6 in the corners and along the inner wall, `kenney/nature-kit` flowers and bushes in the plaza beds.
* **Ambient life:**
  * 6 procedural ravens (black low-poly birds, 2 wing quads) circle the castle at r 20 m, y 25 m.
  * Chimney smoke sprites on homes.
  * Fountain water particles.
  * Banner and flag vertex sway.
  * Drifting leaves (`ambient_dust` tint 0xd0a050).
  * The tavern plays muffled lute music within 15 m.
* **Lighting:**
  * Hemisphere sky 0xffe0b0 / ground 0x504030, intensity 0.6.
  * Sun DirectionalLight 0xffc890, intensity 1.2, from the south-west at 25° elevation (golden hour).
  * Fog 0xd8c0a0, near 30, far 140.
  * PSX dithering on.

### 2.5 Quests and bounties (Görev Panosu)

* **Levelling quests** ("Sefer", one-time, level 1-10, teach the mechanics; XP as a share of `xpToNext(L)` from GDD_SYSTEMS §6.1):

| id | Görev (TR) | Goal | Teaches | Reward |
|---|---|---|---|---|
| `q_ow_rats` | Fare Yuvası | Kill 10 Orman Sıçanı | basic attack, AoE | 40% of xpToNext, 20 gold |
| `q_ow_slime` | Balçık Temizliği | Kill 8 Yeşil Balçık | splitting enemies | 40% of xpToNext, `pot_hp_1` x3 |
| `q_ow_shaman` | Şamanı Sustur | Interrupt Goblin Şamanı's **Şifa Duası** 3 times | **interrupt** (flinch / stun the cast, §0.6) | 50% of xpToNext, Büyülü weapon |
| `q_ow_spider` | Ağ Ustaları | Kill 8 Orman Örümceği | dodge roll out of web shots | 50% of xpToNext |
| `q_ow_village` | Terk Edilmiş Köy | Clear the village camp | packs + patrols | 60% of xpToNext, Büyülü armour |
| `q_ow_orc` | Ork Reisi | Kill the Ork Reisi | elite frontal (Yarma) | 60% of xpToNext, Nadir item |
| `q_ow_crypt` | Kayıp Mezarlık | Kill 8 skeletons at the cemetery | prepares Kemik Mahzeni | 60% of xpToNext, unlocks the Kemik Mahzeni portal hint |
| `q_ow_boss` | Çürükkök | Defeat the world boss | telegraphs, adds | 100% of xpToNext, Nadir item |

* **Daily bounties, Günlük Sandık, Haftalık Ferman and the Av Mührü currency** are defined in GDD_SYSTEMS §6.8; the Görev Panosu board and Muhtar Cemal are their in-town front end, and Mühürdar Kemal sells the seal rewards. Content adds only these dungeon-flavoured template names for the `bounty_dungeon` and `bounty_kill_boss` templates: "Kemik Mahzeni'ni temizle", "Kızıl Dökümhane'yi temizle", "Buzul Tahtı'nı temizle", "Gölge Tapınağı'nı temizle", "Çürükkök'ü yen".

### 2.6 Open world: **Sisli Koru** (`sisli_koru`, levels 1-10)

> **Superseded by `docs/GDD_OPENWORLD.md`** (Sisli Vadi, a 640 m map for levels 1-30, with the camps of this forest moved into its R1/R2, see its §1.7). This section stays as the reference for the camp recipes and the old zone's numbers.

A misty forest valley south of the town gate: abandoned farms, a goblin camp, an old cemetery, and a rotten mound where the mushroom king grows.

* **Size:** 200 x 200 m = 50 x 50 tiles, its own scene.
* **Coordinates:** continuous tile coordinates as in dungeons; origin at the north-west corner.
* **Entry:** at (25, 1) facing 0, from the town's south gate. The return portal **Kuzgunkale Kapısı** stands at (25, 2) (`portal_swirl`, golden).
* **Terrain:**
  * Flat ground plane with `floor_dirt`-like texture and grass tufts (`gen/props/grass_tuft`).
  * Dirt paths link every camp.
  * Tree walls on the borders: `kenney/nature-kit/tree_*` x4 scale and `halloween/tree_pine_*` (cylinder colliders).
  * Rocks `town/decoration/nature/rock_single_*`.
  * Ruined walls `kenney/castle-kit` wall pieces x4 around the cemetery.
* **Look:** fog 0x9aa890, near 15, far 70. Hemisphere 0xc0d0b0 / 0x303820, intensity 0.5. Sun dimmed to 0.6, green-grey. Music `town` at 60% volume, or a forest ambience loop.
* **Mobs:** respawn timer per camp; the whole camp respawns once it has been empty for that long and no player is within 30 m. Mob level is rolled uniformly in the camp range. XP follows GDD_SYSTEMS §6.2.

| camp | Ad (TR) | centre (tiles) | radius (m) | mob levels | members | respawn |
|---|---|---|---|---|---|---|
| ow_c01 | Fare Yuvası | 25, 8 | 12 | 1-2 | Orman Sıçanı (`ow_rat`) x6 | 60 s |
| ow_c02 | Balçık Gölü | 14, 12 | 16 | 1-3 | Yeşil Balçık (`ow_slime`) x5 | 60 s |
| ow_c03 | Yağmacı Kampı | 36, 13 | 16 | 2-4 | Goblin Yağmacı (`ow_goblin`) x5, Goblin Şamanı (`ow_goblin_shaman`) x1 | 75 s |
| ow_c04 | Mantar Halkası | 10, 24 | 16 | 3-5 | Mantarcık (`ow_mushnub`) x8 | 60 s |
| ow_c05 | Örümcek Korusu | 40, 25 | 16 | 4-6 | Orman Örümceği (`ow_spider`) x4, Orman Sıçanı (`ow_rat`) x4 | 75 s |
| ow_c06 | Terk Edilmiş Köy | 24, 27 | 20 | 5-7 | Çürümüş Köylü (`ow_zombie`) x6, Mağara Yarasası (`ow_bat`) x4 | 90 s |
| ow_c07 | Yarasa Mağarası | 8, 38 | 12 | 6-8 | Mağara Yarasası (`ow_bat`) x8 | 60 s |
| ow_c08 | Ork Karakolu | 38, 38 | 20 | 7-9 | Ork Reisi (`ow_orc_chief`) x1, Goblin Yağmacı (`ow_goblin`) x6, Goblin Şamanı (`ow_goblin_shaman`) x2 | 120 s |
| ow_c09 | Kayıp Mezarlık | 16, 42 | 16 | 8-10 | Çürümüş Köylü (`ow_zombie`) x5, İskelet Er (`skel_minion`) x3 | 90 s |

**Special spots:**

| Spot | Position (tiles) | What |
|---|---|---|
| **Çürük Höyük** (world boss arena) | centre (25, 44), r 6 tiles (24 m) | Mushroom ring, `kenney/nature-kit/mushroom*` x4 scale, purple spore VFX. |
| Lanetli Sandık spots | (32, 20), (12, 32) | §1.8 |
| Hazine Goblini | random camp | §1.6 |
| Kemik Mahzeni hint | (16, 46), cemetery crypt door (`kenney/graveyard-kit/crypt-large`) | Interact: "Kapı mühürlü. Kuzgunkale'deki Kadim Kapılar Salonu'ndan girilebilir." |

**World boss: Çürükkök, the Mantar Kral** (`wb_curukkok`, level 10)

| Field | Value |
|---|---|
| Model | `monsters/Mushroom_King.glb`, scale 1.36 (4.7 m). Sceptre `Mushroom` visible. |
| HP | hpMult 100 (≈ 100 s solo at par); party scaling per GDD_SYSTEMS (players within 50 m) |
| Damage | dmgMult 2.5 |
| Arena | r 24 m (leash 30 m) |
| Respawn | 15 min after death (host clock); spawn announced in zone chat: "Çürükkök topraktan yükseliyor!" |
| Enrage | none (world boss) |

Abilities (all clips from `characters.md` §5.4):

| Ability | id | Timing | Shape / effect |
|---|---|---|---|
| Asa Darbesi | `curukkok_smash` | every 2.6 s (`Weapon`, impact 0.45) | cone 110°, 5 m, coef 1.0 |
| Spor Bulutu | `curukkok_spores` | first 8 s, cd 15 s (`Punch`) | 3 clouds r 4 m at random players' positions, 1.5 s grow-in, linger 10 s, coef 0.4 per 0.5 s poison |
| Mantarcık Çağrısı | `curukkok_call` | first 15 s, cd 25 s (`Wave`) | 6 `ow_mushnub` jump in from the ring edge (they explode into spore puffs on death) |
| Zıplayan Ezici | `curukkok_jump` | first 12 s, cd 20 s (`Jump` → `Jump_Idle` → `Jump_Land`) | lands on the farthest player: circle r 5 m, 1.5 s telegraph, coef 3.0 + knockdown 1 s, then a ring 5-9 m, coef 1.0 |
| Çürüme Halkası | `curukkok_rot_ring` | below 20% HP, every 12 s | expanding spore ring, 2 m thick, 0 → 20 m at 5 m/s, coef 2.0. Roll through it. |

Loot: the systems Patron drop row (§7.1) at monster level 13 (= ilvl 13), personal. First kill: achievement `ach_curukkok` + title "Mantar Avcısı".

---

## 3. Enemy roster

### 3.1 How to read it

* `HP x` / `DMG x` are multipliers on the systems trash baseline (§0.3) and replace the rank default; `forces` is the M+ count.
* `scale` is for the native-KayKit world (§0.1); `speed` is set against the 7 m/s player; `aggro m` overrides the systems radius.
* The **ability strings** are written so they map 1:1 onto `EnemyAbility`: "cast X s (interruptible)" → `castTime` + `interruptible: true`; "windup" → telegraph time; "cd" → `cooldown`; "first after" → `initialCooldown`.
* Default animations come from `characters.md` §5.3. KayKit enemies: idle `Idle`, walk `Walking_A`, run `Running_A`, hit `Hit_A`, death `Death_A`; skeletons use `Death_C_Skeletons`. Quaternius enemies use their suffix clips.
* **Tints** multiply the base colour of every material (KayKit: the texture; Quaternius: the `*_Main` materials). Keep eye materials untinted, plus an emissive where one is given.
* Weapons attach to `handslot.r` / `handslot.l` with the offsets from `characters.md` §1.1.

### 3.2 Open world and global

| id | Ad (TR) | model (+weapon) | scale (native world) | tint | role / rank | HP x | DMG x | speed m/s | aggro m (override) | forces | XP x (rank) | interrupt priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ow_goblin` | Goblin Yağmacı | `monsters/Goblin.glb` | 0.59 | - | melee / trash | 0.8 | 0.8 | 6.2 | 9 | 0 | 1 | - |
| `ow_goblin_shaman` | Goblin Şamanı | `monsters/Goblin.glb` | 0.61 | 0x7a9a40 | healer / trash | 0.9 | 0.8 | 5.3 | 10 | 0 | 1 | - |
| `ow_rat` | Orman Sıçanı | `monsters/Rat.glb` | 0.31 | - | swarm / trash | 0.3 | 0.4 | 7.7 | 8 | 0 | 0.35 | - |
| `ow_spider` | Orman Örümceği | `monsters/Spider.glb` | 0.63 | 0x6a7a3a | melee / trash | 0.9 | 0.9 | 7 | 9 | 0 | 1 | - |
| `ow_slime` | Yeşil Balçık | `gen/creatures/slime_green.glb` | 1.07 | - | melee / trash | 0.8 | 0.7 | 4.8 | 8 | 0 | 1 | - |
| `ow_mushnub` | Mantarcık | `monsters/Mushnub.glb` | 0.36 | - | swarm / trash | 0.4 | 0.5 | 6.4 | 8 | 0 | 0.35 | - |
| `ow_bat` | Mağara Yarasası | `monsters/Bat.glb` | 0.47 | - | swarm / trash (flying) | 0.3 | 0.4 | 8.4 | 10 | 0 | 0.35 | - |
| `ow_zombie` | Çürümüş Köylü | `monsters/Zombie.glb` | 0.88 | - | melee / trash | 1.3 | 1.1 | 3.6 | 8 | 0 | 1 | - |
| `ow_orc_chief` | Ork Reisi | `monsters/Orc.glb` | 1.05 | - | melee / elite | 4 | 1.6 | 5.6 | 11 | 0 | 5 | - |

**Goblin Yağmacı** (`ow_goblin`)
  - Temel: Pala Darbesi: melee cone 90°, 2.0 m, cd 1.8 s, coef 1.0 (`Attack`, impact 0.37)
  - Taş Fırlat: projectile 14 m/s, range 14 m, cd 6 s, windup 0.6 s, coef 1.2

**Goblin Şamanı** (`ow_goblin_shaman`)
  - Temel: Zehir Oku: projectile 16 m/s, range 16 m, cd 2.4 s, coef 1.0 + poison 1 stack
  - **Şifa Duası** (interruptible, tutorial interrupt): cast 2.0 s, cd 10 s, heals the lowest ally 20% max HP

**Orman Sıçanı** (`ow_rat`)
  - Temel: Isırık: melee 1.2 m, cd 1.2 s, coef 1.0

**Orman Örümceği** (`ow_spider`)
  - Temel: Isırık: melee 1.8 m, cd 1.6 s, coef 1.0
  - Ağ Atışı: projectile 16 m/s, range 12 m, cd 9 s, root 1.5 s

**Yeşil Balçık** (`ow_slime`)
  - Temel: Gövde Çarpması: melee 1.5 m, cd 1.8 s, coef 1.0
  - Bölünme: on death splits into 2 `ow_slime` at scale 0.6 / 30% HP that do not split again

**Mantarcık** (`ow_mushnub`)
  - Temel: Isırık: melee 1.2 m, cd 1.4 s, coef 1.0
  - Spor Bulutu: on death a poison cloud r 2 m for 3 s, coef 0.3 per 0.5 s

**Mağara Yarasası** (`ow_bat`)
  - Temel: Dalış Isırığı: melee 1.5 m, cd 1.3 s, coef 1.0 (`Bat_Attack2`)

**Çürümüş Köylü** (`ow_zombie`)
  - Temel: Pençe: melee 2.0 m, cd 2.0 s, coef 1.0
  - Çürük Nefes: cone 60°, 4 m, cd 10 s, windup 0.8 s, poison 3 stacks

**Ork Reisi** (`ow_orc_chief`)
  - Temel: Balta: cone 110°, 3 m, cd 2.2 s, coef 1.0 (`Weapon`)
  - Savaş Narası: cd 20 s, allies within 12 m +25% damage for 8 s (`Wave`, VFX `war_cry`)
  - Yarma: cd 9 s, windup 1.0 s, line 7 m x 2 m, coef 2.2

| id | Ad (TR) | model (+weapon) | scale (native world) | tint | role / rank | HP x | DMG x | speed m/s | aggro m (override) | forces | XP x (rank) | interrupt priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `treasure_goblin` | Hazine Goblini | `monsters/Goblin.glb` | 0.67 | 0xffd040 | support / elite | 12 | 0 | 7.7 | 14 | 0 | 5 | - |

**Hazine Goblini** (`treasure_goblin`)
  - Never attacks. Flees from the nearest player along random nav points.
  - Drops 1 gold pile for every 10% HP lost.
  - Kaçış Portalı: after 20 s in dungeons (30 s outdoors) it casts 3.0 s (interruptible, a stun also stops it) and escapes. Each interrupt adds +5 s.
  - Death: loot explosion of 4-8 items (at least 1 rare) and 20x normal gold, plus `loot_beam` on every drop.

### 3.3 Kemik Mahzeni enemies (skeleton crypt)

| id | Ad (TR) | model (+weapon) | scale (native world) | tint | role / rank | HP x | DMG x | speed m/s | aggro m (override) | forces | XP x (rank) | interrupt priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `skel_rattler` | Takırdayan İskelet | `enemies/Skeleton_Minion.glb` | 0.8 | 0xcfc4a8 | swarm / trash | 0.35 | 0.5 | 6.7 | 8 | 1 | 0.35 | - |
| `crypt_rat` | Mahzen Faresi | `monsters/Rat.glb` | 0.31 | 0x6a5a50 | swarm / trash | 0.25 | 0.4 | 7.7 | 8 | 1 | 0.35 | - |
| `bone_skull` | Uçan Kafatası | `monsters/Skull.glb` | 0.71 | 0xe8e0c8 | swarm / trash (flying) | 0.4 | 1 | 7.7 | 10 | 1 | 0.35 | - |
| `skel_minion` | İskelet Er | `enemies/Skeleton_Minion.glb` + `weapons/skeleton/Skeleton_Blade.gltf` | 1 | - | melee / trash | 1 | 1 | 5.9 | 9 | 2 | 1 | - |
| `skel_archer` | İskelet Okçu | `enemies/Skeleton_Rogue.glb` + `weapons/skeleton/Skeleton_Crossbow.gltf` | 1 | - | ranged / trash | 0.8 | 1 | 5.6 | 12 | 3 | 1 | - |
| `skel_mage` | Kemik Büyücüsü | `enemies/Skeleton_Mage.glb` + `weapons/skeleton/Skeleton_Staff.gltf` | 1 | - | caster / trash | 1.1 | 1.2 | 4.9 | 12 | 4 | 1 | HIGH |
| `crypt_ghoul` | Gulyabani | `monsters/Zombie.glb` | 0.93 | 0x9fb59a | melee / trash | 1.4 | 1.2 | 6.4 | 9 | 4 | 1 | - |
| `crypt_wraith` | Mahzen Hortlağı | `monsters/Ghost.glb` | 0.79 | 0x88ffcc | caster / trash (flying) | 1.2 | 1.1 | 5 | 11 | 5 | 1 | HIGH |
| `skel_warrior` | İskelet Muhafız | `enemies/Skeleton_Warrior.glb` + `weapons/skeleton/Skeleton_Blade.gltf + Skeleton_Shield_Large_A.gltf` | 1.07 | - | tank / elite | 2.6 | 1.3 | 5.3 | 10 | 6 | 5 | - |
| `bone_golem` | Kemik Golemi | `monsters/Giant.glb` | 1.07 | 0xe8dcc0 | tank / elite (CC immune) | 6 | 2 | 4.2 | 10 | 12 | 5 | - |

**Takırdayan İskelet** (`skel_rattler`)
  - Unarmed; hide `Skeleton_Minion_Cloak`. Spawns from a bone pile with `Spawn_Ground_Skeletons` at 2x speed (1.8 s).
  - Temel: Yumruk: melee 1.6 m, cd 1.6 s, coef 1.0 (`Unarmed_Melee_Attack_Punch_A`)

**Mahzen Faresi** (`crypt_rat`)
  - Temel: Veba Isırığı: melee 1.2 m, cd 1.2 s, coef 1.0; 20% chance of poison 1 stack (coef 0.15/s for 5 s, max 5)

**Uçan Kafatası** (`bone_skull`)
  - Floats at +0.8 m; eye emissive 0x60ff90.
  - **Kafatası Patlaması**: once within 2.5 m it flashes for 0.8 s (red circle r 2.5 m), then explodes: coef 2.0 and the skull dies. Dodge or kill it first.

**İskelet Er** (`skel_minion`)
  - Temel: Kılıç: cone 90°, 2.4 m, cd 2.0 s, coef 1.0 (`1H_Melee_Attack_Chop`, impact 0.58)
  - Kemik Yığını: dies into a bone pile (`Death_C_Skeletons`) that stays 12 s. A living `skel_mage` can raise it (see below).

**İskelet Okçu** (`skel_archer`)
  - Keeps 8-14 m away (`Walking_Backwards` to kite).
  - Temel: Kemik Ok: projectile 22 m/s, range 18 m, cd 2.4 s, windup 0.6 s, coef 1.0
  - Çoklu Atış: cd 10 s, windup 1.0 s (3 red lines), 3 bolts with 15° spread, coef 0.9 each

**Kemik Büyücüsü** (`skel_mage`)
  - Temel: Gölge Oku: projectile 16 m/s, range 20 m, cd 2.6 s, windup 0.8 s, coef 1.0 (shadow)
  - **Ölüleri Kaldır** (interruptible): cast 2.5 s, cd 14 s, first cast after 4 s. Raises up to 3 bone piles within 15 m as `skel_minion` at 50% HP (0 forces). With no piles nearby it summons 2 `skel_rattler` (0 forces). `Spellcast_Summon` at 1.7x.

**Gulyabani** (`crypt_ghoul`)
  - Temel: Yırtıcı Pençe: cone 90°, 2.2 m, cd 1.6 s, coef 1.0 + bleed 1 stack (coef 0.2/s for 6 s, max 5)
  - Leş Yiyici: below 40% HP it eats a corpse within 6 m. Channel 2.0 s, heals 30%. Interrupt, stun or knockback cancels it.

**Mahzen Hortlağı** (`crypt_wraith`)
  - Material opacity 0.65, additive rim.
  - Temel: Ruh Dokunuşu: projectile 14 m/s, range 18 m, cd 2.2 s, coef 1.0 (shadow)
  - **Korkunç Çığlık** (interruptible): cast 2.0 s, cd 16 s, self AoE r 8 m, fear 3 s
  - Ruh Emme (interruptible): channel 3 s on one player, coef 0.5 every 0.5 s, heals itself for 300% of the damage dealt; cd 12 s

**İskelet Muhafız** (`skel_warrior`)
  - Temel: Yatay Kesik: cone 100°, 2.6 m, cd 2.2 s, coef 1.0
  - Kalkan Duruşu (passive): takes 60% less damage from its frontal 120°. Flank it.
  - Kalkan Darbesi: cd 12 s, windup 0.8 s, cone 60° 3.5 m, coef 2.0 + knockback 5 m + interrupt (`Block_Attack`)

**Kemik Golemi** (`bone_golem`)
  - About 4.1 m tall, collision radius 1.1 m. CC immune.
  - Temel: Ezme: cone 120°, 3.5 m, cd 2.8 s, coef 1.0
  - Yer Sarsıntısı: cd 14 s, windup 1.4 s, circle r 6 m on itself, coef 2.5 + knockdown 1 s
  - Kemik Zırhı: at 50% HP gains a shield worth 20% of max HP for 10 s
  - Death: bursts into 4 `skel_rattler` (0 forces)

### 3.4 Kızıl Dökümhane enemies (fire forge)

| id | Ad (TR) | model (+weapon) | scale (native world) | tint | role / rank | HP x | DMG x | speed m/s | aggro m (override) | forces | XP x (rank) | interrupt priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `forge_goblin` | Dökümhane Goblini | `monsters/Goblin.glb` | 0.59 | 0x8a6a50 | swarm / trash | 0.45 | 0.6 | 7 | 9 | 1 | 0.35 | - |
| `flame_skull` | Alevli Kafatası | `monsters/Skull.glb` | 0.71 | 0xff8040 | swarm / trash (flying) | 0.5 | 1 | 7.7 | 10 | 1 | 0.35 | - |
| `forge_imp` | Ateş İblisçiği | `monsters/Imp.glb` | 0.67 | 0xff6030 | ranged / trash (flying) | 0.7 | 1 | 7 | 12 | 2 | 1 | - |
| `lava_slime` | Lav Balçığı | `gen/creatures/slime_lava.glb` | 1.33 | - | melee / trash | 1 | 1 | 5 | 9 | 2 | 1 | - |
| `lava_slimelet` | Lav Damlası | `gen/creatures/slime_lava.glb` | 0.8 | - | swarm / trash | 0.25 | 0.5 | 6.2 | 10 | 0 | 0.35 | - |
| `fire_priest` | Ateş Rahibi | `characters/Mage.glb` | 1 | 0x7a2020 | healer / trash | 1.3 | 0.9 | 4.9 | 12 | 5 | 1 | HIGH |
| `forge_demon` | Kor İblisi | `monsters/Demon.glb` | 1.09 | 0xc03020 | melee / elite | 2.2 | 1.6 | 5.9 | 10 | 6 | 5 | - |
| `forge_orc` | Ork Köle Başı | `monsters/Orc.glb` | 1.05 | 0x8a4a3a | melee / elite | 2.8 | 1.5 | 5.6 | 10 | 7 | 5 | MED |
| `magma_golem` | Magma Golemi | `PROC:golem_magma` | 1.33 | 0x3a2a26 | tank / elite (CC immune) | 4 | 1.8 | 3.9 | 10 | 10 | 5 | - |

**Dökümhane Goblini** (`forge_goblin`)
  - Temel: Çekiç: melee 1.6 m, cd 1.4 s, coef 1.0
  - Kor Fırlat: cd 8 s, lobbed at a player (0.9 s flight), circle r 1.5 m, coef 1.2, leaves fire for 3 s

**Alevli Kafatası** (`flame_skull`)
  - Emissive 0xff4000 and VFX `burn_loop`.
  - Temel: Isırık: melee 1.4 m, cd 1.4 s, coef 1.0
  - Alev Hücumu: cd 9 s, windup 0.8 s, charge line 8 m x 1.5 m, coef 1.6 + burn (coef 0.3/s for 4 s)

**Ateş İblisçiği** (`forge_imp`)
  - Temel: Ateş Topu: projectile 18 m/s, range 18 m, cd 2.0 s, windup 0.5 s, coef 1.0 (`Punch`)
  - Ateş Yağmuru (interruptible): cast 2.0 s, cd 15 s, circle r 4 m at the target, 3 ticks of coef 0.6

**Lav Balçığı** (`lava_slime`)
  - Fallback model: `monsters/Slime.glb` scale 0.8, tint `Main` 0xff5a1a.
  - Temel: Kızgın Çarpma: melee 1.6 m, cd 1.8 s, coef 1.0 (fire)
  - Death: splits into 2 `lava_slimelet` (0 forces) and leaves a lava puddle r 2 m for 5 s (coef 0.4 per 0.5 s)

**Lav Damlası** (`lava_slimelet`)
  - Summoned only (split). Temel: melee 1.2 m, cd 1.4 s, coef 1.0

**Ateş Rahibi** (`fire_priest`)
  - Loadout `2H_Staff` + `Mage_Hat`, cape tinted 0x401010.
  - Temel: Kor Oku: projectile 16 m/s, range 18 m, cd 2.4 s, coef 1.0 (fire)
  - **Alev Şifası** (interruptible): cast 2.0 s, cd 10 s, heals the lowest ally 25% max HP
  - **Kızıl Kalkan** (interruptible): cast 1.5 s, cd 16 s, shields an ally for 20% of its max HP, lasts 10 s

**Kor İblisi** (`forge_demon`)
  - Temel: Alevli Pençe: cone 100°, 2.6 m, cd 2.0 s, coef 1.0 + burn
  - Alev Soluğu: cd 12 s, windup 1.0 s, cone 60° 6 m, coef 1.8 (fire)
  - Kızgınlık: below 30% HP, +40% attack speed until it dies

**Ork Köle Başı** (`forge_orc`)
  - Temel: Balta: cone 110°, 3 m, cd 2.2 s, coef 1.0 (`Weapon`)
  - Kırbaç Şaklaması: cd 10 s, windup 0.9 s, cone 90° 7 m, coef 1.6 + slow 30% for 3 s
  - **Çalışın!** (interruptible): cast 2.0 s, cd 18 s, allies within 12 m get +30% attack and move speed for 10 s (`haste`)

**Magma Golemi** (`magma_golem`)
  - Procedural model, 3.7 m tall (see §3.7). Emissive cracks 0xff4a10. CC immune.
  - Temel: Yumruk: cone 100°, 3 m, cd 2.6 s, coef 1.0
  - Lav Yumruğu: cd 12 s, windup 1.3 s, circle r 5 m on itself, coef 2.2
  - **Çekirdek Erimesi**: on death a circle r 6 m flashes for 3.0 s, then explodes for coef 3.0. Move out.

### 3.5 Buzul Tahtı enemies (frost throne)

| id | Ad (TR) | model (+weapon) | scale (native world) | tint | role / rank | HP x | DMG x | speed m/s | aggro m (override) | forces | XP x (rank) | interrupt priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ice_bat` | Buz Yarasası | `monsters/Bat.glb` | 0.47 | 0xdff4ff | swarm / trash (flying) | 0.3 | 0.5 | 8.4 | 11 | 1 | 0.35 | - |
| `frost_slime` | Ayaz Balçığı | `gen/creatures/slime_frost.glb` | 1.33 | - | melee / trash | 0.8 | 0.8 | 5 | 9 | 2 | 1 | - |
| `frost_dead` | Donmuş Ölü | `enemies/Skeleton_Minion.glb` + `weapons/skeleton/Skeleton_Axe.gltf` | 1 | 0x9fd8ff | melee / trash | 1 | 1 | 5.9 | 9 | 2 | 1 | - |
| `snow_spider` | Kar Örümceği | `monsters/Spider.glb` | 0.63 | 0xf0f6ff | ranged / trash | 0.9 | 1 | 7 | 10 | 3 | 1 | - |
| `frost_wraith` | Buz Hortlağı | `monsters/Ghost.glb` | 0.79 | 0xb0e8ff | caster / trash (flying) | 1.1 | 1.2 | 5 | 11 | 4 | 1 | HIGH |
| `ice_elemental` | Buz Elementali | `gen/props/crystal_blue.glb` | 1.33 | - | support / elite | 2 | 1 | 4.2 | 11 | 6 | 5 | MED |
| `yeti_brute` | Genç Yeti | `monsters/Yeti.glb` | 1 | - | melee / elite | 3.5 | 1.7 | 6.2 | 10 | 8 | 5 | - |
| `frost_knight` | Ayaz Şövalyesi | `characters/Knight.glb` | 1.07 | 0x8ab8e0 | tank / elite | 3 | 1.6 | 5.3 | 10 | 8 | 5 | - |

**Buz Yarasası** (`ice_bat`)
  - Temel: Dondurucu Isırık: melee 1.4 m, cd 1.3 s, coef 1.0 + chill 1 stack (chill: -10% move speed per stack, 4 s, max 5; at 5 stacks freeze 1.5 s)

**Ayaz Balçığı** (`frost_slime`)
  - Fallback model: `monsters/Slime.glb` scale 0.8, tint 0x9fd8ff.
  - Temel: Buz Çarpması: melee 1.6 m, cd 1.8 s, coef 1.0 (frost)
  - Death: frost nova r 3 m after 0.8 s, coef 1.0 + chill 2 stacks

**Donmuş Ölü** (`frost_dead`)
  - Temel: Buz Baltası: cone 90°, 2.4 m, cd 2.0 s, coef 1.0 + chill 1 stack
  - Donmuş Kalp (passive): fire damage taken +50%, frost damage taken -30%

**Kar Örümceği** (`snow_spider`)
  - Temel: Isırık: melee 1.8 m, cd 1.6 s, coef 1.0
  - Buz Ağı: cd 10 s, windup 0.6 s, projectile 16 m/s, range 14 m, root 2 s + chill 2 stacks

**Buz Hortlağı** (`frost_wraith`)
  - Opacity 0.7.
  - Temel: Buz Oku: projectile 16 m/s, range 18 m, cd 2.2 s, windup 0.6 s, coef 1.0 (frost)
  - **Buz Mızrağı** (interruptible): cast 2.5 s, cd 9 s, projectile 24 m/s, coef 2.4 + freeze 1 s
  - Kar Fırtınası: cd 16 s, circle r 4 m at a player for 4 s, coef 0.4 per 0.5 s + chill

**Buz Elementali** (`ice_elemental`)
  - Procedural: `crystal_blue.glb` body (scale 1.33) hovering 0.4 m with 3 orbiting shard boxes (see §3.7).
  - Temel: Kristal Kıymığı: projectile 18 m/s, range 16 m, cd 2.4 s, coef 1.0 (frost)
  - **Buz Zırhı** (interruptible): cast 2.0 s, cd 14 s, an ally within 15 m gets a shield worth 25% of its max HP and slow immunity for 10 s
  - Death, Parçalanma: 8 radial lines 10 m x 1 m flash for 1.0 s, coef 1.2

**Genç Yeti** (`yeti_brute`)
  - Temel: Pençe: cone 120°, 3 m, cd 2.4 s, coef 1.0
  - Kar Topu: cd 11 s, windup 1.0 s, projectile 14 m/s, radius 1.2 m, coef 2.0 + knockdown 1 s
  - Sarsıcı Sıçrayış: cd 15 s, windup 1.2 s, circle r 5 m at the landing point, coef 1.8
  - Göğüs Yumruklama: once, at 50% HP: +30% damage for 10 s (`enrage_aura`)

**Ayaz Şövalyesi** (`frost_knight`)
  - Loadout `2H_Sword` + `Knight_Helmet` + `Knight_Cape` (cape tint 0x203a5a). Hide the shields and `1H_Sword`.
  - Temel: 2H Kesik: cone 120°, 3 m, cd 2.4 s, coef 1.0 (`2H_Melee_Attack_Slice`)
  - Dondurucu Kesik: cd 9 s, windup 1.0 s, cone 120° 5 m, coef 2.5 + chill 3 stacks (frontal, so dodge it or face it away)
  - Ayaz Aurası (passive): players within 6 m get chill 1 stack every 2 s

### 3.6 Gölge Tapınağı enemies (shadow temple)

| id | Ad (TR) | model (+weapon) | scale (native world) | tint | role / rank | HP x | DMG x | speed m/s | aggro m (override) | forces | XP x (rank) | interrupt priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `cult_acolyte` | Tarikat Müridi | `characters/Rogue_Hooded.glb` | 1 | 0x4a2a6a | swarm / trash | 0.5 | 0.7 | 6.4 | 9 | 1 | 0.35 | - |
| `cult_assassin` | Gölge Suikastçısı | `characters/Rogue.glb` | 1 | 0x2a1a3a | melee / trash | 1 | 1.5 | 7.3 | 6 | 3 | 1 | - |
| `shade` | Gölge | `monsters/Ghost.glb` | 0.79 | 0x301040 | caster / trash (flying) | 1 | 1.2 | 5.6 | 11 | 3 | 1 | HIGH |
| `shadow_spider` | Gece Örümceği | `monsters/Spider.glb` | 0.67 | 0x201028 | melee / trash | 1.2 | 1.2 | 7 | 9 | 3 | 1 | - |
| `void_imp` | Boşluk İblisçiği | `monsters/Imp.glb` | 0.67 | 0x8040ff | ranged / trash (flying) | 0.6 | 1 | 7.3 | 12 | 2 | 1 | - |
| `shadow_priest` | Gölge Rahibi | `characters/Mage.glb` | 1 | 0x3a1050 | healer / trash | 1.2 | 0.9 | 4.9 | 12 | 5 | 1 | HIGH |
| `cult_summoner` | Tarikat Çağırıcısı | `characters/Mage.glb` | 1 | 0x5a1a40 | caster / trash | 1.3 | 1 | 4.9 | 12 | 5 | 1 | HIGH |
| `void_demon` | Boşluk Muhafızı | `monsters/Demon.glb` | 1.2 | 0x5020a0 | tank / elite | 3.2 | 1.7 | 5.6 | 10 | 8 | 5 | - |

**Tarikat Müridi** (`cult_acolyte`)
  - Loadout `Knife` only (hide crossbows).
  - Temel: Hançer: melee 1.6 m, cd 1.4 s, coef 1.0
  - Fanatik: when an ally within 10 m dies, +10% damage per stack (max 5) for 8 s. Burst the whole pack down together.

**Gölge Suikastçısı** (`cult_assassin`)
  - Loadout `Knife` + `Knife_Offhand`.
  - Gizlenme: alpha 0.15 and untargetable until a player is within 5 m or it takes damage. AoE reveals it.
  - Pusu: its first hit deals coef 2.5
  - Temel: Zehirli Bıçak: melee 1.8 m, cd 1.5 s, coef 1.0 + poison 1 stack (coef 0.25/s for 6 s, max 5)
  - Duman Bombası: once, at 50% HP: `Throw` smoke, vanishes 2 s, reappears behind a random player

**Gölge** (`shade`)
  - Opacity 0.55, VFX `ambient_shadow_wisps` trail.
  - Temel: Gölge Dokunuşu: projectile 16 m/s, range 16 m, cd 2.2 s, coef 1.0 (shadow)
  - **Kabus** (interruptible): cast 2.0 s, cd 14 s, fears a random non-tank for 4 s
  - Faz Geçişi (passive): 30% chance to ignore physical projectiles

**Gece Örümceği** (`shadow_spider`)
  - Eye emissive 0xa040ff.
  - Temel: Zehirli Isırık: melee 1.8 m, cd 1.6 s, coef 1.0 + poison 1 stack
  - Yavru Kesesi: on death spawns 3 `shadow_spiderling` (Spider scale 0.24, HP 0.15, dmg 0.3, 0 forces)

**Boşluk İblisçiği** (`void_imp`)
  - Emissive 0x6020ff.
  - Temel: Boşluk Oku: projectile 18 m/s, range 18 m, cd 2.0 s, windup 0.5 s, coef 1.0 (shadow)
  - Sıçrama: cd 8 s, when a player is within 3 m it blinks 8 m away (VFX `blink`)

**Gölge Rahibi** (`shadow_priest`)
  - Loadout `1H_Wand` + `Spellbook_open` + `Mage_Hat`.
  - Temel: Zihin Delgisi: projectile 16 m/s, range 18 m, cd 2.4 s, coef 1.0 (shadow) + curse (-10% healing received, 6 s)
  - **Karanlık Şifa** (interruptible): cast 2.0 s, cd 9 s, heals an ally 30% max HP
  - **Gölge Kalkanı** (interruptible): cast 1.5 s, cd 15 s, shields an ally for 20% of its max HP, lasts 10 s

**Tarikat Çağırıcısı** (`cult_summoner`)
  - Loadout `2H_Staff`, hide `Mage_Hat` (bald, so it reads differently from the priest), cape tint 0x200818.
  - Temel: Boşluk Oku: projectile 16 m/s, range 18 m, cd 2.4 s, coef 1.0
  - **İblis Çağır** (interruptible): cast 3.0 s, cd 16 s, first cast after 3 s, summons 2 `void_imp` (0 forces)
  - **Karanlık Ayin** (interruptible): channel 4 s, cd 20 s: every `cult_acolyte` within 12 m gets +30% damage for 10 s

**Boşluk Muhafızı** (`void_demon`)
  - Emissive 0x6030ff at 0.3.
  - Temel: Pençe: cone 100°, 2.8 m, cd 2.2 s, coef 1.0
  - Ezici Darbe: cd 12 s, windup 1.1 s, cone 70° 4 m, coef 3.0 + sunder (armor -20% for 10 s). Tank buster: dodge or block.
  - Boşluk Çekimi: cd 18 s, windup 1.5 s, pulls players within 10 m 4 m toward itself, then circle r 3 m, coef 1.2

### 3.7 Procedural PSX models (no asset needed)

All procedural models:

* use flat-shaded `MeshLambertMaterial` with vertex colours
* use 2-4 primitive types at low segment counts (PSX look)
* animate by transform tweens in code (bob, lean, punch arm rotation)
* are built once and cloned per instance
* are authored for a 1.8 m human below and **placed at group scale 1.33** (native KayKit world)

| id | Used by | Build |
|---|---|---|
| `PROC:golem_magma` | `magma_golem` (authored 2.8 m, placed at 3.7 m) | Torso: icosahedron detail 0, r 0.9, at y 1.6, colour 0x3a2a26. Head: box 0.6³ at y 2.6 with 2 emissive eye quads 0xffa020. Arms: 2 elongated icosahedrons (r 0.45, scale y 1.8) at ±1.1 x, hinged at the shoulder. Legs: 2 boxes 0.5 x 1.0 x 0.5. Glowing cracks: an emissive 0xff4a10 copy of the torso scaled 1.02 with a noise alpha cutout. Anims: idle bob 0.05 m @ 0.8 Hz; walk = leg swing ±25°; punch = arm rotates -110° over 0.35 s (impact) then returns over 0.5 s; death = parts fly apart + `fire_burst`. |
| `PROC:ice_elemental` | `ice_elemental` | Body: `gen/props/crystal_blue.glb` at scale 1.0, hovering 0.3 m, slow spin 20°/s. Shards: 3 boxes 0.15 x 0.5 x 0.15 (0x9fd8ff, emissive 0x204060) orbiting at r 1.0 m, 90°/s, y 1.2. Cast = shards speed up to 360°/s + `frost_burst`. |
| `PROC:explosive_orb` | affix Patlayıcı Küre | Sphere r 0.5 (8 x 6 segments), emissive 0xff40ff pulsing 2 Hz, outer additive halo sprite, hovering 1.5 m. A countdown ring under it shrinks over 6 s. |
| `PROC:soul_orb` | Morkan phase 2 | Sphere r 0.4, emissive 0x60ff90, trailing `ambient_shadow_wisps`. |
| `PROC:phylactery` | Azrakel phase 2 | `gen/props/crystal_purple.glb` tinted 0x60ff90, scale 0.8, on a `dungeon/column` stump; HP bar above it. |
| `PROC:dummy` | town training dummies | Post: cylinder r 0.08, 1.6 m. Body: cylinder r 0.35, 0.9 m, at y 1.0, straw 0xc8a060. Head: sphere r 0.25 (sack 0xb09060). Cross-arm: box 1.2 x 0.12 x 0.12. Hit = 8° wobble spring + white flash. Elite variant tinted 0xa0a0ff with a shield prop; Boss variant scale 1.6 with a crown (5 cone spikes, 0xffd040). |
| `PROC:ice_tomb` / `PROC:bone_cage` | Ayaz Ana / Morkan | Ice tomb: semi-transparent box 1.2 x 2.2 x 1.2, 0x9fd8ff, opacity 0.6, around the player. Bone cage: 8 vertical `halloween/bone_A` around the player in r 0.8 + ring. Each is a targetable entity with an HP bar. |
| `PROC:rift` | seasonal affix, Kevvas | Vertical torus r 1.2 tube 0.15 + `portal_swirl` inside, colour per type. |

### 3.8 Affix and system units

| id | Ad (TR) | Model | HP | Behaviour |
|---|---|---|---|---|
| `affix_explosive_orb` | Patlayıcı Küre | `PROC:explosive_orb` | dies to 1 direct hit (see §5.5) | casts 6 s, then explodes (§5.5) |
| `affix_spiteful_shade` | Kin Ruhu | `monsters/Ghost.glb` scale 0.67, tint 0x200010, opacity 0.6 | 30% of the dead enemy's max HP, decays 8% per second | fixates a random non-tank (§5.5) |
| `affix_storm_tornado` | Fırtına Hortumu | VFX `storm_tornado` (cylinder of swirling quads, h 6 m, r 1.5 m) | untargetable | §5.5 |
| `affix_sanguine_pool` | Kan Gölü | decal + `sanguine_pool` VFX, r 4 m | | §5.5 |
| `efsun_guardian_kor` | Kor Yarık Muhafızı | `monsters/Demon.glb` scale 1.33, tint 0xff6a00, emissive 0xff3000 | 15 x TRASH_HP(60) x M+ HP curve x partyHp | seasonal (§5.5.4) |
| `efsun_guardian_ayaz` | Ayaz Yarık Muhafızı | `monsters/Yeti.glb` scale 1.07, tint 0x9fd8ff, emissive 0x2060a0 | same | seasonal |
| `efsun_guardian_golge` | Gölge Yarık Muhafızı | `monsters/Ghost.glb` scale 1.33, tint 0x6020a0, opacity 0.75 | same | seasonal |
| `cult_ritualist` | Ayin Rahibi | `characters/Mage.glb` scale 1.07, tint 0x5a1a40, `Spellbook_open` | 6 x TRASH_HP x partyHp | Zakhar phase 2 |
| `shadow_spiderling` | Örümcek Yavrusu | `monsters/Spider.glb` scale 0.24, tint 0x201028 | 0.15 x TRASH_HP | melee 1 m, cd 1.2 s, coef 0.3 |

---
## 4. Dungeons

| dungeon | timer | forces required | available | packs | bosses |
|---|---|---|---|---|---|
| Kemik Mahzeni (`kemik_mahzeni`) | 13:00 (780 s) | 250 | 314 (126%) | 27 | 3 |
| Kızıl Dökümhane (`kizil_dokumhane`) | 13:30 (810 s) | 270 | 331 (123%) | 28 | 3 |
| Buzul Tahtı (`buzul_tahti`) | 14:00 (840 s) | 250 | 309 (124%) | 25 | 3 |
| Gölge Tapınağı (`golge_tapinagi`) | 15:00 (900 s) | 210 | 257 (122%) | 20 | 3 |

**Shared rules for all four dungeons:**

* **Normal / Heroic:** packs and bosses are active as soon as you enter. No timer.
* **M0:** level 60, the M+ baseline (§6), plus an end-of-run chest and the first keystone.
* **M+:** the party spawns at `start`. Enemies spawn (deterministically, ids from `DUNGEON_ENEMY_ID_BASE + index`) when the key is inserted at the **Kehanet Taşı** (`KT` on the maps). A shimmering barrier blocks the start room's exit during the 10 s countdown.
* After the final boss dies, the **exit portal** (`EX`) appears with the end-of-run chest beside it: `gen/props/chest_epic` for M+, `chest_gold` for M0/Heroic, `chest_iron` for Normal.
* **Boss encounters:** a boss pulls when a player enters its aggro radius of 12 m, or attacks it. The music switches to `boss`, and a health bar with the boss's Turkish name and title appears at the top.
* **Boss stat block:**
  * `hpMult` is on the systems trash HP (`TRASH_HP`, §0.3) and gets the difficulty, Tyrannical, M+ and party multipliers.
  * `enrage` is the hard enrage after the pull: +300% damage plus a room-wide pulse of coef 50 every 2 s, i.e. a wipe.
* Bosses follow the systems Patron rules: hard-CC immune (converted to stagger), slows x0.5, stagger bar 600 (§1.8). A stagger break (Sendeleme) stuns for 4 s and stops a cast marked **(interruptible)**. Other boss casts cannot be stopped.
* **Loot hints:** drop counts, item level and rarity come from GDD_SYSTEMS §7. Each boss below only biases slot and weapon picks (x2 weight), favours one systems set (x2) and named systems legendaries (x3), within their minimum ilvl (sets ≥ 40, so Kemik Mahzeni and Kızıl Dökümhane sets drop only on Kahramanlık or higher). Dungeon-specific legendaries are suggestions for the items module.

**Model and scale reference for bosses** (native-KayKit world, §0.1; heights at the given scale):

| Boss id | Model | Scale | Height | Tint / emissive | Weapons / meshes |
|---|---|---|---|---|---|
| `boss_bekci_kaldur` | `enemies/Skeleton_Warrior.glb` | 1.67 | 4.3 m (helmet) | 0xd8c8a0 | `weapons/skeleton/Skeleton_Axe.gltf` R, `Skeleton_Shield_Large_B.gltf` L |
| `boss_olucagiran_morkan` | `enemies/Skeleton_Mage.glb` | 1.73 | 4.5 m (hat) | 0x6aa070 | `Skeleton_Staff.gltf` R |
| `boss_azrakel` | `gen/bosses/kemik_lordu.glb` (fallback: `Skeleton_Mage` 2.27, tint 0x6a40a0) | 0.93 | 4.8 m | emissive map already in the file | built-in staff |
| `boss_dokumcu_gurz` | `monsters/Orc.glb` | 1.73 | 5.3 m | 0x9a5a40 | `Orc_Weapon` visible |
| `boss_atesyurek` | `monsters/Giant.glb` | 1.67 | 6.5 m | 0x3a2a26 / emissive 0xff4a10 x0.6 | none |
| `boss_ignaroth` | `monsters/Blue_Demon.glb` | 2.0 | 5.3 m | none / emissive 0x2060ff x0.3 | baked in |
| `boss_ak_pence` | `monsters/Yeti.glb` | 1.87 | 5.7 m | 0xf4f8ff | none |
| `boss_ayaz_ana` | `characters/Mage.glb` | 1.8 | 4.8 m (hat) | 0xa8d8ff, hat 0x203a5a | `1H_Wand` + `Spellbook_open` + `Mage_Hat` |
| `boss_tugrul` | `characters/Knight.glb` | 2.0 | 4.9 m (helmet) | 0x7fb2e6, cape 0x203a5a | `2H_Sword`, `Knight_Helmet`, `Knight_Cape` |
| `npc_kiragi` (phase 2 dragon, untargetable) | `monsters/Dragon_Evolved.glb` | 2.4 | 10.7 m span | 0xd8f0ff | none |
| `boss_nefris` | `characters/Rogue_Hooded.glb` | 1.73 | 3.9 m | 0x5a2a7a | `Knife` + `Knife_Offhand` (hide crossbows) |
| `boss_kevvas` | `monsters/Demon.glb` | 2.53 | 5.6 m | 0x40207a / emissive 0x8040ff x0.4 | none |
| `boss_zakhar` | `monsters/Demon_Lord.glb` | 2.07 | 6.0 m | none / emissive 0x6020a0 x0.3 | `Trident` visible in P1-P2, hidden in P3 |

---

### 4.1 Kemik Mahzeni (`kemik_mahzeni`): skeleton crypt, the first dungeon

#### 4.1.1 Identity

| field | value |
|---|---|
| id | `kemik_mahzeni` |
| Normal level range | 8-18 (Normal enemy level = clamp(party avg, 8, 18), per GDD_SYSTEMS §1.10; Kahramanlık 50-60, Mitik 60) |
| M+ timer | 13:00 (780 s) |
| enemy forces for 100% | 250 |
| grid | 40 x 40 tiles (160 x 160 m) |
| fog | 0x141a18, near 8 m, far 38 m |
| ambient | 0x3c4a48 x 0.35 |
| hemisphere sky / ground | 0x6a7a90 / 0x201810 |
| torch colour | 0xffa050 |
| bloom | 0.6 |
| KayKit texture tint | 0xc8d0c8 |
| palette | 0x2b2f2a, 0x5d6b5a, 0xd8d0b8, 0x7affc0, 0xffa050 |
| music | `dungeon_crypt` (boss fights: `boss`) |

**Lore (loading screen, TR):**
> Kuzgunkale'nin altında, unutulmuş kralların kemikleri yatar. Kemik Lordu Azrakel, ölümsüzlüğü filakterlerine bağladı ve mahzenin her köşesinde ölüleri yeniden ayağa kaldırdı. Bekçi Kaldur hâlâ kapıyı tutar; ruh kuyusu ise diriler için açlıkla fokurdar.

**Visual direction:**

* Desaturated grey-green stone, bone white props, sickly green ghost-fire candles (0x7affc0) mixed with warm orange torches.
* Thick low fog that hugs the floor (fog near 8 m).
* PSX: heavy dithering, torches flicker at 8-12 Hz.
* Music `dungeon_crypt`: slow choir drones, bone rattles, low strings.

#### 4.1.2 Map

```
    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9
  2     11111111111111111111          CCCCCCCCCCCCCCCCCCCC
  3     11111111111111111111          CCCCCCCCCCCCCCCCCCSN        DDDDDDDDDDDDDD
  4     11111111111111111111          CCCCCCCCCCCCCCCCCCCC        DDDDDDDDDDDDDD
  5     11111111111111111111          CCCCCC..CCCCCCCC..CC        DDDD..DDDDDDDD
  6     1111111111B1111111%%%%cccccc++++CCCCCCCCCCCCCCCC++++dddd++++DDDDDDDDDDDD
  7     111111111111111111%%%%cc..cc++++CCCCCCCCCCCCCCCC++++dd..++++DDDDDDDDDDDD
  8     11111111111111111111          CCCCCCCCCC..CCCCCCCC        DDDDDDDDDDDDDD
  9     11111111111111111111          CCCCCCCCCCCCCCCCCCCC        DDDD..DDDD..DD
 10     11111111111111111111          CCCCCCCCCCCCCCCCCCCC        DDDD++++DDDDDD
 11     11111111111111111111          CCCCCCCCCCCCCCCCCCCC            ++++
 12     11111111####11111111          CCCCCC..CCCCCCCC..CC            eeee
 13             ####                  CCCCCC++++CCCCCCCCCC            ee..
 14             bbbb                        ++++                      eeee
 15             bb..                        gg..                      ####
 16             ++++                        ++++            2222222222####222222
 17     BBBBBBBB++++BBBBBBBBBB    FFFFFFFFFF++++FFFF        22222222222222222222
 18     BBBBBBBBBBBBBBBBBBBBBB    FFFFFFFFFFFFFFFFFF        22222222222222222222
 19     BBBBBBBBBBBBBBBBBBBBBB    FFFF..FFFFFFFFFF++++ffff####22222222B222222222
 20     BBBB..BBBBBBBBBB..BBBB    FFFFFFFFFFFFFFFF++++ff..####222222222222222222
 21     BBBBBBBBBBBBBBBBBBBBBB    FFFFFFFFFFFFFFFFFF        22222222222222222222
 22     BBBBBBBBBB..BBBBBBBBBB    FFFFFFFFFFFFFF..FF        22222222222222222222
 23     BBBBBBBBBBBBBBBBBBBBBB    FFFF..FFFFFFFFFFFF        22222222222222222222
 24     BBBBBBBBBBBBBBBBBBBBBB    FFFFFF++++FFFFFFFF        22222222222222222222
 25     BBBBBB..BBBBBBBB..BBBB          ++++                22222222####22222222
 26     BBBBBBBBBBBBBBBBBBBBBB          hhhh                  EEEEEE####EEEEEEEE
 27     BBBBBBBB++++BBBBBBBBBB          hh..                  EEEEEEEEEEEEEEEEEE
 28             ++++                    ####                  EEEEEEEEEEEEEEEEEE
 29             aaaa            33333333####33333333333333    EEEEEE..EEEEEEEEEE
 30             aa..            33333333333333333333333333    EEEEEEEEEEEEEEEEEE
 31             aaaa            333333333333EX333333333333    EEEEEEEEEEEEEE..EE
 32             ++++            33333333333333333333333333    EEEEEE..EEEEEEEEEE
 33         AAAA++++AAAA        33333333333333333333333333    EEEEEEEEEEEEEEEESN
 34         AAAAAAKTAAAA        33333333333333333333333333
 35         AAAAAAAAAAAA        333333333333B3333333333333
 36         AAAAAAAAAAAA        33333333333333333333333333
 37         AAAAAASTAAAA        33333333333333333333333333
 38                             33333333333333333333333333
```

Legend: `A` giris, `a` k_giris, `B` kemik_salonu, `b` k_bekci, `1` bekci_odasi, `c` k_fener, `C` lahit_galerisi, `d` k_mum, `D` mum_odasi, `e` k_kuyu, `2` ruh_kuyusu, `E` unutulmus_mezarlar, `f` k_cukur, `F` ceset_cukuru, `g` cokuk_tunel, `h` k_taht, `3` kemik_taht. `++` open door, `##` boss_lock door, `%%` boss_exit door, `ST` start, `KT` Kehanet Taşı (Font of Power), `B1-B3` boss spawns, `EX` exit portal, `SN` shrine, `..` trash pack centre. Rows with no rooms are omitted.

#### 4.1.3 Rooms, decoration, doors

| id | Ad (TR) | rect x,z,w,h (tiles) | size (m) | floor / wall | forces | notes |
|---|---|---|---|---|---|---|
| `giris` | Mahzen Kapısı | 4, 33, 6, 5 | 24 x 20 | stone_dark / stone | - |  autoDecor 0.3 |
| `k_giris` | Mezar Taşları Geçidi | 6, 28, 2, 5 | 8 x 20 | stone_dark / stone | 9 |  autoDecor 0.5 |
| `kemik_salonu` | Kemik Salonu | 2, 17, 11, 11 | 44 x 44 | stone / stone | 54 |  autoDecor 0.6 |
| `k_bekci` | Bekçi Geçidi | 6, 13, 2, 4 | 8 x 16 | stone / stone | 9 |  autoDecor 0.3 |
| `bekci_odasi` | Bekçi Odası | 2, 2, 10, 11 | 40 x 44 | tiles / stone | - | **Boss 1 arena** autoDecor 0.2 |
| `k_fener` | Fenerli Dehliz | 12, 6, 5, 2 | 20 x 8 | stone_dark / stone | 6 |  autoDecor 0.4 |
| `lahit_galerisi` | Lahit Galerisi | 17, 2, 10, 12 | 40 x 48 | stone / stone | 63 |  autoDecor 0.6 |
| `k_mum` | Mum Yolu | 27, 6, 4, 2 | 16 x 8 | stone_dark / stone | 7 |  autoDecor 0.4 |
| `mum_odasi` | Mum Şapeli | 31, 3, 7, 8 | 28 x 32 | tiles / brick | 38 |  autoDecor 0.5 |
| `k_kuyu` | Kuyuya İniş | 33, 11, 2, 5 | 8 x 20 | dirt / cave | 11 |  autoDecor 0.4 |
| `ruh_kuyusu` | Ruh Kuyusu | 28, 16, 10, 10 | 40 x 40 | stone_dark / stone | - | **Boss 2 arena** autoDecor 0.2 |
| `unutulmus_mezarlar` | Unutulmuş Mezarlar | 29, 26, 9, 8 | 36 x 32 | dirt / cave | 50 | optional autoDecor 0.7 |
| `k_cukur` | Çukur Geçidi | 24, 19, 4, 2 | 16 x 8 | stone_dark / stone | 6 |  autoDecor 0.3 |
| `ceset_cukuru` | Ceset Çukuru | 15, 17, 9, 8 | 36 x 32 | dirt / cave | 43 |  autoDecor 0.6 |
| `cokuk_tunel` | Çöken Tünel | 20, 14, 2, 3 | 8 x 12 | dirt / cave | 6 | skip route autoDecor 0.6 |
| `k_taht` | Taht Merdivenleri | 18, 25, 2, 4 | 8 x 16 | tiles / brick | 12 |  autoDecor 0.2 |
| `kemik_taht` | Kemik Taht | 14, 29, 13, 10 | 52 x 40 | tiles / brick | - | **Boss 3 arena** autoDecor 0.15 |

**Decoration and props per room** (model names are files under `/assets/models/dungeon/` unless a pack prefix is given; `halloween/`, `furniture/`, `town/`, `gen/`, `kenney/...` are folders under `/assets/models/`):

- `giris`: `stairs_walled` against the south wall, centred at (6.5, 37) facing n (the way back up, decorative). Kehanet Taşı (Font of Power) at (7, 34.2). 2 `torch_mounted` on the side walls, `banner_patternC_green` on the north wall, `candle_triple` x4, `halloween/skull_candle` x2.
- `k_giris`: `halloween/gravestone` and `gravemarker_A/B` along both walls (6 total), `torch_mounted` every 2 tiles, cobwebs (VFX `ambient_dust`).
- `kemik_salonu`: Ossuary hall. 2 rows of `halloween/coffin` and `coffin_decorated` (8) at x=4 and x=10, `pillar` grid at every 3rd tile corner, bone piles `halloween/bone_A/B/C`, `ribcage`, `skull` (20, which double as the dormant `skel_rattler` spawn piles of pack d1_p02), `chest` at (11, 18) (breakable loot), 6 `torch_mounted`, ghost-green `candle_lit` clusters (light 0x7affc0, distance 5).
- `k_bekci`: `sword_shield_broken` on the walls, 2 `banner_shield_white`, a portcullis frame `wall_gated` (opened) at the boss door.
- `bekci_odasi`: Square arena 40 x 44 m. 4 `pillar_decorated` at (4,5) (9,5) (4,10) (9,10). 4 bone piles at the corners (Mezarlık Çağrısı add spawns): (3,3) (10,3) (3,11) (10,11). `sword_shield_gold` wall trophies, 8 `torch_mounted`, `banner_triple_white` behind the boss.
- `k_fener`: `halloween/lantern_hanging` x3 (light 0xffc070, distance 8), `shelf_small_candles`, broken `table_medium_broken`.
- `lahit_galerisi`: Sarcophagus gallery: 3 rows of `halloween/coffin_decorated` on `floor_foundation_allsides` daises (2 m high, unwalkable). `halloween/crypt` facade on the north wall, `shrine_candles` x2, `floor_tile_big_grate` drains, broken rubble `rubble_large` x3, 8 `torch_mounted`. Shrine **Kudret Sunağı** at (26, 2.5) (north-east corner).
- `k_mum`: Candle path: `candle_melted` and `candle_thin_lit` along the floor edges (light 0xffb070, distance 4).
- `mum_odasi`: Chapel: `halloween/shrine` altar at (34, 3.5) facing s, `bench_decorated` pews in 3 rows, `plaque_candles` on the walls, `pictureframe_large_A` (furniture) x2, `banner_patternA_white` x2.
- `k_kuyu`: `stairs_narrow` going down visually (no height change), `floor_dirt_small_weeds`, `keyring_hanging`, roots.
- `ruh_kuyusu`: Arena 40 x 40 m around a soul well: `floor_tile_extralarge_grates_open` (8 x 8 m, unwalkable centre r 3.5 m) at (33, 21) with green light 0x60ff90 (distance 14, intensity 2) and VFX `ambient_shadow_wisps`. 4 `pillar` at (30,18) (36,18) (30,24) (36,24). `halloween/candle_triple` ring.
- `unutulmus_mezarlar`: Optional cave graveyard (dead end): `halloween/floor_dirt_grave`, `grave_A`, `grave_A_destroyed`, `grave_B`, `gravestone` (14 total), `tree_dead_small` x2, `fence_broken`, `post_lantern` x2 (light 0xffc070). Shrine **Rüzgar Sunağı** at (37, 33). Treasure: `chest_gold` at (37, 28).
- `k_cukur`: `barrier` rails along the walls, `bone_A` scatter.
- `ceset_cukuru`: Corpse pit: sunken centre `floor_tile_big_grate` x4 at (18..21, 20..21), `halloween/ribcage` and `skull` heaps, `coffin` (opened) x3, meat hooks (`keyring_hanging` stand-ins), green fog patch (VFX `poison_cloud` decorative, harmless).
- `cokuk_tunel`: Skip tunnel: `rubble_half` and `rubble_large` partly blocking it (leave a 1-tile lane), `wall_broken` at the lahit_galerisi end, dripping VFX `ambient_dust`.
- `k_taht`: `stairs_wide` look (flat), 2 `banner_triple_green`, `pillar_decorated` x2 at the arena door.
- `kemik_taht`: Final arena 52 x 40 m. Throne dais: `floor_foundation_front` 3 x 1 at (19..21, 37.5), `chair` scaled 2.0 tinted 0xd8d0c0 as the bone throne, `halloween/skull` pile around it. 3 phylactery spots (Filakter Evresi): (15.5, 31) (25, 31) (20, 37). 6 `pillar` along the side walls, 10 `torch_mounted` with green fire (0x7affc0) in phase 2, `banner_triple_white` x4.

| a | b | tile (in a) | side | width | gate |
|---|---|---|---|---|---|
| giris | k_giris | 6, 33 | n | 2 | none |
| k_giris | kemik_salonu | 6, 28 | n | 2 | none |
| kemik_salonu | k_bekci | 6, 17 | n | 2 | none |
| k_bekci | bekci_odasi | 6, 13 | n | 2 | boss_lock |
| bekci_odasi | k_fener | 11, 6 | e | 2 | boss_exit |
| k_fener | lahit_galerisi | 16, 6 | e | 2 | none |
| lahit_galerisi | k_mum | 26, 6 | e | 2 | none |
| k_mum | mum_odasi | 30, 6 | e | 2 | none |
| mum_odasi | k_kuyu | 33, 10 | s | 2 | none |
| k_kuyu | ruh_kuyusu | 33, 15 | s | 2 | boss_lock |
| ruh_kuyusu | unutulmus_mezarlar | 32, 25 | s | 2 | boss_lock |
| ruh_kuyusu | k_cukur | 28, 19 | w | 2 | boss_lock |
| k_cukur | ceset_cukuru | 24, 19 | w | 2 | none |
| lahit_galerisi | cokuk_tunel | 20, 13 | s | 2 | none |
| cokuk_tunel | ceset_cukuru | 20, 16 | s | 2 | none |
| ceset_cukuru | k_taht | 18, 24 | s | 2 | none |
| k_taht | kemik_taht | 18, 28 | s | 2 | boss_lock |

#### 4.1.4 Trash packs, forces, routes

| pack | room | centre (tiles) | members | forces | notes |
|---|---|---|---|---|---|
| d1_p01 | k_giris | 6.5, 30 | İskelet Er (`skel_minion`) x3, İskelet Okçu (`skel_archer`) x1 | **9** |  |
| d1_p02 | kemik_salonu | 4.5, 25 | Takırdayan İskelet (`skel_rattler`) x8 | **8** | Dormant: bone piles (`Skeletons_Inactive_Floor_Pose`) that wake up (`Skeletons_Awaken_Floor`) when a player comes within 6 m. |
| d1_p03 | kemik_salonu | 10, 25 | İskelet Er (`skel_minion`) x3, Kemik Büyücüsü (`skel_mage`) x1 | **10** |  |
| d1_p04 | kemik_salonu | 4, 20 | Gulyabani (`crypt_ghoul`) x2, İskelet Okçu (`skel_archer`) x2 | **14** |  |
| d1_p05 | kemik_salonu | 10, 19.5 | İskelet Muhafız (`skel_warrior`) x1, İskelet Er (`skel_minion`) x2, Kemik Büyücüsü (`skel_mage`) x1 | **14** |  |
| d1_p06 | kemik_salonu | 7, 22 | Gulyabani (`crypt_ghoul`) x1, İskelet Er (`skel_minion`) x2 | **8** | patrol: (7, 26) ↔ (7, 18.5). Patrol walks N-S through the middle of the hall (12 s per leg) and body-pulls into p03/p05 if you fight next to it. |
| d1_p07 | k_bekci | 6.5, 14.8 | İskelet Muhafız (`skel_warrior`) x1, İskelet Okçu (`skel_archer`) x1 | **9** |  |
| d1_p08 | k_fener | 14, 6.5 | Uçan Kafatası (`bone_skull`) x6 | **6** |  |
| d1_p09 | lahit_galerisi | 19.5, 4.5 | İskelet Er (`skel_minion`) x4, Kemik Büyücüsü (`skel_mage`) x1 | **12** |  |
| d1_p10 | lahit_galerisi | 24.5, 4.5 | Mahzen Hortlağı (`crypt_wraith`) x1, Gulyabani (`crypt_ghoul`) x2 | **13** |  |
| d1_p11 | lahit_galerisi | 21.5, 8 | Mahzen Faresi (`crypt_rat`) x12 | **12** | Bursts out of 3 coffins when any player enters the middle row. |
| d1_p12 | lahit_galerisi | 19.5, 11.5 | Kemik Golemi (`bone_golem`) x1 | **12** |  |
| d1_p13 | lahit_galerisi | 24.5, 11.5 | İskelet Okçu (`skel_archer`) x2, Kemik Büyücüsü (`skel_mage`) x1, İskelet Er (`skel_minion`) x2 | **14** |  |
| d1_p14 | k_mum | 28.5, 6.5 | İskelet Er (`skel_minion`) x2, İskelet Okçu (`skel_archer`) x1 | **7** |  |
| d1_p15 | mum_odasi | 33, 5 | Mahzen Hortlağı (`crypt_wraith`) x2, İskelet Er (`skel_minion`) x2 | **14** |  |
| d1_p16 | mum_odasi | 36, 8.5 | İskelet Muhafız (`skel_warrior`) x1, Kemik Büyücüsü (`skel_mage`) x2 | **14** |  |
| d1_p17 | mum_odasi | 32.5, 8.5 | Takırdayan İskelet (`skel_rattler`) x10 | **10** | Dormant bone piles under the pews. |
| d1_p18 | k_kuyu | 33.5, 13 | Gulyabani (`crypt_ghoul`) x2, Uçan Kafatası (`bone_skull`) x3 | **11** |  |
| d1_p19 | unutulmus_mezarlar | 31.5, 29 | İskelet Er (`skel_minion`) x4, İskelet Okçu (`skel_archer`) x2 | **14** | *optional* |
| d1_p20 | unutulmus_mezarlar | 35.5, 31 | Kemik Golemi (`bone_golem`) x1, Takırdayan İskelet (`skel_rattler`) x6 | **18** | *optional* |
| d1_p21 | unutulmus_mezarlar | 31.5, 32.3 | Mahzen Hortlağı (`crypt_wraith`) x2, Gulyabani (`crypt_ghoul`) x2 | **18** | *optional* |
| d1_p22 | k_cukur | 25.5, 19.5 | İskelet Okçu (`skel_archer`) x2 | **6** |  |
| d1_p23 | ceset_cukuru | 17, 18.5 | Gulyabani (`crypt_ghoul`) x3, Kemik Büyücüsü (`skel_mage`) x1 | **16** |  |
| d1_p24 | ceset_cukuru | 21.5, 22 | Takırdayan İskelet (`skel_rattler`) x8, Kemik Büyücüsü (`skel_mage`) x1 | **12** |  |
| d1_p25 | ceset_cukuru | 16.8, 22.8 | İskelet Muhafız (`skel_warrior`) x1, Mahzen Hortlağı (`crypt_wraith`) x1, İskelet Er (`skel_minion`) x2 | **15** |  |
| d1_p26 | cokuk_tunel | 20.5, 15 | Mahzen Faresi (`crypt_rat`) x6 | **6** | *optional* |
| d1_p27 | k_taht | 18.5, 26.5 | İskelet Muhafız (`skel_warrior`) x2 | **12** |  |

**Total available: 314 = 125.6% of the required 250.**

| route | rooms (trash) visited | packs skipped inside visited rooms | forces if every other pack is killed | % |
|---|---|---|---|---|
| A (standart) | 11 | - | 258 | 103.2% |
| B (Çöken Tünel atlaması) | 10 | - | 258 | 103.2% |

**Route notes:**

* **Route A** clears the chapel (Mum Şapeli), then enters Ruh Kuyusu from the north, then goes west through Ceset Çukuru to the throne.
* **Route B** takes the collapsed tunnel straight from Lahit Galerisi into Ceset Çukuru. That skips the chapel, the candle path and the well descent (56 forces), so it must collect the optional **Unutulmuş Mezarlar** (50) right after Morkan.
  * B needs less walking, but lands two big ghoul-heavy rooms back to back.
  * Both routes give exactly 103%, so a route that also skips the hall patrol `d1_p06` needs a pack from the other route.
* **Big pulls:** in Kemik Salonu, d1_p02 + p04 + the patrol gives 24 mobs. In Lahit Galerisi the rat burst p11 can be pulled with p09.
* **Interrupt checks:** every `skel_mage` (Ölüleri Kaldır revives the bone piles of dead `skel_minion`s, so kill mages first or interrupt), plus the wraith's Korkunç Çığlık.
* **Seasonal rift spots:** see `extras.riftSpots` in the layout JSON.

#### 4.1.5 Bosses

**Boss 1: Bekçi Kaldur, "Mahzen Kapısının Bekçisi"** (`boss_bekci_kaldur`)

| hpMult | dmgMult | speed | arena | enrage | clips |
|---|---|---|---|---|---|
| 60 | 2.5 | 5.0 m/s | Bekçi Odası 40 x 44 m | 180 s | idle `Idle_Combat`; walk `Walking_A`; `1H_Melee_Attack_Slice_Horizontal`; `Block_Attack`; `2H_Melee_Attack_Spinning` (loop); `Blocking`; intro `Taunt`; death `Death_C_Skeletons` |

| Ability (id) | Type | Timing | Shape / telegraph | Damage / effect | Counter |
|---|---|---|---|---|---|
| Kesik (`kaldur_cleave`) | basic | every 2.2 s | cone 100°, 4 m | coef 1.0 | stay out of the front unless you are the tank |
| **Kalkan Yarması** (`kaldur_shield_slam`) | tank buster | first at 6 s, cd 16 s, windup 1.0 s | line 8 m x 3 m toward the target | coef 4.0 + knockback 6 m + sunder (armor -20%, 10 s) | dodge sideways or block (block halves it) |
| **Kemik Kasırgası** (`kaldur_whirl`) | avoidable | first at 15 s, cd 30 s. Telegraph circle r 5 m for 1.5 s, then 4 s spin moving toward a random player at 3.5 m/s, ticking every 0.5 s | circle r 4 m that follows the boss | coef 0.8 per tick | kite away; he is not attacking otherwise |
| **Kalkan Duvarı** (`kaldur_shield_wall`) | positional | first at 25 s, cd 40 s, lasts 4 s (`Blocking`) | frontal 120° | -90% damage taken from the front, +20% from behind | get behind him; ranged players reposition |
| **Mezarlık Çağrısı** (`kaldur_call`) | add wave | at 70% and 35% HP | the 4 corner bone piles | 6 `skel_rattler` (2/2/1/1 per pile). At 35% also 1 `skel_archer`. 0 forces. | AoE the rattlers; kill the archer |

* Yells: pull "Mahzenin kapısını hiçbir canlı geçemez!" · 70% "Kalkın, kardeşlerim!" · death "Nöbetim... sona erdi..."
* Loot `loot_d1_b1`:
  * slot bias: 1H swords, shields, heavy helms and shoulders
  * favoured set: `set_holy_vanguard` *Kutsal Öncü* (helm, shoulders)
  * favoured legendary: `leg_mountain_heart` *Dağın Kalbi*

**Boss 2: Ölüçağıran Morkan, "Ruh Kuyusunun Efendisi"** (`boss_olucagiran_morkan`)

| hpMult | dmgMult | speed | arena | enrage | clips |
|---|---|---|---|---|---|
| 75 | 2.0 | 4.5 m/s | Ruh Kuyusu 40 x 40 m; the well (r 3.5 m) is unwalkable | 210 s | idle `Idle_B`; cast `Spellcast_Shoot`; summon `Spellcast_Summon` at 1.4x; channel `Spellcasting`; blink `Spawn_Air`; death `Death_C_Skeletons` |

Behaviour: a caster that stays 8-12 m from his target and blinks (`Spawn_Air`) to a new spot on the well rim every 12 s.

| Ability (id) | Type | Timing | Shape / telegraph | Damage / effect | Counter |
|---|---|---|---|---|---|
| Gölge Oku (`morkan_bolt`) | basic | every 2.5 s | projectile 16 m/s at the target | coef 1.0 shadow | heal through |
| **Ölüleri Kaldır** (`morkan_raise`) | **interruptible** | first at 10 s, cd 20 s, cast 3.0 s | | success: 4 `skel_minion` (50% HP, 0 forces) rise around the well | **interrupt**: Morkan is stunned for 2 s and takes +25% damage for 5 s ("SERSEMLEDİ!") |
| **Kemik Hapsi** (`morkan_prison`) | debuff + break | first at 14 s, cd 25 s | circle r 1.5 m under a random non-tank (any player when solo), 1.5 s | hit = stunned inside a bone cage (`PROC:bone_cage`, HP 4 x TRASH_HP x partyHp) | allies break the cage. The trapped player's attacks hit it at 50%. Solo: it shatters by itself after 3 s. |
| **Ceset Patlaması** (`morkan_corpse_explosion`) | avoidable | first at 20 s, cd 18 s | every skeleton corpse and bone pile in the arena glows for 3 s | each explodes: circle r 4 m, coef 2.5 | kill adds away from the group; step away from glowing piles |
| **Ruh Fırtınası** (`morkan_soul_storm`) | phase, once at 40% | channel 8 s; he hovers over the well and is immune | 3 `PROC:soul_orb` per player spawn at the arena edge and drift to the well at 4 m/s | each orb that reaches the well heals Morkan 3% | kill the orbs (1 hit each). After the channel, Kemik Hapsi cd → 12 s and Gölge Oku every 1.8 s. |

* Yells: pull "Ruhlarınız kuyuyu besleyecek!" · 40% "Kuyu! Bana güç ver!" · death "Ölüm... beni de... çağırıyor..."
* Loot `loot_d1_b2`:
  * slot bias: staves, tomes, light chests, amulets
  * favoured set: `set_holy_vanguard` (shield)
  * favoured legendary: `leg_ember_staff` *Kül Asası*

**Boss 3 (final): Kemik Lordu Azrakel, "Mahzenin Ölümsüz Hükümdarı"** (`boss_azrakel`)

| hpMult | dmgMult | speed | arena | enrage | clips (`kemik_lordu.glb`) |
|---|---|---|---|---|---|
| 110 | 2.3 | 4.8 m/s | Kemik Taht 52 x 40 m | 300 s | `Idle`, `Walk`, `Run`, `Attack` (swing), `Attack2` (heavy), `Cast`, `Enrage`, `Hit`, `Death` |

Phases:

* **Phase 1 (100 → 60%)**:

| Ability (id) | Type | Timing | Shape | Damage / effect | Counter |
|---|---|---|---|---|---|
| Asa Savuruşu (`azrakel_swing`) | basic | every 2.4 s (`Attack`) | cone 90°, 5 m | coef 1.0 | |
| **Kemik Mızrakları** (`azrakel_spears`) | avoidable | first at 6 s, cd 14 s, telegraph 1.4 s (`Cast`) | 3 lines 24 m x 2.5 m from the boss toward 3 players (random angles for missing players) | coef 3.0 + knock-up 0.8 s | sidestep |
| **Mezar Soğuğu** (`azrakel_grave_chill`) | tank buster | first at 10 s, cd 18 s, windup 1.2 s (`Attack2`) | cone 60°, 7 m | coef 4.5 + chill 3 stacks | dodge or block |
| **Ruh Hasadı** (`azrakel_soul_reap`) | spread | first at 18 s, cd 28 s | marks up to 3 players (all if fewer) for 5 s | expiry: burst r 5 m, coef 2.0 to every player in range, plus a necrotic puddle r 3 m for 10 s (coef 0.5 per 0.5 s) | spread 5 m apart and drop the puddles at the edge |

* **Phase 2, at 60%: Filakter Evresi** (`azrakel_phylactery`)
  * Azrakel flies to his throne, becomes immune and loops `Cast`.
  * 3 phylacteries (`PROC:phylactery`, HP 10 x TRASH_HP x partyHp each) appear at (15.5, 31), (25, 31) and (20, 37). Every 8 s, 4 `skel_rattler` rise from random bone piles.
  * **40 s timer.** Each phylactery still standing at the end heals Azrakel 10% and gives him +10% damage (stacking) for the rest of the fight. The phase ends early when all 3 are destroyed.
  * The torches turn green during this phase.
* **Phase 3 (60 → 0%):** all phase 1 abilities continue, with Kemik Mızrakları cd → 11 s. Two more mechanics:
  * **İç / Dış Ölüm** (`azrakel_death_rings`): cd 22 s, telegraph 2.0 s, coef 3.5. It alternates:
    1. **Ölüm Halkası**: ring with inner r 6 m, outer r 22 m. Hug the boss.
    2. **Ölüm Çemberi**: circle r 6 m. Get out.

    The first cast is always the ring.
  * **Son Nefes** (`azrakel_last_breath`), at 30% (`Enrage` clip): soft enrage, +5% damage every 10 s until death.
* Yells: pull "Diriler... Mahzenime hoş geldiniz. Bir daha asla çıkamayacaksınız!" · 60% "Filakterlerim beni sonsuza dek yaşatacak!" · 30% "Kemiklerinizi tahtıma ekleyeceğim!" · death "İmkânsız... ben... ölümsüzdüm..."
* Loot `loot_d1_b3`:
  * any slot; favoured set: `set_holy_vanguard` (chest)
  * favoured legendaries: `leg_eye_of_ancients` *Kadimlerin Gözü*, `leg_skullsplitter` *Kafatası Yaran*
  * suggested dungeon legendary: *Azrakel'in Filakteri* (amulet; kills have a 10% chance to raise a skeleton ally for 10 s that deals 50% of your damage)

---

### 4.2 Kızıl Dökümhane (`kizil_dokumhane`): fire forge and lava

#### 4.2.1 Identity

| field | value |
|---|---|
| id | `kizil_dokumhane` |
| Normal level range | 18-28 (Normal enemy level = clamp(party avg, 18, 28), per GDD_SYSTEMS §1.10; Kahramanlık 50-60, Mitik 60) |
| M+ timer | 13:30 (810 s) |
| enemy forces for 100% | 270 |
| grid | 40 x 40 tiles (160 x 160 m) |
| fog | 0x2a0e06, near 10 m, far 45 m |
| ambient | 0x803020 x 0.4 |
| hemisphere sky / ground | 0xff7040 / 0x200800 |
| torch colour | 0xff6a20 |
| bloom | 0.9 |
| KayKit texture tint | 0xd8a090 |
| palette | 0x1a0c08, 0x4a2418, 0xff4a10, 0xffb040, 0x3070ff |
| music | `dungeon_fire` (boss fights: `boss`) |

**Lore (TR):**
> Dağın kalbinde, Kuzgunkale'nin ilk silahlarının döküldüğü dökümhane şimdi Mavi Alev Ignaroth'un elinde. Köleleştirilmiş goblinler gece gündüz örslerde çalışırken, Dökümcü Usta Gurz kırbacını şaklatır ve Magma Devi Ateşyürek lav gölünde uyur. Kızıl ateşin altında, mavi bir alev büyüyor.

**Visual direction:**

* Black basalt, rust and orange lava cracks; heavy bloom on the lava.
* Embers (`ambient_embers`) always falling.
* Steam vents; the screen tints warm.
* The final arena flips to blue fire (0x3070ff).
* Music `dungeon_fire`: industrial percussion (anvil hits on the beat), deep brass.

#### 4.2.2 Map

```
    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9
  0                   111111111111111111111111        DDDDDDDDDDDDDDDDDDDD
  1                   111111111111111111111111        DDDDDDDDDDDDDDDDDDDD
  2                   111111111111111111111111        DDDDDDDDDDDDDDDDDDDD
  3                   1111111111111111111111%%%%cccc++++DD..DDDDDDDDDD..DD
  4   CCCCCCCCCCCCCCCC1111111111111111111111%%%%cc..++++DDDDDDDDDDDDDDDDDD
  5   CCCCCCCCCCCCCC%%%%1111111111111111111111        DDDDDDDDDDDDDDDDDDDD
  6   CCCCCCCCCCCCCC%%%%1111111111B11111111111        DDDDDDDDDDDDDDDDDDDD
  7   CCCCCCCCCC..CCCC111111111111111111111111        DDDD..DDDDDDDDDD..DD
  8   CCCCCCCCCCCCCCCC1111111111####1111111111        DDDDDDDD++++DDDDDDDD
  9   CCCCCCCCCCCCCCCC          ####                          ++++
 10   CCCCCCCCCCCC..CC          bbbb                          dddd
 11   CCCC..CCCCCCCCCC          bb..                          dd..
 12   CCCCCCCCCCCCCCSN          bbbb                          dddd
 13                             ++++                          ++++
 14                     BBBBBBBB++++BBBBBBBB        EEEEEEEEEE++++EEEEEEEEEE
 15                     BBBBBBBBBBBBBBBBBBBB        EEEEEEEEEEEEEEEEEEEEEEEE
 16                     BBBBBBBBBBBBBBBBBBBB        EEEE..EEEEEEEEEEEEEE..EE
 17   AAAAAAAAAA        BBBBBB..BBBBBBBB..BB        EEEEEEEEEEEEEEEEEEEEEEEE
 18   AAAAAAKTAA        BBBBBBBBBBBBBBBBBBBB        EEEEEEEEEEEEEEEEEEEEEEEE
 19   AAAAAAAA++++aaaa++++BBBBBBBBBBBBBBBBBB        EEEEEEEEEEEE..EEEEEEEEEE
 20   AAAASTAA++++aa..++++BBBBBBBB..BBBBBBBB        EEEEEEEEEEEEEEEEEEEEEEEE
 21   AAAAAAAAAA        BBBBBBBBBBBBBBBBBBBB        EEEEEEEEEEEEEEEEEEEEEEEE
 22   AAAAAAAAAA        BBBBBBBBBBBBBBBBBBBB        EEEEEE..EEEEEEEEEE..EEEE
 23                     BBBBBB..BBBBBBBB..BB        EEEEEEEEEE++++EEEEEE++++
 24                     BBBBBBBBBBBBBBBBBBBB                  ++++      ++++
 25                     BBBBBBBBBBBBBBBBBBSN                  eeee      ffff
 26                                                           ee..      ffff
 27 3333333333333333                                          ####      ####
 28 3333333333333333  FFFFFFFFFFFFFFFFFFFFFF          22222222####222222####
 29 3333333333333333  FFFFFFFFFFFFFFFFFFFFFF          2222222222222222222222
 30 3333333333333333  FFFFFFFFFFFFFFFF..FFFF          2222222222222222222222
 31 33333333333333####++FFFF..FFFFFFFFFFFFFF          2222222222222222222222
 32 33333333333333####++FFFFFFFFFFFFFFFFFF++++gggggg%%%%22222222222222222222
 33 33333333B3333333  FFFFFFFFFFFFFFFFFFFF++++gg..gg%%%%22222222222222222222
 34 3333333333333333  FFFFFF..FFFFFFFF..FFFF          2222222222B22222222222
 35 3333333333333333  FFFFFFFFFFFFFFFFFFFFFF          2222222222222222222222
 36 3333333333333333  FFFFFFFFFFFFFFFFFFFFFF          2222222222222222222222
 37 33333333EX333333                                  2222222222222222222222
 38 3333333333333333                                  2222222222222222222222
```

Legend: `A` giris, `a` k_giris, `B` cevher_deposu, `b` k_kuzey, `1` ors_salonu, `C` curuf_ocagi, `c` k_dogu1, `D` kalip_atolyesi, `d` k_inis, `E` lav_kanali, `e` k_guney, `f` kopru, `2` magma_kalbi, `g` k_bati, `F` kole_kampi, `h` k_son, `3` mavi_alev_sunagi. `++` open door, `##` boss_lock door, `%%` boss_exit door, `ST` start, `KT` Kehanet Taşı (Font of Power), `B1-B3` boss spawns, `EX` exit portal, `SN` shrine, `..` trash pack centre. Rows with no rooms are omitted.

#### 4.2.3 Rooms, decoration, doors

| id | Ad (TR) | rect x,z,w,h (tiles) | size (m) | floor / wall | forces | notes |
|---|---|---|---|---|---|---|
| `giris` | Kül Kapısı | 1, 17, 5, 6 | 20 x 24 | lava_rock / forge | - |  autoDecor 0.3 |
| `k_giris` | Cüruf Yolu | 6, 19, 4, 2 | 16 x 8 | lava_rock / forge | 6 |  autoDecor 0.5 |
| `cevher_deposu` | Cevher Deposu | 10, 14, 10, 12 | 40 x 48 | lava_rock / forge | 60 |  autoDecor 0.6 |
| `k_kuzey` | Örs Yolu | 14, 9, 2, 5 | 8 x 20 | stone_dark / forge | 7 |  autoDecor 0.4 |
| `ors_salonu` | Örs Salonu | 9, 0, 12, 9 | 48 x 36 | stone_dark / forge | - | **Boss 1 arena** autoDecor 0.2 |
| `curuf_ocagi` | Cüruf Ocağı | 1, 4, 8, 9 | 32 x 36 | lava_rock / cave | 45 | optional autoDecor 0.6 |
| `k_dogu1` | Kızgın Dehliz | 21, 3, 4, 2 | 16 x 8 | lava_rock / forge | 6 |  autoDecor 0.4 |
| `kalip_atolyesi` | Kalıp Atölyesi | 25, 0, 10, 9 | 40 x 36 | stone_dark / forge | 53 |  autoDecor 0.6 |
| `k_inis` | Kızgın Merdivenler | 29, 9, 2, 5 | 8 x 20 | stone_dark / forge | 9 |  autoDecor 0.3 |
| `lav_kanali` | Lav Kanalı | 24, 14, 12, 10 | 48 x 40 | lava_rock / cave | 64 |  autoDecor 0.4 |
| `k_guney` | Zincir Geçidi | 29, 24, 2, 4 | 8 x 16 | stone_dark / forge | 10 |  autoDecor 0.3 |
| `kopru` | Lav Köprüsü | 34, 24, 2, 4 | 8 x 16 | wood / cave | - | skip route autoDecor 0.1 |
| `magma_kalbi` | Magma Kalbi | 25, 28, 11, 11 | 44 x 44 | lava_rock / cave | - | **Boss 2 arena** autoDecor 0.1 |
| `k_bati` | Köle Yolu | 20, 32, 5, 2 | 20 x 8 | dirt / cave | 6 |  autoDecor 0.4 |
| `kole_kampi` | Köle Kampı | 9, 28, 11, 9 | 44 x 36 | dirt / cave | 58 |  autoDecor 0.7 |
| `k_son` | Mavi Alev Kapısı | 8, 31, 1, 2 | 4 x 8 | temple / forge | 7 |  autoDecor 0 |
| `mavi_alev_sunagi` | Mavi Alev Sunağı | 0, 27, 8, 12 | 32 x 48 | temple / forge | - | **Boss 3 arena** autoDecor 0.1 |

**Decoration and props per room** (model names are files under `/assets/models/dungeon/` unless a pack prefix is given; `halloween/`, `furniture/`, `town/`, `gen/`, `kenney/...` are folders under `/assets/models/`):

- `giris`: Kehanet Taşı at (4, 18). Big iron double door look: `wall_gated` (closed) on the west wall. `kenney/survival-kit/workbench-anvil` x2 (scale 3), `barrel_large` x3, `torch_mounted` x4 (0xff6a20).
- `k_giris`: `kenney/survival-kit/resource-stone` heaps, minecart rails (thin dark boxes), `crates_stacked`.
- `cevher_deposu`: Ore store: `town/decoration/props/resource_stone` and `crate_A_big` stacks, `gen/props/crystal_purple` ore veins x3 in the corners, minecarts (`kenney/fantasy-town-kit/cart` scale 4) x2, glowing lava cracks in the floor (emissive decals, no damage). Shrine **Kudret Sunağı** at (19, 25).
- `k_kuzey`: Weapon racks (`town/decoration/props/weaponrack` scale 6) and `sword_shield` on both walls.
- `ors_salonu`: Arena 48 x 36 m. Giant anvil at the centre (15, 3.5): `kenney/survival-kit/workbench-anvil` scale 9, collides. 2 lava channels, 1 tile wide, along the north wall z=0 (x 9..20) and the south wall z=8 (x 9..13 and 16..20). Players take coef 1.5 per 0.5 s inside them. 3 crucibles hang from the ceiling at x = 11, 15, 19 for Erimiş Döküm. Bellows (`kenney/survival-kit/structure-canvas` scale 3) on the west wall. 6 `torch_mounted`, a 0xff5020 point light over the anvil.
- `curuf_ocagi`: Optional slag furnace (dead end). Lava pool (unwalkable, emissive) at (2..3, 5..6), `rubble_large` slag heaps, `barrel_large_decorated`. Treasure `chest_gold` at (1.5, 11.5). Shrine **Koruma Sunağı** at (7.5, 12).
- `k_dogu1`: Steam vents (VFX `ambient_embers`) and `keg` stacks.
- `kalip_atolyesi`: Casting workshop: `table_long` and `table_medium_broken` x6 as mould benches, `kenney/survival-kit/workbench` x3, `workbench-grind` x2, ingot stacks (`coin_stack_large` tinted 0xff8040), conveyor strips (dark boxes with scrolling texture), 8 `torch_mounted`.
- `k_inis`: `stairs_wall_left` / `stairs_wall_right` look, lava light coming from below (0xff4a10 point light at the bottom).
- `lav_kanali`: A lava river 2 tiles wide runs W-E through z = 18..19 (unwalkable, emissive 0xff4a10, coef 2.0 per 0.5 s if knocked in). 2 bridges cross it, `floor_wood_large_dark` 2 tiles wide at x = 26..27 and x = 32..33. Hanging chains, `ambient_embers` everywhere.
- `k_guney`: Hanging chains and cages (`kenney/graveyard-kit/iron-fence` scale 3 as cage bars).
- `kopru`: Narrow wooden bridge over lava, no packs. Hazard **Lav Fışkırması**: every 4 s a random 1x1 tile flashes for 1.2 s, then erupts for coef 2.0 (Volcanic VFX `volcanic_plume`).
- `magma_kalbi`: Arena: a round basalt platform of radius 16 m centred on (30, 33). Tiles outside that circle are lava (unwalkable, visual). 4 cooling vents (**Soğutma Menfezi**: `floor_tile_big_grate` with steam VFX) at (27, 30) (33, 30) (27, 36) (33, 36). The lava lake glows (0xff4a10, intensity 1.5).
- `k_bati`: Broken chains, `kenney/survival-kit/bedroll` x3.
- `kole_kampi`: Slave camp: `kenney/survival-kit/tent` x4, `campfire-pit` x2 (light 0xff7a2a), `bedroll` x6, `town/decoration/props/wheelbarrow`, `sack`, iron cages with goblin prisoners (non-hostile `ow_goblin` in `Idle`, rescued for 25 gold each).
- `k_son`: Blue-fire braziers (`kenney/graveyard-kit/fire-basket` scale 3 with light 0x3070ff) on both sides.
- `mavi_alev_sunagi`: Final arena 32 x 48 m. Demonic altar `halloween/shrine` tinted 0x203060 at (3.5, 37.5). 6 floor vents in a 2x3 grid at x = 2, 5 and z = 29.5, 32.5, 35.5 (used in phase 2). Blue braziers x6 (0x3070ff), lava cracks. Arena lights shift from orange to blue at 65%.

| a | b | tile (in a) | side | width | gate |
|---|---|---|---|---|---|
| giris | k_giris | 5, 19 | e | 2 | none |
| k_giris | cevher_deposu | 9, 19 | e | 2 | none |
| cevher_deposu | k_kuzey | 14, 14 | n | 2 | none |
| k_kuzey | ors_salonu | 14, 9 | n | 2 | boss_lock |
| ors_salonu | curuf_ocagi | 9, 5 | w | 2 | boss_exit |
| ors_salonu | k_dogu1 | 20, 3 | e | 2 | boss_exit |
| k_dogu1 | kalip_atolyesi | 24, 3 | e | 2 | none |
| kalip_atolyesi | k_inis | 29, 8 | s | 2 | none |
| k_inis | lav_kanali | 29, 13 | s | 2 | none |
| lav_kanali | k_guney | 29, 23 | s | 2 | none |
| lav_kanali | kopru | 34, 23 | s | 2 | none |
| k_guney | magma_kalbi | 29, 27 | s | 2 | boss_lock |
| kopru | magma_kalbi | 34, 27 | s | 2 | boss_lock |
| magma_kalbi | k_bati | 25, 32 | w | 2 | boss_exit |
| k_bati | kole_kampi | 20, 32 | w | 2 | none |
| kole_kampi | k_son | 9, 31 | w | 2 | none |
| k_son | mavi_alev_sunagi | 8, 31 | w | 2 | boss_lock |

#### 4.2.4 Trash packs, forces, routes

| pack | room | centre (tiles) | members | forces | notes |
|---|---|---|---|---|---|
| d2_p01 | k_giris | 8, 19.5 | Dökümhane Goblini (`forge_goblin`) x6 | **6** |  |
| d2_p02 | cevher_deposu | 12.5, 17 | Dökümhane Goblini (`forge_goblin`) x8, Ork Köle Başı (`forge_orc`) x1 | **15** |  |
| d2_p03 | cevher_deposu | 17.5, 17 | Lav Balçığı (`lava_slime`) x3, Ateş İblisçiği (`forge_imp`) x2 | **10** |  |
| d2_p04 | cevher_deposu | 12.5, 22.5 | Kor İblisi (`forge_demon`) x1, Ateş Rahibi (`fire_priest`) x1, Dökümhane Goblini (`forge_goblin`) x4 | **15** |  |
| d2_p05 | cevher_deposu | 17.5, 22.5 | Magma Golemi (`magma_golem`) x1 | **10** |  |
| d2_p06 | cevher_deposu | 15, 20 | Ork Köle Başı (`forge_orc`) x1, Dökümhane Goblini (`forge_goblin`) x3 | **10** | patrol: (11.5, 20) ↔ (18, 20). Patrol runs W-E between the four packs and links whatever it touches. |
| d2_p07 | k_kuzey | 14.5, 11 | Alevli Kafatası (`flame_skull`) x5, Ateş İblisçiği (`forge_imp`) x1 | **7** |  |
| d2_p08 | curuf_ocagi | 5.5, 6.5 | Lav Balçığı (`lava_slime`) x4, Ateş Rahibi (`fire_priest`) x1 | **13** | *optional* |
| d2_p09 | curuf_ocagi | 6.5, 10 | Magma Golemi (`magma_golem`) x1, Dökümhane Goblini (`forge_goblin`) x6 | **16** | *optional* |
| d2_p10 | curuf_ocagi | 2.5, 10.5 | Kor İblisi (`forge_demon`) x2, Ateş İblisçiği (`forge_imp`) x2 | **16** | *optional* |
| d2_p11 | k_dogu1 | 22.5, 3.5 | Ateş İblisçiği (`forge_imp`) x3 | **6** |  |
| d2_p12 | kalip_atolyesi | 27, 2.5 | Dökümhane Goblini (`forge_goblin`) x6, Ork Köle Başı (`forge_orc`) x1 | **13** |  |
| d2_p13 | kalip_atolyesi | 32.5, 2.5 | Ateş Rahibi (`fire_priest`) x1, Kor İblisi (`forge_demon`) x1, Alevli Kafatası (`flame_skull`) x4 | **15** |  |
| d2_p14 | kalip_atolyesi | 27, 6.5 | Lav Balçığı (`lava_slime`) x4, Ateş İblisçiği (`forge_imp`) x1 | **10** |  |
| d2_p15 | kalip_atolyesi | 32.5, 6.5 | Magma Golemi (`magma_golem`) x1, Ateş Rahibi (`fire_priest`) x1 | **15** |  |
| d2_p16 | k_inis | 29.5, 11 | Kor İblisi (`forge_demon`) x1, Dökümhane Goblini (`forge_goblin`) x3 | **9** |  |
| d2_p17 | lav_kanali | 26, 15.8 | Ork Köle Başı (`forge_orc`) x1, Dökümhane Goblini (`forge_goblin`) x6 | **13** |  |
| d2_p18 | lav_kanali | 30, 18.5 | Ateş İblisçiği (`forge_imp`) x4 | **8** | Imps hover above the lava river and pelt both bridges; pull them with ranged attacks or wait for them to chase. |
| d2_p19 | lav_kanali | 33.5, 15.8 | Magma Golemi (`magma_golem`) x1, Lav Balçığı (`lava_slime`) x2 | **14** |  |
| d2_p20 | lav_kanali | 26.5, 21.5 | Ateş Rahibi (`fire_priest`) x2, Kor İblisi (`forge_demon`) x1 | **16** |  |
| d2_p21 | lav_kanali | 33, 21.5 | Alevli Kafatası (`flame_skull`) x6, Ork Köle Başı (`forge_orc`) x1 | **13** |  |
| d2_p22 | k_guney | 29.5, 25.5 | Kor İblisi (`forge_demon`) x1, Ateş İblisçiği (`forge_imp`) x2 | **10** |  |
| d2_p23 | k_bati | 22, 32.5 | Lav Balçığı (`lava_slime`) x3 | **6** |  |
| d2_p24 | kole_kampi | 17, 30 | Dökümhane Goblini (`forge_goblin`) x10 | **10** |  |
| d2_p25 | kole_kampi | 12, 30.5 | Ork Köle Başı (`forge_orc`) x2, Ateş Rahibi (`fire_priest`) x1 | **19** |  |
| d2_p26 | kole_kampi | 17, 34 | Kor İblisi (`forge_demon`) x2, Alevli Kafatası (`flame_skull`) x3 | **15** |  |
| d2_p27 | kole_kampi | 11.5, 34 | Magma Golemi (`magma_golem`) x1, Dökümhane Goblini (`forge_goblin`) x4 | **14** |  |
| d2_p28 | k_son | 8, 31.5 | Ork Köle Başı (`forge_orc`) x1 | **7** |  |

**Total available: 331 = 122.6% of the required 270.**

| route | rooms (trash) visited | packs skipped inside visited rooms | forces if every other pack is killed | % |
|---|---|---|---|---|
| A (standart, Zincir Geçidi) | 11 | - | 286 | 105.9% |
| B (Lav Köprüsü + Cüruf Ocağı) | 12 | d2_p18, d2_p21, d2_p06 | 290 | 107.4% |

**Route notes:**

* **Route A** fully clears Cevher Deposu, Kalıp Atölyesi and Lav Kanalı and takes the chain corridor (`k_guney`) to the boss.
* **Route B** goes into the optional **Cüruf Ocağı** after Gurz (+45). That lets it skip the imps over the lava (`d2_p18`), the skull pack `d2_p21` and the depot patrol, and then use the hazardous **Lav Köprüsü** (no packs, eruption hazard) instead of `k_guney`.
* **Big pulls:**
  * Cevher Deposu, all four corners plus the patrol: about 30 goblins and elites, if you dare.
  * Kole Kampı: p24 (10 goblins) + p26 (demons and skulls).
* **Interrupt checks:**
  * `fire_priest` heals and shields (**HIGH**)
  * `forge_orc` Çalışın! (+30% speed on a goblin horde is deadly at high keys)
  * imp Ateş Yağmuru
* **Danger:** `magma_golem` death explosions next to sanguine pools or bolstered packs. Kill golems apart from the pack.

#### 4.2.5 Bosses

**Boss 1: Dökümcü Usta Gurz, "Kızıl Örsün Ustası"** (`boss_dokumcu_gurz`)

| hpMult | dmgMult | speed | arena | enrage | clips |
|---|---|---|---|---|---|
| 60 | 2.5 | 5.3 m/s | Örs Salonu 48 x 36 m, anvil at the centre (collides), lava channels on the north and south edges | 180 s | `Idle`, `Walk`, `Run`, `Weapon` (≈0.45 impact), `Punch`, `Jump`/`Jump_Idle`/`Jump_Land`, `Wave` (call), `Death` |

| Ability (id) | Type | Timing | Shape | Damage / effect | Counter |
|---|---|---|---|---|---|
| Çekiç Savuruşu (`gurz_swing`) | basic | every 2.2 s | cone 110°, 4.5 m | coef 1.0 | |
| **Örs Darbesi** (`gurz_anvil_slam`) | tank buster + ring | first at 7 s, cd 15 s. Leaps onto the target's position, telegraph 1.2 s | circle r 4 m, then a ring 4-10 m | inner coef 4.0 + knockdown 1 s; ring coef 1.0 | the target dodges out; everyone else stays > 10 m or rolls through the ring |
| **Erimiş Döküm** (`gurz_molten_pour`) | avoidable, zone denial | first at 12 s, cd 24 s, telegraph 2.0 s | 2 of the 3 crucibles (seeded) pour N-S lava lines 36 m x 3 m at tile x = 11, 15, 19 | impact coef 2.5; burning strip for 12 s (coef 0.5 per 0.5 s) | stand between the lines; the arena gets smaller for 12 s |
| **Körük Esintisi** (`gurz_bellows`) | displacement | first at 20 s, cd 35 s, yell + 1.0 s windup | whole arena | 3 s gust pushing every player **south** at 6 m/s, toward the south lava channel (coef 1.5 per 0.5 s inside) | walk north (net +1 m/s); dodge-roll i-frames ignore the push |
| **Çalışın Köleler!** (`gurz_call_slaves`) | add wave | at 66% and 33% | from the west door | 6 `forge_goblin`; at 33% also 1 `forge_orc` (interrupt its Çalışın!). 0 forces. | AoE; keep the orc's cast interrupted |

* Yells: pull "Örsüm aç! Kemiklerinizi döveceğim!" · 66% "Köleler! İşbaşına!" · death "Ateş... sönüyor..."
* Loot `loot_d2_b1`:
  * slot bias: 2H axes, heavy gloves and belts
  * favoured set: `set_wolfblood` *Kurt Kanı* (helm, legs)
  * favoured legendary: `leg_titan_grip` *Titan Kavrayışı*

**Boss 2: Magma Devi Ateşyürek, "Dökümhanenin Kalbi"** (`boss_atesyurek`)

| hpMult | dmgMult | speed | arena | enrage | clips |
|---|---|---|---|---|---|
| 75 | 2.7 | 3.4 m/s (`Walk` 2.0 s clip, lumbering) | Magma Kalbi: basalt platform r 16 m, lava outside; 4 cooling vents | 210 s | `Idle`, `Walk`, `Attack` (0.47), `Jump`, `HitRecieve`, `Death` |

| Ability (id) | Type | Timing | Shape | Damage / effect | Counter |
|---|---|---|---|---|---|
| Ezici Yumruk (`atesyurek_punch`) | basic | every 2.8 s | cone 120°, 5 m | coef 1.0, big shake | |
| **Volkanik Patlama** (`atesyurek_eruption`) | avoidable | first at 8 s, cd 20 s, telegraph 1.8 s | 6 random circles r 3 m + 1 under each player | coef 2.5; each leaves a lava pool for 10 s (coef 0.6 per 0.5 s) | move; drop pools at the edge |
| **Magma Dalgası** (`atesyurek_magma_wave`) | avoidable | first at 18 s, cd 30 s, windup 2.0 s (arms raised) | ring 2 m thick expanding 0 → 20 m at 6 m/s | coef 3.0 + knockback | **dodge-roll through it** (it covers the whole platform) |
| **Kızgın Kalp** (`atesyurek_heat`) | stacking DoT | passive: every 5 s every player gains 1 *Sıcaklık* stack (1% max HP per second per stack, no cap) | | | stand 1.0 s on a **Soğutma Menfezi** to clear all stacks. That vent closes for 20 s (the steam stops). 4 vents shared by the party. |
| **Lav Dökümü** (`atesyurek_spawn_slimes`) | adds | once at 50% | from the lava edge | 4 `lava_slime` (0 forces; they split and leave puddles) | AoE them away from the vents |
| Erimiş Öfke | phase | at 25% | | Volkanik Patlama cd → 12 s | |

* Hard enrage: Volkanik Patlama every 4 s, on top of the standard enrage.
* Yells (emote text, he roars): pull "*Ateşyürek lav gölünden yükseliyor!*" · 50% "*Lav kaynıyor!*" · death "*Ateşyürek soğuyarak taşa dönüşüyor...*"
* Loot `loot_d2_b2`:
  * slot bias: rings, amulets, belts (fire resistance lines weighted x2)
  * favoured set: `set_wolfblood` (chest)
  * favoured legendaries: `leg_madmans_belt` *Çılgının Kemeri*, `leg_blood_ring` *Kan Yüzüğü*

**Boss 3 (final): Mavi Alev Ignaroth, "Dökümhanenin İblis Efendisi"** (`boss_ignaroth`)

| hpMult | dmgMult | speed | arena | enrage | clips |
|---|---|---|---|---|---|
| 110 | 2.3 | 5.9 m/s | Mavi Alev Sunağı 32 x 48 m, 6 floor vents in a 2 x 3 grid | 300 s | `Idle`, `Walk`, `Run2` (charge), `Weapon`, `Punch`, `Jump*`, `No`/`Yes` at 0.7x (roars), `Death` |

Phases:

* **Phase 1 (100 → 65%)**:

| Ability (id) | Type | Timing | Shape | Damage / effect | Counter |
|---|---|---|---|---|---|
| Pençe Kombosu (`ignaroth_combo`) | basic | every 2.3 s, alternating `Weapon` / `Punch` | cone 120°, 5 m | coef 1.0 | |
| **Mavi Alev Hücumu** (`ignaroth_charge`) | avoidable | first at 10 s, cd 18 s, windup 1.0 s; targets the **farthest** player | line 30 m x 4 m | coef 3.5 + knockback 5 m; blue fire trail for 8 s (coef 0.6 per 0.5 s) | sidestep; do not drag the trail through the group |
| **Göktaşı** (`ignaroth_meteor`) | **soak** | first at 20 s, cd 30 s, telegraph 5.0 s (yellow) | circle r 5 m at a random spot ≥ 8 m from the boss | each soaker takes coef 3 x partySize / soakers. **Nobody inside:** every player takes coef 4 and Ignaroth gains +20% damage for 15 s | 2+ players stack in it; solo you soak alone (coef 3) |
| **Alev Duvarları** (`ignaroth_flame_walls`) | avoidable | first at 14 s, cd 26 s | 2 lines 32 m x 2 m crossing at the boss, rotating 25°/s for 8 s | coef 1.5 per 0.5 s on contact | move with the rotation or roll through |

* **Phase 2, at 65%: Dökümhane Kapıları** (`ignaroth_gates`)
  * Ignaroth leaps onto the altar and is immune.
  * Add waves: t = 0 s, 4 `forge_imp`; t = 10 s, 1 `forge_demon` + 2 `forge_imp`; t = 18 s, 4 `flame_skull`. All 0 forces.
  * Meanwhile the floor vents erupt in rows: every 3 s one row of the 2 x 3 grid (circles r 3 m, telegraph 1.5 s, coef 2.0).
  * The phase ends when all adds are dead or 30 s have passed; surviving adds stay. The arena lights shift to blue.
* **Phase 3, at 30%: Mavi Öfke** (`ignaroth_fury`):
  * +20% attack speed
  * Göktaşı cd → 20 s, Mavi Alev Hücumu cd → 12 s
  * Alev Duvarları rotate at 35°/s
* Yells: pull "Mavi alev, kızıl alevi yutar. Siz de yanacaksınız!" · 65% "Dökümhane, efendine hizmet et!" · 30% "YETER! Hepiniz kül olacaksınız!" · death "Bu alev... sönmez... bir gün... dönerim..."
* Loot `loot_d2_b3`:
  * weapons and any slot; favoured set: `set_wolfblood` (2H axe)
  * favoured legendaries: `leg_phoenix_mantle` *Anka Omuzluğu*, `leg_heart_of_storm` *Kasırganın Yüreği*
  * suggested dungeon legendary: *Ignaroth'un Mavi Közü* (ring; fire hits apply Blue Burn for 4 s, +15% fire damage)

---

### 4.3 Buzul Tahtı (`buzul_tahti`): frost throne

#### 4.3.1 Identity

| field | value |
|---|---|
| id | `buzul_tahti` |
| Normal level range | 30-40 (Normal enemy level = clamp(party avg, 30, 40), per GDD_SYSTEMS §1.10; Kahramanlık 50-60, Mitik 60) |
| M+ timer | 14:00 (840 s) |
| enemy forces for 100% | 250 |
| grid | 40 x 40 tiles (160 x 160 m) |
| fog | 0xa8c8e0, near 12 m, far 55 m |
| ambient | 0x9ab8d8 x 0.6 |
| hemisphere sky / ground | 0xdff0ff / 0x405060 |
| torch colour | 0x80c8ff |
| bloom | 0.7 |
| KayKit texture tint | 0xc8e0ff |
| palette | 0xeaf6ff, 0x9fd8ff, 0x4a7aa0, 0x203a5a, 0xffd8a0 |
| music | `dungeon_frost` (boss fights: `boss`) |

**Lore (TR):**
> Kuzeyin ötesinde, bir zamanlar adil bir kral olan Tuğrul, ölümsüzlük uğruna kalbini buza sattı. Sarayı donmuş bir mezara, şövalyeleri buz heykellere döndü. Buz Cadısı Ayaz Ana kulesinden fırtınaları yönetirken, Kırağı adlı ejder tahtın üzerinde süzülür. Ak Pençe ise mağarasında yeni kemikler bekler.

**Visual direction:**

* The brightest dungeon: white-blue, high-key fog (0xa8c8e0).
* Glittering crystals, constant snowfall (`ambient_snow`), blue braziers, one warm amber accent (the throne's gold, palette 0xffd8a0).
* PSX: dither the fog gradient; ice uses an env-tinted specular fake.
* Music `dungeon_frost`: glassy bells, wind, slow female choir.

#### 4.3.2 Map

```
    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9
  0 CCCCCCCCCCCCCCCCCCCC          22222222222222222222        DDDDDDDDDDDDDDDDDDDD
  1 CCCCCCCCCCCCCCCCCCCC          22222222222222222222        DDDDDDDDDDDDDDDDDDDD
  2 CCCCCCCCCCCCCCCCCCCC          22222222222222222222        DDDDDDDDDDDDDDDDDDDD
  3 CCCCCC..CCCCCC..CCCC          22222222222222222222        DDDDDD..DDDDDDDD..DD
  4 CCCCCCCCCCCCCCCCCC++++dddddd####2222222222222222%%%%ffff++++DDDDDDDDDDDDDDDDDD
  5 CCCCCCCCCCCCCCCCCC++++dd..dd####22222222B2222222%%%%ff..++++DDDDDDDDDDDDDDDDDD
  6 CCCCCCCCCCCCCCCCCCCC          22222222222222222222        DDDDDDDDDDDDDDDDDDDD
  7 CCCCCCCCCC..CCCCCCCC          22222222222222222222        DDDDDDDDDDDDDDDDDDDD
  8 CCCCCCCCCCCCCCCCCCCC          22222222222222222222        DDDDDD..DDDDDDDD..DD
  9 CCCCCC++++CCCCCCCCCC          22222222####22222222        DDDDDDDDDDDDDDDDDDDD
 10       ++++                            ####                DDDDDDDD++++DDDDDDDD
 11       cccc                            eeee                        ++++
 12       cccc                            eeee                        gggg
 13       cc..                            eeee                        gg..
 14       %%%%                            ee..                        ++++
 15 111111%%%%111111                      eeee                EEEEEEEE++++EEEEEEEEEE
 16 1111111111111111                      ++++                EEEEEEEEEEEEEEEEEEEEEE
 17 1111111111111111        BBBBBBBBBBBBBB++++BBBBBBBBBBBBBB  EEEEEE..EEEEEEEE..EEEE
 18 1111111111111111        BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB  EEEEEEEEEEEEEEEEEEEEEE
 19 1111111111111111        BBBBBBBBBBBBBBBB..BBBBBBBBBBBBBB  EEEEEEEEEEEEEEEEEEEEEE
 20 1111111111111111        BBBBBB..BBBBBBBBBBBBBBBBBB..BBBB  EEEEEEEEEEEEEEEEEEEEEE
 21 11111111B11111####bbbb++++BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB  EEEEEEEEEE..EEEEEEEEEE
 22 11111111111111####bb..++++BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB  EEEEEEEEEEEEEEEEEEEESN
 23 1111111111111111        BBBBBBBB..BBBBBBBBBBBBBB..BBBBBB  EEEEEEEE++++EEEEEEEEEE
 24 1111111111111111        BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB          ++++
 25 1111111111111111        BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB          hh..
 26                         BBBBBB..BBBBBBBBBBBBBBBBBB..BBBB          ####
 27                         BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB3333333333####3333333333
 28                         BBBBBBBBBBBBBB++++BBBBBBBBBBBBSN333333333333333333333333
 29                                       ++++              333333333333EX3333333333
 30                                       aaaa              333333333333333333333333
 31                                       aa..              333333333333333333333333
 32                                       aaaa              333333333333333333333333
 33                                       ++++              333333333333333333333333
 34                                   AAAA++++AAAA          333333333333B33333333333
 35                                   AAAAAAKTAAAA          333333333333333333333333
 36                                   AAAAAAAAAAAA          333333333333333333333333
 37                                   AAAAAASTAAAA          333333333333333333333333
 38                                   AAAAAAAAAAAA          333333333333333333333333
```

Legend: `A` giris, `a` k_giris, `B` buz_avlusu, `b` k_bati, `1` yeti_magarasi, `c` k_kuzeybati, `C` buz_kutuphane, `d` k_kuzey, `e` merdiven, `2` cadi_kulesi, `f` k_dogu, `D` kristal_galeri, `g` k_guneydogu, `E` sovalye_salonu, `h` k_taht, `3` buzul_tahti. `++` open door, `##` boss_lock door, `%%` boss_exit door, `ST` start, `KT` Kehanet Taşı (Font of Power), `B1-B3` boss spawns, `EX` exit portal, `SN` shrine, `..` trash pack centre. Rows with no rooms are omitted.

#### 4.3.3 Rooms, decoration, doors

| id | Ad (TR) | rect x,z,w,h (tiles) | size (m) | floor / wall | forces | notes |
|---|---|---|---|---|---|---|
| `giris` | Donmuş Kapı | 17, 34, 6, 5 | 24 x 20 | ice / ice | - |  autoDecor 0.3 |
| `k_giris` | Kar Geçidi | 19, 29, 2, 5 | 8 x 20 | ice / ice | 10 |  autoDecor 0.4 |
| `buz_avlusu` | Donmuş Avlu | 12, 17, 16, 12 | 64 x 48 | ice / ice | 86 |  autoDecor 0.5 |
| `k_bati` | Yeti Patikası | 8, 21, 4, 2 | 16 x 8 | dirt / cave | 9 |  autoDecor 0.5 |
| `yeti_magarasi` | Yeti İni | 0, 15, 8, 11 | 32 x 44 | dirt / cave | - | **Boss 1 arena** autoDecor 0.3 |
| `k_kuzeybati` | Buzlu Merdiven | 3, 10, 2, 5 | 8 x 20 | ice / ice | 6 |  autoDecor 0.3 |
| `buz_kutuphane` | Buz Kütüphanesi | 0, 0, 10, 10 | 40 x 40 | wood / ice | 42 |  autoDecor 0.6 |
| `k_kuzey` | Kristal Koridor | 10, 4, 5, 2 | 20 x 8 | ice / ice | 8 |  autoDecor 0.4 |
| `merdiven` | Donmuş Şelale Yolu | 19, 10, 2, 7 | 8 x 28 | ice / ice | 6 | skip route autoDecor 0.3 |
| `cadi_kulesi` | Cadı Kulesi | 15, 0, 10, 10 | 40 x 40 | tiles / ice | - | **Boss 2 arena** autoDecor 0.2 |
| `k_dogu` | Ayaz Köprüsü | 25, 4, 4, 2 | 16 x 8 | ice / ice | 9 |  autoDecor 0.3 |
| `kristal_galeri` | Kristal Galeri | 29, 0, 10, 11 | 40 x 44 | ice / ice | 63 |  autoDecor 0.6 |
| `k_guneydogu` | Şövalye Yolu | 33, 11, 2, 4 | 8 x 16 | tiles / ice | 8 |  autoDecor 0.3 |
| `sovalye_salonu` | Ayaz Şövalyeleri Salonu | 29, 15, 11, 9 | 44 x 36 | tiles / ice | 50 |  autoDecor 0.4 |
| `k_taht` | Taht Kapısı | 33, 24, 2, 3 | 8 x 12 | tiles / ice | 12 |  autoDecor 0.2 |
| `buzul_tahti` | Buzul Tahtı | 28, 27, 12, 12 | 48 x 48 | ice / ice | - | **Boss 3 arena** autoDecor 0.1 |

**Decoration and props per room** (model names are files under `/assets/models/dungeon/` unless a pack prefix is given; `halloween/`, `furniture/`, `town/`, `gen/`, `kenney/...` are folders under `/assets/models/`):

- `giris`: Kehanet Taşı at (19.5, 35). Snowdrift heaps (white low-poly mounds), `gen/props/crystal_blue` x2 in the corners (light 0x80c8ff), frozen `banner_patternB_blue` x2, VFX `ambient_snow`.
- `k_giris`: Icicles on the ceiling (cone meshes), frozen corpses (`Skeleton_Minion` in `Skeletons_Inactive_Floor_Pose` tinted 0xbfe8ff, decor only).
- `buz_avlusu`: Huge courtyard, 64 x 48 m and open-sky feel (brighter, `ambient_snow`). Frozen fountain (`kenney/fantasy-town-kit/fountain-round` scale 4, tint 0xbfe8ff) at (19.5, 22.5) that collides. Statues: `kenney/graveyard-kit/pillar-obelisk` x4. `town/decoration/nature/rock_single_A..E` with snow tint. Dead pines `halloween/tree_pine_yellow_large` tinted 0xdfefff x6 along the walls. Blue braziers x6 (0x80c8ff). Shrine **Kudret Sunağı** at (27, 28).
- `k_bati`: Claw marks, gnawed bones `halloween/bone_A/B/C`, snow.
- `yeti_magarasi`: Ice cave 32 x 44 m. Bone heaps, a frozen waterfall on the west wall (emissive 0x9fd8ff). Icicles on the ceiling are spawn points for Kar Çığı. No pillars, so the charge lanes stay open.
- `k_kuzeybati`: `stairs_walled` look, frozen torches `torch` with blue flame (light 0x80c8ff).
- `buz_kutuphane`: Frozen library: `furniture/shelf_B_large_decorated` and `shelf_A_big` along the walls (10), `book_set`, `table_medium_long` with `candle` (frozen, unlit), `rug_rectangle_stripes_A` frosted, `gen/props/crystal_blue` growing through the floor x3.
- `k_kuzey`: Crystal clusters (`crystal_blue` scale 0.5) on both walls (light 0x80c8ff, distance 6).
- `merdiven`: Skip: a narrow climb next to a frozen waterfall. Hazard **Buz Sarkıtları**: every 3 s an icicle drops on a random tile (circle r 1.5 m, 1.0 s warning, coef 1.5 + stun 0.5 s).
- `cadi_kulesi`: Round-feeling arena 40 x 40 m. Ice rune circle on the floor (emissive 0x80c8ff, r 14 m). A cauldron (`kenney/survival-kit/campfire-stand` + `bucket` scale 3, blue fire) at the centre does not collide. 4 `crystal_blue` pylons at (17,2) (23,2) (17,8) (23,8) (mirror image spawn points).
- `k_dogu`: Ice bridge look: `barrier` rails both sides, wind VFX.
- `kristal_galeri`: Gallery of giant crystals: `crystal_blue` scale 2.0 x5 and `crystal_purple` scale 1.5 x2 (collide), reflective floor (env tint), 8 blue lights. Treasure `chest_gold` at (38, 10).
- `k_guneydogu`: Frozen knight statues: `Knight.glb` in `Blocking` pose tinted 0xcfe8ff, static, 2 of them.
- `sovalye_salonu`: Hall of the frozen guard: `table_long_tablecloth_decorated_A` banquet tables x2 (frozen food), `banner_triple_blue` x4, `sword_shield_gold` trophies, `chair` rows. Shrine **Koruma Sunağı** at (39, 22).
- `k_taht`: Huge frozen gate (`wall_gated` tinted 0xbfe8ff, opens upward when the run reaches this door).
- `buzul_tahti`: Final arena 48 x 48 m. Throne: `chair` scale 2.5 tinted 0x9fd8ff on a `floor_foundation_front` dais at (33.5, 37.5). 4 ice pillars (`pillar` tinted 0xbfe8ff + `crystal_blue` cap) at (30.5, 30.5) (36.5, 30.5) (30.5, 35) (36.5, 35). They block line of sight for Buz Nefesi and shatter in phase 3. Snow storm VFX, 0x9fd8ff key light.

| a | b | tile (in a) | side | width | gate |
|---|---|---|---|---|---|
| giris | k_giris | 19, 34 | n | 2 | none |
| k_giris | buz_avlusu | 19, 29 | n | 2 | none |
| buz_avlusu | k_bati | 12, 21 | w | 2 | none |
| k_bati | yeti_magarasi | 8, 21 | w | 2 | boss_lock |
| yeti_magarasi | k_kuzeybati | 3, 15 | n | 2 | boss_exit |
| k_kuzeybati | buz_kutuphane | 3, 10 | n | 2 | none |
| buz_kutuphane | k_kuzey | 9, 4 | e | 2 | none |
| k_kuzey | cadi_kulesi | 14, 4 | e | 2 | boss_lock |
| buz_avlusu | merdiven | 19, 17 | n | 2 | none |
| merdiven | cadi_kulesi | 19, 10 | n | 2 | boss_lock |
| cadi_kulesi | k_dogu | 24, 4 | e | 2 | boss_exit |
| k_dogu | kristal_galeri | 28, 4 | e | 2 | none |
| kristal_galeri | k_guneydogu | 33, 10 | s | 2 | none |
| k_guneydogu | sovalye_salonu | 33, 14 | s | 2 | none |
| sovalye_salonu | k_taht | 33, 23 | s | 2 | none |
| k_taht | buzul_tahti | 33, 26 | s | 2 | boss_lock |

#### 4.3.4 Trash packs, forces, routes

| pack | room | centre (tiles) | members | forces | notes |
|---|---|---|---|---|---|
| d3_p01 | k_giris | 19.5, 31 | Donmuş Ölü (`frost_dead`) x3, Buz Yarasası (`ice_bat`) x4 | **10** |  |
| d3_p02 | buz_avlusu | 14.5, 26 | Donmuş Ölü (`frost_dead`) x4, Buz Hortlağı (`frost_wraith`) x1 | **12** |  |
| d3_p03 | buz_avlusu | 25, 26 | Genç Yeti (`yeti_brute`) x1, Kar Örümceği (`snow_spider`) x2 | **14** |  |
| d3_p04 | buz_avlusu | 23.5, 22.5 | Buz Yarasası (`ice_bat`) x10 | **10** | Circles the frozen fountain in a 4 m loop; aggro range 11 m. |
| d3_p05 | buz_avlusu | 14.5, 19.5 | Ayaz Balçığı (`frost_slime`) x4, Buz Elementali (`ice_elemental`) x1 | **14** |  |
| d3_p06 | buz_avlusu | 25, 19.5 | Ayaz Şövalyesi (`frost_knight`) x1, Donmuş Ölü (`frost_dead`) x3 | **14** |  |
| d3_p07 | buz_avlusu | 16, 23 | Genç Yeti (`yeti_brute`) x1 | **8** | patrol: (14, 23) ↔ (26, 23). Lone Yeti patrol walks W-E right through the courtyard (14 s per leg). |
| d3_p08 | buz_avlusu | 19.5, 19 | Buz Hortlağı (`frost_wraith`) x2, Kar Örümceği (`snow_spider`) x2 | **14** | Guards the frozen-waterfall skip. |
| d3_p09 | k_bati | 10, 21.5 | Kar Örümceği (`snow_spider`) x2, Buz Yarasası (`ice_bat`) x3 | **9** |  |
| d3_p10 | k_kuzeybati | 3.5, 12.5 | Ayaz Balçığı (`frost_slime`) x3 | **6** |  |
| d3_p11 | buz_kutuphane | 2.5, 2.5 | Buz Hortlağı (`frost_wraith`) x2, Donmuş Ölü (`frost_dead`) x3 | **14** |  |
| d3_p12 | buz_kutuphane | 7, 2.5 | Buz Elementali (`ice_elemental`) x1, Buz Hortlağı (`frost_wraith`) x1, Buz Yarasası (`ice_bat`) x4 | **14** |  |
| d3_p13 | buz_kutuphane | 5, 7 | Ayaz Şövalyesi (`frost_knight`) x1, Ayaz Balçığı (`frost_slime`) x3 | **14** |  |
| d3_p14 | k_kuzey | 12, 4.5 | Donmuş Ölü (`frost_dead`) x4 | **8** |  |
| d3_p15 | merdiven | 19.5, 13.5 | Buz Elementali (`ice_elemental`) x1 | **6** | *optional* |
| d3_p16 | k_dogu | 26.5, 4.5 | Kar Örümceği (`snow_spider`) x3 | **9** |  |
| d3_p17 | kristal_galeri | 31.5, 2.5 | Buz Elementali (`ice_elemental`) x2, Ayaz Balçığı (`frost_slime`) x2 | **16** |  |
| d3_p18 | kristal_galeri | 36.5, 2.5 | Genç Yeti (`yeti_brute`) x1, Buz Yarasası (`ice_bat`) x6 | **14** |  |
| d3_p19 | kristal_galeri | 31.5, 8 | Buz Hortlağı (`frost_wraith`) x2, Donmuş Ölü (`frost_dead`) x4 | **16** |  |
| d3_p20 | kristal_galeri | 36.5, 7.5 | Ayaz Şövalyesi (`frost_knight`) x1, Buz Elementali (`ice_elemental`) x1, Kar Örümceği (`snow_spider`) x1 | **17** |  |
| d3_p21 | k_guneydogu | 33.5, 12.5 | Donmuş Ölü (`frost_dead`) x2, Ayaz Balçığı (`frost_slime`) x2 | **8** |  |
| d3_p22 | sovalye_salonu | 31.5, 17 | Ayaz Şövalyesi (`frost_knight`) x2 | **16** |  |
| d3_p23 | sovalye_salonu | 37, 17 | Ayaz Şövalyesi (`frost_knight`) x1, Buz Hortlağı (`frost_wraith`) x2 | **16** |  |
| d3_p24 | sovalye_salonu | 34, 21 | Donmuş Ölü (`frost_dead`) x6, Buz Elementali (`ice_elemental`) x1 | **18** |  |
| d3_p25 | k_taht | 33.5, 25 | Ayaz Şövalyesi (`frost_knight`) x1, Donmuş Ölü (`frost_dead`) x2 | **12** |  |

**Total available: 309 = 123.6% of the required 250.**

| route | rooms (trash) visited | packs skipped inside visited rooms | forces if every other pack is killed | % |
|---|---|---|---|---|
| A (standart, kütüphane) | 11 | - | 303 | 121.2% |
| B (Donmuş Şelale atlaması) | 9 | - | 253 | 101.2% |

**Route notes:**

* **Route A** (121%) has lots of slack: the courtyard patrol `d3_p07` and 1-2 courtyard packs can be skipped.
* **Route B** climbs the **Donmuş Şelale Yolu** from the courtyard straight into Ayaz Ana's tower. The party must go back to the courtyard after Ak Pençe (`k_bati` is `boss_lock`, so it reopens after the kill).
  * B skips the whole library wing (`k_kuzeybati`, `buz_kutuphane`, `k_kuzey`: 56 forces), at the cost of the icicle hazard and the need to **full-clear** everything else (101%).
  * Pro groups take B on Fortified weeks only if they can chain the courtyard into one or two giant pulls.
* **Big pull:** courtyard p02 + p05 + the patrol + the bat swarm p04 ≈ 25 mobs.
* **Interrupt checks:** `frost_wraith` Buz Mızrağı (coef 2.4 + freeze), and `ice_elemental` Buz Zırhı on Yetis and Knights.
* **Frontals:** `frost_knight` Dondurucu Kesik, `yeti_brute` Kar Topu. Keep the tank facing them away.

#### 4.3.5 Bosses

**Boss 1: Ak Pençe, "Buzulların Yaşlı Yetisi"** (`boss_ak_pence`)

| hpMult | dmgMult | speed | arena | enrage | clips |
|---|---|---|---|---|---|
| 60 | 2.7 | 6.4 m/s | Yeti İni 32 x 44 m (open, no pillars) | 180 s | `Idle`, `Walk`, `Run` (charge), `Attack` (0.50), `Jump`, `HitRecieve`, `Death` |

| Ability (id) | Type | Timing | Shape | Damage / effect | Counter |
|---|---|---|---|---|---|
| Pençe (`akpence_claw`) | basic | every 2.5 s | cone 120°, 5 m | coef 1.0 | |
| **Buz Yarması** (`akpence_frost_cleave`) | tank buster | first at 6 s, cd 14 s, windup 1.2 s | cone 70°, 9 m | coef 4.0 + chill 3 stacks | dodge out of the cone |
| **Kar Çığı** (`akpence_avalanche`) | avoidable, creates pillars | first at 12 s, cd 25 s; roar (emote) then telegraph 2.0 s | 10 random circles r 2.5 m + 1 under each player | coef 2.0 + stun 1 s. Each impact leaves a **Buz Sarkıtı** pillar (collides, 20 s). At least 3 pillars per cast, at least 6 m from each other. | dodge; then use the pillars |
| **Öfkeli Hücum** (`akpence_charge`) | fixate + charge | first at 18 s, cd 30 s | fixates a random player for 3 s (red arrow + text "Ak Pençe seni gözüne kestirdi!"), then charges a 4 m wide line, up to 30 m at 16 m/s, toward where the player stood | player hit: coef 4.0 + knockdown 1.5 s. **Pillar hit:** the pillar shatters; Ak Pençe is stunned 5 s and takes +50% damage ("SERSEMLEDİ!") | the fixated player stands behind a Buz Sarkıtı |
| Yaşlı Öfke (`akpence_frenzy`) | soft enrage | at 30% | | +30% attack speed | burn |

* Emotes: pull "*Ak Pençe öfkeyle kükrüyor!*" · death "*Ak Pençe son kez inleyip karlara yığılıyor.*"
* Loot `loot_d3_b1`:
  * slot bias: medium armour, boots, 2H axes
  * favoured set: `set_archmage_legacy` *Başbüyücünün Mirası* (gloves)
  * favoured legendary: `leg_windrunner` *Rüzgâr Koşucusu*

**Boss 2: Ayaz Ana, "Buz Cadısı"** (`boss_ayaz_ana`)

| hpMult | dmgMult | speed | arena | enrage | clips |
|---|---|---|---|---|---|
| 75 | 2.0 | 5.0 m/s | Cadı Kulesi 40 x 40 m, 4 crystal pylons | 210 s | `Idle`, `Spellcast_Shoot` (0.30), `Spellcast_Long`, `Spellcast_Raise`, `Spellcasting`, `Dodge_*` (blink), `Death_B` |

| Ability (id) | Type | Timing | Shape | Damage / effect | Counter |
|---|---|---|---|---|---|
| Buz Oku (`ayazana_bolt`) | basic | every 2.2 s | projectile 18 m/s, homing 0.5 | coef 1.1 frost | |
| **Dondurucu Nova** (`ayazana_nova`) | avoidable | first at 12 s, cd 22 s; cast 2.5 s (`Spellcast_Raise`, **not** interruptible) | circle r 8 m around her | coef 2.5 + freeze 2 s | run out; melee come back after |
| **Buz Mezarı** (`ayazana_ice_tomb`) | debuff + break | first at 15 s, cd 28 s | 1 random player (2 if the party has ≥ 4) is frozen in an ice block (`PROC:ice_tomb`, HP 5 x TRASH_HP x partyHp) for up to 6 s | stunned | allies break the tomb. Solo: it breaks after 2.5 s and you take coef 1.5. |
| **Kar Fırtınası** (`ayazana_blizzard`) | avoidable, moving | first at 8 s, cd 18 s | circle r 6 m that follows a random player at 3 m/s for 8 s | coef 0.6 per 0.5 s + chill | the target kites it away from the group |
| **Ayna Sureti** (`ayazana_mirror`) | add phase | at 70% and 40% | she blinks to the centre (immune 1 s); 3 images (Mage, tint 0xa8d8ff, opacity 0.6, HP 4 x TRASH_HP x partyHp) appear on 3 of the 4 pylons | each image casts **Buz Mızrağı** (**interruptible**, 3.0 s cast, coef 3.0 projectile at a random player, recast every 2 s) until killed; images last 30 s max. Meanwhile Ayaz Ana casts Kar Fırtınası every 9 s. | assign interrupts; cleave images |

* Yells: pull "Ayaz sizi öpecek, çocuklar. Bir daha uyanmamak üzere..." · 70% "Hangisi gerçek? Hiçbiri... hepsi!" · death "Bahar... gelmeyecek... asla..."
* Loot `loot_d3_b2`:
  * slot bias: staves, tomes, light armour
  * favoured set: `set_archmage_legacy` (helm, amulet)
  * favoured legendary: `leg_tome_of_echoes` *Yankılar Kitabı*

**Boss 3 (final): Donmuş Kral Tuğrul, "Buzul Tahtının Sahibi"** (`boss_tugrul`), with **Kırağı, the frost dragon** (`npc_kiragi`)

| hpMult | dmgMult | speed | arena | enrage | clips |
|---|---|---|---|---|---|
| 110 | 2.5 | 5.3 m/s | Buzul Tahtı 48 x 48 m, 4 ice pillars | 300 s | King: `2H_Melee_Idle`, `Walking_A`, `2H_Melee_Attack_Slice` (0.40), `2H_Melee_Attack_Chop` (0.72), `2H_Melee_Attack_Spin` (hits 0.6/1.17/1.7), `Taunt` (from the shared skeleton rig), `Death_B`. Dragon: `Fast_Flying`, `Flying_Idle`, `Punch` held open (breath), `No` (roar). |

Phases:

* **Phase 1 (100 → 55%)**:

| Ability (id) | Type | Timing | Shape | Damage / effect | Counter |
|---|---|---|---|---|---|
| Kraliyet Kılıcı (`tugrul_slash`) | basic | every 2.4 s | cone 120°, 5 m | coef 1.0 | |
| **Kraliyet Hükmü** (`tugrul_verdict`) | tank buster | first at 8 s, cd 16 s, windup 1.2 s | line 10 m x 3 m | coef 4.5 + sunder | dodge or block |
| **Ayaz İşareti** (`tugrul_frost_mark`) | spread | first at 15 s, cd 25 s | marks every player for 6 s | expiry: burst r 6 m, coef 2.0 to **other** players + an ice patch r 3 m for 15 s (slow 50% inside) | spread; drop the patches at the edge |
| **Ölümcül Dönüş** (`tugrul_spin`) | avoidable | first at 22 s, cd 30 s; telegraph circle r 7 m | 2.4 s spin; he drifts toward the farthest player at 3 m/s | 3 hits of coef 1.5 | leave the circle and keep away |

* **Phase 2 (55 → 25%): Kırağı Göklerde** (`tugrul_dragon_phase`)
  * The King yells; Kırağı flies a circle of r 30 m at 10 m height.
  * **Buz Nefesi** (`kiragi_breath`): every 20 s, the first 5 s after the phase starts. The dragon picks a side, telegraphs a band of 48 m x 12 m across the arena for 3.0 s, then breathes for 2 s: coef 5.0 + freeze 3 s to every player in the band **not in a pillar's shadow**.
    * Shadow = the line from the dragon to the player intersects a pillar's collider.
    * The shadows show as green `safe` telegraphs during the windup.
  * The King keeps abilities 1-3; the spin is disabled.
* **Phase 3 (< 25%): Tahtın Gazabı** (`tugrul_wrath`)
  * The pillars shatter (`frost_burst`); the dragon lands behind the throne (decor, roar).
  * The King gains +25% damage; Ayaz İşareti cd → 15 s; Ölümcül Dönüş returns with cd 20 s.
* Yells: pull "Tahtım buzdan, kalbim buzdan. Sizinki de olacak!" · 55% "Kırağı! Göklerden in ve onları dondur!" · 25% "Taht... benimdir! SONSUZA DEK!" · death "Sonunda... sıcak... ne kadar... sıcak..."
* Loot `loot_d3_b3`:
  * any slot; favoured set: `set_archmage_legacy` (chest)
  * favoured legendary: `leg_frozen_crown` *Donmuş Taç* (the King's crown, thematically)

---

### 4.4 Gölge Tapınağı (`golge_tapinagi`): shadow temple and cult, the last dungeon

#### 4.4.1 Identity

| field | value |
|---|---|
| id | `golge_tapinagi` |
| Normal level range | 42-52 (Normal enemy level = clamp(party avg, 42, 52), per GDD_SYSTEMS §1.10; Kahramanlık 50-60, Mitik 60) |
| M+ timer | 15:00 (900 s) |
| enemy forces for 100% | 210 |
| grid | 40 x 40 tiles (160 x 160 m) |
| fog | 0x140a20, near 6 m, far 34 m |
| ambient | 0x302048 x 0.3 |
| hemisphere sky / ground | 0x6040a0 / 0x100818 |
| torch colour | 0xb060ff |
| bloom | 1 |
| KayKit texture tint | 0x9080b0 |
| palette | 0x0e0814, 0x3a1050, 0x8040ff, 0xb060ff, 0x801020 |
| music | `dungeon_shadow` (boss fights: `boss`) |

**Lore (TR):**
> Gölge Tarikatı, yüzyıllardır mühürlü olan tapınağı yeniden açtı. Müritler gece gündüz ayin yapıyor; amaçları, tapınağın derinliklerinde uyuyan İblis Lordu Zakhar'ı uyandırmak. Gözcü Nefris gölgelerden izler, Yutucu Kevvas boşluk çukurunda açlıkla bekler. Mühürler zayıflıyor. Zaman daralıyor.

**Visual direction:**

* The darkest dungeon: deep violet fog close to the camera (near 6 m).
* Purple braziers (0xb060ff), blood-red runes (0x801020), void cracks.
* Stealth enemies at alpha 0.15.
* Light radius in corridors halved.
* Music `dungeon_shadow`: whispers, throat-singing drones, heartbeat drums that speed up in the final phase.

#### 4.4.2 Map

```
    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9
  0                           3333333333333333333333333333
  1                           3333333333333333333333333333
  2                           3333333333333333333333333333
  3                           3333333333333333333333333333
  4                           3333333333333333333333333333
  5                           3333333333333333333333333333
  6 11111111111111111111      33333333333333B3333333333333      22222222222222222222
  7 11111111111111111111      3333333333333333333333333333      22222222222222222222
  8 11111111111111111111      3333333333333333333333333333      22222222222222222222
  9 1111111111B111111111      3333333333333333333333333333      22222222222222222222
 10 11111111111111111111      3333333333333333333333333333      22222222222222222222
 11 11111111111111111111      33333333333333EX333333333333      2222222222B222222222
 12 11111111111111111111      3333333333333333333333333333      22222222222222222222
 13 11111111111111111111      333333333333####333333333333      22222222222222222222
 14 11111111111111111111                  ####                  22222222222222222222
 15 111111111111111111%%%%eeee++++EEEEEEEE++++EEEEEEEE++++ffff%%%%222222222222222222
 16 11111111####111111%%%%eeee++++EEEEEEEEEEEEEEEEEEEE++++ffff%%%%222222####22222222
 17         ####                EEEEEEEEEEEEEEEEEEEEEEEE                ####
 18         bbbb                EEEEEE..EEEEEEEEEE..EEEE                dddd
 19         bb..                EEEEEEEEEEEEEEEEEEEEEEEE                dd..
 20         bbbb                EEEEEEEEEEEEEEEEEEEEEEEE                dddd
 21         ++++                EEEEEEEEEEEE..EEEEEEEEEE                ++++
 22   CCCCCC++++CCCCCC          EEEEEEEEEEEEEEEEEEEEEEEE          DDDDDD++++DDDDDD
 23   CCCCCCCCCCCCCCCC          EEEEEEEEEEEEEEEEEEEEEEEE          DDDDDDDDDDDDDDDD
 24   CCCCCCCCCCCC..CC          EEEEEE..EEEEEEEEEE..EEEE          DDDD..DDDDDDDDDD
 25   CCCC..CCCCCCCCCC          EEEEEEEEEEEEEEEEEEEEEEEE          DDDDDDDDDDDD..DD
 26   CCCCCCCCCCCCCCCC          EEEEEEEEEE++++EEEEEEEEEE          DDDDDDDDDDDDDDDD
 27   CCCCCCCCCCCCCCCC          BBBBBBBBBB++++BBBBBBBBBB          DDDDDDDDDDDDDDDD
 28   CCCCCCCCCCCC..CC          BBBBBBBBBBBBBBBBBBBBBBBB          DDDD..DDDDDDDDDD
 29   CCCCCCCCCCCCCC++++aaaaaa++++BBBBBBBBBB..BBBBBBBB++++cccccc++++DDDDDDDDDDDDDD
 30   CCCCCCCCCCCCCC++++aa..aa++++BBBBBBBBBBBBBBBBBBBB++++cc..cc++++DDDDDDDDDDDDDD
 31   CCCC..CCCCCCCCCC          BBBB..BBBBBBBBBBBB..BBBB          DDDDDDDDDD..DDDD
 32   CCCCCCCCCCCCCCCC          BBBBBBBBBBBBBBBBBBBBBBBB          DDDDDDDDDDDDDDDD
 33   SNCCCCCCCCCCCCCC          BBBBBBBBBB++++BBBBBBBBSN          DDDDDDDDDDDDDDDD
 34                                   AAAA++++AAAA
 35                                   AAAAAAKTAAAA
 36                                   AAAAAAAAAAAA
 37                                   AAAAAASTAAAA
 38                                   AAAAAAAAAAAA
```

Legend: `A` giris, `B` avlu_giris, `a` k_bati, `C` bati_kanadi, `b` k_bati_kuzey, `1` nefris_odasi, `c` k_dogu, `D` dogu_kanadi, `d` k_dogu_kuzey, `2` kevvas_cukuru, `e` k_merkez_bati, `f` k_merkez_dogu, `E` kara_hol, `g` k_final, `3` zakhar_sunagi. `++` open door, `##` boss_lock door, `%%` boss_exit door, `ST` start, `KT` Kehanet Taşı (Font of Power), `B1-B3` boss spawns, `EX` exit portal, `SN` shrine, `..` trash pack centre. Rows with no rooms are omitted.

#### 4.4.3 Rooms, decoration, doors

| id | Ad (TR) | rect x,z,w,h (tiles) | size (m) | floor / wall | forces | notes |
|---|---|---|---|---|---|---|
| `giris` | Mühürlü Kapı | 17, 34, 6, 5 | 24 x 20 | temple / temple | - |  autoDecor 0.3 |
| `avlu_giris` | Mühürlü Avlu | 14, 27, 12, 7 | 48 x 28 | temple / temple | 40 |  autoDecor 0.5 |
| `k_bati` | Fısıltı Koridoru | 9, 29, 5, 2 | 20 x 8 | temple / temple | 9 |  autoDecor 0.3 |
| `bati_kanadi` | Fısıltı Kanadı | 1, 22, 8, 12 | 32 x 48 | temple / temple | 55 |  autoDecor 0.6 |
| `k_bati_kuzey` | Gözcü Merdiveni | 4, 17, 2, 5 | 8 x 20 | temple / temple | 9 |  autoDecor 0.3 |
| `nefris_odasi` | Gözcü Odası | 0, 6, 10, 11 | 40 x 44 | temple / temple | - | **Boss 1 arena** autoDecor 0.2 |
| `k_dogu` | Ayin Koridoru | 26, 29, 5, 2 | 20 x 8 | temple / temple | 8 |  autoDecor 0.3 |
| `dogu_kanadi` | Ayin Kanadı | 31, 22, 8, 12 | 32 x 48 | temple / temple | 55 |  autoDecor 0.6 |
| `k_dogu_kuzey` | Çukur Merdiveni | 34, 17, 2, 5 | 8 x 20 | temple / temple | 8 |  autoDecor 0.3 |
| `kevvas_cukuru` | Boşluk Çukuru | 30, 6, 10, 11 | 40 x 44 | stone_dark / cave | - | **Boss 2 arena** autoDecor 0.15 |
| `k_merkez_bati` | Batı Kısayolu | 10, 15, 4, 2 | 16 x 8 | temple / temple | - |  autoDecor 0.1 |
| `k_merkez_dogu` | Doğu Kısayolu | 26, 15, 4, 2 | 16 x 8 | temple / temple | - |  autoDecor 0.1 |
| `kara_hol` | Kara Hol | 14, 15, 12, 12 | 48 x 48 | temple / temple | 73 |  autoDecor 0.4 |
| `k_final` | Uyanış Eşiği | 19, 14, 2, 1 | 8 x 4 | temple / temple | - |  autoDecor 0 |
| `zakhar_sunagi` | Zakhar Sunağı | 13, 0, 14, 14 | 56 x 56 | temple / temple | - | **Boss 3 arena** autoDecor 0.1 |

**Decoration and props per room** (model names are files under `/assets/models/dungeon/` unless a pack prefix is given; `halloween/`, `furniture/`, `town/`, `gen/`, `kenney/...` are folders under `/assets/models/`):

- `giris`: Kehanet Taşı at (19.5, 35). Purple braziers x2 (`kenney/graveyard-kit/fire-basket` scale 3, light 0xb060ff), `banner_patternC_brown` tinted purple, `halloween/plaque_candles`.
- `avlu_giris`: Courtyard 48 x 28 m. Shadow pool (black emissive-edge plane, decor) at the centre, `kenney/graveyard-kit/altar-stone` x2, `pillar-obelisk` x4, `column-large` x6, ritual candles (`candle_triple`). Shrine **Kudret Sunağı** at (25, 33).
- `k_bati`: Dark corridor (light radius halved), whispering SFX, `halloween/candle_melted`. Assassins wait here in stealth.
- `bati_kanadi`: Cult dormitory: `furniture/bed_single_A` x6 (tinted dark), `cabinet_small_decorated`, `book_set`, `rug_oval_B` (purple), `shelf_B_small_decorated`, `lamp_standing` (light 0xb060ff). Shrine **Rüzgar Sunağı** at (1, 33).
- `k_bati_kuzey`: `stairs_walled` look, `banner_thin_brown` x2.
- `nefris_odasi`: Arena 40 x 44 m with 6 `column` (2 rows of 3 at x = 2.5 / 7.5, z = 8, 11, 14). Clones hide behind them. Dim purple lights, a hanging `lantern_hanging` cage.
- `k_dogu`: Blood-red runes on the floor (emissive 0x801020), skull candles.
- `dogu_kanadi`: Ritual wing: summoning circle (emissive ring r 3 m) at (35, 27.5), `kenney/graveyard-kit/altar-wood`, `coffin-old` x3, `urn-round` x6, `halloween/shrine_candles`. Treasure `chest_gold` at (38, 33).
- `k_dogu_kuzey`: Steps leading down (visual), void cracks on the walls (emissive 0x8040ff).
- `kevvas_cukuru`: Arena 40 x 44 m. Void pit (unwalkable, black with a purple swirl `portal_swirl`, r 3 m) at the north-centre (35, 7.5). 3 rift spawn spots at (32, 10) (38, 10) (35, 15). Broken pillars `rubble_large`.
- `k_merkez_bati`: Shortcut, sealed until Gözcü Nefris dies: `wall_gated` (purple glow) at the boss end.
- `k_merkez_dogu`: Shortcut, sealed until Yutucu Kevvas dies.
- `kara_hol`: Central nave 48 x 48 m: 2 rows of `column-large` (x = 15.5 / 23.5, z = 17, 20, 23), long `kenney/graveyard-kit/brick-wall` partitions, big statue (`Demon_Lord.glb` in T-pose, `Idle` frame 0, tinted 0x302040, scale 2, static) at (19.5, 16) facing s, purple braziers x8.
- `k_final`: Seal door (`wall_gated` with a purple shield VFX) that opens only when both wing bosses are dead.
- `zakhar_sunagi`: Final arena 56 x 56 m. Altar: `kenney/graveyard-kit/altar-stone` scale 4 at (19.5, 1.5). 4 priest platforms for phase 2 (`floor_foundation_allsides`, 2 m high, with ramps) at (15, 3) (24, 3) (15, 10) (24, 10). 4 seal spawn sockets. Purple and red braziers x10, a giant `portal_swirl` behind the altar.

| a | b | tile (in a) | side | width | gate |
|---|---|---|---|---|---|
| giris | avlu_giris | 19, 34 | n | 2 | none |
| avlu_giris | k_bati | 14, 29 | w | 2 | none |
| k_bati | bati_kanadi | 9, 29 | w | 2 | none |
| bati_kanadi | k_bati_kuzey | 4, 22 | n | 2 | none |
| k_bati_kuzey | nefris_odasi | 4, 17 | n | 2 | boss_lock |
| nefris_odasi | k_merkez_bati | 9, 15 | e | 2 | boss_exit |
| k_merkez_bati | kara_hol | 13, 15 | e | 2 | none |
| avlu_giris | k_dogu | 25, 29 | e | 2 | none |
| k_dogu | dogu_kanadi | 30, 29 | e | 2 | none |
| dogu_kanadi | k_dogu_kuzey | 34, 22 | n | 2 | none |
| k_dogu_kuzey | kevvas_cukuru | 34, 17 | n | 2 | boss_lock |
| kevvas_cukuru | k_merkez_dogu | 30, 15 | w | 2 | boss_exit |
| k_merkez_dogu | kara_hol | 26, 15 | w | 2 | none |
| avlu_giris | kara_hol | 19, 27 | n | 2 | none |
| kara_hol | k_final | 19, 15 | n | 2 | none |
| k_final | zakhar_sunagi | 19, 14 | n | 2 | boss_lock |

#### 4.4.4 Trash packs, forces, routes

| pack | room | centre (tiles) | members | forces | notes |
|---|---|---|---|---|---|
| d4_p01 | avlu_giris | 16, 30.5 | Tarikat Müridi (`cult_acolyte`) x8, Gölge Rahibi (`shadow_priest`) x1 | **13** |  |
| d4_p02 | avlu_giris | 23, 30.5 | Tarikat Müridi (`cult_acolyte`) x8, Tarikat Çağırıcısı (`cult_summoner`) x1 | **13** |  |
| d4_p03 | avlu_giris | 19.5, 29 | Boşluk Muhafızı (`void_demon`) x1, Gölge (`shade`) x2 | **14** | Stands in front of the Kara Hol door; link risk with p01/p02 if pulled carelessly (10 m apart). |
| d4_p04 | k_bati | 11, 29.5 | Gölge Suikastçısı (`cult_assassin`) x3 | **9** | Stealthed. |
| d4_p05 | bati_kanadi | 3, 31 | Gölge (`shade`) x3, Gölge Rahibi (`shadow_priest`) x1 | **14** |  |
| d4_p06 | bati_kanadi | 6.5, 28 | Gece Örümceği (`shadow_spider`) x3, Tarikat Müridi (`cult_acolyte`) x4 | **13** |  |
| d4_p07 | bati_kanadi | 3, 25 | Boşluk Muhafızı (`void_demon`) x1, Gölge Suikastçısı (`cult_assassin`) x2 | **14** |  |
| d4_p08 | bati_kanadi | 6.5, 23.5 | Tarikat Çağırıcısı (`cult_summoner`) x1, Boşluk İblisçiği (`void_imp`) x3, Tarikat Müridi (`cult_acolyte`) x3 | **14** |  |
| d4_p09 | k_bati_kuzey | 4.5, 19 | Gölge (`shade`) x2, Gölge Suikastçısı (`cult_assassin`) x1 | **9** |  |
| d4_p10 | k_dogu | 28, 29.5 | Boşluk İblisçiği (`void_imp`) x4 | **8** |  |
| d4_p11 | dogu_kanadi | 36, 31 | Tarikat Müridi (`cult_acolyte`) x6, Gölge Rahibi (`shadow_priest`) x1, Tarikat Çağırıcısı (`cult_summoner`) x1 | **16** |  |
| d4_p12 | dogu_kanadi | 32.5, 28 | Gece Örümceği (`shadow_spider`) x4 | **12** |  |
| d4_p13 | dogu_kanadi | 36.5, 25 | Boşluk Muhafızı (`void_demon`) x1, Gölge Rahibi (`shadow_priest`) x1 | **13** |  |
| d4_p14 | dogu_kanadi | 32.5, 23.5 | Gölge (`shade`) x2, Boşluk İblisçiği (`void_imp`) x4 | **14** |  |
| d4_p15 | k_dogu_kuzey | 34.5, 19 | Boşluk Muhafızı (`void_demon`) x1 | **8** |  |
| d4_p16 | kara_hol | 16.5, 24 | Tarikat Müridi (`cult_acolyte`) x10, Tarikat Çağırıcısı (`cult_summoner`) x1 | **15** |  |
| d4_p17 | kara_hol | 22.5, 24 | Boşluk Muhafızı (`void_demon`) x1, Gölge Rahibi (`shadow_priest`) x1, Gölge (`shade`) x1 | **16** |  |
| d4_p18 | kara_hol | 16.5, 18 | Gece Örümceği (`shadow_spider`) x2, Gölge Suikastçısı (`cult_assassin`) x2 | **12** |  |
| d4_p19 | kara_hol | 22.5, 18 | Tarikat Çağırıcısı (`cult_summoner`) x1, Boşluk İblisçiği (`void_imp`) x4, Gölge Rahibi (`shadow_priest`) x1 | **18** |  |
| d4_p20 | kara_hol | 19.5, 21 | Boşluk Muhafızı (`void_demon`) x1, Tarikat Müridi (`cult_acolyte`) x4 | **12** | patrol: (15.5, 21) ↔ (23.5, 21). Patrol crosses the nave W-E between the four packs. |

**Total available: 257 = 122.4% of the required 210.**

| route | rooms (trash) visited | packs skipped inside visited rooms | forces if every other pack is killed | % |
|---|---|---|---|---|
| A (batı önce, tam temizlik) | 11 | - | 257 | 122.4% |
| B (hızlı: Kara Hol örümcek/suikastçı + devriye atlanır) | 11 | d4_p18, d4_p20, d4_p12 | 221 | 105.2% |

**Route notes:**

* **Free boss order:** Gözcü Nefris (west wing) and Yutucu Kevvas (east wing) are both `order: 1`.
* **Shortcuts:** each wing ends in a shortcut (`boss_exit`) into the **Kara Hol** nave, which opens only after that wing's boss dies. The final door `k_final` → `zakhar_sunagi` opens only when both are dead.
* **Typical path:** courtyard → west wing → Nefris → shortcut → clear the nave → back through the courtyard → east wing → Kevvas → shortcut → final. The mirror route works equally well.
* **Route B** skips the nave's spider/assassin pack, the nave patrol and the east-wing spiders (105%).
* **Big pulls:**
  * The courtyard has two 9-member acolyte packs (p01, p02) with a void demon between them: pull all three together for 23 enemies.
  * The nave p16 has 11 more acolytes. Acolytes' *Fanatik* rewards killing them all at once.
* **Interrupt checks** (the heaviest dungeon for interrupts):
  * `shadow_priest` heal and shield (**HIGH**)
  * `cult_summoner` İblis Çağır / Karanlık Ayin (**HIGH**)
  * `shade` Kabus fear (**HIGH**)
* **Stealth:** `cult_assassin` hide in `k_bati`, the west wing and the nave; the opening hit is coef 2.5. AoE reveals them.

#### 4.4.5 Bosses

**Boss 1 (either order): Gözcü Nefris, "Tarikatın Gölge Bıçağı"** (`boss_nefris`)

| hpMult | dmgMult | speed | arena | enrage | clips |
|---|---|---|---|---|---|
| 60 | 2.3 | 7.0 m/s | Gözcü Odası 40 x 44 m, 6 columns | 180 s | `Idle`, `Running_A`, `Dualwield_Melee_Attack_Slice` (0.55) / `_Stab` (0.75) / `_Chop`, `Throw`, `Dodge_*`, `Spellcast_Raise` at 2x (vanish), `Death_B` |

| Ability (id) | Type | Timing | Shape | Damage / effect | Counter |
|---|---|---|---|---|---|
| Çift Hançer (`nefris_slash`) + Zehirli Bıçaklar | basic + stacking poison | every 1.6 s | cone 90°, 3.5 m | coef 1.0 + 1 poison stack (coef 0.3 per second, 8 s, max 10) | the tank rotates defensives; healers watch the stacks |
| **Gölge Adımı** (`nefris_shadowstep`) | avoidable | first at 8 s, cd 15 s | vanishes (`stealth_smoke`); 1.0 s later reappears behind a random player: purple circle r 2 m under them for 1.0 s | **Arkadan Bıçak**: coef 3.5 | the target rolls out of the circle |
| **Hançer Yelpazesi** (`nefris_fan`) | avoidable | first at 12 s, cd 20 s, telegraph 1.2 s | 5 lines in a star (72° apart, random rotation), 18 m x 1.5 m | coef 2.0 + bleed 6 s | stand between the lines |
| **Gölge Klonları** (`nefris_clones`) | add phase | at 66% and 33%, lasts 15 s | she splits into 3. The 2 clones have HP 3 x TRASH_HP x partyHp each, deal 50% damage and copy her abilities. Clones have purple eyes; the real Nefris has red eyes and leaves shadow footprints. | clones explode on death: circle r 3 m, 1.0 s delay, coef 1.5 | find the real one (bonus: hitting the real one with an interrupt ends the phase); or AoE the clones away from the group |

* Yells: pull "Sizi saatlerdir izliyorum. Sıkıcısınız." · 66% "Hangimi vuracaksın?" · death "Efendim... uyan..."
* Loot `loot_d4_b1`:
  * slot bias: daggers, medium armour
  * favoured set: `set_shadow_veil` *Gölge Peçesi* (gloves, boots)
  * favoured legendary: `leg_whisper` *Fısıltı*

**Boss 2 (either order): Yutucu Kevvas, "Boşluktan Gelen Açlık"** (`boss_kevvas`)

| hpMult | dmgMult | speed | arena | enrage | clips |
|---|---|---|---|---|---|
| 75 | 2.7 | 5.0 m/s | Boşluk Çukuru 40 x 44 m, void pit r 3 m at (35, 7.5), 3 rift spots | 210 s | `Idle`, `Walk`, `Run`, `Attack` (0.37), `Jump`, `HitRecieve`, `Death` |

| Ability (id) | Type | Timing | Shape | Damage / effect | Counter |
|---|---|---|---|---|---|
| Pençe (`kevvas_claw`) | basic | every 2.5 s | cone 120°, 5 m | coef 1.0 | |
| **Açlık** (`kevvas_devour`) | tank buster | first at 6 s, cd 16 s, windup 1.0 s | cone 60°, 5 m | coef 4.5 + *Yutulma* (-30% healing received, 8 s) | dodge or block |
| **Boşluk Çekimi** (`kevvas_void_pull`) | displacement + zone | first at 15 s, cd 30 s | pulls every player toward him at 6 m/s for 4 s; circle r 6 m around him | coef 1.0 per 0.5 s inside the circle | walk away (7 m/s beats the 6 m/s pull); dodge rolls gain distance |
| **Boşluk Yarıkları** (`kevvas_rifts`) | soak / close | first at 10 s, cd 22 s | opens 1 rift (2 if the party has ≥ 3) at the rift spots (`PROC:rift`, r 3 m); a rift stays until closed | each open rift spawns 1 `void_imp` every 10 s (0 forces). Standing inside for **3.0 s** (cumulative) closes it; inside you take coef 0.8 per second. | a player closes each rift; kill the imps before 50% |
| **Ziyafet** (`kevvas_feast`) | phase | at 50% | he devours every living `void_imp` | heals 5% and gains +10% damage per imp eaten | have the imps dead |
| **Boşluk Kükremesi** (`kevvas_roar`) | avoidable | after 50%, every 25 s; telegraph 2.0 s | ring with inner r 4 m, outer r 40 m | coef 3.0 | **hug him** (within 4 m), then spread again for the tank buster |

* Yells: pull "AÇ... ÇOK AÇ..." · 50% "ZİYAFET!" · death "Boşluk... beni... geri... çağırıyor..."
* Loot `loot_d4_b2`:
  * slot bias: rings, amulets, belts
  * favoured set: `set_shadow_veil` (helm)
  * favoured legendaries: `leg_blood_ring` *Kan Yüzüğü*, `leg_merchant_kings_ring` *Tüccar Kralın Yüzüğü*

**Boss 3 (final): İblis Lordu Zakhar, "Gölge Tapınağının Uyanan Tanrısı"** (`boss_zakhar`)

| hpMult | dmgMult | speed | arena | enrage | clips |
|---|---|---|---|---|---|
| 120 | 2.5 | 5.6 m/s | Zakhar Sunağı 56 x 56 m, altar, 4 priest platforms, 4 seal sockets | 330 s | `Idle`, `Walk`, `Run`, `Weapon` (trident, ≈0.45), `Punch`, `Duck` (teleport), `Jump*`, `Wave` (summon), `No`/`Yes` (roars), `Death` |

Phases:

* **Phase 1 (100 → 70%)**:

| Ability (id) | Type | Timing | Shape | Damage / effect | Counter |
|---|---|---|---|---|---|
| Üç Dişli Saplama (`zakhar_thrust`) | basic | every 2.3 s | line 6 m x 2 m | coef 1.0 | |
| **Üç Dişli Mızrak** (`zakhar_impale`) | tank buster | first at 8 s, cd 15 s, windup 1.2 s | line 12 m x 2.5 m | coef 4.5 + bleed 8 s | dodge or block |
| **Cehennem Novası** (`zakhar_nova`) | avoidable | first at 14 s, cd 24 s; cast 2.5 s | circle r 10 m around him | coef 3.0 | run out of 10 m |
| **Gölge Mühürleri** (`zakhar_seals`) | **soak** | first at 20 s, cd 30 s; seals last 6 s | 3 seals (2 for a party of 2, 1 solo), circles r 2.5 m at random sockets | each needs ≥ 1 player inside at expiry. An empty seal deals coef 3.0 to every player and spawns 1 `void_imp`. The soaker gets *Mühür Yükü* (+50% shadow damage taken, 20 s); soaking again with it doubles the damage. | rotate soakers |

* **Phase 2 (at 70%): Tarikat Ayini** (`zakhar_ritual`)
  * Zakhar teleports to the altar (`Duck`) and is immune.
  * 4 `cult_ritualist` appear on the 4 platforms and channel **Karanlık Ayin** (**interruptible**; an interrupt stuns them for 3 s and pauses the channel) for 30 s.
  * Every 10 s, 6 `cult_acolyte` (0 forces) pour in from the door. This is the horde moment.
  * Each ritualist still alive at 30 s gives Zakhar **+15% damage permanently**. The phase ends when all 4 ritualists die or at 30 s.
* **Between 70% and 40%** the phase 1 kit continues.
* **Phase 3 (< 40%): Uyanış** (`zakhar_awaken`)
  * He hides the Trident.
  * Basic attack becomes **Pençe Kombosu** (`Punch`): cone 120°, 4.5 m, every 1.6 s.
  * **Ateş Yağmuru** (`zakhar_hellrain`): every 12 s, 8 circles r 3 m (2 on players), telegraph 1.5 s, coef 2.5.
  * Cehennem Novası cd → 18 s; the seals continue.
  * At 15%: soft enrage, +5% damage every 5 s.
* Yells: pull "Tarikatım beni uyandırdı. Siz de bana kurban olarak sunuldunuz." · 70% "Müritlerim! Ayini tamamlayın!" · 40% "Bu beden artık yeterince güçlü. UYANIYORUM!" · death "Gölgeler... asla... ölmez..."
* Loot `loot_d4_b3`:
  * any slot; favoured set: `set_shadow_veil` (dagger)
  * favoured legendaries: `leg_nightstalker_hood` *Gece Avcısı Başlığı*, `leg_eye_of_ancients` *Kadimlerin Gözü*
  * suggested dungeon legendary: *Zakhar'ın Karanlık Asası* (staff; shadow hits have a 10% chance to open a mini-rift that pulses coef 1.0 shadow for 4 s)

---
## 5. Mythic+ (Mitik+)

### 5.1 The keystone (Kadim Anahtar Taşı)

| Field | Value |
|---|---|
| Item base | `keystone` (`ItemCategory 'keystone'`), icon `/assets/icons/item-keystone.svg` |
| Name | `Kadim Anahtar Taşı: {Zindan} +{L}`, for example "Kadim Anahtar Taşı: Buzul Tahtı +7" |
| Data | `KeystoneData { dungeonId, level, depleted? }`, also mirrored in `MythicProfile.keystone` |
| Rules | **One per character.** Bound, not tradeable or sellable; it cannot be stashed. |
| Tooltip (TR) | "Seviye {L} · {affix names joined with ' · '}". Then "Düşman canı +{hp%} · hasarı +{dmg%}" and "Süre: {mm:ss}". Then "Kehanet Taşı'na yerleştirerek Mitik+ zindanı başlat." |
| Depleted tooltip | grey line "Tükenmiş: son koşu zamanında bitmedi." (`depleted` = the last run with this key was untimed; no other effect) |

### 5.2 Getting the first key

* Finishing **any dungeon on Mitik 0** while holding no key grants a **+2 key** for a random dungeon (uniform over the 4). This is the objective of the systems quest *Kadim Anahtar* (GDD_SYSTEMS §6.3).
  * Toast: "Kadim Anahtar Taşı kazandın: {Zindan} +2!" with SFX `keystone_upgrade`.
* Safety net: the Anahtar Ustası gives a free +2 key once per week to anyone at level 60 who has ever cleared an M0 and holds no key.

### 5.3 Starting a run

1. The key owner goes through the matching portal in the Kadim Kapılar Salonu with difficulty **Mitik+**.
   * The portal UI greys out the M+ option unless someone in the party holds that dungeon's key.
   * If the party leader picks another member's key, the whole party enters that dungeon (§5.13).
2. Inside, the dungeon is empty and calm. The **Kehanet Taşı** (Font of Power) stands in the start room: a `dungeon/column` scaled 0.5 + `gen/props/crystal_purple` 0.6 on top, `waypoint_glow`.
3. The key owner interacts with it, choosing "Anahtarı Yerleştir":
   * online: ready check (all must accept within 15 s)
   * `keystone_insert` VFX + SFX
   * enemies spawn (deterministic order and ids)
   * **10 s countdown** (`RunState.countdown`, SFX `countdown_tick`, big centre digits)
   * a barrier on the start room exit until the countdown ends, then SFX `mplus_start`
4. The timer runs from 0 even outside the dungeon. Leaving the dungeon does not pause it.

### 5.4 Scaling

GDD_SYSTEMS §1.10 owns the curve. It is copied here so the key tooltip and the HUD can show it.

```ts
// Mitik 0 = level 60 at x1.0 (the M+ baseline). Key L multiplies it:
export const mplusHp  = (L: number) => 1.10 ** (L - 1);   // +2 x1.10, +10 x2.36, +15 x3.80, +20 x6.12
export const mplusDmg = (L: number) => 1.08 ** (L - 1);   // +2 x1.08, +10 x2.00, +15 x2.94, +20 x4.32
// Final enemy numbers in an M+ run:
//   hp  = monsterHP(60)  * hpMult  * mplusHp(L)  * (Tahkimli: trash x1.20 | Zorba: bosses x1.30) * (1 + 0.7 * (n - 1))
//   dmg = monsterDmg(60) * dmgMult * mplusDmg(L) * (Tahkimli: trash x1.30 | Zorba: bosses x1.15)
// From +12 (Kadim Lanet) both the Tahkimli and the Zorba factors apply.
// Affix damage given as "% max HP" scales instead by (1 + 0.03 * (L - affix.minLevel)).
```

| key | enemy HP x (GDD_SYSTEMS §1.10) | enemy DMG x | Tahkimli trash HP / DMG | Zorba boss HP / DMG | affix slots active | score base(L) | max score (timed at ≤ 60%) | end chest ilvl (GDD_SYSTEMS §4.3) | Kadim Kasa ilvl |
|---|---|---|---|---|---|---|---|---|---|
| +2 | x1.10 | x1.08 | x1.32 / x1.40 | x1.43 / x1.24 | Tahkimli/Zorba | 35.0 | 42.5 | 64 | 67 |
| +3 | x1.21 | x1.17 | x1.45 / x1.52 | x1.57 / x1.34 | Tahkimli/Zorba | 42.5 | 50.0 | 66 | 69 |
| +4 | x1.33 | x1.26 | x1.60 / x1.64 | x1.73 / x1.45 | Tahkimli/Zorba, +4 | 60.0 | 67.5 | 68 | 71 |
| +5 | x1.46 | x1.36 | x1.76 / x1.77 | x1.90 / x1.56 | Tahkimli/Zorba, +4 | 67.5 | 75.0 | 70 | 73 |
| +6 | x1.61 | x1.47 | x1.93 / x1.91 | x2.09 / x1.69 | Tahkimli/Zorba, +4 | 75.0 | 82.5 | 72 | 75 |
| +7 | x1.77 | x1.59 | x2.13 / x2.06 | x2.30 / x1.82 | Tahkimli/Zorba, +4, +7 | 92.5 | 100.0 | 74 | 77 |
| +8 | x1.95 | x1.71 | x2.34 / x2.23 | x2.53 / x1.97 | Tahkimli/Zorba, +4, +7 | 100.0 | 107.5 | 76 | 79 |
| +9 | x2.14 | x1.85 | x2.57 / x2.41 | x2.79 / x2.13 | Tahkimli/Zorba, +4, +7 | 107.5 | 115.0 | 78 | 81 |
| +10 | x2.36 | x2.00 | x2.83 / x2.60 | x3.07 / x2.30 | Tahkimli/Zorba, +4, +7, Efsunlu Yarık | 125.0 | 132.5 | 80 | 83 |
| +11 | x2.59 | x2.16 | x3.11 / x2.81 | x3.37 / x2.48 | Tahkimli/Zorba, +4, +7, Efsunlu Yarık | 132.5 | 140.0 | 82 | 85 |
| +12 | x2.85 | x2.33 | x3.42 / x3.03 | x3.71 / x2.68 | Tahkimli/Zorba, +4, +7, Efsunlu Yarık, Kadim Lanet | 150.0 | 157.5 | 84 | 87 |
| +13 | x3.14 | x2.52 | x3.77 / x3.27 | x4.08 / x2.90 | Tahkimli/Zorba, +4, +7, Efsunlu Yarık, Kadim Lanet | 157.5 | 165.0 | 86 | 89 |
| +14 | x3.45 | x2.72 | x4.14 / x3.54 | x4.49 / x3.13 | Tahkimli/Zorba, +4, +7, Efsunlu Yarık, Kadim Lanet | 165.0 | 172.5 | 88 | 91 |
| +15 | x3.80 | x2.94 | x4.56 / x3.82 | x4.94 / x3.38 | Tahkimli/Zorba, +4, +7, Efsunlu Yarık, Kadim Lanet | 172.5 | 180.0 | 90 | 93 |
| +16 | x4.18 | x3.17 | x5.01 / x4.12 | x5.43 / x3.65 | Tahkimli/Zorba, +4, +7, Efsunlu Yarık, Kadim Lanet | 180.0 | 187.5 | 90 | 93 |
| +17 | x4.59 | x3.43 | x5.51 / x4.45 | x5.97 / x3.94 | Tahkimli/Zorba, +4, +7, Efsunlu Yarık, Kadim Lanet | 187.5 | 195.0 | 90 | 93 |
| +18 | x5.05 | x3.70 | x6.07 / x4.81 | x6.57 / x4.26 | Tahkimli/Zorba, +4, +7, Efsunlu Yarık, Kadim Lanet | 195.0 | 202.5 | 90 | 93 |
| +19 | x5.56 | x4.00 | x6.67 / x5.19 | x7.23 / x4.60 | Tahkimli/Zorba, +4, +7, Efsunlu Yarık, Kadim Lanet | 202.5 | 210.0 | 90 | 93 |
| +20 | x6.12 | x4.32 | x7.34 / x5.61 | x7.95 / x4.96 | Tahkimli/Zorba, +4, +7, Efsunlu Yarık, Kadim Lanet | 210.0 | 217.5 | 90 | 93 |

Column notes:

* The chest and Kadim Kasa item levels are copied from GDD_SYSTEMS §4.3 / §7.4 for convenience:
  * end chest: 60 + 2 x min(key, 15)
  * vault: 63 + 2 x min(key, 15)

  Item counts, rarity and materials are in GDD_SYSTEMS §7.4.
* Above +15, keys add no item level, only score and rating. That is the push incentive.

### 5.5 Affixes

The host owns every affix: it decides targets and timing and broadcasts the resulting hits (`ARCHITECTURE.md`, "Damage authority"). Affix timers run only while the party is in combat, except Fırtınalı (also out of combat, with a 15 s lull after combat). Copy the `params` column into `MythicAffixDef.params`. Icons are `/assets/icons/affix-<id>.svg` (present for all except seasonal, which uses `affix-seasonal.svg`).

| id | Ad (TR) | from | params | Behaviour (exact) | Tooltip (TR, `desc`) |
|---|---|---|---|---|---|
| `fortified` | Tahkimli | +2 (even weeks) | `{trashHpPct:0.20, trashDmgPct:0.30}` | non-boss enemies +20% HP and +30% damage | "Boss olmayan düşmanların canı %20, verdikleri hasar %30 artar." |
| `tyrannical` | Zorba | +2 (odd weeks) | `{bossHpPct:0.30, bossDmgPct:0.15}` | bosses (and their shields/cages) +30% HP, +15% damage | "Boss'ların canı %30, verdikleri hasar %15 artar." |
| `bolstering` | Güçlenen | +4 | `{radius:12, hpPct:0.20, dmgPct:0.20, maxStacks:10}` | a non-boss death gives every non-boss ally within 12 m 1 stack of `bolstered`: +20% max HP (current HP raised by the same amount) and +20% damage per stack, max 10. VFX `bolster_burst`, model scale +3% per stack. Horde rule (§1.2). | "Boss olmayan bir düşman öldüğünde, 12 m içindeki müttefikleri güçlenir (yük başına +%20 can ve hasar)." |
| `raging` | Öfkeli | +4 (Zorba weeks only) | `{hpBelow:0.30, dmgPct:0.50}` | non-boss enemies below 30% HP: +50% damage and CC immunity until death. Status `raging`, red tint 0xff4040 at 50% blend, `enrage_aura`. | "Boss olmayan düşmanlar %30 canın altında öfkelenir: %50 fazla hasar verir, kontrol etkilerinden etkilenmez." |
| `sanguine` | Kan Dökücü | +4 | `{radius:4, duration:20, healPctPerSec:0.05, playerDmgPctPerSec:0.03}` | a non-boss death leaves a blood pool r 4 m for 20 s. Enemies inside heal 5% max HP per second; players inside take 3% max HP per second. Pools do not stack in effect (an overlap counts once). Horde rule. | "Boss olmayan düşmanlar öldüğünde kan gölü bırakır: düşmanları iyileştirir, oyunculara hasar verir." |
| `bursting` | Patlayan | +4 | `{duration:4, dmgPctPerStackPerSec:0.015, maxStacks:15}` | a non-boss death gives **every player** 1 stack of `bursting` (4 s, duration refreshes on each new stack, max 15): 1.5% max HP per second per stack. VFX `bursting_pop` on death. Horde rule. | "Boss olmayan bir düşman öldüğünde tüm oyuncular Patlama yükü alır (yük başına saniyede canın %1,5'i)." |
| `inspiring` | İlham Veren | +4 | `{radius:10, minPackSize:3, every:4}` | at spawn, in every 4th eligible pack (pack index % 4 == seed % 4, ≥ 3 members) the non-swarm member with the highest HP x becomes *İlham Veren* (`inspiring_aura`). Allies within 10 m get `inspiring`: immune to CC and interrupts. Killing it removes the aura. | "Bazı düşmanlar çevrelerine ilham verir: yakındaki müttefikleri kontrol ve büyü kesmeye karşı bağışık olur." |
| `volcanic` | Volkanik | +4 | `{interval:7, minDistance:6, radius:2, delay:1.5, dmgPct:0.25, knockup:1.0}` | every 7 s in combat, under each player who is ≥ 6 m from every enemy, a plume telegraph r 2 m appears; it erupts after 1.5 s for 25% max HP + knock-up 1 s (VFX `volcanic_plume`) | "Savaşta düşmanlardan uzak duran oyuncuların altında volkanik patlamalar oluşur." |
| `quaking` | Sarsıntılı | +4 | `{interval:20, radius:5, delay:2.5, dmgPct:0.15}` | every 20 s (offset 4 s per party slot), each player gets a quake telegraph r 5 m centred on themselves; after 2.5 s every player inside (including the caster) takes 15% max HP and is interrupted (`quaking_ring`) | "Oyuncular düzenli olarak sarsıntı yayar: yakındaki herkese hasar verir ve büyülerini keser." |
| `explosive` | Patlayıcı Küre | +7 | `{interval:8, maxOrbs:3, castTime:6, dmgPct:0.35, spawnRadius:6}` | every 8 s in combat (max 3 alive) a `affix_explosive_orb` spawns within 6 m of a random enemy in combat. It casts for 6 s, then explodes for 35% max HP on every player. **Any single direct hit kills it**: basic attacks, projectiles, targeted skills and melee arcs. Ground AoE with r > 4 m and DoTs do 0 to it. Orbs give 0 forces. | "Savaşta düşmanların yanında patlayıcı küreler belirir. Patlamadan önce yok edin!" |
| `necrotic` | Nekrotik | +7 | `{healReducePerStack:0.03, dotPctPerStack:0.003, duration:8, maxStacks:33}` | every enemy melee hit adds 1 `necrotic` stack (8 s, refreshes): -3% healing received per stack (max 99%) and 0.3% max HP per second per stack. Stacks fall off only when the 8 s run out. | "Düşmanların yakın dövüş saldırıları birikimli Nekrotik Çürüme uygular: alınan iyileştirme azalır, zamanla hasar." |
| `spiteful` | Kin Dolu | +7 | `{hpPctOfDead:0.30, decayPctPerSec:0.08, speed:5.6, hitDmgPct:0.08, attackCd:1.5}` | a non-boss death spawns a `affix_spiteful_shade` (HP 30% of the dead enemy's max HP, loses 8% per second, so it lives about 12.5 s). It fixates a random non-tank player, moves at 5.6 m/s (players run 7) and melee hits for 8% max HP every 1.5 s. It cannot be CC'd but can be killed. 0 forces. Horde rule. | "Boss olmayan düşmanlar öldüğünde bir Kin Ruhu belirir ve rastgele bir oyuncuyu kovalar." |
| `storming` | Fırtınalı | +7 | `{interval:30, lifetime:12, speed:3.5, dmgPct:0.15, knockup:1.0}` | every 30 s a tornado spawns 6 m from a random player and wanders randomly at 3.5 m/s for 12 s. Contact: 15% max HP + knock-up 1 s (once per player per tornado). | "Düzenli aralıklarla oyuncuların yakınında hortumlar belirir." |
| `grievous` | Ağır Yara | +7 | `{hpBelow:0.90, stackInterval:3, dotPctPerStack:0.015, maxStacks:5}` | while a player is below 90% HP, they gain 1 `grievous` stack every 3 s (max 5): 1.5% max HP per second per stack. Healed to 90% or more: all stacks removed. | "Canı %90'ın altındaki oyuncular birikimli Ağır Yara alır; %90'ın üstüne iyileşince kaybolur." |
| `seasonal_efsun` | **Efsunlu Yarık** | +10 | `{thresholds:[0.2,0.4,0.6,0.8], guardianHp:15, killWindow:45, buffDuration:60, possessHpPct:0.30, possessDmgPct:0.20, spawnDelay:3}` | see §5.5.4 | "Zindan güçlendikçe efsun yarıkları açılır. Muhafızı öldürürsen efsun senindir; yoksa yarık düşmanları efsunlar." |

**At +12, Kadim Lanet:** Tahkimli **and** Zorba are both active. The week still counts as its +2 type for score (§5.9).

**General affix rules:**

* "Non-boss" means `rank` trash or elite.
* Summoned and boss adds never trigger death affixes.
* Bosses are immune to Raging, Bolstering and Inspiring.
* Death affixes do nothing during boss encounters except for adds the boss summoned.

#### 5.5.4 Seasonal affix: Efsunlu Yarık (unique mechanic, ties into the efsun theme)

1. **Trigger.** Each time the run's forces cross **20 / 40 / 60 / 80%**, an *Efsun Yarığı* (`PROC:rift`) opens at the rift spot nearest the party centroid that:
   * is at least 15 m away
   * is outside boss arenas
   * has not been used yet

   There are 6 spots per dungeon: `extras.riftSpots` in the layout JSON. Banner: "Bir Efsun Yarığı açıldı!"
2. **Guardian.** After 3 s a guardian steps out. The type cycles Kor → Ayaz → Gölge → Kor, offset by the dungeon's index.

   | Guardian | id | Kit |
   |---|---|---|
   | Kor (fire) | `efsun_guardian_kor` | Alev Halkası: every 6 s a ring r 3-8 m, coef 2.0; melee coef 1.5 |
   | Ayaz (frost) | `efsun_guardian_ayaz` | Buz Kırıcı: frontal cone 90°, 8 m, every 8 s, coef 3.0 + freeze 1.5 s |
   | Gölge (shadow) | `efsun_guardian_golge` | Gölge Sıçraması: blinks to a random player every 7 s and hits a circle r 3 m for coef 2.0; it is a phase caster |

   Guardian stats: HP 15 x TRASH_HP(60) x M+ HP curve x partyHp, dmgMult 2.0, 0 forces, CC immune. It stays rooted for its first 3 s.
3. **Kill it within 45 s** and the whole party gets an **efsun blessing** for 60 s (lost on death):

   | Blessing | Effect |
   |---|---|
   | Kor Efsunu | +15% damage; hits apply burn |
   | Ayaz Efsunu | -15% damage taken; attackers get chilled |
   | Gölge Efsunu | +20% move speed, +10% crit chance, cooldowns tick 10% faster |

   SFX `upgrade_success`, VFX `upgrade_success` on every player.
4. **Not killed in 45 s:** the guardian dives into the nearest uncleared pack (`portal_swirl` trail). That pack becomes **Efsunlu**:
   * +30% HP, +20% damage
   * purple glow (`buff_aura` 0xb060ff)
   * drops 1 extra item for every player when killed (ARPG risk/reward)

   Banner: "Yarık Muhafızı bir sürüyü efsunladı!"

### 5.6 Weekly rotation (12 weeks, from the real calendar)

```ts
export const WEEK_EPOCH_MS = Date.UTC(2026, 0, 5, 1, 0, 0); // Monday 01:00 UTC = 04:00 Turkey time: one weekly reset for affixes, keys and the Kadim Kasa (GDD_SYSTEMS "Monday 04:00")
export const WEEK_MS = 7 * 24 * 3600 * 1000;
export const weekIndex = (now = Date.now()) => Math.floor((now - WEEK_EPOCH_MS) / WEEK_MS);
export const rotationIndex = (now = Date.now()) => ((weekIndex(now) % 12) + 12) % 12;
const ROT4: AffixId[] = ['bolstering', 'raging', 'sanguine', 'bursting', 'inspiring', 'volcanic', 'quaking', 'bolstering', 'volcanic', 'raging', 'bursting', 'sanguine'];
const ROT7: AffixId[] = ['explosive', 'spiteful', 'storming', 'explosive', 'necrotic', 'grievous', 'spiteful', 'storming', 'explosive', 'necrotic', 'spiteful', 'grievous'];
export function affixesFor(level: number, now = Date.now()): AffixId[] {
  if (level < 2) return [];
  const r = rotationIndex(now);
  const base: AffixId = r % 2 === 0 ? 'fortified' : 'tyrannical';
  const out: AffixId[] = [base];
  if (level >= 4) out.push(ROT4[r]);
  if (level >= 7) out.push(ROT7[r]);
  if (level >= 10) out.push('seasonal_efsun');
  if (level >= 12) out.push(base === 'fortified' ? 'tyrannical' : 'fortified');
  return out;
}
```

| rot | +2 | +4 | +7 | +10 | next start (Monday 01:00 UTC = 04:00 TR) |
|---|---|---|---|---|---|
| 0 | Tahkimli (`fortified`) | Güçlenen (`bolstering`) | Patlayıcı Küre (`explosive`) | Efsunlu Yarık | 2026-12-07 |
| 1 | Zorba (`tyrannical`) | Öfkeli (`raging`) | Kin Dolu (`spiteful`) | Efsunlu Yarık | 2026-12-14 |
| 2 | Tahkimli (`fortified`) | Kan Dökücü (`sanguine`) | Fırtınalı (`storming`) | Efsunlu Yarık | 2026-12-21 |
| 3 | Zorba (`tyrannical`) | Patlayan (`bursting`) | Patlayıcı Küre (`explosive`) | Efsunlu Yarık | 2026-12-28 |
| 4 | Tahkimli (`fortified`) | İlham Veren (`inspiring`) | Nekrotik (`necrotic`) | Efsunlu Yarık | 2026-10-12 (**current week**) |
| 5 | Zorba (`tyrannical`) | Volkanik (`volcanic`) | Ağır Yara (`grievous`) | Efsunlu Yarık | 2026-10-19 |
| 6 | Tahkimli (`fortified`) | Sarsıntılı (`quaking`) | Kin Dolu (`spiteful`) | Efsunlu Yarık | 2026-10-26 |
| 7 | Zorba (`tyrannical`) | Güçlenen (`bolstering`) | Fırtınalı (`storming`) | Efsunlu Yarık | 2026-11-02 |
| 8 | Tahkimli (`fortified`) | Volkanik (`volcanic`) | Patlayıcı Küre (`explosive`) | Efsunlu Yarık | 2026-11-09 |
| 9 | Zorba (`tyrannical`) | Öfkeli (`raging`) | Nekrotik (`necrotic`) | Efsunlu Yarık | 2026-11-16 |
| 10 | Tahkimli (`fortified`) | Patlayan (`bursting`) | Kin Dolu (`spiteful`) | Efsunlu Yarık | 2026-11-23 |
| 11 | Zorba (`tyrannical`) | Kan Dökücü (`sanguine`) | Ağır Yara (`grievous`) | Efsunlu Yarık | 2026-11-30 |

**Rotation rules:**

* Raging appears only on Tyrannical weeks.
* Bursting never shares a week with Necrotic or Grievous (two healing checks).
* Every level-4 affix appears with both base types where it occurs twice.
* **Online:** the host computes the affixes once when the key is inserted and stores them in `RunState.affixes`. Clients never use their own clock for this.
* A run that crosses the weekly reset keeps its affixes.

### 5.7 Timer, upgrades, deaths, abandoning

| Rule | Value |
|---|---|
| Timer | per dungeon (§4): 780 / 810 / 840 / 900 s |
| **+3** | finished in ≤ 60% of the timer |
| **+2** | ≤ 80% |
| **+1** | ≤ 100% (in time) |
| Untimed | > 100%: completes normally. GDD_SYSTEMS calls this *depleted* (1 chest item, ilvl −4). Key −1. |
| Death penalty | **+15 s** per player death, added to `elapsed` (`RunState.deathPenaltySec`). The HUD shows "Ölüm: N (−m:ss)". |
| Abandon | all players leave the dungeon for 60 s, the party disbands, the host leaves (no host migration in v1), or the key owner uses "Koşuyu Terk Et" with a party vote (majority). The key drops 1 level (min +2, same dungeon); no score, chest or vault credit. Banner: "Koşu terk edildi. Anahtar 1 seviye düştü." |

The HUD shows the thresholds live: "Süre 08:12 / 13:00 · +2: 10:24 · +3: 07:48".

### 5.8 What happens to the key

| Outcome | Owner's key | Others in the party |
|---|---|---|
| Timed +N | level +N (max +30), **new random dungeon** (different from this one if possible) | anyone who holds a key **lower** than L: their own key +1 (once per run). Anyone with no key: new key of level max(2, L-2), random dungeon. |
| Untimed | level -1 (min +2), new random dungeon | no change; anyone with no key gets max(2, L-3) |
| Abandoned | level −1 (min +2), same dungeon, `depleted = true` | none |
| Weekly reset (Monday 01:00 UTC = 04:00 TR) | level max(2, L-1), new random dungeon, `depleted` cleared | |

### 5.9 Score and rating (Mitik+ Puanı, Raider.io style)

```ts
export const scoreBase = (L: number) => 20 + 7.5 * L + 10 * (+(L >= 4) + +(L >= 7) + +(L >= 10) + +(L >= 12));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Score of one completed run. Abandoned and M0 runs score 0. */
export function computeScore(L: number, timeSec: number, timerSec: number): number {
  if (L < 2) return 0;
  const b = scoreBase(L);
  if (timeSec <= timerSec) return b + 7.5 * clamp01((timerSec - timeSec) / (0.4 * timerSec)); // +0..+7.5 (full at 60%)
  return Math.max(0, b - 7.5 - 7.5 * clamp01((timeSec - timerSec) / (0.4 * timerSec)));       // -7.5..-15
}
/** Per dungeon: best Tahkimli-week run F and best Zorba-week run T. */
export const dungeonScore = (F = 0, T = 0) => 1.5 * Math.max(F, T) + 0.5 * Math.min(F, T);
/** Character rating = sum over the 4 dungeons, rounded to 0.1. */
```

* A run is filed under the week's +2 affix, even at +12 where both are active.
* Rating is recomputed on every completion. The gain shows as "Mitik+ Puanı: 1234.5 (+18.3)" with SFX `achievement`.
* Reference points:
  * all +2 timed (average time bonus) ≈ 310
  * all +10 timed (average bonus) ≈ 1030
  * all +15 timed fast ≈ 1440
  * all +20 timed fast ≈ 1740

**Rating colours** (name plate, Şeref Taşı):

| Rating | Colour | Tier (TR) |
|---|---|---|
| 0-299 | #ffffff | Acemi |
| 300-699 | #1eff00 | Yetenekli |
| 700-1099 | #0070dd | Usta |
| 1100-1399 | #a335ee | Destansı |
| 1400-1749 | #ff8000 | Efsanevi |
| 1750+ | #e6cc80 | Kadim |

### 5.10 Rewards

* **Loot rules** (chest item counts, ilvl, rarity, materials, boss and elite drops inside M+, personal loot) are in **GDD_SYSTEMS §7.4**.
* **This doc adds the presentation:**
  * The end-of-run chest spawns next to the exit portal: `gen/props/chest_epic` for M+, `chest_gold` for Mitik 0 / Kahramanlık, `chest_iron` for Normal.
  * Each player opens their own chest (`Open` clip, `chest_open` VFX + SFX), then the systems loot burst (§7.7).
  * A result banner sits above it: "Zamanında: +2 · 11:42 / 13:00 · Ölüm: 2".

### 5.11 Weekly vault: Kadim Kasa (Lord Tarhan)

* Rules (slots at 1 / 4 / 8 completed M+ runs, ilvl 63 + 2 x min(keyₙ, 15), take one slot) and the Monday reset are in **GDD_SYSTEMS §7.4**.
* Content side: Lord Tarhan (`npc_lord_tarhan`) and the glowing `chest_epic` next to him are the UI entry.
  * He plays `Wave` when there is something to claim.
  * Weekly progress string: "Kadim Kasa: 5/8 koşu · 2 seçenek açık (73, 77 eşya seviyesi)".
* The affix rotation and keystone reset use the same weekly instant as the vault (§5.6).

### 5.12 Keystone services (Anahtar Ustası Yaşar)

| Option (TR) | Effect | Cost |
|---|---|---|
| Zindanı Değiştir | new random dungeon, same level | free once per week if the key has not been used this week; otherwise 1,000 x L gold |
| Seviyeyi Düşür | level -1 (min +2) | free |
| Haftalık Ekler | shows this week's and next week's affixes (rotation table) | |
| Anahtar Ver | the weekly +2 safety-net key (§5.2) | free |

### 5.13 Online play: rooms, party-wide key selection, rules

* **Room browser** (Buluşma Taşı, P2P via trystero; the host is authoritative).
  * Room fields: `name`, `dungeonId`, `difficulty`, `keyLevel`, `minItemLevel`, `minRating`, `maxPlayers` (2-5), `public` or private 4-letter code.
  * The list shows rating colours and class icons of the members.
  * Joining a room makes the creator the party leader and host.
* **Key selection:**
  1. The party window shows every member's key (dungeon + level + depleted flag).
  2. The leader clicks one ("Bu anahtarla git").
  3. Every member sees a confirm: "{Oyuncu} anahtarını seçti: Gölge Tapınağı +7. Kabul ediyor musun?"
  4. The whole party teleports to that dungeon on Mitik+.
  5. **Only the owner can insert the key** at the Kehanet Taşı, which triggers the ready check.
* **Locked after insertion:** the party size and `partyHp(n)` are locked; nobody new can join. A disconnected member can rejoin the same room and run (they spawn at the last Diriliş Taşı); the timer keeps running.
* **Key owner leaves mid-run:** the run continues. At the end the host sends the key result in a `keystone_result` message to the owner's peer if they are still connected; otherwise the owner's client applies the abandon rule (−1) the next time it sees the unfinished run in its save (trust model: P2P co-op, no anti-cheat).
* **Loot** is personal (each peer rolls its own chest, §1.3). **Score** is recorded per member from the host's final `RunState` (`elapsed`, `deaths`, `affixes`).
* **Deaths** add to the shared timer. Downed players can be revived (§0.7).

### 5.14 Player-facing strings (TR)

| Key | Text |
|---|---|
| `mplus.title` | "Mitik+ {L} · {zindan}" |
| `mplus.countdown` | "Başlıyor: {n}" |
| `mplus.timer` | "{mm:ss} / {MM:SS}" |
| `mplus.thresholds` | "+2: {mm:ss} · +3: {mm:ss}" |
| `mplus.forces` | "Düşman Gücü: {p}%" |
| `mplus.deaths` | "Ölüm: {n} (−{m:ss})" |
| `mplus.boss_left` | "Boss: {k}/3" |
| `mplus.timed` | "ZAMANINDA TAMAMLANDI! Anahtar +{N} yükseldi: {zindan2} +{L2}" |
| `mplus.untimed` | "Süre doldu. Anahtar 1 seviye düştü: {zindan2} +{L2}" |
| `mplus.abandoned` | "Koşu terk edildi. Anahtar 1 seviye düştü." |
| `mplus.score` | "Mitik+ Puanı: {r} (+{d})" |
| `mplus.ready` | "{oyuncu} anahtarını yerleştirmek istiyor: {zindan} +{L}. Hazır mısın?" |
| `mplus.rift_open` | "Bir Efsun Yarığı açıldı!" |
| `mplus.rift_fail` | "Yarık Muhafızı bir sürüyü efsunladı!" |
| `boss.enrage` | "{boss} çileden çıktı!" |
| `kick.success` | "KESİLDİ!" |
| `boss.stunned` | "SERSEMLEDİ!" |

---

## 6. Difficulty modes

These multipliers stack on top of the GDD_SYSTEMS base formulas (§1.10). Mitik 0 is the M+ baseline, so the systems M+ table (+2 = HP x1.10) continues straight from it.

| Mode | id (`Difficulty`) | Unlock | Enemy level | HP x | DMG x | Timer | Boss enrage | Loot (GDD_SYSTEMS §4.3 / §7) | Recommended ilvl | Extras |
|---|---|---|---|---|---|---|---|---|---|---|
| **Normal** | `normal` | character level ≥ dungeon min (8 / 18 / 30 / 42) | clamp(party avg, min, min + 10) | 1.0 | 1.0 | none | timers x1.5 | ilvl = monster level (+1 elite, +3 boss), cap 60 | ≈ character level | 3 champion packs, random shrines (Bilgelik allowed), Hazine Goblini 8%, first clear bonus XP (systems §6.2) |
| **Kahramanlık** | `heroic` | level 50 + one Normal clear of that dungeon | clamp(party avg, 50, 60) | 0.85 | 0.85 | none | normal | as Normal (cap 60), plus set drops (ilvl ≥ 40 bosses) | 50-60 | 4 champion packs, Hazine Goblini 8%. **The 50 → 60 levelling content**, and the first gear step at 60. |
| **Mitik 0** | `mythic` | level 60 + Kahramanlık clear of that dungeon | 60 | 1.0 | 1.0 | none (the clear time is shown) | normal | treated as key 1: drops ilvl 61, bosses 63, chest 62, no vault credit | 60 | 3 champion packs, end-of-run chest, **first keystone** (§5.2) |
| **Mitik+ L** | `mythicplus` | hold a key | 60 | x1.10^(L−1) (+ affixes) | x1.08^(L−1) | dungeon timer | normal | GDD_SYSTEMS §7.4 (chest 60 + 2L, vault 63 + 2L, cap at +15) | +2-4: 62 · +5-7: 66 · +8-10: 72 · +11-13: 78 · +14-15: 84, plus blacksmith upgrades of +7..+10 · +16-20: 90 + upgrades of +12 and up | affixes, forces, score, keys, vault |

The recommended ilvl is shown in the portal UI. Below it the text turns red: "Önerilen eşya seviyesi: 72". It is never a hard gate (casual P2P co-op).

## 7. Progression path: level 1 to M+15

Assumes a reasonably efficient player, solo or duo. GDD_SYSTEMS §6.1 targets 6-9 h to level 60; the item levels follow GDD_SYSTEMS §4.3; the unlock levels come from GDD_SYSTEMS §6.3.

| Playtime | Level / key | What the player does | Gear target |
|---|---|---|---|
| 0:00-0:20 | 1 → 5 | Character creation, a Kuzgunkale tour (NPC tooltips). Sisli Koru: Fare Yuvası, Balçık Gölü, Yağmacı Kampı. Quests teach the basic attack, AoE, dodge roll and **interrupt** (stop the Goblin Şamanı's heal). | ilvl 1-5 |
| 0:20-0:50 | 5 → 8 | Görev Panosu opens (5). Mantar Halkası, Örümcek Korusu, Terk Edilmiş Köy (first patrol), Yarasa Mağarası, a Lanetli Sandık event, and the first Hazine Goblini (scripted guaranteed spawn on the first visit to Terk Edilmiş Köy). | ilvl 5-9 |
| 0:50-1:40 | 8 → 14 | Party play opens. Ork Karakolu (elite frontal), **Çürükkök** world boss (group up via the Buluşma Taşı). **Kemik Mahzeni Normal** opens at 8: first clear about 18 min (first-clear bonus XP), repeats about 12 min. | ilvl 8-17, first Nadir |
| 1:40-2:30 | 14 → 18 | Kemik Mahzeni x3 + daily bounties. Demirci +1..+6 (from 10), first efsun (from 15). | ilvl 14-21 |
| 2:30-4:00 | 18 → 30 | **Kızıl Dökümhane** Normal x6. Legendaries can drop from 20; gamble vendor at 25. At 30: ultimate skill, upgrades up to +15. | ilvl 18-33 |
| 4:00-5:30 | 30 → 42 | **Buzul Tahtı** Normal x6 (enemies scale up to 40). | ilvl 30-43 |
| 5:30-7:00 | 42 → 50 | **Gölge Tapınağı** Normal x6. Set pieces drop from level-40+ bosses. | ilvl 42-55 |
| 7:00-8:15 | 50 → 60 | **Kahramanlık** opens at 50 (enemies 50-60): every dungeon x2 or so. Level 60. | ilvl 50-63, first set pieces |
| 8:15-9:30 | 60 | Missing Kahramanlık clears, then **Mitik 0** x4 → **first key +2** (quest *Kadim Anahtar*). | ilvl 60-63 |
| 9:30-13:00 (week 1) | +2 → +6 | Push keys (+2/+3 jumps when timed well). The week-1 Kadim Kasa fills to 8 runs. | chest ilvl 64-72, upgrades +7 |
| week 2 (13-20 h) | +6 → +9 | First vault (≈ 75-81). Set 2-piece bonuses. The +7 affix appears (Patlayıcı Küre, Kin Dolu, ...). Learn routes (Route B skips). | ilvl 72-78 |
| weeks 3-4 (20-30 h) | +9 → +12 | Seasonal **Efsunlu Yarık** from +10, **Kadim Lanet** at +12. +10 upgrades with Kutsama Kağıdı (from timed +10 chests). Rating ≈ 1100 (Destansı purple). | ilvl 78-84, 4-piece set |
| weeks 5-8 (30-50 h) | +12 → +15 | Vault 87-93, legendary pity (systems §7.2), upgrades +12..+15. Rating ≈ 1400-1450 (Efsanevi orange). | ilvl 84-93 + 1-2 legendaries |
| after | +16 → +20 | Rating race (1750+ Kadim), Şeref Taşı leaderboard, perfect routes, best-of Tahkimli/Zorba. | perfect efsun rolls |

---

## 8. Implementation checklist and suggested type additions

1. **Types** (owners: the respective modules; these are suggestions only):
   * `DoorDef.gate`: add `'boss_exit'` (§0.7).
   * `RoomDef`: optional doc flags `boss?: number; optional?: boolean; skip?: boolean`.
   * `DungeonDef`: add `extras?: { fontOfPower: [number, number]; shrines: { type: string; pos: [number, number] }[]; riftSpots: [number, number][] }`.
   * `TownDef` NPC role: add `'enchanter' | 'vault'`, or keep `blacksmith` / `keystone` with a `ui` field.
   * `SceneId`: add `'world'` for Sisli Koru. Alternatively load it through `DungeonScene` as a `DungeonDef` with `outdoor: true`: the ground plane replaces floor tiles, tree walls replace walls, and `rooms` = one 50 x 50 room plus camps as packs with `respawn`.
2. **Dungeon data:** import `docs/GDD_CONTENT.layout.json`. Every pack member has a formation `offset` in tiles: melee and swarm sit in a sunflower cluster; casters, healers and ranged stand 1.25 tiles behind on the side away from the entry door, fitted inside the room. The builder must snap these to free nav cells.
3. **Boss AI:**
   * A **timeline scheduler** per boss: each ability has `initialCooldown` (first), `cooldown`, an optional HP-phase whitelist, and a global cooldown of 1.5 s between non-basic abilities so two telegraphs never start in the same frame. When two are due, the higher-priority one goes first.
   * Phases come from `BossPhase.hpBelow`. Intermissions make the boss immune and pause the timeline; it resumes with the remaining cooldowns.
   * The enrage timer starts on pull.
4. **Determinism (online):** all random target picks, positions and seeded choices use the run seed plus a per-encounter counter **on the host**. The host broadcasts the picked targets and telegraph positions; clients only render, and resolve damage against their own player (`ARCHITECTURE.md` damage authority).
5. **Affix hooks** (`systems/Affixes.ts`):

| Hook | Affixes |
|---|---|
| `onEnemyDeath` | bolstering, sanguine, bursting, spiteful (with the horde rule and the summoned-add exclusion) |
| `onEnemyDamaged` | raging (threshold) |
| `onPackSpawn` | inspiring |
| combat timers | volcanic, quaking, explosive, storming |
| `onPlayerHitByMelee` | necrotic |
| `onPlayerHp` | grievous |
| `onForces` | seasonal_efsun |

6. **Forces UI:** the 2-decimal percentage; on the M+ minimap each pack shows its forces % on hover (route planning). Optionally show the total of the selected packs while dragging a box on the map.
7. **Cross-doc notes for the systems owner:**
   * GDD_SYSTEMS §6.6 lists a "+5 s" M+ death penalty as a placeholder owned by this doc. It is **+15 s** (§0.7, §5.7).
   * Weekly reset for affixes, keys and the vault: Monday 01:00 UTC (= 04:00 TR). Please use the same UTC instant instead of local time, so peers agree.
   * Interrupts: §0.6 maps "interruptible" onto flinch, hard CC and stagger breaks. A dedicated interrupt flag on one skill per class is recommended.
8. **VFX/SFX ids** used here all exist in `src/types/vfx.ts` / `audio.ts`. No new ids are required. Nice-to-have additions: `soul_orb`, `rift_open`, `breath_frost`.
9. **Balancing hooks:** keep `hpMult`, `dmgMult`, `coef`, timers and forces in data, never in code. Every boss ability id above is unique and can be tuned on its own.
