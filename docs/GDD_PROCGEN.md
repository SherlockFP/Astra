# EFSUN ONLINE — Kadim Yarıklar (procedural dungeons) · Implementation spec

Status: normative for CORE_MECHANICS §14 (precedence ARCHITECTURE > CORE_MECHANICS > this doc > other GDDs). Docs only; nothing here
is implemented yet. Every package of §14 is written for Haiku coders; every number is a tuning target, not a final value.

**In-code name:** the feature is called **fissure** in code, ids and files (`fis`, `fissure`, `Fissure*`) because `rift` is already taken by
the Mythic+ seasonal rift (`DungeonDef.extras.riftSpots`, `AffixId` rifts). Player-facing Turkish name: **Kadim Yarıklar**; one run = "bir Yarık";
the entry object = **Yarık Taşı**.

---------------------------------------------------------------------------------------------------------------------------------
## 0. Binding decisions (read first)

| # | Decision | Why |
|---|---|---|
| D1 | A generated map **is an ordinary `DungeonDef`**. The generator is a pure function `generateFissure(spec) → DungeonDef`; DungeonBuilder, DungeonScene, NavGrid, gates, boss controller, shrines, chests, exit portal run unchanged. | user + CORE §14 |
| D2 | **The `dungeonId` is self-describing**: `fis.<theme>.<tier>.<seed8>.<v>` e.g. `fis.crypt.h.1a2b3c4d.1`. `getDungeon(id)` regenerates (LRU cache of 3) on demand. Nothing else has to be transported: `DungeonParams` is unchanged. | Every existing consumer (`getDungeon(params.dungeonId)` in MythicPlus.prepare, Affixes, Minimap, MythicTracker, LootSystem, join-in-progress replay of `NetSession.currentScene`) gets the same def for free. `ident()` in net/messages.ts allows `A-Za-z0-9_.:-` up to 48 chars, our ids are ≤ 26. |
| D3 | **Determinism = same code + same id.** Layout, population, bosses, modifiers, shrine types, chest spots are functions of (theme, tier, seed, generator version `v`) only. They never depend on party size, class, level, time, `Math.random`, DOM, or object iteration order of non-literal maps. | ARCHITECTURE golden rule 6 |
| D4 | The generator uses **no transcendental math** (`sin/cos/atan2/pow/sqrt/exp`), only `+ − × ÷ floor`, comparisons and `core/utils.RNG` (mulberry32, integer ops). Facings are multiples of 90°, offsets come from tables. Prop `collide` flags mark nav cells; a 1-ulp difference between browsers would desync pathing, so props are placed on a 0.5-tile lattice. | cross-engine safety |
| D5 | Fissures **never** take keys, never count for Mythic+ score, vault, Mitik 0 unlock or per-dungeon first-clear XP (CORE §6). A tier id `n/h/m` maps to `DungeonParams.difficulty` `'normal' | 'heroic' | 'mythic'`; `'mythicplus'` is never used. See the audit in §11.3: three existing `run:completed` listeners would otherwise be polluted. | CORE §6 |
| D6 | Run completes when the **final boss dies** (not "all bosses"). Both guardians sit on the critical path behind `boss_lock` gates, so in practice all 3 die; the explicit rule protects against edge cases. | CORE §14 |
| D7 | Height tiers use the CORE §13 engine (`RoomDef.floorY`, `RoomDef.ceiling`, ramp strips, heightfield nav). That engine is a **separate package that must land first** (Wave 0). The generator emits tier data always, and writes the §13 fields only when `FISSURE.heightTiers === true`; until then the map is flat (tiers still shape ceilings and visuals via `ceilingDark`). | no hard dependency on a missing engine |

---------------------------------------------------------------------------------------------------------------------------------
## 1. Facts about existing code this spec relies on (verified in the repo)

- `DungeonDef` (types/dungeons.ts): rooms are **integer tile rects**, adjacent with **no gap**; walls are auto-built on edges between different rooms;
  a `DoorDef { a, b, tile, side, width, gate }` carves the wall: `tile` = first tile **in room a** on the shared boundary, `side` = direction from a to b,
  both tiles on either side must be in rooms (builder warns otherwise, `DungeonBuilder.ts:~600`). Corridors are ordinary `RoomDef`s (see `kemik_mahzeni.ts`: `k_giris`, `k_bekci`).
  Door width 2 is the house standard. Pack centres, boss pos, extras, start, exit use the **GDD coordinate**: continuous tile coordinate `c`, world = `(c + 0.5) × TILE_SIZE (4 m)`,
  an integer is a tile centre. A room `rect {x:2,w:11}` covers centres 2..12. `start.facing` degrees (180 = north/−z).
- `DungeonScene.spawnEnemies`: ids = `DUNGEON_ENEMY_ID_BASE + index` over `def.packs` order, members in order, then `def.bosses` in order → generator output order is part of the net contract.
  `PackDef.dormant`, `stealth`, `patrol`, `linkedTo`, `levelRange` supported. Champions: `assignChampions(world, params.seed)` for every non-M+ run.
- Gates: `boss_lock` door INTO a boss room (closes 3 s after engage, stays closed while a lower `order` boss lives), `boss_exit` door OUT of it (closed until that boss dies);
  `bossOfGate` matches `placement.roomId === door.a || door.b`. A Diriliş Taşı spawns behind each `boss_exit` after the kill (not for the last boss: DungeonScene.onBossDefeated).
- `BossController`: arena = `BossDef.arena` (baked, shifted by spawn offset) **or**, when absent, a square of `arenaRadius` around the spawn → generated bosses omit `arena`.
  `BOSS_SCRIPTS[bossId]` optional; unknown id → `{ abilities: {} }` and `CUSTOM[abilityId]` fallback.
- `MythicPlus`: `prepare()` reads `getDungeon(id).bosses.length` as `bossesTotal`, `forcesRequired`; non-M+ difficulties start the clock immediately; `enemyScaling()` uses `DIFFICULTY_MULT`
  (normal 1/1, heroic .85/.85, mythic 1/1: unsuitable, so fissures use their own table); `partyHpMult()` = `1 + 0.6 (n−1)`; `checkCompletion()` = all bosses dead; `handleCompleted()` writes `clearedM0` and grants a keystone for difficulty `'mythic'` (must be guarded).
- `LootSystem.endOfRunRewards(state)`: branches by `keyLevel`/difficulty; boss kills drop through `G.loot.onEnemyKilled` using `def.lootTable` (+ legendary pity `PITY_STEP 0.25`, cap ×5, only `rank 'boss'`).
- `spawnEnemy(world, defId, pos, { id, level, … })` applies `G.mplus.enemyScaling(isBoss)` and `partyHpMult()`; `monsterHP(L) = 14 + 0.62 L²`, `monsterDmg(L) = 14 + 4.5 L`.
- `NetSession.onSceneRequest` rebuilds `DungeonParams` from sanitized fields (`enemyLevel` clamp 1..70, `partySize = peers.size`, `keyOwner = requester`). Clients regenerate from the id.
- Builder `rng` and auto-decor are seeded from the def (`def.id`/room ids), so identical ids give identical decor.
- `data/enemies.ts` keeps the helpers (`def`, `boss`, `cone`, `line`, `aoe`, `charge`, `summonAb`, anim sets `A_*`, model url helpers `MON/CHAR/SKEL/GEN/ITCH`) **file-local**: Package PG2 only adds `export` to them (no signature change).

---------------------------------------------------------------------------------------------------------------------------------
## 2. Player-facing flow (Turkish UI)

1. **Yarık Taşı** (interactable) — capital (Kuzgunkale plaza, next to the Group Finder obelisk) and one per open-world zone/village (§11.1). F = open panel `fissure`.
2. Panel **"Kadim Yarıklar"**: tabs `Yarık Seç` | `Günün Yarığı`.
   - Left: 5 theme cards + `Rastgele` (default). Cards: Mezarlık (crypt) · Dökümhane (forge) · Buzul (frost) · Gölge (shadow) · Mantar Mağarası (grotto).
   - Middle: 3 difficulty cards **Normal / Kahramanlık / Mitik** with lock reasons (§8.1) and "Düşman Sv. N".
   - Right: preview built by actually running the generator (≤ 15 ms): mini layout map (canvas, rooms as rects tinted by tier, boss rooms marked), "Oda: 9 · Muhafız: *Mezarlık Ezici*, *Gölge Kılıç Ustası* · Son Patron: *Mezar Kralı Vorok*", modifier chips with tooltips, tahmini süre ("~22 dk"). Buttons: `Yeniden Çevir` (new seed, same theme/tier), `Yarığa Gir` (host/offline only; a client sees "Yarığı oda sahibi açar" and the same preview read-only).
