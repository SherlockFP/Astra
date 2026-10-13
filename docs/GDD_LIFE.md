# EFSUN ONLINE – Kadim Zindanlar · GDD: Yaşam Sistemleri (Gathering, Bölgeler, Sohbet, Kamera, Vuruş Hissi, İlvl, PvP)

> Status: v1.0, implementation-ready. Owner: life/feel design. Companion docs: `ARCHITECTURE.md` (module ownership, damage authority, net channels), `docs/GDD_SYSTEMS.md` (stats, items, progression, §8 feel), `docs/GDD_CONTENT.md` (town, dungeons, Sisli Koru), `docs/ROADMAP.md` (batch 3 request), `docs/NETCODE.md`.
> Audience: **Haiku coding agents**, one work package at a time (§8). Every package names exact files, data shapes, function names and numbers. If a number here and a table elsewhere disagree, **this document wins for the systems it covers** (professions, regions-as-beast-layer, chat, camera, hit feel, ilvl-equivalence, PvP); `ARCHITECTURE.md` still wins for ownership and net authority.
> All **player-facing strings are Turkish**. Ids are snake_case English. Numbers are initial tuning values and live in data tables (`src/data/*`), never in logic.
> User priority (repeat of ARCHITECTURE "Combat feel standard"): **combos, effects, hit feel**. §5 is therefore the most exact section; §8 schedules it first.

## 0. Conventions, assumptions, and what already exists

### 0.1 Existing code this GDD extends (read before editing)

| Area | Existing file(s) | What is there today | What this GDD changes |
|---|---|---|---|
| Hit feel | `src/combat/feel.ts` (`FEEL`, `KNOCKBACK`, `HitWeight`), `src/combat/Combat.ts` (`noteFeel`, `flushFeel`, `slowmo`, `showEnemyHit`, `reactEnemy`, `addJiggle`, `addStagger`), `src/core/Engine.ts` (`hitStop(ms)`, `timeScale`), `src/combat/ComboTracker.ts`, `src/ui/hud/ComboCounter.ts` | per-weight hit-stop/shake constants, global dt×0.05 hit-stop, single-stage white flash, combo tiers [5,12,24,40] | FEEL v2 numbers (§5), selective hit-freeze, 2-stage flash, camera kick, FOV kick, hit markers, 6th combo tier |
| Camera | `src/camera/ThirdPersonCamera.ts` | orbit camera: pivot 2.0, shoulder 0.55, follow 13/6.5 per s, zoom 3–18 (default 9), nav-grid raycast collision, shake list (max 10), punch + FOV springs, `setAssist`, `snap` | prop proxies, occluder fade, auto-follow, shoulder auto-swap, zoom→pitch/FOV curves, lock-on framing, boss intro, shake budget (§4) |
| Chat | `src/ui/hud/Chat.ts` (one "Grup" channel, system/loot lines), `src/net/NetSession.ts` (`sendChat`, `onChat`, `chatAllowed`), `types/net.ts` `chat: {text}`, `events.ts` `net:chat` | party-only text, 200-char cap, burst limit | channels, tabs, slash commands, item links, combat log, emotes, lobby channel (§3) |
| Level display | `src/ui/widgets/Nameplates.ts` (`Plate.update`) | raw level number, 3 colours | "Sv. N" text, 6 difficulty colours + skull (§2.2) |
| Open world | `src/data/dungeons/sisli_koru.ts` (9 camps `ow_c01..c09`, boss `wb_curukkok`), `PackDef.respawnSec/levelRange/radius`, `ui:zoneName` event | one 200×200 m zone, levels 1–10 | region layer + 3 beast regions inside it; later zones are assumptions (§2) |
| Items | `src/data/materials.ts` (`MATERIALS`, `add()`), `ItemGen.ts` (`buildFromBase`, `rollAffixOf`, `RARITY_AFFIX_RULES`), `CharacterState.itemLevel()` (average over FILLED slots), `systems/Upgrade.ts` | upgrade/efsun/salvage economy | crafted items, essences, ilvl-equivalent, soft caps (§1, §6) |
| Interaction | `entities/Interactable.ts` (`interact()` on press), `PlayerController.updateInteract` | press-F only | optional hold-F fields (§1.6) |
| Town | `src/data/town.ts` (`npc(...)`, `props`, zones `zanaat_sokagi`, `han_bahcesi`, `carsi`) | Demirci (24,-6), Efsuncu (24,8), Simyacı Lale (-24,4), Meyhaneci (34,34) | stations + trainers (§1.10) |

### 0.2 Cross-document assumptions (the orchestrator must reconcile these)

| # | Assumption | Why | If the other doc disagrees |
|---|---|---|---|
| A1 | `docs/GDD_OPENWORLD.md` and `docs/GDD_V2.md` did **not exist** when this was written. Region data is therefore expressed as a **self-contained layer** (`RegionDef`, §2.1): Sisli Koru (levels 1–10, existing zone) gets concrete coordinates; later zones use zone *slots* `ow_z2..ow_z5` with suggested level bands and relative tile coordinates. | avoid blocking | Replace `zoneId`/`center` values in `data/regions.ts` only; nothing else changes |
| A2 | Roles Tank/Healer/DPS, 45 s + 90 s major cooldowns, stagger/poise bar (`Combat.addStagger`, already shipped), parry/riposte and PoE-style flasks are per ROADMAP P1a. This doc only supplies **feel numbers** (`weight` classes `parry`, `stagger_break`, `backstab`, §5.2) and flask **recipe placeholders** (§1.11-D). | stay consistent | Keep ids; retune numbers |
| A3 | New classes (Keşiş, Okçu, Paladin, Nekromant, Warlock; `GDD_CLASSES_V2.md`) reuse the KayKit 41-bone rig. Feel is therefore keyed by `weaponKind` multipliers (§5.3), not by class. | same rig, same clips | Add a row to `FEEL_WEAPON` |
| A4 | The profession called **"Yüzücü"** in the request means *hayvan yüzmek* (to skin an animal). Because "Yüzücü" also reads as "swimmer", the panel shows the subtitle "Hayvan Yüzme / Derici". Internal id `skin`. | disambiguate | Rename `name` in `PROFESSIONS` |
| A5 | The game has **no durability** (GDD_SYSTEMS §6.4). Tools never wear. | existing rule | — |
| A6 | **No player trading in v1** (GDD_SYSTEMS §7.5). Professions therefore have **no cap on how many a character learns**, and vendors sell tier 1–3 refined materials and tools so nobody is hard-blocked. When trading ships, add a cap of 2 gathering + 3 crafting. | self-sufficient solo play | — |
| A7 | P2P rooms are capped at 5 (party). Open-world PvP (§7) is **inside one room**: duels first; team skirmish uses a `pvp` room mode with up to 8 peers (`NET.MAX_PEERS` raised only for that mode). Cross-room PvP is impossible without servers. | netcode | Keep duel-only if the cap cannot move |
| A8 | Boar creature has no asset. `ow_boar` uses `itch/creatures/rhino.glb` at scale 0.5 (tinted); optional Blender package L-80 generates a real `boar` later. | asset gap | swap `model` only |
| A9 | `vfx-audio` ids needed by this GDD are listed in §8 package L-00b; unknown ids fail silently at runtime (ARCHITECTURE rule 2), so gameplay packages may reference them before they are implemented. | decoupling | — |
| A10 | Edits to **core-owned shared files** (`types/*`, `core/events.ts`, `core/Input.ts`, `core/Settings.ts`, `core/Engine.ts`, `entities/AnimController.ts`, `world/World.ts`) are all **append-only / tiny** and bundled in package **L-00** (tag `core`) so no feature package edits them. | ARCHITECTURE golden rule 1–2 | — |
| A11 | Region creature levels are rolled per camp (`levelRange`), exactly like Sisli Koru camps today. Region minibosses use `rank: 'miniboss'`, level = range max + 1. | consistent | — |
| A12 | Crafted gear tops out at **ilvl 60**, so it competes with open-world / normal-dungeon drops and never with Mythic+ loot (ilvl 61–93). | keep M+ the chase | — |

### 0.3 Shared conventions

* Distances in metres, time in seconds, tile = 4 m (`TILE_SIZE`). Percent values in data are fractions.
* Profession skill, tier, and tool tier are integers; **tier t covers skill `50(t−1)+1 … 50t`**.
* Colours: skill difficulty colours `orange #ff8000`, `yellow #ffd100`, `green #1eff00`, `grey #9d9d9d`; profession accent `wood #c8a070`, `mine #b0b8c8`, `herb #7adf7a`, `skin #d08a5a`, `smith #ff8a3a`, `alch #7fe0ff`, `leather #b0804a`, `tailor #d58bff`, `jewel #ffe14a`, `cook #ff9a6a`, `fish #6ab8ff`.
* New persisted fields use `CharacterSave.professions?` (optional ⇒ no save-version bump) and dotted keys in `CharacterSave.flags` (pattern already used by `Bounties.ts`).
* `Math.random()` only for cosmetics; yields, procs and skill-ups use the character's seeded `RNG` (`defaultRng` in `ItemGen`).

---

## 1. Gathering & Professions (Toplama ve Meslekler)

### 1.1 Profession list

| id | TR name (panel) | Kind | Tool (`toolKind`) | Source it works on | Station | Trainer NPC (§1.10) |
|---|---|---|---|---|---|---|
| `wood` | Oduncu | gather | Balta `axe` | trees (node) + **Kereste** refining | İş Tezgâhı `workbench` (variant `wood`) | Oduncu Kerem |
| `mine` | Madenci | gather | Kazma `pick` | ore veins (node) + **Eritme** refining | Ocak `forge` | Madenci Tolga |
| `herb` | Şifalı Ot | gather | Orak `sickle` | herbs and mushrooms (node) | — | Hatice Nine |
| `skin` | Yüzücü (Hayvan Yüzme / Derici) | gather | Yüzme Bıçağı `knife` | beast corpses + **Tabaklama** refining | İş Tezgâhı (variant `tannery`) | Derici Yusuf |
| `fish` | Balıkçılık *(optional, P3)* | gather | Olta `rod` | fishing spots | — | Aşçı Fatma |
| `smith` | Demircilik | craft | — | weapons, heavy armour, shields, tools | Ocak `forge` | Madenci Tolga |
| `alch` | Simya | craft | — | potions, elixirs, essences | Simya Masası `alchemy` | Hatice Nine |
| `leather` | Deri İşleme | craft | — | medium armour, belts, bows (new class) | İş Tezgâhı (variant `tannery`) | Derici Yusuf |
| `tailor` | Terzilik | craft | — | light armour, tomes, **Dokuma** refining | İş Tezgâhı (variant `loom`) | Terzi Ayşe |
| `jewel` | Kuyumculuk | craft | — | rings, amulets, wands, staves, gem polish | İş Tezgâhı (variant `jeweler`) | Kuyumcu Mehmet |
| `cook` | Yemek | craft | — | food buffs | Kamp Ateşi `cookfire` (town Han Bahçesi **and** open-world camps) | Aşçı Fatma |

`StationId = 'forge' | 'alchemy' | 'workbench' | 'cookfire'` (4 panel station kinds; `workbench` carries a `prof` in the panel data so one panel serves four variants).

### 1.2 Data shapes (new file `src/types/professions.ts`, plus appends)

```ts
import type { ItemCategory } from './items';
import type { Rarity } from './common';

export type ProfessionId = 'wood'|'mine'|'herb'|'skin'|'fish'|'smith'|'alch'|'leather'|'tailor'|'jewel'|'cook';
export type StationId = 'forge'|'alchemy'|'workbench'|'cookfire';
export type ToolKind = 'axe'|'pick'|'sickle'|'knife'|'rod';

export interface ProfessionDef {
  id: ProfessionId; name: string; subtitle?: string; kind: 'gather'|'craft';
  icon: string;                 // /assets/icons/*.svg (mapping in §1.9)
  color: string;                // accent, §0.3
  toolKind?: ToolKind; stations?: StationId[]; trainerNpc: string; desc: string;
}
export interface ProfessionSave { skill: number; tier: number }           // CharacterSave.professions?: Partial<Record<ProfessionId, ProfessionSave>>

export interface NodeTypeDef {
  id: string; name: string; prof: ProfessionId; tier: number;             // tier 1..6
  skillReq: number;             // min skill; orange band starts here
  model: string; scale: number; tint?: number; emissive?: number;
  depletedModel?: string; depletedScale?: number;
  gatherSec: number;            // base hold time at tool tier == node tier
  strikes: number;              // tool impacts during the hold (0 for herbs)
  respawnSec: number;           // personal respawn (PvE) / host respawn (shared nodes)
  yields: { id: string; min: number; max: number; chance?: number }[];   // chance default 1
  rare?: { id: string; chance: number; min?: number; max?: number; gold?: number }[];
  nodeLevel: number;            // for XP (xpMonster(nodeLevel))
  anim: 'chop'|'mine'|'pick'|'skin'|'fish';
}
export interface ToolDef { id: string; kind: ToolKind; tier: number; name: string; speedMult: number; rareBonus: number; yieldBonus: number; model: string }
export interface RecipeDef {
  id: string; prof: ProfessionId; station: StationId; tier: number; skillReq: number; name: string;
  inputs: { id: string; count: number }[];
  output: { id: string; count: number } | { gen: { category: ItemCategory | 'amulet' | 'ring'; ilvl: number; rarity: Rarity; forced?: string[] } };
  catalyst?: 'essence' | 'gem';          // optional extra input slot in the panel
  timeSec: number;                       // craft bar per item
  learn: 'auto' | string;                // 'auto' = known with the tier, else the id of the Tarif scroll
  gold?: number;                         // Zanaat ücreti (gold sink)
  xpMult?: number;
}
export interface SkinDef { tier: number; reqSkill: number; hide: string; meat?: boolean; rare?: { id: string; chance: number }[] }
```

Appends (package L-00): `CharacterSave.professions?: Partial<Record<ProfessionId, ProfessionSave>>`; `ItemInstance.craftedBy?: string`; `EnemyDef.skin?: SkinDef`; `EnemyDef.hitMaterial?: 'flesh'|'bone'|'metal'|'stone'|'goo'|'ghost'|'wood'`; `DungeonDef.nodes?: NodeSpawnDef[]`.

### 1.3 Skill tiers, learning, skill-ups

Skill ranges 1–300 in six tiers. A tier must be **learned** from the profession's trainer (gold + character level). Skill cannot exceed `cap = 50 × learnedTier`.

| Tier | TR | Skill | Needs char. level | Trainer fee (gold) | Tool tier needed for this tier's nodes | Typical content |
|---:|---|---|---:|---:|---:|---|
| 1 | Çırak | 1–50 | 1 | 0 (free) | 1 | Sisli Koru, Domuz/Kurt |
| 2 | Kalfa | 51–100 | 10 | 300 | 2 | Ayı, Haydut, Örümcek |
| 3 | Usta | 101–150 | 20 | 2,000 | 3 | Ork, Bataklık, Mezarlık |
| 4 | Ehil | 151–200 | 32 | 9,000 | 4 | Kar, Gergedan, Kor |
| 5 | Üstat | 201–250 | 44 | 35,000 | 5 | Ejderha Dişi |
| 6 | Kadim Usta | 251–300 | 55 | 100,000 | 6 | Kadim Koru, PvP maden |

**Tier start thresholds**: `TIER_START = [1, 41, 91, 141, 191, 241]`. Learning tier `t` needs: character level (table above), the gold fee, **and `skill ≥ TIER_START[t−1]`** (you must be within 10 of the previous cap, so tiers cannot be skipped). Nodes and recipes of tier `t` have `skillReq ≥ TIER_START[t−1]`, which makes the next tier's content usable ~10 points before the previous cap, so the skill ladder never has a dead zone.

**Skill-up chance** (used for gathering and crafting alike). `diff = skill − req` where `req` is the node's / recipe's `skillReq`:

| diff | Colour | Name | Skill-up chance | Rule |
|---|---|---|---:|---|
| < 0 | red (locked) | Kilitli | — | cannot gather/craft ("Oduncu 41 gerekli") |
| 0–14 | orange `#ff8000` | Zor | `1 − diff/60` (100% → 77%) | |
| 15–29 | yellow `#ffd100` | Orta | 75% → 52% | |
| 30–49 | green `#1eff00` | Kolay | 50% → 18% | |
| ≥ 50 | grey `#9d9d9d` | Önemsiz | 0% | still yields, no skill-up, no XP |

`skillUpChance(diff) = diff < 0 || diff >= 50 ? 0 : 1 - diff / 60`. `skillColor(diff): 'locked'|'orange'|'yellow'|'green'|'grey'` lives next to it in `data/professions.ts`.

When `skill == cap`, skill-up is suppressed and the toast says "Ustalık sınırına ulaştın – Zanaat Sokağı'ndaki eğitmene git." (once per session per profession). A skill-up toasts "Oduncu becerin 53'e yükseldi!" (`ui:toast` kind `success`), writes a green chat system line, plays `skill_unlock`, and emits `profession:skillUp {prof, skill}`.

Pacing target: with `1/(1 − diff/60)` the expected cost is ≈ 100 gathers (or crafts) per tier, ≈ 600 for skill 1→300 (≈ 60 min of pure hold time plus travel), spread over character levels 1–55: a tier opens roughly every 10 levels, so players cannot rush ahead of their level.

### 1.4 Tools

Tools are `MaterialDef`s in the pouch (count 1, `kind: 'key'`), ids `tool_axe_1..6`, `tool_pick_1..6`, `tool_sickle_1..6`, `tool_knife_1..6`, `tool_rod_1..3`. The **highest tier owned per kind is used automatically**; no equip slot. Tools never wear (A5).

| Tier | Material | Name suffix (e.g. "… Balta") | `speedMult` (hold time ×) | `rareBonus` (added to rare-proc chance) | `yieldBonus` (+1 yield chance) | Source |
|---:|---|---|---:|---:|---:|---|
| 1 | bakır | Bakır | 1.00 | 0 | 0 | free from the trainer when the profession is first learned |
| 2 | demir | Demir | 0.90 | +0.005 | +0.05 | vendor 150 g **or** craft (Demircilik 41) |
| 3 | çelik | Çelik | 0.80 | +0.010 | +0.10 | vendor 1,500 g or craft (91) |
| 4 | gümüş uçlu | Gümüş Uçlu | 0.70 | +0.015 | +0.15 | vendor 8,000 g or craft (141) |
| 5 | ejder | Ejder Taşı | 0.60 | +0.020 | +0.20 | vendor 30,000 g or craft (191) |
| 6 | kadim | Kadim | 0.50 | +0.025 | +0.25 | vendor 80,000 g or craft (241) |

Rule: a node of tier `t` needs **tool tier ≥ t** *and* skill ≥ `skillReq`. Models: axe `kenney/survival-kit/tool-axe.glb` (tier ≥ 4: `tool-axe-upgraded.glb`), pick `tool-pickaxe(.glb|-upgraded.glb)`, sickle `tool-hoe(.glb|-upgraded.glb)`, knife `weapons/dagger.gltf`, rod `kenney/nature-kit` `canoe_paddle.glb` stand-in. Attach at `handslot.r` with the `blade` transform of `CharacterModel` (pos `[0, 0.033, 0]`, `rotY = π`), scale ≈ 2.6 for the Kenney tools (tune in `dev/player.html`).

### 1.5 Gather nodes

Model paths in the tables are relative to `/assets/models/` unless they start with `/`. `nodeLevel` for XP = tier midpoint level `[5, 15, 25, 38, 50, 58]`.

#### 1.5.1 Trees (`wood`, anim `chop`, nodeLevel = tier midpoint level `[5, 15, 25, 38, 50, 58]`)

| id | TR | T | skillReq | Model (scale) | gatherSec | strikes | respawnSec | Yield | Rare procs |
|---|---|---:|---:|---|---:|---:|---:|---|---|
| `tree_oak` | Meşe Ağacı | 1 | 1 | `gen/props/tree_oak_a.glb` (1.0) | 3.0 | 3 | 180 | `log_oak` 2–3 | `resin` 8%, **Kuş Yuvası** 3% (gold 3–8×level + 20% a grade-1 gem) |
| `tree_pine` | Çam Ağacı | 2 | 41 | `tree_pine_a.glb` (1.0) | 3.5 | 3 | 210 | `log_pine` 2–3 | `resin` 10%, Kuş Yuvası 3% |
| `tree_blackpine` | Kara Çam | 3 | 91 | `tree_pine_b.glb` (1.1) tint `0x4a5468` | 4.0 | 4 | 240 | `log_blackpine` 2–4 | `resin` 12%, Kuş Yuvası 3% |
| `tree_alder` | Kızılağaç | 4 | 141 | `tree_autumn.glb` (1.1) | 4.5 | 4 | 270 | `log_alder` 2–4 | `resin` 12%, **Bal Peteği** 3% (`pollen` ×2) |
| `tree_elder` | Yaşlı Meşe | 5 | 191 | `tree_oak_b.glb` (1.0) | 5.0 | 5 | 300 | `log_elder` 3–4 | `resin` 14%, Bal Peteği 4% |
| `tree_ancient` | Kadim Gövde | 6 | 241 | `tree_oak_b.glb` (1.35) tint `0x6ae0c0`, emissive `0x1a6050` ×0.4 | 6.0 | 6 | 360 | `log_ancient` 3–5 | `resin` 16%, **Kadim Özsu** 3% (`ancient_sap`), Bal Peteği 4% |

Depleted model for every tree: `town/decoration/nature/tree_single_A_cut.glb` scaled ×4 (a stump). Optional P2 proc: **Uyanan Ağaç** 1.5% on tiers ≥ 3 spawns two `proc_sapling` swarm enemies (enemies module, tier-scaled, 5 s after the fall).

#### 1.5.2 Ore veins (`mine`, anim `mine`, nodeLevel as trees)

Model = `gen/props/rock_medium.glb` (tiers 1–3) / `rock_large.glb` (tiers 4–6), tinted by ore, plus procedural emissive flecks (`world/NodeVisuals.makeOreNode`). **Rich vein** variant (6%): ×1.3 scale, ×2 yield, ×1.5 respawn, `gold_sparkle` loop, minimap dot brighter.

| id | TR | T | skillReq | Tint / emissive | gatherSec | strikes | respawnSec | Yield | Rare procs |
|---|---|---:|---:|---|---:|---:|---:|---|---|
| `ore_copper_node` | Bakır Damarı | 1 | 1 | `0xb87333` / `0x402010` | 3.5 | 3 | 240 | `ore_copper` 1–3 | `gem_*_1` 1.5% (random type) |
| `ore_iron_node` | Demir Damarı | 2 | 41 | `0x8a8f9a` / `0x202428` | 4.0 | 4 | 270 | `ore_iron` 1–3, `coal` 25% ×1–2 | gem g1 2% |
| `ore_silver_node` | Gümüş Damarı | 3 | 91 | `0xd8e0f0` / `0x304060` | 4.5 | 4 | 300 | `ore_silver` 1–2, `coal` 20% | gem g2 3%, **Gümüş Külçesi** (gold 20×level) 2% |
| `ore_gold_node` | Altın Damarı | 4 | 141 | `0xffd24a` / `0x604010` | 5.0 | 5 | 330 | `ore_gold` 1–2 | gem g3 4%, Altın Külçesi (gold 40×level) 2% |
| `ore_dragon_node` | Ejder Taşı Damarı | 5 | 191 | `0xd04a2a` / `0x801808` | 6.0 | 5 | 420 | `ore_dragon` 1–2, `coal` 20% | gem g4 5%, `ember_core` 2% |
| `ore_ancient_node` | Kadim Kristal Damarı | 6 | 241 | `0x9a60ff` / `0x4020a0` (model `gen/props/crystal_purple.glb` ×1.3) | 7.0 | 6 | 600 | `ore_ancient` 1–2 | gem g5 2%, **Kadim Kalp Parçası** 1% (`ancient_heart`) |

Depleted: the rock model with scale ×0.45 and tint darkened ×0.5 (`NodeTypeDef.depletedScale 0.45`).

#### 1.5.3 Herbs and mushrooms (`herb`, anim `pick`, `strikes 0`)

| id | TR | T | skillReq | Model (scale ×4 kit already) | gatherSec | respawnSec | Yield | Rare procs |
|---|---|---:|---:|---|---:|---:|---|---|
| `herb_daisy_node` | Ak Papatya | 1 | 1 | `kenney/nature-kit/flower_yellowA.glb` (×4) | 1.5 | 90 | `herb_daisy` 1–2 | `pollen` 4% |
| `shroom_tan_node` | Kahverengi Mantar | 1 | 1 | `mushroom_tanGroup.glb` (×4) | 1.5 | 90 | `shroom_tan` 1–3 | `pollen` 3% |
| `herb_sage_node` | Adaçayı | 2 | 41 | `plant_bushSmall.glb` (×4) tint `0x8fb08a` | 1.8 | 105 | `herb_sage` 1–2 | `pollen` 4% |
| `shroom_red_node` | Zehirli Mantar | 2 | 46 | `mushroom_redGroup.glb` (×4) | 1.8 | 105 | `shroom_red` 1–2 | `pollen` 4% |
| `herb_wolfsbane_node` | Kurt Otu | 3 | 91 | `flower_purpleA.glb` (×4) | 2.0 | 120 | `herb_wolfsbane` 1–2 | `pollen` 5%; found only in **Kurt Ormanı**, **Kar Kurtları** |
| `herb_dragontongue_node` | Ejder Dili | 4 | 141 | `flower_redC.glb` (×4) tint `0xff8a30`, emissive `0x601800` ×0.3 | 2.2 | 150 | `herb_dragontongue` 1–2 | `pollen` 5% |
| `herb_moonviolet_node` | Ay Menekşesi | 5 | 191 | `flower_purpleB.glb` (×4) emissive `0x6060ff` ×0.5 | 2.4 | 180 | `herb_moonviolet` 1–2 | `pollen` 6%; only glows/spawns at **night** if a day cycle exists, otherwise always |
| `herb_lotus_node` | Kadim Nilüfer | 6 | 241 | `town/decoration/nature/waterplant_C.glb` (×8) emissive `0x30ffc0` ×0.6 | 3.0 | 240 | `herb_lotus` 1–2 | `pollen` 7%, **Hayat Çiçeği** 1% (`ancient_heart`) |

Herbs never need a tool (hand-picked). With an `Orak` they gain the tool's `speedMult`, `yieldBonus`, `rareBonus`; tier ≥ 3 herbs require sickle tier ≥ tier − 1 so the sickle still matters.

#### 1.5.4 Skinning (`skin`, anim `skin`)

