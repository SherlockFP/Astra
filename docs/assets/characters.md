# Characters, enemies, bosses, NPCs: asset reference

This page covers every animated model kept for EFSUN ONLINE (player classes, enemies, bosses and NPCs) plus the weapon and prop meshes. All of them are **CC0**: see `credits-characters.md`. Raw inspector output (`tools/glb-inspect.mjs --json --short`) is in `characters.json`.

I measured heights by **evaluating the skinning** (joint world matrix × inverse bind matrix) at frame 0 of each model's idle clip. The plain inspector AABB is misleading for the Quaternius files, because their raw vertex data is Z-up at 1/100 scale. Unless stated otherwise, every value below is in native glTF units (metres).

## 0. Conventions that apply to every file

* **Forward axis is +Z for all models.** I checked this on toe and foot-end bones, IK knee pole targets, eye meshes and the direction of attack lunges. In three.js, `object.lookAt(target)` on a non-camera object points +Z at the target, so `model.lookAt(enemy)` and `rotation.y = Math.atan2(dx, dz)` work without any offset.
* **Origin is at the feet** (min Y ≈ 0). Flyers (Bat, Ghost, Imp, Dragon_Evolved) have the hover height baked in (min Y 0.3–0.6), so place their root on the ground.
* **Clip names:** KayKit clips are plain (`Idle`). Quaternius clips carry an armature prefix, for example `EnemyArmature|EnemyArmature|EnemyArmature|Attack`, `CharacterArmature|Idle`, `MonsterArmature|Bite_Front` or `BatArmature|Bat_Flying`. Always look a clip up by suffix:
  `const clip = (clips, n) => clips.find(c => c.name === n || c.name.endsWith('|' + n));`
* **Toggleable meshes:** glTF has no visibility flag, so **every accessory mesh renders by default**. A Knight shows two swords and four shields at once. On load, hide everything that is not in the loadout (`getObjectByName(name).visible = false`). Section 1 lists the recommended default sets.
* **Shared rig:** all 9 KayKit GLBs (5 adventurers + 4 skeletons) use the **same 41-bone rig with identical bone names** (`root, hips, spine, chest, head, upperarm.l … hand.l, handslot.l, … handslot.r, upperleg.l … toes.r` plus IK/control helpers). Any KayKit clip plays on any KayKit model, so the skeleton-only clips (`Spawn_Ground_Skeletons`, `Taunt`, `Spellcast_Summon`, …) also work on players.
* **Hordes:** use `SkeletonUtils.clone(gltf.scene)` from `three/examples/jsm/utils/SkeletonUtils.js` for every enemy instance (a plain `.clone()` breaks skinning). Share the `AnimationClip`s and give each instance its own `AnimationMixer`. For crowds of 40+ enemies, update far-away mixers every 2nd or 3rd frame.
* **Frustum culling:** a SkinnedMesh bounding sphere is computed once from the bind pose. Quaternius attack and fly clips move far from it, so set `frustumCulled = false` on enemy meshes, or recompute `computeBoundingSphere()` after the first `mixer.update()`.
* **Materials for the PSX look:**
  * KayKit: one 1024×1024 palette texture per model (embedded PNG, mostly flat colour swatches; the sampler is linear with mipmaps). Set `tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false` for the chunky PSX texel look.
  * Quaternius: mostly flat colours per material (no texture). Goblin, Zombie, Demon, Yeti and Giant use one tiny 32×32 `Atlas.png` (also set it to nearest filtering). Their PBR values come from FBX2glTF (`metallicFactor 0.4`, `roughness 0.415`), which renders muddy and dark without an environment map. Override with `metalness = 0; roughness = 1` (or swap to `MeshLambertMaterial` / your PSX shader).
* **Suggested world scale:** 1 unit = 1 m, with the player at about 1.8 m. That gives **KayKit scale 0.75** (players and skeletons). Per-monster scales are in section 4.

---

## 1. Player classes: KayKit Adventurers (`/assets/models/characters/`)

| URL | Body height (skinned meshes only) | Height incl. headgear | Idle footprint X×Z | Tris (all / body) | Size | Material / texture |
|---|---|---|---|---|---|---|
| `/assets/models/characters/Knight.glb` | 2.30 | 2.45 (helmet) | 1.32×1.02 | 6952 / 4148 | 3.6 MB | `knight_texture` / embedded `knight_texture` PNG |
| `/assets/models/characters/Barbarian.glb` | 2.17 | 2.39 (hat) | 1.32×0.99 | 6543 / 4045 | 3.5 MB | `barbarian_texture` / embedded PNG |
| `/assets/models/characters/Mage.glb` | 2.19 | 2.70 (hat) | 1.35×1.27 | 5683 / 4029 | 3.5 MB | `mage_texture` / embedded PNG |
| `/assets/models/characters/Rogue.glb` | 2.17 | 2.17 (no headgear) | 1.32×1.02 | 6377 / 4263 | 3.5 MB | `rogue_texture` / embedded PNG |
| `/assets/models/characters/Rogue_Hooded.glb` | 2.24 (hood is part of the head mesh) | 2.24 | 1.32×1.16 | 6035 / 3921 | 3.5 MB | `rogue_texture` / embedded PNG |

Forward is +Z and every file has the same 76 clips (listed in 1.3). Licence: CC0, Kay Lousberg.

### 1.1 Toggleable child meshes (node names) and recommended default loadout

The body parts are skinned (`<Class>_ArmLeft/ArmRight/Body/Head/LegLeft/LegRight`). Accessories are rigid children of bones. **V** = keep visible by default, **h** = hide on load.

