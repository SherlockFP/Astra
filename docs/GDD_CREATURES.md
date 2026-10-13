# EFSUN ONLINE — Creatures & Mechanics, "hafif Elden Ring" (spec for CORE_MECHANICS §16)

Status: implementation-ready spec (docs only, nothing in `src/` was touched). Precedence: ARCHITECTURE.md > CORE_MECHANICS.md
(§10 targeting/procs, §12 controls, §13 verticality, §14 procedural dungeons, §15 loot, §16 creatures) > this file > older GDDs
(GDD_V2 §3 poise/parry/perilous stays the combat-engine source; this file builds ON it and never redefines it).
Authoring rules: Turkish player-facing text, English ids/comments; every shared type change is append-only; host-authoritative
AI; every peer resolves hit shapes for its own local player (ARCHITECTURE "Damage authority").

Contents: 0 audit (what exists, what is missing) · 1 design rules · 2 data shapes (Appendix A is paste-ready) · 3 move-set
primitives · 4 roles & pack composition · 5 posture, stagger, riposte · 6 network-aware telegraphs (ROADMAP F9) · 7 the 24
creatures · 8 pools (open world 30–60, procedural, guardians) · 9 files and owners · 10 Haiku waves and verification ·
11 migration notes · 12 open questions · Appendices A (types), B (new ids), C (ability tips).

---------------------------------------------------------------------------------------------------------------------

## 0. Audit: what already exists, what this spec adds

Read before coding so nothing is rebuilt. File:line references are from the tree at spec time.

**Already built (reuse as is)**
| Feature | Where |
|---|---|
| Ability builders `cone / proj / aoe / line / charge / heal / buff / summonAb / passive / onDeath / NOOP`, `derive()`, `add()` | `src/data/enemies.ts` 75–160 |
| Busy timeline (windup → resolve → recover), clip speed fitted so the impact frame lands at `delay`, `lockAt` turn lock, `params.lunge`, `params.leap`, `params.pull`, `params.persist`, `params.once`, `hpBelow`, `minRange`, `firstCoef` | `src/ai/EnemyAI.ts` `startAbility` 1320, `tickBusy` 1715 |
| Melee position slots (6 per target), pack pulls, bone piles | `src/ai/EnemyDirector.ts` |
| Hit shapes: circle / ring / cone / line / rect, `persist`, `projectile`, `soak`/`safe`, `followSource`, `parryable`, `perilous` (red flash + glyph), `poise`, replicated on `hitshape` / `hitshape_x`, each peer resolves for its own local player | `src/combat/HitShapes.ts` |
| Poise engine: `poiseMax/regen/delay/hyperArmor/breakLock/parryPoise/finisherPct` (rank × family), `addStagger → breakPoise` (2.0 s window, `stun` on non-boss, `marked_crit`, ×1.25 damage while broken, windup cancelled, boss casts dropped except perilous), parry → riposte status 1.6 s, Kritik Vuruş finisher | `src/combat/poise.ts`, `Combat.ts` 803–1000, `COMBAT_FEEL` |
| Guard / parry (window 0.2 s) / perilous ignores guard | `src/combat/guard.ts`, `Combat.hitLocalPlayer` 1437 |
| `Enemy.addDamageWindow(sec, mult, arc, back)` (frontal block, replicated by `boss_dmgwin`), `boss_*` messages (push, pull, alpha, fx, text) over the `affix` channel | `Enemy.ts` 242, `ai/bossNet.ts` |
| AI hints `kite`, `dormant`, `stealthReveal`, `summoned`, `flee`, `homeRadius`, `sleepRange` | `types/enemies.ts` `EnemyAiHints` |
| Net: `snap` 15 Hz (flat-array codec), `ecast`, `estatus`, `NetStats.rttMs`, `?net=local&lat=..&jit=..` local transport with latency/jitter | `net/codec.ts`, `net/index.ts` |
| Voxel model remap by path (defs keep the SOURCE url, `resolveModelUrl` picks `models/voxel/...` automatically) | `core/voxelRemap.ts` |

**Gaps (this spec closes them)**
| # | Gap | Section |
|---|---|---|
| G1 | A "string" (2–3 chained strikes that re-aim) does not exist; multi-hit exists only as separate abilities | 3.3 |
| G2 | No delayed swing (hold in the wind-up pose) | 3.2 |
| G3 | Jump attack exists only as a boss-style `params.leap` hop with no tracking rule | 3.4 |
| G4 | Charge has no wall-collision punish, no tracking window | 3.5 |
| G5 | No grab (catch → hold → follow-up) | 3.6 |
| G6 | Ground telegraph patterns are hand-written per boss (`ai/bosses/kit.ts`), not available to trash/elites | 3.7 |
| G7 | Enrage is per-enemy passive scripts (`forge_demon_rage`...) | 3.8 |
| G8 | **Poise state is host-only: `Combat.staggerFrac/isStaggerBroken` read a map that stays empty on guests, so guests never see poise bars** | 5.3 |
| G9 | F10 (windup floor, tell pulse for every windup, ≤ 3 simultaneous swings) is on the roadmap but not implemented | 1.2, 3.1 |
| G10 | **F9: a guest's telegraph/shape lands 0.1–0.17 s BEFORE the replayed swing animation (see 6.1); with a 0.2 s parry window guests cannot parry on sight** | 6 |
| G11 | Role behaviours (skirmisher hit-and-run, healer retreat, shielder, ambusher, brute turn limit) are not data driven | 4 |
| G12 | No creature pools / pack recipes for procedural dungeons (CORE §14) or the 30–60 zones | 8 |

---------------------------------------------------------------------------------------------------------------------

## 1. Design rules

### 1.1 Pillars
1. **Readable before lethal.** Every damaging action has a tell (pose + colour pulse + sound + ground shape when it has an area).
   A first-time player must be able to dodge any single attack on sight; mastery is about *timing under pressure*, never about
   hidden information.
2. **Three answers.** Every creature offers the player at least two of: dodge (always), parry (windup melee), break (poise),
   kick (casts). Perilous attacks (red) answer only to dodge.
3. **Combos, not spam.** Trash have 2–4 attacks, elites 3–5, guardians 4–6; strings are 2–3 hits with re-aim between hits.
4. **Roles make packs.** A pack is a puzzle (kill the healer, kick the caster, kite the brute), not a bag of HP.
5. **Fair under latency.** Guests (rtt up to 300 ms) keep ≥ 70 % of every host-evaluated reaction window and see telegraph, swing
   and hit land together (section 6).
6. **Do not rebuild the engine.** Poise, parry, riposte, perilous, hyper-armour exist; new code adds *moves*, *roles*, *replication*.

### 1.2 The windup rule (ROADMAP F10, normative for all new defs)
```
windupFor(coef)        = clamp(0.45 + 0.25 * coef, 0.45, 1.20)      // first telegraph of any melee-like move
followWindupFor(coef)  = clamp(0.30 + 0.12 * coef, 0.30, 0.55)      // 2nd/3rd strike of a string (re-aimed, own shape)
```
| coef | 0.7 | 1.0 | 1.3 | 1.6 | 2.0 | 2.4 | 2.8 | ≥ 3.0 |
|---|---|---|---|---|---|---|---|---|
| first windup (s) | 0.63 | 0.70 | 0.78 | 0.85 | 0.95 | 1.05 | 1.15 | 1.20 |
Rules:
- The windup is the time from the visible pose change to the damage frame. `delayed` swings add a hold (3.2) on top and never
  count against the floor (the floor protects the first read, the hold is the trick).
- Non-melee floors: projectile 0.60, hitscan/line locks 0.90 (aim locks 0.30 s before landing), ground circles 0.90 (first marker
  of a rain 1.00), casts ≥ 1.00 (interruptible casts are never shorter, see 6.5), perilous ≥ 1.00.
- Swarm role (`role: 'swarm'`) may use 0.45 flat. Bosses are out of scope here (own scripts).
- **Tell on every windup** (replicated, every peer): at windup start the source flashes its type colour for 0.14 s
  (`physical 0xffd8a0, fire 0xff7a30, frost 0x80d0ff, shadow 0xa060ff, poison 0x80ff50, perilous 0xff2a2a`), a second flash at 70 %
  of the windup, and a short wind-up sound at the start (`enemy_windup`, pitched by size; perilous keeps `perilous_warn`). The
  pulses come from the replicated `HitShapeSpec.tell` (6.3), so no extra net message exists.
- **Swing tokens** (F10 "max 3 simultaneous melee swings on the player"): per target, at most 3 melee-like moves (melee, cone,
  rush, leap, grab) may be between "tell start" and "recover end"; an enemy without a token keeps circling at 3.6–4.5 m (existing
  ring logic) and retries every 0.25 s. Elites count 1, guardians count 2 tokens, swarm counts 0.5. Casters, ranged and ground
  marks are exempt. Implemented in `EnemyDirector.acquireSwing` (3.1).
- Perilous budget: max 1 perilous move per enemy per 8 s, max 1 perilous active per pack; never inside a string.
- Retrofit of all existing defs is a SEPARATE decision (open question 1). `tools/content-check.mjs --windup` lists offenders.

### 1.3 Damage budget (nominal, all hits landing, per enemy)
`cycle coef/s = (sum of coef in the move rotation) / (rotation time)`; targets: trash ≤ 0.9, elite ≤ 1.1, guardian ≤ 1.3; three
tokens cap an overwhelmed player at ~3 coef/s from melee. A string's total coef ≈ 1.5–2.4 × basic; the finisher hit carries
35–45 % of it. Buster (coef ≥ 2.5) moves have cooldown ≥ 12 s. These are tuning targets for `SimBench`/QA, not hard checks.

---------------------------------------------------------------------------------------------------------------------

## 2. Data shapes (summary; paste-ready code in Appendix A)

All additions are optional and append-only; old defs behave exactly as before.

- **`EnemyAbility.move?: MoveSpec`** — the move-set primitives (string, hold, leap, rush, grab, marks, hide, retreat, tell, token).
  When `move` is set the AI runs the move interpreter (`src/ai/moves.ts`) for that ability instead of the single-shape path;
  `kind`, `range`, `cooldown`, `damage`, `statuses`, `anim` keep their meaning (range = engage distance, damage.coef = the coefficient
  of the FIRST strike when `move.string` is absent). `abilityName` on spawned shapes stays `ab.name` so Affixes `isMeleeHit` keeps working
  (strings/hold/leap/grab are tagged `kind: 'melee'` for that purpose; `marks` stay `ground_aoe`).
- **`EnemyDef.enrage?: EnrageSpec`** — generic below-30 % enrage (3.8). **`EnemyDef.onBreak?: BreakSpec`** — what a poise break costs the
  creature (5.2). Both optional, read by the interpreter / Combat.
- **`EnemyAiHints` += `role2?: RoleId`, `hitRun?`, `turnRate?`, `frontBlock?`, `healer?`, `pack?`** (4).
- **`HitShapeSpec` += `tell? sync? grab? gate? seq?`** (6.3, 3.6).
- **`EnemySyncState` += `p? en?`** (poise byte, enrage/broken flags) and the `shot` string gains optional `:holdAt:holdDur` fields (5.3, 3.2).
- **Registries:** `CREATURES` (24 defs, `src/data/creatures/*.ts`, merged into `ENEMIES`), `CREATURE_POOLS`, `PACK_RECIPES`, `GUARDIAN_POOLS`
  (`src/data/creatures/pools.ts`), move builders (`src/data/creatures/moves.ts`).

---------------------------------------------------------------------------------------------------------------------

## 3. Move-set primitives