A killed beast gives a **Carcass** interactable at its corpse position for **25 s** (local to the killer's client; separate entity, the corpse model fades normally after `FEEL.corpseLifetime`). `EnemyDef.skin` defines it. Families that get `skin`: `beast` (boar, wolf, bear, rhino, mammoth, deer, rat), `spider` (spider, centipede, wasp: chitin `hide_*` replaced by `spider_silk`/`spider_venom`).

`reqSkill = max(1, (creatureLevel − 5) × 5)` (level 1–6 → 1, level 10 → 25, level 20 → 75, level 40 → 175, level 60 → 275); hide tier = by creature level:

| Creature level | Tier | Hide | Tanned (Tabaklama) | Hold sec | Meat |
|---|---:|---|---|---:|---|
| 1–10 | 1 | `hide_scrap` Kırpıntı Deri | `leather_1` | 2.5 | `meat_raw` 1 (60%) |
| 11–20 | 2 | `hide_light` Hafif Deri | `leather_2` | 2.5 | `meat_raw` 1–2 |
| 21–30 | 3 | `hide_medium` Orta Deri | `leather_3` | 3.0 | 1–2 |
| 31–42 | 4 | `hide_heavy` Kalın Deri | `leather_4` | 3.0 | 2 (+`meat_prime` 20% on elites) |
| 43–54 | 5 | `hide_thick` Sert Deri | `leather_5` | 3.5 | 2 (+`meat_prime` 30%) |
| 55–60+ | 6 | `hide_ancient` Kadim Deri | `leather_6` | 4.0 | 2–3 (+`meat_prime` 40%) |

Yield: `hide` 1–2 (+1 with `yieldBonus`), elite ×2, miniboss ×3. Species rares (chance per skinning, minibosses 100% ×2): `wolf_fang` 10%, `wolf_pelt` 5%, `boar_tusk` 8%, `bear_claw` 8%, `bear_pelt` 4%, `spider_silk` 20%, `spider_venom` 8%, `rhino_horn` 6%, `mammoth_tusk` 6%. `skin` skill-ups follow §1.3 with `req = reqSkill`. Skinning XP ×0.5 (kills already pay XP).

#### 1.5.5 Fishing (optional, P3)

Fishing spots (`fish_spot` nodes on water decals in `bolge_bataklik` and any lake the world module adds): hold F opens a **bite timer** (0.8–3.0 s random), then a 0.6 s window to press F again (late = fish escapes, no cost). Anim: `Throw` (cast) → `1H_Ranged_Aiming` loop → `PickUp` (catch). Fish: `fish_trout` Alabalık (skill 1), `fish_carp` Sazan (41), `fish_catfish` Yayın (91), `fish_pike` Turna (191), `fish_ancient` Kadim Sazan (241). Fish are `cook` ingredients (§1.11-E uses `meat_raw`; fish substitute 1:1).

### 1.6 Interaction: hold F, progress bar, animation

**Interactable extension** (`entities/Interactable.ts`, append-only optional fields):

```ts
export interface Interactable {
  /* existing */ readonly interactPrompt: string; readonly interactRange: number;
  canInteract?(p: Player): boolean; interact(p: Player): void;
  /** NEW: > 0 means "hold F for this many seconds" instead of a press. */
  holdSeconds?: number;
  /** NEW: called once when the hold starts; return false to refuse (locked skill etc.; the node toasts the reason). */
  holdStart?(p: Player): boolean;
  /** NEW: per frame while holding, t01 = progress 0..1. Nodes use it for strike wobble / particles. */
  holdTick?(p: Player, t01: number, dt: number): void;
  holdCancel?(p: Player, t01: number): void;
  /** NEW: HUD label + colour of the bar, e.g. { label: 'Meşe Ağacı kesiliyor', color: '#c8a070', tag: 'Zor' }. */
  holdInfo?(p: Player): { label: string; color: string; tag?: string; tagColor?: string };
}
```

**`PlayerController.updateInteract`** (player module): if `nearest.holdSeconds > 0`, a press of `interact` does nothing; instead

1. `input.down('interact')` for ≥ 0.12 s (debounce) and `p.canAct()` → call `holdStart`; if it returns true begin the hold; `time = holdSeconds`.
2. Each frame: `t01 += dt / holdSeconds`; call `holdTick`; emit `gather:progress {id, t01, label, color, tag, tagColor}` (HUD bar).
3. **Cancel** (`holdCancel`, bar disappears, no cost, soft `ui_error` at < 0.5 s lost only if t01 > 0.3) when: F released; movement input magnitude > 0.25 for > 0.08 s (camera orbit does **not** cancel); dodge/jump/skill pressed; the player takes damage ≥ 1% max HP; target out of range (`interactRange + radius`); player dies; scene leaves.
4. At `t01 ≥ 1` call `interact(p)` (the node resolves yields), emit `gather:done {id, ok}`, stop the anim.
5. While holding: face the node (turn rate 720°/s), `camera.setAssist(yawToNode, 1.2)` (gentle; yields to manual orbit as today), movement locked, **vulnerable** (no invulnerability).

**Animation per kind** (all clips exist on the KayKit rig, `docs/assets/characters.md` §1.3). The tool GLB is attached to `handslot.r` for the duration (`Player.showToolModel(url, scale)` / `hideToolModel()`; the equipped weapon nodes are hidden then restored with `refreshEquipmentVisuals()`).

| Kind | Clip | Cycle | Impact frame | Per-strike effects |
|---|---|---|---|---|
| `chop` (wood) | `1H_Melee_Attack_Chop` (1.067 s, `speed = 1.067 / cycle`) | `cycle = gatherSec_eff / strikes` clamped to ≥ 0.75 s | normalised 0.42 → impact at `0.42 × cycle` | `hit_blunt` pitch 0.9, `hit_spark` colour `0xc8a070` ×0.5 + chip particles, node wobble ±1.5° / squash 3% for 0.12 s, `camera:shake {0.03, 0.1}`; **last strike** the tree falls: rotate 90° about its base in 0.8 s (ease-in), `dodge_dust` + `land` sfx, `camera:shake {0.12, 0.25}`, leaf burst, swap to stump |
| `mine` (ore) | `2H_Melee_Attack_Chop` (1.633 s, hit 0.45) | cycle ≥ 1.1 s | 0.45 | `hit_metal`, `hit_spark` colour = ore tint ×0.8 (count 8), `block_spark`, node jitter, `camera:shake {0.04, 0.1}`; **last strike** vein shatters into 5 instanced rock chunks (physics 0.8 s), `rubble` sfx, `camera:shake {0.10, 0.2}` |
| `pick` (herb) | `PickUp` (1.3 s) | one cycle = `gatherSec` (clip speed `1.3 / gatherSec`) | normalised 0.5 | plant scales to 0 in 0.25 s, small green `heal_burst`, `item_pickup` sfx |
| `skin` | `Interact` (1.3 s) looped | cycle 1.3 | 0.5 | `hit_flesh` (volume 0.5), tiny `hit_blood` ×0.4 |
| `fish` | `Throw` → `1H_Ranged_Aiming` | see §1.5.5 | — | `water_impact` |

`gatherSec_eff = gatherSec × tool.speedMult` for the best tool; clamp to ≥ 0.5 × `gatherSec`. `strikes_eff = max(2, round(gatherSec_eff / 1.0))` for wood and `max(2, round(gatherSec_eff / 1.2))` for ore, so the hit count scales with tool speed.

**HUD** (hud module): new widget `GatherBar` (`src/ui/hud/GatherBar.ts`): centre-bottom at 62% of the view height, 240 px wide, 14 px tall, Metin2-style stone frame, fill colour = profession accent, left label "Meşe Ağacı kesiliyor…", right tag "Zor" in the skill colour, remaining-seconds text. Fades in 0.1 s, out 0.15 s. After completion: yield lines come from the existing `loot:pickedUp {material}` event ("+3 Meşe Kütüğü"); a rare proc adds a gold-bordered toast "Nadir Bulgu: Çam Reçinesi!" and `gold_sparkle` at the player.

**Prompt** text (via `interactPrompt`): "**Meşe Ağacı** – Kes [F basılı tut]  (Oduncu 12/50)". Locked node: red text "Oduncu 50 gerekli" / "Balta (Seviye 3) gerekli"; pressing/holding shows a toast and does not start. Depleted node: no prompt.

### 1.7 Respawn, yields, procs, XP

* **PvE nodes are personal**: depletion and respawn are local to each player (like personal loot), so five party members never fight over a tree. State: `GatherNode.depletedUntil` (epoch ms). To stop "zone hopping resets nodes", the pending respawns are saved in `CharacterSave.flags['gather.cd']` as a JSON string `{ "<nodeId>": <epochMs> }` (≤ 400 entries, expired entries pruned on scene load).
* **Respawn**: `respawnSec × U(0.9, 1.1)` seeded by `hashString(nodeId + ':' + depletionCount)`.
* **Yield count** = `randInt(min, max)`; `+1` with chance `min(0.35, tool.yieldBonus + 0.002 × clamp(skill − skillReq, 0, 100))`; rich vein ×2; **Bol Hasat** (2% on any node): ×2, `level_up` vfx ×0.4, toast "Bol Hasat!".
* **Rare proc chance** per entry: listed `chance + tool.rareBonus + 0.0003 × skill`, capped 0.5. Gem procs use the ore tier's gem grade.
* **Gather XP**: `xp = round(xpMonster(nodeLevel) × k × diffFactor)` with `xpMonster(L) = round(5 + 1.2 L^1.5)` (GDD_SYSTEMS §6.1), `k`: wood/ore 0.6, herb 0.5, skin 0.5×; `diffFactor` follows the §6.2 table using `nodeLevel` vs player level. Example: player level 5, oak: `xpMonster(5)=18 → 11 xp` (240 xp to level 2 ⇒ ~22 oaks). Grey nodes give 0 XP.
* **First-craft XP**: first time each recipe is crafted: `4 × xpMonster(craftIlvl)`; later crafts: `0.3 × xpMonster(craftIlvl)` for orange/yellow recipes, 0 for green/grey.
* **Bounties**: add templates `bounty_gather` ("Toplayıcı": gather 40 nodes) and `bounty_craft` ("Zanaatkâr": craft 8 items) to `systems/Bounties.ts` (items module, P2).

### 1.8 Mastery bonuses (why level a profession)

Passive stats folded in `StatCalc.computeStats` via `professionStats(save): StatBlock` (new in `systems/Professions.ts`):

| Profession | Bonus per 10 skill | Max at 300 |
|---|---|---|
| Oduncu | `maxHp` +4 | +120 |
| Madenci | `armor` +2 | +60 |
| Şifalı Ot | `hpRegen` +0.1/s and `potionPct` +0.002 | +3/s, +6% |
| Yüzücü | `critChance` +0.0004 | +1.2% |
| Balıkçılık | `goldFindPct` +0.002 | +6% |
| Crafters (smith/alch/leather/tailor/jewel/cook) | **Tasarruf**: `saveChance = 0.02 × floor(skill/50)` to **not consume** one random input stack per craft | 12% |

Specialisation branches (e.g. Demircilik → Silah Ustası / Zırh Ustası at skill 150) are a P3 option; not specified here.

### 1.9 Materials (all new `MaterialDef`s in `src/data/gatherMaterials.ts`, registered with the existing `add()` of `data/materials.ts`)

`kind: 'crafting'` unless noted; `maxStack 9999`. Sell price = vendor sell value; `buy` = `Zanaat Tüccarı` price (only tiers 1–3 are sold, §1.10). Icons use existing SVGs; missing glyphs fall back to `item-junk.svg` tinted with the CSS var `--tint` (asset package **L-81** adds `item-log`, `item-plank`, `item-leaf`, `item-flower`, `item-mushroom`, `item-pelt`, `item-leather`, `item-cloth`, `item-meat`, `item-fang`, `item-fish`, `item-bowl`).

| Group | ids (tier 1 → 6) | TR names | Icon | Rarity (T1…T6) | Sell (T1…T6) | `buy` |
|---|---|---|---|---|---|---|
| Logs | `log_oak` `log_pine` `log_blackpine` `log_alder` `log_elder` `log_ancient` | Meşe / Çam / Kara Çam / Kızılağaç / Yaşlı Meşe / Kadim Kütük | `item-log` | common, common, uncommon, uncommon, rare, epic | 2, 5, 12, 30, 80, 200 | — |
| Planks | `plank_oak` `plank_pine` `plank_blackpine` `plank_alder` `plank_elder` `plank_ancient` | … Kereste | `item-plank` | same | 5, 12, 30, 75, 200, 500 | 20, 48, 120 |
| Ores | `ore_copper` `ore_iron` `ore_silver` `ore_gold` `ore_dragon` `ore_ancient` | Bakır / Demir / Gümüş / Altın Cevheri, Ejder Taşı, Kadim Kristal | `item-ore` (tinted) | same | 2, 5, 12, 30, 80, 200 | — |
| Fuel | `coal` | Kömür | `item-ore` (black) | common | 3 | 12 |
| Ingots | `ingot_copper` `ingot_iron` `ingot_steel` `ingot_silver` `ingot_gold` `ingot_dragon` `ingot_ancient` | Bakır Külçe, Demir Külçe, Çelik Külçe, Gümüş Külçe, Altın Külçe, Ejder Külçesi, Kadim Külçe | `item-metal-bar` / `item-gold-bar` (gold) | common, common, uncommon, uncommon, rare, rare, epic | 5, 12, 25, 30, 75, 200, 500 | 20, 48, 100, 120 (copper, iron, steel, silver) |
| Herbs | `herb_daisy` `herb_sage` `herb_wolfsbane` `herb_dragontongue` `herb_moonviolet` `herb_lotus` | Ak Papatya, Adaçayı, Kurt Otu, Ejder Dili, Ay Menekşesi, Kadim Nilüfer | `item-flower` | common … epic | 2, 5, 12, 30, 80, 200 | — |
| Mushrooms | `shroom_tan` `shroom_red` | Kahverengi Mantar, Zehirli Mantar | `item-mushroom` | common | 2, 5 | — |
| Catalyst bits | `pollen` `resin` `ancient_sap` | Çiçek Tozu, Çam Reçinesi, Kadim Özsu | `item-crystal-shard` | uncommon, uncommon, epic | 8, 6, 150 | — |
| Hides (raw) | `hide_scrap` `hide_light` `hide_medium` `hide_heavy` `hide_thick` `hide_ancient` | Kırpıntı / Hafif / Orta / Kalın / Sert / Kadim Deri | `item-pelt` | common … epic | 2, 5, 12, 30, 80, 200 | — |
| Leather | `leather_1` … `leather_6` | İşlenmiş Deri, Sert Kösele, Kalın Kösele, Avcı Derisi, Ejder Köselesi, Kadim Kösele | `item-leather` | common … epic | 5, 12, 30, 75, 200, 500 | 20, 48, 120 |
| Fabric (raw) | `fabric_1` … `fabric_6` | Kumaş Parçası (Keten / Yün / İpek / Gece / Yıldız / Kadim) | `item-cloth` | common … epic | 2, 5, 12, 30, 80, 200 | — |
| Cloth | `cloth_1` … `cloth_6` | Keten Bezi, Yün Kumaş, İpek Kumaş, Gece İpeği, Yıldız İpeği, Kadim Dokuma | `item-cloth` | common … epic | 5, 12, 30, 75, 200, 500 | 20, 48, 120 |
| Meat | `meat_raw` `meat_prime` | Çiğ Et, Seçme Et | `item-meat` | common, uncommon | 3, 12 | — |
| Species | `wolf_fang` `wolf_pelt` `boar_tusk` `bear_claw` `bear_pelt` `orc_tusk` `bandit_badge` `spider_silk` `spider_venom` `bog_slime` `bone_dust` `rhino_horn` `mammoth_tusk` `frost_core` `ember_core` `ancient_heart` | Kurt Dişi, Kurt Postu, Yaban Domuzu Dişi, Ayı Pençesi, Ayı Postu, Ork Dişi, Haydut Rozeti, Örümcek İpeği, Zehir Bezi, Bataklık Balçığı, Kemik Tozu, Gergedan Boynuzu, Mamut Dişi, Buz Çekirdeği, Kor Çekirdeği, Kadim Kalp | `item-fang` / `item-pelt` / `item-crystal` | uncommon … epic | 15, 40, 20, 25, 60, 40, 30, 8, 30, 18, 6, 90, 150, 250, 250, 400 | — |
| Essences | `oz_guc` `oz_ceviklik` `oz_zeka` `oz_dayaniklilik` `oz_koruma` `oz_saldiri` `oz_hiz` `oz_can` | Güç / Çeviklik / Zeka / Dayanıklılık / Koruma / Saldırı / Hız / Can Özü | `item-efsun-orb` | rare | 120 | — |
| Tools | `tool_axe_1..6` `tool_pick_1..6` `tool_sickle_1..6` `tool_knife_1..6` `tool_rod_1..3` | see §1.4 | `item-axe` / `item-hammer` / `item-scythe` / `item-dagger` / `item-trinket` | by tier | 0 | §1.4 |
| Foods | `food_*` (§1.11-E) | see table | `item-bowl` | common … epic | 6, 12, 25, 60, 120, 300 | — |
| Tarif scrolls | `tarif_*` (§1.11-G) | "Tarif: <name>" | `item-scroll-tied` | rare | 0 | — |

Non-gathering drop sources (added to `data/loot.ts` rows by the items module, package L-07): humanoids (goblin, bandit, orc, cultist, KayKit humans) drop `fabric_<tier by level>` 15% (×1 per kill, ×2 on elites); skeletons `bone_dust` 25%; fire elementals/imps `ember_core` 6%; frost family `frost_core` 6%; oozes/slimes `bog_slime` 12%; wolves/boars/bears/orcs species mats as §1.5.4 and §2.3 (skinning **or** 25% of that chance from plain looting).

### 1.10 Stations, trainers, vendor (town: Kuzgunkale `data/town.ts`)

All coordinates are suggestions: nudge by ≤ 2 m if they overlap an existing prop/NPC and verify in `dev/world.html`. Prop models are existing assets.

| id | Name (TR) | Kind | Prop (`/assets/models/…`) | Pos (x, z) | Panel opened / notes |
|---|---|---|---|---|---|
| `st_forge` | Ocak | station `forge` | `gen/props/forge.glb` + `gen/props/anvil.glb` at (28.5, −10.5) | (30, −12) rot 180 | `crafting {station:'forge'}` (Demircilik + Madenci Eritme). Flame flares on craft (`torch_fire` ×1.6 for 1 s). |
| `st_wood` | İş Tezgâhı (Marangoz) | station `workbench`, prof `wood` | `kenney/survival-kit/workbench.glb` ×3 | (38, −13) | `crafting {station:'workbench', prof:'wood'}` (Kereste) |
| `st_tannery` | Tabakhane | `workbench`, prof `skin`/`leather` | `kenney/survival-kit/workbench-grind.glb` ×3 + `bucket.glb` | (44, −6) | panel with tabs Tabaklama (skin) + Deri İşleme (leather) |
| `st_loom` | Dokuma Tezgâhı | `workbench`, prof `tailor` | `kenney/fantasy-town-kit/stall-green.glb`-style stand-in ×2 (any stall) | (46, 3) | Dokuma + Terzilik |
| `st_jeweler` | Kuyumcu Tezgâhı | `workbench`, prof `jewel` | `workbench-grind.glb` ×3 + `gen/props/crystal_blue.glb` ×0.5 | (40, 11) | Kuyumculuk + Taş Parlatma |
| `st_alchemy` | Simya Masası | station `alchemy` | `gen/props/alchemy_table.glb` | (−27, 7) rot 90 | `crafting {station:'alchemy'}`; green `heal_burst` puff per craft |
| `st_cookfire` | Kamp Ateşi | station `cookfire` | `gen/props/campfire.glb` + `gen/props/cauldron.glb` | (28, 36) (Han Bahçesi); **also every region camp** (§2) | `crafting {station:'cookfire'}`; while standing within 6 m **resting** doubles HP regen |

Implementation shape: stations are `PanelProp` interactables (existing class) with `panel: 'crafting'`, `data: { station, prof? }`, `prompt: 'Ocak – Demircilik [F]'`, `interactRange 3.8` (`PanelPropOpts`). Region cookfires use the same class with `range 5`.

**Trainers** (`TownNpc` entries; role `'trainer'` already exists in `TownNpcRole`; `ui: { panel: 'professions', kind: '<prof id list>' }`):

| id | Name | Model | Teaches | Pos (x, z) rot | Idle / loop |
|---|---|---|---|---|---|
| `npc_prof_madenci` | Madenci Tolga | Barbarian, `1H_Axe` visible, tint `0x806858` | `mine`, `smith` | (32, −8) −90 | `Idle`; `2H_Melee_Attack_Chop` every 6 s |
| `npc_prof_oduncu` | Oduncu Kerem | Barbarian, `1H_Axe`, tint `0x7a6a40` | `wood` | (36, −16) 0 | `1H_Melee_Attack_Chop` every 4 s |
| `npc_prof_sifaci` | Hatice Nine | Mage (no hat, `1H_Wand`), tint `0x80b070` | `herb`, `alch` | (−27, 2) 90 | `Spellcasting` over the table every 8 s |
| `npc_prof_derici` | Derici Yusuf | Rogue_Hooded, no weapons, tint `0x906040` | `skin`, `leather` | (44, −10) 180 | `Interact` every 5 s |
| `npc_prof_terzi` | Terzi Ayşe | Mage, `Spellbook` only, tint `0xb070c0` | `tailor` | (48, 5) −90 | `Use_Item` every 7 s |
| `npc_prof_kuyumcu` | Kuyumcu Mehmet | Rogue (no cape), tint `0xc0a040` | `jewel` | (42, 13) 180 | `Interact` every 6 s |
| `npc_prof_asci` | Aşçı Fatma | Barbarian, `Mug`, tint `0xa06050` | `cook`, `fish` | (26, 38) 90 | `Use_Item` every 5 s |
| `npc_tradesman` | Zanaatkâr Osman | Knight (no helm, unarmed), tint `0x6a7a60` | **vendor** (`vendorEntries('tradesman')`) | (20, 12) 90 | `Idle` |

Trainer panel (`professions`, §1.13) shows only the professions the NPC teaches, with **Öğren** buttons: tier 1 free; higher tiers cost the §1.3 fee. Learning tier 1 also grants the tier-1 tool (`tool_*_1`) once.

**Vendor** (`Vendor.vendorEntries('tradesman')`, items module): tools T2–T6 (§1.4 prices), `plank_oak/pine/blackpine`, `leather_1..3`, `cloth_1..3`, `ingot_copper/iron/steel/silver`, `coal` (prices in §1.9 `buy`). Selling any gathering material to any vendor uses the sell column.

### 1.11 Recipes (≥ 268; ~100 explicit, 168 generated from families)

Notation: `N× id`. `req` = `skillReq`; every recipe gives skill-ups per §1.3 using its `req`. `timeSec` 2.0 unless stated. `learn: auto` means known as soon as the tier is learned. Recipe ids `rcp_*`. Output counts are per craft. Gold fee `—` means none.

#### A. Refining (belongs to the *gathering* professions, so gatherers have a crafting loop)

**Eritme** (`mine`, station `forge`, 7 recipes)

| id | Inputs | Output | req |
|---|---|---|---:|
| `rcp_smelt_copper` | 2× `ore_copper` | 1× `ingot_copper` | 1 |
| `rcp_smelt_iron` | 2× `ore_iron`, 1× `coal` | 1× `ingot_iron` | 41 |
| `rcp_smelt_steel` | 2× `ingot_iron`, 2× `coal` | 1× `ingot_steel` | 75 |
| `rcp_smelt_silver` | 2× `ore_silver` | 1× `ingot_silver` | 91 |
| `rcp_smelt_gold` | 2× `ore_gold` | 1× `ingot_gold` | 141 |
| `rcp_smelt_dragon` | 3× `ore_dragon`, 2× `coal` | 1× `ingot_dragon` | 191 |
| `rcp_smelt_ancient` | 3× `ore_ancient`, 1× `ingot_dragon` | 1× `ingot_ancient` | 241 |

**Kereste** (`wood`, station `workbench` variant `wood`, 6 recipes): `rcp_plank_<w>`: 2× `log_<w>` → 3× `plank_<w>`; req by tier `[1, 41, 91, 141, 191, 241]`; `<w>` = oak, pine, blackpine, alder, elder, ancient.

**Tabaklama** (`skin`, `workbench` variant `tannery`, 6 recipes): `rcp_tan_<t>`: 3× hide of tier t (`hide_scrap`, `hide_light`, `hide_medium`, `hide_heavy`, `hide_thick`, `hide_ancient`) → 1× `leather_<t>`; req `[1, 41, 91, 141, 191, 241]`.

**Dokuma** (`tailor`, `workbench` variant `loom`, 7 recipes): `rcp_weave_<t>`: 5× `fabric_<t>` → 1× `cloth_<t>`; req `[1, 41, 91, 141, 191, 241]`; plus `rcp_weave_silk`: 3× `spider_silk` → 1× `cloth_3`, req 91.

#### B. Gear families (generated by `genGearRecipes()` in `data/recipes.ts`)

**Tier parameters** (`TIER_START = [1, 41, 91, 141, 191, 241]`):

| T | `BASE_ILVL` | Rarity before proc | Smith main / accent ingot | Plank | Leather | Cloth | Rivet ingot (leather) | Jewel ingot / gem grade |
|---:|---:|---|---|---|---|---|---|---|
| 1 | 3 | uncommon | copper / — | `plank_oak` | `leather_1` | `cloth_1` | copper | copper / 1 |
| 2 | 14 | uncommon | iron / copper | `plank_pine` | `leather_2` | `cloth_2` | iron | copper / 1 |
| 3 | 25 | rare | steel / silver | `plank_blackpine` | `leather_3` | `cloth_3` | steel | silver / 2 |
| 4 | 36 | rare | steel / gold | `plank_alder` | `leather_4` | `cloth_4` | steel | gold / 3 |
| 5 | 47 | rare | dragon / gold | `plank_elder` | `leather_5` | `cloth_5` | dragon | gold / 4 |
| 6 | 56 | rare | ancient / dragon | `plank_ancient` | `leather_6` | `cloth_6` | ancient | dragon / 4 |

For a slot with offset `o` (below): `req = TIER_START[t−1] + o`, `ilvl = min(60, BASE_ILVL[t−1] + floor(o / 4))`, `requiredLevel = ilvl − 2` (existing rule), output base chosen by `ItemGen.pickBase(ilvl, {category, classId, smart: false})` so the base tier follows the existing `TIER_MIN_ILVL = [1, 15, 30, 45, 70]`. `timeSec = 2.0 + 0.5 × o/20`. **Gold fee** = `round(ilvl × (5 + 3t))` (e.g. T6 ilvl 60 = 1,380 g). At tier 1 the accent count is added to the main count (no accent ingot).

**Demircilik** (`smith`, `forge`; heavy armour + 1H/2H weapons + shield; 10 slots × 6 tiers = 60)

| Slot / category | Offset `o` | Main ingot × | Accent ingot × | Plank × |
|---|---:|---:|---:|---:|
| `dagger` | 0 | 4 | 1 | 1 |
| `sword1h` | 2 | 6 | 2 | 1 |
| `helm` (heavy) | 4 | 5 | 1 | — |
| `boots` (heavy) | 6 | 5 | 1 | — |
| `gloves` (heavy) | 8 | 4 | 1 | — |
| `shoulders` (heavy) | 10 | 6 | 1 | — |
| `shield` | 12 | 8 | 2 | 2 |
| `legs` (heavy) | 14 | 8 | 2 | — |
| `axe2h` | 17 | 10 | 3 | 2 |
| `chest` (heavy) | 20 | 10 | 3 | — |

**Deri İşleme** (`leather`, `workbench` variant `tannery`; medium armour; 7 slots × 6 = 42): inputs = N× `leather_t` + R× rivet ingot.

| Slot | `o` | Leather × | Rivet × |
|---|---:|---:|---:|
| `gloves` (medium) | 0 | 3 | 1 |
| `boots` | 3 | 4 | 1 |
| `helm` | 6 | 4 | 1 |
| `shoulders` | 9 | 5 | 1 |
| `belt` | 12 | 3 | 1 |
| `legs` | 15 | 7 | 2 |
| `chest` | 20 | 9 | 2 |

**Terzilik** (`tailor`, `workbench` variant `loom`; light armour + tome; 7 slots × 6 = 42): inputs = N× `cloth_t` + A× `leather_t` (trim).

| Slot | `o` | Cloth × | Leather trim × |
|---|---:|---:|---:|
| `gloves` (light) | 0 | 3 | 1 |
| `boots` | 3 | 3 | 1 |
| `helm` | 6 | 4 | 1 |
| `shoulders` | 9 | 4 | 1 |
| `legs` | 13 | 6 | 1 |
| `tome` | 16 | 5 | 2 |
| `chest` | 20 | 8 | 2 |

**Kuyumculuk** (`jewel`, `workbench` variant `jeweler`; 4 slots × 6 = 24; **catalyst slot = gem**, §1.12):

| Slot | `o` | Jewel ingot × | Gem × (grade from table) | Other |
|---|---:|---:|---:|---|
| `ring` | 0 | 2 | 1 | — |
| `amulet` | 6 | 3 | 1 | 1× `leather_t` cord |
| `wand` | 12 | 1 | 2 | 1× plank (tier plank) |
| `staff` | 20 | 2 | 3 | 3× plank |

Gem input id: the player picks any of the 6 gem types at grade `g` (`gem_<type>_<g>`; types `ruby emerald sapphire topaz amethyst diamond`). The chosen **type** is the catalyst (it biases one affix, §1.12).

**New class gear (rows added when `GDD_CLASSES_V2` lands; data only)**: `GEAR_FAMILIES` is a plain array of `{prof, category, offset, main, accent, extra[]}`; add `mace` (smith, o 3, 6/2 + plank 1), `crossbow` (smith, o 10, 4/1 + plank 4 + leather 1), `bow` (**leather**, o 10, leather 3 + plank 3), `quiver` (leather, o 5, leather 3), `sword2h` (smith, o 17, 9/3 + plank 1), `axe1h` (smith, o 3, 5/1 + plank 1). No logic change.

#### C. Tools (`smith`, `forge`, 20 recipes)

`rcp_tool_<kind>_<t>` for `kind ∈ {axe, pick, sickle, knife}` and `t ∈ 2..6`: inputs 4× main ingot of tier t (§B table) + (t ≥ 3: 1× accent ingot) + 1× tier plank + (`sickle`, `knife`: 1× tier leather); output `tool_<kind>_<t>`; `req = TIER_START[t−1] + {axe 0, pick 2, sickle 4, knife 6}`; `learn: auto`; gold none. (Tier 1 tools are free from the trainer.)

#### D. Simya (`alch`, station `alchemy`, 25 recipes + flask placeholders)

| id | Inputs | Output | req |
|---|---|---|---:|
| `rcp_pot_hp_1` | 2× `herb_daisy` | 2× `pot_hp_1` | 1 |
| `rcp_pot_hp_2` | 2× `herb_sage`, 1× `herb_daisy` | 2× `pot_hp_2` | 41 |
| `rcp_pot_hp_3` | 2× `herb_wolfsbane`, 1× `herb_sage` | 2× `pot_hp_3` | 91 |
| `rcp_pot_hp_4` | 2× `herb_dragontongue`, 1× `herb_wolfsbane` | 2× `pot_hp_4` | 141 |
| `rcp_pot_hp_5` | 2× `herb_moonviolet`, 1× `herb_lotus` | 2× `pot_hp_5` | 191 |
| `rcp_pot_res_1` | 1× `herb_daisy`, 1× `shroom_tan` | 2× `pot_res_1` | 5 |
| `rcp_pot_res_2` | 1× `herb_sage`, 2× `shroom_tan` | 2× `pot_res_2` | 45 |
| `rcp_pot_res_3` | 1× `herb_wolfsbane`, 2× `shroom_red` | 2× `pot_res_3` | 95 |
| `rcp_pot_res_4` | 2× `herb_dragontongue`, 1× `pollen` | 2× `pot_res_4` | 145 |
| `rcp_pot_res_5` | 2× `herb_moonviolet`, 2× `pollen` | 2× `pot_res_5` | 195 |
| `rcp_elx_swift` | 3× `herb_sage`, 2× `wolf_fang` | 1× `elixir_swiftness` | 60 |
| `rcp_elx_wisdom` | 4× `herb_sage`, 2× `pollen` | 1× `elixir_wisdom` | 70 |
| `rcp_elx_might` | 3× `herb_wolfsbane`, 1× `bear_claw` | 1× `elixir_might` | 100 |
| `rcp_elx_ironskin` | 3× `herb_wolfsbane`, 2× `boar_tusk` | 1× `elixir_ironskin` | 110 |
| `rcp_elx_vitality` | 3× `herb_dragontongue`, 1× `bog_slime` | 1× `elixir_vitality` | 150 |
| `rcp_elx_fortune` | 3× `herb_dragontongue`, 4× `pollen` | 1× `elixir_fortune` | 160 |
| `rcp_oz_guc` | 2× `herb_wolfsbane`, 1× `bear_claw` | 1× `oz_guc` | 100 |
| `rcp_oz_ceviklik` | 2× `herb_wolfsbane`, 1× `wolf_fang` | 1× `oz_ceviklik` | 100 |
| `rcp_oz_zeka` | 2× `herb_wolfsbane`, 1× `spider_venom` | 1× `oz_zeka` | 100 |
| `rcp_oz_dayaniklilik` | 2× `herb_wolfsbane`, 1× `boar_tusk` | 1× `oz_dayaniklilik` | 100 |
| `rcp_oz_koruma` | 2× `herb_wolfsbane`, 1× `orc_tusk` | 1× `oz_koruma` | 105 |
| `rcp_oz_saldiri` | 2× `herb_wolfsbane`, 1× `wolf_pelt` | 1× `oz_saldiri` | 105 |
| `rcp_oz_hiz` | 2× `herb_wolfsbane`, 3× `spider_silk` | 1× `oz_hiz` | 105 |
| `rcp_oz_can` | 2× `herb_wolfsbane`, 1× `bog_slime` | 1× `oz_can` | 110 |
| `rcp_alch_dust` | 5× `pollen` | 1× `buyulu_toz` | 60 |

Flask placeholders (PoE-style, ROADMAP P1a): after `GDD_V2` defines flask items, add `rcp_flask_<kind>_<t>` with inputs 3× herb of tier t + 1× `resin`; `timeSec 2.0`. Until then do **not** register them.

#### E. Yemek (`cook`, station `cookfire`; 12 recipes; foods are the new buff category `food` — one active at a time; durations tick in play time and persist through death)

Eating plays `Use_Item` (upper body, 1.6 s). Stat values are one affix-roll of the tier's content (§6.2): main-stat food gives **+X to the class's main stat and +X/2 `vit`**.

| id | Name | Inputs | req | Effect (X by tier `[5, 10, 17, 26, 33, 40]`) | Duration |
|---|---|---|---:|---|---:|
| `food_mantar_corbasi` | Mantar Çorbası | 2× `shroom_tan`, 1× `herb_daisy` | 1 | `hpRegen` +3, `potionPct` +0.05 | 30 min |
| `food_kizarmis_et` | Kızarmış Et | 2× `meat_raw`, 1× `herb_daisy` | 1 | main +5, `vit` +3 | 30 min |
| `food_kurt_kebabi` | Kurt Kebabı | 3× `meat_raw`, 1× `herb_sage` | 41 | main +10, `vit` +5 | 30 min |
| `food_adacayi_cayi` | Adaçayı Çayı | 2× `herb_sage`, 1× `pollen` | 41 | `resourceRegenPct` +0.12 | 30 min |
| `food_ayi_guveci` | Ayı Güveci | 3× `meat_raw`, 1× `herb_wolfsbane`, 1× `shroom_red` | 91 | main +17, `vit` +8 | 30 min |
| `food_kurtotu_tarhana` | Kurtotu Tarhanası | 2× `herb_wolfsbane`, 2× `shroom_tan`, 1× `pollen` | 91 | `xpPct` +0.10 (inactive in M+), `healReceivedPct` +0.05 | 30 min |
| `food_ejder_pilavi` | Ejder Dilli Pilav | 2× `meat_prime`, 2× `herb_dragontongue` | 141 | main +26, `vit` +13 | 45 min |
| `food_ag_helvasi` | Ağ Helvası | 2× `herb_dragontongue`, 2× `pollen`, 1× `spider_venom` | 141 | `cdr` +0.03, `moveSpeedPct` +0.04 | 45 min |
| `food_gergedan_biftek` | Gergedan Biftek | 3× `meat_prime`, 1× `herb_moonviolet` | 191 | main +33, `vit` +16 | 45 min |
| `food_menekse_serbeti` | Menekşe Şerbeti | 2× `herb_moonviolet`, 2× `pollen` | 191 | `magicFindPct` +0.12, `goldFindPct` +0.20 | 45 min |
| `food_kadim_ziyafet` | Kadim Ziyafet | 3× `meat_prime`, 1× `herb_lotus`, 1× `ancient_sap` | 241 | main +40, `vit` +20 | 60 min |
| `food_nilufer_serbeti` | Nilüfer Şerbeti | 2× `herb_lotus`, 2× `pollen` | 241 | `resAll` +0.06, `hpRegenPct` +0.004 | 60 min |

Food is stored as `flags['buff.food'] = JSON {id, left}`; `StatCalc` adds a sibling of `activeElixirs()` named `activeFood()`; the status bar shows a "Tok" icon (`buff-regen.svg`).

#### F. Taş Parlatma (`jewel`, `workbench` jeweler, 5 recipes; cheaper than the Demirci's combine of GDD_SYSTEMS §5.5)

`rcp_gem_polish_<g>` for `g = 1..5`: 2× `gem_<type>_<g>` (same type, player picks) + (g ≥ 2: 1× `buyulu_toz`) → 1× `gem_<type>_<g+1>`; req `[61, 101, 151, 201, 251]`; no gold. (Demirci still combines 3 gems → 1 for gold; this is the profession perk: 2 gems, no gold.)

#### G. Signature recipes (12; taught by **Tarif** scrolls dropped by region minibosses, §2.3)

Each is `learn: 'tarif_<boss>'`; first kill of that boss per character drops the scroll 100%, later kills 12%. Output rarity base `rare` with the §1.12 proc; the **forced affixes** are guaranteed (rolled in the best 2 tiers of the item's ilvl).

| Recipe id | Output | Prof / station | req | ilvl | Forced affixes | Inputs | Scroll (source) |
|---|---|---|---:|---:|---|---|---|
| `rcp_sig_kizil_dis` | Kızıl Diş Hançeri (dagger) | smith / forge | 16 | 6 | `pre_wpn_add_flat`, `suf_crit_chance` | 3× `boar_tusk`, 4× `ingot_copper`, 1× `plank_oak`, 1× `leather_1` | `tarif_kizil_dis` (Kızıl Diş) |
| `rcp_sig_gri_pence` | Gri Pençe Çizmeleri (medium boots) | leather / tannery | 46 | 16 | `suf_move_speed`, `suf_dodge` | 5× `leather_2`, 3× `wolf_pelt`, 2× `wolf_fang`, 1× `ingot_iron` | `tarif_gri_pence` |
| `rcp_sig_kara_pence` | Kara Pençe Eldivenleri (heavy gloves) | smith / forge | 56 | 20 | `pre_armor_local_pct`, `suf_str` | 4× `ingot_iron`, 3× `bear_claw`, 1× `bear_pelt`, 2× `leather_2` | `tarif_kara_pence` |
| `rcp_sig_haydut_kemer` | Haydut Reisi Kemeri (belt) | leather / tannery | 70 | 22 | `pre_hp_flat`, `suf_gold_find` | 4× `leather_2`, 3× `ingot_copper`, 3× `bandit_badge` | `tarif_demirdis` (Demirdiş) |
| `rcp_sig_ag_ana` | Ağ Anası Kolyesi (amulet) | jewel / jeweler | 100 | 30 | `suf_cast_speed`, `pre_dmg_poison_pct` | 3× `ingot_silver`, 1× `gem_amethyst_2`, 4× `spider_silk`, 2× `spider_venom`, 1× `leather_3` | `tarif_ag_ana` |
| `rcp_sig_gor_baz` | Gor'Baz Baltası (axe2h) | smith / forge | 115 | 34 | `pre_wpn_dmg_pct`, `suf_stagger` | 8× `ingot_steel`, 2× `ingot_silver`, 2× `plank_blackpine`, 3× `orc_tusk` | `tarif_gor_baz` |
| `rcp_sig_curuk_sargi` | Çürük Sargı (cloth gloves) | tailor / loom | 130 | 34 | `suf_res_poison`, `suf_hp_regen` | 4× `cloth_3`, 4× `bog_slime`, 2× `herb_wolfsbane`, 1× `leather_3` | `tarif_curuk_ana` |
| `rcp_sig_gece_bekci` | Gece Bekçisi Kalkanı (shield) | smith / forge | 150 | 40 | `pre_block`, `suf_res_shadow` | 8× `ingot_steel`, 2× `ingot_gold`, 2× `plank_alder`, 5× `bone_dust` | `tarif_gece_bekci` |
| `rcp_sig_buzdis` | Buzdiş Asası (staff) | jewel / jeweler | 170 | 44 | `pre_dmg_frost_pct`, `suf_res_regen` | 3× `plank_alder`, 2× `ingot_gold`, 3× `gem_sapphire_3`, 2× `frost_core`, 1× `mammoth_tusk` | `tarif_ak_alfa` |
| `rcp_sig_tas_boynuz` | Taş Boynuz Zırhı (heavy chest) | smith / forge | 195 | 52 | `pre_thorns`, `suf_cc_reduction` | 10× `ingot_steel`, 3× `ingot_gold`, 3× `rhino_horn`, 2× `leather_4` | `tarif_tas_boynuz` |
| `rcp_sig_kor_yuzuk` | Kor Çekirdeği Yüzüğü (ring) | jewel / jeweler | 215 | 52 | `pre_dmg_fire_pct`, `suf_crit_damage` | 2× `ingot_gold`, 1× `gem_ruby_4`, 2× `ember_core` | `tarif_magma_kral` |
| `rcp_sig_kadim_kalp` | Kadim Kalp Kuşağı (belt) | leather / tannery | 261 | 60 | `pre_hp_pct`, `suf_potion` | 6× `leather_6`, 2× `ingot_ancient`, 1× `ancient_heart` | `tarif_kadim_ruh` |

### 1.12 Crafted gear: quality, affixes, and how it fits the ilvl / +N economy

**Pipeline** (`systems/Professions.craft()` → new `ItemGen.craftItem()`):

1. Validate: station panel context, learned, `skill ≥ req`, inputs present, gold, bag space (gear needs `freeBagSlots() ≥ 1`).
2. **Tasarruf**: with `saveChance` (§1.8) one random input stack of count ≥ 2 is reduced by 1 instead of fully consumed (never removes the last unit of a 1-count input).
3. Consume inputs + gold; run the craft bar `timeSec` (cancel = refund everything).
4. Roll rarity: base per tier table; **Ustalık proc** `p = clamp(0.04 + 0.003 × (skill − req), 0.04, 0.28)` → rarity +1 (cap `epic`). On a proc show "Ustalık Eseri!" (`upgrade_success` sfx, gold burst).
5. Build the item: `buildFromBase(pickBase(...), ilvl, rarity, rng, classId)`; then **forced affixes** (recipe `forced[]` + the catalyst's mapped affix, deduplicated) are applied by `forceAffixes(item, ids, rng)`: for each id replace one random non-locked affix of the same kind (prefix/suffix), or append if the rarity still has room, rolled with `rollAffixOf(def, ilvl, rng, { bestN: 2 })` (top 2 tiers allowed at that ilvl). Affix count never exceeds `RARITY_AFFIX_RULES`.
6. Set `item.craftedBy = G.character.save.name`, `bound` stays `false` (tradeable when trading exists).
7. Grant XP (§1.7), skill-up roll, `craft:done` event, chat system line with an item link.

**Catalyst mapping**

| Catalyst | Affix guaranteed | Allowed on |
|---|---|---|
| `oz_guc` / `oz_ceviklik` / `oz_zeka` / `oz_dayaniklilik` | `suf_str` / `suf_dex` / `suf_int` / `suf_vit` | armour, weapons, jewelry, belt |
| `oz_koruma` | armour: `pre_armor_local_pct`; shield: `pre_block`; jewelry: `suf_res_all` | armour, shield, jewelry |
| `oz_saldiri` | weapon: `pre_wpn_dmg_pct`; others: `pre_dmg_pct` | weapons, gloves, jewelry |
| `oz_hiz` | `suf_attack_speed`; on caster weapons / helm / tome: `suf_cast_speed` | weapons, gloves, helm (cast speed only), jewelry |
| `oz_can` | `pre_hp_flat` (chest/belt/amulet: `pre_hp_pct`) | armour, belt, jewelry |
| `gem_ruby_*` | `suf_str` (weapon: `pre_wpn_dmg_pct`) | jewelry/wand/staff recipes only |
| `gem_emerald_*` | `suf_dex` (weapon: `suf_crit_damage`) | same |
| `gem_sapphire_*` | `suf_int` (weapon: `suf_res_regen`) | same |
| `gem_topaz_*` | `suf_vit` (weapon: `suf_attack_speed`) | same |
| `gem_amethyst_*` | `pre_hp_flat` (weapon: `pre_life_steal`) | same |
| `gem_diamond_*` | `suf_res_all` (weapon: `pre_dmg_vs_elite_pct`) | same |

If the catalyst's affix is not legal for the slot (category list in `ITEM_AFFIXES`), the panel greys the catalyst and shows "Bu parçada kullanılamaz".

**How it fits the economy**

* **ilvl**: crafted gear is ilvl `3…60` (T1…T6), capped at 60 → exactly the open-world/normal-dungeon band (A12). It never replaces Mythic+/Kahramanlık loot (ilvl 61+). It *does* beat blue drops of the same ilvl because of the guaranteed best-tier forced line(s) and ≥ 5% epic proc.
* **Upgrades (+N)**: crafted items upgrade exactly like drops (rarity-based max: Büyülü +9, Nadir +12, Destansı +15). Because crafted items are not `bound`, an epic crafted ilvl-60 piece taken to +12 (ilvl-equivalent 85, §6.4) is a legitimate stepping stone to M+ — and is the **material sink** that makes Kara Demir / Büyülü Toz matter (smith items also salvage normally).
* **Efsun**: allowed; the forced affix is *not* protected unless the player spends an Efsun Kilidi (consistent with existing rules).
* **Gold**: gear recipes carry the gold fee (§1.11-B). Vendor sell value of crafted gear is `0.6 ×` the normal rarity formula (`craftedSellMult`) so crafting never prints gold; material sell prices are in §1.9.
* **Level gating**: `requiredLevel = ilvl − 2`; tier unlock levels (§1.3) are chosen so the gear of tier t becomes wearable about when tier t opens.
* **Sources/sinks per hour at the intended level**: a character gathering ~30 min/h yields ≈ 300–450 raw nodes' worth of materials; one tier's complete gear set (10 smith slots) costs ≈ 60 ingots ≈ 120 ore ≈ 45 nodes. A full set therefore takes ≈ 15–20 min of gathering plus crafting time: affordable, but stronger than leveling gear only if the player keeps gathering **in the matching region** (§2.3).

### 1.13 Profession UI

**`professions` panel** (panels-game, `src/ui/panels/game/professions.ts`; hotkey **P** = new `InputAction 'professions'`; also reachable from `gameMenu`)

* Left column: the 11 professions as rows: icon, name, `skill/cap` bar (accent colour; the part above the previous tier tinted), tier name ("Kalfa"), tool icon + tier.
* Right column for the selected profession: description, **tier ladder** (six rows: skill range, required level, fee, state `Öğrenildi` / `Öğren` / `Kilitli: Seviye 20`), **Ustalık Bonusları** (§1.8, current and next milestone), and for gatherers the **node list** of that profession with colour tags for the player's current skill ("Meşe Ağacı – Zor") and the regions they appear in.
* Opened from a trainer NPC: only that NPC's professions are listed and the **Öğren** buttons are enabled; opened with **P** elsewhere: read-only with the hint "Eğitmenle konuş (Zanaat Sokağı)".
* Toast + chat line when a milestone bonus unlocks.

**`crafting` panel** (panels-items, `src/ui/panels/items/CraftingPanel.ts`; `G.ui.openPanel('crafting', { station, prof? })`, ids appended to ARCHITECTURE "Panels")

* Header: profession name + skill bar + tool (if any); tabs when a station serves several professions (forge: Demircilik / Eritme; tannery: Tabaklama / Deri İşleme).
* Left: recipe list. Row = icon, name, colour dot by skill difficulty (§1.3), craftable count `(3)`; filter chips *Tümü · Yapılabilir · Silah · Zırh · Takı · Tüketilebilir · Malzeme*; text search; unlearned Tarif recipes hidden; locked rows shown red with "Gerekli: 91".
* Right: output preview (item tooltip with `Eşya Seviyesi 28 · Nadir`, expected affix lines "tahmini", forced lines marked ★), inputs list with owned/needed (red if short, hover shows where to get it: node/region), **catalyst slot** (drop an Öz or gem; hint text), gold fee, quantity stepper 1–20 (max craftable), **Yap** button (spacebar) and a progress bar `timeSec × qty`; **Hepsini Yap**.
* During the bar: `ForgeFx` (existing) anvil impact animation for forge; `Spellcasting` loop sound for alchemy; cancel on Esc (refunds the item in progress).
* Result strip: last 5 crafted items; shift-click an item inserts a chat link (§3.5).
* Bag integration: the pouch panel (`InventoryPanel`) gets a **Meslek** filter tab grouping materials by profession.

### 1.14 Net, save, anti-exploit

* **Saves**: `CharacterSave.professions`, tool counts in `materials`, `flags['gather.cd']` (JSON), `flags['buff.food']`, `flags['recipe.<tarif>'] = true`, `flags['region.<id>'] = true` (discovery), `flags['craft.first.<recipeId>'] = true`. No save-version bump (all optional/dotted).
* **PvE nodes/carcasses are local**: no net traffic. Yields use the character RNG.
* **Shared nodes** (PvP contested mine only, §7.6) are host-authoritative and reuse the existing `gate` channel with key `node:<id>` (`open:false` = depleted, host re-opens after respawn) — no new channel for gathering.
* **Anti-exploit**: respawn timers persisted (§1.7); at most 6 node completions per 10 s per player (a faster stream is impossible without cheating, drop extras silently); skill-up and yield rolls happen only inside `Professions.completeGather()` which re-checks range, tool tier and `depletedUntil`; crafting rolls only inside `craft()`; `craft()` refuses while `G.world?.localPlayer?.isDead`.

---

## 2. Regions with identity (Kimlikli Bölgeler: Kurt Ormanı, Ayı Mağaraları, …)

The open world is a set of **zones** (scenes; today only `sisli_koru`, levels 1–10, 200×200 m) and, inside each zone, **regions**: named circles with their own creature family, level band, gather nodes, region minibosses, drops, rest camp and banner. `GDD_OPENWORLD.md` (if it appears) owns zones, travel and map layout; this section is the **beast-region layer** on top (A1). A region is *a reason to travel*: you go to Kurt Ormanı for wolf pelts, Kurt Otu and the Gri Pençe tarif; to Ayı Mağaraları for iron, bear claws and Kara Pençe.

### 2.1 Data shape (`src/data/regions.ts`, content module)

```ts
export interface RegionDef {
  id: string;                      // 'bolge_kurt'
  kind: 'region' | 'spot';         // spot = small named place (existing camps); region = full identity
  name: string; subtitle: string;  // banner: title + "Seviye 4–8 • Kurt sürüleri"
  zoneId: string;                  // 'sisli_koru' | 'ow_z2' | 'ow_z3' | 'ow_z4' | 'ow_z5'  (A1)
  center: [number, number];        // tile coords inside the zone (4 m tiles)
  radius: number;                  // metres
  levelRange: [number, number];
  danger: 1 | 2 | 3 | 4 | 5;       // map marker / skull pips
  color: string;                   // banner + map accent
  camps: string[];                 // PackDef ids that belong to it (their levelRange is the region's)
  boss?: { enemyId: string; pos: [number, number]; level: number; respawnSec: number; tarif?: string };
  nodes: { type: string; count: number; where?: 'ring' | 'cluster' | 'edge' | 'center' }[];   // NodeTypeDef ids (§1.5)
  camp?: { pos: [number, number] };   // rest camp: campfire prop + cookfire station (§1.10)
  family: string[];                // 'beast' | 'spider' | …
  hooks: string[];                 // mechanic tags used by enemies/world (below)
  music?: string; ambientVfx?: string;
  pvp?: boolean;                   // §7 (only the contested mine)
}
```

* `RegionTracker` (scenes module, `src/scenes/RegionTracker.ts`) ticks every 0.25 s: finds the region (smallest radius wins, so spots beat regions) containing the local player, and on change emits `region:entered {id, name, subtitle, levelRange, danger}` / `region:left {id}` (new events, L-00) and `ui:zoneName {title, subtitle}` (existing banner). The subtitle text is tinted with the difficulty colour of the region's **mid level vs the player** (§2.2).
* **First discovery** (`flags['region.<id>']`): +XP `round(0.06 × xpToNext(playerLevel))` (none at level 60), toast "Yeni bölge keşfedildi: Kurt Ormanı", `quest_complete` sfx, map reveals the circle. Spots give 40% of that.
* **Map / minimap** (panels-game `map.ts`, hud `Minimap.ts`): region circles drawn with name + `Sv. a–b` in the difficulty colour, boss skull icon when `boss` exists, campfire icon for `camp`, gather-node dots by profession colour for professions the player has learned (toggle).
* **Kill counters** `flags['kills.<family>']` (+1 per kill, local) feed future Av Defteri titles (Kurt Avcısı = 100 wolves, Ayı Avcısı = 50 bears, Domuz Avcısı = 100 boars); P3.

### 2.2 Visible creature levels and difficulty colours

Every enemy nameplate, target frame and boss frame shows **"Sv. N"** coloured by difficulty against the local player. New pure helper `levelTier(mobLevel, playerLevel, rank)` in `src/ui/widgets/levelColor.ts` (hud module), replacing the 3-colour logic in `Nameplates.Plate.update`:

| `d = mob − player` | Tier | Colour | Text | Notes |
|---|---|---|---|---|
| ≤ −8 | `grey` | `#9d9d9d` | `Sv. 4` | no XP (GDD_SYSTEMS §6.2: 5%) |
| −7 … −3 | `green` | `#66dd55` | `Sv. 8` | reduced XP (−3 is still 100%) |
| −2 … +2 | `yellow` | `#ffe050` | `Sv. 12` | even fight |
| +3 … +4 | `orange` | `#ff9a3a` | `Sv. 15` | |
| +5 … +9 | `red` | `#ff4a3a` | `Sv. 19` | damage in ×(1 + 0.05 d) (cap ×1.5), damage out ×max(0.40, 1 − 0.06 d) |
| ≥ +10, **or** rank `boss`/`miniboss` with `d ≥ +3` | `skull` | `#ff2a2a` + `ui-skull.svg` icon | `Sv. ??` | tooltip "Seni tek vuruşta öldürebilir" |

```ts
export type LevelTier = 'grey' | 'green' | 'yellow' | 'orange' | 'red' | 'skull';
export function levelTier(mob: number, player: number, rank?: 'trash'|'elite'|'miniboss'|'boss'): LevelTier;
export const LEVEL_COLORS: Record<LevelTier, string>;
export function levelLabel(mob: number, tier: LevelTier): string;   // 'Sv. 12' | 'Sv. ??'
```

Display rules: plate order `[Sv. N] [Name] [rank icon]`; 11 px, 1 px black outline; elites/bosses keep their rank icon; target frame adds a second line "Tecrübe %80" (from `Progression.monsterXp` ratio) on hover; party members and players keep the gold level number (`#e8c46a`, "Sv. 60"). The same helper colours the region banner subtitle, map labels, and the **dungeon portal list** (`Önerilen Seviye`).

### 2.3 Region roster

Zone slots: **Z1 `sisli_koru`** (existing, levels 1–11), **Z2 `ow_z2`** (10–26), **Z3 `ow_z3`** (24–39), **Z4 `ow_z4`** (38–49), **Z5 `ow_z5`** (48–60). Z2–Z5 are placeholders (A1); `center` for them is a suggestion inside a 50×50-tile zone block.

| # | id | Region (TR) | Zone · centre (tiles) · r (m) | Levels | Danger | Boss (level, respawn) | Banner subtitle |
|---:|---|---|---|---|---:|---|---|
| 1 | `bolge_domuz` | **Yaban Domuzu Çayırı** | Z1 · (42, 5) · 14 | 1–4 | 1 | **Kızıl Diş** (5, 10 min) | Seviye 1–4 • Yaban domuzu sürüleri |
| 2 | `bolge_kurt` | **Kurt Ormanı** | Z1 · (5, 31) · 16 | 4–8 | 2 | **Gri Pençe** (9, 10 min) | Seviye 4–8 • Kurt sürüleri ve alfa |
| 3 | `bolge_ayi` | **Ayı Mağaraları** | Z1 · (46, 31) · 13 | 7–10 | 3 | **Kara Pençe** (11, 15 min) | Seviye 7–10 • Uyuyan ayılara dikkat |
| 4 | `bolge_haydut` | **Haydut Kampı** | Z2 · (14, 14) · 18 | 10–16 | 2 | **Demirdiş** (17, 10 min) | Seviye 10–16 • Yol kesenler |
| 5 | `bolge_orumcek` | **Örümcek Yuvası** | Z2 · (36, 16) · 16 | 14–20 | 3 | **Ağ Anası Karakurt** (21, 15 min) | Seviye 14–20 • Ağlara basma |
| 6 | `bolge_ork` | **Ork Kanyonu** | Z2 · (24, 38) · 20 | 18–25 | 3 | **Gor'Baz** (26, 15 min) | Seviye 18–25 • Savaş davulları |
| 7 | `bolge_bataklik` | **Zehirli Bataklık** | Z3 · (14, 14) · 20 | 24–30 | 3 | **Çürük Ana** (31, 15 min) | Seviye 24–30 • Zehir ve balçık |
| 8 | `bolge_mezarlik` | **Kadim Mezarlık** | Z3 · (36, 20) · 18 | 28–35 | 3 | **Gece Bekçisi** (36, 15 min) | Seviye 28–35 • Mezarlar uyanıyor |
| 9 | `bolge_kar` | **Kar Kurtları Yaylası** | Z3 · (24, 40) · 20 | 32–38 | 4 | **Ak Alfa Buzdiş** (39, 20 min) | Seviye 32–38 • Tipi ve don |
| 10 | `bolge_gergedan` | **Gergedan Düzü** | Z4 · (16, 16) · 22 | 38–44 | 4 | **Taş Boynuz** (45, 20 min) | Seviye 38–44 • Sürü kaçışı |
| 11 | `bolge_kor` | **Kızıl Kayalık** | Z4 · (36, 34) · 20 | 42–48 | 4 | **Magma Kral** (49, 20 min) | Seviye 42–48 • Lav ve kor |
| 12 | `bolge_ejder` | **Ejderha Dişi Dağları** | Z5 · (18, 18) · 22 | 48–55 | 5 | **Ejder Gözcüsü** (56, 30 min) | Seviye 48–55 • Ejder yuvası |
| 13 | `bolge_kadim` | **Kadim Koru** | Z5 · (34, 34) · 24 | 55–60 | 5 | **Kadim Ruh Ağacı** (60 world boss, 30 min) | Seviye 55–60 • Kadim olanın bahçesi |

Level bands overlap on purpose (each region spans 4–8 levels, neighbours overlap 1–3) so a player always has ≥ 2 sensible destinations, and the four normal dungeons (8–18, 18–28, 30–40, 42–52) stay competitive: the open world pays **~70% of dungeon XP/h** but needs no group; dungeons pay loot.

#### 2.3.1 Region details

Node counts are per region (placed by `scatterNodes(region, rng)`, §1.5 ids without the `_node` suffix where shown); `camp` = rest camp with `cookfire` + `campfire` prop at the listed offset; "Drops" lists additions to the creature `lootTable` and `skin` rare chances (§1.5.4). Hooks are tags the enemies/world modules implement (table after the roster).

| Region | Creatures (ids; §2.4/2.5) | Nodes | Drops / skin | Hooks | Camp |
|---|---|---|---|---|---|
| Yaban Domuzu Çayırı | `ow_boar`, `ow_piglet`, elite `ow_boar_tusker` | `herb_daisy` 6, `shroom_tan` 4, `tree_oak` 3 (edge), `ore_copper` 2 | `meat_raw`, `hide_scrap`, `boar_tusk` 8% (boss ×2); Tarif `tarif_kizil_dis` | `boar_charge`, `wall_daze` | (40, 2) |
| Kurt Ormanı | `ow_wolf`, `ow_wolf_black`, `mb_gri_pence` + howl adds | `tree_oak` 4, `tree_pine` 3, `herb_sage` 4, `herb_wolfsbane` 2 (signature), `ore_copper` 2, `ore_iron` 1 | `hide_scrap/light`, `wolf_fang` 10%, `wolf_pelt` 5% (boss 100%); `tarif_gri_pence` | `pack_flank`, `howl_adds` | (7, 27) |
| Ayı Mağaraları | `ow_bear`, `ow_bear_sleeping`, `ow_bear_cub`, `mb_kara_pence` | `ore_iron` 4, `ore_copper` 2, `ore_silver` 1 (rare), `tree_pine` 3, `shroom_red` 3, `herb_sage` 3 | `hide_light`, `meat_raw`, `bear_claw` 8%, `bear_pelt` 4%; `tarif_kara_pence` | `sleeping_ambush`, `roar_buff`, `hug_grab` | (44, 27) |
| Haydut Kampı | `bandit_cutthroat`, `bandit_archer`, `bandit_brute`, `bandit_hexer`, `mb_demirdis` | `tree_pine` 5, `tree_blackpine` 2, `ore_iron` 5, `ore_silver` 2, `herb_sage` 4, `herb_wolfsbane` 2, `shroom_red` 3 | `fabric_2` 15%, `bandit_badge` 8% (boss ×3), +50% gold; `tarif_demirdis` | `gold_thief`, `kite` | centre |
| Örümcek Yuvası | `spider_hunter`, `spiderling`, `spider_pale` (elite), `mb_ag_ana` | `herb_wolfsbane` 3, `shroom_red` 6, `shroom_tan` 3, `ore_iron` 3, `ore_silver` 3, `tree_pine` 2, `tree_blackpine` 3 | `spider_silk` 20%, `spider_venom` 8%; `tarif_ag_ana` | `web_zones`, `egg_sacs`, `poison_stack` | edge |
| Ork Kanyonu | `orc_raider`, `orc_shaman`, `warg_scout`, elite `orc_warbanner`, `mb_gor_baz` | `ore_iron` 6, `ore_silver` 4, `ore_gold` 1 (rare), `tree_blackpine` 3, `herb_wolfsbane` 2 | `orc_tusk` 8% (boss ×3), `fabric_3` 15%; `tarif_gor_baz` | `war_banner_aura`, `shaman_heal` | canyon mouth |
| Zehirli Bataklık | `bog_ooze` (+`bog_oozelet`), `bog_centipede`, `bog_wasp`, `mushroom_brute` (elite), `mb_curuk_ana` | `herb_wolfsbane` 5, `herb_dragontongue` 2 (rare), `shroom_red` 8, `shroom_tan` 4, `tree_alder` 2, fishing spots 3 (P3) | `bog_slime` 12%; `tarif_curuk_ana` | `poison_pools`, `burrow_ambush`, `ooze_split` | dry hill |
| Kadim Mezarlık | existing `skel_rattler`, `skel_minion`, `skel_archer`, `crypt_ghoul`, `crypt_wraith`, elite `skel_warrior`, `mb_gece_bekci` | `shroom_red` 4, `tree_blackpine` 4 (dead-tree model), `ore_silver` 3, `herb_wolfsbane` 2 | `bone_dust` 25%; `tarif_gece_bekci` | `graves_wake` (dormant bone piles, wake 6 m) | chapel ruin |
| Kar Kurtları Yaylası | `snow_wolf`, `frost_warg` (elite), `ice_mammoth` (elite), existing `snow_spider`, `mb_ak_alfa` | `herb_wolfsbane` 4, `herb_dragontongue` 2, `ore_silver` 3, `ore_gold` 3, `tree_blackpine` 3 (snow tint) | `wolf_pelt` 8%, `frost_core` 6% (elites), `mammoth_tusk` 6%; `tarif_ak_alfa` | `blizzard_pulse`, `chill_stacks` | ice hut |
| Gergedan Düzü | `rhino_charger`, `plains_warg`, `orc_raider` (reuse), elite `rhino_matriarch`, `mb_tas_boynuz` | `ore_gold` 5, `ore_silver` 3, `tree_alder` 4, `herb_dragontongue` 4, `herb_moonviolet` 1 | `rhino_horn` 6%, `meat_prime` 25%; `tarif_tas_boynuz` | `stampede_event`, `wall_daze` | stone circle |
| Kızıl Kayalık | existing `forge_goblin`, `flame_skull`, `forge_imp`, `lava_slime`, `forge_orc`, `magma_golem`, `mb_magma_kral` | `ore_gold` 4, `ore_dragon` 1 (rare), `herb_dragontongue` 5, `tree_alder` 2 (burnt model) | `ember_core` 6%; `tarif_magma_kral` | `lava_zones`, `volcanic_plume` | basalt ring |
| Ejderha Dişi Dağları | `mountain_golem` (elite), `drake_whelp`, `cliff_demon` (elite), `mb_ejder_gozcusu` | `ore_dragon` 6 (5% rich), `ore_gold` 3, `herb_moonviolet` 4, `herb_dragontongue` 3, `tree_elder` 3 | boss: `ejderha_pulu` ×3 + `ruh_tasi` ×1; whelps `ember_core` 4% | `dragon_breath`, `flying_dive` | wind-shelter |
| Kadim Koru | `ancient_treant` (elite), `shade_stag`, `mammoth_dark` (elite), `ancient_wisp`, world boss `wb_kadim_ruh` | `tree_ancient` 6, `ore_ancient` 3, `herb_lotus` 4, `herb_moonviolet` 3, `tree_elder` 3 | `ancient_heart` 1% from nodes, 40% boss; `tarif_kadim_ruh` | `ancient_pulse` (root-wave ring every 60 s), `root_slam` | glade stone |

**Hook definitions** (enemies / world implement; each is a few lines in `ai/abilities.ts` or `world/*`):

| Hook | Behaviour |
|---|---|
| `boar_charge` | `charge` ability: range 8, windup 0.7 s with a 7×1.4 m line telegraph, coef 1.2, knockback 1.5 m. |
| `wall_daze` | if a charging enemy hits a nav wall or tree collider it plays `Daze` for 2 s, takes ×1.25 damage (existing `Combat.checkWallSlam` pattern). |
| `pack_flank` | members of a wolf camp take different slots: 2 attack from the front, the rest circle to the player's back arc (±60° rear) before the first bite. |
| `howl_adds` | `Howl` cast 1.0–1.2 s, interruptible; summons 1 wolf (2 for the boss) at 70% HP; max 4 adds alive. |
| `sleeping_ambush` | `ai.dormant: true`, `wakeRange 6`; plays `Sleep`; wakes with `Wake` (1.5 s) and `Roar`. |
| `roar_buff` | self buff `empower` +20% damage for 8 s, cooldown 25 s, used at aggro. |
| `hug_grab` | boss ability: 0.9 s windup, grabs a player ≤ 3 m (forcedMove to the bear), 3 ticks of coef 0.8 over 1.5 s, throws (knockback 3 m); interruptible by stun. |
| `gold_thief` | on a successful hit steals `min(200, 2% of gold)` (min 5); the thief then flees (`ai.flee`) for 8 s; killing it drops the gold + 30%. If it escapes the gold is lost. |
| `kite` | ranged units keep 8–14 m (existing `ai.kite`). |
| `web_zones` / `egg_sacs` | `ZoneDef` kind `pool` (visual web decal) with slow 50% (existing `slow` status); egg sacs are `PackDef.dormant { kind: 'egg', wakeRadius: 5 }`. |
| `poison_stack` | bite applies `poison` stacks (existing status, max 10). |
| `war_banner_aura` | banner bearer emits an aura (`inspiring_aura` vfx): orcs within 12 m deal +15%; dies ⇒ aura ends. |
| `poison_pools` | `ZoneDef` `pool` with `hazard { coef: 0.3, interval: 1 }`. |
| `burrow_ambush` | `ai.dormant`; centipede `Burrow` after attacking, `Emerge` 4 m away after 2 s. |
| `blizzard_pulse` | every 90 s fog near/far 15/45 for 20 s (`scene.fog` tween) and all enemies +10% move speed. |
| `stampede_event` | every 4 min (host clock) a herd of 4 `rhino_charger` runs along a lane across the plain: 1.5 s dust-cloud telegraph line, coef 2.0, dodgeable; they dissolve at the lane end. |
| `lava_zones` / `volcanic_plume` | existing `ZoneDef` lava + `HazardDef` `lava_burst`. |
| `dragon_breath` | cone r 8, windup 1.0 s, coef 1.2 + burn. |
| `ancient_pulse` | ring expanding 0→24 m at 6 m/s, 2 m thick, coef 1.5, every 60 s, roll through it. |

#### 2.3.2 Creature stat rows for the three Sisli Koru regions (enemies module, `data/enemies.ts`, same `def()` helper style as the existing `ow_*` rows)

Common: `leash 40`, `forces 0`, `xp` default by rank, `skin` per §1.5.4 (tier from level), `hitMaterial 'flesh'`. Model paths relative to `/assets/models/`; clip names are the itch clean names. `hp`/`dmg` are multipliers over the level baseline (GDD_SYSTEMS §1.10).

| id | Name | Model · scale · variant | Role/rank | hp | dmg | speed | radius | aggro | Basic (name, range, windup, cd, coef, anim) | Abilities |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| `ow_boar` | Yaban Domuzu | `itch/creatures/rhino.glb` · 0.5 · tint `0x8a6a50`, hide node `Spear` | melee/trash | 1.1 | 0.8 | 6.0 | 0.7 | 8 | Dişleme, 2.2 m, 0.45 s, 1.8 s, 1.0, `Gore` | `ow_boar_charge` Hücum (range 8, windup 0.7, cd 8, coef 1.2, knockback 1.5, anim `Charge` looped, line 7×1.4) |
| `ow_piglet` | Domuz Yavrusu | rhino · 0.22 · tint `0xb08a6a` | swarm/trash | 0.3 | 0.4 | 7.5 | 0.35 | 8 | Dişleme, 1.6 m, 0.4 s, 1.4 s, 1.0, `Gore` | — |
| `ow_boar_tusker` | Azman Domuz | rhino · 0.62 · tint `0x5a4030` | melee/elite | 4 | 1.5 | 6.2 | 0.85 | 10 | Dişleme 1.2 coef | Hücum (as boar, coef 1.6), `ow_boar_stamp` Ezme (self_aoe r 3, windup 1.0, cd 10, coef 1.4, anim `Stamp`) |
| `mb_kizil_dis` | Kızıl Diş | rhino · 0.95 · tint `0xb04030` | melee/miniboss | 20 | 2.0 | 6.4 | 1.1 | 14 | Dişleme 1.4 coef | Hücum (range 10, coef 1.8, stun 0.8 s, `wall_daze`), Ezme (r 4, windup 1.2, coef 1.6), enrage <30%: speed +25% |
| `ow_wolf` | Kurt | `itch/creatures/wolf.glb` · 1.0 | melee/trash | 0.9 | 0.9 | 7.0 | 0.55 | 11 | Isırık, 2.0 m, 0.47 s, 1.5 s, 1.0, `Bite` | `ow_wolf_lunge` Atılma (range 6, windup 0.55, cd 6, coef 1.3, anim `Lunge`, 2.1 m dash), `ow_wolf_howl` Uluma (summon 1 `ow_wolf`, castTime 1.0, interruptible, cd 20, initial 5, anim `Howl`; only 1 in 4 wolves has it) |
| `ow_wolf_black` | Gece Kurdu | wolf · `visual.texture` `/assets/textures/itch/creatures/wolf_black.png` | melee/trash | 1.0 | 1.0 | 7.4 | 0.55 | 12 | as `ow_wolf` | as `ow_wolf` (level +1 inside the camp) |
| `mb_gri_pence` | Gri Pençe | `itch/creatures/warg.glb` · 1.25 · texture `warg_ash.png`, nodes `WargBody` + `WargMask` | melee/miniboss | 20 | 2.0 | 7.6 | 0.9 | 16 | Isırık, 2.6 m, 0.5 s, 1.4 s, 1.2, `Bite` | Atılma (coef 1.6, cd 5), Uluma (summon 2 `ow_wolf`, castTime 1.2, cd 18, initial 6), **Pençe Fırtınası** (3 bites × coef 0.7 within 1.4 s, cd 12); phase 2 at 30% HP: attack cooldowns ×0.7 |
| `ow_bear` | Boz Ayı | `itch/creatures/bear.glb` · 1.0 | tank/trash | 2.2 | 1.3 | 5.4 | 1.0 | 9 | Pençe, 2.8 m, 0.42 s, 2.0 s, 1.0, `Swipe` | `ow_bear_slam` Yer Çarpması (self_aoe r 3.5, windup 0.9, telegraph, cd 10, coef 1.8, knockback 2, anim `Slam`), `ow_bear_roar` Kükreme (self `empower` +20% 8 s, windup 0.9, cd 25, on aggro, anim `Roar`) |
| `ow_bear_sleeping` | Uyuyan Ayı | same def as `ow_bear` + `ai: { dormant: true, wakeRange: 6 }`, `anims.spawn: 'Wake'`, idle `Sleep` | tank/trash | 2.2 | 1.3 | 5.4 | 1.0 | 6 | as `ow_bear` | as `ow_bear` |
| `ow_bear_cub` | Ayı Yavrusu | bear · 0.45 | swarm/trash | 0.4 | 0.5 | 6.5 | 0.45 | 9 | Isırık, 1.6 m, 0.4 s, 1.5 s, 1.0, `Bite` | — |
| `mb_kara_pence` | Kara Pençe | bear · 1.3 · texture `bear_old.png` | tank/miniboss | 20 | 2.0 | 5.8 | 1.3 | 14 | Pençe 1.2 coef | Yer Çarpması (r 4.5, windup 1.1, cd 9, coef 2.2), **Sarılma** `hug_grab` (cd 14), Kükreme at 50% HP: summon 3 `ow_bear_cub` (castTime 1.5) + `empower` 10 s |

Camps added to `sisli_koru.ts` (use the existing `camp()` helper; positions in tiles):

| Camp id | Name | Centre | Radius (m) | Levels | Respawn | Members |
|---|---|---|---:|---|---:|---|
| `ow_c10` | Domuz Çayırı | (42, 5) | 14 | 1–4 | 60 s | `ow_boar` ×4, `ow_piglet` ×4 (+ `ow_boar_tusker` ×1, 30% chance per respawn) |
| `ow_c11` | Kurt İni | (5, 31) | 16 | 4–8 | 75 s | `ow_wolf` ×6, `ow_wolf_black` ×2 |
| `ow_c12` | Ayı Mağarası | (46, 31) | 13 | 7–10 | 90 s | `ow_bear` ×1, `ow_bear_sleeping` ×1, `ow_bear_cub` ×4 |

Boss placements (`BOSSES` array of the file): `mb_kizil_dis` at (42, 8), `mb_gri_pence` at (4, 33), `mb_kara_pence` at (47, 33); respawn per §2.3 (host clock), announced in chat (system line) and as a `ui:toast` kind `boss` ("Gri Pençe kurt sürüsünün başına geçti!"). Rank multipliers, stagger bar, loot and XP follow the existing `miniboss` rules (GDD_SYSTEMS §1.10, §7.1). Overlap check: `src/dev/contentCheck.ts` must assert that no camp circle overlaps another by > 25% (the three new camps were placed with ≥ 8 m clearance to `ow_c03/04/05/07/08`).

**Existing Sisli Koru camps become `spot` regions** (same positions/radii as the camps, banner = camp name, no boss): Fare Yuvası (`ow_c01`), Balçık Gölü (`ow_c02`: `herb_daisy` 4, `shroom_tan` 2), Yağmacı Kampı (`ow_c03`: `tree_oak` 2), Mantar Halkası (`ow_c04`: `shroom_tan` 6, `shroom_red` 3), Örümcek Korusu (`ow_c05`: `herb_sage` 2), Terk Edilmiş Köy (`ow_c06`: `tree_oak` 4, `herb_sage` 3), Yarasa Mağarası (`ow_c07`: `ore_copper` 2), Ork Karakolu (`ow_c08`: `ore_iron` 2, `ore_copper` 1), Kayıp Mezarlık (`ow_c09`: `shroom_red` 2), Çürük Höyük (boss arena `wb_curukkok`, r 24 m, banner "Çürük Höyük – Dünya Patronu").

#### 2.3.3 Rosters for regions 4–13 (enemies module; one package per region, template = §2.3.2)

`h/d` = hp/dmg multipliers. Ability tuple = `name (range m / windup s / cd s / coef)`.

| Region | id · name · model · scale · tint/texture | rank/role | h/d | speed | Signature abilities |
|---|---|---|---|---:|---|
| Haydut Kampı | `bandit_cutthroat` Haydut Hırsız · `characters/Rogue.glb` 1.0 · `0x6a4a3a`, show `Knife`+`Knife_Offhand` | trash/melee | 1.0 / 1.2 | 6.8 | basic `Dualwield_Melee_Attack_Slice` (2.2/0.4/1.6/1.0); `gold_thief` |
| | `bandit_archer` Haydut Okçu · `Rogue_Hooded` 1.0 · `0x4a3a2a`, `2H_Crossbow` | trash/ranged | 0.8 / 1.1 | 6.0 | bolt (16/0.8/2.4/1.0, `2H_Ranged_Shoot`), `kite [8,14]` |
| | `bandit_brute` Haydut Kabadayı · `Barbarian` 1.1 · `0x805030`, `2H_Axe` | trash/tank | 1.8 / 1.4 | 5.6 | `2H_Melee_Attack_Chop` (3.2/0.7/2.2/1.2), Savurma spin (r 3.2/1.0/10/1.4, telegraph) |
| | `bandit_hexer` Haydut Büyücü · `Mage` 1.0 · `0x4a3a2a`, `1H_Wand` | trash/caster | 0.9 / 1.2 | 5.0 | fire bolt (16/0.9/2.6/1.1), `kite` |
| | `mb_demirdis` Demirdiş · `Barbarian` 1.45 · `0xa06040`, `1H_Axe`+`Barbarian_Round_Shield` | miniboss/melee | 20 / 2.0 | 6.0 | Ezici Darbe (shield bash, 3/0.7/8/1.6, stun 1 s), Çağrı at 60% HP (summon 2 cutthroat + 2 archer, castTime 1.5), Duman Bombası (existing `stealth_smoke`, once at 40%) |
| Örümcek Yuvası | `spider_hunter` Orman Avcısı · `itch/creatures/spider.glb` 0.8 | trash/melee | 1.1 / 1.2 | 7.0 | Isırık (poison stack, 2.4/0.5/1.6/1.0), Atılma `Strike` (7/0.6/6/1.4), `WebSpit` (14/0.67/9/0.6 + slow 40% 3 s) |
| | `spiderling` Yavru Örümcek · spider 0.35 | swarm | 0.25 / 0.4 | 8.0 | Isırık (1.4/0.4/1.2/1.0), spawns from `egg_sacs` |
| | `spider_pale` Soluk Örümcek · spider 1.05 · texture `spider_pale.png` | elite/melee | 4 / 1.5 | 6.8 | WebSpit, Atılma (coef 1.6), Zehir Bulutu (`poison_cloud` r 3, windup 1.2, cd 12) |
| | `mb_ag_ana` Ağ Anası Karakurt · spider 1.7 · pale | miniboss/melee | 20 / 2.0 | 6.2 | Ağ Yağmuru (3 web zones r 3, slow 50% 8 s, cd 14), Yavru Çağrısı (4 egg sacs, hatch 4 s), Zehirli Diş (3 poison stacks) |
| Ork Kanyonu | `orc_raider` Ork Akıncı · `monsters/Orc.glb` 0.95 · `0x6a8a4a` | trash/melee | 1.6 / 1.3 | 5.8 | `Weapon` (2.6/0.45/2.0/1.1) |
| | `orc_shaman` Ork Şamanı · Orc 0.9 · `0x4a7a5a` | trash/healer | 1.0 / 1.0 | 5.2 | heal ally (castTime 2.0, 25% HP, interruptible), fire bolt (14/0.8/3/1.0) |
| | `warg_scout` Kanyon Kurdu · `itch/creatures/warg.glb` 0.9 (no mask) | trash/melee | 1.2 / 1.2 | 8.0 | Isırık, Atılma, Uluma |
| | `orc_warbanner` Bayraktar · Orc 1.15 + banner prop | elite/support | 4 / 1.3 | 5.4 | `war_banner_aura`, `Weapon` (coef 1.3) |
| | `mb_gor_baz` Gor'Baz · Orc 1.7 · `0x405a30` | miniboss/melee | 20 / 2.0 | 5.8 | Savaş Çığlığı (buff orcs +20% 10 s + fear 1.5 s on players ≤ 6 m, castTime 1.0), Zıplayan Ezici (leap r 4, 1.2/—/14/2.4), Satır Fırtınası (spin 3 ticks coef 0.9) |
| Zehirli Bataklık | `bog_ooze` Bataklık Balçığı · `itch/creatures/ooze.glb` 0.7 · texture `ooze_ochre.png` | trash/melee | 1.2 / 1.0 | 3.2 | `Lash` (2.6/0.67/2.0/1.0), `Spit` poison (14/0.7/8/0.8), splits into 2 `bog_oozelet` (0.35) |
| | `bog_centipede` · `itch/creatures/centipede.glb` 1.0 | trash/melee | 1.0 / 1.3 | 5.0 | Isırık poison (2.6/0.55/1.8/1.0), `burrow_ambush` |
| | `bog_wasp` · `itch/creatures/wasp.glb` 0.9 | swarm/flying | 0.4 / 0.7 | 7.0 | Sokma (2/0.6/1.8/1.0), Dalış (line 6, 0.9) |
| | `mushroom_brute` (existing gen model `gen/creatures/mushroom_brute.glb` 1.0) | elite/tank | 3.5 / 1.4 | 3.8 | Başla Çarpma (2.4/0.5/2.2/1.4), Spor Patlaması (`Cast` r 4 poison cloud, 1.2/—/12) |
| | `mb_curuk_ana` Çürük Ana · ooze 1.6 · `ooze_crimson.png` | miniboss/melee | 20 / 2.0 | 3.4 | Engulf (grab, 3 ticks 0.7), Bölünme at 50% (4 oozes), Asit Havuzu (3 `poison_pools` r 3) |
| Kadim Mezarlık | existing ids (levels 28–35): `skel_rattler`, `skel_minion`, `skel_archer`, `crypt_ghoul`, `crypt_wraith`, elite `skel_warrior`; `mb_gece_bekci` Gece Bekçisi · `enemies/Skeleton_Warrior.glb` 1.9 · `0x3a3a4a`, emissive `0x2a1a60` | miniboss/tank | 20 / 2.0 | 5.2 | Karanlık Dalga (cone r 9 90°, 1.2/—/10/2.0, shadow), Kemik Duvarı (summon 4 `skel_rattler`, castTime 1.5), Mezar Dirilişi (3 graves `Skeletons_Awaken_Floor`, 2 s) |
| Kar Kurtları | `snow_wolf` Kar Kurdu · wolf · texture `wolf_white.png` | trash/melee | 1.1 / 1.2 | 7.4 | Isırık + `chill` 1 stack, Atılma |
| | `frost_warg` Buz Wargı · warg 1.1 · texture `warg_black.png` tint `0xb0d8ff` | elite/melee | 4 / 1.5 | 7.8 | Isırık chill ×2, Uluma (2 snow wolves) |
| | `ice_mammoth` Buz Mamutu · `itch/creatures/mammoth.glb` 0.9 · `mammoth_dark.png` tint `0xb0d0ff` | elite/tank (ccImmune) | 7 / 1.8 | 5.0 | `Stomp` (self_aoe r 5, windup 1.3, cd 11, coef 2.0), `Charge` (line 12, windup 1.0, cd 14, coef 1.8, stun 1 s) |
| | `mb_ak_alfa` Ak Alfa Buzdiş · warg 1.5 · `warg_black.png` tint `0xe8f4ff` | miniboss/melee | 20 / 2.0 | 8.0 | Uluma (3 snow wolves), Don Isırığı (chill ×3 → freeze 1.5 s), Kar Fırtınası (ring from boss 0→12 m, coef 1.6, cd 16) |
| Gergedan Düzü | `rhino_charger` Düz Gergedanı · `itch/creatures/rhino.glb` 0.9 | trash/tank | 2.0 / 1.5 | 5.5 | `Gore` (3/0.5/2.0/1.2), Hücum (range 10, windup 0.9, coef 1.8, stun 1 s, `wall_daze`), Ezme |
| | `plains_warg` Bozkır Wargı · warg 1.0 · `warg.png` | trash/melee | 1.3 / 1.3 | 8.2 | as `warg_scout` |
| | `rhino_matriarch` Gergedan Ana · rhino 1.15 · tint `0x706050` | elite/tank | 5 / 1.8 | 5.4 | Hücum, Ezme (r 4), Sürü Çağrısı (2 chargers) |
| | `mb_tas_boynuz` Taş Boynuz · rhino 1.5, `Spear` node visible | miniboss/tank | 20 / 2.0 | 6.0 | Sürü Kaçışı (3 lanes 1.5 s telegraph, coef 2.5), Boynuz Darbesi (knockback 4), Daze after wall hit |
| Kızıl Kayalık | existing `forge_goblin`, `flame_skull`, `forge_imp`, `lava_slime`, `forge_orc`, `magma_golem` (levels 42–48); `mb_magma_kral` Magma Kral · `gen/creatures/elemental_fire.glb` 1.9 | miniboss/tank | 20 / 2.0 | 4.4 | Lav Dalgası (line 14×3, 1.4/—/9/2.4), Kor Yağmuru (4 meteors r 2.5, 1.5 s), Çekirdek Patlaması at 30% (r 7, 2 s telegraph, coef 3.0) |
| Ejderha Dişi | `mountain_golem` Dağ Golemi · `gen/creatures/golem_stone.glb` 1.0 | elite/tank (ccImmune) | 5 / 1.8 | 3.6 | Çift Yumruk (r 3.5/1.1/9/2.0), Fırlatma (rock projectile 16 m) |
| | `drake_whelp` Ejder Yavrusu · `monsters/Dragon_Evolved.glb` 0.55 · flying | trash/ranged | 1.4 / 1.5 | 7.0 | Ateş Nefesi (cone r 7, windup 1.0, cd 8, coef 1.2 + burn), Dalış |
| | `cliff_demon` Uçurum İblisi · `monsters/Demon.glb` 1.0 · `0x803020` | elite/melee | 4 / 1.7 | 6.0 | Alevli Pençe (3/0.5/2.0/1.5), Sıçrama |
| | `mb_ejder_gozcusu` Ejder Gözcüsü · Dragon_Evolved 1.3 | miniboss/melee flying | 20 / 2.0 | 8.0 | Ateş Nefesi (cone 14 m, 2 s channel, coef 0.5/tick), Kuyruk Savurma (r 6), Dalış (line), lands at 40% (ground phase) |
| Kadim Koru | `ancient_treant` Kadim Ağaç Bekçisi · `monsters/Giant.glb` 1.0 · `0x4a7a40` | elite/tank (ccImmune) | 6 / 2.0 | 3.8 | Kök Çarpması (r 4/1.1/10/2.2 + root 1.5 s), Dal Savurma (cone 100° 4 m) |
| | `shade_stag` Gölge Geyik · `itch/creatures/deer.glb` 0.9 · tint `0x302040`, emissive `0x201040` | trash/melee | 1.5 / 1.6 | 9.0 | `Attack` antler charge (line 9, windup 0.7, coef 1.5) |
| | `mammoth_dark` Kadim Mamut · mammoth 1.0 · `mammoth_dark.png` | elite/tank (ccImmune) | 8 / 2.0 | 5.2 | Stomp, Charge, `Trumpet` (summon 2 `shade_stag`) |
| | `ancient_wisp` · `monsters/Ghost.glb` 0.7 · tint `0x40ffd0` | trash/caster flying | 1.0 / 1.4 | 5.5 | Ruh Oku (16/0.9/2.5/1.2), drain |
| | `wb_kadim_ruh` Kadim Ruh Ağacı · procedural tree 7 m (`ai/procModels.ts`) | world boss | 100 / 2.5 | 0 | Kök Çarpması, `ancient_pulse`, Tohum Dalgası (adds: 6 `ancient_wisp`), enrage none; party 5 recommended; respawn 30 min |

Boss loot: each miniboss rolls the existing **Ara Patron** table (GDD_SYSTEMS §7.1: 100% ×2 items, +1 at 50%, ≥ 1 Nadir+, Ejderha Pulu 15%) at ilvl = level + 2 (cap 60), plus 2× its species rare mats, plus its **Tarif** (first kill 100%, then 12%). The world boss uses the **Patron** row (ilvl cap 60).

### 2.4 Summary of region/gathering identity

* Tier availability: each node tier appears in ≥ 3 regions and every region offers ≥ 2 tiers, so gathering never forces one location.
* **Signature nodes**: Kurt Otu (Kurt Ormanı, Bataklık, Kar), Ejder Dili (Bataklık, Gergedan, Kor, Ejderha), Ay Menekşesi (Gergedan, Ejderha, Kadim), Kadim Nilüfer + Kadim Kristal + Kadim Gövde (Kadim Koru only, PvP maden for the crystal), Ejder Taşı (Ejderha Dişi + Kızıl Kayalık rare + PvP maden).
* **Species mats** only drop in their region family (wolves/bears/boars/spiders/orcs/rhinos/mammoths), so Simya essences, signature recipes and Yemek foods each pull a player to a named place.
* Each region has a **rest camp** (campfire + cookfire; resting bonus within 6 m) and respawn rules inherited from `PackDef.respawnSec`.

---

## 3. Chat (Sohbet)

Scope: everything runs over the **existing** P2P party room (`chat` channel, host-relayed star topology) plus the **lobby room** for a global channel. Nothing here needs a server. Existing pieces kept: 200-char cap (`NET.MAX_CHAT_LEN`), `sanitizeText`, burst limiter (`chatAllowed`), HTML escaping in `Chat.addLine`, Enter-to-type with `consumedAt` (hotkeys ignore it), `/temizle`.

### 3.1 Channels

| id | Tab / name (TR) | Colour | Scope | Slash | Default send? | Notes |
|---|---|---|---|---|---|---|
| `say` | Yakın | `#f1e6cf` | room peers in the **same scene within 40 m** (receiver-side distance check) | `/s`, `/yakin` | when playing solo | also shows a speech bubble (5 s) |
| `yell` | Bağır | `#ff6a52` | room peers in the same scene | `/y`, `/bagir` | — | 5 s cooldown, max 100 chars |
| `party` | Grup | `#6fb1ff` | all room peers | `/p`, `/grup`, `/party` | **default when ≥ 2 peers** | existing behaviour |
| `whisper` | Fısıltı | `#ff7fe6` | one room peer by name | `/w <ad> <mesaj>`, `/f`, `/fisilti`; `/r <mesaj>` replies to the last whisperer | — | host can read relays (A7 note shown once in the tab: "Fısıltılar oda sahibi üzerinden geçer.") |
| `global` | Genel | `#ffd36a` | **lobby room** members (town + room browser) | `/g`, `/genel` | — | only available while the lobby transport is open (town); tab shows "Sadece şehirde" elsewhere; 1 msg / 3 s, ≤ 120 chars |
| `trade` | Ticaret *(optional)* | `#c8a070` | lobby room, tagged | `/t`, `/ticaret` | — | muted by default (setting); allows **one** item link |
| `system` | Sistem | `#ffe27a` | local | — | — | join/leave, level-up, skill-up, discovery, boss spawn, roll results |
| `loot` | (in Sistem) | `#8ae08a` | local | — | — | existing `loot` lines |
| `emote` | (in Genel) | `#ffb0ff` italic | room (emote broadcast) | `/dans` … | — | "Ahmet dans ediyor." |
| `boss` | (in Sistem) | `#ff6a52` bold | local | — | — | `boss:yell` events |
| `combat` | Savaş | per line | local | — | — | §3.6, own tab only |

### 3.2 UI layout and behaviour (hud module, `Chat.ts` refactor)

* Frame id `chat` (UI Edit Mode compatible). Default 380×190 px at the bottom-left above the action bar. Tab strip 22 px, log, input row 26 px. Background alpha 0.35 idle, 0.72 while typing. Font 13 px, line 17 px, `text-shadow` for readability; optional timestamps `[14:32]`.
* Tabs (default): **Genel** (say, yell, party, whisper, global, trade, emote, system) · **Grup** (party) · **Fısıltı** (whisper) · **Sistem** (system, loot, boss) · **Savaş** (combat). Right-click a tab → channel checklist, rename-free. Unread dot on a tab when a new line arrives while another is shown; whispers also flash the tab and play `chat` sfx.
* Lines per tab: ring buffer 200 (combat 300). Lines fade (class `old`) after 12 s when the chat is not focused, except in the Fısıltı and Sistem tabs. Wheel scrolls; new lines autoscroll only when already at the bottom ("Yeni mesajlar ↓" chip otherwise).
* **Input**: `Enter` opens (unlocks the pointer, as today); `/` opens with `/` prefilled; `Tab` (empty input) cycles the send channel `party → say → yell → global`; the channel label left of the input shows the current channel in its colour; `↑/↓` recalls the last 20 sent lines; `Esc` closes; sending clears and blurs (existing). Autocomplete: typing `/w ` then `Tab` completes a room peer name; `/` shows a small command hint list.
* **Speech bubbles** (`ChatBubbles.ts`, world layer, like nameplates): `say` and `party` text ≤ 80 chars above the sender for 5 s (max 2 stacked, fade 0.4 s). Setting "Konuşma balonları" default on.
* Settings (`Settings` appends): `chatFilter: boolean` (true), `chatFontSize: 11..16` (13), `chatOpacity: 0.2..1` (0.35), `chatTimestamps: boolean` (false), `chatBubbles: boolean` (true), `chatTradeMuted: boolean` (true), `chatIgnore: string[]` (names).

### 3.3 Slash commands (exact)

| Command (aliases) | Effect |
|---|---|
| `/s`, `/yakin <m>` | say |
| `/y`, `/bagir <m>` | yell |
| `/p`, `/grup`, `/party <m>` | party |
| `/g`, `/genel <m>` | global (lobby) |
| `/t`, `/ticaret <m>` | trade (lobby) |
| `/w`, `/f`, `/fisilti <ad> <m>` | whisper; unknown name → system "Oyuncu bulunamadı: Ahmet." |
| `/r`, `/yanit <m>` | reply to the last whisper sender |
| `/roll [N]`, `/zar [N]` | roll `1..N` (default 100, N 2–10000); broadcast as a system line to the room: "Ahmet 1-100 arası zar attı: 57" |
| `/who`, `/kim` | lists room peers locally: "Ahmet – Şövalye Sv. 60 · Eşya Sv. 142" (from `PeerInfo`/`CharacterSummary`) |
| `/engelle <ad>`, `/ignore`; `/engelkaldir <ad>` | add/remove from `chatIgnore` (hides their chat lines and whispers locally) |
| `/temizle`, `/clear` | clear current tab (existing) |
| `/yardim`, `/help` | print this list |
| `/dans`, `/selam`, `/alkis`, `/otur`, `/uyu`, `/kiskirt`, `/gul` | emotes (§3.4) |
| `/duello <ad>`, `/pvp` | PvP (§7; disabled until phase 1 ships: reply "Henüz açık değil.") |
| `/ayril` | leave the party (calls the existing `G.net.leaveRoom()`) |
| `/saat` | prints local time (cosmetic) |
| anything else | system "Bilinmeyen komut. /yardim yaz." |

Parser: `parseChatInput(raw: string): ParsedChat` in `ui/hud/ChatCommands.ts` (pure, unit-testable): `{ kind: 'say'|'yell'|'party'|'global'|'trade'|'whisper'|'roll'|'who'|'emote'|'ignore'|'unignore'|'clear'|'help'|'duel'|'pvp'|'leave'|'time'|'unknown', channel?, to?, text?, n?, emote? }`.

### 3.4 Emotes (KayKit clips, all exist on the shared rig; skeleton-only clips are listed in `characters.md` §2 and also play on adventurers)

| Emote | Clip(s) | Behaviour | Voice (sfx id by class pack: knight/barbarian/rogue = `voice_warrior_*`, mage = `voice_mage_*`) |
|---|---|---|---|
| `/selam` | `Interact` (1.3 s) once | full body | `*_hello` |
| `/alkis` | `Cheer` (1.667 s) once | full body | `*_yes` |
| `/gul` | `Cheer` once | + `*_laugh` | `*_laugh` |
| `/kiskirt` | `Taunt` (1.033 s) once | full body | `*_angry` |
| `/dans` | loop macro `Cheer → Taunt → Cheer → Interact` | until the player moves/attacks/dodges; pink `buff_aura` sparkles (scale 0.35) every 1.2 s | — |
| `/otur` | `Sit_Floor_Down` (1.0) → `Sit_Floor_Idle` (4.0, loop) → on move `Sit_Floor_StandUp` (1.133) | status **Dinlenme**: out-of-combat HP regen ×2 (0.04 → 0.08 max HP/s) while seated; breaks on damage/combat/move | — |
| `/uyu` | `Lie_Down` (3.0) → `Lie_Idle` (2.667, loop) → `Lie_StandUp` (2.333) | same Dinlenme; only in town or within 6 m of a campfire | — |

Rules: emotes are refused in combat (system "Savaştayken yapamazsın."), while dead, rolling, or casting. Replication: the `chat` channel carries `{ ch: 'emote', emote: 'dans' }`; receivers call `Player.playEmote(id)` on the remote avatar and show "<ad> dans ediyor." in the emote colour. `Player.playEmote(id)` / `Player.stopEmote()` are new (player module); `PlayerController` cancels emotes on movement/skill/dodge input and applies the Dinlenme bonus through `Combat.updateLocalPlayer` (reads `player.resting`).

### 3.5 Item links

* Shift-click an item in the inventory, stash, vendor list, equipment slots, crafting result strip or a loot label → `G.events.emit('chat:insertLink', { item })`; `Chat` inserts a coloured token `[Çelik Zırh +5]` into the input and remembers the snapshot (max **2** links per message).
* On send the message carries `links: ChatLink[]` and the text holds `{1}` / `{2}` placeholders.

```ts
export type ChatLink =
  | { k: 'item'; item: ItemSnapshot }
  | { k: 'loc'; zone: string; x: number; z: number; label: string };   // /pin command, P2
export interface ItemSnapshot {
  baseId: string; rarity: Rarity; itemLevel: number; upgrade?: number; name?: string;
  affixes: { affixId: string; value: number; tier: number }[];
  weaponDamage?: [number, number]; implicit?: StatBlock;
  sockets?: (string | null)[]; uniqueId?: string; setId?: string; craftedBy?: string;
}
```

* **Receiving** (`net` validates, `hud` renders): `sanitizeItemSnapshot(raw): ItemSnapshot | null` rejects unless `baseId ∈ ITEM_BASES`, every `affixId ∈ AFFIX_BY_ID`, ≤ 6 affixes, `value` finite and `0 ≤ value ≤ 1.25 × max(best tier max)`, `itemLevel` integer 1–95, `upgrade` 0–15, ≤ 4 sockets whose ids start with `gem_`, `name`/`craftedBy` ≤ 48 chars after `sanitizeText`; message payload `links` JSON ≤ 1,500 bytes. Invalid links render as plain "[Eşya]" text.
* **Rendering**: `<span class="chat-item" data-i="0" style="color:RARITY">[Name +N]</span>`; hover → `G.ui.showItemTooltip` built from `describeItem(snapshotToInstance(s))`; click → pins the tooltip. The item text is always escaped.

### 3.6 Combat log tab ("Savaş")

Source: `G.events` `damage`, `heal`, `death`, `status:applied`, `loot:pickedUp` (loot excluded), resolved to names via `G.world.entities.get(id)?.name`. `CombatLog` (hud, `ui/hud/CombatLog.ts`) keeps a ring buffer of 300 and also exposes `stream(cb)` for the future DPS meter (ROADMAP P1a).

| Event | Line format | Colour |
|---|---|---|
| you deal damage | `Sen → Kurt: 124 Fiziksel` (+ ` (Kritik!)`) | white; crit `#ffcc33` |
| DoT tick | `Kanama → Kurt: 18` | grey |
| you take damage | `Kurt → Sen: 62 Fiziksel` | `#ff6a52` |
| heal | `Sen → Ahmet: +230` | `#5aff7a` |
| kill | `Sen, Kurt'u öldürdü.` / `Kurt öldü.` | grey |
| status | `Zehirlendin (4 sn)` / `Kurt dondu` | status colour |
| block / dodge / immune | `Sen blokladın` / `Kaçtın` / `Bağışık` | white |

Rules: default shows **only events involving the local player**; setting "Grup savaşını göster" adds party members. Consecutive identical DoT/channel ticks from the same source→target within 0.5 s merge into `×3`. The tab never fades and does not autoscroll while scrolled up. `/savaslog kopyala` copies the last 50 lines to the clipboard.

### 3.7 Profanity-safe basic filter

`src/ui/hud/ChatFilter.ts`: `filterChat(text: string): string` applied to **incoming** text of every channel except `system` (so each player's setting decides what they see) and to outgoing global/trade text. Setting `chatFilter` default **on**.

1. Normalise a copy for matching: lower-case (Turkish-aware: `İ→i`, `I→ı→i`), strip diacritics (`ç→c ğ→g ı→i ö→o ş→s ü→u`), map leetspeak (`0→o 1→i 3→e 4→a 5→s 7→t @→a $→s`), drop separators (`. - _ * ' space` between letters), collapse runs of 3+ identical letters to 1.
2. Compare against `BAD_STEMS: string[]` (substring match on the normalised text, ~60 common Turkish/English insults and slurs; the agent compiles it from a standard open-source word list and **does not paste the words into the docs or commit messages**) minus `SAFE_WORDS` (whole-word allow-list for false positives, e.g. place names and common words that contain a stem: "amasya", "sikke", "bokser", "hassas"… the agent extends it while testing against `dev/hud.html`).
3. A match masks the **original** span with `*` of equal length (positions mapped back through the normaliser).
4. Character names run through the same `isNameClean(name)` at creation (`MenuUI`): rejected with "Bu isim kullanılamaz."

### 3.8 Net protocol and scope (net module owns send **and** receive; `G.net.sendChat(text, opts?)`)

```ts
// types/net.ts (append-only widening of the existing 'chat' channel)
chat: {
  text: string;
  ch?: 'say' | 'yell' | 'party' | 'whisper' | 'emote' | 'roll';   // absent = 'party' (old clients)
  to?: string;                       // whisper target peerId
  links?: ChatLink[];                // ≤ 2, validated by sanitizeItemSnapshot
  emote?: string;                    // emote id
  roll?: [number, number];           // [max, result]
};
// net/messages.ts LobbyChannels: new  lchat: { t: 'lchat'; name: string; text: string; cls?: ClassId; lvl?: number; trade?: boolean }
// core/events.ts: 'net:chat' payload widened: channel: ChatChannel (adds 'say'|'yell'|'whisper'|'global'|'trade'|'emote'|'boss'|'loot'), to?, links?
```

Routing in `NetSession`:

* `say`: broadcast; each receiver drops it unless the sender's avatar is in the same scene **and** within 40 m (using remote `Player` positions) — a dropped message is simply not shown.
* `yell`: broadcast; receivers drop if scenes differ.
* `party`: broadcast (existing).
* `whisper`: `sendTo(peerOfName(name), 'chat', { ch: 'whisper', to })` via the host relay; the sender gets a local echo line "→ Ahmet: …"; unknown name → local system line.
* `emote` / `roll`: broadcast; `roll` result is generated by the sender (cosmetic, A7: friends' rooms; receivers clamp `1 ≤ result ≤ max ≤ 10000`).
* **Global/trade**: sent on the lobby transport (`lchat`), sender id from `MessageMeta.from` (never from the payload); the net module keeps a lobby connection open **in the town scene** for every peer (read + write) and closes it when entering a dungeon or the open world (saves bandwidth; `NETCODE.md` lobby limits apply).
* Limits: `NET.CHAT_BURST` becomes 6 per 10 s per sender (it is 8 today; existing mechanism); identical text from one sender within 3 s dropped; `yell` 1 per 5 s; global 1 per 3 s (sender-side and receiver-side); `links` ≤ 2; payload JSON ≤ 1.8 KB; everything through `sanitizeText`. Ignored senders (`chatIgnore`) are dropped before display.
* Whispers/say are **not** end-to-end private (host relay): the tab shows the one-time notice (A7).
* `G.net.peers` exposes `{ peerId, name, classId, level, itemLevel }` for `/who` and name completion (already in `PeerInfo`/summary).

---

## 4. Camera and control improvements (Kamera ve Kontrol)

### 4.0 Baseline (read from `src/camera/ThirdPersonCamera.ts`; keep what works)

| Parameter | Today | Verdict |
|---|---|---|
| Zoom | wheel ×(1 ± 0.12) per notch, range 3–18 m, default 9, `damp 12` | keep; add zoom→pitch/FOV curves (4.6) |
| Pivot | feet + 2.0 m; follow `kx = 1 − e^(−13 dt)` horizontal, `ky = 6.5` vertical; snaps if > 6 m away | keep; add look-ahead + airborne dead zone (4.1) |
| Shoulder | `±0.55 m`, `shoulderSide`, damp 9 | keep; add key + auto-swap (4.5) |
| Collision | nav-grid `nav.raycast` pull-in (`collide`, `collideMaxRayHeight`), `occluders` mesh raycast (`OCC_MARGIN 0.6`, `OCC_MIN_HIT 0.5`, **town only today**), instant pull-in, ease-out `damp 4`, floor clamp +0.35 | extend to the open world, classify solid vs fade, add hysteresis (4.2–4.3) |
| Shake | list of `{amp, dur}` (max 10), noise 26 Hz (translate 0.5/0.42, roll 0.05), `settings.screenShake` | add budget + directional kick (4.11) |
| Punch / FOV | spring k260/c21 and k150/c17, FOV offset clamp −6…+8 | keep; add events (4.10) |
| Assist | `setAssist(yaw, k, pitch)` (hard-target framing) | replace by `setLockOn` framing (4.7) |
| Input | `LOOK_SENS 0.0022 rad/px × mouseSensitivity`, clamp ±160 px/frame, `invertY` | add Y ratio, acceleration, precision mode (4.8) |

Everything below is **additive**: no public method of the camera is removed or renamed (`shake`, `punch`, `kickFov`, `setAssist`, `snap`, `getAimRay`, `refreshAim`, `getBasis`, `getPivot`, `faceYaw`, `occluders`, `collide`, `shoulderSide`, `shiftLock`, `dispose` stay).

### 4.1 Smoothing and follow

| Item | Spec |
|---|---|
| Look-ahead | `lookAhead = clamp(planarSpeed × 0.10, 0, 0.9)` m added to the pivot along the player's velocity; smoothed `damp 3/s`; only when the player moves toward the camera's forward half-plane (`dot > 0.3`) and not locked on. Setting `cameraLookAhead` (default on). |
| Horizontal follow | `kx` lerps `13 → 10` as planar speed goes `5 → 9 m/s` (dodges/charges lag a touch, giving speed). |
| Vertical follow | `ky = 6.5`; while airborne `5.5` plus a **±0.35 m dead zone** (jumps don't bob the screen). |
| Rotation smoothing | setting `cameraSmoothing 0..0.4` (default 0; the future gamepad profile uses 0.12): the applied look delta is exponentially smoothed with time constant `smoothing × 0.1 s`. Mouse default stays unsmoothed (aim precision). |
| Pivot snap | `snap()` unchanged; teleports clear look-ahead. |

### 4.2 Collision with props (build on the existing `occluders`)

* **Open world gets the town treatment.** Move `townOccluders(root)` from `TownScene.ts` to `scenes/SceneKit.ts` as `collectOccluders(root, opts?)` (scenes module); `TownScene` and the outdoor branch of `DungeonScene` call it. Meshes are classified by `mesh.userData.camClass`: `'solid'` (default for shadow-casting meshes with bounding sphere ≤ 100 m: trunks, rocks, walls, buildings), `'fade'` (4.3), `'ignore'` (grass, flowers, far forest). World builders set `camClass = 'fade'` on tree canopies (any mesh of a tree prop above 2.2 m) and building roofs; trunks become `'solid'` through invisible proxy cylinders (`CylinderGeometry(r, r, h, 6)`, `visible = false`; `Raycaster` still tests them) when the canopy mesh is `'fade'`.
* **Candidate pruning** (cost control): `nearOccluders` is rebuilt every 0.25 s from meshes whose cached world bounding-sphere centre is within `zoomCur + 8` m of the pivot (centres cached once for static meshes). `occluderFrac()` ray-tests only that list (target ≤ 60 meshes, ≤ 0.3 ms per frame).
* **Hysteresis**: pull-in stays instant; after the last block the camera waits **0.15 s**, then eases out at `2.5/s` for props and `4/s` for nav walls (no flicker when a ray grazes a trunk).
* **Close-up fade**: when the effective camera distance `colFrac × zoomCur < 1.8 m` the local player's model fades with the same dither (`alpha = smoothstep(1.0, 1.8, dist)`, clamp ≥ 0.25) and the shoulder offset lerps to 0 so the lens never clips a wall on the shoulder side.
* Floor clamp, `collideMaxRayHeight` and the town's `cam.collide = inside Kadim Kapılar` rule stay as they are.

### 4.3 Occluder fading (props between camera and player turn transparent)

`world/OccluderFader.ts` (world module): `register(mesh)` for every `camClass === 'fade'` mesh; `update(dt, camPos, targetPos)` after the camera updates.

* Test the segment `camPos → targetPos + (0, 0.1 × playerHeight, 0)` with 5 rays (centre + 4 at ±0.5 m perpendicular) against the `fade` meshes within `zoomCur + 6` m (list rebuilt every 0.25 s). Hit ⇒ target fade `0.22`; free ⇒ `1.0`. Rates: fade-out `0.18 s`, fade-in `0.35 s`. At most **8** objects fade at once (nearest to the camera first).
* **PSX dither fade, not alpha blending** (no sorting issues, authentic look): `render/psx` `patchPSX` gets a uniform `uFade` (default 1) and a fragment `if (uFade < 1.0 && bayer4(gl_FragCoord.xy) > uFade) discard;`. Materials of faded meshes are cloned once on first registration so shared materials don't fade every tree.
* **Instanced trees**: canopies inside `world/Instancing.ts` batches need either an instanced `aFade` attribute (preferred) or must stay non-instanced within 40 m of the player; otherwise fading is skipped for that batch (and the canopy must then be `'ignore'`, never `'solid'`).
* Setting `occluderFade` (default on). Dungeons tag only hanging props (chandeliers, beams) as `fade`; pillars/walls stay `solid`.

### 4.4 Auto-follow (camera swings behind the player)

Setting `cameraAutoFollow` — default **off** in `action` mode (shift-lock already faces the camera), default **on** in `classic` mode.

* Active when: classic mode **or** `shiftLock === false`; forward movement (`axis.y > 0.5`, `|axis.x| < 0.5`); no mouse orbit for ≥ 1.2 s (`idleLook`); not locked on; no panel open.
* Yaw eases toward `playerFacingYaw + π` at `0.9 rad/s × clamp(speed / 7, 0, 1)` using `1 − e^(−k dt)`; dead zone ±6°; any orbit input stops it instantly. Pitch eases toward `restPitch(zoom)` (4.6) at 0.25 rad/s after 2.0 s idle.

### 4.5 Shoulder swap

* New input action `camShoulder` (default `KeyV`; core appends to `InputAction`/`DEFAULT_BINDINGS`/`ACTION_NAMES_TR`: "Omuz Değiştir"): **tap** toggles right ↔ left (`shoulderSide = −shoulderSide`, damp 9 as today); **hold 0.4 s** centres (`0`) and a further tap returns to the last side.
* **Auto-swap** (`cameraAutoShoulder`, default on): every 0.2 s probe a ray from the pivot to `pivot + right × (0.55 + 0.5)` against `solid` occluders/nav; if blocked within 0.9 m and the opposite probe is clear → swap once, 1.5 s cooldown.
* The action-mode reticle stays at the screen centre; `getAimRay()` already uses the shoulder-corrected clean pose, so aim never shifts on a swap.

### 4.6 Zoom curves (pitch, pivot height and FOV follow distance)

`d = zoomCur`, `s = smoothstep(3, 14, d)`.

| Quantity | Formula | Range |
|---|---|---|
| Pivot height | `pivotHeight + lerp(−0.25, +0.6, s)` (base field stays 2.0) | 1.75 → 2.6 m |
| Rest pitch | `restPitch(d) = lerp(0.26, 0.62, s)` rad | 15° → 36° |
| Pitch pull | while the wheel moved within 0.6 s and there is no orbit: `pitch += (restPitch − pitch) × (1 − e^(−3.5 dt)) × 0.5` | no jump > 2°/frame |
| FOV | `settings.fov + lerp(−4, +6, s)` added to the FOV spring offset | 56° → 66° at the default 60 |
| Combat zoom | ≥ 3 enemies attacking within 12 m ⇒ `zoomTarget += 1.5` (max +2.5, smoothed 1.5 s); returns 3 s after combat; a wheel input drops the bias | setting `cameraCombatZoom` (default on) |
| Limits | 3–18 m unchanged, default 9, persisted 0.8 s after the last wheel (existing) | |

### 4.7 Lock-on camera (Hedef Kilidi) and boss auto-lock

Existing: `Tab` cycles the hard target (`PlayerController.cycleTarget`), `Mouse1` toggles shift-lock (`toggleLock`). New behaviour (player module):

* **Tab tap** = cycle (as today). **Tab hold 0.3 s** = toggle lock-on on the soft target (nearest in the 60° cone) / release (setting `lockOnMode`: `'hold-lock'` default | `'tap-cycle'`).
* `ThirdPersonCamera.setLockOn(target: Actor | null)` replaces the old `setAssist` use for hard targets (`setAssist` stays for other callers). While locked: yaw target = bearing from the player to `mix(player, target, 0.62)` (both stay in frame), rate `3.2/s`; pitch target puts the target's chest (`height × 0.55`) at ~42% screen height, clamped `[−0.15, 0.7]`, rate `2.0/s`; **auto-zoom bias** `clamp(0.35 × distToTarget + 0.6 × targetHeight, 0, 6)` m, smoothed 0.8 s.
* **Manual override**: if the user orbits > 14° away from the assist yaw for > 0.5 s the assist is suspended for 1.5 s (`lockSuspend`) and resumes smoothly.
* Movement while locked: character faces the target, WASD strafes with `Running_Strafe_*`, back-pedal 70% (existing GDD §8.8).
* **Release** when: distance > 30 m; no line of sight for 2 s; target dead (auto-pick the nearest within 8 m and 60°, else release). Marker/ring and the boss frame highlight exist.
* **Boss auto-lock** (setting `bossAutoLock`, default on): on `boss:engaged` with the boss ≤ 25 m, lock on with a 0.5 s ease; release on `boss:defeated` / `boss:wipe`.

### 4.8 Sensitivity curves

```
yawPerPx   = 0.0022 × mouseSensitivity × (fov / 60) × accel(Δpx)
pitchPerPx = yawPerPx × cameraSensYRatio            // default 0.85, range 0.5–1.5
accel(Δpx) = 1 + cameraAccel × 0.6 × smoothstep(8, 60, |Δpx|)      // cameraAccel 0..1, default 0
```

* Precision mode: ×0.65 while a ground-AoE reticle is held (`skill:aimStart` … `skill:aimEnd`), ×0.8 while hard-locked.
* Existing ±160 px/frame clamp and `invertY` stay.

### 4.9 Controller-friendly options (P3 package; core `Input.ts` + player `PlayerController`)

| Control | Spec |
|---|---|
| Move (left stick) | radial dead zone 0.18, response `|v|^1.3`, feeds the existing `axis` |
| Look (right stick) | dead zone 0.15, response `|v|^1.6`, max 3.4 rad/s yaw / 2.3 rad/s pitch, ramp to full speed over 0.22 s of hold, `invertY` respected, `cameraSmoothing 0.12` |
| Buttons | A jump · B dodge · X interact (hold) · Y HP potion · RT `skill_lmb` · LT `skill_rmb` · LB `skill_q` · RB `skill_e` · D-pad ← ↑ → `skill_s1..s3` · D-pad ↓ MP potion · R3 lock-on · L3 walk toggle · Start menu · Back map |
| Aim assist | magnetism: crosshair within 4° of an enemy ≤ 2 m from the aim ray bends 1.5°/frame toward it; friction: stick sensitivity ×0.7 while over an enemy |
| Rumble | `gamepad.vibrationActuator.playEffect('dual-rumble', { duration: 80, strongMagnitude: 0.5, weakMagnitude: 0.3 })` when hurt > 15% max HP; 40 ms buzz on own crit; setting `rumble` (default on) |
| UI | menus use the free cursor (Select toggles `freeCursor`); full D-pad UI navigation is out of scope |

### 4.10 FOV kick events

Direct `kickFov(deg)` calls (already exists) or the new `camera:fov {deg}` event; total offset stays clamped to `[−6, +8]`.

| Event | Kick (deg) | Notes |
|---|---:|---|
| Dodge start | +4.5 | settles in ~0.35 s |
| Dash / charge skill start | +5.0 | |
| Leap take-off / landing | +4.0 / −2.5 | landing squeezes |
| Perfect dodge | +3.0 | + the existing slow-mo |
| Finisher / heavy / ultimate hit | +2.0 / +3.0 / +4.5 | §5.2 |
| Player hurt > 15% max HP | −1.5 | squeeze |
| Level-up | +2.5 (slow spring k60/c10) | |
| Sprint (only if GDD_V2 adds one) | +3 over 0.3 s, held | |
| Casting charge (hold) | −1.5 over 1.0 s | released on cast |

### 4.11 Camera shake budget and directional kick

Rules (enforced inside `ThirdPersonCamera.shake()`):

* Active trauma sum (after the `e²` decay) capped at **0.85**; a single entry capped at 0.7.
* At most one new entry per 60 ms per source type; extras merge by `max`.
* **Per-second budget**: integral of added trauma ≤ 2.2 per sliding second; beyond it new shakes are ×0.5 for 1 s (protects 40-enemy fights from nausea).
* Slider `screenShake` default **0.7** (GDD_SYSTEMS §8.4; `DEFAULT_SETTINGS.screenShake` is 1 today → core append changes the default).
* Falloff: events not caused by the local player use `trauma × (1 − d / R)`; remote players' basic hits add 0.
* **Directional kick**: `ThirdPersonCamera.kick(dx, dz, amount)` (world-space direction, converted to camera axes) pushes a 2-D spring offset (`k 300`, `c 24`, settles ≈ 0.18 s) — every melee hit uses it instead of most of the noise shake so the *direction* of the blow is legible. Event form: `camera:kick { dx, dz, amount }`.

| Event | Trauma (see §5.2 for the per-weight table) | Duration (s) | Kick (m) |
|---|---:|---:|---:|
| Light hit | 0.12 | 0.19 | 0.05 |
| Finisher | 0.32 | 0.29 | 0.14 |
| Heavy / slam | 0.50 | 0.37 | 0.20 |
| Ultimate | 0.70 | 0.46 | 0.28 |
| Player hurt > 10% | 0.32 | 0.20 | 0.15 (away from the attacker) |
| Boss slam ≤ 15 m | `0.5 × (1 − d/15)` | 0.4 | — |
| Gather strike / tree fall | 0.03 / 0.12 | 0.10 / 0.25 | — |
| Level-up, loot | 0 | — | — |

### 4.12 Cinematic boss-intro camera

* Trigger: `boss:engaged` for a boss whose `BossDef.introCam !== false`, **first engage per boss id per session** (in-memory), when `bossIntroCam !== 'off'`. Setting `bossIntroCam: 'off' | 'short' | 'full'`, default `'short'`. Local only; **non-blocking** — the player keeps control. Moving the mouse > 15 px or pressing any skill/dodge **skips** (ease-out 0.25 s).
* `ThirdPersonCamera.playCinematic(spec)` with `spec = { target: THREE.Object3D | (() => THREE.Vector3), dist, height, fov, blendIn, hold, blendOut, orbitDeg }`. The camera computes the normal pose and the cinematic pose and outputs `lerp(normal, cine, w)`; the clean **aim pose stays the normal one**, so gameplay and aiming are unaffected.
* **'short' timeline (2.2 s)**: 0–0.5 s `w` 0 → 1 (ease-in-out); 0.5–1.6 s hold (dolly-in 0.8 m, orbit +`orbitDeg 18°`); 1.6–2.2 s `w` 1 → 0. Cinematic pose: camera at the boss centre + (direction boss→player rotated +25°) × `dist = clamp(boss.height × 2.6, 6, 14)`, `height = boss.height × 0.45`, looking at `boss chest + 0.1 × height`, FOV −6°. **'full'**: hold 2.0 s (total 3.4 s).
* Accompaniment: letterbox bars 8% screen height each (0.35 s in/out; hud `Overlays`), boss title card (name 28 px Cinzel, `title` 16 px) in the lower third (0.4 s fade), `boss_roar` sfx at t = 0.5 s, `camera:shake {0.30, 0.3}` at 0.55 s, cosmetic slow-mo 0.55 for the first 0.4 s. Boss music cue unchanged.
* Reused for: world-boss spawn announcement (1.4 s, "Çürükkök topraktan yükseliyor!") and dungeon intro title (ROADMAP P3).

### 4.13 Death cam

On local death: zoom to 5.5 m over 1.2 s, slow orbit `+0.12 rad/s`, FOV +2°; restored on revive. (Cosmetic; no gameplay state.)

### 4.14 Settings added (`SettingsData`, core append; rows in `panels-game/settings.ts` under "Kamera")

`cameraAutoFollow` (false), `cameraAutoShoulder` (true), `cameraCombatZoom` (true), `cameraLookAhead` (true), `cameraSensYRatio` (0.85), `cameraAccel` (0), `cameraSmoothing` (0), `occluderFade` (true), `bossIntroCam` ('short'), `bossAutoLock` (true), `lockOnMode` ('hold-lock'), `rumble` (true), and `screenShake` default 0.7.

### 4.15 Verification (`dev/player.html`, `?camdebug=1`)

The debug overlay prints `dist`, `colFrac`, `pitch`, `fov`, shake budget used, occluder counts and the camera update time. Pass criteria:

1. Camera behind a trunk: pulled in, never inside the trunk; recovers after the 0.15 s hold with no flicker.
2. Canopy between camera and player: dithers to ≈ 22% within 0.2 s, returns within 0.4 s; ≤ 8 faded objects.
3. Back against a wall: auto shoulder swap once, then ≥ 1.5 s cooldown.
4. Zoom 3 → 18: pitch/FOV/pivot change smoothly (≤ 2° per frame).
5. `Tab` hold locks a boss at 20 m with both in frame; orbiting 20° away suspends assist; target death auto-picks or releases.
6. 40 hits/s: trauma never above 0.85, camera offset back to < 1 cm within 0.8 s.
7. Boss intro: 2.2 s, skippable by mouse move, no lost input; aim ray unchanged during it.
8. Camera update ≤ 0.3 ms with 300 registered occluders.

---

## 5. Hit feel and combo tuning pass (Vuruş Hissi) — the user's top priority

### 5.1 Diagnosis (why it can feel weaker than it should)

| Today (read from `Combat.ts` / `feel.ts` / `Engine.ts`) | Effect |
|---|---|
| Hit-stop is global: `Engine.hitStop(ms)` runs `dt × 0.05` for the **whole world** (particles, projectiles, other enemies, UI timers) | in a crowd every hit stutters everything; no sense of *this* blow landing |
| One white flash stage (`FEEL.flashDuration 0.085`) | no weight difference, no elemental read |
| Camera: noise-shake only; punch + FOV only when trauma > 0.12 / 0.3 | direction of the blow is not readable; light hits feel flat |
| No hit marker, no damage-direction indicator | ranged and chain hits are unconfirmed |
| Single `light` weight for steps 1–3 of every chain | step 3 (stab/kick) feels like step 1 |
| Combo counter hard-resets after 2 s; 5 tiers | no reward for sustained play |
| Impact sfx by type only; no material, no weight layers | all hits sound alike |
| Input buffer 0.4 s (GDD: 0.25), no per-weapon differences | sloppy; dagger = axe |

### 5.2 FEEL v2 numbers per hit weight class

`HitWeight` gains `'medium' | 'parry' | 'stagger_break' | 'backstab'` (combat-owned union in `combat/feel.ts`; `SkillDef.params.weight` numbers: `0 light, 1 finisher, 2 heavy, 3 ultimate, 4 medium, 5 parry, 6 stagger_break, 7 backstab`). Existing 4-chain steps: step 1–2 `light`, **step 3 `medium`**, step 4 `finisher`. New constant object `FEEL` fields are changed in place (single file); v1 values are kept as `FEEL_V1` for the A/B toggle in the dev page.

| Weight | Used by | Hit-stop (ms) | Trauma | Shake dur (s) | Cam kick (m) | FOV kick (°) | Knockback (m / s) | Flinch (non-elite) | Victim flash | Jiggle × / Squash × | Particles (sparks / chips) | Impact sfx layers | v1 → v2 |
|---|---|---:|---:|---:|---:|---:|---|---:|---|---|---|---|---|
| `light` | chain steps 1–2, dagger/fist hits | **50** | **0.12** | 0.19 | 0.05 | 0 | 0.6 / 0.20 | 40% (cd 0.32 s) | white 85 ms | 1.0 / 1.0 | 6 / 3 | material impact 0.9 | 42→50 ms, 0.10→0.12 |
| `medium` | chain step 3, light skills (coef < 2.5, non-AoE) | **62** | 0.18 | 0.22 | 0.08 | +0.8 | 1.3 / 0.22 | 60% | white 95 ms | 1.15 / 1.2 | 9 / 5 | impact 1.0 + `hit_blunt` thump 0.3 | new |
| `finisher` | step 4 (`finisher:1`) | **90** | **0.32** | 0.29 | 0.14 | +2.0 | 2.0 / 0.26 (cubic) | 100% | white 55 → type 55 | 1.5 / 1.6 | 14 / 8 + `shockwave` r 1.2 | impact 1.0 + `ground_slam` 0.35 @ pitch 0.85 + voice 45% | 75→90 ms, 0.24→0.32 |
| `heavy` | skills with coef ≥ 2.5, slams | **115** | **0.50** | 0.37 | 0.20 | +3.0 | 3.2 / 0.30 (cubic) | 100% | white 60 → type 70 | 1.8 / 2.0 | 22 / 12 + dust ring r 2 | impact + `ground_slam` 0.5 @ 0.8 + `explosion` 0.25 + voice 70% | 95→115, 0.42→0.50 |
| `ultimate` | ultimate impact | **150** | **0.70** | 0.46 | 0.28 | +4.5 | 4.5 + hop 0.3 / 0.35 | 100% | white 70 → type 90 | 2.2 / 2.4 | 36 / 20 + `shockwave` r 3.5 | + `explosion` 0.5 + voice 100% | 125→150, 0.60→0.70 |
| `projectile` | arrows / bolts / spells on hit | 0 (crit 30) | 0.05 | 0.12 | 0.02 | 0 | 0.3 / 0.15 | 25% | type colour 70 ms | 0.8 / 0.8 | 5 / 2 | impact 0.8 | 0.04→0.05 |
| `tick` | DoT / channel tick | 0 | 0.02 (merged ≤ 1 per 0.5 s) | 0.10 | 0 | 0 | 0 | 0 | dim 60 ms at most 1 per 0.5 s | — | 1 | quiet 0.3 | unchanged |
| `parry` | successful parry / riposte (A2) | 70 (attacker only) | 0.30 | 0.25 | 0.12 | +2.5 | 2.0 | fills stagger | white 80 + gold | 1.5 / 1.5 | `block_spark` ×10 | `block` + `hit_metal` bell | new |
| `stagger_break` | poise-break "kritik vuruş" (A2) | **160** | **0.70** | 0.45 | 0.25 | +6.0 | 0 | — | white 100 + gold 120 | 2.0 / 2.0 | `crit_burst` ×2 | `explosion` + `stun` + `hit_crit` | new |
| `backstab` | hit from behind (dagger/rogue) | 80 | 0.20 | 0.22 | 0.10 | +1.5 | 0.5 | 100% | gold | 1.4 / 1.4 | `hit_blood` ×8 | `hit_flesh` low + `dagger_throw` | new |

**Modifiers** (added on top of the row):

| Modifier | Hit-stop | Trauma | Kick | FOV | Other |
|---|---:|---:|---:|---:|---|
| `crit` | +30 ms | +0.12 | +0.04 | +1.0 | flash gold `0xfff0a0` 120 ms, `crit_burst` scale 0.7, `hit_crit` layer 0.7 @ pitch 1.1, flinch +20 pts, knockback ×1.15, number ×1.5 |
| `kill` | +25 ms | +0.10 | +0.04 | +1.0 (elite+ only) | corpse fling (5.6), death vfx/sfx by family |
| vs `boss` | capped at 70 ms for `light`…`heavy` (`ultimate` and `stagger_break` are exempt) | ×1.0 | ×0.8 | — | existing jiggle ×0.3 |

**Caps**: total hit-stop per 0.3 s window **160 ms** (was 125); at most 3 simultaneous hit-freezes; total camera trauma ≤ 0.85 (§4.11); impact sounds max 3 per 100 ms (drop the quietest, vary pitch ±6%).
**Multi-target**: hit-stop is the **max** over the swing's targets (applied once), the victim freeze applies **per victim**.

### 5.3 Per-weapon-kind multipliers (`FEEL_WEAPON`, A3)

`weaponKind` is derived from the equipped main-hand category (`ItemCategory` / class default). Multipliers apply to the hit-stop, trauma and kick columns above; `tempo` multiplies `FEEL.basicTempo` for that class's LMB chain.

| weaponKind | Hit-stop × | Trauma × | Kick × | Tempo | Notes |
|---|---:|---:|---:|---:|---|
| `sword1h` (Şövalye) | 1.0 | 1.0 | 1.0 | 1.0 | reference |
| `axe2h` (Barbar) | 1.2 | 1.3 | 1.3 | 0.92 | heavy 2H, wide arcs |
| `dagger` (Haydut) | 0.8 | 0.7 | 0.7 | 1.12 | flurry, thin trails |
| `staff` / `wand` (Büyücü, Nekromant, Warlock) | projectile rules | 1.0 | 1.0 | 1.0 | |
| `fist` (Keşiş; clips `Unarmed_Melee_Attack_Punch_A/B/Kick`) | 0.7 (light hit-stop 35 ms) | 0.6 | 0.6 | 1.15 | 5-hit chain; estimated hit frames: Punch_A 0.28 (1.467 s clip), Punch_B 0.30 (1.667 s), Kick 0.42 (0.933 s) — scrub in `dev/player.html` |
| `mace` (Paladin) | 1.15 | 1.15 | 1.15 | 0.95 | |
| `bow` / `crossbow` (Okçu, Haydut) | 0 on release | 0.04 | 0.02 (release kicks the camera back 0.10 m) | 1.0 | draw FOV −1.5°, hit marker + `hit_flesh` "tink" 0.4 on every hit |

### 5.4 Selective hit-freeze (replaces the global `dt × 0.05` for everything below `ultimate`)

* New `Actor.hitFreezeUntil: number` (ms, `performance.now()`); `AnimController.freezeUntil: number` (public field, core append). `AnimController.update(dt)` uses `dt × 0.04` while `now < freezeUntil`; `Actor.update` also scales `forcedMove` integration by 0.04 for a frozen actor. **Particles, projectiles, other enemies, camera springs and the UI keep running** — so the camera kick still springs and the blow "bites".
* `Combat.flushFeel()`: for weights `light … heavy`, `parry`, `backstab` call `freezeActors([attackerId, ...victimIds], ms)` instead of `G.events.emit('hitstop', { ms })`; **global** `hitstop` is kept only for `ultimate`, `stagger_break`, player hurt > 15% (55 ms) and boss kills.
* Local only (no net messages, no desync); remote players' hits never freeze your avatar (existing rule).
* A/B: `FEEL.selectiveFreeze = true` (default). Setting it false restores v1 behaviour in the dev page.

### 5.5 Flash, squash, jiggle, impact frame

* `G.vfx.flash2(model, c1, ms1, c2, ms2)` (vfx module, new): stage 1 intensity 1.0 (the **impact frame**: first rendered frame is full white-emissive), stage 2 the damage-type colour at 0.6. Light uses one stage only. Colours: physical none, fire `0xff8a2a`, frost `0x7fd8ff`, lightning `0xffe14a`, poison `0x7dff5a`, shadow `0xa46bff`, holy `0xffe9a0`, arcane `0xff6bd8`; crit overrides stage 2 with gold.
* `addJiggle` amplitudes: `FEEL.jiggle 0.16 m × jiggle×` and `FEEL.squash 0.13 × squash×` from the table; bosses ×0.3 (existing).

### 5.6 Knockback, flinch, death fling

* Chain knockback ramp (skill `knockback`): step 1 0.5 m, step 2 0.7, step 3 1.2, finisher 2.0 (× `massFactor(rank)`, existing). Wall slam stays (`Combat.checkWallSlam`).
* Flinch uses the table's chance, still gated by `FEEL.reactCooldown 0.32 s` for light hits; strong hits cancel windups (existing).
* **Death fling**: a killing blow of weight ≥ `finisher`, or any crit kill, launches the corpse 1.0–2.0 m along the swing direction over 0.35 s (`forcedMove`), with a ±0.4 rad spin, plus the `Death` clip (existing `Combat.finalizeDeath`).

### 5.7 Time dilation (`Combat.slowmo`)

| Trigger | Scale | Hold | Recover |
|---|---:|---:|---:|
| Crit with weight finisher / heavy / ultimate | 0.45 | 70 ms | 0.18 s |
| Kill of elite / miniboss / boss | 0.35 | 110 ms | 0.22 s |
| **Last kill** (no other aggroed enemy within 14 m) | 0.35 | 120 ms | 0.25 s |
| Ultimate impact | 0.30 | 120 ms | 0.25 s |
| Perfect dodge (existing) | 0.45 | 110 ms | 0.22 s |
| Stagger break | 0.25 | 140 ms | 0.30 s |
| Boss death | 0.25 | 0.6 s | 0.6 s (+ zoom punch) |

At most one slow-mo per 1.2 s except boss death (existing guard returns early while active).

### 5.8 Animation cancel windows and input buffer (v2)

Times are after the hit frame unless stated. Existing params `chain` / `move` / `root` / `slow` keep their meaning; the table gives the targets to tune each step to.

| Action | → Dodge | → Skill | → Basic | → Move | During windup |
|---|---|---|---|---|---|
| Basic light (steps 1–2) | any time (before the hit: swing cancelled, nothing paid) | +0.05 s | +0.04 s | +0.10 s | move slow ×0.45 |
| Basic step 3 (medium) | any | +0.06 s | +0.05 s | +0.12 s | ×0.5 |
| Finisher | +0.12 s (commitment) | +0.15 s | chain restarts +0.25 s | +0.20 s | root until the hit |
| Instant skill (weight 0/1) | any (refund before hit) | +0.10 s | +0.10 s | +0.20 s | ×0.7 |
| Heavy skill | +0.18 s | +0.20 s | +0.25 s | +0.30 s | root |
| Ultimate | not in the first 0.3 s | after its lock | after its lock | after its lock | root until the hit |
| Cast skill | any (cast cancelled) | no | no | no | rooted |
| Dodge roll | — | +0.30 s (roll-attack) | +0.30 s | +0.40 s | — |

**Input buffer** `FEEL.inputBuffer`: 0.40 → **0.30 s** ("last input wins" per class, GDD 0.25), buffered inputs cleared on stun/knockdown/death; **dodge buffer 0.20 s** during any recovery; hold-LMB auto-repeats the chain (existing).

### 5.9 Combo counter v2 (`ComboTracker`, `ComboCounter`)

| Tier | Hits needed | Name | Damage bonus ("more") |
|---:|---:|---|---:|
| 0 | — | — | 0% |
| 1 | 5 | KOMBO | 3% |
| 2 | 12 | HARİKA! | 6% |
| 3 | 24 | ÖLÜMCÜL! | 10% |
| 4 | 40 | ÇILGIN! | 15% |
| 5 | **70** | **TANRISAL!** | **20%** |

`FEEL.comboTiers = [5, 12, 24, 40, 70]`, `FEEL.comboBonus = [0, 0.03, 0.06, 0.10, 0.15, 0.20]`; window 2.0 s (kills extend +0.5 s, existing). **Drain**: when the window expires the tier drops **one per 0.8 s** (count set to that tier's threshold) instead of resetting to 0, so sustained play is rewarded. Finishing a full chain at tier ≥ 2 refunds +10% of max resource once per chain. Tier 5 adds a weapon aura (`WeaponGlow` ×1.5 for 4 s) and a screen-edge glow vignette (tier ≥ 3, colour per tier). HUD: number pops `1.0 → 1.3 → 1.0` over 0.12 s per hit; tier-up keeps `comboTierFx`. `ComboCounter.TIERS` gets the 6th entry `{ name: 'TANRISAL!', c1: '#ffffff', c2: '#40ffd0', glow: '#20ffc0', size: 138, shake: 8 }`.

### 5.10 Hit marker, damage direction, low HP

* **Hit marker** (`Crosshair.ts`): four diagonal ticks around the reticle, scale `1.0 → 1.35 → 1.0` in 100 ms; white normal, gold `#ffcc33` crit, red `#ff3b3b` kill (+40 ms); fired from `damage` events with `sourceId === local`. Projectile hits add a quiet `hit_flesh` "tink" (0.4) so ranged hits are confirmed.
* **Damage direction** (`hud/DamageDirection.ts`): red wedge on the screen edge toward the attacker for 0.6 s when hurt (> 5% max HP).
* **Low HP** (< 25%): red vignette pulse 1.2 Hz (alpha ≤ 0.25) and canvas `saturate(0.75)`; heartbeat sfx optional.

### 5.11 Impact material and audio layering (`EnemyDef.hitMaterial`, vfx-audio)

| `hitMaterial` | Impact sfx | Impact vfx |
|---|---|---|
| `flesh` (default) | `hit_flesh` | `hit_blood` |
| `bone` (skeletons) | `hit_bone` | `death_bones` chips |
| `metal` (armoured) | `hit_metal` / `hit_armor_plate` | `hit_spark` bright |
| `stone` (golems) | `hit_blunt` | rubble chips |
| `goo` (slimes, oozes) | `water_impact` | green drops |
| `ghost` | `hit_magic` | small `shadow_burst` |
| `wood` (treants, props) | `hit_blunt` | wood chips |

Per hit: swing sfx at windup start (`swing_light` / `swing_heavy`, pitch ±6%), impact by material (above, volume per §5.2), crit layer, weight thump layer, voice bark by chance (light 10%, medium 20%, finisher 45%, heavy 70%, ultimate 100%; one global bark per 2.5 s; voice pack by class: `voice_warrior_*` knight/barbarian/rogue/etc., `voice_mage_*` mage), combo pitch +2% per tier (cap +10%), player hurt `player_hurt` + hurt voice (cd 1.5 s), kill `enemy_death_*` by family.

### 5.12 Weapon trails

`vfx/Ribbon.ts` (exists): 10 samples; lifetime light 0.14 s / medium 0.18 / finisher 0.28 / heavy 0.34; width 0.5 / 0.6 / 0.9 / 1.1 m; colour = damage-type colour with a white core (40% of the width) on finisher+; upgrade glow lengthens the ribbon by `1 + 0.04 × N` (`WeaponGlow`).

### 5.13 Combo tuning pass (basic chains)

Nominal damage rate of a chain, from `data/skills.ts`: `coefPerSec = Σ coef_i / Σ cadence_i`, `cadence_i = chain_{i−1} + hitTime_i / animSpeed_i` (the next step may start `chain` seconds after the previous hit; the loop wraps from the last step to step 1). Values computed from the current data:

| Class | Σ coef | Cadence (s) | Current coef/s | Target coef/s | Change |
|---|---:|---:|---:|---:|---|
| Şövalye (tank) | 1.0 + 1.05 + 1.3 + 2.0 = 5.35 | 1.476 | **3.62** | 3.0 | steps ×0.83 → 0.83 / 0.87 / 1.08 / 1.66 (**option T**: apply only if GDD_V2 keeps the Knight's default spec a tank; a damage spec gets its multiplier from its spec row) |
| Barbar (2H bruiser) | 1.1 + 1.1 + 1.0 + 2.2 = 5.4 | 1.604 | 3.37 | 3.3 | leave |
| Büyücü (caster, all 3 bolts hit / single target) | 0.95 + 0.95 + 3×0.65 = 3.85 (2.55 single) | 1.107 | 3.48 / 2.30 | 3.3 / 2.4 | leave |
| Haydut (rogue) | 0.85 + 0.85 + 0.95 + 1.7 = 4.35 | 1.371 | 3.17 | 3.5 (+ bleed, backstab, combo points) | steps ×1.10 → 0.94 / 0.94 / 1.05 / 1.87 |
| Keşiş | per `GDD_CLASSES_V2` | — | — | 3.6 (fast fists, 5 steps, 1.15 tempo) | — |
| Okçu | — | — | — | 3.2 | — |
| Paladin | — | — | — | 3.0 | — |
| Nekromant | — | — | — | 3.0 + minions | — |
| Warlock | — | — | — | 3.2 + DoT | — |

Rules for every chain (new classes included): steps 1–2 `weight 0`, step 3 `weight 4` (medium), last step `weight 1` + `finisher: 1`; last-step coef ≥ 1.6 × step-1 coef; knockback ramp from §5.6; `stagger` param increases `3 → 3 → 5 → 9` (existing knight values) as the model; `lunge` (step-in) 0.5–1.4 m only when the soft target is ≤ 1.5 m beyond range (existing); `root: 1` only on the finisher. The numbers live in `data/skills.ts` (`SkillDef.damage.coef`, `params`) and `combat/feel.ts` only.

### 5.14 Verification in `dev/combat.html` (combat module owns `src/dev/combat.ts`)

* **Panel "Vuruş Hissi v2"**: a slider for every number in §5.2/§5.7/§5.8 bound to the live `FEEL` object; **A/B toggle** `v1 ⇄ v2`; buttons "Hafif / Orta / Bitirici / Ağır / Ultimate vuruş" that force the weight on the nearest dummy; toggles "Zorla Kritik", "Zorla Öldürme", "Seçici dondurma"; URL `?slowmo=0.25` scales global time for inspection.
* **Telemetry overlay**: last hit's weight, hit-stop ms (victim / attacker), trauma, kick, FOV kick, flash ms, active freezes, shake entries, budget used, hits/s, combo tier.
* **Automated assertions** (`tools/combat-sim/feel.mjs`, node with mocked `G`, reusing `tools/combat-sim/{harness,hooks,input}.mjs`):
  (a) hit-stop ≤ 160 ms per 0.3 s window at 10 hits/s;
  (b) combined trauma ≤ 0.85 and < 0.02 after 1.2 s;
  (c) camera kick spring returns to < 0.01 m within 0.6 s;
  (d) input → first swing frame ≤ 66 ms (4 frames at 60 Hz) with the input harness;
  (e) knight 4-chain at tempo 1.0 completes in 1.5 ± 0.15 s (cadence column above) and never double-fires a step;
  (f) selective freeze never freezes a non-participating enemy (`anim` time advances);
  (g) no two slow-mos within 1.2 s except boss death;
  (h) combo drain drops exactly one tier per 0.8 s.
* **Visual checklist** (scale-0.4 screenshots, one agent only): light vs finisher vs ultimate on one dummy show distinct flash colours, squash, spark counts; crit shows gold; boss hit shows capped hit-stop; no persistent model offset after 1 s.

---

## 6. Item level (ilvl) and stats (Eşya Seviyesi ve Statlar)

Existing rules that stay (GDD_SYSTEMS): drop ilvl per source (§4.3), `requiredLevel = clamp(ilvl − 2, 1, 60)`, weapon `(4 + 2.5·ilvl) × typeMult`, armour `(10 + 4.2·ilvl) × slotMult × weightMult`, affix tier gates `TIER_GATES = [1, 12, 24, 36, 50, 72]`, rarity affix counts, +N upgrade table. This section adds: content bands, a **stat-budget currency**, the way the character's Eşya Seviyesi is computed and shown, upgrade equivalence, soft caps and gating.

### 6.1 Item-level bands per content tier

| Content | Enemy level | Loot ilvl | Recommended Eşya Seviyesi (effective, §6.4) | Gate |
|---|---|---|---|---|
| Open world region *R* (levels a–b) | camp range | monster level (+0 Sıradan/Sürü, +1 Seçkin, +2 Ara Patron, +3 Patron), cap 60 | `round((a + b) / 2)` (e.g. Kurt Ormanı 6) | none |
| Crafted gear (§1.12) | — | 3–8 / 14–19 / 25–30 / 36–41 / 47–52 / 56–60 (tiers 1–6) | — | skill + level |
| Normal: Kemik Mahzeni | 8–18 (party avg clamped) | level (+3 boss) | 10 | portal level 8 |
| Normal: Kızıl Dökümhane | 18–28 | level (+3 boss) | 20 | level 18 |
| Normal: Buzul Tahtı | 30–40 | level (+3 boss) | 32 | level 30 |
| Normal: Gölge Tapınağı | 42–52 | level (+3 boss) | 44 | level 42 |
| Kahramanlık (heroic) | 50–60 | 50–63 (boss +3, cap 63) | 52 | level 50 + Normal clear |
| Mitik 0 | 60 | trash 61, boss 63, chest 62 | 58 | level 60 + Kahramanlık clear; host option `minIlvl 55` |
| Mitik+ key *k* | 60 | trash/elite `60 + k` (cap 75); boss `60 + k + 2` (cap 77); chest `60 + 2·min(k,15)` (cap 90); vault `63 + 2·min(k,15)` (cap 93) | `60 + 3k` | key owner; host option `minIlvl` |
| Raid **Kadim Kale** (A2, assumed) — Normal / Heroic / Mythic | 60 | trash 66 / 76 / 86, boss 70 / 80 / 90 (cap 95) | 66 / 76 / 86 | host `minIlvl` 60 / 70 / 80 |
| PvP Gladyatör set (§7.7) | — | fixed 58 | — | Onur |

Recommended Eşya Seviyesi for Mitik+: 

| Key | Chest ilvl | Rec. effective ilvl `60 + 3k` |
|---:|---:|---:|
| +2 | 64 | 66 |
| +5 | 70 | 75 |
| +8 | 76 | 84 |
| +10 | 80 | 90 |
| +12 | 84 | 96 |
| +15 | 90 | 105 |
| +18 | 90 | 114 |
| +20 | 90 | 120 |

(HP scales ×1.10 and damage ×1.08 per key while loot rises only +2 ilvl per key; the gap is closed by **+N upgrades** (§6.4), sets, gems and talents, which is why the recommendation is expressed in *effective* ilvl.)

### 6.2 Stat budget (Budget Points) per ilvl and slot

**Currency:** 1 affix roll at the **midpoint of its tier** = **100 BP**. The tier midpoints come from `data/affixes.ts` (`TIER_GATES`, ranges as shipped); the table lists the value of **one 100-BP roll** by ilvl band. Use it to price anything that grants stats (food, elixirs, gems, set bonuses, PvP gear, crafting catalysts).

| Stat (one roll = 100 BP) | T5 (ilvl 1–11) | T4 (12–23) | T3 (24–35) | T2 (36–49) | T1 (50–71) | T0 (72–95) |
|---|---:|---:|---:|---:|---:|---:|
| Main attribute (`str`/`dex`/`int`) and `vit` | 4.5 | 9.5 | 16.5 | 25.5 | 36.5 | 49 |
| `damagePct` | 3.5% | 5.5% | 8% | 11% | 14% | 17.5% |
| Elemental / physical / melee / projectile `…DamagePct` | 6.5% | 11% | 16.5% | 23% | 30.5% | 38.5% |
| `critChance` (pp) | 0.75 | 1.3 | 1.9 | 2.65 | 3.55 | 4.55 |
| `critDamage` (pp) | 7 | 12.5 | 19 | 26.5 | 34.5 | 42.5 |
| `attackSpeed` / `castSpeed` | 3.5% | 5.5% | 7.5% | 9.5% | 11.5% | 14% |
| `maxHp` (flat) | 15 | 35 | 70 | 122.5 | 187.5 | 262.5 |
| `armor` (flat) | 11.5 | 30 | 62.5 | 107.5 | 162.5 | 227.5 |
| single resist (pp) | 6.5 | 11 | 16.5 | 23 | 30.5 | 37.5 |
| `cdr` | — | 2.5% | 4.5% | 6.5% | 8.5% | 10.5% |
| `moveSpeedPct` (boots) | 3.5% | 5.5% | 7.5% | 9.5% | 11.5% | 13.5% |
| `hpRegen` (/s) | 1.5 | 4 | 8 | 14.5 | 23.5 | 34.5 |

**Per-item budget** (the existing rarity rules, restated as BP): Büyülü 1–2 lines ≈ 150 BP, Nadir 3–4 lines ≈ 350, Destansı 5 lines ≈ 500, Efsanevi/Set 4 lines + unique effect ≈ 400 BP + effect (valued ≈ 100–200). Implicit stats of jewellery/belts and the base weapon/armour numbers are *on top* (they follow the §4.4 formulas). **Slot weights for the average**: all 12 equipment slots count 1; a two-handed weapon counts for `weapon` **and** `offhand` (§6.3).

**Rules for new stat sources** (so nothing outgrows gear):

| Source | Budget rule |
|---|---|
| Food / elixir category | ≤ **1 roll of the content tier** per category; max 4 active categories (3 elixir categories + food) ⇒ ≤ 400 BP ≈ 8% of a 4,800-BP L60 character |
| Gem (grade g) | as in GDD_SYSTEMS §5.5 table; check `value(g) ≤ 1 roll` of the grade's matching tier |
| Set bonus 2-piece / 4-piece / 6-piece | ≤ 100 / 150 / 250 BP (excluding behavioural effects) |
| PvP gear | stats ≈ ilvl 52 PvE budget **plus** the PvP-only stats of §7.7 |
| Profession mastery (§1.8) | ≤ 60 BP at skill 300 per profession |
| Consumable potions/flasks | healing only; no BP |

**Intra-tier scaling** (fixes the plateau where ilvl 50 and ilvl 71 gear roll identical affix ranges): at roll time `value = roll × (1 + 0.0035 × (ilvl − tierGate))`, capped at `+8%`. Implemented in `ItemGen.rollAffixOf` (items module); the stored `tier` index and tooltips' tier range display are unchanged (the tooltip range shows the scaled min–max). Effect: ilvl 71 gear is ≈ +7.4% stronger in affixes than ilvl 50 gear, so Mitik+ loot at ilvl 64–71 is a real upgrade before the T0 gate (72) opens.

### 6.3 How the character's Eşya Seviyesi is computed and shown

Today `CharacterState.itemLevel()` averages the **filled** slots only (a character wearing one item shows that item's ilvl). New pure function `systems/ItemLevel.ts`:

```ts
export const UPGRADE_ILVL = [0, 1, 2, 4, 5, 7, 9, 11, 14, 16, 19, 22, 25, 28, 31, 35];      // §6.4
export const itemIlvlEquiv = (it: ItemInstance): number => it.itemLevel + UPGRADE_ILVL[Math.min(15, it.upgrade ?? 0)];
export function computeItemLevel(eq: Partial<Record<EquipSlot, ItemInstance>>): {
  avg: number;      // effective: round( Σ itemIlvlEquiv over 12 slots / 12 )
  base: number;     // round( Σ itemLevel / 12 )
  bonus: number;    // avg − base (upgrade contribution)
  empty: EquipSlot[];
};
```

Rules: 12 slots; an empty slot counts **0**; an equipped two-handed weapon (`ItemBaseDef.twoHanded`) counts twice (weapon + offhand), so staves/2H axes are not penalised; Haydut dual daggers count both; `CharacterState.itemLevel()` returns `computeItemLevel(...).avg` (so `CharacterSummary.itemLevel`, party frames, room-join checks and `/who` all use the effective value); `itemLevelBase()` returns `base`.

Display:

| Where | What |
|---|---|
| Character panel header | "**Eşya Seviyesi 142**" with the band colour; small "(+9 yükseltme)" when `bonus > 0`; tooltip lists each slot's ilvl (+N), empty slots in red ("Boş: Yüzük 2 (−6)") |
| Colour bands | < 20 grey `#9d9d9d`, 20–39 white, 40–59 green `#1eff00`, 60–79 blue `#0070dd`, 80–99 purple `#a335ee`, ≥ 100 orange `#ff8000` |
| Item tooltip | "Eşya Seviyesi 60" and, when upgraded, "(efektif 66)" |
| Party frames / Online room card | tiny number next to the name / `minIlvl` badge |
| Region banner, portal and keystone UIs | "Önerilen Eşya Seviyesi: 52" coloured by `ratio = yours / rec`: ≥ 1.0 green, ≥ 0.9 yellow, < 0.9 red |

### 6.4 Upgrade (+N) contribution (ilvl-equivalent)

`upgradeIlvl(N) = round(N × (1 + 0.0887 N))` → table `UPGRADE_ILVL` above: +5 = +7, +10 = +19, +12 = +25, +15 = +35. Used for **display, recommendations and host gating only**; the real power comes from the existing upgrade table (weapon %, armour %, efsun bonus from +10). Examples: an epic crafted ilvl-60 piece at +12 ≈ 85; a +15 piece ≈ 95 (above the 90 chest cap, as intended for the Metin2-style chase); Mitik+ +10 (rec. 90) ≈ twelve slots at ilvl 70 average with +9 upgrades.

### 6.5 Spec stat weights (for tooltip comparison and smart loot)

Weights are 0–10 per archetype; `itemScore = Σ_s weight[s] × value_s / REF_s × 10`, where `REF_s` is the T1 roll midpoint (the 100-BP value at ilvl 50–71). The tooltip shows "▲ +6%" in green / "▼ −4%" in red when the compared item's score differs by ≥ 3%. Role comes from the character's spec (`GDD_V2`), fallback by class: Şövalye tank, Barbar melee, Büyücü caster, Haydut ranged/rogue; new classes per their spec.

| Stat | `REF` | Tank | Melee DPS | Caster DPS | Ranged / Rogue | Healer |
|---|---:|---:|---:|---:|---:|---:|
| Main attribute | 36.5 | 8 | 10 | 10 | 10 | 9 |
| `vit` | 36.5 | 10 | 4 | 4 | 4 | 6 |
| `maxHp` / `maxHpPct` | 187.5 / 11.5% | 8 | 3 | 3 | 3 | 5 |
| `armor` / `armorPct` | 162.5 / 85% | 9 | 3 | 1 | 2 | 2 |
| single resist / `resAll` | 30.5 / 12 | 6 / 8 | 2 / 3 | 3 / 4 | 2 / 3 | 3 / 4 |
| `blockChance` | 7.5 | 8 | 0 | 0 | 0 | 0 |
| `critChance` | 3.55 | 3 | 9 | 8 | 10 | 5 |
| `critDamage` | 34.5 | 2 | 8 | 7 | 8 | 3 |
| `attackSpeed` / `castSpeed` | 11.5% | 4 | 9 | 9 | 9 | 7 |
| `damagePct` and type `…DamagePct` | 14% / 30.5% | 3 | 10 | 10 | 10 | 2 |
| `cdr` | 8.5% | 7 | 6 | 6 | 6 | 8 |
| `resourceRegenPct` | 25.5% | 5 | 3 | 8 | 3 | 9 |
| `hpRegen` | 23.5 | 5 | 2 | 2 | 2 | 4 |
| `lifeSteal` | 1.8 | 3 | 5 | 2 | 4 | 0 |
| `moveSpeedPct` | 11.5% | 3 | 5 | 5 | 6 | 5 |
| `dodgeChance` | 3.45 | 3 | 3 | 3 | 5 | 2 |
| `staggerPct` | 25.5% | 5 | 4 | 0 | 2 | 0 |
| `goldFindPct` / `magicFindPct` | — | 1 | 1 | 1 | 1 | 1 |

Data: `src/data/statWeights.ts` exports `STAT_REF: Partial<Record<StatId, number>>`, `ROLE_WEIGHTS: Record<'tank'|'melee'|'caster'|'ranged'|'healer', Partial<Record<StatId, number>>>`, `itemScore(item, role): number`.

### 6.6 Diminishing returns (soft caps)

Applied inside `StatCalc.computeStats` **before** the existing hard caps: `eff = raw ≤ soft ? raw : min(hard, soft + (raw − soft) × slope)`.

| Stat | Soft | Hard (existing cap) | Slope past soft | Example |
|---|---:|---:|---:|---|
| `critChance` | 0.40 | 0.75 | 0.5 | raw 0.60 → 0.50 |
| `attackSpeed` / `castSpeed` | 0.50 | 1.00 | 0.5 | raw 0.90 → 0.70 |
| `cdr` | 0.25 | 0.40 | 0.5 | raw 0.35 → 0.30 |
| `dodgeChance` | 0.20 | 0.40 | 0.5 | raw 0.30 → 0.25 |
| `moveSpeedPct` | 0.40 | 0.75 | 0.5 | raw 0.60 → 0.50 |
| `blockChance` | 0.30 | 0.50 | 0.5 | raw 0.45 → 0.375 |
| `ccReductionPct` | 0.40 | 0.60 | 0.5 | raw 0.55 → 0.475 |
| `critDamage` | +1.00 | none | 0.6 | raw +1.50 → +1.30 |
| Armour mitigation | asymptotic `armor / (armor + 50L + 200)` already | 0.75 | — | — |
| Resists | linear | 0.75 (+0.10 with specials) | — | — |
| `lifeSteal` | heal ≤ 10% max HP per rolling second (existing) | — | — | — |

`damagePct` and the type buckets are additive "increased" and get no DR (balance comes from the "more" multipliers in specials). The stat tooltips show `75% (kısıtlı)` when a soft cap is active.

### 6.7 Gating summary

* **Hard**: character level (portals, tier learning, `requiredLevel`), key ownership (Mitik+), Kahramanlık/Mitik 0 clear prerequisites (existing).
* **Room-level ilvl gate (new)**: `RoomAnnouncement.minIlvl?: number` set by the host (default = 0; the party UI offers presets "Önerilen × 0.9"); `NetSession` rejects a join whose `CharacterSummary.itemLevel < minIlvl` with "Eşya Seviyesi yetersiz (gerekli 55)". Shown on the room card.
* **Soft**: recommendation colours (§6.3), a one-time warning toast when entering content with `ratio < 0.8`.

---

## 7. Open-world PvP (later phase P3)

### 7.1 Principles and constraints

* The game is a **P2P party room** of 5 (`MAX_PARTY_SIZE`); entity ids already allow 15 players. Open-world PvP is therefore **inside one room** (A7): (1) **duels** in any room; (2) a **`pvp` room mode** ("Çatışma Odası") with up to **8 peers** and two teams for flagged fights, PvP zones and the contested mine. Cross-room PvP is impossible without servers.
* Authority follows `ARCHITECTURE.md`: outgoing damage is computed by the **attacker**; **incoming hits are resolved by the victim's peer** (i-frames, dodge, block fairness); the host only **validates and relays**.
* PvP never costs items, gold or XP and never uses the real death-penalty; duels cannot kill.
* Phases: **P3a** duels + flag/duel UI + `pvp` channel; **P3b** `pvp` room mode, teams, PvP zone rules, honor; **P3c** contested mine, ranks, vendor.

### 7.2 Flagging, zones, teams

| Topic | Rule |
|---|---|
| Safe zones | whole town scene; 20 m around region camps, dungeon portals and waypoints; 40 m around respawn stones. **No PvP damage inside** (a duel ring is the only exception). |
| PvP flag (`pvpState`) | `'off' \| 'flagged' \| 'zone' \| 'duel'`. Toggle with `/pvp` or the crossed-swords button on the player frame. **On**: instant (5 s grace in which you can still back out). **Off**: needs **5 minutes out of combat** outside PvP zones (banner "Savaş bayrağı 4:12 sonra kalkacak"; any attack from/to a flagged player resets it). Inside a PvP zone the flag cannot be dropped; leaving a zone keeps it for **30 s**. |
| Minimum level | flagging requires level **20**. |
| Low-level protection | a PvP hit on a player whose level is more than **10 below** the attacker is ignored outside zones (toast "Düşük seviyeli oyuncuya saldıramazsın"); inside a zone levels are normalised by `levelScale` (§7.4). |
| Teams | in a normal (`coop`) room all players are one team: only **duels** are possible. In a `pvp` room the host assigns **Kızıl / Mavi** (balanced by `itemLevel`, re-balance only between matches); damage applies only across teams and only between flagged/zone players; AoE and chain skills ignore same-team and unflagged players. |
| PvP zones | the **Kızıl Maden** (§7.6) and optional host-defined circles; entering shows the banner "Savaş Bölgesi – PvP açık" (`ui:zoneName`), auto-flag (`zone`), `pvp:flag` event, map circle red. Dungeons and Mitik+ have **no** PvP. |
| Spawn protection | respawn at the nearest Kutsal Taş: 10 s `invulnerable` (breaks on attacking), 40 m no-hostile radius; each death within 60 s of the previous one adds **+5 s** to the respawn timer (max 30 s: "Yorgunluk"). |

### 7.3 Duels (`/düello <ad>`)

| Step | Rule |
|---|---|
| Invite | `/duello Ahmet` (or right-click a player → "Düelloya davet et"); target gets a dialog "Ahmet seni düelloya çağırıyor – Kabul / Reddet" (timeout 15 s, `ready_check` sfx). Not while either is in combat with enemies, dead, or in a dungeon. |
| Start | on accept: 3 s countdown banner "3 – 2 – 1 – DÜELLO!"; a **ring of radius 12 m** is drawn at the midpoint (`waypoint_glow`, flag pole); both players are set to `pvpState 'duel'`. |
| Boundary | warning at 10 m from the centre; outside **16 m for 5 s** = forfeit. |
| End | a player at ≤ 0 HP **does not die**: HP is floored at 1, the duel ends, the loser stays standing in a "Yenildi" state (`invulnerable` 3 s, then HP restored to 30%); winner banner "Ahmet düelloyu kazandı!". Both restored: resource full, **cooldowns are not reset** (host option `duelResetCooldowns`). Leaving the room or the scene = forfeit. |
| Rewards | 10 Onur per win, max 5 wins per day against distinct opponents; stats `flags['duel.wins']`, `flags['duel.losses']`. |
| Enemies | duelling players are ignored by newly aggroing enemies inside the ring; already aggroed enemies are cleared by leashing as usual. |

### 7.4 Damage scaling, healing, crowd control (all constants in `PVP` in `combat/feel.ts`'s sibling `combat/pvp.ts`)

```ts
export const PVP = {
  damageMult: 0.30,                 // all player→player damage vs PvE numbers
  healMult: 0.60,                   // heals on a player hit by a player in the last 8 s (potions included)
  ilvlScale: (att: number, vic: number) => clamp(1 + 0.004 * (att - vic), 0.8, 1.25),
  levelScale: (att: number, vic: number) => clamp(1 + 0.03 * (att - vic), 0.7, 1.3),   // inside zones only
  critMultCap: 1.75,
  maxHitFracOfMaxHp: 0.45,          // no single hit removes more than 45% of max HP
  executeCapFrac: 0.25,             // execute-type skills cap at 25% max HP per hit
  lifeStealMult: 0.5,
  knockbackMult: 0.5,
  hitCapPerIlvl: 55,                // host sanity cap on a pvphit amount: max(120, 55 × attackerIlvl)
};
```

`final = incomingAfterMitigation × PVP.damageMult × PVP.ilvlScale(att.ilvl, vic.ilvl) × (zone ? PVP.levelScale : 1)`, then min with `0.45 × victim.maxHp`. Target time-to-kill 1v1 at equal gear: **8–12 s**; a single burst window (45 s cooldown) can kill in ≤ 5 s only with the 90 s cooldown stacked; a healer cannot be killed by one DPS (heal × 0.6 still out-sustains).

**Crowd control vs players** (DR groups are those of GDD_SYSTEMS §1.8: `hard` = stun/knockdown/freeze/sleep, `fear`, `root`, `silence`; slows are not on DR):

| Application in an 18 s window | Effect |
|---|---|
| 1st / 2nd / 3rd | 100% / 50% / 25% duration |
| 4th | immune for 15 s |

Duration caps vs players: stun 3 s, freeze 2.5 s, fear 2.5 s, root 3 s, silence 3 s, knockdown 1.2 s; slow strongest-only, floor at −50% move speed; `ccReductionPct` counts at most 40% vs players. A **dodge roll breaks `root` and `slow`** (not stuns) in PvP.

**Skill adjustments** (`SkillDef.params.pvp*`/tags, applied by the victim's `hitLocalPlayer`): `invulnerable` ≤ 2 s; `stealth` is revealed within 8 m of an enemy player and breaks on damage; `taunt` becomes "Alay" = 30% slow for 2 s (no forced target); `fear` uses the DR table; potions: shared 10 s cooldown, healing × 0.6; `thorns` does not reflect onto players.

### 7.5 Authority and net protocol (who resolves PvP hits)

New net channel `pvp` (append to `NetChannels`; net module sends and registers):

```ts
pvp:
  | { k: 'flag'; on: boolean; team?: 0 | 1 }
  | { k: 'duel'; op: 'invite' | 'accept' | 'decline' | 'start' | 'end'; to?: string; ring?: [number, number, number]; winner?: string }
  | { k: 'hit'; to: string; amount: number; type: DamageType; crit: boolean; skillId?: string; statuses?: StatusApply[]; knockback?: number; dir: [number, number]; aLvl: number; aIlvl: number; seq: number }
  | { k: 'ack'; to: string; amount: number; crit: boolean; hp: number; killed?: boolean; seq: number }
  | { k: 'kill'; killer: string; victim: string; assists: string[] }
  | { k: 'score'; teams: [number, number] };
```

1. **Attacker** finds hostile remote avatars in its `SkillSystem` hit test (remote `Player` entities flagged hostile), computes the outgoing roll with `Combat.rollOutgoing` and sends `hit` to the host with `to = victim peerId`.
2. **Host** validates and relays **to the victim only** (`sendTo`): `from`/`to` are peers; both `flagged`/`zone`/`duel` and hostile (host keeps the `pvpState` map from `flag`/`duel` messages); attacker-to-victim distance ≤ 40 m (last `pstate`); ≤ 20 hits/s per attacker; `amount ≤ max(120, 55 × aIlvl)` (`PVP.hitCapPerIlvl`); safe zones rejected. Invalid ⇒ silently dropped (+ counter; > 30 invalid in 10 s ⇒ the host mutes that peer's PvP).
3. **Victim peer** runs `Combat.hitLocalPlayer(hit)` with `IncomingHit.fromPlayer = true`: i-frames, dodge, block, armour/resist, absorbs, then the `PVP` scaling and DR; applies the result to its own HP; replies `ack` to the attacker (numbers, hit marker, hit-feel on the remote avatar) and broadcasts the existing `pdeath` on death plus `kill`.
4. **Attacker feedback**: an immediate cosmetic "contact flash" on the remote avatar at swing contact (no number), the real number and hit-feel on `ack` (≈ one RTT later).
5. **Kill credit**: the victim peer keeps `lastDamagers` (10 s); `kill` carries killer and assists; the killer's peer awards its own Onur after checking the victim was hostile and in range (≤ 60 m).
6. **Projectiles/AoE**: simulated by the attacker, tested against remote avatars on the attacker's machine (remote positions are interpolated ≈ 100 ms behind; accepted, no lag compensation).
7. **Trust model**: friends' rooms. The host cap and rate limits stop casual abuse; a modified client can still lie about its own outgoing damage. Documented, not solved.

Room mode: `RoomAnnouncement.mode?: 'coop' | 'pvp'` and `maxPlayers` up to `MAX_ROOM_SIZE = 8` for `pvp` (`MAX_PARTY_SIZE` stays 5 for `coop`).

### 7.6 PvP zone: the contested mine (Kızıl Maden, `pvp_maden`, region of zone Z5, levels 48–55)

Only active in `pvp` rooms; in `coop` rooms the same place is an ordinary mine with personal nodes.

| Element | Spec |
|---|---|
| Region | `pvp_maden` · Z5 `(40, 10)` · r 26 m · `pvp: true` · banner "Kızıl Maden – Savaş Bölgesi" |
| Nodes | 6 `ore_dragon` (15% rich), 2 `ore_gold`, **shared** (host-authoritative): depletion/respawn via the existing `gate` channel with key `node:<id>` (`open:false` = depleted); respawn 120 s |
| **Kontrol Noktası** | circle r 6 m at the centre. Capture rate `1.5 % / s × 1 / √n` (n = same-team players inside); only the uncontested team progresses; decays 1 %/s when empty; contested = frozen. 100% = captured. |
| Reward of holding | team buff **Madenci Lonca**: +15% gather speed, +20% gather XP; **15 Onur per 10 s tick** to every owner within 30 m |
| Event | every 5 min a **Zengin Damar** (×3 yield, 60 s) spawns at the point |
| PvE | region creatures (`bolge_ejder` rosters) still spawn; honor from them: 0 |

### 7.7 Rewards: Onur, ranks, titles, vendor

* Currency **Onur Puanı** (`onur_puani`, `MaterialDef` kind `currency`, shown on the character panel). Earned: kill `25 × clamp(1 + 0.1 × (victimLevel − killerLevel), 0.3, 1.5)`; assist 10; capture tick 15; duel win 10 (cap 50/day). **Anti-farm**: same victim 100% → 50% → 25% → 0 within 30 min; victims more than 5 levels below the killer or idle (no input for 30 s) give 0. Daily cap **1,500**.
* **Ranks** by lifetime Onur: Acemi 0 · Er 500 · Çavuş 2,000 · Teğmen 6,000 · Yüzbaşı 15,000 · Binbaşı 35,000 · Albay 70,000 · Tuğgeneral 130,000 · General 250,000 · Kadim Komutan 500,000. Rank shown on nameplates of enemy-team players and in `/who`; titles unlock from rank 3 ("Savaş Çavuşu"…).
* **Savaş Ustası** NPC (town, Eğitim Alanı `(-30, 30)`): sells

| Item | Cost (Onur) | Notes |
|---|---:|---|
| Gladyatör helm / shoulders / gloves / boots | 800 / 800 / 700 / 700 | ilvl 58 epic, per armour weight; stats ≈ ilvl-52 PvE budget **plus** `pvpPower` +2% and `pvpResilience` +2% per piece |
| Gladyatör chest / legs | 1,500 / 1,200 | same |
| Gladyatör weapon | 3,000 | same |
| Set bonus | — | 2 pc: +4% `pvpPower`; 4 pc: +6% `pvpResilience`; 6 pc **Savaş Ruhu**: killing a player heals 10% max HP + 3 s `haste` |
| Silah parlaması (Kızıl / Mavi) | 500 | cosmetic `WeaponGlow` colour |
| Zafer Pelerini | 1,000 | cosmetic cape tint |

`pvpPower` / `pvpResilience` are new `StatId`s (L-00): they multiply only PvP damage dealt / taken (`damage × (1 + pvpPower) × (1 − pvpResilience)`) and are worth 100 BP at 2% per roll.

### 7.8 Anti-grief rules (summary)

1. No PvP in safe zones, dungeons, Mitik+; unflagged players can never be damaged by players.
2. Flag requires level 20; ±10 level protection outside zones; flag drop needs 5 min (no instant escape), 30 s lingering flag after leaving a zone.
3. Duels are opt-in with a 15 s invite and cannot kill; leaving = forfeit.
4. Respawn protection (10 s invulnerable, 40 m radius) and escalating respawn timer ("Yorgunluk") against spawn camping.
5. Honor anti-farm (diminishing per victim, low-level and AFK victims give 0, daily cap).
6. No XP/gold/item loss in PvP; CC diminishing returns and hit caps (45% max HP) prevent chain-stun and one-shot gankings.
7. `/engelle` hides a griefer's chat; the room host can set the room back to `coop` (disables flagging) at any time.
8. All PvP hit messages are host-validated (range, rate, amount cap); spamming invalid hits mutes that peer's PvP.

### 7.9 UI and events

Flag button + countdown on the player frame; red nameplates for hostile players ("Çavuş Ahmet", level, rank); duel invite dialog; ring/flag VFX; honor toast "+25 Onur"; kill banner "Ahmet, Mehmet'i alt etti!" (chat `system` line); death recap shows killer + last 5 hits; map shows PvP circles (red) and capture progress bar. Events (L-00): `pvp:flag {on, zone}`, `pvp:duel {state}`, `pvp:honor {amount, total, rank}`.

---

## 8. Implementation plan (Haiku packages)

Conventions for every package: end with `npx tsc --noEmit` = 0 errors in your files; Turkish UI strings; never throw from a frame loop; touch **only** the files listed (shared files only via **L-00**); use `G` services and events; numbers come from this document and live in `src/data/*` or `combat/feel.ts`. "Owners" are the ARCHITECTURE modules; a package with two owners lists both and is split by file. `dev:` names the dev page that proves the package. Wave order is the recommended scheduling: **0 → 1 (hit feel + camera, the user's priority) → 2 (professions) → 3 (regions/enemies) → 4 (chat) → 5 (ilvl) → 6 (PvP/extras)**; waves 2–5 can interleave by owner (≤ 3 agents at a time per ROADMAP).

### 8.1 Wave 0 — foundations

| ID | Owner | Deps | Task |
|---|---|---|---|
| **L-00** | core (orchestrator) | — | **One append-only package for every shared file.** `types/professions.ts` (new, §1.2 verbatim). `types/character.ts`: `CharacterSave.professions?`. `types/items.ts`: `ItemInstance.craftedBy?: string`. `types/enemies.ts`: `EnemyDef.skin?: SkinDef`, `EnemyDef.hitMaterial?`, `EnemyVisual.texture?: string`, `BossDef.introCam?: false \| {hold?: number; dist?: number; height?: number}`. `types/dungeons.ts`: `NodeSpawnDef {type: string; pos: [number, number]; rich?: boolean}`, `DungeonDef.nodes?`, `DungeonDef.regions?: string[]`. `types/stats.ts`: `pvpPower`, `pvpResilience` (+ `STAT_INFO` "PvP Gücü", "PvP Direnci"). `types/net.ts`: widen `chat` (§3.8), add `pvp` (§7.5). `net/messages.ts` (types only): `LobbyChannels.lchat`, `RoomAnnouncement.minIlvl?`, `mode?`, `MAX_ROOM_SIZE = 8`. `core/events.ts`: new events `gather:progress {id: number; t01: number; label: string; color: string; tag?: string; tagColor?: string}`, `gather:done {id: number; ok: boolean}`, `profession:skillUp {prof: string; skill: number}`, `craft:done {recipeId: string; count: number}`, `region:entered {id: string; name: string; subtitle: string; levelRange: [number, number]; danger: number}`, `region:left {id: string}`, `camera:kick {dx: number; dz: number; amount: number}`, `camera:fov {deg: number}`, `chat:insertLink {item: ItemInstance}`, `pvp:flag`, `pvp:duel`, `pvp:honor`; widen `net:chat` (§3.8). `core/Input.ts`: `professions` (`KeyP`, "Meslekler"), `camShoulder` (`KeyV`, "Omuz Değiştir"). `core/Settings.ts`: fields of §3.2 and §4.14, `screenShake` default 0.7. `entities/Interactable.ts`: hold fields (§1.6). `entities/AnimController.ts`: `freezeUntil` honoured in `update`. `entities/Actor.ts`: `hitFreezeUntil`, frozen forcedMove scaling. `game/G.ts`: `professions`. |
| **L-00b** | vfx-audio | L-00 | Add VFX ids `wood_chips`, `rock_chips`, `leaf_burst`, `gather_sparkle` (spawnable presets reusing `hit_spark`/`heal_burst` internals) and SFX ids `chop_wood`, `mine_rock`, `pick_herb`, `skin_cut`, `tree_fall`, `craft_done`, `chat_whisper` mapped to existing files (`hit_blunt`, `hit_metal`, `item_pickup`, `hit_flesh`, `land`, `upgrade_success`, `chat`). Implement `G.vfx.flash2(model, c1, ms1, c2, ms2)` (§5.5). Unknown ids must stay silent. dev: `vfx.html` buttons for the 4 presets. |

### 8.2 Wave 1 — hit feel (priority) and camera

| ID | Owner | Deps | Task |
|---|---|---|---|
| **L-50** | combat | L-00 | `combat/feel.ts`: extend `HitWeight` (`medium parry stagger_break backstab`), replace the `FEEL` numbers with §5.2 (hit-stop, trauma, shake duration, kick, FOV, flash ms, jiggle/squash multipliers, particle counts), keep old values as `FEEL_V1`, add `FEEL.selectiveFreeze`, `FEEL_WEAPON` (§5.3), `FEEL.inputBuffer 0.30`, `comboTiers/comboBonus` v2 (§5.9). Export `weightRow(weight)` and `weaponMul(kind)`. dev: combat. |
| **L-51** | combat | L-00, L-50 | `Combat.noteFeel/flushFeel` → per-weight rows + weapon multipliers; **selective hit-freeze** (§5.4): `freezeActors(ids, ms)` setting `actor.hitFreezeUntil` + `anim.freezeUntil` for attacker + victims; global `hitstop` event only for `ultimate`, `stagger_break`, hurt > 15%, boss kill; per-0.3 s cap 160; emit `camera:shake`, `camera:kick`, `camera:fov` per the table; `PlayerController` reads `weaponKind`. dev: combat. |
| **L-52** | vfx-audio | L-00b, L-50 | `vfx/feedback.ts`: two-stage flash via `flash2` (§5.5), `hitMaterial` → sfx/vfx map (§5.11) with the layered impact sounds (thump, crit, voice chance table, combo pitch +2%/tier, ≤ 3 impacts per 100 ms), trail ribbon lifetime/width table (§5.12), spark/chip counts from `weightRow`. dev: vfx.html. |
| **L-53** | combat | L-50, L-51 | Death fling (§5.6), chain knockback ramp, flinch chances, last-kill slow-mo + slow-mo table (§5.7) in `Combat.ts` (`slowmo`, `finalizeDeath`, `reactEnemy`); `reactCooldown` kept. |
| **L-54** | hud | L-00, L-50 | `Crosshair.ts` hit marker (§5.10); new `ui/hud/DamageDirection.ts`; low-HP vignette/saturate in `Overlays.ts`; `ComboCounter.ts` 6th tier + pop animation + drain (works with `ComboTracker` change in L-55). |
| **L-55** | combat | L-50 | `data/skills.ts` chain tuning (§5.13): set `params.weight` (0,0,4,1) on all four chains' steps, knockback ramp, optional option-T coef scaling (Şövalye ×0.83, Haydut ×1.10) behind a `TUNE_OPTION_T` const; `ComboTracker.ts`: tier drain (one tier per 0.8 s), chain-finish resource refund, `bonus` from v2 table. |
| **L-56** | combat | L-50…L-55 | `dev/combat.ts` panel "Vuruş Hissi v2" (sliders, A/B toggle, forced weight/crit/kill, telemetry overlay, `?slowmo`), `tools/combat-sim/feel.mjs` assertions (a)–(h) of §5.14. |
| **L-40** | player | L-00 | `ThirdPersonCamera.ts`: look-ahead, `kx` lerp, airborne dead zone, `cameraSmoothing`, zoom curves (pivot height, rest pitch pull, FOV by zoom), combat zoom, sensitivity (`cameraSensYRatio`, `cameraAccel`, precision mode), settings reads. dev: player. |
| **L-41** | scenes (+world) | L-00 | Move `townOccluders` → `scenes/SceneKit.ts` `collectOccluders(root, {classify})`; honour `userData.camClass`; wire into the outdoor branch of `DungeonScene.enter`; `world/OutdoorBuilder.ts` tags canopies `fade`, trunks proxy `solid`. |
| **L-42** | player | L-40, L-41 | Camera: `nearOccluders` pruning (0.25 s rebuild, `zoomCur + 8` m), 0.15 s hold + `2.5/s` prop ease-out, close-up player fade (`Player.setFade(alpha)`), shoulder-to-0 below 1.8 m. |
| **L-43** | world | L-41 | `world/OccluderFader.ts` (+ `render/psx` `uFade` uniform and Bayer discard); `Instancing.ts` per-instance `aFade` (or non-instanced near trees); setting `occluderFade`. dev: world. |
| **L-44** | player | L-00, L-40 | Shoulder swap: `camShoulder` tap/hold, auto-swap probes, 1.5 s cooldown; `PlayerController` forwards the action. |
| **L-45** | player | L-40 | Lock-on: Tab-hold, `setLockOn(target)` framing (yaw 0.62 mix, pitch 42%, auto-zoom bias, suspend rule), release conditions, boss auto-lock on `boss:engaged`. |
| **L-46** | player (+hud) | L-40 | `playCinematic(spec)` + boss-intro timeline (§4.12): letterbox + title card in `hud/Overlays.ts`, skip on input, `bossIntroCam` setting; hooks `boss:engaged`. |
| **L-47** | player | L-00 | Camera shake budget + `kick(dx,dz,amount)` + `camera:kick`/`camera:fov` listeners; FOV kick sources in `PlayerController` (dodge +4.5, perfect dodge, leap/charge via `skill:cast` tags). |
| **L-48** | panels-game | L-00 | `settings.ts` "Kamera" rows for every §4.14 setting (sliders/toggles/dropdowns, Turkish labels). |
| **L-19** | hud | L-00 | `ui/widgets/levelColor.ts` (`levelTier`, `LEVEL_COLORS`, `levelLabel`, §2.2); update `Nameplates.Plate.update` ("Sv. N", 6 colours, skull icon `ui-skull.svg`), target/boss frame level text. dev: hud. |

### 8.3 Wave 2 — professions (items/scenes/hud/panels)

| ID | Owner | Deps | Task |
|---|---|---|---|
| **L-01** | items | L-00 | `data/professions.ts`: `PROFESSIONS` (11 rows §1.1), `SKILL_TIERS`, `TIER_START`, `TOOLS` (24 + 3 rod), `skillUpChance(diff)`, `skillColor(diff)`, `bestTool(kind)`, `gatherSecEff(node, toolTier)`. |
| **L-02** | items | L-00 | `data/gatherMaterials.ts`: every material of §1.9 via `add()` loops (tiers/ids/names/prices/rarity/icons with `item-junk` fallback), food, essence, tool and Tarif definitions; imported by `data/materials.ts`. |
| **L-03** | items | L-01 | `data/nodes.ts`: `NODE_TYPES` (§1.5.1–1.5.3 all 20 rows with models, tints, times, yields, rares), `SKIN_TIERS` (§1.5.4), `SPECIES_RARES`; `getNodeType(id)`. |
| **L-04** | items | L-01, L-02 | `data/recipes.ts`: explicit rows (§1.11 A, C, D, E, F, G) + `genGearRecipes()` for B (tier/slot tables as data) → `RECIPES`, `getRecipe`, `recipesFor(prof, station)`; ≥ 268 entries; dev contentCheck verifies inputs/outputs exist. |
| **L-05** | items | L-01…L-04 | `systems/Professions.ts` class `Professions` (`G.professions`): `skill(prof)`, `tier(prof)`, `learnTier(prof)`, `bestToolTier(kind)`, `gatherInfo(nodeType, rich)`, `completeGather(nodeId, nodeType, rich)` (yield/rare/XP/skill-up, §1.7), `canCraft(recipe, qty)`, `craft(recipe, qty, catalyst?)` (§1.12), `professionStats(): StatBlock`, `activeFood()`, `onEnemyKilled(enemy, killerId, pos)` (spawns a Carcass via event), persistence in `save.professions`/flags. |
| **L-06** | items | L-04 | `ItemGen.craftItem(opts)` and `forceAffixes(item, ids, rng)` (§1.12), `CATALYST_AFFIX` table, `item.craftedBy`, `craftedSellMult 0.6` in `Vendor.sellPriceOf`. |
| **L-07** | items | L-02, L-05 | `LootSystem.onEnemyKilled` calls `G.professions.onEnemyKilled`; add `data/loot.ts` rows for `fabric_*`, `bone_dust`, `ember_core`, `frost_core`, `bog_slime`, species mats (25% plain-loot chance); `Bounties.ts` templates `bounty_gather`, `bounty_craft`. |
| **L-08** | items (+panels-items) | L-02 | `Vendor.vendorEntries('tradesman')` (tools T2–T6, refined T1–T3, coal); `VendorPanel` accepts `kind:'tradesman'`; NPC `npc_tradesman` panel hookup. |
| **L-10** | scenes | L-00, L-03, L-05 | `entities/interactables/GatherNode.ts` (hold-interact node: model load, wobble per strike, depletion swap, respawn timers + `gather.cd` persistence, rich vein, `canInteract`, `holdInfo`, calls `completeGather`) and `Carcass.ts` (25 s skin interactable). Export in `interactables/index.ts`. dev: scenes. |
| **L-10c** | scenes | L-00 | `scenes/Stations.ts` `spawnStation(world, def)` using `PanelProp` (`panel:'crafting'`, data `{station, prof}`) and `RegionCamp` (campfire + cookfire; resting radius 6 m flag `player.resting`). |
| **L-11** | player | L-00, L-10 | `PlayerController.updateInteract` hold loop (§1.6): start/tick/cancel/complete, facing, camera assist, `gather:progress`/`gather:done` events; `Player.showToolModel/hideToolModel`; gather clip cycles (chop `1H_Melee_Attack_Chop`, mine `2H_Melee_Attack_Chop`, pick `PickUp`, skin `Interact`) with impact callbacks `holdTick`. |
| **L-12** | hud | L-00 | `ui/hud/GatherBar.ts` (§1.6 layout), prompt colouring for locked/depleted, rare-proc and skill-up toasts; register in `hud/index.ts`; add the `professions` hotkey (`KeyP`) line to `UI.update`'s hotkey table. |
| **L-13** | world | L-03 | `world/NodeVisuals.ts`: `makeOreNode(tint, emissive, scale)`, tree-fall tween (90° in 0.8 s, dust), stump swap, rock debris (5 instanced chunks, 0.8 s), `gather_sparkle` for rich veins, minimap tag. |
| **L-21** | content | L-00 | `data/town.ts`: the 7 stations (§1.10 table) as `PanelProp` objects, 7 trainer NPCs + `npc_tradesman` (`ui: { panel: 'professions' \| 'vendor' }`). Nudge ≤ 2 m, check `dev/world.html`. |
| **L-22** | panels-items | L-00, L-04, L-05 | `ui/panels/items/CraftingPanel.ts` (§1.13), registered as `crafting`; `ForgeFx` on forge crafts; item-link shift-click on the result strip. dev: panels-items (fake character with mats). |
| **L-23** | panels-game | L-00, L-01, L-05 | `ui/panels/game/professions.ts` (§1.13) registered as `professions`; the `professions` hotkey line in `UI.update`'s hotkey table is hud-owned and is added by **L-12**. |

### 8.4 Wave 3 — regions and enemies

| ID | Owner | Deps | Task |
|---|---|---|---|
| **L-14** | content | L-00, L-03 | `data/regions.ts` (`REGIONS`: 13 regions + 10 spots with exact fields of §2.1/§2.3, `getRegionAt(zoneId, x, z)`), `data/gatherNodes.ts` (`scatterNodes(region, rng)` deterministic, avoids nav blockers/camps ≥ 3 m, min spacing 3 m; `nodesForZone(zoneId)`). |
| **L-16** | content | L-14, L-17a–c | `data/dungeons/sisli_koru.ts`: camps `ow_c10..c12` (§2.3.2 table), boss placements `mb_kizil_dis` (42,8), `mb_gri_pence` (4,33), `mb_kara_pence` (47,33), cave mouth/cliff props for Ayı Mağaraları, `nodes` generated from regions. |
| **L-15** | scenes | L-10, L-10c, L-14 | `scenes/RegionTracker.ts` (0.25 s tick, banner, discovery XP, events); `DungeonScene` outdoor branch spawns `GatherNode`s from `def.nodes`, region cookfires, boss respawn announcements. |
| **L-17a** | enemies | L-00, L-18 | `data/enemies.ts`: `ow_boar`, `ow_piglet`, `ow_boar_tusker`, `mb_kizil_dis` (rows §2.3.2; models `itch/creatures/rhino.glb`), `skin` defs, `hitMaterial`. |
| **L-17b** | enemies | L-00, L-18 | `ow_wolf`, `ow_wolf_black` (`visual.texture`), `mb_gri_pence` (warg + `WargMask`), pack flank AI hook. |
| **L-17c** | enemies | L-00, L-18 | `ow_bear`, `ow_bear_sleeping` (`ai.dormant`, `Wake`), `ow_bear_cub`, `mb_kara_pence`. |
| **L-17d** | enemies | L-18 | Haydut Kampı + Örümcek Yuvası rosters (§2.3.3 rows: `bandit_*`, `mb_demirdis`, `spider_hunter`, `spiderling`, `spider_pale`, `mb_ag_ana`). |
| **L-17e** | enemies | L-18 | Ork Kanyonu + Zehirli Bataklık rosters. |
| **L-17f** | enemies | L-18 | Kadim Mezarlık (`mb_gece_bekci`; reuse existing ids at levels 28–35) + Kar Kurtları rosters. |
| **L-17g** | enemies | L-18 | Gergedan Düzü, Kızıl Kayalık (`mb_magma_kral`), Ejderha Dişi, Kadim Koru (`wb_kadim_ruh` procedural) rosters. |
| **L-18** | enemies | L-00 | `ai/abilities.ts` + `ai/EnemyAI.ts`: hooks of §2.3.1 — `boar_charge`/`wall_daze`, `pack_flank`, `howl_adds`, `roar_buff`, `hug_grab`, `gold_thief`, `war_banner_aura`, `burrow_ambush`, `stampede_event`, `ancient_pulse`, `blizzard_pulse`; reuse `charge`/`summon` kinds where possible. |
| **L-20** | hud + panels-game | L-14 | `Minimap.ts` and `panels/game/map.ts`: region circles/labels in difficulty colours (`levelTier` of the region mid level), boss skull, campfire, gather-node dots by profession; region banner subtitle tint (`ui:zoneName`). |
| **L-82** | content | L-03, L-04, L-14 | `dev/contentCheck.ts` validators: every recipe input/output id exists; node yields exist; tier/skill ladders contiguous (no dead zone > 10 skill); regions inside zone bounds and level coverage 1–60 contiguous; camps ≤ 25% overlap; every region has ≥ 2 node tiers, a camp and a boss (except spots). |

### 8.5 Wave 4 — chat

| ID | Owner | Deps | Task |
|---|---|---|---|
| **L-30** | hud | L-00 | `ui/hud/ChatCommands.ts`: `parseChatInput(raw)` (§3.3) with unit-style self-test in `dev/hud.ts`; command table, aliases, `/yardim` text. |
| **L-31** | hud | L-00, L-30 | `ui/hud/Chat.ts` refactor: tabs (§3.2), channel colours, send-channel label, history (20), `/` open, Tab cycle, unread dots, ring buffers 200/300, settings (`chatOpacity`, `chatFontSize`, `chatTimestamps`); keep `consumedAt` semantics. |
| **L-32** | net | L-00 | `NetSession.sendChat(text, opts)`, routing (say 40 m / yell / party / whisper by name), `chatAllowed` limit 6/10 s, duplicate drop 3 s, lobby `lchat` send/receive (lobby kept open in town), `peerOfName`, `G.net.peers` list; `net:chat` event widening. dev: net.html two tabs. |
| **L-33** | hud (+ scenes: one line in `ui/menu/MenuUI.ts`) | L-30 | `ui/hud/ChatFilter.ts` (`filterChat`, `isNameClean`, §3.7; no profanity in the repo docs), setting hook, name validation call in `MenuUI` (scenes owner one-liner listed here). |
| **L-34** | hud + net + panels-items | L-31, L-32 | `ChatLinks.ts` (`makeSnapshot(item)`, `sanitizeItemSnapshot`, render + tooltip), `chat:insertLink` emitters on shift-click in `InventoryPanel`, `StashPanel`, `VendorPanel`, `CharacterPanel`, crafting result strip. |
| **L-35** | hud | L-31 | `ui/hud/CombatLog.ts` + "Savaş" tab (§3.6), `stream(cb)`, `/savaslog kopyala`. |
| **L-36** | hud | L-31 | `ChatBubbles.ts` (world layer DOM above `say`/`party`, 5 s). |
| **L-37** | player + net + combat | L-00, L-32 | `Player.playEmote(id)/stopEmote()` with the clip table (§3.4), `PlayerController` cancel rules, Dinlenme rest bonus in `Combat.updateLocalPlayer`, emote replication over the chat channel. |

### 8.6 Wave 5 — ilvl and stats

| ID | Owner | Deps | Task |
|---|---|---|---|
| **L-09** | items | L-00 | `systems/ItemLevel.ts` (`UPGRADE_ILVL`, `itemIlvlEquiv`, `computeItemLevel`), `CharacterState.itemLevel()` delegation + `itemLevelBase()`, `StatCalc` soft caps (`softCap()` table §6.6) + `professionStats` + `activeFood`, `ItemGen.rollAffixOf` intra-tier scaling, `data/statWeights.ts` (§6.5). |
| **L-60** | panels-items | L-09 | `CharacterPanel.ts` header "Eşya Seviyesi" (band colours, bonus, per-slot tooltip), item tooltip "(efektif N)". |
| **L-61** | net + panels-game | L-00, L-09 | `RoomAnnouncement.minIlvl` set in `party.ts` (presets), join check in `NetSession` ("Eşya Seviyesi yetersiz"), room card badge. |
| **L-62** | panels-game + hud | L-09 | Keystone/portal/party UIs show "Önerilen Eşya Seviyesi" with ratio colours (§6.3), one-time warning toast on entry with ratio < 0.8. |
| **L-63** | panels-items | L-09 | Tooltip compare arrows using `itemScore(item, role)`; role from class/spec. |

### 8.7 Wave 6 — PvP and extras (later)

| ID | Owner | Deps | Task |
|---|---|---|---|
| **L-70** | combat | L-00 | `combat/pvp.ts` (`PVP` constants, `pvpDamage()`, CC DR tracker for players), `IncomingHit.fromPlayer/source`, `Combat.hitLocalPlayer` PvP path, `ack` handling, `lastDamagers`, dodge-breaks-root. |
| **L-71** | net | L-00, L-70 | `pvp` channel send/receive, host validation (§7.5), duel state machine, room `mode`, `MAX_ROOM_SIZE`, kill/assist messages. dev: net.html. |
| **L-72** | scenes | L-71 | `SafeZone` circles (town, camps, portals, waypoints), duel ring entity + forfeit, `PvpZone` flag handling, Yorgunluk respawn timer, `RegionDef.pvp` zones. |
| **L-73** | hud | L-71 | Flag button/countdown on `PlayerFrame`, duel dialog, red hostile nameplates with rank, honor toasts, kill banner, damage-direction for PvP. |
| **L-74** | items | L-00 | `onur_puani` currency, Onur formulas + anti-farm, ranks/titles, `Savaş Ustası` vendor entries (Gladyatör set rows via `data/uniques.ts` SetDef + `pvpPower/pvpResilience` in `StatCalc`). |
| **L-75** | scenes + content | L-71, L-14 | `pvp_maden` region data, shared host-authoritative nodes through `gate` `node:<id>`, capture point entity + buff, Zengin Damar event. |
| **L-49** | player + core | L-40 | Gamepad (§4.9): `GamepadInput` in `core/Input.ts`, camera stick profile, aim assist, rumble. (P3) |
| **L-83** | items + scenes + player | L-05 | Fishing (§1.5.5): `fish_spot` node, bite-timer mini-flow, `Throw`/`PickUp` clips, fish materials, Olta tools. (P3) |
| **L-80** | assets (Blender) | — | optional `boar` creature via `tools/blender/creatures/c_boar.py` (replaces the rhino stand-in; swap `model` of the boar rows only). |
| **L-81** | assets | — | 12 missing item icons (§1.9) as 24×24 SVG in the existing game-icons style; names listed there. |

### 8.8 Definition of done (every package)

* `npx tsc --noEmit` = 0 errors in the package's files; no console errors in the named dev page; frame loops never throw.
* Turkish strings; numbers match this document (or the document is amended in the same change).
* New public APIs listed in the final report; any shared-file need beyond **L-00** is reported, not edited.

---

## Appendix A. Orchestrator notes

**A.1 Assumptions to reconcile** — see §0.2 (A1–A12). Most likely collisions: A1 (zone ids and coordinates of `GDD_OPENWORLD`), A2 (stagger/poise naming and parry weights from `GDD_V2`), A3 (new-class weapon categories), A7 (room size 8 for PvP), A12 (crafted ilvl cap 60).

**A.2 Conflicts found in the existing docs/code** (flagged, not silently resolved)

1. `FEEL.inputBuffer = 0.4` in code vs 0.25 in GDD_SYSTEMS §8.2 → this doc sets 0.30.
2. `DEFAULT_SETTINGS.screenShake = 1` vs GDD default 70% → this doc sets 0.7.
3. `CharacterState.itemLevel()` ignores empty slots; GDD says "WoW-style average" → §6.3 makes empty slots count as 0.
4. `RARITY_NAMES_TR` / `RARITY_COLORS.set` mismatch with the GDD brief (already noted in GDD_SYSTEMS §4.2) — untouched here.
5. Tier gates leave ilvl 50–71 affixes flat → §6.2 intra-tier scaling.
6. The camera now has `occluders` (town only); this doc extends it rather than adding a parallel proxy system.
7. The Knight's basic chain is the strongest in the game (3.62 coef/s) although it is the tank → §5.13 option T.
8. Chat `NET.CHAT_BURST` is 8/10 s in code; set to 6 here.

**A.3 New files (summary)**: `src/types/professions.ts`; `src/data/{professions,gatherMaterials,nodes,recipes,regions,gatherNodes,statWeights}.ts`; `src/systems/{Professions,ItemLevel}.ts`; `src/combat/pvp.ts`; `src/entities/interactables/{GatherNode,Carcass}.ts`; `src/scenes/{RegionTracker,Stations}.ts`; `src/world/{NodeVisuals,OccluderFader}.ts`; `src/ui/widgets/levelColor.ts`; `src/ui/hud/{GatherBar,ChatCommands,ChatFilter,ChatLinks,CombatLog,ChatBubbles,DamageDirection}.ts`; `src/ui/panels/items/CraftingPanel.ts`; `src/ui/panels/game/professions.ts`; `tools/combat-sim/feel.mjs`.

**A.4 Suggested ROADMAP wording** (to paste under batch 3, status "designed → GDD_LIFE.md"): gathering/professions (L-01…L-23), region layer (L-14…L-20), chat (L-30…L-37), camera (L-40…L-48), hit-feel pass (L-50…L-56), ilvl/stats (L-09, L-60…L-63), PvP (L-70…L-75).