3. Enter → loading screen shows theme art/lore line → `DungeonScene`, start room has the always-active Diriliş Taşı (existing).
4. Clear rooms → **Muhafız 1** (gate closes, fight, gate opens, checkpoint) → … → **Muhafız 2** → … → **Son Patron**. Kill → run completes: exit portal + reward chest (existing `spawnReward`) + `runSummary` panel on chest open; personal loot per boss as usual.
5. `Günün Yarığı`: one fixed seed per UTC day, same layout for everybody (theme = `hash(day) mod 5`, tier chosen by the player). First clear of the day per character: +1 guaranteed epic+ item and 2× Yarık Kristali. No leaderboard in v1 (RunRecord hash would work later because the id contains the seed).
6. Leave early: game menu "Yarıktan Çık" → town (existing leave path), Dönüş Parşömeni works inside fissures (treated like a normal dungeon). A solo player can always leave; a party member leaving does not move the party.

---------------------------------------------------------------------------------------------------------------------------------
## 3. Data contracts (append-only types; owner of the shapes = PG1)

```ts
// src/data/dungeons/fissure/types.ts  (new, content)
export type FissureThemeId = 'crypt' | 'forge' | 'frost' | 'shadow' | 'grotto';
export type FissureTier = 'n' | 'h' | 'm';                       // normal / heroic (Kahramanlık) / mythic
export const FISSURE_VERSION = 1;                                  // bump on ANY generator/data change that alters output
export interface FissureSpec { theme: FissureThemeId; tier: FissureTier; seed: number /* uint32 */; v: number }
export type FissureModId = 'fm_surusu' | 'fm_zirh' | 'fm_cevik' | 'fm_zalim' | 'fm_bereket' | 'fm_ofke' | 'fm_guc' | 'fm_kan';
export type RoomKind = 'start' | 'chamber' | 'hall' | 'treasure' | 'shrine' | 'guardian' | 'final' | 'corridor' | 'ramp';
export type Side = 'n' | 's' | 'e' | 'w';
export type SlotRole = 'trash' | 'swarm' | 'caster' | 'elite' | 'mixed';
export interface PackSlot { at: [number, number]; role: SlotRole }               // tile offset from room rect.x/z (integers or .5)
export interface Archetype {
  id: string; kind: RoomKind; w: number; h: number;                             // tiles
  doors: Side[];                                                                 // sides that may carry a door (one anchor per side, centred)
  ceiling: number;                                                               // metres (§13)
  slots: PackSlot[];                                                             // pack slots (empty for arenas)
  dress: DressRule[];                                                            // props by role, resolved through ThemeDef.props
  tierOk: (0 | 1 | 2)[];                                                         // allowed floor tiers
  weight: number;                                                                // pick weight within its kind
  boss?: [number, number];                                                       // boss spawn offset (guardian/final)
}
export interface DressRule { role: 'pillar4' | 'pillar6' | 'brazier2' | 'brazier4' | 'statue2' | 'center' | 'banner4' | 'scatter'; inset?: number; n?: number }
export interface PackTpl { id: string; role: SlotRole; members: [enemyId: string, count: number][]; weight: number; tierMin?: FissureTier }
export interface ThemeDef {
  id: FissureThemeId; name: string; lore: string; floor: FloorStyle; wall: WallStyle; floorAlt: FloorStyle;
  theme: DungeonTheme;                                                           // copy of the matching hand-made THEME constant (values in §5.2)
  roomNames: Record<RoomKind, string[]>;                                         // Turkish
  packs: PackTpl[]; elites: PackTpl[];                                           // enemy ids must exist in ENEMIES
  props: Record<'pillar' | 'brazier' | 'statue' | 'center' | 'banner' | 'wallLight', string> & { scatter: string[] };
  zones?: { kind: ZoneDef['kind']; weight: number; color: number; glow?: number; hazard?: { coef: number; interval: number } }[];
  dormant?: { kind: 'bones' | 'coffin' | 'egg' | 'ceiling'; chance: number; wake: number };
  stealthChance?: number;
  guardianSkin: Record<GuardianArchetypeId, GuardianSkin>; finalId: string; music: MusicId; level: [number, number]; // recommended
}
// types/dungeons.ts  (append-only, core; written by PG1)
export interface FissureInfo {
  v: number; theme: FissureThemeId; tier: FissureTier; seed: number;
  mods: FissureModId[]; affixes: AffixId[];                                      // behavioural mods mapped to existing M+ affixes (bolstering/raging/sanguine)
  guardians: [string, string]; finalBossId: string;                              // BossDef ids, order 1, 2, 3
  rooms: number; tiers: number[];                                                // non-connector room count; floor tier per RoomDef index
  daily?: boolean;
}
// DungeonDef gets:   fissure?: FissureInfo        (presence = generated map)
// RoomDef gets (only if §13 engine lacks them):  floorY?: number; ceiling?: number; ramp?: { axis: 'x' | 'z'; yFrom: number; yTo: number }
// RunState (types/mythic.ts) gets:   fissure?: { tier: FissureTier; mods: FissureModId[]; finalBossId: string }
```

**Id codec** (`fissure/ids.ts`, pure, no imports besides types): `fissureId(spec)`, `parseFissureId(id) → FissureSpec | null` (regex `^fis\.(crypt|forge|frost|shadow|grotto)\.([nhm])\.([0-9a-f]{8})\.(\d{1,3})$`),
`isFissureId(id)` (prefix test, used by the audit guards in §11.3), `dailySpec(utcDayIndex, tier)` (`seed = hashString('fis-day:' + day) >>> 0`, theme = `THEME_ORDER[hashString('fis-theme:' + day) % 5]`).

`getDungeon(id)` hook (`data/dungeons/index.ts`, first line): `if (isFissureId(id)) return getFissureDef(id);`. `getFissureDef` parses, rejects `v !== FISSURE_VERSION` (returns `undefined` → existing "Bilinmeyen zindan" path), caches the last 3 defs.

---------------------------------------------------------------------------------------------------------------------------------
## 4. Generator

### 4.1 Pipeline (`fissure/generate.ts`, ≤ 600 lines, pure)
Independent RNG streams so one stage never shifts another: `rng(stage) = new RNG(hashString(`${seed8}:${theme}:${tier}:${v}:${stage}`))`, stages `plan`, `grow:<attempt>`, `tiers`, `rooms`, `spawn`, `boss`, `props`, `mods`, `extras`.

1. **Plan** (`plan`): `R = int(tierRooms)` where rooms = non-connector rooms; fixed rooms: `start`, `guardian1`, `guardian2`, `final`.
   `fillers = ceil((R − 4) / 2)` spine rooms (hall/chamber), `branches = R − 4 − fillers` dead ends: 1 `treasure` (2 on Mitik), 1 `shrine` when branches ≥ 2, remainder `chamber` dead ends.
   Spine order: `start, F₁…F_a, G1, F…, G2, F…, final` with fillers split `a = ceil(0.4 f)`, `b = ceil(0.35 f)`, `c = f − a − b` (c may be 0).
   Each spine filler kind: `hall` with weight 0.35, else `chamber`.
2. **Tiers** (`tiers`): walk over the spine, `tier₀ = 0`; next tier = prev + Δ, Δ ∈ {−1: 0.2, 0: 0.5, +1: 0.3}, clamped to `[0, maxTier]` (`n:1, h:2, m:2`). Final arena tier = highest tier reached on the spine (forced; inserts the ramp). A branch `treasure` gets host tier +1 with 30 % chance when host < maxTier (balcony).
   `floorY = tier × 2.0 m`. A link whose endpoints differ by Δ tiers becomes a **ramp** connector of length `2·|Δ|` tiles (slope = 2.0 / 8 = 0.25 ≤ 0.3, §13 max step 0.45 only applies between flat tiles).
3. **Grow** (`grow:<attempt>`, attempt 0..63): place `start` at tile (0,0) of a virtual 512×512 occupancy grid (offset 256). For each next spine room (DFS with backtracking, budget 600 placements):
   - choose the exit side of the previous room by weights: continue previous heading 3, turn left/right 2, never back; guardian rooms prefer the side **opposite** the entry (2.5), then perpendicular; a side is allowed only if the archetype lists it in `doors` and it is free;
   - connector length `Lc = int(2,4)` tiles (corridor, width 2) or the ramp length; connector rect starts flush against the room edge at the door anchor row/column; the next room is placed flush against the connector end with its **entry-side anchor aligned to the connector row** (`z_next = row − anchorOffset(next, side)`); anchor offset of a side with length L is `(L − 2) >> 1` (door width 2);
   - a placement is valid iff the room rect and connector rect do not intersect existing rects **inflated by 1 tile** (except the two rects it joins, which touch by construction);
   - archetype pick: `rng.weighted` over archetypes of the needed kind whose `tierOk` contains the tier, tried in a seeded order (≤ 3 tries per side, ≤ 4 sides).
   Then attach **branches** to non-arena, non-start spine rooms in seeded order (connector 2–3 tiles, single-door dead-end archetypes). A branch that cannot be placed is dropped; if `placedRooms < minRooms(tier)` the attempt fails.
