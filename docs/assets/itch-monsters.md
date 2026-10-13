# itch.io monsters: Bestiary, Universal Animation Libraries, Fantasy Creatures (converted)

Four itch.io packs converted to skinned, animated, PSX-ready GLBs for EFSUN ONLINE: **14 GLBs, 13.5 MB** plus 38 loose variant / FX textures (<= 256 px). Every model is one skinned mesh set on one armature, all clips are **in place** (no root motion) and the sizes follow the scale contract. Licences and credits: `docs/assets/credits-itch.md` (group *monsters*). Contact sheet (posed from the real clips): `docs/assets/previews/itch-monsters.png`. Verify everything with `node tools/verify-monsters.mjs`.

| Pack | Public folder | GLBs | Licence |
|---|---|---:|---|
| Quaternius **Universal Animation Library 1 + 2** (Standard) | `/assets/models/itch/ual/` | 1 (mannequin + 85 clips) | CC0 |
| Quaternius **Bestiary - Dungeon Monsters Kit** (Standard, 2 of 7 monsters) | `/assets/models/itch/bestiary/` | 2 (37 clips each) | Quaternius Asset License v1.0 (free, commercial use, no credit; **no redistribution of the assets as assets**) |
| algumacoisaqq **Fantasy Creatures** (Beasts + Insectoids) | `/assets/models/itch/creatures/` | 11 | CC0 |

## 0. Conventions (read first)

* **Scale contract** (ARCHITECTURE rule 7): 1 unit = 1 m, KayKit hero 2.4 m (= 1.8 m human x 4/3), +Y up, **models face +Z**, origin on the ground at the body centre (the wasp hovers: its origin is the floor under it). `rotation.y = Math.atan2(dx, dz)` aims them.
* **Rigs**: one `Armature` / `Rig` node with the skinned mesh node(s) as siblings, no extensions, no morph targets. Bestiary + mannequin use the 65-bone Unreal-mannequin skeleton (the Bestiary has 55 of them); the creatures use plain bone hierarchies (`Root`, `Hips`, ..., `Socket_*` attachment bones, an unused `Motion` root bone).
* **Clips are in place.** The creature pack drives travel with its `Motion` bone; that translation is removed from the clips and recorded as `travel` (metres per play) and `speed` (m/s) in the sidecar JSON, so you move the body in code and set `timeScale = actualSpeed / clip.speed` to stop foot sliding. The UAL clips come from the non-root-motion library files.
* **Clip names are clean** (`Idle`, `Walk`, `Run`, `Attack_1H_1`, `Bite`, `Death`, ...), no suffixes. Loop / once information lives in the sidecar JSONs and in the tables below (**loop** clips end on their first pose, **once** clips start and end near the rest pose; play `Death*` with `LoopOnce` + `clampWhenFinished = true`). Clips start at t = 0 and last exactly the source length (30 fps source, keys thinned by `glbopt.py`: rotation error <= 0.05 deg, translation <= 0.4 mm).
* **Materials**: one palette texture (256 colours, <= 256 px), NEAREST sampler, metallic 0 / roughness 1, no normal / ORM / emissive maps (the Bestiary glow is baked into the colour), no extensions. Alpha: `wasp_wing` is MASK (membrane ordered-dithered to 0/255), `ooze_body` is the single BLEND material (translucent jelly), everything else is opaque. Back-face culling is on except `imp_main`, `puglin_main` and `wasp_wing` (thin cloth / collar / wings are double-sided). `Assets.onModelLoaded` still applies the usual PSX patch.
* **Colour variants** are separate 256 px PNGs on the same UVs in `/assets/textures/itch/<bestiary|creatures>/`; the GLB embeds variant 1. Swap at runtime:

```ts
const tex = new THREE.TextureLoader().load("/assets/textures/itch/creatures/wolf_black.png");
tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = tex.minFilter = THREE.NearestFilter;
mesh.material = mesh.material.clone(); mesh.material.map = tex;   // mesh = the skinned mesh (SkinnedMesh) of the loaded scene
```

* Per-clip sidecars for game code: `/assets/models/itch/creatures/creatures.json`, `/assets/models/itch/bestiary/bestiary.json`, `/assets/models/itch/ual/UAL_clips.json` (duration, loop, travel, speed, event times such as the frame a bite lands).

## 1. Bestiary - Dungeon Monsters Kit (Quaternius) - `/assets/models/itch/bestiary/`