Common conventions: all positions XZ, y from `World.groundY`; yaw by `yawFromDir`; times in seconds of `EnemyAI.now`; the interpreter
owns a `MoveRun { ab, spec, step, t0, strikeIndex, tokenHeld, hold, data }` kept in a `WeakMap<Busy, MoveRun>` (`Busy.data` holds scalars only) so abort/flinch/death paths
(`abortBusy`) can clean up with one `moveAbort(ai, busy)` call (cancel own shapes with `G.hitShapes.cancelBySource`, release the token,
end hide/alpha, release a grab). Everything is host-only; clients only see shapes, `shot` strings, statuses and flags.

### 3.1 Windup floor, tell, swing token (the F10 core)
- `startAbility`: after computing `windup` for melee-like kinds (`melee, cone, charge`, or any `move`), apply
  `windup = max(windup, windupFor(coef))` unless `def.rank === 'boss'` or `ab.params?.noFloor`. (Enabled globally behind
  `ENEMY_RULES.windupFloor = true` in `src/ai/moves.ts`; retrofit decision = open question 1; new `crt_*` defs already satisfy it.)
- `EnemyDirector.acquireSwing(targetId, enemyId, tokens, until): boolean` / `releaseSwing(enemyId)`; map `targetId → Map<enemyId,{tokens,until}>`
  with `until` = tell start + total + 0.2 as a safety expiry. `EnemyAI.usable()` for melee-like kinds returns false when no token
  (replaces nothing: `canAttackMelee` slot ranking stays, tokens are the second gate). `endBusy/abortBusy` release.
- Tell: `ShapeOpts.tell = color` is passed through `EnemyAI.shape()` into `HitShapeSpec.tell` for every shape whose `delay ≥ 0.3`
  (perilous keeps its own red flash). `HitShapes.add` runs `tellPulse` on every peer (6.3).

### 3.2 Delayed swing (`move.hold`)
Elden Ring's "wait… wait… swing": the creature reaches the raised pose on time and holds it before the strike.
```
move: { hold: [min, max] }      // seconds, drawn per swing: hold = min + (max-min) * rng(); typical [0.20, 0.55]; hard cap 0.60
delay_total  = windupFor(coef) + hold                  // shape.delay = delay_total (decided on the host at t0, replicated as-is)
clip speed   = impact / windupFor(coef)                // the clip reaches the impact frame pose at windup, then...
host anim    = playShot(clip, speed); at t0 + 0.8*windup schedule  anim.freezeUntil = performance.now() + hold*1000
```
- `AnimController.freezeUntil` already exists (clip time × 0.04). The hold is exactly that freeze applied to the enemy.
- Replication: the random hold is decided on the host and baked into `shape.delay`; the snapshot `shot` string gets two optional
  fields `Clip:speed:loop:holdAt:holdDur`, both in WALL seconds (holdAt = seconds after the replay of the clip starts, = 0.8 x windup;
  holdDur = the hold). `Enemy.getSyncState` writes them from `lastShot`, `applySyncState` parses tolerantly (missing = no hold) and
  `updateRemote` sets `anim.freezeUntil = performance.now() + holdDur * 1000` at `replayStart + holdAt`. The `en` bit 8 shows the hold shimmer.
- **Fairness guards:** hold ≤ 0.60 s; first delayed swing after aggro uses the minimum hold; a delayed swing is never perilous; never
  re-rolled in response to the player's dodge (dodge-reactive delays would need re-spawning shapes and break guest sync: explicitly
  out of scope). The parry window stays 0.20 s (open question 6).
- Tell: the normal windup pulses (3.1) fire at the windup start and at 70 % of the windup only. There is deliberately NO cue at the end of the
  hold (it would give the timing away); during the hold the model shows a slow emissive shimmer so the player knows it is a holding attack.

### 3.3 Strings (`move.string`) — 2 or 3 chained strikes
```
string: [ { coef, range, arc, anim, impact, windup?, gap?, lunge?, knockback?, type?, statuses?, parryable?, shape? }, ... ]
```
- Strike 0: windup `windupFor(coef0)` (+ `hold` if present), parryable by default.
- Strike k ≥ 1: starts `gap` s (default 0.15–0.35) after strike k−1 resolved; windup `followWindupFor(coef_k)`; **re-aims** at the live
  target at its start (turn rate during the gap 18 rad/s, `lockAt` as today) and spawns its OWN shape then (so telegraph + shape are fresh on every peer);
  the AI refuses a follow-up if the target is farther than `range*1.6` or dead (string ends, 0.35 s recovery).
- A string is ONE ability for cooldown/token purposes; the token is held from strike 0 tell to the last recovery.
- Poise: a poise break, stun or hard CC aborts the string (existing `abortBusy`); flinch rules unchanged; hyper-armour applies per strike
  (`isHeavyAbility` is evaluated on the CURRENT strike's coef/windup).
- Last strike is the finisher: gets `knockback` (3–5 m for brutes) and the heavier sound (`swing_heavy`).
- Parry: parrying strike k breaks a trash enemy (existing instant break) and ends the string; against elites the parry poise (60) is
  dealt and the string continues unless the bar breaks.
- Player-facing rule of thumb: strike 0 is slow (readable), follow-ups fast (rhythm). Dodge through, or parry the first and the string dies.

### 3.4 Jump attack (`move.leap`) — "Sıçrayıp Ez"
```
leap: { min: 4, max: 12, airtime: 0.55, radius: 2.6, track: 0.6, after?: marks }
```
- The AI picks the landing point `L = target position` clamped to `[min, max]` from the creature (target closer than `min`: the ability is not usable;
  farther than `max`: it lands `max` short). `L` is LOCKED at `lockAt = min(track * windup, windup - 0.50)` seconds after t0 (so `track 0` = locked at t0 and the
  player always sees the final circle for at least 0.50 s). At `lockAt` the AI spawns ONE `circle(radius)` ground telegraph (`ground_aoe`, danger) at `L` with
  `delay = windup - lockAt`; before that only the tell pulse and the crouch/jump pose are visible. The shape is never respawned or moved afterwards.
- Take-off at `windup − airtime` (clip `Jump`/`Strike`/`Attack` per model, the clip is fitted so its apex is mid-air), `forcedMove` toward `L` over
  `airtime` with a vertical arc (`forcedMove.vy`), landing resolves the shape (`land delay` = windup). While airborne the creature cannot be knocked back.
- Landing: `ground_slam` vfx, camera shake scaled by radius, optional `after` marks (frost cross, fire ring persist) which spawn at landing with
  their own telegraph ≥ 0.6 s (so the player always has a second read).
- Poise: a break during the windup cancels the leap (creature stumbles in place); during airtime nothing cancels it.
- Net: shapes + `shot` clip are replicated as usual; `sync: true` (6.3) so guests see the landing marker fill until the replayed body touches down.

### 3.5 Charge / rush (`move.rush`)
```
rush: { length: 10, width: 2.0, speed: 16, track: 0.6, wallStun: 1.6, trail?: { coef, duration } }
```
- Telegraph = `line(length, width)` (existing `charge` kind) with `delay = windup`; the direction tracks the target until `track * windup` and is
  locked after (the `telegraphLock` rule already snaps at telegraphs; the interpreter keeps rotating the SHAPE via `followSource` until the lock).
- Rush = `forcedMove` at `speed` for `length/speed` s; the damage shape is the line itself (resolved at windup end, like today). Hitting the player:
  `knockdown 0.6–0.8` status when `statuses` set. Parryable (default true for rush by design: parry = stop the beast).
- **Wall punish:** the interpreter watches the displacement during the rush; if the creature travelled < 70 % of `length` (nav stopped it) it is
  "wall hit": `moveWallHit()` → `Combat.forcePoiseBreak(enemy, null, wallStun)` (new public method, 5.2), anim `Hit`/`Stagger`/`Daze`, camera shake 0.4,
  a toast-free popup `DUVARA ÇARPTI` at the creature (`bossText`). The player gets a free riposte window (marked_crit + stun for `wallStun`).
  Lure it into walls = the "brute to kite" payoff. Not applied to flying or `ccImmune` creatures (they just stop).
- `trail`: after the rush a lingering strip (`persist`) along the path (fire/frost). Existing `params.trail` keeps working; `trail` is the typed form.
- Min engage distance 4 m (`ab.params.minRange`), cooldown ≥ 7 s, hitscan-style safety: a rush never starts if the first 2 m of the path is blocked.

### 3.6 Grab (`move.grab`) — catch, hold, follow-up
```
grab: { range: 3.0, arc: 70, hold: 1.1, slam: { coef: 2.2, radius: 2.2, type, knockback }, pull?: number, releaseDamageFrac: 0.12 }
```
Host spawns TWO shapes at t0, linked by id:
1. **Catch shape**: short cone (`range`, `arc`), `perilous: true` (red, cannot be parried or guarded; dodge only), `delay = windup (≥ 1.0)`,
   `damage 0`, `grab: { hold, slamId }`. When it resolves on a peer for that peer's local player: local `grabbed = { gid, until }`, status `root` for `hold`
   + the creature plays the grab clip; `pull` (m) drags the player to the creature first (reuses `bossMsg('boss_pull')`, ranged grabs such as the chain).
2. **Slam shape**: circle (`slam.radius`) at the creature, `delay = windup + hold`, `gate: { grabShape: gid }`: on resolve a peer checks
   `grabbed.gid === gate.grabShape`; only then it hurts that peer's local player (so players who dodged the catch take nothing, and the slam is
   not an area hit for bystanders). Statuses/knockback apply at the slam.