4. **Normalise**: translate all rects so `min x = min z = 3`; `grid = { w: maxX + 4, h: maxZ + 4 }`. Reject the attempt if either axis > 110 tiles (≈ 440 m).
5. **Fallback**: if all 64 attempts fail, use `FALLBACK[theme][tier]` = a fixed serpentine of archetype ids (authored by hand in `archetypes.ts`, verified by the check tool to be valid). Identical on all peers; logs `console.warn('[fissure] fallback layout', id)` once.
6. **Doors**: for every link emit two `DoorDef`s (room→connector, connector→next), width 2, tile computed from the anchor row; gates: connector→guardian = `boss_lock`; guardian→connector = `boss_exit`; connector→final = `boss_lock`; the rest `none`. Final arena has no exit door.
7. **Rooms**: `RoomDef { id, name (themeRoomName by rng), rect, floor (theme.floor; 25 % floorAlt in halls), wall, autoDecor (start .3, chamber .5, hall .6, arenas .15, corridor .3), boss (order) for arenas, optional: true for dead ends, ceilingDark: true for shadow/crypt/grotto, floorY, ceiling, ramp?, zones? }`. Room ids: `r00…`, connectors `c00…` in creation order.
8. **Start/exit**: `start.pos` = room centre of `start`, `facing` = 90° × index of the exit side direction (n=180, e=270, s=0, w=90 : yaw 0 faces +z = south, see kit convention; the check tool asserts the player faces the first door). `exit.pos` = centre of the final arena (portal appears there after the kill; reward chest next to it is placed by `spawnReward`).

### 4.2 Population (`fissure/populate.ts`)
- Per pack slot: pick `PackTpl` by `role` and tier (`weight`, `tierMin`), member list expanded with the standard authored ring offsets `OFFS = [[0.3,0],[-0.38,0.35],[0.06,-0.66],[0.48,0.62],[-0.88,-0.16],[0.83,-0.53],[-0.28,1.03],[-0.53,-1.02],[1.15,0.42],[-1.2,0.49],[0.58,-1.23],[0.43,1.36]]` (same constants as `kit.ts` packs; ranged/casters get extra offset 1.2 behind).
  Pack ids `f_p<index>`; `forces` = sum of member `ENEMIES[id].forces` (0 for grotto, informative only), `levelRange` absent (level = `params.enemyLevel`).
- **Target density** (enemies per run, solo baseline; party strength is HP scaling, never extra bodies, D3): Normal 80–110, Kahramanlık 110–145, Mitik 145–190.
  Pack member scaling by tier: `n` 4–5, `h` 5–6, `m` 6–7 bodies per `trash` pack; `swarm` packs 8/10/12; `caster` packs 3/3/4; `mixed` uses the template as written.
  `fm_surusu` adds `+1` copy of the last member tuple to every trash/mixed pack.
- **Slots** come from archetypes (§5.1): chamber 2, hall 3–4, treasure 1 elite + 1 trash, shrine 1, start 0, corridor length ≥ 3: 40 % one `swarm` pack of 3–4 (patrol along the corridor, `linkedTo` none), arenas 0.
  Hall slot 1 is always `elite` on Kahramanlık+ (Normal: 50 %). Every elite pack = 1 elite template + 2–3 supports.