The free *Standard* download contains **2 of the 7 monsters**: Puglin (goblin-pig) and Imp. Both share the Unreal-mannequin bone **names** of the Universal Animation Library: the Bestiary rig has 55 bones and is an exact subset of the UAL rig (65 bones; missing: `pinky_01..04_l/r`, `ball_leaf_l/r`), same hierarchy. The rest poses differ (hunched spine, other arm angles), so the clips are retargeted **by bone name as rest-relative local rotations** (each bone plays the same delta from its own rest pose, verified numerically: <= 0.04 deg difference to the UAL deltas), channels of missing bones are dropped and translation (pelvis / root) is scaled by the rig's leg-length ratio. Both monsters use the same model scale **x1.75** so the pack's relative sizes are kept: Puglin 0.93 m -> 1.6 m (goblin class), Imp 1.68 m -> 2.9 m (brute class). Meshes are joined into one skinned mesh per monster (the Imp mace, chains, collar and shorts, the Puglin stick and tusks are part of it; the original 2048 px PBR set is reduced to one 256 px colour map, UV set 0 only).

| URL | KB | tris | W x H x D (m) | bones | variants (texture files) |
|---|---:|---:|---|---:|---|
| `/assets/models/itch/bestiary/puglin.glb` | 1390 | 7528 | 2.57 x 1.63 x 1.07 (T-pose, arms out) | 55 | `puglin_1`, `puglin_2`, `puglin_3` |
| `/assets/models/itch/bestiary/imp.glb` | 1785 | 15232 | 3.07 x 2.94 x 1.18 (T-pose, arms out) | 55 | `imp_1`, `imp_2`, `imp_3` |

Native size -> exported: Puglin 0.931 m -> 1.63 m (scale 1.75, pelvis 0.69 m, translation factor 0.752), Imp 1.678 m -> 2.94 m (scale 1.75, pelvis 1.41 m, translation factor 1.541). Tri counts are the pack's own (Imp 15.2k, Puglin 7.5k, no decimation): fine for a few dozen on screen, make an LOD or decimate if you need crowds. Variants: `*_1` red imp / green puglin (embedded), `*_2` green imp / red puglin, `*_3` blue for both.

**Suggested enemy roles**

* **puglin**: Goblin-class grunt (1.6 m): melee trash in packs of 4-8 with the stick (Attack_1H_*), a thrower with `Throw`, an ambusher with `Crouch_Idle` -> `Charge`. Scale x1.4 (2.3 m) gives a chieftain / mini-boss. Hunched silhouette reads well in goblin camps, mines and the early dungeon floors.
* **imp**: Brute-class elite (2.9 m) with spiked mace and chains: slow heavy hitter (`Attack_2H`, `Attack_2H_Combo`, `Charge`), chain-gang mini-boss at x1.3 (3.8 m). `Walk_Zombie` / `Idle_Zombie` give a shambling hell-thrall variant; `Cast_*` + `Spellcast` turn it into a fire caster. Fits demonic / infernal floors and boss-room guards.

### 1.1 Clip list (identical for both monsters, 37 clips)

`S` = seconds, **loop** clips repeat, **once** clips are one-shots. "Foot-lock speed" is the move speed at which the legs do not slide (UAL root-motion distance x leg-length ratio: Imp x1.54, Puglin x0.75); use it as `timeScale = speed / footLock`.