- **Release conditions** (host cancels the slam with `hitshape_x`, every peer's `HitShapes.cancelLocal` of a gated shape calls `releaseGrab()`): the
  grabber's poise breaks, it is stunned/frozen/killed, or it takes ≥ `releaseDamageFrac` of its max HP during the hold (party burst saves you).
  Release removes the `root` status and gives 0.4 s of `iframes`.
- Escape by dodge after the catch is NOT allowed (real Elden Ring rule); counter-play = dodge the catch, or burst/break during the hold.
- Perilous budget applies (1.2). Grab shapes need a swing token (`tokens: 1`).
- Net edge case: a guest that was caught but loses the `hitshape_x` still self-releases at `until` (+0.1 s) — no stuck root.

### 3.7 Ground telegraph patterns (`move.marks`) — available to every creature
```
marks: { pattern: 'rain'|'sweep'|'cross'|'ringSafe'|'spiral'|'zone', count, radius, spacing, first, aim: 'target'|'predict'|'around'|'self',
         coef, type?, persist?: { duration, tick }, safeAt?: 'target'|'random', safeRadius?, origin?: 'self'|'landing' }
```
| pattern | what spawns (all `telegraph: true`, all at t0 except where noted) | read for the player |
|---|---|---|
| `rain` | `count` circles r `radius` (1.4–2.2) around the aim point; first delay `first` (≥ 1.0), then `+spacing` (0.25–0.35 s); positions fixed at spawn, never tracking; `predict` aims at `target + velocity*0.6` | stay moving, never stand still |
| `sweep` | `count` (2–3) long rects/lines from the creature rotating `±arc` per step, step delay 0.35 s | move perpendicular/around |
| `cross` | `count` (4) lines of length `radius*3` at 0/90/180/270° from `origin` (used after a leap/slam) | stand diagonal |
| `ringSafe` | danger ring/circle everywhere in `radius` except a green `kind:'safe'` circle (r `safeRadius`) at `safeAt` | run to the green spot |
| `spiral` | `count` circles on an outward spiral from the creature, 0.2 s apart | outrun the ring |
| `zone` | lingering `persist` circle at the aim (acid, frost, fire) | leave the zone |
Budget: ≤ 8 shapes per cast, ≤ 48 active telegraphs per world (`HitShapes.add` refuses beyond, host logs once); `persist` zones ≤ 5 s,
tick ≥ 0.4 s, coef per tick ≤ 0.3. Colours: danger red, safe green (`kind 'safe'`), soak blue (unused here).
Marks inside a cast: the creature is `castTime`d (interruptible when the def flags it) and the FIRST marker appears after the cast ends,
so a successful kick removes the whole pattern. `hide` (below) lets an ambusher hide during the marker countdown.

### 3.8 Enrage (below 30 %)
```
enrage?: { at: 0.30, atkSpeed: 0.25, speed: 0.15, damage: 0.10, roar: 0.9, anim: 'Roar', unlock?: string[], cdMult?: number, tintPulse?: color, aura?: VfxId }
```
- Triggered once from `EnemyAI.onDamageEvent` when `hpFrac < at` (host). The creature plays `anim` for `roar` s (non-interruptible, hyper-armour 1.0; it is
  NOT invulnerable and does not drop shapes already in flight) — this is a free damage window, intentionally.
- Effects: `atkMul *= 1 + atkSpeed`, speed ×(1+speed), `dmgMul *= 1 + damage`, optional `cdMult` on every move, `unlock` ability ids become selectable
  (they carry `params.enraged: 1` and are skipped before), `aura` loops (`enrage_aura`), `tintPulse` on the model.
- Poise: after enrage the poise regen delay is ×1.5 (harder to break) but the break window gets +0.5 s (readable reward).
- Replication: `EnemySyncState.en` bit `enraged` (5.3) → guests spawn the aura/tint locally; the roar sound plays from the `shot` replay.
- Limits: elites/guardians only by default; trash enrage only where listed (Çürük İşçi). Bosses keep their own phase scripts.

### 3.9 Hide / ambush (`move.hide`) and retreat (`move.retreat`)
- `hide: seconds` — from tell start until landing the creature is non-targetable and invisible (`setAlphaAll` + `invulnerable` status for the
  duration, `boss_alpha`), the ground marker is the only cue; at landing it re-appears (`Emerge`). Used by Toprak Çıyanı and Hayalet Dalışı.
- `retreat: metres` — after the move the AI runs `applyMove` away from the target for `retreat / (0.85*speed)` s (hit-and-run). Skipped if the
  retreat cell is not walkable (existing `walkableToward`).

### 3.10 Interpreter responsibilities (`src/ai/moves.ts`)
`MoveRunner` (class, one per `EnemyAI`): `begin(ab, target)` (called from `startAbility` when `ab.move`), `tick(dt, now)` (called from
`tickBusy`), `abort(reason)`, plus pure helpers `windupFor`, `followWindupFor`, `pickLanding`, `rushHitsWall`, `rollHold`. It builds shapes only through
`EnemyAI.shape()` (so M+ decoration, blind misses, dot dps and affix hooks keep working) and never touches `HitShapes` privates.

---------------------------------------------------------------------------------------------------------------------

## 4. Roles and pack composition

### 4.1 Role behaviours (`EnemyAiHints.role2`, implemented in `src/ai/roles.ts`, called from `moveForRole`/`combatTick`)
| `role2` | AI behaviour (numbers) | Player answer |
|---|---|---|
| `skirmisher` | `hitRun: [retreat 4–6 m, 0.9 s]` after every string; circles at 5–7 m between attacks; speed ×1.1 in the approach; first lunge needs a free token | punish the retreat with ranged/dash, parry the lunge |
| `brute` | `turnRate: 4 rad/s` during windup (circling beats it), hold swings, `rush` with wall punish, no retreat | kite it into walls, dodge behind it |
| `shielder` | `frontBlock: { arc: 110, mult: 0.3 }` = `addDamageWindow(5.5, 0.3, 110, 1.0)` refreshed every 5 s by the role tick while the shield is up (`Enemy.windows` is capped at 12 entries, the refresh replaces rather than stacks); the shield drops on poise break (5.2) and during `Kalkan Vuruşu` recovery | backstab (arc), parry, break |
| `caster` | `kite [9,15]`, retreats to keep LOS, casts ≥ 1.0 s with `kick` 1/2, **interrupted cast = 1.2 s stun ("Susturuldu") and a 3 s lock of that move** | kick it |
| `healer` | `healer: { prio: 1 }`: stays ≥ 7 m behind its allies (steers to the centroid of allies on the far side from the target), heals the lowest ally < 70 % (18–20 % max HP, 1.8 s cast, interruptible, kick 2), one shield buff; alone it flees (`ai.flee`), is marked with a green ring `heal_burst`-coloured above the nameplate | kill first |
| `ambusher` | spawns `dormant` (`wakeRange 7`), `hide`/burrow strike, then plays as skirmisher | walk around the marker |
| `summoner` | `kite [10,16]`, ≤ 6 live adds (existing cap), summons only while no add is alive within 12 m; summoning is a 2.0 s interruptible cast | kick, kill adds |
| `leader` | pack buff `Sürü Emri` (empower +20–25 % for allies, 8 s, cd 20, 0.5 s cast) | kill the leader |
| `swarm` | existing swarm role; dives with `rush` at 0.5 tokens each | cleave |
Implementation: `ROLE_TICK: Record<RoleId, (ai, dt, now) => void>` plus a `ROLE_PASSIVES` table merged into `abilities.ts` `PASSIVES` (frontBlock refresh, enrage trigger,
healer priority tag). Hints stay data: `ai: { role2: 'skirmisher', hitRun: [5, 0.9] }`.

### 4.2 Pack recipes (`PACK_RECIPES`, used by procedural packs and by open-world camp authors)
```
{ id, name, needs: [{ role2 | id, min, max }], size: [3, 7], bands?: [30, 60], rarity }
```
| recipe | composition | puzzle |
|---|---|---|
| `anchor_caster` | 2–3 melee anchors (skirmisher/shielder) + 1 caster | kick the caster while the anchors wear you down |
| `healer_line` | 2 shielders/brutes + 1 healer + 1 caster (optional) | break the line, kill the healer first |
| `brute_pair` | 1 elite brute + 2–3 skirmishers | kite the brute away from its escorts |
| `ambush_nest` | 3–4 dormant ambushers + 1 ranged | walk the camp edge, bait one at a time |
| `swarm_rush` | 6–10 swarm + 1 caster/leader | AoE and token cap (3 swings) keep it fair |
| `ranged_picket` | 2–3 ranged/casters behind 1 shielder | flank or LOS-break |
| `leader_pack` | 1 leader (elite) + 3–5 trash of one family | kill the leader to remove the buff |
Caps per pack: ≤ 1 healer per ≤ 6 members, ≤ 2 casters, ≥ 1 melee anchor, ≤ 1 elite per 4 trash, guardians never mixed with recipes (they come alone or with `add` summons).

---------------------------------------------------------------------------------------------------------------------

## 5. Posture bar, stagger and riposte (built on GDD_V2 §3.7; this section is what is NEW)

### 5.1 Numbers used for the 24 creatures
Existing defaults (`poise.ts`): trash 24, swarm 6, elite 100, miniboss 300 (× family; × `1 + 0.5 (party − 1)` for elite/mini/boss). `def.poise` overrides and skips the family
multiplier. Player poise damage per hit: LMB 3–12, heavy 25–30, ultimate 100, parry 60/90/120 by rank (trash/swarm break instantly). So an elite (100–160) takes
3–6 heavy hits or 2 parries + a heavy; a guardian (300–350) needs a few parries plus heavies: a break is earned, not spammed. Per-creature values are in section 7.

### 5.2 What a break costs the creature (`EnemyDef.onBreak`)
```
onBreak?: { windowMult?: number; disable?: string[]; disableSec?: number; cdAdd?: Record<string, number>; anim?: string; dropFrontBlock?: boolean; spawn?: { enemyId: string; count: number }; once?: boolean }
```
- `windowMult` stretches the 2.0 s window (`breakSeconds(def) * windowMult`, golems 1.5).
- `disable/disableSec`: those ability ids are locked for N s after the window (a dropped shield, a broken charge).
- `cdAdd`: cooldown penalties (a mammoth that was broken waits +6 s for its charge).
- `anim`: clip played during the window (`Daze`, `Stagger`, `Hit`), default: the def's hit clip held.
- `dropFrontBlock`: remove the shield window (shielders).
- `spawn`: adds released on the break (ooze splits), `once` per life.
Riposte rules are unchanged (parry → riposte 1.6 s status; Kritik Vuruş on a broken target: guaranteed crit + `finisherPct`, ×1.25 damage taken while broken, one finisher per player per window).
**New public method** `Combat.forcePoiseBreak(e: Enemy, by: EntityId | null, seconds: number): void` (host; wraps the private `breakPoise`, also used by rush wall punish and
by scripted breaks). `Combat.breakSeconds` path reads `onBreak.windowMult`; when the broken window ends (the poise update loop in `Combat`, ~2108) it applies `onBreak.disable/cdAdd` through `ai.applyBreakCost(e.def.onBreak)`; `dropFrontBlock` and `spawn` apply at the START of the break.

### 5.3 Poise on guests (gap G8, normative)
Today the poise map lives only in the host's `Combat`; guests render bars of 0 and `canFinish` always returns true. Fix:
- `EnemySyncState.p?: number` = poise fill 0..255 (only when `poiseMax > 0`, only when it changed by ≥ 2 or flag changed), `en?: number` flags: bit 1 = broken, bit 2 = enraged,
  bit 4 = front-block up, bit 8 = hold pose (delayed swing in hold). The snapshot codec appends two array slots after `shotSeq` and bumps the "flags" with bit 16 = `hasPoise`
  (`encodeEnemy` appends only when present, `decodeEnemy` accepts the old 12-slot form: **protocol stays compatible**, guests ignore missing fields).
- `Combat.applyRemotePoise(enemyId, p, flags)` (guest side, called from `Enemy.applySyncState`) fills a lightweight read-only `RemotePoise { v, max, brokenUntil }`; `staggerFrac()` and
  `isStaggerBroken()` read it when `!G.net.isAuthority`. Nameplates/TargetFrame/BossFrame need NO change (they call those two methods).
- Authority and clients both keep `estatus` for stun/marked_crit (unchanged), the new fields are display state only.
- Cost: ≤ 2 bytes per enemy per changed snapshot, only for enemies with a poise bar within the existing relevance filter.

---------------------------------------------------------------------------------------------------------------------

## 6. Network-aware telegraphs (ROADMAP F9)

### 6.1 Problem, measured from the code
Damage is resolved on EACH peer for its own local player (`HitShapes.resolve → hitLocalPlayer`), so a dodge is never penalised by latency, but three clocks disagree on a guest:
1. The `hitshape` message arrives `oneWay` after the host spawned it; `HitShapes.add` starts `t = 0` at receipt, so it lands at `host_t0 + oneWay + delay`.
2. The swing animation is replayed only when the next `snap` (15 Hz, ≤ 66 ms old, 33 ms average) arrives, then `Enemy.pendingShots` waits `interp.delay = 0.10 s`
   (`applySyncState`, `updateRemote`): the impact frame shows at `host_t0 + oneWay + 0.033 + 0.10 + delay`.
3. The cast bar (`ecast`) starts at receipt and ends `castTime` later (too early by the same lag).
So on a guest the shape lands **≈ 0.133 s BEFORE the visible swing connects**, the telegraph ring completes before the animation does, and a parry pressed on the
visible impact (window 0.20 s, `guard.ts`) is already too late: guests effectively lose ~65 % of the parry window and are hit "before the swing". Host and offline are exact.

### 6.2 Rule
A peer without authority aligns shape landing, telegraph fill and cast-bar end with ITS OWN replay of the swing:
```
visLag = clamp(Enemy.interp.delay + 0.5 / 15, 0, 0.18)   // 0.133 s with the default 0.1 s interpolation; 0 for host/offline
guestDelay = spec.delay + (spec.sync ? visLag : 0)
```
The window never shrinks (guests see ≥ 100 % of the host's telegraph time plus `visLag`); damage still resolves locally against the local player, so no network round trip
enters a dodge. Ground marks that are not tied to an animation (`sync` absent: persistent zones, hitscan locks, rain after a cast) keep `guestDelay = spec.delay` (they are
their own clock, aligned by receipt time).

### 6.3 Contract (HitShapes, combat owner)
```ts
// HitShapeSpec additions (append-only, replicated with the spec)
tell?: number;                       // hex colour of the windup pulse (6.3 below) — 0/undefined = none
sync?: boolean;                      // landing is tied to the source's replayed animation: guests add visLag
grab?: { hold: number };             // catch shape (3.6)
gate?: { grabShape: number };        // resolves only for a local player grabbed by that shape (3.6)
seq?: number;                        // string index (0,1,2) — dev overlay and tests only
```
- `HitShapes.add`: `a.lag = (!G.net || G.net.isAuthority) ? 0 : (spec.sync ? visLag() : 0)`; the telegraph is created with `delay + lag`; `a.t` compares against `delay + lag`.
  `visLag()` = `clamp(sourceEnemy?.interp.delay ?? 0.1, 0.05, 0.15) + 1/30`.
- `tellPulse(a)`: if `spec.tell`, on every peer flash the source with that colour at `t = 0` and at `0.7 * (delay + lag)` (0.14 s each, `G.vfx.flash`), play `enemy_windup` once.
  `perilousWarn` stays as is. Feedback only, never throws.
- **Cast bars:** the `ecast` receiver (`EnemyFactory.ts` ~82) adds `visLag` to `castTime` when `!isAuthority` (HUD cast bars need no change).
- **Host cancels** (`hitshape_x` / `cancelBySource`) are unchanged; a cancel that arrives before `add` is remembered for 1 s (`pendingCancel` set) so a very short string strike cannot "ghost".
- **Dev only:** `spec.dbg?: number` = `Date.now()` on the host when `?netdbg` is present; the guest overlay prints `landDelayError = now − (dbg + oneWay + delay)` per shape.

### 6.4 Reaction windows evaluated on the host (the "≥ 70 %" invariant)
Everything the host decides from a guest message loses `oneWay` on the way in and the effect loses `oneWay` on the way back. For a guest with round trip `R` (read from
`NetStats.rttMs`; the host knows each peer's ping from the `pings` control message) and a window `W` the guest keeps `(W + grace − R) / W`. Required: ≥ 0.70.
| Window | `W` | Mitigation (host side) | Result at R = 0.30 s |
|---|---|---|---|
| Interruptible cast (kick/stun/interrupt) | ≥ 1.0 s (rule 1.2) | host extends the cast resolve by `grace = clamp(0.5 · maxPartyRtt, 0, 0.20)` and shows it on the cast bar | (1.0 + 0.15 − 0.30)/1.0 = 0.85 |
| Poise break → Kritik Vuruş (finisher request) | 2.0 s | host accepts a finisher until `brokenUntil + min(0.25, R/2 + 0.05)` | (2.0 + 0.2 − 0.3)/2.0 = 0.95 |
| Riposte after a parry | 1.6 s | the `hit` carrying `skillId:'parry'` is stamped by arrival − oneWay; window counted from that time | 0.92 |
| Grab release by burst | `hold` ≥ 1.0 s | release checked by damage accumulated during `hold + grace` | 0.85 |
| Parry / dodge / guard | local to the guest | unchanged (resolved on the guest) | 1.00 |
`maxPartyRtt` = max of `peers[].ping` (≥ 0 when offline = 0, so offline/host behaviour is bit-identical). Rule for authors: **no interruptible cast shorter than 1.0 s, no rooting-grab hold shorter than 1.0 s, no host-validated window shorter than 1.0 s** (content-check enforces it for `crt_*`).

### 6.5 Strings, holds and rains over the wire
- A string spawns each strike's shape when that strike begins (small messages, ~25 ms apart in the worst case; strike windows are ≥ 0.30 s so reordering cannot cross strikes). Strike `k` carries `seq = k`.
- A delayed swing is ONE shape with the final delay (no re-send); the hold pose is replicated in the `shot` string + `en` bit 8 (5.3, 3.2).
- A rain is N shapes in one burst (≤ 8, within the 48-shape cap): all `sync` unset, first delay ≥ 1.0 s.
- Enrage and poise state ride `snap` (5.3). No new net channel is added; `KNOWN_CHANNELS` is untouched.

### 6.6 Verification protocol (no browser needed for coders; QA runs it once)
1. Offline and host: identical to today (all lags 0): run the dev page and compare a string timing: shape land − animation impact ≤ 30 ms.
2. Two tabs, `?net=local&lat=120&jit=40`: guest measures `landDelayError` for 20 swings of Bozkır Avcısı and Taş Bekçi: |error| ≤ 50 ms p95; the visible impact frame vs shape land
   ≤ 40 ms p95 (`sync` shapes). 3. Same with `lat=300`: parry on sight succeeds ≥ 70 % of tries for a scripted tester (dev hook `window.dev.autoParry(offsetMs)`).
4. Cast bar vs shape land error ≤ 50 ms. 5. Kick a Buz Mızrağı cast at R = 0.3 s from the guest: success rate ≥ 70 % for a tester pressing at 50 % of the cast.

---------------------------------------------------------------------------------------------------------------------

## 7. The 24 creatures

Conventions: ids `crt_*` (no collision with `ow_*`, `kef_*`, `skel_*`, `cult_*`, `mb_*`, `wb_*`, `boss_*`, `rare_*`); models use the SOURCE path (`MON/CHAR/SKEL/GEN/ITCH` consts of `data/enemies.ts`;
the voxel twin under `public/assets/models/voxel/...` is resolved automatically, all 24 models have one); clip names below were read from the GLBs (voxel twins keep identical clip names).
`forces: 0` for all (not used by M+ keys); `xp` by rank default; `family` = `FamilyId` of `types/v2.ts` (poise multiplier applies only when `poise` is not set); `hp`/`dmg` are `hpMult`/`dmgMult` (EnemyFactory scales
by level). `W(c)` = windup rule (1.2). Poise column is the explicit `def.poise` (– = rank default). Scale is the starting value (see 11 for the voxel cell note).
Move line format: `id "Ad" kind · windup · coef · cd · extras`. All melee-like moves are parryable unless marked P (perilous) or X (not parryable).

### 7.1 Overview
| # | id | TR name | rank / role2 | model (clips used) | scale · tint | hp | dmg | speed | r | poise | family |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | crt_bozkir_avcisi | Bozkır Avcısı | trash / skirmisher | ITCH warg (Bite Lunge Howl Threat) | 0.85 · 0xc8a060 | 1.0 | 0.9 | 7.8 | 0.6 | – | beast |
| 2 | crt_toprak_ciyani | Toprak Çıyanı | trash / ambusher | ITCH centipede (Bite Burrow Emerge Threat) | 0.9 · 0x8a6a40 | 1.1 | 1.0 | 6.4 | 0.6 | – | insect |
| 3 | crt_akinci_puglin | Puglin Akıncı | trash / skirmisher (ranged) | ITCH bestiary puglin (Throw Attack_1H_1/2/3) | 0.95 · 0xb08040 | 0.9 | 1.0 | 6.8 | 0.5 | – | humanoid |
| 4 | crt_buz_nisancisi | Buz Nişancısı | trash / ranged | SKEL Skeleton_Rogue (2H_Ranged_Shoot) | 1.0 · 0x90c0ff | 0.8 | 1.0 | 5.6 | 0.5 | – | undead_bone |
| 5 | crt_mezar_nobetcisi | Mezar Nöbetçisi | trash / shielder | SKEL Skeleton_Warrior (1H_Melee_Attack_Slice_Horizontal / Chop, Block_Attack) | 1.05 · 0x6a7a8a | 1.6 | 1.0 | 5.0 | 0.55 | – | undead_bone |
| 6 | crt_cirik_isci | Çürük İşçi | trash / brute | MON Zombie (Attack) | 1.05 · 0x7a8a5a | 1.5 | 1.1 | 3.6 | 0.6 | – | undead_flesh |
| 7 | crt_kizgin_cirak | Kızgın Çırak | trash / brute-lite | MON Goblin (Attack) | 1.0 · 0xd08040 | 0.9 | 1.0 | 6.6 | 0.45 | – | humanoid |
| 8 | crt_harabe_gozcusu | Harabe Gözcüsü | trash / ranged | CHAR Rogue_Hooded (1H_Ranged_Shoot, Spellcast_Raise) | 1.0 · 0x907060 | 0.8 | 1.0 | 5.8 | 0.5 | – | humanoid |
| 9 | crt_ayaz_buyucusu | Ayaz Büyücüsü | trash / caster | CHAR Mage (Spellcast_Shoot, Spellcast_Long) | 1.05 · 0x80c0ff | 0.8 | 1.0 | 5.2 | 0.5 | – | humanoid |
| 10 | crt_kanli_rahip | Kanlı Rahip | trash / healer | SKEL Skeleton_Mage (Spellcast_Shoot, Spellcast_Raise) | 1.0 · 0xa04050 | 1.0 | 0.8 | 5.0 | 0.5 | – | undead_bone |
| 11 | crt_magara_surusu | Mağara Sürüsü | trash / swarm | GEN bat_cave (Attack) flying hover 1.6 | 0.7 · none | 0.3 | 0.5 | 8.0 | 0.35 | – | beast |
| 12 | crt_zehir_orumcegi | Zehir Örümceği | trash / skirmisher (leaper) | ITCH spider (Bite Strike WebSpit) | 0.9 · 0x5a8a50 | 1.2 | 1.0 | 7.0 | 0.6 | – | insect |
| 13 | crt_bozkir_mamutu | Bozkır Mamutu | elite / brute | ITCH mammoth (TuskSwipe Charge Stomp Trumpet) | 1.0 · 0x8a6a50 | 6.0 | 1.5 | 5.2 | 1.5 | 140 | beast |
| 14 | crt_yapiskan_camur | Yapışkan Çamur | elite / grabber | ITCH ooze (Lash Grab Engulf Spit; anims walk/run = Crawl) | 1.0 · 0x4a6a3a | 4.5 | 1.2 | 4.8 | 0.9 | 100 | slime |
| 15 | crt_kutup_ayisi | Kutup Ayısı | elite / brute-grabber | ITCH bear (Swipe Rear Slam Hug Roar) | 1.05 · 0xe8f0f8 | 6.0 | 1.5 | 5.8 | 1.1 | 130 | beast |
| 16 | crt_kar_devi | Kar Devi | elite / leaper | MON Yeti (Attack Jump) | 1.5 · 0xcfe0f0 | 7.0 | 1.6 | 4.8 | 1.4 | 150 | beast |
| 17 | crt_zincir_celladi | Zincir Celladı | elite / brute (puller) | MON Orc (Weapon Punch) | 1.3 · 0x805030 | 5.5 | 1.5 | 5.2 | 0.9 | 120 | humanoid |
| 18 | crt_kor_ruhu | Kor Ruhu | elite / caster (marks) | GEN elemental_fire (Attack Cast) | 1.2 · none | 4.5 | 1.4 | 4.6 | 0.9 | 100 | elemental_fire |
| 19 | crt_tas_bekci | Taş Bekçi | elite / brute (armored) | GEN golem_stone (Attack Attack2) | 1.3 · 0x8a8a7a | 8.0 | 1.5 | 3.8 | 1.3 | 160 | golem |
| 20 | crt_donmus_nobetci | Donmuş Nöbetçi | miniboss (guardian) / shielder | CHAR Knight (1H_Melee_Attack_Slice_*, 2H_Melee_Attack_Chop, Block_Attack) | 1.35 · 0x9ac8e8 | 18 | 1.7 | 5.0 | 0.9 | 320 | elemental_frost |
| 21 | crt_mahzen_celladi | Mahzen Celladı | miniboss (guardian) / brute | SKEL Skeleton_Warrior (2H_Melee_Attack_Slice/Chop/Spin, 1H_Melee_Attack_Jump_Chop) | 1.6 · 0x504030 | 20 | 1.8 | 5.2 | 1.0 | 340 | undead_bone |
| 22 | crt_cehennem_muhafizi | Cehennem Muhafızı | miniboss (guardian) / brute-leaper | MON Demon (Attack Jump) | 1.7 · 0xb04020 | 22 | 1.8 | 5.4 | 1.3 | 350 | demon |
| 23 | crt_agit_cagiricisi | Ağıt Çağırıcı | miniboss (guardian) / summoner | GEN wraith (Attack Cast) flying hover 0.6 | 1.5 · 0x6a5aa0 | 16 | 1.5 | 4.6 | 0.9 | 260 | ghost |
| 24 | crt_ejder_yavrusu | Kızıl Ejder Yavrusu | miniboss (guardian) / brute | GENB kizil_ejder (Attack Attack2 Cast Enrage) | 0.55 · none | 20 | 1.7 | 6.0 | 1.4 | 330 | dragon |
Animation sets: warg/wolf `A_WOLF`; centipede/spider/bear/rhino/ooze/mammoth use the itch vocabulary (`idle Idle, walk Walk|Crawl, run Run, hit Hit, death Death`); puglin `A_PUGLIN`; KayKit `A_KAYKIT`; skeleton `A_SKEL`;
Zombie/Goblin/Demon/Yeti `A_ENEMY`; Orc `A_CHAR`; gen creatures/bosses `A_GEN`. `ITCH` is `${MODELS}itch/creatures/`, the puglin uses `PUG`.

### 7.2 Trash (12)
**1 Bozkır Avcısı** — role skirmisher (`hitRun: [5, 0.9]`). Basic `crt_avci_bite` "Çifte Isırık": string `[ {coef .7, range 2.2, arc 90, anim Bite, impact .47}, {coef .8, gap .15, anim Bite, impact .47} ]` (windups .63 / .40), cd 1.9.
`crt_avci_lunge` "Atılıp Çekil": rush length 6, width 1.4, coef 1.1 (windup .73), track .5, retreat 5, cd 7, anim Lunge impact .87. Tell: amber pulse + low growl. Answer: parry the lunge (instant break), chase the retreat.

**2 Toprak Çıyanı** — role ambusher: `ai: { dormant: true, wakeRange: 7, role2: 'ambusher' }`, spawns buried (wakes with Emerge, 0.7 s). Basic `crt_ciyan_bite` "Zehirli Isırık": cone 2.0 arc 90 coef 1.0 (.70), poison 1 stack 0.15 5 s, cd 2.4.
`crt_ciyan_ambush` "Yeraltı Pususu": `hide 1.3`, marks `zone`-less single circle r 2.2 at predicted position (marker 1.3 s), emerge hit coef 1.4 + knockdown 0.6 s, minRange 4, cd 11, anim Burrow → Emerge. Answer: leave the red circle; punish the 1.2 s recovery.

**3 Puglin Akıncı** — ranged skirmisher `kite [6,11]`. Basic `crt_akinci_javelin` "Mızrak Fırlat": projectile speed 20, range 14, coef 1.0 (windup .70, X), cd 2.8, anim Throw impact .45.
`crt_akinci_flurry` "Üçlü Sapla": usable only inside 3.2 m, string `[ {coef .6, range 2.4, Attack_1H_1}, {coef .6, gap .2, Attack_1H_2}, {coef .9, gap .25, Attack_1H_3, knockback 2} ]`, cd 6, retreat 4. Answer: the flurry is the punish for closing in; parry hit 1.

**4 Buz Nişancısı** — ranged `kite [9,15]`, `bonePile`. Basic `crt_nisanci_bolt` "Buz Oku": projectile 22 m/s range 18 coef 1.0 (.70 X) frost, `chill` 1 stack, cd 2.6, anim 2H_Ranged_Shoot impact .15.
`crt_nisanci_lock` "Kilitli Atış": hitscan line 20 × 1.2, coef 2.0 frost, windup 1.0, aim locks at 0.7 s (after that the line is fixed), cd 12, telegraph. Answer: break LOS or strafe out of the frozen line.

**5 Mezar Nöbetçisi** — role shielder, `frontBlock {arc 110, mult 0.3}`, attached `Round_Shield` + sword (hide others). Basic `crt_nobetci_blade` "Kalkanlı Kılıç": string `[ {coef .8, range 2.6, Slice_Horizontal, impact .30}, {coef 1.0, gap .25, Chop, impact .35} ]` (windups .65 / .42), cd 2.4.
`crt_nobetci_bash` "Kalkan Vuruşu": cone 3.0 arc 80 coef 0.8 + knockback 3 + `poise 20` to guard, windup .85, **hold [.20, .45]**, cd 9, anim Block_Attack impact .4; shield drops 1.2 s afterwards (`frontBlock` off during recovery). Answer: backstab/flank, parry the bash to open it, poise break drops the shield 6 s.
`onBreak: { dropFrontBlock: true, disableSec: 6, disable: ['crt_nobetci_bash'] }`.

**6 Çürük İşçi** — role brute, `turnRate 4`, slow. Basic `crt_isci_swing` "Sarkık Kol": cone 2.4 arc 110 coef 1.3 (.78) **hold [.20, .50]**, cd 3.0, anim Attack impact .40, knockback 2.
`crt_isci_retch` "Kusmuk": cone 6 × 50° coef 0.6 poison 2 stacks, windup 1.0, cd 10, X. `enrage { at .3, atkSpeed .25, speed .28, damage .10, roar .8, anim Jump }` ("Çürük Öfke"; the Zombie has no roar clip, the Jump clip is the shout). Answer: circle it, it cannot turn.

**7 Kızgın Çırak** — brute-lite. Basic `crt_cirak_hammer` "Çekiç Darbesi": cone 1.9 arc 100 coef 1.0 (.70), cd 2.2, anim Attack impact .45.
`crt_cirak_rush` "Kızgın Hücum": rush length 7 width 1.3 coef 1.3 (.78) track .5 **wallStun 1.6**, cd 8, anim Jump(as run-up)/Attack impact .5. `onDeath` `crt_cirak_ember` "Kor Patlaması": ground circle r 2.0 coef 0.5 fire delay .6 telegraph. Answer: sidestep the rush so it hits a wall, do not kill it in a crowd.

**8 Harabe Gözcüsü** — ranged `kite [8,14]`, crossbow attach. Basic `crt_gozcu_bolt` "Tatar Oku": projectile 24 m/s range 17 coef 1.0 (.70 X) cd 2.8, anim 1H_Ranged_Shoot impact .15.
`crt_gozcu_marks` "Hedef İşareti": marks `rain` count 3, radius 1.5, aim predict, first 1.0, spacing .35, coef 1.1, cd 10, anim Spellcast_Raise impact .3. Answer: keep moving, the marks follow the predicted path once.

**9 Ayaz Büyücüsü** — caster `kite [9,15]`. Basic `crt_ayaz_shard` "Buz Kıymığı": projectile 18 m/s coef 1.0 (.70 X) frost, cd 2.6, anim Spellcast_Shoot.
`crt_ayaz_lance` "Buz Mızrağı": line 18 × 1.2, coef 2.4 frost, castTime 1.6 (windup = cast, interruptible, **kick 2**), cd 12, anim Spellcast_Long; lock 0.3 s before landing.
`crt_ayaz_field` "Don Alanı": marks zone r 3.5 at target, first 1.0, persist 4 s tick .5 coef .25 + `chill`, cd 14. Interrupt = 1.2 s "Susturuldu" stun and `crt_ayaz_lance` locked 3 s. Answer: kick the lance.

**10 Kanlı Rahip** — healer, `healer: { prio: 1 }` (4.1), `kite [10,16]`. Basic `crt_rahip_bolt` "Kan Okulu": projectile 16 m/s coef 0.8 shadow (.65 X) cd 3.0.
`crt_rahip_heal` "Kan Şifası": heal_ally castTime 1.8 interruptible **kick 2**, heals 20 % max HP of the lowest ally < 70 %, cd 6. `crt_rahip_ward` "Kan Mührü": buff_ally castTime 1.2, `shield` 15 % max HP 8 s, cd 18. Green ring over the head; killing it first
removes ~35 % of a pack's effective HP. Answer: kill/kick first.

**11 Mağara Sürüsü** — swarm (6–10 per pack, flying). Basic `crt_surusu_bite` "Diş": cone 1.4 arc 100 coef 0.8 (0.45 floor for swarm), cd 1.6, 0.5 token.
`crt_surusu_dive` "Çarpma Dalışı": rush length 5 width 1.0 coef 0.9 (.55), cd 5, wallStun 0 (flying). Answer: cleave; the token cap keeps three at once.

**12 Zehir Örümceği** — skirmisher/leaper. Basic `crt_orumcek_bite` "Zehirli Diş": cone 2.2 arc 100 coef 1.0 (.70), poison 1 stack, cd 2.2, anim Bite impact .4.
`crt_orumcek_pounce` "Atlayış": leap min 4 max 10 airtime .5 radius 2.0 coef 1.5 (windup .90), track 0, cd 9, anim Strike. `crt_orumcek_web` "Ağ Tükür": projectile 16 m/s coef 0.4 (windup .80 X) + `root` 1.5 s, cd 12, anim WebSpit. Answer: sidestep the landing circle; the web is the setup for the pounce.

### 7.3 Elites (7)
**13 Bozkır Mamutu** — brute, kite target. `turnRate 3`, poise 140. Basic `crt_mamut_tusk` "Dişle Savurma": cone 4.0 arc 120 coef 1.3 (.78) **hold [.25, .55]**, knockback 4, cd 3.2, anim TuskSwipe impact .45.
`crt_mamut_charge` "Ezici Hücum": rush length 14 width 2.6 coef 2.4 (1.05) track .6 **wallStun 2.0**, knockdown .8, minRange 5, cd 12, anim Charge impact .6. `crt_mamut_stomp` "Yer Sarsıntısı": marks `ringSafe`-type danger ring inner 2.0 / outer 6.0 around itself (stand close or run), coef 1.8, windup 1.1, cd 14, anim Stomp impact 1.0.
`enrage { at .3, atkSpeed .25, speed .20, roar 1.0, anim Trumpet, unlock ['crt_mamut_double'] }`: `crt_mamut_double` "Çifte Hücum" = two rushes 0.6 s apart. `onBreak { windowMult 1.0, cdAdd { crt_mamut_charge: 6 } }`. Answer: dodge sideways so it hits a wall (free riposte).

**14 Yapışkan Çamur** — grabber, poise 100. Basic `crt_camur_lash` "Kırbaç": cone 3.4 arc 60 coef 1.0 (.70) cd 2.4, anim Lash impact .4.
`crt_camur_engulf` "Yutma": grab range 2.6 arc 70 hold 1.1, windup 0.95 (P), slam coef 2.2 radius 2.2, releaseDamageFrac .12, cd 14, anim Grab → Engulf. `crt_camur_spit` "Tükürük": marks zone r 2.0 at target, first 1.0, persist 5 s tick .5 coef .3 poison, cd 9, anim Spit.
`onBreak { spawn: { enemyId: 'ow_ooze_half', count: 2 }, once: true }`. Answer: dodge the engulf; burst it during the hold.

**15 Kutup Ayısı** — poise 130. Basic `crt_ayi_claws` "Çifte Pençe": string `[ {coef .9, range 3.0, arc 110, Swipe, impact .42}, {coef 1.0, gap .2, Swipe, impact .42} ]` (.68 / .42), cd 2.8.
`crt_ayi_slam` "Ayağa Kalk ve Ez": self circle r 4.5 coef 2.3 (1.03) **hold [.30, .60]**, anim Rear → Slam, cd 11. `crt_ayi_hug` "Sarılma": grab range 3.0 arc 80 hold 1.3, windup 1.0 (P), slam coef 2.6, cd 16, `hpBelow .7`.
`enrage { at .3, atkSpeed .30, roar .9, anim Roar }` (slam loses its hold when enraged). Answer: back off when it rears, never face-tank the hug.

**16 Kar Devi** — leaper, poise 150, hyperArmor .6. Basic `crt_devi_punch` "Yumruk": cone 3.4 arc 110 coef 1.2 (.75) **hold [.20, .40]**, cd 3.0, anim Attack impact .4.
`crt_devi_leap` "Sıçrayıp Ez": leap min 5 max 14 airtime .6 radius 3.2 coef 2.6 (1.10) track .75, `after` marks `cross` ×4 lines length 9 coef 0.8 first .7 + frost zone persist 3 s tick .5 coef .25, cd 13, anim Jump.
`crt_devi_roar` "Buz Kükremesi": self ring outer 7 coef 1.2 frost + `slow` 2 s, windup 1.0, cd 18 anim Jump. `enrage { at .3, cdMult .6 }`. Answer: read the landing circle, stand diagonal for the cross.

**17 Zincir Celladı** — brute with a pull, poise 120. Basic `crt_cellat_axe` "Zincirli Balta": string `[ {coef .8, range 3.2, arc 100, Weapon, impact .45}, {coef .9, gap .2, Weapon}, {coef 1.4, gap .3, Punch, knockback 4} ]` (.65 / .42 / .48), cd 3.6.
`crt_cellat_chain` "Çek ve Vur": grab-lite `pull 7`: catch = hitscan line 10 × 1.2, windup 1.0, NOT perilous (the chain is dodgeable but not parryable, X); `hold .7` is the only hold below 1.0 because a `pull` grab does not root the player (it only drags), so the 1.0 hold rule applies to rooting grabs only; slam coef 1.6 cone 3.2, minRange 5, cd 15, anim Weapon. `enrage { at .3, speed .15, unlock ['crt_cellat_axe4'] }`: the string gains a 4th hit (coef 1.2). Answer: dodge through the chain, parry the 3rd hit.

**18 Kor Ruhu** — caster with marks, poise 100, `kite [6,10]`. Basic `crt_kor_touch` "Kor Dokunuşu": cone 2.4 arc 100 coef 1.0 (.70) fire + burn, cd 2.4.
`crt_kor_rain` "Kor Yağmuru": castTime 1.5 interruptible **kick 1**, marks `rain` count 5 radius 1.8 aim predict first 1.0 spacing .3 coef 1.2 + persist 3 s tick .5 coef .2, cd 12, anim Cast.
`crt_kor_sweep` "Alev Taraması": marks `sweep` count 3 length 10 width 1.6 step .35 coef 1.4, windup 1.1, cd 15. `enrage { at .3, cdMult .65, aura enrage_aura }` ("Kızıl Parlama": rain count 8). Answer: kick the rain, move perpendicular to the sweep.

**19 Taş Bekçi** — armored brute, poise 160, hyperArmor .6, `turnRate 3`. Basic `crt_bekci_fist` "Taş Yumruk": cone 3.4 arc 100 coef 1.3 (.78) **hold [.30, .60]**, cd 3.4, anim Attack impact .5.
`crt_bekci_double` "Çifte Ezme": string `[ {coef 1.2, cone 4.0 arc 160, Attack2, impact .45}, {coef 1.6, gap .5, circle r 2.8 in front, Attack, impact .5} ]` (.75 / .49), cd 8.
`crt_bekci_crack` "Zemin Çatlağı": line 14 × 2.0 coef 2.0, windup 1.2 (longer than the 0.95 floor on purpose: it is the buster), leaves a `persist` crack 4 s tick .5 coef .25, cd 14, anim Attack2 impact .6.
`onBreak { windowMult 1.5, disableSec 4, disable ['crt_bekci_crack'] }`. Answer: stagger it with parries; the second ezme is slow and punishable.

### 7.4 Guardians / minibosses (5) — Elden-style move sets (also usable as the 2 "guardians" of a procedural run, CORE §14)
All: `rank miniboss`, `ai: { homeRadius: 30 }`, `enrage { at 0.30 }`, poise scales with party (existing), loot `loot_cr_guardian`.
**20 Donmuş Nöbetçi** — shielder, `frontBlock {110, 0.3}` while the shield is up. Basic `crt_nobetci2_blade` "Buzlu Kılıç": string `[ {1.0, 3.4, 100, Slice_Horizontal, .30}, {1.1, gap .25, Slice_Diagonal, .30} ]`, cd 2.6.
`crt_nobetci2_verdict` "Gecikmiş Hüküm": 2H_Melee_Attack_Chop coef 2.6 (1.10) **hold [.30, .55]**, range 4.0, cd 9. `crt_nobetci2_bash` "Buz Kalkanı Darbesi": Block_Attack cone 3.0 arc 80 coef 1.0 + stun .8 + guard poise 30, windup .95 hold [.15,.4], cd 12 (shield drops 1.5 s after). `crt_nobetci2_frost` "Kırağı Çizgisi": marks `sweep` count 3 length 8 coef 1.6 frost, cd 16.
`enrage` unlocks `crt_nobetci2_stab` third string hit (Stab coef 1.4). `onBreak { dropFrontBlock, disableSec 8, disable [bash] }`. Answer: parry the string opener; the verdict is a trap for early dodgers.

**21 Mahzen Celladı** — Basic `crt_cellat2_blade` "Cellat Kılıcı": 3-strike `[ {1.1, 3.8, 110, 2H Slice}, {1.3, gap .3, 2H Chop}, {1.5, gap .35, 2H Spin, self circle r 3.2} ]`, cd 3.6.
`crt_cellat2_head` "Kafa Uçuran": range 4.2, coef 3.0 (1.20) **hold [.30, .60]**, cd 12 (parry = 90 poise). `crt_cellat2_leap` "Atlayan Kıyım": leap min 4 max 12 airtime .55 radius 3.4 coef 2.4 (1.05) track .7, anim 1H_Melee_Attack_Jump_Chop, cd 12.
`crt_cellat2_call` "Kemik Çağrısı": summon 2 `skel_minion`, hpBelow .5, once. Enrage: spin string cd −35 %, eyes glow.

**22 Cehennem Muhafızı** — Basic `crt_muhafiz_claws` "Pençe Kombosu": string ×3 (Attack, speeds 1.0/1.2/0.9) `[1.0, 1.0, 1.6]`, cone 4.2, cd 3.2, finisher knockback 4.
`crt_muhafiz_leap` "Cehennem Sıçrayışı": leap min 5 max 16 airtime .6 radius 4.0 coef 2.8 (1.15) track .8, after: fire ring persist 4 s tick .5 coef .3, cd 14, anim Jump. `crt_muhafiz_hook` "Zincir Kancası": grab with `pull 9` hitscan line 12, hold 1.0, slam coef 2.6 radius 2.4, cd 18.
`crt_muhafiz_circle` "Alev Çemberi": `ringSafe` radius 9 danger everywhere except a green circle r 2.2 at random, coef 2.0, windup 1.4, cd 20, anim Jump. Enrage: leap cd −30 %, atkSpeed +30 %.

**23 Ağıt Çağırıcı** — summoner, flying hover 0.6, backstabbable. Basic `crt_agit_touch` "Ağıt Dokunuşu": cone 3.0 arc 100 coef 1.0 shadow (.70) cd 2.6.
`crt_agit_call` "Ruh Çağrısı": summon 3 `shade`, castTime 2.0 interruptible **kick 2**, cd 22 (only when no add alive). `crt_agit_scream` "Ağıt Çığlığı": cone 9 arc 90 coef 1.6 shadow + `fear` 1.2 s, castTime 1.6 interruptible **kick 1**, X, cd 14.
`crt_agit_blink` "Hayalet Dalışı": `hide 0.8`, marks single circle r 2.4 behind the target (marker 0.8), then a 2-strike `[ {1.2}, {1.4, gap .3} ]` from the new position, cd 16, anim Cast/Attack. Enrage: `marks rain` count 6 shadow (Yas Fırtınası) replaces the call.

**24 Kızıl Ejder Yavrusu** — ground-bound dragonling. Basic `crt_yavru_claws` "Pençe": string `[ {1.0, 4.0, 100, Attack, .60}, {1.1, gap .25, 4.5, arc 200 tail, Attack2, .65} ]`, cd 3.0.
`crt_yavru_breath` "Alev Soluğu": cone 12 arc 50 coef 2.2 fire, windup 1.4 (X), leaves `persist` strip 3 s, anim Cast impact 1.6, cd 14. `crt_yavru_dive` "Kanat Dalışı": rush length 14 width 2.4 coef 2.2 (1.05), wallStun 2.0, cd 13, anim Attack.
`enrage { anim Enrage, cdMult .7, roar 1.0 }`: breath count doubles (two cones 40° apart). `onBreak { windowMult 1.2 }`.

---------------------------------------------------------------------------------------------------------------------

## 8. Pools and spawn tables

```ts
// src/data/creatures/pools.ts
export interface PoolMember { id: string; weight: number; min?: number; max?: number }
export interface CreaturePool { id: string; bands: [number, number]; members: PoolMember[]; recipes: string[]; elites: PoolMember[]; guardians?: PoolMember[]; zone?: string }
export const GUARDIAN_PROMOTE = { elite: { hpMult: 3.0, poiseMult: 2.2, scale: 1.2, rank: 'miniboss' as const } };
```
### 8.1 Open world 30–60 (`zone` ids from `data/world/karakir.ts`; map 3 does not exist yet, see open question 2)
| Pool | Levels | Trash (weight) | Elites | Guardians (rare lairs) | Recipes |
|---|---|---|---|---|---|
| `ow_karakir_steppe` (Karakır Bozkırı) | 30–37 | Bozkır Avcısı 30, Puglin Akıncı 22, Toprak Çıyanı 16, Zehir Örümceği 14, Harabe Gözcüsü 10, Kızgın Çırak 8 | Bozkır Mamutu, Yapışkan Çamur, Zincir Celladı (from 32) | – | leader_pack, ambush_nest, brute_pair, ranged_picket |
| `ow_ayaz_etegi` (Ayaz Eteği) | 38–45 | Buz Nişancısı 24, Ayaz Büyücüsü 20, Mağara Sürüsü 18, Bozkır Avcısı 12 (white tint camp), Mezar Nöbetçisi 14, Kanlı Rahip 12 | Kutup Ayısı, Kar Devi, Zincir Celladı | Donmuş Nöbetçi | anchor_caster, healer_line, swarm_rush, brute_pair |
| `ow_kadim_46_60` (provisional: map 3 / Kahramanlık+Mitik outdoors) | 46–60 | Mezar Nöbetçisi 18, Çürük İşçi 14, Kanlı Rahip 12, Harabe Gözcüsü 14, Kızgın Çırak 12, Ayaz Büyücüsü 10, Mağara Sürüsü 10, Zehir Örümceği 10 | Taş Bekçi, Kor Ruhu, Zincir Celladı, Kar Devi | Cehennem Muhafızı, Ağıt Çağırıcı, Kızıl Ejder Yavrusu, Mahzen Celladı | all |
Camp authoring uses `data/world/camps.ts` expand (`{enemyId,count}`); a camp = one recipe instantiated (`instantiateRecipe(recipeId, pool, rng)` helper in `pools.ts`, deterministic with the camp seed so peers agree: ARCHITECTURE rule 6).
Open-world defs ignore `forces`; leash 40 and `homeRadius` 30 as for existing `ow_*`; dormant ambushers use `sleepRange` 45.

### 8.2 Procedural dungeon themes (CORE §14; `Kadim Yarıklar`)
| Theme | Trash | Elites | Guardians (2 per run, pick 2 distinct) |
|---|---|---|---|
| `crypt` (Mahzen) | Mezar Nöbetçisi, Çürük İşçi, Kanlı Rahip, Mağara Sürüsü, Zehir Örümceği | Taş Bekçi | Mahzen Celladı, Ağıt Çağırıcı |
| `forge` (Dökümhane) | Kızgın Çırak, Harabe Gözcüsü, Kanlı Rahip, Mağara Sürüsü | Zincir Celladı, Kor Ruhu | Cehennem Muhafızı, Kızıl Ejder Yavrusu |
| `frost` (Buzul) | Buz Nişancısı, Ayaz Büyücüsü, Mağara Sürüsü, Mezar Nöbetçisi | Kutup Ayısı, Kar Devi | Donmuş Nöbetçi, promoted Kar Devi |
| `shadow` (Gölge) | Harabe Gözcüsü, Kanlı Rahip, Mezar Nöbetçisi, Mağara Sürüsü, Zehir Örümceği | Taş Bekçi, Kor Ruhu | Ağıt Çağırıcı, Mahzen Celladı |
| `wild` (Yabani) | Bozkır Avcısı, Toprak Çıyanı, Puglin Akıncı, Zehir Örümceği, Mağara Sürüsü | Bozkır Mamutu, Yapışkan Çamur, Kutup Ayısı | Kızıl Ejder Yavrusu, promoted Bozkır Mamutu |
| `ruin` (Harabe) | Harabe Gözcüsü, Mezar Nöbetçisi, Ayaz Büyücüsü, Kızgın Çırak | Taş Bekçi, Kor Ruhu, Zincir Celladı | Mahzen Celladı, Cehennem Muhafızı |
Room budget: a combat room of 8–14 rooms rolls 1–2 recipes (3–7 members); mini-boss rooms use one guardian + its adds; difficulty modifiers (Normal/Kahramanlık/Mitik) scale level, hp/dmg as the existing M+ formulas (CORE §6) minus keystone affixes.
`GUARDIAN_PROMOTE`: an elite promoted to guardian gets ×3.0 hp, ×2.2 poise, ×1.2 scale and the enrage block of the nearest guardian template; its move list is unchanged.
The procgen spec (GDD_PROCGEN.md, not yet written) consumes `CREATURE_POOLS[themeId]`, `PACK_RECIPES`, `GUARDIAN_POOLS[themeId]` and `instantiateRecipe`; no other coupling.

### 8.3 Season dungeons
The 8 hand-crafted M+ dungeons keep their own rosters (`docs/dungeons/*.md`); `crt_*` do not appear in M+ keys (forces 0). They MAY be reused as levelling-dungeon trash upgrades after the QA pass (not planned here).

---------------------------------------------------------------------------------------------------------------------

## 9. Files and owners

| File | Owner (module) | Change |
|---|---|---|
| `src/types/enemies.ts` | core | append `MoveSpec`, `StrikeStep`, `EnrageSpec`, `BreakSpec`, `RoleId`, `EnemyAbility.move?`, `EnemyDef.enrage?/onBreak?`, `EnemyAiHints` additions |
| `src/types/net.ts`, `src/net/codec.ts` | core / net | `EnemySyncState.p/en`, codec appends slots, back compatible |
| `src/entities/Enemy.ts` | enemies | `getSyncState`/`applySyncState` p/en, hold replay (`shot` fields), enrage aura/tint |
| `src/ai/moves.ts` (NEW) | enemies | `MoveRunner`, windup helpers, `ENEMY_RULES` |
| `src/ai/roles.ts` (NEW) | enemies | `ROLE_TICK`, `ROLE_PASSIVES`, healer/frontBlock/enrage helpers |
| `src/ai/EnemyAI.ts`, `EnemyDirector.ts`, `abilities.ts` | enemies | call sites (`begin/tick/abort`), swing tokens, tell colour, `applyBreakCost`, passives merge |
| `src/combat/HitShapes.ts` | combat | `tell/sync/grab/gate/seq`, `visLag`, `tellPulse`, grab local state, pending cancel |
| `src/combat/Combat.ts`, `poise.ts` | combat | `forcePoiseBreak`, `applyRemotePoise`, `staggerFrac/isStaggerBroken` guest path, `breakSeconds` windowMult, `endBreak` cost |
| `src/net/NetSession.ts` | net | `maxPartyRttMs()`, `peerRttMs(id)` getters |
| `src/entities/EnemyFactory.ts` | enemies | `ecast` receiver adds `visLag`; snap/spawn untouched |
| `src/data/creatures/{moves,trash,elites,guardians,pools,index}.ts` (NEW) | enemies (data) | builders, 24 defs, pools |
| `src/data/enemies.ts` | enemies | +1 line `Object.assign(ENEMIES, CREATURES)` at the end (before `getEnemyDef`) |
| `src/data/families.ts`, `data/abilityTips.ts` | items / enemies | `BY_ID` rows, Appendix C tips |
| `src/types/vfx.ts`, `types/audio.ts`, `vfx/aliases.ts`, `audio/aliases.ts` | core / vfx-audio | Appendix B ids as aliases of existing presets |
| `tools/content-check.mjs` | tools | creature rules (section 10.3) |
| `src/dev/enemies.ts` | enemies | creature gallery params, net latency hooks |
Public API additions must be documented in each owner's final report (golden rule 1).

---------------------------------------------------------------------------------------------------------------------

## 10. Haiku packages (file-disjoint, waves of ≤ 3)

Process (review policy): after each wave Sonnet reviews the diff, the orchestrator spot-checks, Haiku fixes; `npx tsc --noEmit` must pass at wave end; no per-agent browser tests; ONE Haiku QA pass after wave 5 (low-CPU rule).

### Wave 1 — contracts and tooling (3 in parallel)
| Pkg | Files (exclusive) | Work | Verify |
|---|---|---|---|
| **CR1 contracts** | `src/types/enemies.ts`, `src/types/net.ts`, `src/net/codec.ts`, `src/core/events.ts` | Appendix A types verbatim; codec appends `p`,`en` after `shotSeq` (flag bit 16), decoder accepts 12-slot old form; events `enemy:enrage {enemyId}`, `enemy:wallhit {enemyId}`, `grab:caught {sourceId,hold}`, `grab:released {reason}` | tsc clean; `node` round-trip test of encode/decode for old and new snap arrays (inline script, no browser) |
| **CR2 net-aware telegraphs** | `src/combat/HitShapes.ts`, `src/net/NetSession.ts` | 6.3 fields + `visLag`, `tellPulse`, grab/gate local state, pending cancel, activeCount cap 48, NetSession `maxPartyRttMs()/peerRttMs()` | tsc; offline path byte-identical (lags 0): grep that `lag` is 0 when `!G.net` |
| **CR3 tooling** | `tools/content-check.mjs`, `tools/glb-inspect.mjs` (read only) | rules 10.3 as hard errors for ids starting `crt_`, `--windup` report for all defs | `node tools/content-check.mjs` runs on the current repo (0 crt_ yet) |

### Wave 2 — engine (3 in parallel, depends on wave 1)
| Pkg | Files | Work | Verify |
|---|---|---|---|
| **CR4 move runner + roles** | `src/ai/moves.ts` (new), `src/ai/roles.ts` (new), `src/ai/EnemyAI.ts`, `src/ai/EnemyDirector.ts`, `src/ai/abilities.ts` | sections 3.1–3.10, 4.1: `MoveRunner` begin/tick/abort, tokens, rush wall detect (calls `G.combat.forcePoiseBreak`), enrage passive, role ticks, tell colour in `shape()` | tsc; a scratch `tools/moves-sim.mjs` (pure functions: windupFor, rollHold ∈ [min,max], pickLanding clamps) |
| **CR5 poise + sync** | `src/combat/Combat.ts`, `src/combat/poise.ts`, `src/entities/Enemy.ts`, `src/entities/EnemyFactory.ts` | 5.2–5.3 + `ecast` visLag + hold replay (`shot` fields, `anim.freezeUntil`), enrage flag display | tsc; unit script for `breakSeconds` windowMult, `staggerFrac` guest path |
| **CR6 builders + data skeleton** | `src/data/creatures/moves.ts`, `src/data/creatures/pools.ts`, `src/data/creatures/index.ts` | typed builders `string3/strike/delayed/jumpSlam/rush/grab/marks/enrageOf/onBreakOf`, `windupFor` re-export, pool/recipe types + `instantiateRecipe`, empty `CREATURES = {}` | tsc; `node` import test creating one dummy def per builder and asserting `windup ≥ windupFor(coef)` |
(CR4 and CR5 touch different files; CR4 calls `forcePoiseBreak` that CR5 adds: declare it in the doc contract so each compiles; wave-end tsc covers both.)

### Wave 3 — the roster (3 in parallel, depends on wave 2)
| Pkg | File | Work |
|---|---|---|
| **CR7 trash** | `src/data/creatures/trash.ts` | defs 1–12 from 7.2 |
| **CR8 elites** | `src/data/creatures/elites.ts` | defs 13–19 from 7.3 |
| **CR9 guardians** | `src/data/creatures/guardians.ts` | defs 20–24 from 7.4 |
Each exports an array/record merged by `index.ts`. Verify: `node tools/content-check.mjs` (rules 10.3), `npx tsc --noEmit`, `node tools/verify-monsters.mjs` unaffected.

### Wave 4 — integration (3 in parallel)
| Pkg | Files | Work |
|---|---|---|
| **CR10 registry + pools** | `src/data/enemies.ts` (1 line), `src/data/families.ts`, `src/data/creatures/pools.ts` (fill 8.1/8.2 tables), `src/data/abilityTips.ts` | merge `CREATURES`, family rows, pool data, Appendix C tips |
| **CR11 vfx/sfx ids** | `src/types/vfx.ts`, `src/types/audio.ts`, `src/vfx/aliases.ts`, `src/audio/aliases.ts` | Appendix B aliases (no new presets) |
| **CR12 dev page** | `src/dev/enemies.ts` | `?creature=<id>` spawns one in front of the player, `?pool=<id>` spawns a recipe, `window.dev.autoParry`, `?netdbg` overlay for `landDelayError` |

### Wave 5 — QA (single Haiku, once)
Runs the 6.6 protocol and a creature smoke: every def spawns, every ability fires once, no console errors, windup rule holds, parry/riposte on a string, wall punish, grab release by break, guest poise bar visible. Reports a table; fixes come back as small Haiku fixes (policy).

### 10.3 content-check rules for `crt_*` (hard errors unless noted)
1. unique ids, model file exists (source path), all clips used by `anim`/`anims` exist in the GLB (`glb-inspect` JSON), `scale` 0.4–2.2.
2. every melee-like ability: `windup ≥ windupFor(coef)` (strings: strike 0, follow-ups ≥ 0.30), swarm ≥ 0.45; perilous `windup ≥ 1.0`.
3. interruptible casts: `castTime ≥ 1.0`; rooting grabs: `hold ≥ 1.0` (pull-only grabs exempt); delayed hold ≤ 0.60; ≤ 8 shapes per marks cast; persist tick ≥ 0.4.
4. every kick-flagged ability has `interruptible: true`; healers have exactly one heal ability with `kick: 2`.
5. every rank elite/miniboss has `poise` and an `enrage` or an explicit `enrage: false`; every grab/rush with wall punish has `onBreak` or a note.
6. warn: cycle coef/s above the 1.3 budget; ability id not in `ABILITY_TIPS` when the ability is avoidable.
7. pools reference existing ids, bands inside 1–60, every guardian pool entry has rank miniboss or is a promotable elite.

---------------------------------------------------------------------------------------------------------------------

## 11. Migration notes
- All schema additions are optional: old defs, saves, dungeon data and the replication wire format keep working (codec accepts both snap forms; guests ignore unknown `shot` fields).
- Old ↔ new clients in one room: not supported (protocol version bump recommended with CR1; `NET.PROTOCOL` if present).
- The windup floor is gated by `ENEMY_RULES.windupFloor`; leaving it on retunes existing melee enemies (those below `0.45 + 0.25 coef`). Recommended rollout: ON for `crt_*` only first (set `ENEMY_RULES.floorIds = /^crt_/`), run `content-check --windup`, then decide the retrofit (open question 1).
- `Affixes.isMeleeHit` matches ability by name/id: keep `ab.name`/`ab.id` unique and strings `kind: 'melee'`; a leap/grab with `kind: 'ground_aoe'` is not decorated (no Necrotic stacks), strings are.
- Poise on guests changes nameplates/target frames from empty to live bars: tell QA to expect new visuals on guests.
- Voxel: the 24 models all have voxel twins; `scale` was picked near each model's median in existing defs (warg 0.95, wolf 0.8, ooze 1.0, Orc 0.9–1.65, rhino 0.42–0.95, Skeleton 1.0, Knight 1.1). Mammoth (new, 1.0), Yeti (1.5), Demon (1.7), kizil_ejder whelp (0.55) are NEW size uses: check cube size in `dev/enemies.html` and adjust `scale` before the art pass; the voxel cell of a model is fixed at conversion, a bigger scale only means bigger cubes.
- Loot: `loot_cr_elite` and `loot_cr_guardian` tables must exist in `data/loot.ts` (items owner); if `LootSystem` already falls back by rank, use the fallback and drop the ids.
- Bestiary/codex rows (`save.bestiary`) are created lazily on first kill; family rows for `crt_*` go to `families.ts BY_ID` so family bounties count them (beast, spider(insect), ghost, skeleton, golem, demon, bandit).
- Existing `ow_*` / `skel_*` ids are untouched; nothing is renamed.

---------------------------------------------------------------------------------------------------------------------

## 12. Open questions
1. Retrofit the windup floor (`0.45 + 0.25 coef`) and swing tokens onto all existing defs now, or only `crt_*` first? (affects balance of the whole game)
2. "Open world 30–60": Karakır Bozkırı is 30–45; 46–60 has no map yet (ROADMAP "third map"). Is `ow_kadim_46_60` just a provisional pool for outdoor Kahramanlık/Mitik content?
3. GDD_PROCGEN.md does not exist: are the six themes (crypt, forge, frost, shadow, wild, ruin) final, and may procgen own the guardian promotion rule?
4. Grabs cannot be escaped by dodge once caught (design choice): acceptable for a co-op ARPG, or give a 0.5 s late-dodge escape?
5. Parry window is 0.20 s while delayed swings hold up to 0.60 s: widen to 0.25 s for `hold` attacks, or keep the trap?
6. Ship the poise replication in `snap` (this spec) or a dedicated low-rate channel (needs `KNOWN_CHANNELS` entry)?
7. Loot ids `loot_cr_*` vs rank fallback (items owner)?
8. Do guardians scale poise by party size (existing `1 + 0.5 (n − 1)`) AND hp by `partyHp` (0.6/0.7): intended double scaling?

---------------------------------------------------------------------------------------------------------------------

## Appendix A — types (paste into `src/types/enemies.ts`, append-only)
```ts
export type RoleId = 'skirmisher' | 'brute' | 'shielder' | 'caster' | 'healer' | 'ambusher' | 'summoner' | 'leader' | 'swarm';

export interface StrikeStep {
  coef: number; range: number; arc: number; anim: string; impact: number;
  windup?: number; gap?: number; lunge?: number; knockback?: number;
  type?: DamageType; statuses?: StatusApply[]; parryable?: boolean;
  shape?: TelegraphShape;              // default cone(range, arc)
}
export interface MarksSpec {
  pattern: 'rain' | 'sweep' | 'cross' | 'ringSafe' | 'spiral' | 'zone';
  count: number; radius: number; spacing: number; first: number;
  aim: 'target' | 'predict' | 'around' | 'self';
  coef: number; type?: DamageType;
  persist?: { duration: number; tick: number };
  safeAt?: 'target' | 'random'; safeRadius?: number; origin?: 'self' | 'landing';
}
export interface MoveSpec {
  string?: StrikeStep[];
  hold?: [number, number];
  leap?: { min: number; max: number; airtime: number; radius: number; track: number; after?: MarksSpec };
  rush?: { length: number; width: number; speed: number; track: number; wallStun: number; trail?: { coef: number; duration: number } };
  grab?: { range: number; arc: number; hold: number; slam: { coef: number; radius: number; type?: DamageType; knockback?: number }; pull?: number; releaseDamageFrac?: number };
  marks?: MarksSpec;
  hide?: number;
  retreat?: number;
  tell?: number;
  tokens?: number;                      // swing tokens this move needs (default 1 for melee-like, 0 otherwise)
  sync?: boolean;                       // animation-bound (default true except marks/hitscan/zones)
}
export interface EnrageSpec { at: number; atkSpeed?: number; speed?: number; damage?: number; roar?: number; anim?: string; unlock?: string[]; cdMult?: number; tintPulse?: number; aura?: VfxId }
export interface BreakSpec { windowMult?: number; disable?: string[]; disableSec?: number; cdAdd?: Record<string, number>; anim?: string; dropFrontBlock?: boolean; spawn?: { enemyId: string; count: number }; once?: boolean }

// EnemyAbility += move?: MoveSpec;   (params.enraged: 1 = only after enrage; params.noFloor: 1 = skip the windup floor)
// EnemyDef     += enrage?: EnrageSpec | false; onBreak?: BreakSpec;
// EnemyAiHints += role2?: RoleId; hitRun?: [number, number]; turnRate?: number; frontBlock?: { arc: number; mult: number }; healer?: { prio: number; keepAway?: number };
```
```ts
// combat/HitShapes.ts HitShapeSpec += 
tell?: number; sync?: boolean; grab?: { hold: number }; gate?: { grabShape: number }; seq?: number; dbg?: number;
// entities/Enemy.ts EnemySyncState += 
p?: number;   // poise fill 0..255
en?: number;  // bit1 broken, bit2 enraged, bit4 frontBlock, bit8 hold pose
```
Builder signatures (`src/data/creatures/moves.ts`, all return `EnemyAbility`; first arg is always `id, name`):
`W(coef)`, `FW(coef)` · `strike(id,name,range,arc,cd,coef,anim,impact,o?)` · `string(id,name,cd,steps,o?)` · `delayed(ability, [min,max])` · `jumpSlam(id,name,{min,max,airtime,radius,coef,track,after?},cd,anim,impact,o?)` ·
`rush(id,name,{length,width,speed?,coef,track,wallStun},cd,anim,impact,o?)` · `grab(id,name,{range,arc,hold,slam,pull?},cd,anim,impact,o?)` · `marks(id,name,spec,cd,anim,impact,o?)` · `enrageOf(spec)` · `breakOf(spec)` · `swarmBite/swarmDive` helpers.
Every builder fills `windup` from the rule unless the caller passes one that is longer.

## Appendix B — new ids (aliases only; implementers add no new presets)
- SFX: `enemy_windup` → alias of existing `whoosh` pitch 0.8 (volume 0.5); `grab_catch` → `block` pitch 0.7; `enemy_roar` → `boss_roar` (pitch by size); `wall_crash` → `ground_slam`/`block` mix.
- VFX: `windup_pulse` (flash helper, uses `G.vfx.flash`, no preset); `grab_hold` → `shield_bubble` red tint on the caught player; `ground_marker` unchanged (`G.vfx.telegraph`); `enrage_aura` / `stance_break_shards` / `perilous_mark` already exist.
- Events: see CR1. Settings: none. Net channels: none. Input: none.

## Appendix C — death-recap tips (`data/abilityTips.ts`, TR, ≤ 60 chars)
`crt_avci_lunge` "Atılışı siper al ya da yana kaç." · `crt_ciyan_ambush` "Kırmızı daireden çık." · `crt_akinci_javelin` "Mızrak yolundan çekil." · `crt_nisanci_lock` "Kilitlenen çizgiden çık." · `crt_nobetci_bash` "Kalkanın yanından saldır, vuruşu savuştur." · `crt_isci_swing` "Gecikmiş vuruşa acele etme." · `crt_cirak_rush` "Yana kaç, duvara çarpsın." · `crt_gozcu_marks` "Durma, işaretler tek seferlik." · `crt_ayaz_lance` "Büyüyü kes (G)." · `crt_ayaz_field` "Donan alandan çık." · `crt_rahip_heal` "Önce rahibi öldür ya da kes." · `crt_surusu_dive` "Etrafını temizle, sırtını duvara ver." · `crt_orumcek_pounce` "İniş dairesinden çık." · `crt_mamut_charge` "Hücumdan yana kaç." · `crt_mamut_stomp` "Halkadan dışarı ya da içine gir." · `crt_camur_engulf` "Yutulmadan kaç, yoksa dayan." · `crt_ayi_slam` "Ayağa kalkınca geri çekil." · `crt_ayi_hug` "Sarılmadan uzak dur." · `crt_devi_leap` "İniş yerinden çık, çapraza geç." · `crt_cellat_chain` "Zincir çizgisinden çık." · `crt_kor_rain` "Yağmuru kes ya da hareket et." · `crt_kor_sweep` "Taramaya dik hareket et." · `crt_bekci_crack` "Çatlak çizgisinin dışına çık." · `crt_nobetci2_verdict` "Erken kaçma, gecikmeye hazır ol." · `crt_cellat2_head` "Bekle, sonra kaç ya da savuştur." · `crt_cellat2_leap` "İniş dairesini terk et." · `crt_muhafiz_leap` "Sıçrayış sonrası halkadan çık." · `crt_muhafiz_hook` "Kancadan kaç, kırmızı çizgi." · `crt_muhafiz_circle` "Yeşil daireye koş." · `crt_agit_scream` "Çığlığı kes (G)." · `crt_agit_blink` "Arkandaki işaretten çık." · `crt_yavru_breath` "Soluğun yanından kaç." · `crt_yavru_dive` "Dalıştan yana kaç."
