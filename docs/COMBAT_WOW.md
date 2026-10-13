# EFSUN ONLINE — COMBAT_WOW: "WoW'dan çal" combat feel pass (ability layer)

> Design addendum (combat designer pass, 2026-10-13). Companion to `GDD_V2.md` §1–3, `GDD_LIFE.md` §5, `GDD_TALENTS.md` §1.3.
> **User request (Turkish, verbatim):** "combat hissi zayıf, onu geliştir, WoW'u araştır, WoW'daki şeyleri çal, direkt ekle, geliştir".
> The user also showed WoW ElvUI action bars and a Details! meter (`docs/ref/ui/README.md` #1, #2).
> **Rule of the pass:** the ARPG/Elden Ring layer (LMB chains, heavy charge, guard/parry/riposte, poise, finisher, dodge) STAYS as it is. We add a
> WoW **ability layer** on top (GCD, spell queue, procs with glow, builders/spenders, cast stakes, interrupts, combat text, button feedback).
> Scope: the 4 playable classes (Şövalye, Barbar, Büyücü with Ateş/Buz/Gizem, Haydut). Code was read, not changed. File:line citations are from the
> tree of 2026-10-13.

---

## 0. TL;DR

1. **Melee hit weight is already good** (GDD_LIFE §5 shipped: hit-stop v2, selective freeze, flash, jiggle, combo tiers, slow-mo). What feels weak is the
   **ability layer**: the GCD is decoration (0.3 s < animation lock), there is no spell queue, presses take 0.25–0.8 s to land, every class spams one
   zero-cooldown resource dump, procs are invisible (and the headline mage proc almost never fires), spell impacts are feather-light and sound like
   casts, combat text ignores damage school, and the bar gives no proc / range / queue / lockout feedback.
2. **Five skills used by the mage default bars do not exist** (`mage_flame_wave`, `mage_ice_lance`, `mage_icy_veins`, `mage_combustion`, `mage_time_warp`): the Ateş bar loses
   3 of 11 slots, Buz loses 3 of 11 (including its RMB), Gizem loses 1 (m180), and Sıcak Seri has no main spender. Content, not tuning, is the biggest hole.
3. **Steal list (all adapted, numbers in §2):** GCD with haste and off-GCD tier · 400 ms spell queue · press→effect budget (≤ 0.14 s instants) ·
   cast bars with pushback (+0.5 s ×2) and channel cut (25 % ×2) · interrupt + school lockout · **procs with a Spell Activation Overlay + golden
   "marching ants" button glow** · builder/spender cap pressure · burst windows from 45/90/180 s majors · school-coloured combat text with crit bounce ·
   ElvUI button states (range red, no-resource blue, queued, locked, usable glow, cooldown text colours) · own-debuff emphasis + refresh window on the
   target frame · per-school sound layering · lighter spell feedback budget than melee.
4. **Refused / adapted:** true auto-attack (LMB chain stays; it becomes the off-GCD builder = WoW auto-attack/filler); hard "cast = rooted" (we
   slow, WoW roots); 1.5 s GCD as default (ships as a switchable profile, default **1.0 s**, because skills are resource-gated and the LMB chain
   fills the gaps); tab-target-only combat (action camera stays).
5. **Plan:** 18 core packages + 2 optional, 6 waves of ≤ 3, no two packages in a wave touch the same file, every package ends with a check registered in
   `dev/combat.html` (`window.dev.wow.run('cwNN.*')`) and `tsc` = 0 errors (§4).

---

## 1. Diagnosis — why our combat feels weak

### 1.1 What already works (do not redo)

| Area | Where | State |
|---|---|---|
| Hit weight table, crit / kill / boss modifiers, per-weapon multipliers | `feel.ts` FEEL / WEIGHT_ROWS / FEEL_WEAPON | good (v2) |
| Selective hit-freeze, 160 ms / 0.3 s budget, camera trauma cap 0.85, kick, FOV kick, slow-mo table | `feel.ts` 27–46, `Combat.flushFeel` 1344–1388 | good |
| Two-stage flash, jiggle/squash, flinch table, death fling | `Combat.showEnemyHit` 1119, `reactEnemy` 1146 | good |
| Combo counter v2, hit marker, parry/riposte/Kritik Vuruş prompts, guard gauge | `ComboTracker.ts`, `Crosshair.ts`, `CombatCues.ts` | good |
| Input buffer 0.3 s for the swing chain, dodge buffer, charge decision | `feel.ts` 69–70, `SkillSystem` 849 / 1357 | good for melee chains |
| Impact sound by material, crit layer, thump layer | `Audio.onDamage` 1187–1248 | good for physical |

### 1.2 Findings

| # | Finding | Evidence | Why it feels weak | Fixed by |
|---|---|---|---|---|
| F01 | **GCD is decoration.** `FEEL.gcd = 0.3`, no haste, no off-GCD concept (only `basic` skips it). The check has a −0.12 s grace, so the real lock is 0.18 s, while every skill's own action lock is 0.30–0.41 s (§1.3). The GCD sweep is a 20 % white overlay | `feel.ts:73`, `SkillSystem.ts:821`, `:1008`, `hud.css:126` | no rhythm, no "this press was a decision", haste/hero_haste do nothing for pacing | CW-02, CW-04 |
| F02 | **No spell queue.** `canUse()` refuses on cooldown/GCD and fires `skill:fail` (error text + `ui_error` sound). The only buffer is "an action is in progress and has not reached its chain point", 0.3 s, last input wins. The roll buffer is a separate 0.35 s `pending` | `SkillSystem.ts:816–834`, `:849`, `:1357–1373`, `:2173`; `PlayerController.ts:803–831` | pressing 100 ms early = error beep + lost press; dead time between abilities; feels unresponsive | CW-02, CW-04 |
| F03 | **Press → effect latency 0.25–0.8 s.** The effect fires at `hitTime/animSpeed`; for instants that is the swing wind-up | §1.3 table; `SkillSystem.ts:986` | WoW instant = effect on the press; ours = a quarter to half a second later; casters feel laggy | CW-01 (primitive), CW-04 |
| F04 | **Flat rotations.** Each default bar has one zero-cooldown resource dump on RMB/E (fireball 12 mana, crossbow 15, cleave 25, Işıltılı Yarma 30, Sırttan Bıçak 25, İnfaz 30) and is limited only by resource. No priority, no payoff states | `data/skills.ts` (cooldown: 0 rows), `data/specs.ts` defaultBar | spam the best button; nothing to read or react to | CW-11, CW-18 |
| F05 | **Procs are invisible, and the headline mage proc is statistically dead.** Sıcak Seri needs **two consecutive** direct fire crits (a non-crit resets the hidden counter). At 11 % crit that is ≈ 1.2 % per hit pair, one proc per ~2–3 minutes at 1 fire hit/s (estimate). No overlay, no button glow anywhere (no `glow`/`overlay` in `ActionBar`/`hud`). Talent procs are mostly stat buffs that all share one generic icon, and the proc engine is a pure RNG roll (no bad-luck protection) | `specs/mage.ts:238–250`, `data/statuses_talents.ts:19–21`, `procActions.ts:94` (BUFF_ICON), `Procs.ts:257` | the WoW "button lights up" moment does not exist | CW-03, CW-07, CW-09, CW-13 |
| F06 | **Spec signature skills are missing.** No `SkillDef` for `mage_flame_wave`, `mage_ice_lance`, `mage_icy_veins`, `mage_combustion`, `mage_time_warp` (the data files admit it). Frost default RMB = `mage_ice_lance` resolves to nothing; Fingers of Frost has no consumer; Sıcak Seri's main spender is absent. Behaviours `bounce_projectile`, `burst_shot`, `target_status` are also missing, so Anka Alevleri does not bounce, Dondurucu Sağanak is one volley, Büyücü Dokunuşu is a plain projectile | `data/specs_talents.ts:6–8, 25, 42, 47`, `data/skills_mage_specs.ts:8–11`, `behaviors.ts` BEHAVIORS (no such keys) | the three mage specs cannot play their own loops | CW-10, CW-14 |
| F07 | **Spell impacts are feather-light and mis-voiced.** `projectile` weight = 0 ms hit-stop, trauma 0.05, flinch 25 %; elites/bosses never flinch; arcane impact plays the *cast* sound (`spell_cast` pitch 0.85) and holy plays `spell_cast` pitch 1.5; the dropped ids `arcane_cast` / `arcane_impact` / `ice_cast` were never built | `feel.ts:27,43,101`, `Combat.ts:1149`, `Audio.ts:1240–1241`, `skills_mage_specs.ts:12–13` | mage hits read as "a number appeared" | CW-12, CW-15, CW-18 |
| F08 | **The ranged attacker freezes on its own impact.** `flushFeel` freezes the attacker for any weight; fireball also carries `hitstop: 52`. The caster stutters ~0.4 s after it fired (during its next cast / movement) | `Combat.ts:1364–1365`, `skills.ts:295` | feels like a hitch, not weight | CW-06 |
| F09 | **Combat text is kind-only.** Style comes from `kind` (normal/crit/dot…); `feedback.ts:86` drops `e.type`, so fire, frost, arcane and physical numbers are the same cream colour. Crit = bigger + shake, no bounce. No resist/absorb/miss variants. `weak` / `resisted` flags and `weak_hit` / `resist_hit` sounds are declared but **nothing emits them**. Every DoT/channel tick makes its own DOM number (Kasırga = 24) | `DamageNumbers.ts:24–36`, `feedback.ts:86`, `core/events.ts:25`, `manifest_feel.ts:40–41` | no school language, no readability in AoE | CW-05, CW-06 |
| F10 | **Action buttons are half-ElvUI.** Have: press flash, cooldown sweep + text, GCD sweep, charges, no-resource blue, failing frame, casting frame, ready pulse. Missing: out-of-range red (the `range` fail text exists but nothing raises it), proc glow, queued state, school-lockout state, cooldown text colour thresholds, spender cap cue | `ActionBar.ts:32–38, 133–221`, `hud.css:104–141` | no information on the bar except cooldown | CW-08 |
| F11 | **Casting has no stakes.** `p.cast` exists, but `onPlayerDamaged` is an empty hook (no pushback), no lockout, no tick marks, and only 3 skills of the 4 classes have a cast time (Gizem Patlaması 0.9, Meteor 0.6, Mucize Karışım 1.0). With no hard casts, "free + instant" procs have nothing to improve | `SkillSystem.ts:699, 1033`, `data/skills*.ts` | no instant-vs-cast contrast; no reason to value an interrupt | CW-07, CW-10, CW-17 |
| F12 | **Interrupts are one-sided.** Kes (weapon art) and Gırtlak Kesme (silence) hit enemies; nothing locks the player's school, enemy interrupts are plain CC | `SkillSystem.ts:1805–1831`, `skills.ts:549–555` | the WoW kick / counter-kick game is absent | CW-07, CW-20 |
| F13 | **Targeting feedback is thin.** Tab / lock-on / soft target (crosshair hover) exist, but there is no focus target, no target-of-target, and the target frame shows 8 mixed buffs+debuffs sorted by remaining time with no own-debuff emphasis and no refresh cue | `PlayerController.ts:1025–1077`, `Nameplates.ts:146`, `TargetFrame.ts:82` | DoT classes cannot read their debuffs | CW-16, CW-19 |
| F14 | **Cooldown readiness has no sound; burst windows have no cue.** Ready pulse exists; `sfx_cd_ready` is an open ARCHITECTURE item; overlapping 45/90 s majors are unannounced | `ActionBar.ts:205`, `ARCHITECTURE.md` open items | the planned WoW burst rhythm is invisible | CW-08, CW-09, CW-12 |

### 1.3 Measured cadence (from `data/skills.ts`, rate 1.0)

`press→effect = hitTime / animSpeed`; `chainAt = effect + chain / animSpeed` (earliest next action).

| Skill | press→effect | chainAt | Note |
|---|---:|---:|---|
| knight_basic_1 / 2 / 3 / 4 | 0.27 / 0.31 / 0.32 / 0.39 s | 0.30 s (step 1) | chain rhythm is good; step 1 is slow to start |
| knight_shield_bash | 0.29 s | 0.35 s | RMB, 3 s CD |
| knight_radiant_cleave | 0.34 s | ~0.41 s | 0 CD, 30 resource |
| barbarian_basic_1 / 4 | 0.29 / 0.59 s | | finisher by design |
| barbarian_cleave / fissure / execute | 0.37 / 0.54 / **0.80 s** | | execute feels like a cast |
| mage_basic_1 | 0.29 s | 0.33 s | |
| mage_fireball | **0.32 s** (+ flight ≈ 0.4 s at 10 m) | **0.41 s** | 0 CD, 12 mana |
| rogue_basic_1 / 2 | 0.26 / 0.32 s | | |
| rogue_crossbow_shot / backstab / eviscerate | 0.29 / 0.29 / 0.34 s | 0.36 s (crossbow) | 0 CD |
| knight_templar_verdict | 0.44 s | | |

Conclusions: (a) skills can fire every 0.35–0.41 s, so the 0.3 s GCD never binds (F01); (b) instants take ~0.3 s to land (F03); (c) pacing is
decided by resource only (F04). WoW's instant lands in ≤ 1 server tick; Diablo-likes land in ~0.2 s.

---

## 2. WoW mechanics to steal

Format per mechanic: **WoW rule** (exact) → **Our rule** → **Code mapping** → **Knobs**. Numbers marked *(web)* were confirmed against
`warcraft.wiki.gg` during this pass; *(memory)* = from game knowledge, not re-verified; sources in Appendix D.

### 2.1 Global cooldown (GCD), haste, off-GCD abilities

* **WoW rule.** Base GCD 1.5 s, started by casting a GCD ability, shown as a clock sweep on every GCD button. Haste shortens it:
  `GCD = max(0.75, 1.5 / (1 + haste))` *(web: haste reduces GCD like cast time, floor 0.75 s; Classic floor is 1.0 s)*. Energy classes (Rogue, Monk, Feral)
  have a 1.0 s GCD not affected by haste *(memory)*. Off-GCD: interrupts, defensives, cooldown trinkets/majors, movement jumps (Charge), potions.
  A cast longer than the GCD simply runs concurrently.
* **Our rule.**
  * Two profiles in `WOW.gcd`: `'arpg'` (**default**): base **1.0 s** for all classes; `'wow'`: base 1.5 s (Haydut 1.0 s fixed). Floor = **0.5 × base**
    (same ratio as WoW's 0.75/1.5). Haste source: `castSpeed` for `spell`-tagged skills, `attackSpeed` for the rest (the existing `speedFactor()`); Haydut is
    fixed (no scaling) as in WoW.
  * Why 1.0 default: skills are already resource-gated (mage regen ≈ 5/s ⇒ ~0.5–1 fireball/s sustained), so 1.0 s only caps *burst* spam
    (8 fireballs in 3.3 s today) without gutting sustained DPS; 1.5 s would make cooldown-less RMB skills worse than the LMB chain unless every
    coefficient is re-based (§4 CW-18 has the sim gate). The `'wow'` profile ships for A/B in the dev panel.
  * **LMB chain stays off-GCD** (it already skips the check as `basic`): it is our "auto-attack / filler between GCDs".
  * **Off-GCD tier** (tag `offgcd`): majors (`m45/m90/m180`), interrupts (Kes), taunts (`*_provoke`, `knight_challenge`), active-mitigation (`knight_shield_block`,
    `barbarian_iron_stance`, `knight_shield_wall`), movement (`knight_charge`, `barbarian_leap`, `mage_blink`, `rogue_shadow_step`), potions, dodge,
    and **Anka Alevleri** (our Fire Blast). Everything else is on-GCD.
  * GCD starts at cast start; a hard cast longer than the GCD runs concurrently.
  * HUD: GCD sweep becomes a visible dark sweep (rgba 0,0,0,.45) with a bright leading edge, no number.
* **Code mapping.** new `combat/gcd.ts` (`gcdFor(profile, classId, speed, def)`, `isOffGcd(def)`); `SkillSystem.startAction` line 1008 replaces `FEEL.gcd`;
  `canUse` line 821 drops the `−0.12`; `getGcd()` (328) already feeds the HUD; `feel.ts` gets the `WOW` constant (Appendix A).
* **Knobs.** `WOW.gcd.profile`, `base`, `floorMul`; per-skill `offgcd` tag; setting `gcdProfile` (Settings).
* **GCD table (arpg profile):** speed 1.00 → 1.00 s · 1.15 → 0.87 · 1.30 (hero_haste / Icy Veins) → 0.77 · 1.60 → 0.63 · ≥ 2.00 → 0.50.

### 2.2 Spell queue window

* **WoW rule.** `SpellQueueWindow` CVar, default **400 ms** *(memory; the web lookup did not confirm the value)*: a spell pressed within the last 400 ms of the GCD, of
  the current cast/channel, or of its own cooldown is queued and fires the instant it becomes legal; one slot, the newest press replaces the old; a
  press earlier than the window is rejected with the normal "not ready" feedback.
* **Our rule.**
  * `WOW.queue.window = 0.40 s`. On press compute `wait = max(gcdLeft (if on-GCD), ownCooldownLeft, actionLeft = max(0, cur.chainAt − elapsed))`.
    `wait ≤ 0` → fire now; `0 < wait ≤ 0.40` → **queue silently** (no `skill:fail`, no error sound); `wait > 0.40` → reject, error text now shows the remaining
    time ("Henüz hazır değil · 1.2 sn").
  * One slot. A queued **skill beats a queued LMB step**; a newer skill press replaces an older queued skill. TTL 0.8 s.
  * Validity (resource, silence, lockout, stun) is re-checked at fire time; an invalid queued press is dropped quietly and the slot flashes red once.
  * Cleared by: dodge roll start, stun/knockdown/fear, death, scene change.
  * The LMB swing-chain buffer (0.3 s, `FEEL.inputBuffer`) is unchanged. The roll `pending` (0.35 s) is unchanged. Held keys re-issue every 0.1 s (controller
    `repeat`), which now simply keeps the queue topped up quietly.
  * HUD: queued slot gets a pulsing white outline (`.queued`).
* **Code mapping.** new `combat/spellQueue.ts` (pure); `SkillSystem.tryStartSkill` 832 / `tryBasic` 853 / aim path 311 call `queue.offer`; `updateLocal` 1357 runs
  `queue.take()` every frame once `!st.cur`; event `skill:queued`.
* **Knobs.** `WOW.queue.window` (0–0.4), setting `spellQueueMs` (0 disables).

### 2.3 Instant-cast responsiveness (press → effect budget)

* **WoW rule.** Animation starts the same frame; an instant's effect lands on the next server tick; the cast bar of a hard cast starts the same frame.
* **Our rule (budget).**

  | Class of press | animation starts | effect / projectile spawn | cast bar |
  |---|---|---|---|
  | Instant skill (castTime 0, not channel, not dash/leap/teleport) | same frame | **≤ 0.14 s** | – |
  | LMB chain steps 1–2 | same frame | ≤ 0.17 s | – |
  | LMB step 3 / finisher, heavy skills (weight ≥ 2), channels | same frame | authored (0.3–0.8 s) – the wind-up is the weight | – |
  | Hard cast (castTime > 0) | same frame | at cast end | same frame |

  Technique **lead skip**: start the clip at `startAt = skip × clipSpeed` where `skip = max(0, hitAt − leadTarget)` and shorten `hitAt/endAt/chainAt/moveAt/faceUntil` by `skip`.
  Minimum hit time 0.08 s. Per-skill override `params.lead` (0 = keep authored). Effect: fireball 0.32 → 0.14 s, knight_basic_1 0.27 → 0.17, crossbow 0.29 → 0.14,
  rogue_basic_1 0.26 → 0.17. Cast-start cue: a short school-voiced `*_cast` sound at the press (not only at release).
* **Code mapping.** `AnimController.PlayOpts.startAt` (core, CW-01); `SkillSystem.startAction` ≈ 984–1046 (timeline + `playOnce`); remote casts keep authored timing.
* **Knobs.** `WOW.lead.instant 0.14`, `.basic 0.17`, `.min 0.08`; setting `leadSkip` (A/B).

### 2.4 Cast bars, pushback, movement

* **WoW rule.** A hard cast shows a cast bar. Each damaging hit (not DoT, not fully absorbed) delays the remaining cast by **0.5 s, the first two times only**; channels
  lose **25 % of their total duration per hit, first two hits only** *(web, Warcraft Wiki "Pushback"; older-era numbers, still the reference)*. Pushback resistance: shields (Power Word:
  Shield), Barkskin, Icy Veins. Moving, jumping, stun, silence or an interrupt cancels a cast; instants and "castable while moving" are exempt.
* **Our rule.**
  * Same pushback numbers; hit must be ≥ 3 % of max HP (chip damage and DoT never push). Per-cast counter, max 2.
  * Immune to pushback while `shield`, `blazing_barrier`, `bastion`, `last_stand`, `iron_stance`, a skill with `params.unstoppable`, or soft stat `pushbackResistPct` ≥ 1.
  * Movement does **not** cancel (action game); a hard cast slows movement (existing `slow`/`root` params) and a **dodge roll cancels for free** (nothing is paid before the hit
    frame, already true). Jump cancels hard casts.
  * Cast times must exist to matter: Alev Dalgası 1.0 s (new), Gizem Patlaması 0.9 s, Meteor 0.6 s, Mucize Karışım 1.0 s; proc payoffs make them instant.
  * Player cast bar (`PlayerCastBar`): shows pushback as a +0.5 s slide with a red flash, `cast_pushback` sound, tick marks for channels, and charge progress for the
    LMB heavy (tier tick at 0.75 s) so "hold LMB" reads as a cast bar.
* **Code mapping.** `SkillSystem.onPlayerDamaged` (line 699, empty, already called from `Combat.ts:1581`); `Action.pushed` counter; `p.cast.duration`; event `cast:pushback`;
  `combat/castRules.ts`; HUD `PlayerFrame.ts` `PlayerCastBar` (203) + `widgets/CastBar.ts`.
* **Knobs.** `WOW.pushback { add 0.5, max 2, minHpFrac 0.03, channelCut 0.25 }`.

### 2.5 Channel ticks

* **WoW rule.** Channels tick at haste-scaled intervals (haste adds ticks), first tick after one interval (some at start), the bar shows tick marks, clipping a channel is allowed
  in the last ~30 %.
* **Our rule.** Tick interval ÷ `speedFactor` (total channel time unchanged ⇒ haste adds ticks; today `every` ignores rate: `SkillSystem.ts:1397`). Each tick: tick-weight number
  merged (§2.11), quiet `tick` sound with pitch +2 % per tick (cap +20 %), channel bar tick marks. Re-pressing a channel key in the last 30 % extends it (Kar Fırtınası).
* **Code mapping.** `SkillSystem.updateAction` 1395–1423; `CastBar.ts` tick marks (CW-17).

### 2.6 Interrupt and school lockout

* **WoW rule.** Interrupt (Counterspell 6 s, Kick 5 s, Pummel 4 s *(memory)*) cancels a cast and **locks that school** for the lockout time; locked buttons show the school icon / colour
  and the remaining seconds; some casts are uninterruptible (grey cast bar).
* **Our rule.**
  * **Player → enemy:** every interrupt (Kes, Gırtlak Kesme, Kalkan Darbesi stun) = cancel + `silence` **3 s** on trash/elite (EnemyAI already refuses abilities while silenced,
    `EnemyAI.ts:836`); boss: cast cancelled, no lockout, poise +20; callout "KESİLDİ!" (exists) + `interrupt` number. Interrupt counts in meters (exists).
  * **Enemy → player (new):** an enemy ability flagged `interruptsCast` (CW-20, optional content) that hits a casting player cancels the cast and applies `lockout`
    (status, 4 s, magnitude = school id from the skill's school tag: fire/frost/arcane/holy/shadow/poison). Locked skills fail with `skill:fail 'lockout'`; action bar shows the school-coloured
    lock + countdown (CW-08).
  * Melee skills have no school and are never locked (our "physical school" exemption keeps warriors playable under silence-like effects).
* **Code mapping.** `SkillSystem.interrupt()` 479, Kes at 1805–1831; `canUse` 816; `StatusDef` `lockout`; `ActionBar` `.locked`.

### 2.7 Procs and the Spell Activation Overlay (the big one)

* **WoW rule.** A proc is a *temporary state that changes one or more buttons* (free, instant, empowered, usable, cooldown reset). It is announced by the **Spell Activation Overlay**:
  a large translucent art piece around the character (per proc: top / left / right / centre) that fades in, pulses, and fades out when consumed or expired, **and** the affected action
  button gets a golden glow border with animated "marching ants" *(web: the overlay is the glowing border; `C_SpellActivationOverlay.IsSpellOverlayed`; Hot Streak, Fingers of Frost,
  Brain Freeze and Sudden Death mechanics from memory)*. Procs are RNG with bad-luck protection and internal cooldowns; payoffs are always available to spend (the spender has no long
  cooldown), so a proc is never wasted by a cooldown.
* **Our rule.** Four layers, all data-driven:
  1. **State** is a status on the player (existing `hot_streak`, `fingers_of_frost`, new ones in §3). Any source (spec hook, talent `T` row, item) just applies the status.
  2. **`ProcDef` table** (`data/procs.ts`): which status, which skills glow, overlay position and school colour, sfx/vfx ids. One row per proc (Appendix B).
  3. **Engine effect** (`combat/procMods.ts`, generic): `PROC_MODS[status] = { skills, costMult, castTimeMult, more, critBonus, forceCrit, cdFree, cdReset, bonusPips, consume, onConsume }`,
     consulted next to the existing mage `castMods()` in `startAction` (SkillSystem 973) and consumed in `pay()` (1058). Mage keeps its own hook table; its glow still comes from `ProcDef`.
  4. **Presentation** (all listen to status state / `proc:gain`, `proc:fade`): `SpellOverlay` HUD widget (≤ 3 overlays), `.glow` ants on the action button, `proc_gain` / `proc_use` sound,
     `proc_burst` vfx on the character, status icon with a *specific* icon (not the generic blessing icon).
  * **Overlay look:** fade-in 0.15 s → pulse (opacity 0.75↔1.0, 1.1 s sine) → on expiry warning (last 1.5 s) flicker 4 Hz → consume: scale 1→1.25 and fade 0.2 s; otherwise fade-out 0.35 s.
    Colour = school (fire `#ff9a3c`, frost `#8fe3ff`, arcane `#ff8fee`, holy `#fff0a0`, physical/shield `#ffe9c8`, bleed/rage `#ff5a4a`, shadow/poison `#9cff7a`). Built from CSS gradients + masks,
    PSX-stepped animation (`steps()`), no new texture assets.
  * **Button glow ("ants"):** 2 px ring, dash 6/4 px, one revolution per 1.4 s, gold `#ffe58a` + outer glow `0 0 10px rgba(255,214,90,.7)`; on proc gain the button pops once (scale 1.12).
  * **Conditional glow (WoW "usable" glow):** Execute-style states without a status: Kasap İdam when target HP < 35 %, Karar Darbesi at ≥ 5 pips, İnfaz at 5 kombo, Sırttan Bıçak while stealthed,
    arcane spender at 4 charges, any spender when its resource ≥ 90 %, riposte window, Kritik Vuruş. Rules live in `GLOW_RULES` (pure functions of player + target).
  * **Bad-luck protection:** `combat/prd.ts` pseudo-random distribution (`p_n = C·n`, `C` solved so the long-run rate equals the nominal chance; test vectors 10 %→0.01475, 20 %→0.0557,
    25 %→0.0847, 30 %→0.1189) wired into `Procs.tryFire` (mean-preserving, removes both dry streaks and double procs).
* **Code mapping.** `data/procs.ts`, `combat/procMods.ts`, `combat/procFx.ts` (`ProcWatcher` emits `proc:gain/fade` from status diffs), `ui/hud/SpellOverlay.ts`, `ActionBar.ts`, `Procs.ts:257`,
  `procActions.ts:94`.

### 2.8 Builders, spenders, pips, cap pressure

* **WoW rule.** Builders generate the class resource / combo points / holy power; spenders consume; wasting resource at the cap is a mistake the UI warns about; pips pop with sound.
* **Our rule.** LMB chain = builder for all four classes (already: knight +4–6 Kararlılık, barbarian +5–8 Öfke, mage +2 mana, rogue +1 kombo per hit). Tag skills `builder` / `spender`.
  At resource ≥ 90 % the best spender glows (soft ants) and the resource bar flashes once; pip gain plays `ui_tab` pitch +4 % per pip; at max pips the finisher glows. Resource gain numbers
  (`mana` kind) are shown small on the player, merged per 0.5 s.
* **Code mapping.** tags in `data/skills.ts` (CW-11); glow rule `resource90` in `GLOW_RULES`; `ComboPoints` / pip UI sound in `ActionBar` (CW-08).

### 2.9 Rotation priority with clear payoffs

Rule of three questions per GCD, in this order: (1) **is a proc / usable glow lit?** press it; (2) **is a resource or pip at cap?** spend it; (3) **is a maintain-debuff inside its refresh
window?** refresh it; else build with LMB. Each spec's priority list in §3 has ≤ 5 lines and each line has a visible trigger (glow, pip, timer). Decision density target: ≥ 3 distinct sensible
buttons inside any 5 s window during a fight.

### 2.10 Cooldown stacking and burst windows

* **WoW rule.** 45 s / 90 s / 3 min cooldowns are aligned so the player lines up bursts (e.g. 1.5 min + 3 min).
* **Our rule.** Our majors are already multiples (m45 ×2 = m90, ×4 = m180): `t = 0` all, `45` m45, `90` m45+m90, `135` m45, `180` all three. Add: (a) **burst window banner**: ≥ 2 offensive major
  statuses active (`zeal`, `wings`, `carnage`, `shadow_blades`, `shadow_veil_cd`, `icy_veins`, `combustion`, `arcane_surge`, `hero_haste`) → small "PATLAMA!" text under the overlay + 0.2 alpha
  edge vignette + `burst_window` sting; (b) **ready ping** for majors and any skill with cooldown ≥ 8 s: `cd_ready` soft chime + existing gold ring (GDD_V2 §2.1 "Ready ping");
  (c) reset-on-boss-pull rules stay (GDD_V2 §2.1).
* **Code mapping.** `SpellOverlay.ts` (banner), `ActionBar.ts` (`skill:ready` emit), audio (CW-12).

### 2.11 Combat text (floating numbers)

* **WoW rule.** Numbers float up from the target; crits are larger with a pop/bounce; colour = school (Physical white-yellow, Holy yellow, Fire orange, Nature green, Frost light blue, Shadow purple,
  Arcane pink); heals green with `+`; absorbs, `Miss`, `Dodge`, `Parry`, `Resist`, `Immune`, `Interrupted` as words; incoming damage in red; options to scale by amount.
* **Our rule.**

  | Element | Rule |
  |---|---|
  | School colour | physical `#fff1d0` · fire `#ffa040` · frost `#8fe3ff` · lightning `#fff05a` · shadow `#c58cff` · poison `#8cff70` · holy `#fff3a8` · arcane `#ff8fee` · true `#ff5a5a` (outline stays dark) |
  | Crit | size ×1.5, text `!`, pop 2.4 → two damped bounces (14 px at 0.18 s, 6 px at 0.34 s), a short ring flash behind the number, weight 900 |
  | Scale by amount | size × clamp(0.85, 1.4, 0.9 + 0.25·log10(amount / playerAvgHit)) (setting `numberStyle`) |
  | DoT / channel ticks | merged into the live number of the same target+skill within 0.45 s (`+= amount`), so Kasırga makes ≤ 2 live numbers per target instead of 24 |
  | Resist | when `resisted` (resist ≥ 50 %): grey-blue italic, ×0.85, text suffix "(direnç)"; when `weak` (resist ≤ −20 %): tinted number + small "ZAYIF!" |
  | New kinds | `absorb` (blue-white, "(emildi) N"), `resist`, `miss` ("Iskaladı"), `interrupt` ("Kesildi", yellow), `mana` (blue, small) |
  | Incoming | red, over the player's head, size by % of max HP (existing `player_hurt`), absorbed part shown as `absorb` |
  | Budget | 48 DOM nodes (existing cap), status words ≤ 3 (existing) |
* **Code mapping.** `DamageNumbers.spawn` gets `opts {type, weak, resisted, merge, big}`; `feedback.ts:86` passes `e.type/e.weak/e.resisted`; `Combat.showEnemyHit` emits the flags (CW-06).

### 2.12 Ability button feedback (ElvUI states)

| State | WoW / ElvUI | Ours |
|---|---|---|
| Press | pushed texture ~0.1 s | exists (`press`, `slot-flash`) |
| Cooldown | spiral + number, bling on ready | exists; add colour thresholds (< 5 s `#ff6a5a`, < 60 s `#ffe27a`, ≥ 60 s white) and a bright leading edge |
| GCD | dim sweep, no number | exists but faint; make it 0.45 black + edge |
| Out of range | icon tinted red | **new** `.oor`: target (hard target, else soft) farther than `range` (+1.5 m melee assist) for skills that need a target |
| Not enough resource | icon tinted blue | exists (`.nores`) |
| Usable proc | golden ants glow | **new** `.glow` (§2.7) |
| Queued | highlighted "checked" | **new** `.queued` |
| School locked | grey + school icon + seconds | **new** `.locked` |
| Cap pressure | – | **new** `.spend` soft glow at resource ≥ 90 % on spenders |
| Casting | checked | exists (`.casting`) |
| Error text | "Spell is not ready yet" | exists; add remaining time and `lockout` text |

### 2.13 Auto-attack — decision

**No true auto-attack.** The action camera, charge/heavy and parry layers need the LMB press to be an explicit act. The LMB chain becomes the WoW auto-attack analogue: off-GCD,
the resource builder, the filler between GCDs, with the existing "hold to auto-chain" setting for tap-averse players. Hold-to-charge (heavy) is mapped onto the cast bar (§2.4) so it is the
WoW "hard cast" of the melee layer.

### 2.14 Targeting: target / focus / tab / soft target

* **WoW rule.** Tab cycles enemies in front, nearest first, combat-flagged first; `/focus` keeps a second target (focus frame + focus cast bar) for interrupts; target-of-target; retail soft
  targets highlight under the reticle.
* **Our rule.** Keep Tab (tap-cycle / hold-lock) and crosshair soft target. Add: (a) **soft-target highlight**: bright ring at the feet + brighter nameplate while hovered (thin outline, no
  arrow); (b) Tab prefers "in front ≤ 60°, engaged with me, nearest", Shift+Tab goes back; (c) **focus target** (`focusTarget` binding) with a small focus frame under the target frame and an
  interruptible cast bar (CW-19, optional); (d) **target-of-target** label on the target frame (who it is hitting, threat colour).
* **Code mapping.** `PlayerController.ts` 1025–1077 and `cycleTarget`; `Nameplates.ts:146`; `TargetFrame.ts`; new `FocusFrame.ts`.

### 2.15 Aura / debuff tracking on the target frame

* **WoW rule.** ElvUI target: big icons for *your* debuffs first, timers with colour thresholds, stack counts, refresh window glow (pandemic: refreshing in the last 30 % keeps the leftover).
* **Our rule.** Split the row: **own debuffs** (`sourceId === me`) first, larger (28 px), bright border; others small and dim; enemy buffs (enrage, shield) in a second row. Timer text uses the same
  colour thresholds as buttons. **Refresh window:** when `remaining < 30 % of duration` the icon pulses gold ("refresh now") and a re-application keeps the leftover (cap 130 % of duration, our pandemic).
* **Code mapping.** `TargetFrame.ts:82` (`StatusRow('all', 8)`), `widgets/StatusRow.ts`, `StatusEffects.apply` refresh rule (CW-16).

### 2.16 Sound design per school

Layers per spell (WoW pattern): **cast-start** (charge / hands) · optional **cast loop** (hard casts, pitch rises with progress) · **release** (whoosh) · **travel** loop (projectiles, quiet) ·
**impact** (school sample) + **body** layer (flesh/armor, volume 0.45) + **crit** layer (`hit_crit` + pitch ×1.1) · **tick** (quiet) · **proc gain** (bell) · **proc use** (pop) · **cd ready** (soft chime).

| School | cast-start | release | impact | notes |
|---|---|---|---|---|
| fire | `fire_cast` (exists) | `fire_whoosh` (exists) | `fire_impact` + `explosion` ×0.25 on big | crackle layer on crit |
| frost | `frost_cast` | `ice_chime` | `frost_impact` (+ `ice_explosion_01` on shatter) | glassy high layer on crit |
| arcane | **new** `arcane_cast` (`sfx/magic/arcane_01..07`, `cast_01.wav`) | `spell_cast` | **new** `arcane_impact` (`sfx/magic/spell_01/02`, pitch 1.1) | stop reusing the cast sound as impact (`Audio.ts:1241`) |
| holy | `holy_cast` (alias) | `choir_sting` low | `holy_impact` | |
| shadow / poison | existing | existing | existing | |
| generic | `proc_gain` (`buff_attack_01` + `shimmer_01`, pitch by school), `proc_use` (`spell_02` pitch 1.4 + thump), `cd_ready` (`shimmer_01` ×0.4), `cast_pushback` (`hit_plate_light_04` pitch 0.7), `cast_interrupted` (`interrupt`) | | | all from existing files, no new assets |

Rules: max 3 impact sounds per 100 ms (existing GDD_LIFE cap), pitch ±6 %, combo pitch +2 %/tier (existing).

### 2.17 Camera and hit-stop budget: light spells, heavy melee

| Hit class | Hit-stop (victim) | Attacker freeze | Trauma | Kick / FOV | Flash | Visual | Number |
|---|---:|---|---:|---|---|---|---|
| Instant spell / projectile | 0 (crit +30) | **never** | ≤ 0.06 | none | school 70 ms | school burst scale 0.45 | school colour |
| Big spell (cast ≥ 0.6 s or CD ≥ 8 s) | 40 | never | 0.14–0.22 at impact | FOV −2° pull on cast start | school 90 ms | big burst + ring | ×1.25 |
| Channel tick | 0 | never | 0.02 (merged) | none | dim 60 ms ≤ 1/0.5 s | small | merged |
| Melee light/medium/finisher/heavy | existing table | existing | existing | existing | existing | existing | normal |
| Major (GDD_V2 §2.3) | none | none | existing | existing punch | vignette | aura | – |
| Crit (any) | +30 (existing) | melee only | +0.12 (existing) | | gold stage 2 | `crit_burst` + ring | bounce |

Totals keep the existing caps: 160 ms hit-stop per 0.3 s, trauma ≤ 0.85. Spells carry their weight through **sound layering, school flash, impact burst and number**, not through time-stop
(WoW's lighter touch).

---

## 3. Per-class / per-spec signature feel

Conventions: **Proc** rows are the data contract for `data/procs.ts` / `PROC_MODS` / spec `fx` `T` rows. "Glow" = which button lights. Statuses are new unless marked *existing*. Durations are WoW-like.
Proc chances use PRD (§2.7). Overlay colour per §2.7.

### 3.1 Şövalye (knight)

**Koruyucu (tank) — identity: active mitigation + the parry layer pays out in the ability layer.**
Loop (priority): 1. **Kalkan Kaldır** (off-GCD, 2 charges) before telegraphed hits, keep ≥ 60 % uptime · 2. **İntikam Hazır glow** → free Kalkan Darbesi · 3. Kalkan Darbesi on CD · 4. Işıltılı Yarma at resource ≥ 60 (dump at ≥ 90, spend-glow) · 5. Yemin Siperi to refresh the absorb · filler LMB chain (builds Kararlılık).

| Proc | Trigger | Effect | Dur | Glow | Overlay |
|---|---|---|---|---|---|
| `revenge_ready` **İntikam Hazır** | block: 30 % (icd 1.5 s); **perfect parry: 100 %** | next Kalkan Darbesi costs 0, ignores/refunds its cooldown, +40 % damage, threat ×2 | 6 s | RMB | left + right shield-edge, orange-white |
| `riposte` *existing* | parry | LMB Karşı Vuruş (existing prompt) | 1.6 s | LMB ring | centre ring (existing cue) |

Key moments: perfect parry → parry ring + hit-stop 70 (existing) + **İntikam Hazır overlay + RMB ants** (new) → Kalkan Darbesi on proc gets +1 shockwave r 2.2, weight `heavy`;
Shield Kalkan activation → blue bubble + off-GCD click sound; block → `guard_hit` + "Bloklandı" + resource pop; Son Savunma (existing) → gold vignette.

**Kılıç Ustası (DPS) — identity: build Adalet, spend at 5, burst with Gayret/Kanatlar.**
Loop: 1. **Adalet İlhamı glow** → Kutsal Alev Dalgası (free, CD reset, +1 pip) · 2. Wake of Flames on CD (+2 pips) · 3. **Karar Darbesi at ≥ 3, ideal 5 pips** (glow at 5) · 4. Işıltılı Yarma at ≥ 60 resource, keep sunder up · 5. LMB filler · burst: Gayret (m45) → Hüküm Kanatları (m90) with 5 pips banked.

| Proc | Trigger | Effect | Dur | Glow | Overlay |
|---|---|---|---|---|---|
| `art_of_justice` **Adalet İlhamı** | LMB hit, PRD 12 % (icd 2 s) | next Kutsal Alev Dalgası costs 0, its cooldown resets, +1 extra Adalet | 12 s | S1 | top gold-white |
| state `verdict5` | Adalet ≥ 5 | Karar Darbesi glows (≥ 3: soft) | – | RMB | – |

Key moments: Karar Darbesi at 5 pips = weight `heavy`, holy pillar vfx, 115 ms victim stop, small "KARAR!" text; Hüküm Kanatları = existing wings overlay + burst banner when stacked with Gayret.

### 3.2 Barbar (barbarian)

**Savaş Lordu (tank) — identity: rage armour, retaliation.** Loop: 1. **Demir Duruş** (off-GCD) vs physical · 2. **Misilleme glow** → free Yarma that heals · 3. Yarma at rage ≥ 60 · 4. Kan Zırhı reactively · 5. Kasırga for 3+ targets (threat) · filler LMB (rage).

| Proc | Trigger | Effect | Dur | Glow | Overlay |
|---|---|---|---|---|---|
| `wrath_return` **Misilleme** | taking a hit ≥ 3 % max HP, PRD 20 % (icd 3 s) | next Yarma costs 0, heals 4 % max HP, threat ×1.5 | 6 s | RMB | left red edge |

Moments: rage-armour vignette scales with rage %; Yarma on proc: red slash arc big + `heavy_hit` layer + heal number green.

**Kasap (DPS) — identity: bleeds, execute phase, bloodbath detonation.** Loop: 1. Parçala keeps bleeds up (**refresh-glow on the target-frame icon at < 30 %**) · 2. **İdam when the glow lights** (target < 35 % or proc) · 3. Yer Yaran on CD · 4. Kasırga at ≥ 3 targets · 5. LMB rage filler · burst: Kan Banyosu (m45) when ≥ 3 targets carry ≥ 5 stacks (glow) → Katliam (m90).

| Proc | Trigger | Effect | Dur | Glow | Overlay |
|---|---|---|---|---|---|
| `sudden_death` **Ani Ölüm** | melee hit PRD 10 % (icd 3 s), +6 % if target bleeds | next İdam usable at any HP, costs 0, full coefficient | 10 s | S1 | top dark-red |
| state `execute35` | target HP < 35 % | İdam glows (cull < 10 % shows "KESİN!") | – | S1 | – |
| state `bloodbath3` | ≥ 3 enemies with ≥ 5 bleed stacks within 12 m | Kan Banyosu glows | – | M45 | – |

Moments: execute kill → death fling (exists) + red number; each bloodbath detonation → ring + merged number; Sudden Death overlay is the only red top overlay.

### 3.3 Büyücü (mage)

**Ateş — identity: crit chain → Sıcak Seri → free instant hard-casts.**
Loop: 1. **Sıcak Seri glow** → Alev Dalgası / Meteor / Anka (free, instant) · 2. **Isınıyor glow** → Anka Alevleri (off-GCD, guaranteed crit) converts it · 3. Ateş Topu / fire-converted LMB (`Ateş Oku`) builds crits · 4. Alev Dalgası (hard cast, 1.0 s) when no proc · 5. Meteor on CD · burst: **Yanış** (m90, fire always crits) → Hot Streak every 2 casts; Alev Bariyeri (m45) defensive.

| Proc | Trigger | Effect | Dur | Glow | Overlay |
|---|---|---|---|---|---|
| `heating_up` **Isınıyor** | direct fire crit (non-DoT). Persists through non-crits (**changes the dead consecutive-crit rule**) | next fire crit → Sıcak Seri; Anka Alevleri is a guaranteed crit | 10 s | S3 (Anka) | left ember, dim orange |
| `hot_streak` **Sıcak Seri** *existing* | `heating_up` + fire crit | Alev Dalgası, Meteor, Anka: free, instant, +25 % crit chance | 8 s | S2, S1, S3 | top bright orange + both sides |

At 11 % crit the new rule gives Isınıyor every ~9 hits and Sıcak Seri within a few seconds of using Anka: roughly one Sıcak Seri per 8–12 s (estimate; sim gate in CW-18).
Moments: Isınıyor = small ember pop + soft `proc_gain`; Sıcak Seri = full overlay + ants on three buttons + `proc_burst` on the hands + bell; the free instant Alev Dalgası = cone vfx +
trauma 0.16, 40 ms victim stop, no attacker freeze; Yanış = `combustion_aura` + warm vignette + burst banner.

**Buz — identity: Fingers of Frost + Brain Freeze → shatter; works on bosses through Kış Soğuğu.**
Loop: 1. **Beyin Donması glow** → Dondurucu Sağanak (free, applies Kış Soğuğu) · 2. **Buz Mızrağı on Parmak / Kış Soğuğu / Donmuş** (×3, +50 % crit) · 3. LMB Buz Oku builds both procs · 4. Buz Halkası to freeze trash (+1 Parmak per frozen enemy) · 5. Kar Fırtınası on groups · burst: Ayaz Damarları (m45, +30 % cast speed, chill 100 %, +2 pierce) → Donmuş Küre (m90).

| Proc | Trigger | Effect | Dur | Glow | Overlay |
|---|---|---|---|---|---|
| `fingers_of_frost` **Buz Parmağı** *existing* | 15 % per direct frost hit, max 2 | Buz Mızrağı treats target as Frozen (×3), +50 % crit | 15 s | RMB | left frost shards (1) / both (2) |
| `brain_freeze` **Beyin Donması** | LMB frost hit or Buz Mızrağı hit, PRD 12 % (icd 3 s) | next Dondurucu Sağanak costs 0 and applies Kış Soğuğu | 12 s | S1 | top pale blue-white |
| `winters_chill` **Kış Soğuğu** (target debuff, own-debuff highlight) | Dondurucu Sağanak hit | next 2 frost hits treat the target as Frozen (shatter) — **not CC, so bosses are valid** | 6 s, 2 stacks | – | – |

Moments: shatter = glass `ice_explosion_01` layer + crit ring + "PARÇALANDI!" (exists) · Parmak gain = chime pitch by stack · Frozen Orb pulses = merged numbers.

**Gizem — identity: charge → burn mana → barrage; Berrak Zihin breaks the mana curve.**
Loop: 1. **Berrak Zihin glow** → free Gizem Patlaması · 2. Blast ×4 (builder, cost rises 25 %/charge) · 3. **Barrage glow at 4 charges** (spender, refunds 2 mana/charge) · 4. keep mana > 40 % (bonus slope) · 5. LMB Gizem Oku as mana filler · burst: Büyücü Dokunuşu (m45) → Gizem Dalgalanması (m90, Blast −50 %).

| Proc | Trigger | Effect | Dur | Glow | Overlay |
|---|---|---|---|---|---|
| `clearcasting` **Berrak Zihin** | arcane hit from LMB or Blast, PRD 8 % (icd 4 s) | next Gizem Patlaması costs 0 (also ignores the per-charge cost increase) | 15 s | RMB | centre violet halo |
| state `arcane4` | Gizem Yükü = 4 | Gizem Barajı glows | – | Q | – |

Moments: each charge = orbiting orb (new `arcane_charge_orb` vfx, follow player) + pitch-stepped chime; Barrage = all orbs fly out, 0.18 trauma, merged refund number "+mana".

### 3.4 Haydut (rogue)

**Suikastçı — identity: stealth openers, bleeds, combo spend at 5.** Loop: 1. **Stealth glow** → Sırttan Bıçak from behind (×2, +3 kombo) · 2. Gırtlak Kesme (silence + bleed 8 s, interrupt) maintained · 3. **Fırsat glow** → free Arbalet Atışı (+1 kombo) · 4. **İnfaz at 5 kombo** (glow) · 5. LMB filler (kombo) · burst: Gölge Bıçakları (m45) → Gölge Dansı (m90): three stealth-opener hits inside the dance.

| Proc | Trigger | Effect | Dur | Glow | Overlay |
|---|---|---|---|---|---|
| `opportunity` **Fırsat** | LMB hit PRD 12 % (icd 2 s) or Sırttan Bıçak hit PRD 25 % | next Arbalet Atışı costs 0, +60 % damage, +1 extra kombo | 10 s | RMB | right yellow-green |
| state `stealthOpener` | `stealth` / `ambush` / `dancer` | Sırttan Bıçak glows | – | E | – |
| state `combo5` | kombo ≥ 5 | İnfaz glows | – | S1 | – |

Moments: opener from stealth = existing `backstab_mark` + gold flash + "ARKADAN!"; 5-kombo İnfaz = weight `heavy`, blood burst, 80 ms stop; Gölge Dansı = black smoke body + burst banner when stacked with Bıçaklar.

**Simyacı (healer) — short pass.** `Karışım Puanı` ≥ 3 makes **Mucize Damla** glow (≥ 5 pulses); heal numbers are green with `+`; Taşan Eczacı (existing overheal) shows a small gold ring on the target frame. Full healer feel belongs to a later pass.

---

## 4. IMPLEMENTATION PLAN

### 4.1 Rules

* Packages are **Haiku-sized**: one owner, ≤ ~150 changed lines, exact files, exact numbers, no design decisions left. Owners follow `ARCHITECTURE.md` (core, combat, vfx-audio, hud, player, enemies).
* **Waves of ≤ 3 packages run in parallel; no two packages in a wave touch the same file** (matrix in 4.4). Anything touching `SkillSystem.ts` / `Combat.ts` / `VFX.ts` / `ActionBar.ts` is alone on that file per wave.
* Shared type files are append-only; all new ids are appended by **CW-01** and **CW-03** up-front so later packages never touch `core/events.ts`, `types/*`.
* **Verification in `dev/combat.html`:** CW-02 creates `src/dev/combat_wow.ts` (panel "WoW Savaş", `window.dev.wow = { checks, run(id), runAll() }`) which auto-loads every `src/dev/wow/*.ts`
  via `import.meta.glob('./wow/*.ts', { eager: true })`. Each package adds its own file `src/dev/wow/cwNN.ts` (a new file, so no conflicts) that registers checks `cwNN.<name>` (PASS/FAIL + message, shown in the dev HUD and in
  `dev.wow.log`). Pure logic also gets a node scenario under `dev/combat-sim/` (`node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/<file>.mjs`). Every package ends with `npx tsc --noEmit` = 0.
* Existing dev API used by the checks: `dev.setClass`, `dev.cast(slot)`, `dev.hold/release`, `dev.wait(sec)`, `dev.spawn`, `dev.log`, `G.events`, `dev.player.statuses.apply(...)`.

### 4.2 Waves

| Wave | Packages (parallel) | Unlocks |
|---|---|---|
| 1 | CW-01 contracts + anim primitive · CW-02 pure logic + dev scaffold · CW-03 proc data + generic mods | ids, `startAt`, GCD/queue/PRD pure code, proc tables, dev harness |
| 2 | CW-04 skill loop A (GCD, queue, lead) · CW-05 combat text · CW-06 Combat.ts feel fixes | the responsiveness + readability win (felt immediately) |
| 3 | CW-07 skill loop B (procs, pushback, interrupt, PRD) · CW-08 action bar states · CW-09 spell overlay + burst banner | procs become visible and playable |
| 4 | CW-10 mage rows (data) · CW-11 melee procs + tags (data) · CW-12 audio | content for 4 classes, school sound |
| 5 | CW-13 mage hooks · CW-14 mage + execute behaviours · CW-15 vfx presets and proc wiring | mage specs complete |
| 6 | CW-16 target frame / aura / nameplate highlight · CW-17 player cast bar · CW-18 tuning + balance gate | polish + numbers |
| 7 (optional) | CW-19 focus / target-of-target / tab polish · CW-20 enemy interrupts | WoW kick game |

Earliest perceptible improvement order (if waves must be cut short): CW-06 → CW-05 → CW-04 → CW-12 → CW-09/CW-03 → CW-10.

### 4.3 Packages

Format: **ID · title** — owner · wave · size · depends. Files. Tasks. Verification.

#### CW-01 · Contracts and animation primitive — core · wave 1 · S · deps: –
* **Files (edit):** `src/core/events.ts`, `src/types/vfx.ts`, `src/types/audio.ts`, `src/core/Settings.ts`, `src/core/Input.ts`, `src/entities/AnimController.ts`.
* **Tasks.**
  1. `events.ts` append: `'proc:gain' {id; status; duration; stacks}`, `'proc:fade' {id; consumed}`, `'skill:queued' {skillId: string | null; slot: string | null}`, `'cast:pushback' {skillId; add; count}`,
     `'skill:lockout' {school; sec}`, `'skill:ready' {skillId; major: boolean}`, `'burst:window' {active: boolean}`; extend `'skill:fail'` with optional `remaining?: number` and add reason `'lockout'`.
  2. `types/vfx.ts`: VFX ids `proc_burst`, `proc_consume`, `cast_hands_fire`, `cast_hands_frost`, `cast_hands_arcane`, `arcane_charge_orb`, `crit_ring`, `lockout_flash`; `DamageNumberKind` += `'absorb' | 'resist' | 'miss' | 'interrupt' | 'mana'`.
  3. `types/audio.ts`: SFX ids `arcane_cast`, `arcane_impact`, `proc_gain`, `proc_use`, `cd_ready`, `cast_pushback`, `cast_interrupted`, `burst_window`.
  4. `Settings.ts`: `gcdProfile: 'arpg' | 'wow'` (default `'arpg'`), `spellQueueMs: number` (400), `abilityGlow: boolean` (true), `leadSkip: boolean` (true), `numberStyle: 'school' | 'classic'` (`'school'`).
  5. `Input.ts`: actions `focusTarget`, `targetPrev` (default `Shift+Tab` chord if the binding table supports it, else `KeyZ` for focus; no change to existing bindings).
  6. `AnimController`: `PlayOpts.startAt?: number` (clip seconds, unscaled); in `playOnce` after `a.reset()` set `a.time = Math.min(opts.startAt ?? 0, clip.duration * 0.9)`.
* **Verification.** `tsc` = 0. Check `cw01.startAt` (in `src/dev/wow/cw01.ts`, registered once CW-02's loader exists; until then run in the console): `dev.player.anim.playOnce('Spellcast_Shoot', {startAt: 0.3})` then read the active action time ≥ 0.3.

#### CW-02 · Pure combat logic and dev scaffold — combat · wave 1 · M · deps: –
* **Files (create):** `src/combat/gcd.ts`, `src/combat/spellQueue.ts`, `src/combat/castRules.ts`, `src/combat/prd.ts`, `src/dev/combat_wow.ts`, `dev/combat-sim/wow_core.mjs`. **(edit):** `src/dev/combat.ts` (one line `import './combat_wow';` placed right after the `(window as ...).dev = api;` statement).
* **Tasks.**
  1. `gcd.ts`: `gcdFor(profile, classId, speed, def) → seconds`; profile tables per §2.1; `isOffGcd(def)` = tag `offgcd` or `isMajorDef`; floor `0.5 × base`; Haydut fixed.
  2. `spellQueue.ts`: `class SpellQueue { window; ttl; offer(wait, entry, now): 'fire' | 'queued' | 'reject'; take(now, readyNow): Entry | null; clear(reason) }` per §2.2 (one slot, skill beats LMB, newest skill replaces).
  3. `castRules.ts`: `pushbackAdd(state, hitFrac, resist) → seconds` (0.5, max 2, min 3 % HP), `channelCut(totalChannel, state)`, `lockoutSchool(def) → school | null` (tags fire/frost/arcane/holy/shadow/poison).
  4. `prd.ts`: `prdC(p)` solved by bisection (cached), `class Prd { roll(key, p, rng) }` mean-preserving; reset per key.
  5. `combat_wow.ts`: panel + `window.dev.wow` as in 4.1; sliders bound to a future `WOW` object (guarded when it does not exist yet).
  6. `wow_core.mjs`: asserts GCD table (§2.1), queue (press at wait 0.39 → queued, 0.41 → reject, skill beats LMB), pushback (3rd hit adds 0, channel cut 25 % ×2), PRD (10 % nominal over 200 k trials within ±0.5 %, test vectors §2.7).
* **Verification.** `node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/wow_core.mjs` prints PASS for every assert; open `dev/combat.html`: panel "WoW Savaş" visible, "Tümünü çalıştır" runs without errors.

#### CW-03 · Proc data and generic proc modifiers — combat (data) · wave 1 · M · deps: –
* **Files (create):** `src/data/procs.ts`, `src/combat/procMods.ts`. **(edit):** `src/types/skills.ts` (append `StatusId`: `heating_up`, `brain_freeze`, `winters_chill`, `clearcasting`, `art_of_justice`, `revenge_ready`, `sudden_death`, `wrath_return`, `opportunity`, `lockout`), `src/data/statuses_talents.ts`.
* **Tasks.**
  1. `statuses_talents.ts`: `StatusDef` for the 10 ids (TR names from §3; icons from the existing set only: `buff-crit`, `buff-haste`, `buff-strength`, `buff-defense`, `buff-blessing`, `debuff-freeze`, `buff-mana-regen`, `debuff-weakness`, `debuff-silence`; `winters_chill` = debuff with `maxStacks 2`; `lockout` = debuff).
  2. `procs.ts`: `interface ProcDef { id; status; name; school; overlay: 'top'|'left'|'right'|'center'|'both'; glow: string[] (skill ids or '@tag'); durationHint; sfxGain?; sfxUse?; vfxGain?; vfxUse?; priority }`; `PROC_DEFS` for every row of Appendix B;
     `GLOW_RULES: Record<string, (p, target) => string[]>` for `resource90`, `pips5`, `execute35`, `stealthOpener`, `combo5`, `arcane4`, `riposteOpen`, `breakFinisher`, `bloodbath3`; helpers `activeProcs(p)`, `glowSkillsOf(p, target) → Set<string>`.
     Glow skill ids that do not exist yet (mage rows) are listed anyway and flagged `pending`.
  3. `procMods.ts`: `interface ProcMod { status; skills: string[]; costMult?; castTimeMult?; more?; critBonus?; forceCrit?; cdFree?; cdReset?; bonusPips?: {id; n}; consume: 'cast'; onConsume?: {healPct?} }`; `PROC_MODS` for the non-mage procs (Appendix B);
     `resolveProcMods(p, def) → merged mods | null`; `consumeProcMods(p, def)`. No SkillSystem edits here (CW-07 wires it).
* **Verification.** `tsc` = 0. Check `cw03.defs`: every `PROC_DEFS.status` has a `STATUSES` entry; every non-pending glow id exists in `SKILLS`; `dev.player.statuses.apply('hot_streak', 8)` ⇒ `activeProcs(player)` returns `hot_streak`; `glowSkillsOf` returns the S1/S2/S3 ids.

#### CW-04 · Skill loop A: GCD, spell queue, lead skip, off-GCD — combat (+ player file) · wave 2 · M · deps: CW-01, CW-02
* **Files (edit):** `src/combat/SkillSystem.ts`, `src/combat/feel.ts`, `src/game/PlayerController.ts`.
* **Tasks.**
  1. `feel.ts`: export `WOW` (Appendix A). Keep `FEEL.gcd` for a `'legacy'` fallback.
  2. `SkillSystem.startAction` (line 1008): `st.gcdTotal = st.gcdUntil - now = gcdFor(...)` unless `isOffGcd(def)`; `canUse` (821): remove the `− 0.12`.
  3. Queue: `tryStartSkill` (832), `tryBasic` (853) and the aim path (311) compute `wait` and call `queue.offer`; on `queued` emit `skill:queued {skillId, slot}`; `updateLocal` (1357): `if (!st.cur) { const e = queue.take(now, canUse(..., false)); if (e) fire }` every frame; clear on `interrupt()` / death. `fail('cooldown')` carries `remaining`.
  4. Lead skip (§2.3): in `startAction` after the timeline is computed, apply `skip`; pass `startAt = skip × clipSpeed` to `playOnce` (line 1043); honour `params.lead`; skip for channel/dash/leap/teleport/charge/airborne and for basic steps 3–4.
  5. `PlayerController.handleSkills` (832–833): non-LMB `repeat` 0.1 → 0.05 (the queue keeps held keys quiet).
* **Verification.** Checks (`src/dev/wow/cw04.ts`, plus `dev/combat-sim/wow_queue.mjs`): `cw04.gcd` — mage `dev.cast('rmb')` twice 0.25 s apart: second is queued (`skill:queued` logged) and starts within 1 frame of `getGcd().remaining == 0`, spacing = `gcdFor` ±1 frame; `cw04.queue` — wait 0.39 s queues, 0.45 s rejects with `remaining` in the payload; `cw04.lead` — measure `skill:cast` → first `damage`/projectile spawn: knight_basic_1 ≤ 0.17 s, mage_fireball ≤ 0.14 s; `cw04.offgcd` — `knight_shield_block` and `mage_blink` pressed inside a GCD fire immediately; manual: hold RMB 3 s on a mage → cadence = GCD, no error text, no `ui_error` spam.

#### CW-05 · Combat text — vfx-audio · wave 2 · M · deps: CW-01
* **Files (edit):** `src/vfx/DamageNumbers.ts`, `src/vfx/feedback.ts`, `src/vfx/VFX.ts` (only the `damageNumber` method signature, line ≈ 878).
* **Tasks.** `spawn(pos, amount, kind, text?, opts?)` with `opts {type, weak, resisted, merge, big}`; school colour table, crit ×1.5 + 2 bounces + `crit_ring` flash, amount scale (setting `numberStyle`), tick merge (0.45 s, key `target:skill`), styles for `absorb/resist/miss/interrupt/mana`; `feedback.ts:86` passes `e.type`, `e.weak`, `e.resisted`, merge key; weak/resist styling per §2.11.
* **Verification.** `cw05.colors`: spawn fire crit / frost / arcane / holy heal / absorb via `G.vfx.damageNumber` and compare computed `color` to §2.11; `cw05.merge`: 24 `dot` damage events on one target in 1 s ⇒ ≤ 4 live `.vfx-dmg` nodes; screenshot (scale 0.4) of a mixed-school pack fight for readability.

#### CW-06 · Combat.ts feel fixes — combat · wave 2 · S · deps: CW-01
* **Files (edit):** `src/combat/Combat.ts`.
* **Tasks.** (1) `noteFeel`/`flushFeel`: do not freeze the **attacker** when the hit is a projectile/spell (`weight === 'projectile'`, `spec.isSpell`, or weapon kind `bow`); victims still freeze (cap 40 ms for projectile weight). (2) `showEnemyHit`: add `weak` / `resisted` to the `damage` event using `data/families.ts:73` resist flags; play `weak_hit` / `resist_hit` (≤ 1 per 0.15 s). (3) Absorbed part of a hit on the player emits a `damage` event with kind `'absorb'`. (4) `numberAt(enemy, 0, 'interrupt', 'KESİLDİ')` where Kes cancels a cast (`SkillSystem.kesAt` already emits the beat).
* **Verification.** `cw06.freeze`: mage fireball on a dummy leaves `player.anim.freezeUntil` untouched, a knight swing still freezes the attacker; `cw06.weak`: dev minion (fire −25 %) ⇒ fire hit event has `weak: true`, poison (+50 %) ⇒ `resisted: true`; `cw06.absorb`: apply `shield` then hit the player ⇒ an `absorb` kind event.

#### CW-07 · Skill loop B: procs, pushback, interrupt/lockout, PRD — combat · wave 3 · L (split in two commits if needed) · deps: CW-02, CW-03, CW-04
* **Files (edit):** `src/combat/SkillSystem.ts`, `src/combat/Procs.ts`, `src/combat/procActions.ts`. **(create):** `src/combat/procFx.ts`.
* **Tasks.**
  1. Proc mods: in `startAction` after `castMods(p, def)` (973) merge `resolveProcMods(p, def)` (cost, cast time, more, critBonus, forceCrit via the same ctx path as `data.mage.critBonus`); in `pay()` (1058): `cdFree` skips `startCooldown`, `cdReset` clears the skill's own cooldown, `bonusPips`, then `consumeProcMods`; `onConsume.healPct` heals.
  2. `procFx.ts`: `class ProcWatcher { update(p, dt) }` diffs `p.statuses` against `PROC_DEFS`, emits `proc:gain` / `proc:fade {consumed}` (consumed = removed with > 0.3 s left); called from `updateLocal`.
  3. Pushback: implement `onPlayerDamaged(p, amount)` (699) per §2.4 (`Action.pushed`, `hitAt/endAt/chainAt/moveAt += 0.5`, `p.cast.duration += 0.5`, channel `until −= 0.25 × channel`, immunities), emit `cast:pushback`.
  4. Lockout / interrupt: `interrupt()` (479) when the cause is an enemy interrupt and the cancelled skill has a school ⇒ apply `lockout` 4 s (magnitude school id), emit `skill:lockout`; `canUse` fails with `'lockout'` for skills of that school; Kes on trash/elite also applies `silence` 3 s on the enemy.
  5. `Procs.tryFire` 257: roll through `Prd` keyed by entry id when `p < 1`; `reset()` clears it.
  6. `procActions.ts:94`: replace the constant `BUFF_ICON` with `iconForStats(stats)` (crit→`buff-crit`, attack/cast speed→`buff-haste`, damage reduction/armor→`buff-defense`, lifesteal→`buff-lifesteal`, damage→`buff-strength`, else blessing).
* **Verification.** `cw07.pushback`: arcane blast (0.9 s), two hits of 10 % max HP ⇒ `p.cast.duration` +0.5 twice, third hit +0, shield ⇒ +0; `cw07.mods`: apply `revenge_ready` to a knight ⇒ `knight_shield_bash` costs 0, no cooldown started, status removed after the cast; `cw07.prd`: 5000 emits of a 10 % row ⇒ rate 9.5–10.5 %, longest dry streak ≤ 30; `cw07.watcher`: apply/remove `hot_streak` ⇒ `proc:gain` then `proc:fade`; `cw07.lockout`: interrupt an arcane cast with the enemy flag ⇒ arcane skill fails with `'lockout'`, a melee skill does not.

#### CW-08 · Action bar states — hud · wave 3 · M · deps: CW-01, CW-03, CW-04
* **Files (edit):** `src/ui/hud/ActionBar.ts`. **(create):** `src/ui/styles/hud-wow.css` (imported by `ActionBar.ts`).
* **Tasks.** Per §2.12: `.queued` (listen `skill:queued`), `.oor` (hard target else `ctx.hover`; edge distance > `def.range` (+1.5 melee assist); only for `melee_arc`/`projectile`/`dash` skills with a target), `.locked` (status `lockout`, school match, countdown text), `.glow` ants from `glowSkillsOf(player, target)` computed once per frame (setting `abilityGlow`), `.spend` at resource ≥ 90 % on `spender`-tagged skills, stronger GCD sweep + leading edge, cooldown text colours, emit `skill:ready {skillId, major}` when a skill with cooldown ≥ 8 s or a major becomes ready (existing `ready` pulse), `FAIL_TEXT.lockout`, remaining time in the error.
* **Verification.** `cw08.states`: emit `skill:queued` ⇒ slot has `.queued`; apply `hot_streak` ⇒ S1/S2/S3 slots `.glow` within 1 frame, remove ⇒ class gone; walk > range from a dummy ⇒ `.oor`; apply `lockout` (arcane) ⇒ arcane slot `.locked`; screenshot (scale 0.4) of the bar with glow + queued + oor.

#### CW-09 · Spell overlay and burst banner — hud · wave 3 · M · deps: CW-01, CW-03
* **Files (create):** `src/ui/hud/SpellOverlay.ts`, `src/ui/styles/hud-overlay.css` (imported by the widget). **(edit):** `src/ui/hud/index.ts` (add the widget after the crosshair).
* **Tasks.** Poll `ctx.player.statuses` against `PROC_DEFS` each frame (works without events); ≤ 3 overlays by `priority`; positions top/left/right/centre/both relative to screen centre − 40 px; animations per §2.7 (fade-in, pulse, expiry flicker, consume flash); school colours; setting `abilityGlow`;
  burst banner "PATLAMA!" + edge vignette when ≥ 2 offensive major statuses are active, emit `burst:window`.
* **Verification.** `cw09.overlay`: apply `hot_streak` ⇒ `.sao[data-id="hot_streak"]` visible in 1 frame; remove ⇒ hidden within 0.5 s; apply 4 procs ⇒ exactly 3 shown; apply `zeal` + `wings` ⇒ banner visible; screenshot (scale 0.4) per overlay position.

#### CW-10 · Mage skill rows — combat (data) · wave 4 · M · deps: CW-03, CW-07
* **Files (edit):** `src/data/skills_mage_specs.ts`, `src/data/specs_talents.ts`.
* **Tasks.** Add five rows (all `spec`-bound as in `specs_talents.ts`; deviations from GDD_V2 §1.3.5 are deliberate and documented here):

  | id | Ad | Slot | Cost | CD | Cast | Target / numbers | Tags |
  |---|---|---|---:|---:|---|---|---|
  | `mage_flame_wave` | Alev Dalgası | Ateş core, unlock 10 | 26 | **0** | **1.0 s hard cast** (GDD had instant 8 s CD; changed so Sıcak Seri's "free + instant" is a real payoff and so the spender is never on cooldown) | cone 80° / 8 m, 3.4 fire, burn 60 %/3 s, knockback 0.8, stagger 14, `hitstop 40`, `shake 0.14`, `weight 4`, anim `Spellcast_Raise` | spell fire aoe spender |
  | `mage_ice_lance` | Buz Mızrağı | Buz core, unlock 10 | 14 | **0** (GDD 1.5 s) | instant | projectile 40 m/s, range 28, pierce 1, 1.6 frost, chill 1 stack, ×3 vs Frozen / Kış Soğuğu / Parmak (existing `frozenMult` hook), anim `Spellcast_Shoot` ×1.3 | spell projectile frost spender |
  | `mage_icy_veins` | Ayaz Damarları | m45 Buz | 0 | 45 | instant, `offgcd` | `self_buff`, status `icy_veins` 10 s (exists), chill 100 %, pierce +2 | major offensive frost buff |
  | `mage_combustion` | Yanış | m90 Ateş | 0 | 90 | instant, `offgcd` | `self_buff`, status `combustion` 12 s, fire always crits, fire ×1.25 (hook in CW-13) | major offensive fire buff |
  | `mage_time_warp` | Zaman Bükülmesi | m180 all mage specs | 0 | 180 | instant, `offgcd` | `behavior: 'major_hero'` (exists), range 40, dur 40, sated 150, anim `Spellcast_Raise` ×1.2 | major hero buff |

  Plus spec params in `specs_talents.ts` (`heatingDur 10`, `phoenixForceCrit 1`, `brainFreezeChance 0.12`, `clearcastChance 0.08`, `clearcastIcd 4`). Add `offgcd` to `mage_phoenix_flames`, `mage_blink`.
* **Verification.** `cw10.rows`: every id in `specs_talents.ts` (`skills`, `majors`, `defaultBar`) resolves in `SKILLS`; `dev.setClass('mage')` + `dev.cast('rmb')` on the Frost bar fires an Ice Lance; Flame Wave shows a 1.0 s cast bar; `dev/combat-sim/skills.mjs mage` reports no missing skill.

#### CW-11 · Melee procs, tags and stat rules — combat (data) · wave 4 · M · deps: CW-03, CW-07
* **Files (edit):** `src/data/specs.ts`, `src/data/skills.ts`, `src/data/statuses.ts`, `src/combat/procMods.ts` (fill the entries CW-03 stubbed).
* **Tasks.**
  1. `specs.ts` `fx` strings (proc engine `T` rows; exact):
     * `knight_blademaster`: `T hit:@basic ch=.12 icd=2 => st(self,art_of_justice,12)`
     * `knight_protector`: `T block ch=.3 icd=1.5 => st(self,revenge_ready,6) ;; T parry => st(self,revenge_ready,6)`
     * `barbarian_butcher`: `T hit:@melee ch=.10 icd=3 => st(self,sudden_death,10) ;; T hit:@melee if=tst:bleed ch=.06 icd=3 => st(self,sudden_death,10)`
     * `barbarian_warlord`: `T hurt ch=.2 icd=3 => st(self,wrath_return,6)`
     * `rogue_assassin`: `T hit:@basic ch=.12 icd=2 => st(self,opportunity,10) ;; T hit:rogue_backstab ch=.25 icd=2 => st(self,opportunity,10)`
  2. `procMods.ts` entries: `revenge_ready` → `knight_shield_bash` {costMult 0, cdFree, more 1.4}; `art_of_justice` → `knight_wake_of_flames` {costMult 0, cdReset, bonusPips adalet +1}; `sudden_death` → `barbarian_execute` {costMult 0, flag `anyHp`};
     `wrath_return` → `barbarian_cleave` {costMult 0, onConsume heal 4 %}; `opportunity` → `rogue_crossbow_shot` {costMult 0, more 1.6, bonusPips combo +1}.
  3. `skills.ts`: tags `builder` (all `*_basic_*`), `spender` (`mage_arcane_barrage`, `knight_templar_verdict`, `rogue_eviscerate`, `barbarian_execute`, `knight_radiant_cleave`, `barbarian_cleave`, `mage_fireball` no), `offgcd` (§2.1 list); `params.lead` overrides where a wind-up is the point (`barbarian_execute` 0, `knight_templar_verdict` 0.3).
  4. `statuses.ts`: `STATUS_RULES` entries `{ stack: 'refresh' }` for the new ids (`winters_chill` `{ stack: 'stack' }` max 2).
* **Verification.** `cw11.procs`: per spec, force the proc status ⇒ the correct button is free for exactly one cast and the status is consumed; `T` rows parse (`parseFx` returns no warnings); sim `dev/combat-sim/specials.mjs` still passes.

#### CW-12 · Audio — vfx-audio · wave 4 · M · deps: CW-01, CW-03, CW-07
* **Files (edit):** `src/audio/manifest_feel.ts`, `src/audio/Audio.ts`, `src/audio/aliases.ts`.
* **Tasks.** Manifest entries from existing files only: `arcane_cast` (`sfx/magic/arcane_01..04.ogg`, `cast_01.wav` layer), `arcane_impact` (`sfx/magic/spell_01/02.ogg` pitch 1.1 + `arcane_05`), `proc_gain` (`buff_attack_01.ogg` + `shimmer_01.mp3` layer, `np: 1`), `proc_use` (`spell_02.ogg` pitch 1.4),
  `cd_ready` (`shimmer_01.mp3` v 0.4, pitch 1.3), `cast_pushback` (`melee/hit_plate_light_04.ogg` pitch 0.7), `cast_interrupted` (alias `interrupt`), `burst_window` (alias `time_warp` low volume). `Audio.onDamage`: arcane → `arcane_impact` (stop reusing `spell_cast`, lines 1240–1241); cast-start cue on `skill:cast` per school (`*_cast`, volume 0.5);
  subscribe `proc:gain` (pitch by school), `proc:fade {consumed}` → `proc_use`, `skill:ready` → `cd_ready` (majors only at full volume), `cast:pushback`, `burst:window`; keep the 3-impacts-per-100 ms cap.
* **Verification.** `cw12.ids`: `sfxResolves` true for every new id (the dev page already prints silent ids at boot); `cw12.events`: emit `proc:gain` / `skill:ready` / `cast:pushback` ⇒ `G.audio.play` called with the expected id (spy on `G.audio.play`); listen: fire crit vs arcane impact are audibly different.

#### CW-13 · Mage hooks — combat · wave 5 · M · deps: CW-10
* **Files (edit):** `src/combat/specs/mage.ts`.
* **Tasks.** Fire: replace the hidden `streak` counter in `onHit` with `heating_up` (apply 10 s on a direct fire crit; a second direct fire crit while it is active ⇒ remove it and apply `hot_streak`; non-crits do **not** clear it); `resolveCast`: `mage_phoenix_flames` with `heating_up` ⇒ `forceCrit`; `combustion` active ⇒ fire spells `forceCrit` and `more ×1.25`; add `mage_flame_wave` handling already in `HOT_STREAK_SKILLS`.
  Frost: `brain_freeze` from LMB / Ice Lance hits via PRD 12 % (icd 3 s); `mage_flurry` with `brain_freeze` ⇒ `costMult 0`, consume on commit, apply `winters_chill` (2 stacks, 6 s) on each target hit; `mage_ice_lance` treats a target with `winters_chill` as Frozen (×3, consume one stack) in addition to the Parmak rule.
  Arcane: `clearcasting` from arcane LMB / Blast hits via PRD 8 % (icd 4 s); `mage_arcane_blast` with `clearcasting` ⇒ `costMult 0`, consume on commit.
  `icy_veins`: frost spells apply chill 100 %, pierce +2 (read in resolveCast mods).
* **Verification.** Sim `dev/combat-sim/wow_mage.mjs`: force crits ⇒ `heating_up` then `hot_streak` (Flame Wave free, instant, status consumed); Flurry with Brain Freeze ⇒ target has `winters_chill`; Ice Lance on it ⇒ ×3 and stack consumed; Blast with Berrak Zihin ⇒ mana unchanged; statistical gate: at 15 % crit and 1 hit/s, Hot Streak at least once per 20 s in 90 % of 1000 simulated minutes (the old rule fails this).

#### CW-14 · Mage and execute behaviours — combat · wave 5 · M · deps: CW-10, CW-11
* **Files (edit):** `src/combat/skills/behaviors.ts`.
* **Tasks.** Add and register `bounce_projectile` (Anka: after the first hit, up to `params.bounces` bounces to the nearest *burning* enemy within `bounceRange`, damage ×`bounceMult`), `burst_shot` (Sağanak: `params.burst` bolts sequentially every `gap` s, each rolls its own Parmak chance), `target_status` (Dokunuş: projectile applies `def.statuses` on hit, no damage);
  `execute` behaviour: when `ctx.data.anyHp` (Ani Ölüm) is set, ignore `params.threshold`, no cull.
* **Verification.** `cw14.behaviors`: Anka on two burning dummies ⇒ 2 extra `damage` events at ×0.85; Sağanak ⇒ 3 projectile spawns 0.18 s apart; Dokunuş ⇒ target has `touch_of_magi`; execute with `anyHp` hits a 90 % HP target.

#### CW-15 · VFX presets and proc wiring — vfx-audio · wave 5 · M · deps: CW-01, CW-07
* **Files (edit):** `src/vfx/VFX.ts` (registration only), `src/vfx/presets_feel.ts`, `src/vfx/aliases.ts` (if present). **(create):** `src/vfx/presets_wow.ts`.
* **Tasks.** Presets: `proc_burst` (ring + 12 sparks at the hands, school colour via `opts.color`), `proc_consume` (inward pop), `cast_hands_fire|frost|arcane` (0.15 s glow at the staff hand on cast start), `arcane_charge_orb` (follow, one orb per charge, orbit 1.2 s), `crit_ring` (flat ring 0.25 s), `lockout_flash`.
  Subscribe in `feedback.ts`-style block (new file section in `presets_wow.ts` wired from `VFX.ts` init): `proc:gain` → `proc_burst`, `proc:fade {consumed}` → `proc_consume`.
* **Verification.** `cw15.ids`: `vfxResolves` true for all new ids; `cw15.proc`: apply `hot_streak` ⇒ `G.vfx.spawn('proc_burst')` called once; arcane charges 0→4 ⇒ 4 orbs alive, barrage ⇒ 0; screenshot (scale 0.4) of burst + orbs.

#### CW-16 · Target frame, aura row, nameplate highlight — hud · wave 6 · M · deps: CW-01
* **Files (edit):** `src/ui/hud/TargetFrame.ts`, `src/ui/widgets/StatusRow.ts`, `src/ui/widgets/Nameplates.ts`. **(create):** `src/ui/styles/hud-target.css` (imported by `TargetFrame.ts`).
* **Tasks.** §2.15 (own debuffs first and larger, others dim, timers with threshold colours, refresh-window pulse at < 30 %), §2.14 (a) soft-target ring + brighter nameplate for the hovered target, target-of-target label; `StatusEffects.apply` leftover rule for own DoTs is **not** touched here (data/behaviour change goes to CW-18 if wanted).
* **Verification.** `cw16.aura`: apply `bleed` (source = player) and `slow` (source = enemy) on a dummy ⇒ bleed icon in the own row with class `own`, slow in the dim row; a 6 s bleed at 1.5 s left pulses; hover a dummy ⇒ `.soft` ring exists.

#### CW-17 · Player cast bar — hud · wave 6 · S · deps: CW-04, CW-07
* **Files (edit):** `src/ui/widgets/CastBar.ts`, `src/ui/hud/PlayerFrame.ts` (`PlayerCastBar`, line 203).
* **Tasks.** `cast:pushback` ⇒ bar slides back with a red flash + "+0.5" tick; channel tick marks (ticks from `def.ticks`/`params.tick`); the LMB heavy charge shown as a cast bar (tier tick at 0.75 s); queued skill shown as a small ghost icon right of the bar (`skill:queued`); interrupted cast shows the school lock icon for the lockout time.
* **Verification.** `cw17.bar`: arcane blast + two pushbacks ⇒ bar duration +1.0 s; Kar Fırtınası shows ≥ 4 tick marks; hold LMB 0.5 s ⇒ bar visible with progress, release ⇒ hidden.

#### CW-18 · Tuning and balance gate — combat (data) · wave 6 · M · deps: all earlier
* **Files (edit):** `src/data/skills.ts`, `src/combat/feel.ts`, `src/data/specs.ts` (numbers only).
* **Tasks.** (1) Run `dev/combat-sim/skills.mjs` + `speed.mjs` before/after: per class "ideal rotation DPS over 60 s" must stay within ±10 % of the pre-CW baseline; fix by scaling `coef` of the zero-cooldown RMB/E skills (starting guess ×1.15 for the arpg GCD profile; ×1.8 if the `'wow'` profile becomes the default). (2) Set spell feel budgets of §2.17 (`projectile` weight `hitstop 0`, trauma 0.05→0.06; big-spell rows get `hitstop 40`, `shake 0.14–0.22`). (3) Confirm mage Hot Streak cadence (gate in CW-13) and Fingers/Brain Freeze/Clearcasting rates with the PRD wrapper; adjust `ch` values only. (4) Record the final numbers in Appendix A.
* **Verification.** `cw18.balance` prints per-class DPS table (before/after), GCD profile A/B toggle works (`dev.wow.setProfile('wow'|'arpg')`), feel telemetry panel shows hit-stop ≤ 160 ms / 0.3 s at 10 hits/s, trauma ≤ 0.85.

#### CW-19 · (optional) Focus, target-of-target, tab polish — player + hud · wave 7 · M · deps: CW-01, CW-16
* **Files (edit):** `src/game/PlayerController.ts`, `src/ui/hud/index.ts`. **(create):** `src/ui/hud/FocusFrame.ts`.
* **Tasks.** `focusTarget` binding sets `player.focusId`; small focus frame + interruptible cast bar under the target frame; Tab prefers in-front ≤ 60° engaged enemies, `targetPrev` cycles back.
* **Verification.** `cw19.focus`: set focus on dummy A, target dummy B ⇒ focus frame shows A with its cast bar; Tab order check.

#### CW-20 · (optional) Enemy interrupts and school flags — enemies · wave 7 · M · deps: CW-07
* **Files (edit):** `src/types/enemies.ts` (optional `interruptsCast`, `school`), `src/data/enemies.ts` (flag 2–3 caster abilities), `src/ai/EnemyAI.ts` (pass the flag into the hit).
* **Tasks.** Flagged abilities carry `interrupt: true` into `IncomingHit`; `Combat.hitLocalPlayer` calls `G.skills.interrupt(p, false)` with reason `'enemyInterrupt'` (CW-07 turns that into lockout).
* **Verification.** `cw20.kick`: dev caster skeleton hits a casting mage ⇒ cast cancelled, `lockout` status present, bar shows lock.

### 4.4 File conflict matrix (per wave; one owner per file)

| Wave | Package → files |
|---|---|
| 1 | CW-01: `core/events.ts`, `types/vfx.ts`, `types/audio.ts`, `core/Settings.ts`, `core/Input.ts`, `entities/AnimController.ts` · CW-02: new `combat/{gcd,spellQueue,castRules,prd}.ts`, `dev/combat_wow.ts`, `dev/combat-sim/wow_core.mjs`, `dev/combat.ts` (1 line) · CW-03: `types/skills.ts`, `data/statuses_talents.ts`, new `data/procs.ts`, new `combat/procMods.ts` |
| 2 | CW-04: `combat/SkillSystem.ts`, `combat/feel.ts`, `game/PlayerController.ts` · CW-05: `vfx/DamageNumbers.ts`, `vfx/feedback.ts`, `vfx/VFX.ts` · CW-06: `combat/Combat.ts` |
| 3 | CW-07: `combat/SkillSystem.ts`, `combat/Procs.ts`, `combat/procActions.ts`, new `combat/procFx.ts` · CW-08: `ui/hud/ActionBar.ts`, new `ui/styles/hud-wow.css` · CW-09: new `ui/hud/SpellOverlay.ts`, new `ui/styles/hud-overlay.css`, `ui/hud/index.ts` |
| 4 | CW-10: `data/skills_mage_specs.ts`, `data/specs_talents.ts` · CW-11: `data/specs.ts`, `data/skills.ts`, `data/statuses.ts`, `combat/procMods.ts` · CW-12: `audio/manifest_feel.ts`, `audio/Audio.ts`, `audio/aliases.ts` |
| 5 | CW-13: `combat/specs/mage.ts` · CW-14: `combat/skills/behaviors.ts` · CW-15: `vfx/VFX.ts`, `vfx/presets_feel.ts`, `vfx/aliases.ts`, new `vfx/presets_wow.ts` |
| 6 | CW-16: `ui/hud/TargetFrame.ts`, `ui/widgets/StatusRow.ts`, `ui/widgets/Nameplates.ts`, new `ui/styles/hud-target.css` · CW-17: `ui/widgets/CastBar.ts`, `ui/hud/PlayerFrame.ts` · CW-18: `data/skills.ts`, `combat/feel.ts`, `data/specs.ts` |
| 7 | CW-19: `game/PlayerController.ts`, `ui/hud/index.ts`, new `ui/hud/FocusFrame.ts` · CW-20: `types/enemies.ts`, `data/enemies.ts`, `ai/EnemyAI.ts` |

Each package also creates its own `src/dev/wow/cwNN.ts` (never shared).

### 4.5 Dependency one-liner

`CW-01, CW-02, CW-03` → `CW-04` (needs 01+02) · `CW-05` (01) · `CW-06` (01) → `CW-07` (02+03+04) · `CW-08` (01+03+04) · `CW-09` (01+03) → `CW-10` (03+07) · `CW-11` (03+07) · `CW-12` (01+03+07) → `CW-13` (10) · `CW-14` (10+11) · `CW-15` (01+07) → `CW-16` (01) · `CW-17` (04+07) · `CW-18` (all) → `CW-19` (01+16) · `CW-20` (07).

### 4.6 Acceptance KPIs (measured by the checks / sims)

| KPI | Target |
|---|---|
| Press → effect, instants (p95, sim) | ≤ 0.17 s (fireball ≤ 0.14 s) |
| Queued press dead time after GCD/chain end | ≤ 1 frame |
| `ui_error` events during a 10 s held-RMB test | 0 |
| Proc status applied → overlay + glow visible | ≤ 1 frame |
| Mage Hot Streak cadence at 15 % crit | ≥ 1 per 20 s in 90 % of runs |
| Proc rate vs nominal (PRD, 5000 emits) | ±0.5 pp, dry streak ≤ 3× expected |
| Combat text DOM nodes during Kasırga (24 ticks) | ≤ 4 per target |
| Hit-stop / trauma caps | ≤ 160 ms per 0.3 s, ≤ 0.85 (unchanged) |
| Per-class rotation DPS vs pre-pass | ±10 % |
| `npx tsc --noEmit` | 0 errors |

---

## Appendix A — numbers (`WOW` in `combat/feel.ts`, single source)

```ts
export const WOW = {
  gcd:   { profile: 'arpg' as 'arpg' | 'wow', arpg: { base: 1.0 }, wow: { base: 1.5, rogue: 1.0 }, floorMul: 0.5, rogueFixed: true },
  queue: { window: 0.40, ttl: 0.80 },
  lead:  { enabled: true, instant: 0.14, basic: 0.17, min: 0.08 },
  pushback: { add: 0.5, max: 2, minHpFrac: 0.03, channelCut: 0.25 },
  lockout:  { sec: 4, silenceSec: 3 },
  proc:  { prd: true, overlayIn: 0.15, overlayOut: 0.35, warnSec: 1.5, maxOverlays: 3 },
  glow:  { spendFrac: 0.90 },
  text:  { critMul: 1.5, mergeSec: 0.45, bounce: [[0.18, 14], [0.34, 6]] },
  spellFeel: { projectileTrauma: 0.06, bigSpellStop: 40, bigSpellTrauma: [0.14, 0.22], bigSpellFovPull: -2 },
};
```

## Appendix B — proc table (data contract for `data/procs.ts` and `PROC_MODS`)

| ProcDef id | Status | Name | Overlay | Glow skills / rule | Engine effect |
|---|---|---|---|---|---|
| `heating_up` | `heating_up` | Isınıyor | left, orange | `mage_phoenix_flames` | mage hook (CW-13): next fire crit → hot_streak; Anka forceCrit |
| `hot_streak` | `hot_streak` *(existing)* | Sıcak Seri | top + both, orange | `mage_flame_wave`, `mage_meteor`, `mage_phoenix_flames` | existing `resolveCast` (free, instant, +25 % crit) |
| `fingers_of_frost` | `fingers_of_frost` *(existing)* | Buz Parmağı | left (1) / both (2), cyan | `mage_ice_lance` | existing hook |
| `brain_freeze` | `brain_freeze` | Beyin Donması | top, pale blue | `mage_flurry` | mage hook (CW-13): free + `winters_chill` |
| `clearcasting` | `clearcasting` | Berrak Zihin | center, violet | `mage_arcane_blast` | mage hook (CW-13): free |
| `art_of_justice` | `art_of_justice` | Adalet İlhamı | top, gold-white | `knight_wake_of_flames` | `PROC_MODS`: cost 0, cdReset, +1 adalet |
| `revenge_ready` | `revenge_ready` | İntikam Hazır | left + right, orange-white | `knight_shield_bash` | `PROC_MODS`: cost 0, cdFree, ×1.4 |
| `sudden_death` | `sudden_death` | Ani Ölüm | top, dark red | `barbarian_execute` | `PROC_MODS`: cost 0, `anyHp` |
| `wrath_return` | `wrath_return` | Misilleme | left, red | `barbarian_cleave` | `PROC_MODS`: cost 0, heal 4 % |
| `opportunity` | `opportunity` | Fırsat | right, yellow-green | `rogue_crossbow_shot` | `PROC_MODS`: cost 0, ×1.6, +1 kombo |
| rule `resource90` | – | – | – | best `spender` of the bar | glow only |
| rule `pips5` | – | – | – | `knight_templar_verdict` | glow only |
| rule `execute35` | – | – | – | `barbarian_execute` | glow only |
| rule `stealthOpener` | – | – | – | `rogue_backstab` | glow only |
| rule `combo5` | – | – | – | `rogue_eviscerate` | glow only |
| rule `arcane4` | – | – | – | `mage_arcane_barrage` | glow only |
| rule `riposteOpen` / `breakFinisher` | – | – | – | LMB | glow only |
| rule `bloodbath3` | – | – | – | `barbarian_bloodbath` | glow only |

New VFX ids: `proc_burst`, `proc_consume`, `cast_hands_fire|frost|arcane`, `arcane_charge_orb`, `crit_ring`, `lockout_flash`. New SFX ids: `arcane_cast`, `arcane_impact`, `proc_gain`, `proc_use`, `cd_ready`,
`cast_pushback`, `cast_interrupted`, `burst_window`. New events: `proc:gain`, `proc:fade`, `skill:queued`, `cast:pushback`, `skill:lockout`, `skill:ready`, `burst:window`. New settings: `gcdProfile`, `spellQueueMs`,
`abilityGlow`, `leadSkip`, `numberStyle`.

## Appendix C — risks and open questions

* **Balance.** The GCD caps burst, the Hot Streak rule is made *more* generous, procs add free casts: CW-18 gates DPS at ±10 % and tunes `coef` / `ch` only. If QA prefers the 1.5 s feel, flip `gcdProfile` and re-run the gate.
* **Lead skip may cut readable anticipation.** Per-skill `params.lead` and the setting `leadSkip` exist; heavy skills are excluded by rule.
* **Remote peers.** GCD, queue, procs and lockout are local-only (like casts today). Peers see the cast replay with authored timing (slightly later than the local hit): acceptable; no new net channels. Proc status icons are not replicated.
* **Feedback fatigue / performance.** Overlay is ≤ 3 DOM nodes with CSS animation; numbers are merged; glow is CSS only; spells never add hit-stop. Settings `abilityGlow`, `numberStyle` let players tone it down.
* **Hard-cast redesign of Alev Dalgası** deviates from GDD_V2 §1.3.5 (instant, 8 s CD) and GDD_TALENTS tree text that refers to its charges (`s18 chg=+1`): the `chg` / `cdx` mods become inert, to be reconciled by the talents owner.
* **Open:** should physical melee skills ever carry a school (kick lockout)? Decided no for now. Do we want a Simyacı pass (healer) next? Yes, separate document.

## Appendix D — sources

* Warcraft Wiki — Haste / Haste rating (GCD 1.5 s, floor 0.75 s; Classic floor 1.0 s): https://warcraft.wiki.gg/wiki/Haste
* Warcraft Wiki — Pushback (0.5 s ×2 for casts, 25 % ×2 for channels): https://warcraft.wiki.gg/wiki/Pushback
* Warcraft Wiki — `C_SpellActivationOverlay.IsSpellOverlayed` (glowing border = proc overlay): https://warcraft.wiki.gg/wiki/API:C_SpellActivationOverlay.IsSpellOverlayed
* From memory, not re-verified by search: SpellQueueWindow default 400 ms, Hot Streak / Brain Freeze / Fingers of Frost / Sudden Death behaviour, interrupt lockout durations, ElvUI button tint colours.
* Project references: `docs/ref/ui/README.md`, `docs/GDD_V2.md` §1–3, `docs/GDD_LIFE.md` §5, `docs/GDD_TALENTS.md` §1.3, `ARCHITECTURE.md`.
