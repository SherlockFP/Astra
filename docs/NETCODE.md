> **NOTE (orchestrator):** This document is the research draft. Where it conflicts with `ARCHITECTURE.md`, ARCHITECTURE.md wins:
> damage to enemies is computed on the attacker's machine and applied by the host (`hit` channel), enemy HitShapes are resolved by each
> peer for its own player, loot/XP are rolled per peer on `death`. Gameplay uses the typed logical channels in `src/types/net.ts`,
> carried in a generic `g` envelope channel. Unused draft messages are listed in ARCHITECTURE.md ("Precedence").

# EFSUN ONLINE: Netcode (P2P co-op, host-authoritative)

Status: reference design + reusable transport layer (`src/net/`). Protocol version 1.
Verified against `node_modules/trystero@0.26.0` (+ `@trystero-p2p/core@0.26.0`, `@trystero-p2p/nostr@0.26.0`) on 2026-10-13.

---

## 0. TL;DR

- **No game server.** WebRTC data channels via **trystero 0.26**. Peers find each other through public **Nostr relays**, which carry signalling only. Game data flows peer to peer, end-to-end encrypted.
- **Room browser** = one shared trystero room `efsun-lobby-v1`. Hosts announce their party every 4 s and immediately to each new lobby peer. Browsers drop entries after a 12 s TTL, on `unann`, or when the host leaves the lobby.
- **Game room** = `efsun-g1-<6-char code>` (for example `efsun-g1-K7Q2XM`), with an optional password (trystero `password`). The party is capped at 5.
- **Host-authoritative star over a physical mesh.** The host simulates enemies, AI, player-to-enemy damage, loot rolls (personal loot), and the M+ timer, forces and deaths.
- **Clients own their movement and their HP.** Movement is client-authoritative and sanity-clamped by the host. Enemy hits are resolved by the victim against its own position, per `src/types/enemies.ts` "Damage authority".
- **Network rates.** Sim 60 Hz. Snapshots go out at 20 Hz as compact binary (about 15 B per enemy, so 300 enemies is about 4.6 KB). Reliable event batches go out at 20 Hz. Clients interpolate remote entities about 100 ms in the past (adaptive 70-250 ms).
- **Host leaves = session over.** Host migration is **not supported**: everyone returns to their own town (offline transport).
- **One code path for three transports.** `TrysteroTransport` (real P2P), `LocalTransport` (BroadcastChannel, two tabs, simulated latency), and `OfflineTransport` (single player: you are the host with zero peers).

---

## 1. trystero 0.26: verified API facts

### 1.1 Packages and imports

| Import | Status in 0.26 |
|---|---|
| `import {joinRoom, selfId, getRelaySockets} from 'trystero'` | OK. `dist/index.d.mts` is `export * from "@trystero-p2p/nostr"`, so the **default strategy is Nostr**. |
| `'trystero/nostr'` | OK (same as default). |
| `'trystero/torrent' \| 'trystero/mqtt' \| 'trystero/firebase' \| 'trystero/supabase' \| 'trystero/ipfs'` | **Throw at import time**: `dist/deprecate.mjs` -> `Importing from "trystero/<x>" is deprecated. Install and import from "@trystero-p2p/<x>" instead.` Their `.d.mts` files are `export {}`. |
| `@trystero-p2p/mqtt \| torrent \| supabase \| firebase \| ipfs \| ws-relay` | Separate npm packages with the same `joinRoom` API. **Not installed.** Only `@trystero-p2p/core` and `@trystero-p2p/nostr` are in node_modules. |

Nostr defaults (`@trystero-p2p/nostr/dist/index.mjs`) are 29 built-in `wss://` relays, `defaultRedundancy = 5`. The relays used are derived from the appId. `relayConfig.urls` overrides the list.

Default ICE servers (`core/dist/peer.mjs`) are `stun:stun.l.google.com:19302`, `stun1`, `stun2` and `stun:stun.cloudflare.com:3478`. `turnConfig` is **appended** to these. `rtcConfig.iceServers` **replaces** them.

### 1.2 `joinRoom` and config (exact typings, `@trystero-p2p/core/dist/types.d.mts`)

```ts
export type JoinRoom<TConfig extends BaseRoomConfig = JoinRoomConfig> =
  (config: TConfig, roomId: string, callbacks?: JoinRoomCallbacks) => Room;

export type BaseRoomConfig = {
  appId: string;
  maxReceiveBytes?: number;
  password?: string;
  passive?: boolean;
  relayConfig?: BaseRelayConfig;
  trickleIce?: boolean;
  rtcConfig?: RTCConfiguration;
  rtcPolyfill?: typeof RTCPeerConnection;
  turnConfig?: TurnServerConfig[];
  ...
};
export type JoinRoomConfig = BaseRoomConfig & { relayConfig?: RelayConfig };
export type BaseRelayConfig = { manualReconnection?: boolean; warnOnRelayFailure?: boolean };
export type RelayConfig = BaseRelayConfig & { urls?: string[]; redundancy?: number };
export type TurnServerConfig = { urls: string | string[]; username?: string; credential?: string; credentialType?: string };

export type JoinRoomCallbacks = {
  onJoinError?: JoinErrorHandler;          // (details: {error, appId, roomId, peerId}) => void
  onPeerHandshake?: PeerHandshake;         // (peerId, send, receive, isInitiator) => Promise<void>
  handshakeTimeoutMs?: number;             // default 10000
};
```

Notes:
- The old `relayUrls` / `relayRedundancy` top-level fields are gone. Use `relayConfig: {urls, redundancy}`.
- `joinRoom()` is **idempotent per (appId, roomId)**: a second call returns the same `Room`. `TrysteroTransport` therefore refuses to open the same room twice.
- `password` encrypts SDP (AES-GCM) **and** runs a built-in challenge handshake. A mismatch calls `onJoinError` with `error: "incorrect password for overlapping room"`, which we map to `NetError.code = 'bad_password'`.
- `maxReceiveBytes` defaults to 256 MiB. We set 2 MiB because we never transfer files.

### 1.3 `Room` (exact typing)

```ts
export type Room = {
  makeAction: {
    <T extends DataPayload = DataPayload>(namespace: string, config?: MessageActionConfig<T>): MessageAction<T>;
    <T extends DataPayload = DataPayload, R extends DataPayload = DataPayload>(namespace: string, config: RequestActionConfig<T, R>): RequestAction<T, R>;
  };
  ping: (id: string) => Promise<number>;
  leave: () => Promise<void>;
  isPassive: () => boolean;
  getPeers: () => Record<string, RTCPeerConnection>;
  addStream / removeStream / addTrack / removeTrack / replaceTrack ...;
  onPeerJoin: ((peerId: string) => void) | null;
  onPeerLeave: ((peerId: string) => void) | null;
  onPeerStream: ...; onPeerTrack: ...;
};
export declare const selfId: string;      // 20 chars [0-9A-Za-z], per page load, shared by all rooms
export declare const getRelaySockets: any; // Record<url, WebSocket> (nostr)
```