| Model | Right hand (`handslot.r`) | Left hand (`handslot.l`) | Head (`head`) | Back (`chest`) |
|---|---|---|---|---|
| Knight | **V** `1H_Sword`, h `2H_Sword` | **V** `Round_Shield`, h `Badge_Shield`, h `Rectangle_Shield`, h `Spike_Shield`, h `1H_Sword_Offhand` | **V** `Knight_Helmet` | **V** `Knight_Cape` |
| Barbarian | **V** `2H_Axe`, h `1H_Axe`, h `Mug` | h `1H_Axe_Offhand`, h `Barbarian_Round_Shield` | **V** `Barbarian_Hat` | **V** `Barbarian_Cape` |
| Mage | **V** `2H_Staff`, h `1H_Wand` | h `Spellbook`, h `Spellbook_open` | **V** `Mage_Hat` | **V** `Mage_Cape` |
| Rogue | **V** `Knife`, h `1H_Crossbow`, h `2H_Crossbow`, h `Throwable` | **V** `Knife_Offhand` | (none) | **V** `Rogue_Cape` |
| Rogue_Hooded | h `Knife`, **V** `2H_Crossbow`, h `1H_Crossbow`, h `Throwable` | h `Knife_Offhand` | (hood built into `Rogue_Head_Hooded`) | **V** `Rogue_Cape` |

Alternative loadouts:
* Knight with 2 hands: `2H_Sword` only.
* Knight dual-wield: `1H_Sword` + `1H_Sword_Offhand`.
* Barbarian dual axes: `1H_Axe` + `1H_Axe_Offhand`.
* Barbarian tank: `1H_Axe` + `Barbarian_Round_Shield`.
* Mage healer or support: `1H_Wand` + `Spellbook_open`.
* Rogue: show `Throwable` (a smoke bomb) only during `Throw`.

**Attaching separate weapon meshes** from `/assets/models/weapons/` (for item drops, transmog or upgraded +N glow): parent the gltf scene to the bone and copy the local transform the embedded version uses.

| Slot / item | position | quaternion (x,y,z,w) |
|---|---|---|
| `handslot.r` swords, axes, mug-less 1H | (0, 0.0333, 0) | (0, -1, 0, 0), i.e. `rotation.y = π` |
| `handslot.r` staff, wand, knife | (0, 0, 0) | (0, -1, 0, 0) |
| `handslot.r` crossbows | (-0.105, -0.01, 0) | (0, 0.7071, 0, 0.7071), i.e. `rotation.y = +π/2` |
| `handslot.r` Throwable / smokebomb | (0, 0.18, 0) | (0, -1, 0, 0) |
| `handslot.r` Mug | (0.301, -0.016, 0) | (0, -1, 0, 0) |
| `handslot.l` shields | (0, 0.017, 0.156) | identity |
| `handslot.l` offhand sword / axe | (0, 0.017 / 0.033, 0) | identity |
| `handslot.l` spellbook closed / open | (0, 0.266 / 0.145, 0) | (0, -0.7071, -0.7071, 0) |
| `head` helmets / hats | (0, -0.026, 0) (Mage hat: (0, 0.543, 0), rotated −15° about X) | identity |

### 1.2 Weapon and prop meshes (`/assets/models/weapons/`)

Each `.gltf` comes with its own `.bin`, and textures are shared PNGs in the same folder. Native size is X×Y×Z with the grip at the origin and the blade along +Y.

| File | Texture | Size | Use |
|---|---|---|---|
| `sword_1handed.gltf` | knight_texture.png | 0.50×1.78×0.13 | 1H sword |
| `sword_2handed.gltf`, `sword_2handed_color.gltf` | knight_texture.png | 0.84×2.37×0.25 | 2H sword (+ team-colour variant) |
| `axe_1handed.gltf` | barbarian_texture.png | 0.71×1.24×0.19 | 1H axe |
| `axe_2handed.gltf` | barbarian_texture.png | 1.24×1.73×0.26 | 2H axe |
| `dagger.gltf` | rogue_texture.png | 0.26×1.21×0.15 | dagger |
| `crossbow_1handed.gltf`, `crossbow_2handed.gltf` | rogue_texture.png | 0.91×0.41×1.22 / 1.22×0.48×1.44 | crossbows |
| `arrow.gltf`, `arrow_bundle.gltf`, `quiver.gltf` | rogue_texture.png | 0.75 long | projectiles, ammo |
| `smokebomb.gltf` | rogue_texture.png | 0.38 | thrown skill / projectile |
| `staff.gltf` | mage_texture.png | 0.58×2.16×0.29 | staff |
| `wand.gltf` | mage_texture.png | 0.16×0.97×0.16 | wand |
| `spellbook_closed.gltf`, `spellbook_open.gltf` | mage_texture.png | 0.29×0.58×0.43 / 0.83×0.57×0.22 | offhand book |
| `shield_round*.gltf`, `shield_square*.gltf`, `shield_badge*.gltf`, `shield_spikes*.gltf` | knight_ or barbarian_texture.png | about 0.9×1.0 | shields (`*_color` = tintable variants) |
| `mug_empty.gltf`, `mug_full.gltf` | barbarian_texture.png | 0.53×0.55 | tavern props, potion stand-in |
| `skeleton/Skeleton_Blade.gltf` | skeleton_texture.png | 0.57×1.50×0.22 | skeleton sword |
| `skeleton/Skeleton_Axe.gltf` | skeleton_texture.png | 0.99×1.25×0.28 | skeleton axe |
| `skeleton/Skeleton_Staff.gltf` | skeleton_texture.png | 0.60×2.10×0.75 | skeleton mage staff |
| `skeleton/Skeleton_Crossbow.gltf`, `Skeleton_Quiver.gltf` | skeleton_texture.png | 1.11×0.51×1.42 | skeleton archer |
| `skeleton/Skeleton_Shield_Large_A/B.gltf`, `Skeleton_Shield_Small_A/B.gltf` | skeleton_texture.png | 0.88×1.14 / 0.83×0.83 | skeleton shields |
| `skeleton/Skeleton_Arrow*.gltf` (4 variants: whole, half, broken, broken_half) | skeleton_texture.png | 0.75 long | arrows, stuck-arrow decals |