- **Behaviours** (stage `spawn`): `dormant` per theme chance (crypt 25 % bones, wake 9 m; grotto 20 % egg, wake 8 m), `stealth` shadow 20 %, `patrol` 25 % of hall trash packs (two waypoints at slot ± 3 tiles, checked walkable by the room rect), `linkedTo` pairs of consecutive hall packs 50 %.
- **Placement safety**: pack centre ≥ 2.5 tiles from any door tile, ≥ 4 tiles from `start`, inside `rect` shrunk by 1; `DungeonScene.snap` already moves points to the nearest walkable cell.
- **Extras**: `shrines` = positions of every `shrine` room only (the shrine TYPE stays DungeonScene's existing non-M+ pick `RNG(hashString(seed:shrine:i))`, identical on all peers); `chests`: each `treasure` room gets one `chest_iron` (`chest_gold` on Mitik) at the back of the room; `fm_bereket` adds one extra `treasure` branch; `fontOfPower` is omitted (no Kehanet Taşı in fissures; DungeonScene guards on `ex?.fontOfPower`); `riftSpots: []`.
- **Bosses** (`fissure/bosses.ts`): `guardians = pickGuardians(rng('boss'), theme)` = two distinct archetypes from the 6 (never the same archetype twice); `finalBossId = theme.finalId`. `BossPlacement.pos` = arena centre + `archetype.boss` offset, `facing` toward the entry door, `order` 1, 2, 3. The final's phase-2 adds read `theme.packs` (swarm templates).
- **Props**: `dress` rules → positions on the 0.5-tile lattice computed from rect corners/centre with integer arithmetic (no trig), models from `theme.props`; `scatter` via `rng` on free lattice points ≥ 1.5 tiles from doors/slots. Wall lights: every door gets `wallLight` ×2 (light colour = `theme.torchColor`); ≤ 10 real lights per run-visible room is enforced by the existing LightPool.

### 4.3 Validation invariants (enforced by `tools/fissure-check.mjs`, §13)
V1 `R` in tier range and `rooms` field correct · V2 exactly 3 bosses, orders 1,2,3, distinct ids, all in `BOSSES` · V3 rects pairwise disjoint, door tiles join two room tiles (mirror of builder check) ·
V4 graph connected, unique spine `start → G1 → G2 → final`, `boss_lock/boss_exit` gates on the spine only, dead ends reachable without crossing a gate in the wrong order ·
V5 pack centres inside rects, never in arenas, every `enemyId` in `ENEMIES` ·
V6 height: every link `|Δy| ≤ 0.45` for flat joins or ramp slope ≤ 0.3, tiers within `[0, maxTier]`, final arena tier = max ·
V7 determinism: two generations → byte-identical `JSON.stringify` (and `defHash` equal) · V8 grid/bbox ≤ 110² · V9 enemy count in the §4.2 window · V10 spine path length (tiles) in [60, 230] ·
V11 `generate()` p99 < 25 ms in Node (excluding dress) · V12 forced fallback on a crafted seed list still passes V1–V10 · V13 no `Math.sin/cos/pow/sqrt/random` token in `fissure/*.ts` (grep).

---------------------------------------------------------------------------------------------------------------------------------
## 5. Room templates and themes

### 5.1 Archetypes (shared geometry, theme dressing) — `fissure/archetypes.ts`
Tile = 4 m. All dimensions in tiles. Doors: exactly one anchor per listed side (centred, width 2). `tierOk` default `[0,1,2]`.

| id | kind | w×h | doors | ceiling m | pack slots (offset from rect corner, role) | dress |
|---|---|---|---|---|---|---|
| `st_a` | start | 8×8 | n s e w | 8 | – | brazier2, banner4 |
| `st_b` | start | 10×7 | e w n s | 8 | – | brazier2, statue2 |
| `ch_a` | chamber | 8×8 | n s e w | 8 | (3,3)trash (5,5)mixed | pillar4 |
| `ch_b` | chamber | 9×7 | e w n s | 8 | (3,3)trash (6,3)caster | brazier2, scatter |
| `ch_c` | chamber | 7×9 | n s e w | 8 | (3,3)swarm (3,6)trash | pillar4 |
| `ch_d` | chamber | 10×8 | e w n s | 9 | (3,4)trash (7,4)mixed (5,2)caster | banner4 |
| `hl_a` | hall | 12×10 | n s e w | 12 | (3,3)trash (8,3)trash (3,7)caster (8,7)elite | pillar6, brazier4, banner4 |
| `hl_b` | hall | 10×12 | n s e w | 12 | (3,3)trash (6,5)swarm (3,9)mixed (6,9)elite | pillar6, statue2 |
| `hl_c` | hall | 14×8 | e w n s | 12 | (3,3)trash (7,4)elite (11,3)caster (7,6)swarm | pillar6, center |
| `hl_d` | hall | 8×14 | n s e w | 14 | (3,3)trash (4,7)elite (3,11)mixed | center, brazier4 |
| `tr_a` | treasure | 7×7 | one side | 8 | (3,3)elite + (4,5)trash; chest at (3,5.5) | statue2, brazier2 |
| `tr_b` | treasure | 6×8 | one side | 8 | (3,3)elite; chest at (3,6.5) | scatter |
| `sh_a` | shrine | 6×6 | one side | 8 | (3,3)mixed; shrine at (3,1.5) | brazier4 |
| `gd_a` | guardian | 10×10 | n s e w | 14 | – boss at (5,4) | pillar4, brazier4 |
| `gd_b` | guardian | 11×9 | e w n s | 14 | – boss at (5.5,4) | banner4, brazier4 |
| `gd_c` | guardian | 9×11 | n s e w | 14 | – boss at (4,5.5) | pillar4, statue2 |
| `fn_a` | final | 13×13 | n s e w | 18 | – boss at (6,5) | pillar6, center, brazier4 |
| `fn_b` | final | 14×11 | e w n s | 18 | – boss at (6.5,4.5) | pillar6, statue2, banner4 |
| `fn_c` | final | 11×14 | n s e w | 18 | – boss at (5,6.5) | pillar6, center |
| `cor` | corridor | 2×(2..4) | ends | 6 | optional patrol swarm | wallLight |
| `rmp` | ramp | 2×(2·Δ) | ends | 8 | – | wallLight |

Weights within a kind: equal, except `hl_c/hl_d` 0.7, `ch_d` 0.7. Arena rooms are never on a different tier than their entry connector's far end (no ramp inside an arena). Guardian arena floor: tier of the room; **final**: highest tier, ceiling 18 m, `dais` zone (radius 3 tiles, `y +0` on flat engines) under the boss spawn as a visual stage.
Fallback layout (per theme × tier, chain of archetype ids): `n`: `st_a ch_a ch_b gd_a ch_c hl_a gd_b ch_d fn_a` · `h`: `st_b ch_a hl_a ch_b gd_c hl_b ch_d ch_a gd_a hl_c fn_b` · `m`: `st_a hl_a ch_a hl_b gd_a ch_d hl_c ch_b gd_b hl_d ch_a ch_c fn_a` (all links `cor` length 3, dead ends omitted, flat). Authored once, shared by all themes.

### 5.2 Themes — `fissure/themes.ts`
| id | name (TR) | floor / floorAlt / wall | music | level hint | zones |
|---|---|---|---|---|---|
| crypt | Mezarlık Yarığı | `stone_dark` / `dirt` / `stone` | `dungeon_crypt` | 8–35 | `pit` |
| forge | Kor Yarığı | `lava_rock` / `stone_dark` / `forge` | `dungeon_fire` | 18–50 | `lava` (hazard coef 0.6 / 1 s), `vent` |
| frost | Buzul Yarığı | `ice` / `stone` / `ice` | `dungeon_frost` | 25–60 | `ice` |
| shadow | Gölge Yarığı | `temple` / `stone_dark` / `temple` | `dungeon_shadow` | 30–60 | `void` (blocked), `rune` |
| grotto | Mantar Mağarası | `dirt` / `stone` / `cave` | `dungeon_crypt` (until a cave track exists) | 1–25 | `pool` |

`DungeonTheme` values are **copies** of the hand-made constants (do not import the dungeon files): crypt `{fogColor:0x1c2422,fogNear:8,fogFar:38,ambient:0x3c4a48,ambientIntensity:0.35,hemiSky:0x6a7a90,hemiGround:0x201810,torchColor:0xffa050,bloomStrength:0.3,tint:0xc8d0c8}` ·
forge `{0x2a0e06,10,45,0x803020,0.4,0xff7040,0x200800,0xff6a20,0.35,tint 0xd8a090}` · frost `{0xa8c8e0,12,55,0x9ab8d8,0.6,0xdff0ff,0x405060,0x80c8ff,0.35,tint 0xc8e0ff}` · shadow `{0x140a20,6,34,0x302048,0.3,0x6040a0,0x100818,0xb060ff,0.4,tint 0x9080b0}` · grotto `{fogColor 0x16241a,fogNear 8,fogFar 36,ambient 0x3a5a40,ambientIntensity 0.4,hemiSky 0x7a9a80,hemiGround 0x1a1408,torchColor 0x9aff7a,bloomStrength 0.3,tint 0xb8d0b0}`.
`lore` one sentence per theme (Turkish, ≤ 120 chars; Sonnet art/text pass). `roomNames` ≥ 4 names per kind per theme (e.g. crypt hall: "Lahit Salonu", "Kemik Geçidi Meydanı", "Unutulmuş Revak", "Ağıt Galerisi"; guardian: "Muhafız Odası"; final: "Hükümdarın Salonu").

**Prop palettes** (existing kit models only, helpers `dg/hw/gp/kg/ks`):
crypt `pillar kg('column-large') brazier gp('brazier') statue gp('statue_hooded') center hw('coffin_decorated') banner dg('banner_triple_white') wallLight dg('candle_triple') scatter [gp('bone_pile'), hw('skull'), dg('rubble_large'), hw('gravestone'), gp('chains_hanging')]` ·
forge `pillar gp('pillar_broken') brazier kg('fire-basket') statue dg('sword_shield') center ks('workbench-anvil') banner dg('banner_thin_brown') wallLight gp('brazier') scatter [dg('barrel_large'), dg('crates_stacked'), gp('rock_medium'), ks('resource-stone'), gp('chains_hanging')]` ·
frost `pillar kg('pillar-obelisk') brazier kg('fire-basket') statue gp('statue_hooded') center gp('crystal_blue') banner dg('banner_triple_blue') wallLight gp('crystal_blue') scatter [gp('rock_cliff'), gp('rock_large'), gp('crystal_blue'), gp('bone_pile')]` ·
shadow `pillar kg('column-large') brazier hw('lantern_hanging') statue kg('altar-stone') center hw('shrine_candles') banner dg('banner_triple_brown') wallLight dg('candle_melted') scatter [gp('crystal_purple'), hw('skull_candle'), dg('rubble_half'), kg('coffin-old')]` ·
grotto `pillar gp('rock_large') brazier ks('campfire-stand') statue gp('rock_medium') center gp('crystal_purple') banner dg('banner_thin_brown') wallLight ks('campfire-stand') scatter [gp('rock_small'), gp('rock_medium'), hw('tree_dead_small'), gp('bone_pile')]`. Haiku PG1 verifies each url exists via `tools/content-check.mjs`-style file check and swaps for the nearest existing prop if not.

### 5.3 Enemy rosters (all ids exist in `data/enemies.ts` today)
`R` = role slot. Counts are the `n` tier count; `h/m` scale per §4.2. Template ids `<theme>_<role><k>`.

| theme | trash | swarm | caster | mixed | elite (leader + support) |
|---|---|---|---|---|---|
| crypt | 3× `skel_minion` + `skel_archer` · 2× `crypt_ghoul` + 2× `skel_archer` | `skel_rattler` ×8 · `crypt_rat` ×10 · `bone_skull` ×6 | 2× `skel_mage` + `crypt_wraith` | `skel_warrior` + 2× `skel_minion` + `skel_mage` | `bone_golem` + 3× `skel_rattler` · `skel_warrior` + `skel_mage` + 2× `skel_minion` |
| forge | 3× `forge_goblin` + `forge_imp` · 2× `lava_slime` + `forge_imp` | `forge_goblin` ×8 · `flame_skull` ×6 | `fire_priest` + 2× `forge_imp` | `forge_orc` + 2× `forge_goblin` + `fire_priest` | `magma_golem` + 3× `flame_skull` · `forge_demon` + `fire_priest` + 2× `forge_goblin` |
| frost | 3× `frost_dead` + `snow_spider` · 2× `frost_slime` + `snow_spider` | `ice_bat` ×8 · `frost_dead` ×7 | `frost_wraith` ×2 + `snow_spider` | `frost_knight` + 2× `frost_dead` + `frost_wraith` | `yeti_brute` + 2× `ice_bat` · `frost_knight` + `ice_elemental` + 2× `frost_dead` |
| shadow | 3× `cult_acolyte` + `void_imp` · 2× `shadow_spider` + `cult_assassin` | `cult_acolyte` ×8 · `shadow_spiderling` ×9 (spiders drop sacs anyway) | `shadow_priest` + 2× `void_imp` · `cult_summoner` + `shade` | `void_demon` + 2× `cult_acolyte` + `shade` | `void_demon` + `cult_summoner` + 2× `cult_acolyte` · `cult_assassin` ×2 + `shade` ×2 |
| grotto | 3× `ow_spider` + `ow_slime` · 3× `ow_mushnub` + `ow_mushroom_brute` | `ow_bat` ×8 · `ow_mushnub` ×9 · `ow_rat` ×9 | `ow_goblin_shaman` + 2× `ow_goblin` · `ow_wraith` ×2 | `ow_ooze` ×2 + `ow_centipede` + `ow_goblin_shaman` | `ow_spider_giant` + 3× `ow_spider` · `ow_mushroom_brute` ×2 + `ow_goblin_shaman` |

(`ow_*` have `forces 0, leash 40`: acceptable inside a closed dungeon; PG2 verifies their model keys load.) Grotto is the lowest-level theme and the open-world zone entry default.

---------------------------------------------------------------------------------------------------------------------------------
## 6. Bosses: 2 guardians + final

### 6.1 Design rule (CORE §16, "hafif Elden Ring")
Each boss: 3–5 attacks with readable windups (≥ 0.6 s for anything above coef 1.5, big hits `perilous`), delayed last hit of every string, one jump/charge/grab, a ground-telegraphed slam, enrage below 30 %, posture bar (`poise`): breaking it opens a 3 s stagger window (existing poise system: `EnemyDef.poise/poiseRegen/poiseDelay/hyperArmor/stanceBreakable`).
No boss needs a bespoke script: everything is composed from **8 shared move primitives** in `src/ai/bosses/fissure.ts` (`BossHandler`s registered under ability ids; the generic builders `cone/line/aoe/charge/summonAb` from `enemies.ts` cover the rest). Host-only (BossController is host-only), clients see HitShapes.

| primitive (ability id prefix) | implementation | knobs (`params`) |
|---|---|---|
| `fg_string` Savurma Zinciri | N cone swings, each re-aimed at the target, telegraph per swing (kit `wedge`), last swing windup ×1.6 (delayed) | `hits` 2–3, `gap` 0.45–0.6 s, `range` 5–7 m, `arc` 100°, coefs `[0.9,0.9,1.6]`, `lunge` 1.5 m |
| `fg_leap` Sıçrama Ezişi | telegraph circle on the target, tracks 60 % of the windup then locks, boss `forcedMove` jumps and lands | `r` 4.5, windup 1.0, coef 2.2, knockdown 1 s, **perilous** |
| `fg_wave` Şok Halkaları | 3 `ring` shapes at 0.7/1.3/1.9 s, inner/outer widening, jumpable by dodge | `rings` 3, width 2.5 m, coef 1.1 |
| `fg_charge` Hücum | builder `charge` + 1.2 s telegraph, wall stun if it hits the arena edge (stagger 2 s) | `len` 14, width 2.4, coef 1.8 |
| `fg_grab` Kavrayış | short line (3.2 m), perilous; on hit pulls the player and lands a 3.0-coef follow-up after 0.7 s | coef 3.0, only if target not guarding |
| `fg_fan` Kıymık Yelpazesi | 5 projectiles over 40°, 14 m/s | coef 0.8 each |
| `fg_pools` Zehir Birikintileri | 3–5 `zone()` circles near players, `duration 8, tick 0.5, coef 0.35`, r 3 | by theme damage type |
| `fg_call` Yardım Çağrısı | `summonAb` of the theme's swarm template (2–4), `once` at hp threshold or every N s | per archetype |
| `fg_rage` | script `update`: below 30 % HP once: `baseDamage ×1.2`, all cooldowns ×0.7, windups ×0.9, yell | – |

### 6.2 Guardians — 6 archetypes × 5 theme skins = 30 `BossDef`s
Generated programmatically at module load by `data/enemies_fissure.ts`: `BOSSES['fg_<arch>_<theme>']`, `rank 'boss'`, `ccImmune`, no `arena`, `arenaRadius 20`, `enrage 150 s`, `loot` `loot_fis_g_<arch>`. Stats are `Spec` fields (`hp` = `hpMult`, `dmg` = `dmgMult`) on top of `monsterHP/monsterDmg(enemyLevel)`.

| archetype (TR noun) | hp | dmg | speed | poise | moves (cooldown s, first) | phases (hp below) |
|---|---|---|---|---|---|---|
| `brute` Ezici | 30 | 1.9 | 5.0 | 120 | `fg_string` 3 hits (6, 3) · `fg_leap` (14, 8) · `fg_wave` (20, 12) | 1.01 base · 0.60 + `fg_charge` (16) · 0.30 rage |
| `duelist` Kılıç Ustası | 26 | 1.6 | 6.6 | 80 | `fg_string` 2 hits fast gap 0.35 (4, 2) · dash strike = `fg_charge` len 9 windup 0.5 (9, 6) · **Karşılık** stance: 2.0 s, a melee hit during it triggers a 2.0-coef counter + heals 15 % poise (22, 10) | 0.55: string becomes 3 hits · 0.30 rage |
| `caster` Büyücü | 24 | 1.7 | 4.6 | 60 | kite 10–16 m · `fg_fan` (8, 3) · `fg_pools` (16, 8) · beam `line` 18×2 windup 1.2 coef 2.4 (12, 6) · blink away when a player ≤ 5 m (15, 5) | 0.55 + `fg_call` 2 adds once · 0.30 rage |
| `hulk` Zırhlı Dev | 36 | 2.1 | 3.8 | 200, hyperArmor 0.5 | shield bash cone 120° knockback 8 coef 1.4 (9, 4) · `fg_grab` (18, 10) · `fg_wave` (22, 14) · stomp `self_aoe` r 7 coef 1.6 (12, 7) | 0.35 + `fg_charge` · 0.30 rage |
| `swarmlord` Sürü Efendisi | 28 | 1.5 | 5.4 | 70 | `fg_string` 2 hits (5, 2) · `fg_call` 3 swarm (20, 5) · `fg_pools` (18, 10) | 0.60 call every 14 s · 0.30 rage |
| `hunter` Avcı | 25 | 1.7 | 7.0 | 90 | backstep + `fg_fan` 5 (9, 3) · sniper `line` 24×1.5 windup 1.4 coef 2.0 telegraph (11, 7) · `fg_leap` (14, 9) · trap `fg_pools` slow (17, 12) | 0.50 fan ×2 · 0.30 rage |

Targets: solo normal kill time 60–90 s at equal gear; party HP scaling `1 + 0.6 (n−1)` by `spawnEnemy`. Damage types by theme: crypt shadow/physical, forge fire, frost frost, shadow shadow, grotto poison.
Names: `${skin.adjective} ${noun}`: crypt "Mezarlık", forge "Kor", frost "Ayaz", shadow "Gölge", grotto "Çürük" (e.g. "Ayaz Kılıç Ustası", "Çürük Sürü Efendisi"). Title line: theme lore fragment.
Bodies (model, scale, tint, anims family); art pass by Sonnet may swap models, ids stay:

| arch | crypt | forge | frost | shadow | grotto |
|---|---|---|---|---|---|
| brute | SKEL Skeleton_Warrior 1.75 tint d8d0c0 | MON Orc 1.65 tint c8744c | MON Yeti 1.75 tint f0f6ff | MON Demon 1.6 tint 5020a0 | ITCH bear 1.5 tint 4a7a40 |
| duelist | SKEL Skeleton_Rogue 1.6 | CHAR Rogue 1.55 tint 8a3a20 | CHAR Knight 1.6 tint 8ab8e0 | CHAR Rogue 1.55 tint 4a2a7a | MON Goblin 1.3 tint 6a9a3a |
| caster | SKEL Skeleton_Mage 1.6 tint c0a8ff | CHAR Mage 1.5 tint 7a2020 | CHAR Mage 1.55 tint a8d8ff | CHAR Mage 1.55 tint 5a1a40 | CHAR Mage 1.5 tint 3a8a58 |
| hulk | MON Giant 1.2 tint e8dcc0 | GEN golem_stone 1.8 tint c0603c | GEN elemental_ice 1.7 | MON Demon 1.5 tint 3a1050 | ITCH rhino 1.2 tint 6a8a50 |
| swarmlord | SKEL Skeleton_Minion 1.9 tint e0d8c0 | MON Goblin 1.5 tint 8a6a50 | MON Yeti 1.3 tint c8e4ff | CHAR Rogue_Hooded 1.5 tint 3a1a50 | MON Mushroom_King 1.5 |
| hunter | CHAR Rogue_Hooded 1.5 tint c0d0c0 | CHAR Rogue_Hooded 1.5 tint 8a5a38 | CHAR Rogue_Hooded 1.5 tint c8e4ff | CHAR Rogue_Hooded 1.5 tint 2a1a3a | ITCH spider 1.4 tint 5a7a40 |

Clip names per family (from the existing defs): KayKit/SKEL: slash `1H_Melee_Attack_Slice_Horizontal` (impact 0.3), heavy `2H_Melee_Attack_Slice` (0.4), spin `2H_Melee_Attack_Spinning`, cast `Spellcast_Raise`/`Spellcast_Shoot`/`Spellcast_Summon`, shield `Block_Attack`, shoot `2H_Ranged_Shoot`, jump `Jump`, taunt `Taunt`. MON/ITCH: `Punch`(0.33) / `Weapon`(0.45) / `Attack`(0.37–0.5) / `Jump` / `Cast`. PG2 maps each skin to a `Moveset` clip table and keeps `impact` params.

### 6.3 Finals — 5 `BossDef`s (`fb_<theme>`), rank boss
Common: hp 85, dmg 2.4, poise 400, arenaRadius 24, enrage 330 s, 3 phases at 1.01 / 0.65 / 0.30 with a phase yell, `fg_rage` at 0.30, loot `loot_fis_final_<theme>`. Phase loadouts reuse §6.1 primitives with a **signature** each.

| id | name / title | body | kit | signature (2nd + 3rd phase) |
|---|---|---|---|---|
| `fb_crypt` | Mezar Kralı Vorok — "Unutulmuş Hükümdar" | GENB kemik_lordu 1.0 | string 3 · leap · wave · call (skeleton swarm) | **Tabutlar**: 4 `coffin` tombs spawn on the arena rim (tomb HP = 6x a trash unit, `ccImmune`), each opens after 12 s releasing 3 `skel_minion`; killing a tomb first denies the add wave |
| `fb_forge` | Kor Efendisi Kharzul — "Kızıl Örsün Gazabı" | GENB lav_golemi 0.85 | string 2 · stomp · charge · pools(fire) | **Dökümcü Hattı**: two crossing `band` flame walls alternate every 6 s (kit `band`), safe quadrants rotate |
| `fb_frost` | Don Kraliçesi Ysolde — "Ayaz Tahtının Varisi" | MON Yeti 2.0 tint a8d8ff | beam · fan · pools(frost) · call (ice bats) | **Kristal Sütunlar**: 4 pillars; her 15 s a beam locks to a pillar, standing behind a pillar is safe (kit `beam` + LOS); shatter on hit |
| `fb_shadow` | Boşluk Çağırıcı Malakh — "Gölge Tapınağın Sesi" | MON Demon_Lord 1.5 | string 3 · leap · grab · call (`void_imp`) | **Boşluk Halkaları**: expanding safe-lane rings (`ring` with a 3 m gap that rotates by table, 6 steps), pull `boss_pull` before each |
| `fb_grotto` | Çürük Ana Mykara — "Mantar Kraliçe" | MON Mushroom_King 1.8 | wave · pools(poison) · call (mushnub swarm) · stomp | **Spor Bulutu**: poison clouds grow every 10 s up to 5; popping one with a melee hit (it is a 20-HP `swarm` orb) removes it and heals nobody |

Signatures are scripts in `ai/bosses/fissure.ts` (`FISSURE_SCRIPTS['fb_<theme>']`), each ≤ 80 lines using `ai/bosses/kit.ts` helpers (`circle ring beam band wedge zone`). Tomb/orb entities spawn through the existing host spawn path (`world.allocHostId`, `spawn` channel) like the other boss mechanics. Fallback for a signature that Haiku cannot finish: the boss runs without it (kit works standalone), flagged in the QA report; run still completes.

### 6.4 Registering in the data layer
`enemies_fissure.ts` exports nothing used at runtime; it only **mutates `BOSSES`** at import. It is imported by `data/dungeons/fissure/index.ts` (side-effect import, first line) and by `tools/fissure-check.mjs`. `BOSS_SCRIPTS`/`BOSS_SPAWNS` get `...FISSURE_SCRIPTS` / `...FISSURE_SPAWNS` (one line each in `ai/bosses/index.ts`). `enemyAssetUrls` (preload) works from the ids in `def.bosses`/packs; spawned-add ids go to `FISSURE_SPAWNS`.

---------------------------------------------------------------------------------------------------------------------------------
## 7. Modifiers

Count by tier: `n` 0, `h` 1, `m` 2 (distinct, stage `mods`, uniform pick; `fm_bereket` at most once). Shown in preview, HUD chips, summary. Implemented where cheap:

| id | name (TR) | effect | implementation |
|---|---|---|---|
| `fm_surusu` | Kalabalık Sürü | +1 member in every trash/mixed pack | generator (§4.2) |
| `fm_zirh` | Zırhlı Sürü | non-boss HP ×1.25 | `fissureScaling(isBoss=false)` in `enemyScaling` |
| `fm_cevik` | Çevik Yaratıklar | non-boss move/attack speed ×1.12 | new optional `SpawnEnemyOpts.speedMult` set from `G.mplus.state.fissure` (enemies owner) |
| `fm_zalim` | Zalim Muhafızlar | bosses HP ×1.2, damage ×1.1 | `fissureScaling(isBoss=true)` |
| `fm_bereket` | Yarık Bereketi | +1 treasure branch, +1 elite pack, non-boss damage ×1.1; gold +25 % | generator + scaling + loot gold mult |
| `fm_ofke` | Öfkeli Ruhlar | = M+ `raging` | `FissureInfo.affixes = ['raging']` |
| `fm_guc` | Güçlenen Sürü | = M+ `bolstering` | affix |
| `fm_kan` | Kan Göletleri | = M+ `sanguine` | affix |

The three affix mods require `MythicPlus.prepare` to keep `affixes` for fissure runs (`def.fissure.affixes`, ignoring `params.affixes`) with `keyLevel` 0; `Affixes` scales by `affixDamageScale(0, minLevel) = 1` and has no difficulty gate (verified: no `difficulty` reference in `systems/Affixes.ts`). Verification step in PG5: run each of the three for 2 minutes at keyLevel 0, no exceptions.

---------------------------------------------------------------------------------------------------------------------------------
## 8. Difficulty, scaling, party

### 8.1 Tier table — `data/mythicAffixes.ts` additions (mythic owner): `FISSURE_TIERS`
| | Normal `n` | Kahramanlık `h` | Mitik `m` |
|---|---|---|---|
| unlock | char level ≥ 8 | level ≥ 30 and `fis.clear.n ≥ 1` | level 60 and `fis.clear.h ≥ 3` |
| enemy level | clamp(party avg level, 8, 60) | clamp(avg, 30, 60) | 60 |
| rooms R | 8–10 | 10–12 | 12–14 |
| non-boss HP / damage | ×1.00 / ×1.00 | ×1.35 / ×1.20 | ×1.90 / ×1.50 |
| boss HP / damage | ×1.00 / ×1.00 | ×1.30 / ×1.15 | ×1.80 / ×1.40 |
| modifiers | 0 | 1 | 2 |
| max tier (height) | 1 | 2 | 2 |
| item level (guardian / final) | min(62, lvl+1) / min(62, lvl+2) | 64 / 65 | 68 / 69 |
| target clear time solo | 18–25 min | 25–32 min | 32–42 min |

Ladder rationale (CORE §4.4): hand-crafted content stays the better ladder (Normal 62 · Kahramanlık 66 · Mitik 0 70 · M+ chest 68+): Fissure ilvl sits 1–2 below the matching tier. These multipliers REPLACE `DIFFICULTY_MULT` for fissure runs (never multiplied with it).
`fissureScaling(def.fissure, isBoss) → { hp, dmg }` = tier × mods; `MythicPlus.enemyScaling()` returns it first when `getDungeon(state.dungeonId)?.fissure` exists.
Party: baseline is the solo player; `partyHpMult()` unchanged (`1 + 0.6 (n−1)`); damage ×0.85 for n ≤ 2 is **not** applied (the baseline already is solo). Layout and body count do not depend on party size (D3). The solo "Yalnız Kurt" tank/healer rule (CORE §1.5) applies automatically (party size 1).
`enemyLevel` in `DungeonParams` is computed by the panel; the host's `onSceneRequest` clamp is 1..70, enough.

---------------------------------------------------------------------------------------------------------------------------------
## 9. Run flow, rewards, loot

### 9.1 Run lifecycle (existing machinery)
Town panel → `G.net.requestScene('dungeon', params)` with
`params = { dungeonId: fissureId(spec), difficulty: tier→'normal'|'heroic'|'mythic', keyLevel: 0, seed: spec.seed, affixes: [], enemyLevel, partySize, keyOwner: G.net.selfId }` →
`DungeonScene.enter` → `getDungeon` (regenerates) → `G.mplus.prepare` (reads `def.fissure`) → spawn → `tryBegin()` starts the clock immediately (non-M+, no timer shown) →
guardian/final fights through the existing gates → `onBossKilled(finalBossId)` → `checkCompletion()` completes (D6) → `handleCompleted()` on every peer → `run:completed` → exit portal + chest.
`MythicPlus.RunState.fissure` carries `{ tier, mods, finalBossId }` (replicated by the existing `run` channel snapshot; sanitized in `applyRemoteState` by whitelisting `tier`/`mods`).

### 9.2 Rewards (all per player, rolled locally on each peer: existing trust model)
| source | content |
|---|---|
| each guardian kill (boss table `loot_fis_g_<arch>`) | **1 guaranteed** item, no second chance; smart loot 70 % (spec main stat/armour type via `classId`); rarity weights `n {rare 80, epic 18, legendary 2}` · `h {62, 33, 5}` · `m {45, 46, 9}`; + 1–2 `yarik_kristali` |
| final kill (boss table `loot_fis_final_<theme>`) | **1 guaranteed + second item chance** `n 35 % · h 50 % · m 65 %`; weights `n {rare 60, epic 34, legendary 6}` · `h {40, 50, 10}` · `m {25, 58, 17}`; **legendary pity** (existing `loot.pity`, +25 %/boss kill, cap ×5) applies to all 3 boss kills; 3–5 `yarik_kristali` |
| end chest (`endOfRunRewards`, fissure branch) | **no items** (avoids double dipping); gold `lvl × 40 × {1,2,4}` (+25 % `fm_bereket`); `buyulu_toz` `{6,12,20}`; `ejderha_pulu` `h 1`, `m 2`; `ruh_tasi` `m` 25 % × 1; Daily first clear: +1 epic+ item at the final's weights shifted one rarity up |
| elites / trash | existing rank drops; elites roll rare+ at 30 % (existing `MPLUS.eliteItemChance` semantics via normal drop tables) |
| treasure rooms | existing `rollTreasure` (one elite-quality item + gold; iron/gold chest) |
| XP | existing boss xp (100× rank multiplier) + normal kill XP; **no** first-clear 50 % bonus per seed (audit §11.3) |

Named items: each `loot_fis_g_<arch>` has 2 named items and each `loot_fis_final_<theme>` 3 named build-defining uniques (CORE §15). They are designed in `docs/GDD_LOOT_V3.md`; until that exists the tables list **0 named items** and boss tables fall back to the generic roll (`LootSystem` already supports a table without named items). Table and material ids below are final so GDD_LOOT_V3 only fills content.
New material `yarik_kristali` ("Yarık Kristali", rare, stack 9999, `kind: 'crafting'`): sink at the Demirci "Yarık Takası" (10 → 1 `efsun_nesnesi`, 40 → 1 `kadim_efsun`, ids per GDD_ITEMS_V2 IT-01; until `CURRENCIES` is filled the exchange is disabled and the kristal sells for 150 gold).

### 9.3 Persistence (`CharacterSave.flags`, all scalar)
`fis.clear.n|h|m` (count, ≤ 9999), `fis.best.<tier>` (best clear seconds), `fis.daily` (last UTC day index claimed), `fis.lastTheme`. No per-seed flags (save bloat).

---------------------------------------------------------------------------------------------------------------------------------
## 10. Net determinism

- **Wire:** only `DungeonParams` (already on the `scene` channel). The id carries theme/tier/seed/version. `NetSession.onSceneRequest` sanitizes with `ident(…, 48)`: our ids pass unchanged.
- **Version skew:** `getFissureDef` returns `undefined` for `v !== FISSURE_VERSION` → DungeonScene's existing error toast + `Bilinmeyen zindan. Şehre dönülüyor...`. The preview panel disables "Yarığa Gir" for the host if any peer announced another version: `PeerInfo` is untouched; instead the room announcement (`RoomAnnouncement`) gains optional `fv?: number` (net owner, optional field) and the panel compares. If `fv` is missing (older build) treat as mismatch.
- **Hash self-check:** v1 has no runtime exchange. DungeonScene logs `defHash = fnv(JSON.stringify([rooms, doors, packs, bosses]))` in its existing `[dungeon] built` debug line so QA can compare two consoles; `tools/fissure-check.mjs` guarantees repeatability. Equal code plus equal id gives equal defs, and unequal code is blocked by `v`. A runtime hash compare through the host is open question Q5.
- **Join in progress:** replay of `currentScene.params` regenerates the same def; enemy ids are positional, so late joiners agree.
- **What may use `Math.random`:** cosmetics only. Boss scripts already use `Math.random` host-side (clients never decide); nothing the generator emits depends on it.
- **Host authority** unchanged: HP/death/boss state host-side; each peer rolls own loot on `death`; `run` snapshot completes the run on clients.

---------------------------------------------------------------------------------------------------------------------------------
## 11. Entry stones, UI, integration points

### 11.1 Yarık Taşı placement
- `FissureStone` interactable (`entities/interactables/FissureStone.ts`, scenes): prop = `gp('crystal_purple')` ×1.6 on a `kg('altar-stone')`, violet emissive pulse, `vfx 'portal_swirl'` colour per theme preselected on the stone; prompt "Yarık Taşı: Kadim Yarıklar"; opens `G.ui.openPanel('fissure', { stoneTheme?: FissureThemeId })`.
- **Capital:** a `TownNpc` (`role 'portal'`, `object` form like Sef Taşı, `ui: { panel: 'fissure' }`, id `npc_yarik_tasi`) on the plaza next to the Group Finder obelisk (exact xz: Haiku PG10 picks the nearest free plaza tile ≥ 3 m from existing props, y of the plaza terrace).
- **Every zone:** `WorldExtras.fissureStones?: { id: string; regionId: string; pos: [number, number]; theme: FissureThemeId }[]` (append-only in types/dungeons.ts; spawned by `WorldRuntime` like waypoints; map pin on the world map and minimap). For Sisli Vadi: one stone per region r1…r6 (`theme` r1 grotto, r2 crypt, r3 grotto, r4 forge, r5 crypt, r6 shadow: tune to region fiction), placed 6–10 m beside each region's waypoint stone (`WaypointDef.pos`) so travel networks and stones coincide. Future maps add their stones in their own data.
- Also offered in the Group Finder as tab "Kadim Yarıklar" (later; panel is reusable: `openPanel('fissure')`).

### 11.2 UI contracts
- Panel `fissure` (panels-game, `ui/panels/game/fissure.ts`, css `panels-game.css` append): sections §2; uses `generateFissure` directly for the preview (pure, ≤ 15 ms, debounced 120 ms), canvas minimap (room rect fill by tier: tier0 #6b7280, tier1 #9aa7b8, tier2 #cfd8e3; guardians gold ring, final red ring, start green); Turkish strings in one `FISSURE_TR` object in `data/fissureText.ts` (PG1) so UI/HUD share it.
- HUD `FissureTracker` (`ui/hud/FissureTracker.ts`, hud): shown when `getDungeon(mplus.state.dungeonId)?.fissure`; line 1 "Kadim Yarık · Mezarlık · Kahramanlık", line 2 "Oda 4/10 · Muhafız 1/2 · Son Patron", modifier chips (tooltips from `FISSURE_TR.mods`), elapsed time (no timer colour). Hidden for M+ (MythicTracker unchanged).
- Minimap/map: existing code draws `def.rooms`; boss rooms use `RoomDef.boss`; the map panel marks `optional` rooms. No change expected; QA checks it.
- Run summary: existing `runSummary` panel shows `state`; add a "Yarık" line when `state.fissure` (panels-game, same package as the fissure panel).
- Audio: existing `boss:engaged`/`run:completed` hooks work; `ui_*` clicks in the panel.

### 11.3 Audit — existing listeners that fissure runs would pollute (guards required, all use `isFissureId(state.dungeonId)`)
| file:site | problem | guard |
|---|---|---|
| `systems/MythicPlus.ts handleCompleted` (`clearedM0`, `grantKeystone`, `stats` ok) | a Mitik fissure would unlock keystones / M0 | skip both when fissure; keep `stats.dungeonsCompleted++` |
| `systems/Bounties.ts` `run:completed` → `recordClear`, `firstClearBonus` | per-seed `clear.<id>.<diff>` flags (save bloat) and a 50 % level XP bonus per new seed (exploit) | skip both; still call `bountyEvent('dungeon', 1)` (daily bounties may count fissures: intended farm content); add `fis.clear.<tier>++` here |
| `scenes/world/Ladder.ts onRunCompleted` | unlock toasts `ladder.heroic.<id>` per seed | return early |
| `systems/Progression.ts onRunCompleted` | uses `DUNGEONS[id]` → undefined → already no-op | none (add comment) |
| `systems/MythicPlus.ts` `dungeonName()` uses `DUNGEONS[id]?.name ?? id` | shows raw id in toasts | use `getDungeon(id)?.name` |
| `ui/panels/game/base.ts dungeonName`, `keystone.ts`, `ladder.ts` | `DUNGEONS` only: fissures correctly invisible in keystone/ladder panels | none |
| `Combat`/`LootSystem` `getDungeon(zone)?.packs` lootTable lookup | generated packs carry no lootTable | none |
| `DungeonScene.releaseRequested` | M+ only respawns at start; fissure uses checkpoints | none |

---------------------------------------------------------------------------------------------------------------------------------
## 12. Ownership and change list (existing files touched)

| File | Module (owner) | Change |
|---|---|---|
| `src/data/dungeons/fissure/{types,ids,archetypes,themes,generate,populate,bosses,index}.ts` | content | NEW |
| `src/data/dungeons/index.ts` | content | `getDungeon`: first line `if (isFissureId(id)) return getFissureDef(id);` |
| `src/data/fissureText.ts` | content | NEW Turkish strings |
| `src/types/dungeons.ts` | core (append) | `FissureInfo`, `DungeonDef.fissure?`, `WorldExtras.fissureStones?`, `RoomDef` §13 fields if missing |
| `src/types/mythic.ts` | core (append) | `RunState.fissure?` |
| `src/data/enemies.ts` | enemies | `export` on helpers only; no logic change |
| `src/data/enemies_fissure.ts` | enemies | NEW (30 guardians + 5 finals into `BOSSES`) |
| `src/ai/bosses/fissure.ts`, `src/ai/bosses/index.ts` | enemies | NEW primitives + signatures; merge lines |
| `src/entities/EnemyFactory.ts` | enemies | `SpawnEnemyOpts.speedMult?`; read `fm_cevik` |
| `src/data/loot.ts`, `src/data/materials.ts` | items | tables `loot_fis_*` (generic, named list empty), material `yarik_kristali` |
| `src/systems/LootSystem.ts` | items | `endOfRunRewards` fissure branch (§9.2) |
| `src/systems/MythicPlus.ts`, `src/data/mythicAffixes.ts` | mythic | prepare (affixes, `state.fissure`), `enemyScaling`, `checkCompletion` (D6), `handleCompleted` guards, `FISSURE_TIERS`, `fissureScaling` |
| `src/systems/Bounties.ts`, `src/scenes/world/Ladder.ts` | items / scenes | guards §11.3 |
| `src/scenes/DungeonScene.ts` | scenes | chest tier for fissure (`chestTierForKey(0, diff)` already fine); toast text; `spawnReward` text "Yarık tamamlandı"; nothing else (generic) |
| `src/entities/interactables/FissureStone.ts`, `src/scenes/world/WorldRuntime.ts` | scenes | NEW stone, spawn from `fissureStones` |
| `src/data/town.ts`, `src/data/world/sisli_vadi.ts` | content | NPC + stones data |
| `src/ui/panels/game/fissure.ts`, `index.ts`, `panels-game.css`, `runSummary.ts` | panels-game | NEW panel, registration, summary line |
| `src/ui/hud/FissureTracker.ts` (+ HUD mount line) | hud | NEW tracker |
| `src/net/messages.ts` | net | optional `RoomAnnouncement.fv` |
| `ARCHITECTURE.md` | core | panels list += `fissure`; Gameplay flows += one paragraph; this doc referenced |
| `tools/fissure-check.mjs` | content | NEW validator (§13) |

---------------------------------------------------------------------------------------------------------------------------------
## 13. Implementation packages (Haiku), waves of ≤ 3, file-disjoint inside a wave

Global rules: `npx tsc --noEmit` clean in own files; Turkish UI strings; no `Math.random`/trig in `fissure/*.ts` (V13); commit nothing; report public APIs. After each Haiku block: Sonnet reviews the diff, orchestrator spot-checks, then Haiku fixes (review policy). One Haiku QA browser pass only at the very end (low-CPU policy): no per-agent browser tests, ≤ 5 concurrent agents.

**Wave 0 (not in this doc): CORE §13 verticality engine** (`RoomDef.floorY/ceiling/ramp`, heightfield `World.groundY`, NavGrid steps). Must land before heightTiers are enabled; PG1–PG10 do not wait for it (flag off).

### Wave A (3 parallel)
| Pkg | Owner | Files | Task | Verify |
|---|---|---|---|---|
| **PG1** | content/core | `fissure/types.ts`, `ids.ts`, `archetypes.ts`, `themes.ts`, `data/fissureText.ts`; appends to `types/dungeons.ts`, `types/mythic.ts` | All §3 types; id codec + `dailySpec`; archetype table §5.1 incl. fallback chains; 5 `ThemeDef`s (§5.2/5.3: themes, rosters, props, `DungeonTheme` copies, `roomNames` ≥ 4/kind, lore); `FISSURE_TR` | `tsc`; `node` script prints every theme enemy id missing from `ENEMIES` (must be none) and every prop url missing on disk (swap to nearest); `parseFissureId(fissureId(x))` round trip over 1000 seeds |
| **PG2** | enemies | `enemies.ts` (export keywords), `enemies_fissure.ts`, `ai/bosses/fissure.ts`, `ai/bosses/index.ts`, `EnemyFactory.ts` (`speedMult`) | §6: 8 primitives, 30 guardian defs from the archetype×skin tables, 5 finals with signatures, `FISSURE_SCRIPTS/SPAWNS`; boss ids per §6 | `tsc`; a headless script lists every `BOSSES['fg_*'|'fb_*']` with ability count ≥ 3, windups > 0, valid `anims`/model urls (file exists); dev page `dev/enemies.html` loads 2 random ones (**orchestrator**, not Haiku, once) |
| **PG3** | items | `data/loot.ts`, `data/materials.ts`, `systems/LootSystem.ts` (fissure branch) | §9.2: tables, `yarik_kristali`, `endOfRunRewards` branch keyed by `getDungeon(state.dungeonId)?.fissure` (import via `getDungeon`; no cycle: LootSystem already imports it) | `tsc`; unit-style node check of the weight tables sum and ilvl formula per tier |

### Wave B (3 parallel; needs PG1 types, PG2 ids by name only)
| Pkg | Owner | Files | Task | Verify |
|---|---|---|---|---|
| **PG4** | content | `fissure/generate.ts`, `populate.ts`, `bosses.ts`, `index.ts`, `data/dungeons/index.ts`, `tools/fissure-check.mjs` | §4 in full incl. fallback, `getFissureDef` + LRU, `FissureInfo`; the check tool with V1–V13 | `node tools/fissure-check.mjs` (all themes × tiers × 2000 seeds) exits 0; prints p99 gen ms, room/pack/enemy histograms, fallback count (target 0 over 30 000 seeds, hard fail > 0.5 %) |
| **PG5** | mythic | `systems/MythicPlus.ts`, `data/mythicAffixes.ts` | §7–§9 rules: `FISSURE_TIERS`, `fissureScaling`, `prepare` (affixes, `state.fissure`, `bossesTotal` 3, `forcesRequired` 0), `enemyScaling`, D6 completion, guards in `handleCompleted`, `dungeonName` via `getDungeon`, `applyRemoteState` whitelist | `tsc`; `dev/mythic.html` scripted: prepare a fissure state, call `onBossKilled(finalId)` → completed; M+ state unaffected (regression run of an existing dungeon) |
| **PG6** | items/scenes guards | `systems/Bounties.ts`, `scenes/world/Ladder.ts` | §11.3 guards + `fis.clear.<tier>` counter + `fis.best` | `tsc`; script: emit `run:completed` with a fissure state, assert no `clear.*`/`ladder.*` flag written |

### Wave C (3 parallel; engine integration)
| Pkg | Owner | Files | Task | Verify |
|---|---|---|---|---|
| **PG7** | scenes | `scenes/DungeonScene.ts`, `entities/interactables/FissureStone.ts`, `entities/interactables/index.ts` | reward text/tier tweaks, optional `fm_bereket` gold mult hook, FissureStone entity (prompt, vfx, `openPanel`) | `tsc`; offline smoke: orchestrator starts one Normal fissure from the dev console `G.net.requestScene('dungeon', {…})` and walks to the first guardian |
| **PG8** | panels-game | `ui/panels/game/fissure.ts`, `ui/panels/game/index.ts`, `ui/styles/panels-game.css` (append), `ui/panels/game/runSummary.ts` | §2/§11.2 panel with preview canvas, locks, host-only start, daily tab | `tsc`; panel opens from `dev/panels-game.html` with a fake character at lvl 8/30/60 (lock texts) |
| **PG9** | hud | `ui/hud/FissureTracker.ts` + the one HUD mount line | §11.2 tracker | `tsc`; shows/hides across M+ vs fissure state in `dev/hud.html` |

### Wave D (3 parallel; world placement, netcode field, docs)
| Pkg | Owner | Files | Task | Verify |
|---|---|---|---|---|
| **PG10** | content | `data/town.ts`, `data/world/sisli_vadi.ts` | capital NPC + 6 region stones (`WorldExtras.fissureStones`), no collisions (reuse the builders' validators in `tools/content-check.mjs`) | `node tools/content-check.mjs` passes |
| **PG11** | scenes | `scenes/world/WorldRuntime.ts` (+ map pin hook if exists) | spawn `FissureStone`s from `fissureStones` | `tsc`; stones appear in Sisli Vadi (orchestrator check) |
| **PG12** | net/core | `net/messages.ts` (`RoomAnnouncement.fv`), `ARCHITECTURE.md` | version announce + docs lines | `tsc`; `node` round trip of the announcement sanitizer |

### Final
One **Haiku QA** pass (single agent, one browser session): town stone → panel → solo Normal run through 2 guardians + final; one Kahramanlık preview; two-tab party join (host starts, client enters same map: compare `[dungeon] built` hashes in both consoles); gather console errors. Then Sonnet review of the whole diff.

---------------------------------------------------------------------------------------------------------------------------------
## 14. Migration notes
- No save migration: only new scalar `flags` (`fis.*`) and a new material id; old saves load unchanged. `SAVE_VERSION` stays.
- Every type addition is optional (`DungeonDef.fissure`, `RunState.fissure`, `WorldExtras.fissureStones`, `RoomAnnouncement.fv`, `SpawnEnemyOpts.speedMult`). Existing dungeons and M+ untouched.
- `FISSURE_VERSION` policy: any change to archetype dimensions, weights, rosters, RNG stage names, pack offsets, boss pools or tier tables bumps it; old ids then fail closed (toast) instead of generating a different map for a peer on a stale build. Daily seeds change meaning when the version bumps (fine).
- `getDungeon` becomes the only lookup that understands fissure ids; code that indexes `DUNGEONS[id]` directly keeps ignoring them by design (§11.3).

## 15. Open questions
1. **Q1 Verticality timing:** does the §13 engine ship before launch? Until then fissures are flat; is flat acceptable for the first release, or should PG4 wait for Wave 0?
2. **Q2 Named unique items:** `docs/GDD_LOOT_V3.md` does not exist yet; boss tables ship with 0 named items. Block on it or ship generic first?
3. **Q3 Theme gating by level:** hints only (8–35 etc.) or hard locks per theme (e.g. shadow ≥ 30)? Spec currently = hints, no locks.
4. **Q4 Mitik ilvl 68/69 vs Mitik 0 (70):** acceptable "just below" ladder, or should fissures cap lower (66) so M+ stays the only 68+ source?
5. **Q5 Runtime hash exchange:** v1 relies on `FISSURE_VERSION` + the check tool; do you want a runtime `defHash` compare through the host (cheap, small `net` addition) for safety against future float regressions?
6. **Q6 Daily leaderboard:** the seed is in the id so Raider.IO-style daily boards (CORE §7 gossip) are possible; in v1 or later?
7. **Q7 Yarık Kristali sink:** needs GDD_ITEMS_V2 IT-01 `CURRENCIES`; confirm "10 → efsun_nesnesi / 40 → kadim_efsun" or choose another sink.
8. **Q8 Entry panel for clients:** only the host starts (like the South Gate). Should the stone's owner (any party member) be able to start via `requestSceneFromHost` like the keystone?