- `onPeerJoin` and `onPeerLeave` are **assignable properties**, not registration functions. Assigning replaces the old handler. Per the README, "Existing active peers are immediately replayed to a newly assigned handler." `BaseTransport.onPeerJoin` mirrors this replay.
- Peers in the handshake phase are not in `getPeers()` and trigger no events or actions.
- **Shared physical peers:** connections are shared across rooms of the same appId (`SharedPeerManager`). If a browser already talks to a host in the lobby, joining that host's game room reuses the connection, so the join is near-instant.
- trystero registers a `beforeunload` cleanup that leaves rooms on tab close.

### 1.4 Actions (exact typings)

```ts
export type MessageAction<T extends DataPayload = DataPayload> = {
  send: (data: T, options?: SendOptions) => Promise<void>;
  onMessage: ((data: T, context: MessageContext) => void | Promise<void>) | null;
  onReceiveProgress: ActionProgressHandler | null;
  onReceive: ActionReceiveHandler | null;     // accept/decline by size
};
export type SendOptions = { target?: PeerTarget; metadata?: JsonValue; onProgress?: ActionProgressHandler; signal?: AbortSignal };
export type PeerTarget = string | string[] | null;     // null/undefined = all peers
export type MessageContext = { peerId: string; metadata?: JsonValue };
export type DataPayload = JsonValue | Blob | ArrayBuffer | ArrayBufferView;
```

- **The old tuple API `const [send, get, onProgress] = room.makeAction('x')` no longer exists.** `makeAction` returns an object. Set `action.onMessage = (data, {peerId}) => ...` and call `action.send(data, {target})`.
- Request/response actions also exist: `makeAction(id, {kind: 'request', onRequest})` returns `.request(data, {target, timeoutMs})` and `.requestMany`. We do not need them.
- `send()` resolves when **local** sending finishes. It does not confirm delivery.
- Action ids must be **1-32 UTF-8 bytes** with no `\0` (`action-wire.mjs`). The `@_` prefix is internal (`@_ping`, `@_pong`, `@_response`). An action id cannot be redefined with a different kind.
- Targeting a specific peer: `send(data, {target: peerId})` or `{target: [a, b]}`.

### 1.5 Payloads, size limits, channel semantics

- Every peer gets **one** `RTCDataChannel`, created with defaults (`pc.createDataChannel("data")` in `peer.mjs`), so traffic is **reliable and ordered**. There is no unreliable or unordered mode. Consequences:
  - Nothing is ever lost, so delta encoding is safe and events never need resends.
  - Under packet loss there is **head-of-line blocking**: a late snapshot delays everything behind it. We therefore keep snapshots small, drop stale snapshots (seq), and use an adaptive interpolation delay.
- Wire frames are 16384 B (`maxActionFrameBytes`). An inline action frame has a 36 B header plus metadata. Payloads of **16348 B or less** go in one frame. Larger payloads switch to offer, accept, chunk transfer (extra round trip, receiver approval, 120 s timeout). Real-time messages must stay under this size (`MAX_INLINE_PAYLOAD_BYTES`). `encodeSnapshot` truncates the priority-sorted enemy list instead of exceeding it. `BaseTransport` warns once per channel when something is bigger.
- Serialisation: strings are sent as-is, binary (`ArrayBuffer`, typed arrays, `Blob`) raw, everything else as `JSON.stringify`. In 0.26 code, **binary arrives as a `Uint8Array`** (the README says ArrayBuffer). `TrysteroTransport` normalises any binary to `Uint8Array`. JSON rules apply: `undefined` fields are dropped, `NaN` becomes `null`, `Map`/`Set`/class instances do not survive, and a typed array **inside** an object becomes `{"0":..}`. `LocalTransport` (`strictJson`) applies the same JSON round-trip so these bugs show up in local tests.
- `room.ping(peerId)` gives RTT in ms via the internal `@_ping`/`@_pong` actions. Clock offset is not included, so we add our own ping/pong in `ctl` (section 6.4).

### 1.6 Announce cadence and why the lobby is NOT passive

`strategy.mjs` and `topic-strategy.mjs` behave as follows:
- An announcement burst goes out at 233, 533, 1333 and 5333 ms. After that the steady interval is **60 s** (`defaultSteadyAnnounceIntervalMs`). The burst repeats after a peer drops.
- A new **active** peer is found within about 1-3 s, because existing peers answer its burst.
- A `passive: true` peer does not announce while dormant. It activates only when it hears another peer's announcement. Joining while all hosts are in their 60 s steady phase can mean **up to 60 s before anything shows up**. The browser would look empty, so lobby browsers join as active peers (section 3.3).

---

## 2. Architecture overview

```
            Nostr relays (signalling only: encrypted SDP offers/answers)
                 ^            ^             ^
   +-------------|------------|-------------|--------------------------+
   |   LOBBY room "efsun-lobby-v1"  (only while browsing / hosting an  |
   |   open party; full mesh between lobby members)                    |
   |     Host A --ann--> everyone      Host B --ann--> everyone        |
   |     Browser X, Browser Y  (listen, build room list)               |
   +-------------------------------------------------------------------+
                         | click "Katıl" -> leave lobby, join game room
                         v
   +-------------------------------------------------------------------+
   |   GAME room "efsun-g1-K7Q2XM"  (<= 5 peers, physical full mesh)   |
   |                                                                   |
   |          C1 <------ ctl/cmd/ps/chat ------ Host (slot 0) ------> C2 |
   |             ------> ctl/snap/evt/chat --->     ^                  |
   |                                                |                  |
   |                                                C3                 |
   |   Logical STAR: clients only ever talk to the host. Client-client |
   |   links exist (trystero builds a mesh) but are never relied upon. |
   +-------------------------------------------------------------------+
```

The local player of the host runs exactly the same client code as remote players. Messages the client side sends "to the host" are addressed to `hostId`. When `hostId === selfId` the transport loops them back on a microtask. Host broadcasts that the host's own client must also process use `includeSelf: true`. Offline mode is the same thing with zero peers.

Module split (suggested; the `net/` files that exist today are listed in section 13):

| Module | Role |
|---|---|
| `net/transport.ts`, `TrysteroTransport.ts`, `LocalTransport.ts` | Transports (done). |
| `net/messages.ts` | Wire protocol, binary codecs, sanitisers (done). |
| `net/lobby.ts` | `RoomAnnouncer`, `RoomBrowser` (done). |
| `net/sync.ts` | `ClockSync`, `InterpolationBuffer`, `HostTicker` (done). |
| `net/index.ts` | `openRoom`, `openGameRoom`, `openLobby`, `netOptionsFromUrl` (done). |
| `net/PartySession.ts` (TODO) | Handshake, party state, ready check, scene flow, host-lost handling. Owns `role: 'offline' \| 'host' \| 'client'`. |
| `net/HostSim` / `net/Replication.ts` (TODO) | Host: builds snapshots and event batches. Client: applies them and turns them into local `G.events` (see `src/core/events.ts`, section 9). |

---

## 3. Room browser without a server

### 3.1 Flow