### 1.3 KayKit clip list (all 5 adventurers; durations in seconds)

`1H_Melee_Attack_Chop` 1.067, `1H_Melee_Attack_Slice_Diagonal` 1.0, `1H_Melee_Attack_Slice_Horizontal` 1.067, `1H_Melee_Attack_Stab` 1.6, `1H_Ranged_Aiming` 1.067, `1H_Ranged_Reload` 1.167, `1H_Ranged_Shoot` 1.067, `1H_Ranged_Shooting` 1.6, `2H_Melee_Attack_Chop` 1.633, `2H_Melee_Attack_Slice` 1.1, `2H_Melee_Attack_Spin` 2.4, `2H_Melee_Attack_Spinning` 0.667, `2H_Melee_Attack_Stab` 1.6, `2H_Melee_Idle` 1.067, `2H_Ranged_Aiming` 1.6, `2H_Ranged_Reload` 1.6, `2H_Ranged_Shoot` 1.067, `2H_Ranged_Shooting` 1.067, `Block` 1.067, `Block_Attack` 1.067, `Block_Hit` 1.067, `Blocking` 1.067, `Cheer` 1.667, `Death_A` 0.8, `Death_A_Pose` 0, `Death_B` 2.633, `Death_B_Pose` 0, `Dodge_Backward` 0.4, `Dodge_Forward` 0.4, `Dodge_Left` 0.4, `Dodge_Right` 0.4, `Dualwield_Melee_Attack_Chop` 1.267, `Dualwield_Melee_Attack_Slice` 1.167, `Dualwield_Melee_Attack_Stab` 1.6, `Hit_A` 0.667, `Hit_B` 0.867, `Idle` 1.067, `Interact` 1.3, `Jump_Full_Long` 2.333, `Jump_Full_Short` 1.167, `Jump_Idle` 1.067, `Jump_Land` 0.667, `Jump_Start` 0.6, `Lie_Down` 3.0, `Lie_Idle` 2.667, `Lie_Pose` 0, `Lie_StandUp` 2.333, `PickUp` 1.3, `Running_A` 0.8, `Running_B` 1.067, `Running_Strafe_Left` 0.8, `Running_Strafe_Right` 0.8, `Sit_Chair_Down` 0.8, `Sit_Chair_Idle` 3.6, `Sit_Chair_Pose` 0, `Sit_Chair_StandUp` 0.8, `Sit_Floor_Down` 1.0, `Sit_Floor_Idle` 4.0, `Sit_Floor_Pose` 0, `Sit_Floor_StandUp` 1.133, `Spellcast_Long` 2.533, `Spellcast_Raise` 2.1, `Spellcast_Shoot` 0.933, `Spellcasting` 0.667, `T-Pose` 0, `Throw` 1.367, `Unarmed_Idle` 1.067, `Unarmed_Melee_Attack_Kick` 0.933, `Unarmed_Melee_Attack_Punch_A` 1.467, `Unarmed_Melee_Attack_Punch_B` 1.667, `Unarmed_Pose` 0, `Use_Item` 1.6, `Walking_A` 1.067, `Walking_B` 1.067, `Walking_Backwards` 1.067, `Walking_C` 1.6.

All clips are in place (no root motion), so the movement code drives position. `*_Pose` clips are single-frame poses.

---

## 2. Skeleton enemies: KayKit Skeletons (`/assets/models/enemies/`)

| URL | Body height | Height incl. headgear | Tris | Size | Meshes (all visible by default; none are weapons) |
|---|---|---|---|---|---|
| `/assets/models/enemies/Skeleton_Minion.glb` | 2.15 | 2.15 | 5288 | 4.7 MB | `Skeleton_Minion_{ArmLeft,ArmRight,Body,Cloak,Eyes,Head,Jaw,LegLeft,LegRight}` |
| `/assets/models/enemies/Skeleton_Warrior.glb` | 2.15 | 2.58 (helmet) | 5934 | 4.8 MB | `…_Helmet`@head (rigid), `…_Cloak`, `…_Eyes`, `…_Jaw` + body |
| `/assets/models/enemies/Skeleton_Rogue.glb` | 2.15 | 2.30 (hood) | 5278 | 4.7 MB | `…_Hood`@head, `…_Cape`@chest (rigid) + body |
| `/assets/models/enemies/Skeleton_Mage.glb` | 2.15 | 2.62 (hat) | 4588 | 4.6 MB | `…_Hat`@head (rigid), `…_Skull`, `…_Eyes`, `…_Jaw` + body |

All four face +Z and use the same rig as the players (`handslot.l` / `handslot.r` exist). Materials: `skeleton` (embedded `skeleton_texture` PNG) and `Glow` on the `*_Eyes` mesh (already emissive yellow, `emissiveFactor [1,1,0.19]`; add bloom or keep it unlit). Licence: CC0, Kay Lousberg.

**Weapons are not embedded.** Attach them from `/assets/models/weapons/skeleton/` with the same offsets as section 1.1 (blade or axe at `handslot.r` (0, 0.033, 0) with `rotation.y = π`; shield at `handslot.l` (0, 0.017, 0.156)). These offsets are a starting point, so check them in game.