| clip | S | mode | foot-lock m/s Imp / Puglin | source UAL clip | note |
|---|---:|---|---|---|---|
| `Idle` | 2.5 | loop | - | `Idle_Loop` | neutral breathing idle |
| `Idle_Combat` | 1.67 | loop | - | `Sword_Idle` | guard stance with a weapon, use while aggroed |
| `Idle_Zombie` | 1.33 | loop | - | `Zombie_Idle_Loop` | hunched, swaying idle (undead / brutish look) |
| `Walk` | 1.33 | loop | 1.50 / 0.73 | `Walk_Loop` | normal walk |
| `Walk_Zombie` | 1.33 | loop | 1.62 / 0.79 | `Zombie_Walk_Fwd_Loop` | shambling walk, arms forward |
| `Run` | 0.93 | loop | 8.25 / 4.03 | `Jog_Fwd_Loop` | jog |
| `Sprint` | 0.67 | loop | 12.71 / 6.20 | `Sprint_Loop` | full sprint |
| `Crouch_Idle` | 2.93 | loop | - | `Crouch_Idle_Loop` | ambush / sneak idle |
| `Crouch_Walk` | 2 | loop | 1.16 / 0.56 | `Crouch_Fwd_Loop` | sneak walk |
| `Attack_1H_1` | 0.43 | once | - | `Sword_Regular_A` | fast one-hand slash 1 (0.43 s) |
| `Attack_1H_2` | 0.53 | once | - | `Sword_Regular_B` | one-hand slash 2 (0.53 s) |
| `Attack_1H_3` | 2 | once | - | `Sword_Regular_C` | one-hand slash 3 / finisher (2.0 s with recovery) |
| `Attack_1H_Combo` | 3 | once | - | `Sword_Regular_Combo` | three-hit one-hand combo in one clip |
| `Attack_2H` | 1.53 | once | - | `Sword_Attack` | single heavy swing (1.5 s) |
| `Attack_2H_Combo` | 4.33 | once | - | `Sword_Heavy_Combo` | heavy multi-swing combo (4.3 s) |
| `Punch` | 0.87 | once | - | `Punch_Jab` | jab |
| `Punch_2` | 1 | once | - | `Punch_Cross` | cross |
| `Punch_Hook` | 0.47 | once | - | `Melee_Hook` | hook punch |
| `Shield_Bash` | 0.83 | once | - | `Shield_OneShot` | shield / forearm bash |
| `Charge` | 1.1 | once | 1.40 / 0.68 | `Shield_Dash` | shoulder-down rush (move the body forward in code) |
| `Dash` | 1.57 | once | 3.63 / 1.77 | `Sword_Dash` | lunging dash attack |
| `Cast_Start` | 0.53 | once | - | `Spell_Simple_Enter` | raise hands |
| `Cast_Loop` | 2.1 | loop | - | `Spell_Simple_Idle_Loop` | channel loop |
| `Spellcast` | 0.5 | once | - | `Spell_Simple_Shoot` | release a spell (0.53 s) |
| `Cast_End` | 0.43 | once | - | `Spell_Simple_Exit` | lower hands |
| `Throw` | 1.33 | once | - | `OverhandThrow` | overhand throw (spear, rock, bomb) |
| `Hit_Front` | 0.33 | once | - | `Hit_Chest` | flinch from a hit to the chest |
| `Hit_Head` | 0.43 | once | - | `Hit_Head` | head snap |
| `Hit_Knockback` | 0.83 | once | - | `Hit_Knockback` | knocked backwards |
| `Stagger` | 1.07 | once | - | `Idle_Shield_Break` | staggered / guard broken |
| `Death_A` | 2.4 | once | - | `Death01` | falls dead, holds the last pose (play once, clamp) |
| `Death_B` | 1.53 | once | - | `LayToIdle` (reversed, derived) | derived: LayToIdle reversed, sinks down and lies on the floor |
| `Taunt` | 2.5 | once | - | `Idle_Rail_Call` | calling / shouting gesture (best match for roar / taunt) |
| `Block` | 1.23 | once | - | `Sword_Block` | raise guard and take the hit |
| `Block_Idle` | 2.5 | loop | - | `Idle_Shield_Loop` | shield guard loop |
| `Dodge` | 1.47 | once | 5.24 / 2.56 | `Roll` | forward roll (move the body in code) |
| `GetUp` | 1.53 | once | - | `LayToIdle` | rise from the floor (also use as spawn / wake-up) |

Not in the libraries, so **not invented**: `Kick`, `Roar`, `Strafe_L` / `Strafe_R`, `Hit_Back` (use `Taunt` as the shout, `Hit_Front` / `Hit_Head` / `Hit_Knockback` for reactions, `Walk` with a fixed facing for strafing). `Death_B` is derived (the `LayToIdle` clip played backwards: the monster sinks down and lies on the floor); `GetUp` doubles as the spawn / wake-up animation. All 85 other UAL clips (sitting, farming, swimming, pistol, ...) are in `UAL_clips.glb` and can be retargeted onto the monsters with the same recipe if you need them.

## 2. Universal Animation Library 1 + 2 (Quaternius, CC0) - `/assets/models/itch/ual/UAL_clips.glb`

One GLB with the **male mannequin and all 85 clips of both libraries** (UAL 1: 43 clips, UAL 2: 42 clips, one duplicate `A_TPose` removed), original clip names, for runtime retargeting onto any rig that has the same bone names, or as a stand-in dummy. Source files: the *Standard* (no root motion) GLBs. Scaled **x4/3** to the hero scale: mannequin 2.44 m tall (T-pose 2.59 m wide), 13743 tris, 65 bones, `M_Main` / `M_Joints` flat colours, 3023 KB.