1. **Browse** ("Oda Listesi"): `openLobby('p2p')` -> `new RoomBrowser(lobby)`, then `browser.onChange(list => render(list))`. Optionally call `refreshPings()` every 5 s for the "Gecikme" column.
2. **Host** ("Oda Kur"):
   - `code = makeRoomCode()`.
   - `game = await openGameRoom('p2p', code, password?)`. The host starts its session as host.
   - `lobby = await openLobby('p2p')` and `announcer = new RoomAnnouncer(lobby, {...})`.
   - Call `announcer.update({players, keyLevel, dungeon, inProgress})` on every change.
   - When the party is **full or a run starts**, call `announcer.stop()` and `lobby.leave()` to shrink the lobby mesh. Rejoin when back in town with free slots.
3. **Join** ("Katıl"):
   - `browser.dispose()` and `lobby.leave()`.
   - `game = await openGameRoom('p2p', room.ann.code, passwordIfAsked)`.
   - Wait for `onPeerJoin(room.hostPeerId)`, then send `HelloMsg`.
4. **Join by code** ("Kod ile Katıl"): the user types `K7Q2XM` -> `normalizeRoomCode()` -> open the game room. The client sends Hello to every peer that joins. Only the host answers `welcome`. The first Welcome wins, and `hostId` comes from it. If the lobby told us the host peer id, Hello is only sent to that peer.

### 3.2 Announcement (`RoomAnnouncement`, channel `ann`)

`{t:'ann', proto, gameVersion, roomId, code, name, hostName, hostLevel, hostClass, activity: 'town'|'dungeon'|'mythic', dungeon, keyLevel, affixes, players, maxPlayers, minLevel, hasPassword, inProgress, lang, rev}`. It is about 300 B of JSON.

- `hasPassword` only shows a lock icon. The password itself is never announced; trystero enforces it.
- `rev` increments on change. Browsers ignore older revs for the same room.
- **The sender identity is the transport's `meta.from`, never a payload field.** The browser keeps **one entry per peer**. A roomId belongs to the first peer that announced it, which prevents listing hijacks. There is a 200-entry cap.

### 3.3 Active lobby, mesh cost and scaling

Every lobby member connects to every other member, so with N members each one holds N-1 RTCPeerConnections. This is acceptable for the realistic scale of this game (tens of concurrent lobby users; Chrome allows hundreds of PCs). Mitigations built into the flow:
- Only browsing players and hosts of joinable parties are in the lobby. Players inside a game room are not.
- The lobby room is left as soon as the player joins a game or the party fills.

Scale-up options, in order of preference:
1. **Shard the lobby** by language or bracket: `efsun-lobby-v1-tr`, or a key-level bucket.
2. **Nostr pub/sub without WebRTC**: `@trystero-p2p/nostr` exports `createEvent(topic, content)` and `subscribe(subId, topic)`, which produce ephemeral kind 2xxxx events. A host could publish its announcement JSON to 3-5 relays every 4 s, and browsers would subscribe to the topic without opening any peer connection. The cost is our own relay socket management and dealing with relay rate limits.
3. **Passive browsers**, once trystero's steady announce interval is configurable (section 1.6).

### 3.4 Stale announcements

| Cause | Handling |
|---|---|
| Host closes the tab or crashes | trystero `onPeerLeave` (data channel close, or `beforeunload` leave) removes the entry immediately. Backstop: **TTL 12 s** = 3 missed 4 s announcements, swept every 1 s using the local receive time (host clocks are not trusted). |
| Party fills or a run starts | The host sends `unann` and leaves the lobby. If it stays, entries show `joinable: false` and sort to the bottom. |
| Version mismatch | Listed but `compatible: false`, greyed out: "Sürüm uyumsuz". |
| Join race (room filled meanwhile) | The host answers `reject{reason:'full'}`: "Oda dolu". |

### 3.5 UI strings (Turkish)

| Situation | Text |
|---|---|
| Lobby connecting | "Sunuculara bağlanılıyor... (3/5)" (`TrysteroTransport.getSignalStatus()`) |
| Empty list | "Şu anda açık oda yok. Kendi odanı kur!" |
| Columns | "Oda", "Lider", "Zindan", "Anahtar", "Oyuncular", "Gecikme" |
| Password prompt | "Bu oda şifreli. Şifreyi gir:" |
| Wrong password | "Şifre yanlış." |
| Room full | "Oda dolu." |
| Version | "Sürüm uyumsuz (lider: v{x}, sen: v{y})." |
| Run in progress | "Grup şu anda zindanda. Daha sonra tekrar dene." |
| Join timeout | "Lidere bağlanılamadı. Ağ ayarların P2P bağlantıya izin vermiyor olabilir." |

---

## 4. Session lifecycle

```
 [Offline/Town] --Oda Kur--> [Host:Town] <------------------------------------+
       |                         |  peer joins -> Hello -> Welcome/Reject      |
       |--Katıl/Kod--> [Client:Joining] --Welcome--> [Client:Town]             |
       |                         |                                             |
       |                  leader picks key -> ReadyCheck (30 s)                |
       |                         |  all ready? no -> ReadyResult{ok:false}     |
       |                         v yes                                         |
       |                  SceneLoad{dungeonId, seed, keyLevel, affixes, spawns}|
       |                         |  every member: build dungeon -> SceneLoaded{genHash}
       |                         |  (45 s timeout -> laggard returns to town / kicked)
       |                         v                                             |
       |                  RunStart{startHostMs = now + 10 s}  "Anahtar başlıyor: 10"
       |                         v                                             |
       |                  [Running]  snap 20 Hz, evt 20 Hz, ps 20 Hz, cmd       |
       |                         |  last boss dead + forces >= 100 %           |
       |                         v                                             |
       |                  RunEnd{record} (+ keyResult to key owner)            |
       |                         |  ReturnToTown -> SceneLoad{town} -----------+
       |
       +<-- host left / kicked / reject : leave room -> OfflineTransport town
```

### 4.1 Join handshake

1. The client opens the game room and waits for the host peer. It sends `HelloMsg {proto, gameVersion, character: NetCharacter}` to it.
2. The host validates:
   - `proto` and `gameVersion` must be equal, otherwise `reject:'version'`.
   - The party must have fewer than 5 members, otherwise `'full'`.
   - No run may be in progress, otherwise `'in_progress'`.
   - The peer must not have been kicked this session, otherwise `'kicked'`.
   - `minLevel` must be met, otherwise `'level'`.
   - `sanitizeCharacter()` must succeed, otherwise `'bad_data'`.
3. On success the host assigns the lowest free slot (host = 0; `entityId = PARTY_ID_BASE + slot`) and replies `WelcomeMsg {hostId, slot, entityId, party, scene, hostMs}`. It broadcasts `PartyStateMsg` (rev+1) to all and a `notice: player_joined`.
4. Client timeout: no Welcome within `NET.HELLO_TIMEOUT_MS` (10 s) -> leave and show "Lidere bağlanılamadı".
5. The client then starts `ping` every 2 s (ClockSync). If `welcome.scene` is set it loads that scene first.

Messages from peers that have not completed the handshake are ignored by the host, except `hello`. Messages on `ctl`/`snap`/`evt` from anyone other than `hostId` are ignored by clients.

### 4.2 Leaving, host loss, no migration