Skeletons have **95 clips**: the 76 from 1.3 plus these 19:
`1H_Melee_Attack_Jump_Chop` 1.333, `Death_C_Pose` 0, `Death_C_Skeletons` 2.0 (collapses into a bone pile), `Death_C_Skeletons_Resurrect` 2.7 (pile reassembles), `Idle_B` 2.133, `Idle_Combat` 4.267, `Running_C` 0.8, `Skeleton_Inactive_Standing_Pose` 0, `Skeletons_Awaken_Floor` 2.3, `Skeletons_Awaken_Floor_Long` 3.833, `Skeletons_Awaken_Standing` 1.0, `Skeletons_Inactive_Floor_Pose` 0, `Spawn_Air` 1.3, `Spawn_Ground` 1.3, `Spawn_Ground_Skeletons` 3.567, `Spellcast_Summon` 4.3, `Taunt` 1.033, `Taunt_Longer` 3.0, `Walking_D_Skeletons` 1.6.

---

## 3. Monsters: Quaternius (`/assets/models/monsters/`)

All are CC0 (Quaternius, via Poly Pizza), face +Z, carry their own embedded data and use no glTF extensions.

### 3.1 Sizes and suggested scale

Measured at frame 0 of the idle (or Flying_Idle) clip, in native units. *Suggested scale* gives the target size in metres when 1 unit = 1 m and the player is about 1.8 m. *Radius* is a rough collision radius after scaling.

| Model (URL) | Role idea (Turkish display name) | Native size X×Y×Z | min Y (hover) | Target | Suggested scale | Radius (m) | Tris | Size |
|---|---|---|---|---|---|---|---|---|
| `/assets/models/monsters/Slime.glb` | trash swarm (Zehirli Balçık) | 1.98×1.66×1.38 | 0 | 0.9 m tall | 0.54 | 0.37 | 1968 | 156 KB |
| `/assets/models/monsters/Skull.glb` | trash, hopping or floating skull (Uçan Kafatası) | 1.41×1.50×1.42 | 0 | 0.8 m | 0.53 | 0.37 | 1804 | 119 KB |
| `/assets/models/monsters/Mushnub.glb` | swarm add for Mushroom_King (Mantarcık) | 2.75×3.31×2.75 | 0 | 0.9 m | 0.27 | 0.37 | 1248 | 66 KB |
| `/assets/models/monsters/Rat.glb` | swarm trash (Lağım Faresi) | 1.51×2.29×6.91 (long tail) | 0 | 1.6 m long | 0.23 | 0.2 | 4004 | 538 KB |
| `/assets/models/monsters/Spider.glb` | trash or elite (Mağara Örümceği) | 5.94×1.93×5.02 (legs) | 0 | 0.9 m tall | 0.47 | 0.8 | 2712 | 438 KB |
| `/assets/models/monsters/Bat.glb` | flying swarm (Kan Yarasası) | 2.73×4.08×4.31 (wings up at f0; rest span 4.7) | 0.43 | 1.6 m span | 0.35 | 0.45 | 1046 | 226 KB |
| `/assets/models/monsters/Goblin.glb` | trash melee (Goblin) | 2.13×2.95×1.19 | 0 | 1.3 m | 0.44 | 0.26 | 2912 | 210 KB |
| `/assets/models/monsters/Zombie.glb` | trash melee (Zombi) | 1.64×2.73×1.00 | 0 | 1.8 m | 0.66 | 0.33 | 3550 | 233 KB |
| `/assets/models/monsters/Ghost.glb` | flying caster or phaser (Hortlak) | 2.95×3.06×1.89 | 0.28 | 1.8 m | 0.59 | 0.56 | 3192 | 199 KB |
| `/assets/models/monsters/Imp.glb` | flying ranged caster (İblisçik) | 4.38×2.19×2.67 (wingspan) | 0.62 | 1.1 m | 0.50 | 0.67 | 4784 | 314 KB |
| `/assets/models/monsters/Demon.glb` | elite melee (İblis) | 2.75×2.69×1.10 | 0 | 2.2 m | 0.82 | 0.45 | 3292 | 216 KB |
| `/assets/models/monsters/Orc.glb` | elite with weapon (Ork Savaşçısı) | 3.27×3.05×1.68 | 0 | 2.4 m | 0.79 | 0.66 | 7344 | 501 KB |
| `/assets/models/monsters/Yeti.glb` | elite brute or mini-boss (Buz Yetisi) | 3.06×3.11×2.06 | 0 | 2.8 m | 0.90 | 0.93 | 3070 | 210 KB |
| `/assets/models/monsters/Giant.glb` | boss or elite (Mağara Devi) | 2.95×3.88×2.03 | 0 | 4.5 m | 1.16 | 1.18 | 3812 | 240 KB |
| `/assets/models/monsters/Mushroom_King.glb` | boss (Mantar Kral) | 3.36×3.42×2.05 | 0 | 3.5 m | 1.02 | 1.05 | 6044 | 434 KB |
| `/assets/models/monsters/Blue_Demon.glb` | boss (Mavi İblis) | 3.15×2.65×1.88 | 0 | 4.0 m | 1.51 | 1.42 | 5800 | 429 KB |
| `/assets/models/monsters/Demon_Lord.glb` | final boss with trident (İblis Lordu) | 3.64×2.93×1.99 | 0 | 4.5 m | 1.54 | 1.53 | 6712 | 474 KB |
| `/assets/models/monsters/Dragon_Evolved.glb` | flying boss (Kadim Ejder) | 4.38×2.83×2.67 (wingspan) | 0.30 | 8 m span | 1.82 | 2.4 | 7438 | 426 KB |

### 3.2 Meshes, materials and full clip lists

The "prefix" is the armature prefix on each clip name. Look clips up by suffix.

