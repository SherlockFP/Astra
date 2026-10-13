# EFSUN ONLINE – GDD: Grup Bulucu (I), PvP Arenaları ve PvP Ekipmanı

Status: design, not implemented. Owner of this doc: systems design (Sonnet/Haiku research pass, 2026-10-13).
Scope: (1) Group Finder on key **I** (inventory moves to **B** only); (2) arena PvP (1v1 / 2v2 / 3v3, rated and unrated);
(3) PvP-only gear, currencies and vendors. Player-facing text is Turkish; this document is English.

Reads with: `docs/GDD_LIFE.md` §7 (open-world PvP, the `pvp` channel, `PVP` constants, Onur), `docs/NETCODE.md` (P2P rules),
`docs/GDD_V2.md` §9.7 (raid finder), `docs/ref/ui/README.md` #6 (Group Finder reference) and #7 (world map).
Where this doc and an older GDD disagree, the **Amendments** table in §0.3 wins and must be applied by the owning package.

---

## 0. Decisions at a glance

### 0.1 Summary of what is decided

| # | Decision | Why |
|---|---|---|
| D1 | **I** opens the Group Finder (`groupFinder`). **B** is the only inventory key. C, J, M, N, O, K, L, P, Y stay as they are. | User request: "I = Grup Bulucu, envanter B". `I` is only an alias of inventory today (`src/core/Input.ts` line 45). |
| D2 | Finder tabs: **Zindanlar ve Raidler** · **Oyuncuya Karşı** · **Mitik+**. Left column in tab 1: Zindan Bulucu · Raid Bulucu · Hazır Gruplar (ref #6). | User request, matches reference #6. |
| D3 | **Serverless matchmaking** = queue shards (one trystero room per queue key), a deterministic proposer (oldest queued peer in the match), a 2-step handshake (`qprop` → `qack`), then the proposer hosts the game room and the others join by code. | Only P2P rooms exist (`docs/NETCODE.md` §3). No server may decide matches. |
| D4 | **Arena damage** is attacker-computed, victim-mitigated. New typed channels `phit` (attacker → victim, host relays) and `phack` (victim → attacker). Victim HP is never predicted by the attacker. | User request ("phit"). The `pvp` channel's `hit`/`ack` variants already describe this path but are unused (no `NetSession` handler; grep). They are kept for append-only compatibility and marked deprecated (see §0.3). |
| D5 | Arena match = **best of 3 rounds, 5 min per round**, 30 s prep behind closed gates, **dampening** (Yıpranma) from 120 s: healing received −8 % per minute, cap −50 %. | User request. Dampening is the standard anti-stall rule in rated arenas (WoW precedent, see §10). |
| D6 | PvP rating is **Elo-like per bracket** (1v1, 2v2, 3v3), **local-and-announced**: each peer stores its own rating, the host computes the result and broadcasts it. Seasons = 8 weeks. | Consistent with NETCODE §5 (rating is owner-stored). No server ladder exists. |
| D7 | **PvP-only stats** are the existing `pvpPower` (PvP Gücü) and `pvpResilience`. The display name stays **"PvP Direnci"** (`src/types/stats.ts`). "Esneklik" is rejected as a second name for the same stat. | Avoids two names for one stat. The user's "Direnç/Esneklik" request is satisfied by the existing stat. |
| D8 | **Arena item-level normalisation**: inside arenas PvE item affixes count at **60 %**, PvP items at **100 %**. Class, level and talent bases are unchanged. | "PvE gear weaker in arenas" request, implemented as one multiplier in `StatCalc`. |
| D9 | Two PvP currencies: **Onur** (honor, world PvP + arena unrated + daily first win) and **Fetih** (conquest, ranked arena only, weekly cap). Vendors: `pvp_honor` / `pvp_conquest` modes of the vendor panel. | User request. The GDD_LIFE Onur definition is extended, not replaced (see §0.3). |
| D10 | **Raid Bulucu moves** from the `party` panel (O) into the Group Finder (I). The party panel keeps roster, ready check and key owner. | One finder. GDD_V2 §9.7 amended. |
| D11 | Protocol bump: **`PROTOCOL_VERSION` 2 → 3** (new channels, new lobby channels, new summary fields). `GAME_VERSION` 0.1.0 → 0.2.0 when arena data ships. | NETCODE §0/§7: bump on any wire-format change; lobby and game room ids are namespaced by it. |

### 0.2 What this doc does NOT do

- No cross-room PvP, no server, no host migration (out of scope, as in NETCODE §4.2).
- No open-world queue (queue works in the town only in v1; the open-world map gets a queue later).
- No new dungeons. The Raid Bulucu tab is wired but **disabled** until the Efsun Kalesi raid exists (GDD_V2 §9).
- No code is written by this document. Packages are in §9.

### 0.3 Amendments to existing GDDs (the owning package must apply them)

| Doc | Section | Change |
|---|---|---|
| `docs/GDD_LIFE.md` | §7.5 `pvp` channel | `hit` and `ack` variants are **deprecated** (kept in `PvpMsg`, never sent). Player hits, arena and world, go through `phit` / `phack` (§3.5). `flag`, `duel`, `kill`, `score` stay on `pvp`. |
| `docs/GDD_LIFE.md` | §7.7 Onur gear table | Onur items are the **Er** tier: ilvl **52** (was 58). The ilvl 58 tier is **Fetih** (§4.2). Prices unchanged. |
| `docs/GDD_LIFE.md` | §7.4 `PVP` | Arena overrides in §3.6 (`ARENA_PVP`). Open-world numbers unchanged. |
| `docs/GDD_V2.md` | §9.7 | Raid Bulucu lives in the Group Finder (I), not the party tab (O). |
| `ARCHITECTURE.md` | line ~477 (PvP relay) | Replace "the `pvp` channel (flag, duel, hit, ack, kill, score) is relayed" with "`phit` / `phack` carry player hits; `pvp` carries flag, duel, kill, score". |
| `src/core/Input.ts` | `inventory` | `['KeyB']` only. New action `groupFinder: ['KeyI']` (appended to `InputAction`). Saved user bindings that map `KeyI` to inventory are migrated in `core/Settings.ts` (§9, PV-00). |

---

## 1. Ground truth (what the code does today)

Read before implementing. File references are to the repo at 2026-10-13.

| Area | Fact | Where |
|---|---|---|
| Keys | `inventory: ['KeyI','KeyB']`. Free letters: none. `Digit1–0`, `F1–F5`, `Mouse0–3` are taken. | `src/core/Input.ts` L33–80 |
| Lobby | One fixed trystero room `efsun-lobby-v2`, channels `ann`, `unann`, `lchat`. `openLobby()` always uses `LOBBY_ROOM_ID`. `openRoom()` takes any `roomId`, so a shard helper is cheap. | `src/net/messages.ts`, `src/net/index.ts` L106–121 |
| Lobby cost | Every lobby member is connected to every other (N−1 PCs). NETCODE §3.3 names sharding as the first scale-up step. | `docs/NETCODE.md` §3.3 |
| Hosting | `hostRoom()` refuses unless the scene is **town**, clamps `maxPlayers` to `2..MAX_PARTY_SIZE (5)`, and takes no explicit code (it generates one). | `src/net/NetSession.ts` L336–360 |
| Joining | `onHello()` rejects `full` (≥ maxPlayers), `in_progress` (dungeon scene, not open world), `version`, `bad_data`. Slot = lowest free. | `NetSession.ts` L899–927 |
| Room size | `MAX_ROOM_SIZE = 8` exists and is documented for `pvp` rooms, but nothing uses it yet. | `messages.ts` L40–41, L148–149 |
| Announcement | `RoomAnnouncement` has `mode?: 'coop'|'pvp'` and `minIlvl?`. No queue or listing metadata. | `messages.ts` L120–152 |
| PvP channel | `PvpMsg` union (`flag`, `duel`, `hit`, `ack`, `kill`, `score`). **No handler in NetSession** (grep for `pvp` finds only types and events). | `src/types/net.ts` L35–41, `src/core/events.ts` L217–222 |
| Damage out | `Combat.rollOutgoing(attacker, spec, target)` returns raw roll + crit (no victim mitigation). Player→enemy path: client predicts, host applies (`G.net.sendToHost('hit', …)`). | `src/combat/Combat.ts` L330–345, L454 |
| Damage in | `Combat.hitLocalPlayer(IncomingHit)`: i-frames → parry → dodge → block → armour/resist. Owner-applied. | `Combat.ts` L1420–1470 |
| Status | `StatusId` already includes `stun, slow, root, freeze, knockdown, silence, fear, blind, taunt`. | `src/types/skills.ts` L92–104 |
| Stats | `pvpPower`, `pvpResilience` exist with names "PvP Gücü", "PvP Direnci". `ccReductionPct` exists. | `src/types/stats.ts` L30, L105–106 |
| Vendors | `VendorKind = 'merchant'|'alchemist'|'blacksmith'|'metin'|'weaponsmith'|'armorsmith'`. Entries can pay in a material (`currency`, `perUnit`) and have `dailyLimit` / `shopKey`. | `src/systems/Vendor.ts` L11–32, L145–240 |
| Vendor UI | Panel kinds: `merchant`, `alchemist`, `gamble`, `seal_vendor`. | `src/ui/panels/items/VendorPanel.ts` L12 |
| Dungeons | `DUNGEON_IDS` = 4 dungeons (kemik_mahzeni, kizil_dokumhane, buzul_tahti, golge_tapinagi). Open zones are separate (`OPEN_ZONES`). `getDungeon()` resolves ids. | `src/data/dungeons/index.ts` |
| Dungeon def | `DungeonDef` has `levelRange`, `timerSec`, `raid?` (Efsun Kalesi, not yet present), `world?`, `outdoor?`. Builder: `buildDungeon(def)`. | `src/types/dungeons.ts`, `src/world/DungeonBuilder.ts` |
| Difficulty | `normal | heroic | mythic | mythicplus`; ladder unlocks in `ui/panels/game/ladder.ts`. | `src/types/common.ts` L49, `keystone.ts` |
| M+ rating | `MythicProfile { rating, best: {dungeon: {fortified?, tyrannical?}}, weekly: {week, runs[]}, seasons? }`. `computeRunScore`, `dungeonScore` = 1.5·max + 0.5·min. | `src/types/mythic.ts`, `src/data/mythicAffixes.ts` L183–190 |
| M+ profile UI | `MplusInfoPanel` (key J) already shows score, best runs and timed-count breakpoints `[2,4,7,10,12]`. | `src/ui/panels/game/mplusInfo.ts` |
| Party panel | `PartyPanel` (key O) has roster, ready check, keystone pick. No finder tab yet. | `src/ui/panels/game/party.ts` |
| Town NPCs | `npc_egitmen` Kaya (−24, 32) in Eğitim Alanı box `[−56,24,−20,56]`. `obj_bulusma_tasi` (lobby stone, −8, 18). `npc_anahtar_ustasi` (0, −34). | `src/data/town.ts` L233–320 |
| Save | `CharacterSave` has `materials` (currencies), `flags` (daily keys), `titles`, `mythic`, `raid`, `spec?`. `SAVE_VERSION = 2` with `normaliseCharacterSave` for defaults. | `src/types/character.ts` L18–63, `src/core/Save.ts` L12 |
| Specs & roles | `SpecDef.role: RoleId` (`'tank'|'healer'|'dps'`). 13 specs in `SpecId`. | `src/types/v2.ts` L12–50 |
| Scenes | `SceneId = loading|menu|town|dungeon`. `DungeonParams` carries `dungeonId, difficulty, keyLevel, seed, affixes, enemyLevel, partySize, keyOwner, spawn?, returnTo?`. | `src/types/common.ts` L47, `src/scenes/scenes.ts` L15–33 |
| Ready check | `G.net.startReadyCheck(label)` + `setReady()`; host then calls `requestScene`. | `NetSession.ts` L664–690, NETCODE §4.3 |

**Consequence:** a 3v3 arena (6 players) cannot be a `coop` room (max 5). It needs a `mode: 'pvp'` room with `maxPlayers` up to 8, and `hostRoom()` must accept that.

---

## 2. Grup Bulucu (Group Finder, key I)

### 2.1 Window layout

Desktop target 1000 × 640 px (scales with the UI scale setting; min 760 px wide). Opened by `I` (`groupFinder`), by the "Grup Bulucu" button on the party panel header, and by the Buluşma Taşı interaction (second button "Grup Bul").

```
+-----------------------------------------------------------------------------------+
| GRUP BULUCU                                                              [X]      |
| [Zindanlar ve Raidler]  [Oyuncuya Karşı]  [Mitik+]                                |
+-------------+---------------------------------------------------+-----------------+
| ( Zindan )  |  ROLLER:  [x] Tank  [x] Şifacı  [ ] Hasarcı  [ ] Lider              |  M+ PROFİLİ
|  Bulucu     |  Tür:  [Rastgele Kahramanlık ▼]   Zorluk: [Kahramanlık ▼]           |  Puan 3910 (turuncu)
| ( Raid )    |                                                                    |  En iyi: +21 KR
|  Bulucu     |  Başlık: Rastgele Kahramanlık                                       |  Zamanlı 15+ : 44
| ( Hazır )   |  Ödül: [ikon] altın · eşya · "Bugün ilk: 1 ekstra ödül"            |  En iyi zindanlar
|  Gruplar    |  "Bu ödülü bugün 1 kez daha alabilirsin."                          |   - Kemik  +12
|             |                                                                    |   - Kızıl  +9
|             |                                                                    |
|             |  [ Grup Bul ]          [ Tek Başına Gir ]                          |
+-------------+---------------------------------------------------+-----------------+
| Kuyrukta: 02:15 · Tank ✓  Şifacı ✓  Hasarcı 1/3   [Kuyruğu İptal Et]               |
+-----------------------------------------------------------------------------------+
```

Rules:
- Left column = the three big round icons (ref #6). Selected icon has a gold ring. Raid icon shows a lock badge until the raid exists.
- The bottom queue bar is shared by all tabs. It shows **the** active queue, one at a time. Starting a second queue is refused ("Zaten bir kuyruktasın.").
- The right column (M+ profile) is shown in tabs 1 and 2 (compact), and full in tab 3.
- All lists use `textContent` (no `innerHTML`) for names and titles from other players (NETCODE §10).

### 2.2 Tab 1 – Zindan Bulucu

| Control | Rule |
|---|---|
| Roller | Checkboxes: Tank, Şifacı, Hasarcı. **At least one** must be checked. Lider flag is a separate toggle (only meaningful in Hazır Gruplar). Roles are *declared*, not locked to the spec. |
| Tür | `Rastgele Normal`, `Rastgele Kahramanlık`, or one specific dungeon from `DUNGEON_IDS` (the 4 dungeons). Specific dungeons only list unlocked ones (ladder rules in `ladder.ts`). |
| Zorluk | `Normal` / `Kahramanlık` / `Mitik` / `Mitik+` (+ key level stepper, 2–30). Mitik and Mitik+ are only offered for specific dungeons, not for random. Unlock rules are the keystone panel's (`ladder.ts difficultyState`). |
| Ödül kutusu | Shows the reward preview of the chosen dungeon and, for random modes, the **first-run bonus** (below). |
| Grup Bul | Queues. Disabled while a queue is active or while the local player is not in the town. |
| Tek Başına Gir | Starts an offline run (`partySize: 1`), same start path as the keystone panel's solo start. No queue, no network. |

**Daily first-run bonus (Günün ilk rastgele zindanı):** the first *completed* run per day (bounty day key from `systems/Bounties.ts`) started through a random finder queue grants one extra reward roll (`extraLootRolls: 1`) and +40 % gold of the run. Flag `finder.bonus.<dayKey>`. Solo runs do not count. Shown as "Bugün ilk: 1 ekstra ödül" until used.

### 2.3 Tab 1 – Raid Bulucu

- Shows Efsun Kalesi wings (`bossOrder` from the raid data once it exists, GDD_V2 §9). **v1: disabled** with the banner "Yakında — Efsun Kalesi henüz açılmadı." and no queue.
- When enabled (later package): difficulty selector, per-boss lockout ticks for every party member (`save.raid`), recommended ilvl (red/green), "Hazırım" ready check (15 s, reuses the ready check), leader "Raid'e Gir" → `requestScene('dungeon', {dungeonId:'efsun_kalesi', difficulty, partySize, seed, affixes:[], enemyLevel: 62|64|66, keyOwner: ''})` (GDD_V2 §9.7).

### 2.4 Tab 1 – Hazır Gruplar (premade groups)

- Lists joinable rooms from the lobby (`RoomBrowser.list()`), filtered to `activity ∈ {dungeon, mythic}` or with `lfg` set (see §2.8). Columns: Başlık, Zindan, Anahtar, Aranan roller, Min. ilvl, Oyuncular, Gecikme. Sorting as in NETCODE §3.1 (joinable first).
- **Grup Oluştur** (leader flag required): opens a small form (title ≤ 32 chars, dungeon, difficulty, key level, needed roles 0/1/3, min ilvl 0–999, password optional). Creates the room with `hostRoom({public: true, lfg})`.
- Joining an entry with `hasPassword` asks for the password (NETCODE §3.5 text). A full room shows "Oda dolu."
- Empty list text: "Açık grup bulunamadı. Kendi grubunu kur!"

### 2.5 Tab 2 – Oyuncuya Karşı (PvP queues)

Entry point to the PvP queues described in §3.1. Layout:

- Three cards: **Düello Pratiği (1v1)**, **2v2 Arena**, **3v3 Arena**. Each card: "Derecesiz" / "Dereceli" toggle (Düello Pratiği is always unranked), current bracket rating, weekly Fetih progress bar (ranked only).
- A line "Sezon {n} · Hafta {k}/8" and "Yıpranma: 120 sn sonra başlar, dakikada %8 iyileşme azalır" (rules tooltip).
- Button **Kuyruğa Gir**. Queue bar shows the queue timer and the current rating window (e.g. "Puan aralığı: 1450–1650").
- Right column: PvP profile (rating per bracket, titles, season, Onur today `x/1500`, Fetih this week `x/cap`).

### 2.6 Tab 3 – Mitik+

- Embeds the body of `MplusInfoPanel` (refactored into an exported component `MplusProfileView`, §9 PV-03). The J key keeps opening the standalone panel.
- Shows keystone (current key, dungeon, weekly affixes), the Raider.IO-like profile: score, best run per dungeon, timed-count breakpoints `[2–3, 4–6, 7–9, 10–11, 12–14, 15+]`.
- Button **Anahtar Seç** → keystone panel. Queue for Mitik+ is started from tab 1 (Zindan Bulucu + Mitik+) so there is one queue entry point.

### 2.7 Solo fallback ("Tek Başına Gir")

Immediate, offline, `partySize: 1`, selected dungeon/difficulty (random modes pick the first eligible dungeon). Keeps records and rewards; `RunRecord.solo = true` (new optional field). Not queued, does not consume the daily first-run bonus.

### 2.8 Data shapes (new file `src/types/finder.ts`, PV-00)

```ts
import type { ClassId, SceneId } from './common';
import type { RoleId } from './v2';
import type { SpecId } from './v2';
import type { AffixId } from './mythic';

export type FinderTab = 'dungeon' | 'raid' | 'premade' | 'pvp' | 'mplus';
export type QueueDiff = 'normal' | 'heroic' | 'mythic' | 'mplus';
export type ArenaBracket = '1v1' | '2v2' | '3v3';

/** Queue key. Equal keys can match. Shards: a suffix `#2`, `#3` when a shard is full (§2.9.4). */
export type QueueKey =
  | `dun:rnd:${QueueDiff}:b${number}`        // random normal/heroic, level band b = floor(level / 8)
  | `dun:${string}:${QueueDiff}:${number}`   // specific dungeon (id), difficulty, key level (0 when not M+)
  | `arena:${ArenaBracket}:${'r' | 'u'}`;    // bracket, ranked or unranked

/** Lobby queue announcement (channel `qann`, lobby transport). Sender id comes from transport meta, never from payload. */
export interface QueueAnnounce {
  t: 'qann';
  proto: number; gameVersion: string;
  key: QueueKey;
  shard: number;                 // 1..n
  name: string;                  // sanitized, max 20
  classId: ClassId;
  level: number;                 // 1..60
  ilvl: number;                  // 0..999 (summary.itemLevel)
  roles: RoleId[];               // declared roles (dungeon queues); [] for arena
  spec?: SpecId;
  rating: number;                // arena: pvp rating of the bracket; M+: mplus rating; else 0
  dungeons?: string[];           // accepted dungeon ids (random queues), max 4
  keyLevel?: number;             // M+ only, 2..30
  since: number;                 // sender's performance.now() when it queued (receivers use their own receive time for age)
  rev: number;                   // increments on every change; older revs ignored
}
export interface QueueCancel { t: 'qcancel'; key: QueueKey; shard: number }

/** Match proposal (`qprop`, to each member). Only the proposer sends it. */
export interface MatchProposal {
  t: 'qprop';
  mid: string;                   // random 8-char id, proposer-generated
  key: QueueKey; shard: number;
  code: string;                  // game room code the proposer will host (6 chars, makeRoomCode())
  mode: 'coop' | 'pvp';
  dungeonId: string | null;      // dungeon queues
  diff: QueueDiff | null;
  keyLevel: number;
  bracket: ArenaBracket | null;  // arena queues
  ranked: boolean;
  teams: { A: string[]; B: string[] } | null;  // arena only: peer ids; dungeon: null
  members: { peerId: string; role: RoleId | null; classId: ClassId; level: number; ilvl: number; rating: number }[];
  affixes: AffixId[];
}
export interface MatchAck { t: 'qack' | 'qdecl'; mid: string; reason?: 'busy' | 'moved' | 'cancel' }

/** Listing metadata of a premade group (optional on RoomAnnouncement, §2.8 append). */
export interface FinderLfg {
  title: string;                 // <= 32 chars, sanitized
  activity: 'dungeon' | 'mythic' | 'raid' | 'arena';
  dungeonId: string | null;
  diff: QueueDiff | null;
  keyLevel: number;
  need: { tank: number; healer: number; dps: number };  // 0/1 for tank/healer, 0..3 for dps
  minIlvl: number;
}

/** Local queue state of this peer (not sent). */
export interface QueueState {
  key: QueueKey | null;
  shard: number;
  since: number;                 // local ms
  phase: 'idle' | 'searching' | 'proposed' | 'joining' | 'in_match';
  mid: string | null;
  roleFill: { tank: boolean; healer: boolean; dps: number };   // what is still missing (display only)
}

/** Arena rating and season profile, stored in CharacterSave.pvp (SAVE_VERSION bump §9 PV-00). */
export interface PvpProfile {
  season: number;                // season index = floor(mythic week / 8)
  rating: Record<ArenaBracket, number>;       // default 1500
  games: Record<ArenaBracket, number>;        // ranked games played (provisional while < 10)
  wins: Record<ArenaBracket, number>;
  fetihWeek: { week: number; earned: number };
  onurDay: { day: number; earned: number };
  firstWinDay: number;           // bounty day key of the last first-win bonus
}
```

Additions to existing types (append only, PV-00):
- `CharacterSummary` (`src/types/character.ts`): `spec?: SpecId`, `role?: RoleId`, `pvpRating?: number` (highest bracket), `mplus?: { r: number; best: { d: string; k: number; t: boolean }[]; counts: number[] }` (compact digest, ≤ 1 KB, §8.2).
- `CharacterSave`: `pvp?: PvpProfile`.
- `ItemInstance` (`src/types/items.ts`): `pvp?: true` (PvP gear, §4.5).
- `RunRecord` (`src/types/mythic.ts`): `solo?: boolean`, `source?: 'finder' | 'keystone'`.
- `RoomAnnouncement` (`src/net/messages.ts`): `lfg?: FinderLfg`.
- `DungeonParams` (`src/scenes/scenes.ts`): `arena?: ArenaParams` (§3.2).
- `TownNpcRole` (`src/types/dungeons.ts`): `'pvp'` (Savaş Ustası / Fetih Muhafızı, §4.4).

### 2.9 P2P matchmaking

#### 2.9.1 Topology

- **Queue shard = one trystero room** `efsun-q2-<queueKeyHash>-<shard>` (hash = first 8 base36 chars of a string hash of the key, to keep ids short and safe). Opened with the existing `openRoom()` (new helper `openQueueRoom(roomId)` in `src/net/index.ts`, PV-02). A queued peer is in **its shard room only** (it leaves the global lobby while queued; it still sees the queue status in the Finder).
- Queue messages use the shard's transport: `qann` (every 3 s and on change), `qcancel`, `qprop`, `qack`, `qdecl`. They are added to the `LobbyChannels` type (`qann`, `qcancel`, `qprop`, `qack`, `qdecl`), so the shard uses the same `LOBBY_CHANNELS` plumbing as the lobby. (Name the list `QUEUE_CHANNELS` and export it.)
- Lobby cost: a shard is capped at **30 peers** (`QUEUE_SHARD_CAP = 30`). Above it, peers use shard `#2`, `#3`. Shard index is chosen on join by the peer count it sees; a race that overfills a shard by 1–2 peers is acceptable.

#### 2.9.2 Entry lifecycle

| Step | Rule |
|---|---|
| Enter | Validate: in town, not in a group, `role` declared (dungeon) or bracket chosen (arena), no other queue. Join shard `k` for the key. Send `qann` immediately. |
| Refresh | `qann` every **3 s**, plus on change (roles, level, ilvl). `rev` increments on every send. |
| Presence | A queued peer is "present" to others while its `qann` is < **12 s** old (the lobby TTL, NETCODE §3.4). Entries older than 12 s are dropped locally. |
| Max queue time | **15 min**, then the queue cancels with "Kuyruk zaman aşımına uğradı. Tekrar dene." |
| Leave | `qcancel` on cancel, on entering a group, on closing the game, or on a scene change. Also on transport leave. |

#### 2.9.3 Matching (deterministic, pure function, PV-02 `src/net/queue/matcher.ts`)

Every queued peer runs the same pure function on its local view. Only the **proposer** acts on a result. The proposer is the **member of the best match with the earliest `since`** (ties: smaller `peerId` string). Non-proposers never send `qprop`; they answer.

```ts
// src/net/queue/matcher.ts  (pure: no transport, no clock, no DOM)
export interface Candidate { peerId: string; entry: QueueAnnounce; age: number /* seconds since we received its last qann */ }

export function matchDungeon(pool: Candidate[], key: QueueKey, waitSec: number): Candidate[] | null {
  // waitSec = age of the oldest candidate in the pool (how long the group has been waiting)
  const eligible = pool.filter((c) => c.age <= 12 && c.entry.key === key);
  eligible.sort((a, b) => a.entry.since - b.entry.since || (a.peerId < b.peerId ? -1 : 1));
  const T = eligible.filter((c) => c.entry.roles.includes('tank'));
  const H = eligible.filter((c) => c.entry.roles.includes('healer'));
  const D = eligible.filter((c) => c.entry.roles.includes('dps'));
  // Strict window: 1 tank, 1 healer, 3 dps (distinct peers, a peer counts once).
  // waitSec >= 60: a missing tank OR healer may be filled by a dps-only queuer ("Tanksız/Şifacısız başlıyor").
  // waitSec >= 120: partial group of >= 3 members is allowed (partySize = members, enemy scaling by DungeonParams.partySize).
  return pickGroup(eligible, { tank: 1, healer: 1, dps: 3 }, waitSec);   // tries the strict set, then relaxations
}

export function matchArena(pool: Candidate[], key: QueueKey, waitSec: number): Candidate[] | null {
  // size = 2 (1v1), 4 (2v2), 6 (3v3). Rating window = 150 + 25 * floor(waitSec / 10), capped at 600.
  // Take the oldest candidate, then the contiguous rating neighbours (in rating order) inside the window
  // until size is reached. Team split: snake draft by rating (A,B,B,A,A,B...) so |sum(A) - sum(B)| is small.
  // Returns null when fewer than size candidates are inside the window.
}
```

Rules that matter:
- Candidates are sorted by `since` (oldest first), never by rating, for dungeons.
- Arena windows use **ratings**, not `since`, except the window widens with the wait of the oldest in the group.
- A peer appears in at most one proposal at a time. A peer already in a `qprop` (phase `proposed`/`joining`) is excluded.
- Output must be identical on identical inputs (same tie-breaks), so two local views that agree produce the same match.

#### 2.9.4 Handshake and host election

```
  proposer P                      members M1..Mk (M = other members)
  -----------------------------------------------------------------
  matchDungeon() -> group G, P = earliest(G)
  mid = random8(); code = makeRoomCode()
  qprop {mid, key, shard, code, members, ...}  ---->  each M: phase 'proposed', ack timer 8 s
                                                 <----  qack {mid}   (or qdecl {mid, reason})
  all qack within 8 s?
    yes -> hostRoom({ code, mode, public: false, lfg: none }) ; P is host and group leader
           then P sends qready? -> NO extra message: members join by code
    no  -> drop the non-ackers from G (they are re-queued at their old since), re-run matchDungeon on the rest
  members: joinRoom(code) ; timeout 20 s -> "Gruba bağlanılamadı." -> re-queue
  P: all members joined (ctl hello/welcome in NetSession) -> dungeon: startReadyCheck(label) -> requestScene
                                                             arena : no ready check, auto load -> phase prep
```

Timeouts and fallbacks (all Turkish toasts, §5.4):
- **Ack timeout 8 s**, one re-match round max. A peer that declines or times out twice within 5 min gets a 2 min local cooldown (no matches proposed to it: `qdecl {reason:'busy'}` is not counted).
- **Proposer silence**: if a member does not see the proposer's `qann`/`qprop` for **6 s** after its own `qack`, it becomes proposer for the remaining members, ordered by `since`, after waiting `rank × 2 s` (staggered takeover to avoid two proposers). The takeover recomputes the proposal with a new `mid`.
- **Two proposers** (race): if a peer in phase `proposed` receives a `qprop` from a proposer whose `since` is earlier than its own proposal's, it drops its own proposal and acks. Otherwise it ignores the other proposal (it is not in it, or it is the earlier one).
- **Host fails to start**: `hostRoom()` returns `''` or rejects → proposer toasts "Grup kurulamadı. Tekrar dene." and cancels the match (members get `qcancel` with reason).
- **Joining failure** (room full, version mismatch, in progress): member toasts the reason (existing `reject` reasons, NETCODE §4.1) and re-queues.

Sequence of the game room: the proposer is the **host**. Its room starts in the town scene (queue requires the town). After all members are seated, the normal flow runs (NETCODE §4.3): dungeon → ready check → `requestScene('dungeon', params)`; arena → `requestScene('dungeon', {…, arena})` immediately (no ready check).

#### 2.9.5 Anti-abuse

- `qann` rate: a peer that sends more than 2 `qann` per second is ignored for 30 s (receiver-side). Each `qann` is sanitized (§8.2) and its `key` must be a known key format (§2.8).
- A `qprop` is accepted only from a peer that appears in the local pool for the key with the earliest `since` among the proposal's members. Otherwise dropped (prevents a random peer from forcing a group).
- The proposer's `members` list is checked against the local pool: a member not in the local pool is dropped from the proposal before sending.
- Level/ilvl/role claims are not verified (no authority, friends' trust model). The host re-checks `summary.level ≥ dungeon.levelRange[0] − 4` on `hello` (existing `minLevel` rule, NETCODE §4.1).

#### 2.9.6 What the matcher does not do

- No ETA promises. The queue bar shows elapsed time and the missing roles only.
- No skill-based dungeon matching (only role and level band). Mitik+ queues match by key ±2.

### 2.10 Finder API (for UI and tests, PV-02 `G.net.queue`)

```ts
export interface FinderApi {
  state(): QueueState;
  enter(key: QueueKey, opts: { roles?: RoleId[]; dungeons?: string[]; keyLevel?: number; rating?: number }): { ok: boolean; reason?: string };
  cancel(): void;
  onChange(cb: (s: QueueState) => void): () => void;
  /** Listing of premade groups (wraps RoomBrowser). */
  listPremade(): ListedRoom[];
  createPremade(lfg: FinderLfg, password?: string): Promise<{ ok: boolean; reason?: string }>;
}
```

Attached as `G.net.queue` (type `FinderApi`). Panels use only this surface.

---

## 3. PvP arenas

### 3.1 Modes, brackets, queues

| Mode | Players | Rated | Entry | Notes |
|---|---|---|---|---|
| Düello Pratiği | 1v1 | no | Oyuncuya Karşı → Düello Pratiği | Same map rules as ranked 1v1. Never grants Fetih. Reward: Onur only. |
| 1v1 Dereceli | 1v1 | yes | Oyuncuya Karşı | Rating bracket `1v1`. |
| 2v2 Arena | 2v2 | ranked or not | Oyuncuya Karşı | Team = 2 queued peers. Queue ranked-only in season finals? (open question Q3). |
| 3v3 Arena | 3v3 | ranked or not | Oyuncuya Karşı | Room `mode: 'pvp'`, `maxPlayers = 6`. |

- Queue keys: `arena:1v1:r`, `arena:2v2:u`, … (§2.8). Ranked and unranked do not match each other.
- Arena rooms are **not** joinable from the lobby (no `ann` listing; `lfg.activity = 'arena'` is never announced). Only the matched members know the code.
- Match maps are picked by the proposer from the bracket's map list, seeded by `mid` (same map on every peer, no sync needed): `maps[hash(mid) % maps.length]`.

### 3.2 Arena maps (ArenaDef)

Maps are small tile-grid rooms built through the existing `DungeonBuilder` (adapter in §3.2.2), so no new renderer is needed.

#### 3.2.1 Data shape (`src/types/arena.ts`, PV-00)

```ts
import type { DungeonTheme, FloorStyle, TileRect, WallStyle } from './dungeons';
import type { ArenaBracket } from './finder';

export interface ArenaDef {
  id: string;                                   // 'kirik_kemer' | 'kizil_halka' | 'buz_havuzu'
  name: string;                                 // Turkish
  brackets: ArenaBracket[];                     // which brackets may use this map
  grid: { w: number; h: number };               // tiles (TILE_SIZE = 4 m)
  floor: FloorStyle; wall: WallStyle; theme: DungeonTheme; lightColor: number;
  walls: TileRect[];                            // blocking rectangles (tiles), e.g. half-walls, cover blocks
  pillars: { pos: [number, number]; r: number }[];   // tiles; block projectile and ground-AoE line of sight
  spawns: { A: [number, number][]; B: [number, number][] };   // tile coords, 3 entries each (1v1 uses index 0)
  gates: { team: 'A' | 'B'; rect: TileRect }[];   // closed during prep, opened at prep end (§3.3)
  zones?: { kind: 'ice'; rect: TileRect }[];     // visual only (never blocked)
}

export interface ArenaParams {
  arenaId: string;
  matchId: string;                              // mid
  bracket: ArenaBracket;
  ranked: boolean;
  teams: { A: string[]; B: string[] };          // peer ids
  seed: number;
}
```

#### 3.2.2 Adapter

`arenaToDungeonDef(def: ArenaDef): DungeonDef` (PV-05, `src/data/arenas/index.ts`):
- one `RoomDef` covering the grid (`id:'arena'`, floor/wall/light from the def);
- `props`: one `PropPlacement` per pillar (`model: 'pillar'`, `collide: true`, `radius: r`) and one per wall rect (cover block);
- `packs: []`, `bosses: []`, `doors: []`, `timerSec: 300`, `forcesRequired: 0`, `levelRange: [60, 60]`, `start: spawns.A[0]`, `exit: spawns.A[0]` (unused);
- `arena` flag: new optional `DungeonDef.arena?: { ... }` is **not** added; instead the scene uses `DungeonParams.arena` (the presence of `arena` params makes the scene arena-mode).

`getDungeon(id)` (`src/data/dungeons/index.ts`) also resolves `ARENAS[id]` (adapter output), **without** adding them to `DUNGEON_IDS`, so keystone UI, portals and the M+ list never see arenas.

#### 3.2.3 Map layouts (proposed; tune in playtest)

All coordinates are tiles (4 m). Teams: **A = Kızıl (red)**, **B = Mavi (blue)**. Gates are the arena's east/west walls; spawns sit 1–2 tiles inside their gate.

**Kırık Kemer** (`kirik_kemer`, brackets 1v1, 2v2) — 12 × 12 tiles (48 × 48 m)
- Pillars r 0.6: (3,3) (9,3) (3,9) (9,9); centre pillar r 1.0 at (6,6).
- Cover walls (rects): (5,1)–(7,2) north cover; (5,10)–(7,11) south cover.
- Spawns A: (1.5,5.5) (1.5,6.5) (1.5,4.5). Spawns B: (10.5,5.5) (10.5,6.5) (10.5,7.5).
- Gates: A `{x:0,z:5,w:1,h:2}`, B `{x:11,z:5,w:1,h:2}`.

**Kızıl Halka** (`kizil_halka`, brackets 2v2, 3v3) — 16 × 16 tiles (64 × 64 m)
- Ring of four pillars r 0.8: (6,6) (10,6) (6,10) (10,10); four corner pillars r 0.5: (2,2) (14,2) (2,14) (14,14).
- Cover walls: (7,2)–(9,3) north, (7,13)–(9,14) south (both 2 tiles wide, 1 deep).
- Spawns A: (1.5,7.5) (1.5,8.5) (2.5,6.5). Spawns B: (14.5,7.5) (14.5,8.5) (13.5,6.5) — the third B spawn is the 3v3 extra.
- Gates: A `{x:0,z:6,w:1,h:4}`, B `{x:15,z:6,w:1,h:4}`.

**Buz Havuzu** (`buz_havuzu`, brackets 2v2, 3v3) — 18 × 14 tiles (72 × 56 m)
- Frozen centre: visual `ice` zone r 4 tiles at (9,7) (not blocked; movement is normal).
- Pillars r 0.6: (4,3) (14,3) (4,11) (14,11) (9,2) (9,12).
- Cover walls: (6,5)–(7,6) west cover, (11,8)–(12,9) east cover.
- Spawns A: (1.5,6.5) (1.5,7.5) (2.5,5.5). Spawns B: (16.5,6.5) (16.5,7.5) (15.5,8.5).
- Gates: A `{x:0,z:5,w:1,h:4}`, B `{x:17,z:5,w:1,h:4}`.

Line of sight: a projectile or ground AoE whose straight segment crosses a pillar circle is stopped at the pillar (victim-side test is not needed: the attacker's projectile is simulated on the attacker's machine and the impact point is reported in `phit`, so the attacker never reports a blocked hit; see §3.5.4). Melee and cone/arc skills ignore pillars.

### 3.3 Match and round rules

#### 3.3.1 States (host-authoritative, `arena` channel)

```
 [queued] -> [loading] -> [prep 30 s] -> [live, max 300 s] --round over--> [round_end 15 s] -> [prep 30 s] -> [live] ...
                                                                    |
                                                    best-of-3 decided -> [match_end] -> [result] -> town
```

- Rounds: **best of 3** (first to 2 round wins). A round is **300 s** max.
- **Prep**: 30 s. All gates closed. Players may not damage or be damaged (`invulnerable` status, GDD_LIFE §7.2 style). Players may use buffs and cast non-damaging skills. Countdown in HUD: "Kapılar {s} sn sonra açılır".
- **Gates open** when prep ends (the `arena` message `phase: 'live'`): gates' rects set non-blocking on every peer at the same host time (clock sync from NETCODE §6.4).
- **Round end** (first condition met):
  1. a team has no living players → that team loses the round;
  2. 300 s elapsed → team with more living players wins; tie → higher sum of remaining HP fraction; still tie → **round draw** (replayed, max 2 replays, third draw = match draw).
  3. a forfeit (member leaves or disconnects) → the other team wins the round and the match.
- **Between rounds** (15 s): HP and resource restored to full, statuses cleared, cooldowns reset (`arenaResetCooldowns: true`, decided: arena rounds are fresh; GDD_LIFE duels keep cooldowns), players respawn at their team's spawns. Then the next prep (30 s) runs with the gates closed, and the next live phase opens them again. Total dead time between two rounds: 45 s.
- **Match draw** (two draws or a time-out tie): no rating change, half rewards.
- Dead players stay dead until the round ends. There is no spectate mode in v1 (dead players see the arena from their own camera).

#### 3.3.2 Dampening (Yıpranma)

```ts
export const ARENA_DAMP = { startSec: 120, perMinPct: 8, capPct: 50 } as const;
export function dampenPct(liveSec: number): number {    // liveSec = seconds since gates opened this round
  if (liveSec <= ARENA_DAMP.startSec) return 0;
  return Math.min(ARENA_DAMP.capPct, ((liveSec - ARENA_DAMP.startSec) / 60) * ARENA_DAMP.perMinPct);
}
```
- Effect: **all healing received and all absorbs** of players in the arena are multiplied by `(1 − dampenPct/100)`. Damage is unaffected. HUD: icon "Yıpranma %{p}" with the value (`ARENA_DAMP` values in `combat/pvp.ts`).
- Host sends `damp` once per second during `live`; each peer applies the value it last received (no local clock drift on the value).
- Reference: at 300 s a round reaches `(300−120)/60 × 8 = 24 %`. A full heal chain (healer + potion) is out-healed by 2–3 DPS players over a 5-min round.

#### 3.3.3 Timeline example (one round, 2v2)

Clock is the **live clock** (`liveSec`), which starts when the gates open. The prep phase is a separate countdown before it.

| Clock | Event |
|---|---|
| prep 30 → 0 s | `phase: 'prep'`, round 1, gates closed, `invulnerable` on all, countdown "Kapılar {s} sn sonra açılır" |
| live +0 s | `phase: 'live'`, gates open, dampening 0 % |
| live +120 s | dampening threshold reached (still 0 %) |
| live +180 s | dampening 8 % |
| live +300 s | round time-out: team with more living players wins (tie: remaining HP sum, then round draw) |

The HUD round timer counts live time only. Dampening is 0 % for the first 120 s of live time, then +8 % per minute, capped at 50 %.

### 3.4 Rating, seasons and titles

- **Bracket rating** per `1v1`, `2v2`, `3v3`. Starts at **1500**. Stored in `save.pvp.rating` (local owner, NETCODE §5).
- **Team rating** for 2v2/3v3 = mean of the members' bracket ratings (unchanged from queue entry).
- **Elo update** (host computes, all peers apply their own):
  - `E = 1 / (1 + 10^((opp − me) / 400))`, `opp` = opposing team mean rating.
  - `K = 48` while `games < 10` (provisional), else `K = 32`.
  - `Δ = round(K × (S − E))`, with `S = 1` win, `0` loss, `0.5` draw (draws give 0 if the match is a match-draw).
  - Clamp `rating ≥ 0`. Ratings never go below 0.
- **Ranked only**: `ranked` matches change rating and grant Fetih. Unranked (`u`) matches change nothing and grant Onur only.
- **Season**: 8 weeks (`PVP_SEASON_WEEKS = 8`) on the mythic week counter (`currentWeek()`). At a season change the local profile soft-resets: `rating = round(1500 + (old − 1500) × 0.5)`, `games = 0`, `season++`. Old season best is kept in `save.pvp.season…` (archive, optional).
- **Titles** (ranked, per bracket, highest reached): **Gladyatör** ≥ 1800, **Şampiyon** ≥ 2100, **Kadim Savaşçı** ≥ 2400. Stored in `save.titles` (existing array). Title is shown on the nameplate only when chosen (existing title system).
- **Leaderboard**: no global ladder (no server). The lobby's `pvpRating` in the summary shows the rating in the room list and the queue. "Liderlik" = a list of players seen in the lobby sorted by `pvpRating` (presence-based, not global).

### 3.5 Damage authority and the `phit` / `phack` channels

This section replaces the open-world "attacker → host → victim" text of GDD_LIFE §7.5 for player-to-player damage.

#### 3.5.1 Principles

1. **Attacker computes** the raw damage (`Combat.rollOutgoing` + `pvpPower`). The attacker's numbers are the only numbers the victim receives.
2. **Victim mitigates and applies** (i-frames, parry, dodge, block, armour, resist, PvP scaling, resilience, cap). The victim is the **only** authority over its HP.
3. **Host validates and relays** (no mitigation on the host). The host can drop, not change.
4. **Attacker shows the result only from `phack`** (real number, hit marker, "BLOK" / "KAÇINDI" text). Before `phack`, the attacker shows only a cosmetic contact flash on the remote avatar (no number).

#### 3.5.2 Messages (`src/types/net.ts`, PV-00 appends)

```ts
export interface PhitMsg {                 // channel 'phit': attacker -> host (t = victim peer id) -> victim
  m: string;                               // arena match id (mid), '' for open-world hits
  seq: number;                             // attacker counter, per attacker, unique per match; victim dedupes over a 64-entry window
  sk: string;                              // skillId (for the death log and VFX)
  raw: number;                             // rolled damage BEFORE victim mitigation, >= 0
  ty: DamageType;
  crit: boolean;
  st?: StatusApply[];                      // applied only if the hit lands
  kb?: number;                             // knockback metres (victim-side applied, scaled by PVP knockbackMult)
  dir: [number, number];                   // XZ, unit length
  org: [number, number];                   // impact point XZ (projectile impact or shape origin)
  rng: number;                             // max reach (m) of the attack shape from org (victim distance check)
  aLvl: number;                            // attacker level (sanitized)
  aIlvl: number;                           // attacker real item level (not normalised)
}
export interface PhackMsg {                // channel 'phack': victim -> host (t = attacker) -> attacker
  m: string; seq: number;
  res: 'hit' | 'dodge' | 'block' | 'parry' | 'immune' | 'out_of_reach' | 'ignored';
  amt: number;                             // final damage applied (0 unless 'hit'/'block')
  crit: boolean;
  hp: number; hpMax: number;               // victim HP after the hit (authoritative)
  killed: boolean;
}
```

`NetChannels` gets `phit: PhitMsg` and `phack: PhackMsg` (append). Both are added to `KNOWN_CHANNELS` (PV-00). Neither is in `HOST_ONLY_CHANNELS` (clients originate them). Both are scene-gated like other gameplay channels.

`NetChannels.arena: ArenaMsg` (host-only origin, add to `HOST_ONLY_CHANNELS`):

```ts
export type ArenaMsg =
  | { k: 'start'; m: string; arenaId: string; bracket: ArenaBracket; ranked: boolean; teams: { A: string[]; B: string[] }; seed: number }
  | { k: 'phase'; m: string; ph: 'prep' | 'live' | 'round_end' | 'match_end'; round: number; left: number; score: [number, number] }
  | { k: 'damp'; m: string; pct: number }
  | { k: 'out'; m: string; peer: string; team: 'A' | 'B' }
  | { k: 'result'; m: string; winner: 'A' | 'B' | 'draw'; score: [number, number]; rating: Record<string, { before: number; after: number }>; rewards: Record<string, { onur: number; fetih: number }> }
  | { k: 'forfeit'; m: string; peer: string };
```

`PvpMsg` (GDD_LIFE §7.5) stays for `flag`, `duel`, `kill`, `score`. Its `hit` and `ack` variants are marked `@deprecated — use phit/phack` in the comment (not removed: append-only rule).

#### 3.5.3 Sequence (one hit)

```
attacker A                       host H (relay + validate)               victim V
--------------------------------------------------------------------------------------
swing contact on remote V
  (local flash only, no number)
  raw = rollOutgoing(...)*(1+pvpPower)
  G.net.sendTo(V, 'phit', {m, seq, raw,...}) ------> validate (§3.5.4) -----------> dedupe seq, range check
                                                     relay to V (f = A) ----------> hitLocalPlayer(IncomingHit{pvp:{aIlvl, seq}})
                                                                                    -> pvpIncoming (§3.6)
                                                                                    -> HP -= amt (owner applies)
                                                     <------- phack {res, amt, hp} <-- sendTo(A, 'phack')
  show number / BLOK / KAÇINDI + hit marker
```

Latency: one RTT for the number (100–200 ms typical). Acceptable for arena, because the flash and the sound are immediate.

#### 3.5.4 Host validation (`NetSession.onGame`, PV-02)

For `phit` from client A to victim V, the host drops the message unless **all** pass:
1. Both A and V are members of the **same** arena match (`arenaMatch.teams`) **or** the open-world rule of GDD_LIFE §7.2 holds (both flagged `pvp`/`zone`/`duel`, neither in a safe zone). Arena: state must be `live` (no damage in prep / round_end).
2. A is alive by the host's last known state and V is alive (`pdeath` state).
3. Distance: `|A.pos − V.pos| ≤ rng + 4 m` using the last `pstate` positions (4 m tolerance for latency).
4. Rate: at most **12 `phit` per second per attacker** (arena), 20 (open world, GDD_LIFE). Excess dropped; counter; `> 30` invalid in 10 s ⇒ mute that peer's PvP (GDD_LIFE §7.8).
5. Cap: `raw ≤ max(120, 60 × aIlvl) × 2.5` (`ARENA_PVP.hitCapPerIlvl = 60`, crit headroom ×2.5). Anything larger is a cheat signal (counts towards item 4).
6. `seq` is strictly increasing per attacker for the match (out-of-order duplicates are dropped by the host, the victim also dedupes).
7. Shape: all numeric fields finite, `dir` length ≈ 1 (0.9–1.1), `st` ≤ 4 entries (`StatusApply` shape checked), `sk` ≤ 48 chars.

The host never adds, subtracts or mitigates damage. A rejected hit gets no `phack` (the attacker's flash just fades; no number appears). This keeps the attacker unable to probe the host's logic.

#### 3.5.5 Victim-side checks (`hitLocalPlayer` branch for `IncomingHit.pvp`)

1. Dedupe: `seq` already seen for `fromPeer` in the last 64 ⇒ `ignored`.
2. Reach: distance from `org` to the victim's centre `> rng + 1.5 m` ⇒ `out_of_reach` (no damage, logged). Victim centre is the truth (its own position).
3. Then the normal pipeline (i-frames, parry, dodge, block) and `pvpIncoming` (§3.6). Parry and dodge are rolled on the victim's machine, which is what makes them fair.
4. The victim sends `phack` with the outcome, its HP after the hit, and `killed`. On death the victim also sends `pdeath` (existing channel) and the host sends `arena {k:'out'}` (arena) or the existing `kill` (open world).

#### 3.5.6 Anti-desync rules

- The attacker **never** reduces the victim's HP locally, and never displays the victim's HP as final before `phack`.
- `phack.hp` overrides any local guess; the nameplate HP bar uses the last `phack` or `pstate` value, whichever is newer by `seq`/time.
- A hit that arrives after the victim has died (or after the round ended) is `ignored` by the victim (`state !== 'live'`).
- Projectiles and AoE are simulated on the attacker's machine (GDD_LIFE §7.5 item 6). The victim's own check (§3.5.5 step 2) prevents a projectile hit at a position the victim is clearly not at (more than `rng + 1.5 m`).
- No lag compensation in v1 (same as GDD_LIFE). Measure hit-registration complaints in playtest before adding rewind.

### 3.6 PvP constants and mitigation

File `src/combat/pvp.ts` (combat owner, PV-01). It extends the GDD_LIFE `PVP` object with arena values, and the pure functions below.

```ts
export const ARENA_PVP = {
  damageMult: 0.34,              // arena player->player damage multiplier (open world PVP.damageMult = 0.30)
  ilvlScale: null,               // arena: none (item levels are normalised by StatCalc, §3.7)
  healDampen: true,              // healing received x (1 - dampenPct/100), §3.3.2
  maxHitFracOfMaxHp: 0.45,       // no single hit removes more than 45 % of max HP (same as PVP)
  executeCapFrac: 0.25,
  hitCapPerIlvl: 60,
  resilienceCap: 0.40,           // pvpResilience counts at most 40 %
  knockbackMult: 0.5,
  dodgeBreaksRootSlow: true,     // GDD_LIFE §7.4
} as const;

export function pvpOutgoing(raw: number, attackerPvpPower: number): number {
  return raw * (1 + Math.max(0, attackerPvpPower));   // applied once, attacker side, only when target.kind === 'player'
}
export function pvpIncoming(args: {
  mitigated: number;             // after armour, resist, damageReductionPct (existing Combat.mitigate)
  victimPvpResilience: number;   // stat 0..
  inArena: boolean;
  maxHp: number;
}): number {
  let v = args.mitigated * ARENA_PVP.damageMult;  // open world: PVP.damageMult, and the ilvl / level scales of GDD_LIFE §7.4
  v *= 1 - Math.min(ARENA_PVP.resilienceCap, Math.max(0, args.victimPvpResilience));
  v = Math.min(v, ARENA_PVP.maxHitFracOfMaxHp * args.maxHp);
  return Math.max(1, Math.round(v));
}
```

Pipeline in `hitLocalPlayer` for an incoming `pvp` hit (PV-01): i-frames → parry (the GDD_V2 §3.5 window) → dodge (existing 0.4 cap) → block (existing) → `mitigate(...)` (armour, resist, `damageReductionPct`; the existing level diff is **skipped** for PvP) → `pvpIncoming`. Statuses are applied after damage (existing order).

Crowd control vs players: GDD_LIFE §7.4 table is the source of truth and applies unchanged in the arena (DR groups: hard = stun/knockdown/freeze, fear, root, silence; slows not on DR). Summary:

| Group | Duration cap vs players | DR |
|---|---|---|
| stun | 3 s | 100 / 50 / 25 / immune (18 s window) |
| freeze | 2.5 s | same group as stun |
| knockdown | 1.2 s | same group |
| fear | 2.5 s | own group |
| root | 3 s | own group; dodge breaks root and slow |
| silence | 3 s | own group |
| slow | strongest only, floor −50 % move speed | not on DR |

`ccReductionPct` counts at most 40 % vs players (GDD_LIFE). DR state is kept per target entity by the victim's peer and by the attacker's peer for prediction only (status application comes from the victim's `pstatus` on its own machine).

Healing in the arena: heal sources are unchanged. The only arena-specific heal rule is dampening (§3.3.2). `healMult` (GDD_LIFE §7.4, 0.6 on hits in the last 8 s) is **not** used in the arena.

### 3.7 PvP-only stats and arena item-level normalisation

#### 3.7.1 `pvpPower` and `pvpResilience`

- `pvpPower` (PvP Gücü): multiplies **outgoing** damage against players (`pvpOutgoing`). Only PvP hits. Lives in `StatBlock` (existing id).
- `pvpResilience` (PvP Direnci): reduces **incoming** player damage (`pvpIncoming`, cap 40 %). Only PvP hits.
- Display names stay as in `STAT_INFO`. The tooltip subtitle reads "Esneklik" for `pvpResilience` only, to give the Turkish player a familiar word without a second stat name. (Decision recorded in §0.1 D7.)
- Sources: PvP gear (§4), PvP traits (§4.3), PvP talents (later). Not on PvE gear.

#### 3.7.2 Arena normalisation (`StatCalc`, items owner, PV-06)

- `StatCalc` gets a context flag `arena: boolean` (set by the arena scene and the duel/PvP-flag path). Outside arenas the flag is false and nothing changes.
- When `arena` is true, each **item** contribution is multiplied: **PvE items × 0.60**, **PvP items × 1.00** (`ItemInstance.pvp === true`). This includes affixes, implicit, weapon min/max (`weaponMin`, `weaponMax`) and sockets' gem bonuses.
- Class base, level, talent passives, skills, Paragon and buffs are **not** scaled. Arena power still grows with level and talent choices.
- Effect: a PvE ilvl-60 chest is worth the same as an ilvl-36 chest in an arena. A PvP ilvl-58 chest keeps 100 % of its value.

#### 3.7.3 Reason for the number

Without normalisation the best PvE gear decides arenas, and the PvP vendor line is pointless. With normalisation a fresh level 60 player with PvP gear can win against a PvE-geared player who has more items. Talents and skill use still matter most, which is the WoW intent for rated PvP.

### 3.8 Net and host flow (summary for the net owner)

| Path | Who sends | Who receives | Channel |
|---|---|---|---|
| Queue entry and presence | every queued peer | shard peers | lobby-type `qann` (shard transport) |
| Match proposal | proposer | members | `qprop` |
| Ack / decline | members | proposer | `qack` / `qdecl` |
| Cancel | any queued peer | shard peers | `qcancel` |
| Room hosting | proposer | — | `hostRoom({ code, mode, … })` |
| Hit | attacker | host → victim | `phit` (`t` = victim) |
| Hit result | victim | host → attacker | `phack` (`t` = attacker) |
| Arena state | host | all | `arena` (host-only origin) |
| Player kill / score (open world) | host | all | `pvp` (`kill`, `score`) |

`hostRoom()` changes (PV-02): accept an optional `code` (for the matched room), accept `mode: 'pvp'`, raise the cap to `MAX_ROOM_SIZE` for `pvp`, accept `lfg`. The "must be in town" rule stays for queue rooms (a match is formed in town).

---

## 4. PvP gear, currencies and vendors

### 4.1 Separation principle

- **PvP gear is not dropped**. It is bought with PvP currencies from PvP vendors. It can be upgraded with Fetih marks (§4.5).
- PvP items carry `pvp: true`. Their **PvE stats are 80 %** of a PvE item of the same ilvl (weaker in PvE), and they carry PvP stats (`pvpPower`, `pvpResilience`). In arenas PvP items count 100 %, PvE items 60 % (§3.7.2).
- A PvE item is never better than a PvP item of the same tier in an arena (by normalisation), so a player who only does PvE is still playable in arena, just weaker.

### 4.2 Currencies

| Currency | Id (`MaterialDef`) | Kind | Sources | Caps |
|---|---|---|---|---|
| **Onur** (honor) | `onur_puani` | currency (`MATERIALS`) | world PvP kills/assists/capture/duel (GDD_LIFE §7.7); **arena**: unranked win 30, unranked loss 10, ranked win 20, ranked loss 5; **daily first win** (any arena or world PvP win, first of the day): +100 | Shared daily cap **1,500** (GDD_LIFE). |
| **Fetih** (conquest) | `fetih_puani` | currency | **ranked arena only**: win 30 (+5 if the opposing team mean rating is ≥ 100 higher), loss 8. Duel practice and unranked give nothing. | Weekly cap = `min(3000, 1000 + 250 × (week_in_season − 1))`. Resets weekly. Unspent Fetih carries; the cap is on earning. |
| **Fetih mührü** | `fetih_muhru` | upgrade material | Fetih vendor (§4.4): 5 per Fetih item purchase, 1 per ranked win of the season's last 2 weeks (optional tuning) | Not capped. Used for PvP upgrades (§4.5). |

Notes:
- Fetih's cap escalation mirrors the WoW conquest weekly cap pattern (cap rises over the season). The exact numbers are ours (§10 caveat: WoW sources disagree).
- Onur is also the existing GDD_LIFE currency; no migration needed, only new earning sources.

### 4.3 PvP sets and spec traits

- **Per-class PvP set** (9 classes: Şövalye, Barbar, Büyücü, Haydut, Keşiş, Okçu, Paladin, Nekromant, Warlock). Six pieces: helm, shoulders, chest, gloves, legs, boots. Weapon and offhand are **Onur/Fetih weapons** per class (one each, no set bonus).
- Set names (Turkish): "Gladyatör Zırhı (Şövalye)", "Gladyatör Zırhı (Barbar)", … one per class. Piece names: "Gladyatör Kaskı", "Gladyatör Omuzlukları", "Gladyatör Göğüslüğü", "Gladyatör Eldivenleri", "Gladyatör Pantolonu", "Gladyatör Çizmeleri" (with the class noun for the set).
- **Set bonuses** (GDD_LIFE §7.7 numbers, applied per class set): 2 pieces: +4 % `pvpPower`. 4 pieces: +6 % `pvpResilience`. 6 pieces: **Savaş Ruhu** — killing a player heals 10 % max HP and grants 3 s `haste` (the kill is detected by the attacker's `kill` event).
- **Spec trait** (`pvpTrait` per `SpecId`, 13 entries): one PvP-only passive line per spec, active only in arenas and PvP zones, e.g. Koruyucu: "Arenada kalkan emilimi %10 artar." The 13 lines are authored in PV-05 (`src/data/pvp/traits.ts`). A trait is a stat modifier or a status modifier, never a new skill.
- Sets count only while the equipped spec matches the set's class (same rule as tier sets, `data/tierSets.ts` header).

### 4.4 Vendors and NPCs

- Vendor kinds added: `'pvp_honor'` and `'pvp_conquest'` (`VendorKind` in `systems/Vendor.ts`; `Kind` in `VendorPanel.ts`). Entries use the existing `currency` mechanism (`currency: 'onur_puani'` or `'fetih_puani'`) and `dailyLimit` (per-item weekly limit uses `shopKey` with a week key, §9 PV-06).
- **Savaş Ustası** (NPC id `npc_savas_ustasi`, role `'pvp'`, title "Savaş Ustası", Eğitim Alanı at **(−30, 30)**, next to Kaya). Mode `pvp_honor`. Stock:

| Item | Onur | Note |
|---|---:|---|
| Gladyatör Kaskı / Omuzlukları | 800 / 800 | Er tier, ilvl 52 |
| Gladyatör Eldivenleri / Çizmeleri | 700 / 700 | Er tier |
| Gladyatör Göğüslüğü / Pantolonu | 1,500 / 1,200 | Er tier |
| Gladyatör silahı (class) | 3,000 | Er tier |
| Silah parlaması (Kızıl / Mavi) | 500 | Cosmetic glow (GDD_LIFE §7.7) |
| Zafer Pelerini | 1,000 | Cosmetic cape |

- **Fetih Muhafızı** (NPC id `npc_fetih_muhafizi`, role `'pvp'`, title "Fetih Muhafızı", Eğitim Alanı at **(−34, 44)**). Mode `pvp_conquest`. Stock: the **Şampiyon** tier (ilvl 58 base, upgradeable to 62):

| Item | Fetih | Weekly limit |
|---|---:|---:|
| Şampiyon Kaskı / Omuzlukları | 150 / 150 | 1 each |
| Şampiyon Eldivenleri / Çizmeleri | 120 / 120 | 1 each |
| Şampiyon Göğüslüğü / Pantolonu | 250 / 200 | 1 each |
| Şampiyon silahı (class) | 500 | 1 |
| Fetih mührü ×5 | 60 | 4 per week |

- Vendor UI: the panel shows the currency balance in the header ("Onur: 420 · Bugün 380/1500" or "Fetih: 210 · Bu hafta 480/1750"), and a grey "Haftalık sınır doldu" line on capped entries. Buy confirm uses the existing buy flow (`vendor.buy`).

### 4.5 Upgrade path

- PvP items have an **ilvl track**: Er (52) → Şampiyon (58) → Şampiyon+ (62). Moving up uses a **PvP upgrade** at the Fetih Muhafızı (`pvpUpgrade(item)`, PV-06): cost = 2 Fetih mührü per step for Er → Şampiyon (replaces the Er piece with the Şampiyon piece of the same slot; keeps the same affixes rolled to the new ilvl) and 4 mührü for Şampiyon → Şampiyon+.
- The upgrade does not use the PvE `+N` upgrade system (`systems/Upgrade.ts`). It is a separate function with its own rules (no failure chance). PvP upgrades never break items.
- Gems and sockets carry over (same slot count rule as the item base).

### 4.6 What counts as PvP gear (rules for the code)

- `ItemInstance.pvp === true` and `setId` begins with `pvp_`, both are set by `systems/PvpGear.ts` when the item is created by a PvP vendor. Non-PvP items never have `pvp`.
- `StatCalc` reads `pvp` for the arena normalisation (§3.7.2). Tooltip shows "PvP eşyası: arenada %100, PvE'de %80 değerli".

### 4.7 Reconciliation with GDD_LIFE §7.7

| GDD_LIFE item | This doc |
|---|---|
| Gladyatör set ilvl 58, Onur | Onur items are **Er** tier, ilvl **52**; the ilvl 58 tier is **Şampiyon**, bought with **Fetih** (§0.3). |
| Set bonus 2/4/6 | Kept, applied per class set (§4.3). |
| Silah parlaması, Zafer Pelerini | Kept as cosmetic Onur items. |
| Savaş Ustası at (−30, 30) | Kept. Fetih Muhafızı added at (−34, 44). |

---

## 5. UI specs and Turkish strings

### 5.1 Global

- Panel id: `groupFinder` (new `GamePanel`, registered in `ui/panels/game/index.ts`). Key `I` opens/closes it. `Esc` closes it.
- Styles: `panels-game-finder.css` (panels-game owner). Tokens from `base.css`. Round icons use the existing icon set (`icons.json`); no new art is required for v1 (placeholder: class icons and the ref #6 shapes, round frames via CSS).
- Accessibility: keyboard reachable tabs (arrow keys), `aria-pressed` on toggles, Turkish labels on every icon button (`title` + `aria-label`).

### 5.2 Tab 1 specifics

- Role checkboxes use three icon buttons (shield, cross, sword) with a check overlay (ref #6). Lider flag is a flag icon.
- Dungeon select: `selectBox` (existing base helper). Groups: "Rastgele" first, then dungeons.
- Reward box: item tiles from the dungeon's reward table; first-run bonus line in gold.
- M+ profile (right column): score (orange), best run "+21 KR" style (dungeon abbreviation + key), counts row, best runs by dungeon list.

### 5.3 Queue bar

- Visible on all tabs when a queue is active. States: "Kuyrukta", "Grup aranıyor", "Grup bulundu! Odaya bağlanılıyor…", "Hazır mısın?" (during the ready check), "Gruba katıldın", "Yeniden kuyrukta" (after a decline).
- Missing-role chips: "Tank ✗", "Şifacı ✓", "Hasarcı 1/3" (text, not color only).

### 5.4 Turkish strings (keys in `ui/panels/game/finder/strings.ts`, PV-03)

| Key | Turkish |
|---|---|
| `finder.title` | Grup Bulucu |
| `finder.tab.dungeon` | Zindanlar ve Raidler |
| `finder.tab.pvp` | Oyuncuya Karşı |
| `finder.tab.mplus` | Mitik+ |
| `finder.nav.dungeon` | Zindan Bulucu |
| `finder.nav.raid` | Raid Bulucu |
| `finder.nav.premade` | Hazır Gruplar |
| `finder.roles` | Roller |
| `role.tank` | Tank |
| `role.healer` | Şifacı |
| `role.dps` | Hasarcı |
| `finder.leader` | Lider |
| `finder.type` | Tür |
| `finder.type.rndNormal` | Rastgele Normal |
| `finder.type.rndHeroic` | Rastgele Kahramanlık |
| `finder.difficulty` | Zorluk |
| `diff.normal` | Normal |
| `diff.heroic` | Kahramanlık |
| `diff.mythic` | Mitik |
| `diff.mplus` | Mitik+ |
| `finder.key` | Anahtar {n} |
| `finder.reward` | Ödül |
| `finder.firstBonus` | Günün ilk rastgele zindanı: ekstra ödül (günde 1) |
| `finder.firstBonus.left` | Bu ödülü bugün {n} kez daha alabilirsin. |
| `finder.btn.find` | Grup Bul |
| `finder.btn.solo` | Tek Başına Gir |
| `finder.btn.cancelQueue` | Kuyruğu İptal Et |
| `queue.searching` | Kuyrukta: {t} |
| `queue.missing.tank` | Tank ✗ |
| `queue.missing.healer` | Şifacı ✗ |
| `queue.missing.dps` | Hasarcı {n}/3 |
| `queue.found` | Grup bulundu! Odaya bağlanılıyor… |
| `queue.readyCheck` | Hazır mısın? |
| `queue.declined` | {name} katılmayı reddetti; kuyruğa geri alındın. |
| `queue.relaxTank` | Tanksız başlıyor: bir hasarcı tank yerine geçecek. |
| `queue.relaxHealer` | Şifacısız başlıyor: bir hasarcı şifacı yerine geçecek. |
| `queue.partial` | Eksik grup: {n} kişiyle başlanacak. |
| `queue.timeout` | Kuyruk zaman aşımına uğradı. Tekrar dene. |
| `queue.alreadyIn` | Zaten bir kuyruktasın. |
| `queue.needRole` | Kuyruğa girmek için bir rol seçmelisin. |
| `queue.needTown` | Kuyruğa girmek için kasabada olmalısın. |
| `queue.ackTimeout` | Eşleşme zaman aşımına uğradı. |
| `queue.joinFail` | Gruba bağlanılamadı. Tekrar kuyruğa giriliyor. |
| `raid.soon` | Yakında — Efsun Kalesi henüz açılmadı. |
| `raid.soon.desc` | Raid açıldığında buradan gireceksin. |
| `premade.title` | Hazır Gruplar |
| `premade.create` | Grup Oluştur |
| `premade.form.title` | Başlık |
| `premade.form.need` | Aranan roller |
| `premade.form.minIlvl` | Min. eşya seviyesi |
| `premade.join` | Bu gruba katıl |
| `premade.locked` | Şifreli oda |
| `premade.full` | Oda dolu. |
| `premade.empty` | Açık grup bulunamadı. Kendi grubunu kur! |
| `premade.noNeed` | Eksik rol yok |
| `pvp.duel1v1` | Düello Pratiği (1v1) |
| `pvp.arena2v2` | 2v2 Arena |
| `pvp.arena3v3` | 3v3 Arena |
| `pvp.ranked` | Dereceli |
| `pvp.unranked` | Derecesiz |
| `pvp.rating` | Puanın: {r} ({b}) |
| `pvp.season` | Sezon {n} · Hafta {k}/8 |
| `pvp.fetih` | Fetih: {x}/{cap} (bu hafta) |
| `pvp.onur` | Onur: {x} (bugün {y}/1500) |
| `pvp.dampRule` | Yıpranma: 120 sn sonra başlar, dakikada %8 iyileşme azalır. |
| `pvp.range` | Puan aralığı: {a}–{b} |
| `arena.round` | Tur {n}/3 |
| `arena.prep` | Kapılar {s} sn sonra açılır |
| `arena.damp` | Yıpranma %{p} |
| `arena.score` | Kızıl {a} — {b} Mavi |
| `arena.out` | {name} düştü |
| `arena.draw` | Tur berabere, tekrar oynanacak. |
| `arena.forfeit` | {name} maçtan ayrıldı. Maç sonlandı. |
| `arena.win` | Kazandın! |
| `arena.lose` | Kaybettin |
| `arena.matchDraw` | Maç berabere |
| `arena.rating` | Puan: {before} → {after} ({delta}) |
| `arena.rewards` | +{onur} Onur · +{fetih} Fetih |
| `hit.blocked` | BLOK |
| `hit.dodged` | KAÇINDI |
| `hit.parried` | SAVUŞTURULDU |
| `hit.immune` | DOKUNULMAZ |
| `hit.outOfReach` | MENZİL DIŞI |
| `pvp.kill` | {killer} {victim} oyuncusunu alt etti! |
| `pvp.setBonus6` | Savaş Ruhu: can yenilendi, +hızlanma |
| `vendor.onur` | Onur Satıcısı |
| `vendor.fetih` | Fetih Satıcısı |
| `vendor.weeklyFull` | Haftalık sınır doldu. |
| `vendor.balanceOnur` | Onur: {x} (bugün {y}/1500) |
| `vendor.balanceFetih` | Fetih: {x} (bu hafta {y}/{cap}) |
| `err.group.notLeader` | Yalnızca grup lideri bunu yapabilir. |
| `err.group.lowIlvl` | Eşya seviyesi yetersiz. |
| `err.group.locked` | Bu zindan henüz açık değil. |
| `err.arena.notInMatch` | Arenada değilsin. |
| `err.group.createFail` | Grup kurulamadı. Tekrar dene. |
| `err.group.joinDenied` | Oda şifresi yanlış. |
| `err.version` | Sürüm uyumsuz (lider: v{x}, sen: v{y}). |
| `err.inProgress` | Grup şu anda zindanda. Daha sonra tekrar dene. |
| `err.noHost` | Lidere bağlanılamadı. Ağ ayarların P2P bağlantıya izin vermiyor olabilir. |

### 5.5 Arena HUD (PV-08)

- **Top centre**: round pips (3 slots, filled = won), score "Kızıl 1 — 0 Mavi", round timer (live time, mm:ss), "Tur 1/3".
- **Prep**: large countdown in the centre ("Kapılar 27 sn sonra açılır"), gates drawn as red (A) and blue (B) bars.
- **Dampening**: icon with a percentage next to the player frame and on the top bar when > 0; tooltip explains the effect.
- **Team colours**: nameplates and party frames tint red (A) or blue (B) (pure colour plus the letter A/B in the frame, for colour-blind players).
- **Elimination**: a small line "{name} düştü" in the combat log and a red X on the frame.
- **Results card** (after `match_end`): title (Kazandın! / Kaybettin / Maç berabere), score, rating change with arrow, Onur and Fetih gains, buttons "Kuyruğa Tekrar Gir" and "Kasabaya Dön".

### 5.6 Feedback sounds (vfx-audio, optional)

- `ready_check` for the match-found moment and the ready check (existing sfx id).
- A short horn for "round start" (existing sfx if available, otherwise `ui_click`).

---

## 6. Additional rules for the owning modules

- **Combat**: `rollOutgoing` is not changed for enemy targets. A new branch applies `pvpOutgoing` only when `target.kind === 'player'`. `hitLocalPlayer` gets the PvP branch (§3.6). `mitigate` is reused.
- **Healing**: `combat/healing.ts` multiplies heals received by a player in the arena with `(1 − dampenPct/100)`. The dampening value comes from `G.arena?.dampenPct() ?? 0`.
- **Statuses**: `invulnerable` during prep (existing status). No new status ids in v1.
- **Events** (`core/events.ts`, append): `'finder:queue'` `{ state; key }`, `'arena:phase'` `{ ph; round; score }`, `'arena:result'` `{ winner; rating; rewards }`, `'pvp:rating'` `{ bracket; before; after }`.
- **Scenes**: `DungeonScene` with `params.arena` builds the arena through `buildDungeon(arenaToDungeonDef(def))`, skips enemy spawns (packs are empty), spawns each player at its team spawn, closes gates until prep ends. No change to the open-world path.
- **Save**: `SAVE_VERSION` 2 → 3 with `normaliseCharacterSave` filling `pvp` defaults (`rating` 1500 for every bracket, `season` = current season). Old saves load unchanged.
- **Settings**: `Settings.ts` migration for `KeyI` → inventory binding to `KeyB` (§0.3).

---

## 7. Edge cases and rules to test

| Case | Expected |
|---|---|
| I pressed during a dungeon run | Finder opens (read-only), queue buttons disabled with "Kuyruğa girmek için kasabada olmalısın." |
| Queue while the scene is loading | Refused (`needTown`). |
| Proposer closes the tab after `qprop` | Members' ack timeout → takeover after `rank × 2 s` (§2.9.4). |
| Two peers in one group are on different versions | `qprop` is sent; the joiner gets `reject:'version'`; re-queue. |
| Member declines | Proposal recomputed without them; they get a 2 min cooldown only after two declines in 5 min. |
| Arena round draw twice | Match draw (no rating, half rewards). |
| Arena host leaves | Match void: no rating, rewards are not granted, "Maç sonlandı (lider ayrıldı)". (Host loss rule, NETCODE §4.2.) |
| Non-host leaves mid-round | Forfeit: team loses the round; if it is the second round loss the match ends. |
| Attacker sends `phit` in prep | Host drops (state not live). |
| Attacker in another team sends `phit` to a teammate | Host drops (same team). |
| Victim HP 0 when `phit` arrives | `ignored`. |
| Season change during a queue | Queue continues; rating is read at `qann` time, stale ratings are refreshed on the next `qann`. |
| Dampening at 0 % in a 1v1 | Correct: 1v1 rounds end before 2 min most of the time. |
| Peer with level 1 queued for arena | Refused: arena requires level 20 (rules: GDD_LIFE 7.2 minimum flagging level, reused). |

---

## 8. Net protocol details

### 8.1 Protocol and channel list (PV-00)

- `PROTOCOL_VERSION` → **3**. `LOBBY_ROOM_ID` → `efsun-lobby-v3`, `GAME_ROOM_PREFIX` → `efsun-g3-`, queue shards `efsun-q3-…`.
- `LOBBY_CHANNELS` += `qann`, `qcancel`, `qprop`, `qack`, `qdecl` (exported as `QUEUE_CHANNELS` on the shard transport).
- `KNOWN_CHANNELS` += `phit`, `phack`, `arena`.
- `HOST_ONLY_CHANNELS` += `arena`.
- `CLIENT_RESTRICTED` (optional): `phit` requires `to` set and a numeric `seq`.
- NET constants (`messages.ts`): `QUEUE_ANN_MS: 3000`, `QUEUE_TTL_MS: 12000`, `QUEUE_SHARD_CAP: 30`, `QUEUE_ACK_TIMEOUT_MS: 8000`, `QUEUE_MAX_WAIT_MS: 900000`, `ARENA_PREP_SEC: 30`, `ARENA_ROUND_SEC: 300`, `ARENA_INTERMISSION_SEC: 15`, `PHIT_MAX_PER_SEC: 12`.

### 8.2 Sanitisers (PV-02)

- `sanitizeQueueAnnounce(x)`: `key` must match one of the three formats (§2.8) and be ≤ 64 chars; `name` via `sanitizeText`; `classId` in the known list; `level` 1–60; `ilvl` 0–999; `roles` ⊂ `{tank, healer, dps}`, max 3; `dungeons` max 4 ids; `keyLevel` 2–30 when present; `rating` 0–5000; `since` finite; `rev` int ≥ 0.
- `sanitizeMatchProposal(x)`: `members` 1–6 entries; `code` = `normalizeRoomCode`; `mid` 8 chars `[A-Za-z0-9]`; `teams` peer ids ≤ 8 total; `dungeonId` ∈ `DUNGEON_IDS` or null.
- `sanitizeArenaMsg(x)` per `k`: `m` 8 chars; `round` 1–3; `score` 0–2; `pct` 0–50; `peer` ≤ 40 chars.
- `sanitizeSummary` (extended): `spec` ∈ `SpecId` or undefined; `role` ∈ `RoleId` or undefined; `pvpRating` 0–5000; `mplus` digest (`r` 0–10000; `best` ≤ 12 entries with `d` ident, `k` 2–30, `t` bool; `counts` 5 ints 0–999). Unknown → dropped, never rejects the whole summary.

### 8.3 Host behaviour summary (PV-02)

- `phit`: §3.5.4 checks; relay with `sendTo(victim)`; counters per attacker.
- `phack`: relayed to the attacker only (`t` set by the victim; host checks it is a member of the same match).
- `arena`: only the host sends; clients ignore `arena` not from `hostId` (existing rule for host-origin channels).
- Rate limits: `qann` 2/s per peer (receiver), `phit` 12/s per attacker (host), `arena` `damp` once per second (host).

---

## 9. Implementation plan (Haiku packages)

Rules: each package is one Haiku coder, one owner module, file-disjoint from the other packages in the same wave. Waves run ≤ 3 in parallel. Every package ends with `npx tsc --noEmit` = 0 errors. Every package lists its acceptance check. No package edits docs other than its own note in the commit message.

### 9.1 Dependency graph

```
Wave 0 (serial):  PV-00 contracts (types + net whitelist + events + Input + Save)
Wave 1 (3 ∥):     PV-01 combat   |  PV-02 net   |  PV-05 content
Wave 2 (3 ∥):     PV-03 panels-game (finder UI)  |  PV-04 scenes (arena)  |  PV-06 items (PvP gear, StatCalc, Vendor)
Wave 3 (3 ∥):     PV-07 mythic (digest, finder bonus)  |  PV-08 hud (arena HUD)  |  PV-09 panels-items (vendor modes)
Wave 4 (QA):      PV-10 two-tab QA + score (Haiku browser, low CPU)
```

### 9.2 Packages

| Id | Owner | Files (new or edited) | Work | Acceptance |
|---|---|---|---|---|
| **PV-00** | core (+ net, items types) | `src/types/finder.ts` (new), `src/types/arena.ts` (new), `src/types/net.ts` (append `phit`, `phack`, `arena`, deprecate `pvp.hit`/`ack` comments), `src/net/messages.ts` (PROTOCOL 3, channel lists, NET constants, `lfg?` on RoomAnnouncement), `src/types/character.ts` (`CharacterSummary` +spec/role/pvpRating/mplus; `CharacterSave.pvp?`), `src/types/items.ts` (`pvp?: true`), `src/types/mythic.ts` (RunRecord `solo?`, `source?`), `src/scenes/scenes.ts` (`DungeonParams.arena?`), `src/types/dungeons.ts` (`TownNpcRole` += `'pvp'`), `src/core/Input.ts` (`groupFinder: ['KeyI']`, inventory `['KeyB']`), `src/core/events.ts` (4 events), `src/core/Save.ts` (SAVE_VERSION 3, defaults), `src/core/Settings.ts` (KeyI→KeyB migration) | Types and constants only, no behaviour. Freeze the `FinderApi` and `ArenaMsg` signatures for the waves. | `npx tsc --noEmit` = 0. Old save loads. Old bindings migrated (unit check by hand). |
| **PV-01** | combat | `src/combat/pvp.ts` (new: `ARENA_PVP`, `pvpOutgoing`, `pvpIncoming`, DR helper), `src/combat/Combat.ts` (outgoing PvP branch, `hitLocalPlayer` PvP branch with dedupe and reach check, `phack` builder), `src/combat/healing.ts` (dampening multiplier), `src/combat/PvpSends.ts` (new: `sendPhit`, receiver wiring helper) | Implement §3.5 (victim side), §3.6 pipeline, §3.3.2 dampening function, heal multiplier. | Unit test (pure): `dampenPct` table (0 at 120 s, 8 at 180 s, 24 at 300 s, cap 50). `pvpIncoming` monotonic in resilience; min 1 damage. |
| **PV-02** | net | `src/net/NetSession.ts` (host validation §3.5.4, `phit`/`phack` relay, `arena` host sends, `hostRoom` changes §3.8, `G.net.queue` = FinderApi), `src/net/index.ts` (`openQueueRoom(roomId)`), `src/net/queue/matcher.ts` (new, pure §2.9.3), `src/net/queue/QueueRoom.ts` (new: shard presence, `qann` sender, proposer/handshake state machine §2.9.4), `src/net/messages.ts` sanitisers (§8.2), `src/net/lobby.ts` (unchanged API; only used types) | Queue and handshake, arena hosting, validation. | Pure matcher tests: strict match, relax at 60 s, partial at 120 s, arena rating window, deterministic output. Two local tabs (`?net=local`) form a 2v2 queue and join the room. |
| **PV-03** | panels-game | `src/ui/panels/game/finder/index.ts` (new `GroupFinderPanel`, register in `panels/game/index.ts`), `finder/dungeonTab.ts`, `finder/raidTab.ts` (disabled v1), `finder/premadeTab.ts`, `finder/pvpTab.ts`, `finder/mplusTab.ts`, `finder/queueBar.ts`, `finder/strings.ts` (§5.4), `src/ui/panels/game/mplusInfo.ts` (extract `MplusProfileView`, keep J panel), `src/ui/panels/game/party.ts` (remove nothing; add "Grup Bulucu (I)" button), `src/ui/styles/panels-game-finder.css` (new) | Build the window per §2 and §5. | Opens on `I`, closes on `Esc`, all strings from `strings.ts`, `textContent` only. Phone/desktop width no horizontal scroll. |
| **PV-04** | scenes | `src/scenes/arena/ArenaController.ts` (new: round state machine §3.3, prep gates, host timers, `arena` messages, forfeit, result with Elo §3.4), `src/scenes/arena/arenaRules.ts` (new: Elo, rewards, dampening use), `src/scenes/DungeonScene.ts` (only: `params.arena` branch: skip packs, spawn at team spawns, gates from def, call controller), `src/scenes/world/params.ts` if needed | Implement arena mode in DungeonScene. | Two peers: prep 30 s, gates open, round ends on wipe, result broadcast, ratings applied locally. |
| **PV-05** | content | `src/data/arenas/index.ts` (new: `ARENAS`, `arenaToDungeonDef`, `pickArenaMap(mid, bracket)`), `src/data/arenas/kirik_kemer.ts`, `kizil_halka.ts`, `buz_havuzu.ts` (new, §3.2.3 layouts), `src/data/pvp/sets.ts` (new: 9 class sets, piece names, bonuses §4.3), `src/data/pvp/traits.ts` (new: 13 spec traits), `src/data/pvp/costs.ts` (new: vendor stock §4.4 with prices and weekly limits), `src/data/dungeons/index.ts` (`getDungeon` falls back to `ARENAS`; `DUNGEON_IDS` unchanged), `src/data/town.ts` (NPCs `npc_savas_ustasi` at (−30, 30), `npc_fetih_muhafizi` at (−34, 44), role `'pvp'`), `src/data/materials.ts` (only: `onur_puani`, `fetih_puani`, `fetih_muhru` MaterialDefs) — **coordinate with PV-06 (materials) by making PV-05 the owner of materials.ts** | Data only. | `contentCheck` passes: every arena layout has spawns in bounds, gates touch the outer wall, pillars do not overlap spawns. Every set piece id exists. |
| **PV-06** | items | `src/systems/PvpGear.ts` (new: create PvP items, `pvpUpgrade`, weekly limit keys), `src/systems/StatCalc.ts` (arena context flag, item × 0.6 / × 1.0 rule §3.7.2), `src/systems/Vendor.ts` (`VendorKind` += `pvp_honor`, `pvp_conquest`; `vendorEntries` branches; weekly keys via `shopKey`), `src/systems/Fetih.ts` (new: weekly cap and earn function; or inside PvpGear.ts) | Currency rules §4.2, vendor entries, upgrade path, StatCalc. | Buying a Şampiyon piece with Fetih reduces `fetih_puani`; weekly cap refusal text. PvE item stats unchanged outside arena. |
| **PV-07** | mythic | `src/systems/MythicPlus.ts` (finder bonus flag on run completion for queued random runs; `mplusDigest()` builds the summary digest §8.2), `src/data/mythicAffixes.ts` (only if a helper is needed) | Digest and bonus. | Digest ≤ 1 KB. First finder run per day grants one extra roll flag. |
| **PV-08** | hud | `src/ui/hud/ArenaHud.ts` (new: round pips, prep countdown, dampening, results card §5.5), `src/ui/hud/Nameplates.ts` (team colour + A/B letter, arena only), `src/ui/hud/index.ts` (register ArenaHud; no other change) | HUD per §5.5. | Visible only in arena. No overlap at 1280 × 720 and 390 px width. |
| **PV-09** | panels-items | `src/ui/panels/items/VendorPanel.ts` (`Kind` += `pvp_honor`, `pvp_conquest`; balance header; weekly-full line), `src/ui/panels/items/common.ts` (only if a helper is needed) | Vendor UI per §4.4. | Savaş Ustası and Fetih Muhafızı open the right mode; balance line correct. |
| **PV-10** | QA (no code) | none (writes a score to `docs/ROADMAP.md` score history only, by the orchestrator) | Two-tab test (`?net=local`) of: queue → match → join → arena round → result; dungeon queue to ready check; I/B keys; dampening visible at 120 s live; no console errors. Score per ROADMAP rubric (Multiplayer, UI, Stability). | Zero console errors in the flows. Bugs listed with repro. |

### 9.3 Per-wave ownership check

- Wave 1: PV-01 owns `src/combat/*`; PV-02 owns `src/net/*` and `NetSession.ts`; PV-05 owns `src/data/*` (including `materials.ts`, `town.ts`, `dungeons/index.ts`). No overlap.
- Wave 2: PV-03 owns `src/ui/panels/game/*`; PV-04 owns `src/scenes/arena/*` and the arena branch of `DungeonScene.ts`; PV-06 owns `src/systems/*` (PvpGear, StatCalc, Vendor, Fetih). No overlap.
- Wave 3: PV-07 owns `src/systems/MythicPlus.ts`; PV-08 owns `src/ui/hud/*`; PV-09 owns `src/ui/panels/items/*`. `src/ui/hud/index.ts` (PV-08) and `src/ui/panels/game/index.ts` (PV-03, wave 2) are different files. No overlap.

### 9.4 Done criteria for the whole feature

1. `I` opens the finder, `B` opens inventory, `I` no longer opens inventory (keys verified in the settings UI).
2. A random normal dungeon queue forms a 5-player group from five local tabs and reaches the ready check (or the solo path works).
3. A 2v2 unranked arena forms from four tabs, plays one round end to end (prep, live, dampening icon at live 120 s, result), and no console errors.
4. Ranked 2v2 gives Fetih and rating; the rating change matches the Elo formula within ±1.
5. Vendor sells Er tier with Onur and Şampiyon tier with Fetih; weekly limit refusal works.
6. `npx tsc --noEmit` = 0 errors after every wave.

---

## 10. Source notes and caveats

Research pass (WebSearch, 2026-10-13). Sources disagree on exact WoW numbers by expansion, so only directional facts were used. Our numbers are design choices.

- Dampening is a stacking reduction to healing received, applied after a start delay, that grows with match length; WoW Classic (MoP) sources describe a 6 %/min ramp, a 3 min start, and a 15 min maximum match length; some versions start instantly in 2v2 with healers on both teams. Source: [Warcraft Wiki – Dampening](https://warcraft.wiki.gg/wiki/Dampening); [Wowhead – max arena match 15 min, MoP Classic](https://www.wowhead.com/beta/news/maximum-arena-match-15-minutes-changes-to-dampening-mists-of-pandaria-classic-377389); [Warcraft Tavern – healing changes for arena, Dragonflight pre-expansion](https://www.warcrafttavern.com/wow/news/healing-changes-for-arena-in-dragonflight-pre-expansion-phase-2).
- Honor is earned from battlegrounds, arena and world PvP and is the entry currency for PvP gear; Conquest is earned mainly from rated PvP and has a weekly cap that rises over the season. The cap numbers in the sources conflict (guides and sellers), so the Fetih cap in §4.2 is our own schedule. Source: [Warcraft Wiki – Conquest Points](https://warcraft.wiki.gg/wiki/Conquest_Points).
- Diminishing returns (100 / 50 / 25 / immune in 18 s) is the WoW model used by GDD_LIFE §7.4; it is not re-sourced here.

Design choices that are ours, not WoW facts: Elo K values, season length 8 weeks, round 5 min, dampening start 120 s and 8 %/min, Fetih weekly schedule, arena ilvl normalisation at 60 %, the Gladyatör/Şampiyon tiers, and the queue shard model.

---

## 11. Open questions (for the user)

1. **Q1 Ranked from day one?** Proposal: yes, with 1v1 Düello Pratiği as unranked practice. Alternative: unranked for the first season.
2. **Q2 Round length.** 5 min per round with dampening from 2 min (this doc). Alternative: 4 min rounds for faster sessions.
3. **Q3 2v2 ranked and unranked both?** Proposal: both.
4. **Q4 Protocol bump.** `PROTOCOL_VERSION` 2 → 3 invalidates old clients (lobby ids change). Acceptable before any public release? (NETCODE §7 says bump on any wire change.)
5. **Q5 Solo runs count for the M+ profile?** Proposal: yes, flagged `solo`, shown in the profile with a small marker.
6. **Q6 Raid tab timing.** Keep disabled until Efsun Kalesi exists (proposal), or show the lockout view with "Yakında" from the start?
7. **Q7 Naming.** "Fetih" and "Onur" as user-chosen names are used as-is. "PvP Direnci" stays as the stat name (D7).

---

## 12. Files touched by this design (for reviewers)

Read (ground truth): `src/core/Input.ts`, `src/net/messages.ts`, `src/net/NetSession.ts` (hostRoom, joinRoom, onHello, announceInput), `src/net/lobby.ts`, `src/net/LobbyManager.ts`, `src/net/index.ts`, `src/types/net.ts`, `src/types/stats.ts`, `src/types/character.ts`, `src/types/mythic.ts`, `src/types/dungeons.ts`, `src/types/v2.ts`, `src/types/items.ts`, `src/combat/Combat.ts` (rollOutgoing, hitLocalPlayer), `src/systems/Vendor.ts`, `src/ui/panels/items/VendorPanel.ts`, `src/ui/panels/game/index.ts`, `src/ui/panels/game/mplusInfo.ts`, `src/ui/panels/game/party.ts`, `src/ui/panels/game/keystone.ts`, `src/data/dungeons/index.ts`, `src/data/mythicAffixes.ts`, `src/data/town.ts`, `src/scenes/scenes.ts`, `src/scenes/DungeonScene.ts` (header), `src/scenes/world/SafeZones.ts`, `src/entities/interactables/LobbyObelisk.ts`, `docs/NETCODE.md`, `docs/GDD_LIFE.md` §7, `docs/GDD_V2.md` §9.7, `docs/ROADMAP.md`, `docs/ref/ui/README.md`.

Written: `docs/GDD_PVP_FINDER.md` (this file). No code changed.