| Event | Behaviour |
|---|---|
| Client leaves gracefully | It sends `bye`, then `transport.leave()`. The host frees the slot, despawns the player entity, sends `party` and `notice: player_left`, and re-announces in the lobby with the new count. In a run, the M+ run continues. |
| Client drops (no bye) | trystero `onPeerLeave` -> same handling. The host keeps the slot reserved for 60 s during a run (`PLAYER_FLAG.DISCONNECTED`, entity frozen). It can rejoin with the same `charId` (resync). |
| **Host leaves or drops** | Each client gets `onPeerLeave(hostId)`. The client shows "Lider oyundan ayrıldı. Kasabaya dönülüyor...", leaves the game room, switches to `OfflineTransport` and loads its own town. Items already picked up are in the client's own save, so nothing is lost. The run is abandoned: the key is not depleted for the key owner (it never got a `keyResult`). |
| Kicked | `kick{reason}` -> client leaves: "Gruptan çıkarıldın." The host blocks that peer id for the session. |

Host migration is out of scope. All the authoritative world state (AI, M+ timer, loot RNG) lives on the host, and transferring it mid-combat is not worth the complexity for a 5-player co-op game.

### 4.3 Ready check and keystone

- The leader (the host) selects any member's keystone. Clients advertise theirs in `NetCharacter.keystone`. `PartyStateMsg.selectedKey = {owner, key}`.
- `ReadyCheckMsg {id, dungeonId, keyLevel, affixes, timeoutMs: 30000}` -> each client shows "Hazır mısın?" and answers `ready{id, ready}`. Then `readyResult{id, ok, notReady[]}`. Not ready or timed out = `ok: false`, with a toast: "{name} hazır değil."
- Weekly affixes are computed from the ISO week number by every peer. The host's `weeklyAffixes` is authoritative (it avoids disagreement around week rollover).

### 4.4 Implemented additions (integration pass)

- **Labelled ready check** (GDD 5.13 key-selection confirm): `G.net.startReadyCheck(label?)`. The label ("Gölge Tapınağı +4 anahtarı") travels in the `readyCheck` ctl message, lands in `G.net.readyCheck.label` on every peer and in the "Hazır mısın? ..." toast. Everybody answers with `G.net.setReady(true)`; the host watches `party:readyCheck {active:false}` + `G.net.readyCheck.result.ok` and then moves the party (`requestScene`).
- **Client -> host requests** (channel `req`, `NetChannels['req']`): `G.net.sendRequest(kind, data?)` / `G.net.onRequest(kind, (data, fromPeerId) => ...)`. On the host / offline the handlers run locally (same code path), a client's request goes to the host ONLY (never relayed, whatever target it sets; clients ignore the channel). `kind` is an identifier (<= 48), `data` a plain object (<= ~2 KB, validate every field you read). Scene-gated like every other gameplay channel (buffered while loading, stale scene sequences dropped). Example: a guest standing at the Lanetli Sandık calls `G.net.sendRequest('chest:start', { id })`; the host's DungeonScene registered `G.net.onRequest('chest:start', ...)`.
- `cast.end` / `cast.sp` / `cast.fx` / `cast.r` and `dmg.dot` (combat additions) need no wire support: non-`pstate`/`snap` payloads pass through the generic envelope untouched.
- **Hidden tab** (6.8): implemented with `Engine.setBackgroundTick(true)` (a 20 Hz main-thread timer while `document.hidden`), enabled for the host on `hostRoom()` AND for clients on join, disabled in `teardown()`. Pages with an open WebRTC connection are exempt from the browser's background timer throttling; a Worker timer (6.8) would be the stronger variant but lives in core's Engine.

---

## 5. Authority model

| State | Authority | Notes |
|---|---|---|
| Own movement (pos, vel, yaw, anim) | **Owner client** | Host clamps speed and walls and may send `correct` (section 6.3). |
| Own HP / resource / death | **Owner client** | Victim-resolved enemy hits, owner-applied heals. Reported in `ps` (fractions), `hit`, `died`. |
| Own inventory, gold, XP, level, talents, keystone, rating | **Owner client** (local save) | The host only *grants* loot, XP and key results. Cheating only affects your own save (co-op). |
| Combat stats | Owner computes (StatCalc) | Host clamps with `statCaps(level)` (`sanitizeCharacter`). |
| Enemies (spawn, AI, position, HP, casts, death) | **Host** | |
| Player -> enemy damage, crits, procs, threat | **Host** | Uses the attacker's sanitized stats plus host RNG. |
| Enemy -> player attack timing and shape | **Host** decides, **victim** resolves | `atk`/`proj` events with resolve time. |
| Loot rolls (personal), gold, XP grants | **Host** | Per eligible player. Sent only to the owner. |
| M+ timer, forces, deaths, boss kills, completion, upgrade, score | **Host** | `run` events plus the snapshot timer. |
| Dungeon layout | Deterministic: `DungeonDef` + seed | `genHash` in `loaded` detects desync. |
| Doors, chests, shrines, objects | **Host** | `interact` -> `obj` event. |

Security stance: this is co-op, so we prevent accidental desync and griefing of *other* players (fake kills, fake loot for others, crashes from bad payloads) and accept that a player can cheat their own character. Every inbound payload is validated (section 10).

---

## 6. Simulation and replication

### 6.1 Rates and budgets

| Stream | Rate | Size | Down per client | Host up (4 clients) |
|---|---|---|---|---|
| `snap` (binary) | 20 Hz | 14 B/player + 15 B/enemy + 12-16 B header. 100 relevant enemies = about 1.6 KB | ~32 KB/s | ~128 KB/s |
| `evt` (JSON batch) | 20 Hz | 0.2-2 KB (horde damage numbers) | ~10-40 KB/s | ~40-160 KB/s |
| `ps` (binary, C->H) | 20 Hz | 32 B | - | 0.6 KB/s up per client |
| `cmd`, `ctl`, `chat` | on demand | small | - | - |

Worst case (300 enemies in relevance, heavy AoE) is about 4.6 KB snapshots plus about 3 KB events, which is about 150 KB/s per client and about 0.6 MB/s (about 5 Mbit/s) host upload. That is acceptable for home broadband. If host upload becomes a problem, the next optimisation is **delta snapshots** (safe because the channel is reliable): send only changed fields against the previous snapshot to that client.

Host sim runs at fixed 60 Hz (`NET.SIM_HZ`). Enemy AI "think" runs at 10 Hz, staggered across ticks; movement integrates every tick. Every 3rd tick the host flushes `evt` (per client) and then `snap` (per client, same `seq`). Ordering on the single reliable channel guarantees that events for tick N arrive before snapshot N.

### 6.2 Snapshot (`encodeSnapshot` / `decodeSnapshot`, `messages.ts`)

```
u8 'S' | u8 fmt=1 | u16 flags(bit0 run timer) | u32 seq | u32 hostMs | [u32 runElapsedMs]
u8 playerCount   x { u8 slot, i16 x,y,z (1/32 unit), u8 yaw, u16 hp, u16 res, u8 anim, u8 flags }   14 B
u16 enemyCount   x { u32 id, i16 x,y,z, u8 yaw, u16 hp, u8 anim, u8 flags [, u8 castIdx, u8 castProg] } 15(+2) B
```