**EnemyArmature family: Goblin, Zombie, Demon, Yeti, Giant.** Prefix `EnemyArmature|EnemyArmature|EnemyArmature|`. Each has one skinned mesh (`Goblin`, `Cube.000` (Zombie), `Demon`, `Yeti`, `Giant`) with material `Atlas` (`Atlas.001` on Giant) and an embedded 32×32 `Atlas.png`.
* Goblin, Zombie, Demon: `Attack` 0.5, `Death` 0.625, `HitRecieve` 0.208, `Idle` 3.333, `Jump` 0.25, `Run` 0.667, `Walk` 2.0
* Yeti, Giant: `Attack` 0.667, `Death` 0.833, `HitRecieve` 0.208, `Idle` 3.333, `Jump` 0.25, `Run` 0.667, `Walk` 2.0

**CharacterArmature humanoid bosses: Orc, Blue_Demon, Demon_Lord, Mushroom_King.** Prefix `CharacterArmature|`.
* Orc: `Death` 0.75, `Duck` 1.667, `HitReact` 0.583, `Idle` 1.0, `Jump` 0.333, `Jump_Idle` 0.5, `Jump_Land` 0.333, `No` 1.667, `Punch` 0.833, `Run` 0.542, `Walk` 1.0, `Wave` 1.667, `Weapon` 0.833, `Yes` 1.667.
* Demon_Lord and Mushroom_King: the same 14 clips.
* Blue_Demon: the same 14 plus `Run2` 0.542.
* Meshes, all skinned. The weapon meshes are bound to the **left** hand (`Middle1.L`) and are visible by default. Hide one to get an unarmed variant.
  * Orc: `Orc` + weapon `Orc_Weapon` (materials `Wood, Metal`). Body materials `Orc_Main, Orc_Mouth, Orc_Secondary, Belt, Tongue, Eye_White, Gold, Orc_Hair, Eye_Black`.
  * Demon_Lord: `Demon` + weapon `Trident` (material `Black`). Materials `Demon_Main, Black, Eye_White, Eye_Black`.
  * Mushroom_King: `MushroomKing` + held `Mushroom` (a sceptre). Materials `MushroomKing_Main, Orc_Main, MushroomKing_Secondary, Eye_White, Eye_Black`.
  * Blue_Demon: a single mesh `BlueDemon`. Its `Wood` and `Straps` parts are baked in and cannot be hidden. Materials `BlueDemon_Main, BlueDemon_Secondary, Wood, Straps, Eye_White, Eye_Black`.
* All flat colours, no texture.

**Flying family: Imp, Ghost, Dragon_Evolved.** Prefix `CharacterArmature|`.
* Imp and Ghost: `Death` 0.667, `Fast_Flying` 0.833, `Flying_Idle` 1.167, `Headbutt` 1.167, `HitReact` 0.458, `No` 1.167, `Punch` 1.167, `Yes` 1.167.
* Dragon_Evolved: the same clips, but `Flying_Idle` 1.5, `Headbutt` 1.5, `HitReact` 0.667, `Punch` 1.333.
* Meshes:
  * Imp: `Demon_Flying` (body), `Demon_Flying.001` (head), `Demon_Flying.002` (wings). Materials `Black, Eye_White, Eye_Black, Demon_Main`.
  * Ghost: `Ghost`. Materials `Eye_White, Eye_Black, Ghost_Main`; make it semi-transparent for the PSX ghost look.
  * Dragon_Evolved: `Dragon`. Materials `Dragon_Main, Dragon_Secondary, Dragon_Horn, Eye_White, Eye_Black`.

**MonsterArmature blobs: Slime, Skull.** Prefix `MonsterArmature|`. Clips: `Bite_Front` 0.5, `Bite_InPlace` 0.667, `Dance` 0.833, `Death` 0.458, `HitRecieve` 0.375, `Idle` 2.5, `Jump` 0.542, `No` 0.5, `Walk` 0.542, `Yes` 0.5.
* Slime meshes: `Enemy_Body`, `Enemy_Face`, `Enemy_Eyes`. Materials `Eyes, Main, Main_Dark, Horns, Teeth, Tongue`. Tint `Main` and `Main_Dark` for poison, fire or frost variants.
* Skull mesh: `Skull`. Materials `Main, Main_Light`.

**Small blob: Mushnub.** Prefix `CharacterArmature|`. Clips: `Bite_Front` 0.375, `Dance` 0.667, `Death` 0.333, `HitRecieve` 0.292, `Idle` 2.0, `Jump` 0.417, `No` 1.0, `Walk` 0.417, `Yes` 0.958. Mesh `Mushnub_Blob`. Materials `MushroomKing_Secondary, MushroomKing_Main, Eye_White, Eye_Black`, which match the Mushroom King's palette.

**Animals: Bat, Spider, Rat.**
* Bat, prefix `BatArmature|`: `Bat_Attack` 0.875, `Bat_Attack2` 1.25, `Bat_Death` 1.208, `Bat_Flying` 1.25, `Bat_Hit` 1.25. Meshes `Bat`, `Eyes`. Materials `Eyes, Main, Main, Belly, Black, Nose`.
* Spider, prefix `SpiderArmature|`: `Spider_Attack` 0.75, `Spider_Death` 1.042, `Spider_Idle` 4.167, `Spider_Jump` 0.708, `Spider_Walk` 0.833. **No hit clip.** Mesh `Cube`. Materials `Material, Material.001`.
* Rat, prefix `RatArmature|`: `Rat_Attack` 0.667, `Rat_Death` 1.083, `Rat_Idle` 2.375, `Rat_Jump` 0.833, `Rat_Run` 0.5, `Rat_Walk` 1.333. **No hit clip.** Mesh `Rat`. Materials `Grey, Pink`.

---

## 4. NPCs

**Use the KayKit adventurers as NPCs**, because they match the player art style. Combine prop visibility, a material tint (`material.color.multiplyScalar` or a cloned material with a hue shift) and an idle loop:

| NPC (Turkish label) | Model + visible meshes | Idle loop / interaction clip |
|---|---|---|
| Demirci (blacksmith: +0..+15 upgrades) | Barbarian: `1H_Axe` (stands in for a hammer), no cape | `Idle` loop; play `1H_Melee_Attack_Chop` on the anvil every 2–4 s, `Cheer` on +N success, `Hit_B` / shake on failure |
| Efsuncu (enchanter: bonus reroll) | Mage: `Spellbook_open` + `1H_Wand`, `Mage_Hat` | `Spellcasting` loop while rerolling, `Spellcast_Raise` on a legendary roll |
| Tüccar (merchant) | Rogue_Hooded, no weapons | `Idle`, `Interact` when the shop opens |
| Taş Ustası (keystone / Mythic+ vendor) | Knight: no helmet, `Badge_Shield` only | `Idle`, `Use_Item` when handing over a key |
| Meyhaneci (tavern keeper) | Barbarian: `Mug` | `Sit_Chair_Idle` / `Idle`, `Use_Item` (drink) |
| Muhafız (guard) | Knight: `2H_Sword` or `1H_Sword` + `Rectangle_Shield` | `2H_Melee_Idle` / `Blocking` |
| Idle villagers | any KayKit model, unarmed | `Sit_Floor_Idle`, `Sit_Chair_Idle`, `Lie_Idle`, `Cheer` |

Quaternius NPCs (`/assets/models/npcs/`) are **real-scale (≈1.85 m) and more realistically proportioned**, which is a style mismatch with the chibi KayKit models. Use them only for special or background roles. Both are CC0 and face +Z. Clip prefix is `CharacterArmature|`.

| URL | Height | Tris | Size | Meshes / materials |
|---|---|---|---|---|
| `/assets/models/npcs/King.glb` | 1.87 m | 11100 | 1.9 MB | `King_Feet, King_Legs, King_Body, King_Head`; materials `Metal, DarkBrown, Metal_Dark, Blue, Beige, Skin, Hair_White, Eye, Gold` |
| `/assets/models/npcs/Worker.glb` | 1.83 m | 5240 | 1.3 MB | `Worker_Feet, Worker_Legs, Worker_Body, Worker_Head`; materials `Black, Grey, Brown2, Brown, Worker_Yellow, Worker_Vest, LightBrown, Skin, Eyebrows, Eye, Moustache` |

Both have the same 24 clips: `Death` 1.042, `Gun_Shoot` 0.583, `HitRecieve` 0.542, `HitRecieve_2` 0.542, `Idle` 1.667, `Idle_Gun` 1.667, `Idle_Gun_Pointing` 1.667, `Idle_Gun_Shoot` 0.667, `Idle_Neutral` 1.667, `Idle_Sword` 1.667, `Interact` 1.25, `Kick_Left` 0.917, `Kick_Right` 0.917, `Punch_Left` 0.833, `Punch_Right` 0.833, `Roll` 1.333, `Run` 0.792, `Run_Back` 0.833, `Run_Left` 0.792, `Run_Right` 0.792, `Run_Shoot` 0.833, `Sword_Slash` 1.0, `Walk` 1.333, `Wave` 1.667.
* NPC use: `Idle_Neutral` / `Idle` loop, `Wave` to greet, `Interact` to talk.
* The King works as the town lord or the person who hands out the weekly vault.
* The Worker can be a blacksmith's apprentice (`Interact` loop at the forge).

---

## 5. Recommended animation mapping

**Impact times.** These are estimates in seconds from clip start at timeScale 1. I took them from the peak hand-bone speed or forward extension, and for monsters from the peak forward lunge. Use them for damage, hit-stop and screen shake, scale them by `1/timeScale` when you speed attacks up, and fine-tune by eye.

### 5.1 Player locomotion (all KayKit classes)

| State | Clip(s) | Notes |
|---|---|---|
| idle (in combat, 1H/caster) | `Idle` | 2H loadouts (2H sword, 2H axe, staff if you prefer) use `2H_Melee_Idle` |
| idle (town / unarmed) | `Unarmed_Idle` | AFK after about 20 s: `Sit_Floor_Down` → `Sit_Floor_Idle` |
| walk | `Walking_A` | `Walking_B` for town, `Walking_C` (1.6 s) for slowed, chilled or "low HP limp" |
| run | `Running_A` (0.8 s, combat-ready arms) | `Running_B` (relaxed) for town. Scale timeScale with move speed (base about 5 m/s at KayKit scale 0.75) |
| strafe left / right | `Running_Strafe_Left` / `Running_Strafe_Right` | shift-lock and WoW-style strafing. For diagonals, cross-fade-blend run + strafe at weight 0.5/0.5 |
| backpedal | `Walking_Backwards` | WoW-like: move at about 60% speed with timeScale about 1.3. Back-diagonals blend with strafe |
| dodge / roll (8-dir) | `Dodge_Forward` / `Dodge_Backward` / `Dodge_Left` / `Dodge_Right` (0.4 s each) | pick by input direction relative to facing; i-frames ≈ 0.05–0.35 s |
| jump | `Jump_Start` (0.6) → `Jump_Idle` (loop while airborne) → `Jump_Land` (0.667) | cut `Jump_Land` after about 0.25 s if the player is moving |
| hit react | `Hit_A` (light), `Hit_B` (heavy or crit) | play on top with a low weight, or only when not attacking (avoids animation-cancel jank). While blocking: `Block_Hit` |
| death | `Death_A` (0.8, fast) / `Death_B` (2.633, dramatic) | then clamp with `clampWhenFinished = true`, or hold `Death_A_Pose` / `Death_B_Pose` |
| downed (co-op revive) | `Lie_Down` → `Lie_Idle` | revive with `Lie_StandUp` (2.333; play at 2× for snappiness) |
| loot pickup / potion / interact | `PickUp` / `Use_Item` / `Interact` | `Use_Item` at 2× for potions |
| level up, key timed, boss kill | `Cheer` | |

