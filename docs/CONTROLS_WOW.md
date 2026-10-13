# EFSUN ONLINE — CONTROLS_WOW: WoW control scheme (default) + Aksiyon scheme (normative for CW-C packages)

> Implementation spec for **CORE_MECHANICS §12** (user: "TPS'yi aynı WoW kamera açısı gibi yönetelim; skillerden çok sağ/sol klik var").
> Precedence: ARCHITECTURE > CORE_MECHANICS > this file > COMBAT_WOW. This file **overrides COMBAT_WOW §2.13** ("no true auto-attack"):
> §12 is newer and normative, so the WoW scheme gets a real auto-attack driver (§8). Everything else in COMBAT_WOW (GCD, spell queue,
> procs, targeting extras) is unchanged and is not specified here.
> Code was read, not changed. Line numbers are from the tree of 2026-10-13. Player-facing text is Turkish, code and ids English.

## 0. Decisions in one screen

| # | Decision |
|---|---|
| D1 | New setting `controlScheme: 'wow' | 'aksiyon'`, default **`'wow'`**. It replaces `cameraMode` as the source of truth. `cameraMode` stays in `SettingsData` (append-only rule) and is kept in sync (`wow` → `'classic'`, `aksiyon` → `'action'`) so every unmigrated reader (`Crosshair`, `CombatCues`, `ActionBar`, dev pages) keeps working. Internally the camera and controller keep the names `'action'` (= Aksiyon) and `'classic'` (= WoW). |
| D2 | **Aksiyon is today's scheme, byte for byte** (permanent pointer lock, LMB attacks, RMB skill, shift-lock, Q/E/R + 1–3 skills). The only Aksiyon change is that `skill_s4` (G) is finally wired in `PlayerController`. |
| D3 | **WoW scheme keymap differs in 18 actions** (15 existing + 3 new, §3.2). Digits 1–5 become skills, Q/E/R become s2/s3/s4, the two potions move from 4/5 to **G / H**. **Flasks do not move** (6 7 8 9 0 are already free of skills in both schemes). Zero collisions in both schemes, enforced by `tools/controls-check.mjs`. |
| D4 | Left and right mouse buttons are **hard-wired gestures** in the WoW scheme (select / orbit / mouselook / attack / interact), not rebindable actions. `Mouse0` and `Mouse2` are reserved there. Middle button, `Mouse3`, `Mouse4` stay rebindable. |
| D5 | **Bindings are stored per scheme** for the 18 scheme-specific actions (`schemeBindings`), shared for the rest (`bindings`). Existing overrides migrate into the Aksiyon slot, so nobody loses a rebind. |
| D6 | **Movement is character-relative in WoW** (W runs along the character's facing; RMB turns the character to the camera; A/D strafe, they do not turn). Aksiyon stays camera-relative. Keyboard turning exists only in WoW (`←` `→`). |
| D7 | **No pointer lock in WoW unless a button is held** and the press turned into a drag (3 px or 0.12 s). The cursor is visible otherwise. A click never hides the cursor. |
| D8 | **Auto-attack = a driver that re-issues the existing LMB chain** (no new damage path, no new net channel). Melee classes swing while the target is in reach; ranged classes auto-shoot; casters do **not** auto-fire at range unless `casterAutoShot` is on (open question Q1). |
| D9 | WoW camera: default **10 m**, **2–30 m outdoors**, **2–min(18, 1.35 × ceiling) m indoors**, rest pitch **20°**, no shoulder offset, no look-ahead, no combat/lock-on zoom, **smart pivot** (camera eases behind the character while it runs forward), wall **and ceiling** pull-in. |

## 1. What exists today (read before touching code)

| Area | File:line | Fact that drives the design |
|---|---|---|
| Binding table | `core/Input.ts:27` `DEFAULT_BINDINGS` | One flat table. All 26 letters and all 10 digits are bound. `skill_lmb = Mouse0`, `skill_rmb = Mouse2`, `toggleLock = Mouse1`. |
| Mouse helpers | `Input.ts:217-221` | `keyDown('Mouse0')`, `keyPressed('Mouse2')`, `released()` already exist; presses over UI (`isUITarget`) never enter `held` unless pointer-locked (`:171`). |
| Two camera modes already exist | `ThirdPersonCamera.ts:8,245` `mode` from `settings.cameraMode` | `'classic'` = RMB drag orbit + cursor aim. It is a half-WoW (movement stays camera-relative, no LMB orbit, no click-targeting, no ceiling, no auto-attack). It becomes the WoW scheme. |
| Orbit | `ThirdPersonCamera.ts:482` | `orbiting = action ? isLocked() : down('skill_rmb')`. Must become `keyDown('Mouse0') || keyDown('Mouse2')` in WoW. |
| Aim ray | `ThirdPersonCamera.ts:254` | Cursor ray when classic and not orbiting, else the clean centre pose. Right behaviour; needs a "cursor is over UI → use centre" guard. |
| Zoom | `ThirdPersonCamera.ts:15-16,462` | `MIN_DIST 3`, `MAX_DIST 18`, ×(1 ± 0.12) per notch, `cameraDistance` setting (default 9). |
| Pitch | `:17,702-713` | rest pitch 0.26–0.62 by zoom, pulled after a wheel move and after 2 s of auto-follow; floor-based `minPitch`; `MAX_PITCH 1.38`. |
| Auto-follow | `:554` | Setting `cameraAutoFollow` (default **false**): after 1.2 s without orbit, 0.9 rad/s × speed factor, only `follow.active` (steering straight forward, no hard target). |
| Wall collision | `:727-768` | `nav.raycast` pivot→camera, margin 0.55 m, min fraction 0.12, instant in / hold 0.15 s / ease 4 s⁻¹ (props 2.5). `occluders` in `'pull'` (town) or `'fade'` (dungeon/open world). **No ceiling.** `World.groundY` exists, `World.ceilingY` does not; `RoomDef.ceiling` does not exist yet (CORE_MECHANICS §13). |
| Controller input | `PlayerController.ts:803-878` | Slot loop reads `SLOT_ACTION`; `s4: null` (`:35`); classic RMB click-vs-drag logic (`:851-877`, 7 px / 0.3 s); LMB hold re-fires the chain only when `autoCombo`. |
| Facing | `PlayerController.ts:513-541` | A hard target forces facing (`:527`) and `cam.setLockOn` (`:974`): that is lock-on, not WoW selection. |
| Lock | `:381-446` | Action mode locks on LMB click and shows a toast; classic borrows the lock only while RMB-dragging. Unexpected unlock opens `gameMenu` only in action mode. |
| Dodge | `:699-761` | Direction from camera basis; turns into the roll unless action + shift-lock. |
| Basic chain | `SkillSystem.ts:268,826-864` | `tryCastSlot('lmb')` → `tryBasic` → `startBasicStep`; presses during a step are **buffered** (`buffer()`, last input wins, fires at `chainAt`); steps from `comboSteps(parent)`; finisher = last step (`tags: ['finisher']`); tempo = `FEEL.basicTempo × weaponTempoOf × speedFactor`. Not GCD-gated. |
| Net | `net/guard.ts:21-24,128` | `hit` is vetted against the sender's last position: reach = skill range + radius + 4 m (`REACH_SLACK`) + body. Each swing already broadcasts `cast`. Token bucket 60 / 40 per s. |
| Bar | `ui/hud/ActionBar.ts:19-30` | Cells: lmb, rmb, q, e, r, s1, s2, s3 + two potions. Labels come from `Input.bindingLabel(action)`. **No s4 cell.** |

## 2. Settings, scheme switching, migrations

### 2.1 New and changed fields (`core/Settings.ts`, append-only)

```ts
export type ControlScheme = 'wow' | 'aksiyon';              // exported from core/Input.ts, re-used by Settings

interface SettingsData {
  // ...existing...
  /** CONTROLS_WOW D1. Source of truth for the control scheme. cameraMode is derived from it (wow -> 'classic', aksiyon -> 'action'). */
  controlScheme: ControlScheme;                              // default 'wow'
  /** Revision of the control-scheme migration. Stored files below 1 are migrated once. */
  controlsRev: number;                                       // default 1 (new players need no migration)
  /** Overrides of the 18 scheme-specific actions, per scheme. `bindings` keeps the shared (UI) overrides only. */
  schemeBindings: { wow?: Partial<Record<InputAction, string[]>>; aksiyon?: Partial<Record<InputAction, string[]>> };   // default {}
  /** Wanted zoom of the WoW camera (m). `cameraDistance` stays the Aksiyon zoom. */
  cameraDistanceWow: number;                                 // default 10, clamp 2..30
  /** WoW smart pivot: camera eases behind the character while it runs forward. */
  cameraSmartPivot: boolean;                                 // default true (WoW only; Aksiyon keeps cameraAutoFollow)
  /** Casters (cameraProfile 'caster', or a projectile basic without a profile) auto-fire their LMB chain at range. */
  casterAutoShot: boolean;                                   // default false
  /** A melee skill that hit an enemy arms the auto-attack (WoW). */
  autoAttackFromSkills: boolean;                             // default true
  /** One-time "scheme changed" toast shown. */
  controlsHintShown: boolean;                                // default false
}
export const SETTINGS_VERSION = 4;                           // was 3
```

`cameraMode` is not removed. `Settings.set('controlScheme', v)` also writes `cameraMode` (inside the same method via a small override of `set`, or by the listener in `Game.ts`, §2.3).

### 2.2 The 18 scheme-specific actions (`SCHEME_ACTIONS`)

`skill_lmb skill_rmb skill_q skill_e skill_r skill_s1 skill_s2 skill_s3 skill_s4 potionHp potionMp toggleLock camShoulder moveLeft moveRight autoAttack turnLeft turnRight`
(15 existing actions whose default differs between the schemes, plus the 3 new ones; see §3.2 for the exact diff).

Exact rule (so the list cannot drift): `SCHEME_ACTIONS` = every action whose default differs between the two tables **plus** the new actions. `tools/controls-check.mjs` derives it and compares with the exported constant.

### 2.3 Where the scheme is applied

`Input` gets (in `core/Input.ts`):

```ts
export const SCHEME_BINDINGS: Record<ControlScheme, Partial<Record<InputAction, string[]>>>;   // §3.2, only the actions that differ + new actions
export function defaultBindings(s: ControlScheme): Record<InputAction, string[]>;              // DEFAULT_BINDINGS merged with SCHEME_BINDINGS[s]
export const DEFAULT_BINDINGS: Record<InputAction, string[]>;                                   // UNCHANGED export name = Aksiyon table + new actions ([])
export const RESERVED_MOUSE: Record<ControlScheme, string[]>;                                   // wow: ['Mouse0','Mouse2'], aksiyon: []

class Input {
  scheme: ControlScheme = 'wow';
  /** Rebuild `bindings` for a scheme: defaultBindings(s) < shared overrides < scheme overrides. Never throws on unknown actions. */
  applyScheme(s: ControlScheme, shared: Partial<Record<InputAction, string[]>>, perScheme: Partial<Record<InputAction, string[]>> | undefined): void;
}
```

`game/Game.ts` (core owner): replace the loop at `:66-69` with `G.input.applyScheme(d.controlScheme, d.bindings, d.schemeBindings[d.controlScheme])`, and in the existing `settings:changed` hook re-apply when `key` is `controlScheme`, `bindings` or `schemeBindings`, and mirror `cameraMode`:

```ts
if (key === 'controlScheme') G.settings.data.cameraMode = G.settings.data.controlScheme === 'wow' ? 'classic' : 'action';  // no set(): avoid a second event
```

**Switching at runtime** (Ayarlar → Kontroller, any time, also in combat): `PlayerController` listens to `settings:changed(controlScheme)` and (1) releases pointer lock (`expectedUnlock = true`), (2) disarms the auto-attack, (3) resets mouse state, `hardTarget` keeps (it is a selection in both), (4) calls `cam.onSchemeChanged()` (loads the zoom of the new scheme, `snap()`-free: yaw/pitch keep, `shoulderSide` 1 → 0 or back), (5) shows `Kontrol şeması: WoW` / `Kontrol şeması: Aksiyon` as a toast. HUD labels follow automatically (they read `bindingLabel` every frame).

### 2.4 Migrations (one-time, keyed on `controlsRev`, run only on a stored file)

```ts
// Settings constructor, inside `if (hasStored)`, after the existing migrations
if ((stored.controlsRev ?? 0) < 1) {
  const shared = { ...(stored.bindings ?? {}) };
  const aks: Partial<Record<InputAction, string[]>> = { ...(stored.schemeBindings?.aksiyon ?? {}) };
  for (const a of SCHEME_ACTIONS) if (shared[a]) { aks[a] = shared[a]!; delete shared[a]; }   // legacy rebinds were made against the Aksiyon layout
  this.data.bindings = shared;
  this.data.schemeBindings = { ...(stored.schemeBindings ?? {}), aksiyon: aks };
  this.data.controlScheme = 'wow';                      // stored cameraMode is always written (defaults are serialised), so a choice cannot be inferred
  this.data.cameraMode = 'classic';
  this.data.cameraDistanceWow = 10;
  this.data.controlsHintShown = false;                   // the toast below runs once
  this.data.controlsRev = 1;
  changed = true;
}
```

* **Why everybody flips to WoW:** the game is unreleased; the user asked for WoW as the default; `cameraMode: 'action'` is stored for every existing file whether chosen or not. The first scene shows once: `Kontrol şeması WoW oldu. Eski düzene dönmek için Ayarlar → Kontroller → Kontrol Şeması: Aksiyon.` (`ui:toast`, kind `info`, then `controlsHintShown = true`).
* **Export the pure part** as `migrateControlsRev(stored: Partial<SettingsData>): Partial<SettingsData>` so `tools/controls-check.mjs` can test it without a DOM.
* `lockOnMode` and `cameraAutoFollow` are untouched (Aksiyon keeps using them). `autoCombo` is untouched (Aksiyon only; the WoW driver ignores it, §8.2).
* The existing `bindingsRev` migration (guard G → CapsLock, inventory I → B) keeps running first; the new one runs after it, so a v0 file passes both.
* **Reset** (`settings.ts:429,514`): "Tüm Tuşları Sıfırla" clears `bindings` **and** `schemeBindings[scheme]` of the active scheme only. "Varsayılana Dön" resets everything including `controlScheme = 'wow'`.
* `Input.rebind()` callers (`settings.ts:381,397,405`) must write to `schemeBindings[scheme]` when the action is in `SCHEME_ACTIONS`, else to `bindings`.

## 3. Keymaps (the zero-collision proof)

### 3.1 Aksiyon (current defaults, unchanged) — new actions are unbound here

| Group | Binding |
|---|---|
| Move | W/↑ forward · S/↓ back · A/← left · D/→ right · Space jump · Shift dodge · `walkToggle` NumpadDivide / `[` (walk ↔ run) · `autorun` NumLock / `]` · `walk` (held) unbound by default (§3.4) |
| Skills | **LMB** `skill_lmb` · **RMB** `skill_rmb` · Q `skill_q` · E `skill_e` · R `skill_r` · 1 `skill_s1` · 2 `skill_s2` · 3 `skill_s3` · G `skill_s4` |
| Majors | X `m45` · V `m90` · T `m180` |
| Consumables | 4 `potionHp` · 5 `potionMp` · 6 7 8 9 0 `flask1..5` |
| Combat | Mouse4 / `-` heavyAttack · Mouse3 / Caps guard · Tab targetNext · \` targetPrev · F8 focus · U targetAlly · F1–F5 party · F interact · Z revive |
| Camera | MMB `toggleLock` (shift-lock) · H `camShoulder` · Alt `freeCursor` |
| UI | B C N K M O J L I P Y `.` Enter Esc F12 (unchanged) |
| New (unbound) | `autoAttack []` · `turnLeft []` · `turnRight []` |

### 3.2 WoW — the diff against the Aksiyon table (everything not listed is identical)

| Action | Aksiyon | **WoW** | Slot / meaning |
|---|---|---|---|
| `skill_lmb` | Mouse0 | **[]** (unbound; rebindable for a manual swing / casters) | lmb = auto-attack cell |
| `skill_rmb` | Mouse2 | **Digit1** | rmb slot (WoW filler / builder, on GCD) |
| `skill_q` | KeyQ | **Digit2** | q slot (main spender / proc button) |
| `skill_e` | KeyE | **Digit3** | e slot |
| `skill_r` | KeyR | **Digit4** | r slot |
| `skill_s1` | Digit1 | **Digit5** | s1 slot (AoE) |
| `skill_s2` | Digit2 | **KeyQ** | s2 slot (mobility) |
| `skill_s3` | Digit3 | **KeyE** | s3 slot (personal defensive) |
| `skill_s4` | KeyG | **KeyR** | s4 slot (interrupt / utility) |
| `potionHp` | Digit4 | **KeyG** | potion (freed by s4) |
| `potionMp` | Digit5 | **KeyH** | potion (freed by `camShoulder`) |
| `camShoulder` | KeyH | **[]** | WoW camera is centred: no shoulder swap |
| `toggleLock` | Mouse1 | **[]** | no shift-lock in WoW |
| `autoAttack` | [] | **Mouse1, Equal** | toggle auto-attack (MMB click, `=` for keyboards / laptops) |
| `turnLeft` | [] | **ArrowLeft** | keyboard turn (WoW A/D turn; ours strafe) |
| `turnRight` | [] | **ArrowRight** | |
| `moveLeft` | KeyA, ArrowLeft | **KeyA** | arrows now turn |
| `moveRight` | KeyD, ArrowRight | **KeyD** | |

That is 18 rows: 15 changed existing actions (9 skill slots, 2 potions, `camShoulder`, `toggleLock`, `moveLeft`, `moveRight`) and 3 new ones. `moveForward` and `moveBack` keep their arrows (↑ ↓). Everything else (flasks 6–0, majors X V T, heavy, guard, Tab, F-keys, UI keys) is identical, so **flasks are not relocated**: `Digit6..0` stay, and `Digit1..5` are the first five bar slots.

**Reserved mouse gestures (WoW, not rebindable):** `Mouse0` (select / orbit / confirm ground aim), `Mouse2` (mouselook / attack / interact / cancel ground aim). `RESERVED_MOUSE.wow = ['Mouse0','Mouse2']`. The settings capture dialog refuses them in WoW with `Sol ve sağ tık WoW şemasında fare hareketlerine ayrılmıştır.`; `Mouse1`, `Mouse3`, `Mouse4` are assignable.

### 3.3 Collision proof (what `tools/controls-check.mjs` asserts, per scheme)

1. Build `code → actions[]` from `defaultBindings(scheme)`. **Every code maps to exactly one action** (a code listed twice inside ONE action is fine: `moveForward`, `dodge`, `guard`, `heavyAttack`, `freeCursor`).
2. WoW: `Mouse0` and `Mouse2` appear in no action; `Mouse1` only in `autoAttack`.
3. Both schemes: the ten digit codes and the 26 letter codes are each bound exactly once (so the doc claim "all bound" stays true; a free key in the future is a deliberate choice).
4. For each slot key `lmb rmb q e r s1 s2 s3 s4 m45 m90 m180` the action exists and has at most one non-alias code (WoW `lmb` has zero by design).
5. `SCHEME_ACTIONS` equals the set of actions whose arrays differ between the two tables or are new.
6. `migrateControlsRev` on fixtures: (a) `{bindings:{skill_q:['KeyF'], inventory:['KeyZ']}}` → `schemeBindings.aksiyon.skill_q = ['KeyF']`, `bindings.inventory = ['KeyZ']`, `controlScheme = 'wow'`; (b) `{}`-with-`controlsRev:1` is untouched; (c) idempotent.

7. (fixes, §3.4) `walkToggle` and `autorun` are shared, bound in both schemes, on no letter / digit / mouse / modifier code and collision-free; no default binding uses Control or Meta; every default code has a `codeLabel`; Ayarlar lists every action (WoW omits `toggleLock`, `camShoulder`; Aksiyon omits `autoAttack`, `turnLeft`, `turnRight`).

### 3.4 Control fixes (audit round 1)

| Topic | Rule |
|---|---|
| Walk | Held Ctrl is no longer the default: Ctrl + W / S / D / F / R / P are browser shortcuts (Ctrl+W closes the tab and a page cannot stop it). `walkToggle` (NumpadDivide, `[`) flips walk ↔ run (toast); `walk` is still a rebindable held action (default unbound). `PlayerController.walking` = toggle or held key. |
| Browser shortcuts | `Input` calls `preventDefault` on every Ctrl / Meta + letter or digit keydown while `gameScene` is on and no text field is focused (Ctrl+W / T / N stay browser-reserved). |
| Autorun | `autorun` (NumLock, `]`) toggles a forward run along the facing (WoW) / camera (Aksiyon); strafing still adds in, mouse turning does not cancel it. Cancelled by a W or S press (also `moveBack` / `moveForward` arrows), by the same key, death, any frame without input (panel open), a teleport and the void respawn lock. Held S overrides it. A dodge rolls along the autorun direction. |
| Backpedal | `BACKPEDAL_MUL = 0.643` (WoW 4.5 / 7). |
| Air momentum (WoW) | Airborne: no braking when keys are released, 15 % of the ground acceleration while keys are held (`WOW_AIR_CONTROL`), and the key basis is frozen at take-off so mouselook / turn keys never redirect the velocity. Aksiyon keeps `AIR_CONTROL = 0.5`. |
| Turn keys vs `faceHold` | WoW facing row 3 is a hard cast (`p.cast`) **or** the 0.55 s post-cast `faceHold` **unless** a turn key is held (arrow turns win). Hard casts still own facing. |
| `targetPrev` / `focusTarget` | `targetPrev` (\`) is the reverse Tab cycle (from no selection: the last candidate in WoW). `focusTarget` (F8) sets the focus to the current target, pressing it on the focus (or with no target) clears it. `PlayerController.focusTarget` getter and `localFocusTargetId()` expose it; it drops when the enemy dies. No focus frame yet. |
| Tab keeps the selection (WoW) | No candidates, or the only candidate already selected: nothing happens (no release, no sound). Aksiyon keeps its double-tap / empty-view release. |
| Esc | Last in the chain (`UI.handleHotkeys`): chat / modal / top panel first; with none open and a hard target selected, Esc clears the target (`clearLocalHardTarget()`) and the **next** Esc opens the game menu. |
| Cursor | `PlayerController.updateWowCursor` is the single writer of `canvas.style.cursor`; it hides the cursor only while `WowMouse.wantLock` (press became a drag: 3 px or 0.12 s, D7). `ThirdPersonCamera` no longer writes it. |
| Text focus | `Input` derives it from `document.activeElement` (input / textarea / contenteditable), so it clears when the field blurs or is removed. |
| Window blur | `Input` moves held codes into the released set (`released()` fires), clears `held` / `justDown` and bumps `blurSeq`. `PlayerController` sees the change, calls `WowMouse.reset()` (no click is emitted from a blur) and drops the Tab / shoulder holds. |
| Aksiyon `skill_s4` | G now casts the s4 slot like every other slot (it was inert). |
| Labels | `codeLabel` knows Backslash, Slash, Comma, Semicolon, Quote, brackets, numpad and navigation keys. Where `navigator.keyboard.getLayoutMap()` exists (Chromium), letters and punctuation show the character printed on the player's layout (Turkish-Q `ı`, `ğ`, `ü` …); digits always show the number. |
| Ayarlar | Lists every rebindable action (majors, flasks, ally / party keys, quests, town portal, paragon, autorun, walk toggle, focus, previous target). Assigning a key another action already uses asks `… tuşu zaten … işlemine atanmış … Devam edilsin mi?` and only then moves it. |

Known pre-existing overlap, **not** solved here (open question Q4): `ui/hud/ExtraBars.ts:446` uses Shift/Ctrl + Digit 1–8 for the two extra bars. Shift is the dodge key and Ctrl was walk in both schemes (now only if rebound); in WoW the digits are also main-bar skills. The extra-bar handler already `stopPropagation`s the digit in the capture phase, so the main bar does not double fire, but a Shift press still starts a dodge first.

## 4. WoW mouse model

### 4.1 Gestures

| Held | Effect |
|---|---|
| nothing | cursor visible, free. Hover highlights enemies / NPCs / loot and changes the cursor (§4.5). |
| **LMB** only | **orbit**: camera yaw/pitch follow mouse movement, the character does **not** turn. |
| **RMB** only | **mouselook**: camera turns, the character faces the camera yaw every frame (λ 40, max 30 rad/s). Crosshair shown at screen centre. |
| **LMB + RMB** | mouselook **and run forward** (virtual `axis.y = 1` unless S is held; A/D still strafe). |
| click LMB (no drag) | select the enemy under the cursor; empty ground clears the selection; over a friendly NPC nothing (Q3). |
| click RMB (no drag) | enemy: select **and arm auto-attack**; NPC / interactable / loot within `interactRange + radius`: `interact(p)`; otherwise nothing. |
| click LMB while a ground-aim is active | confirm the aim at the cursor (swallowed: no select, no orbit). |
| click RMB while a ground-aim is active | cancel the aim (swallowed). |
| wheel over canvas | zoom (UI wheel is filtered by `Input`). |

A **click** = released with `moved < 5 px` (sum of |movementX|+|movementY| while down) **and** held `< 0.25 s`. Anything else is a drag. A click is resolved on **release**, using the cursor position (NDC) recorded at **press** (pointer lock freezes `clientX/Y`, but the record removes the doubt).

### 4.2 State machine (new pure module `src/game/WowMouse.ts`, no imports from `G`)

```ts
export interface BtnState { down: boolean; t: number; moved: number; ndcX: number; ndcY: number; lockAsked: boolean }
export interface WowMouseIn {
  dt: number; l: boolean; r: boolean;                 // Input.keyDown('Mouse0'/'Mouse2') (already UI-filtered)
  lPressed: boolean; rPressed: boolean;               // Input.keyPressed(...)
  dx: number; dy: number; ndcX: number; ndcY: number; // this frame
  enabled: boolean;                                    // canInput && !uiOpen && !dead
  aiming: boolean;                                     // G.skills.isAiming(p): ground aim waiting for a confirm
}
export interface WowMouseOut {
  mouseLook: boolean; orbit: boolean; both: boolean;
  wantLock: boolean;                                   // ask Input.lock() (once per hold)
  clickL?: { ndcX: number; ndcY: number };
  clickR?: { ndcX: number; ndcY: number };
  confirmAim?: { ndcX: number; ndcY: number };         // LMB click while `aiming`
  cancelAim?: boolean;                                 // RMB click while `aiming`
}
export const WOW_MOUSE = { clickPx: 5, clickSec: 0.25, lockPx: 3, lockSec: 0.12 } as const;
export class WowMouse { update(i: WowMouseIn): WowMouseOut; reset(): void; l: BtnState; r: BtnState }
```

Rules inside `update`:
* A press while `!enabled` is ignored until release (no "drag into the game from a panel").
* `wantLock` goes true when a button has been down for `lockSec` **or** `moved ≥ lockPx`, and stays true while any button is down; false immediately after the last release.
* Clicks are emitted on the frame the button goes up, never when the other button is down at that moment (a chord is not a click) and never when the press began while `aiming` was consumed.
* `orbit = (l || r)` for camera input; `mouseLook = r`; `both = l && r`.

### 4.3 Pointer lock and cursor rules (WoW)

| Rule | Value |
|---|---|
| Request | `Input.lock()` once per hold when `wantLock` turns true, never while `G.ui.wantsCursor()` or `Input.pointerOverUI` at press. |
| Release | `expectedUnlock = true; Input.unlock()` on the frame no mouse button is down, or a panel opens, or the scheme changes, or the window loses focus (`Input` already clears `held` on blur). |
| Cursor restore | The cursor reappears where the press happened (Chrome keeps the position; the camera consumes `movementX` before and after the lock). |
| Esc / alt-tab while locked | `handleLockChange` sees an unexpected unlock: set `mouseSuspended = true` until all buttons are up, **do not** open `gameMenu` (WoW has no permanent lock; Esc opens the menu through the `menu` action next press). Aksiyon keeps its current behaviour. |
| Lock refused (no gesture) | Fall back to unlocked `movementX/Y` (cursor may touch the screen edge), `console.warn` once. |
| Canvas cursor | `canvas.style.cursor = 'none'` only once the press became a drag (`WowMouse.wantLock`, D7), else the context cursor of §4.5; a click never hides it. `PlayerController` is the single writer. Reset to `''` on dispose and on scheme change. |
| Aksiyon | `updatePointerLock` action branch unchanged: permanent lock, first click re-acquires (`swallowLmb`), `freeCursor` (Alt) frees it. |
| Alt (`freeCursor`) in WoW | Kept: LootSystem (`:602`) and DamageMeter read it. It has no mouse effect in WoW. |

### 4.4 Click picking (new pure module `src/game/ClickPick.ts`)

```ts
export type PickKind = 'enemy' | 'npc' | 'loot' | 'interactable';
export interface PickHit { kind: PickKind; entity: Entity; ratio: number }
/** Entity under NDC (x, y): ray through the camera, body samples feet/chest/head (0.1, 0.5, 0.9 of height). */
export function pickAtNdc(camera: THREE.PerspectiveCamera, world: World, ndcX: number, ndcY: number, maxDist = 60): PickHit | null;
```
* Same test as `updateTargets` (`PlayerController.ts:941-960`): per sample `perp / (radius + 0.9 + t·0.035)`, `t ≥ 1`, best (smallest) ratio ≤ 1 wins; `kind` from `Entity.kind` (`'enemy' | 'npc' | 'loot' | 'interactable'`), dead/removed skipped.
* Ties within 0.1 ratio: **enemy > loot > interactable > npc**.
* No line-of-sight test (selection through walls is allowed, like WoW); the attack itself still needs LOS (§8).
* The controller calls it with the press-time NDC: LMB click → `select(hit.kind==='enemy' ? hit.entity : null)`; RMB click → enemy: `select + autoAttack.arm('rmb')`, else if `isInteractable(e)` and `dist ≤ e.interactRange + e.radius` → `e.interact(p)` (loot included), else if too far `ui:toast "Çok uzak"` (kind `warning`, throttled 1 s).

### 4.5 Cursors (WoW)

| Context (no button held, no panel, `!pointerOverUI`) | CSS cursor |
|---|---|
| hostile enemy under the cursor | `url(/assets/cursors/attack.png) 6 6, crosshair` |
| NPC / interactable within interact range | `url(/assets/cursors/interact.png) 6 6, pointer` |
| loot drop within pickup range | `url(/assets/cursors/loot.png) 6 6, pointer` |
| same, but out of range | default arrow (no change; the toast explains) |
| otherwise | `''` (system arrow) |
Updated every 0.1 s from `pickAtNdc(input.ndc)`. Assets: three 32×32 PSX-pixel PNGs, 1-px dark outline, drawn by the settings/HUD package (§11 W2-C).

## 5. Movement and facing (WoW)

Movement basis in WoW is the **character's facing**: `forward = (sin ψ, cos ψ)`, `right = (-cos ψ, sin ψ)` with ψ = `p.yaw`. (Aksiyon keeps `cam.getBasis`.) In `stepMovement` the basis choice is the only change to the wish-direction code; the speed, backpedal (×0.643), accel/decel and nav collision code is untouched.

Facing priority in WoW (replaces `:519-539` when `scheme === 'wow'`, first match wins):

| # | Condition | `want` | λ / max rate (rad/s) |
|---|---|---|---|
| 1 | dodge roll | the roll decides | – |
| 2 | RMB held (mouselook) | `cam.faceYaw` | 40 / 30 |
| 3 | hard cast (`p.cast`), or `faceHold > 0` with no turn key held | `aimYaw` (target or aim point) | 42 / 24 |
| 4 | guarding | `cam.faceYaw` | 30 / 14 |
| 5 | `turnLeft` / `turnRight` held | `p.yaw ± TURN_RATE · dt` directly, and `cam.rotateYaw(±TURN_RATE · dt)` (the camera turns rigidly with the character) | `TURN_RATE = 3.1` rad/s (≈ 178°/s) |
| 6 | auto-attack armed, **idle** (no move input, no mouselook), target outside the facing cone | bearing to the target | 20 / 14 |
| 7 | otherwise | keep `p.yaw` (no turning toward the wish direction) | – |

* A hard target no longer forces facing in WoW (`:527` is Aksiyon-only) and `cam.setLockOn` is never called in WoW (the lock-on framing is Aksiyon-only).
* **Dodge in WoW:** direction from the character basis, no input = roll backwards (unchanged), the character does **not** turn into the roll (`keepFacing = true` for `wow`), the clip is picked relative to facing (`Dodge_Forward/Backward/Left/Right`).
* `cam.setFollow(...)` (§7.4) receives `active = axis.y > 0.5 && |axis.x| < 0.71 && no mouse button && !dodge && !dead` (a `both`-run counts as `axis.y = 1`).

## 6. Targeting in WoW

| Topic | Rule |
|---|---|
| Selection | `hardTarget` is a **selection** (no camera lock, no forced facing). `currentTarget() = hardTarget ?? softTarget` is unchanged. |
| Soft target | Still ray-based (`updateTargets`): cursor ray when free, centre ray while a mouse button is held. Used only when nothing is selected. Guard in `getAimRay`: if `Input.pointerOverUI` use the centre pose, so a key press while the cursor rests on the HUD does not aim at the HUD. |
| Tab (`targetNext`) | **Press** cycles at once (`lockOnMode` is ignored in WoW; there is no Tab-hold lock). Candidates: alive, visible on screen, ≤ 40 m. Sort: **engaged with me first** (`e.aggroed`), then nearest. First press = best candidate, further presses = next, no wrap-to-null: no candidates, or one entry that is already selected, keeps the selection (§3.4). `targetPrev` (\`) goes back. `focusTarget` (F8) sets / clears the focus target. |
| Range / LOS | A selection drops only on death/removal (then: nearest in a 60° cone ≤ 8 m of the facing, else clear), distance > 45 m, or scene change. **No LOS drop timer in WoW.** (Aksiyon keeps 30 m / 2 s LOS.) |
| Boss auto-lock | `bossAutoLock` in WoW **selects** the boss (no camera lock). |
| Esc | Last fallback only: with no panel / chat / modal open, Esc clears the selection; the next Esc opens the menu (§3.4). LMB-click on empty ground clears too. |
| Friendly | `U`, `F1–F5` (`healing.ts`) unchanged. LMB click on a party member's model selects that ally via `selectPartySlot` when `pickAtNdc` returns a remote `Player` (extend `PickKind` with `'ally'`, ratio rules as enemies). |

## 7. Camera (WoW profile)

### 7.1 Profile table (`ThirdPersonCamera.ts`, new `CAM_PROFILES`)

```ts
interface CamProfile {
  zoomMin: number; zoomMaxOutdoor: number; zoomMaxIndoor: number; zoomDefault: number;
  restPitch: number; maxPitch: number;
  shoulder: number; lookAhead: boolean; combatZoom: boolean; lockOnFraming: boolean;
  pitchAutoReturn: boolean; wheelPitchPull: boolean;
}
export const CAM_PROFILES: Record<CameraMode, CamProfile> = {
  action:  { zoomMin: 3, zoomMaxOutdoor: 18, zoomMaxIndoor: 18, zoomDefault: 9,  restPitch: NaN /* zoom curve 0.26..0.62, as today */, maxPitch: 1.38, shoulder: 0.55, lookAhead: true,  combatZoom: true,  lockOnFraming: true,  pitchAutoReturn: true,  wheelPitchPull: true  },
  classic: { zoomMin: 2, zoomMaxOutdoor: 30, zoomMaxIndoor: 18, zoomDefault: 10, restPitch: 0.349 /* 20° */,      maxPitch: 1.45, shoulder: 0,    lookAhead: false, combatZoom: false, lockOnFraming: false, pitchAutoReturn: false, wheelPitchPull: false },
};
```

| Parameter | Aksiyon (as today) | **WoW** |
|---|---|---|
| Default / stored distance | `cameraDistance` (default 9) | `cameraDistanceWow` (default **10**) |
| Zoom limits | 3–18 m | **2–30 m** outdoors (`def.outdoor`, town), **2–`zoomMaxIndoor`** indoors |
| Indoor max | 18 | `clamp(1.35 × ceiling(pivot), 6, 18)`; no ceiling data (`Infinity`) = 18. Examples: ceiling 6 → 8.1 m, 12 → 16.2 m, ≥ 13.4 → 18 m |
| Zoom step | ×(1 ± 0.12) per wheel notch | same, **min step 0.4 m** |
| Zoom smoothing | `damp(…, 12)` | same |
| Rest pitch | 0.26–0.62 by zoom | **0.349 rad (20°)** at every zoom; set on `snap()` and scene start; **no auto-return** after wheel or while running (WoW keeps your pitch) |
| Pitch limits | floor-based min, max 1.38 | floor-based min (same formula), max **1.45** (83°) |
| Pivot height | 2.0 + lerp(−0.25, 0.6, zoom curve) | same |
| Shoulder | ±0.55, auto swap | **0** (centred), `updateShoulder` skipped, `shoulderSide = 0` |
| Look-ahead | on (setting) | **off** |
| Combat zoom / lock-on bias | on | **off** (the camera never moves by itself except the smart pivot) |
| Lock-on framing | on | **off** (`setLockOn` never called) |
| FOV | `fov + lerp(−4, 6, zoom curve)` | same |
| Mouse | `LOOK_SENS 0.0022 × mouseSensitivity × fov/60`, pitch ratio `cameraSensYRatio` | same |
| Orbit source | pointer lock | `Mouse0 || Mouse2` held (`orbiting`) |

`zoomTarget` is remembered per scheme; the indoor maximum only **clamps the effective zoom** (`zoomWant = min(zoomTarget, zoomMaxCur)`), it never rewrites `zoomTarget`, so leaving a low room restores the player's zoom. `zoomMaxCur` follows its goal at 4 m/s (no pop when crossing a door).

### 7.2 New camera API

```ts
setEnvironment(e: { outdoor: boolean }): void;     // TownScene: {outdoor:true}; DungeonScene: {outdoor: !!def.outdoor}
rotateYaw(delta: number): void;                    // rigid turn with the character (turn keys)
onSchemeChanged(): void;                           // reload zoom of the active scheme, shoulderSide 1 <-> 0, clear smart-pivot state
setFollow(active, yaw, speed): void;               // exists; WoW feeds it per §5
get profile(): CamProfile;                         // CAM_PROFILES[this.mode]
```
`World` (core) gets `ceilingY(x: number, z: number): number { return Infinity; }` (DungeonBuilder overrides it when §13 lands: tile → `RoomDef.ceiling`, default 6 m for dungeons, halls 12–30; corridors 4.5 m). Until then the ceiling clamp and the indoor zoom limit are dormant (`Infinity`), so there is **no regression** in existing dungeons.

### 7.3 Collision (walls and ceilings)

* **Walls (unchanged numbers):** `nav.raycast(pivot → desired camera)`, pulled in to `f − 0.55 / len`, `frac ≥ 0.12`; occluders `'pull'` in town, `'fade'` elsewhere; instant in, `COL_HOLD 0.15 s`, ease out 4 s⁻¹ (props 2.5 s⁻¹). Add two lateral probes (rays from `pivot ± right × 0.35` to `camera ± right × 0.35`) and take the minimum fraction, so the lens does not clip a wall corner (WoW's camera has a radius).
* **Ceilings (new):** after the wall fraction, sample `ceilingY` at `t = 0.25, 0.5, 0.75, 1.0` along `pivot → camera`. For the first sample where `point.y > ceilingY(point.x, point.z) − CEIL_MARGIN (0.35)` binary-search `t` (6 iterations) and set `fracCeil = t_safe`, `frac = min(fracNav, fracProp, fracCeil)`. Same hold/ease as walls (`colByProp` false). A camera that must go lower than the floor clamp (`groundAt + 0.35`) keeps the floor clamp.
* **Zoom ceiling clamp** (§7.1) is the proactive half; this is the reactive half (a low corridor behind a high hall).
* `refreshAim()` and `place()` both apply the same `colFrac`, as today, so aiming matches the lens.

### 7.4 Smart pivot (WoW auto-follow)

Activates **only** when all hold: `cameraSmartPivot`, scheme WoW, no mouse button held, no lock-on, not `deathCam`/cinematic, `follow.active` (§5), planar speed > 1.5 m/s, and `idleOrbit ≥ 0.8 s` (time since the last orbit input).

```
target  = follow.yaw                        // character facing + PI
d       = angleDiff(yaw, target)
if |d| > 2° (dead zone):
  sf      = clamp(speed / 7, 0.4, 1)
  step    = (|d| − dead) · (1 − exp(−3.0 · dt))        // ease, never a snap
  yaw    += sign(d) · min(step, 2.2 · sf · dt)          // ≤ 126°/s at full speed
```
* Strafing (`|axis.x| ≥ 0.71`), back-pedalling and standing still never follow, so A/D cannot spin the camera.
* Because WoW movement is character-relative, the follow can never feed back into the wish direction.
* Mouse movement, a wheel move, or any held mouse button resets `idleOrbit` and stops the follow at once.
* The pivot position itself keeps today's damped follow (13 s⁻¹ → 10 s⁻¹ at speed) and the airborne vertical dead zone.

## 8. Auto-attack driver

### 8.1 Where it lives

* `src/game/AutoAttack.ts` (new, pure state machine, no `G` import): decides **arm / disarm / swing now**.
* `SkillSystem` (combat owner, W1-C) exposes the small API the driver needs.
* `PlayerController` (W2-A) owns one instance, feeds it per-frame context and calls `fireAuto()` when it says `swing`.

```ts
// SkillSystem additions (public, append-only)
export interface AutoInfo {
  mode: 'melee' | 'ranged' | 'off';        // derived, see 8.3
  reach: number;                            // metres from the target's EDGE (melee: next step range + 0.5; ranged: min(step range, 28))
  step: number;                             // index of the NEXT step (0-based)
  steps: number;
  finisherNext: boolean;                    // next step has tag 'finisher'
  ready: boolean;                           // no action in progress, or the current one is past chainAt and holds no skill buffer
  elapsed: number; total: number;           // current step progress for the swing sweep on the bar (0,0 when idle)
  gapLeft: number;                          // seconds of finisher gap still to wait
}
autoInfo(p: Player): AutoInfo;
autoSwing(p: Player, aim: AimInfo): boolean;   // starts the next chain step iff ready (never buffers, never overwrites a skill buffer)
hasBufferedSkill(p: Player): boolean;          // st.buffer exists and its skillId is not the lmb parent
isAiming(p: Player): boolean;                  // ground aim waiting for a confirm
cancelAim(p: Player): void;                    // endAim without casting
```
`ClassDefX` gets an optional `autoAttack?: 'melee' | 'ranged' | 'off'` override (append-only); no class sets it now.

### 8.2 Swing timer and chain

* **The swing timer is the chain itself.** `autoSwing` calls the existing `startBasicStep`, so durations are `hit/chain/end` of the step divided by `animSpeed = def.animSpeed × speedFactor(attackSpeed|castSpeed + class bonuses) × FEEL.basicTempo × weaponTempoOf(p)`. Haste shortens every step and the gap below. Nothing about damage changes: an auto swing is the same `playerHitEnemy` call as a held LMB with `autoCombo` on, so SimBench's APL (LMB chain whenever idle) stays valid.
* **Chain steps and finisher:** steps come from `comboSteps(parent)`; the combo resets after `params.reset` (0.8–0.9 s) without a swing, exactly as today; the last step carries `tags: ['finisher']` (bigger shake / knockback, Titan-style every-3rd-hit effects stay in `SkillSystem`).
* **Finisher gap (new, tunable):** after a step whose def has the `finisher` tag **ends**, the driver waits `AUTO.finisherGap = 0.20 s / speedFactor` before the next chain starts, so the finisher lands as a beat and the chain has WoW-like rhythm. `autoInfo.gapLeft` exposes it. The gap does **not** apply to a manual `skill_lmb` press.
* **Skill priority:** a queued/buffered skill beats an auto swing. `autoSwing` returns `false` while `hasBufferedSkill(p)` and while the current action is not past `chainAt`. Skills reset the chain (`st.combo.next = 0`, existing rule).
* **Roll / jump / running attacks** (`tryMoveAttack`, GDD_V2 §3.3) still replace chain steps when the auto swing happens under their conditions (after `DODGE_ATTACK_AT` into a roll, airborne, running). This is wanted: it is the only way to reach them in WoW.
* **Heavy** stays on `heavyAttack` (Mouse4 / `-`); `chargeDown()` reads `skill_lmb`, which is unbound in WoW, so a held mouse never charges. `autoCombo` is ignored in WoW.

### 8.3 Mode, range, facing, LOS (all per frame, in `AutoAttack.tick`)

```
mode = cls.autoAttack
    ?? (step1.targeting === 'melee_arc' ? 'melee'
      : cls.cameraProfile === 'ranged' ? 'ranged'
      : settings.casterAutoShot ? 'ranged' : 'off')
```
Today: knight, barbarian, rogue, monk, paladin, demonhunter → `melee`; archer → `ranged`; mage, necromancer, warlock, evoker → `off` (their `mage_basic` is a projectile chain; with `casterAutoShot` it becomes `ranged`). A CM12 melee caster basic automatically becomes `melee`.

| Check | Melee | Ranged |
|---|---|---|
| Distance (edge) | `dist − target.radius ≤ step.range + 0.5` (the net guard allows range + 4 + body, so it is safe) | `dist ≤ min(step.range, 28)` |
| Line of sight | not required | `nav.lineOfSight(p → target)` |
| Facing | idle: auto-face (§5 row 6), swing as soon as `|angle| ≤ 100°`; moving: swing only if `|angle| ≤ 70°`; **mouselook: swing only if `|angle| ≤ 70°`** to the camera heading, else no swing and one throttled toast `Hedefe dönük değilsin` | same cone, aim direction = toward the target (`getAim` already points at `currentTarget`) |
| Moving | allowed (action-RPG rule; `params.upper` upper-body clips) | allowed |
| Blocked while | dead, stunned, `p.cast` hard cast, ground-aim active, charge in progress, dodge before `DODGE_ATTACK_AT`, `!canAct()`, panel open / chat focus (**pause**, not disarm), target dead/removed | same |

### 8.4 Start / stop rules

| Event | Result |
|---|---|
| RMB click on an enemy (§4.4) | select + **arm** |
| `autoAttack` (MMB / `=`) pressed | toggle. Arming with no selection picks the nearest living enemy within 8 m inside a 60° cone of the character's facing; none → `ui:toast "Hedef yok"`, stays off |
| A melee skill hit an enemy (`damage` event from the local player, `autoAttackFromSkills`, mode `melee`) | arm (WoW rule: melee abilities start the swing) |
| Ranged / caster skill | never arms |
| Select another enemy (Tab, LMB, RMB) while armed | stays armed, switches target |
| Target dies / is removed | retarget: nearest in a 60° cone ≤ 8 m; none → disarm (silent) |
| `autoAttack` pressed while armed | disarm |
| Death, `scene:leaving`, scheme change, `player:releaseRequested` | disarm |
| Target out of reach / wrong facing / no LOS | stay armed, no swing; after **8 s** of no valid swing **and** `!p.inCombat` → disarm |
| Stun, dodge, hard cast, panel open | pause (resume automatically) |
| Selecting a friendly (`U`, F1–F5) | selection changes but auto-attack keeps its enemy target; a friendly is never auto-attacked |
| Entities never auto-attacked | `isDead`, `removed`, dormant (`def.dormant` not yet woken), non-hostile |

"In combat" in CORE_MECHANICS §12 is read as "armed": the first swing puts the player in combat (`Combat.ts:357`), so no separate in-combat gate exists.

### 8.5 Net

* **No new channel, no new field.** Each swing is a normal `cast` broadcast (`SkillSystem`), remote peers replay it with `playRemoteCast`; hits stay client-computed and vetted by `net/guard.ts` (reach `step.range + radius + 4 + body`, 60-token bucket at 40/s — a chain is ≤ 4 casts/s).
* The armed flag is **local only** (it is intent, not state); it is not in `PlayerSyncState`.
* `hardTarget` / selection remains local (`target:changed` is local); remote players do not see who you target.

## 9. Action bar labels per scheme (`ui/hud/ActionBar.ts`)

Cells keep the order `lmb rmb q e r s1 s2 s3 s4` (s4 is **new**: `{ id: 's4', action: 'skill_s4', size: 'md', skill: 's4' }` after s3; empty cells stay quiet when `barGhostSlots` is false). Labels = `Input.bindingLabel(action)` every frame, so they follow the scheme and user rebinds. Special cases:

| Cell | Aksiyon label | **WoW label** |
|---|---|---|
| lmb | `SolT` | **`Oto`** while `skill_lmb` is unbound; the cell shows the class basic icon, a thin **swing sweep** (`autoInfo.elapsed / total`) and a red-gold pulsing frame (`.armed`) while armed. Tooltip: `Otomatik Saldırı · Sağ tık (düşman) / {autoAttack key} ile aç-kapat`. A bound `skill_lmb` shows its key. |
| rmb | `SağT` | `1` |
| q | `Q` | `2` |
| e | `E` | `3` |
| r | `R` | `4` |
| s1 | `1` | `5` |
| s2 | `2` | `Q` |
| s3 | `3` | `E` |
| s4 | `G` | `R` |
| potions | `4` / `5` | `G` / `H` |
| flasks (when shown) | `6 7 8 9 0` | `6 7 8 9 0` |
| majors | `X V T` | `X V T` |

* `Crosshair.reticle()` (`Crosshair.ts:11`): in WoW return the **screen centre with `ok = true` while a mouse button is held** (mouselook), else the mouse position. The centre crosshair is shown only during mouselook in WoW; always in Aksiyon.
* `ActionBar.update` `relock` (`:268`) and `CombatCues` `action` (`:94`) already gate on `cameraMode === 'action'`; they stay correct through the `cameraMode` mirror.
* Hover tooltip of an auto-armed lmb cell shows the current chain step (`Adım 2/4`, finisher flagged).

## 10. Settings panel (`ui/panels/game/settings.ts`)

* Kontroller tab, section **Kamera**: first row `Kontrol Şeması` (`selectBox`: `WoW (Varsayılan)` / `Aksiyon`) with the help text `WoW: fare imleci serbest, sağ tık bakış, sol tık döndür, yetenekler 1–5 / Q E R. Aksiyon: fare kilitli, sol/sağ tık saldırı.` The old `Kamera Modu` row is removed.
* `Kamera Mesafesi` slider binds to `cameraDistanceWow` (2–30) in WoW, `cameraDistance` (4–16) in Aksiyon.
* WoW-only rows: `Akıllı Kamera (hareket ederken arkaya dön)` → `cameraSmartPivot`; `Büyücüler uzaktan otomatik ateş etsin` → `casterAutoShot`; `Yakın dövüş yeteneği otomatik saldırıyı başlatsın` → `autoAttackFromSkills`. Aksiyon-only rows: `Basılı tutunca saldırı zinciri` (`autoCombo`), `Otomatik omuz değişimi`, `Kilit modu` (existing).
* Key list `GROUPS` is built per scheme: WoW `Savaş` = `skill_rmb … skill_s4, autoAttack, skill_lmb (Manuel Saldırı), heavyAttack, guard, potionHp, potionMp, targetNext, targetPrev, focusTarget, interact, revive`; WoW `Hareket` adds `turnLeft`, `turnRight`; WoW `Kamera ve Diğer` drops `toggleLock`. Aksiyon lists exactly what it lists today (+ nothing new).
* Action display names (`ACTION_NAMES_TR`): `autoAttack: 'Otomatik Saldırı (aç/kapat)'`, `turnLeft: 'Sola Dön'`, `turnRight: 'Sağa Dön'`; in WoW the six renamed slots read `Yetenek 1 … 5`, `Yetenek Q/E/R` via a scheme-aware `actionName(action, scheme)` helper (`skill_rmb` → `Yetenek 1`, `skill_q` → `Yetenek 2`, `skill_e` → `Yetenek 3`, `skill_r` → `Yetenek 4`, `skill_s1` → `Yetenek 5`, `skill_s2` → `Yetenek Q`, `skill_s3` → `Yetenek E`, `skill_s4` → `Yetenek R`, `skill_lmb` → `Manuel Saldırı`); Aksiyon keeps today's names.
* Capture dialog: refuse `RESERVED_MOUSE[scheme]` codes; the "taken by another action" swap logic (`:389-405`) works per scheme table.
* A conflict can no longer be created: the dialog already removes a code from the previous owner; the check tool guards the defaults.

## 11. Implementation packages (Haiku, file-disjoint, ≤ 3 per wave)

Review policy: after each wave a Sonnet review of the diff, orchestrator spot-check, then Haiku fixes. **No per-agent browser tests** (low-CPU rule): every package ends with `npx tsc --noEmit` = 0 errors in its files (and the tool run where listed). One Haiku QA pass at the very end (W3-C).

### Wave 1 (parallel, no file overlap, no compile dependency between them)

| Pkg | Owner | Files (only these) | Work | Verify |
|---|---|---|---|---|
| **W1-A** | core | `src/core/Input.ts`, `src/core/Settings.ts`, `src/game/Game.ts` | §2.1–§2.4, §3: `ControlScheme`, `SCHEME_BINDINGS`, `defaultBindings`, `RESERVED_MOUSE`, `Input.applyScheme/scheme`, new actions `autoAttack turnLeft turnRight` (+ TR names), `DEFAULT_BINDINGS` keeps its name and Aksiyon values, new settings fields + defaults + `SETTINGS_VERSION = 4`, `migrateControlsRev` (exported, pure) + constructor wiring, `SCHEME_ACTIONS`, `Game.ts` apply/re-apply + `cameraMode` mirror. | `tsc`; inline asserts: `defaultBindings('aksiyon')` deep-equals the old `DEFAULT_BINDINGS` for every old action |
| **W1-B** | player (camera) + world + scenes | `src/camera/ThirdPersonCamera.ts`, `src/world/World.ts`, `src/scenes/TownScene.ts`, `src/scenes/DungeonScene.ts` | §7: `CAM_PROFILES`, profile-driven constants (Aksiyon values must stay identical), WoW zoom/pitch/shoulder/look-ahead/bias switches, `orbiting` from `Mouse0\|\|Mouse2` in classic, cursor-over-UI guard in `getAimRay`, `setEnvironment`, `rotateYaw`, `onSchemeChanged`, `World.ceilingY`, ceiling pull-in + indoor zoom clamp + lateral wall probes, WoW smart pivot (§7.4) replacing the `cameraAutoFollow` branch **only for classic**, scenes call `setEnvironment`. Reads new settings through a local `type WowCamSettings = { cameraDistanceWow?: number; cameraSmartPivot?: boolean }` cast so it compiles before W1-A merges. | `tsc`; dev `?camdebug=1` unchanged in Aksiyon |
| **W1-C** | combat | `src/game/WowMouse.ts` (new), `src/game/ClickPick.ts` (new), `src/game/AutoAttack.ts` (new), `src/combat/SkillSystem.ts`, `src/data/classes.ts` | §4.2, §4.4, §8: the three pure modules with exported constants and inline `selfTest()` functions; SkillSystem `autoInfo/autoSwing/hasBufferedSkill/isAiming/cancelAim`, ground-aim confirm accepts `pressed('skill_lmb') \|\| keyPressed('Mouse0')` (`SkillSystem.ts:1599`), finisher gap bookkeeping (`st.autoGapUntil`), `ClassDefX.autoAttack?`. No `aimConfirm` action is added (Aksiyon: `skill_lmb` is Mouse0 already). | `tsc`; `selfTest()` of each module runs from `dev/player.html?selftest=1` (W3-A) |

### Wave 2 (needs wave 1)

| Pkg | Owner | Files | Work | Verify |
|---|---|---|---|---|
| **W2-A** | player | `src/game/PlayerController.ts`, `src/core/events.ts` (append event `autoattack:state { armed: boolean; targetId: number or null }`) | The whole WoW behaviour: `SLOT_ACTION.s4 = 'skill_s4'` and majors wired (both schemes); scheme read from `G.settings.data.controlScheme`; `WowMouse` + gestures (§4.1) incl. press-time NDC clicks, chord run, ground-aim confirm/cancel; pointer-lock rules (§4.3) in a new `updatePointerLockWow`; character-relative movement + facing table (§5) + turn keys; WoW dodge; `ClickPick` select / RMB attack / interact / loot; context cursor (§4.5); Tab rules (§6) incl. engaged-first sort, no lock-on, no forced facing, 45 m drop, `setLockOn` never in WoW; `AutoAttack` instance + `fireAuto()` + arm from `damage` events; disarm hooks; `settings:changed(controlScheme)` handler (§2.3); `handleSkills` ignores `skill_lmb` mouse path in WoW; Aksiyon code paths untouched (guard every change with `const wow = this.cam.mode === 'classic'`). | `tsc`; with `dev/player.html` (W3-A) |
| **W2-B** | hud | `src/ui/hud/ActionBar.ts`, `src/ui/hud/Crosshair.ts`, `src/ui/hud/CombatCues.ts`, `src/ui/styles/hud.css` (append) | §9: s4 cell, `Oto` label + `.armed` frame + swing sweep (reads `G.skills.autoInfo(p)` every frame and the `autoattack:state` event, Q5), WoW reticle rule, lmb tooltip, labels. | `tsc`; visual check in the final QA only |
| **W2-C** | panels-game | `src/ui/panels/game/settings.ts`, `public/assets/cursors/{attack,interact,loot}.png`, `tools/controls-check.mjs` (new) | §10 + §3.3: scheme selector, per-scheme rows and groups, `actionName(action, scheme)`, reserved-mouse refusal, per-scheme rebind/reset storage, cursor PNGs (32×32), the check tool. | `node tools/controls-check.mjs` exit 0; `tsc` |

### Wave 3

| Pkg | Owner | Files | Work |
|---|---|---|---|
| **W3-A** | dev | `src/dev/player.ts`, `src/dev/combat.ts`, `src/dev/hud.ts` | Dev pages: scheme toggle key (`F9` toggles `controlScheme`), the `cameraMode` toggle replaced, `?selftest=1` runs the three module self-tests, `dev/combat.ts` `heldUntil.set('skill_lmb', …)` becomes `autoAttack` arm in WoW, `dev/hud.ts` `BIND` list uses the active scheme. |
| **W3-B** | docs (Sonnet) | `ARCHITECTURE.md`, `docs/CORE_MECHANICS.md` | New "Controls contracts" block in ARCHITECTURE (settings fields, Input API, camera API, SkillSystem auto API); CORE_MECHANICS §12 gets "Exact keymap and rules: docs/CONTROLS_WOW.md (done)" and §10.1 key table gets the Aksiyon/WoW key columns; COMBAT_WOW §2.13 gets a one-line "superseded by CONTROLS_WOW §8". |
| **W3-C** | QA (Haiku, ONE pass) | none (report only) | Checklist below, one browser tab. |

### Final QA checklist (W3-C, single pass, both schemes)

1. Fresh profile starts in **WoW**; an old stored profile shows the one-time toast and keeps its Aksiyon rebinds in Aksiyon.
2. Ayarlar → Kontroller: switch both ways in town and in a dungeon; labels on the bar change (`Oto 1 2 3 4 5 Q E R` ↔ `SolT SağT Q E R 1 2 3 G`); potions `G H` ↔ `4 5`; no toast spam; cursor returns.
3. WoW mouse: hold RMB = mouselook, release = cursor back at the press position; LMB orbit does not turn the character; both = runs forward; quick clicks do not flash the lock; Esc while holding does not open the menu.
4. WoW click: LMB enemy selects, ground clears, RMB enemy arms auto-attack (frame pulses), RMB NPC interacts only in range, RMB loot picks up.
5. Auto-attack: melee chain runs with a visible finisher beat; stops when the target dies and re-targets within 8 m; a queued skill (e.g. key 1 mashed) is never swallowed by auto swings; ranged class shoots at range with LOS only; caster does nothing until `casterAutoShot` is on.
6. Camera: default 10 m, wheel 2–30 outdoors; hall vs corridor zoom limit (when §13 data exists); running forward after an orbit eases the camera behind; strafing never rotates it; backing into a wall pulls in and eases out; no ceiling clip.
7. Collisions: `node tools/controls-check.mjs` green; no key does two things in either scheme.
8. Aksiyon regression: permanent lock, LMB chain, RMB skill, shift-lock, G now casts the s4 slot (when one is bound).
9. No console errors during normal play in both schemes.

## 12. Open questions (need a decision, defaults chosen)

| # | Question | Default used in this spec |
|---|---|---|
| Q1 | CORE_MECHANICS §12 says "casters only swing in melee range", but `mage_basic` (Gizem Oku) is a ranged projectile chain, so a mage has nothing to swing. Should casters get a ranged "wand" auto-shot? | **Off** (`autoAttack 'off'` for mage/necromancer/warlock/evoker); `casterAutoShot` setting turns them into ranged auto-shooters; `skill_lmb` can be bound manually. Their damage comes from keys 1–5 (WoW filler on `rmb`). |
| Q2 | Existing profiles all store `cameraMode: 'action'`, so the migration moves **everyone** to WoW (with a one-time toast). Is that acceptable, or should old profiles stay Aksiyon? | Everybody flips to WoW (game unreleased; user asked for WoW default). One-line change in the migration to keep `'aksiyon'` instead. |
| Q3 | LMB click on a **non-party NPC** "selects" it per §12, but the target frame, `target:changed` and `hardTarget` are enemy-only. Add an NPC selection (name plate frame, no combat)? | No NPC selection in v1: LMB on an NPC does nothing (hover cursor + RMB interact work). |
| Q4 | `ExtraBars` use Shift/Ctrl + Digit 1–8; Shift = dodge, Ctrl = walk. In WoW the digits are main skills. Move the extra-bar modifiers (for example to Alt + digit, with `freeCursor` yielding) or leave? | Left as is (pre-existing, not worsened by this spec). |
| Q5 | The HUD needs the "armed" flag. `HudCtx` has no controller handle. Add `G.controller?: PlayerController` (G.ts is core-owned, append-only) or emit `autoattack:state { armed, targetId }` in `core/events.ts`? | Add the event `autoattack:state` (cheap, decoupled); W2-A emits on change, W2-B listens. (If the orchestrator prefers `G.controller`, only those two packages change.) |
| Q6 | WoW has `A/D` turn and `Q/E` strafe; here `A/D` strafe and `←/→` turn. Is a "WoW classic turning" toggle wanted (A/D turn, strafe on Q/E would collide with s2/s3)? | No toggle; `turnLeft/turnRight` are rebindable, so a player may bind A/D there and move strafe elsewhere. |
| Q7 | Auto-attack finisher gap (0.20 s) and the 8 s leash are tuning numbers. SimBench's APL treats LMB as always-on; the gap lowers LMB uptime by roughly 5 % per 4-step chain. Re-tune via `specTuning` or drop the gap? | Keep 0.20 s; SimBench models it as a constant `autoChainGap` per chain (CM4 note). |