- **Positions**: i16 at 1/32 unit gives about 3 cm precision and a range of ±1024 units (dungeon tiles are 4 units). **Yaw**: u8 (1.4° steps, which suits the PSX look). **HP**: u16 fraction (exact numbers arrive through `dmg` events).
- **Anim byte** = state (6 bits, `NET_ANIM`) plus a 2-bit restart counter. A counter change restarts the clip even when the state is the same, for example an enemy attacking twice.
- **Ids are u32** because of the shared id ranges (`src/types/common.ts`): players 1-15, dungeon enemies 100-49,999 (deterministic from `DungeonDef`, so **no spawn event is needed**), host-dynamic 50,000-899,999 (need a `spawn` event), local-only 1,000,000+ (never on the wire).
- **Per-client relevance**: each client's snapshot contains the enemies within `NET.RELEVANCE_RADIUS` (48 units) of *that* client's player, plus every enemy in combat with that player, sorted nearest first. The encoder caps at 16348 B. Out-of-relevance enemies keep their last state on the client, which is invisible behind PSX fog.
- **Stale handling**: the client drops snapshots with `seq <= lastSeq`. An unknown entity id in a snapshot (a host-dynamic id with no spawn seen) is ignored, and after 3 occurrences the client sends `resync`.
- The run timer sits in every snapshot header (`runElapsedMs`, death penalties included), so the timer never drifts even if a `run` event is delayed.

### 6.3 Player movement (client-authoritative)

- The owner simulates its own character every frame with zero latency. At 20 Hz it sends `ps` (`encodePlayerState`, 32 B): `epoch, seq, clientMs, pos (f32), vel, yaw, anim, flags, hp, res`.
- Host sanity checks, run when each `ps` arrives:
  - Speed: `dist(prev, new) <= stats.moveSpeed * SPEED_TOLERANCE * dt + grantedDash`. A dash or leap skill validated by the host grants its distance for its duration.
  - Optional nav check: is the destination cell walkable?
  - A position change of more than 3 units without a grant is a teleport.
- On violation: `correct {pos, yaw, epoch: prevEpoch+1, reason}` is sent to that player only. The client snaps, sets `epoch`, and resumes. The host ignores `ps` with a different epoch, which avoids rubber-banding from in-flight packets. Scene loads and portals also bump the epoch (`reason: 'scene' | 'teleport'`).
- The host keeps a 250 ms history of each player position. It feeds enemy AI targeting and the snapshot players array (relayed to the other clients). Remote players are seen roughly RTT/2 + up to 50 ms + RTT/2 + interp delay behind (typically 150-250 ms). This is fine for co-op.

### 6.4 Clock sync and interpolation (`sync.ts`)

- **ClockSync**: the client sends `ping{n, t0}` every 2 s and the host answers `pong{n, t0, hostMs}`.
  - offset = `hostMs + rtt/2 - now`, taken from the lowest-RTT sample of the last 8.
  - Small corrections are slewed by 25%.
  - It also exposes `rttMs` (median) and `jitterMs`.
  - Host clock = `performance.now()` as u32 (`hostNowMs()`).
- **InterpolationBuffer** (one per remote entity): `push(snapshot.hostMs, pos, yaw)`. Each frame, `sample(clock.hostNow() - interpDelay, out)` lerps between the bracketing samples (shortest-arc yaw). It extrapolates up to 150 ms past the newest sample and then holds (`mode: 'interp' | 'extrap' | 'hold'`).
- `interpDelay = adaptiveInterpDelay(clock.jitterMs)` = clamp(2 × 50 ms + 2 × jitter, 70, 250). The default is 100 ms.
- Event timing: events carry host times (`resolveHostMs`, `hostMs`). Convert with `clock.toLocal()`. Effects tied to entities (cast bars, hit flashes) should be shown at `eventHostMs + interpDelay` so they line up with the interpolated entity. Juice for **your own** actions is immediate (section 6.5).

### 6.5 Combat flow

**Player -> enemy (host-resolved, with cosmetic prediction for juice):**
1. The client presses a skill. It checks the local cooldown and resource and immediately plays the animation, swing VFX and sound.
2. It runs a **local predicted hit test** against the interpolated enemies. On contact it plays the hit spark, a small hit-stop (40-60 ms) and a light camera shake right away (`G.events.emit('hitstop')`). This is cosmetic and is what makes melee feel crunchy at 100 ms RTT.
3. It sends `cast {seq, skillId, origin, dir, point, target, clientMs, hint: [ids it hit locally]}`.
4. The host validates (cooldown with 100 ms tolerance, resource, range, alive, not silenced or stunned). It **rewinds** enemies by `min(RTT/2 + interpDelay, LAG_COMP_MAX_MS = 200 ms)` using a 250 ms position history, then resolves the shape. `hint` ids that fail by less than 0.5 units are accepted (generous for co-op). It rolls damage and crits from the attacker's sanitized StatBlock with host RNG.
5. The host emits `dmg {src, tgt, amount, type, f, skillId}` to everyone. The caster's client shows the real **damage numbers** about 1 RTT after the swing; big crits add an extra shake. Other clients also get a `cast` event so they can play the caster's animation and VFX. The caster itself does not, because it already predicted.
6. On rejection: `castFail {seq, reason}` goes to the caster only, which refunds the cooldown display and shows the reason toast ("Bekleme süresinde", "Yetersiz mana", ...).

**Enemy -> player (host decides, victim resolves):**
1. Host AI picks an `EnemyAbility` and emits `atk {hitId, src, abilityId, shape, origin, dir, resolveHostMs = now + windup, telegraph, damage (pre-mitigation, key-level scaled, Fortified/Tyrannical applied), type, statuses}`. Snapshots also flag the enemy `CASTING` with `castIdx` and progress for cast bars.
2. Every client shows the telegraph and anim. At `clock.toLocal(resolveHostMs)` it tests **its own** player against the shape, using its own current position, so a dodge on your screen is a dodge.
3. On a hit, the client:
   - applies dodge, block, armor and resist itself;
   - updates its own HP;
   - applies the statuses;
   - plays the hurt feedback;
   - sends `hit {srcKind: 'attack', srcId: hitId, src, amount, type, f, hpAfter}`.
4. The host relays this as a `dmg` event to the others (damage number on that player, party frame). It feeds threat and the death recap. On 0 HP the client sends `died {killer, pos}`. The host broadcasts `death`, increments M+ deaths and applies the +5 s penalty.
5. **Projectiles** (`proj`): deterministic flights (pos, dir, speed, range, radius, hostMs). Every client simulates them. Hostile ones are tested by each victim against its own player (`hit {srcKind: 'proj'}`). Player projectiles are resolved by the host against enemies (`projEnd` when one hits early).
6. **Hazards** (Volcanic, Sanguine pools, boss puddles): host-dynamic entities (`spawn` with `ttlMs`). Damage ticks are victim-resolved (`hit {srcKind: 'hazard'}`).

**Heals and buffs on players**: resolved by the host (`heal`, `status`). The **owner applies** them to its own HP and status list.