### 5.2 Player attacks and skills per class

| Class (suggested TR name) | Loadout | Basic attack chain (impact time) | Skills / other |
|---|---|---|---|
| **Knight**: Şövalye (tank) | `1H_Sword` + `Round_Shield` | `1H_Melee_Attack_Slice_Diagonal` (0.38) → `1H_Melee_Attack_Slice_Horizontal` (0.30) → `1H_Melee_Attack_Chop` (0.58, finisher: bigger shake) | Thrust: `1H_Melee_Attack_Stab` (0.70). Shield bash: `Block_Attack` (0.40). Block: `Block` → `Blocking` loop, `Block_Hit`. Taunt / shout: `Cheer` or skeleton `Taunt` (shared rig). Charge or leap: `Jump_Full_Long`. 2H variant: `2H_Melee_Attack_Slice` (0.40) → `2H_Melee_Attack_Chop` (0.72) → `2H_Melee_Attack_Stab` (0.75) |
| **Barbarian**: Barbar (melee DPS) | `2H_Axe` | `2H_Melee_Attack_Slice` (0.40) → `2H_Melee_Attack_Chop` (0.72) | Whirlwind: `2H_Melee_Attack_Spinning` (0.667 loop, hit every 0.33 s) or one-shot `2H_Melee_Attack_Spin` (2.4, hits at about 0.6 / 1.17 / 1.7). Leap slam: `Jump_Full_Short` then `2H_Melee_Attack_Chop`. War cry: `Cheer`. Kick or stomp: `Unarmed_Melee_Attack_Kick` (0.35). Dual-axe variant: `Dualwield_Melee_Attack_Slice` (0.55) → `Dualwield_Melee_Attack_Chop` (0.55 + 0.85, two hits) → `Dualwield_Melee_Attack_Stab` (0.75) |
| **Mage**: Büyücü (caster DPS) | `2H_Staff` | `Spellcast_Shoot` (projectile release about 0.30) | Channel (beam, blizzard): `Spellcasting` loop. Meteor or big nuke: `Spellcast_Long` (release about 1.55). Nova, buff or teleport: `Spellcast_Raise` (about 0.5 lift, 1.0 burst). Staff poke: `2H_Melee_Attack_Stab` (0.75) |
| **Mage, healer variant**: Rahibe / Şifacı (healer, if wanted) | `1H_Wand` + `Spellbook_open` | `Spellcast_Shoot` (heal bolt 0.30) | Group heal: `Spellcast_Raise`. Channel heal: `Spellcasting`. Resurrect an ally: `Spellcast_Long` |
| **Rogue**: Suikastçı (melee DPS) | `Knife` + `Knife_Offhand` | `Dualwield_Melee_Attack_Slice` (0.55) → `Dualwield_Melee_Attack_Stab` (0.75) → `Dualwield_Melee_Attack_Chop` (0.55 + 0.85) | Quick stab: `1H_Melee_Attack_Stab` at 1.5×. Smoke bomb or dagger throw: `Throw` (show `Throwable` at 0.2 s, spawn the `smokebomb.gltf` projectile at about 0.75). Dash or shadowstep: `Dodge_Forward` at 1.5×. Vanish: `Spellcast_Raise` at 2× |
| **Rogue_Hooded**: Avcı (ranged DPS) | `2H_Crossbow` | aim `2H_Ranged_Aiming` (upper-body loop) → `2H_Ranged_Shoot` (bolt leaves at about 0.15) | Rapid fire: `2H_Ranged_Shooting` loop. Reload: `2H_Ranged_Reload`. 1H crossbow + knife variant: `1H_Ranged_Aiming` / `1H_Ranged_Shoot` (0.12) / `1H_Ranged_Shooting` / `1H_Ranged_Reload`. Trap or grenade: `Throw` |

Attack speed: set `action.timeScale = attacksPerSecond * clip.duration` and cap it around 2.5×. For ARPG snappiness, allow canceling into a dodge once the impact frame has passed.

### 5.3 Enemy mapping