Retarget recipe (what the Bestiary monsters got): same bone name -> same **rest-relative** local rotation; scale the pelvis / root translation by `targetPelvisHeight / 1.2223` (this file's pelvis rest height in metres); skip bones the target does not have. With three.js: `SkeletonUtils.retargetClip(targetMesh, sourceMesh, clip, { hip: "pelvis" })`, or copy the quaternions by name after multiplying with `inverse(sourceRest) * targetRest` in the node's parent space.

Move speeds are the root-motion distances of the `_RM` library files (x4/3 for this scale).

| clip | S | lib | m/s | clip | S | lib | m/s |
|---|---:|---|---:|---|---:|---|---:|
| `A_TPose` | 2.5 | UAL1 |  | `Chest_Open` | 1.37 | UAL2 |  |
| `Crouch_Fwd_Loop` | 2 | UAL1 | 1.00 | `ClimbUp_1m` | 0.67 | UAL2 |  |
| `Crouch_Idle_Loop` | 2.93 | UAL1 |  | `Consume` | 1.33 | UAL2 |  |
| `Dance_Loop` | 1 | UAL1 |  | `Farm_Harvest` | 2.5 | UAL2 |  |
| `Death01` | 2.4 | UAL1 |  | `Farm_PlantSeed` | 2.77 | UAL2 |  |
| `Driving_Loop` | 1.67 | UAL1 |  | `Farm_Watering` | 3.8 | UAL2 |  |
| `Fixing_Kneeling` | 5.2 | UAL1 |  | `Hit_Knockback` | 0.83 | UAL2 |  |
| `Hit_Chest` | 0.33 | UAL1 |  | `Idle_FoldArms_Loop` | 2.5 | UAL2 |  |
| `Hit_Head` | 0.43 | UAL1 |  | `Idle_Lantern_Loop` | 2.5 | UAL2 |  |
| `Idle_Loop` | 2.5 | UAL1 |  | `Idle_No_Loop` | 2.5 | UAL2 |  |
| `Idle_Talking_Loop` | 2.93 | UAL1 |  | `Idle_Rail_Call` | 2.5 | UAL2 |  |
| `Idle_Torch_Loop` | 1.27 | UAL1 |  | `Idle_Rail_Loop` | 2.5 | UAL2 |  |
| `Interact` | 2 | UAL1 |  | `Idle_Shield_Break` | 1.07 | UAL2 |  |
| `Jog_Fwd_Loop` | 0.93 | UAL1 | 7.14 | `Idle_Shield_Loop` | 2.5 | UAL2 |  |
| `Jump_Land` | 1.27 | UAL1 |  | `Idle_TalkingPhone_Loop` | 2.93 | UAL2 |  |
| `Jump_Loop` | 2.5 | UAL1 |  | `LayToIdle` | 1.53 | UAL2 |  |
| `Jump_Start` | 1.33 | UAL1 |  | `Melee_Hook` | 0.47 | UAL2 |  |
| `PickUp_Table` | 0.83 | UAL1 |  | `Melee_Hook_Rec` | 0.6 | UAL2 |  |
| `Pistol_Aim_Down` | 0.17 | UAL1 |  | `NinjaJump_Idle_Loop` | 2 | UAL2 |  |
| `Pistol_Aim_Neutral` | 0.17 | UAL1 |  | `NinjaJump_Land` | 1.27 | UAL2 |  |
| `Pistol_Aim_Up` | 0.17 | UAL1 |  | `NinjaJump_Start` | 0.97 | UAL2 |  |
| `Pistol_Idle_Loop` | 1.67 | UAL1 |  | `OverhandThrow` | 1.33 | UAL2 |  |
| `Pistol_Reload` | 1.67 | UAL1 |  | `Shield_Dash` | 1.1 | UAL2 | 1.21 |
| `Pistol_Shoot` | 0.63 | UAL1 |  | `Shield_OneShot` | 0.83 | UAL2 |  |
| `Punch_Cross` | 1 | UAL1 |  | `Slide_Exit` | 0.5 | UAL2 |  |
| `Punch_Jab` | 0.87 | UAL1 |  | `Slide_Loop` | 2 | UAL2 | 6.00 |
| `Push_Loop` | 2.67 | UAL1 |  | `Slide_Start` | 0.83 | UAL2 |  |
| `Roll` | 1.47 | UAL1 | 4.54 | `Sword_Block` | 1.23 | UAL2 |  |
| `Sitting_Enter` | 1.3 | UAL1 |  | `Sword_Dash` | 1.57 | UAL2 | 3.14 |
| `Sitting_Exit` | 1.03 | UAL1 |  | `Sword_Heavy_Combo` | 4.33 | UAL2 |  |
| `Sitting_Idle_Loop` | 1.67 | UAL1 |  | `Sword_Regular_A` | 0.43 | UAL2 |  |
| `Sitting_Talking_Loop` | 2.93 | UAL1 |  | `Sword_Regular_A_Rec` | 0.97 | UAL2 |  |
| `Spell_Simple_Enter` | 0.53 | UAL1 |  | `Sword_Regular_B` | 0.53 | UAL2 |  |
| `Spell_Simple_Exit` | 0.43 | UAL1 |  | `Sword_Regular_B_Rec` | 1.03 | UAL2 |  |
| `Spell_Simple_Idle_Loop` | 2.1 | UAL1 |  | `Sword_Regular_C` | 2 | UAL2 |  |
| `Spell_Simple_Shoot` | 0.5 | UAL1 |  | `Sword_Regular_Combo` | 3 | UAL2 |  |
| `Sprint_Loop` | 0.67 | UAL1 | 11.00 | `TreeChopping_Loop` | 0.97 | UAL2 |  |
| `Swim_Fwd_Loop` | 1.33 | UAL1 | 2.90 | `Walk_Carry_Loop` | 2 | UAL2 | 0.87 |
| `Swim_Idle_Loop` | 3.33 | UAL1 |  | `Yes` | 2.5 | UAL2 |  |
| `Sword_Attack` | 1.53 | UAL1 |  | `Zombie_Idle_Loop` | 1.33 | UAL2 |  |
| `Sword_Idle` | 1.67 | UAL1 |  | `Zombie_Scratch` | 1.8 | UAL2 |  |
| `Walk_Formal_Loop` | 1.33 | UAL1 | 1.30 | `Zombie_Walk_Fwd_Loop` | 1.33 | UAL2 | 1.40 |
| `Walk_Loop` | 1.33 | UAL1 | 1.30 |  |  |  |  |

## 3. Fantasy Creatures (algumacoisaqq, CC0) - `/assets/models/itch/creatures/`

Eleven rigged creatures (the archive's own README says they are AI-generated with scripted Blender models; licence CC0). Each creature's per-clip FBX files (`Wolf@Bite.fbx`, ...) are merged into **one GLB** with every clip as an animation named like the file (`Bite`). The pack's `*_clips.json` loop flags and event times are kept in `creatures.json`; textures are 1024 px RGB + smoothness alpha in the source: reduced to **256 px, 256-colour RGB** (smoothness dropped). Model scale = pack metres x the factor below (x4/3 is the hero ratio; the rat, mammoth, spider, ooze and centipede follow the brief sizes).

| URL | scale | W x H x D (m) | tris | KB | bones | nodes | variants |
|---|---:|---|---:|---:|---:|---|---|
| `/assets/models/itch/creatures/wolf.glb` | x1.33 | 0.40 x 1.41 x 2.27 | 4850 | 521 | 41 | `WolfBody` | `wolf`, `wolf_black`, `wolf_white` |
| `/assets/models/itch/creatures/warg.glb` | x1.33 | 1.04 x 1.79 x 3.20 | 8940 | 848 | 41 | `WargBody`, `WargMask`, `WargTack` | `warg`, `warg_ash`, `warg_black` |
| `/assets/models/itch/creatures/rat.glb` | x1.05 | 0.46 x 0.50 x 1.70 | 3163 | 445 | 41 | `RatBody` | `rat`, `rat_black`, `rat_plague` |
| `/assets/models/itch/creatures/bear.glb` | x1.33 | 1.47 x 2.06 x 3.37 | 4710 | 550 | 37 | `BearBody` | `bear`, `bear_old` |
| `/assets/models/itch/creatures/rhino.glb` | x1.33 | 2.10 x 2.55 x 4.73 | 4944 | 514 | 38 | `RhinoBody`, `Spear` | `rhino` |
| `/assets/models/itch/creatures/mammoth.glb` | x1.25 | 2.54 x 3.98 x 6.76 | 6268 | 644 | 44 | `MammothBody` | `mammoth`, `mammoth_dark` |
| `/assets/models/itch/creatures/deer.glb` | x1.33 | 1.25 x 3.15 x 2.73 | 5390 | 504 | 38 | `DeerBody` | `deer` |
| `/assets/models/itch/creatures/ooze.glb` | x1.08 | 3.28 x 1.50 x 3.17 | 4914 | 761 | 47 | `OozeBody`, `OozeContents` | `ooze_green`, `ooze_grey`, `ooze_black`, `ooze_ochre`, `ooze_crimson` |
| `/assets/models/itch/creatures/spider.glb` | x1.35 | 3.01 x 1.23 x 3.21 | 5012 | 722 | 58 | `SpiderBody` | `spider`, `spider_pale` |
| `/assets/models/itch/creatures/centipede.glb` | x0.80 | 0.75 x 0.30 x 3.62 | 5448 | 1655 | 107 | `CentipedeBody` | `centipede` |
| `/assets/models/itch/creatures/wasp.glb` | x1.00 | 2.01 x 1.08 x 1.84 | 4280 | 476 | 44 | `WaspBody` | `wasp` |

Heights are the bind-pose AABB (the Idle clip starts on it; the wasp spans y 0.95-2.04 because it hovers; the deer height includes the raised head and antlers; the ooze is 3.3 m across with its pseudopods out). Extra FX textures (256 px or smaller, RGBA): `/assets/textures/itch/creatures/fx/` (`ooze_drop`, `ooze_splat`, `ooze_flat`, `spider_web`, `centipede_hole`).

### 3.1 Per creature: roles and full clip lists

Clip format: `Name seconds` + `loop` (else once) + `m/s` (speed that the in-place clip represents) + `@t` (event times in seconds: bite lands, howl, split, ...).

#### Wolf - `/assets/models/itch/creatures/wolf.glb`

1.41 m tall, 0.40 x 2.27 footprint, 4850 tris, 521 KB, 41 bones. Nodes: `WolfBody`. **Roles**: Fast pack melee trash on forest, cave and graveyard floors. `Howl` (3.5 s, event at 0.8 s) can summon 1-2 more wolves, `Lunge` is a leap attack (2.1 m of travel, bite at 0.87 s). White / black variants for frost / night packs.

Clips (12): `Idle` 4 loop / `IdlePant` 3 loop / `Walk` 0.8 loop 1.33 m/s / `Trot` 0.53 loop 2.75 m/s / `Run` 0.4 loop 7.33 m/s / `Bite` 1.1 @Bite=0.47 / `Lunge` 1.5 1.42 m/s (2.13 m travel) @Bite=0.87 / `Threat` 2.4 / `Howl` 3.5 @Howl=0.8 / `Hit` 0.5 / `Death` 2.2 @Dead=1.9 / `GetUp` 1.5

#### Warg - `/assets/models/itch/creatures/warg.glb`

1.79 m tall, 1.04 x 3.20 footprint, 8940 tris, 848 KB, 41 bones. Nodes: `WargBody`, `WargMask`, `WargTack`. **Roles**: Elite wolf and goblin mount: three meshes on one rig, `WargBody` always, `WargTack` (saddle, straps, bridle) and `WargMask` (bone war-mask) for the war-pack version; a rider sits on bone `Socket_Saddle`. Pair with the Puglin for "goblin rider" packs, or use alone as a pack leader / mini-boss at x1.3.

Clips (12): `Idle` 4 loop / `IdlePant` 3 loop / `Walk` 0.93 loop 1.54 m/s / `Trot` 0.6 loop 3.30 m/s / `Run` 0.47 loop 8.48 m/s / `Bite` 1.2 @Bite=0.5 / `Lunge` 1.6 1.80 m/s (2.88 m travel) @Bite=0.93 / `Threat` 2.4 / `Howl` 3.5 @Howl=0.8 / `Hit` 0.5 / `Death` 2.2 @Dead=1.9 / `GetUp` 1.5

#### Rat - `/assets/models/itch/creatures/rat.glb`

0.50 m tall, 0.46 x 1.70 footprint, 3163 tris, 445 KB, 41 bones. Nodes: `RatBody`. **Roles**: Swarm trash for sewers, crypts and cellars (0.5 m tall, 1.7 m with tail). `Rear` is the threat display, `Lunge` a short pounce. The plague variant is the poison / disease DoT version, black the cheaper reskin.

Clips (10): `Idle` 3 loop / `Rear` 2.8 / `Walk` 0.53 loop 0.91 m/s / `Run` 0.33 loop 2.84 m/s / `Bite` 0.8 @Bite=0.4 / `Lunge` 1.2 0.70 m/s (0.84 m travel) @Bite=0.73 / `Threat` 2 / `Hit` 0.4 / `Death` 1.8 @Dead=1.6 / `GetUp` 1.1

#### Bear - `/assets/models/itch/creatures/bear.glb`

2.06 m tall, 1.47 x 3.37 footprint, 4710 tris, 550 KB, 37 bones. Nodes: `BearBody`. **Roles**: Heavy melee elite for caves and forests. `Sleep` -> `Wake` makes an ambush or a sleeping mini-boss, `Rear` + `Roar` (event at 0.9 s / 0.3 s) is the aggro buff, `Slam` a ground-pound AoE (impact 0.77 s), `Hug` a grab (0.73 s), `Swipe` / `Bite` the basic hits. Old variant is a scarred boss version.

Clips (13): `Sleep` 3 loop / `Wake` 1.5 / `Idle` 3 loop / `Walk` 1.07 loop 1.38 m/s / `Run` 0.43 loop 7.08 m/s / `Swipe` 1 @Bite=0.42 / `Bite` 1 @Bite=0.4 / `Slam` 1.4 @Bite=0.77 / `Hug` 2 @Bite=0.73 / `Rear` 2.7 @Roar=0.9 / `Roar` 2 @Roar=0.3 / `Hit` 0.47 / `Death` 2 @Dead=1.6

#### Rhino - `/assets/models/itch/creatures/rhino.glb`

2.55 m tall, 2.10 x 4.73 footprint, 4944 tris, 514 KB, 38 bones. Nodes: `RhinoBody`, `Spear`. **Roles**: Charging brute: `Charge` (4.0 m per 0.33 s cycle) in a line, `Daze` as the stun window after it hits a wall, `Gore` and `Stamp` (AoE at 1.0 s) as melee. The snapped spear in its shoulder is the separate mesh node `Spear` (hide it for an unhurt rhino). Arena / steppe elite.

Clips (13): `Sleep` 3 loop / `Wake` 1.5 / `Idle` 2.5 loop / `Walk` 1 loop 1.73 m/s / `Run` 0.53 loop 5.00 m/s / `Charge` 0.33 loop 12.01 m/s / `Gore` 1 @Bite=0.45 / `Paw` 1.2 loop / `Daze` 2 loop / `Stamp` 1.3 @Bite=1 / `Roar` 1.5 @Roar=0.3 / `Hit` 0.4 / `Death` 2 @Dead=1.6

#### Mammoth - `/assets/models/itch/creatures/mammoth.glb`

3.98 m tall, 2.54 x 6.76 footprint, 6268 tris, 644 KB, 44 bones. Nodes: `MammothBody`. **Roles**: Boss-size (4.0 m) beast for ice caves and steppe: `Stomp` AoE (impact 1.03 s), `TuskSwipe` (0.5 s), `Trumpet` (buff / summon, event 0.6 s), `Charge` (5.3 m per cycle). Also a good mount-sized neutral or an "ancient beast" world boss at x1.5. Dark variant for the frozen / undead version.

Clips (12): `Sleep` 4 loop / `Wake` 2 / `Idle` 3 loop / `Walk` 1.6 loop 1.72 m/s / `Run` 0.8 loop 5.62 m/s / `Charge` 0.67 loop 7.87 m/s / `Trumpet` 2 @Roar=0.6 / `TuskSwipe` 1.2 @Bite=0.5 / `Stomp` 1.6 @Bite=1.03 / `Graze` 4 loop / `Hit` 0.5 / `Death` 2.5 @Dead=2.2

#### Deer - `/assets/models/itch/creatures/deer.glb`

3.15 m tall, 1.25 x 2.73 footprint, 5390 tris, 504 KB, 38 bones. Nodes: `DeerBody`. **Roles**: Neutral wildlife and ambience (3.2 m with antlers): `Graze`, `Alert`, `Trot` and a fast `Run` flee (10.9 m/s). `Attack` (antler butt, 0.5 s) turns it into a cornered-stag elite or a hunting-quest target.

Clips (11): `Idle` 4 loop / `Graze` 5 loop 0.04 m/s / `Alert` 1.5 / `Walk` 1.2 loop 1.44 m/s / `Trot` 0.67 loop 3.90 m/s / `Run` 0.47 loop 10.85 m/s / `Attack` 1.2 @Bite=0.5 / `Hit` 0.5 / `Death` 2.2 @Dead=1.9 / `Sleep` 4 loop / `Wake` 2

#### Ooze - `/assets/models/itch/creatures/ooze.glb`

1.50 m tall, 3.28 x 3.17 footprint, 4914 tris, 761 KB, 47 bones. Nodes: `OozeBody`, `OozeContents`. **Roles**: Acid / slime mob with five colour ramps (green acid, grey, black pudding = more opaque tank, ochre, crimson). `Lash` and `Grab` melee, `Spit` ranged (0.7 s), `Engulf` (grab at 0.73 s, swallow at 1.53 s) as a heavy hit, `Puddle` = disguised ambusher, `Rise` to reveal. `Split` (event at 1.93 s) is the moment to swap in two half-size oozes playing `Reform`. The jelly body is the only alpha-BLEND material in the pack; `OozeContents` (skull, bones, helm, coins, sword) is a second mesh node.

Textures: `ooze_green` (embedded), `ooze_grey`, `ooze_black`, `ooze_ochre`, `ooze_crimson` swap on `OozeBody` (RGBA, alpha = jelly opacity); `ooze_contents` on `OozeContents`.

Clips (12): `Idle` 3 loop / `Crawl` 2 loop 0.65 m/s / `Lash` 1.33 @Hit=0.67 / `Grab` 1.47 @Hit=0.6 / `Engulf` 2.67 @Grab=0.73 @Engulf=1.53 / `Spit` 1.47 @Spit=0.7 / `Hit` 0.8 @Hurt=0.07 / `Death` 2.33 @Dead=1.87 / `Puddle` 3 loop / `Rise` 1.67 @Risen=1 / `Split` 2.5 @Split=1.93 / `Reform` 1.67

#### Spider - `/assets/models/itch/creatures/spider.glb`

1.23 m tall, 3.01 x 3.21 footprint, 5012 tris, 722 KB, 58 bones. Nodes: `SpiderBody`. **Roles**: Horse-sized ambush hunter for caves, webbed crypts and the deep floors (3.0 m across the legs, 1.2 m high): `Strike` leap (0.73 s), `Bite` (poison, 0.5 s), `WebSpit` (ranged root / slow, release 0.67 s). The pale variant is the deep-cave version. Bone `Socket_Saddle` allows a rider / boss-mount.

Clips (10): `GetUp` 1.33 / `Idle` 3 loop / `Walk` 0.8 loop 1.69 m/s / `Run` 0.4 loop 5.06 m/s / `Hit` 0.5 / `Death` 2 @Dead=1.75 / `Bite` 1.2 @Bite=0.5 / `Strike` 1.33 @Strike=0.73 / `WebSpit` 1.6 @Spit=0.67 / `Threat` 2.4

#### Centipede - `/assets/models/itch/creatures/centipede.glb`

0.30 m tall, 0.75 x 3.62 footprint, 5448 tris, 1655 KB, 107 bones. Nodes: `CentipedeBody`. **Roles**: Long, low burrower (3.6 m long, 0.3 m high): `Burrow` / `Emerge` (2.3 / 1.9 m of travel) for tunnel ambushes, `Bite` (poison, 0.55 s), `Threat` display. Use an elongated hit capsule and let it dive into the floor with a dust VFX at the `Burrow` event (0.57 s).

Clips (10): `Idle` 3 loop / `Walk` 0.9 loop 1.19 m/s / `Run` 0.6 loop 3.16 m/s / `Threat` 2.5 / `Bite` 1.2 @Bite=0.55 / `Burrow` 2.5 0.73 m/s (1.83 m travel) @Burrow=0.57 / `Emerge` 2.5 0.60 m/s (1.50 m travel) @Emerge=0.58 / `Hit` 0.5 / `Death` 2 @Dead=1.85 / `GetUp` 1.5

#### Wasp - `/assets/models/itch/creatures/wasp.glb`

1.08 m tall, 2.01 x 1.84 footprint, 4280 tris, 476 KB, 44 bones. Nodes: `WaspBody`. **Roles**: Flying trash and swarm enemy: **hover is baked in** (body y 0.95-2.05, put the origin on the floor). `Fly` is 4 m/s, `Sting` (0.6 s) in place, `Dive` (sting at 0.9 s) as a swoop you drive with code, `Death` falls to the floor. Wings are 42 triangles of ordered-dither MASK (stippled membrane + solid veins).

Clips (8): `Idle` 2 loop / `Fly` 1 loop 4.00 m/s / `Threat` 1.6 / `Sting` 1.3 @Sting=0.6 / `Dive` 1.8 @Sting=0.9 / `Hit` 0.5 / `Death` 2 @Dead=1.75 / `GetUp` 1.5

## 4. Rebuilding

```bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"      # one Blender process at a time
python -I tools/blender/itch_monsters/texkit.py .asset-cache/itch/monsters public                    # textures (Pillow + numpy)
"$B" --background --factory-startup --python tools/blender/itch_monsters/convert_ual.py -- <UAL1_Standard.glb> <UAL2_Standard.glb> public/assets/models/itch/ual/UAL_clips.glb tools/blender/itch_monsters/_reports/ual.json
"$B" --background --factory-startup --python tools/blender/itch_monsters/convert_bestiary.py -- <UAL1.glb> <UAL2.glb> <Bestiary GLB dir> public/assets/textures/itch/bestiary public/assets/models/itch/bestiary tools/blender/itch_monsters/_reports/bestiary.json
"$B" --background --factory-startup --python tools/blender/itch_monsters/convert_creatures.py -- <Creatures dir> public/assets/textures/itch/creatures public/assets/models/itch/creatures tools/blender/itch_monsters/_reports/creatures.json [Name ...]
for f in public/assets/models/itch/{ual,bestiary,creatures}/*.glb; do python -I tools/blender/itch_monsters/glbopt.py $f; done   # time shift, key thinning
python -I tools/blender/itch_monsters/rm_speeds.py <UAL1_Standard_RM.glb> <UAL2_Standard_RM.glb> tools/blender/itch_monsters/_reports/ual_rm_speeds.json
python -I tools/blender/itch_monsters/make_doc.py                                                       # this file + the sidecar JSONs
node tools/verify-monsters.mjs && node tools/glb-inspect.mjs public/assets/models/itch/creatures --short
```

Notes for whoever extends this: the glTF importer stashes every imported animation as an NLA track (`monlib.clear_nla` removes them before export); the exporter loses the last key of a clip when the strip end is 62.9999 instead of 63 (`monlib.add_clip` rounds up); `glbopt.py` must run after every export (clips start one frame late and every bone has constant scale / translation channels otherwise).