### 6.6 Loot (personal loot)

- On enemy death the host rolls loot **separately for each eligible player**, meaning players in range or on the damage list. It uses `ItemGen` with the host RNG, that player's level and magic find, and the key level.
- Each drop gets a host `dropId`. The host sends `loot {dropId, pos, from, item: ItemInstance | null, gold}` **only to the owner**. The client creates a local-only entity (id 1,000,000+) that explodes out of `from` with a rarity light beam (`RARITY_COLORS`). Nobody else ever sees your drop, so there is no ninja looting.
- Pickup: the client sends `pickup {dropId}`. The host checks ownership, distance (pickupRadius + 1.5) and that the drop exists, then replies `lootGot {dropId, ok}`. On `ok` the client adds the item or gold to **its own save**. Unpicked drops expire after 5 min (`lootGone`). The end-of-dungeon chest works the same way: one roll per player.
- XP: `xp {amount}` to each eligible player. The owner applies xpPct.

### 6.7 Mythic+ sync

- The host owns `RunState` (`src/types/mythic.ts`) and sends `run {state}` on every discrete change: start, forces gained, death, boss killed, completion. The ticking timer comes from the snapshot header `runElapsedMs`.
- Countdown: `start {startHostMs}`. The client shows "{n}" using `clock.toLocal(startHostMs)`. Doors open at 0.
- Completion: when the last boss is dead and forces are at 100% or more, the host computes `upgradeLevels` (+1/+2/+3 by time) and the score. It sends `end {record: RunRecord, keyOwner, vaultEligible}` to all. Each client merges the record into its own `MythicProfile` (rating, best per affix, weekly vault runs).
- The key owner additionally gets `keyResult {keystone: KeystoneData, upgrade}`, the new keystone (level ± and new dungeon), and stores it.
- Depletion: if the timer runs out the run continues ("Süre doldu"), and completing it gives `upgrade 0` (key -1). Abandoning (host left, or "Anahtarı bırak") gives no keyResult.
- Affixes that touch enemies (Bolstering, Raging, Sanguine, Bursting, ...) are host simulation. Their player-facing effects arrive as `status` / `atk` / hazard `spawn` events.

### 6.8 Host tab hidden

When the host's tab is hidden, `requestAnimationFrame` stops and main-thread timers are throttled (1 Hz, or 1/min after 5 min). The world would freeze for the whole party. **`HostTicker`** (`sync.ts`) drives the fixed-step host simulation from a **dedicated Worker timer**, which keeps posting messages while the tab is hidden. It falls back to `setInterval` under strict CSP. Rendering can stay on rAF. When the host goes hidden, also send `notice: host_tab_hidden` ("Lider oyunu arka plana aldı") so the party understands any hitching. To verify: hide the host tab for 2 min and watch a client's enemy movement.

---

## 7. Message catalogue (`src/net/messages.ts`)

Channels: `ctl`, `cmd`, `ps`, `snap`, `evt`, `chat` (`GAME_CHANNELS`) and `ann`, `unann` (`LOBBY_CHANNELS`). JSON messages are discriminated by `t`, events by `e`.

### `ctl`: session control

| Tag | Interface | Dir | When |
|---|---|---|---|
| `hello` | `HelloMsg {proto, gameVersion, character: NetCharacter}` | C->H | Host peer joined |
| `welcome` | `WelcomeMsg {hostId, slot, entityId, party, scene, hostMs}` | H->C | Accepted |
| `reject` | `RejectMsg {reason: version\|full\|in_progress\|kicked\|bad_data\|level, detail?}` | H->C | Refused |
| `party` | `PartyStateMsg {rev, hostId, roomName, code, members: PartyMember[], selectedKey, weeklyAffixes}` | H->all | Any party change |
| `char` | `CharacterUpdateMsg {character}` | C->H | Level up, gear, keystone change |
| `readyCheck` | `ReadyCheckMsg {id, dungeonId, keyLevel, affixes, timeoutMs}` | H->all | Leader starts |
| `ready` | `ReadyReplyMsg {id, ready}` | C->H | Answer |
| `readyResult` | `ReadyResultMsg {id, ok, notReady}` | H->all | All answered / timeout |
| `scene` | `SceneLoadMsg {sceneSeq, kind, dungeonId, difficulty, seed, keyLevel, affixes, spawns}` | H->all | Enter dungeon / town |
| `loaded` | `SceneLoadedMsg {sceneSeq, genHash}` | C->H | Scene built |
| `start` | `RunStartMsg {sceneSeq, startHostMs}` | H->all | Everyone loaded |
| `end` | `RunEndMsg {sceneSeq, record: RunRecord, keyOwner, vaultEligible}` | H->all | Run finished |
| `town` | `ReturnToTownMsg {reason}` | H->all | Back to town |
| `kick` | `KickMsg {reason}` | H->C | Leader kicks |
| `bye` | `ByeMsg` | C->H | Graceful leave |
| `ping` / `pong` | `PingMsg {n, t0}` / `PongMsg {n, t0, hostMs}` | C->H / H->C | Every 2 s |
| `resync` | `ResyncRequestMsg {sceneSeq, reason}` | C->H | Unknown entity / gen mismatch / tab resumed |
| `notice` | `NoticeMsg {code, args}` | H->all | Toasts |

### `cmd`: commands (client -> host)

| Tag | Interface |
|---|---|
| `cast` | `CastCmd {seq, skillId, origin, dir, point, target, clientMs, hint?}` |
| `cancel` | `CastCancelCmd {seq}` |
| `pickup` | `PickupCmd {dropId}` |
| `interact` | `InteractCmd {objId, kind}` |
| `hit` | `HitReportCmd {srcKind: attack\|proj\|hazard, srcId, src, amount, type, f, hpAfter}` |
| `died` | `DiedCmd {killer, pos}` |
| `use` | `UseItemCmd {item}` |
| `revive` / `respawn` / `emote` | `ReviveCmd {targetSlot}` / `RespawnCmd` / `EmoteCmd {id}` |

### `ps` / `snap`: binary

`PlayerStateData` (32 B) and `SnapshotData` (section 6.2). Codecs: `encodePlayerState`, `decodePlayerState`, `encodeSnapshot`, `decodeSnapshot`. The decoders return `null` on malformed input and never throw.

### `evt`: `EventBatchMsg {sceneSeq, seq, hostMs, ev: GameEvent[]}`

| `e` | Interface | Audience |
|---|---|---|
| `spawn` / `despawn` | host-dynamic entity created / removed | all |
| `dmg` / `heal` | `DamageEvent {src, tgt, amount, type, f: DMG_FLAG, skillId?, overkill?}` / `HealEvent` | all |
| `death` / `revive` | entity died / revived | all |
| `cast` / `castEnd` | other player or enemy cast start / end (cast bars, anims) | all except caster |
| `castFail` | your cast was rejected | owner |
| `atk` | `EnemyAttackEvent {hitId, src, abilityId, shape: HitShape, origin, dir, resolveHostMs, telegraph, damage, type, statuses?}` | all |
| `proj` / `projEnd` | deterministic projectile | all |
| `status` / `statusEnd` | buff/debuff on any entity | all |
| `vfx` | cosmetic effect | all |
| `loot` / `lootGot` / `lootGone` | personal loot | owner |
| `xp` | experience | owner |
| `correct` | position correction + new epoch | owner |
| `run` | `RunState` | all |
| `keyResult` | new keystone | key owner |
| `obj` | door / chest state | all |
| `announce` | banner / boss yell key | all |