| Enemy | idle | move (walk / run) | attack (impact) | hit | death | spawn / special |
|---|---|---|---|---|---|---|
| **Skeleton_Minion** (İskelet Er), trash, `Skeleton_Blade` or `Skeleton_Axe` | `Idle` / `Idle_B` | `Walking_D_Skeletons` (shamble) / `Running_C` | `1H_Melee_Attack_Chop` (0.58), `1H_Melee_Attack_Slice_Diagonal` (0.38), leap `1H_Melee_Attack_Jump_Chop` | `Hit_A` | `Death_C_Skeletons` (bone pile, which suits PSX) | rise from the ground: `Spawn_Ground_Skeletons` (3.57; play at 2× in hordes); dormant ambush: `Skeletons_Inactive_Floor_Pose` → `Skeletons_Awaken_Floor`; necro revive: `Death_C_Skeletons_Resurrect` |
| **Skeleton_Warrior** (İskelet Savaşçı), elite, blade + `Skeleton_Shield_Large_A` | `Idle_Combat` | `Walking_A` / `Running_A` | `1H_Melee_Attack_Slice_Horizontal` (0.30), `Block_Attack` (0.40); 2H axe variant: `2H_Melee_Attack_Spin` | `Block_Hit` when facing the attacker, else `Hit_B` | `Death_C_Skeletons` | `Blocking` stance (frontal damage reduction), `Taunt` |
| **Skeleton_Rogue** (İskelet Okçu), ranged, `Skeleton_Crossbow` | `Idle` | `Walking_A` / `Running_A`, kite with `Walking_Backwards` | `2H_Ranged_Aiming` → `2H_Ranged_Shoot` (0.15) → `2H_Ranged_Reload` | `Hit_A` | `Death_C_Skeletons` | dual-blade variant: `Dualwield_Melee_Attack_*` |
| **Skeleton_Mage** (İskelet Büyücü), caster, `Skeleton_Staff` | `Idle_B` | `Walking_B` | `Spellcast_Shoot` (0.30) | `Hit_A` | `Death_C_Skeletons` | summon minions: `Spellcast_Summon` (4.3); AoE: `Spellcast_Long`; `Spawn_Air` for teleport-in |
| **Slime** | `Idle` | `Walk` or hop with `Jump` | `Bite_Front` (0.30), `Bite_InPlace` (0.17) | `HitRecieve` | `Death` (+ split into 2 small slimes for juice) | enrage: `Dance` |
| **Skull** | `Idle` (offset Y +0.6 m to float) | `Walk` | `Bite_Front` (0.30) | `HitRecieve` | `Death` | explode-on-death affix |
| **Mushnub** | `Idle` | `Walk` / `Jump` | `Bite_Front` (0.24) | `HitRecieve` | `Death` | spawned by Mushroom_King: `Jump` in |
| **Rat** | `Rat_Idle` | `Rat_Walk` / `Rat_Run` | `Rat_Attack` (0.43), pounce `Rat_Jump` | none: use flash, knockback and squash-stretch | `Rat_Death` | |
| **Spider** | `Spider_Idle` | `Spider_Walk` (raise timeScale for skittering) | `Spider_Attack` (0.42), pounce `Spider_Jump` | none: flash and knockback | `Spider_Death` | web-shot: `Spider_Attack` + projectile |
| **Bat** | `Bat_Flying` | `Bat_Flying` (timeScale 1.5) | `Bat_Attack` (0.30), dive `Bat_Attack2` (0.33) | `Bat_Hit` | `Bat_Death` | swarm in groups of 5–10 |
| **Goblin / Zombie / Demon** | `Idle` | `Walk` (2.0 s, slow; good for zombies) / `Run` | `Attack` (0.37 of 0.5) | `HitRecieve` (0.2, very snappy) | `Death` | `Jump` for leap-in |
| **Yeti / Giant** | `Idle` | `Walk` / `Run` | `Attack` (Yeti 0.50, Giant 0.47) | `HitRecieve` | `Death` | slam: `Jump` (0.25) + land shockwave |
| **Ghost** | `Flying_Idle` | `Flying_Idle` (slow) / `Fast_Flying` | `Headbutt` (0.30), cast `Punch` (0.33) | `HitReact` | `Death` (fade alpha) | phase-through-walls affix; `Yes`/`No` taunts |
| **Imp** | `Flying_Idle` | `Fast_Flying` | ranged fireball `Punch` (0.33), melee `Headbutt` (0.30) | `HitReact` | `Death` | |
| **Orc** (elite) | `Idle` | `Walk` / `Run` | `Weapon` weapon swing (≈0.45), `Punch` (≈0.45) | `HitReact` | `Death` | war-cry buff: `Wave`; charge: `Run` at 1.5× |

### 5.4 Boss mapping

| Boss | Phase / ability → clip |
|---|---|
| **Mushroom_King** (Mantar Kral) | intro `Wave` → `Idle`. Sceptre smash `Weapon` (≈0.45). Spore cloud `Punch`. Summon Mushnubs `Wave`. Jump slam `Jump` → `Jump_Idle` → `Jump_Land` (shockwave on land). Stagger `HitReact`. Shield phase `Duck`. Death `Death` |
| **Blue_Demon** (Mavi İblis) | heavy swing `Weapon` (≈0.45). Combo `Punch`. Charge `Run2`. Leap `Jump` / `Jump_Idle` / `Jump_Land`. Enrage roar `No` / `Yes` at 0.7× speed. Death `Death` |
| **Demon_Lord** (İblis Lordu) | trident thrust `Weapon` (≈0.45). Fire nova `Punch` + VFX. Summon imps `Wave`. Teleport `Duck` (vanish at the bottom). Leap `Jump*`. Phase-2 enrage: hide `Trident` and use `Punch` combos |
| **Giant** (Mağara Devi) | stomp `Attack` (0.47; big shake and hit-stop). Leap `Jump`. Slow `Walk` (2.0 s; good for a lumbering boss). Death `Death` |
| **Yeti** (mini-boss) | `Attack` (0.50). Charge `Run`. Ice slam `Jump` |
| **Dragon_Evolved** (Kadim Ejder) | hover `Flying_Idle`. Strafe-fly `Fast_Flying`. Bite or dive `Headbutt` (0.30). Fire breath `Punch` (0.37) held open (pause the mixer at the impact frame while breathing). Stagger `HitReact`. Death `Death`. Roar `No` |

Mythic+ affix hooks: "Bolstering" (scale up nearby enemies on death), "Sanguine" (pool on death) and "Bursting" all trigger on `Death`. "Raging": switch to `Run` at 1.3× and redden the material tint.

---

## 6. Minimal loading sketch (TypeScript)

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
const clip = (clips: THREE.AnimationClip[], n: string) => clips.find(c => c.name === n || c.name.endsWith('|' + n));
const gltf = await new GLTFLoader().loadAsync('/assets/models/characters/Knight.glb');
const model = SkeletonUtils.clone(gltf.scene) as THREE.Object3D;
const HIDE = ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'];
model.traverse(o => { if (HIDE.includes(o.name)) o.visible = false; if ((o as THREE.Mesh).isMesh) o.frustumCulled = false; });
model.scale.setScalar(0.75);                       // KayKit -> ~1.8 m
const mixer = new THREE.AnimationMixer(model);
mixer.clipAction(clip(gltf.animations, 'Idle')!).play();
// any KayKit clip works on any KayKit model (same rig): e.g. skeleton 'Taunt' on the Knight.
```