`PERSONAL_EVENT_TAGS` lists the owner-only tags. The host builds **one batch per client per tick** (broadcast events plus that client's personal events) and sends it with `{to: peerId}`. The host's own batch is looped back with `to: selfId`.

### `chat`

`ChatMsg {t:'chat', text, from?, name?, ts?, system?}`. The client sends `{t, text}` to the host. The host sanitises (`sanitizeText`, 200 chars, rate limit 8 messages per 10 s), fills in `from`, `name` and `ts`, and relays with `includeSelf`.

### Lobby

`RoomAnnouncement` (section 3.2) and `RoomUnannounceMsg {roomId}`.

---

## 8. Transport abstraction (`src/net/transport.ts`)

```ts
export interface NetTransport<M extends ChannelMap> {
  readonly kind: 'trystero' | 'local' | 'offline';
  readonly selfId: PeerId;
  readonly roomId: string;
  readonly state: 'connecting' | 'open' | 'closed';
  getPeers(): PeerId[];
  hasPeer(peer: PeerId): boolean;
  send<K extends ChannelKey<M>>(channel: K, data: M[K], opts?: { to?: PeerId | readonly PeerId[]; includeSelf?: boolean }): void;
  on<K extends ChannelKey<M>>(channel: K, handler: (data: M[K], meta: MessageMeta) => void): Unsubscribe;
  onPeerJoin(h: (peer: PeerId) => void): Unsubscribe;   // replays current peers to new handlers
  onPeerLeave(h: (peer: PeerId) => void): Unsubscribe;
  onError(h: (e: NetError) => void): Unsubscribe;      // bad_password, join_failed, send_failed, payload_too_large, bad_payload
  ping(peer: PeerId): Promise<number>;
  getStats(): NetStats;                                 // msgs/bytes per channel (debug overlay)
  leave(): Promise<void>;
}
```

Contract (all implementations):
- A channel map is typed per room: `GameChannels` and `LobbyChannels`. Payloads are JSON-safe plain data or `Uint8Array`.
- Delivery is reliable and ordered per sender. `meta.from` is set by the transport. Handlers are wrapped in try/catch.
- `send` with no `to` goes to all remote peers. `includeSelf` or `to` containing `selfId` means **loopback** on a microtask, with a `structuredClone`d payload (the same semantics as remote). Unknown target ids are skipped.
- `BaseTransport` provides registries, loopback, stats and the oversize warning. Implementations only provide `sendRemote`, `ping` and `leave`.

### 8.1 `TrysteroTransport`

- `new TrysteroTransport<GameChannels>({appId, roomId, password?, channels, relayUrls?, relayRedundancy?, turnServers?, rtcConfig?, maxReceiveBytes = 2 MiB, passive?, quietRelayWarnings = true, handshakeTimeoutMs = 15000})`.
- One trystero action per channel, registered eagerly from `channels` before any peer connects, otherwise early messages would be dropped. `onJoinError` maps to `NetError`.
- `getSignalStatus()` reports `{open, total}` relay sockets for the "connecting" UI.
- Loaded lazily (`openRoom` uses a dynamic import), so trystero and its Nostr crypto (about 170 KB unminified) stay out of the main bundle.
- **TURN**: without TURN, peers behind symmetric NAT or strict corporate networks fail with `join_failed` ("WebRTC could not connect"). Add a `turnServers` setting later. Cloudflare TURN has a free tier; Open Relay is another option.

### 8.2 `LocalTransport` (offline multiplayer testing)

- Uses a `BroadcastChannel('efsun-local/<appId>/<roomId>')`. Presence works through `hi` -> `here`, a 1 s `hb` heartbeat, a 6 s timeout, and `bye` on leave or `pagehide`. A peer heard via heartbeat without a hello is adopted.
- A password fingerprint keeps rooms with different passwords apart.
- **Simulated latency and jitter** (`latencyMs`, `jitterMs`) go through a per-sender FIFO drained by one timer, so ordering is exact like a reliable channel.
- `strictJson` (default on) JSON round-trips payloads to catch non-serialisable data.
- Two instances in the same page also see each other, which makes it usable for automated tests.
- **How to test multiplayer locally**:
  1. `npm run dev`.
  2. Open `http://localhost:5173/?net=local` in **two separate windows side by side**, so both stay visible (hidden tabs throttle).
  3. Host in one window and join by room code in the other. The lobby list works too, since `openLobby('local')` uses the same BroadcastChannel mechanism.
  4. Add `&lat=80&jit=30` to feel 160 ms RTT.

### 8.3 `OfflineTransport`

The local player is the host and there are zero peers. `selfId = 'offline-xxxxxxxx'` and `hostId = selfId`, so every client-to-host message loops back, and the game runs the full host and client code with no network. This is the default single-player mode and also the fallback after the host is lost.

### 8.4 Factory (`src/net/index.ts`)

```ts
const { mode, local } = netOptionsFromUrl();              // ?net=local|offline, ?lat, ?jit
const game  = await openGameRoom(mode, code, password, { local });
const lobby = mode === 'offline' ? null : await openLobby(mode, { local });
```

---

## 9. Mapping network events to local game events (`net/Replication`, TODO)

`src/core/events.ts` says network effects become local `G.events`. Suggested mapping:

| Net | Local event |
|---|---|
| `dmg` | `'damage'` (`DamageNumberKind`: crit when `f & CRIT`, `player_hurt` when tgt is the local player, `dodge`/`block`/`immune` from flags) |
| `heal` | `'heal'` |
| `death` | `'death'`; plus `'player:died'` for player ids (`local` when it is our entity) |
| `revive` | `'player:revived'` |
| `cast` / `castEnd` | `'skill:cast'` / `'enemy:castStart'` / `'enemy:castEnd'` / `'skill:castInterrupted'` |
| `castFail` | `'skill:fail'` |
| `status` / `statusEnd` | `'status:applied'` / `'status:removed'` |
| `loot` / `lootGot` | `'loot:dropped'` / `'loot:pickedUp'` (after adding to the save via CharacterState) |
| `xp` | CharacterState add-xp -> `'player:xp'` / `'player:levelup'` |
| `run` / `start` / `end` | `'run:updated'`, `'run:started'`, `'run:countdown'`, `'run:completed'`, `'run:forces'`, `'run:playerDeath'` |
| `keyResult` | update `MythicProfile.keystone` -> `'keystone:changed'` |
| `announce` | `'ui:toast'` / `'boss:yell'` / `'boss:phase'` |
| `party`, `notice`, `chat`, peer join/leave | `'party:changed'`, `'ui:toast'`, `'net:chat'`, `'net:peerJoined'` / `'net:peerLeft'`, `'net:status'` |
| `RoomBrowser.onChange` | `'net:rooms'` |

Juice is local: hit-stop and shake for the local player's predicted hits and for damage taken, and loot beams on `loot`.

---

## 10. Security and validation

- **Everything inbound is untrusted.** Check the tag with `isClientControl` / `isHostControl` / `isCommand` / `isEventBatch`. Then validate the fields a handler uses (finite numbers, ranges, known ids). Binary decoders return `null` on malformed input and never throw.
- **Role filtering**: clients accept `ctl`, `snap` and `evt` only from `hostId`. The host accepts `cmd`, `ps` and `chat` only from handshaked members, and `hello` from anyone.
- **Lobby** (strangers): `sanitizeAnnouncement` clamps every field. roomId must equal `gameRoomId(code)`. One entry per peer, first owner of a roomId wins, 200-entry cap.
- **Text** (names, room names, chat): `sanitizeText` strips control and bidi-override characters and caps the length. **Render with `textContent` only, never `innerHTML`.**
- **Stats**: `sanitizeCharacter` keeps only known `STAT_IDS` and clamps `maxHp`, `weaponMax`, `moveSpeed`, `armor` and `critChance` via `statCaps(level)`. Tune the caps with the balance data.
- **Rate limits** (host): `cast` at most 20/s, `chat` 8 per 10 s, `pickup` 20/s, `hit` reports only for known live `hitId`s once per player. Excess is dropped; persistent abuse leads to `kick{reason:'cheat'}`.
- **Privacy**: peers see each other's IP addresses (WebRTC). Mention this in the "Çevrimiçi" screen: "Çevrimiçi oyunda diğer oyuncular IP adresini görebilir." trystero encrypts SDP; a `password` additionally protects the room from relay operators.

---

## 11. Failure modes (Turkish UI)

| Failure | Detection | Text |
|---|---|---|
| No relays reachable | `getSignalStatus().open === 0` for 10 s | "Eşleştirme sunucularına ulaşılamıyor. İnternet bağlantını kontrol et." |
| WebRTC cannot connect (NAT) | `onError('join_failed')` / Hello timeout | "Oyuncuya doğrudan bağlanılamadı (NAT/güvenlik duvarı)." |
| Wrong password | `onError('bad_password')` | "Şifre yanlış." |
| Host left | `onPeerLeave(hostId)` | "Lider oyundan ayrıldı. Kasabaya dönülüyor..." |
| Kicked | `kick` | "Gruptan çıkarıldın." |
| Version mismatch | `reject:'version'` | "Sürüm uyumsuz. Sayfayı yenile (Ctrl+F5)." |
| Dungeon desync | `genHash` differs | Host sends `kick:'desync'`. "Zindan verisi uyuşmuyor. Sayfayı yenile." |
| High latency | `clock.rttMs > 250` | Party frame ping turns red; tooltip "Yüksek gecikme". |

---

## 12. Open items

- `PartySession` and `Replication` implementations (section 2 table). This document plus `messages.ts` are their spec.
- Delta snapshots if host upload becomes a problem (section 6.1).
- A TURN server setting in options.
- Lobby sharding or Nostr pub/sub when the lobby grows (section 3.3).
- Reconnect to the same run within 60 s using `charId` (the slot reservation is designed; the flow needs implementing).
- Spectator / late join into a running key: not planned (WoW does not allow it either).

---

## 13. Files

| File | Content |
|---|---|
| `src/net/transport.ts` | `NetTransport`, `BaseTransport`, `OfflineTransport`, shared types, `MAX_INLINE_PAYLOAD_BYTES` |
| `src/net/TrysteroTransport.ts` | trystero 0.26 implementation |
| `src/net/LocalTransport.ts` | BroadcastChannel implementation with latency/jitter simulation |
| `src/net/messages.ts` | Protocol constants, every message interface, binary codecs, sanitisers |
| `src/net/lobby.ts` | `RoomAnnouncer`, `RoomBrowser` |
| `src/net/sync.ts` | `ClockSync`, `InterpolationBuffer`, `adaptiveInterpDelay`, `HostTicker` |
| `src/net/index.ts` | `openRoom`, `openGameRoom`, `openLobby`, `netOptionsFromUrl`, re-exports |

All of these files type-check with `npx tsc --noEmit` and do not depend on three.js.

---

## 14. Open world (GDD_OPENWORLD §9.4)

Open-world maps are `DungeonDef`s with `world` (`isOpenWorld(id)` in `scenes/flow.ts`). They run on the `dungeon` scene id, so
the wire format and channels are unchanged; the rules below are the net module's part.

**Joins.** The host accepts joins while the party is on an open-world map (`NetSession.inOpenWorld`). Dungeon runs still reject
joins (`reject:'in_progress'`). The welcome carries the host's current `DungeonParams` untouched, including `spawn` and
`returnTo`; the joiner enters `dungeon` with them and appears where the party is spawned. Town joins are unchanged.

**Room browser.** While an open-world map runs, the room stays announced and joinable (`inProgress: false`) with
`activity: 'world'`. The value is for display only: the scene is still `dungeon`, and game code must not branch on it.

**Client requests.** `sceneRequest` from a client keeps `spawn` and `returnTo` when they are well formed
(`sanitizeWorldSpawn`, `sanitizeReturnTo`). The other params are rebuilt from known fields, as before.

**Snapshot interest** (`Replication.sendSnap`, host, 15 Hz):
- Radius: `NET.OPEN_WORLD_RELEVANCE_RADIUS` = 120 m around any remote player. Dungeons keep `RELEVANCE_RADIUS` = 70 m.
- At most `NET.MAX_SNAP_ENEMIES` = 60 entries per tick, nearest first. Entries go out in `snap` chunks of `SNAP_CHUNK` = 48.
- An enemy is sent when it changed, or when its own 1.5 s keyframe is due (`sentAt`). Enemies cut by the cap stay due.
- Sleeping enemies (`Enemy.dormant`) are not streamed. They join the stream when they wake.

**Entity replay for late joiners.** Before the first snapshot entry of a host-spawned enemy (`id >= HOST_DYNAMIC_ID_BASE`
or `packId` set), the host sends each remote peer that does not know it a `spawn` message (`announced` per peer). The
payload is `{ id, defId, x, z, level, packId, facing, aggro, owner?, tag?, hpFrac }`. Receivers ignore a spawn for an id
they already have (`EnemyFactory`), so duplicates are harmless. On `net:peerJoined` (host) every entry is due again, so
the joiner gets a keyframe on the next tick. `announced` is cleared on scene change and on peer leave.

**Event state is not replicated by net.** The `ev:*` keys on the `gate` channel (`ev:metin:<id>:on|off|dead`,
`ev:rare:<id>:up|dead`, `ev:boss:<id>:warn|up|dead`, `ev:shrine:<id>`, `ev:camp:<packId>:champion:<mod>`) belong to the
scenes module. A host-side `WorldRuntime` must replay its current keys to a new peer on `net:peerJoined` with
`G.net.sendTo(peerId, 'gate', {...})`.

**Unchanged.** Authority (host runs AI, camp, metin, rare and boss state), per-peer loot and XP on `death`, and per-peer
quests. The party shares nothing but the world.
